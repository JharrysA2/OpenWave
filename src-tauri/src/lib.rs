use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

/// Estado del backend y del cierre de la app.
///
/// `cerrando` evita que el vigilante interprete como caída el apagado normal
/// y que el evento de salida se procese dos veces. `data_dir` se rellena en
/// `setup`, cuando ya se conoce el directorio de datos real.
struct BackendState {
    child: Mutex<Option<std::process::Child>>,
    cerrando: AtomicBool,
    /// El candado de instancia única se suelta en cuanto el usuario pide
    /// cerrar, no al terminar el backend: así una reapertura inmediata
    /// arranca en vez de enfocar una ventana que ya no existe.
    instancia_liberada: AtomicBool,
    data_dir: Mutex<Option<PathBuf>>,
}

impl BackendState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            cerrando: AtomicBool::new(false),
            instancia_liberada: AtomicBool::new(false),
            data_dir: Mutex::new(None),
        }
    }

    fn data_dir(&self) -> Option<PathBuf> {
        self.data_dir.lock().ok().and_then(|guard| guard.clone())
    }
}

const BACKEND_ADDR: &str = "127.0.0.1:8765";
/// Plazo para que uvicorn cierre conexiones y salga tras el aviso por stdin.
const CIERRE_ORDENADO: Duration = Duration::from_secs(3);

/// Datos útiles de un /health ajeno (para diagnosticar y cerrar huérfanos).
#[derive(Clone, Debug, Default)]
struct InfoBackend {
    version: Option<String>,
    pid: Option<u32>,
}

/// ¿La cabecera HTTP empieza por 200?
fn cabecera_es_200(cabecera: &[u8]) -> bool {
    std::str::from_utf8(cabecera)
        .ok()
        .and_then(|texto| texto.lines().next())
        .is_some_and(|linea| linea.starts_with("HTTP/1.0 200") || linea.starts_with("HTTP/1.1 200"))
}

/// Cuerpo de la respuesta si ya está completo y es un 200.
///
/// Un /health partido en varios paquetes era el falso negativo clásico: se
/// lee en bucle y solo se da por bueno cuando llega el `Content-Length`
/// completo (o el cierre del objeto JSON si no hay longitud).
fn respuesta_completa(acc: &[u8]) -> Option<&[u8]> {
    let pos = acc.windows(4).position(|ventana| ventana == b"\r\n\r\n")?;
    let cabecera = &acc[..pos];
    if !cabecera_es_200(cabecera) {
        return None;
    }
    let cuerpo = &acc[pos + 4..];
    let largo = std::str::from_utf8(cabecera)
        .ok()?
        .lines()
        .skip(1)
        .filter_map(|linea| linea.split_once(':'))
        .find(|(clave, _)| clave.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, valor)| valor.trim().parse::<usize>().ok());
    match largo {
        Some(n) if cuerpo.len() >= n => Some(&cuerpo[..n]),
        Some(_) => None,
        None if cuerpo.last() == Some(&b'}') => Some(cuerpo),
        None => None,
    }
}

/// GET /health y devuelve el JSON si el puerto responde como OpenWave.
fn leer_health(addr: std::net::SocketAddr) -> Option<serde_json::Value> {
    let Ok(mut stream) = std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500))
    else {
        return None;
    };
    if stream
        .set_read_timeout(Some(Duration::from_millis(400)))
        .is_err()
    {
        return None;
    }
    if stream
        .write_all(b"GET /health HTTP/1.0\r\nHost: 127.0.0.1:8765\r\n\r\n")
        .is_err()
    {
        return None;
    }
    let deadline = std::time::Instant::now() + Duration::from_millis(1500);
    let mut acc: Vec<u8> = Vec::with_capacity(1024);
    let mut buf = [0u8; 1024];
    while std::time::Instant::now() < deadline {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                acc.extend_from_slice(&buf[..n]);
                // Error HTTP explícito: no es nuestro backend sano.
                if let Some(pos) = acc.windows(4).position(|v| v == b"\r\n\r\n") {
                    if !cabecera_es_200(&acc[..pos]) {
                        return None;
                    }
                }
                if respuesta_completa(&acc).is_some() {
                    break;
                }
            }
            Err(ref e)
                if e.kind() == std::io::ErrorKind::TimedOut
                    || e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => return None,
        }
    }
    let cuerpo = respuesta_completa(&acc)?;
    serde_json::from_slice(cuerpo).ok()
}

/// true si `valor` es la respuesta de OpenWave.
fn es_openwave(valor: &serde_json::Value) -> bool {
    valor.get("service").and_then(|v| v.as_str()) == Some("OpenWave")
        && valor.get("status").and_then(|v| v.as_str()) == Some("ok")
}

/// Información del backend que responde en `addr` (si es OpenWave).
fn info_backend(addr: std::net::SocketAddr) -> Option<InfoBackend> {
    let valor = leer_health(addr)?;
    if !es_openwave(&valor) {
        return None;
    }
    Some(InfoBackend {
        version: valor
            .get("version")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        pid: valor
            .get("pid")
            .and_then(|v| v.as_u64())
            .map(|pid| pid as u32),
    })
}

/// true si algo en `addr` responde a GET /health identificándose como
/// OpenWave. Un simple TCP connect no basta: cualquier proceso puede aceptar
/// la conexión y hacernos creer que nuestro backend está sano.
fn health_probe(addr: std::net::SocketAddr) -> bool {
    leer_health(addr).is_some_and(|valor| es_openwave(&valor))
}

/// true si BACKEND_ADDR responde a /health como OpenWave (ver health_probe).
fn backend_responds_as_openwave() -> bool {
    let Ok(addr) = BACKEND_ADDR.parse::<std::net::SocketAddr>() else {
        return false;
    };
    health_probe(addr)
}

/// Información del backend actual, si responde.
fn info_backend_actual() -> Option<InfoBackend> {
    let addr = BACKEND_ADDR.parse::<std::net::SocketAddr>().ok()?;
    info_backend(addr)
}

/// true si algo (cualquiera) está escuchando en BACKEND_ADDR.
fn port_in_use() -> bool {
    let Ok(addr) = BACKEND_ADDR.parse::<std::net::SocketAddr>() else {
        return false;
    };
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Pide a un proceso ajeno de OpenWave que termine (huérfano de una app
/// anterior). En Unix es SIGTERM; en Windows `taskkill /T /F` para incluir
/// los hijos (ffmpeg/yt-dlp).
#[cfg(unix)]
fn terminar_proceso(pid: u32) {
    // SAFETY: kill(2) solo envía una señal; un PID inválido devuelve ESRCH.
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }
}

#[cfg(windows)]
fn terminar_proceso(pid: u32) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = Command::new("taskkill")
        .arg("/PID")
        .arg(pid.to_string())
        .args(["/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

/// Mata el grupo de procesos del backend (Unix). Se usa después de que el
/// hijo salga para que un ffmpeg lanzado por una descarga no quede vivo.
#[cfg(unix)]
fn matar_grupo(pid: u32, senal: i32) {
    // SAFETY: el grupo se creó con process_group(0), así que -pid es su PGID.
    unsafe {
        libc::kill(-(pid as i32), senal);
    }
}

/// Poll the backend health endpoint until it responds or timeout.
fn wait_for_backend(timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if backend_responds_as_openwave() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

/// ¿Se puede escribir realmente dentro de `path`?
///
/// Espejo de `config._dir_escribible` del backend: crea `path` (y sus
/// padres) si falta y se intenta escribir un archivo de prueba dentro — en
/// Program Files `CreateFile` es lo único que decide y `os.access`/`stat`
/// mienten con las ACLs.
fn dir_writable(path: &std::path::Path) -> bool {
    use std::io::Write;
    if std::fs::create_dir_all(path).is_err() {
        // Ni siquiera se puede crear el directorio (ancestro que es un
        // fichero, sin permisos, unidad de solo lectura…).
        return false;
    }
    let probe = path.join(format!(".openwave-write-test-{}", std::process::id()));
    let ok = match std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&probe)
    {
        Ok(mut f) => f.write_all(b"").is_ok(),
        Err(_) => false,
    };
    let _ = std::fs::remove_file(&probe);
    ok
}

/// Escribe una línea en `<datos>/openwave-app.log` y en stderr.
///
/// En Windows release no hay consola: sin este fichero, un fallo de arranque
/// (puerto ocupado, intérprete que no existe, backend que muere) no dejaba
/// ningún rastro. Es el log de la parte Rust, separado de `openwave.log`
/// (backend) y `backend.err.log` (stderr de Python).
fn log_app(data_dir: &Path, mensaje: &str) {
    use std::io::Write;
    let ruta = data_dir.join("openwave-app.log");
    if let Ok(mut fichero) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&ruta)
    {
        let ahora = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(fichero, "[{ahora}] {mensaje}");
    }
    eprintln!("[openwave] {mensaje}");
}

/// Trunca el log de la app al empezar cada ejecución.
fn reiniciar_log_app(data_dir: &Path) {
    let _ = std::fs::create_dir_all(data_dir);
    let _ = std::fs::write(
        data_dir.join("openwave-app.log"),
        format!(
            "OpenWave {} — {}\n",
            env!("CARGO_PKG_VERSION"),
            data_dir.display()
        ),
    );
}

fn log_app_state(state: &BackendState, mensaje: &str) {
    match state.data_dir() {
        Some(dir) => log_app(&dir, mensaje),
        None => eprintln!("[openwave] {mensaje}"),
    }
}

fn log_app_handle(app: &tauri::AppHandle, mensaje: &str) {
    log_app_state(&app.state::<BackendState>(), mensaje);
}

/// `taskkill /T /F` para matar el árbol de un backend que no responde.
#[cfg(windows)]
fn matar_arbol_windows(pid: u32) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = Command::new("taskkill")
        .arg("/PID")
        .arg(pid.to_string())
        .args(["/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

/// Cierra el backend: aviso por stdin, espera y, si no sale, fuerza.
///
/// Escribir en stdin y soltar el handle (EOF) es el protocolo normal; el
/// backend lo traduce en `server.should_exit` y uvicorn cierra el socket con
/// `timeout_graceful_shutdown`. Solo si no sale en `CIERRE_ORDENADO` se mata.
fn detener_backend(state: &BackendState) {
    let mut guard = match state.child.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let Some(mut child) = guard.take() else {
        return;
    };
    let pid = child.id();
    log_app_state(state, &format!("cerrando backend (pid {pid})"));

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(b"shutdown\n");
        let _ = stdin.flush();
        // Al salir del scope se cierra el pipe: EOF si el aviso no llegó.
    }

    let inicio = Instant::now();
    let mut salio = false;
    while inicio.elapsed() < CIERRE_ORDENADO {
        match child.try_wait() {
            Ok(Some(estado)) => {
                log_app_state(state, &format!("backend terminó ({estado})"));
                salio = true;
                break;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(exc) => {
                log_app_state(state, &format!("error esperando al backend: {exc}"));
                break;
            }
        }
    }

    if !salio {
        log_app_state(state, "el backend no salió a tiempo; se fuerza el cierre");
        #[cfg(windows)]
        matar_arbol_windows(pid);
        #[cfg(unix)]
        matar_grupo(pid, libc::SIGKILL);
        let _ = child.kill();
    }
    let _ = child.wait();

    // El hijo ya no está, pero puede quedar un ffmpeg de una descarga en el
    // mismo grupo. Se limpia sin tocar a nadie más (grupo propio).
    #[cfg(unix)]
    {
        matar_grupo(pid, libc::SIGTERM);
        std::thread::sleep(Duration::from_millis(100));
        matar_grupo(pid, libc::SIGKILL);
    }
    log_app_state(state, "backend detenido");
}

/// Suelta el candado de instancia única una sola vez.
///
/// Se llama al pedir el cierre de la ventana (antes de destruirla) y, como
/// respaldo, en `ExitRequested` para salidas que no pasan por la ventana.
fn liberar_instancia(app: &tauri::AppHandle) {
    let state = app.state::<BackendState>();
    if state.instancia_liberada.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri_plugin_single_instance::destroy(app);
    log_app_state(
        &state,
        "candado de instancia liberado para una reapertura rápida",
    );
}

/// Punto único de parada desde el evento de salida de Tauri.
fn parar_backend(app: &tauri::AppHandle) {
    let state = app.state::<BackendState>();
    state.cerrando.store(true, Ordering::SeqCst);
    detener_backend(&state);
}

/// Decide si hay que lanzar un backend nuevo o no.
///
/// Cerrar y abrir rápido deja durante un instante el puerto ocupado por el
/// backend anterior. Antes se abandonaba el arranque y la app quedaba «sin
/// conexión»; ahora se espera a que termine, se fuerza si es un huérfano con
/// PID conocido y, en desarrollo, se reutiliza el backend de `start.bat`.
/// Devuelve `true` cuando el puerto está libre y toca lanzar el nuestro.
fn preparar_puerto(es_debug: bool, state: &BackendState) -> bool {
    if !port_in_use() {
        return true;
    }
    log_app_state(
        state,
        &format!("{BACKEND_ADDR} está ocupado; comprobando qué responde"),
    );

    let inicio = Instant::now();
    let mut aviso_cierre = false;
    let mut cierre_forzado = false;
    loop {
        if !port_in_use() {
            log_app_state(state, "el puerto quedó libre");
            return true;
        }

        if let Some(info) = info_backend_actual() {
            let version = info.version.as_deref().unwrap_or("desconocida");
            if es_debug {
                log_app_state(
                    state,
                    &format!(
                        "se reutiliza el backend de desarrollo (pid {}, versión {version})",
                        info.pid.map_or_else(|| "?".to_string(), |p| p.to_string())
                    ),
                );
                return false;
            }

            if !aviso_cierre {
                log_app_state(
                    state,
                    &format!(
                        "hay un OpenWave anterior en el puerto (pid {}, versión {version}); \
                         esperando su cierre",
                        info.pid.map_or_else(|| "?".to_string(), |p| p.to_string())
                    ),
                );
                aviso_cierre = true;
            }

            // Si en 1,5 s sigue vivo, es un huérfano de una app que murió sin
            // cerrar el pipe: se termina por PID (con su árbol en Windows).
            if inicio.elapsed() >= Duration::from_millis(1500) && !cierre_forzado {
                if let Some(pid) = info.pid {
                    log_app_state(
                        state,
                        &format!("el backend anterior no se cierra solo; terminando pid {pid}"),
                    );
                    terminar_proceso(pid);
                }
                cierre_forzado = true;
            }

            // Último recurso: reutilizarlo antes que abrir la app sin backend.
            if inicio.elapsed() >= Duration::from_secs(3) {
                log_app_state(
                    state,
                    "el backend anterior sigue respondiendo; se reutiliza (aviso: no se \
                     cerrará al cerrar esta instancia)",
                );
                return false;
            }
        } else if inicio.elapsed() >= Duration::from_millis(1500) {
            log_app_state(
                state,
                &format!(
                    "{BACKEND_ADDR} lo ocupa otro proceso que no responde como OpenWave; \
                     la app abrirá sin backend"
                ),
            );
            return false;
        }

        std::thread::sleep(Duration::from_millis(150));
    }
}

/// Directorio de datos de la app — la ÚNICA fuente de verdad: el backend
/// recibe `OPENWAVE_DATA_DIR` apuntando aquí y ya no decide por su cuenta
/// (así log, base de datos, descargas y `backend.err.log` coinciden).
///
/// Misma regla que `config._datos_dir`: env → código escribible (desarrollo)
/// → `%PROGRAMDATA%\OpenWave` (instalación en Program Files: «Datos de
/// Programas», solo si se puede crear y escribir) → `%LOCALAPPDATA%\OpenWave`
/// → XDG en Unix.
fn resolve_data_dir(backend_dir: &std::path::Path) -> PathBuf {
    resolver_data_dir(backend_dir, &EntornoDatos::del_sistema())
}

/// Valores de entorno que deciden la raíz de datos.
///
/// Se separan de la lectura real (`std::env`) para poder testear la rama de
/// Windows sin tocar el entorno del proceso: los tests corren en paralelo y
/// las variables de entorno son globales.
struct EntornoDatos {
    openwave_data_dir: Option<String>,
    program_data: Option<PathBuf>,
    local_app_data: Option<PathBuf>,
    xdg_data_home: Option<String>,
    home: Option<String>,
    es_windows: bool,
}

impl EntornoDatos {
    fn del_sistema() -> Self {
        Self {
            openwave_data_dir: std::env::var("OPENWAVE_DATA_DIR")
                .ok()
                .filter(|v| !v.is_empty()),
            program_data: std::env::var_os("PROGRAMDATA").map(PathBuf::from),
            local_app_data: std::env::var_os("LOCALAPPDATA").map(PathBuf::from),
            xdg_data_home: std::env::var("XDG_DATA_HOME")
                .ok()
                .filter(|v| !v.is_empty()),
            home: std::env::var("HOME").ok().filter(|v| !v.is_empty()),
            es_windows: cfg!(target_os = "windows"),
        }
    }
}

/// Ver `resolve_data_dir`: aquí la plataforma y el entorno vienen dados.
fn resolver_data_dir(backend_dir: &std::path::Path, env: &EntornoDatos) -> PathBuf {
    if let Some(d) = &env.openwave_data_dir {
        return PathBuf::from(d);
    }
    if !es_instalado(backend_dir, env.es_windows) && dir_writable(backend_dir) {
        return backend_dir.to_path_buf();
    }
    if env.es_windows {
        // «Datos de Programas» (%PROGRAMDATA%\OpenWave): raíz compartida por
        // la máquina, no depende del usuario y sobrevive a desinstalar y
        // reinstalar. `dir_writable` crea la carpeta si falta y comprueba
        // que se puede escribir de verdad dentro.
        if let Some(program_data) = &env.program_data {
            let candidato = program_data.join("OpenWave");
            if dir_writable(&candidato) {
                return candidato;
            }
        }
        // Fallback por usuario: funciona sin privilegios.
        if let Some(local) = &env.local_app_data {
            return local.join("OpenWave");
        }
    }
    if let Some(xdg) = &env.xdg_data_home {
        return PathBuf::from(xdg).join("OpenWave");
    }
    match &env.home {
        Some(home) => PathBuf::from(home).join(".local/share/OpenWave"),
        None => PathBuf::from("."),
    }
}

/// true si `backend_dir` pertenece a una instalación de Windows. Ahí los datos
/// NUNCA van junto al código aunque el directorio sea escribible: el arranque
/// desde el instalador hereda token elevado y `dir_writable(Program Files\...)`
/// devuelve true, con lo que la BD acababa en «Archivos de programa».
///
/// Se detecta por el layout del empaquetado, que es estable:
///   * la ruta contiene `Program Files` / `Program Files (x86)`, o
///   * existe un hermano `runtime\` junto a `backend\` (solo el paquete
///     tiene `backend\` + `runtime\` + `ffmpeg\`; el repo tiene
///     `backend\venv` y ningún `runtime` en la raíz).
fn es_instalado(backend_dir: &std::path::Path, es_windows: bool) -> bool {
    if es_windows {
        let ruta = backend_dir.to_string_lossy().to_lowercase();
        if ruta.contains("\\program files\\") || ruta.contains("\\program files (x86)\\") {
            return true;
        }
    }
    // Marca común a los dos empaquetados: el hermano `runtime/` junto a
    // `backend/`. En Linux distingue la app instalada del repo.
    backend_dir
        .parent()
        .map(|raiz| raiz.join("runtime").exists())
        .unwrap_or(false)
}

/// Marcador de «ya migré los datos heredados», dentro del directorio nuevo.
const MARCADOR_MIGRACION: &str = ".migrated.json";

/// Ficheros sueltos que se migran: `(en el origen, en el destino)`.
/// `soundwave.db*` es la base de datos de la versión ANTERIOR del producto
/// (se llamaba SoundWave): se renombra a `openwave.db*`.
const FICHEROS_MIGRACION: [(&str, &str); 7] = [
    ("openwave.db", "openwave.db"),
    ("openwave.db-wal", "openwave.db-wal"),
    ("openwave.db-shm", "openwave.db-shm"),
    ("soundwave.db", "openwave.db"),
    ("soundwave.db-wal", "openwave.db-wal"),
    ("soundwave.db-shm", "openwave.db-shm"),
    ("url_cache.json", "url_cache.json"),
];

/// Carpetas de datos de usuario que se migran enteras.
///
/// `stream_cache` NO se migra: es una caché derivada (se regenera sola) y
/// puede ocupar cientos de MB. Copiarla bloqueaba el primer arranque sin
/// aportar nada.
const CARPETAS_MIGRACION: [&str; 2] = ["downloads", "lyrics"];

/// Copia recursiva `origen` → `destino` sin pisar lo que ya haya en destino
/// (los datos nuevos mandan) y sin tocar el origen. Devuelve el número de
/// ficheros copiados.
fn copiar_dir_sin_pisar(
    origen: &std::path::Path,
    destino: &std::path::Path,
) -> std::io::Result<usize> {
    std::fs::create_dir_all(destino)?;
    let mut copiados = 0usize;
    for entrada in std::fs::read_dir(origen)? {
        let entrada = entrada?;
        let destino_ruta = destino.join(entrada.file_name());
        if entrada.file_type()?.is_dir() {
            copiados += copiar_dir_sin_pisar(&entrada.path(), &destino_ruta)?;
        } else if !destino_ruta.exists() {
            std::fs::copy(entrada.path(), &destino_ruta)?;
            copiados += 1;
        }
    }
    Ok(copiados)
}

/// Copia los ficheros sueltos (BD, WAL/SHM y caché de URLs).
///
/// Es lo único que el backend necesita tener antes de arrancar: sin la base
/// de datos crearía una vacía. Por eso esta parte sigue siendo síncrona.
fn migrar_ficheros(data_dir: &std::path::Path, origenes: &[PathBuf]) -> std::io::Result<usize> {
    std::fs::create_dir_all(data_dir)?;
    let mut copiados = 0usize;
    for origen in origenes.iter().filter(|origen| origen.is_dir()) {
        for (fuente, destino) in FICHEROS_MIGRACION {
            let fichero_origen = origen.join(fuente);
            let fichero_destino = data_dir.join(destino);
            if fichero_origen.is_file() && !fichero_destino.exists() {
                std::fs::copy(&fichero_origen, &fichero_destino)?;
                copiados += 1;
            }
        }
    }
    Ok(copiados)
}

/// Copia descargas y letras (sin pisar lo que ya haya en destino).
fn migrar_carpetas(data_dir: &std::path::Path, origenes: &[PathBuf]) -> std::io::Result<usize> {
    let mut copiados = 0usize;
    for origen in origenes.iter().filter(|origen| origen.is_dir()) {
        for carpeta in CARPETAS_MIGRACION {
            let carpeta_origen = origen.join(carpeta);
            if carpeta_origen.is_dir() {
                copiados += copiar_dir_sin_pisar(&carpeta_origen, &data_dir.join(carpeta))?;
            }
        }
    }
    Ok(copiados)
}

/// Escribe el marcador que evita repetir la migración en cada arranque.
///
/// Solo se escribe cuando todo ha terminado: si la app se cierra a mitad, la
/// siguiente ejecución reintenta (copiar es idempotente y no pisa).
fn escribir_marcador_migracion(
    data_dir: &std::path::Path,
    origenes: &[PathBuf],
    copiados: usize,
) -> std::io::Result<()> {
    let momento = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let marca = serde_json::json!({
        "origenes": origenes
            .iter()
            .filter(|origen| origen.is_dir())
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>(),
        "copiados": copiados,
        "momento": momento,
    });
    std::fs::write(data_dir.join(MARCADOR_MIGRACION), marca.to_string())
}

/// Migra TODO de golpe (solo tests). La app usa la versión en dos fases:
/// ficheros antes del backend y carpetas en segundo plano.
#[cfg(test)]
fn migrar_datos_heredados(
    data_dir: &std::path::Path,
    origenes: &[PathBuf],
) -> std::io::Result<usize> {
    if data_dir.join(MARCADOR_MIGRACION).exists() {
        return Ok(0);
    }
    if !origenes.iter().any(|origen| origen.is_dir()) {
        return Ok(0);
    }
    let copiados = migrar_ficheros(data_dir, origenes)? + migrar_carpetas(data_dir, origenes)?;
    escribir_marcador_migracion(data_dir, origenes, copiados)?;
    Ok(copiados)
}

/// Directorios de datos de versiones anteriores, en orden de prioridad.
///
/// Solo Windows (ahí está `%LOCALAPPDATA%`): OpenWave actual y la marca
/// anterior del producto, «SoundWave» (el renombrado solo cambió el código,
/// los datos del usuario siguen con el nombre viejo).
fn raices_datos_heredados() -> Vec<PathBuf> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }
    let Some(local) = std::env::var_os("LOCALAPPDATA") else {
        return Vec::new();
    };
    let base = PathBuf::from(local);
    vec![base.join("OpenWave"), base.join("SoundWave")]
}

/// Primera fase: migra la base de datos y los ficheros pequeños.
///
/// Se llama ANTES de arrancar el backend: si no, éste crearía su base de
/// datos vacía y la migración ya no tendría dónde meter los datos. Devuelve
/// los orígenes para que `setup` pueda lanzar la segunda fase.
fn migrar_si_hace_falta(data_dir: &Path) -> Vec<PathBuf> {
    let origenes = raices_datos_heredados();
    if origenes.is_empty() || data_dir.join(MARCADOR_MIGRACION).exists() {
        return origenes;
    }
    match migrar_ficheros(data_dir, &origenes) {
        Ok(0) => {}
        Ok(n) => log_app(
            data_dir,
            &format!(
                "migrados {n} ficheros de datos antiguos a {}",
                data_dir.display()
            ),
        ),
        Err(e) => log_app(
            data_dir,
            &format!("no se pudieron migrar los datos antiguos: {e}"),
        ),
    }
    origenes
}

/// Segunda fase: descargas y letras en un hilo, sin bloquear la ventana.
///
/// El marcador se escribe al terminar. Si la app se cierra antes, la próxima
/// apertura vuelve a intentarlo; copiar no pisa nada ya presente.
fn migrar_carpetas_en_segundo_plano(data_dir: PathBuf, origenes: Vec<PathBuf>) {
    if origenes.is_empty() || data_dir.join(MARCADOR_MIGRACION).exists() {
        return;
    }
    let inicio = Instant::now();
    match migrar_carpetas(&data_dir, &origenes) {
        Ok(n) => match escribir_marcador_migracion(&data_dir, &origenes, n) {
            Ok(()) => log_app(
                &data_dir,
                &format!(
                    "migración en segundo plano: {n} ficheros en {} ms",
                    inicio.elapsed().as_millis()
                ),
            ),
            Err(e) => log_app(
                &data_dir,
                &format!("migración terminada pero no se pudo marcar: {e}"),
            ),
        },
        Err(e) => log_app(
            &data_dir,
            &format!("migración en segundo plano falló (se reintentará): {e}"),
        ),
    }
}

/// Crea/trunca `<data>/backend.err.log` para capturar el stderr del backend
/// en release Windows (sin consola: ahí caen los tracebacks de Python y los
/// arranques de uvicorn). SoloWindows + release: en desarrollo se hereda la
/// consola del terminal.
#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn create_err_log(data_dir: &std::path::Path) -> Option<std::fs::File> {
    std::fs::create_dir_all(data_dir).ok()?;
    std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(data_dir.join("backend.err.log"))
        .ok()
}

/// Fija el icono ICON_BIG (Alt+Tab, lista de ventanas y taskbar cuando el
/// AUMID no tiene item de app en `AppsFolder`). Tauri solo fija el *small*;
/// aquí se copia y escala el small ya cargado (256x256 a 48x48) en ESTE
/// proceso: un `HICON` de otro proceso no sirve. El icono con identidad de
/// paquete lo da el item de AppsFolder (`docs/PERFORMANCE.md` §10).
#[cfg(windows)]
fn set_taskbar_icon(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::{HANDLE, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CopyImage, SendMessageW, SetClassLongPtrW, GCLP_HICON, ICON_BIG, ICON_SMALL, IMAGE_FLAGS,
        IMAGE_ICON, WM_GETICON, WM_SETICON,
    };

    let hwnd = match window.hwnd() {
        Ok(h) => h,
        Err(e) => {
            eprintln!("[openwave] set_taskbar_icon: sin hwnd ({e})");
            return;
        }
    };

    unsafe {
        // Icono small que tauri/tao ya puso al crear la ventana.
        let small = SendMessageW(hwnd, WM_GETICON, Some(WPARAM(ICON_SMALL as usize)), None);
        if small.0 == 0 {
            eprintln!("[openwave] set_taskbar_icon: la ventana no tiene icono small");
            return;
        }
        // Escalar a 48x48 (icono de taskbar a 100% de DPI; fuente 256 => nitido).
        match CopyImage(
            HANDLE(small.0 as *mut _),
            IMAGE_ICON,
            48,
            48,
            IMAGE_FLAGS(0),
        ) {
            Ok(big) => {
                SendMessageW(
                    hwnd,
                    WM_SETICON,
                    Some(WPARAM(ICON_BIG as usize)),
                    Some(LPARAM(big.0 as isize)),
                );
                // Respaldo por si el shell consulta el icono de la clase.
                SetClassLongPtrW(hwnd, GCLP_HICON, big.0 as isize);
            }
            Err(e) => eprintln!("[openwave] set_taskbar_icon: CopyImage fallo ({e})"),
        }
    }
}

/// Entorno de ventana que el frontend usa para decidir si pinta la barra
/// personalizada. En Windows se mantiene siempre.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowEnvironment {
    linux: bool,
    installed: bool,
    hyprland: bool,
    desktop: String,
    custom_title_bar: bool,
}

#[cfg(target_os = "linux")]
fn es_hyprland(hyprland_signature: Option<&str>, current_desktop: Option<&str>) -> bool {
    hyprland_signature.is_some_and(|v| !v.trim().is_empty())
        || current_desktop.is_some_and(|v| v.to_lowercase().contains("hyprland"))
}

#[cfg(target_os = "linux")]
fn escritorio_linux() -> (bool, String) {
    let signature = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok();
    let current = std::env::var("XDG_CURRENT_DESKTOP").ok();
    let session = std::env::var("XDG_SESSION_DESKTOP").ok();
    let classic = std::env::var("DESKTOP_SESSION").ok();
    let desktop = current
        .clone()
        .or(session)
        .or(classic)
        .unwrap_or_else(|| "desconocido".to_string());
    (
        es_hyprland(signature.as_deref(), current.as_deref()),
        desktop,
    )
}

#[cfg(target_os = "linux")]
fn linux_instalado(app: &tauri::AppHandle) -> bool {
    app.path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("runtime").is_dir())
        .unwrap_or(false)
}

#[tauri::command]
fn window_environment(app: tauri::AppHandle) -> WindowEnvironment {
    #[cfg(target_os = "linux")]
    {
        let installed = linux_instalado(&app);
        let (hyprland, desktop) = escritorio_linux();
        return WindowEnvironment {
            linux: true,
            installed,
            hyprland,
            desktop,
            custom_title_bar: !installed,
        };
    }

    #[cfg(not(target_os = "linux"))]
    WindowEnvironment {
        linux: false,
        installed: false,
        hyprland: false,
        desktop: String::new(),
        custom_title_bar: true,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Una segunda apertura no crea otra ventana: comparte backend con la
        // primera y cerrar una mataría el backend de la otra. El plugin trae
        // al frente la ventana existente.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            log_app_handle(app, "segunda instancia: se enfoca la ventana existente");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![window_environment])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        // Selector nativo de archivos (rfd) + lectura: sustituyen a los
        // <input type="file">, cuyo diálogo en WebView2 cerraba la app.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(BackendState::new())
        .setup(|app| {
            #[cfg_attr(not(target_os = "windows"), allow(unused_variables))]
            let window = match app.get_webview_window("main") {
                Some(w) => w,
                None => {
                    eprintln!("[openwave] No se pudo obtener la ventana principal");
                    return Ok(());
                }
            };

            #[cfg(target_os = "linux")]
            {
                // Solo en paquetes instalados: Hyprland no necesita marco y
                // el resto de escritorios recuperan su barra nativa. La
                // barra personalizada la oculta el frontend con el mismo dato.
                let installed = app
                    .handle()
                    .path()
                    .resource_dir()
                    .ok()
                    .map(|dir| dir.join("runtime").is_dir())
                    .unwrap_or(false);
                if installed {
                    let (hyprland, desktop) = escritorio_linux();
                    if let Err(e) = window.set_decorations(!hyprland) {
                        eprintln!("[openwave] No se pudo ajustar el marco nativo: {e}");
                    } else {
                        eprintln!(
                            "[openwave] Linux instalado ({desktop}): barra {}",
                            if hyprland {
                                "personalizada oculta y sin marco nativo"
                            } else {
                                "personalizada oculta, marco nativo activo"
                            }
                        );
                    }
                }
            }

            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::{apply_mica, apply_tabbed};
                if apply_tabbed(&window, Some(true)).is_err() {
                    let _ = apply_mica(&window, Some(true));
                }
            }

            // Icono ICON_BIG para la barra de tareas/Alt+Tab, antes de que
            // arranque el bucle de mensajes (ver set_taskbar_icon).
            #[cfg(windows)]
            set_taskbar_icon(&window);

            let backend_path: PathBuf = if cfg!(debug_assertions) {
                let manifest_dir = match option_env!("CARGO_MANIFEST_DIR") {
                    Some(d) => PathBuf::from(d),
                    None => {
                        eprintln!("[openwave] CARGO_MANIFEST_DIR no definido");
                        return Ok(());
                    }
                };
                match manifest_dir.parent() {
                    Some(p) => p.join("backend").join("main.py"),
                    None => {
                        eprintln!("[openwave] No se pudo resolver backend path");
                        return Ok(());
                    }
                }
            } else {
                match app.path().resource_dir() {
                    Ok(dir) => dir.join("backend").join("main.py"),
                    Err(e) => {
                        eprintln!("[openwave] resource dir not found: {e}");
                        return Ok(());
                    }
                }
            };

            // Directorio de datos único
            // Rust lo decide y se lo pasa al backend (OPENWAVE_DATA_DIR):
            // log, base de datos, descargas y backend.err.log viven juntos,
            // tanto en desarrollo (backend/) como instalados
            // (%PROGRAMDATA%\OpenWave en Program Files).
            let backend_dir = backend_path
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| PathBuf::from("."));
            let data_dir = resolve_data_dir(&backend_dir);
            reiniciar_log_app(&data_dir);
            {
                let estado = app.state::<BackendState>();
                if let Ok(mut guard) = estado.data_dir.lock() {
                    *guard = Some(data_dir.clone());
                };
            }
            log_app_state(
                &app.state::<BackendState>(),
                &format!("datos en {}", data_dir.display()),
            );

            // Reapertura rápida: esperar al backend anterior en vez de
            // abandonar el arranque. En desarrollo se reutiliza el que haya.
            if !preparar_puerto(cfg!(debug_assertions), &app.state::<BackendState>()) {
                return Ok(());
            }

            // Datos de versiones anteriores (OpenWave actual y la marca
            // antigua SoundWave) al directorio nuevo, ANTES del spawn: si el
            // backend arranca primero crea su base de datos vacía y ya no
            // hay dónde meter los datos del usuario. Solo la base de datos y
            // los ficheros pequeños; las descargas van en segundo plano.
            let origenes_migracion = migrar_si_hace_falta(&data_dir);

            // Candidatos de intérprete, en orden:
            //  1. runtime empaquetado (instalación Windows: Python embebido
            //     con las dependencias en Lib\site-packages)
            //  2. venv del proyecto (desarrollo)
            //  3. python / python3 / py del PATH (desarrollo)
            let mut python_paths: Vec<String> = Vec::new();
            if let Some(runtime_dir) = backend_dir.parent().map(|p| p.join("runtime")) {
                let runtime_python = if cfg!(target_os = "windows") {
                    runtime_dir.join("python.exe")
                } else {
                    runtime_dir.join("bin").join("python3")
                };
                if runtime_python.exists() {
                    python_paths.push(runtime_python.to_string_lossy().into_owned());
                }
            }

            // El venv de desarrollo vive JUNTO AL BACKEND (`backend/venv`),
            // no en la raíz del repo. Buscarlo en el padre hacía que se
            // lanzara el `python` del sistema, sin dependencias.
            let venv_python = {
                let ruta = backend_dir
                    .join("venv")
                    .join(if cfg!(target_os = "windows") {
                        "Scripts"
                    } else {
                        "bin"
                    })
                    .join(if cfg!(target_os = "windows") {
                        "python.exe"
                    } else {
                        "python"
                    });
                if ruta.is_file() {
                    ruta.to_string_lossy().to_string()
                } else {
                    String::new()
                }
            };

            python_paths.extend([
                venv_python,
                "python".to_string(),
                "python3".to_string(),
                "py".to_string(),
            ]);

            // ffmpeg empaquetado al frente del PATH: yt-dlp (y cualquier
            // otra herramienta) lo invoca por nombre sin recibir la ruta.
            let ffmpeg_dir = backend_dir
                .parent()
                .map(|p| p.join("ffmpeg"))
                .filter(|p| p.is_dir());

            let mut child = None;
            for py in &python_paths {
                if py.is_empty() {
                    continue;
                }
                let mut cmd = Command::new(py);
                cmd.arg(&backend_path);
                // Directorio del intérprete (y el ffmpeg empaquetado) al
                // frente del PATH para que yt-dlp hereda las herramientas.
                // ";" en Windows, ":" en el resto de plataformas.
                let sep = if cfg!(target_os = "windows") {
                    ";"
                } else {
                    ":"
                };
                let old = std::env::var("PATH").unwrap_or_default();
                let mut path_prefix: Vec<String> = Vec::new();
                let py_path = std::path::Path::new(py.as_str());
                if let Some(dir) = py_path.parent() {
                    if !dir.as_os_str().is_empty() {
                        path_prefix.push(dir.display().to_string());
                    }
                }
                if let Some(dir) = &ffmpeg_dir {
                    path_prefix.push(dir.display().to_string());
                }
                if !path_prefix.is_empty() {
                    cmd.env("PATH", format!("{}{}{}", path_prefix.join(sep), sep, old));
                }
                cmd.env("OPENWAVE_DATA_DIR", &data_dir);
                // El AppRun del AppImage exporta PYTHONHOME/PYTHONPATH
                // apuntando a `usr/`; el intérprete empaquetado busca su
                // stdlib junto al ejecutable y moría con «Failed to import
                // encodings». El runtime es autocontenido: se ignoran.
                cmd.env_remove("PYTHONHOME");
                cmd.env_remove("PYTHONPATH");
                // Ciclo de vida: Rust escribe «shutdown» (o cierra el pipe)
                // y el backend sale ordenadamente. Solo se activa aquí; una
                // ejecución manual de `python main.py` no se cierra sola.
                cmd.env("OPENWAVE_LIFECYCLE_STDIN", "1");
                cmd.env("OPENWAVE_APP_VERSION", env!("CARGO_PKG_VERSION"));
                cmd.stdin(Stdio::piped());

                // Grupo propio en Unix: al cerrar se puede limpiar también
                // cualquier ffmpeg que haya lanzado una descarga.
                #[cfg(unix)]
                {
                    use std::os::unix::process::CommandExt;
                    cmd.process_group(0);
                }

                // En la app instalada (Windows release) no debe aparecer una
                // consola: stdout va al vacío (todo lo importante ya cae en
                // openwave.log) y stderr se guarda en backend.err.log para
                // poder diagnosticar un arranque roto.
                #[cfg(all(target_os = "windows", not(debug_assertions)))]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    cmd.stdout(Stdio::null());
                    match create_err_log(&data_dir) {
                        Some(f) => {
                            cmd.stderr(Stdio::from(f));
                        }
                        None => {
                            cmd.stderr(Stdio::null());
                        }
                    }
                }

                match cmd.spawn() {
                    Ok(c) => {
                        log_app_state(
                            &app.state::<BackendState>(),
                            &format!("backend lanzado con {py} (pid {})", c.id()),
                        );
                        child = Some(c);
                        break;
                    }
                    Err(exc) => {
                        log_app_state(
                            &app.state::<BackendState>(),
                            &format!("no se pudo lanzar {py}: {exc}"),
                        );
                        continue;
                    }
                }
            }

            let child = match child {
                Some(c) => c,
                None => {
                    log_app_state(
                        &app.state::<BackendState>(),
                        &format!(
                            "no se pudo iniciar el backend ({}): no hay intérprete válido",
                            backend_path.display()
                        ),
                    );
                    return Ok(());
                }
            };

            match app.state::<BackendState>().child.lock() {
                Ok(mut guard) => {
                    *guard = Some(child);
                }
                Err(e) => {
                    log_app_state(
                        &app.state::<BackendState>(),
                        &format!("error al guardar el backend: {e}"),
                    );
                    return Ok(());
                }
            }

            // Descargas y letras antiguas: copia en un hilo. Si la app se
            // cierra antes de terminar, el marcador no se escribe y la
            // siguiente apertura lo reintenta.
            if !origenes_migracion.is_empty() {
                let dir = data_dir.clone();
                std::thread::spawn(move || {
                    migrar_carpetas_en_segundo_plano(dir, origenes_migracion)
                });
            }

            // Vigila si el backend propio muere y deja rastro en el log. El
            // frontend se entera por su sondeo de /health (banner de conexión).
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                let state = handle.state::<BackendState>();
                if state.cerrando.load(Ordering::SeqCst) {
                    break;
                }
                let Ok(mut guard) = state.child.lock() else {
                    break;
                };
                match guard.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(status)) => {
                            log_app_state(&state, &format!("el backend terminó ({status})"));
                            *guard = None;
                            break;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            log_app_state(&state, &format!("error vigilando al backend: {e}"));
                            break;
                        }
                    },
                    None => break,
                }
            });

            // El health check NO bloquea el arranque: mientras setup() espera
            // aquí, el event loop todavía no ha arrancado y la ventana no
            // pinta nada (se veía como «tarda mucho en iniciar», hasta 15 s
            // de pantalla en negro y sin animación de carga). La espera pasa
            // a un hilo y la ventana sale ya; el frontend se entera del
            // estado por su propio sondeo de /health (banner de conexión).
            // El plazo se alinea con la ventana de gracia del frontend (30 s).
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let inicio = Instant::now();
                let listo = wait_for_backend(Duration::from_secs(30));
                let estado = handle.state::<BackendState>();
                if listo {
                    log_app_state(
                        &estado,
                        &format!("backend listo en {} ms", inicio.elapsed().as_millis()),
                    );
                } else {
                    log_app_state(
                        &estado,
                        "el backend no respondió en 30 s: la app abrirá sin conexión",
                    );
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // En cuanto el usuario pide cerrar, liberar el candado: el
            // backend tarda unos cientos de ms en apagarse y una reapertura
            // inmediata no debe encontrar una instancia "fantasma".
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                liberar_instancia(window.app_handle());
            }
        })
        .build(tauri::generate_context!());

    let app = match app {
        Ok(app) => app,
        Err(e) => {
            eprintln!("[openwave] Error al construir la aplicación: {e}");
            return;
        }
    };

    app.run(|handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            let state = handle.state::<BackendState>();
            // El segundo ExitRequested es el de nuestro propio `exit(0)`.
            if state.cerrando.swap(true, Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            // Respaldo para salidas que no pasan por CloseRequested.
            liberar_instancia(handle);
            let handle = handle.clone();
            std::thread::spawn(move || {
                // Si el cierre del backend fallara de forma inesperada, la
                // app no puede quedarse sin ventana y viva para siempre.
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    parar_backend(&handle);
                }));
                // `std::process::exit` en vez de `handle.exit`: el plugin ya
                // liberó el candado a mano y su hook de `RunEvent::Exit` lo
                // volvería a cerrar (doble CloseHandle en Windows).
                std::process::exit(0);
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::health_probe;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    #[cfg(unix)]
    #[test]
    fn detener_backend_avisa_por_stdin_y_espera() {
        use super::{detener_backend, BackendState};
        use std::process::{Command, Stdio};

        let estado = BackendState::new();
        let mut cmd = Command::new("sh");
        cmd.arg("-c")
            .arg("read linea; [ \"$linea\" = shutdown ]")
            .stdin(Stdio::piped());
        let child = cmd.spawn().expect("debe lanzar sh");
        *estado.child.lock().unwrap() = Some(child);

        let inicio = std::time::Instant::now();
        detener_backend(&estado);

        assert!(inicio.elapsed() < Duration::from_secs(3));
        assert!(estado.child.lock().unwrap().is_none());
    }

    const OK_BODY: &str = "{\"status\":\"ok\",\"service\":\"OpenWave\"}";

    fn serve(response_parts: Vec<Vec<u8>>, close_after: bool) -> std::net::SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut req = [0u8; 256];
            let _ = s.read(&mut req);
            for (i, part) in response_parts.iter().enumerate() {
                let _ = s.write_all(part);
                let _ = s.flush();
                if i + 1 < response_parts.len() {
                    std::thread::sleep(Duration::from_millis(150));
                }
            }
            if close_after {
                drop(s);
            } else {
                // mantener la conexión abierta hasta que el hilo muera
                std::thread::sleep(Duration::from_millis(3000));
            }
        });
        addr
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn detecta_hyprland_por_firma_o_escritorio() {
        use super::es_hyprland;
        assert!(es_hyprland(Some("abc123"), None));
        assert!(es_hyprland(None, Some("Hyprland")));
        assert!(es_hyprland(None, Some("hyprland")));
        assert!(!es_hyprland(None, Some("GNOME")));
        assert!(!es_hyprland(None, None));
    }

    // El caso real que motivó el bucle: un /health sano llega en dos paquetes
    // y la read() única solo veía la cabecera → falso negativo cosmético.
    #[test]
    fn respuesta_fragmentada_sigue_siendo_openwave() {
        let head = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n";
        let tail = format!("Content-Length: {}\r\n\r\n{}", OK_BODY.len(), OK_BODY);
        let addr = serve(vec![head.to_vec(), tail.into_bytes()], true);
        assert!(health_probe(addr));
    }

    #[test]
    fn respuesta_ok_en_un_solo_paquete() {
        let full = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            OK_BODY.len(),
            OK_BODY
        );
        let addr = serve(vec![full.into_bytes()], true);
        assert!(health_probe(addr));
    }

    #[test]
    fn info_backend_lee_version_y_pid() {
        let body =
            "{\"status\":\"ok\",\"service\":\"OpenWave\",\"version\":\"1.2.2\",\"pid\":4242}";
        let full = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let addr = serve(vec![full.into_bytes()], true);
        let info = super::info_backend(addr).expect("debe leer el health");
        assert_eq!(info.version.as_deref(), Some("1.2.2"));
        assert_eq!(info.pid, Some(4242));
    }

    #[test]
    fn otro_servicio_en_el_puerto_no_pasa() {
        let full = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 7\r\n\r\nhola!!";
        let addr = serve(vec![full.as_bytes().to_vec()], true);
        assert!(!health_probe(addr));
    }

    #[test]
    fn error_con_el_marcador_no_pasa() {
        let full = format!(
            "HTTP/1.1 503 Busy\r\nContent-Length: {}\r\n\r\n{}",
            OK_BODY.len(),
            OK_BODY
        );
        let addr = serve(vec![full.into_bytes()], true);
        assert!(!health_probe(addr));
    }

    #[test]
    fn conexion_cerrada_sin_respuesta_no_pasa() {
        let addr = serve(vec![], true);
        assert!(!health_probe(addr));
    }

    #[test]
    fn sin_respuesta_no_cuelga_mas_del_plazo() {
        // acepta y no dice nada: el plazo global debe cortar (≈1,5 s)
        let addr = serve(vec![], false);
        let t0 = std::time::Instant::now();
        assert!(!health_probe(addr));
        assert!(t0.elapsed() < Duration::from_secs(3));
    }

    // Directorio de datos: «Datos de Programas» (%PROGRAMDATA%)

    use super::{dir_writable, migrar_datos_heredados, resolver_data_dir, EntornoDatos};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static CONTADOR: AtomicUsize = AtomicUsize::new(0);

    /// Directorio temporal único para cada test (sin dependencias nuevas).
    /// Se limpia al empezar para no heredar restos de corridas anteriores.
    fn dir_temp(nombre: &str) -> PathBuf {
        let ruta = std::env::temp_dir().join(format!(
            "openwave_test_{nombre}_{}_{}",
            std::process::id(),
            CONTADOR.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&ruta);
        std::fs::create_dir_all(&ruta).unwrap();
        ruta
    }

    /// Entorno vacío: sin variables y sin plataforma Windows (Linux/macOS).
    fn entorno_vacio() -> EntornoDatos {
        EntornoDatos {
            openwave_data_dir: None,
            program_data: None,
            local_app_data: None,
            xdg_data_home: None,
            home: None,
            es_windows: false,
        }
    }

    /// «Código en Program Files»: un fichero como ancestro impide crear
    /// cualquier carpeta dentro, igual que un directorio sin permisos.
    fn codigo_no_escribible(tmp: &std::path::Path) -> PathBuf {
        let bloqueo = tmp.join("Program Files");
        std::fs::write(&bloqueo, "").unwrap();
        bloqueo.join("OpenWave").join("backend")
    }

    #[test]
    fn dir_writable_crea_el_directorio_y_no_deja_rastro() {
        let tmp = dir_temp("writable");
        let nueva = tmp.join("ProgramData").join("OpenWave");
        assert!(dir_writable(&nueva));
        assert!(nueva.is_dir());
        // el archivo de prueba se ha borrado
        assert!(std::fs::read_dir(&nueva).unwrap().next().is_none());

        let bloqueo = tmp.join("fichero");
        std::fs::write(&bloqueo, "").unwrap();
        assert!(!dir_writable(&bloqueo.join("hijo")));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn env_y_codigo_escribible_mandan_sobre_todo() {
        let tmp = dir_temp("env");

        // OPENWAVE_DATA_DIR manda siempre (tests, portable, depuración)
        let mut env = entorno_vacio();
        env.openwave_data_dir = Some(tmp.join("portable").display().to_string());
        env.program_data = Some(tmp.join("ProgramData"));
        assert_eq!(
            resolver_data_dir(std::path::Path::new("/no-se-mira"), &env),
            tmp.join("portable")
        );

        // Con código escribible (desarrollo) los datos van junto al código
        let mut env = entorno_vacio();
        env.program_data = Some(tmp.join("ProgramData"));
        assert_eq!(resolver_data_dir(&tmp, &env), tmp);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn windows_los_datos_van_a_programdata() {
        let tmp = dir_temp("programdata");
        let mut env = entorno_vacio();
        env.es_windows = true;
        env.program_data = Some(tmp.join("ProgramData"));
        env.local_app_data = Some(tmp.join("Local"));

        let ruta = resolver_data_dir(&codigo_no_escribible(&tmp), &env);
        assert_eq!(ruta, tmp.join("ProgramData").join("OpenWave"));
        // El gate debe crear la carpeta al comprobar escritura
        assert!(ruta.is_dir());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn windows_sin_programdata_cae_en_localappdata() {
        let tmp = dir_temp("sin-programdata");
        let mut env = entorno_vacio();
        env.es_windows = true;
        env.local_app_data = Some(tmp.join("Local"));

        let ruta = resolver_data_dir(&codigo_no_escribible(&tmp), &env);
        assert_eq!(ruta, tmp.join("Local").join("OpenWave"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn windows_programdata_no_escribible_cae_en_localappdata() {
        let tmp = dir_temp("programdata-ro");
        // %PROGRAMDATA% es un fichero → imposible crear OpenWave dentro
        let pd = tmp.join("ProgramData");
        std::fs::write(&pd, "").unwrap();
        let mut env = entorno_vacio();
        env.es_windows = true;
        env.program_data = Some(pd);
        env.local_app_data = Some(tmp.join("Local"));

        let ruta = resolver_data_dir(&codigo_no_escribible(&tmp), &env);
        assert_eq!(ruta, tmp.join("Local").join("OpenWave"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn en_linux_programdata_no_manda() {
        let tmp = dir_temp("linux");
        let mut env = entorno_vacio(); // es_windows: false
        env.program_data = Some(tmp.join("ProgramData"));
        env.local_app_data = Some(tmp.join("Local"));
        env.xdg_data_home = Some(tmp.join("xdg").display().to_string());

        let ruta = resolver_data_dir(&codigo_no_escribible(&tmp), &env);
        assert_eq!(ruta, tmp.join("xdg").join("OpenWave"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    // Migración de datos heredados (OpenWave y la marca SoundWave)

    #[test]
    fn migracion_copia_los_datos_y_renombra_soundwave() {
        let tmp = dir_temp("migra");
        let legacy = tmp.join("legacy");
        std::fs::create_dir_all(legacy.join("downloads").join("covers")).unwrap();
        std::fs::create_dir_all(legacy.join("lyrics")).unwrap();
        std::fs::create_dir_all(legacy.join("stream_cache")).unwrap();
        // base de datos con la marca ANTERIOR del producto + wal/shm
        std::fs::write(legacy.join("soundwave.db"), "db vieja").unwrap();
        std::fs::write(legacy.join("soundwave.db-wal"), "wal").unwrap();
        std::fs::write(legacy.join("soundwave.db-shm"), "shm").unwrap();
        std::fs::write(legacy.join("url_cache.json"), "{}").unwrap();
        std::fs::write(legacy.join("downloads").join("cancion.mp3"), "mp3").unwrap();
        std::fs::write(legacy.join("downloads").join("covers").join("x.jpg"), "jpg").unwrap();
        std::fs::write(legacy.join("lyrics").join("x.lrc"), "lrc").unwrap();
        std::fs::write(legacy.join("stream_cache").join("y.m4a"), "m4a").unwrap();

        let destino = tmp.join("datos");
        let copiados = migrar_datos_heredados(&destino, &[legacy.clone()]).unwrap();
        assert_eq!(copiados, 7);

        // soundwave.db* renombrado a openwave.db*
        assert_eq!(
            std::fs::read_to_string(destino.join("openwave.db")).unwrap(),
            "db vieja"
        );
        assert!(destino.join("openwave.db-wal").is_file());
        assert!(destino.join("openwave.db-shm").is_file());
        assert!(destino.join("url_cache.json").is_file());
        assert!(destino.join("downloads").join("cancion.mp3").is_file());
        assert!(destino
            .join("downloads")
            .join("covers")
            .join("x.jpg")
            .is_file());
        assert!(destino.join("lyrics").join("x.lrc").is_file());
        // La caché de stream es derivada y no se copia.
        assert!(!destino.join("stream_cache").join("y.m4a").exists());

        // el origen NO se borra (por si hay que recuperar a mano)
        assert!(legacy.join("soundwave.db").is_file());
        assert!(legacy.join("downloads").join("cancion.mp3").is_file());

        // marcador escrito → la próxima pasada no vuelve a copiar
        assert!(destino.join(super::MARCADOR_MIGRACION).is_file());
        assert_eq!(
            migrar_datos_heredados(&destino, &[legacy.clone()]).unwrap(),
            0
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn migracion_no_pisa_lo_que_ya_hay_en_destino() {
        let tmp = dir_temp("migra-no-pisa");
        let legacy = tmp.join("legacy");
        std::fs::create_dir_all(legacy.join("downloads")).unwrap();
        std::fs::write(legacy.join("openwave.db"), "db vieja").unwrap();
        std::fs::write(legacy.join("downloads").join("tema.mp3"), "mp3 viejo").unwrap();

        let destino = tmp.join("datos");
        std::fs::create_dir_all(destino.join("downloads")).unwrap();
        std::fs::write(destino.join("openwave.db"), "db nueva").unwrap();
        std::fs::write(destino.join("downloads").join("tema.mp3"), "mp3 nuevo").unwrap();

        migrar_datos_heredados(&destino, &[legacy.clone()]).unwrap();

        assert_eq!(
            std::fs::read_to_string(destino.join("openwave.db")).unwrap(),
            "db nueva"
        );
        assert_eq!(
            std::fs::read_to_string(destino.join("downloads").join("tema.mp3")).unwrap(),
            "mp3 nuevo"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn migracion_sin_origenes_validos_no_hace_nada() {
        let tmp = dir_temp("migra-vacio");
        let destino = tmp.join("datos");
        let inexistente = tmp.join("no_existe");

        assert_eq!(migrar_datos_heredados(&destino, &[inexistente]).unwrap(), 0);
        // sin origen no hay marcador: si aparecen datos después, se migran
        assert!(!destino.join(super::MARCADOR_MIGRACION).exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn migracion_con_marcador_no_vuelve_a_tocar() {
        let tmp = dir_temp("migra-marcado");
        let legacy = tmp.join("legacy");
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::write(legacy.join("openwave.db"), "db vieja").unwrap();

        let destino = tmp.join("datos");
        std::fs::create_dir_all(&destino).unwrap();
        std::fs::write(destino.join(super::MARCADOR_MIGRACION), "{}").unwrap();

        assert_eq!(
            migrar_datos_heredados(&destino, &[legacy.clone()]).unwrap(),
            0
        );
        assert!(!destino.join("openwave.db").exists());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}

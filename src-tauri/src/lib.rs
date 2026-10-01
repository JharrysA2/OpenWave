use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

struct BackendProcess(Mutex<Option<std::process::Child>>);

const BACKEND_ADDR: &str = "127.0.0.1:8765";

/// true si algo en `addr` responde a GET /health identificándose como
/// OpenWave. Un simple TCP connect no basta: cualquier proceso puede aceptar
/// la conexión y hacernos creer que nuestro backend está sano.
///
/// La respuesta se lee en BUCLE hasta encontrar el marcador (o agotar el
/// plazo global): una única `read()` se quedaba con lo primero que llegara y
/// un /health sano partido en dos paquetes parecía muerto — el falso negativo
/// que imprimía «no responde a /health» con la app y el backend vivos.
fn health_probe(addr: std::net::SocketAddr) -> bool {
    let Ok(mut stream) = std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500))
    else {
        return false;
    };
    if stream
        .set_read_timeout(Some(Duration::from_millis(400)))
        .is_err()
    {
        return false;
    }
    if stream
        .write_all(b"GET /health HTTP/1.0\r\nHost: 127.0.0.1:8765\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let deadline = std::time::Instant::now() + Duration::from_millis(1500);
    let mut acc: Vec<u8> = Vec::with_capacity(512);
    let mut buf = [0u8; 512];
    while std::time::Instant::now() < deadline {
        match stream.read(&mut buf) {
            // EOF sin el marcador: no es (o ya no está) nuestro backend.
            Ok(0) => break,
            Ok(n) => {
                acc.extend_from_slice(&buf[..n]);
                let head = String::from_utf8_lossy(&acc);
                if head.contains("\"service\":\"OpenWave\"") {
                    return head.starts_with("HTTP/1.0 200") || head.starts_with("HTTP/1.1 200");
                }
            }
            // Todavía no llega / paquete a medias: el plazo global decide.
            Err(ref e)
                if e.kind() == std::io::ErrorKind::TimedOut
                    || e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => return false,
        }
    }
    false
}

/// true si BACKEND_ADDR responde a /health como OpenWave (ver health_probe).
fn backend_responds_as_openwave() -> bool {
    let Ok(addr) = BACKEND_ADDR.parse::<std::net::SocketAddr>() else {
        return false;
    };
    health_probe(addr)
}

/// true si algo (cualquiera) está escuchando en BACKEND_ADDR.
fn port_in_use() -> bool {
    let Ok(addr) = BACKEND_ADDR.parse::<std::net::SocketAddr>() else {
        return false;
    };
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
}

/// Poll the backend health endpoint until it responds or timeout.
fn wait_for_backend(timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed().as_secs() < timeout_secs {
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
    if dir_writable(backend_dir) {
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

/// Carpetas de datos que se migran enteras.
const CARPETAS_MIGRACION: [&str; 3] = ["downloads", "lyrics", "stream_cache"];

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

/// Migra los datos de versiones anteriores (`origenes`) a `data_dir`.
///
/// Copia la base de datos (con sus `-wal`/`-shm`), la caché de URLs, las
/// descargas, las letras y la caché de stream. NO borra el origen (por si
/// algo sale mal se puede recuperar a mano) y NO pisa ficheros que ya estén
/// en destino. Al terminar escribe el marcador `MARCADOR_MIGRACION`, así la
/// siguiente arrancada no vuelve a copiar; si algo falla a mitad no se
/// escribe y se reintenta.
fn migrar_datos_heredados(
    data_dir: &std::path::Path,
    origenes: &[PathBuf],
) -> std::io::Result<usize> {
    let marcador = data_dir.join(MARCADOR_MIGRACION);
    if marcador.exists() {
        return Ok(0);
    }
    let con_datos: Vec<&PathBuf> = origenes.iter().filter(|o| o.is_dir()).collect();
    if con_datos.is_empty() {
        return Ok(0);
    }
    std::fs::create_dir_all(data_dir)?;

    let mut copiados = 0usize;
    for origen in &con_datos {
        for (fuente, destino) in FICHEROS_MIGRACION {
            let fichero_origen = origen.join(fuente);
            let fichero_destino = data_dir.join(destino);
            if fichero_origen.is_file() && !fichero_destino.exists() {
                std::fs::copy(&fichero_origen, &fichero_destino)?;
                copiados += 1;
            }
        }
        for carpeta in CARPETAS_MIGRACION {
            let carpeta_origen = origen.join(carpeta);
            if carpeta_origen.is_dir() {
                copiados += copiar_dir_sin_pisar(&carpeta_origen, &data_dir.join(carpeta))?;
            }
        }
    }

    let momento = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let marca = serde_json::json!({
        "origenes": con_datos.iter().map(|p| p.display().to_string()).collect::<Vec<_>>(),
        "copiados": copiados,
        "momento": momento,
    });
    std::fs::write(&marcador, marca.to_string())?;
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

/// Migra los datos heredados al directorio nuevo (una sola vez).
///
/// Se llama ANTES de arrancar el backend: si no, éste crearía su base de
/// datos vacía y la migración ya no tendría dónde meter los datos.
fn migrar_si_hace_falta(data_dir: &std::path::Path) {
    let origenes = raices_datos_heredados();
    if origenes.is_empty() {
        return;
    }
    match migrar_datos_heredados(data_dir, &origenes) {
        Ok(0) => {}
        Ok(n) => eprintln!(
            "[openwave] Migrados {n} ficheros de datos antiguos a {}",
            data_dir.display()
        ),
        Err(e) => eprintln!("[openwave] No se pudieron migrar los datos antiguos: {e}"),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            #[cfg_attr(not(target_os = "windows"), allow(unused_variables))]
            let window = match app.get_webview_window("main") {
                Some(w) => w,
                None => {
                    eprintln!("[openwave] No se pudo obtener la ventana principal");
                    return Ok(());
                }
            };

            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::{apply_mica, apply_tabbed};
                if apply_tabbed(&window, Some(true)).is_err() {
                    let _ = apply_mica(&window, Some(true));
                }
            }

            // ── Una sola instancia en BACKEND_ADDR ─────────────────────────
            // Si ya responde OpenWave: reutilizarla (nada de dos backends).
            // Si el puerto lo ocupa OTRO proceso: avisar claro — lanzar el
            // nuestro solo moriría con «Errno 98 address already in use».
            if port_in_use() {
                if backend_responds_as_openwave() {
                    eprintln!(
                        "[openwave] Ya hay una instancia de OpenWave en {BACKEND_ADDR}; se reutiliza (no se lanza otra)."
                    );
                } else {
                    eprintln!(
                        "[openwave] ERROR: {BACKEND_ADDR} está ocupado por OTRO proceso y no responde a /health. \
                         Ciérralo y vuelve a abrir OpenWave."
                    );
                }
                return Ok(());
            }

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

            // ── Directorio de datos único ──────────────────────────────────
            // Rust lo decide y se lo pasa al backend (OPENWAVE_DATA_DIR):
            // log, base de datos, descargas y backend.err.log viven juntos,
            // tanto en desarrollo (backend/) como instalados
            // (%PROGRAMDATA%\OpenWave en Program Files).
            let backend_dir = backend_path
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| PathBuf::from("."));
            let data_dir = resolve_data_dir(&backend_dir);

            // Datos de versiones anteriores (OpenWave actual y la marca
            // antigua SoundWave) al directorio nuevo, ANTES del spawn: si el
            // backend arranca primero crea su base de datos vacía y ya no
            // hay dónde meter los datos del usuario. Solo la primera vez
            // (marcador .migrated.json) y sin borrar el origen.
            migrar_si_hace_falta(&data_dir);

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

            let project_root = backend_dir.parent();
            let venv_python = project_root
                .map(|p| {
                    if cfg!(target_os = "windows") {
                        p.join("venv").join("Scripts").join("python.exe")
                    } else {
                        p.join("venv").join("bin").join("python")
                    }
                })
                .filter(|p| p.exists())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

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
                if py.is_empty() { continue; }
                let mut cmd = Command::new(py);
                cmd.arg(&backend_path);
                // Directorio del intérprete (y el ffmpeg empaquetado) al
                // frente del PATH para que yt-dlp hereda las herramientas.
                // ";" en Windows, ":" en el resto de plataformas.
                let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
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

                // En la app instalada (Windows release) no debe aparecer una
                // consola: stdout va al vacío (todo lo importante ya cae en
                // openwave.log) y stderr se guarda en backend.err.log para
                // poder diagnosticar un arranque roto.
                #[cfg(all(target_os = "windows", not(debug_assertions)))]
                {
                    use std::os::windows::process::CommandExt;
                    use std::process::Stdio;
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
                    Ok(c) => { child = Some(c); break; }
                    Err(_) => continue,
                }
            }

            let child = match child {
                Some(c) => c,
                None => {
                    eprintln!(
                        "[openwave] No se pudo iniciar el backend ({:?}): no se encontro Python", backend_path
                    );
                    return Ok(());
                }
            };

            match app.state::<BackendProcess>().0.lock() {
                Ok(mut guard) => {
                    *guard = Some(child);
                }
                Err(e) => {
                    eprintln!("[openwave] Error al bloquear BackendProcess: {e}");
                }
            }

            // Vigila si el backend propio muere y deja rastro en el log. El
            // frontend se entera por su sondeo de /health (banner de conexión).
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                let state = handle.state::<BackendProcess>();
                let Ok(mut guard) = state.0.lock() else {
                    break;
                };
                match guard.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(status)) => {
                            eprintln!("[openwave] El backend terminó ({status}).");
                            *guard = None;
                            break;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            eprintln!("[openwave] Error vigilando al backend: {e}");
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
            // El primer arranque con el runtime embebido tarda más: frío de
            // disco + importar yt-dlp/curl_cffi sin pyc.
            std::thread::spawn(move || {
                if !wait_for_backend(15) {
                    eprintln!(
                        "[openwave] El backend no respondió en 15s: la app abrirá igual y mostrará «sin conexión»."
                    );
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let child_opt = window
                    .app_handle()
                    .state::<BackendProcess>()
                    .0
                    .lock()
                    .ok()
                    .and_then(|mut guard| guard.take());
                if let Some(mut child) = child_opt {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("[openwave] Error al ejecutar la aplicación: {e}"));
}

#[cfg(test)]
mod tests {
    use super::health_probe;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    const OK_BODY: &str = "{\"service\":\"OpenWave\"}";

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

    // ── Directorio de datos: «Datos de Programas» (%PROGRAMDATA%) ──────────

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

    // ── Migración de datos heredados (OpenWave y la marca SoundWave) ───────

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
        assert_eq!(copiados, 8);

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
        assert!(destino.join("stream_cache").join("y.m4a").is_file());

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

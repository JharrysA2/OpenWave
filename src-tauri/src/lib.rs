use std::io::{Read, Write};
use std::process::Command;
use std::sync::Mutex;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

struct BackendProcess(Mutex<Option<std::process::Child>>);

const BACKEND_ADDR: &str = "127.0.0.1:8765";

/// true si algo en `addr` responde a GET /health identificándose como
/// SoundWave. Un simple TCP connect no basta: cualquier proceso puede aceptar
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
                if head.contains("\"service\":\"SoundWave\"") {
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

/// true si BACKEND_ADDR responde a /health como SoundWave (ver health_probe).
fn backend_responds_as_soundwave() -> bool {
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
        if backend_responds_as_soundwave() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

/// ¿Se puede escribir realmente dentro de `path`?
///
/// Espejo de `config._dir_escribible` del backend: se intenta crear un
/// archivo de prueba (en Program Files `CreateFile` es lo único que decide;
/// y `path` puede ni existir, en cuyo caso se mira su ancestro).
fn dir_writable(path: &std::path::Path) -> bool {
    use std::io::Write;
    let mut probe_dir = path.to_path_buf();
    while !probe_dir.exists() {
        match probe_dir.parent() {
            Some(parent) if parent != probe_dir => probe_dir = parent.to_path_buf(),
            _ => return false,
        }
    }
    if std::fs::create_dir_all(&probe_dir).is_err() {
        return false;
    }
    let probe = probe_dir.join(format!(".soundwave-write-test-{}", std::process::id()));
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
/// recibe `SOUNDWAVE_DATA_DIR` apuntando aquí y ya no decide por su cuenta
/// (así log, base de datos, descargas y `backend.err.log` coinciden).
///
/// Misma regla que `config._datos_dir`: env → código escribible (desarrollo)
/// → `%LOCALAPPDATA%\SoundWave` (instalación en Program Files) → XDG en Unix.
fn resolve_data_dir(backend_dir: &std::path::Path) -> PathBuf {
    if let Ok(d) = std::env::var("SOUNDWAVE_DATA_DIR") {
        if !d.is_empty() {
            return PathBuf::from(d);
        }
    }
    if dir_writable(backend_dir) {
        return backend_dir.to_path_buf();
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        return PathBuf::from(local).join("SoundWave");
    }
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        if !xdg.is_empty() {
            return PathBuf::from(xdg).join("SoundWave");
        }
    }
    match std::env::var("HOME") {
        Ok(home) => PathBuf::from(home).join(".local/share/SoundWave"),
        Err(_) => PathBuf::from("."),
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
                    eprintln!("[soundwave] No se pudo obtener la ventana principal");
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
            // Si ya responde SoundWave: reutilizarla (nada de dos backends).
            // Si el puerto lo ocupa OTRO proceso: avisar claro — lanzar el
            // nuestro solo moriría con «Errno 98 address already in use».
            if port_in_use() {
                if backend_responds_as_soundwave() {
                    eprintln!(
                        "[soundwave] Ya hay una instancia de SoundWave en {BACKEND_ADDR}; se reutiliza (no se lanza otra)."
                    );
                } else {
                    eprintln!(
                        "[soundwave] ERROR: {BACKEND_ADDR} está ocupado por OTRO proceso y no responde a /health. \
                         Ciérralo y vuelve a abrir SoundWave."
                    );
                }
                return Ok(());
            }

            let backend_path: PathBuf = if cfg!(debug_assertions) {
                let manifest_dir = match option_env!("CARGO_MANIFEST_DIR") {
                    Some(d) => PathBuf::from(d),
                    None => {
                        eprintln!("[soundwave] CARGO_MANIFEST_DIR no definido");
                        return Ok(());
                    }
                };
                match manifest_dir.parent() {
                    Some(p) => p.join("backend").join("main.py"),
                    None => {
                        eprintln!("[soundwave] No se pudo resolver backend path");
                        return Ok(());
                    }
                }
            } else {
                match app.path().resource_dir() {
                    Ok(dir) => dir.join("backend").join("main.py"),
                    Err(e) => {
                        eprintln!("[soundwave] resource dir not found: {e}");
                        return Ok(());
                    }
                }
            };

            // ── Directorio de datos único ──────────────────────────────────
            // Rust lo decide y se lo pasa al backend (SOUNDWAVE_DATA_DIR):
            // log, base de datos, descargas y backend.err.log viven juntos,
            // tanto en desarrollo (backend/) como instalados
            // (%LOCALAPPDATA%\SoundWave en Program Files).
            let backend_dir = backend_path
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| PathBuf::from("."));
            let data_dir = resolve_data_dir(&backend_dir);

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
                cmd.env("SOUNDWAVE_DATA_DIR", &data_dir);

                // En la app instalada (Windows release) no debe aparecer una
                // consola: stdout va al vacío (todo lo importante ya cae en
                // soundwave.log) y stderr se guarda en backend.err.log para
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
                        "[soundwave] No se pudo iniciar el backend ({:?}): no se encontro Python", backend_path
                    );
                    return Ok(());
                }
            };

            match app.state::<BackendProcess>().0.lock() {
                Ok(mut guard) => {
                    *guard = Some(child);
                }
                Err(e) => {
                    eprintln!("[soundwave] Error al bloquear BackendProcess: {e}");
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
                            eprintln!("[soundwave] El backend terminó ({status}).");
                            *guard = None;
                            break;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            eprintln!("[soundwave] Error vigilando al backend: {e}");
                            break;
                        }
                    },
                    None => break,
                }
            });

            // Esperar hasta que el backend pase el health check real o 15s
            // (el primer arranque con el runtime embebido tarda más: frío de
            // disco + importar yt-dlp/curl_cffi sin pyc).
            if !wait_for_backend(15) {
                eprintln!(
                    "[soundwave] El backend no respondió en 15s: la app abrirá igual y mostrará «sin conexión»."
                );
            }

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
        .unwrap_or_else(|e| eprintln!("[soundwave] Error al ejecutar la aplicación: {e}"));
}

#[cfg(test)]
mod tests {
    use super::health_probe;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    const OK_BODY: &str = "{\"service\":\"SoundWave\"}";

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
    fn respuesta_fragmentada_sigue_siendo_soundwave() {
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
}

use std::io::{Read, Write};
use std::process::Command;
use std::sync::Mutex;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

struct BackendProcess(Mutex<Option<std::process::Child>>);

const BACKEND_ADDR: &str = "127.0.0.1:8765";

/// true si algo en BACKEND_ADDR responde a GET /health identificándose como
/// SoundWave. Un simple TCP connect no basta: cualquier proceso puede aceptar
/// la conexión y hacernos creer que nuestro backend está sano.
fn backend_responds_as_soundwave() -> bool {
    let Ok(addr) = BACKEND_ADDR.parse::<std::net::SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500))
    else {
        return false;
    };
    if stream
        .set_read_timeout(Some(Duration::from_millis(800)))
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
    let mut buf = [0u8; 512];
    let n = stream.read(&mut buf).unwrap_or(0);
    if n == 0 {
        return false;
    }
    let head = String::from_utf8_lossy(&buf[..n]);
    (head.starts_with("HTTP/1.0 200") || head.starts_with("HTTP/1.1 200"))
        && head.contains("\"service\":\"SoundWave\"")
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

            // Candidatos en orden: venv del proyecto → python → python3 → py.
            // El venv va primero: su intérprete ya tiene las dependencias del
            // backend (fastapi, httpx, yt-dlp, ...).
            let project_root = backend_path.parent().and_then(|p| p.parent());
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

            let python_paths = [
                venv_python,
                "python".to_string(),
                "python3".to_string(),
                "py".to_string(),
            ];

            let mut child = None;
            for py in &python_paths {
                if py.is_empty() { continue; }
                let mut cmd = Command::new(py);
                cmd.arg(&backend_path);
                // Si el candidato resolvió a una ruta con directorio (venv),
                // su carpeta va al frente del PATH para que yt-dlp y ffmpeg
                // hereden las herramientas del proyecto. El separador del PATH
                // es ";" en Windows y ":" en el resto de plataformas.
                let py_path = std::path::Path::new(py.as_str());
                if let Some(dir) = py_path.parent() {
                    if !dir.as_os_str().is_empty() {
                        let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
                        let old = std::env::var("PATH").unwrap_or_default();
                        cmd.env("PATH", format!("{}{}{}", dir.display(), sep, old));
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

            // Esperar hasta que el backend pase el health check real o 8s
            if !wait_for_backend(8) {
                eprintln!(
                    "[soundwave] El backend no respondió en 8s: la app abrirá igual y mostrará «sin conexión»."
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

use std::process::Command;
use std::sync::Mutex;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

struct BackendProcess(Mutex<Option<std::process::Child>>);

/// Poll the backend health endpoint until it responds or timeout.
fn wait_for_backend(timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    let addr: std::net::SocketAddr = match "127.0.0.1:8765".parse() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("[soundwave] Invalid backend address: {e}");
            return false;
        }
    };
    while start.elapsed().as_secs() < timeout_secs {
        match std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500)) {
            Ok(_) => return true,
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
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

            // Try multiple Python executables: python → python3 → py → venv python
            let python_paths = [
                "python".to_string(),
                "python3".to_string(),
                "py".to_string(),
                // venv Python for this project
                backend_path.parent()
                    .and_then(|p| p.parent())
                    .map(|p| p.join("venv").join("Scripts").join("python.exe").to_string_lossy().to_string())
                    .unwrap_or_default(),
            ];

            let mut child = None;
            for py in &python_paths {
                if py.is_empty() { continue; }
                match Command::new(py).arg(&backend_path).spawn() {
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

            // Esperar hasta que el backend responda (health check) o 8s timeout
            if !wait_for_backend(8) {
                eprintln!("[soundwave] Backend no respondió después de 8s, continuando de todas formas");
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

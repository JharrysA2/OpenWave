#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Fija el AppUserModelID ANTES de crear la ventana/WebView: sin él Windows
/// agrupa los procesos de WebView2 como «Administrador de WebView2» en vez de
/// «OpenWave». La clave HKCU AppUserModelId\com.soundwave.app la crea el
/// instalador; en desarrollo basta el AUMID del proceso.
#[cfg(windows)]
fn set_appusermodel_id() {
    use windows::core::w;
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    // El identificador es el mismo que `bundle.identifier` en
    // tauri.conf.json (com.soundwave.app): mantenerlos sincronizados.
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(w!("com.soundwave.app"));
    }
}

fn main() {
    #[cfg(windows)]
    set_appusermodel_id();
    #[cfg(target_os = "linux")]
    aplicar_workarounds_webkit();
    app_lib::run();
}

/// true si hay un GPU NVIDIA en el sistema (vendor `0x10de` o driver `nvidia`).
/// Se mira todo `/sys/class/drm`: en las híbridas la iGPU no es NVIDIA pero la
/// discreta sí, y es ella la que pilota el webview.
#[cfg(target_os = "linux")]
fn hay_gpu_nvidia() -> bool {
    let Ok(entradas) = std::fs::read_dir("/sys/class/drm") else {
        return false;
    };
    for entrada in entradas.flatten() {
        if !entrada.file_name().to_string_lossy().starts_with("card") {
            continue;
        }
        let device = entrada.path().join("device");
        if let Ok(vendor) = std::fs::read_to_string(device.join("vendor")) {
            if vendor.trim() == "0x10de" {
                return true;
            }
        }
        if let Ok(driver) = std::fs::read_link(device.join("driver")) {
            if driver.file_name().is_some_and(|nombre| nombre == "nvidia") {
                return true;
            }
        }
    }
    false
}

/// Backend gráfico de la sesión: `Some(true)` Wayland, `Some(false)` X11,
/// `None` si no se puede saber. `GDK_BACKEND` manda porque es lo que GTK/
/// WebKitGTK van a elegir realmente (lista coma-separada, el primero
/// reconocido gana).
#[cfg(target_os = "linux")]
fn sesion_wayland() -> Option<bool> {
    if let Ok(backends) = std::env::var("GDK_BACKEND") {
        for backend in backends.split(',').map(str::trim) {
            if backend.eq_ignore_ascii_case("wayland") {
                return Some(true);
            }
            if backend.eq_ignore_ascii_case("x11") {
                return Some(false);
            }
        }
    }
    if let Ok(tipo) = std::env::var("XDG_SESSION_TYPE") {
        if tipo.eq_ignore_ascii_case("wayland") {
            return Some(true);
        }
        if tipo.eq_ignore_ascii_case("x11") {
            return Some(false);
        }
    }
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        return Some(true);
    }
    if std::env::var_os("DISPLAY").is_some() {
        return Some(false);
    }
    None
}

/// Workarounds de WebKitGTK para el driver NVIDIA, ANTES de crear la ventana:
/// el proceso de UI y el `WebKitWebProcess` hijo heredan el entorno.
///
///  - **X11**: el renderer DMABUF deja la ventana en blanco → se desactiva.
///  - **Wayland**: el DMABUF incumple la regla de acquire-point de los
///    composidores (Hyprland responde matando al cliente con «Error 71») y su
///    ruta EGL/GBM con NVIDIA puede hacer SIGSEGV; el sync explícito
///    intermitente, además, presenta buffers sin inicializar (frames negros o
///    basura al cambiar de pantalla). Por eso se apagan DMABUF y el sync
///    explícito de NVIDIA.
///
/// Si la persona ya fijó alguna de las variables, no se toca nada (su
/// configuración manda). Si aun así parpadean los overlays de Letras/modales,
/// queda el paliativo `WEBKIT_DISABLE_COMPOSITING_MODE=1` (docs/linux.md).
#[cfg(target_os = "linux")]
fn aplicar_workarounds_webkit() {
    if !hay_gpu_nvidia() {
        return;
    }
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some()
        || std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_some()
    {
        return;
    }
    match sesion_wayland() {
        Some(true) => {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
        Some(false) => {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        None => {}
    }
}

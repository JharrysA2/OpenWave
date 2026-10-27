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
    {
        if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "0");
        }
    }
    app_lib::run();
}

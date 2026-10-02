#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Fija el AppUserModelID del proceso ANTES de crear la ventana/WebView.
///
/// Sin esto, Windows agrupa los procesos de WebView2 como «Microsoft Edge
/// WebView2» («Administrador de WebView2») en el Administrador de Tareas y
/// en la barra de tareas. Con el AUMID puesto, el runtime de WebView2
/// hereda `com.soundwave.app` y todos sus procesos aparecen como «OpenWave»
/// con su icono (la clave HKCU AppUserModelId\com.soundwave.app con
/// DisplayName/IconUri la crea el instalador; en desarrollo basta con el
/// AUMID del proceso). Hay que hacerlo ANTES de arrancar WebView2.
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
    app_lib::run();
}

#[cfg(windows)]
fn main() {
    // El exe lleva el elemento <msix> que lo conecta con
    // packaging/appx/AppxManifest.xml; sin él, los hijos de WebView2 pierden
    // la identidad de paquete y el Administrador de Tareas los agrupa aparte.
    // app_manifest() reemplaza el manifiesto por defecto de Tauri, por eso
    // app.manifest vuelve a declarar comctl32 v6.
    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("../packaging/appx/app.manifest"));
    let attrs = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attrs).expect("tauri-build (con app.manifest de identidad) ha fallado");
}

#[cfg(not(windows))]
fn main() {
    tauri_build::build()
}

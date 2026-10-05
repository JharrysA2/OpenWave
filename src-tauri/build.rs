#[cfg(windows)]
fn main() {
    // Paquete sparse de identidad (plan C): el exe lleva el elemento <msix>
    // que lo conecta con packaging/appx/AppxManifest.xml. Sin el, los
    // procesos hijos de WebView2 no heredan identidad de paquete y el
    // Administrador de Tareas los vuelve a agrupar en «Administrador de
    // WebView2» (bug MicrosoftEdge/WebView2Feedback#5628). Ver
    // docs/PERFORMANCE.md §9.3.
    //
    // WindowsAttributes::new() ya incluye el manifiesto por defecto de Tauri
    // (comctl32 v6 para los dialogos); app_manifest() lo REPLAZA, por eso
    // packaging/appx/app.manifest vuelve a declarar ese dependency.
    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("../packaging/appx/app.manifest"));
    let attrs = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attrs).expect("tauri-build (con app.manifest de identidad) ha fallado");
}

#[cfg(not(windows))]
fn main() {
    tauri_build::build()
}

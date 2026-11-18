import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const isLinux = () => typeof navigator !== "undefined" && /Linux/i.test(navigator.userAgent || "");
const isTauri = () =>
  typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);

/**
 * Decide si la app pinta su barra de título personalizada.
 *
 * Windows y el desarrollo en Linux la conservan. En paquetes Linux
 * instalados se oculta: Hyprland deja la ventana sin marco y los escritorios
 * normales recuperan la barra nativa del sistema desde Rust.
 */
export function useWindowChrome() {
  const [customTitleBar, setCustomTitleBar] = useState(() => !(isTauri() && isLinux()));

  useEffect(() => {
    if (!isTauri()) return undefined;
    let cancelled = false;
    invoke("window_environment")
      .then((info) => {
        if (!cancelled) setCustomTitleBar(info?.customTitleBar !== false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return customTitleBar;
}

import "./dynamic-theme.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

/**
 * Retira el splash estático (index.html) tras el primer paint de React:
 * doble requestAnimationFrame (garantiza que el primer render ya está pintado)
 * → clase `splash-exit` (fade-out 0.32s) → remove(). Sin <script> inline en
 * index.html (CSP `script-src 'self'`).
 */
function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("splash-exit");
  splash.addEventListener("transitionend", () => splash.remove(), { once: true });
  // Red de seguridad por si no llega el evento de transición
  setTimeout(() => splash.remove(), 700);
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Tras el primer paint de React (rAF en el siguiente frame = ya pintado)
requestAnimationFrame(() => requestAnimationFrame(dismissSplash));

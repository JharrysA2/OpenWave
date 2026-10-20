import React from "react";
import { Logo } from "./Logo";
import { winCtrl } from "../utils/windowControls";

/**
 * Barra de título propia (la ventana no lleva marco nativo).
 *
 * Material: el mismo vocabulario que el resto de la app —cristal estático,
 * brillo interior arriba y una sombra fina de separación—, sin
 * `backdrop-filter`: no hay movimiento detrás, así que el desenfoque sería
 * coste invisible. Los tres iconos van dibujados a trazo (1,3 px, extremos
 * redondeados) en un viewBox de 16 px para que se vean nítidos a cualquier
 * escala; los botones son pastillas cuadradas con el radio de la UI, no los
 * rectángulos pegados al borde del marco de Windows.
 */

const CONTROLS = [
  {
    key: "min",
    title: "Minimizar",
    onClick: winCtrl.minimize,
    icon: <path d="M3.4 8.4h9.2" />,
  },
  {
    key: "max",
    title: "Maximizar",
    onClick: winCtrl.maximize,
    icon: <rect x="3.3" y="3.3" width="9.4" height="9.4" rx="2.3" />,
  },
  {
    key: "close",
    title: "Cerrar",
    onClick: winCtrl.close,
    close: true,
    icon: <path d="M4.7 4.7l6.6 6.6M11.3 4.7l-6.6 6.6" />,
  },
];

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="app-titlebar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "32px",
        flexShrink: 0,
        padding: "0 8px 0 12px",
        userSelect: "none",
        WebkitUserSelect: "none",
        position: "relative",
        // ⭐ SIEMPRE visible, pase lo que pase por delante: por encima del
        //    splash (#splash z=2147483000, pre-React), del BootScreen de
        //    carga (1500000), de modales/hojas (1000000+) y de las letras
        //    (9999). Es la chrome de ventana: min/max/cerrar nunca se tapa.
        zIndex: 2147483100,
        background:
          "linear-gradient(180deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.035) 55%, rgba(255,255,255,.02) 100%)",
        // Separación por luz y sombra, no por contorno: brillo de 1 px arriba,
        // hairline oscura abajo y la sombra de zona de siempre, más contenida.
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.07), " +
          "inset 0 -1px 0 rgba(0,0,0,.32), " +
          "0 10px 28px rgba(0,0,0,.30)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
        <Logo size={15} testId="titlebar-logo" />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: ".35px",
            lineHeight: 1,
            color: "rgba(255,255,255,.72)",
            whiteSpace: "nowrap",
          }}
        >
          Open
          <span style={{ color: "color-mix(in srgb, var(--neon) 70%, #fff)" }}>Wave</span>
        </span>
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        {CONTROLS.map(({ key, title, onClick, icon, close }) => (
          <button
            key={key}
            onClick={onClick}
            title={title}
            aria-label={title}
            style={{
              width: "32px",
              height: "26px",
              padding: 0,
              background: "transparent",
              border: "none",
              borderRadius: "8px",
              color: "rgba(255,255,255,.5)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition:
                "background .12s cubic-bezier(.16,1,.3,1), color .12s cubic-bezier(.16,1,.3,1)",
              flexShrink: 0,
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.background = close ? "#c93c41" : "rgba(255,255,255,.16)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.background = close ? "#e5484d" : "rgba(255,255,255,.10)";
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = close ? "#e5484d" : "rgba(255,255,255,.10)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,.5)";
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {icon}
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

export default TitleBar;

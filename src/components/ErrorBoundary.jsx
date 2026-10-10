import React from "react";
import { FONT } from "../constants";
import { SettingsContext } from "../contexts/SettingsContext";
import { GLASS, RADIUS, TYPOGRAPHY } from "../utils/theme";

/**
 * Fallback amigable ante un error de render (Liquid Glass, blanco y negro).
 *
 * El detalle técnico (mensaje + componentStack) va SOLO a consola: al usuario
 * se le muestra una tarjeta de vidrio oscura con título, explicación y botón
 * «Recargar app» — sin stacks rojos ni fondos de pánico (petición: errores
 * con estilo liquid glass, solo negro o blanco).
 *
 * `static contextType` (clase → no hooks): fuera de `<SettingsProvider>`
 * `this.context` es null y se cae a los textos en español.
 */
export class ErrorBoundary extends React.Component {
  static contextType = SettingsContext;

  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(e) {
    return { error: e };
  }

  componentDidCatch(error, info) {
    console.error(
      "[OpenWave] Runtime error:",
      error,
      info?.componentStack ? `\n${info.componentStack}` : "",
    );
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const t = this.context?.t || {};
      return (
        <div
          data-testid="error-boundary-fallback"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "#0a0a0d",
            fontFamily: FONT,
          }}
        >
          <div
            style={{
              ...GLASS.popup,
              backdropFilter: "none",
              WebkitBackdropFilter: "none",
              background: "linear-gradient(135deg, rgba(18,18,20,.96), rgba(0,0,0,.92))",
              border: "1px solid rgba(255,255,255,.28)",
              borderRadius: RADIUS.card,
              padding: "36px 32px",
              maxWidth: "420px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: "14px",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontSize: "22px",
              }}
            >
              !
            </div>
            <h2 style={{ ...TYPOGRAPHY.h2, color: "#ffffff", margin: 0 }}>
              {t.crashTitle || "Algo salió mal"}
            </h2>
            <p
              style={{
                ...TYPOGRAPHY.body,
                color: "rgba(255,255,255,.78)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t.crashMessage ||
                "La app encontró un error inesperado. Recarga para volver a empezar."}
            </p>
            <button
              onClick={this.handleReload}
              data-testid="error-boundary-reload"
              style={{
                marginTop: "6px",
                padding: "10px 26px",
                borderRadius: RADIUS.pill,
                border: "1px solid rgba(255,255,255,.65)",
                background: "#ffffff",
                color: "#0a0a0d",
                fontWeight: "700",
                fontSize: "13.5px",
                fontFamily: FONT,
                cursor: "pointer",
              }}
            >
              {t.crashReload || "Recargar app"}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

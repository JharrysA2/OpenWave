import React from "react";

/**
 * OpenWave — Logo de la app
 *
 * La marca vive en `public/` generada desde `src-tauri/icons/128x128@2x.png`
 * (el mismo arte que el icono de Windows), partida en dos máscaras:
 *
 *   - `logo-plate.png` — la silueta (rect redondeado)
 *   - `logo-mark.png`  — solo el glifo
 *
 * Se pintan por separado con CSS mask para que el logo SIGA EL TEMA DINÁMICO:
 * la placa con `var(--neon)` y la marca con `var(--neon-fg)`, los mismos
 * tokens que usan botones y chips. Así el logo cambia de color en sincronía
 * con la canción (la interpolación la hace `transition: --neon` en :root, no
 * hay que animar nada aquí) y la marca mantiene siempre ≥4.5:1 de contraste
 * contra la placa — un blanco fijo daría 2.70:1 sobre el acento por defecto
 * y sería invisible con acentos acromáticos (#ffffff).
 */
export const Logo = React.memo(function Logo({ size = 26, testId = "app-logo" }) {
  const mask = (url) => ({
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  });

  return (
    <span
      data-testid={testId}
      aria-hidden="true"
      style={{
        display: "block",
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: "var(--neon)",
        ...mask("/logo-plate.png"),
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "var(--neon-fg, #000001)",
          ...mask("/logo-mark.png"),
        }}
      />
    </span>
  );
});

export default Logo;

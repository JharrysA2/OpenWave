import React from "react";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { COLORS, GLASS, LAYOUTS, TRANSITIONS, ANIMATIONS } from "../utils/theme";

/**
 * Tarjeta de álbum horizontal (SearchView/ArtistView).
 * `subtitle` es texto ya formateado por el caller; `animationDelay` en ms.
 */
export default React.memo(function AlbumCardRow({
  album,
  minWidth = 130,
  animationDelay = 200,
  subtitle,
  onClick,
  onOptions,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 172px",
        ...ANIMATIONS.fadeSlideUp(animationDelay),
        ...LAYOUTS.albumCard,
        // Sin backdrop-filter por tarjeta (regresión de rendimiento, mismo
        // criterio que LibraryCard): cada fila creaba su propio backdrop root
        // sobre la portada; sobre fondo plano el blur era imperceptible.
        backdropFilter: undefined,
        WebkitBackdropFilter: undefined,
        minWidth,
        transition: `${TRANSITIONS.fast}, transform .12s ease`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = GLASS.cardHover.background;
        e.currentTarget.style.borderColor = GLASS.cardHover.borderColor;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = GLASS.card.background;
        e.currentTarget.style.borderColor = GLASS.card.borderColor;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ position: "relative" }}>
        <MusicCover
          thumbnails={album.thumbnails}
          src={album.thumbnail}
          displaySize={160}
          alt={album.title}
          style={{ width: "100%", aspectRatio: "1" }}
        />
        {onOptions && (
          <button
            title="Más opciones"
            onClick={(e) => {
              e.stopPropagation();
              onOptions(album);
            }}
            style={{
              position: "absolute",
              right: "6px",
              top: "6px",
              background: "rgba(0,0,0,.55)",
              border: "1px solid rgba(255,255,255,.18)",
              borderRadius: "999px",
              width: "30px",
              height: "30px",
              cursor: "pointer",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              // Sin backdrop-filter por fila (regresión de rendimiento): cada
              // botón ⋮ creaba su propio backdrop root sobre la portada.
              transition: "all .15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0,0,0,.75)";
              e.currentTarget.style.transform = "scale(1.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0,0,0,.55)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {Ic.dots}
          </button>
        )}
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: "800",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: COLORS.textPrimary,
          }}
        >
          {album.title}
        </div>
        <div
          style={{
            fontSize: "10px",
            color: COLORS.textTertiary,
            fontWeight: "600",
            marginTop: "2px",
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
});

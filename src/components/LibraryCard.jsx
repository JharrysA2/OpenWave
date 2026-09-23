import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { COLORS, GLASS, LAYOUTS, RADIUS, TRANSITIONS, ANIMATIONS } from "../utils/theme";

function CardButton({ children, onClick, title, style }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{
        background: "rgba(0,0,0,.55)",
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: RADIUS.full,
        width: "34px",
        height: "34px",
        cursor: "pointer",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        backdropFilter: "blur(6px)",
        transition: "all .15s ease",
        ...style,
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
      {children}
    </button>
  );
}

/** Tarjeta de álbum en grid (Me gusta/Descargas). Imagen cuadrada + ▶ + ⋮. */
export const AlbumGridCard = React.memo(function AlbumGridCard({
  album,
  accentColor = "#fff",
  subtitle,
  onClick,
  onPlay,
  onOptions,
  animationDelay = 0,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 220px",
        ...ANIMATIONS.fadeSlideUp(animationDelay),
        ...LAYOUTS.albumCard,
        minWidth: 0,
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
          displaySize={240}
          alt={album.title}
          style={{ width: "100%", aspectRatio: "1" }}
        />
        {onPlay && (
          <div
            style={{
              position: "absolute",
              right: "8px",
              bottom: "8px",
            }}
          >
            <CardButton
              title="Reproducir"
              onClick={onPlay}
              style={{
                background: accentColor,
                borderColor: accentColor,
                color: COLORS.black,
                width: "40px",
                height: "40px",
                boxShadow: `0 4px 16px ${accentColor}66`,
              }}
            >
              {Ic.play(18)}
            </CardButton>
          </div>
        )}
        {onOptions && (
          <div style={{ position: "absolute", right: "6px", top: "6px" }}>
            <CardButton title="Más opciones" onClick={onOptions}>
              {Ic.dots}
            </CardButton>
          </div>
        )}
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <div
          style={{
            fontSize: "12.5px",
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
            fontSize: "10.5px",
            color: COLORS.textTertiary,
            fontWeight: "600",
            marginTop: "2px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
});

/** Tarjeta de artista en grid (Me gusta ▸ Artistas). Foto circular + ⋮. */
export const ArtistGridCard = React.memo(function ArtistGridCard({
  artist,
  subtitle,
  onClick,
  onOptions,
  animationDelay = 0,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 200px",
        ...ANIMATIONS.fadeSlideUp(animationDelay),
        ...GLASS.card,
        borderRadius: RADIUS.card,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        padding: "16px 10px 12px",
        cursor: "pointer",
        position: "relative",
        minWidth: 0,
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
        <div style={LAYOUTS.circularCover("110px")}>
          <MusicCover
            thumbnails={artist.thumbnails}
            src={artist.thumbnail}
            displaySize={130}
            alt={artist.name}
            style={{ width: "110px", height: "110px" }}
          />
        </div>
        {onOptions && (
          <div style={{ position: "absolute", right: "-4px", top: "-4px" }}>
            <CardButton title="Más opciones" onClick={onOptions}>
              {Ic.dots}
            </CardButton>
          </div>
        )}
      </div>
      <div style={{ textAlign: "center", minWidth: 0, width: "100%" }}>
        <div
          style={{
            fontSize: "12.5px",
            fontWeight: "800",
            color: COLORS.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {artist.name}
        </div>
        <div
          style={{
            fontSize: "10.5px",
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

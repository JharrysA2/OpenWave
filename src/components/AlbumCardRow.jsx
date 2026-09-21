import React from "react";
import { MusicCover } from "./MusicCover";
import { COLORS, GLASS, LAYOUTS, TRANSITIONS, ANIMATIONS } from "../utils/theme";

/**
 * Tarjeta de álbum horizontal (SearchView/ArtistView).
 * `subtitle` es texto ya formateado por el caller; `animationDelay` en ms.
 */
export default React.memo(function AlbumCardRow({ album, minWidth = 130, animationDelay = 200, subtitle, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 172px",
        ...ANIMATIONS.fadeSlideUp(animationDelay),
        ...LAYOUTS.albumCard,
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
      <MusicCover
        thumbnails={album.thumbnails}
        src={album.thumbnail}
        displaySize={160}
        alt={album.title}
        style={{ width: "100%", aspectRatio: "1" }}
      />
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

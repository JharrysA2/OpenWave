import React from "react";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { fmtTime } from "../utils/formatTime";
import { COLORS, TRANSITIONS, LAYOUTS, ANIMATIONS, safeAccentText } from "../utils/theme";

/**
 * Fila de canción estándar (variante glass con LAYOUTS.songRow).
 * Centraliza el patrón de SearchView/LikedView/HistoryView/DownloadsView.
 * Props opcionales añaden duración, corazón, badge y menú de 3 puntos.
 */
export default React.memo(function SongRow({
  song,
  isActive = false,
  accentColor,
  onClick,
  index = 0,
  coverSrc,
  subtitle,
  showDuration = false,
  onToggleLike,
  liked = false,
  badge,
  onOpenOptions,
  style = {},
}) {
  return (
    <div
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 60px",
        ...ANIMATIONS.staggerFast(index),
        ...LAYOUTS.songRow(isActive, accentColor),
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = LAYOUTS.songRowHover.background;
          e.currentTarget.style.borderColor = LAYOUTS.songRowHover.borderColor;
          e.currentTarget.style.boxShadow = LAYOUTS.songRowHover.boxShadow;
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = "transparent";
          e.currentTarget.style.boxShadow = "none";
        }
      }}
    >
      <div style={LAYOUTS.listCover}>
        <MusicCover
          thumbnails={song.thumbnails}
          src={coverSrc || song.thumbnail}
          displaySize={50}
          alt=""
          style={{ width: "40px", height: "40px" }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "13.5px",
            fontWeight: "700",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: isActive ? safeAccentText(accentColor) : COLORS.textPlayerTitle,
          }}
        >
          {song.title}
        </div>
        <div
          style={{
            fontSize: "11.5px",
            color: COLORS.textTertiary,
            fontWeight: "600",
            marginTop: "1px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitle != null ? subtitle : song.artist}
        </div>
      </div>
      {showDuration && song.duration > 0 && (
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            color: COLORS.textMuted,
            flexShrink: 0,
          }}
        >
          {fmtTime(song.duration)}
        </span>
      )}
      {badge}
      {onToggleLike && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike(song.videoId, song);
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: liked ? COLORS.likeColor : COLORS.iconDimmer,
            display: "flex",
            padding: "4px",
            transition: TRANSITIONS.fast,
          }}
        >
          {Ic.heart(liked, 16)}
        </button>
      )}
      {onOpenOptions && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenOptions(song);
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: COLORS.iconDefault,
            display: "flex",
            padding: "4px",
          }}
        >
          {Ic.dots}
        </button>
      )}
    </div>
  );
});

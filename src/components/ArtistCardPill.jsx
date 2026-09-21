import React from "react";
import { MusicCover } from "./MusicCover";
import { GLASS, LAYOUTS, RADIUS, SPACING, TRANSITIONS, ANIMATIONS } from "../utils/theme";

/**
 * Pill circular de artista (SearchView/ArtistView).
 * `leaveBackground`/`leaveBorder` permiten que cada vista defina su estado
 * de reposo (Search: transparente; Artist: GLASS.card).
 */
export default React.memo(function ArtistCardPill({
  artist,
  animationDelay = 0,
  leaveBackground = "transparent",
  leaveBorder = "transparent",
  onClick,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 104px",
        ...ANIMATIONS.fadeSlideUp(animationDelay),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: SPACING.gap.tight,
        minWidth: "80px",
        cursor: "pointer",
        padding: "8px",
        borderRadius: RADIUS.card,
        transition: TRANSITIONS.fast,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = GLASS.cardHover.background;
        e.currentTarget.style.borderColor = GLASS.cardHover.borderColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = leaveBackground;
        e.currentTarget.style.borderColor = leaveBorder;
      }}
    >
      <div style={LAYOUTS.circularCover("72px")}>
        <MusicCover
          src={artist.thumbnail}
          displaySize={80}
          alt={artist.name}
          style={{ width: "72px", height: "72px" }}
        />
      </div>
      <span
        style={{
          fontSize: "11.5px",
          fontWeight: "700",
          color: "rgba(255,255,255,.8)",
          textAlign: "center",
          maxWidth: "80px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {artist.name}
      </span>
    </div>
  );
});

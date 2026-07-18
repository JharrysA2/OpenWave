import React from "react";

/**
 * SkeletonLoader — Shimmer loading placeholder
 * Matches the layout of the final content to prevent layout shift.
 *
 * Usage:
 *   <SkeletonSongRow />      — for song list items
 *   <SkeletonCard />         — for album/artist cards
 *   <SkeletonGrid count={6} /> — for card grids
 */

// ── Base skeleton block ─────────────────────────────────────────────────────
function Bone({ width, height, borderRadius, style }) {
  return (
    <div
      className="skeleton"
      style={{
        width: width || "100%",
        height: height || "14px",
        borderRadius: borderRadius || "6px",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

// ── Song row skeleton — matches the real song row layout ────────────────────
export function SkeletonSongRow() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 10px",
        borderRadius: "12px",
      }}
    >
      {/* Cover */}
      <Bone width="40px" height="40px" borderRadius="8px" />
      {/* Title + Artist */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
        <Bone width="70%" height="13px" />
        <Bone width="45%" height="11px" />
      </div>
      {/* Duration */}
      <Bone width="30px" height="11px" />
    </div>
  );
}

// ── Album/Artist card skeleton — matches the real card layout ───────────────
export function SkeletonCard() {
  return (
    <div
      style={{
        minWidth: "140px",
        borderRadius: "14px",
        overflow: "hidden",
        background: "rgba(255,255,255,.03)",
      }}
    >
      {/* Cover */}
      <Bone
        width="100%"
        height="0"
        borderRadius="0"
        style={{ aspectRatio: "1", paddingBottom: "100%" }}
      />
      {/* Title + Subtitle */}
      <div
        style={{ padding: "8px 10px 12px", display: "flex", flexDirection: "column", gap: "6px" }}
      >
        <Bone width="80%" height="12px" />
        <Bone width="55%" height="10px" />
      </div>
    </div>
  );
}

// ── Grid of card skeletons ──────────────────────────────────────────────────
export function SkeletonGrid({ count = 6 }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "12px",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── Horizontal scroll skeleton (for artist/album rows) ──────────────────────
export function SkeletonHorizontalRow({ count = 5 }) {
  return (
    <div style={{ display: "flex", gap: "12px", overflowX: "hidden" }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── Section header skeleton ─────────────────────────────────────────────────
export function SkeletonSection() {
  return (
    <div style={{ marginBottom: "24px" }}>
      <Bone width="120px" height="12px" style={{ marginBottom: "12px" }} />
      <SkeletonGrid count={6} />
    </div>
  );
}

// ── Full page skeleton for search/home ──────────────────────────────────────
export function SkeletonPage() {
  return (
    <div style={{ padding: "16px 20px" }}>
      {/* Search bar */}
      <Bone height="44px" borderRadius="12px" style={{ marginBottom: "20px" }} />
      {/* Section header */}
      <Bone width="100px" height="14px" style={{ marginBottom: "12px" }} />
      {/* Song rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonSongRow key={i} />
      ))}
    </div>
  );
}

// ── Album page skeleton — hero banner + overlapping cover + track list ──────
export function SkeletonAlbumView() {
  return (
    <div style={{ fontFamily: "inherit", height: "100%", overflowY: "auto" }}>
      {/* Hero banner */}
      <div style={{ position: "relative", width: "100%", height: "260px", overflow: "hidden" }}>
        <Bone
          width="100%"
          height="100%"
          borderRadius="0"
          style={{ position: "absolute", inset: 0 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,.3) 0%, rgba(0,0,0,.85) 100%)",
          }}
        />
      </div>
      {/* Overlapping cover + info */}
      <div
        style={{
          position: "relative",
          padding: "0 22px",
          marginTop: "-85px",
          zIndex: 1,
          display: "flex",
          gap: "20px",
          alignItems: "flex-end",
        }}
      >
        <Bone width="165px" height="165px" borderRadius="14px" style={{ flexShrink: 0 }} />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            paddingBottom: "10px",
          }}
        >
          <Bone width="50px" height="11px" borderRadius="4px" />
          <Bone width="90%" height="26px" borderRadius="6px" />
          <Bone width="60%" height="14px" borderRadius="4px" />
        </div>
      </div>
      {/* Play button area */}
      <div style={{ padding: "18px 22px 10px" }}>
        <Bone width="130px" height="40px" borderRadius="24px" />
      </div>
      {/* Track list */}
      <div style={{ padding: "0 18px" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonSongRow key={i} />
        ))}
      </div>
    </div>
  );
}

// ── Artist page skeleton — hero banner + circular photo + songs + albums ──
export function SkeletonArtistView() {
  return (
    <div style={{ fontFamily: "inherit", height: "100%", overflowY: "auto" }}>
      {/* Hero banner */}
      <div style={{ position: "relative", width: "100%", height: "240px", overflow: "hidden" }}>
        <Bone
          width="100%"
          height="100%"
          borderRadius="0"
          style={{ position: "absolute", inset: 0 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.85) 100%)",
          }}
        />
      </div>
      {/* Overlapping circular photo + info */}
      <div
        style={{
          position: "relative",
          padding: "0 22px",
          marginTop: "-65px",
          zIndex: 1,
          display: "flex",
          gap: "20px",
          alignItems: "flex-end",
        }}
      >
        <Bone width="125px" height="125px" borderRadius="50%" style={{ flexShrink: 0 }} />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            paddingBottom: "8px",
          }}
        >
          <Bone width="70%" height="26px" borderRadius="6px" />
          <Bone width="50%" height="13px" borderRadius="4px" />
        </div>
      </div>
      {/* Content sections */}
      <div style={{ padding: "12px 16px" }}>
        {/* Songs section */}
        <Bone width="140px" height="13px" style={{ marginBottom: "12px", marginLeft: "8px" }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonSongRow key={i} />
        ))}
        {/* Albums section */}
        <div style={{ marginTop: "24px" }}>
          <Bone width="80px" height="13px" style={{ marginBottom: "12px", marginLeft: "8px" }} />
          <SkeletonHorizontalRow count={5} />
        </div>
        {/* Related artists section */}
        <div style={{ marginTop: "24px" }}>
          <Bone width="150px" height="13px" style={{ marginBottom: "12px", marginLeft: "8px" }} />
          <SkeletonHorizontalRow count={6} />
        </div>
      </div>
    </div>
  );
}

// ── Lyrics skeleton — mimics synced lyric lines with varying widths ───────
export function SkeletonLyrics({ fontSize = "34px", _accentColor = "#a78bfa" }) {
  // Simulated lyric lines with natural-looking width variation
  const linePatterns = [
    { width: "55%", height: fontSize, delay: 0 },
    { width: "78%", height: fontSize, delay: 0.08 },
    { width: "42%", height: fontSize, delay: 0.16 },
    { width: "90%", height: fontSize, delay: 0.24 },
    { width: "65%", height: fontSize, delay: 0.32 },
    { width: "38%", height: fontSize, delay: 0.4 },
    { width: "82%", height: fontSize, delay: 0.48 },
    { width: "50%", height: fontSize, delay: 0.56 },
    { width: "70%", height: fontSize, delay: 0.64 },
    { width: "45%", height: fontSize, delay: 0.72 },
    { width: "85%", height: fontSize, delay: 0.8 },
    { width: "60%", height: fontSize, delay: 0.88 },
    { width: "35%", height: fontSize, delay: 0.96 },
    { width: "75%", height: fontSize, delay: 1.04 },
    { width: "48%", height: fontSize, delay: 1.12 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", paddingTop: "40px" }}>
      {linePatterns.map((line, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "center",
            paddingLeft: i % 3 === 0 ? "10%" : 0,
          }}
        >
          <Bone
            width={line.width}
            height={`${(parseFloat(line.height) * 0.4).toFixed(1)}px`}
            borderRadius="8px"
            style={{
              opacity: i < 3 ? 0.25 : i < 6 ? 0.15 : 0.08,
              animationDelay: `${line.delay}s`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

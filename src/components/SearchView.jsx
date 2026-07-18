import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { fmtTime } from "../utils/formatTime";
import {
  COLORS,
  RADIUS,
  SPACING,
  TRANSITIONS,
  TYPOGRAPHY,
  withAlpha,
  LAYOUTS,
  ANIMATIONS,
  GLASS,
  safeAccentText,
} from "../utils/theme";
import { SkeletonSongRow, SkeletonHorizontalRow } from "./SkeletonLoader";

export function SearchView({
  query,
  onQueryChange,
  searchTab,
  onSearchTabChange,
  results,
  searchArtists,
  searchAlbums,
  songsVisible,
  onShowMore,
  searchLoading = false,
  videoResults,
  videoLoading,
  videoError,
  currentSong,
  accentColor,
  playSong,
  toggleLike,
  liked,
  openOptions,
  searchInputRef,
  onSelectArtist,
  onSelectAlbum,
}) {
  // ── Estado local del input (solo se busca en Enter/click lupa) ─────────
  const [localQuery, setLocalQuery] = React.useState(query || "");
  // ⭐ "Buscando" viene del estado REAL del hook (searchLoading), no se
  //    deduce de "results vacíos" — eso confundía "sin resultados" con
  //    "cargando" y mostraba un spinner eterno cuando no había matches.
  const searching = searchLoading;

  // Sincronizar con cambios externos (ej: búsqueda desde HomeView)
  React.useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  const triggerSearch = React.useCallback(
    (value) => {
      const trimmed = value.trim();
      if (trimmed && onQueryChange) {
        // El estado "cargando" lo gestiona useSearch (searchLoading)
        onQueryChange(trimmed);
      }
    },
    [onQueryChange],
  );

  return (
    <div
      style={{
        padding: SPACING.content.pad,
        fontFamily: FONT,
        overflowY: "auto",
        height: "100%",
        paddingBottom: "90px",
      }}
    >
      {/* Search bar — glassmorphism */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          ...GLASS.searchbar,
          borderRadius: RADIUS.search,
          padding: SPACING.search.pad,
          marginBottom: SPACING.gap.xwide,
          transition: "all .2s cubic-bezier(.16,1,.3,1)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,.10)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,.14)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = GLASS.searchbar.background;
          e.currentTarget.style.borderColor = GLASS.searchbar.borderColor;
        }}
      >
        <button
          onClick={() => triggerSearch(localQuery)}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,.35)",
            cursor: "pointer",
            padding: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color .12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.7)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.35)")}
        >
          {Ic.search}
        </button>
        <input
          ref={searchInputRef}
          autoFocus
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") triggerSearch(localQuery);
          }}
          placeholder="Busca canciones, artistas, álbumes..."
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: COLORS.textPrimary,
            fontSize: "14px",
            fontWeight: "600",
            fontFamily: FONT,
          }}
        />
        {localQuery && (
          <button
            onClick={() => {
              setLocalQuery("");
              onQueryChange("");
              searchInputRef?.current?.focus();
            }}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,.3)",
              cursor: "pointer",
              padding: "2px",
              display: "flex",
            }}
          >
            {Ic.close}
          </button>
        )}
      </div>

      {/* Tabs: Música / Videos — pill-shaped con transición suave */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          marginBottom: "18px",
          padding: "3px",
          background: "rgba(255,255,255,.04)",
          borderRadius: RADIUS.pill,
          width: "fit-content",
        }}
      >
        {[
          ["music", "Música"],
          ["videos", "Videos"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => onSearchTabChange(k)}
            style={{
              padding: "7px 18px",
              borderRadius: RADIUS.pill,
              border: "none",
              background: searchTab === k ? accentColor : "transparent",
              color: searchTab === k ? COLORS.black : COLORS.textSecondary,
              fontWeight: searchTab === k ? "700" : "600",
              fontSize: "12.5px",
              cursor: "pointer",
              fontFamily: FONT,
              transition: "all .2s cubic-bezier(.16,1,.3,1)",
              boxShadow: searchTab === k ? `0 2px 8px ${withAlpha(accentColor, "44")}` : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Música */}
      {searchTab === "music" && (
        <>
          {/* Skeleton loading state */}
          {searching && query && (
            <div style={{ ...ANIMATIONS.fadeIn(0) }}>
              <div style={{ marginBottom: SPACING.section.marginBottomSm }}>
                <div
                  className="skeleton"
                  style={{
                    width: "80px",
                    height: "12px",
                    borderRadius: "6px",
                    marginBottom: "10px",
                  }}
                />
                <SkeletonHorizontalRow count={4} />
              </div>
              <div>
                <div
                  className="skeleton"
                  style={{
                    width: "100px",
                    height: "12px",
                    borderRadius: "6px",
                    marginBottom: "10px",
                  }}
                />
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonSongRow key={i} />
                ))}
              </div>
            </div>
          )}

          {!searching &&
            results.length === 0 &&
            searchArtists.length === 0 &&
            searchAlbums.length === 0 &&
            query && (
              <div
                style={{
                  ...ANIMATIONS.fadeIn(0),
                  padding: "50px 20px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,.2)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                    <path d="M8 11h6" />
                  </svg>
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: COLORS.textSecondary,
                    marginBottom: "6px",
                  }}
                >
                  Sin resultados para &ldquo;{query}&rdquo;
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    fontWeight: "500",
                    color: COLORS.textMuted,
                  }}
                >
                  Intenta con otro término de búsqueda
                </div>
              </div>
            )}

          {searchArtists.length > 0 && (
            <div style={{ marginBottom: SPACING.section.marginBottomSm }}>
              <h3
                style={{
                  ...TYPOGRAPHY.sectionTitle,
                  color: COLORS.textTertiary,
                  marginBottom: "10px",
                }}
              >
                Artistas
              </h3>
              <div style={LAYOUTS.horizontalScroll}>
                {searchArtists.map((a, i) => (
                  <div
                    key={a.browseId || i}
                    onClick={() => onSelectArtist && onSelectArtist(a)}
                    style={{
                      ...ANIMATIONS.fadeSlideUp(i * 50),
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
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    <div style={LAYOUTS.circularCover("72px")}>
                      <MusicCover
                        src={a.thumbnail}
                        displaySize={80}
                        alt={a.name}
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
                      {a.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div>
              <h3
                style={{
                  ...TYPOGRAPHY.sectionTitle,
                  color: COLORS.textTertiary,
                  marginBottom: "10px",
                }}
              >
                Canciones
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {results.slice(0, songsVisible).map((song, i) => {
                  const isActive = currentSong?.videoId === song.videoId;
                  const isLiked = liked.has(song.videoId);
                  return (
                    <div
                      key={song.videoId || i}
                      style={{
                        ...ANIMATIONS.staggerFast(i),
                        ...LAYOUTS.songRow(isActive, accentColor),
                      }}
                      onClick={() => playSong(song)}
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
                      <div
                        style={{
                          ...LAYOUTS.listCover,
                          background: COLORS.surfaceCoverBg,
                        }}
                      >
                        <MusicCover
                          thumbnails={song.thumbnails}
                          src={song.thumbnail}
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
                          {song.artist}
                        </div>
                      </div>
                      {song.duration > 0 && (
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(song.videoId);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: isLiked ? COLORS.likeColor : COLORS.iconDimmer,
                          display: "flex",
                          padding: "4px",
                          transition: TRANSITIONS.fast,
                        }}
                      >
                        {Ic.heart(isLiked, 16)}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openOptions(song);
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
                    </div>
                  );
                })}
                {results.length > songsVisible && (
                  <button
                    onClick={onShowMore}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: RADIUS.default,
                      border: "none",
                      background: COLORS.surfaceCard,
                      color: safeAccentText(accentColor),
                      fontWeight: "800",
                      fontSize: "12.5px",
                      cursor: "pointer",
                      fontFamily: FONT,
                      transition: TRANSITIONS.fast,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = COLORS.surfaceCardHover)
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.surfaceCard)}
                  >
                    Mostrar más ({results.length - songsVisible} restantes)
                  </button>
                )}
              </div>
            </div>
          )}

          {searchAlbums.length > 0 && (
            <div style={{ marginBottom: SPACING.section.marginBottomSm }}>
              <h3
                style={{
                  ...TYPOGRAPHY.sectionTitle,
                  color: COLORS.textTertiary,
                  marginBottom: "10px",
                }}
              >
                Álbumes
              </h3>
              <div style={LAYOUTS.horizontalScroll}>
                {searchAlbums.map((a, i) => (
                  <div
                    key={a.browseId || i}
                    onClick={() => onSelectAlbum && onSelectAlbum(a)}
                    style={{
                      ...ANIMATIONS.fadeSlideUp(i * 60 + 200),
                      ...LAYOUTS.albumCard,
                      minWidth: "130px",
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
                      src={a.thumbnail}
                      displaySize={150}
                      alt={a.title}
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
                        {a.title}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: COLORS.textTertiary,
                          fontWeight: "600",
                          marginTop: "2px",
                        }}
                      >
                        {a.type} · {a.year || a.artist}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab: Videos */}
      {searchTab === "videos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.gap.tight }}>
          {videoLoading && (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "rgba(255,255,255,.3)",
                fontWeight: "600",
                fontSize: "13px",
              }}
            >
              Cargando videos...
            </div>
          )}
          {videoError && (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: COLORS.errorText,
                fontSize: "13px",
                fontWeight: "600",
              }}
            >
              Error: {videoError}
            </div>
          )}{" "}
          {!videoLoading && !videoError && videoResults.length === 0 && query && (
            <div
              style={{
                ...ANIMATIONS.fadeIn(0),
                padding: "50px 20px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,.2)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="3" />
                  <path d="M10 9l5 3-5 3z" fill="rgba(255,255,255,.15)" />
                </svg>
              </div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: "600",
                  color: COLORS.textSecondary,
                  marginBottom: "6px",
                }}
              >
                Sin videos para &ldquo;{query}&rdquo;
              </div>
              <div
                style={{
                  fontSize: "12.5px",
                  fontWeight: "500",
                  color: COLORS.textMuted,
                }}
              >
                Prueba buscar en la pestaña de Música
              </div>
            </div>
          )}
          {!videoLoading &&
            !videoError &&
            videoResults.map((v, i) => {
              const isActive = currentSong?.videoId === v.videoId;
              return (
                <div
                  key={v.videoId || i}
                  onClick={() => playSong(v)}
                  style={{
                    ...ANIMATIONS.staggerFast(i),
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.row.gap,
                    padding: SPACING.row.pad,
                    borderRadius: RADIUS.default,
                    cursor: "pointer",
                    background: isActive
                      ? `linear-gradient(90deg, ${withAlpha(accentColor, "15")}, transparent)`
                      : "transparent",
                    transition: "all .15s cubic-bezier(.16,1,.3,1)",
                    borderLeft: isActive ? `2px solid ${accentColor}` : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = COLORS.surfaceNav;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <div
                    style={{
                      width: "60px",
                      height: "34px",
                      borderRadius: "6px",
                      overflow: "hidden",
                      flexShrink: 0,
                      background: COLORS.surfaceCoverBg,
                      position: "relative",
                    }}
                  >
                    <MusicCover
                      src={v.thumbnail}
                      displaySize={70}
                      alt=""
                      style={{ width: "60px", height: "34px" }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "700",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isActive ? safeAccentText(accentColor) : COLORS.textPlayerTitle,
                      }}
                    >
                      {v.title}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: COLORS.textTertiary,
                        fontWeight: "600",
                        marginTop: "1px",
                      }}
                    >
                      {v.artist} {v.views ? `· ${v.views}` : ""}
                    </div>
                  </div>
                  {v.duration > 0 && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "rgba(255,255,255,.3)",
                        flexShrink: 0,
                      }}
                    >
                      {fmtTime(v.duration)}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

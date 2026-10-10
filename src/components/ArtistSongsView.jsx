import React, { useState, useEffect } from "react";
import { FONT } from "../constants";
import { api } from "../utils/api";
import { codeFromReason } from "../utils/errorCodes";
import TrackList from "./TrackList";
import { StatusState } from "./StatusState";
import { COLORS, RADIUS, TYPOGRAPHY, GLASS, TRANSITIONS } from "../utils/theme";

/**
 * Pantalla «Todas las canciones del artista».
 *
 * Se abre desde ArtistView (botón «Ver todas las canciones»). El backend
 * trae el catálogo COMPLETO del artista (GET /artist/{id}/songs: la
 * playlist VL entera con todas sus continuaciones, con fallback de
 * búsqueda) en vez de las 5-10 del preview de la página del artista.
 */
export default function ArtistSongsView({
  browseId,
  name,
  accentColor,
  currentSong,
  playSong,
  toggleLike,
  liked,
  openOptions,
  onBack,
}) {
  const [songs, setSongs] = useState([]);
  const [artistName, setArtistName] = useState(name || "");
  const [loading, setLoading] = useState(true);
  // Código reportable del último fallo de carga (utils/errorCodes).
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!browseId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .get(`/artist/${encodeURIComponent(browseId)}/songs`)
      .then((d) => {
        if (cancelled) return;
        setSongs(d?.songs || []);
        if (d?.name) setArtistName(d.name);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.code || codeFromReason(err?.message));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [browseId]);

  return (
    <div
      style={{
        fontFamily: FONT,
        height: "100%",
        overflowY: "auto",
        position: "relative",
        paddingBottom: "90px",
      }}
    >
      {/* ── Cabecera: volver + título (sticky, sin backdrop-filter) ──── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px 10px",
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "linear-gradient(180deg, rgba(10,10,14,.94) 65%, rgba(10,10,14,0) 100%)",
        }}
      >
        <button
          onClick={onBack}
          title="Volver al artista"
          style={{
            width: "34px",
            height: "34px",
            flexShrink: 0,
            borderRadius: RADIUS.full,
            ...GLASS.btn,
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: TRANSITIONS.fast,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              ...TYPOGRAPHY.h2,
              color: COLORS.textPrimary,
              fontSize: "20px",
              fontWeight: "800",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              margin: 0,
            }}
          >
            Todas las canciones
          </h1>
          {!loading && !loadError && songs.length > 0 && (
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: COLORS.textTertiary,
                marginTop: "2px",
              }}
            >
              {songs.length} canciones{artistName ? ` · ${artistName}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────────── */}
      <div style={{ padding: "4px 12px 0" }}>
        {loading && (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: COLORS.textMuted,
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            Cargando canciones del artista...
          </div>
        )}

        {!loading && loadError && (
          <StatusState
            code={loadError}
            title="No se pudieron cargar las canciones"
            actionLabel="Volver"
            onAction={onBack}
            accentColor={accentColor}
          />
        )}

        {!loading && !loadError && songs.length === 0 && (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: COLORS.textMuted,
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            No hay canciones disponibles para este artista
          </div>
        )}

        {!loading && !loadError && songs.length > 0 && (
          <TrackList
            songs={songs}
            currentSong={currentSong}
            accentColor={accentColor}
            onPlay={(song) => playSong(song)}
            openOptions={openOptions}
            liked={liked}
            onToggleLike={toggleLike}
          />
        )}
      </div>
    </div>
  );
}

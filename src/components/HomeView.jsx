import React from "react";
import { FONT } from "../constants";
import { Ic } from "../icons/Icons";
import { MusicCover } from "./MusicCover";
import { api } from "../utils/api";
import { useDragScroll } from "../hooks/useDragScroll";
import {
  COLORS,
  RADIUS,
  SPACING,
  TYPOGRAPHY,
  withAlpha,
  ANIMATIONS,
  GLASS,
  safeAccentText,
} from "../utils/theme";
import { SkeletonGrid, SkeletonSongRow } from "./SkeletonLoader";
import { SearchBar } from "./SearchBar";
import { StatusState } from "./StatusState";

/** Límites por sección — home estilo YTM/Spotify: rejilla apilada, más items. */
const LIMITS = { recents: 18, forYou: 20, trending: 20, albums: 20 };

/** Devuelve un saludo según la hora del día */
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};

/** Devuelve un icono según la hora del día */
const getGreetingIcon = () => {
  const h = new Date().getHours();
  if (h < 6) return Ic.moon(22);
  if (h < 12) return Ic.sun(22);
  if (h < 19) return Ic.cloud(22);
  return Ic.moon(22);
};

/**
 * Feed de la home desde el backend (4 endpoints en paralelo).
 *
 * Cada sección se rellena cuando su endpoint responde; si falla, la sección
 * usa su fallback (historial) o directamente se omite — un endpoint caído
 * nunca rompe la home. `settled` distingue "cargando" de "vacío de verdad"
 * para no parpadear el estado vacío mientras viajan las peticiones.
 *
 * Reintentos: en el primer arranque el backend está en frío y /trending,
 * /home/for-you y /home/albums tardan más de 10 s (timeout de api.get); sin
 * reintento la sección no llegaba a aparecer en toda la sesión. Solo se
 * reintenta ante error/timeout — una respuesta vacía es definitiva.
 */
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

function useHomeFeed() {
  const [feed, setFeed] = React.useState({});
  const [settled, setSettled] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const country = (navigator.language || "es").split("-")[1] || "GT";
    const load = async (key, path) => {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
          if (!alive) return;
        }
        try {
          const data = await api.get(path);
          const items = Array.isArray(data?.results) ? data.results : [];
          if (alive && items.length > 0) {
            setFeed((prev) => ({ ...prev, [key]: items }));
          }
          return; // respuesta definitiva (con datos o vacía)
        } catch {
          // timeout (backend en frío) u error → reintenta
        }
      }
    };
    Promise.allSettled([
      load("recents", "/home/quick-picks"),
      load("forYou", "/home/for-you"),
      load("trending", `/trending?country=${country}`),
      load("albums", "/home/albums"),
    ]).then(() => {
      if (alive) setSettled(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { feed, settled };
}

/** Cabecera de sección (h3) con la misma cadencia de animación de siempre. */
function SectionHeader({ children, delay = 120 }) {
  return (
    <div
      style={{
        ...ANIMATIONS.fadeSlideUp(delay),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: SPACING.gap.wide,
      }}
    >
      <h3 style={{ ...TYPOGRAPHY.h3, color: COLORS.iconActive, margin: 0 }}>{children}</h3>
    </div>
  );
}

/** Ancho fijo de tarjeta dentro de una banda (fila única con scroll-x). */
const SHELF_CARD = "0 0 180px";

/**
 * Banda horizontal de una sección: fila única con scroll horizontal y
 * arrastre con el ratón (useDragScroll) en lugar de rejilla apilada — el
 * inicio deja de verse amontonado y el resto de la fila se ve arrastrando
 * (shift+rueda y trackpad, en horizontal, ya funcionan nativos).
 *
 * El aire de padding (compensado arriba con margen negativo para no separar
 * el header) da sitio al glow/float de las tarjetas y a la barra de scroll
 * horizontal sin que se recorten ni cambie el ritmo entre secciones.
 */
function Shelf({ testid, children }) {
  const { ref, onMouseDown, onClickCapture, onDragStart } = useDragScroll();
  return (
    <div
      data-testid={testid}
      ref={ref}
      className="home-shelf"
      onMouseDown={onMouseDown}
      onClickCapture={onClickCapture}
      onDragStart={onDragStart}
      style={{
        display: "flex",
        gap: SPACING.card.gap,
        overflowX: "auto",
        overflowY: "hidden",
        padding: "20px 6px 16px 0",
        marginTop: "-20px",
        marginBottom: "12px",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Tarjeta de la rejilla: canción, álbum o cualquier entidad con cover.
 * Estilo congelado: sin backdrop-filter por tarjeta (regresión de GPU),
 * glow 16px de acento solo cuando está sonando.
 */
function FeedCard({
  item,
  index,
  accentColor,
  currentSong,
  isActuallyPlaying,
  onClick,
  subtitle,
  openOptions,
}) {
  const isPlaying = Boolean(item.videoId) && currentSong?.videoId === item.videoId;
  return (
    <div
      onClick={onClick}
      style={{
        ...ANIMATIONS.fadeSlideUp(160 + Math.min(index, 10) * 45),
        ...GLASS.card,
        // Sin backdrop-filter por tarjeta (regresión de rendimiento, mismo
        // criterio que LibraryCard): sobre la rejilla plana era imperceptible.
        backdropFilter: undefined,
        WebkitBackdropFilter: undefined,
        background: isPlaying
          ? `linear-gradient(135deg, ${withAlpha(accentColor, "18")}, ${withAlpha(accentColor, "08")})`
          : GLASS.card.background,
        borderRadius: RADIUS.card,
        cursor: "pointer",
        transition:
          "background .2s cubic-bezier(.16,1,.3,1), transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s cubic-bezier(.16,1,.3,1), border-color .2s cubic-bezier(.16,1,.3,1)",
        border: isPlaying ? `1.5px solid ${withAlpha(accentColor, "44")}` : GLASS.card.border,
        boxShadow: isPlaying
          ? `0 0 16px ${withAlpha(accentColor, "33")}, inset 0 1px 0 rgba(255,255,255,.06)`
          : "none",
        position: "relative",
        // Banda horizontal: ancho fijo por tarjeta (la fila hace scroll-x).
        width: "180px",
        flex: SHELF_CARD,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isPlaying
          ? `linear-gradient(135deg, ${withAlpha(accentColor, "22")}, ${withAlpha(accentColor, "10")})`
          : GLASS.cardHover.background;
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.06)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isPlaying
          ? `linear-gradient(135deg, ${withAlpha(accentColor, "18")}, ${withAlpha(accentColor, "08")})`
          : GLASS.card.background;
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Cover con overlay sutil de gradiente en la parte inferior */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: `${RADIUS.card}px ${RADIUS.card}px 0 0`,
        }}
      >
        <MusicCover
          thumbnails={item.thumbnails}
          src={item.thumbnail}
          displaySize={200}
          alt={item.title}
          style={{ width: "100%", aspectRatio: "1" }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "40%",
            background: "linear-gradient(to top, rgba(0,0,0,.5), transparent)",
            pointerEvents: "none",
          }}
        />
        {/* Indicador de reproducción en esquina inferior derecha (canciones) */}
        {isPlaying && (
          <div
            style={{
              position: "absolute",
              bottom: "8px",
              right: "8px",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: accentColor,
              // Icono del pulso: primer plano dinámico sobre el acento
              color: "var(--neon-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              // Pausado mientras hay un modal abierto (queda tapado por el
              // scrim): html.overlay-open (index.html)
              boxShadow: `0 0 12px ${accentColor}88`,
              animation: "pulse 1.5s ease infinite",
            }}
            className="now-playing-pulse"
            data-testid="now-playing-pulse"
          >
            {isActuallyPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        )}
      </div>
      {/* 3-dot menu — solo para canciones, fuera del contenedor con overflow */}
      {openOptions && item.videoId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openOptions(item);
          }}
          style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            background: "rgba(0,0,0,.5)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,.8)",
            opacity: 0,
            transition: "opacity .15s",
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0";
          }}
        >
          {Ic.dots}
        </button>
      )}
      <div style={{ padding: "10px 12px 12px" }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: "700",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: isPlaying ? safeAccentText(accentColor) : COLORS.textPrimary,
            lineHeight: 1.3,
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontSize: "11.5px",
            color: COLORS.textTertiary,
            fontWeight: "500",
            marginTop: "3px",
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
}

/** Tarjeta de playlist local (cover = dataURL del backend, no thumbnails YT). */
function PlaylistCard({ playlist, index, accentColor, onClick }) {
  const cover = playlist.cover || playlist.first_cover;
  const count = Number(playlist.song_count || 0);
  return (
    <div
      onClick={onClick}
      style={{
        ...ANIMATIONS.fadeSlideUp(160 + Math.min(index, 10) * 45),
        ...GLASS.card,
        backdropFilter: undefined,
        WebkitBackdropFilter: undefined,
        borderRadius: RADIUS.card,
        cursor: "pointer",
        position: "relative",
        // Mismo ancho fijo que FeedCard: caben en la banda con scroll-x.
        width: "180px",
        flex: SHELF_CARD,
        transition:
          "background .2s cubic-bezier(.16,1,.3,1), transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s cubic-bezier(.16,1,.3,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = GLASS.cardHover.background;
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = GLASS.card.background;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: `${RADIUS.card}px ${RADIUS.card}px 0 0`,
          background: COLORS.surfaceCoverBg,
          aspectRatio: "1",
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          /* Fallback: acento de la playlist (o el de la app) sobre el fondo */
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(135deg, ${withAlpha(playlist.color || accentColor, "44")}, ${withAlpha(playlist.color || accentColor, "11")})`,
              color: safeAccentText(playlist.color || accentColor),
            }}
          >
            {Ic.music}
          </div>
        )}
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: "700",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: COLORS.textPrimary,
            lineHeight: 1.3,
          }}
        >
          {playlist.name}
        </div>
        <div
          style={{
            fontSize: "11.5px",
            color: COLORS.textTertiary,
            fontWeight: "500",
            marginTop: "3px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {count === 1 ? "1 canción" : `${count} canciones`}
        </div>
      </div>
    </div>
  );
}

export default function HomeView({
  currentSong,
  isPlaying: isActuallyPlaying,
  playSong,
  history = [],
  accentColor = "#a78bfa",
  onSearch,
  openOptions,
  playlists = [],
  onSelectPlaylist,
  onSelectAlbum,
  // ── Estado de la biblioteca (useLibrary) ──────────────────────────────────
  // "loading" → skeleton; "error" → estado con código + Reintentar; "ready" →
  // contenido. Antes se deducía de "history vacío" y el skeleton convivía con
  // el estado vacío (y quedaba eterno con el backend caído).
  status = "ready",
  errorCode,
  onRetry,
}) {
  const { feed, settled } = useHomeFeed();

  // ── Secciones (rejilla apilada): endpoints con fallback a historial ───────
  const recentsItems = (feed.recents || history.slice(0, LIMITS.recents)).slice(0, LIMITS.recents);
  // Fallback de "Para ti": historial que no se ve ya en Recientes.
  const recentsIds = new Set(recentsItems.map((s) => s.videoId).filter(Boolean));
  const forYouFallback = history.filter((s) => !recentsIds.has(s.videoId)).slice(0, LIMITS.forYou);
  const forYouItems = (feed.forYou || forYouFallback).slice(0, LIMITS.forYou);
  // Tendencias y Álbumes: sin fallback de historial — si el endpoint falla,
  // la sección no se pinta (nada de mezclar señas ajenas).
  const trendingItems = (feed.trending || []).slice(0, LIMITS.trending);
  const albumItems = (feed.albums || []).slice(0, LIMITS.albums);

  const hasAnyContent =
    recentsItems.length +
      forYouItems.length +
      trendingItems.length +
      albumItems.length +
      playlists.length >
    0;

  // ── Search bar state ────────────────────────────────────────────────────────
  const [searchValue, setSearchValue] = React.useState("");
  const searchInputRef = React.useRef(null);

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
      {/* ── Hero: Saludo + Search — la personalidad de la página ─────────── */}
      <div
        style={{
          marginBottom: SPACING.section.marginBottom,
          paddingTop: "8px",
        }}
      >
        {/* Greeting — la primera cosa que ve el usuario */}
        <div
          style={{
            ...ANIMATIONS.fadeSlideUp(0),
            marginBottom: SPACING.gap.xwide,
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "600",
              color: COLORS.textTertiary,
              marginBottom: "4px",
              letterSpacing: ".3px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {getGreetingIcon()} {getGreeting()}
            </span>
          </div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "800",
              color: COLORS.textPrimary,
              letterSpacing: "-.5px",
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {recentsItems.length > 0 ? "¿Qué quieres escuchar?" : "Descubre tu sonido"}
          </h1>
        </div>

        {/* Search bar — glassmorphism */}
        <SearchBar
          value={searchValue}
          onChange={setSearchValue}
          onSearch={(v) => {
            const trimmed = v.trim();
            if (trimmed) onSearch(trimmed);
          }}
          inputRef={searchInputRef}
          placeholder="Buscar canciones, artistas, álbumes…"
          accentColor={accentColor}
          glowOnFocus
          clearCircle
          height="44px"
          padding="0 16px"
          borderRadius="14px"
          containerStyle={{ ...ANIMATIONS.fadeSlideUp(60) }}
        />
      </div>

      {/* ── Estado de error: código reportable + Reintentar ────────────── */}
      {status === "error" && (
        <StatusState code={errorCode} onRetry={onRetry} accentColor={accentColor} />
      )}

      {/* Skeleton — SOLO mientras la biblioteca carga (nunca con datos) */}
      {status === "loading" && (
        <div style={{ ...ANIMATIONS.fadeIn(100) }}>
          <div style={{ ...ANIMATIONS.fadeSlideUp(120), marginBottom: SPACING.gap.wide }}>
            <div
              className="skeleton"
              style={{ width: "100px", height: "14px", borderRadius: "6px" }}
            />
          </div>
          <SkeletonGrid count={6} />
          <div style={{ marginTop: SPACING.section.marginBottom }}>
            <div
              className="skeleton"
              style={{ width: "80px", height: "14px", borderRadius: "6px", marginBottom: "12px" }}
            />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonSongRow key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Skeleton — home vacía pero el feed todavía viaja (sin parpadeos) */}
      {status === "ready" && !hasAnyContent && !settled && (
        <div style={{ ...ANIMATIONS.fadeIn(100) }}>
          <SkeletonGrid count={6} />
        </div>
      )}

      {/* ── 1) Recientes — cronológico real (quick-picks), fallback historial */}
      {status === "ready" && recentsItems.length > 0 && (
        <>
          <SectionHeader delay={120}>Recientes</SectionHeader>
          <Shelf testid="grid-recents">
            {recentsItems.map((song, i) => (
              <FeedCard
                key={song.videoId || `r-${i}`}
                item={song}
                index={i}
                accentColor={accentColor}
                currentSong={currentSong}
                isActuallyPlaying={isActuallyPlaying}
                onClick={() => playSong(song)}
                subtitle={song.artist}
                openOptions={openOptions}
              />
            ))}
          </Shelf>
        </>
      )}

      {/* ── 2) Para ti — mix personal del backend, fallback historial ──────── */}
      {status === "ready" && forYouItems.length > 0 && (
        <>
          <SectionHeader delay={300}>Para ti</SectionHeader>
          <Shelf testid="grid-for-you">
            {forYouItems.map((song, i) => (
              <FeedCard
                key={song.videoId || `f-${i}`}
                item={song}
                index={i}
                accentColor={accentColor}
                currentSong={currentSong}
                isActuallyPlaying={isActuallyPlaying}
                onClick={() => playSong(song)}
                subtitle={song.artist}
                openOptions={openOptions}
              />
            ))}
          </Shelf>
        </>
      )}

      {/* ── 3) Tendencias — charts del país del sistema ─────────────────────── */}
      {status === "ready" && trendingItems.length > 0 && (
        <>
          <SectionHeader delay={360}>Tendencias</SectionHeader>
          <Shelf testid="grid-trending">
            {trendingItems.map((song, i) => (
              <FeedCard
                key={song.videoId || `t-${i}`}
                item={song}
                index={i}
                accentColor={accentColor}
                currentSong={currentSong}
                isActuallyPlaying={isActuallyPlaying}
                onClick={() => playSong(song)}
                subtitle={song.artist}
                openOptions={openOptions}
              />
            ))}
          </Shelf>
        </>
      )}

      {/* ── 4) Álbumes — de tus artistas más escuchados ─────────────────────── */}
      {status === "ready" && albumItems.length > 0 && (
        <>
          <SectionHeader delay={420}>Álbumes</SectionHeader>
          <Shelf testid="grid-albums">
            {albumItems.map((album, i) => (
              <FeedCard
                key={album.browseId || `a-${i}`}
                item={album}
                index={i}
                accentColor={accentColor}
                currentSong={currentSong}
                isActuallyPlaying={isActuallyPlaying}
                onClick={() => onSelectAlbum?.(album)}
                subtitle={
                  album.year ? `${album.artist} · ${album.year}` : album.artist || album.type
                }
              />
            ))}
          </Shelf>
        </>
      )}

      {/* ── 5) Tus playlists — librería local ───────────────────────────────── */}
      {status === "ready" && playlists.length > 0 && (
        <>
          <SectionHeader delay={480}>Tus playlists</SectionHeader>
          <Shelf testid="grid-playlists">
            {playlists.map((pl, i) => (
              <PlaylistCard
                key={pl.id || `p-${i}`}
                playlist={pl}
                index={i}
                accentColor={accentColor}
                onClick={() => onSelectPlaylist?.(pl)}
              />
            ))}
          </Shelf>
        </>
      )}

      {/* ── Estado vacío — cuando ya llegó todo y sigue sin haber nada ──── */}
      {status === "ready" && !hasAnyContent && settled && (
        <div
          style={{
            ...ANIMATIONS.fadeIn(200),
            padding: "80px 20px",
            textAlign: "center",
          }}
        >
          {/* Icono con glow sutil del accent color */}
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${withAlpha(accentColor, "15")}, ${withAlpha(accentColor, "05")})`,
              border: `1px solid ${withAlpha(accentColor, "15")}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={safeAccentText(accentColor)}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.7 }}
            >
              <path d="M9 18 C9 19.66 7.66 21 6 21 C4.34 21 3 19.66 3 18 C3 16.34 4.34 15 6 15 C7.66 15 9 16.34 9 18 Z" />
              <path d="M21 16 C21 17.66 19.66 19 18 19 C16.34 19 15 17.66 15 16 C15 14.34 16.34 13 18 13 C19.66 13 21 14.34 21 16 Z" />
              <path d="M9 18 L9 5 L21 3 L21 16" />
            </svg>
          </div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: COLORS.textSecondary,
              marginBottom: "8px",
            }}
          >
            Busca tu primera canción
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "500",
              color: COLORS.textMuted,
              lineHeight: 1.5,
              maxWidth: "280px",
              margin: "0 auto",
            }}
          >
            Encuentra cualquier canción, artista o álbum y comienza a disfrutar
          </div>
        </div>
      )}
    </div>
  );
}

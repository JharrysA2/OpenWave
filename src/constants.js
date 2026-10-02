export const API = "http://127.0.0.1:8765";
export const FONT = "'DM Sans', system-ui, sans-serif";
export const SW_SETTINGS_KEY = "sw_settings_v1";

export const DEFAULT_SETTINGS = {
  language: "es",
  dynamicTheme: true,
  // Color de la app (Ajustes → Apariencia): morado histórico por defecto.
  // El acento final se deriva con deriveTheme() (ver useDynamicTheme) para
  // que cualquier color elegido sea visible en el tema oscuro y sus botones
  // tengan contraste. Se persiste con el resto de ajustes (localStorage).
  appColor: "#a78bfa",
  pureBlack: false,
  blurStyle: "blur",
  defaultTab: "home",
  crossfade: 5,
  lrcLib: true,
  kuGou: true,
  pauseHistory: false,
  playerBtnShape: "circle",
  playerBarStyle: "line",
  lyricsTextPos: "left",
  lyricsAnimate: true,
  lyricsClickSeek: true,
  lyricsRotateBg: false,
  lyricsFontSize: "medium",
  lyricsScrollResume: 3,
  showProgressTime: true,
  colorTransitionSpeed: 0.5,
  // "auto" = bajo consumo solo si no hay GPU (ver utils/softwareRenderer).
  // "balanced"/"performance"/"custom" = elección explícita del usuario.
  perfMode: "auto",
  // Marcador de migración: los settings antiguos no lo traen (ver SettingsContext).
  perfModeMigrated: true,
  perfBlur: true,
  perfAnim: true,
  perfShadow: true,
  perfSolid: false,
  // Calidad de descarga (bitrate): "128" | "192" | "320" — la usa
  // SongOptionsSheet en POST /download/{id} (backend/downloads.py).
  downloadQuality: "192",
  // Calidad de reproducción en streaming: "low" | "standard" | "high"
  // (escalera QUALITY_FORMATS de backend/streaming.py).
  playbackQuality: "standard",
  // Tono del botón de play en la barra: "color" (neón) | "blanco".
  playerBtnTone: "color",
  // Alineación del bloque título/artista de la barra: "left" | "center".
  playerTextAlign: "left",
  // Pestaña inicial de Búsqueda: "music" | "videos".
  defaultSearchTab: "music",
  // Pausar glass/animaciones cuando la app pierde el foco (app-hidden).
  pauseEffectsHidden: true,
  // Recomendar canciones similares al FINAL de la cola (como el Autoplay de
  // Spotify/YTM). Solo AÑADE debajo, nunca reemplaza ni mueve la cola.
  // Por defecto apagado: la cola queda "pura" (solo el contexto elegido).
  queueRecommendations: false,
};

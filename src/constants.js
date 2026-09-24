export const API = "http://127.0.0.1:8765";
export const FONT = "'DM Sans', system-ui, sans-serif";
export const SW_SETTINGS_KEY = "sw_settings_v1";

export const DEFAULT_SETTINGS = {
  language: "es",
  dynamicTheme: true,
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
};

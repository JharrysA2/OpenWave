/**
 * SoundWave Lumina — Design System Tokens
 *
 * Basado en DESIGN.md — SoundWave Lumina Design System.
 * Todos los componentes deben importar estos tokens en lugar de
 * valores hardcodeados.
 *
 * Uso:
 *   import { COLORS, TYPOGRAPHY, RADIUS, SPACING, SHADOWS } from "../utils/theme";
 *
 *   <div style={{ background: COLORS.surface, borderRadius: RADIUS.md }}>
 *     {children}
 *   </div>
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  PALETA COMPLETA — Material Design 3 (desde DESIGN.md YAML)
// ═══════════════════════════════════════════════════════════════════════════════

const PALETTE = {
  // Superficies
  surface: "#121414",
  surfaceDim: "#121414",
  surfaceBright: "#37393a",
  surfaceContainerLowest: "#0c0f0f",
  surfaceContainerLow: "#1a1c1c",
  surfaceContainer: "#1e2020",
  surfaceContainerHigh: "#282a2b",
  surfaceContainerHighest: "#333535",

  // Texto on-surface
  onSurface: "#e2e2e2",
  onSurfaceVariant: "#c8c5cb",
  inverseSurface: "#e2e2e2",
  inverseOnSurface: "#2f3131",

  // Bordes / outline
  outline: "#929095",
  outlineVariant: "#47464b",
  surfaceTint: "#c8c5cd",

  // Primario
  primary: "#c8c5cd",
  onPrimary: "#303036",
  primaryContainer: "#0a0a0f",
  onPrimaryContainer: "#7a797f",
  inversePrimary: "#5f5d64",

  // Secundario
  secondary: "#cebdff",
  onSecondary: "#381385",
  secondaryContainer: "#4f319c",
  onSecondaryContainer: "#bea8ff",

  // Terciario
  tertiary: "#ffb2b7",
  onTertiary: "#67001b",
  tertiaryContainer: "#200004",
  onTertiaryContainer: "#e33253",

  // Error
  error: "#ef4444",
  onError: "#690005",
  errorContainer: "#93000a",
  onErrorContainer: "#ffdad6",

  // Fixed (M3)
  primaryFixed: "#e4e1e9",
  primaryFixedDim: "#c8c5cd",
  onPrimaryFixed: "#1b1b20",
  onPrimaryFixedVariant: "#47464c",
  secondaryFixed: "#e8ddff",
  secondaryFixedDim: "#cebdff",
  onSecondaryFixed: "#21005e",
  onSecondaryFixedVariant: "#4f319c",
  tertiaryFixed: "#ffdadb",
  tertiaryFixedDim: "#ffb2b7",
  onTertiaryFixed: "#40000d",
  onTertiaryFixedVariant: "#92002a",

  // Background
  background: "#121414",
  onBackground: "#e2e2e2",

  // Variants
  surfaceVariant: "#333535",

  // Especiales SoundWave
  bgPlayer: "#05050a",
  accentFallback: "#7c3aed",
  cardOverlay: "rgba(255, 255, 255, 0.04)",
  cardHover: "rgba(255, 255, 255, 0.08)",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  COLORES DE USO — Jerarquía de texto y tokens funcionales
// ═══════════════════════════════════════════════════════════════════════════════
//
// Jerarquía de texto (desde DESIGN.md — sección Colors):
//   Primary:   #ffffff        — headers, estados activos
//   Secondary: 60% white      — metadata, navegación inactiva
//   Tertiary:  40% white      — metadatos secundarios (nombres de artista)
//   Muted:     25% white      — timestamps, detalles técnicos

export const COLORS = {
  // ── Fondos (desde PALETTE + extras funcionales) ──────────────────────────
  surface: PALETTE.surface,
  surfaceDim: PALETTE.surfaceDim,
  surfaceBright: PALETTE.surfaceBright,
  surfaceContainerLowest: PALETTE.surfaceContainerLowest,
  surfaceContainerLow: PALETTE.surfaceContainerLow,
  surfaceContainer: PALETTE.surfaceContainer,
  surfaceContainerHigh: PALETTE.surfaceContainerHigh,
  surfaceContainerHighest: PALETTE.surfaceContainerHighest,
  surfacePureBlack: "#000000",
  surfacePlayer: PALETTE.bgPlayer,
  surfaceSidebar: "rgba(0,0,0,.2)",
  surfaceCard: PALETTE.cardOverlay,
  surfaceCardHover: PALETTE.cardHover,
  surfaceSearchbar: "rgba(255,255,255,.06)",
  surfaceNav: "rgba(255,255,255,.05)",
  surfaceSettings: "rgba(5,5,10,.97)",
  surfaceTitleBar: "rgba(10,10,15,.92)",
  surfaceCoverBg: "#111",

  // ── Texto (jerarquía desde DESIGN.md prose) ──────────────────────────────
  //    NOTA: el fondo de la app SIEMPRE es oscuro (#0a0a0f o #000), por lo que
  //    los textos permanecen blancos en todo momento. Solo elementos UI que
  //    usan el color acento como FONDO deben usar contraste dinámico (--neon-fg).
  textPrimary: "#ffffff",
  textSecondary: "rgba(255,255,255,.6)",
  textTertiary: "rgba(255,255,255,.46)",
  textMuted: "rgba(255,255,255,.46)",
  textDimmest: "rgba(255,255,255,.46)",
  textPlayerTitle: "rgba(255,255,255,.92)",
  textPlayerArtist: "rgba(255,255,255,.46)",

  // On-surface desde paleta
  onSurface: PALETTE.onSurface,
  onSurfaceVariant: PALETTE.onSurfaceVariant,
  onBackground: PALETTE.onBackground,

  // ── Acento dinámico ──────────────────────────────────────────────────────
  accentDefault: "#a78bfa",
  accentFallback: PALETTE.accentFallback,
  accentDefaultRgb: "167, 139, 250",
  white: "#ffffff",

  // ── Paleta completa de acento (M3) ───────────────────────────────────────
  primary: PALETTE.primary,
  onPrimary: PALETTE.onPrimary,
  primaryContainer: PALETTE.primaryContainer,
  onPrimaryContainer: PALETTE.onPrimaryContainer,
  inversePrimary: PALETTE.inversePrimary,

  secondary: PALETTE.secondary,
  onSecondary: PALETTE.onSecondary,
  secondaryContainer: PALETTE.secondaryContainer,
  onSecondaryContainer: PALETTE.onSecondaryContainer,

  tertiary: PALETTE.tertiary,
  onTertiary: PALETTE.onTertiary,
  tertiaryContainer: PALETTE.tertiaryContainer,
  onTertiaryContainer: PALETTE.onTertiaryContainer,

  // ── Estados ──────────────────────────────────────────────────────────────
  error: PALETTE.error,
  onError: PALETTE.onError,
  errorContainer: PALETTE.errorContainer,
  onErrorContainer: PALETTE.onErrorContainer,
  errorText: "#f87171",
  likeColor: "#f43f5e",
  successColor: "#22c55e",

  // ── Neutros / bordes ─────────────────────────────────────────────────────
  borderSubtle: "rgba(255,255,255,.06)",
  borderLight: "rgba(255,255,255,.1)",
  borderActive: "rgba(255,255,255,.18)",
  outline: PALETTE.outline,
  outlineVariant: PALETTE.outlineVariant,

  // ── Iconos ───────────────────────────────────────────────────────────────
  iconDefault: "rgba(255,255,255,.25)",
  iconActive: "rgba(255,255,255,.5)",
  iconDim: "rgba(255,255,255,.35)",
  iconDimmer: "rgba(255,255,255,.2)",
  placeholderIcon: "#2e2e45",
  settingsIcon: "rgba(255,255,255,.7)",

  // ── Misc ─────────────────────────────────────────────────────────────────
  scrollbar: "rgba(255,255,255,.12)",
  scrollbarHover: "rgba(255,255,255,.25)",
  progressTrack: "rgba(255,255,255,.08)",
  progressTime: "rgba(255,255,255,.35)",
  cardNumber: "rgba(255,255,255,.2)",
  titleBarText: "rgba(255,255,255,.45)",
  winCtrlDefault: "rgba(255,255,255,.5)",
  black: "#000",
  inverseSurface: PALETTE.inverseSurface,
  inverseOnSurface: PALETTE.inverseOnSurface,
  surfaceTint: PALETTE.surfaceTint,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TIPOGRAFÍA
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fuente: DM Sans — moderna, suave, excelente lectura en modo oscuro.
// Pesos DM Sans disponibles: 400, 500, 600, 700 (sin 800/900).
//
// La jerarquía se ha ajustado para ser armónica y no cansar la vista:
//   Headlines:  700 (antes 900) — contundente pero no agresivo
//   Subheading: 600 (antes 800) — suficiente presencia
//   Body:       500 (antes 600) — cómodo para lectura prolongada
//   Caption:    500 (antes 600) — legible sin esfuerzo

const FONT_FAMILY = "'DM Sans', system-ui, sans-serif";

/** Jerarquía tipográfica completa — DM Sans con pesos armonizados y tamaños ampliados */
export const TYPOGRAPHY = {
  // Display — Letras (optimizado para lectura, tracking cerrado)
  displayLyrics: {
    fontFamily: FONT_FAMILY,
    fontSize: "36px",
    fontWeight: "700",
    lineHeight: 1.35,
    letterSpacing: "-0.02em",
  },

  // ── Apple Design: tracking size-specific, leading inverso ─────────────
  //    "Large display text wants negative tracking; small text wants
  //     slightly positive tracking for legibility." — WWDC 2020

  // Headlines — tracking negativo en texto grande, leading apretado
  h1: {
    fontFamily: FONT_FAMILY,
    fontSize: "30px",
    fontWeight: "700",
    lineHeight: 1.15,
    letterSpacing: "-0.025em",
  },
  h1Mobile: {
    fontFamily: FONT_FAMILY,
    fontSize: "26px",
    fontWeight: "700",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  h2: {
    fontFamily: FONT_FAMILY,
    fontSize: "22px",
    fontWeight: "700",
    lineHeight: 1.2,
    letterSpacing: "-0.015em",
  },

  // Subheading (upper-case, usado para etiquetas de sección tipo "RECOMENDADO")
  subheading: {
    fontFamily: FONT_FAMILY,
    fontSize: "15px",
    fontWeight: "600",
    lineHeight: "22px",
    letterSpacing: "0.05em",
  },

  // Label
  label: {
    fontFamily: FONT_FAMILY,
    fontSize: "14px",
    fontWeight: "600",
    lineHeight: "20px",
  },

  // Body — texto más usado: leading cómodo para lectura
  body: {
    fontFamily: FONT_FAMILY,
    fontSize: "14px",
    fontWeight: "500",
    lineHeight: 1.45,
    letterSpacing: "0",
  },

  // Caption — artista, metadatos secundarios — tracking sutil positivo
  caption: {
    fontFamily: FONT_FAMILY,
    fontSize: "12.5px",
    fontWeight: "500",
    lineHeight: 1.4,
    letterSpacing: "0.01em",
  },

  // Metadata (la más pequeña) — tracking positivo para legibilidad
  metadata: {
    fontFamily: FONT_FAMILY,
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: 1.35,
    letterSpacing: "0.02em",
  },

  // ── Alias para compatibilidad con código existente ─────────────────────
  h1Alias: {
    fontFamily: FONT_FAMILY,
    fontSize: "30px",
    fontWeight: "700",
    letterSpacing: "-.5px",
    lineHeight: 1.2,
  },
  /** alias: subheading */
  h3: {
    fontFamily: FONT_FAMILY,
    fontSize: "15px",
    fontWeight: "600",
    letterSpacing: ".3px",
    textTransform: "uppercase",
    lineHeight: 1.2,
  },
  /** alias: label */
  h4: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "600", lineHeight: 1.2 },
  /** alias: metadata */
  small: { fontFamily: FONT_FAMILY, fontSize: "12px", fontWeight: "600", lineHeight: 1.3 },
  sectionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: "14px",
    fontWeight: "600",
    letterSpacing: ".5px",
    textTransform: "uppercase",
  },

  // Body alias
  bodyAlias: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "500", lineHeight: 1.4 },
  captionAlias: { fontFamily: FONT_FAMILY, fontSize: "12.5px", fontWeight: "500", lineHeight: 1.4 },
  smallAlias: { fontFamily: FONT_FAMILY, fontSize: "12px", fontWeight: "600", lineHeight: 1.3 },
  microAlias: { fontFamily: FONT_FAMILY, fontSize: "11px", fontWeight: "600", lineHeight: 1.3 },

  // Letras — tamaños configurables — tracking negativo para texto grande
  lyricsSmall: {
    fontFamily: FONT_FAMILY,
    fontSize: "30px",
    fontWeight: "600",
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  lyricsMedium: {
    fontFamily: FONT_FAMILY,
    fontSize: "36px",
    fontWeight: "600",
    letterSpacing: "-0.025em",
    lineHeight: 1.15,
  },
  lyricsLarge: {
    fontFamily: FONT_FAMILY,
    fontSize: "44px",
    fontWeight: "600",
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
  },

  // Navegación
  nav: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "500" },
  navActive: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "700" },
  navInactive: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "500" },

  // Branding
  brand: { fontFamily: FONT_FAMILY, fontSize: "16px", fontWeight: "700", letterSpacing: "-.3px" },
  titleBar: { fontFamily: FONT_FAMILY, fontSize: "13px", fontWeight: "600", letterSpacing: ".5px" },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  RADIOS DE BORDE
// ═══════════════════════════════════════════════════════════════════════════════
//
// Sistema de radii desde DESIGN.md (YAML rounded + prose overrides):
//   sm:     0.25rem (4px)
//   md:     0.75rem (12px)  — signature radius de la UI
//   lg:     1rem    (16px)
//   xl:     1.5rem  (24px)
//   full:   9999px  (pill/circular)
//
// Prose añade:
//   card:   14px    — álbumes, modales
//   cover:  10px    — cover en player bar
//   lyrics: 22px    — portada en vista de letras

/** Radio signature de la UI (12px, desde DESIGN.md prose) */
const DEFAULT_RADIUS = 12;

export const RADIUS = {
  // Sistema YAML
  sm: "4px",
  default: `${DEFAULT_RADIUS}px`,
  md: "12px",
  lg: "16px",
  xl: "24px",
  full: "9999px",

  // Overrides de componentes (desde prose)
  card: "14px",
  cover: "10px",
  lyricsCover: "22px",
  pill: "20px",

  // Alias funcionales existentes
  search: "12px",
  listItem: "12px",
  navItem: "12px",
  titleBtn: "6px",
  progress: "3px",
  sliderTrack: "3px",
  settingsClose: "50%",
  downloadItem: "12px",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ESPACIADOS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Desde DESIGN.md spacing + prose:
//   sidebar-width:  200px
//   sidebar-pad:    14px
//   nav-item-pad:   9px 12px
//   row-pad:        8px 10px
//   container-margin: 24px
//   gutter-default:   12px
//   gutter-tight:     6px

export const SPACING = {
  /** Sidebar fijo de 200px */
  sidebar: { width: "200px", pad: "14px", navPad: "9px 12px" },

  /** Filas de canciones */
  row: { pad: "8px 10px", gap: "10px" },

  /** Tarjetas */
  card: { gap: "12px", innerPad: "10px 12px 12px" },

  /** Búsqueda */
  search: { pad: "10px 14px" },

  /** Title bar */
  titleBar: { height: "32px", pad: "0 8px 0 14px" },

  /** Secciones (container-margin: 24px) */
  section: { marginBottom: "24px", marginBottomSm: "20px" },

  /** Player */
  player: { pad: "4px 14px 6px" },

  /** Contenido principal */
  content: { pad: "16px 20px" },

  /** Letras */
  lyrics: { pad: "50px 70px 100px 50px" },

  /** Settings */
  settings: { headerPad: "16px 20px 12px", sectionPad: "16px" },

  /** Gutters (gutter-default: 12px, gutter-tight: 6px) */
  gap: {
    tight: "6px",
    normal: "10px",
    wide: "12px",
    xwide: "16px",
    xxwide: "20px",
  },

  /** Tamaños de cover */
  cover: {
    player: "48px",
    list: "40px",
    homeGrid: 200,
    artist: "72px",
    searchCard: 150,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SOMBRAS Y GLOWS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Los neones se acompañan de sombras multicapa:
//   - Glow primario: 44% opacity
//   - Glow difuso exterior: 22% opacity
// (desde DESIGN.md — Glow Effects)

export const SHADOWS = {
  /** Brillo neón multicapa — BOLD */
  neonGlow: (color) => `0 0 30px ${color}bb, 0 0 70px ${color}77, 0 0 140px ${color}44`,

  /** Botón play — glow sutil */
  playBtn: (color) => `0 0 12px ${color}66, 0 0 24px ${color}33`,

  /** Slider thumb */
  sliderThumb: (color) => `0 0 12px ${color}ff, 0 0 28px ${color}88, 0 2px 4px rgba(0,0,0,.3)`,
  sliderThumbHover: (color) => `0 0 24px ${color}ff, 0 0 48px ${color}aa, 0 2px 8px rgba(0,0,0,.4)`,
  sliderThumbFocus: (color) => `0 0 0 3px ${color}bb, 0 0 20px ${color}ee`,

  /** Popup crossfade */
  popup: "0 8px 32px rgba(0,0,0,.5)",

  /** Botón cerrar (lyrics) */
  closeBtn: "inset 0 1px 0 rgba(255,255,255,.12), 0 2px 8px rgba(0,0,0,.25)",

  /** Portada en lyrics */
  lyricsCover: "0 8px 30px rgba(0,0,0,.5)",

  /** Settings close */
  settingsClose: "inset 0 1px 0 rgba(255,255,255,.1)",

  /** Botón ajustes sidebar */
  settingsBtn: (color) => `0 0 0 2px ${color}cc, 0 0 16px ${color}88`,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TRANSICIONES
// ═══════════════════════════════════════════════════════════════════════════════
//
// Todas las interacciones usan la curva cúbica característica:
//   cubic-bezier(.16, 1, .3, 1)
//
// Quick fades: 0.12s para botones
// Transiciones estructurales: 0.35s para carga de álbumes
// (desde DESIGN.md — Motion Details)

export const TRANSITIONS = {
  /** Curva cúbica característica de la app */
  spring: "cubic-bezier(.16,1,.3,1)",

  /** Quick fade para botones (0.12s) — curva característica */
  fast: "opacity .12s cubic-bezier(.16,1,.3,1), transform .12s cubic-bezier(.16,1,.3,1)",

  /** Hover medio (tarjetas, listas) — curva característica */
  normal: "opacity .15s cubic-bezier(.16,1,.3,1), transform .15s cubic-bezier(.16,1,.3,1)",

  /** Transiciones estructurales lentas (0.35s) */
  slow: ".35s cubic-bezier(.16,1,.3,1)",

  /** Slider despliegue */
  slider: "width .25s cubic-bezier(.16,1,.3,1), opacity .15s ease",

  /** Popup */
  popup: "opacity .18s cubic-bezier(.16,1,.3,1), transform .18s cubic-bezier(.16,1,.3,1)",

  /** Imagen cover fade-in */
  image: "opacity .35s cubic-bezier(.16,1,.3,1)",

  /** Scrollbar */
  scrollbar: "background .2s cubic-bezier(.16,1,.3,1)",

  /** Progress bar */
  progress: "width .15s linear, right .15s linear",

  /** Transform de hover en tarjeta — curva característica */
  cardHover: "background .15s cubic-bezier(.16,1,.3,1), transform .15s cubic-bezier(.16,1,.3,1)",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  GLASSMORPHISM — Apple Liquid Glass Design System
//  "Build nav/toolbars/sheets as translucent layers with backdrop-filter."
//  "Material weight encodes hierarchy: darker = structural, lighter = interactive."
// ═══════════════════════════════════════════════════════════════════════════════

export const GLASS = {
  /** Player bar — Liquid Glass SIN backdrop-filter.
   *  Medición (scripts/measure-perf.ps1): los backdrop-filter costaban
   *  1.80% GPU en Letras y este flotante a ancho completo era la mayor
   *  superficie activa (el contenido scrollea por debajo). Fondo algo más
   *  opaco para mantener la legibilidad sobre contenido en movimiento. */
  player: {
    background: "rgba(10,10,18,.85)",
    border: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), " + "0 4px 20px rgba(0,0,0,.25)",
  },

  /** Sidebar — Liquid Glass estructural SIN backdrop-filter.
   *  Detrás solo hay el fondo de la ventana (estático): el blur era
   *  imperceptible y costaba en todas las pantallas visibles.
   *  Sin `border`: el divisor lo aporta el `borderRight` inline de Sidebar.jsx
   *  (color-mix con el acento). Un border de 4 lados se ve como línea blanca
   *  sobre el fondo. */
  sidebar: {
    background: "linear-gradient(135deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)",
  },

  /** Nav items — Liquid Glass sutil */
  navItem: {
    background: "linear-gradient(135deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.02) 100%)",
    border: "1px solid rgba(255,255,255,.08)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
  },

  /** Nav item activo — con glow del acento */
  navItemActive: (accentColor) => ({
    background: `color-mix(in srgb, ${accentColor} 18%, rgba(12,12,20,.8))`,
    border: `1px solid color-mix(in srgb, ${accentColor} 35%, transparent)`,
    boxShadow:
      `inset 0 1px 0 color-mix(in srgb, ${accentColor} 25%, transparent), ` +
      `0 0 20px color-mix(in srgb, ${accentColor} 15%, transparent)`,
  }),

  /** Botón glass genérico — estilo Liquid Glass de LyricsView.
   *  Sin backdrop-filter: sobre las superficies donde se usa (paneles y
   *  fondos estáticos) el blur era imperceptible, y al escalar en hover
   *  re-difuminaba su región en cada frame. */
  btn: {
    background: "linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 100%)",
    border: `1px solid ${COLORS.borderActive}`,
    boxShadow: SHADOWS.closeBtn,
  },

  /** Hover de botón glass sobre superficies NO glass (fondo opaco).
   *  Sobre superficies ya glass usar btnHoverSoft: este salta a "blanco
   *  plano" y se ve doblado. */
  btnHover: {
    background: "linear-gradient(135deg, rgba(255,255,255,.20) 0%, rgba(255,255,255,.08) 100%)",
    border: `1px solid rgba(255,255,255,.25)`,
  },

  /** Botón glass hover sutil — realza el material manteniendo el gradiente.
   *  Usar en botones encima de superficies ya glass (tarjetas, hojas,
   *  vistas de biblioteca): btnHover salta a "blanco plano" y se ve doblado. */
  btnHoverSoft: {
    background: "linear-gradient(135deg, rgba(255,255,255,.17) 0%, rgba(255,255,255,.05) 100%)",
    border: `1px solid rgba(255,255,255,.18)`,
  },

  /** Botón play — degradado del acento + glow del acento. Sin blur: es el
   *  botón principal del reproductor y su glow es box-shadow puro, así que no
   *  re-difumina fondo en cada repintado. */
  playBtn: (accentColor) => ({
    background: `linear-gradient(135deg, ${accentColor}, color-mix(in srgb, ${accentColor} 80%, white))`,
    border: "none",
    boxShadow:
      `0 0 12px color-mix(in srgb, ${accentColor} 40%, transparent), ` +
      `0 0 24px color-mix(in srgb, ${accentColor} 15%, transparent), ` +
      `inset 0 1px 0 rgba(255,255,255,.25)`,
  }),

  /** Search bar — Liquid Glass */
  searchbar: {
    background: "linear-gradient(135deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.03) 100%)",
    backdropFilter: "blur(10px) saturate(140%)",
    WebkitBackdropFilter: "blur(10px) saturate(140%)",
    border: "1px solid rgba(255,255,255,.10)",
    borderColor: "rgba(255,255,255,.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.10), 0 2px 8px rgba(0,0,0,.15)",
  },

  /** Card / Album card — Liquid Glass SIN backdrop-filter: todos los
   *  consumidores (LibraryCard, AlbumCardRow, quick picks de Home) ya lo
   *  optaban out por medición — el blur por tarjeta creaba un backdrop root
   *  por fila sobre fondos estáticos. Gradiente, borde y sombra se conservan. */
  card: {
    background: "linear-gradient(135deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.02) 100%)",
    border: "1px solid rgba(255,255,255,.08)",
    borderColor: "rgba(255,255,255,.08)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.10), 0 4px 16px rgba(0,0,0,.2)",
  },

  /** Card hover — Liquid Glass */
  cardHover: {
    background: "linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.05) 100%)",
    border: "1px solid rgba(255,255,255,.15)",
    borderColor: "rgba(255,255,255,.15)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.15), 0 8px 24px rgba(0,0,0,.3)",
  },

  /** Popup / Sheet / Modal — Liquid Glass */
  sheet: {
    background: "linear-gradient(135deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 100%)",
    backdropFilter: "blur(10px) saturate(140%)",
    WebkitBackdropFilter: "blur(10px) saturate(140%)",
    border: "1px solid rgba(255,255,255,.12)",
    borderColor: "rgba(255,255,255,.12)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.15), " + "0 24px 80px rgba(0,0,0,.6)",
  },

  /** Title bar — Liquid Glass. Igual que el sidebar: superficie permanente
   *  a ancho completo, así que sin `saturate` (ver GLASS.sidebar). */
  titleBar: {
    background: "linear-gradient(135deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.02) 100%)",
    // Sin backdrop-filter: detrás solo hay el fondo de la ventana (estático)
    // y la barra está siempre visible (incluso sobre Letras) — medición:
    // superficie permanente a ancho completo dentro del 1.80% GPU de blur.
    border: "1px solid rgba(255,255,255,.06)",
  },

  /** Volume / Crossfade popup — Liquid Glass */
  popup: {
    background: "linear-gradient(135deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 100%)",
    backdropFilter: "blur(10px) saturate(140%)",
    WebkitBackdropFilter: "blur(10px) saturate(140%)",
    border: "1px solid rgba(255,255,255,.10)",
    borderColor: "rgba(255,255,255,.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.12), " + "0 12px 40px rgba(0,0,0,.5)",
  },

  /** Settings panel — Liquid Glass. Panel full-screen (inset 0), así que:
   *  - sin `saturate`: sobre una superficie tan grande el coste de GPU hunde
   *    el frame rate. Solo blur.
   *  - sin `border`: dibujaría un marco de 1px en los 4 bordes del viewport.
   *    La jerarquía la dan el `borderBottom` del header y los divisores de
   *    `SettingRow`. */
  settings: {
    background: "linear-gradient(135deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.03) 100%)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },

  /** Window control buttons (minimize, maximize, close) — Liquid Glass */
  winCtrl: {
    background: "linear-gradient(135deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.03) 100%)",
    border: "1px solid rgba(255,255,255,.08)",
  },

  /** Window control hover */
  winCtrlHover: {
    background: "rgba(255,255,255,.14)",
  },

  /** Crossfade button active */
  crossfadeActive: (accentColor) => ({
    background: `color-mix(in srgb, ${accentColor} 20%, rgba(12,12,20,.7))`,
    border: `1px solid color-mix(in srgb, ${accentColor} 25%, transparent)`,
  }),

  /** Glass border glow — reusable for any element */
  borderGlow: (accentColor, opacity = "30%") =>
    `1px solid color-mix(in srgb, ${accentColor} ${opacity}, transparent)`,

  /** Inner highlight — the top-edge "rim light" that makes glass feel real */
  rimLight: "inset 0 1px 0 rgba(255,255,255,.08)",

  /** Deep shadow for floating elements */
  floatShadow: "0 8px 32px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.25)",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  LAYOUTS REUTILIZABLES
// ═══════════════════════════════════════════════════════════════════════════════

export const LAYOUTS = {
  /** Fila de canción — glassmorphism on hover */
  songRow: (isActive, accentColor) => ({
    display: "flex",
    alignItems: "center",
    gap: SPACING.row.gap,
    padding: SPACING.row.pad,
    borderRadius: RADIUS.default,
    cursor: "pointer",
    background: isActive ? withAlpha(accentColor, "77") : "transparent",
    border: "1px solid transparent",
    transition: "all .15s cubic-bezier(.16,1,.3,1)",
  }),

  /** Song row hover — glass effect */
  songRowHover: {
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.06)",
    borderColor: "rgba(255,255,255,.06)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
  },

  /** Song row active — accent glow */
  songRowActive: (accentColor) => ({
    background: withAlpha(accentColor, "77"),
    border: `1px solid color-mix(in srgb, ${accentColor} 25%, transparent)`,
    boxShadow: `inset 0 1px 0 color-mix(in srgb, ${accentColor} 15%, transparent)`,
  }),

  /** Tarjeta de álbum — glassmorphism */
  albumCard: {
    ...GLASS.card,
    borderRadius: RADIUS.card,
    overflow: "hidden",
    cursor: "pointer",
    transition: TRANSITIONS.normal,
  },

  /** Grid responsive para tarjetas de álbum/canción */
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: SPACING.card.gap,
  },

  /** Scroll horizontal (artistas, álbumes en search) */
  horizontalScroll: {
    display: "flex",
    gap: SPACING.gap.normal,
    overflowX: "auto",
    paddingBottom: "6px",
  },

  /** Contenedor de contenido principal */
  mainContent: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },

  /** Cover circular (artistas) */
  circularCover: (size = "72px") => ({
    width: size,
    height: size,
    borderRadius: RADIUS.full,
    overflow: "hidden",
    background: COLORS.surfaceCoverBg,
  }),

  /** Portada cuadrada reproductor */
  playerCover: {
    width: "48px",
    height: "48px",
    borderRadius: RADIUS.cover,
    overflow: "hidden",
    flexShrink: 0,
    background: COLORS.surfaceCoverBg,
  },

  /** Cover en listas (40px) */
  listCover: {
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    overflow: "hidden",
    flexShrink: 0,
    background: COLORS.surfaceCoverBg,
  },

  /** Nav item */
  navItem: (active, accentColor) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    padding: "9px 12px",
    borderRadius: RADIUS.default,
    border: "none",
    cursor: "pointer",
    background: active ? withAlpha(accentColor, "88") : "transparent",
    color: active ? accentColor : COLORS.textSecondary,
    fontWeight: active ? "700" : "500",
    fontSize: "13px",
    transition: TRANSITIONS.fast,
  }),

  /** Contenedor flex columna centrada */
  centerColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  FUNCIONES AYUDA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Añade opacidad alpha (hex) a un color hexadecimal.
 * Ej: withAlpha("#a78bfa", "22") → "#a78bfa22"
 */
export const withAlpha = (hex, alpha) => `${hex}${alpha}`;

/**
 * Parse hex color to {r, g, b} object.
 */
const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

/**
 * WCAG relative luminance (0 = black, 1 = white).
 */
export const getLuminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r / 255) + 0.7152 * toLin(g / 255) + 0.0722 * toLin(b / 255);
};

/**
 * Returns a lighter version of the color suitable for text on dark backgrounds.
 * If the color is already bright enough, returns it as-is.
 * Used to ensure accent text is always readable on dark surfaces.
 */
export const safeAccentText = (hex) => {
  if (!hex || !hex.startsWith("#")) return hex;
  const lum = getLuminance(hex);
  if (lum >= 0.35) return hex; // already bright enough for dark bg
  // Lighten: mix towards white until luminance is at least 0.35
  const { r, g, b } = hexToRgb(hex);
  const targetLum = 0.4;
  // Simple approach: lighten by increasing each channel toward 255
  const factor = Math.min(1, (targetLum - lum) / 0.5);
  const lr = Math.round(r + (255 - r) * factor * 0.7);
  const lg = Math.round(g + (255 - g) * factor * 0.7);
  const lb = Math.round(b + (255 - b) * factor * 0.7);
  const result = `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
  return result;
};

/**
 * Tones down very bright/vivid accent colors for harmonious UI.
 * Reduces saturation and brightness when the color is too intense.
 * Use this for text and icons that should be visible but not overpowering.
 */
export const mutedAccent = (hex) => {
  if (!hex || !hex.startsWith("#")) return hex;
  const { r, g, b } = hexToRgb(hex);
  const lum = getLuminance(hex);
  // Calculate saturation (simple approximation)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;

  // If color is very vivid (sat > 60%) or too bright (luminance > 0.4)
  if (sat > 0.6 || lum > 0.4) {
    // Mix towards a muted version: reduce saturation and brightness significantly
    const factor = sat > 0.8 ? 0.5 : sat > 0.6 ? 0.65 : 0.8;
    const lr = Math.round(r * factor + (1 - factor) * 100);
    const lg = Math.round(g * factor + (1 - factor) * 100);
    const lb = Math.round(b * factor + (1 - factor) * 100);
    return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
  }
  return hex;
};

/** Gradiente linear para fondo de sidebar — base oscura sólida para mantener legibilidad */
export const sidebarBgGradient = () =>
  `linear-gradient(165deg, color-mix(in srgb, var(--neon) 40%, #05050a) 0%, color-mix(in srgb, var(--neon) 18%, #05050a) 60%, color-mix(in srgb, var(--neon) 6%, #05050a) 100%)`;

/** Gradiente vignette sutil para dar profundidad al fondo */
export const vignetteOverlay = () =>
  `radial-gradient(ellipse at 50% 50%, transparent 45%, color-mix(in srgb, #000 73%, var(--neon)) 100%)`;

// ═══════════════════════════════════════════════════════════════════════════════
//  ANIMACIONES DE ENTRADA — Apple Design principles
// ═══════════════════════════════════════════════════════════════════════════════
//
// Apple: "Respond on pointer-down, not on release."
// Apple: "Animation is a conversation between you and the object."
//
// Solo animamos opacity y transform (propiedades GPU-composited).
// Stagger: usar `ANIMATIONS.fadeSlideUp(i * 40)` para retardar cada item.
// La curva cúbica y keyframes se definen globalmente en App.jsx.
//
// ⚡ prefers-reduced-motion: los estilos inline NO pueden detectar media
//    queries, pero el CSS global en index.html ya respeta prefers-reduced-motion
//    reemplazando las keyframes por transiciones de opacity simple.

/** Curva Apple-style: critically damped, no overshoot — damping 1.0, response ~0.35 */
/** Tope de items con retardo propio en `staggerFast` (ver su comentario). */
const MAX_STAGGER_ITEMS = 12;

const SPRING = "cubic-bezier(.16,1,.3,1)";

/** Curva más suave para elementos que entran desde fuera de vista */
const SPRING_SOFT = "cubic-bezier(.22,1,.36,1)";

export const ANIMATIONS = {
  /**
   * Fade-in con deslizamiento hacia arriba. Ideal para listas y grids.
   * Apple: "Animate from the presentation value, never the target."
   * @param {number} delay - Retardo en ms (ej: i * 40 para stagger)
   */
  fadeSlideUp: (delay = 0) => ({
    animationName: "sw-fade-slide-up",
    animationDuration: "0.4s",
    animationTimingFunction: SPRING,
    animationFillMode: "both",
    animationDelay: `${delay}ms`,
  }),

  /**
   * Fade-in simple. Ideal para páginas y secciones completas.
   * @param {number} delay - Retardo en ms
   */
  fadeIn: (delay = 0) => ({
    animationName: "sw-fade-in",
    animationDuration: "0.3s",
    animationTimingFunction: SPRING_SOFT,
    animationFillMode: "both",
    animationDelay: `${delay}ms`,
  }),

  /**
   * Stagger rápido para listas largas (delay más corto).
   *
   * El retardo se TOPA en `MAX_STAGGER_ITEMS`: con `animationFillMode: "both"`
   * cada item está invisible hasta que le toca, así que un retardo lineal hacía
   * que una lista de 100 canciones tardase 2.5s en aparecer del todo — y como
   * `App.jsx` remonta la vista en cada cambio de pestaña (`key={tab}`), esa
   * espera se repetía al volver a la pantalla. Con el tope, el peor caso son
   * 300ms y la lista se percibe instantánea.
   *
   * @param {number} index - Índice del item en la lista
   */
  staggerFast: (index) => ({
    animationName: "sw-fade-slide-up",
    animationDuration: "0.3s",
    animationTimingFunction: SPRING,
    animationFillMode: "both",
    animationDelay: `${Math.min(index, MAX_STAGGER_ITEMS) * 25}ms`,
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
//  GLASSMORPHISM — Apple Liquid Glass Design System
//  "Build nav/toolbars/sheets as translucent layers with backdrop-filter."
//  "Material weight encodes hierarchy: darker = structural, lighter = interactive."
//
//  ⚠️  GLASS es la ÚNICA fuente de materiales translúcidos. Existía un objeto
//      `MATERIALS` duplicado (mismos usos, valores distintos) que ningún
//      componente consumía: se eliminó para no tener dos verdades para lo mismo.
//
// ── Re-export desde playerStyles (fuente única de verdad) ───────────────────
export { BTN_SHAPES, getBtnShapeStyle, BAR_STYLES } from "./playerStyles";

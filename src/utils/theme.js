/**
 * OpenWave Lumina — Design System Tokens
 *
 * Basado en DESIGN.md — OpenWave Lumina Design System.
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

//  PALETA COMPLETA — Material Design 3 (desde DESIGN.md YAML)

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

  // Especiales OpenWave
  bgPlayer: "#05050a",
  accentFallback: "#7c3aed",
};

//  COLORES DE USO — Jerarquía de texto y tokens funcionales
//
// Jerarquía de texto (desde DESIGN.md — sección Colors):
//   Primary:   #ffffff        — headers, estados activos
//   Secondary: 60% white      — metadata, navegación inactiva
//   Tertiary:  40% white      — metadatos secundarios (nombres de artista)
//   Muted:     25% white      — timestamps, detalles técnicos

export const COLORS = {
  // Fondos (desde PALETTE + extras funcionales)
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
  surfaceApp: "#0b0b10",
  surfaceInset: "#121217",
  surfaceRaised: "#191920",
  // Escalera tonal M3 cableada (roles que YA estaban en PALETTE)
  // Superficies planas (tarjetas, filas, rellenos de modal): profundidad por
  // TONO de la escalera `surfaceContainer*` en vez de blanco translúcido —
  // la filosofía de elevación de Material 3 y la de PERFORMANCE.md §1/§7
  // (capas planas SIN blur). Los acentos/estados activos siguen siendo
  // `--neon-*`; los cristales de shell/overlays no se tocan.
  surfaceCard: PALETTE.surfaceContainerLow, // reposo (antes blanco 4%)
  surfaceCardHover: PALETTE.surfaceContainerHigh, // hover (antes blanco 8%)
  surfaceSearchbar: "rgba(255,255,255,.06)", // chrome de shell, se queda cristal
  surfaceNav: PALETTE.surfaceContainer, // hover de filas (antes blanco 5%)
  surfaceSettings: "rgba(5,5,10,.97)",
  surfaceTitleBar: "rgba(10,10,15,.92)",
  surfaceCoverBg: "#111",

  // Texto (jerarquía desde DESIGN.md prose)
  //    NOTA: el fondo de la app SIEMPRE es oscuro (#0a0a0f o #000), por lo que
  //    los textos permanecen blancos en todo momento. Solo elementos UI que
  //    usan el color acento como FONDO deben usar contraste dinámico (--neon-fg).
  textPrimary: "#ffffff",
  textSecondary: "rgba(255,255,255,.72)",
  textTertiary: "rgba(255,255,255,.62)",
  textMuted: "rgba(255,255,255,.58)",
  textDimmest: "rgba(255,255,255,.55)",
  textPlayerTitle: "rgba(255,255,255,.94)",
  textPlayerArtist: "rgba(255,255,255,.62)",

  // On-surface desde paleta
  onSurface: PALETTE.onSurface,
  onSurfaceVariant: PALETTE.onSurfaceVariant,
  onBackground: PALETTE.onBackground,

  // Acento dinámico
  accentDefault: "#a78bfa",
  accentFallback: PALETTE.accentFallback,
  accentDefaultRgb: "167, 139, 250",
  white: "#ffffff",

  // Paleta completa de acento (M3)
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

  // Estados
  error: PALETTE.error,
  onError: PALETTE.onError,
  errorContainer: PALETTE.errorContainer,
  onErrorContainer: PALETTE.onErrorContainer,
  errorText: "#f87171",
  likeColor: "#f43f5e",
  successColor: "#22c55e",

  // Neutros / bordes
  borderSubtle: "rgba(255,255,255,.06)",
  borderLight: "rgba(255,255,255,.1)",
  borderActive: "rgba(255,255,255,.18)",
  outline: PALETTE.outline,
  outlineVariant: PALETTE.outlineVariant,

  // Iconos
  iconDefault: "rgba(255,255,255,.25)",
  iconActive: "rgba(255,255,255,.5)",
  iconDim: "rgba(255,255,255,.35)",
  iconDimmer: "rgba(255,255,255,.2)",
  placeholderIcon: "#2e2e45",
  settingsIcon: "rgba(255,255,255,.7)",

  // Misc
  scrollbar: "rgba(255,255,255,.12)",
  scrollbarHover: "rgba(255,255,255,.25)",
  progressTrack: "rgba(255,255,255,.10)",
  progressTime: "rgba(255,255,255,.62)",
  cardNumber: "rgba(255,255,255,.2)",
  titleBarText: "rgba(255,255,255,.45)",
  winCtrlDefault: "rgba(255,255,255,.5)",
  black: "#000",
  inverseSurface: PALETTE.inverseSurface,
  inverseOnSurface: PALETTE.inverseOnSurface,
  surfaceTint: PALETTE.surfaceTint,
};

//  TIPOGRAFÍA
//
// DM Sans ofrece 400, 500, 600 y 700; 800/900 se recortan a 700. Jerarquía:
// headlines 700, subheading 600, body y caption 500.

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

  // Apple Design: tracking size-specific, leading inverso
  //    "Large display text wants negative tracking; small text wants
  //     slightly positive tracking for legibility." — WWDC 2020

  // Headlines — tracking negativo en texto grande, leading apretado
  h1: {
    fontFamily: FONT_FAMILY,
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  h1Mobile: {
    fontFamily: FONT_FAMILY,
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  h2: {
    fontFamily: FONT_FAMILY,
    fontSize: "18px",
    fontWeight: "600",
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
  },

  // Subheading (upper-case, usado para etiquetas de sección tipo "RECOMENDADO")
  subheading: {
    fontFamily: FONT_FAMILY,
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "16px",
    letterSpacing: "0.04em",
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
    fontWeight: "400",
    lineHeight: 1.43,
    letterSpacing: "0",
  },

  // Caption — artista, metadatos secundarios — tracking sutil positivo
  caption: {
    fontFamily: FONT_FAMILY,
    fontSize: "12px",
    fontWeight: "500",
    lineHeight: 1.35,
    letterSpacing: "0.01em",
  },

  // Metadata (la más pequeña) — tracking positivo para legibilidad
  metadata: {
    fontFamily: FONT_FAMILY,
    fontSize: "12px",
    fontWeight: "500",
    lineHeight: 1.35,
    letterSpacing: "0.01em",
  },

  // Alias para compatibilidad con código existente
  h1Alias: {
    fontFamily: FONT_FAMILY,
    fontSize: "28px",
    fontWeight: "700",
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  /** alias: subheading */
  h3: {
    fontFamily: FONT_FAMILY,
    fontSize: "12px",
    fontWeight: "600",
    letterSpacing: ".04em",
    textTransform: "uppercase",
    lineHeight: 1.3,
  },
  /** alias: label */
  h4: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "600", lineHeight: 1.3 },
  /** alias: metadata */
  small: { fontFamily: FONT_FAMILY, fontSize: "12px", fontWeight: "500", lineHeight: 1.35 },
  sectionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: "12px",
    fontWeight: "600",
    letterSpacing: ".04em",
    textTransform: "uppercase",
  },

  // Body alias
  bodyAlias: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "400", lineHeight: 1.43 },
  captionAlias: { fontFamily: FONT_FAMILY, fontSize: "12px", fontWeight: "500", lineHeight: 1.35 },
  smallAlias: { fontFamily: FONT_FAMILY, fontSize: "12px", fontWeight: "500", lineHeight: 1.35 },
  microAlias: { fontFamily: FONT_FAMILY, fontSize: "12px", fontWeight: "500", lineHeight: 1.35 },

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
  navActive: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "600" },
  navInactive: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "500" },

  // Branding
  brand: { fontFamily: FONT_FAMILY, fontSize: "14px", fontWeight: "700", letterSpacing: "-.2px" },
  titleBar: { fontFamily: FONT_FAMILY, fontSize: "12px", fontWeight: "600", letterSpacing: ".3px" },
};

//  RADIOS DE BORDE
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
  cover: "12px",
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

//  ESPACIADOS
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
  sidebar: { width: "200px", pad: "16px", navPad: "0 16px" },

  /** Filas de canciones */
  row: { pad: "8px 16px", gap: "8px" },

  /** Tarjetas */
  card: { gap: "16px", innerPad: "16px" },

  /** Búsqueda */
  search: { pad: "8px 16px" },

  /** Title bar */
  titleBar: { height: "32px", pad: "0 8px 0 16px" },

  /** Secciones (container-margin: 24px) */
  section: { marginBottom: "24px", marginBottomSm: "16px" },

  /** Player */
  player: { pad: "8px 16px" },

  /** Contenido principal */
  content: { pad: "24px" },

  /** Letras */
  lyrics: { pad: "48px 64px 96px 48px" },

  /** Settings */
  settings: { headerPad: "16px 24px 12px", sectionPad: "24px" },

  /** Gutters (4/8/16/24) */
  gap: {
    tight: "4px",
    normal: "8px",
    wide: "16px",
    xwide: "16px",
    xxwide: "24px",
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

//  SOMBRAS Y GLOWS
//
// Los neones se acompañan de sombras multicapa:
//   - Glow primario: 44% opacity
//   - Glow difuso exterior: 22% opacity
// (desde DESIGN.md — Glow Effects)

export const SHADOWS = {
  /** Elevación contenida: el acento identifica, no ilumina. */
  neonGlow: () => "0 8px 24px rgba(0,0,0,.28)",

  /** Botón play — elevación discreta dentro del player */
  playBtn: () => "0 2px 8px rgba(0,0,0,.28)",

  /** Slider thumb */
  sliderThumb: () => "0 1px 3px rgba(0,0,0,.35)",
  sliderThumbHover: () => "0 1px 3px rgba(0,0,0,.35)",
  sliderThumbFocus: (color) => `0 0 0 2px #0a0a0f, 0 0 0 4px ${color}`,

  /** Popup crossfade */
  popup: "0 8px 24px rgba(0,0,0,.38)",

  /** Botón cerrar (lyrics) */
  closeBtn: "inset 0 1px 0 rgba(255,255,255,.10)",

  /** Portada en lyrics */
  lyricsCover: "0 8px 30px rgba(0,0,0,.5)",

  /** Settings close */
  settingsClose: "inset 0 1px 0 rgba(255,255,255,.1)",

  /** Botón ajustes sidebar: anillo nítido de estado, sin halo */
  settingsBtn: (color) => `0 0 0 2px ${color}cc`,

  /**
   * Sombras de separación — sustituyen a las líneas de contorno de 1px
   * (titlebar, encabezados, filas de lista, cabecera/pie de modales). La
   * jerarquía la da el material y la sombra, nunca un aro fino.
   */
  /** Zona alta sobre contenido (titlebar, cabeceras de panel) */
  sepZone: "0 1px 0 rgba(255,255,255,.05)",

  /** Debajo de una fila de lista o un separador interno */
  sepRow: "0 1px 0 rgba(255,255,255,.04)",

  /** Por encima de un pie de modal/hoja */
  sepUp: "0 -1px 0 rgba(255,255,255,.05)",

  /** Laterales: sombra de la barra lateral sobre el contenido */
  sepRight: "0 0 0 1px rgba(255,255,255,.05)",
};

//  TRANSICIONES
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

//  GLASSMORPHISM — Apple Liquid Glass Design System
//  "Build nav/toolbars/sheets as translucent layers with backdrop-filter."
//  "Material weight encodes hierarchy: darker = structural, lighter = interactive."

export const GLASS = {
  /** Player bar — Liquid Glass: translucent + light blur. Es LA única
   *  superficie de la shell que difumina: el scroll de las vistas y las
   *  letras de karaoke pasan por detrás (hay movimiento real que difuminar).
   *  Restaurado tras la atribución fina (comparación A−C): el 1.80% GPU de
   *  Letras era la cadena `filter: blur()` de la capa de fondo, no los
   *  backdrops (medidos ≈0: el compositing cachea los frosted estáticos).
   *  Sin `saturate`: superficie permanente a ancho completo.
   *  En modo Rendimiento/software renderer lo desactiva `perf-blur-off`. */
  player: {
    background: "rgba(10,10,18,.18)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 4px 16px rgba(0,0,0,.22)",
  },

  /** Sidebar — superficie estructural plana. No hay contenido en movimiento
   *  por detrás, así que no lleva blur ni un degradado que compita con la
   *  biblioteca. El acento queda para el estado activo. */
  sidebar: {
    background: COLORS.surfaceApp,
  },

  /** Nav items — fila plana; el hover es un cambio de tono, no otra capa de
   *  cristal. */
  navItem: {
    background: "transparent",
    boxShadow: "none",
  },

  /** Nav item activo — relleno tonal discreto; el acento no pinta toda la
   *  navegación. */
  navItemActive: (accentColor) => ({
    background: `color-mix(in srgb, ${accentColor} 12%, rgba(22,22,28,.92))`,
    boxShadow: "none",
  }),

  /** Botón glass genérico — estilo Liquid Glass de LyricsView.
   *  Sin borde: el material (gradiente + brillo interior + sombra) es el que
   *  da el volumen; el contorno de 1px se veía como línea pegada.
   *  Sin backdrop-filter: sobre las superficies donde se usa (paneles y
   *  fondos estáticos) el blur era imperceptible, y al escalar en hover
   *  re-difuminaba su región en cada frame. */
  /** Control plano canónico para las superficies de contenido. */
  control: {
    background: "rgba(255,255,255,.06)",
    boxShadow: "none",
  },

  controlHover: {
    background: "rgba(255,255,255,.10)",
  },

  /** Botón plano heredado; las pantallas nuevas usan `control`. */
  btn: {
    background: "rgba(255,255,255,.06)",
    boxShadow: "none",
  },

  /** Hover de botón sobre superficie plana. */
  btnHover: {
    background: "rgba(255,255,255,.10)",
  },

  /** Hover sutil dentro de tarjetas y filas. */
  btnHoverSoft: {
    background: "rgba(255,255,255,.08)",
  },

  /** Botón play — color sólido del acento. La jerarquía la sostienen tamaño,
   *  forma y contraste; sin degradado ni halo. */
  playBtn: (accentColor) => ({
    background: accentColor,
    border: "none",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,.22), 0 2px 8px rgba(0,0,0,.24)`,
  }),

  /** Search bar — superficie plana dentro del contenido; el foco añade un
   *  anillo de acento, no un material nuevo. */
  searchbar: {
    background: "rgba(255,255,255,.06)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
  },

  /** Card / Album card — Liquid Glass SIN backdrop-filter: todos los
   *  consumidores (LibraryCard, AlbumCardRow, quick picks de Home) ya lo
   *  optaban out por medición — el blur por tarjeta creaba un backdrop root
   *  por fila sobre fondos estáticos. Gradiente, borde y sombra se conservan.
   *  Fondo ahora por ESCALERA TONAL M3 (surfaceContainer→Lowest, opaco):
   *  profundidad sin blur y sin re-blurar en cada repintado de detrás. */
  card: {
    background: COLORS.surfaceCard,
    border: "1px solid rgba(255,255,255,.08)",
    borderColor: "rgba(255,255,255,.08)",
    boxShadow: "none",
  },

  /** Card hover — un paso tonal, sin elevación ni degradado. */
  cardHover: {
    background: COLORS.surfaceCardHover,
    border: "1px solid rgba(255,255,255,.14)",
    borderColor: "rgba(255,255,255,.14)",
    boxShadow: "none",
  },

  /** Sheet / Modal — Liquid Glass con el desenfoque del modal DEVUELTO:
   *  `blur(40px)` (el radio original, sin `saturate`).
   *  Presupuesto de overlays (docs/PERFORMANCE.md §7): SOLO la superficie de
   *  cristal difumina y ahora con su radio visible; scrim, filas y capas
   *  internas, 0 filtros. Historia: con blur(10px) saturate(140%) un modal
   *  subía el uso de iGPU del 33 % al 76 % sostenido — no por el radio,
   *  sino porque el backdrop se re-ejecutaba en CADA repintado de detrás
   *  (progreso a 5 Hz, palabras del karaoke, hovers). `html.overlay-open` +
   *  `useOverlayActive` congelan TODO ese detrás (progreso, reloj de
   *  karaoke, animaciones y los blurs de la shell): con el fondo estático el
   *  compositor cachea el frosted, así que el coste en reposo lo decide el
   *  congelado y no el radio (la pasada extra solo se paga al abrir, en la
   *  animación de entrada que el A/B recorta). Regla: medición A/B antes de
   *  merge (§7); si la cifra lo condena, se baja el radio — no el principio
   *  "modal = cristal con desenfoque visible".
   *  Ojo: un scrim full-screen NUNCA debe llevar backdrop-filter (y,
   *  además, `html.perf-solid [style*="backdrop-filter"]` le pintaría el velo
   *  entero de color sólido en modo Rendimiento). */
  sheet: {
    background: "rgba(18,18,24,.93)",
    border: "1px solid rgba(255,255,255,.10)",
    borderColor: "rgba(255,255,255,.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.10), 0 24px 64px rgba(0,0,0,.5)",
    backdropFilter: "blur(40px)",
    WebkitBackdropFilter: "blur(40px)",
  },

  /** Title bar — superficie estructural plana, separada por un hairline. */
  titleBar: {
    background: COLORS.surfaceApp,
  },

  /** Volume / Crossfade popup / Toast — vidrio neutro transitorio. */
  popup: {
    background: "rgba(18,18,24,.84)",
    border: "1px solid rgba(255,255,255,.10)",
    borderColor: "rgba(255,255,255,.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.10), 0 8px 24px rgba(0,0,0,.38)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },

  /** Avisos temporales (toasts, banner de conexión, píldoras del vídeo) —
   *  EL MISMO material Liquid Glass del player bar (petición explícita):
   *  translúcido y con blur(10px) para ver a través de él, sin contorno y
   *  con letras blancas. Colores de estado PROHIBIDOS en estos avisos: ni
   *  verdes, ni rojos, ni ámbar — el tipo solo da semántica, nunca color.
   *  Las letras SIEMPRE blancas: sobre vidrio translúcido el negro no se
   *  lee. El ErrorBoundary apaga el blur (nada detrás que difuminar). */
  mensaje: {
    background: "rgba(10,10,18,.18)",
    border: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 4px 20px rgba(0,0,0,.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },

  /** Settings panel — Liquid Glass SIN backdrop-filter.
   *  Ajustes es una pantalla sin desenfoque (decisión de producto): la
   *  lectura la sostiene la base opaca del panel (`backgroundColor` en
   *  SettingsPanel) y el congelado de `overlay-open` mantiene el detrás
   *  parado mientras el panel está abierto. El cristal de modal (40px) aquí
   *  solo costaba al abrir y no aportaba visiblemente sobre fondo parado.
   *  - sin `border`: dibujaría un marco de 1px en los 4 bordes del viewport.
   *    La jerarquía la dan el `borderBottom` del header y los divisores de
   *    `SettingRow`. */
  settings: {
    background: COLORS.surfaceApp,
  },

  /** Window control buttons (minimize, maximize, close) */
  winCtrl: {
    background: "rgba(255,255,255,.06)",
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

//  LAYOUTS REUTILIZABLES

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
    // Solo las propiedades que cambian (fondo activo + hover): `all` hacía que
    // cualquier repintado de la fila entrase en la maquinaria de transiciones.
    transition:
      "background .15s cubic-bezier(.16,1,.3,1), border-color .15s cubic-bezier(.16,1,.3,1)",
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

//  FUNCIONES AYUDA

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

//  ANIMACIONES DE ENTRADA
//
// Solo se animan opacity y transform (composited). Stagger con
// `ANIMATIONS.fadeSlideUp(i * 40)`; las keyframes viven en App.jsx.
// prefers-reduced-motion se resuelve en el CSS de index.html: los estilos
// inline no pueden detectar media queries.

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

//  GLASSMORPHISM — Apple Liquid Glass Design System
//  "Build nav/toolbars/sheets as translucent layers with backdrop-filter."
//  "Material weight encodes hierarchy: darker = structural, lighter = interactive."
//
// GLASS es la ÚNICA fuente de materiales translúcidos. Existía un objeto
//      `MATERIALS` duplicado (mismos usos, valores distintos) que ningún
//      componente consumía: se eliminó para no tener dos verdades para lo mismo.
//
// Re-export desde playerStyles (fuente única de verdad)
export { BTN_SHAPES, getBtnShapeStyle, BAR_STYLES } from "./playerStyles";

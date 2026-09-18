---
name: SoundWave Lumina
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#37393a'
  surface-container-lowest: '#0c0f0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#282a2b'
  surface-container-highest: '#333535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c8c5cb'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#929095'
  outline-variant: '#47464b'
  surface-tint: '#c8c5cd'
  primary: '#c8c5cd'
  on-primary: '#303036'
  primary-container: '#0a0a0f'
  on-primary-container: '#7a797f'
  inverse-primary: '#5f5d64'
  secondary: '#cebdff'
  on-secondary: '#381385'
  secondary-container: '#4f319c'
  on-secondary-container: '#bea8ff'
  tertiary: '#ffb2b7'
  on-tertiary: '#67001b'
  tertiary-container: '#200004'
  on-tertiary-container: '#e33253'
  error: '#ef4444'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e4e1e9'
  primary-fixed-dim: '#c8c5cd'
  on-primary-fixed: '#1b1b20'
  on-primary-fixed-variant: '#47464c'
  secondary-fixed: '#e8ddff'
  secondary-fixed-dim: '#cebdff'
  on-secondary-fixed: '#21005e'
  on-secondary-fixed-variant: '#4f319c'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#121414'
  on-background: '#e2e2e2'
  surface-variant: '#333535'
  bg-player: '#05050a'
  accent-fallback: '#7c3aed'
  card-overlay: rgba(255, 255, 255, 0.04)
  card-hover: rgba(255, 255, 255, 0.08)
typography:
  display-lyrics:
    fontFamily: DM Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 1.35
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: DM Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 1.15
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: DM Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-md:
    fontFamily: DM Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 1.2
    letterSpacing: -0.015em
  subheading:
    fontFamily: DM Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: 0.05em
  label:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 1.45
  caption:
    fontFamily: DM Sans
    fontSize: 12.5px
    fontWeight: '500'
    lineHeight: 1.4
    letterSpacing: 0.01em
  metadata:
    fontFamily: DM Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 1.35
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 200px
  sidebar-pad: 14px
  nav-item-pad: 9px 12px
  row-pad: 8px 10px
  container-margin: 24px
  gutter-default: 12px
  gutter-tight: 6px
---

## Brand & Style

The design system is built on the philosophy of **Dynamic Immersion**. It transforms the interface into a living extension of the music by extracting colors from album artwork to drive the visual experience. The brand personality is professional, high-fidelity, and technologically advanced, targeting audiophiles who value both aesthetic beauty and functional precision.

The visual style is a blend of **Glassmorphism** and **Neo-Dark** aesthetics. It utilizes deep-space backgrounds, vibrant neon accents, and translucent surfaces to create a sense of depth and focus. The experience should feel expansive yet intimate, using soft glows and high-contrast typography to guide the user's attention through a lush, atmospheric environment.

## Colors

The palette is anchored by a deep-space black (`#0a0a0f`), providing a high-contrast foundation for the "Dynamic Theme" engine. While the primary accent is a neon violet (`#a78bfa`), the system is designed to be color-agnostic, replacing the primary accent with `--neon` tokens extracted from current track artwork.

**Text Hierarchy:**
- **Primary:** Pure white (#ffffff) for headers and active states.
- **Secondary:** 60% white opacity for metadata and inactive navigation.
- **Tertiary:** 40% white opacity for secondary metadata like artist names.
- **Muted:** 25% white opacity for timestamps and technical details.

**Glow Effects:**
Neon accents must be accompanied by multi-layered shadows: a primary glow at 44% opacity and a softer, diffused outer glow at 22% opacity to simulate light emission.

## Typography

This system relies on the **DM Sans** family, loading weights **400-700** (500 body, 600 labels/subheadings, 700 headlines/lyrics). Heavier weights keep a bold, professional presence against vibrant backgrounds without becoming aggressive on dense dark surfaces.

The hierarchy is strictly enforced:
- **Display & Headlines:** Use the heaviest weight available (700) with negative tracking for large text, creating clear entry points in a content-rich environment.
- **Lyrics:** Optimized for readability with tight letter spacing (-0.02em) and generous size (36px), so the user can focus on the narrative of the music.
- **Upper-case Subheadings:** Used for section labels (e.g., "RECOMMENDED FOR YOU") to differentiate navigation logic from content titles.
- **Small text:** Positive tracking (0.01-0.02em) for captions and metadata to preserve legibility.

## Layout & Spacing

The layout utilizes a **Fixed-Fluid Hybrid** model. A 200px fixed sidebar houses navigation, while the main content area uses a fluid grid to maximize the visual impact of album art.

**Grid Philosophy:**
Album and song cards utilize an `auto-fill` strategy with a minimum width of 160px. This ensures the layout feels balanced regardless of screen resolution.

**Rhythm:**
A core rhythm of 4px-6px increments is used for internal component spacing. Tight gutters (6px) are used for grouping related metadata, while wider gutters (12px) separate functional blocks like song titles and artist links.

## Elevation & Depth

Elevation in this design system is conveyed through **chromatic light and transparency** rather than physical shadows. 

1.  **Glassmorphism:** Overlays and sidebars use a base `rgba(0,0,0,.2)` transparency with a heavy backdrop-blur (minimum 20px) to maintain legibility while hinting at the content beneath.
2.  **Tonal Layers:** Cards use a subtle `4%` white opacity for resting states and `8%` for hover states.
3.  **Neon Glows:** Active elements (like the currently playing track or a focused button) emit light. This is achieved via a layered box-shadow using the current `--neon` variable.
4.  **Background Tints:** Radial gradients (`radial-gradient(ellipse at 30% 20%, ${accentColor}12 0%, transparent 70%)`) are placed behind content to create a cohesive atmosphere that shifts with the music.

## Shapes

The shape language is consistently soft and approachable. The signature corner radius of **12px** defines the identity of the UI, applied to navigation items, list rows, and search inputs. 

Specific overrides include:
- **Large Components (14px):** Album cards and modal popups.
- **Embedded Media (10px):** Small cover art inside the player bar.
- **Interactive Controls (Pill):** Play buttons and toggle tabs utilize a fully rounded pill shape for maximum distinctiveness.
- **Lyrics View Art (22px):** Larger radius used for full-screen immersive modes.

Borders are strictly reserved for "Active" states, using a 1.5px stroke in the current neon accent.

## Components

### Buttons & Chips
- **Primary Play Button:** Pill-shaped, uses the current neon accent as background. Features a `scale(1.1)` hover transition and a `0 0 12px` glow.
- **Navigation Items:** 12px radius, transparent background. On hover, apply `--bg-card-hover` and a subtle Y-axis lift of -2px.

### Cards (Album/Playlist)
- Background: `--bg-card` (4% white opacity).
- Transition: Smooth scale and Y-axis translation using `cubic-bezier(.16, 1, .3, 1)`.
- Border: On focus/active, apply `1.5px solid var(--neon-border)`.

### Lists & Row Items
- Song rows use a tight 8px vertical padding. 
- Background appears only on hover or active selection, utilizing `--neon-18` for the active track and `--bg-card-hover` for mouse-over.

### Input Fields
- Search Bar: 12px radius, `--bg-searchbar` (6% white opacity).
- Placeholder text uses `--text-tertiary`.

### Sliders (Progress/Volume)
- Track: 4px height, muted background.
- Fill: Current neon accent.
- Thumb: Pill-shaped, visible only on hover, with an `8px` neon glow.

### Motion Details
All component interactions must use the `cubic-bezier(.16, 1, .3, 1)` curve. Quick fades (0.12s) for buttons, and structural transitions (0.35s) for loading album art ensure the system feels responsive yet fluid.

## Dynamic Theme Engine

Album artwork drives the entire color system at runtime (`src/hooks/useDynamicTheme.js` + Rust `color_extract.rs`).

- **Extraction:** Colors are extracted from the current track cover (backend `/extract-colors/{videoId}`) and hydrated on the frontend via a canvas fallback.
- **`--neon` variable:** The accent is animated with `requestAnimationFrame` (lerp from the previous accent to the target, registered via `@property --neon` in `index.html`) so color changes glide instead of snapping.
- **Derived tokens:** `--neon-border`, `--neon-18` (active-row background), `--neon-fg` (contrast-aware foreground for accent-filled buttons — white on dark accents, near-black on bright accents like cream), `--neon-btn`.
- **Background tint:** `--bg-base` is derived from `color-mix(in srgb, var(--neon) 6%, <dark base>)`, tinting the whole app subtly.
- **Aurora & vignette:** `sidebarBgGradient()` paints a neon-tinted aurora; `vignetteOverlay()` adds a `color-mix(black 73%, var(--neon))` vignette for depth.
- **Grayscale covers:** Faces are skipped (`0x8 / `0x9` luminance buckets) to avoid skin-tone accents; all-black covers fall back to white.
- **Reduced motion:** `prefers-reduced-motion` disables `--neon` rAF transitions.

## Lyrics & Karaoke

`LyricsView` renders synchronized LRC lyrics as a karaoke experience (backend: LRCLib + YTMusic + Genius).

- **Parser (`src/utils/lrc.js`):** Handles multi-timestamp lines (`[00:12.00][01:10.00]Texto`), metadata tags (`[ti:]`, `[ar:]`), global/language offsets (`[offset:+500]`) and `m:ss[.xxx]` variants.
- **Typography:** 36px / weight 700 / tight tracking, sized from the `lyricsFontSize` setting (base ×1.15 active / ×0.85 surrounding).
- **Hierarchy:** Active line at full opacity with a neon glow; neighbors (≤2) at mid opacity; the rest dimmed to tertiary.
- **Word-progress karaoke:** The active line paints `--neon` progressively per character (`progressInLine × totalChars`), animated with the spring curve.
- **Auto-scroll & latch:** Smooth `scrollIntoView` centered on the active line; manual wheel/drag scroll latches control for 800ms and re-centers on resume (3s hold via `lyricsScrollResume`).
- **Loading:** `SkeletonLyrics` shows 15 shimmer bars whose height derives from the configured font size.
- **Cover art:** In immersive mode the cover uses a large 22px radius ("Lyrics View Art").

## Loading & Perceived Performance

- **Skeletons (`SkeletonLoader`):** Rows, cards, grids, sections, pages and lyrics follow the silhouette of the final content so nothing "jumps" when real data arrives.
- **Image fading:** Album art crossfades in (0.35s spring) instead of popping; the player bar uses a `blur(6px)` placeholder behind the final art.
- **Progressive immersion:** Dynamic background tint (`--bg-base`) is applied as soon as colors arrive, so the atmosphere is present before content finishes loading.

## Player Bar — True Liquid Glass

- `backdrop-filter: blur(50px) saturate(180%) brightness(1.05)` with a subtle translucent surface — the player bar reads as a physical frosted panel floating over artwork.
- The volume **slider thumb** is pill-shaped, visible only on hover, with an 8px neon glow.
- Progress fill, thumb glow and the equalizer all use `var(--neon)` so the player reacts visually to the current track's colors.
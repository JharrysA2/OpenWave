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
    fontFamily: Nunito Sans
    fontSize: 34px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Nunito Sans
    fontSize: 28px
    fontWeight: '900'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Nunito Sans
    fontSize: 24px
    fontWeight: '900'
    lineHeight: 32px
  headline-md:
    fontFamily: Nunito Sans
    fontSize: 20px
    fontWeight: '900'
    lineHeight: 28px
  subheading:
    fontFamily: Nunito Sans
    fontSize: 14px
    fontWeight: '800'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-lg:
    fontFamily: Nunito Sans
    fontSize: 13.5px
    fontWeight: '700'
    lineHeight: 18px
  body-md:
    fontFamily: Nunito Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  caption:
    fontFamily: Nunito Sans
    fontSize: 11.5px
    fontWeight: '600'
    lineHeight: 16px
  metadata:
    fontFamily: Nunito Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
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

This system relies on the **Nunito Sans** family, emphasizing heavy weights (600-900) to maintain a bold, professional presence against vibrant backgrounds. 

The hierarchy is strictly enforced: 
- **Display & Headlines:** Use the heaviest weights (900) to create clear entry points in a content-rich environment. 
- **Lyrics:** Optimized for readability with tight letter spacing and substantial size, allowing the user to focus on the narrative of the music. 
- **Upper-case Subheadings:** Used for section labels (e.g., "RECOMMENDED FOR YOU") to differentiate navigation logic from content titles.

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
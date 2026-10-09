import React from "react";
import { FONT } from "../constants";
import { RADIUS, TRANSITIONS, GLASS, sidebarBgGradient } from "../utils/theme";
import { Ic } from "../icons/Icons";

export const Sidebar = React.memo(function Sidebar({
  tab,
  accentColor,
  likedCount,
  playlists,
  selectedPlaylist,
  onTabChange,
  onSelectPlaylist,
  onOpenSettings,
  onCreatePlaylist,
  visible = true,
  onToggle,
}) {
  const navItems = [
    ["home", Ic.home, "Inicio"],
    ["search", Ic.search, "Buscar"],
    ["liked", Ic.heart(likedCount > 0, 18), "Me gusta"],
    ["history", Ic.history(18), "Historial"],
    ["downloads", Ic.download(18), "Descargas"],
  ];

  return (
    <div
      className="app-sidebar"
      data-state={visible ? "open" : "closed"}
      style={{
        width: visible ? "200px" : "0px",
        height: "100%",
        flexShrink: 0,
        overflow: "hidden",
        // Retracción suave 200→0 con la easings de la casa. El borde vive
        // en el núcleo (abajo) para que con width:0 no quede la línea de
        // 1px del border-right colgando. html.perf-anim-off / app-sleep
        // congelan la transición solos (CSS !important sobre inline).
        transition: "width .28s cubic-bezier(.16,1,.3,1)",
        display: "flex",
        flexDirection: "column",
        ...GLASS.sidebar,
        background: sidebarBgGradient(),
      }}
    >
      {/* ── Núcleo a ancho fijo (200px): el contenedor lo recorta al
          retraer; aquí dentro el texto NUNCA se exprime y el deslizamiento
          + atenuación dan la entrada/salida suave. visibility con la misma
          transición mantiene visible el contenido durante la animación y
          lo vuelve invisible (fuera del tab-order) al terminar. ── */}
      <div
        style={{
          width: "200px",
          minWidth: "200px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid color-mix(in srgb, var(--neon) 30%, rgba(255,255,255,.06))`,
          transform: visible ? "translateX(0)" : "translateX(-16px)",
          opacity: visible ? 1 : 0,
          visibility: visible ? "visible" : "hidden",
          transition:
            "transform .28s cubic-bezier(.16,1,.3,1), " +
            "opacity .18s cubic-bezier(.16,1,.3,1), " +
            "visibility .28s linear",
        }}
      >
        {/* Logo + controls — Apple-style header */}
        <div
          style={{
            // Padding-x 10px = alineado con los items de nav (padding 10):
            // el hueco derecho queda justo para [« 26px][⚙ 32px] sin que la
            // marca (ellipsis como red) se recorte nunca en DM Sans.
            padding: "16px 10px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "4px",
            borderBottom: "1px solid rgba(255,255,255,.04)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
            {Ic.waveIcon}
            <span
              style={{
                fontSize: "15px",
                fontWeight: "800",
                letterSpacing: "-.3px",
                color: "rgba(255,255,255,.92)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              OpenWave
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            {/* ── Retraer barra lateral («) ── */}
            <button
              data-testid="sidebar-collapse-btn"
              onClick={onToggle}
              title="Ocultar barra lateral"
              aria-label="Ocultar barra lateral"
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "8px",
                flexShrink: 0,
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,.5)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition:
                  "background .15s cubic-bezier(.16,1,.3,1), color .15s cubic-bezier(.16,1,.3,1), transform .15s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.9)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.10)";
                e.currentTarget.style.color = "rgba(255,255,255,.9)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "rgba(255,255,255,.5)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 6 L8.5 12 L14.5 18" />
              </svg>
            </button>
            {/* ── Settings button — Apple-style: circle with subtle glass ── */}
            <button
              data-testid="settings-btn"
              onClick={onOpenSettings}
              title="Ajustes"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                flexShrink: 0,
                ...GLASS.btn,
                color: "rgba(255,255,255,.55)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition:
                  "background .15s cubic-bezier(.16,1,.3,1), color .15s cubic-bezier(.16,1,.3,1), transform .15s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.9)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.12)";
                e.currentTarget.style.color = "rgba(255,255,255,.85)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,.06)";
                e.currentTarget.style.color = "rgba(255,255,255,.55)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Nav — glass style items con contraste adaptativo */}
        <nav style={{ padding: "4px 10px" }}>
          {navItems.map(([t, icon, label]) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "9px 12px",
                borderRadius: "12px",
                cursor: "pointer",
                ...(tab === t ? GLASS.navItemActive(accentColor) : GLASS.navItem),
                color: tab === t ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.55)",
                fontWeight: tab === t ? "700" : "500",
                fontSize: "13px",
                marginBottom: "4px",
                fontFamily: FONT,
                transition:
                  "background .12s cubic-bezier(.16,1,.3,1), color .12s cubic-bezier(.16,1,.3,1), border-color .12s cubic-bezier(.16,1,.3,1), transform .12s cubic-bezier(.16,1,.3,1), font-weight .12s cubic-bezier(.16,1,.3,1)",
              }}
              onMouseDown={(e) => {
                // Apple: instant feedback on pointer-down
                e.currentTarget.style.transform = "scale(0.97)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              onMouseEnter={(e) => {
                if (tab !== t) {
                  e.currentTarget.style.background = "rgba(255,255,255,.09)";
                  e.currentTarget.style.color = "rgba(255,255,255,.88)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,.12)";
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t) {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)";
                  e.currentTarget.style.color = "rgba(255,255,255,.55)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,.06)";
                }
              }}
            >
              <span style={{ width: "18px", display: "flex", justifyContent: "center" }}>
                {icon}
              </span>
              {label}
            </button>
          ))}
        </nav>

        {/* ── Playlists section ── */}
        <div style={{ padding: "8px 10px", marginTop: "8px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px 6px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                fontWeight: "800",
                color: "rgba(255,255,255,.35)",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Playlists
            </span>
            <button
              onClick={onCreatePlaylist}
              style={{
                ...GLASS.btn,
                borderRadius: RADIUS.full,
                width: "24px",
                height: "24px",
                cursor: "pointer",
                color: "rgba(255,255,255,.45)",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: TRANSITIONS.fast,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgba(255,255,255,.9)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255,255,255,.45)";
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          {playlists.length === 0 ? (
            <div
              style={{
                padding: "12px 12px 8px",
                fontSize: "11px",
                color: "rgba(255,255,255,.2)",
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              Sin playlists aún
            </div>
          ) : (
            playlists.map((pl) => {
              const isActive = tab === "playlist" && selectedPlaylist?.id === pl.id;
              return (
                <button
                  key={pl.id}
                  onClick={() => onSelectPlaylist(pl)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    background: isActive
                      ? "linear-gradient(135deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.04) 100%)"
                      : "transparent",
                    border: isActive ? `1px solid rgba(255,255,255,.08)` : "1px solid transparent",
                    boxShadow: isActive
                      ? "inset 0 1px 0 rgba(255,255,255,.08), 0 2px 8px rgba(0,0,0,.15)"
                      : "none",
                    color: isActive ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.5)",
                    fontWeight: isActive ? "700" : "500",
                    fontSize: "12.5px",
                    fontFamily: FONT,
                    transition:
                      "background .15s cubic-bezier(.16,1,.3,1), border-color .15s cubic-bezier(.16,1,.3,1), color .15s cubic-bezier(.16,1,.3,1), box-shadow .15s cubic-bezier(.16,1,.3,1), font-weight .15s cubic-bezier(.16,1,.3,1)",
                    textAlign: "left",
                    marginBottom: "3px",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        "linear-gradient(135deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,.05)";
                      e.currentTarget.style.color = "rgba(255,255,255,.85)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.color = "rgba(255,255,255,.5)";
                    }
                  }}
                >
                  {/* Mini portada o icono */}
                  {pl.cover || pl.first_cover ? (
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        overflow: "hidden",
                        flexShrink: 0,
                        boxShadow: "0 2px 8px rgba(0,0,0,.3)",
                      }}
                    >
                      <img
                        src={pl.cover || pl.first_cover}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        flexShrink: 0,
                        background: pl.color
                          ? `linear-gradient(135deg, ${pl.color}44, ${pl.color}15)`
                          : "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: pl.color
                          ? `1px solid ${pl.color}33`
                          : "1px solid rgba(255,255,255,.06)",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={pl.color || "rgba(255,255,255,.3)"}
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.3,
                      }}
                    >
                      {pl.name}
                    </div>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "rgba(255,255,255,.25)",
                        fontWeight: "600",
                        marginTop: "1px",
                      }}
                    >
                      {pl.song_count || 0} {(pl.song_count || 0) === 1 ? "canción" : "canciones"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});

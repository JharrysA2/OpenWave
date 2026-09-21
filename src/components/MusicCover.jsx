import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import { API } from "../constants";
import { Ic } from "../icons/Icons";
import { getCoverSources } from "../utils/thumbnails";

const MusicCover = memo(function MusicCover({
  thumbnails,
  src,
  alt,
  style,
  className,
  displaySize = 176,
  priority = false,
}) {
  // ── Memo: sources, srcset y blur ──────────────────────────────────
  const { allSrcs, srcSetStr, blurSrc } = useMemo(
    () => getCoverSources({ thumbnails, src }),
    [thumbnails, src],
  );

  const [srcIdx, setSrcIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const stableKey =
    Array.isArray(thumbnails) && thumbnails.length
      ? (thumbnails.find((t) => (t.width || 0) >= 226) || thumbnails[thumbnails.length - 1])?.url ||
        src ||
        ""
      : src || "";

  useEffect(() => {
    setSrcIdx(0);
    setLoaded(false);
    setFailed(false);
    setUseProxy(false);
  }, [stableKey]);

  const handleError = useCallback(() => {
    setSrcIdx((prev) => {
      const next = prev + 1;
      if (next >= allSrcs.length) {
        setFailed(true);
        return prev;
      }
      setLoaded(false);
      return next;
    });
  }, [allSrcs.length]);

  const activeSrc = allSrcs[srcIdx] || "";

  const useSrcSet = srcIdx === 0 && srcSetStr;

  const proxyFallback = useMemo(() => {
    const base = Array.isArray(thumbnails) && thumbnails.length ? thumbnails[0]?.url : src;
    if (!base) return null;
    return `${API}/thumbnail-proxy?url=${encodeURIComponent(base)}`;
  }, [thumbnails, src]);

  const [useProxy, setUseProxy] = useState(false);
  const displaySrc = useProxy ? proxyFallback : activeSrc;

  if ((!activeSrc && !proxyFallback) || failed) {
    return (
      <div
        style={{
          ...style,
          background: "rgba(255,255,255,.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#2e2e45",
        }}
      >
        {Ic.music}
      </div>
    );
  }

  return (
    <div
      style={{
        ...style,
        position: "relative",
        overflow: "hidden",
        background: "rgba(255,255,255,.04)",
      }}
      className={className}
    >
      {/* ── Blur placeholder (visible hasta que carga la imagen real) ── */}
      {blurSrc && !loaded && (
        <img
          src={blurSrc}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(8px) saturate(0.8) brightness(1.05)",
            transform: "scale(1.12)",
            pointerEvents: "none",
            opacity: 0.7,
          }}
        />
      )}

      {/* ── Imagen principal ────────────────────────────────────────── */}
      <img
        key={displaySrc}
        ref={(el) => {
          if (el && el.complete && el.naturalWidth > 0 && !loaded) {
            setLoaded(true);
          }
        }}
        src={displaySrc || ""}
        srcSet={!useProxy && useSrcSet ? useSrcSet : undefined}
        sizes={!useProxy && useSrcSet ? `${displaySize}px` : undefined}
        alt={alt || ""}
        crossOrigin={undefined}
        loading={priority ? "eager" : "lazy"}
        fetchpriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!useProxy && proxyFallback) {
            // ⭐ Primer error: intentar vía proxy (bypass CORS)
            setUseProxy(true);
            setLoaded(false);
          } else if (useProxy) {
            // ⭐ Segundo error (proxy también falló): NO mostrar fallback aún.
            //    Bajar al siguiente tamaño de la cadena (handleError).
            //    Si no hay más tamaños, handleError mostrará fallback.
            setUseProxy(false);
            handleError();
          } else {
            handleError();
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          opacity: loaded ? 1 : 0,
          transition: "opacity .35s cubic-bezier(.16,1,.3,1)",
        }}
      />
    </div>
  );
});

export { MusicCover };

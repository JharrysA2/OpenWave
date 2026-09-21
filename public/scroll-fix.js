// Intercept scroll BEFORE React loads - capture phase catches it first
(function() {
  var resetScroll = function() {
    if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };
  // passive: true — el handler nunca llama preventDefault, así que marcarlo
  // como no-pasivo solo obligaba al navegador a esperar al hilo principal en
  // cada evento de scroll (jank al desplazar listas, p.ej. Ajustes).
  document.addEventListener('scroll', resetScroll, { capture: true, passive: true });
  window.addEventListener('scroll', resetScroll, { capture: true, passive: true });
  // Also reset on focus changes (WebView2 scrolls to focused element)
  document.addEventListener('focusin', function() { setTimeout(resetScroll, 0); }, true);
})();

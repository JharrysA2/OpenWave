// Intercept scroll BEFORE React loads - capture phase catches it first
(function() {
  var resetScroll = function() {
    if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };
  document.addEventListener('scroll', resetScroll, { capture: true, passive: false });
  window.addEventListener('scroll', resetScroll, { capture: true, passive: false });
  // Also reset on focus changes (WebView2 scrolls to focused element)
  document.addEventListener('focusin', function() { setTimeout(resetScroll, 0); }, true);
})();

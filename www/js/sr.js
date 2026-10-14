/* Screen-reader helpers (v1.9): polite live region + "is this an assistive/keyboard activation?" */
(function (root) {
  'use strict';
  var live = null, t = null;
  var SR = {
    say: function (msg) {
      if (typeof document === 'undefined' || !msg) return;
      if (!live) {
        live = document.getElementById('sr-live');
        if (!live) { live = document.createElement('div'); live.id = 'sr-live'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status'); document.body.appendChild(live); }
      }
      clearTimeout(t); live.textContent = '';
      t = setTimeout(function () { live.textContent = msg; }, 60);
    },
    /** TalkBack double-tap and keyboard Enter/Space produce clicks with detail 0 (no real pointer) */
    assistive: function (e) { return !!e && e.type === 'click' && !e.detail; },
    COLORS: ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'cyan', 'lime'],
    last: function () { return live ? live.textContent : ''; }
  };
  root.SR = SR;
  if (typeof module !== 'undefined' && module.exports) module.exports = SR;
})(typeof window !== 'undefined' ? window : globalThis);

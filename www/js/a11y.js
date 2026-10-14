/*
 * Accessibility settings (v1.8): reduce motion, larger text, high contrast.
 * Applies classes on <html>: a11y-reduce, a11y-large, a11y-contrast.
 * Reduce motion is tri-state: unset = follow the OS "remove animations" preference live;
 * true/false = the player's explicit choice. When reduced, every Web Animations API
 * animation is shortened to ~instant.
 */
(function (root) {
  'use strict';
  var KEYS = ['reduceMotion', 'largeText', 'contrast'];
  function osReduced() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  /** fill missing a11y settings (reduceMotion stays unset = follow the OS) */
  function defaults(settings) {
    settings = settings || {};
    if (typeof settings.reduceMotion !== 'boolean') delete settings.reduceMotion;
    if (typeof settings.largeText !== 'boolean') settings.largeText = false;
    if (typeof settings.contrast !== 'boolean') settings.contrast = false;
    return settings;
  }
  var A = { KEYS: KEYS, defaults: defaults, osReduced: osReduced, _mode: undefined };
  /** effective reduce-motion: explicit choice wins, otherwise the OS preference */
  A.effective = function (mode, os) { return mode === true || (mode !== false && !!os); };
  A.reduced = function () { return A.effective(A._mode, osReduced()); };
  /** scale an animation duration (ms) for reduced motion */
  A.ms = function (ms) { return A.reduced() ? Math.min(ms, 40) : ms; };
  A.apply = function (settings) {
    defaults(settings);
    A._mode = settings.reduceMotion;
    if (typeof document === 'undefined') return settings;
    var cl = document.documentElement.classList;
    cl.toggle('a11y-reduce', A.reduced()); cl.toggle('a11y-large', !!settings.largeText); cl.toggle('a11y-contrast', !!settings.contrast);
    return settings;
  };
  /** wire checkbox ids -> setting keys; onChange(key) after persist */
  A.bind = function (settings, persist, ids, onChange) {
    Object.keys(ids).forEach(function (key) {
      var el = document.getElementById(ids[key]); if (!el) return;
      el.checked = key === 'reduceMotion' ? A.reduced() : !!settings[key];
      el.addEventListener('change', function () { settings[key] = !!el.checked; A.apply(settings); persist(); if (onChange) onChange(key); });
    });
  };
  A.sync = function (settings, ids) { A.apply(settings); Object.keys(ids).forEach(function (k) { var el = document.getElementById(ids[k]); if (el) el.checked = k === 'reduceMotion' ? A.reduced() : !!settings[k]; }); };

  /**
   * v1.9 shop preview: "Preview with" chips (High contrast / Larger text / Symbols) in the shop panel.
   * Temporary only: nothing is saved, and the real settings are restored when the shop closes.
   */
  A.preview = { contrast: null, largeText: null, marks: null };
  A.marksOn = function (settings) { return A.preview.marks != null ? A.preview.marks : !!(settings && settings.marks); };
  A.previewBar = function (o) {
    var ov = document.getElementById(o.overlay || 'shop'); if (!ov) return null;
    var panel = ov.querySelector('.panel'), anchor = panel.querySelector('.note');
    var bar = document.createElement('div'); bar.className = 'a11y-preview'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Preview themes with accessibility options');
    bar.innerHTML = '<span class="a11y-preview-l">Preview with:</span>';
    var chips = [['contrast', 'High contrast'], ['largeText', 'Larger text']].concat(o.marks ? [['marks', 'Symbols']] : []);
    function cur(k) { return A.preview[k] != null ? A.preview[k] : !!o.settings[k]; }
    function paint() {
      var cl = document.documentElement.classList;
      cl.toggle('a11y-contrast', cur('contrast')); cl.toggle('a11y-large', cur('largeText'));
      if (o.marks) document.body.classList.toggle('marks', cur('marks'));
      Array.prototype.forEach.call(bar.querySelectorAll('button'), function (b) { var on = cur(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
    chips.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.k = c[0]; b.textContent = c[1];
      b.addEventListener('click', function () { A.preview[c[0]] = !cur(c[0]); paint(); if (o.rerender) o.rerender(); if (o.sfx) o.sfx(); });
      bar.appendChild(b);
    });
    if (anchor && anchor.nextSibling) panel.insertBefore(bar, anchor.nextSibling); else panel.appendChild(bar);
    function reset() { A.preview = { contrast: null, largeText: null, marks: null }; A.apply(o.settings); if (o.marks) document.body.classList.toggle('marks', !!o.settings.marks); if (o.rerender) o.rerender(); paint(); }
    new MutationObserver(function () { if (ov.classList.contains('hidden')) { if (A.preview.contrast != null || A.preview.largeText != null || A.preview.marks != null) reset(); } else paint(); })
      .observe(ov, { attributes: true, attributeFilter: ['class'] });
    paint();
    return { reset: reset, paint: paint };
  };
  if (typeof Element !== 'undefined' && Element.prototype.animate && !Element.prototype.animate.__a11y) {
    var orig = Element.prototype.animate;
    var wrapped = function (frames, opts) {
      if (A.reduced()) {
        if (typeof opts === 'number') opts = 1;
        else opts = Object.assign({}, opts || {}, { duration: 1, delay: 0, iterations: 1 });
      }
      return orig.call(this, frames, opts);
    };
    wrapped.__a11y = true; Element.prototype.animate = wrapped;
  }
  root.A11y = A;
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
})(typeof window !== 'undefined' ? window : globalThis);

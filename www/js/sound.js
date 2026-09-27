/* Tiny WebAudio sound effects – no asset files. */
(function () {
  'use strict';
  var ctx = null;
  var enabled = true;
  function ac() {
    if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, delay, slideTo) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var S = {
    setEnabled: function (v) { enabled = !!v; },
    select: function () { if (enabled) tone(520, 0.08, 'sine', 0.15, 0, 700); },
    drop: function () { if (enabled) { tone(300, 0.12, 'triangle', 0.25, 0, 180); } },
    error: function () { if (enabled) { tone(180, 0.12, 'square', 0.06); tone(140, 0.14, 'square', 0.06, 0.08); } },
    complete: function () { if (enabled) { tone(660, 0.1, 'sine', 0.15); tone(990, 0.15, 'sine', 0.15, 0.08); } },
    win: function () {
      if (!enabled) return;
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.18, i * 0.1); });
    },
    click: function () { if (enabled) tone(800, 0.04, 'sine', 0.08); }
  };
  window.Sound = S;
})();

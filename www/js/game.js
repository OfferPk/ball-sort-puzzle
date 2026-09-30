/* Ball Sort Puzzle – UI / game controller */
(function () {
  'use strict';
  var L = window.BallSortLogic;
  var CAP = L.CAPACITY;
  var FREE_UNDOS = 3;
  var STORE = 'ballsort.v1';

  var COLORS = [
    '#ff3b5c', // red
    '#2f80ff', // blue
    '#ffd60a', // yellow
    '#2ecc71', // green
    '#b14aed', // purple
    '#ff8c1a', // orange
    '#1de9e6', // cyan
    '#ff66c4', // pink
    '#8d5524', // brown
    '#f5f5f5', // white
    '#3d405b', // navy
    '#a3e635'  // lime
  ];
  var COLOR_NAMES = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'cyan', 'pink', 'brown', 'white', 'navy', 'lime'];

  var $ = function (id) { return document.getElementById(id); };
  var board = $('board');

  var state = {
    level: 1,
    tubes: [],
    history: [],
    undos: FREE_UNDOS,
    extraUsed: false,
    moves: 0,
    bestMoves: {},
    selected: -1,
    busy: false,
    won: false,
    settings: { sound: true, vibrate: true }
  };

  // ---------- persistence ----------
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        level: state.won ? state.level + 1 : state.level, settings: state.settings,
        bestMoves: state.bestMoves,
        current: state.won ? null : { level: state.level, tubes: state.tubes, history: state.history, undos: state.undos, extraUsed: state.extraUsed, moves: state.moves }
      }));
    } catch (e) {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }
  function cleanBestMoves(value) {
    var clean = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
    Object.keys(value).forEach(function (level) {
      var number = Number(level), moves = value[level];
      if (number > 0 && Math.floor(number) === number && String(number) === level &&
          typeof moves === 'number' && isFinite(moves) && moves >= 0 && Math.floor(moves) === moves) clean[level] = moves;
    });
    return clean;
  }

  // ---------- level setup ----------
  function startLevel(level, resume) {
    state.level = level;
    state.selected = -1;
    state.won = false;
    state.busy = false;
    if (resume && resume.level === level && resume.tubes && resume.tubes.length) {
      state.tubes = resume.tubes;
      state.history = resume.history || [];
      state.undos = typeof resume.undos === 'number' ? resume.undos : FREE_UNDOS;
      state.extraUsed = !!resume.extraUsed;
      state.moves = resume.moves || 0;
    } else {
      var lv = L.generateLevel(level);
      state.tubes = L.clone(lv.tubes);
      state.history = [];
      state.undos = FREE_UNDOS;
      state.extraUsed = false;
      state.moves = 0;
    }
    $('level-num').textContent = level;
    render(true);
    save();
  }

  // ---------- layout ----------
  function layout() {
    var n = state.tubes.length;
    var w = board.clientWidth, h = board.clientHeight;
    var best = null;
    // try 1–3 rows and keep whichever gives the biggest balls
    for (var rows = 1; rows <= 3; rows++) {
      var perRow = Math.ceil(n / rows);
      if (rows > 1 && Math.ceil(n / (rows - 1)) === perRow) continue;
      // tube width ≈ 1.32*ball + 14 ; tube height ≈ 4.55*ball + 17 ; row gap 0.9*ball
      var byW = (w - 14 * perRow) / (perRow * 1.32 + 0.1);
      var byH = (h - 20 - rows * 20) / (rows * 5.1 + (rows - 1) * 0.9);
      var ball = Math.floor(Math.min(byW, byH, 58));
      if (!best || ball > best.ball + 1) best = { rows: rows, perRow: perRow, ball: ball };
    }
    best.ball = Math.max(18, best.ball);
    document.documentElement.style.setProperty('--ball', best.ball + 'px');
    return best;
  }

  function render(full) {
    var lay = layout();
    var active = document.activeElement;
    var focusIndex = active && active.classList && active.classList.contains('tube') ? parseInt(active.dataset.index, 10) : -1;
    board.innerHTML = '';
    var idx = 0;
    for (var r = 0; r < lay.rows; r++) {
      var row = document.createElement('div');
      row.className = 'tube-row';
      var count = Math.min(lay.perRow, state.tubes.length - idx);
      for (var c = 0; c < count; c++, idx++) row.appendChild(makeTube(idx));
      board.appendChild(row);
    }
    updateHud();
    if (focusIndex >= 0 && focusIndex < state.tubes.length) tubeEl(focusIndex).focus();
  }

  function tubeLabel(i, tube) {
    var label = 'Tube ' + (i + 1) + ', ';
    if (!tube.length) return label + 'empty';
    label += tube.length + ' of ' + CAP + ' balls; bottom to top: ';
    label += tube.map(function (color) { return COLOR_NAMES[color % COLOR_NAMES.length]; }).join(', ');
    if (L.isComplete(tube, CAP)) label += '; complete';
    return label;
  }

  function makeTube(i) {
    var t = state.tubes[i];
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'tube';
    el.setAttribute('aria-label', tubeLabel(i, t));
    el.setAttribute('aria-pressed', i === state.selected ? 'true' : 'false');
    el.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown');
    if (i >= L.colorsForLevel(state.level) + L.EMPTY_TUBES) el.classList.add('extra');
    if (L.isComplete(t, CAP)) el.classList.add('complete');
    el.dataset.index = i;
    for (var k = 0; k < t.length; k++) {
      var b = document.createElement('span');
      b.className = 'ball';
      b.setAttribute('aria-hidden', 'true');
      b.style.setProperty('--c', COLORS[t[k] % COLORS.length]);
      el.appendChild(b);
    }
    el.addEventListener('click', function () { onTube(i); });
    return el;
  }

  function tubeEl(i) { return board.querySelector('.tube[data-index="' + i + '"]'); }

  function liftAmount(i) {
    var ball = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ball'));
    var gap = 3;
    var empty = CAP - state.tubes[i].length;
    return -(empty * (ball + gap) + ball * 0.9);
  }

  function setLift(i, on) {
    var el = tubeEl(i); if (!el) return;
    el.classList.toggle('selected', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    var balls = el.querySelectorAll('.ball');
    var run = L.topRun(state.tubes[i]);
    var lift = liftAmount(i);
    for (var k = 0; k < balls.length; k++) {
      var isTop = k >= balls.length - run;
      balls[k].classList.toggle('lifted', on && isTop);
      if (on && isTop) balls[k].style.setProperty('--lift', lift + 'px');
    }
  }

  function updateHud() {
    $('moves').textContent = 'Moves: ' + state.moves;
    var sorted = state.tubes.reduce(function (count, tube) {
      return count + (L.isComplete(tube, CAP) ? 1 : 0);
    }, 0);
    $('sort-progress').textContent = 'Sorted: ' + sorted + ' / ' + L.colorsForLevel(state.level);
    var ub = $('undo-badge');
    if (state.undos > 0) { ub.textContent = state.undos; ub.classList.remove('ad'); }
    else { ub.textContent = 'AD'; ub.classList.add('ad'); }
    $('btn-undo').disabled = state.history.length === 0;
    $('btn-tube').disabled = state.extraUsed || state.won;
  }

  var hintTimer = null;
  function clearHints() {
    clearTimeout(hintTimer);
    hintTimer = null;
    board.querySelectorAll('.hint-source, .hint-target').forEach(function (el) {
      el.classList.remove('hint-source', 'hint-target');
    });
  }
  function showHint() {
    if (state.busy || state.won || activeModal) return;
    var solution = L.solve(state.tubes);
    if (!solution || !solution.length) { toast('No hint available for this board'); return; }
    clearHints();
    var move = solution[0];
    var source = tubeEl(move[0]), target = tubeEl(move[1]);
    if (!source || !target) { toast('No hint available for this board'); return; }
    source.classList.add('hint-source');
    target.classList.add('hint-target');
    hintTimer = setTimeout(clearHints, 1800);
    toast('Try Tube ' + (move[0] + 1) + ' → Tube ' + (move[1] + 1));
  }

  // ---------- input ----------
  function navigateTube(e) {
    var horizontal = 0, vertical = 0;
    if (e.key === 'ArrowLeft') horizontal = -1;
    else if (e.key === 'ArrowRight') horizontal = 1;
    else if (e.key === 'ArrowUp') vertical = -1;
    else if (e.key === 'ArrowDown') vertical = 1;
    else return;
    if (state.busy || state.won || activeModal) return;

    var current = e.target.closest ? e.target.closest('.tube') : null;
    if (!current || !board.contains(current)) return;
    var rows = Array.prototype.slice.call(board.querySelectorAll('.tube-row'));
    var rowIndex = rows.indexOf(current.parentElement);
    if (rowIndex < 0) return;

    var rowTubes = Array.prototype.slice.call(rows[rowIndex].querySelectorAll('.tube'));
    var next = null;
    if (horizontal) {
      next = rowTubes[rowTubes.indexOf(current) + horizontal] || null;
    } else {
      var targetRow = rows[rowIndex + vertical];
      if (targetRow) {
        var currentRect = current.getBoundingClientRect();
        var centerX = currentRect.left + currentRect.width / 2;
        var closestDistance = Infinity;
        Array.prototype.forEach.call(targetRow.querySelectorAll('.tube'), function (candidate) {
          var rect = candidate.getBoundingClientRect();
          var distance = Math.abs(rect.left + rect.width / 2 - centerX);
          if (distance < closestDistance) {
            closestDistance = distance;
            next = candidate;
          }
        });
      }
    }
    if (next && !next.disabled) {
      e.preventDefault();
      next.focus();
    }
  }

  function onTube(i) {
    if (state.busy || state.won) return;
    var sel = state.selected;
    if (sel === -1) {
      if (!state.tubes[i].length || L.isComplete(state.tubes[i], CAP)) { shake(i); return; }
      state.selected = i;
      setLift(i, true);
      Sound.select(); buzz(8);
      return;
    }
    if (sel === i) { setLift(i, false); state.selected = -1; Sound.click(); return; }
    var n = L.pourCount(state.tubes, sel, i, CAP);
    if (!n) {
      // switch selection to the tapped tube if it has pickable balls
      var t = state.tubes[i];
      if (t.length && !L.isComplete(t, CAP)) {
        setLift(sel, false); state.selected = i; setLift(i, true); Sound.select();
      } else { shake(i); }
      return;
    }
    doMove(sel, i, n);
  }

  function shake(i) {
    var el = tubeEl(i); if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    Sound.error(); buzz(20);
  }

  function buzz(ms) { if (state.settings.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

  // ---------- move + animation ----------
  function doMove(from, to, n) {
    state.busy = true;
    board.setAttribute('aria-busy', 'true');
    state.selected = -1;
    var ball = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ball'));
    var gap = 3;
    var srcEl = tubeEl(from), dstEl = tubeEl(to);
    var srcBalls = Array.prototype.slice.call(srcEl.querySelectorAll('.ball')).slice(-n).reverse(); // top first
    var dstRect = dstEl.getBoundingClientRect();
    var dstLen = state.tubes[to].length;
    var cx = dstRect.left + dstRect.width / 2 - ball / 2;
    var bottom = dstRect.bottom - 2 - 6; // border + padding
    var aboveDst = dstRect.top - ball * 1.1;
    var anims = [];
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    srcBalls.forEach(function (b, k) {
      var r = b.getBoundingClientRect();
      var fly = b.cloneNode(true);
      fly.classList.remove('lifted');
      fly.classList.add('flying');
      fly.style.left = r.left + 'px'; fly.style.top = r.top + 'px';
      document.body.appendChild(fly);
      b.classList.add('ghost');
      var slot = dstLen + k;
      var ty = bottom - (slot + 1) * ball - slot * gap;
      var liftY = Math.min(r.top, aboveDst) - k * (ball * 0.2);
      var kf = [
        { transform: 'translate(0,0)' },
        { transform: 'translate(0,' + (liftY - r.top) + 'px)', offset: 0.25 },
        { transform: 'translate(' + (cx - r.left) + 'px,' + (aboveDst - r.top) + 'px)', offset: 0.6 },
        { transform: 'translate(' + (cx - r.left) + 'px,' + (ty - r.top) + 'px)' }
      ];
      var a = fly.animate(kf, { duration: reduce ? 1 : 380, delay: reduce ? 0 : k * 55, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' });
      anims.push(a.finished.then(function () { return fly; }));
    });

    Promise.all(anims).then(function (flies) {
      L.pour(state.tubes, from, to, CAP);
      state.history.push([from, to, n]);
      state.moves++;
      render();
      flies.forEach(function (f) { f.remove(); });
      Sound.drop(); buzz(10);
      state.busy = false;
      board.setAttribute('aria-busy', 'false');
      if (L.isComplete(state.tubes[to], CAP)) {
        var el = tubeEl(to); if (el) el.classList.add('pop');
        Sound.complete();
      }
      if (L.isWon(state.tubes, CAP)) onWin();
      else if (!hasMoves()) toast('No moves left – try Undo or +1 Tube');
      save();
    });
  }

  function hasMoves() {
    for (var i = 0; i < state.tubes.length; i++)
      for (var j = 0; j < state.tubes.length; j++) {
        if (i === j) continue;
        var a = state.tubes[i];
        if (L.isComplete(a, CAP)) continue;
        if (state.tubes[j].length === 0 && L.topRun(a) === a.length) continue;
        if (L.canPour(state.tubes, i, j, CAP)) return true;
      }
    return false;
  }

  // ---------- actions ----------
  function undo() {
    if (state.busy || state.won || !state.history.length) return;
    if (state.undos <= 0) {
      Ads.showRewarded(function () { state.undos += FREE_UNDOS; updateHud(); save(); toast('+3 undos'); });
      return;
    }
    clearSelection();
    var m = state.history.pop();
    for (var k = 0; k < m[2]; k++) state.tubes[m[0]].push(state.tubes[m[1]].pop());
    state.undos--;
    state.moves = Math.max(0, state.moves - 1);
    render(); Sound.click(); save();
  }

  function addTube() {
    if (state.busy || state.won || state.extraUsed) return;
    Ads.showRewarded(function () {
      clearSelection();
      state.tubes.push([]);
      state.extraUsed = true;
      render(); Sound.complete(); save();
      toast('Extra tube added');
    });
  }

  function restart() {
    if (state.busy) return;
    Sound.click();
    startLevel(state.level);
  }

  function clearSelection() {
    if (state.selected !== -1) setLift(state.selected, false);
    state.selected = -1;
  }

  function onWin() {
    state.won = true;
    updateHud();
    var previousBest = state.bestMoves[state.level];
    var improved = typeof previousBest !== 'number' || state.moves < previousBest;
    if (improved) state.bestMoves[state.level] = state.moves;
    $('win-sub').textContent = 'Solved in ' + state.moves + ' move' + (state.moves === 1 ? '' : 's') +
      (improved ? ' · New personal best!' : ' · Personal best: ' + previousBest + ' moves');
    save();
    setTimeout(function () {
      Sound.win(); buzz(40);
      $('win-title').textContent = 'Level ' + state.level + ' Complete!';
      showModal('win');
      confetti();
    }, 350);
  }

  function nextLevel() {
    hideModal('win', false);
    stopConfetti();
    Ads.showInterstitial();
    startLevel(state.level + 1);
    var firstTube = tubeEl(0);
    if (firstTube) firstTube.focus();
  }

  function replayLevel() {
    hideModal('win', false);
    stopConfetti();
    startLevel(state.level);
    var firstTube = tubeEl(0);
    if (firstTube) firstTube.focus();
  }

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // ---------- confetti ----------
  var confettiRaf = null;
  function confetti() {
    var cv = $('confetti'), ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    var parts = [];
    for (var i = 0; i < 160; i++) parts.push({
      x: innerWidth / 2, y: innerHeight * 0.45,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[i % COLORS.length], round: Math.random() < 0.4
    });
    var start = performance.now();
    function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 7); ctx.fill(); }
        else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (t - start < 3500) confettiRaf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    confettiRaf = requestAnimationFrame(frame);
  }
  function stopConfetti() { if (confettiRaf) cancelAnimationFrame(confettiRaf); var cv = $('confetti'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }

  // ---------- settings ----------
  function openSettings() {
    $('opt-sound').checked = state.settings.sound;
    $('opt-vibrate').checked = state.settings.vibrate;
    showModal('settings', $('btn-settings'));
  }
  function applySettings() { Sound.setEnabled(state.settings.sound); }

  // ---------- modal focus ----------
  var activeModal = null;
  var modalReturnFocus = null;
  var FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function focusableIn(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(function (el) {
      return !el.disabled && !el.closest('.hidden') && el.getAttribute('aria-hidden') !== 'true';
    });
  }
  function showModal(id, returnFocus) {
    var modal = $(id);
    activeModal = modal;
    modalReturnFocus = returnFocus || null;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.remove('hidden');
    $('app').inert = true;
    var focusable = focusableIn(modal);
    if (focusable.length) focusable[0].focus();
  }
  function hideModal(id, restoreFocus) {
    var modal = $(id);
    if (activeModal !== modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    activeModal = null;
    var returnFocus = modalReturnFocus;
    modalReturnFocus = null;
    $('app').inert = false;
    if (restoreFocus && returnFocus && document.documentElement.contains(returnFocus) && !returnFocus.disabled) returnFocus.focus();
  }

  // ---------- wire up ----------
  board.addEventListener('keydown', navigateTube);
  $('btn-undo').addEventListener('click', undo);
  $('btn-hint').addEventListener('click', showHint);
  $('btn-tube').addEventListener('click', addTube);
  $('btn-restart').addEventListener('click', restart);
  $('btn-next').addEventListener('click', nextLevel);
  $('btn-replay').addEventListener('click', replayLevel);
  $('btn-settings').addEventListener('click', function () { Sound.click(); openSettings(); });
  $('btn-close-settings').addEventListener('click', function () { hideModal('settings', true); });
  $('opt-sound').addEventListener('change', function (e) { state.settings.sound = e.target.checked; applySettings(); save(); });
  $('opt-vibrate').addEventListener('change', function (e) { state.settings.vibrate = e.target.checked; save(); });
  $('btn-reset').addEventListener('click', function () {
    if (!confirm('Reset all progress and go back to level 1?')) return;
    hideModal('settings', true);
    state.bestMoves = {};
    startLevel(1);
  });
  window.addEventListener('resize', function () { clearSelection(); render(); });
  document.addEventListener('keydown', function (e) {
    if (activeModal) {
      if (e.key === 'Escape' && activeModal.id === 'settings') {
        e.preventDefault();
        hideModal('settings', true);
      } else if (e.key === 'Tab') {
        var focusable = focusableIn(activeModal);
        if (!focusable.length) {
          e.preventDefault();
          return;
        }
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (!activeModal.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
  });
  document.addEventListener('focusin', function (e) {
    if (!activeModal || activeModal.contains(e.target)) return;
    var focusable = focusableIn(activeModal);
    if (focusable.length) focusable[0].focus();
  });

  // Test / debug hook (used by the headless test)
  window.__ballSort = { state: state, startLevel: startLevel, onTube: onTube, undo: undo, addTube: addTube, logic: L };

  var saved = load();
  if (saved && saved.settings) state.settings = Object.assign(state.settings, saved.settings);
  state.bestMoves = cleanBestMoves(saved && saved.bestMoves);
  applySettings();
  var params = new URLSearchParams(location.search);
  var startAt = parseInt(params.get('level'), 10) || (saved && saved.level) || 1;
  startLevel(startAt, !params.get('level') && saved && saved.current);
  Ads.showBanner();
})();

// Headless Chrome test: plays levels by tapping tubes like a user, checks
// win detection, undo, extra tube, persistence, and saves phone screenshots.
// Usage: node test/browser.test.js http://localhost:8765/ [outdir]
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const URL = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || '/workspace';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ballsort-chrome-profile-'));

let browser = null;
let page = null;
const errors = [];
function launchBrowser() {
  return puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', userDataDir: PROFILE, headless: 'new', args: ['--no-sandbox'] });
}
async function openTestPage() {
  page = await browser.newPage();
  await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Mobile Safari/537.36' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
}
(async () => {
  browser = await launchBrowser();
  await openTestPage();

  async function tap(i) {
    const el = await page.$(`.tube[data-index="${i}"]`);
    const b = await el.boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  }
  async function touch(selector) {
    const el = await page.$(selector);
    const b = await el.boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  }
  async function shiftTab() {
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
  }
  async function waitIdle() { await page.waitForFunction(() => !window.__ballSort.state.busy, { timeout: 5000 }); }
  async function assertTubeAccessibility(context) {
    const expected = await page.evaluate(() => {
      const colorNames = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'cyan', 'pink', 'brown', 'white', 'navy', 'lime'];
      const capacity = window.__ballSort.logic.CAPACITY;
      return {
        selected: window.__ballSort.state.selected,
        tubes: window.__ballSort.state.tubes.map((tube, index) => {
          let name = `Tube ${index + 1}, `;
          if (!tube.length) name += 'empty';
          else {
            name += `${tube.length} of ${capacity} balls; bottom to top: ${tube.map(color => colorNames[color % colorNames.length]).join(', ')}`;
            if (window.__ballSort.logic.isComplete(tube, capacity)) name += '; complete';
          }
          const selected = window.__ballSort.state.selected;
          if (selected !== -1 && selected !== index && window.__ballSort.logic.canPour(window.__ballSort.state.tubes, selected, index, capacity)) {
            const source = window.__ballSort.state.tubes[selected];
            name += `; legal destination for ${colorNames[source[source.length - 1] % colorNames.length]}`;
          }
          return { index, name, pressed: index === window.__ballSort.state.selected };
        })
      };
    });
    const tree = await page.accessibility.snapshot({ interestingOnly: false });
    const buttons = [];
    let boardPresent = false;
    const visit = node => {
      if (node.role === 'group' && node.name === 'Game board') boardPresent = true;
      if (node.role === 'button' && /^Tube \d+, /.test(node.name || '')) buttons.push(node);
      for (const child of node.children || []) visit(child);
    };
    visit(tree);
    if (!boardPresent) throw new Error(`${context}: game board is missing from the accessibility tree`);
    if (buttons.length !== expected.tubes.length) throw new Error(`${context}: accessibility tree exposed ${buttons.length} tube buttons for ${expected.tubes.length} tubes`);
    const dom = await page.$$eval('.tube', elements => elements.map(element => ({
      index: Number(element.dataset.index), tag: element.tagName, type: element.type,
      name: element.getAttribute('aria-label'), pressed: element.getAttribute('aria-pressed'),
      decorativeBallsHidden: [...element.querySelectorAll('.ball')].every(ball => ball.getAttribute('aria-hidden') === 'true')
    })));
    for (const tube of expected.tubes) {
      const accessibleButton = buttons.find(button => button.name === tube.name);
      if (!accessibleButton || accessibleButton.pressed !== tube.pressed) {
        throw new Error(`${context}: tube ${tube.index + 1} AX name/pressed state mismatch; expected ${JSON.stringify({ name: tube.name, pressed: tube.pressed })}, got ${JSON.stringify(accessibleButton && { name: accessibleButton.name, pressed: accessibleButton.pressed })}`);
      }
      const element = dom.find(candidate => candidate.index === tube.index);
      if (!element || element.tag !== 'BUTTON' || element.type !== 'button' || element.name !== tube.name || element.pressed !== String(tube.pressed) || !element.decorativeBallsHidden) {
        throw new Error(`${context}: tube ${tube.index + 1} DOM semantics/name/state mismatch`);
      }
    }
  }
  async function assertProgressAccessibility(context, expectedText) {
    const actual = await page.$eval('#sort-progress', element => ({
      text: element.textContent.trim(), role: element.getAttribute('role'),
      live: element.getAttribute('aria-live'), atomic: element.getAttribute('aria-atomic')
    }));
    if (actual.text !== expectedText || actual.role !== 'status' || actual.live !== 'polite' || actual.atomic !== 'true') {
      throw new Error(`${context}: sorted progress is not announced as a polite atomic status: ${JSON.stringify(actual)}`);
    }
    const tree = await page.accessibility.snapshot({ interestingOnly: false });
    let exposed = false;
    const containsExpectedText = node => node.name === expectedText || (node.children || []).some(containsExpectedText);
    const visit = node => {
      if (node.role === 'status' && containsExpectedText(node)) exposed = true;
      for (const child of node.children || []) visit(child);
    };
    visit(tree);
    if (!exposed) throw new Error(`${context}: sorted progress is missing from the accessibility tree as a status`);
  }
  async function solveCurrent(shotAt) {
    const sol = await page.evaluate(() => window.__ballSort.logic.solve(window.__ballSort.state.tubes, { nodeLimit: 500000 }));
    if (!sol) throw new Error('no solution');
    for (let k = 0; k < sol.length; k++) {
      await tap(sol[k][0]); await sleep(30);
      if (shotAt && k === shotAt.move) { await sleep(250); await page.screenshot({ path: shotAt.path }); }
      await tap(sol[k][1]); await waitIdle();
    }
    return sol.length;
  }

  await page.goto(URL + '?level=1', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('ballsort.v1', JSON.stringify({ level: 1, settings: { sound: true, vibrate: true }, current: null })));
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(300);
  const legacySave = await page.evaluate(() => ({ level: window.__ballSort.state.level, bestMoves: window.__ballSort.state.bestMoves }));
  if (legacySave.level !== 1 || Object.keys(legacySave.bestMoves).length) throw new Error('legacy save without best-move data did not load cleanly');
  await page.screenshot({ path: `${OUT}/ballsort-level1.png` });
  const toolbarLabels = await page.$$eval('.toolbar .tool-btn', buttons => buttons.map(button => {
    const label = button.querySelector('.tool-label');
    const range = document.createRange();
    range.selectNodeContents(label);
    const rect = button.getBoundingClientRect();
    const footer = button.parentElement.getBoundingClientRect();
    return { text: label.textContent.trim(), lines: range.getClientRects().length, contained: rect.left >= footer.left && rect.right <= footer.right };
  }));
  if (toolbarLabels.length !== 3 || toolbarLabels.some(label => label.lines !== 1 || !label.contained)) throw new Error('mobile toolbar labels wrapped or escaped their footer');

  const accessible = await page.evaluate(() => ({
    board: document.getElementById('board').getAttribute('role'),
    liveMoves: document.getElementById('moves').getAttribute('aria-live'),
    sortedRole: document.getElementById('sort-progress').getAttribute('role'),
    sortedLive: document.getElementById('sort-progress').getAttribute('aria-live'),
    sortedAtomic: document.getElementById('sort-progress').getAttribute('aria-atomic'),
    tubes: [...document.querySelectorAll('.tube')].every(t => t.tagName === 'BUTTON' && t.type === 'button' && t.getAttribute('aria-label').startsWith('Tube ') && t.hasAttribute('aria-pressed') && t.getAttribute('aria-keyshortcuts') === 'ArrowLeft ArrowRight ArrowUp ArrowDown')
  }));
  if (accessible.board !== 'group' || accessible.liveMoves !== 'polite' || accessible.sortedRole !== 'status' || accessible.sortedLive !== 'polite' || accessible.sortedAtomic !== 'true' || !accessible.tubes) throw new Error('accessible board/tube/progress status semantics missing');
  await assertProgressAccessibility('initial sorted progress', 'Sorted: 0 / 3');
  await page.evaluate(() => window.__ballSort.startLevel(1, { level: 1, tubes: [[0, 1, 2, 0], [], [2, 2, 2, 2], [1, 2], []], history: [], undos: 3, extraUsed: false, moves: 0 }));
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 1 / 3') throw new Error('sorted-color progress did not count a completed tube');
  await assertTubeAccessibility('label fixture');
  await page.evaluate(() => window.__ballSort.startLevel(4, {
    level: 4, tubes: [[0, 0, 0, 0], [1, 1, 1], [1], [2, 2, 2], [2], [3, 3, 3, 3]],
    history: [], undos: 3, extraUsed: false, moves: 0
  }));
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 2 / 4') throw new Error('sorted-color progress did not reflect the level color count');
  await assertProgressAccessibility('level color-count update', 'Sorted: 2 / 4');
  await tap(2); await tap(1); await waitIdle();
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 3 / 4') throw new Error('sorted-color progress did not update after completing a tube');
  await assertProgressAccessibility('tube completion', 'Sorted: 3 / 4');
  await page.reload({ waitUntil: 'networkidle0' });
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 3 / 4') throw new Error('sorted-color progress did not restore after reload with a newly completed tube');
  await page.click('#btn-undo');
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 2 / 4') throw new Error('sorted-color progress did not update after undo');
  await assertProgressAccessibility('undo', 'Sorted: 2 / 4');
  await page.reload({ waitUntil: 'networkidle0' });
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 2 / 4') throw new Error('sorted-color progress did not restore after undo and reload');
  await page.evaluate(() => window.__ballSort.startLevel(1));
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 0 / 3') throw new Error('new level did not reset sorted-color progress');
  await page.reload({ waitUntil: 'networkidle0' });
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 0 / 3') throw new Error('sorted-color progress did not restore correctly after a level transition');

  const hintBefore = await page.evaluate(() => {
    const state = window.__ballSort.state;
    return {
      move: window.__ballSort.logic.solve(state.tubes)[0],
      tubes: JSON.stringify(state.tubes), history: JSON.stringify(state.history),
      moves: state.moves, selected: state.selected, undos: state.undos,
      extraUsed: state.extraUsed, saved: localStorage.getItem('ballsort.v1')
    };
  });
  if (!hintBefore.move) throw new Error('hint fixture has no legal solution move');
  const expectedHint = `Try Tube ${hintBefore.move[0] + 1} → Tube ${hintBefore.move[1] + 1}`;
  const hintButton = await page.$eval('#btn-hint', el => ({ tag: el.tagName, type: el.type, label: el.getAttribute('aria-label'), text: el.textContent.trim() }));
  if (hintButton.tag !== 'BUTTON' || hintButton.type !== 'button' || hintButton.label !== 'Show a hint' || hintButton.text !== 'Hint') throw new Error('hint control is not a named semantic button');
  await page.focus('#btn-hint');
  await page.keyboard.press('Enter');
  await page.waitForFunction(message => document.getElementById('toast').textContent === message, {}, expectedHint);
  const hinted = await page.evaluate(move => {
    const state = window.__ballSort.state;
    return {
      message: document.getElementById('toast').textContent,
      toastRole: document.getElementById('toast').getAttribute('role'),
      sourceMarked: document.querySelector(`.tube[data-index="${move[0]}"]`).classList.contains('hint-source'),
      targetMarked: document.querySelector(`.tube[data-index="${move[1]}"]`).classList.contains('hint-target'),
      tubes: JSON.stringify(state.tubes), history: JSON.stringify(state.history),
      moves: state.moves, selected: state.selected, undos: state.undos,
      extraUsed: state.extraUsed, saved: localStorage.getItem('ballsort.v1')
    };
  }, hintBefore.move);
  if (hinted.message !== expectedHint || hinted.toastRole !== 'status' || !hinted.sourceMarked || !hinted.targetMarked) throw new Error('hint did not announce and highlight the recommended legal move');
  for (const key of ['tubes', 'history', 'moves', 'selected', 'undos', 'extraUsed', 'saved']) {
    if (hinted[key] !== hintBefore[key]) throw new Error(`hint changed ${key}`);
  }
  await touch('#btn-hint');
  await page.waitForFunction(message => document.getElementById('toast').textContent === message, {}, expectedHint);
  console.log('keyboard and touch hints announce a legal move without changing gameplay or saved state');

  const navRows = await page.evaluate(() => [...document.querySelectorAll('#board .tube-row')].map(row => [...row.querySelectorAll('.tube')].map(t => t.dataset.index)));
  if (navRows.length < 2 || navRows[0].length < 2) throw new Error('level 1 did not render a navigable tube grid');
  const firstTube = navRows[0][0];
  const lastTubeInFirstRow = navRows[0][navRows[0].length - 1];
  await page.focus(`.tube[data-index="${firstTube}"]`);
  await page.keyboard.press('ArrowUp');
  if ((await page.evaluate(() => document.activeElement.dataset.index)) !== firstTube) throw new Error('ArrowUp wrapped past the top row');
  const verticalTarget = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#board .tube-row')];
    const source = rows[0].querySelector('.tube');
    const x = source.getBoundingClientRect().left + source.getBoundingClientRect().width / 2;
    return [...rows[1].querySelectorAll('.tube')].reduce((best, candidate) => {
      if (!best) return candidate;
      const rect = candidate.getBoundingClientRect();
      const bestRect = best.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - x) < Math.abs(bestRect.left + bestRect.width / 2 - x) ? candidate : best;
    }, null).dataset.index;
  });
  await page.keyboard.press('ArrowDown');
  if ((await page.evaluate(() => document.activeElement.dataset.index)) !== verticalTarget) throw new Error('ArrowDown did not focus the nearest tube in the next row');
  const verticalReturnTarget = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#board .tube-row')];
    const source = document.activeElement;
    const x = source.getBoundingClientRect().left + source.getBoundingClientRect().width / 2;
    return [...rows[0].querySelectorAll('.tube')].reduce((best, candidate) => {
      if (!best) return candidate;
      const rect = candidate.getBoundingClientRect();
      const bestRect = best.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - x) < Math.abs(bestRect.left + bestRect.width / 2 - x) ? candidate : best;
    }, null).dataset.index;
  });
  await page.keyboard.press('ArrowUp');
  if ((await page.evaluate(() => document.activeElement.dataset.index)) !== verticalReturnTarget) throw new Error('ArrowUp did not focus the nearest tube in the previous row');
  await page.focus(`.tube[data-index="${firstTube}"]`);
  await page.keyboard.press('ArrowLeft');
  if ((await page.evaluate(() => document.activeElement.dataset.index)) !== firstTube) throw new Error('ArrowLeft wrapped past the first tube');
  await page.keyboard.press('ArrowRight');
  if ((await page.evaluate(() => document.activeElement.dataset.index)) !== navRows[0][1]) throw new Error('ArrowRight did not focus the next tube in the row');
  await page.focus(`.tube[data-index="${lastTubeInFirstRow}"]`);
  await page.keyboard.press('ArrowRight');
  if ((await page.evaluate(() => document.activeElement.dataset.index)) !== lastTubeInFirstRow) throw new Error('ArrowRight wrapped to another row at the boundary');
  await page.evaluate(index => { document.querySelector(`.tube[data-index="${index}"]`).disabled = true; }, navRows[0][1]);
  await page.focus(`.tube[data-index="${firstTube}"]`);
  await page.keyboard.press('ArrowRight');
  if ((await page.evaluate(() => document.activeElement.dataset.index)) !== firstTube) throw new Error('ArrowRight skipped an unavailable adjacent tube');
  await page.evaluate(index => { document.querySelector(`.tube[data-index="${index}"]`).disabled = false; }, navRows[0][1]);
  const navigationState = await page.evaluate(() => ({ selected: window.__ballSort.state.selected, pressed: [...document.querySelectorAll('.tube')].some(t => t.getAttribute('aria-pressed') === 'true') }));
  if (navigationState.selected !== -1 || navigationState.pressed) throw new Error('arrow navigation changed tube selection state');

  await page.focus('.tube[data-index="0"]');
  await page.keyboard.press('Enter');
  let selected = await page.$eval('.tube[data-index="0"]', el => el.getAttribute('aria-pressed'));
  if (selected !== 'true') throw new Error('keyboard selection did not update pressed state');
  await assertTubeAccessibility('Enter selection');
  await page.keyboard.press('Enter');
  selected = await page.$eval('.tube[data-index="0"]', el => el.getAttribute('aria-pressed'));
  if (selected !== 'false') throw new Error('keyboard deselection did not update pressed state');
  await assertTubeAccessibility('Enter deselection');
  await page.keyboard.press('Space');
  selected = await page.$eval('.tube[data-index="0"]', el => el.getAttribute('aria-pressed'));
  if (selected !== 'true') throw new Error('Space did not activate tube selection');
  await assertTubeAccessibility('Space selection');
  await page.keyboard.press('Space');
  selected = await page.$eval('.tube[data-index="0"]', el => el.getAttribute('aria-pressed'));
  if (selected !== 'false') throw new Error('Space did not activate tube deselection');
  await assertTubeAccessibility('Space deselection');

  const keyboardMove = await page.evaluate(() => window.__ballSort.logic.solve(window.__ballSort.state.tubes)[0]);
  await page.focus(`.tube[data-index="${keyboardMove[0]}"]`);
  await page.keyboard.press('Enter');
  await page.focus(`.tube[data-index="${keyboardMove[1]}"]`);
  await page.keyboard.press('Enter');
  await waitIdle();
  const focusedTube = await page.evaluate(() => document.activeElement && document.activeElement.dataset.index);
  if (focusedTube !== String(keyboardMove[1])) throw new Error('keyboard focus was not restored after move');
  await assertTubeAccessibility('keyboard move');
  await page.evaluate(() => window.__ballSort.startLevel(1));

  // A win previews the current tier and next color milestone. Crossing a tier
  // announces the newly added color, and replay clears the old preview.
  await page.evaluate(() => window.__ballSort.startLevel(3, {
    level: 3, tubes: [[0, 0], [0, 0], [1, 1, 1, 1], [2, 2, 2, 2], []],
    history: [], undos: 3, extraUsed: false, moves: 0
  }));
  await tap(0); await tap(1); await waitIdle(); await sleep(450);
  const unlockPreview = await page.evaluate(() => ({
    text: document.getElementById('next-challenge').textContent,
    describedby: document.getElementById('win').getAttribute('aria-describedby')
  }));
  if (unlockPreview.text !== 'Next level: 4 colors — a new color is unlocked!' || !unlockPreview.describedby.split(' ').includes('next-challenge')) {
    throw new Error('win dialog did not announce the upcoming color unlock accessibly');
  }
  await page.click('#btn-replay'); await sleep(200);
  if ((await page.$eval('#next-challenge', el => el.textContent)) !== '') throw new Error('replaying a level left a stale progression preview visible to assistive technology');
  await page.evaluate(() => window.__ballSort.startLevel(1));

  // Selecting a source immediately marks every legal destination visually and
  // in each tube's accessible name, announces the choices, and never mutates a
  // save until a legal pour is made.
  await page.evaluate(() => window.__ballSort.startLevel(1, {
    level: 1, tubes: [[0, 1], [1], [], [2, 2, 2, 2], [0, 0]],
    history: [], undos: 3, extraUsed: false, moves: 0
  }));
  const previewBaseline = await page.evaluate(() => ({
    tubes: JSON.stringify(window.__ballSort.state.tubes), history: JSON.stringify(window.__ballSort.state.history),
    moves: window.__ballSort.state.moves, saved: localStorage.getItem('ballsort.v1')
  }));
  await tap(0);
  let destinationPreview = await page.evaluate(() => ({
    selected: window.__ballSort.state.selected,
    legal: [...document.querySelectorAll('.tube.legal-target')].map(tube => Number(tube.dataset.index)),
    message: document.getElementById('toast').textContent,
    toastRole: document.getElementById('toast').getAttribute('role'),
    saved: localStorage.getItem('ballsort.v1'), tubes: JSON.stringify(window.__ballSort.state.tubes),
    history: JSON.stringify(window.__ballSort.state.history), moves: window.__ballSort.state.moves,
    visual: (() => { const tube = document.querySelector('.tube[data-index="1"]'); return { rim: getComputedStyle(tube, '::before').backgroundColor, marker: getComputedStyle(tube, '::after').content }; })()
  }));
  if (destinationPreview.selected !== 0 || JSON.stringify(destinationPreview.legal) !== JSON.stringify([1, 2]) || destinationPreview.message !== 'Blue selected. Legal destinations: Tube 2 and Tube 3.' || destinationPreview.toastRole !== 'status' || destinationPreview.visual.marker !== '"✓"') {
    throw new Error('selecting a source did not clearly announce and mark only its legal destinations: ' + JSON.stringify(destinationPreview));
  }
  for (const key of ['saved', 'tubes', 'history', 'moves']) {
    if (destinationPreview[key] !== previewBaseline[key]) throw new Error(`destination preview changed ${key}`);
  }
  await assertTubeAccessibility('touch source legal destinations');

  // Tapping another movable source replaces both the selection and its legal
  // target list; tapping it again clears the preview without changing state.
  await tap(4);
  destinationPreview = await page.evaluate(() => ({
    selected: window.__ballSort.state.selected,
    legal: [...document.querySelectorAll('.tube.legal-target')].map(tube => Number(tube.dataset.index)),
    message: document.getElementById('toast').textContent
  }));
  if (destinationPreview.selected !== 4 || JSON.stringify(destinationPreview.legal) !== JSON.stringify([2]) || destinationPreview.message !== 'Red selected. Legal destinations: Tube 3.') {
    throw new Error('switching source tubes left stale or inaccurate legal destinations: ' + JSON.stringify(destinationPreview));
  }
  await assertTubeAccessibility('switched source legal destination');
  await tap(4);
  destinationPreview = await page.evaluate(() => ({
    selected: window.__ballSort.state.selected,
    legal: [...document.querySelectorAll('.tube.legal-target')].map(tube => Number(tube.dataset.index)),
    message: document.getElementById('toast').textContent,
    saved: localStorage.getItem('ballsort.v1'), moves: window.__ballSort.state.moves
  }));
  if (destinationPreview.selected !== -1 || destinationPreview.legal.length || destinationPreview.message !== 'Selection cleared.' || destinationPreview.saved !== previewBaseline.saved || destinationPreview.moves !== previewBaseline.moves) {
    throw new Error('deselecting a source did not clear its destination preview without changing the board');
  }
  await assertTubeAccessibility('cleared source destination preview');

  await tap(0); await tap(1); await waitIdle();
  const pouredPreview = await page.evaluate(() => ({
    selected: window.__ballSort.state.selected,
    legal: [...document.querySelectorAll('.tube.legal-target')].length,
    source: window.__ballSort.state.tubes[0], target: window.__ballSort.state.tubes[1],
    moves: window.__ballSort.state.moves, savedMoves: JSON.parse(localStorage.getItem('ballsort.v1')).current.moves
  }));
  if (pouredPreview.selected !== -1 || pouredPreview.legal || JSON.stringify(pouredPreview.source) !== '[0]' || JSON.stringify(pouredPreview.target) !== '[1,1]' || pouredPreview.moves !== 1 || pouredPreview.savedMoves !== 1) {
    throw new Error('legal destination feedback did not clear cleanly after a real touch pour: ' + JSON.stringify(pouredPreview));
  }
  await assertTubeAccessibility('touch move after destination preview');
  console.log('touch destination previews announce and mark legal moves, update on source switch, clear on cancel, and preserve saves until a pour');
  await page.evaluate(() => window.__ballSort.startLevel(1));

  // play level 1 by taps
  const moves1 = await solveCurrent();
  await assertTubeAccessibility('completed level');
  await sleep(900);
  const won = await page.evaluate(() => window.__ballSort.state.won && !document.getElementById('win').classList.contains('hidden'));
  if (!won) throw new Error('level 1 win not detected');
  const firstBest = await page.evaluate(() => ({
    text: document.getElementById('win-sub').textContent,
    nextChallenge: document.getElementById('next-challenge').textContent,
    winDescribedby: document.getElementById('win').getAttribute('aria-describedby'),
    progress: document.getElementById('sort-progress').textContent,
    saved: JSON.parse(localStorage.getItem('ballsort.v1'))
  }));
  if (firstBest.text !== `Solved in ${moves1} moves · New personal best!` || firstBest.nextChallenge !== 'Next: 3 colors · 4 colors at Level 4' || !firstBest.winDescribedby.split(' ').includes('next-challenge') || firstBest.progress !== 'Sorted: 3 / 3' || firstBest.saved.level !== 2 || firstBest.saved.unlockedLevel < firstBest.saved.level || firstBest.saved.current !== null || firstBest.saved.bestMoves['1'] !== moves1) {
    throw new Error('first level win did not record a personal best and save the next level immediately');
  }
  let winFocus = await page.evaluate(() => ({ active: document.activeElement.id, modal: document.getElementById('win').getAttribute('aria-modal'), hidden: document.getElementById('win').getAttribute('aria-hidden'), inert: document.getElementById('app').inert }));
  if (winFocus.active !== 'btn-next' || winFocus.modal !== 'true' || winFocus.hidden !== 'false' || !winFocus.inert) throw new Error('win dialog did not enter modal focus state');
  const replayButton = await page.$eval('#btn-replay', el => ({ tag: el.tagName, type: el.type, text: el.textContent.trim() }));
  if (replayButton.tag !== 'BUTTON' || replayButton.type !== 'button' || replayButton.text !== 'Replay Level') throw new Error('win dialog replay action is not a semantic, labeled button');
  await page.keyboard.press('Tab');
  await shiftTab();
  await page.evaluate(() => document.getElementById('btn-settings').focus());
  winFocus = await page.evaluate(() => ({ active: document.activeElement.id, shown: !document.getElementById('win').classList.contains('hidden') }));
  if (winFocus.active !== 'btn-next' || !winFocus.shown) throw new Error('win dialog did not contain focus');
  await page.keyboard.press('Escape');
  if (!(await page.$eval('#win', el => !el.classList.contains('hidden')))) throw new Error('Escape unexpectedly dismissed the win dialog');
  await page.screenshot({ path: `${OUT}/ballsort-win.png` });
  console.log(`level 1 solved by taps in ${moves1} moves, win overlay shown`);
  await page.click('#btn-replay'); await sleep(300);
  const replayStart = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('ballsort.v1'));
    return {
      level: window.__ballSort.state.level, moves: window.__ballSort.state.moves,
      won: window.__ballSort.state.won, progress: document.getElementById('sort-progress').textContent,
      winHidden: document.getElementById('win').classList.contains('hidden'),
      best: window.__ballSort.state.bestMoves['1'], savedLevel: saved.level,
      savedMoves: saved.current && saved.current.moves, savedBest: saved.bestMoves['1']
    };
  });
  if (replayStart.level !== 1 || replayStart.moves !== 0 || replayStart.won || replayStart.progress !== 'Sorted: 0 / 3' || !replayStart.winHidden || replayStart.best !== moves1 || replayStart.savedLevel !== 1 || replayStart.savedMoves !== 0 || replayStart.savedBest !== moves1) {
    throw new Error('replay action did not restart the same level, reset its sorted count, and preserve personal-best progress');
  }
  const retryMoves = await solveCurrent(); await sleep(700);
  const retryBest = await page.evaluate(() => ({ text: document.getElementById('win-sub').textContent, best: JSON.parse(localStorage.getItem('ballsort.v1')).bestMoves['1'] }));
  if (retryMoves !== moves1 || retryBest.best !== moves1 || retryBest.text !== `Solved in ${moves1} moves · Personal best: ${moves1} moves`) {
    throw new Error('replayed level did not preserve or accurately report the existing personal best');
  }
  console.log('win dialog replays the same level and preserves its personal-best record');
  await page.click('#btn-next'); await sleep(300);
  let lvl = await page.evaluate(() => window.__ballSort.state.level);
  if (lvl !== 2) throw new Error('did not advance');
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 0 / 3') throw new Error('advancing to the next level did not reset sorted-color progress');
  const focusAfterWin = await page.evaluate(() => document.activeElement && document.activeElement.dataset.index);
  if (focusAfterWin !== '0') throw new Error('focus was not moved to the new board after advancing');

  // Players can revisit unlocked levels. The highest unlock survives switching
  // backward/reloading, while abandoning an in-progress board requires consent.
  await page.evaluate(moves => {
    // Earlier synthetic preview fixtures completed levels 3/4; reset their
    // test-only records so this picker case starts from the real Level 1 edge.
    window.__ballSort.state.bestMoves = { '1': moves };
    window.__ballSort.state.unlockedLevel = 2;
    window.__ballSort.startLevel(2, {
      level: 2, tubes: [[0, 0], [0, 0], [1, 1, 1, 1], [2, 2, 2, 2], []],
      history: [], undos: 3, extraUsed: false, moves: 0
    });
  }, moves1);
  const pickerTrigger = await page.$eval('#btn-levels', button => ({ tag: button.tagName, type: button.type, name: button.getAttribute('aria-label') }));
  if (pickerTrigger.tag !== 'BUTTON' || pickerTrigger.type !== 'button' || pickerTrigger.name !== 'Choose a level; current level 2') throw new Error('level picker trigger is missing its current-level accessible name');
  await page.click('#btn-levels');
  let picker = await page.evaluate(() => ({
    hidden: document.getElementById('levels').getAttribute('aria-hidden'),
    inert: document.getElementById('app').inert,
    levels: [...document.querySelectorAll('#level-list button')].map(button => Number(button.dataset.level)),
    current: document.querySelector('#level-list [aria-current="step"]')?.dataset.level,
    currentName: document.querySelector('#level-list [aria-current="step"]')?.getAttribute('aria-label')
  }));
  if (picker.hidden !== 'false' || !picker.inert || JSON.stringify(picker.levels) !== JSON.stringify([1, 2]) || picker.current !== '2' || !/current level/.test(picker.currentName || '') || await page.$('#level-list [data-level="3"]')) {
    throw new Error('level picker did not expose only unlocked levels and mark the current level: ' + JSON.stringify(picker));
  }
  await sleep(350);
  await page.screenshot({ path: `${OUT}/ballsort-level-picker.png` });
  await page.keyboard.press('Escape');
  const dismissedPicker = await page.evaluate(() => ({ hidden: document.getElementById('levels').getAttribute('aria-hidden'), inert: document.getElementById('app').inert, focus: document.activeElement.id }));
  if (dismissedPicker.hidden !== 'true' || dismissedPicker.inert || dismissedPicker.focus !== 'btn-levels') throw new Error('Escape did not close the level picker and restore focus');
  await page.click('#btn-levels');
  await page.click('#level-list [data-level="1"]');
  if ((await page.evaluate(() => window.__ballSort.state.level)) !== 1) throw new Error('choosing an unlocked level did not start it');
  await page.reload({ waitUntil: 'networkidle0' });
  const persistedUnlock = await page.evaluate(() => ({
    level: window.__ballSort.state.level,
    unlocked: window.__ballSort.state.unlockedLevel,
    best: window.__ballSort.state.bestMoves['1'],
    savedUnlock: JSON.parse(localStorage.getItem('ballsort.v1')).unlockedLevel
  }));
  if (persistedUnlock.level !== 1 || persistedUnlock.unlocked !== 2 || persistedUnlock.savedUnlock !== 2 || persistedUnlock.best !== moves1) {
    throw new Error('choosing an earlier level did not persist the higher unlock and personal best');
  }
  await page.click('#btn-levels');
  picker = await page.evaluate(() => [...document.querySelectorAll('#level-list button')].map(button => Number(button.dataset.level)));
  if (JSON.stringify(picker) !== JSON.stringify([1, 2])) throw new Error('reloaded level picker forgot the previously unlocked level');
  await page.click('#level-list [data-level="2"]');

  await page.evaluate(() => window.__ballSort.startLevel(2));
  const unfinishedMove = await page.evaluate(() => window.__ballSort.logic.solve(window.__ballSort.state.tubes)[0]);
  if (!unfinishedMove) throw new Error('generated Level 2 puzzle had no legal move for the leave-warning test');
  await tap(unfinishedMove[0]); await tap(unfinishedMove[1]); await waitIdle();
  if (await page.evaluate(() => window.__ballSort.state.won)) throw new Error('first legal Level 2 move unexpectedly completed the puzzle');
  const activeBoard = await page.evaluate(() => ({ tubes: JSON.stringify(window.__ballSort.state.tubes), moves: window.__ballSort.state.moves, saved: localStorage.getItem('ballsort.v1') }));
  await page.click('#btn-levels');
  let confirmMessage = '';
  page.once('dialog', async dialog => { confirmMessage = dialog.message(); await dialog.dismiss(); });
  await page.click('#level-list [data-level="1"]');
  const afterCancel = await page.evaluate(() => ({ level: window.__ballSort.state.level, tubes: JSON.stringify(window.__ballSort.state.tubes), moves: window.__ballSort.state.moves, saved: localStorage.getItem('ballsort.v1') }));
  if (!/Leave Level 2\?/.test(confirmMessage) || afterCancel.level !== 2 || afterCancel.tubes !== activeBoard.tubes || afterCancel.moves !== activeBoard.moves || afterCancel.saved !== activeBoard.saved) {
    throw new Error('canceling a level change did not preserve the current board and save');
  }
  page.once('dialog', dialog => dialog.accept());
  await page.click('#level-list [data-level="1"]');
  if ((await page.evaluate(() => window.__ballSort.state.level)) !== 1) throw new Error('confirming a level change did not switch levels');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('#btn-levels');
  picker = await page.evaluate(() => [...document.querySelectorAll('#level-list button')].map(button => Number(button.dataset.level)));
  if (JSON.stringify(picker) !== JSON.stringify([1, 2])) throw new Error('confirmed level change did not preserve the unlocked-level list across reload');
  await page.click('#level-list [data-level="2"]');
  if ((await page.evaluate(() => window.__ballSort.state.level)) !== 2) throw new Error('could not return to the highest unlocked level');
  console.log('level picker switches between unlocked levels, persists unlocks, and protects unfinished boards');

  // persistence: reload keeps level 2
  await page.reload({ waitUntil: 'networkidle0' });
  lvl = await page.evaluate(() => window.__ballSort.state.level);
  if (lvl !== 2) throw new Error('progress not persisted');
  if ((await page.$eval('#sort-progress', el => el.textContent)) !== 'Sorted: 0 / 3') throw new Error('sorted-color progress was incorrect after reloading the next level');
  const bestAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('ballsort.v1')).bestMoves['1']);
  if (bestAfterReload !== moves1) throw new Error('level 1 personal best did not survive advancing and reloading');
  console.log('progress persisted across reload (level 2)');

  // Replaying the deterministic level at the same move count keeps its best
  // and reports the existing record instead of claiming a new one.
  await page.evaluate(() => window.__ballSort.startLevel(1)); await sleep(300);
  const replayMoves = await solveCurrent(); await sleep(700);
  const replayBest = await page.evaluate(() => ({
    text: document.getElementById('win-sub').textContent,
    moves: JSON.parse(localStorage.getItem('ballsort.v1')).bestMoves['1']
  }));
  if (replayMoves !== moves1 || replayBest.moves !== moves1 || replayBest.text !== `Solved in ${moves1} moves · Personal best: ${moves1} moves`) {
    throw new Error('replaying a level at the same score changed or misreported its personal best');
  }
  await page.click('#btn-next'); await sleep(300);
  await page.evaluate(() => window.__ballSort.startLevel(1, {
    level: 1, tubes: [[0, 0], [0, 0], [1, 1, 1, 1], [2, 2, 2, 2], []],
    history: [], undos: 3, extraUsed: false, moves: 0
  }));
  const fasterMoves = await solveCurrent(); await sleep(700);
  const improvedBest = await page.evaluate(() => ({
    text: document.getElementById('win-sub').textContent,
    moves: JSON.parse(localStorage.getItem('ballsort.v1')).bestMoves['1']
  }));
  if (fasterMoves !== 1 || improvedBest.moves !== 1 || improvedBest.text !== 'Solved in 1 move · New personal best!') {
    throw new Error('a faster replay did not replace the level personal best');
  }
  await page.click('#btn-next'); await sleep(300);
  console.log('personal best survives replay, reports ties accurately, and improves on a faster solve');

  // A multi-ball move, its count/history, and its undo must survive reloads.
  await page.evaluate(() => window.__ballSort.startLevel(1, {
    level: 1, tubes: [[0, 1, 1], [1], [], [], []], history: [],
    undos: 3, extraUsed: false, moves: 0
  }));
  const snapshotProgress = () => page.evaluate(() => ({
    level: window.__ballSort.state.level,
    tubes: window.__ballSort.state.tubes,
    history: window.__ballSort.state.history,
    undos: window.__ballSort.state.undos,
    moves: window.__ballSort.state.moves,
    sortProgress: document.getElementById('sort-progress').textContent,
    extraUsed: window.__ballSort.state.extraUsed,
    hudMoves: document.getElementById('moves').textContent,
    undoDisabled: document.getElementById('btn-undo').disabled,
    tubeButtonDisabled: document.getElementById('btn-tube').disabled
  }));
  const before = await snapshotProgress();
  await tap(0); await tap(1); await waitIdle();
  const moved = await snapshotProgress();
  if (JSON.stringify(moved.tubes) !== JSON.stringify([[0], [1, 1, 1], [], [], []]) ||
      JSON.stringify(moved.history) !== JSON.stringify([[0, 1, 2]]) || moved.moves !== 1 || moved.undos !== 3 || moved.hudMoves !== 'Moves: 1' || moved.undoDisabled) {
    throw new Error('multi-ball move did not record one move and its undo history');
  }
  await page.reload({ waitUntil: 'networkidle0' });
  const restoredMove = await snapshotProgress();
  if (JSON.stringify(restoredMove) !== JSON.stringify(moved)) throw new Error('saved move, move count, or undo history did not restore consistently');
  await page.click('#btn-undo'); await sleep(100);
  const undone = await snapshotProgress();
  if (JSON.stringify(undone.tubes) !== JSON.stringify(before.tubes) || undone.moves !== 0 || undone.undos !== 2 || undone.history.length !== 0 || undone.hudMoves !== 'Moves: 0' || !undone.undoDisabled) {
    throw new Error('undo did not restore the original board and decrement one move/undo');
  }
  await page.reload({ waitUntil: 'networkidle0' });
  const restoredUndo = await snapshotProgress();
  if (JSON.stringify(restoredUndo) !== JSON.stringify(undone)) throw new Error('undone board, move count, or remaining undos did not persist');
  console.log('multi-ball move and undo state, counters, and history survive reloads');
  await page.evaluate(() => window.__ballSort.startLevel(2));
  const n0 = await page.evaluate(() => window.__ballSort.state.tubes.length);
  await page.click('#btn-tube'); await sleep(100);
  const extraTube = await snapshotProgress();
  if (extraTube.tubes.length !== n0 + 1 || !extraTube.extraUsed || !extraTube.tubeButtonDisabled) {
    throw new Error('extra tube was not granted and marked as used');
  }
  await page.reload({ waitUntil: 'networkidle0' });
  const restoredExtraTube = await snapshotProgress();
  if (JSON.stringify(restoredExtraTube) !== JSON.stringify(extraTube)) {
    throw new Error('extra tube or its used flag did not survive reload');
  }
  console.log('extra tube and one-use flag survive reload and keep the control disabled');
  await solveCurrent();
  await sleep(600);
  console.log('level 2 solved with extra tube');
  await page.click('#btn-next'); await sleep(300);

  // Rewarded undo grants credits without undoing the move; both the grant and
  // a later credit-consuming undo must persist across reloads.
  await page.evaluate(() => window.__ballSort.startLevel(1, {
    level: 1, tubes: [[0], [1, 1, 1], [], [], []], history: [[0, 1, 2]],
    undos: 0, extraUsed: false, moves: 1
  }));
  await page.click('#btn-undo');
  await page.waitForFunction(() => window.__ballSort.state.undos === 3, { timeout: 5000 });
  const rewardedUndo = await snapshotProgress();
  if (JSON.stringify(rewardedUndo.tubes) !== JSON.stringify([[0], [1, 1, 1], [], [], []]) ||
      JSON.stringify(rewardedUndo.history) !== JSON.stringify([[0, 1, 2]]) ||
      rewardedUndo.moves !== 1 || rewardedUndo.undos !== 3 || rewardedUndo.undoDisabled) {
    throw new Error('rewarded undo did not grant three credits while preserving the pending move');
  }
  await page.reload({ waitUntil: 'networkidle0' });
  const restoredReward = await snapshotProgress();
  if (JSON.stringify(restoredReward) !== JSON.stringify(rewardedUndo)) {
    throw new Error('rewarded undo credits or pending move did not survive reload');
  }
  await page.click('#btn-undo'); await sleep(100);
  const rewardedUndoUsed = await snapshotProgress();
  if (JSON.stringify(rewardedUndoUsed.tubes) !== JSON.stringify([[0, 1, 1], [1], [], [], []]) ||
      rewardedUndoUsed.history.length !== 0 || rewardedUndoUsed.moves !== 0 ||
      rewardedUndoUsed.undos !== 2 || !rewardedUndoUsed.undoDisabled) {
    throw new Error('undo did not consume one rewarded credit and restore the prior board');
  }
  await page.reload({ waitUntil: 'networkidle0' });
  const restoredRewardedUndo = await snapshotProgress();
  if (JSON.stringify(restoredRewardedUndo) !== JSON.stringify(rewardedUndoUsed)) {
    throw new Error('remaining rewarded undo credits or undone board did not survive reload');
  }
  console.log('rewarded undo grant and one-credit undo persist across reloads');

  // Exercise the native bridge contract with a mocked Capacitor plugin, then
  // restart the whole Chromium process against its persistent on-disk profile.
  await page.evaluate(() => {
    window.__rewardBridgeMock = { phase: 'unearned', listener: null, shows: 0 };
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { AdMob: {
        initialize: async () => {},
        requestConsentInfo: async () => ({}),
        addListener: async (name, listener) => {
          if (name !== 'onRewardedVideoAdReward') throw new Error('unexpected AdMob event: ' + name);
          window.__rewardBridgeMock.listener = listener;
          return { remove: () => { window.__rewardBridgeMock.listener = null; } };
        },
        prepareRewardVideoAd: async () => {},
        showRewardVideoAd: async () => {
          const mock = window.__rewardBridgeMock;
          mock.shows++;
          if (mock.phase === 'earned') mock.listener({ amount: 3, type: 'undo' });
          return null;
        }
      } }
    };
    window.__ballSort.startLevel(1, {
      level: 1, tubes: [[0], [1, 1, 1], [], [], []], history: [[0, 1, 2]],
      undos: 0, extraUsed: false, moves: 1
    });
  });
  await page.addScriptTag({ path: path.join(__dirname, '..', 'www', 'js', 'ads.js') });
  const nativePendingUndo = await snapshotProgress();
  await page.click('#btn-undo');
  await page.waitForFunction(() => window.__rewardBridgeMock.shows === 1 && window.__rewardBridgeMock.listener === null);
  await sleep(50);
  const afterUnearned = await snapshotProgress();
  if (JSON.stringify(afterUnearned) !== JSON.stringify(nativePendingUndo)) {
    throw new Error('mock native dismissal without an earned event changed undo credits or the pending move');
  }
  await page.evaluate(() => { window.__rewardBridgeMock.phase = 'earned'; });
  await page.click('#btn-undo');
  await page.waitForFunction(() => window.__ballSort.state.undos === 3 && window.__rewardBridgeMock.listener === null);
  const mockEarnedUndo = await snapshotProgress();
  if (JSON.stringify(mockEarnedUndo.tubes) !== JSON.stringify(nativePendingUndo.tubes) ||
      JSON.stringify(mockEarnedUndo.history) !== JSON.stringify(nativePendingUndo.history) ||
      mockEarnedUndo.moves !== nativePendingUndo.moves || mockEarnedUndo.undos !== 3) {
    throw new Error('mock earned native event did not grant credits without undoing the pending move');
  }
  console.log('mock native reward event gates undo credits: dismissal grants none, earned event grants three');

  await browser.close();
  browser = await launchBrowser();
  await openTestPage();
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(100);
  const afterChromeRestart = await snapshotProgress();
  if (JSON.stringify(afterChromeRestart) !== JSON.stringify(mockEarnedUndo)) {
    throw new Error('mock-earned undo state did not survive a fresh Chromium process using the same disk profile');
  }
  console.log('mock-earned undo state survived a fresh Chromium process and persistent browser profile');

  // harder levels, solved purely by taps; screenshot mid-game with a selection
  for (const L of [12, 30]) {
    await page.goto(URL + '?level=' + L, { waitUntil: 'networkidle0' }); await sleep(300);
    if (L === 30) await page.screenshot({ path: `${OUT}/ballsort-level30.png` });
    const m = await solveCurrent(L === 12 ? { move: 6, path: `${OUT}/ballsort-level12-playing.png` } : null);
    await sleep(700);
    const ok = await page.evaluate(() => window.__ballSort.state.won);
    if (!ok) throw new Error('level ' + L + ' not won');
    console.log(`level ${L} solved by taps in ${m} moves`);
  }

  // settings screenshot
  await page.goto(URL + '?level=7', { waitUntil: 'networkidle0' }); await sleep(200);
  await page.click('#btn-settings'); await sleep(400);
  let settingsFocus = await page.evaluate(() => ({ active: document.activeElement.id, modal: document.getElementById('settings').getAttribute('aria-modal'), hidden: document.getElementById('settings').getAttribute('aria-hidden'), inert: document.getElementById('app').inert }));
  if (settingsFocus.active !== 'opt-sound' || settingsFocus.modal !== 'true' || settingsFocus.hidden !== 'false' || !settingsFocus.inert) throw new Error('settings dialog did not enter modal focus state');
  const howToPlay = await page.$eval('#settings-help', el => el.textContent);
  if (!/Touch: Tap a tube to select it, then tap another tube to pour\./.test(howToPlay) || !/Keyboard: Focus a tube, use the arrow keys.*Enter or Space/.test(howToPlay) || !/Accessibility: Each tube's name gives its number, ball colors, and contents; its selected state is exposed through the button's pressed state\./.test(howToPlay) || !/Hint: Shows one recommended legal move without changing the board\./.test(howToPlay) || !/Levels: Tap the level number to revisit any unlocked level\./.test(howToPlay)) throw new Error('How to play instructions are missing touch, keyboard, accessibility, hint, or level-picker guidance');
  await page.keyboard.press('ArrowRight');
  if ((await page.evaluate(() => document.activeElement.id)) !== 'opt-sound') throw new Error('tube arrow navigation interfered with settings dialog focus');
  for (const id of ['opt-vibrate', 'btn-reset']) {
    await page.keyboard.press('Tab');
    if ((await page.evaluate(() => document.activeElement.id)) !== id) throw new Error('settings Tab order did not reach ' + id);
  }
  await page.keyboard.press('Tab');
  if (!(await page.evaluate(() => document.activeElement.matches('#settings a[href]')))) throw new Error('settings Tab order skipped the privacy link');
  await page.keyboard.press('Tab');
  if ((await page.evaluate(() => document.activeElement.id)) !== 'btn-close-settings') throw new Error('settings Tab order did not reach Done');
  await page.keyboard.press('Tab');
  if ((await page.evaluate(() => document.activeElement.id)) !== 'opt-sound') throw new Error('settings Tab did not wrap to the first control');
  await shiftTab();
  if ((await page.evaluate(() => document.activeElement.id)) !== 'btn-close-settings') throw new Error('settings Shift+Tab did not wrap to the last control');
  await page.evaluate(() => document.getElementById('btn-restart').focus());
  if (!(await page.evaluate(() => document.getElementById('settings').contains(document.activeElement)))) throw new Error('settings dialog did not contain programmatic focus');
  await page.keyboard.press('Escape');
  settingsFocus = await page.evaluate(() => ({ active: document.activeElement.id, hidden: document.getElementById('settings').getAttribute('aria-hidden'), inert: document.getElementById('app').inert }));
  if (settingsFocus.active !== 'btn-settings' || settingsFocus.hidden !== 'true' || settingsFocus.inert) throw new Error('settings Escape did not close and restore focus');
  await touch('#btn-settings'); await sleep(100);
  await page.screenshot({ path: `${OUT}/ballsort-settings.png` });
  await touch('#btn-close-settings'); await sleep(100);
  if (!(await page.$eval('#settings', el => el.classList.contains('hidden')))) throw new Error('touch Done control did not close settings');
  if ((await page.evaluate(() => document.activeElement.id)) !== 'btn-settings') throw new Error('touch close did not restore settings focus');

  await page.evaluate(() => { window.confirm = () => true; });
  await page.click('#btn-settings'); await page.click('#btn-reset'); await sleep(100);
  const resetProgress = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('ballsort.v1'));
    return { level: window.__ballSort.state.level, unlocked: window.__ballSort.state.unlockedLevel, bestMoves: window.__ballSort.state.bestMoves, savedLevel: saved.level, savedUnlock: saved.unlockedLevel, savedBestMoves: saved.bestMoves };
  });
  if (resetProgress.level !== 1 || resetProgress.unlocked !== 1 || resetProgress.savedLevel !== 1 || resetProgress.savedUnlock !== 1 || Object.keys(resetProgress.bestMoves).length || Object.keys(resetProgress.savedBestMoves).length) {
    throw new Error('reset progress did not clear personal-best records along with level progress');
  }
  console.log('explicit progress reset clears personal-best records');

  // privacy page
  const resp = await page.goto(URL + 'privacy.html');
  if (resp.status() !== 200) throw new Error('privacy.html ' + resp.status());

  if (errors.length) throw new Error('Console errors: ' + errors.join('; '));
  console.log('ALL BROWSER TESTS PASSED');
  await browser.close();
  browser = null;
  fs.rmSync(PROFILE, { recursive: true, force: true });
})().catch(async e => {
  console.error('FAIL', e);
  if (browser) await browser.close().catch(() => {});
  fs.rmSync(PROFILE, { recursive: true, force: true });
  process.exitCode = 1;
});

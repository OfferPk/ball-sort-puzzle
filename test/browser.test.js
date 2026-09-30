// Headless Chrome test: plays levels by tapping tubes like a user, checks
// win detection, undo, extra tube, persistence, and saves phone screenshots.
// Usage: node test/browser.test.js http://localhost:8765/ [outdir]
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const URL = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || '/workspace';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser = null;
(async () => {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Mobile Safari/537.36' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

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
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(300);
  await page.screenshot({ path: `${OUT}/ballsort-level1.png` });

  const accessible = await page.evaluate(() => ({
    board: document.getElementById('board').getAttribute('role'),
    liveMoves: document.getElementById('moves').getAttribute('aria-live'),
    tubes: [...document.querySelectorAll('.tube')].every(t => t.tagName === 'BUTTON' && t.type === 'button' && t.getAttribute('aria-label').startsWith('Tube ') && t.hasAttribute('aria-pressed') && t.getAttribute('aria-keyshortcuts') === 'ArrowLeft ArrowRight ArrowUp ArrowDown')
  }));
  if (accessible.board !== 'group' || accessible.liveMoves !== 'polite' || !accessible.tubes) throw new Error('accessible board/tube semantics missing');
  await page.evaluate(() => window.__ballSort.startLevel(1, { level: 1, tubes: [[0, 1, 2, 0], [], [2, 2, 2, 2], [1, 2], []], history: [], undos: 3, extraUsed: false, moves: 0 }));
  await assertTubeAccessibility('label fixture');
  await page.evaluate(() => window.__ballSort.startLevel(1));

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

  // play level 1 by taps
  const moves1 = await solveCurrent();
  await assertTubeAccessibility('completed level');
  await sleep(900);
  const won = await page.evaluate(() => window.__ballSort.state.won && !document.getElementById('win').classList.contains('hidden'));
  if (!won) throw new Error('level 1 win not detected');
  let winFocus = await page.evaluate(() => ({ active: document.activeElement.id, modal: document.getElementById('win').getAttribute('aria-modal'), hidden: document.getElementById('win').getAttribute('aria-hidden'), inert: document.getElementById('app').inert }));
  if (winFocus.active !== 'btn-next' || winFocus.modal !== 'true' || winFocus.hidden !== 'false' || !winFocus.inert) throw new Error('win dialog did not enter modal focus state');
  await page.keyboard.press('Tab');
  await shiftTab();
  await page.evaluate(() => document.getElementById('btn-settings').focus());
  winFocus = await page.evaluate(() => ({ active: document.activeElement.id, shown: !document.getElementById('win').classList.contains('hidden') }));
  if (winFocus.active !== 'btn-next' || !winFocus.shown) throw new Error('win dialog did not contain focus');
  await page.keyboard.press('Escape');
  if (!(await page.$eval('#win', el => !el.classList.contains('hidden')))) throw new Error('Escape unexpectedly dismissed the win dialog');
  await page.screenshot({ path: `${OUT}/ballsort-win.png` });
  console.log(`level 1 solved by taps in ${moves1} moves, win overlay shown`);
  await page.click('#btn-next'); await sleep(300);
  let lvl = await page.evaluate(() => window.__ballSort.state.level);
  if (lvl !== 2) throw new Error('did not advance');
  const focusAfterWin = await page.evaluate(() => document.activeElement && document.activeElement.dataset.index);
  if (focusAfterWin !== '0') throw new Error('focus was not moved to the new board after advancing');

  // persistence: reload keeps level 2
  await page.reload({ waitUntil: 'networkidle0' });
  lvl = await page.evaluate(() => window.__ballSort.state.level);
  if (lvl !== 2) throw new Error('progress not persisted');
  console.log('progress persisted across reload (level 2)');

  // undo & extra tube
  const before = await page.evaluate(() => JSON.stringify(window.__ballSort.state.tubes));
  const sol2 = await page.evaluate(() => window.__ballSort.logic.solve(window.__ballSort.state.tubes));
  await tap(sol2[0][0]); await tap(sol2[0][1]); await waitIdle();
  await page.click('#btn-undo'); await sleep(100);
  const after = await page.evaluate(() => JSON.stringify(window.__ballSort.state.tubes));
  const undos = await page.evaluate(() => window.__ballSort.state.undos);
  if (before !== after || undos !== 2) throw new Error('undo failed');
  console.log('undo restores state, undos left =', undos);
  const n0 = await page.evaluate(() => window.__ballSort.state.tubes.length);
  await page.click('#btn-tube'); await sleep(100);
  const n1 = await page.evaluate(() => window.__ballSort.state.tubes.length);
  if (n1 !== n0 + 1) throw new Error('extra tube failed');
  console.log('+1 tube (web: reward granted instantly):', n0, '->', n1);
  await solveCurrent();
  await sleep(600);
  console.log('level 2 solved with extra tube');

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
  if (!/Touch: Tap a tube to select it, then tap another tube to pour\./.test(howToPlay) || !/Keyboard: Focus a tube, use the arrow keys.*Enter or Space/.test(howToPlay) || !/Accessibility: Each tube's name gives its number, ball colors, and contents; its selected state is exposed through the button's pressed state\./.test(howToPlay)) throw new Error('How to play instructions are missing touch, keyboard, or accessibility guidance');
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

  // privacy page
  const resp = await page.goto(URL + 'privacy.html');
  if (resp.status() !== 200) throw new Error('privacy.html ' + resp.status());

  if (errors.length) throw new Error('Console errors: ' + errors.join('; '));
  console.log('ALL BROWSER TESTS PASSED');
  await browser.close();
})().catch(async e => {
  console.error('FAIL', e);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
});

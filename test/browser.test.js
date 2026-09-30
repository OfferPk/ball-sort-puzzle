// Headless Chrome test: plays levels by tapping tubes like a user, checks
// win detection, undo, extra tube, persistence, and saves phone screenshots.
// Usage: node test/browser.test.js http://localhost:8765/ [outdir]
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const URL = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || '/workspace';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
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
  async function waitIdle() { await page.waitForFunction(() => !window.__ballSort.state.busy, { timeout: 5000 }); }
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
    tubes: [...document.querySelectorAll('.tube')].every(t => t.tagName === 'BUTTON' && t.type === 'button' && t.getAttribute('aria-label').startsWith('Tube ') && t.hasAttribute('aria-pressed'))
  }));
  if (accessible.board !== 'group' || accessible.liveMoves !== 'polite' || !accessible.tubes) throw new Error('accessible board/tube semantics missing');
  await page.focus('.tube[data-index="0"]');
  await page.keyboard.press('Enter');
  let selected = await page.$eval('.tube[data-index="0"]', el => el.getAttribute('aria-pressed'));
  if (selected !== 'true') throw new Error('keyboard selection did not update pressed state');
  await page.keyboard.press('Enter');
  selected = await page.$eval('.tube[data-index="0"]', el => el.getAttribute('aria-pressed'));
  if (selected !== 'false') throw new Error('keyboard deselection did not update pressed state');

  const keyboardMove = await page.evaluate(() => window.__ballSort.logic.solve(window.__ballSort.state.tubes)[0]);
  await page.focus(`.tube[data-index="${keyboardMove[0]}"]`);
  await page.keyboard.press('Enter');
  await page.focus(`.tube[data-index="${keyboardMove[1]}"]`);
  await page.keyboard.press('Enter');
  await waitIdle();
  const focusedTube = await page.evaluate(() => document.activeElement && document.activeElement.dataset.index);
  if (focusedTube !== String(keyboardMove[1])) throw new Error('keyboard focus was not restored after move');
  await page.evaluate(() => window.__ballSort.startLevel(1));

  // play level 1 by taps
  const moves1 = await solveCurrent();
  await sleep(900);
  const won = await page.evaluate(() => window.__ballSort.state.won && !document.getElementById('win').classList.contains('hidden'));
  if (!won) throw new Error('level 1 win not detected');
  await page.screenshot({ path: `${OUT}/ballsort-win.png` });
  console.log(`level 1 solved by taps in ${moves1} moves, win overlay shown`);
  await page.click('#btn-next'); await sleep(300);
  let lvl = await page.evaluate(() => window.__ballSort.state.level);
  if (lvl !== 2) throw new Error('did not advance');

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
  await page.screenshot({ path: `${OUT}/ballsort-settings.png` });

  // privacy page
  const resp = await page.goto(URL + 'privacy.html');
  if (resp.status() !== 200) throw new Error('privacy.html ' + resp.status());

  if (errors.length) { console.error('Console errors:', errors); process.exit(1); }
  console.log('ALL BROWSER TESTS PASSED');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });

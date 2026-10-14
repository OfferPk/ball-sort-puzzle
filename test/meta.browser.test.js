// v1.1 headless test: how-to card on first launch, first-level coach, win -> coins + achievements +
// daily challenge progress, daily reward claim, shop buy/equip/trial preview, accessibility settings,
// no interstitial in the first session. Usage: node test/meta.browser.test.js http://localhost:8765/ [outdir]
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const URL = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ok(c, m) { if (!c) throw new Error(m); console.log('ok -', m); }
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'],
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bs-meta-')) });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(500);
  ok(await page.$eval('#howto', e => !e.classList.contains('hidden')), 'how-to card opens on first launch');
  ok((await page.$$eval('.howto-list li', l => l.length)) >= 4, 'how-to card lists the rules');
  await page.screenshot({ path: path.join(OUT, 'meta-howto.png') });
  await page.click('.howto-go'); await sleep(800);
  ok(!!(await page.$('.coach')), 'first-level coach starts after the how-to card');
  for (let i = 0; i < 8 && await page.$('.coach-next'); i++) { await page.click('.coach-next'); await sleep(150); }
  ok(!(await page.$('.coach')), 'coach can be finished');
  ok(await page.evaluate(() => localStorage.getItem('ballsort.meta.v1.howto') === '1' && localStorage.getItem('ballsort.meta.v1.coach') === '1'), 'onboarding is remembered');
  ok(await page.evaluate(() => window.AdGate.state().sessions === 1 && !window.AdGate.allow()), 'first session: interstitials gated off');

  // solve level 1 programmatically through the real tap path
  async function solve() {
    const sol = await page.evaluate(() => { const B = window.__ballSort; return B.logic.solve ? B.logic.solve(B.state.tubes.map(t => t.slice())) : null; });
    if (!sol) throw new Error('no solver');
    for (const [a, b] of sol) {
      await page.evaluate(i => window.__ballSort.onTube(i), a); await page.evaluate(i => window.__ballSort.onTube(i), b);
      await page.waitForFunction(() => !window.__ballSort.state.busy, { timeout: 5000 });
    }
    await sleep(400);
  }
  const before = await page.evaluate(() => Meta.coins());
  await solve();
  ok(await page.$eval('#win', e => !e.classList.contains('hidden')), 'level 1 solved');
  const after = await page.evaluate(() => Meta.coins());
  ok(after >= before + 25, 'win pays cosmetic coins (' + before + ' -> ' + after + ')');
  ok(/\+\d+ coins/.test(await page.$eval('#win-coins', e => e.textContent)), 'win card shows coins earned');
  ok(await page.evaluate(() => Meta.ach().get('wins') === 1 && Meta.ach().state().done.bs_first === 1), 'First Pour achievement unlocked');
  ok(await page.evaluate(() => Meta.state().chal && Meta.state().chal.day === MetaLogic.dateKey()), 'daily challenge progress tracked');
  await page.click('#btn-next'); await sleep(300);
  ok(await page.evaluate(() => window.AdGate.state().levels === 1), 'level completion counted by the ad gate');

  // daily reward
  await page.click('#btn-daily'); await sleep(300);
  ok((await page.$$eval('.daily-day', l => l.length)) === 7, 'daily calendar has 7 days');
  const c0 = await page.evaluate(() => Meta.coins());
  await page.click('.daily-claim'); await sleep(200);
  ok((await page.evaluate(() => Meta.coins())) >= c0 + 20 && await page.evaluate(() => Meta.ach().get('daily_claims') === 1), 'day-1 reward claimed (+20, plus Early Bird)');
  ok(await page.$eval('.daily-claim', b => b.disabled), 'claim disabled for the rest of today');
  await page.screenshot({ path: path.join(OUT, 'meta-daily.png') });
  await page.click('.daily-x'); await sleep(200);

  // shop
  await page.evaluate(() => Meta.addCoins(1000));
  await page.click('#btn-shop'); await sleep(300);
  ok((await page.$$eval('#shop .item', l => l.length)) === 14, 'shop lists 7 finishes + 7 backgrounds');
  await page.evaluate(() => [...document.querySelectorAll('#shop .item')].find(i => i.textContent.includes('Neon Glow')).querySelector('.prev').click()); await sleep(100);
  ok(await page.evaluate(() => document.body.classList.contains('ball-neon')), 'tap preview applies the finish');
  await page.evaluate(() => document.querySelector('#shop [data-close]').click()); await sleep(100);
  ok(await page.evaluate(() => !document.body.classList.contains('ball-neon')), 'closing the shop ends the preview');
  await page.click('#btn-shop'); await sleep(200);
  const c1 = await page.evaluate(() => Meta.coins());
  await page.evaluate(() => [...document.querySelectorAll('#shop .item')].find(i => i.textContent.includes('Pearl Sheen')).querySelector('.buy').click()); await sleep(100);
  ok(await page.evaluate(c => Meta.coins() <= c - 250 + 100 && Meta.state().owned.ball.includes('pearl') && document.body.classList.contains('ball-pearl'), c1), 'buying Pearl Sheen spends 250 and equips it');
  await page.evaluate(() => [...document.querySelectorAll('#shop .item')].find(i => i.textContent.includes('Deep Ocean')).querySelector('.buy').click()); await sleep(100);
  ok(await page.evaluate(() => document.body.classList.contains('bgx-ocean')), 'background bought and applied');
  await page.screenshot({ path: path.join(OUT, 'meta-shop.png') });
  await page.evaluate(() => document.querySelector('#shop [data-close]').click());
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  ok(await page.evaluate(() => document.body.classList.contains('ball-pearl') && document.body.classList.contains('bgx-ocean')), 'skins persist across launches');
  ok(await page.$eval('#howto', e => e.classList.contains('hidden')), 'how-to card does not reopen');
  ok(await page.evaluate(() => window.AdGate.state().sessions === 2), 'second session counted');

  // awards + stats
  await page.click('#btn-awards'); await sleep(200);
  ok(/unlocked/.test(await page.$eval('.ach-sum', e => e.textContent)), 'achievements panel opens');
  await page.evaluate(() => document.querySelector('.ach-tabs [data-t="stats"]').click()); await sleep(100);
  ok(/Levels won/.test(await page.$eval('.ach-body', e => e.textContent)), 'stats tab shows game stats');
  await page.screenshot({ path: path.join(OUT, 'meta-awards.png') });
  await page.evaluate(() => document.querySelector('.ach-x').click());

  // accessibility settings
  await page.click('#btn-settings'); await sleep(200);
  await page.click('#set-large'); await page.click('#set-contrast');
  ok(await page.evaluate(() => document.documentElement.classList.contains('a11y-large') && document.documentElement.classList.contains('a11y-contrast')), 'larger text + high contrast apply');
  await page.click('#set-motion');
  ok(await page.evaluate(() => document.documentElement.classList.contains('a11y-reduce')), 'reduce motion applies');
  await page.screenshot({ path: path.join(OUT, 'meta-settings.png') });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(200);
  ok(await page.evaluate(() => ['a11y-large', 'a11y-contrast', 'a11y-reduce'].every(c => document.documentElement.classList.contains(c))), 'accessibility settings persist');
  await page.click('#btn-settings'); await sleep(200);
  await page.click('#btn-tour-again'); await sleep(500);
  ok(!!(await page.$('.coach')) && await page.$eval('#settings', e => e.classList.contains('hidden')), 'tutorial can be replayed from Settings');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  console.log('ALL META BROWSER TESTS PASSED');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });

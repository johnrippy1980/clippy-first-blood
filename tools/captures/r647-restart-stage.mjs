// R647: RESTART STAGE pause option — restarts the current stage (fresh
// player/level via _startStage) without quitting to title. Teeth: fails if
// the option is removed (selection index 1 would no longer be RESTART STAGE,
// so firing it wouldn't reset the stage timer) or if it leaks errors.
// @probe-timeout 45000
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r647', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(400);
await page.focus('#screen');
async function tap(key) { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); }

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; };

// Boot to PLAY: title/ready on x; story supports P = SKIP-ALL.
for (let i = 0; i < 60; i++) {
  const s = await page.evaluate(() => window.__game.scene);
  if (s === 'play') break;
  if (s === 'story') { await tap('p'); await page.waitForTimeout(500); continue; }
  await tap('x'); await page.waitForTimeout(350);
}
const boot = await page.evaluate(() => ({ scene: window.__game.scene, stage: window.__game.currentStage }));
check('reached PLAY', boot.scene === 'play', 'scene=' + boot.scene);

// Accumulate stage time + a kill so a real restart is observable.
await page.keyboard.down('ArrowRight'); await page.keyboard.down('x');
await page.waitForTimeout(3000);
await page.keyboard.up('ArrowRight'); await page.keyboard.up('x');
const before = await page.evaluate(() => ({
  stage: window.__game.currentStage,
  stageTime: window.__game.stageTime,
  kills: window.__game.stageStats?.kills ?? 0,
}));
check('accumulated stage time before restart', before.stageTime > 60, 'stageTime=' + before.stageTime);

// Pause.
await tap('p'); await page.waitForTimeout(500);
const paused = await page.evaluate(() => ({ scene: window.__game.scene, idx: window.__game.pauseIndex }));
check('entered PAUSE', paused.scene === 'pause', 'scene=' + paused.scene);

// RESTART STAGE is option index 1 (RESUME=0). Move down once, fire.
await tap('ArrowDown'); await page.waitForTimeout(150);
const idx = await page.evaluate(() => window.__game.pauseIndex);
check('selection moved to index 1', idx === 1, 'idx=' + idx);
await page.screenshot({ path: '/tmp/r647/01_pause.png' });
await tap('x'); // confirm RESTART STAGE
await page.waitForTimeout(2000); // STAGE_INTRO/READY -> fresh stage

const after = await page.evaluate(() => ({
  stage: window.__game.currentStage,
  stageTime: window.__game.stageTime,
  kills: window.__game.stageStats?.kills ?? 0,
  scene: window.__game.scene,
}));
check('same stage after restart', after.stage === before.stage, before.stage + '->' + after.stage);
check('stage timer reset', after.stageTime < before.stageTime, before.stageTime + '->' + after.stageTime);
check('stage kills reset', after.kills === 0, 'kills=' + after.kills);
check('did NOT quit to title', after.scene !== 'title', 'scene=' + after.scene);
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R647 PASS' : ('R647 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);

// R649: EASY/NORMAL/HARD difficulty. Difficulty scales the damage the player
// TAKES (player.damageTakenMult) and enemy HP (enemies.difficultyHpMult),
// applied per-stage in _startStage. Teeth: fails if the option doesn't drive
// either multiplier, if the menu cycle is broken, if Normal isn't a 1.0/1.0
// no-op, or if leaks errors. Drives the REAL OPTIONS menu to flip difficulty,
// then RESTART STAGE so _startStage re-applies the mults to a live player.
// @probe-timeout 60000
import { chromium } from 'playwright';

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

// Boot to PLAY.
for (let i = 0; i < 60; i++) {
  const s = await page.evaluate(() => window.__game.scene);
  if (s === 'play') break;
  if (s === 'story') { await tap('p'); await page.waitForTimeout(500); continue; }
  await tap('x'); await page.waitForTimeout(350);
}
check('reached PLAY', (await page.evaluate(() => window.__game.scene)) === 'play');

// Helper: open OPTIONS via PAUSE, jump cursor to DIFFICULTY, return the index.
async function openOptionsToDifficulty() {
  await tap('p'); await page.waitForTimeout(400);                 // PAUSE
  await page.evaluate(() => { window.__game.pauseIndex = 2; });   // OPTIONS
  await tap('x'); await page.waitForTimeout(400);
  return page.evaluate(() => {
    const items = ['MASTER VOLUME','MUSIC VOLUME','SFX VOLUME','DIFFICULTY','SCANLINES','CRT CURVE','SHAKE INTENSITY','REDUCED MOTION','SHOW READY','SHOW GHOST','BACK'];
    window.__game.optionsIndex = items.indexOf('DIFFICULTY');
    return window.__game.optionsIndex;
  });
}
// Wait until the stage settles back into live PLAY (RESTART routes through
// STAGE_INTRO -> READY -> PLAY; menu input is ignored until PLAY resumes).
async function waitForPlay() {
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => window.__game.scene);
    if (s === 'play') return true;
    if (s === 'ready' || s === 'stageIntro') { await tap('x'); }
    await page.waitForTimeout(250);
  }
  return false;
}
// Helper: back out of OPTIONS -> PAUSE -> RESTART STAGE so _startStage re-runs.
async function applyViaRestart() {
  await tap('p'); await page.waitForTimeout(300);                 // OPTIONS -> PAUSE
  await page.evaluate(() => { window.__game.pauseIndex = 1; });   // RESTART STAGE
  await tap('x'); await page.waitForTimeout(500);                 // begin restart
  await waitForPlay();                                            // settle to PLAY
}
async function readMults() {
  return page.evaluate(() => ({
    scene: window.__game.scene,
    taken: window.__game.player?.damageTakenMult,
    enemyHp: window.__game.enemies?.difficultyHpMult,
  }));
}

// --- DEFAULT = NORMAL: must be a 1.0/1.0 no-op ---
const dIdx = await openOptionsToDifficulty();
check('DIFFICULTY menu row present (idx 3)', dIdx === 3, 'idx=' + dIdx);
await applyViaRestart();
let m = await readMults();
check('default difficulty is normal (taken 1.0)', m.taken === 1, 'taken=' + m.taken);
check('default difficulty is normal (enemyHp 1.0)', m.enemyHp === 1, 'enemyHp=' + m.enemyHp);

// --- Cycle LEFT from NORMAL -> EASY (order EASY,NORMAL,HARD) ---
await openOptionsToDifficulty();
await tap('ArrowLeft'); await page.waitForTimeout(150);
check('cursor still on DIFFICULTY after toggle', (await page.evaluate(() => window.__game.optionsIndex)) === 3);
await applyViaRestart();
m = await readMults();
check('EASY player takes 0.5x', Math.abs(m.taken - 0.5) < 1e-6, 'taken=' + m.taken);
check('EASY enemy HP 0.75x', Math.abs(m.enemyHp - 0.75) < 1e-6, 'enemyHp=' + m.enemyHp);

// --- Cycle RIGHT twice from EASY -> NORMAL -> HARD ---
await openOptionsToDifficulty();
await tap('ArrowRight'); await page.waitForTimeout(120);  // EASY -> NORMAL
await tap('ArrowRight'); await page.waitForTimeout(120);  // NORMAL -> HARD
await applyViaRestart();
m = await readMults();
check('HARD player takes 1.5x', Math.abs(m.taken - 1.5) < 1e-6, 'taken=' + m.taken);
check('HARD enemy HP 1.4x', Math.abs(m.enemyHp - 1.4) < 1e-6, 'enemyHp=' + m.enemyHp);

// --- Spawned enemies actually carry the HARD HP scale (teeth: the spawned
// hp must equal ceil(base * stageScale * difficultyHpMult); a broken
// multiply-application in spawn() would yield the un-difficultied value). ---
const enemyHpScaled = await page.evaluate(() => {
  const g = window.__game;
  const before = g.enemies.enemies.length;
  // Force a known stageScale so the expected value is deterministic + the
  // difficulty factor is the ONLY thing distinguishing pass from fail.
  g.enemies.stageScale = 1;
  const e = g.enemies.spawn(g.player.x + 40, g.player.y, 'folder');
  return {
    hp: e.hp, maxHp: e.maxHp,
    mult: g.enemies.difficultyHpMult,
    stageScale: g.enemies.stageScale,
    grew: g.enemies.enemies.length > before,
  };
});
// folder base hp = 2; at HARD (mult 1.4): ceil(2 * 1 * 1.4) = ceil(2.8) = 3.
const expectedHp = Math.max(1, Math.ceil(2 * enemyHpScaled.stageScale * enemyHpScaled.mult));
check('spawned enemy hp == maxHp', enemyHpScaled.hp === enemyHpScaled.maxHp, 'hp=' + enemyHpScaled.hp);
check('HARD difficultyHpMult is 1.4', enemyHpScaled.mult === 1.4, 'mult=' + enemyHpScaled.mult);
check('spawned enemy hp == ceil(base*stage*diff)', enemyHpScaled.hp === expectedHp,
  'got ' + enemyHpScaled.hp + ' expected ' + expectedHp);
check('HARD raises folder hp above base 2', enemyHpScaled.hp > 2, 'hp=' + enemyHpScaled.hp);

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R649 PASS' : ('R649 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);

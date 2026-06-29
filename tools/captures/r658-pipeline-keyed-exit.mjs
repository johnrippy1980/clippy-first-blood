// R658: THE PIPELINE is the third campaign stage to USE the R655 EXIT KEY
// lock (after R656 FOUNDER'S LAIR and R657 KEYNOTE HALL). makeStagePipeline()
// sets `exitKey:true` and hides an EXITKEY pickup on the LAB-ENTRY CEILING DUCT
// (col 58, row 1 — one tile above the row-2 upper-pipe-loft platform), past the
// mini-boss act break, reached via the overhead high road. This probe proves
// the stage is wired end-to-end on the REAL campaign geometry:
//
//   - stage 4 really is THE PIPELINE (so we're gating the intended stage),
//   - data.exitKey is authored true,
//   - the EXITKEY pickup exists AND is reachable: empty tile with a PLATFORM
//     directly beneath it (NOT buried in a wall — the buried-actor hazard),
//   - the keyed EXIT does NOT clear while the key is un-held (even with the
//     boss down — boss-gate and key-gate are independent),
//   - grabbing the key clears the SAME exit once the boss is also down.
//
// Teeth: fails if the stage isn't gated, if the key is missing or buried, if a
// boss-down-but-keyless player can clear the locked exit, or if a keyed player
// still can't leave.
// @probe-timeout 60000
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(300);
await page.focus('#screen');

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; };

// --- Authoring: the right stage is gated and the key is placed + reachable. ---
const authored = await page.evaluate(async () => {
  const g = window.__game;
  g._startStage(4);
  await new Promise(r => setTimeout(r, 150));
  const d = g.level.data, T = 16;
  const keySpawn = (d.pickupSpawns || []).find(p => p.type === 'EXITKEY');
  const kc = keySpawn ? Math.floor(keySpawn.x / T) : -1;
  const kr = keySpawn ? Math.floor(keySpawn.y / T) : -1;
  return {
    theme: d.theme,
    exitKey: d.exitKey === true,
    hasKeySpawn: !!keySpawn,
    tileAtKey: kr >= 0 ? g.level.tiles[kr][kc] : null,
    tileBelowKey: kr >= 0 ? g.level.tiles[kr + 1][kc] : null,
  };
});
check('stage 4 is THE PIPELINE', authored.theme === 'sewer', JSON.stringify(authored));
check('THE PIPELINE authors exitKey:true', authored.exitKey);
check('an EXITKEY pickup is placed on the stage', authored.hasKeySpawn);
// EMPTY (0) tile with a PLATFORM (2) directly beneath = reachable, not buried.
check('EXIT KEY sits in open air (not buried in a wall)', authored.tileAtKey === 0, 'tileAtKey=' + authored.tileAtKey);
check('EXIT KEY rests one tile above the CEILING DUCT', authored.tileBelowKey === 2, 'tileBelowKey=' + authored.tileBelowKey);

// --- Reach the PLAY scene on stage 4 so the exit-check actually runs. ---
await page.evaluate(async () => {
  const g = window.__game;
  g._startStage(4);
  await new Promise(r => setTimeout(r, 120));
  const lvl = g.level;
  if (lvl?.data) { lvl.data.bossTrigger = { x: 9999999 }; lvl.data.miniBossTrigger = 9999999; }
});
for (let i = 0; i < 60; i++) {
  const sc = await page.evaluate(() => window.__game.scene);
  if (sc === 'play') break;
  await page.keyboard.press('x');
  await page.waitForTimeout(50);
}

// --- Boss DOWN but key UN-HELD: the keyed exit must NOT clear. ---
const lockedWithBoss = await page.evaluate(() => {
  const g = window.__game, lvl = g.level, T = 16;
  g.bossSpawned = false; g.boss = null; g._bossKillBeatFired = true;
  g._clearScheduled = false;
  let ex = null;
  for (let r = 0; r < lvl.data.height && !ex; r++)
    for (let c = 0; c < lvl.data.width; c++)
      if (lvl.tiles[r][c] === 9) { ex = { r, c }; break; }
  const p = g.player;
  p.hasExitKey = false;
  p.x = ex.c * T + T / 2 - p.w / 2;
  p.y = ex.r * T + (T - 1) - p.h;
  const isExit = lvl.isExit(p.x + p.w / 2, p.y + p.h);
  g._tickPlayHandleStageClear();
  return { scene: g.scene, isExit, cleared: !!g._clearScheduled };
});
check('on the EXIT tile in PLAY scene (stage 4)', lockedWithBoss.scene === 'play' && lockedWithBoss.isExit === true, JSON.stringify(lockedWithBoss));
check('boss-down but KEYLESS does NOT clear the keyed exit', lockedWithBoss.cleared === false, JSON.stringify(lockedWithBoss));

// --- Grab the key (boss already down): the SAME exit now clears. ---
// Re-assert the player ON the exit tile: the live loop keeps ticking between
// page.evaluate calls, and gravity/physics can drift the player off the exit
// row before this check runs (the boss-gate/key-gate handler only fires while
// the player's feet are on the X tile).
const cleared = await page.evaluate(() => {
  const g = window.__game, lvl = g.level, T = 16;
  g.bossSpawned = false; g.boss = null; g._bossKillBeatFired = true;
  let ex = null;
  for (let r = 0; r < lvl.data.height && !ex; r++)
    for (let c = 0; c < lvl.data.width; c++)
      if (lvl.tiles[r][c] === 9) { ex = { r, c }; break; }
  const p = g.player;
  p.pickup('EXITKEY');
  p.x = ex.c * T + T / 2 - p.w / 2;
  p.y = ex.r * T + (T - 1) - p.h;
  g._clearScheduled = false;
  g._tickPlayHandleStageClear();
  return { hasKey: !!p.hasExitKey, cleared: !!g._clearScheduled };
});
check('grabbing the EXIT KEY sets hasExitKey', cleared.hasKey === true);
check('keyed + boss-down clears THE PIPELINE', cleared.cleared === true, JSON.stringify(cleared));

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R658 PASS' : ('R658 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);

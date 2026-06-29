// R655: KEY-GATED PROGRESSION DOOR. Platformer keys used to be cosmetic
// (CLIPPY_TAG) or Doom-mode-only colored keycards — the user's "keys just give
// armor/life, I want a key that opens a VISIBLE way to the next stage". R655
// adds an EXITKEY pickup + a per-stage `exitKey:true` level flag: a keyed
// stage's EXIT stays LOCKED (gold padlock badge on the painted door, "NEED
// EXIT KEY" denial) until the player grabs the key.
//
// This probe injects the flag at runtime on a real platformer stage (so it
// does NOT depend on any specific campaign stage being gated yet) and proves
// the whole mechanism end-to-end.
//
// Teeth: fails if EXITKEY doesn't set player.hasExitKey, if the flag doesn't
// reset per stage, if a locked keyed exit still clears the stage, if grabbing
// the key fails to unlock it, if the painted key sprite is missing, or if the
// level's locked-badge state doesn't track the flag.
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

// --- Painted key sprite loaded (collectibles are NOT procedural). ---
const art = await page.evaluate(async () => {
  const { sprites } = await import('/src/sprites.js');
  return { has: sprites.has('pickup_key') };
});
check('painted EXIT KEY sprite loaded (pickup_key)', art.has);

// --- EXITKEY pickup sets the per-stage flag, and resetForStage clears it. ---
const flagBehavior = await page.evaluate(() => {
  const g = window.__game;
  g._startStage(1);
  const p = g.player;
  if (!p) return { ok: false, reason: 'no player' };
  const start = !!p.hasExitKey;                 // fresh stage → false
  p.pickup('EXITKEY');
  const afterPickup = !!p.hasExitKey;           // → true
  p.resetForStage();
  const afterReset = !!p.hasExitKey;            // → false again
  return { ok: true, start, afterPickup, afterReset };
});
check('EXIT KEY starts un-held on a fresh stage', flagBehavior.ok && flagBehavior.start === false, JSON.stringify(flagBehavior));
check('grabbing EXIT KEY sets hasExitKey', flagBehavior.afterPickup === true);
check('resetForStage clears the EXIT KEY (per-stage)', flagBehavior.afterReset === false);

// --- A keyed (locked) exit does NOT clear the stage; once the key is grabbed,
// the same exit DOES clear. We inject exitKey:true on a real stage, stand the
// player on the EXIT tile, and call the exit-check directly. ---
// Start stage 1 and disarm its boss gate, then reach the PLAY scene via real
// key presses (intro → ready → play) so the exit-check actually runs.
await page.evaluate(async () => {
  const g = window.__game;
  g._startStage(1);
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

const gate = await page.evaluate(() => {
  const g = window.__game;
  const lvl = g.level; const T = 16;
  g.bossSpawned = false; g.boss = null; g._bossKillBeatFired = true;
  g._clearScheduled = false;
  lvl.data.exitKey = true;   // inject the key requirement at runtime
  let ex = null;
  for (let r = 0; r < lvl.data.height && !ex; r++)
    for (let c = 0; c < lvl.data.width; c++)
      if (lvl.tiles[r][c] === 9) { ex = { r, c }; break; }
  if (!ex) return { ok: false, reason: 'no exit tile' };
  const p = g.player;
  p.hasExitKey = false;
  // place player so its center-bottom (x+w/2, y+h — what the exit-check probes)
  // lands INSIDE the EXIT tile's pixel range [r*T, r*T+T).
  p.x = ex.c * T + T / 2 - p.w / 2;
  p.y = ex.r * T + (T - 1) - p.h;
  const isExit = lvl.isExit(p.x + p.w / 2, p.y + p.h);
  g._tickPlayHandleStageClear();         // LOCKED → must NOT schedule a clear
  const clearedWhileLocked = !!g._clearScheduled;
  lvl._exitLocked = !!(lvl.data?.exitKey && !p.hasExitKey);
  const lockedBadge = !!lvl._exitLocked;
  return { ok: true, scene: g.scene, isExit, clearedWhileLocked, lockedBadge, exTile: ex };
});
check('exit-check probe is on the EXIT tile in PLAY scene', gate.ok && gate.scene === 'play' && gate.isExit === true, JSON.stringify(gate));
check('keyed EXIT does NOT clear the stage while locked', gate.ok && gate.clearedWhileLocked === false, JSON.stringify(gate));
check('level reports the EXIT as locked (badge state)', gate.ok && gate.lockedBadge === true);

// Now grab the key and confirm the SAME exit clears + the badge drops.
const unlocked = await page.evaluate(() => {
  const g = window.__game;
  const lvl = g.level;
  const p = g.player;
  p.pickup('EXITKEY');
  lvl._exitLocked = !!(lvl.data?.exitKey && !p.hasExitKey);
  const badgeAfterKey = !!lvl._exitLocked;            // should be false now
  g._clearScheduled = false;
  g._tickPlayHandleStageClear();                       // player still on EXIT tile
  const clearedWithKey = !!g._clearScheduled;          // should clear now
  return { hasKey: !!p.hasExitKey, badgeAfterKey, clearedWithKey };
});
check('grabbing the key clears the locked badge', unlocked.hasKey === true && unlocked.badgeAfterKey === false);
check('unlocked EXIT clears the stage once keyed', unlocked.clearedWithKey === true, JSON.stringify(unlocked));

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R655 PASS' : ('R655 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);

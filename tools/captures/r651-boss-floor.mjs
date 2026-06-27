// R651: floor-aware ground-boss spawn. The legacy boss-spawn Y hardcoded
// `level.height - 32`, assuming every arena floor was flush with the bottom of
// the level. THE CLOUD (stage 13, THE ALGORITHM) carves a bottom-row PIT under
// its arena (level.js makeStage8), so the final boss anchored 80px DOWN inside
// the void, floating below the visible floor — the bug the user reported. The
// fix seats the boss feet on the ACTUAL floor SURFACE at its x (game.js
// _bossFloorY: bottom-up scan that skips the pit, then walks the floor slab to
// its top edge). Teeth: fails if stage 13's boss spawns in the pit again (feet
// well below the floor surface), if the boss column has no floor above its feet,
// or if a flat boss stage's spawn Y drifts from the legacy value (regression).
// @probe-timeout 60000
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(300);
await page.focus('#screen');
async function tap(key) { await page.keyboard.down(key); await page.waitForTimeout(50); await page.keyboard.up(key); }

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; };

async function gotoPlay(stage) {
  await page.evaluate((s) => { window.__game._startStage(s); }, stage);
  await page.waitForTimeout(400);
  for (let i = 0; i < 45; i++) {
    const s = await page.evaluate(() => window.__game.scene);
    if (s === 'play') return true;
    await tap('x'); await page.waitForTimeout(180);
  }
  return false;
}

// --- Unit-level: _bossFloorY must return the floor SURFACE, not the pit, not a
// ceiling, not buried inside the slab. Probe it directly at the boss anchor x on
// every platformer boss stage. This is deterministic (no spawn/intro timing). ---
async function floorProbe(stage) {
  return page.evaluate(() => {
    const g = window.__game; const lvl = g.level; const T = 16;
    const targetW = 256 * 2.5;
    const px = lvl.data.bossTrigger.x + 4;
    const anchorBack = Math.min(px - 32, lvl.width - targetW);
    const arenaX = Math.max(0, anchorBack);
    const arenaW = Math.min(lvl.width - arenaX, targetW);
    const lairFarX = arenaX + arenaW - 64;
    const floorY = g._bossFloorY(lairFarX);
    return {
      lairFarX, floorY, legacy: lvl.height - 32, levelHeight: lvl.height,
      aboveOpen: !lvl.isSolid(lairFarX, floorY - 8),   // open air above the surface
      atSolid:   lvl.isSolid(lairFarX, floorY + 8),    // solid at the surface tile
    };
  });
}

// Flat boss stages: _bossFloorY must equal the legacy anchor (byte-identical
// behavior — the fix must not move these bosses).
for (const stage of [5, 10]) {
  await gotoPlay(stage);
  const r = await floorProbe(stage);
  check(`stage ${stage} flat floor unchanged (== legacy)`, r.floorY === r.legacy, 'floorY=' + r.floorY + ' legacy=' + r.legacy);
  check(`stage ${stage} surface is a real floor (open above, solid at)`, r.aboveOpen && r.atSolid, 'above=' + r.aboveOpen + ' at=' + r.atSolid);
}

// THE CLOUD (stage 13): the pit case. Surface must be WELL ABOVE the legacy
// level-bottom anchor (the bug spawned the boss ~80px below the surface).
await gotoPlay(13);
const c = await floorProbe(13);
check('stage 13 is the tiered pit case (legacy anchor below real floor)', c.legacy - c.floorY >= 48, 'floorY=' + c.floorY + ' legacy=' + c.legacy);
check('stage 13 floor surface is real (open above, solid at)', c.aboveOpen && c.atSolid, 'above=' + c.aboveOpen + ' at=' + c.atSolid);
check('stage 13 floorY is the carved-arena surface (~144)', Math.abs(c.floorY - 144) <= 16, 'floorY=' + c.floorY);

// --- Live spawn path: drive the REAL boss spawn on stage 13 and assert the
// spawned boss does NOT sit in the pit below the visible floor. ALGORITHM is a
// FLYER (movement 'flyby') so it bobs ~a few px above the surface — we assert it
// is at/above the floor surface, never the 80px-deep pit. ---
await gotoPlay(13);
// Drive the REAL spawn path deterministically: cross the trigger, then run
// _spawnBoss (builds the lair + routes to the cinematic) and _finishBossIntro
// (the actual enemies.spawnBoss call that uses _bossFloorY). Calling these
// directly avoids the flaky cinematic-skip timing while still exercising the
// exact production spawn code under test.
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = g.level.data.bossTrigger.x + 4;
  if (!g.bossSpawned) g._spawnBoss();
  g._finishBossIntro();
});
const spawned = await page.evaluate(() => window.__game.bossSpawned && !!window.__game.enemies.activeBoss());
check('stage 13 boss spawned via real path', spawned);
if (spawned) {
  // settle a few frames so a grounded boss would fall + a flyer would set anchor
  await page.waitForTimeout(400);
  const b = await page.evaluate(() => {
    const g = window.__game; const boss = g.enemies.activeBoss(); const lvl = g.level;
    const feetY = boss.y + boss.h;
    const surfaceY = g._bossFloorY(boss.x + boss.w / 2);
    return {
      kind: boss.kind, feetY: Math.round(feetY), surfaceY,
      // first solid tile below the boss center (the floor it stands over)
      hasFloorBelow: (() => {
        const T = 16; const bx = boss.x + boss.w / 2;
        for (let ty = Math.floor(feetY / T); ty < lvl.height / T + 2; ty++) {
          if (lvl.isSolid(bx, ty*T + 1)) return true;
        }
        return false;
      })(),
      pitFeet: lvl.height - 32 + boss.h,   // where the OLD bug would have put feet-ish
    };
  });
  // The boss must be at/above the floor surface (flyer bob tolerance 24px),
  // and there must be a floor under it — never floating over the void pit.
  check('stage 13 boss feet at/above floor surface (not in the pit)', b.feetY <= b.surfaceY + 24, 'feetY=' + b.feetY + ' surfaceY=' + b.surfaceY);
  check('stage 13 boss is NOT in the old void pit', b.feetY < (b.surfaceY + 48), 'feetY=' + b.feetY);
  check('stage 13 boss has a floor below it', b.hasFloorBelow, 'hasFloorBelow=' + b.hasFloorBelow);
}

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R651 PASS' : ('R651 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);

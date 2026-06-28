// R652: AUTO-LOWER LIFT into the Algorithm arena (stage 13, THE CLOUD). The
// player climbs the antechamber pyramid then steps onto a chrome elevator car
// (col 99) that descends 5 tiles down its glowing shaft rail to the exit-ledge
// level over the arena, carrying the rider. Replaces the old unmarked one-way
// platform drop — addresses "descents are just a glowing spot, no visible lift".
//
// Teeth: fails if the lift is missing from stage 13, if it descends WITHOUT a
// rider (idle must hold until boarded), if boarding does NOT arm it, if the car
// fails to reach the bottom, if the rider is NOT carried down with the car (the
// whole point — a rider must end on the deck at the bottom, never fall through
// or lag above), if the moving car's band isn't solid at its LIVE position, or
// if the painted lift sprites (car + rail) didn't load.
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

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; };

// Boot stage 13 and reach PLAY. Disarm the boss + mini-boss triggers first so
// the cinematic doesn't hijack the scene when we teleport the player into the
// arena approach for the test.
await page.evaluate(() => { window.__game._startStage(13); });
await page.waitForTimeout(500);
await page.evaluate(() => {
  const g = window.__game;
  if (g.level.data.bossTrigger) g.level.data.bossTrigger.x = 9999999;
  g.level.data.miniBossTrigger = 9999999;
});
for (let i = 0; i < 45; i++) {
  const s = await page.evaluate(() => window.__game.scene);
  if (s === 'play') break;
  await page.keyboard.press('x'); await page.waitForTimeout(160);
}
check('reached PLAY on stage 13', (await page.evaluate(() => window.__game.scene)) === 'play');

// --- Lift exists with the expected shaft span. ---
const meta = await page.evaluate(() => {
  const g = window.__game; const lifts = g.level._lifts || [];
  const L = lifts[0];
  return {
    count: lifts.length,
    col: L && L.col, topY: L && L.topY, bottomY: L && L.bottomY,
    y: L && L.y, state: L && L.state,
    span: L ? (L.bottomY - L.topY) : 0,
  };
});
check('stage 13 has a lift', meta.count >= 1, 'count=' + meta.count);
check('lift starts parked at shaft top (idle)', meta.state === 'idle' && meta.y === meta.topY, 'state=' + meta.state + ' y=' + meta.y);
check('lift shaft is a real multi-tile descent (>= 4 tiles)', meta.span >= 64, 'span=' + meta.span);

// --- Painted sprites loaded (no procedural fallback expected). ---
const art = await page.evaluate(async () => {
  const { sprites } = await import('/src/sprites.js');
  return { car: sprites.has('tile_lift'), rail: sprites.has('tile_lift_rail') };
});
check('painted lift car sprite loaded', art.car);
check('painted shaft rail sprite loaded', art.rail);

// --- Idle hold: with NO rider on it, the lift must NOT move. Let several
// frames pass and assert it stayed parked. ---
await page.waitForTimeout(700);
const idle = await page.evaluate(() => { const L = window.__game.level._lifts[0]; return { y: L.y, state: L.state, topY: L.topY }; });
check('lift holds idle with no rider (does not auto-drop)', idle.state === 'idle' && idle.y === idle.topY, 'state=' + idle.state + ' y=' + idle.y);

// --- Board it: place the player on the deck. It must arm and the moving car
// band must read SOLID at its LIVE y (so the rider stands on the car, not the
// parked grid tile). ---
const boarded = await page.evaluate(() => {
  const g = window.__game; const T = 16; const L = g.level._lifts[0];
  g.player.x = L.col * T + 2;
  g.player.y = L.topY - g.player.h;
  g.player.vy = 0; g.player.onGround = true;
  // solid-band check at the car's current top edge
  const solidAtCar = g.level.isSolid(L.col * T + 4, L.y + 1);
  // and NOT solid one tile BELOW the car (open shaft) so it's a band, not a wall
  const openBelow = !g.level.isSolid(L.col * T + 4, L.y + T + 8);
  return { solidAtCar, openBelow };
});
check('moving car band is solid at its live position', boarded.solidAtCar);
check('shaft below the car is open (car is a band, not a wall)', boarded.openBelow);

// --- Ride: let it descend. The car must reach bottom AND the rider must be
// carried down with it (feet end on the deck at the bottom). ---
await page.waitForTimeout(3500);
const ride = await page.evaluate(() => {
  const g = window.__game; const L = g.level._lifts[0];
  const feet = g.player.y + g.player.h;
  return {
    carY: L.y, state: L.state, bottomY: L.bottomY,
    feet,
    carriedToBottom: Math.abs(feet - L.bottomY) <= 6,
    reachedBottom: L.y >= L.bottomY - 0.5,
  };
});
check('lift descended to the bottom', ride.reachedBottom && ride.state === 'bottom', 'y=' + ride.carY + ' state=' + ride.state);
check('rider was CARRIED to the bottom (not left above / fallen through)', ride.carriedToBottom, 'feet=' + ride.feet + ' bottomY=' + ride.bottomY);

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R652 PASS' : ('R652 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);

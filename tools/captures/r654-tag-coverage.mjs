// R654: SECRET-COLLECTABLE COVERAGE. The CLIPPY_TAG collectible system (R223)
// — a painted chrome paperclip dog-tag, run-persistent count, FULL SET
// achievement, HUD readout — was already shipped and seeded across most
// campaign platformer stages, but TWO campaign stages had ZERO: the secret
// RECYCLE BIN (game-stage 14 / makeStage9) and TRAINING (15). R654 fills the
// RECYCLE BIN gap with a hidden tag on its ceiling-crawl grapple shelf.
//
// TRAINING (15) is DELIBERATELY exempt: it's an invincible, menu-launched
// tutorial (not part of campaign progression), so a completionist tag there
// would muddy the FULL SET count rather than reward replay.
//
// Teeth: fails if ANY required campaign platformer stage has no CLIPPY_TAG in
// its spawn data, if the RECYCLE BIN tag specifically went missing, if the
// painted tag sprite stopped loading, or if the pickup type stopped being a
// counted collectible (player.tagsFound increments on CLIPPY_TAG pickup).
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

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; };

// Required-coverage campaign platformer stages (TRAINING=15 is intentionally
// excluded — it's a menu-launched invincible tutorial, not a campaign stage).
const REQUIRED = [1, 2, 3, 4, 5, 8, 11, 13, 14, 17];

const res = await page.evaluate((stages) => {
  const g = window.__game;
  const out = {};
  for (const s of stages) {
    g._startStage(s);
    const d = g.level && g.level.data;
    if (!d) { out[s] = { routed: true, count: 0 }; continue; }
    let count = 0;
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (!Array.isArray(v)) continue;
      for (const item of v) {
        if (item && (item.drop === 'CLIPPY_TAG' || item.type === 'CLIPPY_TAG')) count++;
      }
    }
    out[s] = { routed: false, count };
  }
  return out;
}, REQUIRED);

// Every required stage must be a real platformer level (not routed) AND carry
// at least one collectible.
const routed = REQUIRED.filter(s => res[s].routed);
const zero = REQUIRED.filter(s => !res[s].routed && res[s].count < 1);
check('all required stages are real platformer levels', routed.length === 0, 'routed=' + JSON.stringify(routed));
check('every required campaign stage has >=1 CLIPPY_TAG', zero.length === 0, 'gaps=' + JSON.stringify(zero));

// The RECYCLE BIN (14) fix specifically — guard against a silent revert.
check('RECYCLE BIN (stage 14) has a hidden CLIPPY_TAG', res[14] && res[14].count >= 1, 'count=' + (res[14] && res[14].count));

// The painted tag sprite must be loaded (collectibles are NOT procedural).
const art = await page.evaluate(async () => {
  const { sprites } = await import('/src/sprites.js');
  // CLIPPY_TAG reuses the painted chrome paperclip icon (pickup_1up).
  return { has: sprites.has('pickup_1up') };
});
check('painted collectible sprite loaded (pickup_1up)', art.has);

// The pickup type is a COUNTED collectible: collecting one increments
// player.tagsFound (the FULL SET driver), not just score.
const counts = await page.evaluate(() => {
  const g = window.__game;
  g._startStage(14);
  const p = g.player;
  if (!p) return { ok: false, reason: 'no player' };
  const before = p.tagsFound || 0;
  p.pickup('CLIPPY_TAG');
  const after = p.tagsFound || 0;
  return { ok: after === before + 1, before, after };
});
check('CLIPPY_TAG pickup increments the run tag count', counts.ok, 'before=' + counts.before + ' after=' + counts.after);

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R654 PASS' : ('R654 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);

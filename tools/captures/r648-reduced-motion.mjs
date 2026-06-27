// R648: REDUCED MOTION accessibility option — when on, suppresses screen
// shake (camera.shakeScale forced to 0), slow-motion/freeze-frames
// (triggerSlowMo vetoed), and the combo vignette PULSE. Teeth: fails if the
// option isn't wired into the camera each frame (shake would still fire), if
// triggerSlowMo ignores it, or if the OPTIONS toggle isn't reachable.
// Also guards the previously-DEAD shakeScale option: default-state shake must
// actually scale by it (non-zero) so the chokepoint is proven live.
// @probe-timeout 45000
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

// Boot to PLAY: title/ready on x; story supports P = SKIP-ALL.
for (let i = 0; i < 60; i++) {
  const s = await page.evaluate(() => window.__game.scene);
  if (s === 'play') break;
  if (s === 'story') { await tap('p'); await page.waitForTimeout(500); continue; }
  await tap('x'); await page.waitForTimeout(350);
}
const boot = await page.evaluate(() => ({ scene: window.__game.scene }));
check('reached PLAY', boot.scene === 'play', 'scene=' + boot.scene);

// --- DEFAULT STATE: shake should be live (proves the dead shakeScale fixed) ---
const def = await page.evaluate(() => {
  const g = window.__game;
  g.camera.shakeIntensity = 0;          // clear any residual
  const scaleBefore = g.camera.shakeScale;
  g.camera.shake(40);
  const afterShake = g.camera.shakeIntensity;
  g.triggerSlowMo(30);
  const slow = g.slowMoFrames;
  g.slowMoFrames = 0;                    // restore
  return { scaleBefore, afterShake, slow };
});
check('default shakeScale > 0 (option is live)', def.scaleBefore > 0, 'scale=' + def.scaleBefore);
check('default shake produces intensity', def.afterShake > 0, 'intensity=' + def.afterShake);
check('default slow-mo fires', def.slow > 0, 'slowMoFrames=' + def.slow);

// --- Toggle REDUCED MOTION on via the real OPTIONS menu ---
await tap('p'); await page.waitForTimeout(400); // PAUSE
const paused = await page.evaluate(() => window.__game.scene);
check('entered PAUSE', paused === 'pause', 'scene=' + paused);

// PAUSE_OPTIONS: RESUME=0, RESTART STAGE=1, OPTIONS=2.
await page.evaluate(() => { window.__game.pauseIndex = 2; });
await tap('x'); await page.waitForTimeout(400);
const inOpts = await page.evaluate(() => window.__game.scene);
check('entered OPTIONS', inOpts === 'options', 'scene=' + inOpts);

// Jump the cursor to REDUCED MOTION and toggle it ON with Right.
await page.evaluate(() => {
  const items = ['MASTER VOLUME','MUSIC VOLUME','SFX VOLUME','SCANLINES','CRT CURVE','SHAKE INTENSITY','REDUCED MOTION','SHOW READY','SHOW GHOST','BACK'];
  window.__game.optionsIndex = items.indexOf('REDUCED MOTION');
});
const idxOk = await page.evaluate(() => window.__game.optionsIndex);
check('cursor on REDUCED MOTION (idx 6)', idxOk === 6, 'idx=' + idxOk);
await tap('ArrowRight'); await page.waitForTimeout(200);

// Back out of OPTIONS, resume to play so tick() re-runs the camera wiring.
await tap('p'); await page.waitForTimeout(300); // OPTIONS -> PAUSE
await page.evaluate(() => { window.__game.pauseIndex = 0; }); // RESUME
await tap('x'); await page.waitForTimeout(500);
const resumed = await page.evaluate(() => window.__game.scene);
check('resumed to PLAY', resumed === 'play', 'scene=' + resumed);
// Let a few ticks run so tick() pushes the new shakeScale into the camera.
await page.waitForTimeout(300);

// --- REDUCED MOTION ON: shake + slow-mo must be suppressed ---
const rm = await page.evaluate(() => {
  const g = window.__game;
  g.camera.shakeIntensity = 0;
  const scale = g.camera.shakeScale;
  g.camera.shake(40);
  const afterShake = g.camera.shakeIntensity;
  g.triggerSlowMo(30);
  const slow = g.slowMoFrames;
  return { scale, afterShake, slow };
});
check('reduced-motion forces shakeScale to 0', rm.scale === 0, 'scale=' + rm.scale);
check('reduced-motion suppresses shake', rm.afterShake === 0, 'intensity=' + rm.afterShake);
check('reduced-motion vetoes slow-mo', rm.slow === 0, 'slowMoFrames=' + rm.slow);

check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R648 PASS' : ('R648 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);

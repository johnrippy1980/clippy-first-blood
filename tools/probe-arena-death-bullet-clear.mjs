// Regression probe for the stale-index crash in the arena bullet loops:
// a lethal player hit mid-loop calls _onPlayerDeath, which resets
// this.enemyBullets = []. The backwards index then read enemyBullets[i] ===
// undefined and crashed on `b.gravity`. doom_engine guards this (R533); this
// probe proves fps_arena + beatem_up now do too.
//
// We don't fully boot the modes (they need a Game host); instead we invoke the
// real tick method on a minimally-stubbed instance with a multi-bullet array
// and a player whose hp drops to 0 on the first hit, so _onPlayerDeath fires
// while later indices still need processing.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', e.message));
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (base) => {
  const out = [];

  // Build a bullet that sits exactly on the player so the hit-test fires.
  const onPlayerBullet = (px, py, pw, ph) => ({
    x: px + pw / 2, y: py + ph / 2, vx: 0, vy: 0, gravity: 0,
    life: 100, damage: 99, isChair: false, isFloppy: false,
  });
  // A second bullet that is NOT on the player (so it would be processed on the
  // next iteration after the array was cleared — the crash trigger).
  const offBullet = () => ({
    x: -999, y: -999, vx: 0, vy: 0, gravity: 0.1, life: 100, damage: 1,
  });

  async function probeMode(modUrl, className, tickName) {
    try {
      const mod = await import(modUrl);
      const Cls = mod[className] || mod.default;
      if (!Cls) return [className, 'SKIP (no export; keys=' + Object.keys(mod).join(',') + ')'];
      // Instantiate without running the real constructor (it needs a Game host).
      const inst = Object.create(Cls.prototype);
      const p = { x: 100, y: 100, w: 16, h: 24, hp: 1, maxHp: 5, lives: 0,
                  iframes: 0, rageFrames: 0, rageUsedThisStage: true, kills: 0, score: 0 };
      inst.player = p;
      inst._whizzCooldown = 0;
      inst.screenShake = 0;
      // Order matters: index 0 = off-screen (processed LAST in backwards loop),
      // higher index = on-player (processed FIRST -> triggers death+clear).
      inst.enemyBullets = [offBullet(), onPlayerBullet(p.x, p.y, p.w, p.h)];
      // Stub the scene transition so _onPlayerDeath's gameOver path is inert.
      inst.game = { _fadeTo() {}, };
      inst[tickName]();
      return [className + '.' + tickName, 'OK (no throw; bullets now ' + inst.enemyBullets.length + ')'];
    } catch (e) {
      return [className + '.' + tickName, 'THREW: ' + e.message];
    }
  }

  out.push(await probeMode(base + '/src/fps_arena.js', 'FpsArena', '_tickEnemyBullets'));
  out.push(await probeMode(base + '/src/beatem_up.js', 'BeatEmUp', '_tickEnemyBullets'));
  return out;
}, BASE);

console.log(JSON.stringify(result, null, 2));
await browser.close();

const bad = result.filter(([, v]) => v.startsWith('THREW'));
if (bad.length) { console.error('REGRESSION PROBE FAILED'); process.exit(1); }
console.log('REGRESSION PROBE PASSED (or cleanly skipped)');

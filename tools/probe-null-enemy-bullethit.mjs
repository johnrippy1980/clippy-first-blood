// Regression probe for the mine/mortar-intercept crash: onBulletHit(b, null,
// false) used to throw "Cannot read properties of null (reading 'maxHp')".
// Boots the real Player class in a browser and calls onBulletHit with a null
// enemy across the relevant bullet shapes (plain, banana, piercing), asserting
// no throw and that bullet cleanup still happens.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', e.message));

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (base) => {
  const out = [];
  try {
    const mod = await import(base + '/src/player.js');
    const Player = mod.Player || mod.default;
    if (!Player) return { fatal: 'Player export not found; keys=' + Object.keys(mod).join(',') };
    const p = new Player(100, 100);

    const mkBullet = (over = {}) => ({
      x: 120, y: 120, weapon: 'PISTOL', color: '#fff', damage: 2,
      piercing: false, stuck: false, banana: false, hits: new Set(), ...over,
    });

    // 1) plain bullet, null enemy (mine/mortar intercept) — the crash case
    const b1 = mkBullet();
    p.bullets = [b1];
    p.onBulletHit(b1, null, false);
    out.push(['plain+null', p.bullets.includes(b1) ? 'FAIL (bullet not spliced)' : 'OK (no throw, bullet removed)']);

    // 2) banana bullet, null enemy — must not try to stick to a null target
    const b2 = mkBullet({ banana: true });
    p.bullets = [b2];
    p.onBulletHit(b2, null, false);
    out.push(['banana+null', b2.stuck ? 'FAIL (stuck to null)' : 'OK (did not stick)']);

    // 3) piercing bullet, null enemy — should survive (not spliced on 1 hit)
    const b3 = mkBullet({ piercing: true });
    p.bullets = [b3];
    p.onBulletHit(b3, null, false);
    out.push(['piercing+null', p.bullets.includes(b3) ? 'OK (pierce survived)' : 'FAIL (spliced early)']);

    return { ok: true, out };
  } catch (e) {
    return { threw: e.message, out };
  }
}, BASE);

console.log(JSON.stringify(result, null, 2));
await browser.close();

if (result.threw || result.fatal || (result.out || []).some(([, v]) => v.startsWith('FAIL'))) {
  console.error('REGRESSION PROBE FAILED');
  process.exit(1);
}
console.log('REGRESSION PROBE PASSED');

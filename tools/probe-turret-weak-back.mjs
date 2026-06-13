// R627 smoke: the sentry turret's directional blind-side weak point. The
// turret is armored facing-forward but exposed on its back; a shot that lands
// on the side it is NOT facing (came from behind) deals weakMult damage. This
// rewards the dash-past play the swivel-lag (R624) was built around. Drives
// the REAL Enemy.hurt with opts.fromDir (the bullet's travel direction).
// Verifies:
//  (1) blind-side hit: bullet traveling the SAME way the turret faces (from
//      behind) deals weakMult x base damage.
//  (2) front hit: bullet traveling OPPOSITE the facing (from the front) deals
//      base damage only.
//  (3) the weak point is turret-specific: a folder grunt takes base damage
//      from a same-direction shot (no weakBack flag).
//  (4) facing==0 guard: no weak-point bonus when the turret has no facing.
// Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

const out = await page.evaluate(async () => {
    const g = window.__game;
    if (!g) return { err: 'no game' };
    g._startStage(1);
    await new Promise(res => setTimeout(res, 350));
    const r = {};

    const spawn = (type) => {
        g.enemies.spawn(120, 160, type);
        const e = g.enemies.enemies[g.enemies.enemies.length - 1];
        e._grace = 0; e.activated = true;
        return e;
    };
    // Measure hp lost from a single hurt() call, isolating dmg from death/knock.
    const dmgTaken = (e, baseDmg, fromDir) => {
        const before = e.hp;
        e.hurt(baseDmg, fromDir, { fromDir });
        return before - e.hp;
    };

    // --- (1) blind-side hit: fromDir === facing ---
    const t1 = spawn('turret');
    t1.facing = 1;                 // turret looks right
    t1.hp = 999;                   // keep it alive so we read raw dmg
    r.weakMult = t1.tpl.weakMult;  // 3
    r.blindDmg = dmgTaken(t1, 1, 1);   // fromDir +1 == facing +1 -> weak -> 3

    // --- (2) front hit: fromDir === -facing ---
    const t2 = spawn('turret');
    t2.facing = 1;                 // looks right
    t2.hp = 999;
    r.frontDmg = dmgTaken(t2, 1, -1);  // fromDir -1 (from the front) -> base 1

    // also check the mirror: facing left, hit from the right (front) = base
    const t3 = spawn('turret');
    t3.facing = -1;                // looks left
    t3.hp = 999;
    r.frontDmgMirror = dmgTaken(t3, 1, 1);  // fromDir +1 from front -> base 1
    // ...and blind from the mirror side:
    const t4 = spawn('turret');
    t4.facing = -1;
    t4.hp = 999;
    r.blindDmgMirror = dmgTaken(t4, 1, -1); // fromDir -1 == facing -1 -> weak

    // --- (3) turret-specific: folder takes base damage from a same-dir shot ---
    const f1 = spawn('folder');
    f1.facing = 1;
    f1.hp = 999;
    r.folderSameDir = dmgTaken(f1, 1, 1);   // no weakBack -> base 1

    // --- (4) facing==0 guard ---
    const t5 = spawn('turret');
    t5.facing = 0;
    t5.hp = 999;
    r.noFacingDmg = dmgTaken(t5, 1, 1);     // facing 0 -> no bonus -> base 1

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.weakMult === 3
    && out.blindDmg === 3
    && out.frontDmg === 1
    && out.frontDmgMirror === 1
    && out.blindDmgMirror === 3
    && out.folderSameDir === 1
    && out.noFacingDmg === 1;
console.log(ok ? 'TURRET WEAK BACK OK' : 'TURRET WEAK BACK FAIL');
process.exit(ok ? 0 : 1);

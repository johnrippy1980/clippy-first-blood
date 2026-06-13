// R629 smoke: the sentry turret's post-burst overheat window. After the turret
// fires a full aimed burst its barrel goes hot for overheatTime frames: during
// that window it CANNOT fire (cools down) AND it takes overheatMult damage from
// ANY direction — including the armored front that normally only takes base.
// This is the "punish the burst" beat that pairs with the swivel-lag (R624) and
// blind-side weak point (R627). Drives the REAL Enemy.update / _turret and the
// REAL Enemy.hurt. Verifies:
//  (1) firing a full burst leaves _overheat == overheatTime.
//  (2) while overheated the turret fires NO new bullets (barrel is cooling).
//  (3) a FRONT hit (fromDir opposite facing) during overheat deals overheatMult
//      x base — i.e. the normally-safe front is exposed while hot.
//  (4) _overheat ticks down and, once it expires, the turret can fire again.
//  (5) blind-side + overheat do NOT stack: a back hit while hot takes the MAX
//      of the two multipliers, not their product.
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
    const { GAME } = await import('/src/constants.js');
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
    // A fake player sitting to the turret's RIGHT and in range, never hidden.
    const mkPlayer = (px) => ({
        x: px, y: 160, w: 12, h: 14, vx: 0, vy: 0,
        waterHidden: false, grassHidden: false, state: -1,
    });
    // Count enemy bullets so we can detect "did the turret fire?".
    // EnemyManager.bullets aliases the module's globalEnemyBullets array.
    const bulletCount = () => g.enemies.bullets ? g.enemies.bullets.length : -1;

    const t1 = spawn('turret');
    t1.facing = 1;             // already looking right at the player (no swivel lag)
    t1.hp = 9999;
    r.tpl = {
        overheatTime: t1.tpl.overheatTime,   // 50
        overheatMult: t1.tpl.overheatMult,   // 2
        weakMult: t1.tpl.weakMult,           // 3
        burstCount: t1.tpl.burstCount,       // 2
    };

    const player = mkPlayer(t1.x + 60);   // 60px to the right, well within range

    // --- (1) drive frames until a full burst fires and overheat is set ---
    let firedOverheat = false;
    let framesToOverheat = -1;
    for (let f = 0; f < 600 && !firedOverheat; f++) {
        t1.update(g.level, player);
        if ((t1._overheat || 0) > 0) { firedOverheat = true; framesToOverheat = f; }
    }
    r.overheatSet = firedOverheat;
    r.overheatValueAtTrigger = t1._overheat;          // == overheatTime (just set)
    r.burstLeftAtOverheat = t1._burstLeft || 0;       // 0 — burst is done

    // --- (2) while hot, the turret fires NO new bullets ---
    const beforeHotBullets = bulletCount();
    let firedWhileHot = false;
    // tick a chunk of the overheat window (but not past it)
    const hotTicks = Math.max(1, (t1.tpl.overheatTime || 50) - 5);
    for (let f = 0; f < hotTicks; f++) {
        const pre = bulletCount();
        t1.update(g.level, player);
        if (bulletCount() > pre) firedWhileHot = true;
    }
    r.firedWhileHot = firedWhileHot;                  // false
    r.stillHot = (t1._overheat || 0) > 0;             // true (didn't expire yet)

    // --- (3) FRONT hit during overheat takes overheatMult ---
    // facing is +1 (right); a front hit comes from the right => fromDir === -1.
    // Normally (R627) a front hit is base damage; while hot it must be 2x.
    const dmgTaken = (e, baseDmg, fromDir) => {
        const before = e.hp;
        e.hurt(baseDmg, fromDir, { fromDir });
        return before - e.hp;
    };
    r.frontDmgHot = dmgTaken(t1, 1, -1);              // overheatMult (2), not base 1

    // --- (5) BACK hit during overheat = MAX(weakMult, overheatMult), not product ---
    // back hit: fromDir === facing (+1). weakMult 3 > overheatMult 2 => 3, not 6.
    r.backDmgHot = dmgTaken(t1, 1, 1);                // max(3,2) = 3

    // --- (4) overheat expires, turret can fire again ---
    // Burn down whatever overheat remains.
    let guard = 0;
    while ((t1._overheat || 0) > 0 && guard < 200) { t1.update(g.level, player); guard++; }
    r.overheatExpired = (t1._overheat || 0) === 0;

    // Now drive more frames; it should charge + burst again (fire >=1 bullet).
    const beforeRefire = bulletCount();
    let refired = false;
    for (let f = 0; f < 400 && !refired; f++) {
        t1.update(g.level, player);
        if (bulletCount() > beforeRefire) refired = true;
    }
    r.refired = refired;

    // --- control: a FRONT hit on a COLD turret is still just base damage ---
    const t2 = spawn('turret');
    t2.facing = 1; t2.hp = 9999; t2._overheat = 0;
    r.frontDmgCold = (() => {
        const before = t2.hp;
        t2.hurt(1, -1, { fromDir: -1 });            // front, cold -> base 1
        return before - t2.hp;
    })();

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.tpl.overheatTime === 50
    && out.tpl.overheatMult === 2
    && out.overheatSet === true
    && out.overheatValueAtTrigger === 50
    && out.burstLeftAtOverheat === 0
    && out.firedWhileHot === false
    && out.stillHot === true
    && out.frontDmgHot === 2
    && out.backDmgHot === 3
    && out.overheatExpired === true
    && out.refired === true
    && out.frontDmgCold === 1;
console.log(ok ? 'TURRET OVERHEAT OK' : 'TURRET OVERHEAT FAIL');
process.exit(ok ? 0 : 1);

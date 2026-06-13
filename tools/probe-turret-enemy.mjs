// R624 smoke: the sentry "turret" enemy archetype. A stationary, zone-denial
// gun emplacement. Drives the REAL Enemy.update on the live level against a
// synthetic player. Verifies:
//  (1) registration: spawning 'turret' yields an enemy with behavior 'turret'
//      and the turret template config (no throw on update).
//  (2) re-aim swivel lag: with the turret facing one way and the player on the
//      OPPOSITE side, facing must NOT flip until reaimLag frames have elapsed
//      (the "blind side" window that rewards dashing past it).
//  (3) aimed burst: when facing the player in range, after the charge it emits
//      a burstCount-shot burst of aimed bullets into globalEnemyBullets, each
//      moving toward the player at ~projectileSpeed.
//  (4) fairness gate: a hidden player (grassHidden) draws ZERO fire.
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
    const { globalEnemyBullets } = await import('/src/enemies.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    g._startStage(1);
    await new Promise(r => setTimeout(r, 350));
    const level = g.level;
    if (!level) return { err: 'no level' };
    const r = {};

    const mkTurret = (x, y) => {
        g.enemies.spawn(x, y, 'turret');
        const e = g.enemies.enemies[g.enemies.enemies.length - 1];
        e._grace = 0; e.activated = true;
        return e;
    };
    // Synthetic player — only x/y/w/h + hidden flags/state are read by _turret.
    const mkPlayer = (x, y) => ({ x, y, w: 12, h: 16, vx: 0, vy: 0 });

    // --- (1) registration ---
    const e1 = mkTurret(200, 160);
    r.behavior = e1.behavior;            // 'turret'
    r.speed = e1.tpl.speed;              // 0 (never moves)
    r.reaimLag = e1.tpl.reaimLag;        // 36
    const p1 = mkPlayer(600, 160);       // far right, out of range to start
    let threw = false;
    try { e1.update(level, p1); } catch (err) { threw = true; r.throwMsg = String(err); }
    r.updateOk = !threw;

    // --- (2) re-aim swivel lag ---
    // Force the turret to currently face LEFT, then put the player on the RIGHT
    // (in range). Facing must hold for reaimLag-1 frames, then flip on frame
    // reaimLag. We keep distance > activateRange briefly is NOT needed for
    // facing logic (swivel runs regardless of range), but keep player in range
    // so nothing else interferes.
    const e2 = mkTurret(120, 160);
    e2.facing = -1;                      // facing left
    e2._reaimTimer = 0;
    const p2 = mkPlayer(120 + 40, 160);  // 40px to the RIGHT -> wantFacing = +1
    const lag = e2.tpl.reaimLag;
    let flippedEarly = false, flippedOnTime = false;
    for (let i = 1; i <= lag; i++) {
        e2.update(level, p2);
        if (i < lag && e2.facing === 1) flippedEarly = true;     // must NOT flip yet
        if (i === lag && e2.facing === 1) flippedOnTime = true;  // flips exactly here
    }
    r.swivelHeld = !flippedEarly;        // true — held through the lag window
    r.swivelFlipped = flippedOnTime;     // true — flipped on the reaimLag frame

    // --- (3) aimed burst ---
    // Fresh turret already facing the player and in range. Drive until it
    // fires. Count how many bullets it adds and verify they aim at the player.
    const before = globalEnemyBullets.length;
    const e3 = mkTurret(150, 160);
    const p3 = mkPlayer(150 + 60, 130);  // up-and-right of the turret, in range
    e3.facing = 1;                        // already aimed at player's side
    e3._reaimTimer = 0;
    // shootInterval=80; timer increments each update. Run enough frames to
    // cover: reach a timer multiple of 80, beamCharge (26) + burst window.
    let fired = 0;
    let aimedTowardPlayer = true;
    for (let i = 0; i < 200; i++) {
        const n0 = globalEnemyBullets.length;
        e3.update(level, p3);
        const n1 = globalEnemyBullets.length;
        for (let k = n0; k < n1; k++) {
            const b = globalEnemyBullets[k];
            fired++;
            // aimed: bullet vx sign should point toward the player (to the right)
            // and vy sign upward (player is above). Allow small tolerance.
            if (!(b.vx > 0 && b.vy < 0.5)) aimedTowardPlayer = false;
            // magnitude ~ projectileSpeed
            const spd = Math.hypot(b.vx, b.vy);
            if (Math.abs(spd - e3.tpl.projectileSpeed) > 0.3) aimedTowardPlayer = false;
        }
        if (fired >= e3.tpl.burstCount) break;
    }
    r.burstCount = fired;                 // should reach burstCount (2)
    r.burstAimed = aimedTowardPlayer;     // true
    r.burstNonZero = (globalEnemyBullets.length > before);

    // --- (4) fairness gate: hidden player draws no fire ---
    const e4 = mkTurret(150, 160);
    const p4 = mkPlayer(150 + 60, 130);
    p4.grassHidden = true;                // hidden -> turret must hold fire
    e4.facing = 1; e4._reaimTimer = 0;
    const gBefore = globalEnemyBullets.length;
    for (let i = 0; i < 200; i++) e4.update(level, p4);
    r.hiddenFired = globalEnemyBullets.length - gBefore;   // 0

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.behavior === 'turret'
    && out.speed === 0
    && out.reaimLag === 36
    && out.updateOk === true
    && out.swivelHeld === true
    && out.swivelFlipped === true
    && out.burstCount >= 2
    && out.burstAimed === true
    && out.burstNonZero === true
    && out.hiddenFired === 0;
console.log(ok ? 'TURRET ENEMY OK' : 'TURRET ENEMY FAIL');
process.exit(ok ? 0 : 1);

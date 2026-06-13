// R630 smoke: the mortar emplacement enemy. A stationary lobber that arcs a
// shell toward the player's PREDICTED landing column, telegraphed by a ground
// reticle the whole flight, then bursts into a low shrapnel splash on impact.
// Complements the turret (direct line) by punishing standing still (area).
// Drives the REAL Enemy.update/_mortar/_lobShell and the REAL Bullet ballistics
// + _detonateMortar. Verifies:
//  (1) mortar TYPES entry registered with the expected ballistic config.
//  (2) driving update() arms a charge (_mCharge) then launches exactly one
//      _mortar shell into the global enemy-bullet array.
//  (3) the shell is a real arc: it carries _gravity, a reticle (_reticleX/Y),
//      and its vy grows as it falls.
//  (4) the reticle LEADS the player: a player moving right puts _reticleX to
//      the RIGHT of the player's current centre (predictive aim).
//  (5) on reaching its reticle Y the shell detonates — it dies and seeds a ring
//      of short-lived splash sub-bullets (_splashChild) into the bullet array.
//  (6) splash children are normal damaging bullets (dmg > 0) and at least one
//      lands near the reticle (the AoE actually covers the impact point).
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
    const level = g.level;
    const r = {};

    // Spawn a mortar on solid ground. Park it on the floor row so _lobShell's
    // ground scan finds a real floor under the player column.
    const groundY = (level.data.height - 3) * GAME.TILE;   // typical floor top
    g.enemies.spawn(40 * GAME.TILE, groundY, 'mortar');
    const m = g.enemies.enemies[g.enemies.enemies.length - 1];
    m._grace = 0; m.activated = true; m.hp = 999;
    const tpl = m.tpl;
    r.tpl = {
        behavior: tpl.behavior,            // 'mortar'
        fireInterval: tpl.fireInterval,    // 150
        charge: tpl.charge,                // 34
        leadFrames: tpl.leadFrames,        // 26
        splashShots: tpl.splashShots,      // 6
    };

    // A fake player to the mortar's right, on the ground, MOVING RIGHT so the
    // predictive reticle should lead ahead of them.
    const player = {
        x: m.x + 90, y: groundY - 14, w: 12, h: 14, vx: 1.5, vy: 0,
        waterHidden: false, grassHidden: false, state: -1,
    };
    const bullets = g.enemies.bullets;
    const countShells = () => bullets.filter(b => b._mortar).length;
    const countSplash = () => bullets.filter(b => b._splashChild).length;

    // --- (2) drive frames until a shell launches ---
    const before = bullets.length;
    let launched = false, sawCharge = false;
    for (let f = 0; f < 400 && !launched; f++) {
        m.update(level, player);
        if ((m._mCharge || 0) > 0) sawCharge = true;
        if (countShells() > 0) launched = true;
    }
    r.sawCharge = sawCharge;               // true — wind-up happened
    r.shellLaunched = launched;            // true
    r.shellCount = countShells();          // 1

    const shell = bullets.find(b => b._mortar);
    if (!shell) { r.noShell = true; return r; }

    // --- (3) it's an arc ---
    r.shellHasGravity = (shell._gravity || 0) > 0;     // true
    r.shellHasReticle = Number.isFinite(shell._reticleX) && Number.isFinite(shell._reticleY);

    // --- (4) reticle leads the moving player ---
    const playerCx = player.x + player.w / 2;
    r.reticleLeadsRight = shell._reticleX > playerCx;  // moving right -> reticle ahead

    // --- (3b) vy grows as it falls (sample two frames apart, mid-flight) ---
    // Step the shell a few frames and watch vy increase under gravity.
    const vyStart = shell.vy;
    for (let i = 0; i < 5; i++) shell.update(level);
    r.vyIncreased = shell.vy > vyStart;                 // true

    // --- (5) + (6) detonation seeds splash children ---
    const splashBefore = countSplash();
    let detonated = false;
    for (let f = 0; f < 600 && !detonated; f++) {
        shell.update(level);
        if (shell.life <= 0) detonated = true;
    }
    r.shellDetonated = detonated;                       // true (life hit 0)
    // After detonation the shell is dead; the manager would splice it. Splash
    // children were pushed into the same array.
    r.splashSeeded = countSplash() > splashBefore;      // true
    r.splashCount = countSplash();
    const splash = bullets.filter(b => b._splashChild);
    r.splashAllDamaging = splash.length > 0 && splash.every(b => (b.dmg || 0) > 0);
    // At least one splash child spawned near the reticle X (within splashR).
    r.splashNearReticle = splash.some(b =>
        Math.abs(b.x - shell._reticleX) <= (tpl.splashR + 6));

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.tpl.behavior === 'mortar'
    && out.tpl.charge === 34
    && out.tpl.splashShots === 6
    && out.sawCharge === true
    && out.shellLaunched === true
    && out.shellCount === 1
    && out.shellHasGravity === true
    && out.shellHasReticle === true
    && out.reticleLeadsRight === true
    && out.vyIncreased === true
    && out.shellDetonated === true
    && out.splashSeeded === true
    && out.splashAllDamaging === true
    && out.splashNearReticle === true;
console.log(ok ? 'MORTAR ENEMY OK' : 'MORTAR ENEMY FAIL');
process.exit(ok ? 0 : 1);

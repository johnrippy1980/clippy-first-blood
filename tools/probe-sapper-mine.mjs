// R632 smoke: the mine-layer "sapper" enemy. A low ground crawler that paces
// toward the player and periodically DROPS a proximity mine behind itself. The
// mine is an enemy-bullet (_mine) that falls to the floor, ARMS after a short
// delay, then bursts the shared shrapnel ring when the player steps inside its
// trigger radius. Complements the stationary turret/mortar — a MOBILE area
// denier seeding the floor in its wake. Drives the REAL Enemy.update/_sapper/
// _dropMine, the REAL Bullet mine settling/arming, and the REAL EnemyManager
// proximity pass + shared _spawnShrapnel. Verifies:
//  (1) sapper TYPES entry registered with the expected mine config.
//  (2) driving _sapper drops exactly one _mine into the enemy-bullet array.
//  (3) the dropped mine is a real proximity mine: stationary, carries an arm
//      timer (_mineArm) and a trigger radius (_mineTrigger), and SETTLES onto
//      the ground (vy -> 0, _mineSettled true).
//  (4) the mine ARMS — _mineArm counts down to 0 over time.
//  (5) an armed mine does NOT trip while the player is OUTSIDE the radius...
//  (6) ...and DOES detonate (seeding _splashChild shrapnel) once the player
//      steps INSIDE the radius, via the REAL manager proximity pass.
//  (7) splash children are real damaging bullets (dmg > 0).
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

    const groundY = (level.data.height - 3) * GAME.TILE;
    g.enemies.spawn(40 * GAME.TILE, groundY, 'sapper');
    const m = g.enemies.enemies[g.enemies.enemies.length - 1];
    m._grace = 0; m.activated = true; m.hp = 999;
    const tpl = m.tpl;
    r.tpl = {
        behavior: tpl.behavior,        // 'sapper'
        dropInterval: tpl.dropInterval, // 140
        mineArm: tpl.mineArm,          // 40
        mineTrigger: tpl.mineTrigger,  // 18
        splashShots: tpl.splashShots,  // 5
    };

    const bullets = g.enemies.bullets;
    const countMines = () => bullets.filter(b => b._mine).length;
    const countSplash = () => bullets.filter(b => b._splashChild).length;

    // Player parked to the sapper's right, on the ground, FAR from any mine
    // (so the drop happens but no early trip). Real player exposes onBulletHit.
    const player = {
        x: m.x + 80, y: groundY - 14, w: 12, h: 14, vx: 0, vy: 0,
        waterHidden: false, grassHidden: false, state: -1,
        bullets: [], score: 0, onBulletHit() {},
    };

    // --- (2) drive _sapper until it drops a mine ---
    let dropped = false;
    for (let f = 0; f < 400 && !dropped; f++) {
        m.update(level, player);
        if (countMines() > 0) dropped = true;
    }
    r.mineDropped = dropped;
    r.mineCount = countMines();          // 1

    const mine = bullets.find(b => b._mine);
    if (!mine) { r.noMine = true; return r; }

    // --- (3) it's a real proximity mine ---
    r.mineStationary = mine.vx === 0;
    r.mineHasArm = Number.isFinite(mine._mineArm);
    r.mineHasTrigger = (mine._mineTrigger || 0) > 0;

    // Let the mine settle onto the ground + arm fully. Bullet.update handles
    // both (gravity-settle, then arm countdown). Step plenty of frames.
    for (let i = 0; i < 80; i++) mine.update(level);
    r.mineSettled = mine._mineSettled === true && mine.vy === 0;  // (3) settled
    r.mineArmed = mine._mineArm <= 0;                              // (4) armed

    // --- (5) armed mine does NOT trip with the player far away ---
    // Run the manager pass with the player still 80px to the right.
    const splashBeforeFar = countSplash();
    g.enemies.update(level, player);
    r.noTripFar = countMines() > 0 && countSplash() === splashBeforeFar;

    // --- (6)+(7) step the player ONTO the mine -> detonates into shrapnel ---
    player.x = mine.x - player.w / 2;     // center player over the mine
    player.y = mine.y - player.h + 2;
    const splashBeforeNear = countSplash();
    const minesBeforeNear = countMines();
    g.enemies.update(level, player);
    r.mineTripped = countMines() < minesBeforeNear;          // mine consumed
    r.splashSeeded = countSplash() > splashBeforeNear;       // shrapnel spawned
    r.splashCount = countSplash() - splashBeforeNear;
    const splash = bullets.filter(b => b._splashChild);
    r.splashAllDamaging = splash.length > 0 && splash.every(b => (b.dmg || 0) > 0);

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.tpl.behavior === 'sapper'
    && out.tpl.mineArm === 40
    && out.tpl.splashShots === 5
    && out.mineDropped === true
    && out.mineCount === 1
    && out.mineStationary === true
    && out.mineHasArm === true
    && out.mineHasTrigger === true
    && out.mineSettled === true
    && out.mineArmed === true
    && out.noTripFar === true
    && out.mineTripped === true
    && out.splashSeeded === true
    && out.splashAllDamaging === true;
console.log(ok ? 'SAPPER MINE OK' : 'SAPPER MINE FAIL');
process.exit(ok ? 0 : 1);

// R633 smoke: shooting a sapper's proximity mine. R632 lets the sapper seed the
// floor with mines that detonate on player proximity; R633 lets a player bullet
// that hits a mine CLEAR it harmlessly — no shrapnel splash — the skill counter
// to walking into it. Drives the REAL EnemyManager mine passes (the shootable
// check + the proximity check, both in the manager loop) and the REAL
// _detonateMine. Verifies:
//  (1) CONTROL — an un-shot armed mine that the player steps on DOES seed
//      _splashChild shrapnel (proximity detonation still works).
//  (2) a player bullet parked on a mine, run through g.enemies.update, flips
//      mine._intercepted, removes the mine, and consumes the player bullet.
//  (3) the shot mine seeds ZERO _splashChild — the AoE is cancelled (the point
//      of shooting it).
//  (4) a shot mine can be cleared even BEFORE it arms (defuse early).
//  (5) a piercing player bullet survives clearing a mine.
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
    const bullets = g.enemies.bullets;
    const countMines = () => bullets.filter(b => b._mine).length;
    const countSplash = () => bullets.filter(b => b._splashChild).length;

    const mkPlayer = () => ({
        x: 40 * GAME.TILE + 80, y: groundY - 14, w: 12, h: 14, vx: 0, vy: 0,
        waterHidden: false, grassHidden: false, state: -1,
        bullets: [], score: 0, onBulletHit() {},
    });

    // Helper: spawn a sapper, drive it to drop one mine, settle + (optionally)
    // arm it, then strip the sapper so manager updates only exercise the mine.
    const dropMine = (player, arm) => {
        g.enemies.spawn(40 * GAME.TILE, groundY, 'sapper');
        const m = g.enemies.enemies[g.enemies.enemies.length - 1];
        m._grace = 0; m.activated = true; m.hp = 999;
        for (let f = 0; f < 400; f++) {
            m.update(level, player);
            if (countMines() > 0) break;
        }
        const mine = bullets.find(b => b._mine && !b._intercepted);
        if (mine) {
            const frames = arm ? 80 : 4;      // arm fully, or barely settle
            for (let i = 0; i < frames; i++) mine.update(level);
        }
        g.enemies.enemies.length = 0;         // isolate the mine passes
        return mine;
    };

    // ===== (1) CONTROL: stepping on an un-shot armed mine seeds shrapnel.
    {
        const player = mkPlayer();
        const mine = dropMine(player, true);
        r.controlDropped = !!mine;
        if (!mine) return r;
        r.controlArmed = mine._mineArm <= 0;
        const before = countSplash();
        player.x = mine.x - player.w / 2;     // stand on it
        player.y = mine.y - player.h + 2;
        g.enemies.update(level, player);
        r.controlSplashSeeded = countSplash() > before;   // true
        r.controlMineGone = countMines() === 0;           // true
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (2)+(3) SHOOT an armed mine -> cleared, NO splash.
    {
        const player = mkPlayer();
        const mine = dropMine(player, true);
        r.shootDropped = !!mine;
        if (!mine) return r;
        player.bullets.push({
            x: mine.x, y: mine.y, prevX: mine.x, prevY: mine.y,
            vx: 0, vy: 0, damage: 3, color: '#fff', weapon: 'MG', life: 80,
            hits: new Set(),
        });
        const splashBefore = countSplash();
        const minesBefore = countMines();
        g.enemies.update(level, player);
        r.mineInterceptedFlag = !!mine._intercepted;          // true
        r.mineRemoved = countMines() < minesBefore;           // true
        r.bulletConsumed = player.bullets.length === 0;       // true
        for (let i = 0; i < 8; i++) for (const b of bullets) b.update(level);
        r.shootNoSplash = countSplash() === splashBefore;     // true — AoE cancelled
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (4) defuse a mine BEFORE it arms.
    {
        const player = mkPlayer();
        const mine = dropMine(player, false);    // not armed
        r.earlyDropped = !!mine;
        if (!mine) return r;
        r.earlyUnarmed = mine._mineArm > 0;       // still arming
        player.bullets.push({
            x: mine.x, y: mine.y, prevX: mine.x, prevY: mine.y,
            vx: 0, vy: 0, damage: 3, color: '#fff', weapon: 'MG', life: 80,
            hits: new Set(),
        });
        const splashBefore = countSplash();
        g.enemies.update(level, player);
        r.earlyCleared = countMines() === 0;                  // defused pre-arm
        r.earlyNoSplash = countSplash() === splashBefore;     // no splash
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (5) a PIERCING bullet survives clearing a mine.
    {
        const player = mkPlayer();
        const mine = dropMine(player, true);
        r.pierceDropped = !!mine;
        if (!mine) return r;
        player.bullets.push({
            x: mine.x, y: mine.y, prevX: mine.x, prevY: mine.y,
            vx: 0, vy: 0, damage: 3, color: '#fff', weapon: 'MG', life: 80,
            piercing: true, hits: new Set(),
        });
        g.enemies.update(level, player);
        r.pierceMineGone = countMines() === 0;                // mine cleared
        r.pierceBulletSurvived = player.bullets.length === 1; // bullet NOT consumed
    }

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.controlDropped === true
    && out.controlArmed === true
    && out.controlSplashSeeded === true
    && out.controlMineGone === true
    && out.shootDropped === true
    && out.mineInterceptedFlag === true
    && out.mineRemoved === true
    && out.bulletConsumed === true
    && out.shootNoSplash === true
    && out.earlyDropped === true
    && out.earlyUnarmed === true
    && out.earlyCleared === true
    && out.earlyNoSplash === true
    && out.pierceDropped === true
    && out.pierceMineGone === true
    && out.pierceBulletSurvived === true;
console.log(ok ? 'SAPPER MINE SHOOT OK' : 'SAPPER MINE SHOOT FAIL');
process.exit(ok ? 0 : 1);

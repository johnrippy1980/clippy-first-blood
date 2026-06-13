// R636 smoke: sympathetic CHAIN detonation. When one sapper mine detonates,
// other settled mines within its chain radius "catch" the blast and pop too —
// packed clusters cascade. Drives the REAL EnemyManager mine loop, the REAL
// _chainDetonateMines sweep, and the REAL _detonateMine + _spawnShrapnel.
// Verifies:
//  (1) two ADJACENT armed mines: stepping on one chains the second — BOTH are
//      consumed in a single manager pass (not just the tripped one).
//  (2) the cascade seeds shrapnel (the AoE genuinely fires from the chain).
//  (3) CONTROL: a mine placed OUTSIDE the chain radius is NOT caught — it
//      survives while the in-radius pair both pop.
//  (4) a PUNTED mine (enemy-damaging) chaining a neighbor propagates ownership:
//      the chained mine's shrapnel is _parried (enemy-damaging), not plain.
//  (5) CONTROL: a SHOT (intercepted) mine pops harmless and does NOT chain a
//      neighbor — only real detonations cascade.
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
    const { GAME, STATE } = await import('/src/constants.js');
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
    const parriedShrapnel = () => bullets.filter(b => b._splashChild && b._parried);
    const plainShrapnel = () => bullets.filter(b => b._splashChild && !b._parried);

    const mkPlayer = (state) => ({
        x: 40 * GAME.TILE + 80, y: groundY - 14, w: 12, h: 14, vx: 0, vy: 0,
        facing: 1, waterHidden: false, grassHidden: false, state,
        bullets: [], score: 0, onBulletHit() {},
    });

    // Drop + settle + arm one mine via the REAL sapper, then strip the sapper.
    // Returns the single NEW mine (tracks the count so we grab the right one).
    const dropSettledMine = () => {
        const before = countMines();
        const probe = mkPlayer(-1);
        g.enemies.spawn(40 * GAME.TILE, groundY, 'sapper');
        const m = g.enemies.enemies[g.enemies.enemies.length - 1];
        m._grace = 0; m.activated = true; m.hp = 999;
        for (let f = 0; f < 400; f++) {
            m.update(level, probe);
            if (countMines() > before) break;
        }
        // The freshly-dropped mine is the last _mine in the array.
        const mine = bullets.filter(b => b._mine).pop();
        if (mine) for (let i = 0; i < 80; i++) mine.update(level);  // settle + arm
        g.enemies.enemies.length = 0;
        return countMines() > before ? mine : null;
    };

    // Place a freshly-settled mine at an explicit (x,y), already armed.
    const placeMineAt = (x, y) => {
        const mine = dropSettledMine();
        if (!mine) return null;
        mine.x = x; mine.y = y;
        mine._mineArm = 0; mine._mineSettled = true; mine.vx = 0; mine.vy = 0;
        return mine;
    };

    // ===== (1)+(2)+(3) trip one mine -> chains the adjacent one; far one survives.
    {
        const a = placeMineAt(40 * GAME.TILE + 200, groundY - 4);
        r.aPlaced = !!a;
        if (!a) return r;
        // Neighbor within chain radius (~28px): 16px to the right.
        const b = placeMineAt(a.x + 16, a.y);
        r.bPlaced = !!b;
        // Far mine OUTSIDE the chain radius: 80px away.
        const far = placeMineAt(a.x + 80, a.y);
        r.farPlaced = !!far;

        const minesBefore = countMines();
        r.threeMines = minesBefore === 3;
        const splashBefore = countSplash();

        // Step the player onto mine A to trip it.
        const player = mkPlayer(-1);
        player.x = a.x - player.w / 2;
        player.y = a.y - player.h + 2;
        g.enemies.update(level, player);

        r.pairChained = countMines() === 1;            // A + B both gone, far remains
        r.farSurvived = bullets.includes(far);         // far mine untouched
        r.chainSplashSeeded = countSplash() > splashBefore;  // AoE fired
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (4) a PUNTED mine chaining a neighbor propagates enemy-damaging splash.
    {
        const a = placeMineAt(40 * GAME.TILE + 200, groundY - 4);
        if (!a) { r.puntChainPlaced = false; return r; }
        r.puntChainPlaced = true;
        // Punt mine A by sliding through it.
        const slider = mkPlayer(STATE.SLIDE);
        slider.facing = 1;
        slider.x = a.x - slider.w / 2;
        slider.y = a.y - slider.h + 2;
        g.enemies.update(level, slider);
        r.aPunted = a._minePunt === true;

        // Neighbor in the chain radius the punted mine will reach when it lands.
        // Place B right under the punted arc so the wall/floor detonation chains it.
        const b = placeMineAt(a.x + 10, a.y);
        r.bChainPlaced = !!b;

        // Spawn a target enemy so the punted mine detonates on enemy contact.
        g.enemies.spawn(a.x + 4, a.y + 8, 'folder');
        const target = g.enemies.enemies[g.enemies.enemies.length - 1];
        target._grace = 0; target.activated = true;
        target.x = a.x - target.w / 2; target.y = a.y - target.h / 2;

        const idle = mkPlayer(-1); idle.x = 10; idle.y = 10;
        g.enemies.update(level, idle);

        r.puntChainBGone = !bullets.includes(b);       // neighbor caught in chain
        r.puntChainParried = parriedShrapnel().length > 0;   // enemy-damaging spray
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (5) CONTROL: a SHOT mine pops harmless and does NOT chain a neighbor.
    {
        const a = placeMineAt(40 * GAME.TILE + 200, groundY - 4);
        if (!a) { r.shotPlaced = false; return r; }
        r.shotPlaced = true;
        const b = placeMineAt(a.x + 16, a.y);   // neighbor inside chain radius
        r.shotNeighborPlaced = !!b;

        const player = mkPlayer(-1);
        player.x = 10; player.y = 10;            // far away, won't trip
        player.bullets.push({
            x: a.x, y: a.y, prevX: a.x, prevY: a.y,
            vx: 0, vy: 0, damage: 3, color: '#fff', weapon: 'MG', life: 80,
            hits: new Set(),
        });
        const splashBefore = countSplash();
        g.enemies.update(level, player);
        r.shotAGone = !bullets.includes(a);             // shot mine cleared
        r.shotBSurvived = bullets.includes(b);          // neighbor NOT chained
        r.shotNoSplash = countSplash() === splashBefore; // harmless pop, no AoE
    }

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.aPlaced === true
    && out.bPlaced === true
    && out.farPlaced === true
    && out.threeMines === true
    && out.pairChained === true
    && out.farSurvived === true
    && out.chainSplashSeeded === true
    && out.puntChainPlaced === true
    && out.aPunted === true
    && out.bChainPlaced === true
    && out.puntChainBGone === true
    && out.puntChainParried === true
    && out.shotPlaced === true
    && out.shotNeighborPlaced === true
    && out.shotAGone === true
    && out.shotBSurvived === true
    && out.shotNoSplash === true;
console.log(ok ? 'MINE CHAIN OK' : 'MINE CHAIN FAIL');
process.exit(ok ? 0 : 1);

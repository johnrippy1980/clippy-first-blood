// R637 smoke: sapper PANIC BURST at half HP. The first time a sapper drops
// below panicHp of its max HP it scatters a tight mine cluster at its feet and
// FLEES the player for panicFlee frames — punishing a slow chip-kill and (via
// R636) seeding a cluster that cascades. Drives the REAL Enemy._sapper +
// _dropMine. Verifies:
//  (1) a FULL-HP sapper paces normally — no panic, no cluster drop.
//  (2) dropping it below half HP triggers the panic: panicMines NEW mines drop
//      in a single update, and _panicked + _fleeTimer are set.
//  (3) the panic cluster mines are spread inside each other's chain radius
//      (R636 synergy — neighbors within ~28px).
//  (4) while fleeing, the sapper moves AWAY from the player (x recedes).
//  (5) panic fires ONCE — a second sub-half-HP hit does NOT re-burst.
//  (6) after the flee timer drains, the sapper resumes pacing TOWARD the player.
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

    const mkPlayer = () => ({
        x: 40 * GAME.TILE + 120, y: groundY - 14, w: 12, h: 14, vx: 0, vy: 0,
        facing: -1, waterHidden: false, grassHidden: false, state: -1,
        bullets: [], score: 0, onBulletHit() {},
    });

    // Spawn a fresh sapper to the player's LEFT, grounded, activated.
    const mkSapper = () => {
        bullets.length = 0;
        g.enemies.enemies.length = 0;
        g.enemies.spawn(40 * GAME.TILE, groundY, 'sapper');
        const s = g.enemies.enemies[g.enemies.enemies.length - 1];
        s._grace = 0; s.activated = true;
        // Let it fall + settle onto the ground before any test wounds it.
        const player = mkPlayer();
        for (let f = 0; f < 40; f++) s.update(level, player);
        return s;
    };

    const tpl = mkSapper().tpl;
    r.tpl = { panicHp: tpl.panicHp, panicMines: tpl.panicMines, panicFlee: tpl.panicFlee };

    // ===== (1) FULL-HP sapper does NOT panic.
    {
        const s = mkSapper();
        const player = mkPlayer();
        const before = countMines();
        for (let f = 0; f < 30; f++) s.update(level, player);
        // It may lay ONE routine mine over 30f, but must not have panicked.
        r.fullNotPanicked = s._panicked !== true;
        r.fullNoFlee = !(s._fleeTimer > 0);
    }

    // ===== (2)+(3) drop below half HP -> panic burst.
    {
        const s = mkSapper();
        const player = mkPlayer();
        // Run one frame so timer>0 baseline, then wound it below half.
        s.update(level, player);
        const minesBefore = countMines();
        s.hp = s.maxHp * 0.5 - 0.1;     // just under the panicHp threshold
        s.update(level, player);        // the panic frame
        r.panicked = s._panicked === true;
        r.fleeing = s._fleeTimer > 0;
        const minesAfter = countMines();
        r.clusterDropped = (minesAfter - minesBefore) >= tpl.panicMines;

        // (3) the new cluster mines sit within each other's chain radius.
        const cluster = bullets.filter(b => b._mine);
        let maxNeighborGap = Infinity;
        if (cluster.length >= 2) {
            // For each mine, nearest-neighbor distance; the WORST should still be
            // within the chain radius so R636 cascades the whole cluster.
            maxNeighborGap = 0;
            for (const a of cluster) {
                let nearest = Infinity;
                for (const b of cluster) {
                    if (a === b) continue;
                    const dx = a.x - b.x, dy = a.y - b.y;
                    nearest = Math.min(nearest, Math.hypot(dx, dy));
                }
                maxNeighborGap = Math.max(maxNeighborGap, nearest);
            }
        }
        r.clusterChainable = maxNeighborGap <= (tpl.mineChainR || 28);

        // (4) while fleeing it recedes from the player (player is to the RIGHT,
        // so a fleeing sapper moves LEFT — x decreases).
        const x0 = s.x;
        for (let f = 0; f < 10; f++) s.update(level, player);
        r.fledAway = s.x < x0;

        // (5) panic fires once — wound it again, no second burst.
        const minesBeforeSecond = countMines();
        s.hp = 1;
        for (let f = 0; f < 5; f++) s.update(level, player);
        // Allow the routine drop cadence; the panic-specific burst must not repeat.
        r.panicOnce = (countMines() - minesBeforeSecond) < tpl.panicMines;
    }

    // ===== (6) after the flee timer drains, it paces toward the player again.
    {
        const s = mkSapper();
        const player = mkPlayer();        // player to the RIGHT
        s.update(level, player);
        s.hp = s.maxHp * 0.5 - 0.1;
        s.update(level, player);          // panic + flee start
        // Drain the flee timer fully.
        for (let f = 0; f < (tpl.panicFlee + 10); f++) s.update(level, player);
        r.fleeEnded = !(s._fleeTimer > 0);
        const x0 = s.x;
        for (let f = 0; f < 10; f++) s.update(level, player);
        r.resumedToward = s.x > x0;       // moving RIGHT toward the player again
    }

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.tpl.panicMines >= 2
    && out.fullNotPanicked === true
    && out.fullNoFlee === true
    && out.panicked === true
    && out.fleeing === true
    && out.clusterDropped === true
    && out.clusterChainable === true
    && out.fledAway === true
    && out.panicOnce === true
    && out.fleeEnded === true
    && out.resumedToward === true;
console.log(ok ? 'SAPPER PANIC OK' : 'SAPPER PANIC FAIL');
process.exit(ok ? 0 : 1);

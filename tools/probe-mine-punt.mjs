// R634 smoke: punting a deployed sapper mine. A player who slides / rolls /
// dash-attacks THROUGH a grounded mine kicks it forward — turning the floor
// hazard into a weapon (_minePunt). The mine becomes a live projectile flying
// in the player's facing, arcing under gravity, no longer able to hurt the
// player. Drives the REAL EnemyManager punt pass + the REAL Bullet punted-mine
// flight. Verifies:
//  (1) a settled mine, when a NON-punting player (state -1) overlaps it, is NOT
//      punted (control — only the punt states kick it).
//  (2) a SLIDING player overlapping the mine PUNTS it: _minePunt set, forward
//      vx in the player's facing, _parried set (can't hit the player), and it
//      is no longer settled.
//  (3) a ROLLING player also punts (state coverage).
//  (4) a DASH_ATTACK player also punts.
//  (5) a punted mine actually MOVES on the next Bullet.update (vx applied) and
//      arcs downward (vy grows under gravity).
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

    const mkPlayer = (state) => ({
        x: 40 * GAME.TILE + 80, y: groundY - 14, w: 12, h: 14, vx: 0, vy: 0,
        facing: 1, waterHidden: false, grassHidden: false, state,
        bullets: [], score: 0, onBulletHit() {},
    });

    // Drop + settle one mine, then strip the sapper so manager updates only run
    // the mine passes. Returns the settled mine.
    const dropSettledMine = () => {
        const probe = mkPlayer(-1);
        g.enemies.spawn(40 * GAME.TILE, groundY, 'sapper');
        const m = g.enemies.enemies[g.enemies.enemies.length - 1];
        m._grace = 0; m.activated = true; m.hp = 999;
        for (let f = 0; f < 400; f++) {
            m.update(level, probe);
            if (countMines() > 0) break;
        }
        const mine = bullets.find(b => b._mine && !b._minePunt);
        if (mine) for (let i = 0; i < 80; i++) mine.update(level);  // settle + arm
        g.enemies.enemies.length = 0;
        return mine;
    };

    // Place the player's body over a mine.
    const standOn = (player, mine) => {
        player.x = mine.x - player.w / 2;
        player.y = mine.y - player.h + 2;
    };

    // ===== (1) CONTROL: a non-punting player does NOT punt.
    {
        const mine = dropSettledMine();
        r.controlDropped = !!mine;
        if (!mine) return r;
        const player = mkPlayer(-1);   // idle-ish, not a punt state
        standOn(player, mine);
        // Run the manager pass — but proximity would detonate it; we only care
        // that it's not PUNTED. Check _minePunt flag right after the pass.
        // (It will likely detonate from proximity; that's fine — punt must be false.)
        g.enemies.update(level, player);
        r.controlNotPunted = !mine._minePunt;   // never punted by a non-punt state
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (2) SLIDE punts.
    {
        const mine = dropSettledMine();
        r.slideDropped = !!mine;
        if (!mine) return r;
        const player = mkPlayer(STATE.SLIDE);
        player.facing = 1;
        standOn(player, mine);
        g.enemies.update(level, player);
        r.slidePunted = mine._minePunt === true;
        r.slideForwardVx = mine.vx > 0;           // facing +1 -> moves right
        r.slideParried = mine._parried === true;  // can't hit the player now
        r.slideUnsettled = mine._mineSettled === false;
        // (5) it MOVES + arcs on the next update.
        const x0 = mine.x, vy0 = mine.vy;
        mine.update(level);
        r.puntMoved = mine.x !== x0;
        r.puntArcs = mine.vy > vy0;               // gravity grows vy
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (3) ROLL punts.
    {
        const mine = dropSettledMine();
        if (!mine) { r.rollDropped = false; return r; }
        r.rollDropped = true;
        const player = mkPlayer(STATE.ROLL);
        standOn(player, mine);
        g.enemies.update(level, player);
        r.rollPunted = mine._minePunt === true;
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (4) DASH_ATTACK punts.
    {
        const mine = dropSettledMine();
        if (!mine) { r.dashDropped = false; return r; }
        r.dashDropped = true;
        const player = mkPlayer(STATE.DASH_ATTACK);
        standOn(player, mine);
        g.enemies.update(level, player);
        r.dashPunted = mine._minePunt === true;
    }

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.controlDropped === true
    && out.controlNotPunted === true
    && out.slideDropped === true
    && out.slidePunted === true
    && out.slideForwardVx === true
    && out.slideParried === true
    && out.slideUnsettled === true
    && out.puntMoved === true
    && out.puntArcs === true
    && out.rollDropped === true
    && out.rollPunted === true
    && out.dashDropped === true
    && out.dashPunted === true;
console.log(ok ? 'MINE PUNT OK' : 'MINE PUNT FAIL');
process.exit(ok ? 0 : 1);

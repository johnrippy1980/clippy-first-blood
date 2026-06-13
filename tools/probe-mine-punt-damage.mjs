// R635 smoke: a punted mine damages ENEMIES. R634 lets the player kick a
// deployed mine into a live projectile (_minePunt); R635 flips its ownership so
// that, on striking an enemy or wall, it detonates with ENEMY-damaging shrapnel
// (tagged _parried, which the manager's parried-bullet loop routes into enemy
// hitboxes — never the player). Drives the REAL EnemyManager punt-vs-enemy pass,
// the REAL _detonateMine(vsEnemies) + _spawnShrapnel(vsEnemies). Verifies:
//  (1) a punted mine overlapping an enemy DAMAGES that enemy (hp drops) and is
//      consumed.
//  (2) that detonation seeds _parried shrapnel children (enemy-damaging), NOT
//      plain player-damaging _splashChild.
//  (3) the _parried shrapnel can itself damage a second enemy in its spray
//      (the AoE genuinely hits enemies via the parried-bullet loop).
//  (4) CONTROL: a normal (un-punted) mine detonation seeds NON-parried shrapnel
//      (ownership stays anti-player) — the flip is exclusive to punts.
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
    const parriedShrapnel = () => bullets.filter(b => b._splashChild && b._parried);
    const plainShrapnel = () => bullets.filter(b => b._splashChild && !b._parried);

    const mkPlayer = (state) => ({
        x: 40 * GAME.TILE + 80, y: groundY - 14, w: 12, h: 14, vx: 0, vy: 0,
        facing: 1, waterHidden: false, grassHidden: false, state,
        bullets: [], score: 0, onBulletHit() {},
    });

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
        if (mine) for (let i = 0; i < 80; i++) mine.update(level);
        g.enemies.enemies.length = 0;
        return mine;
    };

    // ===== (1)+(2)+(3) punt a mine into an enemy.
    {
        const mine = dropSettledMine();
        r.dropped = !!mine;
        if (!mine) return r;
        // Punt it (slide over it).
        const player = mkPlayer(STATE.SLIDE);
        player.facing = 1;
        player.x = mine.x - player.w / 2;
        player.y = mine.y - player.h + 2;
        g.enemies.update(level, player);
        r.punted = mine._minePunt === true;

        // Spawn a TARGET enemy (folder) right where the punted mine is, plus a
        // SECOND enemy nearby to catch the shrapnel spray.
        g.enemies.spawn(mine.x, mine.y + 8, 'folder');
        const target = g.enemies.enemies[g.enemies.enemies.length - 1];
        target._grace = 0; target.activated = true;
        // Park the target so the mine (at mine.x/mine.y) sits inside its box.
        target.x = mine.x - target.w / 2; target.y = mine.y - target.h / 2;
        const hp0 = target.hp;

        // A second enemy positioned in the shrapnel's path. The fan sprays
        // UPWARD (negative vy) from the detonation, so park a wide box spanning
        // the area just above the mine to catch the rising arc.
        g.enemies.spawn(mine.x, mine.y, 'folder');
        const splashTarget = g.enemies.enemies[g.enemies.enemies.length - 1];
        splashTarget._grace = 0; splashTarget.activated = true;
        splashTarget.w = 40; splashTarget.h = 32;
        splashTarget.x = mine.x - 20; splashTarget.y = mine.y - 36;
        const splashHp0 = splashTarget.hp;

        // Use a passive player far away so it doesn't interfere.
        const idle = mkPlayer(-1); idle.x = 10; idle.y = 10;

        // Run one manager pass: the punted mine overlaps `target` -> detonates
        // with enemy shrapnel; the direct hit damages target.
        g.enemies.update(level, idle);
        r.targetDamaged = target.hp < hp0;          // (1) direct punt hit
        r.mineConsumed = countMines() === 0;        // (1) mine spent
        r.parriedSeeded = parriedShrapnel().length > 0;   // (2) enemy shrapnel
        r.noPlainFromPunt = plainShrapnel().length === 0; // (2) NOT player shrapnel

        // Step a few frames so the _parried shrapnel flies into splashTarget and
        // the manager's parried-bullet loop applies enemy damage.
        for (let f = 0; f < 12; f++) g.enemies.update(level, idle);
        r.splashTargetDamaged = splashTarget.hp < splashHp0;  // (3) AoE hits enemies
    }

    bullets.length = 0; g.enemies.enemies.length = 0;

    // ===== (4) CONTROL: a normal mine detonation = NON-parried shrapnel.
    {
        const player = mkPlayer(-1);
        const mine = dropSettledMine();
        r.controlDropped = !!mine;
        if (!mine) return r;
        // Trip it by proximity (player steps on it) — normal, un-punted.
        player.x = mine.x - player.w / 2;
        player.y = mine.y - player.h + 2;
        const before = plainShrapnel().length;
        g.enemies.update(level, player);
        r.controlPlainSeeded = plainShrapnel().length > before;  // player shrapnel
        r.controlNoParried = parriedShrapnel().length === 0;     // never enemy shrapnel
    }

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.dropped === true
    && out.punted === true
    && out.targetDamaged === true
    && out.mineConsumed === true
    && out.parriedSeeded === true
    && out.noPlainFromPunt === true
    && out.splashTargetDamaged === true
    && out.controlDropped === true
    && out.controlPlainSeeded === true
    && out.controlNoParried === true;
console.log(ok ? 'MINE PUNT DAMAGE OK' : 'MINE PUNT DAMAGE FAIL');
process.exit(ok ? 0 : 1);

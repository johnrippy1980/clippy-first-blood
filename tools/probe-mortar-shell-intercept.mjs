// R631 smoke: shooting a mortar shell out of the air. A mortar (R630) arcs a
// telegraphed shell at the player's predicted column; R631 lets a player bullet
// that crosses the in-flight shell INTERCEPT it — a harmless mid-air pop with
// NO ground splash. This is the skilled-player counter to the mortar's area
// denial. Drives the REAL EnemyManager.update interception pass (which lives
// in the manager loop, NOT the Bullet class) and the REAL _detonateMortar.
// Verifies:
//  (1) a launched shell that is NOT intercepted detonates on the ground and
//      DOES seed _splashChild sub-bullets (the control — splash still works).
//  (2) parking a player bullet on an in-flight shell and running
//      g.enemies.update(level, player) flips shell._intercepted, removes the
//      shell from the enemy-bullet array, and consumes the player bullet.
//  (3) the intercepted shell seeds ZERO _splashChild bullets — the AoE is
//      cancelled (the whole point of intercepting).
//  (4) a piercing player bullet survives the intercept (not consumed).
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

    const bullets = g.enemies.bullets;
    const countSplash = () => bullets.filter(b => b._splashChild).length;
    const groundY = (level.data.height - 3) * GAME.TILE;

    // Helper: spawn a mortar and drive it until it launches exactly one shell.
    const launchShell = (player) => {
        g.enemies.spawn(40 * GAME.TILE, groundY, 'mortar');
        const m = g.enemies.enemies[g.enemies.enemies.length - 1];
        m._grace = 0; m.activated = true; m.hp = 999;
        for (let f = 0; f < 400; f++) {
            m.update(level, player);
            if (bullets.some(b => b._mortar && !b._intercepted)) break;
        }
        return bullets.find(b => b._mortar && !b._intercepted);
    };

    // Player sits to the mortar's right, on the ground, moving right — same
    // geometry the R630 probe uses so _lobShell finds a real floor + launches.
    const mkPlayer = () => ({
        x: 40 * GAME.TILE + 90, y: groundY - 14, w: 12, h: 14, vx: 1.5, vy: 0,
        waterHidden: false, grassHidden: false, state: -1,
        bullets: [], score: 0,
        onBulletHit() {},                 // real player exposes this; stub is fine
    });

    // ===== (1) CONTROL: an un-intercepted shell DOES splash on ground impact.
    {
        const player = mkPlayer();
        const shell = launchShell(player);
        r.controlLaunched = !!shell;
        if (!shell) return r;
        const before = countSplash();
        // Let the shell fly to ground and detonate via its own Bullet.update.
        let detonated = false;
        for (let f = 0; f < 600 && !detonated; f++) {
            shell.update(level);
            if (shell.life <= 0) detonated = true;
        }
        r.controlDetonated = detonated;
        r.controlSplashSeeded = countSplash() > before;   // true — splash works
        r.controlIntercepted = !!shell._intercepted;       // false — it hit ground
    }

    // Clear the field for the intercept test.
    bullets.length = 0;
    g.enemies.enemies.length = 0;

    // ===== (2)+(3) INTERCEPT: a player bullet on the in-flight shell pops it
    // with no splash, via the REAL manager update pass.
    {
        const player = mkPlayer();
        const shell = launchShell(player);
        r.interceptLaunched = !!shell;
        if (!shell) return r;
        // Remove the mortar enemy so the manager update only exercises the
        // interception pass (no second shell, no AI/collision noise). The shell
        // already lives in the enemy-bullet array, independent of its launcher.
        g.enemies.enemies.length = 0;
        // Park a normal (non-piercing) player bullet dead on the shell.
        player.bullets.push({
            x: shell.x, y: shell.y, prevX: shell.x, prevY: shell.y,
            vx: 0, vy: 0, damage: 3, color: '#fff', weapon: 'MG', life: 80,
            hits: new Set(),
        });
        const splashBefore = countSplash();
        const shellsBefore = bullets.filter(b => b._mortar).length;
        // Run the REAL manager pass — this is where R631's interception lives.
        g.enemies.update(level, player);
        r.shellInterceptedFlag = !!shell._intercepted;            // true
        r.shellRemoved = bullets.filter(b => b._mortar).length < shellsBefore; // true
        r.bulletConsumed = player.bullets.length === 0;           // true
        // Step a few frames; an intercepted shell must seed NO splash children.
        for (let i = 0; i < 8; i++) {
            for (const b of bullets) b.update(level);
        }
        r.interceptNoSplash = countSplash() === splashBefore;     // true — AoE cancelled
        r.interceptSplashCount = countSplash() - splashBefore;    // 0
    }

    // Clear again for the piercing test.
    bullets.length = 0;
    g.enemies.enemies.length = 0;

    // ===== (4) a PIERCING bullet survives the intercept.
    {
        const player = mkPlayer();
        const shell = launchShell(player);
        r.pierceLaunched = !!shell;
        if (!shell) return r;
        g.enemies.enemies.length = 0;   // isolate the interception pass
        player.bullets.push({
            x: shell.x, y: shell.y, prevX: shell.x, prevY: shell.y,
            vx: 0, vy: 0, damage: 3, color: '#fff', weapon: 'MG', life: 80,
            piercing: true, hits: new Set(),
        });
        g.enemies.update(level, player);
        r.pierceShellGone = bullets.filter(b => b._mortar).length === 0; // shell still popped
        r.pierceBulletSurvived = player.bullets.length === 1;           // bullet NOT consumed
    }

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.controlLaunched === true
    && out.controlDetonated === true
    && out.controlSplashSeeded === true
    && out.controlIntercepted === false
    && out.interceptLaunched === true
    && out.shellInterceptedFlag === true
    && out.shellRemoved === true
    && out.bulletConsumed === true
    && out.interceptNoSplash === true
    && out.interceptSplashCount === 0
    && out.pierceLaunched === true
    && out.pierceShellGone === true
    && out.pierceBulletSurvived === true;
console.log(ok ? 'MORTAR SHELL INTERCEPT OK' : 'MORTAR SHELL INTERCEPT FAIL');
process.exit(ok ? 0 : 1);

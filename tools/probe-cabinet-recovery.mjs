// R623 smoke: cabinet enemy charge enrichment. The filing-cabinet grunt's
// charge AI now (a) telegraphs with a dust puff + sfx the instant wind-up
// begins, and (b) leaves the cabinet WINDED after a whiffed charge — a short
// knockStun recovery so a clean dodge is always rewarded with a punish window,
// not only when the cabinet slams a wall. Drives the real Enemy.update on the
// live level against a synthetic player. Verifies:
//  (1) wind-up trigger: player within 96px flips subState 0 -> 1.
//  (2) release: after chargeWindup frames, subState 1 -> 2 (charging).
//  (3) whiff recovery: a charge that runs its full ~45f without a wall hit
//      drops back to subState 0 AND sets knockStun > 0 (the new beat).
//  (4) wall-hit regression: a charge into a wall still self-stuns 60f.
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
    const g = window.__game;
    if (!g) return { err: 'no game' };
    // Real level so moveX/moveY behave like in-game.
    g._startStage(1);
    await new Promise(r => setTimeout(r, 350));
    const level = g.level;
    if (!level) return { err: 'no level' };
    const r = {};

    // Find solid ground near the left of the stage to stand the cabinet on.
    // Drop the cabinet onto a known floor row by spawning then letting gravity
    // settle a few frames against the real level.
    const mkCabinet = (x, y) => {
        g.enemies.spawn(x, y, 'cabinet');
        return g.enemies.enemies[g.enemies.enemies.length - 1];
    };
    // Synthetic player — only x/y/w/h/vx/vy are read by _charge.
    const mkPlayer = (x, y) => ({ x, y, w: 12, h: 16, vx: 0, vy: 0 });

    // --- settle a cabinet on the ground, away from walls ---
    const groundY = 12 * 16; // mid-stage floor-ish; gravity will settle exact
    const e1 = mkCabinet(140, groundY);
    e1._grace = 0; e1.activated = true;
    const p = mkPlayer(180, e1.y); // 40px to the right -> within 96
    // Let it settle onto ground (no wind-up yet because we keep player far first)
    p.x = 600; // far away during settle so it just patrols/falls
    for (let i = 0; i < 30; i++) e1.update(level, p);
    r.settledState = e1.subState; // 0 (patrol)

    // --- (1) wind-up trigger ---
    p.x = e1.x + 40;             // within 96px
    e1.update(level, p);
    r.windupState = e1.subState; // 1

    // --- (2) release into charge ---
    const windup = e1.tpl.chargeWindup;
    for (let i = 0; i < windup + 1; i++) e1.update(level, p);
    r.chargeState = e1.subState; // 2

    // --- (3) whiff recovery: keep player away so the charge can't "hit" the
    // player, and ensure there's open space so it runs full duration. Step
    // ~50 frames; the charge times out at >45 and should leave knockStun set.
    p.x = 600;
    let sawStun = false, sawReset = false;
    for (let i = 0; i < 55; i++) {
        e1.update(level, p);
        if ((e1.knockStun || 0) > 0) sawStun = true;
        if (sawStun && e1.subState === 0) sawReset = true;
    }
    r.whiffStun = sawStun;       // true — winded after the whiff
    r.whiffReset = sawReset;     // true — dropped back to patrol state

    // --- (4) wall-hit regression: spawn a cabinet flush against a wall column
    // and force a charge straight into it. Find a solid wall by scanning right
    // from the cabinet for the first solid tile, then aim the charge at it.
    const e2 = mkCabinet(40, groundY);
    e2._grace = 0; e2.activated = true;
    const p2 = mkPlayer(600, e2.y);
    for (let i = 0; i < 20; i++) e2.update(level, p2); // settle on ground
    // Force the charge sequence directly: put player close, run wind-up, then
    // slam it leftward into the stage's left boundary wall (x≈0).
    p2.x = e2.x - 40;            // to the left -> faces/charges left into wall
    e2.update(level, p2);        // subState -> 1
    for (let i = 0; i < e2.tpl.chargeWindup + 1; i++) e2.update(level, p2); // -> 2
    let wallStun = 0;
    for (let i = 0; i < 40; i++) {
        e2.update(level, p2);
        wallStun = Math.max(wallStun, e2.knockStun || 0);
    }
    r.wallStun = wallStun;       // should reach ~60 (the wall-slam self-stun)

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.settledState === 0
    && out.windupState === 1
    && out.chargeState === 2
    && out.whiffStun === true
    && out.whiffReset === true
    && out.wallStun >= 50;
console.log(ok ? 'CABINET RECOVERY OK' : 'CABINET RECOVERY FAIL');
process.exit(ok ? 0 : 1);

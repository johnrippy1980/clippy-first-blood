// R583: verify the death-tumble no longer free-falls through the floor and off
// the bottom of the screen (which made respawn read as "player materializes far
// off-screen"). Loads stage 1, places the player on solid ground, forces
// STATE.DIE, and ticks player.update directly against the real level. The
// dying body must settle ON the floor (y stops increasing, stays within the
// level) instead of sinking past level.height. Also sanity-checks _respawn()
// lands the player on-screen.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.click('#screen');
await page.waitForTimeout(300);

const result = await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    const lvl = g.level;
    const p = g.player;

    // Drop the player onto solid ground near the start: scan down from a high
    // point at a mid-level x until we find a solid tile, then sit just above it.
    const T = 16;
    const probeX = Math.min(lvl.width - 64, 600);
    let floorY = null;
    for (let y = 0; y < lvl.height; y += T) {
        if (lvl.isSolid(probeX, y)) { floorY = y; break; }
    }
    if (floorY === null) floorY = lvl.height - 32;
    p.x = probeX;
    p.y = floorY - p.h - 1;
    p.vx = 0; p.vy = 0;

    // Force the death state with a small sideways tumble velocity.
    p.state = (g.constructor.STATE && g.constructor.STATE.DIE) || 'die';
    p.deathTimer = 0;
    p.vx = 2; p.vy = -3;

    const startY = p.y;
    let maxY = p.y;
    // Tick the death animation for 120 frames directly against the level.
    for (let f = 0; f < 120; f++) {
        p.update(lvl, g.camera);
        if (p.y > maxY) maxY = p.y;
    }
    const diedY = p.y;
    const sankBelowLevel = maxY > lvl.height;     // body fell out of the world

    // Now exercise the real respawn and confirm on-screen.
    p.hp = 0;
    g._respawn();
    const sx = p.x - g.camera.viewX;
    const sy = p.y - g.camera.viewY;
    const respawnInView = sx > -32 && sx < 256 + 32 && sy > -32 && sy < 224 + 32;
    const respawnX = p.x, respawnY = p.y;

    // Pit scenario: die over empty space (high up, no floor below) and confirm
    // the body is capped at the level floor instead of sinking forever.
    p.x = probeX; p.y = 8;
    p.state = (g.constructor.STATE && g.constructor.STATE.DIE) || 'die';
    p.deathTimer = 0; p.vx = 0; p.vy = 0;
    let pitMaxY = p.y;
    for (let f = 0; f < 120; f++) { p.update(lvl, g.camera); if (p.y > pitMaxY) pitMaxY = p.y; }
    const pitCappedAtFloor = pitMaxY <= lvl.height + 1;

    return {
        levelHeight: lvl.height, floorY, startY,
        diedY: Math.round(diedY), maxY: Math.round(maxY), sankBelowLevel,
        pitMaxY: Math.round(pitMaxY), pitCappedAtFloor,
        respawnX: Math.round(respawnX), respawnY: Math.round(respawnY),
        respawnSX: Math.round(sx), respawnSY: Math.round(sy), respawnInView,
    };
});

await browser.close();

console.log(JSON.stringify(result, null, 2));
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (result.sankBelowLevel) fail('dying body fell below level.height (free-fall not clamped)');
if (result.diedY > result.floorY + 8) fail('dying body settled below the floor: diedY=' + result.diedY + ' floorY=' + result.floorY);
if (!result.pitCappedAtFloor) fail('death-over-pit fall not capped at floor: pitMaxY=' + result.pitMaxY + ' levelH=' + result.levelHeight);
if (!result.respawnInView) fail('player off-screen after _respawn: sx=' + result.respawnSX + ' sy=' + result.respawnSY);
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

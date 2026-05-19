// Verify crumble tile cycle: place a crumble tile under the player, stand on
// it, confirm crack progress climbs, tile breaks at ~30 ticks, player falls,
// tile respawns after 300 ticks.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r24', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});

// Build a 3-tile pedestal of BREAKABLE tiles under the player, then a deep
// air gap beneath. TILE.BREAKABLE = 8.
const setup = await page.evaluate(() => {
    const g = window.__game;
    const T = 16;
    const px = Math.floor((g.player.x + g.player.w / 2) / T);
    const py = Math.floor((g.player.y + g.player.h) / T);
    // Place crumble tiles directly below player feet
    const targetCol = px;
    const targetRow = py;
    // Make sure the tile under feet is BREAKABLE
    g.level.tiles[targetRow][targetCol] = 8;
    g.level.tiles[targetRow][targetCol - 1] = 8;
    g.level.tiles[targetRow][targetCol + 1] = 8;
    // Place player exactly on top of the row
    g.player.y = targetRow * T - g.player.h;
    g.player.vy = 0;
    g.player.vx = 0;
    return { targetRow, targetCol, levelW: g.level.data.width };
});
console.log('crumble setup:', JSON.stringify(setup));

await page.waitForTimeout(120);
const tick1 = await page.evaluate(() => {
    const g = window.__game;
    const cracks = Array.from(g.level._cracks.entries());
    return { onGround: g.player.onGround, py: g.player.y | 0, cracks };
});
console.log('after 120ms:', JSON.stringify(tick1));
await page.screenshot({ path: '/tmp/r24/cracking.png' });

// Wait until the tile breaks (30 frames ~= 500ms at 60fps)
await page.waitForTimeout(700);
const tick2 = await page.evaluate(() => {
    const g = window.__game;
    return {
        cracks: g.level._cracks.size,
        broken: Array.from(g.level._broken.entries()).map(([k, v]) => ({ key: k, t: v })),
        py: g.player.y | 0,
        vy: g.player.vy.toFixed(2),
        onGround: g.player.onGround,
        debris: g.level._crumbleDebris.length,
    };
});
console.log('after collapse:', JSON.stringify(tick2));
await page.screenshot({ path: '/tmp/r24/collapsed.png' });

// Move player off the crumble row so they stop cracking surviving tiles
await page.evaluate(() => {
    const g = window.__game;
    g.player.y = 50;
    g.player.x = 20;
    g.player.vy = 0;
});

// Wait for respawn (300 frames = 5s). Verify tile becomes solid again.
await page.waitForTimeout(6000);
const tick3 = await page.evaluate(() => {
    const g = window.__game;
    return {
        broken: g.level._broken.size,
        brokenEntries: Array.from(g.level._broken.entries()),
        cracks: g.level._cracks.size,
    };
});
console.log('after respawn wait:', JSON.stringify(tick3));
await page.screenshot({ path: '/tmp/r24/respawned.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

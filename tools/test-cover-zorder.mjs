// Position Clippy at a cover tile, hold up, verify the visual.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(200);
await page.evaluate(() => {
    const g = window.__game;
    g.bossSpawned = true; g.miniBossSpawned = true; g.boss = null;
    g.player.x = 19 * 16;
    g.player.y = (g.level.data.height - 2) * 16 - g.player.h - 4;  // slightly above
    g.player.vx = 0; g.player.vy = 0;
    g.camera.viewX = Math.max(0, 19 * 16 - 128);
});
// Let gravity settle Clippy onto the floor first
await page.waitForTimeout(800);
// Nudge to wake physics
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cover-zorder-pre.png' });

// Force cover state directly for visual verification
await page.evaluate(() => {
    const g = window.__game;
    g.player.state = 'cover';
    g.player.onCover = true;
    g.player.onGround = true;
    g.player.iFrames = 30;
});
await page.waitForTimeout(200);
const s = await page.evaluate(() => ({
    state: window.__game.player.state,
    onCover: window.__game.player.onCover,
    iFrames: window.__game.player.iFrames,
}));
console.log('cover state:', JSON.stringify(s));
await page.screenshot({ path: '/tmp/cover-zorder-active.png' });
// Diagnostic: dump tile values around player
const tiles = await page.evaluate(() => {
    const g = window.__game;
    const px = Math.floor(g.player.x / 16);
    const py = Math.floor((g.player.y + g.player.h / 2) / 16);
    const row = (r) => {
        const arr = [];
        for (let c = px - 2; c <= px + 2; c++) arr.push(g.level.tiles[r]?.[c]);
        return arr;
    };
    return {
        playerX: g.player.x, playerY: g.player.y, h: g.player.h, w: g.player.w,
        cellX: px, cellY: py,
        rowAbove: row(py - 1),
        rowBody: row(py),
        rowBelow: row(py + 1),
        rowFloor: row(py + 2),
        onGround: g.player.onGround,
    };
});
console.log('tiles:', JSON.stringify(tiles));
await page.keyboard.up('ArrowUp');
await browser.close();

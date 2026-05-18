// Place player AT cover, press UP, verify state transitions to COVER.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(400);

// Stage 1 has cover tiles at cols 19 and 44 (from COVER_LAYOUT in verify-cover.mjs)
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(500);

// Position player at col 19 (cover column)
const result = await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.player.x = 19 * 16 - 6;          // center on cover col 19
    g.player.y = (g.level.data.height - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = Math.max(0, g.player.x - 128);

    // Check tile under player
    const px = g.player.x + g.player.w / 2;
    const py = g.player.y + g.player.h - 1;
    const tile = g.level.tileAt(px, py);
    return { tile, x: g.player.x, y: g.player.y, w: g.player.w, h: g.player.h };
});
console.log('player state @ cover col:', JSON.stringify(result));

// Let the player settle to ground (a few ticks)
await page.waitForTimeout(300);
const onGround = await page.evaluate(() => window.__game.player.onGround);
console.log('onGround after settle:', onGround);

// Hold UP for ~200ms
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(300);
const stateUp = await page.evaluate(() => window.__game.player.state);
await page.keyboard.up('ArrowUp');
console.log('state while holding up:', stateUp);

await page.screenshot({ path: '/tmp/cover-hide-test.png' });
await browser.close();

// Player walks near cover, verify "↑ HIDE" prompt renders.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(400);

await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(500);

// Position player 4px LEFT of cover col 19 (within nearby range, not on top)
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.player.x = 19 * 16 - 12;          // a bit left of cover center
    g.player.y = (g.level.data.height - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = Math.max(0, g.player.x - 128);
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cover-prompt-nearby.png' });

// Now on top of cover
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 19 * 16 - 6;
});
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cover-prompt-on.png' });
console.log('captures saved');
await browser.close();

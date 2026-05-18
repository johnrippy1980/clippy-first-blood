// Visual tour of boss rooms. Forces boss spawn and screenshots.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);

for (const stage of [1, 4, 6, 8]) {
    await page.evaluate(s => window.__game._startStage(s), stage);
    await page.waitForTimeout(700);
    await page.evaluate(() => {
        const g = window.__game;
        g.scene = 'play';
        // Move player to end-of-level to trigger boss spawn
        const w = g.level.data.width;
        g.player.x = (w - 6) * 16;
        g.player.y = (g.level.data.height - 4) * 16;
        g.player.vx = 0; g.player.vy = 0;
        g.camera.x = Math.max(0, g.player.x - 128);
        g.camera.y = Math.max(0, (g.level.data.height - 14) * 16);
    });
    // Wait for boss to spawn naturally
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/boss-stage${stage}.png` });
    console.log(`boss-stage${stage}`);
}
await browser.close();

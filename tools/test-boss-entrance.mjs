// Visual test: trigger boss entrance and capture 4 frames during the 120f beat.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);

// Stage 4 (boardroom — CEO BALLMER is a tasty boss for the title)
await page.evaluate(() => window.__game._startStage(4));
await page.waitForTimeout(700);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    const w = g.level.data.width;
    g.player.x = (w - 6) * 16;
    g.player.y = (g.level.data.height - 4) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g.camera.y = Math.max(0, (g.level.data.height - 14) * 16);
});
// Force-trigger boss spawn
await page.evaluate(() => window.__game._spawnBoss());

// Capture 4 frames at age 5, 30, 60, 100 (5 -> flash, 30 -> hold, 60 -> hold, 100 -> fading)
for (const age of [5, 30, 60, 100]) {
    await page.waitForTimeout(age * 16 - (await page.evaluate(() => window.__game._bossEntrance?.age || 0) * 16));
    await page.screenshot({ path: `/tmp/boss-entry-${age}.png` });
    console.log(`boss-entry-${age} @ ${age}f`);
}
await browser.close();

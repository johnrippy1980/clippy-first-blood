// Pan the camera through stage 7 to find the tile chaos described by user.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(400);

await page.evaluate(() => window.__game._startStage(7));
await page.waitForTimeout(500);

// Pan camera across the whole stage in 256px steps to get the full picture
const width = await page.evaluate(() => window.__game.level.data.width * 16);
console.log(`stage 7 width: ${width}px`);

for (let xPx = 0; xPx < width; xPx += 240) {
    await page.evaluate(x => {
        const g = window.__game;
        g.scene = 'play';
        g.player.x = x;
        g.player.y = (g.level.data.height - 4) * 16;
        g.player.vx = 0;
        g.player.vy = 0;
        g.camera.x = Math.max(0, x - 128);
        g.camera.y = Math.max(0, (g.level.data.height - 14) * 16);
    }, xPx);
    await page.waitForTimeout(150);
    const i = String(xPx).padStart(5, '0');
    await page.screenshot({ path: `/tmp/stage7-x${i}.png` });
    console.log(`saved stage7-x${i}.png`);
}
await browser.close();

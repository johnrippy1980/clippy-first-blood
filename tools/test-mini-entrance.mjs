// Mini-boss entrance — capture mid-hold frame.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(700);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.player.x = 100;
    g.player.y = (g.level.data.height - 4) * 16;
    g.camera.x = 0;
});
await page.evaluate(() => window.__game._spawnMiniBoss());
// Frame 30 = mid-hold for 80f total
await page.waitForTimeout(30 * 16);
await page.screenshot({ path: '/tmp/mini-entry.png' });
console.log('saved /tmp/mini-entry.png');
await browser.close();

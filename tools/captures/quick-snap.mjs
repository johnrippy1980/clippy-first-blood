// Quick gameplay screenshot — stage 1, walking through hide spots + combat.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.storyTimer = 0;
});
await page.waitForTimeout(600);
// Mid-stage view
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 32 * 16;
    g.player.y = (g.level.data.height - 4) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/play-mid.png' });

// Approach the boss
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 56 * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/play-late.png' });

await browser.close();
console.log('snaps in /tmp/play-mid.png, /tmp/play-late.png');

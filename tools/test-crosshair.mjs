// Verify the boosted crosshair renders against a busy painted bg.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);

// Stage 1 (jungle) — busy painted bg
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(700);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.player.x = 200;
    g.player.y = (g.level.data.height - 4) * 16;
    g.camera.x = 0;
});
await page.waitForTimeout(120);
// Move mouse onto canvas mid-screen to activate aim
const screen = await page.$('#screen');
const box = await screen.boundingBox();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/crosshair-test.png' });
console.log('saved /tmp/crosshair-test.png');
await browser.close();

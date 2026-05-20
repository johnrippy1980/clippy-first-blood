import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r158', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);
await page.evaluate(async () => {
    const g = window.__game;
    g._startStage(10);
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 400));
    g.player.x = 16 * 16;  // zone 2 banner
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/r158/banner-zone2.png' });
await browser.close();

// Capture options menu.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(700);
await page.evaluate(() => {
    window.__game.scene = 'options';
    window.__game.optionsIndex = 1;  // highlight SFX VOLUME
});
await page.waitForTimeout(80);
await page.evaluate(() => { window.__game.scene = 'options'; window.__game.optionsIndex = 1; });
await page.waitForTimeout(40);
await page.screenshot({ path: '/tmp/clippy-options.png' });
await browser.close();
console.log('Saved /tmp/clippy-options.png');

// Capture the title screen mid-animation.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
// Force title scene to render with animation
await page.evaluate(() => {
    window.__game.scene = 'title';
    window.__game.titleBlink = 200;
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/clippy-title.png' });

// Another sample at different blink phase
await page.evaluate(() => { window.__game.titleBlink = 350; });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/clippy-title-2.png' });
await browser.close();
console.log('Saved /tmp/clippy-title*.png');

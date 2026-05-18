// Verify touch overlay shows on touch-capable devices.
import { chromium, devices } from 'playwright';
const browser = await chromium.launch();
// iPhone profile reports touch + small viewport
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// Tap canvas to satisfy first-gesture audio init
await page.locator('#screen').tap();
await page.waitForTimeout(500);
const active = await page.evaluate(() => document.getElementById('touch-overlay')?.getAttribute('data-active'));
console.log('overlay data-active:', active);
await page.screenshot({ path: '/tmp/touch-overlay.png' });
await browser.close();
console.log('snap: /tmp/touch-overlay.png');

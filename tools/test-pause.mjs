// Capture pause menu screenshot.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(900);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(200);
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/clippy-pause.png' });
await browser.close();
console.log('Saved /tmp/clippy-pause.png');

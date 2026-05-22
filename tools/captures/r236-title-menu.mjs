import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r236', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

// Open main menu by setting scene directly (no need to simulate keypress).
await page.evaluate(() => { window.__game.scene = 'mainMenu'; });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/r236/menu.png' });

console.log('Errors:', errs.length, errs.slice(0, 3));
await browser.close();

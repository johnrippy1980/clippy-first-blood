// Clean-boot smoke: load index.html, confirm window.__game exists and the
// page produced zero console/page errors. Exits non-zero on any error.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });
await page.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const hasGame = await page.evaluate(() => !!window.__game);
console.log(JSON.stringify({ errors, hasGame }));
await browser.close();
process.exit(errors.length === 0 && hasGame ? 0 : 1);

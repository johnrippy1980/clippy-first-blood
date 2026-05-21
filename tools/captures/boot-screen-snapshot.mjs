import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r162', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'domcontentloaded' });
// Don't wait for networkidle — grab the boot screen mid-load.
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/r162/boot-300ms.png' });
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/r162/boot-1s.png' });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r162/boot-2.5s.png' });
await browser.close();

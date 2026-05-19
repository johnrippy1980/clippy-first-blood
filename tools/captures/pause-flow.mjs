// Capture pause menu states.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/pause', { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
});
await page.waitForTimeout(500);
await page.keyboard.press('p');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/pause/01-pause-open.png' });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/pause/02-pause-settled.png' });

await browser.close();
console.log('ERRORS:', errors.length);

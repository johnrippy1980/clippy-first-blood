// Verify pause overlay renders correctly when triggered via input mid-play
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r44', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Land in stage 1 and run a few frames
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
});
await page.waitForTimeout(800); // let render loop play several frames

// Now trigger pause via input
await page.keyboard.press('p');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/r44/pause-real.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

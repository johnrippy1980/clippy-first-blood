// Capture enemy halo readability across stages — walk forward + spawn-grace
// timeout so enemies are on-screen and acting.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/halo', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

for (const n of [1, 3, 5, 6, 7, 8]) {
    await page.evaluate((stage) => {
        const g = window.__game;
        g._startStage(stage);
        g.scene = 'play';
        g.transition = 0;
        g.player.iFrames = 99999;
    }, n);
    // Walk right to bring enemies into view.
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2200);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(100);
    await page.screenshot({ path: `/tmp/halo/stage${n}-walked.png` });
}

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

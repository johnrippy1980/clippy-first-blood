// Verify combo-tier vignette layers over the standard play vignette
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r28', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
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
    g.player.iFrames = 99999;
});

for (const combo of [0, 12, 30, 60]) {
    await page.evaluate((c) => {
        const g = window.__game;
        g.player.combo = c;
    }, combo);
    await page.waitForTimeout(60);
    const cached = await page.evaluate(() => {
        const g = window.__game;
        return Object.keys(g._comboVignettes || {});
    });
    console.log(`combo=${combo}: cached tiers =`, JSON.stringify(cached));
    await page.screenshot({ path: `/tmp/r28/combo-${combo}.png` });
}

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

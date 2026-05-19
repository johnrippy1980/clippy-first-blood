// Verify crumble tiles render correctly in stages 3 and 6.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r25', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

for (const stage of [3, 6]) {
    await page.evaluate((s) => {
        const g = window.__game;
        g._startStage(s);
        g.scene = 'play';
        g.transition = 0;
        g.player.iFrames = 99999;
    }, stage);
    await page.waitForTimeout(120);

    // Scan tiles for BREAKABLE (=8); pan camera near the first match.
    const found = await page.evaluate(() => {
        const g = window.__game;
        const ts = g.level.tiles;
        const hits = [];
        for (let r = 0; r < ts.length; r++) {
            for (let c = 0; c < ts[r].length; c++) {
                if (ts[r][c] === 8) hits.push({ r, c });
            }
        }
        if (hits.length) {
            const first = hits[0];
            g.player.x = first.c * 16 - 32;
            g.player.y = (first.r - 1) * 16;
            g.player.vy = 0;
        }
        return { count: hits.length, first: hits[0], all: hits };
    });
    console.log(`stage ${stage}:`, JSON.stringify(found));
    await page.waitForTimeout(100);
    await page.screenshot({ path: `/tmp/r25/stage${stage}-crumble.png` });
}

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

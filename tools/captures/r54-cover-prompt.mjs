// Verify the cover-prompt "^ HIDE" renders with a real caret
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r54', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Find a cover tile and park the player next to it, on ground, not in cover.
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    // Hunt for a cover (C) tile in level data near the player spawn
    const lv = g.level;
    let found = null;
    for (let r = 5; r < lv.data.height - 2; r++) {
        for (let c = 5; c < Math.min(60, lv.data.width); c++) {
            if (lv.tiles[r][c] === 7) { // TILE.COVER
                found = { r, c };
                break;
            }
        }
        if (found) break;
    }
    window.__coverFound = found;
    // Move player adjacent if found
    if (found) {
        g.player.x = found.c * 16 - 12;
        g.player.y = found.r * 16;
    }
});
await page.waitForTimeout(300);
const found = await page.evaluate(() => window.__coverFound);
console.log('cover tile:', JSON.stringify(found));
await page.screenshot({ path: '/tmp/r54/cover-prompt.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

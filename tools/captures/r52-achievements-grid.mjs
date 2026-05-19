// Capture achievements grid + verify all 18 entries fit on screen
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r52', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Force achievements scene with everything unlocked so all 18 tiles render fully
await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    for (const a of ach.ACHIEVEMENT_LIST) ach.achievements.unlocked.add(a.id);
    const g = window.__game;
    g._startStage(1);   // ensure play state exists
    g.scene = 'achievements';
    g.achievementsIndex = 17; // select the LAST achievement so we can see clipping
});
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r52/all-unlocked.png' });

// Also test cursor on the 17th (clipped) row
await page.evaluate(() => {
    window.__game.achievementsIndex = 16; // first of last row
});
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r52/last-row-sel.png' });

const info = await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    return { total: ach.ACHIEVEMENT_LIST.length };
});
console.log('list:', JSON.stringify(info));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

// Verify HI-SCORE line appears on title when bestScore > 0
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r60', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Best=0 → no line
await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    ach.achievements.stats.bestScore = 0;
    window.__game.scene = 'title';
});
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r60/no-best.png' });

// Best=87,500 → line visible
await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    ach.achievements.stats.bestScore = 87500;
    window.__game.scene = 'title';
});
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r60/with-best.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

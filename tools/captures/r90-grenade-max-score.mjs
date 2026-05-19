// Verify grenade pickup at max grants +250 consolation score
// (matches the weapon-max pattern).
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));

    const p = g.player;
    p.grenades = 4;        // already at max
    p.score = 0;
    p.pickup('GRENADE');
    const scoreAfterMax = p.score;
    const grenadesAfterMax = p.grenades;

    // Reset and pickup with empty inventory — +2 grenades, +200 score
    p.grenades = 0;
    p.score = 0;
    p.pickup('GRENADE');
    const scoreAfterEmpty = p.score;
    const grenadesAfterEmpty = p.grenades;

    return { scoreAfterMax, grenadesAfterMax, scoreAfterEmpty, grenadesAfterEmpty };
});
console.log(JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.scoreAfterMax === 250
    && result.grenadesAfterMax === 4
    && result.scoreAfterEmpty === 200
    && result.grenadesAfterEmpty === 2;
process.exit(ok ? 0 : 1);

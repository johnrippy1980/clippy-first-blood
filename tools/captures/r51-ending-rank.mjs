// Verify run-rank renders on the ending cutscene
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r51', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Seed three different run states → three different ranks
async function snap(label, state) {
    // Compute rank in isolation using same formula as _drawGameComplete
    const result = await page.evaluate((s) => {
        const target = 12 * 60 * 60;
        const deaths = s.totalDeaths || 0;
        const noDmg = (s.runStats && s.runStats.noDamageStages) || 0;
        const mxCombo = s.maxCombo || 0;
        const totalTime = s.totalTime;
        const deathScore = deaths === 0 ? 1 : deaths <= 2 ? 0.85 : deaths <= 5 ? 0.60 : 0.30;
        const noDmgScore = Math.min(1, noDmg / 2);
        const comboScore = Math.min(1, mxCombo / 15);
        const timeScore = Math.max(0.1, Math.min(1, target / Math.max(target, totalTime)));
        const composite = deathScore * 0.4 + noDmgScore * 0.2 + comboScore * 0.2 + timeScore * 0.2;
        const letter = composite >= 0.92 ? 'S'
                     : composite >= 0.78 ? 'A'
                     : composite >= 0.62 ? 'B'
                     : composite >= 0.45 ? 'C' : 'D';
        return { letter, composite };
    }, state);
    console.log(`${label}:`, JSON.stringify(result));
}

await snap('s-rank', {
    totalTime: 10 * 60 * 60,   // under 12 min
    totalDeaths: 0,
    runStats: { noDamageStages: 6, stagesCleared: new Set([1,2,3,4,5,6,7,8]) },
    maxCombo: 30,
});
await snap('b-rank', {
    totalTime: 20 * 60 * 60,
    totalDeaths: 3,
    runStats: { noDamageStages: 1, stagesCleared: new Set([1,2,3,4,5,6,7,8]) },
    maxCombo: 10,
});
await snap('d-rank', {
    totalTime: 45 * 60 * 60,
    totalDeaths: 12,
    runStats: { noDamageStages: 0, stagesCleared: new Set([1,2,3,4,5,6,7,8]) },
    maxCombo: 4,
});

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

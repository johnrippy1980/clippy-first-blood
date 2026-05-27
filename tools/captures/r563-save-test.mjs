import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');

// Set some state
await page.evaluate(async () => {
    // Unlock some achievements
    const a = (await import('/src/achievements.js')).achievements;
    a.unlocked.add('first_blood');
    a.unlocked.add('combo_5');
    a.stats.totalKills = 42;
    a.stats.bestScore = 9999;
    a._save();
    // Set options
    const o = (await import('/src/options.js')).options;
    o.set('masterVol', 0.5);
    o.set('scanlines', false);
});

const beforeReload = await page.evaluate(async () => {
    const a = (await import('/src/achievements.js')).achievements;
    const o = (await import('/src/options.js')).options;
    return {
        unlocked: [...a.unlocked],
        totalKills: a.stats.totalKills,
        bestScore: a.stats.bestScore,
        masterVol: o.get('masterVol'),
        scanlines: o.get('scanlines'),
    };
});
console.log('Before reload:', JSON.stringify(beforeReload));

// Hard reload
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const afterReload = await page.evaluate(async () => {
    const a = (await import('/src/achievements.js')).achievements;
    const o = (await import('/src/options.js')).options;
    return {
        unlocked: [...a.unlocked],
        totalKills: a.stats.totalKills,
        bestScore: a.stats.bestScore,
        masterVol: o.get('masterVol'),
        scanlines: o.get('scanlines'),
    };
});
console.log('After reload: ', JSON.stringify(afterReload));

// Diff
const matches = (
    JSON.stringify(beforeReload.unlocked.sort()) === JSON.stringify(afterReload.unlocked.sort()) &&
    beforeReload.totalKills === afterReload.totalKills &&
    beforeReload.bestScore === afterReload.bestScore &&
    beforeReload.masterVol === afterReload.masterVol &&
    beforeReload.scanlines === afterReload.scanlines
);
console.log('Persistence:', matches ? 'OK' : 'FAIL');
await browser.close();

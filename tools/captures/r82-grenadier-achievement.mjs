// Verify GRENADIER achievement gates on grenadeKills >= 5.
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
    const { achievements, ACHIEVEMENT_LIST } = await import('/src/achievements.js');
    achievements.unlocked.clear();
    achievements._save();

    // Snapshot below threshold: should NOT unlock
    const below = achievements.update({ grenadeKills: 4 });
    const beforeIds = below.map(a => a.id);

    // Now hit threshold
    const at = achievements.update({ grenadeKills: 5 });
    const atIds = at.map(a => a.id);

    // Verify the entry exists in the list
    const inList = ACHIEVEMENT_LIST.some(a => a.id === 'grenadier');

    return { beforeIds, atIds, inList };
});
console.log(JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.inList === true
    && !result.beforeIds.includes('grenadier')
    && result.atIds.includes('grenadier');
process.exit(ok ? 0 : 1);

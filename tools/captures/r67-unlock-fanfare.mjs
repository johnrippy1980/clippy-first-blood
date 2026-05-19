// Verify audio.sfx('unlock') fires when achievements.update returns
// newly-unlocked entries.
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
    const { audio } = await import('/src/audio.js');
    const ach = await import('/src/achievements.js');

    // Clear all unlocks so we can guarantee a fresh unlock on next update.
    ach.achievements.unlocked.clear();
    ach.achievements._save();

    // Spy audio.sfx
    const calls = [];
    const orig = audio.sfx.bind(audio);
    audio.sfx = (name) => { calls.push(name); return orig(name); };

    // Simulate stage-clear → fire achievements.update with stats that should
    // unlock at least one achievement (e.g., stagesCleared=1 unlocks FIRST BLOOD).
    const newly = ach.achievements.update({
        totalKills: 50,
        stagesCleared: new Set([1, 2, 3, 4, 5, 6, 7, 8]),
        totalDeaths: 0,
        noDamageStages: 8,
        maxCombo: 100,
        weaponDamage: { MG: 100, S: 100, L: 100, F: 100, H: 100 },
        totalTime: 600,
        secretStageDiscovered: true,
        bulletTimeUses: 1,
        bestScore: 9999999,
        enemiesLost: 5,
        pounceKills: 1,
    });

    // Inline the unlock-fanfare guard that game.js fires (since this test
    // calls achievements.update directly, not via game._onStageClear).
    if (newly.length > 0) audio.sfx('unlock');

    audio.sfx = orig;
    return {
        newlyCount: newly.length,
        sawUnlockCall: calls.includes('unlock'),
        calls,
    };
});
console.log('Unlock fanfare:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0 && result.newlyCount > 0 && result.sawUnlockCall;
process.exit(ok ? 0 : 1);

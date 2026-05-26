// R488: verify every stage's clear-chain destination is sane.
// Drives each stage's data through the same logic _tickStageClear uses,
// resolving the target next-stage for every campaign stage.
import { chromium } from 'playwright';
const URL = 'http://localhost:8765/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);

const chain = await page.evaluate(async () => {
    const game = window.__game;
    // Force konami unlock so all stages are loadable
    game._konamiUnlocked = true;
    game.unlockedStage = 22;
    // Load each stage and read its nextStage from level data
    const result = [];
    const STAGE_LOADERS = (await import('/src/level.js')).STAGE_LOADERS;
    for (let n = 1; n < STAGE_LOADERS.length; n++) {
        if (!STAGE_LOADERS[n]) continue;
        const data = STAGE_LOADERS[n]();
        const nextStage = data?.nextStage;
        const ending = data?.endingStyle;
        result.push({ stage: n, name: data?.name || '?', nextStage, ending });
    }
    return result;
});

console.log('STAGE → NEXT CHAIN:');
for (const c of chain) {
    let target = c.nextStage;
    let note = '';
    // Apply the game.js _tickStageClear chain logic
    if (c.stage === 13) { target = 'GAME_COMPLETE'; note = '(final)'; }
    else if (c.stage === 14) { target = 'TITLE (or 2 if first visit)'; note = '(secret)'; }
    else if (c.stage >= 15 && !target) {
        if (c.stage === 22) { target = 'GAME_COMPLETE'; note = '(mecha final)'; }
        else { target = 'TITLE'; note = '(post-game one-off)'; }
    }
    else if (!target) { target = c.stage + 1; note = '(auto +1)'; }
    console.log(`  ${String(c.stage).padStart(2)}: ${c.name.padEnd(28)} → ${target} ${note}`);
}

await browser.close();

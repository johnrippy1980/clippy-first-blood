import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
// Test directly via _startStage for stage 4 (which has card_pipeline) and stage 25
for (const stage of [4, 25]) {
    console.log(`\n=== Stage ${stage} ===`);
    await page.evaluate((s) => window.__game._startStage(s), stage);
    const states = [];
    for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(150);
        const s = await page.evaluate(() => window.__game?.scene);
        if (states.length === 0 || states[states.length-1] !== s) {
            states.push(s);
        }
        if (s === 'play' || s === 'turretPlay' || s === 'doomPlay' || s === 'fpsPlay' || s === 'beatPlay') break;
        if (s === 'stageIntro' || s === 'stageCard' || s === 'ready') {
            await page.keyboard.press('KeyX');
        }
    }
    console.log('transitions:', states.join(' → '));
}
await browser.close();

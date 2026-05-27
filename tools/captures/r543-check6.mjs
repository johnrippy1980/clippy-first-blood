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
// Sequentially: 1 → 6
for (const s of [1, 6]) {
    await page.evaluate((stage) => window.__game._startStage(stage), s);
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(120);
        const sc = await page.evaluate(() => window.__game?.scene);
        if (sc === 'play' || sc === 'fpsPlay' || sc === 'beatPlay' || sc === 'doomPlay' || sc === 'turretPlay') {
            console.log(`Stage ${s}: scene=${sc}, fpsMode=${await page.evaluate(() => window.__game._fpsMode)}, fpsArena=${await page.evaluate(() => !!window.__game._fpsArena)}`);
            break;
        }
        if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') {
            await page.keyboard.press('KeyX');
        }
    }
}
await browser.close();

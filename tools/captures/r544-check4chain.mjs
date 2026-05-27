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
await page.evaluate(() => window.__game._startStage(4));
await page.waitForTimeout(500);
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'play') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
await page.evaluate(() => window.__game._onStageClear());
await page.waitForTimeout(200);
await page.evaluate(() => { window.__game.storyTimer = 200; });
await page.keyboard.press('KeyX');
await page.waitForTimeout(300);
const pending = await page.evaluate(() => window.__game._pendingStage);
console.log('Stage 4 cleared → pending stage:', pending, '(expected 23 BLOCK 11)');
await browser.close();

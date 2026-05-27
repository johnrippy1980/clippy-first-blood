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
await page.evaluate(() => window.__game._startStage(10));
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'play' || sc === 'beatPlay') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
const track = await page.evaluate(async () => {
    const a = (await import('/src/audio.js')).audio;
    return a.currentTrack;
});
console.log('Stage 10 (fresh) track:', track, '— expected arenaBoss');
await browser.close();

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
await page.evaluate(() => window.__game._startStage(1));
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'play') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
await page.evaluate(async () => {
    const a = (await import('/src/achievements.js')).achievements;
    a.banner = [];
    a.banner.push({ id: 'first_blood', age: 0 });
    a.banner.push({ id: 'combo_5', age: 0 });
    a.banner.push({ id: 'silent_strike', age: 0 });
});
console.log('After push: queue =', await page.evaluate(async () => (await import('/src/achievements.js')).achievements.banner.map(b => `${b.id}(${b.age})`)));
// Run game forward 6 seconds — that's ~360 frames
await page.waitForTimeout(6000);
console.log('After 6s:    queue =', await page.evaluate(async () => (await import('/src/achievements.js')).achievements.banner.map(b => `${b.id}(${b.age})`)));
await page.waitForTimeout(6000);
console.log('After 12s:   queue =', await page.evaluate(async () => (await import('/src/achievements.js')).achievements.banner.map(b => `${b.id}(${b.age})`)));
await browser.close();

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
await page.evaluate(() => window.__game._startStage(25));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'turretPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a._introT = 0;
    a.monsters = [];
    a.waveIdx = 4;
    a._voltronSpawned = false;
    a._spawnVoltron();
    a.voltron.introT = 0;
    a.voltron.scale = 0.9;
    a.voltron.hp = 0;
    a._triggerVoltronDeath();
});
// Wait for clear
for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(80);
    const phase = await page.evaluate(() => window.__game._turretArena?.phase);
    if (phase === 'clear') { console.log(`Clear at frame ${i}`); break; }
}
// Wait the clear minimum
await page.waitForTimeout(2000);
const clearT = await page.evaluate(() => window.__game._turretArena?.clearT);
console.log('clearT before X:', clearT);
// X to advance
await page.keyboard.press('KeyX');
await page.waitForTimeout(400);
const sceneAfter = await page.evaluate(() => window.__game?.scene);
console.log('scene after X:', sceneAfter);
const pending = await page.evaluate(() => window.__game._pendingStage);
console.log('pending stage:', pending);
await browser.close();

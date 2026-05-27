import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(25));
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'turretPlay') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
const track1 = await page.evaluate(async () => {
    const a = (await import('/src/audio.js')).audio;
    return a.currentTrack;
});
console.log('Track during waves:', track1);
// Spawn boss
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a._introT = 0;
    a.waveIdx = 4;
    a._voltronSpawned = false;
    a._spawnVoltron();
});
await page.waitForTimeout(800);
const track2 = await page.evaluate(async () => {
    const a = (await import('/src/audio.js')).audio;
    return a.currentTrack;
});
console.log('Track during boss:', track2);
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();

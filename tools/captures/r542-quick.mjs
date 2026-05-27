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
});
// Let voltron run on its own for 3 seconds
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const proj = await page.evaluate(() => window.__game._turretArena.bossProjectiles.length);
    const attackCD = await page.evaluate(() => window.__game._turretArena.voltron?.attackCD);
    console.log(`frame ${i}: projectiles=${proj}, attackCD=${attackCD}`);
    if (proj > 0) break;
}
await browser.close();

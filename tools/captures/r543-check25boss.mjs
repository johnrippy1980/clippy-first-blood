import { chromium } from 'playwright';
import fs from 'fs/promises';
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
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(150);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'turretPlay') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a._introT = 0;
    a.waveIdx = 4;
    a._voltronSpawned = false;
    a._spawnVoltron();
    a.voltron.introT = 0;
    a.voltron.scale = 0.9;
});
await page.waitForTimeout(400);
const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile('/tmp/r543/voltron_with_hud.png', Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
await browser.close();

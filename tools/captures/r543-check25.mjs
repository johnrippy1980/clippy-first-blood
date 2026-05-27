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
for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(150);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'turretPlay') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
// Let intro overlay drain
await page.evaluate(() => { if (window.__game._turretArena) window.__game._turretArena._introT = 0; });
await page.waitForTimeout(800);
const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile('/tmp/r543/stage_25_settled.png', Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
await browser.close();

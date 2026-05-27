import { chromium } from 'playwright';
import fs from 'node:fs/promises';
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
await page.evaluate(() => {
    const p = window.__game.player;
    p.lives = 0; p.hp = 1; p.iframes = 0; p.secondChanceUsed = true;
    p.kill?.();
});
await page.waitForTimeout(2500);
const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile('/tmp/r558_gameover.png', Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
const scene = await page.evaluate(() => window.__game?.scene);
console.log('scene:', scene);
await browser.close();

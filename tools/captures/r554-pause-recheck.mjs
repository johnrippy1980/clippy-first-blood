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
async function snapStage(stage, label) {
    await page.evaluate((s) => window.__game._startStage(s), stage);
    await page.waitForTimeout(600);
    for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(120);
        const sc = await page.evaluate(() => window.__game?.scene);
        if (sc === 'play' || sc === 'beatPlay' || sc === 'doomPlay' || sc === 'turretPlay' || sc === 'fpsPlay') break;
        if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
    }
    await page.waitForTimeout(400);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(300);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`/tmp/r554_pause/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);
}
import fs2 from 'node:fs/promises';
await fs2.mkdir('/tmp/r554_pause', { recursive: true });
await snapStage(1, '01_jungle');
await snapStage(7, '07_brawler');
await snapStage(16, '16_doom');
await snapStage(25, '25_turret');
console.log('done');
await browser.close();

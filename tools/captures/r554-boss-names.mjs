import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r554_boss_names';
await fs.mkdir(OUT, { recursive: true });
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
async function snap(stage, label) {
    await page.evaluate((s) => window.__game._startStage(s), stage);
    await page.waitForTimeout(600);
    for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(120);
        const sc = await page.evaluate(() => window.__game?.scene);
        if (sc === 'doomPlay' || sc === 'turretPlay' || sc === 'play') break;
        if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
    }
    await page.waitForTimeout(400);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await snap(16, '01_floor11');
await snap(23, '02_block11');
await snap(25, '03_turret');
await browser.close();

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r398br';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
// Stage 12 = BOSS RUSH (campaign version)
await page.evaluate(() => window.__game._startStage(12));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay' || s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await page.waitForTimeout(1000);
await snap('open');
await page.evaluate(() => {
    const g = window.__game;
    if (g.player) {
        g.player.invuln = 99999;
        g.player.x = (g.level?.data?.bossTrigger?.x || 200) + 4;
        if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
        if (g._spawnBoss) g._spawnBoss();
        if (g._bossIntro) g._bossIntro.autoAdvance = true;
    }
});
for (let i = 0; i < 6; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(150);
}
await page.waitForTimeout(800);
await snap('boss1');
const diag = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        stage: g.currentStage,
        boss: g.boss?.kind,
        gauntlet: g._gauntletQueue?.slice(),
    };
});
console.log(JSON.stringify(diag));
await browser.close();

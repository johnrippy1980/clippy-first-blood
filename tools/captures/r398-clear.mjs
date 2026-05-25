// Snap the stage-clear screen + transition
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r398c';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Kill the boss to trigger stage clear
await page.evaluate(() => {
    const g = window.__game;
    g.player.invuln = 99999;
    g.player.x = g.level.data.bossTrigger.x + 4;
    if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    g._spawnBoss();
    if (g._bossIntro) g._bossIntro.autoAdvance = true;
});
await page.waitForTimeout(800);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(150);
}
// Kill the boss
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss) { g.boss.hp = 0; g.boss.alive = false; }
});
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(300);
    await snap(`f${String(i).padStart(2,'0')}`);
}
console.log('done');
await browser.close();

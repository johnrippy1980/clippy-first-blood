// R396: capture 12 frames of stage 1 enemy combat to see if walk/
// attack/hurt/death frames actually swap.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r396';
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
// God-mode + teleport to first enemy area
await page.evaluate(() => {
    const g = window.__game;
    g.player.invuln = 99999;
    g.player.x = 130;
    if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
});
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Wait for stapler to approach + attack
for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(180);
    await snap(`f${String(i).padStart(2,'0')}`);
}
const diag = await page.evaluate(() => {
    const g = window.__game;
    const enemies = [];
    if (g.enemies?.enemies) {
        for (const e of g.enemies.enemies) {
            enemies.push({ kind: e.kind || e.tpl?.sprite || '?', x: Math.round(e.x), y: Math.round(e.y), vy: e.vy?.toFixed(2), behavior: e.behavior, subState: e.subState });
        }
    }
    return { scene: g.scene, enemies };
});
console.log(JSON.stringify(diag, null, 2));
await browser.close();

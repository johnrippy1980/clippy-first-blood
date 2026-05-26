// R424: verify Doom stage intro cards + boss intro plates render
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r424';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);

// Stage 23 BLOCK 11 — verify stage card renders at the intro
await page.evaluate(() => window.__game._startStage(23));
await page.waitForTimeout(500);
// First X advances STAGE_CARD if cinematic plays
await page.waitForTimeout(2000);
let s = await page.evaluate(() => window.__game?.scene);
console.log('s23 immediate scene:', s);
// Snap whatever's on screen — could be stageCard or stageIntro
const dataUrl1 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl1) await fs.writeFile(`${OUT}/01_s23_card.png`, Buffer.from(dataUrl1.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Now skip past intros to doomPlay + force boss intro
for (let i = 0; i < 12; i++) {
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(220);
}
await page.waitForTimeout(900);
// Teleport player right next to boss to trigger boss intro
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 22; d.player.y = 8.5;
    d.player.angle = 0;
});
await page.waitForTimeout(500);
const s2 = await page.evaluate(() => window.__game?.scene);
console.log('s23 after teleport scene:', s2);
const dataUrl2 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl2) await fs.writeFile(`${OUT}/02_s23_boss_intro.png`, Buffer.from(dataUrl2.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Skip past boss intro
for (let i = 0; i < 4; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(150);
}

// Now stage 16 FLOOR 11
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2000);
const dataUrl3 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl3) await fs.writeFile(`${OUT}/03_s16_card.png`, Buffer.from(dataUrl3.replace(/^data:image\/png;base64,/, ''), 'base64'));
// Skip to doomPlay + teleport to boss
for (let i = 0; i < 12; i++) {
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(220);
}
await page.waitForTimeout(900);
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 14.5; d.player.y = 3.5;
    d.player.angle = -Math.PI / 2;
});
await page.waitForTimeout(500);
const dataUrl4 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl4) await fs.writeFile(`${OUT}/04_s16_boss_intro.png`, Buffer.from(dataUrl4.replace(/^data:image\/png;base64,/, ''), 'base64'));

console.log('done');
await browser.close();

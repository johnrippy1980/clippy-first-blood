// R404: capture multiple snaps of stage 1 platforms to see hanging vines
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r404';
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
await page.evaluate(() => { window.__game.player.invuln = 99999; });
async function snap(label, px) {
    await page.evaluate((x) => {
        const g = window.__game;
        g.player.x = x;
        if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    }, px);
    await page.waitForTimeout(400);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Sweep across stage 1 — find spots with lots of platforms
for (const x of [100, 250, 400, 550, 700, 850, 1000, 1150, 1300]) {
    await snap(`s1_x${x}`, x);
}

// Stage 5 (boardroom) — has platforms too
await page.evaluate(() => window.__game._startStage(5));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { window.__game.player.invuln = 99999; });
for (const x of [200, 500, 800, 1100]) {
    await snap(`s5_x${x}`, x);
}

// Stage 4 (pipeline/sewer)
await page.evaluate(() => window.__game._startStage(4));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { window.__game.player.invuln = 99999; });
for (const x of [300, 600, 900]) {
    await snap(`s4_x${x}`, x);
}
console.log('done');
await browser.close();

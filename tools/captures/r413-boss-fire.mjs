// Wait long enough for MECHA-GATES to fire its gatling pattern
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r413';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(22));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Spawn phase 1 + iframes
await page.evaluate(() => {
    const beat = window.__game._beatEmUp;
    if (!beat) return;
    if (beat.player) beat.player.iframes = 999999;
    beat.scroll = 1100;
    beat.waveIdx = 6;
    if (beat._spawnWave) beat._spawnWave(6);
});

// Wait for boss attack pattern (~100f = 1.7s) — snap 10 frames over 4s
for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(250);
    await snap(`p1_${String(i).padStart(2,'0')}`);
}

// Switch to phase 2
await page.evaluate(() => {
    const beat = window.__game._beatEmUp;
    for (const e of beat.enemies) e.alive = false;
    beat.waveIdx = 8;
    if (beat._spawnWave) beat._spawnWave(8);
});
for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(250);
    await snap(`p2_${String(i).padStart(2,'0')}`);
}
console.log('done');
await browser.close();

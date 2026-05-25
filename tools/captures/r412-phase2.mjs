// Snap stage 22 wave 8 (Mecha-Gates phase 2) to verify the painted boss_GATES swap
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r412p';
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
await page.evaluate(() => {
    const g = window.__game; const beat = g._beatEmUp;
    if (!beat) return;
    if (beat.player) beat.player.iframes = 999999;
});

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Force wave 6 (phase 1 boss)
await page.evaluate(() => {
    const beat = window.__game._beatEmUp;
    beat.scroll = 1100;
    beat.waveIdx = 6;
    if (beat._spawnWave) beat._spawnWave(6);
});
await page.waitForTimeout(800);
await snap('phase1');

// Force wave 8 (phase 2 boss)
await page.evaluate(() => {
    const beat = window.__game._beatEmUp;
    // Kill existing
    for (const e of beat.enemies) e.alive = false;
    beat.waveIdx = 8;
    if (beat._spawnWave) beat._spawnWave(8);
});
await page.waitForTimeout(800);
await snap('phase2');
console.log('done');
await browser.close();

// Verify R409 jump-to-aim hits the helicopter on stage 22 wave 7
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r411j';
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
// Force wave 4 (has helicopter + drones) — let me check
await page.evaluate(() => {
    const g = window.__game; const beat = g._beatEmUp;
    if (!beat) return;
    if (beat.player) beat.player.iframes = 999999;
    // Wave 4 is interstitial drones+brawlers. Let me check
    beat.waveIdx = 4;
    if (beat._spawnWave) beat._spawnWave(4);
});
await page.waitForTimeout(800);

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Jump + hold UP + hold shoot
await page.keyboard.down('ArrowUp');
await page.keyboard.press('KeyZ');
await page.waitForTimeout(80);
await snap('jumpup1');
await page.keyboard.down('KeyX');
await page.waitForTimeout(160);
await snap('jumpup2');
await page.waitForTimeout(160);
await snap('jumpup3');
await page.waitForTimeout(160);
await snap('jumpup4');
await page.keyboard.up('KeyX');
await page.keyboard.up('ArrowUp');
console.log('done');
await browser.close();

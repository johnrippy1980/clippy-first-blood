// R394: snap stage 20 beat-em-up over multiple frames to capture
// brawler animation including the new attack-pose tell.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r394a';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(20));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Spawn wave with brawlers
await page.evaluate(() => {
    const g = window.__game; const beat = g._beatEmUp;
    if (!beat) return;
    beat.scroll = 256;
    beat.waveIdx = 3;
    if (beat._spawnWave) beat._spawnWave(3);
});
await page.waitForTimeout(1200);
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// 14 frames at 200ms to catch the attack-windup
for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(180);
    await snap(`f${String(i).padStart(2,'0')}`);
}
console.log('errs:', errs.length);
await browser.close();

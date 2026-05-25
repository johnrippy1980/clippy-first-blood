// Stage 22 brawler attacks — verify R390 attack-frame swap works
// on non-boss brawlers + bullets visible.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r398';
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
// Force spawn wave 2 (brawlers + scavengers)
await page.evaluate(() => {
    const g = window.__game; const beat = g._beatEmUp;
    if (!beat) return;
    beat.scroll = 256;
    beat.waveIdx = 2;
    if (beat._spawnWave) beat._spawnWave(2);
});
await page.waitForTimeout(1200);
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Snap many frames over 5s to catch attack-windups
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(220);
    await snap(`f${String(i).padStart(2,'0')}`);
}
const diag = await page.evaluate(() => {
    const g = window.__game; const beat = g._beatEmUp;
    return {
        enemies: beat?.enemies?.map(e => ({ type: e.type, attackCD: e.attackCD, _animT: e._animT })),
    };
});
console.log(JSON.stringify(diag));
await browser.close();

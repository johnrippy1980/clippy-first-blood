// Snap stage 1 (has fire ambient props) to verify painted fires
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r411f';
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
async function snap(x, label) {
    await page.evaluate((px) => {
        const g = window.__game;
        g.player.x = px;
        if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    }, x);
    await page.waitForTimeout(300);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Stage 1 has fires at tiles 18, 56, 82. Snap near each
for (const t of [18, 56, 82]) {
    await snap(t * 16, `s1_fire_t${t}`);
}
console.log('done');
await browser.close();

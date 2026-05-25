// Force-trigger lightning on stage 22 and snap to verify bolts
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r411L';
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
await page.evaluate(() => { const b = window.__game._beatEmUp; if (b?.player) b.player.iframes = 999999; });
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Force lightning props to fire
for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
        const ap = window.__game._ambientProps;
        if (!ap) return;
        for (const p of ap.props) {
            if (p.kind === 'lightning') { p.cd = 0; p.flashT = 0; }
        }
    });
    // Tick the engine
    await page.waitForTimeout(60);
    await snap(`flash${i}_a`);
    await page.waitForTimeout(60);
    await snap(`flash${i}_b`);
}
console.log('done');
await browser.close();

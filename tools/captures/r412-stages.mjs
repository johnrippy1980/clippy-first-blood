// R412: snap select stages I haven't audited yet
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r412';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
async function snap(stage, label) {
    await page.evaluate((n) => window.__game._startStage(n), stage);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'beatPlay' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.evaluate(() => {
        const g = window.__game;
        if (g.player) g.player.invuln = 99999;
    });
    await page.waitForTimeout(800);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Stages I want to double-check
for (const [n, label] of [[8, 's08'], [11, 's11'], [13, 's13'], [14, 's14'], [15, 's15'], [18, 's18']]) {
    await snap(n, label);
}
console.log('done');
await browser.close();

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r415';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
async function snap(stage, label, count = 3) {
    await page.evaluate((n) => window.__game._startStage(n), stage);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'beatPlay' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.evaluate(() => { if (window.__game.player) window.__game.player.invuln = 99999; });
    for (let i = 0; i < count; i++) {
        await page.waitForTimeout(600);
        const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
        if (dataUrl) await fs.writeFile(`${OUT}/${label}_${i}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
}
await snap(1, 's01');
await snap(13, 's13');
await snap(21, 's21');
await snap(22, 's22', 4);
console.log('done');
await browser.close();

// R419: quick visual tour of every stage to spot remaining roughness
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r419';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
const stages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22];
for (const n of stages) {
    await page.evaluate((s) => window.__game._startStage(s), n);
    await page.waitForTimeout(2200);
    // Skip past intro/ready
    for (let i = 0; i < 6; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'beatPlay' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.evaluate(() => { if (window.__game.player) window.__game.player.invuln = 99999; });
    await page.waitForTimeout(800);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/s${String(n).padStart(2, '0')}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log(`s${n} captured`);
}
console.log('done');
await browser.close();

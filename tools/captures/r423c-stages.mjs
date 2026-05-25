// R423c: verify both Doom stages (16 FLOOR 11 + 23 BLOCK 11) load
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r423c';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);

async function snapStage(num, label) {
    await page.evaluate((n) => window.__game._startStage(n), num);
    await page.waitForTimeout(2200);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'doomPlay' || s === 'play' || s === 'beatPlay' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(900);
    const scene = await page.evaluate(() => window.__game?.scene);
    const data = await page.evaluate(() => {
        const d = window.__game._doomEngine?.data;
        return d ? { name: d.name, boss: d.doomBoss, theme: d.theme } : null;
    });
    console.log(`stage ${num}: scene=${scene}, data=${JSON.stringify(data)}`);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

await snapStage(23, 'block11');
await snapStage(16, 'floor11');
console.log('done');
await browser.close();

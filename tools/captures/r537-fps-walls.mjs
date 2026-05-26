// R537: snap FPS corridors with new wall ornaments
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r537';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 24;
    window.__game.gameCleared = true;
});

async function snapStage(id, label) {
    await page.evaluate((s) => window.__game._startStage(s), id);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1500);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

await snapStage(6, '01_ballmer_office');
await snapStage(9, '02_keynote_corridor');
await snapStage(19, '03_core_breach');

console.log('done');
await browser.close();

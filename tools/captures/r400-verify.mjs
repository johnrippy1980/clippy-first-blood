// Verify the new R400/R401 cards are picked up live
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r400v';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Stage card display — force the stage_card scene before stage 13
for (const stage of [10, 11, 12, 13, 14, 18, 21, 22]) {
    await page.evaluate((n) => {
        const g = window.__game;
        g._pendingStage = n;
        g._extraCards = null;
        g.storyTimer = 30;   // skip into the holdmiddle of the Ken-Burns
        g.scene = 'stageCard';
    }, stage);
    await page.waitForTimeout(500);
    await snap(`card_s${stage}`);
}

// Boss intro plate for HELICOPTER + MECHA_GATES — check sprite registry
const heli = await page.evaluate(() => {
    const s = window.__game?.sprites || (window.sprites);
    return null;  // can't easily probe; just verify visually
});

await browser.close();
console.log('done');

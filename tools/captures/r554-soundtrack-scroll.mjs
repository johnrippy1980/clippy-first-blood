import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r554_st';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
    window.__game.scene = 'soundtrack';
    window.__game.soundtrackIndex = 0;
});
await page.waitForTimeout(300);
// Scroll through all 30 tracks in pages of 6
for (let p = 0; p < 5; p++) {
    await page.evaluate((idx) => { window.__game.soundtrackIndex = idx; }, p * 6);
    await page.waitForTimeout(200);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/page_${p}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await browser.close();

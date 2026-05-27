// R538b: snap Floor 11 to see the new wall texture mix
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r538b';
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
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { window.__game._doomEngine._introT = 0; });

async function snap(label, x, y, angle) {
    await page.evaluate((d) => {
        const e = window.__game._doomEngine;
        e.player.x = d.x; e.player.y = d.y; e.player.angle = d.a;
    }, { x, y, a: angle });
    await page.waitForTimeout(120);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Cubicle farm areas — should see the mix
await snap('01_cubicle_north', 20.5, 25.5, -Math.PI/2);
await snap('02_cubicle_east',  10.5, 22.5,  0);
await snap('03_exec_wing',     5.5,  10.5,  0);
await snap('04_central_hall',  20.5, 14.5,  Math.PI/2);
await snap('05_bathroom_west', 8.5,  16.5,  Math.PI);

console.log('done');
await browser.close();

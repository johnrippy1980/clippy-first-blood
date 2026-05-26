// R539: snap each segment of Ballmer office FPS to verify progression
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r539';
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
await page.evaluate(() => window.__game._startStage(6));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'fpsPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Force-set segment, refresh bg, snap
for (let seg = 0; seg < 4; seg++) {
    await page.evaluate((s) => {
        const a = window.__game._fpsArena;
        if (a) { a.segment = s; a._refreshBg(); }
    }, seg);
    await page.waitForTimeout(200);
    await snap(`segment_${seg}`);
}

console.log('done');
await browser.close();

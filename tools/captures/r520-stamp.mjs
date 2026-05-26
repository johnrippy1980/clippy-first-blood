// R520: verify TARGET DOWN stamp on boss kill
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r520_stamp';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; });
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Trigger the stamp directly
await page.evaluate(() => { window.__game._bossKillStampT = 90; });
await page.waitForTimeout(50);
await snap('01_stamp_start');
await page.waitForTimeout(150);
await snap('02_stamp_held');
await page.waitForTimeout(400);
await snap('03_stamp_fade');

console.log('done');
await browser.close();

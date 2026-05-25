// R399: walk stage 21 (helicopter chase) and verify chopper tracks
// the player, bombs, etc.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r399';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(21));
await page.waitForTimeout(2500);
for (let i = 0; i < 10; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { window.__game.player.invuln = 99999; });
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Walk + shoot upward
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ArrowUp');
await page.keyboard.down('KeyX');
for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(250);
    await snap(`f${String(i).padStart(2,'0')}`);
}
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowUp');
await page.keyboard.up('KeyX');
console.log('done');
await browser.close();

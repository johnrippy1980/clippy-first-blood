// Slide animation test
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r398s';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
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
// Slide: hold right + down + jump (or whatever the slide combo is)
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(400);
// Slide = ArrowDown + jump (Z)
await page.keyboard.down('ArrowDown');
await page.keyboard.press('KeyZ');
for (let i = 0; i < 6; i++) {
    await snap(`slide${i}`);
    await page.waitForTimeout(80);
}
await page.keyboard.up('ArrowDown');
await page.keyboard.up('ArrowRight');
// Back-dash (special / C)
await page.keyboard.press('KeyC');
for (let i = 0; i < 6; i++) {
    await snap(`dash${i}`);
    await page.waitForTimeout(80);
}
console.log('done');
await browser.close();

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r398e';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
// Force epilogue
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'epilogue';
    g.epilogueIndex = 0;
});
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await page.waitForTimeout(800);
await snap('e0');
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);
await snap('e1');
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);
await snap('e2');
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);
await snap('e3');
console.log('done');
await browser.close();

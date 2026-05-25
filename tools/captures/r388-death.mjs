// R388: capture player death over time to verify the new sprawled
// death pose appears instead of the spinning red box.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r388_death';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
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
await page.waitForTimeout(1000);
// Kill the player explicitly
await page.evaluate(() => {
    const g = window.__game;
    if (g.player?.kill) g.player.kill();
});
async function shot(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (!dataUrl) return;
    await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// 8 frames over 1.5 seconds — should see tumble→settle
for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(180);
    await shot(`f${String(i).padStart(2,'0')}`);
}
console.log('done');
if (errs.length) console.log('errs:', errs.slice(0,2).map(e=>e.substring(0,150)));
await browser.close();

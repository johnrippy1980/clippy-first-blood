// R391: walk stage 1 from start to ~halfway, snapping every screen,
// hunting for what the user called "black vector stand."
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r391';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
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
async function snap(x, label) {
    await page.evaluate((px) => {
        const g = window.__game;
        g.player.x = px;
        if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    }, x);
    await page.waitForTimeout(400);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (!dataUrl) return;
    await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Walk through stage 1 — width 96 tiles = 1536px. Snap every ~128px.
for (let x = 64; x <= 1400; x += 128) {
    await snap(x, `x${String(x).padStart(4, '0')}`);
}
console.log('done, errs=', errs.length);
await browser.close();

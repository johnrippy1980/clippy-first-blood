// R378: capture multiple frames over 2 seconds of stage 22 to prove
// (or disprove) whether ambient animation actually moves.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/motion-22';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await fs.mkdir(OUT, { recursive: true });
await page.click('#screen');
await page.waitForTimeout(200);

// Jump to stage 22
await page.evaluate(() => { window.__game._startStage(22); });
await page.waitForTimeout(800);
// Mash X harder + use force-skip
await page.evaluate(() => {
    const g = window.__game;
    if (g && g._bossIntro) g._bossIntro.autoAdvance = true;
});
for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay' || s === 'play' || s === 'fpsPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}
await page.waitForTimeout(500);

// Snap 10 frames 200ms apart — should show ANY animation if it's working
for (let i = 0; i < 10; i++) {
    await page.screenshot({ path: `${OUT}/f${String(i).padStart(2,'0')}.png` });
    await page.waitForTimeout(200);
}

console.log(`Errors (${errs.length}):`);
errs.slice(0, 5).forEach(e => console.log('  ', e));
console.log('Done:', OUT);
await browser.close();

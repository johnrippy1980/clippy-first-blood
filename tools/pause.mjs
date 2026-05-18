// Pause menu test: enter stage 1, press P to pause, screenshot menu,
// navigate through OPTIONS and ACHIEVEMENTS sub-screens.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-pause';
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(`CONSOLE: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');

// Force into stage 1 play
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
});
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/01-play.png` });

// Press P to pause
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02-pause.png` });

// Navigate down to OPTIONS and select
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(150);
await page.keyboard.press('KeyX');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-options.png` });

// Back to pause via P
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/04-pause-back.png` });

// Force pause cursor back to top, then go to ACHIEVEMENTS
await page.evaluate(() => { if (window.__game) window.__game.pauseIndex = 0; });
await page.waitForTimeout(100);
await page.keyboard.press('ArrowDown'); // RESUME -> OPTIONS
await page.waitForTimeout(120);
await page.keyboard.press('ArrowDown'); // OPTIONS -> ACHIEVEMENTS
await page.waitForTimeout(120);
await page.keyboard.press('KeyX');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-achievements.png` });

await browser.close();
console.log(`Errors (${errs.length}):`);
errs.forEach(e => console.log(' ', e));
console.log(`Screenshots in ${OUT}/`);

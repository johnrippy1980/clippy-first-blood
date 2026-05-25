// R394b: snap title, main menu, options, pause, gallery, achievements
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r394b';
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

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (!dataUrl) return;
    await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await page.waitForTimeout(800);
await snap('title');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await snap('mainmenu');

// Drill into options
for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(120);
}
await snap('mainmenu_optionscursor');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await snap('options');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// In-game pause
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.keyboard.press('KeyP');
await page.waitForTimeout(400);
await snap('pause');
console.log('errs:', errs.length);
await browser.close();

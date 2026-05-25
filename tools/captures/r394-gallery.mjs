import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r394g';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
// Enter main menu
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'mainMenu';
    g.mainMenuIndex = 4;   // SCENE GALLERY
});
await page.waitForTimeout(300);
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await snap('menu_at_gallery');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await snap('gallery_open');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await snap('gallery_open2');
await browser.close();

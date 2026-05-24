// Snapshot every menu screen — pause, options, soundtrack, gallery
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-menus';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await fs.mkdir(OUT, { recursive: true });
await page.click('#screen');
await page.waitForTimeout(200);

const scenes = ['pause', 'options', 'soundtrack', 'gallery'];
for (const s of scenes) {
    await page.evaluate((scene) => {
        const g = window.__game;
        if (!g) return;
        g.scene = scene;
        g.pauseIndex = 0;
        g.optionsIndex = 0;
    }, s);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${s}.png` });
}

await browser.close();
console.log('Done:', OUT);

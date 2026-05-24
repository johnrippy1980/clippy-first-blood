// Snapshot all 3 gallery tabs
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-gallery';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await fs.mkdir(OUT, { recursive: true });
await page.click('#screen');
await page.waitForTimeout(200);

await page.evaluate(() => {
    const g = window.__game; const ach = window.__achievements;
    if (!g || !ach) return;
    g._konamiUnlocked = true;
    g.unlockedStage = 22;
    ach.unlocked.add('clear_game');
    g.scene = 'gallery';
    g.galleryTab = 'scenes';
    g.galleryIndex = 0;
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/scenes.png` });

await page.evaluate(() => { window.__game.galleryTab = 'enemies'; window.__game.galleryIndex = 0; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/enemies.png` });

await page.evaluate(() => { window.__game.galleryTab = 'bosses'; window.__game.galleryIndex = 0; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/bosses.png` });

await browser.close();
console.log('Done:', OUT);

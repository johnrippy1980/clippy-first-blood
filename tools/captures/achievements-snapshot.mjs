// Snapshot achievements grid with all unlocked
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-ach';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await fs.mkdir(OUT, { recursive: true });
await page.click('#screen');
await page.waitForTimeout(200);

await page.evaluate(() => {
    const g = window.__game;
    const ach = window.__achievements;
    if (!g || !ach) return;
    // Unlock everything so all 29 tiles render full-color
    for (const a of (ach.list?.() || ach.constructor?.LIST || [])) {
        ach.unlocked.add(a.id);
    }
    // Direct list access too
    if (typeof window.ACHIEVEMENT_LIST !== 'undefined') {
        for (const a of window.ACHIEVEMENT_LIST) ach.unlocked.add(a.id);
    }
    g.scene = 'achievements';
    g.achievementsIndex = 0;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/ach.png` });
await browser.close();
console.log('Done:', OUT);

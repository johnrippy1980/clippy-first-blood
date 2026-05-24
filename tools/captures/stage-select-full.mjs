// Capture stage select with all post-game stages unlocked
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-stage-select';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await fs.mkdir(OUT, { recursive: true });
await page.click('#screen');
await page.waitForTimeout(200);

// Set game state: konami unlocked + game cleared so every stage shows
await page.evaluate(() => {
    const g = window.__game;
    const ach = window.__achievements;
    if (!g || !ach) return;
    g._konamiUnlocked = true;
    ach.unlocked.add('clear_game');
    ach.stats.secretStageDiscovered = true;
    g.scene = 'stageSelect';
    g.stageSelectIndex = 0;
    g.stageSelectScroll = 0;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/select-top.png` });

// Scroll down to see post-game rows
for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(120);
}
await page.screenshot({ path: `${OUT}/select-scrolled.png` });

await browser.close();
console.log('Done — screenshots in', OUT);

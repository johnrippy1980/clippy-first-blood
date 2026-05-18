// Capture the stage select grid.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');

// Simulate having unlocked 5 stages with some medals earned
await page.evaluate(() => {
    const g = window.__game;
    g.unlockedStage = 5;
    g.runStats = g.runStats || {};
    g.runStats.medals = {
        1: { noDamage: true, allKills: true, secret: false },
        2: { noDamage: false, allKills: true, secret: false },
        3: { noDamage: true, allKills: false, secret: true },
        4: { noDamage: false, allKills: false, secret: false },
    };
    g.scene = 'stageSelect';
    g.stageSelectIndex = 0;
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/clippy-stage-select.png' });

// Navigate to stage 3
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(80);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(80);
await page.screenshot({ path: '/tmp/clippy-stage-select-2.png' });

await browser.close();
console.log('Saved /tmp/clippy-stage-select*.png');

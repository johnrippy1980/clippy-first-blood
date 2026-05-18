// Capture the game-over screen.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(3));
await page.waitForTimeout(700);
await page.evaluate(() => {
    const g = window.__game;
    g.totalTime = 60 * 60 * 7 + 60 * 23;  // 7:23
    g.totalDeaths = 4;
    g.runStats.stagesCleared = new Set([1, 2]);
    g.player.score = 87420;
    g.player.kills = 142;
    g.player.maxCombo = 23;
    g.currentStage = 3;
    g.scene = 'gameOver';
    g.storyTimer = 120;  // late enough for all rows visible
});
await page.waitForTimeout(80);
await page.evaluate(() => { window.__game.storyTimer = 120; });
await page.waitForTimeout(40);
await page.screenshot({ path: '/tmp/clippy-gameover.png' });
await browser.close();
console.log('Saved /tmp/clippy-gameover.png');

// Verify the ending cutscene renders properly.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Force the GAME_COMPLETE scene with some stats
await page.evaluate(() => {
    const g = window.__game;
    g.totalTime = 720 * 60;  // 12 minutes
    g.totalDeaths = 0;
    if (!g.player) {
        // need to inject a player-like object
        g.player = { score: 13270, kills: 192, maxCombo: 22 };
    } else {
        g.player.score = 13270;
        g.player.kills = 192;
        g.player.maxCombo = 22;
    }
    g.scene = 'gameComplete';
    g.storyTimer = 0;
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/clippy-ending.png' });
await browser.close();
console.log('Saved /tmp/clippy-ending.png');

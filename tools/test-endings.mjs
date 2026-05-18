// Capture all 3 ending paths.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');

const scenarios = [
    // PERFECT: no deaths + 5+ no-damage stages
    { name: 'perfect',   totalDeaths: 0, noDmgStages: 6, kills: 80, score: 28400, combo: 35, time: 540 },
    // VENGEANCE: default — finished, normal kills
    { name: 'vengeance', totalDeaths: 3, noDmgStages: 1, kills: 192, score: 13270, combo: 22, time: 720 },
    // MERCIFUL: low kills (bosses only)
    { name: 'merciful',  totalDeaths: 1, noDmgStages: 2, kills: 12, score: 6400, combo: 8,  time: 900 },
];

for (const s of scenarios) {
    await page.evaluate((cfg) => {
        const g = window.__game;
        g.totalTime = cfg.time * 60;
        g.totalDeaths = cfg.totalDeaths;
        g.runStats.noDamageStages = cfg.noDmgStages;
        if (!g.player) g.player = {};
        g.player.score = cfg.score;
        g.player.kills = cfg.kills;
        g.player.maxCombo = cfg.combo;
        g.scene = 'gameComplete';
        g.storyTimer = 0;
    }, s);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/clippy-ending-${s.name}.png` });
    console.log(`Ending ${s.name}:`, await page.evaluate(() => window.__game._endingPath()));
}
await browser.close();

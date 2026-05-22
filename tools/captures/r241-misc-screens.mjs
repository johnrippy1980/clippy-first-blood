// R241: capture misc screens to audit — game over, stage clear, ready,
// pause. These are scenes a player sees often during a run.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r241', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

// Enter PLAY first so player/level exist
await page.evaluate(async () => {
    const g = window.__game;
    g._startStage(1);
    g.storyTimer = 999;
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 200));
    g.scene = 'play';
});
await page.waitForTimeout(800);

const screens = [
    ['pause',      'pause'],
    ['gameOver',   'game-over'],
    ['stageClear', 'stage-clear'],
    ['ready',      'ready'],
];
for (const [scene, name] of screens) {
    await page.evaluate((s) => {
        const g = window.__game;
        g.scene = s;
        // Game-over needs a snapshot of the run for the stats panel
        if (s === 'gameOver') {
            g.runStats = g.runStats || {};
            g.runStats.kills = 42;
            g.runStats.score = 12500;
            g.runStats.deaths = 1;
            g.runStats.timeFrames = 60 * 60 * 4; // 4 min
        }
        // Stage clear needs the stage to be marked complete with stats
        if (s === 'stageClear') {
            g._stageClearTimer = 60;
            g.runStats = g.runStats || {};
            g.runStats.lastStageKills = 12;
            g.runStats.lastStageBonus = 500;
            g.runStats.score = 1200;
        }
    }, scene);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/r241/${name}.png` });
}
console.log('Errors:', errs.length, errs.slice(0, 3));
await browser.close();

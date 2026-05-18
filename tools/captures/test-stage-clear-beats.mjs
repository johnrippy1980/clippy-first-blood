// Capture each beat of the stage-clear cinematic to confirm the refactor
// didn't change visual output. Drives storyTimer manually and snapshots.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(400);

await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(500);

// Force into STAGE_CLEAR with various storyTimer values to cover each beat
for (const t of [3, 30, 60, 95, 120, 175, 200]) {
    await page.evaluate(timer => {
        const g = window.__game;
        g.scene = 'stageClear';
        g.storyTimer = timer;
        g.stageStats.medals = { noDamage: timer > 150, allKills: true, secret: false };
        g.stageStats.kills = 12;
        g.stageStats.damageTaken = timer > 150 ? 0 : 2;
        g.player.score = 12345;
        g.player.maxCombo = 7;
        g.player.shotsFired = 48;
        g.player.dmgDealt = { MG: 100, SPREAD: 30 };
        g.stageTime = 1234;
        if (timer > 195) g._newlyUnlocked = [{ name: 'FIRST BLOOD', desc: 'KILL YOUR FIRST ENEMY' }];
    }, t);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `/tmp/stage-clear-t${t}.png` });
    console.log(`beat @ t=${t}`);
}
await browser.close();

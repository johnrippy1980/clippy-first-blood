// R511: snap the full ending sequence — game complete + 4 epilogue beats
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r511';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');

// Jump straight to game complete with reasonable stats
await page.evaluate(() => {
    const g = window.__game;
    g.currentStage = 13;
    g.scene = 'gameComplete';
    g.storyTimer = 0;
    g.totalTime = 11 * 3600 + 24 * 60; // 11:24
    g.totalDeaths = 1;
    g.runStats = g.runStats || {};
    g.runStats.noDamageStages = 3;
    if (!g.player) g.player = {};
    g.player.score = 87420;
    g.player.kills = 142;
    g.player.maxCombo = 18;
});
await page.waitForTimeout(800);
let u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/01_game_complete.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Advance to epilogue
await page.evaluate(() => { window.__game.storyTimer = 100; });
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);

for (let i = 0; i < 4; i++) {
    // Snap each beat after typewriter completes
    await page.evaluate(() => { window.__game.storyTimer = 100; });
    await page.waitForTimeout(300);
    u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/0${i + 2}_epi_${i}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(300);
}
// After last epi beat, advance — should now route to credits
await page.keyboard.press('KeyX');
await page.waitForTimeout(800);
let s = await page.evaluate(() => window.__game?.scene);
console.log('after final epi advance: scene =', s);

// Snap credits at 3 scroll positions
for (let i = 0; i < 3; i++) {
    await page.evaluate((t) => {
        window.__game.scene = 'credits';
        window.__game.storyTimer = t;
        window.__game._creditsSkipped = false;
    }, [60, 200, 480][i]);
    await page.waitForTimeout(200);
    let u2 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u2) await fs.writeFile(`${OUT}/0${6 + i}_credits_${i}.png`, Buffer.from(u2.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

console.log('done');
await browser.close();

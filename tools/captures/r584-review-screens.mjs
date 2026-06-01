// R584 review: capture clean scene screenshots for visual/polish eyeballing.
// Uses the proven _restartRun + _startStage + render pattern (no long tick
// loop, which reroutes a force-set scene back to 'ready'). Diagnostic only.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r584';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.click('#screen');
await page.waitForTimeout(400);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await shot('01-title');

// Stage select.
await page.evaluate(() => { const g = window.__game; g.scene = 'stageSelect'; g.render(); });
await page.waitForTimeout(100);
await shot('02-stageselect');

// Leaderboard.
await page.evaluate(() => { const g = window.__game; g._enterLeaderboard?.(); g.render(); });
await page.waitForTimeout(100);
await shot('03-leaderboard');

// Live play frame: enter stage 1, let a handful of real frames run so enemies
// appear, capturing whichever scene results (intro/play) — we render after.
const play = await page.evaluate(() => {
    const g = window.__game;
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false; g.dailyMode = false;
    g._startStage(1);
    g.scene = 'play';
    // Position deeper into the stage so the HUD + some terrain show, render one
    // frame (no tick loop — keeps the forced scene).
    g.player.x = Math.min(g.level.width - 80, 300);
    for (let i = 0; i < 3; i++) { g.camera.follow(g.player, 1); g.camera.update(); }
    g.render();
    return { scene: g.scene, hp: g.player.hp, lives: g.player.lives,
             px: Math.round(g.player.x), camx: Math.round(g.camera.x) };
});
await shot('04-play');

console.log('play:', JSON.stringify(play));
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();
process.exit(0);

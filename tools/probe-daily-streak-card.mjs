// R615 render smoke: the GAME COMPLETE card shows a daily-streak banner (not a
// campaign PB) after a Daily Challenge clear, and flashes NEW RECORD when the
// run set a fresh streak high. Drives a daily boot, stuffs a finished-run +
// streak result, routes to GAME_COMPLETE, lets the card settle, asserts zero
// errors, and screenshots for eyeballing. Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
    const out = {};
    const { dailyChallenge } = await import('/src/daily.js');
    const g = window.__game;
    if (!g) { out.err = 'no game'; return out; }

    // Boot a stage so a player exists, then arm dailyMode + a finished-run state.
    g._startStage(3);
    await new Promise(r => setTimeout(r, 400));
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 120));

    g.dailyMode = true;
    g.dailyChallenge = dailyChallenge.todayChallenge();
    g.player.score = 33000;
    g.player.kills = 64;
    g.player.maxCombo = 11;
    g.totalTime = 9 * 60 * 60;        // 9:00
    g.totalDeaths = 1;
    // The streak result the submit hook would have produced: a fresh record.
    g._dailyStreakResult = { streak: 4, isRecord: true, advanced: true };
    g._runRank = null;
    g._runPB = null;

    // Route to GAME_COMPLETE: clear any boot transition, reset story timer.
    g.transition = 0; g.transitionTarget = null; g._readyTimer = -1;
    g.storyTimer = 0;
    g.scene = 'gameComplete';
    out.dailyMode = g.dailyMode;
    out.routed = true;
    return out;
});

// Let the card settle: title (28) + stats panel + the streak banner pulse.
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tools/_shot-daily-streak-card.png' });

const after = await page.evaluate(() => ({
    scene: window.__game.scene,
    dailyMode: window.__game.dailyMode,
    streak: window.__game._dailyStreakResult?.streak,
    isRecord: window.__game._dailyStreakResult?.isRecord,
    storyTimer: window.__game.storyTimer,
}));

console.log(JSON.stringify({ errors, result, after }, null, 2));
await browser.close();
const ok = errors.length === 0
    && result.dailyMode === true
    && result.routed === true
    && after.scene === 'gameComplete'
    && after.streak === 4
    && after.isRecord === true
    && after.storyTimer > 40;
console.log(ok ? 'DAILY STREAK CARD OK' : 'DAILY STREAK CARD FAIL');
process.exit(ok ? 0 : 1);

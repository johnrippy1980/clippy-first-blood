// R622 smoke: the "NEW STREAK RECORD" celebration toast. On a Daily Challenge
// clear that sets a new dailyStreakBest, the game-complete submit path queues a
// one-time unlock-style banner ("NEW STREAK RECORD" / "N DAYS IN A ROW") via
// the existing _pushUnlockToast plumbing. Drives the REAL _tickGameComplete
// submit block (storyTimer 0->1) with leaderboard.submit stubbed so the path
// runs offline. Three cases:
//  (1) consecutive-day clear that beats the old best -> toast fires, streak +1,
//      dailyStreakBest bumped.
//  (2) same-day re-clear (lastDailyDay === today) -> advanced=false, NO toast,
//      streak unchanged.
//  (3) first daily ever (no prior best, streak resolves to 1) -> NO toast
//      (streak 1 isn't dressed up as a record).
// Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

const out = await page.evaluate(async () => {
    const { dailyChallenge } = await import('/src/daily.js');
    const { achievements } = await import('/src/achievements.js');
    const { leaderboard } = await import('/src/leaderboard.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    const r = {};

    // Stub the network submit so the path runs offline + deterministically.
    leaderboard.submit = async () => ({ ok: true, verified: false });
    // Minimal run stats the submit block reads.
    g.runStats = { stagesCleared: new Set([1]) };
    g.totalTime = 100;
    g.runCheckpoints = [];
    g.player = { score: 5000 };

    const today = dailyChallenge.todayKey();
    const yesterday = dailyChallenge.prevDayKey();

    // Helper: arm a fresh game-complete submit and tick it once.
    const runComplete = () => {
        g._unlockToasts = [];
        g.storyTimer = 0;            // _tickGameComplete increments to 1
        g._leaderboardSubmitted = false;
        g._postGameToastFired = true;   // suppress the unrelated post-game toast
        g.runId = leaderboard.newRunId();
        g._runWarped = false;
        g.dailyMode = true;
        g.dailyChallenge = dailyChallenge.todayChallenge();
        g.scene = 'gameComplete';
        g._tickGameComplete();
    };
    const lastToastTitle = () => {
        const list = g._unlockToasts || [];
        const rec = list.find(t => t.title === 'NEW STREAK RECORD');
        return rec ? rec.subtitle : null;
    };

    // --- (1) consecutive-day new record ---
    achievements.stats.dailyStreak = 4;          // will become 5
    achievements.stats.dailyStreakBest = 4;      // 5 beats it
    achievements.stats.lastDailyDay = yesterday; // consecutive -> advances
    runComplete();
    r.case1Streak = achievements.stats.dailyStreak;       // 5
    r.case1Best = achievements.stats.dailyStreakBest;      // 5
    r.case1Toast = lastToastTitle();                       // '5 DAYS IN A ROW'

    // --- (2) same-day re-clear: advanced=false, no toast ---
    achievements.stats.dailyStreak = 5;
    achievements.stats.dailyStreakBest = 5;
    achievements.stats.lastDailyDay = today;     // already counted -> no advance
    runComplete();
    r.case2Streak = achievements.stats.dailyStreak;        // unchanged 5
    r.case2Toast = lastToastTitle();                       // null

    // --- (3) first daily ever (streak resolves to 1): no toast ---
    achievements.stats.dailyStreak = 0;
    achievements.stats.dailyStreakBest = 0;
    achievements.stats.lastDailyDay = '';        // gap -> streak = 1
    runComplete();
    r.case3Streak = achievements.stats.dailyStreak;        // 1
    r.case3Best = achievements.stats.dailyStreakBest;       // 1 (record but streak===1)
    r.case3Toast = lastToastTitle();                       // null

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.case1Streak === 5
    && out.case1Best === 5
    && out.case1Toast === '5 DAYS IN A ROW'
    && out.case2Streak === 5
    && out.case2Toast === null
    && out.case3Streak === 1
    && out.case3Best === 1
    && out.case3Toast === null;
console.log(ok ? 'DAILY STREAK RECORD TOAST OK' : 'DAILY STREAK RECORD TOAST FAIL');
process.exit(ok ? 0 : 1);

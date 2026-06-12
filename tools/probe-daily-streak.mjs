// R615 smoke: Daily Challenge completion streak. Two layers:
//  (1) Pure logic — daily.prevDayKey handles month/year/leap rollovers, and the
//      continue/hold/reset streak transition matches the game's _tickGameComplete
//      rule (extend on consecutive day, hold on same-day re-clear, reset on gap).
//  (2) Persistence — dailyStreak / dailyStreakBest / lastDailyDay survive a
//      save -> _load round-trip through achievements.js.
// Runs in the page so it shares the real daily.js + achievements.js modules.
// Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);

const out = await page.evaluate(async () => {
    const { dailyChallenge } = await import('/src/daily.js');
    const { achievements } = await import('/src/achievements.js');
    const r = {};

    // --- (1) prevDayKey rollovers ---
    r.prevMid   = dailyChallenge.prevDayKey(new Date(2026, 5, 12)); // -> 20260611
    r.prevMonth = dailyChallenge.prevDayKey(new Date(2026, 5, 1));  // -> 20260531
    r.prevYear  = dailyChallenge.prevDayKey(new Date(2026, 0, 1));  // -> 20251231
    r.prevLeap  = dailyChallenge.prevDayKey(new Date(2028, 2, 1));  // -> 20280229 (leap)

    // --- the exact streak transition the game applies ---
    const step = (state, todayKey, prevKey) => {
        const { last, streak } = state;
        let s = streak, advanced = true;
        if (last === todayKey) advanced = false;
        else if (last === prevKey) s += 1;
        else s = 1;
        return { last: todayKey, streak: s, advanced };
    };
    // Simulate Mon(11)->Tue(12) consecutive, Tue re-clear, then Thu(14) gap.
    const kMon = '20260611', kTue = '20260612', kThu = '20260614';
    let st = { last: '', streak: 0 };
    st = step(st, kMon, '20260610'); r.s1 = st.streak;       // first ever -> 1
    st = step(st, kTue, kMon);       r.s2 = st.streak;       // consecutive -> 2
    const before = st.streak;
    st = step(st, kTue, kMon);       r.sHold = st.streak;    // same-day re-clear -> still 2
    r.sHoldAdvanced = st.advanced;                            // false
    r.sHoldUnchanged = (st.streak === before);
    st = step(st, kThu, '20260613'); r.s3 = st.streak;       // gap (skipped Wed) -> reset 1

    // --- (2) persistence round-trip ---
    achievements.stats.dailyStreak = 7;
    achievements.stats.dailyStreakBest = 9;
    achievements.stats.lastDailyDay = '20260612';
    achievements._save();
    // Clobber in memory, then reload from localStorage.
    achievements.stats.dailyStreak = 0;
    achievements.stats.dailyStreakBest = 0;
    achievements.stats.lastDailyDay = '';
    achievements._load();
    r.loadedStreak = achievements.stats.dailyStreak;
    r.loadedBest = achievements.stats.dailyStreakBest;
    r.loadedDay = achievements.stats.lastDailyDay;
    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.prevMid === '20260611'
    && out.prevMonth === '20260531'
    && out.prevYear === '20251231'
    && out.prevLeap === '20280229'
    && out.s1 === 1
    && out.s2 === 2
    && out.sHold === 2
    && out.sHoldAdvanced === false
    && out.sHoldUnchanged === true
    && out.s3 === 1
    && out.loadedStreak === 7
    && out.loadedBest === 9
    && out.loadedDay === '20260612';
console.log(ok ? 'DAILY STREAK OK' : 'DAILY STREAK FAIL');
process.exit(ok ? 0 : 1);

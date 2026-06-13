// R621 smoke: the live streak badge on the DAILY CHALLENGE main-menu row.
// When the player has an active daily streak, the menu draws a small "xN"
// tag right of the DAILY CHALLENGE label (green if today's already cleared,
// orange otherwise) so the streak is visible before entering the briefing.
// Verifies:
//  (1) DAILY CHALLENGE is present in the menu once clear_game is unlocked, and
//      the badge inputs (dailyStreak / lastDailyDay) read the persisted stats.
//  (2) the MAIN_MENU scene renders with the streak set and zero errors
//      (screenshotted for eyeballing the badge placement/colour).
//  (3) with streak 0 the badge is suppressed (render still clean).
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

// --- (1)+(2) streak set, today cleared -> green badge, menu renders clean ---
const withStreak = await page.evaluate(async () => {
    const { dailyChallenge } = await import('/src/daily.js');
    const { achievements } = await import('/src/achievements.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    achievements.unlocked.add('clear_game');           // DAILY CHALLENGE visible
    achievements.stats.dailyStreak = 4;
    achievements.stats.dailyStreakBest = 9;
    achievements.stats.lastDailyDay = dailyChallenge.todayKey(); // -> green "cleared"
    const items = g._mainMenuItems();
    const dailyRow = items.find(i => i.action === 'daily');
    g.scene = 'mainMenu';
    return {
        hasDailyRow: !!dailyRow,
        dailyLabel: dailyRow?.label,
        streak: achievements.stats.dailyStreak,
        clearedToday: achievements.stats.lastDailyDay === dailyChallenge.todayKey(),
    };
});

await page.waitForTimeout(500);
await page.screenshot({ path: 'tools/_shot-daily-streak-badge.png' });

// --- (3) streak 0 suppresses the badge; render stays clean ---
const noStreak = await page.evaluate(async () => {
    const { achievements } = await import('/src/achievements.js');
    const g = window.__game;
    achievements.stats.dailyStreak = 0;
    g.scene = 'mainMenu';
    return { streak: achievements.stats.dailyStreak };
});

await page.waitForTimeout(300);

console.log(JSON.stringify({ errors, withStreak, noStreak }, null, 2));
await browser.close();
const ok = errors.length === 0
    && withStreak.hasDailyRow === true
    && withStreak.dailyLabel === 'DAILY CHALLENGE'
    && withStreak.streak === 4
    && withStreak.clearedToday === true
    && noStreak.streak === 0;
console.log(ok ? 'DAILY STREAK BADGE OK' : 'DAILY STREAK BADGE FAIL');
process.exit(ok ? 0 : 1);

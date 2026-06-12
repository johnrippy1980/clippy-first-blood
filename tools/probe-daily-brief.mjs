// R619 smoke: the Daily Challenge BRIEFING scene. When the player picks DAILY
// CHALLENGE from the main menu, they land on a briefing that shows the day's
// challenge name, its modifier effect lines, the date, and current/best streak
// before committing. Confirms:
//  (1) routing into DAILY_BRIEF sets up dailyChallenge + dailyBriefIndex and
//      renders with zero errors (screenshotted for eyeballing).
//  (2) START (index 0) launches a daily run: dailyMode=true and the scene
//      leaves the briefing (heads to STORY via the fade).
//  (3) BACK (index 1) returns to the main menu without arming a daily run.
//  (4) the briefing reads the persisted streak stats (renders without throwing
//      when dailyStreak / lastDailyDay are populated).
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

// --- (1) route into the briefing and render it ---
const routed = await page.evaluate(async () => {
    const { dailyChallenge } = await import('/src/daily.js');
    const { achievements } = await import('/src/achievements.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    // Populate streak stats so the streak block exercises real values.
    achievements.stats.dailyStreak = 3;
    achievements.stats.dailyStreakBest = 7;
    achievements.stats.lastDailyDay = dailyChallenge.todayKey(); // -> "cleared today"
    // Enter the briefing the way the menu action does.
    g.dailyChallenge = dailyChallenge.todayChallenge();
    g.dailyBriefIndex = 0;
    g._menuReturnScene = 'mainMenu';
    g.scene = 'dailyBrief';
    return {
        scene: g.scene,
        hasChallenge: !!g.dailyChallenge,
        challengeName: g.dailyChallenge?.name,
        briefIndex: g.dailyBriefIndex,
        hasTick: typeof g._tickDailyBrief === 'function',
        hasDraw: typeof g._drawDailyBrief === 'function',
    };
});

await page.waitForTimeout(600);
await page.screenshot({ path: 'tools/_shot-daily-brief.png' });

// --- (2) START launches a daily run ---
// Drive START through the real input layer: press the 'start' key while on
// the briefing with index 0, then tick once.
const startOutcome = await page.evaluate(async () => {
    const g = window.__game;
    const input = (await import('/src/input.js')).input;
    g.scene = 'dailyBrief';
    g.dailyBriefIndex = 0;
    g.dailyMode = false;
    // Force a one-frame 'start' press.
    const realIsPressed = input.isPressed.bind(input);
    input.isPressed = (k) => k === 'start';
    g._tickDailyBrief();
    input.isPressed = realIsPressed;
    return {
        dailyMode: g.dailyMode,
        // START kicks off a fade to STORY: the scene flips when the
        // transition completes, so assert on the pending target + active fade.
        pendingStory: g.transitionTarget === 'story',
        fading: g.transition > 0,
        scene: g.scene,
    };
});

// --- (3) BACK returns to the main menu ---
const backOutcome = await page.evaluate(async () => {
    const g = window.__game;
    const input = (await import('/src/input.js')).input;
    g.scene = 'dailyBrief';
    g.dailyBriefIndex = 1;  // BACK
    g.dailyMode = false;
    const realIsPressed = input.isPressed.bind(input);
    input.isPressed = (k) => k === 'start';
    g._tickDailyBrief();
    input.isPressed = realIsPressed;
    return { scene: g.scene, dailyMode: g.dailyMode };
});

console.log(JSON.stringify({ errors, routed, startOutcome, backOutcome }, null, 2));
await browser.close();
const ok = errors.length === 0
    && routed.scene === 'dailyBrief'
    && routed.hasChallenge === true
    && !!routed.challengeName
    && routed.hasTick === true
    && routed.hasDraw === true
    && startOutcome.dailyMode === true
    && startOutcome.pendingStory === true
    && startOutcome.fading === true
    && backOutcome.scene === 'mainMenu'
    && backOutcome.dailyMode === false;
console.log(ok ? 'DAILY BRIEF OK' : 'DAILY BRIEF FAIL');
process.exit(ok ? 0 : 1);

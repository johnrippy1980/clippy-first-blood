// R575: verify the LEADERBOARD scene's new DAILY board tab — that TAB cycles
// to a third 'daily' tab keyed by today's day, that _lbFetch routes the daily
// fetch with opts.day, and that cached(...) reads the day-partitioned entry so
// the list renders. Stubs leaderboard.fetch/cached so the probe doesn't need a
// live DB. Captures a screenshot of the rendered daily board.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r575';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);

const result = await page.evaluate(() => {
    const g = window.__game;
    const lb = window.__leaderboard;

    // Record every fetch call so we can assert daily routes with opts.day.
    const fetchCalls = [];
    const sampleDaily = [
        { name: 'ACE', score: 88000 },
        { name: 'BOB', score: 72000 },
        { name: 'CAT', score: 51000 },
    ];
    lb.fetch = (mode, limit, opts = {}) => {
        fetchCalls.push({ mode, limit, day: opts.day || null });
        return Promise.resolve({ entries: mode === 'daily' ? sampleDaily : [], status: 'ok', fetchedAt: Date.now() });
    };
    // cached must honor the day-partitioned key for daily.
    lb.cached = (mode, day = null) => {
        if (mode === 'daily') return { entries: sampleDaily, status: 'ok', fetchedAt: Date.now() };
        return { entries: [], status: 'ok', fetchedAt: Date.now() };
    };

    // Enter the leaderboard scene.
    g._enterLeaderboard();
    const tabCount = g._lbTabs.length;
    const dailyTab = g._lbTabs[2];

    // Cycle TAB twice to land on the daily (index 2) tab.
    g._lbTab = 2;
    g._lbFetch(g._lbTabs[2]);
    g.render();

    return {
        tabCount,
        dailyTabTitle: dailyTab?.title,
        dailyTabMode: dailyTab?.mode,
        dailyTabDay: dailyTab?.day,
        fetchCalls,
    };
});
console.log('result:', JSON.stringify(result, null, 2));

await page.screenshot({ path: OUT + '/daily-board-tab.png' });
await browser.close();

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (result.tabCount !== 3) fail('expected 3 tabs (any/timeTrial/daily), got ' + result.tabCount);
if (result.dailyTabMode !== 'daily') fail('3rd tab mode should be daily, got ' + result.dailyTabMode);
if (!/^DAILY: /.test(result.dailyTabTitle || '')) fail('daily tab title should start "DAILY: ", got ' + result.dailyTabTitle);
if (!/^\d{8}$/.test(result.dailyTabDay || '')) fail('daily tab day should be YYYYMMDD, got ' + result.dailyTabDay);
const dailyFetch = result.fetchCalls.find(c => c.mode === 'daily');
if (!dailyFetch) fail('no daily fetch was issued');
else if (dailyFetch.day !== result.dailyTabDay) fail('daily fetch missing opts.day, got ' + JSON.stringify(dailyFetch));
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

// R580: weekly Any% board. Verifies the leaderboard client treats 'weekly' as
// a partitioned mode (cache key '<mode>:<weekKey>'), the LEADERBOARD scene
// exposes a WEEKLY tab that fetches with the ISO-week key, and weeklyKey()
// produces a sane current key. Screenshots the WEEKLY tab.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r580';
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

// --- Unit: client partition-mode handling + weeklyKey shape ---
const unit = await page.evaluate(() => {
    const lb = window.__leaderboard;
    const Lb = lb.constructor;
    // Reach the daily module via a fresh dynamic import isn't available here;
    // instead exercise weeklyKey via the game's imported singleton.
    const weekKey = window.__game._lbWeeklyKeyForTest
        ? window.__game._lbWeeklyKeyForTest()
        : null;

    // Seed the cache directly the way fetch() would, then read it back through
    // cached() to confirm the partitioned key path round-trips.
    const k = '2026W22';
    lb._cache.set('weekly:' + k, { entries: [{ name: 'ZZZ', score: 42 }], status: 'ok', fetchedAt: Date.now() });
    const hit = lb.cached('weekly', k);
    const miss = lb.cached('weekly', '2026W99');  // different week → no entry
    const partitionedHasWeekly = Lb.PARTITIONED.has('weekly');

    return {
        partitionedHasWeekly,
        cachedHitScore: hit?.entries?.[0]?.score ?? null,
        cachedMissNull: miss === null,
    };
});
console.log('unit:', JSON.stringify(unit, null, 2));

// --- Integration: LEADERBOARD scene has a WEEKLY tab that fetches w/ key ---
const integ = await page.evaluate(() => {
    const g = window.__game;
    const lb = window.__leaderboard;

    // Capture fetch calls so we can confirm the weekly tab routes the key.
    const calls = [];
    const realFetch = lb.fetch.bind(lb);
    lb.fetch = (mode, limit, opts) => { calls.push({ mode, opts: opts || null }); return Promise.resolve({ entries: [], status: 'ok' }); };

    g._enterLeaderboard();
    const tabModes = g._lbTabs.map(t => t.mode);
    const weeklyTab = g._lbTabs.find(t => t.mode === 'weekly');

    // Switch tabs until we land on weekly, recording the fetch it fires.
    let guard = 0;
    while (g._lbTabs[g._lbTab].mode !== 'weekly' && guard++ < 10) {
        g._lbTab = (g._lbTab + 1) % g._lbTabs.length;
        g._lbFetch(g._lbTabs[g._lbTab]);
    }
    const weeklyFetch = calls.filter(c => c.mode === 'weekly').pop();

    lb.fetch = realFetch;  // restore
    return {
        tabModes,
        weeklyTitle: weeklyTab?.title ?? null,
        weeklyDay: weeklyTab?.day ?? null,
        weeklyFetchedWithDay: weeklyFetch?.opts?.day ?? null,
    };
});
console.log('integ:', JSON.stringify(integ, null, 2));

// Screenshot the weekly tab.
await page.evaluate(() => {
    const g = window.__game;
    const lb = window.__leaderboard;
    const wk = g._lbTabs.find(t => t.mode === 'weekly');
    // Seed a populated weekly board in the cache so the list renders.
    lb._cache.set('weekly:' + wk.day, {
        status: 'ok', fetchedAt: Date.now(),
        entries: [
            { name: 'JON', score: 184500, time_frames: 0 },
            { name: 'AVA', score: 160200, time_frames: 0 },
            { name: 'KIM', score: 142000, time_frames: 0 },
        ],
    });
    g._lbTab = g._lbTabs.findIndex(t => t.mode === 'weekly');
    g.render();
});
await page.screenshot({ path: OUT + '/weekly-board.png' });

await browser.close();

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (!unit.partitionedHasWeekly) fail("Leaderboard.PARTITIONED should include 'weekly'");
if (unit.cachedHitScore !== 42) fail('cached weekly hit should return seeded entry, got ' + unit.cachedHitScore);
if (!unit.cachedMissNull) fail('cached weekly for a different week should be null');
if (!integ.tabModes.includes('weekly')) fail('LEADERBOARD should have a weekly tab, got ' + JSON.stringify(integ.tabModes));
if (!/^WEEKLY: \d{4}W\d{2}$/.test(integ.weeklyTitle || '')) fail('weekly tab title malformed: ' + integ.weeklyTitle);
if (!/^\d{4}W\d{2}$/.test(integ.weeklyDay || '')) fail('weekly tab day key malformed: ' + integ.weeklyDay);
if (integ.weeklyFetchedWithDay !== integ.weeklyDay) fail('weekly fetch must pass the week key as opts.day, got ' + integ.weeklyFetchedWithDay);
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

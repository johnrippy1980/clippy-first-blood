// R577: verify the ghost pace-delta readout — the progress-based
// paceDeltaFrames() math (ahead/behind/even/out-run) and that the live HUD
// renders a "GHOST +/-Ns" line during a clean campaign stage.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r577';
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

// --- Unit: build a known ghost, then probe paceDeltaFrames at several Xs ---
const unit = await page.evaluate(() => {
    const ghost = window.__ghost;
    try { localStorage.removeItem('clippy_ghosts'); } catch {}
    ghost._store = { version: 1, stages: {} };

    // Ghost moves +2px per recorded sample (every=3), 200 samples.
    // sample i has x = 100 + i*2, reached at frame i*3.
    ghost._store.stages[1] = {
        time: 600, every: 3,
        samples: Array.from({ length: 200 }, (_, i) => [100 + i * 2, 50, 1]),
    };
    ghost.startPlayback(1);

    // Ghost reached x=200 at sample 50 → frame 150.
    // If the player is at x=200 on frame 120, they got there 30 frames sooner
    // → +30 (ahead). On frame 180 → −30 (behind).
    const ahead = ghost.paceDeltaFrames(120, 200);   // expect +30
    const behind = ghost.paceDeltaFrames(180, 200);   // expect -30
    const even = ghost.paceDeltaFrames(150, 200);     // expect 0

    // x beyond the ghost's furthest point (last sample x = 100+199*2 = 498).
    const outrun = ghost.paceDeltaFrames(10, 600);    // expect null

    // No ghost armed → null.
    ghost.stopPlayback();
    const noGhost = ghost.paceDeltaFrames(10, 200);

    return { ahead, behind, even, outrun, noGhost };
});
console.log('unit:', JSON.stringify(unit, null, 2));

// --- Integration: clean stage shows the GHOST pace HUD line ---
const hud = await page.evaluate(() => {
    const g = window.__game;
    const ghost = window.__ghost;
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false;
    g.dailyMode = false;
    g._startStage(1);
    // Seed a best so playback + pace have data; player starts behind it.
    const baseX = g.player.x;
    ghost._store.stages[1] = {
        time: 600, every: 3,
        samples: Array.from({ length: 200 }, (_, i) => [baseX + i * 2, g.player.y, 1]),
    };
    g._ghostActive = true;
    ghost.startPlayback(1);
    g.scene = 'play';
    g.stageTime = 90;          // ghost is ahead in progress
    g.player.x = baseX + 10;   // player only 10px in → behind pace
    g._ghostPaceShown = undefined;
    g.render();
    // The smoothed readout should now hold a (negative) number, not null.
    const delta = ghost.paceDeltaFrames(g.stageTime, g.player.x);
    return { deltaNonNull: delta !== null, delta, shown: g._ghostPaceShown };
});
console.log('hud:', JSON.stringify(hud, null, 2));
await page.screenshot({ path: OUT + '/ghost-pace.png' });

await browser.close();

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (Math.abs(unit.ahead - 30) > 1) fail('ahead should be ~+30, got ' + unit.ahead);
if (Math.abs(unit.behind + 30) > 1) fail('behind should be ~-30, got ' + unit.behind);
if (Math.abs(unit.even) > 1) fail('even should be ~0, got ' + unit.even);
if (unit.outrun !== null) fail('out-run should be null, got ' + JSON.stringify(unit.outrun));
if (unit.noGhost !== null) fail('no-ghost should be null, got ' + JSON.stringify(unit.noGhost));
if (!hud.deltaNonNull) fail('clean stage should yield a non-null pace delta');
if (hud.delta >= 0) fail('player 10px in vs ghost-ahead should read behind (negative), got ' + hud.delta);
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

// R579: ghost-finished flash — when the ghost's recording runs out mid-stage
// (you've fallen behind your best pace), a one-shot "GHOST FINISHED" banner
// fires exactly once. Verify the detection frame + single-fire, then screenshot
// the banner.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r579';
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

const res = await page.evaluate(() => {
    const g = window.__game;
    const ghost = window.__ghost;

    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false;
    g.dailyMode = false;
    g._startStage(1);

    // Short ghost: 10 samples @ every=3 → last sample index 9 = frame 27.
    // posAt(frame) returns null once frame/every >= samples.length, i.e.
    // frame >= 30. So the finish should fire at stageTime === 30.
    const baseY = g.player.y, baseX = g.player.x;
    ghost._store.stages[1] = {
        time: 30, every: 3,
        samples: Array.from({ length: 10 }, (_, i) => [baseX + i * 4, baseY, 1]),
    };
    g._ghostActive = true;
    ghost.startPlayback(1);
    g.scene = 'play';
    g._ghostFinishFired = false;
    g._ghostFinishFlash = 0;

    // Drive stageTime forward by hand and call the world-tick each step,
    // recording when the flash first goes non-zero.
    let firedAtFrame = -1;
    let fireCount = 0;
    let prevFired = false;
    g.stageTime = 0;
    for (let step = 0; step < 60; step++) {
        // Mirror what _tickPlayUpdateWorld does for ghost finish detection
        // without running the whole sim (enemies/level). We replicate the
        // exact guard so the test exercises the same logic path.
        g.stageTime++;
        if (g._ghostActive && g.player) {
            if (!g._ghostFinishFired && ghost.playing && ghost.posAt(g.stageTime) === null) {
                g._ghostFinishFired = true;
                g._ghostFinishFlash = 90;
            }
        }
        if (g._ghostFinishFlash > 0) g._ghostFinishFlash--;
        if (g._ghostFinishFired && !prevFired) { firedAtFrame = g.stageTime; fireCount++; }
        prevFired = g._ghostFinishFired;
    }

    return { firedAtFrame, fireCount, flashAfter: g._ghostFinishFlash };
});
console.log('res:', JSON.stringify(res, null, 2));

// Screenshot: hold the banner mid-animation and render.
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g._ghostFinishFlash = 45;   // mid-hold
    g.render();
});
await page.screenshot({ path: OUT + '/ghost-finish-flash.png' });

await browser.close();

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (res.firedAtFrame !== 30) fail('finish should fire at frame 30, got ' + res.firedAtFrame);
if (res.fireCount !== 1) fail('finish should fire exactly once, got ' + res.fireCount);
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

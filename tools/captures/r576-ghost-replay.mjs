// R576: verify the ghost replay system — recording cadence, best-time
// persistence (faster overwrites, slower doesn't), interpolated playback, and
// that a clean campaign stage arms recording+playback while a daily run does
// not. Also screenshots a stage with a live ghost silhouette.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r576';
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

// --- Unit-level: recorder / persistence / playback on the ghost singleton ---
const unit = await page.evaluate(() => {
    const ghost = window.__ghost;
    // Clear any stored ghosts for a clean slate.
    try { localStorage.removeItem('clippy_ghosts'); } catch {}
    ghost._store = { version: 1, stages: {} };

    // Record a straight-line path for stage 1, clear time 300 frames.
    ghost.startRecording(1);
    for (let f = 1; f <= 300; f++) ghost.record(f, 100 + f, 50, 1);
    const stored = ghost.finishRecording(1, 300);
    const hasAfter = ghost.hasGhost(1);
    const bestAfter = ghost.bestTime(1);
    const sampleCount = ghost._store.stages[1].samples.length;  // ~100 at every=3

    // A SLOWER run (400f) must NOT overwrite.
    ghost.startRecording(1);
    for (let f = 1; f <= 400; f++) ghost.record(f, 999, 999, -1);
    const slowerStored = ghost.finishRecording(1, 400);
    const bestAfterSlow = ghost.bestTime(1);

    // A FASTER run (200f) MUST overwrite.
    ghost.startRecording(1);
    for (let f = 1; f <= 200; f++) ghost.record(f, 200 + f, 60, -1);
    const fasterStored = ghost.finishRecording(1, 200);
    const bestAfterFast = ghost.bestTime(1);

    // Playback interpolation: at frame 30 (=10th sample @ every=3) x should be
    // ~ 200 + 30 = 230 for the faster path.
    ghost.startPlayback(1);
    const playing = ghost.playing;
    const pos30 = ghost.posAt(30);
    // Frame way past the end returns null (ghost finished).
    const posPast = ghost.posAt(99999);

    return {
        stored, hasAfter, bestAfter, sampleCount,
        slowerStored, bestAfterSlow,
        fasterStored, bestAfterFast,
        playing, pos30, posPast,
    };
});
console.log('unit:', JSON.stringify(unit, null, 2));

// --- Integration: clean campaign stage arms ghost; daily does not ---
const integ = await page.evaluate(async () => {
    const g = window.__game;
    const ghost = window.__ghost;

    // The ghost is opt-in (options.showGhost defaults to false). Enable it so
    // a clean campaign stage actually arms recording/playback — without this
    // the gate at stage start leaves _ghostActive false and the test fails.
    const options = (await import('/src/options.js')).options;
    options.set('showGhost', true);

    // Clean campaign stage 1.
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false;
    g.dailyMode = false;
    g._startStage(1);
    const clean = { ghostActive: g._ghostActive, recording: !!ghost._rec, playing: ghost.playing };

    // Daily stage — must NOT arm the ghost.
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false;
    g.dailyMode = true;
    g.dailyChallenge = { id: 'test', name: 'X', desc: 'X', mods: {}, day: '20260531' };
    g._startStage(1);
    const daily = { ghostActive: g._ghostActive, recording: !!ghost._rec };

    return { clean, daily };
});
console.log('integ:', JSON.stringify(integ, null, 2));

// --- Screenshot: render a stage with a live ghost ahead of the player ---
await page.evaluate(() => {
    const g = window.__game;
    const ghost = window.__ghost;
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false;
    g.dailyMode = false;
    g._startStage(1);
    // Seed a best ghost so playback has data, then arm it.
    ghost._store.stages[1] = {
        time: 300, every: 3,
        samples: Array.from({ length: 120 }, (_, i) => [g.player.x + 30 + i * 2, g.player.y, 1]),
    };
    g._ghostActive = true;
    ghost.startPlayback(1);
    g.scene = 'play';
    g.stageTime = 30;   // ghost will be ~10 samples in, just ahead of player
    g.render();
});
await page.screenshot({ path: OUT + '/ghost-in-play.png' });

await browser.close();

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (!unit.stored) fail('first finishRecording should store a best');
if (!unit.hasAfter) fail('hasGhost should be true after store');
if (unit.bestAfter !== 300) fail('bestTime should be 300, got ' + unit.bestAfter);
if (unit.sampleCount < 90 || unit.sampleCount > 110) fail('expected ~100 samples @every=3, got ' + unit.sampleCount);
if (unit.slowerStored) fail('slower run (400f) must NOT overwrite');
if (unit.bestAfterSlow !== 300) fail('best should stay 300 after slower run, got ' + unit.bestAfterSlow);
if (!unit.fasterStored) fail('faster run (200f) MUST overwrite');
if (unit.bestAfterFast !== 200) fail('best should be 200 after faster run, got ' + unit.bestAfterFast);
if (!unit.playing) fail('playback should be active');
if (!unit.pos30 || Math.abs(unit.pos30.x - 230) > 4) fail('pos at frame 30 should be ~230, got ' + JSON.stringify(unit.pos30));
if (unit.posPast !== null) fail('pos past end should be null, got ' + JSON.stringify(unit.posPast));
if (!integ.clean.ghostActive) fail('clean campaign stage should arm ghost');
if (!integ.clean.recording) fail('clean campaign stage should be recording');
if (!integ.clean.playing && integ.clean.playing !== false) fail('playing flag missing');
if (integ.daily.ghostActive) fail('daily stage must NOT arm ghost');
if (integ.daily.recording) fail('daily stage must NOT record');
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

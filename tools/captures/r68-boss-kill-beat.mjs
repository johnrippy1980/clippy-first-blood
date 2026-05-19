// Verify boss-kill triggers slow-mo + camera shake exactly once per stage.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));

    // Simulate boss having been spawned and then dying
    g.bossSpawned = true;
    g.boss = null;       // boss "died" — was alive last frame, now nullified
    g._bossKillBeatFired = false;  // ensure fresh
    g.slowMoFrames = 0;

    // Spy camera.shake
    const shakes = [];
    const origShake = g.camera.shake.bind(g.camera);
    g.camera.shake = (n) => { shakes.push(n); return origShake(n); };
    // Block _onStageClear from rerouting to STAGE_CLEAR scene mid-probe
    const origClear = g._onStageClear.bind(g);
    let clearCalls = 0;
    g._onStageClear = () => { clearCalls++; /* no-op the side effects */ };

    // First call — should fire the beat
    g._tickPlayHandleStageClear();
    const afterFirst = { slowMo: g.slowMoFrames, shakes: [...shakes], clearCalls };
    // Second call — should NOT re-fire (guard)
    g._tickPlayHandleStageClear();
    const afterSecond = { slowMo: g.slowMoFrames, shakes: [...shakes], clearCalls };

    // Reset for fresh stage and verify the beat-fired flag clears
    g._startStage(2);
    const afterStageStart = { bossKillBeatFired: g._bossKillBeatFired };

    g.camera.shake = origShake;
    g._onStageClear = origClear;
    return { afterFirst, afterSecond, afterStageStart };
});
console.log('Boss-kill beat:', JSON.stringify(result, null, 2));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.afterFirst.slowMo >= 50
    && result.afterFirst.shakes.length === 1
    && result.afterSecond.shakes.length === 1  // no double-fire
    && result.afterStageStart.bossKillBeatFired === false;
process.exit(ok ? 0 : 1);

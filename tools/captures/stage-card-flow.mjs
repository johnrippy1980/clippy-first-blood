// Stage card → intro transition probe. Verifies the fade-out window of
// STAGE_CARD does NOT briefly show the NEXT stage's card art.
// Reproduction strategy:
//   - Force scene to STAGE_CARD with _pendingStage = 5.
//   - Run _tickStageCard's dismissal manually (call _startStage(5)).
//   - Sample _pendingStage AND currentStage during the 30-frame fade-out.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/cardflow', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// 1) Set up: we're "in stage 4", pending = stage 5.
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(4);
    g.scene = 'stageCard';
    g._pendingStage = 5;
    g.storyTimer = 60; // mid-card display
    g.transition = 0;
});
await page.waitForTimeout(60);
await page.screenshot({ path: '/tmp/cardflow/01-card-stage5.png' });

// 2) Dismiss the card — simulates _tickStageCard's dismissal.
await page.evaluate(() => {
    const g = window.__game;
    // Force the dismissal branch by setting storyTimer past threshold.
    g.storyTimer = 999;
    // Pump one tick at the fixed-step rate via requestAnimationFrame burst.
});

// 3) Sample over the 30-frame fade-out window.
const samples = [];
for (let i = 0; i < 35; i++) {
    const s = await page.evaluate(() => ({
        scene: window.__game.scene,
        pending: window.__game._pendingStage,
        current: window.__game.currentStage,
        transition: window.__game.transition,
    }));
    samples.push({ i, ...s });
    await page.waitForTimeout(20);
}

console.log('Frame | scene       | pending | current | transition');
console.log('------|-------------|---------|---------|-----------');
samples.forEach(s => {
    console.log(`${String(s.i).padStart(5)} | ${(s.scene || '').padEnd(11)} | ${String(s.pending).padStart(7)} | ${String(s.current).padStart(7)} | ${String(s.transition).padStart(3)}`);
});

// 4) Visual check: take a few screenshots during the fade window.
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(4);
    g.scene = 'stageCard';
    g._pendingStage = 5;
    g.storyTimer = 60;
    g.transition = 0;
});
await page.waitForTimeout(40);
await page.screenshot({ path: '/tmp/cardflow/02-card-shown.png' });

await page.evaluate(() => {
    const g = window.__game;
    // Trigger dismissal — _tickStageCard's body inline.
    g._startStage(g._pendingStage || (g.currentStage + 1));
});
// Capture during fade-out (scene still stageCard).
for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(40);
    const scene = await page.evaluate(() => window.__game.scene);
    await page.screenshot({ path: `/tmp/cardflow/03-fade-${i}-${scene}.png` });
}

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

// R454: perf harness — measure ms/frame on each engine on the largest stage.
import { chromium } from 'playwright';
const URL = 'http://localhost:8765/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 22; });

async function measure(stage, label) {
    await page.evaluate((s) => window.__game._startStage(s), stage);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (['play', 'beatPlay', 'fpsPlay', 'doomPlay'].includes(s)) break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);
    // Skip intro on doom
    if (stage === 16 || stage === 23) {
        await page.evaluate(() => { if (window.__game._doomEngine) window.__game._doomEngine._introT = 0; });
        await page.waitForTimeout(200);
    }
    // Sample 200 frames worth of tick+render times
    const samples = await page.evaluate(async () => {
        const samples = [];
        const game = window.__game;
        for (let i = 0; i < 200; i++) {
            const t0 = performance.now();
            game.tick();
            game.render();
            const t1 = performance.now();
            samples.push(t1 - t0);
            await new Promise(r => requestAnimationFrame(r));
        }
        return samples;
    });
    samples.sort((a, b) => a - b);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p50 = samples[Math.floor(samples.length / 2)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    const max = samples[samples.length - 1];
    console.log(`${label} (stage ${stage}): avg=${avg.toFixed(2)}ms p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`);
    return { avg, p50, p95, max };
}

console.log('=== PERF SAMPLES (lower = better, target <16.67ms for 60fps) ===');
await measure(1, 'PLATFORMER stage 1 (small)');
await measure(13, 'PLATFORMER stage 13 (CLOUD, large)');
await measure(7, 'BEAT-EM-UP stage 7');
await measure(22, 'BEAT-EM-UP stage 22 (mecha-gates)');
await measure(9, 'FPS-ARENA stage 9');
await measure(23, 'DOOM stage 23 (BLOCK 11)');
await measure(16, 'DOOM stage 16 (FLOOR 11, biggest map)');

await browser.close();

// R286: measure actual AudioContext output latency + sfx scheduling delay.
// User reports all sounds (gun, music, pickups) feel delayed. We confirm:
//   (a) AudioContext baseLatency + outputLatency values
//   (b) Whether sfx() oscillator-start time is being scheduled in the past
//   (c) JS frame-time stability (long frames could defer audio triggers)
//   (d) Whether the silent pre-warm + limiter chain adds detectable latency

import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console',   m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

// Force audio init
await page.evaluate(() => window.__game?.audio?.init?.());

const r = await page.evaluate(() => new Promise(resolve => {
    // wait one frame so the user-gesture audio.init() completes
    requestAnimationFrame(async () => {
        const audMod = await import('./src/audio.js');
        const a = audMod.audio;
        a.init();
        // Wait for resume
        await new Promise(r => setTimeout(r, 200));
        const ctx = a.ctx;
        const baseLat = ctx.baseLatency;
        const outLat = ctx.outputLatency;
        const state = ctx.state;
        const sampleRate = ctx.sampleRate;
        // Schedule a sfx, then measure when it actually starts audibly.
        // Web Audio doesn't expose "when a node starts producing samples in
        // the output device" directly, but ctx.currentTime advances at the
        // audio thread's pace, so we can measure the gap between
        // performance.now() at trigger and ctx.currentTime at next frame.
        const tCtxBefore = ctx.currentTime;
        const tPerfBefore = performance.now();
        a.sfx('pickup');
        const samples = [];
        // 30 frames of sampling
        let i = 0;
        function tick() {
            samples.push({
                f: i,
                perf: performance.now() - tPerfBefore,
                ctx: (ctx.currentTime - tCtxBefore) * 1000,
            });
            if (++i < 30) requestAnimationFrame(tick);
            else {
                resolve({
                    baseLatency: baseLat,
                    outputLatency: outLat,
                    state,
                    sampleRate,
                    samples,
                });
            }
        }
        requestAnimationFrame(tick);
    });
}));

console.log('=== R286 AUDIO LATENCY DIAG ===\n');
console.log(`AudioContext state: ${r.state}`);
console.log(`sampleRate: ${r.sampleRate}`);
console.log(`baseLatency: ${(r.baseLatency * 1000).toFixed(2)}ms  (input buffer)`);
console.log(`outputLatency: ${(r.outputLatency * 1000).toFixed(2)}ms  (estimated output device delay)`);
console.log('');
console.log('Frame-by-frame perf vs ctx time progression (first 10):');
console.log('  frame |   perf(ms)  |  ctxTime(ms)  | drift');
for (let i = 0; i < 10 && i < r.samples.length; i++) {
    const s = r.samples[i];
    const drift = (s.perf - s.ctx).toFixed(2);
    console.log(`     ${String(i).padStart(2)}   |  ${s.perf.toFixed(2).padStart(7)} | ${s.ctx.toFixed(2).padStart(8)}     | ${drift}`);
}
console.log('');

// Also measure: time between sfx() call and the FIRST frame where ctx.currentTime
// has advanced past where we scheduled
const triggerToFirstAdvance = r.samples.find(s => s.ctx > 0);
if (triggerToFirstAdvance) {
    console.log(`Trigger → ctx-time-first-tick: ${triggerToFirstAdvance.perf.toFixed(2)}ms (perf)`);
}

const totalLatency = (r.baseLatency + (r.outputLatency || 0)) * 1000;
console.log(`\nTotal audio path latency: ~${totalLatency.toFixed(0)}ms`);
if (totalLatency > 30) {
    console.log('⚠️  >30ms — user will perceive this as "delayed"');
} else if (totalLatency > 15) {
    console.log('⚠️  15-30ms — borderline; may feel sluggish for percussive SFX');
} else {
    console.log('✓ <15ms — should feel responsive');
}

console.log(`\nErrors: ${errors.length}`);
await browser.close();

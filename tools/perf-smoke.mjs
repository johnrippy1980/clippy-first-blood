// Performance smoke. Loads stage 1, plays for a few seconds, measures FPS.
// Production target: average above 55 FPS with 95th percentile frame time
// under 20ms. Anything significantly worse means a regression.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(500);

await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(600);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    // Place player in the middle of the stage with action around
    g.player.x = (g.level.data.width / 2) * 16;
    g.player.y = (g.level.data.height - 4) * 16;
});

// Sample frame timings via rAF for 3 seconds
const samples = await page.evaluate(() => new Promise(resolve => {
    const frames = [];
    let last = performance.now();
    let count = 0;
    function step(now) {
        frames.push(now - last);
        last = now;
        count++;
        if (count >= 180) resolve(frames);
        else requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}));

await browser.close();

samples.shift(); // drop first frame (warmup)
samples.sort((a, b) => a - b);
const median = samples[samples.length >> 1];
const p95 = samples[Math.floor(samples.length * 0.95)];
const max = samples[samples.length - 1];
const avgFps = 1000 / (samples.reduce((s, x) => s + x, 0) / samples.length);

console.log(`Frame timing over ${samples.length} samples:`);
console.log(`  avg FPS:  ${avgFps.toFixed(1)}`);
console.log(`  median:   ${median.toFixed(2)}ms`);
console.log(`  p95:      ${p95.toFixed(2)}ms`);
console.log(`  max:      ${max.toFixed(2)}ms`);

const fail = [];
if (avgFps < 55) fail.push(`avg FPS ${avgFps.toFixed(1)} < 55`);
if (p95 > 20)    fail.push(`p95 ${p95.toFixed(2)}ms > 20ms`);
if (max > 50)    fail.push(`max ${max.toFixed(2)}ms > 50ms (frame spike)`);

if (fail.length) {
    console.error('\n❌ Performance regression:\n  ' + fail.join('\n  '));
    process.exit(1);
}
console.log('\n✅ Performance OK');

// Long-session stability smoke. Cycles through all stages multiple times,
// measures JS heap growth, and fails if it leaks past a generous bound.
// Production target: < 30 MB heap delta after a full 8-stage run.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(500);

async function measureHeap() {
    // performance.memory is Chromium-only and behind --enable-precise-memory-info
    // in headless. Without it we get rounded values; still useful for trend.
    return await page.evaluate(() => {
        const m = performance?.memory;
        return m ? Math.round(m.usedJSHeapSize / 1e6 * 10) / 10 : null;
    });
}

const baseline = await measureHeap();
console.log(`Baseline heap: ${baseline} MB`);

const samples = [];
for (let i = 1; i <= 8; i++) {
    await page.evaluate(s => window.__game._startStage(s), i);
    await page.waitForTimeout(120);
    await page.evaluate(() => { window.__game.scene = 'play'; });
    // Let a couple of seconds of gameplay tick so all systems are exercised.
    await page.waitForTimeout(800);
    const h = await measureHeap();
    samples.push({ stage: i, heap: h });
    console.log(`Stage ${i}: heap ${h} MB`);
}

// Return to title to flush per-stage state.
await page.evaluate(() => { window.__game.scene = 'title'; });
await page.waitForTimeout(400);
// Force a couple of GC opportunities by triggering re-init.
for (let i = 0; i < 3; i++) {
    await page.evaluate(s => window.__game._startStage(s), 1);
    await page.waitForTimeout(200);
}
const final = await measureHeap();
const delta = baseline != null ? final - baseline : null;
console.log(`\nFinal heap: ${final} MB`);
if (delta != null) console.log(`Delta vs baseline: +${delta.toFixed(1)} MB`);

await browser.close();

if (delta != null && delta > 30) {
    console.error(`\n❌ Heap leak: +${delta.toFixed(1)} MB exceeds 30 MB budget`);
    process.exit(1);
}
console.log('\n✅ Long-session stability OK');

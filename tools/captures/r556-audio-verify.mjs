// R556: verify every track in TRACK_MANIFEST actually loads (no 404s).
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const networkErrors = [];
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('response', r => {
    if (r.status() >= 400 && r.url().includes('/assets/audio/')) {
        networkErrors.push(`${r.status()} ${r.url()}`);
    }
});

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');

// Load each track sequentially and verify it doesn't 404
const tracks = await page.evaluate(async () => {
    const m = await import('/src/constants.js');
    return m.TRACK_MANIFEST.map(t => t.track);
});
console.log('Total tracks to verify:', tracks.length);

const results = [];
for (const trackKey of tracks) {
    // playTrack + small delay, then check if the file is loaded
    const result = await page.evaluate(async (k) => {
        const a = (await import('/src/audio.js')).audio;
        a.playTrack(k);
        // Wait a tick for the file element to spawn
        await new Promise(r => setTimeout(r, 100));
        // Check the file element state
        const el = a._fileEl;
        return {
            current: a.currentTrack,
            elExists: !!el,
            elSrc: el?.src || null,
            elReadyState: el?.readyState ?? null,
            elError: el?.error?.message || null,
        };
    }, trackKey);
    const ok = result.current === trackKey && result.elExists && !result.elError;
    results.push({ track: trackKey, ok, ...result });
    process.stdout.write(`${trackKey}... ${ok ? 'OK' : 'FAIL'}\n`);
}

console.log('\n=== FAILURES ===');
const fails = results.filter(r => !r.ok);
if (fails.length === 0) console.log('  None');
else fails.forEach(f => console.log(`  ${f.track}: current=${f.current} elExists=${f.elExists} src=${f.elSrc} err=${f.elError}`));

console.log('\n=== NETWORK ERRORS ===');
if (networkErrors.length === 0) console.log('  None');
else networkErrors.forEach(e => console.log('  ', e));

console.log('\n=== CONSOLE ERRORS ===');
if (errors.length === 0) console.log('  None');
else errors.forEach(e => console.log('  ', e));

await browser.close();

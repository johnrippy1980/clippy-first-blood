import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const manifest = await page.evaluate(async () => {
    const m = await import('/src/constants.js');
    return m.TRACK_MANIFEST;
});
console.log('Total tracks:', manifest.length);
const found = manifest.find(t => t.track === 'no');
console.log('NO in manifest:', found ? `OK (${found.title})` : 'MISSING');
// Try playing it directly via audio
const playOk = await page.evaluate(async () => {
    const a = (await import('/src/audio.js')).audio;
    try { a.playTrack('no'); return a.currentTrack === 'no'; }
    catch (e) { return 'ERR: ' + e.message; }
});
console.log('playTrack("no"):', playOk);
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();

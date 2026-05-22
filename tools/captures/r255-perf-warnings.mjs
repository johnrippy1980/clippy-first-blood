// R255: 10-second real-input playthrough watching for console errors,
// warnings, and performance issues.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [], warns = [], logs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', msg => {
    const t = msg.type();
    if (t === 'error')   errs.push(msg.text());
    if (t === 'warning') warns.push(msg.text());
    if (t === 'log' && /WARN|ERROR|missing|fallback/i.test(msg.text())) logs.push(msg.text());
});
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

// Get to play
await page.focus('#screen');
async function tap(key) {
    await page.keyboard.down(key);
    await page.waitForTimeout(60);
    await page.keyboard.up(key);
}
for (let i = 0; i < 8; i++) { await tap('x'); await page.waitForTimeout(500); }

// Play for 8 seconds, smashing inputs
await page.keyboard.down('ArrowRight');
await page.keyboard.down('x');
for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(800);
    await tap('z');  // jump
    if (i % 2 === 0) await tap('Tab'); // weapon swap
}
await page.keyboard.up('ArrowRight');
await page.keyboard.up('x');

// FPS sample
const fps = await page.evaluate(() => {
    return new Promise(resolve => {
        const samples = [];
        let last = performance.now();
        let count = 0;
        function tick() {
            const now = performance.now();
            samples.push(1000 / (now - last));
            last = now;
            if (++count < 60) requestAnimationFrame(tick);
            else {
                samples.sort((a,b) => a-b);
                resolve({
                    min: samples[0].toFixed(1),
                    median: samples[Math.floor(samples.length/2)].toFixed(1),
                    max: samples[samples.length-1].toFixed(1),
                });
            }
        }
        requestAnimationFrame(tick);
    });
});

console.log('FPS:', JSON.stringify(fps));
console.log('Errors:', errs.length);
errs.forEach(e => console.log('  ', e.slice(0, 120)));
console.log('Warnings:', warns.length);
warns.forEach(w => console.log('  ', w.slice(0, 120)));
console.log('Suspicious logs:', logs.length);
logs.forEach(l => console.log('  ', l.slice(0, 120)));
await browser.close();

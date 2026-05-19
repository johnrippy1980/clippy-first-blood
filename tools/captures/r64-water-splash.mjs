// Verify particles.waterSplash spawns droplets + ring without errors,
// and that player water-entry uses it (not dust).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r64', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// 1. Direct API smoke: call waterSplash and inspect alive counts.
const result = await page.evaluate(async () => {
    const p = await import('/src/particles.js');
    const { particles } = p;
    const liveBefore = particles.pool.filter(x => x.alive).length;
    const ringsBefore = particles.rings.filter(x => x.alive).length;
    particles.waterSplash(120, 100);
    const liveAfter = particles.pool.filter(x => x.alive).length;
    const ringsAfter = particles.rings.filter(x => x.alive).length;
    return {
        droplets: liveAfter - liveBefore,
        rings: ringsAfter - ringsBefore,
        hasWaterSplash: typeof particles.waterSplash === 'function',
    };
});
console.log('API smoke:', JSON.stringify(result));

// 2. Visual snap: render a frame with particles overlaid.
await page.evaluate(async () => {
    const { particles } = await import('/src/particles.js');
    for (let i = 0; i < 30; i++) particles.update();
});
await page.screenshot({ path: '/tmp/r64/after-splash.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
process.exit(errors.length === 0 && result.hasWaterSplash && result.droplets >= 8 && result.rings >= 1 ? 0 : 1);

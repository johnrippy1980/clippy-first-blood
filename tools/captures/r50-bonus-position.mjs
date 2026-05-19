// Verify R47 bonus floats sit above combo label without overlap
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r50', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const { particles } = await import('/src/particles.js');
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    for (const f of particles.floats) f.alive = false;

    // Mimic the combo-5 milestone block at enemy(100, 100)
    const ex = 100, ey = 100;
    particles.floatingText(ex, ey - 2,  '+150', '#ffe070', 45, -0.8, 1.3);     // kill score
    particles.floatingText(ex, ey - 14, 'STREAK', '#ffe070', 80, -0.4, 2);     // combo label
    particles.floatingText(ex, ey - 36, '+500 BONUS', '#ff60ff', 70, -0.9, 1); // bonus (NEW pos)

    // Snapshot starting positions
    const live = particles.floats.filter(f => f.alive).map(f => ({
        y: f.y, text: f.text, vy: f.vy, scale: f.scale
    }));
    return live;
});
console.log('layout:', JSON.stringify(result, null, 2));

await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r50/layout.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

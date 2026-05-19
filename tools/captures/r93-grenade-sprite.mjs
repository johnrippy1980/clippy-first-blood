// Verify the new pixel-art grenade sprite renders without errors.
// Spawns a thrownGrenade in-flight and tick the render frame.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));

    const p = g.player;
    // Inject a grenade mid-flight
    p.thrownGrenades.push({
        x: p.x + 20, y: p.y - 10,
        vx: 1.5, vy: -0.5,
        fuse: 30,
        spin: 0.7,
    });
    // Inject a near-detonation blinking grenade
    p.thrownGrenades.push({
        x: p.x + 40, y: p.y - 5,
        vx: 0, vy: 0,
        fuse: 8,
        spin: 1.4,
    });

    // Let a few render frames pass
    await new Promise(r => setTimeout(r, 250));
    return { grenadeCount: p.thrownGrenades.length };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
process.exit(errors.length === 0 ? 0 : 1);

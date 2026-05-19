// Verify the 5 newly-integrated painted Clippy pose frames actually loaded
// (back-dash, hurt-knockback, spin-jump 1, spin-jump 2, aim-diagonal-up).
// Regression guard: if any of these v2_*.png files goes missing from disk,
// or the manifest gets rolled back, this probe fails.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);  // sprite load
await page.click('#screen');

const result = await page.evaluate(async () => {
    // sprites singleton is exposed via the module graph through __game
    const g = window.__game;
    const sprites = g.sprites || (await import('/src/sprites.js')).sprites;
    const required = [
        'backdash', 'hurt', 'spin_1', 'spin_2', 'aim_diag',
        'run_5', 'run_shoot_1', 'prone_shoot',
        'aim_diag_down', 'jump_aim',
    ];
    const loaded = {};
    for (const k of required) loaded[k] = sprites.has(k);
    // Also verify the underlying image dimensions look right (not 0×0)
    const dims = {};
    for (const k of required) {
        const d = sprites.dims.get(k);
        dims[k] = d ? `${d.w}x${d.h}` : null;
    }
    return { loaded, dims };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

const allLoaded = Object.values(result.loaded).every(v => v === true);
const allDims = Object.values(result.dims).every(v => v && !v.startsWith('0x'));
process.exit((errors.length === 0 && allLoaded && allDims) ? 0 : 1);

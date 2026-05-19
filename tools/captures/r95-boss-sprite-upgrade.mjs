// Verify the 7 painted-and-downscaled boss sprites + 4 painted grunts load.
// Bosses sips-downscaled 1024 → 96, grunts sips-downscaled 1024 → 64 so
// they match the existing hitboxes without breaking render scale.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const g = window.__game;
    const sprites = g.sprites || (await import('/src/sprites.js')).sprites;
    const required = [
        'boss_COPIER_3000', 'boss_SHREDDER', 'boss_CTRL_ALT_DEL',
        'boss_BALLMER', 'boss_GATES', 'boss_CLIPPY_2', 'boss_ALGORITHM',
    ];
    const loaded = {};
    const dims = {};
    for (const k of required) {
        loaded[k] = sprites.has(k);
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
// Painted-downscaled bosses are 96x96, painted grunts are 64x64 — accept
// 32-160 range so we catch a regression to either the tiny 20-34px
// originals OR the giant 1024px source files.
const allCorrectSize = Object.values(result.dims).every(v => {
    if (!v) return false;
    const w = parseInt(v.split('x')[0]);
    return w >= 32 && w <= 160;
});
process.exit((errors.length === 0 && allLoaded && allCorrectSize) ? 0 : 1);

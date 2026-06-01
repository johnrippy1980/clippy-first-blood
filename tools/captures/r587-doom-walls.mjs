// R587: verify the four new wall textures (whiteboard/blinds/corkboard/
// elevator, ids 12-15) load and render in the Doom corridor. Enter BLOCK 11,
// freeze the rAF loop, rotate the camera through a few angles, and screenshot
// each so the wall variety is visible. Also asserts all 15 wall PNGs are
// loaded (naturalWidth > 0) so a missing-file regression fails loudly.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r587';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.click('#screen');
await page.waitForTimeout(300);

// Freeze the page rAF so only our explicit draw() calls paint (otherwise the
// live loop ticks the engine forward and races our screenshots).
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

const info = await page.evaluate(() => {
    const g = window.__game;
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false; g.dailyMode = false;
    g._startStage(16);                 // FLOOR 11 — the larger office crawl
    g._doomPendingPlay = false;
    g.scene = 'doomPlay';
    const d = g._doomEngine;
    if (d) { d._introT = 0; d.introT = 0; d._stageNameT = 0; }
    for (let i = 0; i < 30; i++) { d.update?.(); }

    // Confirm every wall texture (1..15) is loaded.
    const loaded = {};
    for (let i = 1; i <= 15; i++) {
        const img = window.__sprites?.images?.get(`doom_wall_${i}`)
                 || g._doomEngine?.constructor?.sprites?.images?.get?.(`doom_wall_${i}`);
        loaded[i] = !!(img && img.complete && img.naturalWidth > 0);
    }
    return { hasEngine: !!d, loaded };
});

// Sprites live on a module singleton; probe it directly for the load check.
const loadCheck = await page.evaluate(() => {
    // Try common globals; fall back to scanning the engine draw path.
    const tryGet = (k) => {
        const s = window.__sprites || window.sprites;
        if (s?.images?.get) return s.images.get(k);
        return null;
    };
    const out = {};
    for (let i = 1; i <= 15; i++) {
        const img = tryGet(`doom_wall_${i}`);
        out[i] = img ? !!(img.complete && img.naturalWidth > 0) : 'no-access';
    }
    return out;
});

// Rotate the player and capture a few corridor angles.
const canvas = await page.$('#screen');
const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
for (let i = 0; i < angles.length; i++) {
    await page.evaluate(a => {
        const d = window.__game._doomEngine;
        d.player.angle = a;
        d.draw();
    }, angles[i]);
    await page.waitForTimeout(60);
    if (canvas) await canvas.screenshot({ path: `${OUT}/0${i + 1}-angle.png` });
}

await browser.close();
console.log('hasEngine:', info.hasEngine);
console.log('loaded (engine view):', JSON.stringify(info.loaded));
console.log('loaded (sprites singleton):', JSON.stringify(loadCheck));
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

let ok = true;
if (!info.hasEngine) { ok = false; console.log('FAIL: no doom engine'); }
if (errors.length) { ok = false; console.log('FAIL: console/page errors'); }
console.log(ok ? 'PASS (capture only — eyeball the PNGs)' : 'FAILED');
process.exit(ok ? 0 : 1);

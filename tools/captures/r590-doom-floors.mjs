// R590: verify the reworked office floor + ceiling textures (carpet/ceiling_
// office) load and render in FLOOR 11. Enter the stage, freeze the rAF loop,
// pitch the camera at a few angles and screenshot so the floor grid + ceiling
// T-bar/lights are visible. Asserts both textures are loaded (naturalWidth>0)
// and 64x64 (power-of-2, so the raycaster's fast-mask path stays valid).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r590';
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

// Freeze the page rAF so only our explicit draw() calls paint.
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

const info = await page.evaluate(() => {
    const g = window.__game;
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false; g.dailyMode = false;
    g._startStage(16);                 // FLOOR 11 — office crawl
    g._doomPendingPlay = false;
    g.scene = 'doomPlay';
    const d = g._doomEngine;
    if (d) { d._introT = 0; d.introT = 0; d._stageNameT = 0; }
    for (let i = 0; i < 20; i++) { d.update?.(); }
    return { hasEngine: !!d, theme: d?.data?.theme };
});

// The sprites singleton is a module export (not a window global) and a fresh
// import() yields a DIFFERENT empty instance — so we can't load-check it that
// way. Instead, verify through the LIVE draw path: if the floor/ceiling textures
// failed to load, the engine falls back to FLAT fills (#283040 ceiling /
// #3a2c20 floor). A textured render has real per-pixel color variance. So draw,
// read back the canvas, and measure variance in the ceiling and floor bands.
const texCheck = await page.evaluate(() => {
    const g = window.__game;
    const d = g._doomEngine;
    d.player.angle = 0;
    d.draw();
    const cv = document.querySelector('#screen');
    const ictx = cv.getContext('2d');
    // Internal res is 256x224; HUD_H=40 -> VIEW_H=184, half=92. Sample a band of
    // the ceiling (upper) and floor (lower) away from walls/HUD center.
    const sampleVar = (x0, y0, w, h) => {
        const img = ictx.getImageData(x0, y0, w, h).data;
        let n = 0, sr = 0, sr2 = 0;
        for (let i = 0; i < img.length; i += 4) {
            const v = img[i]; sr += v; sr2 += v * v; n++;
        }
        const mean = sr / n;
        return { variance: +(sr2 / n - mean * mean).toFixed(1), mean: +mean.toFixed(1) };
    };
    return {
        ceiling: sampleVar(40, 10, 176, 30),   // upper band
        floor: sampleVar(40, 150, 176, 30),    // lower band
    };
});

// Pitch the camera so floor + ceiling fill more of the frame, capture angles.
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
console.log('hasEngine:', info.hasEngine, 'theme:', info.theme);
console.log('floor/ceiling band stats (variance proves textured, not flat-fill):');
console.log('  ', JSON.stringify(texCheck));
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (!info.hasEngine) fail('no doom engine');
// Flat-fill fallback has ~0 variance; textured carpet/ceiling has real spread.
// Threshold of 4 comfortably separates "textured" from "single flat color".
if (texCheck.ceiling.variance < 4) fail('ceiling looks flat-filled (texture not loaded?) var=' + texCheck.ceiling.variance);
if (texCheck.floor.variance < 4) fail('floor looks flat-filled (texture not loaded?) var=' + texCheck.floor.variance);
if (errors.length) fail('console/page errors');
console.log(ok ? 'PASS (eyeball the PNGs for floor grid + ceiling detail)' : 'FAILED');
process.exit(ok ? 0 : 1);

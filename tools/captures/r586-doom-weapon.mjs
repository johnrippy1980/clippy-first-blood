// R586: capture the FPS (Doom-mode) viewport to eyeball the viewmodel weapon
// position. The MG barrel currently juts up dead-center and blocks the
// corridor view. Enter BLOCK 11 (stage 23, doomMode), force DOOM_PLAY, and
// draw a few frames via the engine, then screenshot. Diagnostic only.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r586';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);

// Freeze the page's own rAF loop so only our explicit draw() calls paint —
// otherwise the live loop ticks the engine forward (into a wall / fade) and
// races our screenshots to black.
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });

const info = await page.evaluate(() => {
    const g = window.__game;
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false; g.dailyMode = false;
    g._startStage(23);                 // BLOCK 11 doom stage
    // Short-circuit the STAGE_INTRO → DOOM_PLAY handoff.
    g._doomPendingPlay = false;
    g.scene = 'doomPlay';
    const d = g._doomEngine;
    // Clear any intro flash so the viewport is fully lit, then settle frames.
    if (d) { d._introT = 0; d.introT = 0; d._stageNameT = 0; }
    for (let i = 0; i < 30; i++) { d.update?.(); }
    d.draw();
    const p = d.player;
    return {
        hasEngine: !!d,
        weaponIdx: p?.weaponIdx,
        scene: g.scene,
    };
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/01-doom-view.png` });

// Also grab a tighter crop of just the canvas for clearer eyeballing.
const canvas = await page.$('#screen');
if (canvas) await canvas.screenshot({ path: `${OUT}/02-canvas.png` });

// Firing pose — set the flash then draw ONE frame (no extra update(), which
// would advance the intro/fade timer and re-darken the framebuffer). This
// mirrors the lit 02 capture path.
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.muzzleFlash = 10;
    d.draw();
});
await page.waitForTimeout(60);
if (canvas) await canvas.screenshot({ path: `${OUT}/03-firing.png` });

await browser.close();
console.log(JSON.stringify(info, null, 2));
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
process.exit(0);

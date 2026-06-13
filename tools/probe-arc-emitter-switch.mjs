// R628 smoke: the shootable arc emitter kill-switch (TILE.ARCSWITCH = 12). A
// wall-mounted panel placed beside the Founder's Lair arc gate; a single player
// bullet that lands on it PERMANENTLY defuses the stage's whole arc circuit —
// every ARC tile goes dark (renderer) and safe (contact). Rewards spotting the
// switch over timing the 2s pulse. Drives the REAL Level (isHazard / arcPhase /
// disableArcs / isSolid) and the REAL player bullet loop (_updateBullets).
// Verifies:
//  (1) TILE.ARCSWITCH registered as id 12.
//  (2) the switch tile is actually placed in Founder's Lair (stage 11) and the
//      arc gate it controls is placed too.
//  (3) the switch is SOLID (blocks movement + stops bullets).
//  (4) BEFORE tripping: the arc gate is hazardous during its live window.
//  (5) disableArcs() latches: returns true once, false after; sets arcDisabled.
//  (6) AFTER tripping: arcPhase is 'off' for ALL frames and isHazard on the arc
//      tile is false even at frame 105 (mid-live) — corridor is defused.
//  (7) the REAL player bullet path trips it: a bullet placed on the switch and
//      run through _updateBullets flips arcDisabled and is consumed.
// Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

const out = await page.evaluate(async () => {
    const { TILE, GAME } = await import('/src/constants.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    const r = {};

    // --- (1) tile id ---
    r.switchId = TILE.ARCSWITCH;   // 12

    g._startStage(11);             // Founder's Lair (makeStage6 -> STAGE_LOADERS[11])
    await new Promise(res => setTimeout(res, 350));
    const level = g.level;
    if (!level) return { err: 'no level' };

    // --- (2) locate the placed switch tile + an arc tile ---
    let swTx = -1, swTy = -1, arcTx = -1, arcTy = -1;
    for (let ty = 0; ty < level.data.height; ty++) {
        for (let tx = 0; tx < level.data.width; tx++) {
            const t = level.tiles[ty][tx];
            if (t === TILE.ARCSWITCH && swTx < 0) { swTx = tx; swTy = ty; }
            if (t === TILE.ARC && arcTx < 0) { arcTx = tx; arcTy = ty; }
        }
    }
    r.switchPlaced = swTx >= 0;
    r.arcPlaced = arcTx >= 0;
    if (swTx < 0 || arcTx < 0) return r;

    const swPx = swTx * GAME.TILE + GAME.TILE / 2;
    const swPy = swTy * GAME.TILE + GAME.TILE / 2;
    const arcPx = arcTx * GAME.TILE + GAME.TILE / 2;
    const arcPy = arcTy * GAME.TILE + GAME.TILE / 2;

    // --- (3) switch is solid ---
    r.switchSolid = level.isSolid(swPx, swPy);   // true
    r.isArcSwitch = level.isArcSwitch(swPx, swPy); // true

    // --- (4) BEFORE: arc bites in its live window ---
    level.frame = 105;                            // mid-live (100..119)
    r.hazBefore = level.isHazard(arcPx, arcPy);   // true
    r.phaseBeforeLive = level.arcPhase(level.arcOffsetForTile(arcTx)); // 'live'

    // --- (5) disableArcs latches ---
    r.disableFirst = level.disableArcs();         // true (transition)
    r.disableSecond = level.disableArcs();        // false (already off)
    r.arcDisabledFlag = level.arcDisabled;        // true

    // --- (6) AFTER: arc is 'off' for every frame + never hazardous ---
    let allOff = true, anyHaz = false;
    for (let f = 0; f < 120; f++) {
        level.frame = f;
        if (level.arcPhase(level.arcOffsetForTile(arcTx)) !== 'off') allOff = false;
        if (level.isHazard(arcPx, arcPy)) anyHaz = true;
    }
    r.allOffAfter = allOff;        // true
    r.noHazAfter = !anyHaz;        // true (anyHaz false)
    level.frame = 105;
    r.hazAfterLiveWindow = level.isHazard(arcPx, arcPy); // false even mid-live

    // --- (7) REAL player bullet path trips a FRESH switch ---
    // Re-load the stage so arcDisabled is back to false for the bullet test.
    g._startStage(11);
    await new Promise(res => setTimeout(res, 350));
    const lvl2 = g.level;
    // find switch again (same layout)
    let s2x = -1, s2y = -1;
    for (let ty = 0; ty < lvl2.data.height && s2x < 0; ty++)
        for (let tx = 0; tx < lvl2.data.width; tx++)
            if (lvl2.tiles[ty][tx] === TILE.ARCSWITCH) { s2x = tx; s2y = ty; break; }
    const p = g.player;
    p.bullets.length = 0;
    // Park a bullet dead-center on the switch tile so the wall-hit branch fires.
    p.bullets.push({
        x: s2x * GAME.TILE + GAME.TILE / 2,
        y: s2y * GAME.TILE + GAME.TILE / 2,
        prevX: s2x * GAME.TILE + GAME.TILE / 2,
        prevY: s2y * GAME.TILE + GAME.TILE / 2,
        vx: 0.0001, vy: 0,           // tiny vx so it doesn't sit on prev exactly
        damage: 3, color: '#ffffff', weapon: 'MG', life: 80,
    });
    r.arcDisabledBeforeShot = lvl2.arcDisabled;    // false
    p._updateBullets(lvl2);
    r.arcDisabledAfterShot = lvl2.arcDisabled;     // true — bullet tripped it
    r.bulletConsumed = p.bullets.length === 0;     // true — switch ate the bullet

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.switchId === 12
    && out.switchPlaced === true
    && out.arcPlaced === true
    && out.switchSolid === true
    && out.isArcSwitch === true
    && out.hazBefore === true
    && out.phaseBeforeLive === 'live'
    && out.disableFirst === true
    && out.disableSecond === false
    && out.arcDisabledFlag === true
    && out.allOffAfter === true
    && out.noHazAfter === true
    && out.hazAfterLiveWindow === false
    && out.arcDisabledBeforeShot === false
    && out.arcDisabledAfterShot === true
    && out.bulletConsumed === true;
console.log(ok ? 'ARC EMITTER SWITCH OK' : 'ARC EMITTER SWITCH FAIL');
process.exit(ok ? 0 : 1);

// R626 smoke: the phase-offset rippling arc corridor. Extends the R625 arc so
// a RUN of arc tiles pulses as a traveling wave instead of all-on/all-off,
// driven by a per-column phase offset (arcOffsetForTile) that BOTH isHazard
// and the renderer read so contact and visuals never disagree. Verifies:
//  (1) stage data drives arcRippleStep — The Cloud (stage 13) = 20, while the
//      Founder's Lair single gate (stage 11) stays 0 (unison, R625 behaviour).
//  (2) per-column offset staggers neighbours: adjacent arc columns have
//      DIFFERENT offsets, so at a given frame not all are live at once.
//  (3) at least one frame exists where exactly the wave makes one column live
//      and an adjacent one not — i.e. a traveling safe gap, not a global gate.
//  (4) isHazard agrees with arcPhase(arcOffsetForTile(col)) for the live wave.
//  (5) regression: the stage-11 single gate (step 0) still pulses in unison —
//      all its arc tiles share one phase.
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

    const arcCols = (level) => {
        const cols = [];
        for (let ty = 0; ty < level.data.height; ty++)
            for (let tx = 0; tx < level.data.width; tx++)
                if (level.tiles[ty][tx] === TILE.ARC) cols.push({ tx, ty });
        return cols;
    };

    // --- (1) + (2) + (3) + (4): The Cloud rippling corridor (stage 13) ---
    g._startStage(13);
    await new Promise(res => setTimeout(res, 350));
    let level = g.level;
    if (!level) return { err: 'no cloud level' };
    r.cloudStep = level.arcRippleStep;             // 20
    const cloudArcs = arcCols(level);
    r.cloudArcCount = cloudArcs.length;            // 6

    // adjacent columns must have different offsets (staggered)
    const offs = cloudArcs.map(a => level.arcOffsetForTile(a.tx));
    r.cloudOffsets = offs;
    let neighboursDiffer = true;
    const sorted = [...cloudArcs].sort((a, b) => a.tx - b.tx);
    for (let i = 1; i < sorted.length; i++) {
        if (level.arcOffsetForTile(sorted[i].tx) === level.arcOffsetForTile(sorted[i - 1].tx)) {
            neighboursDiffer = false;
        }
    }
    r.cloudNeighboursDiffer = neighboursDiffer;

    // traveling gap: scan a full 120-frame cycle; require at least one frame
    // where the corridor is PARTIALLY live (some live, some not) — that's the
    // wave. A pure global gate would only ever be all-live or all-off.
    let sawPartial = false;
    let isHazardAgrees = true;
    for (let f = 0; f < 120; f++) {
        level.frame = f;
        let liveCount = 0;
        for (const a of sorted) {
            const off = level.arcOffsetForTile(a.tx);
            const live = level.arcPhase(off) === 'live';
            if (live) liveCount++;
            // isHazard at the tile centre must equal the phase-derived live.
            const px = a.tx * GAME.TILE + GAME.TILE / 2;
            const py = a.ty * GAME.TILE + GAME.TILE / 2;
            if (level.isHazard(px, py) !== live) isHazardAgrees = false;
        }
        if (liveCount > 0 && liveCount < sorted.length) sawPartial = true;
    }
    r.cloudSawPartial = sawPartial;                // true — it's a wave
    r.cloudHazardAgrees = isHazardAgrees;          // true

    // --- (5) regression: Founder's Lair single gate pulses in unison ---
    g._startStage(11);
    await new Promise(res => setTimeout(res, 350));
    level = g.level;
    if (!level) return { err: 'no founder level' };
    r.founderStep = level.arcRippleStep;           // 0
    const founderArcs = arcCols(level);
    r.founderArcCount = founderArcs.length;        // 2
    // With step 0, every arc shares offset 0 -> identical phase every frame.
    let unison = true;
    for (let f = 0; f < 120; f += 7) {
        level.frame = f;
        const phases = new Set(founderArcs.map(a => level.arcPhase(level.arcOffsetForTile(a.tx))));
        if (phases.size > 1) unison = false;
    }
    r.founderUnison = unison;                       // true

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.cloudStep === 20
    && out.cloudArcCount === 6
    && out.cloudNeighboursDiffer === true
    && out.cloudSawPartial === true
    && out.cloudHazardAgrees === true
    && out.founderStep === 0
    && out.founderArcCount === 2
    && out.founderUnison === true;
console.log(ok ? 'ARC RIPPLE CORRIDOR OK' : 'ARC RIPPLE CORRIDOR FAIL');
process.exit(ok ? 0 : 1);

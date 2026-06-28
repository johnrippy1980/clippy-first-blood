// AUDIT: invisible walls + invisible jump-obstacles across every platformer
// stage. The collision model (level.isSolid) and the render model (level.draw)
// can disagree: the tile draw loop SKIPS TILE.EMPTY cells, so any coordinate
// that reads solid-in-collision while its grid tile is EMPTY paints NOTHING —
// that is, by construction, an invisible wall (blocks horizontal travel) or an
// invisible obstacle you must jump over with no visible thing to clear.
//
// This is a diagnostic (prints offenders), not a pass/fail guard. It boots each
// stage's REAL Level in the browser and probes level.isSolid at every cell
// center, comparing against the grid tile + the legitimate moving-lift band
// (drawn by _drawLifts) + alive breakable walls (drawn by the pickup manager) —
// none of those are invisible. Anything LEFT solid is a true invisible blocker.
//
// Verified clean 2026-06-28: 0 invisible blockers across all 15 platformer
// stages. Every solid-but-empty-grid cell turned out to be a rendered breakable
// wall (isWallSolid + wall.draw are both gated on w.alive, so they can't
// disagree). The only map-edge "all-open" flag (stage 13 right edge) is dead
// buffer air PAST the arena's right wall + exit — unreachable, no floor to walk
// on, not in the player's path. Re-run after authoring new geometry.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(200);
await page.focus('#screen');

// Stages that run the side-scrolling platformer collision model. FPS, turret,
// beat-em-up and doom stages don't use Level tile collision the same way, so we
// skip them here (this audit is about platformer invisible blockers).
const PLATFORMER_STAGES = [1, 2, 3, 4, 5, 8, 10, 11, 12, 13, 14, 15, 17, 18, 21];

const report = [];
for (const stage of PLATFORMER_STAGES) {
  const res = await page.evaluate(async (stageNum) => {
    const g = window.__game;
    g._startStage(stageNum);
    // Give the level a tick so dynamic state (lifts, breakable walls) settles.
    const lvl = g.level;
    if (!lvl || !lvl.data) return { stage: stageNum, error: 'no level/data' };
    const T = 16;
    const W = lvl.data.width, H = lvl.data.height;
    const TILE = { EMPTY: 0 };
    // Collect cells that are solid-in-collision but EMPTY-in-grid (and not a
    // legitimate lift band). Probe the cell CENTER.
    const lifts = lvl._lifts || [];
    const liftCols = new Set(lifts.map(L => L.col));
    // Alive breakable walls render themselves (pickups.js: walls.draw per frame)
    // AND are the ONLY thing isWallSolid reports solid (gated on w.alive). So a
    // wall-solid cell is a VISIBLE brick, not an invisible wall — exclude it.
    const pm = g.pickups || null;
    const aliveWalls = pm && pm.walls ? pm.walls.filter(w => w.alive) : [];
    const offenders = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const grid = lvl.tiles[r][c];
        if (grid !== TILE.EMPTY) continue; // visible tiles render fine
        const px = c * T + T / 2;
        const py = r * T + T / 2;
        // allowPlatform=true + a prevY above so platform one-ways count as solid
        // landings too (an invisible one-way would be just as confusing).
        const solid = lvl.isSolid(px, py, true, py - T);
        if (!solid) continue;
        // Exclude the legitimate moving-lift band: it's drawn by _drawLifts, so
        // it is NOT invisible. A lift column cell within a car's live span is OK.
        let isLiftBand = false;
        for (const L of lifts) {
          if (L.col === c && py >= L.y && py < L.y + T) { isLiftBand = true; break; }
        }
        if (isLiftBand) continue;
        // Exclude alive breakable walls: they render via the pickup manager, so
        // the brick IS visible — shooting it through is the intended mechanic.
        let isAliveWall = false;
        for (const w of aliveWalls) {
          if (px >= w.x && px < w.x + w.w && py >= w.y && py < w.y + w.h) { isAliveWall = true; break; }
        }
        if (isAliveWall) continue;
        offenders.push({ r, c, why: 'solid-but-unrendered' });
      }
    }
    // --- Map-edge invisible wall check. moveX clamps the player at x<0 and
    // x+w>width with NO rendered wall there. That's fine if the edge column is
    // itself solid (you stop against a visible wall) or holds the EXIT (you
    // leave before reaching it). It's an INVISIBLE wall if the rightmost / leftmost
    // column is open air at floor level — you walk into blank space and stop.
    // Report the edge columns' tile makeup so a human can judge intent.
    const colSummary = (c) => {
      let solidRows = 0, exitRows = 0, emptyRows = 0;
      for (let r = 0; r < H; r++) {
        const t = lvl.tiles[r][c];
        if (t === 9) exitRows++;            // TILE.EXIT
        else if (t === TILE.EMPTY) emptyRows++;
        else solidRows++;
      }
      return { solidRows, exitRows, emptyRows };
    };
    const leftEdge = colSummary(0);
    const rightEdge = colSummary(W - 1);
    return { stage: stageNum, name: lvl.data.name || lvl.data.theme || '?', W, H, offenders, liftCols: [...liftCols], leftEdge, rightEdge };
  }, stage);
  report.push(res);
  await page.waitForTimeout(100);
}

let total = 0;
for (const r of report) {
  if (r.error) { console.log(`STAGE ${r.stage}: ERROR ${r.error}`); continue; }
  const n = r.offenders ? r.offenders.length : 0;
  total += n;
  // Edge note: flag an edge column that is ALL empty (no solid stopper, no
  // exit) — walking into it hits the invisible map-bound clamp.
  const edgeNotes = [];
  if (r.rightEdge && r.rightEdge.solidRows === 0 && r.rightEdge.exitRows === 0) {
    edgeNotes.push(`right edge all-open (${r.rightEdge.emptyRows} empty rows) — invisible map-bound wall?`);
  }
  if (r.leftEdge && r.leftEdge.solidRows === 0 && r.leftEdge.exitRows === 0) {
    edgeNotes.push(`left edge all-open (${r.leftEdge.emptyRows} empty rows) — invisible map-bound wall?`);
  }
  const edgeStr = edgeNotes.length ? '  [EDGE] ' + edgeNotes.join('; ') : '';
  if (n === 0) {
    console.log(`STAGE ${r.stage} (${r.name}) ${r.W}x${r.H}: clean${edgeStr}`);
  } else {
    console.log(`STAGE ${r.stage} (${r.name}) ${r.W}x${r.H}: ${n} INVISIBLE-BLOCKER cell(s)`);
    // group by reason + compact runs
    const byReason = {};
    for (const o of r.offenders) (byReason[o.why] ||= []).push(`(r${o.r},c${o.c})`);
    for (const why in byReason) {
      const cells = byReason[why];
      console.log(`   ${why}: ${cells.slice(0, 30).join(' ')}${cells.length > 30 ? ` …+${cells.length - 30}` : ''}`);
    }
  }
}
console.log(`\nTOTAL invisible-blocker cells across platformer stages: ${total}`);
console.log(`page errors: ${errs.length}${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`);

await browser.close();
process.exit(0);

// Static traversal analyzer. Walks each stage's platform graph and reports
// platforms that are unreachable from the spawn point given Clippy's jump arc.
//
// Movement budget (single jump): horiz ~5 tiles, vert ~5 tiles.
// Movement budget (double jump): horiz ~5 tiles, vert ~9 tiles.
//
// We treat the floor (h-2 row) as always reachable, then do a flood-fill from
// any reachable surface, considering: walking on adjacent surfaces, jumping
// up + across to a higher platform, falling down + across to a lower one.
//
// Surfaces: solid tile-top rows + one-way platforms.

import { chromium } from 'playwright';

const JUMP_V = 7.5;
const GRAVITY = 0.36;
const MAX_SPEED = 2.0;
const TILE = 16;
// In tiles: jump apex = (v²/(2g)) / TILE ≈ 4.88 → 5 tiles
const MAX_JUMP_TILES = 5;
// Double jump effectively gives ~9 tiles vertical reach
const MAX_DOUBLE_JUMP_TILES = 9;
// Horizontal distance covered during a jump = max_speed * 2|v|/g ≈ 5.2 tiles
const MAX_HORIZ_TILES = 5;

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const TILE_E = 0, TILE_W = 1, TILE_P = 2, TILE_L = 3, TILE_S = 4, TILE_X = 9;

function isSolid(v) { return v === TILE_W; }
function isPlatform(v) { return v === TILE_P; }
function isLadder(v) { return v === TILE_L; }
function isHazard(v) { return v === TILE_S; }

// A "surface cell" is a row,col where the player could stand. Either:
//   - tile[r][c] is empty/ladder AND tile[r+1][c] is solid (standing on solid)
//   - tile[r][c] is empty/ladder AND tile[r+1][c] is platform
function isStandable(g, r, c) {
    if (r < 0 || r >= g.length - 1 || c < 0 || c >= g[0].length) return false;
    const here = g[r][c];
    const below = g[r + 1][c];
    if (isSolid(here) || isHazard(here)) return false;
    return isSolid(below) || isPlatform(below);
}

function neighborsOf(g, r, c) {
    // Possible moves from this surface cell:
    //  - Walk to (r, c±1) if standable
    //  - Drop / climb via gravity to lower platforms within ±MAX_HORIZ
    //  - Jump up to higher platforms within MAX_JUMP_TILES vertically and MAX_HORIZ horizontally
    //  - Double-jump up to MAX_DOUBLE_JUMP_TILES vertically
    //  - Ladder ascent if g[r][c] is ladder
    const n = [];
    for (let dc = -1; dc <= 1; dc += 2) {
        if (isStandable(g, r, c + dc)) n.push([r, c + dc]);
    }
    // Falls — drop straight down or arc within horizontal range
    for (let dr = 1; dr <= 13; dr++) {
        for (let dc = -MAX_HORIZ_TILES; dc <= MAX_HORIZ_TILES; dc++) {
            const nr = r + dr, nc = c + dc;
            if (isStandable(g, nr, nc)) {
                // Path must not be blocked by solid wall mid-air
                let blocked = false;
                for (let step = 1; step <= dr; step++) {
                    const ir = r + step, ic = c + Math.round(dc * step / dr);
                    if (ir < g.length && ic >= 0 && ic < g[0].length && isSolid(g[ir][ic])) { blocked = true; break; }
                }
                if (!blocked) n.push([nr, nc]);
            }
        }
    }
    // Jumps — up to MAX_JUMP vertically + MAX_HORIZ horizontally
    for (let dr = -MAX_DOUBLE_JUMP_TILES; dr <= 0; dr++) {
        for (let dc = -MAX_HORIZ_TILES; dc <= MAX_HORIZ_TILES; dc++) {
            if (dr === 0 && (dc === -1 || dc === 0 || dc === 1)) continue;
            const nr = r + dr, nc = c + dc;
            if (isStandable(g, nr, nc)) {
                // Conservative: only allow if arc clears
                // Approximate: check no solid blocks directly between (r,c) and (nr,nc)
                let blocked = false;
                const steps = Math.max(Math.abs(dr), Math.abs(dc));
                for (let s = 1; s < steps; s++) {
                    const ir = r + Math.round(dr * s / steps);
                    const ic = c + Math.round(dc * s / steps);
                    if (ir >= 0 && ir < g.length && ic >= 0 && ic < g[0].length && isSolid(g[ir][ic])) {
                        blocked = true; break;
                    }
                }
                // Penalize tall vertical-only jumps from solid floor
                if (!blocked && Math.abs(dr) <= MAX_DOUBLE_JUMP_TILES) n.push([nr, nc]);
            }
        }
    }
    // Ladder
    if (isLadder(g[r][c])) {
        for (let dr = -8; dr <= 8; dr++) {
            const nr = r + dr;
            if (nr >= 0 && nr < g.length && (isLadder(g[nr][c]) || isStandable(g, nr, c))) n.push([nr, c]);
        }
    }
    return n;
}

async function analyzeStage(stageN) {
    const data = await page.evaluate(async (n) => {
        const { STAGE_LOADERS } = await import('/src/level.js');
        const d = STAGE_LOADERS[n]();
        return {
            tiles: d.tiles,
            width: d.width,
            height: d.height,
            playerStart: d.playerStart,
            bossTrigger: d.bossTrigger,
        };
    }, stageN);

    const g = data.tiles;
    const startCol = Math.floor(data.playerStart.x / TILE);
    const startRow = Math.floor(data.playerStart.y / TILE);
    // Find nearest standable cell to spawn
    let originR = startRow, originC = startCol;
    let found = false;
    for (let dr = 0; dr < 4 && !found; dr++) {
        for (let dc = -1; dc <= 1 && !found; dc++) {
            if (isStandable(g, originR + dr, originC + dc)) {
                originR = originR + dr; originC = originC + dc;
                found = true;
            }
        }
    }
    if (!found) {
        console.log(`Stage ${stageN}: WARN — could not anchor spawn`);
        return { stageN, reachable: 0, total: 0, gaps: [], bossReached: false };
    }

    // BFS reachability
    const key = (r, c) => `${r},${c}`;
    const visited = new Set([key(originR, originC)]);
    const queue = [[originR, originC]];
    while (queue.length) {
        const [r, c] = queue.shift();
        for (const [nr, nc] of neighborsOf(g, r, c)) {
            const k = key(nr, nc);
            if (!visited.has(k)) { visited.add(k); queue.push([nr, nc]); }
        }
    }

    // Enumerate all standable cells, find unreachable ones
    const allStandable = [];
    const unreachable = [];
    for (let r = 0; r < g.length; r++) {
        for (let c = 0; c < g[0].length; c++) {
            if (isStandable(g, r, c)) {
                allStandable.push([r, c]);
                if (!visited.has(key(r, c))) unreachable.push([r, c]);
            }
        }
    }
    // Did Clippy reach the boss-trigger column?
    const bossCol = Math.floor(data.bossTrigger.x / TILE);
    let bossReached = false;
    for (let r = 0; r < g.length; r++) {
        if (visited.has(key(r, bossCol)) || visited.has(key(r, bossCol - 1)) || visited.has(key(r, bossCol + 1))) {
            bossReached = true; break;
        }
    }
    // Compress unreachable into "gap regions" — consecutive unreachable cells horizontally
    unreachable.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    const gaps = [];
    for (const cell of unreachable) {
        const last = gaps[gaps.length - 1];
        if (last && last.row === cell[0] && cell[1] === last.endCol + 1) {
            last.endCol = cell[1];
        } else {
            gaps.push({ row: cell[0], startCol: cell[1], endCol: cell[1] });
        }
    }
    return {
        stageN,
        reachable: visited.size,
        total: allStandable.length,
        gapCount: unreachable.length,
        gaps,
        bossReached,
        width: data.width,
        bossCol,
    };
}

const results = [];
for (let n = 1; n <= 8; n++) {
    results.push(await analyzeStage(n));
}
results.push(await analyzeStage(9));  // secret

for (const r of results) {
    const pct = r.total === 0 ? 100 : Math.round(r.reachable / r.total * 100);
    const flag = r.bossReached && r.gapCount === 0 ? 'OK ' : '!!!';
    console.log(`${flag} Stage ${r.stageN}: ${r.reachable}/${r.total} cells (${pct}%), boss reached: ${r.bossReached}, gaps: ${r.gapCount}`);
    if (r.gapCount > 0 && r.gapCount < 20) {
        for (const g of r.gaps.slice(0, 6)) {
            console.log(`     unreachable row ${g.row} cols ${g.startCol}-${g.endCol}`);
        }
    }
}

await browser.close();

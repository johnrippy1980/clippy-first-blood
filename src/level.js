// Level data + collision. Tile-based grid. Each stage's geometry is
// authored in TILES below. Collision is AABB-vs-tile.

import { TILE, GAME, THEME } from './constants.js';

const W = 1; const E = 0;
const P = 2; // platform (one-way)
const L = 3; // ladder
const S = 4; // spike
const X = 9; // exit

// Stage 1 — Office Park Jungle.
// Each row is 16 tiles wide × n cols tall mapped to GAME.TILE pixels (16px).
// Width here is just whatever fits the design; the camera scrolls.
function makeStage1() {
    const w = 96, h = 14;
    const g = Array.from({length: h}, () => new Array(w).fill(E));
    // Ground
    for (let x = 0; x < w; x++) {
        g[h - 1][x] = W;
        g[h - 2][x] = W;
    }
    // Platforms and shapes
    const set = (r, c, v) => { if (g[r] && c >= 0 && c < w) g[r][c] = v; };
    const rect = (r, c, rw, rh, v) => { for (let dr = 0; dr < rh; dr++) for (let dc = 0; dc < rw; dc++) set(r + dr, c + dc, v); };
    const plat = (r, c, len) => { for (let i = 0; i < len; i++) set(r, c + i, P); };

    plat(10, 8,  4);
    plat( 8, 14, 5);
    plat(10, 22, 4);
    rect( 9, 28, 1, 3, W);
    plat( 7, 32, 4);
    plat( 5, 36, 3);
    plat( 8, 40, 5);
    rect( 8, 46, 3, 4, W); // raised platform block
    plat( 6, 52, 4);
    plat( 9, 58, 5);
    plat( 7, 66, 6);
    plat(10, 74, 3);
    // Boss arena: open area, ground only
    rect( h - 3, 86, 8, 1, W); // raised platform for boss arena
    // Exit door near end
    set(h - 3, w - 4, X);

    return {
        tiles: g, width: w, height: h, theme: THEME.JUNGLE,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 86 * GAME.TILE },
        enemySpawns: [
            { x: 16 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 24 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 32 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 40 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
            { x: 48 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'cabinet' },
            { x: 60 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 70 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
        ],
        pickupSpawns: [
            { x: 36 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'LASER' },
        ],
        crateSpawns: [
            { x: 18 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 54 * GAME.TILE, y: ( 4) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 66 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 78 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'THUNDER' },
        ]
    };
}

// Generic procedural stage builder. Used for the other 7 themes until
// they get hand-crafted layouts; deterministic so the screenshot test
// is reproducible.
function makeProcStage(theme, seed) {
    const w = 80, h = 14;
    const g = Array.from({length: h}, () => new Array(w).fill(E));
    for (let x = 0; x < w; x++) { g[h-1][x] = W; g[h-2][x] = W; }
    const set = (r, c, v) => { if (g[r] && c >= 0 && c < w) g[r][c] = v; };
    const plat = (r, c, len) => { for (let i = 0; i < len; i++) set(r, c + i, P); };
    let rng = seed;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };

    let lastRow = h - 3;
    for (let x = 6; x < w - 8; x += 5 + Math.floor(rand() * 4)) {
        const row = 5 + Math.floor(rand() * 6);
        const len = 3 + Math.floor(rand() * 4);
        plat(row, x, len);
        if (Math.abs(row - lastRow) > 3 && rand() < 0.4) {
            plat(Math.floor((row + lastRow) / 2), x - 2, 2);
        }
        lastRow = row;
    }
    // Spike pit in middle
    if (rand() < 0.5) {
        const px = 30 + Math.floor(rand() * 12);
        for (let i = 0; i < 3; i++) set(h - 3, px + i, S);
    }
    set(h - 3, w - 4, X);

    const enemySpawns = [];
    const types = ['stapler', 'folder', 'cabinet'];
    for (let i = 0; i < 7; i++) {
        const ex = 12 + i * 8;
        enemySpawns.push({ x: ex * GAME.TILE, y: (h - 3) * GAME.TILE, type: types[Math.floor(rand() * types.length)] });
    }
    const drops = ['SPREAD', 'LASER', 'FLAME', 'HOMING', 'THUNDER', 'LIFE'];
    const crateSpawns = [];
    for (let i = 0; i < 5; i++) {
        const cx = 18 + Math.floor(rand() * (w - 24));
        crateSpawns.push({ x: cx * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: drops[Math.floor(rand() * drops.length)] });
    }

    return {
        tiles: g, width: w, height: h, theme,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: (w - 10) * GAME.TILE },
        enemySpawns, pickupSpawns: [], crateSpawns
    };
}

// ============================================================
// Hand-crafted stage builders. Each is the layout for its theme.
// Helpers used by all of them.
// ============================================================
function blankStage(w, h, theme) {
    const g = Array.from({length: h}, () => new Array(w).fill(E));
    // Solid floor
    for (let x = 0; x < w; x++) { g[h-1][x] = W; g[h-2][x] = W; }
    return { g, w, h, theme };
}
function setT(g, r, c, v) { if (g[r] && c >= 0 && c < g[0].length) g[r][c] = v; }
function rectT(g, r, c, rw, rh, v) { for (let dr = 0; dr < rh; dr++) for (let dc = 0; dc < rw; dc++) setT(g, r + dr, c + dc, v); }
function platT(g, r, c, len) { for (let i = 0; i < len; i++) setT(g, r, c + i, P); }
function spikeRow(g, r, c, len) { for (let i = 0; i < len; i++) setT(g, r, c + i, S); }
function ladderT(g, r, c, h) { for (let i = 0; i < h; i++) setT(g, r + i, c, L); }

// Stage 2 — Break Room. Vending-machine cover, coffee-puddle slip hazards,
// tables to vault, recycle-bin pits.
function makeStage2() {
    const w = 100, h = 14;
    const { g } = blankStage(w, h, THEME.BREAKROOM);
    // First section: tables to jump
    platT(g, 10, 8, 4);
    platT(g, 10, 16, 4);
    rectT(g, 11, 22, 1, 3, W);  // big counter
    // Coffee puddles
    spikeRow(g, h - 3, 26, 2);
    platT(g, 8, 30, 5);
    // Vending machine wall — solid block
    rectT(g, 8, 38, 1, 4, W);
    rectT(g, 8, 42, 1, 4, W);
    // Floating snack-cake platforms over puddle pit
    spikeRow(g, h - 3, 46, 3);
    platT(g, 9, 46, 3);
    platT(g, 7, 50, 3);
    platT(g, 9, 54, 4);
    // Mid-stage break: low table
    rectT(g, 11, 60, 4, 1, W);
    platT(g, 7, 65, 4);
    platT(g, 9, 70, 5);
    // Approach to boss
    rectT(g, 9, 78, 2, 4, W);   // raised platform
    spikeRow(g, h - 3, 82, 2);
    platT(g, 9, 86, 5);
    // Boss arena
    setT(g, h - 3, w - 4, X);

    return {
        tiles: g, width: w, height: h, theme: THEME.BREAKROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 90 * GAME.TILE },
        enemySpawns: [
            { x: 14 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
            { x: 22 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'folder' },
            { x: 34 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
            { x: 38 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'cabinet' },
            { x: 50 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'folder' },
            { x: 60 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
            { x: 68 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'folder' },
            { x: 72 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [],
        crateSpawns: [
            { x: 10 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 32 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 50 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'FLAME' },
            { x: 65 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 85 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'LASER' },
        ]
    };
}

// Stage 3 — Server Room. Electric-floor hazards, fan-blade rotation
// (treated as moving spikes), vertical ladder climbs between server racks.
function makeStage3() {
    const w = 100, h = 16;
    const { g } = blankStage(w, h, THEME.SERVERROOM);
    // Server rack pillars
    rectT(g, 6, 10, 2, 8, W);
    rectT(g, 6, 18, 2, 6, W); platT(g, 6, 18, 2);
    rectT(g, 4, 26, 2, 8, W);
    // Ladder beside it
    ladderT(g, 5, 25, 9);
    // Electric floor section
    spikeRow(g, h - 3, 32, 4);
    platT(g, 10, 32, 2);
    platT(g, 8, 36, 2);
    // Big server tower with platforms going up
    rectT(g, 4, 40, 3, 9, W);
    platT(g, 12, 43, 4);
    platT(g, 9, 47, 4);
    platT(g, 6, 50, 3);
    // Ceiling drop
    rectT(g, 0, 54, 3, 1, W);
    rectT(g, 0, 55, 3, 1, W);
    // Electric floor #2
    spikeRow(g, h - 3, 58, 5);
    platT(g, 10, 58, 2);
    platT(g, 8, 62, 2);
    // Pre-boss climb
    rectT(g, 5, 70, 2, 8, W);
    ladderT(g, 6, 72, 8);
    platT(g, 9, 76, 5);
    platT(g, 7, 82, 4);
    // Boss arena
    setT(g, h - 3, w - 4, X);

    return {
        tiles: g, width: w, height: h, theme: THEME.SERVERROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 90 * GAME.TILE },
        enemySpawns: [
            { x: 14 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
            { x: 20 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 30 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 42 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
            { x: 50 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'folder' },
            { x: 56 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'cabinet' },
            { x: 64 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'holepunch' },
            { x: 74 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'folder' },
            { x: 80 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'cabinet' },
        ],
        pickupSpawns: [],
        crateSpawns: [
            { x: 16 * GAME.TILE, y: (h-3) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 32 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'LASER' },
            { x: 46 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 60 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 80 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'LIFE' },
        ]
    };
}

// Stage 4 — Board Room. Long conference table jumps, executive chairs as
// breakable cover, projectors raining slides.
function makeStage4() {
    const w = 100, h = 14;
    const { g } = blankStage(w, h, THEME.BOARDROOM);
    // Long table sections at platform height
    platT(g, 10, 8, 8);
    platT(g, 10, 20, 10);
    platT(g, 10, 34, 8);
    platT(g, 10, 46, 10);
    platT(g, 10, 60, 8);
    platT(g, 10, 72, 6);
    // Suspended chandeliers
    platT(g, 5, 14, 2);
    platT(g, 5, 28, 3);
    platT(g, 5, 42, 2);
    platT(g, 5, 56, 3);
    platT(g, 5, 70, 2);
    // Floor pits between tables
    spikeRow(g, h - 3, 17, 2);
    spikeRow(g, h - 3, 31, 2);
    spikeRow(g, h - 3, 44, 2);
    spikeRow(g, h - 3, 58, 1);
    // Approach to boss
    rectT(g, 9, 82, 2, 3, W);
    setT(g, h - 3, w - 4, X);

    return {
        tiles: g, width: w, height: h, theme: THEME.BOARDROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 88 * GAME.TILE },
        enemySpawns: [
            { x: 12 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 24 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'stapler' },
            { x: 36 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'cabinet' },
            { x: 44 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'holepunch' },
            { x: 50 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'stapler' },
            { x: 58 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'holepunch' },
            { x: 66 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'cabinet' },
            { x: 74 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [],
        crateSpawns: [
            { x: 18 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 38 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 52 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'THUNDER' },
            { x: 68 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 80 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'HOMING' },
        ]
    };
}

// Stage 5 — Keynote Hall. Stage scaffolding climb, spotlight pits, audience
// seats as cover. Tall vertical section.
function makeStage5() {
    const w = 100, h = 18;
    const { g } = blankStage(w, h, THEME.KEYNOTE);
    // Lower section: audience seats
    for (let c = 6; c < 20; c += 3) rectT(g, h - 3, c, 1, 1, P);
    platT(g, 13, 22, 4);
    platT(g, 11, 28, 4);
    platT(g, 13, 34, 4);
    // Stage steps (going up)
    platT(g, 13, 42, 3);
    platT(g, 11, 46, 3);
    platT(g, 9, 50, 3);
    platT(g, 7, 54, 3);
    // Scaffolding column
    rectT(g, 3, 58, 1, 13, W);
    ladderT(g, 4, 60, 12);
    // Top catwalk
    platT(g, 4, 62, 8);
    platT(g, 6, 72, 4);
    // Spotlight pits
    spikeRow(g, h - 3, 24, 2);
    spikeRow(g, h - 3, 36, 2);
    // Drop back to bottom for boss arena
    platT(g, 9, 78, 5);
    platT(g, 12, 84, 5);
    setT(g, h - 3, w - 4, X);

    return {
        tiles: g, width: w, height: h, theme: THEME.KEYNOTE,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 90 * GAME.TILE },
        enemySpawns: [
            { x: 14 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
            { x: 25 * GAME.TILE, y: (12) * GAME.TILE, type: 'folder' },
            { x: 32 * GAME.TILE, y: (10) * GAME.TILE, type: 'holepunch' },
            { x: 44 * GAME.TILE, y: (12) * GAME.TILE, type: 'folder' },
            { x: 52 * GAME.TILE, y: (10) * GAME.TILE, type: 'holepunch' },
            { x: 64 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 68 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'cabinet' },
            { x: 76 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 84 * GAME.TILE, y: (11) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [],
        crateSpawns: [
            { x: 22 * GAME.TILE, y: (12) * GAME.TILE - 14, drop: 'LASER' },
            { x: 50 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 64 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 72 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'THUNDER' },
            { x: 84 * GAME.TILE, y: (11) * GAME.TILE - 14, drop: 'LIFE' },
        ]
    };
}

// Stage 6 — Founder's Lair. Forking high/low paths. Vertical server stacks.
function makeStage6() {
    const w = 110, h = 16;
    const { g } = blankStage(w, h, THEME.FOUNDER);
    // Ceiling
    for (let x = 0; x < w; x++) g[0][x] = W;
    // Vertical entry — climb up to choose path
    rectT(g, 6, 6, 1, 7, W);
    ladderT(g, 4, 8, 10);
    platT(g, 4, 6, 6);
    // High path: catwalks
    platT(g, 4, 14, 6);
    platT(g, 4, 22, 6);
    platT(g, 4, 30, 6);
    platT(g, 4, 38, 6);
    platT(g, 4, 46, 6);
    // Low path: ground with hazards
    spikeRow(g, h - 3, 18, 3);
    spikeRow(g, h - 3, 30, 3);
    spikeRow(g, h - 3, 42, 3);
    // Connecting ladders
    ladderT(g, 5, 24, 8);
    ladderT(g, 5, 40, 8);
    // Both paths converge
    rectT(g, 4, 54, 1, 8, W);
    ladderT(g, 5, 55, 8);
    platT(g, 9, 56, 6);
    // Final approach with vertical climb
    rectT(g, 3, 66, 1, 11, W);
    ladderT(g, 4, 67, 10);
    platT(g, 6, 68, 4);
    platT(g, 9, 74, 4);
    // Boss arena
    rectT(g, 9, 84, 3, 3, W);
    setT(g, h - 3, w - 4, X);

    return {
        tiles: g, width: w, height: h, theme: THEME.FOUNDER,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 95 * GAME.TILE },
        enemySpawns: [
            { x: 12 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
            { x: 18 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 26 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 28 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
            { x: 36 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 46 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'cabinet' },
            { x: 52 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 58 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
            { x: 66 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'cabinet' },
            { x: 72 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'folder' },
            { x: 80 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'cabinet' },
        ],
        pickupSpawns: [],
        crateSpawns: [
            { x: 12 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'LASER' },
            { x: 28 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 44 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 56 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'THUNDER' },
            { x: 78 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'LIFE' },
        ]
    };
}

// Stage 7 — Boss Rush. Small arena, no real platforming, lots of bosses.
// (Boss spawns are handled by game.js when bossSpawned triggers, so this
// stage just provides the arena.)
function makeStage7() {
    const w = 40, h = 14;
    const { g } = blankStage(w, h, THEME.SERVERROOM);
    // Side walls
    rectT(g, 0, 0, 1, h, W);
    rectT(g, 0, w - 1, 1, h, W);
    // Platforms for vertical maneuvering
    platT(g, 9, 6, 4);
    platT(g, 7, 14, 4);
    platT(g, 9, 22, 4);
    platT(g, 7, 30, 4);
    // No exit door — boss-rush ends when bosses are dead
    return {
        tiles: g, width: w, height: h, theme: THEME.SERVERROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 6 * GAME.TILE },  // immediate
        enemySpawns: [
            // Light grunt sweep before boss waves
            { x: 12 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
            { x: 28 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [
            { x: 18 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
            { x: 22 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
        ],
        crateSpawns: [
            { x: 10 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'THUNDER' },
        ]
    };
}

// Stage 8 — The Cloud. Floating platforms in a void, gravity-flip illusion
// via inverted platforms on the ceiling. Final approach to The Algorithm.
function makeStage8() {
    const w = 110, h = 16;
    const { g } = blankStage(w, h, THEME.CLOUD);
    // Sparse floating platforms — no continuous ground after first stretch
    // Section 1: short ground intro
    for (let x = w - 10; x < w; x++) { g[h-1][x] = E; g[h-2][x] = E; }  // pit at boss
    // Floating archipelago
    platT(g,  9, 14, 5);
    platT(g, 12, 22, 4);
    platT(g,  7, 24, 4);
    platT(g, 10, 32, 6);
    platT(g,  5, 36, 4);
    platT(g, 12, 44, 5);
    platT(g,  8, 50, 4);
    platT(g,  4, 54, 5);
    platT(g, 10, 60, 5);
    platT(g,  6, 66, 5);
    platT(g, 12, 72, 4);
    platT(g,  9, 78, 5);
    // Ceiling platforms (inverted feel)
    platT(g,  2, 28, 3);
    platT(g,  2, 48, 3);
    platT(g,  2, 70, 3);
    // Data-rain hazard strip near top
    spikeRow(g, 1, 16, 4);
    spikeRow(g, 1, 60, 4);
    // Approach to Algorithm — floating cube platform
    rectT(g, 8, 88, 4, 3, W);
    rectT(g, 9, 95, 5, 1, W);
    setT(g, 8, w - 4, X);  // exit tile up high

    return {
        tiles: g, width: w, height: h, theme: THEME.CLOUD,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 100 * GAME.TILE },
        enemySpawns: [
            { x: 18 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
            { x: 26 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'holepunch' },
            { x: 34 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 40 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'holepunch' },
            { x: 50 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'folder' },
            { x: 56 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 64 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 70 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 78 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'folder' },
        ],
        pickupSpawns: [],
        crateSpawns: [
            { x: 30 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'LASER' },
            { x: 38 * GAME.TILE, y: ( 4) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 54 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 64 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'THUNDER' },
            { x: 76 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'LIFE' },
        ]
    };
}

// Stage 9 — Secret Recycle Bin. Short brutal arena. Unlocked by no-damage stage-1 clear.
function makeStage9() {
    const w = 60, h = 14;
    const { g } = blankStage(w, h, THEME.SERVERROOM);
    // Tight corridor with thicket of spikes + tough enemies
    rectT(g, 0, 0, 1, h, W);
    rectT(g, 0, w - 1, 1, h, W);
    platT(g, 10, 6, 4);
    platT(g, 7, 12, 4);
    platT(g, 10, 18, 4);
    platT(g, 7, 24, 4);
    spikeRow(g, h - 3, 14, 3);
    spikeRow(g, h - 3, 28, 3);
    rectT(g, 8, 36, 2, 4, W);
    platT(g, 6, 42, 5);
    setT(g, h - 3, w - 4, X);
    return {
        tiles: g, width: w, height: h, theme: THEME.SERVERROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 50 * GAME.TILE },
        enemySpawns: [
            { x: 14 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'cabinet' },
            { x: 22 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'holepunch' },
            { x: 32 * GAME.TILE, y: (h-3) * GAME.TILE, type: 'cabinet' },
            { x: 40 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
        ],
        pickupSpawns: [
            { x: 18 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
            { x: 36 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
        ],
        crateSpawns: [
            { x: 24 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 44 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'THUNDER' },
        ]
    };
}

export const STAGE_LOADERS = [
    null,
    () => makeStage1(),
    () => makeStage2(),
    () => makeStage3(),
    () => makeStage4(),
    () => makeStage5(),
    () => makeStage6(),
    () => makeStage7(),
    () => makeStage8(),
    () => makeStage9(),  // Secret
];

// Tile palette per theme. Each theme has [solid, solid_top, platform].
const THEME_PALETTE = {
    [THEME.JUNGLE]:     { solid: '#2a4018', solidTop: '#4a8a30', platform: '#5a4030', plank: '#3a2818', accent: '#609040' },
    [THEME.BREAKROOM]:  { solid: '#3a2a40', solidTop: '#5a4060', platform: '#705048', plank: '#3a2818', accent: '#a06080' },
    [THEME.SERVERROOM]: { solid: '#181828', solidTop: '#2a2a40', platform: '#404050', plank: '#101018', accent: '#4080c0' },
    [THEME.BOARDROOM]:  { solid: '#2a2018', solidTop: '#604030', platform: '#806040', plank: '#3a2818', accent: '#c08040' },
    [THEME.KEYNOTE]:    { solid: '#1a1820', solidTop: '#302a40', platform: '#403050', plank: '#181018', accent: '#8060a0' },
    [THEME.FOUNDER]:    { solid: '#1a0a18', solidTop: '#401838', platform: '#502848', plank: '#180810', accent: '#a04080' },
    [THEME.CLOUD]:      { solid: '#101830', solidTop: '#203850', platform: '#303860', plank: '#101830', accent: '#4060a0' },
};

export class Level {
    constructor(data) {
        this.data = data;
        this.tiles = data.tiles;
        this.width = data.width * GAME.TILE;
        this.height = data.height * GAME.TILE;
        this.palette = THEME_PALETTE[data.theme] || THEME_PALETTE[THEME.JUNGLE];
        this.frame = 0;
        this.tileAnimTick = 0;
    }

    update() {
        this.frame++;
        if (this.frame % 8 === 0) this.tileAnimTick++;
    }

    tileAt(px, py) {
        const tx = Math.floor(px / GAME.TILE);
        const ty = Math.floor(py / GAME.TILE);
        if (ty < 0 || ty >= this.data.height || tx < 0 || tx >= this.data.width) return TILE.EMPTY;
        return this.tiles[ty][tx];
    }

    isSolid(px, py, allowPlatform = false, prevY = null) {
        const t = this.tileAt(px, py);
        if (t === TILE.SOLID) return true;
        if (t === TILE.PLATFORM) {
            // One-way: solid only if we were above it last frame
            if (!allowPlatform) return false;
            const ty = Math.floor(py / GAME.TILE);
            const tileTop = ty * GAME.TILE;
            return prevY != null && prevY <= tileTop;
        }
        return false;
    }

    isHazard(px, py) {
        const t = this.tileAt(px, py);
        return t === TILE.SPIKE || t === TILE.HAZARD;
    }

    isExit(px, py) {
        return this.tileAt(px, py) === TILE.EXIT;
    }

    // AABB sweep — call separately for x and y. Returns adjusted position.
    moveX(box, dx) {
        const sign = Math.sign(dx);
        if (sign === 0) return { x: box.x, hit: false };
        const newX = box.x + dx;
        const probeX = sign > 0 ? newX + box.w - 1 : newX;
        const ys = [box.y, box.y + box.h / 2, box.y + box.h - 1];
        for (const py of ys) {
            if (this.isSolid(probeX, py)) {
                // Snap to tile boundary
                const tx = Math.floor(probeX / GAME.TILE);
                const tileEdge = sign > 0 ? tx * GAME.TILE : (tx + 1) * GAME.TILE;
                return { x: sign > 0 ? tileEdge - box.w : tileEdge, hit: true };
            }
        }
        return { x: newX, hit: false };
    }

    moveY(box, dy, allowPlatform = true, fromVy = 0) {
        const sign = Math.sign(dy);
        if (sign === 0) return { y: box.y, hit: false, landed: false };
        const newY = box.y + dy;
        const probeY = sign > 0 ? newY + box.h - 1 : newY;
        const xs = [box.x + 1, box.x + box.w / 2, box.x + box.w - 2];
        for (const px of xs) {
            const t = this.tileAt(px, probeY);
            const isPlatformLanding = (t === TILE.PLATFORM) && sign > 0 && allowPlatform &&
                (box.y + box.h <= Math.floor(probeY / GAME.TILE) * GAME.TILE);
            if (t === TILE.SOLID || isPlatformLanding) {
                const ty = Math.floor(probeY / GAME.TILE);
                const tileEdge = sign > 0 ? ty * GAME.TILE : (ty + 1) * GAME.TILE;
                return {
                    y: sign > 0 ? tileEdge - box.h : tileEdge,
                    hit: true,
                    landed: sign > 0
                };
            }
        }
        return { y: newY, hit: false, landed: false };
    }

    // Render visible tiles only.
    draw(ctx, camera) {
        const T = GAME.TILE;
        const startCol = Math.max(0, Math.floor(camera.viewX / T));
        const endCol = Math.min(this.data.width, Math.ceil((camera.viewX + GAME.W) / T) + 1);
        const startRow = Math.max(0, Math.floor(camera.viewY / T));
        const endRow = Math.min(this.data.height, Math.ceil((camera.viewY + GAME.H) / T) + 1);

        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                const t = this.tiles[r][c];
                if (t === TILE.EMPTY) continue;
                const x = c * T - camera.viewX;
                const y = r * T - camera.viewY;
                this._drawTile(ctx, t, x, y, r, c);
            }
        }
    }

    _drawTile(ctx, t, x, y, r, c) {
        const T = GAME.TILE;
        const pal = this.palette;
        switch (t) {
            case TILE.SOLID: {
                const topIsAir = r === 0 || this.tiles[r - 1][c] === TILE.EMPTY;
                ctx.fillStyle = pal.solid;
                ctx.fillRect(x, y, T, T);
                if (topIsAir) {
                    ctx.fillStyle = pal.solidTop;
                    ctx.fillRect(x, y, T, 3);
                    ctx.fillStyle = pal.accent;
                    for (let i = 0; i < 4; i++) {
                        ctx.fillRect(x + i * 4 + ((c + r) % 3), y + 3, 1, 1);
                    }
                }
                // Speckle for texture
                ctx.fillStyle = pal.plank;
                for (let i = 0; i < 3; i++) {
                    const sx = ((c * 17 + i * 7 + r * 3) % T);
                    const sy = ((r * 13 + i * 5 + c * 2) % (T - 4)) + 4;
                    ctx.fillRect(x + sx, y + sy, 1, 1);
                }
                break;
            }
            case TILE.PLATFORM:
                ctx.fillStyle = pal.platform;
                ctx.fillRect(x, y, T, 4);
                ctx.fillStyle = pal.plank;
                ctx.fillRect(x, y + 4, T, 1);
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x, y, T, 1);
                break;
            case TILE.LADDER:
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x + 1, y, 2, T);
                ctx.fillRect(x + T - 3, y, 2, T);
                ctx.fillRect(x + 1, y + 4 + (this.tileAnimTick % 8), T - 2, 1);
                break;
            case TILE.SPIKE:
                ctx.fillStyle = '#404040';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(x + i * 4, y + T - 6, 3, 6);
                    ctx.fillStyle = '#8a8a90';
                    ctx.fillRect(x + i * 4 + 1, y + T - 5, 1, 5);
                    ctx.fillStyle = '#404040';
                }
                break;
            case TILE.EXIT:
                ctx.fillStyle = '#100818';
                ctx.fillRect(x + 2, y - 12, T - 4, T + 12);
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x + 2, y - 12, T - 4, 2);
                ctx.fillRect(x + 2, y - 12, 1, T + 12);
                ctx.fillRect(x + T - 3, y - 12, 1, T + 12);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(x + T / 2 - 1, y + 2, 1, 2);
                break;
            case TILE.HAZARD:
                ctx.fillStyle = '#ff5050';
                ctx.fillRect(x, y, T, T);
                ctx.fillStyle = '#ffe070';
                if (this.tileAnimTick % 2) {
                    ctx.fillRect(x + 4, y + 4, T - 8, T - 8);
                }
                break;
        }
    }
}

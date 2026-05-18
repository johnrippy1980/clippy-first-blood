// Level data + collision. Tile-based grid. Each stage's geometry is
// authored in TILES below. Collision is AABB-vs-tile.

import { TILE, GAME, THEME } from './constants.js';
import { sprites } from './sprites.js';

// ============================================================
// Tall-grass sprite cache. We bake 4 sway frames once into a row of
// offscreen canvases so per-tile draws are just blits, and the bends
// are real curves (parabolic) instead of fixed 1px vertical bars.
// ============================================================
const GRASS_FRAME_W = 16;   // tile width
const GRASS_FRAME_H = 22;   // overshoot above the tile so blades poke up
const GRASS_FRAMES = 4;
let _grassSprites = null;   // [bgCanvas[], fgCanvas[]] — built lazily on first use

function _buildGrassSprites() {
    if (_grassSprites) return _grassSprites;
    if (typeof document === 'undefined') {
        _grassSprites = { bg: [], fg: [] };
        return _grassSprites;
    }
    const bg = [];
    const fg = [];
    // 5 blades per tile, each with a random hue between dark and bright green,
    // a parabolic bend amount, and a height. Deterministic via fixed seeds so
    // every grass tile looks the same across frames (the SWAY is what differs).
    const blades = [];
    const BLADE_COLORS_BG = ['#1e3812', '#2a4a1c', '#1a3010', '#244018'];
    const BLADE_COLORS_FG = ['#4a8024', '#3a6024', '#5a9028', '#3a5818'];
    const TIP_COLORS = ['#a8c844', '#8eb838', '#c0d860'];
    for (let i = 0; i < 6; i++) {
        // Stable pseudo-random per blade index — no Math.random in render hot path.
        const h = (i * 2654435761) >>> 0;
        const baseX = i * 3 + ((h >> 3) & 1);      // wider gaps so blades read separately
        const tipH = 12 + ((h >> 5) % 9);          // 12..20 px tall
        const bendDir = ((h >> 7) & 1) ? 1 : -1;   // left or right curl
        blades.push({
            x: baseX,
            tipH,
            bendDir,
            bendAmt: 2 + ((h >> 9) % 3),           // 2..4 px peak deflection — more visible curl
            bg: BLADE_COLORS_BG[(h >> 11) % BLADE_COLORS_BG.length],
            fg: BLADE_COLORS_FG[(h >> 13) % BLADE_COLORS_FG.length],
            tip: TIP_COLORS[(h >> 15) % TIP_COLORS.length],
        });
    }
    for (let f = 0; f < GRASS_FRAMES; f++) {
        // Per-frame wind phase — sin oscillation across the 4 frames.
        // Amplitude 1.0 means a blade with bendAmt=4 bends by 4px at extremes.
        const wind = Math.sin((f / GRASS_FRAMES) * Math.PI * 2) * 1.0;
        for (const layer of ['bg', 'fg']) {
            const cvs = document.createElement('canvas');
            cvs.width = GRASS_FRAME_W;
            cvs.height = GRASS_FRAME_H;
            const ctx = cvs.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            // Background pass paints the dark mat at the base
            if (layer === 'bg') {
                ctx.fillStyle = 'rgba(20, 32, 16, 0.45)';
                ctx.fillRect(0, GRASS_FRAME_H - 4, GRASS_FRAME_W, 4);
            }
            // Walk every blade. For each y in the blade height, plot a pixel
            // at the x = base + bend(y) where bend follows a parabola from 0
            // at the root to bendAmt*wind*bendDir at the tip.
            for (const b of blades) {
                const baseY = GRASS_FRAME_H - 1;
                const tipY = baseY - b.tipH;
                // Tone — fg pass paints the brighter sides of each blade
                const stalkColor = (layer === 'fg') ? b.fg : b.bg;
                for (let py = baseY; py >= tipY; py--) {
                    const t = (baseY - py) / b.tipH;     // 0 at base, 1 at tip
                    const bend = (t * t) * b.bendAmt * wind * b.bendDir;
                    const px = Math.round(b.x + bend);
                    if (px < 0 || px >= GRASS_FRAME_W) continue;
                    // Stalk pixel
                    ctx.fillStyle = stalkColor;
                    ctx.fillRect(px, py, 1, 1);
                    // Brighter highlight on the leeward edge (one pixel right)
                    if (layer === 'fg' && t > 0.3 && t < 0.95) {
                        ctx.fillStyle = b.fg;
                        ctx.fillRect(px + b.bendDir, py, 1, 1);
                    }
                }
                // Tip cap — bright on fg pass only
                if (layer === 'fg') {
                    const tBend = b.bendAmt * wind * b.bendDir;
                    const tipX = Math.round(b.x + tBend);
                    ctx.fillStyle = b.tip;
                    if (tipX >= 0 && tipX < GRASS_FRAME_W) {
                        ctx.fillRect(tipX, tipY, 1, 1);
                    }
                }
            }
            (layer === 'bg' ? bg : fg).push(cvs);
        }
    }
    _grassSprites = { bg, fg };
    return _grassSprites;
}

const GROUND_BITMAP_KEY = {
    [THEME.JUNGLE]:     'ground_jungle',
    [THEME.BREAKROOM]:  'ground_breakroom',
    [THEME.SERVERROOM]: 'ground_serverroom',
    [THEME.BOARDROOM]:  'ground_boardroom',
    [THEME.KEYNOTE]:    'ground_keynote',
    [THEME.FOUNDER]:    'ground_founder',
    [THEME.CLOUD]:      'ground_cloud',
};

const W = 1; const E = 0;
const P = 2; // platform (one-way)
const L = 3; // ladder
const S = 4; // spike
const C = 7; // cover (theme-specific duck-behind: tree, vending machine, etc.)
const X = 9; // exit
const G = 10; // tall grass — pass-through, hides player from AI

// Stage 1 — Office Park Jungle.
// Each row is 16 tiles wide × n cols tall mapped to GAME.TILE pixels (16px).
// Width here is just whatever fits the design; the camera scrolls.
function makeStage1() {
    // Stage 1 — Office Park Jungle. Trimmed from 96→64 tiles.
    // Pacing target: ~30s to boss for a competent player. Teaches: run, jump,
    // double-jump, shoot, wade, duck-hide.
    const w = 64, h = 14;
    const g = Array.from({length: h}, () => new Array(w).fill(E));
    for (let x = 0; x < w; x++) { g[h - 1][x] = W; g[h - 2][x] = W; }
    const set = (r, c, v) => { if (g[r] && c >= 0 && c < w) g[r][c] = v; };
    const rect = (r, c, rw, rh, v) => { for (let dr = 0; dr < rh; dr++) for (let dc = 0; dc < rw; dc++) set(r + dr, c + dc, v); };
    const plat = (r, c, len) => { for (let i = 0; i < len; i++) set(r, c + i, P); };

    // Section A (x 0–18): WARMUP. Two staplers, low platform, first crate.
    plat(10, 8, 4);
    plat( 8, 14, 4);

    // Section B (x 18–30): FIRST SWAMP — sniper perch teaches duck-hide.
    for (let i = 0; i < 5; i++) g[h - 2][22 + i] = TILE.WATER;
    rect(9, 28, 1, 3, W);

    // Section C (x 30–44): VERTICALITY — bait crate up high, cabinet down low.
    plat(7, 32, 4);
    plat(5, 36, 3);     // top-tier crate platform
    plat(8, 42, 4);

    // Section D (x 44–58): SECOND SWAMP — wider, second sniper.
    for (let i = 0; i < 6; i++) g[h - 2][46 + i] = TILE.WATER;
    plat(7, 52, 4);

    // Section E (x 58–62): BOSS APPROACH — open ground, exit door.
    set(h - 3, w - 4, X);
    // Cover trees — placed near each holepunch sniper. Player holds UP to
    // crouch behind and become invulnerable while shots arc overhead.
    set(h - 3, 19, C);   // near sniper at col 19
    set(h - 3, 44, C);   // near sniper at col 44
    // Tall-grass patches — passive cover. Walk in, enemies lose lock.
    // Cluster 1: between sections A and B, taught before the first sniper.
    for (let i = 0; i < 3; i++) set(h - 3, 11 + i, G);
    // Cluster 2: between sections C and D, on the path to the second swamp.
    for (let i = 0; i < 3; i++) set(h - 3, 38 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.JUNGLE,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 58 * GAME.TILE },
        // Mini-boss: appears after the first swamp, before the second.
        // Same kind as the stage boss (COPIER_3000) at 35% HP — a warmup round.
        miniBossTrigger: 30 * GAME.TILE,
        owlRoosts: [
            { x: 14 * GAME.TILE, y: 3 * GAME.TILE + 6 },
            { x: 38 * GAME.TILE, y: 2 * GAME.TILE + 4 },
        ],
        enemySpawns: [
            // A: early-contact stapler, no empty opening
            { x:  9 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            // B: sniper above the first swamp — teaches duck-hide.
            // Added: cabinet on far side of swamp so the wade-out feels
            // contested, not free (user feedback: swamp items needed enemies).
            { x: 19 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 28 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // C: folder up high, cabinet down low — tests verticality + ranged choice
            { x: 36 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'folder' },
            { x: 42 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // D: second swamp sniper — reinforce duck-hide muscle memory.
            // Added: folder hovering over the second swamp so the player
            // must choose between wading (slow, under fire) or rushing.
            { x: 44 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 49 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
            { x: 54 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [
            { x: 36 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'LASER' },
            // Reward for clearing each swamp — a pickup sits on the far bank,
            // contested by the added grunts. Wading is now worth it.
            { x: 26 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'SPREAD' },
            { x: 51 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
        ],
        crateSpawns: [
            { x: 14 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 36 * GAME.TILE, y: ( 4) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 52 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'HOMING' },
        ]
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
    // Stage 2 — The Break Room. Trimmed from 100→72 tiles to match stage 1
    // onboarding cadence. Teaches: table-hopping, coffee-puddle hazards,
    // vertical snack-platform routes.
    const w = 72, h = 14;
    const { g } = blankStage(w, h, THEME.BREAKROOM);

    // Section A (x 0–18): WARMUP — two break-room tables to learn the jump rhythm.
    platT(g, 10, 6, 4);
    platT(g, 10, 14, 4);

    // Section B (x 18–32): COFFEE PUDDLE — spikes on floor, walk-around counter.
    spikeRow(g, h - 3, 20, 3);
    rectT(g, 11, 24, 1, 3, W);   // counter to climb
    platT(g, 8, 28, 4);

    // Section C (x 32–46): VENDING WALL + SNACK PLATFORMS — vertical route.
    rectT(g, 8, 34, 1, 4, W);    // vending machine wall
    platT(g, 9, 38, 3);
    platT(g, 7, 42, 4);          // top route

    // Section D (x 46–60): SECOND PUDDLE — wider, requires snack-cake hop.
    spikeRow(g, h - 3, 48, 4);
    platT(g, 9, 48, 3);
    platT(g, 7, 53, 3);
    platT(g, 9, 57, 4);

    // Section E (x 60–68): BOSS APPROACH — low table, clear ground to door.
    rectT(g, 11, 60, 3, 1, W);
    setT(g, h - 3, w - 4, X);
    // Vending-machine cover — duck-behind near the folder sniper at col 22.
    setT(g, h - 3, 24, C);
    // Second cover near the sniper above the second puddle.
    setT(g, h - 3, 52, C);
    // Tablecloth hide — duck under a low table. Two placements: before the
    // first coffee puddle (teaches the mechanic) and between vending wall
    // and second puddle (high-traffic combat).
    for (let i = 0; i < 2; i++) setT(g, h - 3, 12 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 44 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.BREAKROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 64 * GAME.TILE },
        // Mini-boss spawns after the first puddle, before vending wall.
        miniBossTrigger: 32 * GAME.TILE,
        enemySpawns: [
            // A: early stapler near table 1
            { x: 10 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            // B: ranged folder above coffee puddle
            { x: 22 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'folder' },
            // C: cabinet at vending wall + folder on top route
            { x: 36 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 42 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
            // D: sniper above second puddle, stapler past it
            { x: 50 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 58 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [
            { x: 42 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'FLAME' },
        ],
        crateSpawns: [
            { x:  8 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 28 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 53 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'HOMING' },
        ]
    };
}

// Stage 3 — Server Room. Trimmed from 100→72 tiles to match stage 1/2 cadence.
// Teaches: ladder climbs between server racks, electric-floor hazards, sniper
// folders on tall rack tops.
function makeStage3() {
    const w = 72, h = 16;
    const { g } = blankStage(w, h, THEME.SERVERROOM);

    // Section A (x 0–18): WARMUP — short server rack, jumpable.
    // Original was 8 tiles tall + ladder on the wrong side, which made
    // it impassable. Drop to 3 tiles so a single jump clears it.
    rectT(g, 11, 10, 2, 3, W);
    ladderT(g, 6, 9, 8);

    // Section B (x 18–32): ELECTRIC FLOOR — hazard with platform island.
    spikeRow(g, h - 3, 20, 4);
    platT(g, 10, 22, 3);

    // Section C (x 32–48): VERTICAL TOWER — climb a multi-tier rack.
    // Wall is short enough to jump on top of (4 tiles), then use the
    // platforms above as stepping stones; ladder also threads up the
    // left face for the climb-style route.
    rectT(g, 10, 32, 2, 4, W);
    platT(g, 12, 35, 3);
    platT(g,  9, 38, 3);
    platT(g,  6, 42, 3);
    ladderT(g, 5, 31, 9);

    // Section D (x 48–60): SECOND ELECTRIC FLOOR — wider, requires platform hop.
    spikeRow(g, h - 3, 50, 5);
    platT(g, 10, 50, 2);
    platT(g,  8, 54, 3);
    platT(g, 10, 58, 2);

    // Section E (x 60–68): BOSS APPROACH — final platform before exit door.
    platT(g, 9, 62, 4);
    setT(g, h - 3, w - 4, X);
    // Server-rack cover — near the first sniper at col 14.
    setT(g, h - 3, 16, C);
    // Second server rack near the sniper above the second electric floor.
    setT(g, h - 3, 56, C);
    // Floor-grate hide spots — drop into the raised-floor cavity and the
    // snipers lose track. Two clusters bracket the electric-floor hazards
    // so the player gets a moment to reposition mid-combat.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 26 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 46 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.SERVERROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 64 * GAME.TILE },
        miniBossTrigger: 32 * GAME.TILE,
        enemySpawns: [
            // A: stapler at warmup, sniper on top of first rack
            { x: 12 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 14 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            // B: cabinet past the electric floor
            { x: 26 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // C: folder on tower's top platform
            { x: 42 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'folder' },
            // D: sniper above second electric floor
            { x: 54 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'holepunch' },
            { x: 58 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [
            { x: 42 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'LASER' },
        ],
        crateSpawns: [
            { x: 16 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 38 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 62 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'HOMING' },
        ]
    };
}

// Stage 4 — Board Room. Long conference table jumps, executive chairs as
// breakable cover, projectors raining slides.
function makeStage4() {
    // Stage 4 — Board Room. Trimmed from 100→72 tiles.
    // Teaches: table-hopping cadence, chandelier high route, projector hazards.
    const w = 72, h = 14;
    const { g } = blankStage(w, h, THEME.BOARDROOM);

    // Section A (x 0–18): WARMUP — first two boardroom tables.
    platT(g, 10, 8, 6);
    platT(g, 10, 16, 4);

    // Section B (x 18–32): CHANDELIER CHAIN — high route over a projector pit.
    spikeRow(g, h - 3, 22, 3);
    platT(g, 5, 20, 3);     // chandelier 1
    platT(g, 5, 26, 3);     // chandelier 2
    platT(g, 10, 26, 4);    // landing table

    // Section C (x 32–46): TWO-TIER TABLE — sniper perch above.
    platT(g, 10, 34, 6);
    platT(g, 6, 38, 3);

    // Section D (x 46–60): PROJECTOR PIT — wider, requires chandelier hop.
    spikeRow(g, h - 3, 48, 4);
    platT(g, 5, 50, 3);
    platT(g, 10, 54, 5);

    // Section E (x 60–68): BOSS APPROACH — final raised platform.
    rectT(g, 9, 62, 2, 3, W);
    setT(g, h - 3, w - 4, X);
    // Heavy boardroom door — duck-cover near the sniper above projectors.
    setT(g, h - 3, 46, C);
    // Velvet wall curtains — slip behind to break the sniper line of sight.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 14 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 42 + i, G);
    // Second door near the holepunch sniper on the top route.
    setT(g, h - 3, 60, C);

    return {
        tiles: g, width: w, height: h, theme: THEME.BOARDROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 64 * GAME.TILE },
        miniBossTrigger: 32 * GAME.TILE,
        enemySpawns: [
            { x: 10 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 18 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'stapler' },
            { x: 28 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'cabinet' },
            { x: 38 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 50 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'holepunch' },
            { x: 58 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'cabinet' },
        ],
        pickupSpawns: [
            { x: 38 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'THUNDER' },
        ],
        crateSpawns: [
            { x: 12 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 36 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 54 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'HOMING' },
        ]
    };
}

// Stage 5 — Keynote Hall. Stage scaffolding climb, spotlight pits, audience
// seats as cover. Tall vertical section.
function makeStage5() {
    // Stage 5 — Keynote Hall. Trimmed from 100→72 wide, h=18 preserved for
    // verticality. Teaches: stair-step climb, scaffolding ladder, top-catwalk
    // sniper run, drop back to boss arena.
    const w = 72, h = 18;
    const { g } = blankStage(w, h, THEME.KEYNOTE);

    // Section A (x 0–18): AUDIENCE FLOOR — first spotlight pit + low seats.
    for (let c = 6; c < 16; c += 3) rectT(g, h - 3, c, 1, 1, P);
    spikeRow(g, h - 3, 16, 2);

    // Section B (x 18–32): STAGE STEPS — ascending platforms.
    platT(g, 13, 20, 3);
    platT(g, 11, 24, 3);
    platT(g,  9, 28, 3);

    // Section C (x 32–48): SCAFFOLDING COLUMN — vertical climb via ladder.
    rectT(g, 3, 34, 1, 13, W);
    ladderT(g, 4, 36, 12);

    // Section D (x 48–60): TOP CATWALK — sniper run high above audience.
    platT(g, 4, 38, 7);
    platT(g, 6, 48, 4);
    // Second spotlight pit far below — punish a missed catwalk drop.
    spikeRow(g, h - 3, 50, 3);

    // Section E (x 60–68): DROP TO BOSS — staircase down to arena floor.
    platT(g, 9, 56, 4);
    platT(g, 12, 62, 4);
    setT(g, h - 3, w - 4, X);
    // Podium cover — duck-behind near the audience-floor sniper.
    setT(g, h - 3, 24, C);
    // Catwalk podium — near the holepunch sniper above audience.
    setT(g, h - 3, 60, C);
    // Audience seat rows — duck into the velvet chairs to break LOS.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 10 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 64 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.KEYNOTE,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 64 * GAME.TILE },
        miniBossTrigger: 32 * GAME.TILE,
        enemySpawns: [
            { x: 12 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 22 * GAME.TILE, y: (12) * GAME.TILE, type: 'folder' },
            { x: 28 * GAME.TILE, y: (10) * GAME.TILE, type: 'holepunch' },
            { x: 40 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 48 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'cabinet' },
            { x: 56 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
        ],
        pickupSpawns: [
            { x: 40 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'THUNDER' },
        ],
        crateSpawns: [
            { x: 18 * GAME.TILE, y: (12) * GAME.TILE - 14, drop: 'LASER' },
            { x: 40 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 56 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'HOMING' },
        ]
    };
}

// Stage 6 — Founder's Lair. Forking high/low paths. Vertical server stacks.
function makeStage6() {
    // Stage 6 — Founder's Lair. Trimmed from 110→76 wide.
    // Defining feature is the fork (high catwalks vs. low hazard path),
    // preserved with three pairs of high/low choices then a converging climb.
    // Penultimate stage — slightly longer than 1-5 by design.
    const w = 76, h = 16;
    const { g } = blankStage(w, h, THEME.FOUNDER);
    for (let x = 0; x < w; x++) g[0][x] = W; // ceiling

    // Section A (x 0–14): VERTICAL ENTRY — climb up to choose path.
    // Ladder runs up the LEFT side of the entry column so the player
    // can actually reach it instead of bonking on the wall.
    rectT(g, 6, 6, 1, 7, W);
    ladderT(g, 4, 5, 10);
    platT(g, 4, 6, 6);

    // Section B (x 14–32): FORK 1 — high catwalk vs. low spikes.
    platT(g, 4, 14, 6);
    spikeRow(g, h - 3, 18, 3);
    platT(g, 4, 24, 6);
    ladderT(g, 5, 22, 8);

    // Section C (x 32–48): FORK 2 — second high catwalk, second hazard pit.
    platT(g, 4, 32, 6);
    spikeRow(g, h - 3, 36, 3);
    ladderT(g, 5, 40, 8);

    // Section D (x 48–62): CONVERGENCE — paths meet at a vertical climb.
    rectT(g, 4, 48, 1, 8, W);
    ladderT(g, 5, 50, 8);
    platT(g, 9, 52, 5);
    rectT(g, 3, 60, 1, 11, W);
    ladderT(g, 4, 61, 10);
    platT(g, 6, 62, 4);

    // Section E (x 62–72): BOSS APPROACH — final descent to arena.
    platT(g, 9, 66, 4);
    rectT(g, 9, 72, 1, 3, W);
    setT(g, h - 3, w - 4, X);
    // Crimson statue cover — duck-behind near the holepunch sniper.
    setT(g, h - 3, 52, C);
    // Arcane lab drape — slip behind the founder's velvet curtain.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 20 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.FOUNDER,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 68 * GAME.TILE },
        miniBossTrigger: 32 * GAME.TILE,
        enemySpawns: [
            { x: 12 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 16 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 24 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 28 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 36 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 44 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 54 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
            { x: 62 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
        ],
        pickupSpawns: [
            { x: 24 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'LASER' },
        ],
        crateSpawns: [
            { x: 12 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'SPREAD' },
            { x: 36 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 54 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'THUNDER' },
            { x: 66 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'LIFE' },
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
    // Floor-grate hides at the arena edges — break LOS on boss attacks.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 4 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 34 + i, G);
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
    // Stage 8 — The Cloud finale. Trimmed from 110→80 wide. Slightly longer
    // than stages 1-6 to feel like a climax. Preserves the archipelago
    // floating-platform feel and ceiling-rain-hazard pacing.
    const w = 80, h = 16;
    const { g } = blankStage(w, h, THEME.CLOUD);

    // Carve the boss-arena pit at the very end.
    for (let x = w - 10; x < w; x++) { g[h - 1][x] = E; g[h - 2][x] = E; }

    // Section A (x 0–18): SHORT GROUND INTRO — first archipelago platforms.
    platT(g,  9, 10, 5);
    platT(g, 12, 16, 4);

    // Section B (x 18–34): MID ARCHIPELAGO — high + low islands.
    platT(g,  7, 20, 4);
    platT(g, 10, 26, 5);
    platT(g,  5, 30, 4);
    spikeRow(g, 1, 18, 4);   // ceiling data-rain hazard #1

    // Section C (x 34–50): CEILING DESCENT — ceiling platforms for upside-down feel.
    platT(g,  2, 36, 3);
    platT(g, 12, 38, 4);
    platT(g,  8, 44, 4);
    platT(g,  4, 48, 4);

    // Section D (x 50–66): SECOND DATA-RAIN — wider hazard near peak.
    platT(g,  2, 56, 3);
    platT(g, 10, 54, 5);
    platT(g,  6, 60, 4);
    spikeRow(g, 1, 52, 4);   // ceiling data-rain hazard #2

    // Section E (x 66–76): ALGORITHM APPROACH — final floating cube + exit.
    platT(g, 12, 66, 4);
    rectT(g, 8, 70, 3, 3, W);
    setT(g, 8, w - 4, X);     // exit tile up high
    // Floating data-pillar cover near snipers above the archipelago.
    setT(g, h - 3, 24, C);
    setT(g, h - 3, 48, C);
    // Drifting cloud puffs — duck into the mist between data pillars.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 36 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.CLOUD,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 72 * GAME.TILE },
        miniBossTrigger: 40 * GAME.TILE,
        enemySpawns: [
            { x: 16 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
            { x: 24 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'holepunch' },
            { x: 32 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 40 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'folder' },
            { x: 48 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 56 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 64 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
        ],
        pickupSpawns: [
            { x: 32 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'THUNDER' },
        ],
        crateSpawns: [
            { x: 24 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'LASER' },
            { x: 40 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 56 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 66 * GAME.TILE, y: (11) * GAME.TILE - 14, drop: 'LIFE' },
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
    // Floor-grate hide spots — drop into the cavity between hazards.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 32 + i, G);
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

// Tile palette per theme — dark painted tones, NOT bright video-game colors.
// `solid` is the body, `solidTop` is the highlight band where the player walks.
// `platform` and `plank` are for one-way platforms. Accent is for tile speckle.
const THEME_PALETTE = {
    [THEME.JUNGLE]:     { solid: '#0e1808', solidTop: '#1a2810', platform: '#2a1c10', plank: '#140a08', accent: '#0a3010', highlight: '#3a5824' },
    [THEME.BREAKROOM]:  { solid: '#1c1820', solidTop: '#2a2030', platform: '#3a2a20', plank: '#100a18', accent: '#503040', highlight: '#806060' },
    [THEME.SERVERROOM]: { solid: '#080a14', solidTop: '#101424', platform: '#1a1e2a', plank: '#04040a', accent: '#2050a0', highlight: '#4080c0' },
    [THEME.BOARDROOM]:  { solid: '#1a1008', solidTop: '#2a1808', platform: '#3a2410', plank: '#0e0604', accent: '#604018', highlight: '#a06028' },
    [THEME.KEYNOTE]:    { solid: '#08080a', solidTop: '#141014', platform: '#1a141a', plank: '#040408', accent: '#403048', highlight: '#705068' },
    [THEME.FOUNDER]:    { solid: '#0a0408', solidTop: '#180810', platform: '#1a0810', plank: '#040204', accent: '#601008', highlight: '#a02018' },
    [THEME.CLOUD]:      { solid: '#040818', solidTop: '#0a1428', platform: '#101a30', plank: '#020410', accent: '#205080', highlight: '#5090c0' },
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

    isWater(px, py) {
        return this.tileAt(px, py) === TILE.WATER;
    }

    isGrass(px, py) {
        return this.tileAt(px, py) === TILE.GRASS;
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
            // Platform landing: player must be CROSSING the platform top downward.
            // Use the BOX's prior bottom (which is box.y + box.h, since dy hasn't
            // been applied yet) compared against the platform's top edge.
            // Allow a small overlap (4px) so platforms catch even when the player
            // is falling fast — otherwise high vy can tunnel through.
            const tileTop = Math.floor(probeY / GAME.TILE) * GAME.TILE;
            const prevBottom = box.y + box.h;
            const isPlatformLanding = (t === TILE.PLATFORM) && sign > 0 && allowPlatform &&
                (prevBottom <= tileTop + 4);
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

    _groundBitmapKey() {
        return GROUND_BITMAP_KEY[this.data.theme] || null;
    }

    _drawTile(ctx, t, x, y, r, c) {
        const T = GAME.TILE;
        const pal = this.palette;
        switch (t) {
            case TILE.SOLID: {
                const topIsAir = r === 0 || this.tiles[r - 1][c] === TILE.EMPTY;
                // Painted-tile path: sample the theme's ground bitmap by tile
                // position so adjacent tiles read as CONTIGUOUS material rather
                // than chaotic random patches. Top-of-stack tiles sample from
                // the bitmap's top band (with the highlight edge), interior
                // tiles cycle through the body band.
                const groundKey = this._groundBitmapKey();
                const img = groundKey ? sprites.images.get(groundKey) : null;
                if (img) {
                    const xCells = Math.max(1, Math.floor(img.width / T));
                    const bodyH = Math.max(T, img.height - T);
                    const yCells = Math.max(1, Math.floor(bodyH / T));
                    const srcX = (c % xCells) * T;
                    const srcY = topIsAir
                        ? 0                                 // top edge — first row of bitmap
                        : T + ((r % yCells) * T);           // body — cycle through body band
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img,
                        srcX, Math.min(srcY, img.height - T),
                        T, T, x, y, T, T);
                    if (topIsAir) {
                        ctx.fillStyle = pal.solidTop;
                        ctx.fillRect(x, y, T, 1);
                    }
                    break;
                }
                // Painted procedural fallback: gradient body + speckle + top edge
                // with mossy / textured detail. Looks much better than flat fill.
                ctx.fillStyle = pal.solid;
                ctx.fillRect(x, y, T, T);
                // Vertical gradient — slightly lighter at top, darker at bottom
                ctx.fillStyle = pal.plank;
                for (let row = 12; row < T; row++) {
                    if (((row * 7 + c * 3 + r * 5) & 3) === 0) {
                        ctx.fillRect(x + ((row * 11) % T), y + row, 1, 1);
                    }
                }
                // Dense painted speckle covering the body
                ctx.fillStyle = pal.accent;
                for (let i = 0; i < 5; i++) {
                    const sx = ((c * 17 + i * 7 + r * 3) % T);
                    const sy = ((r * 13 + i * 5 + c * 2) % (T - 4)) + 4;
                    ctx.fillRect(x + sx, y + sy, 1, 1);
                }
                if (topIsAir) {
                    // 2-row top highlight band — darker line + textured highlight
                    ctx.fillStyle = pal.solidTop;
                    ctx.fillRect(x, y, T, 2);
                    ctx.fillStyle = pal.highlight || pal.accent;
                    for (let i = 0; i < T; i++) {
                        if ((i + c * 3) & 1) ctx.fillRect(x + i, y, 1, 1);
                    }
                    // Subtle moss / grass / tufts variant per theme
                    ctx.fillStyle = pal.accent;
                    for (let i = 0; i < 3; i++) {
                        const tx = ((c * 11 + i * 5) % T);
                        ctx.fillRect(x + tx, y - 1, 1, 1);
                    }
                }
                break;
            }
            case TILE.PLATFORM:
                // Painted plank with brass/metal trim — 4px tall surface
                ctx.fillStyle = pal.platform;
                ctx.fillRect(x, y, T, 4);
                // Top edge — slim highlight
                ctx.fillStyle = pal.highlight || pal.accent;
                ctx.fillRect(x, y, T, 1);
                // Wood grain speckle
                ctx.fillStyle = pal.plank;
                for (let i = 0; i < T; i++) {
                    if ((i * 5 + c * 7) & 3) continue;
                    ctx.fillRect(x + i, y + 1 + (i & 1), 1, 1);
                }
                // Bottom shadow line
                ctx.fillStyle = pal.plank;
                ctx.fillRect(x, y + 4, T, 1);
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.fillRect(x, y + 5, T, 1);
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
            case TILE.WATER: {
                // Murky swamp water with animated ripple highlights.
                // Bulk fill — deep green-black
                ctx.fillStyle = '#0a1810';
                ctx.fillRect(x, y, T, T);
                // Mid-band ripples
                ctx.fillStyle = '#16321e';
                for (let i = 0; i < T; i++) {
                    if (((i + c * 3 + this.tileAnimTick) % 5) === 0) {
                        ctx.fillRect(x + i, y + 6 + ((i + this.tileAnimTick) & 3), 1, 1);
                    }
                }
                // Lily-pad / scum specks
                ctx.fillStyle = '#243a18';
                for (let i = 0; i < 2; i++) {
                    const sx = (c * 11 + i * 7 + r * 3) % T;
                    const sy = (r * 5 + i * 4) % (T - 2);
                    ctx.fillRect(x + sx, y + sy + 2, 2, 1);
                }
                // Animated water surface highlight on top
                const topIsAir = r === 0 || this.tiles[r - 1][c] !== TILE.WATER;
                if (topIsAir) {
                    ctx.fillStyle = '#2c4a30';
                    ctx.fillRect(x, y, T, 1);
                    // Shimmer: alternating bright dots that move
                    ctx.fillStyle = '#7af0bf';
                    const shift = (this.tileAnimTick + c) & 7;
                    for (let i = 0; i < T; i += 4) {
                        if (((i + shift) & 7) < 2) ctx.fillRect(x + i, y, 1, 1);
                    }
                }
                break;
            }
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
            case TILE.COVER: {
                // Themed cover object — tree, vending machine, server rack, door,
                // podium, statue, cloud-pillar. Player holds UP near these to
                // crouch behind and become invulnerable but immobile.
                // Render as a tall object that extends ABOVE the tile bound
                // so it visually reads as cover-from-shots.
                const theme = this.data.theme;
                const t2 = this.tileAnimTick;
                // Subtle bright-rim glow so cover objects read against the
                // painted parallax bg. Half-tile-wide pulse around the object.
                ctx.fillStyle = 'rgba(255, 240, 200, 0.10)';
                ctx.fillRect(x - 2, y - 32, T + 4, T + 40);
                if (theme === THEME.JUNGLE) {
                    // Tree trunk — wider + brighter so it reads against bg
                    ctx.fillStyle = '#3a2010';
                    ctx.fillRect(x + 4, y - 28, 8, 40);
                    ctx.fillStyle = '#1a0810';
                    ctx.fillRect(x + 4, y - 28, 1, 40);
                    ctx.fillRect(x + 11, y - 28, 1, 40);
                    // Bark grain — brighter speckle
                    ctx.fillStyle = '#604030';
                    for (let i = 0; i < 6; i++) {
                        if ((i + c) & 1) ctx.fillRect(x + 6, y - 26 + i * 6, 3, 1);
                    }
                    // Canopy leaves — wider + brighter green
                    ctx.fillStyle = '#284028';
                    ctx.fillRect(x - 2, y - 34, 20, 8);
                    ctx.fillStyle = '#3a5824';
                    ctx.fillRect(x, y - 36, 16, 4);
                    ctx.fillStyle = '#507030';
                    ctx.fillRect(x + 2, y - 38, 12, 2);
                    // Animated leaf rustle — more visible
                    if ((t2 + c) & 3) {
                        ctx.fillStyle = '#80a040';
                        ctx.fillRect(x + 4 + ((t2 + c) & 7), y - 35, 2, 1);
                    }
                } else if (theme === THEME.BREAKROOM) {
                    // Vending machine
                    ctx.fillStyle = '#a01020';
                    ctx.fillRect(x + 2, y - 20, 12, 32);
                    ctx.fillStyle = '#601018';
                    ctx.fillRect(x + 2, y - 20, 1, 32);
                    ctx.fillRect(x + 13, y - 20, 1, 32);
                    // Display window
                    ctx.fillStyle = '#101020';
                    ctx.fillRect(x + 4, y - 18, 8, 12);
                    ctx.fillStyle = '#7af0bf';
                    // Animated drink icons
                    if (t2 & 4) ctx.fillRect(x + 5 + (t2 & 3), y - 16, 1, 1);
                    // Slot + button
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x + 5, y - 2, 6, 1);
                    ctx.fillStyle = '#ffe070';
                    ctx.fillRect(x + 11, y - 4, 2, 2);
                } else if (theme === THEME.SERVERROOM) {
                    // Server rack
                    ctx.fillStyle = '#0a0a14';
                    ctx.fillRect(x + 2, y - 22, 12, 34);
                    ctx.fillStyle = '#1a1a2a';
                    ctx.fillRect(x + 2, y - 22, 12, 1);
                    ctx.fillRect(x + 2, y + 11, 12, 1);
                    // Blinking LEDs in vertical rows
                    for (let i = 0; i < 5; i++) {
                        const blink = (t2 + i * 7) & 7;
                        ctx.fillStyle = blink < 3 ? '#50ff70' : '#205028';
                        ctx.fillRect(x + 4, y - 19 + i * 6, 2, 2);
                        ctx.fillStyle = blink > 4 ? '#7af0ff' : '#205060';
                        ctx.fillRect(x + 10, y - 19 + i * 6, 2, 2);
                    }
                } else if (theme === THEME.BOARDROOM) {
                    // Heavy wooden door
                    ctx.fillStyle = '#2a1408';
                    ctx.fillRect(x + 2, y - 26, 12, 38);
                    ctx.fillStyle = '#3a1c0a';
                    ctx.fillRect(x + 3, y - 25, 10, 1);
                    ctx.fillRect(x + 3, y + 10, 10, 1);
                    // Panels
                    ctx.fillStyle = '#1a0a04';
                    ctx.fillRect(x + 4, y - 22, 8, 1);
                    ctx.fillRect(x + 4, y - 10, 8, 1);
                    ctx.fillRect(x + 4, y + 2, 8, 1);
                    // Brass knob
                    ctx.fillStyle = '#a06030';
                    ctx.fillRect(x + 11, y - 6, 2, 2);
                    ctx.fillStyle = '#ffe070';
                    ctx.fillRect(x + 11, y - 6, 1, 1);
                } else if (theme === THEME.KEYNOTE) {
                    // Podium / lectern
                    ctx.fillStyle = '#1a1818';
                    ctx.fillRect(x + 3, y - 18, 10, 30);
                    ctx.fillStyle = '#3a3038';
                    ctx.fillRect(x + 3, y - 18, 10, 2);
                    ctx.fillRect(x + 1, y - 16, 14, 1);  // top slab
                    // Stage-lamp emblem
                    ctx.fillStyle = '#ffe070';
                    ctx.fillRect(x + 7, y - 14, 2, 4);
                    // Mic stand
                    ctx.fillStyle = '#806060';
                    ctx.fillRect(x + 7, y - 22, 1, 6);
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(x + 6, y - 24, 3, 3);
                } else if (theme === THEME.FOUNDER) {
                    // Crimson statue / pillar
                    ctx.fillStyle = '#0a0408';
                    ctx.fillRect(x + 3, y - 24, 10, 36);
                    ctx.fillStyle = '#601008';
                    ctx.fillRect(x + 3, y - 24, 1, 36);
                    ctx.fillRect(x + 12, y - 24, 1, 36);
                    // Glowing crack
                    if ((t2 & 7) < 4) {
                        ctx.fillStyle = '#ff5050';
                        ctx.fillRect(x + 7, y - 18, 2, 8);
                        ctx.fillRect(x + 8, y - 10, 1, 6);
                    }
                } else if (theme === THEME.CLOUD) {
                    // Floating data-pillar — hovers above the tile
                    const bob = Math.sin(t2 * 0.15) * 2;
                    ctx.fillStyle = '#0a0a18';
                    ctx.fillRect(x + 3, y - 18 + bob, 10, 30);
                    ctx.fillStyle = '#205080';
                    ctx.fillRect(x + 3, y - 18 + bob, 10, 1);
                    ctx.fillRect(x + 3, y + 11 + bob, 10, 1);
                    // Glowing data bands
                    for (let i = 0; i < 3; i++) {
                        const phase = (t2 + i * 6) & 15;
                        if (phase < 8) {
                            ctx.fillStyle = '#7af0ff';
                            ctx.fillRect(x + 4, y - 14 + i * 8 + bob, 8, 1);
                        }
                    }
                } else {
                    // Generic crate fallback
                    ctx.fillStyle = '#3a2818';
                    ctx.fillRect(x + 1, y - 4, T - 2, T + 4);
                    ctx.fillStyle = '#604030';
                    ctx.fillRect(x + 1, y - 4, T - 2, 1);
                }
                break;
            }
            case TILE.GRASS: {
                // Tall-grass clump. Pass-through (no collision); when the player
                // stands inside, AI loses target lock (see Level.isGrass()).
                // Drawn behind the player here, with a separate foreground pass
                // (drawGrassForeground) painting the tips OVER the player so
                // they read as truly hidden when crouched.
                this._drawGrassBlades(ctx, x, y, c, false);
                break;
            }
        }
    }

    // Foreground grass tips — call AFTER player + enemies so the top half of
    // the blades sits over the sprite, selling the "hidden inside" read.
    drawGrassForeground(ctx, camera) {
        const T = GAME.TILE;
        const startCol = Math.max(0, Math.floor(camera.viewX / T));
        const endCol = Math.min(this.data.width, Math.ceil((camera.viewX + GAME.W) / T) + 1);
        const startRow = Math.max(0, Math.floor(camera.viewY / T));
        const endRow = Math.min(this.data.height, Math.ceil((camera.viewY + GAME.H) / T) + 1);
        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                if (this.tiles[r][c] !== TILE.GRASS) continue;
                const x = c * T - camera.viewX;
                const y = r * T - camera.viewY;
                this._drawGrassBlades(ctx, x, y, c, true);
            }
        }
    }

    // GRASS tile is shorthand for "passive hide spot." Each theme draws it
    // as a different element: jungle blades, breakroom tablecloth, server
    // floor grate, boardroom curtain, keynote audience row, etc. Same
    // gameplay (player walks in → grassHidden = true → AI loses lock).
    _drawGrassBlades(ctx, x, y, c, foreground) {
        switch (this.data.theme) {
            case THEME.JUNGLE:     return this._drawHideJungle(ctx, x, y, c, foreground);
            case THEME.BREAKROOM:  return this._drawHideBreakroom(ctx, x, y, c, foreground);
            case THEME.SERVERROOM: return this._drawHideServerroom(ctx, x, y, c, foreground);
            case THEME.BOARDROOM:  return this._drawHideBoardroom(ctx, x, y, c, foreground);
            case THEME.KEYNOTE:    return this._drawHideKeynote(ctx, x, y, c, foreground);
            case THEME.FOUNDER:    return this._drawHideFounder(ctx, x, y, c, foreground);
            case THEME.CLOUD:      return this._drawHideCloud(ctx, x, y, c, foreground);
            default:               return this._drawHideJungle(ctx, x, y, c, foreground);
        }
    }

    // Jungle: tall grass — baked sprite, 4 sway frames cycled by tileAnimTick.
    // Each tile's frame is staggered by column so adjacent tiles don't sway
    // in sync, which would read as one rigid wave instead of a wind field.
    _drawHideJungle(ctx, x, y, c, foreground) {
        const T = GAME.TILE;
        const set = _buildGrassSprites();
        const frames = foreground ? set.fg : set.bg;
        if (!frames.length) return;   // headless smoke path — no document
        const t2 = this.tileAnimTick;
        const frame = (Math.floor(t2 / 2) + c) & 3;   // ~8 ticks per frame
        const img = frames[frame];
        // Sprite bottom aligns to tile bottom (y + T) so blades poke
        // upward into the air above.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x, y + T - GRASS_FRAME_H);
    }

    // Breakroom: low table with hanging tablecloth — duck under to hide.
    // Background = the legs + skirt, foreground = the table top edge.
    _drawHideBreakroom(ctx, x, y, c, foreground) {
        const T = GAME.TILE;
        if (!foreground) {
            // Tablecloth body — hangs from table edge to floor
            ctx.fillStyle = '#9a3030';
            ctx.fillRect(x, y - 2, T, T + 2);
            // Cloth shadow on right edge
            ctx.fillStyle = '#601818';
            ctx.fillRect(x + T - 2, y - 2, 2, T + 2);
            // Cloth fold highlight
            ctx.fillStyle = '#c04848';
            ctx.fillRect(x + 2, y - 2, 1, T);
            // Floor shadow
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(x - 1, y + T - 2, T + 2, 2);
        } else {
            // Table top — flat dark wood plate sitting just above tile origin
            ctx.fillStyle = '#3a1a08';
            ctx.fillRect(x - 1, y - 8, T + 2, 4);
            ctx.fillStyle = '#5a2a18';
            ctx.fillRect(x - 1, y - 8, T + 2, 1);
            ctx.fillStyle = '#1a0a04';
            ctx.fillRect(x - 1, y - 5, T + 2, 1);
        }
    }

    // Serverroom: raised floor grate — drop down through metal slats.
    // Bg = the cavity shadow + grate base, fg = grate slats over the player.
    _drawHideServerroom(ctx, x, y, c, foreground) {
        const T = GAME.TILE;
        const t2 = this.tileAnimTick;
        if (!foreground) {
            // Cavity beneath the grate — black void with subtle blue rim
            ctx.fillStyle = '#080814';
            ctx.fillRect(x, y, T, T);
            // Bottom highlight (cables crossing in the dark)
            ctx.fillStyle = '#1a3050';
            ctx.fillRect(x + 2, y + T - 3, T - 4, 1);
            // Occasional spark in the cavity
            if ((t2 + c) & 7) { } else {
                ctx.fillStyle = '#5cf0ff';
                ctx.fillRect(x + 4 + (c & 7), y + 6, 1, 1);
            }
        } else {
            // Grate slats — horizontal metal bars OVER the player
            ctx.fillStyle = '#404858';
            ctx.fillRect(x, y - 2, T, 2);          // top rim
            ctx.fillStyle = '#606878';
            ctx.fillRect(x, y - 2, T, 1);          // top highlight
            // Three slats spanning the tile, with gaps showing the void
            for (let i = 0; i < 3; i++) {
                const sy = y + 2 + i * 4;
                ctx.fillStyle = '#383c48';
                ctx.fillRect(x + 1, sy, T - 2, 2);
                ctx.fillStyle = '#585c68';
                ctx.fillRect(x + 1, sy, T - 2, 1);
            }
            // Side rails — metallic edges
            ctx.fillStyle = '#202430';
            ctx.fillRect(x, y - 2, 1, T);
            ctx.fillRect(x + T - 1, y - 2, 1, T);
        }
    }

    // Boardroom: heavy red curtain — slip behind, only the bottom shows.
    _drawHideBoardroom(ctx, x, y, c, foreground) {
        const T = GAME.TILE;
        if (!foreground) {
            // Wall behind — dark wood paneling
            ctx.fillStyle = '#180a04';
            ctx.fillRect(x, y - 2, T, T + 2);
        } else {
            // Curtain — deep crimson with vertical fold highlights
            ctx.fillStyle = '#601018';
            ctx.fillRect(x, y - 14, T, T + 12);
            ctx.fillStyle = '#a01828';
            // Fold ridges every ~5px
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(x + 1 + i * 5, y - 14, 1, T + 12);
            }
            ctx.fillStyle = '#2a0408';
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(x + 3 + i * 5, y - 14, 1, T + 12);
            }
            // Curtain rod
            ctx.fillStyle = '#806040';
            ctx.fillRect(x - 1, y - 16, T + 2, 2);
            // Bottom hem ripples (sway)
            ctx.fillStyle = '#400810';
            ctx.fillRect(x, y - 2, T, 2);
        }
    }

    // Keynote: theater audience row — duck into the seats.
    _drawHideKeynote(ctx, x, y, c, foreground) {
        const T = GAME.TILE;
        if (!foreground) {
            // Floor riser shadow
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(x, y + T - 3, T, 3);
        } else {
            // Seat backs — three plush velvet chairs
            for (let i = 0; i < 3; i++) {
                const bx = x + i * 5 + 1;
                ctx.fillStyle = '#3a1830';
                ctx.fillRect(bx, y - 12, 4, 14);
                ctx.fillStyle = '#5a2848';
                ctx.fillRect(bx, y - 12, 4, 1);
                ctx.fillRect(bx, y - 12, 1, 14);
                // Headrest dot — gold stud
                ctx.fillStyle = '#c0a040';
                ctx.fillRect(bx + 1, y - 10, 1, 1);
            }
        }
    }

    // Founder's Lair: tall lab curtain / drape with electric trim.
    _drawHideFounder(ctx, x, y, c, foreground) {
        const T = GAME.TILE;
        const t2 = this.tileAnimTick;
        if (!foreground) {
            ctx.fillStyle = '#100820';
            ctx.fillRect(x, y - 2, T, T + 2);
        } else {
            // Velvet drape with arcane purple/teal piping
            ctx.fillStyle = '#1a0a30';
            ctx.fillRect(x, y - 14, T, T + 12);
            ctx.fillStyle = '#382060';
            ctx.fillRect(x + 1, y - 14, 1, T + 12);
            ctx.fillRect(x + 6, y - 14, 1, T + 12);
            ctx.fillRect(x + 11, y - 14, 1, T + 12);
            // Animated arcane spark traveling down a fold
            const sparkY = (t2 + c * 4) % 16;
            ctx.fillStyle = '#80f0ff';
            ctx.fillRect(x + 3 + (c & 3), y - 14 + sparkY, 1, 1);
        }
    }

    // Cloud: dense cumulus puff — duck inside the mist.
    _drawHideCloud(ctx, x, y, c, foreground) {
        const T = GAME.TILE;
        const t2 = this.tileAnimTick;
        if (!foreground) {
            // Soft halo underneath, draws BEHIND player
            ctx.fillStyle = 'rgba(220, 230, 250, 0.55)';
            ctx.fillRect(x - 1, y - 4, T + 2, T + 4);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
            ctx.fillRect(x + 2, y - 2, T - 4, T);
        } else {
            // Bright puff lobes OVER the player
            ctx.fillStyle = '#e8ecf8';
            ctx.fillRect(x + 1, y - 12, T - 2, 8);
            ctx.fillRect(x + 3, y - 14, T - 6, 6);
            // Highlight crests + drifting wisp
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x + 3, y - 13, T - 6, 1);
            const drift = (t2 >> 1) % 8;
            ctx.fillRect(x + 1 + drift, y - 10, 2, 1);
        }
    }
}

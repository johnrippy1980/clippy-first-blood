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
const B = 8; // breakable crumble tile (solid until stood on for ~30 frames)
const X = 9; // exit
const G = 10; // tall grass — pass-through, hides player from AI

// Stage 1 — Office Park Jungle.
// Each row is 16 tiles wide × n cols tall mapped to GAME.TILE pixels (16px).
// Width here is just whatever fits the design; the camera scrolls.
function makeStage1() {
    // Stage 1 — Office Park Jungle. R182 deep-pass: extended 64→96 tiles
    // with two new sections (F: ambush corridor, G: bridge crossing) so
    // the stage feels like a journey rather than a tutorial sprint.
    //
    // Pickup placement is now intentional:
    //   - SHOTGUN crate before the first sniper cluster (sniper rewards
    //     short-range punch you can pre-load on for the cluster)
    //   - SPREAD on the far bank of swamp 1 (clear the cabinet on dry land)
    //   - GRENADE x2 stash before the ambush — there's a 3-grunt squad
    //     pre-staged behind cover that's perfect for an AoE
    //   - LASER on the high platform in C (rewards verticality + sets up
    //     long-range work for the holepunch line)
    //   - LIFE before mini-boss + LIFE before main boss (Contra rule:
    //     getting hit drops weapon, so LIFE is the real safety net)
    //   - HOMING just before the boss room — last-second power play
    //
    // Cover trees still sit beside sniper perches (duck-hide tutorial),
    // grass patches added in the ambush corridor for crawl-through stealth.
    const w = 96, h = 14;
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

    // Section F (x 58–76): AMBUSH CORRIDOR — three grunts pre-staged behind
    // tall grass cover. Player can either rush + take damage, or use the
    // grenade stash placed at the section entrance to clear the whole line.
    // Mid-section ledge gives a vantage for ranged players.
    plat(7, 62, 4);     // overlook platform
    plat(9, 70, 3);     // step down
    rect(h - 3, 64, 1, 1, C);    // cover tree mid-corridor
    rect(h - 3, 72, 1, 1, C);    // cover tree end-corridor

    // Section G (x 76–88): BRIDGE CROSSING — narrow ledge over a wide
    // pit. Crumbling tiles in the middle force a double-jump + dash combo.
    // Falling = death (or grapple recovery if player has it).
    for (let i = 0; i < 6; i++) g[h - 2][78 + i] = E;   // dig out the floor
    plat(h - 3, 76, 2);  // entry ledge
    plat(h - 5, 80, 3);  // mid-pit floating platform
    plat(h - 3, 86, 2);  // exit ledge

    // Section H (x 88–96): BOSS APPROACH — open ground, exit door.
    set(h - 3, w - 4, X);

    // R260: CANOPY LAYER — three floating treetop platforms in rows 1-3,
    // grapple-only access from the section-C/F overlooks. Reads like a
    // real SNES jungle where the visible playfield is just the ground floor
    // and the treetops are a parallel high road. Each canopy holds a
    // reward — chain them with the grapple for a clean speedrun route.
    plat(2, 14, 3);    // first canopy — accessible by grappling the row-5 sniper perch ceiling
    plat(1, 38, 3);    // mid canopy — over the second swamp, requires chained grapple
    plat(2, 64, 3);    // late canopy — overlook above the ambush corridor
    // Cover trees — placed near each holepunch sniper. Player holds UP to
    // crouch behind and become invulnerable while shots arc overhead.
    set(h - 3, 19, C);   // near sniper at col 19
    set(h - 3, 44, C);   // near sniper at col 44
    // Tall-grass patches — passive cover. Walk in, enemies lose lock.
    // Cluster 1: between sections A and B, taught before the first sniper.
    for (let i = 0; i < 3; i++) set(h - 3, 11 + i, G);
    // Cluster 2: between sections C and D, on the path to the second swamp.
    for (let i = 0; i < 3; i++) set(h - 3, 38 + i, G);
    // Cluster 3: ambush corridor — long crawl-through patch so player
    // can sneak past the 3-grunt squad if they want to skip the fight.
    for (let i = 0; i < 5; i++) set(h - 3, 65 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.JUNGLE,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 90 * GAME.TILE },
        // Mini-boss: appears after the first swamp, before the second.
        // Same kind as the stage boss (COPIER_3000) at 35% HP — a warmup round.
        miniBossTrigger: 30 * GAME.TILE,
        owlRoosts: [
            { x: 14 * GAME.TILE, y: 3 * GAME.TILE + 6 },
            { x: 38 * GAME.TILE, y: 2 * GAME.TILE + 4 },
            { x: 68 * GAME.TILE, y: 3 * GAME.TILE + 6 },   // ambush corridor
        ],
        enemySpawns: [
            // A: early-contact stapler
            { x:  9 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            // B: sniper above the first swamp — teaches duck-hide.
            { x: 19 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 28 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // C: folder up high, cabinet down low — tests verticality
            { x: 36 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'folder' },
            { x: 42 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // D: second swamp sniper + airborne folder
            { x: 44 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 49 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
            { x: 54 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            // F: AMBUSH CORRIDOR — three-grunt squad pre-staged. Two on
            // the ground behind cover, one on the overlook ledge.
            { x: 63 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
            { x: 67 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 73 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            // G: BRIDGE — one holepunch on the far ledge harassing during
            // the pit-crossing. Doesn't move (perch behavior).
            { x: 87 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'holepunch' },
        ],
        pickupSpawns: [
            // After clearing the first cabinet on the swamp 1 far bank
            { x: 26 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'SPREAD' },
            // Reward for reaching the top-tier verticality platform
            { x: 36 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'LASER' },
            // Mid-stage LIFE on swamp 2 far bank
            { x: 51 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // Grenade stash at ambush corridor entrance — earns AoE for the squad
            { x: 60 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            // Second LIFE just before the bridge — Contra rule: hits drop
            // your weapon, so the LIFE-then-HOMING combo lets you reload
            // your kit right before the boss.
            { x: 77 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // Boss-approach HOMING — last power play before the COPIER_3000
            { x: 89 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'HOMING' },
            // R260: CANOPY pickups — three grapple-only treetop rewards.
            // Chain via grapple from ground overlooks. Each is higher-value
            // than the ground-level alternative on the same x stretch.
            { x: 15 * GAME.TILE, y: ( 1) * GAME.TILE,     type: 'LIFE' },
            { x: 39 * GAME.TILE, y: ( 0) * GAME.TILE,     type: 'THUNDER' },
            { x: 65 * GAME.TILE, y: ( 1) * GAME.TILE,     type: 'LIFE' },
        ],
        crateSpawns: [
            // Pre-sniper-cluster SHOTGUN — clear the holepunch fast
            { x: 14 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'SHOTGUN' },
            // Verticality reward
            { x: 36 * GAME.TILE, y: ( 4) * GAME.TILE - 14, drop: 'LIFE' },
            // Pre-second-swamp HOMING (was already here)
            { x: 52 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'HOMING' },
            // F: ambush corridor overlook — FLAME for the corridor cleanup
            { x: 62 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'FLAME' },
            // G: bridge mid-pit platform — risk/reward crate
            { x: 81 * GAME.TILE, y: (h - 5) * GAME.TILE - 14, drop: 'GRENADE' },
        ],
        // R233: tutorial wall on stage 1's main path. Sits right at eye
        // level on the ground past the first cabinet, so a player can't
        // miss it. Wall hides a LIFE so the discovery is rewarding,
        // teaching the mechanic via payoff rather than a tip overlay.
        wallSpawns: [
            { x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE, w: 16, h: 16, drop: 'LIFE' },
            // Hidden CLIPPY_TAG late in the stage — on a high ledge after
            // the player has had practice with the mid-stage wall.
            { x: 70 * GAME.TILE, y: ( 5) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
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
    // Stage 2 — The Break Room. R183 deep-pass: extended 72→100 tiles with
    // two new sections (F: microwave maze, G: recycle-bin pit) so the stage
    // gets a real second half instead of cutting straight to the boss.
    //
    // Pickup placement audited per Contra rule (hits drop your weapon):
    //   - SPREAD crate at section A entry — early power weapon for warmup
    //   - LIFE pickup before mini-boss (was at col 26, now col 30)
    //   - GRENADE stash before vending wall — clear cabinet + folder cluster
    //   - FLAME on top route (matches the painted backdrop accents)
    //   - SHOTGUN crate near second puddle — heavy hit before sniper line
    //   - LIFE before microwave maze (Contra safety net)
    //   - HOMING crate inside microwave maze (vertical reward)
    //   - GRENADE pickup at recycle-bin entrance — chuck into the pit
    //   - LIFE before boss room (last safety)
    const w = 100, h = 14;
    const { g } = blankStage(w, h, THEME.BREAKROOM);

    // Section A (x 0–18): WARMUP — two break-room tables.
    platT(g, 10, 6, 4);
    platT(g, 10, 14, 4);

    // Section B (x 18–32): COFFEE PUDDLE — spikes + counter climb.
    spikeRow(g, h - 3, 20, 3);
    rectT(g, 11, 24, 1, 3, W);   // counter to climb
    platT(g, 8, 28, 4);

    // Section C (x 32–46): VENDING WALL + SNACK PLATFORMS.
    rectT(g, 8, 34, 1, 4, W);    // vending machine wall
    platT(g, 9, 38, 3);
    platT(g, 7, 42, 4);          // top route

    // Section D (x 46–60): SECOND PUDDLE — wider, snack-cake hop.
    spikeRow(g, h - 3, 48, 4);
    platT(g, 9, 48, 3);
    platT(g, 7, 53, 3);
    platT(g, 9, 57, 4);

    // Section F (x 60–78): MICROWAVE MAZE — stacked vending machines
    // creating a horizontal Z-pattern, ladder up the middle. Climb-and-shoot
    // territory; rewards aim-up and aim-diagonal usage.
    rectT(g, 9,  62, 1, 4, W);          // vending #1 lower left
    rectT(g, 6,  66, 1, 4, W);          // vending #2 upper middle
    rectT(g, 9,  70, 1, 4, W);          // vending #3 lower right
    platT(g, 7,  64, 2);                // hop platform mid-left
    platT(g, 4,  68, 4);                // top maze platform (HOMING crate)
    platT(g, 7,  74, 2);                // hop platform mid-right
    ladderT(g, 6, 73, 5);               // ladder access up the right side

    // Section G (x 78–92): RECYCLE-BIN PIT — wide pit with one mid platform.
    // Falling = death (no water cushion). Crumble-tile gating forces decision:
    // jump it now or wait for the bin to fall and then cross.
    for (let i = 0; i < 8; i++) g[h - 2][80 + i] = E;   // dig out floor
    platT(g, h - 3, 78, 2);             // entry ledge
    platT(g, h - 5, 84, 2);             // floating mid platform
    platT(g, h - 3, 90, 2);             // exit ledge

    // Section H (x 92–96): BOSS APPROACH — low table, exit door.
    rectT(g, 11, 92, 3, 1, W);
    setT(g, h - 3, w - 4, X);

    // R260: CEILING SHELF — high break-room shelf accessible only via grapple
    // from the vending-machine top route. Two floating platforms with hidden
    // pickups, mirrors the "treetop" idea but as a stockroom shelf.
    platT(g, 1, 30, 3);     // shelf above C, reachable from row 7 platform
    platT(g, 1, 56, 3);     // shelf above D, reachable from row 7 platform
    // Vending-machine cover near the folder sniper at col 22.
    setT(g, h - 3, 24, C);
    // Cover near second-puddle sniper at col 52.
    setT(g, h - 3, 52, C);
    // Cover at recycle-bin entrance — vending machine on the ledge.
    setT(g, h - 3, 78, C);
    // Tablecloth hide — duck under a low table.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 12 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 44 + i, G);
    // Maze grass at the base of the ladder — stealth option for sniper bait.
    for (let i = 0; i < 3; i++) setT(g, h - 3, 71 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.BREAKROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 94 * GAME.TILE },
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
            // F: MICROWAVE MAZE — folder on top platform, cabinet at base
            // of ladder. Player has to choose vertical (folder) or low cover
            // (cabinet) approach.
            { x: 70 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 72 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // G: RECYCLE-BIN PIT — sniper on far ledge harassing during cross
            { x: 90 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'holepunch' },
        ],
        pickupSpawns: [
            // Top-route FLAME on the C high platform (matches paint accents)
            { x: 42 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'FLAME' },
            // Pre-mini-boss LIFE
            { x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // Pre-vending GRENADE stash for the cluster
            { x: 33 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            // Mid-stage LIFE on second-puddle far bank
            { x: 60 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // Recycle-bin pre-entry GRENADE — chuck across the pit
            { x: 77 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            // Pre-boss LIFE for the last-stand safety net
            { x: 91 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // R260: ceiling-shelf pickups — grapple-only stockroom rewards
            { x: 31 * GAME.TILE, y: ( 0) * GAME.TILE, type: 'LIFE' },
            { x: 57 * GAME.TILE, y: ( 0) * GAME.TILE, type: 'THUNDER' },
        ],
        crateSpawns: [
            // A: early SPREAD — warmup weapon
            { x:  8 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'SPREAD' },
            // B: LIFE drop near counter climb
            { x: 28 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'LIFE' },
            // C: vending-area GRENADE
            { x: 40 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'GRENADE' },
            // D: pre-sniper SHOTGUN — heavy hit before the holepunch line
            { x: 53 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'SHOTGUN' },
            // F: HOMING on the top maze platform — vertical reward
            { x: 69 * GAME.TILE, y: ( 4) * GAME.TILE - 14, drop: 'HOMING' },
            // G: bridge mid-pit risk crate
            { x: 84 * GAME.TILE, y: (h - 5) * GAME.TILE - 14, drop: 'HOMING' },
        ],
        // R219/R222: breakable walls — shoot to break, drop a hidden
        // goodie. Stage 2 placements lean on visual hiding (walls sit
        // in corners or behind line-of-sight obstacles). The CLIPPY_TAG
        // wall is up high so the player has to deliberately aim up.
        wallSpawns: [
            // Mid-stage LIFE on the lower path
            { x: 47 * GAME.TILE, y: (h - 4) * GAME.TILE, w: 16, h: 16, drop: 'LIFE' },
            // Late-stage GRENADE wall — pre-boss
            { x: 78 * GAME.TILE, y: ( 8) * GAME.TILE, w: 16, h: 16, drop: 'GRENADE' },
            // Hidden CLIPPY_TAG up high — requires looking up + aim-lock
            { x: 60 * GAME.TILE, y: ( 3) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
    };
}

// Stage 3 — Server Room. R184 deep-pass: extended 72→100 tiles with two
// new sections (F: cable maze, G: fan-blade gauntlet) to fill out the
// stage's middle. Sniper-heavy theme so LASER pickups dominate the rewards.
function makeStage3() {
    const w = 100, h = 16;
    const { g } = blankStage(w, h, THEME.SERVERROOM);

    // Section A (x 0–18): WARMUP — short server rack, jumpable.
    rectT(g, 11, 10, 2, 3, W);
    ladderT(g, 6, 9, 8);

    // Section B (x 18–32): ELECTRIC FLOOR — hazard with platform island.
    spikeRow(g, h - 3, 20, 4);
    platT(g, 10, 22, 3);

    // Section C (x 32–48): VERTICAL TOWER — climb a multi-tier rack.
    rectT(g, 10, 32, 2, 4, W);
    platT(g, 12, 35, 3);
    platT(g,  9, 38, 3);
    platT(g,  6, 42, 3);
    ladderT(g, 5, 31, 9);

    // Section D (x 48–60): SECOND ELECTRIC FLOOR — wider, platform hop.
    spikeRow(g, h - 3, 50, 5);
    platT(g, 10, 50, 2);
    platT(g,  8, 54, 3);
    platT(g, 10, 58, 2);
    // Crumble bridge — stand still and you drop into the electric floor.
    for (let i = 0; i < 6; i++) setT(g, 10, 52 + i, B);

    // Section F (x 60–80): CABLE MAZE — three vertical pillars of server
    // racks with one-way platforms threading between them. Forces the
    // player to commit to a horizontal route at each elevation. Snipers
    // up top, cabinet on the ground floor.
    rectT(g, 8, 62, 1, 6, W);          // pillar 1
    rectT(g, 6, 70, 1, 8, W);          // pillar 2 (taller)
    rectT(g, 9, 78, 1, 5, W);          // pillar 3
    platT(g, 9, 64, 4);                // lower bridge between p1-p2
    platT(g, 6, 66, 3);                // mid bridge
    platT(g, 4, 73, 3);                // top bridge between p2-p3
    platT(g, 9, 74, 3);                // lower bridge between p2-p3
    ladderT(g, 7, 69, 6);              // ladder up pillar 2

    // Section G (x 80–92): FAN-BLADE GAUNTLET — two spike-row sections
    // separated by a one-way platform. Crumble tiles on the upper route
    // force you to keep moving; lower route requires precise jumps.
    spikeRow(g, h - 3, 82, 3);
    spikeRow(g, h - 3, 88, 3);
    platT(g, 9, 81, 3);
    platT(g, 9, 87, 3);
    for (let i = 0; i < 4; i++) setT(g, 9, 84 + i, B);   // crumble mid-bridge

    // Section H (x 92–96): BOSS APPROACH — final platform before exit door.
    platT(g, 9, 92, 4);
    setT(g, h - 3, w - 4, X);

    // R260: CEILING DUCTS — server-room HVAC catwalks at rows 1-2. Grapple
    // from the tower top (row 6) or the cable-maze top bridge (row 4) to
    // reach the duct layer. Each duct holds a high-tier crate that rewards
    // climbing all the way up before crossing horizontally.
    platT(g, 2, 14, 3);    // duct over warmup tower
    platT(g, 1, 40, 4);    // long duct over vertical tower
    platT(g, 2, 70, 3);    // duct over cable maze top bridge

    // Server-rack cover — near the first sniper at col 14.
    setT(g, h - 3, 16, C);
    // Cover near the sniper above the second electric floor.
    setT(g, h - 3, 56, C);
    // F: cover at pillar-3 base — duck behind the rack before the gauntlet.
    setT(g, h - 3, 79, C);
    // Floor-grate hide spots — drop into the cavity for stealth.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 26 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 46 + i, G);
    // F: cable-maze ground stealth — between pillar 1 and pillar 2.
    for (let i = 0; i < 3; i++) setT(g, h - 3, 68 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.SERVERROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 94 * GAME.TILE },
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
            // F: CABLE MAZE — folder on the tall middle pillar, cabinet
            // on the ground threading the gaps, sniper up top.
            { x: 66 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'folder' },
            { x: 72 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 77 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // G: FAN GAUNTLET — folder hovering between the spike rows
            // so player can't camp on the upper crumble bridge.
            { x: 86 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
        ],
        pickupSpawns: [
            // Top-tier verticality reward (was already here)
            { x: 42 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'LASER' },
            // Pre-mini-boss LIFE
            { x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // Pre-second-electric-floor SHOTGUN (heavy hit for sniper line)
            { x: 49 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'SHOTGUN' },
            // Cable-maze entry LIFE
            { x: 61 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // Pre-fan-gauntlet GRENADE stash — clears the lower folder
            { x: 80 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            // Pre-boss LIFE
            { x: 93 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // R260: ceiling-duct rewards — grapple from tower / maze top.
            { x: 15 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'LIFE' },
            { x: 42 * GAME.TILE, y: ( 0) * GAME.TILE, type: 'THUNDER' },
            { x: 71 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'LIFE' },
        ],
        crateSpawns: [
            // CHAINSAW for melee on the warmup cabinet (was already here)
            { x: 16 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'CHAINSAW' },
            // Tower mid-tier LIFE
            { x: 38 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'LIFE' },
            // F: cable-maze top platform — LASER (sniper-heavy section)
            { x: 73 * GAME.TILE, y: ( 4) * GAME.TILE - 14, drop: 'LASER' },
            // G: fan-gauntlet upper crumble — HOMING (last power play)
            { x: 86 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'HOMING' },
            // Pre-boss approach crate
            { x: 93 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'HOMING' },
        ],
        // R222: stage 3 walls — server cabinet alcoves with goodies.
        // Tag is at the cable-maze top — requires the high route.
        wallSpawns: [
            { x: 35 * GAME.TILE, y: ( 9) * GAME.TILE, w: 16, h: 16, drop: 'LIFE' },
            { x: 72 * GAME.TILE, y: ( 6) * GAME.TILE, w: 16, h: 16, drop: 'GRENADE' },
            { x: 56 * GAME.TILE, y: ( 4) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
    };
}

// Stage 4 — Board Room. Long conference table jumps, executive chairs as
// breakable cover, projectors raining slides.
function makeStage4() {
    // Stage 4 — Board Room. R185 deep-pass: extended 72→100 tiles with two
    // new sections (F: presentation hall, G: whiteboard climb). Many high
    // perches + chandelier routes = THUNDER + HOMING pickups dominate.
    const w = 100, h = 14;
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

    // Section D (x 46–60): PROJECTOR PIT — wider, chandelier hop.
    spikeRow(g, h - 3, 48, 4);
    platT(g, 5, 50, 3);
    platT(g, 10, 54, 5);

    // Section F (x 60–80): PRESENTATION HALL — three rows of executive
    // chairs (low walls) with a central podium. Sniper at podium top.
    // Player can vault chairs (jump) or slide under them. Chairs read as
    // breakable cover.
    rectT(g, 11, 62, 1, 2, W);          // chair row 1
    rectT(g, 11, 67, 1, 2, W);          // chair row 2
    rectT(g, 11, 72, 1, 2, W);          // chair row 3
    rectT(g,  9, 76, 1, 4, W);          // central podium (tall)
    platT(g,  6, 74, 4);                // podium top platform
    platT(g, 11, 65, 1);                // hop platform between chairs

    // Section G (x 80–92): WHITEBOARD CLIMB — vertical face with stepping
    // platforms. Sniper at top forces the player to climb under fire.
    platT(g, 11, 81, 2);
    platT(g,  9, 84, 2);
    platT(g,  7, 87, 2);
    platT(g,  5, 90, 3);                // top board (HOMING crate)
    ladderT(g, 6, 83, 5);               // ladder access on left

    // Section H (x 92–96): BOSS APPROACH — final raised platform.
    rectT(g, 9, 92, 2, 3, W);
    setT(g, h - 3, w - 4, X);

    // R260: UPPER-CHANDELIER TIER — three high chandeliers at rows 1-2 above
    // the existing row-5 chandeliers. Grapple from the lower chandeliers or
    // the whiteboard-climb top platform to chain into them. Each holds a
    // high-value pickup — pays out the "look up first" instinct.
    platT(g, 1, 20, 3);    // ceiling chandelier over projector pit 1
    platT(g, 2, 50, 3);    // ceiling chandelier over projector pit 2
    platT(g, 1, 88, 3);    // ceiling fixture above whiteboard climb top

    // Heavy boardroom door — duck-cover near the sniper above projectors.
    setT(g, h - 3, 46, C);
    // Velvet wall curtains — slip behind to break sniper line of sight.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 14 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 42 + i, G);
    // Second door near the holepunch sniper on the top route.
    setT(g, h - 3, 60, C);
    // F: cover at podium base for the chair-row sniper.
    setT(g, h - 3, 75, C);
    // G: stealth curtain at whiteboard climb entrance.
    for (let i = 0; i < 3; i++) setT(g, h - 3, 80 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.BOARDROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 94 * GAME.TILE },
        miniBossTrigger: 32 * GAME.TILE,
        enemySpawns: [
            // A-D (unchanged)
            { x: 10 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 18 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'stapler' },
            { x: 28 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'cabinet' },
            { x: 38 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 50 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'holepunch' },
            { x: 58 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'cabinet' },
            // F: PRESENTATION HALL — cabinet at chair row 2, sniper on
            // podium top, folder hovering over the chairs.
            { x: 69 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'cabinet' },
            { x: 76 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 71 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'folder' },
            // G: WHITEBOARD CLIMB — sniper at top of the wall, cabinet
            // at the base to soak shots while climbing.
            { x: 90 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'holepunch' },
            { x: 82 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'cabinet' },
        ],
        pickupSpawns: [
            // C top: THUNDER (unchanged)
            { x: 38 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'THUNDER' },
            // Pre-mini-boss LIFE
            { x: 30 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'LIFE' },
            // Pre-projector-pit SHOTGUN
            { x: 47 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'SHOTGUN' },
            // F: pre-presentation-hall GRENADE — chuck into chair rows
            { x: 61 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'GRENADE' },
            // F: mid-presentation LIFE
            { x: 75 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'LIFE' },
            // G: pre-climb HOMING pickup — handles the top sniper from below
            { x: 80 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'HOMING' },
            // Pre-boss LIFE
            { x: 93 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'LIFE' },
            // R260: upper-chandelier rewards — grapple-chain bonuses.
            { x: 21 * GAME.TILE, y: ( 0) * GAME.TILE, type: 'LIFE' },
            { x: 51 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'THUNDER' },
            { x: 89 * GAME.TILE, y: ( 0) * GAME.TILE, type: 'HOMING' },
        ],
        crateSpawns: [
            // A SHOTGUN (unchanged)
            { x: 12 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'SHOTGUN' },
            // C mid LIFE (unchanged)
            { x: 36 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'LIFE' },
            // D HOMING (unchanged)
            { x: 54 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'HOMING' },
            // F: podium top THUNDER (vertical reward, matches the C-tier
            // THUNDER pickup for sniper-bias progression)
            { x: 75 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'THUNDER' },
            // G: top of whiteboard HOMING — risk reward for top route
            { x: 91 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'HOMING' },
        ],
        // R222: stage 4 walls — boardroom panel walls. Tag hidden
        // behind a podium-side wall that needs grenade or chainsaw.
        wallSpawns: [
            { x: 28 * GAME.TILE, y: ( 8) * GAME.TILE, w: 16, h: 16, drop: 'LIFE' },
            { x: 68 * GAME.TILE, y: ( 7) * GAME.TILE, w: 16, h: 16, drop: 'GRENADE' },
            { x: 82 * GAME.TILE, y: ( 4) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
    };
}

// Stage 5 — Keynote Hall. Stage scaffolding climb, spotlight pits, audience
// seats as cover. Tall vertical section.
function makeStage5() {
    // Stage 5 — Keynote Hall. R186 deep-pass: 72→100 wide, h=18 preserved.
    // Added F: AUDIO BOOTH (electronics maze) + G: HIGH CATWALK GAUNTLET
    // (sniper alley along the rafters). Sniper-heavy stage → LASER/HOMING
    // dominate pickup roster.
    const w = 100, h = 18;
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
    spikeRow(g, h - 3, 50, 3);   // spotlight pit punishes missed drops

    // Section F (x 60–80): AUDIO BOOTH — electronics maze with mixing-board
    // walls forming a Z-pattern. Folder mid-maze, sniper in booth above.
    rectT(g, 11, 62, 1, 5, W);          // mixing console 1 (low-left)
    rectT(g,  8, 67, 1, 7, W);          // tall rack mid-maze
    rectT(g, 11, 73, 1, 5, W);          // mixing console 2 (low-right)
    platT(g,  9, 64, 2);                // hop platform
    platT(g,  6, 69, 3);                // mid platform
    platT(g,  9, 75, 2);                // hop platform right
    ladderT(g, 7, 71, 5);               // ladder access

    // Section G (x 80–92): HIGH CATWALK GAUNTLET — narrow ledge at row 5
    // with two spike pits below. Snipers along the rafters. Crumble tiles
    // mid-bridge force motion.
    platT(g, 5, 80, 4);
    platT(g, 5, 88, 4);
    for (let i = 0; i < 4; i++) setT(g, 5, 84 + i, B);   // crumble between
    spikeRow(g, h - 3, 82, 3);
    spikeRow(g, h - 3, 88, 3);
    platT(g, 11, 82, 2);                // safety platform below

    // Section H (x 92–96): DROP TO BOSS — staircase down.
    platT(g, 9, 92, 3);
    platT(g, 12, 95, 2);
    setT(g, h - 3, w - 4, X);

    // R234: GRAPPLE-ONLY REWARD PLATFORMS. Two high islands above the
    // catwalk that normal jumping can't reach — but the grapple's 144px
    // cone-aim hits them easily from the catwalk below. Each holds a
    // high-value pickup so the route is opt-in but enticing.
    platT(g, 2, 42, 3);   // floating above scaffold column — LIFE
    platT(g, 1, 76, 3);   // floating above audio booth — THUNDER

    // Podium cover — near the audience-floor sniper.
    setT(g, h - 3, 24, C);
    // Catwalk podium — near the holepunch sniper above audience.
    setT(g, h - 3, 60, C);
    // F: cover at audio-booth entrance.
    setT(g, h - 3, 75, C);
    // Audience seat rows — duck into chairs to break LOS.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 10 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 64 + i, G);
    // G: audio-booth stealth grass at mixing-board base.
    for (let i = 0; i < 3; i++) setT(g, h - 3, 70 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.KEYNOTE,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 94 * GAME.TILE },
        miniBossTrigger: 32 * GAME.TILE,
        enemySpawns: [
            // A-D (unchanged)
            { x: 12 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 22 * GAME.TILE, y: (12) * GAME.TILE, type: 'folder' },
            { x: 28 * GAME.TILE, y: (10) * GAME.TILE, type: 'holepunch' },
            { x: 40 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 48 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'cabinet' },
            { x: 56 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
            // F: AUDIO BOOTH — folder mid-maze, sniper on top mid platform,
            // cabinet on the ground threading.
            { x: 69 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 71 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'folder' },
            { x: 76 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // G: HIGH CATWALK GAUNTLET — two snipers on the rafters,
            // folder hovering between to deny camping.
            { x: 83 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'holepunch' },
            { x: 89 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'holepunch' },
            { x: 86 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'folder' },
        ],
        pickupSpawns: [
            // D top: THUNDER (unchanged)
            { x: 40 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'THUNDER' },
            // Pre-mini-boss LIFE
            { x: 30 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'LIFE' },
            // Pre-scaffold SHOTGUN
            { x: 32 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'SHOTGUN' },
            // F: pre-audio-booth GRENADE
            { x: 61 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            // F: mid-booth LIFE
            { x: 78 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // G: pre-catwalk HOMING — handles the two snipers from below
            { x: 80 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'HOMING' },
            // Pre-boss LIFE
            { x: 93 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // R234: grapple-only reward — LIFE on the high floating platform
            // above the scaffold column. Unreachable without grapple.
            { x: 43 * GAME.TILE, y: ( 2) * GAME.TILE - 8, type: 'LIFE' },
            // R234: grapple-only reward — THUNDER on the second floating
            // island above the audio booth.
            { x: 77 * GAME.TILE, y: ( 1) * GAME.TILE - 8, type: 'THUNDER' },
        ],
        crateSpawns: [
            { x: 18 * GAME.TILE, y: (12) * GAME.TILE - 14, drop: 'CHAINSAW' },
            { x: 40 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 56 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'HOMING' },
            // F: audio-booth top platform LASER (sniper bias)
            { x: 70 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'LASER' },
            // G: catwalk-crumble HOMING (risk reward on the mid-bridge)
            { x: 85 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'HOMING' },
        ],
        // R222: stage 5 walls — stage scaffolding chunks. Tag tucked
        // in the upper catwalk so vertical-route players get it.
        wallSpawns: [
            { x: 30 * GAME.TILE, y: (12) * GAME.TILE, w: 16, h: 16, drop: 'LIFE' },
            { x: 60 * GAME.TILE, y: (10) * GAME.TILE, w: 16, h: 16, drop: 'GRENADE' },
            { x: 78 * GAME.TILE, y: ( 3) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
    };
}

// Stage 6 — Founder's Lair. Forking high/low paths. Vertical server stacks.
function makeStage6() {
    // Stage 6 — Founder's Lair. R187 deep-pass: extended 76→104 wide.
    // Adds a third fork pair (FORK 3) + REACTOR HAZARD section before the
    // existing convergence climb. Penultimate stage runs longer than 1-5
    // by design — boss is the founder, this is the gauntlet to reach him.
    const w = 104, h = 16;
    const { g } = blankStage(w, h, THEME.FOUNDER);
    for (let x = 0; x < w; x++) g[0][x] = W; // ceiling

    // Section A (x 0–14): VERTICAL ENTRY — climb up to choose path.
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
    // Crumble bonus pedestal — bridges the catwalk gap.
    for (let i = 0; i < 4; i++) setT(g, 4, 28 + i, B);

    // Section F (x 48–66): FORK 3 — third high catwalk with crumble mid-bridge,
    // wider lava pit below. Same dilemma as F1/F2 escalated.
    platT(g, 4, 48, 6);
    spikeRow(g, h - 3, 52, 5);                   // wider pit
    platT(g, 4, 58, 6);
    ladderT(g, 5, 56, 8);
    for (let i = 0; i < 4; i++) setT(g, 4, 54 + i, B);   // crumble between

    // Section G (x 66–84): REACTOR HAZARD — narrow corridor with vertical
    // spike pillars (drop tiles from ceiling) and a low-route safe lane.
    // Reads as the founder's experiment chamber.
    rectT(g, 1, 68, 1, 4, S);                     // ceiling-spike pillar 1
    rectT(g, 1, 73, 1, 5, S);                     // ceiling-spike pillar 2 (longer)
    rectT(g, 1, 79, 1, 4, S);                     // ceiling-spike pillar 3
    platT(g, 9, 70, 4);
    platT(g, 7, 76, 4);
    platT(g, 9, 81, 3);

    // Section D (x 84–96): CONVERGENCE — paths meet at a vertical climb.
    rectT(g, 4, 84, 1, 8, W);
    ladderT(g, 5, 86, 8);
    platT(g, 9, 88, 5);
    rectT(g, 3, 94, 1, 11, W);
    ladderT(g, 4, 95, 10);
    platT(g, 6, 96, 4);

    // Section E (x 96–104): BOSS APPROACH — final descent to arena.
    platT(g, 9, 98, 4);
    rectT(g, 9, w - 4, 1, 3, W);
    setT(g, h - 3, w - 4, X);

    // R234: GRAPPLE SHORTCUT — high reward pedestal sits between the
    // fork-1 high catwalk and the fork-2 high catwalk, 3 tiles above
    // both. Normal jumping can't reach; grapple toward the ceiling
    // edge to swing onto it. Holds a CLIPPY_TAG so completionists
    // have a reason to chase it.
    platT(g, 2, 28, 3);
    // Second grapple-reach pedestal high above the reactor — escape
    // the spike-pillar corridor by swinging across the top.
    platT(g, 2, 74, 3);

    // Crimson statue cover — near the holepunch sniper at col 52.
    setT(g, h - 3, 52, C);
    // F: third-fork statue cover at col 60.
    setT(g, h - 3, 60, C);
    // Arcane lab drape — velvet curtain hides.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 20 + i, G);
    // G: stealth at reactor entrance.
    for (let i = 0; i < 3; i++) setT(g, h - 3, 67 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.FOUNDER,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 98 * GAME.TILE },
        miniBossTrigger: 32 * GAME.TILE,
        enemySpawns: [
            { x: 12 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 16 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 24 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 28 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 36 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'folder' },
            { x: 44 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // F: FORK 3 — sniper on high catwalk + folder over the wider pit
            { x: 56 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 60 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
            // G: REACTOR — folder weaving the spike pillars + cabinet at exit
            { x: 75 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
            { x: 82 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // D: CONVERGENCE — sniper at vertical climb (was col 54, now 88)
            { x: 88 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
            // E: BOSS APPROACH — last grunt to soak before founder fight
            { x: 96 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
        ],
        pickupSpawns: [
            // B top: LASER (unchanged)
            { x: 24 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'LASER' },
            // Pre-mini-boss LIFE
            { x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // Pre-fork-3 SHOTGUN (wider spike pit ahead, heavy hit weapon)
            { x: 47 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'SHOTGUN' },
            // F: post-fork-3 LIFE on far ledge
            { x: 64 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // G: pre-reactor GRENADE (clear pillar folder)
            { x: 67 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            // G: post-reactor HOMING (sets up the convergence sniper)
            { x: 83 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'HOMING' },
            // Pre-boss LIFE
            { x: 97 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // R234: grapple-reach pedestal between forks 1 & 2 — CLIPPY_TAG
            // sits up high so the only way to claim it is to grapple from
            // either catwalk.
            { x: 29 * GAME.TILE, y: ( 2) * GAME.TILE - 8, type: 'CLIPPY_TAG' },
            // R234: grapple shortcut over the reactor pillars — THUNDER
            // pays out skipping the hazard via grapple swing.
            { x: 75 * GAME.TILE, y: ( 2) * GAME.TILE - 8, type: 'THUNDER' },
        ],
        crateSpawns: [
            // A SPREAD (unchanged)
            { x: 12 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'SPREAD' },
            // C top LIFE (unchanged)
            { x: 36 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'LIFE' },
            // D mid THUNDER (was col 54, now 88 for the new layout)
            { x: 88 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'THUNDER' },
            // E LIFE (was col 66, now 98)
            { x: 98 * GAME.TILE, y: ( 8) * GAME.TILE - 14, drop: 'LIFE' },
            // F: third-fork high crate (HOMING — risk reward on the
            // crumble bridge mirrors F2's bonus pedestal)
            { x: 56 * GAME.TILE, y: ( 4) * GAME.TILE - 14, drop: 'HOMING' },
            // G: reactor mid platform LASER (sniper-prep through pillars)
            { x: 77 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'LASER' },
        ],
        // R222: stage 6 walls — Founder's lair stone blocks. Tag in
        // the deepest reactor recess — hardest tag of the campaign.
        wallSpawns: [
            { x: 22 * GAME.TILE, y: ( 8) * GAME.TILE, w: 16, h: 16, drop: 'LIFE' },
            { x: 74 * GAME.TILE, y: ( 9) * GAME.TILE, w: 16, h: 16, drop: 'GRENADE' },
            { x: 92 * GAME.TILE, y: ( 4) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
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
            // R188: Boss Rush stays at single-arena footprint (no geometry
            // changes — that's the whole gimmick of the mode), but the
            // pickup roster gets the Contra-rule treatment: more LIFE pads
            // for the multi-boss gauntlet, GRENADE pickups to seed AoE
            // between bosses, and SHOTGUN+LASER pickups on the upper plats
            // for vertical-movement reward.
            { x: 18 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
            { x: 22 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
            { x: 14 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'GRENADE' },
            { x: 26 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'GRENADE' },
            { x:  8 * GAME.TILE, y: ( 7) * GAME.TILE - 10, type: 'SHOTGUN' },
            { x: 32 * GAME.TILE, y: ( 7) * GAME.TILE - 10, type: 'LASER' },
        ],
        crateSpawns: [
            { x: 10 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'THUNDER' },
            // Extra crates spaced symmetrically to flank player on respawn
            { x: 16 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 24 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'LIFE' },
        ],
        // R222: stage 7 boss-rush walls — single corner tag, no
        // mid-fight items since the arena is tight. The tag is high
        // and far enough from the bosses to be safe.
        wallSpawns: [
            { x: 4 * GAME.TILE, y: ( 4) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
    };
}

// Stage 8 — The Cloud. Floating platforms in a void, gravity-flip illusion
// via inverted platforms on the ceiling. Final approach to The Algorithm.
function makeStage8() {
    // Stage 8 — The Cloud finale. R189 deep-pass: extended 80→108 wide.
    // Two new sections (DATA STORM + ALGORITHM ANTECHAMBER) for a proper
    // finale-length gauntlet. Sniper + folder heavy, so HOMING dominates.
    const w = 108, h = 16;
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

    // Section C (x 34–50): CEILING DESCENT — ceiling platforms.
    platT(g,  2, 36, 3);
    platT(g, 12, 38, 4);
    platT(g,  8, 44, 4);
    platT(g,  4, 48, 4);

    // Section D (x 50–66): SECOND DATA-RAIN — wider hazard near peak.
    platT(g,  2, 56, 3);
    platT(g, 10, 54, 5);
    platT(g,  6, 60, 4);
    spikeRow(g, 1, 52, 4);   // ceiling data-rain hazard #2

    // Section F (x 66–86): DATA STORM — diagonal cascade of platforms with
    // ceiling-rain on every column. The hazard pattern teaches the player
    // to read the rain timing (which is constant in this section) while
    // descending. Snipers on the high outer platforms.
    platT(g,  3, 68, 3);
    platT(g,  6, 72, 3);
    platT(g,  9, 76, 3);
    platT(g, 12, 80, 3);
    platT(g,  3, 82, 3);     // alt-high platform back up
    spikeRow(g, 1, 67, 18);  // ceiling-rain runs the whole section

    // Section G (x 86–100): ALGORITHM ANTECHAMBER — three ascending wall
    // platforms forming a stepped pyramid to a final high ledge. Holepunch
    // sniper on the top. Floor pit at base — falling = death.
    for (let x = 88; x < 98; x++) { g[h - 1][x] = E; g[h - 2][x] = E; }
    platT(g, 11, 86, 2);     // entry ledge
    rectT(g, 10, 89, 1, 3, W);
    rectT(g,  8, 92, 1, 5, W);
    rectT(g,  6, 95, 1, 7, W);
    platT(g, 11, 98, 3);     // exit ledge (over the boss pit)

    // Section E (x 100–104): ALGORITHM APPROACH — final floating cube + exit.
    platT(g, 12, w - 8, 4);
    rectT(g, 8, w - 6, 3, 3, W);
    setT(g, 8, w - 4, X);     // exit tile up high

    // Floating data-pillar cover near snipers above the archipelago.
    setT(g, h - 3, 24, C);
    setT(g, h - 3, 48, C);
    // F: cover at data-storm entry — slip behind a pillar before the cascade.
    setT(g, h - 3, 66, C);
    // Drifting cloud puffs — duck into the mist between data pillars.
    for (let i = 0; i < 2; i++) setT(g, h - 3, 36 + i, G);
    // G: stealth on antechamber entry ledge.
    for (let i = 0; i < 2; i++) setT(g, 11, 86 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.CLOUD,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 102 * GAME.TILE },
        miniBossTrigger: 40 * GAME.TILE,
        enemySpawns: [
            { x: 16 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'holepunch' },
            { x: 24 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'holepunch' },
            { x: 32 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 40 * GAME.TILE, y: ( 7) * GAME.TILE, type: 'folder' },
            { x: 48 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'holepunch' },
            { x: 56 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'folder' },
            { x: 64 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            // F: DATA STORM — two snipers on high alt platforms, folder
            // weaving the cascade.
            { x: 69 * GAME.TILE, y: ( 2) * GAME.TILE, type: 'holepunch' },
            { x: 83 * GAME.TILE, y: ( 2) * GAME.TILE, type: 'holepunch' },
            { x: 77 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'folder' },
            // G: ANTECHAMBER — sniper at the top of the pyramid + folder
            // hovering the pit to deny easy fall-recovery.
            { x: 96 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 93 * GAME.TILE, y: ( 8) * GAME.TILE, type: 'folder' },
        ],
        pickupSpawns: [
            // C top: THUNDER (unchanged)
            { x: 32 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'THUNDER' },
            // Pre-mini-boss LIFE
            { x: 38 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'LIFE' },
            // Pre-data-rain-2 SHOTGUN
            { x: 50 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'SHOTGUN' },
            // F: pre-data-storm GRENADE — chuck into the cascade
            { x: 66 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'GRENADE' },
            // F: mid-storm LIFE
            { x: 76 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'LIFE' },
            // G: pre-antechamber HOMING — handles the top sniper from below
            { x: 86 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'HOMING' },
            // Pre-boss LIFE
            { x: 101 * GAME.TILE, y: ( 9) * GAME.TILE - 8, type: 'LIFE' },
        ],
        crateSpawns: [
            { x: 24 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'LASER' },
            { x: 40 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 56 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'HOMING' },
            // F: data-storm alt-high HOMING
            { x: 83 * GAME.TILE, y: ( 3) * GAME.TILE - 14, drop: 'HOMING' },
            // G: top antechamber THUNDER — final power before The Algorithm
            { x: 96 * GAME.TILE, y: ( 6) * GAME.TILE - 14, drop: 'THUNDER' },
        ],
        // R222: stage 8 walls — floating cloud-data shards. Last tag
        // of the campaign sits just before the Algorithm antechamber.
        wallSpawns: [
            { x: 26 * GAME.TILE, y: ( 8) * GAME.TILE, w: 16, h: 16, drop: 'LIFE' },
            { x: 70 * GAME.TILE, y: ( 9) * GAME.TILE, w: 16, h: 16, drop: 'GRENADE' },
            { x: 90 * GAME.TILE, y: ( 5) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
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
    // R260: CEILING CRAWL — two upper shelves at row 2 + 3 grapple-reachable
    // from the row-7 platforms below. Lets the secret bin reward verticality
    // even at its compact footprint.
    platT(g, 2, 10, 3);
    platT(g, 3, 22, 3);
    platT(g, 2, 38, 3);
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
            // R260: ceiling-shelf rewards — grapple up for the goods.
            { x: 11 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'LIFE' },
            { x: 23 * GAME.TILE, y: ( 2) * GAME.TILE, type: 'LASER' },
            { x: 39 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'LIFE' },
        ],
        crateSpawns: [
            { x: 24 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 44 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'THUNDER' },
        ]
    };
}

// Training Ground — stage index 10. Player is invincible, ammo unlimited,
// grenades capped+refilling, scripted zone banners. Long flat hallway with
// 7 lessons spaced ~16 tiles apart. Each zone has the prop the lesson
// needs (wall for grapple, cover tree, dummy enemy, weapon pickup, crate).
//
// Zones (x ranges in tiles):
//   0-12   : Z1 MOVEMENT  — arrows + jump + double-jump platforms
//   12-26  : Z2 SHOOTING  — first dummy enemy + free weapon pickup
//   26-40  : Z3 COVER     — cover prop + sniper above
//   40-56  : Z4 GRAPPLE   — overhang wall + pit; grapple to cross
//   56-70  : Z5 DASH      — knife dash through a row of dummies
//   70-86  : Z6 GRENADE   — 3 crates clumped, throw to clear
//   86-100 : Z7 POUNCE    — cover + stunned dummy; cover→jump→stab
//   100-108: EXIT door (returns to title)
function makeTraining() {
    const w = 108, h = 14;
    const { g } = blankStage(w, h, THEME.JUNGLE);

    // Z1 MOVEMENT: two ascending platforms for the double-jump lesson
    platT(g, 10,  6, 3);
    platT(g,  7, 10, 3);

    // Z3 COVER: tree on lower platform — the cover sprite (C tile id)
    setT(g, h - 3, 30, C);

    // Z4 GRAPPLE: pit, then a high overhang the player must grapple onto.
    // Floor cuts out at x=46..52 (6-tile pit), with the far edge restored
    // from x=53 onward. A wide perch platform sits high above the pit's far
    // side — too high to reach with a double-jump, just within grapple range.
    // Landing surface is 3 tiles wide so the player can actually stand on it
    // after the grapple releases, instead of bouncing off a 1-tile spike.
    for (let x = 46; x <= 52; x++) {
        setT(g, h - 1, x, E);
        setT(g, h - 2, x, E);
    }
    // Grapple-only perch at y=4, x=49-51 (3 wide, with the LASER pickup atop)
    rectT(g, 4, 49, 3, 1, W);

    // Z5 DASH: low cabinets every 3 tiles to dash through
    platT(g, 11, 58, 2);
    platT(g, 11, 62, 2);
    platT(g, 11, 66, 2);

    // Z6 GRENADE: stack of 3 crates close together (placed via crateSpawns below)
    // Z7 POUNCE: cover for stealth pounce setup
    setT(g, h - 3, 90, C);

    // Exit door
    setT(g, h - 3, w - 4, X);

    // Ladders are nice teach moments — one at the start to climb back if
    // they fell into the grapple pit. Place ladder bridging pit base to
    // surface so a fall isn't terminal.
    ladderT(g, h - 2, 48, 1);   // tiny — just enough to teach climb

    return {
        tiles: g, width: w, height: h, theme: THEME.JUNGLE,
        playerStart: { x: 32, y: (h - 4) * GAME.TILE },
        // No boss in training
        bossTrigger: null,
        miniBossTrigger: null,
        owlRoosts: [],
        enemySpawns: [
            // Z2: a dummy stapler — easy first kill
            { x: 20 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            // Z3: sniper above the cover prop — teaches duck-behind
            { x: 32 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            // Z5: 3 cabinet dummies arranged for the dash combo
            { x: 60 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 64 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 68 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // Z6: a folder near the crate stack — teaches grenade AoE
            { x: 76 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'folder' },
            // Z7: a stapler dummy for the pounce target
            { x: 94 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [
            // Z2: free SPREAD weapon next to the first dummy
            { x: 22 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'SPREAD' },
            // Z4 reward: a LASER sitting on top of the grapple-only perch.
            // Perch tiles are at row 4; pickup sits one tile above (row 3).
            { x: 50 * GAME.TILE, y: ( 3) * GAME.TILE - 4, type: 'LASER' },
            // Z6 grenade pickup so the lesson has grenades to throw
            { x: 72 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            // WEAPON RANGE — full 6 firearms scattered along the course so
            // players can try each. Placed on small platforms or on the floor
            // between zones so they don't crowd the lesson props.
            { x: 24 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'SHOTGUN' },
            { x: 38 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'FLAME' },
            { x: 56 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'HOMING' },
            { x: 70 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'THUNDER' },
            { x: 86 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'CHAINSAW' },
        ],
        crateSpawns: [
            // Z6: cluster of 3 crates — throw one grenade to chain-pop them
            { x: 78 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 80 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 82 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'THUNDER' },
        ],
        // Flag picked up by the game/player code to enable god mode + infinite
        // ammo + zone banners. STAGE_LOADERS index 10 maps to this.
        training: true,
        // Floating zone banners — drawn from game.js _drawPlay when training
        // is active. Each is { x: world-x in px, lines: [string, ...] }.
        banners: [
            // Welcome banner at spawn — sets expectation before lessons start.
            { x:   2 * GAME.TILE, lines: ['TRAINING GROUND',           'YOU CANNOT DIE HERE',
                                          'AMMO IS UNLIMITED',         'WALK RIGHT TO LEARN'] },
            { x:   4 * GAME.TILE, lines: ['ZONE 1 — MOVEMENT',         'ARROWS TO MOVE',
                                          'Z TO JUMP',                 'Z AGAIN MID-AIR FOR DOUBLE JUMP'] },
            { x:  16 * GAME.TILE, lines: ['ZONE 2 — SHOOTING',         'X TO FIRE',
                                          'PICK UP THE WEAPON',        'SHOOT THE STAPLER'] },
            { x:  30 * GAME.TILE, lines: ['ZONE 3 — COVER',            'HOLD UP NEAR THE TREE',
                                          'BULLETS PASS OVER YOU',     'PEEK OUT TO RETURN FIRE'] },
            { x:  44 * GAME.TILE, lines: ['ZONE 4 — GRAPPLE + LEDGE',  'C MID-AIR TO REEL IN',
                                          'OR JUMP NEAR A LEDGE',      'UP/JUMP TO PULL UP'] },
            { x:  60 * GAME.TILE, lines: ['ZONE 5 — KNIFE DASH',       'PRESS C ON THE GROUND',
                                          'DASH THROUGH THE CABINETS', 'HOLD DOWN + C TO BACKDASH'] },
            { x:  74 * GAME.TILE, lines: ['ZONE 6 — GRENADE',          'PICK UP THE GRENADE',
                                          'V TO THROW',                'AOE CLEARS CRATES + ENEMIES'] },
            { x:  90 * GAME.TILE, lines: ['ZONE 7 — STEALTH POUNCE',   'HIDE BEHIND THE TREE',
                                          'JUMP STRAIGHT UP',          'C MID-AIR TO STAB DOWN'] },
            { x: 102 * GAME.TILE, lines: ['TRAINING COMPLETE',         'WALK THROUGH THE DOOR',
                                          'YOU ARE READY.',            ''] },
        ],
    };
}

// Boss Rush Mode — stage 11. Unlocks after first 'clear_game' achievement.
// Wider arena than stage 7's GAUNTLET, with the full 7-unique-boss queue
// (campaign has 7 unique boss kinds; stage 7 is itself a 3-boss recap that
// we skip here to avoid duplication). No grunts, no pickups between, no
// stage cards — pure back-to-back boss fights. Three LIFE pickups + a
// HOMING crate as the only sustain. Best clear time persisted in
// achievements.stats.bestBossRushTime.
function makeBossRushMode() {
    const w = 42, h = 14;
    const { g } = blankStage(w, h, THEME.SERVERROOM);
    rectT(g, 0, 0, 1, h, W);
    rectT(g, 0, w - 1, 1, h, W);
    // Same platform layout as stage 7 but slightly wider for the bigger arena
    platT(g,  9,  6, 4);
    platT(g,  7, 14, 4);
    platT(g,  9, 22, 4);
    platT(g,  7, 30, 4);
    // Floor grates at edges for line-of-sight breaks
    for (let i = 0; i < 2; i++) setT(g, h - 3, 4 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 36 + i, G);
    return {
        tiles: g, width: w, height: h, theme: THEME.SERVERROOM,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 6 * GAME.TILE },
        enemySpawns: [],     // No grunts — pure boss rush
        pickupSpawns: [
            { x: 12 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
            { x: 21 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
            { x: 30 * GAME.TILE, y: (h-3) * GAME.TILE - 10, type: 'LIFE' },
        ],
        crateSpawns: [
            { x: 21 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'HOMING' },
        ],
        // Game.js consumes this flag to swap into the 8-boss queue and start
        // the run timer. The boss field on STAGES[11] is GAUNTLET_FULL.
        bossRushMode: true,
    };
}

// Time Trial — stage 12. Unlocks after first 'clear_game'. Plays stage 1
// (Office Park Jungle) layout with a prominent clock on the HUD. Best clear
// time persisted in achievements.stats.bestTimeTrialTime.
function makeTimeTrial() {
    const data = makeStage1();
    data.timeTrialMode = true;
    return data;
}

// R190: Stage 13 — REALITY DISTORTION FIELD. After-credits secret stage
// unlocked by completing the main campaign (clear_game). Steve Jobs as the
// post-credits titan. Geometry is a keynote auditorium / black-mirror floor
// arena — short approach, three audience-row platforms, then the boss pit.
// Painted bg_reality_distortion.png paints over the procedural tiles.
function makeStage13() {
    const w = 64, h = 16;
    const { g } = blankStage(w, h, THEME.REALITY);

    // Section A (x 0–18): SHORT APPROACH — audience-floor platforms.
    platT(g, 11, 8, 4);
    platT(g, 11, 16, 4);

    // Section B (x 18–34): AUDIENCE ROWS — three ascending bench platforms
    // forming a staircase up to the stage. R195: these were solid walls
    // (W) — a 4-tall wall at col 28 was an immediate hard blocker. Now
    // one-way platforms (P) shaped as bench tops, with empty space behind
    // so they read as benches the player jumps up onto.
    platT(g, 12, 20, 3);   // low bench
    platT(g, 10, 24, 3);   // mid bench
    platT(g,  8, 28, 3);   // tall bench (jump-up reach)

    // Section C (x 34–48): SPOTLIGHT PITS — two narrow black-mirror gaps in
    // the floor (death falls) with chandelier platforms above offering a
    // sniper-perch option. Mid-spot allowed for full arena traversal.
    for (let i = 0; i < 3; i++) g[h - 2][36 + i] = E;
    for (let i = 0; i < 3; i++) g[h - 2][44 + i] = E;
    platT(g, 6, 36, 3);          // chandelier 1
    platT(g, 6, 44, 3);          // chandelier 2
    platT(g, 11, 40, 3);         // safe mid platform

    // Section D (x 48–60): BOSS ARENA — wide flat keynote-stage area
    // where Jobs paces and throws projectiles. Two cover pillars + the
    // exit pit (boss kill ends stage).
    setT(g, h - 3, 50, C);       // bondi-blue cube pillar cover
    setT(g, h - 3, 56, C);       // second cube pillar
    // Stealth grass in the back corners — audience curtain
    for (let i = 0; i < 2; i++) setT(g, h - 3, 60 + i, G);

    return {
        tiles: g, width: w, height: h, theme: THEME.REALITY,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        // R195: bossTrigger was at col 50 — *inside* the boss arena, but
        // right next to the spawn pillar so player got pinned by the
        // boss-intro the moment they entered. Move trigger to col 54 so
        // there's actual arena space first.
        bossTrigger: { x: 54 * GAME.TILE },
        // No mini-boss — straight to Jobs.
        enemySpawns: [
            // Light grunt sweep through audience approach. R195: cabinet
            // was spawned on the row-12 bench (now a 3-wide platform) and
            // would pace itself off the edge into the floor. Moved to the
            // main floor between low and mid benches so it can patrol the
            // approach properly.
            { x: 12 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 22 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 32 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            { x: 42 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'folder' },
        ],
        pickupSpawns: [
            { x: 16 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'SHOTGUN' },
            { x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            { x: 40 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            { x: 49 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
        ],
        crateSpawns: [
            { x:  9 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 28 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'THUNDER' },
            { x: 40 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'LIFE' },
        ]
    };
}

// R226: THE PIPELINE — new stage 4. Two-act layout, first half is sewer
// descent (vertical-ish corridors, sludge spikes, ladders), second half
// transitions visually into the experimentation lab where Dr. Spindler
// waits. Length matches Stage 3 (~90 tiles) so pacing stays consistent.
function makeStagePipeline() {
    const w = 100, h = 14;
    const { g } = blankStage(w, h, THEME.SEWER);

    // Section A (x 0–18): SEWER ENTRY — drop into the corridor. Tight platforms,
    // first taste of dripping sludge spikes.
    platT(g, 9, 6, 4);
    platT(g, 6, 12, 3);
    spikeRow(g, h - 3, 14, 2);   // first sludge puddle

    // Section B (x 18–34): PIPE BRIDGE — horizontal pipe segments as platforms.
    rectT(g, 10, 20, 6, 1, P);    // long pipe (one-way platform)
    platT(g, 7,  26, 3);          // upper pipe junction
    rectT(g, 11, 30, 4, 1, P);    // lower pipe

    // Section C (x 34–50): LADDER DESCENT — drop deeper, hole-punch sniper
    // perched on a pipe across the gap.
    ladderT(g, h - 4, 36, 3);
    spikeRow(g, h - 3, 40, 4);    // wide sludge pit
    platT(g, 9,  42, 3);          // mid-air pipe
    platT(g, 6,  46, 3);          // upper-route pipe

    // Section D (x 50–68): LAB ENTRY TRANSITION — backdrop swaps to the lab.
    // Geometry simplifies into an arena-style room; first containment tubes
    // become destructible cover.
    rectT(g, 10, 54, 3, 1, W);    // operating table 1
    rectT(g, 10, 60, 3, 1, W);    // operating table 2
    platT(g, 7,  56, 4);          // upper catwalk

    // Section F (x 68–84): SPECIMEN HALL — rows of cover (containment tubes).
    setT(g, h - 3, 68, C);
    setT(g, h - 3, 72, C);
    setT(g, h - 3, 76, C);
    setT(g, h - 3, 80, C);
    platT(g, 6, 70, 4);

    // Section G (x 84–96): BOSS APPROACH — clearing, exit door.
    rectT(g, 11, 86, 4, 1, W);
    setT(g, h - 3, w - 4, X);

    // R260: UPPER PIPE LOFT — sewer-act overhead pipes + lab-act ceiling
    // ducts at rows 1-2. Grapple from the upper-route pipes (rows 6-7) or
    // operating-table cover to reach them. Treetop-equivalent for the
    // industrial theme — gives players a parallel high road past the
    // sludge pits and specimen-hall traffic.
    platT(g, 2, 12, 3);    // sewer-entry overhead pipe
    platT(g, 1, 30, 4);    // long industrial pipe over bridge
    platT(g, 2, 56, 3);    // lab-entry ceiling duct
    platT(g, 1, 76, 4);    // specimen-hall ceiling duct

    return {
        tiles: g, width: w, height: h, theme: THEME.SEWER,
        // R228: was x:32 which dropped Clippy in the middle of Section C
        // (ladder descent) with the pipe-bridge obstacles behind him and
        // walls ahead — net effect was a stuck spawn near the lab gate.
        // Start at x:32 in pixels = 2 tiles in, lined up with the stage
        // entry from above (camera scrolls right normally).
        playerStart: { x: 2 * GAME.TILE, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 92 * GAME.TILE },
        // Mini-boss spawns at the act break (lab entry).
        miniBossTrigger: 50 * GAME.TILE,
        enemySpawns: [
            // A: stapler near sewer entry
            { x: 10 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            // B: folder on pipe bridge
            { x: 26 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'folder' },
            { x: 32 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            // C: sniper on the gap
            { x: 44 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'holepunch' },
            // D: stapler + cabinet in transition
            { x: 56 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 62 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            // F: folder above specimen hall, sniper on catwalk
            { x: 70 * GAME.TILE, y: ( 5) * GAME.TILE, type: 'folder' },
            { x: 82 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
        ],
        pickupSpawns: [
            // Pre-mini LIFE
            { x: 48 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // Mid-stage GRENADE (transition into lab)
            { x: 52 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
            // Pre-boss LIFE
            { x: 88 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            // R260: upper-pipe loft rewards — grapple high road bonuses.
            { x: 13 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'LIFE' },
            { x: 31 * GAME.TILE, y: ( 0) * GAME.TILE, type: 'THUNDER' },
            { x: 57 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'LIFE' },
            { x: 77 * GAME.TILE, y: ( 0) * GAME.TILE, type: 'HOMING' },
        ],
        crateSpawns: [
            // Early SHOTGUN — sewer-tight CQB weapon
            { x:  8 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'SHOTGUN' },
            // Mid HOMING — through the pipe junctions
            { x: 24 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'HOMING' },
            // Lab entry SPREAD — open-arena reward
            { x: 54 * GAME.TILE, y: ( 9) * GAME.TILE - 14, drop: 'SPREAD' },
            // Specimen hall THUNDER — late-stage power weapon
            { x: 78 * GAME.TILE, y: (h - 3) * GAME.TILE - 14, drop: 'THUNDER' },
        ],
        // R222 breakable walls — one of each type per stage standard.
        wallSpawns: [
            { x: 47 * GAME.TILE, y: ( 5) * GAME.TILE, w: 16, h: 16, drop: 'LIFE' },
            { x: 67 * GAME.TILE, y: (h - 4) * GAME.TILE, w: 16, h: 16, drop: 'GRENADE' },
            // Hidden tag — way up high above the lab entry, requires aim-lock + jump
            { x: 50 * GAME.TILE, y: ( 3) * GAME.TILE, w: 16, h: 16, drop: 'CLIPPY_TAG' },
        ],
    };
}

export const STAGE_LOADERS = [
    null,
    () => makeStage1(),
    () => makeStage2(),
    () => makeStage3(),
    () => makeStagePipeline(),         // R226: stage 4 — sewer/lab + Dr. Spindler
    () => makeStage4(),                // R281: stage 5 BOARD ROOM (Ballmer escapes)
    () => makeFpsStageBallmer(),       // R281: stage 6 BALLMER OFFICE FPS approach
    () => makeFpsStageBallmerArena(),  // R281: stage 7 BALLMER ARENA FPS boss fight
    () => makeStage5(),                // R281: stage 8 KEYNOTE HALL (Gates escapes)
    () => makeFpsStageGates(),         // R291: stage 9 KEYNOTE FPS approach
    () => makeFpsStageGatesArena(),    // R291: stage 10 GATES ARENA FPS boss
    () => makeStage6(),                // R291: stage 11 FOUNDER'S LAIR (was 9)
    () => makeStage7(),                // R291: stage 12 BOSS RUSH (was 10)
    () => makeStage8(),                // R291: stage 13 THE CLOUD (was 11)
    () => makeStage9(),                // R291: stage 14 secret RECYCLE BIN (was 12)
    () => makeTraining(),              // R291: stage 15 TRAINING GROUND (was 13)
    () => makeBossRushMode(),          // R291: stage 16 BOSS RUSH MODE (was 14)
    () => makeTimeTrial(),             // R291: stage 17 TIME TRIAL (was 15)
    () => makeStage13(),               // R291: stage 18 REALITY DISTORTION FIELD (was 16)
    () => makeFpsStage(),              // R291: stage 19 CORE BREACH (was 17)
];

// R261: FPS-arena stage data. NOT a regular level — returns fpsMode flag so
// _startStage routes to the FpsArena scene instead of the platformer pipeline.
// Stage data is minimal: the arena owns its segment layout internally. We
// pass theme + backdrop + boss identity so the same arena scene can be
// reused for additional FPS stages later (Ballmer building, etc.).
function makeFpsStage() {
    return {
        fpsMode: true,
        theme: THEME.SEWER,
        music: 'pipeline',
        bgKey: 'bg_sewer_lab',
        bossKind: 'SPINDLER',
        // R293: full polish for the long-neglected FPS Spindler bonus stage.
        // 4-segment progression matches the Ballmer + Gates pairs: ducts/
        // grunts/barrier waves then the bio-lab boss.
        bgKeys: ['bg_sewer', 'bg_sewer', 'bg_sewer_lab', 'bg_sewer_lab'],
        segmentLabels: [
            'SEGMENT 1 / DUCT TURRETS',
            'SEGMENT 2 / SPECIMENS',
            'SEGMENT 3 / BIOHAZARD',
            'DR. SPINDLER',
        ],
        bossLabels: {
            shielded: 'SPINDLER / SHIELDED',
            exposed:  'SPINDLER / EXPOSED',
        },
        ambientKey: 'fluorescent',
        bossPortraitKey: 'boss_intro_SPINDLER',
        bossDisplayName: 'DR. SPINDLER',
    };
}

// R268: Ballmer office FPS stage — second Contra-base-style FPS arena.
// Reuses the FpsArena class with per-stage sprite-key overrides + an
// office-themed backdrop chain. Boss is Steve Ballmer with a chair.
//
// R280: split into TWO stages so the office is the "approach" leading up
// to the Ballmer confrontation arena:
//   Stage 16 (BALLMER OFFICE)  — 4 segments of corridor enemies, no boss.
//                                Player reaches Ballmer's office door at the
//                                end and the stage clears.
//   Stage 17 (BALLMER ARENA)   — single boss segment, just Ballmer + shields.
const BALLMER_SPRITE_KEYS = {
    turret: 'office_turret',
    grunt:  'office_grunt',
    shield: 'office_drone',
    core:   'boss_ballmer_fps',
};
const BALLMER_SFX_KEYS = {
    turretFire: 'faxRing',
    gruntFire:  'typewriter',
    coreFire:   'chairWhoosh',
};

function makeFpsStageBallmer() {
    return {
        fpsMode: true,
        theme: THEME.BOARDROOM,
        music: 'boardroom',
        bgKey: 'bg_office',
        bossKind: 'BALLMER',
        bgKeys: ['bg_office', 'bg_office', 'bg_office', 'bg_office'],
        spriteKeys: BALLMER_SPRITE_KEYS,
        // R280: office approach — 4 wave segments, NO boss. Final segment
        // is an empty corridor with the "door to Ballmer's office" visible
        // at the vanishing point; stage clears on segment-4 wave clear.
        segmentLabels: [
            'SEGMENT 1 / FAX TURRETS',
            'SEGMENT 2 / SUITS',
            'SEGMENT 3 / SECURITY',
            "SEGMENT 4 / CEO'S DOOR",
        ],
        sfxKeys: BALLMER_SFX_KEYS,
        ambientKey: 'fluorescent',
        gruntBulletAnimKey: 'floppy',
        // R280: ending mode — final segment ends in stage_clear instead of
        // a boss fight. The FpsArena reads this flag and routes the clear
        // accordingly.
        endingStyle: 'door',
        // R281: chain into the Ballmer arena (stage 7) on stage_clear.
        nextStage: 7,
    };
}

// R280: Ballmer boss arena — picks up right after the office approach.
// Single boss segment, no corridor waves; player lands and immediately
// fights Ballmer + 3 shield drones.
function makeFpsStageBallmerArena() {
    return {
        fpsMode: true,
        theme: THEME.BOARDROOM,
        music: 'bossBattle',
        bgKey: 'bg_office',
        bossKind: 'BALLMER',
        bgKeys: ['bg_office', 'bg_office', 'bg_office', 'bg_office'],
        spriteKeys: BALLMER_SPRITE_KEYS,
        segmentLabels: [
            'BALLMER',
            'BALLMER',
            'BALLMER',
            'BALLMER',
        ],
        bossLabels: {
            shielded: 'BALLMER / RAGING',
            exposed:  'BALLMER / EXPOSED',
        },
        sfxKeys: BALLMER_SFX_KEYS,
        ambientKey: 'fluorescent',
        coreAttackStyle: 'chair',
        gruntBulletAnimKey: 'floppy',
        // R280: skip-to-boss mode — bypass segments 0-2, drop the player
        // straight into the core fight.
        startSegment: 3,
        // R290: boss-intro painted portrait + display name shown during
        // the bossEntry phase (matches platformer BOSS_INTRO visuals).
        bossPortraitKey:  'boss_intro_BALLMER',
        bossDisplayName:  'BALLMER',
        // R295: after Ballmer goes down, return to the main campaign at
        // stage 8 (KEYNOTE HALL). Without this the arena clear routes
        // straight to the title screen, ending the run prematurely.
        nextStage: 8,
    };
}

// R291: Gates FPS arc — parallel to Ballmer pair, follows the platformer
// Keynote Hall (stage 8) where Gates escapes. Stage 9 = corridor approach,
// stage 10 = arena boss fight.
const GATES_SPRITE_KEYS = {
    turret: 'keynote_turret',
    grunt:  'keynote_grunt',
    shield: 'keynote_drone',
    core:   'boss_gates_fps',
};
const GATES_SFX_KEYS = {
    turretFire: 'faxRing',     // overhead-projector ticks read fine
    gruntFire:  'typewriter',  // CD-rom case throw clatter
    coreFire:   'chairWhoosh', // generic boss-launch whoosh
};

function makeFpsStageGates() {
    return {
        fpsMode: true,
        theme: THEME.KEYNOTE,
        music: 'keynote',
        bgKey: 'bg_keynote_corridor',
        bossKind: 'GATES',
        bgKeys: ['bg_keynote_corridor', 'bg_keynote_corridor', 'bg_keynote_corridor', 'bg_keynote_corridor'],
        spriteKeys: GATES_SPRITE_KEYS,
        segmentLabels: [
            'SEGMENT 1 / TURRETS',
            'SEGMENT 2 / EVANGELISTS',
            'SEGMENT 3 / BSOD DRONES',
            "SEGMENT 4 / BACKSTAGE",
        ],
        sfxKeys: GATES_SFX_KEYS,
        ambientKey: 'fluorescent',
        gruntBulletAnimKey: 'floppy',
        endingStyle: 'door',
        nextStage: 10,            // R291: chains into the Gates arena (stage 10)
    };
}

function makeFpsStageGatesArena() {
    return {
        fpsMode: true,
        theme: THEME.KEYNOTE,
        music: 'bossBattle',
        bgKey: 'bg_keynote_corridor',
        bossKind: 'GATES',
        bgKeys: ['bg_keynote_corridor', 'bg_keynote_corridor', 'bg_keynote_corridor', 'bg_keynote_corridor'],
        spriteKeys: GATES_SPRITE_KEYS,
        segmentLabels: ['GATES', 'GATES', 'GATES', 'GATES'],
        bossLabels: {
            shielded: 'GATES / PROTECTED',
            exposed:  'GATES / EXPOSED',
        },
        sfxKeys: GATES_SFX_KEYS,
        ambientKey: 'fluorescent',
        coreAttackStyle: 'spread5',   // Gates fires keynote-slide spread
        gruntBulletAnimKey: 'floppy',
        startSegment: 3,
        bossPortraitKey: 'boss_intro_GATES',
        bossDisplayName: 'BILL GATES',
        // R295: after Gates goes down, return to the main campaign at
        // stage 11 (FOUNDER'S LAIR).
        nextStage: 11,
    };
}

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
    // R190: REALITY — black mirror floor of the keynote auditorium, with
    // spotlight-lavender highlights. Used by REALITY DISTORTION FIELD (Jobs).
    [THEME.REALITY]:    { solid: '#04040a', solidTop: '#0a0810', platform: '#181020', plank: '#020208', accent: '#503060', highlight: '#8060a0' },
    // R226: SEWER — rusted concrete + sickly green algae highlights, matches
    // the painted stage_sewer.png backdrop. Used by Stage 4 (THE PIPELINE).
    [THEME.SEWER]:      { solid: '#0c0e10', solidTop: '#1a1c1e', platform: '#2a2018', plank: '#080806', accent: '#3a5028', highlight: '#608048' },
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
        // Crumble tile state. Key = `${tx},${ty}`; value tracks how long the
        // player has been standing on the tile (cracking) or how long until
        // it respawns (broken). Map keeps the level data immutable.
        this._cracks = new Map();     // tx,ty -> crack progress (0..30)
        this._broken = new Map();     // tx,ty -> respawn countdown (300..0)
        this._crumbleDebris = [];     // {x, y, life} debris when a tile fully crumbles
    }

    update() {
        this.frame++;
        if (this.frame % 8 === 0) this.tileAnimTick++;
        // Decay cracks for tiles that aren't being stood on anymore. The player
        // calls `notifyStanding` each tick from `_landed`; we tag those tiles
        // here via `_crackTouched`. Anything not touched this frame heals.
        for (const [key, prog] of this._cracks) {
            if (!this._crackTouched?.has(key)) {
                const next = prog - 0.5;
                if (next <= 0) this._cracks.delete(key);
                else this._cracks.set(key, next);
            }
        }
        this._crackTouched?.clear();
        // Respawn timers
        for (const [key, t] of this._broken) {
            const next = t - 1;
            if (next <= 0) this._broken.delete(key);
            else this._broken.set(key, next);
        }
        // Debris fade
        for (let i = this._crumbleDebris.length - 1; i >= 0; i--) {
            const d = this._crumbleDebris[i];
            d.x += d.vx; d.y += d.vy; d.vy += 0.2; d.life--;
            if (d.life <= 0) this._crumbleDebris.splice(i, 1);
        }
    }

    // Called from the player land-detect to mark a crumble tile as being
    // weighted this frame. Once progress crosses 30, the tile breaks.
    notifyStanding(px, py) {
        const tx = Math.floor(px / GAME.TILE);
        const ty = Math.floor(py / GAME.TILE);
        if (ty < 0 || ty >= this.data.height || tx < 0 || tx >= this.data.width) return;
        if (this.tiles[ty][tx] !== TILE.BREAKABLE) return;
        const key = tx + ',' + ty;
        if (this._broken.has(key)) return;
        if (!this._crackTouched) this._crackTouched = new Set();
        this._crackTouched.add(key);
        const prog = (this._cracks.get(key) || 0) + 1;
        if (prog >= 30) {
            // Break — eject debris, mark broken with respawn timer.
            this._cracks.delete(key);
            this._broken.set(key, 300);
            const cx = tx * GAME.TILE + GAME.TILE / 2;
            const cy = ty * GAME.TILE + GAME.TILE / 2;
            for (let i = 0; i < 6; i++) {
                this._crumbleDebris.push({
                    x: cx, y: cy,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: -1 - Math.random() * 1,
                    life: 30,
                });
            }
        } else {
            this._cracks.set(key, prog);
        }
    }

    isBrokenCrumble(tx, ty) {
        return this._broken.has(tx + ',' + ty);
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
        if (t === TILE.BREAKABLE) {
            const tx = Math.floor(px / GAME.TILE);
            const ty = Math.floor(py / GAME.TILE);
            return !this.isBrokenCrumble(tx, ty);
        }
        if (t === TILE.PLATFORM) {
            // One-way: solid only if we were above it last frame
            if (!allowPlatform) return false;
            const ty = Math.floor(py / GAME.TILE);
            const tileTop = ty * GAME.TILE;
            return prevY != null && prevY <= tileTop;
        }
        // R219: breakable-wall hook. game.js sets _wallSolidCheck to
        // PickupManager.isWallSolid so walls block player/enemy movement
        // until destroyed by gunfire. Optional — non-stage scenes don't
        // wire it and walls then degrade to non-solid (acceptable since
        // walls only spawn via stage data).
        if (this._wallSolidCheck && this._wallSolidCheck(px, py)) return true;
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
        // Level-bounds clamp — backdash/dash/grapple at the left edge would
        // drift the player into negative-x where camera + parallax both go
        // dark, and there's no way to walk back into the playable area.
        // Treat the outer walls as solid: snap the box flush to the edge.
        if (sign < 0 && newX < 0) {
            return { x: 0, hit: true };
        }
        if (sign > 0 && newX + box.w > this.width) {
            return { x: this.width - box.w, hit: true };
        }
        const probeX = sign > 0 ? newX + box.w - 1 : newX;
        // Probe at every tile row the box overlaps (same fix as moveY).
        const T = GAME.TILE;
        const ys = [];
        const topEdge = box.y;
        const botEdge = box.y + box.h - 1;
        const firstRow = Math.floor(topEdge / T);
        const lastRow = Math.floor(botEdge / T);
        ys.push(topEdge);
        for (let row = firstRow + 1; row <= lastRow; row++) {
            ys.push(row * T);
        }
        ys.push(botEdge);
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
        // Probe at every tile column the box overlaps so a narrow hitbox (e.g.
        // slide w=12, ducked) can't slip through a single-tile ledge. Old
        // 3-point sample [+1, w/2, -2] could miss when both edge probes
        // landed in the same column as the box's tile-aligned position.
        const T = GAME.TILE;
        const xs = [];
        const leftEdge = box.x + 1;
        const rightEdge = box.x + box.w - 2;
        const firstCol = Math.floor(leftEdge / T);
        const lastCol = Math.floor(rightEdge / T);
        xs.push(leftEdge);
        for (let col = firstCol + 1; col <= lastCol; col++) {
            xs.push(col * T);
        }
        xs.push(rightEdge);
        for (const px of xs) {
            const t = this.tileAt(px, probeY);
            const tileTop = Math.floor(probeY / GAME.TILE) * GAME.TILE;
            const prevBottom = box.y + box.h;
            const isPlatformLanding = (t === TILE.PLATFORM) && sign > 0 && allowPlatform &&
                (prevBottom <= tileTop + 4);
            const tx = Math.floor(px / GAME.TILE);
            const ty2 = Math.floor(probeY / GAME.TILE);
            const isCrumbleSolid = (t === TILE.BREAKABLE) && !this.isBrokenCrumble(tx, ty2);
            // R296: breakable walls (BreakableWall entities, not tile-grid)
            // were invisible to moveY. Pre-fix, vertical knockback could
            // tunnel the player INTO a wall's footprint — they'd land on
            // the tile floor BELOW the wall but be visually "stuck under"
            // it because moveX still blocked horizontal escape. Now moveY
            // honors the same wall-solid check moveX/isSolid use.
            const isBreakableWall = !!(this._wallSolidCheck && this._wallSolidCheck(px, probeY));
            if (t === TILE.SOLID || isPlatformLanding || isCrumbleSolid || isBreakableWall) {
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
        // Crumble-tile debris — falling chunks ejected when a tile breaks.
        if (this._crumbleDebris.length) {
            ctx.fillStyle = '#5a3826';
            for (const d of this._crumbleDebris) {
                const dx = Math.round(d.x - camera.viewX);
                const dy = Math.round(d.y - camera.viewY);
                ctx.globalAlpha = Math.min(1, d.life / 20);
                ctx.fillRect(dx, dy, 2, 2);
            }
            ctx.globalAlpha = 1;
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
                // r108: prefer painted ladder sprite when loaded. Falls back
                // to the procedural fillRect rails+rung when the asset is
                // missing so the game stays playable in any boot state.
                if (sprites.has('tile_ladder')) {
                    sprites.draw(ctx, 'tile_ladder', x, y, false, T / 16);
                } else {
                    ctx.fillStyle = pal.accent;
                    ctx.fillRect(x + 1, y, 2, T);
                    ctx.fillRect(x + T - 3, y, 2, T);
                    ctx.fillRect(x + 1, y + 4 + (this.tileAnimTick % 8), T - 2, 1);
                }
                break;
            case TILE.SPIKE:
                // r108: prefer painted spike sprite when loaded.
                if (sprites.has('tile_spike')) {
                    sprites.draw(ctx, 'tile_spike', x, y, false, T / 16);
                } else {
                    ctx.fillStyle = '#404040';
                    for (let i = 0; i < 4; i++) {
                        ctx.fillRect(x + i * 4, y + T - 6, 3, 6);
                        ctx.fillStyle = '#8a8a90';
                        ctx.fillRect(x + i * 4 + 1, y + T - 5, 1, 5);
                        ctx.fillStyle = '#404040';
                    }
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
                    // Slow-traveling specular stripe — a brighter glint that
                    // crawls along the surface at ~1px every other frame. Long
                    // wavelength so it reads as a single moving reflection
                    // instead of static dotted shimmer.
                    const SPEC_WAVE = 40;
                    const specPhase = (this.tileAnimTick >> 1) % SPEC_WAVE;
                    const colWorldX = c * T;
                    const localPhase = ((colWorldX + x) - specPhase) % SPEC_WAVE;
                    for (let i = 0; i < T; i++) {
                        const p = (localPhase + i + SPEC_WAVE) % SPEC_WAVE;
                        if (p < 3) {
                            ctx.fillStyle = p === 1 ? '#d8fff0' : '#a0f0c8';
                            ctx.fillRect(x + i, y, 1, 1);
                        }
                    }
                }
                break;
            }
            case TILE.BREAKABLE: {
                // Crumble tile — drawn like a SOLID but with rivet corners and
                // crack overlay scaling with crackProg. Broken tiles show a faint
                // outline so the player can read where it'll respawn.
                const key = c + ',' + r;
                const isBroken = this._broken.has(key);
                if (isBroken) {
                    // Ghost outline + respawn countdown ring
                    const respawn = this._broken.get(key) || 0;
                    ctx.strokeStyle = '#ffa040';
                    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.frame * 0.15);
                    ctx.setLineDash([2, 2]);
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                    break;
                }
                // Solid block — slightly warmer/brick-toned so it reads as DIFFERENT
                // from regular SOLID.
                ctx.fillStyle = '#5a3826';
                ctx.fillRect(x, y, T, T);
                ctx.fillStyle = '#7a5036';
                ctx.fillRect(x + 1, y + 1, T - 2, 2);
                ctx.fillStyle = '#3a2014';
                ctx.fillRect(x + 1, y + T - 3, T - 2, 2);
                // Rivets
                ctx.fillStyle = '#2a1408';
                ctx.fillRect(x + 2, y + 2, 1, 1);
                ctx.fillRect(x + T - 3, y + 2, 1, 1);
                ctx.fillRect(x + 2, y + T - 3, 1, 1);
                ctx.fillRect(x + T - 3, y + T - 3, 1, 1);
                // Crack overlay
                const prog = this._cracks.get(key) || 0;
                if (prog > 0) {
                    const stage = prog / 30; // 0..1
                    ctx.strokeStyle = '#1a0808';
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.5 + 0.5 * stage;
                    // First crack appears immediately, secondary at 0.5+
                    ctx.beginPath();
                    ctx.moveTo(x + 2, y + 4);
                    ctx.lineTo(x + T / 2, y + T / 2);
                    ctx.lineTo(x + T - 3, y + T - 4);
                    if (stage > 0.5) {
                        ctx.moveTo(x + T - 4, y + 3);
                        ctx.lineTo(x + T / 2 + 1, y + T / 2 + 1);
                        ctx.lineTo(x + 3, y + T - 3);
                    }
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                    // Late-stage shake — subtle 1px wobble on the rivets to
                    // sell the imminent collapse.
                    if (stage > 0.7 && this.frame % 4 === 0) {
                        ctx.fillStyle = '#ff8040';
                        ctx.fillRect(x + T / 2 - 1, y + T / 2 - 1, 2, 2);
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
                    // r111: prefer painted tile_door sprite — falls back to
                    // procedural wooden-door render when the asset is missing.
                    if (sprites.has('tile_door')) {
                        // Door is 32px tall in source; draw it rising above the
                        // tile so the silhouette reads as a full doorway.
                        sprites.draw(ctx, 'tile_door', x - 1, y - 28, false);
                    } else {
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
                    }
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

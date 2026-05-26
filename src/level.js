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
    // R396: muted tuft palette so the grass blends with the painted
    // mossy jungle bgs instead of popping as bright neon green bars
    // (user screenshot showed them as stiff lime stripes against the
    // dark painted scene). Dropped saturation across BG/FG/TIP by
    // ~30% — still readable as grass but no longer screams "vector".
    const BLADE_COLORS_BG = ['#1a2a10', '#243818', '#16280e', '#1e3014'];
    const BLADE_COLORS_FG = ['#365820', '#2e4820', '#406820', '#2e4416'];
    const TIP_COLORS = ['#7a983c', '#688830', '#90a850'];
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
    // R311 sprites in flight — once registered in sprites.js these will
    // override the procedural fallback in _drawTile.
    [THEME.SEWER]:      'ground_sewer',
    [THEME.REALITY]:    'ground_reality',
};

// R311: per-theme painted platform tile. Looked up the same way as ground
// bitmaps. If the asset is missing in sprites.images, falls back to the
// procedural _drawPlatformAccent body. Top row is the bevel cap.
const PLATFORM_BITMAP_KEY = {
    [THEME.JUNGLE]:     'plat_jungle',
    [THEME.SEWER]:      'plat_sewer',
    [THEME.FOUNDER]:    'plat_founder',
    [THEME.KEYNOTE]:    'plat_keynote',
    // R320: filled the rest of the themes. Procedural _drawPlatformAccent
    // now only fires if a sprite fails to load (defensive fallback).
    [THEME.BREAKROOM]:  'plat_breakroom',
    [THEME.SERVERROOM]: 'plat_serverroom',
    [THEME.BOARDROOM]:  'plat_boardroom',
    [THEME.CLOUD]:      'plat_cloud',
    [THEME.REALITY]:    'plat_reality',
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
            // R325: dive_bomber introduces the new behavior on stage 1 —
            // glides above the bridge approach, commits to a 45° dive when
            // the player walks underneath. Teaches the player to watch the sky.
            { x: 78 * GAME.TILE, y: ( 3) * GAME.TILE, type: 'dive_bomber' },
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
        // R387+R415: jungle atmosphere — drifting fog at horizon, fires,
        // distant bird silhouettes flying overhead, faint smoke columns
        // from far campfires deep in the ruins.
        ambientProps: [
            { kind: 'fire', x: 18 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fire', x: 56 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fire', x: 82 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fogBank', x: 0, y: 60, speed: 0.10, alpha: 0.12, color: '#2a3828' },
            { kind: 'embers', x: 24 * GAME.TILE, y: (h - 5) * GAME.TILE, wind: 0.25, spread: 60, period: 12 },
            // R415: distant birds — vultures circling over the ruins
            { kind: 'distantBird', x: 0, y: 30, speed: 0.4, dir: 'right', color: '#080808' },
            { kind: 'distantBird', x: 0, y: 45, speed: 0.5, dir: 'left',  color: '#080808' },
            // R415: distant smoke columns from far campfires deep in
            // the ruins. Anchored to specific world points.
            { kind: 'smokeColumn', x: 36 * GAME.TILE, y: (h - 6) * GAME.TILE, wind: 0.15, color: '#1a2018' },
            { kind: 'smokeColumn', x: 68 * GAME.TILE, y: (h - 6) * GAME.TILE, wind: 0.20, color: '#1a2018' },
            { kind: 'embers', x: 60 * GAME.TILE, y: (h - 5) * GAME.TILE, wind: 0.30, spread: 70, period: 10 },
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
        // R332: break-room atmosphere — flickering fluorescent tubes
        // (matches the painted bg's broken-ceiling-fixtures aesthetic).
        // One dying Clippy slumped against the vending area sells
        // "everyone here was already shredded."
        ambientProps: [
            { kind: 'flicker', x: 24 * GAME.TILE, y: ( 2) * GAME.TILE },
            { kind: 'flicker', x: 52 * GAME.TILE, y: ( 2) * GAME.TILE },
            { kind: 'flicker', x: 76 * GAME.TILE, y: ( 2) * GAME.TILE },
            { kind: 'dyingClippy', x: 38 * GAME.TILE, y: (h - 3) * GAME.TILE, state: 'dead' },
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
            // R325: shielder mid-corridor — slow approach, blocks bullets
            // from the front. Player has to flank or wait for shield drop.
            { x: 36 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'shielder' },
            // R325: dive_bomber above the cable maze.
            { x: 70 * GAME.TILE, y: ( 2) * GAME.TILE, type: 'dive_bomber' },
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
        // R332: server-room atmosphere. Sparking severed cables hang from
        // the ceiling; one fluorescent tube flickers; a dead Clippy lies
        // by the cable maze — selling "the data center is failing."
        ambientProps: [
            { kind: 'sparkCable', x: 20 * GAME.TILE, y: ( 4) * GAME.TILE },
            { kind: 'sparkCable', x: 50 * GAME.TILE, y: ( 4) * GAME.TILE },
            { kind: 'sparkCable', x: 84 * GAME.TILE, y: ( 3) * GAME.TILE },
            { kind: 'flicker',    x: 32 * GAME.TILE, y: ( 2) * GAME.TILE },
            { kind: 'flicker',    x: 76 * GAME.TILE, y: ( 2) * GAME.TILE },
            { kind: 'dyingClippy', x: 64 * GAME.TILE, y: (h - 3) * GAME.TILE, state: 'dead' },
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
            // R325: shielder at the boardroom — boardroom = executive
            // protection. Player has to flank around the conference table.
            { x: 44 * GAME.TILE, y: ( 9) * GAME.TILE, type: 'shielder' },
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
        // R387: boardroom atmosphere — chandelier light flickers + thin
        // smoke from snuffed candles drifting near ceiling.
        ambientProps: [
            { kind: 'flicker', x: 22 * GAME.TILE, y: 2 * GAME.TILE },
            { kind: 'flicker', x: 50 * GAME.TILE, y: 2 * GAME.TILE },
            { kind: 'flicker', x: 78 * GAME.TILE, y: 2 * GAME.TILE },
            { kind: 'fogBank', x: 0, y: 40, speed: 0.08, alpha: 0.12, color: '#1a1418' },
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
        // R387: keynote hall — stage-light flickers in the rafters +
        // smoke-machine haze rolling across the audience floor.
        ambientProps: [
            { kind: 'flicker', x: 24 * GAME.TILE, y: 2 * GAME.TILE },
            { kind: 'flicker', x: 50 * GAME.TILE, y: 2 * GAME.TILE },
            { kind: 'flicker', x: 76 * GAME.TILE, y: 2 * GAME.TILE },
            { kind: 'fogBank', x: 0, y: 80, speed: 0.18, alpha: 0.18, color: '#2a1838' },
            { kind: 'fogBank', x: 0, y: 130, speed: 0.12, alpha: 0.14, color: '#1c1024' },
            { kind: 'sparkCable', x: 56 * GAME.TILE, y: 3 * GAME.TILE },
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
            // R325: summoner in the Founder's Lair — thematically the
            // Founder/Algorithm is the source of all Clippies. A Clippy-
            // doppelganger spawning folder grunts fits the mythos perfectly.
            { x: 52 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'summoner' },
            // R325: dive_bomber over the wider pit — pressure on top of
            // the existing folder/sniper combo.
            { x: 64 * GAME.TILE, y: ( 2) * GAME.TILE, type: 'dive_bomber' },
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
        // R332: ambient storytelling props — burning Founder's compound.
        // Dying Clippy NPCs throughout the lair sell "you're walking
        // through the aftermath of a massacre." Fires + sparking cables
        // add motion to the static painted lava bg.
        ambientProps: [
            { kind: 'dyingClippy', x: 18 * GAME.TILE, y: (h - 3) * GAME.TILE, state: 'stagger' },
            { kind: 'dyingClippy', x: 40 * GAME.TILE, y: (h - 3) * GAME.TILE, state: 'dead' },
            { kind: 'dyingClippy', x: 70 * GAME.TILE, y: (h - 3) * GAME.TILE, state: 'stagger', t: 30 },
            { kind: 'fire', x: 26 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fire', x: 58 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fire', x: 86 * GAME.TILE, y: (h - 3) * GAME.TILE },
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
            // R325: final-stage gauntlet — a summoner mid-stage + 2 dive_
            // bombers in the data storm. By stage 13 the player knows the
            // new behaviors, so use them all together.
            { x: 50 * GAME.TILE, y: ( 6) * GAME.TILE, type: 'summoner' },
            { x: 72 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'dive_bomber' },
            { x: 88 * GAME.TILE, y: ( 1) * GAME.TILE, type: 'dive_bomber' },
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
        // R387+R415: cloud-storm atmosphere — fog + sparks + flickers +
        // DATA RAIN streaks falling across the whole screen + distant
        // bird silhouettes flying through the void.
        ambientProps: [
            { kind: 'fogBank', x: 0, y: 40, speed: 0.20, alpha: 0.18, color: '#2c1a3a' },
            { kind: 'fogBank', x: 0, y: 80, speed: 0.14, alpha: 0.14, color: '#1e1228' },
            { kind: 'sparkCable', x: 56 * GAME.TILE, y: 3 * GAME.TILE },
            { kind: 'sparkCable', x: 76 * GAME.TILE, y: 3 * GAME.TILE },
            { kind: 'flicker', x: 40 * GAME.TILE, y: 1 * GAME.TILE },
            { kind: 'flicker', x: 80 * GAME.TILE, y: 1 * GAME.TILE },
            // R415: green data-rain streaks falling diagonally (Matrix vibe)
            { kind: 'rain', x: 0, y: 0, count: 50, wind: -0.6, color: '#60ff80', alpha: 0.35 },
            // R415: distant data-drone birds gliding across the void
            { kind: 'distantBird', x: 0, y: 50, speed: 0.5, dir: 'right', color: '#181c30' },
            { kind: 'distantBird', x: 0, y: 70, speed: 0.7, dir: 'left',  color: '#181c30' },
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
        ],
        // R387: server-room secret stage — sparking severed cables +
        // flickering tubes throughout, sells "deep down in the trash heap".
        ambientProps: [
            { kind: 'sparkCable', x: 12 * GAME.TILE, y: 3 * GAME.TILE },
            { kind: 'sparkCable', x: 26 * GAME.TILE, y: 3 * GAME.TILE },
            { kind: 'sparkCable', x: 42 * GAME.TILE, y: 3 * GAME.TILE },
            { kind: 'flicker', x: 18 * GAME.TILE, y: 1 * GAME.TILE },
            { kind: 'flicker', x: 34 * GAME.TILE, y: 1 * GAME.TILE },
            { kind: 'flicker', x: 50 * GAME.TILE, y: 1 * GAME.TILE },
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

// Boss Rush Mode — stage 16 (was 11 pre-R291). Unlocks after first
// 'clear_game' achievement. Wider arena than stage 12's GAUNTLET, with
// the full unique-boss queue back-to-back. No grunts, no pickups
// between, no stage cards. Three LIFE pickups + a HOMING crate as the
// only sustain. Best clear time persisted in stats.bestBossRushTime.
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
        ],
        // R387: reality distortion — strobe lightning + neon flickers +
        // stage haze. Sells "Steve Jobs keynote nightmare" energy.
        ambientProps: [
            { kind: 'lightning', x: 0, y: 0 },
            { kind: 'fogBank', x: 0, y: 50, speed: 0.22, alpha: 0.18, color: '#2c1a45' },
            { kind: 'fogBank', x: 0, y: 90, speed: 0.16, alpha: 0.14, color: '#1a1230' },
            { kind: 'flicker', x: 16 * GAME.TILE, y: 1 * GAME.TILE },
            { kind: 'flicker', x: 28 * GAME.TILE, y: 1 * GAME.TILE },
            { kind: 'flicker', x: 40 * GAME.TILE, y: 1 * GAME.TILE },
            { kind: 'sparkCable', x: 20 * GAME.TILE, y: 3 * GAME.TILE },
            { kind: 'sparkCable', x: 36 * GAME.TILE, y: 3 * GAME.TILE },
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
        // R384: pipeline/sewer atmosphere — water drips from the overhead
        // pipes throughout the level, lab section has the occasional spark
        // from damaged cables. Drips spaced under each upper pipe.
        ambientProps: [
            { kind: 'drip', x: 13 * GAME.TILE, y: 3 * GAME.TILE, fallH: 80 },
            { kind: 'drip', x: 22 * GAME.TILE, y: 2 * GAME.TILE, fallH: 100 },
            { kind: 'drip', x: 34 * GAME.TILE, y: 2 * GAME.TILE, fallH: 90 },
            { kind: 'drip', x: 58 * GAME.TILE, y: 3 * GAME.TILE, fallH: 90 },
            { kind: 'drip', x: 78 * GAME.TILE, y: 2 * GAME.TILE, fallH: 100 },
            // Sparking cables in the lab section
            { kind: 'sparkCable', x: 60 * GAME.TILE, y: 3 * GAME.TILE },
            { kind: 'sparkCable', x: 84 * GAME.TILE, y: 3 * GAME.TILE },
            { kind: 'flicker',    x: 70 * GAME.TILE, y: 2 * GAME.TILE },
        ],
        // R423c: route stage 4 → stage 23 (Doom Pipeline Block 11) instead of
        // the default 4→5. Pipeline Block 11 then chains to stage 5 Boardroom.
        nextStage: 23,
    };
}

// R423: Doom-style stage maker. Returns minimal data — doomMode flag flips
// the engine, doomMap is the 2D tile grid, doomStart sets spawn position.

// R423c: stage 23 PIPELINE: BLOCK 11 — sewer-themed Doom maze between
// stages 4 and 5. Inspired by Doom 1 E1M1 layout: zigzag opening, two
// branching paths (north clone tanks vs south lab), keycard-gated exit
// to boss arena. Evil Clippy clones in corridors + SPINDLER_UZIS boss.
//
// Tile legend (matches WALL_LIGHT in doom_engine.js):
//   1 = cubicle / pipe bracket wall
//   2 = exec wood (lab door frame)
//   3 = glass (observation panel into clone tanks)
//   4 = bathroom tile (chemical shower area)
//   5 = vending machine (lab control panel)
//  10 = plain door (opens on USE)
//  12 = red-key door, 13 = yellow-key door, 14 = blue-key door
//  20 = switch (opens all plain doors when used)
//  30 = exit pad (spawned after boss dies)
function makeDoomPipelineBlock11() {
    // R428: 32x26 expanded sewer-lab. Doom E1M1-inspired layout with irregular
    // rooms, zigzag entry, secret BFG room behind switch, irregular boss arena
    // with cover pillars. Each region has its own flavor:
    //
    //   SOUTH-WEST spawn corridor → ammo cache → split north or east
    //   NORTH-WEST: chemical showers + first clone fight + key 1 (RED)
    //   CENTER: zigzag pipe maze with patrolling clones
    //   NORTH-EAST: clone-tank observation gallery (glass walls, body horror)
    //              + shotgun pickup
    //   SOUTH-EAST: vending machine lab corridor + key 2 (BLUE) behind clones
    //   CENTER-SOUTH: switch room hidden behind plain door — flips to open
    //                 the secret armory with the SHOTGUN ammo cache
    //   EAST: boss arena gated by RED + BLUE keys, irregular shape with
    //         cover pillars Spindler can hide behind
    const M = [
        // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
        [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0
        [ 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1], // 1
        [ 1, 0, 4, 4, 0, 0, 0, 0, 1, 0, 3, 3, 0, 3, 3, 0, 1, 0, 3, 3, 0, 3, 3, 0, 1, 0, 0, 0, 0, 0, 0, 1], // 2
        [ 1, 0, 4, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1], // 3
        [ 1, 0, 4, 0, 0, 0, 0, 0, 1, 0, 3, 3, 0, 3, 3, 0, 1, 0, 3, 3, 0, 3, 3, 0, 1, 0, 1, 0, 0, 0, 0, 1], // 4   N-WEST showers + N-CENTER clone gallery
        [ 1, 0, 4, 4, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 5, 5, 0, 1], // 5
        [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,12, 0, 1, 0, 0, 0, 0, 1], // 6   RED-KEY door at x=24 (boss arena entry)
        [ 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 5, 5, 0, 1], // 7   zigzag pipes
        [ 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 8
        [ 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1], // 9
        [ 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1,14, 1, 0, 0, 0, 0, 1], // 10  BLUE-KEY door at x=25 (alt arena entry)
        [ 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 5, 5, 0, 1], // 11
        [ 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1], // 12
        [ 1, 0, 1, 0, 1, 0, 1, 1,10, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1], // 13  plain door into HUB
        [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 14  HUB main passage
        [ 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1], // 15
        [ 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1], // 16
        [ 1, 0, 1, 0,20, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1], // 17  switch room (left)
        [ 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 18  central passage
        [ 1, 0, 1, 1,10, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1], // 19  switch-locked plain door
        [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 20  south corridor
        [ 1, 0, 4, 4, 4, 0, 1, 1, 1, 1, 1, 1, 1, 0, 5, 5, 5, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1], // 21  shower S-west, vending S-center
        [ 1, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 22
        [ 1, 0, 4, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 5, 5, 5, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1], // 23
        [ 1, 0, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 24  spawn corridor east
        [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 25
    ];
    return {
        doomMode: true,
        name: 'BLOCK 11',
        theme: 'sewer',
        music: 'bossRushMode',     // R427: faster electronic track for Doom pace
        bgKey: 'bg_sewer',
        doomMap: M,
        doomStart: { x: 1.5, y: 24.5 },     // R428: spawn far south-west
        exitAt: { x: 29, y: 6 },             // boss arena, far east
        nextStage: 5,
        ambientProps: [],
        doomBoss: 'SPINDLER_UZIS',
        // R428: 30+ entities across the expanded map
        doomEntities: [
            // ---- SPAWN CORRIDOR (east-west bottom strip) ----
            { kind: 'health', x: 5.5, y: 24.5, amount: 2 },
            { kind: 'ammo', x: 8.5, y: 24.5, weapon: 'mg', amount: 30 },
            { kind: 'clone', x: 10.5, y: 22.5 },
            { kind: 'ammo', x: 16.5, y: 24.5, weapon: 'mg', amount: 20 },
            { kind: 'clone', x: 19.5, y: 22.5 },
            // ---- SOUTH-WEST CHEMICAL SHOWERS (rows 21-24, cols 2-4) ----
            { kind: 'health', x: 3.5, y: 22.5, amount: 4 },
            { kind: 'clone', x: 3.5, y: 23.5 },
            // ---- SOUTH-CENTER VENDING LAB (rows 21-23, cols 14-16) ----
            { kind: 'clone', x: 15.5, y: 22.5 },
            { kind: 'ammo', x: 15.5, y: 22.5, weapon: 'shotgun', amount: 12 },
            // ---- SOUTH CORRIDOR going north (col 18-29, row 20) ----
            { kind: 'clone', x: 24.5, y: 20.5 },
            { kind: 'health', x: 28.5, y: 20.5, amount: 2 },
            // ---- SWITCH ROOM (col 4, row 17) — flips plain doors ----
            // Reached via plain door at col 4, row 19. Switch tile at (4,17).
            { kind: 'ammo', x: 4.5, y: 16.5, weapon: 'shotgun', amount: 24 },
            // ---- CENTRAL HUB (row 14, central corridor through zigzag) ----
            { kind: 'clone', x: 11.5, y: 14.5 },
            { kind: 'clone', x: 17.5, y: 14.5 },
            { kind: 'health', x: 21.5, y: 14.5, amount: 4 },
            // ---- CENTRAL ZIGZAG PIPE MAZE (rows 7-13) — patrolling clones ----
            { kind: 'clone', x: 8.5, y: 12.5 },
            { kind: 'clone', x: 12.5, y: 8.5 },
            { kind: 'clone', x: 18.5, y: 10.5 },
            { kind: 'clone', x: 22.5, y: 12.5 },
            { kind: 'ammo', x: 14.5, y: 8.5, weapon: 'mg', amount: 30 },
            // ---- NORTH-WEST CLONE-TANK GALLERY (rows 2-4, cols 9-15) ----
            // 4 glass tanks visible; clones spawn in front. RED KEY in here.
            { kind: 'key', color: 'red', x: 12.5, y: 3.5 },
            { kind: 'clone', x: 9.5, y: 3.5 },
            { kind: 'clone', x: 15.5, y: 3.5 },
            { kind: 'health', x: 14.5, y: 3.5, amount: 4 },
            // ---- NORTH-CENTER CLONE-TANK GALLERY (rows 2-4, cols 17-23) ----
            // SHOTGUN pickup hidden in the upper gallery
            { kind: 'weapon', x: 20.5, y: 3.5, weapon: 'shotgun' },
            { kind: 'clone', x: 18.5, y: 3.5 },
            { kind: 'clone', x: 22.5, y: 3.5 },
            // ---- NORTH-EAST CORRIDOR (cols 26-30) ----
            // BLUE KEY in this section
            { kind: 'key', color: 'blue', x: 28.5, y: 4.5 },
            { kind: 'clone', x: 28.5, y: 3.5 },
            { kind: 'ammo', x: 28.5, y: 1.5, weapon: 'shotgun', amount: 12 },
            // ---- BOSS ARENA (east, rows 5-13, col 24-30) — gated by RED+BLUE ----
            { kind: 'health', x: 26.5, y: 8.5, amount: 4 },
            { kind: 'ammo', x: 27.5, y: 12.5, weapon: 'shotgun', amount: 24 },
            // R451: exploding barrels — tactical cover + damage tool
            { kind: 'barrel', x: 26.5, y: 6.5 },
            { kind: 'barrel', x: 29.5, y: 6.5 },
            { kind: 'barrel', x: 26.5, y: 11.5 },
            { kind: 'barrel', x: 29.5, y: 11.5 },
            { kind: 'boss', x: 28.5, y: 8.5 },
        ],
    };
}

// R423d: stage 16 FLOOR 11 — post-game Doom-style Microsoft HQ crawl.
// Larger + more complex than BLOCK 11. Inspired by Doom E1M5/E1M8 — three
// colored keycards required, branching through cubicles → bathroom →
// exec wing → server room → final boss arena in glass chamber.
//
// Boss: SPINDLER_WHEELCHAIR (mounted miniguns). Surprise return —
// player thinks they killed him in BLOCK 11, now he's worse.
function makeDoomFloor11() {
    // R429: 40x32 — full Doom climax. The post-game Microsoft HQ executive
    // floor crawl. Spawn south (lobby) → cubicle maze → exec wing (yellow key)
    // → server hub → bathroom secret (BFG) → north corridor → boss chamber.
    //
    // ALL THREE keycards required:
    //   YELLOW: in west exec offices
    //   RED:    in NE bathroom block (behind a switch puzzle)
    //   BLUE:   in east server hub
    //   Boss door at north center: needs RED + BLUE together; YELLOW gates
    //   entry to the upper exec wing where you find the others.
    const M = [
        // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39
        [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0
        [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 1  BOSS CHAMBER
        [ 1, 0, 3, 0, 0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0, 0, 3, 0, 1], // 2
        [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 3
        [ 1, 0, 3, 0, 0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0, 0, 3, 0, 1], // 4
        [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,12,14, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 5  R430: RED door (col 19) + BLUE door (col 20) — player MUST have both to pass through to boss
        [ 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 6  upper hallway
        [ 1, 0, 3, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1], // 7
        [ 1, 0, 3, 0, 0, 0, 0, 1, 0, 1, 0, 0, 5, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 8  exec wing (left) + server hub (mid) + east bathroom strip
        [ 1, 0, 0, 0, 0, 0, 0,10, 0, 0, 0, 0, 5, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,14, 5, 0, 0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9  exec door (10) + BLUE door (14) into server hub
        [ 1, 0, 3, 0, 0, 0, 0, 1, 0, 1, 0, 0, 5, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 5, 5, 5, 5, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1], // 10
        [ 1, 0, 3, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1], // 11
        [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 4, 4, 0, 1, 0, 0, 1], // 12  central passage + NE bathroom block + 4 = red key area
        [ 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0,20, 0, 1, 0,13, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 4, 0, 0, 0, 0, 0, 1], // 13  switch room + YELLOW DOOR (13) gates upper exec
        [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 4, 0, 0, 0, 0, 0, 1], // 14
        [ 1, 0, 0, 0, 0, 1, 0, 4, 4, 4, 4, 0, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 4, 4, 0, 0, 0, 0, 1], // 15  west bathroom (BFG secret) + central bathroom strip + east bathroom continued
        [ 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 4, 0, 1, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 16
        [ 1, 0, 1, 1, 0, 1, 0, 4, 0, 0, 4, 0, 1, 0, 4, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1], // 17
        [ 1, 0, 1, 0, 0, 0, 0, 4, 4, 4, 4, 0, 1, 0, 4, 4, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], // 18
        [ 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1], // 19  CUBICLE FARM begins
        [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 20
        [ 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1], // 21
        [ 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1], // 22
        [ 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1], // 23
        [ 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], // 24
        [ 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1], // 25
        [ 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1], // 26
        [ 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1], // 27
        [ 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1], // 28
        [ 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1], // 29
        [ 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 30  LOBBY (spawn area)
        [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 31
    ];
    return {
        doomMode: true,
        name: 'FLOOR 11',
        theme: 'serverroom',
        music: 'apocalypse',          // R427: heavy cinematic track for finale
        bgKey: 'bg_serverroom',
        doomMap: M,
        doomStart: { x: 20.5, y: 30.5 },        // R429: spawn center-south LOBBY
        exitAt: { x: 20, y: 1 },                 // boss chamber exit pad
        ambientProps: [],
        doomBoss: 'SPINDLER_WHEELCHAIR',
        // R429: ~40 entities across the floor
        doomEntities: [
            // ---- LOBBY SPAWN ROW (row 30) ----
            { kind: 'health', x: 21.5, y: 30.5, amount: 2 },
            { kind: 'ammo', x: 18.5, y: 30.5, weapon: 'mg', amount: 30 },
            { kind: 'ammo', x: 24.5, y: 30.5, weapon: 'mg', amount: 20 },
            { kind: 'clone', x: 12.5, y: 29.5 },
            { kind: 'clone', x: 28.5, y: 29.5 },
            // ---- CUBICLE FARM (rows 21-28) — full of patrolling clones ----
            { kind: 'clone', x: 7.5, y: 28.5 },
            { kind: 'clone', x: 11.5, y: 26.5 },
            { kind: 'clone', x: 17.5, y: 24.5 },
            { kind: 'clone', x: 24.5, y: 26.5 },
            { kind: 'clone', x: 30.5, y: 22.5 },
            { kind: 'clone', x: 4.5, y: 24.5 },
            { kind: 'health', x: 35.5, y: 28.5, amount: 4 },
            { kind: 'ammo', x: 8.5, y: 22.5, weapon: 'mg', amount: 30 },
            { kind: 'ammo', x: 27.5, y: 24.5, weapon: 'shotgun', amount: 12 },
            // ---- WEST BATHROOM SECRET (rows 15-18, cols 7-10) — BFG behind switch ----
            // Switch at (18,13). Player needs to find west bathroom + flip
            // switch to open the central bathroom's locked door (10 tile at 19,13).
            { kind: 'weapon', x: 8.5, y: 17.5, weapon: 'bfg' },           // SECRET BFG
            { kind: 'health', x: 8.5, y: 15.5, amount: 4 },
            { kind: 'clone', x: 8.5, y: 16.5 },
            // ---- CENTRAL BATHROOM (rows 15-18, cols 14-15) ----
            { kind: 'clone', x: 14.5, y: 17.5 },
            { kind: 'ammo', x: 14.5, y: 16.5, weapon: 'shotgun', amount: 12 },
            // ---- EAST BATHROOM (rows 12-15, cols 33-35) — RED KEY ----
            { kind: 'key', color: 'red', x: 34.5, y: 14.5 },
            { kind: 'clone', x: 34.5, y: 13.5 },
            { kind: 'clone', x: 34.5, y: 15.5 },
            { kind: 'health', x: 34.5, y: 16.5, amount: 4 },
            // ---- CENTRAL HALLWAY (row 12, 14) — passage between bathrooms + hub ----
            { kind: 'clone', x: 18.5, y: 14.5 },
            { kind: 'clone', x: 22.5, y: 14.5 },
            // ---- EXEC WING (rows 8-11, cols 2-6) — YELLOW KEY ----
            // Yellow door at (22,13) gates this wing. Player needs yellow first
            // (found in lower exec at... wait — yellow key is also in this area)
            // Reorganize: YELLOW key in upper west exec offices.
            { kind: 'key', color: 'yellow', x: 3.5, y: 9.5 },              // YELLOW KEY
            { kind: 'clone', x: 4.5, y: 9.5 },
            { kind: 'weapon', x: 4.5, y: 11.5, weapon: 'shotgun' },        // shotgun pickup
            { kind: 'ammo', x: 2.5, y: 8.5, weapon: 'shotgun', amount: 24 },
            // ---- SERVER HUB (rows 7-10, cols 9-29) ----
            { kind: 'clone', x: 10.5, y: 8.5 },
            { kind: 'clone', x: 17.5, y: 9.5 },
            { kind: 'clone', x: 20.5, y: 8.5 },
            { kind: 'clone', x: 26.5, y: 10.5 },
            // BLUE KEY — east server hub
            { kind: 'key', color: 'blue', x: 27.5, y: 9.5 },               // BLUE KEY
            { kind: 'health', x: 19.5, y: 9.5, amount: 4 },
            { kind: 'ammo', x: 16.5, y: 7.5, weapon: 'shotgun', amount: 12 },
            // ---- UPPER HALLWAY (row 6) leading to boss door ----
            { kind: 'clone', x: 11.5, y: 6.5 },
            { kind: 'clone', x: 25.5, y: 6.5 },
            { kind: 'health', x: 6.5, y: 6.5, amount: 4 },
            // ---- BOSS CHAMBER (rows 1-4, full width) ----
            // Glass walls (cols 2, 6, 8, 31, 33, 37). Vending columns mid (5s).
            // Wide arena with cover pillars (cols 10, 14 server tiles).
            { kind: 'boss', x: 20.5, y: 2.5 },
            { kind: 'ammo', x: 38.5, y: 1.5, weapon: 'shotgun', amount: 24 },
            { kind: 'ammo', x: 1.5, y: 1.5, weapon: 'shotgun', amount: 24 },
            { kind: 'health', x: 20.5, y: 4.5, amount: 4 },
            // R451: exploding barrels arranged around boss arena
            { kind: 'barrel', x: 12.5, y: 1.5 },
            { kind: 'barrel', x: 17.5, y: 3.5 },
            { kind: 'barrel', x: 23.5, y: 3.5 },
            { kind: 'barrel', x: 28.5, y: 1.5 },
            { kind: 'barrel', x: 10.5, y: 3.5 },
            { kind: 'barrel', x: 30.5, y: 3.5 },
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
    () => makeBeatEmUpBallmer(),       // R337: stage 7 BALLMER ARENA — beat-em-up in boardroom (was FPS)
    () => makeStage5(),                // R281: stage 8 KEYNOTE HALL (Gates escapes)
    () => makeFpsStageGates(),         // R291: stage 9 KEYNOTE FPS approach
    () => makeStageGatesArena(),       // R338: stage 10 GATES ARENA — side-scrolling platformer (was FPS)
    () => makeStage6(),                // R291: stage 11 FOUNDER'S LAIR (was 9)
    () => makeStage7(),                // R291: stage 12 BOSS RUSH (was 10)
    () => makeStage8(),                // R291: stage 13 THE CLOUD (was 11)
    () => makeStage9(),                // R291: stage 14 secret RECYCLE BIN (was 12)
    () => makeTraining(),              // R291: stage 15 TRAINING GROUND (was 13)
    () => makeDoomFloor11(),           // R423d: stage 16 was BOSS RUSH MODE — now FLOOR 11 Doom-mode (boss rush graduates to title-menu unlocked mode)
    () => makeTimeTrial(),             // R291: stage 17 TIME TRIAL (was 15)
    () => makeStage13(),               // R291: stage 18 REALITY DISTORTION FIELD (was 16)
    () => makeFpsStage(),                    // R291: stage 19 CORE BREACH (was 17)
    () => makeBeatEmUpMechaApproach(),       // R306: stage 20 MECHA APPROACH (beat-em-up)
    () => makeStageMechaHelicopter(),        // R334: stage 21 MECHA CORRIDOR — side-scrolling helicopter chase (was FPS)
    () => makeBeatEmUpMechaGates(),          // R335: stage 22 MECHA-GATES — beat-em-up final (was FPS)
    () => makeDoomPipelineBlock11(),         // R423c: stage 23 PIPELINE: BLOCK 11 — Doom-style sewer crawl between stages 4 and 5
    () => makeBossRushMode(),                // R426: stage 24 BOSS RUSH MODE — relocated from old slot 16; launched only from title-screen MAIN_MENU
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
        music: 'dreamsFade',    // R303: dedicated Core Breach track (was sharing 'pipeline')
        bgKey: 'bg_sewer_lab',
        bossKind: 'SPINDLER',
        // R293: full polish for the long-neglected FPS Spindler bonus stage.
        // 4-segment progression matches the Ballmer + Gates pairs.
        bgKeys: ['bg_sewer', 'bg_sewer', 'bg_sewer_lab', 'bg_sewer_lab'],
        // R299: use the actual Spindler sprite as the core boss — the
        // default lab_core was the generic biotech-reactor cyclops-eye
        // which had nothing to do with Dr. Spindler the character.
        // Keep lab_turret/grunt/shield for the corridor wave segments;
        // only override the core slot.
        spriteKeys: {
            turret: 'lab_turret',
            grunt:  'lab_grunt',
            shield: 'lab_shield',
            core:   'boss_SPINDLER',
        },
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
        // R299: post-game side stage — return to title on clear.
        // (handled by _tickStageClear's stage >= 15 branch from R299)
        // R395: ambient sparks + flickers for the sewer-lab FPS rail.
        // World coords in FPS mode are screen-space (fakeCam: viewX=0).
        // Place flickers near top of screen + sparking cables on the
        // edges so they don't fight the central wireframe lane.
        ambientProps: [
            { kind: 'flicker', x: 32,  y: 24 },
            { kind: 'flicker', x: 224, y: 24 },
            { kind: 'sparkCable', x: 16, y: 50 },
            { kind: 'sparkCable', x: 240, y: 50 },
            { kind: 'drip', x: 80,  y: 16, fallH: 60 },
            { kind: 'drip', x: 176, y: 16, fallH: 70 },
        ],
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
        music: 'backstage',     // R302: FPS chase track for the office corridor
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
        // R297: door label uses bossDisplayName so the corridor's
        // glowing door reads the correct name for this arc.
        bossDisplayName: 'BALLMER',
        // R395: office corridor atmosphere — flickering fluorescents
        // overhead + occasional power-cable spark on the wall edges.
        ambientProps: [
            { kind: 'flicker', x: 64,  y: 24 },
            { kind: 'flicker', x: 192, y: 24 },
            { kind: 'flicker', x: 128, y: 16 },
            { kind: 'sparkCable', x: 8,   y: 100 },
            { kind: 'sparkCable', x: 248, y: 100 },
        ],
    };
}

// R280: Ballmer boss arena — picks up right after the office approach.
// Single boss segment, no corridor waves; player lands and immediately
// fights Ballmer + 3 shield drones.
function makeFpsStageBallmerArena() {
    return {
        fpsMode: true,
        theme: THEME.BOARDROOM,
        music: 'arenaBoss',     // R302: dedicated FPS boss arena track
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
        music: 'backstage',     // R302: FPS chase track
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
        bossDisplayName: 'BILL GATES',
        // R395: keynote-corridor stage-light flickers + sparking cables
        // sell "backstage" energy as the player advances.
        ambientProps: [
            { kind: 'flicker', x: 48,  y: 22 },
            { kind: 'flicker', x: 208, y: 22 },
            { kind: 'sparkCable', x: 16,  y: 90 },
            { kind: 'sparkCable', x: 240, y: 90 },
        ],
    };
}

function makeFpsStageGatesArena() {
    return {
        fpsMode: true,
        theme: THEME.KEYNOTE,
        music: 'arenaBoss',     // R302: dedicated FPS boss arena track
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

// R306: Mecha-Gates 3-stage arc — beat-em-up approach → FPS corridor → FPS
// arena boss. Mirrors the Ballmer/Gates pair but with one extra beat-em-up
// stage UP FRONT for the apocalyptic-street walking moment.
//
// Stage 20: MECHA APPROACH — beat-em-up. Walk a ruined street, fight
// scavengers + drones + helicopters across multiple waves, reach a dead
// end where Mecha-Gates appears (cinematic) and the player advances.
function makeBeatEmUpMechaApproach() {
    // R331 / R360: scrolling post-apocalypse cityscape. Player walks the
    // ruined street fighting scavengers + drones + brawlers across 8
    // waves. Scroll locks until current wave is cleared. R360 expanded
    // 4→8 waves and 1024→2048 px wide so the stage feels like a journey.
    //
    // Pacing arc:
    //   0  warm-up (2 scavengers)
    //   1  pincer pressure (3 enemies, both sides)
    //   2  drone-air mix
    //   3  mid-stage MINI-BOSS (single brawler, no support)
    //   4  recovery wave (light scavengers, room to breathe)
    //   5  heavy ground pressure (4 grunts)
    //   6  drone storm + chopper warning
    //   7  finale set-piece (brawler + chopper + scavengers)
    const STAGE_W = GAME.W * 8;     // 2048 wide (was 1024)
    return {
        beatMode: true,
        theme: THEME.KEYNOTE,
        music: 'apocalypse',
        bgKey: 'bg_apocalypse_street',
        bossKind: 'MECHA_GATES',
        spriteKeys: {
            scavenger:  'scavenger',
            drone:      'drone',
            helicopter: 'helicopter',
            brawler:    'brawler',
        },
        stageWidth: STAGE_W,
        // First wave starts immediately at scroll=0. Subsequent waves
        // trigger when scroll reaches the chokepoint x AND prior wave clear.
        waves: [
            // Wave 0 — warm-up, two scavengers from right
            { spawns: [
                { type: 'scavenger', side: 'right', depth: 0.4 },
                { type: 'scavenger', side: 'right', depth: 0.7 },
            ]},
            // Wave 1 — pincer + drone overhead
            { spawns: [
                { type: 'scavenger', side: 'left',  depth: 0.5 },
                { type: 'scavenger', side: 'right', depth: 0.3 },
                { type: 'drone',     side: 'right', depth: 0.8 },
            ]},
            // Wave 2 — drone-air mix; teach the player to aim up + side
            { spawns: [
                { type: 'drone',     side: 'left',  depth: 0.6 },
                { type: 'drone',     side: 'right', depth: 0.4 },
                { type: 'scavenger', side: 'right', depth: 0.7 },
            ]},
            // Wave 3 — mid-stage mini-boss: brawler solo (read the threat)
            { spawns: [
                { type: 'brawler',   side: 'right', depth: 0.5,
                  name: 'BRUTE', hpMul: 2.5 },
            ]},
            // Wave 4 — recovery, light scavengers from left
            { spawns: [
                { type: 'scavenger', side: 'left',  depth: 0.4 },
                { type: 'scavenger', side: 'left',  depth: 0.7 },
            ]},
            // Wave 5 — heavy ground pressure, four scavengers both sides
            { spawns: [
                { type: 'scavenger', side: 'left',  depth: 0.35 },
                { type: 'scavenger', side: 'left',  depth: 0.65 },
                { type: 'scavenger', side: 'right', depth: 0.4 },
                { type: 'scavenger', side: 'right', depth: 0.75 },
            ]},
            // Wave 6 — drone storm + chopper warning (the helicopter
            // is a noisy harbinger of stage 21's boss fight)
            { spawns: [
                { type: 'drone',      side: 'left',  depth: 0.6 },
                { type: 'drone',      side: 'right', depth: 0.5 },
                { type: 'drone',      side: 'right', depth: 0.8 },
                { type: 'helicopter', side: 'right', depth: 0.2 },
            ]},
            // Wave 7 — finale set-piece
            { spawns: [
                { type: 'brawler',    side: 'right', depth: 0.5 },
                { type: 'helicopter', side: 'left',  depth: 0.25 },
                { type: 'scavenger',  side: 'right', depth: 0.8 },
                { type: 'scavenger',  side: 'left',  depth: 0.7 },
            ]},
        ],
        // 7 chokepoints (wave 0 fires auto-on-entry). Even spacing across
        // the 8-screen stage so the player walks ~256 px between fights.
        waveChokepoints: [
            { x: GAME.W * 1.0, wave: 1 },
            { x: GAME.W * 2.0, wave: 2 },
            { x: GAME.W * 3.0, wave: 3 },
            { x: GAME.W * 4.0, wave: 4 },
            { x: GAME.W * 5.0, wave: 5 },
            { x: GAME.W * 6.0, wave: 6 },
            { x: GAME.W * 7.0, wave: 7 },
        ],
        nextStage: 21,
        clearText: 'KEEP MOVING',
        bossDisplayName: 'MECHA-GATES',
        introBgKey: 'bg_apocalypse',
        // R386: apocalyptic atmosphere across the beat-em-up street.
        // x coords are in beat-em-up world space (matches scroll). Embers
        // sources spaced one per "screen" so the chase always has wind-
        // driven embers crossing the player's POV. Lightning + fog are
        // screen-space (x/y unused except by fogBank's y).
        ambientProps: [
            { kind: 'embers',    x: GAME.W * 0.5, y: 80,  wind: 0.6, spread: 80, period: 5 },
            { kind: 'embers',    x: GAME.W * 1.5, y: 80,  wind: 0.7, spread: 80, period: 4 },
            { kind: 'embers',    x: GAME.W * 2.5, y: 80,  wind: 0.5, spread: 100, period: 5 },
            { kind: 'embers',    x: GAME.W * 3.5, y: 80,  wind: 0.6, spread: 80, period: 4 },
            { kind: 'embers',    x: GAME.W * 4.5, y: 80,  wind: 0.7, spread: 100, period: 5 },
            { kind: 'embers',    x: GAME.W * 5.5, y: 80,  wind: 0.5, spread: 80, period: 4 },
            { kind: 'embers',    x: GAME.W * 6.5, y: 80,  wind: 0.6, spread: 80, period: 5 },
            { kind: 'embers',    x: GAME.W * 7.5, y: 80,  wind: 0.6, spread: 100, period: 4 },
            { kind: 'lightning', x: 0, y: 0 },
            { kind: 'fogBank',   x: 0, y: 120, speed: 0.18, alpha: 0.18, color: '#3a2a35' },
            { kind: 'fogBank',   x: 0, y: 160, speed: 0.12, alpha: 0.14, color: '#2e1f2a' },
        ],
    };
}

// R337: stage 7 — BALLMER ARENA, beat-em-up in the boardroom. User
// feedback: the giant Ballmer fight should happen in the boardroom, not
// the FPS corridor, and it should introduce the beat-em-up gameplay
// element in the main campaign (not just in the super-secret stage 20).
// Reuses the BeatEmUp class with boardroom-themed waves climaxing in
// the BALLMER brawler boss.
function makeBeatEmUpBallmer() {
    return {
        beatMode: true,
        theme: THEME.BOARDROOM,
        music: 'arenaBoss',
        bgKey: 'bg_boardroom',
        bossKind: 'BALLMER',
        spriteKeys: {
            // Reuse generic beat-em-up grunts but skin them as office staff
            // (visual blend with boardroom theme). Brawler = Ballmer himself
            // using his FPS-arena chair-throw sprite (3/4 angle side view).
            scavenger:  'scavenger',
            drone:      'drone',
            helicopter: 'helicopter',
            brawler:    'boss_ballmer_fps',
        },
        // 4 waves — chair-staff sweep, mixed wave, helicopter pressure,
        // then Ballmer himself shows up.
        waves: [
            { spawns: [
                { type: 'scavenger', side: 'right', depth: 0.4 },
                { type: 'scavenger', side: 'left',  depth: 0.7 },
            ]},
            { spawns: [
                { type: 'scavenger', side: 'right', depth: 0.5 },
                { type: 'drone',     side: 'right', depth: 0.3 },
                { type: 'scavenger', side: 'left',  depth: 0.8 },
            ]},
            { spawns: [
                { type: 'drone',      side: 'left',  depth: 0.6 },
                { type: 'drone',      side: 'right', depth: 0.4 },
                { type: 'helicopter', side: 'right', depth: 0.2 },
            ]},
            // Final wave: Ballmer himself + escort. isBoss=true gives him
            // 3x HP + the boss HP-bar at the bottom of the screen.
            // 1.4x size makes him visually distinct from the brawler grunts.
            { spawns: [
                { type: 'brawler',    side: 'right', depth: 0.5, isBoss: true, name: 'BALLMER', hpMul: 3, wMul: 1.4, hMul: 1.4 },
                { type: 'scavenger',  side: 'left',  depth: 0.7 },
            ]},
        ],
        clearText: 'BOARDROOM CLEARED',
        bossDisplayName: 'BALLMER',
        introBgKey: 'bg_microsoft_hq',
        nextStage: 8,
    };
}

// R338: stage 10 — GATES ARENA as side-scrolling platformer (not FPS).
// User: 'fps only makes sense in interior areas'. While keynote IS
// interior, Ballmer (stage 7) is now beat-em-up and Mecha-Gates
// (stage 22) is beat-em-up — Gates being a 3rd-style platformer boss
// adds variety. Tight keynote-hall arena with two platforms + Gates
// in the back. R325's Floppy Rain phase-2 attack already wired.
function makeStageGatesArena() {
    const w = 48, h = 14;
    const { g } = blankStage(w, h, THEME.KEYNOTE);
    // Side walls
    rectT(g, 0, 0, 1, h, W);
    rectT(g, 0, w - 1, 1, h, W);
    // Two side platforms — verticality without dominating the arena
    platT(g, 8,  10, 4);
    platT(g, 8,  34, 4);
    // Center elevated platform — risky high ground
    platT(g, 6,  22, 4);
    // Stealth grass at the audience-row entry
    for (let i = 0; i < 2; i++) setT(g, h - 3, 4 + i, G);
    for (let i = 0; i < 2; i++) setT(g, h - 3, 42 + i, G);
    return {
        tiles: g, width: w, height: h, theme: THEME.KEYNOTE,
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        bossTrigger: { x: 8 * GAME.TILE },   // boss spawns near start
        enemySpawns: [
            // No grunts — pure boss fight to keep the focus on Gates.
        ],
        pickupSpawns: [
            { x: 12 * GAME.TILE, y: (h - 3) * GAME.TILE - 10, type: 'LIFE' },
            { x: 36 * GAME.TILE, y: (h - 3) * GAME.TILE - 10, type: 'LIFE' },
            { x: 24 * GAME.TILE, y: ( 4) * GAME.TILE, type: 'HOMING' },
        ],
        crateSpawns: [
            { x: 10 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'LASER' },
            { x: 38 * GAME.TILE, y: ( 7) * GAME.TILE - 14, drop: 'SHOTGUN' },
        ],
        // R332: ambient props — sparking cables hint at a damaged stage
        ambientProps: [
            { kind: 'sparkCable', x: 18 * GAME.TILE, y: ( 3) * GAME.TILE },
            { kind: 'sparkCable', x: 32 * GAME.TILE, y: ( 3) * GAME.TILE },
            { kind: 'flicker',    x: 24 * GAME.TILE, y: ( 1) * GAME.TILE },
        ],
        music: 'arenaBoss',
        bossDisplayName: 'GATES',
        // chains to stage 11 (Founder's Lair)
        nextStage: 11,
    };
}

// R335: stage 22 — Mecha-Gates final boss as a BEAT-EM-UP (not FPS).
// User: 'mecha gates should have beat em up style'. Mecha-Gates lands
// in the rubble where his helicopter crashed and fights on foot in
// post-apocalypse street, same plane as stage 20. Phase-2 mechanic
// from R308 still applies: at 50% HP the mech ejects and the pilot
// fights smaller + faster.
function makeBeatEmUpMechaGates() {
    // R361: stage 22 deep pass. User: "mechagates needs to be bigger and
    // needs actual animations. same issues with the mechagates stage as
    // we had with mecha approach."
    //
    //   - Stage is now 4 screens wide (was effectively 1-screen).
    //   - Mecha-Gates phase 1 boss scaled 1.6→2.6 (much bigger silhouette).
    //   - Added gauntlet waves before the boss so the player walks the
    //     wreckage field, fights through scavengers, THEN the mech lands.
    //   - Phase 2 (exposed pilot) scaled up + faster.
    //   - Pickups + crates rebalanced for the longer fight.
    // R365: 6-screen stage (was 4) — user: "make mecha gates stage long.
    // like a beat 'em up game where you keep progressing from left to
    // right". 9 waves across the journey, with the Mecha-Gates boss not
    // landing until wave 6 (so the player walks most of the level
    // first). Phase-1 boss isn't the end — phase-2 ejects after.
    // R407: stage 22 was using bg_apocalypse_street (same as stage 20)
    // which made the two stages feel identical. Now uses the dedicated
    // crater bg — helicopter wreckage, smoldering crater, ruined tower
    // with crashed jet liner. Visually distinct as the FINAL battle.
    const STAGE_W = GAME.W * 6;
    return {
        beatMode: true,
        theme: THEME.KEYNOTE,
        music: 'apocalypse',
        bgKey: 'bg_apocalypse_crater',
        bossKind: 'MECHA_GATES',
        spriteKeys: {
            scavenger:  'scavenger',
            drone:      'drone',
            helicopter: 'helicopter',
            brawler:    'boss_mecha_gates',
        },
        stageWidth: STAGE_W,
        // 9 waves — long walk through the wreckage to the final
        waves: [
            // Wave 0 — wreckage-field warm-up at spawn
            { spawns: [
                { type: 'scavenger', side: 'right', depth: 0.4 },
                { type: 'scavenger', side: 'right', depth: 0.7 },
            ]},
            // Wave 1 — pincer + drone
            { spawns: [
                { type: 'scavenger', side: 'left',  depth: 0.5 },
                { type: 'scavenger', side: 'right', depth: 0.4 },
                { type: 'drone',     side: 'right', depth: 0.7 },
            ]},
            // Wave 2 — heavier ground
            { spawns: [
                { type: 'scavenger', side: 'left',  depth: 0.5 },
                { type: 'scavenger', side: 'left',  depth: 0.7 },
                { type: 'scavenger', side: 'right', depth: 0.4 },
                { type: 'drone',     side: 'right', depth: 0.7 },
            ]},
            // Wave 3 — mid-stage MINI BRUTE breather
            { spawns: [
                { type: 'brawler',   side: 'right', depth: 0.5,
                  name: 'BRUTE', hpMul: 2.5, wMul: 1.4, hMul: 1.4 },
                { type: 'scavenger', side: 'left',  depth: 0.7 },
            ]},
            // Wave 4 — drone storm + chopper warning (foreshadow)
            { spawns: [
                { type: 'drone',     side: 'left',  depth: 0.5 },
                { type: 'drone',     side: 'right', depth: 0.6 },
                { type: 'helicopter',side: 'right', depth: 0.2 },
            ]},
            // Wave 5 — heavy ground push, scavenger wall
            { spawns: [
                { type: 'scavenger', side: 'left',  depth: 0.35 },
                { type: 'scavenger', side: 'left',  depth: 0.55 },
                { type: 'scavenger', side: 'left',  depth: 0.75 },
                { type: 'scavenger', side: 'right', depth: 0.45 },
                { type: 'drone',     side: 'right', depth: 0.6 },
            ]},
            // Wave 6 — MECHA-GATES PHASE 1 LANDS
            { spawns: [
                { type: 'brawler',   side: 'right', depth: 0.5, isBoss: true,
                  name: 'MECHA-GATES', hpMul: 5, wMul: 2.6, hMul: 2.6,
                  isMechaPhase1: true },
            ]},
            // Wave 7 — interstitial: drones harass between phases
            { spawns: [
                { type: 'drone',     side: 'left',  depth: 0.5 },
                { type: 'drone',     side: 'right', depth: 0.6 },
                { type: 'scavenger', side: 'left',  depth: 0.8 },
            ]},
            // Wave 8 — MECHA-GATES PHASE 2 (pilot exposed) FINALE
            { spawns: [
                { type: 'brawler',   side: 'right', depth: 0.5, isBoss: true,
                  name: 'MECHA-GATES / EXPOSED', hpMul: 3, wMul: 1.4, hMul: 1.4,
                  isMechaPhase2: true },
            ]},
        ],
        // 6 chokepoints. R408 fix: chokepoint 6 used to be at GAME.W * 5.5
        // (= 1408px) but max scroll on a 6-screen stage is STAGE_W - GAME.W
        // = 1280. Chokepoint was UNREACHABLE — player walked to the right
        // edge after wave 5, scroll capped at 1280, wave 6 boss never
        // triggered. User: "i cannot get past wave 7 in mecha gates"
        // (off-by-one — was actually wave 6 that never fired). Compressed
        // all chokepoints into the 0-5 screen range with wave 6 at 4.6×
        // (~1178, well inside max scroll).
        waveChokepoints: [
            { x: GAME.W * 0.8, wave: 1 },
            { x: GAME.W * 1.6, wave: 2 },
            { x: GAME.W * 2.4, wave: 3 },
            { x: GAME.W * 3.2, wave: 4 },
            { x: GAME.W * 4.0, wave: 5 },
            { x: GAME.W * 4.6, wave: 6 },
        ],
        pickupSpawns: [
            { x: 120,  y: 100, type: 'HOMING' },
            { x: 380,  y: 100, type: 'LIFE' },
            { x: 620,  y: 100, type: 'GRENADE' },
            { x: 860,  y: 100, type: 'LIFE' },
            { x: 1100, y: 100, type: 'HOMING' },
            { x: 1340, y: 100, type: 'LIFE' },
        ],
        clearText: 'YOU ARE THE LAST CLIPPY',
        bossDisplayName: 'MECHA-GATES',
        introBgKey: 'bg_apocalypse',
        // True final — no nextStage. Beat-em-up engine routes to
        // GAME_COMPLETE on clear via R365 isFinal check.
        // R386: final-stage apocalypse atmosphere — more intense than
        // stage 20: faster ember cadence, denser fog, more frequent
        // lightning. Sells the FINAL BATTLE inside the helicopter-crash
        // ruins where Mecha-Gates landed.
        ambientProps: [
            { kind: 'embers',    x: GAME.W * 0.5, y: 70,  wind: 0.7, spread: 100, period: 3 },
            { kind: 'embers',    x: GAME.W * 1.5, y: 70,  wind: 0.8, spread: 80,  period: 3 },
            { kind: 'embers',    x: GAME.W * 2.5, y: 70,  wind: 0.6, spread: 100, period: 4 },
            { kind: 'embers',    x: GAME.W * 3.5, y: 70,  wind: 0.7, spread: 120, period: 3 },
            { kind: 'embers',    x: GAME.W * 4.5, y: 70,  wind: 0.8, spread: 80,  period: 3 },
            { kind: 'embers',    x: GAME.W * 5.5, y: 70,  wind: 0.7, spread: 100, period: 4 },
            // Lightning fires every 3-7s for max apocalyptic dread
            { kind: 'lightning', x: 0, y: 0 },
            // Three fog layers at staggered depths
            { kind: 'fogBank',   x: 0, y: 110, speed: 0.22, alpha: 0.22, color: '#4a2530' },
            { kind: 'fogBank',   x: 0, y: 145, speed: 0.16, alpha: 0.18, color: '#3a1f28' },
            { kind: 'fogBank',   x: 0, y: 175, speed: 0.10, alpha: 0.14, color: '#2a1820' },
            // R415: distant smoke columns rising from the burning city
            // anchored to fixed world spots. Drift right with the wind.
            { kind: 'smokeColumn', x: GAME.W * 1.2, y: 110, wind: 0.20, color: '#1a1018' },
            { kind: 'smokeColumn', x: GAME.W * 3.4, y: 90,  wind: 0.25, color: '#1a1018' },
            { kind: 'smokeColumn', x: GAME.W * 5.0, y: 100, wind: 0.18, color: '#1a1018' },
            // R415: falling embers from above (collapsing tower)
            { kind: 'fallingEmbers', x: GAME.W * 2.0, y: 20, spread: 100, period: 5 },
            { kind: 'fallingEmbers', x: GAME.W * 4.0, y: 20, spread: 120, period: 4 },
            // R415: heat shimmer over the crater
            { kind: 'heatShimmer', x: GAME.W * 2.5, y: 160, w: 80, h: 14 },
            { kind: 'heatShimmer', x: GAME.W * 4.5, y: 160, w: 60, h: 12 },
        ],
    };
}

// R359: removed dead makeFpsStageMecha() — the original FPS variant of
// stage 22 was replaced by makeBeatEmUpMechaGates() in R335. Function
// was never referenced from STAGE_LOADERS.

// R306: stage 21 — FPS corridor approach through the ruined city to
// R334: stage 21 MECHA CORRIDOR — side-scrolling platformer with a
// GIANT HELICOPTER as a chase boss. The helicopter is alive for the
// entire stage; player runs right while shooting upward. On helicopter
// defeat, cinematic shows the chopper crashing → stage 22 (Mecha-Gates
// pops out of the wreckage in beat-em-up form).
function makeStageMechaHelicopter() {
    const w = 110, h = 14;
    const { g } = blankStage(w, h, THEME.KEYNOTE);   // KEYNOTE theme but
    // we override bg via bgKey below so the apocalypse painting shows.
    // Side walls
    rectT(g, 0, 0, 1, h, W);
    rectT(g, 0, w - 1, 1, h, W);
    // Long-running cityscape — punctuated by jump gaps (pits) and
    // wreckage platforms the player can use as cover from the chopper.
    // Section A (0-25): warm-up street with low cover.
    platT(g, h - 6, 8,  3);
    platT(g, h - 6, 16, 3);
    // Section B (25-50): rising rubble — get higher to deny the chopper's
    // downward-aimed shots while keeping forward momentum.
    platT(g, h - 8, 28, 3);
    platT(g, h - 5, 36, 3);
    platT(g, h - 9, 42, 3);
    // Mid pit at col 46-49 — short jump or take damage
    rectT(g, h - 2, 46, 3, 2, S);   // spikes in the pit
    rectT(g, h - 1, 46, 3, 1, W);   // bottom wall so the pit isn't bottomless
    // Section C (50-75): wide-open street with crumbling cover.
    platT(g, h - 6, 54, 4);
    platT(g, h - 4, 64, 3);
    platT(g, h - 7, 70, 4);
    // Section D (75-100): collapsed-overpass approach — high platforms
    // give the player aim windows on the chopper.
    platT(g, h - 9, 78, 3);
    platT(g, h - 5, 84, 3);
    platT(g, h - 9, 92, 4);
    // Final stretch (100-110): clear runway where the chopper crashes.
    return {
        tiles: g, width: w, height: h, theme: THEME.KEYNOTE,
        // R334: override painted bg + ground bitmap to the apocalypse
        // tileset (R311). Theme stays KEYNOTE for the tile palette +
        // platform sprites; only the back painting + ground swap.
        bgKeyOverride: 'bg_apocalypse',
        groundOverride: 'ground_apocalypse',
        playerStart: { x: 48, y: (h - 4) * GAME.TILE },
        // The chopper IS the boss — present from the start. No separate
        // bossTrigger; the boss-spawn fires immediately on stage entry.
        bossTrigger: { x: 6 * GAME.TILE },
        bossKind: 'HELICOPTER',
        // Light grunt presence — scavengers spawn from the ground at
        // intervals as the player runs. Adds horizontal pressure while
        // the chopper handles vertical pressure.
        enemySpawns: [
            { x: 20 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 32 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 56 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 68 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
            { x: 82 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'stapler' },
            { x: 96 * GAME.TILE, y: (h - 3) * GAME.TILE, type: 'cabinet' },
        ],
        pickupSpawns: [
            { x: 14 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'HOMING' },
            { x: 38 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            { x: 60 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'THUNDER' },
            { x: 76 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'LIFE' },
            { x: 95 * GAME.TILE, y: (h - 3) * GAME.TILE - 8, type: 'GRENADE' },
        ],
        crateSpawns: [
            { x: 36 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'LIFE' },
            { x: 70 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'HOMING' },
            { x: 92 * GAME.TILE, y: ( 5) * GAME.TILE - 14, drop: 'CLIPPY_TAG' },
        ],
        // R332+R384: post-apocalypse atmosphere — fires + dying Clippies +
        // drifting embers across the chase + occasional distant lightning
        // strikes (sells the chopper-chase burning sky). Embers and
        // lightning are screen-space FX so coords are sparse.
        ambientProps: [
            { kind: 'fire', x: 12 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fire', x: 26 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fire', x: 52 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fire', x: 80 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'fire', x: 100 * GAME.TILE, y: (h - 3) * GAME.TILE },
            { kind: 'dyingClippy', x: 30 * GAME.TILE, y: (h - 3) * GAME.TILE, state: 'dead' },
            { kind: 'dyingClippy', x: 58 * GAME.TILE, y: (h - 3) * GAME.TILE, state: 'stagger' },
            { kind: 'dyingClippy', x: 88 * GAME.TILE, y: (h - 3) * GAME.TILE, state: 'dead' },
            // Ember sources spaced across the level — wind blows right, so
            // sources sit on the left of each "burning zone" and embers
            // drift across the player's field of view as they run right.
            { kind: 'embers', x: 16 * GAME.TILE, y: (h - 5) * GAME.TILE, wind: 0.6, spread: 80, period: 5 },
            { kind: 'embers', x: 44 * GAME.TILE, y: (h - 5) * GAME.TILE, wind: 0.5, spread: 100, period: 4 },
            { kind: 'embers', x: 72 * GAME.TILE, y: (h - 5) * GAME.TILE, wind: 0.7, spread: 80, period: 5 },
            { kind: 'embers', x: 96 * GAME.TILE, y: (h - 5) * GAME.TILE, wind: 0.5, spread: 100, period: 4 },
            // Distant lightning — screen-space; the single instance fires
            // on its own internal cooldown (~4-10s).
            { kind: 'lightning', x: 0, y: 0 },
            // Slow fog bank drifting near horizon
            { kind: 'fogBank', x: 0, y: (h - 7) * GAME.TILE, speed: 0.18, alpha: 0.16, color: '#3a2a30' },
            // R415: heat shimmer over each fire source
            { kind: 'heatShimmer', x: 12 * GAME.TILE, y: (h - 5) * GAME.TILE, w: 24, h: 10 },
            { kind: 'heatShimmer', x: 52 * GAME.TILE, y: (h - 5) * GAME.TILE, w: 24, h: 10 },
            { kind: 'heatShimmer', x: 100 * GAME.TILE, y: (h - 5) * GAME.TILE, w: 24, h: 10 },
            // R415: smoke columns rising from distant burning ruins
            { kind: 'smokeColumn', x: 30 * GAME.TILE, y: (h - 8) * GAME.TILE, wind: 0.25, color: '#1a0810' },
            { kind: 'smokeColumn', x: 64 * GAME.TILE, y: (h - 8) * GAME.TILE, wind: 0.22, color: '#1a0810' },
            { kind: 'smokeColumn', x: 92 * GAME.TILE, y: (h - 8) * GAME.TILE, wind: 0.28, color: '#1a0810' },
            // R415: falling embers from the collapsing skyline
            { kind: 'fallingEmbers', x: 50 * GAME.TILE, y: 20, spread: 200, period: 6 },
            // R415: distant vulture silhouettes — circling carrion
            { kind: 'distantBird', x: 0, y: 30, speed: 0.5, dir: 'right', color: '#080408' },
            { kind: 'distantBird', x: 0, y: 50, speed: 0.6, dir: 'left',  color: '#080408' },
        ],
        music: 'recycleBin',   // R323 swap kept the glitched-chase feel here
        nextStage: 22,         // chains into the Mecha-Gates beat-em-up
        bossDisplayName: 'HELICOPTER',
        introBgKey: 'bg_apocalypse',
    };
}

// where Mecha-Gates is staged. Uses the apocalypse backdrop with FPS
// rail-shooter mechanics. Chains into stage 22 (the Mecha-Gates arena).
// R359: removed dead makeFpsStageMechaCorridor() — the original FPS
// variant of stage 21 was replaced by makeStageMechaHelicopter() in
// R334. Function was never referenced from STAGE_LOADERS.

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
        // R321 perf: cache per-frame sin/cos values that _drawTile reads
        // for animated tiles. Was calling Math.sin per tile per frame; a
        // 96x14 viewport at 60Hz = ~80,000 trig calls/sec wasted on
        // values that don't vary by tile.
        this._frameSinSlow = Math.sin(this.frame * 0.15);             // crumble-ghost outline pulse
        this._tileAnimSinSlow = Math.sin(this.tileAnimTick * 0.15);   // crumble-debris bob
        // REALITY platform pulse — varies per column, but the column factor
        // is `c * 0.5`. Precompute the time-only term once; _drawTile adds
        // the column phase. (sin(a+b) expansion would let us LUT this, but
        // a single per-frame term is the easy 95% win.)
        this._realityPulseBase = this.tileAnimTick * 0.04;

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
        // R334: stage data can override the theme-default ground bitmap.
        // Used by Mecha Corridor (stage 21) which uses KEYNOTE theme for
        // palette + parallax but renders the apocalypse-painted ground.
        return this.data.groundOverride || GROUND_BITMAP_KEY[this.data.theme] || null;
    }

    // R310: per-theme platform accent. Procedural fallback while painted
    // platform tilesets are being generated. Cheap deterministic positions.
    _drawPlatformAccent(ctx, x, y, c, r) {
        const T = GAME.TILE;
        const pal = this.palette;
        switch (this.data.theme) {
            case THEME.SERVERROOM: {
                // Rivets + a tiny blinking LED on every 4th plank tile
                ctx.fillStyle = pal.plank;
                ctx.fillRect(x + 1, y + 2, 1, 1);
                ctx.fillRect(x + T - 2, y + 2, 1, 1);
                if ((c & 3) === 0) {
                    const lit = (this.tileAnimTick + c * 5) % 60 < 18;
                    ctx.fillStyle = lit ? '#80f0ff' : '#103040';
                    ctx.fillRect(x + T / 2, y + 2, 1, 1);
                }
                break;
            }
            case THEME.JUNGLE: {
                // Vine fronds dangling off the bottom edge
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x + (c * 3 % T), y + 4, 1, 2);
                if ((c & 1) === 0) ctx.fillRect(x + ((c * 7 + 5) % T), y + 4, 1, 3);
                // Mossy top speckle
                ctx.fillStyle = pal.highlight;
                ctx.fillRect(x + ((c * 5 + 2) % T), y + 1, 1, 1);
                break;
            }
            case THEME.SEWER: {
                // Wet metal stripe + drip on every other tile
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x, y + 2, T, 1);
                if ((c & 1) === 0) {
                    ctx.fillStyle = '#80a060';
                    ctx.fillRect(x + (c * 11 % T), y + 4, 1, 2);
                }
                break;
            }
            case THEME.FOUNDER: {
                // Cracked stone — a dark fissure runs across each tile
                ctx.fillStyle = pal.plank;
                ctx.fillRect(x + 2, y + 2, T - 4, 1);
                ctx.fillRect(x + 4 + (c % 3), y + 3, 2, 1);
                // Glowing ember in the crack
                if ((c & 3) === 1) {
                    ctx.fillStyle = '#ff4020';
                    ctx.fillRect(x + 6 + (c % 4), y + 2, 1, 1);
                }
                break;
            }
            case THEME.CLOUD: {
                // Tech-grid lines — moving lit "data flow" line
                ctx.fillStyle = pal.plank;
                ctx.fillRect(x, y + 2, T, 1);
                const flowOff = (this.tileAnimTick / 2) % T;
                ctx.fillStyle = pal.highlight;
                ctx.fillRect(x + ((flowOff + c * 4) | 0) % T, y + 2, 2, 1);
                break;
            }
            case THEME.BOARDROOM: {
                // Brass-trim platform with screws at edges
                ctx.fillStyle = pal.highlight;
                ctx.fillRect(x, y + 1, T, 1);
                ctx.fillStyle = pal.plank;
                ctx.fillRect(x + 1, y + 2, 1, 1);
                ctx.fillRect(x + T - 2, y + 2, 1, 1);
                break;
            }
            case THEME.KEYNOTE: {
                // Stage truss — purple bolted truss appearance
                ctx.fillStyle = pal.plank;
                ctx.fillRect(x, y + 2, T, 1);
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x + 1, y + 3, 1, 1);
                ctx.fillRect(x + T - 2, y + 3, 1, 1);
                if ((c & 1) === 0) {
                    ctx.fillStyle = pal.highlight;
                    ctx.fillRect(x + T / 2, y + 1, 1, 1);
                }
                break;
            }
            case THEME.BREAKROOM: {
                // Linoleum tile seam every other tile
                ctx.fillStyle = pal.plank;
                if ((c & 1) === 0) ctx.fillRect(x, y + 1, 1, 4);
                ctx.fillStyle = pal.accent;
                ctx.fillRect(x + ((c * 3) % T), y + 2, 1, 1);
                break;
            }
            case THEME.REALITY: {
                // Mirror-finish — black with a thin lavender highlight pulse
                ctx.fillStyle = '#000000';
                ctx.fillRect(x, y + 2, T, 1);
                const pulse = Math.sin(this.tileAnimTick * 0.04 + c * 0.5);
                if (pulse > 0.6) {
                    ctx.fillStyle = pal.highlight;
                    ctx.fillRect(x, y + 2, T, 1);
                }
                break;
            }
            default: {
                // Generic wood-grain speckle (original look)
                ctx.fillStyle = pal.plank;
                for (let i = 0; i < T; i++) {
                    if ((i * 5 + c * 7) & 3) continue;
                    ctx.fillRect(x + i, y + 1 + (i & 1), 1, 1);
                }
            }
        }
    }

    // R404: hanging decor that extends BELOW the 6px playable platform
    // strip into the empty space the player jumps THROUGH. Theme-
    // appropriate (vines, drip-stains, cables, banner tails). Drawn
    // sparsely via hash so not every tile shows decor — gives the
    // platforms an organic broken silhouette. `hashSeed` comes from
    // the same hash already computed for source-column sampling.
    _drawPlatformDecor(ctx, x, y, c, r, hashSeed) {
        const T = GAME.TILE;
        const sway = Math.sin((this.tileAnimTick || 0) * 0.04 + c * 0.7) * 1.0;
        // Skip ~50% of tiles based on hash so decor isn't on every column
        const showDecor = (hashSeed % 4) < 2;
        if (!showDecor) return;
        switch (this.data.theme) {
            case THEME.JUNGLE: {
                // Hanging vine — 8-14px of thin dark green strand with
                // a leaf cluster at the bottom + curl sway.
                const len = 8 + (hashSeed % 7);
                const baseX = x + 4 + (hashSeed % 8);
                ctx.fillStyle = '#1a3a18';
                for (let i = 0; i < len; i++) {
                    const dx = (i / len) * sway;
                    ctx.fillRect(Math.round(baseX + dx), y + 6 + i, 1, 1);
                }
                // Bright highlight stripe along the side
                ctx.fillStyle = '#2a5028';
                ctx.fillRect(Math.round(baseX + sway * 0.6), y + 8, 1, Math.max(2, len - 4));
                // Leaf cluster at the end
                const tipX = Math.round(baseX + sway);
                const tipY = y + 6 + len;
                ctx.fillStyle = '#3a6028';
                ctx.fillRect(tipX - 1, tipY, 3, 1);
                ctx.fillRect(tipX, tipY + 1, 1, 1);
                ctx.fillStyle = '#4a7830';
                ctx.fillRect(tipX, tipY, 1, 1);
                break;
            }
            case THEME.SEWER: {
                // Drip stain underneath + occasional active droplet
                const baseX = x + 2 + (hashSeed % 12);
                ctx.fillStyle = 'rgba(40, 60, 30, 0.85)';
                ctx.fillRect(baseX, y + 6, 2, 3 + (hashSeed % 3));
                ctx.fillStyle = 'rgba(100, 160, 70, 0.45)';
                ctx.fillRect(baseX, y + 6, 1, 6 + (hashSeed % 4));
                // Slow drip droplet sometimes hangs farther down
                const dropPhase = (this.tileAnimTick + c * 17) % 90;
                if (dropPhase < 12 && (hashSeed & 3) === 0) {
                    ctx.fillStyle = '#7ad07a';
                    ctx.fillRect(baseX, y + 10 + dropPhase, 1, 1);
                }
                break;
            }
            case THEME.FOUNDER: {
                // Hanging chain — dark grey segmented links
                const len = 6 + (hashSeed % 6);
                const baseX = x + 4 + (hashSeed % 8);
                ctx.fillStyle = '#1a1a20';
                for (let i = 0; i < len; i++) {
                    ctx.fillRect(baseX, y + 6 + i, 1, 1);
                    if ((i & 1) === 0) ctx.fillRect(baseX - 1, y + 6 + i, 3, 1);
                }
                // Brass highlight on alternating links
                ctx.fillStyle = '#a06028';
                for (let i = 0; i < len; i += 2) {
                    ctx.fillRect(baseX + 1, y + 6 + i, 1, 1);
                }
                break;
            }
            case THEME.SERVERROOM: {
                // Hanging power cable with a connector at the tip
                const len = 5 + (hashSeed % 6);
                const baseX = x + 3 + (hashSeed % 10);
                ctx.fillStyle = '#0a0a14';
                for (let i = 0; i < len; i++) {
                    const dx = Math.round((i / len) * sway * 0.6);
                    ctx.fillRect(baseX + dx, y + 6 + i, 1, 1);
                }
                // Connector block at the tip
                const tipX = baseX + Math.round(sway * 0.6);
                ctx.fillStyle = '#3a3a48';
                ctx.fillRect(tipX - 1, y + 6 + len, 3, 2);
                // Pulse LED — animates slowly
                const lit = ((this.tileAnimTick + c * 7) & 31) < 8;
                if (lit) {
                    ctx.fillStyle = '#60c0ff';
                    ctx.fillRect(tipX, y + 6 + len, 1, 1);
                }
                break;
            }
            case THEME.KEYNOTE: {
                // Banner tail — folded purple ribbon hanging from platform
                const len = 6 + (hashSeed % 8);
                const baseX = x + 4 + (hashSeed % 6);
                ctx.fillStyle = '#3a1850';
                ctx.fillRect(baseX, y + 6, 4, len);
                ctx.fillStyle = '#502068';
                ctx.fillRect(baseX, y + 6, 1, len);
                // Notch tip (V-cut bottom). Use this.palette since
                // _drawPlatformDecor doesn't have `pal` in scope.
                ctx.fillStyle = (this.palette && this.palette.solid) || '#080010';
                ctx.fillRect(baseX + 1, y + 6 + len - 1, 2, 1);
                // Gold trim accent
                ctx.fillStyle = '#c0a040';
                ctx.fillRect(baseX, y + 6, 4, 1);
                break;
            }
            case THEME.BOARDROOM: {
                // Hanging tassel — gold cord with fringe
                const len = 4 + (hashSeed % 5);
                const baseX = x + 6 + (hashSeed % 6);
                ctx.fillStyle = '#a07020';
                ctx.fillRect(baseX, y + 6, 1, len);
                // Tassel bulb at end
                ctx.fillStyle = '#806010';
                ctx.fillRect(baseX - 1, y + 6 + len, 3, 2);
                ctx.fillStyle = '#a87830';
                ctx.fillRect(baseX, y + 6 + len, 1, 2);
                break;
            }
            case THEME.CLOUD: {
                // Wispy data trail — green pixels drifting down
                const baseX = x + 4 + (hashSeed % 8);
                for (let i = 0; i < 8; i++) {
                    const a = (8 - i) / 8;
                    ctx.fillStyle = `rgba(60, 220, 120, ${a * 0.7})`;
                    if (((this.tileAnimTick + c * 5 + i) & 3) === 0) {
                        ctx.fillRect(baseX, y + 6 + i, 1, 1);
                    }
                }
                break;
            }
            case THEME.BREAKROOM: {
                // Dangling broken ceiling tile + wire
                const baseX = x + 5 + (hashSeed % 6);
                ctx.fillStyle = '#2a2418';
                ctx.fillRect(baseX, y + 6, 1, 3);
                ctx.fillStyle = '#4a4030';
                ctx.fillRect(baseX - 2, y + 9, 5, 2);
                ctx.fillStyle = '#1a1408';
                ctx.fillRect(baseX - 2, y + 11, 5, 1);
                break;
            }
            case THEME.REALITY: {
                // Lavender mirror-shard hanging by a thread
                const baseX = x + 6 + (hashSeed % 4);
                ctx.fillStyle = '#503060';
                ctx.fillRect(baseX, y + 6, 1, 3);
                ctx.fillStyle = '#a070c0';
                ctx.fillRect(baseX - 1, y + 9, 3, 3);
                ctx.fillStyle = '#e0a0f0';
                ctx.fillRect(baseX, y + 10, 1, 1);
                break;
            }
        }
    }

    // R405: paint a small endcap at the TOP or BOTTOM of a ladder run
    // — rope hitches for sewer, vine wraps for jungle, cable clamps for
    // serverroom, etc. Anchors the ladder visually so it doesn't look
    // like 3 stacked identical tiles ending in mid-air.
    _drawLadderEndcap(ctx, x, y, c, r, side) {
        const T = GAME.TILE;
        const cx = x + T / 2;
        const isTop = side === 'top';
        const py = isTop ? y - 2 : y + T - 1;
        const ph = isTop ? 3 : 4;
        switch (this.data.theme) {
            case THEME.JUNGLE: {
                // Vine curl wrapping the rung
                ctx.fillStyle = '#1a3a18';
                ctx.fillRect(x + 1, py, T - 2, 1);
                ctx.fillStyle = '#2a5028';
                ctx.fillRect(x + 1, py, 1, ph);
                ctx.fillRect(x + T - 2, py, 1, ph);
                // Hanging leaf on bottom only
                if (!isTop) {
                    ctx.fillStyle = '#3a6028';
                    ctx.fillRect(cx - 1, py + 2, 3, 1);
                    ctx.fillRect(cx, py + 3, 1, 1);
                }
                break;
            }
            case THEME.SEWER: case THEME.SERVERROOM: {
                // Metal clamp + bolts
                ctx.fillStyle = '#2a3038';
                ctx.fillRect(x, py, T, 2);
                ctx.fillStyle = '#a0a8b0';
                ctx.fillRect(x + 1, py, 1, 1);
                ctx.fillRect(x + T - 2, py, 1, 1);
                ctx.fillStyle = '#404848';
                ctx.fillRect(x, py + 2, T, 1);
                break;
            }
            case THEME.FOUNDER: case THEME.BOARDROOM: {
                // Chain or rope hitch
                ctx.fillStyle = '#1a1218';
                ctx.fillRect(x + 1, py, T - 2, 2);
                ctx.fillStyle = '#a06028';
                ctx.fillRect(x + 2, py, 2, 1);
                ctx.fillRect(x + T - 4, py, 2, 1);
                break;
            }
            case THEME.KEYNOTE: case THEME.REALITY: {
                // Stage rigging clamp
                ctx.fillStyle = '#1a0820';
                ctx.fillRect(x + 1, py, T - 2, 2);
                ctx.fillStyle = '#c0a040';
                ctx.fillRect(x + 2, py + 1, 1, 1);
                ctx.fillRect(x + T - 3, py + 1, 1, 1);
                break;
            }
            case THEME.CLOUD: {
                // Glowing data-strand connector
                ctx.fillStyle = '#0a2a0a';
                ctx.fillRect(x + 1, py, T - 2, 2);
                const lit = ((this.tileAnimTick + c * 7) & 31) < 18;
                ctx.fillStyle = lit ? '#60ff80' : '#205020';
                ctx.fillRect(cx - 1, py + 1, 2, 1);
                break;
            }
            case THEME.BREAKROOM: {
                // Plastic cable tie
                ctx.fillStyle = '#1a1408';
                ctx.fillRect(x + 1, py, T - 2, 2);
                ctx.fillStyle = '#806020';
                ctx.fillRect(x + 2, py, T - 4, 1);
                break;
            }
        }
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
                    // R324: hash-shuffled tile sampling. Was `(c % xCells) * T`,
                    // which means columns 0, xCells, 2*xCells, ... all sample
                    // the SAME bitmap column — visible vertical-stripe
                    // repetition on levels wider than xCells (48 cells at 768
                    // bitmap / 16 tile). Now picks a sample column via a
                    // cheap deterministic hash of (r, c) so wide levels don't
                    // show identical-tile stripes. Same hash within a frame
                    // means tiles still read as "contiguous material" — no
                    // visible flicker.
                    const xCells = Math.max(1, Math.floor(img.width / T));
                    const bodyH = Math.max(T, img.height - T);
                    const yCells = Math.max(1, Math.floor(bodyH / T));
                    // Mulberry-style cheap hash: keep results deterministic
                    // per (r,c) so tiles don't flicker between frames.
                    const hashC = ((c * 2654435761) ^ (r * 374761393)) >>> 0;
                    const sampleCol = hashC % xCells;
                    const sampleRow = ((hashC >>> 8) % yCells);
                    const srcX = sampleCol * T;
                    const srcY = topIsAir
                        ? 0                                  // top edge — first row of bitmap
                        : T + (sampleRow * T);               // body — hash-picked row in body band
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
            case TILE.PLATFORM: {
                // R311: prefer painted platform sprite when one exists for
                // this theme. Falls through to procedural body + per-theme
                // accent if not registered.
                const platKey = PLATFORM_BITMAP_KEY[this.data.theme];
                const platImg = platKey ? sprites.images.get(platKey) : null;
                if (platImg) {
                    // R326: painted platform strips are NOT guaranteed to be
                    // truly tileable (left edge != right edge). The old
                    // `srcX = (c % xCells) * T` sampler walked the strip
                    // column-by-column, exposing seams whenever the source
                    // had non-tileable detail. New approach: hash (r, c) to
                    // pick a non-edge sample column from the strip. Skipping
                    // the outer ~2 tiles on each side avoids the seam zone
                    // entirely. Same hash within a frame = no flicker.
                    ctx.imageSmoothingEnabled = false;
                    const xCells = Math.max(1, Math.floor(platImg.width / T));
                    // Reserve ~12% margin on each side as "seam zone" we never
                    // sample from. Minimum margin of 1 tile.
                    const margin = Math.max(1, Math.floor(xCells * 0.12));
                    const usableCols = Math.max(1, xCells - margin * 2);
                    // Deterministic hash on (c, r). Same approach as R324
                    // ground tiles.
                    const h = ((c * 2654435761) ^ (r * 374761393)) >>> 0;
                    const srcX = (margin + (h % usableCols)) * T;
                    const srcSampleH = Math.min(platImg.height, Math.max(12, Math.floor(platImg.height * 0.55)));
                    const dstH = 6;
                    ctx.drawImage(platImg, srcX, 0, T, srcSampleH, x, y, T, dstH);
                    // R404: hanging platform decor — theme-appropriate art
                    // drops BELOW the 6px playable top to visually extend
                    // the platform into the empty space. Sells depth +
                    // breaks the "floating brown rectangle" silhouette.
                    // Drawn at sub-tile width with deterministic hash so
                    // not every tile shows decor (sparse look).
                    this._drawPlatformDecor(ctx, x, y, c, r, h);
                } else {
                    // R310: per-theme painted platform — procedural fallback.
                    ctx.fillStyle = pal.platform;
                    ctx.fillRect(x, y, T, 4);
                    ctx.fillStyle = pal.highlight || pal.accent;
                    ctx.fillRect(x, y, T, 1);
                    this._drawPlatformAccent(ctx, x, y, c, r);
                    ctx.fillStyle = pal.plank;
                    ctx.fillRect(x, y + 4, T, 1);
                    ctx.fillStyle = 'rgba(0,0,0,0.4)';
                    ctx.fillRect(x, y + 5, T, 1);
                }
                break;
            }
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
                // R405: theme-appropriate decor at the TOP and BOTTOM of
                // each ladder run — frayed rope wraps, vine curls, cable
                // hitches — so the ladder doesn't look like 3 stacked
                // identical tiles ending in mid-air. Only fires on the
                // FIRST tile (r-1 != ladder) and LAST tile (r+1 != ladder)
                // of a vertical ladder column.
                {
                    const topOfRun = (r === 0) || (this.tiles[r - 1] && this.tiles[r - 1][c] !== TILE.LADDER);
                    const botOfRun = (r === this.tiles.length - 1) || (this.tiles[r + 1] && this.tiles[r + 1][c] !== TILE.LADDER);
                    if (topOfRun) this._drawLadderEndcap(ctx, x, y, c, r, 'top');
                    if (botOfRun) this._drawLadderEndcap(ctx, x, y, c, r, 'bot');
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
                    ctx.globalAlpha = 0.35 + 0.25 * this._frameSinSlow;
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
                // R312: prefer painted cover sprite when available. The
                // sprites are sized ~40 px tall to extend ~24 px above the
                // 16-tile baseline. Falls through to the per-theme procedural
                // render when no asset is registered for the theme.
                // R344: outdoor themes (JUNGLE, FOUNDER, CLOUD, and the
                // apocalypse-bg KEYNOTE stages 20/21) use CAVE sprites
                // instead of indoor objects. Indoor themes keep their
                // doors/podiums/server racks/etc.
                // Apocalypse override: if stage data sets bgKeyOverride
                // to 'bg_apocalypse', use cover_apocalypse regardless of
                // theme (stage 21 helicopter chase is KEYNOTE-themed but
                // visually apocalypse).
                let coverKey;
                if (this.data.bgKeyOverride === 'bg_apocalypse') {
                    coverKey = 'cover_apocalypse';
                } else {
                    coverKey = {
                        [THEME.JUNGLE]:     'cover_jungle',
                        [THEME.BREAKROOM]:  'cover_breakroom',
                        [THEME.SERVERROOM]: 'cover_serverroom',
                        [THEME.KEYNOTE]:    'cover_keynote',
                        [THEME.FOUNDER]:    'cover_founder',
                        [THEME.SEWER]:      'cover_sewer',
                        [THEME.CLOUD]:      'cover_cloud',
                        // R345 note: BOARDROOM + REALITY intentionally fall
                        // through to the procedural branch below, which
                        // draws the painted tile_door at correct full size.
                        // Mapping them here would render tile_door at the
                        // 30-40px cover-sprite scale, which is too tall.
                    }[theme];
                }
                if (coverKey && sprites.has(coverKey)) {
                    const img = sprites.images.get(coverKey);
                    const drawW = img.width;
                    const drawH = img.height;
                    const dx = x + (T - drawW) / 2;
                    const dy = y + T - drawH;
                    ctx.imageSmoothingEnabled = false;
                    // R391: painted covers were drawing flat against busy
                    // painted bgs and reading as featureless black blobs.
                    // User screenshot of stage 1 showed cover_jungle as a
                    // "black vector stand." Add a soft amber rim-light
                    // baked into the sprite via lighter-comp pass + a
                    // gentle bottom-shadow base. Reads as an interactable
                    // object instead of background noise.
                    // Bottom shadow ellipse for grounding
                    ctx.save();
                    ctx.globalAlpha = 0.35;
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    ctx.ellipse(
                        Math.round(dx + drawW / 2),
                        Math.round(dy + drawH),
                        drawW / 2 + 2, 3, 0, 0, Math.PI * 2,
                    );
                    ctx.fill();
                    ctx.restore();
                    // Base sprite
                    ctx.drawImage(img, Math.round(dx), Math.round(dy));
                    // Subtle rim light — paint the silhouette in warm
                    // amber with low alpha and source-atop so only the
                    // sprite's pixels lift, not the surrounding rect.
                    ctx.save();
                    ctx.globalAlpha = 0.18;
                    ctx.globalCompositeOperation = 'lighter';
                    sprites.drawSilhouette(ctx, coverKey, '#a08050', Math.round(dx) - 1, Math.round(dy), false);
                    sprites.drawSilhouette(ctx, coverKey, '#a08050', Math.round(dx) + 1, Math.round(dy), false);
                    sprites.drawSilhouette(ctx, coverKey, '#a08050', Math.round(dx), Math.round(dy) - 1, false);
                    ctx.restore();
                    break;
                }
                // R353: removed the rim-glow fillRect — see painted-path
                // note above. Procedural covers paint their own outline
                // via per-theme branches below.
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
                    // R321 perf: bob uses tileAnimTick — same for every
                    // tile in the frame. Read cached value from draw().
                    const bob = this._tileAnimSinSlow * 2;
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

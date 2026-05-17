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

export const STAGE_LOADERS = [
    null,
    () => makeStage1(),
    () => makeProcStage(THEME.BREAKROOM, 4242),
    () => makeProcStage(THEME.SERVERROOM, 7777),
    () => makeProcStage(THEME.BOARDROOM, 1234),
    () => makeProcStage(THEME.KEYNOTE,    9999),
    () => makeProcStage(THEME.FOUNDER,    5555),
    () => makeProcStage(THEME.SERVERROOM, 1111),
    () => makeProcStage(THEME.CLOUD,      8888),
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

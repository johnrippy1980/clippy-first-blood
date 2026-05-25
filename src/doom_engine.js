// R423: Doom-style free-roam first-person raycaster. SNES-resolution
// (256×224) so it slots into the existing scene pipeline alongside the
// platformer / fps-arena / beat-em-up engines. No WebGL, no build step —
// pure vertical-column raycasting on a 2D tile grid (Wolfenstein 3D era).
//
// Phase 1 (R423a, this file): movement + walls + ceiling/floor + minimap.
// Painted wall textures, enemies-as-billboards, gun HUD, and pickups land
// in follow-up phases.

import { GAME } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { drawText, drawTextOutlined } from './pixelfont.js';

const W = GAME.W;
const H = GAME.H;
const HUD_H = 32;
const VIEW_H = H - HUD_H;
const NUM_COLS = W;                 // one ray per pixel column
const FOV = Math.PI / 3;            // 60° — matches Doom 1
const MOVE_SPEED = 0.06;            // tiles per frame
const STRAFE_SPEED = 0.05;
const TURN_SPEED = 0.045;           // radians per frame

// Wall palette per tile id — flat colors for phase 1 so we can verify the
// raycaster math before sinking painted textures into it. ids 1+ are solid.
//   1 = cubicle divider (grey carpet)
//   2 = exec wall (dark wood)
//   3 = server-room glass (cyan)
//   4 = bathroom tile (white)
//   5 = vending machine (red)
const WALL_LIGHT = {
    1: { ns: '#7a7a82', ew: '#5e5e66' },   // cubicle
    2: { ns: '#624028', ew: '#4a2e1a' },   // exec
    3: { ns: '#5090b0', ew: '#3a7090' },   // glass
    4: { ns: '#d0d0d8', ew: '#a8a8b0' },   // bathroom
    5: { ns: '#c04030', ew: '#902820' },   // vending
};

// Default test map — 16×16 grid, walls around the edges plus a few inner
// dividers so movement + collision are clear from the get-go.
const DEFAULT_MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,1,1,0,0,0,0,2,2,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,2,0,0,1],
    [1,0,0,1,0,0,0,3,3,0,0,0,0,0,0,1],
    [1,0,0,1,0,0,0,0,0,0,0,5,0,0,0,1],
    [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,4,4,4,4,0,0,0,0,0,1],
    [1,0,0,0,0,0,4,0,0,4,0,0,2,2,0,1],
    [1,0,0,0,0,0,4,0,0,0,0,0,2,0,0,1],
    [1,0,0,0,0,0,4,4,4,4,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,1,1,0,0,0,3,3,0,0,0,0,0,1],
    [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

export class DoomEngine {
    constructor(stageData, ctx, game) {
        this.ctx = ctx;
        this.game = game;
        this.data = stageData;
        this.t = 0;

        this.map = stageData.doomMap || DEFAULT_MAP;
        this.mapW = this.map[0].length;
        this.mapH = this.map.length;

        // Find a starting empty tile in the middle area
        let startX = 2.5, startY = 2.5;
        if (stageData.doomStart) {
            startX = stageData.doomStart.x;
            startY = stageData.doomStart.y;
        }
        // Player state (in tile coordinates; angle in radians)
        this.player = {
            x: startX,
            y: startY,
            angle: 0,
            hp: 6,
            maxHp: 6,
            lives: 3,
            iframes: 0,
            score: 0,
            // R418: rage parity with the other engines
            rageFrames: 0,
            rageMaxFrames: 300,
            rageUsedThisStage: false,
        };

        // Z-buffer per column for sprite occlusion in later phases.
        this.zbuffer = new Float32Array(NUM_COLS);
    }

    update() {
        this.t++;
        this._tickPlayer();
    }

    _tickPlayer() {
        const ax = input.axis();
        const p = this.player;
        const rageMul = p.rageFrames > 0 ? 1.5 : 1;
        // Turn with left/right
        if (ax.x < -0.1) p.angle -= TURN_SPEED * rageMul;
        else if (ax.x > 0.1) p.angle += TURN_SPEED * rageMul;
        // Forward/back with up/down — collision-aware
        if (Math.abs(ax.y) > 0.1) {
            const sp = MOVE_SPEED * rageMul * (ax.y < 0 ? 1 : -0.7);
            const dx = Math.cos(p.angle) * sp;
            const dy = Math.sin(p.angle) * sp;
            this._moveBy(dx, dy);
        }
        // Strafe with Q/E (mapped via custom keymap later); for now hold
        // shift for strafe-instead-of-turn so it's playable with axis-only.
        if (input.isHeld?.('shoot')) {
            // Placeholder for future fire
        }
        if (p.rageFrames > 0) p.rageFrames--;
        if (p.iframes > 0) p.iframes--;
    }

    _moveBy(dx, dy) {
        const p = this.player;
        const PAD = 0.18;
        // X axis
        const nx = p.x + dx;
        const checkX = nx + (dx > 0 ? PAD : -PAD);
        if (!this._solidAt(checkX, p.y)) p.x = nx;
        // Y axis
        const ny = p.y + dy;
        const checkY = ny + (dy > 0 ? PAD : -PAD);
        if (!this._solidAt(p.x, checkY)) p.y = ny;
    }

    _solidAt(x, y) {
        const mx = Math.floor(x);
        const my = Math.floor(y);
        if (mx < 0 || my < 0 || mx >= this.mapW || my >= this.mapH) return true;
        return (this.map[my][mx] || 0) > 0;
    }

    draw() {
        const ctx = this.ctx;
        // Sky/ceiling band — dim grey-blue to suggest fluorescent panels
        ctx.fillStyle = '#283040';
        ctx.fillRect(0, 0, W, VIEW_H / 2);
        // Floor band — commercial carpet brown
        ctx.fillStyle = '#3a2c20';
        ctx.fillRect(0, VIEW_H / 2, W, VIEW_H / 2);

        this._raycast();
        this._drawHud();
        this._drawMinimap();
    }

    _raycast() {
        const ctx = this.ctx;
        const p = this.player;
        for (let col = 0; col < NUM_COLS; col++) {
            // Map column to camera plane x in [-1, 1]
            const cameraX = 2 * col / NUM_COLS - 1;
            const rayAngle = p.angle + cameraX * (FOV / 2);
            const rayDirX = Math.cos(rayAngle);
            const rayDirY = Math.sin(rayAngle);
            // DDA setup
            let mapX = Math.floor(p.x);
            let mapY = Math.floor(p.y);
            const deltaX = Math.abs(1 / (rayDirX || 1e-9));
            const deltaY = Math.abs(1 / (rayDirY || 1e-9));
            let stepX, stepY, sideX, sideY;
            if (rayDirX < 0) { stepX = -1; sideX = (p.x - mapX) * deltaX; }
            else             { stepX =  1; sideX = (mapX + 1 - p.x) * deltaX; }
            if (rayDirY < 0) { stepY = -1; sideY = (p.y - mapY) * deltaY; }
            else             { stepY =  1; sideY = (mapY + 1 - p.y) * deltaY; }
            // Step until we hit a wall
            let hit = 0;
            let side = 0;
            let cell = 0;
            for (let i = 0; i < 64; i++) {
                if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
                else               { sideY += deltaY; mapY += stepY; side = 1; }
                if (mapX < 0 || mapY < 0 || mapX >= this.mapW || mapY >= this.mapH) { hit = 1; cell = 1; break; }
                cell = this.map[mapY][mapX] || 0;
                if (cell > 0) { hit = 1; break; }
            }
            if (!hit) { this.zbuffer[col] = 999; continue; }
            // Perpendicular distance (avoids fisheye)
            const dist = (side === 0)
                ? (sideX - deltaX)
                : (sideY - deltaY);
            this.zbuffer[col] = dist;
            const lineH = Math.min(VIEW_H * 4, Math.abs(VIEW_H / Math.max(0.0001, dist)));
            const drawStart = Math.max(0, (VIEW_H - lineH) / 2 | 0);
            const drawEnd = Math.min(VIEW_H - 1, (VIEW_H + lineH) / 2 | 0);
            const pal = WALL_LIGHT[cell] || WALL_LIGHT[1];
            let col_color = (side === 1) ? pal.ew : pal.ns;
            // Distance fade — gets dim past ~6 tiles
            const fade = Math.max(0.25, 1 - dist / 8);
            col_color = this._tintHex(col_color, fade);
            ctx.fillStyle = col_color;
            ctx.fillRect(col, drawStart, 1, drawEnd - drawStart);
        }
    }

    // Multiply a #rrggbb hex by a 0..1 factor.
    _tintHex(hex, k) {
        const r = parseInt(hex.slice(1, 3), 16) * k | 0;
        const g = parseInt(hex.slice(3, 5), 16) * k | 0;
        const b = parseInt(hex.slice(5, 7), 16) * k | 0;
        return `rgb(${r},${g},${b})`;
    }

    _drawHud() {
        const ctx = this.ctx;
        const y = H - HUD_H;
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, y, W, HUD_H);
        ctx.fillStyle = '#404048';
        ctx.fillRect(0, y, W, 1);
        // HP bar bottom-left
        const p = this.player;
        for (let i = 0; i < p.maxHp; i++) {
            ctx.fillStyle = i < p.hp ? '#ff4040' : '#400808';
            ctx.fillRect(6 + i * 7, y + 6, 5, 8);
        }
        drawText(ctx, 'CLIPPY: FLOOR 11', 6, y + 18, '#a0a0b0', 1, 'left');
        // Right side — placeholder ammo
        drawText(ctx, 'MG ∞', W - 6, y + 8, '#ffe070', 1, 'right');
    }

    _drawMinimap() {
        const ctx = this.ctx;
        const SIZE = 4;   // px per tile
        const ox = W - this.mapW * SIZE - 4;
        const oy = 4;
        // Background panel
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(ox - 2, oy - 2, this.mapW * SIZE + 4, this.mapH * SIZE + 4);
        for (let my = 0; my < this.mapH; my++) {
            for (let mx = 0; mx < this.mapW; mx++) {
                const cell = this.map[my][mx];
                if (cell > 0) {
                    ctx.fillStyle = (WALL_LIGHT[cell] || WALL_LIGHT[1]).ns;
                    ctx.fillRect(ox + mx * SIZE, oy + my * SIZE, SIZE, SIZE);
                }
            }
        }
        // Player dot + facing
        const p = this.player;
        const px = ox + p.x * SIZE;
        const py = oy + p.y * SIZE;
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(px - 1, py - 1, 2, 2);
        const tx = px + Math.cos(p.angle) * 5;
        const ty = py + Math.sin(p.angle) * 5;
        ctx.strokeStyle = '#ffe070';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();
    }
}

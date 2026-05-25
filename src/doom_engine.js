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
            // R423b: weapon inventory. mg/shotgun/chainsaw/bfg. Only mg owned
            // at spawn; pickups grant the others. weaponIdx is the active slot.
            weapons: {
                mg:       { owned: true,  cooldown: 0, rate: 4,  ammo: Infinity, name: 'MG' },
                shotgun:  { owned: false, cooldown: 0, rate: 28, ammo: 0,        name: 'SHOTGUN' },
                chainsaw: { owned: false, cooldown: 0, rate: 6,  ammo: Infinity, name: 'CHAINSAW' },
                bfg:      { owned: false, cooldown: 0, rate: 90, ammo: 0,        name: 'BFG' },
            },
            weaponIdx: 0,   // 0=mg, 1=shotgun, 2=chainsaw, 3=bfg
            muzzleFlash: 0, // counts down; > 0 = draw flash overlay
        };

        // Z-buffer per column for sprite occlusion in later phases.
        this.zbuffer = new Float32Array(NUM_COLS);

        // R423b: click-to-lock-mouse. Listener installed once; the engine
        // owns the canvas listener so other scenes aren't affected (the
        // pointer is auto-released on scene change).
        this._installPointerLockOnce();
    }

    _installPointerLockOnce() {
        if (typeof document === 'undefined') return;
        if (DoomEngine._lockListenerInstalled) return;
        const canvas = document.getElementById('screen');
        if (!canvas) return;
        canvas.addEventListener('click', () => {
            // Only request when a Doom scene is the active engine; cheap
            // guard so we don't capture pointer in other scenes.
            const g = (typeof window !== 'undefined') ? window.__game : null;
            if (g && g._doomEngine && g.scene === 'doomPlay') {
                input.requestPointerLock?.();
            }
        });
        DoomEngine._lockListenerInstalled = true;
    }

    update() {
        this.t++;
        this._tickPlayer();
    }

    _tickPlayer() {
        const ax = input.axis();
        const p = this.player;
        const rageMul = p.rageFrames > 0 ? 1.5 : 1;
        // R423b: modern Doom controls.
        //  W/S = forward/back (axis.y, negative = up = forward)
        //  A/D = STRAFE left/right (axis.x)
        //  Mouse X = turn (yaw)
        // Mouse-look — consume delta. Scaled so a slow drag turns naturally.
        const md = input.getMouseDelta?.() || { dx: 0, dy: 0 };
        if (md.dx) p.angle += md.dx * 0.0035 * rageMul;
        // Forward/back (along view vector)
        if (Math.abs(ax.y) > 0.1) {
            const sp = MOVE_SPEED * rageMul * (ax.y < 0 ? 1 : -0.7);
            this._moveBy(Math.cos(p.angle) * sp, Math.sin(p.angle) * sp);
        }
        // Strafe (perpendicular to view vector)
        if (Math.abs(ax.x) > 0.1) {
            const sp = STRAFE_SPEED * rageMul * (ax.x > 0 ? 1 : -1);
            // Right perpendicular = (cos(a+90°), sin(a+90°)) = (-sin a, cos a)
            this._moveBy(-Math.sin(p.angle) * sp, Math.cos(p.angle) * sp);
        }
        // Weapon switching: 1/2/3/4 keys mapped via raw event listener
        // (input.js doesn't have these in KEYMAP). Check window event flags.
        this._pollWeaponSwitch();
        // Fire on shoot held (cooldown gated)
        const w = this._activeWeapon();
        if (w.cooldown > 0) w.cooldown--;
        if (input.isHeld?.('shoot') && w.cooldown <= 0 && w.owned && (w.ammo > 0 || w.ammo === Infinity)) {
            this._fire();
        }
        if (p.muzzleFlash > 0) p.muzzleFlash--;
        if (p.rageFrames > 0) p.rageFrames--;
        if (p.iframes > 0) p.iframes--;
    }

    _activeWeapon() {
        const keys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
        return this.player.weapons[keys[this.player.weaponIdx]];
    }

    _pollWeaponSwitch() {
        // Install one-time number-key listener that flags a pending switch.
        if (!this._numListener) {
            this._numListener = true;
            this._pendingSwitch = null;
            window.addEventListener('keydown', (e) => {
                if (e.key === '1') this._pendingSwitch = 0;
                else if (e.key === '2') this._pendingSwitch = 1;
                else if (e.key === '3') this._pendingSwitch = 2;
                else if (e.key === '4') this._pendingSwitch = 3;
            });
        }
        if (this._pendingSwitch != null) {
            const keys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
            const w = this.player.weapons[keys[this._pendingSwitch]];
            if (w && w.owned) {
                this.player.weaponIdx = this._pendingSwitch;
                audio.sfx?.('select');
            }
            this._pendingSwitch = null;
        }
    }

    _fire() {
        const p = this.player;
        const w = this._activeWeapon();
        w.cooldown = w.rate;
        if (w.ammo !== Infinity) w.ammo--;
        p.muzzleFlash = 5;
        // Per-weapon SFX cue. Painted gun art will replace these flat
        // beats later; for now the audio carries the differentiation.
        if (w === p.weapons.mg)       audio.sfx?.('mg');
        else if (w === p.weapons.shotgun)  audio.sfx?.('explode');
        else if (w === p.weapons.chainsaw) audio.sfx?.('hit');
        else if (w === p.weapons.bfg)      audio.sfx?.('powerup');
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
        this._drawWeapon();
        this._drawHud();
        this._drawMinimap();
    }

    // R423b: first-person weapon view + muzzle flash overlay. For now a
    // vector approximation (grey gun barrel, white flash). Painted gun
    // frames swap in later via this same draw position.
    _drawWeapon() {
        const ctx = this.ctx;
        const p = this.player;
        const w = this._activeWeapon();
        // Gun sits bottom-center. Different silhouette per weapon so the
        // active gun reads even before painted art lands.
        const baseY = VIEW_H - 4;
        ctx.save();
        ctx.fillStyle = '#181820';
        if (w === p.weapons.mg) {
            // MG: thin horizontal barrel + receiver block
            ctx.fillRect(W / 2 - 22, baseY - 18, 44, 18);
            ctx.fillStyle = '#404048';
            ctx.fillRect(W / 2 - 4, baseY - 30, 8, 16);
        } else if (w === p.weapons.shotgun) {
            // Shotgun: short fat double-barrel
            ctx.fillRect(W / 2 - 26, baseY - 22, 52, 22);
            ctx.fillStyle = '#5e2818';
            ctx.fillRect(W / 2 - 26, baseY - 8, 52, 8);   // wood stock
            ctx.fillStyle = '#202028';
            ctx.fillRect(W / 2 - 6, baseY - 34, 12, 14);  // dual barrels
        } else if (w === p.weapons.chainsaw) {
            // Chainsaw: vertical blade with teeth
            ctx.fillRect(W / 2 - 16, baseY - 28, 32, 28);
            ctx.fillStyle = '#a0a0a8';
            ctx.fillRect(W / 2 - 4, baseY - 56, 8, 28);
            ctx.fillStyle = '#ffe070';
            for (let i = 0; i < 7; i++) {
                ctx.fillRect(W / 2 - 5, baseY - 54 + i * 4, 2, 2);
                ctx.fillRect(W / 2 + 3, baseY - 54 + i * 4, 2, 2);
            }
        } else if (w === p.weapons.bfg) {
            // BFG: huge green-glowing barrel block
            ctx.fillRect(W / 2 - 32, baseY - 30, 64, 30);
            ctx.fillStyle = '#206030';
            ctx.fillRect(W / 2 - 12, baseY - 44, 24, 18);
            ctx.fillStyle = '#80ff80';
            ctx.fillRect(W / 2 - 6, baseY - 38, 12, 8);
        }
        ctx.restore();
        // Muzzle flash — radial white-yellow burst at barrel tip
        if (p.muzzleFlash > 0) {
            const fT = p.muzzleFlash / 5;
            const fx = W / 2;
            const fy = (w === p.weapons.bfg) ? baseY - 36 :
                       (w === p.weapons.shotgun) ? baseY - 30 :
                       (w === p.weapons.chainsaw) ? baseY - 50 :
                       baseY - 24;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.85 * fT;
            const r = 18 * fT + 4;
            const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
            grad.addColorStop(0, w === p.weapons.bfg ? '#a0ff80' : '#ffffff');
            grad.addColorStop(0.4, w === p.weapons.bfg ? '#50d040' : '#ffd060');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(fx, fy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
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
        drawText(ctx, this.data.name || 'FLOOR 11', 6, y + 18, '#a0a0b0', 1, 'left');
        // Right side — active weapon + ammo
        const w = this._activeWeapon();
        const ammoStr = w.ammo === Infinity ? '∞' : String(w.ammo);
        drawText(ctx, `${w.name} ${ammoStr}`, W - 6, y + 8, '#ffe070', 1, 'right');
        // Weapon slots 1-4: dim = unowned, bright = owned, yellow = active
        const keys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
        for (let i = 0; i < 4; i++) {
            const w2 = this.player.weapons[keys[i]];
            const isActive = (this.player.weaponIdx === i);
            const col = isActive ? '#ffe070' : (w2.owned ? '#a0a0b8' : '#404048');
            drawText(ctx, String(i + 1), W - 96 + i * 22, y + 18, col, 1, 'left');
        }
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

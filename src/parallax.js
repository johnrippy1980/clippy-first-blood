// Multi-layer parallax + foreground decoration. Drawn in this order:
//   sky → far → mid → near (game objects sit between near and FG)
//   ...gameplay layer (level, enemies, player)...
//   foreground (water, smoke, grass tufts) — drawn AFTER player

import { GAME, THEME } from './constants.js';

export class Parallax {
    constructor() {
        this.theme = THEME.JUNGLE;
        this.t = 0;
    }
    setTheme(theme) { this.theme = theme; this.t = 0; }
    update() { this.t++; }

    // --- Sky / back layers (drawn first) ---
    drawBack(ctx, camera) {
        switch (this.theme) {
            case THEME.JUNGLE:     this._jungleBack(ctx, camera); break;
            case THEME.BREAKROOM:  this._breakroomBack(ctx, camera); break;
            case THEME.SERVERROOM: this._serverroomBack(ctx, camera); break;
            case THEME.BOARDROOM:  this._boardroomBack(ctx, camera); break;
            case THEME.KEYNOTE:    this._keynoteBack(ctx, camera); break;
            case THEME.FOUNDER:    this._founderBack(ctx, camera); break;
            case THEME.CLOUD:      this._cloudBack(ctx, camera); break;
        }
    }

    // --- Foreground layer (drawn LAST, in front of player) ---
    drawFront(ctx, camera) {
        switch (this.theme) {
            case THEME.JUNGLE:     this._jungleFront(ctx, camera); break;
            case THEME.BREAKROOM:  this._breakroomFront(ctx, camera); break;
            case THEME.SERVERROOM: this._serverroomFront(ctx, camera); break;
            case THEME.BOARDROOM:  this._boardroomFront(ctx, camera); break;
            case THEME.KEYNOTE:    this._keynoteFront(ctx, camera); break;
            case THEME.FOUNDER:    this._founderFront(ctx, camera); break;
            case THEME.CLOUD:      this._cloudFront(ctx, camera); break;
        }
    }

    _gradient(ctx, top, mid, bot) {
        const half = (GAME.H * 0.55) | 0;
        const grad = (GAME.H * 0.85) | 0;
        for (let y = 0; y < GAME.H; y++) {
            ctx.fillStyle = y < half ? top : (y < grad ? mid : bot);
            ctx.fillRect(0, y, GAME.W, 1);
        }
    }

    // ===================== JUNGLE =====================
    _jungleBack(ctx, camera) {
        this._gradient(ctx, '#1a0820', '#5a1830', '#a04030');

        // Moon
        ctx.fillStyle = '#d8c8a0';
        ctx.fillRect(GAME.W - 50, 30, 14, 14);
        ctx.fillStyle = '#a08868';
        ctx.fillRect(GAME.W - 48, 32, 4, 2);
        ctx.fillRect(GAME.W - 42, 38, 3, 3);

        // Far skyline (slow scroll)
        ctx.fillStyle = '#100410';
        const ox1 = (camera.viewX * 0.08) | 0;
        for (let i = 0; i < 16; i++) {
            const x = ((i * 30 - ox1) % (GAME.W + 120) + GAME.W + 120) % (GAME.W + 120) - 60;
            const h = 28 + ((i * 17) % 32);
            ctx.fillRect(x, GAME.H - 90 - h, 22, h);
            // window dots
            const lit = ((i + Math.floor(this.t / 30)) | 0) % 5;
            for (let wy = 0; wy < h - 6; wy += 7) {
                ctx.fillStyle = lit === wy / 7 % 5 ? '#a08040' : '#1a0a18';
                ctx.fillRect(x + 4,  GAME.H - 90 - h + wy + 4, 1, 1);
                ctx.fillRect(x + 10, GAME.H - 90 - h + wy + 4, 1, 1);
                ctx.fillRect(x + 16, GAME.H - 90 - h + wy + 4, 1, 1);
            }
            ctx.fillStyle = '#100410';
        }

        // Mid-ground tree silhouettes
        const ox2 = (camera.viewX * 0.32) | 0;
        for (let i = 0; i < 18; i++) {
            const x = ((i * 26 - ox2) % (GAME.W + 60) + GAME.W + 60) % (GAME.W + 60) - 30;
            const h = 30 + ((i * 13) % 16);
            ctx.fillStyle = '#08200a';
            ctx.fillRect(x + 7, GAME.H - 64, 4, h - 26);
            ctx.fillStyle = '#0a3010';
            ctx.fillRect(x, GAME.H - 64 - 22, 16, 22);
            ctx.fillRect(x - 2, GAME.H - 64 - 18, 20, 14);
        }
    }
    _jungleFront(ctx, camera) {
        // Foreground grass tufts that sway
        const ox = camera.viewX | 0;
        ctx.fillStyle = '#0a3010';
        for (let i = -3; i < 30; i++) {
            const wx = i * 28 + ((this.t * 5) % 28);
            const sx = wx - ox % 28;
            if (sx < -20 || sx > GAME.W + 20) continue;
            const sway = Math.sin(this.t / 14 + i) * 1.5 | 0;
            const baseY = GAME.H - 14;
            for (let g = 0; g < 4; g++) {
                ctx.fillRect(sx + g * 2 + sway, baseY - g, 1, 3 + g);
            }
        }
    }

    // ===================== BREAKROOM =====================
    _breakroomBack(ctx, camera) {
        this._gradient(ctx, '#101018', '#2a1830', '#503040');
        // Vending machine row
        const ox = (camera.viewX * 0.22) | 0;
        for (let i = 0; i < 10; i++) {
            const x = ((i * 40 - ox) % (GAME.W + 80) + GAME.W + 80) % (GAME.W + 80) - 40;
            ctx.fillStyle = '#80101a'; ctx.fillRect(x, GAME.H - 110, 28, 70);
            ctx.fillStyle = '#1a0a18'; ctx.fillRect(x + 4, GAME.H - 100, 20, 36);
            ctx.fillStyle = '#ffe070'; ctx.fillRect(x + 8, GAME.H - 96, 12, 2);
            ctx.fillStyle = '#a01020'; ctx.fillRect(x + 8, GAME.H - 80, 4, 4);
            ctx.fillStyle = '#403040'; ctx.fillRect(x + 6, GAME.H - 60, 16, 4);
        }
    }
    _breakroomFront(ctx, camera) {
        // Steam from coffee — drift up
        for (let i = 0; i < 30; i++) {
            const x = ((i * 23 + this.t * 0.3) | 0) % GAME.W;
            const y = (Math.sin(this.t / 30 + i) * 8 + GAME.H - 50 - (this.t / 4 + i * 7) % 80) | 0;
            ctx.fillStyle = `rgba(200,200,220,${0.18 - (i % 5) * 0.02})`;
            ctx.fillRect(x, y, 2, 2);
        }
    }

    // ===================== SERVERROOM =====================
    _serverroomBack(ctx, camera) {
        ctx.fillStyle = '#040408'; ctx.fillRect(0, 0, GAME.W, GAME.H);
        const ox = (camera.viewX * 0.3) | 0;
        for (let i = 0; i < 14; i++) {
            const x = ((i * 32 - ox) % (GAME.W + 60) + GAME.W + 60) % (GAME.W + 60) - 30;
            ctx.fillStyle = '#101020'; ctx.fillRect(x, 30, 22, GAME.H - 70);
            for (let r = 0; r < 22; r++) {
                const on = ((i * 7 + r + Math.floor(this.t / 8)) * 11) % 17 < 8;
                ctx.fillStyle = on ? '#40c040' : ((r + i) % 5 === 0 ? '#a01020' : '#1a1a2a');
                ctx.fillRect(x + 3, 38 + r * 6, 2, 2);
                ctx.fillStyle = '#1a1a2a';
                ctx.fillRect(x + 16, 38 + r * 6, 2, 2);
            }
        }
    }
    _serverroomFront(ctx, camera) {
        // Cable shadows + occasional spark
        if ((this.t % 90) < 4) {
            const sx = (this.t * 7) % GAME.W;
            ctx.fillStyle = '#fff'; ctx.fillRect(sx, 40 + (this.t % 80), 2, 2);
        }
    }

    // ===================== BOARDROOM =====================
    _boardroomBack(ctx, camera) {
        this._gradient(ctx, '#180810', '#301820', '#503030');
        ctx.fillStyle = '#3a1810';
        ctx.fillRect(0, GAME.H - 70, GAME.W, 70);
        const ox = (camera.viewX * 0.4) | 0;
        for (let i = 0; i < 8; i++) {
            const x = ((i * 60 - ox) % (GAME.W + 100) + GAME.W + 100) % (GAME.W + 100) - 50;
            ctx.fillStyle = '#403018'; ctx.fillRect(x, 30, 40, 80);
            ctx.fillStyle = '#a05030'; ctx.fillRect(x + 18, 30, 4, 80); ctx.fillRect(x, 68, 40, 4);
            // Sky outside windows
            ctx.fillStyle = '#1a0810';
            ctx.fillRect(x + 2,  32, 16, 34);
            ctx.fillRect(x + 22, 32, 16, 34);
            ctx.fillRect(x + 2,  72, 16, 34);
            ctx.fillRect(x + 22, 72, 16, 34);
        }
    }
    _boardroomFront(ctx, camera) {
        // Dust motes
        for (let i = 0; i < 12; i++) {
            const x = (i * 27 + this.t * 0.2) % GAME.W;
            const y = (i * 31 + Math.sin(this.t / 50 + i) * 6) % GAME.H;
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(x | 0, y | 0, 1, 1);
        }
    }

    // ===================== KEYNOTE =====================
    _keynoteBack(ctx, camera) {
        this._gradient(ctx, '#080010', '#100820', '#201030');
        for (let i = 0; i < 5; i++) {
            const x = 40 + i * 48;
            ctx.fillStyle = '#403040'; ctx.fillRect(x, 0, 6, 16);
            ctx.fillStyle = '#a08060'; ctx.fillRect(x - 2, 8, 10, 4);
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = '#ffe070';
            for (let y = 12; y < GAME.H; y++) {
                const w = (y - 12) * 0.5 + 4;
                ctx.fillRect(x + 3 - w / 2, y, w, 1);
            }
            ctx.globalAlpha = 1;
        }
    }
    _keynoteFront(ctx, camera) {
        // Confetti drifting
        for (let i = 0; i < 12; i++) {
            const x = (i * 23 + this.t * 0.6) % GAME.W;
            const y = (i * 17 + this.t * 0.4) % GAME.H;
            ctx.fillStyle = i % 4 === 0 ? '#ff6080' : (i % 4 === 1 ? '#80c0ff' : (i % 4 === 2 ? '#a0ff60' : '#ffe060'));
            ctx.fillRect(x | 0, y | 0, 2, 2);
        }
    }

    // ===================== FOUNDER =====================
    _founderBack(ctx, camera) {
        this._gradient(ctx, '#000000', '#100008', '#200818');
        const ox = (camera.viewX * 0.15) | 0;
        for (let i = 0; i < 22; i++) {
            const x = ((i * 22 - ox) % (GAME.W + 40) + GAME.W + 40) % (GAME.W + 40) - 20;
            const h = 30 + ((i * 23) % 40);
            ctx.fillStyle = '#1a0810';
            ctx.fillRect(x, GAME.H - 70 - h, 14, h);
        }
        for (let i = 0; i < 40; i++) {
            const fx = (i * 9 + this.t * 2) % GAME.W;
            const fy = GAME.H - 70 - (Math.sin(this.t / 20 + i) * 4 + 6);
            ctx.fillStyle = i % 3 === 0 ? '#a02018' : '#601008';
            ctx.fillRect(fx, fy, 1, 4);
        }
    }
    _founderFront(ctx, camera) {
        // Ash falling
        for (let i = 0; i < 25; i++) {
            const x = (i * 37 + this.t * 0.5) % GAME.W;
            const y = (i * 19 + this.t * 0.7) % GAME.H;
            ctx.fillStyle = `rgba(${100 + (i%3)*20},${30 + (i%2)*10},20,${0.6})`;
            ctx.fillRect(x | 0, y | 0, 1, 1);
        }
    }

    // ===================== CLOUD =====================
    _cloudBack(ctx, camera) {
        ctx.fillStyle = '#000408'; ctx.fillRect(0, 0, GAME.W, GAME.H);
        for (let c = 0; c < 16; c++) {
            const cx = c * 16;
            const seed = c * 7;
            for (let r = 0; r < GAME.H / 8; r++) {
                const v = (seed + r * 3 + Math.floor(this.t / 4)) % 24;
                if (v < 2) ctx.fillStyle = '#7af0ff';
                else if (v < 6) ctx.fillStyle = '#1a4060';
                else continue;
                ctx.fillRect(cx, r * 8, 1, 6);
            }
        }
    }
    _cloudFront(ctx, camera) {
        // Glow lines
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#7af0ff';
        for (let i = 0; i < 3; i++) {
            const y = (this.t * (1 + i) * 0.7) % GAME.H;
            ctx.fillRect(0, y | 0, GAME.W, 1);
        }
        ctx.globalAlpha = 1;
    }
}

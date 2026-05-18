// Multi-layer painted parallax + animated foreground.
//
// Layer order per theme:
//   sky gradient → far skyline (0.08x) → mid silhouettes (0.32x) → near (0.6x)
//   ...gameplay...
//   foreground (0.95x or static) — drawn AFTER player
//
// Trees + foliage SWAY via per-instance phase offsets so the scene reads
// as alive even when the player stands still. Water layers use horizontal
// shimmer bands. Foreground gets parallax 0.95-1.05x so it actually moves
// faster than the player and reinforces depth.

import { GAME, THEME, AMBIENT } from './constants.js';
import { sprites } from './sprites.js';
import { audio } from './audio.js';

const BG_KEY_FOR_THEME = {
    [THEME.JUNGLE]:     'bg_jungle',
    [THEME.BREAKROOM]:  'bg_breakroom',
    [THEME.SERVERROOM]: 'bg_serverroom',
    [THEME.BOARDROOM]:  'bg_boardroom',
    [THEME.KEYNOTE]:    'bg_keynote',
    [THEME.FOUNDER]:    'bg_founder',
    [THEME.CLOUD]:      'bg_cloud',
};

export class Parallax {
    constructor() {
        this.theme = THEME.JUNGLE;
        this.t = 0;
        // Ambient: bat flock state. Triggers periodically in dark themes.
        this.batFlock = null;
        this.batCooldown = AMBIENT.BAT_INITIAL_WARMUP_F;
        this.owlRoosts = [];
        this.owlHootCooldown = 0;
        // Atmospheric motes — per-stage thin drifting particles that
        // animate the painted bgs (dust, steam, embers, data sparks…).
        this.motes = [];
        this._spawnMotes();
    }
    setTheme(theme) {
        this.theme = theme;
        this.t = 0;
        this.batFlock = null;
        this.batCooldown = AMBIENT.BAT_INITIAL_WARMUP_F;
        this.owlRoosts = [];
        this.owlHootCooldown = AMBIENT.OWL_HOOT_INITIAL_F;
        this._spawnMotes();
    }

    // Per-theme atmospheric motes spec. drift = pixel/frame, jitter = wobble.
    // Drawn additively over the painted bg before player/enemies, so they
    // read as "air in the room" not particles in front of gameplay.
    _moteSpec() {
        switch (this.theme) {
            case THEME.JUNGLE:     return { count: 10, color: '#9aa8ff', size: 1, drift: 0.18, vyMin: -0.10, vyMax:  0.10, jitter: 0.4, alpha: 0.42 };
            case THEME.BREAKROOM:  return { count: 8,  color: '#ffb070', size: 1, drift: 0.25, vyMin: -0.30, vyMax: -0.05, jitter: 0.6, alpha: 0.32 }; // rising steam wisps
            case THEME.SERVERROOM: return { count: 12, color: '#80c0ff', size: 1, drift: 0.30, vyMin: -0.05, vyMax:  0.05, jitter: 0.2, alpha: 0.52 }; // horizontal data motes
            case THEME.BOARDROOM:  return { count: 7,  color: '#ffd070', size: 1, drift: 0.10, vyMin:  0.02, vyMax:  0.08, jitter: 0.5, alpha: 0.38 }; // gold dust falling
            case THEME.KEYNOTE:    return { count: 9,  color: '#a070ff', size: 1, drift: 0.14, vyMin: -0.04, vyMax:  0.06, jitter: 0.4, alpha: 0.34 }; // stage haze
            case THEME.FOUNDER:    return { count: 14, color: '#ff7040', size: 1, drift: 0.20, vyMin: -0.35, vyMax: -0.10, jitter: 0.5, alpha: 0.56 }; // rising embers
            case THEME.CLOUD:      return { count: 8,  color: '#a0ffff', size: 1, drift: 0.35, vyMin: -0.06, vyMax:  0.04, jitter: 0.3, alpha: 0.44 }; // wisp cloud puffs
            default: return null;
        }
    }

    _spawnMotes() {
        this.motes.length = 0;
        const s = this._moteSpec();
        if (!s) return;
        for (let i = 0; i < s.count; i++) {
            this.motes.push({
                x: Math.random() * GAME.W,
                y: Math.random() * GAME.H,
                vx: (s.drift || 0) * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8),
                vy: (s.vyMin || 0) + Math.random() * ((s.vyMax || 0) - (s.vyMin || 0)),
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    _updateMotes() {
        const s = this._moteSpec();
        if (!s) return;
        for (const m of this.motes) {
            m.x += m.vx + Math.sin((this.t + m.phase * 30) * 0.04) * s.jitter * 0.3;
            m.y += m.vy;
            // Wrap horizontally + reseed Y when off-screen vertically
            if (m.x < -4) m.x = GAME.W + 4;
            if (m.x > GAME.W + 4) m.x = -4;
            if (m.y < -4) { m.y = GAME.H + 4; m.x = Math.random() * GAME.W; }
            if (m.y > GAME.H + 4) { m.y = -4; m.x = Math.random() * GAME.W; }
        }
    }

    _drawMotes(ctx) {
        const s = this._moteSpec();
        if (!s) return;
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        for (const m of this.motes) {
            ctx.fillRect(m.x | 0, m.y | 0, s.size, s.size);
        }
        ctx.restore();
    }
    setOwlRoosts(roosts) { this.owlRoosts = roosts || []; }
    update(playerWorldX = null, playerWorldY = null) {
        this.t++;
        // Bat flocks only in dark/jungle themes — feels wrong in office break room
        const isDarkTheme = this.theme === THEME.JUNGLE || this.theme === THEME.FOUNDER;
        if (isDarkTheme) this._updateBats();
        if (isDarkTheme) this._updateOwls(playerWorldX, playerWorldY);
        this._updateMotes();
    }

    _updateBats() {
        if (this.batFlock) {
            // Animate existing flock; remove when off-screen
            const f = this.batFlock;
            f.t++;
            let anyOnScreen = false;
            for (const b of f.members) {
                b.x += b.vx;
                b.y = b.baseY + Math.sin((f.t + b.phase) * 0.18) * 14;
                if (b.x > -20 && b.x < GAME.W + 20) anyOnScreen = true;
            }
            // Chitter periodically during flyover
            if (f.t % AMBIENT.BAT_CHITTER_PERIOD_F === 0) audio.sfx('batChitter');
            if (!anyOnScreen && f.t > 120) this.batFlock = null;
        } else {
            this.batCooldown--;
            if (this.batCooldown <= 0) {
                // Spawn a flock from the left or right offscreen edge
                const fromLeft = Math.random() < 0.5;
                const count = 4 + Math.floor(Math.random() * 4);
                const members = [];
                for (let i = 0; i < count; i++) {
                    members.push({
                        x: (fromLeft ? -20 : GAME.W + 20) + i * 8 * (fromLeft ? -1 : 1),
                        baseY: 30 + Math.random() * 60,
                        vx: (fromLeft ? 1 : -1) * (0.8 + Math.random() * 0.4),
                        phase: i * 7,
                        size: 1 + (Math.random() < 0.4 ? 1 : 0),
                    });
                }
                this.batFlock = { members, t: 0 };
                const gap = AMBIENT.BAT_FLOCK_GAP_MIN_F;
                const span = AMBIENT.BAT_FLOCK_GAP_MAX_F - AMBIENT.BAT_FLOCK_GAP_MIN_F;
                this.batCooldown = gap + Math.random() * span;
            }
        }
    }

    _updateOwls(px, py) {
        if (px == null) return;
        this.owlHootCooldown--;
        // Clear pending hoot from last frame
        this.pendingHoots = null;
        const NEAR2 = AMBIENT.OWL_NEAR_RADIUS * AMBIENT.OWL_NEAR_RADIUS;
        for (const owl of this.owlRoosts) {
            const dx = px - owl.x, dy = py - owl.y;
            owl.near = (dx * dx + dy * dy) < NEAR2;
            if (owl.near) {
                owl.glow = Math.min(1, (owl.glow || 0) + 0.04);
                if (this.owlHootCooldown <= 0 && Math.random() < AMBIENT.OWL_HOOT_PROB) {
                    audio.sfx('owlHoot');
                    this.owlHootCooldown = AMBIENT.OWL_HOOT_COOLDOWN_F;
                    // Emit event for game to consume — enemies pause when an owl calls
                    (this.pendingHoots ||= []).push({ x: owl.x, y: owl.y });
                }
            } else {
                owl.glow = Math.max(0, (owl.glow || 0) - 0.02);
            }
            // Eyelid blink — random closure
            owl.blinkTimer = (owl.blinkTimer || 0) - 1;
            if (owl.blinkTimer < -AMBIENT.OWL_BLINK_GAP_F && Math.random() < 0.02) {
                owl.blinkTimer = 6;
            }
        }
    }

    drawBats(ctx, camera) {
        if (!this.batFlock) return;
        ctx.fillStyle = 'rgba(8,4,14,0.85)';
        for (const b of this.batFlock.members) {
            const x = Math.round(b.x);
            const y = Math.round(b.y);
            // Wing flap cycle — 4 frames
            const wing = (this.batFlock.t + b.phase) % 12 < 6 ? 'up' : 'down';
            const s = b.size;
            // Body
            ctx.fillRect(x, y, s, s);
            // Wings
            if (wing === 'up') {
                ctx.fillRect(x - 2, y - 1, 2, s);
                ctx.fillRect(x + s, y - 1, 2, s);
            } else {
                ctx.fillRect(x - 3, y + 1, 3, s);
                ctx.fillRect(x + s, y + 1, 3, s);
            }
        }
    }

    drawOwlRoosts(ctx, camera) {
        for (const owl of this.owlRoosts) {
            if (!owl.glow || owl.glow <= 0.05) continue;
            const sx = Math.round(owl.x - camera.viewX);
            const sy = Math.round(owl.y - camera.viewY);
            // Blink: closed eyes show black slits
            const closed = owl.blinkTimer > 0;
            const alpha = owl.glow * (closed ? 0.15 : 0.85);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(sx - 3, sy, 2, closed ? 1 : 2);
            ctx.fillRect(sx + 1, sy, 2, closed ? 1 : 2);
            // Tiny halo around eyes
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(sx - 4, sy - 1, 8, 1);
            ctx.fillRect(sx - 4, sy + 2, 8, 1);
            ctx.globalAlpha = 1;
        }
    }

    // Draw painted-bitmap background with horizontal parallax-scroll.
    // The bitmap is scaled to GAME.H and tiled so it covers the visible width
    // even on long levels. Returns true if a painted bg was drawn.
    _paintedBg(ctx, camera, key, scrollFactor = 0.45) {
        if (!sprites.has(key)) return false;
        const img = sprites.images.get(key);
        // Fit to game height, keep aspect
        const scale = GAME.H / img.height;
        const tileW = img.width * scale;
        const offset = (camera.viewX * scrollFactor) % tileW;
        ctx.imageSmoothingEnabled = true;
        // Draw enough tiles to cover the screen
        for (let x = -offset; x < GAME.W + tileW; x += tileW) {
            ctx.drawImage(img, x | 0, 0, Math.ceil(tileW), GAME.H);
        }
        ctx.imageSmoothingEnabled = false;
        return true;
    }

    drawBack(ctx, camera) {
        // Try painted bitmap first; only fall back to fillRect silhouettes
        // when the painted asset hasn't loaded yet.
        const key = BG_KEY_FOR_THEME[this.theme];
        if (key && this._paintedBg(ctx, camera, key)) {
            // Per-theme overlay tuning. Stages 3/5/7 (server, keynote, boss-rush)
            // have very dark painted plates — we lift their darken pass + add a
            // subtle warm/cool tint band so Clippy + enemies pop without losing
            // mood. Stages 1/2/4/6/8 keep the original deeper darken.
            const tune = {
                [THEME.JUNGLE]:     { topA: 0.18, botA: 0.32, tint: null },
                [THEME.BREAKROOM]:  { topA: 0.18, botA: 0.32, tint: null },
                [THEME.SERVERROOM]: { topA: 0.08, botA: 0.18, tint: 'rgba(60, 90, 120, 0.06)' },
                [THEME.BOARDROOM]:  { topA: 0.18, botA: 0.32, tint: null },
                [THEME.KEYNOTE]:    { topA: 0.08, botA: 0.20, tint: 'rgba(120, 90, 60, 0.05)' },
                [THEME.FOUNDER]:    { topA: 0.18, botA: 0.32, tint: null },
                [THEME.CLOUD]:      { topA: 0.18, botA: 0.32, tint: null },
            }[this.theme] || { topA: 0.18, botA: 0.32, tint: null };
            ctx.fillStyle = `rgba(0,0,0,${tune.topA})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H * 0.55);
            ctx.fillStyle = `rgba(0,0,0,${tune.botA})`;
            ctx.fillRect(0, GAME.H * 0.55, GAME.W, GAME.H * 0.45);
            if (tune.tint) {
                ctx.fillStyle = tune.tint;
                ctx.fillRect(0, 0, GAME.W, GAME.H);
            }
            this._drawMotes(ctx);
            return;
        }
        switch (this.theme) {
            case THEME.JUNGLE:     this._jungleBack(ctx, camera); break;
            case THEME.BREAKROOM:  this._breakroomBack(ctx, camera); break;
            case THEME.SERVERROOM: this._serverroomBack(ctx, camera); break;
            case THEME.BOARDROOM:  this._boardroomBack(ctx, camera); break;
            case THEME.KEYNOTE:    this._keynoteBack(ctx, camera); break;
            case THEME.FOUNDER:    this._founderBack(ctx, camera); break;
            case THEME.CLOUD:      this._cloudBack(ctx, camera); break;
        }
        this._drawMotes(ctx);
    }

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
        // Ambient layer — bats fly in front of trees, owl eyes glow at canopy
        this.drawOwlRoosts(ctx, camera);
        this.drawBats(ctx, camera);
    }

    // Painted sky: top + bottom + 1px noise dither band to fake gradient depth.
    _paintedSky(ctx, top, mid, bot, ditherBand = 14) {
        const half = (GAME.H * 0.55) | 0;
        const grad = (GAME.H * 0.85) | 0;
        for (let y = 0; y < GAME.H; y++) {
            ctx.fillStyle = y < half ? top : (y < grad ? mid : bot);
            ctx.fillRect(0, y, GAME.W, 1);
        }
        // Ordered dither at gradient seams
        ctx.fillStyle = mid;
        for (let x = 0; x < GAME.W; x += 2) {
            if (((x >> 1) + this.t) & 3) continue;
            ctx.fillRect(x, half - 1, 1, 1);
            ctx.fillRect(x + 1, half, 1, 1);
        }
        ctx.fillStyle = bot;
        for (let x = 0; x < GAME.W; x += 2) {
            if (((x >> 1) + this.t) & 3) continue;
            ctx.fillRect(x, grad - 1, 1, 1);
            ctx.fillRect(x + 1, grad, 1, 1);
        }
    }

    // Reusable tree silhouette with per-instance phase sway.
    // baseX, baseY = trunk bottom. h = full tree height. trunkW = trunk width.
    _drawTree(ctx, baseX, baseY, h, trunkColor, crownColor, phase, trunkW = 5) {
        const sway = Math.sin(this.t / 24 + phase) * 1.4;
        const trunkH = Math.max(10, h * 0.42 | 0);
        const crownH = h - trunkH;
        // Trunk
        ctx.fillStyle = trunkColor;
        ctx.fillRect(baseX | 0, baseY - trunkH, trunkW, trunkH);
        // Root flare
        ctx.fillRect((baseX - 2) | 0, baseY - 3, trunkW + 4, 3);
        // Crown — three stacked rounded ovals via paired rects, swayed
        ctx.fillStyle = crownColor;
        const cw = Math.max(18, h * 0.65 | 0);
        const cx = baseX + trunkW / 2 + sway;
        const cy = baseY - trunkH;
        // bottom layer (widest, flattest)
        const b1w = cw | 0, b1h = (crownH * 0.45) | 0;
        ctx.fillRect((cx - b1w / 2) | 0, (cy - b1h) | 0, b1w, b1h);
        ctx.fillRect((cx - b1w / 2 + 2) | 0, (cy - b1h - 2) | 0, b1w - 4, 2);
        // middle layer
        const b2w = (cw * 0.82) | 0, b2h = (crownH * 0.38) | 0;
        ctx.fillRect((cx - b2w / 2) | 0, (cy - b1h - b2h * 0.8) | 0, b2w, b2h);
        // top layer (smallest)
        const b3w = (cw * 0.48) | 0, b3h = (crownH * 0.32) | 0;
        ctx.fillRect((cx - b3w / 2) | 0, (cy - crownH) | 0, b3w, b3h);
        ctx.fillRect((cx - b3w / 2 + 2) | 0, (cy - crownH - 2) | 0, b3w - 4, 2);
    }

    // ===================== JUNGLE =====================
    _jungleBack(ctx, camera) {
        this._paintedSky(ctx, '#1a0820', '#3a1028', '#5a1830');

        // Moon — pixel-circle silhouette, off to the left, below the HUD band.
        // Build from row spans approximating a 16x16 disc.
        const mx = 36, my = 36;
        // Outer halo
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = '#ffe8b0';
        const halo = [
            [-1,-3, 18, 22],
            [-3,-1, 22, 18],
        ];
        for (const [dx, dy, w, h] of halo) ctx.fillRect(mx + dx, my + dy, w, h);
        ctx.globalAlpha = 1;
        // Disc rows: [dy, x_start, width]
        const disc = [
            [0,  5,  6],
            [1,  3, 10],
            [2,  2, 12],
            [3,  1, 14],
            [4,  1, 14],
            [5,  0, 16],
            [6,  0, 16],
            [7,  0, 16],
            [8,  0, 16],
            [9,  0, 16],
            [10, 1, 14],
            [11, 1, 14],
            [12, 2, 12],
            [13, 3, 10],
            [14, 5,  6],
        ];
        ctx.fillStyle = '#f0e0b0';
        for (const [dy, x, w] of disc) ctx.fillRect(mx + x, my + dy, w, 1);
        // Soft shading on bottom-right (terminator)
        ctx.fillStyle = '#c0a888';
        ctx.fillRect(mx + 9,  my + 5, 6, 1);
        ctx.fillRect(mx + 10, my + 6, 5, 1);
        ctx.fillRect(mx + 11, my + 7, 4, 1);
        ctx.fillRect(mx + 11, my + 8, 4, 1);
        ctx.fillRect(mx + 10, my + 9, 4, 1);
        // Craters
        ctx.fillStyle = '#a08868';
        ctx.fillRect(mx + 4,  my + 4, 2, 2);
        ctx.fillRect(mx + 9,  my + 8, 2, 2);
        ctx.fillRect(mx + 3,  my + 9, 2, 1);
        ctx.fillRect(mx + 7,  my + 11, 2, 1);

        // FAR: dark horizon band — masks the bright magenta gradient so trees
        // sit against deep purple instead of pinkish bleed
        ctx.fillStyle = '#180818';
        ctx.fillRect(0, GAME.H - 100, GAME.W, 100);

        // FAR: distant city silhouette ridge (0.08x)
        const ox1 = (camera.viewX * 0.08) | 0;
        ctx.fillStyle = '#080410';
        for (let i = 0; i < 24; i++) {
            const x = ((i * 22 - ox1) % (GAME.W + 80) + GAME.W + 80) % (GAME.W + 80) - 40;
            const h = 20 + ((i * 11) % 26);
            ctx.fillRect(x, GAME.H - 90 - h, 16, h);
        }
        // Far window lights — slow flicker
        const litFrame = Math.floor(this.t / 24);
        for (let i = 0; i < 24; i++) {
            const x = ((i * 22 - ox1) % (GAME.W + 80) + GAME.W + 80) % (GAME.W + 80) - 40;
            const h = 20 + ((i * 11) % 26);
            const litMask = (i * 31 + litFrame * 7) & 0xF;
            for (let wy = 4; wy < h - 4; wy += 5) {
                ctx.fillStyle = (litMask & 1) ? '#c08040' : '#1a0a10';
                ctx.fillRect(x + 3,  GAME.H - 90 - h + wy, 1, 1);
                ctx.fillRect(x + 8,  GAME.H - 90 - h + wy, 1, 1);
                ctx.fillRect(x + 13, GAME.H - 90 - h + wy, 1, 1);
            }
        }

        // MID: jungle tree silhouettes (0.32x), swaying
        const ox2 = (camera.viewX * 0.32) | 0;
        for (let i = 0; i < 22; i++) {
            const seed = ((i * 137) ^ 0x9e3779) & 0x7fff;
            const cellW = 30;
            const x = ((i * cellW - ox2) % (GAME.W + 80) + GAME.W + 80) % (GAME.W + 80) - 40;
            const h = 44 + (seed % 28);
            this._drawTree(ctx, x, GAME.H - 70, h, '#0e1410', '#0a2810', i * 0.7, 4);
        }

        // NEAR: closer denser tree row (0.6x), bigger canopies + thicker trunks
        const ox3 = (camera.viewX * 0.6) | 0;
        for (let i = 0; i < 14; i++) {
            const seed = ((i * 211) ^ 0x71374491) & 0x7fff;
            const cellW = 44;
            const x = ((i * cellW - ox3) % (GAME.W + 120) + GAME.W + 120) % (GAME.W + 120) - 60;
            const h = 62 + (seed % 30);
            this._drawTree(ctx, x, GAME.H - 56, h, '#060a06', '#06200c', i * 0.9 + 1.5, 6);
        }

        // GROUND-LEVEL AMBIANCE (still behind gameplay objects).
        // Animated jungle puddle along the bottom — runs UNDER the tile floor
        // but visible where tiles are empty.
        const waterTop = GAME.H - 8;
        ctx.fillStyle = '#08243a';
        ctx.fillRect(0, waterTop, GAME.W, GAME.H - waterTop);
        for (let x = 0; x < GAME.W; x += 1) {
            const phase = Math.sin((x + camera.viewX) * 0.18 - this.t * 0.18);
            if (phase > 0.85) {
                ctx.fillStyle = '#5ac0d8';
                ctx.fillRect(x, waterTop, 1, 1);
            } else if (phase > 0.6) {
                ctx.fillStyle = '#2a6080';
                ctx.fillRect(x, waterTop + 1, 1, 1);
            }
        }
        // Background swaying grass tufts — at near-tree-base height, behind
        // the gameplay floor so they peek between trunk silhouettes.
        ctx.fillStyle = '#1a4820';
        const ox4 = (camera.viewX * 0.78) | 0;
        for (let i = -3; i < 40; i++) {
            const sx = i * 22 - (ox4 % 22);
            if (sx < -20 || sx > GAME.W + 20) continue;
            const sway = (Math.sin(this.t / 14 + i) * 1.4) | 0;
            for (let g = 0; g < 3; g++) {
                ctx.fillRect(sx + g * 2 + sway, GAME.H - 36 - g, 1, 3 + g);
            }
        }
    }

    _jungleFront(ctx, camera) {
        // FOREGROUND VINES — hang from top, parallax 1.1x so they push depth
        // by moving faster than the player. Slightly translucent.
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#04140a';
        const oxv = (camera.viewX * 1.1) | 0;
        for (let i = 0; i < 6; i++) {
            const x = ((i * 64 - oxv) % (GAME.W + 80) + GAME.W + 80) % (GAME.W + 80) - 40;
            const sway = Math.sin(this.t / 30 + i * 1.3) * 2;
            const len = 18 + ((i * 13) % 22);
            // Vine
            for (let y = 0; y < len; y++) {
                const dx = (y / len) * sway;
                ctx.fillRect((x + dx) | 0, y, 2, 1);
            }
            // Leaves at end
            ctx.fillRect((x + sway - 2) | 0, len, 6, 2);
            ctx.fillRect((x + sway - 1) | 0, len + 2, 4, 1);
        }
        ctx.globalAlpha = 1;
        // Fireflies — flickering ambient particles
        for (let i = 0; i < 5; i++) {
            const fx = ((i * 53 + this.t * 0.4) % (GAME.W + 40)) - 20;
            const fy = 60 + Math.sin(this.t / 30 + i * 1.7) * 30 + i * 12;
            const flick = (this.t + i * 17) & 31;
            if (flick < 14) {
                ctx.fillStyle = '#fff8a0';
                ctx.fillRect(fx | 0, fy | 0, 1, 1);
            }
        }
    }

    // ===================== BREAKROOM =====================
    _breakroomBack(ctx, camera) {
        this._paintedSky(ctx, '#101018', '#2a1830', '#503040');
        // Far vending machine wall (0.18x)
        const ox = (camera.viewX * 0.18) | 0;
        for (let i = 0; i < 12; i++) {
            const x = ((i * 40 - ox) % (GAME.W + 80) + GAME.W + 80) % (GAME.W + 80) - 40;
            ctx.fillStyle = '#80101a'; ctx.fillRect(x, GAME.H - 110, 28, 70);
            ctx.fillStyle = '#1a0a18'; ctx.fillRect(x + 4, GAME.H - 100, 20, 36);
            // Coke can icon
            ctx.fillStyle = '#ffe070'; ctx.fillRect(x + 8, GAME.H - 96, 12, 2);
            ctx.fillStyle = '#a01020'; ctx.fillRect(x + 8, GAME.H - 80, 4, 4);
            ctx.fillStyle = '#403040'; ctx.fillRect(x + 6, GAME.H - 60, 16, 4);
            // Flicker the price LED
            if (((i + (this.t >> 4)) & 3) === 0) {
                ctx.fillStyle = '#a0ff60';
                ctx.fillRect(x + 22, GAME.H - 78, 2, 1);
            }
        }
        // Mid: hanging fluorescent strips
        const ox2 = (camera.viewX * 0.45) | 0;
        for (let i = 0; i < 8; i++) {
            const x = ((i * 70 - ox2) % (GAME.W + 80) + GAME.W + 80) % (GAME.W + 80) - 40;
            ctx.fillStyle = '#2a2a30'; ctx.fillRect(x, 8, 40, 4);
            ctx.fillStyle = (Math.sin(this.t / 6 + i) > -0.9) ? '#f0f0c0' : '#80806a';
            ctx.fillRect(x + 2, 10, 36, 1);
        }
    }
    _breakroomFront(ctx, camera) {
        // Steam from spilled coffee — drift up
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
        // Far rack rows (0.2x)
        const ox0 = (camera.viewX * 0.20) | 0;
        for (let i = 0; i < 18; i++) {
            const x = ((i * 26 - ox0) % (GAME.W + 60) + GAME.W + 60) % (GAME.W + 60) - 30;
            ctx.fillStyle = '#0a0a14';
            ctx.fillRect(x, 28, 18, GAME.H - 64);
        }
        // Mid rack rows with blinkenlights (0.4x)
        const ox = (camera.viewX * 0.4) | 0;
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
        // Hanging cables (parallax 0.9x) — gentle sway
        const ox = (camera.viewX * 0.9) | 0;
        ctx.fillStyle = '#080812';
        for (let i = 0; i < 14; i++) {
            const cx = ((i * 38 - ox) % (GAME.W + 40) + GAME.W + 40) % (GAME.W + 40) - 20;
            const sway = Math.sin(this.t / 30 + i) * 1.5;
            const len = 40 + ((i * 13) % 36);
            for (let y = 0; y < len; y++) {
                const offset = (y / len) * sway;
                ctx.fillRect((cx + offset) | 0, y, 1, 1);
            }
        }
        // Occasional spark
        if ((this.t % 90) < 4) {
            const sx = (this.t * 7) % GAME.W;
            ctx.fillStyle = '#fff'; ctx.fillRect(sx, 40 + (this.t % 80), 2, 2);
        }
    }

    // ===================== BOARDROOM =====================
    _boardroomBack(ctx, camera) {
        this._paintedSky(ctx, '#180810', '#301820', '#503030');
        // Wooden floor band
        ctx.fillStyle = '#3a1810';
        ctx.fillRect(0, GAME.H - 70, GAME.W, 70);
        ctx.fillStyle = '#28100a';
        for (let i = 0; i < 5; i++) {
            ctx.fillRect(0, GAME.H - 70 + i * 14, GAME.W, 1);
        }
        // Mid: tall windows with stormy sky outside (0.4x)
        const ox = (camera.viewX * 0.4) | 0;
        for (let i = 0; i < 8; i++) {
            const x = ((i * 60 - ox) % (GAME.W + 100) + GAME.W + 100) % (GAME.W + 100) - 50;
            ctx.fillStyle = '#403018'; ctx.fillRect(x, 30, 40, 80);
            ctx.fillStyle = '#a05030'; ctx.fillRect(x + 18, 30, 4, 80); ctx.fillRect(x, 68, 40, 4);
            // Stormy sky outside windows — animated horizontal bands
            for (let py = 32; py < 108; py++) {
                if (py === 68 || py === 67) continue;
                const v = Math.sin((py + this.t) * 0.21 + i) * 0.5 + 0.5;
                ctx.fillStyle = v > 0.85 ? '#403028' : (v > 0.5 ? '#280818' : '#1a0810');
                ctx.fillRect(x + 2,  py, 16, 1);
                ctx.fillRect(x + 22, py, 16, 1);
            }
            // Occasional lightning flicker
            if (((this.t * 3 + i * 17) % 240) < 3) {
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(x + 2, 32, 16, 76);
                ctx.fillRect(x + 22, 32, 16, 76);
            }
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
        this._paintedSky(ctx, '#080010', '#100820', '#201030');
        // Stage backdrop curtains (0.3x)
        const ox = (camera.viewX * 0.3) | 0;
        ctx.fillStyle = '#200818';
        for (let x = -ox % 8; x < GAME.W; x += 8) {
            ctx.fillRect(x, 0, 4, GAME.H - 40);
        }
        // Spotlights (0.6x)
        const ox2 = (camera.viewX * 0.6) | 0;
        for (let i = 0; i < 6; i++) {
            const x = 24 + i * 44 - (ox2 % 44);
            ctx.fillStyle = '#403040'; ctx.fillRect(x, 0, 6, 16);
            ctx.fillStyle = '#a08060'; ctx.fillRect(x - 2, 8, 10, 4);
            // Beam (alpha cone)
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
        for (let i = 0; i < 16; i++) {
            const x = (i * 23 + this.t * 0.6) % GAME.W;
            const y = (i * 17 + this.t * 0.4) % GAME.H;
            ctx.fillStyle = i % 4 === 0 ? '#ff6080' : (i % 4 === 1 ? '#80c0ff' : (i % 4 === 2 ? '#a0ff60' : '#ffe060'));
            ctx.fillRect(x | 0, y | 0, 2, 2);
        }
    }

    // ===================== FOUNDER =====================
    _founderBack(ctx, camera) {
        this._paintedSky(ctx, '#000000', '#100008', '#200818');
        // Far burning skyline (0.15x)
        const ox = (camera.viewX * 0.15) | 0;
        for (let i = 0; i < 26; i++) {
            const seed = ((i * 173) ^ 0xdead) & 0x7fff;
            const x = ((i * 22 - ox) % (GAME.W + 40) + GAME.W + 40) % (GAME.W + 40) - 20;
            const h = 30 + (seed % 44);
            ctx.fillStyle = '#1a0810';
            ctx.fillRect(x, GAME.H - 70 - h, 14, h);
            // Tip glow
            ctx.fillStyle = '#601008';
            ctx.fillRect(x + 3, GAME.H - 70 - h, 8, 2);
        }
        // Animated fire glow at horizon — flicker via cosine
        for (let i = 0; i < 60; i++) {
            const fx = (i * 6 + this.t * 2) % GAME.W;
            const fy = GAME.H - 70 - (Math.sin(this.t / 20 + i) * 4 + 6);
            ctx.fillStyle = i % 3 === 0 ? '#a02018' : (i % 3 === 1 ? '#d04010' : '#601008');
            ctx.fillRect(fx, fy, 1, 4);
        }
        // Mid: burned-out trees (0.4x), swayed slightly
        const ox2 = (camera.viewX * 0.4) | 0;
        for (let i = 0; i < 10; i++) {
            const seed = ((i * 311) ^ 0xface) & 0x7fff;
            const x = ((i * 50 - ox2) % (GAME.W + 80) + GAME.W + 80) % (GAME.W + 80) - 40;
            const h = 48 + (seed % 30);
            this._drawTree(ctx, x, GAME.H - 70, h, '#0a0408', '#1a0608', i * 1.1);
        }
    }
    _founderFront(ctx, camera) {
        // Ash falling
        for (let i = 0; i < 25; i++) {
            const x = (i * 37 + this.t * 0.5) % GAME.W;
            const y = (i * 19 + this.t * 0.7) % GAME.H;
            ctx.fillStyle = `rgba(${100 + (i%3)*20},${30 + (i%2)*10},20,0.6)`;
            ctx.fillRect(x | 0, y | 0, 1, 1);
        }
        // Heat-shimmer band near horizon
        for (let i = 0; i < 40; i++) {
            const sx = (i * 7 + this.t * 1.4) % GAME.W;
            const sy = GAME.H - 72 + Math.sin(this.t / 8 + i) * 2;
            ctx.fillStyle = 'rgba(208,64,16,0.18)';
            ctx.fillRect(sx | 0, sy | 0, 2, 1);
        }
    }

    // ===================== CLOUD =====================
    _cloudBack(ctx, camera) {
        // Black starfield base
        ctx.fillStyle = '#000408'; ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Far stars (0.05x)
        const oxs = (camera.viewX * 0.05) | 0;
        for (let i = 0; i < 80; i++) {
            const x = (((i * 53 - oxs) % GAME.W) + GAME.W) % GAME.W;
            const y = (i * 37) % GAME.H;
            ctx.fillStyle = (i & 3) === 0 ? '#7af0ff' : '#406070';
            ctx.fillRect(x, y, 1, 1);
        }
        // Mid: matrix-falling data columns (0.3x)
        const ox = (camera.viewX * 0.3) | 0;
        for (let c = 0; c < 18; c++) {
            const cx = (c * 16 - (ox % 16) + GAME.W) % GAME.W;
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
        // Foreground data-glyph wisps (parallax 1.05x — moves faster than player)
        const ox = (camera.viewX * 1.05) | 0;
        for (let i = 0; i < 24; i++) {
            const x = ((i * 18 - ox) % (GAME.W + 20) + GAME.W + 20) % (GAME.W + 20) - 10;
            const y = ((i * 11 + this.t * 1.3) % GAME.H);
            ctx.fillStyle = 'rgba(122,240,255,0.35)';
            ctx.fillRect(x | 0, y | 0, 1, 2);
        }
    }
}

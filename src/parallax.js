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
    [THEME.REALITY]:    'bg_reality',
    // R226: Stage 4 PIPELINE. Default sewer plate; lab plate swaps in for
    // the second act via parallax.setBgKey('bg_sewer_lab').
    [THEME.SEWER]:      'bg_sewer',
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
        // R307: extra atmospheric depth layers.
        // - embers: bigger, glowing, drift on wind. Per-theme.
        // - windowLights: pseudo-random window flicker pulses on building bgs.
        // - lightning: full-screen pulse for stormy themes (Cloud, Mecha).
        // - foregroundSilhouettes: dark close-camera layer (leaves/vines/banners)
        //   drawn AFTER the player to sell foreground depth.
        this.embers = [];
        this.windowLights = [];
        this._lightningT = 0;
        this._lightningCooldown = 0;
        this._spawnEmbers();
        this._spawnWindowLights();
    }
    setTheme(theme) {
        this.theme = theme;
        this.t = 0;
        this.batFlock = null;
        this.batCooldown = AMBIENT.BAT_INITIAL_WARMUP_F;
        this.owlRoosts = [];
        this.owlHootCooldown = AMBIENT.OWL_HOOT_INITIAL_F;
        // R227: clear any per-stage bg override on theme change.
        this.bgKeyOverride = null;
        this._spawnMotes();
        // R307: respawn embers + window lights per theme.
        this._spawnEmbers();
        this._spawnWindowLights();
        this._lightningT = 0;
        this._lightningCooldown = 240 + Math.random() * 480;
    }
    // R227: Stage 4 swaps painted bgs mid-stage (sewer → lab). Setting
    // bgKeyOverride wins over the theme lookup until cleared. Set to null
    // to revert to the default theme key.
    setBgKey(key) {
        this.bgKeyOverride = key;
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
            case THEME.SEWER:      return { count: 11, color: '#60a060', size: 1, drift: 0.08, vyMin:  0.04, vyMax:  0.18, jitter: 0.3, alpha: 0.50 }; // sludge drips falling
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

    // R307: GLOWING EMBERS — bigger than motes, drift with wind, additive
    // blend. Per-theme count + color. Most active in fire/storm themes.
    _emberSpec() {
        // R307→R308: indoor themes get NO outdoor fire embers. Embers are
        // reserved for outdoor / fire-lit / supernatural themes only.
        // Indoor (BREAKROOM, SERVERROOM, BOARDROOM) — handled by motes only.
        // KEYNOTE keeps a low-count haze (stage fog machine — indoor-appropriate).
        switch (this.theme) {
            case THEME.JUNGLE:
                // Outdoor jungle near a burning founder's compound — fireflies
                // by day, embers blown in by night.
                return { count: 6, color: '#ff8030', wind: 0.10, rise: 0.25, size: 2, alpha: 0.55 };
            case THEME.BREAKROOM:
                return null;     // indoor break room — no fire embers
            case THEME.SERVERROOM:
                return null;     // indoor server room — no embers
            case THEME.BOARDROOM:
                return null;     // indoor boardroom — no embers (motes already cover dust)
            case THEME.KEYNOTE:
                // Stage fog/haze machine — purple wisps. Plausible indoors.
                return { count: 3, color: '#a070ff', wind: 0.03, rise: 0.05, size: 1, alpha: 0.30 };
            case THEME.FOUNDER:
                // Outdoor founder shrine — angry fire embers.
                return { count: 12, color: '#ff5020', wind: 0.18, rise: 0.45, size: 2, alpha: 0.65 };
            case THEME.CLOUD:
                // Sky/data realm — horizontal data sparks.
                return { count: 8, color: '#80f0ff', wind: 0.30, rise: -0.05, size: 1, alpha: 0.50 };
            case THEME.SEWER:
                // Tunnel — faint bioluminescent specks (not fire).
                return { count: 3, color: '#80c060', wind: 0.02, rise: 0.20, size: 1, alpha: 0.32 };
            case THEME.REALITY:
                // Supernatural — reality particles.
                return { count: 10, color: '#c080ff', wind: 0.06, rise: -0.15, size: 1, alpha: 0.42 };
            default:
                return null;
        }
    }
    _spawnEmbers() {
        this.embers.length = 0;
        const s = this._emberSpec();
        if (!s) return;
        for (let i = 0; i < s.count; i++) {
            this.embers.push({
                x: Math.random() * GAME.W,
                y: GAME.H * 0.4 + Math.random() * GAME.H * 0.6,
                vx: (Math.random() - 0.5) * s.wind * 2,
                vy: -s.rise * (0.5 + Math.random()),
                phase: Math.random() * Math.PI * 2,
                life: 60 + (Math.random() * 240) | 0,
            });
        }
    }
    _updateEmbers() {
        const s = this._emberSpec();
        if (!s) return;
        for (const e of this.embers) {
            // Gust modulation — wind picks up in pulses
            const gust = 1 + Math.sin((this.t + e.phase * 40) * 0.02) * 0.6;
            e.x += e.vx * gust + Math.sin((this.t + e.phase * 30) * 0.06) * 0.3;
            e.y += e.vy;
            e.life--;
            if (e.y < -4 || e.life <= 0) {
                // Respawn at bottom
                e.x = Math.random() * GAME.W;
                e.y = GAME.H + 4;
                e.vx = (Math.random() - 0.5) * s.wind * 2;
                e.vy = -s.rise * (0.5 + Math.random());
                e.life = 60 + (Math.random() * 240) | 0;
            }
            if (e.x < -4) e.x = GAME.W + 4;
            if (e.x > GAME.W + 4) e.x = -4;
        }
    }
    _drawEmbers(ctx) {
        const s = this._emberSpec();
        if (!s) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = s.color;
        for (const e of this.embers) {
            const flicker = 0.6 + 0.4 * Math.sin((this.t + e.phase * 50) * 0.18);
            ctx.globalAlpha = s.alpha * flicker;
            ctx.fillRect(e.x | 0, e.y | 0, s.size, s.size);
            // Soft glow ring around larger embers
            if (s.size >= 2) {
                ctx.globalAlpha = s.alpha * flicker * 0.3;
                ctx.fillRect((e.x | 0) - 1, e.y | 0, s.size + 2, s.size);
                ctx.fillRect(e.x | 0, (e.y | 0) - 1, s.size, s.size + 2);
            }
        }
        ctx.restore();
    }

    // R307: WINDOW LIGHTS — pseudo-random distant building windows that
    // flicker on/off. Per-theme positions baked at spawn; flicker pattern
    // driven by per-window phase + seeded blink intervals.
    _windowLightSpec() {
        switch (this.theme) {
            case THEME.JUNGLE:
                // Distant office park windows seen between trees
                return { count: 8, color: '#ffd060', alpha: 0.4, sizeW: 2, sizeH: 2,
                         yBand: [0.55, 0.75], blinkRate: 0.005 };
            case THEME.BREAKROOM:
                return null;  // indoor — no distant windows
            case THEME.SERVERROOM:
                return null;  // indoor
            case THEME.BOARDROOM:
                // Indoor boardroom — bg painting already shows lightning
                // storm through windows; adding free-floating dots would
                // bleed into wall/curtain areas. Skip.
                return null;
            case THEME.KEYNOTE:
                return null;  // indoor stage hall
            case THEME.FOUNDER:
                // Outdoor — fire-lit windows in distant burning compound.
                return { count: 10, color: '#ff8030', alpha: 0.55, sizeW: 2, sizeH: 2,
                         yBand: [0.30, 0.65], blinkRate: 0.012 };
            case THEME.CLOUD:
                return null;
            case THEME.SEWER:
                return null;  // underground
            case THEME.REALITY:
                // Indoor Reality Distortion stage hall — no exterior windows.
                return null;
            default:
                return null;
        }
    }
    _spawnWindowLights() {
        this.windowLights.length = 0;
        const s = this._windowLightSpec();
        if (!s) return;
        for (let i = 0; i < s.count; i++) {
            const [y0, y1] = s.yBand;
            this.windowLights.push({
                x: Math.random() * GAME.W,
                y: GAME.H * (y0 + Math.random() * (y1 - y0)),
                phase: Math.random() * Math.PI * 2,
                on: Math.random() > 0.3,
                blinkAt: this.t + 100 + Math.random() * 600,
            });
        }
    }
    _updateWindowLights() {
        const s = this._windowLightSpec();
        if (!s) return;
        for (const w of this.windowLights) {
            if (this.t >= w.blinkAt) {
                w.on = !w.on;
                w.blinkAt = this.t + 30 + Math.random() / s.blinkRate;
            }
        }
    }
    _drawWindowLights(ctx) {
        const s = this._windowLightSpec();
        if (!s) return;
        ctx.save();
        ctx.fillStyle = s.color;
        for (const w of this.windowLights) {
            if (!w.on) continue;
            const flick = 0.7 + 0.3 * Math.sin((this.t + w.phase * 60) * 0.4);
            ctx.globalAlpha = s.alpha * flick;
            ctx.fillRect(w.x | 0, w.y | 0, s.sizeW, s.sizeH);
        }
        ctx.restore();
    }

    // R307: LIGHTNING — full-screen white flash pulse for stormy themes.
    // Fires every 4-12 seconds with a 2-3 frame strike + slower 12-frame fade.
    _lightningSpec() {
        // OUTDOOR ONLY. Lightning is a sky phenomenon; indoor halls (REALITY,
        // KEYNOTE, BOARDROOM) shouldn't strobe like a thunderstorm even if
        // their static paintings include storm imagery.
        if (this.theme === THEME.CLOUD) {
            return { color: 'rgba(200, 220, 255, 0.55)', minGap: 240, maxGap: 720 };
        }
        // Mecha-Gates uses KEYNOTE theme but should ALSO flash for "burning city"
        // — handled by bgKeyOverride hook.
        if (this.bgKeyOverride === 'bg_apocalypse' || this.bgKeyOverride === 'bg_apocalypse_street') {
            return { color: 'rgba(255, 180, 120, 0.45)', minGap: 180, maxGap: 480 };
        }
        return null;
    }
    _updateLightning() {
        const s = this._lightningSpec();
        if (!s) { this._lightningT = 0; return; }
        this._lightningCooldown--;
        if (this._lightningCooldown <= 0) {
            this._lightningT = 16;   // ~16-frame strike+fade
            this._lightningCooldown = s.minGap + Math.random() * (s.maxGap - s.minGap);
        }
        if (this._lightningT > 0) this._lightningT--;
    }
    _drawLightning(ctx) {
        const s = this._lightningSpec();
        if (!s || this._lightningT <= 0) return;
        // Curve: bright 0-3, fade 3-16
        let a;
        if (this._lightningT > 12) a = (16 - this._lightningT) / 4;
        else a = this._lightningT / 12;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        ctx.restore();
    }

    // R307: FOREGROUND SILHOUETTES — close-to-camera dark band drawn AFTER
    // player + enemies. Sells the "you're inside something" depth by
    // suggesting closer-than-floor elements (overhanging vines, dangling
    // banner edges, broken ceiling tiles, etc.). Pure decorative; doesn't
    // collide with anything. Drawn at the bottom 18px (matches HUD band)
    // so it doesn't occlude critical gameplay.
    _drawForegroundSilhouettes(ctx, camera) {
        const t = this.t;
        const sway = Math.sin(t / 30) * 1.2;
        ctx.save();
        switch (this.theme) {
            case THEME.JUNGLE: {
                // Hanging vines from the top — drawn as thin dark strips
                // with leaf clumps, swaying slowly. Parallax-scrolled
                // 1.5x faster than the camera for foreground feel.
                ctx.fillStyle = 'rgba(8, 16, 4, 0.85)';
                const camOff = (camera?.viewX || 0) * 1.5;
                for (let i = 0; i < 4; i++) {
                    const baseX = ((i * 80 - camOff) % (GAME.W + 80)) | 0;
                    const x = baseX + Math.sin(t * 0.05 + i) * 1.5;
                    ctx.fillRect(x, 0, 2, 22 + (i & 1) * 6);
                    ctx.fillRect(x - 2, 18 + (i & 1) * 4, 6, 4);
                }
                break;
            }
            case THEME.FOUNDER: {
                // Cracked stone arch fragments at the top of the screen
                ctx.fillStyle = 'rgba(16, 4, 6, 0.75)';
                ctx.fillRect(0, 0, GAME.W, 6);
                // Dripping stones
                for (let i = 0; i < 5; i++) {
                    const x = (i * 64 + Math.sin(t * 0.05 + i) * 1) | 0;
                    ctx.fillRect(x, 6, 8, 4);
                }
                break;
            }
            case THEME.SERVERROOM: {
                // Hanging ceiling cables left + right edges
                ctx.fillStyle = 'rgba(4, 6, 12, 0.85)';
                for (let i = 0; i < 3; i++) {
                    ctx.fillRect(8 + i * 4, 0, 1, 14 + (i & 1) * 4);
                    ctx.fillRect(GAME.W - 12 - i * 4, 0, 1, 14 + (i & 1) * 4);
                }
                break;
            }
            case THEME.KEYNOTE: {
                // Hanging banner edges (only the FOLDED bottoms peek down)
                ctx.fillStyle = 'rgba(20, 8, 30, 0.6)';
                ctx.fillRect(0, 0, GAME.W, 4);
                for (let i = 0; i < 4; i++) {
                    const x = 24 + i * 56;
                    ctx.fillRect(x, 4, 16, 5);
                    ctx.fillRect(x + 3, 9, 10, 1);
                }
                break;
            }
            case THEME.BOARDROOM: {
                // Drawn curtain edges at top corners
                ctx.fillStyle = 'rgba(20, 8, 4, 0.7)';
                ctx.fillRect(0, 0, 24 + sway, 14);
                ctx.fillRect(GAME.W - 24 + sway, 0, 24, 14);
                break;
            }
            case THEME.CLOUD: {
                // Wispy front-cloud silhouettes
                ctx.fillStyle = 'rgba(20, 30, 60, 0.40)';
                for (let i = 0; i < 3; i++) {
                    const x = ((i * 100 + t * 0.5) % (GAME.W + 100)) | 0;
                    ctx.fillRect(x - 24, 4, 48, 6);
                    ctx.fillRect(x - 18, 10, 36, 3);
                }
                break;
            }
            case THEME.REALITY: {
                // Edge-of-stage spotlight glare (dim purple)
                ctx.fillStyle = 'rgba(80, 40, 100, 0.18)';
                ctx.fillRect(0, 0, 32, GAME.H);
                ctx.fillRect(GAME.W - 32, 0, 32, GAME.H);
                break;
            }
            case THEME.SEWER: {
                // R309: dripping ceiling pipes at left + right edges. Thick
                // dark verticals with green sludge droplet at the tip that
                // re-grows on a slow cycle.
                ctx.fillStyle = 'rgba(8, 14, 10, 0.85)';
                for (let i = 0; i < 3; i++) {
                    const x = 4 + i * 6;
                    ctx.fillRect(x, 0, 3, 10 + (i & 1) * 4);
                    ctx.fillRect(GAME.W - 7 - i * 6, 0, 3, 10 + (i & 1) * 4);
                }
                // Sludge droplet — grows for ~120 frames then falls
                const dropPhase = (t % 120) / 120;
                const dropY = dropPhase < 0.85 ? 14 : 14 + (dropPhase - 0.85) * 80;
                ctx.fillStyle = 'rgba(120, 200, 80, 0.65)';
                ctx.fillRect(5, dropY | 0, 1, 2);
                ctx.fillRect(GAME.W - 6, ((t + 40) % 120 < 102 ? 14 : 14 + ((t + 40) % 120 - 102) * 0.7) | 0, 1, 2);
                break;
            }
            case THEME.BREAKROOM: {
                // R309: hanging fluorescent housing + ceiling tile fragments
                // at the top. Dark grey, low-contrast — just enough to break
                // up the flat top of the screen.
                ctx.fillStyle = 'rgba(20, 18, 12, 0.65)';
                ctx.fillRect(0, 0, GAME.W, 4);
                // Hanging tube fixture
                ctx.fillStyle = 'rgba(40, 36, 28, 0.85)';
                ctx.fillRect(GAME.W / 2 - 28, 4, 56, 3);
                // Dangling broken tile
                ctx.fillStyle = 'rgba(60, 50, 36, 0.7)';
                ctx.fillRect(GAME.W / 2 - 30 + sway, 7, 4, 3);
                ctx.fillRect(GAME.W / 2 + 26 - sway, 7, 4, 3);
                break;
            }
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
        // R307: extra atmospheric layers — embers, window flicker, lightning.
        this._updateEmbers();
        this._updateWindowLights();
        this._updateLightning();
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
        for (let x = -offset; x < GAME.W + tileW; x += tileW) {
            ctx.drawImage(img, x | 0, 0, Math.ceil(tileW), GAME.H);
        }
        // R362: cross-fade DARK variant if one exists for this bg key.
        // Same flicker model as the beat-em-up engine — slow breathe +
        // 4-frame noise, clamped to 0.6 alpha so the painting never
        // goes pitch-black. Works for stage 21 (bg_apocalypse) the
        // same way it works for stages 20/22 (bg_apocalypse_street).
        const darkKey = key + '_dark';
        if (sprites.has(darkKey)) {
            const dark = sprites.images.get(darkKey);
            this._bgFlickT = (this._bgFlickT || 0) + 1;
            if ((this._bgFlickT & 3) === 0) {
                this._bgFlickNoise = Math.random();
            }
            const slow = (Math.sin(this._bgFlickT * 0.04) + 1) * 0.5;
            const noise = this._bgFlickNoise || 0.5;
            const alpha = Math.min(0.60, 0.18 + slow * 0.20 + noise * 0.22);
            ctx.save();
            ctx.globalAlpha = alpha;
            for (let x = -offset; x < GAME.W + tileW; x += tileW) {
                ctx.drawImage(dark, x | 0, 0, Math.ceil(tileW), GAME.H);
            }
            ctx.restore();
        }
        ctx.imageSmoothingEnabled = false;
        return true;
    }

    drawBack(ctx, camera) {
        // Try painted bitmap first; only fall back to fillRect silhouettes
        // when the painted asset hasn't loaded yet.
        // R227: bgKeyOverride wins (mid-stage sewer→lab swap for Stage 4).
        const key = this.bgKeyOverride || BG_KEY_FOR_THEME[this.theme];
        if (key && this._paintedBg(ctx, camera, key)) {
            // Per-theme overlay tuning. r100 — the painted plates are already
            // dark-toned by design; the old 0.18/0.32 darken-on-top was
            // doubling that and combining with the corner vignette + depth
            // haze to push the bg into near-invisible. Halved across the
            // bright themes; servers/keynote stay at their gentler r137
            // values since those plates were extra-dark to begin with.
            const tune = {
                [THEME.JUNGLE]:     { topA: 0.08, botA: 0.18, tint: null },
                [THEME.BREAKROOM]:  { topA: 0.10, botA: 0.20, tint: null },
                [THEME.SERVERROOM]: { topA: 0.08, botA: 0.18, tint: 'rgba(60, 90, 120, 0.06)' },
                [THEME.BOARDROOM]:  { topA: 0.10, botA: 0.20, tint: null },
                [THEME.KEYNOTE]:    { topA: 0.08, botA: 0.20, tint: 'rgba(120, 90, 60, 0.05)' },
                [THEME.FOUNDER]:    { topA: 0.10, botA: 0.20, tint: null },
                [THEME.CLOUD]:      { topA: 0.08, botA: 0.16, tint: null },
            }[this.theme] || { topA: 0.10, botA: 0.20, tint: null };
            ctx.fillStyle = `rgba(0,0,0,${tune.topA})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H * 0.55);
            ctx.fillStyle = `rgba(0,0,0,${tune.botA})`;
            ctx.fillRect(0, GAME.H * 0.55, GAME.W, GAME.H * 0.45);
            if (tune.tint) {
                ctx.fillStyle = tune.tint;
                ctx.fillRect(0, 0, GAME.W, GAME.H);
            }
            this._drawDepthHaze(ctx);
            // R307: window-lights flicker BEHIND motes so they read as
            // "distant building lights" not "in-air particles."
            this._drawWindowLights(ctx);
            this._drawMotes(ctx);
            this._drawEmbers(ctx);
            this._drawSignatureEffect(ctx);
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
        this._drawDepthHaze(ctx);
        this._drawWindowLights(ctx);
        this._drawMotes(ctx);
        this._drawEmbers(ctx);
        this._drawSignatureEffect(ctx);
    }

    // Close-camera depth motes — 8 1px particles drift across the screen at
    // 1.3x parallax, behind the theme's drawFront layer. Pure depth tier:
    // motes appear to whoosh past the camera faster than the background
    // moves, selling "you're close to the camera" without sprite art. Each
    // mote uses theme-tinted color and has its own slow vertical drift.
    _drawDepthMotes(ctx, camera) {
        if (!this._depthMotes) {
            this._depthMotes = [];
            for (let i = 0; i < 8; i++) {
                this._depthMotes.push({
                    x: Math.random() * GAME.W * 1.4,
                    y: Math.random() * GAME.H,
                    vy: -0.05 - Math.random() * 0.06,
                    phase: Math.random() * Math.PI * 2,
                });
            }
        }
        const FRONT_TINT = {
            [THEME.JUNGLE]:     '#80c080',
            [THEME.BREAKROOM]:  '#ffe0c0',
            [THEME.SERVERROOM]: '#80c0ff',
            [THEME.BOARDROOM]:  '#ffe080',
            [THEME.KEYNOTE]:    '#ff8080',
            [THEME.FOUNDER]:    '#ffa050',
            [THEME.CLOUD]:      '#ffffff',
        };
        const tint = FRONT_TINT[this.theme] || '#ffffff';
        const ox = camera.viewX * 1.3;
        for (const m of this._depthMotes) {
            m.y += m.vy;
            m.phase += 0.04;
            if (m.y < -2) { m.y = GAME.H + 2; m.x = Math.random() * GAME.W * 1.4; }
            const sx = ((m.x - ox) % (GAME.W + 40) + (GAME.W + 40)) % (GAME.W + 40) - 20;
            const a = 0.32 + Math.sin(m.phase) * 0.22;
            ctx.globalAlpha = Math.max(0, a);
            ctx.fillStyle = tint;
            ctx.fillRect(Math.round(sx), Math.round(m.y), 1, 1);
        }
        ctx.globalAlpha = 1;
    }

    // Distance-haze band — soft horizontal mid-screen gradient that fades the
    // painted bg toward an atmospheric tint at the horizon line. Pure depth
    // cheat: far objects appear color-shifted toward the sky, near ground stays
    // saturated. Bands by theme so each stage's haze color matches its mood.
    // Drawn after darken pass so it sits ON the bg, before motes + signature
    // FX so those still pop out of the haze layer.
    _drawDepthHaze(ctx) {
        const HAZE = {
            [THEME.JUNGLE]:     { color: '90, 110, 90',   bandY: 0.40, bandH: 0.30, alpha: 0.14 }, // misty green
            [THEME.BREAKROOM]:  { color: '160, 90, 110',  bandY: 0.35, bandH: 0.28, alpha: 0.10 }, // dusty pink
            [THEME.SERVERROOM]: { color: '90, 130, 180',  bandY: 0.30, bandH: 0.36, alpha: 0.13 }, // cool blue glow
            [THEME.BOARDROOM]:  { color: '180, 150, 110', bandY: 0.32, bandH: 0.30, alpha: 0.10 }, // amber lit
            [THEME.KEYNOTE]:    { color: '160, 80, 90',   bandY: 0.30, bandH: 0.32, alpha: 0.12 }, // velvet red
            [THEME.FOUNDER]:    { color: '210, 100, 60',  bandY: 0.30, bandH: 0.34, alpha: 0.15 }, // ember orange
            [THEME.CLOUD]:      { color: '180, 200, 230', bandY: 0.35, bandH: 0.36, alpha: 0.12 }, // pale sky
        };
        const spec = HAZE[this.theme];
        if (!spec) return;
        const yTop = GAME.H * spec.bandY;
        const yBot = yTop + GAME.H * spec.bandH;
        // Cache gradient per theme — createLinearGradient on every frame is
        // wasteful and the colors don't animate.
        if (!this._hazeGrad || this._hazeGradTheme !== this.theme) {
            const g = ctx.createLinearGradient(0, yTop, 0, yBot);
            g.addColorStop(0,   `rgba(${spec.color}, 0)`);
            g.addColorStop(0.5, `rgba(${spec.color}, ${spec.alpha})`);
            g.addColorStop(1,   `rgba(${spec.color}, 0)`);
            this._hazeGrad = g;
            this._hazeGradTheme = this.theme;
        }
        ctx.fillStyle = this._hazeGrad;
        ctx.fillRect(0, yTop, GAME.W, yBot - yTop);
    }

    // Signature per-stage atmospheric effects. One distinct lighting/mood
    // beat per dramatic theme, drawn over the painted bg but before the
    // tile layer + player so gameplay reads always sit on top.
    _drawSignatureEffect(ctx) {
        switch (this.theme) {
            case THEME.JUNGLE:    this._jungleGodRay(ctx); break;
            case THEME.BREAKROOM: this._breakroomFluo(ctx); break;
            case THEME.SERVERROOM:this._serverFlicker(ctx); break;
            case THEME.BOARDROOM: this._boardroomSparkle(ctx); break;
            case THEME.KEYNOTE:   this._keynoteSpotBeam(ctx); break;
            case THEME.FOUNDER:   this._founderEmberGlow(ctx); break;
            case THEME.CLOUD:     this._cloudMatrixRain(ctx); break;
            case THEME.SEWER:     this._sewerDripSplash(ctx); break;
            case THEME.REALITY:   this._realityRipple(ctx); break;
        }
    }

    // Failing fluorescent strip across the ceiling — occasional brief dim
    // pass with a 1-pixel-tall pale-yellow bar. Sells dying office lights.
    _breakroomFluo(ctx) {
        // Brief dim every ~80 frames, lasting 5 frames. Inverted at peak.
        const phase = this.t % 80;
        if (phase < 5) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#404040';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
        }
        // Ceiling tube glow — thin pale-yellow stripe near top
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = '#fff8a0';
        ctx.fillRect(0, 6, GAME.W, 2);
        ctx.restore();
    }

    // Chandelier crystal twinkle — 3 deterministic-position sparkle pixels
    // that fade in/out at offset phases. Drawn at ceiling-band height.
    _boardroomSparkle(ctx) {
        const positions = [
            { x: GAME.W * 0.22, y: 28 },
            { x: GAME.W * 0.50, y: 22 },
            { x: GAME.W * 0.78, y: 30 },
        ];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            const phase = (this.t * 0.03 + i * 2.1);
            const tw = Math.max(0, Math.sin(phase));
            if (tw < 0.3) continue;
            ctx.globalAlpha = tw * 0.7;
            ctx.fillStyle = '#fff8d0';
            // Cross sparkle
            const x = p.x | 0, y = p.y | 0;
            ctx.fillRect(x, y - 1, 1, 3);
            ctx.fillRect(x - 1, y, 3, 1);
        }
        ctx.restore();
    }

    // Matrix-rain digital drip — vertical 1px green streamers that fall and
    // wrap. Cheap: 5 streamers, each at a stable column, varying speed/phase.
    _cloudMatrixRain(ctx) {
        if (!this._matrixCols) {
            this._matrixCols = [];
            for (let i = 0; i < 5; i++) {
                this._matrixCols.push({
                    x: ((i * 53 + 17) % GAME.W) | 0,
                    speed: 0.4 + (i & 1) * 0.3,
                    phase: i * 23,
                });
            }
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const c of this._matrixCols) {
            const tipY = ((this.t * c.speed + c.phase) % (GAME.H + 40)) - 20;
            // 8-pixel tail, brightest at the tip
            for (let i = 0; i < 8; i++) {
                const y = (tipY - i) | 0;
                if (y < 0 || y >= GAME.H) continue;
                ctx.globalAlpha = (1 - i / 8) * 0.45;
                ctx.fillStyle = i === 0 ? '#d0ffd0' : '#a0ffa0';
                ctx.fillRect(c.x, y, 1, 1);
            }
        }
        ctx.restore();
    }

    // Slow diagonal moonlight god-ray from upper-right corner.
    // Drawn via 'lighter' so it adds light where the painted bg already
    // hints at moonlight, instead of overwriting it.
    _jungleGodRay(ctx) {
        const drift = Math.sin(this.t * 0.005) * 4;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = '#a0b8ff';
        // Diagonal band: rotate -30° around upper-right anchor
        ctx.translate(GAME.W * 0.78 + drift, 0);
        ctx.rotate(-Math.PI / 5);
        ctx.fillRect(-20, 0, 40, GAME.H * 2);
        ctx.restore();
        // A second thinner inner beam for layered depth
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#d8e8ff';
        ctx.translate(GAME.W * 0.78 + drift, 0);
        ctx.rotate(-Math.PI / 5);
        ctx.fillRect(-8, 0, 16, GAME.H * 2);
        ctx.restore();
    }

    // Bottom-band ember glow — a soft pulsing warm wash near the floor,
    // selling "fire just off-screen" without painting actual flames.
    _founderEmberGlow(ctx) {
        const pulse = 0.7 + Math.sin(this.t * 0.04) * 0.3;
        const grad = ctx.createLinearGradient(0, GAME.H * 0.7, 0, GAME.H);
        grad.addColorStop(0, 'rgba(255,80,30,0)');
        grad.addColorStop(1, `rgba(255,80,30,${(0.22 * pulse).toFixed(3)})`);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = grad;
        ctx.fillRect(0, GAME.H * 0.7, GAME.W, GAME.H * 0.3);
        ctx.restore();
    }

    // Two crossed stage spotlights. Slow oscillation, very low alpha.
    _keynoteSpotBeam(ctx) {
        const a = Math.sin(this.t * 0.008);
        const x1 = GAME.W * 0.3 + a * 12;
        const x2 = GAME.W * 0.7 - a * 12;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#a070ff';
        // Triangle from top to wide bottom — fake spotlight cone via 4 stacked rects
        for (let i = 0; i < 4; i++) {
            const w = 10 + i * 6;
            const y = (GAME.H / 4) * i;
            ctx.fillRect(x1 - w / 2, y, w, GAME.H / 4);
            ctx.fillRect(x2 - w / 2, y, w, GAME.H / 4);
        }
        ctx.restore();
    }

    // Server room LED flicker — occasional brief column-wide cyan flash
    // on a pseudo-random column, simulating bad rack power.
    _serverFlicker(ctx) {
        // R309: multi-column server-rack LED flicker. 6 fixed columns at
        // deterministic positions, each blinking at its own rate. Sells a
        // wall of blade servers behind the action without breaking the
        // painted bg. Cheap (no allocation, no per-frame randomness).
        if (!this._serverCols) {
            this._serverCols = [];
            for (let i = 0; i < 6; i++) {
                this._serverCols.push({
                    x: 18 + i * ((GAME.W - 36) / 5) | 0,
                    rate: 0.04 + (i % 3) * 0.03,
                    phase: i * 7.3,
                    color: (i & 1) ? '#a0d0ff' : '#80f0ff',
                });
            }
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const c of this._serverCols) {
            // sin^4 → most of the time dim, brief sharp blinks
            const v = Math.sin(this.t * c.rate + c.phase);
            const intensity = v > 0 ? v * v * v * v : 0;
            if (intensity < 0.15) continue;
            ctx.globalAlpha = 0.22 * intensity;
            ctx.fillStyle = c.color;
            // Single-column thin vertical line evokes a tower of blinking LEDs
            ctx.fillRect(c.x, 4, 1, GAME.H * 0.55);
            // Brighter dot at the "active" LED
            ctx.globalAlpha = 0.55 * intensity;
            const dotY = (8 + ((this.t * 0.5 + c.phase * 9) % (GAME.H * 0.45))) | 0;
            ctx.fillRect(c.x, dotY, 1, 1);
        }
        ctx.restore();
    }

    // R309: occasional water-drip splash on the sewer floor. Cheap impact
    // ring that pulses outward 1-2 times per second from a wandering point.
    _sewerDripSplash(ctx) {
        if (!this._dripState) {
            this._dripState = { nextAt: 30, x: GAME.W / 2, y: GAME.H - 18, life: 0 };
        }
        const s = this._dripState;
        s.life--;
        if (s.life <= 0 && this.t >= s.nextAt) {
            s.x = 12 + Math.random() * (GAME.W - 24);
            s.y = GAME.H * 0.62 + Math.random() * GAME.H * 0.30;
            s.life = 18;
            s.nextAt = this.t + 30 + (Math.random() * 60) | 0;
        }
        if (s.life > 0) {
            const k = 1 - s.life / 18;
            const r = 2 + k * 6;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.5 * (1 - k);
            ctx.strokeStyle = '#a0e0a0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // R309: Reality Distortion Field ripple — a horizontal sinusoidal
    // "warp band" that sweeps slowly down the screen. Drawn as a subtle
    // additive purple band that brightens at the wave peak.
    _realityRipple(ctx) {
        const sweepY = (this.t * 0.6) % (GAME.H + 60) - 30;
        const bandH = 18;
        if (sweepY + bandH < 0 || sweepY > GAME.H) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let dy = 0; dy < bandH; dy++) {
            const y = (sweepY + dy) | 0;
            if (y < 0 || y >= GAME.H) continue;
            // Triangle envelope — brightest at center of band
            const env = 1 - Math.abs(dy - bandH / 2) / (bandH / 2);
            ctx.globalAlpha = 0.18 * env;
            // Two-tone band: purple bottom, cyan top
            ctx.fillStyle = dy < bandH / 2 ? '#80d0ff' : '#c080ff';
            ctx.fillRect(0, y, GAME.W, 1);
        }
        ctx.restore();
    }

    drawFront(ctx, camera) {
        this._drawDepthMotes(ctx, camera);
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
        // R307: foreground silhouettes (vines / banners / cables / curtains)
        // and lightning flashes go LAST — over the painted bg + ambient
        // layer so they read as the closest thing to the camera.
        this._drawForegroundSilhouettes(ctx, camera);
        this._drawLightning(ctx);
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

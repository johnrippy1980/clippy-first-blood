// R306: beat-em-up street-brawler scene — TMNT arcade / Streets of Rage
// movement style. Player walks left/right AND up/down on a 2D "street"
// plane (no gravity, no platforming). Aim direction follows movement;
// shoot still works. Enemies emerge from off-screen, engage on the
// player's depth row, and die in the same gun-and-grenade combat as
// the platformer / FPS arenas.
//
// Architecturally mirrors FpsArena: own scene type, owns its update +
// draw loops, reuses Player.bullets array for projectile collision.
// Coordinates are screen-pixel space (256×224 canvas internal).
//
// Stage data (returned by makeBeatEmUpStage in level.js):
//   {
//     beatMode: true,
//     bgKey, music, bossKind,
//     spriteKeys: {scavenger, drone, helicopter, brawler},
//     waves: [{spawns: [{type, side, depth}, ...], minClearBeforeNext}, ...],
//     endStyle: 'door' | 'boss',
//     nextStage: N,
//   }

import { GAME } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { sprites } from './sprites.js';
import { drawText, drawTextOutlined } from './pixelfont.js';
import { particles } from './particles.js';

// Playable street region — Clippy moves WITHIN this band, no jumping.
//   STREET_TOP    = far edge of the street (smaller y = "further away")
//   STREET_BOTTOM = near edge (the camera)
const STREET_TOP = 100;
const STREET_BOTTOM = GAME.H - 22;
// R361: beat-em-up sizes used to be 8-bit-ish (16x24 player, 16-26
// wide enemies) which made the scene feel like an NES game next to the
// SNES-painted platformer stages. Bumped everything ~75% so the
// silhouettes fill the screen properly.
const PLAYER_W = 28, PLAYER_H = 40;
const PLAYER_SPEED_X = 1.6;
const PLAYER_SPEED_Y = 1.1;        // y-axis movement is "moving in depth"
const BULLET_FIRE_COOLDOWN = 6;

// Depth-scale: enemies higher on screen (smaller y) draw smaller +
// dimmer, mimicking distance.
function depthScale(y) {
    const t = (y - STREET_TOP) / (STREET_BOTTOM - STREET_TOP);
    return Math.max(0.6, Math.min(1.05, 0.7 + t * 0.4));
}

export class BeatEmUp {
    constructor(stageData, ctx, game) {
        this.ctx = ctx;
        this.game = game;
        this.data = stageData;
        this.t = 0;

        // Player on the street plane — starts left-center
        this.player = {
            x: 24,
            y: (STREET_TOP + STREET_BOTTOM) / 2,
            w: PLAYER_W, h: PLAYER_H,
            vx: 0, vy: 0,
            hp: 6,
            maxHp: 6,
            lives: 3,
            iframes: 0,
            shootCD: 0,
            facing: 1,            // +1 right, -1 left
            runFrame: 0,
            score: 0,
        };

        this.bullets = [];        // player shots
        this.enemyBullets = [];
        this.enemies = [];
        this.particles = [];

        // Wave management
        this.waveIdx = 0;
        this.waveSpawned = false;
        this.phase = 'fight';     // 'fight' | 'clear' | 'doorApproach'
        this.clearT = 0;
        this.doorT = 0;

        // Camera scroll — street advances as the player kills waves
        this.scroll = 0;
        this.targetScroll = 0;

        this.bgImg = sprites.images.get(stageData.bgKey) || null;
        // R362: cross-fade companion. If a `<bgKey>_dark` variant exists
        // we layer it on top with per-frame alpha to make the windows
        // flicker + fires pulse on the actual painted pixel positions
        // (vs the discarded R361 random-vector approach).
        this.bgImgDark = sprites.images.get(stageData.bgKey + '_dark') || null;
        this.spriteKeys = stageData.spriteKeys || {};

        // R361: atmospheric ambient layer — REBUILT.
        //   * Window lights are now WORLD-anchored (scroll past as the
        //     player walks) and rendered as visible 2x3-pixel rectangles
        //     with HARD on/off flicker (not soft sine fade) so the user
        //     actually sees the lights flickering.
        //   * Fire clusters are placed at world positions in the rubble
        //     foreground — each cluster emits 3-5 dancing flame pixels +
        //     rising ember particles every tick. As the player walks
        //     past, fires move from on-screen to off-screen naturally.
        //   * Original screen-anchored embers kept for "wind across the
        //     foreground" effect — drifting ash above the action.
        const stageW = stageData.stageWidth || GAME.W * 4;
        this._ambientEmbers = [];
        for (let i = 0; i < 22; i++) {
            this._ambientEmbers.push({
                x: Math.random() * GAME.W,
                y: STREET_TOP + Math.random() * (STREET_BOTTOM - STREET_TOP) * 0.8,
                vx: (Math.random() - 0.5) * 0.4,
                vy: -0.4 - Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
                hue: Math.random() < 0.6 ? '#ff7030' : '#ffb050',
            });
        }
        // Window lights — dense, world-anchored, bright enough to read
        this._windowLights = [];
        const windowDensity = Math.floor(stageW / 24);   // ~one per 24 px
        for (let i = 0; i < windowDensity; i++) {
            this._windowLights.push({
                x: Math.random() * stageW,
                y: 24 + Math.random() * (STREET_TOP - 40),
                w: 2 + ((Math.random() < 0.3) ? 1 : 0),
                h: 3 + ((Math.random() < 0.3) ? 1 : 0),
                // Hard flicker: per-window cooldown, randomly toggles
                state: Math.random() < 0.7 ? 'on' : 'off',
                stateT: 30 + (Math.random() * 90) | 0,
                color: Math.random() < 0.15 ? '#ff6030' : '#ffd060',
            });
        }
        // Fire clusters — world-anchored, animated dancing pixels
        this._fireClusters = [];
        const fireDensity = Math.floor(stageW / 64);  // one per ~64 px
        for (let i = 0; i < fireDensity; i++) {
            this._fireClusters.push({
                x: 80 + Math.random() * (stageW - 160),
                y: STREET_BOTTOM - 6 + Math.random() * 4,
                size: 4 + Math.random() * 4,
                phase: Math.random() * Math.PI * 2,
                emitT: 0,
            });
        }
        // Rising-ember particle list (separate from drifting screen embers)
        this._fireEmbers = [];   // {x, y, vx, vy, life, hue}
        this._lightningT = 0;
        this._lightningCooldown = 240 + (Math.random() * 360) | 0;
        // R365: foreground parallax props — burning cars, crumbling
        // powerline poles, mailbox husks. Sit IN FRONT of the action
        // and scroll FASTER than the player (parallax depth feel).
        // World-anchored, sparse so they pass dramatically.
        this._foregroundProps = [];
        // R367: dropped 'burningCar' from the foreground kinds list —
        // the painted bg_apocalypse_street.png already has burning cars,
        // and the procedural one read as a duplicate banner in the
        // foreground. Stick to silhouettes the bg doesn't have.
        const fgKinds = ['powerlinePole', 'mailbox', 'powerlinePole'];
        const fgDensity = Math.floor(stageW / 280);  // ~one per 280 world px
        for (let i = 0; i < fgDensity; i++) {
            this._foregroundProps.push({
                x: 100 + i * 280 + (Math.random() * 80 - 40),
                kind: fgKinds[i % fgKinds.length],
                phase: Math.random() * Math.PI * 2,
            });
        }

        // Boot first wave
        this._spawnWave(0);
    }

    // R307 / R361 — ambient layer helpers
    _tickAmbience() {
        for (const e of this._ambientEmbers) {
            const gust = 1 + Math.sin((this.t + e.phase * 40) * 0.025) * 0.7;
            e.x += e.vx * gust;
            e.y += e.vy;
            if (e.y < 16) {
                e.y = STREET_BOTTOM + 4;
                e.x = Math.random() * GAME.W;
                e.vx = (Math.random() - 0.5) * 0.4;
                e.vy = -0.4 - Math.random() * 0.6;
            }
            if (e.x < -4) e.x = GAME.W + 4;
            if (e.x > GAME.W + 4) e.x = -4;
        }
        // R361: hard flicker — each window randomly toggles on/off
        // based on its own countdown. Reads as a real flickering bulb,
        // not the old smooth sine duty cycle.
        for (const w of this._windowLights) {
            w.stateT--;
            if (w.stateT <= 0) {
                w.state = w.state === 'on' ? 'off' : 'on';
                // Lit windows stay on longer than dark ones (~70/30 duty)
                w.stateT = w.state === 'on'
                    ? 60 + (Math.random() * 180) | 0
                    : 8 + (Math.random() * 28) | 0;
            }
        }
        // R361: fire clusters — dance + emit a rising ember every 4-8 frames
        for (const f of this._fireClusters) {
            f.phase += 0.18 + Math.random() * 0.06;
            f.emitT--;
            if (f.emitT <= 0) {
                f.emitT = 4 + (Math.random() * 4) | 0;
                this._fireEmbers.push({
                    x: f.x + (Math.random() - 0.5) * f.size,
                    y: f.y - 2,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.6 - Math.random() * 0.8,
                    life: 28 + (Math.random() * 16) | 0,
                    hue: Math.random() < 0.5 ? '#ff5020' : '#ffb050',
                });
            }
        }
        // Tick + retire fire embers
        for (let i = this._fireEmbers.length - 1; i >= 0; i--) {
            const e = this._fireEmbers[i];
            e.x += e.vx;
            e.y += e.vy;
            e.vy += 0.02;   // slight upward easing
            e.life--;
            if (e.life <= 0) this._fireEmbers.splice(i, 1);
        }
        this._lightningCooldown--;
        if (this._lightningCooldown <= 0) {
            this._lightningT = 18;
            this._lightningCooldown = 280 + (Math.random() * 400) | 0;
        }
        if (this._lightningT > 0) this._lightningT--;
    }

    _drawWindowLights(ctx) {
        ctx.save();
        // R361: world-anchored — subtract scroll so windows pass by
        // as the player walks. Hard on/off + small glow halo + occasional
        // single-frame flicker dip while lit.
        const sc = this.scroll;
        for (const w of this._windowLights) {
            if (w.state !== 'on') continue;
            const sx = (w.x - sc) | 0;
            if (sx < -8 || sx > GAME.W + 4) continue;
            // Brief flicker dip — random 1-frame dim while lit
            const dip = (Math.random() < 0.04) ? 0.35 : 1;
            // Halo glow first (lighter blend) — bigger, dimmer rectangle
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.35 * dip;
            ctx.fillStyle = w.color;
            ctx.fillRect(sx - 1, (w.y | 0) - 1, w.w + 2, w.h + 2);
            // Solid window core
            ctx.globalAlpha = 0.92 * dip;
            ctx.fillRect(sx, w.y | 0, w.w, w.h);
        }
        ctx.restore();
    }

    // R361: world-anchored animated fire clusters in the rubble. Each
    // cluster paints a 3-tone dancing flame body; the rising embers it
    // emits each frame come through via _drawFireEmbers below.
    _drawFireClusters(ctx) {
        const sc = this.scroll;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const f of this._fireClusters) {
            const sx = (f.x - sc) | 0;
            if (sx < -16 || sx > GAME.W + 16) continue;
            const flick = 0.75 + 0.25 * Math.sin(f.phase);
            const sizeFlick = 0.85 + 0.20 * Math.sin(f.phase * 0.7 + 1.3);
            const w = Math.round(f.size * sizeFlick);
            const h = Math.round(f.size * 1.7 * sizeFlick);
            const baseY = f.y | 0;
            // Outer red glow
            ctx.globalAlpha = 0.45 * flick;
            ctx.fillStyle = '#a01018';
            ctx.fillRect(sx - w, baseY - h, w * 2, h);
            // Orange middle body
            ctx.globalAlpha = 0.80 * flick;
            ctx.fillStyle = '#ff6020';
            ctx.fillRect(sx - (w / 2 | 0), baseY - h + 2, w, h - 2);
            // Bright yellow core tip
            ctx.globalAlpha = 0.95 * flick;
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(sx - 1, baseY - h + 3, 2, Math.max(2, (h / 2) | 0));
            // White-hot center pixel
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx, baseY - h + 5, 1, 1);
        }
        ctx.restore();
    }

    _drawFireEmbers(ctx) {
        const sc = this.scroll;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const e of this._fireEmbers) {
            const sx = (e.x - sc) | 0;
            if (sx < -2 || sx > GAME.W + 2) continue;
            const a = Math.max(0, e.life / 32);
            ctx.globalAlpha = 0.75 * a;
            ctx.fillStyle = e.hue;
            ctx.fillRect(sx, e.y | 0, 1, 1);
        }
        ctx.restore();
    }

    _drawAmbientEmbers(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const e of this._ambientEmbers) {
            const flicker = 0.6 + 0.4 * Math.sin((this.t + e.phase * 50) * 0.18);
            ctx.globalAlpha = 0.6 * flicker;
            ctx.fillStyle = e.hue;
            ctx.fillRect(e.x | 0, e.y | 0, 1, 1);
        }
        ctx.restore();
    }

    // R365: foreground parallax props — large silhouettes that sit in
    // FRONT of the action and scroll FASTER than the world (1.5x player
    // scroll). User: "create a parallax effect. like a big burning car,
    // a crumbling powerline pole or such in the front." Procedural draws
    // so we don't need to gen sprite assets — the silhouettes are bold
    // simple shapes that read as foreground at any scale.
    _drawForegroundProps(ctx) {
        if (!this._foregroundProps) return;
        const sc = this.scroll;
        const PARALLAX = 1.5;   // foreground scrolls 1.5x faster than world
        for (const p of this._foregroundProps) {
            // World-x mapped to faster-scrolling screen-x for parallax.
            // The "anchor" position is the actual world spot, but its
            // apparent screen position drifts ahead at PARALLAX rate.
            const sx = (p.x - sc * PARALLAX) | 0;
            if (sx < -80 || sx > GAME.W + 80) continue;
            if (p.kind === 'burningCar') this._drawFGBurningCar(ctx, sx, p);
            else if (p.kind === 'powerlinePole') this._drawFGPole(ctx, sx, p);
            else if (p.kind === 'mailbox') this._drawFGMailbox(ctx, sx, p);
        }
    }

    _drawFGBurningCar(ctx, sx, p) {
        // 64-wide wrecked car silhouette at floor level. R366b: brighter
        // body palette + light-edge highlight so the silhouette reads
        // against the painted apocalypse bg (was invisible-on-bg before;
        // only the flame jets showed, giving the appearance of a red
        // banner floating in midair).
        const baseY = STREET_BOTTOM + 4;
        // Car body — twisted metal, mid-grey so it reads against bg
        ctx.fillStyle = '#3a3038';
        ctx.fillRect(sx - 32, baseY - 14, 64, 14);
        // Top highlight catch-light
        ctx.fillStyle = '#5a4a52';
        ctx.fillRect(sx - 32, baseY - 14, 64, 1);
        // Bottom shadow
        ctx.fillStyle = '#1a0e14';
        ctx.fillRect(sx - 32, baseY - 2, 64, 2);
        // Cabin
        ctx.fillStyle = '#2a2028';
        ctx.fillRect(sx - 18, baseY - 24, 30, 10);
        ctx.fillStyle = '#4a3848';
        ctx.fillRect(sx - 18, baseY - 24, 30, 1);
        // Cracked windshield (red glow from flames inside)
        ctx.fillStyle = '#a02018';
        ctx.fillRect(sx - 14, baseY - 22, 8, 6);
        ctx.fillRect(sx + 2, baseY - 22, 8, 6);
        // Cracked-glass jag highlights
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(sx - 11, baseY - 20, 1, 3);
        ctx.fillRect(sx + 5,  baseY - 20, 1, 3);
        // Wheels — burnt-tire silhouettes
        ctx.fillStyle = '#080406';
        ctx.fillRect(sx - 28, baseY - 4, 10, 5);
        ctx.fillRect(sx + 18, baseY - 4, 10, 5);
        ctx.fillStyle = '#5a484a';
        ctx.fillRect(sx - 27, baseY - 3, 1, 1);
        ctx.fillRect(sx + 26, baseY - 3, 1, 1);
        // Flame jets from the hood — animated
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const flick = 0.7 + 0.3 * Math.sin((this.t + p.phase * 30) * 0.4);
        ctx.globalAlpha = 0.85 * flick;
        ctx.fillStyle = '#a01018';
        ctx.fillRect(sx - 20, baseY - 30, 40, 8);
        ctx.fillStyle = '#ff5020';
        ctx.fillRect(sx - 14, baseY - 36, 28, 8);
        ctx.fillStyle = '#ffe060';
        ctx.fillRect(sx - 4, baseY - 42, 8, 6);
        ctx.fillRect(sx - 8, baseY - 38, 4, 4);
        ctx.fillRect(sx + 4, baseY - 38, 4, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, baseY - 40, 2, 2);
        ctx.restore();
    }

    _drawFGPole(ctx, sx, p) {
        // Crumbling powerline pole leaning ~15deg
        const baseY = STREET_BOTTOM + 4;
        const lean = Math.sin(p.phase) > 0 ? 6 : -6;   // some lean left, some right
        ctx.save();
        // Pole shaft
        ctx.fillStyle = '#1a0e08';
        for (let i = 0; i < 60; i++) {
            const ox = (lean * i / 60) | 0;
            ctx.fillRect(sx + ox, baseY - i, 3, 1);
        }
        ctx.fillStyle = '#3a2818';
        for (let i = 0; i < 60; i++) {
            const ox = (lean * i / 60) | 0;
            ctx.fillRect(sx + ox, baseY - i, 1, 1);
        }
        // Crossbeam at top, broken
        const topX = sx + lean;
        const topY = baseY - 60;
        ctx.fillStyle = '#1a0e08';
        ctx.fillRect(topX - 14, topY, 28, 2);
        // Snapped cables hanging down
        ctx.strokeStyle = '#0a0610';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(topX - 12, topY + 2);
        ctx.lineTo(topX - 18, topY + 14);
        ctx.lineTo(topX - 14, topY + 22);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(topX + 12, topY + 2);
        ctx.lineTo(topX + 18, topY + 12);
        ctx.lineTo(topX + 14, topY + 24);
        ctx.stroke();
        // Sparking end on one cable — animated
        if (((this.t + p.phase * 20) % 30) < 6) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = '#7af0ff';
            ctx.fillRect((topX + 14) | 0, (topY + 24) | 0, 2, 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect((topX + 14) | 0, (topY + 24) | 0, 1, 1);
            ctx.restore();
        }
        ctx.restore();
    }

    _drawFGMailbox(ctx, sx, p) {
        // Beat-up USPS-style mailbox, tipped over
        const baseY = STREET_BOTTOM + 2;
        ctx.fillStyle = '#1a1a28';
        ctx.fillRect(sx - 8, baseY - 14, 16, 14);
        ctx.fillStyle = '#0a0a18';
        ctx.fillRect(sx - 8, baseY - 14, 16, 2);
        // Door — askew
        ctx.fillStyle = '#3a3a48';
        ctx.fillRect(sx - 6, baseY - 11, 12, 8);
        // Slot
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 4, baseY - 9, 8, 1);
        // Legs
        ctx.fillStyle = '#1a1a28';
        ctx.fillRect(sx - 7, baseY, 2, 4);
        ctx.fillRect(sx + 5, baseY, 2, 4);
        // Spilled letters at base
        ctx.fillStyle = '#d8d0b8';
        ctx.fillRect(sx - 14, baseY + 3, 4, 2);
        ctx.fillRect(sx + 10, baseY + 3, 5, 2);
        ctx.fillRect(sx - 8, baseY + 5, 6, 1);
    }

    _drawLightning(ctx) {
        if (this._lightningT <= 0) return;
        let a;
        if (this._lightningT > 14) a = (18 - this._lightningT) / 4;
        else a = this._lightningT / 14;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, Math.min(1, a)) * 0.5;
        ctx.fillStyle = '#ffe0b0';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        ctx.restore();
    }

    // ==== wave spawning ====
    _spawnWave(idx) {
        const wave = this.data.waves?.[idx];
        if (!wave) return;
        for (const spawn of wave.spawns) {
            this._spawnEnemy(spawn);
        }
        this.waveSpawned = true;
    }

    _spawnEnemy({ type, side = 'right', depth = null, x = null, isBoss = false, name = null, hpMul = 1, wMul = 1, hMul = 1 }) {
        // Position: side = 'left'/'right' spawns off-screen at that edge.
        // depth = 0..1 maps to STREET_TOP..STREET_BOTTOM.
        // R331: positions are WORLD coords now. Off-screen-left =
        // (current scroll - 20); off-screen-right = (scroll + GAME.W + 20).
        const spawnX = x != null ? x
                     : side === 'left' ? this.scroll - 20
                     : this.scroll + GAME.W + 20;
        const dy = depth != null ? depth : 0.3 + Math.random() * 0.6;
        const spawnY = STREET_TOP + (STREET_BOTTOM - STREET_TOP) * dy;
        const stats = ENEMY_STATS[type] || ENEMY_STATS.scavenger;
        // R337: spawn-spec can flag this enemy as the stage boss. Boss
        // enemies get an HP multiplier, an HP bar at the bottom of the
        // screen (rendered separately), and a name banner. Defaults
        // preserve all existing spawn calls (isBoss=false, hpMul=1).
        const hp = Math.ceil(stats.hp * hpMul);
        const e = {
            type,
            x: spawnX, y: spawnY,
            w: Math.round(stats.w * wMul), h: Math.round(stats.h * hMul),
            vx: 0, vy: 0,
            hp,
            maxHp: hp,
            alive: true,
            speed: stats.speed,
            damage: stats.damage,
            attackCD: 0,
            attackRange: stats.attackRange,
            fireRange: stats.fireRange,
            hitFlash: 0,
            // Helicopters hover and dive — y oscillates above the street.
            isFlying: type === 'helicopter',
            hoverPhase: Math.random() * Math.PI * 2,
            baseY: spawnY,
            // R337: boss flags
            isBoss,
            name,
        };
        this.enemies.push(e);
        if (isBoss) this._boss = e;
    }

    _waveCleared() {
        // R331: a wave is only "cleared" if it actually spawned AND
        // every spawned enemy is dead. Initial state (no enemies) does
        // NOT count as cleared — otherwise scroll runs free before wave
        // 0 even engages.
        if (!this.enemies.length) return false;
        return this.enemies.every(e => !e.alive);
    }

    // ==== update ====
    update() {
        this.t++;
        // R307: ambient particles/lights tick every frame regardless of phase
        this._tickAmbience();
        if (this.phase === 'clear') {
            this.clearT++;
            const autoNext = this.data.nextStage;
            // R365: stage 22 (Mecha-Gates final beat-em-up) used to sit
            // forever on the clear screen — no nextStage and the engine
            // only routed to title on input. Now if it's the true final
            // stage we auto-route to GAME_COMPLETE after a 4s celebration
            // hold, matching the R357 platformer flow.
            const isFinal = (this.game.currentStage === 22);
            if (autoNext && this.clearT >= 120) {
                audio.stopTrack();
                this.game._pendingStage = autoNext;
                this.game._extraCards = null;
                this.game.storyTimer = 0;
                this.game.scene = 'stageCard';
                return;
            }
            if (isFinal && this.clearT >= 240) {
                audio.stopTrack();
                this.game._fadeTo('gameComplete');
                return;
            }
            if (this.clearT > 60 &&
                (input.isPressed('shoot') || input.isPressed('jump') ||
                 input.isPressed('start') || input.isPressed('pause'))) {
                if (autoNext) {
                    audio.stopTrack();
                    this.game._pendingStage = autoNext;
                    this.game._extraCards = null;
                    this.game.storyTimer = 0;
                    this.game.scene = 'stageCard';
                    return;
                }
                if (isFinal) {
                    audio.stopTrack();
                    this.game._fadeTo('gameComplete');
                    return;
                }
                audio.stopTrack();
                this.game._fadeTo('title');
            }
            return;
        }
        this._tickPlayer();
        this._tickBullets();
        this._tickEnemies();
        this._tickEnemyBullets();
        this._tickParticles();
        this._tickCamera();
        // Wave-clear check — advance when all enemies dead.
        if (this.waveSpawned && this._waveCleared()) {
            this.waveSpawned = false;
            this.waveIdx++;
            if (this.waveIdx >= (this.data.waves?.length || 0)) {
                this.phase = 'clear';
                this.clearT = 0;
            } else if (!this.data.waveChokepoints) {
                // R337 fix: use a frame-counted breath instead of setTimeout.
                // setTimeout doesn't honor pause/freeze frames and races with
                // the next-frame _tickEnemies. _nextWaveAt is a frame counter
                // ticked here; once it hits 0 we spawn the wave.
                this._nextWaveAt = 48;   // ~0.8s at 60fps
            }
            // R357: when waveChokepoints exist (stage 20 Mecha Approach),
            // do NOT auto-spawn — the player must walk to the next
            // chokepoint to trigger the wave. Otherwise all 4 waves
            // resolved at scroll=0 and stage ended without progression.
        }
        // R337: tick the inter-wave breath counter + spawn when ready.
        if (this._nextWaveAt && this._nextWaveAt > 0 && this.phase === 'fight') {
            this._nextWaveAt--;
            if (this._nextWaveAt === 0 && !this.waveSpawned) {
                this._spawnWave(this.waveIdx);
            }
        }
    }

    _tickPlayer() {
        const ax = input.axis();
        const p = this.player;
        p.vx = ax.x * PLAYER_SPEED_X;
        p.vy = ax.y * PLAYER_SPEED_Y;
        p.x += p.vx;
        p.y += p.vy;
        // R331: clamp p.x in WORLD coords. p.x is now world-x, not
        // screen-x. Left bound = current scroll (can't walk off-screen
        // backwards). Right bound = scroll-locked: if a wave isn't
        // cleared, scroll holds and player can't push past the right
        // edge of the visible screen.
        const worldLeft = this.scroll + 8;
        const worldRight = this.scroll + GAME.W - p.w - 8;
        if (p.x < worldLeft) p.x = worldLeft;
        if (p.x > worldRight) p.x = worldRight;
        if (p.y < STREET_TOP) p.y = STREET_TOP;
        if (p.y > STREET_BOTTOM - p.h) p.y = STREET_BOTTOM - p.h;
        // R331: scroll the camera forward when the player crosses 60% of
        // the screen, BUT only if the current wave is cleared (no
        // surviving enemies). The lock turns the scene into a series of
        // bounded arenas — classic beat-em-up flow.
        const screenX = p.x - this.scroll;
        const SCROLL_THRESH = GAME.W * 0.55;
        const canScroll = this._waveCleared() && !this.data.scrollLocked;
        if (canScroll && screenX > SCROLL_THRESH) {
            const delta = screenX - SCROLL_THRESH;
            const maxScroll = (this.data.stageWidth || GAME.W * 4) - GAME.W;
            this.scroll = Math.min(maxScroll, this.scroll + delta);
            // If scroll hit max, trigger the next wave/boss
            if (this.scroll >= maxScroll && !this._reachedEnd) {
                this._reachedEnd = true;
            }
        }
        // R331: spawn the next wave whenever scroll passes a chokepoint
        // declared in stage data. Each chokepoint is consumed once.
        if (this.data.waveChokepoints) {
            for (const cp of this.data.waveChokepoints) {
                if (!cp._fired && this.scroll >= cp.x) {
                    cp._fired = true;
                    this.waveIdx = cp.wave;
                    this._spawnWave(cp.wave);
                }
            }
        }
        if (Math.abs(ax.x) > 0.1) {
            p.runFrame = (p.runFrame + 0.25) % 4;
            p.facing = ax.x > 0 ? 1 : -1;
        }
        if (p.iframes > 0) p.iframes--;
        if (p.shootCD > 0) p.shootCD--;
        if (input.isHeld('shoot') && p.shootCD <= 0) {
            this._fire();
            p.shootCD = BULLET_FIRE_COOLDOWN;
        }
    }

    _fire() {
        const p = this.player;
        // Shoot horizontally in facing direction
        this.bullets.push({
            x: p.x + p.w / 2 + p.facing * 8,
            y: p.y + p.h / 2 - 2,
            vx: p.facing * 4.5,
            vy: 0,
            life: 50,
        });
        audio.sfx('mg');
    }

    _tickBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
            // R360: despawn check was in screen-space (b.x > GAME.W) but
            // b.x is WORLD coords now (R331). After the camera scrolled
            // past the first chokepoint, every fresh bullet had world-x
            // > 256 and despawned the same frame it was created — so
            // Clippy "stopped being able to shoot" after first progress.
            // Now compare against the visible screen window.
            const screenX = b.x - this.scroll;
            if (b.life <= 0 || screenX < -10 || screenX > GAME.W + 10) {
                this.bullets.splice(i, 1);
                continue;
            }
            // Bullet vs enemy — use a band-test on y so the bullet only
            // hits enemies in the same "depth row" the player aimed at
            // (matches genre expectation: you can't shoot diagonally
            // through depth bands).
            for (const e of this.enemies) {
                if (!e.alive) continue;
                if (b.x >= e.x && b.x <= e.x + e.w &&
                    b.y >= e.y && b.y <= e.y + e.h) {
                    e.hp--;
                    e.hitFlash = 4;
                    this.bullets.splice(i, 1);
                    if (e.hp <= 0) {
                        e.alive = false;
                        this.player.score += ENEMY_STATS[e.type]?.score || 100;
                        audio.sfx('enemyDie');
                        this._explosion(e.x + e.w / 2, e.y + e.h / 2,
                                         e.type === 'helicopter' ? '#ff8040' : '#a08060');
                    } else {
                        audio.sfx('hit');
                    }
                    break;
                }
            }
        }
    }

    _tickEnemies() {
        const p = this.player;
        for (const e of this.enemies) {
            if (!e.alive) continue;
            if (e.hitFlash > 0) e.hitFlash--;
            // Helicopter hovers above its baseY + bobs
            if (e.isFlying) {
                e.hoverPhase += 0.05;
                e.y = e.baseY + Math.sin(e.hoverPhase) * 6;
            }
            // Steer toward player
            const dx = (p.x + p.w / 2) - (e.x + e.w / 2);
            const dy = (p.y + p.h / 2) - (e.y + e.h / 2);
            const dist = Math.hypot(dx, dy) || 1;
            // Attack range — melee enemies stop close, ranged enemies hold further
            const stopDist = e.attackRange;
            if (dist > stopDist) {
                e.x += (dx / dist) * e.speed;
                if (!e.isFlying) e.y += (dy / dist) * e.speed;
            }
            // Attack
            if (e.attackCD > 0) e.attackCD--;
            if (e.attackCD <= 0 && dist < e.fireRange) {
                e.attackCD = e.fireRange < 30 ? 30 : 60;
                if (e.fireRange < 30) {
                    // Melee — direct contact damage
                    this._tryHitPlayer(e.damage);
                } else {
                    // Ranged — spawn enemy bullet toward player
                    const speed = 2.0;
                    this.enemyBullets.push({
                        x: e.x + e.w / 2,
                        y: e.y + e.h / 2,
                        vx: (dx / dist) * speed,
                        vy: (dy / dist) * speed,
                        life: 180,
                        damage: e.damage,
                    });
                    audio.sfx('enemyShoot');
                }
            }
        }
        // Drop dead enemies from collision pool after a brief delay so the
        // particle burst can play; we keep them in array until next wave check.
    }

    _tickEnemyBullets() {
        const p = this.player;
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
            if (b.life <= 0 || b.x < -10 || b.x > GAME.W + 10 ||
                b.y < STREET_TOP - 20 || b.y > GAME.H + 10) {
                this.enemyBullets.splice(i, 1);
                continue;
            }
            if (p.iframes <= 0 &&
                b.x >= p.x && b.x <= p.x + p.w &&
                b.y >= p.y && b.y <= p.y + p.h) {
                this.enemyBullets.splice(i, 1);
                this._hitPlayer(b.damage || 1);
            }
        }
    }

    _tryHitPlayer(dmg) {
        const p = this.player;
        if (p.iframes > 0) return;
        // Only land melee if enemy is genuinely overlapping
        for (const e of this.enemies) {
            if (!e.alive) continue;
            if (p.x + p.w >= e.x && p.x <= e.x + e.w &&
                p.y + p.h >= e.y && p.y <= e.y + e.h) {
                this._hitPlayer(dmg);
                return;
            }
        }
    }

    _hitPlayer(dmg) {
        const p = this.player;
        p.hp -= dmg;
        p.iframes = 60;
        audio.sfx('playerHit');
        if (p.hp <= 0) this._onPlayerDeath();
    }

    _onPlayerDeath() {
        this.player.lives--;
        this.enemyBullets = [];
        if (this.player.lives < 0) {
            this.game._fadeTo('gameOver');
            return;
        }
        this.player.hp = this.player.maxHp;
        this.player.iframes = 120;
        this.player.x = 24;
        this.player.y = (STREET_TOP + STREET_BOTTOM) / 2;
    }

    _tickCamera() {
        // No actual scrolling for now — single-screen waves. Hook left for
        // future "scroll-and-fight" multi-screen levels.
    }

    // R314: richer explosion FX — shockwave ring + smoke puff + debris.
    _explosion(x, y, color) {
        this.particles.push({
            x, y, vx: 0, vy: 0,
            life: 18, maxLife: 18,
            color: '#ffffff',
            _ring: true, ringR: 2, ringRMax: 22,
        });
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 6,
                y: y + (Math.random() - 0.5) * 4,
                vx: (Math.random() - 0.5) * 0.4,
                vy: -0.25 - Math.random() * 0.35,
                life: 40 + (Math.random() * 20) | 0,
                color: '#303030',
                _smoke: true,
            });
        }
        for (let i = 0; i < 22; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 1.2 + Math.random() * 3;
            this.particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 28 + (Math.random() * 10) | 0,
                color,
            });
        }
        for (let i = 0; i < 6; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
            const s = 1 + Math.random() * 2;
            this.particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 50,
                color: '#1a1208',
                _debris: true,
            });
        }
    }

    _tickParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p._ring) {
                p.ringR += (p.ringRMax - p.ringR) * 0.25;
                p.life--;
                if (p.life <= 0) this.particles.splice(i, 1);
                continue;
            }
            if (p._smoke) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy *= 0.98;
                p.life--;
                if (p.life <= 0) this.particles.splice(i, 1);
                continue;
            }
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p._debris ? 0.15 : 0.05;
            if (p._debris) p.vx *= 0.985;
            p.life--;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    // ==== draw ====
    draw() {
        const ctx = this.ctx;
        // R331: parallax-scrolling bg. Bg moves at 0.5x scroll so it
        // reads as distant cityscape. Tile horizontally so we always
        // cover the screen even when scroll is large.
        if (this.bgImg) {
            ctx.imageSmoothingEnabled = false;
            const scale = Math.max(GAME.W / this.bgImg.width, GAME.H / this.bgImg.height);
            const dw = this.bgImg.width * scale;
            const dh = this.bgImg.height * scale;
            // Parallax offset — bg moves 0.5x player scroll
            const bgOffset = -((this.scroll * 0.5) % dw);
            const bgY = (GAME.H - dh) / 2;
            // Render two copies side-by-side to handle wrap
            ctx.drawImage(this.bgImg, bgOffset,           bgY, dw, dh);
            ctx.drawImage(this.bgImg, bgOffset + dw,      bgY, dw, dh);
            if (bgOffset > -dw / 2) {
                ctx.drawImage(this.bgImg, bgOffset - dw,  bgY, dw, dh);
            }
            // R362: cross-fade DARK variant over the bright BG with a
            // flicker-driven alpha. Two oscillators: a slow sine breathe
            // (fires) at 0.04 rad/f + a fast noisy term (windows flicker)
            // updated every ~4 frames. Combine and clamp to [0, 0.7] so
            // the windows visibly toggle but the painting never goes
            // pitch-black.
            if (this.bgImgDark) {
                if ((this.t & 3) === 0) {
                    // Step in 4-frame chunks so the flicker doesn't strobe
                    this._bgFlickerNoise = Math.random();
                }
                const slow = (Math.sin(this.t * 0.04) + 1) * 0.5; // 0..1
                const noise = this._bgFlickerNoise || 0.5;
                // 60% slow breathe + 40% fast flicker → reads as warm
                // pulse with occasional dips. Scale so max ~ 0.65.
                const alpha = Math.min(0.65, 0.20 + slow * 0.20 + noise * 0.25);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.drawImage(this.bgImgDark, bgOffset,           bgY, dw, dh);
                ctx.drawImage(this.bgImgDark, bgOffset + dw,      bgY, dw, dh);
                if (bgOffset > -dw / 2) {
                    ctx.drawImage(this.bgImgDark, bgOffset - dw,  bgY, dw, dh);
                }
                ctx.restore();
            }
        } else {
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Flickering window-light ambience — randomly dim/bright tint over
        // the upper third to suggest fires + flickering building windows.
        if ((this.t % 4) === 0) this._flickerSeed = Math.random();
        const flick = 0.05 + (this._flickerSeed || 0.5) * 0.05;
        ctx.fillStyle = `rgba(255, 90, 30, ${flick})`;
        ctx.fillRect(0, 0, GAME.W, STREET_TOP);
        // R362: DISABLED R361's _drawWindowLights / _drawFireClusters /
        // _drawAmbientEmbers / _drawFireEmbers — those placed random
        // bright yellow rectangles at scene-init coords that DIDN'T
        // match the actual windows + fires baked into the painted bg.
        // Result: floating yellow vector boxes scattered across the
        // foreground rubble. User: "sprites not vectors for the windows
        // and fire. it has to match actual windows and placements of
        // the images in the background." Correct fix is a 2-frame
        // painted bg cross-fade keyed to the real window/fire positions
        // — coming in a follow-up commit. Until then, no vector overlay.
        // Floor line — subtle separator between street and far area
        ctx.fillStyle = 'rgba(20, 8, 12, 0.55)';
        ctx.fillRect(0, STREET_TOP - 1, GAME.W, 2);
        // Depth-sort entities so far ones draw first
        const drawList = [...this.enemies.filter(e => e.alive)].sort((a, b) => a.y - b.y);
        drawList.push({ _isPlayer: true });
        // Insertion-sort player so closer-y comes later
        drawList.sort((a, b) => {
            const ay = a._isPlayer ? this.player.y : a.y;
            const by = b._isPlayer ? this.player.y : b.y;
            return ay - by;
        });
        for (const e of drawList) {
            if (e._isPlayer) this._drawPlayer();
            else this._drawEnemy(e);
        }
        // Player bullets
        for (const b of this.bullets) {
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(b.x - this.scroll, b.y, 4, 2);
        }
        // Enemy bullets
        for (const b of this.enemyBullets) {
            ctx.fillStyle = '#ff8040';
            ctx.fillRect(b.x - this.scroll - 1, b.y - 1, 3, 3);
        }
        // R314+R331: typed particles. p.x is world-coords; subtract
        // scroll for the draw call.
        const sc = this.scroll;
        for (const p of this.particles) {
            if (p._ring) {
                const a = p.life / (p.maxLife || 18);
                ctx.save();
                ctx.globalAlpha = a;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(p.x - sc, p.y, p.ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } else if (p._smoke) {
                const a = Math.min(0.6, p.life / 50);
                ctx.globalAlpha = a;
                ctx.fillStyle = p.color;
                const px = (p.x | 0) - sc;
                ctx.fillRect(px - 1, (p.y | 0) - 1, 3, 3);
                ctx.fillRect(px + 1, (p.y | 0), 2, 2);
                ctx.fillRect(px - 2, (p.y | 0) + 1, 2, 2);
            } else if (p._debris) {
                const a = Math.min(1, p.life / 50);
                ctx.globalAlpha = a;
                ctx.fillStyle = p.color;
                ctx.fillRect((p.x | 0) - sc, p.y | 0, 2, 2);
            } else {
                const a = Math.min(1, p.life / 32);
                ctx.globalAlpha = a;
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - sc, p.y, 2, 2);
            }
        }
        ctx.globalAlpha = 1;
        // R362: removed _drawFireEmbers — see _drawScene comment above.
        // R365: foreground parallax props — burning cars, powerline poles
        // in the FRONT layer, scrolling 1.5x player speed for depth.
        this._drawForegroundProps(ctx);
        // R307: lightning flash overlay (above scene, below HUD)
        this._drawLightning(ctx);
        // HUD
        this._drawHUD();
        // Stage-clear overlay
        if (this.phase === 'clear') {
            const t = this.clearT;
            ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, t * 0.02)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            if (t > 60) {
                const text = this.data.clearText || 'STAGE CLEAR';
                drawText(ctx, text, GAME.W / 2, GAME.H / 2 - 8, '#ffe070', 2, 'center');
                const hint = this.data.nextStage ? '...' : 'PRESS X';
                const a = 0.6 + 0.4 * Math.sin(t * 0.15);
                ctx.globalAlpha = a;
                drawText(ctx, hint, GAME.W / 2, GAME.H / 2 + 12, '#a890b0', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }
    }

    _drawPlayer() {
        const ctx = this.ctx;
        const p = this.player;
        if (p.iframes > 0 && (p.iframes % 4 < 2)) return;
        // R331: player position is WORLD coords now; subtract scroll
        // when drawing.
        const drawX = p.x - this.scroll;
        const isMoving = (Math.abs(p.vx) + Math.abs(p.vy)) > 0.1;
        const runFrames = ['run_1', 'run_2', 'run_3', 'run_4'];
        const key = isMoving
            ? runFrames[Math.floor(p.runFrame) % runFrames.length]
            : 'idle';
        const img = sprites.images.get(key) || sprites.images.get('run_1');
        if (img) {
            const scale = depthScale(p.y);
            const dw = p.w * scale;
            const dh = p.h * scale;
            ctx.imageSmoothingEnabled = false;
            if (p.facing < 0) {
                ctx.save();
                ctx.translate(Math.round(drawX + dw), Math.round(p.y));
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dw, dh);
                ctx.restore();
            } else {
                ctx.drawImage(img, 0, 0, img.width, img.height,
                              Math.round(drawX), Math.round(p.y), dw, dh);
            }
        } else {
            ctx.fillStyle = '#80889a';
            ctx.fillRect(drawX, p.y, p.w, p.h);
        }
    }

    _drawEnemy(e) {
        const ctx = this.ctx;
        const baseKey = {
            scavenger:   this.spriteKeys.scavenger   || 'scavenger',
            drone:       this.spriteKeys.drone       || 'drone',
            helicopter:  this.spriteKeys.helicopter  || 'helicopter',
            brawler:     this.spriteKeys.brawler     || 'brawler',
        }[e.type];
        // R366: walk-cycle frame selection. Each painted sprite has
        // multi-frame variants <key>_1, <key>_2, (<key>_3). We cycle
        // based on _animT for walk and override to the attack-pose
        // frame when the enemy is winding up to swing.
        // Scavenger: 3 walk frames at 8f each → 24f loop
        // Drone: 2 hover frames at 10f each → 20f loop
        // Brawler: walk = frames 1+2 (12f each), attack = frame 3
        // Boss mech (uses boss_mecha_gates_*): same as brawler scheme
        e._animT = (e._animT || 0) + 1;
        let frameKey = baseKey;
        const attackTell = e.isBoss && e.attackCD > 0 && e.attackCD < 14;
        if (e.type === 'scavenger') {
            const f = Math.floor(e._animT / 8) % 3 + 1;
            if (sprites.has(`${baseKey}_${f}`)) frameKey = `${baseKey}_${f}`;
        } else if (e.type === 'drone') {
            const f = Math.floor(e._animT / 10) % 2 + 1;
            if (sprites.has(`${baseKey}_${f}`)) frameKey = `${baseKey}_${f}`;
        } else if (e.type === 'brawler') {
            if (attackTell && sprites.has(`${baseKey}_3`)) {
                frameKey = `${baseKey}_3`;
            } else {
                const f = Math.floor(e._animT / 12) % 2 + 1;
                if (sprites.has(`${baseKey}_${f}`)) frameKey = `${baseKey}_${f}`;
            }
        }
        const img = sprites.images.get(frameKey);
        const scale = depthScale(e.y);
        // R361: animated enemies — track per-frame phase + apply squash/bob
        // so they feel alive instead of being static decals.
        e._animT = (e._animT || 0) + 1;
        // Per-type animation:
        //   scavenger / brawler — walk-bob (squash y on stride beats)
        //   drone — fast hover wobble
        //   helicopter — hover-bob (already has rotor blur from boss path)
        let bobY = 0;
        let squashX = 1;
        let squashY = 1;
        if (e.type === 'scavenger' || e.type === 'brawler') {
            // R365: stronger walk-cycle. User said enemies "lack
            // animation, jump like one sprite". Bigger bob + clearer
            // stride beats + actual side-to-side body sway.
            const stride = (e._animT * 0.22);
            bobY = Math.sin(stride * 2) * (3 * scale);
            // Body sway — sine offset on x for hip motion
            e._strideOffX = Math.sin(stride) * (1.5 * scale);
            // Hard plant: deeper squash on each foot-fall
            const plantPhase = Math.sin(stride * 2);
            const plant = plantPhase > 0.7 ? (plantPhase - 0.7) / 0.3 * 0.12 : 0;
            squashX = 1 + plant;
            squashY = 1 - plant;
            // Tilt forward slightly while moving — sells momentum
            e._tilt = e.vx ? Math.sign(e.vx) * 0.08 : 0;
        } else if (e.type === 'drone') {
            bobY = Math.sin(e._animT * 0.32) * (3.5 * scale);
            e._strideOffX = Math.sin(e._animT * 0.18) * (1.5 * scale);
        } else if (e.type === 'helicopter') {
            bobY = Math.sin(e._animT * 0.10) * (3 * scale);
        }
        // Boss-only attack-windup tell — squash + shift before they swing
        if (e.isBoss && e.attackCD <= 8 && e.attackCD > 0) {
            const tele = (8 - e.attackCD) / 8;
            squashY = 1 - tele * 0.10;
            squashX = 1 + tele * 0.10;
            bobY -= tele * 2;   // rear back slightly
        }
        // R366: paint sprite at its NATIVE aspect ratio scaled to the
        // hitbox height. Drone is painted ~91x36 (wide), brawler ~30x56
        // (tall) — if we stretched both into their hitbox rects the art
        // would distort. Anchor at hitbox bottom-center so the painted
        // feet/skids land on the ground line. Hitbox dims (e.w / e.h)
        // continue to drive collision; only the *visual* uses native AR.
        const facing = (this.player.x + this.player.w / 2) > (e.x + e.w / 2) ? 1 : -1;
        const hitboxH = e.h * scale;
        // dw/dh default to hitbox dims (used by HP bar + procedural
        // fallback). Painted-image branch overrides them to native AR.
        let dw = e.w * scale * squashX;
        let dh = hitboxH * squashY;
        let dx, dy;
        if (img) {
            ctx.imageSmoothingEnabled = false;
            const drawScale = hitboxH / img.height * squashY;
            dh = img.height * drawScale;
            dw = img.width * drawScale * (squashX / squashY);
            // Anchor: bottom-center of hitbox = bottom-center of sprite
            const cx = e.x - this.scroll + (e.w * scale) / 2;
            dx = Math.round(cx - dw / 2);
            dy = Math.round(e.y + hitboxH - dh + bobY);
            if (facing < 0) {
                ctx.save();
                ctx.translate(dx + dw, dy);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dw, dh);
                ctx.restore();
            } else {
                ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
            }
            // R361: boss aggro pulse — boss flickers a red multiply tint
            // every ~30 frames while alive. Sells the menace.
            if (e.isBoss && (e._animT & 31) < 6) {
                ctx.save();
                ctx.globalCompositeOperation = 'multiply';
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = '#ff3040';
                ctx.fillRect(dx, dy, dw, dh);
                ctx.restore();
            }
            if (e.hitFlash > 0 && e.hitFlash % 2 === 0) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.65;
                if (facing < 0) {
                    ctx.translate(dx + dw, dy);
                    ctx.scale(-1, 1);
                    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dw, dh);
                } else {
                    ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
                }
                ctx.restore();
            }
        } else {
            ctx.fillStyle = e.type === 'helicopter' ? '#5a6a4a' : '#604030';
            ctx.fillRect(e.x - this.scroll, e.y, dw, dh);
        }
        // Mini HP bar above enemy if damaged
        if (e.hp < e.maxHp) {
            const bw = Math.round(dw);
            const fillW = Math.round((e.hp / e.maxHp) * bw);
            const hbX = e.x - this.scroll;
            ctx.fillStyle = '#2a0a14';
            ctx.fillRect(hbX, e.y - 4, bw, 2);
            ctx.fillStyle = '#ff5040';
            ctx.fillRect(hbX, e.y - 4, fillW, 2);
        }
    }

    _drawHUD() {
        const ctx = this.ctx;
        // R313: bezeled HP cells with low-HP pulse, matching the FPS arena.
        const lowHp = this.player.hp <= 2;
        const pulse = lowHp && ((this.t >> 3) & 1) === 0;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(4, 4, 8 + 6 * 8, 10);
        ctx.fillStyle = 'rgba(255, 200, 100, 0.55)';
        ctx.fillRect(4, 4, 8 + 6 * 8, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(4, 13, 8 + 6 * 8, 1);
        for (let i = 0; i < 6; i++) {
            const hot = i < this.player.hp;
            if (hot) {
                ctx.fillStyle = lowHp ? (pulse ? '#ffe070' : '#ff4040') : '#ff4040';
            } else {
                ctx.fillStyle = '#3a1018';
            }
            ctx.fillRect(6 + i * 8, 6, 6, 6);
            if (hot) {
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.fillRect(6 + i * 8, 6, 6, 1);
            }
        }
        // Lives bezel
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(4, 18, 18, 8);
        drawText(ctx, 'x' + Math.max(0, this.player.lives), 6, 20, '#ffcc80', 1, 'left');
        // Wave counter bezel
        const total = this.data.waves?.length || 1;
        const waveTxt = 'WAVE ' + Math.min(this.waveIdx + 1, total) + ' / ' + total;
        const waveBezelW = 52;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(GAME.W - waveBezelW - 2, 4, waveBezelW, 10);
        ctx.fillStyle = 'rgba(255, 200, 100, 0.45)';
        ctx.fillRect(GAME.W - waveBezelW - 2, 4, waveBezelW, 1);
        drawText(ctx, waveTxt, GAME.W - 6, 6, '#ffcc80', 1, 'right');

        // R337: boss HP bar at the bottom of the screen + name banner.
        // Mirrors the platformer boss HUD pattern (src/hud.js ~line 482).
        const boss = this._boss && this._boss.alive ? this._boss : null;
        if (boss) {
            const bx = 30, by = GAME.H - 18, bw = GAME.W - 60, bh = 6;
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(bx - 2, by - 8, bw + 4, bh + 12);
            drawText(ctx, boss.name || 'BOSS', GAME.W / 2, by - 7, '#ff5050', 1, 'center');
            const bp = boss.hp / boss.maxHp;
            ctx.fillStyle = '#1a0810';
            ctx.fillRect(bx, by, bw, bh);
            let barColor;
            if (bp > 0.75) barColor = '#7a1018';
            else if (bp > 0.25) barColor = '#c01a28';
            else barColor = (Math.sin(this.t * 0.2) > 0) ? '#ff5050' : '#ff9030';
            ctx.fillStyle = barColor;
            ctx.fillRect(bx, by, Math.max(0, Math.floor(bw * bp)), bh);
            ctx.fillStyle = '#fff';
            ctx.fillRect(bx, by, bw, 1);
        }
    }
}

// Per-enemy stats — easy to tune in one place.
const ENEMY_STATS = {
    // R361: ~75% bigger to match the new player size + read as SNES-scale
    // characters instead of NES-scale icons.
    scavenger: {
        w: 28, h: 40, hp: 3, speed: 0.7,
        attackRange: 22, fireRange: 28, damage: 1, score: 150,
    },
    drone: {
        w: 32, h: 26, hp: 4, speed: 0.6,
        attackRange: 70, fireRange: 110, damage: 1, score: 250,
    },
    helicopter: {
        w: 46, h: 30, hp: 6, speed: 0.9,
        attackRange: 110, fireRange: 150, damage: 1, score: 400,
    },
    brawler: {
        w: 36, h: 46, hp: 10, speed: 0.5,
        attackRange: 24, fireRange: 30, damage: 2, score: 800,
    },
};

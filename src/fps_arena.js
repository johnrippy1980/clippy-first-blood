// R261: locked-camera FPS arena, Contra base-infiltration style.
//
// Visual: pseudo-3D third-person corridor. Clippy is anchored lower-center,
// drawn at 1.5x scale facing AWAY from the camera (into the screen). The
// corridor recedes to a centered vanishing point with converging floor +
// ceiling ribs that sell depth without any actual 3D math.
//
// Progression: 4 sequential SEGMENTS gated by wave-clear.
//   Segment 1 — TURRET WAVE: 2 wall-mounted turrets fire downward arcs.
//   Segment 2 — GRUNT CHARGE: scampering grunts spawn at the vanishing
//                point and scale up as they run toward the camera.
//   Segment 3 — BARRIER: 2 more turrets + pulsing electric barriers the
//                player must time-strafe between.
//   Segment 4 — CORE: boss — exposed core ringed by 3 shield nodes; kill
//                shields first, then the core opens up.
// Between segments, the screen "advances" — corridor walls scale outward
// for 50f to simulate forward dolly. Player cannot back up.
//
// Player: strafes left/right along a ground rail at the bottom. Aims
// straight up (or diag with horizontal input). X = shoot. No jump.

import { GAME } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { sprites } from './sprites.js';
import { particles } from './particles.js';
import { RAGE_BARKS } from './player.js';
import { drawText, drawTextOutlined } from './pixelfont.js';

// ============== Layout ==============
const RAIL_Y       = GAME.H - 28;            // ground rail y
const PLAYER_W     = 24;                      // 1.5x from 16
const PLAYER_H     = 36;                      // 1.5x from 24
const PLAYER_SPEED = 1.5;
const PLAYER_X_MIN = 12;
const PLAYER_X_MAX = GAME.W - PLAYER_W - 12;

const VANISH_X     = GAME.W / 2;              // vanishing point x (center)
const VANISH_Y     = 64;                      // vanishing point y (upper-mid)
const BACK_WALL_Y  = 56;                      // top of corridor floor

const BULLET_SPEED         = 4.5;
const BULLET_FIRE_COOLDOWN = 6;

// ============== Enemies ==============
const TURRET_W = 28, TURRET_H = 22;
const TURRET_HP = 6;
const TURRET_FIRE_PERIOD = 80;
const TURRET_BULLET_SPEED = 1.7;

const GRUNT_HP = 3;
const GRUNT_FIRE_PERIOD = 120;
const GRUNT_RUN_FRAMES = 240;     // time to traverse from far → near

const BARRIER_PERIOD = 110;       // electric barrier cycle (on/off)
const BARRIER_ON_FRAMES = 50;

const SHIELD_HP   = 4;
const CORE_HP     = 30;
const CORE_FIRE_PERIOD = 60;

// Visual depth helpers — t in [0..1] where 0 = at vanishing point, 1 = at player rail.
function depthY(t)     { return BACK_WALL_Y + (RAIL_Y - BACK_WALL_Y) * t; }
function depthScale(t) { return 0.25 + 0.75 * t; }      // 0.25× far, 1.0× near
function depthX(originX, t) {
    // Linear interp from vanishing point to the entity's anchor x at depth 1.
    return VANISH_X + (originX - VANISH_X) * t;
}

export class FpsArena {
    constructor(stageData, ctx, game) {
        this.ctx = ctx;
        this.game = game;
        this.data = stageData;
        this.t = 0;

        // Progression — R280: startSegment lets stages skip ahead (e.g.
        // BALLMER ARENA boots straight into segment 3 with no corridor waves).
        this.segment = stageData.startSegment || 0;
        this.phase = 'fight';
        this.advanceT = 0;
        // R280: ending style — 'core' (default — segment 3 is a boss fight)
        // or 'door' (segment 3 is empty corridor that clears the stage).
        this.endingStyle = stageData.endingStyle || 'core';

        // Player
        this.player = {
            x: GAME.W / 2 - PLAYER_W / 2,
            y: RAIL_Y - PLAYER_H,
            w: PLAYER_W, h: PLAYER_H,
            hp: 6,
            maxHp: 6,
            lives: 3,                  // R262: was effectively 1 — give 3 retries
            iframes: 0,
            shootCD: 0,
            facing: 0,
            runFrame: 0,
            score: 0,
            kills: 0,    // R489: kill counter for achievements
            // R418: rage mode parity with platformer + beatem
            rageFrames: 0,
            rageMaxFrames: 300,
            rageUsedThisStage: false,
        };

        // Entity pools — populated per segment
        this.turrets = [];
        this.grunts = [];
        this.barriers = [];
        this.shields = [];
        this.core = null;

        this.bullets = [];
        this.enemyBullets = [];
        this.particles = [];

        // R265: per-segment backdrops so the corridor visibly transitions
        // as the player advances. Defaults to sewer→lab progression; the
        // Ballmer office stage overrides to all-office backdrops.
        this.bgKeys = stageData.bgKeys || [
            'bg_sewer',
            'bg_sewer',
            'bg_sewer_lab',
            'bg_sewer_lab',
        ];
        // R268: per-stage sprite-key overrides so different FPS stages can
        // theme their turrets/grunts/shields/core differently while sharing
        // the segment scaffolding. Defaults to Dr. Spindler's lab roster.
        this.spriteKeys = Object.assign({
            turret: 'lab_turret',
            grunt:  'lab_grunt',
            shield: 'lab_shield',
            core:   'lab_core',
        }, stageData.spriteKeys || {});
        // R273: per-stage SFX overrides for enemy fire / boss attacks. Lab
        // defaults to generic 'enemyShoot'; office stage uses themed sounds.
        this.sfxKeys = Object.assign({
            turretFire: 'enemyShoot',
            gruntFire:  'enemyShoot',
            coreFire:   'enemyShoot',
        }, stageData.sfxKeys || {});
        // R273: ambient hum looper. Office stage sets a per-stage ambient
        // SFX key (e.g. 'fluorescent') that re-triggers every ~1.5s.
        this.ambientKey = stageData.ambientKey || null;
        this.ambientT = 0;
        this._refreshBg();
        // R307→R308: atmospheric particle pool — drifting embers/sparks/haze
        // across the corridor. Per-stage spec; INDOOR corridors get either
        // null (no embers) or a soft indoor variant (dust motes / stage haze).
        // Fire embers are reserved for outdoor or burning environments.
        const themeEmber = {
            // Sewer tunnels — bioluminescent green specks, slow drift, no rise
            'bg_sewer_lab':       { color: '#80c060', count: 6,  rise: 0.05, alpha: 0.45 },
            'bg_sewer':           { color: '#80c060', count: 5,  rise: 0.05, alpha: 0.45 },
            // Indoor office — Ballmer arena. No fire embers; just faint dust
            // motes drifting on HVAC. Cool grey/blue, very slow.
            'bg_office':          { color: '#a0b0c0', count: 5,  rise: 0.05, alpha: 0.22 },
            // Indoor keynote corridor — stage fog/haze (fog machine).
            // Purple, low count, drifts almost flat.
            'bg_keynote_corridor':{ color: '#a070ff', count: 4,  rise: 0.05, alpha: 0.28 },
            // OUTDOOR apocalypse — burning city, angry orange embers.
            'bg_apocalypse':      { color: '#ff5020', count: 14, rise: 0.50, alpha: 0.55 },
        };
        // No spec = no particles. Don't fall through to a generic ember default
        // because most corridors are indoor; we'd be drawing fire inside an office.
        this._emberSpec = themeEmber[stageData.bgKey] || null;
        this._ambientEmbers = [];
        if (this._emberSpec) {
            for (let i = 0; i < this._emberSpec.count; i++) {
                this._ambientEmbers.push({
                    x: Math.random() * GAME.W,
                    y: GAME.H * 0.4 + Math.random() * GAME.H * 0.5,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: -this._emberSpec.rise * (0.5 + Math.random()),
                    phase: Math.random() * Math.PI * 2,
                });
            }
        }
        // R307: lightning trigger for apocalypse-themed FPS stages.
        this._lightningT = 0;
        this._lightningCooldown = 180 + (Math.random() * 360) | 0;

        // R280: boot the configured starting segment (default 0). The
        // Ballmer arena overrides to 3 so the player drops straight into
        // the boss fight without corridor waves.
        this._loadSegment(this.segment);
    }

    // ============== Segment loaders ==============
    _loadSegment(n) {
        this.turrets = [];
        this.grunts = [];
        this.barriers = [];
        this.shields = [];
        this.core = null;

        if (n === 0) {
            // SEGMENT 1 — two wall-mounted turrets, no other hazards.
            this.turrets.push({
                originX: 36, t: 0.45,
                w: TURRET_W, h: TURRET_H,
                hp: TURRET_HP, alive: true, fireT: 0, hitFlash: 0,
            });
            this.turrets.push({
                originX: GAME.W - 36, t: 0.45,
                w: TURRET_W, h: TURRET_H,
                hp: TURRET_HP, alive: true, fireT: 30, hitFlash: 0,
            });
        } else if (n === 1) {
            // SEGMENT 2 — grunt charge. 3 grunts spawn from vanishing point.
            for (let i = 0; i < 3; i++) {
                this.grunts.push({
                    originX: 80 + i * 48,    // staggered lanes
                    spawnDelay: i * 40,
                    runT: 0,
                    hp: GRUNT_HP,
                    alive: true,
                    fireT: 60 + i * 20,
                    hitFlash: 0,
                    muzzleT: 0,
                });
            }
        } else if (n === 2) {
            // SEGMENT 3 — barrier + two turrets. Player must time strafe.
            this.barriers.push({ phase: 0, alive: true });
            this.turrets.push({
                originX: 56, t: 0.5,
                w: TURRET_W, h: TURRET_H,
                hp: TURRET_HP, alive: true, fireT: 20, hitFlash: 0,
            });
            this.turrets.push({
                originX: GAME.W - 56, t: 0.5,
                w: TURRET_W, h: TURRET_H,
                hp: TURRET_HP, alive: true, fireT: 50, hitFlash: 0,
            });
        } else if (n === 3) {
            // R280: segment 3 behavior depends on endingStyle.
            if (this.endingStyle === 'door') {
                // Office approach — final segment is an empty corridor with
                // the boss-room door visible at the vanishing point. After
                // a brief beat the stage clears (player walks through).
                this.phase = 'doorApproach';
                this.doorT = 0;
            } else {
                // Default — boss fight with core + 3 orbiting shields.
                this.core = {
                    x: GAME.W / 2,
                    y: BACK_WALL_Y + 18,
                    w: 32, h: 24,
                    hp: CORE_HP, maxHp: CORE_HP, alive: true,
                    fireT: 0, hitFlash: 0,
                };
                const radius = 28;
                for (let i = 0; i < 3; i++) {
                    this.shields.push({
                        angle: (i / 3) * Math.PI * 2,
                        radius,
                        hp: SHIELD_HP, alive: true, hitFlash: 0,
                    });
                }
                this.phase = 'bossEntry';
                this.bossEntryT = 0;
            }
        }
    }

    _refreshBg() {
        const key = this.bgKeys[Math.min(this.segment, this.bgKeys.length - 1)];
        this.bgImg = sprites.images.get(key) || sprites.images.get(this.data.bgKey) || null;
    }

    // R307: drift ambient embers — they rise toward the vanishing point with
    // wind gusts. Cheap, decorative; no collision.
    _tickAmbientEmbers() {
        if (!this._emberSpec || !this._ambientEmbers) return;
        for (const e of this._ambientEmbers) {
            const gust = 1 + Math.sin((this.t + e.phase * 40) * 0.02) * 0.6;
            e.x += e.vx * gust;
            e.y += e.vy;
            if (e.y < 60) {
                e.y = GAME.H + 4;
                e.x = Math.random() * GAME.W;
                e.vx = (Math.random() - 0.5) * 0.3;
                e.vy = -this._emberSpec.rise * (0.5 + Math.random());
            }
            if (e.x < -4) e.x = GAME.W + 4;
            if (e.x > GAME.W + 4) e.x = -4;
        }
    }

    _drawAmbientEmbers(ctx) {
        if (!this._emberSpec || !this._ambientEmbers) return;
        // Indoor specs (dust motes, stage haze) use normal blend so they
        // don't glow like fire. Outdoor / fire specs use additive.
        const isFire = this._emberSpec.rise >= 0.3;
        ctx.save();
        if (isFire) ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this._emberSpec.color;
        const baseA = this._emberSpec.alpha ?? 0.55;
        for (const e of this._ambientEmbers) {
            const flicker = isFire
                ? 0.6 + 0.4 * Math.sin((this.t + e.phase * 50) * 0.18)
                : 0.85 + 0.15 * Math.sin((this.t + e.phase * 50) * 0.05);
            ctx.globalAlpha = baseA * flicker;
            ctx.fillRect(e.x | 0, e.y | 0, 1, 1);
        }
        ctx.restore();
    }

    _tickLightning() {
        // Only enabled for apocalypse-themed stages
        const isApocalypse = this.data.bgKey === 'bg_apocalypse';
        if (!isApocalypse) return;
        this._lightningCooldown--;
        if (this._lightningCooldown <= 0) {
            this._lightningT = 16;
            this._lightningCooldown = 240 + (Math.random() * 360) | 0;
        }
        if (this._lightningT > 0) this._lightningT--;
    }

    _drawLightning(ctx) {
        if (this._lightningT <= 0) return;
        let a;
        if (this._lightningT > 12) a = (16 - this._lightningT) / 4;
        else a = this._lightningT / 12;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255, 180, 120, 0.45)';
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        ctx.restore();
    }

    _segmentClear() {
        if (this.segment >= 3) return false;
        // Segment 0: all turrets dead
        if (this.segment === 0) return this.turrets.every(t => !t.alive);
        // Segment 1: all grunts dead
        if (this.segment === 1) return this.grunts.every(g => !g.alive);
        // Segment 2: turrets dead (barrier persists as ambient hazard)
        if (this.segment === 2) return this.turrets.every(t => !t.alive);
        return false;
    }

    // ============== tick ==============
    update() {
        // R420: hitstop on big impacts (boss kill etc) — freeze frame
        if (this._hitStopFrames > 0) {
            this._hitStopFrames--;
            return;
        }
        // R420: slow-mo — skip every other tick
        if (this._slowMoFrames > 0) {
            this._slowMoFrames--;
            this._slowMoSkip = !this._slowMoSkip;
            if (this._slowMoSkip) return;
        }
        this.t++;
        // R307: ambient embers + lightning. Always tick — visual depth on
        // every frame regardless of phase.
        this._tickAmbientEmbers();
        this._tickLightning();
        // R386: data-driven ambient props — same as beatem; the top-level
        // play loop doesn't run while FPS_PLAY is active.
        if (this.game._ambientProps) {
            this.game._ambientProps.update();
            for (const p of this.game._ambientProps.props) {
                if (p._struck) { p._struck = false; this.game.camera.shake?.(3); }
            }
        }
        // R273: ambient SFX looper (office fluorescent hum, etc.) — fires
        // the configured ambient key every ~1.2s so the buzz feels continuous.
        if (this.ambientKey) {
            this.ambientT--;
            if (this.ambientT <= 0) {
                audio.sfx(this.ambientKey);
                this.ambientT = 75;   // ~1.25s at 60fps
            }
        }
        if (this.phase === 'clear') {
            this.clearT = (this.clearT || 0) + 1;
            // R280/R283: auto-advance to the next FPS stage if one is configured.
            // Stage 6 (office approach) → stage 7 (Ballmer arena). Route
            // through STAGE_CARD so the painted arena reveal cinematic fires.
            const autoNext = this.data.nextStage;
            const transitionToNext = () => {
                audio.stopTrack();
                this.game._pendingStage = autoNext;
                this.game._extraCards = null;
                this.game.storyTimer = 0;
                this.game.scene = 'stageCard';
            };
            if (autoNext && this.clearT >= 120) {
                transitionToNext();
                return;
            }
            if (this.clearT > 60 &&
                (input.isPressed('shoot') || input.isPressed('jump') ||
                 input.isPressed('start') || input.isPressed('pause'))) {
                if (autoNext) {
                    transitionToNext();
                    return;
                }
                // R277: cut music immediately on title exit.
                audio.stopTrack();
                this.game._fadeTo('title');
            }
            return;
        }
        if (this.phase === 'advance') {
            this.advanceT++;
            this._tickPlayer();          // player still strafes during dolly
            this._tickBullets();
            this._tickEnemyBullets();    // residual shots
            this._tickParticles();
            if (this.advanceT >= 60) {
                this.segment++;
                this._loadSegment(this.segment);
                this._refreshBg();
                this.advanceT = 0;
                // R280: _loadSegment already sets phase appropriately:
                // segments 0-2 leave it as 'fight', segment 3 sets either
                // 'bossEntry' (core ending) or 'doorApproach' (door ending).
                // Don't overwrite it here.
                if (this.segment !== 3) this.phase = 'fight';
            }
            return;
        }
        this._tickPlayer();
        this._tickBullets();
        this._tickEnemyBullets();
        if (this.phase === 'fight') {
            if (this.segment === 0) this._tickTurrets();
            else if (this.segment === 1) this._tickGrunts();
            else if (this.segment === 2) { this._tickTurrets(); this._tickBarriers(); }
            if (this._segmentClear()) {
                this.phase = 'advance';
                this.advanceT = 0;
                audio.sfx('bossEntrance');
            }
        } else if (this.phase === 'bossEntry') {
            this._tickBossEntry();
        } else if (this.phase === 'boss') {
            this._tickShields();
            this._tickCore();
        } else if (this.phase === 'doorApproach') {
            // R280: office stage's segment 4 — empty corridor + boss-door at
            // the vanishing point. After ~180 frames the stage clears.
            this.doorT++;
            if (this.doorT >= 180) {
                this.phase = 'clear';
                this.clearT = 0;
                audio.stopTrack();
            }
        } else if (this.phase === 'mechaEject') {
            // R308: Mecha-Gates phase-1 → phase-2 cinematic. Player can
            // still strafe + shoot (handled above), but no boss ticks
            // happen during the eject sequence.
            this._tickMechaEject();
        }
        this._tickParticles();
    }

    _tickPlayer() {
        const ax = input.axis();
        const p = this.player;
        // R418: rage tick + 1.5× movement
        if (p.rageFrames > 0) p.rageFrames--;
        const rageMul = p.rageFrames > 0 ? 1.5 : 1;
        p.x += ax.x * PLAYER_SPEED * rageMul;
        if (p.x < PLAYER_X_MIN) p.x = PLAYER_X_MIN;
        if (p.x > PLAYER_X_MAX) p.x = PLAYER_X_MAX;
        if (Math.abs(ax.x) > 0.1) p.runFrame = (p.runFrame + 0.25) % 4;
        if (ax.x < -0.1)      p.facing = -1;
        else if (ax.x > 0.1)  p.facing = 1;
        else                  p.facing = 0;
        // R350: jump support — FPS player can now jump + double-jump
        // to dodge the laser-barrier band. Jump-1 has full strength;
        // jump-2 (double) has 70%. Gravity returns player to RAIL_Y.
        if (p.vy == null) p.vy = 0;
        if (p.jumpsLeft == null) p.jumpsLeft = 2;
        const onGround = p.y >= RAIL_Y - PLAYER_H - 0.5;
        if (onGround) {
            p.y = RAIL_Y - PLAYER_H;
            p.vy = 0;
            p.jumpsLeft = 2;
        }
        if (input.isPressed && input.isPressed('jump') && p.jumpsLeft > 0) {
            // First jump: full hop. Second: shorter (double-jump).
            p.vy = (p.jumpsLeft === 2) ? -5.5 : -4.0;
            p.jumpsLeft--;
            audio.sfx?.('jump');
        }
        p.vy += 0.32;   // gravity
        p.y += p.vy;
        if (p.y > RAIL_Y - PLAYER_H) {
            p.y = RAIL_Y - PLAYER_H;
            p.vy = 0;
            p.jumpsLeft = 2;
        }
        if (p.iframes > 0) p.iframes--;
        if (p.shootCD > 0) p.shootCD--;
        // R484: low-HP heartbeat at HP ≤ 1
        if (p.hp <= 1 && p.hp > 0) {
            this._hbTick = (this._hbTick || 0) + 1;
            if (this._hbTick >= 50) {
                audio.sfx?.('heartbeat');
                this._hbTick = 0;
            }
        } else {
            this._hbTick = 0;
        }
        if (input.isHeld('shoot') && p.shootCD <= 0) {
            this._fire();
            // R418: rage halves fire cooldown
            p.shootCD = p.rageFrames > 0 ? Math.max(2, Math.floor(BULLET_FIRE_COOLDOWN / 2)) : BULLET_FIRE_COOLDOWN;
        }
    }

    _fire() {
        const p = this.player;
        // Bullet starts at the player's "muzzle" — head height, slightly
        // offset by facing so diag shots feel like they come from the side.
        const vx = p.facing * 1.4;
        const vy = -BULLET_SPEED;
        this.bullets.push({
            x: p.x + p.w / 2 - 1 + p.facing * 3,
            y: p.y + 4,
            vx, vy,
            life: 90,
        });
        audio.sfx('mg');
    }

    _tickBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
            if (b.life <= 0 || b.y < -10 || b.x < -10 || b.x > GAME.W + 10) {
                this.bullets.splice(i, 1);
                continue;
            }
            // Hit turrets
            let consumed = false;
            for (const t of this.turrets) {
                if (!t.alive) continue;
                const tx = depthX(t.originX, t.t) - t.w / 2;
                const ty = depthY(t.t) - t.h;
                if (b.x >= tx && b.x <= tx + t.w && b.y >= ty && b.y <= ty + t.h) {
                    t.hp--;
                    t.hitFlash = 4;
                    this.bullets.splice(i, 1);
                    consumed = true;
                    if (t.hp <= 0) {
                        t.alive = false;
                        this._scoreKill(1000, tx + t.w / 2, ty);
                        audio.sfx('bossHit');
                        this._explosion(tx + t.w / 2, ty + t.h / 2, '#ff6020');
                    } else {
                        audio.sfx('hit');
                    }
                    break;
                }
            }
            if (consumed) continue;
            // Hit grunts
            for (const g of this.grunts) {
                if (!g.alive || g.runT < g.spawnDelay) continue;
                const tt = Math.min(1, (g.runT - g.spawnDelay) / GRUNT_RUN_FRAMES);
                const gx = depthX(g.originX, tt) - 8 * depthScale(tt);
                const gy = depthY(tt) - 24 * depthScale(tt);
                const gw = 16 * depthScale(tt);
                const gh = 24 * depthScale(tt);
                if (b.x >= gx && b.x <= gx + gw && b.y >= gy && b.y <= gy + gh) {
                    g.hp--;
                    g.hitFlash = 4;
                    this.bullets.splice(i, 1);
                    consumed = true;
                    if (g.hp <= 0) {
                        g.alive = false;
                        this._scoreKill(750, gx + gw / 2, gy);
                        audio.sfx('enemyDie');
                        this._explosion(gx + gw / 2, gy + gh / 2, '#a8c060');
                    } else {
                        audio.sfx('hit');
                    }
                    break;
                }
            }
            if (consumed) continue;
            // Hit shields (must be killed before core)
            if (this.shields.length && this.core && this.core.alive) {
                const allShieldsDead = this.shields.every(s => !s.alive);
                for (const s of this.shields) {
                    if (!s.alive) continue;
                    const sx = this.core.x + Math.cos(s.angle) * s.radius - 5;
                    const sy = this.core.y + Math.sin(s.angle) * s.radius - 5;
                    if (b.x >= sx && b.x <= sx + 10 && b.y >= sy && b.y <= sy + 10) {
                        s.hp--;
                        s.hitFlash = 4;
                        this.bullets.splice(i, 1);
                        consumed = true;
                        if (s.hp <= 0) {
                            s.alive = false;
                            this._scoreKill(1500, sx, sy);
                            audio.sfx('bossHit');
                            this._explosion(sx + 5, sy + 5, '#a060ff');
                        } else {
                            audio.sfx('hit');
                        }
                        break;
                    }
                }
                if (consumed) continue;
                // Core only takes damage when all shields are dead
                if (allShieldsDead) {
                    const c = this.core;
                    if (b.x >= c.x - c.w / 2 && b.x <= c.x + c.w / 2 &&
                        b.y >= c.y - c.h / 2 && b.y <= c.y + c.h / 2) {
                        c.hp--;
                        c.hitFlash = 4;
                        this.bullets.splice(i, 1);
                        if (c.hp <= 0) {
                            // R308: Mecha-Gates has a phase 2 — pilot ejects
                            // from the destroyed mech and the fight continues
                            // against Gates-on-foot with reduced HP + faster
                            // attacks. All other bosses end the fight here.
                            const isMechaP1 = (this.data.bossKind === 'MECHA_GATES' && !c.isPhase2);
                            if (isMechaP1) {
                                this._mechaEject();
                                audio.sfx('bossHit');
                            } else {
                                c.alive = false;
                                this.player.score += 9500;
                                audio.sfx('bossDie');
                                this._explosion(c.x, c.y, '#ff60a0');
                                // R314: chunky shake on boss death — three
                                // staggered bursts feel like one big detonation
                                this._explosion(c.x - 12, c.y + 5, '#ffa040');
                                this._explosion(c.x + 12, c.y - 5, '#ffa040');
                                this._shake(7, 26);
                                // R420: hitstop + slow-mo on FPS boss kill
                                this._hitStopFrames = Math.max(this._hitStopFrames || 0, 14);
                                this._slowMoFrames = Math.max(this._slowMoFrames || 0, 60);
                                this.phase = 'clear';
                                this.clearT = 0;
                            }
                        } else {
                            audio.sfx('bossHit');
                        }
                    }
                }
            }
        }
    }

    _tickEnemyBullets() {
        const p = this.player;
        if (this._whizzCooldown > 0) this._whizzCooldown--;
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            // R271: physics-projectiles (chairs) — apply gravity each tick
            if (b.gravity) b.vy += b.gravity;
            if (b.isChair || b.isFloppy) b.spinT = (b.spinT || 0) + 1;
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
            if (b.life <= 0 || b.y > GAME.H + 10) {
                this.enemyBullets.splice(i, 1);
                continue;
            }
            // R486: near-miss whizz SFX
            if (!b._whizzPlayed && (this._whizzCooldown || 0) <= 0) {
                const pdx = b.x - (p.x + p.w / 2);
                const pdy = b.y - (p.y + p.h / 2);
                const d2 = pdx * pdx + pdy * pdy;
                if (b._prevD2 != null && d2 > b._prevD2 && b._prevD2 < 16 * 16) {
                    audio.sfx?.('whizz');
                    this._whizzCooldown = 18;
                    b._whizzPlayed = true;
                }
                b._prevD2 = d2;
            }
            // Chair hitbox is larger than a bullet — uses ~16×16 instead of 3×3
            const hitW = b.isChair ? 18 : 3;
            const hitH = b.isChair ? 18 : 3;
            if (p.iframes <= 0 &&
                b.x >= p.x - hitW/2 && b.x <= p.x + p.w + hitW/2 &&
                b.y >= p.y - hitH/2 && b.y <= p.y + p.h + hitH/2) {
                // R465: bullet velocity angle for damage indicator
                this._lastHitAngle = Math.atan2(b.vy || 0, b.vx || 0) + Math.PI;
                this._damagePlayer(b.isChair ? 2 : 1);
                this.enemyBullets.splice(i, 1);
            }
        }
    }

    // R418: shared damage path for FPS — gated by rage mode, auto-triggers
    // rage on the frame HP drops to 1.
    _damagePlayer(dmg) {
        const p = this.player;
        if (p.rageFrames > 0) {
            p.iframes = Math.max(p.iframes, 12);
            return;
        }
        p.hp -= dmg;
        p.iframes = 60;
        audio.sfx('playerHit');
        // R465: arm directional damage indicator
        this._damageIndicatorT = 30;
        if (p.hp <= 0) this._onPlayerDeath();
        else if (p.hp <= 1 && !p.rageUsedThisStage) this._triggerRage();
    }

    _triggerRage() {
        const p = this.player;
        p.rageFrames = p.rageMaxFrames;
        p.rageUsedThisStage = true;
        audio.sfx?.('powerup');
        audio.sfx?.('explosion');
        particles.floatingText?.(p.x + p.w / 2, p.y - 10, 'RAGE!!', '#ff3030', 70, -0.9, 1.4);
        // R418b: bark so the player reads WHY they're invuln
        const bark = RAGE_BARKS[(Math.random() * RAGE_BARKS.length) | 0];
        particles.floatingText?.(p.x + p.w / 2, p.y - 26, bark, '#ffe070', 150, -0.35, 1);
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            particles.spawn?.(p.x + p.w / 2, p.y + p.h / 2,
                Math.cos(a) * 2.4, Math.sin(a) * 2.4, 24, '#ff5050', 2, 0.05);
        }
    }

    // R465: combo-aware score gain. Chained kills within 4s bump multiplier.
    // Returns the effective gain (post-multiplier) for any callers that need it.
    _scoreKill(base, x, y) {
        const t = this.t || 0;
        if (this._lastKillT == null || (t - this._lastKillT) > 240) {
            this._comboCount = 1;
        } else {
            this._comboCount = (this._comboCount || 0) + 1;
        }
        this._lastKillT = t;
        const mult = (this._comboCount >= 5) ? 4 :
                     (this._comboCount >= 4) ? 3 :
                     (this._comboCount >= 3) ? 2 : 1;
        const gain = base * mult;
        this.player.score += gain;
        // R489: kill counter for achievements
        this.player.kills = (this.player.kills || 0) + 1;
        if (mult > 1 && x != null && y != null) {
            particles.floatingText?.(x, y - 6, `COMBO ×${mult}!`,
                mult >= 4 ? '#ff80ff' : mult >= 3 ? '#ff8050' : '#ffe070',
                50, -0.6, 1);
            audio.sfx?.('combo' + Math.min(4, mult - 1));
        }
        return gain;
    }

    // R262: respawn in-place when HP hits 0, only fall to gameOver after all
    // lives are spent. Clears enemy bullets so the player doesn't immediately
    // re-die into the same shot pattern that killed them.
    _onPlayerDeath() {
        this.player.lives--;
        this.enemyBullets = [];
        if (this.player.lives < 0) {
            this.game._fadeTo('gameOver');
            return;
        }
        audio.sfx('playerHit');
        this.player.hp = this.player.maxHp;
        this.player.iframes = 120;     // 2s of grace
        // Briefly recenter the player so they don't respawn standing in a
        // boss bullet stream.
        this.player.x = GAME.W / 2 - this.player.w / 2;
    }

    _tickTurrets() {
        for (const t of this.turrets) {
            if (!t.alive) continue;
            if (t.hitFlash > 0) t.hitFlash--;
            t.fireT++;
            if (t.fireT >= TURRET_FIRE_PERIOD) {
                t.fireT = 0;
                this._turretVolley(t);
            }
        }
    }

    _turretVolley(t) {
        const cx = depthX(t.originX, t.t);
        const cy = depthY(t.t) - t.h / 2;
        // Aim partly toward the player so the 3-way isn't always neutral
        const px = this.player.x + this.player.w / 2;
        const dx = (px - cx) * 0.25;
        for (const sp of [-0.5, 0, 0.5]) {
            this.enemyBullets.push({
                x: cx, y: cy,
                vx: sp * TURRET_BULLET_SPEED + dx * 0.05,
                vy: TURRET_BULLET_SPEED,
                life: 240,
            });
        }
        audio.sfx(this.sfxKeys.turretFire);
    }

    _tickGrunts() {
        for (const g of this.grunts) {
            if (!g.alive) continue;
            if (g.hitFlash > 0) g.hitFlash--;
            if (g.muzzleT > 0) g.muzzleT--;
            g.runT++;
            if (g.runT < g.spawnDelay) continue;
            const tt = (g.runT - g.spawnDelay) / GRUNT_RUN_FRAMES;
            // Grunt reaches the player's rail and explodes (rushes player)
            if (tt >= 1) {
                g.alive = false;
                const cx = depthX(g.originX, 1);
                this._explosion(cx, RAIL_Y - 12, '#a8c060');
                // Splash damage if grunt is close to player
                const dx = cx - (this.player.x + this.player.w / 2);
                if (Math.abs(dx) < 24 && this.player.iframes <= 0) {
                    this._damagePlayer(1);
                }
                continue;
            }
            // Fire forward periodically
            g.fireT++;
            if (g.fireT >= GRUNT_FIRE_PERIOD) {
                g.fireT = 0;
                g.muzzleT = 6;
                const cx = depthX(g.originX, tt);
                const cy = depthY(tt) - 14 * depthScale(tt);
                // R270: grunt bullets get the floppy-disk projectile sprite
                // in the office stage. The bullet is flagged so the draw
                // loop picks the right animation frame.
                this.enemyBullets.push({
                    x: cx, y: cy,
                    vx: 0, vy: 1.4,
                    life: 200,
                    isFloppy: !!this.data.gruntBulletAnimKey,
                    spinT: 0,
                });
                audio.sfx(this.sfxKeys.gruntFire);
            }
        }
    }

    _tickBarriers() {
        for (const b of this.barriers) {
            b.phase = (b.phase + 1) % BARRIER_PERIOD;
            const on = b.phase < BARRIER_ON_FRAMES;
            if (!on) continue;
            // R350: electric laser ACTUALLY damages the player when their
            // feet are on the ground rail during an active pulse. Player
            // must JUMP (or double-jump) to clear the laser sweep.
            // The laser fires at ground-rail level — the player's standing
            // foot position. Their chest at jump-apex clears the danger.
            const p = this.player;
            const playerFeetY = p.y + p.h;     // bottom of player AABB
            // Danger zone: 18 px above and below the rail line.
            // When grounded, feet are at RAIL_Y which is inside the zone.
            // When jumping, feet rise above RAIL_Y - 18 → safe.
            const dangerTop = RAIL_Y - 18;
            const dangerBot = RAIL_Y + 18;
            if (p.iframes <= 0 && playerFeetY > dangerTop && playerFeetY < dangerBot) {
                // R418: route through shared path so rage gates lightning too
                const before = p.hp;
                this._damagePlayer(1);
                if (p.hp !== before) {
                    audio.sfx?.('thunder');
                    this._explosion?.(p.x + p.w / 2, p.y + p.h - 4, '#a0e0ff');
                    if (this._shake) this._shake(4, 12);
                }
            }
        }
    }

    _tickBossEntry() {
        this.bossEntryT = (this.bossEntryT || 0) + 1;
        if (this.bossEntryT >= 90) {
            this.phase = 'boss';
        }
    }

    _tickShields() {
        for (const s of this.shields) {
            if (!s.alive) continue;
            if (s.hitFlash > 0) s.hitFlash--;
            s.angle += 0.03;
        }
    }

    _tickCore() {
        const c = this.core;
        if (!c || !c.alive) return;
        if (c.hitFlash > 0) c.hitFlash--;
        c.fireT++;
        // R308: phase-2 Mecha-Gates fires faster via fireCdMul shrinkage
        const firePeriod = CORE_FIRE_PERIOD * (c.fireCdMul || 1);
        // R465: charge-tell — 20f windup before attack, red flash on boss
        if (c.fireT >= firePeriod - 20 && c.fireT < firePeriod) {
            if (c.fireT === firePeriod - 20) audio.sfx?.('bossChargeTell');
            c.hitFlash = Math.max(c.hitFlash || 0, 1);   // red glow during charge
        }
        if (c.fireT >= firePeriod) {
            c.fireT = 0;
            c.hitFlash = 0;
            // R271: per-stage attack pattern. Default = 5-way spread fan
            // (Spindler's bio-core). Ballmer = chair-throw arcs.
            const style = this.data.coreAttackStyle || 'spread5';
            if (style === 'chair') {
                this._fireChairs(c);
            } else {
                for (let i = -2; i <= 2; i++) {
                    this.enemyBullets.push({
                        x: c.x, y: c.y + c.h / 2,
                        vx: i * 0.6,
                        vy: 1.8,
                        life: 220,
                    });
                }
            }
            audio.sfx(this.sfxKeys.coreFire);
        }
    }

    // R271: Ballmer's chair-throw attack. Lobs 1-2 chairs in arcs toward the
    // player's current x, with rotation animation. Chairs use the painted
    // chair sprite (4-frame spin) and are physics-projectiles — gravity-
    // affected. The chair frame index advances based on flight time.
    _fireChairs(c) {
        const playerCx = this.player.x + this.player.w / 2;
        // 1 chair when boss > 50% HP, 2 chairs when wounded — gets harder.
        const numChairs = (c.hp < c.maxHp * 0.5) ? 2 : 1;
        for (let i = 0; i < numChairs; i++) {
            // Aim with some spread so 2-chair volleys cover left + right.
            const lateralOffset = (numChairs === 2) ? (i === 0 ? -32 : 32) : 0;
            const targetX = playerCx + lateralOffset;
            const dx = targetX - c.x;
            // Lob shot: vy negative (upward) initially, gravity pulls it down.
            // Tune for ~1.2s flight time to player rail.
            const flightFrames = 72;
            const gravity = 0.06;
            // Solve for initial vx, vy to land at (targetX, RAIL_Y) from
            // (c.x, c.y). x: dx = vx * flightFrames. y: dy = vy*t + 0.5*g*t².
            const vx = dx / flightFrames;
            const dy = (RAIL_Y - 12) - c.y;
            const vy = (dy - 0.5 * gravity * flightFrames * flightFrames) / flightFrames;
            this.enemyBullets.push({
                x: c.x, y: c.y + c.h / 2,
                vx, vy,
                gravity,
                life: flightFrames + 30,
                isChair: true,
                spinT: 0,    // for sprite animation
            });
        }
    }

    // R314: optional camera shake. Caller passes ampFrames; positive amp,
    // decays linearly to zero. Reads in draw() to offset the whole canvas.
    _shake(amp = 4, frames = 14) {
        this._shakeAmp = Math.max(this._shakeAmp || 0, amp);
        this._shakeT = Math.max(this._shakeT || 0, frames);
    }

    // R314: richer explosion FX. Same call signature as before; spawns:
    //   - an expanding shockwave ring (marked _ring)
    //   - a slow-rising smoke puff (marked _smoke)
    //   - 22 colored sparks (faster + more spread than before)
    //   - 6 dark debris chunks with gravity (marked _debris)
    _explosion(x, y, color) {
        // Shockwave ring — drawn as an expanding circle outline in _tickParticles.
        this.particles.push({
            x, y, vx: 0, vy: 0,
            life: 18, maxLife: 18,
            color: '#ffffff',
            _ring: true, ringR: 2, ringRMax: 22,
        });
        // Smoke puff — slow rising dark cloud
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 6,
                y: y + (Math.random() - 0.5) * 4,
                vx: (Math.random() - 0.5) * 0.4,
                vy: -0.3 - Math.random() * 0.4,
                life: 40 + (Math.random() * 20) | 0,
                color: '#303030',
                _smoke: true,
            });
        }
        // Bright sparks (existing pattern, bumped count + speed)
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
        // Debris chunks — heavy dark fragments with gravity
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

    // R308: Mecha-Gates phase-2 transition. The mech's "core" hits 0 hp,
    // it staggers + explodes, the pilot ejects skyward, and a smaller +
    // faster on-foot boss appears. Phase-2 inherits the same core slot
    // (so existing hit-detection still works) but with new stats.
    _mechaEject() {
        const c = this.core;
        // Phase 1 freeze — drop into the eject cinematic. Mechanics resume
        // when phase === 'play' is restored at the end of the cinematic.
        this.phase = 'mechaEject';
        this.mechaEjectT = 0;
        this.mechaEjectX = c.x;
        this.mechaEjectY = c.y;
        // Big multi-burst explosion sequence over ~90 frames driven from
        // _tickMechaEject below.
        audio.sfx('bossDie');
        this._explosion(c.x, c.y, '#ff60a0');
        this._explosion(c.x - 10, c.y + 4, '#ffa040');
        this._explosion(c.x + 10, c.y - 4, '#ffa040');
        // Mark the existing core slot as dead during the cinematic so
        // bullets pass through. The phase-2 boss will replace it.
        c.alive = false;
    }

    _spawnMechaPhase2() {
        // Smaller, faster Gates-on-foot. Reuse the core slot so the
        // existing hit-detection block above continues to work; flag it
        // with isPhase2 so a second 0-hp event ends the fight.
        this.core = {
            x: GAME.W / 2,
            y: BACK_WALL_Y + 22,
            w: 18, h: 22,
            hp: Math.max(8, Math.floor(CORE_HP * 0.45)),
            maxHp: Math.max(8, Math.floor(CORE_HP * 0.45)),
            alive: true,
            fireT: 0, hitFlash: 0,
            isPhase2: true,
            // Phase-2 attack cadence — roughly half the cooldown, double
            // the danger.
            fireCdMul: 0.5,
        };
        // No new shields in phase 2 — the eject cinematic stripped them.
        this.shields = [];
        this.phase = 'boss';
    }

    _tickMechaEject() {
        const t = ++this.mechaEjectT;
        // Stuttered detonations across the first 60 frames
        if (t === 18 || t === 36 || t === 52) {
            this._explosion(
                this.mechaEjectX + (Math.random() - 0.5) * 18,
                this.mechaEjectY + (Math.random() - 0.5) * 10,
                t === 52 ? '#ffe070' : '#ff8040'
            );
            audio.sfx('bossHit');
        }
        // Final big burst + spawn phase 2
        if (t === 90) {
            this._explosion(this.mechaEjectX, this.mechaEjectY - 6, '#ffe070');
            this._explosion(this.mechaEjectX, this.mechaEjectY - 6, '#ff60a0');
            audio.sfx('bossDie');
        }
        if (t >= 120) {
            this._spawnMechaPhase2();
        }
    }

    _tickParticles() {
        // R314: shake decay
        if (this._shakeT > 0) {
            this._shakeT--;
            this._shakeAmp *= 0.90;
            if (this._shakeT <= 0) { this._shakeAmp = 0; }
        }
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p._ring) {
                // Shockwave — expand outward, fade with life
                p.ringR += (p.ringRMax - p.ringR) * 0.25;
                p.life--;
                if (p.life <= 0) this.particles.splice(i, 1);
                continue;
            }
            if (p._smoke) {
                // Smoke — slow drift, no extra gravity; size grows over life
                p.x += p.vx;
                p.y += p.vy;
                p.vy *= 0.98;
                p.life--;
                if (p.life <= 0) this.particles.splice(i, 1);
                continue;
            }
            // Default particle (spark / debris) — gravity, with extra for debris
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p._debris ? 0.18 : 0.08;
            if (p._debris) p.vx *= 0.985;     // air resistance for chunks
            p.life--;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    // ============== draw ==============
    draw() {
        const ctx = this.ctx;
        // R314: apply screen shake before drawing scene. HUD is drawn AFTER
        // restoring so it remains stable while the world rattles.
        const hasShake = (this._shakeAmp || 0) > 0.1;
        if (hasShake) {
            ctx.save();
            const sx = (Math.random() - 0.5) * 2 * this._shakeAmp;
            const sy = (Math.random() - 0.5) * 2 * this._shakeAmp;
            ctx.translate(sx | 0, sy | 0);
        }
        // Background — painted backdrop scaled to cover.
        if (this.bgImg) {
            ctx.imageSmoothingEnabled = false;
            const scale = Math.max(GAME.W / this.bgImg.width, GAME.H / this.bgImg.height);
            const dw = this.bgImg.width * scale;
            const dh = this.bgImg.height * scale;
            ctx.drawImage(this.bgImg, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
        } else {
            ctx.fillStyle = '#080a14';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Corridor depth overlay — converging floor + ceiling ribs, vanishing
        // point in the center-upper area. Sells the "into-the-screen" framing
        // even if the bg image is flat.
        this._drawCorridor();
        // R307: drifting ambient embers/sparks behind the action.
        this._drawAmbientEmbers(ctx);
        // Segment indicator (top-center)
        this._drawSegmentTag();
        // Sensors/turrets/grunts/barriers (in depth-sorted order — far first)
        this._drawBarriers();
        this._drawTurrets();
        this._drawGrunts();
        this._drawBoss();
        // R308: Mecha-Gates eject cinematic — drawn over the dead phase-1
        // boss position. Shows the ejecting pilot rising into the sky on a
        // chute. Only renders during this.phase === 'mechaEject'.
        if (this.phase === 'mechaEject') this._drawMechaEject(ctx);
        // R308: phase-2 banner — first ~120 frames after the eject, show
        // "PHASE 2" in red over the new boss.
        if (this.core && this.core.isPhase2 && this.core.hp === this.core.maxHp && (this.t % 30) < 18) {
            drawText(ctx, 'PHASE 2', GAME.W / 2, BACK_WALL_Y + 50, '#ff60a0', 1, 'center');
        }
        // Player bullets
        for (const b of this.bullets) {
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(b.x, b.y, 2, 6);
        }
        // Enemy bullets — chairs (R271) and floppy disks (R270) get painted
        // spinning sprites; regular shots stay as pixel rects.
        for (const b of this.enemyBullets) {
            if (b.isChair) {
                const frameIdx = (Math.floor(b.spinT / 4) % 4) + 1;
                const chairImg = sprites.images.get('chair_' + frameIdx);
                if (chairImg) {
                    ctx.imageSmoothingEnabled = false;
                    const drawW = 24, drawH = 24;
                    ctx.drawImage(chairImg, 0, 0, chairImg.width, chairImg.height,
                                  Math.round(b.x - drawW / 2),
                                  Math.round(b.y - drawH / 2),
                                  drawW, drawH);
                } else {
                    ctx.fillStyle = '#a0a0a0';
                    ctx.fillRect(b.x - 8, b.y - 8, 16, 16);
                }
            } else if (b.isFloppy) {
                const frameIdx = (Math.floor(b.spinT / 3) % 4) + 1;
                const floppyImg = sprites.images.get('floppy_' + frameIdx);
                if (floppyImg) {
                    ctx.imageSmoothingEnabled = false;
                    const drawW = 12, drawH = 10;
                    ctx.drawImage(floppyImg, 0, 0, floppyImg.width, floppyImg.height,
                                  Math.round(b.x - drawW / 2),
                                  Math.round(b.y - drawH / 2),
                                  drawW, drawH);
                } else {
                    ctx.fillStyle = '#202020';
                    ctx.fillRect(b.x - 4, b.y - 3, 8, 6);
                }
            } else {
                ctx.fillStyle = '#ff8040';
                ctx.fillRect(b.x - 1, b.y - 1, 3, 3);
            }
        }
        // R314: particles render in three flavors —
        //   _ring  → expanding ring outline (shockwave)
        //   _smoke → soft 3x3 grey blob, growing transparent
        //   _debris→ small dark 2x2 chunk with gravity-induced spin
        //   default→ 2x2 spark with linear fade
        for (const p of this.particles) {
            if (p._ring) {
                const a = p.life / (p.maxLife || 18);
                ctx.save();
                ctx.globalAlpha = a;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } else if (p._smoke) {
                const a = Math.min(0.6, p.life / 50);
                ctx.globalAlpha = a;
                ctx.fillStyle = p.color;
                // Three offset cells make a fluffier puff
                ctx.fillRect((p.x | 0) - 1, (p.y | 0) - 1, 3, 3);
                ctx.fillRect((p.x | 0) + 1, (p.y | 0), 2, 2);
                ctx.fillRect((p.x | 0) - 2, (p.y | 0) + 1, 2, 2);
            } else if (p._debris) {
                const a = Math.min(1, p.life / 50);
                ctx.globalAlpha = a;
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
            } else {
                const a = Math.min(1, p.life / 32);
                ctx.globalAlpha = a;
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, 2, 2);
            }
        }
        ctx.globalAlpha = 1;
        // Player (last — always on top)
        this._drawPlayer();
        // Advance transition — dolly forward flash
        if (this.phase === 'advance') {
            const a = 0.35 * (1 - Math.abs(this.advanceT - 30) / 30);
            ctx.fillStyle = `rgba(80, 120, 200, ${a})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            drawText(ctx, 'ADVANCING', GAME.W / 2, 90, '#a0d8ff', 1, 'center');
        }
        // R280: door-approach phase — glowing door at the vanishing point.
        // R297: name on the door reads from stage data (bossDisplayName)
        // so it doesn't say "STEVE BALLMER" on the Gates corridor approach.
        // R333: skip the door entirely on apocalypse-themed corridors —
        // post-apocalypse cityscape doesn't have a "CEO office door" at
        // the end. Without an override, the door label is configurable.
        if (this.phase === 'doorApproach') {
            const isApocalypse = (this.data.bgKey === 'bg_apocalypse');
            if (!isApocalypse) {
                const cx = GAME.W / 2;
                const cy = BACK_WALL_Y + 8;
                const t = this.doorT || 0;
                const glow = 0.5 + 0.5 * Math.sin(t * 0.12);
                ctx.fillStyle = '#1a1010';
                ctx.fillRect(cx - 10, cy - 4, 20, 28);
                ctx.strokeStyle = `rgba(255, 200, 80, ${0.4 + glow * 0.5})`;
                ctx.lineWidth = 1;
                ctx.strokeRect(cx - 10, cy - 4, 20, 28);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(cx + 6, cy + 12, 2, 2);
                // R333: door label is configurable via stage data (was hardcoded
                // 'CEO'). Stages can pass doorLabel to override.
                const doorTopLabel = this.data.doorLabel || 'CEO';
                drawText(ctx, doorTopLabel, cx, cy - 12, '#ffe070', 1, 'center');
                const doorName = this.data.bossDisplayName || this.data.bossKind || 'BOSS';
                drawText(ctx, doorName, GAME.W / 2, GAME.H - 40, '#ff80a0', 1, 'center');
            }
        }
        // R290: boss entry telegraph. Lower-half panel slides up showing the
        // painted boss portrait + name (matches the platformer BOSS_INTRO
        // visual language). 90-frame phase before the arena unlocks.
        if (this.phase === 'bossEntry') {
            const t = this.bossEntryT;
            const cx = GAME.W / 2;
            // Background dim wash that fades in
            const dimA = Math.min(0.55, t * 0.015);
            ctx.fillStyle = `rgba(20, 8, 28, ${dimA})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            // Pulsing telegraph ring at back wall
            const ringA = 0.4 + 0.4 * Math.sin(t * 0.3);
            ctx.strokeStyle = `rgba(255, 96, 160, ${ringA})`;
            ctx.lineWidth = 1;
            const r = 30 + Math.sin(t * 0.15) * 6;
            ctx.beginPath();
            ctx.arc(cx, BACK_WALL_Y + 30, r, 0, Math.PI * 2);
            ctx.stroke();
            // Painted boss portrait — slides up from below across t=20..50
            const portraitKey = this.data.bossPortraitKey;
            const img = portraitKey ? sprites.images.get(portraitKey) : null;
            if (img) {
                const slideK = Math.max(0, Math.min(1, (t - 20) / 30));
                const eased = 1 - Math.pow(1 - slideK, 3);
                const pH = Math.min(120, GAME.H * 0.6);
                const pW = pH * (img.width / img.height);
                const pY = GAME.H - pH * eased;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, GAME.W / 2 - pW / 2, pY, pW, pH);
            }
            // Boss name banner — slides in from right at t > 35
            if (t > 35) {
                const slideK = Math.min(1, (t - 35) / 22);
                const eased = 1 - Math.pow(1 - slideK, 3);
                const startX = GAME.W + 80;
                const endX = GAME.W / 2;
                const nameX = startX - (startX - endX) * eased;
                const name = this.data.bossDisplayName || 'BOSS';
                drawTextOutlined(ctx, name, nameX, 20, '#ff5050', '#1a0010', 2, 'center');
            }
            // "VS" / "BOSS" tag pulses near top
            if (t > 12) {
                const a = 0.6 + 0.4 * Math.sin(t * 0.25);
                ctx.globalAlpha = a;
                drawText(ctx, '!! BOSS !!', cx, 8, '#ffe070', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }
        // R307: lightning flash before HUD so HUD stays legible.
        this._drawLightning(ctx);
        // R386: data-driven ambient props (FPS arena uses fixed camera
        // so viewX/viewY both 0).
        if (this.game._ambientProps) {
            const fakeCam = { viewX: 0, viewY: 0 };
            this.game._ambientProps.draw(ctx, fakeCam);
        }
        // R314: restore shake-transformed canvas before HUD so the HUD stays
        // pinned to the screen and doesn't rattle.
        if (hasShake) ctx.restore();
        // HUD
        this._drawHUD();
        // R465: directional damage indicator
        if (this._damageIndicatorT > 0) {
            this._damageIndicatorT--;
            const t = this._damageIndicatorT / 30;
            const ang = this._lastHitAngle || 0;
            const cx = GAME.W / 2, cy = GAME.H / 2;
            const radius = Math.min(GAME.W, GAME.H) * 0.42;
            const ax = cx + Math.cos(ang) * radius;
            const ay = cy + Math.sin(ang) * radius;
            ctx.save();
            ctx.globalAlpha = t * 0.85;
            const grad = ctx.createRadialGradient(ax, ay, 0, ax, ay, 50);
            grad.addColorStop(0, '#ff3030');
            grad.addColorStop(0.5, '#c01010');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ax, ay, 50, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // R469: HUD Clippy face — only during DANGER / RAGE
        {
            const p = this.player;
            let faceKey = null;
            if ((p.rageFrames || 0) > 0) faceKey = 'doom_face_rage';
            else if (p.hp <= 1) faceKey = 'doom_face_hurt3';
            else if (p.hp <= 2) faceKey = 'doom_face_hurt2';
            if (faceKey) {
                const faceImg = sprites.images?.get(faceKey);
                if (faceImg?.complete && faceImg.naturalWidth > 0) {
                    ctx.save();
                    ctx.imageSmoothingEnabled = false;
                    const fx = GAME.W - 28 - 4, fy = 38;
                    const shake = (p.iframes > 30) ? ((Math.random() - 0.5) * 2) | 0 : 0;
                    ctx.drawImage(faceImg, fx + shake, fy + shake, 24, 24);
                    ctx.restore();
                }
            }
        }
        // R465: combo HUD — top-right
        if (this._lastKillT != null) {
            const since = this.t - this._lastKillT;
            if (since < 240 && this._comboCount >= 2) {
                const fade = 1 - (since / 240);
                ctx.save();
                ctx.globalAlpha = fade;
                const txt = `×${this._comboCount}`;
                const col = this._comboCount >= 5 ? '#ff80ff' :
                            this._comboCount >= 4 ? '#ff8050' :
                            this._comboCount >= 3 ? '#ffe070' : '#80ff80';
                drawTextOutlined(ctx, txt, GAME.W - 6, 30, col, '#000000', 2, 'right');
                ctx.restore();
            }
        }
        // Stage-clear overlay
        if (this.phase === 'clear') {
            const t = this.clearT || 0;
            ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, t * 0.02)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            if (t > 60) {
                // R297: clear text driven by stage data so "CORE BREACHED"
                // doesn't show on every FPS arena boss. Defaults:
                //   - endingStyle 'door' → "ENTERING..."
                //   - boss kill on Ballmer/Gates → "BOSS DOWN"
                //   - Spindler → "CORE BREACHED" (kept for thematic fit)
                let clearText;
                if (this.endingStyle === 'door') {
                    clearText = 'ENTERING...';
                } else if (this.data.clearText) {
                    clearText = this.data.clearText;
                } else {
                    const name = this.data.bossDisplayName || 'BOSS';
                    clearText = name + ' DOWN';
                }
                drawText(ctx, clearText, GAME.W / 2, GAME.H / 2 - 8, '#ffe070', 2, 'center');
                // R297: when an autoNext is configured, the arena auto-
                // advances after 120 frames — surface that to the player
                // instead of "PRESS X" so they don't think they're stuck.
                const autoNext = this.data.nextStage;
                const hint = autoNext ? '...' : 'PRESS X';
                const a = 0.6 + 0.4 * Math.sin(t * 0.15);
                ctx.globalAlpha = a;
                drawText(ctx, hint, GAME.W / 2, GAME.H / 2 + 12, '#a890b0', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }
    }

    // ============== Visual subroutines ==============
    _drawCorridor() {
        const ctx = this.ctx;
        // Dim vignette pushing the eye toward the vanishing point — sells
        // the "into-the-screen" framing on top of the painted backdrop.
        const grad = ctx.createRadialGradient(
            VANISH_X, VANISH_Y, 20,
            VANISH_X, VANISH_Y, Math.max(GAME.W, GAME.H) * 0.7
        );
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Dolly offset during advance — pulse the perspective lines outward.
        const adv = (this.phase === 'advance') ? (this.advanceT / 60) : 0;
        // Floor lines — perspective ribs converging to vanishing point.
        ctx.strokeStyle = 'rgba(255, 220, 160, 0.32)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const t = 0.15 + i * 0.17 + adv * 0.15;
            if (t > 1) continue;
            const y = depthY(t);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(VANISH_X, VANISH_Y);
            ctx.lineTo(GAME.W, y);
            ctx.stroke();
        }
        // Wall ribs — diagonal lines from screen corners toward vanishing.
        ctx.strokeStyle = 'rgba(120, 180, 240, 0.28)';
        for (const edge of [0, GAME.W]) {
            for (let i = 0; i < 4; i++) {
                const xOff = (edge === 0 ? -1 : 1) * (60 + i * 30 + adv * 20);
                ctx.beginPath();
                ctx.moveTo(edge + xOff, GAME.H);
                ctx.lineTo(VANISH_X, VANISH_Y);
                ctx.stroke();
            }
        }
        // R537/R538: procedural wall ornaments — sconces / signs / ceiling
        // pipes that scroll past at the wall rib depths. Sells "I am
        // moving through a real corridor with detail," not just abstract
        // perspective lines. Theme-adaptive: BOARDROOM = corporate signs,
        // KEYNOTE = stage rigging, SEWER = dripping pipes, default = vents.
        const theme = this.data.theme;
        const isBoardroom = theme === undefined ? false :
            (this.data.bgKey?.includes('office') || this.data.bgKey?.includes('hq') ||
             this.data.bgKey?.includes('boardroom'));
        const isKeynote = this.data.bgKey?.includes('keynote');
        const isSewer = this.data.bgKey?.includes('sewer') || this.data.bgKey?.includes('lab');
        // 3 depth bands of ornaments: far, mid, near. Each spawns ornaments
        // on both walls at varying t positions, scrolling subtly with adv.
        const ornaments = [
            { t: 0.32, side: 'left',  kind: 'sconce' },
            { t: 0.32, side: 'right', kind: 'sign' },
            { t: 0.50, side: 'left',  kind: 'sign' },
            { t: 0.50, side: 'right', kind: 'sconce' },
            { t: 0.70, side: 'left',  kind: 'sconce' },
            { t: 0.70, side: 'right', kind: 'sign' },
        ];
        for (const o of ornaments) {
            const t = o.t + adv * 0.05;
            if (t > 0.95) continue;
            const scale = 0.18 + t * t * 0.82;   // matches depth scale
            // Project onto the wall edge — wall goes from screen-edge at y=GAME.H
            // toward (VANISH_X, VANISH_Y). Find the wall-y at this depth.
            const wallY = depthY(t) - 28 * scale;
            const wallX = o.side === 'left'
                ? VANISH_X * (1 - t)             // left wall at depth t
                : GAME.W - (GAME.W - VANISH_X) * (1 - t);
            const ow = 12 * scale;
            const oh = 14 * scale;
            ctx.save();
            ctx.globalAlpha = 0.55 + t * 0.35;
            if (o.kind === 'sconce') {
                // Wall sconce — lamp housing + soft glow underneath
                ctx.fillStyle = '#404048';
                ctx.fillRect(wallX - ow / 2, wallY, ow, oh * 0.6);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(wallX - ow / 3, wallY + 2 * scale, ow * 0.67, 2 * scale);
                // Bloom
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.3 + t * 0.2;
                const blr = 8 * scale;
                const bg = ctx.createRadialGradient(wallX, wallY + 2, 0, wallX, wallY + 2, blr);
                bg.addColorStop(0, '#ffe070');
                bg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = bg;
                ctx.beginPath();
                ctx.arc(wallX, wallY + 2, blr, 0, Math.PI * 2);
                ctx.fill();
            } else if (o.kind === 'sign') {
                // Theme-aware sign
                if (isBoardroom) {
                    // Corporate plaque — gold rectangle with text bars
                    ctx.fillStyle = '#806040';
                    ctx.fillRect(wallX - ow / 2, wallY, ow, oh * 0.7);
                    ctx.fillStyle = '#c0a060';
                    ctx.fillRect(wallX - ow / 2, wallY, ow, 1);
                    ctx.fillStyle = '#1a1410';
                    for (let i = 0; i < 3; i++) {
                        ctx.fillRect(wallX - ow / 3 + i * (ow / 4),
                                     wallY + 3 * scale, ow / 6, 1);
                    }
                } else if (isKeynote) {
                    // Stage rigging — black truss with hanging cable
                    ctx.fillStyle = '#202028';
                    ctx.fillRect(wallX - ow / 2, wallY, ow, 2 * scale);
                    ctx.strokeStyle = '#404048';
                    ctx.beginPath();
                    ctx.moveTo(wallX, wallY + 2 * scale);
                    ctx.lineTo(wallX, wallY + oh);
                    ctx.stroke();
                    ctx.fillStyle = '#a0a0a0';
                    ctx.fillRect(wallX - 1, wallY + oh - 2, 2, 2);
                } else if (isSewer) {
                    // Pipe junction — vertical pipe + valve
                    ctx.fillStyle = '#5a4838';
                    ctx.fillRect(wallX - 1, wallY, 2, oh);
                    ctx.fillStyle = '#806040';
                    ctx.fillRect(wallX - ow / 4, wallY + oh / 2, ow / 2, 2 * scale);
                } else {
                    // Generic vent — louvered rectangle
                    ctx.fillStyle = '#303040';
                    ctx.fillRect(wallX - ow / 2, wallY, ow, oh * 0.6);
                    ctx.fillStyle = '#101018';
                    for (let i = 0; i < 3; i++) {
                        ctx.fillRect(wallX - ow / 2, wallY + 2 + i * 2 * scale, ow, 1);
                    }
                }
            }
            ctx.restore();
        }
        // Back wall (boss room) — visible only in segment 3.
        if (this.segment === 3) {
            ctx.fillStyle = 'rgba(20, 8, 32, 0.85)';
            ctx.fillRect(VANISH_X - 48, BACK_WALL_Y - 12, 96, 24);
            // Door frame around the core
            ctx.strokeStyle = '#ff60a0';
            ctx.lineWidth = 1;
            ctx.strokeRect(VANISH_X - 48, BACK_WALL_Y - 12, 96, 24);
        }
    }

    _drawSegmentTag() {
        const ctx = this.ctx;
        // R268: per-stage segment labels — stage data can override.
        const labels = this.data.segmentLabels || [
            'SEGMENT 1 / TURRETS',
            'SEGMENT 2 / GRUNTS',
            'SEGMENT 3 / BARRIER',
            'CORE',
        ];
        drawText(ctx, labels[this.segment] || '', GAME.W / 2, 6, '#80a0c0', 1, 'center');
        // R474: big segment-intro overlay during the 60f 'advance' phase.
        // Letterbox bars slide in + the upcoming segment label scales up so
        // the transition feels intentional instead of a quiet backdrop swap.
        if (this.phase === 'advance') {
            const t = this.advanceT / 60;          // 0 → 1
            // Letterbox bars: slide-in over first 12f, hold, slide-out last 12f
            const barH = 22;
            let barT;
            if (this.advanceT < 12) barT = this.advanceT / 12;
            else if (this.advanceT > 48) barT = (60 - this.advanceT) / 12;
            else barT = 1;
            barT = Math.max(0, Math.min(1, barT));
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fillRect(0, 0, GAME.W, barH * barT);
            ctx.fillRect(0, GAME.H - barH * barT, GAME.W, barH * barT);
            // Next-segment label (we're advancing INTO this.segment+1)
            const nextLabel = labels[this.segment + 1] || labels[this.segment] || '';
            const fadeIn = Math.min(1, this.advanceT / 18);
            const fadeOut = Math.min(1, (60 - this.advanceT) / 12);
            const labelA = Math.min(fadeIn, fadeOut);
            ctx.globalAlpha = labelA;
            // Slight scale pulse on intro
            const scale = 2;
            drawTextOutlined(ctx, nextLabel, GAME.W / 2, GAME.H / 2 - 6, '#ffe070', '#000000', scale, 'center');
            // Tiny "ADVANCING" subtitle below
            ctx.globalAlpha = labelA * 0.6;
            drawText(ctx, 'ADVANCING...', GAME.W / 2, GAME.H / 2 + 12, '#80a0c0', 1, 'center');
            ctx.restore();
        }
    }

    _drawBarriers() {
        if (!this.barriers.length) return;
        const ctx = this.ctx;
        for (const b of this.barriers) {
            // R269: pick a barrier frame based on the phase. The 4-frame
            // animation maps to the on/off cycle:
            //   phase [0..ON_FRAMES)  → frame 1 (fully on) then 2 (crackling)
            //   phase [ON..PERIOD)    → frame 3 (off) then 4 (powering up)
            // The crackling/powering frames sit at the boundaries so the
            // transition reads as fade-out + fade-in instead of binary.
            const on = b.phase < BARRIER_ON_FRAMES;
            let frameIdx;
            if (on) {
                // 0-40% of on window = full bright, 40-100% = crackling
                frameIdx = (b.phase < BARRIER_ON_FRAMES * 0.7) ? 1 : 2;
            } else {
                // 0-60% of off window = idle, 60-100% = powering up
                const offPhase = b.phase - BARRIER_ON_FRAMES;
                const offLen = BARRIER_PERIOD - BARRIER_ON_FRAMES;
                frameIdx = (offPhase < offLen * 0.7) ? 3 : 4;
            }
            const img = sprites.images.get('barrier_' + frameIdx);
            // R350: barrier now renders at floor-rail level (player's
            // feet) instead of mid-corridor — matches the new hit-zone
            // so player can VISUALLY see where the laser sweeps.
            const y = RAIL_Y;
            if (img) {
                ctx.imageSmoothingEnabled = false;
                // Tile the sprite across the corridor width so the barrier
                // reads as one continuous hazard band. Each tile is 32px
                // wide on screen — 8 tiles fill the 256px canvas.
                const tileW = 32;
                const tileH = 20;
                const dy = Math.round(y - tileH / 2);
                for (let x = 0; x < GAME.W; x += tileW) {
                    ctx.drawImage(img, 0, 0, img.width, img.height,
                                  x, dy, tileW, tileH);
                }
                // Subtle screen flicker overlay when on — sells voltage.
                if (on && Math.random() < 0.2) {
                    ctx.fillStyle = 'rgba(200, 240, 255, 0.08)';
                    ctx.fillRect(0, dy - 2, GAME.W, tileH + 4);
                }
            } else {
                // Procedural fallback (legacy)
                ctx.fillStyle = on ? 'rgba(120, 200, 255, 0.6)' : 'rgba(120, 200, 255, 0.15)';
                ctx.fillRect(16, y - 1, GAME.W - 32, 2);
            }
        }
    }

    _drawTurrets() {
        const ctx = this.ctx;
        const img = sprites.images.get(this.spriteKeys.turret);
        for (const t of this.turrets) {
            if (!t.alive) continue;
            const scale = depthScale(t.t);
            const th = t.h * scale;
            // R471: preserve source sprite aspect ratio — was using t.w * scale
            // for width which forced 28×22 dest on a 20×22 source, producing a
            // 1.4× horizontal stretch that grew with depthScale. Now derive
            // width from source aspect, fall back to t.w if no sprite.
            const aspect = img ? (img.naturalWidth / img.naturalHeight) : (t.w / t.h);
            const tw = th * aspect;
            // R520: pre-fire glow + recoil bob for stationary turrets.
            // Frames-to-fire counts down from TURRET_FIRE_PERIOD. In the
            // last 15 frames a red charge-glow pulses below the turret;
            // immediately AFTER firing (first 4 frames after fireT wraps),
            // a small recoil bob sells the discharge.
            const framesToFire = TURRET_FIRE_PERIOD - t.fireT;
            const charging = framesToFire > 0 && framesToFire <= 15;
            const recoiling = t.fireT >= 0 && t.fireT < 4;
            const recoilY = recoiling ? (4 - t.fireT) * 1.5 : 0;
            const tx = depthX(t.originX, t.t) - tw / 2;
            const ty = depthY(t.t) - th + recoilY;
            // Charge glow underneath
            if (charging) {
                const cT = (15 - framesToFire) / 15;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.4 + cT * 0.4;
                const cR = 6 + cT * 8;
                const cx = depthX(t.originX, t.t);
                const cy = depthY(t.t) - 4;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cR);
                grad.addColorStop(0, '#ffe070');
                grad.addColorStop(0.5, '#ff4040');
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, cR, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            if (img) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, img.width, img.height,
                              Math.round(tx), Math.round(ty), tw, th);
                if (t.hitFlash > 0 && t.hitFlash % 2 === 0) {
                    // Hit-flash overlay — lighten composite for a 1-frame pop
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.65;
                    ctx.drawImage(img, 0, 0, img.width, img.height,
                                  Math.round(tx), Math.round(ty), tw, th);
                    ctx.restore();
                }
            } else {
                // Procedural fallback if sprite missing
                ctx.fillStyle = t.hitFlash > 0 ? '#ffffff' : '#3a2818';
                ctx.fillRect(tx, ty, tw, th);
            }
        }
    }

    _drawGrunts() {
        const ctx = this.ctx;
        const img = sprites.images.get(this.spriteKeys.grunt);
        for (const g of this.grunts) {
            if (!g.alive || g.runT < g.spawnDelay) continue;
            const tt = Math.min(1, (g.runT - g.spawnDelay) / GRUNT_RUN_FRAMES);
            const scale = depthScale(tt);
            const gh = 32 * scale;
            // R471: aspect-correct width from sprite source (lab_grunt is 32×40,
            // so aspect = 0.8). Was hardcoded 24/32 = 0.75 which squished the
            // sprite ~6% horizontally — visible at near-camera scale.
            const aspect = img ? (img.naturalWidth / img.naturalHeight) : (24 / 32);
            const gw = gh * aspect;
            // R350: running animation — vertical bob + horizontal weave +
            // pre-fire crouch make grunts feel alive instead of just zooming
            // toward the camera. Bob amplitude scales with depth so far-away
            // grunts only twitch and near grunts visibly stride.
            const stride = g.runT * 0.42;
            const bobY = Math.sin(stride) * (3 * scale);
            const swayX = Math.sin(stride * 0.5 + g.originX * 0.01) * (2 * scale);
            // Crouch dip in the 12 frames before a fire event
            const framesToFire = GRUNT_FIRE_PERIOD - g.fireT;
            const crouching = framesToFire > 0 && framesToFire < 12;
            const crouchY = crouching ? (12 - framesToFire) * 0.5 * scale : 0;
            const gx = depthX(g.originX, tt) - gw / 2 + swayX;
            const gy = depthY(tt) - gh + bobY + crouchY;
            if (img) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, img.width, img.height,
                              Math.round(gx), Math.round(gy), gw, gh);
                if (g.hitFlash > 0 && g.hitFlash % 2 === 0) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.65;
                    ctx.drawImage(img, 0, 0, img.width, img.height,
                                  Math.round(gx), Math.round(gy), gw, gh);
                    ctx.restore();
                }
            } else {
                ctx.fillStyle = g.hitFlash > 0 ? '#ffffff' : '#a8c060';
                ctx.fillRect(gx, gy, gw, gh);
            }
            // Muzzle flash overlay for ~6 frames after firing
            if (g.muzzleT > 0) {
                const mx = depthX(g.originX, tt) + swayX;
                const my = gy + gh * 0.55;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = g.muzzleT / 6;
                ctx.fillStyle = '#ffe070';
                ctx.fillRect((mx - 3 * scale) | 0, (my - 2 * scale) | 0,
                             (6 * scale) | 0, (4 * scale) | 0);
                ctx.fillStyle = '#fff';
                ctx.fillRect((mx - 1) | 0, (my - 1) | 0, 2, 2);
                ctx.restore();
            }
            // Tiny dust puff under feet on every other stride frame
            if (((g.runT >> 2) & 3) === 0 && tt > 0.15 && tt < 0.95) {
                const dx = depthX(g.originX, tt) + swayX;
                const dy = depthY(tt) - 1;
                ctx.save();
                ctx.globalAlpha = 0.35 * (1 - tt);
                ctx.fillStyle = '#9a8b6a';
                ctx.fillRect((dx - 3 * scale) | 0, (dy) | 0,
                             (6 * scale) | 0, Math.max(1, scale | 0));
                ctx.restore();
            }
        }
    }

    // R308: Mecha-Gates ejection cinematic.
    _drawMechaEject(ctx) {
        const t = this.mechaEjectT;
        const ex = this.mechaEjectX;
        const ey = this.mechaEjectY;
        // 0-40: smoke billowing out of the dead mech position
        if (t < 60) {
            const smokeA = Math.min(0.6, t / 40 * 0.6);
            ctx.save();
            ctx.globalAlpha = smokeA;
            ctx.fillStyle = '#404048';
            for (let i = 0; i < 5; i++) {
                const sx = ex + Math.sin(t * 0.1 + i) * 8;
                const sy = ey - (t * 0.3 + i * 4);
                ctx.fillRect(sx | 0, sy | 0, 6, 5);
            }
            ctx.restore();
        }
        // 30-120: ejecting pilot rises. Tiny silhouette + parachute appears
        // around frame 50.
        if (t >= 30) {
            const riseT = Math.min(1, (t - 30) / 90);
            const px = ex;
            const py = ey - riseT * 80;
            // Pilot dot
            ctx.save();
            ctx.fillStyle = '#202028';
            ctx.fillRect((px - 1) | 0, (py - 1) | 0, 3, 4);
            // Chute deploys around riseT=0.25
            if (riseT > 0.2) {
                const chuteR = Math.min(7, (riseT - 0.2) * 24);
                ctx.fillStyle = '#c04040';
                ctx.fillRect((px - chuteR) | 0, (py - 4) | 0, chuteR * 2, 2);
                ctx.fillStyle = '#802020';
                ctx.fillRect((px - chuteR + 1) | 0, (py - 5) | 0, chuteR * 2 - 2, 1);
                // Strings
                ctx.fillStyle = '#202028';
                ctx.fillRect((px - chuteR + 1) | 0, (py - 2) | 0, 1, 2);
                ctx.fillRect((px + chuteR - 2) | 0, (py - 2) | 0, 1, 2);
            }
            ctx.restore();
        }
        // 60-120: "EJECT!" text flashes
        if (t > 60 && (t % 12) < 8) {
            drawText(ctx, 'EJECT!', GAME.W / 2, BACK_WALL_Y + 20, '#ff8040', 1, 'center');
        }
    }

    _drawBoss() {
        if (!this.core) return;
        const ctx = this.ctx;
        const c = this.core;
        if (!c.alive) return;
        // Core body — painted sprite with subtle pulse-glow when shields are
        // down (core exposed = takes damage = aura visible).
        const coreImg = sprites.images.get(this.spriteKeys.core);
        const allShieldsDead = this.shields.every(s => !s.alive);
        // R516: subtle hover-bob + pre-fire lean so the static painted boss
        // reads as a living menace, not a propped-up cardboard cutout.
        const bobY = Math.sin(this.t * 0.04) * 2.5;
        const framesToFire = c.fireT != null ? c.fireT : 9999;
        const fireT = framesToFire < 20 ? (20 - framesToFire) / 20 : 0;
        const leanX = fireT * Math.sin(this.t * 0.5) * 2; // tremble before fire
        if (coreImg) {
            ctx.imageSmoothingEnabled = false;
            // R471: aspect-correct width from sprite source. Was c.w+4, which
            // forced 22-wide on a 26×40 (or 18-wide phase-2 on 26×40) source
            // — visibly squished the boss. Lock height, derive width.
            const drawH = c.h + 4;
            const aspect = coreImg.naturalWidth / coreImg.naturalHeight;
            const drawW = drawH * aspect;
            const dx = Math.round(c.x - drawW / 2 + leanX);
            const dy = Math.round(c.y - drawH / 2 + bobY);
            // Pulse-glow under the core when exposed
            if (allShieldsDead) {
                const pulse = 0.4 + 0.4 * Math.sin(this.t * 0.18);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = pulse;
                ctx.drawImage(coreImg, 0, 0, coreImg.width, coreImg.height,
                              dx, dy, drawW, drawH);
                ctx.restore();
            }
            ctx.drawImage(coreImg, 0, 0, coreImg.width, coreImg.height,
                          dx, dy, drawW, drawH);
            if (c.hitFlash > 0 && c.hitFlash % 2 === 0) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.7;
                ctx.drawImage(coreImg, 0, 0, coreImg.width, coreImg.height,
                              dx, dy, drawW, drawH);
                ctx.restore();
            }
        } else {
            // Procedural fallback
            ctx.fillStyle = c.hitFlash > 0 ? '#ffffff' : '#400820';
            ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
        }
        // Shields — orbiting nodes (painted sprite)
        const shieldImg = sprites.images.get(this.spriteKeys.shield);
        for (const s of this.shields) {
            if (!s.alive) continue;
            const sx = c.x + Math.cos(s.angle) * s.radius;
            const sy = c.y + Math.sin(s.angle) * s.radius;
            if (shieldImg) {
                ctx.imageSmoothingEnabled = false;
                // R471: aspect-correct shield dimension (was forcing 14×14
                // square on 11×16 source = 27% horizontal stretch)
                const sh = 14;
                const sw = sh * (shieldImg.naturalWidth / shieldImg.naturalHeight);
                const dx = Math.round(sx - sw / 2);
                const dy = Math.round(sy - sh / 2);
                ctx.drawImage(shieldImg, 0, 0, shieldImg.width, shieldImg.height,
                              dx, dy, sw, sh);
                if (s.hitFlash > 0 && s.hitFlash % 2 === 0) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.7;
                    ctx.drawImage(shieldImg, 0, 0, shieldImg.width, shieldImg.height,
                                  dx, dy, sw, sh);
                    ctx.restore();
                }
            } else {
                ctx.fillStyle = s.hitFlash > 0 ? '#ffffff' : '#a060ff';
                ctx.fillRect(sx - 5, sy - 5, 10, 10);
            }
        }
        // HP bar
        this._drawBossHp();
    }

    _drawPlayer() {
        const ctx = this.ctx;
        const p = this.player;
        const flicker = p.iframes > 0 && (p.iframes % 4 < 2);
        if (flicker) return;
        // R263: back-facing Clippy sprites for the Contra-base "into the
        // screen" framing. PNGs expected at assets/sprites/:
        //   clippy_back_idle.png
        //   clippy_back_run_1.png .. clippy_back_run_4.png
        // Add the keys to src/sprites.js once assets exist. Until then the
        // fallback chain renders the side-facing run frames so the player
        // sprite still appears (just not back-facing).
        const isMoving = Math.abs(input.axis().x) > 0.1;
        const backFrames = ['clippy_back_run_1', 'clippy_back_run_2',
                            'clippy_back_run_3', 'clippy_back_run_4'];
        const sourceKey = isMoving
            ? backFrames[Math.floor(p.runFrame) % backFrames.length]
            : 'clippy_back_idle';
        // Fallback chain: back-facing sprite → side-facing sprite → solid rect
        const img = sprites.images.get(sourceKey)
                 || sprites.images.get(isMoving ? 'run_1' : 'idle');
        const dx = Math.round(p.x);
        const dy = Math.round(p.y);
        if (img) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, p.w, p.h);
        } else {
            ctx.fillStyle = '#80889a';
            ctx.fillRect(p.x, p.y, p.w, p.h);
        }
        // R418: rage overlay — flash + glow halo
        if (p.rageFrames > 0) {
            const tail = Math.min(1, p.rageFrames / 45);
            const phase = (performance.now() * 0.025) | 0;
            const flashCol = (phase % 2 === 0) ? '#ff2020' : '#ffffff';
            ctx.save();
            ctx.globalAlpha = 0.45 * tail;
            ctx.fillStyle = flashCol;
            ctx.fillRect(dx, dy, p.w, p.h);
            ctx.restore();
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (0.3 + 0.2 * Math.sin(performance.now() * 0.02)) * tail;
            ctx.fillStyle = '#ff4020';
            ctx.beginPath();
            ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.h * 0.95, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // Aim indicator — small chevron above the head matching facing.
        const cx = p.x + p.w / 2 + p.facing * 4;
        const cy = p.y - 4;
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(cx - 1, cy, 2, 4);
        if (p.facing !== 0) {
            ctx.fillRect(cx + p.facing * 2, cy + 1, 1, 2);
        }
    }

    _drawBossHp() {
        const ctx = this.ctx;
        const c = this.core;
        const barW = GAME.W - 32;
        const x = 16, y = GAME.H - 10;
        ctx.fillStyle = '#2a0a14';
        ctx.fillRect(x, y, barW, 4);
        const fill = (c.hp / c.maxHp) * barW;
        const allShieldsDead = this.shields.every(s => !s.alive);
        ctx.fillStyle = allShieldsDead
            ? (c.hp < c.maxHp * 0.3 ? '#ff3040' : '#ff60a0')
            : '#603048';   // dim while shielded
        ctx.fillRect(x, y, fill, 4);
        // R268: per-stage boss labels — stage data can override the
        // shielded / exposed text (e.g. Ballmer stage shows "BALLMER /
        // RAGING" → "BALLMER / EXPOSED" instead of generic "CORE").
        const labels = this.data.bossLabels || { shielded: 'CORE / SHIELDED', exposed: 'EXPOSED CORE' };
        const tag = allShieldsDead ? labels.exposed : labels.shielded;
        drawText(ctx, tag, GAME.W / 2, y - 8, '#e0c0ff', 1, 'center');
    }

    _drawHUD() {
        const ctx = this.ctx;
        // R313: HP cells with bezel + low-HP pulse so the HUD reads as a
        // designed element, not raw debug rects.
        const lowHp = this.player.hp <= 2;
        const pulse = lowHp && ((this.t >> 3) & 1) === 0;
        // Bezel — dark backplate slightly larger than the cells
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(4, 4, 8 + 6 * 8, 10);
        // Top + bottom highlight + shadow
        ctx.fillStyle = 'rgba(255, 200, 100, 0.55)';
        ctx.fillRect(4, 4, 8 + 6 * 8, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(4, 13, 8 + 6 * 8, 1);
        // Cells
        for (let i = 0; i < 6; i++) {
            const hot = i < this.player.hp;
            if (hot) {
                ctx.fillStyle = lowHp ? (pulse ? '#ffe070' : '#ff4040') : '#ff4040';
            } else {
                ctx.fillStyle = '#3a1018';
            }
            ctx.fillRect(6 + i * 8, 6, 6, 6);
            // 1px top highlight on filled cells
            if (hot) {
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.fillRect(6 + i * 8, 6, 6, 1);
            }
        }
        // Lives counter with bezel
        const lives = Math.max(0, this.player.lives);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(4, 18, 18, 8);
        drawText(ctx, 'x' + lives, 6, 20, '#ffcc80', 1, 'left');
        // Right side — bezeled segment count
        const segTxt = (this.segment + 1) + ' / 4';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(GAME.W - 32, 4, 28, 10);
        ctx.fillStyle = 'rgba(255, 200, 100, 0.45)';
        ctx.fillRect(GAME.W - 32, 4, 28, 1);
        drawText(ctx, segTxt, GAME.W - 6, 6, '#ffcc80', 1, 'right');
        // Boss-name marquee that pulses on phase-2 entry
        if (this.core && this.core.isPhase2 && this.t < 240) {
            const name = this.data.bossDisplayName || 'BOSS';
            const a = 0.5 + 0.5 * Math.sin(this.t * 0.2);
            ctx.globalAlpha = a;
            drawText(ctx, name, GAME.W / 2, 6, '#ff60a0', 1, 'center');
            ctx.globalAlpha = 1;
        }
    }
}

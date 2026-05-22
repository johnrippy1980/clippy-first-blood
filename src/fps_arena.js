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
import { drawText } from './pixelfont.js';

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
        this.t++;
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
        }
        this._tickParticles();
    }

    _tickPlayer() {
        const ax = input.axis();
        const p = this.player;
        p.x += ax.x * PLAYER_SPEED;
        if (p.x < PLAYER_X_MIN) p.x = PLAYER_X_MIN;
        if (p.x > PLAYER_X_MAX) p.x = PLAYER_X_MAX;
        if (Math.abs(ax.x) > 0.1) p.runFrame = (p.runFrame + 0.25) % 4;
        if (ax.x < -0.1)      p.facing = -1;
        else if (ax.x > 0.1)  p.facing = 1;
        else                  p.facing = 0;
        if (p.iframes > 0) p.iframes--;
        if (p.shootCD > 0) p.shootCD--;
        if (input.isHeld('shoot') && p.shootCD <= 0) {
            this._fire();
            p.shootCD = BULLET_FIRE_COOLDOWN;
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
                        this.player.score += 1000;
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
                        this.player.score += 750;
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
                            this.player.score += 1500;
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
                            c.alive = false;
                            this.player.score += 9500;
                            audio.sfx('bossDie');
                            this._explosion(c.x, c.y, '#ff60a0');
                            this.phase = 'clear';
                            this.clearT = 0;
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
            // Chair hitbox is larger than a bullet — uses ~16×16 instead of 3×3
            const hitW = b.isChair ? 18 : 3;
            const hitH = b.isChair ? 18 : 3;
            if (p.iframes <= 0 &&
                b.x >= p.x - hitW/2 && b.x <= p.x + p.w + hitW/2 &&
                b.y >= p.y - hitH/2 && b.y <= p.y + p.h + hitH/2) {
                // Chairs do 2 damage (heavier projectile)
                p.hp -= b.isChair ? 2 : 1;
                p.iframes = 60;
                this.enemyBullets.splice(i, 1);
                audio.sfx('playerHit');
                if (p.hp <= 0) this._onPlayerDeath();
            }
        }
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
                    this.player.hp--;
                    this.player.iframes = 60;
                    audio.sfx('playerHit');
                    if (this.player.hp <= 0) this._onPlayerDeath();
                }
                continue;
            }
            // Fire forward periodically
            g.fireT++;
            if (g.fireT >= GRUNT_FIRE_PERIOD) {
                g.fireT = 0;
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
            // Damage the player if they're in the barrier band (mid-screen at row depthY(0.6))
            const by = depthY(0.6);
            const p = this.player;
            if (p.iframes <= 0 &&
                p.y + p.h / 2 > by - 20 && p.y + p.h / 2 < by + 20) {
                // Barriers span the whole corridor width — moving into the
                // barrier zone is the hazard.
                // Player rail is below the barrier band so they normally
                // can't touch it; barriers only matter when the player tries
                // to advance forward (future segments). For now leave the
                // band purely visual until forward movement is added.
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
        if (c.fireT >= CORE_FIRE_PERIOD) {
            c.fireT = 0;
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

    _explosion(x, y, color) {
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 1 + Math.random() * 2.5;
            this.particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 32,
                color,
            });
        }
    }

    _tickParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.life--;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    // ============== draw ==============
    draw() {
        const ctx = this.ctx;
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
        // Segment indicator (top-center)
        this._drawSegmentTag();
        // Sensors/turrets/grunts/barriers (in depth-sorted order — far first)
        this._drawBarriers();
        this._drawTurrets();
        this._drawGrunts();
        this._drawBoss();
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
        // Particles
        for (const p of this.particles) {
            const a = Math.min(1, p.life / 32);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = a;
            ctx.fillRect(p.x, p.y, 2, 2);
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
        // R280: door-approach phase — glowing door at the vanishing point
        // with a "TO BALLMER" overlay, then auto-clears after 180f.
        if (this.phase === 'doorApproach') {
            const cx = GAME.W / 2;
            const cy = BACK_WALL_Y + 8;
            // Door shape — vertical rect with glowing outline
            const t = this.doorT || 0;
            const glow = 0.5 + 0.5 * Math.sin(t * 0.12);
            ctx.fillStyle = '#1a1010';
            ctx.fillRect(cx - 10, cy - 4, 20, 28);
            ctx.strokeStyle = `rgba(255, 200, 80, ${0.4 + glow * 0.5})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - 10, cy - 4, 20, 28);
            // Door handle
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(cx + 6, cy + 12, 2, 2);
            // Nameplate
            drawText(ctx, 'CEO', cx, cy - 12, '#ffe070', 1, 'center');
            drawText(ctx, 'STEVE BALLMER', GAME.W / 2, GAME.H - 40, '#ff80a0', 1, 'center');
        }
        // Boss entry telegraph
        if (this.phase === 'bossEntry') {
            const cx = GAME.W / 2;
            const cy = BACK_WALL_Y + 30;
            const a = 0.4 + 0.4 * Math.sin(this.bossEntryT * 0.3);
            ctx.strokeStyle = `rgba(255, 96, 160, ${a})`;
            ctx.lineWidth = 1;
            const r = 30 + Math.sin(this.bossEntryT * 0.15) * 6;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            drawText(ctx, 'CORE ONLINE', GAME.W / 2, 80, '#ff60a0', 1, 'center');
        }
        // HUD
        this._drawHUD();
        // Stage-clear overlay
        if (this.phase === 'clear') {
            const t = this.clearT || 0;
            ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, t * 0.02)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            if (t > 60) {
                // R280: vary the clear text by ending style.
                const clearText = this.endingStyle === 'door' ? 'ENTERING...' : 'CORE BREACHED';
                drawText(ctx, clearText, GAME.W / 2, GAME.H / 2 - 8, '#ffe070', 2, 'center');
                const a = 0.6 + 0.4 * Math.sin(t * 0.15);
                ctx.globalAlpha = a;
                drawText(ctx, 'PRESS X', GAME.W / 2, GAME.H / 2 + 12, '#a890b0', 1, 'center');
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
            const y = depthY(0.6);
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
            const tw = t.w * scale;
            const th = t.h * scale;
            const tx = depthX(t.originX, t.t) - tw / 2;
            const ty = depthY(t.t) - th;
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
            // R264: sprite is taller than the rect was (32×40 vs 16×24);
            // keep the drawn size proportional so depth scaling still reads.
            const gw = 24 * scale;
            const gh = 32 * scale;
            const gx = depthX(g.originX, tt) - gw / 2;
            const gy = depthY(tt) - gh;
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
        if (coreImg) {
            ctx.imageSmoothingEnabled = false;
            const drawW = c.w + 4, drawH = c.h + 4;
            const dx = Math.round(c.x - drawW / 2);
            const dy = Math.round(c.y - drawH / 2);
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
                const sw = 14, sh = 14;
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
        for (let i = 0; i < 6; i++) {
            const hot = i < this.player.hp;
            ctx.fillStyle = hot ? '#ff4040' : '#3a1018';
            ctx.fillRect(6 + i * 8, 6, 6, 6);
        }
        // Lives counter — small clippy heads beneath the HP bar
        const lives = Math.max(0, this.player.lives);
        drawText(ctx, 'x' + lives, 6, 16, '#ffcc80', 1, 'left');
        // Segment count
        drawText(ctx, (this.segment + 1) + ' / 4', GAME.W - 6, 6, '#ffcc80', 1, 'right');
    }
}

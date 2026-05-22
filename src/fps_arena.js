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

        // Progression
        this.segment = 0;            // 0..3 (segment 3 = boss)
        this.phase = 'fight';        // 'fight' | 'advance' | 'bossEntry' | 'boss' | 'clear'
        this.advanceT = 0;           // frames into the advance transition

        // Player
        this.player = {
            x: GAME.W / 2 - PLAYER_W / 2,
            y: RAIL_Y - PLAYER_H,
            w: PLAYER_W, h: PLAYER_H,
            hp: 6,
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

        this.bgImg = sprites.images.get(stageData.bgKey) || null;

        // Boot the first segment
        this._loadSegment(0);
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
            // SEGMENT 4 — boss. Core + 3 orbiting shields. Phase shifts
            // to 'bossEntry' so the telegraph runs before core fires.
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
        if (this.phase === 'clear') {
            this.clearT = (this.clearT || 0) + 1;
            if (this.clearT > 60 &&
                (input.isPressed('shoot') || input.isPressed('jump') ||
                 input.isPressed('start') || input.isPressed('pause'))) {
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
                this.advanceT = 0;
                this.phase = (this.segment === 3) ? 'bossEntry' : 'fight';
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
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
            if (b.life <= 0 || b.y > GAME.H + 10) {
                this.enemyBullets.splice(i, 1);
                continue;
            }
            if (p.iframes <= 0 &&
                b.x >= p.x && b.x <= p.x + p.w &&
                b.y >= p.y && b.y <= p.y + p.h) {
                p.hp -= 1;
                p.iframes = 60;
                this.enemyBullets.splice(i, 1);
                audio.sfx('playerHit');
                if (p.hp <= 0) {
                    this.game._fadeTo('gameOver');
                }
            }
        }
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
        audio.sfx('enemyShoot');
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
                    if (this.player.hp <= 0) this.game._fadeTo('gameOver');
                }
                continue;
            }
            // Fire forward periodically
            g.fireT++;
            if (g.fireT >= GRUNT_FIRE_PERIOD) {
                g.fireT = 0;
                const cx = depthX(g.originX, tt);
                const cy = depthY(tt) - 14 * depthScale(tt);
                this.enemyBullets.push({
                    x: cx, y: cy,
                    vx: 0, vy: 1.4,
                    life: 200,
                });
                audio.sfx('enemyShoot');
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
            // 5-way spread fan
            for (let i = -2; i <= 2; i++) {
                this.enemyBullets.push({
                    x: c.x, y: c.y + c.h / 2,
                    vx: i * 0.6,
                    vy: 1.8,
                    life: 220,
                });
            }
            audio.sfx('enemyShoot');
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
        // Enemy bullets
        for (const b of this.enemyBullets) {
            ctx.fillStyle = '#ff8040';
            ctx.fillRect(b.x - 1, b.y - 1, 3, 3);
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
                drawText(ctx, 'CORE BREACHED', GAME.W / 2, GAME.H / 2 - 8, '#ffe070', 2, 'center');
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
        const labels = ['SEGMENT 1 / TURRETS',
                        'SEGMENT 2 / GRUNTS',
                        'SEGMENT 3 / BARRIER',
                        'CORE'];
        drawText(ctx, labels[this.segment] || '', GAME.W / 2, 6, '#80a0c0', 1, 'center');
    }

    _drawBarriers() {
        if (!this.barriers.length) return;
        const ctx = this.ctx;
        for (const b of this.barriers) {
            const on = b.phase < BARRIER_ON_FRAMES;
            const y = depthY(0.6);
            const flick = Math.random() < 0.3;
            const a = on ? (flick ? 0.8 : 0.6) : 0.15;
            ctx.fillStyle = `rgba(120, 200, 255, ${a})`;
            // Two arcs at mid-corridor depth, top + bottom
            for (let i = 0; i < 6; i++) {
                const x = 16 + i * (GAME.W - 32) / 5;
                ctx.fillRect(x - 1, y - 3, 2, 6);
            }
            // Connecting beam when active
            if (on) {
                ctx.fillStyle = `rgba(200, 240, 255, ${0.3 + 0.3 * Math.random()})`;
                ctx.fillRect(16, y - 1, GAME.W - 32, 2);
            }
        }
    }

    _drawTurrets() {
        const ctx = this.ctx;
        for (const t of this.turrets) {
            if (!t.alive) continue;
            const scale = depthScale(t.t);
            const tw = t.w * scale;
            const th = t.h * scale;
            const tx = depthX(t.originX, t.t) - tw / 2;
            const ty = depthY(t.t) - th;
            ctx.fillStyle = t.hitFlash > 0 ? '#ffffff' : '#3a2818';
            ctx.fillRect(tx, ty, tw, th);
            ctx.fillStyle = '#5a3828';
            ctx.fillRect(tx + 2, ty + 2, tw - 4, th - 4);
            // Barrels — 3 stubs pointing down
            ctx.fillStyle = '#1a1008';
            for (let i = 0; i < 3; i++) {
                const bx = tx + 3 + i * (tw - 6) / 2 - 1;
                ctx.fillRect(bx, ty + th, 2 * scale, 5 * scale);
            }
            // Glowing eye
            ctx.fillStyle = '#ff4030';
            ctx.fillRect(tx + tw / 2 - 1, ty + 4, 2, 2);
        }
    }

    _drawGrunts() {
        const ctx = this.ctx;
        for (const g of this.grunts) {
            if (!g.alive || g.runT < g.spawnDelay) continue;
            const tt = Math.min(1, (g.runT - g.spawnDelay) / GRUNT_RUN_FRAMES);
            const scale = depthScale(tt);
            const gw = 16 * scale;
            const gh = 24 * scale;
            const gx = depthX(g.originX, tt) - gw / 2;
            const gy = depthY(tt) - gh;
            // Body — back of paperclip minion running forward
            ctx.fillStyle = g.hitFlash > 0 ? '#ffffff' : '#a8c060';
            ctx.fillRect(gx, gy + gh * 0.3, gw, gh * 0.7);
            // Head
            ctx.fillStyle = g.hitFlash > 0 ? '#ffffff' : '#c8e070';
            ctx.fillRect(gx + gw * 0.2, gy, gw * 0.6, gh * 0.35);
            // Eye-shine for far ones (looks menacing)
            if (tt < 0.6) {
                ctx.fillStyle = '#ffff80';
                ctx.fillRect(gx + gw * 0.5 - 1, gy + 2, 2, 2);
            }
        }
    }

    _drawBoss() {
        if (!this.core) return;
        const ctx = this.ctx;
        const c = this.core;
        if (!c.alive) return;
        // Core body — pulsing exposed system
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.12);
        ctx.fillStyle = c.hitFlash > 0 ? '#ffffff' : '#400820';
        ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
        ctx.fillStyle = `rgba(${200 + pulse * 55}, ${60 + pulse * 40}, ${120 + pulse * 80}, 1)`;
        ctx.fillRect(c.x - c.w / 2 + 4, c.y - c.h / 2 + 4, c.w - 8, c.h - 8);
        // Core eye
        ctx.fillStyle = '#ffe0a0';
        ctx.fillRect(c.x - 3, c.y - 3, 6, 6);
        ctx.fillStyle = '#ff2040';
        ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
        // Shields — orbiting nodes
        for (const s of this.shields) {
            if (!s.alive) continue;
            const sx = c.x + Math.cos(s.angle) * s.radius;
            const sy = c.y + Math.sin(s.angle) * s.radius;
            ctx.fillStyle = s.hitFlash > 0 ? '#ffffff' : '#a060ff';
            ctx.fillRect(sx - 5, sy - 5, 10, 10);
            ctx.fillStyle = '#e0c0ff';
            ctx.fillRect(sx - 3, sy - 3, 6, 6);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx - 1, sy - 1, 2, 2);
        }
        // HP bar
        this._drawBossHp();
    }

    _drawPlayer() {
        const ctx = this.ctx;
        const p = this.player;
        const flicker = p.iframes > 0 && (p.iframes % 4 < 2);
        if (flicker) return;
        // Draw Clippy at 1.5x scale, back-facing (we approximate by using the
        // existing idle/run sprite — paperclip silhouette reads the same
        // from behind). Animate the run cycle when strafing.
        const runFrames = ['run_1', 'run_2', 'run_3', 'run_4'];
        const sourceKey = (Math.abs(input.axis().x) > 0.1)
            ? runFrames[Math.floor(p.runFrame) % runFrames.length]
            : 'idle';
        const img = sprites.images.get(sourceKey) || sprites.images.get('idle_01');
        if (img) {
            ctx.imageSmoothingEnabled = false;
            const dx = Math.round(p.x);
            const dy = Math.round(p.y);
            // Source sprites are ~16×24; we scale to PLAYER_W × PLAYER_H.
            ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, p.w, p.h);
        } else {
            ctx.fillStyle = '#80889a';
            ctx.fillRect(p.x, p.y, p.w, p.h);
        }
        // Aim indicator — small chevron above the head matching facing
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
        const tag = allShieldsDead ? 'EXPOSED CORE' : 'CORE / SHIELDED';
        drawText(ctx, tag, GAME.W / 2, y - 8, '#e0c0ff', 1, 'center');
    }

    _drawHUD() {
        const ctx = this.ctx;
        for (let i = 0; i < 6; i++) {
            const hot = i < this.player.hp;
            ctx.fillStyle = hot ? '#ff4040' : '#3a1018';
            ctx.fillRect(6 + i * 8, 6, 6, 6);
        }
        // Segment count
        drawText(ctx, (this.segment + 1) + ' / 4', GAME.W - 6, 6, '#ffcc80', 1, 'right');
    }
}

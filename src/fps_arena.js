// R229: locked-camera FPS arena (Contra arcade Stage 3 style).
//
// Self-contained gameplay loop — no horizontal scroll, no tile collision,
// no enemy AI sharing. Player strafes left/right along a ground rail at
// the bottom of the screen; aim is locked upward (with diag-aim via held
// arrows). Goal: destroy 4 SENSORS guarded by 2 TURRET banks at the top
// of the screen, then a boss spawns and slides L↔R while attacking.
//
// Stage data shape (returned by makeFpsStage in level.js):
//   {
//     fpsMode: true,
//     bgKey: 'bg_sewer_lab',           // painted backdrop (drawn 1:1)
//     bossKind: 'SPINDLER',            // boss code from BOSS_TEMPLATES
//     turrets: [{x, y}, {x, y}],       // L+R turret bank positions
//     sensors: [{x, y}, ...],          // 4 sensors between turrets
//   }
//
// State machine: 'fight' (sensors+turrets alive) → 'bossEntry' (sensors
// dead, boss telegraph) → 'boss' (boss alive) → exits via stageClear.

import { GAME } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { sprites } from './sprites.js';
import { drawText } from './pixelfont.js';

// Layout constants — all in screen pixels (256x224 canvas).
const RAIL_Y = GAME.H - 24;          // ground rail y where Clippy stands
const PLAYER_W = 16, PLAYER_H = 24;
const PLAYER_SPEED = 1.4;             // pixels/frame strafe
const PLAYER_X_MIN = 12;
const PLAYER_X_MAX = GAME.W - PLAYER_W - 12;
const BULLET_SPEED = 4.5;
const BULLET_FIRE_COOLDOWN = 6;       // frames between shots

const TURRET_W = 32, TURRET_H = 24;
const TURRET_HP = 8;
const TURRET_FIRE_PERIOD = 90;        // frames between turret volleys
const TURRET_BULLET_SPEED = 1.6;

const SENSOR_W = 14, SENSOR_H = 14;
const SENSOR_HP = 4;

const BOSS_W = 28, BOSS_H = 44;
const BOSS_HP = 60;
const BOSS_SPEED = 0.8;
const BOSS_FIRE_PERIOD = 70;
const BOSS_Y = 28;                    // boss patrols across the top

export class FpsArena {
    constructor(stageData, ctx, game) {
        this.ctx = ctx;
        this.game = game;
        this.data = stageData;
        this.t = 0;
        this.phase = 'fight';          // 'fight' | 'bossEntry' | 'boss' | 'clear'
        this.bossEntryT = 0;

        // Player state
        this.player = {
            x: GAME.W / 2 - PLAYER_W / 2,
            y: RAIL_Y - PLAYER_H,
            w: PLAYER_W, h: PLAYER_H,
            hp: 6,
            iframes: 0,
            shootCD: 0,
            facing: 0,                 // -1 left, 0 up, 1 right (aim diag)
            score: 0,
        };

        // Entities
        this.turrets = stageData.turrets.map(t => ({
            x: t.x, y: t.y, w: TURRET_W, h: TURRET_H,
            hp: TURRET_HP, alive: true, fireT: 0, hitFlash: 0,
        }));
        this.sensors = stageData.sensors.map(s => ({
            x: s.x, y: s.y, w: SENSOR_W, h: SENSOR_H,
            hp: SENSOR_HP, alive: true, hitFlash: 0,
        }));
        this.boss = null;               // spawned on phase transition

        this.bullets = [];              // player shots
        this.enemyBullets = [];         // turret + boss shots
        this.particles = [];

        // Try to load the painted bg
        this.bgImg = sprites.images.get(stageData.bgKey) || null;
    }

    // ============== tick ==============
    update() {
        this.t++;
        this._tickPlayer();
        this._tickBullets();
        this._tickEnemyBullets();
        if (this.phase === 'fight') this._tickFight();
        else if (this.phase === 'bossEntry') this._tickBossEntry();
        else if (this.phase === 'boss') this._tickBoss();
        this._tickParticles();
    }

    _tickPlayer() {
        const ax = input.axis();
        const p = this.player;
        // Strafe
        p.x += ax.x * PLAYER_SPEED;
        if (p.x < PLAYER_X_MIN) p.x = PLAYER_X_MIN;
        if (p.x > PLAYER_X_MAX) p.x = PLAYER_X_MAX;
        // Aim facing — directional input picks diag, otherwise straight up.
        // Up arrow held = pure vertical (default anyway); left/right tilt aim.
        if (ax.x < -0.1)      p.facing = -1;
        else if (ax.x > 0.1)  p.facing = 1;
        else                  p.facing = 0;
        // i-frames
        if (p.iframes > 0) p.iframes--;
        // Fire — X key, straight up (or diag based on facing).
        if (p.shootCD > 0) p.shootCD--;
        if (input.isHeld('shoot') && p.shootCD <= 0) {
            this._fire();
            p.shootCD = BULLET_FIRE_COOLDOWN;
        }
    }

    _fire() {
        const p = this.player;
        // Velocity: up always, x component from facing
        const vx = p.facing * 1.2;
        const vy = -BULLET_SPEED;
        this.bullets.push({
            x: p.x + p.w / 2 - 1,
            y: p.y,
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
            if (b.life <= 0 || b.y < -10) { this.bullets.splice(i, 1); continue; }
            // Hit sensors
            for (const s of this.sensors) {
                if (!s.alive) continue;
                if (b.x >= s.x && b.x <= s.x + s.w && b.y >= s.y && b.y <= s.y + s.h) {
                    s.hp--;
                    s.hitFlash = 4;
                    this.bullets.splice(i, 1);
                    if (s.hp <= 0) {
                        s.alive = false;
                        this.player.score += 500;
                        audio.sfx('enemyDie');
                        this._explosion(s.x + s.w / 2, s.y + s.h / 2, '#ff8040');
                    } else {
                        audio.sfx('hit');
                    }
                    break;
                }
            }
            if (this.bullets[i] !== b) continue;
            // Hit turrets
            for (const t of this.turrets) {
                if (!t.alive) continue;
                if (b.x >= t.x && b.x <= t.x + t.w && b.y >= t.y && b.y <= t.y + t.h) {
                    t.hp--;
                    t.hitFlash = 4;
                    this.bullets.splice(i, 1);
                    if (t.hp <= 0) {
                        t.alive = false;
                        this.player.score += 1000;
                        audio.sfx('bossHit');
                        this._explosion(t.x + t.w / 2, t.y + t.h / 2, '#ff6020');
                    } else {
                        audio.sfx('hit');
                    }
                    break;
                }
            }
            if (this.bullets[i] !== b) continue;
            // Hit boss
            if (this.boss && this.boss.alive) {
                const bo = this.boss;
                if (b.x >= bo.x && b.x <= bo.x + bo.w && b.y >= bo.y && b.y <= bo.y + bo.h) {
                    bo.hp--;
                    bo.hitFlash = 4;
                    this.bullets.splice(i, 1);
                    if (bo.hp <= 0) {
                        bo.alive = false;
                        this.player.score += 9500;
                        audio.sfx('bossDie');
                        this._explosion(bo.x + bo.w / 2, bo.y + bo.h / 2, '#a060ff');
                        this.phase = 'clear';
                        this.clearT = 0;
                    } else {
                        audio.sfx('bossHit');
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
            if (b.life <= 0 || b.y > GAME.H + 10) { this.enemyBullets.splice(i, 1); continue; }
            // Hit player
            if (p.iframes <= 0 &&
                b.x >= p.x && b.x <= p.x + p.w &&
                b.y >= p.y && b.y <= p.y + p.h) {
                p.hp -= 1;
                p.iframes = 60;
                this.enemyBullets.splice(i, 1);
                audio.sfx('playerHit');
                if (p.hp <= 0) {
                    // Out — kick player back to stage select (game over flow)
                    this.game._fadeTo('gameOver');
                }
            }
        }
    }

    _tickFight() {
        // Turret fire
        for (const t of this.turrets) {
            if (!t.alive) continue;
            if (t.hitFlash > 0) t.hitFlash--;
            t.fireT++;
            if (t.fireT >= TURRET_FIRE_PERIOD) {
                t.fireT = 0;
                this._turretVolley(t);
            }
        }
        for (const s of this.sensors) if (s.hitFlash > 0) s.hitFlash--;
        // All sensors dead? → boss entry
        if (this.sensors.every(s => !s.alive)) {
            this.phase = 'bossEntry';
            this.bossEntryT = 0;
            audio.sfx('bossEntrance');
        }
    }

    _turretVolley(t) {
        // 3-way spread fired downward
        const cx = t.x + t.w / 2;
        const cy = t.y + t.h;
        const spread = [-0.4, 0, 0.4];
        for (const sx of spread) {
            this.enemyBullets.push({
                x: cx, y: cy,
                vx: sx * TURRET_BULLET_SPEED,
                vy: TURRET_BULLET_SPEED,
                life: 240,
            });
        }
        audio.sfx('enemyShoot');
    }

    _tickBossEntry() {
        this.bossEntryT++;
        // Drop the boss in from the top after 90f telegraph
        if (this.bossEntryT >= 90 && !this.boss) {
            this.boss = {
                x: GAME.W / 2 - BOSS_W / 2,
                y: BOSS_Y,
                w: BOSS_W, h: BOSS_H,
                hp: BOSS_HP, maxHp: BOSS_HP, alive: true,
                vx: BOSS_SPEED, fireT: 0, hitFlash: 0,
            };
        }
        if (this.bossEntryT >= 130) this.phase = 'boss';
    }

    _tickBoss() {
        const b = this.boss;
        if (!b || !b.alive) return;
        if (b.hitFlash > 0) b.hitFlash--;
        // Patrol L↔R
        b.x += b.vx;
        if (b.x < 16) { b.x = 16; b.vx = -b.vx; }
        if (b.x > GAME.W - BOSS_W - 16) { b.x = GAME.W - BOSS_W - 16; b.vx = -b.vx; }
        // Fire downward syringe darts
        b.fireT++;
        if (b.fireT >= BOSS_FIRE_PERIOD) {
            b.fireT = 0;
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h;
            // 3-dart spread aimed roughly at player x
            const px = this.player.x + this.player.w / 2;
            const dx = px - cx;
            const dist = Math.hypot(dx, GAME.H);
            const baseVx = dx / dist * 1.8;
            for (const sp of [-0.5, 0, 0.5]) {
                this.enemyBullets.push({
                    x: cx, y: cy,
                    vx: baseVx + sp,
                    vy: 2.0,
                    life: 200,
                });
            }
            audio.sfx('enemyShoot');
        }
    }

    _explosion(x, y, color) {
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 1 + Math.random() * 2;
            this.particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 30,
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
        // Background
        if (this.bgImg) {
            ctx.imageSmoothingEnabled = false;
            // Cover canvas — scale bg to fit, center
            const scale = Math.max(GAME.W / this.bgImg.width, GAME.H / this.bgImg.height);
            const dw = this.bgImg.width * scale;
            const dh = this.bgImg.height * scale;
            ctx.drawImage(this.bgImg, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
        } else {
            // Fallback gradient
            ctx.fillStyle = '#080a14';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Rail (ground line)
        ctx.fillStyle = '#1a1810';
        ctx.fillRect(0, RAIL_Y, GAME.W, GAME.H - RAIL_Y);
        ctx.fillStyle = '#2a2418';
        ctx.fillRect(0, RAIL_Y, GAME.W, 1);
        // Sensors
        for (const s of this.sensors) {
            if (!s.alive) continue;
            ctx.fillStyle = s.hitFlash > 0 ? '#ffffff' : '#ff8040';
            ctx.fillRect(s.x, s.y, s.w, s.h);
            ctx.fillStyle = '#ffcc80';
            ctx.fillRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6);
            // Pulsing center
            const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.2);
            ctx.fillStyle = `rgba(255, 80, 40, ${pulse})`;
            ctx.fillRect(s.x + 5, s.y + 5, s.w - 10, s.h - 10);
        }
        // Turrets
        for (const t of this.turrets) {
            if (!t.alive) continue;
            ctx.fillStyle = t.hitFlash > 0 ? '#ffffff' : '#3a2818';
            ctx.fillRect(t.x, t.y, t.w, t.h);
            ctx.fillStyle = '#5a3828';
            ctx.fillRect(t.x + 2, t.y + 2, t.w - 4, t.h - 4);
            // Barrels (3, pointing down)
            ctx.fillStyle = '#1a1008';
            for (let i = 0; i < 3; i++) {
                const bx = t.x + 4 + i * 10;
                ctx.fillRect(bx, t.y + t.h, 4, 6);
            }
        }
        // Boss
        if (this.boss && this.boss.alive) {
            const b = this.boss;
            // Try painted Spindler sprite
            const spriteKey = 'boss_' + this.data.bossKind;
            if (sprites.has(spriteKey)) {
                const dims = sprites.dims.get(spriteKey);
                const dx = Math.round(b.x + b.w / 2 - dims.w / 2);
                const dy = Math.round(b.y + b.h - dims.h);
                if (b.hitFlash > 0 && b.hitFlash % 2 === 0) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.5;
                    sprites.draw(ctx, spriteKey, dx, dy, false);
                    ctx.restore();
                }
                sprites.draw(ctx, spriteKey, dx, dy, false);
            } else {
                // Procedural fallback — purple body
                ctx.fillStyle = b.hitFlash > 0 ? '#ffffff' : '#a060ff';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
            // HP bar at top
            this._drawBossHp();
        }
        // Boss entry telegraph
        if (this.phase === 'bossEntry') {
            const cx = GAME.W / 2;
            const cy = BOSS_Y + BOSS_H / 2;
            const a = 0.4 + 0.4 * Math.sin(this.bossEntryT * 0.3);
            ctx.strokeStyle = `rgba(160, 96, 255, ${a})`;
            ctx.lineWidth = 1;
            const r = 30 + Math.sin(this.bossEntryT * 0.15) * 6;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            drawText(ctx, 'INCOMING', GAME.W / 2, 80, '#ff60ff', 1, 'center');
        }
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
            const a = Math.min(1, p.life / 30);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = a;
            ctx.fillRect(p.x, p.y, 2, 2);
        }
        ctx.globalAlpha = 1;
        // Player
        const p = this.player;
        const flicker = p.iframes > 0 && (p.iframes % 4 < 2);
        if (!flicker) {
            // Use Clippy sprite if available
            if (sprites.has('idle_01')) {
                sprites.draw(ctx, 'idle_01', Math.round(p.x), Math.round(p.y), false);
            } else {
                ctx.fillStyle = '#80889a';
                ctx.fillRect(p.x, p.y, p.w, p.h);
            }
        }
        // HUD
        this._drawHUD();
        // Stage-clear overlay
        if (this.phase === 'clear') {
            this.clearT = (this.clearT || 0) + 1;
            ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, this.clearT * 0.02)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            if (this.clearT > 60) {
                drawText(ctx, 'CORE BREACHED', GAME.W / 2, GAME.H / 2 - 8, '#ffe070', 2, 'center');
                drawText(ctx, 'PRESS X', GAME.W / 2, GAME.H / 2 + 12, '#a890b0', 1, 'center');
                if (input.isPressed('shoot') || input.isPressed('jump')) {
                    this.game._fadeTo('title');
                }
            }
        }
    }

    _drawBossHp() {
        const ctx = this.ctx;
        const b = this.boss;
        const barW = GAME.W - 32;
        const x = 16, y = GAME.H - 10;
        ctx.fillStyle = '#2a0a14';
        ctx.fillRect(x, y, barW, 4);
        const fill = (b.hp / b.maxHp) * barW;
        ctx.fillStyle = b.hp < b.maxHp * 0.3 ? '#ff3040' : '#a060ff';
        ctx.fillRect(x, y, fill, 4);
        drawText(ctx, 'DR. SPINDLER', GAME.W / 2, y - 8, '#e0c0ff', 1, 'center');
    }

    _drawHUD() {
        const ctx = this.ctx;
        // HP
        for (let i = 0; i < 6; i++) {
            const hot = i < this.player.hp;
            ctx.fillStyle = hot ? '#ff4040' : '#3a1018';
            ctx.fillRect(6 + i * 8, 6, 6, 6);
        }
        // Sensor counter
        const alive = this.sensors.filter(s => s.alive).length;
        drawText(ctx, 'SENSORS: ' + alive, GAME.W - 6, 6, '#ffcc80', 1, 'right');
    }
}

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
const PLAYER_W = 16, PLAYER_H = 24;
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
        this.spriteKeys = stageData.spriteKeys || {};

        // R307: atmospheric layers — fire embers blowing in the wind,
        // distant window lights flickering, and lightning flashes for the
        // post-apocalypse mood. All decorative, no gameplay impact.
        this._ambientEmbers = [];
        for (let i = 0; i < 18; i++) {
            this._ambientEmbers.push({
                x: Math.random() * GAME.W,
                y: STREET_TOP + Math.random() * (STREET_BOTTOM - STREET_TOP) * 0.8,
                vx: (Math.random() - 0.5) * 0.4,
                vy: -0.4 - Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
                hue: Math.random() < 0.6 ? '#ff7030' : '#ffb050',
            });
        }
        this._windowLights = [];
        for (let i = 0; i < 14; i++) {
            this._windowLights.push({
                x: Math.random() * GAME.W,
                y: 28 + Math.random() * (STREET_TOP - 36),
                w: 1 + (Math.random() < 0.4 ? 1 : 0),
                h: 1 + (Math.random() < 0.4 ? 1 : 0),
                phase: Math.random() * Math.PI * 2,
                rate: 0.04 + Math.random() * 0.08,
                duty: 0.45 + Math.random() * 0.3,
            });
        }
        this._lightningT = 0;
        this._lightningCooldown = 240 + (Math.random() * 360) | 0;

        // Boot first wave
        this._spawnWave(0);
    }

    // R307 — ambient layer helpers
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
        for (const w of this._windowLights) {
            w.phase += w.rate;
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
        for (const w of this._windowLights) {
            const lit = (Math.sin(w.phase) * 0.5 + 0.5) > (1 - w.duty);
            if (!lit) continue;
            const flick = 0.7 + 0.3 * Math.sin(w.phase * 5.7);
            ctx.globalAlpha = 0.55 * flick;
            ctx.fillStyle = '#ffd060';
            ctx.fillRect(w.x | 0, w.y | 0, w.w, w.h);
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

    _spawnEnemy({ type, side = 'right', depth = null, x = null }) {
        // Position: side = 'left'/'right' spawns off-screen at that edge.
        // depth = 0..1 maps to STREET_TOP..STREET_BOTTOM.
        const spawnX = x != null ? x
                     : side === 'left' ? -20
                     : GAME.W + 20;
        const dy = depth != null ? depth : 0.3 + Math.random() * 0.6;
        const spawnY = STREET_TOP + (STREET_BOTTOM - STREET_TOP) * dy;
        const stats = ENEMY_STATS[type] || ENEMY_STATS.scavenger;
        const e = {
            type,
            x: spawnX, y: spawnY,
            w: stats.w, h: stats.h,
            vx: 0, vy: 0,
            hp: stats.hp,
            maxHp: stats.hp,
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
        };
        this.enemies.push(e);
    }

    _waveCleared() {
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
            if (autoNext && this.clearT >= 120) {
                audio.stopTrack();
                this.game._pendingStage = autoNext;
                this.game._extraCards = null;
                this.game.storyTimer = 0;
                this.game.scene = 'stageCard';
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
            } else {
                // Small breath between waves
                setTimeout(() => {
                    if (this.phase === 'fight') this._spawnWave(this.waveIdx);
                }, 800);
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
        // Clamp to street band
        if (p.x < 8) p.x = 8;
        if (p.x > GAME.W - p.w - 8) p.x = GAME.W - p.w - 8;
        if (p.y < STREET_TOP) p.y = STREET_TOP;
        if (p.y > STREET_BOTTOM - p.h) p.y = STREET_BOTTOM - p.h;
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
            if (b.life <= 0 || b.x < -10 || b.x > GAME.W + 10) {
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
        // Background
        if (this.bgImg) {
            ctx.imageSmoothingEnabled = false;
            const scale = Math.max(GAME.W / this.bgImg.width, GAME.H / this.bgImg.height);
            const dw = this.bgImg.width * scale;
            const dh = this.bgImg.height * scale;
            ctx.drawImage(this.bgImg, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
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
        // R307: discrete window-light points + drifting embers behind the action.
        this._drawWindowLights(ctx);
        this._drawAmbientEmbers(ctx);
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
            ctx.fillRect(b.x, b.y, 4, 2);
        }
        // Enemy bullets
        for (const b of this.enemyBullets) {
            ctx.fillStyle = '#ff8040';
            ctx.fillRect(b.x - 1, b.y - 1, 3, 3);
        }
        // R314: typed particles (ring / smoke / debris / default spark)
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
                ctx.translate(Math.round(p.x + dw), Math.round(p.y));
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dw, dh);
                ctx.restore();
            } else {
                ctx.drawImage(img, 0, 0, img.width, img.height,
                              Math.round(p.x), Math.round(p.y), dw, dh);
            }
        } else {
            ctx.fillStyle = '#80889a';
            ctx.fillRect(p.x, p.y, p.w, p.h);
        }
    }

    _drawEnemy(e) {
        const ctx = this.ctx;
        const keyMap = {
            scavenger:   this.spriteKeys.scavenger   || 'scavenger',
            drone:       this.spriteKeys.drone       || 'drone',
            helicopter:  this.spriteKeys.helicopter  || 'helicopter',
            brawler:     this.spriteKeys.brawler     || 'brawler',
        };
        const img = sprites.images.get(keyMap[e.type]);
        const scale = depthScale(e.y);
        const dw = e.w * scale;
        const dh = e.h * scale;
        const facing = (this.player.x + this.player.w / 2) > (e.x + e.w / 2) ? 1 : -1;
        if (img) {
            ctx.imageSmoothingEnabled = false;
            const dx = Math.round(e.x);
            const dy = Math.round(e.y);
            if (facing < 0) {
                ctx.save();
                ctx.translate(dx + dw, dy);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dw, dh);
                ctx.restore();
            } else {
                ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
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
            ctx.fillRect(e.x, e.y, dw, dh);
        }
        // Mini HP bar above enemy if damaged
        if (e.hp < e.maxHp) {
            const bw = Math.round(dw);
            const fillW = Math.round((e.hp / e.maxHp) * bw);
            ctx.fillStyle = '#2a0a14';
            ctx.fillRect(e.x, e.y - 4, bw, 2);
            ctx.fillStyle = '#ff5040';
            ctx.fillRect(e.x, e.y - 4, fillW, 2);
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
    }
}

// Per-enemy stats — easy to tune in one place.
const ENEMY_STATS = {
    scavenger: {
        w: 16, h: 24, hp: 3, speed: 0.6,
        attackRange: 14, fireRange: 18, damage: 1, score: 150,
    },
    drone: {
        w: 18, h: 16, hp: 4, speed: 0.5,
        attackRange: 50, fireRange: 80, damage: 1, score: 250,
    },
    helicopter: {
        w: 26, h: 18, hp: 6, speed: 0.8,
        attackRange: 90, fireRange: 120, damage: 1, score: 400,
    },
    brawler: {
        w: 22, h: 28, hp: 10, speed: 0.45,
        attackRange: 16, fireRange: 20, damage: 2, score: 800,
    },
};

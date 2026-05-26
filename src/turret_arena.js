// R523: TURRET ARENA — third-person over-the-shoulder.
//
// Clippy stands at the bottom-center facing AWAY from the camera, hands
// on a big mounted MG turret. CRT-monitor monsters spawn at the
// vanishing point (back of room) and run TOWARD the camera, scaling up
// as they get closer. Their screens cycle through Win98 boot, BSOD,
// Word docs, Excel sheets, TV static.
//
// Camera: locked. Clippy is anchored lower-center, 1.5x sprite scale.
// Vanishing point is upper-center. Floor + ceiling ribs recede.
//
// Player: LEFT/RIGHT aim the crosshair (and the turret barrel) horizontally
//         across the back of the room. UP/DOWN raises/lowers the aim.
//         X (held) = fire. Overheat after sustained fire.
//         V = grenade — arcs toward where the crosshair is.
//
// Waves: 5 waves of CRT monsters. Final wave: a giant SERVER-TOWER with
//        3 stacked screens.

import { GAME } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { sprites } from './sprites.js';
import { drawText, drawTextOutlined } from './pixelfont.js';

// Layout — matches fps_arena's third-person framing
const VANISH_X    = GAME.W / 2;
const VANISH_Y    = 64;
const RAIL_Y      = GAME.H - 28;     // ground rail at bottom
const PLAYER_W    = 24;
const PLAYER_H    = 36;
const PLAYER_X    = GAME.W / 2 - PLAYER_W / 2;   // anchored center
const PLAYER_Y    = RAIL_Y - PLAYER_H;
const TURRET_BASE_Y = RAIL_Y - 16;
const BACK_WALL_Y = 56;

// Crosshair / aim
const CROSSHAIR_MIN_X = 24;
const CROSSHAIR_MAX_X = GAME.W - 24;
const CROSSHAIR_MIN_Y = 40;
const CROSSHAIR_MAX_Y = RAIL_Y - 36;

const BULLET_SPEED = 0.18;            // depth speed (per frame, normalized)
const FIRE_RATE = 4;
const OVERHEAT_RATE = 1.4;
const OVERHEAT_COOLDOWN = 0.8;
const OVERHEAT_MAX = 100;

const MONSTER_HP_BASE = 3;
const MONSTER_BASE_SPEED = 0.0035;    // depth advance per frame (t goes 0→1)
const MONSTER_W = 16;                 // hitbox width at t=1 (closest)
const MONSTER_H = 24;
const SCREEN_TYPES = ['boot', 'bsod', 'word', 'excel', 'static'];

const WAVES = [
    { count: 4, hpMul: 1.0, speedMul: 1.0, gap: 60 },
    { count: 5, hpMul: 1.0, speedMul: 1.1, gap: 50 },
    { count: 6, hpMul: 1.2, speedMul: 1.2, gap: 45 },
    { count: 8, hpMul: 1.3, speedMul: 1.3, gap: 38 },
    { count: 1, hpMul: 14,  speedMul: 0.6, gap: 0,  isBoss: true },
];

// Depth helpers — t in 0..1 (0 = vanishing point, 1 = at camera)
function depthScale(t) {
    // Quadratic ease so far-away enemies are tiny and close enemies are full-size.
    // Min scale 0.18 at t=0, max 1.0 at t=1.
    return 0.18 + 0.82 * t * t;
}
function depthX(originX, t) {
    // originX is the lane (0..1) the monster spawned in.
    // At t=0 they're near vanishing X; at t=1 they're at the lane's screen-X.
    const farX = VANISH_X;
    const nearX = CROSSHAIR_MIN_X + originX * (CROSSHAIR_MAX_X - CROSSHAIR_MIN_X);
    return farX + (nearX - farX) * t;
}
function depthY(t) {
    // Vanishing point at top, rail at bottom — monsters walk down the floor
    return VANISH_Y + (RAIL_Y - VANISH_Y) * t;
}

export class TurretArena {
    constructor(stageData, ctx, game) {
        this.game = game;
        this.ctx = ctx || game?.ctx;
        this.data = stageData || {};
        this.t = 0;

        this.player = {
            hp: 6,
            maxHp: 6,
            lives: 3,
            iframes: 0,
            score: 0,
            kills: 0,
            // Crosshair screen position
            aimX: GAME.W / 2,
            aimY: GAME.H / 2 - 8,
            fireT: 0,
            heat: 0,
            overheated: false,
            grenades: 3,
            grenadeCD: 0,
        };

        this.bullets = [];               // {x, y, t, ax, ay, fromAimX, fromAimY}
        this.monsters = [];
        this.grenadeProjectiles = [];
        this.explosions = [];
        this.muzzleFlashT = 0;
        this.screenShake = 0;

        this.waveIdx = 0;
        this.waveSpawned = 0;
        this.waveSpawnT = -60;            // 1s breather before first wave
        this.phase = 'fight';
        this.clearT = 0;

        this.bgImg = sprites.images.get(stageData?.bgKey) || null;
        this._introT = 90;
    }

    update() {
        this.t++;
        if (this._introT > 0) {
            this._introT--;
            return;
        }
        if (this.player.hp <= 0) return;
        if (this.phase === 'fight') {
            this._tickPlayer();
            this._tickBullets();
            this._tickGrenades();
            this._tickMonsters();
            this._tickWave();
            this._tickExplosions();
            this._checkWaveClear();
        } else if (this.phase === 'clear') {
            this.clearT++;
            if (this.clearT > 90 && (input.isPressed('shoot') || input.isPressed('jump'))) {
                this._onStageComplete();
            }
        }
        if (this.muzzleFlashT > 0) this.muzzleFlashT--;
        if (this.screenShake > 0) this.screenShake--;
        if (this.player.iframes > 0) this.player.iframes--;
    }

    _tickPlayer() {
        const p = this.player;
        const ax = input.axis();
        // Move crosshair via stick / arrows
        const aimSpeed = 2.4;
        p.aimX += ax.x * aimSpeed;
        p.aimY += ax.y * aimSpeed;
        p.aimX = Math.max(CROSSHAIR_MIN_X, Math.min(CROSSHAIR_MAX_X, p.aimX));
        p.aimY = Math.max(CROSSHAIR_MIN_Y, Math.min(CROSSHAIR_MAX_Y, p.aimY));

        // Mouse aim (if available via input.mouseX/Y)
        if (input.mouseX != null) {
            const sx = input.screenToInternalX?.(input.mouseX);
            const sy = input.screenToInternalY?.(input.mouseY);
            if (sx != null && sy != null) {
                p.aimX = Math.max(CROSSHAIR_MIN_X, Math.min(CROSSHAIR_MAX_X, sx));
                p.aimY = Math.max(CROSSHAIR_MIN_Y, Math.min(CROSSHAIR_MAX_Y, sy));
            }
        }

        // Fire
        if (p.fireT > 0) p.fireT--;
        if (p.overheated) {
            p.heat -= OVERHEAT_COOLDOWN * 1.5;
            if (p.heat <= 0) {
                p.heat = 0;
                p.overheated = false;
                audio.sfx?.('select');
            }
        } else {
            if (input.isHeld('shoot') && p.fireT <= 0) {
                this._fire();
                p.fireT = FIRE_RATE;
                p.heat += OVERHEAT_RATE;
                if (p.heat >= OVERHEAT_MAX) {
                    p.heat = OVERHEAT_MAX;
                    p.overheated = true;
                    audio.sfx?.('mgOverheat');
                }
            } else if (!input.isHeld('shoot')) {
                p.heat = Math.max(0, p.heat - OVERHEAT_COOLDOWN);
            }
        }

        // Grenade
        if (p.grenadeCD > 0) p.grenadeCD--;
        if (input.isPressed('grenade') && p.grenades > 0 && p.grenadeCD <= 0) {
            this._throwGrenade();
            p.grenades--;
            p.grenadeCD = 24;
        }
    }

    _fire() {
        const p = this.player;
        // Bullet travels from the turret barrel (mid-screen-bottom) toward
        // the crosshair, in DEPTH (t=0..1 → t=1..0). At t=0 the bullet is
        // at the crosshair screen position. We simulate it receding toward
        // the vanishing point with slight overheat-jitter.
        const jitter = (p.heat / OVERHEAT_MAX) * 8;
        const startX = GAME.W / 2 + (Math.random() - 0.5) * 4;
        const startY = TURRET_BASE_Y;
        // Bullet aim point (slightly jittered when overheating)
        const aimX = p.aimX + (Math.random() - 0.5) * jitter;
        const aimY = p.aimY + (Math.random() - 0.5) * jitter;
        this.bullets.push({
            x: startX,
            y: startY,
            t: 1.0,                       // starts at "camera" depth
            // Direction is encoded in screen-coords: dx/dy per frame
            ax: aimX, ay: aimY,
            startX, startY,
            life: 60,
        });
        this.muzzleFlashT = 4;
        this.screenShake = Math.max(this.screenShake, 1);
        audio.sfx?.('mg');
    }

    _throwGrenade() {
        const p = this.player;
        const startX = GAME.W / 2;
        const startY = TURRET_BASE_Y;
        // Arc tossing toward the crosshair — fixed up-vertical, horizontal
        // toward aim x
        const dx = (p.aimX - startX) / 60;
        this.grenadeProjectiles.push({
            x: startX,
            y: startY,
            vx: dx,
            vy: -2.6,
            life: 80,
            gravity: 0.12,
            // Detonate at depth that maps to aim Y
            detonateY: p.aimY,
            tumble: 0,
        });
        audio.sfx?.('grenadeThrow');
    }

    _tickBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            // Advance bullet t backwards (toward vanishing point)
            b.t -= BULLET_SPEED;
            b.life--;
            if (b.t <= 0 || b.life <= 0) {
                this.bullets.splice(i, 1);
                continue;
            }
            // Position interpolation: at t=1 at startX/Y, at t=0 at aimX/Y
            b.x = b.startX + (b.ax - b.startX) * (1 - b.t);
            b.y = b.startY + (b.ay - b.startY) * (1 - b.t);
            // Check monster collision — monsters live in depth space
            for (const m of this.monsters) {
                if (!m.alive) continue;
                // Bullet hits when it reaches the monster's depth and
                // crosses inside the monster's screen-space hitbox.
                if (Math.abs(b.t - m.t) > 0.06) continue;
                const ms = depthScale(m.t);
                const mx = depthX(m.lane, m.t) - (m.w * ms) / 2;
                const my = depthY(m.t) - (m.h * ms);
                const mw = m.w * ms;
                const mh = m.h * ms;
                if (b.x >= mx && b.x <= mx + mw &&
                    b.y >= my && b.y <= my + mh) {
                    m.hp--;
                    m.hitFlash = 5;
                    this.bullets.splice(i, 1);
                    this.explosions.push({
                        x: b.x, y: b.y, t: m.t, age: 0, maxAge: 8,
                        color: '#a0d0ff', small: true,
                    });
                    if (m.hp <= 0) this._killMonster(m);
                    else audio.sfx?.('hit');
                    break;
                }
            }
        }
    }

    _tickGrenades() {
        for (let i = this.grenadeProjectiles.length - 1; i >= 0; i--) {
            const g = this.grenadeProjectiles[i];
            g.vy += g.gravity;
            g.x += g.vx;
            g.y += g.vy;
            g.life--;
            g.tumble += 0.4;
            if (g.life <= 0 || g.y >= g.detonateY) {
                this._detonateGrenade(g);
                this.grenadeProjectiles.splice(i, 1);
            }
        }
    }

    _detonateGrenade(g) {
        // Map screen-Y to depth t — invert depthY
        const t = (g.detonateY - VANISH_Y) / (RAIL_Y - VANISH_Y);
        const radius = 48;
        for (const m of this.monsters) {
            if (!m.alive) continue;
            const ms = depthScale(m.t);
            const mx = depthX(m.lane, m.t);
            const my = depthY(m.t) - (m.h * ms) / 2;
            const dx = mx - g.x;
            const dy = my - g.detonateY;
            const dt = m.t - t;
            // Only damage monsters in similar depth + screen-radius
            if (Math.hypot(dx, dy) < radius && Math.abs(dt) < 0.15) {
                m.hp -= 4;
                m.hitFlash = 8;
                if (m.hp <= 0) this._killMonster(m);
            }
        }
        this.explosions.push({
            x: g.x, y: g.detonateY, t, age: 0, maxAge: 24, color: '#ffa030',
        });
        this.screenShake = Math.max(this.screenShake, 8);
        audio.sfx?.('explosion');
    }

    _tickExplosions() {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const e = this.explosions[i];
            e.age++;
            if (e.age >= e.maxAge) this.explosions.splice(i, 1);
        }
    }

    _killMonster(m) {
        m.alive = false;
        m.deathT = 0;
        this.player.kills++;
        this.player.score += m.isBoss ? 1000 : 100;
        audio.sfx?.('enemyDie');
        const ms = depthScale(m.t);
        this.explosions.push({
            x: depthX(m.lane, m.t),
            y: depthY(m.t) - (m.h * ms) / 2,
            t: m.t,
            age: 0, maxAge: 18, color: '#a0d0ff',
        });
        this.screenShake = Math.max(this.screenShake, 3);
    }

    _tickMonsters() {
        for (const m of this.monsters) {
            if (!m.alive) {
                if (m.deathT != null) m.deathT++;
                continue;
            }
            if (m.hitFlash > 0) m.hitFlash--;
            // Advance toward camera in depth space
            m.t += m.speed;
            // Reached the camera — attack the turret
            if (m.t >= 1.0) {
                this._monsterReachedTurret(m);
                m.alive = false;
                m.deathT = 0;
                continue;
            }
            // Walk-cycle stride drives leg bob
            m._stride = (m._stride || 0) + 0.08 + m.t * 0.05;
            // Screen content cycle — change every 90f
            m._screenT = (m._screenT || 0) + 1;
            if (m._screenT > 90) {
                m._screenT = 0;
                m._screenIdx = (m._screenIdx + 1) % SCREEN_TYPES.length;
            }
        }
        this.monsters = this.monsters.filter(m => m.alive || (m.deathT != null && m.deathT < 40));
    }

    _monsterReachedTurret(m) {
        const p = this.player;
        if (p.iframes > 0) return;
        p.hp--;
        p.iframes = 60;
        this.screenShake = Math.max(this.screenShake, 6);
        audio.sfx?.('playerHit');
        if (p.hp <= 0) {
            audio.sfx?.('die');
            if (this.game) this.game._fadeTo?.('gameOver');
        }
    }

    _tickWave() {
        if (this.waveIdx >= WAVES.length) return;
        const wave = WAVES[this.waveIdx];
        if (this.waveSpawned >= wave.count) return;
        this.waveSpawnT++;
        if (this.waveSpawnT >= wave.gap) {
            this.waveSpawnT = 0;
            this._spawnMonster(wave);
            this.waveSpawned++;
        }
    }

    _spawnMonster(wave) {
        const isBoss = !!wave.isBoss;
        const lane = isBoss ? 0.5 : Math.random();
        const m = {
            t: 0.02,
            lane,
            w: isBoss ? 48 : MONSTER_W,
            h: isBoss ? 56 : MONSTER_H,
            speed: MONSTER_BASE_SPEED * wave.speedMul,
            hp: Math.ceil(MONSTER_HP_BASE * wave.hpMul),
            maxHp: Math.ceil(MONSTER_HP_BASE * wave.hpMul),
            hitFlash: 0,
            alive: true,
            isBoss,
            _stride: Math.random() * Math.PI * 2,
            _screenIdx: Math.floor(Math.random() * SCREEN_TYPES.length),
            _screenT: 0,
        };
        this.monsters.push(m);
    }

    _checkWaveClear() {
        if (this.waveIdx >= WAVES.length) return;
        const wave = WAVES[this.waveIdx];
        if (this.waveSpawned >= wave.count && this.monsters.every(m => !m.alive)) {
            this.waveIdx++;
            this.waveSpawned = 0;
            if (this.waveIdx >= WAVES.length) {
                this.phase = 'clear';
                this.clearT = 0;
                audio.sfx?.('secretFound');
            } else {
                this.waveSpawnT = -90;
            }
        }
    }

    _onStageComplete() {
        if (!this.game) return;
        // Award the kill counts to the global player stats so achievements
        // tick + post-stage report inherits them.
        if (this.game.player) {
            this.game.player.kills = (this.game.player.kills || 0) + this.player.kills;
            this.game.player.score = (this.game.player.score || 0) + this.player.score;
        }
        // Route to stage-clear (just falls back to title for this standalone
        // post-game stage; nextStage logic in the stage data overrides if set).
        if (this.data.nextStage) {
            this.game._pendingStage = this.data.nextStage;
        }
        this.game.storyTimer = 0;
        this.game.scene = 'stageCard';
    }

    // =========== draw ===========
    draw() {
        const ctx = this.ctx;
        ctx.save();
        if (this.screenShake > 0) {
            ctx.translate((Math.random() - 0.5) * this.screenShake,
                          (Math.random() - 0.5) * this.screenShake);
        }
        this._drawBg();
        this._drawRoom();
        // Render in depth order: far → near (so closer occludes farther)
        const drawable = [
            ...this.monsters.map(m => ({ kind: 'monster', m, t: m.t })),
            ...this.explosions.map(e => ({ kind: 'explosion', e, t: e.t ?? 1 })),
            ...this.bullets.map(b => ({ kind: 'bullet', b, t: b.t })),
        ].sort((a, b) => a.t - b.t);
        for (const d of drawable) {
            if (d.kind === 'monster') this._drawMonster(d.m);
            else if (d.kind === 'explosion') this._drawExplosion(d.e);
            else this._drawBullet(d.b);
        }
        this._drawGrenades();
        this._drawTurret();
        this._drawCrosshair();
        this._drawHud();
        ctx.restore();
        if (this._introT > 0) this._drawIntro();
        if (this.phase === 'clear') this._drawClear();
    }

    _drawBg() {
        const ctx = this.ctx;
        if (this.bgImg) {
            const img = this.bgImg;
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            // Dim warehouse
            ctx.fillStyle = '#0a0a14';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
    }

    _drawRoom() {
        const ctx = this.ctx;
        // Floor receding to vanishing point — 5 horizontal rails fading back
        ctx.save();
        ctx.strokeStyle = '#3a3a48';
        ctx.lineWidth = 1;
        const railCount = 6;
        for (let i = 1; i <= railCount; i++) {
            const tRail = i / (railCount + 1);
            const y = depthY(tRail);
            ctx.globalAlpha = 0.3 + 0.5 * tRail;
            // Floor line wider as it comes closer
            const halfW = 20 + tRail * (GAME.W / 2 - 10);
            ctx.beginPath();
            ctx.moveTo(VANISH_X - halfW, y);
            ctx.lineTo(VANISH_X + halfW, y);
            ctx.stroke();
        }
        // Side wall lines — converging
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(0, RAIL_Y); ctx.lineTo(VANISH_X, VANISH_Y);
        ctx.moveTo(GAME.W, RAIL_Y); ctx.lineTo(VANISH_X, VANISH_Y);
        // Ceiling
        ctx.moveTo(0, BACK_WALL_Y - 30); ctx.lineTo(VANISH_X, VANISH_Y);
        ctx.moveTo(GAME.W, BACK_WALL_Y - 30); ctx.lineTo(VANISH_X, VANISH_Y);
        ctx.stroke();
        ctx.restore();

        // Back wall — corkboard / server-room mural at vanishing point
        ctx.fillStyle = '#1a1a24';
        ctx.fillRect(VANISH_X - 30, BACK_WALL_Y - 10, 60, 20);
        // CRT shelves silhouettes on the back wall
        for (let i = 0; i < 6; i++) {
            const sx = VANISH_X - 24 + i * 8;
            const sh = 4 + (i & 1) * 2;
            ctx.fillStyle = '#0a0a14';
            ctx.fillRect(sx, BACK_WALL_Y - 6, 6, sh);
            ctx.fillStyle = '#2a4060';
            ctx.fillRect(sx + 1, BACK_WALL_Y - 5, 4, 2);
        }
        // Ceiling fluorescent tubes — humming
        const flick = (this.t * 0.5 | 0) & 7;
        ctx.fillStyle = flick === 0 ? '#605840' : '#8a8060';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(40 + i * 50, 4, 20, 2);
        }
    }

    _drawTurret() {
        const ctx = this.ctx;
        const p = this.player;
        // Back-of-Clippy first (smaller than full screen)
        const clippyImg = sprites.images.get('clippy_back_idle');
        if (clippyImg) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(clippyImg, 0, 0, clippyImg.width, clippyImg.height,
                          PLAYER_X, PLAYER_Y, PLAYER_W, PLAYER_H);
        } else {
            // Procedural Clippy-from-behind silhouette
            ctx.fillStyle = '#a0a0c0';
            ctx.fillRect(PLAYER_X + 8, PLAYER_Y + 4, 8, 14);
            ctx.fillStyle = '#606080';
            ctx.fillRect(PLAYER_X + 6, PLAYER_Y + 8, 12, 2);
            ctx.fillRect(PLAYER_X + 4, PLAYER_Y + 18, 16, 12);
        }

        // Turret base — heavy mount in front of Clippy
        const tx = GAME.W / 2 - 18;
        const ty = TURRET_BASE_Y - 4;
        // Sandbags below
        ctx.fillStyle = '#604838';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(tx - 4 + i * 14, ty + 10, 16, 8);
        }
        ctx.fillStyle = '#806050';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(tx - 4 + i * 14, ty + 10, 16, 1);
        }
        // Tripod
        ctx.fillStyle = '#404048';
        ctx.fillRect(tx + 16, ty + 4, 4, 14);
        ctx.fillRect(tx + 6, ty + 14, 4, 4);
        ctx.fillRect(tx + 26, ty + 14, 4, 4);
        // Mounting head
        ctx.fillStyle = '#606070';
        ctx.fillRect(tx + 8, ty, 20, 8);
        ctx.fillStyle = '#404050';
        ctx.fillRect(tx + 8, ty, 20, 1);
        ctx.fillRect(tx + 8, ty + 7, 20, 1);

        // Barrel — points from turret toward crosshair
        const pivotX = GAME.W / 2;
        const pivotY = ty + 4;
        const aimDX = p.aimX - pivotX;
        const aimDY = p.aimY - pivotY;
        const aimAng = Math.atan2(aimDY, aimDX);
        ctx.save();
        ctx.translate(pivotX, pivotY);
        ctx.rotate(aimAng);
        // Barrel rectangle
        const barrelLen = 26;
        ctx.fillStyle = '#303038';
        ctx.fillRect(0, -3, barrelLen, 6);
        ctx.fillStyle = '#505058';
        ctx.fillRect(0, -3, barrelLen, 1);
        // Cooling fins
        ctx.fillStyle = '#404048';
        for (let i = 0; i < 5; i++) {
            ctx.fillRect(4 + i * 4, -4, 1, 8);
        }
        // Muzzle
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(barrelLen - 3, -3, 3, 6);
        // Muzzle flash
        if (this.muzzleFlashT > 0) {
            const fT = this.muzzleFlashT / 4;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = fT * 0.95;
            const r = 5 + fT * 7;
            const grad = ctx.createRadialGradient(barrelLen, 0, 0, barrelLen, 0, r);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.4, '#ffd060');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(barrelLen, 0, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();

        // Heat gauge — vertical bar to the right of the turret head
        const hx = tx + 32;
        const hy = ty + 2;
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(hx, hy, 3, 10);
        const fillH = Math.round((p.heat / OVERHEAT_MAX) * 10);
        ctx.fillStyle = p.overheated ? '#ff4040' :
                        p.heat > OVERHEAT_MAX * 0.7 ? '#ffa030' : '#ffe070';
        ctx.fillRect(hx, hy + 10 - fillH, 3, fillH);
        // Steam vent when overheated
        if (p.overheated) {
            for (let i = 0; i < 3; i++) {
                const sx = tx + 16 + (Math.random() - 0.5) * 12;
                const sy = ty - ((this.t + i * 17) % 20);
                const alpha = 1 - Math.abs(sy - ty) / 20;
                ctx.save();
                ctx.globalAlpha = alpha * 0.5;
                ctx.fillStyle = '#c0c0d0';
                ctx.fillRect(sx, sy, 2, 2);
                ctx.restore();
            }
        }
    }

    _drawMonster(m) {
        const ctx = this.ctx;
        const scale = depthScale(m.t);
        const w = m.w * scale;
        const h = m.h * scale;
        const cx = depthX(m.lane, m.t);
        const baseY = depthY(m.t);
        const x = cx - w / 2;
        const y = baseY - h;
        // Death animation
        let alpha = 1, tilt = 0, dropY = 0;
        if (!m.alive && m.deathT != null) {
            const dT = Math.min(40, m.deathT) / 40;
            alpha = 1 - dT * 0.85;
            tilt = dT * 1.2;       // tips forward (toward camera)
            dropY = dT * dT * 8 * scale;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, baseY + dropY);
        ctx.rotate(tilt);
        ctx.translate(-cx, -baseY);

        // Stride drives leg bob
        const strideA = Math.sin(m._stride || 0);
        const strideB = Math.sin((m._stride || 0) + Math.PI);
        const legW = Math.max(2, 3 * scale);
        const legH = h * 0.35;
        const legY = y + h * 0.65;
        // Legs
        ctx.fillStyle = '#1a1a20';
        const leftLegX  = cx - w * 0.18 + strideA * (2 * scale);
        const rightLegX = cx + w * 0.10 + strideB * (2 * scale);
        ctx.fillRect(leftLegX,  legY, legW, legH);
        ctx.fillRect(rightLegX, legY, legW, legH);
        ctx.fillStyle = '#0a0a14';
        const footW = Math.max(3, 4 * scale);
        ctx.fillRect(leftLegX  - 1, legY + legH - 2, footW, 2);
        ctx.fillRect(rightLegX - 1, legY + legH - 2, footW, 2);

        // Arms — outstretched zombie arms reaching forward toward camera
        ctx.fillStyle = '#1a1a20';
        const armY = y + h * 0.4;
        const armW = Math.max(3, 6 * scale);
        const armH = Math.max(2, 3 * scale);
        const armBob = Math.sin(this.t * 0.12) * scale;
        // Reach down-out toward camera; both arms swing slightly
        ctx.fillRect(cx - w / 2 - armW + 2, armY + armBob, armW, armH);
        ctx.fillRect(cx + w / 2 - 2, armY - armBob, armW, armH);
        // Hands
        ctx.fillStyle = '#a0a0a8';
        const handW = Math.max(2, 2 * scale);
        ctx.fillRect(cx - w / 2 - armW, armY + armBob - 1, handW, armH + 2);
        ctx.fillRect(cx + w / 2 + armW - handW - 2, armY - armBob - 1, handW, armH + 2);

        // CRT chassis — beige plastic box
        ctx.fillStyle = '#a89c80';
        ctx.fillRect(x, y, w, h * 0.65);
        ctx.fillStyle = '#c8b898';
        ctx.fillRect(x, y, w, Math.max(1, scale));
        ctx.fillRect(x, y, Math.max(1, scale), h * 0.65);
        ctx.fillStyle = '#604838';
        ctx.fillRect(x, y + h * 0.65 - 1, w, Math.max(1, scale));
        ctx.fillRect(x + w - Math.max(1, scale), y, Math.max(1, scale), h * 0.65);

        // Screen content
        const sX = x + Math.max(1, 2 * scale);
        const sY = y + Math.max(1, 2 * scale);
        const sW = w - Math.max(2, 4 * scale);
        const sH = h * 0.45;
        ctx.fillStyle = '#1a1a20';
        ctx.fillRect(sX, sY, sW, sH);
        this._drawScreenContent(m, sX, sY, sW, sH);
        // Scanlines
        ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.sin(this.t * 0.5) * 0.05})`;
        for (let yy = sY; yy < sY + sH; yy += Math.max(2, 2 * scale | 0)) {
            ctx.fillRect(sX, yy, sW, 1);
        }
        // CRT bezel highlight (top + left thin)
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sX, sY, sW, 1);
        ctx.fillRect(sX, sY, 1, sH);
        ctx.restore();
        // Power LED (green when on)
        if ((this.t >> 4) & 1) {
            ctx.fillStyle = '#40ff60';
            ctx.fillRect(x + w - 3 * scale, y + h * 0.55, scale, scale);
        }
        // Hit flash
        if (m.hitFlash > 0 && m.hitFlash % 2 === 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, w, h * 0.65);
            ctx.restore();
        }

        // Boss extras — 2 more stacked screens above
        if (m.isBoss) {
            for (let i = 1; i <= 2; i++) {
                const offY = -22 * scale * i;
                const stackH = 18 * scale;
                ctx.fillStyle = '#a89c80';
                ctx.fillRect(x, y + offY, w, stackH);
                ctx.fillStyle = '#1a1a20';
                const ssX = x + 3 * scale;
                const ssY = y + offY + 3 * scale;
                const ssW = w - 6 * scale;
                const ssH = stackH - 6 * scale;
                ctx.fillRect(ssX, ssY, ssW, ssH);
                const ix = ((m._screenIdx || 0) + i) % SCREEN_TYPES.length;
                this._drawScreenContentByIdx(ix, ssX, ssY, ssW, ssH);
            }
        }

        // HP bar above (skip if dying)
        if (m.alive && m.hp < m.maxHp) {
            const bw = w;
            const fillW = Math.round((m.hp / m.maxHp) * bw);
            const hbY = m.isBoss ? (y - 50 * scale - 4) : (y - 4);
            ctx.fillStyle = '#2a0a14';
            ctx.fillRect(x, hbY, bw, 2);
            ctx.fillStyle = m.isBoss ? '#ff8040' : '#ff5040';
            ctx.fillRect(x, hbY, fillW, 2);
        }

        ctx.restore();
    }

    _drawScreenContent(m, x, y, w, h) {
        this._drawScreenContentByIdx(m._screenIdx ?? 0, x, y, w, h);
    }

    _drawScreenContentByIdx(idx, x, y, w, h) {
        const ctx = this.ctx;
        const type = SCREEN_TYPES[idx];
        if (w < 2 || h < 2) {
            ctx.fillStyle = '#2a4060';
            ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
            return;
        }
        if (type === 'boot') {
            ctx.fillStyle = '#000010';
            ctx.fillRect(x, y, w, h);
            const fx = x + Math.max(1, w * 0.15);
            const fy = y + Math.max(1, h * 0.2);
            const fw = Math.max(4, w * 0.5);
            const fh = Math.max(4, h * 0.5);
            ctx.fillStyle = '#ff4040'; ctx.fillRect(fx, fy, fw / 2, fh / 2);
            ctx.fillStyle = '#40ff40'; ctx.fillRect(fx + fw / 2, fy, fw / 2, fh / 2);
            ctx.fillStyle = '#4080ff'; ctx.fillRect(fx, fy + fh / 2, fw / 2, fh / 2);
            ctx.fillStyle = '#ffe040'; ctx.fillRect(fx + fw / 2, fy + fh / 2, fw / 2, fh / 2);
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < Math.floor(w / 4); i++) {
                ctx.fillRect(x + 2 + i * 3, y + h - 3, 2, 1);
            }
        } else if (type === 'bsod') {
            ctx.fillStyle = '#0040a0';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < Math.min(6, Math.floor(w / 2)); i++) {
                ctx.fillRect(x + 2 + i * 2, y + 2, 1, 2);
            }
            for (let r = 0; r < Math.floor((h - 4) / 2); r++) {
                const rowW = ((r * 7 + 3) % (w - 4));
                ctx.fillRect(x + 2, y + 5 + r * 2, Math.max(1, rowW), 1);
            }
        } else if (type === 'word') {
            ctx.fillStyle = '#000080';
            ctx.fillRect(x, y, w, 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y + 2, w, h - 2);
            ctx.fillStyle = '#404040';
            for (let r = 0; r < Math.floor((h - 4) / 2); r++) {
                const lineW = ((r * 7 + 3) % (w - 4));
                ctx.fillRect(x + 2, y + 4 + r * 2, Math.max(1, lineW), 1);
            }
            if ((this.t >> 3) & 1) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(x + 4, y + h - 4, 1, 2);
            }
        } else if (type === 'excel') {
            ctx.fillStyle = '#f0f0e8';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#006040';
            ctx.fillRect(x, y, w, 2);
            ctx.fillStyle = '#a0a0a0';
            for (let gx = 4; gx < w; gx += 4) {
                ctx.fillRect(x + gx, y + 2, 1, h - 2);
            }
            for (let gy = 2; gy < h; gy += 3) {
                ctx.fillRect(x, y + gy, w, 1);
            }
            ctx.fillStyle = '#202020';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(x + 1 + i * 4, y + 4 + (i & 1) * 3, 2, 1);
            }
        } else {
            // Static
            ctx.fillStyle = '#202020';
            ctx.fillRect(x, y, w, h);
            for (let i = 0; i < Math.min(24, w * h / 4); i++) {
                const px = x + Math.floor(Math.random() * w);
                const py = y + Math.floor(Math.random() * h);
                ctx.fillStyle = (i & 1) ? '#a0a0a0' : '#404040';
                ctx.fillRect(px, py, 1, 1);
            }
        }
    }

    _drawBullet(b) {
        const ctx = this.ctx;
        const scale = depthScale(b.t);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + scale * 0.4;
        ctx.fillStyle = '#ffa030';
        const r = 1 + scale * 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(b.x - scale, b.y - scale * 0.4, scale * 2, Math.max(1, scale));
    }

    _drawGrenades() {
        const ctx = this.ctx;
        for (const g of this.grenadeProjectiles) {
            ctx.save();
            ctx.translate(g.x, g.y);
            ctx.rotate(g.tumble || 0);
            ctx.fillStyle = '#3a4a20';
            ctx.fillRect(-3, -3, 6, 6);
            ctx.fillStyle = '#a0c060';
            ctx.fillRect(-3, -3, 6, 1);
            ctx.fillStyle = '#a0a040';
            ctx.fillRect(-1, -4, 2, 1);
            ctx.restore();
        }
    }

    _drawExplosion(e) {
        const ctx = this.ctx;
        const tAge = e.age / e.maxAge;
        const depthMul = depthScale(e.t ?? 1);
        const r = (e.small ? (2 + tAge * 3) : (4 + tAge * 16)) * depthMul;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - tAge) * 0.9;
        const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, e.color || '#ffa030');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawCrosshair() {
        const ctx = this.ctx;
        const p = this.player;
        const x = Math.round(p.aimX);
        const y = Math.round(p.aimY);
        const pulse = 0.7 + Math.sin(this.t * 0.3) * 0.3;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#ff4040';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // 4 ticks with gap in center
        ctx.moveTo(x - 8, y); ctx.lineTo(x - 3, y);
        ctx.moveTo(x + 3, y); ctx.lineTo(x + 8, y);
        ctx.moveTo(x, y - 8); ctx.lineTo(x, y - 3);
        ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 8);
        ctx.stroke();
        // Center dot
        ctx.fillStyle = '#ff4040';
        ctx.fillRect(x, y, 1, 1);
        ctx.restore();
    }

    _drawHud() {
        const ctx = this.ctx;
        const p = this.player;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(4, 4, 8 + 6 * 8, 10);
        for (let i = 0; i < p.maxHp; i++) {
            ctx.fillStyle = i < p.hp ? '#ff5040' : '#3a1a1a';
            ctx.fillRect(6 + i * 8, 6, 6, 6);
        }
        const total = WAVES.length;
        const txt = 'WAVE ' + Math.min(this.waveIdx + 1, total) + ' / ' + total;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(GAME.W - 56, 4, 54, 10);
        drawText(ctx, txt, GAME.W - 6, 6, '#ffcc80', 1, 'right');
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(GAME.W - 56, 16, 54, 10);
        drawText(ctx, String(p.score).padStart(6, '0'), GAME.W - 6, 18, '#ffe070', 1, 'right');
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(4, 16, 30, 10);
        ctx.fillStyle = '#3a4a20';
        ctx.fillRect(7, 19, 4, 4);
        drawText(ctx, 'V', 14, 18, '#a890b0', 1, 'left');
        drawText(ctx, 'x' + p.grenades, 20, 18, '#ffcc80', 1, 'left');
        if (p.overheated) {
            const blink = (this.t >> 3) & 1;
            if (blink) {
                drawTextOutlined(ctx, 'OVERHEATED', GAME.W / 2, GAME.H - 36, '#ff4040', '#1a0a14', 1, 'center');
            }
        }
    }

    _drawIntro() {
        const ctx = this.ctx;
        const dim = Math.min(1, this._introT / 30) * 0.7;
        ctx.fillStyle = `rgba(0,0,0,${dim})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        const titleY = GAME.H / 2 - 14;
        const subY = GAME.H / 2 + 4;
        const alpha = this._introT > 60 ? (90 - this._introT) / 30 :
                      this._introT < 20 ? this._introT / 20 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        drawTextOutlined(ctx, 'HOLD THE LINE', GAME.W / 2, titleY, '#ffe070', '#1a0a14', 2, 'center');
        drawText(ctx, 'AIM ARROWS   X FIRE   V GRENADE', GAME.W / 2, subY, '#c0a0d0', 1, 'center');
        ctx.restore();
    }

    _drawClear() {
        const ctx = this.ctx;
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, this.clearT * 0.015)})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        if (this.clearT > 30) {
            const fade = (this.clearT - 30) / 30;
            ctx.save();
            ctx.globalAlpha = Math.min(1, fade);
            drawTextOutlined(ctx, 'LINE HELD', GAME.W / 2, GAME.H / 2 - 8, '#ffe070', '#a82020', 2, 'center');
            drawText(ctx, 'TARGETS NEUTRALIZED: ' + this.player.kills, GAME.W / 2, GAME.H / 2 + 8, '#a890b0', 1, 'center');
            if (this.clearT > 90) {
                const blink = (this.clearT >> 3) & 1;
                if (blink) drawText(ctx, 'X TO CONTINUE', GAME.W / 2, GAME.H - 16, '#fff', 1, 'center');
            }
            ctx.restore();
        }
    }
}

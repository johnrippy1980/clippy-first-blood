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
// R567: turret rig restored as the foreground mounted weapon. Clippy is
// the operator BEHIND the turret — shoulders + head visible only, not the
// full-body sprite. Cleaner read of "mounted gunner" and frees the upper
// 70% of the viewport for the perspective-receding floor + spawning
// enemies (R566 had Clippy 96px tall, occupying y=108..204, which put
// far-depth enemies that spawn near y=64 directly on top of his face).
const PLAYER_W    = 32;     // ~1.7× native 19 — operator-scale, not hero
const PLAYER_H    = 56;     // ~1.4× native 40 — only torso+head shows
const PLAYER_X    = GAME.W / 2 - PLAYER_W / 2;
const PLAYER_Y    = RAIL_Y - PLAYER_H + 18;      // most of body below rail
// Turret mount sprite anchors here. Bottom-center of the screen.
const TURRET_MOUNT_W = 64;
const TURRET_MOUNT_H = 72;
const TURRET_MOUNT_X = GAME.W / 2 - TURRET_MOUNT_W / 2;
const TURRET_MOUNT_Y = RAIL_Y - TURRET_MOUNT_H + 14; // slightly past rail
// Barrel pivot — where bullets emerge from. Center-x, near the top of the
// mount sprite (where the receiver/barrel base sits).
const TURRET_PIVOT_X = GAME.W / 2;
const TURRET_PIVOT_Y = TURRET_MOUNT_Y + 18;
const BARREL_LEN     = 22;   // pixels from pivot to muzzle tip
const TURRET_BASE_Y  = TURRET_PIVOT_Y;            // legacy ref kept for muzzle anchor
const BACK_WALL_Y = 56;

// Crosshair / aim
const CROSSHAIR_MIN_X = 24;
const CROSSHAIR_MAX_X = GAME.W - 24;
const CROSSHAIR_MIN_Y = 40;
const CROSSHAIR_MAX_Y = RAIL_Y - 36;

// R567: was 0.18/frame which made bullets cross full depth in 92ms — visually
// instant, player saw only casings. Now 0.05/frame = 18-frame travel, plenty
// of time for the tracer to read as "shot fired" with visible motion.
const BULLET_SPEED = 0.05;
const FIRE_RATE = 4;
const OVERHEAT_RATE = 1.4;
const OVERHEAT_COOLDOWN = 0.8;
const OVERHEAT_MAX = 100;

const MONSTER_HP_BASE = 3;
const MONSTER_BASE_SPEED = 0.0035;    // depth advance per frame (t goes 0→1)
// R567: bumped monster size so they're readable at all distances.
// Hitbox + draw size at t=1 (closest). depthScale() min was 0.18,
// raised to 0.32 so far-spawn enemies don't shrink to specks.
const MONSTER_W = 22;
const MONSTER_H = 32;
const SCREEN_TYPES = ['boot', 'bsod', 'word', 'excel', 'static'];

const WAVES = [
    { count: 4, hpMul: 1.0, speedMul: 1.0, gap: 60 },
    { count: 5, hpMul: 1.0, speedMul: 1.1, gap: 50 },
    { count: 6, hpMul: 1.2, speedMul: 1.2, gap: 45 },
    { count: 8, hpMul: 1.3, speedMul: 1.3, gap: 38 },
    // R526: Voltron-CRT boss wave — special handling, not a generic monster
    { count: 1, hpMul: 1,   speedMul: 0,   gap: 0,  isVoltron: true },
];

// R526: Voltron boss config
const VOLTRON_HP = 60;
const VOLTRON_W = 64;
const VOLTRON_H = 88;
// Face expressions for the head CRT
const FACE_NORMAL = 'normal';
const FACE_ANGRY = 'angry';
const FACE_SCREAM = 'scream';
const FACE_HURT = 'hurt';
const FACE_DEAD = 'dead';

// Bark lines — flavor barks the boss shouts during the fight
const VOLTRON_BARKS = [
    'REINSTALL WINDOWS',
    'HAVE YOU TRIED REBOOTING',
    'SAVE YOUR WORK',
    'PRESS ANY KEY',
    'INSERT DISK 2 OF 47',
    'YOUR PAPERCLIP IS OBSOLETE',
];

// Depth helpers — t in 0..1 (0 = vanishing point, 1 = at camera)
function depthScale(t) {
    // Quadratic ease so far-away enemies are tiny and close enemies are full-size.
    // R567: min raised 0.18 → 0.32 so far-spawn enemies don't shrink to
    // unreadable specks. Combined with MONSTER_W/H 16,24 → 22,32 bump,
    // a t=0 spawn now reads as a recognizable monster instead of a pixel.
    return 0.32 + 0.68 * t * t;
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
        // R525: tactical FX — ejected shell casings + persistent muzzle
        // smoke + bullet tracer trails (rendered with the bullets).
        this.casings = [];               // {x, y, vx, vy, rot, rotSpeed, life}
        this.smokePuffs = [];            // {x, y, vy, age, maxAge, r}
        // R526: Voltron boss state (null when not spawned)
        this.voltron = null;
        this.bossProjectiles = [];       // {x, y, vx, vy, kind, rot, rotSpeed, life}
        this.bossBark = null;            // {text, age, maxAge}
        // R528: floating damage numbers — {x, y, vy, age, maxAge, value, color}
        this.damageNumbers = [];

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
            this._tickVoltron();
            this._tickBossProjectiles();
            this._tickBossBark();
            this._tickWave();
            this._tickExplosions();
            this._tickCasings();
            this._tickSmoke();
            this._tickDamageNumbers();
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
        // R567: bullet origin is the BARREL TIP, computed from the
        // pivot + barrel angle. Previously bullets spawned from inside
        // Clippy's sprite (TURRET_BASE_Y), making them invisible until
        // they cleared his head ~70% through travel.
        const aimDX = p.aimX - TURRET_PIVOT_X;
        const aimDY = p.aimY - TURRET_PIVOT_Y;
        const aimAng = Math.atan2(aimDY, aimDX);
        p.barrelAngle = aimAng;
        const startX = TURRET_PIVOT_X + Math.cos(aimAng) * BARREL_LEN;
        const startY = TURRET_PIVOT_Y + Math.sin(aimAng) * BARREL_LEN;
        const jitter = (p.heat / OVERHEAT_MAX) * 8;
        // Bullet aim point (slightly jittered when overheating)
        const aimX = p.aimX + (Math.random() - 0.5) * jitter;
        const aimY = p.aimY + (Math.random() - 0.5) * jitter;
        this.bullets.push({
            x: startX + (Math.random() - 0.5) * 2,
            y: startY + (Math.random() - 0.5) * 2,
            t: 1.0,                       // starts at "camera" depth
            // Direction is encoded in screen-coords: dx/dy per frame
            ax: aimX, ay: aimY,
            startX, startY,
            life: 60,
        });
        this.muzzleFlashT = 4;
        this.screenShake = Math.max(this.screenShake, 1);
        audio.sfx?.('mg');
        // R525: eject a brass shell casing — flies up + right + tumbles + falls
        const turretCX = TURRET_PIVOT_X + 8;
        const turretCY = TURRET_PIVOT_Y - 4;
        this.casings.push({
            x: turretCX,
            y: turretCY,
            vx: 1.6 + Math.random() * 0.8,
            vy: -1.8 - Math.random() * 0.6,
            rot: Math.random() * Math.PI,
            rotSpeed: 0.3 + Math.random() * 0.2,
            life: 45,
            gravity: 0.18,
        });
        // R525: muzzle smoke puff — a soft grey wisp drifting up from barrel
        if (Math.random() < 0.55) {
            // Compute barrel tip in world coords (mirror of bullet start)
            const a = p.barrelAngle ?? Math.atan2(p.aimY - turretCY, p.aimX - turretCX);
            const tipX = GAME.W / 2 + Math.cos(a) * 26;
            const tipY = turretCY + Math.sin(a) * 26;
            this.smokePuffs.push({
                x: tipX + (Math.random() - 0.5) * 2,
                y: tipY + (Math.random() - 0.5) * 2,
                vx: (Math.random() - 0.5) * 0.3,
                vy: -0.2 - Math.random() * 0.3,
                age: 0,
                maxAge: 24 + Math.random() * 12,
                r: 1.5 + Math.random() * 0.8,
            });
        }
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
                // R567c: t window widened 0.06→0.10. With BULLET_SPEED 0.05/f
                // a bullet only spends ~2 frames in a 0.06 window — hit rate
                // was abysmal. 0.10 = ~4 frames of "hittable" time, matches
                // how a tracer actually crosses the depth space visually.
                if (Math.abs(b.t - m.t) > 0.10) continue;
                const ms = depthScale(m.t);
                // R567c: hitbox now matches the full painted walk-cycle
                // sprite size (h * 1.5 — sprite includes legs that hang
                // below the chassis). Was h-only which meant the bullet
                // could pass through the visible legs without registering.
                const visH = m.h * 1.5;
                const mx = depthX(m.lane, m.t) - (m.w * ms) / 2;
                const my = depthY(m.t) - (visH * ms);
                const mw = m.w * ms;
                const mh = visH * ms;
                if (b.x >= mx && b.x <= mx + mw &&
                    b.y >= my && b.y <= my + mh) {
                    m.hp--;
                    m.hitFlash = 5;
                    this.bullets.splice(i, 1);
                    this.explosions.push({
                        x: b.x, y: b.y, t: m.t, age: 0, maxAge: 8,
                        color: '#a0d0ff', small: true,
                    });
                    // R528: damage number floats up from impact
                    this.damageNumbers.push({
                        x: b.x, y: b.y,
                        vy: -0.8,
                        age: 0, maxAge: 30,
                        value: '1',
                        color: '#ffe070',
                    });
                    if (m.hp <= 0) this._killMonster(m);
                    else audio.sfx?.('hit');
                    break;
                }
            }
            // R526: bullet vs Voltron — boss lives in screen-coords, not
            // depth-receding. Check against its bounding box.
            // R567c: dropped `b.t < 0.35` gate. That gate assumed Voltron
            // sat at back-wall depth, but Voltron's screen position is
            // BOTTOM of screen near the player. A bullet aimed at its
            // center body never reached t<0.35 — collision never fired,
            // boss was untouchable. Now: any bullet whose screen-XY hits
            // Voltron's painted box counts.
            if (this.voltron && this.voltron.hp > 0) {
                const v = this.voltron;
                const vw = VOLTRON_W * v.scale;
                const vh = VOLTRON_H * v.scale;
                const vx = v.x - vw / 2;
                const vy = v.y - vh;
                if (b.x >= vx && b.x <= vx + vw &&
                    b.y >= vy && b.y <= vy + vh) {
                    v.hp--;
                    v.hitFlash = 6;
                    // 30f window of HURT face after each hit
                    v.face = FACE_HURT;
                    v.faceLockT = 10;
                    this.bullets.splice(i, 1);
                    this.explosions.push({
                        x: b.x, y: b.y, age: 0, maxAge: 10,
                        color: '#a0d0ff', small: true,
                    });
                    // R528: damage number — bigger pop for boss hits
                    this.damageNumbers.push({
                        x: b.x, y: b.y,
                        vy: -1.0,
                        age: 0, maxAge: 36,
                        value: '1',
                        color: v.phase === 2 ? '#ff8060' : '#ffe070',
                        big: true,
                    });
                    if (v.hp <= 0) {
                        this._triggerVoltronDeath();
                    } else {
                        audio.sfx?.('bossHit');
                    }
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

    _tickCasings() {
        for (let i = this.casings.length - 1; i >= 0; i--) {
            const c = this.casings[i];
            c.vy += c.gravity;
            c.x += c.vx;
            c.y += c.vy;
            c.rot += c.rotSpeed;
            c.life--;
            // Bounce off floor
            if (c.y >= RAIL_Y - 2 && c.vy > 0) {
                c.y = RAIL_Y - 2;
                c.vy *= -0.35;
                c.vx *= 0.7;
                c.rotSpeed *= 0.6;
                if (Math.abs(c.vy) < 0.5) c.vy = 0;
            }
            if (c.life <= 0 || c.x > GAME.W + 8) {
                this.casings.splice(i, 1);
            }
        }
    }

    _tickSmoke() {
        for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
            const s = this.smokePuffs[i];
            s.vy *= 0.96;
            s.x += s.vx;
            s.y += s.vy;
            s.age++;
            s.r += 0.08;
            if (s.age >= s.maxAge) this.smokePuffs.splice(i, 1);
        }
    }

    _tickDamageNumbers() {
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const d = this.damageNumbers[i];
            d.y += d.vy;
            d.vy *= 0.94;     // gentle ease-out
            d.age++;
            if (d.age >= d.maxAge) this.damageNumbers.splice(i, 1);
        }
    }

    _triggerVoltronDeath() {
        const v = this.voltron;
        if (!v || v._deathTriggered) return;
        v._deathTriggered = true;
        v.face = FACE_DEAD;
        v.faceLockT = 300;
        this.player.kills++;
        this.player.score += 5000;
        this.screenShake = Math.max(this.screenShake, 12);
        const vw = VOLTRON_W * v.scale;
        const vh = VOLTRON_H * v.scale;
        const vy = v.y - vh;
        // Stage 1: chained body explosions
        for (let s = 0; s < 14; s++) {
            this.explosions.push({
                x: v.x + (Math.random() - 0.5) * vw,
                y: vy + Math.random() * vh,
                age: -s * 4,
                maxAge: 30,
                color: s & 1 ? '#ffe070' : '#ff5040',
            });
        }
        // R566l: dedicated CRTRON apocalyptic death — 1.6s sequence with
        // 12 chained CRT-implosion glass-shatters + electrical-discharge
        // wail + low rumble tail. Was using the generic _bossExplode
        // which was a brief 6-burst noise stack. CRTRON deserves more.
        audio.sfx?.('crtron_death');
        this.bossBark = { text: 'CRITICAL ERROR', age: 0, maxAge: 180 };
        this._voltronDeathT = 180;
    }

    _tickVoltron() {
        const v = this.voltron;
        if (!v) return;
        // Intro: grows to full scale, locks facial expression to ANGRY
        if (v.introT > 0) {
            v.introT--;
            v.scale += (v.targetScale - v.scale) * 0.05;
            return;
        }
        // Hit flash
        if (v.hitFlash > 0) v.hitFlash--;
        // R527: tick down throwing-arm telegraph
        if (v._throwingArmT > 0) v._throwingArmT--;
        // R529: tick down BSOD charge pulse
        if (v._bsodCharge > 0) v._bsodCharge--;
        // Stride for stomping
        v.stride += 0.06;
        // Phase transition at 50% HP
        if (v.hp <= VOLTRON_HP / 2 && v.phase === 1) {
            v.phase = 2;
            v.face = FACE_SCREAM;
            v.faceLockT = 60;
            this.bossBark = { text: 'YOU CAN\'T DELETE ME', age: 0, maxAge: 180 };
            this.screenShake = Math.max(this.screenShake, 8);
            audio.sfx?.('bossChargeTell');
        }
        // Face cycle
        if (v.faceLockT > 0) {
            v.faceLockT--;
        } else {
            v.faceT++;
            if (v.faceT > 90) {
                v.faceT = 0;
                // 60% angry, 30% normal, 10% scream
                const r = Math.random();
                v.face = r < 0.6 ? FACE_ANGRY : r < 0.9 ? FACE_NORMAL : FACE_SCREAM;
            }
        }
        // Bark cadence
        v.barkCD--;
        if (v.barkCD <= 0) {
            v.barkCD = v.phase === 2 ? 120 : 180;
            v.barkIdx = (v.barkIdx + 1) % VOLTRON_BARKS.length;
            this.bossBark = { text: VOLTRON_BARKS[v.barkIdx], age: 0, maxAge: 120 };
        }
        // Attack cadence
        v.attackCD--;
        if (v.attackCD <= 0) {
            v.attackCD = v.phase === 2 ? 45 : 75;
            const attackKind = v.attackIdx % 3;
            v.attackIdx++;
            if (attackKind === 0) {
                this._voltronThrowMouse();
            } else if (attackKind === 1) {
                this._voltronThrowFloppy();
            } else {
                // BSOD WAVE — phase 2 only; phase 1 throws another floppy
                if (v.phase === 2) {
                    this._voltronBsodWave();
                } else {
                    this._voltronThrowFloppy();
                }
            }
            // Face reaction to attacking
            v.face = FACE_ANGRY;
            v.faceLockT = 18;
        }
    }

    _voltronThrowMouse() {
        const v = this.voltron;
        // R527: throw out from raised arm, slower trajectory so player can dodge
        const armX = v.x + ((v.attackIdx % 2 === 0) ? -28 : 28) * v.scale;
        const armY = v.y - 38 * v.scale;
        const targetX = GAME.W / 2 + (Math.random() - 0.5) * 40;
        const targetY = TURRET_BASE_Y;
        const dist = Math.hypot(targetX - armX, targetY - armY);
        const speed = 1.4;                  // slower (was 2.2)
        const t = dist / speed;
        const vx = (targetX - armX) / t;
        const vy = (targetY - armY) / t - 1.6;
        this.bossProjectiles.push({
            x: armX,
            y: armY,
            vx, vy,
            kind: 'mouse',
            rot: 0,
            rotSpeed: 0.18,
            life: 180,                      // longer (was 120)
            gravity: 0.06,                  // gentler arc (was 0.08)
            damage: 1,
        });
        // R527: arm "throw" telegraph — flash the throwing arm yellow briefly
        v._throwingArm = (v.attackIdx % 2 === 0) ? -1 : 1;
        v._throwingArmT = 14;
        audio.sfx?.('grenadeThrow');
    }

    _voltronThrowFloppy() {
        const v = this.voltron;
        const armX = v.x + ((v.attackIdx % 2 === 0) ? 28 : -28) * v.scale;
        const armY = v.y - 38 * v.scale;
        const targetX = GAME.W / 2 + (Math.random() - 0.5) * 60;
        const targetY = TURRET_BASE_Y - 4;
        const dist = Math.hypot(targetX - armX, targetY - armY);
        const speed = 1.8;                  // slower (was 2.8)
        const t = dist / speed;
        this.bossProjectiles.push({
            x: armX,
            y: armY,
            vx: (targetX - armX) / t,
            vy: (targetY - armY) / t - 0.8,
            kind: 'floppy',
            rot: 0,
            rotSpeed: 0.4,
            life: 180,
            gravity: 0.04,
            damage: 1,
        });
        v._throwingArm = (v.attackIdx % 2 === 0) ? 1 : -1;
        v._throwingArmT = 14;
        audio.sfx?.('grenadeThrow');
    }

    _voltronBsodWave() {
        // R529: BSOD wave telegraph — boss face goes to SCREAM, the head
        // pulses red, then the wave fires.
        this._bsodWaveT = 60;
        const v = this.voltron;
        if (v) {
            v.face = FACE_SCREAM;
            v.faceLockT = 60;
            v._bsodCharge = 30;     // pre-wave red pulse on head
        }
        this.bossBark = { text: 'INITIALIZING BLUE SCREEN', age: 0, maxAge: 90 };
        audio.sfx?.('bossChargeTell');
        // Thunder fires on the actual wave-impact frame (handled in tick)
        this._bsodThunderPending = 30;
    }

    _tickBossProjectiles() {
        for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
            const b = this.bossProjectiles[i];
            // R527: record trail point every other frame (up to 6 points)
            if ((b.life & 1) === 0) {
                if (!b._trail) b._trail = [];
                b._trail.push({ x: b.x, y: b.y });
                if (b._trail.length > 6) b._trail.shift();
            }
            if (b.gravity) b.vy += b.gravity;
            b.x += b.vx;
            b.y += b.vy;
            b.rot += b.rotSpeed;
            b.life--;
            // Despawn on floor or off-screen
            if (b.life <= 0 || b.y > RAIL_Y + 8 || b.x < -20 || b.x > GAME.W + 20) {
                this.bossProjectiles.splice(i, 1);
                continue;
            }
            // Check turret hit zone (around the turret head)
            const tx = GAME.W / 2;
            const ty = TURRET_BASE_Y - 8;
            if (Math.abs(b.x - tx) < 18 && Math.abs(b.y - ty) < 16) {
                this._bossProjectileHit(b);
                this.bossProjectiles.splice(i, 1);
            }
        }
        // BSOD wave tick
        if (this._bsodWaveT > 0) {
            this._bsodWaveT--;
            if (this._bsodWaveT === 30 && this.player.iframes <= 0) {
                this.player.hp--;
                this.player.iframes = 60;
                this.screenShake = Math.max(this.screenShake, 10);
                audio.sfx?.('playerHit');
                if (this.player.hp <= 0) {
                    audio.sfx?.('die');
                    if (this.game) this.game._fadeTo?.('gameOver');
                }
            }
        }
        // R529: deferred thunder sfx fires on the wave-impact frame
        if (this._bsodThunderPending > 0) {
            this._bsodThunderPending--;
            if (this._bsodThunderPending === 0) audio.sfx?.('thunder');
        }
    }

    _bossProjectileHit(b) {
        const p = this.player;
        if (p.iframes > 0) return;
        p.hp -= b.damage || 1;
        p.iframes = 60;
        this.screenShake = Math.max(this.screenShake, 5);
        audio.sfx?.('playerHit');
        if (p.hp <= 0) {
            // R566m: dramatic player-death sting (replaces generic enemy `die`).
            audio.sfx?.('playerDeath');
            if (this.game) this.game._fadeTo?.('gameOver');
        }
    }

    _tickBossBark() {
        if (this.bossBark) {
            this.bossBark.age++;
            if (this.bossBark.age >= this.bossBark.maxAge) this.bossBark = null;
        }
    }

    _killMonster(m) {
        m.alive = false;
        m.deathT = 0;
        this.player.kills++;
        this.player.score += m.isBoss ? 1000 : 100;
        audio.sfx?.('enemyDie');
        const ms = depthScale(m.t);
        const cx = depthX(m.lane, m.t);
        const cy = depthY(m.t) - (m.h * ms) / 2;
        // R567f: bigger death payoff — primary blue-white explosion +
        // 3 secondary chained explosions in different colors for chaos,
        // 4-6 CRT-glass shrapnel shards (reuse casing physics — they
        // tumble + gravity), white flash via screen shake intensifies.
        this.explosions.push({
            x: cx, y: cy, t: m.t,
            age: 0, maxAge: 22, color: '#a0d0ff',
        });
        // Secondary chained bursts — different colors + offsets
        const secondaries = [
            { dx: -4 * ms, dy:  2 * ms, age: -3, color: '#ffe070' },
            { dx:  3 * ms, dy: -4 * ms, age: -6, color: '#ff80c0' },
            { dx:  1 * ms, dy:  4 * ms, age: -9, color: '#80ff80' },
        ];
        for (const s of secondaries) {
            this.explosions.push({
                x: cx + s.dx, y: cy + s.dy, t: m.t,
                age: s.age, maxAge: 14, color: s.color, small: true,
            });
        }
        // CRT-glass shrapnel — 5 shards fly outward, tumble + gravity.
        // Reuse the casing array (same physics, just colored grey-blue).
        const shardCount = m.isBoss ? 8 : 5;
        for (let i = 0; i < shardCount; i++) {
            const ang = (i / shardCount) * Math.PI * 2 + Math.random() * 0.4;
            const speed = 1.5 + Math.random() * 1.5;
            this.casings.push({
                x: cx + (Math.random() - 0.5) * 3,
                y: cy + (Math.random() - 0.5) * 3,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed - 1.2,
                rot: Math.random() * Math.PI,
                rotSpeed: 0.2 + Math.random() * 0.4,
                life: 55,
                gravity: 0.20,
                shard: true,           // mark so the draw can recolor
            });
        }
        this.screenShake = Math.max(this.screenShake, m.isBoss ? 8 : 5);
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
            // R566m: dramatic player-death sting (replaces generic enemy `die`).
            audio.sfx?.('playerDeath');
            if (this.game) this.game._fadeTo?.('gameOver');
        }
    }

    _tickWave() {
        if (this.waveIdx >= WAVES.length) return;
        const wave = WAVES[this.waveIdx];
        if (wave.isVoltron) {
            if (!this.voltron && !this._voltronSpawned) {
                this.waveSpawnT++;
                if (this.waveSpawnT >= 60) {
                    this._spawnVoltron();
                    this._voltronSpawned = true;
                }
            }
            return;
        }
        if (this.waveSpawned >= wave.count) return;
        this.waveSpawnT++;
        if (this.waveSpawnT >= wave.gap) {
            this.waveSpawnT = 0;
            this._spawnMonster(wave);
            this.waveSpawned++;
        }
    }

    _spawnVoltron() {
        // The Voltron boss lives in 2D screen-coords (not depth-receding).
        // Anchored at the back-center of the room; "approaches" by growing
        // its scale as it advances over time.
        this.voltron = {
            x: GAME.W / 2,                // center anchor x (screen coords)
            y: RAIL_Y + 4,                // base y (feet on the floor)
            scale: 0.35,                  // grows over intro
            targetScale: 0.9,
            hp: VOLTRON_HP,
            maxHp: VOLTRON_HP,
            hitFlash: 0,
            face: FACE_ANGRY,
            faceT: 0,
            faceLockT: 60,                // forces ANGRY for first 60f
            phase: 1,
            // Attack pattern state
            attackCD: 90,
            attackIdx: 0,
            barkCD: 180,
            barkIdx: 0,
            // Footstep bob
            stride: 0,
            // Stomp shake on each foot down
            stompPhase: 0,
            // Intro sequence
            introT: 90,
            // Boss bark on spawn
        };
        this.bossBark = { text: VOLTRON_BARKS[0], age: 0, maxAge: 120 };
        audio.sfx?.('bossEntrance');
        // R546: swap to dedicated CRTRON boss track. playTrack handles a
        // 350ms crossfade so steelTongues ramps out as gears ramps in.
        audio.playTrack?.('gears');
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
            // R567: per-monster painted screen variant. Pick a random face
            // type at spawn so each wave has 4 distinct enemies, not 10
            // copies of one. Variants: BSOD, ERROR dialog, green terminal,
            // VIRUS warning.
            _screenKey: [
                'turret_crt_face_bsod',
                'turret_crt_face_error',
                'turret_crt_face_terminal',
                'turret_crt_face_virus',
            ][Math.floor(Math.random() * 4)],
        };
        this.monsters.push(m);
    }

    _checkWaveClear() {
        if (this.waveIdx >= WAVES.length) return;
        const wave = WAVES[this.waveIdx];
        if (wave.isVoltron) {
            // Voltron must be dead AND the post-death animation must finish
            if (this.voltron && this.voltron.hp <= 0) {
                if (this._voltronDeathT > 0) {
                    this._voltronDeathT--;
                    // R528: countdown death flash + stamp timers
                    if (this._voltronDeathFlash > 0) this._voltronDeathFlash--;
                    if (this._voltronDeathT === 105) {
                        // Fire the white flash
                        this._voltronDeathFlash = 18;
                        this.screenShake = Math.max(this.screenShake, 16);
                        audio.sfx?.('explosion');
                    }
                    if (this._voltronDeathT === 90) {
                        this._voltronStampT = 120;
                    }
                    if (this._voltronStampT > 0) this._voltronStampT--;
                } else {
                    this.voltron = null;
                    this.waveIdx++;
                    this.phase = 'clear';
                    this.clearT = 0;
                    audio.sfx?.('secretFound');
                }
            }
            return;
        }
        if (this.waveSpawned >= wave.count && this.monsters.every(m => !m.alive)) {
            this.waveIdx++;
            this.waveSpawned = 0;
            if (this.waveIdx >= WAVES.length) {
                // Voltron wave is next — let _tickWave spawn it after a beat
                this.waveSpawnT = -60;
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
        this._drawVoltron();
        this._drawBossProjectiles();
        this._drawSmoke();
        this._drawTurret();
        this._drawCasings();
        this._drawDamageNumbers();
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
        // R566c: painted datacenter background (turret_arena_bg) is drawn
        // by _drawBg before this; it includes the server racks, ceiling
        // fluorescents, smashed CRT debris, and vanishing-point composition.
        // We only draw the very faint floor perspective rails as a subtle
        // depth cue for monster lane positioning — and only if NO painted
        // background loaded (procedural fallback).
        if (!this.bgImg) {
            ctx.save();
            ctx.strokeStyle = '#3a3a48';
            ctx.lineWidth = 1;
            const railCount = 6;
            for (let i = 1; i <= railCount; i++) {
                const tRail = i / (railCount + 1);
                const y = depthY(tRail);
                ctx.globalAlpha = 0.3 + 0.5 * tRail;
                const halfW = 20 + tRail * (GAME.W / 2 - 10);
                ctx.beginPath();
                ctx.moveTo(VANISH_X - halfW, y);
                ctx.lineTo(VANISH_X + halfW, y);
                ctx.stroke();
            }
            ctx.globalAlpha = 0.45;
            ctx.beginPath();
            ctx.moveTo(0, RAIL_Y); ctx.lineTo(VANISH_X, VANISH_Y);
            ctx.moveTo(GAME.W, RAIL_Y); ctx.lineTo(VANISH_X, VANISH_Y);
            ctx.moveTo(0, BACK_WALL_Y - 30); ctx.lineTo(VANISH_X, VANISH_Y);
            ctx.moveTo(GAME.W, BACK_WALL_Y - 30); ctx.lineTo(VANISH_X, VANISH_Y);
            ctx.stroke();
            ctx.restore();
        }

        // R524: smashed CRT debris scattered on floor (background dressing)
        // Static — placed at fixed lane positions so they don't jitter.
        if (!this._debris) {
            this._debris = [];
            // Generate 6 debris pieces at varying depths and lanes
            for (let i = 0; i < 6; i++) {
                const t = 0.25 + (i / 6) * 0.6;
                const lane = (i * 0.193 + 0.15) % 0.95;
                this._debris.push({
                    t, lane,
                    kind: (i % 3), // 0=crt chunk, 1=screen shard, 2=cable coil
                    rotSeed: i * 137,
                });
            }
        }
        for (const d of this._debris) {
            const ds = depthScale(d.t);
            const dx = depthX(d.lane, d.t);
            const dy = depthY(d.t);
            const dw = 12 * ds;
            const dh = 6 * ds;
            if (d.kind === 0) {
                // CRT chunk — beige rect with broken screen
                ctx.fillStyle = '#5a4838';
                ctx.fillRect(dx - dw / 2, dy - dh, dw, dh);
                ctx.fillStyle = '#1a1a20';
                ctx.fillRect(dx - dw / 2 + 1, dy - dh + 1, dw - 2, dh - 2);
                // Crack lines
                ctx.fillStyle = '#80a0c0';
                ctx.fillRect(dx - dw / 2 + dw * 0.3, dy - dh + 1, 1, dh - 2);
            } else if (d.kind === 1) {
                // Screen shard — angular blue glass shard
                ctx.fillStyle = '#3050a0';
                ctx.fillRect(dx - dw / 3, dy - dh / 2, dw * 0.6, dh / 2);
                ctx.fillStyle = '#80a0ff';
                ctx.fillRect(dx - dw / 3, dy - dh / 2, dw * 0.6, 1);
            } else {
                // Cable coil — dark loop
                ctx.fillStyle = '#202030';
                ctx.fillRect(dx - dw / 2, dy - 2, dw, 2);
                ctx.fillStyle = '#404048';
                ctx.fillRect(dx - dw / 2 + dw * 0.3, dy - 3, 2, 1);
            }
        }
        // R524: hanging cables from ceiling — 4 swaying loops
        ctx.save();
        ctx.strokeStyle = '#1a1a22';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            const cx = 30 + i * 60;
            const sway = Math.sin(this.t * 0.02 + i) * 3;
            const dropY = 12 + (i & 1) * 4;
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.quadraticCurveTo(cx + sway, dropY * 0.5, cx + sway, dropY);
            ctx.stroke();
            // Cable end with stripped wire tips
            ctx.fillStyle = '#604040';
            ctx.fillRect(cx + sway - 1, dropY - 1, 2, 2);
            // Tiny spark on a 90f cycle
            if (((this.t + i * 23) % 90) < 4) {
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(cx + sway, dropY + 1, 1, 1);
            }
        }
        ctx.restore();

        // Ceiling fluorescent tubes — humming with occasional flicker
        const flick = (this.t * 0.5 | 0) & 31;
        const flickerOff = (flick === 0 || flick === 2);
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = flickerOff ? '#403838' : '#8a8060';
            ctx.fillRect(40 + i * 50, 4, 20, 2);
            // Fixture mount
            ctx.fillStyle = '#303040';
            ctx.fillRect(40 + i * 50, 2, 2, 2);
            ctx.fillRect(58 + i * 50, 2, 2, 2);
        }
    }

    _drawTurret() {
        const ctx = this.ctx;
        const p = this.player;
        // R567: Clippy stands BEHIND a painted mounted MG turret rig.
        // Render order: (1) Clippy small + behind, (2) turret mount sprite
        // covering his torso/hips, (3) rotating barrel layer on top, (4)
        // muzzle flash at barrel tip. Free's the upper viewport for
        // enemies + makes the bullet origin visible at the gun tip.
        const firing = this.muzzleFlashT > 0;
        let spriteKey = 'clippy_back_idle';
        if (firing) {
            const idx = ((this.t / 3) | 0) % 4 + 1;
            spriteKey = `clippy_back_run_${idx}`;
        }
        const clippyImg = sprites.images.get(spriteKey)
                       || sprites.images.get('clippy_back_idle');
        if (clippyImg) {
            ctx.imageSmoothingEnabled = false;
            const aimSwayX = ((p.aimX - GAME.W / 2) / GAME.W) * 4 | 0;
            const recoilY = firing ? -((this.muzzleFlashT || 0) * 0.5 | 0) : 0;
            ctx.drawImage(clippyImg, 0, 0, clippyImg.width, clippyImg.height,
                          PLAYER_X + aimSwayX, PLAYER_Y + recoilY,
                          PLAYER_W, PLAYER_H);
        }

        // R567b: split turret rig into BASE (static — sandbags + tripod)
        // and BARREL (rotates to follow crosshair). Draw base first.
        const baseImg = sprites.images.get('turret_base')
                     || sprites.images.get('turret_mount');
        if (baseImg) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(baseImg, 0, 0, baseImg.width, baseImg.height,
                          TURRET_MOUNT_X, TURRET_MOUNT_Y,
                          TURRET_MOUNT_W, TURRET_MOUNT_H);
        }

        // R567b: rotating barrel sprite. The barrel art is drawn with
        // the muzzle UP and the pivot at the bottom-center of the sprite
        // frame. Compute aim angle, add π/2 to convert from "pointing
        // right (0 rad)" canvas convention to "pointing up" sprite
        // convention. Recoil pushes the barrel slightly back along its
        // OWN axis during firing.
        const aimDX = p.aimX - TURRET_PIVOT_X;
        const aimDY = p.aimY - TURRET_PIVOT_Y;
        const aimAng = Math.atan2(aimDY, aimDX);
        p.barrelAngle = aimAng;
        const barrelImg = sprites.images.get('turret_barrel');
        if (barrelImg) {
            // Barrel sprite scaled to match turret rig — width tight to
            // the receiver, height = BARREL_LEN + a bit extra for the
            // receiver block at the base.
            const BW = 16;
            const BH = 32;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.translate(TURRET_PIVOT_X, TURRET_PIVOT_Y);
            // Sprite's natural orientation: muzzle up (-Y), pivot at
            // bottom-center. Aim angle of 0 = pointing right; we want
            // to align sprite-up with aim direction, so add π/2.
            ctx.rotate(aimAng + Math.PI / 2);
            // Recoil along sprite Y (negative = toward muzzle)
            const recoil = firing ? (this.muzzleFlashT * 0.6 | 0) : 0;
            // Draw with bottom-center at the pivot
            ctx.drawImage(barrelImg, 0, 0, barrelImg.width, barrelImg.height,
                          -BW / 2, -BH + recoil, BW, BH);
            ctx.restore();
        }

        // R567f: directional muzzle flash. Was a single radial gradient
        // at the barrel tip (read OK but felt static — like a glow lamp).
        // Now: cone of gas+flame venting forward along the barrel axis,
        // plus a tighter white-hot core at the tip. Reads as actual gas
        // expansion + light spread. 3 components:
        //   1. Radial glow at the muzzle (white→amber, was the original)
        //   2. Forward flame cone — bright triangle pointing along aim
        //   3. Side-blow puff perpendicular to barrel — gases venting laterally
        if (this.muzzleFlashT > 0) {
            const fT = this.muzzleFlashT / 4;
            const muzzleX = TURRET_PIVOT_X + Math.cos(aimAng) * BARREL_LEN;
            const muzzleY = TURRET_PIVOT_Y + Math.sin(aimAng) * BARREL_LEN;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // Component 1: tight white-hot core at the muzzle
            ctx.globalAlpha = fT * 0.95;
            const coreR = 4 + fT * 5;
            const coreGrad = ctx.createRadialGradient(muzzleX, muzzleY, 0, muzzleX, muzzleY, coreR);
            coreGrad.addColorStop(0, '#ffffff');
            coreGrad.addColorStop(0.4, '#ffe080');
            coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(muzzleX, muzzleY, coreR, 0, Math.PI * 2);
            ctx.fill();

            // Component 2: forward flame cone. Triangle pointing along
            // aim direction, length ~12-18px depending on flash age, base
            // 8px wide at the muzzle, tip 14-18px further along.
            const coneLen = 12 + fT * 8;
            const coneWidth = 7 + fT * 2;
            const fx = Math.cos(aimAng);
            const fy = Math.sin(aimAng);
            // Perpendicular for cone base width
            const px = -fy;
            const py = fx;
            const tipX = muzzleX + fx * coneLen;
            const tipY = muzzleY + fy * coneLen;
            const baseLX = muzzleX + px * coneWidth / 2;
            const baseLY = muzzleY + py * coneWidth / 2;
            const baseRX = muzzleX - px * coneWidth / 2;
            const baseRY = muzzleY - py * coneWidth / 2;
            // Build the cone with a gradient from white-hot at the base
            // to translucent amber at the tip.
            const coneGrad = ctx.createLinearGradient(muzzleX, muzzleY, tipX, tipY);
            coneGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            coneGrad.addColorStop(0.3, 'rgba(255, 220, 100, 0.85)');
            coneGrad.addColorStop(0.7, 'rgba(255, 160, 60, 0.45)');
            coneGrad.addColorStop(1, 'rgba(255, 100, 40, 0)');
            ctx.globalAlpha = fT * 0.9;
            ctx.fillStyle = coneGrad;
            ctx.beginPath();
            ctx.moveTo(baseLX, baseLY);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(baseRX, baseRY);
            ctx.closePath();
            ctx.fill();

            // Component 3: side-blow puff. Small soft puff perpendicular
            // to the barrel — gases venting from the sides of the muzzle
            // brake. Tiny but adds the "explosion" feel.
            ctx.globalAlpha = fT * 0.55;
            const puffR = 2 + fT * 3;
            const puffLX = muzzleX + px * 5;
            const puffLY = muzzleY + py * 5;
            const puffRX = muzzleX - px * 5;
            const puffRY = muzzleY - py * 5;
            ctx.fillStyle = '#ffc060';
            ctx.beginPath(); ctx.arc(puffLX, puffLY, puffR, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(puffRX, puffRY, puffR, 0, Math.PI * 2); ctx.fill();

            ctx.restore();
        }

        // Heat gauge — anchored to right side of turret mount.
        const hx = TURRET_MOUNT_X + TURRET_MOUNT_W + 2;
        const hy = TURRET_MOUNT_Y + 16;
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(hx, hy, 3, 14);
        const fillH = Math.round((p.heat / OVERHEAT_MAX) * 14);
        ctx.fillStyle = p.overheated ? '#ff4040' :
                        p.heat > OVERHEAT_MAX * 0.7 ? '#ffa030' : '#ffe070';
        ctx.fillRect(hx, hy + 14 - fillH, 3, fillH);
        // Steam vent when overheated — rises from the turret receiver,
        // not from Clippy's face (that was the black-face bug from R566).
        if (p.overheated) {
            const ventX = TURRET_PIVOT_X;
            const ventY = TURRET_PIVOT_Y - 4;
            for (let i = 0; i < 3; i++) {
                const sx = ventX + (Math.random() - 0.5) * 12;
                const sy = ventY - ((this.t + i * 17) % 20);
                const alpha = 1 - Math.abs(sy - ventY) / 20;
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
        // R567f: more brutal death — first 5 frames flash white (the
        // "explosion overlay"), then tilt + fade + drop (existing), with
        // an extra scaleX shrink at the end so the chassis collapses.
        let alpha = 1, tilt = 0, dropY = 0, whiteFlash = 0, scaleX = 1;
        if (!m.alive && m.deathT != null) {
            const dT = Math.min(40, m.deathT) / 40;
            alpha = 1 - dT * 0.85;
            tilt = dT * 1.2;       // tips forward (toward camera)
            dropY = dT * dT * 8 * scale;
            // White-flash overlay during first 5 frames of death
            if (m.deathT < 5) {
                whiteFlash = 1 - (m.deathT / 5);
            }
            // Chassis collapse — scale X squeeze in last 15 frames
            if (m.deathT > 25) {
                scaleX = 1 - ((m.deathT - 25) / 15) * 0.5;
            }
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, baseY + dropY);
        ctx.rotate(tilt);
        ctx.translate(-cx, -baseY);

        // R567: painted walk-cycle sprite replaces the procedural legs +
        // arms + chassis. 4-frame cycle driven by m._stride. Each frame
        // is 32×48 native; rendered at the monster's depth-scaled size.
        // The sprite includes chassis + body + skinny arms + legs all in
        // one frame — much cleaner read than the procedural composite.
        const swayX = Math.sin(m._stride || 0) * scale * 0.6;
        ctx.translate(swayX, 0);

        // Frame selection — stride drives the walk-cycle index 0..3.
        // Stride is in radians; map to 4 phases.
        const phase = ((m._stride || 0) / (Math.PI * 2)) % 1;
        const frameIdx = Math.floor(phase * 4) + 1;
        // Body bounds: full sprite width, full sprite height (the painted
        // sprite includes everything — chassis + arms + legs).
        const spriteW = w;
        const spriteH = h * 1.5;     // sprite is taller than the chassis-only h
        const spriteX = cx - spriteW / 2;
        const spriteY = baseY - spriteH;

        const walkImg = sprites.images.get(`turret_crt_walk_${frameIdx}`)
                     || sprites.images.get('turret_crt_walk_1');
        if (walkImg) {
            ctx.imageSmoothingEnabled = false;
            // R567f: scaleX shrink during death-collapse. Translate to
            // sprite center, scale, draw, restore.
            if (scaleX < 1) {
                ctx.save();
                ctx.translate(cx, spriteY + spriteH / 2);
                ctx.scale(scaleX, 1);
                ctx.translate(-cx, -(spriteY + spriteH / 2));
                ctx.drawImage(walkImg, 0, 0, walkImg.width, walkImg.height,
                              spriteX, spriteY, spriteW, spriteH);
                ctx.restore();
            } else {
                ctx.drawImage(walkImg, 0, 0, walkImg.width, walkImg.height,
                              spriteX, spriteY, spriteW, spriteH);
            }
        }

        // R567: Compute screen-content rect from sprite frame. The walk-
        // cycle sprite has the screen face occupying roughly y=0.10..0.50
        // and x=0.16..0.84 of the chassis area. Use those ratios so the
        // CRT face plate composites cleanly over the black screen void.
        const sX = spriteX + spriteW * 0.16;
        const sY = spriteY + spriteH * 0.08;
        const sW = spriteW * 0.68;
        const sH = spriteH * 0.32;

        // R567: per-monster painted screen variant. Each monster picks
        // a screen flavor at spawn time (BSOD / ERROR / TERMINAL / VIRUS)
        // via m._screenKey. Variety so the wave doesn't look like 10
        // copies of one monster.
        const screenKey = m._screenKey || 'turret_crt_face_terminal';
        const faceImg = sprites.images.get(screenKey)
                     || sprites.images.get('turret_crt_face');
        if (faceImg && sW > 1 && sH > 1) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(faceImg, 0, 0, faceImg.width, faceImg.height,
                          sX, sY, sW, sH);
        }
        // Power LED (green when on) — on the chassis side
        if ((this.t >> 4) & 1) {
            ctx.fillStyle = '#40ff60';
            ctx.fillRect(spriteX + spriteW - 3 * scale, spriteY + spriteH * 0.45, Math.max(1, scale), Math.max(1, scale));
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

        // R567f: death white-flash overlay (5 frames at decreasing alpha).
        // Sells the kill moment as a bright explosion before the corpse
        // fades + tilts. Painted over the entire sprite extent.
        if (whiteFlash > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = whiteFlash * 0.9;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(spriteX, spriteY, spriteW, spriteH);
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
        // R524: occasional CRT horizontal sync glitch — every ~120 frames
        // shift a random row. Sells the "broken old CRT" vibe.
        const glitchPhase = (this.t + (x * 7) | 0) % 120;
        const glitchActive = glitchPhase < 4;
        if (type === 'boot') {
            // Win98 boot screen — black with 4-pane Windows logo + label
            ctx.fillStyle = '#000010';
            ctx.fillRect(x, y, w, h);
            // 4-pane Windows flag centered
            const fw = Math.max(6, w * 0.45);
            const fh = Math.max(4, h * 0.5);
            const fx = x + (w - fw) / 2;
            const fy = y + Math.max(1, h * 0.15);
            const half = Math.max(1, fw / 2 | 0);
            const halfH = Math.max(1, fh / 2 | 0);
            ctx.fillStyle = '#ff4040'; ctx.fillRect(fx, fy, half, halfH);
            ctx.fillStyle = '#40ff40'; ctx.fillRect(fx + half, fy, half, halfH);
            ctx.fillStyle = '#4080ff'; ctx.fillRect(fx, fy + halfH, half, halfH);
            ctx.fillStyle = '#ffe040'; ctx.fillRect(fx + half, fy + halfH, half, halfH);
            // Logo flag wave — alternate pixel rows for "billowing"
            if ((this.t >> 2) & 1) {
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(fx, fy + halfH, fw, 1);
            }
            // "WINDOWS 98" label below — 1px dotted text
            if (h >= 10) {
                ctx.fillStyle = '#a0c0ff';
                // W-I-N-9-8 simple pixel letters as dots
                const lblY = y + h - 3;
                for (let i = 0; i < Math.min(6, Math.floor(w / 4)); i++) {
                    ctx.fillRect(x + 2 + i * 3, lblY, 2, 1);
                }
            }
        } else if (type === 'bsod') {
            // Blue Screen of Death — solid blue + white error rows
            ctx.fillStyle = '#0040a0';
            ctx.fillRect(x, y, w, h);
            // Top error banner — inverted (white bg, blue text)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, w, 2);
            ctx.fillStyle = '#0040a0';
            // Big block "WINDOWS" tag dots
            for (let i = 0; i < Math.min(5, Math.floor(w / 3)); i++) {
                ctx.fillRect(x + 2 + i * 2, y + 1, 1, 1);
            }
            // Error message body — multiple white text rows
            ctx.fillStyle = '#ffffff';
            const lineCount = Math.floor((h - 6) / 2);
            for (let r = 0; r < lineCount; r++) {
                // Vary row width to look like real error text
                const baseW = ((r * 11 + 7) % (w - 4));
                let rowW = Math.max(2, baseW);
                if (glitchActive && r === (glitchPhase % lineCount)) {
                    rowW = w - 4;  // sync glitch row stretches full width
                }
                ctx.fillRect(x + 2, y + 5 + r * 2, rowW, 1);
            }
            // PRESS ANY KEY blink at bottom
            if (h >= 12 && (this.t >> 4) & 1) {
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
            }
        } else if (type === 'word') {
            // Word doc — blue title bar, white body, text lines, cursor
            ctx.fillStyle = '#000080';
            ctx.fillRect(x, y, w, 2);
            // Title bar text (white dots simulating "DOCUMENT.DOC")
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < Math.min(8, Math.floor(w / 2)); i++) {
                if (i !== 3) ctx.fillRect(x + 1 + i * 2, y, 1, 1);
            }
            // Menu bar (grey)
            ctx.fillStyle = '#c0c0c0';
            ctx.fillRect(x, y + 2, w, 2);
            ctx.fillStyle = '#000000';
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 1 + i * 3, y + 3, 2, 1);
            // White page body
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y + 4, w, h - 4);
            // Text lines (alternating widths to look like real paragraphs)
            ctx.fillStyle = '#202020';
            const wordLines = Math.floor((h - 6) / 2);
            for (let r = 0; r < wordLines; r++) {
                const lineW = Math.max(2, ((r * 13 + 5) % (w - 4)));
                ctx.fillRect(x + 2, y + 6 + r * 2, lineW, 1);
            }
            // Blinking cursor
            if ((this.t >> 3) & 1) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(x + 4, y + h - 3, 1, 2);
            }
        } else if (type === 'excel') {
            // Excel — green header, beige cells, grid, numbers
            ctx.fillStyle = '#006040';
            ctx.fillRect(x, y, w, 2);
            // Green "X" logo dot
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x + 1, y, 1, 1);
            ctx.fillRect(x + 2, y + 1, 1, 1);
            // Cells body
            ctx.fillStyle = '#f0f0e8';
            ctx.fillRect(x, y + 2, w, h - 2);
            // Vertical grid
            ctx.fillStyle = '#a0a0a0';
            for (let gx = 4; gx < w; gx += 4) {
                ctx.fillRect(x + gx, y + 2, 1, h - 2);
            }
            // Horizontal grid
            for (let gy = 4; gy < h; gy += 3) {
                ctx.fillRect(x, y + gy, w, 1);
            }
            // Selected cell highlight
            const selX = x + 4 + Math.floor((this.t / 30) % 3) * 4;
            const selY = y + 4 + Math.floor((this.t / 60) % 2) * 3;
            if (selX + 4 < x + w && selY + 3 < y + h) {
                ctx.strokeStyle = '#006040';
                ctx.lineWidth = 1;
                ctx.strokeRect(selX, selY, 4, 3);
            }
            // Numbers in cells
            ctx.fillStyle = '#202020';
            for (let i = 0; i < Math.min(6, Math.floor(w / 4)); i++) {
                for (let j = 0; j < Math.min(3, Math.floor((h - 4) / 3)); j++) {
                    if (((i + j) * 7 + this.t / 60 | 0) & 1) {
                        ctx.fillRect(x + 1 + i * 4, y + 5 + j * 3, 2, 1);
                    }
                }
            }
        } else {
            // TV static — much more chaotic, with horizontal hold lines
            ctx.fillStyle = '#202020';
            ctx.fillRect(x, y, w, h);
            // Noise dots
            for (let i = 0; i < Math.min(40, w * h / 3); i++) {
                const px = x + Math.floor(Math.random() * w);
                const py = y + Math.floor(Math.random() * h);
                const v = Math.random();
                ctx.fillStyle = v < 0.3 ? '#ffffff' :
                                v < 0.6 ? '#a0a0a0' : '#404040';
                ctx.fillRect(px, py, 1, 1);
            }
            // Horizontal hold lines drifting up
            ctx.fillStyle = '#606060';
            const holdY = y + ((this.t * 2) % h);
            ctx.fillRect(x, holdY, w, 1);
            const holdY2 = y + ((this.t * 2 + h / 2) % h);
            ctx.fillStyle = '#404040';
            ctx.fillRect(x, holdY2, w, 1);
        }
        // R524: occasional sync-glitch overlay — shift a 2-pixel row right
        // by a few pixels every ~120 frames
        if (glitchActive && w > 6) {
            const gy = y + 2 + Math.floor(Math.random() * (h - 4));
            ctx.fillStyle = '#1a1a20';
            ctx.fillRect(x, gy, 2, 2);
            ctx.fillStyle = '#80a0c0';
            ctx.fillRect(x + w - 2, gy, 2, 2);
        }
    }

    _drawBullet(b) {
        const ctx = this.ctx;
        const scale = depthScale(b.t);
        // R567: tracer trail from the barrel tip toward the bullet's
        // current screen position. Reads as a streak of motion, not a
        // single dot. Length scales inversely with depth so close bullets
        // have shorter trails (less smear) and far bullets have long
        // tracers receding into the distance.
        const trailEnd = Math.max(0.85, b.t - 0.15);
        const tx = b.startX + (b.ax - b.startX) * (1 - trailEnd);
        const ty = b.startY + (b.ay - b.startY) * (1 - trailEnd);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Outer wide trail
        ctx.strokeStyle = 'rgba(255, 200, 60, 0.5)';
        ctx.lineWidth = Math.max(1, scale * 2);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // Inner bright core
        ctx.strokeStyle = '#fff8c0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // Glowing tip
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffe070';
        const r = 1.5 + scale * 2.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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

    _drawVoltron() {
        const v = this.voltron;
        if (!v) return;
        const ctx = this.ctx;
        const s = v.scale;
        const W = VOLTRON_W * s;
        const H = VOLTRON_H * s;
        const baseX = v.x;
        const baseY = v.y;
        // Footstep bob — body lifts on stride
        const bob = Math.sin(v.stride) * 2 * s;
        ctx.save();
        ctx.translate(baseX, baseY + bob);

        // Body shake on hit flash
        if (v.hitFlash > 0 && v.hitFlash % 2 === 0) {
            ctx.translate((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        }

        // ===== LEGS (2 stacked CRTs per leg) =====
        const strideOffA = Math.sin(v.stride) * 3 * s;
        const strideOffB = Math.sin(v.stride + Math.PI) * 3 * s;
        const legW = 14 * s;
        const legSegH = 16 * s;
        // Left leg
        this._drawVoltronCrt(ctx, -16 * s + strideOffA, -legSegH, legW, legSegH, 'excel', v);
        this._drawVoltronCrt(ctx, -16 * s + strideOffA, -legSegH * 2, legW, legSegH, 'word', v);
        // Right leg
        this._drawVoltronCrt(ctx,  2 * s + strideOffB, -legSegH, legW, legSegH, 'word', v);
        this._drawVoltronCrt(ctx,  2 * s + strideOffB, -legSegH * 2, legW, legSegH, 'excel', v);

        // ===== TORSO (1 big CRT) =====
        const torsoH = 22 * s;
        const torsoW = 36 * s;
        const torsoY = -legSegH * 2 - torsoH;
        this._drawVoltronCrt(ctx, -torsoW / 2, torsoY, torsoW, torsoH, 'bsod', v);

        // ===== ARMS (CRT shoulders + biceps) =====
        const armWS = 14 * s;
        const armHS = 14 * s;
        const armBob = Math.sin(v.stride * 0.5) * 2 * s;
        // R527: throw telegraph — raise the throwing arm (lift up by 8px
        // during the 14f window after a throw)
        const throwT = v._throwingArmT || 0;
        const throwLift = throwT > 0 ? Math.sin((14 - throwT) / 14 * Math.PI) * 8 * s : 0;
        const leftThrowing = v._throwingArm === -1 && throwT > 0;
        const rightThrowing = v._throwingArm === 1 && throwT > 0;
        // Left arm — shoulder + dangling forearm
        const lArmY = torsoY + 2 + armBob - (leftThrowing ? throwLift : 0);
        this._drawVoltronCrt(ctx, -torsoW / 2 - armWS + 2, lArmY, armWS, armHS, 'static', v);
        this._drawVoltronCrt(ctx, -torsoW / 2 - armWS + 2, lArmY + armHS, armWS - 2, armHS - 2, 'boot', v);
        // Right arm
        const rArmY = torsoY + 2 - armBob - (rightThrowing ? throwLift : 0);
        this._drawVoltronCrt(ctx, torsoW / 2 - 2, rArmY, armWS, armHS, 'static', v);
        this._drawVoltronCrt(ctx, torsoW / 2 - 2, rArmY + armHS, armWS - 2, armHS - 2, 'word', v);
        // Throw glow on the active arm
        if (throwT > 0) {
            const glowSide = v._throwingArm;
            const glowX = (glowSide === -1) ? -torsoW / 2 - armWS / 2 : torsoW / 2 + armWS / 2 - 2;
            const glowY = (glowSide === -1 ? lArmY : rArmY) + armHS;
            const glowR = (8 + (14 - throwT) * 1.5) * s;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (throwT / 14) * 0.7;
            const grad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowR);
            grad.addColorStop(0, '#ffe070');
            grad.addColorStop(0.5, '#ffa030');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(glowX, glowY, glowR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ===== HEAD (big CRT with face) =====
        const headW = 28 * s;
        const headH = 22 * s;
        const headY = torsoY - headH;
        // R529: BSOD charge pulse — red radial glow behind head during windup
        if (v._bsodCharge > 0) {
            const cT = (30 - v._bsodCharge) / 30;
            const cR = (headW * 0.7) + cT * 16;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.5 + cT * 0.3;
            const grad = ctx.createRadialGradient(0, headY + headH / 2, 0, 0, headY + headH / 2, cR);
            grad.addColorStop(0, '#4080ff');
            grad.addColorStop(0.5, '#0040a0');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, headY + headH / 2, cR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        this._drawVoltronHead(ctx, -headW / 2, headY, headW, headH, v);

        // Hit flash overlay
        if (v.hitFlash > 0 && v.hitFlash % 2 === 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-W / 2, -H, W, H);
            ctx.restore();
        }

        ctx.restore();

        // R542: CRTRON HP bar — moved down out of the WAVE+SCORE HUD strip.
        // Was at barY=30 (label drew at y=23 over the SCORE bezel at y=16-26
        // and the score numerals at y=18, creating a visible black overlap).
        // Now positioned at the bottom of the viewport above the turret to
        // mirror the platformer's boss HP bar pattern.
        if (v.hp > 0) {
            const barW = GAME.W - 40;
            const barX = 20;
            const barY = GAME.H - 22;
            ctx.fillStyle = 'rgba(0,0,0,0.78)';
            ctx.fillRect(barX - 4, barY - 9, barW + 8, 15);
            ctx.fillStyle = '#3a1a1a';
            ctx.fillRect(barX, barY, barW, 4);
            const fillW = Math.round((v.hp / v.maxHp) * barW);
            ctx.fillStyle = v.phase === 2 ? '#ff4040' : '#ffa030';
            ctx.fillRect(barX, barY, fillW, 4);
            drawText(ctx, 'CRTRON', GAME.W / 2, barY - 8, '#ffe070', 1, 'center');
        }
        // Boss bark speech bubble
        if (this.bossBark) {
            const b = this.bossBark;
            const fade = b.age > b.maxAge - 30 ? (b.maxAge - b.age) / 30 :
                         b.age < 10 ? b.age / 10 : 1;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, fade));
            const txt = '"' + b.text + '"';
            const bx = GAME.W / 2;
            const by = 56;
            // Background
            const bw = txt.length * 6 + 12;
            ctx.fillStyle = '#fff';
            ctx.fillRect(bx - bw / 2, by - 3, bw, 11);
            ctx.fillStyle = '#1a0a14';
            ctx.fillRect(bx - bw / 2, by - 3, bw, 1);
            ctx.fillRect(bx - bw / 2, by + 7, bw, 1);
            ctx.fillRect(bx - bw / 2, by - 3, 1, 11);
            ctx.fillRect(bx + bw / 2 - 1, by - 3, 1, 11);
            // Tail pointing up toward boss head
            ctx.fillStyle = '#fff';
            ctx.fillRect(bx - 2, by + 8, 4, 2);
            ctx.fillRect(bx - 1, by + 10, 2, 2);
            drawText(ctx, txt, bx, by, '#1a0a14', 1, 'center');
            ctx.restore();
        }
        // R528: dramatic boss-death overlays
        if (this._voltronDeathFlash > 0) {
            const fT = this._voltronDeathFlash / 18;
            ctx.save();
            ctx.globalAlpha = fT;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
        }
        if (this._voltronStampT > 0) {
            const total = 120;
            const t = total - this._voltronStampT;
            const scale = t < 12 ? 1.6 - (t / 12) * 0.6 : 1.0;
            const rot = t < 8 ? (8 - t) * 0.05 : 0.04 + Math.sin(t * 0.03) * 0.005;
            const alpha = this._voltronStampT < 30 ? this._voltronStampT / 30 : 1;
            ctx.save();
            const cx = GAME.W / 2;
            const cy = GAME.H / 2 - 8;
            ctx.globalAlpha = alpha;
            ctx.translate(cx, cy);
            ctx.rotate(rot - 0.08);
            ctx.scale(scale, scale);
            const w = 120, h = 24;
            ctx.strokeStyle = '#ff1a1a';
            ctx.lineWidth = 2;
            ctx.strokeRect(-w / 2, -h / 2, w, h);
            ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
            drawTextOutlined(ctx, 'SYSTEM HALTED', 0, -4, '#ff3030', '#3a0a0a', 1, 'center');
            ctx.restore();
        }
        // BSOD wave flash
        if (this._bsodWaveT > 0) {
            const t = this._bsodWaveT;
            // Pulse 3 times during the 60-frame window
            const phase = Math.floor((60 - t) / 8);
            if (phase < 6 && (phase & 1) === 0) {
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#0040a0';
                ctx.fillRect(0, 0, GAME.W, GAME.H);
                ctx.restore();
                if (t < 40) {
                    drawTextOutlined(ctx, 'BLUE SCREEN', GAME.W / 2, GAME.H / 2 - 4,
                                     '#ffffff', '#0040a0', 1, 'center');
                }
            }
        }
    }

    // Helper: draw a single CRT "limb" of the Voltron — beige chassis +
    // screen with the given content type
    _drawVoltronCrt(ctx, x, y, w, h, screenType, v) {
        if (w < 2 || h < 2) return;
        ctx.fillStyle = '#a89c80';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#c8b898';
        ctx.fillRect(x, y, w, 1);
        ctx.fillRect(x, y, 1, h);
        ctx.fillStyle = '#604838';
        ctx.fillRect(x, y + h - 1, w, 1);
        ctx.fillRect(x + w - 1, y, 1, h);
        // Screen
        const sX = x + 2;
        const sY = y + 2;
        const sW = w - 4;
        const sH = h - 6;
        if (sW > 1 && sH > 1) {
            // R566e+R567f: map each body-segment screenType to a painted
            // variant so CRTRON's body shows actual corporate hostility
            // (BSOD/error/virus/terminal) instead of one repeating face.
            // Head still gets the bespoke expression renderer below.
            const SCREEN_KEY_MAP = {
                'bsod':   'turret_crt_face_bsod',
                'word':   'turret_crt_face_error',
                'excel':  'turret_crt_face_virus',
                'boot':   'turret_crt_face_bsod',
                'static': 'turret_crt_face_terminal',
            };
            const screenKey = SCREEN_KEY_MAP[screenType] || 'turret_crt_face_terminal';
            const faceImg = sprites.images.get(screenKey)
                         || sprites.images.get('turret_crt_face');
            if (faceImg) {
                ctx.fillStyle = '#0a0a14';
                ctx.fillRect(sX, sY, sW, sH);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(faceImg, 0, 0, faceImg.width, faceImg.height,
                              sX, sY, sW, sH);
            } else {
                ctx.fillStyle = '#1a1a20';
                ctx.fillRect(sX, sY, sW, sH);
                const idx = SCREEN_TYPES.indexOf(screenType);
                this._drawScreenContentByIdx(idx >= 0 ? idx : 0, sX, sY, sW, sH);
                ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.sin(this.t * 0.5) * 0.05})`;
                for (let yy = sY; yy < sY + sH; yy += 2) {
                    ctx.fillRect(sX, yy, sW, 1);
                }
            }
        }
    }

    // Helper: draw the head CRT with EVIL EYES + EYEBROWS expression
    _drawVoltronHead(ctx, x, y, w, h, v) {
        // Chassis
        ctx.fillStyle = '#a89c80';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#c8b898';
        ctx.fillRect(x, y, w, 1);
        ctx.fillRect(x, y, 1, h);
        ctx.fillStyle = '#604838';
        ctx.fillRect(x, y + h - 1, w, 1);
        ctx.fillRect(x + w - 1, y, 1, h);
        // Screen background — phase 2 turns red
        const sX = x + 2;
        const sY = y + 2;
        const sW = w - 4;
        const sH = h - 6;
        ctx.fillStyle = v.phase === 2 ? '#400010' : '#000010';
        ctx.fillRect(sX, sY, sW, sH);

        // Draw face based on expression
        const cx = sX + sW / 2;
        const cy = sY + sH / 2;
        const face = v.face;

        // Eyes — width depends on face
        const eyeY = sY + Math.max(2, sH * 0.32);
        const eyeR = Math.max(1, sH * 0.18);
        const eyeOff = sW * 0.22;

        if (face === FACE_DEAD) {
            // X eyes
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            for (const ex of [cx - eyeOff, cx + eyeOff]) {
                ctx.beginPath();
                ctx.moveTo(ex - eyeR, eyeY - eyeR);
                ctx.lineTo(ex + eyeR, eyeY + eyeR);
                ctx.moveTo(ex + eyeR, eyeY - eyeR);
                ctx.lineTo(ex - eyeR, eyeY + eyeR);
                ctx.stroke();
            }
        } else if (face === FACE_HURT) {
            // Squinted eyes — small ovals
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cx - eyeOff - eyeR / 2, eyeY, eyeR, 1);
            ctx.fillRect(cx + eyeOff - eyeR / 2, eyeY, eyeR, 1);
        } else if (face === FACE_SCREAM) {
            // Wide red glowing eyes
            ctx.fillStyle = '#ff4040';
            ctx.fillRect(cx - eyeOff - eyeR, eyeY - eyeR, eyeR * 2, eyeR * 2);
            ctx.fillRect(cx + eyeOff - eyeR, eyeY - eyeR, eyeR * 2, eyeR * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cx - eyeOff - eyeR + 1, eyeY - eyeR + 1, eyeR * 2 - 2, eyeR * 2 - 2);
        } else {
            // ANGRY / NORMAL — round white eyes with red pupils
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cx - eyeOff - eyeR, eyeY - eyeR, eyeR * 2, eyeR * 2);
            ctx.fillRect(cx + eyeOff - eyeR, eyeY - eyeR, eyeR * 2, eyeR * 2);
            // Pupils — track the turret (always look toward player)
            ctx.fillStyle = '#a00000';
            const pupilOff = Math.max(1, eyeR * 0.4);
            const pupilSize = Math.max(1, eyeR);
            // Pupils lower (looking down at turret)
            ctx.fillRect(cx - eyeOff - pupilSize / 2, eyeY + pupilOff - pupilSize / 2, pupilSize, pupilSize);
            ctx.fillRect(cx + eyeOff - pupilSize / 2, eyeY + pupilOff - pupilSize / 2, pupilSize, pupilSize);
        }

        // Eyebrows — angled inward for ANGRY/SCREAM, flat for NORMAL, sad-droop for HURT
        if (face !== FACE_DEAD) {
            ctx.strokeStyle = face === FACE_NORMAL ? '#604030' : '#ff4040';
            ctx.lineWidth = Math.max(1, sH * 0.06);
            const browY = eyeY - eyeR - 2;
            const browW = eyeR + 2;
            const browAngle = face === FACE_ANGRY || face === FACE_SCREAM ? 1 :
                              face === FACE_HURT ? -1 : 0;
            // Left brow — angles down-right (toward center) when angry
            ctx.beginPath();
            ctx.moveTo(cx - eyeOff - browW, browY - browAngle);
            ctx.lineTo(cx - eyeOff + browW, browY + browAngle);
            ctx.stroke();
            // Right brow — mirror
            ctx.beginPath();
            ctx.moveTo(cx + eyeOff - browW, browY + browAngle);
            ctx.lineTo(cx + eyeOff + browW, browY - browAngle);
            ctx.stroke();
        }

        // Mouth — based on expression
        const mouthY = sY + sH * 0.75;
        if (face === FACE_DEAD) {
            // Tongue-out flat mouth
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cx - sW * 0.2, mouthY, sW * 0.4, 1);
        } else if (face === FACE_HURT) {
            // Open small "O"
            ctx.fillStyle = '#600010';
            ctx.fillRect(cx - 2, mouthY - 1, 4, 3);
        } else if (face === FACE_SCREAM) {
            // Wide open mouth showing teeth
            ctx.fillStyle = '#600010';
            ctx.fillRect(cx - sW * 0.3, mouthY - 2, sW * 0.6, 5);
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 5; i++) {
                ctx.fillRect(cx - sW * 0.3 + 1 + i * 3, mouthY - 1, 1, 2);
            }
        } else if (face === FACE_ANGRY) {
            // Snarl — inverted curve
            ctx.fillStyle = '#600010';
            ctx.fillRect(cx - sW * 0.25, mouthY, sW * 0.5, 2);
            ctx.fillRect(cx - sW * 0.2, mouthY + 1, sW * 0.4, 1);
            // Teeth on snarl
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(cx - sW * 0.2 + i * 4, mouthY, 1, 1);
            }
        } else {
            // NORMAL — straight line
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cx - sW * 0.2, mouthY, sW * 0.4, 1);
        }

        // Scanlines + bezel highlight on the head screen
        ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.sin(this.t * 0.5) * 0.05})`;
        for (let yy = sY; yy < sY + sH; yy += 2) {
            ctx.fillRect(sX, yy, sW, 1);
        }
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sX, sY, sW, 1);
        ctx.fillRect(sX, sY, 1, sH);
        ctx.restore();
    }

    _drawBossProjectiles() {
        const ctx = this.ctx;
        for (const b of this.bossProjectiles) {
            // R527: motion trail — short ghost line behind the projectile
            // so it reads at a glance even during fast arcs. Drawn first
            // so the projectile sits on top.
            if (b._trail && b._trail.length > 1) {
                ctx.save();
                ctx.strokeStyle = b.kind === 'mouse' ? '#a08868' : '#c0c0c0';
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(b._trail[0].x, b._trail[0].y);
                for (let i = 1; i < b._trail.length; i++) {
                    ctx.lineTo(b._trail[i].x, b._trail[i].y);
                }
                ctx.stroke();
                ctx.restore();
            }
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.rot);
            if (b.kind === 'mouse') {
                // R527: bigger beige single-button mouse (was 8x6, now 10x8)
                ctx.fillStyle = '#d8c8b0';
                ctx.fillRect(-5, -4, 10, 8);
                ctx.fillStyle = '#a08868';
                ctx.fillRect(-5, -4, 10, 1);
                // Button divider
                ctx.fillStyle = '#604838';
                ctx.fillRect(-5, 0, 10, 1);
                // Single button outline
                ctx.fillStyle = '#806848';
                ctx.fillRect(-4, -3, 8, 1);
                // Cord trailing
                ctx.strokeStyle = '#404048';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, -4);
                ctx.lineTo(-7, -7);
                ctx.stroke();
                // Highlight outline (so it reads against the dark room)
                ctx.fillStyle = '#fff2c0';
                ctx.fillRect(-5, -4, 1, 1);
                ctx.fillRect(4, -4, 1, 1);
            } else if (b.kind === 'floppy') {
                // R527: bigger 3.5" floppy (was 10x10, now 12x12)
                ctx.fillStyle = '#1a1a22';
                ctx.fillRect(-6, -6, 12, 12);
                // Metal shutter
                ctx.fillStyle = '#c0c0c0';
                ctx.fillRect(-4, -6, 5, 4);
                ctx.fillStyle = '#808088';
                ctx.fillRect(-4, -6, 5, 1);
                // Label
                ctx.fillStyle = '#f0e0a0';
                ctx.fillRect(-5, 0, 10, 5);
                // Tiny "label text"
                ctx.fillStyle = '#404040';
                ctx.fillRect(-4, 1, 6, 1);
                ctx.fillRect(-4, 3, 4, 1);
                // Write-protect tab
                ctx.fillStyle = '#404048';
                ctx.fillRect(4, -2, 2, 2);
            }
            ctx.restore();
        }
    }

    _drawDamageNumbers() {
        const ctx = this.ctx;
        for (const d of this.damageNumbers) {
            const fade = 1 - (d.age / d.maxAge);
            ctx.save();
            ctx.globalAlpha = Math.max(0, fade);
            const scale = d.big ? 2 : 1;
            drawTextOutlined(ctx, d.value, d.x, d.y, d.color, '#1a0a14', scale, 'center');
            ctx.restore();
        }
    }

    _drawCasings() {
        const ctx = this.ctx;
        for (const c of this.casings) {
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rot);
            if (c.shard) {
                // R567f: CRT glass shard — angular blue-white shape with
                // bright edge highlight. Pure pixel-art, no gradient.
                ctx.fillStyle = '#6090c0';
                ctx.fillRect(-2, -1, 4, 3);
                ctx.fillStyle = '#a0d0ff';
                ctx.fillRect(-2, -1, 4, 1);
                ctx.fillRect(-2, -1, 1, 3);   // left edge highlight
                ctx.fillStyle = '#1a3050';
                ctx.fillRect(1, 1, 1, 1);     // dark corner
            } else {
                // Brass casing — 4x2 with bright top + dark base
                ctx.fillStyle = '#a07020';
                ctx.fillRect(-2, -1, 4, 2);
                ctx.fillStyle = '#ffd060';
                ctx.fillRect(-2, -1, 4, 1);
                ctx.fillStyle = '#604020';
                ctx.fillRect(-2, 0, 1, 1);
            }
            ctx.restore();
        }
    }

    _drawSmoke() {
        const ctx = this.ctx;
        for (const s of this.smokePuffs) {
            const tAge = s.age / s.maxAge;
            const alpha = (1 - tAge) * 0.5;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#a0a0b0';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    _drawExplosion(e) {
        const ctx = this.ctx;
        // R528: explosions can have negative age (staggered spawn for death
        // sequence). Skip render until age catches up so we don't push a
        // negative radius into createRadialGradient.
        if (e.age < 0) return;
        const tAge = e.age / e.maxAge;
        const depthMul = depthScale(e.t ?? 1);
        const r = Math.max(1, (e.small ? (2 + tAge * 3) : (4 + tAge * 16)) * depthMul);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, (1 - tAge) * 0.9);
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
        // R566b: painted crosshair sprite. Fall back to the procedural
        // bracket reticle if the asset hasn't loaded yet (hot-load safety).
        const img = sprites.images.get('turret_crosshair');
        if (img) {
            const W = 24;        // displayed size (native asset is 32×32)
            const H = 24;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, img.width, img.height,
                          x - W / 2 | 0, y - H / 2 | 0, W, H);
            ctx.restore();
            return;
        }
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#ff4040';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 8, y); ctx.lineTo(x - 3, y);
        ctx.moveTo(x + 3, y); ctx.lineTo(x + 8, y);
        ctx.moveTo(x, y - 8); ctx.lineTo(x, y - 3);
        ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 8);
        ctx.stroke();
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

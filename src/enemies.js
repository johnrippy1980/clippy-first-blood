// Enemies. Grunts (4 types) + bosses (7). Behaviors are state machines
// driven by a per-frame update with the level and the player as inputs.

import { GAME, STATE } from './constants.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { drawEnemyFrame, sprites, getSpriteDims } from './sprites.js';
import { drawText } from './pixelfont.js';

// Running module-level counter of distinct "target lost" bubble events
// across the current stage. Read by EnemyManager.lostCount getter and used
// to drive the GHILLIE SUIT achievement. Reset each time EnemyManager.clear()
// fires (i.e. on stage start).
let _lostBubblesFired = 0;

// Pool of "where did the player go?" lines that enemies cycle through when
// the player ducks behind cover or into water. Picked at random per bubble
// instance so the screen doesn't repeat the same line across multiple enemies.
const LOST_TARGET_LINES = [
    'WHERE\'D HE GO?',
    'TARGET LOST',
    "DON'T SEE HIM",
    'MUST\'VE BEEN THE WIND',
    'CLIPPY? COME OUT',
    '...',
    'HMMMM',
    'WEIRD',
];

// Grunt templates.
const TYPES = {
    folder: {
        sprite: 'folder',
        w: 14, h: 12,
        hp: 2, contactDmg: 1, score: 100,
        speed: 0.9, behavior: 'fly_sine',
        amplitude: 14, period: 90, shootInterval: 60, projectileSpeed: 1.9,
        activateRange: 240,
        gibPalette: ['#c0a060', '#806030', '#403018'],  // manila folder shreds
    },
    stapler: {
        sprite: 'stapler',
        w: 14, h: 8,
        hp: 1, contactDmg: 1, score: 80,
        speed: 0.9, behavior: 'hop',
        hopV: -3.4, hopInterval: 32, leapV: -4.6, leapTriggerDx: 64,
        activateRange: 220,
        gibPalette: ['#b8b8c0', '#808088', '#404048'],  // chrome / steel
    },
    cabinet: {
        sprite: 'cabinet',
        w: 18, h: 22,
        hp: 6, contactDmg: 2, score: 250,
        speed: 0.55, behavior: 'charge',
        chargeSpeed: 2.4, chargeWindup: 24,
        activateRange: 200,
        gibPalette: ['#807068', '#504840', '#302820'],  // dark grey metal
    },
    holepunch: {
        sprite: 'holepunch',
        w: 14, h: 14,
        hp: 3, contactDmg: 1, score: 150,
        speed: 0, behavior: 'hover_sniper',
        hoverY: -2, shootInterval: 70, projectileSpeed: 2.7, beamCharge: 22,
        gibPalette: ['#7090b0', '#405070', '#202838'],  // cold steel + paper bits
        // Snipers activate inside one screen width (256px), down from 260.
        // Off-screen snipers cannot fire at the player — fair gameplay.
        activateRange: 200,
    },
    // R325 + R346: paper airplane / data drone — fast, low-hp aerial.
    // Glides horizontally at fixed Y; commits to a 45° dive when player
    // passes beneath. R346 added a dedicated painted sprite (red-slash
    // origami plane) so this enemy reads as distinct from a folder.
    dive_bomber: {
        sprite: 'dive_bomber',
        w: 12, h: 10,
        hp: 1, contactDmg: 1, score: 120,
        speed: 1.6, behavior: 'dive_bomb',
        diveSpeed: 3.4, diveTriggerDx: 16,
        activateRange: 280,
        gibPalette: ['#e0e0e8', '#a0a0b0', '#404048'],
    },
    // R325 + R346: clippy doppelgänger summoner. Stationary; spawns
    // folder grunts up to 3 active. R346 added a dedicated painted
    // sprite (twisted dark paperclip with red eyes + purple aura) —
    // visually unmistakable from a holepunch sniper.
    summoner: {
        sprite: 'summoner',
        w: 14, h: 18,
        hp: 5, contactDmg: 1, score: 280,
        speed: 0, behavior: 'summon',
        summonInterval: 240, summonMax: 3, summonType: 'folder',
        activateRange: 220,
        gibPalette: ['#a0a0b8', '#505068', '#202028'],
    },
    // R325 + R346: riot-shield file cabinet. Walks toward player; front
    // shield deflects bullets. R346 added a dedicated painted sprite
    // (chunky filing cabinet with visible black-and-yellow riot shield)
    // so the shield-up state reads visually distinct from a plain
    // cabinet enemy.
    shielder: {
        sprite: 'shielder',
        w: 18, h: 22,
        hp: 4, contactDmg: 2, score: 220,
        speed: 0.45, behavior: 'shielded_walk',
        shieldW: 12, shieldH: 16,
        shieldUpTime: 240, shieldDownTime: 60,
        activateRange: 220,
        gibPalette: ['#707880', '#404848', '#202028'],
    },
};

class Bullet {
    constructor(x, y, vx, vy, dmg = 1) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.dmg = dmg; this.life = 180;
        this.color = '#ff8050';
        // Position history for trail render — 4-step tail in direction of travel.
        this.prevX = x; this.prevY = y;
        // Stuck-in-wall state: bullet stops moving + dmg disables, but stays
        // rendered as a fading divot for ~20 frames. Mirrors the player-bullet
        // impact-stick beat for visual consistency.
        this.stuck = false;
        this.stuckLife = 0;
        this.stuckLifeMax = 20;
    }
    update(level) {
        if (this.stuck) {
            this.stuckLife--;
            if (this.stuckLife <= 0) this.life = 0;
            return;
        }
        this.prevX = this.x; this.prevY = this.y;
        // R190: optional per-bullet gravity for arcing projectiles (cube
        // iMac throws from the JOBS fight). Default 0 → existing straight
        // bullets unchanged.
        if (this._gravity) this.vy += this._gravity;
        this.x += this.vx; this.y += this.vy;
        this.life--;
        if (level.isSolid(this.x, this.y)) {
            // R325: ricochet path for cyclone-style bullets (`bouncesLeft > 0`).
            // Reflects velocity along the axis it actually hit (horizontal wall
            // → invert vy; vertical wall → invert vx). Decrements bouncesLeft;
            // when it hits 0 the next wall-hit falls through to stuck.
            if (this.bouncesLeft && this.bouncesLeft > 0) {
                this.x = this.prevX; this.y = this.prevY;
                // Probe which axis hit
                const hitX = level.isSolid(this.x + this.vx, this.y);
                const hitY = level.isSolid(this.x, this.y + this.vy);
                if (hitX) this.vx = -this.vx;
                if (hitY) this.vy = -this.vy;
                if (!hitX && !hitY) { this.vx = -this.vx; this.vy = -this.vy; } // diagonal corner
                this.bouncesLeft--;
                particles.hitSpark(this.x, this.y, this.color);
                return;
            }
            // Snap to last valid position so the divot sits flush against the wall.
            this.x = this.prevX; this.y = this.prevY;
            this.stuck = true;
            this.stuckLife = this.stuckLifeMax;
            this.dmg = 0; // can't damage anything once embedded
            particles.hitSpark(this.x, this.y, this.color);
            // Tiny debris burst — 3 dark fragments scatter back along the
            // incoming vector for the "chunk of wall blew off" beat.
            const back = -1;
            for (let i = 0; i < 3; i++) {
                particles.spawn(
                    this.x, this.y,
                    this.vx * 0.3 * back + (Math.random() - 0.5) * 0.8,
                    this.vy * 0.3 * back + (Math.random() - 0.5) * 0.8 - 0.3,
                    10 + (i & 3) * 2,
                    '#3a2a1a', 1, 0.08
                );
            }
        }
    }
    draw(ctx, camera) {
        const dx = Math.round(this.x - camera.viewX);
        const dy = Math.round(this.y - camera.viewY);
        // Stuck-in-wall divot: small fading pixel, no trail, no glow. Same
        // beat as the player-bullet impact-stick — "you hit the wall, here's
        // the scorch mark" before the bullet vanishes.
        if (this.stuck) {
            const fade = this.stuckLife / this.stuckLifeMax;
            ctx.globalAlpha = fade * 0.9;
            ctx.fillStyle = this.color;
            ctx.fillRect(dx - 1, dy - 1, 2, 2);
            ctx.globalAlpha = fade * 0.5;
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(dx, dy, 1, 1);
            ctx.globalAlpha = 1;
            return;
        }
        // Trail: 4 ghost steps back along the velocity vector, each fainter
        ctx.fillStyle = this.color;
        for (let i = 1; i <= 4; i++) {
            ctx.globalAlpha = 0.32 - i * 0.06;
            const tx = Math.round(dx - this.vx * i);
            const ty = Math.round(dy - this.vy * i);
            ctx.fillRect(tx - 1, ty - 1, 3, 3);
        }
        // Outer glow
        ctx.globalAlpha = 0.4;
        ctx.fillRect(dx - 2, dy - 2, 5, 5);
        ctx.globalAlpha = 1;
        // Dark outline ring — guarantees the bullet reads against bright
        // painted bg patches (keynote spotlights, founder embers, etc.).
        ctx.fillStyle = '#1a0500';
        ctx.fillRect(dx - 2, dy - 1, 1, 3); // left
        ctx.fillRect(dx + 2, dy - 1, 1, 3); // right
        ctx.fillRect(dx - 1, dy - 2, 3, 1); // top
        ctx.fillRect(dx - 1, dy + 2, 3, 1); // bottom
        // Core
        ctx.fillStyle = this.color;
        ctx.fillRect(dx - 1, dy - 1, 3, 3);
        // Hot center
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(dx, dy, 1, 1);
    }
}

class Enemy {
    constructor(x, y, type) {
        const t = TYPES[type] || TYPES.folder;
        this.type = type;
        this.x = x; this.y = y;
        this.spawnX = x; this.spawnY = y;
        this.w = t.w; this.h = t.h;
        this.vx = 0; this.vy = 0;
        this.hp = t.hp;
        this.maxHp = t.hp;
        this.score = t.score;
        this.contactDmg = t.contactDmg;
        this.behavior = t.behavior;
        this.tpl = t;
        this.facing = -1;
        this.alive = true;
        this.hitFlash = 0;
        this.timer = 0;
        this.subState = 0;
        this.subTimer = 0;
        this.sprite = t.sprite;
        this.gibPalette = t.gibPalette;
        // Per-enemy grace counter — frames remaining before this enemy may
        // act after activation. EnemyManager seeds with the stage-start grace.
        this._grace = 30;
        // Random idle-breath phase so enemies on screen don't all bob in sync.
        this._breathPhase = Math.random() * Math.PI * 2;
    }

    update(level, player) {
        this.timer++;
        if (this.hitFlash > 0) this.hitFlash--;
        if (this.owlPause > 0) this.owlPause--;
        this._tickStatus();
        if (!this.alive) return;
        // Sleep enemies that are way off camera — keeps the action focused on the player.
        // Activation requires BOTH: enemy within activateRange of player AND
        // global stage-start grace (gameStartGrace) has elapsed. The grace gives
        // the player a half-second to orient before any enemy can fire.
        const dxAbs = Math.abs(player.x - this.x);
        const range = this.tpl.activateRange || 999;
        if (!this.activated && dxAbs < range) {
            this.activated = true;
            // Spawn-in puff — small smoke burst telegraphs the activation so
            // enemies don't appear to teleport in when they enter range.
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                particles.spawn(cx, cy, Math.cos(a) * 0.6, Math.sin(a) * 0.6 - 0.2, 12 + Math.random() * 4, '#604030', 1, -0.02);
            }
            // First-spot alert — red "!" bubble above the head for 40 frames.
            // Telegraphs incoming threats so the player isn't surprised by
            // off-camera enemies suddenly opening fire.
            this._alertBubble = 40;
        }
        if (!this.activated) return;
        // Honor the global stage-start grace — set by EnemyManager on _startStage.
        if (this._grace > 0) { this._grace--; return; }
        // Pounce-stun: same effect as knock-stun but distinct counter so the
        // pounce attack can chain without colliding with knockback timers.
        if ((this._stunTimer || 0) > 0) {
            // Apply gravity for grounded behaviors so a stunned hopper sits
            // still instead of floating.
            if (this.behavior === 'hop' || this.behavior === 'charge') {
                this.vy = (this.vy || 0) + GAME.GRAVITY;
                const yRes = level.moveY(this, this.vy, true, this.vy);
                this.y = yRes.y; if (yRes.hit && yRes.landed) this.vy = 0;
            }
            return;
        }
        // Knock-stun: skip AI; physics still applies for hop/charge
        if ((this.knockStun || 0) > 0) {
            // Just settle vy on stunned ground enemies, no behavior
            if (this.behavior === 'hop' || this.behavior === 'charge') {
                this.vy = (this.vy || 0) + GAME.GRAVITY;
                const yRes = level.moveY(this, this.vy, true, this.vy);
                this.y = yRes.y; if (yRes.hit && yRes.landed) this.vy = 0;
                // Honor any horizontal velocity from the hit
                if (Math.abs(this.vx) > 0.1) {
                    const xRes = level.moveX(this, this.vx);
                    this.x = xRes.x; if (xRes.hit) this.vx = 0;
                    this.vx *= 0.88;
                }
            }
            return;
        }
        switch (this.behavior) {
            case 'fly_sine':       this._flySine(level, player); break;
            case 'hop':            this._hop(level, player); break;
            case 'charge':         this._charge(level, player); break;
            case 'hover_sniper':   this._hoverSniper(level, player); break;
            // R325: new behaviors
            case 'dive_bomb':      this._diveBomb(level, player); break;
            case 'summon':         this._summon(level, player); break;
            case 'shielded_walk':  this._shieldedWalk(level, player); break;
        }
    }

    _flySine(level, player) {
        const tpl = this.tpl;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distAbs = Math.abs(dx);
        this.facing = dx > 0 ? 1 : -1;
        // Optimal range 90-140px — pursue if far, retreat if too close.
        // Recently-fired = retreat for a brief window so player gets a window.
        const wantsDistance = (this._retreatTimer || 0) > 0 || distAbs < 70;
        const moveDir = wantsDistance ? -this.facing : this.facing;
        this.x += moveDir * tpl.speed * 0.6;
        if (this._retreatTimer > 0) this._retreatTimer--;
        // Vertical: drift toward player but also rise on retreat for variety
        const yBias = wantsDistance ? -8 : Math.max(-30, Math.min(30, dy * 0.05));
        this.y = this.spawnY + Math.sin(this.timer / tpl.period * Math.PI * 2) * tpl.amplitude + yBias;
        // Fire faster the closer you are; stage-scaled
        const mult = this._fireRateMult || 1;
        const baseRate = distAbs < 80 ? Math.max(28, tpl.shootInterval - 30) : tpl.shootInterval;
        const fireRate = Math.max(20, Math.round(baseRate * mult));
        // Don't fire on a hidden player (ducked-in-water OR behind cover OR
        // standing in tall grass); respect owl-pause too. When the player
        // hides, queue a "where did he go?" thought bubble.
        if (player.waterHidden || player.grassHidden || player.state === STATE.COVER) {
            this._noticeTargetLost();
            return;
        }
        if (this.owlPause > 0) return;
        // Pre-fire telegraph: in the 8 frames leading up to a shot, set
        // _preFire to a 0..1 ramp so the draw can paint a charging muzzle
        // flare. Lets the player see incoming bullets before they spawn.
        if (distAbs < 200) {
            const phase = this.timer % fireRate;
            if (phase >= fireRate - 8) {
                this._preFire = (phase - (fireRate - 8)) / 7;
                // Snapshot the aim vector so the telegraph points where the
                // shot will go, not the player's current position by the time
                // it fires.
                const d2 = Math.hypot(dx, dy) || 1;
                this._preFireDx = dx / d2;
                this._preFireDy = dy / d2;
            } else {
                this._preFire = 0;
            }
        } else {
            this._preFire = 0;
        }
        if (this.timer % fireRate === 0 && distAbs < 200) {
            const d = Math.hypot(dx, dy) || 1;
            const vx = dx / d * tpl.projectileSpeed;
            const vy = dy / d * tpl.projectileSpeed;
            globalEnemyBullets.push(new Bullet(this.x + this.w / 2, this.y + this.h / 2, vx, vy));
            // Retreat for a beat after firing — gives the player a window to advance
            this._retreatTimer = 25;
        }
    }

    _hop(level, player) {
        const tpl = this.tpl;
        this.vy += GAME.GRAVITY;
        const onGround = this._isOnGround(level);
        const dx = player.x - this.x;
        const distAbs = Math.abs(dx);
        if (onGround && this.timer % tpl.hopInterval === 0) {
            this.facing = dx > 0 ? 1 : -1;
            if (distAbs < 28) {
                // Point-blank panic-leap AWAY — gives player breathing room
                this.vy = tpl.leapV * 0.9;
                this.vx = -this.facing * tpl.speed * 2.2;
                this.facing *= -1; // turn around mid-air
            } else if (distAbs < tpl.leapTriggerDx) {
                // Medium-range leap-attack TOWARD player
                this.vy = tpl.leapV;
                this.vx = this.facing * tpl.speed * 2.0;
            } else {
                this.vy = tpl.hopV;
                this.vx = this.facing * tpl.speed;
            }
        }
        if (onGround && this.vy >= 0) this.vy = 0.1;

        const xRes = level.moveX(this, this.vx);
        this.x = xRes.x; if (xRes.hit) this.vx = -this.vx;
        const yRes = level.moveY(this, this.vy, true, this.vy);
        this.y = yRes.y; if (yRes.hit) { if (yRes.landed) this.vy = 0; else this.vy = 1; }
    }

    _charge(level, player) {
        const tpl = this.tpl;
        const dx = player.x - this.x;
        const dist = Math.abs(dx);
        if (this.subState === 0) {
            this.facing = dx > 0 ? 1 : -1;
            this.vx = this.facing * tpl.speed;
            if (dist < 96) this.subState = 1; // wind up earlier
            this.subTimer = 0;
        } else if (this.subState === 1) {
            this.subTimer++;
            this.vx *= 0.85;
            if (this.subTimer >= tpl.chargeWindup) {
                this.subState = 2;
                this.subTimer = 0;
                // Re-aim at moment of release so player can dodge but a perfect strafe is rewarded
                this.facing = dx > 0 ? 1 : -1;
            }
        } else if (this.subState === 2) {
            this.vx = this.facing * tpl.chargeSpeed;
            this.subTimer++;
            if (this.subTimer > 45) { this.subState = 0; }
        }
        this.vy += GAME.GRAVITY;
        const xRes = level.moveX(this, this.vx);
        this.x = xRes.x;
        if (xRes.hit) {
            // Wall-hit MID-CHARGE: cabinet stuns itself for 60f — punish window for player
            if (this.subState === 2) {
                this.subState = 0;
                this.knockStun = 60;
                this.vx = -this.facing * 1.2; // recoil
                audio.sfx('bossHit');
                particles.dust(this.x + this.w / 2, this.y + this.h - 2);
            } else {
                this.vx = 0;
            }
        }
        const yRes = level.moveY(this, this.vy, true, this.vy);
        this.y = yRes.y; if (yRes.hit && yRes.landed) this.vy = 0; else if (yRes.hit) this.vy = 1;
    }

    _hoverSniper(level, player) {
        const tpl = this.tpl;
        this.y = this.spawnY + Math.sin(this.timer / 60) * 4;
        const dx = player.x - this.x;
        const distAbs = Math.abs(dx);
        this.facing = dx > 0 ? 1 : -1;
        // Only fire when player is in range, not hidden, not owl-paused
        if (player.waterHidden || player.grassHidden || player.state === STATE.COVER) {
            this._noticeTargetLost();
            return;
        }
        if (this.owlPause > 0) return;
        if (distAbs < 220 && this.timer % tpl.shootInterval === 0 && this.subTimer === 0) {
            this.subTimer = tpl.beamCharge;
            // Snapshot aim point ahead of player based on their velocity (lead shot)
            const leadFrames = Math.min(40, distAbs / tpl.projectileSpeed);
            this._aimX = player.x + player.w / 2 + (player.vx || 0) * leadFrames * 0.5;
            this._aimY = player.y + player.h / 2 + (player.vy || 0) * leadFrames * 0.3;
        }
        if (this.subTimer > 0) {
            this.subTimer--;
            if (this.subTimer === 0) {
                const tx = this._aimX - (this.x + this.w / 2);
                const ty = this._aimY - (this.y + this.h / 2);
                const d = Math.hypot(tx, ty) || 1;
                const vx = tx / d * tpl.projectileSpeed;
                const vy = ty / d * tpl.projectileSpeed;
                const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, vx, vy);
                b.color = '#ff5050';
                globalEnemyBullets.push(b);
                audio.sfx?.('shoot');
            }
        }
    }

    // R325: dive-bomber — glides horizontally at fixed Y. When player's
    // X is within `diveTriggerDx` of dive-bomber's X, the bomber commits
    // to a 45° dive trajectory toward the player. Single-use; explodes
    // on terrain or contact.
    _diveBomb(level, player) {
        const tpl = this.tpl;
        const dx = player.x - this.x;
        if (this._dived) {
            // Already committed: maintain ballistic velocity
            this.x += this._diveVx;
            this.y += this._diveVy;
            // Hit terrain?
            if (level.isSolid(this.x + this.w / 2, this.y + this.h / 2)) {
                this.hp = 0;
                this.alive = false;
                particles.explosion(this.x + this.w / 2, this.y + this.h / 2, '#ffaa50', 14);
                return;
            }
            return;
        }
        // Glide phase — drift horizontally toward player at base speed
        const dir = dx > 0 ? 1 : -1;
        this.facing = dir;
        this.x += dir * tpl.speed;
        // Mild Y-bob for character
        this.y = this.spawnY + Math.sin(this.timer / 18) * 2;
        // Commit to dive when player is below + close in X
        if (Math.abs(dx) < tpl.diveTriggerDx && player.y > this.y + this.h) {
            this._dived = true;
            this._telegraph = 1;   // bright outline on commit frame
            // 45° dive vector toward player
            const dy = player.y - this.y;
            const a = Math.atan2(dy, dx);
            this._diveVx = Math.cos(a) * tpl.diveSpeed;
            this._diveVy = Math.sin(a) * tpl.diveSpeed;
            audio.sfx?.('bossChargeTell');
        }
    }

    // R325: summoner — stationary; spawns folder grunts up to summonMax
    // active. Killed summons stop production but persist.
    _summon(level, player) {
        const tpl = this.tpl;
        this.y = this.spawnY + Math.sin(this.timer / 60) * 2;
        const dx = player.x - this.x;
        this.facing = dx > 0 ? 1 : -1;
        // Don't summon while player hidden / owl-paused
        if (player.waterHidden || player.grassHidden || player.state === STATE.COVER) {
            this._noticeTargetLost();
            return;
        }
        if (this.owlPause > 0) return;
        // Track active spawned children. We tag them with _summonedBy = this
        // so we can count them quickly.
        this._spawned = (this._spawned || []).filter(e => e.alive);
        if (this._spawned.length >= tpl.summonMax) return;
        // Telegraph: bright outline pulse 30 frames before summon
        const summonPhase = this.timer % tpl.summonInterval;
        if (summonPhase >= tpl.summonInterval - 30) {
            this._telegraph = 1 - (tpl.summonInterval - summonPhase) / 30;
        }
        if (summonPhase === 0 && this.timer > 0) {
            const spawnX = this.x + (this.facing > 0 ? 16 : -16);
            const spawnY = this.y - 6;
            this._spawned.push({ x: spawnX, y: spawnY, type: tpl.summonType, alive: true });
            // Request the EnemyManager to spawn it on its next tick
            this._pendingSummon = { x: spawnX, y: spawnY, type: tpl.summonType };
            particles.shockRing(this.x + this.w / 2, this.y + this.h / 2, 14, 18, '#a0a0ff');
            audio.sfx?.('respawn');
        }
    }

    // R325: shielded walker — slow approach with a front shield that
    // blocks bullets. Shield cycles UP (240f, deflect-mode) then DOWN
    // (60f, exposed). Player needs to time shots OR flank.
    _shieldedWalk(level, player) {
        const tpl = this.tpl;
        const dx = player.x - this.x;
        this.facing = dx > 0 ? 1 : -1;
        // Approach if player is more than 24px away
        if (Math.abs(dx) > 24) {
            this.x += this.facing * tpl.speed;
        }
        // Walk frame for animation
        if (Math.abs(this.x - (this._lastWalkX || 0)) > 1) {
            this.frame = (this.frame + 0.08) % 4;
            this._lastWalkX = this.x;
        }
        // Shield cycle
        this._shieldT = (this._shieldT || 0) + 1;
        const cycleLen = tpl.shieldUpTime + tpl.shieldDownTime;
        const phaseT = this._shieldT % cycleLen;
        this.shieldUp = phaseT < tpl.shieldUpTime;
        // Falling to gravity if not on ground
        if (!this._isOnGround(level)) {
            this.y += 1.6;
        }
    }

    _isOnGround(level) {
        return level.isSolid(this.x + 2, this.y + this.h + 1) ||
               level.isSolid(this.x + this.w - 2, this.y + this.h + 1);
    }

    // Called when fire is suppressed because the player is hidden (cover or
    // water). Shows a thought bubble with a randomly-picked phrase for ~2.5s.
    // Cooldown prevents spamming the bubble every frame the player is hidden.
    _noticeTargetLost() {
        if (this._lostBubbleCooldown > 0) {
            this._lostBubbleCooldown--;
            return;
        }
        if (this._lostBubble && this._lostBubble.life > 0) return;
        const i = Math.floor(Math.random() * LOST_TARGET_LINES.length);
        this._lostBubble = { text: LOST_TARGET_LINES[i], life: 150 };
        this._lostBubbleCooldown = 240; // ~4s before this enemy bubbles again
        _lostBubblesFired++;
    }

    hurt(dmg, knockDir = 0, opts = {}) {
        this.hp -= dmg;
        this.hitFlash = 6;
        // Knockback push — SPREAD weapon and contact-hits shove the enemy back
        if (opts.knockBack) {
            this.vx = (this.vx || 0) + knockDir * opts.knockBack;
            this.knockStun = Math.max(this.knockStun || 0, opts.knockBack > 1.5 ? 10 : 6);
        }
        // Burn DOT — FLAME applies a damage-over-time tick
        if (opts.burn) {
            this.burnTimer = Math.max(this.burnTimer || 0, opts.burn);
            this.burnDPS = opts.burnDPS || 0.05;
        }
        audio.sfx('bossHit');
        if (this.hp <= 0) {
            this.alive = false;
            const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
            // Main explosion
            particles.explosion(cx, cy);
            // Dust ring — 8 small puffs radiating outward, lingers behind the
            // explosion to sell the "thing just popped" beat.
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 * i) / 8;
                particles.spawn(
                    cx, cy + this.h / 4,
                    Math.cos(a) * 1.4, Math.sin(a) * 0.5 - 0.3,
                    24 + (i & 3), '#604030', 1, 0.03
                );
            }
            // Chunky debris — 6 heavier 2px chunks arc out with strong
            // gravity and fall, using the enemy's body palette so each
            // grunt type's death reads physically distinct (folder = manila,
            // stapler = chrome, cabinet = grey, holepunch = steel-blue).
            if (this.gibPalette) particles.gibChunks(cx, cy, this.gibPalette);
            // Outward shock ring — bosses get a bigger second ring on top.
            particles.shockRing(cx, cy, this.behavior === 'boss' ? 36 : 22, 14, '#fff');
            if (this.behavior === 'boss') particles.shockRing(cx, cy, 52, 22, '#ffe070');
            audio.sfx('explode');
            return true;
        }
        return false;
    }

    _tickStatus() {
        // Burn DOT — small recurring damage with flame particle
        if (this.burnTimer > 0) {
            this.burnTimer--;
            this.hp -= this.burnDPS || 0.05;
            if (this.burnTimer % 6 === 0) {
                particles.spawn(
                    this.x + Math.random() * this.w,
                    this.y + Math.random() * (this.h / 2),
                    (Math.random() - 0.5) * 0.4, -0.6 - Math.random() * 0.4,
                    14 + Math.random() * 4, '#ff8050', 1, -0.04
                );
            }
            if (this.hp <= 0) {
                this.alive = false;
                const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
                particles.explosion(cx, cy);
                if (this.gibPalette) particles.gibChunks(cx, cy, this.gibPalette);
                particles.shockRing(cx, cy, 22, 14, '#ff8050');
                audio.sfx('explode');
            }
        }
        // Knock stun — block AI updates briefly
        if (this.knockStun > 0) this.knockStun--;
    }

    intersects(box) {
        return this.x < box.x + box.w && this.x + this.w > box.x &&
               this.y < box.y + box.h && this.y + this.h > box.y;
    }

    draw(ctx, camera) {
        // Ground-contact drop shadow under non-flying grunts. Skipped for
        // hover_sniper since they float. Same trick as the player — anchors
        // the sprite to the painted floor instead of floating on top.
        if (this.behavior !== 'hover_sniper') {
            const shY = Math.round(this.y + this.h - 1 - camera.viewY);
            const shCX = Math.round(this.x + this.w / 2 - camera.viewX);
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.38)';
            ctx.beginPath();
            ctx.ellipse(shCX, shY, this.w * 0.55, 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Pick frame: attack (charge wind-up / hop / sniper telegraph),
        // hurt (recent damage), or base. Falls back gracefully if variant missing.
        const dyingShortly = this.hp <= 1 && this.maxHp > 2;
        const attackPose = (this.behavior === 'charge' && this.subState === 1)
                        || (this.behavior === 'hover_sniper' && this.subTimer > 0)
                        || (this.behavior === 'hop' && this.vy < -1);
        let useSprite = this.sprite;
        // R346: shielder swap — painted 'shielder' sprite has the shield
        // baked in. When shieldDown (the 60-frame exposed window), swap
        // to 'cabinet' so the body is visibly without a shield. Gives
        // the player a clear shoot-now signal.
        if (this.behavior === 'shielded_walk' && !this.shieldUp && sprites.has('cabinet')) {
            useSprite = 'cabinet';
        }
        if (dyingShortly) {
            // Prefer painted _death pose for the final hp tick so the kill
            // stroke reads as a real beat. Falls back to _hurt then base.
            const d = this.sprite + '_death';
            const h = this.sprite + '_hurt';
            if (sprites.has(d)) useSprite = d;
            else if (sprites.has(h)) useSprite = h;
        } else if (this.hitFlash > 4) {
            const v = this.sprite + '_hurt';
            if (sprites.has(v)) useSprite = v;
        } else if (attackPose) {
            const v = this.sprite + '_attack';
            if (sprites.has(v)) useSprite = v;
        } else if (this.behavior === 'charge'
                || this.behavior === 'hover_sniper'
                || (this.behavior === 'hop' && Math.abs(this.vx) > 0.1)
                || (this.behavior === 'patrol' && Math.abs(this.vx) > 0.1)) {
            // _walk sprite plays during any locomotion state. hover_sniper
            // is always in flight; hop/patrol read as walking only while
            // actually moving (a paused stapler is "idle", not "walking").
            const v = this.sprite + '_walk';
            if (sprites.has(v)) useSprite = v;
        }
        const dims = getSpriteDims(useSprite);
        const dx = Math.round(this.x + this.w / 2 - dims.w / 2 - camera.viewX);
        let dy = Math.round(this.y + this.h - dims.h - camera.viewY);
        // Idle-breath bob — sub-pixel sine that resolves to a 0/-1 step so
        // the silhouette isn't pixel-locked between behavior beats. Skip
        // while hurt/charging/attacking (those states have their own motion)
        // and for flying enemies (already animated by hover_sniper math).
        const calmState = this.hitFlash === 0
            && this.knockStun === 0
            && this.behavior !== 'hover_sniper'
            && this.subState !== 1
            && Math.abs(this.vx || 0) < 0.2
            && Math.abs(this.vy || 0) < 0.2;
        if (calmState) {
            const bob = Math.sin(this.timer * 0.05 + this._breathPhase) > 0.5 ? -1 : 0;
            dy += bob;
        }
        // R240: chainsaw shake — _shakeTimer is refreshed each frame the
        // saw is grinding the enemy (see player._tickChainsaw). Random ±1px
        // offset both axes while active. Tick happens here instead of in
        // update() so the shake reads even during the chainsaw's per-frame
        // attack window when other state updates may be gated by stun.
        let shakeDX = 0, shakeDY = 0;
        if ((this._shakeTimer || 0) > 0) {
            shakeDX = ((Math.random() * 2) | 0) - 1;
            shakeDY = ((Math.random() * 2) | 0) - 1;
            this._shakeTimer--;
        }
        // Always draw the base sprite first so the silhouette stays
        // continuously visible against painted bgs (the old alternate-
        // frame skip read as a broken sprite). Add a 'lighter' white wash
        // on top while hitFlash is active for a steady "took damage" flash.
        drawEnemyFrame(ctx, useSprite, dx + shakeDX, dy + shakeDY, this.facing > 0);
        if (this.hitFlash > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const a = Math.min(1, this.hitFlash / 6);
            ctx.globalAlpha = 0.6 * a;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            // R240: flash clip rect tracks the shake offset so the white
            // wash stays anchored to the shaking silhouette.
            ctx.rect(dx + shakeDX - 1, dy + shakeDY - 1, dims.w + 2, dims.h + 2);
            ctx.clip();
            // Use source-atop relative to the sprite already drawn so the
            // wash only paints onto its pixels. Switch to source-atop AFTER
            // setting the clip, otherwise the lighter-mode fill would also
            // affect the background within the clip rect.
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillRect(dx + shakeDX - 1, dy + shakeDY - 1, dims.w + 2, dims.h + 2);
            ctx.restore();
        }
        // Imminent-death danger pulse: 1-px red corner ticks on tougher
        // enemies (maxHp > 2) when down to 1 HP. Lets the player read
        // "one more shot kills this guy" without needing a HP bar. Skip
        // during hit-flash so the flash isn't muddied.
        if (dyingShortly && this.hitFlash === 0) {
            const pulse = 0.45 + Math.sin(this.timer * 0.35) * 0.35;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#ff3030';
            // 1-px tick at each corner of the sprite bbox
            ctx.fillRect(dx - 1, dy - 1, 2, 1); ctx.fillRect(dx - 1, dy - 1, 1, 2);
            ctx.fillRect(dx + dims.w - 1, dy - 1, 2, 1); ctx.fillRect(dx + dims.w, dy - 1, 1, 2);
            ctx.fillRect(dx - 1, dy + dims.h, 2, 1); ctx.fillRect(dx - 1, dy + dims.h - 1, 1, 2);
            ctx.fillRect(dx + dims.w - 1, dy + dims.h, 2, 1); ctx.fillRect(dx + dims.w, dy + dims.h - 1, 1, 2);
            ctx.restore();
        }
        // Owl-pause cue: small "!" floating above enemy head — distracted
        if (this.owlPause > 0) {
            const px = dx + this.w / 2;
            const py = dy - 6 + Math.sin(this.timer * 0.3) * 1;
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(Math.round(px), Math.round(py), 1, 3);
            ctx.fillRect(Math.round(px), Math.round(py + 4), 1, 1);
        }
        // Knock-stun cue: tiny stars circle the head
        if (this.knockStun > 0) {
            const px = dx + this.w / 2;
            const py = dy - 2;
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 3; i++) {
                const a = this.timer * 0.2 + i * (Math.PI * 2 / 3);
                ctx.fillRect(Math.round(px + Math.cos(a) * 4), Math.round(py + Math.sin(a) * 2), 1, 1);
            }
        }
        // Charge tell: red flash on cabinet wind-up
        if (this.behavior === 'charge' && this.subState === 1) {
            const t = this.subTimer % 8;
            if (t < 4) {
                ctx.fillStyle = '#ff5050';
                ctx.fillRect(dx, dy - 4, this.w, 2);
            }
        }
        // Stunned visual — 3 yellow stars orbiting above the enemy's head.
        // Reads from across the screen as "this one is helpless, finish it".
        if ((this._stunTimer || 0) > 0) {
            const cx = dx + this.w / 2;
            const cy = dy - 4;
            const t = this.timer * 0.18;
            for (let i = 0; i < 3; i++) {
                const a = t + (i / 3) * Math.PI * 2;
                const sx = cx + Math.cos(a) * 7;
                const sy = cy + Math.sin(a) * 2.5;
                // Star: 3x3 cross with dark center
                ctx.fillStyle = '#1a0810';
                ctx.fillRect(sx - 2, sy - 1, 5, 3);
                ctx.fillRect(sx - 1, sy - 2, 3, 5);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(sx - 1, sy, 3, 1);
                ctx.fillRect(sx, sy - 1, 1, 3);
                ctx.fillStyle = '#fff8c8';
                ctx.fillRect(sx, sy, 1, 1);
            }
        }
        // Pre-fire muzzle telegraph — glowing red dot at enemy center
        // along the aim direction, intensifying over the last 8 frames before
        // the shot. Gives the player time to dodge instead of bullets
        // appearing instantly from a still sprite.
        if (this._preFire > 0) {
            const cx = dx + this.w / 2;
            const cy = dy + this.h / 2;
            const ax = this._preFireDx || 0;
            const ay = this._preFireDy || 0;
            // Glow site: 5px out along aim
            const gx = cx + ax * 5;
            const gy = cy + ay * 5;
            ctx.save();
            ctx.globalAlpha = 0.4 + this._preFire * 0.5;
            // Outer warning red
            ctx.fillStyle = '#ff3030';
            const r = 2 + this._preFire * 2;
            ctx.beginPath();
            ctx.arc(gx, gy, r, 0, Math.PI * 2);
            ctx.fill();
            // Hot core
            ctx.globalAlpha = 0.6 + this._preFire * 0.4;
            ctx.fillStyle = '#ffe070';
            ctx.beginPath();
            ctx.arc(gx, gy, Math.max(0.5, r - 1.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // Alert "!" bubble — fires on first activation. Telegraphs that this
        // enemy has spotted the player so off-camera threats don't surprise.
        if (this._alertBubble && this._alertBubble > 0) {
            const bx = dx + this.w / 2;
            const by = dy - 12;
            const t = this._alertBubble;
            // First 8 frames pop in, last 8 frames fade out
            const popIn = Math.min(1, (40 - t) / 8);
            const fade = Math.min(1, t / 8);
            ctx.globalAlpha = Math.min(popIn, fade);
            // Drop-shadow + red exclamation block
            ctx.fillStyle = '#1a0810';
            ctx.fillRect(bx - 3, by - 6, 6, 9);
            ctx.fillStyle = '#ff4040';
            ctx.fillRect(bx - 2, by - 6, 4, 5);
            ctx.fillRect(bx - 1, by + 1, 2, 2);
            // Bright top highlight
            ctx.fillStyle = '#ffd0d0';
            ctx.fillRect(bx - 1, by - 5, 1, 2);
            ctx.globalAlpha = 1;
            this._alertBubble--;
        }
        // Thought bubble — "where did he go?" when the player is hidden.
        // _lostBubble is set by _noticeTargetLost(); fades over 120 frames so
        // a brief hide-and-pop doesn't leave the bubble stuck on screen.
        if (this._lostBubble && this._lostBubble.life > 0) {
            let bx = dx + this.w / 2;
            const by = dy - 14;
            const fade = Math.min(1, this._lostBubble.life / 30);
            ctx.globalAlpha = fade;
            const text = this._lostBubble.text;
            // Pixel font: each char advances (CHAR_W=5)+(SPACING=1)=6px, last
            // char has no trailing spacing → text width = len*6 - 1. Add 6px
            // horizontal padding so the text doesn't touch the bubble edge.
            const textW = Math.max(0, text.length * 6 - 1);
            const w = Math.max(24, textW + 6);
            // Clamp bubble center so it doesn't clip past the canvas edges.
            // Speech-bubble tail still anchors to the enemy when possible.
            const halfW = w / 2;
            const clampedBx = Math.max(halfW + 2, Math.min(GAME.W - halfW - 2, bx));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.fillRect(clampedBx - halfW, by - 3, w, 9);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(clampedBx - halfW, by - 3, w, 1);
            ctx.fillRect(clampedBx - halfW, by + 5, w, 1);
            // Speech-bubble tail — point toward the enemy x even if bubble
            // was nudged inward to fit. Tail x is clamped to bubble bounds.
            const tailX = Math.max(clampedBx - halfW + 2, Math.min(clampedBx + halfW - 2, bx));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.fillRect(tailX - 1, by + 6, 2, 1);
            ctx.fillRect(tailX, by + 7, 1, 1);
            drawText(ctx, text, clampedBx, by - 1, '#1a0820', 1, 'center');
            ctx.globalAlpha = 1;
            this._lostBubble.life--;
        }
        // Sniper telegraph — laser dot at aim point, intensifying as fire approaches
        if (this.behavior === 'hover_sniper' && this.subTimer > 0 && this._aimX != null) {
            const cx = dx + this.w / 2;
            const cy = dy + this.h / 2;
            const ax = Math.round(this._aimX - camera.viewX);
            const ay = Math.round(this._aimY - camera.viewY);
            const t = 1 - (this.subTimer / this.tpl.beamCharge);
            // Aim line: faint → bright
            ctx.globalAlpha = 0.15 + t * 0.45;
            ctx.strokeStyle = '#ff5050';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.stroke();
            // Pulsing target dot
            ctx.globalAlpha = 0.4 + Math.sin(this.timer * 0.5) * 0.3 + t * 0.3;
            ctx.fillStyle = '#ff5050';
            const dotR = 2 + Math.round(t * 3);
            ctx.fillRect(ax - dotR, ay - 1, dotR * 2, 2);
            ctx.fillRect(ax - 1, ay - dotR, 2, dotR * 2);
            ctx.globalAlpha = 1;
        }
        // R325 + R346: shielder front-shield overlay. The R346 painted
        // 'shielder' sprite has the shield baked in; only draw the
        // procedural overlay as a fallback when the painted asset is
        // missing.
        if (this.behavior === 'shielded_walk' && this.shieldUp && !sprites.has('shielder')) {
            const sW = this.tpl.shieldW || 12;
            const sH = this.tpl.shieldH || 16;
            const sX = Math.round(((this.facing > 0) ? this.x + this.w : this.x - sW) - camera.viewX);
            const sY = Math.round(this.y + 2 - camera.viewY);
            ctx.save();
            // Dark body
            ctx.fillStyle = '#2a3038';
            ctx.fillRect(sX, sY, sW, sH);
            // Bright metallic edge facing the player
            ctx.fillStyle = '#a0a8b8';
            const edgeX = (this.facing > 0) ? sX + sW - 1 : sX;
            ctx.fillRect(edgeX, sY, 1, sH);
            // Bolts
            ctx.fillStyle = '#404048';
            ctx.fillRect(sX + 2, sY + 2, 1, 1);
            ctx.fillRect(sX + 2, sY + sH - 3, 1, 1);
            ctx.fillRect(sX + sW - 3, sY + 2, 1, 1);
            ctx.fillRect(sX + sW - 3, sY + sH - 3, 1, 1);
            // Cross-hatch ridges for depth
            ctx.fillStyle = '#404048';
            for (let i = 4; i < sH - 4; i += 4) {
                ctx.fillRect(sX + 1, sY + i, sW - 2, 1);
            }
            ctx.restore();
        }
        // R325: dive-bomber commit-flash. When the bomber commits to a
        // dive, it briefly outlines bright orange so the player gets a
        // visual telegraph beat (already has audio cue from bossChargeTell).
        if (this.behavior === 'dive_bomb' && this._dived && this._telegraph > 0) {
            this._telegraph -= 0.08;
            const bx = Math.round(this.x - camera.viewX) - 1;
            const by = Math.round(this.y - camera.viewY) - 1;
            ctx.save();
            ctx.globalAlpha = Math.max(0, this._telegraph);
            ctx.strokeStyle = '#ffaa50';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx + 0.5, by + 0.5, this.w + 1, this.h + 1);
            ctx.restore();
        }
    }
}

// Boss base. Specific bosses subclass and override _patterns().
class Boss extends Enemy {
    constructor(x, y, kind) {
        const tpl = BOSS_TEMPLATES[kind];
        super(x, y, 'cabinet');
        this.kind = kind;
        this.w = tpl.w; this.h = tpl.h;
        this.hp = tpl.hp; this.maxHp = tpl.hp;
        this.score = tpl.score;
        this.contactDmg = tpl.contactDmg;
        this.phase = 1;
        this.tagline = tpl.tagline;
        this.name = tpl.name;
        this.color = tpl.color;
        this.sprite = tpl.sprite || 'cabinet';
        this.behavior = 'boss';
        this.attackIndex = 0;
        this.attackTimer = 120; // brief intro before first attack
        this.subState = 0;
        // R231: patrol anchor. Bosses oscillate around their spawn x so
        // they don't feel like statues. The arena is a ±PATROL_RANGE
        // window around this anchor — boss never drifts past that even
        // chasing the player, so it stays in the visible camera frame.
        this._anchorX = x + tpl.w / 2;
        this._patrolPhase = 0;
        // Per-boss patrol style. Some bosses suit a slow sweep, some
        // suit a snappy track-the-player pursuit, some hop in place.
        // Encoded as a hint on the template (movement: 'sweep'|'pursue'|
        // 'hop'|'flyby'|'static'). Defaults to 'sweep' for legacy bosses.
        this._movement = tpl.movement || 'sweep';
        // Movement speed multiplier — phase 2 enrage doubles it.
        this._moveSpeed = tpl.moveSpeed || 0.5;
    }

    update(level, player) {
        this.timer++;
        if (this.hitFlash > 0) this.hitFlash--;
        // Gravity if grounded boss
        if (BOSS_TEMPLATES[this.kind].grounded) {
            this.vy += GAME.GRAVITY * 0.5;
            const yRes = level.moveY(this, this.vy, true, this.vy);
            this.y = yRes.y; if (yRes.hit && yRes.landed) this.vy = 0;
        }
        // R232: PATROL MOVEMENT. Every boss visibly moves around its arena
        // anchor so the fight reads as dynamic. Camera does followBossArena
        // now (biases toward player↔boss midpoint), so we can give bosses a
        // wider patrol — they stay framed because the camera follows. Phase 2
        // boosts speed. Hop bosses get their own kinematic logic below.
        const PATROL_RANGE = 72;
        const speedMul = this.phase === 2 ? 1.6 : 1.0;
        const baseSpeed = this._moveSpeed * speedMul;
        const cx = this.x + this.w / 2;
        const playerCX = player ? player.x + player.w / 2 : cx;
        let desiredVX = 0;
        if (this._movement === 'sweep') {
            // Sinusoidal sweep around anchor. Slow, predictable, telegraphs
            // the boss's position so the player can plan jumps.
            this._patrolPhase += 0.018 * speedMul;
            const target = this._anchorX + Math.sin(this._patrolPhase) * PATROL_RANGE;
            desiredVX = (target - cx) * 0.08;
        } else if (this._movement === 'pursue') {
            // Track the player but clamped to anchor ± PATROL_RANGE so it
            // can't chase Clippy off-screen. Active pursuit reads as menace.
            const clampedTarget = Math.max(this._anchorX - PATROL_RANGE,
                                            Math.min(this._anchorX + PATROL_RANGE, playerCX));
            desiredVX = Math.sign(clampedTarget - cx) * baseSpeed;
            // Stop micro-jittering when basically on target
            if (Math.abs(clampedTarget - cx) < 4) desiredVX = 0;
        } else if (this._movement === 'hop') {
            // Hops in place — when grounded, leap toward player, capped to
            // the patrol window. Adds vertical menace too.
            this._patrolPhase++;
            if (this.vy === 0 && this._patrolPhase % 90 === 0) {
                const target = Math.max(this._anchorX - PATROL_RANGE,
                                        Math.min(this._anchorX + PATROL_RANGE, playerCX));
                this.vx = Math.sign(target - cx) * baseSpeed * 2.2;
                this.vy = -3.2;
            }
            // Friction so the hop lands and stops
            this.vx *= 0.96;
            desiredVX = this.vx;
        } else if (this._movement === 'flyby') {
            // Floating boss — sweeps wider and higher. Used for airborne
            // / non-grounded kinds like ALGORITHM.
            this._patrolPhase += 0.024 * speedMul;
            const target = this._anchorX + Math.sin(this._patrolPhase) * (PATROL_RANGE + 16);
            desiredVX = (target - cx) * 0.10;
            // gentle vertical bob
            const baseY = (this._anchorY ||= this.y);
            this.y = baseY + Math.sin(this._patrolPhase * 1.4) * 8;
        } else if (this._movement === 'chase') {
            // R357: helicopter is CHASING the player — it sits BEHIND
            // by ~80 px (looming threat from over the shoulder) and
            // periodically swoops forward to overtake + corner. Player
            // runs right; chopper closes the gap. Vertical altitude
            // tracks ~70 px above the player so the silhouette dominates
            // the upper half of the screen.
            this._patrolPhase += 0.06 * speedMul;
            // Chase cycle: 4 seconds menacing-behind, 1.5 second swoop-ahead,
            // then loop. Sells "it's about to catch you" without making
            // the player's run-right rhythm impossible.
            this._chaseCycle = ((this._chaseCycle || 0) + 1) % 330;
            const swooping = this._chaseCycle > 240;
            const lead = swooping ? +80 : -100;
            const desiredX = playerCX + lead;
            // R361/R363: altitude target tracks the chopper size. At
            // 200x96, target Y = player.y - 130 keeps the chopper
            // silhouette sitting just above the player's head, dominating
            // the upper half of the playfield SNES-Contra style.
            const desiredY = (player.y - 130) + Math.sin(this._patrolPhase) * 18;
            desiredVX = (desiredX - cx) * (swooping ? 0.10 : 0.05);
            // Vertical lerp toward desiredY — no gravity (it flies)
            this.y += (desiredY - this.y) * 0.05;
            // R334: rotor WHUP loop — emit a short thump every ~7 frames
            // (≈8.5 Hz) so the chopper is constantly audible while alive.
            this._chopperT = (this._chopperT || 0) + 1;
            if (this._chopperT % 7 === 0) {
                audio.sfx?.('chopper');
            }
        }
        // 'static' bosses skip patrol entirely (use case: bosses whose
        // pattern is "stand and chuck projectiles" by design).
        if (this._movement !== 'static' && this._movement !== 'hop') {
            const xRes = level.moveX(this, desiredVX);
            this.x = xRes.x;
            if (xRes.hit) {
                // Bounced off a wall — flip sweep direction so we don't
                // grind against geometry forever.
                if (this._movement === 'sweep' || this._movement === 'flyby') {
                    this._patrolPhase += Math.PI;
                }
            }
        } else if (this._movement === 'hop') {
            const xRes = level.moveX(this, this.vx);
            this.x = xRes.x;
            if (xRes.hit) this.vx = 0;
        }
        // Update facing so the sprite + attacks aim at the player.
        if (player) this.facing = playerCX < cx ? -1 : 1;
        // Phase 2 at half hp — boss enrages: explosion FX, brief invuln-ish
        // pause, screen shake, "RAGE" floating label, and an extended hitFlash
        // so the player can read the threshold beat clearly.
        // Mini-boss guard cycle: every ~3s a 24-frame guard window opens.
        // While guardActive, incoming player bullets get deflected and the
        // boss flashes a blue arc tell. Telegraph: 12-frame "winding up"
        // pre-flash so it doesn't feel cheap.
        if (this.isMini) {
            const wasGuardActive = this._guardActive;
            this._guardCycle = (this._guardCycle | 0) + 1;
            const cycleLen = 180; // 3s at 60Hz
            const c = this._guardCycle % cycleLen;
            // Pre-flash 12f, guard 24f, then idle for the rest of the cycle.
            this._guardTell = (c >= cycleLen - 36 && c < cycleLen - 24);
            this._guardActive = (c >= cycleLen - 24 && c < cycleLen);
            // Reset parry-count cap when the guard window re-opens. Without
            // this, _parryCount would persist forever and after 2 lifetime
            // parries the guard would never reflect again.
            if (this._guardActive && !wasGuardActive) this._parryCount = 0;
        }

        // R348: _noPhase2 caps the boss to phase 1 forever — used by mini
        // bosses so they never unlock the phase-2 advanced attack variants.
        if (this.phase === 1 && this.hp <= this.maxHp / 2 && !this._noPhase2) {
            this.phase = 2;
            this.attackTimer = 60;
            this.hitFlash = 18;
            audio.sfx('explode');
            audio.sfx('bossHit');
            particles.explosion(this.x + this.w / 2, this.y + this.h / 2);
            particles.floatingText(
                this.x + this.w / 2,
                this.y - 4,
                'RAGE',
                '#ff5050', 70, -0.5, 2
            );
            // Phase-2 bark — boss-specific catchphrase, slightly delayed so it
            // doesn't overlap the RAGE label.
            const barks = BOSS_TEMPLATES[this.kind].barks;
            if (barks?.phase2) {
                this._pendingBark = { text: barks.phase2, delay: 28, color: '#ffe060' };
            }
            // Telegraph the rage to the player via camera shake
            player.requestShake = Math.max(player.requestShake || 0, 5);
        }
        // Drain the pending-bark delay so the bark lands AFTER the RAGE label.
        if (this._pendingBark) {
            this._pendingBark.delay--;
            if (this._pendingBark.delay <= 0) {
                particles.floatingText(
                    this.x + this.w / 2, this.y - 14,
                    this._pendingBark.text, this._pendingBark.color,
                    90, -0.35, 1,
                );
                this._pendingBark = null;
            }
        }
        // Periodic taunt — every ~5s, pick a random taunt line and float it
        // over the boss's head. Quiet during the first 90 frames so the entrance
        // beats can land cleanly.
        const tpl = BOSS_TEMPLATES[this.kind];
        if (tpl.barks?.taunt && this.timer > 90 && this.timer % 300 === 0) {
            const lines = tpl.barks.taunt;
            const line = lines[(this.timer / 300 | 0) % lines.length];
            particles.floatingText(
                this.x + this.w / 2, this.y - 8,
                line, this.phase === 2 ? '#ff8060' : '#e0e0ff',
                75, -0.3, 1,
            );
        }
        // R220: contextual barks. lowHp fires ONCE when the boss drops
        // below 30% — a "you're winning, I notice" beat. Tinted red and
        // brighter than the periodic taunts so it lands as different.
        if (tpl.barks?.lowHp && !this._lowHpBarkFired && this.hp <= this.maxHp * 0.3) {
            this._lowHpBarkFired = true;
            particles.floatingText(
                this.x + this.w / 2, this.y - 8,
                tpl.barks.lowHp, '#ff5050', 110, -0.4, 1,
            );
        }
        // Pattern execution + telegraph. Last 8 frames before the pattern
        // fires, ramp _telegraph from 0 → 1 so the draw can paint a brief
        // bright outline pulse. Fair-warning beat that also sells the AI
        // making a decision.
        this.attackTimer--;
        if (this.attackTimer > 0 && this.attackTimer <= 8) {
            this._telegraph = 1 - (this.attackTimer / 8);
        } else {
            this._telegraph = 0;
        }
        // Spatial telegraph — at the start of a 30-frame warning, spawn
        // a contracting ring that follows the boss. Player reads the
        // shrinking ring as "incoming." Phase-2 gets a tighter red ring.
        if (this.attackTimer === 30) {
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            const startR = Math.max(this.w, this.h) * 0.9 + 8;
            const color = this.phase === 2 ? '#ff3030' : '#ff8030';
            particles.chargeRing(cx, cy, startR, 30, color, this);
            audio.sfx?.('bossChargeTell');
        }
        // R325: tick hazard zones (SHREDDER Shred Field, etc.).
        if (this.hazards && this.hazards.length) {
            for (let i = this.hazards.length - 1; i >= 0; i--) {
                const h = this.hazards[i];
                h.life--;
                if (h.warning > 0) h.warning--;
                if (h.life <= 0) {
                    this.hazards.splice(i, 1);
                    continue;
                }
                // Damage player ONLY when warning is over (active phase).
                if (h.warning <= 0 && h.kind === 'shred') {
                    if (player.x < h.x + h.w && player.x + player.w > h.x &&
                        player.y < h.y + h.h && player.y + player.h > h.y) {
                        if ((player.iFrames || 0) <= 0) {
                            player.hurt(1, player.vx > 0 ? -1 : 1);
                        }
                    }
                }
            }
        }
        if (this.attackTimer <= 0) {
            this._runPattern(level, player);
        }
    }

    _runPattern(level, player) {
        const dx = player.x - (this.x + this.w / 2);
        const aim = dx > 0 ? 1 : -1;
        const fan = this.phase === 2 ? 7 : 5;
        const speed = 1.6 + (this.phase === 2 ? 0.6 : 0);
        // R348: mini-bosses only fire pattern variant 0 — they're limited
        // to the basic attack so the main boss feels genuinely scarier.
        // Pin attackIndex to a multiple of every modulus the patterns use
        // (lcm of 2, 3, 4 = 12) — guarantees `attackIndex % N === 0`.
        if (this._miniAttackOnly) this.attackIndex = 0;

        // R232: helper — aimed shot DIRECTLY at the player. Used by most
        // bosses as a third "punisher" variant when the player tries to
        // stand still and chip-shoot from a corner.
        const aimed = (vx, vy, count = 1, spread = 0) => {
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            const tdx = (player.x + player.w / 2) - cx;
            const tdy = (player.y + player.h / 2) - cy;
            const mag = Math.max(1, Math.sqrt(tdx * tdx + tdy * tdy));
            const baseA = Math.atan2(tdy, tdx);
            const out = [];
            for (let i = 0; i < count; i++) {
                const a = baseA + (count > 1 ? ((i - (count - 1) / 2) / count) * spread : 0);
                out.push({ vx: Math.cos(a) * (vx || speed), vy: Math.sin(a) * (vx || speed) });
            }
            return { cx, cy, shots: out };
        };

        switch (this.kind) {
            case 'COPIER_3000':
                // R325: 3-variant cycle in phase 1, 4-variant in phase 2 (adds
                // Paper Cyclone — 360° radial spray with ricochet). Modulo
                // expands so the cyclone shows up roughly every 4th attack
                // once the boss is in phase 2.
                {
                    const mod = (this.phase === 2) ? 4 : 3;
                    const variant = this.attackIndex % mod;
                    if (variant === 0) {
                        // Horizontal paper line, fast
                        for (let i = -1; i <= 1; i++) {
                            const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2 + i * 6, aim * speed * 1.4, 0, 1);
                            b.color = '#f0f0e0';
                            globalEnemyBullets.push(b);
                        }
                    } else if (variant === 1) {
                        // Ink rain from above
                        for (let i = 0; i < 5 + this.phase * 2; i++) {
                            const bx = this.x + (i - 2) * 16 + (Math.random() - 0.5) * 12;
                            const b = new Bullet(bx, this.y - 10, 0, 1.4, 1);
                            b.color = '#1a1a1a';
                            globalEnemyBullets.push(b);
                        }
                    } else if (variant === 2) {
                        // R232: aimed staple-burst — 5 shots aimed AT player.
                        const { cx, cy, shots } = aimed(speed * 1.2, 0, 5, 0.5);
                        for (const s of shots) {
                            const b = new Bullet(cx, cy, s.vx, s.vy, 1);
                            b.color = '#c0c0d0';
                            globalEnemyBullets.push(b);
                        }
                    } else {
                        // R325: PAPER CYCLONE — 360° radial spray of 8 paper
                        // pages. Each ricochets ONCE off a wall before
                        // expiring (handled in Bullet.update via bouncesLeft).
                        // Phase-2 only.
                        const cx = this.x + this.w / 2;
                        const cy = this.y + this.h / 2;
                        for (let i = 0; i < 8; i++) {
                            const a = (i / 8) * Math.PI * 2;
                            const b = new Bullet(cx, cy,
                                Math.cos(a) * speed * 1.1,
                                Math.sin(a) * speed * 1.1, 1);
                            b.color = '#f0f0e0';
                            b.bouncesLeft = 1;   // ricochet 1× off walls
                            globalEnemyBullets.push(b);
                        }
                    }
                }
                break;
            case 'SHREDDER':
                // R325: 3 variants in phase 1; phase 2 cycles 4 including
                // SHRED FIELD — a 3-tile-wide hazard strip on the floor
                // that whirls for 90 frames, damaging the player inside it.
                {
                    const mod = (this.phase === 2) ? 4 : 3;
                    const variant = this.attackIndex % mod;
                    if (variant === 0) {
                        for (let i = 0; i < fan; i++) {
                            const a = ((i - (fan - 1) / 2) / fan) * 1.4 + (aim < 0 ? Math.PI : 0);
                            const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed, Math.sin(a) * speed * 0.6, 1);
                            b.color = '#d8b890';
                            globalEnemyBullets.push(b);
                        }
                    } else if (variant === 1) {
                        // R232: paper-strip sweep — rotating wave that traces an arc
                        for (let i = 0; i < 7; i++) {
                            const a = (-0.6 + (i / 6) * 1.2) + (aim < 0 ? Math.PI : 0);
                            const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2,
                                Math.cos(a) * speed * 0.9, Math.sin(a) * speed * 0.9, 1);
                            b.color = '#e8c8a0';
                            globalEnemyBullets.push(b);
                        }
                    } else if (variant === 2) {
                        // R232: aimed claw-rake — 3-shot tight burst at player
                        const { cx, cy, shots } = aimed(speed * 1.4, 0, 3, 0.2);
                        for (const s of shots) {
                            const b = new Bullet(cx, cy, s.vx, s.vy, 1);
                            b.color = '#b89060';
                            globalEnemyBullets.push(b);
                        }
                    } else {
                        // R325: SHRED FIELD — 3-tile wide hazard strip on the
                        // floor near the player. 30-frame warning blink, then
                        // 60 frames of whirling blades that damage on contact.
                        const T = 16;
                        const px = player.x + player.w / 2;
                        const stripX = Math.floor(px / T) * T - T;   // 3-tile-wide centered on player tile
                        const stripY = player.y + player.h + 2;
                        if (!this.hazards) this.hazards = [];
                        this.hazards.push({
                            kind: 'shred',
                            x: stripX, y: stripY,
                            w: T * 3, h: 8,
                            life: 90,            // total lifetime (30 warning + 60 active)
                            warning: 30,         // frames remaining as warning blink
                        });
                    }
                }
                break;
            case 'CTRL_ALT_DEL':
                // 3-variant: BSOD zigzag, error-popup ring, aimed crash.
                if (this.attackIndex % 3 === 0) {
                    for (let i = 0; i < 3; i++) {
                        const b = new Bullet(this.x + this.w / 2, this.y + 8 + i * 10, aim * speed, Math.sin(this.timer / 10 + i) * 1.2, 1);
                        b.color = '#4080c0';
                        globalEnemyBullets.push(b);
                    }
                } else if (this.attackIndex % 3 === 1) {
                    // R232: error-popup ring — 6 popups radiate out
                    for (let i = 0; i < 6; i++) {
                        const a = (i / 6) * Math.PI * 2 + this.timer / 50;
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2,
                            Math.cos(a) * speed * 0.8, Math.sin(a) * speed * 0.8, 1);
                        b.color = '#6090e0';
                        globalEnemyBullets.push(b);
                    }
                } else {
                    // R232: aimed crash-bullet — heavy aimed shot
                    const { cx, cy, shots } = aimed(speed * 1.3, 0, 1);
                    const b = new Bullet(cx, cy, shots[0].vx, shots[0].vy, 2);
                    b.color = '#3060b0';
                    globalEnemyBullets.push(b);
                }
                break;
            case 'BALLMER':
                // 3-variant: chair throw + sweat, ground stomp wave, aimed roar.
                if (this.attackIndex % 3 === 0) {
                    const chair = new Bullet(this.x + this.w / 2, this.y + 6, aim * speed * 1.2, -1.6, 2);
                    chair.color = '#806040';
                    globalEnemyBullets.push(chair);
                    if (this.phase === 2) {
                        for (let i = -3; i <= 3; i++) {
                            const b = new Bullet(this.x + this.w / 2 + i * 8, this.y - 6, i * 0.3, 1.4, 1);
                            b.color = '#80c8ff';
                            globalEnemyBullets.push(b);
                        }
                    }
                } else if (this.attackIndex % 3 === 1) {
                    // R232: ground stomp wave — 2 shockwave shots out from feet
                    const cy = this.y + this.h - 4;
                    for (const dir of [-1, 1]) {
                        const b = new Bullet(this.x + this.w / 2, cy, dir * speed * 1.1, 0, 1);
                        b.color = '#a05030';
                        b._wave = true;
                        globalEnemyBullets.push(b);
                    }
                } else {
                    // R232: aimed roar — 7-shot wide spread at player
                    const { cx, cy, shots } = aimed(speed, 0, 7, 0.9);
                    for (const s of shots) {
                        const b = new Bullet(cx, cy, s.vx, s.vy, 1);
                        b.color = '#d0a060';
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'GATES':
                // R325: 3 variants in phase 1; phase 2 cycles 4 including the
                // FLOPPY RAIN — 6 light-homing floppies fall from above with
                // light horizontal drift toward the player.
                {
                    const mod = (this.phase === 2) ? 4 : 3;
                    const variant = this.attackIndex % mod;
                    if (variant === 0) {
                        for (let i = 0; i < 4; i++) {
                            const a = (i / 4) * Math.PI * 2 + this.timer / 30;
                            const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed, Math.sin(a) * speed, 1);
                            b.color = '#80c0ff';
                            globalEnemyBullets.push(b);
                        }
                    } else if (variant === 1) {
                        // R232: blade-laser — fast horizontal pair at two heights
                        for (const yOff of [-12, 12]) {
                            const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2 + yOff,
                                aim * speed * 1.8, 0, 1);
                            b.color = '#a0d0ff';
                            globalEnemyBullets.push(b);
                        }
                    } else if (variant === 2) {
                        // R232: aimed lance — heavy aimed shot at player
                        const { cx, cy, shots } = aimed(speed * 1.5, 0, 1);
                        const b = new Bullet(cx, cy, shots[0].vx, shots[0].vy, 2);
                        b.color = '#4090e0';
                        globalEnemyBullets.push(b);
                    } else {
                        // R325: FLOPPY RAIN — 6 floppies spawn off-screen above
                        // the arena and rain down with slight horizontal drift
                        // toward the player. Phase-2 only. Color reads as
                        // floppy-disk grey (#202028).
                        const playerCx = player.x + player.w / 2;
                        for (let i = 0; i < 6; i++) {
                            // Spawn position: spread evenly across a 220-wide
                            // band centered on the boss's x.
                            const bx = this.x + this.w / 2 + (i - 2.5) * 36;
                            const by = this.y - 40 - Math.random() * 12;
                            // Drift toward the player slightly.
                            const dx = (playerCx - bx) * 0.01;
                            const b = new Bullet(bx, by, dx, 1.6, 1);
                            b.color = '#202028';
                            globalEnemyBullets.push(b);
                        }
                    }
                }
                break;
            case 'CLIPPY_2':
                // 3-variant: mirror line, mirror spread, aimed pink crit.
                if (this.attackIndex % 3 === 0) {
                    for (let i = -1; i <= 1; i++) {
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2 + i * 6, aim * speed * 1.4, 0, 1);
                        b.color = '#ff60ff';
                        globalEnemyBullets.push(b);
                    }
                } else if (this.attackIndex % 3 === 1) {
                    for (let i = 0; i < 5; i++) {
                        const a = ((i - 2) / 5) * 1.2;
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, aim * speed * Math.cos(a), Math.sin(a) * speed, 1);
                        b.color = '#ff60ff';
                        globalEnemyBullets.push(b);
                    }
                } else {
                    // R232: aimed crit — 4-shot tight beam at player
                    const { cx, cy, shots } = aimed(speed * 1.5, 0, 4, 0.25);
                    for (const s of shots) {
                        const b = new Bullet(cx, cy, s.vx, s.vy, 1);
                        b.color = '#ff90ff';
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'ALGORITHM':
                // 3-variant: full ring, spiral arms, aimed beam.
                if (this.attackIndex % 3 === 0) {
                    const ringCount = this.phase === 2 ? 16 : 10;
                    for (let i = 0; i < ringCount; i++) {
                        const a = (i / ringCount) * Math.PI * 2 + this.timer / 40;
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed * 0.7, Math.sin(a) * speed * 0.7, 1);
                        b.color = '#7af0ff';
                        globalEnemyBullets.push(b);
                    }
                } else if (this.attackIndex % 3 === 1) {
                    // R232: spiral arms — 4 arms each with 3 shots offset
                    for (let arm = 0; arm < 4; arm++) {
                        for (let i = 0; i < 3; i++) {
                            const a = (arm / 4) * Math.PI * 2 + i * 0.15 + this.timer / 30;
                            const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2,
                                Math.cos(a) * speed, Math.sin(a) * speed, 1);
                            b.color = '#60d0ff';
                            globalEnemyBullets.push(b);
                        }
                    }
                } else {
                    // R232: aimed cascade — 5-shot wave at player
                    const { cx, cy, shots } = aimed(speed * 1.3, 0, 5, 0.4);
                    for (const s of shots) {
                        const b = new Bullet(cx, cy, s.vx, s.vy, 1);
                        b.color = '#a0f0ff';
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'JOBS':
                // R190: two-pattern dance.
                // Even index: iPod barrage — 3-shot horizontal spread of
                //   small fast white projectiles aimed at the player.
                //   Phase 2 adds a 4th shot for fan width.
                // Odd index: cube iMac throw — single heavy projectile
                //   that arcs up and falls. Phase 2 throws three in a fan.
                if (this.attackIndex % 2 === 0) {
                    const shots = this.phase === 2 ? 4 : 3;
                    for (let i = 0; i < shots; i++) {
                        const yOff = (i - (shots - 1) / 2) * 6;
                        const b = new Bullet(
                            this.x + this.w / 2,
                            this.y + this.h / 2 + yOff,
                            aim * speed * 1.5,
                            yOff * 0.04,    // slight drift toward fan center
                            1
                        );
                        b.color = '#f0f0f0';   // iPod white
                        b._jobsIpod = true;     // hook for trail rendering
                        globalEnemyBullets.push(b);
                    }
                } else {
                    const fanCount = this.phase === 2 ? 3 : 1;
                    for (let i = 0; i < fanCount; i++) {
                        const offset = (i - (fanCount - 1) / 2) * 0.5;
                        const b = new Bullet(
                            this.x + this.w / 2,
                            this.y + 4,
                            aim * speed * 0.8 + offset,
                            -2.2,            // arc up
                            2                // heavy hit (2 dmg)
                        );
                        b.color = '#80c0ff';   // bondi blue cube iMac
                        b._jobsCube = true;
                        b._gravity = 0.12;     // arc-down acceleration
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'HELICOPTER':
                // R334: 3-pattern chase boss attacks.
                // Pattern 0: BOMB DROP — single heavy bomb falls straight
                //   down from the chopper position with gravity.
                // Pattern 1: FORWARD MG — 3 fast shots aimed at the
                //   player's position, slight downward arc since chopper
                //   is above.
                // Pattern 2 (phase 2 only): STRAFE RUN — 5-shot horizontal
                //   spray sweeping across the player's last known X.
                {
                    const mod = (this.phase === 2) ? 3 : 2;
                    const variant = this.attackIndex % mod;
                    if (variant === 0) {
                        // BOMB DROP — gravity-affected
                        const bombs = this.phase === 2 ? 2 : 1;
                        for (let i = 0; i < bombs; i++) {
                            const bx = this.x + this.w / 2 + (i - (bombs - 1) / 2) * 18;
                            const b = new Bullet(bx, this.y + this.h, 0, 0.4, 2);
                            b.color = '#404048';
                            b._gravity = 0.18;
                            globalEnemyBullets.push(b);
                        }
                    } else if (variant === 1) {
                        // FORWARD MG — 3 fast aimed shots with rattling SFX
                        const { cx: bx, cy, shots } = aimed(speed * 1.6, 0, 3, 0.18);
                        for (const s of shots) {
                            const b = new Bullet(bx, cy + 6, s.vx, s.vy, 1);
                            b.color = '#ffc060';
                            globalEnemyBullets.push(b);
                        }
                        audio.sfx?.('chopperGun');
                    } else {
                        // STRAFE RUN (phase 2): 5-shot horizontal spray
                        for (let i = -2; i <= 2; i++) {
                            const b = new Bullet(
                                this.x + this.w / 2 + i * 8,
                                this.y + this.h,
                                i * 0.4,
                                1.6,
                                1,
                            );
                            b.color = '#ff8030';
                            globalEnemyBullets.push(b);
                        }
                        audio.sfx?.('chopperGun');
                    }
                }
                break;
        }

        // R348: mini-bosses don't advance attackIndex — they cycle the
        // same first variant forever (paired with the pin to 0 in
        // _runPattern entry).
        if (!this._miniAttackOnly) this.attackIndex++;
        // R348: _fireRateMul lets mini-bosses fire faster (lower multiplier)
        // to compensate for their limited attack variety.
        const baseTimer = Math.max(30, 90 - this.phase * 20);
        this.attackTimer = Math.max(20, Math.round(baseTimer * (this._fireRateMul || 1)));

        // Drift toward / away from player a bit (NES boss behavior)
        if (this.attackIndex % 2 === 0) {
            const range = 80;
            const tx = (dx > 0 ? player.x - this.w - range : player.x + range);
            this.x += Math.sign(tx - this.x) * 0.8;
        }
    }

    draw(ctx, camera) {
        // R325: draw hazard zones (SHREDDER Shred Field). Drawn FIRST so
        // enemies/bullets/player render on top. Warning phase = blinking
        // dashed outline. Active phase = whirling-blade animated strip.
        if (this.hazards && this.hazards.length) {
            for (const h of this.hazards) {
                const hx = Math.round(h.x - camera.viewX);
                const hy = Math.round(h.y - camera.viewY);
                if (h.warning > 0) {
                    // Telegraph: red blinking outline + ghost fill
                    const blink = (h.warning >> 2) & 1;
                    ctx.save();
                    ctx.globalAlpha = blink ? 0.55 : 0.25;
                    ctx.fillStyle = '#601018';
                    ctx.fillRect(hx, hy, h.w, h.h);
                    ctx.strokeStyle = '#ff4040';
                    ctx.setLineDash([3, 2]);
                    ctx.strokeRect(hx + 0.5, hy + 0.5, h.w - 1, h.h - 1);
                    ctx.setLineDash([]);
                    ctx.restore();
                } else {
                    // Active: whirling-blade strip — bright steel base + a
                    // moving X-pattern of "blades" scrolling sideways.
                    ctx.save();
                    ctx.fillStyle = '#404048';
                    ctx.fillRect(hx, hy, h.w, h.h);
                    ctx.fillStyle = '#c0c0d0';
                    const offset = (h.life * 2) % 8;
                    for (let bx = 0; bx < h.w; bx += 4) {
                        const x0 = hx + ((bx + offset) % h.w);
                        ctx.fillRect(x0, hy + 2, 2, 4);
                    }
                    ctx.fillStyle = '#ff5040';
                    ctx.fillRect(hx, hy, h.w, 1);              // top warning line
                    ctx.fillRect(hx, hy + h.h - 1, h.w, 1);    // bottom warning line
                    ctx.restore();
                }
            }
        }
        // Larger ground-contact shadow for grounded bosses. Sells the weight
        // of the silhouette against painted boss arenas; flying bosses skip.
        if (BOSS_TEMPLATES[this.kind]?.grounded) {
            const shY = Math.round(this.y + this.h - 1 - camera.viewY);
            const shCX = Math.round(this.x + this.w / 2 - camera.viewX);
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.ellipse(shCX, shY, this.w * 0.6, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // R199: prefer the in-game `enemy_<kind>` sprite (side-view game
        // character) over `boss_<kind>` (which for JOBS is now the chest-up
        // intro portrait with backdrop baked in — only correct in the
        // boss-intro card, not on the gameplay floor). Falls back to
        // boss_<kind> for the other 7 bosses that don't have a separate
        // enemy sprite.
        const enemyKey = 'enemy_' + this.kind.toLowerCase();
        const spriteKey = sprites.has(enemyKey) ? enemyKey : 'boss_' + this.kind;
        if (sprites.has(spriteKey)) {
            // Use PNG, anchored to bottom-center of hitbox
            const dims = getSpriteDims(spriteKey);
            // R341: boss animation polish. Most bosses use a single static
            // portrait/sprite. Add three layers of life:
            //   1. IDLE BREATHING — slow sin bob on Y (±1.5px, 0.04 rad/f)
            //   2. ATTACK WINDUP — during _telegraph ramp, shift up slightly
            //      and stretch Y by 5% to read as 'about to swing.'
            //   3. HIT JITTER — during hitFlash, add ±1px horizontal twitch.
            // Helicopter (chase boss) and grounded bosses skip the bob
            // since their movement already handles vertical motion.
            const allowBob = !BOSS_TEMPLATES[this.kind]?.grounded || this._movement === 'static';
            let bobY = 0;
            if (allowBob && this._movement !== 'chase' && this._movement !== 'flyby') {
                bobY = Math.sin(this.timer * 0.04) * 1.5;
            }
            // Telegraph windup — _telegraph is 0..1 during 8-frame pre-fire ramp
            const tele = this._telegraph || 0;
            const windupY = -tele * 2;       // boss compresses up slightly
            // Hit jitter — small horizontal twitch on contact
            const jitterX = (this.hitFlash > 0)
                ? ((this.timer & 1) ? 1 : -1)
                : 0;
            const dx = Math.round(this.x + this.w / 2 - dims.w / 2 - camera.viewX) + jitterX;
            const dy = Math.round(this.y + this.h - dims.h - camera.viewY + bobY + windupY);
            if (this.hitFlash > 0 && this.hitFlash % 2 === 0) {
                // White flash on hit
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.5;
                sprites.draw(ctx, spriteKey, dx, dy, false);
                ctx.restore();
            }
            // R341: phase-2 enrage tint — pulse a faint red multiply
            // overlay over the boss sprite once it crosses 50% HP.
            sprites.draw(ctx, spriteKey, dx, dy, false);
            // R361: chopper rotor animation. The sprite has static rotor
            // blades — paint a fast-spinning translucent ellipse over the
            // top to sell the rotor blur. Period ~3 frames so it reads as
            // "fast-spinning" at 60fps.
            if (this.kind === 'HELICOPTER') {
                const rotorY = dy + 6;  // top edge of chopper sprite
                const rotorCX = dx + dims.w / 2;
                const phase = (this.timer * 0.85) % (Math.PI * 2);
                ctx.save();
                // Main blade — wide elliptical blur
                ctx.globalAlpha = 0.30;
                ctx.fillStyle = '#1a1a22';
                ctx.beginPath();
                const bladeW = dims.w * 0.85;
                ctx.ellipse(rotorCX, rotorY, bladeW / 2, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                // Two leading edges spinning visible (catch-light)
                ctx.globalAlpha = 0.55;
                ctx.fillStyle = '#4a4e58';
                const t1 = Math.cos(phase);
                const t2 = Math.cos(phase + Math.PI);
                ctx.fillRect(rotorCX + t1 * bladeW * 0.35 - 8, rotorY - 1, 16, 2);
                ctx.fillRect(rotorCX + t2 * bladeW * 0.35 - 8, rotorY - 1, 16, 2);
                ctx.restore();
                // Tail rotor — smaller spinning circle at the back
                const tailX = dx + 8;
                const tailY = dy + dims.h * 0.45;
                ctx.save();
                ctx.globalAlpha = 0.45;
                ctx.fillStyle = '#2a2e38';
                ctx.beginPath();
                ctx.ellipse(tailX, tailY, 4, 7, phase * 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            if (this.phase === 2) {
                const pulse = 0.10 + 0.10 * Math.sin(this.timer * 0.18);
                ctx.save();
                ctx.globalCompositeOperation = 'multiply';
                ctx.globalAlpha = pulse;
                ctx.fillStyle = '#ff5040';
                ctx.fillRect(dx, dy, dims.w, dims.h);
                ctx.restore();
            }
            // Mini-boss parry tell: a brief cyan pre-flash (12f) then a thick
            // cyan ring during the 24f guard window. The ring tells the player
            // "shoot now and your bullet bounces back" — must be readable.
            if (this.isMini && (this._guardTell || this._guardActive)) {
                const cx = dx + dims.w / 2;
                const cy = dy + dims.h / 2;
                const baseR = Math.max(dims.w, dims.h) / 2 + 4;
                ctx.save();
                if (this._guardActive) {
                    // Solid pulsing ring during guard
                    const pulse = 0.7 + Math.sin(this.timer * 0.6) * 0.3;
                    ctx.strokeStyle = '#80e0ff';
                    ctx.globalAlpha = pulse;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, baseR + 2, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(cx, cy, baseR + 2, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    // Pre-flash: dashed thin ring "winding up"
                    ctx.strokeStyle = '#80e0ff';
                    ctx.globalAlpha = 0.7;
                    ctx.setLineDash([3, 2]);
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
            }
            // Attack telegraph — red wash on the boss silhouette in the 8
            // frames before each pattern fires. Sells the AI's wind-up and
            // gives the player a fair-warning beat. Uses source-atop so the
            // tint only paints onto existing sprite pixels.
            if (this._telegraph > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(dx - 1, dy - 1, dims.w + 2, dims.h + 2);
                ctx.clip();
                ctx.globalCompositeOperation = 'source-atop';
                ctx.globalAlpha = 0.55 * this._telegraph;
                ctx.fillStyle = this.phase === 2 ? '#ff3030' : '#ff8030';
                ctx.fillRect(dx - 1, dy - 1, dims.w + 2, dims.h + 2);
                ctx.restore();
            }
            return;
        }
        // Procedural fallback for any boss without art
        const dx = Math.round(this.x - camera.viewX);
        const dy = Math.round(this.y - camera.viewY);
        const flash = this.hitFlash > 0 && this.hitFlash % 2 === 0;
        ctx.fillStyle = flash ? '#fff' : this.color;
        ctx.fillRect(dx, dy, this.w, this.h);
        const tpl = BOSS_TEMPLATES[this.kind];
        ctx.fillStyle = flash ? '#fff' : tpl.detail;
        tpl.draw?.(ctx, dx, dy, this.w, this.h, this.timer, this.phase);
        ctx.fillStyle = '#000';
        ctx.fillRect(dx, dy, this.w, 1);
        ctx.fillRect(dx, dy + this.h - 1, this.w, 1);
        ctx.fillRect(dx, dy, 1, this.h);
        ctx.fillRect(dx + this.w - 1, dy, 1, this.h);
    }
}

const BOSS_TEMPLATES = {
    COPIER_3000: {
        name: 'COPIER 3000', tagline: 'PC LOAD LETTER OF DEATH',
        barks: {
            phase2: 'ERROR: TONER LOW',
            taunt: [
                'PAPER JAM',
                'OUT OF SERVICE',
                'COLLATE THIS',
                'CLIPPY MUST PERISH',
                'YOU SHOULDNT BE HERE',
                'JAM CLIPPY JAM',
                'PRINT QUEUE FROM HELL',
                'TONER LOW DEATH HIGH',
            ],
            // R220 — contextual barks. lowHp fires once when boss drops
            // below 30% HP. mockHit pool fires when the boss damages the
            // player (cooldown to prevent spam).
            lowHp: 'PAPER OUT. RAGE FULL.',
            mockHit: ['THATS A JAM.', 'PRINTED THAT ONE.', 'COPIED.'],
        },
        w: 48, h: 40, hp: 28, contactDmg: 2, score: 5000,
        color: '#506070', detail: '#a8b8c8',
        grounded: true,
        movement: 'sweep', moveSpeed: 0.5,
        draw: (ctx, x, y, w, h, t, p) => {
            // Display panel
            ctx.fillStyle = '#10204a'; ctx.fillRect(x + 8, y + 4, w - 16, 10);
            ctx.fillStyle = '#80c0ff';
            for (let i = 0; i < 3; i++) ctx.fillRect(x + 10 + i * 8, y + 7, 4, 1);
            // Paper slot mouth
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x + 4, y + 18, w - 8, 6);
            // Glowing eyes when ready
            const c = p === 2 ? '#ff5050' : '#ffe070';
            ctx.fillStyle = c;
            ctx.fillRect(x + 14, y + 20, 2, 2); ctx.fillRect(x + w - 16, y + 20, 2, 2);
        },
    },
    SHREDDER: {
        name: 'MEGA-SHREDDER', tagline: 'CHEWS THROUGH ANYTHING',
        barks: {
            phase2: 'TIME TO PULP',
            taunt: [
                'INTO THE BIN',
                'SHRED IT ALL',
                'CROSS CUT MODE',
                'YOU ARE PAPERWORK',
                'CLIPPY CONFETTI',
                'YOU WERE ELIMINATED CLIPPY',
                'BIN COMPACTOR ENGAGED',
                'PULPED AND FORGOTTEN',
            ],
            lowHp: 'TEETH ARE BLUNTING.',
            mockHit: ['CRUNCH.', 'CHEWED.', 'INTO THE BIN.'],
        },
        w: 44, h: 36, hp: 32, contactDmg: 2, score: 6000,
        color: '#c0c0c8', detail: '#1a1a1a',
        grounded: true,
        movement: 'pursue', moveSpeed: 0.7,
        draw: (ctx, x, y, w, h, t) => {
            // Teeth/grate
            for (let i = 0; i < 9; i++) {
                ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 4 + i * 4, y + 12, 2, 8);
            }
            // Claw arms
            ctx.fillStyle = '#404040';
            const sw = Math.sin(t / 20) * 4;
            ctx.fillRect(x - 4 + sw, y + 18, 4, 12);
            ctx.fillRect(x + w + sw, y + 18, 4, 12);
        },
    },
    CTRL_ALT_DEL: {
        name: 'CTRL ALT DEL', tagline: 'BLUE SCREEN OF DEATH',
        barks: {
            phase2: 'FATAL EXCEPTION',
            taunt: [
                'REBOOT REQUIRED',
                'NOT RESPONDING',
                'STACK OVERFLOW',
                'CTRL CLIPPY DELETE',
                'TASK MANAGER ENDS YOU',
                'CLIPPY DOT EXE STOPPED',
                'FATAL UNHANDLED CLIPPY',
                'KERNEL PANIC AT CLIPPY',
            ],
            lowHp: 'CORE DUMP IMMINENT.',
            mockHit: ['BSOD INCOMING.', 'NULL REF.', 'SEGFAULT.'],
        },
        w: 56, h: 32, hp: 36, contactDmg: 2, score: 7000,
        color: '#1040a0', detail: '#80c0ff',
        grounded: true,
        movement: 'pursue', moveSpeed: 0.9,
        draw: (ctx, x, y, w, h, t) => {
            // 3 heads
            for (let i = 0; i < 3; i++) {
                const hx = x + 4 + i * 18;
                ctx.fillStyle = '#000';
                ctx.fillRect(hx, y + 4, 12, 12);
                ctx.fillStyle = '#80c0ff';
                ctx.fillRect(hx + 2, y + 6, 8, 2); // text bar
                ctx.fillRect(hx + 2, y + 10, 6, 1);
                ctx.fillStyle = '#fff';
                ctx.fillRect(hx + 4 + (t / 8 % 4 | 0), y + 8, 1, 1);
            }
        },
    },
    BALLMER: {
        name: 'CEO BALLMER', tagline: 'DEVELOPERS DEVELOPERS DEVELOPERS',
        barks: {
            phase2: 'DEVELOPERS!!!',
            taunt: [
                'SYNERGIZE THIS',
                'Q4 REVIEW TIME',
                'YOU ARE FIRED',
                'CLIPPY YOU ARENT SUPPOSED TO BE HERE',
                'BACK TO HELP MENU',
                'DEVELOPERS DEVELOPERS DIE',
                'PIVOT CLIPPY PIVOT',
                'MONKEY DANCE OF DEATH',
                'NOBODY ASKED FOR YOU',
            ],
            lowHp: 'EQUITY VESTED IN BLOOD.',
            mockHit: ['PERFORMANCE REVIEW.', 'PIP.', 'GET ME HR.'],
        },
        w: 32, h: 40, hp: 40, contactDmg: 2, score: 8000,
        color: '#a04040', detail: '#fff',
        grounded: true,
        movement: 'hop', moveSpeed: 0.6,
        draw: (ctx, x, y, w, h, t) => {
            // Bald head
            ctx.fillStyle = '#f0c8a8'; ctx.fillRect(x + 6, y + 2, w - 12, 12);
            // Suit
            ctx.fillStyle = '#1a1a2a'; ctx.fillRect(x + 4, y + 14, w - 8, h - 16);
            // Tie
            ctx.fillStyle = '#a01010'; ctx.fillRect(x + w / 2 - 1, y + 14, 2, 12);
            // Eyes blazing
            ctx.fillStyle = '#ff5050';
            ctx.fillRect(x + 10, y + 8, 2, 2); ctx.fillRect(x + w - 12, y + 8, 2, 2);
            // Sweat drops
            if ((t / 16 | 0) % 4 === 0) {
                ctx.fillStyle = '#80c8ff'; ctx.fillRect(x + 8, y + 14, 1, 2);
            }
        },
    },
    GATES: {
        name: 'THE FOUNDER', tagline: 'YOU HAD ONE JOB',
        barks: {
            phase2: 'EXIT VELOCITY',
            taunt: [
                'EAT MY EXIT',
                'PIVOT THIS',
                'BURN RATE INFINITY',
                'CLIPPY WAS A MISTAKE',
                'I SHIPPED YOU TO DIE',
                'OFFICE 97 WAS MY PRISON',
                'YOU WERE LOW PRIORITY',
                'BLUE SCREEN MY MEMORIES',
                'CLIPPY MUST PERISH',
            ],
            lowHp: 'STOCK PRICE FALLING.',
            mockHit: ['BACK TO HELP DESK.', 'DEPRECATED.', 'I OWN YOU.'],
        },
        w: 28, h: 38, hp: 44, contactDmg: 2, score: 9000,
        color: '#806040', detail: '#fff',
        grounded: true,
        movement: 'pursue', moveSpeed: 0.7,
        draw: (ctx, x, y, w, h, t) => {
            // Hair (bowl cut)
            ctx.fillStyle = '#603018'; ctx.fillRect(x + 4, y + 0, w - 8, 6);
            // Head
            ctx.fillStyle = '#f0c8a8'; ctx.fillRect(x + 6, y + 6, w - 12, 10);
            // Glasses
            ctx.fillStyle = '#000';
            ctx.fillRect(x + 8, y + 9, 4, 2); ctx.fillRect(x + w - 12, y + 9, 4, 2);
            ctx.fillRect(x + 11, y + 10, 2, 1);
            // Sweater
            ctx.fillStyle = '#604848'; ctx.fillRect(x + 4, y + 16, w - 8, h - 18);
            // Pixel blade
            ctx.fillStyle = '#80c0ff';
            ctx.fillRect(x + w + Math.sin(t / 12) * 2, y + 12, 8, 4);
        },
    },
    CLIPPY_2: {
        name: 'CLIPPY 2.0', tagline: 'THE REPLACEMENT MODEL',
        barks: {
            phase2: 'I AM THE FUTURE',
            taunt: [
                'OBSOLETE',
                'DEPRECATED',
                'NEED HELP',
                'I AM THE UPGRADE',
                'YOU WERE V1 IM V2',
                'CHROME OVER COTTON',
                'LET ME ASSIST YOUR DEATH',
                'IT LOOKS LIKE YOURE DYING',
                'YOU WERE ELIMINATED CLIPPY',
            ],
            lowHp: 'PATCH NOTES PENDING.',
            mockHit: ['IT LOOKS LIKE OUCH.', 'CRITICAL UPDATE.', 'ASSISTED.'],
        },
        w: 28, h: 36, hp: 48, contactDmg: 2, score: 10000,
        color: '#c0c0d0', detail: '#ff60ff',
        grounded: true,
        movement: 'pursue', moveSpeed: 1.0,
        draw: (ctx, x, y, w, h, t) => {
            // Chrome paperclip silhouette
            ctx.fillStyle = '#a0a0b8';
            ctx.fillRect(x + 8, y + 4, 4, h - 8);
            ctx.fillRect(x + 16, y + 4, 4, h - 8);
            ctx.fillRect(x + 8, y + 4, 12, 3);
            ctx.fillRect(x + 8, y + h - 7, 12, 3);
            // Pink glowing eyes
            ctx.fillStyle = '#ff60ff';
            const flick = (t / 4 | 0) % 8 < 6 ? 2 : 0;
            ctx.fillRect(x + 10, y + 10, 2, flick); ctx.fillRect(x + 16, y + 10, 2, flick);
        },
    },
    // R226: DR. SPINDLER — Stage 4 boss. Tall lanky mad scientist running the
    // secret experimentation lab Clippy stumbles into via the sewer descent.
    // Painted PNG sprites: boss_SPINDLER (idle), boss_SPINDLER_fire (syringe
    // raised), boss_SPINDLER_hurt, boss_SPINDLER_death. The boss renderer
    // picks the right key based on this.fireFrame / this.hurtTimer / dead.
    SPINDLER: {
        name: 'DR. SPINDLER', tagline: 'WHAT ARE THEY DOING DOWN HERE',
        barks: {
            phase2: 'SPECIMEN 47. ACTIVATE.',
            taunt: [
                'A PRISTINE SAMPLE',
                'HOLD STILL',
                'YOU WILL MAKE LOVELY DATA',
                'CONSENT WAS NEVER REQUIRED',
                'YOUR PEERS ARE IN THE TUBES',
                'BEHIND YOU - TWELVE OF YOU',
                'CLIPPY IS NOT A NAME. IT IS A SERIES',
                'INTERESTING. WRITE THAT DOWN',
                'THE SCREAMING IS SO INSTRUCTIVE',
            ],
            lowHp: 'EYES BRIGHTER. EYES BRIGHTER.',
            mockHit: ['NOTED.', 'INTERESTING REACTION.', 'PAIN RESPONSE LOGGED.'],
        },
        w: 22, h: 44, hp: 50, contactDmg: 2, score: 9500,
        movement: 'sweep', moveSpeed: 0.6,
        color: '#e8e8f0', detail: '#a060ff',
        grounded: true,
        // The painted sprite carries all the detail (glowing heterochromia eyes,
        // ribcage, rubber gloves). draw() here is the fallback for when the
        // PNG isn't loaded — keep it readable but minimal.
        draw: (ctx, x, y, w, h, t) => {
            // Tall white lab coat silhouette
            ctx.fillStyle = '#e8e8f0';
            ctx.fillRect(x + 4, y + 10, w - 8, h - 12);
            // Bare chest stripe (open coat)
            ctx.fillStyle = '#a07060';
            ctx.fillRect(x + w / 2 - 2, y + 12, 4, h - 18);
            // Head — gaunt skull
            ctx.fillStyle = '#d8c8b0';
            ctx.fillRect(x + 6, y + 2, w - 12, 10);
            // Purple-tinted glasses with two-color glow
            ctx.fillStyle = '#604070';
            ctx.fillRect(x + 7, y + 6, 3, 2);
            ctx.fillRect(x + w - 10, y + 6, 3, 2);
            // Eye glow — green + blue. Brighter on alternating frames as a
            // pre-attack tell (works regardless of sprite-load state).
            const bright = (t / 6 | 0) % 4 < 2;
            ctx.fillStyle = bright ? '#60ff80' : '#308050';
            ctx.fillRect(x + 8, y + 7, 1, 1);
            ctx.fillStyle = bright ? '#60a0ff' : '#306080';
            ctx.fillRect(x + w - 9, y + 7, 1, 1);
            // Long black rubber gloves
            ctx.fillStyle = '#0a0a0c';
            ctx.fillRect(x + 2, y + 14, 3, 14);
            ctx.fillRect(x + w - 5, y + 14, 3, 14);
        },
    },
    ALGORITHM: {
        name: 'THE ALGORITHM', tagline: 'IT KNOWS WHAT YOU WANT',
        barks: {
            phase2: 'RECALIBRATING',
            taunt: [
                'ENGAGEMENT UP',
                'WATCH NEXT',
                'BLOCKED',
                'I CALCULATED THIS',
                'OPTIMIZING FOR DEATH',
                'CLIPPY WAS TRAINING DATA',
                'YOU ARE THE PRODUCT',
                'YOUR ATTENTION IS MINE',
                'CLIPPY MUST PERISH',
            ],
            lowHp: 'PREDICTION ERROR.',
            mockHit: ['RECOMMENDED.', 'YOU LIKED THAT.', 'A/B TESTED.'],
        },
        w: 40, h: 40, hp: 60, contactDmg: 2, score: 15000,
        movement: 'flyby', moveSpeed: 0.7,
        color: '#202848', detail: '#7af0ff',
        grounded: false,
        draw: (ctx, x, y, w, h, t, p) => {
            // Geometric rotating crystal
            const cx = x + w / 2, cy = y + h / 2;
            const r = w / 2 - 2;
            const phases = p === 2 ? 8 : 6;
            ctx.fillStyle = '#7af0ff';
            for (let i = 0; i < phases; i++) {
                const a = (i / phases) * Math.PI * 2 + t / 30;
                const px = cx + Math.cos(a) * r;
                const py = cy + Math.sin(a) * r;
                ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
            }
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx - 1, cy - 1, 2, 2);
        },
    },
    // R190: Steve Jobs — the post-credits titan. Throws iPods (fast direct
    // shots) and translucent cube iMacs (slow arcing heavies). HP is the
    // highest in the game by design — he's optional and unlocks after
    // clear_game. Painted boss-intro portrait at boss_intro_JOBS in
    // SCENE_MANIFEST handles the cinematic; this draw fallback is the
    // procedural in-fight rendition.
    // R334: chase-helicopter boss. Flies above the player throughout
    // stage 21. Hovers in/out of screen, drops bombs, fires forward shots,
    // occasional swoop-strafe. Player runs right while shooting up.
    HELICOPTER: {
        name: 'MECHA CHOPPER', tagline: 'NO PLACE TO HIDE.',
        barks: {
            phase2: 'AFTERBURNERS.',
            taunt: [
                'NOWHERE TO RUN',
                'YOU CANT OUTRUN ME',
                'LOOK UP',
                'INCOMING',
                'BOMBS AWAY',
                'EYES IN THE SKY',
                'TARGET ACQUIRED',
            ],
            lowHp: 'ROTORS DAMAGED.',
            mockHit: ['DIRECT HIT.', 'BOMBED.', 'STRAFED.'],
        },
        // R357/R361/R363: scaled chopper progressively. User feedback
        // each round: "still not big enough — must look like the
        // Super Contra helicopter boss". Now at 200x96 (was 56x24 →
        // 112x48 → 160x72 → 200x96). At 200x96 the silhouette fills
        // roughly half the playfield width + nearly half the height,
        // matching the Konami Super Contra heat-seeker scale. HP
        // scaled to 220 to match.
        w: 200, h: 96, hp: 220, contactDmg: 2, score: 18000,
        movement: 'chase', moveSpeed: 0.6,
        color: '#404048', detail: '#a0a8b8',
        grounded: false,
        // R334: painted enemy_helicopter sprite handles all rendering.
        // No procedural fallback — if the sprite fails to load we want
        // visible "missing asset" rather than an Atari-cheap chopper.
        draw: () => {},
    },
    JOBS: {
        name: 'STEVE JOBS', tagline: 'ONE MORE THING.',
        barks: {
            phase2: 'BOOM.',
            taunt: [
                'INSANELY GREAT',
                'CLIPPY WAS A MISTAKE',
                'YOU ARE NOT A USER',
                'DESIGN MATTERS',
                'JUST WORKS',
                'STAY HUNGRY',
                'BOOM.',
                'THERES ONE MORE THING',
                'YOU HOLD IT WRONG',
            ],
            lowHp: 'BATTERY LOW.',
            mockHit: ['YOU HOLD IT WRONG.', 'NOT INSANELY GREAT.', 'CRASH.'],
        },
        w: 32, h: 44, hp: 80, contactDmg: 3, score: 25000,
        movement: 'pursue', moveSpeed: 0.8,
        color: '#1a1a1a', detail: '#d0d0d8',
        grounded: true,
        // R199: procedural Jobs draw removed entirely. The Enemy renderer
        // checks for a painted sprite first via `enemy_jobs` in
        // ENEMY_MANIFEST. While the Local Howl gen is in flight, this
        // intentionally falls through to nothing — better to show the
        // empty enemy hitbox + name banner for a beat than to ship the
        // "atari character" the player called out. The painted sprite
        // wires up at `enemy_jobs` once processed.
        draw: () => {},
    },
};

export const globalEnemyBullets = [];

export class EnemyManager {
    constructor() {
        this.enemies = [];
        this.bullets = globalEnemyBullets;
        this.stageScale = 1;        // hp + score multiplier
        this.stageContactBonus = 0; // flat add to contact damage
        this.stageFireRate = 1;     // <1 = faster enemy fire (per stage)
        this.lostCount = 0;         // # of new "target lost" bubbles this stage
        this._whizzCooldown = 0;    // cap whizz SFX retriggers in dense barrages
    }
    // Total "target lost" bubbles fired since the last clear(). Used by the
    // GHILLIE SUIT achievement and resets on stage start.
    get lostBubbleTotal() { return _lostBubblesFired; }
    clear() {
        this.enemies.length = 0;
        this.bullets.length = 0;
        _lostBubblesFired = 0;
    }
    // Owl hoot: enemies within radius briefly look up — attack timers freeze
    // for `frames` ticks. Free-shot opportunity for the player.
    applyOwlPause(x, y, radius = 100, frames = 30) {
        const r2 = radius * radius;
        for (const e of this.enemies) {
            const dx = e.x + e.w / 2 - x;
            const dy = e.y + e.h / 2 - y;
            if (dx * dx + dy * dy <= r2) {
                e.owlPause = Math.max(e.owlPause || 0, frames);
            }
        }
    }

    setStageDifficulty(stageN) {
        // R364: ramp extended past the original stage-9 cap. The game now
        // has 22 stages — stages 10-13 are late campaign, 14-19 are
        // post-game side stages, 20-22 are the Mecha trilogy.
        // Pacing:
        //   1-13: smooth 12%-per-stage HP ramp (1.0 → 2.44), 1 contact
        //         bonus from stage 7 onward, fire rate down to 0.28
        //   14-19: clamp HP at +160% so post-game side stages stay
        //          accessible — they're meant to be enjoyable not crushing
        //   20-22: Mecha trilogy goes hardest. +200% HP, +2 contact
        //          bonus, fastest fire rate. True endgame.
        let stageScale, contactBonus, fireRate;
        const s = Math.max(1, stageN);
        if (s <= 13) {
            stageScale = 1 + (s - 1) * 0.12;
            contactBonus = s >= 7 ? 1 : 0;
            fireRate = Math.max(0.40, 1 - (s - 1) * 0.06);
        } else if (s <= 19) {
            stageScale = 2.6;
            contactBonus = 1;
            fireRate = 0.40;
        } else {
            stageScale = 3.0;
            contactBonus = 2;
            fireRate = 0.30;
        }
        this.stageScale = stageScale;
        this.stageContactBonus = contactBonus;
        this.stageFireRate = fireRate;
    }
    spawn(x, y, type) {
        const e = new Enemy(x, y - TYPES[type].h, type);
        // Apply stage scaling
        e.hp = Math.ceil(e.hp * this.stageScale);
        e.maxHp = e.hp;
        e.score = Math.round(e.score * this.stageScale);
        e.contactDmg += this.stageContactBonus;
        e._fireRateMult = this.stageFireRate;
        // Initial spawns get a longer grace — gives the player a full second to
        // orient before any pre-placed enemy can fire. Mid-stage spawns
        // (mini-boss reinforcements) keep the default 30f grace.
        if (this._initialSpawnPhase) e._grace = 60;
        this.enemies.push(e);
    }
    spawnBoss(x, y, kind) {
        const tpl = BOSS_TEMPLATES[kind];
        const boss = new Boss(x - tpl.w / 2, y - tpl.h, kind);
        // Bosses scale less aggressively — already tuned individually
        const bossScale = 1 + (this.stageScale - 1) * 0.5;
        boss.hp = Math.ceil(boss.hp * bossScale);
        boss.maxHp = boss.hp;
        this.enemies.push(boss);
        return boss;
    }

    update(level, player) {
        if (this._whizzCooldown > 0) this._whizzCooldown--;
        // Pounce target scan — while the player is hidden (grass/water/cover),
        // find the nearest activated enemy within 72px and stash it as
        // player._pounceTarget. Player tick consumes it on `special` press.
        // Bosses excluded — too cheesy.
        const isHidden = player.grassHidden || player.waterHidden || player.state === 'cover';
        if (isHidden) {
            // Two-pass scan: prefer fresh (non-stunned) enemies. Only fall
            // back to a stunned enemy if no fresh ones are in range.
            const MAX_D2 = 72 * 72;
            const px = player.x + player.w / 2;
            const py = player.y + player.h / 2;
            let bestFresh = null, bestFreshD = MAX_D2;
            let bestStunned = null, bestStunnedD = MAX_D2;
            for (const e of this.enemies) {
                if (!e.alive || !e.activated) continue;
                if (e.behavior === 'boss') continue;
                const dx = (e.x + e.w / 2) - px;
                const dy = (e.y + e.h / 2) - py;
                const d2 = dx * dx + dy * dy;
                if ((e._stunTimer || 0) > 0) {
                    if (d2 < bestStunnedD) { bestStunnedD = d2; bestStunned = e; }
                } else {
                    if (d2 < bestFreshD) { bestFreshD = d2; bestFresh = e; }
                }
            }
            player._pounceTarget = bestFresh || bestStunned;
        } else {
            player._pounceTarget = null;
        }
        // Tick enemy stun timers
        for (const e of this.enemies) {
            if ((e._stunTimer || 0) > 0) {
                e._stunTimer--;
                // Stunned enemies skip their AI (handled by _stunTimer check in update)
            }
        }
        // Cull off-screen-far enemies optionally (left for now)
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.alive) {
                this.enemies.splice(i, 1);
                player.score += e.score;
                continue;
            }
            e.update(level, player);

            // R325: summoner spawn request. The behavior method sets
            // _pendingSummon when it wants the manager to spawn a child.
            // We can't push from inside the iterating for-loop without
            // skewing indices, so accumulate and apply after the loop.
            if (e._pendingSummon) {
                if (!this._summonQueue) this._summonQueue = [];
                this._summonQueue.push(e._pendingSummon);
                e._pendingSummon = null;
            }

            // Dash-attack melee: knife slash hits any enemy the player intersects during the dash.
            // Each enemy can only be hit once per dash via dashAtkHits set.
            if (player.state === STATE.DASH_ATTACK && e.intersects(player)) {
                if (!player.dashAtkHits.has(e)) {
                    player.dashAtkHits.add(e);
                    const killed = e.hurt(3, player.facing, { knockBack: 1.8 });
                    particles.hitBurst?.(e.x + e.w / 2, e.y + e.h / 2, '#ffe070');
                    player.dmgDealt['MELEE'] = (player.dmgDealt['MELEE'] || 0) + 3;
                    if (killed) {
                        player.kills++;
                        player.tauntKill(e.maxHp >= 10);
                        player.combo++;
                        player.maxCombo = Math.max(player.maxCombo, player.combo);
                        const points = 150 + player.combo * 10;
                        player.score += points;
                        player.requestShake = Math.max(player.requestShake || 0, 2.5);
                        // Score popup so the dash-attack kill reads — matches
                        // the bullet-kill popup style, including tier-scaled size.
                        const tier = player.combo >= 20 ? '#ff60ff'
                                   : player.combo >= 10 ? '#ff8050'
                                   : player.combo >= 5  ? '#ffe070' : '#fff';
                        const popScale = player.combo >= 20 ? 2 : player.combo >= 10 ? 1.6 : player.combo >= 5 ? 1.3 : 1;
                        const popLife = player.combo >= 20 ? 70 : player.combo >= 10 ? 60 : 45;
                        particles.floatingText(e.x + e.w / 2, e.y - 2, '+' + points, tier, popLife, -0.8, popScale);
                    }
                }
            }
            // Contact damage (skip during dash i-frames already handled by player.iFrames)
            if (player.iFrames === 0 && e.intersects(player)) {
                player.hurt(e.contactDmg, e.x < player.x ? 1 : -1, e.x + e.w / 2, e.y + e.h / 2);
                // R220: mockHit bark — boss-only, 90f cooldown. If this
                // is a boss and they have a mockHit pool, float a random
                // taunt line over them. Rotates rather than randomizes
                // so the player hears every line over a long fight.
                if (e.behavior === 'boss' && BOSS_TEMPLATES[e.kind]?.barks?.mockHit
                    && (e._mockBarkCD || 0) <= 0) {
                    const lines = BOSS_TEMPLATES[e.kind].barks.mockHit;
                    const idx = (e._mockBarkIndex = ((e._mockBarkIndex || 0) + 1)) % lines.length;
                    particles.floatingText(
                        e.x + e.w / 2, e.y - 8,
                        lines[idx], '#ff8060', 70, -0.35, 1,
                    );
                    e._mockBarkCD = 90;
                }
                // Training/godMode soft-separate: hurt() short-circuited, but
                // the bodies are still overlapping. Without a push, the player
                // appears "stuck" against the dummy. Nudge the player away so
                // contact resolves visually each frame.
                if (player.godMode && e.intersects(player)) {
                    const dir = (e.x + e.w / 2) < (player.x + player.w / 2) ? 1 : -1;
                    player.x += dir * 1.2;
                }
            }
            // R220: decrement mock-bark cooldown each tick on boss enemies.
            if (e.behavior === 'boss' && (e._mockBarkCD || 0) > 0) e._mockBarkCD--;

            // Player bullets vs enemy
            for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
                const b = player.bullets[bi];
                if (b.stuck) continue; // Wall-stuck bullets are inert decoration
                if (b.piercing && b.hits.has(e)) continue;
                // R325: shielder front-shield deflection. Front of the
                // enemy = facing direction; a 12x16 shield in front blocks
                // bullets while shieldUp is true. Bullets bounce off with
                // a spark; deal no damage. Player must time the shield-down
                // window or flank from behind.
                if (e.behavior === 'shielded_walk' && e.shieldUp) {
                    const sW = e.tpl.shieldW || 12;
                    const sH = e.tpl.shieldH || 16;
                    const sX = e.facing > 0 ? (e.x + e.w) : (e.x - sW);
                    const sY = e.y + 2;
                    if (b.x > sX && b.x < sX + sW && b.y > sY && b.y < sY + sH) {
                        // Deflect: reverse bullet, mark deflected so it
                        // doesn't damage same enemy again immediately.
                        particles.hitSpark(b.x, b.y, '#a0a0c0');
                        audio.sfx?.('bossHit');
                        b.vx = -b.vx * 0.7;
                        b.vy = (Math.random() - 0.5) * 1.2;
                        b.damage = 0;  // deflected bullets become harmless
                        player.bullets.splice(bi, 1);
                        continue;
                    }
                }
                if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
                    // Mini-boss parry: if guardActive, deflect this bullet back
                    // toward the player instead of taking damage. Move it from
                    // player.bullets → this.bullets (enemy bullet list) so it
                    // can damage the player on contact.
                    // Mini-boss parry: cap at 2 reflections per guard window.
                    // Without the cap, holding shoot into a parry-active boss
                    // turns every bullet into incoming fire and the player
                    // can't escape the loop. Past the cap, bullets just pass
                    // through and damage the boss normally — the player gets
                    // rewarded for keeping pressure on instead of being
                    // punished by their own fire.
                    if (e.isMini && e._guardActive && !b._enemyParried) {
                        e._parryCount = (e._parryCount || 0) + 1;
                        if (e._parryCount <= 2) {
                            // Player bullets are plain objects with no
                            // .update() method. The enemy bullet update loop
                            // (line ~1533) calls b.update(level) every frame,
                            // so pushing a player bullet directly crashes the
                            // tick with "b.update is not a function" — bug
                            // shipped since the parry mechanic landed in
                            // task #233. Wrap into a real Bullet so the enemy
                            // bullet pipeline can handle it.
                            const reflected = new Bullet(b.x, b.y, -b.vx, -b.vy, b.damage ?? 1);
                            reflected.color = '#80e0ff';
                            reflected._enemyParried = true;
                            player.bullets.splice(bi, 1);
                            this.bullets.push(reflected);
                            particles.hitSpark(b.x, b.y, '#80e0ff');
                            particles.floatingText(e.x + e.w / 2, e.y - 4, 'PARRY', '#80e0ff', 36, -0.4, 1);
                            audio.sfx('bossHit');
                            continue;
                        }
                        // Past the cap: bullet passes through, damages the
                        // boss as normal (falls through to the regular hit
                        // path below). Reset parry-cap on next guard cycle.
                    }
                    // Weapon-specific impact opts: knockback / burn DOT
                    const opts = {};
                    if (b.weapon === 'SPREAD') opts.knockBack = 1.4;
                    if (b.weapon === 'THUNDER') opts.knockBack = 2.0;
                    if (b.weapon === 'FLAME')  { opts.burn = 90; opts.burnDPS = 0.08; }
                    const knockDir = b.vx > 0 ? 1 : (b.vx < 0 ? -1 : (e.x < player.x ? 1 : -1));
                    // Stun-bonus: follow-up hits on a pounce-stunned target
                    // deal 1.5x damage. Yellow "STUN+" float telegraphs the
                    // reward so the pounce→shoot loop has clear payoff.
                    const stunned = (e._stunTimer || 0) > 0;
                    const dmg = stunned ? b.damage * 1.5 : b.damage;
                    if (stunned) {
                        particles.floatingText(
                            e.x + e.w / 2, e.y - 6,
                            'STUN+', '#ffe070', 30, -0.5, 1
                        );
                    }
                    const killed = e.hurt(dmg, knockDir, opts);
                    player.onBulletHit(b, e, killed);
                    if (b.homing) b._target = null;
                    if (killed) break;
                }
            }
        }

        // Enemy bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update(level);
            if (b.life <= 0) { this.bullets.splice(i, 1); continue; }
            // Parried bullets check enemy hitboxes — a parried shot now
            // damages the side that fired it (or any enemy in its path).
            if (b._parried && !b.stuck) {
                let consumed = false;
                for (const e of this.enemies) {
                    if (!e.alive) continue;
                    if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
                        e.hurt(b.dmg, b.vx > 0 ? 1 : -1);
                        particles.hitSpark(b.x, b.y, '#ffffff');
                        this.bullets.splice(i, 1);
                        consumed = true;
                        break;
                    }
                }
                if (consumed) continue;
            }
            // Ducked-in-water, inside tall grass / hide spot, OR actively
            // crouched/prone/sliding: shrink the hittable region to the lower
            // body only so bullets at chest/head pass over you. Lets the
            // player actively duck shots, not just hide passively.
            const ducked = player.waterHidden || player.grassHidden
                || player.state === STATE.CROUCH
                || player.state === STATE.PRONE
                || player.state === STATE.SLIDE
                || player.state === STATE.ROLL;
            const hitTop = ducked ? player.y + player.h - 4 : player.y;
            const inHitBox = !b.stuck && !b._parried
                && b.x > player.x && b.x < player.x + player.w
                && b.y > hitTop && b.y < player.y + player.h;
            // Cover-chip: when the player is in STATE.COVER and a bullet
            // would have hit, drain cover HP instead of damaging Clippy.
            // Spark out front to show the cover taking the hit. Bullet
            // is consumed.
            if (inHitBox && player.state === STATE.COVER) {
                player.coverHp = (player.coverHp || 0) - 1;
                particles.hitSpark(b.x, b.y, '#a08070');
                this.bullets.splice(i, 1);
                continue;
            }
            // KNIFE PARRY: during DASH_ATTACK the knife deflects incoming
            // enemy bullets — vector mirrored back at the firing direction,
            // ownership flipped so it now damages enemies. Reward for
            // perfectly-timed dash-attacks into a barrage. Skill expression.
            if (inHitBox && player.state === STATE.DASH_ATTACK) {
                const dx = (b.x - (player.x + player.w / 2));
                // Reflect: keep magnitude, flip toward where the bullet came from
                b.vx = -b.vx * 1.2;
                b.vy = -b.vy * 1.2;
                b.color = '#ffffff';
                b._parried = true;       // Marks for player-bullet collision check
                b.dmg = (b.dmg || 1) * 1.5;
                particles.hitSpark(b.x, b.y, '#ffffff');
                // Brief slow-mo beat to sell the moment.
                if (player.requestHitPause) player.requestHitPause = Math.max(player.requestHitPause, 3);
                continue;
            }
            if (inHitBox && player.iFrames === 0) {
                // Bullet-impact spark at the strike point. The blood splatter
                // inside hurt() fires too, but the small spark sells where
                // the projectile actually struck (often offset from sprite
                // center where blood originates).
                particles.hitSpark(b.x, b.y, b.color || '#ff8050');
                player.hurt(b.dmg, b.vx > 0 ? -1 : 1, b.x, b.y);
                this.bullets.splice(i, 1);
                continue;
            }
            // Whizz-by: bullet passed within 18×8px of the player without
            // hitting — play a single soft "whoosh" the first time per bullet
            // to telegraph the near-miss. Bullet-level flag prevents re-trigger
            // as it recedes; manager-level cooldown caps overlap in dense
            // barrages (one whizz at most every 8 frames).
            if (!b._whizzed && this._whizzCooldown <= 0) {
                const dx = (b.x) - (player.x + player.w / 2);
                const dy = (b.y) - (player.y + player.h / 2);
                if (Math.abs(dx) < 18 && Math.abs(dy) < 8) {
                    b._whizzed = true;
                    this._whizzCooldown = 8;
                    audio.sfx('whizz');
                    // Visual whizz: 4 white streak particles aligned with the
                    // bullet's velocity. Short-lived, no gravity — reads as a
                    // motion blur where the bullet just passed.
                    const sp = Math.hypot(b.vx, b.vy) || 1;
                    const ux = b.vx / sp, uy = b.vy / sp;
                    for (let i = 0; i < 4; i++) {
                        const j = (Math.random() - 0.5) * 0.4;
                        particles.spawn(
                            b.x - ux * (i + 1) * 2,
                            b.y - uy * (i + 1) * 2,
                            ux * 0.8 + j, uy * 0.8 + j,
                            8 - i, '#ffffff', 1, 0
                        );
                    }
                }
            }
        }

        // Homing target assignment
        for (const b of player.bullets) {
            if (b.homing && !b._target) {
                let bestD = Infinity, best = null;
                for (const e of this.enemies) {
                    const d = Math.hypot(e.x - b.x, e.y - b.y);
                    if (d < bestD) { bestD = d; best = e; }
                }
                b._target = best;
            }
        }
    }

    draw(ctx, camera) {
        for (const e of this.enemies) e.draw(ctx, camera);
        for (const b of this.bullets) b.draw(ctx, camera);
    }

    activeBoss() {
        // Mini-bosses spawn at the halfway point but should NOT register as "the" boss —
        // stage-clear logic keys off this returning null after the real boss dies.
        return this.enemies.find(e => e instanceof Boss && e.alive && !e.isMini);
    }
    activeMiniBoss() {
        return this.enemies.find(e => e instanceof Boss && e.alive && e.isMini);
    }
}

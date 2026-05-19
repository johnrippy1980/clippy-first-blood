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
    },
    stapler: {
        sprite: 'stapler',
        w: 14, h: 8,
        hp: 1, contactDmg: 1, score: 80,
        speed: 0.9, behavior: 'hop',
        hopV: -3.4, hopInterval: 32, leapV: -4.6, leapTriggerDx: 64,
        activateRange: 220,
    },
    cabinet: {
        sprite: 'cabinet',
        w: 18, h: 22,
        hp: 6, contactDmg: 2, score: 250,
        speed: 0.55, behavior: 'charge',
        chargeSpeed: 2.4, chargeWindup: 24,
        activateRange: 200,
    },
    holepunch: {
        sprite: 'holepunch',
        w: 14, h: 14,
        hp: 3, contactDmg: 1, score: 150,
        speed: 0, behavior: 'hover_sniper',
        hoverY: -2, shootInterval: 70, projectileSpeed: 2.7, beamCharge: 22,
        // Snipers activate inside one screen width (256px), down from 260.
        // Off-screen snipers cannot fire at the player — fair gameplay.
        activateRange: 200,
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
        this.x += this.vx; this.y += this.vy;
        this.life--;
        if (level.isSolid(this.x, this.y)) {
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
        }
        if (!this.activated) return;
        // Honor the global stage-start grace — set by EnemyManager on _startStage.
        if (this._grace > 0) { this._grace--; return; }
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
                particles.explosion(this.x + this.w / 2, this.y + this.h / 2);
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
        if (this.hitFlash > 4 || dyingShortly) {
            const v = this.sprite + '_hurt';
            if (sprites.has(v)) useSprite = v;
        } else if (attackPose) {
            const v = this.sprite + '_attack';
            if (sprites.has(v)) useSprite = v;
        } else if (this.behavior === 'charge') {
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
        // Always draw the base sprite first so the silhouette stays
        // continuously visible against painted bgs (the old alternate-
        // frame skip read as a broken sprite). Add a 'lighter' white wash
        // on top while hitFlash is active for a steady "took damage" flash.
        drawEnemyFrame(ctx, useSprite, dx, dy, this.facing > 0);
        if (this.hitFlash > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const a = Math.min(1, this.hitFlash / 6);
            ctx.globalAlpha = 0.6 * a;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.rect(dx - 1, dy - 1, dims.w + 2, dims.h + 2);
            ctx.clip();
            // Use source-atop relative to the sprite already drawn so the
            // wash only paints onto its pixels. Switch to source-atop AFTER
            // setting the clip, otherwise the lighter-mode fill would also
            // affect the background within the clip rect.
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillRect(dx - 1, dy - 1, dims.w + 2, dims.h + 2);
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
        // Thought bubble — "where did he go?" when the player is hidden.
        // _lostBubble is set by _noticeTargetLost(); fades over 120 frames so
        // a brief hide-and-pop doesn't leave the bubble stuck on screen.
        if (this._lostBubble && this._lostBubble.life > 0) {
            let bx = dx + this.w / 2;
            const by = dy - 14;
            const fade = Math.min(1, this._lostBubble.life / 30);
            ctx.globalAlpha = fade;
            const text = this._lostBubble.text;
            const w = Math.max(24, text.length * 4 + 8);
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
        // Phase 2 at half hp — boss enrages: explosion FX, brief invuln-ish
        // pause, screen shake, "RAGE" floating label, and an extended hitFlash
        // so the player can read the threshold beat clearly.
        if (this.phase === 1 && this.hp <= this.maxHp / 2) {
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
            // Telegraph the rage to the player via camera shake
            player.requestShake = Math.max(player.requestShake || 0, 5);
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
        if (this.attackTimer <= 0) {
            this._runPattern(level, player);
        }
    }

    _runPattern(level, player) {
        const dx = player.x - (this.x + this.w / 2);
        const aim = dx > 0 ? 1 : -1;
        const fan = this.phase === 2 ? 7 : 5;
        const speed = 1.6 + (this.phase === 2 ? 0.6 : 0);

        switch (this.kind) {
            case 'COPIER_3000':
                // Pattern: paper jam line + ink rain
                if (this.attackIndex % 2 === 0) {
                    // Horizontal paper line, fast
                    for (let i = -1; i <= 1; i++) {
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2 + i * 6, aim * speed * 1.4, 0, 1);
                        b.color = '#f0f0e0';
                        globalEnemyBullets.push(b);
                    }
                } else {
                    // Ink rain from above
                    for (let i = 0; i < 5 + this.phase * 2; i++) {
                        const bx = this.x + (i - 2) * 16 + (Math.random() - 0.5) * 12;
                        const b = new Bullet(bx, this.y - 10, 0, 1.4, 1);
                        b.color = '#1a1a1a';
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'SHREDDER':
                // Triple claw swipe → paper vortex
                for (let i = 0; i < fan; i++) {
                    const a = ((i - (fan - 1) / 2) / fan) * 1.4 + (aim < 0 ? Math.PI : 0);
                    const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed, Math.sin(a) * speed * 0.6, 1);
                    b.color = '#d8b890';
                    globalEnemyBullets.push(b);
                }
                break;
            case 'CTRL_ALT_DEL':
                // BSOD 3-head zigzag
                for (let i = 0; i < 3; i++) {
                    const b = new Bullet(this.x + this.w / 2, this.y + 8 + i * 10, aim * speed, Math.sin(this.timer / 10 + i) * 1.2, 1);
                    b.color = '#4080c0';
                    globalEnemyBullets.push(b);
                }
                break;
            case 'BALLMER':
                // Chair throw + sweat rain
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
                break;
            case 'GATES':
                // Windows-blade laser line + summons
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + this.timer / 30;
                    const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed, Math.sin(a) * speed, 1);
                    b.color = '#80c0ff';
                    globalEnemyBullets.push(b);
                }
                break;
            case 'CLIPPY_2':
                // Mirror moveset: scrolls own attacks
                if (this.attackIndex % 2 === 0) {
                    for (let i = -1; i <= 1; i++) {
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2 + i * 6, aim * speed * 1.4, 0, 1);
                        b.color = '#ff60ff';
                        globalEnemyBullets.push(b);
                    }
                } else {
                    for (let i = 0; i < 5; i++) {
                        const a = ((i - 2) / 5) * 1.2;
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, aim * speed * Math.cos(a), Math.sin(a) * speed, 1);
                        b.color = '#ff60ff';
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'ALGORITHM':
                // Geometric ring pattern
                const ringCount = this.phase === 2 ? 16 : 10;
                for (let i = 0; i < ringCount; i++) {
                    const a = (i / ringCount) * Math.PI * 2 + this.timer / 40;
                    const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed * 0.7, Math.sin(a) * speed * 0.7, 1);
                    b.color = '#7af0ff';
                    globalEnemyBullets.push(b);
                }
                break;
        }

        this.attackIndex++;
        this.attackTimer = Math.max(30, 90 - this.phase * 20);

        // Drift toward / away from player a bit (NES boss behavior)
        if (this.attackIndex % 2 === 0) {
            const range = 80;
            const tx = (dx > 0 ? player.x - this.w - range : player.x + range);
            this.x += Math.sign(tx - this.x) * 0.8;
        }
    }

    draw(ctx, camera) {
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
        const spriteKey = 'boss_' + this.kind;
        if (sprites.has(spriteKey)) {
            // Use PNG, anchored to bottom-center of hitbox
            const dims = getSpriteDims(spriteKey);
            const dx = Math.round(this.x + this.w / 2 - dims.w / 2 - camera.viewX);
            const dy = Math.round(this.y + this.h - dims.h - camera.viewY);
            if (this.hitFlash > 0 && this.hitFlash % 2 === 0) {
                // White flash on hit
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.5;
                sprites.draw(ctx, spriteKey, dx, dy, false);
                ctx.restore();
            }
            sprites.draw(ctx, spriteKey, dx, dy, false);
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
        w: 48, h: 40, hp: 28, contactDmg: 2, score: 5000,
        color: '#506070', detail: '#a8b8c8',
        grounded: true,
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
        w: 44, h: 36, hp: 32, contactDmg: 2, score: 6000,
        color: '#c0c0c8', detail: '#1a1a1a',
        grounded: true,
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
        w: 56, h: 32, hp: 36, contactDmg: 2, score: 7000,
        color: '#1040a0', detail: '#80c0ff',
        grounded: true,
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
        w: 32, h: 40, hp: 40, contactDmg: 2, score: 8000,
        color: '#a04040', detail: '#fff',
        grounded: true,
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
        w: 28, h: 38, hp: 44, contactDmg: 2, score: 9000,
        color: '#806040', detail: '#fff',
        grounded: true,
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
        w: 28, h: 36, hp: 48, contactDmg: 2, score: 10000,
        color: '#c0c0d0', detail: '#ff60ff',
        grounded: true,
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
    ALGORITHM: {
        name: 'THE ALGORITHM', tagline: 'IT KNOWS WHAT YOU WANT',
        w: 40, h: 40, hp: 60, contactDmg: 2, score: 15000,
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
        // Stages 1..9 (9 = secret). Smooth ramp; secret hardest.
        // 1: baseline, 2: +10% hp, ... 8: +70% hp + 1 contact dmg, 9: +100% hp + 1 dmg
        const s = Math.max(1, Math.min(9, stageN));
        this.stageScale = 1 + (s - 1) * 0.12;
        this.stageContactBonus = s >= 7 ? 1 : 0;
        this.stageFireRate = Math.max(0.55, 1 - (s - 1) * 0.06);
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
        // Cull off-screen-far enemies optionally (left for now)
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.alive) {
                this.enemies.splice(i, 1);
                player.score += e.score;
                continue;
            }
            e.update(level, player);

            // Dash-attack melee: knife slash hits any enemy the player intersects during the dash.
            // Each enemy can only be hit once per dash via dashAtkHits set.
            if (player.state === 'dashatk' && e.intersects(player)) {
                if (!player.dashAtkHits.has(e)) {
                    player.dashAtkHits.add(e);
                    const killed = e.hurt(3, player.facing, { knockBack: 1.8 });
                    particles.hitBurst?.(e.x + e.w / 2, e.y + e.h / 2, '#ffe070');
                    player.dmgDealt['MELEE'] = (player.dmgDealt['MELEE'] || 0) + 3;
                    if (killed) {
                        player.kills++;
                        player.combo++;
                        player.maxCombo = Math.max(player.maxCombo, player.combo);
                        const points = 150 + player.combo * 10;
                        player.score += points;
                        player.requestShake = Math.max(player.requestShake || 0, 2.5);
                        // Score popup so the dash-attack kill reads — matches
                        // the bullet-kill popup style.
                        const tier = player.combo >= 20 ? '#ff60ff'
                                   : player.combo >= 10 ? '#ff8050'
                                   : player.combo >= 5  ? '#ffe070' : '#fff';
                        particles.floatingText(e.x + e.w / 2, e.y - 2, '+' + points, tier, 45, -0.8, 1);
                    }
                }
            }
            // Contact damage (skip during dash i-frames already handled by player.iFrames)
            if (player.iFrames === 0 && e.intersects(player)) {
                player.hurt(e.contactDmg, e.x < player.x ? 1 : -1, e.x + e.w / 2, e.y + e.h / 2);
            }

            // Player bullets vs enemy
            for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
                const b = player.bullets[bi];
                if (b.stuck) continue; // Wall-stuck bullets are inert decoration
                if (b.piercing && b.hits.has(e)) continue;
                if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
                    // Weapon-specific impact opts: knockback / burn DOT
                    const opts = {};
                    if (b.weapon === 'SPREAD') opts.knockBack = 1.4;
                    if (b.weapon === 'THUNDER') opts.knockBack = 2.0;
                    if (b.weapon === 'FLAME')  { opts.burn = 90; opts.burnDPS = 0.08; }
                    const knockDir = b.vx > 0 ? 1 : (b.vx < 0 ? -1 : (e.x < player.x ? 1 : -1));
                    const killed = e.hurt(b.damage, knockDir, opts);
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
            if (!b.stuck && player.iFrames === 0 &&
                b.x > player.x && b.x < player.x + player.w &&
                b.y > hitTop && b.y < player.y + player.h) {
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

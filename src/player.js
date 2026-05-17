// Player. State machine, physics, weapons. The whole feel of the game
// lives here, so we tune by hand.

import { GAME, STATE, AIM, WEAPON, HURT_FLASH } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { drawClippyFrame, getSpriteDims } from './sprites.js';

// Quick alias so the call site reads cleanly.
const spriteDims = getSpriteDims;

const COYOTE_FRAMES = 6;     // jump-after-edge grace
const JUMP_BUFFER_MS = 110;  // matched to input buffer
const MAX_SPEED = 1.7;
const RUN_ACCEL = 0.32;
const JUMP_V = -5.3;
const JUMP_CUT = 0.45;       // velocity * this when jump released early
const SLIDE_V = 3.2;
const SLIDE_FRAMES = 22;
const ROLL_V = 2.8;
const ROLL_FRAMES = 26;
const BACKDASH_V = 3.4;
const BACKDASH_FRAMES = 16;
const DOUBLE_TAP_WINDOW = 18;  // frames between taps to count as double-tap
const HURT_FRAMES = 36;
const IFRAMES = 90;
const PRONE_HEIGHT = 8;
const STAND_HEIGHT = 22;
const PLAYER_W = 12;
const CLIMB_SPEED = 1.4;
const WEAPON_DURATION = 600;  // frames (not infinite; encourages variety)

export class Player {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = PLAYER_W; this.h = STAND_HEIGHT;
        this.vx = 0; this.vy = 0;
        this.facing = 1;
        this.state = STATE.IDLE;
        this.onGround = false;
        this.coyote = 0;
        this.animFrame = 0;
        this.animTimer = 0;

        // Health/lives
        this.maxHp = 4;
        this.hp = this.maxHp;
        this.lives = 3;
        this.iFrames = 0;
        this.hurtTimer = 0;
        this.knockX = 0;
        this.deathTimer = 0;

        // Weapons
        this.weapon = 'MG';
        this.weaponTimer = 0;
        this.weaponLevel = 1;
        this.fireCooldown = 0;
        this.bullets = [];
        this.shotsFired = 0;

        // Aim — continuous angle in radians. 0 = right, -PI/2 = up, +PI/2 = down.
        this.aim = AIM.RIGHT;        // legacy 8-way pointer (kept for compat)
        this.aimAngle = 0;           // 360-degree aim angle
        this.aimLocked = false;

        // Slide / roll / backdash
        this.slideTimer = 0;
        this.rollTimer = 0;
        this.backdashTimer = 0;
        this.spinJump = false;
        this.spinAngle = 0;

        // Double-tap tracking for roll
        this.lastLeftTap = -999;
        this.lastRightTap = -999;
        this.tapHistory = [];

        // Climb
        this.onLadder = false;
        this.onCover = false;

        // Bullet-time second chance (once per stage)
        this.secondChanceUsed = false;
        this.bulletTimeFrames = 0;

        // Combo
        this.combo = 0;
        this.comboTimer = 0;
        this.maxCombo = 0;

        // Recoil visual offset
        this.recoilTimer = 0;

        // Score/stats
        this.score = 0;
        this.kills = 0;
        this.dmgDealt = { MG: 0, SPREAD: 0, LASER: 0, FLAME: 0, HOMING: 0, THUNDER: 0 };
    }

    resetForStage() {
        this.hp = this.maxHp;
        this.weapon = 'MG';
        this.weaponLevel = 1;
        this.weaponTimer = 0;
        this.secondChanceUsed = false;
        this.combo = 0;
        this.bullets.length = 0;
        this.iFrames = 30;
    }

    // ---------- update ----------
    update(level, camera = null) {
        // Cache camera origin for aim-relative-to-screen calculation
        if (camera) { this._cameraX = camera.viewX; this._cameraY = camera.viewY; }
        else { this._cameraX = this._cameraX || 0; this._cameraY = this._cameraY || 0; }
        // Bullet-time slows everything else; player still moves normally.
        if (this.bulletTimeFrames > 0) this.bulletTimeFrames--;

        if (this.state === STATE.DIE) {
            this.deathTimer++;
            this.vy += GAME.GRAVITY;
            this.vy = Math.min(this.vy, GAME.MAX_FALL);
            this.y += this.vy;
            return;
        }

        // Decrement timers
        if (this.iFrames > 0) this.iFrames--;
        if (this.hurtTimer > 0) this.hurtTimer--;
        if (this.fireCooldown > 0) this.fireCooldown--;
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer === 0 && this.combo >= 5) audio.sfx('comboBreak');
            if (this.comboTimer === 0) this.combo = 0;
        }
        if (this.weaponTimer > 0) {
            this.weaponTimer--;
            if (this.weaponTimer === 0 && this.weapon !== 'MG') {
                this.weapon = 'MG';
                this.weaponLevel = 1;
            }
        }

        // Coyote frames
        if (this.onGround) this.coyote = COYOTE_FRAMES;
        else if (this.coyote > 0) this.coyote--;

        if (this.hurtTimer > 0) {
            // Knockback control
            this.vx = this.knockX * 0.92;
            this.vy += GAME.GRAVITY;
            this.knockX *= 0.92;
        } else if (this.state === STATE.SLIDE) {
            this.slideTimer--;
            this.vx = this.facing * SLIDE_V * (this.slideTimer / SLIDE_FRAMES + 0.4);
            this.vy += GAME.GRAVITY;
            if (this.slideTimer <= 0) this._endSlide();
            // Allow shooting during slide
            if (input.isHeld('shoot') && this.fireCooldown === 0) this._shoot();
        } else if (this.state === STATE.ROLL) {
            this.rollTimer--;
            this.vx = this.facing * ROLL_V * (this.rollTimer / ROLL_FRAMES + 0.5);
            this.vy += GAME.GRAVITY;
            if (this.rollTimer <= 0) { this.state = STATE.IDLE; this.h = STAND_HEIGHT; this.iFrames = Math.max(this.iFrames, 4); }
        } else if (this.state === STATE.BACKDASH) {
            this.backdashTimer--;
            this.vx = -this.facing * BACKDASH_V * (this.backdashTimer / BACKDASH_FRAMES);
            this.vy += GAME.GRAVITY * 0.6;
            if (this.backdashTimer <= 0) this.state = STATE.IDLE;
            // Can shoot while backdashing — Contra style
            if (input.isHeld('shoot') && this.fireCooldown === 0) this._shoot();
        } else if (this.state === STATE.CLIMB) {
            this._handleClimb(level);
        } else if (this.state === STATE.COVER) {
            this.vx = 0; this.vy = 0;
            this.iFrames = Math.max(this.iFrames, 2);
            if (!input.isHeld('up') || !this._coverAvailable(level)) {
                this.state = STATE.IDLE;
                this.onCover = false;
            }
        } else {
            this._handleInput(level);
            this.vy += GAME.GRAVITY;
            this.vy = Math.min(this.vy, GAME.MAX_FALL);
            // Spin animation in air
            if (this.state === STATE.SPIN_JUMP) this.spinAngle += 0.42;
        }

        // Move and resolve collision
        const prevY = this.y + this.h;
        const xRes = level.moveX(this, this.vx);
        this.x = xRes.x;
        if (xRes.hit) this.vx = 0;

        const yRes = level.moveY(this, this.vy, true, this.vy);
        this.y = yRes.y;
        if (yRes.hit) {
            if (yRes.landed) {
                if (!this.onGround && this.vy > 2) {
                    particles.dust(this.x + this.w / 2, this.y + this.h);
                }
                this.onGround = true;
            } else {
                // Ceiling hit
            }
            this.vy = 0;
        } else {
            this.onGround = false;
        }

        // Hazards
        if (this.iFrames === 0 && (
            level.isHazard(this.x + 2, this.y + this.h - 2) ||
            level.isHazard(this.x + this.w - 2, this.y + this.h - 2)
        )) {
            this.hurt(1, this.vx > 0 ? -1 : 1);
        }

        // Death pit
        if (this.y > level.height + 80) {
            this.kill();
        }

        // Update bullets
        this._updateBullets(level);

        // Animation
        this._updateAnim();

        // Update state derived from motion
        this._updateState();
    }

    _handleInput(level) {
        const ax = input.axis();
        const lookY = ax.y;
        const lookX = ax.x;

        // Climb attach: at a ladder, holding up/down enters climb
        if (level && this._atLadder(level) && (lookY !== 0 || this.state === STATE.CLIMB)) {
            this.state = STATE.CLIMB;
            this.vy = 0;
            return;
        }

        // Cover: at a cover spot, hold up to crouch behind
        if (level && lookY < 0 && this.onGround && this._coverAvailable(level)) {
            this.state = STATE.COVER;
            this.onCover = true;
            audio.sfx('select');
            return;
        }

        // Double-tap detection for forward roll
        this._trackTaps();
        const doubleTap = this._consumeDoubleTap();
        if (doubleTap !== 0 && this.onGround && this.state !== STATE.ROLL) {
            this.facing = doubleTap;
            this.state = STATE.ROLL;
            this.rollTimer = ROLL_FRAMES;
            this.h = PRONE_HEIGHT;
            this.iFrames = Math.max(this.iFrames, ROLL_FRAMES - 4);
            audio.sfx('slide');
            particles.dust(this.x + this.w / 2, this.y + this.h);
            return;
        }

        // Back-dash: special button (C). Defensive — backwards, brief i-frames.
        if (input.isPressed('special') && this.onGround && this.state !== STATE.BACKDASH) {
            this.state = STATE.BACKDASH;
            this.backdashTimer = BACKDASH_FRAMES;
            this.iFrames = Math.max(this.iFrames, BACKDASH_FRAMES);
            audio.sfx('slide');
            particles.dust(this.x + this.w / 2, this.y + this.h);
            return;
        }

        // 360-degree aim from mouse / right-stick / keyboard axes.
        // Camera-space position of the player so mouse aim works correctly.
        const playerScreenX = this.x + this.w / 2 - this._cameraX;
        const playerScreenY = this.y + this.h / 2 - this._cameraY;
        const aimInfo = input.aimFor(playerScreenX, playerScreenY);
        this.aim = { x: aimInfo.x, y: aimInfo.y };
        this.aimAngle = aimInfo.angle;
        // Facing auto-follows horizontal aim component (so you turn toward your target)
        if (!input.isHeld('aimlock') && Math.abs(aimInfo.x) > 0.2) {
            this.facing = aimInfo.x > 0 ? 1 : -1;
        }
        if (input.isHeld('aimlock')) {
            this.aimLocked = true;
            this.vx *= GAME.FRICTION;
        } else {
            this.aimLocked = false;
        }

        // Horizontal movement
        const canMove = !this.aimLocked && this.state !== STATE.PRONE;
        if (canMove && lookX !== 0) {
            this.facing = lookX;
            const accel = (this.state === STATE.CRAWL || this.state === STATE.CROUCH) ? RUN_ACCEL * 0.4 : RUN_ACCEL;
            const cap = (this.state === STATE.CRAWL || this.state === STATE.CROUCH) ? MAX_SPEED * 0.45 : MAX_SPEED;
            this.vx += lookX * accel;
            this.vx = Math.max(-cap, Math.min(cap, this.vx));
        } else {
            this.vx *= this.onGround ? GAME.FRICTION : GAME.AIR_FRICTION;
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
        }

        // Crouch / Prone / Crawl
        if (lookY > 0 && this.onGround && !this.aimLocked) {
            if (input.isPressed('jump') && Math.abs(this.vx) > 0.8) {
                this._startSlide();
            } else if (Math.abs(this.vx) > 0.1) {
                // Crawl: prone + moving
                if (this.state !== STATE.CRAWL) this._enterCrawl();
            } else {
                this._enterCrouch();
            }
        } else if (this.state === STATE.CROUCH || this.state === STATE.PRONE || this.state === STATE.CRAWL) {
            this._exitCrouch();
        }

        // Jump (with buffer + coyote). Super Contra style: ALWAYS spin in air.
        if ((input.isPressed('jump') || input.isBuffered('jump')) && this.coyote > 0 && this.state !== STATE.SLIDE) {
            input.consume('jump');
            this.vy = JUMP_V;
            this.onGround = false;
            this.coyote = 0;
            this.state = STATE.SPIN_JUMP;
            this.spinAngle = 0;
            audio.sfx('jump');
        }

        // Jump cut on release
        if (input.isReleased('jump') && this.vy < 0) {
            this.vy *= JUMP_CUT;
        }

        // Shoot
        if (input.isHeld('shoot') && this.fireCooldown === 0) {
            this._shoot();
        }
    }

    _trackTaps() {
        const ax = input.axis();
        if (input.isPressed('right')) this.tapHistory.push({ dir: 1, t: 0 });
        if (input.isPressed('left'))  this.tapHistory.push({ dir: -1, t: 0 });
        for (const tap of this.tapHistory) tap.t++;
        this.tapHistory = this.tapHistory.filter(tap => tap.t < DOUBLE_TAP_WINDOW);
    }
    _consumeDoubleTap() {
        if (this.tapHistory.length < 2) return 0;
        const a = this.tapHistory[this.tapHistory.length - 2];
        const b = this.tapHistory[this.tapHistory.length - 1];
        if (a.dir === b.dir && a.t < DOUBLE_TAP_WINDOW && b.t > 2) {
            this.tapHistory.length = 0;
            return a.dir;
        }
        return 0;
    }

    _enterCrawl() {
        this.state = STATE.CRAWL;
        this.h = PRONE_HEIGHT;
    }

    _handleClimb(level) {
        const ax = input.axis();
        this.vy = ax.y * CLIMB_SPEED;
        this.vx = ax.x * CLIMB_SPEED * 0.4;
        // Animation cycles only while moving
        if (Math.abs(this.vy) > 0.1) this.animFrame += 0.4;
        // Jump while climbing detaches
        if (input.isPressed('jump')) {
            this.state = STATE.JUMP;
            this.vy = JUMP_V * 0.7;
            this.onLadder = false;
            audio.sfx('jump');
        }
        // Drop off bottom
        if (!this._atLadder(level)) {
            this.state = STATE.IDLE;
            this.onLadder = false;
        }
        // Shoot while climbing (Contra)
        if (input.isHeld('shoot') && this.fireCooldown === 0) {
            this._shoot();
        }
    }

    _atLadder(level) {
        const px = this.x + this.w / 2;
        const py = this.y + this.h / 2;
        return level.tileAt(px, py) === 3 /* TILE.LADDER */;
    }

    _coverAvailable(level) {
        const px = this.x + this.w / 2;
        const py = this.y + this.h - 1;
        return level.tileAt(px, py) === 7 /* TILE.COVER */;
    }

    _axisToAim(x, y) {
        if (x > 0 && y < 0) return AIM.UP_RIGHT;
        if (x < 0 && y < 0) return AIM.UP_LEFT;
        if (x > 0 && y > 0) return AIM.DOWN_RIGHT;
        if (x < 0 && y > 0) return AIM.DOWN_LEFT;
        if (x === 0 && y < 0) return AIM.UP;
        if (x === 0 && y > 0) return AIM.DOWN;
        if (x > 0) return AIM.RIGHT;
        if (x < 0) return AIM.LEFT;
        return this.facing > 0 ? AIM.RIGHT : AIM.LEFT;
    }

    _enterCrouch() {
        if (this.state !== STATE.CROUCH && this.state !== STATE.PRONE) {
            this.state = STATE.CROUCH;
            this.h = STAND_HEIGHT - 4;
        }
    }
    _exitCrouch() {
        if (this.state === STATE.CROUCH || this.state === STATE.PRONE) {
            this.state = STATE.IDLE;
            this.h = STAND_HEIGHT;
        }
    }
    _startSlide() {
        this.state = STATE.SLIDE;
        this.h = PRONE_HEIGHT;
        this.slideTimer = SLIDE_FRAMES;
        this.iFrames = Math.max(this.iFrames, SLIDE_FRAMES); // brief invincibility
        audio.sfx('slide');
        particles.dust(this.x + this.w / 2, this.y + this.h);
    }
    _endSlide() {
        this.state = STATE.IDLE;
        this.h = STAND_HEIGHT;
    }

    _updateState() {
        // States that own themselves
        const owned = [STATE.SLIDE, STATE.CROUCH, STATE.PRONE, STATE.CRAWL,
                       STATE.HURT, STATE.DIE, STATE.ROLL, STATE.BACKDASH,
                       STATE.CLIMB, STATE.COVER, STATE.SPIN_JUMP];
        if (owned.includes(this.state)) {
            // Reset spin-jump if we land
            if (this.state === STATE.SPIN_JUMP && this.onGround) {
                this.state = STATE.IDLE;
                this.spinAngle = 0;
            }
            return;
        }
        if (!this.onGround) {
            this.state = this.vy < 0 ? STATE.JUMP : STATE.FALL;
        } else if (Math.abs(this.vx) > 0.2) {
            this.state = STATE.RUN;
        } else {
            this.state = STATE.IDLE;
        }
    }

    _updateAnim() {
        this.animTimer++;
        const speed = this.state === STATE.RUN ? 4 : 12;
        if (this.animTimer >= speed) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 1024;
        }
    }

    // ---------- shooting ----------
    _shoot() {
        const w = WEAPON[this.weapon];
        const rate = Math.max(2, w.fireRate - this.weaponLevel * 1.5);
        this.fireCooldown = rate;

        // Bullet emerges from the rifle tip — radius 10 from center body.
        const muzzleR = 12;
        const baseX = this.x + this.w / 2 + this.aim.x * muzzleR;
        const baseY = this.y + this.h / 2 + this.aim.y * muzzleR;

        const fire = (vx, vy) => {
            const b = {
                x: baseX, y: baseY,
                vx, vy,
                damage: w.damage * (1 + (this.weaponLevel - 1) * 0.5),
                color: w.color,
                weapon: this.weapon,
                life: 60,
                piercing: w.piercing || false,
                homing: w.homing || false,
                chain: w.chain || false,
                dot: w.dot || false,
                hits: new Set(),
            };
            this.bullets.push(b);
        };

        const dx = this.aim.x, dy = this.aim.y;
        const sp = w.bulletSpeed;
        const norm = Math.hypot(dx, dy) || 1;
        const ndx = dx / norm, ndy = dy / norm;

        if (this.weapon === 'SPREAD') {
            for (let i = 0; i < (w.shots + this.weaponLevel - 1); i++) {
                const ang = (i - (w.shots - 1) / 2) * w.spread;
                const cos = Math.cos(ang), sin = Math.sin(ang);
                fire(ndx * sp * cos - ndy * sp * sin, ndx * sp * sin + ndy * sp * cos);
            }
        } else if (this.weapon === 'THUNDER') {
            // Hit-scan vertical zap on first enemy in line
            fire(0, 0); // dummy; chain handler resolves the rest
            this.bullets[this.bullets.length - 1].chainStartX = baseX;
            this.bullets[this.bullets.length - 1].chainStartY = baseY;
            this.bullets[this.bullets.length - 1].life = 14;
        } else {
            const j = (Math.random() - 0.5) * (w.spread || 0) * sp;
            fire(ndx * sp + (Math.abs(ndy) < 0.1 ? 0 : j), ndy * sp + (Math.abs(ndx) < 0.1 ? 0 : j));
        }

        // Muzzle effects + recoil + shell ejection
        particles.muzzleFlash(baseX, baseY, ndx, ndy, w.color);
        particles.shellEject(this.x + this.w / 2 - this.facing * 2, this.y + 8, this.facing);
        audio.sfx(w.sound);
        this.shotsFired++;
        this.recoilTimer = 4;   // frames; offsets the sprite slightly back
    }

    _updateBullets(level) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.life--;

            if (b.homing && b._target) {
                const tx = b._target.x + b._target.w / 2;
                const ty = b._target.y + b._target.h / 2;
                const dx = tx - b.x, dy = ty - b.y;
                const d = Math.hypot(dx, dy) || 1;
                const speed = WEAPON[b.weapon].bulletSpeed;
                b.vx = b.vx * 0.85 + (dx / d) * speed * 0.15;
                b.vy = b.vy * 0.85 + (dy / d) * speed * 0.15;
            }

            b.x += b.vx;
            b.y += b.vy;

            // Wall collision
            if (level.isSolid(b.x, b.y)) {
                particles.hitSpark(b.x, b.y, b.color);
                this.bullets.splice(i, 1);
                continue;
            }
            if (b.life <= 0) {
                this.bullets.splice(i, 1);
                continue;
            }
        }
    }

    // Called by EnemyManager when a bullet hits an enemy.
    onBulletHit(bullet, enemy, killed) {
        if (!bullet.piercing) {
            const idx = this.bullets.indexOf(bullet);
            if (idx >= 0) this.bullets.splice(idx, 1);
        } else {
            bullet.hits.add(enemy);
        }
        particles.hitSpark(bullet.x, bullet.y, bullet.color);
        this.dmgDealt[bullet.weapon] = (this.dmgDealt[bullet.weapon] || 0) + bullet.damage;
        if (killed) {
            this.kills++;
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.comboTimer = 90;
            this.score += 100 + this.combo * 10;
            // Combo milestones
            if (this.combo === 5 || this.combo === 10 || this.combo === 20 || this.combo === 30) {
                audio.sfx('combo');
                particles.floatingText(enemy.x + enemy.w / 2, enemy.y, this._comboLabel(), '#ffe070', 60);
                this.score += this.combo * 100;
            }
        }
    }
    _comboLabel() {
        if (this.combo >= 30) return 'GOD LIKE';
        if (this.combo >= 20) return 'CARNAGE';
        if (this.combo >= 10) return 'RAMPAGE';
        return 'STREAK';
    }

    pickup(type) {
        if (type === 'LIFE') {
            this.hp = Math.min(this.maxHp, this.hp + 1);
            this.score += 50;
            audio.sfx('pickup');
            return;
        }
        if (type === '1UP') {
            this.lives++;
            audio.sfx('powerup');
            return;
        }
        if (WEAPON[type]) {
            if (this.weapon === type) {
                if (this.weaponLevel < 3) {
                    this.weaponLevel++;
                    audio.sfx('powerup');
                } else {
                    this.score += 500;
                    audio.sfx('pickup');
                }
            } else {
                this.weapon = type;
                this.weaponLevel = 1;
                audio.sfx('powerup');
            }
            this.weaponTimer = WEAPON_DURATION;
        }
    }

    hurt(dmg, knockDir = 0) {
        if (this.iFrames > 0 || this.state === STATE.DIE) return;
        this.hp -= dmg;
        // Bullet-time second-chance rescue
        if (this.hp <= 0 && !this.secondChanceUsed) {
            this.secondChanceUsed = true;
            this.hp = 1;
            this.bulletTimeFrames = 60;
            particles.floatingText(this.x + this.w / 2, this.y - 4, 'CLOSE!', '#ff5050', 60);
        }
        if (this.hp <= 0) {
            this.kill();
            return;
        }
        this.state = STATE.HURT;
        this.hurtTimer = HURT_FRAMES;
        this.iFrames = IFRAMES;
        this.knockX = knockDir * 1.6;
        this.vy = -2.2;
        this.combo = 0;
        audio.sfx('hurt');
        particles.blood(this.x + this.w / 2, this.y + 6, knockDir > 0 ? -1 : 1);
    }

    kill() {
        if (this.state === STATE.DIE) return;
        this.state = STATE.DIE;
        this.deathTimer = 0;
        this.vy = -3.5;
        this.vx = 0;
        audio.sfx('die');
        particles.explosion(this.x + this.w / 2, this.y + this.h / 2, '#a01020', 30);
    }

    isDead() {
        return this.state === STATE.DIE && this.deathTimer > 90;
    }

    // ---------- drawing ----------
    draw(ctx, camera) {
        // Flicker on i-frames
        if (this.iFrames > 0 && this.iFrames % 4 < 2) return;

        const frame = this._frameForState();
        const dims = spriteDims(frame);
        const recoilDX = this.recoilTimer > 0 ? -this.facing * (this.recoilTimer > 2 ? 1 : 0) : 0;
        const cx = this.x + this.w / 2 - camera.viewX + recoilDX;
        const cy = this.y + this.h - dims.h / 2 - camera.viewY + 1;

        // Spin-jump rotates the whole sprite around its center
        if (this.state === STATE.SPIN_JUMP) {
            ctx.save();
            ctx.translate(Math.round(cx), Math.round(cy));
            ctx.rotate(this.spinAngle * (this.facing > 0 ? 1 : -1));
            drawClippyFrame(ctx, frame, -dims.w / 2, -dims.h / 2, this.facing < 0);
            ctx.restore();
        } else {
            const drawX = Math.round(cx - dims.w / 2);
            const drawY = Math.round(cy - dims.h / 2);
            drawClippyFrame(ctx, frame, drawX, drawY, this.facing < 0);
        }

        // Aim indicator: draw a small targeting reticule line from chest to aim
        if (input.aimActive && this.state !== STATE.DIE && this.state !== STATE.HURT) {
            const reticleX = this.x + this.w / 2 + this.aim.x * 24 - camera.viewX;
            const reticleY = this.y + this.h / 2 + this.aim.y * 24 - camera.viewY;
            ctx.fillStyle = '#ff5050';
            ctx.fillRect(Math.round(reticleX) - 1, Math.round(reticleY) - 1, 2, 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(Math.round(reticleX), Math.round(reticleY), 1, 1);
        }

        if (this.recoilTimer > 0) this.recoilTimer--;

        // Bullets
        for (const b of this.bullets) {
            const bx = Math.round(b.x - camera.viewX);
            const by = Math.round(b.y - camera.viewY);
            ctx.fillStyle = b.color;
            if (b.weapon === 'LASER') {
                ctx.fillRect(bx - 2, by, 4, 2);
            } else if (b.weapon === 'THUNDER') {
                // Lightning zigzag
                let ly = by;
                ctx.fillStyle = '#fffac8';
                for (let yy = 0; yy < 200; yy += 3) {
                    ctx.fillRect(bx + (Math.random() * 4 - 2), by + yy, 2, 3);
                }
            } else {
                ctx.fillRect(bx - 1, by - 1, 3, 3);
            }
        }
    }

    _frameForState() {
        // Are we shooting (or just shot)? Use shoot-pose variants
        const shooting = this.fireCooldown > 0 && this.fireCooldown >= (WEAPON[this.weapon].fireRate - 4);
        // Aim band: convert aimAngle to up / diag / forward / diag-down / down
        // angles measured from horizontal; up = -PI/2, down = +PI/2
        const a = this.aimAngle;
        let aimBand = 'forward';
        // Use absolute angle relative to facing
        const angleAbs = Math.abs(a);
        const angleNorm = (a < 0 ? -a : a);  // 0=right, PI/2=down, PI=left
        // We care about: up (close to -PI/2), diag-up (-PI/2..-PI/4), forward, diag-down, down
        if (a < -1.2) aimBand = 'up';
        else if (a < -0.4) aimBand = 'diag-up';
        else if (a > 1.2) aimBand = 'down';
        else if (a > 0.4) aimBand = 'diag-down';

        switch (this.state) {
            case STATE.RUN: {
                if (shooting) return 'run_shoot_1';
                const phase = Math.floor(this.animFrame) % 4;
                const seq = ['run_1', 'run_2', 'run_3', 'run_2'];
                return seq[phase];
            }
            case STATE.JUMP:
            case STATE.FALL: return 'jump';
            case STATE.SPIN_JUMP: {
                // 4-frame spin: jump → spin_1 (90°) → spin_2 (180°) → spin_1 mirrored (270°)
                const phase = Math.floor(this.spinAngle / (Math.PI / 2)) % 4;
                const seq = ['jump', 'spin_1', 'spin_2', 'spin_1'];
                return seq[phase];
            }
            case STATE.CROUCH: return 'crouch';
            case STATE.PRONE:
            case STATE.SLIDE:
            case STATE.CRAWL:
            case STATE.ROLL: return 'prone';
            case STATE.BACKDASH: return 'backdash';
            case STATE.CLIMB: return Math.floor(this.animFrame) % 2 === 0 ? 'run_1' : 'run_2';
            case STATE.COVER: return 'crouch';
            case STATE.HURT: return 'hurt';
            case STATE.DIE: {
                if (this.deathTimer < 30) return 'death_hit';
                if (this.deathTimer < 60) return 'death_explode';
                return 'death_burning';
            }
            default: {
                // Idle picks aim-up / aim-diag / shoot variants
                if (aimBand === 'up') return 'aim_up';
                if (aimBand === 'diag-up') return 'aim_diag';
                if (shooting) return 'shoot';
                return 'idle';
            }
        }
    }
}

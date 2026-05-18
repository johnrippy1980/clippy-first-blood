// Player. State machine, physics, weapons. The whole feel of the game
// lives here, so we tune by hand.

import { GAME, STATE, AIM, WEAPON, HURT_FLASH, AMBIENT } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { drawClippyFrame, getSpriteDims } from './sprites.js';
import { drawText } from './pixelfont.js';

// Quick alias so the call site reads cleanly.
const spriteDims = getSpriteDims;

const COYOTE_FRAMES = 6;     // jump-after-edge grace
const JUMP_BUFFER_MS = 110;  // matched to input buffer
const MAX_SPEED = 2.0;
const RUN_ACCEL = 0.36;
const JUMP_V = -7.5;         // ~3 tiles of vertical clearance; reaches platforms reliably
const JUMP_CUT = 0.42;       // velocity * this when jump released early
const SLIDE_V = 3.2;
const SLIDE_FRAMES = 22;
const ROLL_V = 2.8;
const ROLL_FRAMES = 26;
const DASH_ATK_V = 3.6;        // faster than roll, shorter
const DASH_ATK_FRAMES = 18;
const DASH_ATK_DAMAGE = 3;     // knife slash damage
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
            // Light horizontal drift so Clippy arcs sideways instead of
            // falling straight down. Air friction tapers vx to zero.
            this.vx *= 0.985;
            this.x += this.vx;
            this.y += this.vy;
            return;
        }

        // Decrement timers
        if (this.iFrames > 0) this.iFrames--;
        if (this.weaponPickupFlash > 0) this.weaponPickupFlash--;
        // Tick the damage-indicator countdown on the update path, not the draw path
        if (this.lastHurtSrc && this.lastHurtSrc.frames > 0) this.lastHurtSrc.frames--;
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
        if (this.onGround) { this.coyote = COYOTE_FRAMES; this.airJumpsLeft = 1; }
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
            if (input.isHeld('shoot') && this.fireCooldown <= 0) this._shoot();
        } else if (this.state === STATE.ROLL) {
            this.rollTimer--;
            this.vx = this.facing * ROLL_V * (this.rollTimer / ROLL_FRAMES + 0.5);
            this.vy += GAME.GRAVITY;
            if (this.rollTimer <= 0) { this.state = STATE.IDLE; this.h = STAND_HEIGHT; this.iFrames = Math.max(this.iFrames, 4); }
        } else if (this.state === STATE.DASH_ATTACK) {
            this.dashAtkTimer--;
            // Linear lunge with brief tail-off — front-loaded for snap
            const t = this.dashAtkTimer / DASH_ATK_FRAMES;
            this.vx = this.facing * DASH_ATK_V * (0.4 + t * 0.6);
            this.vy += GAME.GRAVITY;
            // Slash particles trailing the dash
            if (this.dashAtkTimer % 3 === 0) {
                particles.spawn(
                    this.x + this.w / 2 + this.facing * 6,
                    this.y + this.h / 2 + (Math.random() - 0.5) * 4,
                    -this.facing * 0.6, 0,
                    6 + Math.random() * 4, '#fff', 1, 0
                );
            }
            if (this.dashAtkTimer <= 0) {
                this.state = STATE.IDLE;
                this.iFrames = Math.max(this.iFrames, 4);
            }
        } else if (this.state === STATE.BACKDASH) {
            this.backdashTimer--;
            this.vx = -this.facing * BACKDASH_V * (this.backdashTimer / BACKDASH_FRAMES);
            this.vy += GAME.GRAVITY * 0.6;
            if (this.backdashTimer <= 0) this.state = STATE.IDLE;
            // Can shoot while backdashing — Contra style
            if (input.isHeld('shoot') && this.fireCooldown <= 0) this._shoot();
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
                    audio.sfx('land');
                }
                this.onGround = true;
            } else {
                // Ceiling hit
            }
            this.vy = 0;
        } else {
            // Ground-stick: if we were grounded and only barely moved off,
            // probe 2px below — if solid, snap back. Prevents the run state
            // from flickering to fall every other frame from gravity drift.
            if (this.onGround && this.vy >= 0 && this.vy < 2) {
                const probeY = this.y + this.h + 1;
                // Standing on a platform counts too — check both SOLID and PLATFORM
                const onPlatform = (x) => {
                    const tile = level.tileAt(x, probeY);
                    return tile === 1 || tile === 2; // TILE.SOLID || TILE.PLATFORM
                };
                if (
                    onPlatform(this.x + 2) ||
                    onPlatform(this.x + this.w / 2) ||
                    onPlatform(this.x + this.w - 2)
                ) {
                    // Snap back to the ground/platform edge
                    const tileTop = Math.floor(probeY / GAME.TILE) * GAME.TILE;
                    this.y = tileTop - this.h;
                    this.vy = 0;
                    this.onGround = true;
                } else {
                    this.onGround = false;
                }
            } else {
                this.onGround = false;
            }
        }

        // Water check: if any part of player is in water, apply drag and update flags.
        // Probe at feet, mid, and head positions.
        const feetInWater = level.isWater(this.x + this.w / 2, this.y + this.h - 2);
        const midInWater = level.isWater(this.x + this.w / 2, this.y + this.h / 2);
        const inWater = feetInWater || midInWater;
        const wasInWater = this.inWater || false;
        this.inWater = inWater;
        this.waterFeet = feetInWater;
        if (inWater) {
            // Drag — heavier in deeper water (mid-body submerged)
            const drag = midInWater ? 0.78 : 0.86;
            this.vx *= drag;
            // Buoyancy: cap fall speed and gently push up if fully submerged
            this.vy = Math.min(this.vy, midInWater ? 0.9 : 1.6);
            if (midInWater && !this.onGround) this.vy *= 0.92;
            // Splash entry burst
            if (!wasInWater) {
                audio.sfx('splash');
                particles.dust(this.x + this.w / 2, this.y + this.h - 2);
                this.requestShake = Math.max(this.requestShake || 0, 1.0);
            }
            // Hold-DOWN duck-hide while standing in water
            const isHoldingDown = input.isHeld('down');
            this.waterHidden = isHoldingDown && this.waterFeet;
            // Occasional frog croak from the surrounding swamp
            this._frogTick = (this._frogTick || 0) + 1;
            if (this._frogTick >= AMBIENT.FROG_CROAK_MIN_GAP_F && Math.random() < AMBIENT.FROG_CROAK_PROB) {
                audio.sfx('frogCroak');
                this._frogTick = 0;
            }
        } else {
            // Splash exit burst
            if (wasInWater) {
                audio.sfx('splash');
                particles.dust(this.x + this.w / 2, this.y + this.h);
            }
            this.waterHidden = false;
        }

        // Tall-grass cover: if the upper body is inside a GRASS tile, the
        // player is hidden from enemy AI. No input required — passive cover.
        // Probe at mid-body and head so a crouched player still hides if the
        // grass tile sits at sprite-head level.
        this.grassHidden = level.isGrass(this.x + this.w / 2, this.y + this.h / 2)
            || level.isGrass(this.x + this.w / 2, this.y + 4);

        // Footstep tick when running on the ground.
        // Skip footstep sfx when grass-hidden — sells the "stealth" beat,
        // and prevents step audio from giving the player's position away
        // while the AI thought-bubbles say "WHERE'D HE GO?".
        if (this.onGround && Math.abs(this.vx) > 0.8 && this.state !== STATE.SLIDE && !this.grassHidden) {
            this._footstepTick = (this._footstepTick || 0) + 1;
            if (this._footstepTick >= 14) {
                this._footstepTick = 0;
                audio.sfx(this.inWater ? 'wade' : 'step');
            }
        } else {
            this._footstepTick = 0;
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

        // Double-tap forward — dash attack with knife slash. Closes range,
        // brief i-frames, melee damage to enemies in path. Symmetric to backdash (C).
        this._trackTaps();
        const doubleTap = this._consumeDoubleTap();
        if (doubleTap !== 0 && this.onGround && this.state !== STATE.DASH_ATTACK) {
            this.facing = doubleTap;
            this.state = STATE.DASH_ATTACK;
            this.dashAtkTimer = DASH_ATK_FRAMES;
            this.dashAtkHits = new Set(); // each enemy hit only once per dash
            this.iFrames = Math.max(this.iFrames, DASH_ATK_FRAMES - 4);
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
        // Double-jump — one extra mid-air leap with a burst puff. Slightly weaker.
        else if (input.isPressed('jump') && !this.onGround && (this.airJumpsLeft || 0) > 0
                 && this.state !== STATE.SLIDE && this.state !== STATE.BACKDASH) {
            input.consume('jump');
            this.airJumpsLeft--;
            this.vy = JUMP_V * 0.85;
            this.state = STATE.SPIN_JUMP;
            this.spinAngle = 0;
            audio.sfx('jump');
            // Visual: ring puff at feet to telegraph the double-jump
            particles.dust(this.x + this.w / 2, this.y + this.h);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                particles.spawn(
                    this.x + this.w / 2 + Math.cos(a) * 6,
                    this.y + this.h - 2 + Math.sin(a) * 2,
                    Math.cos(a) * 0.8, Math.abs(Math.sin(a)) * 0.4,
                    8 + Math.random() * 4, '#a0c0e0', 1, 0
                );
            }
        }

        // Jump cut on release
        if (input.isReleased('jump') && this.vy < 0) {
            this.vy *= JUMP_CUT;
        }

        // Shoot
        if (input.isHeld('shoot') && this.fireCooldown <= 0) {
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
        if (input.isHeld('shoot') && this.fireCooldown <= 0) {
            this._shoot();
        }
    }

    _atLadder(level) {
        const px = this.x + this.w / 2;
        const py = this.y + this.h / 2;
        return level.tileAt(px, py) === 3 /* TILE.LADDER */;
    }

    _coverAvailable(level) {
        // Probe at the player's bottom-pixel. Cover tiles sit at the row that
        // the player's feet occupy (the row just above the solid floor).
        // Check a 3-tile-wide band so the player doesn't have to stand on
        // the exact pixel — anywhere within an 8px lateral tolerance counts.
        const py = this.y + this.h - 1;
        const cxs = [this.x + this.w / 2, this.x + 2, this.x + this.w - 2];
        for (const px of cxs) {
            if (level.tileAt(px, py) === 7 /* TILE.COVER */) return true;
        }
        return false;
    }

    // For HUD hint: true if there's a cover tile within ~1 tile of the player,
    // so we can show "↑ HIDE" before they're standing on top of it.
    _coverNearby(level) {
        const py = this.y + this.h - 1;
        for (let dx = -16; dx <= 16; dx += 4) {
            if (level.tileAt(this.x + this.w / 2 + dx, py) === 7) return true;
        }
        return false;
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
                       STATE.HURT, STATE.DIE, STATE.ROLL, STATE.DASH_ATTACK,
                       STATE.BACKDASH, STATE.CLIMB, STATE.COVER, STATE.SPIN_JUMP];
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
        const rate = Math.max(2, Math.round(w.fireRate - this.weaponLevel * 1.5));
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
        this.recoilTimer = 6;
        // Camera kick on each shot. Only THUNDER actually shakes — the smaller
        // kicks at 0.5-0.9 stacked into a constant tremor during sustained MG fire,
        // which read as twitch rather than weight. Recoil now lives in muzzle FX +
        // shell ejection, not in the camera.
        const kickMap = { THUNDER: 2.0 };
        const kick = kickMap[this.weapon] || 0;
        if (kick) this.requestShake = Math.max(this.requestShake || 0, kick);
    }

    _updateBullets(level) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.life--;

            // Stuck-in-wall bullets just decay in place, fading out.
            if (b.stuck) {
                b.stuckLife--;
                if (b.stuckLife <= 0) this.bullets.splice(i, 1);
                continue;
            }

            if (b.homing && b._target) {
                const tx = b._target.x + b._target.w / 2;
                const ty = b._target.y + b._target.h / 2;
                const dx = tx - b.x, dy = ty - b.y;
                const d = Math.hypot(dx, dy) || 1;
                const speed = WEAPON[b.weapon].bulletSpeed;
                b.vx = b.vx * 0.85 + (dx / d) * speed * 0.15;
                b.vy = b.vy * 0.85 + (dy / d) * speed * 0.15;
            }

            b.prevX = b.x; b.prevY = b.y;
            b.x += b.vx;
            b.y += b.vy;

            // Wall collision
            if (level.isSolid(b.x, b.y)) {
                particles.hitSpark(b.x, b.y, b.color);
                // Impact-stick: MG/SPREAD/LASER bury into the wall and fade.
                // FLAME/THUNDER/HOMING have their own visual death (puff, lightning
                // dissipation, explosion) so they vanish on contact as before.
                if (b.weapon === 'MG' || b.weapon === 'SPREAD' || b.weapon === 'LASER') {
                    // Step back to last clear position so the bullet sits flush
                    // against the wall surface, not embedded inside the tile.
                    b.x = b.prevX; b.y = b.prevY;
                    b.vx = 0; b.vy = 0;
                    b.stuck = true;
                    b.stuckLife = b.weapon === 'LASER' ? 8 : 14;
                    b.stuckLifeMax = b.stuckLife;
                } else {
                    this.bullets.splice(i, 1);
                }
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
            // Cap pierce at 3 enemies — LASER doesn't wallhack the whole level
            if (bullet.hits.size >= 3) {
                const idx = this.bullets.indexOf(bullet);
                if (idx >= 0) this.bullets.splice(idx, 1);
            }
        }
        particles.hitBurst(bullet.x, bullet.y, bullet.color);
        this.dmgDealt[bullet.weapon] = (this.dmgDealt[bullet.weapon] || 0) + bullet.damage;
        // Damage numbers on non-kill hits — only for high-HP targets (bosses /
        // miniboss). Grunts die in 1-2 hits, so a number would just be noise.
        // Helps players see chip-damage progress on long boss bars.
        if (!killed && enemy.maxHp >= 8) {
            const dmgLabel = bullet.damage >= 1 ? '-' + Math.round(bullet.damage) : '-' + bullet.damage.toFixed(1);
            // Slight horizontal jitter so multi-hit bursts don't stack on one column
            const jx = (Math.random() - 0.5) * 6;
            particles.floatingText(bullet.x + jx, bullet.y - 2, dmgLabel, '#ff8050', 28, -0.7, 0);
        }
        if (killed) {
            this.kills++;
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.comboTimer = 90;
            const points = 100 + this.combo * 10;
            this.score += points;
            // Game-feel: short hit-pause + screen-shake on every kill.
            this.hitPauseFrames = Math.max(this.hitPauseFrames || 0, AMBIENT.HIT_PAUSE_KILL_F);
            this.requestShake = Math.max(this.requestShake || 0, 1.6);
            // Per-kill score popup — color by combo tier
            const tier = this.combo >= 20 ? '#ff60ff' : this.combo >= 10 ? '#ff8050' : this.combo >= 5 ? '#ffe070' : '#fff';
            particles.floatingText(enemy.x + enemy.w / 2, enemy.y - 2, '+' + points, tier, 45, -0.8, 1);
            // Combo milestones — big bouncy label + tiered audio escalation
            if (this.combo === 5 || this.combo === 10 || this.combo === 20 || this.combo === 30) {
                const tierSfx = this.combo >= 30 ? 'combo4' : this.combo >= 20 ? 'combo3' : this.combo >= 10 ? 'combo2' : 'combo';
                audio.sfx(tierSfx);
                particles.floatingText(enemy.x + enemy.w / 2, enemy.y - 14, this._comboLabel(), '#ffe070', 80, -0.4, 2);
                this.score += this.combo * 100;
                this.requestShake = Math.max(this.requestShake || 0, 3.5);
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
        // Visual fanfare for ANY pickup — radial burst at Clippy's center
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const burstBurst = (color, count = 10) => {
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
                const sp = 1.2 + Math.random() * 1.4;
                particles.spawn(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 14 + Math.random() * 6, color, 1, -0.05);
            }
            // Center white flash
            for (let i = 0; i < 4; i++) particles.spawn(cx, cy, 0, 0, 5 - i, '#fff', 2, 0);
        };

        if (type === 'LIFE') {
            this.hp = Math.min(this.maxHp, this.hp + 1);
            this.score += 50;
            audio.sfx('pickup');
            burstBurst('#50ff70');
            particles.floatingText(cx, this.y - 4, '+1 HP', '#50ff70', 55, -0.8, 1);
            return;
        }
        if (type === '1UP') {
            // Cap at 9 — keeps the HUD "x{N}" label inside its slot, and 9 is
            // already absurd for a Contra-style game (death-tax mechanic only).
            this.lives = Math.min(9, this.lives + 1);
            audio.sfx('powerup');
            burstBurst('#ffe070', 14);
            particles.floatingText(cx, this.y - 4, '1 UP!', '#ffe070', 75, -0.7, 2);
            return;
        }
        if (WEAPON[type]) {
            const w = WEAPON[type];
            if (this.weapon === type) {
                if (this.weaponLevel < 3) {
                    this.weaponLevel++;
                    audio.sfx('powerup');
                    burstBurst(w.color, 12);
                    particles.floatingText(cx, this.y - 4,
                        'LV ' + this.weaponLevel + '!', w.color, 60, -0.7, 2);
                } else {
                    // Already maxed — convert into score
                    this.score += 500;
                    audio.sfx('pickup');
                    burstBurst('#ffe070');
                    particles.floatingText(cx, this.y - 4, '+500', '#ffe070', 50, -0.7, 1);
                }
            } else {
                this.weapon = type;
                this.weaponLevel = 1;
                audio.sfx('powerup');
                burstBurst(w.color, 14);
                // Weapon name in its own color — bigger scale
                const label = type === 'MG' ? 'MACHINE' : type;
                particles.floatingText(cx, this.y - 4, label, w.color, 80, -0.5, 2);
                // HUD glyph flash flag — read by hud.js
                this.weaponPickupFlash = 30;
            }
            this.weaponTimer = WEAPON_DURATION;
        }
    }

    hurt(dmg, knockDir = 0, srcX = null, srcY = null) {
        if (this.iFrames > 0 || this.state === STATE.DIE) return;
        // Remember the damage source for the off-screen indicator
        if (srcX != null) {
            this.lastHurtSrc = { x: srcX, y: srcY, frames: AMBIENT.DAMAGE_INDICATOR_F };
        }
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
        this.knockX = knockDir * 2.4;
        this.vy = -3.0;
        this.combo = 0;
        audio.sfx('hurt');
        particles.blood(this.x + this.w / 2, this.y + 6, knockDir > 0 ? -1 : 1);
        // Big game-feel: hit-pause + heavy screen shake on player damage
        this.hitPauseFrames = Math.max(this.hitPauseFrames || 0, AMBIENT.HIT_PAUSE_HURT_F);
        this.requestShake = Math.max(this.requestShake || 0, 4.5);
    }

    kill() {
        if (this.state === STATE.DIE) return;
        this.state = STATE.DIE;
        this.deathTimer = 0;
        // Bigger pop-up — Clippy launches dramatically before gravity yanks him
        // back. Direction biased away from facing so he flies backward.
        this.vy = -5.5;
        this.vx = -this.facing * 1.6;
        // Lock the spin direction at death time so it doesn't oscillate.
        this._deathSpin = this.facing >= 0 ? -1 : 1;
        audio.sfx('die');
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        // Triple-burst explosion — initial red blast, then orange + smoke
        particles.explosion(cx, cy,         '#a01020', 30);
        particles.explosion(cx + 4, cy - 4, '#ff5050', 18);
        particles.explosion(cx - 4, cy + 2, '#ffe070', 14);
        // Shell-eject burst — Clippy's bullets scatter
        for (let i = 0; i < 6; i++) {
            particles.shellEject(cx + (Math.random() - 0.5) * 8, cy, (i & 1) ? 1 : -1);
        }
        this.requestShake = Math.max(this.requestShake || 0, 8);
        this.hitPauseFrames = Math.max(this.hitPauseFrames || 0, AMBIENT.HIT_PAUSE_HURT_F * 2);
    }

    isDead() {
        return this.state === STATE.DIE && this.deathTimer > 90;
    }

    // ---------- drawing ----------
    draw(ctx, camera, level = null) {
        // Cover prompt: a pulsing "↑ HIDE" hint above the player when they're
        // near a cover tile and not already in cover. Drawn FIRST so it sits
        // behind the player sprite — feels less HUD-ish, more diegetic.
        if (level && this.state !== STATE.COVER && this.onGround && this._coverNearby(level)) {
            const px = Math.round(this.x + this.w / 2 - camera.viewX);
            const py = Math.round(this.y - 24 - camera.viewY);
            const pulse = (Math.sin(performance.now() * 0.012) + 1) * 0.5;
            ctx.save();
            ctx.globalAlpha = 0.55 + pulse * 0.35;
            ctx.fillStyle = 'rgba(8, 4, 14, 0.85)';
            ctx.fillRect(px - 22, py - 2, 44, 11);
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(px - 22, py - 2, 44, 1);
            ctx.fillRect(px - 22, py + 8, 44, 1);
            drawText(ctx, '^ HIDE', px, py + 1, '#ffe070', 1, 'center');
            ctx.restore();
        }

        // Flicker on i-frames
        if (this.iFrames > 0 && this.iFrames % 4 < 2) return;

        const frame = this._frameForState();
        const dims = spriteDims(frame);
        const recoilDX = this.recoilTimer > 0 ? -this.facing * (this.recoilTimer > 3 ? 2 : 1) : 0;
        const cx = this.x + this.w / 2 - camera.viewX + recoilDX;
        const cy = this.y + this.h - dims.h / 2 - camera.viewY + 1;

        // Ducked in swamp water — replace sprite with surface ripple + tiny periscope head
        if (this.waterHidden) {
            const surfX = Math.round(this.x + this.w / 2 - camera.viewX);
            const surfY = Math.round(this.y + this.h - 6 - camera.viewY);
            // Two concentric ripple rings
            ctx.strokeStyle = 'rgba(122,240,191,0.65)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(surfX, surfY, 5, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(122,240,191,0.35)';
            ctx.beginPath(); ctx.arc(surfX, surfY, 9, 0, Math.PI * 2); ctx.stroke();
            // Just the tip of Clippy's clip visible above water — two grey pixels
            ctx.fillStyle = '#a0a0b0';
            ctx.fillRect(surfX - 1, surfY - 3, 2, 1);
            ctx.fillRect(surfX, surfY - 4, 1, 1);
            return;
        }

        // Wading in water — render Clippy with lower body cut off + splash particles at feet
        if (this.inWater && this.waterFeet) {
            const surfY = Math.round(this.y + this.h - 6 - camera.viewY);
            // Clip lower body so submerged part is hidden
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, GAME.W, surfY + 1);
            ctx.clip();
            const drawX = Math.round(cx - dims.w / 2);
            const drawY = Math.round(cy - dims.h / 2);
            drawClippyFrame(ctx, frame, drawX, drawY, this.facing < 0);
            ctx.restore();
            // Surface line at waist
            ctx.fillStyle = '#7af0bf';
            ctx.globalAlpha = 0.45 + Math.sin(this._waterTick = (this._waterTick || 0) + 0.2) * 0.2;
            ctx.fillRect(Math.round(cx) - 8, surfY, 16, 1);
            ctx.globalAlpha = 1;
            return;
        }

        // Spin-jump rotates the whole sprite around its center
        if (this.state === STATE.SPIN_JUMP) {
            ctx.save();
            ctx.translate(Math.round(cx), Math.round(cy));
            ctx.rotate(this.spinAngle * (this.facing > 0 ? 1 : -1));
            drawClippyFrame(ctx, frame, -dims.w / 2, -dims.h / 2, this.facing < 0);
            ctx.restore();
        } else if (this.state === STATE.DIE) {
            // Death pinwheel — Clippy spins helplessly through the air. Spin
            // speed eases out so the sprite settles before isDead() returns
            // true and the run ends.
            ctx.save();
            ctx.translate(Math.round(cx), Math.round(cy));
            const spinDir = this._deathSpin || -1;
            const spinSpeed = Math.max(0.05, 0.4 * (1 - this.deathTimer / 90));
            ctx.rotate(spinDir * this.deathTimer * spinSpeed);
            // Red glow halo while falling — sells the "fatal hit" read
            const glowAlpha = Math.max(0, 0.5 - this.deathTimer / 180);
            if (glowAlpha > 0.02) {
                ctx.globalAlpha = glowAlpha;
                ctx.fillStyle = '#ff2030';
                ctx.fillRect(-dims.w / 2 - 3, -dims.h / 2 - 3, dims.w + 6, dims.h + 6);
                ctx.globalAlpha = 1;
            }
            drawClippyFrame(ctx, frame, -dims.w / 2, -dims.h / 2, this.facing < 0);
            ctx.restore();
            // Periodic spark bursts every 10 frames during the fall, so the
            // explosion reads as ongoing rather than one big pop at t=0.
            if (this.deathTimer > 0 && this.deathTimer % 10 === 0 && this.deathTimer < 60) {
                const sx = this.x + this.w / 2 + (Math.random() - 0.5) * 8;
                const sy = this.y + this.h / 2 + (Math.random() - 0.5) * 8;
                particles.hitSpark(sx, sy, '#ffe070');
            }
        } else {
            const drawX = Math.round(cx - dims.w / 2);
            const drawY = Math.round(cy - dims.h / 2);
            drawClippyFrame(ctx, frame, drawX, drawY, this.facing < 0);
        }

        // Aim-direction arm overlay: small procedural arm + gun barrel that points
        // in the actual aim direction. Layered on top of the base sprite so we get
        // 8-way aim coverage without needing a sprite-frame per direction.
        if (this.state !== STATE.DIE && this.state !== STATE.HURT &&
            this.state !== STATE.SPIN_JUMP && this.state !== STATE.DASH_ATTACK &&
            this.state !== STATE.BACKDASH && this.state !== STATE.ROLL) {
            this._drawAimArm(ctx, cx, cy);
        }

        // Dash-attack: render a quick knife slash arc out in front
        if (this.state === STATE.DASH_ATTACK) {
            const t = 1 - (this.dashAtkTimer / DASH_ATK_FRAMES);
            const arcCx = Math.round(cx + this.facing * 8);
            const arcCy = Math.round(cy + 2);
            // Blade — bright streak from inside to outside
            const reach = 4 + Math.round(t * 10);
            ctx.fillStyle = '#fff';
            ctx.fillRect(arcCx, arcCy - 1, this.facing * reach, 2);
            ctx.fillStyle = '#c0e0ff';
            ctx.fillRect(arcCx + this.facing * (reach - 2), arcCy - 3, this.facing * 3, 1);
            ctx.fillRect(arcCx + this.facing * (reach - 2), arcCy + 2, this.facing * 3, 1);
            // Hilt
            ctx.fillStyle = '#604030';
            ctx.fillRect(arcCx - this.facing, arcCy - 1, this.facing * 2, 3);
        }

        // Aim crosshair at actual cursor. The lead-line from player-to-cursor
        // was previously drawn here but it added visual noise without helping
        // the player aim (the crosshair already shows the target); removed.
        if (input.aimActive && this.state !== STATE.DIE && this.state !== STATE.HURT) {
            const mx = input.mouseX, my = input.mouseY;
            // Crosshair: 4 bars + center dot, with a pulsing outer ring so the
            // reticle stays findable against busy painted bgs.
            const cx = Math.round(mx), cy = Math.round(my);
            const pulse = (Math.sin(performance.now() * 0.012) + 1) * 0.5; // 0..1
            ctx.fillStyle = `rgba(255, 224, 112, ${0.18 + pulse * 0.22})`;
            // Outer ring (8 dots forming a diamond)
            ctx.fillRect(cx, cy - 6, 1, 1);
            ctx.fillRect(cx, cy + 6, 1, 1);
            ctx.fillRect(cx - 6, cy, 1, 1);
            ctx.fillRect(cx + 6, cy, 1, 1);
            ctx.fillRect(cx - 4, cy - 4, 1, 1);
            ctx.fillRect(cx + 4, cy - 4, 1, 1);
            ctx.fillRect(cx - 4, cy + 4, 1, 1);
            ctx.fillRect(cx + 4, cy + 4, 1, 1);
            ctx.fillStyle = '#ff5050';
            ctx.fillRect(cx - 4, cy, 3, 1);
            ctx.fillRect(cx + 2, cy, 3, 1);
            ctx.fillRect(cx, cy - 4, 1, 3);
            ctx.fillRect(cx, cy + 2, 1, 3);
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(cx, cy, 1, 1);
        }

        if (this.recoilTimer > 0) this.recoilTimer--;

        // Bullets
        for (const b of this.bullets) {
            const bx = Math.round(b.x - camera.viewX);
            const by = Math.round(b.y - camera.viewY);
            // Stuck-in-wall bullets fade out as a tiny embedded pixel — no glow,
            // no hot center. Adds a beat of "you hit the wall, here's the divot"
            // before vanishing, rather than the bullet disappearing on contact.
            if (b.stuck) {
                const fade = b.stuckLife / b.stuckLifeMax;
                ctx.globalAlpha = fade * 0.85;
                ctx.fillStyle = b.color;
                ctx.fillRect(bx, by, 2, 2);
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = fade * 0.4;
                ctx.fillRect(bx, by, 1, 1);
                ctx.globalAlpha = 1;
                continue;
            }
            if (b.weapon === 'LASER') {
                // Short cyan dart — outer glow + bright core. Previous render
                // drew a continuous prev→current beam that read as a hard
                // white aim-line across the screen, which players described
                // as "weird". Now it's a focused projectile, not a streak.
                ctx.fillStyle = b.color;
                ctx.globalAlpha = 0.55;
                ctx.fillRect(bx - 2, by - 1, 5, 3);
                ctx.globalAlpha = 1;
                ctx.fillRect(bx - 1, by, 3, 1);
                ctx.fillStyle = '#fff';
                ctx.fillRect(bx, by, 1, 1);
            } else if (b.weapon === 'THUNDER') {
                let ly = by;
                ctx.fillStyle = '#fffac8';
                for (let yy = 0; yy < 200; yy += 3) {
                    ctx.fillRect(bx + (Math.random() * 4 - 2), by + yy, 2, 3);
                }
            } else if (b.weapon === 'FLAME') {
                // Soft flame puff
                ctx.fillStyle = b.color;
                ctx.globalAlpha = 0.6;
                ctx.fillRect(bx - 2, by - 2, 5, 5);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(bx - 1, by - 1, 3, 3);
            } else {
                // HOMING gets a curve-revealing trail — its path is non-linear so the trail adds info.
                // MG/SPREAD skip the trail — too many bullets at once turns the screen to mush.
                if (b.weapon === 'HOMING' && b.prevX != null) {
                    const px = Math.round(b.prevX - camera.viewX);
                    const py = Math.round(b.prevY - camera.viewY);
                    ctx.globalAlpha = 0.45;
                    this._line(ctx, px, py, bx, by, b.color, 1);
                    ctx.globalAlpha = 1;
                }
                // Outer glow
                ctx.fillStyle = b.color;
                ctx.globalAlpha = 0.5;
                ctx.fillRect(bx - 2, by - 2, 5, 5);
                ctx.globalAlpha = 1;
                ctx.fillRect(bx - 1, by - 1, 3, 3);
                // Hot center
                ctx.fillStyle = '#fff';
                ctx.fillRect(bx, by, 1, 1);
            }
        }
    }

    // Procedural arm + gun barrel pointing along the aim vector.
    // Avoids needing 8-direction sprite sheets while still showing aim direction.
    _drawAimArm(ctx, cx, cy) {
        const ax = this.aim?.x, ay = this.aim?.y;
        if (ax == null) return;
        // Don't draw arm when aim is essentially still (close to ±forward without much vertical)
        // — let the painted sprite speak. We still draw barrel for clarity.
        // Shoulder anchor — slightly above center, in front of body
        const sx = Math.round(cx + this.facing * 2);
        const sy = Math.round(cy - 3);
        // Arm extends 5px along the aim, then barrel 8px
        const armLen = 5;
        const barrelLen = 8;
        const recoilPull = this.recoilTimer > 0 ? Math.min(3, this.recoilTimer / 2) : 0;
        const elbowX = sx + ax * armLen;
        const elbowY = sy + ay * armLen;
        const muzzleX = elbowX + ax * (barrelLen - recoilPull);
        const muzzleY = elbowY + ay * (barrelLen - recoilPull);
        // Arm — thicker, light steel grey
        this._line(ctx, sx, sy, elbowX, elbowY, '#b0b0c0', 2);
        // Barrel — dark outline + bright core (reads against painted bgs)
        this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#101018', 3);
        this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#d8d8e0', 1);
        // Muzzle tip — bright dot when fireCooldown is fresh (just fired)
        if (this.recoilTimer > 2) {
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(Math.round(muzzleX) - 1, Math.round(muzzleY) - 1, 3, 3);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(Math.round(muzzleX), Math.round(muzzleY), 1, 1);
        }
    }

    // Bresenham-style stepped fillRect line. No anti-aliasing — preserves pixel canvas feel.
    _line(ctx, x0, y0, x1, y1, color, thickness = 1) {
        ctx.fillStyle = color;
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        let x = Math.round(x0), y = Math.round(y0);
        const tEnd = Math.round(x1), eEnd = Math.round(y1);
        const t = thickness;
        let safety = 64;
        while (safety-- > 0) {
            ctx.fillRect(x, y, t, t);
            if (x === tEnd && y === eEnd) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx)  { err += dx; y += sy; }
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
                if (shooting) {
                    // Cycle through run-shoot frames
                    const phase = Math.floor(this.animFrame / 2) % 3;
                    return ['run_shoot_1', 'run_shoot_2', 'run_shoot_3'][phase];
                }
                // 5-frame run cycle
                const phase = Math.floor(this.animFrame) % 5;
                return ['run_1', 'run_2', 'run_3', 'run_4', 'run_5'][phase];
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
                // Pick sprite by aim band — fall back gracefully if a variant is missing.
                // Procedural arm overlay handles fine-grained aim direction on top.
                if (aimBand === 'up') return 'aim_up';
                if (aimBand === 'diag-up') return 'aim_diag';
                if (aimBand === 'down' || aimBand === 'diag-down') {
                    // No down-aim sprite — use crouch as a crude approximation.
                    // Arm overlay still points correctly.
                    return shooting ? 'crouch_shoot' : 'crouch';
                }
                if (shooting) return 'shoot';
                return 'idle';
            }
        }
    }
}

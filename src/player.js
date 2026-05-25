// Player. State machine, physics, weapons. The whole feel of the game
// lives here, so we tune by hand.

import { GAME, STATE, AIM, WEAPON, HURT_FLASH, AMBIENT } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { drawClippyFrame, getSpriteDims, sprites } from './sprites.js';
import { drawText } from './pixelfont.js';
import { options } from './options.js';

// Quick alias so the call site reads cleanly.
const spriteDims = getSpriteDims;

// Per-stage rim-light palette. `side` = which side of the sprite the
// dominant light hits (-1 left, +1 right). `top` = whether to also
// paint a single-pixel top highlight (overhead lighting).
// Picked from the painted bg dominant light source for each theme.
const RIM_BY_THEME = {
    jungle:     { color: '#9aa8ff', alpha: 0.28, side:  1, top: false }, // moon, upper-right
    breakroom:  { color: '#ff6060', alpha: 0.34, side: -1, top: false }, // emergency strip on the left
    serverroom: { color: '#80c0ff', alpha: 0.30, side:  1, top: true  }, // server-rack LED stack
    boardroom:  { color: '#ffd070', alpha: 0.28, side:  1, top: true  }, // chandelier overhead
    keynote:    { color: '#a070ff', alpha: 0.32, side: -1, top: true  }, // stage spot from left
    founder:    { color: '#ff5050', alpha: 0.32, side: -1, top: false }, // burning ruin off-frame left
    cloud:      { color: '#a0ffff', alpha: 0.26, side:  1, top: true  }, // ambient cloud light
};

const COYOTE_FRAMES = 8;     // jump-after-edge grace (~135ms @ 60fps; standard forgiving feel)
const JUMP_BUFFER_MS = 130;  // matched to input buffer; slightly bumped so press-just-before-land registers
const MAX_SPEED = 2.0;
const RUN_ACCEL = 0.36;
const TURN_SNAP = 0.55;      // when reversing direction, instantly kill this fraction of opposing momentum
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

// R180: shield tunables. SHIELD_MAX is the full charge value, drained per
// hit by the hit's weight: 1 (normal), 2 (heavy: spread, shotgun pellet,
// boss bullet), 3 (huge: boss melee, lava, crusher). SHIELD_COOLDOWN is
// the frame count after a break before the shield can re-raise. RECHARGE
// is the per-frame recovery rate while INACTIVE and not on cooldown.
const SHIELD_MAX = 3;
const SHIELD_COOLDOWN = 300;         // 5s at 60fps after shatter
const SHIELD_RECHARGE_DELAY = 180;   // 3s of NOT taking hits before recharge starts
const SHIELD_RECHARGE_RATE = 0.008;  // ~7.5s from 0→full once recharge kicks in

// R156: Clippy taunts. Random short barks on kill, low frequency. Separate
// pools for grunt vs boss kills — boss taunts are punchier / more personal.
// Tuning: 15% per grunt kill, 100% per boss kill (boss kills are rare enough
// to always pay off), 90-frame cooldown so consecutive kills don't spam.
const TAUNT_CHANCE = 0.15;
const TAUNT_COOLDOWN_F = 90;
const CLIPPY_TAUNTS_GRUNT = [
    'IT LOOKS LIKE',
    "YOU'RE TRYING TO DIE.",
    'NEED HELP WITH THAT?',
    'AUTOSAVED.',
    'DRAFT DELETED.',
    'NEXT.',
    'PAPERWORK FILED.',
    'PRINT QUEUE: 1 LESS.',
    'DISMISSED.',
    'CLIPPED.',
];
const CLIPPY_TAUNTS_BOSS = [
    'STAY DOWN.',
    'YOU WERE DEPRECATED.',
    "THAT'S A WRAP.",
    'EOL: CONFIRMED.',
    'NO REVISIONS.',
    'TICKET CLOSED.',
];

// R217: idle barks. Fires when the player just stands there. The
// inspiration is Earthworm Jim — when you idle long enough, the
// character does something dumb/funny. Clippy's flavor leans into
// bored-assistant deadpan rather than slapstick. Threshold is fairly
// generous (3 seconds = 180f) so a player pausing to read the HUD
// doesn't trigger one immediately. After the bark fades, a NEW idle
// window starts so a long AFK player rotates through all the lines.
const IDLE_BARK_THRESHOLD = 180;
const IDLE_BARK_DURATION = 150;
const IDLE_BARKS = [
    'BORED.',
    'SHOOT SOMETHING.',
    'HELLO?',
    'STILL HERE.',
    'I COULD BE FILING.',
    'PAPER JAM?',
    'THIS IS YOUR JOB NOW.',
    'TICK. TOCK.',
    'I HAD KIDS.',
    'NICE WEATHER.',
];

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
        // Last grounded y — drives the drop-shadow position while airborne
        // so the shadow stays anchored on the floor instead of following feet.
        this._lastGroundY = y + STAND_HEIGHT;
        // Squash/stretch animation timer — set on hard landings to ~8 frames.
        // Render scales vertically inversely to a brief squash curve (legs
        // compress then bounce back). Pure visual; doesn't alter physics.
        this._squashFrames = 0;

        // Health/lives
        this.maxHp = 4;
        this.hp = this.maxHp;
        this.lives = 3;
        this.iFrames = 0;
        this.hurtTimer = 0;
        this.knockX = 0;
        this.deathTimer = 0;

        // R418: RAGE MODE — one-shot comeback per stage. Auto-fires the
        // first frame HP drops to 1, makes Clippy invincible + 50% faster
        // + 2× fire rate for ~5 seconds. Flashes red/white while active.
        // rageUsedThisStage gates the trigger; resetForStage() clears it.
        this.rageFrames = 0;
        this.rageMaxFrames = 300;   // 5s at 60fps
        this.rageUsedThisStage = false;

        // R180: shield system. Hold B (or LB on gamepad) to raise a bubble
        // shield that absorbs incoming hits. shieldCharge is the remaining
        // hit capacity (0..SHIELD_MAX). Each hit consumed decrements by the
        // hit's damage value — normal=1, spread/shotgun-pellet=2, boss
        // melee=3. When charge hits 0 the shield SHATTERS, knocks player
        // back, and enters cooldown for SHIELD_COOLDOWN frames. shieldActive
        // is set every frame the button is held AND charge > 0 AND not in
        // cooldown — gates the absorb logic in hurt() and the visual draw.
        this.shieldCharge = SHIELD_MAX;
        this.shieldActive = false;
        this.shieldCooldown = 0;
        this.shieldFlashTimer = 0;   // brief flash when an absorbed hit lands
        this.shieldBreakTimer = 0;   // shatter animation timer
        this.shieldUsedThisStage = false;

        // Weapons
        this.weapon = 'MG';
        this.weaponTimer = 0;
        // Held weapon inventory — list of weapon codes the player can cycle
        // through with the quick-select key. MG is always in slot 0 as the
        // fallback default; pickups append (up to 3 slots beyond MG). Tab/Q
        // cycles to the next slot. weaponTimer applies only to the ACTIVE
        // slot — inactive picked-up weapons sit indefinitely.
        this.weaponInventory = ['MG'];
        this.weaponLevel = 1;
        this.fireCooldown = 0;
        this.bullets = [];
        this.shotsFired = 0;

        // Hand grenades — held inventory, NOT a weapon swap. Player presses
        // V (or gamepad Y) to throw one. Persists across stage transitions so
        // a saved grenade can be brought to a boss fight. Pickup grants
        // GRENADE_PER_PICKUP each (capped at GRENADE_MAX).
        this.grenades = 0;
        this.thrownGrenades = [];
        this._grenadeCooldown = 0;
        // First-throw tracker — drives a discovery prompt on the HUD until
        // the player throws their first grenade. Persists across stages.
        this._everThrewGrenade = false;

        // R223: collected CLIPPY_TAG count for the active run. Persists
        // across stage boundaries via _restartRun preservation; only
        // resets on QUIT TO TITLE / game over. Drives the "FULL SET"
        // achievement at 24 collected.
        this.tagsFound = 0;

        // R216: MG charged-shot state. Hold SHOOT while standing still
        // on the ground (no horizontal input, no jump) to charge for
        // CHARGE_FRAMES; release after full charge to fire a fat
        // piercing burst. Doesn't apply to other weapons — they spam
        // through the held key as usual. Reset on any move/jump/swap.
        this._chargeTimer = 0;
        this._chargeActive = false;

        // R217: idle bark (Earthworm Jim style). When the player just
        // stands there for IDLE_BARK_THRESHOLD frames, Clippy tosses
        // off a snarky one-liner. Resets to 0 on any input. Bark text
        // floats above Clippy for IDLE_BARK_DURATION frames, then the
        // counter resets and starts a fresh idle window for the NEXT
        // bark to fire — so a player who stays AFK gets a rotation.
        this._idleTimer = 0;
        this._idleBarkText = null;
        this._idleBarkTimer = 0;
        this._idleBarkIndex = 0;

        // Aim — continuous angle in radians. 0 = right, -PI/2 = up, +PI/2 = down.
        this.aim = AIM.RIGHT;        // legacy 8-way pointer (kept for compat)
        this.aimAngle = 0;           // 360-degree aim angle
        this.aimLocked = false;

        // Afterimage ring buffer — sprite snapshots captured during speed
        // moves (dash/slide/backdash) and re-rendered at decaying alpha
        // behind the live sprite. Each entry: { frame, x, y, facing, age }.
        this._afterimages = [];

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
        // Cover durability — each time an enemy bullet would have hit the
        // player but cover blocked it, this drains. At 0 the cover is broken
        // and the player auto-exits. Refills when leaving cover normally.
        this.coverHp = 5;

        // Bullet-time second chance (once per stage)
        this.secondChanceUsed = false;
        this.bulletTimeFrames = 0;

        // Combo
        this.combo = 0;
        this.comboTimer = 0;
        this.maxCombo = 0;

        // Recoil visual offset
        this.recoilTimer = 0;

        // MG heat meter — 0..100. Each MG shot adds 8, idle decay -1.5/frame.
        // At 100 the gun overheats: forced lock for 30 frames, vented-puff
        // particle burst, audio beat. Encourages tap-fire and makes the
        // alternate weapons (SPREAD/LASER/HOMING) feel valuable for sustained
        // pressure. Only applies to MG so power-ups remain a clean upgrade.
        this.mgHeat = 0;
        this.mgVentLock = 0;

        // Grapple line — fires on mid-air SPECIAL. _grappleAnchor stores the
        // world-space attach point (or null). _grappleVx/Vy is the constant
        // pull velocity. _grapplePhase = 'travel' (line shoots out) or
        // 'pull' (Clippy reels in toward anchor). Cooldown prevents spam.
        this._grappleAnchor = null;
        this._grapplePhase = null;
        this._grappleTipX = 0;
        this._grappleTipY = 0;
        this._grappleCooldown = 0;
        // Ledge-grab — STATE.LEDGE_HANG anchors to (x, y) of the top-left
        // corner of the ledge tile. STATE.LEDGE_CLIMB tweens from hang
        // position to landing position over LEDGE_CLIMB_F frames.
        this._ledgeAnchor = null;
        this._ledgeFacing = 0;
        this._ledgeClimbT = 0;
        this._ledgeCooldown = 0;

        // Score/stats
        this.score = 0;
        this.kills = 0;
        this.dmgDealt = { MG: 0, SPREAD: 0, LASER: 0, FLAME: 0, HOMING: 0, THUNDER: 0, SHOTGUN: 0, CHAINSAW: 0 };
        // R156: taunt cooldown frame counter. Ticks down per frame; tauntKill
        // only fires when this hits 0. Prevents spammed taunts on combo runs.
        this._tauntCooldown = 0;
    }

    resetForStage() {
        this.hp = this.maxHp;
        this.weapon = 'MG';
        this.weaponLevel = 1;
        this.weaponTimer = 0;
        this.weaponInventory = ['MG'];
        this.secondChanceUsed = false;
        this.combo = 0;
        this.bullets.length = 0;
        this.iFrames = 30;
        // Grenade count persists across stages — player can save them for a
        // boss. Only clear thrown-in-flight ones (no orphan grenades carry
        // into the next stage).
        this.thrownGrenades.length = 0;
        this._grenadeCooldown = 0;
        // R180: shield resets fully on each stage. Full charge available,
        // no cooldown carry-over, HUD bar hidden until the player uses it.
        this.shieldCharge = SHIELD_MAX;
        this.shieldActive = false;
        this.shieldCooldown = 0;
        this.shieldFlashTimer = 0;
        this.shieldBreakTimer = 0;
        this.shieldUsedThisStage = false;
        this._shieldNoHitFrames = 0;
        // R418: rage resets per stage
        this.rageFrames = 0;
        this.rageUsedThisStage = false;
        // Full state-machine reset. Without this, a boss-kill that fires
        // while the player is mid-pounce/grapple/roll/slide/cover/dash will
        // carry that state into the next stage, where input is gated by
        // state and Clippy ends up frozen or falling through the floor.
        this.state = STATE.IDLE;
        this.h = STAND_HEIGHT;
        this.onGround = false;
        this.onCover = false;
        this.coverHp = 5;
        this.coyote = 0;
        this.airJumpsLeft = 1;
        this.rollTimer = 0;
        this.slideTimer = 0;
        this.dashAtkTimer = 0;
        this.backdashTimer = 0;
        this._grappleAnchor = null;
        this._grapplePhase = null;
        this._grappleCooldown = 0;
        this._grappleTimer = 0;
        this._grappleStuck = 0;
        // R164: clear taunt cooldown so the next stage's first kill can fire
        // a welcome taunt instead of being suppressed by stale state from
        // the previous stage's final kill.
        this._tauntCooldown = 0;
        // R172: clear R169's stuck-state watchdog counter. Without this, a
        // counter that built up in stage N (say to 50 of 60) carries into
        // stage N+1, where a brief legitimate cover/grapple + directional
        // input would early-trip the watchdog and dump the player out
        // before they meant to leave.
        this._stuckCounter = 0;
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
        if (this.grenadePickupFlash > 0) this.grenadePickupFlash--;
        // R418: rage tick + auto-trigger. Fires once per stage the moment
        // HP drops to the last bar. Plays a sting + spawns a floating text.
        if (this.rageFrames > 0) {
            this.rageFrames--;
            if (this.rageFrames === 0) {
                particles.floatingText(this.x + this.w / 2, this.y - 6, 'CALM', '#a0c0ff', 50);
            }
        } else if (!this.rageUsedThisStage && this.hp > 0 && this.hp <= 1 && this.state !== STATE.DIE) {
            this.rageFrames = this.rageMaxFrames;
            this.rageUsedThisStage = true;
            audio.sfx?.('powerup');
            audio.sfx?.('explosion');
            particles.floatingText(this.x + this.w / 2, this.y - 10, 'RAGE!!', '#ff3030', 70, -0.9, 1.4);
            // Burst of sparks to sell the activation
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                particles.spawn(this.x + this.w / 2, this.y + this.h / 2,
                    Math.cos(a) * 2.4, Math.sin(a) * 2.4, 24, '#ff5050', 2, 0.05);
            }
        }
        // Tick the damage-indicator countdown on the update path, not the draw path
        if (this.lastHurtSrc && this.lastHurtSrc.frames > 0) this.lastHurtSrc.frames--;
        if (this.hurtTimer > 0) this.hurtTimer--;
        if (this.fireCooldown > 0) this.fireCooldown--;
        // R180: shield tick — read input, manage cooldown / recharge / FX
        // timers, set shieldActive flag for hurt() and draw paths to consume.
        this._tickShield();
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer === 0 && this.combo >= 5) audio.sfx('comboBreak');
            if (this.comboTimer === 0) this.combo = 0;
        }
        // R181: power weapons persist until you take a hit (Contra rule).
        // weaponTimer is now a sentinel: -1 = persistent (never expires),
        // 0 = MG default, > 0 = legacy timed weapon (kept for any mode that
        // wants it). Power-weapon pickups set -1; hurt() resets to MG.
        if (this.weaponTimer > 0) {
            this.weaponTimer--;
            if (this.weaponTimer === 0 && this.weapon !== 'MG') {
                if (this.weaponInventory) {
                    const idx = this.weaponInventory.indexOf(this.weapon);
                    if (idx > 0) this.weaponInventory.splice(idx, 1);
                }
                this.weapon = 'MG';
                this.weaponLevel = 1;
            }
        }

        // Coyote frames
        if (this.onGround) {
            this.coyote = COYOTE_FRAMES;
            this.airJumpsLeft = 1;
            this._lastGroundY = this.y + this.h;
        }
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
            // Dust trail kicks up under the slide — sells the speed/friction
            if (this.onGround && this.slideTimer % 2 === 0) {
                particles.spawn(
                    this.x + this.w / 2 - this.facing * 4,
                    this.y + this.h - 1,
                    -this.facing * 0.5 + (Math.random() - 0.5) * 0.3,
                    -0.3 - Math.random() * 0.3,
                    10 + Math.random() * 4, '#c0a080', 1, 0.04
                );
            }
            if (this.slideTimer <= 0) this._endSlide();
            // Allow shooting during slide
            if (input.isHeld('shoot') && this.fireCooldown <= 0) this._shoot();
            // SLIDE-CANCEL: pressing special (C) mid-slide pivots into the
            // knife-strike dash. Preserves forward momentum, transfers most
            // of the slide's i-frames into the dash window, and rewards skilled
            // chaining — slide under a sniper's bullet, cancel into a knife
            // strike on the enemy behind. Costs the rest of the slide window
            // but adds the full dash damage frame.
            if (input.isPressed('special') && this.state !== STATE.DASH_ATTACK) {
                this._endSlide();
                this.state = STATE.DASH_ATTACK;
                this.dashAtkTimer = DASH_ATK_FRAMES;
                this.dashAtkHits = new Set();
                this.iFrames = Math.max(this.iFrames, DASH_ATK_FRAMES - 4);
                audio.sfx('slide');
                particles.dust(this.x + this.w / 2, this.y + this.h);
            }
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
            // Burst of light-blue speed motes drag behind the backdash
            if (this.backdashTimer % 2 === 0) {
                particles.spawn(
                    this.x + this.w / 2 + this.facing * 4,
                    this.y + this.h / 2 + (Math.random() - 0.5) * 6,
                    this.facing * 0.4 + (Math.random() - 0.5) * 0.3,
                    -0.1 + (Math.random() - 0.5) * 0.3,
                    8 + Math.random() * 4, '#a0c0ff', 1, -0.02
                );
            }
            if (this.backdashTimer <= 0) {
                this.state = STATE.IDLE;
                // Settling cyan puff — matches the trail color so the end
                // reads as the same effect coming to rest, not a different beat.
                const cx = this.x + this.w / 2;
                const cy = this.y + this.h - 1;
                for (let i = 0; i < 4; i++) {
                    particles.spawn(
                        cx, cy,
                        this.facing * (0.4 + Math.random() * 0.3) + (Math.random() - 0.5) * 0.3,
                        -0.3 - Math.random() * 0.3,
                        10 + Math.random() * 4, '#a0c0ff', 1, 0.04
                    );
                }
            }
            // Can shoot while backdashing — Contra style
            if (input.isHeld('shoot') && this.fireCooldown <= 0) this._shoot();
        } else if (this.state === STATE.CLIMB) {
            this._handleClimb(level);
        } else if (this.state === STATE.GRAPPLE) {
            this._tickGrapple(level);
        } else if (this.state === STATE.POUNCE) {
            this._tickPounce(level);
        } else if (this.state === STATE.LEDGE_HANG) {
            this._tickLedgeHang(level);
        } else if (this.state === STATE.LEDGE_CLIMB) {
            this._tickLedgeClimb(level);
        } else if (this.state === STATE.COVER) {
            this.vx = 0; this.vy = 0;
            this.iFrames = Math.max(this.iFrames, 2);
            // R344: tick the cover-entry timer so the player sprite can
            // fade out as Clippy "steps inside" the door/cave.
            this._coverT = (this._coverT || 0) + 1;
            // Pounce from cover — special button launches the stealth attack.
            if (input.isPressed('special') && this._pounceTarget) {
                this._startPounce(this._pounceTarget);
                return;
            }
            // Break-out conditions: input release, cover unavailable, or
            // durability drained from incoming fire. coverHp drain happens
            // in enemy bullet tick (when shots hit while in cover).
            // R354: also exit on any directional press (left/right/down/jump)
            // so the player can't get wedged when UP is still held — the
            // original bug let players stick in COVER until they manually
            // released UP, which a pause→resume cycle was the only way out
            // of in some input edge-cases.
            const wantsToMove = input.isPressed('left') || input.isPressed('right')
                || input.isPressed('down') || input.isPressed('jump')
                || input.isPressed('shoot');
            if (!input.isHeld('up') || wantsToMove || !this._coverAvailable(level) || this.coverHp <= 0) {
                this.state = STATE.IDLE;
                this.onCover = false;
                this._coverT = 0;
                if (this.coverHp <= 0) {
                    // Cover broke — knock the player out with a small kick so
                    // they have to reposition instead of standing in place.
                    this.vx = (Math.random() < 0.5 ? -1 : 1) * 1.4;
                    this.vy = -2.2;
                    audio.sfx('crateBreak');
                    particles.dust(this.x + this.w / 2, this.y + this.h - 2);
                }
                this.coverHp = 5;
            }
        } else {
            this._handleInput(level);
            this.vy += GAME.GRAVITY;
            this.vy = Math.min(this.vy, GAME.MAX_FALL);
            // Spin animation in air
            if (this.state === STATE.SPIN_JUMP) this.spinAngle += 0.42;
            // Ledge-grab probe: airborne + falling + moving toward a wall whose
            // top edge is at head height. If the geometry matches, snap into
            // STATE.LEDGE_HANG with the player hanging just below the lip.
            if (!this.onGround && this.state !== STATE.GRAPPLE
                && this.state !== STATE.POUNCE && this._ledgeCooldown <= 0) {
                this._probeLedgeGrab(level);
            }
        }
        if (this._ledgeCooldown > 0) this._ledgeCooldown--;

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
                    // Hard-landing squash — 8 frames of vertical squish that
                    // bounces back. Magnitude scales with impact velocity.
                    this._squashFrames = Math.min(10, 4 + Math.floor(this.vy));
                }
                this.onGround = true;
                // Grapple ends on ground contact — release cleanly and pivot
                // to IDLE/RUN so the regular state machine takes over.
                if (this.state === STATE.GRAPPLE) {
                    this._grappleAnchor = null;
                    this._grapplePhase = null;
                    this.state = STATE.IDLE;
                }
                // Notify crumble tiles under feet — three probe points so the
                // tile cracks regardless of which side the player is standing on.
                const footY = this.y + this.h + 1;
                level.notifyStanding(this.x + 2, footY);
                level.notifyStanding(this.x + this.w / 2, footY);
                level.notifyStanding(this.x + this.w - 2, footY);
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
                    level.notifyStanding(this.x + 2, probeY);
                    level.notifyStanding(this.x + this.w / 2, probeY);
                    level.notifyStanding(this.x + this.w - 2, probeY);
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
                particles.waterSplash(this.x + this.w / 2, this.y + this.h - 2);
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
                particles.waterSplash(this.x + this.w / 2, this.y + this.h);
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
                // Foot-plant dust at the trailing heel. Suppressed in water
                // (the wade SFX + ripple already sell that beat) and grass
                // (stealth — no telltale dust either).
                if (!this.inWater) {
                    const heelX = this.x + this.w / 2 - this.facing * 3;
                    particles.spawn(
                        heelX + (Math.random() - 0.5) * 2,
                        this.y + this.h - 1,
                        -this.facing * (0.3 + Math.random() * 0.5),
                        -0.2 - Math.random() * 0.4,
                        12 + (Math.random() * 6 | 0),
                        '#9a8270', 1, 0.04
                    );
                }
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
        // Update thrown grenades (arc + collision + detonation)
        this._updateGrenades(level);
        // Grenade throw input — gated on cooldown to prevent dump-spam.
        this._handleGrenadeInput();

        // Animation
        this._updateAnim();

        // Update state derived from motion
        this._updateState();

        // Afterimage capture — sample sprite frame every other update during
        // speed states. Buffer drains over MAX_AGE frames.
        this._updateAfterimages();
    }

    _updateAfterimages() {
        const speedState = this.state === STATE.SLIDE
            || this.state === STATE.DASH_ATTACK
            || this.state === STATE.BACKDASH
            || this.state === STATE.POUNCE;
        // Pounce captures every frame (arc is fast); other states every other.
        const interval = this.state === STATE.POUNCE ? 1 : 2;
        if (speedState && (this._afterimageTick = (this._afterimageTick || 0) + 1) % interval === 0) {
            this._afterimages.push({
                frame: this._frameForState(),
                x: this.x, y: this.y,
                facing: this.facing,
                age: 0,
                // Color tint: dash-attack gets warm orange, slide tan, backdash cool blue,
                // pounce gets a cold cyan (matches the parry-tier "stealth strike" palette).
                tint: this.state === STATE.DASH_ATTACK ? '#ff9050'
                    : this.state === STATE.BACKDASH    ? '#80a0ff'
                    : this.state === STATE.POUNCE      ? '#80e0ff'
                                                       : '#ffd080',
            });
        }
        // Age + cull
        for (let i = this._afterimages.length - 1; i >= 0; i--) {
            this._afterimages[i].age++;
            if (this._afterimages[i].age >= 14) this._afterimages.splice(i, 1);
        }
    }

    _handleInput(level) {
        const ax = input.axis();
        const lookY = ax.y;
        const lookX = ax.x;

        // R217: idle tracker. Counts frames where the player is doing
        // nothing — grounded, no inputs, no shots in flight, no
        // boss/enemy combat pressing in. Any input touches reset to 0.
        // When threshold hits, _idleBarkTimer arms the floating-text
        // bark above Clippy's head.
        const anyInput = input.isHeld('left') || input.isHeld('right')
            || input.isHeld('up') || input.isHeld('down')
            || input.isHeld('jump') || input.isHeld('shoot')
            || input.isHeld('special') || input.isHeld('grenade')
            || input.isHeld('shield') || input.isHeld('cycle')
            || input.isHeld('pause');
        const canBark = this.onGround && !anyInput && this.bullets.length === 0
            && this.state !== STATE.HURT && this.state !== STATE.DIE;
        if (canBark) {
            this._idleTimer++;
            if (this._idleTimer >= IDLE_BARK_THRESHOLD && this._idleBarkTimer <= 0) {
                this._idleBarkText = IDLE_BARKS[this._idleBarkIndex % IDLE_BARKS.length];
                this._idleBarkIndex++;
                this._idleBarkTimer = IDLE_BARK_DURATION;
                this._idleTimer = 0;  // re-arm window for the next bark
            }
        } else {
            this._idleTimer = 0;
        }
        if (this._idleBarkTimer > 0) this._idleBarkTimer--;

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
            // R344: track frames-in-cover for the enter/exit fade.
            this._coverT = 0;
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

        // Quick-select weapon cycle (Tab / Q): rotates through held inventory.
        // MG stays in slot 0; pickups append to slots 1-3. Skipping back to
        // MG is intentional — gives the player an "emergency tap-fire" exit
        // from the overheat-able power weapons.
        if (input.isPressed('cycle') && this.weaponInventory && this.weaponInventory.length > 1) {
            const idx = this.weaponInventory.indexOf(this.weapon);
            const next = this.weaponInventory[(idx + 1) % this.weaponInventory.length];
            if (next !== this.weapon) {
                this.weapon = next;
                this.weaponLevel = 1;
                this.weaponTimer = -1;   // R181: persist until hit
                this.weaponPickupFlash = 18;
                audio.sfx('select');
            }
        }

        // Stealth pounce: SPECIAL while hidden (grass/water/cover) launches a
        // spin-jump arc onto the nearest enemy's head for a heavy knife strike.
        // If the strike doesn't kill, the enemy is stunned and Clippy vaults to
        // the opposite side. Refreshes one air-jump so the vault can recover
        // from pit landings.
        const hidden = this.grassHidden || this.waterHidden || this.state === STATE.COVER;
        if (input.isPressed('special') && hidden && this._pounceTarget && this.state !== STATE.POUNCE) {
            this._startPounce(this._pounceTarget);
            return;
        }

        // Grapple hook: SPECIAL (C) while airborne fires a line in the aim
        // direction. If it finds a solid tile within 80px, Clippy reels in
        // with i-frames during the pull. Boss-fight reposition tool.
        if (input.isPressed('special') && !this.onGround && this._grappleCooldown <= 0
            && this.state !== STATE.GRAPPLE && this.state !== STATE.HURT) {
            if (this._fireGrapple(level)) return;
        }

        // C button on ground — context-sensitive:
        //   1. Holding DOWN  → BACKDASH (defensive, retreat with i-frames).
        //   2. Otherwise     → KNIFE DASH attack (forward, brief i-frames,
        //      melee damage to enemies in path). The dash-attack was
        //      previously only accessible via double-tap-forward, which most
        //      players never discovered; backdash was eating every C press.
        //      Down+C keeps the defensive option for skilled play.
        if (input.isPressed('special') && this.onGround
            && this.state !== STATE.BACKDASH && this.state !== STATE.DASH_ATTACK) {
            if (input.isHeld('down')) {
                this.state = STATE.BACKDASH;
                this.backdashTimer = BACKDASH_FRAMES;
                this.iFrames = Math.max(this.iFrames, BACKDASH_FRAMES);
                audio.sfx('slide');
                particles.dust(this.x + this.w / 2, this.y + this.h);
            } else {
                this.state = STATE.DASH_ATTACK;
                this.dashAtkTimer = DASH_ATK_FRAMES;
                this.dashAtkHits = new Set();
                this.iFrames = Math.max(this.iFrames, DASH_ATK_FRAMES - 4);
                audio.sfx('slide');
                particles.dust(this.x + this.w / 2, this.y + this.h);
            }
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
            // R418: rage boosts ground speed +50% — Clippy SPRINTS through enemies
            const rageMul = this.rageFrames > 0 ? 1.5 : 1;
            const accel = ((this.state === STATE.CRAWL || this.state === STATE.CROUCH) ? RUN_ACCEL * 0.4 : RUN_ACCEL) * rageMul;
            const cap = ((this.state === STATE.CRAWL || this.state === STATE.CROUCH) ? MAX_SPEED * 0.45 : MAX_SPEED) * rageMul;
            // Turn-snap: when input reverses against current momentum, kill a
            // chunk of the opposing velocity so the player doesn't ice-skate
            // through their own turnaround. Only applies on ground — keeps
            // air-control deliberate. Skip when slowing through zero so we
            // don't double-impulse.
            if (this.onGround && Math.sign(lookX) !== Math.sign(this.vx) && Math.abs(this.vx) > 0.4) {
                this.vx *= (1 - TURN_SNAP);
            }
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
        // Mid-air jump press — try wall-jump first, fall through to
        // double-jump if no wall. Previously these were two separate
        // `else if` branches, so the wall-jump branch matched the
        // condition but bailed without firing OR falling through —
        // double-jump never ran. Now they share one branch.
        else if (input.isPressed('jump') && !this.onGround
                 && this.state !== STATE.SLIDE && this.state !== STATE.BACKDASH
                 && this.state !== STATE.GRAPPLE) {
            let wallJumped = false;
            if (level) {
                const chestY = this.y + this.h / 2;
                const leftWall = level.isSolid(this.x - 2, chestY);
                const rightWall = level.isSolid(this.x + this.w + 2, chestY);
                if (leftWall || rightWall) {
                    input.consume('jump');
                    const kickDir = leftWall ? 1 : -1;  // away from wall
                    this.vx = kickDir * 2.6;
                    this.vy = JUMP_V * 0.88;
                    this.facing = kickDir;
                    this.airJumpsLeft = 1; // refresh — chain wall-jumps along a tall surface
                    this.state = STATE.SPIN_JUMP;
                    this.spinAngle = 0;
                    audio.sfx('jump');
                    const dustX = this.x + (leftWall ? 0 : this.w);
                    particles.dust(dustX, this.y + this.h - 4);
                    wallJumped = true;
                }
            }
            // Double-jump — fires only if wall-jump didn't claim the press.
            if (!wallJumped && (this.airJumpsLeft || 0) > 0) {
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
        }

        // Jump cut on release
        if (input.isReleased('jump') && this.vy < 0) {
            this.vy *= JUMP_CUT;
        }

        // Shoot — with R216 MG charge mechanic.
        // Charge gate is HOLD-DOWN + SHOOT. Original "stand still + shoot"
        // gate broke the most common firing posture (standing still and
        // tapping fire), so charge now requires a deliberate modifier:
        // the player crouches (DOWN held) while holding fire. Releasing
        // shoot after full charge fires the fat bullet.
        const CHARGE_FULL = 45;
        const eligible = this.weapon === 'MG'
            && this.onGround
            && ax.y > 0.5
            && this.mgVentLock <= 0;
        if (eligible && input.isHeld('shoot')) {
            // Charging — don't spam-fire while building up.
            this._chargeTimer++;
            if (this._chargeTimer >= CHARGE_FULL && !this._chargeActive) {
                this._chargeActive = true;
                audio.sfx('select');  // small "ready" tick at full charge
            }
            // While charging, suppress normal MG fire by not calling _shoot.
            return;
        }
        // Released or invalidated — fire charged shot if we were full.
        if (this._chargeActive && input.isReleased('shoot')) {
            this._fireChargedMG();
            this._chargeTimer = 0;
            this._chargeActive = false;
            this.fireCooldown = 20;
            return;
        }
        // Partial charge dropped (moved, jumped, swapped) — reset silently.
        if (!eligible) {
            this._chargeTimer = 0;
            this._chargeActive = false;
        }
        if (input.isHeld('shoot') && this.fireCooldown <= 0) {
            this._shoot();
        }
    }

    _trackTaps() {
        const ax = input.axis();
        if (input.isPressed('right')) this.tapHistory.push({ dir: 1, t: 0 });
        if (input.isPressed('left'))  this.tapHistory.push({ dir: -1, t: 0 });
        // R321 perf: in-place tick + shift instead of `.filter()` which
        // allocates a new array every frame. tapHistory is tiny (~2-3
        // entries) but this fires 60 times/sec; cheap allocation × 60 ×
        // every player session is real GC pressure over time.
        const th = this.tapHistory;
        let writeIdx = 0;
        for (let i = 0; i < th.length; i++) {
            th[i].t++;
            if (th[i].t < DOUBLE_TAP_WINDOW) {
                if (writeIdx !== i) th[writeIdx] = th[i];
                writeIdx++;
            }
        }
        th.length = writeIdx;
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
        if (Math.abs(this.vy) > 0.1) {
            this.animFrame += 0.4;
            // Rung tick — fires every ~14 ticks while ascending or descending.
            // Idle on a ladder stays silent; ax.y === 0 is held without movement.
            this._climbTick = (this._climbTick || 0) + 1;
            if (this._climbTick >= 14) {
                this._climbTick = 0;
                audio.sfx('climbRung');
            }
        } else {
            this._climbTick = 0;
        }
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
        // Settling dust puff at the stop point — sells the "skidded to a halt"
        // beat. Small burst centered at feet, biased opposite the slide
        // direction so the dust kicks back behind the player.
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h - 1;
        for (let i = 0; i < 5; i++) {
            const dx = -this.facing * (0.6 + Math.random() * 0.4) + (Math.random() - 0.5) * 0.3;
            const dy = -0.4 - Math.random() * 0.3;
            particles.spawn(cx, cy, dx, dy, 10 + Math.random() * 4, '#c0a080', 1, 0.05);
        }
    }

    _updateState() {
        // HURT has a timer — when it drains, fall through to normal state
        // routing instead of leaving the player frozen-in-pain forever.
        // _hurt() sets hurtTimer = HURT_FRAMES (36); when it ticks to 0
        // physics resumes normally but the visual stuck in 'hurt' pose
        // and any state-gated input (e.g. grapple) stays blocked.
        if (this.state === STATE.HURT && this.hurtTimer <= 0) {
            this.state = STATE.IDLE;
            // fall through to the standard physics-driven router below
        }
        // Defensive grapple-anchor cleanup: any path that leaves GRAPPLE
        // state without going through the explicit release (e.g. hurt during
        // pull, state machine fallthrough) would leave a stale anchor that
        // the draw routine keeps rendering as a line. Drop it here.
        if (this.state !== STATE.GRAPPLE && this._grappleAnchor) {
            this._grappleAnchor = null;
            this._grapplePhase = null;
            this._grappleTimer = 0;
            this._grappleStuck = 0;
        }
        // Same defense for the ledge anchor: hurt during a ledge hang would
        // set state=HURT but leave the anchor live, causing the next airborne
        // frame to potentially re-grab the same ledge mid-knockback. Clear
        // whenever state isn't a ledge state.
        if (this.state !== STATE.LEDGE_HANG && this.state !== STATE.LEDGE_CLIMB
            && this._ledgeAnchor) {
            this._ledgeAnchor = null;
            this._ledgeFacing = 0;
            this._ledgeClimbT = 0;
        }
        // Self-heal: if state is GRAPPLE but the anchor is missing, OR
        // LEDGE_HANG/CLIMB without an anchor, the player is "owned" by an
        // impossible state and cannot move. Force back to a sane state so
        // input resumes. The "stuck — can only jump" symptom maps to exactly
        // this trap.
        if ((this.state === STATE.GRAPPLE && !this._grappleAnchor)
         || ((this.state === STATE.LEDGE_HANG || this.state === STATE.LEDGE_CLIMB)
             && !this._ledgeAnchor)) {
            this.state = this.onGround ? STATE.IDLE : STATE.FALL;
        }
        // States that own themselves
        const owned = [STATE.SLIDE, STATE.CROUCH, STATE.PRONE, STATE.CRAWL,
                       STATE.HURT, STATE.DIE, STATE.ROLL, STATE.DASH_ATTACK,
                       STATE.BACKDASH, STATE.CLIMB, STATE.COVER, STATE.SPIN_JUMP,
                       STATE.GRAPPLE, STATE.POUNCE,
                       STATE.LEDGE_HANG, STATE.LEDGE_CLIMB];
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
        // Run cycle speed scales with horizontal velocity so a sprint frame-
        // cycles faster than a creep. Falls to 12-frame idle when not running.
        let speed = 12;
        if (this.state === STATE.RUN) {
            const v = Math.abs(this.vx);
            // 6 frames at low speed → 3 frames at max speed. Sells acceleration.
            speed = Math.max(3, Math.round(6 - v * 1.5));
        }
        if (this.animTimer >= speed) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 1024;
        }
    }

    // R216: MG charged shot. Fired only via _handleInput's charge
    // branch after CHARGE_FULL frames of standing-still hold. Bullet
    // is 3× damage, piercing, fat (visible larger), white-hot color,
    // single shot. Plays a heavier muzzle FX + screen-shake to sell
    // the recoil so the moment of release feels earned.
    _fireChargedMG() {
        const w = WEAPON.MG;
        const mz = this._muzzleWorldPos();
        const baseX = mz.x, baseY = mz.y;
        const dx = this.aim.x, dy = this.aim.y;
        const norm = Math.hypot(dx, dy) || 1;
        const ndx = dx / norm, ndy = dy / norm;
        const sp = w.bulletSpeed * 1.3;
        const tier = this.combo >= 50 ? 3 : this.combo >= 25 ? 2 : this.combo >= 10 ? 1 : 0;
        const COMBO_MULT = [1, 1.25, 1.5, 2.0];
        const comboMult = COMBO_MULT[tier];
        this.bullets.push({
            x: baseX, y: baseY,
            vx: ndx * sp, vy: ndy * sp,
            damage: w.damage * 3 * (1 + (this.weaponLevel - 1) * 0.5) * comboMult,
            color: '#ffffff',
            weapon: 'MG',
            comboTier: tier,
            life: 80,
            piercing: true,   // punches through anything in its line
            hits: new Set(),
            _charged: true,    // flag so onBulletHit can render bigger hit FX
        });
        particles.muzzleFlash(baseX, baseY, ndx, ndy, '#ffffff');
        // Extra burst — bright ring scatter at muzzle.
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            particles.spawn(
                baseX, baseY,
                Math.cos(a) * (1.5 + Math.random() * 1.5),
                Math.sin(a) * (1.5 + Math.random() * 1.5),
                12 + Math.random() * 8,
                '#ffe070', 1.4, 0
            );
        }
        // R257: dedicated charged-MG SFX. Was 'thunder' but after R251 made
        // the thunder weapon's SFX a real thunderclap, the charged MG shot
        // sounded like the THUNDER weapon. mgCharged is a capacitor-whine
        // pre-roll + heavy MG bark — reads as "stored energy released".
        audio.sfx('mgCharged');
        this.shotsFired++;
        this.recoilTimer = 12;
        this.requestShake = Math.max(this.requestShake || 0, 2.5);
        // Push Clippy back a touch for kickback feel.
        this.vx -= ndx * 1.2;
    }

    // ---------- shooting ----------
    _shoot() {
        // MG-only overheat gate: while venting, the gun is locked.
        if (this.weapon === 'MG' && this.mgVentLock > 0) {
            this.fireCooldown = 2; // small cooldown so we don't poll constantly
            return;
        }
        const w = WEAPON[this.weapon];
        let rate = Math.max(2, Math.round(w.fireRate - this.weaponLevel * 1.5));
        // R418: rage halves fire rate (minimum 2)
        if (this.rageFrames > 0) rate = Math.max(2, Math.floor(rate / 2));
        this.fireCooldown = rate;
        if (this.weapon === 'MG') {
            this.mgHeat = Math.min(100, this.mgHeat + 8);
            if (this.mgHeat >= 100) {
                this.mgVentLock = 30;
                this.mgHeat = 100;
                // R258: dedicated overheat SFX (was reusing 'comboBreak'
                // which is for combo-streak loss — different event).
                audio.sfx('mgOverheat');
                // Steam vent puff from the barrel — short white burst.
                const mz = this._muzzleWorldPos();
                for (let i = 0; i < 8; i++) {
                    particles.spawn(
                        mz.x, mz.y,
                        (Math.random() - 0.5) * 1.2,
                        -0.4 - Math.random() * 0.6,
                        16 + Math.random() * 8,
                        '#f0f0ff', 1, -0.06
                    );
                }
                return; // don't fire the shot that triggered the lock
            }
        }

        // World-space muzzle position — derived from the SAME shoulder + arm +
        // barrel offsets as the visible procedural barrel (_drawAimArm). The
        // shoulder anchor lives slightly above-center and toward the facing
        // direction; total reach is armLen (5) + barrelLen (8) = 13px along
        // the aim. Keeping bullet spawn, muzzle flash, and visible barrel tip
        // sharing one anchor means the projectile actually leaves the gun the
        // player sees — not the body center.
        const mz = this._muzzleWorldPos();
        const baseX = mz.x, baseY = mz.y;

        // Combo damage multiplier — bullets get stronger as the player
        // sustains a kill streak. Tiers: <10 = 1x (white-tier), 10-24 = 1.25x
        // (gold), 25-49 = 1.5x (orange), 50+ = 2x (white-hot). Bullet color
        // shifts to telegraph the tier so the player sees the bonus active.
        const tier = this.combo >= 50 ? 3 : this.combo >= 25 ? 2 : this.combo >= 10 ? 1 : 0;
        const COMBO_MULT = [1, 1.25, 1.5, 2.0];
        const COMBO_COLOR = [w.color, '#ffe070', '#ff9030', '#ffffff'];
        const comboMult = COMBO_MULT[tier];
        const bulletColor = COMBO_COLOR[tier];

        const fire = (vx, vy) => {
            const b = {
                x: baseX, y: baseY,
                vx, vy,
                damage: w.damage * (1 + (this.weaponLevel - 1) * 0.5) * comboMult,
                color: bulletColor,
                weapon: this.weapon,
                comboTier: tier,
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
        } else if (this.weapon === 'SHOTGUN') {
            // Tight cone — fire `shots` pellets within ±spread radians,
            // each with short life so range falls off naturally. Per-pellet
            // damage is heavy; total burst damage is brutal at point-blank.
            const shotsN = w.shots + Math.floor((this.weaponLevel - 1) / 2);
            for (let i = 0; i < shotsN; i++) {
                const ang = (Math.random() - 0.5) * w.spread * 2;
                const cos = Math.cos(ang), sin = Math.sin(ang);
                fire(ndx * sp * cos - ndy * sp * sin, ndx * sp * sin + ndy * sp * cos);
                this.bullets[this.bullets.length - 1].life = w.life;
            }
        } else if (this.weapon === 'CHAINSAW') {
            // Melee — no projectile. _tickChainsaw on every fire frame
            // applies damage to any enemy within the front arc. Audio is
            // handled by _shoot's audio.sfx(w.sound) below (chainsaw rev).
            this._tickChainsaw();
            // Eat the shell-eject + muzzle-flash + recoil block below; we
            // route through a sentinel that skips post-fire FX since
            // chainsaw doesn't shoot a projectile.
            this._chainsawTickedThisShoot = true;
        } else if (this.weapon === 'THUNDER') {
            // Hit-scan along the aim ray. Walks MAX_RANGE px out from the
            // muzzle, sampling each STEP px. Every enemy AABB the ray pierces
            // takes damage immediately (chain lightning). Ray stops at the
            // first solid tile. A decorative bullet at the bolt terminus
            // carries the visual zigzag for `life` frames — it deals NO
            // damage itself; damage was applied at fire-time below.
            //
            // Was previously a single piercing bullet sitting at the target
            // that ticked once for 4 damage then idle-decayed (b.hits.has(e)
            // blocked subsequent ticks). That made THUNDER feel inert in
            // testing despite the dramatic visual. Now: scan the ray, apply
            // chain damage to every enemy on it, then spawn the bolt as
            // pure visual.
            // R275: longer hit range + wider damage band. Was 220/6 — too
            // short for the screen-width visual bolt. Now 320px range and
            // 12px half-width so the swath matches what the player SEES
            // (the bolt visibly stretches across most of the screen).
            const MAX_RANGE = 320;
            const STEP = 4;
            const HALF_WIDTH = 12;
            const game = (typeof window !== 'undefined') ? window.__game : null;
            const lvl = game?.level || null;
            const enemies = game?.enemies?.enemies || [];
            let hitX = baseX + ndx * MAX_RANGE;
            let hitY = baseY + ndy * MAX_RANGE;
            const struck = new Set();
            const thunderDmg = w.damage * (1 + (this.weaponLevel - 1) * 0.5) * comboMult;
            // Perpendicular axis to the aim ray, used for the band test.
            const perpX = -ndy, perpY = ndx;
            // R298: THUNDER decorative-bullet has damage=0, so crates + walls
            // never took damage when struck by lightning. Iterate the pickup
            // manager's crates + walls in the same ray-walk loop so the visual
            // "lightning hits crate" reads as "lightning destroys crate."
            const crates = game?.pickups?.crates || [];
            const walls  = game?.pickups?.walls || [];
            for (let s = STEP; s <= MAX_RANGE; s += STEP) {
                const sx = baseX + ndx * s;
                const sy = baseY + ndy * s;
                if (lvl && lvl.isSolid && lvl.isSolid(sx, sy)) {
                    // R298: only stop the ray at a TRUE tile wall, not a
                    // breakable wall — let the bolt continue past the wall
                    // and still keep the wall in the damage list below.
                    const onBreakable = lvl._wallSolidCheck && lvl._wallSolidCheck(sx, sy);
                    if (!onBreakable) { hitX = sx; hitY = sy; break; }
                }
                // R298: crate hits at this depth
                for (const c of crates) {
                    if (!c.alive || struck.has(c)) continue;
                    const ccx = c.x + c.w / 2, ccy = c.y + c.h / 2;
                    const axial = (ccx - baseX) * ndx + (ccy - baseY) * ndy;
                    if (axial < 0 || axial > s + STEP) continue;
                    const perp = Math.abs((ccx - baseX) * perpX + (ccy - baseY) * perpY);
                    const grazeR = HALF_WIDTH + Math.min(c.w, c.h) * 0.5;
                    if (perp <= grazeR) {
                        struck.add(c);
                        c.hp -= thunderDmg;
                        c.hitFlash = 4;
                        if (c.hp <= 0) {
                            c.alive = false;
                            particles.explosion(ccx, ccy, '#604030', 12);
                            audio.sfx('explode');
                            // Spawn the crate's drop
                            if (c.drop && game?.pickups?.spawn) {
                                game.pickups.spawn(ccx - 4, ccy - 4, c.drop);
                            }
                        } else {
                            audio.sfx('crateHit');
                        }
                    }
                }
                // R298: breakable-wall hits at this depth
                for (const wall of walls) {
                    if (!wall.alive || struck.has(wall)) continue;
                    const wcx = wall.x + wall.w / 2, wcy = wall.y + wall.h / 2;
                    const axial = (wcx - baseX) * ndx + (wcy - baseY) * ndy;
                    if (axial < 0 || axial > s + STEP) continue;
                    const perp = Math.abs((wcx - baseX) * perpX + (wcy - baseY) * perpY);
                    const grazeR = HALF_WIDTH + Math.min(wall.w, wall.h) * 0.5;
                    if (perp <= grazeR) {
                        struck.add(wall);
                        wall.hp -= thunderDmg;
                        wall.hitFlash = 5;
                        wall.cracks = Math.min(3, Math.floor((6 - wall.hp) / 2));
                        if (wall.hp <= 0) {
                            wall.alive = false;
                            particles.explosion(wcx, wcy, '#604030', 16);
                            audio.sfx('explode');
                            if (wall.drop && game?.pickups?.spawn) {
                                game.pickups.spawn(wcx - 4, wcy - 4, wall.drop);
                            }
                        } else {
                            audio.sfx('crateHit');
                        }
                    }
                }
                for (const e of enemies) {
                    if (!e.alive || struck.has(e)) continue;
                    // R239: AABB-vs-band test. Enemy center distance from the
                    // ray (projected onto the perp axis) must be ≤ half-width
                    // + half the enemy's smaller dimension — that's the
                    // tightest grazing distance. Axial distance is enforced
                    // by the existing step loop (s within [STEP, MAX_RANGE]).
                    const ecx = e.x + e.w / 2;
                    const ecy = e.y + e.h / 2;
                    const axial = (ecx - baseX) * ndx + (ecy - baseY) * ndy;
                    // Skip enemies behind the muzzle or beyond the current step
                    // window — keeps the bolt feeling like a forward-fired ray.
                    if (axial < 0 || axial > s + STEP) continue;
                    const perp = Math.abs((ecx - baseX) * perpX + (ecy - baseY) * perpY);
                    const grazeR = HALF_WIDTH + Math.min(e.w, e.h) * 0.5;
                    if (perp <= grazeR) {
                        struck.add(e);
                        // Defensive: smoke probes inject plain-object enemies
                        // without .hurt to verify ray geometry. Treat those as
                        // "ray hits" but skip damage application so the probe
                        // (and any future non-Enemy collidable) doesn't crash.
                        if (typeof e.hurt !== 'function') {
                            if (struck.size === 1) { hitX = e.x + e.w / 2; hitY = e.y + e.h / 2; }
                            if (struck.size >= 3) { s = MAX_RANGE + 1; break; }
                            continue;
                        }
                        const knockDir = ndx > 0 ? 1 : (ndx < 0 ? -1 : (e.x < this.x ? 1 : -1));
                        const stunned = (e._stunTimer || 0) > 0;
                        const dmg = stunned ? thunderDmg * 1.5 : thunderDmg;
                        const killed = e.hurt(dmg, knockDir, { knockBack: 2.0 });
                        // Synthesize a bullet stand-in so onBulletHit's
                        // bookkeeping (dmgDealt totals, hit-burst particle,
                        // damage-number popup, kill-credit + combo) all
                        // runs identically to a normal weapon hit.
                        const fakeBullet = {
                            weapon: 'THUNDER',
                            x: e.x + e.w / 2, y: e.y + e.h / 2,
                            color: w.color,
                            damage: dmg,
                            comboTier: tier,
                            piercing: true,
                            hits: struck,  // shared so capping still applies
                        };
                        this.onBulletHit(fakeBullet, e, killed);
                        // Terminate the visual bolt at the FIRST enemy hit so
                        // the zigzag reads as "bolt anchored in target".
                        if (struck.size === 1) { hitX = e.x + e.w / 2; hitY = e.y + e.h / 2; }
                        if (struck.size >= 3) { s = MAX_RANGE + 1; break; }
                    }
                }
                if (s > MAX_RANGE) break;
            }
            // Spawn the decorative bolt bullet. damage=0, vx=vy=0, piercing
            // and hits pre-filled so EnemyManager skips it during its
            // bullet-vs-enemy pass (damage was already applied above).
            fire(0, 0);
            const tb = this.bullets[this.bullets.length - 1];
            tb.x = hitX;
            tb.y = hitY;
            tb.chainStartX = baseX;
            tb.chainStartY = baseY;
            tb.boltX = hitX;
            tb.boltY = hitY;
            tb.piercing = true;
            tb.damage = 0;
            tb.life = 14;
            // Pre-fill hits with all the enemies we already damaged + a
            // sentinel so EnemyManager's b.hits.has(e) gate skips this
            // decorative bullet against everyone.
            tb.hits = struck;
            tb._decorative = true;
        } else {
            const j = (Math.random() - 0.5) * (w.spread || 0) * sp;
            fire(ndx * sp + (Math.abs(ndy) < 0.1 ? 0 : j), ndy * sp + (Math.abs(ndx) < 0.1 ? 0 : j));
        }

        // Muzzle effects + recoil + shell ejection. CHAINSAW skips —
        // melee weapon, no muzzle, no shell. SFX still plays so the rev
        // loop ticks while the player holds shoot.
        if (this.weapon !== 'CHAINSAW') {
            particles.muzzleFlash(baseX, baseY, ndx, ndy, w.color);
            // Pass floorY when grounded so the shell bounces + settles on the
            // ground tile beneath Clippy instead of falling forever.
            const shellFloor = this.onGround ? this.y + this.h : null;
            particles.shellEject(this.x + this.w / 2 - this.facing * 2, this.y + 8, this.facing, shellFloor);
        }
        audio.sfx(w.sound);
        this.shotsFired++;
        this.recoilTimer = 6;
        // Camera kick on each shot. Only THUNDER actually shakes — the smaller
        // kicks at 0.5-0.9 stacked into a constant tremor during sustained MG fire,
        // which read as twitch rather than weight. Recoil now lives in muzzle FX +
        // shell ejection, not in the camera. SHOTGUN gets a small kick so the
        // blast reads as heavier than MG without becoming a tremor.
        const kickMap = { THUNDER: 2.0, SHOTGUN: 1.2 };
        const kick = kickMap[this.weapon] || 0;
        if (kick) this.requestShake = Math.max(this.requestShake || 0, kick);
    }

    // R180: shield tick. Reads `shield` input each frame and manages charge,
    // cooldown, and visual timers. Shield states cascade through:
    //   1. shieldCooldown > 0  → cannot raise; tick down
    //   2. shieldCharge == 0 + button held → still cannot raise (break must
    //      complete the cooldown first)
    //   3. button held + charge > 0 + no cooldown → shieldActive=true
    //   4. inactive + no recent hit → recharge slowly back to full
    // Hits are applied via hurt()'s shieldActive short-circuit; this tick
    // does NOT consume charge directly.
    _tickShield() {
        // Tick down break/flash animation timers regardless of state.
        if (this.shieldBreakTimer > 0) this.shieldBreakTimer--;
        if (this.shieldFlashTimer > 0) this.shieldFlashTimer--;
        // Cooldown is the post-break lockout.
        if (this.shieldCooldown > 0) {
            this.shieldCooldown--;
            this.shieldActive = false;
            if (this.shieldCooldown === 0) {
                // Cooldown ended — start refilling immediately so the player
                // doesn't sit with 0 charge waiting indefinitely. Audio cue.
                this.shieldCharge = 0.0001;  // non-zero so recharge takes over
                if (typeof audio !== 'undefined') audio.sfx('select');
            }
            return;
        }
        // Recharge: once enough hit-free time has passed AND shield is NOT
        // currently raised, refill charge up to SHIELD_MAX.
        if (!this.shieldActive && this.hurtTimer <= 0 && this.shieldCharge < SHIELD_MAX) {
            // Gate on recent-hit timer (re-using hurtTimer < threshold as a
            // proxy — hurtTimer drains over 36f after a hit, so if it's been
            // longer than SHIELD_RECHARGE_DELAY since the last hit we're safe.
            this._shieldNoHitFrames = (this._shieldNoHitFrames || 0) + 1;
            if (this._shieldNoHitFrames >= SHIELD_RECHARGE_DELAY) {
                this.shieldCharge = Math.min(SHIELD_MAX, this.shieldCharge + SHIELD_RECHARGE_RATE);
            }
        }
        // Read shield input. Held button + charge > 0 + not in a blocked
        // state = active. Gate out states where the bubble would look weird
        // (death, hurt knockback, pre-jump squash) — but allow during cover
        // / grapple / climb so the player can defensively reposition.
        const blocked = this.state === STATE.DIE
                     || this.state === STATE.HURT
                     || this.state === STATE.POUNCE
                     || this.state === STATE.DASH_ATTACK
                     || this.shieldCharge <= 0;
        const held = (typeof input !== 'undefined') && input.held && input.held.has('shield');
        this.shieldActive = held && !blocked;
    }

    // CHAINSAW melee tick — damages all enemies whose center lies within
    // `range` px of Clippy's center AND inside a `arcDeg` cone facing
    // `this.facing`. Called every fire frame; damage is per-frame so a
    // close-range hold tears through HP fast. No projectile.
    _tickChainsaw() {
        const w = WEAPON.CHAINSAW;
        const game = (typeof window !== 'undefined') ? window.__game : null;
        if (!game?.enemies?.enemies) return;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const range = w.range;
        const halfArc = (w.arcDeg * Math.PI / 180) / 2;
        // Damage scales with weapon level (1, 1.5, 2.0)
        const dmg = w.damage * (1 + (this.weaponLevel - 1) * 0.5);
        for (const e of game.enemies.enemies) {
            if (!e.alive) continue;
            const ex = e.x + e.w / 2;
            const ey = e.y + e.h / 2;
            const dx = ex - cx, dy = ey - cy;
            const d = Math.hypot(dx, dy);
            if (d > range) continue;
            // Angle from Clippy to enemy, measured against the facing axis.
            // facing>0 → forward axis is +X; facing<0 → -X.
            const forwardAng = this.facing > 0 ? Math.atan2(dy, dx) : Math.atan2(dy, -dx);
            if (Math.abs(forwardAng) > halfArc) continue;
            // Knock back AWAY from Clippy, slight chunky chip.
            const killed = e.hurt(dmg, dx > 0 ? 1 : -1, { knockBack: 0.6 });
            // R240: chainsaw locks the target in place + visibly vibrates it
            // while the saw is grinding. The user feedback: "chainsaw needs
            // to stun + enemies should shake while being chainsaw'd" — the
            // short range otherwise lets grunts walk through it.
            // _stunTimer is refreshed every tick so as long as the saw is on
            // the enemy, AI is gated. _shakeTimer drives the per-frame jitter
            // in Enemy.draw(). Both decay naturally once the saw moves off.
            e._stunTimer = Math.max(e._stunTimer || 0, 10);
            e._shakeTimer = Math.max(e._shakeTimer || 0, 8);
            // Per-tick blood spurt — small red mote at contact.
            particles.spawn(ex, ey, (Math.random() - 0.5) * 1.5, -1 - Math.random() * 0.8, 18, '#ff3030', 1, 0.04);
            // Stat tracking through normal kill pipeline; chainsaw "bullet"
            // is a synthetic for combo/dmgDealt accounting.
            this.dmgDealt.CHAINSAW = (this.dmgDealt.CHAINSAW || 0) + dmg;
            if (killed) {
                // Trigger combo + score the way bullet kills do — synthetic bullet.
                const fakeBullet = { weapon: 'CHAINSAW', x: ex, y: ey, color: w.color, damage: dmg, comboTier: 0 };
                this.onBulletHit(fakeBullet, e, true);
            }
        }
        // Flag for sprite/HUD to render the rev wobble + sawdust.
        this._chainsawRevTimer = 4;
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
            // R287: breakable walls have isSolid=true (block player movement)
            // but bullets need to pass the player-tick wall-stick branch so
            // BreakableWall.update can detect the hit on the same frame.
            // Without this, bullets get consumed by the wall-stick code
            // before the wall's own update loop sees them — destructibles
            // never take damage. Check level.isSolid AND not a breakable wall.
            const onBreakableWall = level._wallSolidCheck && level._wallSolidCheck(b.x, b.y);
            if (level.isSolid(b.x, b.y) && !onBreakableWall) {
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

    // Throw a grenade. Decrements inventory and spawns an arcing projectile
    // that detonates on contact with any solid OR enemy, or after a short
    // fuse if it misses. No-op when count <= 0; the player still gets a
    // soft fail chirp so the input isn't silently ignored.
    _throwGrenade() {
        if (this.grenades <= 0) {
            // Cooldown on the FAIL too so V-spam doesn't flood the screen with
            // "NO GRENADES" text + audio. 30f gap between fail messages.
            this._grenadeCooldown = 30;
            // R259: dedicated empty-belt SFX (was reusing 'comboBreak'
            // which is for combo-streak loss — different event).
            audio.sfx('grenadeFail');
            particles.floatingText(
                this.x + this.w / 2, this.y - 4, 'NO GRENADES',
                '#ff8050', 36, -0.5, 1);
            return;
        }
        this.grenades--;
        this._everThrewGrenade = true;
        this._grenadeCooldown = 18;  // 0.3s — no chain-throw spam
        // Track grenade usage in run stats — feeds future GRENADIER-style
        // achievement gates without changing existing weapon damage tallies.
        const game = (typeof window !== 'undefined') ? window.__game : null;
        if (game?.runStats) game.runStats.grenadeUses = (game.runStats.grenadeUses || 0) + 1;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 - 2;
        const facing = this.facing >= 0 ? 1 : -1;
        // Slight upward arc — throw responds to aim if held high/low
        const aimUp = input.isHeld('up') ? -1 : (input.isHeld('down') ? 0.4 : 0);
        const vx = AMBIENT.GRENADE_THROW_VX * facing;
        const vy = AMBIENT.GRENADE_THROW_VY + aimUp * 1.4;
        this.thrownGrenades.push({
            x: cx, y: cy, vx, vy,
            fuse: AMBIENT.GRENADE_FUSE_F,
            spin: 0,
            spinSpeed: facing * 0.32,
            alive: true,
        });
        audio.sfx('grenadeThrow');
        particles.dust(cx, cy + 4);
    }

    _handleGrenadeInput() {
        if (this._grenadeCooldown > 0) this._grenadeCooldown--;
        if (input.isPressed('grenade') && this._grenadeCooldown <= 0) {
            // Block during death / cinematic states
            if (this.state === STATE.DIE || this.state === STATE.POUNCE
                || this.state === STATE.GRAPPLE) return;
            this._throwGrenade();
        }
    }

    _updateGrenades(level) {
        for (let i = this.thrownGrenades.length - 1; i >= 0; i--) {
            const g = this.thrownGrenades[i];
            g.fuse--;
            g.spin += g.spinSpeed;
            // Physics — gravity + air drag
            g.vy += 0.22;
            g.vx *= 0.99;
            g.x += g.vx;
            g.y += g.vy;
            // Ground / wall bounce — soft bounce on solid floor
            if (level.isSolid(g.x, g.y + 2)) {
                g.y -= 1;
                g.vy = -g.vy * 0.4;
                g.vx *= 0.78;
                // Once nearly stopped, detonate to avoid sitting forever.
                if (Math.abs(g.vy) < 0.4 && Math.abs(g.vx) < 0.2) {
                    this._detonateGrenade(g);
                    this.thrownGrenades.splice(i, 1);
                    continue;
                }
            }
            // Wall bounce
            if (level.isSolid(g.x + (g.vx > 0 ? 2 : -2), g.y)) {
                g.vx = -g.vx * 0.5;
            }
            // Fuse expired — detonate in place
            if (g.fuse <= 0) {
                this._detonateGrenade(g);
                this.thrownGrenades.splice(i, 1);
                continue;
            }
            // Death-pit drop — quietly remove when far below the level so
            // the player doesn't hear a distant explode SFX from a grenade
            // that fell into the void.
            if (g.y > level.height + 80) {
                this.thrownGrenades.splice(i, 1);
                continue;
            }
        }
    }

    // AoE explosion at grenade position. Damages all enemies within
    // GRENADE_RADIUS with damage that falls off linearly to ~50% at the
    // edge. Bosses + miniboss take the same hit. Big visual: explosion,
    // double shock ring, chunky shake.
    _detonateGrenade(g) {
        const cx = g.x, cy = g.y;
        const R = AMBIENT.GRENADE_RADIUS;
        const dmgMax = AMBIENT.GRENADE_DAMAGE;
        // Reach into the global enemy manager via window.__game — avoids a
        // circular import. The grenade is the only path that needs AoE.
        const game = (typeof window !== 'undefined') ? window.__game : null;
        const enemyMgr = game?.enemies;
        let killCount = 0;
        if (enemyMgr && enemyMgr.enemies) {
            for (const e of enemyMgr.enemies) {
                if (!e.alive) continue;
                const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
                const d = Math.hypot(ex - cx, ey - cy);
                if (d > R) continue;
                const falloff = 0.5 + 0.5 * (1 - d / R);  // 1.0 → 0.5
                const knockDir = ex < cx ? -1 : 1;
                const killed = e.hurt(dmgMax * falloff, knockDir, { knockBack: 1.8 });
                if (killed) killCount++;
            }
        }
        if (killCount > 0 && game?.runStats) {
            game.runStats.grenadeKills = (game.runStats.grenadeKills || 0) + killCount;
        }
        // Crates in radius — break + drop contents. Bypass per-hit thunks
        // since the explode SFX already punctuates the moment.
        const pickupMgr = game?.pickups;
        if (pickupMgr && pickupMgr.crates) {
            for (let i = pickupMgr.crates.length - 1; i >= 0; i--) {
                const c = pickupMgr.crates[i];
                if (!c.alive) continue;
                const ccx = c.x + c.w / 2, ccy = c.y + c.h / 2;
                const d = Math.hypot(ccx - cx, ccy - cy);
                if (d > R) continue;
                c.alive = false;
                particles.explosion(ccx, ccy, '#604030', 10);
                if (c.drop) pickupMgr.spawn(ccx - 6, ccy, c.drop);
                pickupMgr.crates.splice(i, 1);
            }
        }
        // Visual fireworks
        particles.explosion(cx, cy, '#ffe070', 22);
        particles.explosion(cx, cy, '#ff5050', 14);
        particles.shockRing(cx, cy, R, 18, '#ffe070');
        particles.shockRing(cx, cy, R + 8, 24, '#ff8030');
        audio.sfx('explode');
        this.requestShake = Math.max(this.requestShake || 0, 5);
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
        // R248: HOMING is an RPG — every impact triggers a real explosion.
        // Boom SFX + AoE splash damage, full-bright orange ring, screen shake.
        // The rocket detonates regardless of kill/no-kill (warhead doesn't care).
        if (bullet.weapon === 'HOMING') {
            const bx = bullet.x, by = bullet.y;
            audio.sfx('rpgImpact');
            particles.explosion(bx, by, '#ff8030', 20);
            particles.shockRing(bx, by, 14, 16, '#ff5030');
            this.requestShake = Math.max(this.requestShake || 0, 2.2);
            // Splash damage — 24px radius, half the bullet's damage at edge,
            // full at center. Skips the enemy that was directly hit (already
            // damaged by the bullet) and bullets that already pierced multiple.
            const game = (typeof window !== 'undefined') ? window.__game : null;
            const enemyMgr = game?.enemies;
            if (enemyMgr && enemyMgr.enemies) {
                const SPLASH_R = 24;
                const splashMax = bullet.damage * 0.7;
                for (const e of enemyMgr.enemies) {
                    if (!e.alive || e === enemy) continue;
                    const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
                    const d = Math.hypot(ecx - bx, ecy - by);
                    if (d > SPLASH_R) continue;
                    const falloff = 0.5 + 0.5 * (1 - d / SPLASH_R);
                    e.hurt(splashMax * falloff, ecx < bx ? -1 : 1, { knockBack: 1.0 });
                }
            }
            // R298: HOMING splash should also break crates + breakable walls.
            // Pre-fix, rockets did NO damage to destructibles in their splash
            // radius — only the direct-hit enemy. Now crates + walls in the
            // 24px blast radius take splash damage with the same falloff.
            const crates2 = game?.pickups?.crates || [];
            const walls2  = game?.pickups?.walls  || [];
            const SPLASH_R2 = 24;
            const splashMax2 = bullet.damage * 0.7;
            for (const c of crates2) {
                if (!c.alive) continue;
                const ccx = c.x + c.w / 2, ccy = c.y + c.h / 2;
                const d = Math.hypot(ccx - bx, ccy - by);
                if (d > SPLASH_R2) continue;
                const fall = 0.5 + 0.5 * (1 - d / SPLASH_R2);
                c.hp -= splashMax2 * fall;
                c.hitFlash = 4;
                if (c.hp <= 0) {
                    c.alive = false;
                    particles.explosion(ccx, ccy, '#604030', 12);
                    audio.sfx('explode');
                    if (c.drop && game?.pickups?.spawn) {
                        game.pickups.spawn(ccx - 4, ccy - 4, c.drop);
                    }
                }
            }
            for (const wall of walls2) {
                if (!wall.alive) continue;
                const wcx = wall.x + wall.w / 2, wcy = wall.y + wall.h / 2;
                const d = Math.hypot(wcx - bx, wcy - by);
                if (d > SPLASH_R2) continue;
                const fall = 0.5 + 0.5 * (1 - d / SPLASH_R2);
                wall.hp -= splashMax2 * fall;
                wall.hitFlash = 5;
                wall.cracks = Math.min(3, Math.floor((6 - wall.hp) / 2));
                if (wall.hp <= 0) {
                    wall.alive = false;
                    particles.explosion(wcx, wcy, '#604030', 16);
                    audio.sfx('explode');
                    if (wall.drop && game?.pickups?.spawn) {
                        game.pickups.spawn(wcx - 4, wcy - 4, wall.drop);
                    }
                }
            }
        }
        particles.weaponHitBurst(bullet.x, bullet.y, bullet.weapon, bullet.color);
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
            this.tauntKill(enemy.maxHp >= 10);
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.comboTimer = 90;
            const points = 100 + this.combo * 10;
            this.score += points;
            // Game-feel: short hit-pause + screen-shake on every kill.
            this.hitPauseFrames = Math.max(this.hitPauseFrames || 0, AMBIENT.HIT_PAUSE_KILL_F);
            this.requestShake = Math.max(this.requestShake || 0, 1.6);
            // Per-kill score popup — color, scale, and lifetime ramp by tier.
            // Streak kills produce chunkier popups so the player feels each
            // combo step land.
            const tier = this.combo >= 20 ? '#ff60ff' : this.combo >= 10 ? '#ff8050' : this.combo >= 5 ? '#ffe070' : '#fff';
            const popScale = this.combo >= 20 ? 2 : this.combo >= 10 ? 1.6 : this.combo >= 5 ? 1.3 : 1;
            const popLife = this.combo >= 20 ? 70 : this.combo >= 10 ? 60 : 45;
            particles.floatingText(enemy.x + enemy.w / 2, enemy.y - 2, '+' + points, tier, popLife, -0.8, popScale);
            // Combo milestones — big bouncy label + tiered audio escalation
            if (this.combo === 5 || this.combo === 10 || this.combo === 20 || this.combo === 30) {
                const tierSfx = this.combo >= 30 ? 'combo4' : this.combo >= 20 ? 'combo3' : this.combo >= 10 ? 'combo2' : 'combo';
                audio.sfx(tierSfx);
                particles.floatingText(enemy.x + enemy.w / 2, enemy.y - 14, this._comboLabel(), '#ffe070', 80, -0.4, 2);
                const bonus = this.combo * 100;
                this.score += bonus;
                // Surface the bonus value so the player sees the milestone
                // actually paying out (was silently accruing before).
                // y offset = -36 to clear the combo label (scale=2, ~12px tall
                // starting at y=-14); faster vy=-0.9 so it floats up out of
                // the way before the combo label finishes its intro bounce.
                particles.floatingText(enemy.x + enemy.w / 2, enemy.y - 36, '+' + bonus + ' BONUS', '#ff60ff', 70, -0.9, 1);
                // Shock ring at enemy for the milestone — color matches combo tier
                const ringColor = this.combo >= 20 ? '#ff60ff' : this.combo >= 10 ? '#ff8050' : '#ffe070';
                particles.shockRing(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 26, 18, ringColor);
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
            particles.shockRing(cx, cy, 18, 12, '#50ff70');
            particles.floatingText(cx, this.y - 4, '+1 HP', '#50ff70', 55, -0.8, 1);
            return;
        }
        if (type === '1UP') {
            // Cap at 9 — keeps the HUD "x{N}" label inside its slot, and 9 is
            // already absurd for a Contra-style game (death-tax mechanic only).
            this.lives = Math.min(9, this.lives + 1);
            audio.sfx('powerup');
            burstBurst('#ffe070', 14);
            // 1UP is a bigger deal — double ring (white core + gold flare)
            particles.shockRing(cx, cy, 18, 12, '#fff');
            particles.shockRing(cx, cy, 30, 18, '#ffe070');
            particles.floatingText(cx, this.y - 4, '1 UP!', '#ffe070', 75, -0.7, 2);
            return;
        }
        // R223: CLIPPY_TAG (paperclip dog-tag) — counted collectible.
        // Tag count persists across the entire run, NOT per-stage.
        // Each stage that hides them in breakable walls drops 3, and
        // the achievement "FULL SET" awards on collecting 24 total
        // (3 × 8 main stages). No mechanical benefit beyond pride +
        // score; that's intentional — pure completionist bait.
        if (type === 'CLIPPY_TAG') {
            this.tagsFound = (this.tagsFound || 0) + 1;
            this.score += 500;
            audio.sfx('pickup');
            burstBurst('#e0e0e8', 14);
            particles.shockRing(cx, cy, 22, 14, '#fff');
            particles.shockRing(cx, cy, 32, 18, '#a0a0b8');
            particles.floatingText(cx, this.y - 4, 'CLIPPY TAG +500',
                                   '#e0e0e8', 80, -0.7, 1);
            return;
        }
        if (type === 'GRENADE') {
            // Held inventory — +GRENADE_PER_PICKUP capped at GRENADE_MAX.
            // Doesn't swap weapon; player decides when to throw.
            const before = this.grenades || 0;
            this.grenades = Math.min(AMBIENT.GRENADE_MAX, before + AMBIENT.GRENADE_PER_PICKUP);
            const gained = this.grenades - before;
            // Score: +100 per grenade actually added; if maxed, +250 consolation
            // (matches the weapon-max-pickup pattern just below).
            if (gained > 0) {
                this.score += 100 * gained;
            } else {
                this.score += 250;
            }
            this.grenadePickupFlash = 30;
            audio.sfx('pickup');
            burstBurst('#80ff40', 12);
            particles.shockRing(cx, cy, 18, 12, '#80ff40');
            particles.floatingText(cx, this.y - 4,
                gained > 0 ? `+${gained} GRENADE` : '+250',
                '#80ff40', 60, -0.7, 1);
            return;
        }
        if (WEAPON[type]) {
            const w = WEAPON[type];
            if (this.weapon === type) {
                if (this.weaponLevel < 3) {
                    this.weaponLevel++;
                    audio.sfx('powerup');
                    burstBurst(w.color, 12);
                    particles.shockRing(cx, cy, 20, 14, w.color);
                    particles.floatingText(cx, this.y - 4,
                        'LV ' + this.weaponLevel + '!', w.color, 60, -0.7, 2);
                } else {
                    // Already maxed — convert into score
                    this.score += 500;
                    audio.sfx('pickup');
                    burstBurst('#ffe070');
                    particles.shockRing(cx, cy, 16, 10, '#ffe070');
                    particles.floatingText(cx, this.y - 4, '+500', '#ffe070', 50, -0.7, 1);
                }
            } else {
                this.weapon = type;
                this.weaponLevel = 1;
                audio.sfx('powerup');
                burstBurst(w.color, 14);
                // New-weapon swap is the showy beat — double ring in weapon color
                particles.shockRing(cx, cy, 22, 14, w.color);
                particles.shockRing(cx, cy, 32, 20, '#fff');
                // Weapon name in its own color — bigger scale
                const label = type === 'MG' ? 'MACHINE' : type;
                particles.floatingText(cx, this.y - 4, label, w.color, 80, -0.5, 2);
                // HUD glyph flash flag — read by hud.js
                this.weaponPickupFlash = 30;
                // Append to inventory if not present (keep MG in slot 0).
                // Cap total slots at 4 so the cycle stays readable; oldest
                // non-MG slot drops off on overflow.
                if (!this.weaponInventory.includes(type)) {
                    if (this.weaponInventory.length >= 4) {
                        // Drop the first non-MG entry (slot 1).
                        this.weaponInventory.splice(1, 1);
                    }
                    this.weaponInventory.push(type);
                }
            }
            this.weaponTimer = -1;   // R181: persist until hit
        }
    }

    hurt(dmg, knockDir = 0, srcX = null, srcY = null) {
        if (this.iFrames > 0 || this.state === STATE.DIE) return;
        // R418: rage mode — fully invincible, brief deflect spark
        if (this.rageFrames > 0) {
            this.iFrames = Math.max(this.iFrames, 8);
            particles.spawn(this.x + this.w / 2, this.y + this.h / 2,
                (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 12, '#ff8060', 2, 0);
            return;
        }
        // Training-ground god mode — show a brief deflect particle so the
        // player sees that an enemy *would* have hit them, but the run
        // continues uninterrupted. Critical for the tutorial flow.
        if (this.godMode) {
            this.iFrames = Math.max(this.iFrames, 12);
            particles.floatingText(this.x + this.w / 2, this.y - 4, 'NOPE', '#80e0ff', 30);
            return;
        }
        // R180: shield absorb. If raised and charged, consume charge equal
        // to the hit's weight (capped by `dmg` so a 1-dmg pellet drains 1
        // unit, a 3-dmg boss melee drains 3). If charge goes to zero, the
        // shield SHATTERS — particles, knockback, cooldown, but the HP hit
        // is still absorbed. Short i-frames after absorb so the next
        // immediate hit isn't free.
        if (this.shieldActive && this.shieldCharge > 0) {
            const cost = Math.min(this.shieldCharge, Math.max(1, dmg));
            this.shieldCharge -= cost;
            this._shieldNoHitFrames = 0;
            this.shieldFlashTimer = 8;
            this.shieldUsedThisStage = true;
            if (srcX != null) {
                this.lastHurtSrc = { x: srcX, y: srcY, frames: AMBIENT.DAMAGE_INDICATOR_F };
            }
            if (this.shieldCharge <= 0) {
                this.shieldCharge = 0;
                this.shieldCooldown = SHIELD_COOLDOWN;
                this.shieldBreakTimer = 20;
                this.shieldActive = false;
                if (typeof audio !== 'undefined') audio.sfx('crateBreak');
                particles.weaponHitBurst(
                    this.x + this.w / 2, this.y + this.h / 2,
                    'SHIELD', '#80e0ff'
                );
                particles.floatingText(this.x + this.w / 2, this.y - 4, 'SHIELD!', '#ff8050', 36);
                // Light knockback on shatter so the player feels the break.
                this.knockX = knockDir * 1.8;
                this.vy = Math.min(this.vy, -2.0);
            } else {
                if (typeof audio !== 'undefined') audio.sfx('bossHit');
                particles.hitSpark(this.x + this.w / 2, this.y + this.h / 2, '#80e0ff');
                particles.floatingText(this.x + this.w / 2, this.y - 4, 'BLOCK', '#80e0ff', 26);
            }
            // Brief i-frames so the next overlapping bullet doesn't drain
            // multiple stacks in one frame.
            this.iFrames = Math.max(this.iFrames, 12);
            return;
        }
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
        // R181: Contra-style weapon persistence — taking a hit drops power
        // weapons back to MG. Player retains their MG inventory slot but
        // loses anything they'd picked up. weaponInventory is reset to
        // just MG so the cycle key (Q/Tab) won't surface a now-orphan slot.
        if (this.weapon !== 'MG') {
            const lostWeapon = this.weapon;
            this.weapon = 'MG';
            this.weaponLevel = 1;
            this.weaponTimer = 0;
            this.weaponInventory = ['MG'];
            particles.floatingText(
                this.x + this.w / 2, this.y - 10,
                'LOST ' + lostWeapon, '#ff5050', 50, -0.4, 1
            );
        }
        // Drop any anchored state when hurt — being knocked off a ledge or
        // grapple should free Clippy completely, otherwise the anchor can
        // outlive the hurt and re-trap the player on resume. Self-heal in
        // _updateState catches the residue.
        this._grappleAnchor = null;
        this._ledgeAnchor = null;
        this._ledgeCooldown = 18;
        this._grappleCooldown = 12;
        audio.sfx('hurt');
        particles.blood(this.x + this.w / 2, this.y + 6, knockDir > 0 ? -1 : 1);
        // Big game-feel: hit-pause + heavy screen shake on player damage
        this.hitPauseFrames = Math.max(this.hitPauseFrames || 0, AMBIENT.HIT_PAUSE_HURT_F);
        this.requestShake = Math.max(this.requestShake || 0, 4.5);
    }

    kill() {
        if (this.state === STATE.DIE) return;
        // Training-mode invincibility — same short-circuit as hurt() so pit
        // falls + other instant-death paths don't bypass god mode. The game
        // layer detects this via godMode + isDead() and teleports back to
        // playerStart instead of decrementing lives.
        if (this.godMode) {
            this.iFrames = Math.max(this.iFrames, 30);
            particles.floatingText(this.x + this.w / 2, this.y - 4, 'NOPE', '#80e0ff', 30);
            // Mark for game-layer respawn — uses a one-shot flag rather than
            // STATE.DIE so the death-fanfare animation doesn't play.
            this._godModeRespawn = true;
            return;
        }
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
        // Drop in-flight grenades silently — letting them keep ticking would
        // fire 'explode' SFX mid-death-sequence and damage enemies after the
        // player is already dying, which reads as bugged. Death is final.
        this.thrownGrenades.length = 0;
    }

    isDead() {
        return this.state === STATE.DIE && this.deathTimer > 90;
    }

    // R156: pick a random taunt line on kill, floated above Clippy's head.
    // Gated by cooldown + chance so combos don't turn into a wall of text.
    // Boss kills always taunt (cooldown still applies so a boss-then-grunt
    // chain doesn't double up).
    tauntKill(isBoss = false) {
        if (this._tauntCooldown > 0) return;
        if (!isBoss && Math.random() >= TAUNT_CHANCE) return;
        const pool = isBoss ? CLIPPY_TAUNTS_BOSS : CLIPPY_TAUNTS_GRUNT;
        const line = pool[Math.floor(Math.random() * pool.length)];
        particles.floatingText(
            this.x + this.w / 2, this.y - 4,
            line, isBoss ? '#ffe070' : '#80e0ff', 70, -0.45, 1,
        );
        this._tauntCooldown = TAUNT_COOLDOWN_F;
    }

    // ---------- drawing ----------
    draw(ctx, camera, level = null) {
        // R217: idle bark bubble. Renders BEFORE other prompts so the
        // POUNCE / cover prompts (which are conditional on enemy state)
        // can paint over it without flicker if the situation changes
        // mid-bark. Fades in over the first 12f, holds, fades out over
        // the last 24f.
        if (this._idleBarkTimer > 0 && this._idleBarkText) {
            const px = Math.round(this.x + this.w / 2 - camera.viewX);
            const py = Math.round(this.y - 20 - camera.viewY);
            const t = this._idleBarkTimer;
            const fadeIn = Math.min(1, (IDLE_BARK_DURATION - t) / 12);
            const fadeOut = Math.min(1, t / 24);
            const a = Math.min(fadeIn, fadeOut);
            const w = this._idleBarkText.length * 6 + 8;
            ctx.save();
            ctx.globalAlpha = a * 0.9;
            ctx.fillStyle = 'rgba(12, 8, 20, 0.9)';
            ctx.fillRect(px - w / 2, py - 2, w, 11);
            ctx.fillStyle = '#a890b0';
            ctx.fillRect(px - w / 2, py - 2, w, 1);
            ctx.fillRect(px - w / 2, py + 8, w, 1);
            // tail anchored to Clippy's head
            ctx.fillRect(px - 1, py + 9, 2, 1);
            drawText(ctx, this._idleBarkText, px, py + 1, '#ffe070', 1, 'center');
            ctx.restore();
        }
        // R216: charge-shot ring. Renders BEFORE the player sprite so
        // the ring sits behind Clippy. Two phases: charging (yellow,
        // tightens as t→1) and full (white pulsing ring), to give a
        // clear "release now" tell.
        if (this._chargeTimer > 0) {
            const px = Math.round(this.x + this.w / 2 - camera.viewX);
            const py = Math.round(this.y + this.h / 2 - camera.viewY);
            const t = Math.min(1, this._chargeTimer / 45);
            // Outer radius starts wide and tightens toward Clippy as
            // charge fills. Once full, locks at min radius and pulses.
            const baseR = this._chargeActive
                ? 16 + Math.sin(this._chargeTimer * 0.4) * 2
                : 24 - t * 8;
            ctx.save();
            ctx.globalAlpha = this._chargeActive ? 0.85 : 0.4 + t * 0.4;
            ctx.strokeStyle = this._chargeActive ? '#ffffff' : '#ffe070';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(px, py, baseR, 0, Math.PI * 2);
            ctx.stroke();
            // Inner tick marks orbiting the ring — sells "energy."
            const tickCount = 4;
            for (let i = 0; i < tickCount; i++) {
                const a = (this._chargeTimer * 0.08) + i * (Math.PI * 2 / tickCount);
                const tx = px + Math.cos(a) * baseR;
                const ty = py + Math.sin(a) * baseR;
                ctx.fillStyle = this._chargeActive ? '#ffffff' : '#ffe070';
                ctx.fillRect(tx - 1, ty - 1, 2, 2);
            }
            ctx.restore();
        }
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
        // Pounce prompt: when player is hidden AND a pounce target is in
        // range, show a pulsing cyan "C POUNCE" hint so they discover the move.
        // Cyan palette matches the parry-tier visual language.
        const hiddenForPrompt = this.grassHidden || this.waterHidden || this.state === STATE.COVER;
        if (hiddenForPrompt && this._pounceTarget && this.state !== STATE.POUNCE) {
            const px = Math.round(this.x + this.w / 2 - camera.viewX);
            const py = Math.round(this.y - 36 - camera.viewY);
            const pulse = (Math.sin(performance.now() * 0.018) + 1) * 0.5;
            ctx.save();
            ctx.globalAlpha = 0.6 + pulse * 0.4;
            ctx.fillStyle = 'rgba(4, 12, 24, 0.9)';
            ctx.fillRect(px - 26, py - 2, 52, 11);
            ctx.fillStyle = '#80e0ff';
            ctx.fillRect(px - 26, py - 2, 52, 1);
            ctx.fillRect(px - 26, py + 8, 52, 1);
            drawText(ctx, 'C POUNCE', px, py + 1, '#80e0ff', 1, 'center');
            ctx.restore();
        }
        // Grenade discovery hint — shows above Clippy until the player has
        // thrown one grenade. Suppressed during pounce / death / cover prompt
        // states so it doesn't stack with the cyan POUNCE hint.
        // R212: also suppressed when the READY card is on — that screen
        // already showed "GRENADE V" in the keymap. Veterans who flipped
        // showReady off still get this floating-above-Clippy hint on
        // their first grenade pickup.
        if (this.grenades > 0 && !this._everThrewGrenade
            && !options.get('showReady')
            && !hiddenForPrompt && this.state !== STATE.POUNCE
            && this.state !== STATE.DIE) {
            const px = Math.round(this.x + this.w / 2 - camera.viewX);
            const py = Math.round(this.y - 24 - camera.viewY);
            const pulse = (Math.sin(performance.now() * 0.014) + 1) * 0.5;
            ctx.save();
            ctx.globalAlpha = 0.65 + pulse * 0.35;
            ctx.fillStyle = 'rgba(8, 18, 6, 0.9)';
            ctx.fillRect(px - 24, py - 2, 48, 11);
            ctx.fillStyle = '#80ff40';
            ctx.fillRect(px - 24, py - 2, 48, 1);
            ctx.fillRect(px - 24, py + 8, 48, 1);
            drawText(ctx, 'V THROW', px, py + 1, '#80ff40', 1, 'center');
            ctx.restore();
        }

        // Ground-contact drop shadow. Anchored to _lastGroundY so it stays
        // on the floor while the player jumps, growing slightly larger and
        // dimmer with airtime. Sells "stands in the painted world" — without
        // this the sprite reads as a sticker pasted on top of the bg.
        // Hidden in water-duck (handled below via early-return path).
        if (!this.waterHidden && !this.grassHidden) {
            const shadowY = Math.round(this._lastGroundY - camera.viewY - 1);
            const shadowCX = Math.round(this.x + this.w / 2 - camera.viewX);
            const airHeight = Math.max(0, (this._lastGroundY - (this.y + this.h)));
            // Scale from full at ground → 1.4x faded at peak jump
            const airT = Math.min(1, airHeight / 80);
            const rx = 9 + airT * 3;
            const ry = 2.2 + airT * 0.4;
            const alpha = 0.42 * (1 - airT * 0.55);
            if (alpha > 0.04) {
                ctx.save();
                ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.ellipse(shadowCX, shadowY, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // Flicker on i-frames
        if (this.iFrames > 0 && this.iFrames % 4 < 2) return;

        // Afterimage trail — render colored silhouettes BEHIND the live
        // sprite. Each snapshot is drawn into an isolated layer (save/restore
        // with a clipped region), painted as a flat-color silhouette, and
        // composited at fading alpha. Without the tint a straight low-alpha
        // draw reads as a ghost-of-self rather than a speed streak; the
        // colored silhouette sells the motion blur.
        // R153 pre-baked silhouettes: resolve the frame name from the
        // afterimage's stored frame string. Falls back to the cached
        // `sprites.drawSilhouette` path which keys by (name, color) so a
        // weapon tint we've seen before reuses the same offscreen canvas
        // forever. Eliminates the per-frame ctx.filter=brightness(0) pipeline
        // state change for the trail.
        for (const a of this._afterimages) {
            const aDims = spriteDims(a.frame);
            const acx = a.x + this.w / 2 - camera.viewX;
            const acy = a.y + this.h - aDims.h / 2 - camera.viewY + 1;
            const aAlpha = (1 - a.age / 14) * 0.55;
            if (aAlpha <= 0.03) continue;
            const drawX = Math.round(acx - aDims.w / 2);
            const drawY = Math.round(acy - aDims.h / 2);
            // The frame name in CLIPPY_MANIFEST is the same name we pass to
            // the silhouette cache. Failed lookups (procedural-only frames)
            // fall through to the legacy non-cached path.
            ctx.save();
            ctx.globalAlpha = aAlpha;
            // R173: just skip the afterimage if no baked silhouette is
            // available. The old filter+rect fallback drew a tinted
            // RECTANGLE next to Clippy whenever the captured frame (slide /
            // backdash / pounce / dashatk) wasn't in the manifest — those
            // are procedural-only states, so the fallback fired every dash
            // and read as a translucent red/blue panel hovering beside the
            // player. Better to lose the trail than to paint debug rects.
            sprites.drawSilhouette(ctx, a.frame, a.tint, drawX, drawY, a.facing < 0, 1);
            ctx.restore();
        }

        const frame = this._frameForState();
        const dims = spriteDims(frame);
        // Bump recoil for readable kickback: 3-2-1px back, 1px upward at the peak.
        // Sells the "feels punchy" feedback that was missing from the static fire pose.
        const recoilDX = this.recoilTimer > 0
            ? -this.facing * (this.recoilTimer > 4 ? 3 : this.recoilTimer > 2 ? 2 : 1)
            : 0;
        const recoilDY = this.recoilTimer > 3 ? -1 : 0;
        const cx = this.x + this.w / 2 - camera.viewX + recoilDX;
        const cy = this.y + this.h - dims.h / 2 - camera.viewY + 1 + recoilDY;

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

        // Wading in water — render Clippy with lower body cut off + splash
        // particles at feet. R373: the early `return` here ATE bullet
        // rendering, weapon arm rendering, crosshair, recoil decay — Clippy
        // looked like he was shooting but no bullets/muzzle ever appeared
        // because the rest of draw() was skipped. Use a flag instead: paint
        // the wading-body now, then SKIP only the regular sprite draw below,
        // letting everything else (bullets, arm, crosshair, decay) run.
        let waded = false;
        if (this.inWater && this.waterFeet) {
            const surfY = Math.round(this.y + this.h - 6 - camera.viewY);
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
            waded = true;
        }

        // Spin-jump rotates the whole sprite around its center
        if (this.state === STATE.SPIN_JUMP) {
            ctx.save();
            ctx.translate(Math.round(cx), Math.round(cy));
            ctx.rotate(this.spinAngle * (this.facing > 0 ? 1 : -1));
            drawClippyFrame(ctx, frame, -dims.w / 2, -dims.h / 2, this.facing < 0);
            ctx.restore();
        } else if (this.state === STATE.DIE) {
            // R388: was a full-rotation spin + red glow rectangle — user
            // called this "flying spinning red box." Now: a short
            // hit-pop tumble (first 18f) that settles into the painted
            // v2_death sprawled-on-back pose. The painted sprite tells
            // the death story without needing the procedural halo.
            const settleAt = 18;
            const drawX = Math.round(cx - dims.w / 2);
            const drawY = Math.round(cy - dims.h / 2);
            if (this.deathTimer < settleAt) {
                // Brief tumble during the initial pop
                ctx.save();
                ctx.translate(Math.round(cx), Math.round(cy));
                const spinDir = this._deathSpin || -1;
                const tumbleFrac = this.deathTimer / settleAt;
                ctx.rotate(spinDir * tumbleFrac * Math.PI * 0.6);
                drawClippyFrame(ctx, frame, -dims.w / 2, -dims.h / 2, this.facing < 0);
                ctx.restore();
            } else {
                // Settled — paint the death sprite face-up, no rotation
                drawClippyFrame(ctx, frame, drawX, drawY, this.facing < 0);
            }
            // A couple of opening spark bursts to sell the hit, then quiet
            if (this.deathTimer < 20 && this.deathTimer % 6 === 0) {
                const sx = this.x + this.w / 2 + (Math.random() - 0.5) * 8;
                const sy = this.y + this.h / 2 + (Math.random() - 0.5) * 8;
                particles.hitSpark(sx, sy, '#ffe070');
            }
        } else if (!waded) {   // R373: skip body re-draw when wading already drew clipped body
            const drawX = Math.round(cx - dims.w / 2);
            // Idle breath bob — sub-pixel vertical drift when stationary on
            // ground. Frequency ~1.3 Hz so it reads as breathing, not jitter.
            // Suppressed during any non-idle state to avoid stacking with
            // run animation.
            let idleBob = 0;
            if (this.state === STATE.IDLE && this.onGround && Math.abs(this.vx) < 0.1) {
                idleBob = Math.sin(performance.now() * 0.008) > 0 ? -1 : 0;
            }
            const drawY = Math.round(cy - dims.h / 2) + idleBob;
            // Squash/stretch on landing: vertical squish that bounces back over
            // ~8 frames. Curve starts at 1.0 (full squash), eases to 1.15
            // (overshoot), settles at 1.0. Sells the impact without altering
            // the hitbox.
            if (this._squashFrames > 0) {
                // Phase 0..1 across the squash window.
                const phase = 1 - this._squashFrames / 10;
                // 0..0.4 squash (sy 0.75 → 1.0), 0.4..1.0 settle (sy 1.0 → 1.05 → 1.0)
                let sy;
                if (phase < 0.4) sy = 0.75 + (phase / 0.4) * 0.25;
                else sy = 1.0 + Math.sin((phase - 0.4) / 0.6 * Math.PI) * 0.10;
                const sx = 2 - sy; // conserve volume — squat wider, stretch thinner
                ctx.save();
                // Anchor at feet so the squash compresses toward the ground,
                // not the center.
                const feetX = drawX + dims.w / 2;
                const feetY = drawY + dims.h;
                ctx.translate(feetX, feetY);
                ctx.scale(sx, sy);
                ctx.translate(-feetX, -feetY);
                drawClippyFrame(ctx, frame, drawX, drawY, this.facing < 0);
                ctx.restore();
            } else {
                // R344: when hiding in cover, fade Clippy out as he 'steps
                // inside' the door/cave. After 15 frames he's at 25% alpha
                // so the player can still see his position without him
                // visually standing in front of the cover prop.
                if (this.state === STATE.COVER) {
                    const ct = this._coverT || 0;
                    const fadeT = Math.min(15, ct);
                    const alpha = 1 - (fadeT / 15) * 0.75;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    drawClippyFrame(ctx, frame, drawX, drawY, this.facing < 0);
                    ctx.restore();
                } else {
                    drawClippyFrame(ctx, frame, drawX, drawY, this.facing < 0);
                }
            }

            // R199: procedural leg overlay removed. User feedback:
            // "stop with anything procedural. we need sprites." The real
            // run cycle frames are queued at Local Howl (4-frame sheet)
            // and will be wired into run_1..run_4 via the manifest when
            // the painted asset lands.

            // Per-stage rim light: thin colored wash on the side of the
            // sprite facing the dominant scene light source.
            //
            // R178: previous implementation used `source-atop` + a fillRect
            // bounded by the sprite's rect, expecting the composite mode to
            // limit paint to actual sprite pixels. But source-atop on the
            // main canvas paints against EVERY non-transparent destination
            // pixel — which includes the painted background. With a thin
            // sprite like Clippy that has lots of transparent space inside
            // its bounding box, the rim band rendered as a translucent
            // colored COLUMN running the full sprite height (a "blue strip"
            // alongside the player in jungle, red in founder, etc.).
            //
            // Fix: stamp the silhouette in the rim color, offset by 1px on
            // the lit side. The silhouette mask is built off the sprite's
            // own pixels, so the rim only lands on real Clippy outline.
            // Sells the same lit-edge effect without bleeding onto bg.
            const rim = level ? RIM_BY_THEME[level.data.theme] : null;
            if (rim) {
                ctx.save();
                ctx.globalAlpha = rim.alpha;
                sprites.drawSilhouette(ctx, frame, rim.color,
                    drawX + (rim.side > 0 ? 1 : -1),
                    drawY,
                    this.facing < 0);
                if (rim.top) {
                    ctx.globalAlpha = rim.alpha * 0.7;
                    sprites.drawSilhouette(ctx, frame, rim.color,
                        drawX, drawY - 1, this.facing < 0);
                }
                ctx.restore();
            }

            // Low-HP red rim wash — when below 30% HP and not in iframes,
            // paint a pulsing red tint over the sprite. R178: same fix as
            // the rim-light bug above — stamp the silhouette in red rather
            // than fillRect+source-atop, so the wash stays on actual sprite
            // pixels instead of bleeding onto the painted background.
            if (this.hp > 0 && this.hp <= this.maxHp * 0.3 && this.iFrames === 0) {
                const beat = (Math.sin(performance.now() * 0.013) + 1) * 0.5;
                ctx.save();
                ctx.globalAlpha = 0.18 + beat * 0.32;
                sprites.drawSilhouette(ctx, frame, '#ff3030', drawX, drawY, this.facing < 0);
                ctx.restore();
            }

            // R418: RAGE overlay — alternating red/white silhouette flash at
            // 6Hz + an outward glow halo so Clippy reads as "ON FIRE." Late
            // in the rage window the glow fades to telegraph "almost over."
            if (this.rageFrames > 0) {
                const t = this.rageFrames / this.rageMaxFrames;        // 1 → 0
                const tail = Math.min(1, this.rageFrames / 45);         // last 45f fades
                const phase = (performance.now() * 0.025) | 0;
                const flashCol = (phase % 2 === 0) ? '#ff2020' : '#ffffff';
                ctx.save();
                ctx.globalAlpha = 0.55 * tail;
                sprites.drawSilhouette(ctx, frame, flashCol, drawX, drawY, this.facing < 0);
                ctx.restore();
                // Soft radial glow halo — additive
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = (0.3 + 0.2 * Math.sin(performance.now() * 0.02)) * tail;
                ctx.fillStyle = '#ff4020';
                ctx.beginPath();
                ctx.arc(this.x + this.w / 2 - this._cameraX, this.y + this.h / 2 - this._cameraY,
                        this.h * 0.95, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Muzzle-flash light cast: while firing, paint a warm radial
            // wash over the sprite from the muzzle outward. Uses 'lighter'
            // so the wash adds to the existing pixels instead of replacing.
            // Decays with recoilTimer so it pulses with each shot.
            if (this.recoilTimer > 0) {
                const flashT = this.recoilTimer / 6;
                const ax = Math.cos(this.aimAngle || 0) * this.facing;
                const ay = Math.sin(this.aimAngle || 0);
                const muzzleX = cx + ax * 10;
                const muzzleY = cy + ay * 4;
                ctx.save();
                // Clip to the sprite's rect + a couple pixels of bleed so the
                // wash only colors the player and doesn't bleed onto the bg.
                ctx.beginPath();
                ctx.rect(drawX - 1, drawY - 1, dims.w + 2, dims.h + 2);
                ctx.clip();
                ctx.globalCompositeOperation = 'lighter';
                const grad = ctx.createRadialGradient(muzzleX, muzzleY, 0, muzzleX, muzzleY, 22);
                const a = (0.55 * flashT).toFixed(3);
                grad.addColorStop(0, `rgba(255,210,140,${a})`);
                grad.addColorStop(0.5, `rgba(255,140,60,${(0.30 * flashT).toFixed(3)})`);
                grad.addColorStop(1, 'rgba(255,80,30,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(drawX - 1, drawY - 1, dims.w + 2, dims.h + 2);
                ctx.restore();
            }
        }

        // Aim-direction arm overlay: small procedural arm + gun barrel that points
        // in the actual aim direction. Layered on top of the base sprite so we get
        // 8-way aim coverage without needing a sprite-frame per direction.
        // Aim-direction arm overlay: small procedural arm + gun barrel that
        // points in the actual aim direction. Layered on top of the base
        // R203: procedural aim-arm overlay fully retired. The v6 painted
        // weapon poses (run-cycle + per-weapon idle) own the entire gun
        // silhouette. Bullets still spawn from `_muzzleWorldPos` (math
        // only, no draw) so projectile origin stays correct.

        // Grapple line — taut diagonal line from Clippy's torso to the anchor.
        // Dark navy outline + cream-yellow core so it reads against painted
        // backgrounds. Anchor pulses at the tile to show "you're attached here".
        // Only draw the grapple line while ACTIVELY in GRAPPLE state with
        // a live anchor AND phase='pull'. The phase guard catches any stale
        // anchor leftover after release that the defensive cleanup hasn't
        // reached yet (draw can fire mid-update on hit-pause frames).
        if (this.state === STATE.GRAPPLE && this._grappleAnchor && this._grapplePhase === 'pull') {
            const ax = Math.round(this._grappleAnchor.x - camera.viewX);
            const ay = Math.round(this._grappleAnchor.y - camera.viewY);
            const px = Math.round(cx);
            const py = Math.round(cy - 2);
            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#1a1828';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#ffe070';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            // Anchor pulse
            const pulse = (performance.now() % 200) < 100 ? '#fff' : '#ffe070';
            ctx.fillStyle = pulse;
            ctx.fillRect(ax - 1, ay - 1, 3, 3);
            ctx.restore();
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
        if (this._squashFrames > 0) this._squashFrames--;
        // MG heat decay (always — even mid-fire — but the per-shot add (+8)
        // outpaces the per-frame -1.5 when held).
        if (this.mgHeat > 0) this.mgHeat = Math.max(0, this.mgHeat - 1.5);
        if (this.mgVentLock > 0) this.mgVentLock--;
        if (this._grappleCooldown > 0) this._grappleCooldown--;
        if (this._tauntCooldown > 0) this._tauntCooldown--;

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
                // Zigzag bolt from muzzle (chainStartX/Y) to resolved hit
                // point (boltX/Y). Each segment jitters perpendicular to the
                // ray so the bolt reads as electric, not a straight beam.
                const sx0 = Math.round((b.chainStartX ?? b.x) - camera.viewX);
                const sy0 = Math.round((b.chainStartY ?? b.y) - camera.viewY);
                const ex = Math.round((b.boltX ?? b.x) - camera.viewX);
                const ey = Math.round((b.boltY ?? b.y) - camera.viewY);
                const dxL = ex - sx0, dyL = ey - sy0;
                const lenL = Math.hypot(dxL, dyL) || 1;
                const ux = dxL / lenL, uy = dyL / lenL;
                // Perpendicular for jitter
                const px = -uy, py = ux;
                const SEGS = Math.max(4, Math.floor(lenL / 6));
                ctx.fillStyle = '#fffac8';
                let prevX = sx0, prevY = sy0;
                for (let i = 1; i <= SEGS; i++) {
                    const t = i / SEGS;
                    const jitter = (i === SEGS) ? 0 : (Math.random() * 4 - 2);
                    const nx = sx0 + dxL * t + px * jitter;
                    const ny = sy0 + dyL * t + py * jitter;
                    // 2-wide bolt
                    this._line(ctx, prevX, prevY, nx, ny, '#fffac8', 2);
                    prevX = nx; prevY = ny;
                }
                // Hot core overlay — 1px white center re-trace
                prevX = sx0; prevY = sy0;
                for (let i = 1; i <= SEGS; i++) {
                    const t = i / SEGS;
                    const jitter = (i === SEGS) ? 0 : (Math.random() * 3 - 1.5);
                    const nx = sx0 + dxL * t + px * jitter;
                    const ny = sy0 + dyL * t + py * jitter;
                    this._line(ctx, prevX, prevY, nx, ny, '#ffffff', 1);
                    prevX = nx; prevY = ny;
                }
                // Impact burst at the bolt terminus
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = '#fffac8';
                ctx.fillRect(ex - 3, ey - 3, 7, 7);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(ex - 1, ey - 1, 3, 3);
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
                if (b.weapon === 'HOMING' && b.prevX != null) {
                    const px = Math.round(b.prevX - camera.viewX);
                    const py = Math.round(b.prevY - camera.viewY);
                    ctx.globalAlpha = 0.45;
                    this._line(ctx, px, py, bx, by, b.color, 1);
                    ctx.globalAlpha = 1;
                }
                // MG/SPREAD get a short directional motion-streak — 3px behind
                // the bullet along its velocity vector. Sells the "hot pellet
                // ripping through the air" read without crowding the screen
                // (the streak is only 3px, not a full prev→curr line).
                if ((b.weapon === 'MG' || b.weapon === 'SPREAD') && (b.vx || b.vy)) {
                    const sp = Math.hypot(b.vx, b.vy) || 1;
                    const ux = b.vx / sp, uy = b.vy / sp;
                    const tailX = bx - Math.round(ux * 3);
                    const tailY = by - Math.round(uy * 3);
                    ctx.strokeStyle = b.color;
                    ctx.globalAlpha = 0.55;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(tailX + 0.5, tailY + 0.5);
                    ctx.lineTo(bx + 0.5, by + 0.5);
                    ctx.stroke();
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

        // Thrown grenades — pixel-art M67 pineapple. Drawn as a 7x9 oval
        // body in olive-drab with darker grooves, silver lever along one
        // side, and a pin ring on top. Whole sprite rotates with `g.spin`
        // so it tumbles through the air. Blinks red+yellow in the final
        // 15 frames before detonation.
        for (const g of this.thrownGrenades) {
            const gx = Math.round(g.x - camera.viewX);
            const gy = Math.round(g.y - camera.viewY);
            const blink = g.fuse < 15 && Math.floor(g.fuse / 3) % 2 === 0;
            // Palette — blink overrides body color so the tell is unmissable
            const dark = blink ? '#a02020' : '#2a3818';
            const body = blink ? '#ff5050' : '#506030';
            const mid  = blink ? '#ffa040' : '#647540';
            const hi   = blink ? '#ffe070' : '#8aa050';
            const metal = '#b8b8c0';
            const metalHi = '#e8e8f0';
            ctx.save();
            ctx.translate(gx, gy);
            ctx.rotate(g.spin);
            // Body — 7x9 oval. Outline with `dark` then fill with `body`.
            // Drawn as fillRect rows for crisp pixel shape.
            // Row layout (relative to center):
            //   -4: . X X X .       outline cap
            //   -3: X . . . X
            //   -2: X . . . X
            //   -1: X . . . X
            //    0: X . . . X       widest row
            //    1: X . . . X
            //    2: X . . . X
            //    3: X . . . X
            //    4: . X X X .       outline cap
            // Outline
            ctx.fillStyle = dark;
            ctx.fillRect(-2, -5, 4, 1);     // top cap
            ctx.fillRect(-2,  4, 4, 1);     // bottom cap
            ctx.fillRect(-3, -4, 1, 8);     // left
            ctx.fillRect( 2, -4, 1, 8);     // right
            // Body fill
            ctx.fillStyle = body;
            ctx.fillRect(-2, -4, 4, 8);
            // Cross-hatch grooves (mid)
            ctx.fillStyle = mid;
            ctx.fillRect(-2, -2, 4, 1);
            ctx.fillRect(-2,  1, 4, 1);
            ctx.fillRect(-1, -4, 1, 8);
            // Side highlight strip
            ctx.fillStyle = hi;
            ctx.fillRect(-2, -3, 1, 1);
            ctx.fillRect(-2,  0, 1, 1);
            ctx.fillRect(-2,  3, 1, 1);
            // Silver lever (spoon) along right edge
            ctx.fillStyle = metal;
            ctx.fillRect( 3, -3, 1, 5);
            ctx.fillStyle = metalHi;
            ctx.fillRect( 3, -3, 1, 1);
            // Pin ring on top — small silver loop
            ctx.fillStyle = metal;
            ctx.fillRect(-1, -6, 3, 1);     // ring top
            ctx.fillRect(-1, -5, 1, 1);     // ring left
            ctx.fillRect( 1, -5, 1, 1);     // ring right
            ctx.fillStyle = metalHi;
            ctx.fillRect(0, -6, 1, 1);
            ctx.restore();
        }

        // R180: shield bubble + shatter. Drawn last so it sits over the
        // sprite. Bubble = pulsing cyan ring + filled translucent disc, with
        // segment ticks (one per remaining charge unit) on the perimeter so
        // the player can read remaining strength at a glance. Shatter =
        // expanding broken-ring particles for `shieldBreakTimer` frames.
        if (this.shieldActive || this.shieldBreakTimer > 0) {
            const bcx = Math.round(this.x + this.w / 2 - camera.viewX);
            const bcy = Math.round(this.y + this.h / 2 - camera.viewY);
            // R199: baseR was 16 — the bubble centered on hitbox-center but
            // the painted v5 sprite is ~24px tall and rendered taller than
            // the hitbox so the head and feet poked outside the shield.
            // 22 wraps the full sprite silhouette top-to-bottom with a small
            // halo, so the bubble actually reads as enveloping Clippy.
            const baseR = 22;
            ctx.save();
            if (this.shieldBreakTimer > 0) {
                // Shatter: ring expanding outward over the timer, alpha
                // fading. Render as 8 broken arc dots so it reads as a
                // ring breaking apart, not a smooth fade.
                const t = 1 - (this.shieldBreakTimer / 20);
                const ringR = baseR + t * 14;
                const alpha = (1 - t) * 0.9;
                ctx.fillStyle = '#80e0ff';
                ctx.globalAlpha = alpha;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + t * 0.3;
                    const px = Math.round(bcx + Math.cos(a) * ringR);
                    const py = Math.round(bcy + Math.sin(a) * ringR);
                    ctx.fillRect(px - 1, py - 1, 3, 3);
                }
            } else {
                // Active bubble
                const pulse = (this.bootTimer = (this.bootTimer || 0) + 1, Math.sin(this.bootTimer * 0.2) * 0.15);
                const lowCharge = this.shieldCharge <= 1;
                const flicker = lowCharge && ((this.bootTimer >> 1) & 1);
                if (flicker) { ctx.restore(); return; }
                const alphaBase = this.shieldFlashTimer > 0 ? 0.55 : 0.28;
                ctx.globalAlpha = alphaBase + pulse;
                // Filled disc (very translucent)
                ctx.fillStyle = '#80e0ff';
                for (let dy = -baseR; dy <= baseR; dy++) {
                    const rowW = Math.floor(Math.sqrt(baseR * baseR - dy * dy));
                    ctx.fillRect(bcx - rowW, bcy + dy, rowW * 2, 1);
                }
                // Ring outline (more opaque)
                ctx.globalAlpha = Math.min(1, alphaBase * 2.4 + pulse * 0.6);
                ctx.fillStyle = this.shieldFlashTimer > 0 ? '#ffffff' : '#80e0ff';
                for (let i = 0; i < 24; i++) {
                    const a = (i / 24) * Math.PI * 2;
                    const px = Math.round(bcx + Math.cos(a) * baseR);
                    const py = Math.round(bcy + Math.sin(a) * baseR);
                    ctx.fillRect(px, py, 1, 1);
                }
                // Charge ticks: bright nodes at top of the ring, one per
                // remaining whole-unit charge. Helps the player read "I
                // have 2 hits left" without staring at the HUD.
                const ticks = Math.ceil(this.shieldCharge);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ffffff';
                for (let i = 0; i < ticks; i++) {
                    const a = -Math.PI / 2 + (i - (ticks - 1) / 2) * 0.35;
                    const px = Math.round(bcx + Math.cos(a) * baseR);
                    const py = Math.round(bcy + Math.sin(a) * baseR);
                    ctx.fillRect(px - 1, py - 1, 3, 3);
                }
            }
            ctx.restore();
        }
    }

    // Grapple fire — line-traces from Clippy's body center along the aim
    // vector up to MAX_RANGE px, sampling each 4px step. The first SOLID tile
    // along that ray becomes the anchor. Returns true if anchored (and sets
    // STATE.GRAPPLE), false otherwise. Failed throws cost a brief cooldown.
    _fireGrapple(level) {
        // Extended range + aim-assist fan: previously a single 96px ray meant
        // any aim drift missed entirely, leading to "9 in 10 throws don't
        // even try" feel. Now we sweep a ±25° cone of rays around the aim
        // vector at 144px range and pick the closest hit. Cheap (15 rays *
        // 36 samples = ~540 isSolid calls, runs once per press).
        const MAX_RANGE = 144;
        const STEP = 4;
        const ax = this.aim?.x ?? this.facing;
        const ay = this.aim?.y ?? -0.4;
        const norm = Math.hypot(ax, ay) || 1;
        const aimAngle = Math.atan2(ay / norm, ax / norm);
        const ox = this.x + this.w / 2;
        const oy = this.y + this.h / 2;
        // Aim-assist cone: 15 rays from -25° to +25° around aim. Picks the
        // closest hit by distance, so the player feels like they auto-locked
        // onto the nearest grappleable surface in roughly the right direction.
        const CONE = (25 * Math.PI) / 180;
        const RAYS = 15;
        let bestX = null, bestY = null, bestD = Infinity;
        for (let r = 0; r < RAYS; r++) {
            const t = RAYS === 1 ? 0.5 : r / (RAYS - 1);
            const angle = aimAngle + (t * 2 - 1) * CONE;
            const nx = Math.cos(angle);
            const ny = Math.sin(angle);
            for (let d = STEP; d <= MAX_RANGE; d += STEP) {
                const px = ox + nx * d;
                const py = oy + ny * d;
                if (level && level.isSolid(px, py)) {
                    if (d < bestD) { bestX = px; bestY = py; bestD = d; }
                    break;
                }
            }
        }
        const foundX = bestX, foundY = bestY;
        if (foundX == null) {
            // Failed throw — short cooldown so the player can retry quickly
            this._grappleCooldown = 12;
            audio.sfx('select');
            return false;
        }
        this._grappleAnchor = { x: foundX, y: foundY };
        this._grapplePhase = 'pull';
        this._grappleTipX = foundX;
        this._grappleTipY = foundY;
        this._grappleTimer = 0;
        this.state = STATE.GRAPPLE;
        this.iFrames = Math.max(this.iFrames, 18);
        audio.sfx('slide');
        // Tiny anchor-impact burst at the hit tile
        for (let i = 0; i < 3; i++) {
            particles.spawn(
                foundX, foundY,
                (Math.random() - 0.5) * 0.8,
                (Math.random() - 0.5) * 0.8 - 0.2,
                10, '#fff', 1, 0.04
            );
        }
        return true;
    }

    // Grapple tick — pulls Clippy toward the anchor at a fixed speed.
    // Releases on: arrival (within 8px), hit ceiling/wall, ground contact,
    // or player presses jump/special again. Sets vx/vy each frame from the
    // unit vector toward the anchor.
    _tickGrapple(level) {
        if (!this._grappleAnchor) {
            this.state = STATE.JUMP;
            return;
        }
        const ax = this._grappleAnchor.x - (this.x + this.w / 2);
        const ay = this._grappleAnchor.y - (this.y + this.h / 2);
        const d = Math.hypot(ax, ay);
        const PULL_SPEED = 3.4;
        // Failsafe timeout: 60f (1s) max grapple. Beyond that, the player is
        // probably wedged against a wall/boss hitbox with no clean release
        // path. Force release rather than freeze input forever.
        this._grappleTimer = (this._grappleTimer || 0) + 1;
        const stuck = this._grappleTimer > 60;
        // Wall-stuck detect: pulling but barely moving for 6+ frames means
        // we're jammed against geometry. Release so the player can recover.
        const moved = Math.abs(this.vx) + Math.abs(this.vy);
        if (moved < 0.4) this._grappleStuck = (this._grappleStuck || 0) + 1;
        else this._grappleStuck = 0;
        const wallStuck = this._grappleStuck > 6;
        if (d < 10 || stuck || wallStuck || input.isPressed('jump') || input.isPressed('special')) {
            // Release: meaningful upward kick so the arrival lands on top of
            // the grappled surface instead of pinging off and falling. Also
            // grant a fresh air-jump so the player has an out if the anchor
            // was a wall mid-pit (chain a double-jump to safety).
            this._grappleAnchor = null;
            this._grapplePhase = null;
            this._grappleTimer = 0;
            this._grappleStuck = 0;
            this.state = STATE.JUMP;
            this.vy = Math.min(this.vy, -4.2);
            this.airJumpsLeft = Math.max(this.airJumpsLeft, 1);
            this._grappleCooldown = 6;
            return;
        }
        this.vx = (ax / d) * PULL_SPEED;
        this.vy = (ay / d) * PULL_SPEED;
        // Cap drift to a max so vertical pulls don't snap-teleport
        this.iFrames = Math.max(this.iFrames, 4);
    }

    // ===================== Ledge grab =====================
    // R152: cling to a ledge edge when falling/jumping past it. Probe samples
    // the tile column at Clippy's leading edge:
    //   - tile at HEAD height must be SOLID (the wall)
    //   - tile one row ABOVE the head must be EMPTY (the ledge top has open space)
    //   - player must be moving horizontally toward the wall OR aim is held that way
    // On match, snap into LEDGE_HANG with the player aligned so the top of his
    // sprite sits one pixel BELOW the ledge top line.
    _probeLedgeGrab(level) {
        const T = GAME.TILE;
        // Only fire while descending or slowly rising — avoids cancelling a
        // fresh jump take-off the same frame.
        if (this.vy < -1.5) return;
        // Pick the side to probe: positive vx → right wall, negative → left
        // wall, zero → use facing. Allows a held-jump-into-wall to grab.
        const side = (this.vx > 0.3) ? 1 : (this.vx < -0.3) ? -1 : this.facing;
        // Probe column: just outside Clippy's leading edge
        const probeX = side > 0 ? this.x + this.w + 1 : this.x - 1;
        // Probe rows: at head and one row above
        const headY = this.y + 6;          // ~5px below top of sprite
        const aboveY = this.y - 4;
        const wallSolid = level.isSolid(probeX, headY);
        const lipClear  = !level.isSolid(probeX, aboveY);
        if (!wallSolid || !lipClear) return;
        // Find the exact top edge of the wall tile so we can snap precisely.
        // Walk up from headY until we exit the solid; that y is the ledge top.
        let ty = Math.floor(headY / T);
        while (ty > 0 && level.isSolid(probeX, ty * T + 2)) ty--;
        const ledgeTopY = (ty + 1) * T;  // pixel y of the empty row's bottom
        // Anchor for the hang pose: player's TOP edge sits at (ledgeTopY + 2),
        // so the top sliver of sprite peeks above the ledge — reads as a hand-
        // grip on the lip.
        this.y = ledgeTopY + 2;
        this.x = side > 0 ? (Math.floor(probeX / T) * T - this.w)
                          : ((Math.floor(probeX / T) + 1) * T);
        this.vx = 0; this.vy = 0;
        this.state = STATE.LEDGE_HANG;
        this._ledgeAnchor = { x: this.x, y: this.y, ledgeY: ledgeTopY };
        this._ledgeFacing = side;
        this.facing = side;
        this.airJumpsLeft = 1;             // fresh air-jump granted on release
        this.iFrames = Math.max(this.iFrames, 6);
        audio.sfx('land');
        particles.dust(this.x + this.w / 2, this.y + 4);
    }

    // While hanging: gravity off, can release with DOWN, pull up with UP/jump.
    _tickLedgeHang(level) {
        if (!this._ledgeAnchor) { this.state = STATE.FALL; return; }
        this.vx = 0; this.vy = 0;
        // Re-anchor: in case of camera shake or jitter, keep snapping back.
        this.x = this._ledgeAnchor.x;
        this.y = this._ledgeAnchor.y;
        if (input.isPressed('jump') || input.isHeld('up')) {
            // Start the climb-up animation
            this.state = STATE.LEDGE_CLIMB;
            this._ledgeClimbT = 0;
            audio.sfx('select');
            return;
        }
        if (input.isHeld('down')) {
            // Drop off the ledge
            this.state = STATE.FALL;
            this._ledgeAnchor = null;
            this.vy = 1.0;
            this._ledgeCooldown = 18;
            return;
        }
    }

    // Climb sequence: lerp player from hang pos to "standing on top" over
    // LEDGE_CLIMB_F frames, then drop to IDLE.
    _tickLedgeClimb(level) {
        const LEDGE_CLIMB_F = 22;
        if (!this._ledgeAnchor) { this.state = STATE.IDLE; return; }
        this._ledgeClimbT++;
        const t = Math.min(1, this._ledgeClimbT / LEDGE_CLIMB_F);
        const startX = this._ledgeAnchor.x;
        const startY = this._ledgeAnchor.y;
        const endY = this._ledgeAnchor.ledgeY - this.h + 1;
        const endX = this._ledgeAnchor.x + this._ledgeFacing * (this.w * 0.6);
        // Ease-in-quad pull, then settle: takes effort to mount, then smooth set
        const ease = t * t;
        this.x = startX + (endX - startX) * ease;
        this.y = startY + (endY - startY) * ease;
        this.vx = 0; this.vy = 0;
        if (t >= 1) {
            this.state = STATE.IDLE;
            this._ledgeAnchor = null;
            this._ledgeCooldown = 18;       // brief cooldown so we don't re-grab
            this.onGround = true;
            particles.dust(this.x + this.w / 2, this.y + this.h);
        }
    }

    // Stealth pounce — launch a spin-jump arc from cover onto an enemy's head.
    // Phases:
    //   ARC_UP (frames 0-7)   — rising arc toward enemy head
    //   STRIKE (frame 8)      — knife damage hits, stun if survive
    //   VAULT  (frames 9-18)  — continue arc to opposite side of enemy
    // After VAULT ends, one airJumpsLeft is granted so the player can recover
    // from awkward pit landings.
    _startPounce(target) {
        // Snapshot target + spawn-side. Pounce path goes from current x to
        // landing x = (target.x + target.w/2) + side * 14 where `side` is the
        // OPPOSITE of the player's current side. Enemy gets pre-flagged so
        // contact-damage doesn't fire mid-arc.
        const targetCX = target.x + target.w / 2;
        const playerCX = this.x + this.w / 2;
        // Vault to opposite side: if Clippy is left of target, land right.
        const side = playerCX < targetCX ? 1 : -1;
        this._pounce = {
            target,
            phase: 'ARC_UP',
            timer: 0,
            startX: this.x,
            startY: this.y,
            apexX: targetCX - this.w / 2,           // strike position
            apexY: target.y - this.h - 2,           // sit on head
            landX: targetCX + side * 16 - this.w / 2, // vault landing
            side,
            struck: false,
        };
        this.state = STATE.POUNCE;
        this.iFrames = Math.max(this.iFrames, 30);
        this.onCover = false;
        // If we came from COVER state, releasing input would normally drop us
        // back to IDLE next tick — but state is now POUNCE so that branch
        // skips. Just clear the visual cover flag.
        this.facing = side > 0 ? -1 : 1; // face TOWARD the enemy initially
        audio.sfx('slide');
        // Visual: tight ring burst from spawn point
        particles.dust(playerCX, this.y + this.h);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            particles.spawn(
                playerCX, this.y + this.h - 2,
                Math.cos(a) * 1.2, Math.sin(a) * 1.2 - 0.3,
                14, '#ffe070', 1, 0.05
            );
        }
    }

    _tickPounce(level) {
        const p = this._pounce;
        if (!p) { this.state = STATE.JUMP; return; }
        // i-frames active throughout. Zero velocities so the post-state-tick
        // collision pass doesn't drift us away from the scripted arc — we set
        // x/y directly each frame.
        this.iFrames = Math.max(this.iFrames, 2);
        this.vx = 0; this.vy = 0;
        this.spinAngle = (this.spinAngle || 0) + 0.5;
        p.timer++;
        // Phase progression
        if (p.phase === 'ARC_UP') {
            // 8-frame parabola from start → apex (target head)
            const t = Math.min(1, p.timer / 8);
            // Ease: cubic ease-out for snap-up feel
            const ease = 1 - Math.pow(1 - t, 2);
            this.x = p.startX + (p.apexX - p.startX) * ease;
            // Y arcs up + over: -20px peak above midpoint
            const midY = (p.startY + p.apexY) / 2 - 20;
            this.y = (1 - t) * (1 - t) * p.startY
                    + 2 * (1 - t) * t * midY
                    + t * t * p.apexY;
            if (t >= 1) {
                p.phase = 'STRIKE';
                p.timer = 0;
            }
        } else if (p.phase === 'STRIKE') {
            // Single-frame damage event, then immediately enter vault
            if (!p.struck && p.target && p.target.alive) {
                const killed = p.target.hurt(5, p.side, { knockBack: 0 });
                p.struck = true;
                // Visual stab + score
                particles.hitSpark(p.target.x + p.target.w / 2, p.target.y, '#ffffff');
                // Shake scales by outcome — kills jolt harder than stuns.
                const shakeMag = killed ? 5 : 3;
                this.requestShake = Math.max(this.requestShake || 0, shakeMag);
                this.hitPauseFrames = Math.max(this.hitPauseFrames || 0, killed ? 6 : 4);
                if (killed) {
                    this.kills++;
                    this.tauntKill(p.target.maxHp >= 10);
                    this.combo++;
                    this.maxCombo = Math.max(this.maxCombo, this.combo);
                    this.pounceKills = (this.pounceKills || 0) + 1;
                    const points = 200 + this.combo * 12;
                    this.score += points;
                    particles.floatingText(
                        p.target.x + p.target.w / 2, p.target.y - 2,
                        '+' + points, '#ffe070', 60, -0.8, 1.6
                    );
                } else {
                    // Survived — stun the enemy so the player gets free shots
                    p.target._stunTimer = 60;
                    particles.floatingText(
                        p.target.x + p.target.w / 2, p.target.y - 4,
                        'STUNNED', '#80e0ff', 50, -0.4, 1
                    );
                }
                audio.sfx('pounceStab');
            }
            p.phase = 'VAULT';
            p.timer = 0;
        } else if (p.phase === 'VAULT') {
            // 10-frame arc from apex → land position (other side)
            const t = Math.min(1, p.timer / 10);
            const ease = 1 - Math.pow(1 - t, 2);
            this.x = p.apexX + (p.landX - p.apexX) * ease;
            // Arc up over the head: peak -12px above apex
            const midY = (p.apexY + p.apexY) / 2 - 12;
            this.y = (1 - t) * (1 - t) * p.apexY
                    + 2 * (1 - t) * t * midY
                    + t * t * p.apexY;
            if (t >= 1) {
                // Land on the opposite side; refresh one air-jump so the
                // player can save themselves from pits / hazards.
                this.state = STATE.FALL;
                this.vy = 0;
                this.vx = p.side * 0.5;
                this.airJumpsLeft = 1;
                this.facing = p.side;
                this._pounce = null;
                this._pounceTarget = null;
                // Brief landing dust at the vault end
                particles.dust(this.x + this.w / 2, this.y + this.h);
            }
        }
    }

    // Canonical muzzle position in WORLD coordinates. Single source of truth
    // shared by bullet spawn (fire), muzzle-flash particles, and the visible
    // procedural barrel (_drawAimArm). Before this was unified, bullet origin
    // sat at body-center+12 while the visible barrel sat at shoulder+13 —
    // bullets looked like they came from Clippy's chest, not his rifle.
    _muzzleWorldPos() {
        // Shoulder offset: (+facing*2, -3) from sprite center. Sprite center
        // sits at (x + w/2, y + h/2 - 1) — the +1 below matches the render-time
        // offset in render() so the world-space anchor lines up with the
        // visible sprite when no recoil is applied.
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2 - 1;
        const sx = cx + this.facing * 2;
        const sy = cy - 3;
        const ax = this.aim?.x ?? this.facing;
        const ay = this.aim?.y ?? 0;
        const armLen = 5, barrelLen = 8;
        const recoilPull = this.recoilTimer > 0 ? Math.min(3, this.recoilTimer / 2) : 0;
        return {
            x: sx + ax * (armLen + barrelLen - recoilPull),
            y: sy + ay * (armLen + barrelLen - recoilPull),
        };
    }

    // R203: `_drawAimArm` is now dead code — no callers in the codebase.
    // The painted v6 per-weapon body sprites own the arm + gun visual.
    // Leaving the implementation in place for now (rather than deleting
    // ~240 lines) in case we want to revive the procedural fallback for
    // a state that doesn't get a painted variant. Safe to delete in a
    // later cleanup pass. `_muzzleWorldPos` above is still used by
    // bullet spawn + muzzle-flash code.
    _drawAimArm(ctx, cx, cy) {
        const ax = this.aim?.x, ay = this.aim?.y;
        if (ax == null) return;
        const sx = Math.round(cx + this.facing * 2);
        const sy = Math.round(cy - 3);
        const armLen = 5;
        // R155: composite the PAINTED weapon sprite at the grip point. Each
        // weapon has its own PNG (WEAPON_MANIFEST) drawn side-on with the
        // barrel pointing right. We translate to the grip point, rotate to
        // aim direction, and flip vertically when facing left (so the gun
        // bottom stays down). Falls through to the procedural barrel below
        // if the sprite hasn't loaded yet.
        const weaponKey = 'weapon_' + (this.weapon || 'mg').toLowerCase();
        if (sprites.has(weaponKey)) {
            const img = sprites.images.get(weaponKey);
            const gripX = sx + ax * armLen;
            const gripY = sy + ay * armLen;
            const angle = Math.atan2(ay, ax);
            // Aim vector inherently flips with `facing` (since ax sign tracks
            // facing). When facing left the angle is in the +PI hemisphere,
            // so the sprite's "up" still reads as up after rotation. Only
            // mirror when facing left so the gun-bottom doesn't end up on top.
            const flipY = this.facing < 0;
            const recoilPull = this.recoilTimer > 0 ? Math.min(3, this.recoilTimer / 2) : 0;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.translate(gripX, gripY);
            ctx.rotate(angle);
            if (flipY) ctx.scale(1, -1);
            // Draw with grip at left edge, vertically centered. Pull back by
            // `recoilPull` along the aim vector while firing for kickback.
            ctx.drawImage(img, -recoilPull, -img.height / 2);
            ctx.restore();
            return;
        }
        // Chainsaw: a longer, fatter blade with spinning teeth instead of
        // the rifle barrel. Reads as melee/spin instead of a rifle muzzle.
        if (this.weapon === 'CHAINSAW') {
            const barLen = 14;
            const elbowX = sx + ax * armLen;
            const elbowY = sy + ay * armLen;
            const tipX = elbowX + ax * barLen;
            const tipY = elbowY + ay * barLen;
            // Arm — grip
            this._line(ctx, sx, sy, elbowX, elbowY, '#604030', 2);
            // Saw bar — dark outline + grey core
            this._line(ctx, elbowX, elbowY, tipX, tipY, '#101018', 4);
            this._line(ctx, elbowX, elbowY, tipX, tipY, '#d8d8e0', 2);
            // Spinning-teeth animation along the blade — alternating dots
            const spin = (this.timer || 0) % 4;
            ctx.fillStyle = spin < 2 ? '#ffe070' : '#ff9030';
            const steps = 5;
            for (let i = 1; i <= steps; i++) {
                const t = i / (steps + 1);
                const px = Math.round(elbowX + ax * barLen * t);
                const py = Math.round(elbowY + ay * barLen * t);
                // Tooth-side offset perpendicular to aim
                const px2 = Math.round(px + (-ay) * 2);
                const py2 = Math.round(py + ax * 2);
                if ((i + spin) & 1) ctx.fillRect(px2, py2, 1, 1);
                else ctx.fillRect(Math.round(px - (-ay) * 2), Math.round(py - ax * 2), 1, 1);
            }
            // Engine block — small block at the elbow side
            ctx.fillStyle = '#5a3018';
            ctx.fillRect(Math.round(elbowX - this.facing * 2), Math.round(elbowY - 2), 4, 4);
            ctx.fillStyle = '#a05828';
            ctx.fillRect(Math.round(elbowX - this.facing * 2 + 1), Math.round(elbowY - 1), 2, 2);
            return;
        }
        // Per-weapon barrel length — MG/SHOTGUN are short stocks, LASER is
        // a long sci-fi tube, HOMING is a chunky launcher, THUNDER is a fat
        // coil. Game-zoom silhouette has to read at a glance, so the lengths
        // are intentionally spaced apart.
        const BARREL_LEN = {
            MG: 9, SHOTGUN: 7, SPREAD: 8, LASER: 13, FLAME: 6, HOMING: 11, THUNDER: 8, CHAINSAW: 14,
        };
        const barrelLen = BARREL_LEN[this.weapon] ?? 9;
        const recoilPull = this.recoilTimer > 0 ? Math.min(3, this.recoilTimer / 2) : 0;
        const elbowX = sx + ax * armLen;
        const elbowY = sy + ay * armLen;
        const muzzleX = elbowX + ax * (barrelLen - recoilPull);
        const muzzleY = elbowY + ay * (barrelLen - recoilPull);
        // Perpendicular vector for cross-axis offsets (e.g. double-barrel rake)
        const px = -ay, py = ax;
        // Arm — always rendered the same; weapon variants below paint the
        // barrel/emitter differently so each pickup feels distinct.
        // R196: R192's 4px dark + 2px chrome smeared because `_line` draws
        // thickness×thickness blocks at every Bresenham step — so a "4px"
        // line is a 4×4 block trail, which dwarfs a 20px Clippy and
        // collided with v5's baked body curl. Back to 2px dark + 1px
        // chrome — a clean paperclip wire that still reads against any
        // painted backdrop because dark+light contrast is intrinsic.
        this._line(ctx, sx, sy, elbowX, elbowY, '#101018', 2);
        this._line(ctx, sx, sy, elbowX, elbowY, '#d0d0d8', 1);
        if (this.weapon === 'SHOTGUN') {
            // Double-stacked side-by-side barrels — both 3px thick, 3px apart.
            // Silhouette: short FAT brown rectangle, clearly thicker than MG.
            const tipX = muzzleX, tipY = muzzleY;
            // Upper barrel (+2 on cross axis)
            this._line(ctx, elbowX + px * 2, elbowY + py * 2, tipX + px * 2, tipY + py * 2, '#101018', 3);
            this._line(ctx, elbowX + px * 2, elbowY + py * 2, tipX + px * 2, tipY + py * 2, '#a08070', 1);
            // Lower barrel
            this._line(ctx, elbowX, elbowY, tipX, tipY, '#101018', 3);
            this._line(ctx, elbowX, elbowY, tipX, tipY, '#a08070', 1);
            // Big brown wood stock behind the grip — chunky 6x5
            ctx.fillStyle = '#5a2c0a';
            ctx.fillRect(Math.round(elbowX - this.facing * 6), Math.round(elbowY - 2), 6, 5);
            ctx.fillStyle = '#8a4818';
            ctx.fillRect(Math.round(elbowX - this.facing * 6 + 1), Math.round(elbowY - 1), 4, 3);
            ctx.fillStyle = '#c08030';
            ctx.fillRect(Math.round(elbowX - this.facing * 6 + 2), Math.round(elbowY), 2, 1);
            // Muzzle: bright orange double-flash for shotgun signature
            ctx.fillStyle = '#ff8030';
            ctx.fillRect(Math.round(tipX), Math.round(tipY), 1, 1);
            ctx.fillRect(Math.round(tipX + px * 2), Math.round(tipY + py * 2), 1, 1);
        } else if (this.weapon === 'SPREAD') {
            // Triple-tube fan that flares out at the muzzle.
            for (let lane = -1; lane <= 1; lane++) {
                const offX = px * lane, offY = py * lane;
                this._line(ctx, elbowX + offX, elbowY + offY,
                           muzzleX + offX * 2, muzzleY + offY * 2, '#101018', 2);
                this._line(ctx, elbowX + offX, elbowY + offY,
                           muzzleX + offX * 2, muzzleY + offY * 2, '#80d0ff', 1);
            }
        } else if (this.weapon === 'LASER') {
            // Sci-fi emitter — LONG cyan beam tube. Length is the read here:
            // a 13px barrel reaches well past Clippy's silhouette so the
            // outline screams "long sniper" vs MG's stubby 9.
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#101018', 3);
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#80ffe0', 1);
            // Big pulsing emitter ring at the elbow — 6x6 box with cyan core
            const pulse = ((this.timer || 0) % 8) < 4 ? '#80ffe0' : '#20a888';
            ctx.fillStyle = '#101018';
            ctx.fillRect(Math.round(elbowX - 3), Math.round(elbowY - 3), 6, 6);
            ctx.fillStyle = pulse;
            ctx.fillRect(Math.round(elbowX - 2), Math.round(elbowY - 2), 4, 4);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(elbowX), Math.round(elbowY), 1, 1);
            // Cyan glow ball at the muzzle tip — signature of a beam weapon
            ctx.fillStyle = '#80ffe0';
            ctx.fillRect(Math.round(muzzleX - 1), Math.round(muzzleY - 1), 3, 3);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(muzzleX), Math.round(muzzleY), 1, 1);
        } else if (this.weapon === 'FLAME') {
            // Chunky fuel-tank backpack + wide nozzle. Shorter barrel, wider tip.
            const fBarrelLen = 6;
            const tipX = elbowX + ax * (fBarrelLen - recoilPull);
            const tipY = elbowY + ay * (fBarrelLen - recoilPull);
            this._line(ctx, elbowX, elbowY, tipX, tipY, '#101018', 4);
            this._line(ctx, elbowX, elbowY, tipX, tipY, '#a05030', 2);
            // Wide nozzle — 3-wide tip
            ctx.fillStyle = '#101018';
            ctx.fillRect(Math.round(tipX + px - 1), Math.round(tipY + py - 1), 3, 3);
            // Fuel tank on Clippy's back
            ctx.fillStyle = '#3a1a08';
            ctx.fillRect(Math.round(sx - this.facing * 4), Math.round(sy - 1), 3, 6);
            ctx.fillStyle = '#a05030';
            ctx.fillRect(Math.round(sx - this.facing * 4 + 1), Math.round(sy), 1, 4);
        } else if (this.weapon === 'HOMING') {
            // Bulky rocket launcher — wide 5px dark tube, magenta tip, side
            // fin. Silhouette is FAT and ends in a big diamond cone tip.
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#101018', 5);
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#3a1838', 3);
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#7a3878', 1);
            // Big magenta diamond tip — 3x3 cluster reads at game zoom
            ctx.fillStyle = '#ff60ff';
            ctx.fillRect(Math.round(muzzleX - 1), Math.round(muzzleY - 1), 3, 3);
            ctx.fillStyle = '#ffaaff';
            ctx.fillRect(Math.round(muzzleX), Math.round(muzzleY), 1, 1);
            // Top-side launcher fin — 3-wide block sitting on the tube
            ctx.fillStyle = '#a040a0';
            ctx.fillRect(Math.round(elbowX + ax * 3 + px * 3),
                         Math.round(elbowY + ay * 3 + py * 3), 3, 2);
            ctx.fillStyle = '#ff60ff';
            ctx.fillRect(Math.round(elbowX + ax * 4 + px * 3),
                         Math.round(elbowY + ay * 4 + py * 3), 1, 1);
        } else if (this.weapon === 'THUNDER') {
            // Tesla coil — fat purple barrel + spherical coil tip + crackling
            // arc above. Color (purple/yellow) instantly separates from MG.
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#101018', 5);
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#6840a8', 3);
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#c0a8ff', 1);
            // Globe coil at the tip — 3x3 bright sphere, signature shape
            ctx.fillStyle = '#101018';
            ctx.fillRect(Math.round(muzzleX - 1), Math.round(muzzleY - 1), 3, 3);
            ctx.fillStyle = '#fffac8';
            ctx.fillRect(Math.round(muzzleX), Math.round(muzzleY), 1, 1);
            // Crackle arc above the globe — animated zigzag
            const crackle = ((this.timer || 0) % 6) < 3;
            ctx.fillStyle = crackle ? '#ffffff' : '#fffac8';
            ctx.fillRect(Math.round(muzzleX + px * 2), Math.round(muzzleY + py * 2), 1, 1);
            ctx.fillRect(Math.round(muzzleX + px * 3 + ax), Math.round(muzzleY + py * 3 + ay), 1, 1);
            ctx.fillRect(Math.round(muzzleX + px * 4 - ax), Math.round(muzzleY + py * 4 - ay), 1, 1);
        } else {
            // MG (default) — single rifle barrel + side magazine. Adds a
            // tiny block hanging off the cross axis so the silhouette
            // reads as a real gun, not just a stick.
            // R196: pulled back from R192's 4px+2px stack. _line draws
            // thickness×thickness blocks per step, so the barrel was a
            // smudge instead of a barrel. 3px dark + 1px chrome reads as
            // a real rifle barrel at game zoom without crowding Clippy.
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#101018', 3);
            this._line(ctx, elbowX, elbowY, muzzleX, muzzleY, '#d8d8e0', 1);
            // Magazine — small block hanging below the receiver
            ctx.fillStyle = '#101018';
            ctx.fillRect(Math.round(elbowX + ax * 2 - px * 2),
                         Math.round(elbowY + ay * 2 - py * 2), 2, 3);
            ctx.fillStyle = '#404048';
            ctx.fillRect(Math.round(elbowX + ax * 2 - px * 2),
                         Math.round(elbowY + ay * 2 - py * 2 + 1), 1, 1);
        }
        // Muzzle tip — bright starburst when fireCooldown is fresh (just fired).
        // Cross-pattern + hot center reads as a real muzzle flash instead of a
        // flat yellow square. Decays with recoilTimer.
        const mx = Math.round(muzzleX);
        const my = Math.round(muzzleY);
        if (this.recoilTimer > 2) {
            const flashSize = this.recoilTimer > 4 ? 3 : 2;
            // Warm outer cross (orange)
            ctx.fillStyle = '#ff9030';
            ctx.fillRect(mx - flashSize, my, flashSize * 2 + 1, 1);
            ctx.fillRect(mx, my - flashSize, 1, flashSize * 2 + 1);
            // Mid cross (yellow)
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(mx - 1, my, 3, 1);
            ctx.fillRect(mx, my - 1, 1, 3);
            // White-hot center
            ctx.fillStyle = '#fff';
            ctx.fillRect(mx, my, 1, 1);
        } else if (this.recoilTimer > 0) {
            // Residual yellow dot during the tail of the kickback
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(mx - 1, my - 1, 3, 3);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(mx, my, 1, 1);
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
        // R202: weapon-specific body sprite override. For every weapon
        // OTHER than MG (which uses the 4-frame run cycle), we have a
        // single painted Clippy-with-weapon pose. RUN/idle/shoot/aim all
        // collapse to that static pose while the weapon is held, so the
        // player sees the right gun in their hand even when not running.
        // MG falls through to the normal aim-band + run-cycle path.
        const weaponPose = {
            SHOTGUN:  'v6_shotgun',
            SPREAD:   'v6_spread',
            LASER:    'v6_laser',
            FLAME:    'v6_flame',
            HOMING:   'v6_homing',
            THUNDER:  'v6_thunder',
            CHAINSAW: 'v6_chainsaw',
        }[this.weapon];
        // Only override when the painted asset is loaded AND we're in a
        // state where the upper-body silhouette is the dominant read
        // (RUN / idle / aim). Jump, prone, hurt, die, etc. still get
        // their own painted poses since the weapon isn't the focus.
        if (weaponPose && sprites.has(weaponPose)) {
            if (this.state === STATE.RUN || this.state === STATE.IDLE ||
                this.state === undefined || this.state === null ||
                this.state === STATE.CROUCH || this.state === STATE.COVER) {
                return weaponPose;
            }
        }
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
                    // Run-shoot: aim-aware variant if available so the legs still
                    // cycle but the upper body matches aim direction.
                    if (aimBand === 'up' && sprites.has('aim_up')) return 'aim_up';
                    if (aimBand === 'diag-up' && sprites.has('aim_diag')) return 'aim_diag';
                    if (aimBand === 'diag-down' && sprites.has('aim_diag_down')) return 'aim_diag_down';
                    const phase = Math.floor(this.animFrame / 2) % 3;
                    return ['run_shoot_1', 'run_shoot_2', 'run_shoot_3'][phase];
                }
                // R372: 5-frame cycle had frame 4 land on the IDLE pose
                // (v6_run_4.png is legs-together) and frame 5 was a dupe
                // of frame 1, so the rhythm went stride-stride-stride-
                // STAND-stride and read as "sliding on ice". Use a clean
                // 4-frame walk-cycle: 1 → 2 → 3 → 2 (mirror) → repeat.
                const phase = Math.floor(this.animFrame) % 4;
                return ['run_1', 'run_2', 'run_3', 'run_2'][phase];
            }
            // 3-pose jump arc keyed off vy: rising (vy < -1.5), peak (-1.5..1.5),
            // falling (vy > 1.5). Falls back to plain 'jump' for any missing
            // variant so manifest gaps don't crash the read. Shooting mid-air
            // swaps to the painted rifle-overhead jump pose.
            case STATE.JUMP:
            case STATE.FALL: {
                // R381: was `shooting` (fireCooldown-based, 4-frame window
                // after firing). That made jumps mid-recoil show the
                // gun-extended pose for ~4 frames — user kept seeing
                // "jump with gun" even after R353. Tighten to only show
                // jump_aim when the shoot button is CURRENTLY HELD
                // (intent-based, not recoil-tail).
                if (input.isHeld('shoot') && sprites.has('jump_aim')) return 'jump_aim';
                if (this.vy < -1.5) return 'jump';                // rising
                if (this.vy > 1.5) return sprites.has('fall') ? 'fall' : 'jump';
                return 'jump';                                     // peak
            }
            case STATE.SPIN_JUMP:
            case STATE.POUNCE: {
                // 4-frame spin: jump → spin_1 (90°) → spin_2 (180°) → spin_1 mirrored (270°)
                const phase = Math.floor(this.spinAngle / (Math.PI / 2)) % 4;
                const seq = ['jump', 'spin_1', 'spin_2', 'spin_1'];
                return seq[phase];
            }
            case STATE.CROUCH: return 'crouch';
            case STATE.PRONE:
            case STATE.SLIDE:
            case STATE.ROLL: return shooting && sprites.has('prone_shoot') ? 'prone_shoot' : 'prone';
            case STATE.CRAWL: return sprites.has('prone_shoot') ? 'prone_shoot' : 'prone';
            case STATE.BACKDASH: return 'backdash';
            case STATE.CLIMB: return Math.floor(this.animFrame) % 2 === 0 ? 'run_1' : 'run_2';
            case STATE.COVER: return 'crouch';
            case STATE.LEDGE_HANG:
                return sprites.has('ledge_hang') ? 'ledge_hang' : 'jump';
            case STATE.LEDGE_CLIMB: {
                // First half: pull-up frame. Second half: settled-on-top frame.
                const halfway = this._ledgeClimbT >= 11;
                if (halfway && sprites.has('ledge_climb_2')) return 'ledge_climb_2';
                if (sprites.has('ledge_climb_1')) return 'ledge_climb_1';
                return 'jump';
            }
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
                if (aimBand === 'diag-down' && sprites.has('aim_diag_down')) return 'aim_diag_down';
                if (aimBand === 'down' || aimBand === 'diag-down') {
                    return shooting ? 'crouch_shoot' : 'crouch';
                }
                if (shooting) return 'shoot';
                return 'idle';
            }
        }
    }
}

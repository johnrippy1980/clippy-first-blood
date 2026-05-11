// ============================================
// ENEMY CLASSES - Office Supply Villains
// ============================================

class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = type.width;
        this.height = type.height;
        this.health = type.health;
        this.maxHealth = type.health;
        this.damage = type.damage;
        this.speed = type.speed;
        this.behavior = type.behavior;
        this.score = type.score;

        this.vx = 0;
        this.vy = 0;
        this.facingRight = false;
        this.active = true;

        this.fireTimer = 0;
        this.fireRate = 60; // frames between shots
        this.bullets = [];
        this.hitFlash = 0;

        // Behavior-specific
        this.behaviorTimer = 0;
        this.sineOffset = Math.random() * Math.PI * 2;
        this.bounceVy = -5;
    }

    update(level, player) {
        if (!this.active) return;

        // Boss death pyrotechnics freeze the AI and bullets
        if (this.dying) {
            this.updateDeathSequence();
            return;
        }

        this.behaviorTimer++;

        // Face player. Behaviors that need a locked facing through a
        // commit (charge windup/charge/recover, fly_sine which uses
        // facingRight as its movement direction and bounces at level
        // edges) opt out and manage facingRight themselves.
        const chargeLocked = this.behavior === 'charge'
            && this.chargeState && this.chargeState !== 'idle';
        if (!chargeLocked && this.behavior !== 'fly_sine') {
            this.facingRight = player.x > this.x;
        }

        // Update behavior
        switch (this.behavior) {
            case 'hop':
                this.updateHop(level, player);
                break;
            case 'fly_sine':
                this.updateFlySine(level, player);
                break;
            case 'bounce':
                this.updateBounce(level, player);
                break;
            case 'stationary':
                this.updateStationary(level, player);
                break;
            case 'miniboss':
                this.updateMiniboss(level, player);
                break;
            case 'photocopier_boss':
                this.updatePhotocopierBoss(level, player);
                break;
            case 'charge':
                this.updateCharge(level, player);
                break;
            case 'hover_sniper':
                this.updateHoverSniper(level, player);
                break;
            case 'shredder_boss':
                this.updateShredderBoss(level, player);
                break;
            case 'ctrl_alt_del_boss':
                this.updateCtrlAltDelBoss(level, player);
                break;
            case 'ballmer_boss':
                this.updateBallmerBoss(level, player);
                break;
            case 'bill_gates_boss':
                this.updateBillGatesBoss(level, player);
                break;
            case 'clippy2_boss':
                this.updateClippy2Boss(level, player);
                break;
            case 'algorithm_boss':
                this.updateAlgorithmBoss(level, player);
                break;
        }

        // Update projectiles
        this.updateBullets(level);

        // Fire timer
        if (this.fireTimer > 0) this.fireTimer--;
        if (this.hitFlash > 0) this.hitFlash--;
    }

    updateHop(level, player) {
        // Stapler - hops toward player, shoots staples
        this.vy += GAME.GRAVITY;

        // Hop periodically
        if (this.behaviorTimer % 60 === 0) {
            this.vy = -4;
            this.vx = (this.facingRight ? 1 : -1) * this.speed * 2;
        }

        // Apply velocity
        this.x += this.vx;
        this.y += this.vy;

        // Ground collision
        if (level.isSolid(this.x + this.width / 2, this.y + this.height)) {
            this.y = Math.floor((this.y + this.height) / GAME.TILE_SIZE) * GAME.TILE_SIZE - this.height;
            this.vy = 0;
            this.vx *= 0.8;
        }

        // Shoot at player
        if (this.fireTimer === 0 && Math.abs(player.x - this.x) < 150) {
            this.fireAtPlayer(player);
            this.fireTimer = this.fireRate;
        }
    }

    updateFlySine(level, player) {
        // Flying file folder - sine wave movement, shoots paper clips
        const baseY = this.y;
        this.x += (this.facingRight ? 1 : -1) * this.speed;
        this.y += Math.sin(this.behaviorTimer * 0.05 + this.sineOffset) * 0.5;

        // Reverse at screen edges
        if (this.x < 0 || this.x > level.width * GAME.TILE_SIZE - this.width) {
            this.facingRight = !this.facingRight;
        }

        // Shoot at player
        if (this.fireTimer === 0 && Math.abs(player.y - this.y) < 50) {
            this.fireAtPlayer(player);
            this.fireTimer = this.fireRate * 1.5;
        }
    }

    updateBounce(level, player) {
        // Rubber band ball - bounces erratically
        this.vy += GAME.GRAVITY * 0.5;
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off walls
        if (level.isSolid(this.x, this.y + this.height / 2) ||
            level.isSolid(this.x + this.width, this.y + this.height / 2)) {
            this.vx *= -1;
        }

        // Bounce off floor/ceiling
        if (level.isSolid(this.x + this.width / 2, this.y + this.height)) {
            this.y = Math.floor((this.y + this.height) / GAME.TILE_SIZE) * GAME.TILE_SIZE - this.height;
            // Erratic bounce height - some short, some tall, so the rubber-band
            // ball doesn't lock into a predictable rhythm.
            this.vy = this.bounceVy - Math.random() * 2;
            // Random horizontal movement
            this.vx = (Math.random() - 0.5) * this.speed * 4;
        }
        if (level.isSolid(this.x + this.width / 2, this.y)) {
            this.y = Math.floor(this.y / GAME.TILE_SIZE) * GAME.TILE_SIZE + GAME.TILE_SIZE;
            this.vy = Math.abs(this.vy);
        }
    }

    updateStationary(level, player) {
        // Tape dispenser - doesn't move, shoots sticky tape
        if (this.fireTimer === 0 && Math.abs(player.x - this.x) < 200) {
            this.fireAtPlayer(player, 'tape');
            this.fireTimer = this.fireRate * 2;
        }
    }

    updateMiniboss(level, player) {
        // File cabinet boss - three attack patterns, phase 2 when HP drops below half
        const phase2 = this.health / this.maxHealth <= 0.5;
        // Cycle attack patterns every 90 frames (phase 1) or 60 frames (phase 2)
        const cycleLen = phase2 ? 60 : 90;
        const step = this.behaviorTimer % cycleLen;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 4 : 3);

        // Telegraph: blink one frame before firing
        const fireFrame = cycleLen - 1;
        if (step === fireFrame - 10) {
            this.attackTelegraph = pattern;
        }

        if (step !== fireFrame) return;
        this.attackTelegraph = -1;

        const fx = this.facingRight ? this.x + this.width : this.x;
        const dir = this.facingRight ? 1 : -1;

        switch (pattern) {
            case 0: {
                // Triple drawer barrage (original)
                for (let i = 0; i < 3; i++) {
                    this.bullets.push({
                        x: fx, y: this.y + 10 + i * 14,
                        vx: dir * 3, vy: 0,
                        damage: this.damage, life: 120, type: 'drawer'
                    });
                }
                break;
            }
            case 1: {
                // Aimed paperclip spread (5 projectiles fanning toward player)
                const dx = player.x - this.x;
                const dy = player.y - this.y;
                const ang = Math.atan2(dy, dx);
                const speed = phase2 ? 4 : 3.2;
                for (let i = -2; i <= 2; i++) {
                    const a = ang + i * 0.18;
                    this.bullets.push({
                        x: this.x + this.width / 2, y: this.y + 8,
                        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                        damage: this.damage, life: 100, type: 'paperclip'
                    });
                }
                break;
            }
            case 2: {
                // Arcing drawer lobbed toward player
                const dx = player.x - this.x;
                const time = 40;
                const vx = dx / time;
                const vy = -3.5 - Math.random() * 1.5;
                this.bullets.push({
                    x: this.x + this.width / 2, y: this.y,
                    vx, vy, gravity: 0.18,
                    damage: this.damage * 1.5, life: 120, type: 'drawer'
                });
                if (typeof audio !== 'undefined') audio.sfxEnemyHit();
                break;
            }
            case 3: {
                // Phase 2 only: ripping staple burst (8 rapid shots in a sweep)
                const dx = player.x - this.x;
                const dy = player.y - this.y;
                const baseAng = Math.atan2(dy, dx);
                for (let i = 0; i < 8; i++) {
                    const a = baseAng - 0.6 + (i / 7) * 1.2;
                    this.bullets.push({
                        x: this.x + this.width / 2, y: this.y + 16,
                        vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 4.5,
                        damage: this.damage * 0.7, life: 80, type: 'staple'
                    });
                }
                break;
            }
        }
    }

    // ---------- Swivel chair (Stage 2 ground threat) ----------
    // Sits still, then when the player gets close enough on the same Y level
    // it charges horizontally in a straight line. Bounces off walls.
    updateCharge(level, player) {
        this.vy += GAME.GRAVITY;
        // Ground collision
        if (level.isSolid(this.x + this.width / 2, this.y + this.height)) {
            this.y = Math.floor((this.y + this.height) / GAME.TILE_SIZE) * GAME.TILE_SIZE - this.height;
            this.vy = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }

        // State machine
        if (!this.chargeState) this.chargeState = 'idle';
        const sameLevel = Math.abs(player.y - this.y) < 32;

        if (this.chargeState === 'idle') {
            this.vx = 0;
            if (sameLevel && Math.abs(player.x - this.x) < 140) {
                this.chargeState = 'windup';
                this.chargeTimer = 30;     // tilt back for 30 frames
                this.facingRight = player.x > this.x;
            }
        } else if (this.chargeState === 'windup') {
            this.vx = 0;
            this.chargeTimer--;
            if (this.chargeTimer <= 0) {
                this.chargeState = 'charging';
                this.chargeTimer = 90;     // charge for up to 1.5s
            }
        } else if (this.chargeState === 'charging') {
            this.vx = (this.facingRight ? 1 : -1) * 4;
            this.chargeTimer--;
            // Stop if hitting a wall
            const ahead = this.facingRight ? this.x + this.width + 2 : this.x - 2;
            if (level.isSolid(ahead, this.y + this.height / 2) || this.chargeTimer <= 0) {
                this.chargeState = 'recover';
                this.chargeTimer = 45;
                this.vx *= 0.3;
                if (typeof particles !== 'undefined' && this.onGround) {
                    particles.landDust(this.x + this.width / 2, this.y + this.height);
                }
            }
        } else if (this.chargeState === 'recover') {
            this.vx *= 0.85;
            this.chargeTimer--;
            if (this.chargeTimer <= 0) this.chargeState = 'idle';
        }

        this.x += this.vx;
    }

    // ---------- Highlighter (Stage 2 aerial sniper) ----------
    // Hovers at a fixed altitude, drifts toward the player's column, and
    // periodically fires a long laser beam straight down.
    updateHoverSniper(level, player) {
        if (this.hoverY === undefined) this.hoverY = this.y;
        // Bob up and down sinusoidally
        this.y = this.hoverY + Math.sin(this.behaviorTimer * 0.06) * 4;
        // Drift toward the player horizontally
        const dx = player.x - this.x;
        const dir = Math.sign(dx);
        this.vx = dir * this.speed;
        this.x += this.vx;
        this.facingRight = dir > 0;

        // Fire beam when roughly above the player
        if (Math.abs(dx) < 18 && this.fireTimer === 0) {
            // Telegraph: brief delay before firing
            if (this.sniperTelegraph == null) this.sniperTelegraph = 30;
            if (this.sniperTelegraph > 0) {
                this.sniperTelegraph--;
                if (this.sniperTelegraph === 0) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height,
                        vx: 0, vy: 6,
                        damage: this.damage,
                        life: 40,
                        type: 'beam'
                    });
                    this.fireTimer = 80;
                    this.sniperTelegraph = null;     // re-arm next pass
                    if (typeof audio !== 'undefined') audio.sfxShoot();
                }
            }
        } else {
            this.sniperTelegraph = null;
        }
    }

    // ---------- THE ALGORITHM (Stage 8 final-final boss) ----------
    // A disembodied AI eye floating in the clouds. Patterns:
    //   0 RADIAL DATA  - 16-shot starburst
    //   1 LIGHTNING    - 3 vertical lightning columns
    //   2 EYE LASER    - giant scanner beam in the player's direction
    //   3 RECOMMENDATION ENGINE - 5 homing-ish targeted shots
    //   4 (phase 2) SINGULARITY - inward-collapsing then exploding burst
    updateAlgorithmBoss(level, player) {
        const phase2 = this.health / this.maxHealth <= 0.5;
        const cycleLen = phase2 ? 75 : 100;
        const step = this.behaviorTimer % cycleLen;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 5 : 4);

        // Floats in place with a slow bob - no gravity
        if (this.hoverY === undefined) this.hoverY = this.y;
        this.y = this.hoverY + Math.sin(this.behaviorTimer * 0.04) * 8;

        const fireFrame = cycleLen - 1;
        if (step === fireFrame - 20) this.attackTelegraph = pattern;

        if (step !== fireFrame) return;
        this.attackTelegraph = -1;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        this.facingRight = dx > 0;

        switch (pattern) {
            case 0: {
                // RADIAL DATA - 16-shot starburst
                for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * Math.PI * 2;
                    this.bullets.push({
                        x: this.x + this.width / 2, y: this.y + this.height / 2,
                        vx: Math.cos(a) * 3, vy: Math.sin(a) * 3,
                        damage: this.damage * 0.6, life: 110, type: 'data'
                    });
                }
                break;
            }
            case 1: {
                // LIGHTNING - 3 vertical columns from above, spread around the boss
                for (let col = 0; col < 3; col++) {
                    const px = this.x + (col - 1) * 90;
                    for (let i = 0; i < 5; i++) {
                        this.bullets.push({
                            x: px + (Math.random() - 0.5) * 6, y: -10 - i * 12,
                            vx: 0, vy: 5,
                            damage: this.damage * 0.7, life: 100,
                            type: 'scanner', delay: i * 4
                        });
                    }
                }
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                break;
            }
            case 2: {
                // EYE LASER - long horizontal beam toward player
                const dir = dx > 0 ? 1 : -1;
                for (let i = 0; i < 8; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2, y: this.y + this.height / 2,
                        vx: dir * 5, vy: 0,
                        damage: this.damage, life: 90, type: 'scanner',
                        delay: i * 3
                    });
                }
                if (typeof game !== 'undefined' && game.shake) game.shake(4, 8);
                break;
            }
            case 3: {
                // RECOMMENDATION - 5 homing-ish shots aimed in a tight fan
                const a0 = Math.atan2(dy, dx);
                for (let i = -2; i <= 2; i++) {
                    const a = a0 + i * 0.18;
                    this.bullets.push({
                        x: this.x + this.width / 2, y: this.y + this.height / 2,
                        vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4,
                        damage: this.damage * 0.8, life: 100, type: 'data'
                    });
                }
                break;
            }
            case 4: {
                // SINGULARITY (phase 2) - 24-shot starburst, faster
                this.yellText = 'SINGULARITY';
                this.yellTimer = 60;
                for (let i = 0; i < 24; i++) {
                    const a = (i / 24) * Math.PI * 2;
                    this.bullets.push({
                        x: this.x + this.width / 2, y: this.y + this.height / 2,
                        vx: Math.cos(a) * 4, vy: Math.sin(a) * 4,
                        damage: this.damage * 0.7, life: 130, type: 'data'
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                if (typeof game !== 'undefined' && game.shake) game.shake(6, 12);
                break;
            }
        }
    }

    // ---------- CLIPPY 2.0 (Stage 7 hidden boss - corporate replacement) ----------
    // The soulless chrome replacement Microsoft tried to ship in Clippy's
    // place. Floats with thruster jets, fires corporate projectiles.
    updateClippy2Boss(level, player) {
        const phase2 = this.health / this.maxHealth <= 0.5;
        const cycleLen = phase2 ? 65 : 95;
        const step = this.behaviorTimer % cycleLen;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 5 : 4);

        // Floats - no gravity, hovers around the arena
        if (this.hoverY === undefined) this.hoverY = this.y;
        this.y = this.hoverY + Math.sin(this.behaviorTimer * 0.05) * 12;
        // Slowly tracks the player horizontally
        const dx = player.x - this.x;
        const dir = Math.sign(dx);
        this.facingRight = dir > 0;
        this.x += dir * this.speed * 0.6;

        const fireFrame = cycleLen - 1;
        if (step === fireFrame - 16) this.attackTelegraph = pattern;

        if (step !== fireFrame) return;
        this.attackTelegraph = -1;

        switch (pattern) {
            case 0: {
                // CORPORATE MEMO - 7 paperclip projectiles in a fan
                for (let i = -3; i <= 3; i++) {
                    const a = (dir > 0 ? 0 : Math.PI) + i * 0.15;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 20,
                        vx: Math.cos(a) * 3.4,
                        vy: Math.sin(a) * 3.4,
                        damage: this.damage * 0.55,
                        life: 110,
                        type: 'corporate'
                    });
                }
                break;
            }
            case 1: {
                // UPGRADE SCAN - horizontal beam sweep across the arena
                for (let i = 0; i < 6; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 12 + i * 6,
                        vx: dir * 4.5,
                        vy: 0,
                        damage: this.damage * 0.7,
                        life: 80,
                        type: 'scanner',
                        delay: i * 4
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxShoot();
                break;
            }
            case 2: {
                // SHAREHOLDER VALUE - falling stock-certificate projectiles
                for (let i = 0; i < 6; i++) {
                    this.bullets.push({
                        x: this.x + (i - 2.5) * 32 + (Math.random() - 0.5) * 8,
                        y: -10,
                        vx: 0,
                        vy: 2.5,
                        damage: this.damage * 0.7,
                        life: 140,
                        type: 'dollar',
                        delay: i * 8
                    });
                }
                break;
            }
            case 3: {
                // SYNERGY DASH - charges at the player with a hitbox shockwave
                this.yellText = 'SYNERGY!';
                this.yellTimer = 50;
                const speed = 5;
                this.bullets.push({
                    x: this.x + this.width / 2,
                    y: this.y + this.height / 2,
                    vx: dir * speed,
                    vy: 0,
                    damage: this.damage,
                    life: 70,
                    type: 'shockwave',
                    large: true
                });
                if (typeof game !== 'undefined' && game.shake) game.shake(3, 6);
                break;
            }
            case 4: {
                // Phase 2: VERSION UPGRADE - radial burst of 12 projectiles
                this.yellText = 'NEW VERSION';
                this.yellTimer = 60;
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height / 2,
                        vx: Math.cos(a) * 3.2,
                        vy: Math.sin(a) * 3.2,
                        damage: this.damage * 0.8,
                        life: 100,
                        type: 'corporate'
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                break;
            }
        }
    }

    // ---------- BILL GATES (Stage 6 - true final boss) ----------
    // The calculating founder. Where Ballmer is frenzy, Gates is methodical.
    // He stands almost still, glasses gleam during telegraphs, and his
    // attacks weaponize Microsoft products.
    //   0  MONEY RAIN     - three vertical columns of falling dollar bills
    //   1  BSOD WINDOWS   - three blue-screen rectangles spawn as hazards
    //   2  ANTITRUST FAN  - 7 lawsuit papers spread in a fan
    //   3  CMD COMMAND    - 4 horizontal text bullets across the arena
    //   4  PAPERCLIP SUM  - phase 2: 5 angry paperclip homing-ish bullets
    //   5  WINDOWS UPDATE - phase 2 finisher: top-down progress-bar rain
    updateBillGatesBoss(level, player) {
        const phase2 = this.health / this.maxHealth <= 0.5;
        const cycleLen = phase2 ? 90 : 120;
        const step = this.behaviorTimer % cycleLen;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 6 : 4);

        // Glasses gleam during telegraph (visual handled in draw)
        const fireFrame = cycleLen - 1;
        if (step === fireFrame - 24) this.attackTelegraph = pattern;

        // Gravity / ground collision
        this.vy += GAME.GRAVITY;
        if (level.isSolid(this.x + this.width / 2, this.y + this.height)) {
            this.y = Math.floor((this.y + this.height) / GAME.TILE_SIZE) * GAME.TILE_SIZE - this.height;
            this.vy = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }
        // Slow drift to face the player; otherwise mostly stationary
        if (this.onGround && this.behaviorTimer % 80 === 0) {
            this.vx = (player.x > this.x ? 1 : -1) * this.speed;
            this.facingRight = player.x > this.x;
        } else {
            this.vx *= 0.85;
        }
        this.x += this.vx;

        if (step !== fireFrame) return;
        this.attackTelegraph = -1;
        const dir = player.x > this.x ? 1 : -1;
        this.facingRight = dir > 0;

        switch (pattern) {
            case 0: {
                // MONEY RAIN - three vertical streams of dollar bills
                this.yellText = 'CHA-CHING';
                this.yellTimer = 50;
                for (let col = 0; col < 3; col++) {
                    const baseX = this.x + (col - 1) * 90;
                    for (let i = 0; i < 4; i++) {
                        this.bullets.push({
                            x: baseX + (Math.random() - 0.5) * 12,
                            y: -8 - i * 12,
                            vx: 0,
                            vy: 2.2 + (i % 2) * 0.4,
                            damage: this.damage * 0.5,
                            life: 200,
                            type: 'dollar',
                            delay: i * 12
                        });
                    }
                }
                break;
            }
            case 1: {
                // BSOD - three blue boxes appear at random heights
                for (let i = 0; i < 3; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height / 2,
                        vx: dir * (1.2 + i * 0.6),
                        vy: -2 + i * 1.2,
                        gravity: 0.05,
                        damage: this.damage,
                        life: 150,
                        type: 'bsod',
                        delay: i * 14
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                break;
            }
            case 2: {
                // ANTITRUST FAN - 7 lawsuit papers radiating out
                this.yellText = 'ANTITRUST';
                this.yellTimer = 50;
                for (let i = -3; i <= 3; i++) {
                    const angle = (dir > 0 ? 0 : Math.PI) + i * 0.18;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 16,
                        vx: Math.cos(angle) * 3.2,
                        vy: Math.sin(angle) * 3.2,
                        damage: this.damage * 0.7,
                        life: 100,
                        type: 'lawsuit'
                    });
                }
                break;
            }
            case 3: {
                // CMD COMMAND - 4 horizontal text bullets at different heights
                for (let i = 0; i < 4; i++) {
                    this.bullets.push({
                        x: this.x + (dir > 0 ? this.width : 0),
                        y: this.y + 8 + i * 10,
                        vx: dir * 4,
                        vy: 0,
                        damage: this.damage * 0.8,
                        life: 80,
                        type: 'cmd',
                        delay: i * 8
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxShoot();
                break;
            }
            case 4: {
                // ANGRY PAPERCLIP SUMMON - 5 paperclips that drift toward player
                this.yellText = 'IT LOOKS LIKE YOU\'RE DYING';
                this.yellTimer = 60;
                for (let i = 0; i < 5; i++) {
                    const a = -Math.PI / 2 + (i - 2) * 0.35;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y - 4,
                        vx: Math.cos(a) * 2.2,
                        vy: Math.sin(a) * 2.2,
                        gravity: 0.08,
                        damage: this.damage * 0.7,
                        life: 130,
                        type: 'paperclip'
                    });
                }
                break;
            }
            case 5: {
                // WINDOWS UPDATE - 6 progress-bar bars fall from the top across the arena
                this.yellText = 'INSTALLING UPDATES';
                this.yellTimer = 70;
                for (let i = 0; i < 6; i++) {
                    this.bullets.push({
                        x: this.x + (i - 2.5) * 36 + (Math.random() - 0.5) * 6,
                        y: -10,
                        vx: 0,
                        vy: 2.5,
                        damage: this.damage * 0.9,
                        life: 140,
                        type: 'update',
                        delay: i * 10
                    });
                }
                if (typeof game !== 'undefined' && game.shake) game.shake(4, 10);
                break;
            }
        }
    }

    // ---------- STEVE BALLMER (Stage 5 final boss) ----------
    // Bouncing high-energy CEO. Six attack patterns:
    //   0  DEVELOPERS!  - shouted shockwaves spread horizontally
    //   1  Coffee throw - three lobbed mug projectiles
    //   2  Crash jump   - big leap into the air, AOE shockwaves on landing
    //   3  YOU'RE FIRED - desk-phone slam triggers a ground fire wave
    //   4  Punch combo  - five staggered punch hitboxes
    //   5  Loafer kick  - one massive horizontal kick
    updateBallmerBoss(level, player) {
        const phase2 = this.health / this.maxHealth <= 0.5;
        const cycleLen = phase2 ? 80 : 110;
        const step = this.behaviorTimer % cycleLen;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 6 : 4);

        // ----- Constant high-energy idle -----
        this.vy += GAME.GRAVITY;

        // Pour sweat every few frames
        if (this.behaviorTimer % 6 === 0 && typeof particles !== 'undefined') {
            particles.spawn({
                x: this.x + 8 + Math.random() * (this.width - 16),
                y: this.y + 4,
                vx: (Math.random() - 0.5) * 0.5,
                vy: 0.6 + Math.random() * 0.6,
                gravity: 0.18,
                life: 22,
                size: 1,
                colors: ['#a8d8ff', '#5aa8e0', '#2050a0']
            });
        }

        // Ground collision (player physics-ish)
        if (level.isSolid(this.x + this.width / 2, this.y + this.height)) {
            this.y = Math.floor((this.y + this.height) / GAME.TILE_SIZE) * GAME.TILE_SIZE - this.height;
            // Land detection - drop AOE shockwave if landing hard during crash-jump
            if (this.vy > 4 && this.crashJumpArmed) {
                this.crashJumpArmed = false;
                this.spawnLandingShockwave();
            }
            this.vy = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }

        // Constant bouncy hopping to harass the player
        if (this.onGround && this.behaviorTimer % 36 === 0) {
            this.vy = -4.5;
            this.vx = (player.x > this.x ? 1 : -1) * this.speed;
            this.facingRight = player.x > this.x;
        } else if (this.onGround) {
            this.vx *= 0.8;
        }

        this.x += this.vx;

        // Telegraph
        const fireFrame = cycleLen - 1;
        if (step === fireFrame - 16) this.attackTelegraph = pattern;

        if (step !== fireFrame) return;
        this.attackTelegraph = -1;
        const dir = player.x > this.x ? 1 : -1;
        this.facingRight = dir > 0;

        switch (pattern) {
            case 0: {
                // DEVELOPERS x3 - 3 horizontal shockwave bullets, yelled text overlay
                this.yellText = 'DEVELOPERS!';
                this.yellTimer = 60;
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                for (let i = -1; i <= 1; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 18 + i * 6,
                        vx: dir * 3.6,
                        vy: 0,
                        damage: this.damage * 0.6,
                        life: 90,
                        type: 'shockwave',
                        delay: Math.abs(i) * 6
                    });
                }
                if (typeof game !== 'undefined' && game.shake) game.shake(2, 6);
                break;
            }
            case 1: {
                // Coffee cup lob
                for (let i = 0; i < 3; i++) {
                    const dx = player.x + i * 24 - this.x;
                    const time = 28 + i * 4;
                    const vx = dx / time;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 12,
                        vx, vy: -3.5 - i * 0.4,
                        gravity: 0.22,
                        damage: this.damage * 0.8,
                        life: 100,
                        type: 'coffee'
                    });
                }
                break;
            }
            case 2: {
                // Crash jump - leap high, land hard with AOE shockwave (handled in collision)
                this.vy = -8;
                this.vx = (player.x - this.x) / 30;
                this.crashJumpArmed = true;
                break;
            }
            case 3: {
                // YOU'RE FIRED - ground fire wave traveling toward the player
                this.yellText = "YOU'RE FIRED!";
                this.yellTimer = 70;
                this.phoneSlam = 30;       // visual: holding the phone slammed down
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                if (typeof game !== 'undefined' && game.shake) game.shake(6, 14);
                // 8-bullet flame chain, each delayed so it looks like the fire spreads
                for (let i = 0; i < 8; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height - 6,
                        vx: dir * 3,
                        vy: 0,
                        damage: this.damage * 0.9,
                        life: 100,
                        type: 'fire',
                        delay: i * 6,
                        groundHug: true
                    });
                }
                break;
            }
            case 4: {
                // Wild punch combo - five staggered close-range punches
                for (let i = 0; i < 5; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 18 + (i % 2) * 8,
                        vx: dir * (3.6 + i * 0.3),
                        vy: (i & 1) ? -0.4 : 0.4,
                        damage: this.damage * 0.5,
                        life: 35,
                        type: 'punch',
                        delay: i * 6
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxShoot();
                break;
            }
            case 5: {
                // Loafer kick - one big slow heavy hitbox
                this.bullets.push({
                    x: this.x + this.width / 2,
                    y: this.y + this.height - 10,
                    vx: dir * 4.5,
                    vy: 0,
                    damage: this.damage * 1.3,
                    life: 90,
                    type: 'kick',
                    large: true
                });
                if (typeof game !== 'undefined' && game.shake) game.shake(5, 12);
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                break;
            }
        }
    }

    spawnLandingShockwave() {
        // AOE on crash-jump landing
        if (typeof game !== 'undefined' && game.shake) game.shake(6, 12);
        if (typeof particles !== 'undefined') {
            particles.explosion(this.x + this.width / 2, this.y + this.height);
        }
        for (let i = -2; i <= 2; i++) {
            if (i === 0) continue;
            this.bullets.push({
                x: this.x + this.width / 2,
                y: this.y + this.height - 4,
                vx: Math.sign(i) * 3,
                vy: -1.5,
                gravity: 0.2,
                damage: this.damage * 0.6,
                life: 60,
                type: 'shockwave'
            });
        }
    }

    // ---------- CTRL-ALT-DEL (Stage 4 final boss) ----------
    // A giant control-panel terminal that has gone sentient. Three keycaps
    // (CTRL, ALT, DEL) light up to telegraph its attacks. Five patterns
    // total in phase 1, plus a sixth phase-2 BSOD finisher.
    updateCtrlAltDelBoss(level, player) {
        const phase2 = this.health / this.maxHealth <= 0.5;
        const cycleLen = phase2 ? 70 : 100;
        const step = this.behaviorTimer % cycleLen;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 6 : 5);

        const fireFrame = cycleLen - 1;
        if (step === fireFrame - 18) this.attackTelegraph = pattern;

        if (step !== fireFrame) return;
        this.attackTelegraph = -1;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const ang = Math.atan2(dy, dx);

        switch (pattern) {
            case 0: {
                // CTRL: spinning ring of bits (12 small projectiles)
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height / 2,
                        vx: Math.cos(a) * 2.4,
                        vy: Math.sin(a) * 2.4,
                        damage: this.damage * 0.5,
                        life: 100,
                        type: 'data'
                    });
                }
                break;
            }
            case 1: {
                // ALT: aimed homing-style 3-shot (light tracking, just heading-of-launch)
                for (let i = -1; i <= 1; i++) {
                    const a = ang + i * 0.22;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height / 2,
                        vx: Math.cos(a) * 4,
                        vy: Math.sin(a) * 4,
                        damage: this.damage,
                        life: 80,
                        type: 'data'
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxShoot();
                break;
            }
            case 2: {
                // DEL: deletion beam (a powerful horizontal sweep)
                const dir = dx > 0 ? 1 : -1;
                this.facingRight = dx > 0;
                for (let i = 0; i < 6; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 18 + i * 4,
                        vx: dir * 5,
                        vy: 0,
                        damage: this.damage,
                        life: 60,
                        type: 'scanner'
                    });
                }
                break;
            }
            case 3: {
                // Pop-up dialogs raining from above
                for (let i = 0; i < 4; i++) {
                    const px = this.x + (i + 1) * (this.width / 5);
                    this.bullets.push({
                        x: px, y: this.y - 4,
                        vx: (Math.random() - 0.5) * 1.5,
                        vy: -2,
                        gravity: 0.2,
                        damage: this.damage * 0.8,
                        life: 140,
                        type: 'paper'
                    });
                }
                break;
            }
            case 4: {
                // Cursor swarm: 8 paperclip-style projectiles spiraling out
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + (this.behaviorTimer * 0.01);
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height / 2,
                        vx: Math.cos(a) * 3,
                        vy: Math.sin(a) * 3 - 1,
                        gravity: 0.05,
                        damage: this.damage * 0.7,
                        life: 100,
                        type: 'paperclip'
                    });
                }
                break;
            }
            case 5: {
                // PHASE 2: BLUE SCREEN OF DEATH - massive 16-shot horizontal volley
                for (let i = 0; i < 16; i++) {
                    const a = -Math.PI / 2 - 0.6 + (i / 15) * 1.2;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height / 2,
                        vx: Math.cos(a) * 4.5,
                        vy: Math.sin(a) * 4.5,
                        gravity: 0.05,
                        damage: this.damage * 0.8,
                        life: 110,
                        type: 'data'
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                if (typeof game !== 'undefined' && game.shake) game.shake(5, 8);
                break;
            }
        }
    }

    // ---------- Mega-Shredder boss (Stage 3) ----------
    // A massive paper shredder with rotating teeth. Fires saw-blade projectiles
    // that curve through the air, plus confetti sprays and a paper geyser.
    updateShredderBoss(level, player) {
        const phase2 = this.health / this.maxHealth <= 0.5;
        const cycleLen = phase2 ? 65 : 95;
        const step = this.behaviorTimer % cycleLen;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 4 : 3);

        // Telegraph - the teeth spin faster
        const fireFrame = cycleLen - 1;
        if (step === fireFrame - 14) this.attackTelegraph = pattern;

        if (step !== fireFrame) return;
        this.attackTelegraph = -1;

        const dx = player.x - this.x;

        switch (pattern) {
            case 0: {
                // Confetti spray - many fast tiny shards in a fan
                for (let i = 0; i < 7; i++) {
                    const a = -Math.PI * 0.7 + (i / 6) * Math.PI * 0.4;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 2,
                        vx: Math.cos(a) * 4,
                        vy: Math.sin(a) * 4,
                        gravity: 0.1,
                        damage: this.damage * 0.4,
                        life: 70,
                        type: 'confetti'
                    });
                }
                break;
            }
            case 1: {
                // Saw-blade boomerang - curves through the air
                const dir = dx > 0 ? 1 : -1;
                this.facingRight = dx > 0;
                this.bullets.push({
                    x: this.x + this.width / 2,
                    y: this.y + this.height / 2,
                    vx: dir * 3.2,
                    vy: -1.5,
                    gravity: 0.06,
                    damage: this.damage,
                    life: 120,
                    type: 'blade',
                    spin: 0
                });
                if (typeof audio !== 'undefined') audio.sfxShoot();
                break;
            }
            case 2: {
                // Vertical paper geyser - 6 projectiles shooting straight up then falling
                for (let i = 0; i < 6; i++) {
                    this.bullets.push({
                        x: this.x + 6 + i * 6,
                        y: this.y,
                        vx: (i - 2.5) * 0.4,
                        vy: -7,
                        gravity: 0.2,
                        damage: this.damage * 0.7,
                        life: 140,
                        type: 'confetti'
                    });
                }
                break;
            }
            case 3: {
                // Phase 2 - triple blade volley
                const dir = dx > 0 ? 1 : -1;
                for (let i = 0; i < 3; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + 6 + i * 10,
                        vx: dir * (3 + i * 0.4),
                        vy: -1 + i * 0.6,
                        gravity: 0.08,
                        damage: this.damage * 0.9,
                        life: 110,
                        type: 'blade',
                        spin: i
                    });
                }
                if (typeof game !== 'undefined' && game.shake) game.shake(2, 4);
                break;
            }
        }
    }

    // ---------- Copier 3000 boss ----------
    // Theme: a photocopier that has had enough. Phase 1 cycles paper-jam,
    // scanner sweep, and toner cloud attacks; phase 2 adds chaos jam.
    updatePhotocopierBoss(level, player) {
        const phase2 = this.health / this.maxHealth <= 0.5;
        const cycleLen = phase2 ? 70 : 100;
        const step = this.behaviorTimer % cycleLen;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 4 : 3);

        // Telegraph: LED indicator and motion lines kick in 18 frames before firing
        const fireFrame = cycleLen - 1;
        if (step === fireFrame - 18) this.attackTelegraph = pattern;
        // For the scanner sweep, drive the scanner bar across during the telegraph
        if (pattern === 1 && step >= fireFrame - 18 && step <= fireFrame) {
            this.scannerProgress = (step - (fireFrame - 18)) / 18;
        } else if (pattern !== 1) {
            this.scannerProgress = 0;
        }

        if (step !== fireFrame) return;
        this.attackTelegraph = -1;

        const dx = player.x - this.x;
        const dy = player.y - this.y;

        switch (pattern) {
            case 0: {
                // Paper jam: three sheets eject upward then sail toward the player
                for (let i = -1; i <= 1; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2 + i * 8,
                        y: this.y - 4,
                        vx: i * 1.5 + (this.facingRight ? 0.8 : -0.8),
                        vy: -4,
                        gravity: 0.15,
                        damage: this.damage,
                        life: 140,
                        type: 'paper'
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxEnemyHit();
                break;
            }
            case 1: {
                // Scanner sweep: a wide low laser sweeps in the player's direction
                const dir = dx > 0 ? 1 : -1;
                this.facingRight = dx > 0;
                const fy = this.y + this.height / 2;
                for (let i = 0; i < 5; i++) {
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: fy,
                        vx: dir * (3 + i * 0.4),
                        vy: 0,
                        damage: this.damage,
                        life: 70,
                        type: 'scanner'
                    });
                }
                break;
            }
            case 2: {
                // Toner cloud: three slow-falling sticky clouds
                for (let i = 0; i < 3; i++) {
                    const a = -Math.PI / 2 + (i - 1) * 0.5;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y,
                        vx: Math.cos(a) * 2,
                        vy: Math.sin(a) * 3,
                        gravity: 0.12,
                        damage: this.damage * 0.6,
                        life: 100,
                        type: 'toner'
                    });
                }
                break;
            }
            case 3: {
                // Phase-2 chaos jam: 8 papers in a star burst
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    this.bullets.push({
                        x: this.x + this.width / 2,
                        y: this.y + this.height / 2,
                        vx: Math.cos(a) * 3,
                        vy: Math.sin(a) * 3,
                        damage: this.damage * 0.7,
                        life: 90,
                        type: 'paper'
                    });
                }
                if (typeof audio !== 'undefined') audio.sfxExplosion();
                if (typeof game !== 'undefined' && game.shake) game.shake(3, 6);
                break;
            }
        }
    }

    fireAtPlayer(player, projectileType = null) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        // Guard against zero-distance: enemy overlapping player would otherwise
        // produce NaN velocities that never expire (NaN bullets sail forever
        // without ever colliding with tiles).
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const speed = 3;
        const bullet = {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
            vx: (dx / dist) * speed,
            vy: (dy / dist) * speed,
            damage: this.damage,
            life: 120,
            type: projectileType || this.type.projectile,
            // Per-enemy tint - lets the renderer mark which enemy fired
            tint: this.getProjectileTint()
        };

        this.bullets.push(bullet);
    }

    // Each enemy type has a signature projectile tint - applied as a
    // subtle outer-ring color in the bullet renderers.
    getProjectileTint() {
        switch (this.behavior) {
            case 'hop':              return '#ff5050';   // stapler red
            case 'fly_sine':         return '#ffd460';   // folder yellow
            case 'bounce':           return '#a87040';   // ball brown
            case 'stationary':       return '#e0d098';   // tape cream
            case 'hover_sniper':     return '#ffff60';   // highlighter
            case 'charge':           return '#c0a0d0';   // swivel chair
            case 'miniboss':         return '#a8a8c0';   // file cabinet
            case 'photocopier_boss': return '#5aa8e0';   // copier
            case 'shredder_boss':    return '#fff8d0';   // shredder
            case 'ctrl_alt_del_boss':return '#80a8ff';   // ctrl-alt-del
            case 'ballmer_boss':     return '#ff5050';   // ballmer
            case 'bill_gates_boss':  return '#50ff70';   // bill gates
            case 'clippy2_boss':     return '#ff60ff';   // clippy 2.0 magenta
            case 'algorithm_boss':   return '#80c0ff';   // the algorithm cyan
            default:                 return '#ffffff';
        }
    }

    updateBullets(level) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            // Hold-back delay - bullet stays put and inert until the timer hits 0
            if (bullet.delay && bullet.delay > 0) {
                bullet.delay--;
                continue;
            }
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            if (bullet.gravity) bullet.vy += bullet.gravity;
            if (bullet.spin !== undefined) bullet.spin += 0.5;
            bullet.life--;

            // Ground-hugging projectiles (fire wave) stick to the floor
            if (bullet.groundHug && level.isSolid(bullet.x, bullet.y + 1)) {
                // Fine: still on ground
            } else if (bullet.groundHug) {
                // Apply gravity to settle
                bullet.vy += 0.3;
            }

            // Fire bullets emit smoke particles while travelling
            if (bullet.type === 'fire' && typeof particles !== 'undefined' && Math.random() < 0.6) {
                particles.spawn({
                    x: bullet.x, y: bullet.y - 2,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: -0.4 - Math.random() * 0.4,
                    life: 14,
                    size: 2,
                    colors: ['#ffe070', '#ff8030', '#a82020', '#3a0808']
                });
            }

            if (bullet.life <= 0 || level.isSolid(bullet.x, bullet.y)) {
                if (typeof particles !== 'undefined' && level.isSolid(bullet.x, bullet.y)) {
                    particles.bulletImpact(bullet.x, bullet.y, '#a82020');
                }
                this.bullets.splice(i, 1);
            }
        }
    }

    isBoss() {
        return this.behavior === 'miniboss' ||
               this.behavior === 'photocopier_boss' ||
               this.behavior === 'shredder_boss' ||
               this.behavior === 'ctrl_alt_del_boss' ||
               this.behavior === 'ballmer_boss' ||
               this.behavior === 'bill_gates_boss' ||
               this.behavior === 'clippy2_boss' ||
               this.behavior === 'algorithm_boss';
    }

    takeDamage(amount) {
        if (this.dying) return;
        this.health -= amount;
        this.hitFlash = 5;  // White flash for 5 frames
        if (typeof particles !== 'undefined') {
            particles.hitSpark(this.x + this.width / 2, this.y + this.height / 2, '#ffd040');
            // Damage floater - crit-styled (larger + more colors) on bosses
            particles.damageNumber(
                this.x + this.width / 2,
                this.y + this.height / 2 - 4,
                amount,
                this.isBoss() || amount >= 3
            );
        }
        if (typeof audio !== 'undefined') audio.sfxEnemyHit();
        if (this.health <= 0) {
            // Bosses get a multi-stage death sequence; everything else dies instantly.
            if (this.isBoss()) {
                this.beginDeathSequence();
            } else {
                this.die();
            }
        }
    }

    // ---- Boss death sequence ----
    // 90 frames of chained explosions over the boss sprite, freezing it and
    // suppressing further attacks. Final frame triggers the big payoff
    // explosion, score popup, 1UP drop, and screen shake.
    beginDeathSequence() {
        this.dying = true;
        this.deathSequenceTimer = 0;
        this.bullets = [];          // Stop firing
        this.hitFlash = 0;
        if (typeof audio !== 'undefined') audio.sfxExplosion();
        if (typeof game !== 'undefined' && game.shake) game.shake(6, 14);
    }

    updateDeathSequence() {
        if (!this.dying) return;
        this.deathSequenceTimer++;
        // Continuous small explosions across the boss while dying
        if (this.deathSequenceTimer % 5 === 0 && typeof particles !== 'undefined') {
            const ex = this.x + Math.random() * this.width;
            const ey = this.y + Math.random() * this.height;
            // Use the smaller explosion presets directly for variety
            particles.spawn({
                x: ex, y: ey, life: 8, size: 5, shape: 'flash',
                colors: ['#ffffff', '#ffeec0', '#ff8030', '#a82030']
            });
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
                const sp = 1 + Math.random() * 2;
                particles.spawn({
                    x: ex, y: ey,
                    vx: Math.cos(a) * sp,
                    vy: Math.sin(a) * sp,
                    gravity: 0.12,
                    life: 16 + Math.floor(Math.random() * 8),
                    size: 1,
                    colors: ['#ffffff', '#ffe070', '#ff8030', '#3a0a0a']
                });
            }
            // Audio chirps for every other burst
            if ((this.deathSequenceTimer / 5) % 2 === 0 && typeof audio !== 'undefined') {
                audio.sfxEnemyHit();
            }
        }
        // Small jolt of shake every 12 frames
        if (this.deathSequenceTimer % 12 === 0 && typeof game !== 'undefined' && game.shake) {
            game.shake(3, 4);
        }
        // Tilt/shudder offset for the visual
        this.deathShudderX = (Math.random() - 0.5) * 4;

        // Payoff at frame 90: full death
        if (this.deathSequenceTimer >= 90) {
            this.dying = false;
            this.die();
        }
    }

    die() {
        if (!this.active) return;
        this.active = false;
        if (typeof particles !== 'undefined') {
            particles.explosion(this.x + this.width / 2, this.y + this.height / 2);
            // Score popup is spawned below with the combo multiplier applied
        }
        if (typeof audio !== 'undefined') audio.sfxExplosion();
        if (typeof game !== 'undefined') {
            if (game.shake) {
                const isBoss = this.isBoss();
                game.shake(isBoss ? 8 : 3, isBoss ? 18 : 6);
            }
            // Award score with combo multiplier (1x .. up to ~5x at 20+ kills)
            if (this.score > 0) {
                const mult = 1 + Math.min(4, game.combo * 0.2);
                const earned = Math.floor(this.score * mult);
                game.score += earned;
                // Show the score popup with the multiplied amount
                if (typeof particles !== 'undefined') {
                    particles.scorePopup(this.x + this.width / 2, this.y, earned);
                }
                game.combo++;
                game.comboTimer = game.COMBO_WINDOW;
                if (game.combo > game.comboBest) game.comboBest = game.combo;
            }
            if (game.runEnemiesDefeated !== undefined) game.runEnemiesDefeated++;
        }
        if (typeof achievements !== 'undefined') achievements.onEnemyKilled();
        // Random 1UP drop - bosses always drop, otherwise small chance
        const dropChance = this.isBoss() ? 1.0 : 0.04;
        if (Math.random() < dropChance && typeof pickupManager !== 'undefined' && pickupManager.spawnDrop) {
            pickupManager.spawnDrop(this.x + this.width / 2, this.y + this.height / 2, '1UP');
        }
    }

    draw(ctx, camera) {
        if (!this.active) return;

        const shudderX = this.dying ? (this.deathShudderX || 0) : 0;
        const screenX = Math.floor(this.x - camera.x + shudderX);
        const screenY = Math.floor(this.y - camera.y);

        // Hit flash: invert palette briefly when damaged. Bosses also flash
        // bright white repeatedly during the death sequence.
        const flash = this.hitFlash > 0 ||
                      (this.dying && ((this.deathSequenceTimer / 4) | 0) % 2 === 0);

        ctx.save();
        // Flip horizontally if facing left
        if (!this.facingRight) {
            ctx.translate(screenX + this.width, screenY);
            ctx.scale(-1, 1);
            ctx.translate(-screenX, -screenY);
        }

        switch (this.behavior) {
            case 'hop':              this.drawStaplerSNES(ctx, screenX, screenY, flash); break;
            case 'fly_sine':         this.drawFolderSNES(ctx, screenX, screenY, flash); break;
            case 'bounce':           this.drawRubberBallSNES(ctx, screenX, screenY, flash); break;
            case 'stationary':       this.drawTapeDispenserSNES(ctx, screenX, screenY, flash); break;
            case 'miniboss':         this.drawFileCabinetSNES(ctx, screenX, screenY, flash); break;
            case 'photocopier_boss': this.drawCopierSNES(ctx, screenX, screenY, flash); break;
            case 'charge':           this.drawSwivelChairSNES(ctx, screenX, screenY, flash); break;
            case 'hover_sniper':     this.drawHighlighterSNES(ctx, screenX, screenY, flash); break;
            case 'shredder_boss':    this.drawShredderSNES(ctx, screenX, screenY, flash); break;
            case 'ctrl_alt_del_boss': this.drawCtrlAltDelSNES(ctx, screenX, screenY, flash); break;
            case 'ballmer_boss':     this.drawBallmerSNES(ctx, screenX, screenY, flash); break;
            case 'bill_gates_boss':  this.drawBillGatesSNES(ctx, screenX, screenY, flash); break;
            case 'clippy2_boss':     this.drawClippy2SNES(ctx, screenX, screenY, flash); break;
            case 'algorithm_boss':   this.drawAlgorithmSNES(ctx, screenX, screenY, flash); break;
            default:                 this.drawStaplerSNES(ctx, screenX, screenY, flash);
        }
        ctx.restore();

        // Enemy bullets - distinct visuals per projectile type
        const tint = this.getProjectileTint();
        this.bullets.forEach(bullet => {
            if (bullet.delay && bullet.delay > 0) return;       // not yet active
            const bx = Math.floor(bullet.x - camera.x);
            const by = Math.floor(bullet.y - camera.y);
            const col = this.getBulletColor(bullet.type);
            // Per-enemy tint rim. Skip for projectiles whose color already
            // is the tint, and for large special projectiles that paint
            // their own outline.
            if (bullet.type !== 'blade' && bullet.type !== 'bsod' &&
                bullet.type !== 'lawsuit' && bullet.type !== 'cmd' &&
                bullet.type !== 'update' && bullet.type !== 'beam') {
                ctx.fillStyle = tint;
                ctx.fillRect(bx - 3, by - 3, 6, 1);
                ctx.fillRect(bx - 3, by + 2, 6, 1);
                ctx.fillRect(bx - 3, by - 2, 1, 4);
                ctx.fillRect(bx + 2, by - 2, 1, 4);
            }

            if (bullet.type === 'dollar') {
                // Falling dollar bill - green rectangle with $ symbol
                ctx.fillStyle = '#208a30';
                ctx.fillRect(bx - 5, by - 3, 10, 6);
                ctx.fillStyle = '#50ff70';
                ctx.fillRect(bx - 5, by - 3, 10, 1);
                ctx.fillStyle = '#1a4a18';
                ctx.fillRect(bx - 5, by + 2, 10, 1);
                // $ sign
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(bx - 1, by - 2, 2, 1);
                ctx.fillRect(bx - 2, by - 1, 1, 1);
                ctx.fillRect(bx - 1, by,     2, 1);
                ctx.fillRect(bx,     by + 1, 1, 1);
                ctx.fillRect(bx - 1, by + 2, 2, 1);
                // Crisp center bar
                ctx.fillRect(bx, by - 3, 1, 6);
                return;
            }
            if (bullet.type === 'bsod') {
                // Blue Screen of Death - 12x10 rect with white text
                ctx.fillStyle = '#0040a0';
                ctx.fillRect(bx - 6, by - 5, 12, 10);
                ctx.fillStyle = '#80a8ff';
                ctx.fillRect(bx - 6, by - 5, 12, 1);
                ctx.fillStyle = '#001830';
                ctx.fillRect(bx - 6, by + 4, 12, 1);
                // Tiny white text bands (gibberish)
                ctx.fillStyle = '#fff';
                ctx.fillRect(bx - 4, by - 3, 8, 1);
                ctx.fillRect(bx - 4, by - 1, 6, 1);
                ctx.fillRect(bx - 4, by + 1, 7, 1);
                // :( smiley
                ctx.fillRect(bx - 4, by - 2, 1, 1);
                return;
            }
            if (bullet.type === 'lawsuit') {
                // Court paper - cream sheet with seal
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(bx - 4, by - 5, 8, 10);
                ctx.fillStyle = '#a87040';
                ctx.fillRect(bx - 4, by - 5, 8, 1);
                ctx.fillRect(bx - 4, by + 4, 8, 1);
                ctx.fillStyle = '#a82020';
                ctx.fillRect(bx + 2, by + 1, 2, 2);    // red wax seal
                ctx.fillStyle = '#806848';
                ctx.fillRect(bx - 3, by - 3, 6, 1);
                ctx.fillRect(bx - 3, by - 1, 5, 1);
                ctx.fillRect(bx - 3, by + 1, 4, 1);
                return;
            }
            if (bullet.type === 'cmd') {
                // CMD text bullet - green-on-black text-line
                ctx.fillStyle = '#0a0612';
                ctx.fillRect(bx - 8, by - 3, 16, 6);
                ctx.fillStyle = '#50ff70';
                ctx.fillRect(bx - 7, by - 2, 4, 1);    // C:\
                ctx.fillRect(bx - 7, by,     1, 1);    // letter
                ctx.fillRect(bx - 5, by,     2, 1);
                ctx.fillRect(bx - 2, by,     3, 1);
                ctx.fillRect(bx + 2, by,     1, 1);
                ctx.fillRect(bx + 4, by,     3, 1);
                // Blinking cursor at the end
                if ((bullet.life & 8) < 4) ctx.fillRect(bx + 7, by - 2, 1, 4);
                return;
            }
            if (bullet.type === 'update') {
                // Windows-update progress bar coming down
                ctx.fillStyle = '#80a8ff';
                ctx.fillRect(bx - 8, by - 2, 16, 5);
                ctx.fillStyle = '#0040a0';
                ctx.fillRect(bx - 7, by - 1, 14, 3);
                // Bar fill animates
                const fill = ((bullet.life * 2) % 14);
                ctx.fillStyle = '#50ff70';
                ctx.fillRect(bx - 7, by - 1, fill, 3);
                ctx.fillStyle = '#fff';
                ctx.fillRect(bx - 8, by - 2, 16, 1);
                return;
            }
            if (bullet.type === 'shockwave') {
                // Cup-shaped sound wave moving forward
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(bx - 1, by - 4, 2, 9);
                ctx.fillRect(bx - 3, by - 3, 1, 7);
                ctx.fillRect(bx - 5, by - 2, 1, 5);
                ctx.fillRect(bx + 2, by - 3, 1, 7);
                ctx.fillRect(bx + 4, by - 2, 1, 5);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(bx, by, 1, 1);
                return;
            }
            if (bullet.type === 'coffee') {
                // Coffee mug spinning through the air with brown coffee splash trail
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(bx - 4, by - 4, 7, 7);
                ctx.fillStyle = '#604030';
                ctx.fillRect(bx - 3, by - 3, 5, 3);
                // Handle
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(bx + 3, by - 2, 2, 3);
                // Steam wisp
                ctx.fillStyle = '#a8d8ff';
                ctx.fillRect(bx - 2, by - 6, 1, 1);
                ctx.fillRect(bx, by - 7, 1, 1);
                ctx.fillRect(bx + 1, by - 6, 1, 1);
                // Coffee drop trail
                ctx.fillStyle = '#3a2418';
                ctx.fillRect(bx - 5, by + 2, 1, 1);
                return;
            }
            if (bullet.type === 'fire') {
                // Big flickering ground flame
                const flick = (bullet.life & 3);
                const h = 8 + flick;
                ctx.fillStyle = '#a82020';
                ctx.fillRect(bx - 3, by - h + 4, 7, h);
                ctx.fillStyle = '#ff5050';
                ctx.fillRect(bx - 2, by - h + 5, 5, h - 1);
                ctx.fillStyle = '#ff8030';
                ctx.fillRect(bx - 1, by - h + 6, 3, h - 2);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(bx, by - h + 7, 1, h - 4);
                // Embers above
                if ((bullet.life & 1) === 0) {
                    ctx.fillStyle = '#fff5c0';
                    ctx.fillRect(bx + 1, by - h + 2, 1, 1);
                }
                return;
            }
            if (bullet.type === 'punch') {
                // Cartoon impact - big flash
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(bx - 4, by, 8, 1);
                ctx.fillRect(bx, by - 4, 1, 8);
                ctx.fillStyle = '#ff8030';
                ctx.fillRect(bx - 3, by - 1, 6, 3);
                ctx.fillRect(bx - 1, by - 3, 3, 6);
                ctx.fillStyle = '#fff';
                ctx.fillRect(bx, by, 1, 1);
                return;
            }
            if (bullet.type === 'kick') {
                // Big sliding loafer hitbox
                ctx.fillStyle = '#1a0e08';
                ctx.fillRect(bx - 8, by - 4, 16, 8);
                ctx.fillStyle = '#3a1f10';
                ctx.fillRect(bx - 8, by - 4, 16, 1);
                ctx.fillStyle = '#604030';
                ctx.fillRect(bx - 7, by - 3, 14, 1);
                // Shine
                ctx.fillStyle = '#a87040';
                ctx.fillRect(bx - 6, by - 4, 4, 1);
                // Wind streaks behind
                const tx = Math.sign(bullet.vx) * -1;
                ctx.fillStyle = '#fff';
                ctx.fillRect(bx + tx * 10, by - 2, 4, 1);
                ctx.fillRect(bx + tx * 12, by, 5, 1);
                ctx.fillRect(bx + tx * 10, by + 2, 4, 1);
                return;
            }
            if (bullet.type === 'blade') {
                // Rotating saw blade
                const s = bullet.spin || 0;
                const t = Math.floor(s) & 3;
                ctx.fillStyle = '#1a1a22';
                ctx.fillRect(bx - 4, by - 4, 8, 8);
                ctx.fillStyle = '#c0c8d0';
                // Sawtooth pattern shifts each frame
                if (t === 0)      { ctx.fillRect(bx - 5, by - 1, 10, 2); ctx.fillRect(bx - 1, by - 5, 2, 10); }
                else if (t === 1) { ctx.fillRect(bx - 4, by - 4, 8, 1); ctx.fillRect(bx - 4, by + 3, 8, 1); ctx.fillRect(bx - 4, by - 4, 1, 8); ctx.fillRect(bx + 3, by - 4, 1, 8); }
                else if (t === 2) { ctx.fillRect(bx - 5, by - 1, 10, 2); ctx.fillRect(bx - 1, by - 5, 2, 10); }
                else              { ctx.fillRect(bx - 4, by - 4, 8, 1); ctx.fillRect(bx - 4, by + 3, 8, 1); ctx.fillRect(bx - 4, by - 4, 1, 8); ctx.fillRect(bx + 3, by - 4, 1, 8); }
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(bx - 1, by - 1, 2, 2);
                return;
            }
            if (bullet.type === 'confetti') {
                // Tiny shred of paper, color varies per bullet
                const seed = (bullet.life & 7);
                ctx.fillStyle = seed < 3 ? '#fff8d0' : (seed < 5 ? '#ffd070' : '#ff8030');
                ctx.fillRect(bx - 1, by - 1, 2, 2);
                ctx.fillStyle = '#a87040';
                ctx.fillRect(bx, by, 1, 1);
                return;
            }
            if (bullet.type === 'beam') {
                // Vertical highlighter beam - tall yellow streak
                ctx.fillStyle = 'rgba(255,255,64,0.35)';
                ctx.fillRect(bx - 2, by - 8, 4, 14);
                ctx.fillStyle = col;
                ctx.fillRect(bx - 1, by - 8, 2, 14);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(bx, by - 8, 1, 12);
                return;
            }
            if (bullet.type === 'toner') {
                // Dark cloud, soft edge
                ctx.fillStyle = col;
                ctx.fillRect(bx - 2, by - 2, 5, 5);
                ctx.fillStyle = '#5a4060';
                ctx.fillRect(bx - 1, by - 1, 3, 3);
                return;
            }
            if (bullet.type === 'paper') {
                // White paper sheet
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(bx - 3, by - 2, 6, 4);
                ctx.fillStyle = '#a87040';
                ctx.fillRect(bx - 3, by - 2, 6, 1);
                ctx.fillRect(bx - 3, by + 1, 6, 1);
                return;
            }
            // Default: trail + warm core
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(bx - 4, by - 1, 4, 2);
            ctx.globalAlpha = 1;
            ctx.fillRect(bx - 2, by - 1, 4, 2);
            ctx.fillStyle = '#ffe0a0';
            ctx.fillRect(bx - 1, by, 2, 1);
        });

        // Boss health bar - SNES style with frame
        if (this.isBoss()) {
            const bx = screenX, by = screenY - 10;
            ctx.fillStyle = '#000';
            ctx.fillRect(bx - 1, by - 1, this.width + 2, 6);
            ctx.fillStyle = '#3a0a0a';
            ctx.fillRect(bx, by, this.width, 4);
            const hp = this.health / this.maxHealth;
            ctx.fillStyle = hp > 0.5 ? '#ff5050' : '#ffa030';
            ctx.fillRect(bx, by, this.width * hp, 2);
            ctx.fillStyle = hp > 0.5 ? '#ff9090' : '#ffd070';
            ctx.fillRect(bx, by, this.width * hp, 1);
        }
    }

    // ---------- SNES-style enemy renderers ----------

    drawStaplerSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        // Hop squash/stretch
        const sq = this.vy < -1 ? -2 : (this.vy > 1 ? 1 : 0);
        const top = y + sq, midY = y + 6 + sq;
        const C = flash ? {
            outline:'#fff', deep:'#fff', red:'#fff', rmid:'#fff', rlit:'#fff',
            steel:'#fff', steellt:'#fff', eye:'#000', glint:'#000'
        } : {
            outline:'#1a0000', deep:'#3a0808', red:'#c8202a', rmid:'#e83838', rlit:'#ff5856',
            steel:'#404048', steellt:'#909098', eye:'#fff5c0', glint:'#ffa0a0'
        };
        // Lower jaw (the stapler base)
        ctx.fillStyle = C.steel;
        ctx.fillRect(x + 1, y + H - 4, W - 2, 3);
        ctx.fillStyle = C.steellt;
        ctx.fillRect(x + 1, y + H - 4, W - 2, 1);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x, y + H - 4, 1, 4);
        ctx.fillRect(x + W - 1, y + H - 4, 1, 4);
        ctx.fillRect(x, y + H - 1, W, 1);
        // Upper red body (the stapler head)
        ctx.fillStyle = C.red;
        ctx.fillRect(x + 1, top + 1, W - 2, H - 6);
        ctx.fillStyle = C.rlit;  // top highlight
        ctx.fillRect(x + 2, top + 1, W - 4, 2);
        ctx.fillStyle = C.rmid;
        ctx.fillRect(x + 1, top + 3, W - 2, 1);
        ctx.fillStyle = C.deep;  // bottom shadow
        ctx.fillRect(x + 1, midY + 4, W - 2, 1);
        // Front lip of head
        ctx.fillStyle = C.deep;
        ctx.fillRect(x + W - 3, top + 1, 2, H - 6);
        ctx.fillStyle = C.rmid;
        ctx.fillRect(x + W - 4, top + 1, 1, H - 6);
        // Outline
        ctx.fillStyle = C.outline;
        ctx.fillRect(x, top, W, 1);
        ctx.fillRect(x, top, 1, H - 4 - sq);
        ctx.fillRect(x + W - 1, top, 1, H - 4 - sq);
        // Angry eyes (face is on the side facing forward)
        const eyeY = top + 3;
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + W - 9, eyeY - 1, 3, 4);
        ctx.fillRect(x + W - 5, eyeY - 1, 3, 4);
        ctx.fillStyle = C.eye;
        ctx.fillRect(x + W - 8, eyeY, 1, 2);
        ctx.fillRect(x + W - 4, eyeY, 1, 2);
        ctx.fillStyle = C.glint;
        ctx.fillRect(x + W - 8, eyeY, 1, 1);
        ctx.fillRect(x + W - 4, eyeY, 1, 1);
        // Angry brow
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + W - 10, eyeY - 2, 4, 1);
        ctx.fillRect(x + W - 5, eyeY - 2, 4, 1);
        ctx.fillRect(x + W - 9, eyeY - 1, 1, 1);
        ctx.fillRect(x + W - 4, eyeY - 1, 1, 1);
        // Mouth - a snarling staple slot
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + W - 8, y + H - 6, 5, 1);
    }

    drawFolderSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        // Wings flap based on animation time
        const flap = ((this.behaviorTimer / 6) | 0) % 2;
        const C = flash ? {
            outline:'#fff', tab:'#fff', folder:'#fff', flit:'#fff', fdark:'#fff',
            wing:'#fff', wlit:'#fff', eye:'#000', tooth:'#000', mouth:'#000'
        } : {
            outline:'#3a2410', tab:'#a87040', folder:'#e8c089', flit:'#ffd8a0',
            fdark:'#a8783a', wing:'#f0e0a0', wlit:'#fff8c0',
            eye:'#c80020', tooth:'#fff5c0', mouth:'#1a0000'
        };
        // Wings - flap up/down
        const wingOff = flap ? -3 : -1;
        ctx.fillStyle = C.wing;
        ctx.fillRect(x - 3, y + wingOff, 5, 4);
        ctx.fillRect(x + W - 2, y + wingOff, 5, 4);
        ctx.fillStyle = C.wlit;
        ctx.fillRect(x - 3, y + wingOff, 5, 1);
        ctx.fillRect(x + W - 2, y + wingOff, 5, 1);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x - 3, y + wingOff + 4, 5, 1);
        ctx.fillRect(x + W - 2, y + wingOff + 4, 5, 1);
        // Folder body
        ctx.fillStyle = C.folder;
        ctx.fillRect(x, y + 1, W, H - 1);
        // Tab on top-left
        ctx.fillStyle = C.tab;
        ctx.fillRect(x + 1, y, 7, 2);
        // Top highlight stripe
        ctx.fillStyle = C.flit;
        ctx.fillRect(x, y + 1, W, 1);
        // Bottom shadow
        ctx.fillStyle = C.fdark;
        ctx.fillRect(x, y + H - 2, W, 1);
        // Outline
        ctx.fillStyle = C.outline;
        ctx.fillRect(x, y + 1, W, 1);  // top of body (after highlight)
        // actually do proper border
        ctx.fillRect(x, y, 1, H);
        ctx.fillRect(x + W - 1, y + 1, 1, H - 1);
        ctx.fillRect(x, y + H - 1, W, 1);
        ctx.fillRect(x + 1, y, 7, 1);
        ctx.fillRect(x + 8, y, 1, 2);
        // Evil face
        const eyeY = y + 4;
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 5, eyeY, 4, 3);
        ctx.fillRect(x + W - 9, eyeY, 4, 3);
        ctx.fillStyle = C.eye;
        ctx.fillRect(x + 6, eyeY + 1, 2, 1);
        ctx.fillRect(x + W - 8, eyeY + 1, 2, 1);
        ctx.fillStyle = '#ffa0a0';
        ctx.fillRect(x + 6, eyeY + 1, 1, 1);
        ctx.fillRect(x + W - 8, eyeY + 1, 1, 1);
        // Jagged tooth mouth
        ctx.fillStyle = C.mouth;
        ctx.fillRect(x + 7, y + H - 4, W - 14, 2);
        ctx.fillStyle = C.tooth;
        ctx.fillRect(x + 8, y + H - 4, 1, 1);
        ctx.fillRect(x + 10, y + H - 4, 1, 1);
        ctx.fillRect(x + 12, y + H - 4, 1, 1);
        ctx.fillRect(x + W - 9, y + H - 4, 1, 1);
        ctx.fillRect(x + W - 11, y + H - 4, 1, 1);
    }

    drawRubberBallSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const cx = x + W / 2, cy = y + H / 2, r = W / 2;
        const C = flash ? ['#fff','#fff','#fff','#fff','#fff'] :
            ['#1a1008','#3a2814','#5e3e1c','#8a5a28','#bc8838'];
        // Fill ball as pixel circle layers
        const fillCircle = (cr, color) => {
            ctx.fillStyle = color;
            const ir = Math.floor(cr);
            for (let dy = -ir; dy <= ir; dy++) {
                for (let dx = -ir; dx <= ir; dx++) {
                    if (dx * dx + dy * dy <= cr * cr) {
                        ctx.fillRect(Math.floor(cx + dx), Math.floor(cy + dy), 1, 1);
                    }
                }
            }
        };
        fillCircle(r,     C[0]);   // outline
        fillCircle(r - 1, C[2]);   // mid
        fillCircle(r - 3, C[3]);   // light
        // Rubber band stripes (deterministic - spin slowly)
        ctx.fillStyle = C[1];
        const spin = (this.behaviorTimer * 0.05) % (Math.PI * 2);
        for (let i = 0; i < 7; i++) {
            const a = spin + i * (Math.PI / 7);
            for (let t = -r + 1; t <= r - 1; t++) {
                const sx = Math.floor(cx + Math.cos(a) * t);
                const sy = Math.floor(cy + Math.sin(a) * t);
                if ((sx - cx) ** 2 + (sy - cy) ** 2 <= (r - 1) ** 2) {
                    ctx.fillRect(sx, sy, 1, 1);
                }
            }
        }
        // Specular highlight
        ctx.fillStyle = C[4];
        ctx.fillRect(Math.floor(cx - r * 0.5), Math.floor(cy - r * 0.5), 2, 2);
        ctx.fillRect(Math.floor(cx - r * 0.5) + 2, Math.floor(cy - r * 0.5) - 1, 1, 1);
        // Tiny angry eyes
        if (!flash) {
            ctx.fillStyle = '#ff2020';
            ctx.fillRect(Math.floor(cx - 3), Math.floor(cy - 1), 2, 2);
            ctx.fillRect(Math.floor(cx + 1), Math.floor(cy - 1), 2, 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(Math.floor(cx - 3), Math.floor(cy - 1), 1, 1);
            ctx.fillRect(Math.floor(cx + 1), Math.floor(cy - 1), 1, 1);
        }
    }

    drawTapeDispenserSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const C = flash ? {
            outline:'#fff', base:'#fff', baselit:'#fff', basedark:'#fff',
            tape:'#fff', tapelit:'#fff', tapedark:'#fff', spool:'#fff', eye:'#000'
        } : {
            outline:'#0a0a0a', base:'#3a3a48', baselit:'#7a7a90', basedark:'#1a1a22',
            tape:'#d0c89a', tapelit:'#f0e8c0', tapedark:'#8a8068',
            spool:'#604838', eye:'#ff3030'
        };
        // Heavy black base
        ctx.fillStyle = C.base;
        ctx.fillRect(x, y + H - 8, W, 8);
        ctx.fillStyle = C.baselit;
        ctx.fillRect(x, y + H - 8, W, 1);
        ctx.fillStyle = C.basedark;
        ctx.fillRect(x, y + H - 1, W, 1);
        // Curving hood that holds the spool
        ctx.fillStyle = C.base;
        ctx.fillRect(x + 2, y + 2, W - 4, H - 8);
        ctx.fillRect(x + 1, y + 4, 1, H - 10);
        ctx.fillRect(x + W - 2, y + 4, 1, H - 10);
        ctx.fillStyle = C.baselit;
        ctx.fillRect(x + 2, y + 2, W - 4, 1);
        // Tape spool (donut)
        const sx = x + W - 9, sy = y + 5;
        ctx.fillStyle = C.tape;
        ctx.fillRect(sx, sy, 8, 8);
        ctx.fillStyle = C.tapedark;
        ctx.fillRect(sx, sy + 6, 8, 2);
        ctx.fillStyle = C.tapelit;
        ctx.fillRect(sx, sy, 8, 2);
        ctx.fillStyle = C.spool;
        ctx.fillRect(sx + 2, sy + 2, 4, 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(sx + 3, sy + 3, 2, 2);
        // Outline around spool
        ctx.fillStyle = C.outline;
        ctx.fillRect(sx, sy - 1, 8, 1);
        ctx.fillRect(sx, sy + 8, 8, 1);
        // Cutting teeth at front
        ctx.fillStyle = C.outline;
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 3 + i * 2, y + H - 10, 1, 2);
        // Glowing eyes
        ctx.fillStyle = C.eye;
        ctx.fillRect(x + 3, y + 5, 3, 3);
        ctx.fillRect(x + 8, y + 5, 3, 3);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(x + 4, y + 6, 1, 1);
        ctx.fillRect(x + 9, y + 6, 1, 1);
        // Outline
        ctx.fillStyle = C.outline;
        ctx.fillRect(x, y + 2, 1, H - 2);
        ctx.fillRect(x + W - 1, y + 2, 1, H - 2);
        ctx.fillRect(x + 2, y + 1, W - 4, 1);
    }

    drawFileCabinetSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        // Telegraph: rattle horizontally just before firing
        const tele = this.attackTelegraph !== undefined && this.attackTelegraph >= 0;
        if (tele) {
            x += (Math.floor(this.behaviorTimer / 2) % 2) * 2 - 1;
        }
        // Pick which drawer "opens" based on pattern being telegraphed
        const phase2 = this.health / this.maxHealth <= 0.5;
        const cycleLen = phase2 ? 60 : 90;
        const pattern = Math.floor(this.behaviorTimer / cycleLen) % (phase2 ? 4 : 3);
        const open = tele;
        const openDrawer = pattern % 3;     // 0=top, 1=middle, 2=bottom
        const C = flash ? {
            outline:'#fff', body:'#fff', bodylit:'#fff', bodydark:'#fff',
            drawer:'#fff', drawerlit:'#fff', handle:'#fff', shadow:'#000',
            eye:'#000', red:'#000'
        } : {
            outline:'#0a0a14', body:'#6a6a78', bodylit:'#aaaab0', bodydark:'#3a3a48',
            drawer:'#5a5a68', drawerlit:'#8a8a98', handle:'#dadae0', shadow:'#1a1a22',
            eye:'#ff3838', red:'#a82020'
        };
        // Body
        ctx.fillStyle = C.body;
        ctx.fillRect(x + 1, y + 1, W - 2, H - 2);
        // Top-left highlight
        ctx.fillStyle = C.bodylit;
        ctx.fillRect(x + 1, y + 1, W - 2, 2);
        ctx.fillRect(x + 1, y + 1, 1, H - 2);
        // Bottom-right shadow
        ctx.fillStyle = C.bodydark;
        ctx.fillRect(x + 1, y + H - 3, W - 2, 2);
        ctx.fillRect(x + W - 2, y + 1, 1, H - 2);
        // Three drawers
        const drawerH = Math.floor((H - 4) / 3);
        for (let i = 0; i < 3; i++) {
            const dy = y + 2 + i * drawerH;
            const dOpen = i === openDrawer && open;
            ctx.fillStyle = C.drawer;
            ctx.fillRect(x + 3, dy + 1, W - 6, drawerH - 2);
            ctx.fillStyle = C.drawerlit;
            ctx.fillRect(x + 3, dy + 1, W - 6, 1);
            ctx.fillStyle = C.shadow;
            ctx.fillRect(x + 3, dy + drawerH - 2, W - 6, 1);
            // Drawer outlines
            ctx.fillStyle = C.outline;
            ctx.fillRect(x + 3, dy, W - 6, 1);
            ctx.fillRect(x + 3, dy + drawerH - 1, W - 6, 1);
            // Handle
            const hx = x + W / 2 - 4;
            ctx.fillStyle = C.outline;
            ctx.fillRect(hx, dy + drawerH / 2 - 1, 8, 3);
            ctx.fillStyle = C.handle;
            ctx.fillRect(hx + 1, dy + drawerH / 2 - 1, 6, 1);
            // Top drawer when "open" gets a red glow inside
            if (dOpen) {
                ctx.fillStyle = C.red;
                ctx.fillRect(x + 4, dy + 2, W - 8, drawerH - 5);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(x + W / 2 - 2, dy + drawerH / 2, 4, 1);
            }
        }
        // Evil face on top drawer (only when closed)
        if (!open) {
            ctx.fillStyle = C.outline;
            ctx.fillRect(x + 6, y + 6, 5, 4);
            ctx.fillRect(x + W - 11, y + 6, 5, 4);
            ctx.fillStyle = C.eye;
            ctx.fillRect(x + 7, y + 7, 3, 2);
            ctx.fillRect(x + W - 10, y + 7, 3, 2);
            ctx.fillStyle = '#ffe0a0';
            ctx.fillRect(x + 7, y + 7, 1, 1);
            ctx.fillRect(x + W - 10, y + 7, 1, 1);
        }
        // Outer outline
        ctx.fillStyle = C.outline;
        ctx.fillRect(x, y, W, 1);
        ctx.fillRect(x, y + H - 1, W, 1);
        ctx.fillRect(x, y, 1, H);
        ctx.fillRect(x + W - 1, y, 1, H);

        // Phase 2 rage rim - red pulsing border around the cabinet
        if (phase2 && !flash) {
            const pulse = Math.sin(this.behaviorTimer * 0.2) > 0;
            ctx.fillStyle = pulse ? '#ff3030' : '#a82020';
            ctx.fillRect(x - 1, y - 1, W + 2, 1);
            ctx.fillRect(x - 1, y + H, W + 2, 1);
            ctx.fillRect(x - 1, y, 1, H);
            ctx.fillRect(x + W, y, 1, H);
        }
    }

    getBulletColor(type) {
        switch (type) {
            case 'staple': return '#888';
            case 'paperclip': return '#ccc';
            case 'tape': return '#ffc';
            case 'drawer': return '#654';
            case 'paper': return '#fff8d0';
            case 'scanner': return '#80ffe0';
            case 'toner': return '#3a2030';
            case 'beam': return '#ffff40';
            case 'blade': return '#c0c8d0';
            case 'confetti': return '#fff8d0';
            case 'data': return '#5aa8e0';
            case 'shockwave': return '#fff8d0';
            case 'coffee': return '#604030';
            case 'fire': return '#ff8030';
            case 'punch': return '#e8a878';
            case 'kick': return '#a87040';
            case 'dollar': return '#50a050';
            case 'bsod': return '#0040a0';
            case 'lawsuit': return '#fff8d0';
            case 'cmd': return '#50ff70';
            case 'update': return '#5aa8e0';
            case 'corporate': return '#c8c8d8';
            default: return '#f00';
        }
    }

    // THE ALGORITHM - giant floating eye in the clouds. Stage 8 boss.
    drawAlgorithmSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const tele = this.attackTelegraph !== undefined && this.attackTelegraph >= 0;
        if (tele) x += (Math.floor(this.behaviorTimer / 2) % 2);
        const phase2 = this.health / this.maxHealth <= 0.5;

        const cx = x + W / 2, cy = y + H / 2;
        const C = flash ? {
            outline:'#fff', ring:'#fff', iris:'#000', pupil:'#000',
            glow:'#000', spark:'#000'
        } : {
            outline:'#0a205a',
            ring:'#3a78b8',
            ringlit:'#a8d8ff',
            iris: phase2 ? '#ff3030' : '#80c0ff',
            pupil:'#0a0612',
            glow:'#a8d8ff',
            spark:'#ffffff'
        };

        // Outer aura - pulsing ring of soft glow
        const pulse = Math.sin(this.behaviorTimer * 0.1) * 2 + 4;
        ctx.fillStyle = 'rgba(168,216,255,0.18)';
        for (let i = 0; i < 4; i++) {
            const r = (W / 2 + 4 + pulse) + i * 3;
            this._fillRing(ctx, cx, cy, r, 1);
        }

        // Ring body (the "frame" of the eye)
        ctx.fillStyle = C.outline;
        this._fillRing(ctx, cx, cy, W / 2 + 1, 3);
        ctx.fillStyle = C.ring;
        this._fillRing(ctx, cx, cy, W / 2 - 2, 4);
        ctx.fillStyle = C.ringlit;
        this._fillRing(ctx, cx, cy, W / 2 - 2, 1);

        // Sclera (white of eye)
        ctx.fillStyle = '#f0f8ff';
        this._fillDisc(ctx, cx, cy, W / 2 - 6);
        ctx.fillStyle = '#c0d8e8';
        this._fillDisc(ctx, cx, cy, W / 2 - 8);

        // Iris (tracks player direction approximately)
        const playerOff = this.facingRight ? 2 : -2;
        ctx.fillStyle = C.iris;
        this._fillDisc(ctx, cx + playerOff, cy, 7);
        ctx.fillStyle = '#1a508a';
        this._fillDisc(ctx, cx + playerOff, cy, 5);
        ctx.fillStyle = C.pupil;
        this._fillDisc(ctx, cx + playerOff, cy, 3);

        // Eye highlight
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx + playerOff - 2, cy - 2, 2, 2);

        // Orbital data fragments - rotating glyphs around the eye
        const orbits = 6;
        for (let i = 0; i < orbits; i++) {
            const a = (this.behaviorTimer * 0.04) + (i / orbits) * Math.PI * 2;
            const r = W / 2 + 8;
            const ox = Math.floor(cx + Math.cos(a) * r);
            const oy = Math.floor(cy + Math.sin(a) * r);
            ctx.fillStyle = C.spark;
            ctx.fillRect(ox, oy, 2, 2);
            ctx.fillStyle = C.glow;
            ctx.fillRect(ox - 1, oy, 1, 1);
            ctx.fillRect(ox + 2, oy, 1, 1);
        }

        // Telegraph flash on the iris
        if (tele) {
            ctx.fillStyle = '#fff';
            this._fillRing(ctx, cx + playerOff, cy, 6, 1);
        }

        // Phase 2 - cracks visible on the ring
        if (phase2 && !flash) {
            ctx.fillStyle = '#ff3030';
            ctx.fillRect(cx - W / 2 + 2, cy - 6, 1, 4);
            ctx.fillRect(cx - W / 2 + 3, cy - 4, 1, 2);
            ctx.fillRect(cx + W / 2 - 4, cy + 2, 1, 4);
            ctx.fillRect(cx + W / 2 - 3, cy + 4, 1, 2);
        }

        // Yell-text
        if (this.yellTimer && this.yellTimer > 0) {
            drawPixelTextOutlined(ctx, this.yellText || 'ALGORITHM',
                cx, y - 12, '#80c0ff', '#0a205a', 1, 'center', 1);
            this.yellTimer--;
        }
    }

    // Pixel-perfect ring helper - draws an annulus of given outer radius
    // and ring thickness using fillRects.
    _fillRing(ctx, cx, cy, r, thickness) {
        const r2 = r * r;
        const ir = Math.max(0, r - thickness);
        const ir2 = ir * ir;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const d = dx * dx + dy * dy;
                if (d <= r2 && d >= ir2) {
                    ctx.fillRect(Math.floor(cx + dx), Math.floor(cy + dy), 1, 1);
                }
            }
        }
    }
    _fillDisc(ctx, cx, cy, r) {
        const r2 = r * r;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy <= r2) {
                    ctx.fillRect(Math.floor(cx + dx), Math.floor(cy + dy), 1, 1);
                }
            }
        }
    }

    // CLIPPY 2.0 - hidden Stage 7 boss. Chrome corporate replacement.
    drawClippy2SNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const tele = this.attackTelegraph !== undefined && this.attackTelegraph >= 0;
        if (tele) x += (Math.floor(this.behaviorTimer / 2) % 2) * 2 - 1;
        const phase2 = this.health / this.maxHealth <= 0.5;
        const C = flash ? {
            outline:'#fff', body:'#fff', bodylit:'#fff', bodyshad:'#fff',
            eye:'#000', lens:'#000', thrust:'#000', glow:'#000'
        } : {
            outline:'#0a0612',
            body:'#a8a8c0',
            bodylit:'#f0f0ff',
            bodyshad:'#5a5a72',
            eye: phase2 ? '#ff3030' : '#ff60ff',
            lens:'#1a1a2a',
            thrust:'#ff60ff',
            glow:'#ff60ff'
        };
        // Thruster jets at the bottom (always firing)
        const tFlick = (this.behaviorTimer & 4) < 2;
        ctx.fillStyle = C.thrust;
        ctx.fillRect(x + 6,  y + H - 4, 4, tFlick ? 8 : 6);
        ctx.fillRect(x + W - 10, y + H - 4, 4, tFlick ? 8 : 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 7,  y + H - 3, 2, tFlick ? 6 : 4);
        ctx.fillRect(x + W - 9, y + H - 3, 2, tFlick ? 6 : 4);

        // Sharp angular paperclip body
        // Outer loop
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 6,  y + 4,  W - 12, 3);
        ctx.fillRect(x + 6,  y + 4,  3,      H - 12);
        ctx.fillRect(x + W - 9, y + 4, 3,    H - 10);
        ctx.fillRect(x + 6,  y + H - 8, W - 14, 3);
        // Chrome fill
        ctx.fillStyle = C.body;
        ctx.fillRect(x + 9,  y + 7,  W - 18, 1);
        ctx.fillRect(x + 9,  y + 7,  1,      H - 18);
        ctx.fillRect(x + W - 10, y + 7, 1,   H - 16);
        // Inner loop
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 11, y + 10, W - 22, 3);
        ctx.fillRect(x + 11, y + 10, 3,      H - 22);
        ctx.fillRect(x + W - 14, y + 10, 3,  H - 22);
        // Chrome highlight on the left edge
        ctx.fillStyle = C.bodylit;
        ctx.fillRect(x + 6,  y + 5,  3, H - 18);
        ctx.fillRect(x + 8,  y + 5,  W - 18, 1);

        // Visor with two glowing eyes
        const visorY = y + 22;
        ctx.fillStyle = C.lens;
        ctx.fillRect(x + 9, visorY, W - 18, 8);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 9, visorY, W - 18, 1);
        ctx.fillRect(x + 9, visorY + 7, W - 18, 1);
        // Glowing eyes
        const eyeBlink = (this.behaviorTimer & 24) < 6;
        if (!eyeBlink) {
            ctx.fillStyle = C.eye;
            ctx.fillRect(x + 12, visorY + 2, 4, 4);
            ctx.fillRect(x + W - 16, visorY + 2, 4, 4);
            ctx.fillStyle = '#fff';
            ctx.fillRect(x + 13, visorY + 3, 1, 1);
            ctx.fillRect(x + W - 15, visorY + 3, 1, 1);
        }

        // Antennae / corporate ID badge
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + W / 2 - 1, y + 1, 2, 4);
        ctx.fillStyle = C.glow;
        ctx.fillRect(x + W / 2 - 1, y, 2, 1);

        // Yell-text overlay
        if (this.yellTimer && this.yellTimer > 0) {
            drawPixelTextOutlined(ctx, this.yellText || 'CORPORATE',
                x + W / 2, y - 14, '#ff60ff', '#1a0000', 1, 'center', 1);
            this.yellTimer--;
        }

        // Phase 2 rim
        if (phase2 && !flash) {
            const pulse = Math.sin(this.behaviorTimer * 0.2) > 0;
            ctx.fillStyle = pulse ? '#ff60ff' : '#a02080';
            ctx.fillRect(x - 1, y - 1, W + 2, 1);
            ctx.fillRect(x - 1, y + H, W + 2, 1);
            ctx.fillRect(x - 1, y, 1, H);
            ctx.fillRect(x + W, y, 1, H);
        }
    }

    // BILL GATES - Stage 6 true-final boss
    drawBillGatesSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const tele = this.attackTelegraph !== undefined && this.attackTelegraph >= 0;
        if (tele) x += (Math.floor(this.behaviorTimer / 4) % 2);
        const phase2 = this.health / this.maxHealth <= 0.5;

        const C = flash ? {
            outline:'#fff', skin:'#fff', skinlit:'#fff', skinshad:'#fff',
            hair:'#fff', sweater:'#fff', sweaterlit:'#fff', sweatershad:'#fff',
            slacks:'#fff', slackslit:'#fff', shoe:'#fff', glasses:'#000',
            lens:'#000', smug:'#000', smugred:'#000'
        } : {
            outline:'#1a0e08',
            skin:'#f0c890',
            skinlit:'#f8dcb0',
            skinshad:'#a88060',
            hair:'#806838',
            hairlit:'#a08858',
            sweater: phase2 ? '#a82020' : '#c8b878',
            sweaterlit: phase2 ? '#cc4444' : '#e0d098',
            sweatershad: phase2 ? '#601010' : '#806848',
            slacks:'#806848',
            slackslit:'#a08868',
            shoe:'#3a1f10',
            glasses:'#0a0612',
            lens:'#a8d8ff',
            smug:'#1a0e08',
            smugred:'#a82020'
        };

        // ---- Shoes (small dress loafers) ----
        ctx.fillStyle = C.shoe;
        ctx.fillRect(x + 3,  y + H - 4, 9, 4);
        ctx.fillRect(x + W - 12, y + H - 4, 9, 4);
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(x + 3,  y + H - 4, 8, 1);
        ctx.fillRect(x + W - 12, y + H - 4, 8, 1);

        // ---- Slacks ----
        ctx.fillStyle = C.slacks;
        ctx.fillRect(x + 5, y + 36, 9, H - 40);
        ctx.fillRect(x + W - 14, y + 36, 9, H - 40);
        ctx.fillStyle = C.slackslit;
        ctx.fillRect(x + 5, y + 36, 1, H - 40);
        ctx.fillRect(x + W - 14, y + 36, 1, H - 40);
        // Crease down each leg
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 8, y + 36, 1, H - 40);
        ctx.fillRect(x + W - 11, y + 36, 1, H - 40);

        // ---- Sweater (the classic 90s look) ----
        ctx.fillStyle = C.sweater;
        ctx.fillRect(x + 2, y + 22, W - 4, 16);
        ctx.fillStyle = C.sweaterlit;
        ctx.fillRect(x + 2, y + 22, W - 4, 2);
        ctx.fillRect(x + 2, y + 22, 1, 16);
        ctx.fillStyle = C.sweatershad;
        ctx.fillRect(x + 2, y + 36, W - 4, 2);
        // Diamond knit pattern
        ctx.fillStyle = C.sweatershad;
        for (let py = 26; py < 36; py += 4) {
            for (let px = 6; px < W - 8; px += 6) {
                ctx.fillRect(x + px, y + py, 1, 1);
                ctx.fillRect(x + px + 3, y + py + 2, 1, 1);
            }
        }
        // V-neck collar
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + W / 2 - 4, y + 22, 1, 1);
        ctx.fillRect(x + W / 2 + 3, y + 22, 1, 1);
        ctx.fillRect(x + W / 2 - 3, y + 23, 1, 1);
        ctx.fillRect(x + W / 2 + 2, y + 23, 1, 1);
        ctx.fillRect(x + W / 2 - 2, y + 24, 1, 1);
        ctx.fillRect(x + W / 2 + 1, y + 24, 1, 1);
        ctx.fillRect(x + W / 2 - 1, y + 25, 2, 1);
        // Shirt collar peeking through
        ctx.fillStyle = '#fff8d0';
        ctx.fillRect(x + W / 2 - 1, y + 22, 2, 3);

        // ---- Arms ----
        // Default: hands clasped in front of him (calculating pose)
        const pat = this.attackTelegraph;
        const armsForward = (pat === 0 || pat === 5);    // money rain / windows update
        const armsOut = (pat === 2);                     // antitrust fan
        ctx.fillStyle = C.sweater;
        if (armsForward) {
            // Arms raised forward to summon
            ctx.fillRect(x - 1, y + 22, 4, 8);
            ctx.fillRect(x - 3, y + 18, 4, 6);
            ctx.fillRect(x + W - 3, y + 22, 4, 8);
            ctx.fillRect(x + W - 1, y + 18, 4, 6);
            ctx.fillStyle = C.skin;
            ctx.fillRect(x - 4, y + 16, 4, 4);
            ctx.fillRect(x + W, y + 16, 4, 4);
        } else if (armsOut) {
            // Arms wide in lawsuit gesture
            ctx.fillRect(x - 5, y + 24, 7, 5);
            ctx.fillRect(x + W - 2, y + 24, 7, 5);
            ctx.fillStyle = C.skin;
            ctx.fillRect(x - 7, y + 23, 3, 4);
            ctx.fillRect(x + W + 4, y + 23, 3, 4);
        } else {
            // Default: hands clasped in front
            ctx.fillRect(x + 1, y + 24, 4, 8);
            ctx.fillRect(x + W - 5, y + 24, 4, 8);
            ctx.fillStyle = C.skin;
            ctx.fillRect(x + W / 2 - 4, y + 32, 8, 4);
            ctx.fillStyle = C.skinshad;
            ctx.fillRect(x + W / 2 - 4, y + 35, 8, 1);
        }

        // ---- Head ----
        const hx = x + W / 2;
        // Skin
        ctx.fillStyle = C.skin;
        ctx.fillRect(x + 4, y + 6, W - 8, 16);
        ctx.fillStyle = C.skinlit;
        ctx.fillRect(x + 6, y + 6, W - 12, 1);
        // Bowl-cut hair - the trademark
        ctx.fillStyle = C.hair;
        ctx.fillRect(x + 2, y + 2, W - 4, 6);     // top mop
        ctx.fillRect(x + 2, y + 4, 2, 10);        // side
        ctx.fillRect(x + W - 4, y + 4, 2, 10);    // side
        // Hair highlight
        ctx.fillStyle = C.hairlit;
        ctx.fillRect(x + 4, y + 2, W - 8, 1);
        ctx.fillRect(x + 2, y + 3, 1, 1);
        // Bangs
        ctx.fillStyle = C.hair;
        ctx.fillRect(x + 5, y + 8, W - 10, 2);

        // ---- The Glasses (giant rectangular frames) ----
        // Outer frame
        ctx.fillStyle = C.glasses;
        // Left lens
        ctx.fillRect(x + 4, y + 11, 9, 7);
        // Right lens
        ctx.fillRect(x + W - 13, y + 11, 9, 7);
        // Bridge
        ctx.fillRect(x + 13, y + 13, W - 26, 1);
        // Inner lens (light blue tint)
        ctx.fillStyle = C.lens;
        ctx.fillRect(x + 5, y + 12, 7, 5);
        ctx.fillRect(x + W - 12, y + 12, 7, 5);
        // Eyes behind lenses (small, beady, calculating)
        ctx.fillStyle = '#1a0e08';
        ctx.fillRect(x + 8, y + 14, 1, 1);
        ctx.fillRect(x + W - 9, y + 14, 1, 1);
        // Glasses gleam during telegraph - bright streaks across both lenses
        if (tele) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(x + 5, y + 12, 3, 1);
            ctx.fillRect(x + W - 12, y + 12, 3, 1);
        } else {
            // Subtle glasses shine
            ctx.fillStyle = '#fff';
            ctx.fillRect(x + 11, y + 12, 1, 1);
            ctx.fillRect(x + W - 6, y + 12, 1, 1);
        }

        // ---- Smug Smirk ----
        // Mouth tilts up to one side - smug grin
        // Width grows as HP decreases (he's enjoying this)
        const smirkW = phase2 ? 7 : 5;
        ctx.fillStyle = C.smug;
        // The grin line
        for (let i = 0; i < smirkW; i++) {
            const yOffset = Math.floor(i * 0.4);
            ctx.fillRect(hx - 2 + i, y + 19 - yOffset, 1, 1);
        }
        // Tiny visible tooth
        ctx.fillStyle = '#fff';
        ctx.fillRect(hx, y + 19, 1, 1);

        // ---- Yell text overlay ----
        if (this.yellTimer && this.yellTimer > 0) {
            const wobble = Math.floor(Math.sin(this.behaviorTimer * 0.4) * 1);
            const color = this.yellText === 'CHA-CHING' ? '#50ff70'
                        : this.yellText === 'ANTITRUST' ? '#5aa8e0'
                        : this.yellText === 'INSTALLING UPDATES' ? '#5aa8e0'
                        : '#ffe070';
            drawPixelTextOutlined(ctx, this.yellText, hx + wobble, y - 14, color, '#1a0000', 1, 'center', 1);
            this.yellTimer--;
        }

        // Phase 2 - sinister glow rim and floating dollar signs
        if (phase2 && !flash) {
            const pulse = Math.sin(this.behaviorTimer * 0.2) > 0;
            ctx.fillStyle = pulse ? '#50ff70' : '#208a30';
            ctx.fillRect(x - 1, y - 1, W + 2, 1);
            ctx.fillRect(x - 1, y + H, W + 2, 1);
            ctx.fillRect(x - 1, y, 1, H);
            ctx.fillRect(x + W, y, 1, H);
            // Sinister dollar-sign halo particles
            if (this.behaviorTimer % 8 === 0 && typeof particles !== 'undefined') {
                particles.spawn({
                    x: x + Math.random() * W, y: y - 4,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.4,
                    life: 30,
                    size: 1,
                    colors: ['#50ff70', '#208a30', '#1a4a18']
                });
            }
        }
    }

    // STEVE BALLMER - Stage 5 final boss
    drawBallmerSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        // Constant high-energy bobbing
        const bob = Math.floor(Math.sin(this.behaviorTimer * 0.3) * 1);
        y += bob;
        const tele = this.attackTelegraph !== undefined && this.attackTelegraph >= 0;
        if (tele) x += (Math.floor(this.behaviorTimer / 2) % 2) * 2 - 1;
        const phase2 = this.health / this.maxHealth <= 0.5;

        const C = flash ? {
            outline:'#fff', skin:'#fff', skinlit:'#fff', skinshad:'#fff',
            hair:'#fff', shirt:'#fff', suit:'#fff', suitlit:'#fff',
            tie:'#fff', tieshad:'#fff', shoe:'#fff', shoelit:'#fff',
            eye:'#000', eyered:'#000', mouth:'#000'
        } : {
            outline:'#1a0e08',
            skin:'#e8a878',
            skinlit:'#f4c890',
            skinshad:'#a87040',
            hair:'#3a2418',
            shirt:'#fff8d0',
            suit:'#1a1a2a',
            suitlit:'#3a3a48',
            tie:'#a82020',
            tieshad:'#601010',
            shoe:'#1a0e08',
            shoelit:'#5a3a18',
            eye:'#ffffff',
            eyered:'#ff3030',
            mouth:'#3a0808'
        };

        // ---- Shoes (loafers) ----
        ctx.fillStyle = C.shoe;
        ctx.fillRect(x + 2,  y + H - 5, 12, 5);
        ctx.fillRect(x + W - 14, y + H - 5, 12, 5);
        ctx.fillStyle = C.shoelit;
        ctx.fillRect(x + 2,  y + H - 5, 10, 1);
        ctx.fillRect(x + W - 14, y + H - 5, 10, 1);
        // Penny-loafer detail
        ctx.fillStyle = C.skinshad;
        ctx.fillRect(x + 6,  y + H - 3, 2, 1);
        ctx.fillRect(x + W - 8, y + H - 3, 2, 1);

        // ---- Pants ----
        ctx.fillStyle = C.suit;
        ctx.fillRect(x + 4,  y + 38, 12, H - 43);
        ctx.fillRect(x + W - 16, y + 38, 12, H - 43);
        ctx.fillStyle = C.suitlit;
        ctx.fillRect(x + 4,  y + 38, 1, H - 43);
        ctx.fillRect(x + W - 16, y + 38, 1, H - 43);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 14, y + 38, 1, H - 43);
        ctx.fillRect(x + W - 14, y + 38, 1, H - 43);

        // ---- Torso / Suit Jacket ----
        ctx.fillStyle = C.suit;
        ctx.fillRect(x + 2, y + 22, W - 4, 18);
        ctx.fillStyle = C.suitlit;
        ctx.fillRect(x + 2, y + 22, W - 4, 2);
        ctx.fillRect(x + 2, y + 22, 1, 18);
        // Lapels
        ctx.fillStyle = C.suitlit;
        ctx.fillRect(x + 8,  y + 22, 4, 12);
        ctx.fillRect(x + W - 12, y + 22, 4, 12);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 11, y + 22, 1, 12);
        ctx.fillRect(x + W - 12, y + 22, 1, 12);

        // ---- Shirt (visible between lapels) ----
        ctx.fillStyle = C.shirt;
        ctx.fillRect(x + 12, y + 22, W - 24, 14);
        // Collar
        ctx.fillStyle = C.shirt;
        ctx.fillRect(x + 11, y + 22, 2, 4);
        ctx.fillRect(x + W - 13, y + 22, 2, 4);
        // Buttons
        ctx.fillStyle = C.skinshad;
        ctx.fillRect(x + W / 2 - 1, y + 28, 1, 1);
        ctx.fillRect(x + W / 2 - 1, y + 32, 1, 1);

        // ---- Tie ----
        ctx.fillStyle = C.tie;
        ctx.fillRect(x + W / 2 - 2, y + 22, 4, 4);   // knot
        ctx.fillRect(x + W / 2 - 3, y + 26, 6, 12);  // body
        ctx.fillStyle = C.tieshad;
        ctx.fillRect(x + W / 2 + 1, y + 26, 2, 12);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + W / 2 - 3, y + 38, 6, 1);   // tip

        // ---- Arms ----
        // Sleeves (suit), arms pose changes by pattern telegraph
        const pat = this.attackTelegraph;
        const fistOut = (pat === 4 || pat === 5);
        const phoneOut = (pat === 3 || this.phoneSlam > 0);
        const yellPose = (this.yellTimer && this.yellTimer > 0);

        ctx.fillStyle = C.suit;
        if (yellPose || pat === 0 || pat === 1) {
            // Arms raised in classic shouting pose
            ctx.fillRect(x - 1,  y + 22, 5, 10);
            ctx.fillRect(x - 2,  y + 16, 5, 8);
            ctx.fillRect(x + W - 4, y + 22, 5, 10);
            ctx.fillRect(x + W - 3, y + 16, 5, 8);
            // Hands (skin)
            ctx.fillStyle = C.skin;
            ctx.fillRect(x - 3, y + 14, 5, 4);
            ctx.fillRect(x + W - 2, y + 14, 5, 4);
            ctx.fillStyle = C.skinlit;
            ctx.fillRect(x - 3, y + 14, 1, 4);
            ctx.fillRect(x + W - 2, y + 14, 1, 4);
        } else if (fistOut) {
            // Both fists punching forward
            ctx.fillRect(x + W,     y + 24, 6, 6);
            ctx.fillRect(x - 6,     y + 28, 6, 6);
            ctx.fillStyle = C.skin;
            ctx.fillRect(x + W + 6, y + 23, 5, 8);
            ctx.fillRect(x - 11,    y + 27, 5, 8);
            ctx.fillStyle = C.skinlit;
            ctx.fillRect(x + W + 6, y + 23, 1, 8);
            ctx.fillRect(x - 11,    y + 27, 1, 8);
        } else if (phoneOut) {
            // Holding phone aloft (or slammed)
            ctx.fillRect(x - 1, y + 22, 5, 10);
            ctx.fillRect(x + W - 4, y + 22, 5, 10);
            const phY = this.phoneSlam > 15 ? y + 8 : y + 24;     // slam motion
            ctx.fillStyle = C.skin;
            ctx.fillRect(x - 3, phY - 2, 5, 4);
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(x - 6, phY, 6, 4);     // phone handset
            ctx.fillRect(x - 5, phY - 1, 4, 1);
            ctx.fillRect(x - 5, phY + 4, 4, 1);
            ctx.fillStyle = '#3a3a48';
            ctx.fillRect(x - 5, phY + 1, 1, 1);
        } else {
            // Default rest pose - arms down at sides
            ctx.fillRect(x - 1, y + 22, 5, 14);
            ctx.fillRect(x + W - 4, y + 22, 5, 14);
            ctx.fillStyle = C.skin;
            ctx.fillRect(x - 1, y + 34, 5, 4);
            ctx.fillRect(x + W - 4, y + 34, 5, 4);
        }

        // ---- Head ----
        const hx = x + W / 2;
        const hy = y + 14;
        // Dome
        ctx.fillStyle = C.skin;
        ctx.fillRect(x + 4, y + 4, W - 8, 18);
        // Shine on top
        ctx.fillStyle = C.skinlit;
        ctx.fillRect(x + 6, y + 4, W - 12, 2);
        ctx.fillRect(x + 6, y + 6, 1, 1);
        ctx.fillRect(x + 8, y + 5, 1, 1);
        // Chin shadow
        ctx.fillStyle = C.skinshad;
        ctx.fillRect(x + 4, y + 20, W - 8, 2);

        // Side hair ring
        ctx.fillStyle = C.hair;
        ctx.fillRect(x + 2,  y + 12, 3, 8);
        ctx.fillRect(x + W - 5, y + 12, 3, 8);
        // Back-of-head hair
        ctx.fillRect(x + 4, y + 18, W - 8, 2);

        // Eyebrows (angry)
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 7, y + 10, 5, 1);
        ctx.fillRect(x + W - 12, y + 10, 5, 1);
        ctx.fillRect(x + 7, y + 11, 1, 1);
        ctx.fillRect(x + W - 8, y + 11, 1, 1);

        // BIG bulging eyes
        const eyeOffsetY = (this.behaviorTimer & 12) < 6 ? 0 : 1;
        ctx.fillStyle = C.eye;
        ctx.fillRect(x + 7,  y + 12, 6, 6);
        ctx.fillRect(x + W - 13, y + 12, 6, 6);
        // Pupils (look toward facing direction)
        const pupilDir = this.facingRight ? 1 : -1;
        ctx.fillStyle = phase2 ? C.eyered : '#1a1a2a';
        ctx.fillRect(x + 9 + pupilDir, y + 14 + eyeOffsetY, 2, 2);
        ctx.fillRect(x + W - 11 + pupilDir, y + 14 + eyeOffsetY, 2, 2);
        // Eye glint
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 9 + pupilDir, y + 14 + eyeOffsetY, 1, 1);
        ctx.fillRect(x + W - 11 + pupilDir, y + 14 + eyeOffsetY, 1, 1);

        // Mouth - opens wider when shouting
        const shouting = (yellPose || tele);
        const mouthH = shouting ? 5 : 2;
        const mouthW = shouting ? 10 : 6;
        ctx.fillStyle = C.mouth;
        ctx.fillRect(hx - mouthW / 2, y + 20, mouthW, mouthH);
        // Teeth
        ctx.fillStyle = '#fff';
        ctx.fillRect(hx - mouthW / 2, y + 20, mouthW, 1);
        if (shouting) {
            // Tongue
            ctx.fillStyle = '#ff5050';
            ctx.fillRect(hx - 2, y + 22, 4, mouthH - 2);
        }

        // ---- Sweat drops ----
        // Forehead drop (animated falling)
        const sweatPhase = (this.behaviorTimer / 4) | 0;
        ctx.fillStyle = '#80c8ff';
        ctx.fillRect(x + 5,  y + 4 + (sweatPhase % 6), 1, 2);
        ctx.fillRect(x + W - 6, y + 6 + ((sweatPhase + 2) % 5), 1, 2);

        // ---- Yell text overlay ----
        if (this.yellTimer && this.yellTimer > 0) {
            const yt = this.yellTimer;
            const wobble = Math.floor(Math.sin(this.behaviorTimer * 0.5) * 2);
            drawPixelTextOutlined(ctx, this.yellText || 'YELL!',
                hx + wobble, y - 18,
                this.yellText === "YOU'RE FIRED!" ? '#ff5050' : '#ffe070',
                '#1a0000', 2, 'center', 1);
            // Sound-wave ripples
            const ringR = (60 - yt) * 2;
            if (ringR > 0 && ringR < 60) {
                ctx.fillStyle = '#fff8d0';
                for (let a = -Math.PI / 3; a <= Math.PI / 3; a += Math.PI / 12) {
                    const rx = hx + Math.cos(a) * ringR;
                    const ry = y + 18 + Math.sin(a) * ringR * 0.4;
                    ctx.fillRect(Math.floor(rx), Math.floor(ry), 1, 1);
                }
            }
            this.yellTimer--;
        }

        // Phone-slam afterimage / spark
        if (this.phoneSlam && this.phoneSlam > 0) {
            this.phoneSlam--;
            if (this.phoneSlam < 20) {
                // Ground crack visual under Ballmer
                ctx.fillStyle = '#ff8030';
                ctx.fillRect(x + 4, y + H, W - 8, 2);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(x + 6, y + H, W - 12, 1);
            }
        }

        // Phase 2 rage rim - red pulsing border
        if (phase2 && !flash) {
            const pulse = Math.sin(this.behaviorTimer * 0.25) > 0;
            ctx.fillStyle = pulse ? '#ff3030' : '#a82020';
            ctx.fillRect(x - 1, y - 1, W + 2, 1);
            ctx.fillRect(x - 1, y + H, W + 2, 1);
            ctx.fillRect(x - 1, y, 1, H);
            ctx.fillRect(x + W, y, 1, H);
        }
    }

    // Ctrl-Alt-Del final boss (Stage 4 BOARDROOM)
    drawCtrlAltDelSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const tele = this.attackTelegraph !== undefined && this.attackTelegraph >= 0;
        const phase2 = this.health / this.maxHealth <= 0.5;

        const C = flash ? {
            outline:'#fff', body:'#fff', bodylit:'#fff', bodydark:'#fff',
            screen:'#fff', text:'#000', key:'#fff', keylit:'#fff', keydark:'#fff',
            ctrl:'#fff', alt:'#fff', del:'#fff', glow:'#fff'
        } : {
            outline:'#0a0612',
            body:'#3a2855',
            bodylit:'#7a608c',
            bodydark:'#1a1140',
            screen:'#1a508a',
            text:'#a8d8ff',
            key:'#c8c8d8',
            keylit:'#f0f0ff',
            keydark:'#7a7a8a',
            ctrl: '#ff5050',
            alt:  '#ffd460',
            del:  '#ff60ff',
            glow:'#a8d8ff'
        };

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x - 2, y + H, W + 4, 3);

        // Body - big mahogany-trimmed terminal
        ctx.fillStyle = C.body;
        ctx.fillRect(x, y, W, H);
        // Outer mahogany trim
        ctx.fillStyle = '#a8780a';
        ctx.fillRect(x, y, W, 2);
        ctx.fillRect(x, y, 2, H);
        ctx.fillRect(x + W - 2, y, 2, H);
        ctx.fillRect(x, y + H - 2, W, 2);
        ctx.fillStyle = '#ffd460';
        ctx.fillRect(x, y, W, 1);
        ctx.fillRect(x, y, 1, H);
        ctx.fillStyle = '#604010';
        ctx.fillRect(x, y + H - 1, W, 1);
        ctx.fillRect(x + W - 1, y, 1, H);

        // Screen at the top - shows scrolling code
        const sx = x + 5, sy = y + 5, sw = W - 10, sh = 20;
        ctx.fillStyle = C.screen;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = C.bodydark;
        ctx.fillRect(sx, sy, sw, 1);
        ctx.fillStyle = C.glow;
        ctx.fillRect(sx, sy + sh - 1, sw, 1);
        // Scrolling code lines
        ctx.fillStyle = C.text;
        const scroll = Math.floor(this.behaviorTimer * 0.3);
        for (let r = 0; r < 4; r++) {
            const charSeed = (r * 17 + scroll) & 31;
            for (let c = 0; c < (sw - 4) / 3; c++) {
                if (((c + charSeed) * 7) & 3) {
                    ctx.fillRect(sx + 2 + c * 3, sy + 3 + r * 4, 2, 1);
                }
            }
        }
        // Cursor blink
        if ((this.behaviorTimer & 16) < 8) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(sx + 2, sy + 15, 2, 2);
        }
        // BSOD overlay in phase 2
        if (phase2 && (this.behaviorTimer & 8) < 4) {
            ctx.fillStyle = '#0040a0';
            ctx.fillRect(sx, sy, sw, sh);
            // White ":(" face
            ctx.fillStyle = '#fff';
            ctx.fillRect(sx + sw / 2 - 4, sy + 4, 1, 2);
            ctx.fillRect(sx + sw / 2 + 3, sy + 4, 1, 2);
            ctx.fillRect(sx + sw / 2 - 3, sy + 12, 1, 1);
            ctx.fillRect(sx + sw / 2 - 2, sy + 11, 1, 1);
            ctx.fillRect(sx + sw / 2 - 1, sy + 11, 1, 1);
            ctx.fillRect(sx + sw / 2,     sy + 11, 1, 1);
            ctx.fillRect(sx + sw / 2 + 1, sy + 12, 1, 1);
        }

        // Three keycaps at the bottom: CTRL ALT DEL
        // The keycap matching the current attack pattern lights up during telegraph.
        const keys = [
            { label:'C', color:C.ctrl, x: x + 4 },
            { label:'A', color:C.alt,  x: x + W / 2 - 8 },
            { label:'D', color:C.del,  x: x + W - 20 }
        ];
        for (let k = 0; k < keys.length; k++) {
            const K = keys[k];
            const kx = K.x, ky = y + H - 22;
            const kw = 16, kh = 14;
            // Determine which keys light up - patterns 0/1/2 map to CTRL/ALT/DEL,
            // patterns 3/4 light all keys together, pattern 5 lights all and flashes.
            const tPat = this.attackTelegraph;
            const lit = tele && (
                tPat === k || tPat >= 3
            );
            ctx.fillStyle = C.outline;
            ctx.fillRect(kx, ky, kw, kh);
            ctx.fillStyle = lit ? K.color : C.key;
            ctx.fillRect(kx + 1, ky + 1, kw - 2, kh - 2);
            ctx.fillStyle = lit ? '#fff' : C.keylit;
            ctx.fillRect(kx + 1, ky + 1, kw - 2, 2);
            ctx.fillStyle = C.keydark;
            ctx.fillRect(kx + 1, ky + kh - 3, kw - 2, 2);
            // Letter
            ctx.fillStyle = lit ? '#fff' : '#1a1a22';
            if (typeof drawPixelText === 'function') {
                drawPixelText(ctx, K.label, kx + kw / 2, ky + 4, lit ? '#fff' : '#1a1a22', 1, 'center', 1);
            }
            // Glow if lit
            if (lit) {
                ctx.fillStyle = K.color + '00'; // not used directly; emulate w/ rgba
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fillRect(kx - 2, ky - 2, kw + 4, kh + 4);
            }
        }

        // Side blinking status LEDs
        for (let i = 0; i < 4; i++) {
            const lit = (Math.floor(this.behaviorTimer / 6 + i) & 1);
            ctx.fillStyle = lit ? '#50ff70' : '#206030';
            ctx.fillRect(x + 3, y + 30 + i * 5, 2, 2);
            ctx.fillRect(x + W - 5, y + 30 + i * 5, 2, 2);
        }

        // Phase 2 - red alert rim
        if (phase2 && !flash) {
            const pulse = Math.sin(this.behaviorTimer * 0.2) > 0;
            ctx.fillStyle = pulse ? '#ff3030' : '#a82020';
            ctx.fillRect(x - 1, y - 1, W + 2, 1);
            ctx.fillRect(x - 1, y + H, W + 2, 1);
            ctx.fillRect(x - 1, y, 1, H);
            ctx.fillRect(x + W, y, 1, H);
            // Smoke from the top
            if (this.behaviorTimer % 5 === 0 && typeof particles !== 'undefined') {
                particles.spawn({
                    x: x + W / 2 + (Math.random() - 0.5) * W / 2,
                    y: y - 1,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: -0.5 - Math.random() * 0.4,
                    life: 22,
                    size: 2,
                    colors: ['#fff', '#aaaab8', '#3a3a48']
                });
            }
        }
    }

    // Mega-Shredder boss for Stage 3
    drawShredderSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const tele = this.attackTelegraph !== undefined && this.attackTelegraph >= 0;
        if (tele) x += (Math.floor(this.behaviorTimer / 2) % 2) * 2 - 1;

        const phase2 = this.health / this.maxHealth <= 0.5;

        const C = flash ? {
            outline:'#fff', body:'#fff', bodylit:'#fff', bodydark:'#fff',
            mouth:'#000', teeth:'#fff', led:'#000'
        } : {
            outline:'#000',
            body:'#1a1a22',
            bodylit:'#3a3a48',
            bodydark:'#0a0a14',
            mouth:'#000',
            teeth:'#a8a8c0',
            led: phase2 ? '#ff3030' : '#50ff70'
        };

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - 1, y + H, W + 2, 2);

        // Main body
        ctx.fillStyle = C.body;
        ctx.fillRect(x, y + 6, W, H - 6);
        // Top highlight bar
        ctx.fillStyle = C.bodylit;
        ctx.fillRect(x, y + 6, W, 2);
        ctx.fillRect(x, y + 6, 1, H - 6);
        // Bottom shadow
        ctx.fillStyle = C.bodydark;
        ctx.fillRect(x, y + H - 2, W, 2);
        ctx.fillRect(x + W - 1, y + 6, 1, H - 6);

        // Slot at the top (where paper goes in) - wider than the copier's
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 2, y, W - 4, 6);
        ctx.fillStyle = C.mouth;
        ctx.fillRect(x + 4, y + 1, W - 8, 4);

        // Rotating teeth in the slot
        const spin = Math.floor((this.behaviorTimer + (tele ? this.behaviorTimer : 0)) / (tele ? 1 : 2)) & 3;
        ctx.fillStyle = C.teeth;
        for (let i = 0; i < (W - 8) / 4; i++) {
            const tx = x + 5 + i * 4;
            const ty = y + 2;
            if ((i + spin) & 1) {
                ctx.fillRect(tx,     ty,     2, 1);
                ctx.fillRect(tx + 1, ty + 1, 2, 1);
                ctx.fillRect(tx + 2, ty + 2, 2, 1);
            } else {
                ctx.fillRect(tx + 2, ty,     2, 1);
                ctx.fillRect(tx + 1, ty + 1, 2, 1);
                ctx.fillRect(tx,     ty + 2, 2, 1);
            }
        }

        // Side fan grilles
        ctx.fillStyle = C.bodylit;
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(x + 2, y + 14 + i * 4, 4, 1);
            ctx.fillRect(x + W - 6, y + 14 + i * 4, 4, 1);
        }

        // Control panel in the lower middle
        const pX = x + 8, pY = y + 18;
        ctx.fillStyle = C.bodydark;
        ctx.fillRect(pX, pY, W - 16, H - 24);
        ctx.fillStyle = C.outline;
        ctx.fillRect(pX, pY, W - 16, 1);
        // Status LEDs
        for (let i = 0; i < 3; i++) {
            const lit = (Math.floor(Date.now() / 200) + i) & 1;
            ctx.fillStyle = lit ? C.led : '#0a1a0a';
            ctx.fillRect(pX + 2 + i * 6, pY + 2, 4, 4);
            if (lit) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(pX + 3 + i * 6, pY + 2, 1, 1);
            }
        }
        // Warning sticker
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(pX + W - 26, pY + 1, 6, 6);
        ctx.fillStyle = '#1a0e1e';
        ctx.fillRect(pX + W - 24, pY + 2, 2, 3);
        ctx.fillRect(pX + W - 24, pY + 6, 2, 1);

        // Confetti pile at the base
        ctx.fillStyle = '#fff8d0';
        ctx.fillRect(x + 4, y + H - 4, W - 8, 2);
        ctx.fillStyle = '#ffd070';
        ctx.fillRect(x + 6, y + H - 3, 2, 1);
        ctx.fillRect(x + W - 10, y + H - 3, 2, 1);

        // Outer outline
        ctx.fillStyle = C.outline;
        ctx.fillRect(x, y + 6, W, 1);
        ctx.fillRect(x, y + H - 1, W, 1);
        ctx.fillRect(x, y + 6, 1, H - 6);
        ctx.fillRect(x + W - 1, y + 6, 1, H - 6);

        // Phase 2 - extra spin and rim
        if (phase2 && !flash) {
            const pulse = Math.sin(this.behaviorTimer * 0.2) > 0;
            ctx.fillStyle = pulse ? '#ff3030' : '#a82020';
            ctx.fillRect(x - 1, y - 1, W + 2, 1);
            ctx.fillRect(x - 1, y + H, W + 2, 1);
            ctx.fillRect(x - 1, y, 1, H);
            ctx.fillRect(x + W, y, 1, H);
            // Smoke from the slot
            if (this.behaviorTimer % 6 === 0 && typeof particles !== 'undefined') {
                particles.spawn({
                    x: x + W / 2 + (Math.random() - 0.5) * 8,
                    y: y - 1,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: -0.5,
                    life: 22,
                    size: 2,
                    colors: ['#3a3a48', '#1a1a22', '#0a0a14']
                });
            }
        }
    }

    // Copier 3000 mini-boss for Stage 2
    drawCopierSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const tele = this.attackTelegraph !== undefined && this.attackTelegraph >= 0;
        if (tele) x += (Math.floor(this.behaviorTimer / 2) % 2) * 2 - 1;

        const phase2 = this.health / this.maxHealth <= 0.5;

        const C = flash ? {
            outline:'#fff', body:'#fff', bodylit:'#fff', bodydark:'#fff',
            glass:'#fff', scan:'#fff', tray:'#fff', led:'#000', lit:'#000'
        } : {
            outline:'#1a1a22',
            body:'#c0c8d0',
            bodylit:'#e8ecf0',
            bodydark:'#7a8090',
            glass:'#102030',
            scan:'#80ffe0',
            tray:'#3a3a48',
            led: phase2 ? '#ff3030' : '#50ff70',
            lit:'#ffffff'
        };

        // Drop shadow under the copier
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x - 1, y + H, W + 2, 2);

        // Main body (the bulk)
        ctx.fillStyle = C.body;
        ctx.fillRect(x, y + 8, W, H - 8);
        // Top highlight
        ctx.fillStyle = C.bodylit;
        ctx.fillRect(x, y + 8, W, 2);
        ctx.fillRect(x, y + 8, 1, H - 8);
        // Bottom shadow
        ctx.fillStyle = C.bodydark;
        ctx.fillRect(x, y + H - 2, W, 2);
        ctx.fillRect(x + W - 1, y + 8, 1, H - 8);

        // Paper tray section at top (where papers come out)
        ctx.fillStyle = C.tray;
        ctx.fillRect(x + 4, y, W - 8, 10);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 4, y, W - 8, 1);
        ctx.fillRect(x + 4, y + 9, W - 8, 1);
        // Stack of papers in tray
        ctx.fillStyle = '#fff8d0';
        ctx.fillRect(x + 7, y + 3, W - 14, 5);
        ctx.fillStyle = '#d8c890';
        ctx.fillRect(x + 7, y + 7, W - 14, 1);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 7, y + 3, W - 14, 1);

        // Scanner glass strip - long dark rectangle on the front
        const scanX = x + 4;
        const scanW = W - 8;
        const scanY = y + 14;
        ctx.fillStyle = C.glass;
        ctx.fillRect(scanX, scanY, scanW, 6);
        ctx.fillStyle = C.outline;
        ctx.fillRect(scanX, scanY, scanW, 1);
        ctx.fillRect(scanX, scanY + 5, scanW, 1);
        // Scanner bar slides during the scanner-sweep telegraph
        const sp = this.scannerProgress || 0;
        if (sp > 0) {
            const barX = scanX + Math.floor(sp * (scanW - 4));
            ctx.fillStyle = C.scan;
            ctx.fillRect(barX, scanY + 1, 4, 4);
            ctx.fillStyle = '#fff';
            ctx.fillRect(barX + 1, scanY + 1, 2, 1);
            // Beam glow
            ctx.fillStyle = 'rgba(128,255,224,0.35)';
            ctx.fillRect(barX, scanY - 2, 4, 10);
        }

        // Control panel (lower front)
        const pX = x + 6;
        const pY = y + 24;
        ctx.fillStyle = C.bodydark;
        ctx.fillRect(pX, pY, W - 12, 8);
        ctx.fillStyle = C.outline;
        ctx.fillRect(pX, pY, W - 12, 1);
        // Button row
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = '#1a1a22';
            ctx.fillRect(pX + 2 + i * 6, pY + 2, 4, 4);
            ctx.fillStyle = '#5a5060';
            ctx.fillRect(pX + 2 + i * 6, pY + 2, 4, 1);
        }
        // Power LED - blinks during telegraph
        const ledBlink = tele && (this.behaviorTimer & 2);
        ctx.fillStyle = ledBlink ? C.lit : C.led;
        ctx.fillRect(x + W - 9, pY + 2, 4, 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + W - 8, pY + 2, 1, 1);
        // LED glow on telegraph
        if (ledBlink) {
            ctx.fillStyle = phase2 ? 'rgba(255,48,48,0.4)' : 'rgba(80,255,112,0.4)';
            ctx.fillRect(x + W - 11, pY, 8, 8);
        }

        // Vents on the side
        ctx.fillStyle = C.bodydark;
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(x + 2, y + 24 + i * 4, 2, 2);
            ctx.fillRect(x + W - 4, y + 24 + i * 4, 2, 2);
        }

        // Outer outline
        ctx.fillStyle = C.outline;
        ctx.fillRect(x, y + 8, W, 1);
        ctx.fillRect(x, y + H - 1, W, 1);
        ctx.fillRect(x, y + 8, 1, H - 8);
        ctx.fillRect(x + W - 1, y + 8, 1, H - 8);
        ctx.fillRect(x + 4, y, 1, 10);
        ctx.fillRect(x + W - 5, y, 1, 10);
        ctx.fillRect(x + 4, y, W - 8, 1);

        // Phase 2 rim glow
        if (phase2 && !flash) {
            const pulse = Math.sin(this.behaviorTimer * 0.2) > 0;
            ctx.fillStyle = pulse ? '#ff3030' : '#a82020';
            ctx.fillRect(x - 1, y - 1, W + 2, 1);
            ctx.fillRect(x - 1, y + H, W + 2, 1);
            ctx.fillRect(x - 1, y, 1, H);
            ctx.fillRect(x + W, y, 1, H);
            // Steam puffs - paper-jam visual
            if (this.behaviorTimer % 8 === 0 && typeof particles !== 'undefined') {
                particles.spawn({
                    x: x + W / 2 + (Math.random() - 0.5) * W,
                    y: y - 2,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.4 - Math.random() * 0.3,
                    gravity: -0.01,
                    life: 18,
                    size: 2,
                    colors: ['#ffffff', '#c0c0d0', '#8080a0']
                });
            }
        }
    }

    // Swivel chair charger (Stage 2)
    drawSwivelChairSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const C = flash ? {
            outline:'#fff', body:'#fff', bodylit:'#fff', bodydark:'#fff',
            wheel:'#000', metal:'#fff', metallit:'#fff'
        } : {
            outline:'#1a0e1e',
            body:'#3a2855',
            bodylit:'#7a608c',
            bodydark:'#1a1140',
            wheel:'#0a0612',
            metal:'#a8a8c0',
            metallit:'#e0d8e8'
        };

        // Wheels at the bottom (5-wheel base shown as 2 visible wheels)
        ctx.fillStyle = C.wheel;
        ctx.fillRect(x + 2, y + H - 4, 4, 4);
        ctx.fillRect(x + W - 6, y + H - 4, 4, 4);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 2, y + H - 1, 4, 1);
        ctx.fillRect(x + W - 6, y + H - 1, 4, 1);

        // Vertical post (gas cylinder)
        ctx.fillStyle = C.metal;
        ctx.fillRect(x + W / 2 - 1, y + 12, 2, H - 14);
        ctx.fillStyle = C.metallit;
        ctx.fillRect(x + W / 2 - 1, y + 12, 1, H - 14);

        // Base spokes
        ctx.fillStyle = C.metal;
        ctx.fillRect(x + 4, y + H - 6, W - 8, 2);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 4, y + H - 4, W - 8, 1);

        // Seat (the cushion - tilted during windup, level otherwise)
        const tilt = this.chargeState === 'windup' ? (this.facingRight ? -1 : 1) : 0;
        // Cushion
        ctx.fillStyle = C.body;
        ctx.fillRect(x + 2, y + 8 + tilt, W - 4, 6);
        // Highlight
        ctx.fillStyle = C.bodylit;
        ctx.fillRect(x + 2, y + 8 + tilt, W - 4, 2);
        // Shadow
        ctx.fillStyle = C.bodydark;
        ctx.fillRect(x + 2, y + 12 + tilt, W - 4, 2);
        // Outline
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 1, y + 8 + tilt, W - 2, 1);
        ctx.fillRect(x + 1, y + 14 + tilt, W - 2, 1);
        ctx.fillRect(x + 1, y + 8 + tilt, 1, 7);
        ctx.fillRect(x + W - 2, y + 8 + tilt, 1, 7);

        // Backrest (vertical, tilted)
        const bx = this.facingRight ? x + W - 5 : x + 2;
        const btilt = this.chargeState === 'charging' ? (this.facingRight ? -2 : 2) : 0;
        ctx.fillStyle = C.body;
        ctx.fillRect(bx + btilt, y + 1, 3, 10);
        ctx.fillStyle = C.bodylit;
        ctx.fillRect(bx + btilt, y + 1, 1, 10);
        ctx.fillStyle = C.outline;
        ctx.fillRect(bx + btilt, y, 3, 1);
        ctx.fillRect(bx + btilt + 2, y + 1, 1, 9);

        // Angry eyes on the backrest (so it has personality)
        if (this.chargeState === 'charging' || this.chargeState === 'windup') {
            ctx.fillStyle = '#ff3030';
            ctx.fillRect(bx + btilt, y + 4, 2, 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(bx + btilt, y + 4, 1, 1);
        }

        // Charge-state dust motion lines
        if (this.chargeState === 'charging' && this.behaviorTimer % 4 === 0) {
            ctx.fillStyle = '#d8d4c4';
            const trail = this.facingRight ? x - 2 : x + W + 1;
            ctx.fillRect(trail, y + H - 6, 3, 1);
            ctx.fillRect(trail, y + H - 3, 3, 1);
        }
    }

    // Highlighter (Stage 2 hovering sniper)
    drawHighlighterSNES(ctx, x, y, flash) {
        const W = this.width, H = this.height;
        const C = flash ? {
            outline:'#fff', body:'#fff', bodylit:'#fff', cap:'#fff',
            tip:'#fff', tiplit:'#fff', wing:'#fff'
        } : {
            outline:'#1a0e1e',
            body:'#ffe070',     // Classic highlighter yellow
            bodylit:'#fff8c0',
            cap:'#1a0e1e',
            tip:'#3a3030',
            tiplit:'#ffffff',
            wing:'#fff8c0'
        };

        // Body (horizontal capsule)
        ctx.fillStyle = C.body;
        ctx.fillRect(x + 3, y + 3, W - 6, H - 5);
        // Highlight
        ctx.fillStyle = C.bodylit;
        ctx.fillRect(x + 3, y + 3, W - 6, 1);
        // Outline
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 3, y + 2, W - 6, 1);
        ctx.fillRect(x + 3, y + H - 2, W - 6, 1);
        ctx.fillRect(x + 3, y + 3, 1, H - 5);

        // Cap (left side)
        ctx.fillStyle = C.cap;
        ctx.fillRect(x, y + 3, 4, H - 5);
        ctx.fillStyle = '#3a3a48';
        ctx.fillRect(x + 1, y + 4, 2, 1);

        // Tip (right side - the chisel point)
        ctx.fillStyle = C.tip;
        ctx.fillRect(x + W - 3, y + 4, 3, H - 7);
        ctx.fillStyle = C.tiplit;
        ctx.fillRect(x + W - 3, y + 4, 1, 1);
        // Tip glow when about to fire
        if (this.sniperTelegraph !== undefined && this.sniperTelegraph > 0) {
            const blink = this.sniperTelegraph & 4;
            ctx.fillStyle = blink ? '#ffff40' : '#ff8030';
            ctx.fillRect(x + W - 2, y + H - 3, 2, 2);
        }

        // Tiny flapping wings
        const flap = ((this.behaviorTimer / 4) | 0) % 2;
        ctx.fillStyle = C.wing;
        ctx.fillRect(x + 6, y - 1 - flap, 6, 2);
        ctx.fillRect(x + 6, y + H - 1 + flap, 6, 2);
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 6, y - 2 - flap, 6, 1);
        ctx.fillRect(x + 6, y + H + flap, 6, 1);

        // Brand label band
        ctx.fillStyle = C.outline;
        ctx.fillRect(x + 6, y + H - 5, W - 10, 1);
    }

    drawStapler(ctx, x, y) {
        // Red angry stapler
        ctx.fillStyle = '#c00';
        ctx.fillRect(x, y + 6, this.width, 10);
        ctx.fillStyle = '#800';
        ctx.fillRect(x + 2, y + 2, this.width - 4, 6);
        // Angry eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 4, y + 8, 4, 4);
        ctx.fillRect(x + 12, y + 8, 4, 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(x + 5, y + 9, 2, 2);
        ctx.fillRect(x + 13, y + 9, 2, 2);
    }

    drawFileFolder(ctx, x, y) {
        // Manila folder with evil face
        ctx.fillStyle = '#da8';
        ctx.fillRect(x, y, this.width, this.height);
        ctx.fillStyle = '#c97';
        ctx.fillRect(x, y, this.width, 3);
        // Evil eyes
        ctx.fillStyle = '#f00';
        ctx.fillRect(x + 6, y + 4, 4, 4);
        ctx.fillRect(x + 14, y + 4, 4, 4);
    }

    drawRubberBandBall(ctx, x, y) {
        // Chaotic rubber band ball
        ctx.fillStyle = '#654';
        ctx.beginPath();
        ctx.arc(x + this.width / 2, y + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        // Random band lines
        ctx.strokeStyle = '#432';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
            const angle = (this.behaviorTimer * 0.02 + i * 1.2);
            ctx.beginPath();
            ctx.moveTo(x + this.width / 2, y + this.height / 2);
            ctx.lineTo(
                x + this.width / 2 + Math.cos(angle) * this.width / 2,
                y + this.height / 2 + Math.sin(angle) * this.height / 2
            );
            ctx.stroke();
        }
    }

    drawTapeDispenser(ctx, x, y) {
        // Black tape dispenser
        ctx.fillStyle = '#222';
        ctx.fillRect(x, y + 4, this.width, this.height - 4);
        ctx.fillStyle = '#444';
        ctx.fillRect(x + 2, y, 8, 6);
        // Tape roll
        ctx.fillStyle = '#886';
        ctx.beginPath();
        ctx.arc(x + this.width - 8, y + this.height / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        // Evil expression
        ctx.fillStyle = '#f00';
        ctx.fillRect(x + 4, y + 8, 3, 3);
        ctx.fillRect(x + 10, y + 8, 3, 3);
    }

    drawFileCabinet(ctx, x, y) {
        // Gray file cabinet (mini-boss)
        ctx.fillStyle = '#666';
        ctx.fillRect(x, y, this.width, this.height);
        // Drawers
        ctx.fillStyle = '#555';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(x + 2, y + 4 + i * 15, this.width - 4, 12);
            // Handles
            ctx.fillStyle = '#888';
            ctx.fillRect(x + 12, y + 8 + i * 15, 8, 4);
            ctx.fillStyle = '#555';
        }
        // Evil face on top drawer
        ctx.fillStyle = '#f00';
        ctx.fillRect(x + 8, y + 6, 4, 4);
        ctx.fillRect(x + 20, y + 6, 4, 4);
    }

    // Collision detection with player
    checkCollision(player) {
        return this.active && !this.dying &&
               this.x < player.x + player.width &&
               this.x + this.width > player.x &&
               this.y < player.y + player.height &&
               this.y + this.height > player.y;
    }

    // Check bullet collision with player
    checkBulletCollision(player) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            // Delayed bullets are stacked at the boss origin until their timer
            // expires - they shouldn't damage on contact during the wind-up.
            if (bullet.delay > 0) continue;
            if (bullet.x > player.x && bullet.x < player.x + player.width &&
                bullet.y > player.y && bullet.y < player.y + player.height) {
                this.bullets.splice(i, 1);
                return bullet.damage;
            }
        }
        return 0;
    }
}

// Enemy manager
class EnemyManager {
    constructor() {
        this.enemies = [];
    }

    spawn(x, y, typeName) {
        const type = ENEMY_TYPE[typeName];
        if (type) {
            const e = new Enemy(x, y, type);
            // NewGame+ buffs: +50% HP, +30% damage, +20% bullet speed when
            // applicable. Bosses already feel meaty so apply the same scale.
            if (typeof game !== 'undefined' && game.newGamePlus && game.bossRushUnlocked) {
                e.health = Math.ceil(e.health * 1.5);
                e.maxHealth = e.health;
                e.damage = Math.ceil(e.damage * 1.3);
                e.speed = e.speed * 1.15;
                e.fireRate = Math.max(20, Math.floor((e.fireRate || 60) * 0.8));
                e.isNGPlus = true;
            }
            // Daily-challenge speed buff
            if (typeof game !== 'undefined' && game.dailyMode && game.dailySpeedMul > 1) {
                e.speed *= game.dailySpeedMul;
                if (e.fireRate) e.fireRate = Math.max(8, Math.floor(e.fireRate / game.dailySpeedMul));
            }
            this.enemies.push(e);
            // Daily: spawn a second copy offset for the double-enemies modifier
            if (typeof game !== 'undefined' && game.dailyMode && game.dailyDoubleEnemies && !e.isBoss()) {
                const e2 = new Enemy(x + 24, y, type);
                if (game.dailySpeedMul > 1) e2.speed *= game.dailySpeedMul;
                this.enemies.push(e2);
            }
        }
    }

    update(level, player) {
        this.enemies.forEach(enemy => {
            enemy.update(level, player);

            // Check collision with player
            if (enemy.checkCollision(player)) {
                player.takeDamage(enemy.damage);
            }

            // Check enemy bullets hitting player
            const bulletDamage = enemy.checkBulletCollision(player);
            if (bulletDamage > 0) {
                player.takeDamage(bulletDamage);
            }

            // Check player bullets hitting enemy
            for (let i = player.bullets.length - 1; i >= 0; i--) {
                const bullet = player.bullets[i];
                if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.width &&
                    bullet.y > enemy.y && bullet.y < enemy.y + enemy.height) {
                    let dmg = bullet.damage;
                    if (typeof game !== 'undefined' && game.dailyMode && game.dailyPlayerDmg) {
                        dmg *= game.dailyPlayerDmg;
                    }
                    enemy.takeDamage(dmg);
                    // Thunder chains: jump to nearest other enemy within range
                    if (bullet.chain && bullet.chainsLeft > 0) {
                        let nearest = null, bestDist = 80 * 80;
                        for (const other of this.enemies) {
                            if (other === enemy || !other.active || other.dying) continue;
                            const dx = (other.x + other.width / 2) - (enemy.x + enemy.width / 2);
                            const dy = (other.y + other.height / 2) - (enemy.y + enemy.height / 2);
                            const d2 = dx * dx + dy * dy;
                            if (d2 < bestDist) { bestDist = d2; nearest = other; }
                        }
                        if (nearest) {
                            // Visual arc as a particle line
                            if (typeof particles !== 'undefined') {
                                const steps = 10;
                                const fx = enemy.x + enemy.width / 2;
                                const fy = enemy.y + enemy.height / 2;
                                const tx = nearest.x + nearest.width / 2;
                                const ty = nearest.y + nearest.height / 2;
                                for (let s = 0; s <= steps; s++) {
                                    const t = s / steps;
                                    const jitter = (Math.random() - 0.5) * 4;
                                    particles.spawn({
                                        x: fx + (tx - fx) * t + jitter,
                                        y: fy + (ty - fy) * t + jitter,
                                        vx: 0, vy: 0, life: 8, size: 1,
                                        colors: ['#ffffff', '#80c0ff', '#3a78b8']
                                    });
                                }
                            }
                            // Reposition bullet at the new target so the next
                            // collision frame can apply the chain hit.
                            bullet.x = nearest.x + nearest.width / 2;
                            bullet.y = nearest.y + nearest.height / 2;
                            bullet.chainsLeft--;
                            // Don't consume the bullet yet - let it tick onto the next
                            continue;
                        }
                    }
                    if (!bullet.piercing) {
                        if (player.detonateBullet) player.detonateBullet(bullet);
                        player.bullets.splice(i, 1);
                    }
                }
            }
        });

        // Remove dead enemies
        this.enemies = this.enemies.filter(e => e.active);
    }

    draw(ctx, camera) {
        this.enemies.forEach(enemy => enemy.draw(ctx, camera));
    }
}

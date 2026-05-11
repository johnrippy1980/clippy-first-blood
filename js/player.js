// ============================================
// PLAYER CLASS - Clippy with all mechanics
// ============================================

class Player {
    constructor(x, y, controls) {
        // controls = an input-shaped object. Defaults to the global keyboard
        // this.controls. Co-op P2 passes a p2View proxy that forwards to numpad keys.
        this.controls = controls || input;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;

        this.width = PLAYER.WIDTH;
        this.height = PLAYER.HEIGHT;

        this.state = PLAYER_STATE.IDLE;
        this.facingRight = true;
        this.aimDirection = AIM_DIR.RIGHT;

        // Health system (Halo-style regen).
        // maxHealth allows the difficulty system to inflate the player's pool.
        const baseHealth = (typeof game !== 'undefined' && game.difficulty)
            ? Math.floor(PLAYER.MAX_HEALTH * game.difficulty.healthMul)
            : PLAYER.MAX_HEALTH;
        this.maxHealth = baseHealth;
        this.health = baseHealth;
        this.timeSinceDamage = 0;
        this.invincibilityTimer = 0;

        // Jump mechanics
        this.onGround = false;
        this.canDoubleJump = true;
        this.coyoteTime = 0;           // Frames since leaving ground (for late jumps)
        this.jumpBufferTime = 0;       // Frames since jump pressed (for early jumps)

        // Wall mechanics (Earthworm Jim style wall jump)
        this.touchingWallLeft = false;
        this.touchingWallRight = false;
        this.wallJumpCooldown = 0;

        // Cover system (Blackthorne style)
        this.inCover = false;
        this.coverSpot = null;         // Reference to current cover tile

        // Climbing
        this.onLadder = false;
        this.ladderX = 0;              // X position of ladder (snap to center)

        // Shooting
        this.weapon = WEAPON.MACHINE_GUN;
        this.fireTimer = 0;
        this.bullets = [];

        // Prone double-tap detection
        this.downTapTimer = 0;
        this.downTapCount = 0;

        // Slide attack: a short fast dash with a prone-height hitbox and a
        // few iframes, triggered by Down + Jump while running on the ground.
        this.slideTimer = 0;
        this.slideCooldown = 0;

        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
    }

    update(level) {
        // this.controls.update() is now called once per frame by Game.update()

        // Handle invincibility frames
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer--;
        }

        // Health regen when in cover
        this.updateHealthRegen();

        // Fire timer
        if (this.fireTimer > 0) {
            this.fireTimer--;
        }

        // Wall jump cooldown
        if (this.wallJumpCooldown > 0) {
            this.wallJumpCooldown--;
        }
        if (this.slideCooldown > 0) this.slideCooldown--;

        // Update based on state
        switch (this.state) {
            case PLAYER_STATE.COVER:
                this.updateCover(level);
                break;
            case PLAYER_STATE.CLIMBING:
                this.updateClimbing(level);
                break;
            case PLAYER_STATE.DYING:
                this.updateDying(level);
                break;
            case PLAYER_STATE.SLIDING:
                this.updateSliding(level);
                break;
            default:
                this.updateNormal(level);
                break;
        }

        // Update bullets
        this.updateBullets(level);

        // Animation timer - 4-frame ping-pong cycle (1-2-3-2) with fast speed
        this.animTimer++;
        if (this.animTimer >= 4) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }
    }

    updateNormal(level) {
        const move = this.controls.getMovement();

        // Slide trigger: running + down held + jump pressed, on the ground,
        // off cooldown. Short fast dash with a prone-height hitbox.
        if (this.onGround && this.controls.down && this.controls.jumpPressed
            && this.slideCooldown <= 0
            && (this.state === PLAYER_STATE.RUNNING || Math.abs(this.vx) > 0.5)) {
            this.state = PLAYER_STATE.SLIDING;
            this.height = PLAYER.PRONE_HEIGHT;
            this.y += PLAYER.HEIGHT - PLAYER.PRONE_HEIGHT;
            this.slideTimer = 22;
            this.invincibilityTimer = Math.max(this.invincibilityTimer, 16);
            this.vx = (this.facingRight ? 1 : -1) * 5.5;
            if (typeof particles !== 'undefined' && particles.landDust) {
                particles.landDust(this.x + this.width / 2, this.y + this.height);
            }
            if (typeof audio !== 'undefined' && audio.sfxJump) audio.sfxJump();
            return;
        }

        // Prone double-tap detection
        if (this.controls.downPressed) {
            if (this.downTapTimer > 0) {
                this.downTapCount++;
                if (this.downTapCount >= 2 && this.onGround) {
                    this.state = PLAYER_STATE.PRONE;
                    this.height = PLAYER.PRONE_HEIGHT;
                    this.y += PLAYER.HEIGHT - PLAYER.PRONE_HEIGHT;
                }
            } else {
                this.downTapCount = 1;
            }
            this.downTapTimer = 15; // 15 frames to double-tap
        }
        if (this.downTapTimer > 0) {
            this.downTapTimer--;
        } else {
            this.downTapCount = 0;
        }

        // Handle crouching
        if (this.state === PLAYER_STATE.PRONE) {
            // Exit prone (but only if there's clearance above - otherwise we'd
            // clip into the ceiling).
            const proneDelta = PLAYER.HEIGHT - PLAYER.PRONE_HEIGHT;
            const wantsExit = !this.controls.down || this.controls.jumpPressed;
            if (wantsExit && this.hasHeadroom(level, proneDelta)) {
                this.state = PLAYER_STATE.IDLE;
                this.height = PLAYER.HEIGHT;
                this.y -= proneDelta;
                this.downTapCount = 0;
                this.downTapTimer = 0;
            } else {
                // Can still shoot and aim while prone
                this.updateAiming();
                this.updateShooting();
                return;
            }
        }

        // Crouching
        if (this.controls.down && this.onGround && this.state !== PLAYER_STATE.PRONE) {
            this.state = PLAYER_STATE.CROUCHING;
            this.height = PLAYER.CROUCH_HEIGHT;
        } else if (this.state === PLAYER_STATE.CROUCHING && !this.controls.down) {
            const crouchDelta = PLAYER.HEIGHT - PLAYER.CROUCH_HEIGHT;
            if (this.hasHeadroom(level, crouchDelta)) {
                this.state = PLAYER_STATE.IDLE;
                this.height = PLAYER.HEIGHT;
                this.y -= crouchDelta;
            }
        }

        // Horizontal movement
        if (!this.controls.lockAim) {
            if (move.x !== 0) {
                this.vx += move.x * PLAYER.RUN_ACCEL;
                this.vx = Math.max(-PLAYER.RUN_SPEED, Math.min(PLAYER.RUN_SPEED, this.vx));
                this.facingRight = move.x > 0;
            } else {
                this.vx *= PLAYER.RUN_FRICTION;
                if (Math.abs(this.vx) < 0.1) this.vx = 0;
            }
        }

        // Coyote time (allows jumping shortly after leaving platform)
        if (this.onGround) {
            this.coyoteTime = 6;
            this.canDoubleJump = true;
        } else if (this.coyoteTime > 0) {
            this.coyoteTime--;
        }

        // Jump buffer (allows pressing jump slightly before landing)
        if (this.controls.jumpPressed) {
            this.jumpBufferTime = 6;
        } else if (this.jumpBufferTime > 0) {
            this.jumpBufferTime--;
        }

        // Jumping
        if (this.jumpBufferTime > 0) {
            if (this.coyoteTime > 0) {
                // Normal jump
                if (typeof particles !== 'undefined') {
                    particles.jumpPuff(this.x + this.width / 2, this.y + this.height);
                }
                if (typeof audio !== 'undefined') audio.sfxJump();
                this.vy = PLAYER.JUMP_FORCE;
                this.onGround = false;
                this.coyoteTime = 0;
                this.jumpBufferTime = 0;
                this.jumpCut = false;
                this.state = PLAYER_STATE.JUMPING;
            } else if (this.touchingWallLeft || this.touchingWallRight) {
                // Wall jump (Earthworm Jim style)
                if (this.wallJumpCooldown === 0) {
                    this.vy = PLAYER.WALL_JUMP_Y;
                    this.vx = this.touchingWallLeft ? PLAYER.WALL_JUMP_X : -PLAYER.WALL_JUMP_X;
                    this.facingRight = this.touchingWallLeft;
                    this.wallJumpCooldown = 10;
                    this.jumpBufferTime = 0;
                    this.jumpCut = false;
                    this.state = PLAYER_STATE.JUMPING;
                }
            } else if (this.canDoubleJump) {
                // Double jump
                this.vy = PLAYER.DOUBLE_JUMP_FORCE;
                this.canDoubleJump = false;
                this.jumpBufferTime = 0;
                this.jumpCut = false;
                this.state = PLAYER_STATE.JUMPING;
            }
        }

        // Variable jump height: when the player releases jump while still
        // ascending we cap upward velocity once. Held = full jump, tap =
        // short hop. The per-frame multiplier the old code used compounded
        // and made tap-jumps feel inconsistent.
        if (!this.controls.jump && this.vy < -2 && !this.jumpCut) {
            this.vy = -2;
            this.jumpCut = true;
        }
        // Reset jump-cut latch the moment we touch the ground again
        if (this.onGround) this.jumpCut = false;

        // Wall sliding
        if (!this.onGround && (this.touchingWallLeft || this.touchingWallRight)) {
            if (this.vy > PLAYER.WALL_SLIDE_SPEED) {
                this.vy = PLAYER.WALL_SLIDE_SPEED;
                this.state = PLAYER_STATE.WALL_SLIDING;
            }
        }

        // Gravity
        this.vy += GAME.GRAVITY;
        if (this.vy > GAME.MAX_FALL_SPEED) {
            this.vy = GAME.MAX_FALL_SPEED;
        }

        // Apply velocity and check collisions
        this.moveAndCollide(level);

        // Check for cover spots
        if (this.controls.cover) {
            const coverSpot = level.getCoverSpotAt(this.x + this.width / 2, this.y + this.height / 2);
            if (coverSpot) {
                this.enterCover(coverSpot);
            }
        }

        // Check for ladders/vines
        if (this.controls.up || this.controls.down) {
            const ladder = level.getLadderAt(this.x + this.width / 2, this.y + this.height / 2);
            if (ladder) {
                this.state = PLAYER_STATE.CLIMBING;
                this.onLadder = true;
                this.ladderX = ladder.x + GAME.TILE_SIZE / 2 - this.width / 2;
                this.vy = 0;
            }
        }

        // Update aiming and shooting
        this.updateAiming();
        this.updateShooting();

        // Update state
        if (this.onGround) {
            if (Math.abs(this.vx) > 0.1) {
                this.state = PLAYER_STATE.RUNNING;
            } else if (this.state !== PLAYER_STATE.CROUCHING) {
                this.state = PLAYER_STATE.IDLE;
            }
        } else if (this.vy < 0) {
            this.state = PLAYER_STATE.JUMPING;
        } else {
            this.state = PLAYER_STATE.FALLING;
        }
    }

    // Mid-slide: keep dashing in the locked direction until the timer runs
    // down, a wall stops us, or we leave the ground. Aim+shoot still works.
    updateSliding(level) {
        // Hold the prone-height while the slide is active. Gravity still
        // applies in case the player slides off a ledge.
        this.vy += GAME.GRAVITY;
        if (this.vy > GAME.MAX_FALL_SPEED) this.vy = GAME.MAX_FALL_SPEED;
        this.moveAndCollide(level);

        this.updateAiming();
        this.updateShooting();

        this.slideTimer--;
        const hitWall = this.facingRight ? this.touchingWallRight : this.touchingWallLeft;
        const exit = this.slideTimer <= 0 || hitWall || !this.onGround;
        if (exit) {
            // Try to stand back up - only if the ceiling is clear, otherwise
            // hold the low pose until headroom appears.
            const delta = PLAYER.HEIGHT - PLAYER.PRONE_HEIGHT;
            if (this.hasHeadroom(level, delta)) {
                this.height = PLAYER.HEIGHT;
                this.y -= delta;
                this.state = this.onGround ? PLAYER_STATE.IDLE : PLAYER_STATE.FALLING;
            } else {
                this.state = PLAYER_STATE.PRONE;
            }
            this.slideCooldown = 30;
            this.vx *= 0.4;
        }
    }

    updateClimbing(level) {
        const move = this.controls.getMovement();

        // Snap to ladder center
        this.x = this.ladderX;
        this.vx = 0;

        // Climb up/down
        if (move.y !== 0) {
            this.vy = move.y * PLAYER.CLIMB_SPEED;
        } else {
            this.vy = 0;
        }

        // Apply movement
        this.y += this.vy;

        // Check if still on ladder
        const ladder = level.getLadderAt(this.x + this.width / 2, this.y + this.height / 2);
        if (!ladder) {
            this.state = PLAYER_STATE.FALLING;
            this.onLadder = false;
        }

        // Jump off ladder
        if (this.controls.jumpPressed) {
            this.state = PLAYER_STATE.JUMPING;
            this.onLadder = false;
            this.vy = PLAYER.JUMP_FORCE * 0.7;
            if (this.controls.left) this.vx = -PLAYER.RUN_SPEED;
            if (this.controls.right) this.vx = PLAYER.RUN_SPEED;
        }

        // Can still shoot while climbing
        this.updateAiming();
        this.updateShooting();
    }

    updateCover(level) {
        // Health regenerates faster in cover
        this.timeSinceDamage = PLAYER.HEALTH_REGEN_DELAY; // Instant regen in cover

        // Peek out and shoot
        if (this.controls.left || this.controls.right) {
            this.facingRight = this.controls.right;
            this.updateAiming();
            this.updateShooting();
        }

        // Exit cover
        if (this.controls.cover || this.controls.jumpPressed) {
            this.exitCover();
        }
    }

    enterCover(coverSpot) {
        this.state = PLAYER_STATE.COVER;
        this.inCover = true;
        this.coverSpot = coverSpot;
        // Snap to cover spot
        this.x = coverSpot.x;
        this.y = coverSpot.y;
        this.vx = 0;
        this.vy = 0;
    }

    exitCover() {
        this.state = PLAYER_STATE.IDLE;
        this.inCover = false;
        this.coverSpot = null;
    }

    updateAiming() {
        if (this.controls.lockAim) {
            // Lock current aim direction
            return;
        }

        this.aimDirection = this.controls.getAimDirection(this.facingRight);
    }

    updateShooting() {
        if (this.controls.shoot && this.fireTimer === 0) {
            this.fire();
            this.fireTimer = this.weapon.fireRate;
        }
    }

    fire() {
        const angles = this.getAimAngles();

        if (this.weapon.spread > 1) {
            // Spread shot
            const spreadAngle = 15 * (Math.PI / 180);
            const count = this.weapon.spread;
            const startAngle = angles.angle - (spreadAngle * (count - 1) / 2);

            for (let i = 0; i < count; i++) {
                const angle = startAngle + spreadAngle * i;
                this.createBullet(angle);
            }
        } else {
            this.createBullet(angles.angle);
        }
    }

    createBullet(angle) {
        const gunX = this.x + this.width / 2;
        const gunY = this.y + (this.state === PLAYER_STATE.PRONE ? this.height / 2 : this.height / 3);

        // Offset the muzzle a bit out from the body in the aim direction
        const muzzleX = gunX + Math.cos(angle) * 10;
        const muzzleY = gunY + Math.sin(angle) * 10;
        if (typeof particles !== 'undefined') {
            particles.muzzleFlash(muzzleX, muzzleY, angle, this.weapon.color);
        }
        if (typeof audio !== 'undefined') {
            // Per-weapon SFX timbre
            if      (this.weapon === WEAPON.SPREAD)         audio.sfxShootSpread();
            else if (this.weapon === WEAPON.LASER)          audio.sfxShootLaser();
            else if (this.weapon === WEAPON.FLAME)          audio.sfxShootFlame();
            else if (this.weapon === WEAPON.STAPLE_REMOVER) audio.sfxShootHeavy();
            else if (this.weapon === WEAPON.HOMING)         audio.sfxShootHoming();
            else if (this.weapon === WEAPON.THUNDER)        audio.sfxShootThunder();
            else                                            audio.sfxShoot();
        }

        // Weapon-specific bullet properties
        const w = this.weapon;
        // Difficulty's playerDamageMul scales outgoing damage (HARD = 0.8).
        const dmgMul = (typeof game !== 'undefined' && game.difficulty)
            ? game.difficulty.playerDamageMul : 1;
        const bullet = {
            x: muzzleX,
            y: muzzleY,
            vx: Math.cos(angle) * w.bulletSpeed,
            vy: Math.sin(angle) * w.bulletSpeed,
            damage: w.damage * dmgMul,
            weaponName: w.name,         // for the per-run affinity badge
            color: w.color,
            piercing: w.piercing || false,
            life: 60,
            // Visual + behavioral tags
            kind: 'bullet',
            explosive: w.explosive || false
        };

        // Flame: short-range jet, random spread, fast-decaying particles trail
        if (w === WEAPON.FLAME) {
            const jitter = (Math.random() - 0.5) * 0.25;
            bullet.vx = Math.cos(angle + jitter) * w.bulletSpeed;
            bullet.vy = Math.sin(angle + jitter) * w.bulletSpeed;
            bullet.life = 14;          // Very short range
            bullet.kind = 'flame';
            bullet.size = 3 + Math.random() * 2;
        }
        // Laser: piercing thin beam-like
        else if (w === WEAPON.LASER) {
            bullet.kind = 'laser';
            bullet.life = 90;          // Long range
        }
        // Staple remover: heavy explosive shell
        else if (w === WEAPON.STAPLE_REMOVER) {
            bullet.kind = 'shell';
            bullet.life = 70;
            bullet.gravity = 0.08;     // Slight arc
        }
        // Spread: shorter range, slight variance
        else if (w === WEAPON.SPREAD) {
            bullet.kind = 'spread';
            bullet.life = 45;
        }
        // Homing: starts slow + curves toward nearest enemy each frame
        else if (w === WEAPON.HOMING) {
            bullet.kind = 'homing';
            bullet.life = 110;
            bullet.homing = true;
            bullet.turnRate = 0.12;
        }
        // Thunder: fast piercing-style shot that chains to nearby enemies
        else if (w === WEAPON.THUNDER) {
            bullet.kind = 'thunder';
            bullet.life = 70;
            bullet.chain = true;
            bullet.chainHits = 0;
            bullet.chainsLeft = 2;        // hits up to 1 initial + 2 chained
        }

        this.bullets.push(bullet);
    }

    getAimAngles() {
        const angles = {
            [AIM_DIR.RIGHT]: 0,
            [AIM_DIR.UP_RIGHT]: -Math.PI / 4,
            [AIM_DIR.UP]: -Math.PI / 2,
            [AIM_DIR.UP_LEFT]: -3 * Math.PI / 4,
            [AIM_DIR.LEFT]: Math.PI,
            [AIM_DIR.DOWN_LEFT]: 3 * Math.PI / 4,
            [AIM_DIR.DOWN]: Math.PI / 2,
            [AIM_DIR.DOWN_RIGHT]: Math.PI / 4
        };

        return { angle: angles[this.aimDirection] };
    }

    detonateBullet(bullet) {
        if (typeof particles === 'undefined') return;
        if (bullet.explosive) {
            particles.explosion(bullet.x, bullet.y);
            if (typeof audio !== 'undefined') audio.sfxExplosion();
            if (typeof game !== 'undefined' && game.shake) game.shake(3, 6);
            // Area-of-effect damage: enemies within 28px get hit
            if (typeof game !== 'undefined' && game.enemies) {
                for (const e of game.enemies.enemies) {
                    if (!e.active) continue;
                    const dx = (e.x + e.width / 2) - bullet.x;
                    const dy = (e.y + e.height / 2) - bullet.y;
                    if (dx * dx + dy * dy < 28 * 28) {
                        e.takeDamage(bullet.damage);
                    }
                }
            }
        } else {
            particles.bulletImpact(bullet.x, bullet.y, bullet.color);
        }
    }

    updateBullets(level) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];

            // Homing: steer toward the nearest active enemy each frame
            if (bullet.homing && typeof game !== 'undefined' && game.enemies) {
                let best = null, bestDist = 1e9;
                for (const e of game.enemies.enemies) {
                    if (!e.active || e.dying) continue;
                    const dx = (e.x + e.width / 2) - bullet.x;
                    const dy = (e.y + e.height / 2) - bullet.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestDist) { bestDist = d2; best = e; }
                }
                if (best && bestDist < 200 * 200) {
                    const dx = (best.x + best.width / 2) - bullet.x;
                    const dy = (best.y + best.height / 2) - bullet.y;
                    const desired = Math.atan2(dy, dx);
                    const current = Math.atan2(bullet.vy, bullet.vx);
                    // Shortest-angle blend
                    let diff = desired - current;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    const newAng = current + diff * (bullet.turnRate || 0.1);
                    const speed = Math.hypot(bullet.vx, bullet.vy);
                    bullet.vx = Math.cos(newAng) * speed;
                    bullet.vy = Math.sin(newAng) * speed;
                }
            }

            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            if (bullet.gravity) bullet.vy += bullet.gravity;
            bullet.life--;

            // Trail for homing
            if (bullet.kind === 'homing' && typeof particles !== 'undefined' && Math.random() < 0.7) {
                particles.spawn({
                    x: bullet.x, y: bullet.y,
                    vx: 0, vy: 0,
                    life: 8, size: 1,
                    colors: ['#80ff60', '#208a30', '#0a3a14']
                });
            }
            // Crackle for thunder
            if (bullet.kind === 'thunder' && typeof particles !== 'undefined' && Math.random() < 0.5) {
                particles.spawn({
                    x: bullet.x + (Math.random() - 0.5) * 4,
                    y: bullet.y + (Math.random() - 0.5) * 4,
                    vx: 0, vy: 0,
                    life: 5, size: 1,
                    colors: ['#ffffff', '#80c0ff', '#3a78b8']
                });
            }

            // Trail particles for flame
            if (bullet.kind === 'flame' && typeof particles !== 'undefined' && Math.random() < 0.6) {
                particles.spawn({
                    x: bullet.x, y: bullet.y,
                    vx: bullet.vx * 0.2 + (Math.random() - 0.5) * 0.4,
                    vy: bullet.vy * 0.2 + (Math.random() - 0.5) * 0.4 - 0.2,
                    life: 6 + Math.floor(Math.random() * 4),
                    size: 1 + Math.floor(Math.random() * 2),
                    colors: ['#ffffff', '#ffe070', '#ff8030', '#a82020', '#3a0808']
                });
            }
            // Sparkle trail for laser
            if (bullet.kind === 'laser' && typeof particles !== 'undefined' && Math.random() < 0.5) {
                particles.spawn({
                    x: bullet.x - bullet.vx * 0.5, y: bullet.y - bullet.vy * 0.5,
                    vx: 0, vy: 0, life: 5, size: 1,
                    colors: ['#ffffff', '#ff60ff', '#a040c0']
                });
            }

            // Remove if off screen or expired
            if (bullet.life <= 0 ||
                bullet.x < 0 || bullet.x > level.width * GAME.TILE_SIZE ||
                bullet.y < 0 || bullet.y > level.height * GAME.TILE_SIZE) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Check tile collision
            if (!bullet.piercing && level.isSolid(bullet.x, bullet.y)) {
                this.detonateBullet(bullet);
                this.bullets.splice(i, 1);
            }
        }
    }

    // True if there's `delta` pixels of clear space directly above the player -
    // used to gate prone/crouch exits so we don't pop through ceilings.
    hasHeadroom(level, delta) {
        const top = this.y - delta;
        return !level.isSolid(this.x + 2, top)
            && !level.isSolid(this.x + this.width - 2, top);
    }

    moveAndCollide(level) {
        // Reset wall touching
        this.touchingWallLeft = false;
        this.touchingWallRight = false;

        // Horizontal movement
        this.x += this.vx;

        // Horizontal collision
        if (this.vx > 0) {
            // Moving right
            if (level.isSolid(this.x + this.width, this.y) ||
                level.isSolid(this.x + this.width, this.y + this.height - 1)) {
                this.x = Math.floor((this.x + this.width) / GAME.TILE_SIZE) * GAME.TILE_SIZE - this.width;
                this.vx = 0;
                this.touchingWallRight = true;
            }
        } else if (this.vx < 0) {
            // Moving left
            if (level.isSolid(this.x, this.y) ||
                level.isSolid(this.x, this.y + this.height - 1)) {
                this.x = Math.floor(this.x / GAME.TILE_SIZE) * GAME.TILE_SIZE + GAME.TILE_SIZE;
                this.vx = 0;
                this.touchingWallLeft = true;
            }
        }

        // Vertical movement
        this.y += this.vy;
        const wasOnGround = this.onGround;
        const prevVy = this.vy;
        this.onGround = false;

        // Vertical collision
        if (this.vy > 0) {
            // Falling
            if (level.isSolid(this.x + 2, this.y + this.height) ||
                level.isSolid(this.x + this.width - 2, this.y + this.height) ||
                level.isPlatform(this.x + 2, this.y + this.height) ||
                level.isPlatform(this.x + this.width - 2, this.y + this.height)) {
                this.y = Math.floor((this.y + this.height) / GAME.TILE_SIZE) * GAME.TILE_SIZE - this.height;
                this.vy = 0;
                this.onGround = true;
                // Landing dust kick if we hit ground with significant downward velocity
                if (!wasOnGround && prevVy > 3 && typeof particles !== 'undefined') {
                    particles.landDust(this.x + this.width / 2, this.y + this.height);
                }
            }
        } else if (this.vy < 0) {
            // Jumping up
            if (level.isSolid(this.x + 2, this.y) ||
                level.isSolid(this.x + this.width - 2, this.y)) {
                this.y = Math.floor(this.y / GAME.TILE_SIZE) * GAME.TILE_SIZE + GAME.TILE_SIZE;
                this.vy = 0;
            }
        }
    }

    updateHealthRegen() {
        this.timeSinceDamage++;

        if (this.timeSinceDamage >= PLAYER.HEALTH_REGEN_DELAY && this.health < this.maxHealth) {
            // Regen faster in cover; difficulty scales the base rate
            // (EASY = 1.5x, HARD = 0.5x).
            const diffMul = (typeof game !== 'undefined' && game.difficulty)
                ? game.difficulty.regenSpeed : 1;
            const regenRate = (this.inCover ? PLAYER.HEALTH_REGEN_RATE * 2 : PLAYER.HEALTH_REGEN_RATE) * diffMul;
            this.health = Math.min(this.maxHealth, this.health + regenRate);
        }
    }

    takeDamage(amount) {
        if (this.invincibilityTimer > 0 || this.inCover) return;

        // Apply difficulty modifier
        if (typeof game !== 'undefined' && game.difficulty) {
            amount = amount * game.difficulty.enemyDamageMul;
        }
        // Apply daily-challenge incoming-damage multiplier
        if (typeof game !== 'undefined' && game.dailyMode && game.dailyDamageMul) {
            amount = amount * game.dailyDamageMul;
        }
        this.health -= amount;
        this.timeSinceDamage = 0;
        this.invincibilityTimer = PLAYER.INVINCIBILITY_FRAMES;

        if (typeof audio !== 'undefined') audio.sfxHurt();
        if (typeof game !== 'undefined' && game.shake) game.shake(4, 8);

        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        if (this.state === PLAYER_STATE.DYING) return;
        this.state = PLAYER_STATE.DYING;
        this.deathTimer = 0;
        this.deathPhase = 0;
        if (typeof game !== 'undefined' && game.runDeaths !== undefined) game.runDeaths++;
        // Launch the body upward for a SNES death pop
        this.vx = 0;
        this.vy = -4;
        if (typeof audio !== 'undefined') audio.sfxExplosion();
        if (typeof particles !== 'undefined') {
            particles.explosion(this.x + this.width / 2, this.y + this.height / 2);
        }
        if (typeof game !== 'undefined' && game.shake) game.shake(8, 24);
    }

    updateDying(level) {
        this.deathTimer = (this.deathTimer || 0) + 1;
        // Phase progression: hit (0-20) -> explode (20-50) -> burning (50+)
        if (this.deathTimer < 20) this.deathPhase = 0;
        else if (this.deathTimer < 50) this.deathPhase = 1;
        else this.deathPhase = 2;
        // Brief upward arc then fall
        this.vy += GAME.GRAVITY * 0.7;
        this.y += this.vy;
        // Stop at ground
        if (level.isSolid(this.x + this.width / 2, this.y + this.height)) {
            this.y = Math.floor((this.y + this.height) / GAME.TILE_SIZE) * GAME.TILE_SIZE - this.height;
            this.vy = 0;
        }
        // Burst extra particles at explosion phase
        if (this.deathTimer === 20 && typeof particles !== 'undefined') {
            particles.explosion(this.x + this.width / 2, this.y + this.height / 2);
        }
        // Embers while burning
        if (this.deathPhase === 2 && this.deathTimer % 4 === 0 && typeof particles !== 'undefined') {
            particles.spawn({
                x: this.x + this.width / 2 + (Math.random() - 0.5) * 8,
                y: this.y + this.height - Math.random() * 8,
                vx: (Math.random() - 0.5) * 0.6,
                vy: -0.4 - Math.random() * 0.6,
                gravity: -0.02,
                life: 14,
                size: 1,
                colors: ['#ffe070', '#ff8030', '#a82020', '#3a0808']
            });
        }
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // Flash when invincible
        if (this.invincibilityTimer > 0 && Math.floor(this.invincibilityTimer / 4) % 2 === 0) {
            return;
        }

        // Get the animation frame (use this.animFrame which is updated in update())
        const animFrame = this.animFrame;

        // Draw Clippy using the unified sprite system
        // Will use PNG sprites if loaded, otherwise falls back to procedural
        // Player hitbox is 16x32, sprites are 48x48
        // Center sprite horizontally on hitbox, align bottom
        const spriteOffsetX = -16; // (48 - 16) / 2 = 16px offset to center
        const spriteOffsetY = -16; // 48 - 32 = 16px offset to align feet

        // Apply skin filter (PNG sprite) or palette (procedural fallback)
        let skin = null;
        if (typeof game !== 'undefined' && game.skinId && typeof getSkinById === 'function') {
            skin = getSkinById(game.skinId);
        }
        const usingPng = (typeof spriteAtlas !== 'undefined') &&
            spriteAtlas.frames.has(proceduralSprites.getClippyFrameName(this.state, animFrame, this.deathPhase || 0));
        if (skin && skin.filter && usingPng) {
            ctx.save();
            ctx.filter = skin.filter;
        }
        proceduralSprites.drawClippy(
            ctx,
            screenX + spriteOffsetX,
            screenY + spriteOffsetY,
            this.state,
            animFrame,
            this.facingRight,
            this.deathPhase || 0,
            (!usingPng && skin) ? skin.palette : null
        );
        if (skin && skin.filter && usingPng) {
            ctx.restore();
        }

        // Bullets - each weapon has a distinct look
        this.bullets.forEach(bullet => {
            const bx = Math.floor(bullet.x - camera.x);
            const by = Math.floor(bullet.y - camera.y);
            switch (bullet.kind) {
                case 'flame': {
                    // Big flickering puff with white-hot center
                    const r = Math.floor(bullet.size || 3);
                    ctx.fillStyle = '#a82020';
                    ctx.fillRect(bx - r - 1, by - r, r * 2 + 2, r * 2);
                    ctx.fillStyle = '#ff8030';
                    ctx.fillRect(bx - r, by - r + 1, r * 2, r * 2 - 2);
                    ctx.fillStyle = '#ffe070';
                    ctx.fillRect(bx - r + 1, by - r + 2, r * 2 - 2, r * 2 - 4);
                    ctx.fillStyle = '#fff5c0';
                    ctx.fillRect(bx - 1, by, 2, 1);
                    break;
                }
                case 'laser': {
                    // Long thin beam-like projectile
                    const len = 8;
                    const dx = Math.sign(bullet.vx);
                    const dy = Math.sign(bullet.vy);
                    if (Math.abs(bullet.vx) > Math.abs(bullet.vy)) {
                        ctx.fillStyle = '#ff60ff';
                        ctx.fillRect(bx - len * dx, by - 1, len * dx > 0 ? len : -len, 2);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(bx - 2 * dx, by, 4, 1);
                        ctx.fillStyle = '#ffa0ff';
                        ctx.fillRect(bx - (len - 1) * dx, by, len * dx > 0 ? len - 1 : -(len - 1), 1);
                    } else {
                        ctx.fillStyle = '#ff60ff';
                        ctx.fillRect(bx - 1, by - len * dy, 2, len * dy > 0 ? len : -len);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(bx, by - 2 * dy, 1, 4);
                    }
                    break;
                }
                case 'shell': {
                    // Heavy explosive shell - round with rivet
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(bx - 3, by - 2, 6, 4);
                    ctx.fillStyle = '#a08068';
                    ctx.fillRect(bx - 3, by - 2, 6, 1);
                    ctx.fillStyle = '#605040';
                    ctx.fillRect(bx - 2, by - 1, 4, 2);
                    ctx.fillStyle = '#ffe070';
                    ctx.fillRect(bx - 1, by, 1, 1);
                    // Spark behind
                    ctx.fillStyle = '#ff8030';
                    const tx = Math.sign(bullet.vx) * 4;
                    ctx.fillRect(bx - 3 - tx, by, 2, 1);
                    break;
                }
                case 'spread': {
                    // Slightly shorter, brighter
                    ctx.fillStyle = bullet.color;
                    ctx.globalAlpha = 0.35;
                    ctx.fillRect(bx - 3, by - 1, 3, 2);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = bullet.color;
                    ctx.fillRect(bx - 2, by - 1, 3, 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(bx - 1, by, 1, 1);
                    break;
                }
                case 'homing': {
                    // Green-tinted seeker missile with cross fins
                    ctx.fillStyle = '#0a3a14';
                    ctx.fillRect(bx - 3, by - 2, 6, 4);
                    ctx.fillStyle = '#208a30';
                    ctx.fillRect(bx - 2, by - 1, 4, 2);
                    ctx.fillStyle = '#80ff60';
                    ctx.fillRect(bx - 1, by, 2, 1);
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(bx, by, 1, 1);
                    // Fin trail
                    ctx.fillStyle = '#80ff60';
                    const tx = -Math.sign(bullet.vx) * 2;
                    ctx.fillRect(bx + tx, by - 1, 1, 1);
                    ctx.fillRect(bx + tx, by + 1, 1, 1);
                    break;
                }
                case 'thunder': {
                    // Cyan zigzag bolt
                    ctx.fillStyle = '#80c0ff';
                    const dirX = Math.sign(bullet.vx) || 1;
                    for (let s = -3; s <= 3; s++) {
                        const off = (s & 1) ? 1 : -1;
                        ctx.fillRect(bx + s * dirX, by + off, 1, 1);
                    }
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(bx, by, 1, 1);
                    // Outer flicker
                    if ((bullet.life & 1) === 0) {
                        ctx.fillStyle = '#3a78b8';
                        ctx.fillRect(bx - 4, by, 1, 1);
                        ctx.fillRect(bx + 4, by, 1, 1);
                    }
                    break;
                }
                default: {
                    // Machine gun bullet (with trail)
                    ctx.fillStyle = bullet.color;
                    ctx.globalAlpha = 0.35;
                    const tx = Math.sign(bullet.vx) * 4;
                    const ty = Math.sign(bullet.vy) * 2;
                    ctx.fillRect(bx - 2 - tx, by - 1 - ty, 4, 2);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = bullet.color;
                    ctx.fillRect(bx - 2, by - 1, 4, 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(bx - 1, by, 2, 1);
                }
            }
        });
    }
}

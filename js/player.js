// ============================================
// PLAYER CLASS - Clippy with all mechanics
// ============================================

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;

        this.width = PLAYER.WIDTH;
        this.height = PLAYER.HEIGHT;

        this.state = PLAYER_STATE.IDLE;
        this.facingRight = true;
        this.aimDirection = AIM_DIR.RIGHT;

        // Health system (Halo-style regen)
        this.health = PLAYER.MAX_HEALTH;
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

        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
    }

    update(level) {
        input.update();

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
        const move = input.getMovement();

        // Prone double-tap detection
        if (input.downPressed) {
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
            // Exit prone
            if (!input.down || input.jumpPressed) {
                this.state = PLAYER_STATE.IDLE;
                this.height = PLAYER.HEIGHT;
                this.y -= PLAYER.HEIGHT - PLAYER.PRONE_HEIGHT;
            } else {
                // Can still shoot and aim while prone
                this.updateAiming();
                this.updateShooting();
                return;
            }
        }

        // Crouching
        if (input.down && this.onGround && this.state !== PLAYER_STATE.PRONE) {
            this.state = PLAYER_STATE.CROUCHING;
            this.height = PLAYER.CROUCH_HEIGHT;
        } else if (this.state === PLAYER_STATE.CROUCHING && !input.down) {
            this.state = PLAYER_STATE.IDLE;
            this.height = PLAYER.HEIGHT;
            this.y -= PLAYER.HEIGHT - PLAYER.CROUCH_HEIGHT;
        }

        // Horizontal movement
        if (!input.lockAim) {
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
        if (input.jumpPressed) {
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
                this.state = PLAYER_STATE.JUMPING;
            } else if (this.touchingWallLeft || this.touchingWallRight) {
                // Wall jump (Earthworm Jim style)
                if (this.wallJumpCooldown === 0) {
                    this.vy = PLAYER.WALL_JUMP_Y;
                    this.vx = this.touchingWallLeft ? PLAYER.WALL_JUMP_X : -PLAYER.WALL_JUMP_X;
                    this.facingRight = this.touchingWallLeft;
                    this.wallJumpCooldown = 10;
                    this.jumpBufferTime = 0;
                    this.state = PLAYER_STATE.JUMPING;
                }
            } else if (this.canDoubleJump) {
                // Double jump
                this.vy = PLAYER.DOUBLE_JUMP_FORCE;
                this.canDoubleJump = false;
                this.jumpBufferTime = 0;
                this.state = PLAYER_STATE.JUMPING;
            }
        }

        // Variable jump height (release early = shorter jump)
        if (!input.jump && this.vy < 0) {
            this.vy *= 0.5;
        }

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
        if (input.cover) {
            const coverSpot = level.getCoverSpotAt(this.x + this.width / 2, this.y + this.height / 2);
            if (coverSpot) {
                this.enterCover(coverSpot);
            }
        }

        // Check for ladders/vines
        if (input.up || input.down) {
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

    updateClimbing(level) {
        const move = input.getMovement();

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
        if (input.jumpPressed) {
            this.state = PLAYER_STATE.JUMPING;
            this.onLadder = false;
            this.vy = PLAYER.JUMP_FORCE * 0.7;
            if (input.left) this.vx = -PLAYER.RUN_SPEED;
            if (input.right) this.vx = PLAYER.RUN_SPEED;
        }

        // Can still shoot while climbing
        this.updateAiming();
        this.updateShooting();
    }

    updateCover(level) {
        // Health regenerates faster in cover
        this.timeSinceDamage = PLAYER.HEALTH_REGEN_DELAY; // Instant regen in cover

        // Peek out and shoot
        if (input.left || input.right) {
            this.facingRight = input.right;
            this.updateAiming();
            this.updateShooting();
        }

        // Exit cover
        if (input.cover || input.jumpPressed) {
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
        if (input.lockAim) {
            // Lock current aim direction
            return;
        }

        this.aimDirection = input.getAimDirection(this.facingRight);
    }

    updateShooting() {
        if (input.shoot && this.fireTimer === 0) {
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
        if (typeof audio !== 'undefined') audio.sfxShoot();

        this.bullets.push({
            x: muzzleX,
            y: muzzleY,
            vx: Math.cos(angle) * this.weapon.bulletSpeed,
            vy: Math.sin(angle) * this.weapon.bulletSpeed,
            damage: this.weapon.damage,
            color: this.weapon.color,
            piercing: this.weapon.piercing || false,
            life: 60
        });
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

    updateBullets(level) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];

            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life--;

            // Remove if off screen or expired
            if (bullet.life <= 0 ||
                bullet.x < 0 || bullet.x > level.width * GAME.TILE_SIZE ||
                bullet.y < 0 || bullet.y > level.height * GAME.TILE_SIZE) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Check tile collision
            if (!bullet.piercing && level.isSolid(bullet.x, bullet.y)) {
                if (typeof particles !== 'undefined') {
                    particles.bulletImpact(bullet.x, bullet.y, bullet.color);
                }
                this.bullets.splice(i, 1);
            }
        }
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

        if (this.timeSinceDamage >= PLAYER.HEALTH_REGEN_DELAY && this.health < PLAYER.MAX_HEALTH) {
            // Regen faster in cover
            const regenRate = this.inCover ? PLAYER.HEALTH_REGEN_RATE * 2 : PLAYER.HEALTH_REGEN_RATE;
            this.health = Math.min(PLAYER.MAX_HEALTH, this.health + regenRate);
        }
    }

    takeDamage(amount) {
        if (this.invincibilityTimer > 0 || this.inCover) return;

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

        proceduralSprites.drawClippy(
            ctx,
            screenX + spriteOffsetX,
            screenY + spriteOffsetY,
            this.state,
            animFrame,
            this.facingRight,
            this.deathPhase || 0
        );

        // Bullets with glow trail
        this.bullets.forEach(bullet => {
            const bx = Math.floor(bullet.x - camera.x);
            const by = Math.floor(bullet.y - camera.y);
            // Faint trail behind
            ctx.fillStyle = bullet.color;
            ctx.globalAlpha = 0.35;
            const tx = Math.sign(bullet.vx) * 4;
            const ty = Math.sign(bullet.vy) * 2;
            ctx.fillRect(bx - 2 - tx, by - 1 - ty, 4, 2);
            ctx.globalAlpha = 1;
            // Bullet core
            ctx.fillStyle = bullet.color;
            ctx.fillRect(bx - 2, by - 1, 4, 2);
            // Hot center
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bx - 1, by, 2, 1);
        });
    }
}

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

        // Behavior-specific
        this.behaviorTimer = 0;
        this.sineOffset = Math.random() * Math.PI * 2;
        this.bounceVy = -5;
    }

    update(level, player) {
        if (!this.active) return;

        this.behaviorTimer++;

        // Face player
        this.facingRight = player.x > this.x;

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
        }

        // Update projectiles
        this.updateBullets(level);

        // Fire timer
        if (this.fireTimer > 0) this.fireTimer--;
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
            this.vy = this.bounceVy;
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
        // File cabinet - opens drawers to attack
        if (this.behaviorTimer % 90 === 0) {
            // Fire from multiple drawers
            for (let i = 0; i < 3; i++) {
                const bullet = {
                    x: this.facingRight ? this.x + this.width : this.x,
                    y: this.y + 10 + i * 14,
                    vx: (this.facingRight ? 1 : -1) * 3,
                    vy: 0,
                    damage: this.damage,
                    life: 120,
                    type: 'drawer'
                };
                this.bullets.push(bullet);
            }
        }
    }

    fireAtPlayer(player, projectileType = null) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const speed = 3;
        const bullet = {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
            vx: (dx / dist) * speed,
            vy: (dy / dist) * speed,
            damage: this.damage,
            life: 120,
            type: projectileType || this.type.projectile
        };

        this.bullets.push(bullet);
    }

    updateBullets(level) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life--;

            if (bullet.life <= 0 || level.isSolid(bullet.x, bullet.y)) {
                this.bullets.splice(i, 1);
            }
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        this.active = false;
        // Spawn death particles, etc.
    }

    draw(ctx, camera) {
        if (!this.active) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        // Draw using pixel sprites based on enemy type
        let sprite, palette;
        switch (this.behavior) {
            case 'hop':
                sprite = ENEMY_SPRITES.stapler;
                palette = STAPLER_PALETTE;
                break;
            case 'fly_sine':
                sprite = ENEMY_SPRITES.folder;
                palette = FOLDER_PALETTE;
                break;
            case 'bounce':
                sprite = ENEMY_SPRITES.rubberBall;
                palette = RUBBER_BALL_PALETTE;
                break;
            case 'stationary':
                sprite = ENEMY_SPRITES.stapler; // Reuse stapler for tape dispenser
                palette = STAPLER_PALETTE;
                break;
            case 'miniboss':
                this.drawFileCabinet(ctx, screenX, screenY);
                sprite = null;
                break;
            default:
                sprite = ENEMY_SPRITES.stapler;
                palette = STAPLER_PALETTE;
        }

        if (sprite) {
            spriteRenderer.drawSprite(ctx, screenX, screenY, sprite, palette, !this.facingRight);
        }

        // Draw enemy bullets as pixel projectiles
        this.bullets.forEach(bullet => {
            const bx = Math.floor(bullet.x - camera.x);
            const by = Math.floor(bullet.y - camera.y);
            ctx.fillStyle = this.getBulletColor(bullet.type);
            ctx.fillRect(bx - 2, by - 1, 4, 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(bx - 1, by, 2, 1);
        });

        // Health bar for minibosses
        if (this.behavior === 'miniboss') {
            ctx.fillStyle = '#300';
            ctx.fillRect(screenX, screenY - 8, this.width, 4);
            ctx.fillStyle = '#f00';
            ctx.fillRect(screenX, screenY - 8, this.width * (this.health / this.maxHealth), 4);
        }
    }

    getBulletColor(type) {
        switch (type) {
            case 'staple': return '#888';
            case 'paperclip': return '#ccc';
            case 'tape': return '#ffc';
            case 'drawer': return '#654';
            default: return '#f00';
        }
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
        return this.active &&
               this.x < player.x + player.width &&
               this.x + this.width > player.x &&
               this.y < player.y + player.height &&
               this.y + this.height > player.y;
    }

    // Check bullet collision with player
    checkBulletCollision(player) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
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
            this.enemies.push(new Enemy(x, y, type));
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
                    enemy.takeDamage(bullet.damage);
                    if (!bullet.piercing) {
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

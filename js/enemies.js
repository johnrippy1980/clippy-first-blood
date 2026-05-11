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
            if (bullet.gravity) bullet.vy += bullet.gravity;
            bullet.life--;

            if (bullet.life <= 0 || level.isSolid(bullet.x, bullet.y)) {
                if (typeof particles !== 'undefined' && level.isSolid(bullet.x, bullet.y)) {
                    particles.bulletImpact(bullet.x, bullet.y, '#a82020');
                }
                this.bullets.splice(i, 1);
            }
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        this.hitFlash = 5;  // White flash for 5 frames
        if (typeof particles !== 'undefined') {
            particles.hitSpark(this.x + this.width / 2, this.y + this.height / 2, '#ffd040');
        }
        if (typeof audio !== 'undefined') audio.sfxEnemyHit();
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        if (!this.active) return;
        this.active = false;
        if (typeof particles !== 'undefined') {
            particles.explosion(this.x + this.width / 2, this.y + this.height / 2);
            if (this.score > 0) {
                particles.scorePopup(this.x + this.width / 2, this.y, this.score);
            }
        }
        if (typeof audio !== 'undefined') audio.sfxExplosion();
        if (typeof game !== 'undefined') {
            if (game.shake) {
                game.shake(this.behavior === 'miniboss' ? 8 : 3, this.behavior === 'miniboss' ? 18 : 6);
            }
            if (this.score > 0) game.score += this.score;
        }
    }

    draw(ctx, camera) {
        if (!this.active) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        // Hit flash: invert palette briefly when damaged
        const flash = this.hitFlash > 0;

        ctx.save();
        // Flip horizontally if facing left
        if (!this.facingRight) {
            ctx.translate(screenX + this.width, screenY);
            ctx.scale(-1, 1);
            ctx.translate(-screenX, -screenY);
        }

        switch (this.behavior) {
            case 'hop':        this.drawStaplerSNES(ctx, screenX, screenY, flash); break;
            case 'fly_sine':   this.drawFolderSNES(ctx, screenX, screenY, flash); break;
            case 'bounce':     this.drawRubberBallSNES(ctx, screenX, screenY, flash); break;
            case 'stationary': this.drawTapeDispenserSNES(ctx, screenX, screenY, flash); break;
            case 'miniboss':   this.drawFileCabinetSNES(ctx, screenX, screenY, flash); break;
            default:           this.drawStaplerSNES(ctx, screenX, screenY, flash);
        }
        ctx.restore();

        // Enemy bullets with glow trail
        this.bullets.forEach(bullet => {
            const bx = Math.floor(bullet.x - camera.x);
            const by = Math.floor(bullet.y - camera.y);
            const col = this.getBulletColor(bullet.type);
            // Trail
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(bx - 4, by - 1, 4, 2);
            ctx.globalAlpha = 1;
            ctx.fillRect(bx - 2, by - 1, 4, 2);
            ctx.fillStyle = '#ffe0a0';
            ctx.fillRect(bx - 1, by, 2, 1);
        });

        // Boss health bar - SNES style with frame
        if (this.behavior === 'miniboss') {
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

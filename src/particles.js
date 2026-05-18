// Particle system. Ring buffer; particles age out automatically.

class Particle {
    constructor() { this.alive = false; }
    init(x, y, vx, vy, life, color, size = 1, gravity = 0, fade = true) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.color = color; this.size = size;
        this.gravity = gravity;
        this.fade = fade;
        this.alive = true;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.life--;
        if (this.life <= 0) this.alive = false;
    }
    draw(ctx, camera) {
        const dx = (this.x - camera.x) | 0;
        const dy = (this.y - camera.y) | 0;
        ctx.fillStyle = this.color;
        if (this.fade) {
            const a = this.life / this.maxLife;
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
        }
        ctx.fillRect(dx, dy, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

class FloatingText {
    constructor() { this.alive = false; }
    init(x, y, text, color, life = 40, vy = -0.6, scale = 1) {
        this.x = x; this.y = y;
        this.text = text; this.color = color;
        this.life = life; this.maxLife = life;
        this.vy = vy;
        this.scale = scale;
        this.alive = true;
    }
    update() {
        this.y += this.vy;
        this.vy *= 0.96;
        this.life--;
        if (this.life <= 0) this.alive = false;
    }
}

class ParticleSystem {
    constructor() {
        this.pool = Array.from({ length: 512 }, () => new Particle());
        this.next = 0;
        this.floats = Array.from({ length: 32 }, () => new FloatingText());
        this.nextFloat = 0;
    }

    _take() {
        for (let i = 0; i < this.pool.length; i++) {
            const p = this.pool[this.next];
            this.next = (this.next + 1) % this.pool.length;
            if (!p.alive) return p;
        }
        return this.pool[0]; // overwrite oldest if pool is exhausted
    }

    _takeFloat() {
        for (let i = 0; i < this.floats.length; i++) {
            const f = this.floats[this.nextFloat];
            this.nextFloat = (this.nextFloat + 1) % this.floats.length;
            if (!f.alive) return f;
        }
        return this.floats[0];
    }

    spawn(x, y, vx, vy, life, color, size = 1, gravity = 0, fade = true) {
        this._take().init(x, y, vx, vy, life, color, size, gravity, fade);
    }

    floatingText(x, y, text, color, life = 40, vy = -0.6, scale = 1) {
        this._takeFloat().init(x, y, text, color, life, vy, scale);
    }

    explosion(x, y, color = '#ff8050', count = 24) {
        for (let i = 0; i < count; i++) {
            const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
            const sp = 0.8 + Math.random() * 2;
            this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 25 + Math.random() * 15, color, 1 + (Math.random() < 0.3 ? 1 : 0), 0.1);
        }
        // Bright core flash
        for (let i = 0; i < 8; i++) {
            this.spawn(x, y, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 8, '#fff', 1, 0);
        }
    }

    hitSpark(x, y, color = '#fff') {
        for (let i = 0; i < 6; i++) {
            this.spawn(
                x, y,
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3,
                8 + Math.random() * 6,
                color, 1, 0
            );
        }
    }

    // Bigger impact for bullet→enemy contact: radial spark burst + bright flash + small smoke
    hitBurst(x, y, color = '#ffe070') {
        // 8 radial sparks
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
            const sp = 1.6 + Math.random() * 1.2;
            this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 6 + Math.random() * 4, color, 2, 0);
        }
        // 3-frame core flash
        for (let i = 0; i < 3; i++) {
            this.spawn(x, y, 0, 0, 3, '#fff', 3 - i, 0);
        }
        // Smoke puff
        for (let i = 0; i < 2; i++) {
            this.spawn(x, y, (Math.random() - 0.5) * 0.5, -0.3 - Math.random() * 0.3,
                       10 + Math.random() * 4, '#605060', 1, -0.04);
        }
    }

    // Per-weapon hit burst variant — selects a tailored particle pattern so
    // each weapon's impact reads visually distinct, on top of the existing
    // damage / knockback / DOT differences.
    weaponHitBurst(x, y, weapon, color) {
        switch (weapon) {
            case 'MG':
                // Tight 4-spark fan in the direction of fire — punchy, minimal
                for (let i = 0; i < 4; i++) {
                    const a = (Math.random() - 0.5) * Math.PI * 0.8;
                    const sp = 1.4 + Math.random() * 0.9;
                    this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 5 + Math.random() * 3, color, 2, 0);
                }
                this.spawn(x, y, 0, 0, 3, '#fff', 3, 0);
                break;
            case 'SPREAD':
                // Wide shotgun burst — 10 sparks in a full radial fan
                for (let i = 0; i < 10; i++) {
                    const a = (i / 10) * Math.PI * 2 + Math.random() * 0.2;
                    const sp = 1.8 + Math.random() * 1.4;
                    this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 7 + Math.random() * 4, color, 2, 0);
                }
                for (let i = 0; i < 2; i++) this.spawn(x, y, 0, 0, 3, '#fff', 3 - i, 0);
                break;
            case 'LASER':
                // Crisp cyan spark + bright core, no smoke — energy weapon
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    const sp = 2.2 + Math.random() * 0.6;
                    this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 4 + Math.random() * 3, '#7af0ff', 2, 0);
                }
                // Hot white core
                this.spawn(x, y, 0, 0, 4, '#fff', 4, 0);
                this.spawn(x, y, 0, 0, 3, '#fff', 3, 0);
                break;
            case 'FLAME':
                // Lingering ember puffs — drifts up like the flame itself
                for (let i = 0; i < 6; i++) {
                    this.spawn(
                        x + (Math.random() - 0.5) * 4,
                        y + (Math.random() - 0.5) * 4,
                        (Math.random() - 0.5) * 0.8,
                        -0.5 - Math.random() * 0.5,
                        12 + Math.random() * 6,
                        i < 3 ? '#ff5040' : '#ffe070', 2, -0.06
                    );
                }
                break;
            case 'HOMING':
                // Magenta pinwheel — sparks spiral outward
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    const sp = 1.6 + Math.random() * 0.8;
                    this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.4, 8 + Math.random() * 4, '#ff60ff', 2, -0.02);
                }
                this.spawn(x, y, 0, 0, 4, '#fff', 3, 0);
                break;
            case 'THUNDER':
                // Vertical strike — sparks rocket up + down from impact point
                for (let i = 0; i < 6; i++) {
                    this.spawn(x + (Math.random() - 0.5) * 2, y, (Math.random() - 0.5) * 0.6, -2 - Math.random() * 1.5, 8 + Math.random() * 4, '#fffac8', 2, 0);
                    this.spawn(x + (Math.random() - 0.5) * 2, y, (Math.random() - 0.5) * 0.6,  2 + Math.random() * 1.5, 8 + Math.random() * 4, '#fffac8', 2, 0);
                }
                for (let i = 0; i < 3; i++) this.spawn(x, y, 0, 0, 4, '#fff', 4 - i, 0);
                break;
            default:
                this.hitBurst(x, y, color);
        }
    }

    muzzleFlash(x, y, dx, dy, color = '#ffe070') {
        // Bright core sparkle
        for (let i = 0; i < 3; i++) {
            this.spawn(x, y, 0, 0, 3 + i, '#fff', 3 - i, 0);
        }
        // Forward cone of bright particles
        for (let i = 0; i < 8; i++) {
            const spread = 0.6;
            const vx = dx * (1.4 + Math.random() * 1.2) + (Math.random() - 0.5) * spread;
            const vy = dy * (1.4 + Math.random() * 1.2) + (Math.random() - 0.5) * spread;
            this.spawn(x, y, vx, vy, 5 + Math.random() * 4, color, 1 + (Math.random() < 0.5 ? 1 : 0), 0);
        }
        // Smoke trail puff
        for (let i = 0; i < 4; i++) {
            this.spawn(x, y, -dx * 0.4 + (Math.random() - 0.5) * 0.5, -dy * 0.4 + (Math.random() - 0.5) * 0.5,
                       14 + Math.random() * 4, '#605060', 1, -0.02);
        }
    }

    shellEject(x, y, dx) {
        // Brass casing ejecting sideways + falling
        this.spawn(
            x, y,
            -dx * 0.8 + (Math.random() - 0.5) * 0.3,
            -1.4 - Math.random() * 0.4,
            34, '#ffd040', 1, 0.18
        );
    }

    dust(x, y) {
        for (let i = 0; i < 6; i++) {
            this.spawn(
                x + (Math.random() - 0.5) * 6,
                y,
                (Math.random() - 0.5) * 1.2,
                -Math.random() * 0.8 - 0.2,
                14 + Math.random() * 6,
                '#a08070', 1, 0.05
            );
        }
    }

    blood(x, y, dir = 1) {
        for (let i = 0; i < 10; i++) {
            this.spawn(
                x, y,
                dir * (Math.random() * 1.4 + 0.4),
                (Math.random() - 0.5) * 2 - 0.5,
                20 + Math.random() * 8,
                Math.random() < 0.5 ? '#a01020' : '#601018',
                1, 0.15
            );
        }
    }

    update() {
        for (const p of this.pool) if (p.alive) p.update();
        for (const f of this.floats) if (f.alive) f.update();
    }

    draw(ctx, camera) {
        for (const p of this.pool) if (p.alive) p.draw(ctx, camera);
    }

    drawFloats(ctx, camera, drawText) {
        for (const f of this.floats) {
            if (!f.alive) continue;
            const dx = Math.round(f.x - camera.x);
            const dy = Math.round(f.y - camera.y);
            const a = f.life / f.maxLife;
            // Bouncy intro: scale up over first ~6 frames then settle
            const age = f.maxLife - f.life;
            const intro = Math.min(1, age / 6);
            const bounce = 1 + Math.sin(intro * Math.PI) * 0.4;
            const baseScale = (f.scale || 1) * (intro < 1 ? bounce : 1);
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
            drawText(ctx, f.text, dx, dy, f.color, Math.round(baseScale), 'center');
            ctx.globalAlpha = 1;
        }
    }
}

export const particles = new ParticleSystem();

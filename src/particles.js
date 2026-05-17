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
    init(x, y, text, color, life = 40, vy = -0.6) {
        this.x = x; this.y = y;
        this.text = text; this.color = color;
        this.life = life; this.maxLife = life;
        this.vy = vy;
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

    floatingText(x, y, text, color, life = 40, vy = -0.6) {
        this._takeFloat().init(x, y, text, color, life, vy);
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

    muzzleFlash(x, y, dx, dy, color = '#ffe070') {
        for (let i = 0; i < 4; i++) {
            this.spawn(
                x, y,
                dx * (1 + Math.random()) + (Math.random() - 0.5) * 0.4,
                dy * (1 + Math.random()) + (Math.random() - 0.5) * 0.4,
                4 + Math.random() * 3,
                color, 1, 0
            );
        }
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
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
            drawText(ctx, f.text, dx, dy, f.color, 1, 'center');
            ctx.globalAlpha = 1;
        }
    }
}

export const particles = new ParticleSystem();

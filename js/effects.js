// ============================================
// EFFECTS - Particles, muzzle flash, hit sparks
// SNES-style: bright colors, brief lifetimes, no smoothing
// ============================================

class Particle {
    constructor(opts) {
        this.x = opts.x;
        this.y = opts.y;
        this.vx = opts.vx || 0;
        this.vy = opts.vy || 0;
        this.gravity = opts.gravity || 0;
        this.life = opts.life;
        this.maxLife = opts.life;
        this.colors = opts.colors;  // Array - older colors come first
        this.size = opts.size || 1;
        this.shape = opts.shape || 'square';  // 'square' | 'streak' | 'flash' | 'text'
        this.text = opts.text || null;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.life--;
    }

    draw(ctx, camera) {
        if (this.life <= 0) return;
        const t = 1 - this.life / this.maxLife;  // 0..1 over lifetime
        const idx = Math.min(this.colors.length - 1, Math.floor(t * this.colors.length));
        ctx.fillStyle = this.colors[idx];
        const sx = Math.floor(this.x - camera.x);
        const sy = Math.floor(this.y - camera.y);
        if (this.shape === 'text') {
            if (typeof drawPixelTextOutlined === 'function') {
                drawPixelTextOutlined(ctx, this.text, sx, sy, this.colors[idx], '#000', this.size, 'center', 1);
            }
            return;
        }
        if (this.shape === 'flash') {
            const r = Math.max(1, Math.floor(this.size * (1 - t * 0.5)));
            // Plus-shaped flash
            ctx.fillRect(sx - r, sy, r * 2 + 1, 1);
            ctx.fillRect(sx, sy - r, 1, r * 2 + 1);
            if (r > 1) {
                ctx.fillRect(sx - r + 1, sy - 1, r * 2 - 1, 1);
                ctx.fillRect(sx - r + 1, sy + 1, r * 2 - 1, 1);
                ctx.fillRect(sx - 1, sy - r + 1, 1, r * 2 - 1);
                ctx.fillRect(sx + 1, sy - r + 1, 1, r * 2 - 1);
            }
        } else if (this.shape === 'streak') {
            ctx.fillRect(sx, sy, this.size, 1);
        } else {
            ctx.fillRect(sx, sy, this.size, this.size);
        }
    }
}

class Particles {
    constructor() {
        this.list = [];
    }

    spawn(opts) {
        this.list.push(new Particle(opts));
    }

    // ---- preset effects ----

    muzzleFlash(x, y, angle, weaponColor) {
        // Big bright plus + 3 short sparks in shoot direction
        this.spawn({
            x, y, life: 4, size: 4, shape: 'flash',
            colors: ['#ffffff', '#ffeec0', weaponColor, '#a04020']
        });
        // Sparks along the shoot direction
        for (let i = 0; i < 4; i++) {
            const spread = (Math.random() - 0.5) * 0.4;
            const a = angle + spread;
            const speed = 2 + Math.random() * 2;
            this.spawn({
                x, y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                gravity: 0.08,
                life: 6 + Math.floor(Math.random() * 4),
                size: 2,
                shape: 'streak',
                colors: ['#ffffff', '#ffeec0', weaponColor, '#603020']
            });
        }
        // Smoke puff
        for (let i = 0; i < 3; i++) {
            const a = angle + (Math.random() - 0.5) * 1.5;
            const speed = 0.5 + Math.random();
            this.spawn({
                x, y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed - 0.3,
                life: 12 + Math.floor(Math.random() * 6),
                size: 2,
                colors: ['#888090', '#5a5060', '#2a2030']
            });
        }
    }

    hitSpark(x, y, color) {
        // Burst of bright sparks
        this.spawn({
            x, y, life: 5, size: 3, shape: 'flash',
            colors: ['#ffffff', '#ffeec0', color || '#ffd040']
        });
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 1.5 + Math.random() * 1.5;
            this.spawn({
                x, y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                gravity: 0.15,
                life: 8 + Math.floor(Math.random() * 6),
                size: 1,
                colors: ['#ffffff', '#ffeec0', '#ffa040', '#603020']
            });
        }
    }

    bulletImpact(x, y, color) {
        // Quick dust puff when bullet hits a wall
        for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
            const speed = 0.8 + Math.random();
            this.spawn({
                x, y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                gravity: 0.1,
                life: 10,
                size: 1,
                colors: ['#ffe070', '#a06030', '#5a3018']
            });
        }
    }

    explosion(x, y) {
        // Large boss-death style burst
        this.spawn({
            x, y, life: 10, size: 6, shape: 'flash',
            colors: ['#ffffff', '#ffeec0', '#ff8038', '#a82030', '#3a0a0a']
        });
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
            const speed = 1 + Math.random() * 3;
            this.spawn({
                x, y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                gravity: 0.1,
                life: 15 + Math.floor(Math.random() * 10),
                size: 2,
                colors: ['#ffffff', '#ffe070', '#ff8030', '#a8302a', '#2a0808']
            });
        }
    }

    landDust(x, y) {
        // Puffs on each side when player lands
        for (let side of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
                this.spawn({
                    x: x + side * 4, y,
                    vx: side * (0.5 + Math.random() * 0.8),
                    vy: -0.2 - Math.random() * 0.5,
                    gravity: 0.04,
                    life: 10 + Math.floor(Math.random() * 4),
                    size: 1,
                    colors: ['#e0c890', '#a08458', '#5a4030']
                });
            }
        }
    }

    scorePopup(x, y, score) {
        this.spawn({
            x, y, vx: 0, vy: -0.8, life: 36, size: 1,
            shape: 'text',
            text: '+' + score,
            colors: ['#ffe070', '#ffe070', '#ffa030', '#a87020']
        });
    }

    jumpPuff(x, y) {
        for (let i = 0; i < 4; i++) {
            const a = Math.PI - Math.PI / 4 + Math.random() * (Math.PI / 2);
            const speed = 0.5 + Math.random() * 0.8;
            this.spawn({
                x, y,
                vx: Math.cos(a) * speed,
                vy: -Math.abs(Math.sin(a) * speed) * 0.4,
                gravity: 0.05,
                life: 8,
                size: 1,
                colors: ['#d0b878', '#806038', '#3a2818']
            });
        }
    }

    update() {
        for (let i = this.list.length - 1; i >= 0; i--) {
            this.list[i].update();
            if (this.list[i].life <= 0) this.list.splice(i, 1);
        }
    }

    draw(ctx, camera) {
        for (const p of this.list) p.draw(ctx, camera);
    }

    clear() { this.list = []; }
}

// Global particles instance
const particles = new Particles();

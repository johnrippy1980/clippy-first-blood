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
        this.floor = null; // bounce floor, set by callers that need a floor collision
        this.alive = true;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        // Sub-particle pseudo-bounce: if a settling particle is marked with
        // a floor (set on spawn), reflect vy with damping when it crosses.
        // Only fires once per particle (this.floor cleared after bounce).
        if (this.floor != null && this.y >= this.floor && this.vy > 0) {
            this.y = this.floor;
            this.vy = -this.vy * 0.35;
            this.vx *= 0.6;
            // Tiny bounce only — second touch settles
            if (Math.abs(this.vy) < 0.4) {
                this.vy = 0;
                this.floor = null;
            }
        }
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

class ShockRing {
    constructor() { this.alive = false; }
    init(x, y, maxR, life, color, inward = false, follow = null) {
        this.x = x; this.y = y;
        this.maxR = maxR;
        this.life = life; this.maxLife = life;
        this.color = color;
        this.inward = inward;
        // Optional follow target — keep ring centered on a moving entity
        // (used by boss attack telegraphs so the ring tracks the wind-up).
        this.follow = follow;
        this.alive = true;
    }
    update() {
        if (this.follow && this.follow.alive !== false) {
            this.x = this.follow.x + (this.follow.w || 0) / 2;
            this.y = this.follow.y + (this.follow.h || 0) / 2;
        }
        this.life--;
        if (this.life <= 0) this.alive = false;
    }
    draw(ctx, camera) {
        const dx = (this.x - camera.x) | 0;
        const dy = (this.y - camera.y) | 0;
        const t = 1 - (this.life / this.maxLife);   // 0 → 1 over lifetime
        let r, a;
        if (this.inward) {
            // Contracting: starts at maxR, shrinks toward 0; ramps brightness
            // UP as it converges — signals "incoming impact at this point."
            r = Math.max(1, this.maxR * (1 - t));
            a = 0.35 + t * 0.55;
        } else {
            r = Math.max(1, this.maxR * t);
            a = (1 - t) * 0.85;
        }
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

class ParticleSystem {
    constructor() {
        this.pool = Array.from({ length: 512 }, () => new Particle());
        this.next = 0;
        this.floats = Array.from({ length: 32 }, () => new FloatingText());
        this.nextFloat = 0;
        this.rings = Array.from({ length: 16 }, () => new ShockRing());
        this.nextRing = 0;
    }

    _takeRing() {
        for (let i = 0; i < this.rings.length; i++) {
            const r = this.rings[this.nextRing];
            this.nextRing = (this.nextRing + 1) % this.rings.length;
            if (!r.alive) return r;
        }
        return this.rings[0];
    }

    // Outward-expanding shock ring — pairs with enemy death to sell the
    // impact beat. Tunable: maxR default 22, life default 14f (~233ms).
    shockRing(x, y, maxR = 22, life = 14, color = '#fff') {
        this._takeRing().init(x, y, maxR, life, color, false, null);
    }

    // Contracting telegraph ring — opposite direction. Used for boss attack
    // wind-up so the player gets a spatial "incoming" beat. Optional follow
    // target keeps the ring pinned to a moving entity.
    chargeRing(x, y, maxR, life, color, follow = null) {
        this._takeRing().init(x, y, maxR, life, color, true, follow);
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

    shellEject(x, y, dx, floorY = null) {
        // Brass casing ejecting sideways + falling. floorY (optional) makes
        // the shell bounce once when it hits, then settle in place — sells
        // the casing as a real object instead of fading into space.
        const p = this._take();
        p.init(
            x, y,
            -dx * 0.8 + (Math.random() - 0.5) * 0.3,
            -1.4 - Math.random() * 0.4,
            34, '#ffd040', 1, 0.18
        );
        if (floorY != null) p.floor = floorY;
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

    // Chunky death debris — heavier 2-wide squares with strong gravity that
    // arc outward and fall. Sits on top of explosion + dust ring to give the
    // grunt-death beat physical weight. Colors should match the enemy's body
    // palette (folder = manila, stapler = silver, cabinet = grey, etc.).
    gibChunks(x, y, palette = ['#806040', '#a08060', '#403028']) {
        for (let i = 0; i < 6; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; // upward fan
            const sp = 1.4 + Math.random() * 1.6;
            const color = palette[i % palette.length];
            this.spawn(
                x, y,
                Math.cos(a) * sp + (Math.random() - 0.5) * 0.6,
                Math.sin(a) * sp,
                34 + Math.random() * 16,
                color, 2, 0.18  // gravity strong → debris falls quickly
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
        for (const r of this.rings) if (r.alive) r.update();
    }

    draw(ctx, camera) {
        for (const p of this.pool) if (p.alive) p.draw(ctx, camera);
        for (const r of this.rings) if (r.alive) r.draw(ctx, camera);
    }

    drawFloats(ctx, camera, drawText, drawTextOutlined = null) {
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
            // Outline if the helper is available — float text reads against
            // painted bgs without it, since the color often clashes with the
            // bg tones (yellow damage numbers vs. jungle moonlight, etc).
            if (drawTextOutlined) {
                drawTextOutlined(ctx, f.text, dx, dy, f.color, '#000', Math.round(baseScale), 'center');
            } else {
                drawText(ctx, f.text, dx, dy, f.color, Math.round(baseScale), 'center');
            }
            ctx.globalAlpha = 1;
        }
    }
}

export const particles = new ParticleSystem();

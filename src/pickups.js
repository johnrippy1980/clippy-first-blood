import { WEAPON } from './constants.js';
import { audio } from './audio.js';
import { particles } from './particles.js';

// ----- Destructible crate. Sits in the world, takes shots, drops a pickup.
class Crate {
    constructor(x, y, drop) {
        this.x = x; this.y = y;
        this.w = 14; this.h = 14;
        this.hp = 3;
        this.alive = true;
        this.drop = drop;
        this.hitFlash = 0;
    }
    update(level, player) {
        if (this.hitFlash > 0) this.hitFlash--;
        // Check player bullets
        for (let i = player.bullets.length - 1; i >= 0; i--) {
            const b = player.bullets[i];
            if (b.stuck) continue; // Wall-stuck bullets are inert decoration
            if (b.x > this.x && b.x < this.x + this.w && b.y > this.y && b.y < this.y + this.h) {
                this.hp -= b.damage;
                this.hitFlash = 4;
                particles.hitSpark(b.x, b.y, '#a07050');
                if (!b.piercing) player.bullets.splice(i, 1);
                if (this.hp <= 0) {
                    this.alive = false;
                    particles.explosion(this.x + this.w / 2, this.y + this.h / 2, '#604030', 12);
                    audio.sfx('explode');
                    return this.drop;
                }
                // Per-hit wood thunk so the player feels hits land before the
                // crate breaks. Final hit is punctuated by 'explode' above.
                audio.sfx('crateHit');
            }
        }
        return null;
    }
    draw(ctx, camera) {
        const dx = Math.round(this.x - camera.viewX);
        const dy = Math.round(this.y - camera.viewY);
        if (this.hitFlash > 0) {
            // Bright flash + inner shrink. Single-frame full-white was hard to
            // read at 60fps; expanding alpha + colored fringe pulses through
            // the 4-frame hitFlash window.
            const t = this.hitFlash / 4;
            ctx.fillStyle = '#fff';
            ctx.fillRect(dx, dy, this.w, this.h);
            ctx.fillStyle = '#ffe070';
            const inset = Math.floor(t * 2);
            ctx.fillRect(dx + inset, dy + inset, this.w - inset * 2, this.h - inset * 2);
            return;
        }
        // Wood crate
        ctx.fillStyle = '#3a2418'; ctx.fillRect(dx, dy, this.w, this.h);
        ctx.fillStyle = '#5a3820'; ctx.fillRect(dx + 1, dy + 1, this.w - 2, this.h - 2);
        ctx.fillStyle = '#3a2418';
        // X pattern
        for (let i = 0; i < this.w; i++) {
            ctx.fillRect(dx + i, dy + i * (this.h / this.w) | 0, 1, 1);
            ctx.fillRect(dx + this.w - 1 - i, dy + i * (this.h / this.w) | 0, 1, 1);
        }
        // Border
        ctx.fillStyle = '#1a0a08';
        ctx.fillRect(dx, dy, this.w, 1);
        ctx.fillRect(dx, dy + this.h - 1, this.w, 1);
        ctx.fillRect(dx, dy, 1, this.h);
        ctx.fillRect(dx + this.w - 1, dy, 1, this.h);
    }
}

class Pickup {
    constructor(x, y, type) {
        this.x = x; this.y = y;
        this.w = 12; this.h = 12;
        this.type = type;
        this.alive = true;
        this.bob = Math.random() * Math.PI * 2;
        this.vy = -1.5;
    }
    update(level, player) {
        this.bob += 0.1;
        if (this.vy < 1.5) this.vy += 0.06;
        this.y += this.vy * 0.5;
        // Stop on ground
        if (level.isSolid(this.x + this.w / 2, this.y + this.h + 1)) {
            this.vy = 0;
        }
        // Magnet: tight always-on pull within 28px so brushing past a pickup
        // grabs it instead of needing a pixel-perfect touch. Stronger long-
        // range pull (64px) only kicks in at low HP as an emergency assist.
        const dx = (player.x + player.w / 2) - (this.x + this.w / 2);
        const dy = (player.y + player.h / 2) - (this.y + this.h / 2);
        const d = Math.hypot(dx, dy);
        if (d > 0.1) {
            let pull = 0;
            if (d < 28) {
                pull = 0.7 + (1 - d / 28) * 0.9;
            } else if (player.hp <= 1 && d < 64) {
                pull = 1.0;
            }
            if (pull > 0 && !this._attracting) {
                this._attracting = true;
                audio.sfx('attract');
            }
            if (pull > 0) {
                // Probe the target tile before moving — don't drag a pickup
                // into a wall just because the player is on the other side.
                const nx = this.x + (dx / d) * pull;
                const ny = this.y + (dy / d) * pull;
                const cx = nx + this.w / 2;
                const cy = ny + this.h / 2;
                if (!level.isSolid(cx, cy)) {
                    this.x = nx;
                    this.y = ny;
                }
                // Tug trail — drop a colored mote behind the pickup (opposite
                // the pull direction) every ~3 frames so the magnet reads
                // visually, not just via the attract chime.
                this._tugTick = (this._tugTick || 0) + 1;
                if (this._tugTick >= 3) {
                    this._tugTick = 0;
                    // dx/dy points from pickup → player. Negate to drop the
                    // mote behind the pickup, opposite the pull direction.
                    const tx = this.x + this.w / 2 - (dx / d) * 4;
                    const ty = this.y + this.h / 2 - (dy / d) * 4;
                    particles.spawn(
                        tx, ty,
                        (Math.random() - 0.5) * 0.3,
                        (Math.random() - 0.5) * 0.3,
                        10 + (Math.random() * 4 | 0),
                        this._color(), 1, 0
                    );
                }
            } else if (this._attracting) {
                // Out of pull range — reset so re-entering the magnet zone
                // triggers a fresh attract chime instead of staying silent.
                this._attracting = false;
            }
        }
        // Pickup collision
        if (this.x < player.x + player.w && this.x + this.w > player.x &&
            this.y < player.y + player.h && this.y + this.h > player.y) {
            player.pickup(this.type);
            this.alive = false;
        }
    }
    draw(ctx, camera) {
        const dx = Math.round(this.x - camera.viewX);
        const dy = Math.round(this.y - camera.viewY + Math.sin(this.bob) * 1.5);
        const color = this._color();
        // Pulsing radial halo — phase ties to bob so the float and the
        // glow feel like one beat. Drawn first so the crate sits on top.
        const cx = dx + this.w / 2;
        const cy = dy + this.h / 2;
        const pulse = 0.65 + Math.sin(this.bob * 1.5) * 0.35;
        const haloR = 9 + pulse * 2;
        const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, haloR);
        grad.addColorStop(0, this._rgba(color, 0.55 * pulse));
        grad.addColorStop(0.6, this._rgba(color, 0.18 * pulse));
        grad.addColorStop(1, this._rgba(color, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = grad;
        ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);
        ctx.restore();
        // Crate
        ctx.fillStyle = '#1a1a2a';
        ctx.fillRect(dx, dy, this.w, this.h);
        ctx.fillStyle = '#3a2a4a';
        ctx.fillRect(dx + 1, dy + 1, this.w - 2, this.h - 2);
        // Letter
        ctx.fillStyle = color;
        const letter = this._letter();
        // Render letter as a 3×5 block of dots
        const glyph = GLYPHS[letter] || GLYPHS['?'];
        for (let r = 0; r < 5; r++) {
            const row = glyph[r];
            for (let c = 0; c < 3; c++) {
                if (row & (1 << (2 - c))) {
                    ctx.fillRect(dx + 4 + c, dy + 3 + r, 1, 1);
                }
            }
        }
    }
    _letter() {
        if (this.type === 'LIFE') return '+';
        if (this.type === '1UP') return '1';
        return this.type[0];
    }
    _color() {
        if (this.type === 'LIFE') return '#50ff70';
        if (this.type === '1UP') return '#ff60ff';
        return WEAPON[this.type]?.color || '#fff';
    }
    // Convert #rgb / #rrggbb to "rgba(r,g,b,a)". Cheap, no validation —
    // _color() is the only caller and always returns 6-digit hex.
    _rgba(hex, alpha) {
        const h = hex.startsWith('#') ? hex.slice(1) : hex;
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const r = parseInt(full.slice(0, 2), 16) | 0;
        const g = parseInt(full.slice(2, 4), 16) | 0;
        const b = parseInt(full.slice(4, 6), 16) | 0;
        return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    }
}

const GLYPHS = {
    'M': [0b101,0b111,0b111,0b101,0b101],
    'S': [0b111,0b100,0b111,0b001,0b111],
    'L': [0b100,0b100,0b100,0b100,0b111],
    'F': [0b111,0b100,0b110,0b100,0b100],
    'H': [0b101,0b101,0b111,0b101,0b101],
    'T': [0b111,0b010,0b010,0b010,0b010],
    '+': [0b000,0b010,0b111,0b010,0b000],
    '1': [0b010,0b110,0b010,0b010,0b111],
    '?': [0b110,0b001,0b010,0b000,0b010],
};

export class PickupManager {
    constructor() { this.pickups = []; this.crates = []; }
    clear() { this.pickups.length = 0; this.crates.length = 0; }
    spawn(x, y, type) { this.pickups.push(new Pickup(x, y, type)); }
    spawnCrate(x, y, drop) { this.crates.push(new Crate(x, y, drop)); }
    loadFromLevel(data) {
        if (data?.pickupSpawns) for (const p of data.pickupSpawns) this.spawn(p.x, p.y, p.type);
        if (data?.crateSpawns)  for (const c of data.crateSpawns)  this.spawnCrate(c.x, c.y, c.drop);
    }
    update(level, player) {
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const p = this.pickups[i];
            p.update(level, player);
            if (!p.alive) this.pickups.splice(i, 1);
        }
        for (let i = this.crates.length - 1; i >= 0; i--) {
            const c = this.crates[i];
            const drop = c.update(level, player);
            if (drop) this.spawn(c.x + c.w / 2 - 6, c.y, drop);
            if (!c.alive) this.crates.splice(i, 1);
        }
    }
    draw(ctx, camera) {
        for (const c of this.crates) c.draw(ctx, camera);
        for (const p of this.pickups) p.draw(ctx, camera);
    }
}

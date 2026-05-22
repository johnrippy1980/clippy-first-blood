import { GAME, WEAPON } from './constants.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { sprites } from './sprites.js';

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
        // r109: prefer painted tile_crate sprite when loaded. Falls back
        // to the procedural fillRect crate (X-brace + dark border) when
        // the asset is missing.
        if (sprites.has('tile_crate')) {
            sprites.draw(ctx, 'tile_crate', dx, dy, false, this.w / 13);
            return;
        }
        // Wood crate (procedural fallback)
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

// R219: Breakable wall — like Crate but tile-sized, solid (blocks
// player + enemy movement), takes more hits, drops a "secret" pickup
// on break. Player has to spot the off-color block, decide whether
// it's worth the ammo, and (often) shoot upward to break a wall
// that's blocking a hidden alcove.
//
// Solidity is queried by Level.isSolid via a registered list of
// active walls (see level.js). Walls deregister on break.
class BreakableWall {
    constructor(x, y, w, h, drop) {
        this.x = x; this.y = y;
        this.w = w || 16; this.h = h || 16;
        this.hp = 6;          // tougher than crates so it reads "wall"
        this.alive = true;
        this.drop = drop;     // pickup type to spawn at center on break
        this.hitFlash = 0;
        // Crack stages drive the visible "damage" pattern. 0..3.
        this.cracks = 0;
        // R233: shimmer phase so the idle pulse is desynchronized between
        // walls (otherwise a row of walls flashes in perfect lockstep,
        // which reads as a UI element not a hazard cluster).
        this._shimmerPhase = Math.random() * Math.PI * 2;
        this._tick = 0;
    }
    update(level, player) {
        if (this.hitFlash > 0) this.hitFlash--;
        this._tick++;
        if (!this.alive) return null;
        for (let i = player.bullets.length - 1; i >= 0; i--) {
            const b = player.bullets[i];
            if (b.stuck) continue;
            if (b.x > this.x && b.x < this.x + this.w
                && b.y > this.y && b.y < this.y + this.h) {
                this.hp -= b.damage;
                this.hitFlash = 5;
                // Crack tier scales linearly with damage taken.
                this.cracks = Math.min(3, Math.floor((6 - this.hp) / 2));
                particles.hitSpark(b.x, b.y, '#8a6850');
                if (!b.piercing) player.bullets.splice(i, 1);
                if (this.hp <= 0) {
                    this.alive = false;
                    particles.explosion(this.x + this.w / 2, this.y + this.h / 2, '#604030', 16);
                    audio.sfx('explode');
                    return this.drop;
                }
                audio.sfx('crateHit');
            }
        }
        return null;
    }
    draw(ctx, camera) {
        const dx = Math.round(this.x - camera.viewX);
        const dy = Math.round(this.y - camera.viewY);
        if (this.hitFlash > 0) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(dx, dy, this.w, this.h);
            return;
        }
        // R233: idle shimmer so destructibles READ as interactable. A slow
        // yellow pulse across the brick (period ~2s) plus a brighter outline
        // around walls that hide a real drop. Without this the bricks just
        // look like static set-dress on painted bgs.
        const shimmer = 0.5 + 0.5 * Math.sin(this._tick * 0.06 + this._shimmerPhase);
        const hidesDrop = !!this.drop;
        // Base brick — slightly different palette from the regular
        // crate so the player learns "wall, not crate" at a glance.
        ctx.fillStyle = '#4a3220'; ctx.fillRect(dx, dy, this.w, this.h);
        ctx.fillStyle = '#6a4830'; ctx.fillRect(dx + 1, dy + 1, this.w - 2, this.h - 2);
        // Top-left highlight + bottom-right shade — sells the 3D chunk look
        // and contrasts against flat painted bgs.
        ctx.fillStyle = '#8a6840';
        ctx.fillRect(dx + 1, dy + 1, this.w - 2, 1);
        ctx.fillRect(dx + 1, dy + 1, 1, this.h - 2);
        ctx.fillStyle = '#2a1810';
        ctx.fillRect(dx + 1, dy + this.h - 2, this.w - 2, 1);
        ctx.fillRect(dx + this.w - 2, dy + 1, 1, this.h - 2);
        // Mortar lines — the "brick" texture readers expect
        ctx.fillStyle = '#3a2218';
        ctx.fillRect(dx, dy + this.h / 2 | 0, this.w, 1);
        ctx.fillRect(dx + this.w / 2 | 0, dy, 1, this.h);
        // Crack overlay scales with damage tier
        if (this.cracks > 0) {
            ctx.fillStyle = '#1a0a08';
            for (let i = 0; i < this.cracks * 2 + 1; i++) {
                const cx = dx + 2 + (i * 5) % (this.w - 4);
                const cy = dy + 2 + (i * 3) % (this.h - 4);
                ctx.fillRect(cx, cy, 1, 2);
            }
        }
        // R233: shimmer glint — a single bright pixel sweeps across the brick
        // surface every cycle. Subtle, but enough to read "interactable" on
        // painted bgs that would otherwise camouflage a static block.
        const glintX = ((this._tick * 0.6) | 0) % (this.w + 4) - 2;
        if (glintX > 0 && glintX < this.w - 1) {
            const a = Math.max(0, Math.sin(this._tick * 0.06 + this._shimmerPhase));
            if (a > 0.3) {
                ctx.fillStyle = hidesDrop ? '#ffe080' : '#c0a070';
                ctx.fillRect(dx + glintX, dy + 2, 1, 2);
            }
        }
        // R233: drop-hint border — walls hiding a real drop pulse a faint
        // yellow rim so attentive players can pick out which walls to chase.
        // Always-visible walls (no drop) get the standard dark border.
        if (hidesDrop) {
            const rimMix = 0.4 + 0.4 * shimmer;
            const r = (0xc0 + (0xff - 0xc0) * rimMix) | 0;
            const g = (0x80 + (0xe0 - 0x80) * rimMix) | 0;
            ctx.fillStyle = `rgb(${r},${g},32)`;
        } else {
            ctx.fillStyle = '#1a0a08';
        }
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
        // Stop on ground — and snap so the pickup rests ON TOP of the floor
        // instead of sinking into it. Previously the check `y + h + 1` set
        // vy=0 while the body still overlapped the floor by up to a tile,
        // leaving weapon pickups half-buried + unreachable. Now we snap the
        // bottom to the tile's top edge whenever we collide.
        if (level.isSolid(this.x + this.w / 2, this.y + this.h + 1)) {
            this.vy = 0;
            // Snap bottom to the top of whichever tile we landed on
            const T = GAME.TILE;
            const probeY = this.y + this.h + 1;
            const tileTop = Math.floor(probeY / T) * T;
            this.y = tileTop - this.h;
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
        // R223: CLIPPY_TAG draws as a chrome paperclip silhouette
        // instead of the lettered-crate. Tags feel diegetic — Clippy
        // dropped them, the player is reclaiming pieces of himself.
        if (this.type === 'CLIPPY_TAG') {
            // Tilted paperclip shape, hand-painted in 12×12 of the 12px slot.
            // Two vertical wire arms + top arc + bottom arc, slight inner
            // shadow for depth. Pulses with bob.
            const tx = dx, ty = dy;
            ctx.fillStyle = '#a0a0b8';
            // Left wire (taller)
            ctx.fillRect(tx + 3, ty + 2, 2, 8);
            // Right wire (shorter, inset top)
            ctx.fillRect(tx + 7, ty + 3, 2, 7);
            // Top arc connecting both wires
            ctx.fillRect(tx + 3, ty + 2, 6, 1);
            ctx.fillRect(tx + 4, ty + 1, 4, 1);
            // Bottom curl on left wire
            ctx.fillRect(tx + 3, ty + 10, 4, 1);
            // Highlight pixel — chrome glint
            ctx.fillStyle = '#fff';
            ctx.fillRect(tx + 4, ty + 3, 1, 2);
            return;
        }
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
        if (this.type === 'GRENADE') return 'G';
        if (this.type === 'SHOTGUN') return 'X';   // S clashes with SPREAD; X reads as "scatter"
        if (this.type === 'CHAINSAW') return 'C';
        return this.type[0];
    }
    _color() {
        if (this.type === 'LIFE') return '#50ff70';
        if (this.type === '1UP') return '#ff60ff';
        if (this.type === 'GRENADE') return '#80ff40';
        if (this.type === 'CLIPPY_TAG') return '#e0e0e8';  // chrome
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
    'G': [0b111,0b100,0b101,0b101,0b111],
    'C': [0b111,0b100,0b100,0b100,0b111],
    'X': [0b101,0b101,0b010,0b101,0b101],
    '+': [0b000,0b010,0b111,0b010,0b000],
    '1': [0b010,0b110,0b010,0b010,0b111],
    '?': [0b110,0b001,0b010,0b000,0b010],
};

export class PickupManager {
    // R219: walls are kept separate from crates because they're solid
    // (queried by Level.isSolid each frame). Externally exposed list
    // so level.js can check intersection without a public accessor on
    // each manager method.
    constructor() { this.pickups = []; this.crates = []; this.walls = []; }
    clear() { this.pickups.length = 0; this.crates.length = 0; this.walls.length = 0; }
    spawn(x, y, type) { this.pickups.push(new Pickup(x, y, type)); }
    spawnCrate(x, y, drop) { this.crates.push(new Crate(x, y, drop)); }
    spawnWall(x, y, w, h, drop) { this.walls.push(new BreakableWall(x, y, w, h, drop)); }
    // R219: returns true if (px, py) sits inside any live breakable
    // wall. Level.isSolid delegates to this so a wall blocks player
    // movement until it's destroyed.
    isWallSolid(px, py) {
        for (const w of this.walls) {
            if (!w.alive) continue;
            if (px >= w.x && px < w.x + w.w && py >= w.y && py < w.y + w.h) return true;
        }
        return false;
    }
    loadFromLevel(data, level) {
        if (data?.pickupSpawns) for (const p of data.pickupSpawns) {
            this.spawn(p.x, p.y, p.type);
            // Ground-snap: hand-placed pickup coords across stages used a
            // mix of "-8" and "-12" offsets, leaving some half-buried. Walk
            // the freshly-spawned pickup up tile-by-tile until its bottom
            // edge clears the floor, so a hand-placement bug at the level
            // layer can't trap a weapon below collision.
            if (level) {
                const pk = this.pickups[this.pickups.length - 1];
                let guard = 0;
                while (level.isSolid(pk.x + pk.w / 2, pk.y + pk.h - 1) && guard < 4) {
                    pk.y -= GAME.TILE;
                    guard++;
                }
            }
        }
        if (data?.crateSpawns)  for (const c of data.crateSpawns)  this.spawnCrate(c.x, c.y, c.drop);
        // R219: breakable wall segments — solid until shot, drop a
        // (usually hidden) pickup on break.
        if (data?.wallSpawns) for (const w of data.wallSpawns) {
            this.spawnWall(w.x, w.y, w.w, w.h, w.drop);
        }
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
        // R219: tick walls, spawn drops on break, keep dead walls in
        // the array until the array can be naturally GC'd next clear()
        // — keeping them around as alive=false objects costs one bool
        // check per isWallSolid call and avoids array shifts mid-frame.
        for (let i = this.walls.length - 1; i >= 0; i--) {
            const w = this.walls[i];
            const drop = w.update(level, player);
            if (drop) this.spawn(w.x + w.w / 2 - 6, w.y + w.h / 2 - 6, drop);
            if (!w.alive) this.walls.splice(i, 1);
        }
    }
    draw(ctx, camera) {
        for (const w of this.walls) if (w.alive) w.draw(ctx, camera);
        for (const c of this.crates) c.draw(ctx, camera);
        for (const p of this.pickups) p.draw(ctx, camera);
    }
}

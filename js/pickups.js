// ============================================
// PICKUPS - Weapon power-ups scattered on the stage
// Floating, animated icons that grant a new weapon on contact.
// ============================================

class PickupManager {
    constructor() {
        this.items = [];
    }

    loadFromLevel(level) {
        this.items = [];
        if (!level.pickups) return;
        for (const p of level.pickups) {
            this.items.push({
                x: p.x, y: p.y,
                type: p.type,        // 'MACHINE_GUN' | 'SPREAD' | 'LASER' | 'FLAME' | 'STAPLE_REMOVER'
                bob: 0,
                taken: false
            });
        }
    }

    update(player) {
        for (const p of this.items) {
            if (p.taken) continue;
            p.bob += 0.1;
            // Collision with player (AABB)
            if (player.x < p.x + 14 && player.x + player.width > p.x &&
                player.y < p.y + 14 && player.y + player.height > p.y) {
                p.taken = true;
                player.weapon = WEAPON[p.type];
                if (typeof audio !== 'undefined') audio.sfxPickup();
                if (typeof particles !== 'undefined') {
                    // Sparkle burst
                    for (let i = 0; i < 8; i++) {
                        const a = (i / 8) * Math.PI * 2;
                        particles.spawn({
                            x: p.x + 7, y: p.y + 7,
                            vx: Math.cos(a) * 1.5,
                            vy: Math.sin(a) * 1.5 - 0.5,
                            gravity: 0.08,
                            life: 16,
                            size: 1,
                            colors: ['#ffffff', '#ffe070', '#ff8030', '#a82020']
                        });
                    }
                }
                // Floating "GOT FLAMETHROWER!" notification handled by Game
                if (typeof game !== 'undefined' && game.flashPickup) {
                    game.flashPickup(WEAPON[p.type].name);
                }
            }
        }
    }

    draw(ctx, camera) {
        for (const p of this.items) {
            if (p.taken) continue;
            const sx = Math.floor(p.x - camera.x);
            const sy = Math.floor(p.y - camera.y + Math.sin(p.bob) * 2);
            this.drawPickupIcon(ctx, sx, sy, p.type, p.bob);
        }
    }

    // 16x16 icon for each weapon type
    drawPickupIcon(ctx, x, y, type, bob) {
        // Pulsing rim glow
        const glow = Math.sin(bob * 2) > 0 ? '#ffe070' : '#ff8030';
        ctx.fillStyle = glow;
        ctx.fillRect(x - 1, y - 1, 18, 18);
        // Dark capsule background
        ctx.fillStyle = '#1a0e1e';
        ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(x + 1, y + 1, 14, 14);
        // Inner highlight
        ctx.fillStyle = '#564468';
        ctx.fillRect(x + 1, y + 1, 14, 1);
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(x + 1, y + 14, 14, 1);

        // Weapon-specific icon
        const cx = x + 8, cy = y + 8;
        switch (type) {
            case 'SPREAD':
                // Triple-shot fan
                ctx.fillStyle = '#ff8030';
                for (let i = -1; i <= 1; i++) {
                    ctx.fillRect(cx - 4, cy + i * 2, 2, 2);
                    ctx.fillRect(cx + 1, cy + i * 2, 3, 1);
                }
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(cx + 4, cy - 2, 2, 1);
                ctx.fillRect(cx + 4, cy + 2, 2, 1);
                ctx.fillRect(cx + 5, cy, 1, 1);
                break;
            case 'LASER':
                // Beam icon
                ctx.fillStyle = '#ff40ff';
                ctx.fillRect(x + 2, cy - 1, 12, 2);
                ctx.fillStyle = '#ffa0ff';
                ctx.fillRect(x + 2, cy, 12, 1);
                ctx.fillStyle = '#fff';
                ctx.fillRect(x + 12, cy - 2, 2, 4);
                ctx.fillRect(x + 14, cy - 1, 1, 2);
                break;
            case 'FLAME':
                // Stylized flame
                ctx.fillStyle = '#ff4030';
                ctx.fillRect(cx - 2, cy + 1, 4, 3);
                ctx.fillStyle = '#ff8030';
                ctx.fillRect(cx - 3, cy - 1, 6, 3);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(cx - 1, cy - 3, 3, 3);
                ctx.fillStyle = '#fff5c0';
                ctx.fillRect(cx, cy - 4, 1, 2);
                break;
            case 'STAPLE_REMOVER':
                // Crossed staple-remover jaws
                ctx.fillStyle = '#cccccc';
                ctx.fillRect(x + 2, cy - 3, 12, 2);
                ctx.fillRect(x + 2, cy + 1, 12, 2);
                ctx.fillStyle = '#888';
                ctx.fillRect(x + 7, cy - 4, 2, 8);
                break;
            default:
                // Machine gun icon
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(x + 3, cy - 1, 10, 2);
                ctx.fillStyle = '#fff';
                ctx.fillRect(x + 12, cy, 2, 1);
                ctx.fillStyle = '#4a3018';
                ctx.fillRect(x + 4, cy + 1, 4, 2);
        }
    }
}

const pickupManager = new PickupManager();

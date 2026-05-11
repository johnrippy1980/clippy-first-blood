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
                type: p.type,        // 'MACHINE_GUN' | 'SPREAD' | 'LASER' | 'FLAME' | 'STAPLE_REMOVER' | '1UP'
                bob: 0,
                taken: false,
                secret: !!p.secret
            });
        }
    }

    spawnDrop(x, y, type) {
        // Used for runtime drops (1UP from enemies)
        this.items.push({
            x: x - 7, y: y - 7,
            type, bob: Math.random() * Math.PI * 2, taken: false,
            // Drops fall to ground and have a limited lifetime
            vy: -2, gravity: 0.18, isDrop: true, life: 480
        });
    }

    update(player) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const p = this.items[i];
            if (p.taken) continue;
            p.bob += 0.1;

            // Falling-drop physics for runtime drops
            if (p.isDrop) {
                p.vy += p.gravity;
                p.y += p.vy;
                if (typeof game !== 'undefined' && game.level && game.level.isSolid(p.x + 7, p.y + 14)) {
                    p.y = Math.floor((p.y + 14) / GAME.TILE_SIZE) * GAME.TILE_SIZE - 14;
                    p.vy = 0;
                }
                p.life--;
                if (p.life <= 0) { this.items.splice(i, 1); continue; }
                // Blink in last 90 frames
                p.blink = p.life < 90 && (p.life & 4);
            }

            // Collision with player (AABB)
            if (player.x < p.x + 14 && player.x + player.width > p.x &&
                player.y < p.y + 14 && player.y + player.height > p.y) {
                p.taken = true;
                if (p.secret && typeof game !== 'undefined' && game.runSecretsFound !== undefined) {
                    game.runSecretsFound++;
                }
                if (p.type === '1UP') {
                    if (typeof game !== 'undefined') game.lives++;
                    if (typeof game !== 'undefined' && game.flashPickup) game.flashPickup('1UP! EXTRA LIFE');
                } else {
                    player.weapon = WEAPON[p.type];
                    if (typeof game !== 'undefined' && game.flashPickup) game.flashPickup(WEAPON[p.type].name);
                }
                if (typeof audio !== 'undefined') audio.sfxPickup();
                if (typeof particles !== 'undefined') {
                    for (let s = 0; s < 8; s++) {
                        const a = (s / 8) * Math.PI * 2;
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
            }
        }
    }

    draw(ctx, camera) {
        for (const p of this.items) {
            if (p.taken) continue;
            if (p.blink) continue;
            const sx = Math.floor(p.x - camera.x);
            const bobOff = p.isDrop ? 0 : Math.floor(Math.sin(p.bob) * 2);
            const sy = Math.floor(p.y - camera.y + bobOff);
            this.drawPickupIcon(ctx, sx, sy, p.type, p.bob);
        }
    }

    // 16x16 icon for each weapon type
    drawPickupIcon(ctx, x, y, type, bob) {
        // Pulsing rim glow - greener for 1UP
        let glow;
        if (type === '1UP') {
            glow = Math.sin(bob * 2) > 0 ? '#50ff70' : '#208a30';
        } else {
            glow = Math.sin(bob * 2) > 0 ? '#ffe070' : '#ff8030';
        }
        ctx.fillStyle = glow;
        ctx.fillRect(x - 1, y - 1, 18, 18);
        // Dark capsule background
        ctx.fillStyle = '#1a0e1e';
        ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = type === '1UP' ? '#1a3a22' : '#3a2855';
        ctx.fillRect(x + 1, y + 1, 14, 14);
        // Inner highlight
        ctx.fillStyle = type === '1UP' ? '#2d6a3a' : '#564468';
        ctx.fillRect(x + 1, y + 1, 14, 1);
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(x + 1, y + 14, 14, 1);

        // Weapon-specific icon
        const cx = x + 8, cy = y + 8;
        if (type === '1UP') {
            // "1UP" letters via the pixel font
            if (typeof drawPixelText === 'function') {
                drawPixelText(ctx, '1UP', x + 8, y + 5, '#ffffff', 1, 'center', 1);
            }
            // Tiny green heart underneath
            ctx.fillStyle = '#ff5050';
            ctx.fillRect(x + 5, y + 13, 6, 1);
            ctx.fillRect(x + 6, y + 14, 4, 1);
            return;
        }
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

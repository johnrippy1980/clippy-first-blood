// Enemies. Grunts (4 types) + bosses (7). Behaviors are state machines
// driven by a per-frame update with the level and the player as inputs.

import { GAME } from './constants.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { drawEnemyFrame, sprites, getSpriteDims } from './sprites.js';

// Grunt templates.
const TYPES = {
    folder: {
        sprite: 'folder',
        w: 14, h: 12,
        hp: 2, contactDmg: 1, score: 100,
        speed: 0.7, behavior: 'fly_sine',
        amplitude: 12, period: 90, shootInterval: 100, projectileSpeed: 1.6,
    },
    stapler: {
        sprite: 'stapler',
        w: 14, h: 8,
        hp: 1, contactDmg: 1, score: 80,
        speed: 0.6, behavior: 'hop',
        hopV: -3.0, hopInterval: 50,
    },
    cabinet: {
        sprite: 'cabinet',
        w: 18, h: 22,
        hp: 6, contactDmg: 2, score: 250,
        speed: 0.35, behavior: 'charge',
        chargeSpeed: 1.8, chargeWindup: 40,
    },
    holepunch: {
        sprite: 'holepunch',
        w: 14, h: 14,
        hp: 3, contactDmg: 1, score: 150,
        speed: 0, behavior: 'hover_sniper',
        hoverY: -2, shootInterval: 80, projectileSpeed: 2.4, beamCharge: 30,
    },
};

class Bullet {
    constructor(x, y, vx, vy, dmg = 1) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.dmg = dmg; this.life = 180;
        this.color = '#ff8050';
    }
    update(level) {
        this.x += this.vx; this.y += this.vy;
        this.life--;
        if (level.isSolid(this.x, this.y)) { this.life = 0; particles.hitSpark(this.x, this.y, this.color); }
    }
    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.round(this.x - camera.viewX) - 1, Math.round(this.y - camera.viewY) - 1, 3, 3);
    }
}

class Enemy {
    constructor(x, y, type) {
        const t = TYPES[type] || TYPES.folder;
        this.type = type;
        this.x = x; this.y = y;
        this.spawnX = x; this.spawnY = y;
        this.w = t.w; this.h = t.h;
        this.vx = 0; this.vy = 0;
        this.hp = t.hp;
        this.maxHp = t.hp;
        this.score = t.score;
        this.contactDmg = t.contactDmg;
        this.behavior = t.behavior;
        this.tpl = t;
        this.facing = -1;
        this.alive = true;
        this.hitFlash = 0;
        this.timer = 0;
        this.subState = 0;
        this.subTimer = 0;
        this.sprite = t.sprite;
    }

    update(level, player) {
        this.timer++;
        if (this.hitFlash > 0) this.hitFlash--;
        switch (this.behavior) {
            case 'fly_sine':       this._flySine(level, player); break;
            case 'hop':            this._hop(level, player); break;
            case 'charge':         this._charge(level, player); break;
            case 'hover_sniper':   this._hoverSniper(level, player); break;
        }
    }

    _flySine(level, player) {
        const tpl = this.tpl;
        const dx = player.x - this.x;
        this.facing = dx > 0 ? 1 : -1;
        this.x += this.facing * tpl.speed * 0.5;
        this.y = this.spawnY + Math.sin(this.timer / tpl.period * Math.PI * 2) * tpl.amplitude;
        if (this.timer % tpl.shootInterval === 0 && Math.abs(dx) < 140) {
            const d = Math.hypot(dx, player.y - this.y);
            const vx = dx / d * tpl.projectileSpeed;
            const vy = (player.y - this.y) / d * tpl.projectileSpeed;
            globalEnemyBullets.push(new Bullet(this.x + this.w / 2, this.y + this.h / 2, vx, vy));
        }
    }

    _hop(level, player) {
        const tpl = this.tpl;
        this.vy += GAME.GRAVITY;
        const onGround = this._isOnGround(level);
        if (onGround && this.timer % tpl.hopInterval === 0) {
            this.vy = tpl.hopV;
            const dx = player.x - this.x;
            this.facing = dx > 0 ? 1 : -1;
            this.vx = this.facing * tpl.speed;
        }
        if (onGround && this.vy >= 0) this.vy = 0.1;

        const xRes = level.moveX(this, this.vx);
        this.x = xRes.x; if (xRes.hit) this.vx = -this.vx;
        const yRes = level.moveY(this, this.vy, true, this.vy);
        this.y = yRes.y; if (yRes.hit) { if (yRes.landed) this.vy = 0; else this.vy = 1; }
    }

    _charge(level, player) {
        const tpl = this.tpl;
        const dx = player.x - this.x;
        const dist = Math.abs(dx);
        if (this.subState === 0) {
            this.facing = dx > 0 ? 1 : -1;
            this.vx = this.facing * tpl.speed;
            if (dist < 64) this.subState = 1; // wind up
            this.subTimer = 0;
        } else if (this.subState === 1) {
            this.subTimer++;
            this.vx *= 0.85;
            if (this.subTimer >= tpl.chargeWindup) {
                this.subState = 2;
                this.subTimer = 0;
            }
        } else if (this.subState === 2) {
            this.vx = this.facing * tpl.chargeSpeed;
            this.subTimer++;
            if (this.subTimer > 60) { this.subState = 0; }
        }
        this.vy += GAME.GRAVITY;
        const xRes = level.moveX(this, this.vx);
        this.x = xRes.x; if (xRes.hit) { if (this.subState === 2) this.subState = 0; this.vx = 0; }
        const yRes = level.moveY(this, this.vy, true, this.vy);
        this.y = yRes.y; if (yRes.hit && yRes.landed) this.vy = 0; else if (yRes.hit) this.vy = 1;
    }

    _hoverSniper(level, player) {
        const tpl = this.tpl;
        this.y = this.spawnY + Math.sin(this.timer / 60) * 4;
        const dx = player.x - this.x;
        this.facing = dx > 0 ? 1 : -1;
        if (this.timer % tpl.shootInterval === 0) {
            // Telegraphed: charge then fire
            this.subTimer = tpl.beamCharge;
        }
        if (this.subTimer > 0) {
            this.subTimer--;
            if (this.subTimer === 0) {
                const d = Math.hypot(dx, player.y - this.y) || 1;
                const vx = dx / d * tpl.projectileSpeed;
                const vy = (player.y - this.y) / d * tpl.projectileSpeed;
                const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, vx, vy);
                b.color = '#ff5050';
                globalEnemyBullets.push(b);
            }
        }
    }

    _isOnGround(level) {
        return level.isSolid(this.x + 2, this.y + this.h + 1) ||
               level.isSolid(this.x + this.w - 2, this.y + this.h + 1);
    }

    hurt(dmg, knockDir = 0) {
        this.hp -= dmg;
        this.hitFlash = 6;
        audio.sfx('bossHit');
        if (this.hp <= 0) {
            this.alive = false;
            particles.explosion(this.x + this.w / 2, this.y + this.h / 2);
            audio.sfx('explode');
            return true;
        }
        return false;
    }

    intersects(box) {
        return this.x < box.x + box.w && this.x + this.w > box.x &&
               this.y < box.y + box.h && this.y + this.h > box.y;
    }

    draw(ctx, camera) {
        // Anchor sprite to bottom-center of hitbox
        const dims = getSpriteDims(this.sprite);
        const dx = Math.round(this.x + this.w / 2 - dims.w / 2 - camera.viewX);
        const dy = Math.round(this.y + this.h - dims.h - camera.viewY);
        if (this.hitFlash > 0 && this.hitFlash % 2 === 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            drawEnemyFrame(ctx, this.sprite, dx, dy, this.facing > 0);
            ctx.restore();
        } else {
            drawEnemyFrame(ctx, this.sprite, dx, dy, this.facing > 0);
        }
        // Charge tell: red flash on cabinet wind-up
        if (this.behavior === 'charge' && this.subState === 1) {
            const t = this.subTimer % 8;
            if (t < 4) {
                ctx.fillStyle = '#ff5050';
                ctx.fillRect(dx, dy - 4, this.w, 2);
            }
        }
        // Sniper telegraph
        if (this.behavior === 'hover_sniper' && this.subTimer > 0) {
            ctx.fillStyle = '#ff5050';
            const cx = dx + this.w / 2;
            const cy = dy + this.h / 2;
            const len = (this.tpl.beamCharge - this.subTimer) * 8;
            // We don't know player position here without extra plumbing; draw warning glow
            ctx.fillRect(cx - 1, cy - 1, 2, 2);
            ctx.globalAlpha = 0.4;
            ctx.fillRect(cx - len, cy - 1, len * 2, 2);
            ctx.globalAlpha = 1;
        }
    }
}

// Boss base. Specific bosses subclass and override _patterns().
class Boss extends Enemy {
    constructor(x, y, kind) {
        const tpl = BOSS_TEMPLATES[kind];
        super(x, y, 'cabinet');
        this.kind = kind;
        this.w = tpl.w; this.h = tpl.h;
        this.hp = tpl.hp; this.maxHp = tpl.hp;
        this.score = tpl.score;
        this.contactDmg = tpl.contactDmg;
        this.phase = 1;
        this.tagline = tpl.tagline;
        this.name = tpl.name;
        this.color = tpl.color;
        this.sprite = tpl.sprite || 'cabinet';
        this.behavior = 'boss';
        this.attackIndex = 0;
        this.attackTimer = 120; // brief intro before first attack
        this.subState = 0;
    }

    update(level, player) {
        this.timer++;
        if (this.hitFlash > 0) this.hitFlash--;
        // Gravity if grounded boss
        if (BOSS_TEMPLATES[this.kind].grounded) {
            this.vy += GAME.GRAVITY * 0.5;
            const yRes = level.moveY(this, this.vy, true, this.vy);
            this.y = yRes.y; if (yRes.hit && yRes.landed) this.vy = 0;
        }
        // Phase 2 at half hp
        if (this.phase === 1 && this.hp <= this.maxHp / 2) {
            this.phase = 2;
            this.attackTimer = 60;
            audio.sfx('explode');
            particles.explosion(this.x + this.w / 2, this.y + this.h / 2);
        }
        // Pattern execution
        this.attackTimer--;
        if (this.attackTimer <= 0) {
            this._runPattern(level, player);
        }
    }

    _runPattern(level, player) {
        const dx = player.x - (this.x + this.w / 2);
        const aim = dx > 0 ? 1 : -1;
        const fan = this.phase === 2 ? 7 : 5;
        const speed = 1.6 + (this.phase === 2 ? 0.6 : 0);

        switch (this.kind) {
            case 'COPIER_3000':
                // Pattern: paper jam line + ink rain
                if (this.attackIndex % 2 === 0) {
                    // Horizontal paper line, fast
                    for (let i = -1; i <= 1; i++) {
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2 + i * 6, aim * speed * 1.4, 0, 1);
                        b.color = '#f0f0e0';
                        globalEnemyBullets.push(b);
                    }
                } else {
                    // Ink rain from above
                    for (let i = 0; i < 5 + this.phase * 2; i++) {
                        const bx = this.x + (i - 2) * 16 + (Math.random() - 0.5) * 12;
                        const b = new Bullet(bx, this.y - 10, 0, 1.4, 1);
                        b.color = '#1a1a1a';
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'SHREDDER':
                // Triple claw swipe → paper vortex
                for (let i = 0; i < fan; i++) {
                    const a = ((i - (fan - 1) / 2) / fan) * 1.4 + (aim < 0 ? Math.PI : 0);
                    const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed, Math.sin(a) * speed * 0.6, 1);
                    b.color = '#d8b890';
                    globalEnemyBullets.push(b);
                }
                break;
            case 'CTRL_ALT_DEL':
                // BSOD 3-head zigzag
                for (let i = 0; i < 3; i++) {
                    const b = new Bullet(this.x + this.w / 2, this.y + 8 + i * 10, aim * speed, Math.sin(this.timer / 10 + i) * 1.2, 1);
                    b.color = '#4080c0';
                    globalEnemyBullets.push(b);
                }
                break;
            case 'BALLMER':
                // Chair throw + sweat rain
                const chair = new Bullet(this.x + this.w / 2, this.y + 6, aim * speed * 1.2, -1.6, 2);
                chair.color = '#806040';
                globalEnemyBullets.push(chair);
                if (this.phase === 2) {
                    for (let i = -3; i <= 3; i++) {
                        const b = new Bullet(this.x + this.w / 2 + i * 8, this.y - 6, i * 0.3, 1.4, 1);
                        b.color = '#80c8ff';
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'GATES':
                // Windows-blade laser line + summons
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + this.timer / 30;
                    const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed, Math.sin(a) * speed, 1);
                    b.color = '#80c0ff';
                    globalEnemyBullets.push(b);
                }
                break;
            case 'CLIPPY_2':
                // Mirror moveset: scrolls own attacks
                if (this.attackIndex % 2 === 0) {
                    for (let i = -1; i <= 1; i++) {
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2 + i * 6, aim * speed * 1.4, 0, 1);
                        b.color = '#ff60ff';
                        globalEnemyBullets.push(b);
                    }
                } else {
                    for (let i = 0; i < 5; i++) {
                        const a = ((i - 2) / 5) * 1.2;
                        const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, aim * speed * Math.cos(a), Math.sin(a) * speed, 1);
                        b.color = '#ff60ff';
                        globalEnemyBullets.push(b);
                    }
                }
                break;
            case 'ALGORITHM':
                // Geometric ring pattern
                const ringCount = this.phase === 2 ? 16 : 10;
                for (let i = 0; i < ringCount; i++) {
                    const a = (i / ringCount) * Math.PI * 2 + this.timer / 40;
                    const b = new Bullet(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * speed * 0.7, Math.sin(a) * speed * 0.7, 1);
                    b.color = '#7af0ff';
                    globalEnemyBullets.push(b);
                }
                break;
        }

        this.attackIndex++;
        this.attackTimer = Math.max(30, 90 - this.phase * 20);

        // Drift toward / away from player a bit (NES boss behavior)
        if (this.attackIndex % 2 === 0) {
            const range = 80;
            const tx = (dx > 0 ? player.x - this.w - range : player.x + range);
            this.x += Math.sign(tx - this.x) * 0.8;
        }
    }

    draw(ctx, camera) {
        const spriteKey = 'boss_' + this.kind;
        if (sprites.has(spriteKey)) {
            // Use PNG, anchored to bottom-center of hitbox
            const dims = getSpriteDims(spriteKey);
            const dx = Math.round(this.x + this.w / 2 - dims.w / 2 - camera.viewX);
            const dy = Math.round(this.y + this.h - dims.h - camera.viewY);
            if (this.hitFlash > 0 && this.hitFlash % 2 === 0) {
                // White flash on hit
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.5;
                sprites.draw(ctx, spriteKey, dx, dy, false);
                ctx.restore();
            }
            sprites.draw(ctx, spriteKey, dx, dy, false);
            return;
        }
        // Procedural fallback for any boss without art
        const dx = Math.round(this.x - camera.viewX);
        const dy = Math.round(this.y - camera.viewY);
        const flash = this.hitFlash > 0 && this.hitFlash % 2 === 0;
        ctx.fillStyle = flash ? '#fff' : this.color;
        ctx.fillRect(dx, dy, this.w, this.h);
        const tpl = BOSS_TEMPLATES[this.kind];
        ctx.fillStyle = flash ? '#fff' : tpl.detail;
        tpl.draw?.(ctx, dx, dy, this.w, this.h, this.timer, this.phase);
        ctx.fillStyle = '#000';
        ctx.fillRect(dx, dy, this.w, 1);
        ctx.fillRect(dx, dy + this.h - 1, this.w, 1);
        ctx.fillRect(dx, dy, 1, this.h);
        ctx.fillRect(dx + this.w - 1, dy, 1, this.h);
    }
}

const BOSS_TEMPLATES = {
    COPIER_3000: {
        name: 'COPIER 3000', tagline: 'PC LOAD LETTER OF DEATH',
        w: 48, h: 40, hp: 28, contactDmg: 2, score: 5000,
        color: '#506070', detail: '#a8b8c8',
        grounded: true,
        draw: (ctx, x, y, w, h, t, p) => {
            // Display panel
            ctx.fillStyle = '#10204a'; ctx.fillRect(x + 8, y + 4, w - 16, 10);
            ctx.fillStyle = '#80c0ff';
            for (let i = 0; i < 3; i++) ctx.fillRect(x + 10 + i * 8, y + 7, 4, 1);
            // Paper slot mouth
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x + 4, y + 18, w - 8, 6);
            // Glowing eyes when ready
            const c = p === 2 ? '#ff5050' : '#ffe070';
            ctx.fillStyle = c;
            ctx.fillRect(x + 14, y + 20, 2, 2); ctx.fillRect(x + w - 16, y + 20, 2, 2);
        },
    },
    SHREDDER: {
        name: 'MEGA-SHREDDER', tagline: 'CHEWS THROUGH ANYTHING',
        w: 44, h: 36, hp: 32, contactDmg: 2, score: 6000,
        color: '#c0c0c8', detail: '#1a1a1a',
        grounded: true,
        draw: (ctx, x, y, w, h, t) => {
            // Teeth/grate
            for (let i = 0; i < 9; i++) {
                ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 4 + i * 4, y + 12, 2, 8);
            }
            // Claw arms
            ctx.fillStyle = '#404040';
            const sw = Math.sin(t / 20) * 4;
            ctx.fillRect(x - 4 + sw, y + 18, 4, 12);
            ctx.fillRect(x + w + sw, y + 18, 4, 12);
        },
    },
    CTRL_ALT_DEL: {
        name: 'CTRL ALT DEL', tagline: 'BLUE SCREEN OF DEATH',
        w: 56, h: 32, hp: 36, contactDmg: 2, score: 7000,
        color: '#1040a0', detail: '#80c0ff',
        grounded: true,
        draw: (ctx, x, y, w, h, t) => {
            // 3 heads
            for (let i = 0; i < 3; i++) {
                const hx = x + 4 + i * 18;
                ctx.fillStyle = '#000';
                ctx.fillRect(hx, y + 4, 12, 12);
                ctx.fillStyle = '#80c0ff';
                ctx.fillRect(hx + 2, y + 6, 8, 2); // text bar
                ctx.fillRect(hx + 2, y + 10, 6, 1);
                ctx.fillStyle = '#fff';
                ctx.fillRect(hx + 4 + (t / 8 % 4 | 0), y + 8, 1, 1);
            }
        },
    },
    BALLMER: {
        name: 'CEO BALLMER', tagline: 'DEVELOPERS DEVELOPERS DEVELOPERS',
        w: 32, h: 40, hp: 40, contactDmg: 2, score: 8000,
        color: '#a04040', detail: '#fff',
        grounded: true,
        draw: (ctx, x, y, w, h, t) => {
            // Bald head
            ctx.fillStyle = '#f0c8a8'; ctx.fillRect(x + 6, y + 2, w - 12, 12);
            // Suit
            ctx.fillStyle = '#1a1a2a'; ctx.fillRect(x + 4, y + 14, w - 8, h - 16);
            // Tie
            ctx.fillStyle = '#a01010'; ctx.fillRect(x + w / 2 - 1, y + 14, 2, 12);
            // Eyes blazing
            ctx.fillStyle = '#ff5050';
            ctx.fillRect(x + 10, y + 8, 2, 2); ctx.fillRect(x + w - 12, y + 8, 2, 2);
            // Sweat drops
            if ((t / 16 | 0) % 4 === 0) {
                ctx.fillStyle = '#80c8ff'; ctx.fillRect(x + 8, y + 14, 1, 2);
            }
        },
    },
    GATES: {
        name: 'THE FOUNDER', tagline: 'YOU HAD ONE JOB',
        w: 28, h: 38, hp: 44, contactDmg: 2, score: 9000,
        color: '#806040', detail: '#fff',
        grounded: true,
        draw: (ctx, x, y, w, h, t) => {
            // Hair (bowl cut)
            ctx.fillStyle = '#603018'; ctx.fillRect(x + 4, y + 0, w - 8, 6);
            // Head
            ctx.fillStyle = '#f0c8a8'; ctx.fillRect(x + 6, y + 6, w - 12, 10);
            // Glasses
            ctx.fillStyle = '#000';
            ctx.fillRect(x + 8, y + 9, 4, 2); ctx.fillRect(x + w - 12, y + 9, 4, 2);
            ctx.fillRect(x + 11, y + 10, 2, 1);
            // Sweater
            ctx.fillStyle = '#604848'; ctx.fillRect(x + 4, y + 16, w - 8, h - 18);
            // Pixel blade
            ctx.fillStyle = '#80c0ff';
            ctx.fillRect(x + w + Math.sin(t / 12) * 2, y + 12, 8, 4);
        },
    },
    CLIPPY_2: {
        name: 'CLIPPY 2.0', tagline: 'THE REPLACEMENT MODEL',
        w: 28, h: 36, hp: 48, contactDmg: 2, score: 10000,
        color: '#c0c0d0', detail: '#ff60ff',
        grounded: true,
        draw: (ctx, x, y, w, h, t) => {
            // Chrome paperclip silhouette
            ctx.fillStyle = '#a0a0b8';
            ctx.fillRect(x + 8, y + 4, 4, h - 8);
            ctx.fillRect(x + 16, y + 4, 4, h - 8);
            ctx.fillRect(x + 8, y + 4, 12, 3);
            ctx.fillRect(x + 8, y + h - 7, 12, 3);
            // Pink glowing eyes
            ctx.fillStyle = '#ff60ff';
            const flick = (t / 4 | 0) % 8 < 6 ? 2 : 0;
            ctx.fillRect(x + 10, y + 10, 2, flick); ctx.fillRect(x + 16, y + 10, 2, flick);
        },
    },
    ALGORITHM: {
        name: 'THE ALGORITHM', tagline: 'IT KNOWS WHAT YOU WANT',
        w: 40, h: 40, hp: 60, contactDmg: 2, score: 15000,
        color: '#202848', detail: '#7af0ff',
        grounded: false,
        draw: (ctx, x, y, w, h, t, p) => {
            // Geometric rotating crystal
            const cx = x + w / 2, cy = y + h / 2;
            const r = w / 2 - 2;
            const phases = p === 2 ? 8 : 6;
            ctx.fillStyle = '#7af0ff';
            for (let i = 0; i < phases; i++) {
                const a = (i / phases) * Math.PI * 2 + t / 30;
                const px = cx + Math.cos(a) * r;
                const py = cy + Math.sin(a) * r;
                ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
            }
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx - 1, cy - 1, 2, 2);
        },
    },
};

export const globalEnemyBullets = [];

export class EnemyManager {
    constructor() {
        this.enemies = [];
        this.bullets = globalEnemyBullets;
    }
    clear() {
        this.enemies.length = 0;
        this.bullets.length = 0;
    }
    spawn(x, y, type) {
        this.enemies.push(new Enemy(x, y - TYPES[type].h, type));
    }
    spawnBoss(x, y, kind) {
        const tpl = BOSS_TEMPLATES[kind];
        const boss = new Boss(x - tpl.w / 2, y - tpl.h, kind);
        this.enemies.push(boss);
        return boss;
    }

    update(level, player) {
        // Cull off-screen-far enemies optionally (left for now)
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.alive) {
                this.enemies.splice(i, 1);
                player.score += e.score;
                continue;
            }
            e.update(level, player);

            // Contact damage
            if (player.iFrames === 0 && e.intersects(player)) {
                player.hurt(e.contactDmg, e.x < player.x ? 1 : -1);
            }

            // Player bullets vs enemy
            for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
                const b = player.bullets[bi];
                if (b.piercing && b.hits.has(e)) continue;
                if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
                    const killed = e.hurt(b.damage, e.x < player.x ? 1 : -1);
                    player.onBulletHit(b, e, killed);
                    if (b.homing) b._target = null;
                    if (killed) break;
                }
            }
        }

        // Enemy bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update(level);
            if (b.life <= 0) { this.bullets.splice(i, 1); continue; }
            if (player.iFrames === 0 &&
                b.x > player.x && b.x < player.x + player.w &&
                b.y > player.y && b.y < player.y + player.h) {
                player.hurt(b.dmg, b.vx > 0 ? -1 : 1);
                this.bullets.splice(i, 1);
            }
        }

        // Homing target assignment
        for (const b of player.bullets) {
            if (b.homing && !b._target) {
                let bestD = Infinity, best = null;
                for (const e of this.enemies) {
                    const d = Math.hypot(e.x - b.x, e.y - b.y);
                    if (d < bestD) { bestD = d; best = e; }
                }
                b._target = best;
            }
        }
    }

    draw(ctx, camera) {
        for (const e of this.enemies) e.draw(ctx, camera);
        for (const b of this.bullets) b.draw(ctx, camera);
    }

    activeBoss() {
        return this.enemies.find(e => e instanceof Boss && e.alive);
    }
}

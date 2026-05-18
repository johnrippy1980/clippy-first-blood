// HUD overlay. Lives, hp, weapon, score, combo, boss bar, speedrun timer.

import { GAME, WEAPON } from './constants.js';
import { drawText, drawTextOutlined } from './pixelfont.js';
import { drawClippyFrame } from './sprites.js';
import { input } from './input.js';
import { achievements } from './achievements.js';

export function drawHUD(ctx, state) {
    const { player, score, time, boss, camera } = state;
    // Lazy-build a single radial gradient cached on the function (geometry is constant)
    if (!drawHUD._vignetteGrad) {
        const g = ctx.createRadialGradient(GAME.W / 2, GAME.H / 2, 30, GAME.W / 2, GAME.H / 2, GAME.W * 0.7);
        g.addColorStop(0, 'rgba(255,0,0,0)');
        g.addColorStop(0.6, 'rgba(180,0,0,0.3)');
        g.addColorStop(1, 'rgba(255,40,40,1)');
        drawHUD._vignetteGrad = g;
    }
    // Damage vignette — modulate alpha via globalAlpha against the cached gradient
    if (player.iFrames > 0) {
        const t = player.iFrames / 30;
        const alpha = Math.min(0.55, t * 0.55);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = drawHUD._vignetteGrad;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        ctx.globalAlpha = 1;
    }
    // Off-screen damage indicator — arrow on the screen edge pointing to the source
    // Note: frame countdown happens in player.update, not here
    if (player.lastHurtSrc && player.lastHurtSrc.frames > 0 && camera) {
        const s = player.lastHurtSrc;
        const sx = s.x - camera.viewX;
        const sy = s.y - camera.viewY;
        const onScreen = sx >= 0 && sx < GAME.W && sy >= 0 && sy < GAME.H;
        // Also show arrow if damage came from BEHIND the player's facing direction —
        // even if it's on-screen, you couldn't see it without turning.
        const dxFromPlayer = s.x - (player.x + player.w / 2);
        const fromBehind = (player.facing > 0 && dxFromPlayer < -20) ||
                           (player.facing < 0 && dxFromPlayer >  20);
        if (!onScreen || fromBehind) {
            // Project the source position onto the screen edge from screen center
            const cxn = GAME.W / 2, cyn = GAME.H / 2;
            const dx = sx - cxn, dy = sy - cyn;
            const ang = Math.atan2(dy, dx);
            // Find edge intersection
            const mx = GAME.W / 2 - 12, my = GAME.H / 2 - 12;
            const sc = Math.min(mx / Math.abs(Math.cos(ang) || 0.001), my / Math.abs(Math.sin(ang) || 0.001));
            const ax = Math.round(cxn + Math.cos(ang) * sc);
            const ay = Math.round(cyn + Math.sin(ang) * sc);
            // Pulse + fade with frames
            const a = Math.min(1, s.frames / 30) * (0.6 + Math.sin(s.frames * 0.4) * 0.3);
            ctx.globalAlpha = a;
            ctx.fillStyle = '#ff3030';
            // Triangle arrow pointing toward source
            const len = 7;
            const c = Math.cos(ang), si = Math.sin(ang);
            for (let i = 0; i < len; i++) {
                const w = len - i;
                for (let j = -w; j <= w; j++) {
                    const px = ax + c * (i - len) - si * j;
                    const py = ay + si * (i - len) + c * j;
                    ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
                }
            }
            ctx.globalAlpha = 1;
        }
    }

    // Top bar background — extended slightly down to cover the timer
    ctx.fillStyle = 'rgba(8, 4, 14, 0.85)';
    ctx.fillRect(0, 0, GAME.W, 16);
    // Extended timer backplate on the right (no full strip, just a corner box)
    ctx.fillStyle = 'rgba(8, 4, 14, 0.75)';
    ctx.fillRect(GAME.W - 64, 16, 64, 12);
    ctx.fillStyle = '#3a2a4a';
    ctx.fillRect(0, 15, GAME.W, 1);
    ctx.fillRect(GAME.W - 64, 27, 64, 1);
    ctx.fillRect(GAME.W - 65, 16, 1, 12);

    // Lives icon
    ctx.fillStyle = '#a0a0b0'; ctx.fillRect(3, 5, 2, 8);
    ctx.fillRect(3, 4, 4, 1); ctx.fillRect(6, 5, 1, 8);
    ctx.fillStyle = '#a01020'; ctx.fillRect(3, 3, 4, 1);
    drawText(ctx, 'x' + player.lives, 10, 5, '#fff', 1);

    // HP bar
    const barX = 28, barY = 5, barW = 60, barH = 7;
    ctx.fillStyle = '#1a1018'; ctx.fillRect(barX, barY, barW, barH);
    const pct = Math.max(0, player.hp / player.maxHp);
    const fillW = Math.floor(barW * pct);
    let fillColor = pct > 0.6 ? '#50ff70' : pct > 0.3 ? '#ffe070' : '#ff5050';
    // Low-HP pulse — alternate between red and bright white when ≤ 1
    if (player.hp <= 1) {
        const pulse = Math.sin((player._hudTick = (player._hudTick || 0) + 1) * 0.25) > 0;
        fillColor = pulse ? '#ff5050' : '#fff';
    }
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.fillStyle = '#3a2a4a';
    ctx.fillRect(barX, barY, barW, 1);
    ctx.fillRect(barX, barY + barH - 1, barW, 1);
    // Extra: when low HP, pulse a thin red border around HP bar
    if (player.hp <= 1) {
        ctx.fillStyle = '#ff3030';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, 1);
        ctx.fillRect(barX - 1, barY + barH, barW + 2, 1);
        ctx.fillRect(barX - 1, barY - 1, 1, barH + 2);
        ctx.fillRect(barX + barW, barY - 1, 1, barH + 2);
    }

    // Weapon: small color-coded glyph + abbreviated name
    const w = WEAPON[player.weapon];
    const WEAPON_LABELS = {
        MG: 'MACHINE', SPREAD: 'SPREAD', LASER: 'LASER',
        FLAME: 'FLAME',   HOMING: 'HOMING', THUNDER: 'THUNDER',
    };
    // Weapon icon glyph: 7x7 colored bullet shape based on weapon.
    // On pickup, flash a bright ring behind the glyph for ~30 frames.
    const ix = 94, iy = 4;
    if ((player.weaponPickupFlash || 0) > 0) {
        const t = player.weaponPickupFlash / 30;
        ctx.globalAlpha = t;
        ctx.fillStyle = w.color;
        ctx.fillRect(ix - 2, iy - 2, 11, 11);
        ctx.fillStyle = '#fff';
        ctx.fillRect(ix - 1, iy - 1, 9, 9);
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = w.color;
    if (player.weapon === 'SPREAD') {
        // 3-prong fan
        ctx.fillRect(ix, iy + 2, 2, 2);
        ctx.fillRect(ix + 2, iy, 2, 2);
        ctx.fillRect(ix + 2, iy + 4, 2, 2);
        ctx.fillRect(ix + 4, iy + 2, 2, 2);
    } else if (player.weapon === 'LASER') {
        ctx.fillRect(ix, iy + 2, 7, 2);
    } else if (player.weapon === 'FLAME') {
        ctx.fillRect(ix + 1, iy + 1, 5, 5);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(ix + 2, iy + 2, 3, 3);
    } else if (player.weapon === 'HOMING') {
        // diamond
        ctx.fillRect(ix + 3, iy, 2, 2);
        ctx.fillRect(ix + 1, iy + 2, 6, 2);
        ctx.fillRect(ix + 3, iy + 4, 2, 2);
    } else if (player.weapon === 'THUNDER') {
        // lightning zigzag
        ctx.fillRect(ix + 2, iy, 2, 2);
        ctx.fillRect(ix + 1, iy + 2, 2, 2);
        ctx.fillRect(ix + 3, iy + 4, 2, 2);
    } else {
        // MG: 3-round burst
        ctx.fillRect(ix, iy + 2, 2, 2);
        ctx.fillRect(ix + 3, iy + 2, 2, 2);
        ctx.fillRect(ix + 6, iy + 2, 2, 2);
    }
    // Weapon name (shorter for HUD: drop the long ones)
    const label = WEAPON_LABELS[player.weapon] || player.weapon;
    drawText(ctx, label, ix + 12, 5, w.color, 1);
    if (player.weaponLevel > 1) {
        const lx = ix + 12 + (label.length * 6) + 4;
        drawText(ctx, 'x' + player.weaponLevel, lx, 5, '#ffe070', 1);
    }

    // Combo + decay bar — bar below the number shrinks as comboTimer drains.
    // Telegraphs the "how long do I have to land the next hit" window so
    // players can keep streaks alive intentionally.
    if (player.combo >= 3) {
        const x = 150;
        // Tier color matches combo milestones
        const cColor = player.combo >= 20 ? '#ff60ff'
                     : player.combo >= 10 ? '#ff8050'
                     : player.combo >= 5  ? '#ffe070' : '#fff';
        drawText(ctx, player.combo + 'x', x, 5, cColor, 1);
        // Decay bar — comboTimer maxes at 90 frames (1.5s) per hit. Bar
        // shrinks left-to-right as the timer drains; flashes red under 20%.
        const cMax = 90;
        const cT = Math.min(1, (player.comboTimer || 0) / cMax);
        const barW = 18;
        const fillW = Math.max(0, Math.floor(barW * cT));
        ctx.fillStyle = '#1a0810';
        ctx.fillRect(x, 12, barW, 2);
        const lowFlash = cT < 0.2 && (performance.now() % 200 < 100);
        ctx.fillStyle = lowFlash ? '#ff5050' : cColor;
        ctx.fillRect(x, 12, fillW, 2);
    }

    // Score
    drawText(ctx, ('000000' + score).slice(-6), GAME.W - 4, 5, '#ffe070', 1, 'right');

    // Speedrun timer (small, under bar)
    const min = Math.floor(time / 3600);
    const sec = Math.floor((time / 60) % 60);
    const t = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    drawText(ctx, t, GAME.W - 4, 18, '#7af0ff', 1, 'right');

    // Controller icon (small) when gamepad connected
    if (input.gamepadIndex != null) {
        const ix = GAME.W - 42, iy = 18;
        ctx.fillStyle = '#50ff70';
        ctx.fillRect(ix, iy, 8, 4);
        ctx.fillRect(ix - 2, iy + 1, 2, 2);
        ctx.fillRect(ix + 8, iy + 1, 2, 2);
        ctx.fillRect(ix + 2, iy - 1, 1, 1);
        ctx.fillRect(ix + 5, iy - 1, 1, 1);
    }

    // In-game achievement unlock banner — top-center, fades over 300f (5s).
    // Phases: 0-20 fade-in, 20-250 hold full opacity, 250-300 fade-out.
    const banner = achievements.activeBanner?.();
    if (banner) {
        const a = achievements.get(banner.id);
        if (a) {
            const age = banner.age;
            let alpha = 1;
            if (age < 20) alpha = age / 20;
            else if (age > 250) alpha = Math.max(0, (300 - age) / 50);
            ctx.globalAlpha = alpha;
            const bx = GAME.W / 2 - 70, by = 32, bw = 140, bh = 22;
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(bx, by, bw, bh);
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(bx, by, bw, 1);
            ctx.fillRect(bx, by + bh - 1, bw, 1);
            // Trophy chip on the left
            ctx.fillStyle = '#3a2818';
            ctx.fillRect(bx + 3, by + 3, 14, 16);
            ctx.fillStyle = '#1a0000';
            ctx.fillRect(bx + 4, by + 4, 12, 14);
            drawText(ctx, a.icon, bx + 10, by + 7, '#ffe070', 1, 'center');
            drawText(ctx, 'ACHIEVEMENT UNLOCKED', bx + 21, by + 4, '#ffe070', 1, 'left');
            drawText(ctx, a.name, bx + 21, by + 13, '#fff', 1, 'left');
            ctx.globalAlpha = 1;
        }
    }

    // Boss HP bar
    if (boss && boss.alive) {
        const bx = 30, by = GAME.H - 18, bw = GAME.W - 60, bh = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(bx - 2, by - 8, bw + 4, bh + 12);
        drawTextOutlined(ctx, boss.name || 'BOSS', GAME.W / 2, by - 7, '#ff5050', '#1a0000', 1, 'center');
        const bp = boss.hp / boss.maxHp;
        ctx.fillStyle = '#1a0810';
        ctx.fillRect(bx, by, bw, bh);
        // Three-tier color: dark red > 75%, medium red > 25%, bright pulsing
        // red below 25% (boss is nearly dead — telegraphs the finishing window).
        let barColor;
        if (bp > 0.75) {
            barColor = '#7a1018';
        } else if (bp > 0.25) {
            barColor = '#c01a28';
        } else {
            // Pulse between bright red and warning orange at low HP
            const pulse = Math.sin(performance.now() * 0.012);
            barColor = pulse > 0 ? '#ff5050' : '#ff9030';
        }
        ctx.fillStyle = barColor;
        ctx.fillRect(bx, by, Math.floor(bw * Math.max(0, bp)), bh);
        // tick marks at 75% and 25% — threshold beats
        ctx.fillStyle = '#000';
        ctx.fillRect(bx + bw * 0.75 - 1, by, 1, bh);
        ctx.fillRect(bx + bw * 0.25 - 1, by, 1, bh);
        ctx.fillStyle = '#3a2a4a';
        ctx.fillRect(bx + bw / 2 - 1, by, 1, bh);
        // outline
        ctx.fillStyle = '#3a2a4a';
        ctx.fillRect(bx, by, bw, 1);
        ctx.fillRect(bx, by + bh - 1, bw, 1);
    }
}

// Small icon for title and menus.
export function drawClippyIcon(ctx, x, y) {
    drawClippyFrame(ctx, 'idle', x, y, false);
}

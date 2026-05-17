// HUD overlay. Lives, hp, weapon, score, combo, boss bar, speedrun timer.

import { GAME, WEAPON } from './constants.js';
import { drawText, drawTextOutlined } from './pixelfont.js';
import { drawClippyFrame } from './sprites.js';
import { input } from './input.js';

export function drawHUD(ctx, state) {
    const { player, score, time, boss } = state;

    // Top bar background
    ctx.fillStyle = 'rgba(8, 4, 14, 0.85)';
    ctx.fillRect(0, 0, GAME.W, 16);
    ctx.fillStyle = '#3a2a4a';
    ctx.fillRect(0, 15, GAME.W, 1);

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
    const fillColor = pct > 0.6 ? '#50ff70' : pct > 0.3 ? '#ffe070' : '#ff5050';
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.fillStyle = '#3a2a4a';
    ctx.fillRect(barX, barY, barW, 1);
    ctx.fillRect(barX, barY + barH - 1, barW, 1);

    // Weapon
    drawText(ctx, player.weapon, 94, 5, WEAPON[player.weapon].color, 1);
    if (player.weaponLevel > 1) {
        drawText(ctx, 'x' + player.weaponLevel, 94 + 30, 5, '#ffe070', 1);
    }

    // Combo
    if (player.combo >= 3) {
        const x = 150;
        drawText(ctx, player.combo + 'x', x, 5, '#ffe070', 1);
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

    // Boss HP bar
    if (boss && boss.alive) {
        const bx = 30, by = GAME.H - 18, bw = GAME.W - 60, bh = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(bx - 2, by - 8, bw + 4, bh + 12);
        drawTextOutlined(ctx, boss.name || 'BOSS', GAME.W / 2, by - 7, '#ff5050', '#1a0000', 1, 'center');
        const bp = boss.hp / boss.maxHp;
        ctx.fillStyle = '#1a0810';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = bp > 0.5 ? '#a01020' : '#ff5050';
        ctx.fillRect(bx, by, Math.floor(bw * Math.max(0, bp)), bh);
        // tick mark at 50%
        ctx.fillStyle = '#000';
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

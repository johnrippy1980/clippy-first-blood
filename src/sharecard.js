// Run-summary share card. Composes a standalone PNG from end-of-run stats —
// rank, time, score, kills, combo, deaths, path — over the painted ending art,
// with the Clippy hero sprite and the game URL. Built for sharing on
// Twitter/YouTube thumbnails, so it's a purpose-made composition at 2x the
// game resolution rather than a raw screen grab.
//
// Pure client-side: renders to an offscreen canvas and triggers a download.
// No backend, no deps.

import { drawText, drawTextOutlined } from './pixelfont.js';
import { sprites } from './sprites.js';

const SHARE_URL = 'clippy-first-blood.vercel.app';

// Card is 2x the 256x224 game frame for crisp text/sprites when shared.
const SCALE = 2;
const CARD_W = 256 * SCALE;
const CARD_H = 224 * SCALE;

const RANK_COLOR = {
    S: '#ffe070', A: '#a0ff70', B: '#80c0ff', C: '#c0a0d0', D: '#806080',
};

// Build the card and return the offscreen canvas. Pulls all values from a
// plain stats object so it has no dependency on live game state.
export function buildShareCanvas(stats) {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // All pixelfont/sprite math is in game-space (256x224); scale the context
    // so drawText et al. land at 2x without per-call multipliers.
    ctx.scale(SCALE, SCALE);

    // Background: painted ending art, cover-fit, else flat dark.
    if (sprites.has('ending')) {
        const img = sprites.images.get('ending');
        const cover = Math.max(256 / img.width, 224 / img.height);
        const dw = img.width * cover;
        const dh = img.height * cover;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, (256 - dw) / 2, (224 - dh) / 2, dw, dh);
        ctx.imageSmoothingEnabled = false;
    } else {
        ctx.fillStyle = '#0a0410';
        ctx.fillRect(0, 0, 256, 224);
    }
    // Darken for legibility.
    ctx.fillStyle = 'rgba(8,4,16,0.62)';
    ctx.fillRect(0, 0, 256, 224);

    // Header.
    drawTextOutlined(ctx, 'CLIPPY: FIRST BLOOD', 128, 12, '#ffe070', '#1a0a14', 1, 'center');
    drawTextOutlined(ctx, stats.title || 'MISSION COMPLETE', 128, 26, stats.accent || '#ff5050', '#1a0a14', 1, 'center');

    // Hero sprite on the left, big rank letter on the right.
    if (sprites.has('idle')) {
        const hero = sprites.images.get('idle');
        const hScale = 2;
        const hw = hero.width * hScale;
        const hh = hero.height * hScale;
        ctx.drawImage(hero, 24, 150 - hh, hw, hh);
    }
    const rank = stats.rank || '?';
    drawTextOutlined(ctx, rank, 210, 70, RANK_COLOR[rank] || '#fff', '#0a0410', 5, 'center');
    drawText(ctx, 'RANK', 210, 116, '#c0a0d0', 1, 'center');

    // Stats backplate + rows.
    ctx.fillStyle = 'rgba(8,4,14,0.80)';
    ctx.fillRect(70, 56, 116, 80);
    ctx.fillStyle = '#3a2a4a';
    ctx.fillRect(70, 56, 116, 1);
    ctx.fillRect(70, 135, 116, 1);

    const rows = [
        ['TIME', stats.time],
        ['SCORE', String(stats.score)],
        ['KILLS', String(stats.kills)],
        ['COMBO', String(stats.maxCombo)],
        ['DEATHS', String(stats.deaths)],
    ];
    let y = 62;
    for (const [label, val] of rows) {
        drawText(ctx, label, 76, y, '#a890c0', 1, 'left');
        const col = label === 'DEATHS' && stats.deaths === 0 ? '#50ff70'
                  : label === 'SCORE' ? '#ffe070' : '#ffffff';
        drawText(ctx, val, 180, y, col, 1, 'right');
        y += 14;
    }

    // New-personal-best ribbon — only when this run set a record. Sits just
    // above the path badge so a PB run is visible at a glance in the thumbnail.
    if (stats.newBest) {
        drawTextOutlined(ctx, '* NEW PERSONAL BEST *', 128, 150, '#ffe070', '#1a0a14', 1, 'center');
    }
    // Path badge + footer URL / CTA.
    drawTextOutlined(ctx, 'PATH: ' + (stats.path || ''), 128, 160, stats.accent || '#ff5050', '#0a0410', 1, 'center');
    if (stats.name) {
        drawText(ctx, 'RUN BY ' + stats.name, 128, 176, '#c0a0d0', 1, 'center');
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 200, 256, 24);
    drawTextOutlined(ctx, 'BEAT MY RANK AT', 128, 204, '#fff', '#1a0a14', 1, 'center');
    drawText(ctx, SHARE_URL, 128, 214, '#80d0ff', 1, 'center');

    return canvas;
}

// Build the card and trigger a download. Returns true on success.
export function downloadShareCard(stats) {
    try {
        const canvas = buildShareCanvas(stats);
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        const stamp = (stats.rank || 'run') + '-' + (stats.time || '').replace(':', 'm') + 's';
        a.download = `clippy-first-blood-${stamp}.png`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
    } catch (err) {
        console.warn('share card failed:', err);
        return false;
    }
}

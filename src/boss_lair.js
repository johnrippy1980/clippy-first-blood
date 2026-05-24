// R330: BossLair — dedicated arena framing for each boss fight.
//
// When the player crosses a stage's bossTrigger, instead of the boss
// just appearing in the next chunk of level, a "lair" sequence runs:
//   1. The player is gated into an arena chunk by a barrier behind them
//      (sliding door for indoor stages, rising lava/data-wall/smoke for
//      outdoor stages — theme-appropriate gating).
//   2. Lair-specific decorations render in the chamber (boss-themed
//      props that hint at the boss's identity even before they appear).
//   3. After the gate-drop cinematic finishes (~60f), the boss spawns
//      via the existing _spawnBoss path.
//   4. While the fight is active, the lair persists: gate stays visible,
//      decorations stay, player movement is clamped to lair bounds.
//   5. On boss death, lair fades out (gate retracts / barrier dissolves)
//      and player can advance to the stage-clear.

import { GAME, THEME } from './constants.js';
import { sprites } from './sprites.js';
import { audio } from './audio.js';
import { drawText } from './pixelfont.js';

// Per-boss lair spec. Two kinds:
//   'indoor-gated'   → solid gate sprite drops from above behind player
//   'outdoor-element'→ theme-appropriate elemental wall (lava / smoke /
//                       data-shimmer / etc.) rises from the ground
//
// Each spec also lists decorations to render around the arena.
// decorations: array of { kind, dx, dy } where dx/dy are offsets from
// the arena's left/bottom edges (so the level designer doesn't have to
// know absolute world coords).
export const BOSS_LAIRS = {
    // COPIER_3000 — Stage 1 Jungle (outdoor)
    // R356: arena now reads as a dim overgrown clearing — deep green tint
    // + vignette + a giant skeletal printer husk and a hanging shred banner
    // so the player visually knows "you've entered the copier's lair".
    COPIER_3000: {
        kind: 'outdoor-element',
        gateStyle: 'vine',
        gateSprite: 'lair_gate_vine',
        gateColor: '#284018',
        gateAccent: '#608028',
        nameTag: "COPIER'S CLEARING",
        // R374: painted boss-arena backdrop. Parallax engine swaps the
        // bg to this key while the lair is active so the player walks
        // into a visibly different place — wrecked copier monument in a
        // jungle clearing, not the same regular jungle stage with a
        // tinted overlay. Falls back to the tint-only path if the
        // sprite isn't loaded.
        arenaBg: 'bg_arena_copier',
        arenaTint: '#0e2818',
        tintAlpha: 0.32,
        decorations: [
            { kind: 'giantPrinterHusk', dx: 130, dy: -8 },
            { kind: 'paperBanner',      dx: 60,  dy: -64 },
            { kind: 'paperBanner',      dx: 200, dy: -68 },
            { kind: 'paperStack',       dx: 30,  dy: -6 },
            { kind: 'paperStack',       dx: 220, dy: -8 },
            { kind: 'tornBox',          dx: 90,  dy: -5 },
            { kind: 'tornBox',          dx: 170, dy: -5 },
        ],
    },
    SHREDDER: {
        kind: 'indoor-gated',
        gateStyle: 'metalDoor',
        gateSprite: 'lair_gate_server',
        gateColor: '#3a2820',
        gateAccent: '#806040',
        nameTag: 'STORAGE LOCKER',
        arenaBg: 'bg_arena_shredder',
        arenaTint: '#1c1208',
        tintAlpha: 0.30,
        decorations: [
            { kind: 'bigFileCabinet', dx: 50,  dy: -4 },
            { kind: 'bigFileCabinet', dx: 210, dy: -4 },
            { kind: 'shreddedHang',   dx: 80,  dy: -50 },
            { kind: 'shreddedHang',   dx: 180, dy: -45 },
            { kind: 'tornBox',        dx: 130, dy: -5 },
            { kind: 'paperStack',     dx: 95,  dy: -6 },
            { kind: 'paperStack',     dx: 165, dy: -8 },
        ],
    },
    CTRL_ALT_DEL: {
        kind: 'indoor-gated',
        gateStyle: 'serverDoor',
        gateSprite: 'lair_gate_server',
        gateColor: '#1a1a28',
        gateAccent: '#4080c0',
        nameTag: 'MAINFRAME CORE',
        arenaBg: 'bg_arena_cad',
        arenaTint: '#0a1228',
        tintAlpha: 0.34,
        decorations: [
            { kind: 'smashedServerTower', dx: 130, dy: -2 },
            { kind: 'serverRack',         dx: 30,  dy: -2 },
            { kind: 'serverRack',         dx: 220, dy: -2 },
            { kind: 'cableTangle',        dx: 90,  dy: -56 },
            { kind: 'cableTangle',        dx: 170, dy: -56 },
        ],
    },
    SPINDLER: {
        kind: 'indoor-gated',
        gateStyle: 'labDoor',
        gateColor: '#101810',
        gateAccent: '#80c060',
        nameTag: "SPINDLER'S LAB",
        arenaBg: 'bg_arena_spindler',
        arenaTint: '#082010',
        tintAlpha: 0.34,
        decorations: [
            { kind: 'bioTank',       dx: 40,  dy: -8 },
            { kind: 'bioTank',       dx: 210, dy: -8 },
            { kind: 'biohazardSign', dx: 130, dy: -40 },
            { kind: 'tornBox',       dx: 90,  dy: -5 },
        ],
    },
    BALLMER: {
        kind: 'indoor-gated',
        gateStyle: 'curtainDrop',
        gateColor: '#1a0820',
        gateAccent: '#a060ff',
        nameTag: 'BALLMER ARENA',
        arenaBg: 'bg_arena_boardroom',
        arenaTint: '#180810',
        tintAlpha: 0.32,
        decorations: [
            { kind: 'micStand',  dx: 60,  dy: -2 },
            { kind: 'micStand',  dx: 200, dy: -2 },
            { kind: 'spotlight', dx: 100, dy: -56 },
            { kind: 'spotlight', dx: 160, dy: -56 },
        ],
    },
    GATES: {
        kind: 'indoor-gated',
        gateStyle: 'curtainDrop',
        gateColor: '#1a0820',
        gateAccent: '#a060ff',
        nameTag: 'KEYNOTE STAGE',
        arenaBg: 'bg_arena_keynote',
        arenaTint: '#180828',
        tintAlpha: 0.32,
        decorations: [
            { kind: 'brokenPodium', dx: 130, dy: -2 },
            { kind: 'micStand',     dx: 60,  dy: -2 },
            { kind: 'micStand',     dx: 200, dy: -2 },
            { kind: 'spotlight',    dx: 100, dy: -56 },
            { kind: 'spotlight',    dx: 160, dy: -56 },
        ],
    },
    CLIPPY_2: {
        kind: 'outdoor-element',
        gateStyle: 'lavaWall',
        gateSprite: 'lair_gate_lava',
        gateColor: '#a01018',
        gateAccent: '#ff7030',
        nameTag: 'FOUNDER FORGE',
        arenaBg: 'bg_arena_founder',
        arenaTint: '#280808',
        tintAlpha: 0.38,
        decorations: [
            { kind: 'obelisk',  dx: 30,  dy: -8 },
            { kind: 'obelisk',  dx: 220, dy: -8 },
            { kind: 'brazier',  dx: 100, dy: -6 },
            { kind: 'brazier',  dx: 160, dy: -6 },
        ],
    },
    ALGORITHM: {
        kind: 'outdoor-element',
        gateStyle: 'dataWall',
        gateSprite: 'lair_gate_data',
        gateColor: '#102040',
        gateAccent: '#7af0ff',
        nameTag: 'DATA NEXUS',
        arenaBg: 'bg_arena_algorithm',
        arenaTint: '#081830',
        tintAlpha: 0.40,
        decorations: [
            { kind: 'dataPillar',   dx: 40,  dy: -6 },
            { kind: 'dataPillar',   dx: 220, dy: -6 },
            { kind: 'hologramTerm', dx: 120, dy: -40 },
        ],
    },
    JOBS: {
        kind: 'indoor-gated',
        gateStyle: 'curtainDrop',
        gateColor: '#0a0a12',
        gateAccent: '#c080ff',
        nameTag: 'REALITY DISTORTION',
        arenaBg: 'bg_arena_jobs',
        arenaTint: '#100020',
        tintAlpha: 0.38,
        decorations: [
            { kind: 'crackedIMac', dx: 130, dy: -50 },
            { kind: 'iMacHang',    dx: 60,  dy: -50 },
            { kind: 'iMacHang',    dx: 200, dy: -55 },
            { kind: 'spotlight',   dx: 100, dy: -56 },
            { kind: 'spotlight',   dx: 160, dy: -56 },
        ],
    },
    // R356: stage 22 final boss + post-game variants needed lair entries.
    // Without these the lair was null and arena fell back to "just a bar".
    MECHA_GATES: {
        kind: 'outdoor-element',
        gateStyle: 'lavaWall',
        gateSprite: 'lair_gate_lava',
        gateColor: '#3a1808',
        gateAccent: '#ff4020',
        nameTag: 'GATES ASCENDED',
        arenaTint: '#280808',
        tintAlpha: 0.42,
        decorations: [
            { kind: 'brazier',  dx: 50,  dy: -6 },
            { kind: 'brazier',  dx: 210, dy: -6 },
            { kind: 'obelisk',  dx: 130, dy: -10 },
        ],
    },
    HELICOPTER: {
        kind: 'outdoor-element',
        gateStyle: 'dataWall',
        gateColor: '#181818',
        gateAccent: '#ff4020',
        nameTag: 'NO PLACE TO HIDE',
        arenaTint: '#180a08',
        tintAlpha: 0.34,
        decorations: [
            { kind: 'brazier',  dx: 40,  dy: -6 },
            { kind: 'brazier',  dx: 220, dy: -6 },
        ],
    },
    // R356: GAUNTLET (stage 12 Boss Rush, server-themed) and
    // GAUNTLET_FULL (stage 16 post-game variant) — both are wave fights,
    // so the lair sells "you're in the final arena now" with deeper
    // server-blue tint + clustered server racks.
    GAUNTLET: {
        kind: 'indoor-gated',
        gateStyle: 'serverDoor',
        gateSprite: 'lair_gate_server',
        gateColor: '#0a0a18',
        gateAccent: '#7af0ff',
        nameTag: 'BOSS RUSH',
        arenaTint: '#080a20',
        tintAlpha: 0.36,
        decorations: [
            { kind: 'wreckedTurntable', dx: 130, dy: -2 },
            { kind: 'serverRack',       dx: 30,  dy: -2 },
            { kind: 'serverRack',       dx: 80,  dy: -2 },
            { kind: 'serverRack',       dx: 180, dy: -2 },
            { kind: 'serverRack',       dx: 220, dy: -2 },
            { kind: 'cableTangle',      dx: 100, dy: -56 },
            { kind: 'cableTangle',      dx: 170, dy: -56 },
        ],
    },
    GAUNTLET_FULL: {
        kind: 'indoor-gated',
        gateStyle: 'serverDoor',
        gateSprite: 'lair_gate_server',
        gateColor: '#0a0018',
        gateAccent: '#ff7080',
        nameTag: 'BOSS RUSH — UNCHAINED',
        arenaTint: '#100018',
        tintAlpha: 0.40,
        decorations: [
            { kind: 'serverRack',  dx: 30,  dy: -2 },
            { kind: 'serverRack',  dx: 80,  dy: -2 },
            { kind: 'serverRack',  dx: 180, dy: -2 },
            { kind: 'serverRack',  dx: 220, dy: -2 },
            { kind: 'cableTangle', dx: 100, dy: -56 },
            { kind: 'cableTangle', dx: 160, dy: -56 },
        ],
    },
};

// Decoration renderers — each draws relative to (x, y) which is the
// arena-floor anchor + the spec's dx/dy offset.
const DECOR = {
    paperStack(ctx, x, y) {
        ctx.fillStyle = '#e0d8c0';
        for (let i = 0; i < 5; i++) {
            ctx.fillRect(x - 6 + (i & 1) * 2, y - i * 2, 12, 2);
        }
        ctx.fillStyle = '#80684a';
        ctx.fillRect(x - 6, y, 12, 1);
    },
    brokenPrinter(ctx, x, y) {
        ctx.fillStyle = '#2a3038';
        ctx.fillRect(x - 10, y - 10, 20, 14);
        ctx.fillStyle = '#4080c0';
        ctx.fillRect(x - 8, y - 8, 6, 2);   // display
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(x - 10, y + 4, 20, 2);
        // Crack
        ctx.fillStyle = '#080810';
        ctx.fillRect(x - 4, y - 8, 1, 8);
    },
    fileBoxes(ctx, x, y) {
        ctx.fillStyle = '#a08060';
        ctx.fillRect(x - 8, y - 14, 16, 12);
        ctx.fillRect(x - 6, y - 26, 12, 10);
        ctx.fillStyle = '#604838';
        ctx.fillRect(x - 8, y - 14, 16, 1);
        ctx.fillRect(x - 6, y - 26, 12, 1);
    },
    shreddedHang(ctx, x, y) {
        ctx.fillStyle = '#e8e0c8';
        for (let i = 0; i < 6; i++) {
            const sx = x - 8 + i * 3;
            const sh = 12 + (i & 1) * 6;
            ctx.fillRect(sx, y, 1, sh);
        }
    },
    serverRack(ctx, x, y) {
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(x - 8, y - 40, 16, 40);
        ctx.fillStyle = '#1a1a2a';
        ctx.fillRect(x - 8, y - 40, 16, 1);
        // Blinking LEDs
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = (i & 1) ? '#50f070' : '#7af0ff';
            ctx.fillRect(x - 6, y - 36 + i * 5, 1, 1);
            ctx.fillRect(x + 4, y - 36 + i * 5, 1, 1);
        }
    },
    cableTangle(ctx, x, y) {
        ctx.fillStyle = '#1a1a22';
        for (let i = 0; i < 5; i++) {
            ctx.fillRect(x - 20 + i * 8, y - 8, 1, 24);
        }
    },
    bioTank(ctx, x, y) {
        ctx.fillStyle = '#2a3038';
        ctx.fillRect(x - 6, y - 20, 12, 22);
        ctx.fillStyle = '#80c060';
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x - 5, y - 18, 10, 16);
        ctx.globalAlpha = 1;
        // Glow
        ctx.fillStyle = '#a0e060';
        ctx.fillRect(x - 2, y - 10, 4, 6);
    },
    biohazardSign(ctx, x, y) {
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(x - 8, y - 8, 16, 12);
        ctx.fillStyle = '#ffd040';
        ctx.fillRect(x - 6, y - 6, 12, 8);
        ctx.fillStyle = '#1a1a22';
        // Crude trefoil
        ctx.fillRect(x - 1, y - 4, 2, 6);
        ctx.fillRect(x - 4, y - 2, 8, 2);
    },
    micStand(ctx, x, y) {
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(x - 1, y - 28, 2, 28);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x - 3, y - 30, 6, 4);
        // Base
        ctx.fillStyle = '#202020';
        ctx.fillRect(x - 4, y - 1, 8, 2);
    },
    spotlight(ctx, x, y) {
        // Light cone descending from above
        ctx.save();
        ctx.fillStyle = 'rgba(192, 128, 255, 0.18)';
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x - 14, y + 64);
        ctx.lineTo(x + 14, y + 64);
        ctx.lineTo(x + 4, y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#404048';
        ctx.fillRect(x - 4, y - 2, 8, 4);
    },
    obelisk(ctx, x, y) {
        ctx.fillStyle = '#1a0810';
        ctx.fillRect(x - 4, y - 30, 8, 32);
        ctx.fillStyle = '#3a1810';
        ctx.fillRect(x - 5, y - 30, 1, 32);
        ctx.fillRect(x + 4, y - 30, 1, 32);
        // Glyph
        ctx.fillStyle = '#a02018';
        ctx.fillRect(x - 1, y - 20, 2, 2);
        ctx.fillRect(x - 2, y - 16, 4, 1);
    },
    brazier(ctx, x, y) {
        // Bowl + animated flame
        ctx.fillStyle = '#3a1810';
        ctx.fillRect(x - 5, y - 8, 10, 4);
        ctx.fillStyle = '#1a0808';
        ctx.fillRect(x - 5, y - 4, 10, 2);
        // Flame
        const flick = (Math.sin(performance.now() * 0.012 + x * 0.1) * 0.5 + 0.5);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + flick * 0.3;
        ctx.fillStyle = '#ff5020';
        ctx.fillRect(x - 3, y - 14, 6, 8);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(x - 1, y - 16, 2, 6);
        ctx.restore();
    },
    dataPillar(ctx, x, y) {
        // Translucent data column
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#7af0ff';
        ctx.fillRect(x - 3, y - 32, 6, 34);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, y - 30, 2, 30);
        ctx.restore();
    },
    hologramTerm(ctx, x, y) {
        ctx.fillStyle = '#202028';
        ctx.fillRect(x - 6, y, 12, 4);
        // Hologram
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#7af0ff';
        ctx.fillRect(x - 5, y - 20, 10, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, y - 18, 2, 14);
        ctx.restore();
    },
    iMacHang(ctx, x, y) {
        // Translucent cube iMac suspended from above
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(x - 1, y - 30, 2, 14);
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = '#80c0ff';
        ctx.fillRect(x - 6, y - 14, 12, 12);
        ctx.restore();
        ctx.fillStyle = '#202028';
        ctx.fillRect(x - 4, y - 12, 8, 6);
    },
    // R356: bigger jungle-arena decorations so the COPIER lair reads
    // as a real overgrown clearing instead of an empty stage segment.
    giantPrinterHusk(ctx, x, y) {
        // 28x40 silhouette of a smashed industrial copier
        ctx.fillStyle = '#1a1820';
        ctx.fillRect(x - 14, y - 36, 28, 36);
        ctx.fillStyle = '#0a0810';
        ctx.fillRect(x - 14, y - 36, 28, 2);
        // Display crack
        ctx.fillStyle = '#2a3040';
        ctx.fillRect(x - 10, y - 32, 12, 6);
        ctx.fillStyle = '#08101a';
        ctx.fillRect(x - 8, y - 30, 2, 4);
        ctx.fillRect(x - 4, y - 30, 1, 4);
        ctx.fillRect(x, y - 30, 1, 4);
        // Paper-feed tray hanging out
        ctx.fillStyle = '#403828';
        ctx.fillRect(x - 16, y - 14, 32, 4);
        ctx.fillStyle = '#1a1810';
        ctx.fillRect(x - 16, y - 10, 32, 1);
        // Moss climbing up the husk
        ctx.fillStyle = '#284018';
        ctx.fillRect(x - 14, y - 8, 4, 8);
        ctx.fillRect(x + 10, y - 12, 4, 12);
        ctx.fillStyle = '#3a5824';
        ctx.fillRect(x - 13, y - 4, 2, 4);
        ctx.fillRect(x + 11, y - 8, 2, 8);
        // Toner-leak puddle at the base
        ctx.fillStyle = '#080810';
        ctx.fillRect(x - 18, y - 1, 36, 2);
    },
    paperBanner(ctx, x, y) {
        // 16x14 hanging shred of office paper / banner from above
        ctx.save();
        // Rope/cord
        ctx.fillStyle = '#403828';
        ctx.fillRect(x - 1, y - 2, 1, 6);
        ctx.fillRect(x + 8, y - 2, 1, 6);
        // Banner cloth
        ctx.fillStyle = '#d8d0b8';
        ctx.fillRect(x - 4, y + 2, 16, 14);
        ctx.fillStyle = '#a0987a';
        ctx.fillRect(x - 4, y + 2, 16, 1);
        ctx.fillRect(x - 4, y + 14, 16, 2);
        // Torn bottom edge
        ctx.fillStyle = '#d8d0b8';
        ctx.fillRect(x - 4, y + 16, 4, 2);
        ctx.fillRect(x + 4, y + 16, 4, 1);
        // Ink streak (logo / text suggestion)
        ctx.fillStyle = '#1a1828';
        ctx.fillRect(x - 2, y + 6, 12, 1);
        ctx.fillRect(x - 2, y + 10, 8, 1);
        ctx.restore();
    },
    tornBox(ctx, x, y) {
        // 12x10 ripped-open paper box on the floor
        ctx.fillStyle = '#a08060';
        ctx.fillRect(x - 6, y - 10, 12, 10);
        ctx.fillStyle = '#604838';
        ctx.fillRect(x - 6, y - 10, 12, 1);
        ctx.fillRect(x - 6, y - 1, 12, 1);
        // Jagged tear across the top
        ctx.fillStyle = '#1a0810';
        ctx.fillRect(x - 4, y - 9, 1, 2);
        ctx.fillRect(x - 2, y - 9, 1, 3);
        ctx.fillRect(x,     y - 9, 1, 2);
        ctx.fillRect(x + 2, y - 9, 1, 3);
        ctx.fillRect(x + 4, y - 9, 1, 2);
        // Paper sticking out
        ctx.fillStyle = '#e8e0c8';
        ctx.fillRect(x - 3, y - 11, 4, 2);
        ctx.fillRect(x + 1, y - 10, 3, 1);
    },
    // R358: bigger flagship props for the other themed lairs so SHREDDER
    // / CTRL_ALT_DEL / GATES / JOBS arenas read like distinct rooms too.
    // Each is ~28-32 px wide / 36-44 px tall — comparable to giantPrinterHusk.
    bigFileCabinet(ctx, x, y) {
        // 4-drawer steel cabinet, drawer half open, paper spilling out
        ctx.fillStyle = '#403838';
        ctx.fillRect(x - 12, y - 44, 24, 44);
        ctx.fillStyle = '#1a1818';
        ctx.fillRect(x - 12, y - 44, 24, 1);
        ctx.fillRect(x - 12, y, 24, 1);
        // Drawers
        for (let i = 0; i < 4; i++) {
            const dy = y - 42 + i * 10;
            ctx.fillStyle = '#5a5050';
            ctx.fillRect(x - 11, dy, 22, 8);
            ctx.fillStyle = '#202020';
            ctx.fillRect(x - 11, dy, 22, 1);
            // Handle
            ctx.fillStyle = '#8a7860';
            ctx.fillRect(x - 2, dy + 3, 4, 1);
        }
        // Top drawer hanging open (offset down + paper spilling)
        ctx.fillStyle = '#5a5050';
        ctx.fillRect(x - 11 - 2, y - 32 - 2, 14, 8);
        ctx.fillStyle = '#1a1818';
        ctx.fillRect(x - 11 - 2, y - 32 - 2, 14, 1);
        // Paper spilling out
        ctx.fillStyle = '#e0d8c0';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(x - 16 + i, y - 26 + i, 6, 2);
        }
    },
    smashedServerTower(ctx, x, y) {
        // 30x44 server tower, dented, broken display, sparks
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(x - 15, y - 44, 30, 44);
        ctx.fillStyle = '#181828';
        ctx.fillRect(x - 15, y - 44, 30, 1);
        ctx.fillRect(x - 15, y, 30, 1);
        // Drives in vertical column
        for (let i = 0; i < 5; i++) {
            const dy = y - 40 + i * 7;
            ctx.fillStyle = '#1a1a2a';
            ctx.fillRect(x - 13, dy, 26, 5);
            // Drive bezel
            ctx.fillStyle = '#2a2a3a';
            ctx.fillRect(x - 12, dy + 1, 24, 1);
            // Status LEDs
            ctx.fillStyle = (i % 2) ? '#50f070' : '#ff3040';
            ctx.fillRect(x + 9, dy + 2, 1, 1);
            ctx.fillRect(x + 11, dy + 2, 1, 1);
        }
        // Dent on left side
        ctx.fillStyle = '#000005';
        ctx.fillRect(x - 15, y - 30, 4, 8);
        // Smoke wisp rising
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#3a3a48';
        ctx.fillRect(x - 2, y - 48, 4, 4);
        ctx.fillRect(x - 4, y - 52, 8, 3);
        ctx.restore();
    },
    brokenPodium(ctx, x, y) {
        // Smashed keynote presentation podium — wood + mic + cracked screen
        ctx.fillStyle = '#3a2818';
        ctx.fillRect(x - 12, y - 18, 24, 18);
        ctx.fillStyle = '#1a1008';
        ctx.fillRect(x - 12, y - 18, 24, 1);
        // Marble veining
        ctx.fillStyle = '#5a4028';
        ctx.fillRect(x - 10, y - 14, 2, 12);
        ctx.fillRect(x + 6, y - 12, 1, 10);
        // Cracked screen on top
        ctx.fillStyle = '#101018';
        ctx.fillRect(x - 8, y - 28, 16, 10);
        ctx.fillStyle = '#2a1018';
        ctx.fillRect(x - 8, y - 28, 16, 1);
        // Cracks
        ctx.fillStyle = '#080010';
        ctx.fillRect(x - 4, y - 26, 1, 6);
        ctx.fillRect(x, y - 25, 1, 4);
        ctx.fillRect(x + 3, y - 24, 1, 3);
        // Toppled mic
        ctx.fillStyle = '#202028';
        ctx.fillRect(x + 10, y - 22, 8, 1);
        ctx.fillStyle = '#404048';
        ctx.fillRect(x + 16, y - 24, 3, 3);
    },
    crackedIMac(ctx, x, y) {
        // Hanging cube iMac with massive crack across the screen
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(x - 1, y - 40, 2, 14);
        // Frame
        ctx.fillStyle = '#a0a0b8';
        ctx.fillRect(x - 12, y - 28, 24, 24);
        ctx.fillStyle = '#606078';
        ctx.fillRect(x - 12, y - 28, 24, 1);
        // Screen
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#80c0ff';
        ctx.fillRect(x - 10, y - 26, 20, 20);
        ctx.restore();
        // Massive crack: lightning-bolt jag across the screen
        ctx.fillStyle = '#101018';
        ctx.fillRect(x - 8, y - 26, 2, 4);
        ctx.fillRect(x - 6, y - 22, 1, 3);
        ctx.fillRect(x - 5, y - 19, 1, 3);
        ctx.fillRect(x - 4, y - 16, 1, 3);
        ctx.fillRect(x - 3, y - 13, 1, 3);
        ctx.fillRect(x - 2, y - 10, 1, 4);
        // Smaller branching cracks
        ctx.fillRect(x - 4, y - 16, 4, 1);
        ctx.fillRect(x + 2, y - 21, 4, 1);
        // Apple-logo glow remnant
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 4, y - 24, 2, 2);
    },
    wreckedTurntable(ctx, x, y) {
        // Boss-rush trophy: smashed DJ turntable / mixer with broken vinyl
        ctx.fillStyle = '#202028';
        ctx.fillRect(x - 14, y - 8, 28, 8);
        ctx.fillStyle = '#404048';
        ctx.fillRect(x - 14, y - 8, 28, 1);
        // Two turntables (left + right)
        for (const cx of [x - 8, x + 8]) {
            ctx.fillStyle = '#101010';
            ctx.fillRect(cx - 5, y - 14, 10, 10);
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(cx - 4, y - 13, 8, 8);
            // Vinyl ring
            ctx.fillStyle = '#181818';
            ctx.fillRect(cx - 3, y - 12, 6, 6);
            // Broken — diagonal crack
            ctx.fillStyle = '#7a3030';
            ctx.fillRect(cx - 2, y - 10, 4, 1);
        }
        // Cracked LCD between them
        ctx.fillStyle = '#0a0a18';
        ctx.fillRect(x - 4, y - 12, 8, 4);
        ctx.fillStyle = '#7a3030';
        ctx.fillRect(x - 3, y - 11, 1, 2);
        ctx.fillRect(x + 1, y - 10, 2, 1);
    },
};

// Gate sprite — drawn behind the player on the LEFT edge of the lair.
// Animates IN (slides down or rises) over `gateEnterT` frames, then
// stays solid until the boss dies + lairExitT counts down.
function drawGate(ctx, x, y, w, h, spec, enterProgress, exitProgress) {
    // enterProgress: 0 (off-screen) → 1 (fully closed)
    // exitProgress: 0 (closed) → 1 (fully open / dissolved)
    const reveal = enterProgress * (1 - exitProgress);
    if (reveal < 0.02) return;
    // R342: PAINTED gate sprite path. If the spec has gateSprite and the
    // asset is loaded, draw the painted strip with a clip-mask that
    // reveals only the bottom `reveal` portion (so the gate "drops" from
    // above as enterProgress ramps 0→1). The painted strip is the
    // primary art; procedural drawGate below stays as a fallback.
    if (spec.gateSprite) {
        const img = sprites.images.get(spec.gateSprite);
        if (img) {
            // Lava + data are outdoor "rising" gates — they grow from the
            // BOTTOM. Doors/curtains/vines fall from the TOP. Dissolve
            // (exit) just fades alpha.
            const risesFromBottom = (spec.gateStyle === 'lavaWall' || spec.gateStyle === 'dataWall');
            const revealH = Math.round(h * reveal);
            ctx.save();
            // For data wall, additive blend so the cyan glow reads correctly.
            if (spec.gateStyle === 'dataWall') {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.85 * (1 - exitProgress);
            } else {
                ctx.globalAlpha = (1 - exitProgress);
            }
            ctx.imageSmoothingEnabled = false;
            if (risesFromBottom) {
                // Show the BOTTOM revealH pixels of the destination,
                // sampling the BOTTOM revealH pixels of the source.
                const srcH = Math.round(img.height * reveal);
                const srcY = img.height - srcH;
                ctx.drawImage(img, 0, srcY, img.width, srcH,
                              x, y - revealH, w, revealH);
            } else {
                // Drops from the TOP — show TOP revealH pixels of dest,
                // sampling the TOP revealH pixels of source.
                const srcH = Math.round(img.height * reveal);
                ctx.drawImage(img, 0, 0, img.width, srcH,
                              x, y - h, w, revealH);
            }
            ctx.restore();
            return;
        }
    }
    ctx.save();
    if (spec.gateStyle === 'metalDoor' || spec.gateStyle === 'serverDoor' || spec.gateStyle === 'labDoor') {
        // Sliding door — drops from above
        const doorY = y - h + (h * (1 - reveal));
        ctx.fillStyle = spec.gateColor;
        ctx.fillRect(x, doorY, w, y - doorY);
        // Bolts / trim
        ctx.fillStyle = spec.gateAccent;
        ctx.fillRect(x, doorY, w, 1);
        ctx.fillRect(x, y - 1, w, 1);
        // Center seam
        ctx.fillStyle = '#000';
        ctx.fillRect(x + w / 2 | 0, doorY, 1, y - doorY);
    } else if (spec.gateStyle === 'curtainDrop') {
        // Theatrical curtain
        const doorY = y - h + (h * (1 - reveal));
        ctx.fillStyle = spec.gateColor;
        ctx.fillRect(x, doorY, w, y - doorY);
        // Velvet folds
        ctx.fillStyle = spec.gateAccent;
        for (let i = 0; i < 4; i++) {
            const fx = x + (i * w / 4) + 2;
            ctx.fillRect(fx, doorY, 1, y - doorY);
        }
    } else if (spec.gateStyle === 'lavaWall') {
        // Lava wall rising from below
        const lavaY = y - (h * reveal);
        ctx.fillStyle = spec.gateColor;
        ctx.fillRect(x, lavaY, w, y - lavaY);
        // Bright orange top crest
        ctx.fillStyle = spec.gateAccent;
        ctx.fillRect(x, lavaY, w, 2);
        // Embers
        for (let i = 0; i < 5; i++) {
            const ex = x + ((i * 13 + (performance.now() / 20 | 0)) % w);
            const ey = lavaY - (i * 4) % 20;
            ctx.fillStyle = i & 1 ? '#ffaa30' : '#ffe070';
            ctx.fillRect(ex, ey, 1, 1);
        }
    } else if (spec.gateStyle === 'dataWall') {
        // Translucent data field
        ctx.save();
        ctx.globalAlpha = 0.6 * reveal;
        ctx.fillStyle = spec.gateColor;
        ctx.fillRect(x, y - h, w, h);
        // Vertical streamers
        ctx.fillStyle = spec.gateAccent;
        const tn = (performance.now() / 30 | 0);
        for (let i = 0; i < 8; i++) {
            const sx = x + (i * w / 8);
            const sy = y - h + ((tn + i * 7) % h);
            ctx.fillRect(sx, sy, 2, 8);
        }
        ctx.restore();
    } else if (spec.gateStyle === 'vine') {
        // Tangled vines — outdoor jungle gate
        ctx.fillStyle = spec.gateColor;
        ctx.fillRect(x, y - h * reveal, w, h * reveal);
        ctx.fillStyle = spec.gateAccent;
        // Vine strands
        for (let i = 0; i < 6; i++) {
            const vx = x + (i * w / 6) + 2;
            const vy = y - h * reveal;
            ctx.fillRect(vx, vy, 1, h * reveal);
        }
        // Leaves
        for (let i = 0; i < 8; i++) {
            const lx = x + (i * w / 8) + (i & 1 ? 1 : -1) * 3;
            const ly = y - (i * 6) % (h * reveal);
            ctx.fillRect(lx, ly, 3, 2);
        }
    }
    ctx.restore();
}

export class BossLair {
    constructor(bossKind, arenaX, arenaY, arenaW, arenaH) {
        this.spec = BOSS_LAIRS[bossKind];
        this.bossKind = bossKind;
        // Arena bounds in world coords. The gate sits at the LEFT edge
        // (since the player is moving right when bossTrigger fires).
        this.arenaX = arenaX;
        this.arenaY = arenaY;
        this.arenaW = arenaW;
        this.arenaH = arenaH;
        // Animation timers
        this.enterT = 0;   // 0 → ENTER_FRAMES (gate dropping)
        this.exitT = 0;    // 0 → EXIT_FRAMES (gate dissolving on boss death)
        this.state = 'entering';
        this.nameTagT = 0;
    }
    get gateWorldX() { return this.arenaX; }
    // R342: painted gate strips are ~32 px wide. The leftWall clamp
    // (player can't cross back into the gate) uses gateW. 32 gives the
    // painted art room to read; the procedural fallback uses 8.
    get gateW() { return this.spec && this.spec.gateSprite ? 32 : 8; }
    static ENTER_FRAMES = 60;
    static EXIT_FRAMES = 50;

    update() {
        this.nameTagT++;
        if (this.state === 'entering') {
            this.enterT++;
            if (this.enterT >= BossLair.ENTER_FRAMES) {
                this.state = 'active';
            }
        } else if (this.state === 'exiting') {
            this.exitT++;
            if (this.exitT >= BossLair.EXIT_FRAMES) {
                this.state = 'done';
            }
        }
    }

    triggerExit() {
        if (this.state === 'active' || this.state === 'entering') {
            this.state = 'exiting';
            this.exitT = 0;
            audio.sfx?.('unlock');
        }
    }

    // Returns the world-x the player can't walk left of (the lair's
    // left wall). Used to clamp player.x during the fight.
    leftWall() {
        // Only enforced once the gate is mostly closed (after frame ~30)
        if (this.state === 'entering' && this.enterT < 30) return -Infinity;
        if (this.state === 'done') return -Infinity;
        return this.arenaX + this.gateW;
    }

    // R356: arena backdrop — atmospheric tint + vignette over the arena
    // region, painted AFTER parallax+level but BEFORE decorations and
    // gameplay. Sells "this is a distinct place" without redrawing the
    // background art. The tint color comes from the spec so each boss
    // gets a unique mood (jungle=green, lava=red, server=blue, etc.).
    // Faded in/out by enter/exit timers so the transition is smooth.
    drawArenaBackdrop(ctx, camera) {
        if (!this.spec) return;
        const tint = this.spec.arenaTint;
        if (!tint) return;
        // Compute fade. 0 during early-enter so the original bg shows,
        // ramps to spec.tintAlpha over the enter window, and fades back
        // out symmetrically when the boss dies (exit window).
        let f;
        if (this.state === 'entering') {
            f = Math.min(1, this.enterT / BossLair.ENTER_FRAMES);
        } else if (this.state === 'exiting') {
            f = Math.max(0, 1 - this.exitT / BossLair.EXIT_FRAMES);
        } else {
            f = 1;
        }
        const alpha = (this.spec.tintAlpha || 0.28) * f;
        const x = Math.round(this.arenaX - camera.viewX);
        const y = Math.round(this.arenaY - camera.viewY);
        // Solid tint quad first (flat wash)
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = tint;
        ctx.fillRect(x, y, this.arenaW, this.arenaH);
        ctx.restore();
        // Radial vignette: darker corners pull the focus inward. Cheap
        // approximation — 4 corner fades layered with destination-out.
        ctx.save();
        ctx.globalAlpha = 0.45 * f;
        const grad = ctx.createRadialGradient(
            x + this.arenaW / 2, y + this.arenaH / 2, this.arenaH * 0.2,
            x + this.arenaW / 2, y + this.arenaH / 2, this.arenaW * 0.55,
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, this.arenaW, this.arenaH);
        ctx.restore();
    }

    drawDecorationsBack(ctx, camera) {
        // R385: procedural pixel-rect decorations (paperStack,
        // bigFileCabinet, brokenPrinter, etc.) are now baked into the
        // painted arena bg images (bg_arena_*.png). Drawing the legacy
        // procedural ones on top stacked Atari-cheap shapes over the
        // painted scene. Skip them entirely when a painted arenaBg is
        // active; only fall back to procedural for lairs missing a
        // painted bg.
        if (!this.spec) return;
        if (this.spec.arenaBg) return;
        const floorY = this.arenaY + this.arenaH;
        for (const d of this.spec.decorations) {
            const wx = this.arenaX + (d.dx | 0);
            const wy = floorY + (d.dy | 0);
            const sx = Math.round(wx - camera.viewX);
            const sy = Math.round(wy - camera.viewY);
            const fn = DECOR[d.kind];
            if (fn) fn(ctx, sx, sy);
        }
    }

    drawGate(ctx, camera) {
        if (!this.spec || this.state === 'done') return;
        const enter = Math.min(1, this.enterT / BossLair.ENTER_FRAMES);
        const exit = Math.min(1, this.exitT / BossLair.EXIT_FRAMES);
        const x = Math.round(this.arenaX - camera.viewX);
        const y = Math.round(this.arenaY + this.arenaH - camera.viewY);
        drawGate(ctx, x, y, this.gateW, this.arenaH, this.spec, enter, exit);
    }

    drawNameTag(ctx) {
        if (!this.spec) return;
        // Show name-tag for ~110 frames after entering
        if (this.nameTagT > 110) return;
        const fade = this.nameTagT < 90 ? 1 : (110 - this.nameTagT) / 20;
        ctx.save();
        ctx.globalAlpha = fade;
        // Underline bar
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 36, GAME.W, 10);
        drawText(ctx, this.spec.nameTag, GAME.W / 2, 38, '#ffe070', 1, 'center');
        ctx.restore();
    }
}

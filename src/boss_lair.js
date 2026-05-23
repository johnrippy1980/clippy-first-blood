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
    COPIER_3000: {
        kind: 'outdoor-element',
        gateStyle: 'vine',
        gateSprite: 'lair_gate_vine',
        gateColor: '#284018',
        gateAccent: '#608028',
        nameTag: "COPIER'S CLEARING",
        decorations: [
            // Scattered paper stacks
            { kind: 'paperStack',   dx: 40,  dy: -8 },
            { kind: 'paperStack',   dx: 200, dy: -6 },
            // Broken printer husk silhouette in the back
            { kind: 'brokenPrinter', dx: 120, dy: -16 },
        ],
    },
    SHREDDER: {
        kind: 'indoor-gated',
        gateStyle: 'metalDoor',
        gateSprite: 'lair_gate_server',
        gateColor: '#3a2820',
        gateAccent: '#806040',
        nameTag: 'STORAGE LOCKER',
        decorations: [
            { kind: 'fileBoxes',    dx: 30,  dy: -4 },
            { kind: 'fileBoxes',    dx: 220, dy: -4 },
            { kind: 'shreddedHang', dx: 80,  dy: -50 },
            { kind: 'shreddedHang', dx: 180, dy: -45 },
        ],
    },
    CTRL_ALT_DEL: {
        kind: 'indoor-gated',
        gateStyle: 'serverDoor',
        gateSprite: 'lair_gate_server',
        gateColor: '#1a1a28',
        gateAccent: '#4080c0',
        nameTag: 'MAINFRAME CORE',
        decorations: [
            { kind: 'serverRack', dx: 30,  dy: -2 },
            { kind: 'serverRack', dx: 220, dy: -2 },
            { kind: 'cableTangle', dx: 100, dy: -56 },
        ],
    },
    SPINDLER: {
        kind: 'indoor-gated',
        gateStyle: 'labDoor',
        gateColor: '#101810',
        gateAccent: '#80c060',
        nameTag: "SPINDLER'S LAB",
        decorations: [
            { kind: 'bioTank',    dx: 40,  dy: -8 },
            { kind: 'bioTank',    dx: 210, dy: -8 },
            { kind: 'biohazardSign', dx: 130, dy: -40 },
        ],
    },
    GATES: {
        kind: 'indoor-gated',
        gateStyle: 'curtainDrop',
        gateColor: '#1a0820',
        gateAccent: '#a060ff',
        nameTag: 'KEYNOTE STAGE',
        decorations: [
            { kind: 'micStand',  dx: 60,  dy: -2 },
            { kind: 'micStand',  dx: 200, dy: -2 },
            { kind: 'spotlight', dx: 100, dy: -56 },
            { kind: 'spotlight', dx: 160, dy: -56 },
        ],
    },
    CLIPPY_2: {
        kind: 'outdoor-element',
        gateStyle: 'lavaWall',
        gateSprite: 'lair_gate_lava',
        gateColor: '#a01018',
        gateAccent: '#ff7030',
        nameTag: 'FOUNDER FORGE',
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
        decorations: [
            { kind: 'dataPillar',  dx: 40,  dy: -6 },
            { kind: 'dataPillar',  dx: 220, dy: -6 },
            { kind: 'hologramTerm', dx: 120, dy: -40 },
        ],
    },
    JOBS: {
        kind: 'indoor-gated',
        gateStyle: 'curtainDrop',
        gateColor: '#0a0a12',
        gateAccent: '#c080ff',
        nameTag: 'REALITY DISTORTION',
        decorations: [
            { kind: 'iMacHang', dx: 60,  dy: -50 },
            { kind: 'iMacHang', dx: 180, dy: -55 },
            { kind: 'spotlight', dx: 130, dy: -56 },
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

    drawDecorationsBack(ctx, camera) {
        // Behind the boss / player — atmospheric stuff
        if (!this.spec) return;
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

// Sprite loader. Two paths:
//   1) Individual PNG file per frame (e.g. assets/sprites/run_01.png)
//   2) Procedural pixel-art fallback drawn from CLIPPY_DATA tables
//
// We prefer (1) when art is available, fall back to (2) so the game is
// always playable even if assets are missing.

class SpriteSet {
    constructor() {
        this.images = new Map();     // frameName -> HTMLImageElement
        this.dims = new Map();       // frameName -> {w, h}
    }

    async loadAll(manifest, basePath) {
        const promises = [];
        for (const [name, file] of Object.entries(manifest)) {
            promises.push(this._loadOne(name, `${basePath}/${file}`));
        }
        await Promise.allSettled(promises);
    }

    _loadOne(name, src) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                this.images.set(name, img);
                this.dims.set(name, { w: img.width, h: img.height });
                resolve(true);
            };
            img.onerror = () => {
                // Non-fatal: procedural renderer will take over for this frame.
                resolve(false);
            };
            img.src = src;
        });
    }

    has(name) { return this.images.has(name); }

    draw(ctx, name, x, y, flipH = false, scale = 1) {
        const img = this.images.get(name);
        if (!img) return false;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        if (flipH) {
            ctx.translate(Math.round(x) + img.width * scale, Math.round(y));
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
        } else {
            ctx.drawImage(img, Math.round(x), Math.round(y), img.width * scale, img.height * scale);
        }
        ctx.restore();
        return true;
    }
}

export const sprites = new SpriteSet();

// Manifest: what we expect on disk. Missing files are non-fatal.
export const CLIPPY_MANIFEST = {
    'idle':            'stand.png',
    'run_1':           'run_01.png',
    'run_2':           'run_02.png',
    'run_3':           'run_03.png',
    'jump':            'jump.png',
    'fall':            'jump.png',
    'crouch':          'crouch_shoot.png',
    'prone':           'prone.png',
    'prone_shoot':     'prone_shoot.png',
    'prone_heavy':     'prone_shoot_heavy.png',
    'run_shoot_1':     'run_shoot_01.png',
    'run_shoot_2':     'run_shoot_02.png',
    'death_hit':       'death_hit.png',
    'death_explode':   'death_explode.png',
    'death_burning':   'death_burning.png',
};

export const ENEMY_MANIFEST = {
    'folder':       'folder.png',
    'folder_alt':   'folder_yellow.png',
    'cabinet':      'file_cabinet.png',
};

// ============================================================
// Procedural fallback renderer. Pure fillRect, palette-indexed.
// Used when a frame's PNG didn't load.
// ============================================================

export const PALETTE = {
    OUTLINE:    '#0a0608',
    SHADOW:     '#2a1828',
    CLIP_DARK:  '#404858',
    CLIP_MID:   '#80889a',
    CLIP_HI:    '#c8d0e0',
    EYE_WHITE:  '#f0e8e0',
    EYE_DARK:   '#0a0612',
    BANDANA:    '#a01020',
    BANDANA_HI: '#d83040',
    BLOOD:      '#601018',
    GUN_DARK:   '#1a1a1a',
    GUN_MID:    '#4a4a4a',
    GUN_HI:     '#7a7a7a',
};

// Color codes used inside the pixel maps below.
// 0 = transparent, 1 = outline, 2-9 = palette entries.
const P = [
    null,
    PALETTE.OUTLINE,    // 1
    PALETTE.SHADOW,     // 2
    PALETTE.CLIP_DARK,  // 3
    PALETTE.CLIP_MID,   // 4
    PALETTE.CLIP_HI,    // 5
    PALETTE.EYE_WHITE,  // 6
    PALETTE.EYE_DARK,   // 7
    PALETTE.BANDANA,    // 8
    PALETTE.BANDANA_HI, // 9
    PALETTE.GUN_DARK,   // a
    PALETTE.GUN_MID,    // b
    PALETTE.GUN_HI,     // c
    PALETTE.BLOOD,      // d
];

const PALETTE_KEY = '_123456789abcd'; // index 0 is transparent

// Compact sprite string: rows of 16 chars. '_' = transparent.
// 16x24 sprite for Clippy. Dark soldier paperclip.
const CLIPPY_IDLE = [
    '________8888____',
    '_______89998____',
    '_______89998____',
    '________8888____',
    '________1111____',
    '_______155551___',
    '______15555551__',
    '______15555551__',
    '_____1555446751_',
    '_____1555446751_',
    '______155555551_',
    '______1555555a__',
    '_______1555aaa1_',
    '______15555baba_',
    '_____15555ba1cb_',
    '_____155551__cb_',
    '____1555551____1',
    '____15551_______',
    '_____1551_______',
    '______151_______',
    '______151_______',
    '______151_______',
    '_____1551_______',
    '_____1111_______',
];

const CLIPPY_RUN_1 = [
    '________8888____',
    '_______89998____',
    '_______89998____',
    '________1111____',
    '________1111____',
    '_______155551___',
    '______15555551__',
    '_____1555446751_',
    '_____1555446751_',
    '______155555551_',
    '______15555aaaa_',
    '_______1555baba_',
    '______15555cb1cb',
    '_____15551__cb__',
    '_____1551_______',
    '______151_______',
    '____1551________',
    '___155551_______',
    '__1551_1551_____',
    '__151___151_____',
    '_1551___1551____',
    '_111_____111____',
    '________________',
    '________________',
];

const CLIPPY_RUN_2 = [
    '________8888____',
    '_______89998____',
    '_______89998____',
    '________1111____',
    '________1111____',
    '_______155551___',
    '______15555551__',
    '_____1555446751_',
    '_____1555446751_',
    '______155555551_',
    '______15555aaaa_',
    '_______1555baba_',
    '______155555cb1c',
    '_____15555__cb__',
    '______155_______',
    '_______15_______',
    '________1_______',
    '_______151______',
    '______1551______',
    '_____15551______',
    '____15551_______',
    '____111_________',
    '________________',
    '________________',
];

const CLIPPY_JUMP = [
    '________8888____',
    '_______89998____',
    '________1111____',
    '_______155551___',
    '______15555551__',
    '_____1555446751_',
    '_____1555446751_',
    '______155555551_',
    '_____aa55555aaaa',
    '____aba_555_baba',
    '___aba__555__1cb',
    '__aba___155___cb',
    '__a______15_____',
    '__________1_____',
    '_______15555____',
    '______1555551___',
    '_____15511551___',
    '_____151__151___',
    '____1551__1551__',
    '____151____151__',
    '___1551____1551_',
    '___111______111_',
    '________________',
    '________________',
];

const CLIPPY_PRONE = [
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '____888_________',
    '___89998________',
    '___11118________',
    '__15555111______',
    '_155555551111___',
    '_15555aaaaaaa11_',
    '_15555aaaaaaaba_',
    '_1115555aaaab_b_',
    '___1111111111___',
];

const CLIPPY_HURT = [
    '________8888____',
    '_______89998____',
    '_______89_98____',
    '________1111____',
    '_______155551___',
    '______15ddddd1__',
    '______1dddddd1d_',
    '_____1ddddddd1d_',
    '_____1dddddddd1_',
    '______155555551_',
    '_______155555a__',
    '________15555___',
    '_______dd1551___',
    '______dd_151____',
    '_____dd__1551___',
    '_____dd__1551___',
    '_____15____151__',
    '_____151____15__',
    '______15____15__',
    '_______15___15__',
    '________15__15__',
    '_________11111__',
    '________________',
    '________________',
];

const CLIPPY_DEATH = [
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________________',
    '________888_____',
    '_______89998____',
    '____1ddd1118____',
    '__1d11d11551____',
    '_1ddd1155551____',
    '_1dd11d551dd____',
    '__1ddd1d_1dd____',
    '___1dd1__1dd____',
    '____dd____dd____',
    '____ddd__ddd____',
    '_____ddddddd____',
    '_____1ddddd1____',
    '______11111_____',
    '________________',
    '________________',
    '________________',
    '________________',
];

const CLIPPY_FRAMES = {
    'idle':    CLIPPY_IDLE,
    'run_1':   CLIPPY_RUN_1,
    'run_2':   CLIPPY_RUN_2,
    'run_3':   CLIPPY_IDLE,
    'jump':    CLIPPY_JUMP,
    'fall':    CLIPPY_JUMP,
    'crouch':  CLIPPY_PRONE,
    'prone':   CLIPPY_PRONE,
    'prone_shoot': CLIPPY_PRONE,
    'prone_heavy': CLIPPY_PRONE,
    'run_shoot_1': CLIPPY_RUN_1,
    'run_shoot_2': CLIPPY_RUN_2,
    'death_hit':   CLIPPY_HURT,
    'death_explode': CLIPPY_DEATH,
    'death_burning': CLIPPY_DEATH,
    'hurt':    CLIPPY_HURT,
};

function drawPixelString(ctx, frame, x, y, flipH = false, palette = P) {
    const rows = frame.length;
    const cols = frame[0].length;
    ctx.save();
    if (flipH) {
        ctx.translate(Math.round(x) + cols, Math.round(y));
        ctx.scale(-1, 1);
        x = 0; y = 0;
    } else {
        x = Math.round(x); y = Math.round(y);
    }
    for (let r = 0; r < rows; r++) {
        const row = frame[r];
        for (let c = 0; c < cols; c++) {
            const ch = row[c];
            const idx = PALETTE_KEY.indexOf(ch);
            if (idx <= 0) continue;
            const color = palette[idx];
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect(x + c, y + r, 1, 1);
        }
    }
    ctx.restore();
}

// Public API: try PNG first, fall back to procedural pixel string.
export function drawClippyFrame(ctx, frameName, x, y, flipH = false, scale = 1) {
    if (sprites.has(frameName) && sprites.draw(ctx, frameName, x, y, flipH, scale)) return;
    const frame = CLIPPY_FRAMES[frameName] || CLIPPY_FRAMES.idle;
    drawPixelString(ctx, frame, x, y, flipH);
}

// Enemy procedural sprites — designed to feel hostile, not cute.
const ENEMY_FOLDER = [
    '__1111111111____',
    '_1ee99eeeeee1___',
    '1e9999eeeeeee1__',
    '1e99eeeeeeeeee1_',
    '1eeeeeeeeeeeeee1',
    '1eee77eeee77eee1',
    '1eee71eeee71eee1',
    '1eeeeeeeeeeeeee1',
    '1eeeeeeddeeeeeed',
    '1eeeeedddddeeeed',
    '1eeeeddddddddeed',
    '1ee111111111111d',
    '1ddddddddddddd1_',
    '_111111111111___',
];
const ENEMY_STAPLER = [
    '_____111111_____',
    '____1aaaaaa1____',
    '___1a111111a1___',
    '__1a1bbbbbb1a1__',
    '_1a1bbcccccba1__',
    '_1abbccccccba1__',
    '_1a1bbbbbb1a1___',
    '__1aa11111aa1___',
    '____1aaaaa1_____',
    '_____11111______',
    '________________',
];
const ENEMY_CABINET = [
    '_1111111111_____',
    '_1cccccccc1_____',
    '_1c111111c1_____',
    '_1c155551c1_____',
    '_1c155551c1_____',
    '_1c111111c1_____',
    '_1cccccccc1_____',
    '_1c111111c1_____',
    '_1c155551c1_____',
    '_1c155551c1_____',
    '_1c111111c1_____',
    '_1cccccccc1_____',
    '_1111111111_____',
];

const ENEMY_FRAMES = {
    'folder':  ENEMY_FOLDER,
    'stapler': ENEMY_STAPLER,
    'cabinet': ENEMY_CABINET,
};

// Enemy palette — bone whites, dirty creams, rust reds. Hostile.
const EP = [
    null,
    PALETTE.OUTLINE,    // 1
    '#3a2818',          // 2
    '#604030',          // 3
    '#806050',          // 4
    '#a08070',          // 5
    PALETTE.EYE_WHITE,  // 6
    PALETTE.EYE_DARK,   // 7
    '#603020',          // 8
    '#b08060',          // 9
    PALETTE.GUN_DARK,   // a
    PALETTE.GUN_MID,    // b
    PALETTE.GUN_HI,     // c
    PALETTE.BLOOD,      // d
    '#d8b890',          // e (manila yellow)
];

export function drawEnemyFrame(ctx, frameName, x, y, flipH = false) {
    if (sprites.has(frameName) && sprites.draw(ctx, frameName, x, y, flipH)) return;
    const frame = ENEMY_FRAMES[frameName] || ENEMY_FRAMES.folder;
    drawPixelString(ctx, frame, x, y, flipH, EP);
}

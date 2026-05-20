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
        // Silhouette canvas cache — keyed by `${name}::${color}`. Built on
        // first request (lazy), reused forever. Replaces the old per-frame
        // ctx.filter='brightness(0)' / 'invert(1)' draw path, which forces a
        // GPU pipeline state change on every halo stamp (4×/sprite, 60Hz =
        // 240 filter changes/sec for just Clippy). Pre-baked silhouettes
        // blit as plain images — ~10x cheaper on low-end GPUs and Safari.
        this._silhouettes = new Map();
        // Aggregate loading counters across all loadAll() calls. Boot screen
        // reads these for a progress bar. settled = loaded+failed.
        this.totalAssets = 0;
        this.settledAssets = 0;
    }

    // Build (and cache) a silhouette canvas: same shape as the sprite, but
    // every visible pixel filled with `color`. Alpha is preserved from the
    // source. `color` is any CSS color string ('#000', '#fff', etc).
    _bakeSilhouette(name, color) {
        const img = this.images.get(name);
        if (!img) return null;
        const off = document.createElement('canvas');
        off.width = img.width;
        off.height = img.height;
        const octx = off.getContext('2d');
        // Step 1: draw the sprite normally. We need its alpha mask.
        octx.imageSmoothingEnabled = false;
        octx.drawImage(img, 0, 0);
        // Step 2: tint everything in-place using `source-in`, which keeps
        // only pixels that already exist (the sprite's alpha mask) but
        // recolors them to the fillStyle. No filter, no GPU state change.
        octx.globalCompositeOperation = 'source-in';
        octx.fillStyle = color;
        octx.fillRect(0, 0, off.width, off.height);
        return off;
    }

    // Get-or-bake. Returns null if the source sprite isn't loaded.
    silhouette(name, color) {
        if (!this.images.has(name)) return null;
        const key = name + '::' + color;
        let canv = this._silhouettes.get(key);
        if (!canv) {
            canv = this._bakeSilhouette(name, color);
            if (canv) this._silhouettes.set(key, canv);
        }
        return canv;
    }

    // Draw a pre-baked silhouette at (x, y). Mirrors the public `draw`
    // signature so callers can swap them 1:1. Returns false if the sprite
    // hasn't loaded yet (caller can skip the halo cleanly).
    drawSilhouette(ctx, name, color, x, y, flipH = false, scale = 1) {
        const canv = this.silhouette(name, color);
        if (!canv) return false;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        if (flipH) {
            ctx.translate(Math.round(x) + canv.width * scale, Math.round(y));
            ctx.scale(-1, 1);
            ctx.drawImage(canv, 0, 0, canv.width * scale, canv.height * scale);
        } else {
            ctx.drawImage(canv, Math.round(x), Math.round(y), canv.width * scale, canv.height * scale);
        }
        ctx.restore();
        return true;
    }

    async loadAll(manifest, basePath) {
        const entries = Object.entries(manifest);
        this.totalAssets += entries.length;
        const promises = [];
        for (const [name, file] of entries) {
            promises.push(this._loadOne(name, `${basePath}/${file}`).finally(() => {
                this.settledAssets++;
            }));
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

// Scene backgrounds — big painted scenes (256x144 region) for the title screen
// and story pages. Loaded lazily, drawn full-width with letterboxing.
export const SCENE_MANIFEST = {
    'title_bg':     'scene_title.png',
    'story_fired':  'scene_story_fired.png',
    'story_home':   'scene_story_1_home.png',
    'story_bomb':   'scene_story_2_bomb.png',
    'story_boardroom': 'scene_story_boardroom.png',
    'story_hill':   'scene_story_3_hill.png',
    'story_list':   'scene_story_4_list.png',
    'ending':       'scene_ending.png',
    // Per-stage entrance cinematic cards — displayed between stage clear and
    // the next stage intro. Each shows Clippy arriving at the next location.
    'card_breakroom':  'card_stage2_breakroom.png',
    'card_serverroom': 'card_stage3_serverroom.png',
    'card_boardroom':  'card_stage4_boardroom.png',
    'card_keynote':    'card_stage5_keynote.png',
    'card_founder':    'card_stage6_founder.png',
    'card_bossrush':   'card_stage7_bossrush.png',
    'card_cloud':      'card_stage8_cloud.png',
    'card_recyclebin': 'card_stage9_recyclebin.png',
    // Boss intro cinematic backgrounds — painted villain stages shown
    // during the BOSS_INTRO scene. Keyed by boss code so _drawBossIntro
    // can look up the matching backdrop. Falls back to dim _drawPlay when
    // the asset is missing.
    'boss_intro_COPIER_3000':  'boss_intros/boss_intro_copier.png',
    'boss_intro_SHREDDER':     'boss_intros/boss_intro_shredder.png',
    'boss_intro_CTRL_ALT_DEL': 'boss_intros/boss_intro_bsod.png',
    'boss_intro_BALLMER':      'boss_intros/boss_intro_boardroom.png',
    'boss_intro_GATES':        'boss_intros/boss_intro_founder.png',
    'boss_intro_CLIPPY_2':     'boss_intros/boss_intro_founder.png',
    'boss_intro_GAUNTLET':     'boss_intros/boss_intro_bossrush.png',
    'boss_intro_ALGORITHM':    'boss_intros/boss_intro_algorithm.png',
};

// Painted parallax backgrounds, one per stage theme. Loaded from assets/bg/.
// These are wide bitmap plates from gpt-image-2 — the parallax renderer scrolls
// them horizontally as the camera moves and tiles them seamlessly.
export const BG_MANIFEST = {
    'bg_jungle':     'bg_jungle.png',
    'bg_breakroom':  'bg_breakroom.png',
    'bg_serverroom': 'bg_serverroom.png',
    'bg_boardroom':  'bg_boardroom.png',
    'bg_keynote':    'bg_keynote.png',
    'bg_founder':    'bg_founder.png',
    'bg_cloud':      'bg_cloud.png',
    // Ground tile bitmaps — used by level.js to texture solid blocks. Sampled.
    'ground_jungle':     'ground_jungle.png',
    'ground_breakroom':  'ground_breakroom.png',
    'ground_serverroom': 'ground_serverroom.png',
    'ground_boardroom':  'ground_boardroom.png',
    'ground_keynote':    'ground_keynote.png',
    'ground_founder':    'ground_founder.png',
    'ground_cloud':      'ground_cloud.png',
    // r108 universal tile sprites — painted via Local Howl, processed
    // through process-v2-sprites.py. Render branches in level.js prefer
    // these when loaded and fall back to the procedural fillRect path
    // otherwise, so missing assets are non-fatal during boot.
    'tile_ladder':       'tile_ladder.png',
    'tile_spike':        'tile_spike.png',
    'tile_crate':        'tile_crate.png',
    'tile_door':         'tile_door.png',
};

// Manifest: what we expect on disk. Missing files are non-fatal.
// v2_*.png frames come from the new title-art-quality batch generated via
// gpt-image-2; pack_*.png are the prior pre-existing pack as fallback.
export const CLIPPY_MANIFEST = {
    // R155: v3 clean Clippy — body sprite WITHOUT a baked weapon. Weapons
    // are now separate sprite overlays (WEAPON_MANIFEST below), letting
    // the body proportions stay consistent across poses regardless of
    // which weapon Clippy is holding.
    'idle':            'v3_idle.png',
    'idle_alt':        'v3_idle.png',
    // 5-frame run cycle. Until additional painted run frames arrive we just
    // alternate run-pose with idle-pose — gives a 2-frame stride bob that
    // reads as motion without mixing in grungy pack frames.
    'run_1':           'v3_run.png',
    'run_2':           'v3_run.png',
    'run_3':           'v3_run.png',
    'run_4':           'v3_run.png',
    'run_5':           'v3_run.png',
    'jump':            'v3_jump.png',
    // r99: painted poses re-integrated after running them through
    // process-v2-sprites.py (white-bg knockout + crop + 56h downscale).
    // Files are now proper game-resolution PNGs with alpha, not 1024x1024
    // canvas-fillers. Visually verified via tools/capture-screenshots.mjs.
    'jump_aim':        'v2_jump_aim.png',
    'fall':            'v2_jump.png',
    'spin_1':          'v2_spin_1.png',
    'spin_2':          'v2_spin_2.png',
    'crouch':          'pack_crouch_aim.png',
    'crouch_shoot':    'pack_crouch_shoot_1.png',
    'crouch_shoot_2':  'pack_crouch_shoot_2.png',
    'crouch_shoot_3':  'pack_crouch_shoot_3.png',
    'prone':           'v2_prone.png',
    'prone_shoot':     'v2_prone_crawl.png',
    'prone_heavy':     'v2_prone_crawl.png',
    'run_shoot_1':     'v2_run_shoot.png',
    'run_shoot_2':     'v2_run_shoot.png',
    'run_shoot_3':     'v2_run_shoot.png',
    'run_shoot_4':     'v2_run_shoot.png',
    'shoot':           'v2_shoot.png',
    'shoot_alt':       'v2_shoot.png',
    'aim':             'v2_idle.png',
    'aim_up':          'v2_shoot_up.png',
    'aim_diag':        'v2_aim_diag_up.png',
    'aim_diag_down':   'v2_aim_diag_down.png',
    'climb_1':         'pack_rope_1.png',
    'climb_2':         'pack_rope_2.png',
    'cover':           'pack_cover_1.png',
    'cover_shoot':     'pack_cover_2.png',
    'hurt':            'v2_hurt2.png',
    'backdash':        'v2_backdash.png',
    'death_hit':       'v2_hurt2.png',
    'death_explode':   'v2_death.png',
    'death_burning':   'v2_death.png',
    // R152: ledge-grab poses — hang from edge, mid-pullup, settled atop.
    'ledge_hang':      'v2_ledge_hang.png',
    'ledge_climb_1':   'v2_ledge_climb_1.png',
    'ledge_climb_2':   'v2_ledge_climb_2.png',
};

// R155: separate painted weapon sprites composited onto Clippy's hand at
// render time. Each PNG is a side-view weapon with the barrel pointing
// RIGHT. The compositor anchors the weapon's left edge to Clippy's grip
// point, flips horizontally when facing left, and rotates around the grip
// per the aim vector. Replaces the procedural barrel that used to draw on
// top of baked-weapon Clippy sprites (two weapons rendered at once).
export const WEAPON_MANIFEST = {
    'weapon_shotgun':   'weapon_shotgun.png',
    'weapon_spread':    'weapon_spread.png',
    'weapon_laser':     'weapon_laser.png',
    'weapon_flame':     'weapon_flame.png',
    'weapon_homing':    'weapon_homing.png',
    'weapon_thunder':   'weapon_thunder.png',
    'weapon_chainsaw':  'weapon_chainsaw.png',
    // weapon_mg.png lands when its Local Howl job completes; manifest entry
    // pre-registered so first-load picks it up.
    'weapon_mg':        'weapon_mg.png',
};

export const ENEMY_MANIFEST = {
    // v2 painted enemies — prefer these; fall through to procedural if 404.
    // The r96 swap to *_painted.png 64x64 was reverted: visual review showed
    // the downscaled high-res alts lost too much detail and read as ambiguous
    // blobs in-game (folder looked like a shoe). The painted PNGs stay on disk
    // for future iteration at a different scale or with sharper source art.
    // r105/r106: per-state painted enemy frames. All 4 grunt types now
    // have full walk/attack/hurt/death animation sets — each enemy reads
    // visibly different in each gameplay action (jaws wide on attack,
    // crumpled on hurt, shredded on death) instead of one static pose.
    'folder':           'v2_folder.png',
    'folder_walk':      'v2_folder_walk.png',
    'folder_attack':    'v2_folder_attack.png',
    'folder_hurt':      'v2_folder_hurt.png',
    'folder_death':     'v2_folder_death.png',
    'stapler':          'v2_stapler.png',
    'stapler_walk':     'v2_stapler_walk.png',
    'stapler_attack':   'v2_stapler_attack.png',
    'stapler_hurt':     'v2_stapler_hurt.png',
    'stapler_death':    'v2_stapler_death.png',
    'cabinet':          'v2_cabinet.png',
    'cabinet_walk':     'v2_cabinet_walk.png',
    'cabinet_attack':   'v2_cabinet_attack.png',
    'cabinet_hurt':     'v2_cabinet_hurt.png',
    'cabinet_death':    'v2_cabinet_death.png',
    'holepunch':        'v2_holepunch.png',
    'holepunch_walk':   'v2_holepunch_walk.png',
    'holepunch_attack': 'v2_holepunch_attack.png',
    'holepunch_hurt':   'v2_holepunch_hurt.png',
    'holepunch_death':  'v2_holepunch_death.png',
    // Bosses (painted PNGs already in place)
    // r99: painted bosses re-integrated through process-v2-sprites.py
    // (white-bg corners auto-detected and knocked out, crop tight, downscale
    // to 96h). Original 60x60 boss_*.png files kept on disk as rollback.
    'boss_COPIER_3000': 'boss_copier_painted.png',
    'boss_SHREDDER':    'boss_shredder_painted.png',
    'boss_CTRL_ALT_DEL':'boss_bsod_painted.png',
    'boss_BALLMER':     'boss_ballmer_painted.png',
    'boss_GATES':       'boss_founder_painted.png',
    'boss_CLIPPY_2':    'boss_clippy2_painted.png',
    'boss_ALGORITHM':   'boss_algorithm_painted.png',
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
// `outline` (default true) draws a 1px navy halo so the sprite reads against
// painted backgrounds. Disable for boss intros / death sequences where the
// halo would conflict with white flash effects.
export function drawClippyFrame(ctx, frameName, x, y, flipH = false, scale = 1, outline = true) {
    const hasImg = sprites.has(frameName);
    if (outline && hasImg) {
        // 1px dark halo via offset stamps. Cheap, no filter API needed.
        const prev = ctx.globalCompositeOperation;
        // Draw the sprite 4 times tinted dark + offset; the actual pixels of
        // each stamp form the outline, and the central pass covers the body.
        ctx.save();
        // Tint via globalCompositeOperation=multiply on a temp pass works
        // poorly with image alpha. Fall back to drawing the sprite with reduced
        // brightness as a stamp. Canvas filter is widely supported in evergreen
        // browsers (Chrome/Firefox/Safari/Edge); fall back to skipping outline.
        // Pre-baked white-silhouette canvas — replaces the old per-frame
        // ctx.filter='brightness(0) invert(1)' which was ~10x more expensive
        // on Safari + low-end GPUs (forces pipeline state change per call,
        // and we call it 4× per Clippy frame).
        ctx.globalAlpha = 0.55;
        sprites.drawSilhouette(ctx, frameName, '#ffffff', x - 1, y, flipH, scale);
        sprites.drawSilhouette(ctx, frameName, '#ffffff', x + 1, y, flipH, scale);
        sprites.drawSilhouette(ctx, frameName, '#ffffff', x, y - 1, flipH, scale);
        sprites.drawSilhouette(ctx, frameName, '#ffffff', x, y + 1, flipH, scale);
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.globalCompositeOperation = prev;
    }
    if (hasImg && sprites.draw(ctx, frameName, x, y, flipH, scale)) return;
    const frame = CLIPPY_FRAMES[frameName] || CLIPPY_FRAMES.idle;
    drawPixelString(ctx, frame, x, y, flipH);
}

// Tell callers how big a frame is so they can anchor the sprite to the
// hitbox correctly. Returns rendered (drawn) dimensions, not source size.
export function getSpriteDims(frameName) {
    const d = sprites.dims.get(frameName);
    if (d) return { w: d.w, h: d.h };
    const frame = CLIPPY_FRAMES[frameName] || CLIPPY_FRAMES.idle;
    return { w: frame[0]?.length || 24, h: frame.length || 32 };
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

export function drawEnemyFrame(ctx, frameName, x, y, flipH = false, outline = true) {
    const hasImg = sprites.has(frameName);
    if (outline && hasImg) {
        // Pre-baked black-silhouette canvas (R153 cached path). Visual
        // hierarchy stays the same: enemies = dark halo, Clippy = bright.
        ctx.save();
        ctx.globalAlpha = 0.65;
        sprites.drawSilhouette(ctx, frameName, '#000000', x - 1, y, flipH);
        sprites.drawSilhouette(ctx, frameName, '#000000', x + 1, y, flipH);
        sprites.drawSilhouette(ctx, frameName, '#000000', x, y - 1, flipH);
        sprites.drawSilhouette(ctx, frameName, '#000000', x, y + 1, flipH);
        ctx.globalAlpha = 1;
        ctx.restore();
    }
    if (hasImg && sprites.draw(ctx, frameName, x, y, flipH)) return;
    const frame = ENEMY_FRAMES[frameName] || ENEMY_FRAMES.folder;
    drawPixelString(ctx, frame, x, y, flipH, EP);
}

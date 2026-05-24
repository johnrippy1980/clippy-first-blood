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
    // R226: card filenames retain their pre-renumber number-prefix for git
    // history; mapping by key (game.js STAGE_CARDS) is what shifts.
    // R292: new story slide — Clippy on the hilltop overlooking Microsoft.
    'story_tower':     'scene_story_tower.png',
    // R293: Spindler FPS lab reveal card (stage 19 CORE BREACH).
    'card_spindler_lab': 'card_spindler_lab.png',
    // R301: Mecha-Gates reveal card — towering mech over apocalyptic ruins.
    'card_mecha_reveal': 'card_mecha_reveal.png',
    // R306: Mecha Approach beat-em-up street-card.
    'card_mecha_approach': 'card_mecha_approach.png',
    'card_breakroom':  'card_stage2_breakroom.png',
    'card_serverroom': 'card_stage3_serverroom.png',
    'card_pipeline':   'card_stage4_pipeline.png',
    'card_boardroom':  'card_stage4_boardroom.png',
    'card_keynote':    'card_stage5_keynote.png',
    'card_founder':    'card_stage6_founder.png',
    'card_bossrush':   'card_stage7_bossrush.png',
    'card_cloud':      'card_stage8_cloud.png',
    'card_recyclebin': 'card_stage9_recyclebin.png',
    // R281: Ballmer mini-arc cards — office approach, escape cinematic,
    // and arena boss-reveal. Used by STAGE_CARDS (game.js) for stages 6-7
    // and the boss-escapes cinematic between stage 5 and 6.
    'card_ballmer_office':  'card_ballmer_office.png',
    'card_ballmer_escapes': 'card_ballmer_escapes.png',
    'card_ballmer_arena':   'card_ballmer_arena.png',
    // R291: Gates mini-arc cards — keynote corridor + escape + arena.
    'card_gates_escapes':   'card_gates_escapes.png',
    'card_gates_arena':     'card_gates_arena.png',
    // R357: Mecha trilogy cinematic cards — chopper appears over the
    // horizon between stage 20 and 21, then crashes between 21 and 22
    // (Mecha-Gates emerges from the wreckage).
    'card_chopper_horizon': 'card_chopper_horizon.png',
    'card_chopper_crash':   'card_chopper_crash.png',
    // Boss intro cinematic backgrounds — painted villain stages shown
    // during the BOSS_INTRO scene. Keyed by boss code so _drawBossIntro
    // can look up the matching backdrop. Falls back to dim _drawPlay when
    // the asset is missing.
    'boss_intro_COPIER_3000':  'boss_intros/boss_intro_copier.png',
    'boss_intro_SHREDDER':     'boss_intros/boss_intro_shredder.png',
    'boss_intro_CTRL_ALT_DEL': 'boss_intros/boss_intro_bsod.png',
    'boss_intro_BALLMER':      'boss_intros/boss_intro_boardroom.png',
    // R197: GATES was mapped to founder.png, but GATES is stage 5 = KEYNOTE
    // theme. Each boss should get its own painted plate, so route GATES to
    // the keynote one and leave CLIPPY_2 on founder (its actual stage theme).
    'boss_intro_GATES':        'boss_intros/boss_intro_keynote.png',
    'boss_intro_CLIPPY_2':     'boss_intros/boss_intro_founder.png',
    'boss_intro_GAUNTLET':     'boss_intros/boss_intro_bossrush.png',
    'boss_intro_ALGORITHM':    'boss_intros/boss_intro_algorithm.png',
    // R177: Steve Jobs as the after-credits secret boss for the future
    // "Reality Distortion Field" stage. Painted portrait used for the
    // boss-intro cinematic + the scene-gallery thumbnail.
    'boss_intro_JOBS':         'boss_intros/boss_intro_jobs.png',
    // R226: Dr. Spindler boss-intro plate. Re-uses the cinematic portrait
    // from boss_spindler_portrait.png (lab backdrop already baked in).
    'boss_intro_SPINDLER':     'boss_intros/boss_intro_spindler.png',
    // R359: post-game boss intros — reuse cinematic-card art so the
    // post-game stages have painted intro plates instead of falling
    // through to the dim _drawPlay fallback. HELICOPTER and MECHA_GATES
    // get their R357 painted Mecha-trilogy cards; GAUNTLET_FULL reuses
    // the original boss-rush plate.
    'boss_intro_HELICOPTER':     'card_chopper_horizon.png',
    'boss_intro_MECHA_GATES':    'card_chopper_crash.png',
    'boss_intro_GAUNTLET_FULL':  'boss_intros/boss_intro_bossrush.png',
    // R177: post-game epilogue beats. Clippy's redemption arc shown after
    // the main ending: laughing-stock → memes → 2026 comeback → wonders
    // about Siri. Cinematic plays only after the player has beaten the
    // game once (gated by achievements.unlocked has 'clear_game').
    'epi_laughingstock': 'scene_epi_1_laughingstock.png',
    'epi_memes':         'scene_epi_2_memes.png',
    'epi_comeback':      'scene_epi_3_comeback.png',
    'epi_mac_siri':      'scene_epi_4_mac_siri.png',
};

// Painted parallax backgrounds, one per stage theme. Loaded from assets/bg/.
// These are wide bitmap plates from gpt-image-2 — the parallax renderer scrolls
// them horizontally as the camera moves and tiles them seamlessly.
export const BG_MANIFEST = {
    'bg_jungle':       'bg_jungle.png',
    'bg_breakroom':    'bg_breakroom.png',
    'bg_serverroom':   'bg_serverroom.png',
    'bg_boardroom':    'bg_boardroom.png',
    'bg_keynote':      'bg_keynote.png',
    'bg_founder':      'bg_founder.png',
    'bg_cloud':        'bg_cloud.png',
    // R362: dark companions for the warm-lit themes (founder lair has
    // braziers, breakroom has fluorescents). Parallax engine auto
    // cross-fades when present — flickers the actual painted lights.
    'bg_founder_dark':   'bg_founder_dark.png',
    'bg_breakroom_dark': 'bg_breakroom_dark.png',
    // R190: Stage 13 (Reality Distortion Field) — painted keynote-auditorium
    // backdrop with floating bondi-blue cube iMacs. Falls back to the
    // procedural REALITY palette if the asset isn't loaded.
    'bg_reality':    'bg_reality_distortion.png',
    // R226: THE PIPELINE (stage 4). Two painted plates — sewer descent for
    // the first half, lab interior for the second. Parallax draws bg_sewer
    // by default; the lab swap happens partway through (see Level setup).
    'bg_sewer':      'bg_sewer.png',
    'bg_sewer_lab':  'bg_sewer_lab.png',
    // Ground tile bitmaps — used by level.js to texture solid blocks. Sampled.
    'ground_jungle':     'ground_jungle.png',
    'ground_breakroom':  'ground_breakroom.png',
    'ground_serverroom': 'ground_serverroom.png',
    'ground_boardroom':  'ground_boardroom.png',
    'ground_keynote':    'ground_keynote.png',
    'ground_founder':    'ground_founder.png',
    'ground_cloud':      'ground_cloud.png',
    // R311: painted ground tilesets for previously-procedural themes
    'ground_sewer':      'ground_sewer.png',
    'ground_reality':    'ground_reality.png',
    'ground_apocalypse': 'ground_apocalypse.png',
    // R311: painted platform tile strips (top-of-strip = playable surface)
    'plat_jungle':       'plat_jungle.png',
    'plat_sewer':        'plat_sewer.png',
    'plat_founder':      'plat_founder.png',
    'plat_keynote':      'plat_keynote.png',
    // R320: remaining platform strips. Every theme now painted.
    'plat_breakroom':    'plat_breakroom.png',
    'plat_serverroom':   'plat_serverroom.png',
    'plat_boardroom':    'plat_boardroom.png',
    'plat_cloud':        'plat_cloud.png',
    'plat_reality':      'plat_reality.png',
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
    // R179: v5 Clippy bodies — the canonical character. Each frame has the
    // iconic chrome-wire paperclip silhouette with the inner curl reading
    // as body, two large white googly eyes with angry black eyebrows, a
    // red Rambo headband with trailing ends, and black combat boots.
    // Generated as 1024x1536 painted PNGs via Local Howl gpt-image-2 and
    // processed through tools/process-r179-v5.py (BFS-flood knockout +
    // LANCZOS to 56px height). Replaces v3 (which had a baked rifle in
    // every pose) and v4 (which lost the face entirely).
    // R201: idle/shoot/aim/jump/crouch all routed to v6 run frames so the
    // painted rifle is visible in EVERY state. v5_idle.png was the original
    // armless idle pose, but the player kept seeing Clippy standing still
    // with no gun and a tiny procedural arm stub. The v6 frames lean
    // slightly forward but the rifle reads correctly at every aim band.
    // Frame 2 (passing-leg) is most "neutral" — used for idle + standing
    // shoot. Frame 1/3 (split-stride) carry over for the aim variants.
    'idle':            'v6_run_2.png',
    'idle_alt':        'v6_run_2.png',
    // R199: v6 run cycle — 4 proper frames (left-stride, pass, right-stride,
    // pass) from the new painted run sheet. Replaces v5_run.png × 5 which
    // was all the same frame and made Clippy look like he was skating.
    // The engine cycles 5 keys; we map run_5 back to run_1 to close the
    // loop without a duplicate-frame stutter.
    'run_1':           'v6_run_1.png',
    'run_2':           'v6_run_2.png',
    'run_3':           'v6_run_3.png',
    'run_4':           'v6_run_4.png',
    'run_5':           'v6_run_1.png',
    // R263: back-facing Clippy sprites for the FPS arena (Contra-base
    // "into the screen" framing). Generated as a gpt-image-2 sheet,
    // sliced via tools/process-r263-r264-sprites.py.
    'clippy_back_idle':  'clippy_back_idle.png',
    'clippy_back_run_1': 'clippy_back_run_1.png',
    'clippy_back_run_2': 'clippy_back_run_2.png',
    'clippy_back_run_3': 'clippy_back_run_3.png',
    'clippy_back_run_4': 'clippy_back_run_4.png',
    // R264: FPS-arena enemy sprites — Dr. Spindler's lab theme.
    'lab_turret':        'lab_turret.png',
    'lab_grunt':         'lab_grunt.png',
    'lab_shield':        'lab_shield.png',
    'lab_core':          'lab_core.png',
    // R268: FPS-arena enemy sprites + backdrop — Ballmer office theme.
    'office_turret':     'office_turret.png',     // wall-mounted fax machine
    'office_grunt':      'office_grunt.png',      // suit grunt w/ floppy disk
    'office_drone':      'office_drone.png',      // desk-lamp shield drone
    'boss_ballmer_fps':  'boss_ballmer_fps.png',  // Ballmer w/ chair (core boss)
    'bg_office':         'bg_office.png',         // corridor backdrop
    // R291: Gates FPS arc — keynote auditorium theme.
    'bg_keynote_corridor':      'bg_keynote_corridor.png',
    'bg_keynote_corridor_dark': 'bg_keynote_corridor_dark.png',
    'keynote_turret':      'keynote_turret.png',
    'keynote_grunt':       'keynote_grunt.png',
    'keynote_drone':       'keynote_drone.png',
    'boss_gates_fps':      'boss_gates_fps.png',
    // R301: super-secret Mecha-Gates stage — post-apocalypse final boss.
    'bg_apocalypse':            'bg_apocalypse.png',
    // R362: dark companion for the apocalypse rubble bg (stage 21
    // helicopter chase). Same cross-fade model as bg_apocalypse_street.
    'bg_apocalypse_dark':       'bg_apocalypse_dark.png',
    'boss_mecha_gates':    'boss_mecha_gates.png',
    // R366: painted multi-frame sprite sheets for beat-em-up enemies.
    // Generated via Local Howl gpt-image-2 + sliced to individual
    // frames. Renderer cycles 1→2(→3) based on enemy._animT.
    'boss_mecha_gates_1':  'boss_mecha_gates_1.png',
    'boss_mecha_gates_2':  'boss_mecha_gates_2.png',
    'boss_mecha_gates_3':  'boss_mecha_gates_3.png',
    // R306: beat-em-up Mecha Approach enemy sprites + street backdrop.
    'bg_apocalypse_street':      'bg_apocalypse_street.png',
    // R362: dark-variant — same composition, lit windows dimmed + fires
    // muted. Cross-faded with the bright version in the beat-em-up
    // renderer so windows flicker + fires pulse on the ACTUAL painted
    // pixel positions (not random vector overlays).
    'bg_apocalypse_street_dark': 'bg_apocalypse_street_dark.png',
    'scavenger':            'scavenger.png',
    'scavenger_1':          'scavenger_1.png',
    'scavenger_2':          'scavenger_2.png',
    'scavenger_3':          'scavenger_3.png',
    'drone':                'drone.png',
    'drone_1':              'drone_1.png',
    'drone_2':              'drone_2.png',
    'helicopter':           'helicopter.png',
    'brawler':              'brawler.png',
    'brawler_1':            'brawler_1.png',
    'brawler_2':            'brawler_2.png',
    'brawler_3':            'brawler_3.png',
    // R269: FPS-arena electric barrier hazard — 4-frame pulse cycle
    // (full-on → crackling → off → powering up). Tiled across the corridor
    // at mid-depth when segment 3 is active.
    'barrier_1':         'barrier_1.png',
    'barrier_2':         'barrier_2.png',
    'barrier_3':         'barrier_3.png',
    'barrier_4':         'barrier_4.png',
    // R270: spinning floppy-disk projectile — 4-frame rotation cycle for
    // office_grunt shots (suits throwing disks like ninja stars).
    'floppy_1':          'floppy_1.png',
    'floppy_2':          'floppy_2.png',
    'floppy_3':          'floppy_3.png',
    'floppy_4':          'floppy_4.png',
    // R271: tumbling office chair — 4-frame rotation cycle for Ballmer's
    // chair-throw attack pattern.
    'chair_1':           'chair_1.png',
    'chair_2':           'chair_2.png',
    'chair_3':           'chair_3.png',
    'chair_4':           'chair_4.png',
    // R272: Microsoft HQ exterior — stage-intro backdrop for stage 16.
    'bg_microsoft_hq':      'bg_microsoft_hq.png',
    'bg_microsoft_hq_dark': 'bg_microsoft_hq_dark.png',
    // R202: per-weapon painted Clippy poses (single static frame each).
    // _frameForState routes RUN/idle to the right one when this.weapon !== 'MG'.
    // CHAINSAW pending — its asset is the last gen still running.
    'v6_shotgun':      'v6_shotgun.png',
    'v6_spread':       'v6_spread.png',
    'v6_laser':        'v6_laser.png',
    'v6_flame':        'v6_flame.png',
    'v6_homing':       'v6_homing.png',
    'v6_thunder':      'v6_thunder.png',
    'v6_chainsaw':     'v6_chainsaw.png',
    // R204: painted mid-air Clippy holding the rifle. v5_jump.png was
    // armless; the new v6_jump.png keeps the rifle visible mid-air so
    // jump-shooting matches the run/idle/aim states. Used for rising,
    // peak, and falling beats of the jump arc.
    // R339: 'jump' was aliased to v6_jump.png which is a shooting pose
    // (gun extended, muzzle visible). Made it look like Clippy was firing
    // mid-jump when he wasn't. New 'jump_neutral.png' has gun lowered
    // at his side — proper non-shooting jump pose. The 'jump_aim' alias
    // keeps pointing to v6_jump for the mid-air shoot pose.
    'jump':            'jump_neutral.png',
    'jump_aim':        'v6_jump.png',
    // R353: 'fall' was still aliased to v6_jump.png (rifle-extended shoot
    // pose) which made Clippy look like he was firing mid-fall when he
    // wasn't. Use the neutral pose so non-firing falls match non-firing
    // jumps. Shooting-while-falling still hits the 'jump_aim' branch.
    'fall':            'jump_neutral.png',
    'spin_1':          'v2_spin_1.png',
    'spin_2':          'v2_spin_2.png',
    'crouch':          'pack_crouch_aim.png',
    // R169: pack_crouch_shoot_* have a rifle baked in too. We don't have a
    // clean crouch yet — keep the painted crouch pose but drop the shoot
    // variants down to the same clean pose so the rotated weapon overlay
    // is the only barrel visible.
    'crouch_shoot':    'pack_crouch_aim.png',
    'crouch_shoot_2':  'pack_crouch_aim.png',
    'crouch_shoot_3':  'pack_crouch_aim.png',
    'prone':           'v2_prone.png',
    'prone_shoot':     'v2_prone_crawl.png',
    'prone_heavy':     'v2_prone_crawl.png',
    // R169: route run-shoot / aim-band / jump-aim back through the CLEAN
    // v3 body sprites. The old v2_* variants have a rifle baked into the
    // pose, so when _drawAimArm composited the separate weapon sprite on
    // top the player would see two weapons + the baked one wouldn't rotate
    // to follow aim. Pointing these to v3_* means the body stays clean and
    // the procedural arm is the only weapon visible.
    // R199: run-shoot variants point at the same v6 cycle so the legs
    // animate while firing too. The rifle is already painted into every
    // frame, so no separate weapon overlay needed.
    'run_shoot_1':     'v6_run_1.png',
    'run_shoot_2':     'v6_run_2.png',
    'run_shoot_3':     'v6_run_3.png',
    'run_shoot_4':     'v6_run_4.png',
    // R201: shoot + aim band — point at v6 frames with the rifle baked
    // in. Same painted body as the run cycle so the silhouette stays
    // consistent between RUN and standing-shoot. Aim variants will all
    // show the rifle held forward — the bullet origin/_drawAimArm
    // procedural overlay is now disabled (rifle is in the sprite).
    'shoot':           'v6_run_2.png',
    'shoot_alt':       'v6_run_4.png',
    'aim':             'v6_run_2.png',
    'aim_up':          'v6_run_2.png',
    'aim_diag':        'v6_run_2.png',
    'aim_diag_down':   'v6_run_2.png',
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
    // R340: v2_ledge_hang lacked the red bandana headband that's on every
    // other Clippy state — broke character consistency on ledge-grab.
    // ledge_hang_v3 painted with headband visible + gun slung on back.
    'ledge_hang':      'ledge_hang_v3.png',
    'ledge_climb_1':   'v2_ledge_climb_1.png',
    'ledge_climb_2':   'v2_ledge_climb_2.png',
};

// R155: composited weapon-overlay sprites. Each PNG is drawn at Clippy's
// grip point, rotated to aim direction, and flipped vertically when
// facing left so the gun bottom stays down. R178 rollback: weapon_mg
// overlay disabled while v3 body sprites are restored — v3 bakes a
// rifle into the pose, so loading arm_mg.png on top would double up.
// When v5 lands with armless bodies AND a proper Clippy face, re-add
// 'weapon_mg': 'arm_mg.png' to wire the overlay back in.
export const WEAPON_MANIFEST = {
    'weapon_shotgun':   'weapon_shotgun.png',
    'weapon_spread':    'weapon_spread.png',
    'weapon_laser':     'weapon_laser.png',
    'weapon_flame':     'weapon_flame.png',
    'weapon_homing':    'weapon_homing.png',
    'weapon_thunder':   'weapon_thunder.png',
    'weapon_chainsaw':  'weapon_chainsaw.png',
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
    // R346: painted sprites for the 3 R325 grunt-behaviors. Previously
    // these enemies reused folder/holepunch/cabinet art, so they looked
    // identical to existing grunts despite having different attack patterns.
    'dive_bomber':      'dive_bomber.png',
    'summoner':         'summoner.png',
    'shielder':         'shielder.png',
    // R347: painted dying-Clippy NPC for the R332 ambient_props system.
    // Replaces the procedural 4-pixel grey blob with a wounded paperclip
    // silhouette + corpse on the ground.
    'clippy_dying_stagger': 'clippy_dying_stagger.png',
    'clippy_dying_dead':    'clippy_dying_dead.png',
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
    // R199: real painted Jobs sprites. Two distinct assets:
    //   - `enemy_jobs.png` (27×44) — in-game side-view character, used
    //     by the boss draw at the gameplay hitbox scale.
    //   - `boss_jobs_portrait.png` (88×88) — boss-intro card portrait,
    //     chest-up with the keynote backdrop baked in. Drops into the
    //     intro renderer's 88×88 slot. Stops the red-rectangle fallback
    //     that fired when boss_JOBS was unmapped.
    'enemy_jobs':       'enemy_jobs.png',
    'boss_JOBS':        'boss_jobs_portrait.png',
    // R334: chase-helicopter boss sprite (gemini-pro). 56x20 AH-1-style
    // attack chopper with motion-blurred rotor baked into the sprite.
    // Key is lowercased to match the Boss.draw lookup pattern
    // `'enemy_' + kind.toLowerCase()`.
    'enemy_helicopter': 'enemy_HELICOPTER.png',
    // R342: painted boss-lair gate sprites. Replaces the procedural
    // drawGate() fillRect path in boss_lair.js.
    'lair_gate_vine':   'lair_gate_vine.png',
    'lair_gate_lava':   'lair_gate_lava.png',
    'lair_gate_server': 'lair_gate_server.png',
    'lair_gate_data':   'lair_gate_data.png',
    // R226: Dr. Spindler — stage 4 lab boss. Multi-frame sheet sliced into
    // separate state PNGs so the boss draw can pick by phase.
    'boss_SPINDLER':         'boss_spindler.png',
    'boss_SPINDLER_fire':    'boss_spindler_fire.png',
    'boss_SPINDLER_hurt':    'boss_spindler_hurt.png',
    'boss_SPINDLER_death':   'boss_spindler_death.png',
    'boss_SPINDLER_portrait':'boss_spindler_portrait.png',
    // R312: painted cover-tile props per theme (tree / vending machine /
    // server rack / podium / lava boulder / sewer pipe junction). Loaded
    // alongside enemies because they live in assets/sprites/. level.js
    // _drawTile branches on `sprites.has('cover_<theme>')` and falls back
    // to the procedural render when missing.
    'cover_jungle':     'cover_jungle.png',
    'cover_breakroom':  'cover_breakroom.png',
    'cover_serverroom': 'cover_serverroom.png',
    'cover_keynote':    'cover_keynote.png',
    'cover_founder':    'cover_founder.png',
    'cover_sewer':      'cover_sewer.png',
    // R344: outdoor-stage covers are CAVES / ROCK ALCOVES (no doors).
    // cover_jungle + cover_founder were re-painted as caves; cloud and
    // apocalypse are new — for stages that didn't have COVER tiles
    // placed before R344.
    'cover_cloud':      'cover_cloud.png',
    'cover_apocalypse': 'cover_apocalypse.png',
    // R317: painted pickup icons (gemini-pro). pickups.js draw() prefers
    // these when available + falls back to the R318 painted-crate render
    // (gradient body + letter glyph) when the icon for a type is missing.
    'pickup_life':      'pickup_life.png',
    'pickup_grenade':   'pickup_grenade.png',
    'pickup_1up':       'pickup_1up.png',
    'pickup_chainsaw':  'pickup_chainsaw.png',
    // R319: painted weapon-pickup icons.
    'pickup_mg':        'pickup_mg.png',
    'pickup_spread':    'pickup_spread.png',
    'pickup_laser':     'pickup_laser.png',
    'pickup_flame':     'pickup_flame.png',
    'pickup_homing':    'pickup_homing.png',
    'pickup_thunder':   'pickup_thunder.png',
    'pickup_shotgun':   'pickup_shotgun.png',
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
// `outline` (default true) draws a 1px dark halo so the sprite reads against
// painted backgrounds. R173: was '#ffffff' at 0.55a — read as a white Photoshop
// cutout against the painted swamps. Swapped to a deep navy at lower alpha so
// the halo sells "this sprite is the foreground subject" without screaming
// "fake compositing." Disable for boss intros / death sequences where the
// halo would conflict with white flash effects.
export function drawClippyFrame(ctx, frameName, x, y, flipH = false, scale = 1, outline = true) {
    const hasImg = sprites.has(frameName);
    if (outline && hasImg) {
        const prev = ctx.globalCompositeOperation;
        ctx.save();
        // R173: dark navy halo at 0.35 alpha — the painted body sells itself
        // against the painted bg, the halo is just enough edge contrast for
        // the silhouette to read. Half the alpha + dark color = no more
        // photoshop-cutout feel.
        ctx.globalAlpha = 0.35;
        sprites.drawSilhouette(ctx, frameName, '#0a0a18', x - 1, y, flipH, scale);
        sprites.drawSilhouette(ctx, frameName, '#0a0a18', x + 1, y, flipH, scale);
        sprites.drawSilhouette(ctx, frameName, '#0a0a18', x, y - 1, flipH, scale);
        sprites.drawSilhouette(ctx, frameName, '#0a0a18', x, y + 1, flipH, scale);
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

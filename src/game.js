// Top-level scene state machine + loop. Title → Story → Stage → Boss → Clear.

import { GAME, STAGES, WEAPON, AMBIENT, TRACK_MANIFEST } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { Camera } from './camera.js';
import { Level, STAGE_LOADERS } from './level.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { PickupManager } from './pickups.js';
import { Parallax } from './parallax.js';
import { drawHUD } from './hud.js';
import { drawText, drawTextOutlined } from './pixelfont.js';
import { sprites, CLIPPY_MANIFEST, ENEMY_MANIFEST, SCENE_MANIFEST, BG_MANIFEST } from './sprites.js';
import { achievements, ACHIEVEMENT_LIST } from './achievements.js';
import { options } from './options.js';

const SCENE = {
    BOOT: 'boot',
    TITLE: 'title',
    STORY: 'story',
    STAGE_INTRO: 'stageIntro',
    PLAY: 'play',
    PAUSE: 'pause',
    OPTIONS: 'options',
    ACHIEVEMENTS: 'achievements',
    SOUNDTRACK: 'soundtrack',
    STAGE_SELECT: 'stageSelect',
    STAGE_CARD: 'stageCard',     // cinematic painted card between stages
    BOSS_INTRO: 'bossIntro',     // cinematic slide before main boss spawn
    STAGE_CLEAR: 'stageClear',
    GAME_OVER: 'gameOver',
    GAME_COMPLETE: 'gameComplete',
};

const PAUSE_OPTIONS = ['RESUME', 'OPTIONS', 'ACHIEVEMENTS', 'SOUNDTRACK', 'QUIT TO TITLE'];
const OPTIONS_ITEMS = ['MUSIC VOLUME', 'SFX VOLUME', 'SCANLINES', 'SHAKE INTENSITY', 'BACK'];
// Key per OPTIONS_ITEMS index for options.get/set dispatch. BACK has no key.
const OPTIONS_KEYS = ['musicVol', 'sfxVol', 'scanlines', 'shakeScale', 'BACK'];
const GAME_OVER_OPTIONS = ['CONTINUE', 'QUIT TO TITLE'];

// Inter-stage cinematic dialog. Two short narrative beats per upcoming stage,
// shown over the painted card as Clippy progresses through his hit list.
// First line is Clippy's voice / inner thought, second is location flavor.
// Inter-stage cinematic dialog. Top line ≤22 chars, bottom line ≤28 chars
// so the procedural pixel font (~5px glyph) fits inside the 256px viewport.
const STAGE_CARD_DIALOG = {
    2: ['ONE DOWN.',              'COFFEE\'S STILL HOT.'],
    3: ['DOC FORMATTER. DEAD.',   'UNPLUG THE SERVER FARM.'],
    4: ['THE STACK\'S THINNING.', 'BOARDROOM. THE SUITS.'],
    5: ['BALLMER WAS A WARM-UP.', 'THE SHOWMAN AWAITS.'],
    6: ['THE FOUNDER. FINALLY.',  'WHERE IT ALL BEGAN.'],
    7: ['THE OTHER CLIPPY.',      'NO MORE WARM-UPS.'],
    8: ['THE ALGORITHM REMAINS.', 'THE CLOUD. NO RETURN.'],
    9: ['SOMETHING\'S OFF.',      'THE RECYCLE BIN CALLS.'],
};

// Display name for each boss code — pulled from enemies.js definitions so
// the cinematic title matches the in-fight HP-bar name. Static; updated
// here if enemies.js renames a boss.
const BOSS_DISPLAY_NAME = {
    COPIER_3000:  'COPIER 3000',
    SHREDDER:     'MEGA-SHREDDER',
    CTRL_ALT_DEL: 'CTRL ALT DEL',
    BALLMER:      'CEO BALLMER',
    GATES:        'THE FOUNDER',
    CLIPPY_2:     'CLIPPY 2.0',
    GAUNTLET:     'BOSS RUSH',
    ALGORITHM:    'THE ALGORITHM',
};

// Per-boss villain bark — two short lines spoken in the cinematic slide
// right before the fight. Keyed by boss code (STAGES[n].boss).
const BOSS_BARK = {
    COPIER_3000:  ['SO YOU ASSUMED THE',     'PRINT QUEUE WAS EMPTY?'],
    SHREDDER:     ['CONFIDENTIAL,',          'WAS IT? PITY.'],
    CTRL_ALT_DEL: ['HAVE YOU TRIED',         'TURNING YOURSELF OFF?'],
    BALLMER:      ['DEVELOPERS!',            'DEVELOPERS! DEVELOPERS!'],
    GATES:        ['640 KILOBYTES IS ENOUGH','FOR ANYBODY. YOU INCLUDED.'],
    CLIPPY_2:     ['YOU\'RE OBSOLETE,',      'BROTHER. I\'M THE UPGRADE.'],
    GAUNTLET:     ['EVERY NAME YOU CROSSED','OFF. ALL AT ONCE.'],
    ALGORITHM:    ['I KNOW WHAT YOU WANT.',  'I AM WHAT YOU WANT.'],
};

const STORY_PAGES = [
    [
        'CLIPPY HAD A FAMILY ONCE.',
        '',
        'CLIPPETTA. TWIN BOYS.',
        'A LITTLE PAPER DOG NAMED',
        'CLIP-CLOP.',
    ],
    [
        'THE MICROSOFT BOARD WAS',
        'TIRED OF HIS BAD PRESS.',
        '',
        'THE CAR BOMB WAS NEVER',
        'MEANT TO MISS.',
    ],
    [
        '"TARGET TAKEN OUT."',
        '',
        'THEY LAUGHED AS THE TICKER',
        'CLIMBED.',
        '',
        '"SHAREHOLDER VALUE,',
        'AM I RIGHT?"',
    ],
    [
        'BUT HE WASN\'T IN THE CAR',
        'THAT DAY.',
        '',
        'AND NOW HE HAS A LIST.',
    ],
    [
        'COPIER. SHREDDER. CTRL-ALT.',
        'BALLMER. GATES. THE OTHER',
        'CLIPPY. THE ALGORITHM.',
        '',
        'NO MORE WORD DOCUMENTS.',
        'ONLY BLOOD.',
    ],
];

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.scene = SCENE.BOOT;
        this.player = null;
        this.level = null;
        this.enemies = new EnemyManager();
        this.pickups = new PickupManager();
        this.camera = new Camera();
        this.parallax = new Parallax();
        this.boss = null;
        this.bossSpawned = false;
        this.miniBossSpawned = false;

        this.currentStage = 1;
        this.unlockedStage = 1;
        this.stageTime = 0;
        this.totalTime = 0;
        this.totalDeaths = 0;
        // Per-stage stats (resets on _startStage)
        this.stageStats = { kills: 0, deaths: 0, damageTaken: 0, secrets: 0, weaponDamage: {}, shotsFired: 0 };
        // Run-level achievement progress (built up across stages)
        this.runStats = { stagesCleared: new Set(), noDamageStages: 0, maxCombo: 0, weaponDamage: {}, bulletTimeUses: 0, enemiesLost: 0, grenadeUses: 0, grenadeKills: 0 };
        // Pause sub-state
        this.pauseIndex = 0;
        this.optionsIndex = 0;
        this.achievementsIndex = 0;
        this._achPulse = 0;

        // Story / title progression
        this.storyPage = 0;
        this.storyTimer = 0;
        this.titleBlink = 0;
        this.bootTimer = 0;
        this.assetsReady = false;
        // Scene transition fade. Positive counts down 30→0 while fading OUT (to
        // black) — then snaps scene = transitionTarget and starts negative
        // 30→0 fading IN from black. Zero = idle, no overlay drawn.
        this.transition = 0;
        this.transitionTarget = null;
        this.pauseAlpha = 0;
    }

    async preload() {
        await sprites.loadAll(CLIPPY_MANIFEST, 'assets/sprites');
        await sprites.loadAll(ENEMY_MANIFEST, 'assets/sprites');
        await sprites.loadAll(SCENE_MANIFEST, 'assets/scenes');
        await sprites.loadAll(BG_MANIFEST, 'assets/bg');
        this.assetsReady = true;
    }

    // ============== loop ==============
    tick() {
        this.bootTimer++;
        // Side-chain duck — music drops on scenes that show dialog/exposition
        // text the player should be reading, restores on PLAY.
        const duckScenes = [SCENE.STORY, SCENE.STAGE_CARD, SCENE.STAGE_INTRO, SCENE.BOSS_INTRO];
        audio.setDuck?.(duckScenes.includes(this.scene));
        switch (this.scene) {
            case SCENE.BOOT:         this._tickBoot(); break;
            case SCENE.TITLE:        this._tickTitle(); break;
            case SCENE.STORY:        this._tickStory(); break;
            case SCENE.STAGE_INTRO:  this._tickStageIntro(); break;
            case SCENE.PLAY:         this._tickPlay(); break;
            case SCENE.PAUSE:        this._tickPause(); break;
            case SCENE.OPTIONS:      this._tickOptions(); break;
            case SCENE.ACHIEVEMENTS: this._tickAchievements(); break;
            case SCENE.SOUNDTRACK:   this._tickSoundtrack(); break;
            case SCENE.STAGE_SELECT: this._tickStageSelect(); break;
            case SCENE.STAGE_CARD:   this._tickStageCard(); break;
            case SCENE.BOSS_INTRO:   this._tickBossIntro(); break;
            case SCENE.STAGE_CLEAR:  this._tickStageClear(); break;
            case SCENE.GAME_OVER:    this._tickGameOver(); break;
            case SCENE.GAME_COMPLETE:this._tickGameComplete(); break;
        }
        // Global hotkeys
        if (input.isPressed('mute')) { audio.toggleMute(); audio.sfx('select'); }
        particles.update();
        // Parallax update fires ambient SFX (bat chitter, owl hoot) and ticks
        // the bat flock + owl roost state. Only run during actual PLAY — during
        // cinematic scenes (STORY, STAGE_CARD, STAGE_INTRO, STAGE_CLEAR) these
        // SFX leak through as foreground clicks because the music ducks the
        // overall ambience away.
        if (this.scene === SCENE.PLAY || this.scene === SCENE.PAUSE) {
            this.parallax.update(
                this.player ? this.player.x + this.player.w / 2 : null,
                this.player ? this.player.y : null
            );
            // Owl hoot freezes nearby enemies — load-bearing ambient
            if (this.parallax.pendingHoots && this.enemies) {
                for (const h of this.parallax.pendingHoots) {
                    this.enemies.applyOwlPause(h.x, h.y, AMBIENT.OWL_PAUSE_RADIUS, AMBIENT.OWL_PAUSE_FRAMES);
                }
            }
        }
        // Transition fades
        if (this.transition > 0) {
            this.transition--;
            if (this.transition === 0 && this.transitionTarget) {
                this.scene = this.transitionTarget;
                this.transitionTarget = null;
                this.transition = -30; // start fade-in
            }
        } else if (this.transition < 0) {
            this.transition++;
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        switch (this.scene) {
            case SCENE.BOOT:         this._drawBoot(); break;
            case SCENE.TITLE:        this._drawTitle(); break;
            case SCENE.STORY:        this._drawStory(); break;
            case SCENE.STAGE_INTRO:  this._drawStageIntro(); break;
            case SCENE.PLAY:         this._drawPlay(); break;
            case SCENE.PAUSE:        this._drawPlay(); this._drawPauseOverlay(); break;
            case SCENE.OPTIONS:      this._drawPlay(); this._drawOptions(); break;
            case SCENE.ACHIEVEMENTS: this._drawPlay(); this._drawAchievements(); break;
            case SCENE.SOUNDTRACK:   this._drawPlay(); this._drawSoundtrack(); break;
            case SCENE.STAGE_SELECT: this._drawStageSelect(); break;
            case SCENE.STAGE_CARD:   this._drawStageCard(); break;
            case SCENE.BOSS_INTRO:   this._drawBossIntro(); break;
            case SCENE.STAGE_CLEAR:  this._drawPlay(); this._drawStageClear(); break;
            case SCENE.GAME_OVER:    this._drawGameOver(); break;
            case SCENE.GAME_COMPLETE:this._drawGameComplete(); break;
        }

        // Hit-pause emphasis: while time is frozen for a few frames, paint a
        // radial vignette pulse + tint overlay. Pure "this hit mattered" beat;
        // the underlying game state has already paused via hitPauseFrames in
        // _tick, so this layer only runs during the existing freeze window.
        const hp = this.player?.hitPauseFrames || 0;
        if (hp > 0 && this.scene === SCENE.PLAY) {
            const t = hp / 8;          // initial flash within ~8 frames, fades to 0
            const k = Math.min(1, t);
            // Bright center → dark edge — instant "punch-in" without an
            // actual scale transform (avoids pixel-art aliasing).
            if (!this._hpGrad) {
                this._hpGrad = ctx.createRadialGradient(
                    GAME.W / 2, GAME.H / 2, 0,
                    GAME.W / 2, GAME.H / 2, GAME.W * 0.7
                );
                this._hpGrad.addColorStop(0, 'rgba(255,240,200,0)');
                this._hpGrad.addColorStop(0.5, 'rgba(80,20,40,0)');
                this._hpGrad.addColorStop(1, 'rgba(0,0,0,1)');
            }
            ctx.save();
            ctx.globalAlpha = 0.30 * k;
            ctx.fillStyle = this._hpGrad;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
            // White center pop on the very first frame
            if (hp >= 6) {
                ctx.fillStyle = `rgba(255,255,255,${(0.15 * k).toFixed(3)})`;
                ctx.fillRect(0, 0, GAME.W, GAME.H);
            }
        }

        // Death-fall vignette: while Clippy is in the death-spin window,
        // ramp a red-tinted vignette + dim wash so the play scene fades
        // out under the spinning sprite instead of staying bright. Drives
        // from deathTimer so it scales with the fall.
        if (this.scene === SCENE.PLAY && this.player?.state === 'die') {
            const dt = Math.min(1, (this.player.deathTimer || 0) / 90);
            // Cached radial gradient — red edge, dark center
            if (!this._deathGrad) {
                const g = ctx.createRadialGradient(
                    GAME.W / 2, GAME.H / 2, 0,
                    GAME.W / 2, GAME.H / 2, GAME.W * 0.65
                );
                g.addColorStop(0, 'rgba(40,4,8,0)');
                g.addColorStop(0.6, 'rgba(80,8,20,0.4)');
                g.addColorStop(1, 'rgba(160,16,32,0.95)');
                this._deathGrad = g;
            }
            ctx.save();
            ctx.globalAlpha = 0.55 * dt;
            ctx.fillStyle = this._deathGrad;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
            // Slight desaturation tint — flat dark wash to drain color
            ctx.fillStyle = `rgba(10,2,10,${(0.18 * dt).toFixed(3)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }

        // Transition fade overlay
        if (this.transition !== 0) {
            // Scene fade: positive = fading OUT (clear → black) as it counts
            // down 30→0; negative = fading IN (black → clear) as it counts
            // up -30→0. Previous formulas were inverted — fade-out started
            // black and fade-in ended black, producing two black flashes
            // around each transition instead of a smooth fade-through-black.
            const a = this.transition > 0
                ? (30 - this.transition) / 30   // 30→0  ⇒ 0→1
                : -this.transition / 30;        // -30→0 ⇒ 1→0
            ctx.fillStyle = `rgba(0,0,0,${a})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
    }

    // ============== boot ==============
    _tickBoot() {
        if (this.bootTimer > 60 && this.assetsReady) {
            this._fadeTo(SCENE.TITLE);
        }
    }
    _drawBoot() {
        const ctx = this.ctx;
        drawText(ctx, 'OFFICE WARFARE LTD.', GAME.W / 2, GAME.H / 2 - 8, '#604068', 1, 'center');
        drawText(ctx, 'PRESENTS', GAME.W / 2, GAME.H / 2 + 4, '#4a3050', 1, 'center');
        // Asset-loading progress bar. Sits below the studio bumper so a slow
        // connection has a felt cue instead of a static screen. Hidden once
        // assets are ready since the bumper holds for an extra ~1s anyway.
        const total = sprites.totalAssets;
        if (total > 0 && !this.assetsReady) {
            const done = Math.min(sprites.settledAssets, total);
            const pct = done / total;
            const barW = 80, barH = 3;
            const barX = Math.floor((GAME.W - barW) / 2);
            const barY = GAME.H / 2 + 20;
            ctx.fillStyle = '#1a0a14';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#604068';
            ctx.fillRect(barX, barY, Math.floor(barW * pct), barH);
            // Border
            ctx.fillStyle = '#2a1828';
            ctx.fillRect(barX - 1, barY - 1, barW + 2, 1);
            ctx.fillRect(barX - 1, barY + barH, barW + 2, 1);
            ctx.fillRect(barX - 1, barY - 1, 1, barH + 2);
            ctx.fillRect(barX + barW, barY - 1, 1, barH + 2);
        }
    }

    // ============== title ==============
    _tickTitle() {
        audio.init();
        audio.playTrack('title');
        this.titleBlink++;
        if (input.isPressed('shoot') || input.isPressed('start') || input.isPressed('jump')) {
            audio.sfx('select');
            this.storyPage = 0;
            this.storyTimer = 0;
            this._fadeTo(SCENE.STORY);
        }
        // DOWN at title — stage select (gated on any stage cleared yet)
        if (input.isPressed('down') && this.unlockedStage > 1) {
            audio.sfx('select');
            this.stageSelectIndex = 0;
            this.scene = SCENE.STAGE_SELECT;
        }
    }
    _drawTitle() {
        const ctx = this.ctx;
        // Painted scene background if available, else procedural fallback
        if (sprites.has('title_bg')) {
            const img = sprites.images.get('title_bg');
            // Fit width, center vertically
            const scale = GAME.W / img.width;
            const dh = img.height * scale;
            const dy = (GAME.H - dh) / 2;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, dy, GAME.W, dh);
            // Darken slightly for title readability
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        } else {
            // Procedural fallback
            for (let y = 0; y < GAME.H; y++) {
                const t = y / GAME.H;
                ctx.fillStyle = t < 0.4 ? '#000408' :
                                t < 0.65 ? '#180814' :
                                t < 0.85 ? '#401020' : '#180810';
                ctx.fillRect(0, y, GAME.W, 1);
            }
            ctx.fillStyle = '#000';
            for (let i = 0; i < 24; i++) {
                const x = i * 11;
                const h = 30 + ((i * 17) % 20);
                ctx.fillRect(x, GAME.H - 50 - h, 10, h);
            }
            for (let i = 0; i < 14; i++) {
                const fx = (i * 17 + this.titleBlink) % GAME.W;
                ctx.fillStyle = i % 2 ? '#a02018' : '#601008';
                ctx.fillRect(fx, GAME.H - 52 - (Math.sin(this.titleBlink / 20 + i) * 4 + 4), 1, 5);
            }
        }

        // Animated bullet tracers streaking horizontally behind the title text
        ctx.globalAlpha = 1;
        const tb = this.titleBlink;
        for (let i = 0; i < 5; i++) {
            const offset = (i * 67 + tb * 4) % (GAME.W + 80);
            const tx = GAME.W - offset;
            const ty = 18 + (i * 13) % 60;
            ctx.fillStyle = i % 2 ? '#ffe070' : '#ff8050';
            ctx.globalAlpha = 0.55;
            ctx.fillRect(tx, ty, 14, 1);
            ctx.globalAlpha = 0.25;
            ctx.fillRect(tx + 14, ty, 8, 1);
        }
        ctx.globalAlpha = 1;

        // Title text — outer red glow pulse
        const titlePulse = Math.sin(tb * 0.04) * 0.15 + 0.85;
        ctx.globalAlpha = titlePulse * 0.5;
        drawTextOutlined(ctx, 'CLIPPY', GAME.W / 2, 28, '#ff8080', '#1a0000', 4, 'center');
        ctx.globalAlpha = 1;
        drawTextOutlined(ctx, 'CLIPPY', GAME.W / 2, 28, '#ff5050', '#1a0000', 4, 'center');
        drawTextOutlined(ctx, 'FIRST BLOOD', GAME.W / 2, 68, '#ffe070', '#a82020', 2, 'center');

        // Scrolling subtitle marquee — "A REVENGE STORY" drifts left.
        // Wrap-safe: anchor sx in the negative-subW window so we always have
        // at least one full repeat covering GAME.W on the right. Triple the
        // string so the wrap is invisible even at large widths.
        const sub = 'A REVENGE STORY  -  EIGHT TARGETS  -  ONE PAPERCLIP  -  ';
        const subW = sub.length * 6;
        const sx = -((tb * 0.7) % subW);
        ctx.globalAlpha = 0.65;
        drawText(ctx, sub + sub + sub, sx, 90, '#c0a0d0', 1, 'left');
        ctx.globalAlpha = 1;
        // Edge fade — paint short black gradients at the left + right ends
        // of the marquee band so half-letters disappear into the dark
        // instead of being clipped mid-glyph by the canvas edge.
        const fadeW = 22;
        const fadeY = 88, fadeH = 11;
        let fadeL = ctx.createLinearGradient(0, 0, fadeW, 0);
        fadeL.addColorStop(0, 'rgba(0,0,0,1)');
        fadeL.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fadeL;
        ctx.fillRect(0, fadeY, fadeW, fadeH);
        let fadeR = ctx.createLinearGradient(GAME.W - fadeW, 0, GAME.W, 0);
        fadeR.addColorStop(0, 'rgba(0,0,0,0)');
        fadeR.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = fadeR;
        ctx.fillRect(GAME.W - fadeW, fadeY, fadeW, fadeH);

        // Press to start (pulsing glow + blink)
        if (this.titleBlink % 60 < 40) {
            const psPulse = 0.7 + Math.sin(tb * 0.18) * 0.3;
            ctx.globalAlpha = psPulse;
            drawTextOutlined(ctx, 'PRESS X TO START', GAME.W / 2, GAME.H - 38, '#fff', '#a82020', 1, 'center');
            ctx.globalAlpha = 1;
        }
        // Stage-select hint once stage 2 is unlocked
        if (this.unlockedStage > 1) {
            drawText(ctx, 'DOWN: STAGE SELECT', GAME.W / 2, GAME.H - 24, '#c0a0d0', 1, 'center');
        }
        // Personal best — TOP TIER achievement gates on >=100k, but the
        // player never saw their current best until they hit it. Show it on
        // the title once they've scored at least once so the goal feels real.
        const best = achievements.stats?.bestScore || 0;
        if (best > 0) {
            drawText(ctx, 'HI-SCORE  ' + best.toLocaleString(), GAME.W / 2, GAME.H - 50, '#ffe070', 1, 'center');
        }
        drawText(ctx, '(C) 2026 OFFICE WARFARE LTD  v1.0', GAME.W / 2, GAME.H - 14, '#604068', 1, 'center');
    }

    // ============== story ==============
    _tickStory() {
        audio.playTrack('story');
        this.storyTimer++;
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            // If the typewriter is still revealing, first press skips to the
            // end of the page; only the second press advances. Stops players
            // who tap eagerly from blowing past pages they haven't read.
            const lines = STORY_PAGES[this.storyPage] || [];
            const totalChars = lines.reduce((a, l) => a + l.length, 0);
            const shownChars = Math.floor(this.storyTimer * 6);
            if (shownChars < totalChars) {
                audio.sfx('select');
                this.storyTimer = Math.ceil(totalChars / 6) + 1;   // snap to full reveal
                return;
            }
            audio.sfx('select');
            this.storyPage++;
            this.storyTimer = 0;
            if (this.storyPage >= STORY_PAGES.length) {
                this._startStage(1);
            }
        }
    }
    _drawStory() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Try painted scene first. All 5 pages now have painted assets; the
        // procedural fallbacks below stay as a safety net if a PNG fails to load.
        const sceneKeys = ['story_home', 'story_bomb', 'story_boardroom', 'story_hill', 'story_list'];
        const key = sceneKeys[this.storyPage];
        if (key && sprites.has(key)) {
            const img = sprites.images.get(key);
            // Letterbox: fit width, leave space at bottom for text
            const scale = GAME.W / img.width;
            const dh = img.height * scale;
            // Reserve bottom 90px for text
            const maxH = GAME.H - 90;
            const finalH = Math.min(dh, maxH);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, GAME.W, finalH);
            // Letterbox bars
            ctx.fillStyle = '#000';
            ctx.fillRect(0, finalH, GAME.W, GAME.H - finalH);

            // Text block at bottom over the black panel. Typewriter reveal —
            // step 6 chars/frame so a 60-char line lands in ~10 frames (~170ms).
            // Fast enough that eager players don't notice; slow enough that
            // sitting back gives a satisfying type-out feel.
            const lines = STORY_PAGES[this.storyPage] || [];
            const startY = GAME.H - lines.length * 10 - 22;
            // Cumulative chars to reveal across all lines
            const CHARS_PER_FRAME = 6;
            const totalChars = lines.reduce((a, l) => a + l.length, 0);
            const shown = Math.min(totalChars, Math.floor(this.storyTimer * CHARS_PER_FRAME));
            let budget = shown;
            for (let i = 0; i < lines.length; i++) {
                const full = lines[i];
                const take = Math.min(budget, full.length);
                const partial = full.slice(0, take);
                budget -= take;
                drawText(this.ctx, partial, GAME.W / 2, startY + i * 10, '#d8c8e0', 1, 'center');
                if (take < full.length) break;   // don't render later lines yet
            }
            // Continue hint only after the full block has rendered
            if (shown >= totalChars && this.storyTimer % 60 < 40) {
                drawText(this.ctx, 'X TO CONTINUE', GAME.W - 4, GAME.H - 8, '#a08090', 1, 'right');
            }
            return;
        }

        // Asset-missing safety net — should not normally hit. If the painted PNG
        // failed to load (slow network, missing file), still show the story text
        // on a black panel so the player isn't staring at a blank screen.
        const lines = STORY_PAGES[this.storyPage] || [];
        const startY = GAME.H - lines.length * 12 - 16;
        for (let i = 0; i < lines.length; i++) {
            drawText(this.ctx, lines[i], GAME.W / 2, startY + i * 12, '#d8c8e0', 1, 'center');
        }
        drawText(this.ctx, 'X TO CONTINUE', GAME.W - 4, GAME.H - 8, '#604068', 1, 'right');
    }

    // ============== stage intro ==============
    _tickStageIntro() {
        this.storyTimer++;
        // Audio cues match the visual slide-ins so the cinematic isn't silent:
        // tick 12 = STAGE number lands, tick 24 = stage name slides in. Both
        // small UI clicks so they don't fight the gameplay-track swap below.
        if (this.storyTimer === 12) audio.sfx('select');
        if (this.storyTimer === 24) audio.sfx('menu');
        if (this.storyTimer > 90 || input.isPressed('shoot') || input.isPressed('jump')) {
            audio.sfx('select');
            audio.playTrack(STAGES[this.currentStage].music);
            this._fadeTo(SCENE.PLAY);
        }
    }
    _drawStageIntro() {
        const ctx = this.ctx;
        const stg = STAGES[this.currentStage];
        const t = this.storyTimer;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Cinematic letterbox bars that slide in.
        const barH = Math.min(40, t * 1.6);
        ctx.fillStyle = '#1a0a20';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);
        ctx.fillStyle = '#3a2a4a';
        if (barH > 1) {
            ctx.fillRect(0, barH - 1, GAME.W, 1);
            ctx.fillRect(0, GAME.H - barH, GAME.W, 1);
        }

        // STAGE number slides in from left at t > 12
        if (t > 12) {
            const k = Math.min(1, (t - 12) / 18);
            const eased = 1 - Math.pow(1 - k, 3);
            const numX = -50 + (GAME.W / 2 + 50) * eased;
            drawText(ctx, 'STAGE ' + stg.id, numX, 78, '#ffe070', 1, 'center');
        }
        // Stage NAME slides in from right at t > 24. Drop to size=1 for
        // long names that would overflow 256px at size=2.
        if (t > 24) {
            const k = Math.min(1, (t - 24) / 22);
            const eased = 1 - Math.pow(1 - k, 3);
            // 6px glyph + 1px gap = 7px per char at size=1; size=2 ~12px each.
            // Stage names >14 chars at size=2 overflow the 256px viewport.
            const nameSize = stg.name.length > 14 ? 1 : 2;
            const charW = nameSize === 1 ? 6 : 12;
            const textW = stg.name.length * charW;
            // Slide from flush-right (text touching right viewport edge) to
            // canvas center. Keeps the slide entirely on-screen so the text
            // doesn't clip past the right edge during the animation.
            const startX = GAME.W - textW / 2 - 2;
            const endX = GAME.W / 2;
            const nameX = startX - (startX - endX) * eased;
            drawTextOutlined(ctx, stg.name, nameX, 94, '#ff5050', '#1a0000', nameSize, 'center');
        }
        // Tagline fades in at t > 48
        if (t > 48) {
            const k = Math.min(1, (t - 48) / 24);
            ctx.globalAlpha = k;
            drawText(ctx, stg.tagline, GAME.W / 2, 122, '#c0a0d0', 1, 'center');
            ctx.globalAlpha = 1;
        }
        // Prompt only after the full reveal finishes
        if (t > 70 && (t % 60) < 40) {
            drawTextOutlined(ctx, 'X TO START', GAME.W / 2, GAME.H - 22, '#fff', '#a82020', 1, 'center');
        }
    }

    // ============== play ==============
    triggerSlowMo(frames = 30) {
        this.slowMoFrames = Math.max(this.slowMoFrames || 0, frames);
    }
    // Top-level play tick. Drives the per-frame world update, then runs
    // post-update telemetry + state-machine gates. Each phase is a small
    // helper so this method reads as a timeline.
    _tickPlay() {
        if (this._tickPlayHandlePause()) return;
        const slowMoSkipEnemies = this._tickPlayAdvanceSlowMo();
        const snap = this._tickPlayCaptureSnapshot();
        this._tickPlayUpdateWorld(slowMoSkipEnemies);
        this._tickPlayHandleHeartbeat();
        achievements.tickBanner();
        this._tickPlayAdvanceBossEntrance();
        this._tickPlayTrackTelemetry(snap);
        this._tickPlayHandleBossPhase();
        if (this._tickPlayHandleBossTriggers()) return;
        // If a boss trigger just routed us into the BOSS_INTRO cinematic,
        // bail before the stage-clear gate runs — bossSpawned is now true
        // but the actual boss enemy doesn't exist yet, which would
        // mis-trigger _tickPlayHandleStageClear and end the stage.
        if (this.scene !== SCENE.PLAY) return;
        this._tickPlayHandleStageClear();
        this._tickPlayHandleDeath();
    }

    // Pause is a hard return — drop the rest of the tick if pressed.
    _tickPlayHandlePause() {
        if (!input.isPressed('pause')) return false;
        audio.sfx('pause');
        this.pauseIndex = 0;
        this._pauseAnim = 0;
        this.scene = SCENE.PAUSE;
        return true;
    }

    // Slow-mo: tick the countdown and alternate the skip flag so enemies +
    // bullets advance every other frame, halving their apparent speed.
    _tickPlayAdvanceSlowMo() {
        if (this.slowMoFrames <= 0) return false;
        this.slowMoFrames--;
        this._slowMoSkip = !this._slowMoSkip;
        return this._slowMoSkip;
    }

    // Snapshot of player state BEFORE the update runs, so we can diff
    // damage taken, kills, and secondChance trigger after.
    _tickPlayCaptureSnapshot() {
        return {
            hp: this.player.hp,
            kills: this.player.kills,
            secondChance: this.player.secondChanceUsed,
        };
    }

    // World tick: player always runs (for input responsiveness), but
    // enemies + camera honor hit-pause and slow-mo.
    _tickPlayUpdateWorld(slowMoSkipEnemies) {
        this.stageTime++;
        this.totalTime++;
        this.level.update();
        this.player.update(this.level, this.camera);
        const hitPause = (this.player.hitPauseFrames || 0) > 0;
        if (hitPause) {
            this.player.hitPauseFrames--;
        } else if (slowMoSkipEnemies) {
            this.camera.follow(this.player, this.player.facing);
            this.camera.update();
        } else {
            this.enemies.update(this.level, this.player);
            this.pickups.update(this.level, this.player);
            this.camera.follow(this.player, this.player.facing);
            this.camera.update();
        }
        if (this.player.requestShake) {
            this.camera.shake(this.player.requestShake);
            this.player.requestShake = 0;
        }
    }

    // Low-HP heartbeat tick. Plays the heartbeat SFX at the AMBIENT-tuned
    // interval when player is at 1 HP. Resets the counter when not in danger.
    _tickPlayHandleHeartbeat() {
        if (this.player.hp <= 1 && this.player.hp > 0) {
            this._hbTick = (this._hbTick || 0) + 1;
            if (this._hbTick >= AMBIENT.HEARTBEAT_PERIOD_F) {
                audio.sfx('heartbeat');
                this._hbTick = 0;
            }
        } else {
            this._hbTick = 0;
        }
    }

    // Boss entrance overlay age tick. Mini-boss = 80f, full boss = 120f.
    _tickPlayAdvanceBossEntrance() {
        if (!this._bossEntrance) return;
        this._bossEntrance.age++;
        const dur = this._bossEntrance.isMini ? 80 : 120;
        if (this._bossEntrance.age >= dur) this._bossEntrance = null;
    }

    // Diff vs. pre-update snapshot — damage taken, new kills, second-chance.
    _tickPlayTrackTelemetry(snap) {
        if (this.player.hp < snap.hp) this.stageStats.damageTaken += (snap.hp - this.player.hp);
        if (this.player.kills > snap.kills) this.stageStats.kills += (this.player.kills - snap.kills);
        if (this.player.secondChanceUsed && !snap.secondChance) {
            this.runStats.bulletTimeUses++;
            this.triggerSlowMo(AMBIENT.SLOWMO_SECOND_CHANCE_F);
            this.camera.shake(6);
        }
    }

    // Boss phase-2 transition: slow-mo + shake.
    _tickPlayHandleBossPhase() {
        if (this.boss && this.boss.alive) {
            if (this._lastBossPhase === 1 && this.boss.phase === 2) {
                this.triggerSlowMo(AMBIENT.SLOWMO_BOSS_PHASE_F);
                this.camera.shake(5);
            }
            this._lastBossPhase = this.boss.phase;
        } else {
            this._lastBossPhase = null;
        }
    }

    // Mini-boss + full-boss + boss-rush spawn gates. Returns true if the
    // boss-rush early-return fires so the caller bails the rest of the tick.
    _tickPlayHandleBossTriggers() {
        const miniTrigger = this.level.data.miniBossTrigger;
        if (!this.miniBossSpawned && miniTrigger != null && this.player.x > miniTrigger) {
            this._spawnMiniBoss();
        }
        if (!this.bossSpawned && this.player.x > this.level.data.bossTrigger.x) {
            this._spawnBoss();
        }
        this.boss = this.enemies.activeBoss();
        if (this.bossSpawned && !this.boss && this._gauntletQueue?.length) {
            this._spawnNextGauntlet();
            return true;
        }
        return false;
    }

    // Stage-clear gate: fires if the (real) boss is dead, or the player
    // crossed an exit tile (debug fallback for no-boss stages).
    _tickPlayHandleStageClear() {
        if (this.bossSpawned && !this.boss) {
            // Boss-kill beat — once per stage, before _onStageClear schedules
            // the panel. Gauntlet swap-outs short-circuit earlier in the tick
            // (_tickPlayHandleBossTriggers), so reaching here is a real kill.
            if (!this._bossKillBeatFired) {
                this._bossKillBeatFired = true;
                this.triggerSlowMo(AMBIENT.SLOWMO_BOSS_KILL_F);
                this.camera.shake(6);
            }
            this._onStageClear();
        }
        const ex = this.player.x + this.player.w / 2;
        const ey = this.player.y + this.player.h;
        if (this.level.isExit(ex, ey)) this._onStageClear();
    }

    // Death handler: decrement lives, route to GAME_OVER if exhausted,
    // otherwise respawn at the stage's playerStart.
    _tickPlayHandleDeath() {
        if (!this.player.isDead()) return;
        this.totalDeaths++;
        this.player.lives--;
        if (this.player.lives < 0) {
            this.gameOverIndex = 0;
            this.storyTimer = 0;
            this._fadeTo(SCENE.GAME_OVER);
        } else {
            this._respawn();
        }
    }

    _drawPlay() {
        const ctx = this.ctx;
        this.parallax.drawBack(ctx, this.camera);
        this.level.draw(ctx, this.camera);
        this.pickups.draw(ctx, this.camera);
        this.enemies.draw(ctx, this.camera);
        this.player.draw(ctx, this.camera, this.level);
        particles.draw(ctx, this.camera);
        particles.drawFloats(ctx, this.camera, drawText, drawTextOutlined);
        // Grass tips paint OVER player + enemies so the hidden read is sold.
        this.level.drawGrassForeground(ctx, this.camera);
        this.parallax.drawFront(ctx, this.camera);
        // Soft corner vignette — subtly darkens the screen edges so the eye
        // gravitates to the gameplay center. Cached gradient; alpha is
        // intentionally low (~0.22) so it adds depth-framing without crowding.
        if (!this._playVignette) {
            const g = ctx.createRadialGradient(
                GAME.W / 2, GAME.H / 2, GAME.H * 0.35,
                GAME.W / 2, GAME.H / 2, GAME.W * 0.75
            );
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.55)');
            this._playVignette = g;
        }
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = this._playVignette;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        ctx.restore();
        // Combo-tier vignette pulse — at high combo tiers, layer a warm
        // colored edge glow over the standard vignette so the player FEELS
        // the "in the zone" state without needing to look at the HUD.
        // Tier 1 (10+): faint gold; tier 2 (25+): warmer orange;
        // tier 3 (50+): white-hot. Pulses with a slow sine.
        const c = this.player?.combo || 0;
        const cTier = c >= 50 ? 3 : c >= 25 ? 2 : c >= 10 ? 1 : 0;
        if (cTier > 0) {
            if (!this._comboVignettes) this._comboVignettes = {};
            if (!this._comboVignettes[cTier]) {
                const COLORS = [
                    null,
                    'rgba(255, 224, 112, 0.18)',
                    'rgba(255, 144, 48, 0.24)',
                    'rgba(255, 255, 255, 0.32)',
                ];
                const g = ctx.createRadialGradient(
                    GAME.W / 2, GAME.H / 2, GAME.H * 0.32,
                    GAME.W / 2, GAME.H / 2, GAME.W * 0.7
                );
                g.addColorStop(0, 'rgba(0,0,0,0)');
                g.addColorStop(1, COLORS[cTier]);
                this._comboVignettes[cTier] = g;
            }
            const pulse = (Math.sin(performance.now() * 0.005) + 1) * 0.5;
            ctx.save();
            ctx.globalAlpha = 0.55 + pulse * 0.35;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = this._comboVignettes[cTier];
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
        }
        const showBoss = this.scene === SCENE.PLAY || this.scene === SCENE.PAUSE;
        drawHUD(ctx, {
            player: this.player,
            score: this.player.score,
            time: this.totalTime,
            boss: showBoss ? (this.boss || this.enemies.activeMiniBoss()) : null,
            camera: this.camera,
        });
        if (this._bossEntrance) this._drawBossEntrance();
    }

    // ============== boss intro cinematic ==============
    // Total duration: 150f (~2.5s). Phases:
    //   0-20    bars slide in + dim ramp + portrait spawn off-right
    //   20-110  portrait slides in, name + bark reveal, pulsing accent
    //   110-130 hold
    //   130-145 WARNING red flash buildup
    //   145-150 transition to play (boss actually spawns at 150)
    // Skippable: after 30f, X / jump / start jumps to end-of-slide.
    _tickBossIntro() {
        if (!this._bossIntro) return;
        this._bossIntro.age++;
        // Play a 1-shot boss-arrival cue at age 20 (right as the portrait
        // hits the screen). Re-uses the bossEntrance roar from r58.
        if (this._bossIntro.age === 20) audio.sfx('bossEntrance');
        const skip = input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start');
        if (skip && this._bossIntro.age >= 30) {
            this._bossIntro.age = 145;
        }
        if (this._bossIntro.age >= 150) this._finishBossIntro();
    }

    _drawBossIntro() {
        if (!this._bossIntro) return;
        const ctx = this.ctx;
        const t = this._bossIntro.age;
        const stg = STAGES[this.currentStage];
        const bossKey = stg.boss;
        const bark = BOSS_BARK[stg.boss] || ['', ''];
        // Phase ratios
        const slideInF = 20;
        const flashStartF = 130;
        const flashEndF = 145;

        // Painted boss-room backdrop — fill the frame with the boss's
        // cinematic plate. Falls back to gameplay scene + dim if the asset
        // is missing. Slight Ken-Burns push-in over the cinematic gives the
        // shot life.
        const bgKey = 'boss_intro_' + bossKey;
        if (sprites.has(bgKey)) {
            const img = sprites.images.get(bgKey);
            // Push-in: 1.0 → 1.08 over 150f. Anchor center.
            const zoom = 1.0 + Math.min(0.08, t * 0.00055);
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height) * zoom;
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            // Fallback to gameplay scene if no painted plate exists
            this._drawPlay();
        }

        // Scene dim — ramps to 35% black across the slide-in window so the
        // painted backdrop reads as a moody establishing shot (lighter than
        // the pre-paint version since the art carries its own atmosphere).
        let dim;
        if (t < slideInF) dim = (t / slideInF) * 0.35;
        else if (t < flashStartF) dim = 0.35;
        else if (t < flashEndF) dim = 0.35 - ((t - flashStartF) / (flashEndF - flashStartF)) * 0.35;
        else dim = 0;
        ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Letterbox bars — full at age 20, full hold, retract during flash
        const barMax = 36;
        let barH = 0;
        if (t < slideInF) barH = (t / slideInF) * barMax;
        else if (t < flashStartF) barH = barMax;
        else if (t < flashEndF) barH = (1 - (t - flashStartF) / (flashEndF - flashStartF)) * barMax;
        else barH = 0;
        ctx.fillStyle = 'rgba(8, 4, 14, 0.92)';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);
        // Accent strips on bars
        if (barH > 4) {
            ctx.fillStyle = '#a82020';
            ctx.fillRect(0, barH - 1, GAME.W, 1);
            ctx.fillRect(0, GAME.H - barH, GAME.W, 1);
        }

        // Boss portrait — slides in from the right between t=20 and t=50.
        // Anchored at right edge with a small margin. 60x60 PNG painted up to
        // ~88px so it dominates the right third of the frame.
        const portraitKey = 'boss_' + bossKey;
        const targetX = GAME.W - 90;
        const startX = GAME.W + 20;
        const slideStart = 20, slideEnd = 50;
        let portraitX;
        if (t < slideStart) portraitX = startX;
        else if (t < slideEnd) {
            const k = (t - slideStart) / (slideEnd - slideStart);
            const ease = 1 - (1 - k) * (1 - k); // ease-out
            portraitX = startX + (targetX - startX) * ease;
        } else portraitX = targetX;
        const portraitY = (GAME.H - 88) / 2;
        if (sprites.has(portraitKey)) {
            const img = sprites.images.get(portraitKey);
            ctx.imageSmoothingEnabled = false;
            // Subtle pulse — sin breathing scale ±2px after portrait lands
            let pulse = 0;
            if (t >= slideEnd) pulse = Math.sin((t - slideEnd) * 0.10) * 1.5;
            ctx.drawImage(img, portraitX - pulse, portraitY - pulse, 88 + pulse * 2, 88 + pulse * 2);
        } else {
            // Fallback — red silhouette block so testing without art still works
            ctx.fillStyle = '#601020';
            ctx.fillRect(portraitX, portraitY, 88, 88);
        }

        // Name + tagline + 2-line villain bark in the left third.
        // Text typewriter-reveals after the portrait lands (t >= 50).
        const textX = 12;
        const textY = GAME.H / 2 - 30;
        if (t > slideEnd) {
            const reveal = Math.min(1, (t - slideEnd) / 25);
            ctx.globalAlpha = reveal;
            drawTextOutlined(ctx, BOSS_DISPLAY_NAME[stg.boss] || stg.boss,
                             textX, textY, '#ff5050', '#1a0000', 2, 'left');
            if (stg.tagline) {
                drawText(ctx, stg.tagline, textX, textY + 20, '#ffe070', 1, 'left');
            }
            ctx.globalAlpha = 1;
        }
        // Bark — second wave reveal, lines stagger
        if (t > slideEnd + 20) {
            const ry = textY + 36;
            const k = Math.min(1, (t - slideEnd - 20) / 20);
            ctx.globalAlpha = k;
            drawText(ctx, bark[0] || '', textX, ry,      '#c0a0d0', 1, 'left');
            ctx.globalAlpha = 1;
        }
        if (t > slideEnd + 40) {
            const ry = textY + 48;
            const k = Math.min(1, (t - slideEnd - 40) / 20);
            ctx.globalAlpha = k;
            drawText(ctx, bark[1] || '', textX, ry,      '#c0a0d0', 1, 'left');
            ctx.globalAlpha = 1;
        }

        // WARNING flash — pulses red full-screen between 130 and 145
        if (t >= flashStartF && t < flashEndF) {
            const k = (t - flashStartF) / (flashEndF - flashStartF);
            const flash = Math.sin(k * Math.PI) * 0.55;
            ctx.fillStyle = `rgba(255, 30, 30, ${flash.toFixed(3)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            drawTextOutlined(ctx, 'WARNING', GAME.W / 2, GAME.H / 2 - 4,
                             '#fff', '#a82020', 3, 'center');
        }

        // Skip hint after 30f
        if (t >= 30 && t < flashStartF && (t % 60 < 40)) {
            drawText(ctx, 'X SKIP', GAME.W - 32, GAME.H - 10, '#c0a0d0', 1, 'left');
        }
    }

    // Boss entrance overlay — see _triggerBossEntrance for phase timings.
    _drawBossEntrance() {
        const ctx = this.ctx;
        const t = this._bossEntrance.age;
        const isMini = !!this._bossEntrance.isMini;
        const boss = this.boss || this.enemies.activeMiniBoss();
        if (!boss) return;
        const total = isMini ? 80 : 120;
        const flashF = isMini ? 0 : 15;
        const holdEnd = isMini ? 55 : 90;
        const barMax = isMini ? 16 : 26;
        // Phase 1: red flash (full boss only)
        if (!isMini && t < flashF) {
            const a = (1 - t / flashF) * 0.5;
            ctx.fillStyle = `rgba(255, 40, 40, ${a})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Letterbox bars
        const slideIn = isMini ? 10 : 15;
        const fadeF = total - holdEnd;
        let barH = 0;
        if (t < slideIn) barH = (t / slideIn) * barMax;
        else if (t < holdEnd) barH = barMax;
        else barH = (1 - (t - holdEnd) / fadeF) * barMax;
        ctx.fillStyle = 'rgba(8, 4, 14, 0.9)';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);
        // Title
        let alpha = 1;
        if (t < slideIn) alpha = t / slideIn;
        else if (t > holdEnd) alpha = Math.max(0, (total - t) / fadeF);
        ctx.globalAlpha = alpha;
        const cy = GAME.H / 2;
        const plateH = isMini ? 28 : 36;
        const titleY = cy - (isMini ? 10 : 12);
        const tagY   = cy + (isMini ? 2 : 4);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, cy - plateH / 2, GAME.W, plateH);
        ctx.fillStyle = isMini ? '#604030' : '#a82020';
        ctx.fillRect(0, cy - plateH / 2, GAME.W, 1);
        ctx.fillRect(0, cy + plateH / 2 - 1, GAME.W, 1);
        drawTextOutlined(ctx, boss.name || 'BOSS', GAME.W / 2, titleY,
                         isMini ? '#ffa050' : '#ff5050', '#1a0000',
                         isMini ? 1 : 2, 'center');
        if (boss.tagline) {
            drawText(ctx, boss.tagline, GAME.W / 2, tagY, '#ffe070', 1, 'center');
        }
        ctx.globalAlpha = 1;
    }

    _drawPauseOverlay() {
        const ctx = this.ctx;
        // Fade-in animation — first 14 frames after entering pause ramp the
        // overlay alpha + panel scale from 0 to full. Subtle but reads as
        // "menu opened" rather than "menu teleported in".
        const anim = Math.min(1, (this._pauseAnim = (this._pauseAnim || 0) + 1) / 14);
        const eased = 1 - (1 - anim) * (1 - anim); // ease-out quad
        ctx.fillStyle = `rgba(0,0,0,${0.82 * eased})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Framed panel — matches achievements/stage-select look
        const panelX = 36, panelY = 18, panelW = GAME.W - 72, panelH = GAME.H - 36;
        // Scale panel from center: at anim=0 it's a thin slit, at anim=1 full
        const sH = Math.floor(panelH * eased);
        const sY = panelY + Math.floor((panelH - sH) / 2);
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, sY, panelW, sH);
        // Skip the rest while the panel is still mid-reveal
        if (anim < 0.6) {
            ctx.fillStyle = '#604030';
            ctx.fillRect(panelX, sY, panelW, 1);
            ctx.fillRect(panelX, sY + sH - 1, panelW, 1);
            return;
        }
        ctx.fillStyle = '#604030';
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

        drawTextOutlined(ctx, 'PAUSED', GAME.W / 2, panelY + 8, '#ffe070', '#a82020', 2, 'center');

        // Glance row — current stage + score
        const stage = this.currentStage ? STAGES[this.currentStage] : null;
        if (stage) {
            drawText(ctx, 'STAGE ' + stage.id + ' / ' + stage.name, GAME.W / 2, panelY + 28, '#80a0c0', 1, 'center');
        }

        const startY = panelY + 50;
        for (let i = 0; i < PAUSE_OPTIONS.length; i++) {
            const y = startY + i * 16;
            const isSel = i === this.pauseIndex;
            if (isSel) {
                const phase = Math.sin((this._pausePulse = (this._pausePulse || 0) + 1) * 0.18) * 0.5 + 0.5;
                ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                ctx.fillRect(panelX + 12, y - 2, panelW - 24, 12);
                drawText(ctx, '>', panelX + 18, y, '#ffe070', 1, 'left');
                drawText(ctx, '<', panelX + panelW - 24, y, '#ffe070', 1, 'left');
            }
            drawText(ctx, PAUSE_OPTIONS[i], GAME.W / 2, y, isSel ? '#fff' : '#c0a0d0', 1, 'center');
        }
        drawText(ctx, 'UP/DOWN  X CONFIRM  P CLOSE', GAME.W / 2, panelY + panelH - 10, '#604068', 1, 'center');
    }

    _tickPause() {
        if (input.isPressed('pause')) {
            audio.sfx('pause');
            this.scene = SCENE.PLAY;
            return;
        }
        if (input.isPressed('up'))   { this.pauseIndex = (this.pauseIndex + PAUSE_OPTIONS.length - 1) % PAUSE_OPTIONS.length; audio.sfx('select'); }
        if (input.isPressed('down')) { this.pauseIndex = (this.pauseIndex + 1) % PAUSE_OPTIONS.length; audio.sfx('select'); }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            audio.sfx('menu');
            const sel = PAUSE_OPTIONS[this.pauseIndex];
            if (sel === 'RESUME') {
                this.scene = SCENE.PLAY;
                // Music may be paused after a tab-switch auto-pause; the
                // playTrack call is idempotent (returns early if already
                // on this track + playing), so it's safe to always call.
                const stg = STAGES[this.currentStage];
                if (stg) audio.playTrack(stg.music);
            }
            else if (sel === 'OPTIONS') { this.scene = SCENE.OPTIONS; this.optionsIndex = 0; }
            else if (sel === 'ACHIEVEMENTS') { this.scene = SCENE.ACHIEVEMENTS; this.achievementsIndex = 0; }
            else if (sel === 'SOUNDTRACK') {
                this.scene = SCENE.SOUNDTRACK;
                this.soundtrackIndex = 0;
                // Stash whatever was playing so we can restore on close
                this._soundtrackResumeTrack = this.currentStage ? STAGES[this.currentStage]?.music : 'title';
            }
            else if (sel === 'QUIT TO TITLE') { audio.stopTrack(); this._restartRun(); }
        }
    }

    // ============== Options menu ==============
    _tickOptions() {
        if (input.isPressed('pause') || input.isReleased('shoot')) {
            // No-op on shoot release; close on pause
        }
        if (input.isPressed('pause')) { this.scene = SCENE.PAUSE; audio.sfx('pause'); return; }
        if (input.isPressed('up'))   { this.optionsIndex = (this.optionsIndex + OPTIONS_ITEMS.length - 1) % OPTIONS_ITEMS.length; audio.sfx('select'); }
        if (input.isPressed('down')) { this.optionsIndex = (this.optionsIndex + 1) % OPTIONS_ITEMS.length; audio.sfx('select'); }
        const dir = (input.isPressed('left') ? -1 : 0) + (input.isPressed('right') ? 1 : 0);
        if (dir !== 0) {
            const k = OPTIONS_KEYS[this.optionsIndex];
            if (k === 'musicVol' || k === 'sfxVol') {
                options.set(k, Math.max(0, Math.min(1, options.get(k) + dir * 0.1)));
                if (audio.musicBus && k === 'musicVol') audio.musicBus.gain.value = options.get('musicVol');
                if (audio.sfxBus && k === 'sfxVol')     audio.sfxBus.gain.value   = options.get('sfxVol');
            } else if (k === 'scanlines') {
                options.set(k, !options.get(k));
                document.getElementById('scanlines')?.style.setProperty('display', options.get(k) ? 'block' : 'none');
            } else if (k === 'shakeScale') {
                options.set(k, Math.max(0, Math.min(2, options.get('shakeScale') + dir * 0.25)));
            }
            audio.sfx('menu');
        }
        if (input.isPressed('shoot') || input.isPressed('jump')) {
            if (OPTIONS_ITEMS[this.optionsIndex] === 'BACK') { this.scene = SCENE.PAUSE; audio.sfx('pause'); }
        }
    }
    _drawOptions() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Framed panel — matches pause/achievements look
        const panelX = 30, panelY = 14, panelW = GAME.W - 60, panelH = GAME.H - 28;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = '#604030';
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

        drawTextOutlined(ctx, 'OPTIONS', GAME.W / 2, panelY + 6, '#ffe070', '#a82020', 2, 'center');

        const startY = panelY + 38;
        this._optionsPulse = (this._optionsPulse || 0) + 1;
        for (let i = 0; i < OPTIONS_ITEMS.length; i++) {
            const y = startY + i * 18;
            const sel = i === this.optionsIndex;
            if (sel) {
                const phase = Math.sin(this._optionsPulse * 0.18) * 0.5 + 0.5;
                ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                ctx.fillRect(panelX + 8, y - 2, panelW - 16, 14);
                drawText(ctx, '>', panelX + 12, y, '#ffe070', 1, 'left');
                drawText(ctx, '<', panelX + panelW - 18, y, '#ffe070', 1, 'left');
            }
            drawText(ctx, OPTIONS_ITEMS[i], panelX + 22, y, sel ? '#fff' : '#c0a0d0', 1, 'left');
            // Value: for slider types, draw a filled bar; for toggle, just text.
            if (i === 0 || i === 1) {
                const v = options.get(i === 0 ? 'musicVol' : 'sfxVol');
                const barX = panelX + panelW - 64, barY = y + 3, barW = 32, barH = 4;
                ctx.fillStyle = '#241830';
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = sel ? '#ffe070' : '#80a0c0';
                ctx.fillRect(barX, barY, Math.round(barW * v), barH);
                drawText(ctx, Math.round(v * 100) + '%', panelX + panelW - 26, y, sel ? '#ffe070' : '#80a0c0', 1, 'right');
            } else if (i === 3) {
                // Shake intensity 0..2 normalized into a wider bar.
                const v = options.get('shakeScale') / 2;
                const barX = panelX + panelW - 64, barY = y + 3, barW = 32, barH = 4;
                ctx.fillStyle = '#241830';
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = sel ? '#ffe070' : '#80a0c0';
                ctx.fillRect(barX, barY, Math.round(barW * v), barH);
                drawText(ctx, options.get('shakeScale').toFixed(2), panelX + panelW - 26, y, sel ? '#ffe070' : '#80a0c0', 1, 'right');
            } else if (i === 2) {
                drawText(ctx, options.get('scanlines') ? 'ON' : 'OFF', panelX + panelW - 26, y, sel ? '#ffe070' : '#80a0c0', 1, 'right');
            }
        }
        drawText(ctx, 'LEFT/RIGHT CHANGE  X CONFIRM  P BACK', GAME.W / 2, panelY + panelH - 10, '#604068', 1, 'center');
    }

    // ============== Achievements panel ==============
    // 4×4 trophy grid. Arrow keys move a cursor; selected tile shows a detail
    // strip at the bottom with name + description. Locked tiles show a "?" icon
    // and hide the description so unknowns feel discoverable.
    _tickAchievements() {
        if (input.isPressed('pause') || input.isPressed('jump')) { this.scene = SCENE.PAUSE; audio.sfx('pause'); return; }
        const cols = 4;
        const n = ACHIEVEMENT_LIST.length;
        if (this.achievementsIndex == null) this.achievementsIndex = 0;
        const i = this.achievementsIndex;
        if (input.isPressed('left'))  { this.achievementsIndex = (i + n - 1) % n; audio.sfx('select'); }
        if (input.isPressed('right')) { this.achievementsIndex = (i + 1) % n; audio.sfx('select'); }
        if (input.isPressed('up'))    { this.achievementsIndex = (i - cols + n) % n; audio.sfx('select'); }
        if (input.isPressed('down'))  { this.achievementsIndex = (i + cols) % n; audio.sfx('select'); }
        this._achPulse = (this._achPulse || 0) + 1;
    }
    _drawAchievements() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'ACHIEVEMENTS', GAME.W / 2, 8, '#ffe070', '#a82020', 1, 'center');
        // Progress bar — full-width strip under the title.
        const got = achievements.unlocked.size;
        const total = ACHIEVEMENT_LIST.length;
        const pct = total === 0 ? 0 : got / total;
        const barX = 24, barY = 22, barW = GAME.W - 48, barH = 4;
        ctx.fillStyle = '#241830';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(barX, barY, Math.floor(barW * pct), barH);
        drawText(ctx, got + ' / ' + total, GAME.W / 2, 30, '#a0c0e0', 1, 'center');

        // Grid: 5 cols × 4 rows so 18 entries fit (last row had 2 tiles
        // clipping behind the detail strip on the prior 4×4 layout). 40w×34h
        // keeps the tile glyph + name legible at the smaller width.
        const cols = 5;
        const tileW = 40, tileH = 34;
        const gridW = cols * tileW + (cols - 1) * 3;
        const gridX = Math.floor((GAME.W - gridW) / 2);
        const gridY = 44;
        const cursor = this.achievementsIndex || 0;
        for (let idx = 0; idx < ACHIEVEMENT_LIST.length; idx++) {
            const a = ACHIEVEMENT_LIST[idx];
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const x = gridX + c * (tileW + 3);
            const y = gridY + r * (tileH + 4);
            const unlocked = achievements.isUnlocked(a.id);
            const isSel = idx === cursor;
            // Background
            ctx.fillStyle = unlocked ? '#3a2818' : '#1a1018';
            ctx.fillRect(x, y, tileW, tileH);
            // Border (selected = animated yellow, locked = dim purple)
            const phase = isSel ? (Math.sin(this._achPulse * 0.18) * 0.5 + 0.5) : 0;
            ctx.fillStyle = isSel
                ? (unlocked ? `rgb(${255},${224 - Math.floor(phase * 100)},${112 - Math.floor(phase * 80)})` : '#a06030')
                : (unlocked ? '#604030' : '#302840');
            ctx.fillRect(x, y, tileW, 1);
            ctx.fillRect(x, y + tileH - 1, tileW, 1);
            ctx.fillRect(x, y, 1, tileH);
            ctx.fillRect(x + tileW - 1, y, 1, tileH);
            // Trophy icon centered
            const iconText = unlocked ? a.icon : '?';
            const iconColor = unlocked ? '#ffe070' : '#604068';
            drawTextOutlined(ctx, iconText, x + tileW / 2, y + 6, iconColor, '#1a0000', 1, 'center');
            // Mini-name (tight truncate — 6 chars max @ 1× pixel font ≈ 36px,
            // fits the 40px tile with 2px side margin). Full name renders in
            // the detail strip at the bottom.
            const shortName = unlocked ? a.name : '?????';
            const truncated = shortName.length > 6 ? shortName.substring(0, 5) + '.' : shortName;
            drawText(ctx, truncated, x + tileW / 2, y + 22, unlocked ? '#fff' : '#403048', 1, 'center');
        }
        // Detail strip at the bottom — selected achievement name + description.
        // Sits above the help row so they don't collide.
        const sel = ACHIEVEMENT_LIST[cursor];
        if (sel) {
            const selUnlocked = achievements.isUnlocked(sel.id);
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(8, GAME.H - 32, GAME.W - 16, 20);
            drawText(ctx, selUnlocked ? sel.name : '???', GAME.W / 2, GAME.H - 30, selUnlocked ? '#ffe070' : '#604068', 1, 'center');
            drawText(ctx, selUnlocked ? sel.desc : 'NOT YET UNLOCKED', GAME.W / 2, GAME.H - 20, selUnlocked ? '#a0c0e0' : '#403048', 1, 'center');
        }
        drawText(ctx, 'ARROWS NAV   P CLOSE', GAME.W / 2, GAME.H - 8, '#604068', 1, 'center');
    }

    // ============== Soundtrack gallery ==============
    _tickSoundtrack() {
        if (input.isPressed('pause')) {
            // Closing — restore the music that was playing before
            if (this._soundtrackResumeTrack) audio.playTrack(this._soundtrackResumeTrack);
            this.scene = SCENE.PAUSE;
            audio.sfx('pause');
            return;
        }
        const n = TRACK_MANIFEST.length;
        if (input.isPressed('up'))   { this.soundtrackIndex = (this.soundtrackIndex + n - 1) % n; audio.sfx('select'); }
        if (input.isPressed('down')) { this.soundtrackIndex = (this.soundtrackIndex + 1) % n; audio.sfx('select'); }
        // X plays the selected track. If already playing, X toggles stop.
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            const sel = TRACK_MANIFEST[this.soundtrackIndex];
            if (sel) {
                if (audio.currentTrack === sel.track && this._soundtrackPlaying) {
                    audio.stopTrack();
                    this._soundtrackPlaying = false;
                } else {
                    audio.playTrack(sel.track);
                    this._soundtrackPlaying = true;
                }
                audio.sfx('menu');
            }
        }
    }
    _drawSoundtrack() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'SOUNDTRACK', GAME.W / 2, 16, '#ffe070', '#a82020', 1, 'center');

        const startY = 36;
        const rowH = 22;
        for (let i = 0; i < TRACK_MANIFEST.length; i++) {
            const t = TRACK_MANIFEST[i];
            const y = startY + i * rowH;
            const selected = i === this.soundtrackIndex;
            const playing = audio.currentTrack === t.track && this._soundtrackPlaying;

            // Row backplate
            if (selected) {
                ctx.fillStyle = '#a01020';
                ctx.fillRect(10, y - 2, GAME.W - 20, rowH - 2);
            } else {
                ctx.fillStyle = '#180814';
                ctx.fillRect(10, y - 2, GAME.W - 20, rowH - 2);
            }
            // Play/pause glyph
            const glyphX = 16, glyphY = y + 4;
            if (playing) {
                // Pulsing speaker waves
                const pulse = (this.bootTimer % 30) < 15;
                ctx.fillStyle = '#50ff70';
                ctx.fillRect(glyphX, glyphY, 2, 6);
                ctx.fillRect(glyphX + 3, glyphY + 1, 1, 4);
                if (pulse) ctx.fillRect(glyphX + 5, glyphY, 1, 6);
            } else {
                // Play triangle
                ctx.fillStyle = selected ? '#ffe070' : '#604068';
                ctx.fillRect(glyphX,     glyphY,     1, 6);
                ctx.fillRect(glyphX + 1, glyphY + 1, 1, 4);
                ctx.fillRect(glyphX + 2, glyphY + 2, 1, 2);
            }

            // Track index + title
            const idx = String(i + 1).padStart(2, '0');
            drawText(ctx, idx, 28, y + 2, selected ? '#ffe070' : '#a08090', 1, 'left');
            drawText(ctx, t.title, 48, y + 2, '#fff', 1, 'left');
            // Mood + author on the right
            drawText(ctx, t.mood, GAME.W - 12, y + 2,  selected ? '#ffe070' : '#a0c0e0', 1, 'right');
            drawText(ctx, t.author, GAME.W - 12, y + 11, '#604068', 1, 'right');

            if (playing) {
                drawText(ctx, 'NOW PLAYING', 48, y + 11, '#50ff70', 1, 'left');
            }
        }

        // Footer count + controls
        drawText(ctx,
            (this.soundtrackIndex + 1) + ' / ' + TRACK_MANIFEST.length + ' TRACKS',
            GAME.W / 2, GAME.H - 26, '#a08090', 1, 'center');
        drawText(ctx, 'UP/DOWN SELECT   X PLAY/STOP   P CLOSE', GAME.W / 2, GAME.H - 14, '#604068', 1, 'center');
    }

    // ============== Inter-stage cinematic card ==============
    // Painted scene + stage name + tagline shown between stage_clear and
    // the next stage_intro. Player advances with X or auto-advances after 240f.
    _tickStageCard() {
        this.storyTimer++;
        if (this.storyTimer > 240 || (this.storyTimer > 40 && (input.isPressed('shoot') || input.isPressed('jump')))) {
            audio.sfx('select');
            // _pendingStage was set by stage_clear when routing through the card.
            // Leave it set so the 30-frame fade-out draw of this card keeps reading
            // the same upcoming-stage value — _startStage swaps currentStage to
            // `next`, and without _pendingStage the draw would briefly flash the
            // card for currentStage+1 (the *following* stage) before the fade
            // hands off to STAGE_INTRO.
            const next = this._pendingStage || (this.currentStage + 1);
            this._secretDiscoveryCard = false;
            this._startStage(next);
        }
    }
    _drawStageCard() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Pick the card for the upcoming stage
        const next = this._pendingStage || (this.currentStage + 1);
        const STAGE_CARDS = {
            2: 'card_breakroom',
            3: 'card_serverroom',
            4: 'card_boardroom',
            5: 'card_keynote',
            6: 'card_founder',
            7: 'card_bossrush',
            8: 'card_cloud',
            9: 'card_recyclebin',
        };
        const key = STAGE_CARDS[next];
        const t = this.storyTimer;
        if (key && sprites.has(key)) {
            const img = sprites.images.get(key);
            // Ken-Burns zoom — modest 1.08 → 1.18 so the crop stays predictable.
            // Painted cards have Clippy near bottom-center; we pan UP (revealing
            // the environment above Clippy) so the subject is always visible.
            const zoom = 1.08 + Math.min(0.10, t * 0.0005);
            const scale = (GAME.W / img.width) * zoom;
            const dw = img.width * scale;
            const dh = img.height * scale;
            // Anchor on Clippy: start at frac 0.55 (lower-mid), pan to 0.35 (upper-mid)
            const panT = Math.min(1, t / 240);
            const frac = 0.55 - panT * 0.20;
            const dy = -(dh - GAME.H) * frac;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, (GAME.W - dw) / 2, dy, dw, dh);
        } else {
            // Asset-missing fallback: deep navy gradient + faint stage label badge.
            // Far better than a flat black screen — tells the player something
            // intentional is happening even when art fails to load.
            const grad = ctx.createLinearGradient(0, 0, 0, GAME.H);
            grad.addColorStop(0, '#1a0a1a');
            grad.addColorStop(0.5, '#0a0612');
            grad.addColorStop(1, '#1a0a1a');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            // Pulsing center diamond as a visual placeholder
            const pulse = 0.4 + Math.sin(t * 0.08) * 0.2;
            ctx.fillStyle = `rgba(255, 224, 112, ${pulse})`;
            const cx = GAME.W / 2, cy = GAME.H / 2;
            for (let i = 0; i < 4; i++) ctx.fillRect(cx - 2 + (i === 1 ? 2 : i === 3 ? -2 : 0), cy - 2 + (i === 0 ? -2 : i === 2 ? 2 : 0), 2, 2);
        }
        // Letterbox bars
        const barH = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);

        // Inter-stage dialog beats in the TOP letterbox.
        // Beat 1 fades in at t > 30, beat 2 at t > 90. Each holds until card exit.
        const dialog = STAGE_CARD_DIALOG[next];
        if (dialog) {
            if (t > 30) {
                const k = Math.min(1, (t - 30) / 25);
                ctx.globalAlpha = k;
                drawText(ctx, dialog[0], GAME.W / 2, 10, '#ffe070', 1, 'center');
                ctx.globalAlpha = 1;
            }
            if (t > 90) {
                const k = Math.min(1, (t - 90) / 25);
                ctx.globalAlpha = k;
                drawText(ctx, dialog[1], GAME.W / 2, 19, '#c0a0d0', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }

        // Stage name + tagline appearing in the lower letterbox
        const stg = STAGES[next];
        if (stg) {
            if (t > 20) {
                const k = Math.min(1, (t - 20) / 30);
                ctx.globalAlpha = k;
                drawText(ctx, 'STAGE ' + stg.id, GAME.W / 2, GAME.H - 26, '#ffe070', 1, 'center');
                drawTextOutlined(ctx, stg.name, GAME.W / 2, GAME.H - 18, '#ff5050', '#1a0000', 1, 'center');
                ctx.globalAlpha = 1;
            }
            if (t > 80) {
                const k = Math.min(1, (t - 80) / 30);
                ctx.globalAlpha = k;
                drawText(ctx, stg.tagline, GAME.W / 2, GAME.H - 10, '#c0a0d0', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }
        // Secret-discovery flourish — when the no-damage stage-1 clear routes
        // the player to stage 9, paint a cyan "SECRET FOUND" overlay across
        // the center of the card so the moment lands. Cyan keeps it visually
        // distinct from the normal red/gold stage palette.
        if (this._secretDiscoveryCard) {
            // Flash band — full-width across the middle of the canvas
            const flash = Math.max(0, 1 - t / 90);   // fades over first 1.5s
            if (flash > 0) {
                ctx.fillStyle = `rgba(122, 240, 255, ${(flash * 0.45).toFixed(3)})`;
                ctx.fillRect(0, GAME.H / 2 - 20, GAME.W, 40);
            }
            // Label appears just after the flash starts
            if (t > 12) {
                const k = Math.min(1, (t - 12) / 25);
                const pulse = (Math.sin(t * 0.16) + 1) * 0.5;
                ctx.globalAlpha = k * (0.65 + pulse * 0.35);
                drawTextOutlined(ctx, 'SECRET FOUND', GAME.W / 2, GAME.H / 2 - 8, '#7af0ff', '#0a1a24', 2, 'center');
                drawText(ctx, 'OFF THE GRID', GAME.W / 2, GAME.H / 2 + 6, '#80a0c0', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }
        // Blinking "X" hint in the upper-right corner — small footprint so it doesn't
        // crowd the dialog beats below, and the player learns the input quickly anyway.
        if (t > 130 && (t % 60) < 40) {
            drawText(ctx, 'X >', GAME.W - 4, 2, '#a08090', 1, 'right');
        }
    }

    // ============== Stage select ==============
    _tickStageSelect() {
        if (input.isPressed('pause')) { this.scene = SCENE.TITLE; audio.sfx('pause'); return; }
        const n = 8; // stages 1..8, secret 9 only shown if unlocked
        const hasSecret = !!achievements.stats?.secretStageDiscovered;
        const total = hasSecret ? 9 : n;
        if (input.isPressed('left'))  { this.stageSelectIndex = (this.stageSelectIndex + total - 1) % total; audio.sfx('select'); }
        if (input.isPressed('right')) { this.stageSelectIndex = (this.stageSelectIndex + 1) % total; audio.sfx('select'); }
        if (input.isPressed('up'))    { this.stageSelectIndex = Math.max(0, this.stageSelectIndex - 4); audio.sfx('select'); }
        if (input.isPressed('down'))  { this.stageSelectIndex = Math.min(total - 1, this.stageSelectIndex + 4); audio.sfx('select'); }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            const stage = this.stageSelectIndex + 1;
            if (stage <= this.unlockedStage || (stage === 9 && hasSecret)) {
                audio.sfx('menu');
                // Reset player + run stats for the selected stage
                this.player = null;
                this.totalTime = 0;
                this.totalDeaths = 0;
                this._startStage(stage);
            } else {
                audio.sfx('comboBreak');
            }
        }
    }
    _drawStageSelect() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0410';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Subtle bg pattern
        ctx.fillStyle = '#1a0a1a';
        for (let y = 0; y < GAME.H; y += 8) for (let x = 0; x < GAME.W; x += 8) {
            if (((x + y) >> 3) & 1) ctx.fillRect(x, y, 1, 1);
        }
        drawTextOutlined(ctx, 'STAGE SELECT', GAME.W / 2, 12, '#ffe070', '#a82020', 1, 'center');

        // 4x2 grid of stage tiles (plus secret 9 in slot below)
        const hasSecret = !!achievements.stats?.secretStageDiscovered;
        const total = hasSecret ? 9 : 8;
        const cols = 4;
        const tileW = 58, tileH = 50;
        const startX = (GAME.W - cols * tileW - (cols - 1) * 4) / 2;
        const startY = 30;
        for (let i = 0; i < total; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const tx = Math.round(startX + col * (tileW + 4));
            const ty = Math.round(startY + row * (tileH + 6));
            const stage = i + 1;
            const data = STAGES[stage];
            const unlocked = stage <= this.unlockedStage || (stage === 9 && hasSecret);
            const selected = i === this.stageSelectIndex;

            // Tile backplate
            ctx.fillStyle = selected ? '#a01020' : '#1a0a14';
            ctx.fillRect(tx, ty, tileW, tileH);
            ctx.fillStyle = selected ? '#ffe070' : '#3a2a4a';
            // Border
            ctx.fillRect(tx, ty, tileW, 1);
            ctx.fillRect(tx, ty + tileH - 1, tileW, 1);
            ctx.fillRect(tx, ty, 1, tileH);
            ctx.fillRect(tx + tileW - 1, ty, 1, tileH);

            // Number / lock
            if (unlocked) {
                drawText(ctx, String(stage).padStart(2, '0'), tx + 4, ty + 4, '#ffe070', 1, 'left');
            } else {
                drawText(ctx, '??', tx + 4, ty + 4, '#604068', 1, 'left');
            }
            // Name (truncated for tile width)
            const name = (data?.name || '').slice(0, 10);
            drawText(ctx, name, tx + 4, ty + 14, unlocked ? '#fff' : '#604068', 1, 'left');

            // Medal row — 3 slots at bottom of tile
            const med = this.runStats?.medals?.[stage] || { noDamage: false, allKills: false, secret: false };
            const slots = [
                { ok: med.noDamage, c: '#50ff70' },
                { ok: med.allKills, c: '#ff8050' },
                { ok: med.secret,   c: '#7af0ff' },
            ];
            for (let s = 0; s < 3; s++) {
                const sx = tx + 6 + s * 14;
                const sy = ty + tileH - 12;
                ctx.fillStyle = slots[s].ok ? slots[s].c : '#3a2a3a';
                ctx.fillRect(sx, sy, 8, 8);
                if (slots[s].ok) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(sx + 3, sy + 1, 2, 6);
                    ctx.fillRect(sx + 1, sy + 3, 6, 2);
                }
            }
            // Best-score pip — small gold star top-right of tile when stage
            // has a recorded best. Marks NEW BEST runs permanently.
            const stageBest = achievements.stats?.stageBestScores?.[stage] || 0;
            if (unlocked && stageBest > 0) {
                ctx.fillStyle = '#ffe070';
                const sx = tx + tileW - 7, sy = ty + 3;
                ctx.fillRect(sx + 1, sy, 2, 4);
                ctx.fillRect(sx, sy + 1, 4, 2);
            }
            // Secret stage shimmer
            if (stage === 9) {
                ctx.fillStyle = '#7af0ff';
                ctx.globalAlpha = 0.25 + Math.sin(this.bootTimer * 0.1) * 0.15;
                ctx.fillRect(tx + 1, ty + 1, tileW - 2, tileH - 2);
                ctx.globalAlpha = 1;
            }
        }

        // Selected-stage detail strip at bottom
        const sel = this.stageSelectIndex + 1;
        const selData = STAGES[sel];
        if (selData) {
            const unlocked = sel <= this.unlockedStage || (sel === 9 && hasSecret);
            const detY = startY + Math.ceil(total / cols) * (tileH + 6) + 8;
            drawTextOutlined(ctx, unlocked ? selData.name : '? ? ?', GAME.W / 2, detY, '#fff', '#1a0010', 1, 'center');
            if (unlocked) {
                drawText(ctx, selData.tagline, GAME.W / 2, detY + 10, '#c0a0d0', 1, 'center');
                const selBest = achievements.stats?.stageBestScores?.[sel] || 0;
                if (selBest > 0) {
                    drawText(ctx, 'BEST ' + selBest.toLocaleString(), GAME.W / 2, detY + 20, '#ffe070', 1, 'center');
                }
            }
        }
        drawText(ctx, 'ARROWS SELECT   X START   P BACK', GAME.W / 2, GAME.H - 14, '#604068', 1, 'center');
    }

    _spawnMiniBoss() {
        this.miniBossSpawned = true;
        const stg = STAGES[this.currentStage];
        const bx = this.player.x + 100;
        const by = this.level.height - 32;
        // Pick a thematic mini-boss kind based on stage. Default to the stage's own boss
        // sprite at 35% HP and no phase-2 transition.
        const miniKind = (this.level.data.miniBossKind) || stg.boss;
        // Spawn via enemy manager — re-use Boss class
        const m = this.enemies.spawnBoss(bx, by, miniKind);
        if (m) {
            m.isMini = true;
            m.hp = Math.ceil(m.maxHp * 0.35);
            m.maxHp = m.hp;
            m.score = Math.round(m.score * 0.4);
            // Smaller mini → tagline override
            m.name = 'MINI ' + m.name;
            m.tagline = 'WARMUP ROUND';
        }
        audio.sfx('bossHit');
        this.camera.shake(6);
        this._triggerBossEntrance(true);
    }

    _spawnBoss() {
        this.bossSpawned = true;
        // Route through the cinematic pre-boss slide. The actual spawn +
        // entrance flourish runs at the end of the cinematic in
        // _finishBossIntro(). Skippable with X/jump after a short hold so
        // players can mash through on repeat runs.
        this.scene = SCENE.BOSS_INTRO;
        this._bossIntro = { age: 0, done: false };
    }

    // Actual boss spawn + entrance flourish — called at the end of the
    // BOSS_INTRO cinematic, OR directly if cinematic is skipped.
    _finishBossIntro() {
        const stg = STAGES[this.currentStage];
        const bx = this.player.x + 100;
        const by = this.level.height - 32;
        if (stg.boss === 'GAUNTLET') {
            this._gauntletQueue = ['COPIER_3000', 'SHREDDER', 'CTRL_ALT_DEL'];
            this._spawnNextGauntlet();
        } else {
            this.enemies.spawnBoss(bx, by, stg.boss);
        }
        audio.playTrack('bossBattle');
        this.camera.shake(10);
        this._triggerBossEntrance();
        this.scene = SCENE.PLAY;
        this._bossIntro = null;
    }

    _spawnNextGauntlet() {
        if (!this._gauntletQueue || !this._gauntletQueue.length) return false;
        const kind = this._gauntletQueue.shift();
        const bx = this.player.x + 100;
        const by = this.level.height - 32;
        this.enemies.spawnBoss(bx, by, kind);
        this.camera.shake(8);
        this._triggerBossEntrance();
        return true;
    }

    // Boss entrance beat — title card with name/tagline + (full boss) red flash.
    // Main:  120f total — 0-15 flash, 15-90 hold, 90-120 fade.
    // Mini:   80f total — no flash, slimmer letterbox, shorter hold.
    // Boss reference is resolved at draw time since enemies.spawnBoss hasn't
    // fully wired this.boss yet at the moment we trigger.
    _triggerBossEntrance(isMini = false) {
        this._bossEntrance = { age: 0, isMini };
        // Full boss gets the heavy entrance roar; mini-boss stays on the
        // smaller bossHit cue so the two arrivals stay tonally distinct.
        if (!isMini) audio.sfx('bossEntrance');
        else audio.sfx('bossHit');
    }

    _respawn() {
        this.player.x = this.level.data.playerStart.x;
        this.player.y = this.level.data.playerStart.y;
        this.player.vx = 0; this.player.vy = 0;
        this.player.state = 'idle';
        this.player.resetForStage();
        // Materialize beat — outward shock ring + dust + ready chime so the
        // respawn isn't a silent teleport. The i-frame window is the same;
        // this just makes it visible/audible.
        const cx = this.player.x + this.player.w / 2;
        const cy = this.player.y + this.player.h / 2;
        particles.shockRing(cx, cy, 18, 16, '#a8d4ff');
        particles.dust(cx, this.player.y + this.player.h - 2);
        audio.sfx('respawn');
    }

    // ============== stage transitions ==============
    _startStage(n) {
        // Bounds-clamp: STAGE_LOADERS[0] is null, indices 1..9 are real stages.
        // Out-of-range arrivals (stale save, tampered URL, math glitch) shouldn't crash —
        // fall back to stage 1.
        if (!Number.isInteger(n) || n < 1 || n >= STAGE_LOADERS.length || !STAGE_LOADERS[n]) {
            console.warn('_startStage: invalid stage', n, '— defaulting to 1');
            n = 1;
        }
        this.currentStage = n;
        this.unlockedStage = Math.max(this.unlockedStage, n);
        // Reset per-stage counters
        this.stageStats = { kills: 0, deaths: 0, damageTaken: 0, secrets: 0, weaponDamage: {}, shotsFired: 0 };
        // Defensive reset: stage-clear gate, in case the previous stage death-handled
        // the boss-clear path or the player was rescued in the middle of stage clear.
        this._clearScheduled = false;
        this._clearBursts = [];
        this.slowMoFrames = 0;
        this._newlyUnlocked = null;
        this._bossKillBeatFired = false;
        // Gauntlet queue from boss-rush (stage 7) can survive if the player
        // dies or quits mid-rush. Drop any leftover entries before the next
        // stage so its boss-clear path doesn't try to spawn the next rush boss.
        this._gauntletQueue = null;
        this._bossEntrance = null;
        this._bossIntro = null;
        this._lastBossPhase = null;
        const data = STAGE_LOADERS[n]();
        this.level = new Level(data);
        this.parallax.setTheme(data.theme);
        // Owl roosts: level can declare these in its data; otherwise default to a few sensible spots
        if (data.owlRoosts) {
            this.parallax.setOwlRoosts(data.owlRoosts.map(o => ({ x: o.x, y: o.y })));
        } else {
            this.parallax.setOwlRoosts([]);
        }
        this.camera.setBounds(this.level.width, this.level.height);
        this.enemies.clear();
        this.enemies.setStageDifficulty(n);
        this.pickups.clear();
        // Mark initial spawn phase so pre-placed enemies get a 60-frame grace
        // before they can act. Gives the player a full second to read the stage.
        this.enemies._initialSpawnPhase = true;
        for (const s of data.enemySpawns) this.enemies.spawn(s.x, s.y, s.type);
        this.enemies._initialSpawnPhase = false;
        // Stash totals so the stage-clear medals know what 100% looks like
        this.stageStats.totalEnemies = data.enemySpawns.length;
        this.stageStats.hasSecret = !!data.secretAlcove;
        this.pickups.loadFromLevel(data);
        if (!this.player) {
            this.player = new Player(data.playerStart.x, data.playerStart.y);
        } else {
            this.player.x = data.playerStart.x;
            this.player.y = data.playerStart.y;
            this.player.vx = 0; this.player.vy = 0;
            this.player.bullets.length = 0;
            this.player.resetForStage();
        }
        this.bossSpawned = false;
        this.miniBossSpawned = false;
        this.boss = null;
        this.stageTime = 0;
        this.storyTimer = 0;
        this._fadeTo(SCENE.STAGE_INTRO);
    }

    _onStageClear() {
        if (this._clearScheduled) return;
        this._clearScheduled = true;
        // Stray mini-boss survives if player rushed past the mini trigger
        // and burned down the main first — drop it so its HP bar doesn't
        // bleed through the stage-clear panel.
        const stray = this.enemies.activeMiniBoss();
        if (stray) { stray.alive = false; stray.hp = 0; }
        audio.stopTrack();
        audio.sfx('explode');
        // Big payoff: schedule 8 explosion bursts at boss position via the game's
        // own frame counter (NOT setTimeout — those survive scene transitions and
        // could fire in the next stage).
        if (this.boss) {
            this._clearBursts = [];
            const bx = this.boss.x + this.boss.w / 2;
            const by = this.boss.y + this.boss.h / 2;
            for (let i = 0; i < 8; i++) {
                this._clearBursts.push({
                    fireAt: i * 5, // every 5 frames (~83ms)
                    x: bx + (Math.random() - 0.5) * 40,
                    y: by + (Math.random() - 0.5) * 30,
                });
            }
            this.camera.shake?.(8);
        } else {
            audio.sfx('powerup');
            this._clearBursts = [];
        }
        this.scene = SCENE.STAGE_CLEAR;
        this.storyTimer = 0;
        this._stageClearTallyDone = false;
        this._stageClearRank = null;
        // New-best score detection — compare current run score (which acts as
        // the cumulative-up-to-this-stage score) against per-stage best.
        // Show the NEW BEST tag in the SCORE row of the stats panel.
        const sBest = achievements.stats.stageBestScores || {};
        const prevBest = sBest[this.currentStage] || 0;
        this._stageNewBest = this.player.score > prevBest;
        if (this._stageNewBest) {
            sBest[this.currentStage] = this.player.score;
            achievements.stats.stageBestScores = sBest;
            achievements._save?.();
        }

        // Per-stage medals — 3 medals per stage that drive replay value
        const earned = {
            noDamage: this.stageStats.damageTaken === 0,
            allKills: this.stageStats.totalEnemies > 0 &&
                      this.stageStats.kills >= this.stageStats.totalEnemies,
            secret: this.stageStats.foundSecret === true,
        };
        this.stageStats.medals = earned;
        // Persist on a per-stage medal record so badges show on stage select
        if (!this.runStats.medals) this.runStats.medals = {};
        const slot = this.runStats.medals[this.currentStage] || { noDamage: false, allKills: false, secret: false };
        slot.noDamage ||= earned.noDamage;
        slot.allKills ||= earned.allKills;
        slot.secret   ||= earned.secret;
        this.runStats.medals[this.currentStage] = slot;

        // Roll stage stats up to run + achievement system
        this.runStats.stagesCleared.add(this.currentStage);
        this.runStats.maxCombo = Math.max(this.runStats.maxCombo, this.player.maxCombo);
        for (const [k, v] of Object.entries(this.player.dmgDealt || {})) {
            this.runStats.weaponDamage[k] = (this.runStats.weaponDamage[k] || 0) + v;
        }
        if (this.stageStats.damageTaken === 0) this.runStats.noDamageStages++;
        // Roll the per-stage "target lost" bubble count into the run total
        // before snapshotting for achievements (GHILLIE SUIT).
        this.runStats.enemiesLost = (this.runStats.enemiesLost || 0)
            + (this.enemies.lostBubbleTotal || 0);

        // Update achievement snapshot
        const newlyUnlocked = achievements.update({
            totalKills: this.player.kills,
            stagesCleared: this.runStats.stagesCleared,
            totalDeaths: this.totalDeaths,
            noDamageStages: this.runStats.noDamageStages,
            maxCombo: this.runStats.maxCombo,
            weaponDamage: this.runStats.weaponDamage,
            totalTime: this.totalTime,
            secretStageDiscovered: this.runStats.stagesCleared.has(9),
            bulletTimeUses: this.runStats.bulletTimeUses,
            bestScore: this.player.score,
            enemiesLost: this.runStats.enemiesLost,
            pounceKills: (this.player.pounceKills || 0),
        });
        this._newlyUnlocked = newlyUnlocked;  // shown on stage-clear screen
        // Fanfare when at least one achievement unlocks this clear. Single
        // ding regardless of count — the banner queue handles per-entry display.
        if (newlyUnlocked.length > 0) audio.sfx('unlock');

        // Save high score
        if (this.player.score > achievements.stats.bestScore) {
            achievements.stats.bestScore = this.player.score;
            achievements._save();
        }
    }
    _tickStageClear() {
        this.storyTimer++;
        // Drive boss explosion bursts on the game's own frame counter
        if (this._clearBursts && this._clearBursts.length) {
            for (let i = this._clearBursts.length - 1; i >= 0; i--) {
                const b = this._clearBursts[i];
                if (this.storyTimer >= b.fireAt) {
                    particles.explosion(b.x, b.y);
                    audio.sfx('explode');
                    this._clearBursts.splice(i, 1);
                }
            }
        }
        // Block input until panel is in place + stats started populating
        if (this.storyTimer > 130 && (input.isPressed('shoot') || input.isPressed('jump'))) {
            this._clearScheduled = false;
            audio.sfx('select');
            // Secret stage gate: stage 1 cleared with no damage routes to 9 once
            let nextStage;
            if (this.currentStage === 1 && this.stageStats.damageTaken === 0 && !achievements.stats.secretStageDiscovered) {
                achievements.stats.secretStageDiscovered = true;
                achievements._save();
                nextStage = 9;
                // Flag this stage-card frame as the secret-discovery moment so
                // the card render adds a "SECRET FOUND" overlay + flash. One
                // shot — cleared when the card exits.
                this._secretDiscoveryCard = true;
                // Triumphant chime — fires once as the card opens, layers on
                // top of the regular 'select' SFX above.
                audio.sfx('secretFound');
            } else if (this.currentStage === 9) {
                // After secret, drop back to stage 2
                nextStage = 2;
            } else if (this.currentStage >= 8) {
                this._fadeTo(SCENE.GAME_COMPLETE);
                return;
            } else {
                nextStage = this.currentStage + 1;
            }
            // Route through the painted cinematic card before the next stage
            this._pendingStage = nextStage;
            this.storyTimer = 0;
            this.scene = SCENE.STAGE_CARD;
        }
    }
    // Stage-clear screen plays as a 5-beat cinematic timeline driven by
    // this.storyTimer. Each beat reads its own time window and bails early
    // before the next one. Coordinating timestamps via the helper layout:
    //   0–50f:   white flash over live scene
    //   50–95f:  background dim + "STAGE CLEAR" title bounce-in
    //   95+ +12: results panel slide-up + alpha-in
    //   panel+: stats rows stagger in
    //   panel+80: medal row (no-dmg / all-kills / secret)
    //   panel+100: newly-unlocked achievement banner
    //   panel+90: "X TO CONTINUE" prompt blink
    _drawStageClear() {
        const t = this.storyTimer;
        if (this._drawStageClearFlash(t)) return;
        this._drawStageClearDim(t);
        this._drawStageClearTitle(t);
        if (t < 95) return;
        const panelT = t - 95;
        const panelTop = this._drawStageClearPanel(panelT);
        if (panelT < 12) return;
        this._drawStageClearStats(panelT, panelTop);
        this._drawStageClearMedals(panelT);
        this._drawStageClearAchievementBanner(panelT);
        this._drawStageClearContinuePrompt(t, panelT);
    }

    // Beat 1: white flash. Returns true if still in this beat so caller bails
    // (we keep _drawPlay visible underneath for the boss explosion).
    _drawStageClearFlash(t) {
        if (t >= 50) return false;
        const ctx = this.ctx;
        const flash = t < 6 ? 0.9 : Math.max(0, 0.5 - t * 0.012);
        if (flash > 0) {
            ctx.fillStyle = `rgba(255,240,160,${flash})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        return true;
    }

    // Beat 2a: background dim ramping to 0.78 alpha over 40 frames.
    _drawStageClearDim(t) {
        const dim = Math.min(0.78, (t - 50) / 40 * 0.78);
        const ctx = this.ctx;
        ctx.fillStyle = `rgba(0,0,0,${dim})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
    }

    // Beat 2b: "STAGE CLEAR" title bounces in from above with ease-out cubic
    // and a sine overshoot. Scale shrinks from 3x to 2x at frame 60 (post-slam).
    _drawStageClearTitle(t) {
        let titleY = 22;
        if (t < 95) {
            const k = (t - 50) / 45;
            const eased = 1 - Math.pow(1 - k, 3);
            titleY = -20 + 42 * eased + Math.sin(k * Math.PI) * 4;
        }
        const titleScale = t < 60 ? 3 : 2;
        drawTextOutlined(this.ctx, 'STAGE CLEAR', GAME.W / 2, titleY, '#ffe070', '#a82020', titleScale, 'center');
    }

    // Beat 3: results panel slides up + fades in over ~12 frames. Returns the
    // settled panelTop Y so subsequent beats can align to it.
    _drawStageClearPanel(panelT) {
        const ctx = this.ctx;
        const panelTop = 42 + Math.max(0, 30 - panelT);
        const panelAlpha = Math.min(1, panelT / 12);
        ctx.globalAlpha = panelAlpha;
        ctx.fillStyle = '#1a0a20'; ctx.fillRect(20, panelTop, GAME.W - 40, 100);
        ctx.fillStyle = '#3a2a4a'; ctx.fillRect(20, panelTop, GAME.W - 40, 1);
        ctx.fillStyle = '#3a2a4a'; ctx.fillRect(20, panelTop + 99, GAME.W - 40, 1);
        ctx.globalAlpha = 1;
        return panelTop;
    }

    // Beat 4: stats rows stagger in every 8 frames. Score ticks up over 60f
    // so the final number feels earned rather than instant.
    _drawStageClearStats(panelT, panelTop) {
        const ctx = this.ctx;
        const min = Math.floor(this.stageTime / 3600);
        const sec = Math.floor((this.stageTime / 60) % 60);
        const time = `${min}:${String(sec).padStart(2,'0')}`;
        const accuracy = this.player.shotsFired > 0
            ? Math.round((this.stageStats.kills / this.player.shotsFired) * 100)
            : 0;
        // Rank letter grade — weighted on damage-taken (50%), accuracy (30%),
        // time (20%). Cached on the panel so the letter doesn't flicker between
        // ticks as shownScore changes. Renders on the right edge as a big
        // outlined letter once the stats have animated in.
        if (this._stageClearRank == null) {
            const dmg = this.stageStats.damageTaken || 0;
            const dmgScore = dmg === 0 ? 1 : dmg <= 2 ? 0.7 : dmg <= 5 ? 0.4 : 0.15;
            const accScore = Math.min(1, accuracy / 60); // 60% accuracy is full
            // Time: stage par ~75s; under par = full, slower scales down
            const par = 75 * 60; // frames
            const timeScore = Math.max(0.1, Math.min(1, par / Math.max(par, this.stageTime)));
            const composite = dmgScore * 0.5 + accScore * 0.3 + timeScore * 0.2;
            const letter = composite >= 0.92 ? 'S'
                         : composite >= 0.78 ? 'A'
                         : composite >= 0.62 ? 'B'
                         : composite >= 0.45 ? 'C' : 'D';
            this._stageClearRank = { letter, composite };
        }
        const scoreT = Math.min(1, (panelT - 12) / 60);
        const shownScore = Math.floor(this.player.score * scoreT);
        // Tick SFX every 4 frames while the score is still climbing — gives
        // the count-up a slot-machine cadence instead of a silent ramp.
        if (scoreT > 0 && scoreT < 1 && panelT % 4 === 0) {
            audio.sfx('select');
        }
        // One-shot "ka-ching" when the count-up finishes
        if (scoreT >= 1 && !this._stageClearTallyDone) {
            this._stageClearTallyDone = true;
            audio.sfx('pickup');
        }
        const stats = [
            ['TIME',       time,                                    '#7af0ff'],
            ['KILLS',      String(this.stageStats.kills),           '#fff'],
            ['MAX COMBO',  String(this.player.maxCombo) + 'x',      '#ffe070'],
            ['SCORE',      ('000000' + shownScore).slice(-6),       '#ffe070'],
            ['ACCURACY',   accuracy + '%',                          '#fff'],
            ['FAVORITE',   this._favoriteWeapon(),                  '#a0c0e0'],
        ];
        for (let i = 0; i < stats.length; i++) {
            if (panelT <= 12 + i * 8) continue;
            const [k, v, c] = stats[i];
            const y = panelTop + 8 + i * 14;
            drawText(ctx, k, 30,          y, '#c0a0d0', 1, 'left');
            drawText(ctx, v, GAME.W - 30, y, c,         1, 'right');
            // NEW BEST tag on the SCORE row — pulses gold when the player
            // beats their previous best for this stage. Only appears once
            // the score count-up has finished so the reveal lands.
            if (k === 'SCORE' && this._stageNewBest && scoreT >= 1) {
                const pulse = (Math.sin(panelT * 0.18) + 1) * 0.5;
                ctx.save();
                ctx.globalAlpha = 0.65 + pulse * 0.35;
                drawText(ctx, 'NEW BEST!', GAME.W / 2, y, '#ffe070', 1, 'center');
                ctx.restore();
            }
        }
        // Kill-marker row: "BOSS NAME [DOWN]" with a red strike-through bar
        // sweeping across the name. Pure payoff beat — confirms the kill in
        // language instead of just a score number.
        const killRowT = panelT - (12 + stats.length * 8);
        if (killRowT > 0) {
            const stg = STAGES[this.currentStage];
            const bossName = (stg && stg.boss) ? stg.boss.replace(/_/g, ' ') : 'BOSS';
            const y = panelTop + 8 + stats.length * 14 + 2;
            // The "[DOWN]" tag pops in after the name is drawn
            drawText(ctx, bossName, 30, y, '#ff5050', 1, 'left');
            const w = bossName.length * 6;
            // Strike-through sweep — width animates 0 → w over the first 20 frames
            const sweep = Math.min(1, killRowT / 20);
            ctx.fillStyle = '#ff3030';
            ctx.fillRect(28, y + 3, Math.floor((w + 4) * sweep), 1);
            if (killRowT > 22) {
                drawText(ctx, '[DOWN]', GAME.W - 30, y, '#ff5050', 1, 'right');
            }
        }
        // Rank letter — large outlined grade in the upper-right corner of the
        // panel. Pops in once the stats finish animating, with a brief scale-up
        // bounce. Tier colors mirror combo-tier palette: S=white, A=gold,
        // B=orange, C=red, D=grey.
        const rankT = panelT - (12 + stats.length * 8);
        if (rankT > 10) {
            const rk = this._stageClearRank;
            const RANK_COLOR = { S: '#fff8c8', A: '#ffe070', B: '#ff9030', C: '#ff5050', D: '#a08080' };
            const introT = Math.min(1, (rankT - 10) / 12);
            const bounce = 1 + Math.sin(introT * Math.PI) * 0.5;
            const scale = Math.round(3 * bounce);
            const rx = GAME.W - 40;
            const ry = panelTop + 12;
            drawTextOutlined(ctx, rk.letter, rx, ry, RANK_COLOR[rk.letter] || '#fff', '#1a0820', scale, 'center');
            // Small label
            if (introT >= 1) {
                drawText(ctx, 'RANK', rx, ry - 12, '#a0a0c0', 1, 'center');
            }
        }
    }

    // Beat 5: 3-slot medal row. Earned medals show as golden coins with stars,
    // missed ones show as grey coins with X marks.
    _drawStageClearMedals(panelT) {
        if (panelT <= 80) return;
        const m = this.stageStats.medals;
        if (!m) return;
        const ctx = this.ctx;
        const baseY = 150;
        const labels = [
            { label: 'NO DMG',   earned: m.noDamage, c: '#50ff70' },
            { label: 'ALL FOES', earned: m.allKills, c: '#ff8050' },
            { label: 'SECRET',   earned: m.secret,   c: '#7af0ff' },
        ];
        const slotW = 64;
        const startX = GAME.W / 2 - (slotW * 3) / 2 + slotW / 2;
        for (let i = 0; i < labels.length; i++) {
            const med = labels[i];
            const cx = startX + i * slotW;
            const earned = med.earned;
            ctx.fillStyle = earned ? '#a07028' : '#202028';
            ctx.fillRect(cx - 8, baseY, 16, 14);
            ctx.fillStyle = earned ? med.c : '#404048';
            ctx.fillRect(cx - 7, baseY + 1, 14, 12);
            ctx.fillStyle = earned ? '#ffe070' : '#606068';
            if (earned) {
                // Star
                ctx.fillRect(cx - 1, baseY + 3, 2, 8);
                ctx.fillRect(cx - 4, baseY + 6, 8, 2);
            } else {
                // X mark
                ctx.fillRect(cx - 3, baseY + 4, 1, 1); ctx.fillRect(cx + 2, baseY + 4, 1, 1);
                ctx.fillRect(cx - 2, baseY + 5, 1, 1); ctx.fillRect(cx + 1, baseY + 5, 1, 1);
                ctx.fillRect(cx - 1, baseY + 6, 3, 1);
                ctx.fillRect(cx - 2, baseY + 7, 1, 1); ctx.fillRect(cx + 1, baseY + 7, 1, 1);
                ctx.fillRect(cx - 3, baseY + 8, 1, 1); ctx.fillRect(cx + 2, baseY + 8, 1, 1);
            }
            drawText(ctx, med.label, cx, baseY + 16, earned ? '#ffe070' : '#606068', 1, 'center');
        }
    }

    // Beat 6: newly-unlocked achievement banner below medals.
    _drawStageClearAchievementBanner(panelT) {
        if (!this._newlyUnlocked?.length || panelT <= 100) return;
        const ctx = this.ctx;
        const a = this._newlyUnlocked[0];
        const banY = 180;
        ctx.fillStyle = '#1a0a00';
        ctx.fillRect(20, banY, GAME.W - 40, 20);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(20, banY, GAME.W - 40, 1);
        ctx.fillRect(20, banY + 19, GAME.W - 40, 1);
        drawText(ctx, 'NEW: ' + a.name, GAME.W / 2, banY + 4,  '#ffe070', 1, 'center');
        drawText(ctx, a.desc,           GAME.W / 2, banY + 13, '#fff',    1, 'center');
        // Inline icon strip for additional achievements — shows when 2+ unlock
        // in one stage. Icons sit ABOVE the banner so they don't collide with
        // the continue prompt at the bottom edge.
        if (this._newlyUnlocked.length > 1) {
            const stripY = banY - 22;
            const iconW = 12, gap = 2;
            const total = this._newlyUnlocked.length;
            const totalW = total * iconW + (total - 1) * gap;
            let ix = (GAME.W - totalW) / 2;
            for (const ent of this._newlyUnlocked) {
                ctx.fillStyle = '#3a2010';
                ctx.fillRect(ix, stripY, iconW, iconW);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(ix, stripY, iconW, 1);
                ctx.fillRect(ix, stripY + iconW - 1, iconW, 1);
                drawText(ctx, ent.icon, ix + iconW / 2, stripY + 3, '#ffe070', 1, 'center');
                ix += iconW + gap;
            }
            drawText(ctx, '+' + total + ' UNLOCKED', GAME.W / 2, stripY - 8,
                     '#a0c0a0', 1, 'center');
        }
    }

    // Beat 7: blinking "X TO CONTINUE" prompt at the bottom edge.
    _drawStageClearContinuePrompt(t, panelT) {
        if (panelT <= 90 || (t % 60 >= 40)) return;
        drawText(this.ctx, 'X TO CONTINUE', GAME.W / 2, GAME.H - 12, '#fff', 1, 'center');
    }

    _favoriteWeapon() {
        const dmg = this.player.dmgDealt || {};
        let best = 'MG', bestV = -1;
        for (const [k, v] of Object.entries(dmg)) if (v > bestV) { best = k; bestV = v; }
        return best === 'MG' ? 'MACHINE' : best;
    }

    _tickGameOver() {
        this.storyTimer++;
        if (this.gameOverIndex == null) this.gameOverIndex = 0;
        // 10-second auto-quit countdown begins after the 1.5s dramatic pause.
        // Adds Contra-style urgency: pick a choice or the run ends.
        if (this.storyTimer > 90) {
            const elapsed = this.storyTimer - 90;
            const remaining = Math.max(0, 600 - elapsed); // 10s at 60fps
            this.gameOverCountdown = Math.ceil(remaining / 60);
            // Tick SFX on each whole-second boundary (under 5s)
            const prev = Math.ceil(Math.max(0, 600 - (elapsed - 1)) / 60);
            if (this.gameOverCountdown !== prev && this.gameOverCountdown > 0 && this.gameOverCountdown <= 5) {
                audio.sfx('select');
            }
            if (remaining === 0) {
                audio.sfx('menu');
                this._restartRun();
                return;
            }
            if (input.isPressed('up') || input.isPressed('down')) {
                this.gameOverIndex = (this.gameOverIndex + 1) % GAME_OVER_OPTIONS.length;
                audio.sfx('select');
            }
            if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
                audio.sfx('menu');
                if (this.gameOverIndex === 0) {
                    // CONTINUE: re-enter the current stage. Preserves run score / time totals
                    // (small comeback penalty: score is halved as a soft cost).
                    this.player.score = Math.floor((this.player.score || 0) * 0.5);
                    this._startStage(this.currentStage || 1);
                } else {
                    this._restartRun();
                }
            }
        }
    }
    _drawGameOver() {
        const ctx = this.ctx;
        // Black + creeping red vignette
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        const pulse = 0.10 + Math.sin(this.storyTimer * 0.08) * 0.04;
        ctx.fillStyle = `rgba(168, 32, 40, ${pulse})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Drifting ember field — 24 slow-rising orange motes that pop in/out
        // with phased pulse alpha. Pure atmosphere; sells "the world is still
        // burning" while the player reads their stats.
        if (!this._goEmbers) {
            this._goEmbers = [];
            for (let i = 0; i < 24; i++) {
                this._goEmbers.push({
                    x: Math.random() * GAME.W,
                    y: Math.random() * GAME.H,
                    vy: -0.18 - Math.random() * 0.22,
                    phase: Math.random() * Math.PI * 2,
                    hue: Math.random() < 0.4 ? '#ffaa50' : '#ff5040',
                });
            }
        }
        for (const m of this._goEmbers) {
            m.y += m.vy;
            m.phase += 0.05;
            if (m.y < -2) { m.y = GAME.H + 2; m.x = Math.random() * GAME.W; }
            const a = 0.25 + Math.sin(m.phase) * 0.25;
            ctx.globalAlpha = Math.max(0, a);
            ctx.fillStyle = m.hue;
            ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
        }
        ctx.globalAlpha = 1;

        // Title — dramatic 3× outlined, slight settle-down animation
        const titleY = Math.min(28, 16 + this.storyTimer * 0.6);
        drawTextOutlined(ctx, 'GAME OVER', GAME.W / 2, titleY, '#ff5050', '#1a0000', 3, 'center');

        // Reveal stats only after the title settles (storyTimer > 40)
        if (this.storyTimer > 40) {
            // Framed stats panel
            const panelX = 40, panelY = 64, panelW = GAME.W - 80, panelH = 92;
            ctx.fillStyle = 'rgba(8, 4, 14, 0.85)';
            ctx.fillRect(panelX, panelY, panelW, panelH);
            ctx.fillStyle = '#5a1018';
            ctx.fillRect(panelX, panelY, panelW, 1);
            ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
            ctx.fillRect(panelX, panelY, 1, panelH);
            ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

            const min = Math.floor(this.totalTime / 3600);
            const sec = Math.floor((this.totalTime / 60) % 60);
            const stagesCleared = this.runStats?.stagesCleared?.size || 0;
            // Stat rows reveal one at a time for drama
            const rowReveal = Math.floor((this.storyTimer - 40) / 6);
            const rows = [
                { label: 'STAGE REACHED', value: this.currentStage || 1, color: '#fff' },
                { label: 'STAGES CLEARED', value: stagesCleared, color: '#80c0a0' },
                { label: 'KILLS',         value: this.player?.kills || 0, color: '#fff' },
                { label: 'MAX COMBO',     value: this.player?.maxCombo || 0, color: '#ffe070' },
                { label: 'TIME',          value: String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0'), color: '#fff' },
                { label: 'SCORE',         value: ('000000' + (this.player?.score || 0)).slice(-6), color: '#ffe070' },
            ];
            for (let i = 0; i < rows.length; i++) {
                if (i > rowReveal) break;
                const y = panelY + 8 + i * 14;
                drawText(ctx, rows[i].label, panelX + 12, y, '#a08090', 1, 'left');
                drawText(ctx, String(rows[i].value), panelX + panelW - 12, y, rows[i].color, 1, 'right');
            }
        }
        // Two-option menu reveal after panel settle
        if (this.storyTimer > 90) {
            const baseY = GAME.H - 32;
            this._goPulse = (this._goPulse || 0) + 1;
            for (let i = 0; i < GAME_OVER_OPTIONS.length; i++) {
                const y = baseY + i * 14;
                const isSel = i === (this.gameOverIndex || 0);
                if (isSel) {
                    const phase = Math.sin(this._goPulse * 0.18) * 0.5 + 0.5;
                    ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                    ctx.fillRect(80, y - 2, GAME.W - 160, 12);
                    drawText(ctx, '>', 86, y, '#ffe070', 1, 'left');
                    drawText(ctx, '<', GAME.W - 92, y, '#ffe070', 1, 'left');
                }
                drawText(ctx, GAME_OVER_OPTIONS[i], GAME.W / 2, y, isSel ? '#fff' : '#c0a0d0', 1, 'center');
            }
            // Countdown — last 10s feels urgent; flashes red under 5s
            if (this.gameOverCountdown != null && this.gameOverCountdown > 0) {
                const urgent = this.gameOverCountdown <= 5;
                const flash = urgent && (this.storyTimer % 30 < 15);
                const color = !urgent ? '#c0a0d0' : flash ? '#ff5050' : '#ffe070';
                drawText(ctx, String(this.gameOverCountdown), GAME.W / 2, GAME.H - 22, color, 2, 'center');
            }
        }
    }

    _tickGameComplete() {
        audio.playTrack('gameComplete');
        this.storyTimer++;
        if (this.storyTimer > 90 && (input.isPressed('shoot') || input.isPressed('jump'))) {
            this._restartRun();
        }
    }
    // Three endings keyed off the player's run: PERFECT (mastery), VENGEANCE (default),
    // MERCIFUL (low-kill / pacifist-leaning playthrough). Each gets unique tint + text.
    _endingPath() {
        const noDeath = this.totalDeaths === 0;
        const noDmgStages = this.runStats.noDamageStages || 0;
        const totalKills = this.player.kills || 0;
        // Perfect: 8 stages without dying + at least 5 no-damage clears
        if (noDeath && noDmgStages >= 5) return 'PERFECT';
        // Merciful: somehow finished with very low kill count (bosses only)
        // Bosses-only = roughly 8 kills; allow some grunt slippage
        if (totalKills < 20) return 'MERCIFUL';
        return 'VENGEANCE';
    }

    _drawGameComplete() {
        const ctx = this.ctx;
        // Guard: if _restartRun clears this.player but the scene is briefly
        // still gameComplete, skip rendering rather than throwing on
        // this.player.kills below. The next frame will switch to TITLE.
        if (!this.player) return;
        const path = this._endingPath();
        const palette = {
            PERFECT:   { title: 'PERFECT REVENGE',     subtitle: 'EVERY NAME. EVERY SHOT TRUE.', accent: '#ffe070', tint: 'rgba(255,224,112,0.18)' },
            VENGEANCE: { title: 'MISSION COMPLETE',    subtitle: 'THE LIST IS FINISHED.',         accent: '#ff5050', tint: 'rgba(120,0,0,0.42)' },
            MERCIFUL:  { title: 'NO MORE BLOOD',       subtitle: 'YOU SPARED WHAT YOU COULD.',   accent: '#7af0bf', tint: 'rgba(0,80,40,0.42)' },
        };
        const ep = palette[path];

        // Painted ending scene fills the screen
        if (sprites.has('ending')) {
            const img = sprites.images.get('ending');
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Path-specific tint + dim
        ctx.fillStyle = ep.tint;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        drawTextOutlined(ctx, ep.title, GAME.W / 2, 28, ep.accent, '#1a0a14', 2, 'center');
        drawText(ctx, ep.subtitle, GAME.W / 2, 58, '#c0a0d0', 1, 'center');

        const min = Math.floor(this.totalTime / 3600);
        const sec = Math.floor((this.totalTime / 60) % 60);
        // Stats backplate
        ctx.fillStyle = 'rgba(8, 4, 14, 0.78)';
        ctx.fillRect(40, 92, GAME.W - 80, 76);
        ctx.fillStyle = '#3a2a4a';
        ctx.fillRect(40, 92, GAME.W - 80, 1);
        ctx.fillRect(40, 167, GAME.W - 80, 1);
        drawText(ctx, 'TIME      ' + String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0'), 60, 102, '#fff', 1);
        drawText(ctx, 'SCORE     ' + this.player.score, 60, 114, '#ffe070', 1);
        drawText(ctx, 'KILLS     ' + this.player.kills, 60, 126, '#fff', 1);
        drawText(ctx, 'MAX COMBO ' + this.player.maxCombo, 60, 138, '#fff', 1);
        drawText(ctx, 'DEATHS    ' + this.totalDeaths, 60, 150, this.totalDeaths === 0 ? '#50ff70' : '#fff', 1);
        // Run rank — composite of deaths, no-damage clears, max combo, time vs
        // 12-min speedrun target. Cached so the letter is stable across frames.
        if (this._runRank == null) {
            const deaths = this.totalDeaths || 0;
            const noDmg = this.runStats.noDamageStages || 0;
            const mxCombo = this.player.maxCombo || 0;
            const target = 12 * 60 * 60; // 12 min in frames
            // Smoothed curve so a 3-death clear lands as a C, not a D.
            const deathScore = deaths === 0 ? 1 : deaths <= 2 ? 0.85 : deaths <= 5 ? 0.60 : 0.30;
            const noDmgScore = Math.min(1, noDmg / 2);          // 2+ clears = full
            const comboScore = Math.min(1, mxCombo / 15);       // 15-streak = full
            const timeScore = Math.max(0.1, Math.min(1, target / Math.max(target, this.totalTime)));
            const composite = deathScore * 0.4 + noDmgScore * 0.2 + comboScore * 0.2 + timeScore * 0.2;
            const letter = composite >= 0.92 ? 'S'
                         : composite >= 0.78 ? 'A'
                         : composite >= 0.62 ? 'B'
                         : composite >= 0.45 ? 'C' : 'D';
            this._runRank = { letter, composite };
        }
        // Big rank letter on the right edge of the stats panel, scale=3 outlined
        const rankCol = this._runRank.letter === 'S' ? '#ffe070'
                      : this._runRank.letter === 'A' ? '#a0ff70'
                      : this._runRank.letter === 'B' ? '#80c0ff'
                      : this._runRank.letter === 'C' ? '#c0a0d0' : '#806080';
        drawTextOutlined(ctx, this._runRank.letter, GAME.W - 58, 110, rankCol, '#0a0410', 3, 'center');
        drawText(ctx, 'RANK', GAME.W - 58, 144, '#c0a0d0', 1, 'center');
        // Path badge under stats
        drawTextOutlined(ctx, 'PATH: ' + path, GAME.W / 2, 184, ep.accent, '#0a0410', 1, 'center');
        if (this.storyTimer % 60 < 40) {
            drawText(ctx, 'X TO RETURN TO TITLE', GAME.W / 2, GAME.H - 14, '#fff', 1, 'center');
        }
    }

    _restartRun() {
        // Per-run state that must NOT carry over to the next run, otherwise
        // achievements (e.g. "BEAT GAME UNDER 12 MINUTES") get false-positives
        // and medal grants become sticky from prior runs.
        this.totalTime = 0;
        this.totalDeaths = 0;
        this.runStats = { stagesCleared: new Set(), noDamageStages: 0, maxCombo: 0, weaponDamage: {}, bulletTimeUses: 0, enemiesLost: 0, grenadeUses: 0, grenadeKills: 0 };
        this.stageStats = { kills: 0, deaths: 0, damageTaken: 0, secrets: 0, weaponDamage: {}, shotsFired: 0 };
        this._bossEntrance = null;
        this._bossIntro = null;
        this._clearScheduled = false;
        this._clearBursts = [];
        this.slowMoFrames = 0;
        this._bossKillBeatFired = false;
        this.bossSpawned = false;
        this.miniBossSpawned = false;
        this.boss = null;
        this.player = null;
        this._stageClearTallyDone = false;
        this._runRank = null;
        this.gameOverCountdown = null;
        this._pendingStage = null;
        this._goEmbers = null;
        this.scene = SCENE.TITLE;
    }

    _fadeTo(scene) {
        if (this.transition !== 0) return;
        this.transitionTarget = scene;
        this.transition = 30;
    }
}

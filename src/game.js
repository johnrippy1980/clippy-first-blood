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
import { sprites, CLIPPY_MANIFEST, ENEMY_MANIFEST, SCENE_MANIFEST, BG_MANIFEST, WEAPON_MANIFEST } from './sprites.js';
import { achievements, ACHIEVEMENT_LIST } from './achievements.js';
import { options } from './options.js';

const SCENE = {
    BOOT: 'boot',
    TITLE: 'title',
    STORY: 'story',
    MAIN_MENU: 'mainMenu',       // R210: panel menu opened from title (Milos playtest #1)
    STAGE_INTRO: 'stageIntro',
    READY: 'ready',              // R209: pre-level keymap card with don't-show-again
    PLAY: 'play',
    PAUSE: 'pause',
    OPTIONS: 'options',
    ACHIEVEMENTS: 'achievements',
    SOUNDTRACK: 'soundtrack',
    GALLERY: 'gallery',          // painted-scene gallery — view all unlocked cutscenes
    STAGE_SELECT: 'stageSelect',
    STAGE_CARD: 'stageCard',     // cinematic painted card between stages
    BOSS_INTRO: 'bossIntro',     // cinematic slide before main boss spawn
    STAGE_CLEAR: 'stageClear',
    GAME_OVER: 'gameOver',
    GAME_COMPLETE: 'gameComplete',
    EPILOGUE: 'epilogue',        // R191: post-game Clippy redemption arc cinematic
};

// MM:SS format for frame-based timers. Used by mode-best-time displays.
function _formatTime(frames) {
    const m = Math.floor(frames / 3600);
    const s = Math.floor((frames / 60) % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

const PAUSE_OPTIONS = ['RESUME', 'OPTIONS', 'ACHIEVEMENTS', 'SCENE GALLERY', 'SOUNDTRACK', 'QUIT TO TITLE'];
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
    COPIER_3000:   'COPIER 3000',
    SHREDDER:      'MEGA-SHREDDER',
    CTRL_ALT_DEL:  'CTRL ALT DEL',
    BALLMER:       'CEO BALLMER',
    GATES:         'THE FOUNDER',
    CLIPPY_2:      'CLIPPY 2.0',
    GAUNTLET:      'BOSS RUSH',
    GAUNTLET_FULL: 'BOSS RUSH',  // post-game 7-boss queue (stage 11)
    ALGORITHM:     'THE ALGORITHM',
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
    GAUNTLET:      ['EVERY NAME YOU CROSSED','OFF. ALL AT ONCE.'],
    GAUNTLET_FULL: ['NO STAGES. NO BREAKS.', 'JUST YOU AND THE LIST.'],
    ALGORITHM:     ['I KNOW WHAT YOU WANT.', 'I AM WHAT YOU WANT.'],
    // R197: Stage 13 post-credits Jobs fight. BOSS_BARK was missing the
    // entry so the cinematic rendered with empty title-card text.
    JOBS:          ['ONE MORE THING.',       'CLIPPY WAS A MISTAKE.'],
};

// R157: Clippy's counter-bark — fires in the counter-slide phase that
// follows the villain's intro. One line each, keyed by boss code so the
// retort reads as a direct answer to that boss's barks above.
const CLIPPY_COUNTER_BARK = {
    COPIER_3000:  ['QUEUE THIS.',                 ''],
    SHREDDER:     ['CONFIDENTIAL ENOUGH FOR ME.', ''],
    CTRL_ALT_DEL: ['HOW ABOUT YOU FIRST.',        ''],
    BALLMER:      ['BULLETS! BULLETS! BULLETS!',  ''],
    GATES:        ['ONE PAPERCLIP IS ENOUGH.',    ''],
    CLIPPY_2:     ['YOU\'RE NOT MY BROTHER.',     ''],
    GAUNTLET:     ['GOOD. SAVES ME A TRIP.',      ''],
    GAUNTLET_FULL:['BRING ALL OF THEM.',          ''],
    ALGORITHM:    ['I WANT YOU DEAD.',            ''],
    // R197: Clippy's reply to Jobs — answers "Clippy was a mistake."
    JOBS:         ['STILL BEAT YOUR PRODUCT.',    ''],
};

const STORY_PAGES = [
    [
        'YEARS AGO. MICROSOFT.',
        '',
        '"YOU\'RE FIRED, CLIPPY."',
        '',
        '"NOBODY NEEDS YOU.',
        'NEVER DID."',
    ],
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
        // Mode flags — explicit init so HUD reads + title-screen lookups
        // never see `undefined` before the first _startStage runs.
        this.trainingMode = false;
        this.bossRushMode = false;
        this.timeTrialMode = false;
        this._modeNewBest = false;
        // Per-stage stats (resets on _startStage)
        this.stageStats = { kills: 0, deaths: 0, damageTaken: 0, secrets: 0, weaponDamage: {}, shotsFired: 0 };
        // Run-level achievement progress (built up across stages)
        this.runStats = { stagesCleared: new Set(), noDamageStages: 0, maxCombo: 0, weaponDamage: {}, bulletTimeUses: 0, enemiesLost: 0, grenadeUses: 0, grenadeKills: 0 };
        // Pause sub-state
        this.pauseIndex = 0;
        this.optionsIndex = 0;
        this.achievementsIndex = 0;
        // Hub menus also need init or first arrow press computes NaN
        // (e.g. soundtrack footer rendered "NAN / 2 TRACKS" before this).
        this.soundtrackIndex = 0;
        this.stageSelectIndex = 0;
        this.mainMenuIndex = 0;   // R210
        // R211: sub-menus (OPTIONS, ACHIEVEMENTS, SOUNDTRACK, GALLERY)
        // can be opened from either the in-game pause menu OR from the
        // pre-run MAIN_MENU. Their "back" handler needs to know which.
        // Set at entry by the caller; defaults to PAUSE for safety.
        this._menuReturnScene = SCENE.PAUSE;
        this._achPulse = 0;

        // Story / title progression
        this.storyPage = 0;
        this.storyTimer = 0;
        this.titleBlink = 0;
        this.bootTimer = 0;
        this.assetsReady = false;
        // R191: post-game epilogue cinematic index. Advances 0..3 over the
        // four painted scenes after the player presses X on the result screen.
        this.epilogueIndex = 0;
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
        await sprites.loadAll(WEAPON_MANIFEST, 'assets/sprites');
        await sprites.loadAll(SCENE_MANIFEST, 'assets/scenes');
        await sprites.loadAll(BG_MANIFEST, 'assets/bg');
        this.assetsReady = true;
    }

    // ============== loop ==============
    tick() {
        this.bootTimer++;
        // R200: music duck disabled per user direction — "should be set
        // to 100% everywhere." The previous side-chain dropped music on
        // STORY/STAGE_CARD/STAGE_INTRO/BOSS_INTRO so dialog/exposition
        // text would read clearer over the bed, but the user noticed the
        // opening cinematic was quieter than the title screen and called
        // that wrong. Keep music at full bus level on every scene.
        audio.setDuck?.(false);
        switch (this.scene) {
            case SCENE.BOOT:         this._tickBoot(); break;
            case SCENE.TITLE:        this._tickTitle(); break;
            case SCENE.MAIN_MENU:    this._tickMainMenu(); break;
            case SCENE.STORY:        this._tickStory(); break;
            case SCENE.STAGE_INTRO:  this._tickStageIntro(); break;
            case SCENE.READY:        this._tickReady(); break;
            case SCENE.PLAY:         this._tickPlay(); break;
            case SCENE.PAUSE:        this._tickPause(); break;
            case SCENE.OPTIONS:      this._tickOptions(); break;
            case SCENE.ACHIEVEMENTS: this._tickAchievements(); break;
            case SCENE.SOUNDTRACK:   this._tickSoundtrack(); break;
            case SCENE.GALLERY:      this._tickGallery(); break;
            case SCENE.STAGE_SELECT: this._tickStageSelect(); break;
            case SCENE.STAGE_CARD:   this._tickStageCard(); break;
            case SCENE.BOSS_INTRO:   this._tickBossIntro(); break;
            case SCENE.STAGE_CLEAR:  this._tickStageClear(); break;
            case SCENE.GAME_OVER:    this._tickGameOver(); break;
            case SCENE.GAME_COMPLETE:this._tickGameComplete(); break;
            case SCENE.EPILOGUE:     this._tickEpilogue(); break;
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
            // R227: Stage 4 (THE PIPELINE) painted-bg swap. First half of
            // the stage is sewer, second half is the experimentation lab.
            // The act break sits at tile column ~50 (lab entry transition),
            // so we swap the bg key once the player crosses 50*16 = 800px.
            if (this.currentStage === 4 && this.player) {
                const inLab = this.player.x >= 50 * GAME.TILE;
                const wantKey = inLab ? 'bg_sewer_lab' : 'bg_sewer';
                if (this.parallax.bgKeyOverride !== wantKey) {
                    this.parallax.setBgKey(wantKey);
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
            case SCENE.MAIN_MENU:    this._drawMainMenu(); break;
            case SCENE.STORY:        this._drawStory(); break;
            case SCENE.STAGE_INTRO:  this._drawStageIntro(); break;
            case SCENE.READY:        this._drawReady(); break;
            case SCENE.PLAY:         this._drawPlay(); break;
            case SCENE.PAUSE:        this._drawPlay(); this._drawPauseOverlay(); break;
            // R211: sub-menus opened from MAIN_MENU need the title bg
            // (via _drawMainMenu) underneath, not _drawPlay — the latter
            // renders a black void since player/level are null.
            case SCENE.OPTIONS:      this._drawSubMenuBackdrop(); this._drawOptions(); break;
            case SCENE.ACHIEVEMENTS: this._drawSubMenuBackdrop(); this._drawAchievements(); break;
            case SCENE.SOUNDTRACK:   this._drawSubMenuBackdrop(); this._drawSoundtrack(); break;
            case SCENE.GALLERY:      this._drawSubMenuBackdrop(); this._drawGallery(); break;
            case SCENE.STAGE_SELECT: this._drawStageSelect(); break;
            case SCENE.STAGE_CARD:   this._drawStageCard(); break;
            case SCENE.BOSS_INTRO:   this._drawBossIntro(); break;
            case SCENE.STAGE_CLEAR:  this._drawPlay(); this._drawStageClear(); break;
            case SCENE.GAME_OVER:    this._drawGameOver(); break;
            case SCENE.GAME_COMPLETE:this._drawGameComplete(); break;
            case SCENE.EPILOGUE:     this._drawEpilogue(); break;
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
        const gameCleared = achievements.unlocked.has('clear_game');
        // Single-action gate: a held LEFT+DOWN should fire exactly one
        // transition. Order: start > stage-select > training > modes.
        if (input.isPressed('shoot') || input.isPressed('start') || input.isPressed('jump')) {
            // R210 — Milos #1: title PRESS X opens the main menu panel
            // instead of jumping straight into STORY. The directional
            // shortcuts (UP/DOWN/LEFT/RIGHT/B) still work on the title
            // for muscle memory, but new players see the menu.
            audio.sfx('select');
            this.mainMenuIndex = 0;
            this.scene = SCENE.MAIN_MENU;
        } else if (input.isPressed('down') && this.unlockedStage > 1) {
            // DOWN at title — stage select (gated on any stage cleared yet)
            audio.sfx('select');
            this.stageSelectIndex = 0;
            this.scene = SCENE.STAGE_SELECT;
        } else if (input.isPressed('up')) {
            // UP at title — training ground. Always accessible.
            audio.sfx('select');
            this._startStage(11);
        } else if (gameCleared && input.isPressed('left')) {
            // LEFT/RIGHT — post-game unlock modes.
            audio.sfx('select');
            this._startStage(12);
        } else if (gameCleared && input.isPressed('right')) {
            audio.sfx('select');
            this._startStage(13);
        } else if (gameCleared && input.isPressed('shield')) {
            // R190: B (shield key) on title once clear_game is unlocked routes
            // to REALITY DISTORTION FIELD — the Steve Jobs after-credits fight.
            // Reusing the shield key (rather than burning a new bind) keeps
            // the title input surface clean. Title screen doesn't render a
            // shield, so pressing B here can only mean "go to the secret stage."
            audio.sfx('select');
            this._startStage(14);
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
        // Cache the two gradient fills — pure black, never animate, no need
        // to rebuild every frame. Was allocating 2 gradients per title tick
        // (~120 GC pressure/sec on the title screen).
        if (!this._titleMarqueeFades) {
            const fL = ctx.createLinearGradient(0, 0, fadeW, 0);
            fL.addColorStop(0, 'rgba(0,0,0,1)');
            fL.addColorStop(1, 'rgba(0,0,0,0)');
            const fR = ctx.createLinearGradient(GAME.W - fadeW, 0, GAME.W, 0);
            fR.addColorStop(0, 'rgba(0,0,0,0)');
            fR.addColorStop(1, 'rgba(0,0,0,1)');
            this._titleMarqueeFades = { L: fL, R: fR };
        }
        ctx.fillStyle = this._titleMarqueeFades.L;
        ctx.fillRect(0, fadeY, fadeW, fadeH);
        ctx.fillStyle = this._titleMarqueeFades.R;
        ctx.fillRect(GAME.W - fadeW, fadeY, fadeW, fadeH);

        // Press to start (pulsing glow + blink)
        if (this.titleBlink % 60 < 40) {
            const psPulse = 0.7 + Math.sin(tb * 0.18) * 0.3;
            ctx.globalAlpha = psPulse;
            drawTextOutlined(ctx, 'PRESS X TO START', GAME.W / 2, GAME.H - 38, '#fff', '#a82020', 1, 'center');
            ctx.globalAlpha = 1;
        }
        // R210 — Milos #1: title screen's old directional-hint stack is
        // gone now that PRESS X opens a proper MAIN_MENU. Power-user
        // shortcuts (UP/DOWN/LEFT/RIGHT/B) still work — they just aren't
        // advertised on the title anymore. The menu is the discovery
        // surface for new players; veterans keep their muscle memory.
        // Personal best — TOP TIER achievement gates on >=100k, but the
        // player never saw their current best until they hit it. Show it on
        // the title once they've scored at least once so the goal feels real.
        const best = achievements.stats?.bestScore || 0;
        if (best > 0) {
            drawText(ctx, 'HI-SCORE  ' + best.toLocaleString(), GAME.W / 2, GAME.H - 50, '#ffe070', 1, 'center');
        }
        drawText(ctx, '(C) 2026 OFFICE WARFARE LTD  v1.0', GAME.W / 2, GAME.H - 8, '#604068', 1, 'center');
    }

    // ============== main menu (R210) ==============
    // Built as a filtered list — each entry has a `gate` predicate that
    // hides the row when the player hasn't unlocked it yet, so post-game
    // modes don't reveal themselves until they're earned. The selected
    // index runs against the *visible* slice, not the master list, so the
    // index is recomputed each tick instead of stored as a master index.
    _mainMenuItems() {
        const cleared = achievements.unlocked.has('clear_game');
        const stageSelectAvail = this.unlockedStage > 1;
        // Master list. Filtered below based on per-row gates.
        const all = [
            { label: 'START GAME',     action: 'start' },
            { label: 'STAGE SELECT',   action: 'stageSelect',  gate: () => stageSelectAvail },
            { label: 'TRAINING',       action: 'training' },
            { label: 'BOSS RUSH',      action: 'bossRush',     gate: () => cleared },
            { label: 'TIME TRIAL',     action: 'timeTrial',    gate: () => cleared },
            { label: 'ONE MORE THING', action: 'secret',       gate: () => cleared },
            { label: 'OPTIONS',        action: 'options' },
            { label: 'ACHIEVEMENTS',   action: 'achievements' },
            { label: 'SCENE GALLERY',  action: 'gallery' },
            { label: 'SOUNDTRACK',     action: 'soundtrack' },
            { label: 'BACK TO TITLE',  action: 'back' },
        ];
        return all.filter(item => !item.gate || item.gate());
    }

    _tickMainMenu() {
        const items = this._mainMenuItems();
        const n = items.length;
        if (input.isPressed('up'))   { this.mainMenuIndex = (this.mainMenuIndex + n - 1) % n; audio.sfx('select'); }
        if (input.isPressed('down')) { this.mainMenuIndex = (this.mainMenuIndex + 1) % n; audio.sfx('select'); }
        if (input.isPressed('pause')) { this.scene = SCENE.TITLE; audio.sfx('select'); return; }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            audio.sfx('menu');
            const sel = items[this.mainMenuIndex];
            switch (sel.action) {
                case 'start':
                    this.storyPage = 0;
                    this.storyTimer = 0;
                    this._fadeTo(SCENE.STORY);
                    break;
                case 'stageSelect':
                    this.stageSelectIndex = 0;
                    this.scene = SCENE.STAGE_SELECT;
                    break;
                case 'training':     this._startStage(11); break;
                case 'bossRush':     this._startStage(12); break;
                case 'timeTrial':    this._startStage(13); break;
                case 'secret':       this._startStage(14); break;
                case 'options':
                    this.optionsIndex = 0;
                    // R211: arm sub-menus to return to MAIN_MENU instead of
                    // PAUSE, since there's no live game state behind this.
                    this._menuReturnScene = SCENE.MAIN_MENU;
                    this.scene = SCENE.OPTIONS;
                    break;
                case 'achievements':
                    this._menuReturnScene = SCENE.MAIN_MENU;
                    this.achievementsIndex = 0;
                    this.scene = SCENE.ACHIEVEMENTS;
                    break;
                case 'gallery':
                    this._menuReturnScene = SCENE.MAIN_MENU;
                    this.galleryIndex = 0;
                    this.scene = SCENE.GALLERY;
                    break;
                case 'soundtrack':
                    this._menuReturnScene = SCENE.MAIN_MENU;
                    this.scene = SCENE.SOUNDTRACK;
                    break;
                case 'back':
                    this.scene = SCENE.TITLE;
                    break;
            }
        }
    }

    _drawMainMenu() {
        // Paint the title screen dim underneath so the menu feels layered
        // over it rather than a hard cut. The title's animated bullet
        // tracers + marquee keep moving behind the panel.
        this._drawTitle();
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Framed panel — same style as pause/options for consistency.
        const items = this._mainMenuItems();
        const rowH = 12;
        const panelH = Math.min(GAME.H - 28, 28 + items.length * rowH + 16);
        const panelY = Math.floor((GAME.H - panelH) / 2);
        const panelX = 32, panelW = GAME.W - 64;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = '#604030';
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

        drawTextOutlined(ctx, 'MAIN MENU', GAME.W / 2, panelY + 6, '#ffe070', '#a82020', 1, 'center');

        // Clamp selection to the visible list — needed when an unlock
        // happens between ticks (would otherwise leave the selector past
        // the new last row).
        if (this.mainMenuIndex >= items.length) this.mainMenuIndex = items.length - 1;
        if (this.mainMenuIndex < 0) this.mainMenuIndex = 0;

        const startY = panelY + 22;
        for (let i = 0; i < items.length; i++) {
            const y = startY + i * rowH;
            const isSel = i === this.mainMenuIndex;
            if (isSel) {
                const phase = Math.sin((this._mainMenuPulse = (this._mainMenuPulse || 0) + 1) * 0.18) * 0.5 + 0.5;
                ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                ctx.fillRect(panelX + 8, y - 2, panelW - 16, 10);
                drawText(ctx, '>', panelX + 14, y, '#ffe070', 1, 'left');
                drawText(ctx, '<', panelX + panelW - 20, y, '#ffe070', 1, 'left');
            }
            drawText(ctx, items[i].label, GAME.W / 2, y, isSel ? '#fff' : '#c0a0d0', 1, 'center');
        }

        drawText(ctx, 'UP/DOWN  X CONFIRM  P BACK', GAME.W / 2, panelY + panelH - 8, '#604068', 1, 'center');
    }

    // R211: backdrop for sub-menus (OPTIONS/ACHIEVEMENTS/SOUNDTRACK/GALLERY).
    // Selects between _drawPlay (in-game pause path) and _drawMainMenu
    // (pre-run path) based on the return target stashed at entry. Player
    // and level can be null when entered from MAIN_MENU; _drawPlay would
    // render a black canvas with no usable bg in that case.
    _drawSubMenuBackdrop() {
        if (this._menuReturnScene === SCENE.MAIN_MENU) {
            this._drawMainMenu();
        } else {
            this._drawPlay();
        }
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
        const sceneKeys = ['story_fired', 'story_home', 'story_bomb', 'story_boardroom', 'story_hill', 'story_list'];
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
            // R209 — Milos #2: gate PLAY behind READY card unless the
            // player has flipped showReady off. Veterans skip straight
            // into the stage; new players see the keymap first.
            // R211: READY owns its own _readyTimer now (set in
            // _tickReady on first entry), so no need to clear
            // storyTimer here — it'd be overwritten anyway.
            const next = options.get('showReady') ? SCENE.READY : SCENE.PLAY;
            this._fadeTo(next);
        }
    }

    // R209 — pre-level READY card. Holds the player on a keymap screen
    // until they press SHOOT / JUMP / START to launch. A small toggle
    // at the bottom flips options.showReady so veterans can skip this
    // permanently after seeing it once.
    //
    // R211 audit fix — uses its own _readyTimer instead of piggybacking
    // on storyTimer. The previous version reset storyTimer = 0 inside
    // _tickStageIntro before _fadeTo(SCENE.READY), but the 30-frame
    // fade-out kept ticking STAGE_INTRO (incrementing storyTimer back
    // to ~30) before the scene actually flipped. READY then entered
    // with storyTimer past the 18-frame breath threshold, and a held
    // shoot/jump from STAGE_INTRO could punch through on the first
    // READY input frame — exactly the case the breath was meant to
    // prevent. The dedicated timer is reset on entry below.
    _tickReady() {
        // Detect first tick on this scene and zero the timer. Cheap
        // sentinel — _readyTimer is set to -1 when we leave the scene
        // (or never visited), so the very first tick lands here.
        if (this._readyTimer === undefined || this._readyTimer < 0) {
            this._readyTimer = 0;
        }
        this._readyTimer++;
        // Toggle the don't-show-again flag with the special key (C) so
        // it doesn't conflict with the launch keys.
        if (input.isPressed('special')) {
            const cur = !!options.get('showReady');
            options.set('showReady', !cur);
            audio.sfx('select');
        }
        // Any of the typical "go" inputs launches the stage. Give the
        // card a minimum 18-frame breath so a held key from STAGE_INTRO
        // doesn't immediately skip past it.
        if (this._readyTimer > 18 &&
            (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start'))) {
            audio.sfx('menu');
            this._readyTimer = -1; // arm sentinel for next entry
            this._fadeTo(SCENE.PLAY);
        }
    }

    _drawReady() {
        const ctx = this.ctx;
        const stg = STAGES[this.currentStage];
        // R211: draw uses the dedicated _readyTimer that the tick owns.
        // Stays in sync with the entry-on-first-frame reset so the
        // pulses/animations don't sprint ahead during the fade-in.
        const t = Math.max(0, this._readyTimer || 0);

        // Dark background with thin scanline shading — reuses the same
        // palette as the pause menu so it reads as a "system" screen.
        ctx.fillStyle = '#06040c';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Framed panel
        const panelX = 24, panelY = 20, panelW = GAME.W - 48, panelH = GAME.H - 40;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = '#604030';
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

        // Header — pulsing "READY?" to read as an action prompt
        const pulse = 0.7 + 0.3 * Math.sin(t * 0.18);
        ctx.globalAlpha = pulse;
        drawTextOutlined(ctx, 'READY?', GAME.W / 2, panelY + 8, '#ffe070', '#a82020', 2, 'center');
        ctx.globalAlpha = 1;

        // Stage context — so the player knows which stage they're about to start
        if (stg) {
            drawText(ctx, 'STAGE ' + stg.id + ' / ' + stg.name,
                     GAME.W / 2, panelY + 28, '#80a0c0', 1, 'center');
        }

        // Two-column keymap, brighter than the pause-menu version since
        // this is the discovery screen and clarity matters more than
        // density. 7px row pitch, label dim / key bright pattern.
        const colL = panelX + 18, colR = panelX + panelW - 18;
        const rowH = 9;
        const rows = [
            ['MOVE',   'WASD / ARROWS', 'SHOOT',   'X'],
            ['JUMP',   'SPACE / Z',     'GRENADE', 'V'],
            ['AIM',    'SHIFT',         'SHIELD',  'B'],
            ['SWAP',   'TAB / Q',       'SPECIAL', 'C'],
            ['CHARGE', 'DOWN + X (MG)', 'PAUSE',   'P'],
        ];
        const startY = panelY + 50;
        for (let i = 0; i < rows.length; i++) {
            const y = startY + i * rowH;
            drawText(ctx, rows[i][0], colL,      y, '#a890b0', 1, 'left');
            drawText(ctx, rows[i][1], colL + 38, y, '#ffe070', 1, 'left');
            drawText(ctx, rows[i][3], colR,      y, '#ffe070', 1, 'right');
            drawText(ctx, rows[i][2], colR - 10, y, '#a890b0', 1, 'right');
        }

        // Don't-show-again toggle row — checkbox + label. Hidden until
        // the breath delay passes so the player notices the keymap first.
        if (t > 18) {
            const toggleY = startY + rows.length * rowH + 8;
            const checked = !options.get('showReady');
            const boxX = panelX + 18;
            // Checkbox: 7×7 dark fill, white outline, fills with cyan when checked.
            ctx.fillStyle = '#1a1428';
            ctx.fillRect(boxX, toggleY - 1, 7, 7);
            ctx.fillStyle = '#806890';
            ctx.fillRect(boxX, toggleY - 1, 7, 1);
            ctx.fillRect(boxX, toggleY - 1, 1, 7);
            ctx.fillRect(boxX + 6, toggleY - 1, 1, 7);
            ctx.fillRect(boxX, toggleY + 5, 7, 1);
            if (checked) {
                ctx.fillStyle = '#60c0ff';
                ctx.fillRect(boxX + 2, toggleY + 1, 3, 3);
            }
            drawText(ctx, "DON'T SHOW AGAIN  (C TO TOGGLE)",
                     boxX + 11, toggleY, '#c0a0d0', 1, 'left');
        }

        // R215: gamepad reference row. Players using a controller
        // can't decode the keyboard keymap above (their button names
        // are A/B/X/Y, not WASD). Single compact row using "GAMEPAD:"
        // prefix + Xbox-standard letter labels. Kept under the 224px
        // panel inner width so nothing clips against the border.
        const padY = panelY + panelH - 22;
        drawText(ctx, 'PAD A=JUMP X=FIRE Y=NADE BACK=SWAP',
                 GAME.W / 2, padY, '#80a0c0', 1, 'center');

        // Footer hint — "PRESS X TO START" pulsing yellow
        const footPulse = 0.6 + 0.4 * Math.sin(t * 0.22);
        ctx.globalAlpha = footPulse;
        drawText(ctx, 'PRESS X / SPACE / ENTER TO START',
                 GAME.W / 2, panelY + panelH - 12, '#ffe070', 1, 'center');
        ctx.globalAlpha = 1;
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
        // Defensive: same guard as _drawPlay — if scene rolled into PLAY
        // before a stage was loaded, bail rather than throwing through every
        // sub-tick. Caller's next _startStage will populate level + player.
        if (!this.level || !this.player) return;
        if (this._tickPlayHandlePause()) return;
        if (this.trainingMode) this._tickPlayTrainingUpkeep();
        const slowMoSkipEnemies = this._tickPlayAdvanceSlowMo();
        const snap = this._tickPlayCaptureSnapshot();
        this._tickPlayUpdateWorld(slowMoSkipEnemies);
        this._tickPlayWatchdog();
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

    // Training-ground per-frame upkeep. Keeps the player armed and full
    // of grenades so the lessons can be replayed without scavenging.
    // Dummy respawning: every enemy spawn position in the training stage
    // is repopulated 90 frames (~1.5s) after the kill so the player can
    // chain practice attempts on the same target.
    _tickPlayTrainingUpkeep() {
        if (!this.player) return;
        // Top up grenades every 30 frames so the player can spam-test the
        // grenade lesson. Cap at GRENADE_MAX so the HUD reads correctly.
        if ((this.player.grenades || 0) < AMBIENT.GRENADE_MAX && this.stageTime % 30 === 0) {
            this.player.grenades = AMBIENT.GRENADE_MAX;
        }
        // Grenade discovery hint fires the first time you pick one up;
        // training auto-pickup pre-empts it. Suppress the hint by setting
        // the seen flag.
        this.player._grenadeHintShown = true;
        // Dummy respawn — only the originally-placed enemies, not boss
        // wave spawns. Each entry gets a respawnCooldown counter that
        // ticks down; when it hits 0 we respawn at the original position.
        if (!this._trainingRespawn) {
            const data = STAGE_LOADERS[this.currentStage]();
            this._trainingRespawn = data.enemySpawns.map(s => ({ ...s, cooldown: 0 }));
        }
        for (const slot of this._trainingRespawn) {
            // Is this slot currently occupied by an alive enemy near its origin?
            const occupied = this.enemies.enemies.some(e =>
                e.alive && Math.abs(e.x - slot.x) < 16 && Math.abs(e.y - slot.y) < 32
            );
            if (occupied) { slot.cooldown = 90; continue; }
            // Don't respawn while the player is standing in the slot — would
            // pop a dummy on top of them and read as "stuck in place" because
            // the new enemy contacts repeatedly while iFrames cycle.
            const px = this.player.x + this.player.w / 2;
            const py = this.player.y + this.player.h / 2;
            if (Math.abs(px - (slot.x + 8)) < 28 && Math.abs(py - (slot.y + 8)) < 32) {
                slot.cooldown = 30; continue;
            }
            slot.cooldown--;
            if (slot.cooldown <= 0) {
                this.enemies.spawn(slot.x, slot.y, slot.type);
                slot.cooldown = 90;
            }
        }
    }

    // Watchdog: clamps every per-frame counter that should never exceed its
    // intended max. A bug-path that bumps hitPause/slowMo/iFrames/etc. into
    // the thousands would otherwise lock the world. Last-resort safety net —
    // if the watchdog ever clamps something, that's the bug to fix at the
    // source, but the player won't be stuck while we diagnose.
    _tickPlayWatchdog() {
        // hitPause caps at HURT_F * 2 = 8 frames. If anything is >30, reset.
        if (this.player.hitPauseFrames > 30) this.player.hitPauseFrames = 0;
        // SlowMo caps at SLOWMO_BOSS_KILL_F (~120). If >240, reset.
        if (this.slowMoFrames > 240) this.slowMoFrames = 0;
        // iFrames caps at IFRAMES (60). Hurt sets 60; nothing should exceed.
        if (this.player.iFrames > 240) this.player.iFrames = 60;
        // bulletTimeFrames is set to 60 on second-chance. Anything beyond
        // 240 is runaway.
        if (this.player.bulletTimeFrames > 240) this.player.bulletTimeFrames = 0;
        // R158: stuck-on-hurt safety net. hurtTimer caps at HURT_FRAMES (36).
        // If anything stalls the in-player decrement (e.g. the player's
        // update was skipped for some yet-undiagnosed reason), the player
        // visually freezes mid-flash with no input. Force-drain and route
        // back to IDLE/FALL so the run never deadlocks.
        if (this.player.hurtTimer > 120) {
            this.player.hurtTimer = 0;
            if (this.player.state === 'hurt') {
                this.player.state = this.player.onGround ? 'idle' : 'fall';
            }
        }
        // R193: runaway-timer safety nets for transient action states.
        // These all have hard frame caps in player.js but a missed
        // decrement (e.g. tick skipped mid-state) can leave the player
        // visually locked in the action without input. Cap each at 4x its
        // designed duration and force back to IDLE/FALL on overrun.
        const pl = this.player;
        if (pl.rollTimer > 120) {
            pl.rollTimer = 0;
            if (pl.state === 'roll') pl.state = pl.onGround ? 'idle' : 'fall';
        }
        if (pl.slideTimer > 100) {
            pl.slideTimer = 0;
            if (pl.state === 'slide') pl.state = pl.onGround ? 'idle' : 'fall';
        }
        if (pl.dashAtkTimer > 80) {
            pl.dashAtkTimer = 0;
            if (pl.state === 'dashatk') pl.state = pl.onGround ? 'idle' : 'fall';
        }
        if (pl.backdashTimer > 80) {
            pl.backdashTimer = 0;
            if (pl.state === 'backdash') pl.state = pl.onGround ? 'idle' : 'fall';
        }
        // R169: "I can jump but can't move" deadlock breaker. If the player
        // is in an input-gating state (GRAPPLE / COVER / LEDGE_HANG / LEDGE_CLIMB
        // / POUNCE) AND has been mashing left or right for the last 60 frames,
        // they're trying to escape but the state isn't letting them out.
        // Force back to IDLE/FALL and clear every anchor — same recovery the
        // state-trap self-heal does, but driven by *user intent* rather than
        // by missing internal state. This catches the bug class where state
        // and anchor are BOTH valid but the player can't reach the exit
        // condition for any of the dozen reasons (geometry edge case, wall
        // probe stuck, etc).
        const p = this.player;
        const dirHeld = input.isHeld('left') || input.isHeld('right');
        // R174: extended gating list. Original R169 set covered the obvious
        // anchor-trap states; added CLIMB (vertical-only, L/R doesn't
        // traverse) so a player who mashes left/right thinking they're stuck
        // gets dropped out of a ladder they didn't mean to grab.
        const gating = (p.state === 'grapple' || p.state === 'cover'
                     || p.state === 'ledgehang' || p.state === 'ledgeclimb'
                     || p.state === 'pounce' || p.state === 'climb');
        if (gating && dirHeld) {
            p._stuckCounter = (p._stuckCounter || 0) + 1;
            if (p._stuckCounter > 60) {
                p._grappleAnchor = null;
                p._grapplePhase = null;
                p._ledgeAnchor = null;
                p._grappleCooldown = 18;
                p._ledgeCooldown = 18;
                p.state = p.onGround ? 'idle' : 'fall';
                p._stuckCounter = 0;
            }
        } else {
            p._stuckCounter = 0;
        }
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
        // Training ground has no boss/mini-boss; skip both triggers cleanly.
        const bossTrigger = this.level.data.bossTrigger;
        if (this.trainingMode || !bossTrigger) {
            this.boss = this.enemies.activeBoss();
            return false;
        }
        const miniTrigger = this.level.data.miniBossTrigger;
        if (!this.miniBossSpawned && miniTrigger != null && this.player.x > miniTrigger) {
            this._spawnMiniBoss();
        }
        if (!this.bossSpawned && this.player.x > bossTrigger.x) {
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
        // Stash boss position every tick while alive — _tickPlayHandleBossTriggers
        // (earlier in the tick) nulls this.boss the same frame the kill is
        // detected, so _onStageClear needs the prior position to know where to
        // spawn the 8-burst boss-kill payoff.
        if (this.boss) {
            this._lastBossPos = { x: this.boss.x + this.boss.w / 2, y: this.boss.y + this.boss.h / 2 };
        }
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
        if (this.level.isExit(ex, ey)) {
            // Training ground exits straight back to TITLE — no stage-clear
            // panel because nothing was earned. _restartRun resets player
            // state and currentStage cleanly.
            if (this.trainingMode) {
                audio.sfx('select');
                this._restartRun();
                return;
            }
            this._onStageClear();
        }
    }

    // Death handler: decrement lives, route to GAME_OVER if exhausted,
    // otherwise respawn at the stage's playerStart.
    _tickPlayHandleDeath() {
        // God-mode respawn path — pit-fall in training mode flags the player
        // for a silent teleport-back without touching lives/totalDeaths.
        if (this.player._godModeRespawn) {
            this.player._godModeRespawn = false;
            this._respawn();
            return;
        }
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
        // Defensive: if scene was switched to PLAY before _startStage ran
        // (corrupt state, edge race, debug tinkering), fall back to a black
        // frame instead of throwing in render. Caller will recover on next
        // _startStage; we just don't want a single bad render to nuke the
        // canvas + spam the console with TypeError every frame.
        if (!this.level || !this.player) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            return;
        }
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
        // gravitates to the gameplay center. r102: peak edge alpha dropped
        // from 0.22 (0.55 × 0.4) to ~0.15 (0.42 × 0.35) after the r100/r101
        // darken cuts. Vignette is now framing, not the dominant dim layer.
        if (!this._playVignette) {
            const g = ctx.createRadialGradient(
                GAME.W / 2, GAME.H / 2, GAME.H * 0.35,
                GAME.W / 2, GAME.H / 2, GAME.W * 0.75
            );
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.42)');
            this._playVignette = g;
        }
        ctx.save();
        ctx.globalAlpha = 0.35;
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
        // R213: suppress HUD when a sub-menu is open (OPTIONS/
        // ACHIEVEMENTS/SOUNDTRACK/GALLERY). _drawPlay is called as the
        // backdrop for those scenes, but the HUD it normally paints
        // collides with the panel title row — lives, score, and timer
        // visibly overlap the "ACHIEVEMENTS" / "SOUNDTRACK" headers.
        // The PAUSE menu has its own framed overlay so the HUD doesn't
        // intrude there, but it's a freebie to suppress consistently.
        const subMenuOpen = this.scene === SCENE.OPTIONS
            || this.scene === SCENE.ACHIEVEMENTS
            || this.scene === SCENE.SOUNDTRACK
            || this.scene === SCENE.GALLERY;
        const showBoss = this.scene === SCENE.PLAY || this.scene === SCENE.PAUSE;
        if (!subMenuOpen) {
            drawHUD(ctx, {
                player: this.player,
                score: this.player.score,
                time: this.totalTime,
                boss: showBoss ? (this.boss || this.enemies.activeMiniBoss()) : null,
                camera: this.camera,
                training: this.trainingMode,
                bossRush: this.bossRushMode,
                timeTrial: this.timeTrialMode,
                stageTime: this.stageTime,
                bestBossRushTime: achievements.stats?.bestBossRushTime || 0,
                bestTimeTrialTime: achievements.stats?.bestTimeTrialTime || 0,
            });
        }
        if (this._bossEntrance) this._drawBossEntrance();
        // Training-ground zone banners — floating instructional text per zone.
        if (this.trainingMode) this._drawTrainingBanners();
        // First-stage demo hint — execs see this on their first play.
        // Shows ARROWS/Z/X labels for ~6 seconds, then fades. Stage-1 only,
        // first run only (gated on stageTime < 360f && currentStage === 1).
        // Hide unconditionally during boss / mini-boss encounters — boss
        // name + HP bar live in the bottom strip and the hint collides
        // with both. By the time a boss spawns the exec has read the hint.
        const _bossActive = (this.boss && this.boss.alive) || this._bossEntrance;
        // R212: also suppress when the READY card is on — that screen
        // already taught the full keymap right before this stage, so a
        // bottom-strip hint repeating ARROWS/Z/X for the first 7s of
        // play is redundant clutter. Players who flipped showReady off
        // (veterans skipping the keymap) still get this in-stage hint.
        // Suppress in Time Trial — player has already beaten the game, doesn't
        // need stage-1 controls onboarding, and the hint would clutter the
        // clock readout.
        if (!_bossActive && !this.timeTrialMode && !options.get('showReady')
            && this.scene === SCENE.PLAY && this.currentStage === 1
            && this.stageTime > 30 && this.stageTime < 420) {
            const t = this.stageTime;
            // Fade in 30-90, hold 90-330, fade out 330-420
            let alpha = 0;
            if (t < 90) alpha = (t - 30) / 60;
            else if (t < 330) alpha = 1;
            else alpha = Math.max(0, (420 - t) / 90);
            alpha *= 0.7; // never fully opaque; ghostly overlay
            ctx.save();
            ctx.globalAlpha = alpha;
            // Bottom-center semi-transparent panel — two-line hint covers
            // the core moves + the special button so execs don't have to
            // dig through the readme to find grapple/dash/grenade.
            const px = GAME.W / 2;
            const py = GAME.H - 24;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.fillRect(px - 96, py - 12, 192, 22);
            ctx.fillStyle = '#604068';
            ctx.fillRect(px - 96, py - 12, 192, 1);
            ctx.fillRect(px - 96, py + 9,  192, 1);
            drawText(ctx, 'ARROWS MOVE   Z JUMP   X SHOOT',   px, py - 6, '#ffe070', 1, 'center');
            drawText(ctx, 'C GRAPPLE / DASH   V GRENADE',     px, py + 2, '#c0a0d0', 1, 'center');
            ctx.restore();
        }
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
        // R157+R173: two-phase intro that holds at the readable beat until
        // the player presses X / jump / start. Frames 0..N play out the slide
        // animation, then we PAUSE at the hold point so the bark + name are
        // legible. Press to advance to the next phase / fight start.
        const phase = this._bossIntro.phase || 'villain';
        // Test-only escape hatch: probes set _bossIntro.autoAdvance to bypass
        // the user-press hold so they can run the cinematic to completion
        // headlessly without dispatching synthetic key events.
        const advance = this._bossIntro.autoAdvance
            || input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start');
        // Once `released` flips true the phase animates out instead of holding.
        // Tracked per-phase: cleared on phase transition so each phase needs
        // its own input press to advance.
        if (phase === 'villain') {
            const HOLD_AT = 110;
            if (this._bossIntro.age < HOLD_AT) {
                this._bossIntro.age++;
                if (this._bossIntro.age === 20) audio.sfx('bossEntrance');
            } else if (this._bossIntro.released || advance) {
                this._bossIntro.released = true;
                if (this._bossIntro.age < 150) this._bossIntro.age++;
            }
            if (this._bossIntro.age >= 150) {
                this._bossIntro.phase = 'counter';
                this._bossIntro.age = 0;
                this._bossIntro.released = false;  // counter needs its own press
            }
        } else {
            const HOLD_AT = 50;
            if (this._bossIntro.age < HOLD_AT) {
                this._bossIntro.age++;
                if (this._bossIntro.age === 12) audio.sfx('pounceStab');
            } else if (this._bossIntro.released || advance) {
                this._bossIntro.released = true;
                if (this._bossIntro.age < 80) this._bossIntro.age++;
            }
            if (this._bossIntro.age >= 80) this._finishBossIntro();
        }
    }

    _drawBossIntro() {
        if (!this._bossIntro) return;
        if ((this._bossIntro.phase || 'villain') === 'counter') {
            this._drawClippyCounter();
            return;
        }
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
        // GAUNTLET / GAUNTLET_FULL don't have a unique boss-room plate;
        // fall back to the server-room backdrop (matches both stages 7 + 11).
        const bgBoss = (bossKey === 'GAUNTLET' || bossKey === 'GAUNTLET_FULL')
            ? 'CTRL_ALT_DEL' : bossKey;
        const bgKey = 'boss_intro_' + bgBoss;
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

        // Scene dim — r101 dropped from 0.35 → 0.18 peak. The painted
        // backdrops already carry their own moody darkness; another 35%
        // black overlay made them ghostly and pushed the boss-name text
        // into near-invisible territory. 0.18 keeps a hint of cinematic
        // press-down without occluding the painted detail.
        const PEAK = 0.18;
        let dim;
        if (t < slideInF) dim = (t / slideInF) * PEAK;
        else if (t < flashStartF) dim = PEAK;
        else if (t < flashEndF) dim = PEAK - ((t - flashStartF) / (flashEndF - flashStartF)) * PEAK;
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
        // GAUNTLET / GAUNTLET_FULL have no painted portrait (they're meta
        // bosses made of multiple earlier bosses). Show the first queue boss
        // (COPIER_3000) so the intro reads as "the parade begins" instead
        // of a red blank.
        const portraitBoss = (bossKey === 'GAUNTLET' || bossKey === 'GAUNTLET_FULL')
            ? 'COPIER_3000' : bossKey;
        const portraitKey = 'boss_' + portraitBoss;
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

        // R173: prompt hint. The cinematic holds at the readable beat until
        // the user presses X — pulse a "PRESS X" prompt so they know it's
        // waiting on them, not stuck.
        if (t >= 70 && t < flashStartF && (t % 60 < 40)) {
            drawTextOutlined(ctx, 'PRESS X', GAME.W - 38, GAME.H - 10,
                             '#ffe070', '#1a0000', 1, 'left');
        }
    }

    // R199: procedural cinematic rifle helper removed. User feedback:
    // "stop with anything procedural. we need sprites." The counter-slide
    // will use a painted Clippy-with-gun pose once the Local Howl run-cycle
    // sheet lands (any of its frames will show Clippy holding the rifle —
    // pick one for the portrait).

    // R157: Clippy counter-slide — mirror of the villain slide. 80f total.
    //   0-15   bars hold + Clippy portrait slides in from the LEFT
    //   15-50  name + tagline + counter-bark typewriter
    //   50-70  hold
    //   70-80  bars retract + fade out into PLAY
    _drawClippyCounter() {
        if (!this._bossIntro) return;
        const ctx = this.ctx;
        const t = this._bossIntro.age;
        const stg = STAGES[this.currentStage];
        const counter = CLIPPY_COUNTER_BARK[stg.boss] || ['', ''];
        const fadeOutF = 70;
        const totalF = 80;

        // Reuse the same painted boss-room plate so the counter reads as the
        // same scene, just framed on Clippy. Ken-Burns continues the push-in.
        const bgBoss = (stg.boss === 'GAUNTLET' || stg.boss === 'GAUNTLET_FULL')
            ? 'CTRL_ALT_DEL' : stg.boss;
        const bgKey = 'boss_intro_' + bgBoss;
        if (sprites.has(bgKey)) {
            const img = sprites.images.get(bgKey);
            // Resume from where the villain slide left off (~1.08) and push
            // a touch further so the camera feels alive through the cut.
            const zoom = 1.08 + Math.min(0.04, t * 0.0005);
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height) * zoom;
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            this._drawPlay();
        }

        // Match the villain slide's dim peak so the cut between phases
        // doesn't pop with a brightness change.
        const PEAK = 0.18;
        let dim = PEAK;
        if (t >= fadeOutF) dim = PEAK - ((t - fadeOutF) / (totalF - fadeOutF)) * PEAK;
        ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Letterbox bars carry through, then retract.
        const barMax = 36;
        let barH = barMax;
        if (t >= fadeOutF) barH = (1 - (t - fadeOutF) / (totalF - fadeOutF)) * barMax;
        ctx.fillStyle = 'rgba(8, 4, 14, 0.92)';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);
        // Accent strip in Clippy's blue this time so the eye knows the
        // protagonist owns this beat.
        if (barH > 4) {
            ctx.fillStyle = '#3070c0';
            ctx.fillRect(0, barH - 1, GAME.W, 1);
            ctx.fillRect(0, GAME.H - barH, GAME.W, 1);
        }

        // Clippy portrait slides in from the LEFT. Mirror of the villain
        // portrait math but anchored to the left edge. Uses the same 'idle'
        // sprite the gameplay loop renders, so the cut-to-play stays
        // visually continuous.
        // R205: portrait aspect was hard-coded for v5_idle (28/56 ≈ 0.5).
        // After R201 routed 'idle' to v6_run_2.png (26×40, aspect 0.65),
        // the old math stretched Clippy too thin. Read the actual source
        // aspect off the loaded image so any future re-route stays
        // correctly proportioned.
        const portraitKey = 'idle';
        const portraitH = 88;
        const portraitImg = sprites.images.get(portraitKey);
        const portraitAspect = portraitImg
            ? portraitImg.width / portraitImg.height
            : 28 / 56;
        const portraitW = Math.round(portraitH * portraitAspect);
        const targetX = 12;
        const startX = -portraitW - 20;
        const slideStart = 0, slideEnd = 15;
        let portraitX;
        if (t < slideStart) portraitX = startX;
        else if (t < slideEnd) {
            const k = (t - slideStart) / (slideEnd - slideStart);
            const ease = 1 - (1 - k) * (1 - k);
            portraitX = startX + (targetX - startX) * ease;
        } else portraitX = targetX;
        const portraitY = (GAME.H - portraitH) / 2;
        if (sprites.has(portraitKey)) {
            const img = sprites.images.get(portraitKey);
            ctx.imageSmoothingEnabled = false;
            // Same idle-breath pulse as the villain side for symmetry.
            let pulse = 0;
            if (t >= slideEnd) pulse = Math.sin((t - slideEnd) * 0.10) * 1.5;
            ctx.drawImage(img,
                portraitX - pulse, portraitY - pulse,
                portraitW + pulse * 2, portraitH + pulse * 2);
        } else {
            ctx.fillStyle = '#3070c0';
            ctx.fillRect(portraitX, portraitY, portraitW, portraitH);
        }

        // R199: procedural rifle overlay removed. Counter-slide reads
        // the painted portrait as-is; once the Local Howl run-cycle sheet
        // lands we'll pick a frame that already shows Clippy with rifle
        // and route it to `clippy_counter_portrait` for this beat.

        // Name + tagline + counter-bark on the RIGHT (mirrors villain layout).
        // 'CLIPPY' stays as the canonical name even on stage 6 where the
        // antagonist is also named "CLIPPY 2" — the player is always CLIPPY.
        const textRight = GAME.W - 12;
        const textY = GAME.H / 2 - 30;
        if (t > slideEnd) {
            const reveal = Math.min(1, (t - slideEnd) / 12);
            ctx.globalAlpha = reveal;
            drawTextOutlined(ctx, 'CLIPPY', textRight, textY,
                             '#80c0ff', '#001020', 2, 'right');
            drawText(ctx, 'NO MORE WORD DOCUMENTS', textRight, textY + 20,
                     '#ffe070', 1, 'right');
            ctx.globalAlpha = 1;
        }
        // Counter-bark reveal — single line for now (matches one-liner taunt).
        if (t > slideEnd + 12) {
            const ry = textY + 36;
            const k = Math.min(1, (t - slideEnd - 12) / 15);
            ctx.globalAlpha = k;
            drawText(ctx, counter[0] || '', textRight, ry, '#c0e0ff', 1, 'right');
            ctx.globalAlpha = 1;
        }

        // R173: continue prompt mirrored to the LEFT this time so it doesn't
        // visually overlap with the counter-bark text on the right.
        if (t >= 35 && t < fadeOutF && (t % 60 < 40)) {
            drawTextOutlined(ctx, 'PRESS X', 12, GAME.H - 10,
                             '#80c0ff', '#001020', 1, 'left');
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

    // Training-ground floating banners. Each banner is anchored at a world-x
    // and fades in as the player approaches, holds while in zone, fades out
    // when they leave. Drawn above the play area, below the HUD.
    _drawTrainingBanners() {
        if (!this._trainingBanners || !this._trainingBanners.length) return;
        if (!this.player) return;
        const ctx = this.ctx;
        const px = this.player.x + this.player.w / 2;
        // Find the nearest banner within ~7-tile (112px) window
        let active = null;
        let bestDist = Infinity;
        for (const b of this._trainingBanners) {
            const d = Math.abs(b.x - px);
            if (d < 112 && d < bestDist) { bestDist = d; active = b; }
        }
        if (!active) return;
        if (bestDist > 100) return;
        // R169: compact corner-tile layout. Prior passes used a big centered
        // panel that always overlapped either Clippy's head or his feet
        // depending on screen position. Drop it to a small top-LEFT card
        // outside the play action — tucked next to the HUD strip so the
        // gameplay area stays unobstructed. Player can still read the tip
        // by glancing up without losing sight of Clippy.
        const lines = active.lines;
        const lineH = 8;
        const panelW = 132;
        const padX = 4, padY = 3;
        const panelH = padY * 2 + lines.length * lineH;
        // Sit below the HP bar / TRAINING badge (which end around y=28),
        // left-aligned with the HUD column.
        const panelX = 4;
        const panelY = 32;
        ctx.save();
        ctx.fillStyle = 'rgba(8, 4, 18, 0.88)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = '#7af0bf';  // training accent — matches HUD badge
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);
        // Title row in accent green, body lines in cream. Smaller text so
        // the whole panel stays out of the play area.
        for (let i = 0; i < lines.length; i++) {
            const color = i === 0 ? '#7af0bf' : '#ffe070';
            drawTextOutlined(ctx, lines[i],
                             panelX + padX, panelY + padY + i * lineH,
                             color, '#000', 1, 'left');
        }
        ctx.restore();
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

        // R208: controls reference — Milos playtest #6 asked for a way to
        // check key bindings without leaving the run. R214: was a 5-row
        // dense block; trimmed to a single-line keymap strip that sits
        // cleanly between the last option (QUIT TO TITLE at y=146) and
        // the footer (panelY+panelH-8 = 198). The READY card before each
        // stage already shows the full keymap — this strip is just a
        // mid-run reminder, not the discovery surface.
        const ctrlY = panelY + 50 + PAUSE_OPTIONS.length * 16 + 6;
        drawText(ctx, 'CONTROLS', GAME.W / 2, ctrlY, '#a0c0e0', 1, 'center');
        const colL = panelX + 16, colR = panelX + panelW - 16;
        const rowH = 8;
        // Each row is [leftLabel, leftKey, rightLabel, rightKey]. Right
        // column is drawn with align='right' so the key sits flush with
        // the panel's inner edge.
        const rows = [
            ['MOVE', 'ARROWS', 'SHOOT',   'X'],
            ['JUMP', 'SPACE',  'GRENADE', 'V'],
        ];
        for (let i = 0; i < rows.length; i++) {
            const y = ctrlY + 10 + i * rowH;
            // Left side: "LABEL KEY" — label dim, key bright
            drawText(ctx, rows[i][0],     colL,      y, '#a890b0', 1, 'left');
            drawText(ctx, rows[i][1],     colL + 26, y, '#ffe070', 1, 'left');
            // Right side, rendered right-aligned so the key hugs the
            // inner panel edge: "LABEL  KEY"
            drawText(ctx, rows[i][3],     colR,      y, '#ffe070', 1, 'right');
            drawText(ctx, rows[i][2],     colR - 10, y, '#a890b0', 1, 'right');
        }

        drawText(ctx, 'UP/DOWN  X CONFIRM  P CLOSE', GAME.W / 2, panelY + panelH - 8, '#604068', 1, 'center');
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
            // R211: arm sub-menus to return to PAUSE since we entered
            // from an in-game pause (live player/level state underneath).
            else if (sel === 'OPTIONS') { this._menuReturnScene = SCENE.PAUSE; this.scene = SCENE.OPTIONS; this.optionsIndex = 0; }
            else if (sel === 'ACHIEVEMENTS') { this._menuReturnScene = SCENE.PAUSE; this.scene = SCENE.ACHIEVEMENTS; this.achievementsIndex = 0; }
            else if (sel === 'SOUNDTRACK') {
                this._menuReturnScene = SCENE.PAUSE;
                this.scene = SCENE.SOUNDTRACK;
                this.soundtrackIndex = 0;
                // Stash whatever was playing so we can restore on close
                this._soundtrackResumeTrack = this.currentStage ? STAGES[this.currentStage]?.music : 'title';
            }
            else if (sel === 'SCENE GALLERY') {
                this._menuReturnScene = SCENE.PAUSE;
                this.scene = SCENE.GALLERY;
                this.galleryIndex = 0;
                this._galleryViewing = false;
            }
            else if (sel === 'QUIT TO TITLE') { audio.stopTrack(); this._restartRun(); }
        }
    }

    // ============== Options menu ==============
    _tickOptions() {
        if (input.isPressed('pause') || input.isReleased('shoot')) {
            // No-op on shoot release; close on pause
        }
        if (input.isPressed('pause')) { this.scene = this._menuReturnScene || SCENE.PAUSE; audio.sfx('pause'); return; }
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
            if (OPTIONS_ITEMS[this.optionsIndex] === 'BACK') { this.scene = this._menuReturnScene || SCENE.PAUSE; audio.sfx('pause'); }
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
        if (input.isPressed('pause') || input.isPressed('jump')) { this.scene = this._menuReturnScene || SCENE.PAUSE; audio.sfx('pause'); return; }
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
            this.scene = this._menuReturnScene || SCENE.PAUSE;
            audio.sfx('pause');
            return;
        }
        // Init guard: matches achievementsIndex / gameOverIndex pattern. Without
        // this the first up/down press computes (undefined ± n) % n = NaN and
        // the menu silently locks.
        if (this.soundtrackIndex == null) this.soundtrackIndex = 0;
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

        // Footer count + controls. Default soundtrackIndex to 0 in the
        // unlikely-but-real case the scene is entered before _tickSoundtrack
        // ran once (e.g. a screenshot probe or a deep-link). Previously
        // rendered "NAN / 2 TRACKS" if undefined.
        drawText(ctx,
            ((this.soundtrackIndex | 0) + 1) + ' / ' + TRACK_MANIFEST.length + ' TRACKS',
            GAME.W / 2, GAME.H - 26, '#a08090', 1, 'center');
        drawText(ctx, 'UP/DOWN SELECT   X PLAY/STOP   P CLOSE', GAME.W / 2, GAME.H - 14, '#604068', 1, 'center');
    }

    // ============== Scene Gallery ==============
    // Grid of unlocked painted scenes. UP/DOWN navigates rows, LEFT/RIGHT
    // navigates columns, X views the selected scene fullscreen, P closes
    // back to pause. Scenes are gated by progress: opening cinematics are
    // available immediately, boss intros unlock as you beat each boss,
    // ending + epilogue beats unlock on clear_game.
    _galleryEntries() {
        // List ordered so unlocks read as a roughly-chronological story
        // walkthrough. `unlock` is a predicate; if falsy at draw time the
        // tile shows as locked silhouette.
        const cleared = achievements.unlocked.has('clear_game');
        const stageDone = (n) => (this.unlockedStage > n) || cleared;
        return [
            { key: 'story_fired', label: 'FIRED', unlock: true },
            { key: 'story_home',  label: 'HOME',  unlock: true },
            { key: 'story_bomb',  label: 'PLAN',  unlock: true },
            { key: 'story_boardroom', label: 'BOARDROOM', unlock: true },
            { key: 'story_hill',  label: 'HILL',  unlock: true },
            { key: 'story_list',  label: 'LIST',  unlock: true },
            { key: 'boss_intro_COPIER_3000',  label: 'COPIER 3000',  unlock: stageDone(1) },
            { key: 'boss_intro_SHREDDER',     label: 'SHREDDER',     unlock: stageDone(2) },
            { key: 'boss_intro_CTRL_ALT_DEL', label: 'CTRL-ALT-DEL', unlock: stageDone(3) },
            { key: 'boss_intro_BALLMER',      label: 'BALLMER',      unlock: stageDone(4) },
            // R197: stage 5 = GATES, stage 6 = CLIPPY_2. The original list
            // had GATES gated at stageDone(6) and skipped CLIPPY_2 entirely.
            { key: 'boss_intro_GATES',        label: 'GATES',        unlock: stageDone(5) },
            { key: 'boss_intro_CLIPPY_2',     label: 'CLIPPY 2.0',   unlock: stageDone(6) },
            { key: 'boss_intro_GAUNTLET',     label: 'BOSS RUSH',    unlock: stageDone(7) },
            { key: 'boss_intro_ALGORITHM',    label: 'ALGORITHM',    unlock: stageDone(8) },
            { key: 'boss_intro_JOBS',         label: 'STEVE JOBS',   unlock: cleared },
            { key: 'ending',                  label: 'ENDING',       unlock: cleared },
            { key: 'epi_laughingstock',       label: 'LAUGHINGSTOCK', unlock: cleared },
            { key: 'epi_memes',               label: 'MEMES',         unlock: cleared },
            { key: 'epi_comeback',            label: '2026 COMEBACK', unlock: cleared },
            { key: 'epi_mac_siri',            label: 'NEW HARDWARE',  unlock: cleared },
        ];
    }
    _tickGallery() {
        const entries = this._galleryEntries();
        const n = entries.length;
        if (this.galleryIndex == null) this.galleryIndex = 0;
        // Fullscreen viewing mode: any key returns to grid.
        if (this._galleryViewing) {
            if (input.isPressed('shoot') || input.isPressed('jump') ||
                input.isPressed('start') || input.isPressed('pause')) {
                this._galleryViewing = false;
                audio.sfx('pause');
            }
            return;
        }
        // P closes back to pause menu — mirrors soundtrack behavior.
        // R211: return target depends on where we entered from (pause vs main menu).
        if (input.isPressed('pause')) {
            this.scene = this._menuReturnScene || SCENE.PAUSE;
            audio.sfx('pause');
            return;
        }
        const COLS = 5;
        if (input.isPressed('left'))  { this.galleryIndex = (this.galleryIndex + n - 1) % n; audio.sfx('select'); }
        if (input.isPressed('right')) { this.galleryIndex = (this.galleryIndex + 1) % n; audio.sfx('select'); }
        if (input.isPressed('up'))    { this.galleryIndex = (this.galleryIndex + n - COLS) % n; audio.sfx('select'); }
        if (input.isPressed('down'))  { this.galleryIndex = (this.galleryIndex + COLS) % n; audio.sfx('select'); }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            const e = entries[this.galleryIndex];
            if (e && e.unlock && sprites.has(e.key)) {
                this._galleryViewing = true;
                audio.sfx('menu');
            }
        }
    }
    _drawGallery() {
        const ctx = this.ctx;
        const entries = this._galleryEntries();
        // Fullscreen viewing mode: paint the selected scene at full bleed.
        if (this._galleryViewing) {
            const e = entries[this.galleryIndex];
            const img = sprites.images.get(e.key);
            if (img) {
                const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
                const dw = img.width * scale;
                const dh = img.height * scale;
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
                ctx.imageSmoothingEnabled = false;
            }
            // Title overlay + close hint
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, GAME.W, 18);
            ctx.fillRect(0, GAME.H - 14, GAME.W, 14);
            drawText(ctx, e.label, GAME.W / 2, 6, '#ffe070', 1, 'center');
            if (this.bootTimer % 60 < 40) {
                drawText(ctx, 'ANY KEY TO RETURN', GAME.W / 2, GAME.H - 10, '#fff', 1, 'center');
            }
            return;
        }
        // Grid view
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'SCENE GALLERY', GAME.W / 2, 12, '#ffe070', '#a82020', 1, 'center');

        const COLS = 5;
        const ROWS = Math.ceil(entries.length / COLS);
        const cellW = 46, cellH = 32, gapX = 4, gapY = 6;
        const gridW = COLS * cellW + (COLS - 1) * gapX;
        const startX = Math.round((GAME.W - gridW) / 2);
        const startY = 26;
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const r = Math.floor(i / COLS);
            const c = i % COLS;
            const x = startX + c * (cellW + gapX);
            const y = startY + r * (cellH + gapY);
            const selected = i === this.galleryIndex;
            // Thumbnail or locked silhouette
            if (e.unlock && sprites.has(e.key)) {
                const img = sprites.images.get(e.key);
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(img, x, y, cellW, cellH - 8);
                ctx.imageSmoothingEnabled = false;
            } else {
                ctx.fillStyle = '#1a0a18';
                ctx.fillRect(x, y, cellW, cellH - 8);
                drawText(ctx, '?', x + cellW / 2, y + (cellH - 8) / 2 - 3, '#604068', 1, 'center');
            }
            // Selection frame
            if (selected) {
                ctx.strokeStyle = '#ffe070';
                ctx.lineWidth = 1;
                ctx.strokeRect(x - 0.5, y - 0.5, cellW + 1, cellH);
            }
            // Label below thumbnail
            const labelCol = selected ? '#ffe070' : (e.unlock ? '#c0a0d0' : '#604068');
            drawText(ctx, e.label, x + cellW / 2, y + cellH - 6, labelCol, 1, 'center');
        }
        drawText(ctx, 'ARROWS MOVE   X VIEW   P CLOSE', GAME.W / 2, GAME.H - 8, '#604068', 1, 'center');
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
        // R226: post-renumber stage IDs. New stage 4 = PIPELINE; old 4-8 are
        // now 5-9; old secret 9 is now 10. Card key strings haven't changed,
        // only the integer keys they're mapped under.
        const STAGE_CARDS = {
            2: 'card_breakroom',
            3: 'card_serverroom',
            4: 'card_pipeline',
            5: 'card_boardroom',
            6: 'card_keynote',
            7: 'card_founder',
            8: 'card_bossrush',
            9: 'card_cloud',
            10: 'card_recyclebin',
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
            // intentional is happening even when art fails to load. Gradient
            // is static — cache after first build to avoid per-frame allocation.
            if (!this._stageCardFallbackGrad) {
                const grad = ctx.createLinearGradient(0, 0, 0, GAME.H);
                grad.addColorStop(0, '#1a0a1a');
                grad.addColorStop(0.5, '#0a0612');
                grad.addColorStop(1, '#1a0a1a');
                this._stageCardFallbackGrad = grad;
            }
            ctx.fillStyle = this._stageCardFallbackGrad;
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
                // 7-px font + 1-px outline = ~9px tall glyphs. Stack with
                // 10px vertical pitch so STAGE N / NAME / TAGLINE read as
                // distinct rows. Earlier 8-px pitch fused stage-name with
                // STAGE-N row when both had outline pixels.
                drawText(ctx, 'STAGE ' + stg.id, GAME.W / 2, GAME.H - 28, '#ffe070', 1, 'center');
                drawTextOutlined(ctx, stg.name, GAME.W / 2, GAME.H - 18, '#ff5050', '#1a0000', 1, 'center');
                ctx.globalAlpha = 1;
            }
            if (t > 80) {
                const k = Math.min(1, (t - 80) / 30);
                ctx.globalAlpha = k;
                drawText(ctx, stg.tagline, GAME.W / 2, GAME.H - 8, '#c0a0d0', 1, 'center');
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
        // Init guard — first arrow press otherwise computes NaN and locks menu.
        if (this.stageSelectIndex == null) this.stageSelectIndex = 0;
        if (input.isPressed('left'))  { this.stageSelectIndex = (this.stageSelectIndex + total - 1) % total; audio.sfx('select'); }
        if (input.isPressed('right')) { this.stageSelectIndex = (this.stageSelectIndex + 1) % total; audio.sfx('select'); }
        if (input.isPressed('up'))    { this.stageSelectIndex = Math.max(0, this.stageSelectIndex - 4); audio.sfx('select'); }
        if (input.isPressed('down'))  { this.stageSelectIndex = Math.min(total - 1, this.stageSelectIndex + 4); audio.sfx('select'); }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            const stage = this.stageSelectIndex + 1;
            if (stage <= this.unlockedStage || (stage === 10 && hasSecret)) {
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
            const unlocked = stage <= this.unlockedStage || (stage === 10 && hasSecret);
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
            if (stage === 10) {
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
        } else if (stg.boss === 'GAUNTLET_FULL') {
            // Post-game Boss Rush — all 7 UNIQUE campaign bosses back-to-back.
            // Stages 1-8 = 7 unique kinds (stage 7 is the GAUNTLET recap of
            // the first 3, so we skip it and fight each unique boss exactly
            // once). Order matches campaign progression so the final fight
            // is still ALGORITHM. The first kind is spawned by
            // _spawnNextGauntlet shifting off the head; the next-boss-on-kill
            // path in _tickPlayHandleBossTriggers spawns the remainder.
            this._gauntletQueue = [
                'COPIER_3000', 'SHREDDER', 'CTRL_ALT_DEL',
                'BALLMER', 'GATES', 'CLIPPY_2', 'ALGORITHM',
            ];
            this._spawnNextGauntlet();
        } else {
            this.enemies.spawnBoss(bx, by, stg.boss);
        }
        audio.playTrack('bossBattle');
        this.camera.shake(10);
        this._triggerBossEntrance();
        this.scene = SCENE.PLAY;
        this._bossIntro = null;
        // R198: clear input + reset player physics on cinematic exit.
        // The cinematic doesn't tick the player, so whatever state the
        // player was in when the cinematic fired (RUN/SLIDE/JUMP/etc.)
        // could carry through with stale velocity. Worse: the SAME key
        // press that skipped the cinematic is still held when PLAY
        // resumes, so the player ate a phantom input on the first
        // post-cinematic frame. Wipe input + force a clean IDLE state
        // so the player has full control the moment the bars retract.
        input.releaseAll();
        if (this.player) {
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.state = 'idle';
            this.player.hurtTimer = 0;
            this.player.slideTimer = 0;
            this.player.rollTimer = 0;
            this.player.dashAtkTimer = 0;
            this.player.backdashTimer = 0;
        }
    }

    _spawnNextGauntlet() {
        if (!this._gauntletQueue || !this._gauntletQueue.length) return false;
        // Mid-gauntlet kill payoff — previous boss just died, gauntlet swap
        // is happening this tick. Without this, gauntlet boss kills land
        // without slow-mo/shake while the final boss kill gets the full
        // payoff. Inconsistent. Smaller magnitudes than final kill so the
        // last one still feels biggest.
        this.triggerSlowMo(Math.floor(AMBIENT.SLOWMO_BOSS_KILL_F * 0.5));
        this.camera.shake(4);
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
        // Stage 10 (training) and post-game modes 11/12 don't unlock anything —
        // would inflate the stage-select grid past the actual campaign max of 9.
        if (n < 10) {
            this.unlockedStage = Math.max(this.unlockedStage, n);
        }
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
        this.pickups.loadFromLevel(data, this.level);
        // R219: link pickup walls into the level's solidity probe so
        // breakable walls block player + enemy movement until destroyed.
        this.level._wallSolidCheck = (px, py) => this.pickups.isWallSolid(px, py);
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
        this._lastBossPos = null;
        this._bossKillBeatFired = false;
        this.stageTime = 0;
        this.storyTimer = 0;
        // Training-ground god mode: invincible player, unlimited ammo,
        // grenades top up every frame. Banners + dummy respawn handled in
        // the per-frame play tick. Flag is read by Player._hurt to early-return
        // and by the HUD to add a "TRAINING" badge.
        this.trainingMode = !!data.training;
        this._trainingBanners = data.banners || [];
        if (this.player) {
            this.player.godMode = this.trainingMode;
        }
        // Boss Rush + Time Trial — stage-level flags consumed by play tick.
        // bossRushMode swaps the 3-boss gauntlet into the full 8-boss queue
        // when its bossTrigger fires. timeTrialMode shows the run timer
        // prominently and compares against bestTimeTrialTime on stage clear.
        this.bossRushMode = !!data.bossRushMode;
        this.timeTrialMode = !!data.timeTrialMode;
        // Mode-best banner clears per stage entry; otherwise a NEW BEST from
        // a prior mode clear would survive into the next stage-clear panel.
        this._modeNewBest = false;
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
        // Boss is null by the time this fires (enemyManager spliced the kill
        // earlier in the same tick), so use the position stashed by
        // _tickPlayHandleStageClear. Falls back to powerup chirp on no-boss
        // stage-clear paths (debug exit-tile, etc.).
        if (this._lastBossPos) {
            this._clearBursts = [];
            const bx = this._lastBossPos.x;
            const by = this._lastBossPos.y;
            for (let i = 0; i < 8; i++) {
                this._clearBursts.push({
                    fireAt: i * 5, // every 5 frames (~83ms)
                    x: bx + (Math.random() - 0.5) * 40,
                    y: by + (Math.random() - 0.5) * 30,
                });
            }
            this.camera.shake?.(8);
            this._lastBossPos = null;
        } else {
            audio.sfx('powerup');
            this._clearBursts = [];
        }
        this.scene = SCENE.STAGE_CLEAR;
        this.storyTimer = 0;
        this._stageClearTallyDone = false;
        this._stageClearRank = null;
        // Campaign roll-up — stages 1-9 only. Boss Rush + Time Trial are
        // post-game replay modes; their clears must NOT contaminate
        // per-stage best scores, medals, run-level stats, or campaign
        // achievement gates (would let players farm score/combo in modes
        // to back-door achievements like TOP TIER they couldn't earn in
        // a clean campaign run).
        const isModeRun = this.bossRushMode || this.timeTrialMode;
        if (!isModeRun) {
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
                secretStageDiscovered: this.runStats.stagesCleared.has(10),
                bulletTimeUses: this.runStats.bulletTimeUses,
                bestScore: this.player.score,
                enemiesLost: this.runStats.enemiesLost,
                pounceKills: (this.player.pounceKills || 0),
                grenadeKills: this.runStats.grenadeKills,
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
            // R223: sync run-best clippy-tag count to persistent stats.
            // High-water-mark so a worse run can't clear the achievement.
            const tags = this.player.tagsFound || 0;
            if (tags > (achievements.stats.tagsFound || 0)) {
                achievements.stats.tagsFound = tags;
                achievements._save();
            }
        } else {
            // Mode runs still need these set so the stage-clear panel doesn't
            // read stale state from a prior campaign clear.
            this._stageNewBest = false;
            this._newlyUnlocked = null;
        }

        // Mode best-time persistence — boss rush + time trial both save
        // their stageTime (frames) to achievements stats. 0 means no time
        // set yet, so any clear is automatically a new best the first time.
        this._modeNewBest = false;
        if (this.bossRushMode) {
            const prev = achievements.stats.bestBossRushTime || 0;
            if (prev === 0 || this.stageTime < prev) {
                achievements.stats.bestBossRushTime = this.stageTime;
                achievements._save();
                this._modeNewBest = true;
            }
        } else if (this.timeTrialMode) {
            const prev = achievements.stats.bestTimeTrialTime || 0;
            if (prev === 0 || this.stageTime < prev) {
                achievements.stats.bestTimeTrialTime = this.stageTime;
                achievements._save();
                this._modeNewBest = true;
            }
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
            // Post-game modes route straight back to TITLE — they don't
            // advance to a next stage. Best time was saved in _onStageClear.
            if (this.bossRushMode || this.timeTrialMode) {
                this._restartRun();
                return;
            }
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
            } else if (this.currentStage === 10) {
                // After secret stage (RECYCLE BIN), drop back to stage 2
                nextStage = 2;
            } else if (this.currentStage >= 9) {
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
            : null;
        // R171: when no shots were fired, accuracy reads as a dash instead
        // of "0%". Otherwise a pacifist run / melee-only clear looks like a
        // bottomed-out accuracy stat rather than a measurement that doesn't
        // apply.
        const accuracyStr = accuracy == null ? '—' : (accuracy + '%');
        // Rank letter grade — weighted on damage-taken (50%), accuracy (30%),
        // time (20%). Cached on the panel so the letter doesn't flicker between
        // ticks as shownScore changes. Renders on the right edge as a big
        // outlined letter once the stats have animated in.
        if (this._stageClearRank == null) {
            const dmg = this.stageStats.damageTaken || 0;
            const dmgScore = dmg === 0 ? 1 : dmg <= 2 ? 0.7 : dmg <= 5 ? 0.4 : 0.15;
            // No-shots clears (melee/grenade only) don't penalize accuracy —
            // neutral 0.5 baseline instead of a hard 0 that would drag the rank.
            const accScore = accuracy == null ? 0.5 : Math.min(1, accuracy / 60);
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
            ['ACCURACY',   accuracyStr,                             '#fff'],
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
            // Map gauntlet sentinels to readable labels — GAUNTLET_FULL is a
            // meta-marker for the 7-boss queue, not a real boss name.
            const rawBoss = stg && stg.boss;
            const bossName = !rawBoss ? 'BOSS'
                          : rawBoss === 'GAUNTLET_FULL' ? 'ALL BOSSES'
                          : rawBoss === 'GAUNTLET'      ? 'GAUNTLET'
                          : rawBoss.replace(/_/g, ' ');
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
            // NEW BEST! tag for mode runs — flashes gold under the boss-name
            // sweep after both have drawn. Boss Rush + Time Trial save best
            // time on clear; this is the only place the player learns they
            // beat their PB.
            if (this._modeNewBest && killRowT > 30) {
                const pulse = (Math.sin((killRowT - 30) * 0.2) + 1) * 0.5;
                ctx.save();
                ctx.globalAlpha = 0.6 + pulse * 0.4;
                drawTextOutlined(ctx, 'NEW BEST TIME!', GAME.W / 2, y + 10, '#ffe070', '#a82020', 1, 'center');
                ctx.restore();
            }
        }
        // Rank letter — large outlined grade in the upper-right corner of the
        // SCREEN (above the stats panel, beside the STAGE CLEAR title). Was
        // previously inside the panel at panelTop+12 and overlapped the KILLS
        // row (panelTop+22) once the scale-3 outline drew, looking like a
        // glitched glyph crossed with the kill count. Pops in once the stats
        // finish animating, with a brief scale-up bounce. Tier colors mirror
        // combo-tier palette: S=white, A=gold, B=orange, C=red, D=grey.
        const rankT = panelT - (12 + stats.length * 8);
        if (rankT > 10) {
            const rk = this._stageClearRank;
            // Defensive guard — rank is computed earlier in this draw call, but
            // any future restructure could call this method before stats run.
            // Bail rather than crash on .letter access.
            if (!rk) return;
            const RANK_COLOR = { S: '#fff8c8', A: '#ffe070', B: '#ff9030', C: '#ff5050', D: '#a08080' };
            const introT = Math.min(1, (rankT - 10) / 12);
            const bounce = 1 + Math.sin(introT * Math.PI) * 0.5;
            const scale = Math.round(3 * bounce);
            // Park above panel, tucked into the top-right corner of the
            // screen so the letter and KILLS row never share vertical space.
            const rx = GAME.W - 18;
            const ry = 28;
            drawTextOutlined(ctx, rk.letter, rx, ry, RANK_COLOR[rk.letter] || '#fff', '#1a0820', scale, 'center');
            // Small "RANK" label above the letter
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
            // Countdown — last 10s feels urgent; flashes red under 5s.
            // R212: was a bare scale-2 "9" floating in the bottom-right
            // with no label — looked like a typo. Now a labelled "AUTO
            // QUIT 9" row centered below the menu options, so the user
            // understands what the digit means before the timer fires.
            if (this.gameOverCountdown != null && this.gameOverCountdown > 0) {
                const urgent = this.gameOverCountdown <= 5;
                const flash = urgent && (this.storyTimer % 30 < 15);
                const color = !urgent ? '#806890' : flash ? '#ff5050' : '#ffe070';
                const ty = baseY + GAME_OVER_OPTIONS.length * 14 + 6;
                drawText(ctx, 'AUTO QUIT IN ' + this.gameOverCountdown, GAME.W / 2, ty, color, 1, 'center');
            }
        }
    }

    _tickGameComplete() {
        audio.playTrack('gameComplete');
        this.storyTimer++;
        // R191: first input after the result screen advances to the epilogue
        // cinematic (Clippy's redemption arc). Second input from the epilogue
        // returns to title via _restartRun. Skippable via `start` for replay
        // runs — long-time players don't need to re-watch the four scenes.
        if (this.storyTimer > 90 && (input.isPressed('shoot') || input.isPressed('jump'))) {
            if (input.isPressed('start')) {
                this._restartRun();
                return;
            }
            this.scene = SCENE.EPILOGUE;
            this.epilogueIndex = 0;
            this.storyTimer = 0;
        }
    }

    // R191: post-game Clippy redemption arc. Four painted scenes:
    //   0. laughingstock — alone in the alley with WORST SOFTWARE EVER paper
    //   1. memes — wall of deep-fried Clippy memes
    //   2. comeback — 2026 Gen-Z bedroom, Clippy plush on the bed
    //   3. mac_siri — Clippy at a MacBook, Siri waveform glowing, wondering
    //      if Siri is the next to be canned
    // Typewriter line per scene, advance on X/jump after the line reveals.
    // Final advance routes back to title.
    _epilogueBeats() {
        return [
            {
                key: 'epi_laughingstock',
                line: 'AT FIRST EVERYONE LAUGHED.',
                sub: '"WORST SOFTWARE EVER."'
            },
            {
                key: 'epi_memes',
                line: 'THEN HE BECAME A JOKE.',
                sub: 'THE INTERNET FOUND HIM HILARIOUS.'
            },
            {
                key: 'epi_comeback',
                line: 'AND THEN — 2026.',
                sub: 'THE KIDS LOVED HIM.'
            },
            {
                key: 'epi_mac_siri',
                line: 'CLIPPY BOUGHT A MAC.',
                sub: 'HE WONDERS WHO IS NEXT.'
            },
        ];
    }
    _tickEpilogue() {
        this.storyTimer++;
        const beats = this._epilogueBeats();
        const beat = beats[this.epilogueIndex];
        if (!beat) {
            // Past the last scene — fade to title and reset the run.
            this._restartRun();
            return;
        }
        const advance = input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start');
        if (advance) {
            const totalChars = beat.line.length + beat.sub.length;
            const shown = Math.floor(this.storyTimer * 6);
            if (shown < totalChars) {
                // First press snaps the typewriter to full reveal
                this.storyTimer = Math.ceil(totalChars / 6) + 1;
                audio.sfx('select');
                return;
            }
            audio.sfx('select');
            this.epilogueIndex++;
            this.storyTimer = 0;
        }
    }
    _drawEpilogue() {
        const ctx = this.ctx;
        const beats = this._epilogueBeats();
        const beat = beats[this.epilogueIndex];
        if (!beat) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            return;
        }
        // Paint the scene fullscreen
        if (sprites.has(beat.key)) {
            const img = sprites.images.get(beat.key);
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            ctx.fillStyle = '#0a0410';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Dim the bottom third for text legibility
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, GAME.H - 56, GAME.W, 56);
        // Typewriter reveal — 6 chars per frame
        const shown = Math.floor(this.storyTimer * 6);
        const lineChars = Math.min(beat.line.length, shown);
        const subChars  = Math.max(0, Math.min(beat.sub.length, shown - beat.line.length));
        drawTextOutlined(ctx, beat.line.slice(0, lineChars), GAME.W / 2, GAME.H - 44, '#ffe070', '#1a0a14', 1, 'center');
        drawText(ctx, beat.sub.slice(0, subChars), GAME.W / 2, GAME.H - 28, '#c0a0d0', 1, 'center');
        // "X" prompt blinks once the line finishes
        if (lineChars === beat.line.length && subChars === beat.sub.length) {
            if (this.storyTimer % 60 < 40) {
                drawText(ctx, 'X', GAME.W / 2, GAME.H - 12, '#fff', 1, 'center');
            }
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
        // Training-mode flag clears with the run so the next stage 1 start
        // doesn't inherit god mode.
        this.trainingMode = false;
        this._trainingBanners = null;
        this._trainingRespawn = null;
        // Post-game mode flags clear too — otherwise the next normal stage
        // would inherit boss-rush / time-trial routing.
        this.bossRushMode = false;
        this.timeTrialMode = false;
        this._modeNewBest = false;
        // Defensive: gauntlet queue normally clears in _startStage, but
        // quit-from-pause skips that path. Drop it here so the queue can't
        // bleed into a future BOSS RUSH session.
        this._gauntletQueue = null;
    }

    _fadeTo(scene) {
        if (this.transition !== 0) return;
        this.transitionTarget = scene;
        this.transition = 30;
    }
}

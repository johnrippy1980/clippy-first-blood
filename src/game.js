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
    STAGE_CLEAR: 'stageClear',
    GAME_OVER: 'gameOver',
    GAME_COMPLETE: 'gameComplete',
};

const PAUSE_OPTIONS = ['RESUME', 'OPTIONS', 'ACHIEVEMENTS', 'SOUNDTRACK', 'QUIT TO TITLE'];

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
        this.runScore = 0;
        this.stageTime = 0;
        this.totalTime = 0;
        this.totalDeaths = 0;
        // Per-stage stats (resets on _startStage)
        this.stageStats = { kills: 0, deaths: 0, damageTaken: 0, secrets: 0, weaponDamage: {}, shotsFired: 0 };
        // Run-level achievement progress (built up across stages)
        this.runStats = { stagesCleared: new Set(), noDamageStages: 0, maxCombo: 0, weaponDamage: {}, bulletTimeUses: 0 };
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
        this.transition = 0;            // 0 = none, 1..30 = fade in, -1..-30 = fade out
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
            case SCENE.STAGE_CLEAR:  this._tickStageClear(); break;
            case SCENE.GAME_OVER:    this._tickGameOver(); break;
            case SCENE.GAME_COMPLETE:this._tickGameComplete(); break;
        }
        // Global hotkeys
        if (input.isPressed('mute')) { audio.toggleMute(); audio.sfx('select'); }
        particles.update();
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
            case SCENE.STAGE_CLEAR:  this._drawPlay(); this._drawStageClear(); break;
            case SCENE.GAME_OVER:    this._drawGameOver(); break;
            case SCENE.GAME_COMPLETE:this._drawGameComplete(); break;
        }

        // Transition fade overlay
        if (this.transition !== 0) {
            const a = this.transition > 0 ? this.transition / 30 : (30 + this.transition) / 30;
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

        // Scrolling subtitle marquee — "A REVENGE STORY" drifts left
        const sub = 'A REVENGE STORY  -  EIGHT TARGETS  -  ONE PAPERCLIP  -  ';
        const subW = sub.length * 6;
        const sx = -(tb * 0.7) % subW;
        ctx.globalAlpha = 0.65;
        drawText(ctx, sub + sub, sx, 90, '#c0a0d0', 1, 'left');
        ctx.globalAlpha = 1;

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
        drawText(ctx, '(C) 2026 OFFICE WARFARE LTD  v1.0', GAME.W / 2, GAME.H - 14, '#604068', 1, 'center');
    }

    // ============== story ==============
    _tickStory() {
        audio.playTrack('story');
        this.storyTimer++;
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
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

            // Text block at bottom over the black panel
            const lines = STORY_PAGES[this.storyPage] || [];
            const startY = GAME.H - lines.length * 10 - 22;
            for (let i = 0; i < lines.length; i++) {
                drawText(this.ctx, lines[i], GAME.W / 2, startY + i * 10, '#d8c8e0', 1, 'center');
            }
            if (this.storyTimer > 30 && this.storyTimer % 60 < 40) {
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
        // Stage NAME slides in from right at t > 24
        if (t > 24) {
            const k = Math.min(1, (t - 24) / 22);
            const eased = 1 - Math.pow(1 - k, 3);
            const nameX = GAME.W + 200 - (GAME.W + 100) * eased;
            drawTextOutlined(ctx, stg.name, nameX, 94, '#ff5050', '#1a0000', 2, 'center');
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
    _tickPlay() {
        // Slow-mo: still run player/input/level so controls stay responsive,
        // but skip enemy + bullet + camera updates on alternating frames.
        let slowMoSkipEnemies = false;
        if (this.slowMoFrames > 0) {
            this.slowMoFrames--;
            this._slowMoSkip = !this._slowMoSkip;
            slowMoSkipEnemies = this._slowMoSkip;
        }
        if (input.isPressed('pause')) {
            audio.sfx('pause');
            this.pauseIndex = 0;
            this.scene = SCENE.PAUSE;
            return;
        }
        const prevHp = this.player.hp;
        const prevKills = this.player.kills;
        const prevBullet = this.player.secondChanceUsed;
        this.stageTime++;
        this.totalTime++;
        this.level.update();
        this.player.update(this.level, this.camera);
        // Game-feel: skip enemy + camera updates during hit-pause so the kill
        // hangs in the air for a couple of frames before action resumes.
        const hitPause = (this.player.hitPauseFrames || 0) > 0;
        if (hitPause) {
            this.player.hitPauseFrames--;
        } else if (slowMoSkipEnemies) {
            // Slow-mo: skip enemy/pickup update this frame, but still smooth-follow the camera
            this.camera.follow(this.player, this.player.facing);
            this.camera.update();
        } else {
            this.enemies.update(this.level, this.player);
            this.pickups.update(this.level, this.player);
            this.camera.follow(this.player, this.player.facing);
            this.camera.update();
        }
        // Drain any shake the player requested into the camera
        if (this.player.requestShake) {
            this.camera.shake(this.player.requestShake);
            this.player.requestShake = 0;
        }
        // Low-HP heartbeat at the AMBIENT-tuned interval
        if (this.player.hp <= 1 && this.player.hp > 0) {
            this._hbTick = (this._hbTick || 0) + 1;
            if (this._hbTick >= AMBIENT.HEARTBEAT_PERIOD_F) {
                audio.sfx('heartbeat');
                this._hbTick = 0;
            }
        } else {
            this._hbTick = 0;
        }
        achievements.tickBanner();
        if (this._bossEntrance) {
            this._bossEntrance.age++;
            const dur = this._bossEntrance.isMini ? 80 : 120;
            if (this._bossEntrance.age >= dur) this._bossEntrance = null;
        }
        // Track damage taken + new kills
        if (this.player.hp < prevHp) this.stageStats.damageTaken += (prevHp - this.player.hp);
        if (this.player.kills > prevKills) this.stageStats.kills += (this.player.kills - prevKills);
        if (this.player.secondChanceUsed && !prevBullet) {
            this.runStats.bulletTimeUses++;
            this.triggerSlowMo(AMBIENT.SLOWMO_SECOND_CHANCE_F);
            this.camera.shake(6);
        }
        // Boss phase-2 transition: slow-mo + shake
        if (this.boss && this.boss.alive) {
            if (this._lastBossPhase != null && this._lastBossPhase === 1 && this.boss.phase === 2) {
                this.triggerSlowMo(AMBIENT.SLOWMO_BOSS_PHASE_F);
                this.camera.shake(5);
            }
            this._lastBossPhase = this.boss.phase;
        } else {
            this._lastBossPhase = null;
        }

        // Boss trigger
        // Mini-boss: spawn once when player crosses the mini-boss trigger x.
        // Same Boss class but lower HP + simpler tagline. Cleared mid-stage as pacing payoff.
        const miniTrigger = this.level.data.miniBossTrigger;
        if (!this.miniBossSpawned && miniTrigger != null && this.player.x > miniTrigger) {
            this._spawnMiniBoss();
        }
        if (!this.bossSpawned && this.player.x > this.level.data.bossTrigger.x) {
            this._spawnBoss();
        }
        this.boss = this.enemies.activeBoss();

        // Boss-rush: spawn next when current is dead and queue isn't empty
        if (this.bossSpawned && !this.boss && this._gauntletQueue?.length) {
            this._spawnNextGauntlet();
            return;
        }

        // Stage clear: boss dead or exit reached (no-boss debug fallback)
        if (this.bossSpawned && !this.boss) {
            this._onStageClear();
        }
        if (this.level.isExit(this.player.x + this.player.w / 2, this.player.y + this.player.h)) {
            this._onStageClear();
        }

        // Death
        if (this.player.isDead()) {
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
    }

    _drawPlay() {
        const ctx = this.ctx;
        this.parallax.drawBack(ctx, this.camera);
        this.level.draw(ctx, this.camera);
        this.pickups.draw(ctx, this.camera);
        this.enemies.draw(ctx, this.camera);
        this.player.draw(ctx, this.camera);
        particles.draw(ctx, this.camera);
        particles.drawFloats(ctx, this.camera, drawText);
        this.parallax.drawFront(ctx, this.camera);
        drawHUD(ctx, {
            player: this.player,
            score: this.player.score,
            time: this.totalTime,
            boss: this.boss || this.enemies.activeMiniBoss(),
            camera: this.camera,
        });
        if (this._bossEntrance) this._drawBossEntrance();
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
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Framed panel — matches achievements/stage-select look
        const panelX = 36, panelY = 18, panelW = GAME.W - 72, panelH = GAME.H - 36;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, panelY, panelW, panelH);
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
            if (sel === 'RESUME') this.scene = SCENE.PLAY;
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
        const OPTS = ['MUSIC VOLUME', 'SFX VOLUME', 'SCANLINES', 'SHAKE INTENSITY', 'BACK'];
        if (input.isPressed('up'))   { this.optionsIndex = (this.optionsIndex + OPTS.length - 1) % OPTS.length; audio.sfx('select'); }
        if (input.isPressed('down')) { this.optionsIndex = (this.optionsIndex + 1) % OPTS.length; audio.sfx('select'); }
        const dir = (input.isPressed('left') ? -1 : 0) + (input.isPressed('right') ? 1 : 0);
        if (dir !== 0) {
            const k = ['musicVol','sfxVol','scanlines','shakeScale','BACK'][this.optionsIndex];
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
            if (OPTS[this.optionsIndex] === 'BACK') { this.scene = SCENE.PAUSE; audio.sfx('pause'); }
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

        const OPTS = ['MUSIC VOLUME', 'SFX VOLUME', 'SCANLINES', 'SHAKE INTENSITY', 'BACK'];
        const startY = panelY + 38;
        this._optionsPulse = (this._optionsPulse || 0) + 1;
        for (let i = 0; i < OPTS.length; i++) {
            const y = startY + i * 18;
            const sel = i === this.optionsIndex;
            if (sel) {
                const phase = Math.sin(this._optionsPulse * 0.18) * 0.5 + 0.5;
                ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                ctx.fillRect(panelX + 8, y - 2, panelW - 16, 14);
                drawText(ctx, '>', panelX + 12, y, '#ffe070', 1, 'left');
                drawText(ctx, '<', panelX + panelW - 18, y, '#ffe070', 1, 'left');
            }
            drawText(ctx, OPTS[i], panelX + 22, y, sel ? '#fff' : '#c0a0d0', 1, 'left');
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

        // Grid: 4 cols × 4 rows, each tile 50×34
        const cols = 4;
        const tileW = 50, tileH = 34;
        const gridW = cols * tileW + (cols - 1) * 4;
        const gridX = Math.floor((GAME.W - gridW) / 2);
        const gridY = 44;
        const cursor = this.achievementsIndex || 0;
        for (let idx = 0; idx < ACHIEVEMENT_LIST.length; idx++) {
            const a = ACHIEVEMENT_LIST[idx];
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const x = gridX + c * (tileW + 4);
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
            // Mini-name (tight truncate — 8 chars max @ 1× pixel font ≈ 48px)
            const shortName = unlocked ? a.name : '?????';
            const truncated = shortName.length > 8 ? shortName.substring(0, 7) + '.' : shortName;
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
            // _pendingStage was set by stage_clear when routing through the card
            const next = this._pendingStage || (this.currentStage + 1);
            this._pendingStage = null;
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
        if (t > 130 && (t % 60) < 40) {
            drawText(ctx, 'X TO CONTINUE', GAME.W - 4, 22, '#a08090', 1, 'right');
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
        const stg = STAGES[this.currentStage];
        const bx = this.player.x + 100;
        const by = this.level.height - 32;
        if (stg.boss === 'GAUNTLET') {
            // Boss-rush: queue 3 prior bosses. game tick will re-spawn next when one dies.
            this._gauntletQueue = ['COPIER_3000', 'SHREDDER', 'CTRL_ALT_DEL'];
            this._spawnNextGauntlet();
        } else {
            this.enemies.spawnBoss(bx, by, stg.boss);
        }
        audio.playTrack('bossBattle');
        this.camera.shake(10);
        this._triggerBossEntrance();
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
        if (!isMini) audio.sfx('bossHit');
    }

    _respawn() {
        this.player.x = this.level.data.playerStart.x;
        this.player.y = this.level.data.playerStart.y;
        this.player.vx = 0; this.player.vy = 0;
        this.player.state = 'idle';
        this.player.resetForStage();
    }

    // ============== stage transitions ==============
    _startStage(n) {
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
        });
        this._newlyUnlocked = newlyUnlocked;  // shown on stage-clear screen

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
    _drawStageClear() {
        const ctx = this.ctx;
        const t = this.storyTimer;
        // Beat 1 (0–50f): boss explosion plays over the live scene with flashing white wash
        if (t < 50) {
            const flash = t < 6 ? 0.9 : Math.max(0, 0.5 - t * 0.012);
            if (flash > 0) { ctx.fillStyle = `rgba(255,240,160,${flash})`; ctx.fillRect(0, 0, GAME.W, GAME.H); }
            return; // keep showing _drawPlay underneath
        }
        // Beat 2 (50–95f): "STAGE CLEAR" slams in from top with bounce
        const dim = Math.min(0.78, (t - 50) / 40 * 0.78);
        ctx.fillStyle = `rgba(0,0,0,${dim})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Title bounce-in: ease-out from above
        let titleY = 22;
        if (t < 95) {
            const k = (t - 50) / 45;   // 0..1
            const eased = 1 - Math.pow(1 - k, 3);
            titleY = -20 + (22 - -20) * eased + Math.sin(k * Math.PI) * 4;
        }
        const titleScale = t < 60 ? 3 : 2;
        drawTextOutlined(ctx, 'STAGE CLEAR', GAME.W / 2, titleY, '#ffe070', '#a82020', titleScale, 'center');

        // Beat 3 (95+): results panel slides up + stats tally
        if (t < 95) return;
        const panelT = t - 95;
        const panelTop = 42 + Math.max(0, 30 - panelT);
        const panelAlpha = Math.min(1, panelT / 12);
        ctx.globalAlpha = panelAlpha;
        ctx.fillStyle = '#1a0a20'; ctx.fillRect(20, panelTop, GAME.W - 40, 100);
        ctx.fillStyle = '#3a2a4a'; ctx.fillRect(20, panelTop, GAME.W - 40, 1);
        ctx.fillStyle = '#3a2a4a'; ctx.fillRect(20, panelTop + 99, GAME.W - 40, 1);
        ctx.globalAlpha = 1;
        if (panelT < 12) return;

        const min = Math.floor(this.stageTime / 3600);
        const sec = Math.floor((this.stageTime / 60) % 60);
        const time = `${min}:${String(sec).padStart(2,'0')}`;
        const accuracy = this.player.shotsFired > 0
            ? Math.round((this.stageStats.kills / this.player.shotsFired) * 100)
            : 0;
        const favWeapon = this._favoriteWeapon();
        const noDmg = this.stageStats.damageTaken === 0;

        const finalScore = this.player.score;
        // Score ticks up over ~60 frames so it feels earned
        const scoreT = Math.min(1, (panelT - 12) / 60);
        const shownScore = Math.floor(finalScore * scoreT);
        const stats = [
            ['TIME',       time, '#7af0ff'],
            ['KILLS',      String(this.stageStats.kills), '#fff'],
            ['MAX COMBO',  String(this.player.maxCombo) + 'x', '#ffe070'],
            ['SCORE',      ('000000' + shownScore).slice(-6), '#ffe070'],
            ['ACCURACY',   accuracy + '%', '#fff'],
            ['FAVORITE',   favWeapon, '#a0c0e0'],
        ];
        // Stagger rows in
        for (let i = 0; i < stats.length; i++) {
            const rowReady = panelT > 12 + i * 8;
            if (!rowReady) continue;
            const [k, v, c] = stats[i];
            const y = panelTop + 8 + i * 14;
            drawText(ctx, k,        30,             y, '#c0a0d0', 1, 'left');
            drawText(ctx, v,        GAME.W - 30,    y, c,         1, 'right');
        }

        // Per-stage medal row — 3 slots showing earned/missed medals for this stage
        // (Replaces the old "NO DAMAGE BONUS" text — encoded in the noDamage medal)
        if (panelT > 80 && this.stageStats.medals) {
            const m = this.stageStats.medals;
            const baseY = 150;
            const labels = [
                { key: 'noDamage', label: 'NO DMG',  earned: m.noDamage, c: '#50ff70' },
                { key: 'allKills', label: 'ALL FOES', earned: m.allKills, c: '#ff8050' },
                { key: 'secret',   label: 'SECRET',   earned: m.secret,   c: '#7af0ff' },
            ];
            const slotW = 64;
            const startX = GAME.W / 2 - (slotW * 3) / 2 + slotW / 2;
            for (let i = 0; i < labels.length; i++) {
                const med = labels[i];
                const cx = startX + i * slotW;
                // Coin background — golden if earned, grey if not
                const earned = med.earned;
                ctx.fillStyle = earned ? '#a07028' : '#202028';
                ctx.fillRect(cx - 8, baseY, 16, 14);
                ctx.fillStyle = earned ? med.c : '#404048';
                ctx.fillRect(cx - 7, baseY + 1, 14, 12);
                // Star or X mark
                ctx.fillStyle = earned ? '#ffe070' : '#606068';
                if (earned) {
                    // Star
                    ctx.fillRect(cx - 1, baseY + 3, 2, 8);
                    ctx.fillRect(cx - 4, baseY + 6, 8, 2);
                } else {
                    // X
                    ctx.fillRect(cx - 3, baseY + 4, 1, 1);
                    ctx.fillRect(cx + 2, baseY + 4, 1, 1);
                    ctx.fillRect(cx - 2, baseY + 5, 1, 1);
                    ctx.fillRect(cx + 1, baseY + 5, 1, 1);
                    ctx.fillRect(cx - 1, baseY + 6, 3, 1);
                    ctx.fillRect(cx - 2, baseY + 7, 1, 1);
                    ctx.fillRect(cx + 1, baseY + 7, 1, 1);
                    ctx.fillRect(cx - 3, baseY + 8, 1, 1);
                    ctx.fillRect(cx + 2, baseY + 8, 1, 1);
                }
                drawText(ctx, med.label, cx, baseY + 16, earned ? '#ffe070' : '#606068', 1, 'center');
            }
        }

        // Newly unlocked banner — shifted below medal row
        if (this._newlyUnlocked?.length && panelT > 100) {
            const a = this._newlyUnlocked[0];
            const banY = 180;
            ctx.fillStyle = '#1a0a00';
            ctx.fillRect(20, banY, GAME.W - 40, 20);
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(20, banY, GAME.W - 40, 1);
            ctx.fillRect(20, banY + 19, GAME.W - 40, 1);
            drawText(ctx, 'NEW: ' + a.name, GAME.W / 2, banY + 4,  '#ffe070', 1, 'center');
            drawText(ctx, a.desc,           GAME.W / 2, banY + 13, '#fff',    1, 'center');
        }

        if (panelT > 90 && (t % 60 < 40)) {
            drawText(ctx, 'X TO CONTINUE', GAME.W / 2, GAME.H - 12, '#fff', 1, 'center');
        }
    }

    _favoriteWeapon() {
        const dmg = this.player.dmgDealt || {};
        let best = 'MG', bestV = -1;
        for (const [k, v] of Object.entries(dmg)) if (v > bestV) { best = k; bestV = v; }
        return best;
    }

    _tickGameOver() {
        this.storyTimer++;
        if (this.gameOverIndex == null) this.gameOverIndex = 0;
        // Two-option menu: CONTINUE (retry current stage with full HP), QUIT
        const GO_OPTIONS = ['CONTINUE', 'QUIT TO TITLE'];
        if (this.storyTimer > 90) {
            if (input.isPressed('up') || input.isPressed('down')) {
                this.gameOverIndex = (this.gameOverIndex + 1) % GO_OPTIONS.length;
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
            const GO_OPTIONS = ['CONTINUE', 'QUIT TO TITLE'];
            const baseY = GAME.H - 32;
            this._goPulse = (this._goPulse || 0) + 1;
            for (let i = 0; i < GO_OPTIONS.length; i++) {
                const y = baseY + i * 14;
                const isSel = i === (this.gameOverIndex || 0);
                if (isSel) {
                    const phase = Math.sin(this._goPulse * 0.18) * 0.5 + 0.5;
                    ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                    ctx.fillRect(80, y - 2, GAME.W - 160, 12);
                    drawText(ctx, '>', 86, y, '#ffe070', 1, 'left');
                    drawText(ctx, '<', GAME.W - 92, y, '#ffe070', 1, 'left');
                }
                drawText(ctx, GO_OPTIONS[i], GAME.W / 2, y, isSel ? '#fff' : '#c0a0d0', 1, 'center');
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
        // Path badge under stats
        drawTextOutlined(ctx, 'PATH: ' + path, GAME.W / 2, 184, ep.accent, '#0a0410', 1, 'center');
        if (this.storyTimer % 60 < 40) {
            drawText(ctx, 'X TO RETURN TO TITLE', GAME.W / 2, GAME.H - 14, '#fff', 1, 'center');
        }
    }

    _restartRun() {
        this.totalTime = 0;
        this.totalDeaths = 0;
        this.player = null;
        this.scene = SCENE.TITLE;
    }

    _fadeTo(scene) {
        if (this.transition !== 0) return;
        this.transitionTarget = scene;
        this.transition = 30;
    }
}

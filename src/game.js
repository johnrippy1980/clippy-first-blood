// Top-level scene state machine + loop. Title → Story → Stage → Boss → Clear.

import { GAME, STAGES, WEAPON } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { Camera } from './camera.js';
import { Level, STAGE_LOADERS } from './level.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { PickupManager } from './pickups.js';
import { Parallax } from './parallax.js';
import { drawHUD, drawClippyIcon } from './hud.js';
import { drawText, drawTextOutlined } from './pixelfont.js';
import { sprites, CLIPPY_MANIFEST, ENEMY_MANIFEST, SCENE_MANIFEST } from './sprites.js';

const SCENE = {
    BOOT: 'boot',
    TITLE: 'title',
    STORY: 'story',
    STAGE_INTRO: 'stageIntro',
    PLAY: 'play',
    PAUSE: 'pause',
    STAGE_CLEAR: 'stageClear',
    GAME_OVER: 'gameOver',
    GAME_COMPLETE: 'gameComplete',
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

        this.currentStage = 1;
        this.unlockedStage = 1;
        this.runScore = 0;
        this.stageTime = 0;
        this.totalTime = 0;
        this.totalDeaths = 0;

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
            case SCENE.STAGE_CLEAR:  this._tickStageClear(); break;
            case SCENE.GAME_OVER:    this._tickGameOver(); break;
            case SCENE.GAME_COMPLETE:this._tickGameComplete(); break;
        }
        // Global hotkeys
        if (input.isPressed('mute')) { audio.toggleMute(); audio.sfx('select'); }
        particles.update();
        this.parallax.update();
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

        // Title text
        ctx.globalAlpha = 1;
        drawTextOutlined(ctx, 'CLIPPY', GAME.W / 2, 28, '#ff5050', '#1a0000', 4, 'center');
        drawTextOutlined(ctx, 'FIRST BLOOD', GAME.W / 2, 68, '#ffe070', '#a82020', 2, 'center');

        // Press to start (blinking)
        if (this.titleBlink % 60 < 40) {
            drawTextOutlined(ctx, 'PRESS X TO START', GAME.W / 2, GAME.H - 30, '#fff', '#000', 1, 'center');
        }
        drawText(ctx, '(C) 2026 OFFICE WARFARE LTD', GAME.W / 2, GAME.H - 14, '#604068', 1, 'center');
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

        // Try painted scene first
        const sceneKeys = ['story_home', 'story_bomb', 'story_hill', 'story_list'];
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

        // ---- Fallback procedural illustrations ----
        // Page-specific atmospheric drawings
        if (this.storyPage === 0) {
            // Happy family silhouette at home
            const cx = GAME.W / 2;
            for (let i = 0; i < 4; i++) {
                const x = cx + (i - 1.5) * 18;
                const y = 80 - (i === 0 || i === 3 ? 0 : 2);
                ctx.fillStyle = '#a01020';
                ctx.fillRect(x, y, 3, 1); // bandana
                ctx.fillStyle = '#a0a0b8';
                ctx.fillRect(x, y + 1, 3, 8);
                ctx.fillRect(x, y + 1, 1, 1);
                ctx.fillRect(x + 2, y + 1, 1, 1);
            }
            // Little dog
            ctx.fillStyle = '#a0a0b8';
            ctx.fillRect(cx + 32, 88, 4, 3);
        } else if (this.storyPage === 1) {
            // Explosion
            const cx = GAME.W / 2, cy = 84;
            const t = this.storyTimer;
            for (let i = 0; i < 30; i++) {
                const a = (i / 30) * Math.PI * 2;
                const r = Math.min(40, t * 0.5);
                const x = cx + Math.cos(a) * r;
                const y = cy + Math.sin(a) * r;
                ctx.fillStyle = i % 3 === 0 ? '#ffe070' : (i % 3 === 1 ? '#ff5050' : '#a02018');
                ctx.fillRect(x | 0, y | 0, 2, 2);
            }
            // Black silhouette of a car
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - 14, cy + 4, 28, 8);
            ctx.fillRect(cx - 18, cy + 12, 36, 4);
        } else if (this.storyPage === 2) {
            // Lone clippy with rifle on a hilltop
            ctx.fillStyle = '#180810';
            ctx.fillRect(0, 100, GAME.W, GAME.H - 100);
            drawClippyIcon(ctx, GAME.W / 2 - 8, 76);
        } else if (this.storyPage === 3) {
            // List of names on screen
            const names = ['COPIER 3000', 'MEGA-SHREDDER', 'CTRL-ALT-DEL', 'CEO BALLMER', 'THE FOUNDER', 'CLIPPY 2.0', 'THE ALGORITHM'];
            for (let i = 0; i < names.length; i++) {
                const y = 30 + i * 12;
                const hit = (this.storyTimer / 8) | 0;
                const struck = i < hit;
                const c = struck ? '#a01020' : '#a08090';
                drawText(ctx, names[i], 40, y, c, 1);
                if (struck) {
                    ctx.fillStyle = '#a01020';
                    ctx.fillRect(36, y + 3, 100, 1);
                }
            }
        }

        // Text block at bottom
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
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Panel
        ctx.fillStyle = '#1a0a20';
        ctx.fillRect(0, 70, GAME.W, 70);
        ctx.fillStyle = '#3a2a4a';
        ctx.fillRect(0, 70, GAME.W, 2);
        ctx.fillRect(0, 138, GAME.W, 2);
        drawText(ctx, 'STAGE ' + stg.id, GAME.W / 2, 76, '#ffe070', 1, 'center');
        drawTextOutlined(ctx, stg.name, GAME.W / 2, 92, '#ff5050', '#1a0000', 2, 'center');
        drawText(ctx, stg.tagline, GAME.W / 2, 120, '#c0a0d0', 1, 'center');
        if (this.bootTimer % 60 < 40) {
            drawText(ctx, 'X TO START', GAME.W / 2, 200, '#fff', 1, 'center');
        }
    }

    // ============== play ==============
    _tickPlay() {
        if (input.isPressed('pause')) {
            audio.sfx('pause');
            this.scene = SCENE.PAUSE;
            return;
        }
        this.stageTime++;
        this.totalTime++;
        this.level.update();
        this.player.update(this.level);
        this.enemies.update(this.level, this.player);
        this.pickups.update(this.level, this.player);
        this.camera.follow(this.player, this.player.facing);
        this.camera.update();

        // Boss trigger
        if (!this.bossSpawned && this.player.x > this.level.data.bossTrigger.x) {
            this._spawnBoss();
        }
        this.boss = this.enemies.activeBoss();

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
            boss: this.boss,
        });
    }

    _drawPauseOverlay() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'PAUSED', GAME.W / 2, GAME.H / 2 - 12, '#fff', '#000', 2, 'center');
        drawText(ctx, 'P RESUME  M MUTE', GAME.W / 2, GAME.H / 2 + 12, '#c0a0d0', 1, 'center');
    }

    _tickPause() {
        if (input.isPressed('pause') || input.isPressed('shoot')) {
            audio.sfx('pause');
            this.scene = SCENE.PLAY;
        }
    }

    _spawnBoss() {
        this.bossSpawned = true;
        const stg = STAGES[this.currentStage];
        const bx = this.player.x + 100;
        const by = this.level.height - 32;
        this.enemies.spawnBoss(bx, by, stg.boss);
        audio.playTrack('bossBattle');
        this.camera.shake(6);
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
        const data = STAGE_LOADERS[n]();
        this.level = new Level(data);
        this.parallax.setTheme(data.theme);
        this.camera.setBounds(this.level.width, this.level.height);
        this.enemies.clear();
        this.pickups.clear();
        for (const s of data.enemySpawns) this.enemies.spawn(s.x, s.y, s.type);
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
        this.boss = null;
        this.stageTime = 0;
        this.storyTimer = 0;
        this._fadeTo(SCENE.STAGE_INTRO);
    }

    _onStageClear() {
        if (this._clearScheduled) return;
        this._clearScheduled = true;
        audio.stopTrack();
        audio.sfx('powerup');
        this.scene = SCENE.STAGE_CLEAR;
        this.storyTimer = 0;
    }
    _tickStageClear() {
        this.storyTimer++;
        if (this.storyTimer > 60 && (input.isPressed('shoot') || input.isPressed('jump'))) {
            this._clearScheduled = false;
            audio.sfx('select');
            if (this.currentStage >= 8) {
                this._fadeTo(SCENE.GAME_COMPLETE);
            } else {
                this._startStage(this.currentStage + 1);
            }
        }
    }
    _drawStageClear() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'STAGE CLEAR', GAME.W / 2, 50, '#ffe070', '#a82020', 3, 'center');
        const sec = Math.floor(this.stageTime / 60);
        drawText(ctx, 'TIME ' + sec + 'S', GAME.W / 2, 100, '#c0a0d0', 1, 'center');
        drawText(ctx, 'SCORE ' + ('000000' + this.player.score).slice(-6), GAME.W / 2, 116, '#ffe070', 1, 'center');
        if (this.storyTimer > 60 && (this.storyTimer % 60 < 40)) {
            drawText(ctx, 'X TO CONTINUE', GAME.W / 2, 170, '#fff', 1, 'center');
        }
    }

    _tickGameOver() {
        this.storyTimer++;
        if (this.storyTimer > 60 && (input.isPressed('shoot') || input.isPressed('jump'))) {
            this._restartRun();
        }
    }
    _drawGameOver() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'GAME OVER', GAME.W / 2, GAME.H / 2 - 12, '#ff5050', '#1a0000', 3, 'center');
        drawText(ctx, 'SCORE ' + ('000000' + this.player.score).slice(-6), GAME.W / 2, GAME.H / 2 + 20, '#c0a0d0', 1, 'center');
        if (this.storyTimer % 60 < 40) {
            drawText(ctx, 'X TO TRY AGAIN', GAME.W / 2, GAME.H - 24, '#fff', 1, 'center');
        }
    }

    _tickGameComplete() {
        audio.playTrack('gameComplete');
        this.storyTimer++;
        if (this.storyTimer > 90 && (input.isPressed('shoot') || input.isPressed('jump'))) {
            this._restartRun();
        }
    }
    _drawGameComplete() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'MISSION COMPLETE', GAME.W / 2, 40, '#ffe070', '#a82020', 2, 'center');
        drawText(ctx, 'THE LIST IS FINISHED', GAME.W / 2, 70, '#c0a0d0', 1, 'center');
        const min = Math.floor(this.totalTime / 3600);
        const sec = Math.floor((this.totalTime / 60) % 60);
        drawText(ctx, 'TIME      ' + String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0'), 60, 110, '#fff', 1);
        drawText(ctx, 'SCORE     ' + this.player.score, 60, 122, '#ffe070', 1);
        drawText(ctx, 'KILLS     ' + this.player.kills, 60, 134, '#fff', 1);
        drawText(ctx, 'MAX COMBO ' + this.player.maxCombo, 60, 146, '#fff', 1);
        drawText(ctx, 'DEATHS    ' + this.totalDeaths, 60, 158, this.totalDeaths === 0 ? '#50ff70' : '#fff', 1);
        if (this.totalDeaths === 0) {
            drawTextOutlined(ctx, 'NO-DEATH RUN', GAME.W / 2, 180, '#50ff70', '#0a3a14', 1, 'center');
        }
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

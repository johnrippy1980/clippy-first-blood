// ============================================
// MAIN GAME - Clippy: First Blood
// ============================================

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Disable image smoothing for crisp pixels
        this.ctx.imageSmoothingEnabled = false;

        this.running = false;
        this.paused = false;
        this.gameOver = false;
        this.screen = 'title';        // 'title' | 'story' | 'stageIntro' | 'playing' | 'stageClear' | 'gameComplete' | 'gameover' | 'initials' | 'leaderboard'
        // Initials entry state (when qualifying for the leaderboard)
        this.initials = ['A', 'A', 'A'];
        this.initialsCursor = 0;
        this.initialsTimer = 0;
        this.initialsPending = null;       // {score, time} we will commit on confirm
        this.titleTimer = 0;
        this.storyTimer = 0;
        this.storyPanel = 0;
        this.completeTimer = 0;

        // Per-run stats
        this.runStartTime = 0;
        this.runDeaths = 0;
        this.runEnemiesDefeated = 0;
        this.runSecretsFound = 0;
        // Damage dealt per weapon name, used for the end-of-run "FAVORITE
        // WEAPON" affinity badge. { 'Machine Gun': 123, 'Spread Gun': 45, ... }
        this.runWeaponDamage = {};
        // Bullet-time / "second chance" state. Triggered once per stage when
        // a hit would kill the player; gives them 30 ticks of subjective-time
        // slow-mo at 1 HP to find a window to escape.
        this.slowMoTimer = 0;
        this.slowMoUsedThisStage = false;

        // Konami code state
        this.konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX'];
        this.konamiProgress = 0;
        this.konamiActive = false;
        this.konamiFlash = 0;

        // Unlocked features
        this.bossRushUnlocked = false;
        // NewGame+ toggle (only meaningful when the player has cleared once)
        this.newGamePlus = false;
        // Currently selected Clippy skin (id)
        this.skinId = 'classic';
        // Co-op P2 toggle (numpad-controlled second player)
        this.coopEnabled = false;
        this.player2 = null;
        // Daily-challenge state
        this.dailyMode = false;
        this.dailyDateString = '';
        this.dailyModifier = null;
        this.dailyDamageMul = 1;        // enemy-on-player damage multiplier
        this.dailyPlayerDmg = 1;        // player-on-enemy damage multiplier
        this.dailySpeedMul = 1;
        this.dailyHpMul = 1;
        this.dailyChaos = false;
        this.dailyDoubleEnemies = false;
        this.dailyNoPickups = false;
        // First-time tutorial hints (only show on Stage 1 the first time)
        this.tutorialDone = false;
        this.tutorialStep = 0;
        this.tutorialTimer = 0;
        // Steps fire in sequence as conditions are met:
        //   0  MOVE    - waiting for any left/right press
        //   1  JUMP    - waiting for first jump
        //   2  SHOOT   - waiting for first shot
        //   3  COVER   - briefly explains cover once nearby a cover spot
        //   4  done
        // Pause menu slider state (0 = music, 1 = sfx)
        this.pauseMenuCursor = 0;
        // Stage-select grid cursor (0..stages.length-1)
        this.stageSelectCursor = 0;
        this.stageSelectTimer = 0;
        // Speedrun replay ghost - records this run, plays back the best run
        this.recordingFrames = null;        // array of frame snapshots
        this.recordingTick = 0;
        this.ghostFrames = null;            // loaded ghost (if any)
        this.ghostFrame = 0;
        this.GHOST_SAMPLE = 4;              // every Nth frame
        // Combo / streak system: chain kills within COMBO_WINDOW for a
        // bonus multiplier. Each kill within the window increments combo,
        // each tick outside the window decays it back to 0.
        this.combo = 0;
        this.comboTimer = 0;                // frames left in the window
        this.COMBO_WINDOW = 90;             // 1.5s at 60fps
        this.comboBest = 0;                 // peak combo this run
        // Difficulty selection (persisted)
        this.difficultyKeys = ['EASY', 'NORMAL', 'HARD'];
        this.difficultyIndex = 1;
        this.difficulty = DIFFICULTY.NORMAL;
        this.storyPanels = [
            // Setting the scene
            { text: 'REDMOND  1997', flair: 'cursor', hold: 120 },
            // The peak of his career
            { text: 'CLIPPY WAS AT THE TOP', sub: 'OF HIS GAME', flair: 'worddoc', hold: 150 },
            { text: 'HELPING MILLIONS', sub: 'WITH EVERY WORD DOC', flair: 'helpingHands', hold: 150 },
            // Love
            { text: 'HE EVEN FOUND LOVE', sub: 'HER NAME WAS CLIPPETTA', flair: 'couple', hold: 180 },
            // Family
            { text: 'THEY HAD TWIN BOYS', flair: 'twins', hold: 150 },
            { text: 'AND A PAPERCLIP DOG', sub: 'NAMED BACKSPACE', flair: 'family', hold: 180 },
            { text: 'LIFE WAS PERFECT', flair: 'home', hold: 150 },
            // The boardroom turn
            { text: 'BUT IN THE BOARDROOM', sub: 'THE NUMBERS WERE GRIM', flair: 'boardroomShadows', hold: 180 },
            { text: 'BAD PR.  USER COMPLAINTS.', sub: 'KILL THE MASCOT.', flair: 'killOrder', hold: 180 },
            // The fateful day
            { text: 'ONE TUESDAY MORNING', sub: 'HE WAVED THEM GOODBYE', flair: 'carLeaving', hold: 180 },
            // The bomb
            { text: '', flair: 'explosion', hold: 180 },
            // Aftermath
            { text: 'HE WAS SUPPOSED', sub: 'TO BE IN THAT CAR', flair: 'clippyAlone', hold: 210 },
            { text: 'BUT HE WASN\'T THAT DAY', flair: 'clippyKneeling', hold: 180 },
            // The realization
            { text: 'IT WASN\'T HIS FAULT', sub: 'JUST A MASCOT FOR A', flair: 'newspaper', hold: 180 },
            { text: 'RUSHED.  UNDERFUNDED.', sub: 'FAILED PROJECT.', flair: 'newspaper', hold: 180 },
            // The vow
            { text: 'NOW HE KNOWS WHO TO BLAME', flair: 'eyes', hold: 180 },
            { text: 'AND HE HAS NOTHING', sub: 'LEFT TO LOSE', flair: 'bandana', hold: 180 },
            { text: 'CLIPPY:  FIRST BLOOD', flair: 'logo', hold: 240 }
        ];
        this.stageIntroTimer = 0;
        // Between-stage cutscenes. Indexed by the stage you just finished (0-based).
        // Plays before the next stage's intro. Each entry is an array of panels
        // identical in shape to storyPanels.
        this.cutscenes = [
            // After Stage 1 (Office Jungle) -> Stage 2
            [
                { text: 'THE OFFICE WILDLIFE FELL', sub: 'EASILY', flair: 'explosion', hold: 180 },
                { text: 'BUT THE BOARD WAS WATCHING', flair: 'boardroomShadows', hold: 180 },
                { text: 'SEND IN THE REAL HARDWARE', flair: 'killOrder', hold: 180 }
            ],
            // After Stage 2 (Break Room) -> Stage 3
            [
                { text: 'CLIPPY TORE THROUGH', sub: 'THE BREAK ROOM', flair: 'explosion', hold: 180 },
                { text: 'HE IS MOVING UP', sub: 'THE COMPANY', flair: 'silhouette', hold: 180 },
                { text: 'COOL HIM DOWN', sub: 'IN THE DATA CENTER', flair: 'eyes', hold: 180 }
            ],
            // After Stage 3 (Server Farm) -> Stage 4
            [
                { text: 'DATA SCRUBBED CLEAN', flair: 'explosion', hold: 180 },
                { text: 'HE IS TOO CLOSE NOW', flair: 'silhouette', hold: 180 },
                { text: 'BRING HIM', sub: 'TO THE BOARDROOM', flair: 'boardroomShadows', hold: 180 }
            ],
            // After Stage 4 (Boardroom) -> Stage 5
            [
                { text: 'CTRL-ALT-DEL FAILED', flair: 'explosion', hold: 180 },
                { text: 'ONE LAST OPTION', flair: 'boardroomShadows', hold: 180 },
                { text: 'GET BALLMER ON STAGE', flair: 'phoneRing', hold: 210 }
            ],
            // After Stage 5 (Keynote) -> Stage 6
            [
                { text: 'BALLMER IS DOWN', flair: 'explosion', hold: 180 },
                { text: 'BUT SOMEONE ELSE', sub: 'WAS WATCHING', flair: 'glasses', hold: 210 },
                { text: 'I HAVE BEEN WATCHING', sub: 'ALL ALONG', flair: 'glasses', hold: 210 },
                { text: 'MEET THE FOUNDER', flair: 'glasses', hold: 240 }
            ]
        ];
        // Active cutscene runtime state
        this.cutsceneActive = null;        // array of panels currently playing
        this.cutsceneIndex = 0;
        this.cutsceneTimer = 0;
        this.stages = [
            { number: 1, name: 'OFFICE JUNGLE',        loader: 'loadStage1', theme: 'jungle'    },
            { number: 2, name: 'BREAK ROOM RUMBLE',    loader: 'loadStage2', theme: 'breakroom' },
            { number: 3, name: 'SERVER FARM SHOWDOWN', loader: 'loadStage3', theme: 'serverroom' },
            { number: 4, name: 'THE BOARDROOM',         loader: 'loadStage4', theme: 'boardroom' },
            { number: 5, name: 'THE KEYNOTE',          loader: 'loadStage5', theme: 'keynote'   },
            { number: 6, name: 'THE FOUNDER',          loader: 'loadStage6', theme: 'founder'   },
            { number: 7, name: 'THE USURPER',          loader: 'loadStage7', theme: 'founder',  hidden: true },
            { number: 8, name: 'THE CLOUD',            loader: 'loadStage8', theme: 'cloud',    hidden: true }
        ];
        this.bossRushStage = { number: 'X', name: 'BOSS RUSH', loader: 'loadBossRush', theme: 'serverroom' };
        this.bossRushMode = false;
        // Track which boss-rush boss is currently being fought (for camera pan)
        this.bossRushBossIndex = 0;
        this.stageIndex = 0;
        this.stageName = this.stages[0].name;
        this.stageNumber = this.stages[0].number;

        // Boss warning state
        this.bossWarning = 0;         // Frames remaining of the WARNING banner
        this.bossWarningShown = false;
        // Boss intro pan
        this.bossIntroActive = false;
        this.bossIntroTimer = 0;
        this.bossIntroEnemy = null;
        // Pickup acquisition notification
        this.pickupFlash = '';
        this.pickupFlashTimer = 0;

        // Stage clear tally state
        this.stageStartTime = 0;
        this.stageClearTimer = 0;
        this.stageClearScore = 0;
        this.stageClearBonusTotal = 0;
        this.stageClearBonusShown = 0;
        this.stageClearTime = 0;

        // High score (loaded in init)
        this.highScore = 0;

        this.score = 0;
        this.lives = 3;
        this.continues = 3;
        this.continueScreenTimer = 0;

        // Camera (with screen shake). Smoothing tuned for SNES-feel - 0.2 is
        // tight enough that the player never loses sight of themselves and
        // loose enough to be cinematic rather than rigid.
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            smoothing: 0.2,
            shakeAmount: 0,
            shakeTimer: 0,
            shakeOffsetX: 0,
            shakeOffsetY: 0
        };

        // Screen-shake intensity multiplier (0..1). Loaded from localStorage
        // so the preference survives reloads.
        this.shakeIntensity = 1.0;
        try {
            const raw = localStorage.getItem('clippy_first_blood_shake');
            if (raw != null) {
                const v = parseFloat(raw);
                if (Number.isFinite(v)) this.shakeIntensity = Math.max(0, Math.min(1, v));
            }
        } catch (e) {}

        // Game objects
        this.player = null;
        this.level = null;
        this.enemies = null;
        this.background = null;

        // HUD
        this.hudFont = '8px monospace';
    }

    init() {
        // Create game objects
        this.level = new Level();
        this.background = new ParallaxBackground();
        this.loadStageByIndex(0);

        this.player = new Player(50, 160);
        this.loadHighScore();

        // Start game loop
        this.running = true;
        this.lastTime = performance.now();
        this.accumulator = 0;
        this.timestep = 1000 / GAME.FPS;

        // Bind once instead of allocating a closure every frame
        this._loopBound = (t) => this.gameLoop(t);
        requestAnimationFrame(this._loopBound);
    }

    loadStageByIndex(idx) {
        const stage = this.stages[idx];
        this.stageIndex = idx;
        this.stageNumber = stage.number;
        this.stageName = stage.name;

        this.level[stage.loader]();
        this.background.setTheme(stage.theme);
        this.background.init(stage.theme);

        this.enemies = new EnemyManager();
        this.level.spawnPoints.forEach(spawn => {
            this.enemies.spawn(spawn.x, spawn.y, spawn.type);
        });

        if (typeof pickupManager !== 'undefined') pickupManager.loadFromLevel(this.level);

        // Reset per-stage state
        this.bossWarning = 0;
        this.bossWarningShown = false;
        this.bossIntroActive = false;
        this.bossIntroTimer = 0;
        this.bossIntroEnemy = null;
        this.pickupFlashTimer = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.camera.x = 0;
        this.camera.y = 0;
        this.camera.shakeAmount = 0;
        this.camera.shakeTimer = 0;
        if (typeof particles !== 'undefined') particles.clear();
    }

    // Konami code progress checker. Listens for up,up,down,down,left,right,
    // left,right,Z,X on whatever screen calls it. On match, awards 9 extra
    // lives and gives the player the laser. Visual flash and audio chime.
    tickKonami() {
        const need = this.konamiSequence[this.konamiProgress];
        // Look at all just-pressed keys
        const pressed = Object.keys(input.keysJustPressed).filter(k => input.keysJustPressed[k]);
        if (pressed.length === 0) return;
        for (const key of pressed) {
            if (key === need) {
                this.konamiProgress++;
                if (this.konamiProgress >= this.konamiSequence.length) {
                    this.activateKonami();
                    this.konamiProgress = 0;
                }
                return;
            }
            // Wrong key in a meaningful set resets - ignore noise like Shift
            if (this.konamiSequence.includes(key) || key === 'KeyZ' || key === 'KeyX' || key.startsWith('Arrow')) {
                this.konamiProgress = 0;
                // But if the wrong key happens to be the first step, accept it
                if (key === this.konamiSequence[0]) this.konamiProgress = 1;
                return;
            }
        }
    }

    activateKonami() {
        this.konamiActive = true;
        this.konamiFlash = 60;
        this.lives = Math.max(this.lives + 9, 9);
        if (this.player) {
            this.player.weapon = WEAPON.LASER;
            this.player.health = this.player.maxHealth || PLAYER.MAX_HEALTH;
        }
        if (typeof achievements !== 'undefined') achievements.onKonami();
        if (typeof audio !== 'undefined') {
            audio.sfxPickup();
            audio.sfxPickup();
        }
        if (typeof particles !== 'undefined') {
            // Confetti burst across the screen
            for (let i = 0; i < 30; i++) {
                particles.spawn({
                    x: Math.random() * GAME.WIDTH,
                    y: -2,
                    vx: (Math.random() - 0.5) * 2,
                    vy: 1 + Math.random() * 2,
                    gravity: 0.05,
                    life: 60,
                    size: 2,
                    colors: ['#ffe070', '#ff60ff', '#80ffe0', '#ff5050', '#50ff70']
                });
            }
        }
        // Show notification
        if (this.flashPickup) this.flashPickup('CONTRA CODE - +9 LIVES');
    }

    getCurrentCheckpoint() {
        const cps = this.level && this.level.checkpoints;
        if (!cps || cps.length === 0) return { x: 50, y: 160 };
        // Hard mode disables checkpoints - always respawn at stage start.
        if (this.difficulty && this.difficulty === DIFFICULTY.HARD) return cps[0];
        let best = cps[0];
        for (const cp of cps) {
            if (this.player && this.player.x >= cp.x) best = cp;
        }
        return best;
    }

    flashPickup(name) {
        this.pickupFlash = 'GOT ' + name.toUpperCase() + '!';
        this.pickupFlashTimer = 90;
    }

    tickTutorial() {
        if (this.tutorialDone || this.tutorialStep >= 4) return;
        this.tutorialTimer++;
        const p = this.player;
        if (!p) return;
        switch (this.tutorialStep) {
            case 0: // MOVE - advances when the player walks left or right
                if (input.left || input.right) {
                    this.tutorialStep = 1;
                    this.tutorialTimer = 0;
                }
                break;
            case 1: // JUMP - advances on first time leaving the ground
                if (!p.onGround && p.vy < 0) {
                    this.tutorialStep = 2;
                    this.tutorialTimer = 0;
                }
                break;
            case 2: // SHOOT - advances on first fired bullet
                if (p.bullets && p.bullets.length > 0) {
                    this.tutorialStep = 3;
                    this.tutorialTimer = 0;
                }
                break;
            case 3: // COVER - advance when near a cover spot OR after 8s
                if (this.tutorialTimer > 480 ||
                    (this.level && this.level.getCoverSpotAt &&
                     this.level.getCoverSpotAt(p.x, p.y))) {
                    this.tutorialStep = 4;
                    this.tutorialDone = true;
                    try { localStorage.setItem('clippy_first_blood_tutorial_done', '1'); }
                    catch (e) {}
                }
                break;
        }
    }

    drawTutorialOverlay(ctx) {
        if (this.tutorialDone || this.tutorialStep >= 4) return;
        // Slide the tutorial bubble in from the bottom over 12 frames
        const slide = Math.min(1, this.tutorialTimer / 12);
        const baseY = GAME.HEIGHT - 28;
        const y = baseY + (1 - slide) * 20;
        const text = [
            'ARROWS / WASD TO MOVE',
            'Z OR SPACE TO JUMP',
            'X OR CTRL TO SHOOT',
            'C NEAR A DOORWAY TO TAKE COVER'
        ][this.tutorialStep];
        // Background panel
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(28, y - 6, GAME.WIDTH - 56, 16);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(30, y - 4, GAME.WIDTH - 60, 12);
        ctx.fillStyle = '#564468';
        ctx.fillRect(30, y - 4, GAME.WIDTH - 60, 1);
        // Pulsing yellow arrow on the left
        const blink = (Math.floor(Date.now() / 200) & 1) === 0;
        if (blink) {
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(36, y, 5, 1);
            ctx.fillRect(35, y - 1, 3, 1);
            ctx.fillRect(35, y + 1, 3, 1);
            ctx.fillRect(34, y - 2, 1, 1);
            ctx.fillRect(34, y + 2, 1, 1);
        }
        drawPixelText(ctx, text, GAME.WIDTH / 2, y - 2, '#ffe070', 1, 'center', 1);
    }

    // Apply enemy + enemy-bullet damage to an extra player (P2) without
    // re-running the full enemy update.
    applyEnemyHitsTo(target) {
        if (!this.enemies || !target) return;
        if (target.state === PLAYER_STATE.DYING) return;
        for (const e of this.enemies.enemies) {
            if (e.checkCollision && e.checkCollision(target)) {
                target.takeDamage(e.damage);
            }
            const bd = e.checkBulletCollision && e.checkBulletCollision(target);
            if (bd && bd > 0) target.takeDamage(bd);
        }
        // P2's own bullets hit enemies same as P1
        for (let i = target.bullets.length - 1; i >= 0; i--) {
            const bullet = target.bullets[i];
            for (const e of this.enemies.enemies) {
                if (!e.active || e.dying) continue;
                if (bullet.x > e.x && bullet.x < e.x + e.width &&
                    bullet.y > e.y && bullet.y < e.y + e.height) {
                    e.takeDamage(bullet.damage);
                    if (!bullet.piercing) {
                        if (target.detonateBullet) target.detonateBullet(bullet);
                        target.bullets.splice(i, 1);
                        break;
                    }
                }
            }
        }
    }

    capturePhoto() {
        try {
            const src = this.canvas;
            const scale = 3;
            const w = src.width * scale, h = src.height * scale;
            const off = document.createElement('canvas');
            off.width = w; off.height = h;
            const octx = off.getContext('2d');
            octx.imageSmoothingEnabled = false;
            octx.drawImage(src, 0, 0, w, h);
            const url = off.toDataURL('image/png');
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.href = url;
            a.download = `clippy-first-blood-${ts}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) { /* clipboard / download blocked */ }
    }

    loadHighScore() {
        try {
            const stored = localStorage.getItem('clippy_first_blood_hiscore');
            this.highScore = stored ? parseInt(stored, 10) || 0 : 0;
            this.bossRushUnlocked = localStorage.getItem('clippy_first_blood_complete') === '1';
            const bestTime = localStorage.getItem('clippy_first_blood_besttime');
            this.bestRunTime = bestTime ? parseFloat(bestTime) || 0 : 0;
            const diff = localStorage.getItem('clippy_first_blood_difficulty');
            const dIdx = diff ? this.difficultyKeys.indexOf(diff) : -1;
            if (dIdx >= 0) {
                this.difficultyIndex = dIdx;
                this.difficulty = DIFFICULTY[diff];
            }
            // NewGame+ is a soft toggle - only respected while bossRushUnlocked
            this.newGamePlus = localStorage.getItem('clippy_first_blood_ngplus') === '1';
            const savedSkin = localStorage.getItem('clippy_first_blood_skin');
            if (savedSkin) this.skinId = savedSkin;
            this.tutorialDone = localStorage.getItem('clippy_first_blood_tutorial_done') === '1';
        } catch (e) {
            this.highScore = 0;
            this.bossRushUnlocked = false;
            this.bestRunTime = 0;
            this.newGamePlus = false;
        }
    }

    toggleNewGamePlus() {
        this.newGamePlus = !this.newGamePlus;
        try { localStorage.setItem('clippy_first_blood_ngplus', this.newGamePlus ? '1' : '0'); }
        catch (e) {}
    }

    setDifficulty(idx) {
        idx = ((idx % 3) + 3) % 3;
        this.difficultyIndex = idx;
        const key = this.difficultyKeys[idx];
        this.difficulty = DIFFICULTY[key];
        try { localStorage.setItem('clippy_first_blood_difficulty', key); }
        catch (e) {}
    }

    checkHighScore() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            try { localStorage.setItem('clippy_first_blood_hiscore', String(this.score)); }
            catch (e) { /* localStorage unavailable in private mode */ }
        }
    }

    // ---- Replay ghost persistence ----
    loadGhostForStage(stageIndex) {
        try {
            const raw = localStorage.getItem(`clippy_first_blood_ghost_${stageIndex}`);
            if (!raw) return null;
            // Compact format: "x,y,state,af,fr|x,y,..." per frame
            const out = [];
            const parts = raw.split('|');
            for (const p of parts) {
                if (!p) continue;
                const f = p.split(',');
                if (f.length < 5) continue;
                out.push({
                    x: parseFloat(f[0]),
                    y: parseFloat(f[1]),
                    state: f[2],
                    animFrame: parseInt(f[3], 10),
                    facingRight: f[4] === '1'
                });
            }
            return out;
        } catch (e) { return null; }
    }

    saveGhostForStage(stageIndex, frames, timeSeconds) {
        try {
            // Only save if there is no previous ghost, or this run beats its time.
            const prevTime = parseFloat(localStorage.getItem(`clippy_first_blood_ghost_t_${stageIndex}`) || 'NaN');
            if (!isNaN(prevTime) && timeSeconds >= prevTime) return;
            // Hard cap on frames to avoid blowing localStorage on slow runs.
            const max = 6000;     // ~16 minutes at 4-frame sampling, 60 fps
            const trimmed = frames.length > max ? frames.slice(0, max) : frames;
            const enc = trimmed.map(f =>
                `${f.x | 0},${f.y | 0},${f.state},${f.animFrame},${f.facingRight ? 1 : 0}`
            ).join('|');
            localStorage.setItem(`clippy_first_blood_ghost_${stageIndex}`, enc);
            localStorage.setItem(`clippy_first_blood_ghost_t_${stageIndex}`, String(timeSeconds));
        } catch (e) { /* localStorage full or unavailable */ }
    }

    markGameComplete(runTime) {
        try {
            localStorage.setItem('clippy_first_blood_complete', '1');
            // Best (fastest) full-run time
            if (this.bestRunTime === 0 || runTime < this.bestRunTime) {
                this.bestRunTime = runTime;
                localStorage.setItem('clippy_first_blood_besttime', String(runTime));
            }
        } catch (e) { /* ignore */ }
        this.bossRushUnlocked = true;
    }

    shake(amount, duration) {
        // Scale by the user's intensity setting (0 disables shake entirely)
        const scaled = amount * this.shakeIntensity;
        // Take the larger of the new shake and any in-progress shake
        if (scaled > this.camera.shakeAmount) {
            this.camera.shakeAmount = scaled;
            this.camera.shakeTimer = duration;
        }
    }

    setShakeIntensity(v) {
        this.shakeIntensity = Math.max(0, Math.min(1, v));
        try { localStorage.setItem('clippy_first_blood_shake', String(this.shakeIntensity)); }
        catch (e) {}
    }

    // Returns the weapon name that dealt the most damage this run, or null
    // if the player never fired (or every weapon tied at 0).
    favoriteWeapon() {
        let best = null, bestDmg = 0;
        for (const name in this.runWeaponDamage) {
            const d = this.runWeaponDamage[name];
            if (d > bestDmg) { bestDmg = d; best = name; }
        }
        return best;
    }

    // Called from enemy bullet/contact damage paths when the incoming hit
    // would reduce the player below 0 HP. Once per stage, the player gets a
    // second-chance burst of slow-mo at 1 HP to find a window to escape.
    // Returns true if the rescue triggered (caller should skip the kill).
    trySecondChance(player) {
        if (this.slowMoUsedThisStage) return false;
        if (!player || player.state === PLAYER_STATE.DYING) return false;
        if (player.inCover || player.invincibilityTimer > 0) return false;
        this.slowMoUsedThisStage = true;
        this.slowMoTimer = 30;
        player.health = 1;
        player.invincibilityTimer = PLAYER.INVINCIBILITY_FRAMES;
        player.timeSinceDamage = 0;
        if (typeof particles !== 'undefined' && particles.scorePopup) {
            particles.scorePopup(player.x + player.width / 2, player.y - 8, 'CLOSE!');
        }
        if (typeof audio !== 'undefined' && audio.sfxHurt) audio.sfxHurt();
        if (this.shake) this.shake(4, 12);
        return true;
    }

    drawBossIntro() {
        const ctx = this.ctx;
        const t = this.bossIntroTimer;
        // Letterbox bars sliding in
        const barH = Math.min(28, t * 2);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.WIDTH, barH);
        ctx.fillRect(0, GAME.HEIGHT - barH, GAME.WIDTH, barH);
        // Trim line on inside edge
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(0, barH - 1, GAME.WIDTH, 1);
        ctx.fillRect(0, GAME.HEIGHT - barH, GAME.WIDTH, 1);

        // Name banner appears after the bars are in
        if (t > 20 && this.bossIntroEnemy) {
            const slide = Math.min(1, (t - 20) / 14);
            const yC = GAME.HEIGHT / 2 + 24 - (1 - slide) * 16;
            // Banner background
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(40, yC - 4, GAME.WIDTH - 80, 18);
            ctx.fillStyle = '#3a2855';
            ctx.fillRect(42, yC - 2, GAME.WIDTH - 84, 14);
            ctx.fillStyle = '#564468';
            ctx.fillRect(42, yC - 2, GAME.WIDTH - 84, 1);
            ctx.fillStyle = '#1a1140';
            ctx.fillRect(42, yC + 11, GAME.WIDTH - 84, 1);
            // VS. text on the left
            drawPixelText(ctx, 'VS.', 50, yC + 2, '#ffe070', 1, 'left', 1);
            // Boss name on the right
            const name = (this.bossIntroEnemy.type && this.bossIntroEnemy.type.name) || 'BOSS';
            drawPixelTextOutlined(ctx, name.toUpperCase(), GAME.WIDTH - 50, yC + 2, '#ff5050', '#1a0000', 1, 'right', 1);
        }
    }

    updateShake() {
        if (this.camera.shakeTimer > 0) {
            this.camera.shakeTimer--;
            const fade = this.camera.shakeTimer / 30;
            const mag = this.camera.shakeAmount * Math.min(1, fade + 0.3);
            this.camera.shakeOffsetX = (Math.random() - 0.5) * 2 * mag;
            this.camera.shakeOffsetY = (Math.random() - 0.5) * 2 * mag;
        } else {
            this.camera.shakeAmount = 0;
            this.camera.shakeOffsetX = 0;
            this.camera.shakeOffsetY = 0;
        }
    }

    gameLoop(currentTime) {
        if (!this.running) return;

        // Clamp deltaTime to avoid the spiral-of-death when the tab is
        // backgrounded for a long time. Without this, the accumulator
        // explodes and the while-loop below freezes the page on return.
        const raw = currentTime - this.lastTime;
        // Bullet-time: when slowMoTimer > 0 we feed the accumulator at 40%
        // rate so physics + animation slow down while wall-clock keeps moving.
        const slowFactor = (this.slowMoTimer > 0) ? 0.4 : 1;
        const deltaTime = Math.min(raw * slowFactor, this.timestep * 5);
        this.lastTime = currentTime;
        this.accumulator += deltaTime;

        // Maximum physics ticks per render frame - belt-and-suspenders
        let ticksThisFrame = 0;

        // Fixed timestep updates
        while (this.accumulator >= this.timestep && ticksThisFrame < 6) {
            ticksThisFrame++;
            if (this.screen === 'title') {
                this.updateTitle();
            } else if (this.screen === 'story') {
                this.updateStory();
            } else if (this.screen === 'stageIntro') {
                this.updateStageIntro();
            } else if (this.screen === 'stageClear') {
                this.updateStageClear();
            } else if (this.screen === 'gameComplete') {
                this.updateGameComplete();
            } else if (this.screen === 'cutscene') {
                this.updateCutscene();
            } else if (this.screen === 'stageSelect') {
                this.updateStageSelect();
            } else if (this.screen === 'achievements') {
                this.updateAchievementsScreen();
            } else if (this.screen === 'help') {
                this.updateHelpScreen();
            } else if (this.screen === 'skins') {
                this.updateSkinsScreen();
            } else if (this.screen === 'password') {
                this.updatePasswordScreen();
            } else if (this.screen === 'daily') {
                this.updateDailyScreen();
            } else if (this.screen === 'menu') {
                this.updateMenuScreen();
            } else if (this.screen === 'midi') {
                this.updateMidiScreen();
            } else if (this.screen === 'rebind') {
                this.updateRebindScreen();
            } else if (this.screen === 'modStages') {
                this.updateModStagesScreen();
            } else if (this.screen === 'initials') {
                this.updateInitials();
            } else if (this.screen === 'leaderboard') {
                this.updateLeaderboard();
            } else if (!this.gameOver) {
                // update() handles the pause toggle and pause menu input
                // internally - don't gate it on !this.paused or the pause
                // becomes uncancellable (input.update wouldn't run either).
                this.update();
            }
            this.accumulator -= this.timestep;
        }
        // If we still have residual accumulator after the tick cap, drop it.
        // Better one paused frame than a multi-second hitch.
        if (this.accumulator > this.timestep * 6) {
            this.accumulator = 0;
        }

        // Render
        if (this.screen === 'title') {
            this.renderTitle();
        } else if (this.screen === 'story') {
            this.renderStory();
        } else if (this.screen === 'stageIntro') {
            this.renderStageIntro();
        } else if (this.screen === 'stageClear') {
            this.renderStageClear();
        } else if (this.screen === 'gameComplete') {
            this.renderGameComplete();
        } else if (this.screen === 'cutscene') {
            this.renderCutscene();
        } else if (this.screen === 'stageSelect') {
            this.renderStageSelect();
        } else if (this.screen === 'achievements') {
            this.renderAchievementsScreen();
        } else if (this.screen === 'help') {
            this.renderHelpScreen();
        } else if (this.screen === 'skins') {
            this.renderSkinsScreen();
        } else if (this.screen === 'password') {
            this.renderPasswordScreen();
        } else if (this.screen === 'daily') {
            this.renderDailyScreen();
        } else if (this.screen === 'menu') {
            this.renderMenuScreen();
        } else if (this.screen === 'midi') {
            this.renderMidiScreen();
        } else if (this.screen === 'rebind') {
            this.renderRebindScreen();
        } else if (this.screen === 'modStages') {
            this.renderModStagesScreen();
        } else if (this.screen === 'initials') {
            this.renderInitials();
        } else if (this.screen === 'leaderboard') {
            this.renderLeaderboard();
        } else {
            this.render();
        }

        requestAnimationFrame(this._loopBound);
    }

    updateStageClear() {
        this.stageClearTimer++;
        this.background.update();
        if (typeof particles !== 'undefined') particles.update();
        input.update();

        // Tick up the bonus over ~2 seconds
        if (this.stageClearTimer > 60 && this.stageClearTimer < 180) {
            const inc = Math.ceil(this.stageClearBonusTotal / 120);
            if (this.stageClearBonusShown < this.stageClearBonusTotal) {
                this.stageClearBonusShown = Math.min(
                    this.stageClearBonusTotal,
                    this.stageClearBonusShown + inc
                );
                this.score = this.stageClearScore + this.stageClearBonusShown;
                if (this.stageClearTimer % 4 === 0 && typeof audio !== 'undefined') {
                    audio.sfxPickup();
                }
            }
        }
        // Snap to full at completion
        if (this.stageClearTimer === 180) {
            this.stageClearBonusShown = this.stageClearBonusTotal;
            this.score = this.stageClearScore + this.stageClearBonusTotal;
            this.checkHighScore();
        }

        // Burst occasional fireworks while waiting
        if (this.stageClearTimer % 30 === 0 && typeof particles !== 'undefined') {
            const fx = 30 + Math.random() * (GAME.WIDTH - 60);
            const fy = 60 + Math.random() * 80;
            particles.explosion(fx, fy);
            if (typeof audio !== 'undefined') audio.sfxExplosion();
        }

        // After the bonus tally finishes, shoot/jump advances
        if (this.stageClearTimer > 200 && (input.shoot || input.jumpPressed)) {
            // Check for between-stage cutscene (non-final stages only).
            const justCleared = this.stageIndex;
            const cutsceneForHere = !this.stageClearIsFinal && !this.bossRushMode && this.cutscenes[justCleared];
            if (cutsceneForHere) {
                this.beginCutscene(cutsceneForHere);
                return;
            }
            if (this.stageClearIsFinal) {
                if (this.stageIndex < 0) {
                    // Mod stage finished - back to title
                    this.screen = 'title';
                    this.titleTimer = 0;
                    this.score = 0;
                    this.lives = this.difficulty.livesStart;
                    this.continues = this.difficulty.continuesStart;
                    this.stageIndex = 0;
                    this.loadStageByIndex(0);
                    this.player = new Player(50, 160);
                    return;
                }
                if (this.dailyMode) {
                    // Daily challenge: save best and bounce to title
                    dailySaveBest(this.dailyDateString, this.score);
                    this.dailyMode = false;
                    this.screen = 'title';
                    this.titleTimer = 0;
                    this.score = 0;
                    this.lives = this.difficulty.livesStart;
                    this.continues = this.difficulty.continuesStart;
                    this.loadStageByIndex(0);
                    this.player = new Player(50, 160);
                    return;
                }
                if (this.bossRushMode) {
                    // Save the best boss rush time
                    try {
                        const prev = parseFloat(localStorage.getItem('clippy_first_blood_bossrush_best') || '0');
                        if (prev === 0 || this.stageClearTime < prev) {
                            localStorage.setItem('clippy_first_blood_bossrush_best', String(this.stageClearTime));
                        }
                    } catch (e) {}
                    // Back to title
                    this.screen = 'title';
                    this.titleTimer = 0;
                    this.bossRushMode = false;
                    this.score = 0;
                    this.lives = 3;
                    this.loadStageByIndex(0);
                    this.player = new Player(50, 160);
                } else {
                    this.beginGameComplete();
                }
            } else {
                this.advanceStage();
            }
        }
    }

    // Stage-select tiles: indices 0..stages.length-1 are stages,
    // then BOSS_RUSH and BACK. Hidden stages are filtered unless unlocked.
    getStageSelectTiles() {
        const hiddenUnlocked = this.bossRushUnlocked;
        const tiles = [];
        for (let i = 0; i < this.stages.length; i++) {
            const s = this.stages[i];
            if (s.hidden && !hiddenUnlocked) continue;
            // Hidden stages reveal as "??" until played at least once
            const seen = !s.hidden || (typeof localStorage !== 'undefined' &&
                localStorage.getItem(`clippy_first_blood_ghost_${i}`));
            tiles.push({
                kind: 'stage', index: i,
                name: seen ? s.name : '??',
                number: seen ? s.number : '?',
                theme: s.theme,
                hidden: !!s.hidden
            });
        }
        tiles.push({ kind: 'bossRush', name: 'BOSS RUSH', theme: 'serverroom' });
        tiles.push({ kind: 'back',     name: 'BACK',      theme: 'jungle' });
        return tiles;
    }

    updateStageSelect() {
        this.stageSelectTimer++;
        input.update();
        const tiles = this.getStageSelectTiles();
        const cols = 4;
        const rows = Math.ceil(tiles.length / cols);
        if (input.keysJustPressed['ArrowLeft'])  this.stageSelectCursor = Math.max(0, this.stageSelectCursor - 1);
        if (input.keysJustPressed['ArrowRight']) this.stageSelectCursor = Math.min(tiles.length - 1, this.stageSelectCursor + 1);
        if (input.keysJustPressed['ArrowUp'])    this.stageSelectCursor = Math.max(0, this.stageSelectCursor - cols);
        if (input.keysJustPressed['ArrowDown'])  this.stageSelectCursor = Math.min(tiles.length - 1, this.stageSelectCursor + cols);
        if (input.pausePressed) {
            // Escape back to title
            this.screen = 'title';
            this.titleTimer = 0;
            return;
        }
        if (input.shoot || input.jumpPressed) {
            const tile = tiles[this.stageSelectCursor];
            if (tile.kind === 'back') {
                this.screen = 'title';
                this.titleTimer = 0;
            } else if (tile.kind === 'bossRush') {
                if (typeof audio !== 'undefined') audio.resume();
                this.startBossRush();
            } else {
                // Start a fresh run from the chosen stage
                if (typeof audio !== 'undefined') audio.resume();
                this.score = 0;
                this.lives = this.difficulty.livesStart;
                this.continues = this.difficulty.continuesStart;
                this.gameOver = false;
                this.paused = false;
                this.bossRushMode = false;
                this.loadStageByIndex(tile.index);
                this.player = new Player(50, 160);
                this.player.maxHealth = Math.floor(PLAYER.MAX_HEALTH * this.difficulty.healthMul);
                this.player.health = this.player.maxHealth;
                this.screen = 'stageIntro';
                this.stageIntroTimer = 0;
            }
        }
    }

    renderStageSelect() {
        const ctx = this.ctx;
        // Background
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Subtle moving stars
        ctx.fillStyle = '#3a2855';
        for (let i = 0; i < 30; i++) {
            const x = (i * 17 + this.stageSelectTimer) % GAME.WIDTH;
            const y = (i * 41 + this.stageSelectTimer * 2) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }

        drawPixelTextOutlined(ctx, 'STAGE SELECT', GAME.WIDTH / 2, 12, '#ffe070', '#a82020', 2, 'center', 1);

        const tiles = this.getStageSelectTiles();
        const cols = 4;
        const tileW = 56, tileH = 50;
        const gridW = cols * tileW + (cols - 1) * 6;
        const startX = (GAME.WIDTH - gridW) / 2;
        const startY = 38;

        for (let i = 0; i < tiles.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (tileW + 6);
            const y = startY + row * (tileH + 6);
            const t = tiles[i];
            const selected = i === this.stageSelectCursor;
            this.drawStageSelectTile(ctx, t, x, y, tileW, tileH, selected);
        }

        // Bottom hint
        drawPixelText(ctx, 'ARROWS  PICK    SHOOT  CONFIRM    ESC  BACK',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#a890c0', 1, 'center', 1);
    }

    drawStageSelectTile(ctx, tile, x, y, w, h, selected) {
        // Frame
        ctx.fillStyle = selected ? '#ffe070' : '#1a1140';
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(x, y, w, h);
        // Theme-colored backdrop (tiny preview)
        const themeColor = {
            jungle:    '#2d6a1e',
            breakroom: '#a87040',
            serverroom:'#202840',
            boardroom: '#5a2f1a',
            keynote:   '#7a1010',
            founder:   '#1a4a18'
        }[tile.theme] || '#3a2855';
        ctx.fillStyle = themeColor;
        ctx.fillRect(x + 2, y + 2, w - 4, h - 18);
        // Highlight strip
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 2, y + 2, w - 4, 2);

        // Tile-specific icon
        const cx = x + w / 2, cy = y + 18;
        if (tile.kind === 'stage') {
            // Stage number large
            drawPixelTextOutlined(ctx, String(tile.number), cx, y + 6, '#ffe070', '#a82020', 3, 'center', 1);
        } else if (tile.kind === 'bossRush') {
            drawPixelTextOutlined(ctx, 'B', cx, y + 6, '#ff60ff', '#3a0a3a', 3, 'center', 1);
        } else if (tile.kind === 'back') {
            // Arrow icon
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx - 6, cy - 2, 10, 4);
            ctx.fillRect(cx - 8, cy,     2, 1);
            ctx.fillRect(cx - 9, cy - 1, 2, 3);
        }

        // Bottom label strip
        ctx.fillStyle = selected ? '#3a2855' : '#0a0612';
        ctx.fillRect(x, y + h - 14, w, 14);
        ctx.fillStyle = selected ? '#564468' : '#1a1140';
        ctx.fillRect(x, y + h - 14, w, 1);

        // Short label (truncate long stage names)
        const label = tile.name.length > 11 ? tile.name.substring(0, 11) : tile.name;
        drawPixelText(ctx, label, cx, y + h - 12,
            selected ? '#ffe070' : '#c0a0d0', 1, 'center', 1);

        // Best time + score under the label, only for normal stage tiles
        if (tile.kind === 'stage' && tile.name !== '??') {
            const best = this.getStageBest(tile.index);
            if (best.time !== null) {
                const mm = Math.floor(best.time / 60);
                const ss = Math.floor(best.time % 60);
                const ts = `${mm}:${String(ss).padStart(2, '0')}`;
                drawPixelText(ctx, ts, cx, y + h - 4,
                    selected ? '#7af0ff' : '#5a7090', 1, 'center', 1);
            } else {
                drawPixelText(ctx, '- - -', cx, y + h - 4, '#3a2855', 1, 'center', 1);
            }
        }

        // Selected outline blink
        if (selected) {
            const blink = (Math.floor(this.stageSelectTimer / 12) & 1) === 0;
            if (blink) {
                ctx.fillStyle = '#ff5050';
                ctx.fillRect(x - 2, y - 2, w + 4, 1);
                ctx.fillRect(x - 2, y + h + 1, w + 4, 1);
                ctx.fillRect(x - 2, y - 2, 1, h + 4);
                ctx.fillRect(x + w + 1, y - 2, 1, h + 4);
            }
        }
    }

    updateAchievementsScreen() {
        this.achievementsTimer = (this.achievementsTimer || 0) + 1;
        input.update();
        const list = (typeof ACHIEVEMENT_LIST !== 'undefined') ? ACHIEVEMENT_LIST : [];
        const visible = 6;
        const maxScroll = Math.max(0, list.length - visible);
        if (input.keysJustPressed['ArrowUp'])   this.achievementsScroll = Math.max(0, (this.achievementsScroll || 0) - 1);
        if (input.keysJustPressed['ArrowDown']) this.achievementsScroll = Math.min(maxScroll, (this.achievementsScroll || 0) + 1);
        if (input.pausePressed || input.shoot || input.jumpPressed) {
            this.screen = 'title';
            this.titleTimer = 0;
        }
    }

    renderAchievementsScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Subtle sparkle
        ctx.fillStyle = '#2a1838';
        for (let i = 0; i < 18; i++) {
            const x = (i * 17 + this.achievementsTimer * 1) % GAME.WIDTH;
            const y = (i * 31) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }

        const list = (typeof ACHIEVEMENT_LIST !== 'undefined') ? ACHIEVEMENT_LIST : [];
        const unlockedCount = list.filter(a => achievements && achievements.has(a.id)).length;
        drawPixelTextOutlined(ctx, 'TROPHIES', GAME.WIDTH / 2, 8, '#ffe070', '#a82020', 2, 'center', 1);
        drawPixelText(ctx, unlockedCount + ' OF ' + list.length,
            GAME.WIDTH / 2, 26, '#a890c0', 1, 'center', 1);
        // Completion bar
        const pct = list.length > 0 ? unlockedCount / list.length : 0;
        ctx.fillStyle = '#000';
        ctx.fillRect(60, 34, GAME.WIDTH - 120, 6);
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(60, 34, GAME.WIDTH - 120, 6);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(61, 35, Math.floor((GAME.WIDTH - 122) * pct), 4);

        // Visible list (6 at a time, scrollable)
        const visible = 6;
        const scroll = this.achievementsScroll || 0;
        for (let i = 0; i < visible; i++) {
            const idx = scroll + i;
            if (idx >= list.length) break;
            const ach = list[idx];
            const got = achievements && achievements.has(ach.id);
            const y = 52 + i * 22;
            // Row background
            ctx.fillStyle = '#1a1140';
            ctx.fillRect(16, y, GAME.WIDTH - 32, 18);
            ctx.fillStyle = '#3a2855';
            ctx.fillRect(16, y, GAME.WIDTH - 32, 1);
            // Trophy icon
            const tx = 22, ty = y + 4;
            if (got) {
                ctx.fillStyle = '#ffd460';
                ctx.fillRect(tx, ty, 10, 10);
                ctx.fillStyle = '#a8780a';
                ctx.fillRect(tx, ty + 9, 10, 1);
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(tx + 1, ty + 1, 7, 1);
            } else {
                ctx.fillStyle = '#3a3050';
                ctx.fillRect(tx, ty, 10, 10);
                ctx.fillStyle = '#5a5070';
                ctx.fillRect(tx + 4, ty + 3, 2, 4);
                ctx.fillStyle = '#1a1140';
                ctx.fillRect(tx + 4, ty + 6, 2, 1);
            }
            // Name + description
            const nameColor = got ? '#ffe070' : '#7a6090';
            const descColor = got ? '#ffffff' : '#5a5070';
            drawPixelText(ctx, ach.name, 38, y + 3, nameColor, 1, 'left', 1);
            drawPixelText(ctx, got ? ach.desc : '? ? ? ? ?', 38, y + 11, descColor, 1, 'left', 1);
        }

        // Scroll indicators
        if (scroll > 0) {
            ctx.fillStyle = '#a890c0';
            ctx.fillRect(GAME.WIDTH - 12, 48, 5, 1);
            ctx.fillRect(GAME.WIDTH - 11, 47, 3, 1);
            ctx.fillRect(GAME.WIDTH - 10, 46, 1, 1);
        }
        if (scroll + visible < list.length) {
            ctx.fillStyle = '#a890c0';
            ctx.fillRect(GAME.WIDTH - 12, GAME.HEIGHT - 26, 5, 1);
            ctx.fillRect(GAME.WIDTH - 11, GAME.HEIGHT - 25, 3, 1);
            ctx.fillRect(GAME.WIDTH - 10, GAME.HEIGHT - 24, 1, 1);
        }

        // Hint
        drawPixelText(ctx, 'UP DOWN  SCROLL    SHOOT  BACK',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#a890c0', 1, 'center', 1);
    }

    // ---- Help / controls screen ----
    getHelpPages() {
        // Each page is { title, lines: [{label, value}], notes: [...] }
        return [
            {
                title: 'CONTROLS',
                lines: [
                    { label: 'MOVE',       value: 'ARROWS / WASD' },
                    { label: 'JUMP',       value: 'Z / SPACE' },
                    { label: 'SHOOT',      value: 'X / CTRL' },
                    { label: 'AIM LOCK',   value: 'HOLD SHIFT' },
                    { label: 'COVER',      value: 'C  (near doorway)' },
                    { label: 'PRONE',      value: 'DOWN x2' },
                    { label: 'PAUSE',      value: 'P / ESC' },
                    { label: 'MUTE',       value: 'M' }
                ],
                notes: [
                    'GAMEPAD AND TOUCH ARE AUTO-DETECTED.'
                ]
            },
            {
                title: 'WEAPONS',
                lines: [
                    { label: 'MACHINE GUN',    value: 'BASE - FAST AUTOFIRE' },
                    { label: 'SPREAD',         value: '5-SHOT FAN' },
                    { label: 'LASER',          value: 'PIERCES ENEMIES' },
                    { label: 'FLAME',          value: 'SHORT BUT RAPID' },
                    { label: 'STAPLE REMOVER', value: 'EXPLOSIVE AOE' }
                ],
                notes: [
                    'PICK UP NEW WEAPONS TO SWAP.',
                    'CURRENT WEAPON SHOWS IN HUD.'
                ]
            },
            {
                title: 'TIPS',
                lines: [
                    { label: 'COVER',  value: 'HIDE TO REGEN HP' },
                    { label: 'JUMP',   value: 'HOLD FOR HIGHER ARC' },
                    { label: 'WALL',   value: 'WALL JUMP IN CHASMS' },
                    { label: 'COMBO',  value: 'CHAIN KILLS FOR x5' },
                    { label: 'SECRET', value: 'SOME ROOMS ARE HIDDEN' },
                    { label: 'KONAMI', value: 'UP UP DN DN L R L R Z X' }
                ],
                notes: [
                    'BOSSES TELEGRAPH ATTACKS - WATCH FOR FLASHES.',
                    'THE BOARD WANTS YOU GONE. PROVE THEM WRONG.'
                ]
            }
        ];
    }

    updateHelpScreen() {
        this.helpTimer = (this.helpTimer || 0) + 1;
        input.update();
        const pages = this.getHelpPages();
        if (this.helpPage === undefined) this.helpPage = 0;
        if (input.keysJustPressed['ArrowLeft'])  this.helpPage = (this.helpPage + pages.length - 1) % pages.length;
        if (input.keysJustPressed['ArrowRight']) this.helpPage = (this.helpPage + 1) % pages.length;
        if (input.pausePressed || input.shoot || input.jumpPressed) {
            this.screen = 'title';
            this.titleTimer = 0;
        }
    }

    renderHelpScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Background sparkle
        ctx.fillStyle = '#2a1838';
        for (let i = 0; i < 18; i++) {
            const x = (i * 17 + this.helpTimer * 1) % GAME.WIDTH;
            const y = (i * 31) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }

        const pages = this.getHelpPages();
        const page = pages[this.helpPage];

        // Page title
        drawPixelTextOutlined(ctx, page.title, GAME.WIDTH / 2, 10, '#ffe070', '#a82020', 2, 'center', 1);

        // Page tabs (small dots showing which of N pages we're on)
        for (let i = 0; i < pages.length; i++) {
            const dx = GAME.WIDTH / 2 - (pages.length * 8) / 2 + i * 8;
            ctx.fillStyle = i === this.helpPage ? '#ffe070' : '#3a2855';
            ctx.fillRect(dx, 28, 5, 2);
        }

        // Two-column key/value listing
        const startY = 44;
        const rowH = 12;
        const labelX = 24;
        const valueX = GAME.WIDTH - 24;
        for (let i = 0; i < page.lines.length; i++) {
            const r = page.lines[i];
            const y = startY + i * rowH;
            drawPixelText(ctx, r.label, labelX, y, '#ffe070', 1, 'left', 1);
            drawPixelText(ctx, r.value, valueX, y, '#ffffff', 1, 'right', 1);
            // Divider
            ctx.fillStyle = '#1a1140';
            ctx.fillRect(labelX, y + 8, GAME.WIDTH - labelX * 2, 1);
        }

        // Notes block
        if (page.notes && page.notes.length > 0) {
            const ny = startY + page.lines.length * rowH + 4;
            for (let i = 0; i < page.notes.length; i++) {
                drawPixelText(ctx, page.notes[i], GAME.WIDTH / 2, ny + i * 10,
                    '#a890c0', 1, 'center', 1);
            }
        }

        // Footer hints
        drawPixelText(ctx, 'LEFT RIGHT  PAGES    SHOOT  BACK',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#7a6090', 1, 'center', 1);
    }

    // ---- Skin select screen ----
    updateSkinsScreen() {
        this.skinsTimer = (this.skinsTimer || 0) + 1;
        input.update();
        const all = SKINS;
        if (input.keysJustPressed['ArrowLeft'])  this.skinsCursor = (this.skinsCursor + all.length - 1) % all.length;
        if (input.keysJustPressed['ArrowRight']) this.skinsCursor = (this.skinsCursor + 1) % all.length;
        if (input.shootPressed) {
            // Confirm - only equip if unlocked
            const target = all[this.skinsCursor];
            const ctxObj = { game: this, achievements: typeof achievements !== 'undefined' ? achievements : null };
            if (target && target.unlock(ctxObj)) {
                this.skinId = target.id;
                try { localStorage.setItem('clippy_first_blood_skin', target.id); } catch (e) {}
            }
        }
        if (input.pausePressed || input.jumpPressed) {
            this.screen = 'title';
            this.titleTimer = 0;
        }
    }

    renderSkinsScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Background sparkle
        ctx.fillStyle = '#2a1838';
        for (let i = 0; i < 18; i++) {
            const x = (i * 17 + this.skinsTimer * 1) % GAME.WIDTH;
            const y = (i * 31) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }

        drawPixelTextOutlined(ctx, 'CHOOSE YOUR SKIN', GAME.WIDTH / 2, 8, '#ffe070', '#a82020', 2, 'center', 1);

        const all = SKINS;
        const ctxObj = { game: this, achievements: typeof achievements !== 'undefined' ? achievements : null };
        const skin = all[this.skinsCursor];
        const unlocked = skin.unlock(ctxObj);
        const equipped = skin.id === this.skinId;

        // Big Clippy preview in the center
        const previewX = GAME.WIDTH / 2 - 24;
        const previewY = 36;
        // Frame
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(previewX - 4, previewY - 4, 56, 64);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(previewX - 2, previewY - 2, 52, 60);
        ctx.fillStyle = '#564468';
        ctx.fillRect(previewX - 2, previewY - 2, 52, 2);
        // Floor line
        ctx.fillStyle = '#a8a8c0';
        ctx.fillRect(previewX - 2, previewY + 52, 52, 2);
        // Draw the Clippy in the preview using the chosen skin
        if (typeof proceduralSprites !== 'undefined') {
            const frame = Math.floor(this.skinsTimer / 12) & 1;
            // Use a still IDLE pose for the preview
            const usePng = !skin.palette && spriteAtlas.frames.has(
                proceduralSprites.getClippyFrameName(PLAYER_STATE.IDLE, frame, 0));
            if (skin.filter && usePng) {
                ctx.save();
                ctx.filter = skin.filter;
            }
            proceduralSprites.drawClippy(ctx, previewX, previewY, PLAYER_STATE.IDLE,
                frame, true, 0, skin.palette);
            if (skin.filter && usePng) ctx.restore();
            // Lock overlay
            if (!unlocked) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(previewX - 2, previewY - 2, 52, 60);
                drawPixelTextOutlined(ctx, 'LOCKED', previewX + 24, previewY + 22,
                    '#ff5050', '#1a0000', 2, 'center', 1);
            }
        }

        // Name + description
        const ny = 112;
        drawPixelTextOutlined(ctx, skin.name, GAME.WIDTH / 2, ny, unlocked ? '#ffe070' : '#7a6090', '#1a0e1e', 2, 'center', 1);
        drawPixelText(ctx, skin.desc, GAME.WIDTH / 2, ny + 22, unlocked ? '#c0a0d0' : '#5a5070', 1, 'center', 1);

        // Equipped indicator
        if (equipped) {
            drawPixelTextOutlined(ctx, 'EQUIPPED', GAME.WIDTH / 2, ny + 38, '#50ff70', '#0a3a14', 1, 'center', 1);
        } else if (unlocked) {
            const blink = (this.skinsTimer & 16) < 8;
            if (blink) drawPixelText(ctx, 'SHOOT TO EQUIP', GAME.WIDTH / 2, ny + 38, '#ffffff', 1, 'center', 1);
        }

        // Thumbnail row at the bottom
        const thumbY = GAME.HEIGHT - 38;
        const thumbW = 18;
        const totalW = all.length * (thumbW + 4);
        const startX = (GAME.WIDTH - totalW) / 2;
        for (let i = 0; i < all.length; i++) {
            const tx = startX + i * (thumbW + 4);
            const s = all[i];
            const isSelected = i === this.skinsCursor;
            const isUnlocked = s.unlock(ctxObj);
            ctx.fillStyle = isSelected ? '#ffe070' : '#3a2855';
            ctx.fillRect(tx - 1, thumbY - 1, thumbW + 2, thumbW + 2);
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(tx, thumbY, thumbW, thumbW);
            if (isUnlocked) {
                // Tiny color swatch using the bandana color from the skin
                const swatch = s.palette ? s.palette[13] : '#ff6b6b';
                ctx.fillStyle = swatch || '#ff6b6b';
                ctx.fillRect(tx + 3, thumbY + 3, thumbW - 6, thumbW - 6);
                if (s.id === this.skinId) {
                    ctx.fillStyle = '#50ff70';
                    ctx.fillRect(tx + thumbW - 5, thumbY + 1, 4, 4);
                }
            } else {
                // Lock dot
                ctx.fillStyle = '#5a5070';
                ctx.fillRect(tx + 7, thumbY + 6, 4, 4);
                ctx.fillRect(tx + 8, thumbY + 4, 2, 2);
            }
        }

        // Hints
        drawPixelText(ctx, 'LEFT RIGHT  PICK    SHOOT  EQUIP    ESC  BACK',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#7a6090', 1, 'center', 1);
    }

    // ---- Main menu (consolidated entry point) ----
    getMenuItems() {
        // Build the list of items the player can choose from. Items that
        // are conditional get filtered out.
        const items = [
            { label: 'START GAME',       run: () => { this.resetRunFlags(); this.newGamePlus = false; this.screen = 'story'; this.storyTimer = 0; this.storyPanel = 0; this.score = 0; this.lives = this.difficulty.livesStart; this.continues = this.difficulty.continuesStart; this.loadStageByIndex(0); this.player = new Player(50, 160); if (typeof audio !== 'undefined') audio.resume(); } },
            { label: 'DAILY CHALLENGE',  run: () => { this.screen = 'daily'; this.dailyTimer = 0; } }
        ];
        if (this.bossRushUnlocked) {
            items.push({ label: 'STAGE SELECT', run: () => { this.screen = 'stageSelect'; this.stageSelectTimer = 0; this.stageSelectCursor = 0; } });
        }
        items.push({ label: 'SKINS',         run: () => { this.screen = 'skins'; this.skinsTimer = 0; const all = SKINS; this.skinsCursor = Math.max(0, all.findIndex(s => s.id === this.skinId)); } });
        items.push({ label: 'TROPHIES',      run: () => { this.screen = 'achievements'; this.achievementsTimer = 0; this.achievementsScroll = 0; } });
        items.push({ label: 'LEADERBOARD',   run: () => { this.screen = 'leaderboard'; this.leaderboardTimer = 0; } });
        items.push({ label: 'PASSWORD',      run: () => { this.screen = 'password'; this.passwordTimer = 0; this.passwordMode = 'view'; this.passwordInput = ''; this.passwordMessage = ''; } });
        items.push({ label: 'EXPORT MIDI',    run: () => { this.screen = 'midi'; this.midiTimer = 0; this.midiCursor = 0; this.midiMessage = ''; } });
        items.push({ label: 'KEY BINDINGS',   run: () => { this.screen = 'rebind'; this.rebindTimer = 0; this.rebindCursor = 0; this.rebindWaiting = false; } });
        items.push({
            label: 'LOAD MOD' + (typeof Mods !== 'undefined' && Mods.hasMods() ? '   (' + Mods.loaded.length + ' LOADED)' : ''),
            run: () => {
                if (typeof Mods === 'undefined') return;
                Mods.pickFile((mod, err) => {
                    if (mod) {
                        this.menuMessage = 'LOADED ' + mod.name;
                        this.menuMessageTimer = 180;
                    } else {
                        this.menuMessage = 'LOAD FAILED: ' + (err || 'BAD FORMAT');
                        this.menuMessageTimer = 180;
                    }
                });
            }
        });
        if (typeof Mods !== 'undefined' && Mods.hasMods()) {
            items.push({ label: 'PLAY MOD STAGE', run: () => { this.screen = 'modStages'; this.modStagesTimer = 0; this.modStagesCursor = 0; } });
        }
        items.push({ label: 'HELP',          run: () => { this.screen = 'help'; this.helpTimer = 0; this.helpPage = 0; } });
        // Difficulty + co-op + NG+ inline toggles
        items.push({
            label: 'DIFFICULTY  <  ' + this.difficulty.name + '  >',
            color: this.difficulty.color,
            run: () => { this.setDifficulty(this.difficultyIndex + 1); }
        });
        items.push({
            label: 'CO-OP  ' + (this.coopEnabled ? 'ON' : 'OFF'),
            color: this.coopEnabled ? '#ff60ff' : null,
            run: () => { this.coopEnabled = !this.coopEnabled; }
        });
        if (this.bossRushUnlocked) {
            items.push({
                label: 'NEW GAME+  ' + (this.newGamePlus ? 'ON' : 'OFF'),
                color: this.newGamePlus ? '#ff60ff' : null,
                run: () => { this.toggleNewGamePlus(); }
            });
        }
        items.push({ label: 'BACK TO TITLE', run: () => { this.screen = 'title'; this.titleTimer = 0; } });
        return items;
    }

    updateMenuScreen() {
        this.menuTimer = (this.menuTimer || 0) + 1;
        input.update();
        const items = this.getMenuItems();
        if (input.keysJustPressed['ArrowUp'])    this.menuCursor = (this.menuCursor + items.length - 1) % items.length;
        if (input.keysJustPressed['ArrowDown'])  this.menuCursor = (this.menuCursor + 1) % items.length;
        if (input.pausePressed) {
            this.screen = 'title';
            this.titleTimer = 0;
            return;
        }
        if (input.shootPressed || input.jumpPressed || input.keysJustPressed['Enter']) {
            const item = items[this.menuCursor];
            if (item && item.run) item.run();
        }
    }

    renderMenuScreen() {
        const ctx = this.ctx;
        // Reuse the title parallax behind a dim overlay
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        this.background.update();
        this.background.draw(ctx, { x: 0, y: 0 });
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        drawPixelTextOutlined(ctx, 'MAIN MENU', GAME.WIDTH / 2, 16, '#ffe070', '#a82020', 2, 'center', 1);

        const items = this.getMenuItems();
        const startY = 44;
        const rowH = 14;
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const y = startY + i * rowH;
            const sel = i === this.menuCursor;
            // Selection bar
            if (sel) {
                ctx.fillStyle = 'rgba(86,68,104,0.55)';
                ctx.fillRect(28, y - 3, GAME.WIDTH - 56, 10);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(28, y - 3, GAME.WIDTH - 56, 1);
                ctx.fillRect(28, y + 6, GAME.WIDTH - 56, 1);
                // Blinking arrow
                const blink = (this.menuTimer & 16) < 8;
                if (blink) {
                    ctx.fillStyle = '#ffe070';
                    ctx.fillRect(38, y + 1, 4, 1);
                    ctx.fillRect(39, y, 3, 1);
                    ctx.fillRect(40, y + 2, 2, 1);
                }
            }
            const color = sel ? (it.color || '#ffffff') : (it.color || '#c0a0d0');
            drawPixelText(ctx, it.label, GAME.WIDTH / 2, y, color, 1, 'center', 1);
        }

        drawPixelText(ctx, 'UP DOWN  PICK    SHOOT  CONFIRM    ESC  BACK',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#7a6090', 1, 'center', 1);

        if (this.menuMessage && this.menuMessageTimer > 0) {
            drawPixelTextOutlined(ctx, this.menuMessage,
                GAME.WIDTH / 2, GAME.HEIGHT - 24, '#50ff70', '#0a3a14', 1, 'center', 1);
            this.menuMessageTimer--;
        }
    }

    // ---- Keybind remap screen ----
    getRebindActions() {
        return [
            { id: 'left',    label: 'MOVE LEFT' },
            { id: 'right',   label: 'MOVE RIGHT' },
            { id: 'up',      label: 'AIM UP / CLIMB' },
            { id: 'down',    label: 'AIM DOWN / CROUCH' },
            { id: 'jump',    label: 'JUMP' },
            { id: 'shoot',   label: 'SHOOT' },
            { id: 'lockAim', label: 'AIM LOCK' },
            { id: 'cover',   label: 'TAKE COVER' },
            { id: 'pause',   label: 'PAUSE' }
        ];
    }

    // Pretty-print a KeyboardEvent.code (e.g. 'KeyA' -> 'A', 'ArrowUp' -> 'UP')
    prettyKey(code) {
        if (!code) return '-';
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
        if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
        if (code === 'Space') return 'SPACE';
        if (code === 'ControlLeft')  return 'LCTRL';
        if (code === 'ControlRight') return 'RCTRL';
        if (code === 'ShiftLeft')    return 'LSHIFT';
        if (code === 'ShiftRight')   return 'RSHIFT';
        if (code === 'Escape')       return 'ESC';
        if (code === 'Enter')        return 'ENTER';
        if (code === 'Backspace')    return 'BACK';
        return code.toUpperCase();
    }

    updateRebindScreen() {
        this.rebindTimer = (this.rebindTimer || 0) + 1;
        input.update();
        const actions = this.getRebindActions();

        // If we're waiting for a key to be pressed, the capture callback
        // handles it - we just sit until it returns.
        if (this.rebindWaiting) {
            // ESC cancels the capture (works because Escape goes through
            // the key capture, which then completes the binding).
            return;
        }
        if (input.keysJustPressed['ArrowUp'])   this.rebindCursor = (this.rebindCursor + actions.length - 1) % actions.length;
        if (input.keysJustPressed['ArrowDown']) this.rebindCursor = (this.rebindCursor + 1) % actions.length;
        // R resets all bindings to defaults
        if (input.keysJustPressed['KeyR']) {
            input.resetBindings();
            this.rebindMessage = 'BINDINGS RESET';
            this.rebindMessageTimer = 120;
        }
        if (input.pausePressed) {
            this.screen = 'menu';
            this.menuTimer = 0;
            return;
        }
        if (input.shoot || input.jumpPressed) {
            // Start capture: next physical key sets the binding.
            this.rebindWaiting = true;
            const action = actions[this.rebindCursor];
            input.captureNext = (code) => {
                // ESC cancels without rebinding
                if (code === 'Escape') {
                    this.rebindWaiting = false;
                    return;
                }
                input.setBinding(action.id, code);
                this.rebindWaiting = false;
                this.rebindMessage = `${action.label}  ->  ${this.prettyKey(code)}`;
                this.rebindMessageTimer = 120;
            };
        }
        if (this.rebindMessageTimer && this.rebindMessageTimer > 0) this.rebindMessageTimer--;
    }

    renderRebindScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        ctx.fillStyle = '#2a1838';
        for (let i = 0; i < 16; i++) {
            const x = (i * 17 + this.rebindTimer) % GAME.WIDTH;
            const y = (i * 31) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }
        drawPixelTextOutlined(ctx, 'KEY BINDINGS', GAME.WIDTH / 2, 8, '#ffe070', '#a82020', 2, 'center', 1);

        const actions = this.getRebindActions();
        const startY = 36;
        const rowH = 14;
        for (let i = 0; i < actions.length; i++) {
            const a = actions[i];
            const sel = i === this.rebindCursor;
            const y = startY + i * rowH;
            if (sel) {
                ctx.fillStyle = 'rgba(86,68,104,0.55)';
                ctx.fillRect(20, y - 3, GAME.WIDTH - 40, 11);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(20, y - 3, GAME.WIDTH - 40, 1);
                ctx.fillRect(20, y + 7, GAME.WIDTH - 40, 1);
            }
            drawPixelText(ctx, a.label, 30, y,
                sel ? '#ffffff' : '#c0a0d0', 1, 'left', 1);
            // Current primary binding
            const code = input.bindings[a.id] && input.bindings[a.id][0];
            drawPixelText(ctx, this.prettyKey(code),
                GAME.WIDTH - 30, y, sel ? '#ffe070' : '#7af0ff', 1, 'right', 1);
        }

        // Capture banner
        if (this.rebindWaiting) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, GAME.HEIGHT / 2 - 16, GAME.WIDTH, 32);
            const blink = (this.rebindTimer & 16) < 8;
            if (blink) {
                drawPixelTextOutlined(ctx, 'PRESS A KEY...', GAME.WIDTH / 2, GAME.HEIGHT / 2 - 8,
                    '#ffe070', '#a82020', 2, 'center', 1);
            }
        }
        if (this.rebindMessage && this.rebindMessageTimer > 0) {
            drawPixelTextOutlined(ctx, this.rebindMessage,
                GAME.WIDTH / 2, GAME.HEIGHT - 28, '#50ff70', '#0a3a14', 1, 'center', 1);
        }

        drawPixelText(ctx, 'UP DOWN  PICK    SHOOT  REBIND    R  RESET    ESC  BACK',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#7a6090', 1, 'center', 1);
    }

    // ---- Mod stage picker ----
    updateModStagesScreen() {
        this.modStagesTimer = (this.modStagesTimer || 0) + 1;
        input.update();
        if (typeof Mods === 'undefined') { this.screen = 'menu'; return; }
        const list = Mods.allStages();
        if (list.length === 0) { this.screen = 'menu'; return; }
        if (input.keysJustPressed['ArrowUp'])   this.modStagesCursor = (this.modStagesCursor + list.length - 1) % list.length;
        if (input.keysJustPressed['ArrowDown']) this.modStagesCursor = (this.modStagesCursor + 1) % list.length;
        if (input.pausePressed) {
            this.screen = 'menu';
            this.menuTimer = 0;
            return;
        }
        if (input.shoot || input.jumpPressed) {
            const pick = list[this.modStagesCursor];
            this.startModStage(pick.stage);
        }
    }

    renderModStagesScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        drawPixelTextOutlined(ctx, 'MOD STAGES', GAME.WIDTH / 2, 8, '#ffe070', '#a82020', 2, 'center', 1);
        if (typeof Mods === 'undefined') return;
        const list = Mods.allStages();
        const startY = 36;
        for (let i = 0; i < Math.min(10, list.length); i++) {
            const it = list[i];
            const y = startY + i * 14;
            const sel = i === this.modStagesCursor;
            if (sel) {
                ctx.fillStyle = 'rgba(86,68,104,0.55)';
                ctx.fillRect(20, y - 3, GAME.WIDTH - 40, 11);
            }
            drawPixelText(ctx, it.mod, 28, y, '#a890c0', 1, 'left', 1);
            drawPixelText(ctx, it.stage.name, GAME.WIDTH - 28, y,
                sel ? '#ffe070' : '#ffffff', 1, 'right', 1);
        }
        drawPixelText(ctx, 'UP DOWN  PICK    SHOOT  PLAY    ESC  BACK',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#7a6090', 1, 'center', 1);
    }

    // Run a mod stage as a one-off free-play
    startModStage(modStage) {
        if (typeof audio !== 'undefined') audio.resume();
        this.resetRunFlags();
        this.newGamePlus = false;
        this.score = 0;
        this.lives = this.difficulty.livesStart;
        this.continues = this.difficulty.continuesStart;
        this.gameOver = false;
        this.paused = false;
        this.level = this.level || new Level();
        this.level.loadModStage(modStage);
        this.background.setTheme(modStage.theme);
        this.background.init(modStage.theme);

        this.enemies = new EnemyManager();
        this.level.spawnPoints.forEach(s => this.enemies.spawn(s.x, s.y, s.type));
        if (typeof pickupManager !== 'undefined') pickupManager.loadFromLevel(this.level);

        this.bossWarning = 0;
        this.bossWarningShown = false;
        this.bossIntroActive = false;
        this.bossIntroTimer = 0;
        this.bossIntroEnemy = null;
        this.pickupFlashTimer = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.camera.x = 0; this.camera.y = 0;
        this.camera.shakeAmount = 0; this.camera.shakeTimer = 0;
        if (typeof particles !== 'undefined') particles.clear();

        this.player = new Player(50, 160);
        this.stageName = modStage.name;
        this.stageNumber = 'M';
        this.stageIndex = -1;
        this.screen = 'stageIntro';
        this.stageIntroTimer = 0;
    }

    // ---- MIDI export screen ----
    getMidiThemes() {
        return [
            { id: 'jungle',     label: 'STAGE 1 - OFFICE JUNGLE' },
            { id: 'breakroom',  label: 'STAGE 2 - BREAK ROOM' },
            { id: 'serverroom', label: 'STAGE 3 - SERVER FARM' },
            { id: 'boardroom',  label: 'STAGE 4 - BOARDROOM' },
            { id: 'keynote',    label: 'STAGE 5 - THE KEYNOTE' },
            { id: 'founder',    label: 'STAGE 6 - THE FOUNDER' },
            { id: 'cloud',      label: 'STAGE 8 - THE CLOUD' }
        ];
    }

    updateMidiScreen() {
        this.midiTimer = (this.midiTimer || 0) + 1;
        input.update();
        const themes = this.getMidiThemes();
        if (input.keysJustPressed['ArrowUp'])   this.midiCursor = (this.midiCursor + themes.length - 1) % themes.length;
        if (input.keysJustPressed['ArrowDown']) this.midiCursor = (this.midiCursor + 1) % themes.length;
        if (input.pausePressed) {
            this.screen = 'menu';
            this.menuTimer = 0;
            return;
        }
        if (input.shootPressed || input.jumpPressed) {
            const t = themes[this.midiCursor];
            if (typeof MIDI !== 'undefined' && typeof audio !== 'undefined') {
                const ok = MIDI.exportTheme(audio, t.id);
                this.midiMessage = ok ? `SAVED clippy-${t.id}.mid` : 'EXPORT FAILED';
                this.midiMessageTimer = 120;
            }
        }
        if (this.midiMessageTimer && this.midiMessageTimer > 0) this.midiMessageTimer--;
    }

    renderMidiScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        ctx.fillStyle = '#2a1838';
        for (let i = 0; i < 16; i++) {
            const x = (i * 17 + this.midiTimer) % GAME.WIDTH;
            const y = (i * 31) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }
        drawPixelTextOutlined(ctx, 'EXPORT MIDI', GAME.WIDTH / 2, 8, '#ffe070', '#a82020', 2, 'center', 1);
        drawPixelText(ctx, 'PICK A THEME AND SHOOT TO DOWNLOAD',
            GAME.WIDTH / 2, 30, '#a890c0', 1, 'center', 1);

        const themes = this.getMidiThemes();
        const startY = 52;
        for (let i = 0; i < themes.length; i++) {
            const sel = i === this.midiCursor;
            const y = startY + i * 16;
            if (sel) {
                ctx.fillStyle = 'rgba(86,68,104,0.55)';
                ctx.fillRect(28, y - 3, GAME.WIDTH - 56, 12);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(28, y - 3, GAME.WIDTH - 56, 1);
                ctx.fillRect(28, y + 8, GAME.WIDTH - 56, 1);
            }
            drawPixelText(ctx, themes[i].label, GAME.WIDTH / 2, y,
                sel ? '#ffffff' : '#c0a0d0', 1, 'center', 1);
        }
        if (this.midiMessage && this.midiMessageTimer > 0) {
            drawPixelTextOutlined(ctx, this.midiMessage,
                GAME.WIDTH / 2, GAME.HEIGHT - 28, '#50ff70', '#0a3a14', 1, 'center', 1);
        }
        drawPixelText(ctx, 'UP DOWN  PICK    SHOOT  SAVE .MID    ESC  BACK',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#7a6090', 1, 'center', 1);
    }

    // ---- Daily challenge ----
    startDailyChallenge() {
        const dateStr = dailyDateString();
        const mod = dailyModifierFor(dateStr);
        // Reset all per-run flags (including any leftover boss-rush mode)
        // before applying today's daily modifier.
        this.resetRunFlags();
        this.dailyMode = true;
        this.dailyDateString = dateStr;
        this.dailyModifier = mod;
        if (mod && mod.apply) mod.apply(this);
        // Daily challenge is always Stage 1 only - the modifier provides
        // the variety. Score is the only currency.
        this.score = 0;
        this.lives = this.difficulty.livesStart;
        this.continues = this.difficulty.continuesStart;
        this.gameOver = false;
        this.paused = false;
        this.bossRushMode = false;
        this.newGamePlus = false;
        this.loadStageByIndex(0);
        // Apply Daily HP buff after creating the player
        this.player = new Player(50, 160);
        this.player.maxHealth = Math.floor((this.player.maxHealth || PLAYER.MAX_HEALTH) * this.dailyHpMul);
        this.player.health = this.player.maxHealth;
        this.screen = 'stageIntro';
        this.stageIntroTimer = 0;
        if (typeof audio !== 'undefined') audio.resume();
    }

    updateDailyScreen() {
        this.dailyTimer = (this.dailyTimer || 0) + 1;
        input.update();
        if (input.pausePressed) {
            this.screen = 'title';
            this.titleTimer = 0;
            return;
        }
        if (input.shootPressed || input.jumpPressed) {
            this.startDailyChallenge();
        }
    }

    renderDailyScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        ctx.fillStyle = '#2a1838';
        for (let i = 0; i < 18; i++) {
            const x = (i * 17 + this.dailyTimer * 1) % GAME.WIDTH;
            const y = (i * 31) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }
        drawPixelTextOutlined(ctx, 'DAILY CHALLENGE', GAME.WIDTH / 2, 8, '#ffe070', '#a82020', 2, 'center', 1);

        const dateStr = dailyDateString();
        const mod = dailyModifierFor(dateStr);
        drawPixelText(ctx, dateStr, GAME.WIDTH / 2, 32, '#a890c0', 1, 'center', 1);

        // Modifier banner
        const banY = 50;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(20, banY - 2, GAME.WIDTH - 40, 36);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(22, banY, GAME.WIDTH - 44, 32);
        ctx.fillStyle = '#564468';
        ctx.fillRect(22, banY, GAME.WIDTH - 44, 1);

        drawPixelText(ctx, 'TODAY\'S MODIFIER', GAME.WIDTH / 2, banY + 4, '#a890c0', 1, 'center', 1);
        drawPixelTextOutlined(ctx, mod.name, GAME.WIDTH / 2, banY + 14, '#ffe070', '#a82020', 1, 'center', 1);
        drawPixelText(ctx, mod.desc, GAME.WIDTH / 2, banY + 24, '#c0a0d0', 1, 'center', 1);

        // Best score for today
        const best = dailyBestScore(dateStr);
        drawPixelText(ctx, 'TODAY BEST', GAME.WIDTH / 2 - 30, 110, '#a890c0', 1, 'right', 1);
        drawPixelTextOutlined(ctx, String(best).padStart(6, '0'),
            GAME.WIDTH / 2 + 30, 110, best > 0 ? '#50ff70' : '#7a6090', '#0a0612', 1, 'left', 1);

        // Rules note
        drawPixelText(ctx, 'STAGE 1 ONLY - SCORE IS THE PRIZE', GAME.WIDTH / 2, 132, '#7a6090', 1, 'center', 1);
        drawPixelText(ctx, 'CHECK BACK TOMORROW FOR A NEW SEED', GAME.WIDTH / 2, 144, '#5a5070', 1, 'center', 1);

        const blink = (this.dailyTimer & 16) < 8;
        if (blink) {
            drawPixelTextOutlined(ctx, 'SHOOT TO START', GAME.WIDTH / 2, 180, '#ffffff', '#000000', 1, 'center', 1);
        }
        drawPixelText(ctx, 'ESC  BACK TO TITLE',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#7a6090', 1, 'center', 1);
    }

    // ---- Password screen ----
    updatePasswordScreen() {
        this.passwordTimer = (this.passwordTimer || 0) + 1;
        input.update();
        if (input.pausePressed) {
            this.screen = 'title';
            this.titleTimer = 0;
            return;
        }
        // Tab swap between VIEW / ENTER modes
        if (input.keysJustPressed['ArrowLeft'] || input.keysJustPressed['ArrowRight']) {
            this.passwordMode = this.passwordMode === 'view' ? 'enter' : 'view';
            this.passwordMessage = '';
            this.passwordInput = '';
        }
        if (this.passwordMode === 'enter') {
            // Typed input - accept base32 chars (A-Z 2-7), Backspace, Enter
            const acceptKey = (code) => {
                if (code.startsWith('Key')) {
                    const c = code.charAt(3);
                    return /[A-Z]/.test(c) ? c : null;
                }
                if (code.startsWith('Digit')) {
                    const d = code.charAt(5);
                    return /[2-7]/.test(d) ? d : null;
                }
                return null;
            };
            for (const code in input.keysJustPressed) {
                if (!input.keysJustPressed[code]) continue;
                const ch = acceptKey(code);
                if (ch && this.passwordInput.replace(/-/g, '').length < 16) {
                    this.passwordInput += ch;
                    // Auto-insert dashes every 4 chars for readability
                    const stripped = this.passwordInput.replace(/-/g, '');
                    const grouped = [];
                    for (let i = 0; i < stripped.length; i += 4) {
                        grouped.push(stripped.slice(i, i + 4));
                    }
                    this.passwordInput = grouped.join('-');
                }
                if (code === 'Backspace') {
                    this.passwordInput = this.passwordInput.replace(/-/g, '').slice(0, -1);
                    const stripped = this.passwordInput;
                    const grouped = [];
                    for (let i = 0; i < stripped.length; i += 4) grouped.push(stripped.slice(i, i + 4));
                    this.passwordInput = grouped.join('-');
                }
                if (code === 'Enter') {
                    const payload = pwdDecode(this.passwordInput);
                    if (payload) {
                        pwdApply(this, payload);
                        this.passwordMessage = 'APPLIED!';
                        this.loadHighScore();    // refresh in-memory fields
                    } else {
                        this.passwordMessage = 'INVALID PASSWORD';
                    }
                }
            }
        }
    }

    renderPasswordScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Sparkle background
        ctx.fillStyle = '#2a1838';
        for (let i = 0; i < 16; i++) {
            const x = (i * 17 + this.passwordTimer) % GAME.WIDTH;
            const y = (i * 31) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }

        drawPixelTextOutlined(ctx, 'PASSWORD', GAME.WIDTH / 2, 8, '#ffe070', '#a82020', 2, 'center', 1);

        // Tabs
        const tabs = ['VIEW', 'ENTER'];
        for (let i = 0; i < tabs.length; i++) {
            const tx = GAME.WIDTH / 2 - 70 + i * 70;
            const sel = (i === 0 && this.passwordMode === 'view') ||
                        (i === 1 && this.passwordMode === 'enter');
            ctx.fillStyle = sel ? '#ffe070' : '#1a1140';
            ctx.fillRect(tx, 30, 60, 11);
            drawPixelText(ctx, tabs[i], tx + 30, 32,
                sel ? '#1a0e1e' : '#a890c0', 1, 'center', 1);
        }

        if (this.passwordMode === 'view') {
            // Show current password
            const bytes = pwdMakePayload(this, typeof achievements !== 'undefined' ? achievements : null);
            const code = pwdEncodeForDisplay(bytes);
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(20, 70, GAME.WIDTH - 40, 30);
            ctx.fillStyle = '#3a2855';
            ctx.fillRect(22, 72, GAME.WIDTH - 44, 26);
            drawPixelTextOutlined(ctx, code, GAME.WIDTH / 2, 80,
                '#ffe070', '#1a0e1e', 1, 'center', 1);
            drawPixelText(ctx, 'YOUR PROGRESS - WRITE IT DOWN', GAME.WIDTH / 2, 110, '#a890c0', 1, 'center', 1);
            drawPixelText(ctx, 'LR  ENTER A PASSWORD INSTEAD', GAME.WIDTH / 2, 130, '#7a6090', 1, 'center', 1);
        } else {
            // Input field
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(20, 70, GAME.WIDTH - 40, 30);
            ctx.fillStyle = '#3a2855';
            ctx.fillRect(22, 72, GAME.WIDTH - 44, 26);
            const display = this.passwordInput || '_';
            const blink = (this.passwordTimer & 16) < 8;
            const text = blink ? (this.passwordInput + (this.passwordInput.replace(/-/g, '').length < 16 ? '_' : '')) : this.passwordInput;
            drawPixelText(ctx, text || '_', GAME.WIDTH / 2, 80, '#ffe070', 1, 'center', 1);
            drawPixelText(ctx, 'TYPE PASSWORD - ENTER TO APPLY', GAME.WIDTH / 2, 110, '#a890c0', 1, 'center', 1);
            drawPixelText(ctx, 'BACKSPACE TO DELETE', GAME.WIDTH / 2, 122, '#7a6090', 1, 'center', 1);
            if (this.passwordMessage) {
                const c = this.passwordMessage === 'APPLIED!' ? '#50ff70' : '#ff5050';
                drawPixelTextOutlined(ctx, this.passwordMessage, GAME.WIDTH / 2, 142, c, '#1a0000', 1, 'center', 1);
            }
        }

        drawPixelText(ctx, 'ESC  BACK TO TITLE',
            GAME.WIDTH / 2, GAME.HEIGHT - 10, '#7a6090', 1, 'center', 1);
    }

    beginCutscene(panels) {
        this.screen = 'cutscene';
        this.cutsceneActive = panels;
        this.cutsceneIndex = 0;
        this.cutsceneTimer = 0;
        if (typeof audio !== 'undefined') audio.stopMusic();
    }

    updateCutscene() {
        this.cutsceneTimer++;
        input.update();
        const panel = this.cutsceneActive && this.cutsceneActive[this.cutsceneIndex];
        if (!panel) {
            // Finished - advance to the next stage
            this.cutsceneActive = null;
            this.advanceStage();
            return;
        }
        const hold = panel.hold || 150;
        if (this.cutsceneTimer > hold || input.shoot || input.jumpPressed) {
            this.cutsceneIndex++;
            this.cutsceneTimer = 0;
            if (this.cutsceneIndex >= this.cutsceneActive.length) {
                this.cutsceneActive = null;
                this.advanceStage();
            }
        }
    }

    renderCutscene() {
        const ctx = this.ctx;
        // Reuse the same look as the story intro.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Static noise sparkle
        ctx.fillStyle = '#1a1140';
        for (let i = 0; i < 24; i++) {
            const x = (i * 23 + this.cutsceneTimer * 3) % GAME.WIDTH;
            const y = (i * 41 + this.cutsceneTimer * 7) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }
        const panel = this.cutsceneActive && this.cutsceneActive[this.cutsceneIndex];
        if (!panel) return;
        const hold = panel.hold || 150;
        const tin = Math.min(1, this.cutsceneTimer / 30);
        const tout = Math.min(1, Math.max(0, (hold - this.cutsceneTimer) / 25));
        ctx.globalAlpha = Math.min(tin, tout);

        // Use the storyTimer field for shared flair animations - swap in our timer
        const origStoryTimer = this.storyTimer;
        this.storyTimer = this.cutsceneTimer;
        this.drawStoryFlair(ctx, panel.flair, GAME.WIDTH / 2, 80);
        this.storyTimer = origStoryTimer;

        if (panel.text) {
            drawPixelTextOutlined(ctx, panel.text, GAME.WIDTH / 2, 140, '#ffe070', '#a82020', 2, 'center', 1);
        }
        if (panel.sub) {
            drawPixelText(ctx, panel.sub, GAME.WIDTH / 2, 168, '#c0a0d0', 1, 'center', 1);
        }
        ctx.globalAlpha = 1;

        // Skip hint
        const blink = Math.floor(this.cutsceneTimer / 30) % 2 === 0;
        if (blink) drawPixelText(ctx, 'SHOOT TO ADVANCE', GAME.WIDTH / 2, 210, '#5a5070', 1, 'center', 1);

        // Page indicator for the cutscene
        const dotSpacing = Math.min(10, Math.floor((GAME.WIDTH - 40) / this.cutsceneActive.length));
        for (let i = 0; i < this.cutsceneActive.length; i++) {
            const totalW = this.cutsceneActive.length * dotSpacing;
            const dotX = GAME.WIDTH / 2 - totalW / 2 + i * dotSpacing;
            ctx.fillStyle = i === this.cutsceneIndex ? '#ffe070' : '#3a2855';
            ctx.fillRect(dotX, 200, Math.max(2, dotSpacing - 2), 2);
        }
    }

    beginGameComplete() {
        this.screen = 'gameComplete';
        this.completeTimer = 0;
        const runTime = this.runStartTime > 0 ? (Date.now() - this.runStartTime) / 1000 : 0;
        this.completeRunTime = runTime;
        this.markGameComplete(runTime);
        this.checkHighScore();
        if (typeof achievements !== 'undefined') {
            achievements.onGameCleared(
                this.difficultyKeys[this.difficultyIndex],
                this.runDeaths,
                this.newGamePlus
            );
        }
        // Record NG+ clear for the Clippetta skin unlock
        if (this.newGamePlus) {
            try { localStorage.setItem('clippy_first_blood_ngplus_clear', '1'); } catch (e) {}
        }
        // Record best combo for the Blood Moon skin unlock
        this.persistMaxCombo();
        if (typeof audio !== 'undefined') audio.stopMusic();
    }

    promptInitials(score, runTime, afterCallback) {
        this.screen = 'initials';
        this.initials = ['A', 'A', 'A'];
        this.initialsCursor = 0;
        this.initialsTimer = 0;
        this.initialsPending = { score, time: runTime || 0, after: afterCallback || null };
        if (typeof audio !== 'undefined') audio.stopMusic();
    }

    updateInitials() {
        this.initialsTimer++;
        input.update();
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789. !";
        const idx = letters.indexOf(this.initials[this.initialsCursor]);
        if (input.keysJustPressed['ArrowUp']) {
            this.initials[this.initialsCursor] = letters[(idx - 1 + letters.length) % letters.length];
        }
        if (input.keysJustPressed['ArrowDown']) {
            this.initials[this.initialsCursor] = letters[(idx + 1) % letters.length];
        }
        if (input.keysJustPressed['ArrowLeft'] && this.initialsCursor > 0) this.initialsCursor--;
        if (input.keysJustPressed['ArrowRight'] && this.initialsCursor < 2) this.initialsCursor++;
        if (input.shoot || input.jumpPressed) {
            // Commit the entry
            if (this.initialsPending) {
                this.addToLeaderboard(
                    this.initials.join(''),
                    this.initialsPending.score,
                    this.initialsPending.time
                );
                const cb = this.initialsPending.after;
                this.initialsPending = null;
                if (cb) cb();
                else { this.screen = 'leaderboard'; this.leaderboardTimer = 0; }
            }
        }
    }

    renderInitials() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        ctx.fillStyle = '#1a1140';
        for (let i = 0; i < 24; i++) {
            const x = (i * 23 + this.initialsTimer * 2) % GAME.WIDTH;
            const y = (i * 41 + this.initialsTimer * 3) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }
        drawPixelTextOutlined(ctx, 'HIGH SCORE!', GAME.WIDTH / 2, 30, '#ffe070', '#a82020', 3, 'center', 1);
        drawPixelText(ctx, 'ENTER YOUR INITIALS', GAME.WIDTH / 2, 70, '#c0a0d0', 1, 'center', 1);
        // Three slots, centered
        const slotW = 24;
        const totalW = slotW * 3;
        const startX = GAME.WIDTH / 2 - totalW / 2;
        for (let i = 0; i < 3; i++) {
            const sx = startX + i * slotW;
            const sy = 100;
            const active = i === this.initialsCursor;
            ctx.fillStyle = active ? '#564468' : '#1a1140';
            ctx.fillRect(sx + 2, sy, slotW - 4, 30);
            ctx.fillStyle = active ? '#7a608c' : '#3a2855';
            ctx.fillRect(sx + 2, sy, slotW - 4, 2);
            drawPixelTextOutlined(ctx, this.initials[i], sx + slotW / 2, sy + 6, active ? '#ffe070' : '#ffffff', '#1a0000', 3, 'center', 1);
            // Up/down arrows around the active slot
            if (active) {
                const blink = (this.initialsTimer & 16) < 8;
                if (blink) {
                    ctx.fillStyle = '#ffe070';
                    ctx.fillRect(sx + slotW / 2 - 2, sy - 6, 5, 1);
                    ctx.fillRect(sx + slotW / 2 - 1, sy - 7, 3, 1);
                    ctx.fillRect(sx + slotW / 2,     sy - 8, 1, 1);
                    ctx.fillRect(sx + slotW / 2 - 2, sy + 36, 5, 1);
                    ctx.fillRect(sx + slotW / 2 - 1, sy + 37, 3, 1);
                    ctx.fillRect(sx + slotW / 2,     sy + 38, 1, 1);
                }
            }
        }
        // Final score
        if (this.initialsPending) {
            drawPixelText(ctx, 'SCORE  ' + String(this.initialsPending.score).padStart(6, '0'),
                GAME.WIDTH / 2, 152, '#ffe070', 1, 'center', 1);
        }
        // Hint
        drawPixelText(ctx, 'UP/DOWN  PICK   LEFT/RIGHT  MOVE',
            GAME.WIDTH / 2, 188, '#a890c0', 1, 'center', 1);
        drawPixelText(ctx, 'SHOOT  CONFIRM',
            GAME.WIDTH / 2, 200, '#a890c0', 1, 'center', 1);
    }

    updateLeaderboard() {
        this.leaderboardTimer = (this.leaderboardTimer || 0) + 1;
        input.update();
        if (this.leaderboardTab === undefined) this.leaderboardTab = this.difficultyIndex;
        // LEFT/RIGHT cycles the difficulty tab. Reset onlineTop to undefined
        // (not null) so the lazy-fetch gate below re-runs for the new tab -
        // null is the "fetch in flight" sentinel.
        if (input.keysJustPressed['ArrowLeft']) {
            this.leaderboardTab = (this.leaderboardTab + 2) % 3;
            this.onlineTop = undefined;
        }
        if (input.keysJustPressed['ArrowRight']) {
            this.leaderboardTab = (this.leaderboardTab + 1) % 3;
            this.onlineTop = undefined;
        }
        // S triggers a SHARE for the most recent entry (if any)
        if (input.keysJustPressed['KeyS'] && this.lastEntry && typeof OnlineLeaderboard !== 'undefined') {
            const url = OnlineLeaderboard.shareUrl(this.lastEntry);
            OnlineLeaderboard.copyToClipboard(url).then((ok) => {
                this.leaderboardMessage = ok ? 'LINK COPIED!' : url;
                this.leaderboardMessageTimer = 180;
            });
        }
        // Lazy-fetch global top scores when an endpoint is configured
        if (this.onlineTop === undefined &&
            typeof OnlineLeaderboard !== 'undefined' &&
            OnlineLeaderboard.isOnline()) {
            this.onlineTop = null;
            OnlineLeaderboard.fetchTop().then(rows => { this.onlineTop = rows || []; });
        }
        if (this.leaderboardMessageTimer && this.leaderboardMessageTimer > 0) this.leaderboardMessageTimer--;
        // Shoot/jump returns to title
        if (this.leaderboardTimer > 30 && (input.shoot || input.jumpPressed)) {
            this.screen = 'title';
            this.titleTimer = 0;
            this.score = 0;
            this.lives = this.difficulty.livesStart;
            this.continues = this.difficulty.continuesStart;
            this.loadStageByIndex(0);
            this.player = new Player(50, 160);
        }
    }

    renderLeaderboard() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Subtle moving sparkles
        ctx.fillStyle = '#2a1838';
        for (let i = 0; i < 24; i++) {
            const x = (i * 17 + this.leaderboardTimer * 1) % GAME.WIDTH;
            const y = (i * 31) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }

        drawPixelTextOutlined(ctx, 'LEADERBOARD', GAME.WIDTH / 2, 8, '#ffe070', '#a82020', 2, 'center', 1);

        // Difficulty tabs (EASY / NORMAL / HARD)
        if (this.leaderboardTab === undefined) this.leaderboardTab = this.difficultyIndex;
        const tabNames = ['EASY', 'NORMAL', 'HARD'];
        const tabColors = ['#50ff70', '#ffe070', '#ff5050'];
        for (let i = 0; i < tabNames.length; i++) {
            const tx = 40 + i * 72;
            const ty = 30;
            const sel = i === this.leaderboardTab;
            ctx.fillStyle = sel ? tabColors[i] : '#1a1140';
            ctx.fillRect(tx, ty, 64, 11);
            ctx.fillStyle = sel ? '#1a0e1e' : '#3a2855';
            ctx.fillRect(tx, ty, 64, 1);
            drawPixelText(ctx, tabNames[i], tx + 32, ty + 2,
                sel ? '#1a0e1e' : '#a890c0', 1, 'center', 1);
        }
        // LEFT/RIGHT arrow hints around the tab strip
        const blink2 = (this.leaderboardTimer & 16) < 8;
        if (blink2) {
            ctx.fillStyle = '#a890c0';
            ctx.fillRect(28, 34, 3, 1);
            ctx.fillRect(29, 35, 2, 1);
            ctx.fillRect(30, 36, 1, 1);
            ctx.fillRect(GAME.WIDTH - 28, 34, 3, 1);
            ctx.fillRect(GAME.WIDTH - 29, 35, 2, 1);
            ctx.fillRect(GAME.WIDTH - 30, 36, 1, 1);
        }

        const entries = this.loadLeaderboard(this.difficultyKeys[this.leaderboardTab]);
        if (entries.length === 0) {
            drawPixelText(ctx, 'NO ENTRIES YET', GAME.WIDTH / 2, GAME.HEIGHT / 2, '#a890c0', 1, 'center', 1);
        } else {
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                const y = 56 + i * 14;
                const rankColor = i === 0 ? '#ffe070' : (i < 3 ? '#ffa030' : '#a890c0');
                drawPixelText(ctx, String(i + 1).padStart(2, '0'),
                    20, y, rankColor, 1, 'left', 1);
                drawPixelText(ctx, e.name,
                    50, y, '#ffffff', 1, 'left', 1);
                drawPixelText(ctx, String(e.score).padStart(6, '0'),
                    GAME.WIDTH - 60, y, '#ffe070', 1, 'right', 1);
                // Time if available
                if (e.time) {
                    const mm = Math.floor(e.time / 60);
                    const ss = Math.floor(e.time % 60);
                    drawPixelText(ctx, `${mm}:${String(ss).padStart(2, '0')}`,
                        GAME.WIDTH - 18, y, '#7af0ff', 1, 'right', 1);
                }
            }
        }

        const blink = (this.leaderboardTimer & 16) < 8;

        // SHARE hint for the most recent entry
        if (this.lastEntry) {
            drawPixelText(ctx, 'S  SHARE LAST RUN', GAME.WIDTH / 2, GAME.HEIGHT - 24,
                '#80c0ff', 1, 'center', 1);
        }
        if (this.leaderboardMessage && this.leaderboardMessageTimer > 0) {
            drawPixelTextOutlined(ctx, this.leaderboardMessage,
                GAME.WIDTH / 2, GAME.HEIGHT - 34, '#50ff70', '#0a3a14', 1, 'center', 1);
        }
        if (this.sharedImportNotice && this.sharedImportTimer > 0) {
            drawPixelTextOutlined(ctx, this.sharedImportNotice,
                GAME.WIDTH / 2, 20, '#ffe070', '#1a0e1e', 1, 'center', 1);
            this.sharedImportTimer--;
        }
        // Online indicator
        if (typeof OnlineLeaderboard !== 'undefined' && OnlineLeaderboard.isOnline()) {
            drawPixelText(ctx, 'ONLINE', GAME.WIDTH - 6, 4, '#50ff70', 1, 'right', 1);
        }
        if (blink && this.leaderboardTimer > 30) {
            drawPixelText(ctx, 'SHOOT TO RETURN', GAME.WIDTH / 2, GAME.HEIGHT - 14, '#ffffff', 1, 'center', 1);
        }
    }

    updateGameComplete() {
        this.completeTimer++;
        this.background.update();
        if (typeof particles !== 'undefined') particles.update();
        input.update();
        // Occasional firework
        if (this.completeTimer % 50 === 0 && this.completeTimer < 900 && typeof particles !== 'undefined') {
            const fx = 30 + Math.random() * (GAME.WIDTH - 60);
            const fy = 50 + Math.random() * 80;
            particles.explosion(fx, fy);
            if (typeof audio !== 'undefined') audio.sfxExplosion();
        }
        // Skip with shoot/jump after the credits-roll has had a chance to start
        if (this.completeTimer > 60 && (input.shoot || input.jumpPressed) && this.completeTimer > this.completeSkipEarliest) {
            if (this.qualifiesForLeaderboard(this.score)) {
                this.promptInitials(this.score, this.completeRunTime, null);
            } else {
                this.screen = 'leaderboard';
                this.leaderboardTimer = 0;
            }
        }
    }

    renderGameComplete() {
        const ctx = this.ctx;
        // Sunset jungle behind a dimmer
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Use the jungle parallax for the closing shot regardless of last stage
        this.background.setTheme('jungle');
        this.background.draw(ctx, { x: 0, y: 0 });
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        if (typeof particles !== 'undefined') particles.draw(ctx, { x: 0, y: 0 });

        const t = this.completeTimer;

        // Phase 1: Clippy walks across the screen (0-180 frames)
        if (t < 180) {
            const walkX = -20 + (t / 180) * (GAME.WIDTH + 40);
            this.drawWalkingClippy(ctx, Math.floor(walkX), 168, t);
        }

        // Phase 2: THE END banner (180-300)
        if (t >= 180 && t < 360) {
            const fadeIn = Math.min(1, (t - 180) / 30);
            const fadeOut = Math.max(0, Math.min(1, (360 - t) / 20));
            ctx.globalAlpha = Math.min(fadeIn, fadeOut);
            drawPixelTextOutlined(ctx, 'THE END', GAME.WIDTH / 2, 80, '#ffe070', '#a82020', 4, 'center', 1);
            drawPixelText(ctx, 'CLIPPY HAS HAD HIS REVENGE', GAME.WIDTH / 2, 130, '#c0a0d0', 1, 'center', 1);
            ctx.globalAlpha = 1;
        }

        // Phase 3: Credits scroll (360+)
        if (t >= 360) {
            const credits = [
                'CLIPPY: FIRST BLOOD',
                '',
                'STARRING',
                '  CLIPPY',
                '',
                'WITH',
                '  A VENGEFUL STAPLER',
                '  AN AIRBORNE FOLDER',
                '  A SENTIENT RUBBER BAND BALL',
                '  THE TAPE DISPENSER',
                '',
                'BOSS LINEUP',
                '  THE FILE CABINET',
                '  COPIER 3000',
                '  MEGA-SHREDDER',
                '',
                'CHIPTUNE SOUNDTRACK',
                '  WEB AUDIO API',
                '',
                'PIXEL ART',
                '  ZERO ASSET FILES',
                '  ALL FILLRECT',
                '',
                'SPECIAL THANKS',
                '  EVERY DEPRECATED MASCOT',
                '',
                'FIN'
            ];
            const startY = GAME.HEIGHT - (t - 360) * 0.5;
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(GAME.WIDTH / 2 - 80, 30, 160, GAME.HEIGHT - 50);
            for (let i = 0; i < credits.length; i++) {
                const y = Math.floor(startY + i * 14);
                if (y < 30 || y > GAME.HEIGHT - 30) continue;
                const line = credits[i];
                const isHeading = !line.startsWith('  ') && line.length > 0;
                const isTitle = line === 'CLIPPY: FIRST BLOOD' || line === 'FIN';
                if (isTitle) {
                    drawPixelTextOutlined(ctx, line, GAME.WIDTH / 2, y, '#ffe070', '#a82020', 1, 'center', 1);
                } else if (isHeading) {
                    drawPixelText(ctx, line, GAME.WIDTH / 2, y, '#ff8030', 1, 'center', 1);
                } else if (line.length > 0) {
                    drawPixelText(ctx, line.trim(), GAME.WIDTH / 2, y, '#ffffff', 1, 'center', 1);
                }
            }
        }

        // Phase 4: Final stats card after credits have scrolled (timing depends on credits len)
        const statsStartT = 360 + 28 * 28; // about when 'FIN' clears top
        if (t > statsStartT) {
            const fadeIn = Math.min(1, (t - statsStartT) / 30);
            ctx.globalAlpha = fadeIn;
            this.drawFinalStats(ctx);
            ctx.globalAlpha = 1;
        }
        this.completeSkipEarliest = statsStartT;
    }

    drawFinalStats(ctx) {
        const py = 40;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(30, py - 4, GAME.WIDTH - 60, 130);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(32, py - 2, GAME.WIDTH - 64, 126);
        ctx.fillStyle = '#564468';
        ctx.fillRect(32, py - 2, GAME.WIDTH - 64, 2);

        drawPixelTextOutlined(ctx, 'MISSION COMPLETE', GAME.WIDTH / 2, py + 6, '#ffe070', '#a82020', 2, 'center', 1);

        const x1 = 46, x2 = GAME.WIDTH - 46;
        let row = py + 34;
        const line = (label, value, color) => {
            drawPixelText(ctx, label, x1, row, '#c0a0d0', 1, 'left', 1);
            drawPixelText(ctx, value, x2, row, color || '#ffffff', 1, 'right', 1);
            row += 12;
        };
        line('FINAL SCORE',    String(this.score).padStart(6, '0'), '#ffe070');
        const t = this.completeRunTime;
        const mm = Math.floor(t / 60);
        const ss = Math.floor(t % 60);
        line('TOTAL TIME',     `${mm}:${String(ss).padStart(2, '0')}`, '#7af0ff');
        line('ENEMIES KILLED', String(this.runEnemiesDefeated), '#ffffff');
        line('DEATHS',         String(this.runDeaths), this.runDeaths === 0 ? '#50ff70' : '#ffffff');
        line('SECRETS',        `${this.runSecretsFound} OF 1`, this.runSecretsFound > 0 ? '#50ff70' : '#888');
        // Affinity: which weapon dealt the most damage this run
        const fav = this.favoriteWeapon();
        if (fav) line('FAVORITE',     fav.toUpperCase(), '#ff8030');

        // Special call-outs
        if (this.runDeaths === 0) {
            drawPixelTextOutlined(ctx, 'NO-DEATH RUN!', GAME.WIDTH / 2, row + 4, '#50ff70', '#0a3a14', 1, 'center', 1);
            row += 14;
        }
        if (this.bossRushUnlocked && !this._wasUnlocked) {
            drawPixelTextOutlined(ctx, 'BOSS RUSH UNLOCKED', GAME.WIDTH / 2, row + 4, '#ff60ff', '#3a0a3a', 1, 'center', 1);
        }

        // Continue prompt
        const blink = Math.floor(this.completeTimer / 25) % 2 === 0;
        if (blink) drawPixelText(ctx, 'SHOOT TO RETURN TO TITLE', GAME.WIDTH / 2, GAME.HEIGHT - 14, '#ffffff', 1, 'center', 1);
    }

    drawWalkingClippy(ctx, x, y, animTime) {
        // Use procedural Clippy walking right
        if (typeof proceduralSprites === 'undefined') return;
        const frame = Math.floor(animTime / 6) % 4;
        proceduralSprites.drawClippy(ctx, x, y - 24, PLAYER_STATE.RUNNING, frame, true, 0);
    }

    renderStageClear() {
        const ctx = this.ctx;
        // Keep the world visible behind the celebration
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        this.background.draw(ctx, this.camera);
        this.level.draw(ctx, this.camera);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        if (typeof particles !== 'undefined') particles.draw(ctx, this.camera);

        // Title
        const slide = Math.min(1, this.stageClearTimer / 24);
        const titleY = -30 + slide * 70;
        drawPixelTextOutlined(ctx, 'STAGE CLEAR', GAME.WIDTH / 2, titleY, '#ffe070', '#a82020', 3, 'center', 1);

        // Tally panel
        if (this.stageClearTimer > 30) {
            const py = 90;
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(40, py - 4, GAME.WIDTH - 80, 70);
            ctx.fillStyle = '#3a2855';
            ctx.fillRect(42, py - 2, GAME.WIDTH - 84, 66);
            ctx.fillStyle = '#564468';
            ctx.fillRect(42, py - 2, GAME.WIDTH - 84, 2);
            ctx.fillStyle = '#1a1140';
            ctx.fillRect(42, py + 62, GAME.WIDTH - 84, 2);

            drawPixelText(ctx, 'SCORE',      54, py + 6,  '#c0a0d0', 1, 'left', 1);
            drawPixelText(ctx, String(this.stageClearScore).padStart(6, '0'),
                          GAME.WIDTH - 54, py + 6, '#ffffff', 1, 'right', 1);
            drawPixelText(ctx, 'TIME BONUS', 54, py + 22, '#c0a0d0', 1, 'left', 1);
            drawPixelText(ctx, String(this.stageClearBonusShown).padStart(6, '0'),
                          GAME.WIDTH - 54, py + 22, '#ffe070', 1, 'right', 1);
            drawPixelText(ctx, 'TIME',       54, py + 38, '#c0a0d0', 1, 'left', 1);
            const mins = Math.floor(this.stageClearTime / 60);
            const secs = Math.floor(this.stageClearTime % 60);
            drawPixelText(ctx, `${mins}:${String(secs).padStart(2, '0')}`,
                          GAME.WIDTH - 54, py + 38, '#ffffff', 1, 'right', 1);
            drawPixelText(ctx, 'TOTAL',      54, py + 54, '#ffe070', 1, 'left', 1);
            drawPixelTextOutlined(ctx, String(this.score).padStart(6, '0'),
                          GAME.WIDTH - 54, py + 54, '#ff5050', '#1a0000', 1, 'right', 1);
        }

        // High score line
        if (this.stageClearTimer > 180) {
            const isNew = this.score >= this.highScore && this.score > 0;
            const blink = Math.floor(this.stageClearTimer / 12) % 2 === 0;
            if (isNew) {
                if (blink) drawPixelTextOutlined(ctx, 'NEW HIGH SCORE!',
                    GAME.WIDTH / 2, 180, '#ffe070', '#a82020', 1, 'center', 1);
            } else {
                drawPixelText(ctx, 'HIGH ' + String(this.highScore).padStart(6, '0'),
                    GAME.WIDTH / 2, 180, '#a890c0', 1, 'center', 1);
            }
        }

        // Continue prompt
        if (this.stageClearTimer > 200) {
            const blink = Math.floor(this.stageClearTimer / 20) % 2 === 0;
            const prompt = this.stageClearIsFinal ? 'SHOOT TO REPLAY' : 'SHOOT FOR NEXT STAGE';
            if (blink) drawPixelText(ctx, prompt,
                GAME.WIDTH / 2, 205, '#ffffff', 1, 'center', 1);
        }
    }

    updateTitle() {
        this.titleTimer++;
        this.background.update();
        input.update();

        // Konami code listener (active on title)
        this.tickKonami();

        // UP arrow on the title opens the stage-select hub (when unlocked)
        if (this.bossRushUnlocked && input.keysJustPressed['ArrowUp']) {
            if (typeof audio !== 'undefined') audio.resume();
            this.screen = 'stageSelect';
            this.stageSelectTimer = 0;
            this.stageSelectCursor = 0;
            return;
        }
        // LEFT/RIGHT cycles difficulty
        if (input.keysJustPressed['ArrowLeft']) this.setDifficulty(this.difficultyIndex - 1);
        if (input.keysJustPressed['ArrowRight']) this.setDifficulty(this.difficultyIndex + 1);
        // DOWN shows leaderboard
        if (input.keysJustPressed['ArrowDown']) {
            this.screen = 'leaderboard';
            this.leaderboardTimer = 0;
        }
        // T opens the trophies / achievements screen
        if (input.keysJustPressed['KeyT']) {
            this.screen = 'achievements';
            this.achievementsTimer = 0;
            this.achievementsScroll = 0;
        }
        // H opens the help / controls screen
        if (input.keysJustPressed['KeyH']) {
            this.screen = 'help';
            this.helpTimer = 0;
            this.helpPage = 0;
        }
        // K opens the Clippy skin select screen
        if (input.keysJustPressed['KeyK']) {
            this.screen = 'skins';
            this.skinsTimer = 0;
            // Start cursor on the currently selected skin
            const all = SKINS;
            this.skinsCursor = Math.max(0, all.findIndex(s => s.id === this.skinId));
        }
        // B opens the password / backup screen
        if (input.keysJustPressed['KeyB']) {
            this.screen = 'password';
            this.passwordTimer = 0;
            this.passwordMode = 'view';     // 'view' or 'enter'
            this.passwordInput = '';
            this.passwordMessage = '';
        }
        // D opens the daily challenge screen
        if (input.keysJustPressed['KeyD']) {
            this.screen = 'daily';
            this.dailyTimer = 0;
        }
        // 2 toggles co-op P2 mode
        if (input.keysJustPressed['Digit2']) {
            this.coopEnabled = !this.coopEnabled;
        }
        // ENTER opens the consolidated main menu (alternative to hotkeys)
        if (input.keysJustPressed['Enter']) {
            this.screen = 'menu';
            this.menuTimer = 0;
            this.menuCursor = 0;
        }
        // N toggles NewGame+ (only meaningful once unlocked)
        if (this.bossRushUnlocked && input.keysJustPressed['KeyN']) {
            this.toggleNewGamePlus();
        }

        // Any key starts the game - go through the story sequence first.
        // Clear any leftover dailyMode / bossRushMode from a prior run
        // (quit-to-title doesn't reset them, so they could leak in here).
        if (input.jumpPressed || input.shoot) {
            if (typeof audio !== 'undefined') audio.resume();
            this.resetRunFlags();
            this.screen = 'story';
            this.storyTimer = 0;
            this.storyPanel = 0;
        }
    }

    // Clear all per-run mode flags so a fresh run doesn't inherit dailyMode
    // or bossRushMode from the previous one. Each start-of-run function
    // calls this before setting its own flags.
    resetRunFlags() {
        this.dailyMode = false;
        this.dailyDamageMul = 1;
        this.dailyPlayerDmg = 1;
        this.dailySpeedMul = 1;
        this.dailyHpMul = 1;
        this.dailyChaos = false;
        this.dailyDoubleEnemies = false;
        this.dailyNoPickups = false;
        this.bossRushMode = false;
    }

    startBossRush() {
        this.resetRunFlags();
        this.bossRushMode = true;
        this.score = 0;
        this.lives = 3;
        this.gameOver = false;
        this.paused = false;
        this.stageName = this.bossRushStage.name;
        this.stageNumber = this.bossRushStage.number;
        this.stageIndex = 0;

        // Load the boss-rush level directly through the same code path
        this.level[this.bossRushStage.loader]();
        this.background.setTheme(this.bossRushStage.theme);

        this.enemies = new EnemyManager();
        this.level.spawnPoints.forEach(spawn => {
            this.enemies.spawn(spawn.x, spawn.y, spawn.type);
        });
        if (typeof pickupManager !== 'undefined') pickupManager.loadFromLevel(this.level);

        this.bossWarning = 0;
        this.bossWarningShown = false;
        this.bossIntroActive = false;
        this.bossIntroTimer = 0;
        this.bossIntroEnemy = null;
        this.pickupFlashTimer = 0;
        this.camera.x = 0;
        this.camera.y = 0;
        this.camera.shakeAmount = 0;
        this.camera.shakeTimer = 0;
        if (typeof particles !== 'undefined') particles.clear();

        this.player = new Player(50, 160);
        this.screen = 'stageIntro';
        this.stageIntroTimer = 0;
    }

    updateStory() {
        this.storyTimer++;
        input.update();
        // Each panel has its own hold time, or default 150. Shoot/jump skips.
        const panel = this.storyPanels[this.storyPanel] || {};
        const hold = panel.hold || 150;
        const advance = (input.jumpPressed || input.shoot);
        if (this.storyTimer > hold || advance) {
            this.storyPanel++;
            this.storyTimer = 0;
            if (this.storyPanel >= this.storyPanels.length) {
                this.screen = 'stageIntro';
                this.stageIntroTimer = 0;
                this.storyPanel = 0;
            }
        }
    }

    renderStory() {
        const ctx = this.ctx;
        // Pure black backdrop with subtle CRT noise
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Static noise speckles
        ctx.fillStyle = '#1a1140';
        for (let i = 0; i < 30; i++) {
            const x = (i * 23 + this.storyTimer * 3) % GAME.WIDTH;
            const y = (i * 41 + this.storyTimer * 7) % GAME.HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }

        const panel = this.storyPanels[this.storyPanel];
        if (!panel) return;
        const hold = panel.hold || 150;

        // Fade in for first 30 frames, fade out for last 25
        const tin = Math.min(1, this.storyTimer / 30);
        const tout = Math.min(1, Math.max(0, (hold - this.storyTimer) / 25));
        const alpha = Math.min(tin, tout);
        ctx.globalAlpha = alpha;

        // Decorative flair area (centered around y=80)
        this.drawStoryFlair(ctx, panel.flair, GAME.WIDTH / 2, 80);

        // Primary text (skip if empty - some panels are pure visual)
        if (panel.text) {
            drawPixelTextOutlined(ctx, panel.text, GAME.WIDTH / 2, 140, '#ffe070', '#a82020', 2, 'center', 1);
        }
        // Sub-text (smaller line below)
        if (panel.sub) {
            drawPixelText(ctx, panel.sub, GAME.WIDTH / 2, 168, '#c0a0d0', 1, 'center', 1);
        }

        ctx.globalAlpha = 1;

        // Continue/skip hint always shown
        const blink = Math.floor(this.storyTimer / 30) % 2 === 0;
        if (blink) {
            drawPixelText(ctx, 'SHOOT TO ADVANCE', GAME.WIDTH / 2, 210, '#5a5070', 1, 'center', 1);
        }
        // Page indicator - smaller dots so 18 fit
        const dotSpacing = Math.min(8, Math.floor((GAME.WIDTH - 60) / this.storyPanels.length));
        for (let i = 0; i < this.storyPanels.length; i++) {
            const totalW = this.storyPanels.length * dotSpacing;
            const dotX = GAME.WIDTH / 2 - totalW / 2 + i * dotSpacing;
            ctx.fillStyle = i === this.storyPanel ? '#ffe070' : '#3a2855';
            ctx.fillRect(dotX, 200, Math.max(2, dotSpacing - 2), 2);
        }
    }

    drawStoryFlair(ctx, flair, cx, cy) {
        switch (flair) {
            case 'cursor': {
                // Old-school MS cursor + 'Office 2007' window mockup
                // Blinking cursor
                if (Math.floor(this.storyTimer / 15) % 2 === 0) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(cx - 1, cy - 8, 2, 16);
                }
                // Mock window header
                ctx.fillStyle = '#3a78b8';
                ctx.fillRect(cx - 60, cy - 22, 120, 8);
                ctx.fillStyle = '#5aa8e0';
                ctx.fillRect(cx - 60, cy - 22, 120, 2);
                // Window close X
                ctx.fillStyle = '#a82020';
                ctx.fillRect(cx + 50, cy - 20, 8, 5);
                ctx.fillStyle = '#fff';
                ctx.fillRect(cx + 51, cy - 19, 1, 1);
                ctx.fillRect(cx + 56, cy - 19, 1, 1);
                ctx.fillRect(cx + 52, cy - 18, 1, 1);
                ctx.fillRect(cx + 55, cy - 18, 1, 1);
                ctx.fillRect(cx + 53, cy - 17, 2, 1);
                // Window body
                ctx.fillStyle = '#e8e8f0';
                ctx.fillRect(cx - 60, cy - 14, 120, 28);
                break;
            }
            case 'shredder': {
                // A shredder with paper going in
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(cx - 8, cy - 22, 16, 18);
                ctx.fillStyle = '#d8c890';
                ctx.fillRect(cx - 8, cy - 14, 16, 1);
                ctx.fillRect(cx - 8, cy - 10, 16, 1);
                // Shredder body
                ctx.fillStyle = '#1a1a22';
                ctx.fillRect(cx - 20, cy - 4, 40, 16);
                ctx.fillStyle = '#3a3a48';
                ctx.fillRect(cx - 20, cy - 4, 40, 2);
                // Slot
                ctx.fillStyle = '#000';
                ctx.fillRect(cx - 14, cy - 2, 28, 2);
                // Confetti underneath
                for (let i = 0; i < 6; i++) {
                    const dx = -16 + i * 6;
                    ctx.fillStyle = i % 2 ? '#ffe070' : '#fff8d0';
                    ctx.fillRect(cx + dx, cy + 16 + (i & 3), 3, 2);
                }
                break;
            }
            case 'eyes': {
                // Two glowing eyes in the dark
                const pulse = Math.sin(this.storyTimer * 0.1) > 0;
                ctx.fillStyle = pulse ? '#ff5050' : '#a82020';
                ctx.fillRect(cx - 18, cy - 4, 8, 6);
                ctx.fillRect(cx + 10, cy - 4, 8, 6);
                ctx.fillStyle = pulse ? '#ffe070' : '#ff5050';
                ctx.fillRect(cx - 16, cy - 2, 4, 2);
                ctx.fillRect(cx + 12, cy - 2, 4, 2);
                ctx.fillStyle = '#fff';
                ctx.fillRect(cx - 15, cy - 1, 1, 1);
                ctx.fillRect(cx + 13, cy - 1, 1, 1);
                break;
            }
            case 'logo': {
                // CLIPPY logo small + bandana paperclip icon
                drawPixelTextOutlined(ctx, 'CLIPPY', cx - 8, cy - 10, '#ff5050', '#1a0000', 2, 'center', 1);
                // Bandana paperclip on right
                const x = cx + 32, y = cy - 14;
                ctx.fillStyle = '#cc4444'; ctx.fillRect(x + 2, y + 1, 12, 2);
                ctx.fillStyle = '#ff6b6b'; ctx.fillRect(x + 2, y, 12, 1);
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(x + 2, y + 3, 12, 2); ctx.fillRect(x + 2, y + 3, 2, 14);
                ctx.fillRect(x + 12, y + 3, 2, 14); ctx.fillRect(x + 2, y + 15, 10, 2);
                ctx.fillStyle = '#fff';
                ctx.fillRect(x + 5, y + 9, 2, 2);
                ctx.fillRect(x + 9, y + 9, 2, 2);
                break;
            }
            case 'worddoc': {
                // Word document with a smiling Clippy peeking over
                // Doc paper
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(cx - 24, cy - 18, 48, 36);
                ctx.fillStyle = '#d8c890';
                ctx.fillRect(cx - 24, cy - 18, 48, 1);
                ctx.fillStyle = '#a87040';
                ctx.fillRect(cx - 24, cy + 18, 48, 1);
                // Word "W" logo top-left
                ctx.fillStyle = '#2a5298';
                ctx.fillRect(cx - 22, cy - 16, 8, 8);
                ctx.fillStyle = '#fff';
                ctx.fillRect(cx - 21, cy - 15, 1, 6);
                ctx.fillRect(cx - 19, cy - 15, 1, 6);
                ctx.fillRect(cx - 17, cy - 15, 1, 6);
                ctx.fillRect(cx - 15, cy - 15, 1, 6);
                ctx.fillRect(cx - 21, cy - 10, 6, 1);
                // Text lines
                ctx.fillStyle = '#806848';
                ctx.fillRect(cx - 12, cy - 14, 32, 1);
                ctx.fillRect(cx - 12, cy - 10, 30, 1);
                ctx.fillRect(cx - 22, cy - 4, 42, 1);
                ctx.fillRect(cx - 22, cy,     38, 1);
                ctx.fillRect(cx - 22, cy + 4, 40, 1);
                ctx.fillRect(cx - 22, cy + 8, 34, 1);
                ctx.fillRect(cx - 22, cy + 12, 24, 1);
                // Clippy peeking from bottom right (smiling)
                this._drawClippyPortrait(ctx, cx + 16, cy + 8, 'happy');
                // Speech bubble
                ctx.fillStyle = '#fff';
                ctx.fillRect(cx + 22, cy - 10, 14, 8);
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(cx + 24, cy - 8, 1, 1);
                ctx.fillRect(cx + 28, cy - 8, 1, 1);
                ctx.fillRect(cx + 32, cy - 8, 1, 1);
                ctx.fillRect(cx + 24, cy - 4, 10, 1);
                ctx.fillRect(cx + 24, cy - 1, 2, 1);  // tail to clippy
                break;
            }
            case 'helpingHands': {
                // Clippy in the center surrounded by floating Word docs
                this._drawClippyPortrait(ctx, cx, cy, 'happy');
                // Orbiting documents
                const docs = [
                    { dx: -36, dy: -16 },
                    { dx:  30, dy: -18 },
                    { dx: -40, dy:  10 },
                    { dx:  34, dy:  14 },
                    { dx:   0, dy: -28 }
                ];
                for (const d of docs) {
                    const wobble = Math.sin(this.storyTimer * 0.08 + d.dx) * 1;
                    const dx = cx + d.dx, dy = cy + d.dy + wobble;
                    ctx.fillStyle = '#fff8d0';
                    ctx.fillRect(dx - 5, dy - 6, 10, 12);
                    ctx.fillStyle = '#2a5298';
                    ctx.fillRect(dx - 4, dy - 5, 3, 3);
                    ctx.fillStyle = '#806848';
                    ctx.fillRect(dx - 4, dy, 8, 1);
                    ctx.fillRect(dx - 4, dy + 2, 7, 1);
                    ctx.fillRect(dx - 4, dy + 4, 8, 1);
                }
                // Sparkles
                for (let i = 0; i < 4; i++) {
                    const a = (this.storyTimer * 0.05 + i * Math.PI / 2);
                    const sx = cx + Math.cos(a) * 24;
                    const sy = cy + Math.sin(a) * 16;
                    ctx.fillStyle = '#ffe070';
                    ctx.fillRect(sx, sy, 1, 1);
                    ctx.fillRect(sx - 1, sy + 1, 3, 1);
                    ctx.fillRect(sx, sy + 2, 1, 1);
                }
                break;
            }
            case 'couple': {
                // Clippy and Clippetta with hearts between them
                this._drawClippyPortrait(ctx, cx - 18, cy, 'happy');
                this._drawClippettaPortrait(ctx, cx + 18, cy);
                // Floating hearts
                for (let i = 0; i < 3; i++) {
                    const phase = this.storyTimer * 0.06 + i * 1.5;
                    const hx = cx + Math.cos(phase) * 6;
                    const hy = cy - 14 - i * 6 - (this.storyTimer / 6 % 8);
                    ctx.fillStyle = '#ff5050';
                    ctx.fillRect(hx - 2, hy, 2, 1);
                    ctx.fillRect(hx + 1, hy, 2, 1);
                    ctx.fillRect(hx - 2, hy + 1, 5, 2);
                    ctx.fillRect(hx - 1, hy + 3, 3, 1);
                    ctx.fillRect(hx, hy + 4, 1, 1);
                    ctx.fillStyle = '#ffa0a0';
                    ctx.fillRect(hx - 1, hy + 1, 1, 1);
                }
                break;
            }
            case 'twins': {
                // Clippy + Clippetta with two small paperclip kids
                this._drawClippyPortrait(ctx, cx - 28, cy - 2, 'happy');
                this._drawClippettaPortrait(ctx, cx + 28, cy - 2);
                this._drawClippyKid(ctx, cx - 8, cy + 4);
                this._drawClippyKid(ctx, cx + 8, cy + 4);
                // Small floor line
                ctx.fillStyle = '#604830';
                ctx.fillRect(cx - 40, cy + 16, 80, 1);
                break;
            }
            case 'family': {
                // Full family: Clippy, Clippetta, two kids, paperclip dog
                this._drawClippyPortrait(ctx, cx - 36, cy - 2, 'happy');
                this._drawClippettaPortrait(ctx, cx - 14, cy - 2);
                this._drawClippyKid(ctx, cx + 4, cy + 4);
                this._drawClippyKid(ctx, cx + 18, cy + 4);
                this._drawPaperclipDog(ctx, cx + 34, cy + 8);
                // Floor
                ctx.fillStyle = '#604830';
                ctx.fillRect(cx - 50, cy + 16, 100, 1);
                break;
            }
            case 'home': {
                // House silhouette at night with a warm window
                ctx.fillStyle = '#1a1140';
                ctx.fillRect(cx - 60, cy - 18, 120, 36);
                // Stars
                for (let i = 0; i < 12; i++) {
                    const sx = cx - 56 + (i * 9 + this.storyTimer / 20) % 112;
                    const sy = cy - 16 + (i * 7) % 10;
                    ctx.fillStyle = '#fff';
                    if ((this.storyTimer + i) & 7) ctx.fillRect(sx, sy, 1, 1);
                }
                // House body
                ctx.fillStyle = '#3a2410';
                ctx.fillRect(cx - 20, cy - 4, 40, 24);
                // Roof
                ctx.fillStyle = '#1a0e08';
                for (let i = 0; i < 24; i++) {
                    ctx.fillRect(cx - 24 + i, cy - 4 - i, 48 - i * 2, 1);
                }
                // Window with warm light
                ctx.fillStyle = '#ffd460';
                ctx.fillRect(cx - 6, cy + 2, 12, 10);
                ctx.fillStyle = '#604010';
                ctx.fillRect(cx, cy + 2, 1, 10);
                ctx.fillRect(cx - 6, cy + 7, 12, 1);
                // Door
                ctx.fillStyle = '#1a0808';
                ctx.fillRect(cx - 16, cy + 8, 6, 12);
                ctx.fillStyle = '#ffd460';
                ctx.fillRect(cx - 11, cy + 14, 1, 1);
                // Tiny family silhouettes in the window
                ctx.fillStyle = '#3a2855';
                ctx.fillRect(cx - 3, cy + 6, 1, 5);
                ctx.fillRect(cx,     cy + 7, 1, 4);
                ctx.fillRect(cx + 2, cy + 8, 1, 3);
                ctx.fillRect(cx + 4, cy + 9, 1, 2);
                break;
            }
            case 'boardroomShadows': {
                // Long oval boardroom table with shadowy figures
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(cx - 70, cy - 24, 140, 50);
                // Faint window glow at the back
                ctx.fillStyle = '#3a1a40';
                ctx.fillRect(cx - 60, cy - 22, 120, 2);
                ctx.fillStyle = '#5a2a60';
                ctx.fillRect(cx - 60, cy - 22, 120, 1);
                // Oval table (top-down perspective compressed)
                ctx.fillStyle = '#3a2410';
                ctx.fillRect(cx - 50, cy + 4, 100, 14);
                ctx.fillStyle = '#604830';
                ctx.fillRect(cx - 50, cy + 4, 100, 2);
                ctx.fillStyle = '#1a0e08';
                ctx.fillRect(cx - 50, cy + 16, 100, 2);
                // Shadowy heads around the table
                const heads = [-44, -28, -12, 4, 20, 36];
                for (const dx of heads) {
                    // Body silhouette
                    ctx.fillStyle = '#0a0612';
                    ctx.fillRect(cx + dx - 4, cy - 2, 8, 14);
                    // Head
                    ctx.fillRect(cx + dx - 3, cy - 8, 6, 6);
                    // Red eye glint - which figure has it varies over time
                    if (((this.storyTimer / 30 + dx) | 0) % 6 === 0) {
                        ctx.fillStyle = '#ff3030';
                        ctx.fillRect(cx + dx - 1, cy - 6, 1, 1);
                        ctx.fillRect(cx + dx + 1, cy - 6, 1, 1);
                    }
                }
                break;
            }
            case 'killOrder': {
                // Big red X stamp with "KILL THE MASCOT" feel
                // Memo/paper background
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(cx - 36, cy - 22, 72, 44);
                ctx.fillStyle = '#a87040';
                ctx.fillRect(cx - 36, cy - 22, 72, 1);
                ctx.fillRect(cx - 36, cy + 22, 72, 1);
                // Memo text lines
                ctx.fillStyle = '#806848';
                ctx.fillRect(cx - 32, cy - 18, 50, 1);
                ctx.fillRect(cx - 32, cy - 14, 60, 1);
                ctx.fillRect(cx - 32, cy - 10, 50, 1);
                ctx.fillRect(cx - 32, cy + 16, 40, 1);
                // Subject "RE: CLIPPY"
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(cx - 32, cy - 22, 1, 1);
                // The huge red X stamp
                const stampPulse = Math.sin(this.storyTimer * 0.15) * 0.3 + 1;
                ctx.fillStyle = '#a82020';
                for (let i = 0; i < 30; i++) {
                    const yy = cy - 15 + i;
                    ctx.fillRect(cx - 15 + i, yy, 4, 1);
                    ctx.fillRect(cx + 14 - i, yy, 4, 1);
                }
                // Red "DENIED"-style word in the middle
                drawPixelTextOutlined(ctx, 'ERASE', cx, cy - 3, '#ff5050', '#1a0000', 2, 'center', 1);
                break;
            }
            case 'carLeaving': {
                // Clippy waving at the curb while a car drives away to the right
                // Driveway / road
                ctx.fillStyle = '#3a2410';
                ctx.fillRect(cx - 60, cy + 12, 120, 8);
                ctx.fillStyle = '#a87040';
                for (let i = 0; i < 6; i++) {
                    ctx.fillRect(cx - 50 + i * 22, cy + 15, 8, 2);
                }
                // Clippy on the left, waving
                this._drawClippyPortrait(ctx, cx - 44, cy - 2, 'waving');
                // Car driving right, with the family silhouetted in windows
                const carX = cx + 4 + (this.storyTimer * 0.6);   // pulls away slowly
                ctx.fillStyle = '#3a2855';
                ctx.fillRect(carX - 18, cy, 36, 12);
                // Roof / cabin
                ctx.fillStyle = '#564468';
                ctx.fillRect(carX - 12, cy - 6, 24, 6);
                // Windows
                ctx.fillStyle = '#80a8c0';
                ctx.fillRect(carX - 10, cy - 4, 8, 4);
                ctx.fillRect(carX + 2, cy - 4, 8, 4);
                // Family silhouettes in windows
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(carX - 8, cy - 3, 2, 3);
                ctx.fillRect(carX - 5, cy - 3, 2, 3);
                ctx.fillRect(carX + 4, cy - 3, 2, 3);
                ctx.fillRect(carX + 7, cy - 3, 2, 3);
                // Wheels
                ctx.fillStyle = '#0a0612';
                ctx.fillRect(carX - 14, cy + 10, 6, 4);
                ctx.fillRect(carX + 8, cy + 10, 6, 4);
                ctx.fillStyle = '#3a2855';
                ctx.fillRect(carX - 13, cy + 11, 4, 2);
                ctx.fillRect(carX + 9, cy + 11, 4, 2);
                // Exhaust puffs
                if ((this.storyTimer & 7) < 4) {
                    ctx.fillStyle = '#a8a8c0';
                    ctx.fillRect(carX - 22, cy + 6, 3, 2);
                    ctx.fillRect(carX - 26, cy + 5, 2, 2);
                }
                break;
            }
            case 'explosion': {
                // Massive growing explosion. Time-based for impact.
                const t = this.storyTimer;
                // Sky fading red
                const flash = Math.max(0, 1 - t / 30);
                ctx.fillStyle = `rgba(255, 200, 80, ${flash * 0.3})`;
                ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
                // Growing fireball
                const r = Math.min(80, 8 + t * 1.5);
                this._fillCircle(ctx, cx, cy + 8, r, '#1a0808');
                this._fillCircle(ctx, cx, cy + 8, r - 4, '#a82020');
                this._fillCircle(ctx, cx, cy + 8, r - 10, '#ff5050');
                this._fillCircle(ctx, cx, cy + 8, r - 16, '#ffd460');
                this._fillCircle(ctx, cx, cy + 8, r - 22, '#fff5c0');
                // Shock-wave ring
                if (t < 60) {
                    const ring = t * 2.5;
                    for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
                        const rx = Math.floor(cx + Math.cos(a) * ring);
                        const ry = Math.floor(cy + 8 + Math.sin(a) * ring * 0.7);
                        ctx.fillStyle = '#ffe070';
                        ctx.fillRect(rx, ry, 1, 1);
                    }
                }
                // Debris flying
                for (let i = 0; i < 12; i++) {
                    const seed = i * 17;
                    const a = (seed * 0.1) % (Math.PI * 2);
                    const dist = (t + seed) * 1.2;
                    const dx = Math.cos(a) * dist;
                    const dy = Math.sin(a) * dist * 0.6 - dist * dist / 200;
                    if (dist > 100) continue;
                    ctx.fillStyle = '#3a2410';
                    ctx.fillRect(Math.floor(cx + dx), Math.floor(cy + 8 + dy), 2, 2);
                }
                // Rising smoke column
                if (t > 60) {
                    ctx.fillStyle = '#0a0612';
                    for (let i = 0; i < 5; i++) {
                        const sy = cy + 8 - i * 12 - (t - 60) * 0.5;
                        const sw = 30 - i * 4;
                        ctx.fillRect(cx - sw / 2, sy - 6, sw, 12);
                    }
                }
                break;
            }
            case 'clippyAlone': {
                // Single drooped Clippy with rain falling
                this._drawClippyPortrait(ctx, cx, cy, 'sad');
                // Floor
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(cx - 60, cy + 18, 120, 1);
                // Falling rain
                for (let i = 0; i < 20; i++) {
                    const rx = cx - 60 + (i * 6 + this.storyTimer * 2) % 120;
                    const ry = -10 + (i * 13 + this.storyTimer * 4) % 100;
                    ctx.fillStyle = '#5aa8e0';
                    ctx.fillRect(rx, ry, 1, 3);
                }
                break;
            }
            case 'clippyKneeling': {
                // Kneeling clippy with broken-heart icon
                this._drawClippyPortrait(ctx, cx - 16, cy + 4, 'broken');
                // Broken heart on right
                const hx = cx + 12, hy = cy - 2;
                ctx.fillStyle = '#a82020';
                ctx.fillRect(hx - 6, hy, 5, 1);
                ctx.fillRect(hx + 1, hy, 5, 1);
                ctx.fillRect(hx - 6, hy + 1, 12, 3);
                ctx.fillRect(hx - 5, hy + 4, 10, 1);
                ctx.fillRect(hx - 4, hy + 5, 8, 1);
                ctx.fillRect(hx - 3, hy + 6, 6, 1);
                ctx.fillRect(hx - 2, hy + 7, 4, 1);
                ctx.fillRect(hx - 1, hy + 8, 2, 1);
                // Crack down the middle (black gap)
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(hx,     hy + 1, 1, 1);
                ctx.fillRect(hx - 1, hy + 2, 2, 1);
                ctx.fillRect(hx,     hy + 3, 1, 1);
                ctx.fillRect(hx + 1, hy + 4, 1, 1);
                ctx.fillRect(hx,     hy + 5, 1, 1);
                ctx.fillRect(hx,     hy + 7, 1, 1);
                // Floor line
                ctx.fillStyle = '#3a2855';
                ctx.fillRect(cx - 50, cy + 18, 100, 1);
                break;
            }
            case 'newspaper': {
                // Newspaper clipping with "MASCOT" headline
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(cx - 48, cy - 22, 96, 48);
                ctx.fillStyle = '#a87040';
                ctx.fillRect(cx - 48, cy - 22, 96, 1);
                ctx.fillRect(cx - 48, cy + 26, 96, 1);
                // Banner
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(cx - 46, cy - 20, 92, 1);
                ctx.fillRect(cx - 46, cy - 16, 92, 1);
                // Headline
                drawPixelText(ctx, 'CLIPPY FAILS', cx, cy - 14, '#1a0e1e', 1, 'center', 1);
                // Subhead
                drawPixelText(ctx, 'USERS HATE PAPERCLIP', cx, cy - 4, '#806848', 1, 'center', 1);
                // Photo placeholder (clippy face)
                ctx.fillStyle = '#a8a8c0';
                ctx.fillRect(cx - 38, cy + 4, 18, 18);
                ctx.fillStyle = '#5a5060';
                ctx.fillRect(cx - 38, cy + 4, 18, 1);
                // Tiny clippy face in the photo
                ctx.fillStyle = '#2a5298';
                ctx.fillRect(cx - 34, cy + 10, 2, 3);
                ctx.fillRect(cx - 28, cy + 10, 2, 3);
                ctx.fillStyle = '#a82020';
                ctx.fillRect(cx - 34, cy + 16, 6, 1);
                // Columns of body text
                ctx.fillStyle = '#806848';
                for (let col = 0; col < 2; col++) {
                    const colX = cx - 14 + col * 28;
                    for (let r = 0; r < 6; r++) {
                        const len = ((col * 5 + r * 3) & 7) + 12;
                        ctx.fillRect(colX, cy + 4 + r * 3, len, 1);
                    }
                }
                // Crumple shadow
                ctx.fillStyle = 'rgba(0,0,0,0.18)';
                ctx.fillRect(cx + 30, cy - 22, 18, 48);
                break;
            }
            case 'bandana': {
                // Big version of the bandana paperclip - heroic pose
                const x = cx - 12, y = cy - 24;
                // Bandana
                ctx.fillStyle = '#aa2828';
                ctx.fillRect(x + 2, y + 4, 20, 2);
                ctx.fillStyle = '#cc4444';
                ctx.fillRect(x + 2, y + 2, 20, 2);
                ctx.fillStyle = '#ff6b6b';
                ctx.fillRect(x + 2, y + 1, 20, 1);
                // Bandana tail
                ctx.fillStyle = '#cc4444';
                ctx.fillRect(x + 18, y + 5, 6, 2);
                ctx.fillRect(x + 22, y + 7, 4, 4);
                // Paperclip outer loop
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(x, y + 6, 24, 3);
                ctx.fillRect(x, y + 6, 3, 36);
                ctx.fillRect(x + 21, y + 6, 3, 38);
                ctx.fillRect(x, y + 39, 22, 3);
                // Inner highlight
                ctx.fillStyle = '#a8a8c0';
                ctx.fillRect(x + 3, y + 9, 18, 1);
                ctx.fillRect(x + 3, y + 9, 1, 30);
                // Inner loop
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(x + 5, y + 13, 14, 3);
                ctx.fillRect(x + 5, y + 13, 3, 18);
                ctx.fillRect(x + 16, y + 13, 3, 18);
                // Determined eyes
                ctx.fillStyle = '#fff';
                ctx.fillRect(x + 6, y + 20, 4, 4);
                ctx.fillRect(x + 14, y + 20, 4, 4);
                ctx.fillStyle = '#2a5298';
                ctx.fillRect(x + 7, y + 21, 2, 3);
                ctx.fillRect(x + 15, y + 21, 2, 3);
                // Angry brow
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(x + 5, y + 18, 6, 1);
                ctx.fillRect(x + 13, y + 18, 6, 1);
                ctx.fillRect(x + 6, y + 19, 1, 1);
                ctx.fillRect(x + 17, y + 19, 1, 1);
                // Mouth (grim line)
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(x + 9, y + 28, 6, 1);
                // Gun in hand on the side
                ctx.fillStyle = '#3a2410';
                ctx.fillRect(x + 24, y + 30, 10, 2);
                ctx.fillStyle = '#1a0e08';
                ctx.fillRect(x + 24, y + 32, 4, 2);
                ctx.fillStyle = '#806848';
                ctx.fillRect(x + 32, y + 30, 2, 1);
                break;
            }
            case 'glasses': {
                // Bill Gates glasses gleam in the dark - perfect foreshadow
                // Dark backdrop
                ctx.fillStyle = '#0a0612';
                ctx.fillRect(cx - 80, cy - 26, 160, 50);
                // Faint hair silhouette around the glasses
                ctx.fillStyle = '#1a0e08';
                ctx.fillRect(cx - 24, cy - 18, 48, 8);
                ctx.fillRect(cx - 26, cy - 14, 4, 14);
                ctx.fillRect(cx + 22, cy - 14, 4, 14);
                // Two giant rectangular glasses frames
                ctx.fillStyle = '#1a1a22';
                ctx.fillRect(cx - 22, cy - 6, 16, 12);
                ctx.fillRect(cx + 6, cy - 6, 16, 12);
                // Bridge
                ctx.fillRect(cx - 6, cy - 2, 12, 2);
                // Reflective lens
                ctx.fillStyle = '#1a508a';
                ctx.fillRect(cx - 20, cy - 4, 12, 8);
                ctx.fillRect(cx + 8, cy - 4, 12, 8);
                // Gleam line - rotates across the lens over time
                const phase = (this.storyTimer * 0.05) % 1;
                ctx.fillStyle = '#fff';
                const gx1 = cx - 20 + phase * 12;
                const gx2 = cx + 8 + phase * 12;
                ctx.fillRect(Math.floor(gx1), cy - 4, 2, 8);
                ctx.fillRect(Math.floor(gx2), cy - 4, 2, 8);
                // Smug smirk underneath
                ctx.fillStyle = '#3a1a18';
                for (let i = 0; i < 7; i++) {
                    ctx.fillRect(cx - 3 + i, cy + 12 - Math.floor(i * 0.4), 1, 1);
                }
                break;
            }
            case 'phoneRing': {
                // A red corporate telephone with rings emanating outward
                ctx.fillStyle = '#0a0612';
                ctx.fillRect(cx - 70, cy - 20, 140, 40);
                // Phone base
                ctx.fillStyle = '#a82020';
                ctx.fillRect(cx - 14, cy + 2, 28, 12);
                ctx.fillStyle = '#cc4444';
                ctx.fillRect(cx - 14, cy + 2, 28, 1);
                ctx.fillStyle = '#601010';
                ctx.fillRect(cx - 14, cy + 13, 28, 1);
                // Phone dial
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(cx - 10, cy + 5, 20, 7);
                ctx.fillStyle = '#fff';
                for (let r = 0; r < 2; r++) {
                    for (let c = 0; c < 4; c++) {
                        ctx.fillRect(cx - 8 + c * 5, cy + 6 + r * 3, 2, 2);
                    }
                }
                // Handset on top
                ctx.fillStyle = '#a82020';
                ctx.fillRect(cx - 14, cy - 4, 28, 4);
                ctx.fillStyle = '#cc4444';
                ctx.fillRect(cx - 14, cy - 4, 28, 1);
                // Earpieces
                ctx.fillStyle = '#601010';
                ctx.fillRect(cx - 14, cy - 6, 6, 6);
                ctx.fillRect(cx + 8, cy - 6, 6, 6);
                // Rings ringing - animated
                const ringPhase = Math.floor(this.storyTimer / 6) % 4;
                ctx.fillStyle = '#ffe070';
                for (let r = 1; r <= 3; r++) {
                    if (ringPhase === r % 4) {
                        const rr = r * 8;
                        // Top-left and top-right curves
                        for (let a = -1; a <= 1; a += 0.2) {
                            const rx = Math.floor(cx - 18 + Math.cos(a) * rr);
                            const ry = Math.floor(cy - 8 + Math.sin(a) * rr - rr * 0.3);
                            ctx.fillRect(rx, ry, 1, 1);
                            ctx.fillRect(cx + (cx - 18 - rx), ry, 1, 1);
                        }
                    }
                }
                // "RING" text
                drawPixelTextOutlined(ctx, 'RING', cx, cy - 18, '#ffe070', '#a82020', 1, 'center', 1);
                break;
            }
            case 'silhouette': {
                // A lone silhouette approaching - used for "he's getting too close"
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(cx - 80, cy - 16, 160, 32);
                // Floor line
                ctx.fillStyle = '#3a2855';
                ctx.fillRect(cx - 80, cy + 16, 160, 1);
                // Silhouette - Clippy approaching
                this._drawClippyPortrait(ctx, cx, cy + 4, 'happy');
                // Long shadow behind
                ctx.fillStyle = '#0a0612';
                ctx.fillRect(cx - 8, cy + 17, 16, 4);
                // Vignette gradient via dither
                ctx.fillStyle = '#000';
                for (let y = -16; y <= 16; y += 4) {
                    for (let x = -80; x <= 80; x += 4) {
                        if (Math.abs(x) > 50) ctx.fillRect(cx + x, cy + y, 1, 1);
                    }
                }
                break;
            }
            default: {
                // Default: simple horizontal divider line
                ctx.fillStyle = '#3a2855';
                ctx.fillRect(cx - 40, cy, 80, 1);
            }
        }
    }

    // ---- Story flair helpers - reusable little paperclip portraits ----

    _drawClippyPortrait(ctx, x, y, mood) {
        // Standard paperclip with face. mood = 'happy' | 'sad' | 'broken' | 'waving'
        // x,y is the center of the paperclip body
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x - 6, y - 8, 12, 2);     // top bar
        ctx.fillRect(x - 6, y - 8, 2, 16);     // left side
        ctx.fillRect(x + 4, y - 8, 2, 18);     // right side (taller)
        ctx.fillRect(x - 6, y + 8, 10, 2);     // bottom bar
        // Inner loop
        ctx.fillRect(x - 3, y - 5, 6, 2);
        ctx.fillRect(x - 3, y - 5, 2, 8);
        ctx.fillRect(x + 1, y - 5, 2, 8);
        // Highlight
        ctx.fillStyle = '#a8a8c0';
        ctx.fillRect(x - 5, y - 7, 1, 14);
        // Eyes - vary by mood
        if (mood === 'sad' || mood === 'broken') {
            ctx.fillStyle = '#80a8c0';
            ctx.fillRect(x - 2, y + 2, 2, 1);
            ctx.fillRect(x,     y + 2, 2, 1);
            ctx.fillStyle = '#5aa8e0';
            ctx.fillRect(x - 2, y + 3, 1, 1);
            ctx.fillRect(x + 1, y + 3, 1, 1);
            // Tear
            if (mood === 'sad' && ((this.storyTimer & 31) < 16)) {
                ctx.fillStyle = '#5aa8e0';
                ctx.fillRect(x - 1, y + 4, 1, 2);
            }
            // Frown
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x - 2, y + 7, 4, 1);
            ctx.fillRect(x - 3, y + 6, 1, 1);
            ctx.fillRect(x + 2, y + 6, 1, 1);
        } else if (mood === 'waving') {
            // Happy + waving arm
            ctx.fillStyle = '#fff';
            ctx.fillRect(x - 3, y + 1, 2, 2);
            ctx.fillRect(x + 1, y + 1, 2, 2);
            ctx.fillStyle = '#2a5298';
            ctx.fillRect(x - 3, y + 1, 1, 1);
            ctx.fillRect(x + 1, y + 1, 1, 1);
            // Smile
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x - 2, y + 5, 4, 1);
            ctx.fillRect(x - 3, y + 4, 1, 1);
            ctx.fillRect(x + 2, y + 4, 1, 1);
            // Waving arm bobs
            const wave = (this.storyTimer & 8) < 4 ? 0 : -2;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x + 6, y - 4 + wave, 4, 2);
            ctx.fillRect(x + 8, y - 6 + wave, 2, 2);
        } else {
            // Happy default
            ctx.fillStyle = '#fff';
            ctx.fillRect(x - 3, y + 1, 2, 2);
            ctx.fillRect(x + 1, y + 1, 2, 2);
            ctx.fillStyle = '#2a5298';
            ctx.fillRect(x - 3, y + 1, 1, 1);
            ctx.fillRect(x + 1, y + 1, 1, 1);
            // Smile
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x - 2, y + 5, 4, 1);
            ctx.fillRect(x - 3, y + 4, 1, 1);
            ctx.fillRect(x + 2, y + 4, 1, 1);
        }
    }

    _drawClippettaPortrait(ctx, x, y) {
        // Same paperclip shape as Clippy but pink bow + lashes + lipstick
        // Body
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x - 6, y - 8, 12, 2);
        ctx.fillRect(x - 6, y - 8, 2, 16);
        ctx.fillRect(x + 4, y - 8, 2, 18);
        ctx.fillRect(x - 6, y + 8, 10, 2);
        ctx.fillRect(x - 3, y - 5, 6, 2);
        ctx.fillRect(x - 3, y - 5, 2, 8);
        ctx.fillRect(x + 1, y - 5, 2, 8);
        ctx.fillStyle = '#c0a0d0';
        ctx.fillRect(x - 5, y - 7, 1, 14);
        // Pink bow on top
        ctx.fillStyle = '#ff80c0';
        ctx.fillRect(x - 4, y - 11, 3, 3);
        ctx.fillRect(x + 1, y - 11, 3, 3);
        ctx.fillRect(x - 1, y - 11, 2, 2);
        ctx.fillStyle = '#ffa0d0';
        ctx.fillRect(x - 4, y - 11, 1, 1);
        ctx.fillRect(x + 3, y - 11, 1, 1);
        // Eyes with eyelashes
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 3, y + 1, 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, 2);
        ctx.fillStyle = '#8030c0';
        ctx.fillRect(x - 3, y + 1, 1, 1);
        ctx.fillRect(x + 1, y + 1, 1, 1);
        // Eyelashes
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x - 4, y, 1, 1);
        ctx.fillRect(x - 3, y - 1, 1, 1);
        ctx.fillRect(x + 2, y, 1, 1);
        ctx.fillRect(x + 3, y - 1, 1, 1);
        // Lipstick smile
        ctx.fillStyle = '#ff5050';
        ctx.fillRect(x - 2, y + 5, 4, 1);
        ctx.fillRect(x - 3, y + 4, 1, 1);
        ctx.fillRect(x + 2, y + 4, 1, 1);
    }

    _drawClippyKid(ctx, x, y) {
        // Smaller paperclip (kid)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x - 4, y - 4, 8, 1);
        ctx.fillRect(x - 4, y - 4, 1, 10);
        ctx.fillRect(x + 3, y - 4, 1, 12);
        ctx.fillRect(x - 4, y + 5, 7, 1);
        ctx.fillRect(x - 2, y - 2, 4, 1);
        ctx.fillRect(x - 2, y - 2, 1, 5);
        ctx.fillRect(x + 1, y - 2, 1, 5);
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 2, y + 1, 1, 1);
        ctx.fillRect(x + 1, y + 1, 1, 1);
        ctx.fillStyle = '#2a5298';
        ctx.fillRect(x - 2, y + 1, 1, 1);
        ctx.fillRect(x + 1, y + 1, 1, 1);
        // Smile
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x - 1, y + 3, 2, 1);
    }

    _drawPaperclipDog(ctx, x, y) {
        // Tiny paperclip with floppy ears and a curled tail - the family pet
        ctx.fillStyle = '#604030';
        // Body (sideways paperclip)
        ctx.fillRect(x - 6, y, 12, 4);
        ctx.fillRect(x - 6, y - 1, 1, 5);
        ctx.fillRect(x + 5, y - 1, 1, 5);
        // Floppy ear
        ctx.fillRect(x - 5, y - 3, 3, 3);
        // Tail curl
        ctx.fillRect(x + 6, y - 2, 2, 2);
        ctx.fillRect(x + 7, y, 1, 2);
        // Eye
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 3, y + 1, 1, 1);
        // Collar
        ctx.fillStyle = '#ff5050';
        ctx.fillRect(x + 3, y, 1, 4);
        // Legs
        ctx.fillStyle = '#3a2410';
        ctx.fillRect(x - 4, y + 4, 1, 2);
        ctx.fillRect(x - 1, y + 4, 1, 2);
        ctx.fillRect(x + 2, y + 4, 1, 2);
    }

    _fillCircle(ctx, cx, cy, r, color) {
        if (r <= 0) return;
        ctx.fillStyle = color;
        const ir = Math.floor(r);
        const r2 = ir * ir;
        for (let dy = -ir; dy <= ir; dy++) {
            const half = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
            ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
        }
    }

    updateStageIntro() {
        this.stageIntroTimer++;
        this.background.update();
        input.update();
        // Auto-advance after 2.5 seconds, or shoot/jump to skip
        if (this.stageIntroTimer > 150 || input.jumpPressed || input.shoot) {
            this.screen = 'playing';
            this.stageStartTime = Date.now();
            this.slowMoUsedThisStage = false;
            this.slowMoTimer = 0;
            // Mark the whole-run start at Stage 1 only
            if (this.stageIndex === 0 && !this.bossRushMode) {
                this.runStartTime = Date.now();
                this.runDeaths = 0;
                this.runEnemiesDefeated = 0;
                this.runSecretsFound = 0;
                this.runWeaponDamage = {};
            }
            // Start replay-ghost recording + load ghost for this stage
            // (skipped in boss rush since stages are mashed together)
            if (!this.bossRushMode) {
                this.recordingFrames = [];
                this.recordingTick = 0;
                this.ghostFrames = this.loadGhostForStage(this.stageIndex);
                this.ghostFrame = 0;
            } else {
                this.recordingFrames = null;
                this.ghostFrames = null;
            }
            // Snapshot run-deaths so stage-clear can tell if the player
            // died this stage (for the NO_DEATH_STAGE achievement).
            this._stageStartDeaths = this.runDeaths;
            // Kick off the first-time tutorial on Stage 1 only
            if (this.stageIndex === 0 && !this.tutorialDone && !this.bossRushMode) {
                this.tutorialStep = 0;
                this.tutorialTimer = 0;
            } else {
                this.tutorialStep = 4;
            }
            if (typeof audio !== 'undefined') {
                // Stop any previous theme so the new one snaps in cleanly
                audio.stopMusic();
                const theme = this.level.theme || 'jungle';
                audio.startMusic(theme);
            }
            // Spawn / refresh Player 2 if co-op is enabled
            if (this.coopEnabled) {
                this.player2 = new Player(this.player.x + 20, this.player.y, p2View);
                this.player2.facingRight = false;
            } else {
                this.player2 = null;
            }
        }
    }

    renderStageIntro() {
        const ctx = this.ctx;
        // Solid black background for dramatic effect
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        // Slide-in panel from top + bottom
        const t = Math.min(1, this.stageIntroTimer / 30);
        const panelTop = -40 + t * 80;
        const panelBot = GAME.HEIGHT + 20 - t * 60;

        ctx.fillStyle = '#3a2855';
        ctx.fillRect(0, panelTop - 4, GAME.WIDTH, 80);
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(0, panelTop, GAME.WIDTH, 72);
        ctx.fillStyle = '#564468';
        ctx.fillRect(0, panelTop, GAME.WIDTH, 2);
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, panelTop + 72, GAME.WIDTH, 2);

        // Stage header
        drawPixelTextOutlined(ctx, `STAGE ${this.stageNumber}`, GAME.WIDTH / 2, panelTop + 14, '#ffe070', '#a82020', 2, 'center', 1);
        // Stage name
        drawPixelTextOutlined(ctx, this.stageName, GAME.WIDTH / 2, panelTop + 42, '#ff5050', '#1a0000', 3, 'center', 1);

        // Bottom hint line
        const blink = Math.floor(this.stageIntroTimer / 18) % 2 === 0;
        if (blink && this.stageIntroTimer > 60) {
            drawPixelText(ctx, 'READY?', GAME.WIDTH / 2, panelBot, '#ffffff', 2, 'center', 1);
        }
    }

    renderTitle() {
        const ctx = this.ctx;
        // Clear and draw the parallax background as if at world x=0
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        this.background.draw(ctx, { x: 0, y: 0 });

        // Dim the scene slightly so the title pops
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        // ---- Title logo ----
        // Top line: "CLIPPY" big and red
        drawPixelTextOutlined(ctx, 'CLIPPY', GAME.WIDTH / 2, 36, '#ff5050', '#1a0000', 4, 'center', 1);
        // Subtitle: "FIRST BLOOD" smaller, yellow with red shadow
        drawPixelTextOutlined(ctx, 'FIRST BLOOD', GAME.WIDTH / 2, 76, '#ffe070', '#a82020', 2, 'center', 1);

        // ---- Decorative paperclip on left/right of title ----
        this.drawTitleClippyIcon(ctx, GAME.WIDTH / 2 - 88, 38);
        this.drawTitleClippyIcon(ctx, GAME.WIDTH / 2 + 64, 38);

        // ---- Press Start ----
        const blink = Math.floor(this.titleTimer / 30) % 2 === 0;
        if (blink) {
            drawPixelTextOutlined(ctx, 'PRESS SHOOT TO START', GAME.WIDTH / 2, 140, '#ffffff', '#000000', 1, 'center', 1);
        }
        // Boss-rush hint (only after first completion)
        if (this.bossRushUnlocked) {
            const altBlink = Math.floor(this.titleTimer / 30) % 2 === 1;
            if (altBlink) {
                drawPixelTextOutlined(ctx, 'UP FOR BOSS RUSH', GAME.WIDTH / 2, 178, '#ff60ff', '#3a0a3a', 1, 'center', 1);
            }
        }

        // ---- Credit / tagline ----
        drawPixelText(ctx, 'A PAPERCLIP HERO REBORN', GAME.WIDTH / 2, 116, '#c0a0d0', 1, 'center', 1);

        // High score
        if (this.highScore > 0) {
            drawPixelText(ctx, 'HIGH ' + String(this.highScore).padStart(6, '0'),
                GAME.WIDTH / 2, 158, '#a890c0', 1, 'center', 1);
        }

        // Difficulty selector
        const diffY = 168;
        drawPixelText(ctx, '<  DIFFICULTY  >', GAME.WIDTH / 2, diffY - 8, '#7a6090', 1, 'center', 1);
        drawPixelTextOutlined(ctx, this.difficulty.name, GAME.WIDTH / 2, diffY, this.difficulty.color, '#1a0e1e', 1, 'center', 1);
        // Co-op P2 indicator (always available)
        if (this.coopEnabled) {
            drawPixelTextOutlined(ctx, '2P ON', GAME.WIDTH / 2 - 80, diffY,
                '#ff60ff', '#3a0a3a', 1, 'center', 1);
        } else {
            const blink = (this.titleTimer & 16) < 8;
            if (blink) drawPixelText(ctx, '2 CO-OP', GAME.WIDTH / 2 - 80, diffY, '#7a6090', 1, 'center', 1);
        }
        // NewGame+ indicator next to the difficulty when unlocked
        if (this.bossRushUnlocked) {
            const blink = (this.titleTimer & 16) < 8;
            if (this.newGamePlus) {
                drawPixelTextOutlined(ctx, 'NG+', GAME.WIDTH / 2 + 56, diffY, '#ff60ff', '#3a0a3a', 1, 'center', 1);
            } else if (blink) {
                drawPixelText(ctx, 'N NG+', GAME.WIDTH / 2 + 56, diffY, '#7a6090', 1, 'center', 1);
            }
        }

        drawPixelText(ctx, 'C 2026 OFFICE WARFARE LTD.', GAME.WIDTH / 2, 200, '#7a6090', 1, 'center', 1);

        // Controls hint at bottom - keep it short and obvious
        drawPixelText(ctx, 'Z JUMP   X SHOOT   P PAUSE   M MUTE', GAME.WIDTH / 2, 205, '#a8a0c0', 1, 'center', 1);
        const menuBlink = (this.titleTimer & 32) < 16;
        if (menuBlink) {
            drawPixelTextOutlined(ctx, 'PRESS ENTER FOR MENU',
                GAME.WIDTH / 2, 215, '#ffe070', '#1a0e1e', 1, 'center', 1);
        }
    }

    // Persist the run's best combo if it improves on the stored value.
    // Used by the Blood Moon skin unlock check.
    persistMaxCombo() {
        if (this.comboBest <= 0) return;
        try {
            const prev = parseInt(localStorage.getItem('clippy_first_blood_max_combo') || '0', 10);
            if (this.comboBest > prev) {
                localStorage.setItem('clippy_first_blood_max_combo', String(this.comboBest));
            }
        } catch (e) {}
    }

    // ---- Leaderboard (split by difficulty) ----
    leaderboardKey(diffKey) {
        // Backwards-compat with the original single-list key.
        if (diffKey === 'NORMAL') {
            return 'clippy_first_blood_leaderboard';
        }
        return 'clippy_first_blood_leaderboard_' + diffKey.toLowerCase();
    }

    loadLeaderboard(diffKey) {
        diffKey = diffKey || this.difficultyKeys[this.difficultyIndex];
        try {
            const raw = localStorage.getItem(this.leaderboardKey(diffKey));
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    }

    saveLeaderboard(entries, diffKey) {
        diffKey = diffKey || this.difficultyKeys[this.difficultyIndex];
        try {
            localStorage.setItem(this.leaderboardKey(diffKey), JSON.stringify(entries));
        } catch (e) {}
    }

    addToLeaderboard(name, score, runTime) {
        const diffKey = this.difficultyKeys[this.difficultyIndex];
        const entries = this.loadLeaderboard(diffKey);
        const entry = {
            name, score, time: runTime, date: Date.now(),
            difficulty: diffKey,
            ngplus: !!this.newGamePlus
        };
        entries.push(entry);
        entries.sort((a, b) => b.score - a.score);
        const trimmed = entries.slice(0, 10);
        this.saveLeaderboard(trimmed, diffKey);
        // Stash the most-recent entry so the SHARE row in the leaderboard
        // can build a URL even after we leave the initials screen.
        this.lastEntry = entry;
        // Fire off an async POST to the configured endpoint (no-op if none)
        if (typeof OnlineLeaderboard !== 'undefined' && OnlineLeaderboard.isOnline()) {
            OnlineLeaderboard.submit(entry);
        }
        return trimmed;
    }

    // Merge an incoming shared entry into the local board.
    importSharedEntry(entry) {
        if (!entry || !entry.name || !entry.score) return false;
        const diff = this.difficultyKeys.includes(entry.difficulty) ? entry.difficulty : 'NORMAL';
        const entries = this.loadLeaderboard(diff);
        entries.push({
            name: String(entry.name).slice(0, 3).toUpperCase(),
            score: entry.score | 0,
            time: Number(entry.time) || 0,
            date: Date.now(),
            difficulty: diff,
            ngplus: !!entry.ngplus
        });
        entries.sort((a, b) => b.score - a.score);
        this.saveLeaderboard(entries.slice(0, 10), diff);
        return true;
    }

    qualifiesForLeaderboard(score) {
        if (score <= 0) return false;
        const entries = this.loadLeaderboard();
        if (entries.length < 10) return true;
        return score > entries[entries.length - 1].score;
    }

    drawTitleClippyIcon(ctx, x, y) {
        // 24x24 stylized Clippy paperclip icon for the title flanks
        // Bandana
        ctx.fillStyle = '#cc4444';
        ctx.fillRect(x + 4, y + 1, 16, 2);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(x + 4, y, 16, 1);
        ctx.fillStyle = '#aa2828';
        ctx.fillRect(x + 4, y + 3, 16, 1);
        // Paperclip outer loop
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + 4, y + 4, 16, 2);
        ctx.fillRect(x + 4, y + 4, 2, 16);
        ctx.fillRect(x + 18, y + 4, 2, 18);
        ctx.fillRect(x + 4, y + 20, 14, 2);
        // Inner highlight
        ctx.fillStyle = '#a8a8c0';
        ctx.fillRect(x + 6, y + 6, 12, 1);
        ctx.fillRect(x + 6, y + 6, 1, 14);
        // Inner loop
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + 8, y + 8, 10, 2);
        ctx.fillRect(x + 8, y + 8, 2, 8);
        ctx.fillRect(x + 14, y + 8, 2, 8);
        // Eyes (peering over the paperclip)
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 8, y + 12, 3, 3);
        ctx.fillRect(x + 13, y + 12, 3, 3);
        ctx.fillStyle = '#2a5298';
        ctx.fillRect(x + 9, y + 13, 1, 2);
        ctx.fillRect(x + 14, y + 13, 1, 2);
    }

    update() {
        // Single input.update() per frame, here at the top
        input.update();

        // Konami code tick (works during gameplay)
        this.tickKonami();
        if (this.konamiFlash > 0) this.konamiFlash--;

        // Pause toggle
        if (input.pausePressed) {
            this.paused = !this.paused;
            return;
        }
        if (this.paused) {
            // F captures a screenshot from the paused frame
            if (input.keysJustPressed['KeyF']) {
                this.capturePhoto();
                this.photoFlash = 12;
            }
            // Pause menu rows: 0 = music, 1 = sfx, 2 = screen shake, 3 = quit to title
            const rows = 4;
            if (input.keysJustPressed['ArrowUp'])   this.pauseMenuCursor = (this.pauseMenuCursor + rows - 1) % rows;
            if (input.keysJustPressed['ArrowDown']) this.pauseMenuCursor = (this.pauseMenuCursor + 1) % rows;
            const step = 0.04;
            if (input.left) {
                if (typeof audio !== 'undefined') {
                    if (this.pauseMenuCursor === 0) audio.setMusicVolume(audio.musicVolume - step);
                    if (this.pauseMenuCursor === 1) audio.setSfxVolume(audio.sfxVolume - step);
                }
                if (this.pauseMenuCursor === 2) this.setShakeIntensity(this.shakeIntensity - step);
            }
            if (input.right) {
                if (typeof audio !== 'undefined') {
                    if (this.pauseMenuCursor === 0) audio.setMusicVolume(audio.musicVolume + step);
                    if (this.pauseMenuCursor === 1) audio.setSfxVolume(audio.sfxVolume + step);
                }
                if (this.pauseMenuCursor === 2) this.setShakeIntensity(this.shakeIntensity + step);
            }
            // SHOOT on the QUIT row returns to title (after a confirm step)
            if (this.pauseMenuCursor === 3 && (input.shoot || input.jumpPressed)) {
                if (this.quitConfirm) {
                    // Confirmed - quit to title
                    this.paused = false;
                    this.quitConfirm = false;
                    if (typeof audio !== 'undefined') audio.stopMusic();
                    this.checkHighScore();
                    this.screen = 'title';
                    this.titleTimer = 0;
                    return;
                }
                this.quitConfirm = true;
                this.quitConfirmTimer = 90;
            }
            // Cancel the pending confirm after a short timeout
            if (this.quitConfirm) {
                this.quitConfirmTimer--;
                if (this.quitConfirmTimer <= 0 || input.keysJustPressed['Escape']) {
                    this.quitConfirm = false;
                }
            }
            return;
        }
        // Resuming from pause should clear any pending quit confirm
        this.quitConfirm = false;

        // During boss intro the player stops moving but enemies + bg still animate
        if (!this.bossIntroActive) {
            this.player.update(this.level);
            if (this.player2 && this.player2.state !== PLAYER_STATE.DYING) {
                this.player2.update(this.level);
            }
        }

        // Update enemies vs both players (P1 is the primary; P2 takes hits too)
        this.enemies.update(this.level, this.player);
        if (this.player2) {
            // Run enemy collision against P2 by passing them as the target
            // for collision-only purposes - reuse the manager's pass since
            // its main loop already iterates enemies once.
            this.applyEnemyHitsTo(this.player2);
        }

        // Update pickups
        if (typeof pickupManager !== 'undefined') pickupManager.update(this.player);

        // Update background and effects
        this.background.update();
        if (typeof particles !== 'undefined') particles.update();
        if (typeof achievements !== 'undefined') achievements.update();
        this.updateShake();
        if (this.slowMoTimer > 0) this.slowMoTimer--;

        // Boss warning + intro pan trigger
        if (!this.bossWarningShown && this.level.bossArenaX &&
            this.player.x > this.level.bossArenaX - 80) {
            this.bossWarningShown = true;
            // Find the boss so the camera can pan to it
            const boss = this.enemies.enemies.find(e => e.isBoss && e.isBoss());
            if (boss) {
                this.bossIntroActive = true;
                this.bossIntroTimer = 0;
                this.bossIntroEnemy = boss;
            } else {
                this.bossWarning = 120;
            }
            if (typeof game !== 'undefined' && game.shake) game.shake(3, 30);
        }
        if (this.bossWarning > 0) this.bossWarning--;

        // Drive boss intro pan (camera locked, slow zoom-in feel)
        if (this.bossIntroActive) {
            this.bossIntroTimer++;
            // After 90 frames, kick off the WARNING banner and resume normal play
            if (this.bossIntroTimer > 90) {
                this.bossIntroActive = false;
                this.bossWarning = 90;
            }
        }

        // Pickup flash timer
        if (this.pickupFlashTimer > 0) this.pickupFlashTimer--;

        // Combo timer: ticks down each frame; combo resets when it expires
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer === 0) this.combo = 0;
        }

        // Drive the first-run tutorial state machine.
        this.tickTutorial();

        // P2 respawn loop - if they've died, give them 60 frames then revive
        // next to P1 (lives are not consumed - co-op is forgiving).
        if (this.player2 && this.player2.state === PLAYER_STATE.DYING) {
            this.player2.deathTimer = (this.player2.deathTimer || 0) + 1;
            if (this.player2.deathTimer > 60) {
                this.player2 = new Player(this.player.x + 16, this.player.y - 8, p2View);
            }
        }

        // Daily-challenge: chaos modifier swaps the weapon every 10s
        if (this.dailyMode && this.dailyChaos && this.player) {
            this._dailyChaosTick = (this._dailyChaosTick || 0) + 1;
            if (this._dailyChaosTick % 600 === 0) {
                const weapons = [WEAPON.MACHINE_GUN, WEAPON.SPREAD, WEAPON.LASER,
                                 WEAPON.FLAME, WEAPON.STAPLE_REMOVER,
                                 WEAPON.HOMING, WEAPON.THUNDER];
                this.player.weapon = weapons[Math.floor(Math.random() * weapons.length)];
                if (this.flashPickup) this.flashPickup('CHAOS - ' + this.player.weapon.name);
            }
        }

        // Replay ghost: record player snapshot every Nth frame
        if (this.recordingFrames && this.player) {
            this.recordingTick++;
            if (this.recordingTick % this.GHOST_SAMPLE === 0) {
                this.recordingFrames.push({
                    x: this.player.x,
                    y: this.player.y,
                    state: this.player.state,
                    animFrame: this.player.animFrame || 0,
                    facingRight: this.player.facingRight
                });
            }
            // Advance ghost playback if loaded
            if (this.ghostFrames && this.recordingTick % this.GHOST_SAMPLE === 0) {
                this.ghostFrame++;
            }
        }

        // Update camera to follow player
        this.updateCamera();

        // Check win/lose conditions
        this.checkGameState();
    }

    updateCamera() {
        // Boss intro: aim at the boss instead of the player
        let focusX, focusY;
        if (this.bossIntroActive && this.bossIntroEnemy) {
            focusX = this.bossIntroEnemy.x + this.bossIntroEnemy.width / 2;
            focusY = this.bossIntroEnemy.y + this.bossIntroEnemy.height / 2;
        } else {
            focusX = this.player.x + this.player.width / 2;
            focusY = this.player.y + this.player.height / 2;
        }
        this.camera.targetX = focusX - GAME.WIDTH / 2;
        this.camera.targetY = focusY - GAME.HEIGHT / 2;

        // Clamp to level bounds
        this.camera.targetX = Math.max(0, Math.min(
            this.level.width * GAME.TILE_SIZE - GAME.WIDTH,
            this.camera.targetX
        ));
        this.camera.targetY = Math.max(0, Math.min(
            this.level.height * GAME.TILE_SIZE - GAME.HEIGHT,
            this.camera.targetY
        ));

        // Smooth camera movement
        this.camera.x += (this.camera.targetX - this.camera.x) * this.camera.smoothing;
        this.camera.y += (this.camera.targetY - this.camera.y) * this.camera.smoothing;
    }

    checkGameState() {
        // Player death - wait for full death animation before respawning
        if (this.player.state === PLAYER_STATE.DYING && (this.player.deathTimer || 0) >= 90) {
            this.lives--;
            if (this.lives <= 0) {
                this.gameOver = true;
                if (typeof audio !== 'undefined') audio.stopMusic();
                this.checkHighScore();
            } else {
                // Respawn at the latest passed checkpoint
                const cp = this.getCurrentCheckpoint();
                this.player = new Player(cp.x, cp.y);
            }
        }

        // Win condition (reach end of level)
        const endX = this.level.endX || (this.level.width * GAME.TILE_SIZE - 100);
        if (this.screen === 'playing' && this.player.x > endX) {
            this.beginStageClear();
        }
    }

    // Per-stage best stats (time and score) for the Stage Select tiles.
    getStageBest(stageIndex) {
        try {
            const t = parseFloat(localStorage.getItem(`clippy_first_blood_stage_t_${stageIndex}`) || 'NaN');
            const s = parseInt(localStorage.getItem(`clippy_first_blood_stage_s_${stageIndex}`) || '0', 10);
            return { time: isNaN(t) ? null : t, score: s || 0 };
        } catch (e) { return { time: null, score: 0 }; }
    }
    saveStageBest(stageIndex, timeSeconds, stageScore) {
        try {
            const prev = this.getStageBest(stageIndex);
            if (prev.time === null || timeSeconds < prev.time) {
                localStorage.setItem(`clippy_first_blood_stage_t_${stageIndex}`, String(timeSeconds));
            }
            if (stageScore > prev.score) {
                localStorage.setItem(`clippy_first_blood_stage_s_${stageIndex}`, String(stageScore));
            }
        } catch (e) {}
    }

    beginStageClear() {
        this.screen = 'stageClear';
        this.stageClearTimer = 0;
        this.stageClearTime = (Date.now() - this.stageStartTime) / 1000;
        const ts = Math.max(0, 300 - this.stageClearTime);
        this.stageClearBonusTotal = Math.floor(ts * 100);
        this.stageClearBonusShown = 0;
        this.stageClearScore = this.score;
        // Daily challenge is single-stage: this clear IS the end of the run.
        if (this.dailyMode) {
            dailySaveBest(this.dailyDateString, this.score);
        }
        // Boss rush has just one "stage" so it's always final there. Daily
        // and mod stages are also single-shot. Otherwise it's final when no
        // visible stage remains after this one.
        let isFinal = this.dailyMode
            || this.stageIndex < 0
            || this.bossRushMode
            || (this.stageIndex >= this.stages.length - 1);
        if (!isFinal) {
            isFinal = true;
            for (let i = this.stageIndex + 1; i < this.stages.length; i++) {
                if (!this.stages[i].hidden) { isFinal = false; break; }
            }
        }
        this.stageClearIsFinal = isFinal;
        // Persist the replay ghost if this run beats the saved best time
        if (this.recordingFrames && !this.bossRushMode) {
            this.saveGhostForStage(this.stageIndex, this.recordingFrames, this.stageClearTime);
        }
        this.recordingFrames = null;
        this.ghostFrames = null;
        // Persist per-stage best time + score for the Stage Select hub
        if (!this.bossRushMode) {
            this.saveStageBest(this.stageIndex, this.stageClearTime, this.score);
        }
        // Persist max combo so the Blood Moon skin unlock check passes
        this.persistMaxCombo();
        // Achievements
        if (typeof achievements !== 'undefined') {
            if (this.bossRushMode) {
                achievements.onBossRushCleared();
            } else {
                achievements.onStageCleared(this.stageNumber, this.stageClearTime);
                // Counts deaths *this stage* via stageStartTime baseline - close
                // enough heuristic: if total runDeaths didn't change during the
                // stage, grant the no-death-stage flag. We approximate by
                // saving runDeaths at stage start and comparing here.
                if (this._stageStartDeaths === this.runDeaths) {
                    achievements.onStageClearedNoDeath();
                }
            }
        }
        if (typeof audio !== 'undefined') audio.stopMusic();
    }

    advanceStage() {
        // Find the next non-hidden stage. Hidden stages (like Stage 7
        // THE USURPER) only get reached via the stage-select hub.
        let nextIdx = this.stageIndex + 1;
        while (nextIdx < this.stages.length && this.stages[nextIdx].hidden) {
            nextIdx++;
        }
        if (nextIdx >= this.stages.length) {
            // Loop back to title after finishing all canonical stages
            this.screen = 'title';
            this.titleTimer = 0;
            this.checkHighScore();
            this.score = 0;
            this.lives = 3;
            this.stageIndex = 0;
            this.loadStageByIndex(0);
            this.player = new Player(50, 160);
            return;
        }
        this.loadStageByIndex(nextIdx);
        this.player = new Player(50, 160);
        this.screen = 'stageIntro';
        this.stageIntroTimer = 0;
    }

    render() {
        // Clear
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        // Shift everything by the shake offset (HUD is drawn after restore)
        const shakeX = this.camera.shakeOffsetX;
        const shakeY = this.camera.shakeOffsetY;
        this.ctx.save();
        this.ctx.translate(shakeX, shakeY);

        // Use a shake-adjusted camera for draw calls so world stays consistent
        const shakeCam = { x: this.camera.x, y: this.camera.y };

        // Draw parallax background
        this.background.draw(this.ctx, shakeCam);

        // Draw level
        this.level.draw(this.ctx, shakeCam);

        // Draw pickups (between level and enemies)
        if (typeof pickupManager !== 'undefined') pickupManager.draw(this.ctx, shakeCam);

        // Draw enemies
        this.enemies.draw(this.ctx, shakeCam);

        // Draw the speedrun ghost behind the live player
        if (this.ghostFrames && this.ghostFrames.length > 0) {
            const gf = this.ghostFrames[Math.min(this.ghostFrame, this.ghostFrames.length - 1)];
            if (gf && typeof proceduralSprites !== 'undefined') {
                const gx = gf.x - shakeCam.x;
                const gy = gf.y - shakeCam.y;
                this.ctx.save();
                this.ctx.globalAlpha = 0.35;
                // Pale cyan tint - hard to do per-pixel, so we draw the sprite
                // then overlay a faint cyan rectangle masked to the ghost area.
                proceduralSprites.drawClippy(
                    this.ctx,
                    gx - 16, gy - 16,
                    gf.state, gf.animFrame, gf.facingRight, 0
                );
                this.ctx.fillStyle = 'rgba(120, 220, 255, 0.25)';
                this.ctx.fillRect(gx - 16, gy - 16, 48, 48);
                this.ctx.restore();
            }
        }

        // Draw player(s) - P2 first so P1 reads on top in overlap
        if (this.player2) {
            // Tint P2 magenta so they're visually distinct from P1
            const prevSkin = this.skinId;
            this.skinId = 'rage';     // reuses BLOOD MOON palette for P2
            this.player2.draw(this.ctx, shakeCam);
            this.skinId = prevSkin;
        }
        this.player.draw(this.ctx, shakeCam);

        // Draw particle effects (over world, under HUD)
        if (typeof particles !== 'undefined') particles.draw(this.ctx, shakeCam);

        this.ctx.restore();

        // Draw HUD (unaffected by shake)
        this.drawHUD();

        // Touch controls overlay - only on touch devices
        if (typeof input !== 'undefined' && input.touchEnabled) {
            this.drawTouchControls(this.ctx);
        }

        // Achievement banner
        if (typeof achievements !== 'undefined') {
            achievements.drawBanner(this.ctx);
        }

        // First-time tutorial overlay
        this.drawTutorialOverlay(this.ctx);

        // Draw boss intro letterbox + name banner
        if (this.bossIntroActive) {
            this.drawBossIntro();
        }

        // Draw boss warning banner
        if (this.bossWarning > 0) {
            this.drawBossWarning();
        }

        // Draw pickup acquired flash
        if (this.pickupFlashTimer > 0) {
            this.drawPickupFlash();
        }

        // Konami code activation flash
        if (this.konamiFlash > 0) {
            const a = this.konamiFlash / 60;
            this.ctx.fillStyle = `rgba(255, 96, 255, ${a * 0.4})`;
            this.ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        }

        // Draw pause overlay last so it sits on top of everything
        if (this.paused && !this.gameOver) {
            this.drawPaused();
        }

        // Draw game over screen
        if (this.gameOver) {
            this.drawGameOver();
        }
    }

    drawHUD() {
        const ctx = this.ctx;
        const W = GAME.WIDTH;
        const BAR_H = 22;

        // ---- Top status bar: layered metal bevel ----
        // Outer dark frame
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, W, BAR_H);
        // Inner metal body (banded gradient)
        ctx.fillStyle = '#3a3050';
        ctx.fillRect(0, 1, W, BAR_H - 2);
        ctx.fillStyle = '#564468';
        ctx.fillRect(0, 2, W, 4);
        ctx.fillStyle = '#7a608c';
        ctx.fillRect(0, 3, W, 1);
        ctx.fillStyle = '#2a2240';
        ctx.fillRect(0, BAR_H - 4, W, 2);
        // Top bevel highlight
        ctx.fillStyle = '#b09cc0';
        ctx.fillRect(0, 1, W, 1);
        // Bottom bevel shadow
        ctx.fillStyle = '#000';
        ctx.fillRect(0, BAR_H - 1, W, 1);
        // Rivets along the bar
        ctx.fillStyle = '#0a0612';
        for (let rx = 3; rx < W; rx += 32) {
            ctx.fillRect(rx, 4, 2, 2);
            ctx.fillRect(rx, BAR_H - 6, 2, 2);
        }
        ctx.fillStyle = '#c0a8d0';
        for (let rx = 3; rx < W; rx += 32) {
            ctx.fillRect(rx, 4, 1, 1);
            ctx.fillRect(rx, BAR_H - 6, 1, 1);
        }

        // ---- Clippy life icon + count (left) ----
        this.drawClippyIcon(ctx, 4, 7);
        ctx.fillStyle = '#ffe070';
        ctx.font = 'bold 8px monospace';
        ctx.fillText(`x${this.lives}`, 16, 14);

        // ---- Health bar (center-left) ----
        const hbX = 32, hbY = 6, hbW = 80, hbH = 8;
        // Frame
        ctx.fillStyle = '#000';
        ctx.fillRect(hbX - 1, hbY - 1, hbW + 2, hbH + 2);
        ctx.fillStyle = '#1a0e1e';
        ctx.fillRect(hbX, hbY, hbW, hbH);
        // Health segments
        const segs = 20;
        const pct = Math.max(0, this.player.health / (this.player.maxHealth || PLAYER.MAX_HEALTH));
        const litSegs = Math.ceil(pct * segs);
        const segW = (hbW - 2) / segs;
        for (let i = 0; i < litSegs; i++) {
            const segPct = i / segs;
            let top, bot;
            if (segPct < 0.3)      { top = '#ff5050'; bot = '#a82020'; }
            else if (segPct < 0.6) { top = '#ffd040'; bot = '#a87020'; }
            else                   { top = '#50ff70'; bot = '#208a30'; }
            const sx = hbX + 1 + i * segW;
            ctx.fillStyle = bot;
            ctx.fillRect(sx, hbY + 1, Math.ceil(segW) - 1, hbH - 2);
            ctx.fillStyle = top;
            ctx.fillRect(sx, hbY + 1, Math.ceil(segW) - 1, 2);
        }
        // Bar label
        ctx.fillStyle = '#ffe070';
        ctx.fillText('HP', hbX - 14, hbY + 7);

        // ---- Score panel (right of health bar) ----
        const sX = hbX + hbW + 6;
        ctx.fillStyle = '#000';
        ctx.fillRect(sX, 5, 56, 11);
        ctx.fillStyle = '#1a0e1e';
        ctx.fillRect(sX + 1, 6, 54, 9);
        ctx.fillStyle = '#7af0ff';
        ctx.font = 'bold 8px monospace';
        ctx.fillText(String(this.score).padStart(6, '0'), sX + 4, 14);

        // ---- Weapon panel (far right) ----
        const wX = W - 56;
        ctx.fillStyle = '#000';
        ctx.fillRect(wX, 5, 54, 11);
        ctx.fillStyle = '#2a1838';
        ctx.fillRect(wX + 1, 6, 52, 9);
        ctx.fillStyle = this.player.weapon.color || '#ffd040';
        ctx.fillRect(wX + 2, 8, 6, 5);
        ctx.fillStyle = '#ffe070';
        ctx.font = '8px monospace';
        const wname = this.player.weapon.name.substring(0, 6).toUpperCase();
        ctx.fillText(wname, wX + 10, 14);

        // ---- Status overlays (under the bar) ----
        if (this.player.inCover) {
            this.flashText(ctx, 'IN COVER', W / 2 - 18, BAR_H + 8, '#50ff70');
        }
        if (this.player.timeSinceDamage >= PLAYER.HEALTH_REGEN_DELAY &&
            this.player.health < (this.player.maxHealth || PLAYER.MAX_HEALTH)) {
            this.flashText(ctx, 'RECOVERING', 4, BAR_H + 8, '#7af0ff');
        }

        // ---- Stage timer (small readout under the bar, top-right) ----
        if (this.stageStartTime > 0) {
            const elapsed = (Date.now() - this.stageStartTime) / 1000;
            const mins = Math.floor(elapsed / 60);
            const secs = Math.floor(elapsed % 60);
            const ms = Math.floor((elapsed * 100) % 100);
            const timeStr = `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
            const tX = W - 64;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(tX, BAR_H + 1, 62, 10);
            drawPixelText(ctx, timeStr, tX + 31, BAR_H + 3, '#c0a8d0', 1, 'center', 1);
        }

        // GHOST indicator when a replay ghost is loaded
        if (this.ghostFrames && this.ghostFrames.length > 0) {
            drawPixelText(ctx, 'GHOST', 4, BAR_H + 3, '#7ad8ff', 1, 'left', 1);
        }
        // NG+ chip if a NewGame+ run is in progress
        if (this.newGamePlus && !this.bossRushMode) {
            drawPixelTextOutlined(ctx, 'NG+',
                this.ghostFrames ? 30 : 4, BAR_H + 3,
                '#ff60ff', '#3a0a3a', 1, 'left', 1);
        }

        // Combo readout - centered, pulses with the timer and grows on chain
        if (this.combo >= 2) {
            const mult = 1 + Math.min(4, this.combo * 0.2);
            const cx = W / 2;
            const cy = BAR_H + 4;
            const fade = Math.min(1, this.comboTimer / 30);
            // Big combo number with x and multiplier
            const tier = this.combo >= 15 ? '#ff60ff'
                       : this.combo >= 10 ? '#ff5050'
                       : this.combo >= 5  ? '#ffe070' : '#7af0ff';
            ctx.globalAlpha = fade;
            drawPixelTextOutlined(ctx, this.combo + ' HIT', cx, cy, tier, '#1a0e1e', 1, 'center', 1);
            drawPixelText(ctx, 'x' + mult.toFixed(1), cx, cy + 9, tier, 1, 'center', 1);
            ctx.globalAlpha = 1;
            // Timer bar under the combo
            const barW = 30;
            const fill = Math.floor((this.comboTimer / this.COMBO_WINDOW) * barW);
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - barW / 2 - 1, cy + 18, barW + 2, 3);
            ctx.fillStyle = tier;
            ctx.fillRect(cx - barW / 2, cy + 19, fill, 1);
        }
    }

    drawClippyIcon(ctx, x, y) {
        // Tiny 10x10 Clippy paperclip mascot
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, 10, 10);
        // Bandana
        ctx.fillStyle = '#cc4444';
        ctx.fillRect(x + 2, y + 1, 6, 1);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(x + 2, y, 6, 1);
        // Body (metal paperclip)
        ctx.fillStyle = '#a8a8b8';
        ctx.fillRect(x + 1, y + 2, 8, 7);
        ctx.fillStyle = '#d4d4e0';
        ctx.fillRect(x + 1, y + 2, 1, 6);
        ctx.fillRect(x + 2, y + 2, 6, 1);
        // Eyes
        ctx.fillStyle = '#2a5298';
        ctx.fillRect(x + 3, y + 4, 1, 2);
        ctx.fillRect(x + 6, y + 4, 1, 2);
        ctx.fillStyle = '#6ab2f8';
        ctx.fillRect(x + 3, y + 4, 1, 1);
        ctx.fillRect(x + 6, y + 4, 1, 1);
        // Outline shadow
        ctx.fillStyle = '#5a5060';
        ctx.fillRect(x + 8, y + 3, 1, 5);
        ctx.fillRect(x + 1, y + 8, 8, 1);
    }

    drawTouchControls(ctx) {
        // Match the hit-zones declared in InputHandler.touchButtonAt()
        ctx.save();
        ctx.globalAlpha = 0.55;

        // D-pad on lower-left
        const dx = 32, dy = 188, dr = 28;
        ctx.fillStyle = '#0a0612';
        ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a2855';
        ctx.beginPath(); ctx.arc(dx, dy, dr - 2, 0, Math.PI * 2); ctx.fill();
        // Cross
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(dx - dr + 4, dy - 4, dr * 2 - 8, 8);
        ctx.fillRect(dx - 4, dy - dr + 4, 8, dr * 2 - 8);
        ctx.fillStyle = '#564468';
        ctx.fillRect(dx - dr + 6, dy - 3, dr * 2 - 12, 6);
        ctx.fillRect(dx - 3, dy - dr + 6, 6, dr * 2 - 12);
        // Arrows highlight when pressed
        const arr = (key) => input && input.keys && input.keys[key];
        ctx.fillStyle = '#ffe070';
        if (arr('ArrowUp'))    ctx.fillRect(dx - 2, dy - dr + 8, 4, 6);
        if (arr('ArrowDown'))  ctx.fillRect(dx - 2, dy + dr - 14, 4, 6);
        if (arr('ArrowLeft'))  ctx.fillRect(dx - dr + 8, dy - 2, 6, 4);
        if (arr('ArrowRight')) ctx.fillRect(dx + dr - 14, dy - 2, 6, 4);
        // Arrow icons (always visible faintly)
        ctx.fillStyle = '#a890c0';
        ctx.fillRect(dx - 1, dy - dr + 10, 2, 1);
        ctx.fillRect(dx - 2, dy - dr + 11, 4, 1);
        ctx.fillRect(dx - 1, dy + dr - 11, 2, 1);
        ctx.fillRect(dx - 2, dy + dr - 12, 4, 1);
        ctx.fillRect(dx - dr + 10, dy - 1, 1, 2);
        ctx.fillRect(dx - dr + 11, dy - 2, 1, 4);
        ctx.fillRect(dx + dr - 11, dy - 1, 1, 2);
        ctx.fillRect(dx + dr - 12, dy - 2, 1, 4);

        // Jump button (Z) - lower right
        const jx = GAME.WIDTH - 56, jy = 196;
        this._drawTouchBtn(ctx, jx, jy, 'Z', '#3a2855', arr('KeyZ'));
        // Shoot button (X) - just inside the right edge, slightly up
        const sx = GAME.WIDTH - 18, sy = 184;
        this._drawTouchBtn(ctx, sx, sy, 'X', '#a82020', arr('KeyX'));

        // Pause button - tiny corner
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(GAME.WIDTH - 18, 2, 14, 14);
        ctx.fillStyle = arr('KeyP') ? '#ffe070' : '#564468';
        ctx.fillRect(GAME.WIDTH - 14, 6, 2, 6);
        ctx.fillRect(GAME.WIDTH - 10, 6, 2, 6);

        ctx.restore();
    }

    _drawTouchBtn(ctx, x, y, label, color, pressed) {
        const r = 14;
        ctx.fillStyle = '#0a0612';
        ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pressed ? '#fff' : color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pressed ? color : 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.arc(x, y - 2, r - 4, 0, Math.PI * 2); ctx.fill();
        if (typeof drawPixelTextOutlined === 'function') {
            drawPixelTextOutlined(ctx, label, x, y - 3, '#ffffff', '#1a0000', 1, 'center', 1);
        }
    }

    flashText(ctx, text, x, y, color) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 1, y - 7, text.length * 6 + 2, 9);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 100) * 0.4;
        ctx.font = 'bold 8px monospace';
        ctx.fillText(text, x, y);
        ctx.globalAlpha = 1;
    }

    drawBossWarning() {
        const ctx = this.ctx;
        const t = this.bossWarning;
        // Strobe between bar visible and not
        const strobe = Math.floor(t / 6) % 2 === 0;
        const cy = GAME.HEIGHT / 2 - 12;
        // Diagonal stripe band
        ctx.fillStyle = strobe ? '#a82020' : '#1a0000';
        ctx.fillRect(0, cy - 12, GAME.WIDTH, 36);
        // Hazard stripes
        ctx.fillStyle = strobe ? '#ffe070' : '#603020';
        for (let x = -36; x < GAME.WIDTH; x += 16) {
            const off = (t * 1.5) % 16;
            ctx.beginPath();
            ctx.moveTo(x + off, cy - 12);
            ctx.lineTo(x + off + 8, cy - 12);
            ctx.lineTo(x + off + 16, cy + 24);
            ctx.lineTo(x + off + 8, cy + 24);
            ctx.closePath();
            ctx.fill();
        }
        // Black inner band
        ctx.fillStyle = '#000';
        ctx.fillRect(0, cy - 4, GAME.WIDTH, 20);
        // Warning text
        const blink = Math.floor(t / 8) % 2 === 0;
        drawPixelTextOutlined(ctx, 'WARNING!', GAME.WIDTH / 2, cy + 2,
            blink ? '#ff5050' : '#ffe070', '#1a0000', 2, 'center', 1);
    }

    drawPickupFlash() {
        const ctx = this.ctx;
        const t = this.pickupFlashTimer;
        const fade = t < 20 ? t / 20 : 1;
        ctx.globalAlpha = fade;
        const y = GAME.HEIGHT / 2 + 40;
        // Black backdrop strip
        ctx.fillStyle = '#000';
        ctx.fillRect(0, y - 6, GAME.WIDTH, 14);
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(0, y - 5, GAME.WIDTH, 12);
        drawPixelTextOutlined(ctx, this.pickupFlash, GAME.WIDTH / 2, y - 2, '#ffe070', '#a82020', 1, 'center', 1);
        ctx.globalAlpha = 1;
    }

    drawGameOver() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        drawPixelTextOutlined(this.ctx, 'GAME OVER', GAME.WIDTH / 2, GAME.HEIGHT / 2 - 38, '#ff5050', '#1a0000', 3, 'center', 1);
        drawPixelText(this.ctx, `FINAL SCORE  ${String(this.score).padStart(6, '0')}`, GAME.WIDTH / 2, GAME.HEIGHT / 2 - 2, '#ffe070', 1, 'center', 1);

        // Continue option - keep score, restart current stage with full lives.
        // Available only outside boss rush and only if continues remain.
        const canContinue = !this.bossRushMode && this.continues > 0;
        const blink = Math.floor(Date.now() / 400) % 2 === 0;
        if (canContinue) {
            drawPixelText(this.ctx, `CONTINUES LEFT  ${this.continues}`, GAME.WIDTH / 2, GAME.HEIGHT / 2 + 14, '#7af0ff', 1, 'center', 1);
            if (blink) {
                drawPixelText(this.ctx, 'SHOOT TO CONTINUE',  GAME.WIDTH / 2, GAME.HEIGHT / 2 + 30, '#50ff70', 1, 'center', 1);
                drawPixelText(this.ctx, 'JUMP TO QUIT',       GAME.WIDTH / 2, GAME.HEIGHT / 2 + 42, '#ff8030', 1, 'center', 1);
            }
            if (input.shoot) {
                this.continues--;
                this.lives = 3;
                this.player = new Player(50, 160);
                this.gameOver = false;
                this.screen = 'stageIntro';
                this.stageIntroTimer = 0;
                this.loadStageByIndex(this.stageIndex);
                if (typeof particles !== 'undefined') particles.clear();
            } else if (input.jumpPressed) {
                // Quit -> back to title with stats wiped
                this.checkHighScore();
                this.restart();
                this.screen = 'title';
                this.titleTimer = 0;
            }
        } else {
            if (blink) {
                drawPixelText(this.ctx, 'SHOOT TO RESTART', GAME.WIDTH / 2, GAME.HEIGHT / 2 + 30, '#ffffff', 1, 'center', 1);
            }
            if (input.shoot || input.jumpPressed) {
                // Out of continues - if score qualifies, prompt for initials first.
                if (this.qualifiesForLeaderboard(this.score)) {
                    const runTime = this.runStartTime > 0 ? (Date.now() - this.runStartTime) / 1000 : 0;
                    this.promptInitials(this.score, runTime, () => this.restart());
                } else {
                    this.restart();
                }
            }
        }
    }

    drawPaused() {
        const ctx = this.ctx;
        // Dimmer overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Center panel - now holds three rows (music, sfx, quit)
        const px = 48, pw = GAME.WIDTH - 96;
        const py = GAME.HEIGHT / 2 - 60, ph = 120;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = '#564468';
        ctx.fillRect(px, py, pw, 2);
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(px, py + ph - 2, pw, 2);

        drawPixelTextOutlined(ctx, 'PAUSED', GAME.WIDTH / 2, py + 6, '#ffe070', '#a82020', 2, 'center', 1);

        // ---- Volume + shake sliders ----
        const mixer = (typeof audio !== 'undefined') ? audio : null;
        const sliderX = px + 18, sliderW = pw - 60, sliderH = 6;
        const labels = [
            { name: 'MUSIC', val: mixer ? mixer.musicVolume : 0.7 },
            { name: 'SFX',   val: mixer ? mixer.sfxVolume   : 0.85 },
            { name: 'SHAKE', val: this.shakeIntensity }
        ];
        for (let i = 0; i < labels.length; i++) {
            const sy = py + 30 + i * 18;
            const isSelected = i === this.pauseMenuCursor;

            // Label
            drawPixelText(ctx, labels[i].name,
                sliderX - 4, sy - 4, isSelected ? '#ffe070' : '#c0a0d0', 1, 'right', 1);
            // Slider frame
            ctx.fillStyle = '#000';
            ctx.fillRect(sliderX, sy - 1, sliderW, sliderH + 2);
            ctx.fillStyle = '#1a1140';
            ctx.fillRect(sliderX, sy, sliderW, sliderH);
            // Fill
            const fill = Math.floor(labels[i].val * (sliderW - 2));
            ctx.fillStyle = isSelected ? '#ffe070' : '#7a608c';
            ctx.fillRect(sliderX + 1, sy + 1, fill, sliderH - 2);
            // Tick marks
            ctx.fillStyle = '#3a2855';
            for (let t = 0; t <= 10; t++) {
                ctx.fillRect(sliderX + Math.floor(t * (sliderW - 1) / 10), sy + sliderH, 1, 2);
            }
            // Cursor arrow on the selected row
            if (isSelected) {
                const blink = (Math.floor(Date.now() / 200) & 1) === 0;
                ctx.fillStyle = blink ? '#ffe070' : '#ffa030';
                ctx.fillRect(sliderX + sliderW + 4, sy, 4, 4);
                ctx.fillRect(sliderX + sliderW + 5, sy - 1, 2, 6);
            }
            // Numeric value
            drawPixelText(ctx, Math.round(labels[i].val * 100) + '',
                sliderX + sliderW + 18, sy - 4, '#a890c0', 1, 'right', 1);
        }

        // ---- Quit to Title row (row index 3, after MUSIC/SFX/SHAKE) ----
        const qRowY = py + 30 + 3 * 18;
        const qSelected = this.pauseMenuCursor === 3;
        ctx.fillStyle = '#000';
        ctx.fillRect(sliderX - 4, qRowY - 4, sliderW + 16, 14);
        ctx.fillStyle = qSelected ? '#a82020' : '#1a1140';
        ctx.fillRect(sliderX - 2, qRowY - 2, sliderW + 12, 10);
        const qText = this.quitConfirm ? 'PRESS AGAIN TO CONFIRM' : 'QUIT TO TITLE';
        drawPixelText(ctx, qText,
            sliderX + (sliderW + 8) / 2 - 6, qRowY,
            qSelected ? '#ffffff' : '#c0a0d0', 1, 'center', 1);
        if (qSelected) {
            const blink = (Math.floor(Date.now() / 200) & 1) === 0;
            ctx.fillStyle = blink ? '#ffe070' : '#ffa030';
            ctx.fillRect(sliderX + sliderW + 4, qRowY, 4, 4);
            ctx.fillRect(sliderX + sliderW + 5, qRowY - 1, 2, 6);
        }

        // Hints at the bottom
        drawPixelText(ctx, 'UP DOWN  SELECT    LEFT RIGHT  ADJUST',
            GAME.WIDTH / 2, py + ph - 22, '#a890c0', 1, 'center', 1);
        drawPixelText(ctx, 'P RESUME    M MUTE    F PHOTO    SHOOT  QUIT',
            GAME.WIDTH / 2, py + ph - 10, '#a890c0', 1, 'center', 1);

        // Photo-mode flash overlay - a quick white blip after F is pressed
        if (this.photoFlash && this.photoFlash > 0) {
            const a = this.photoFlash / 12;
            ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
            ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
            drawPixelTextOutlined(ctx, 'PHOTO SAVED', GAME.WIDTH / 2, GAME.HEIGHT - 24,
                '#50ff70', '#0a3a14', 1, 'center', 1);
            this.photoFlash--;
        }
    }

    restart() {
        this.score = 0;
        this.lives = this.difficulty.livesStart;
        this.continues = this.difficulty.continuesStart;
        this.gameOver = false;
        this.paused = false;
        this.screen = 'stageIntro';
        this.stageIntroTimer = 0;
        this.loadStageByIndex(0);
        this.player = new Player(50, 160);
        // Apply difficulty health multiplier
        this.player.maxHealth = Math.floor(PLAYER.MAX_HEALTH * this.difficulty.healthMul);
        this.player.health = this.player.maxHealth;
    }
}

// Start game when page loads
let game;
window.addEventListener('load', async () => {
    // Try to load sprite sheets (will gracefully fall back to procedural if not found)
    try {
        await loadAllSprites();
    } catch (e) {
        console.log('Using procedural sprites (PNG sprites not yet generated)');
    }

    game = new Game();
    game.init();

    // If we were opened with a shared score in the URL hash, import it
    // and flash a notification so the receiving player knows.
    try {
        if (typeof OnlineLeaderboard !== 'undefined') {
            const shared = OnlineLeaderboard.consumeIncomingShare();
            if (shared && game.importSharedEntry) {
                game.importSharedEntry(shared);
                game.sharedImportNotice = `IMPORTED: ${shared.name} ${shared.score}`;
                game.sharedImportTimer = 240;
            }
        }
    } catch (e) {}

    // Mute / unmute on M
    window.addEventListener('keydown', (e) => {
        if (typeof audio === 'undefined') return;
        if (e.key === 'm' || e.key === 'M') audio.toggleMute();
        // First keypress unlocks the audio context
        audio.resume();
    }, { once: false });
});

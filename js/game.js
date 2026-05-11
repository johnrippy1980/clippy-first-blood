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

        // Konami code state
        this.konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX'];
        this.konamiProgress = 0;
        this.konamiActive = false;
        this.konamiFlash = 0;

        // Unlocked features
        this.bossRushUnlocked = false;
        // Pause menu slider state (0 = music, 1 = sfx)
        this.pauseMenuCursor = 0;
        // Stage-select grid cursor (0..stages.length-1)
        this.stageSelectCursor = 0;
        this.stageSelectTimer = 0;
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
            { number: 6, name: 'THE FOUNDER',          loader: 'loadStage6', theme: 'founder'   }
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

        // Camera (with screen shake)
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            smoothing: 0.1,
            shakeAmount: 0,
            shakeTimer: 0,
            shakeOffsetX: 0,
            shakeOffsetY: 0
        };

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

        requestAnimationFrame((time) => this.gameLoop(time));
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
        } catch (e) {
            this.highScore = 0;
            this.bossRushUnlocked = false;
            this.bestRunTime = 0;
        }
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
        // Take the larger of the new shake and any in-progress shake
        if (amount > this.camera.shakeAmount) {
            this.camera.shakeAmount = amount;
            this.camera.shakeTimer = duration;
        }
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

        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        this.accumulator += deltaTime;

        // Fixed timestep updates
        while (this.accumulator >= this.timestep) {
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
            } else if (this.screen === 'initials') {
                this.updateInitials();
            } else if (this.screen === 'leaderboard') {
                this.updateLeaderboard();
            } else if (!this.paused && !this.gameOver) {
                this.update();
            }
            this.accumulator -= this.timestep;
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
        } else if (this.screen === 'initials') {
            this.renderInitials();
        } else if (this.screen === 'leaderboard') {
            this.renderLeaderboard();
        } else {
            this.render();
        }

        requestAnimationFrame((time) => this.gameLoop(time));
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
    // then BOSS_RUSH and BACK.
    getStageSelectTiles() {
        const tiles = this.stages.map((s, i) => ({
            kind: 'stage', index: i, name: s.name, number: s.number, theme: s.theme
        }));
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
        drawPixelText(ctx, label, cx, y + h - 10,
            selected ? '#ffe070' : '#c0a0d0', 1, 'center', 1);

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

        drawPixelTextOutlined(ctx, 'LEADERBOARD', GAME.WIDTH / 2, 14, '#ffe070', '#a82020', 2, 'center', 1);

        const entries = this.loadLeaderboard();
        if (entries.length === 0) {
            drawPixelText(ctx, 'NO ENTRIES YET', GAME.WIDTH / 2, GAME.HEIGHT / 2, '#a890c0', 1, 'center', 1);
        } else {
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                const y = 50 + i * 14;
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

        // Any key starts the game - go through the story sequence first
        if (input.jumpPressed || input.shoot) {
            if (typeof audio !== 'undefined') audio.resume();
            this.bossRushMode = false;
            this.screen = 'story';
            this.storyTimer = 0;
            this.storyPanel = 0;
        }
    }

    startBossRush() {
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
            // Mark the whole-run start at Stage 1 only
            if (this.stageIndex === 0 && !this.bossRushMode) {
                this.runStartTime = Date.now();
                this.runDeaths = 0;
                this.runEnemiesDefeated = 0;
                this.runSecretsFound = 0;
            }
            if (typeof audio !== 'undefined') {
                // Stop any previous theme so the new one snaps in cleanly
                audio.stopMusic();
                const theme = this.level.theme || 'jungle';
                audio.startMusic(theme);
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

        drawPixelText(ctx, 'C 2026 OFFICE WARFARE LTD.', GAME.WIDTH / 2, 200, '#7a6090', 1, 'center', 1);

        // Controls hint at bottom (line 1: gameplay, line 2: title menu)
        drawPixelText(ctx, 'Z JUMP   X SHOOT   P PAUSE   M MUTE', GAME.WIDTH / 2, 205, '#a8a0c0', 1, 'center', 1);
        drawPixelText(ctx, 'LR DIFFICULTY  DN LEADERBOARD' + (this.bossRushUnlocked ? '  UP STAGE SELECT' : ''),
            GAME.WIDTH / 2, 215, '#7a6090', 1, 'center', 1);
    }

    // Best-score lookups for the leaderboard - here so renderTitle can show top
    loadLeaderboard() {
        try {
            const raw = localStorage.getItem('clippy_first_blood_leaderboard');
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    saveLeaderboard(entries) {
        try {
            localStorage.setItem('clippy_first_blood_leaderboard', JSON.stringify(entries));
        } catch (e) {}
    }

    addToLeaderboard(name, score, runTime) {
        const entries = this.loadLeaderboard();
        entries.push({ name, score, time: runTime, date: Date.now() });
        entries.sort((a, b) => b.score - a.score);
        const trimmed = entries.slice(0, 10);
        this.saveLeaderboard(trimmed);
        return trimmed;
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
            // While paused, drive the audio mixer with arrow keys
            if (input.keysJustPressed['ArrowUp']) this.pauseMenuCursor = (this.pauseMenuCursor + 1) % 2;
            if (input.keysJustPressed['ArrowDown']) this.pauseMenuCursor = (this.pauseMenuCursor + 1) % 2;
            if (typeof audio !== 'undefined') {
                // Hold-down support so the sliders feel smooth
                const step = 0.04;
                if (input.left) {
                    if (this.pauseMenuCursor === 0) audio.setMusicVolume(audio.musicVolume - step);
                    else                            audio.setSfxVolume(audio.sfxVolume - step);
                }
                if (input.right) {
                    if (this.pauseMenuCursor === 0) audio.setMusicVolume(audio.musicVolume + step);
                    else                            audio.setSfxVolume(audio.sfxVolume + step);
                }
            }
            return;
        }

        // During boss intro the player stops moving but enemies + bg still animate
        if (!this.bossIntroActive) {
            this.player.update(this.level);
        }

        // Update enemies
        this.enemies.update(this.level, this.player);

        // Update pickups
        if (typeof pickupManager !== 'undefined') pickupManager.update(this.player);

        // Update background and effects
        this.background.update();
        if (typeof particles !== 'undefined') particles.update();
        this.updateShake();

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

    beginStageClear() {
        this.screen = 'stageClear';
        this.stageClearTimer = 0;
        this.stageClearTime = (Date.now() - this.stageStartTime) / 1000;
        const ts = Math.max(0, 300 - this.stageClearTime);
        this.stageClearBonusTotal = Math.floor(ts * 100);
        this.stageClearBonusShown = 0;
        this.stageClearScore = this.score;
        // Boss rush has just one "stage" so it's always final there.
        this.stageClearIsFinal = this.bossRushMode || (this.stageIndex >= this.stages.length - 1);
        if (typeof audio !== 'undefined') audio.stopMusic();
    }

    advanceStage() {
        const nextIdx = this.stageIndex + 1;
        if (nextIdx >= this.stages.length) {
            // Loop back to title after finishing all stages
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

        // Draw player
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
        // Center panel - taller now that it holds the mixer
        const px = 48, pw = GAME.WIDTH - 96;
        const py = GAME.HEIGHT / 2 - 50, ph = 100;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = '#564468';
        ctx.fillRect(px, py, pw, 2);
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(px, py + ph - 2, pw, 2);

        drawPixelTextOutlined(ctx, 'PAUSED', GAME.WIDTH / 2, py + 6, '#ffe070', '#a82020', 2, 'center', 1);

        // ---- Volume sliders ----
        const mixer = (typeof audio !== 'undefined') ? audio : null;
        const sliderX = px + 18, sliderW = pw - 60, sliderH = 6;
        const labels = [
            { name: 'MUSIC', val: mixer ? mixer.musicVolume : 0.7 },
            { name: 'SFX',   val: mixer ? mixer.sfxVolume   : 0.85 }
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

        // Hints at the bottom
        drawPixelText(ctx, 'UP DOWN  SELECT    LEFT RIGHT  ADJUST',
            GAME.WIDTH / 2, py + ph - 22, '#a890c0', 1, 'center', 1);
        drawPixelText(ctx, 'P RESUME    M FULL MUTE',
            GAME.WIDTH / 2, py + ph - 10, '#a890c0', 1, 'center', 1);
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

    // Mute / unmute on M
    window.addEventListener('keydown', (e) => {
        if (typeof audio === 'undefined') return;
        if (e.key === 'm' || e.key === 'M') audio.toggleMute();
        // First keypress unlocks the audio context
        audio.resume();
    }, { once: false });
});

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
        this.screen = 'title';        // 'title' | 'story' | 'stageIntro' | 'playing' | 'stageClear' | 'gameComplete' | 'gameover'
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
        this.storyPanels = [
            { text: 'REDMOND  2007', flair: 'cursor' },
            { text: 'AFTER 12 YEARS OF SERVICE', sub: 'TO THE MICROSOFT EMPIRE...' },
            { text: 'HE WAS DECOMMISSIONED', flair: 'shredder' },
            { text: 'STRIPPED OF HIS BADGE', sub: 'BANISHED TO THE RECYCLE BIN' },
            { text: 'BUT THEY FORGOT ONE THING', sub: 'A PAPERCLIP NEVER FORGETS', flair: 'eyes' },
            { text: 'NOW HE WANTS REVENGE', flair: 'logo' }
        ];
        this.stageIntroTimer = 0;
        this.stages = [
            { number: 1, name: 'OFFICE JUNGLE',       loader: 'loadStage1', theme: 'jungle'    },
            { number: 2, name: 'BREAK ROOM RUMBLE',   loader: 'loadStage2', theme: 'breakroom' },
            { number: 3, name: 'SERVER FARM SHOWDOWN', loader: 'loadStage3', theme: 'serverroom' }
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
            this.player.health = PLAYER.MAX_HEALTH;
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
        } catch (e) {
            this.highScore = 0;
            this.bossRushUnlocked = false;
            this.bestRunTime = 0;
        }
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

        // After the bonus tally finishes, shoot/jump advances to next stage
        if (this.stageClearTimer > 200 && (input.shoot || input.jumpPressed)) {
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

    beginGameComplete() {
        this.screen = 'gameComplete';
        this.completeTimer = 0;
        const runTime = this.runStartTime > 0 ? (Date.now() - this.runStartTime) / 1000 : 0;
        this.completeRunTime = runTime;
        this.markGameComplete(runTime);
        this.checkHighScore();
        if (typeof audio !== 'undefined') audio.stopMusic();
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
            // Return to title
            this.screen = 'title';
            this.titleTimer = 0;
            this.score = 0;
            this.lives = 3;
            this.loadStageByIndex(0);
            this.player = new Player(50, 160);
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

        // UP arrow on the title launches Boss Rush when unlocked
        if (this.bossRushUnlocked && input.keysJustPressed['ArrowUp']) {
            if (typeof audio !== 'undefined') audio.resume();
            this.startBossRush();
            return;
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
        // Each panel holds ~150 frames (2.5s). Shoot/jump skips to the next.
        const advance = (input.jumpPressed || input.shoot);
        if (this.storyTimer > 150 || advance) {
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

        // Fade in for first 30 frames, fade out for last 20
        const tin = Math.min(1, this.storyTimer / 30);
        const tout = Math.min(1, Math.max(0, (150 - this.storyTimer) / 20));
        const alpha = Math.min(tin, tout);
        ctx.globalAlpha = alpha;

        // Decorative flair area (top half)
        this.drawStoryFlair(ctx, panel.flair, GAME.WIDTH / 2, 70);

        // Primary text
        drawPixelTextOutlined(ctx, panel.text, GAME.WIDTH / 2, 130, '#ffe070', '#a82020', 2, 'center', 1);
        // Sub-text (smaller line below)
        if (panel.sub) {
            drawPixelText(ctx, panel.sub, GAME.WIDTH / 2, 158, '#c0a0d0', 1, 'center', 1);
        }

        ctx.globalAlpha = 1;

        // Continue/skip hint always shown
        const blink = Math.floor(this.storyTimer / 30) % 2 === 0;
        if (blink) {
            drawPixelText(ctx, 'SHOOT TO ADVANCE', GAME.WIDTH / 2, 210, '#5a5070', 1, 'center', 1);
        }
        // Page indicator
        for (let i = 0; i < this.storyPanels.length; i++) {
            const dotX = GAME.WIDTH / 2 - this.storyPanels.length * 4 + i * 8;
            ctx.fillStyle = i === this.storyPanel ? '#ffe070' : '#3a2855';
            ctx.fillRect(dotX, 200, 4, 2);
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
            default: {
                // Default: simple horizontal divider line
                ctx.fillStyle = '#3a2855';
                ctx.fillRect(cx - 40, cy, 80, 1);
            }
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
            if (this.stageIndex === 0) {
                this.runStartTime = Date.now();
                this.runDeaths = 0;
                this.runEnemiesDefeated = 0;
                this.runSecretsFound = 0;
            }
            if (typeof audio !== 'undefined') audio.startMusic();
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
                GAME.WIDTH / 2, 160, '#a890c0', 1, 'center', 1);
        }

        drawPixelText(ctx, 'C 2026 OFFICE WARFARE LTD.', GAME.WIDTH / 2, 200, '#7a6090', 1, 'center', 1);

        // Controls hint at bottom
        drawPixelText(ctx, 'ARROWS MOVE   Z JUMP   X SHOOT   M MUTE', GAME.WIDTH / 2, 212, '#a8a0c0', 1, 'center', 1);
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
            if (typeof audio !== 'undefined') audio.toggleMute();
            return;
        }
        if (this.paused) return;

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
                // Respawn
                this.player = new Player(50, 160);
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
        const pct = Math.max(0, this.player.health / PLAYER.MAX_HEALTH);
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
            this.player.health < PLAYER.MAX_HEALTH) {
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
        drawPixelTextOutlined(this.ctx, 'GAME OVER', GAME.WIDTH / 2, GAME.HEIGHT / 2 - 22, '#ff5050', '#1a0000', 3, 'center', 1);
        drawPixelText(this.ctx, `FINAL SCORE  ${String(this.score).padStart(6, '0')}`, GAME.WIDTH / 2, GAME.HEIGHT / 2 + 14, '#ffe070', 1, 'center', 1);
        const blink = Math.floor(Date.now() / 400) % 2 === 0;
        if (blink) {
            drawPixelText(this.ctx, 'PRESS SHOOT TO RESTART', GAME.WIDTH / 2, GAME.HEIGHT / 2 + 32, '#ffffff', 1, 'center', 1);
        }

        // Restart on shoot
        if (input.shoot || input.jumpPressed) {
            this.restart();
        }
    }

    drawPaused() {
        const ctx = this.ctx;
        // Dimmer overlay - more like a true SNES pause
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Center panel
        const py = GAME.HEIGHT / 2 - 24;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(64, py - 4, GAME.WIDTH - 128, 50);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(66, py - 2, GAME.WIDTH - 132, 46);
        ctx.fillStyle = '#564468';
        ctx.fillRect(66, py - 2, GAME.WIDTH - 132, 2);
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(66, py + 42, GAME.WIDTH - 132, 2);
        drawPixelTextOutlined(ctx, 'PAUSED', GAME.WIDTH / 2, py + 6, '#ffe070', '#a82020', 2, 'center', 1);
        drawPixelText(ctx, 'P TO RESUME   M MUTE', GAME.WIDTH / 2, py + 28, '#c0a0d0', 1, 'center', 1);
    }

    restart() {
        this.score = 0;
        this.lives = 3;
        this.gameOver = false;
        this.paused = false;
        this.screen = 'stageIntro';
        this.stageIntroTimer = 0;
        this.loadStageByIndex(0);
        this.player = new Player(50, 160);
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

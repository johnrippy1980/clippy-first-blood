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

        this.score = 0;
        this.lives = 3;

        // Camera
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            smoothing: 0.1
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
        this.level.loadTestLevel();

        this.player = new Player(50, 160);

        this.enemies = new EnemyManager();

        // Spawn enemies from level spawn points
        this.level.spawnPoints.forEach(spawn => {
            this.enemies.spawn(spawn.x, spawn.y, spawn.type);
        });

        this.background = new ParallaxBackground();
        this.background.init();

        // Start game loop
        this.running = true;
        this.lastTime = performance.now();
        this.accumulator = 0;
        this.timestep = 1000 / GAME.FPS;

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    gameLoop(currentTime) {
        if (!this.running) return;

        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        this.accumulator += deltaTime;

        // Fixed timestep updates
        while (this.accumulator >= this.timestep) {
            if (!this.paused && !this.gameOver) {
                this.update();
            }
            this.accumulator -= this.timestep;
        }

        // Render
        this.render();

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update() {
        // Update player
        this.player.update(this.level);

        // Update enemies
        this.enemies.update(this.level, this.player);

        // Update background
        this.background.update();

        // Update camera to follow player
        this.updateCamera();

        // Check win/lose conditions
        this.checkGameState();

        // Calculate score from dead enemies
        this.enemies.enemies.forEach(enemy => {
            if (!enemy.active && enemy.score > 0) {
                this.score += enemy.score;
                enemy.score = 0; // Only count once
            }
        });
    }

    updateCamera() {
        // Target camera on player, centered
        this.camera.targetX = this.player.x - GAME.WIDTH / 2 + this.player.width / 2;
        this.camera.targetY = this.player.y - GAME.HEIGHT / 2 + this.player.height / 2;

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
        // Player death
        if (this.player.state === PLAYER_STATE.DYING) {
            this.lives--;
            if (this.lives <= 0) {
                this.gameOver = true;
            } else {
                // Respawn
                this.player = new Player(50, 160);
            }
        }

        // Win condition (reach end of level)
        if (this.player.x > this.level.width * GAME.TILE_SIZE - 100) {
            // Level complete!
            this.paused = true;
            // Could load next level here
        }
    }

    render() {
        // Clear
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        // Draw parallax background
        this.background.draw(this.ctx, this.camera);

        // Draw level
        this.level.draw(this.ctx, this.camera);

        // Draw enemies
        this.enemies.draw(this.ctx, this.camera);

        // Draw player
        this.player.draw(this.ctx, this.camera);

        // Draw HUD
        this.drawHUD();

        // Draw game over / pause screens
        if (this.gameOver) {
            this.drawGameOver();
        } else if (this.paused) {
            this.drawPaused();
        }
    }

    drawHUD() {
        const padding = 4;

        // Health bar background
        this.ctx.fillStyle = COLORS.HUD_BG;
        this.ctx.fillRect(padding, padding, 52, 10);

        // Health bar
        const healthPercent = this.player.health / PLAYER.MAX_HEALTH;
        const healthColor = healthPercent > 0.3 ? COLORS.HUD_HEALTH : COLORS.HUD_HEALTH_LOW;
        this.ctx.fillStyle = healthColor;
        this.ctx.fillRect(padding + 1, padding + 1, 50 * healthPercent, 8);

        // Health bar border
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(padding, padding, 52, 10);

        // Score
        this.ctx.fillStyle = COLORS.HUD_TEXT;
        this.ctx.font = this.hudFont;
        this.ctx.fillText(`SCORE:${String(this.score).padStart(6, '0')}`, padding, padding + 22);

        // Lives (show Clippy icons)
        this.ctx.fillText(`CLIPPY`, GAME.WIDTH - 70, padding + 8);
        this.ctx.fillText(`LIVES:${this.lives}`, GAME.WIDTH - 70, padding + 18);

        // Current weapon
        this.ctx.fillText(this.player.weapon.name.toUpperCase(), padding, GAME.HEIGHT - padding - 2);

        // Cover indicator
        if (this.player.inCover) {
            this.ctx.fillStyle = '#0f0';
            this.ctx.fillText('IN COVER - HEALING', GAME.WIDTH / 2 - 50, padding + 8);
        }

        // Health regen indicator
        if (this.player.timeSinceDamage >= PLAYER.HEALTH_REGEN_DELAY &&
            this.player.health < PLAYER.MAX_HEALTH) {
            this.ctx.fillStyle = '#0f0';
            this.ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.5;
            this.ctx.fillText('REGENERATING', padding + 56, padding + 8);
            this.ctx.globalAlpha = 1;
        }

        // Aim direction indicator
        const aimNames = ['RIGHT', 'UP-R', 'UP', 'UP-L', 'LEFT', 'DN-L', 'DOWN', 'DN-R'];
        this.ctx.fillStyle = '#888';
        this.ctx.fillText(`AIM:${aimNames[this.player.aimDirection]}`, GAME.WIDTH - 60, GAME.HEIGHT - padding - 2);
    }

    drawGameOver() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        this.ctx.fillStyle = '#f00';
        this.ctx.font = '16px monospace';
        this.ctx.fillText('GAME OVER', GAME.WIDTH / 2 - 50, GAME.HEIGHT / 2 - 20);

        this.ctx.fillStyle = '#fff';
        this.ctx.font = '8px monospace';
        this.ctx.fillText(`FINAL SCORE: ${this.score}`, GAME.WIDTH / 2 - 45, GAME.HEIGHT / 2 + 10);
        this.ctx.fillText('PRESS SPACE TO RESTART', GAME.WIDTH / 2 - 65, GAME.HEIGHT / 2 + 30);

        // Restart on space
        if (input.jumpPressed) {
            this.restart();
        }
    }

    drawPaused() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        this.ctx.fillStyle = '#ff0';
        this.ctx.font = '16px monospace';
        this.ctx.fillText('LEVEL COMPLETE!', GAME.WIDTH / 2 - 70, GAME.HEIGHT / 2 - 20);

        this.ctx.fillStyle = '#fff';
        this.ctx.font = '8px monospace';
        this.ctx.fillText(`SCORE: ${this.score}`, GAME.WIDTH / 2 - 30, GAME.HEIGHT / 2 + 10);
    }

    restart() {
        this.score = 0;
        this.lives = 3;
        this.gameOver = false;
        this.paused = false;

        this.level.loadTestLevel();
        this.player = new Player(50, 160);

        this.enemies = new EnemyManager();
        this.level.spawnPoints.forEach(spawn => {
            this.enemies.spawn(spawn.x, spawn.y, spawn.type);
        });

        this.camera.x = 0;
        this.camera.y = 0;
    }
}

// Start game when page loads
window.addEventListener('load', async () => {
    // Try to load sprite sheets (will gracefully fall back to procedural if not found)
    try {
        await loadAllSprites();
    } catch (e) {
        console.log('Using procedural sprites (PNG sprites not yet generated)');
    }

    const game = new Game();
    game.init();
});

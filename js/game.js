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
        this.screen = 'title';        // 'title' | 'playing' | 'gameover'
        this.titleTimer = 0;

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
            if (this.screen === 'title') {
                this.updateTitle();
            } else if (!this.paused && !this.gameOver) {
                this.update();
            }
            this.accumulator -= this.timestep;
        }

        // Render
        if (this.screen === 'title') {
            this.renderTitle();
        } else {
            this.render();
        }

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    updateTitle() {
        this.titleTimer++;
        this.background.update();
        input.update();
        // Any key starts the game
        if (input.jumpPressed || input.shoot) {
            this.screen = 'playing';
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

        // ---- Credit / tagline ----
        drawPixelText(ctx, 'A PAPERCLIP HERO REBORN', GAME.WIDTH / 2, 116, '#c0a0d0', 1, 'center', 1);
        drawPixelText(ctx, 'C 2026 OFFICE WARFARE LTD.', GAME.WIDTH / 2, 200, '#7a6090', 1, 'center', 1);

        // Controls hint at bottom
        drawPixelText(ctx, 'ARROWS MOVE   Z JUMP   X SHOOT', GAME.WIDTH / 2, 212, '#a8a0c0', 1, 'center', 1);
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
        // Update player
        this.player.update(this.level);

        // Update enemies
        this.enemies.update(this.level, this.player);

        // Update background and effects
        this.background.update();
        if (typeof particles !== 'undefined') particles.update();

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

        // Draw particle effects (over world, under HUD)
        if (typeof particles !== 'undefined') particles.draw(this.ctx, this.camera);

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

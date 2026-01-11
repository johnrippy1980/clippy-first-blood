// ============================================
// PARALLAX BACKGROUND SYSTEM
// Multi-layer scrolling with animations
// ============================================

class ParallaxBackground {
    constructor() {
        this.layers = [];
        this.time = 0;
    }

    init() {
        // Layer 0: Sky gradient (static)
        this.layers.push({
            type: 'sky',
            speed: 0,
            elements: []
        });

        // Layer 1: Far mountains/clouds
        this.layers.push({
            type: 'far_bg',
            speed: PARALLAX.FAR_MOUNTAINS,
            elements: this.generateMountains(5, 80, '#1a2a40')
        });

        // Layer 2: Near mountains
        this.layers.push({
            type: 'near_bg',
            speed: PARALLAX.NEAR_MOUNTAINS,
            elements: this.generateMountains(7, 60, '#2a3a50')
        });

        // Layer 3: Far trees
        this.layers.push({
            type: 'far_trees',
            speed: PARALLAX.FAR_TREES,
            elements: this.generateTrees(15, '#1a4a2a', 30)
        });

        // Layer 4: Near trees (with wind animation)
        this.layers.push({
            type: 'near_trees',
            speed: PARALLAX.NEAR_TREES,
            elements: this.generateTrees(20, '#2a5a3a', 50),
            animated: true
        });

        // Layer 5: Foreground water (fastest, with wave animation)
        this.layers.push({
            type: 'water',
            speed: PARALLAX.FOREGROUND,
            height: 30,
            animated: true
        });
    }

    generateMountains(count, maxHeight, color) {
        const mountains = [];
        for (let i = 0; i < count; i++) {
            mountains.push({
                x: i * (GAME.WIDTH * 4 / count) + Math.random() * 50,
                width: 80 + Math.random() * 60,
                height: 30 + Math.random() * maxHeight,
                color: color
            });
        }
        return mountains;
    }

    generateTrees(count, color, height) {
        const trees = [];
        for (let i = 0; i < count; i++) {
            trees.push({
                x: i * (GAME.WIDTH * 4 / count) + Math.random() * 30,
                height: height + Math.random() * 20,
                color: color,
                phase: Math.random() * Math.PI * 2  // For wind animation
            });
        }
        return trees;
    }

    update() {
        this.time += 0.02;
    }

    draw(ctx, camera) {
        // Draw each layer from back to front
        this.layers.forEach((layer, index) => {
            switch (layer.type) {
                case 'sky':
                    this.drawSky(ctx);
                    break;
                case 'far_bg':
                case 'near_bg':
                    this.drawMountains(ctx, layer, camera);
                    break;
                case 'far_trees':
                case 'near_trees':
                    this.drawTrees(ctx, layer, camera);
                    break;
                case 'water':
                    this.drawWater(ctx, layer, camera);
                    break;
            }
        });
    }

    drawSky(ctx) {
        // Gradient sky
        const gradient = ctx.createLinearGradient(0, 0, 0, GAME.HEIGHT);
        gradient.addColorStop(0, COLORS.SKY_TOP);
        gradient.addColorStop(0.6, COLORS.SKY_BOTTOM);
        gradient.addColorStop(1, '#3d5a7e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        // Stars (only visible at night - could add day/night cycle)
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 30; i++) {
            const x = (i * 37 + this.time * 0.1) % GAME.WIDTH;
            const y = (i * 23) % (GAME.HEIGHT * 0.4);
            const twinkle = Math.sin(this.time * 2 + i) > 0.5 ? 1 : 0.5;
            ctx.globalAlpha = twinkle * 0.8;
            ctx.fillRect(x, y, 1, 1);
        }
        ctx.globalAlpha = 1;

        // Moon (optional)
        ctx.fillStyle = '#dde';
        ctx.beginPath();
        ctx.arc(200, 30, 15, 0, Math.PI * 2);
        ctx.fill();
    }

    drawMountains(ctx, layer, camera) {
        const offsetX = camera.x * layer.speed;

        layer.elements.forEach(mountain => {
            const x = mountain.x - offsetX;
            const wrappedX = ((x % (GAME.WIDTH * 4)) + GAME.WIDTH * 4) % (GAME.WIDTH * 4) - GAME.WIDTH;

            if (wrappedX > -mountain.width && wrappedX < GAME.WIDTH + mountain.width) {
                ctx.fillStyle = mountain.color;
                ctx.beginPath();
                ctx.moveTo(wrappedX, GAME.HEIGHT - 30);
                ctx.lineTo(wrappedX + mountain.width / 2, GAME.HEIGHT - 30 - mountain.height);
                ctx.lineTo(wrappedX + mountain.width, GAME.HEIGHT - 30);
                ctx.closePath();
                ctx.fill();

                // Snow cap
                if (mountain.height > 50) {
                    ctx.fillStyle = '#ccd';
                    ctx.beginPath();
                    ctx.moveTo(wrappedX + mountain.width / 2 - 10, GAME.HEIGHT - 30 - mountain.height + 15);
                    ctx.lineTo(wrappedX + mountain.width / 2, GAME.HEIGHT - 30 - mountain.height);
                    ctx.lineTo(wrappedX + mountain.width / 2 + 10, GAME.HEIGHT - 30 - mountain.height + 15);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        });
    }

    drawTrees(ctx, layer, camera) {
        const offsetX = camera.x * layer.speed;

        layer.elements.forEach(tree => {
            const x = tree.x - offsetX;
            const wrappedX = ((x % (GAME.WIDTH * 4)) + GAME.WIDTH * 4) % (GAME.WIDTH * 4) - GAME.WIDTH;

            if (wrappedX > -30 && wrappedX < GAME.WIDTH + 30) {
                // Wind animation for near trees
                let sway = 0;
                if (layer.animated) {
                    sway = Math.sin(this.time * 1.5 + tree.phase) * 3;
                }

                const baseY = GAME.HEIGHT - 30;
                const treeHeight = tree.height;

                // Trunk
                ctx.fillStyle = '#432';
                ctx.fillRect(wrappedX - 3, baseY - treeHeight * 0.3, 6, treeHeight * 0.3);

                // Foliage (palm tree style for jungle)
                ctx.fillStyle = tree.color;

                // Palm fronds
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 + sway * 0.05;
                    const frondLength = treeHeight * 0.5;

                    ctx.save();
                    ctx.translate(wrappedX, baseY - treeHeight * 0.3);
                    ctx.rotate(angle);

                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(
                        frondLength * 0.3, -10 + sway,
                        frondLength, 5 + sway * 2
                    );
                    ctx.quadraticCurveTo(
                        frondLength * 0.3, 10 + sway,
                        0, 0
                    );
                    ctx.fill();

                    ctx.restore();
                }
            }
        });
    }

    drawWater(ctx, layer, camera) {
        const y = GAME.HEIGHT - layer.height;
        const offsetX = camera.x * layer.speed;

        // Base water
        ctx.fillStyle = COLORS.WATER;
        ctx.fillRect(0, y, GAME.WIDTH, layer.height);

        // Animated waves on surface
        ctx.fillStyle = '#2e5a8e';
        for (let x = 0; x < GAME.WIDTH; x += 4) {
            const waveY = Math.sin((x + offsetX) * 0.05 + this.time * 2) * 2;
            ctx.fillRect(x, y + waveY, 4, 3);
        }

        // Foam/highlights
        ctx.fillStyle = '#4e7aae';
        for (let x = 0; x < GAME.WIDTH; x += 20) {
            const foamX = (x + this.time * 10) % GAME.WIDTH;
            const foamY = Math.sin(foamX * 0.1 + this.time) * 2;
            ctx.fillRect(foamX, y + 5 + foamY, 8, 2);
        }

        // Reflections
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#8ab';
        for (let x = 0; x < GAME.WIDTH; x += 30) {
            const reflectY = y + 10 + Math.sin(x * 0.1 + this.time * 3) * 3;
            ctx.fillRect(x + Math.sin(this.time + x) * 5, reflectY, 15, 1);
        }
        ctx.globalAlpha = 1;
    }
}

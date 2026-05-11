// ============================================
// PARALLAX BACKGROUND - Contra III sunset jungle
// All pixel-art, no vector curves. Drawn at native
// 256x224 resolution then scaled by the canvas.
// ============================================

class ParallaxBackground {
    constructor() {
        this.time = 0;
        this.horizonY = 192;        // Aligns with the top of the ground tiles (row 12 * 16px)
        this.theme = 'jungle';
        this.sunX = 188;            // Sun position in screen space
        this.sunY = 110;
        this.sunR = 22;
        // Pre-generated silhouette ranges so layers stay stable
        this.farMountains = this.buildMountainRange(48, 12, 0.07, 7);
        this.midMountains = this.buildMountainRange(72, 18, 0.05, 11);
        this.farJungle    = this.buildTreeLine(28, 14, 9);
        this.nearJungle   = this.buildTreeLine(44, 20, 13);
        this.embers = this.buildEmbers(36);
        // Break-room state
        this.cubicles = this.buildCubicles();
        this.posters = this.buildPosters();
        this.flickerSeeds = Array.from({length: 6}, (_, i) => i * 17 + 3);
    }

    init(theme) { if (theme) this.theme = theme; }

    setTheme(theme) { this.theme = theme || 'jungle'; }

    update() { this.time += 1; }

    // ----- generators (deterministic patterns, no Math.random in draw) -----
    buildMountainRange(amplitude, baseHeight, freq, count) {
        // Returns an array of column heights spanning 2x screen width (will wrap)
        const w = GAME.WIDTH * 4;
        const heights = new Array(w);
        for (let x = 0; x < w; x++) {
            const h =
                Math.sin(x * freq) * amplitude * 0.6 +
                Math.sin(x * freq * 2.3 + 1.1) * amplitude * 0.3 +
                Math.sin(x * freq * 5.1 + 2.7) * amplitude * 0.1;
            heights[x] = Math.floor(baseHeight + amplitude + h);
        }
        return heights;
    }

    buildTreeLine(maxHeight, spacing, treeWidth) {
        const trees = [];
        const w = GAME.WIDTH * 4;
        let x = 0;
        let seed = 1;
        while (x < w) {
            // Cheap LCG so layout is deterministic but varied
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            const h = maxHeight - (seed % (maxHeight / 2));
            const tw = treeWidth + ((seed >> 7) % 4);
            trees.push({ x, h: Math.floor(h), w: tw });
            x += spacing + ((seed >> 3) % spacing);
        }
        return trees;
    }

    buildEmbers(count) {
        const arr = [];
        for (let i = 0; i < count; i++) {
            arr.push({
                x: (i * 73) % GAME.WIDTH,
                y: (i * 41) % GAME.HEIGHT,
                phase: i * 0.7,
                speed: 0.15 + (i % 5) * 0.05
            });
        }
        return arr;
    }

    buildCubicles() {
        const arr = [];
        const w = GAME.WIDTH * 4;
        let x = 0;
        let seed = 7;
        while (x < w) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            const cw = 28 + (seed % 16);          // cubicle bay width
            const ch = 44 + ((seed >> 4) % 16);   // height of the cubicle wall
            arr.push({ x, w: cw, h: ch });
            x += cw + 6;
        }
        return arr;
    }

    buildPosters() {
        const arr = [];
        const w = GAME.WIDTH * 3;
        let x = 60;
        let i = 0;
        while (x < w) {
            arr.push({ x, w: 20 + (i % 3) * 6, type: i % 3 });
            x += 80 + (i % 4) * 24;
            i++;
        }
        return arr;
    }

    // ----- public draw -----
    draw(ctx, camera) {
        if (this.theme === 'breakroom') return this.drawBreakRoom(ctx, camera);
        if (this.theme === 'serverroom') return this.drawServerRoom(ctx, camera);
        this.drawSky(ctx);
        this.drawSun(ctx);
        this.drawClouds(ctx, camera);
        this.drawHorizonHaze(ctx);
        this.drawMountains(ctx, this.farMountains, camera.x * 0.12, '#3a2855', null);
        this.drawDistantExplosions(ctx);
        this.drawMountains(ctx, this.midMountains, camera.x * 0.22, '#241a3a', '#3a2855');
        this.drawTreeLine(ctx, this.farJungle, camera.x * 0.4, '#1a3a22', '#264a2a', false);
        this.drawEmbers(ctx);
        this.drawTreeLine(ctx, this.nearJungle, camera.x * 0.65, '#0d1f12', '#1a3322', true);
    }

    // ============================================
    // STAGE 2 - BREAK ROOM RUMBLE
    // Office interior: dropped ceiling with fluorescent tubes, beige
    // wall with motivational posters, distant cubicle skyline, then
    // closer cubicle row in the foreground.
    // ============================================
    drawBreakRoom(ctx, camera) {
        this.drawBreakRoomCeiling(ctx);
        this.drawBreakRoomWall(ctx);
        this.drawBreakRoomPosters(ctx, camera);
        this.drawBreakRoomDistantCubicles(ctx, camera);
        this.drawBreakRoomCubicleRow(ctx, camera);
    }

    drawBreakRoomCeiling(ctx) {
        // Dropped ceiling tiles (the kind everyone hates)
        ctx.fillStyle = '#d8d4c4';        // off-white tile face
        ctx.fillRect(0, 0, GAME.WIDTH, 28);
        // Tile grout lines - horizontal
        ctx.fillStyle = '#807868';
        ctx.fillRect(0, 14, GAME.WIDTH, 1);
        ctx.fillRect(0, 28, GAME.WIDTH, 1);
        // Tile grout lines - vertical (every 32 px)
        for (let x = 0; x < GAME.WIDTH; x += 32) {
            ctx.fillRect(x, 0, 1, 28);
        }
        // Stippled tile texture
        ctx.fillStyle = '#b8b0a0';
        for (let y = 2; y < 14; y += 3) {
            for (let x = 2; x < GAME.WIDTH; x += 5) {
                if (((x + y) & 3) === 0) ctx.fillRect(x, y, 1, 1);
            }
        }
        // Fluorescent light fixtures
        const lights = [{x: 24, y: 16}, {x: 88, y: 16}, {x: 152, y: 16}, {x: 216, y: 16}];
        for (const L of lights) {
            // Frame
            ctx.fillStyle = '#404048';
            ctx.fillRect(L.x - 1, L.y - 1, 26, 8);
            // Tube (flickers occasionally)
            const flicker = (Math.floor(this.time * 0.3 + L.x * 0.1) & 31) === 0;
            ctx.fillStyle = flicker ? '#80a8c0' : '#fff8d0';
            ctx.fillRect(L.x, L.y, 24, 6);
            // Tube highlight
            ctx.fillStyle = flicker ? '#608090' : '#ffffff';
            ctx.fillRect(L.x + 1, L.y + 1, 22, 1);
            // Faint glow
            ctx.fillStyle = flicker ? 'rgba(80,120,160,0.15)' : 'rgba(255,240,180,0.25)';
            ctx.fillRect(L.x - 6, L.y + 8, 36, 4);
        }
    }

    drawBreakRoomWall(ctx) {
        // Wall gradient from cream at top to slightly darker at bottom
        const bands = [
            { y: 28,  c: '#e8c890' },
            { y: 60,  c: '#dab880' },
            { y: 110, c: '#caa870' },
            { y: 160, c: '#a88858' },
            { y: 184, c: '#806840' }
        ];
        for (let i = 0; i < bands.length; i++) {
            const top = bands[i].y;
            const bot = i < bands.length - 1 ? bands[i + 1].y : 192;
            ctx.fillStyle = bands[i].c;
            ctx.fillRect(0, top, GAME.WIDTH, bot - top);
            // Dither
            if (i < bands.length - 1) {
                ctx.fillStyle = bands[i + 1].c;
                for (let x = (i & 1); x < GAME.WIDTH; x += 2) {
                    ctx.fillRect(x, bot - 1, 1, 1);
                }
            }
        }
        // Wainscoting line (chair rail at mid wall)
        ctx.fillStyle = '#604830';
        ctx.fillRect(0, 138, GAME.WIDTH, 2);
        ctx.fillStyle = '#806848';
        ctx.fillRect(0, 137, GAME.WIDTH, 1);
        // Wallpaper vertical stripes
        ctx.fillStyle = 'rgba(120, 88, 56, 0.18)';
        for (let x = 4; x < GAME.WIDTH; x += 12) {
            ctx.fillRect(x, 28, 1, 110);
        }
    }

    drawBreakRoomPosters(ctx, camera) {
        const off = (camera.x * 0.15) | 0;
        for (const p of this.posters) {
            const sx = p.x - off;
            const wrapped = ((sx % (GAME.WIDTH * 3)) + GAME.WIDTH * 3) % (GAME.WIDTH * 3);
            const screenX = wrapped > GAME.WIDTH * 1.5 ? wrapped - GAME.WIDTH * 3 : wrapped;
            if (screenX < -p.w || screenX > GAME.WIDTH) continue;

            const y = 50;
            const h = 20;
            // Frame
            ctx.fillStyle = '#3a2410';
            ctx.fillRect(screenX, y, p.w, h);
            // Paper
            const colors = [
                { bg: '#ffe0a0', accent: '#a82020' },     // Inspirational red
                { bg: '#c0e0ff', accent: '#1a508a' },     // Calming blue
                { bg: '#ffb0e0', accent: '#a02060' }      // Cat poster
            ];
            const c = colors[p.type];
            ctx.fillStyle = c.bg;
            ctx.fillRect(screenX + 1, y + 1, p.w - 2, h - 2);
            // Decorative content
            ctx.fillStyle = c.accent;
            // Title bar
            ctx.fillRect(screenX + 3, y + 3, p.w - 6, 2);
            // Body lines
            ctx.fillRect(screenX + 3, y + 8, p.w - 8, 1);
            ctx.fillRect(screenX + 3, y + 11, p.w - 10, 1);
            ctx.fillRect(screenX + 3, y + 14, p.w - 6, 1);
            // Cat poster gets a face
            if (p.type === 2) {
                ctx.fillStyle = '#3a1a28';
                ctx.fillRect(screenX + p.w - 8, y + 9, 1, 1);
                ctx.fillRect(screenX + p.w - 5, y + 9, 1, 1);
            }
        }
    }

    drawBreakRoomDistantCubicles(ctx, camera) {
        // Single horizontal silhouette of cubicle tops in mid distance
        const baseY = 138;
        const off = (camera.x * 0.35) | 0;
        ctx.fillStyle = '#5a4838';
        ctx.fillRect(0, baseY, GAME.WIDTH, 6);
        // Cubicle wall tops
        for (let x = 0; x < GAME.WIDTH; x += 28) {
            const sx = ((x + off) % 28) + x - (off % 28);
            ctx.fillRect(sx, baseY - 12, 24, 12);
            // Top trim - lighter
            ctx.fillStyle = '#7a6048';
            ctx.fillRect(sx, baseY - 12, 24, 2);
            ctx.fillStyle = '#5a4838';
        }
    }

    // ============================================
    // STAGE 3 - SERVER ROOM
    // Dark blue datacenter with server racks, blinking LEDs, cables.
    // ============================================
    drawServerRoom(ctx, camera) {
        // Solid dark backdrop
        ctx.fillStyle = '#08080f';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Distant ceiling cables glow with a deep purple
        this.drawServerCeiling(ctx);
        // Far server rack silhouette
        this.drawServerRackRow(ctx, camera, 0.2, 110, 64, '#101830', '#2030a0', false);
        // Floor glow band (cyan from data lights below)
        ctx.fillStyle = '#1a3a55';
        ctx.fillRect(0, 168, GAME.WIDTH, 4);
        ctx.fillStyle = '#3a78b8';
        ctx.fillRect(0, 168, GAME.WIDTH, 2);
        // Near server rack silhouette - taller, brighter LEDs
        this.drawServerRackRow(ctx, camera, 0.55, 78, 80, '#0a0e1e', '#30a0ff', true);
    }

    drawServerCeiling(ctx) {
        // Pipe and cable trunks running along the top of the screen
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(0, 0, GAME.WIDTH, 12);
        // Cable bundles
        const cables = ['#3a2855', '#1a508a', '#604838'];
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = cables[i];
            ctx.fillRect(0, 14 + i * 3, GAME.WIDTH, 2);
        }
        // Status LEDs along the top - periodic blinks
        for (let x = 8; x < GAME.WIDTH; x += 32) {
            const blink = (Math.floor(this.time * 0.1 + x * 0.07) & 7) === 0;
            ctx.fillStyle = blink ? '#50ff70' : '#206030';
            ctx.fillRect(x, 4, 2, 2);
        }
        // Emergency red light - slow pulse
        const emerg = Math.sin(this.time * 0.05) > 0;
        ctx.fillStyle = emerg ? '#ff3030' : '#3a0808';
        ctx.fillRect(GAME.WIDTH - 24, 2, 4, 4);
        ctx.fillStyle = emerg ? 'rgba(255,48,48,0.3)' : 'rgba(58,8,8,0)';
        ctx.fillRect(GAME.WIDTH - 32, -8, 20, 28);
    }

    drawServerRackRow(ctx, camera, parallaxSpeed, baseY, rackH, fill, ledColor, nearLayer) {
        // Each rack is 32 wide x rackH tall with LED columns
        const off = ((camera.x * parallaxSpeed) | 0);
        const rackW = 32;
        // Continuous floor under the racks
        ctx.fillStyle = fill;
        ctx.fillRect(0, baseY + rackH, GAME.WIDTH, GAME.HEIGHT - baseY - rackH);
        for (let x = -off % rackW - rackW; x < GAME.WIDTH; x += rackW) {
            // Rack body
            ctx.fillStyle = fill;
            ctx.fillRect(x, baseY, rackW - 2, rackH);
            // Top trim
            ctx.fillStyle = nearLayer ? '#3a4060' : '#202850';
            ctx.fillRect(x, baseY, rackW - 2, 2);
            // Side rim shadow
            ctx.fillStyle = '#000';
            ctx.fillRect(x + rackW - 2, baseY, 2, rackH);
            // LED grid - several columns of stacked blinking lights
            const ledCols = nearLayer ? 4 : 2;
            for (let col = 0; col < ledCols; col++) {
                const lx = x + 4 + col * 6;
                for (let row = 0; row < rackH / 4 - 1; row++) {
                    // Use position-based hashing so the pattern is stable but varied
                    const seed = (Math.floor(x / 4) * 73 + col * 41 + row * 17 + Math.floor(this.time * 0.1)) & 15;
                    if (seed < 3) {
                        ctx.fillStyle = ledColor;
                        ctx.fillRect(lx, baseY + 4 + row * 4, 2, 2);
                        if (nearLayer && seed === 0) {
                            ctx.fillStyle = 'rgba(48,160,255,0.25)';
                            ctx.fillRect(lx - 1, baseY + 3 + row * 4, 4, 4);
                        }
                    } else if (seed < 5) {
                        ctx.fillStyle = '#206030';
                        ctx.fillRect(lx, baseY + 4 + row * 4, 2, 2);
                    } else if (seed === 8 && nearLayer) {
                        ctx.fillStyle = '#ff3030';
                        ctx.fillRect(lx, baseY + 4 + row * 4, 2, 2);
                    }
                }
            }
            // Cooling vent slits at the bottom
            ctx.fillStyle = '#000';
            for (let v = 0; v < 4; v++) {
                ctx.fillRect(x + 4 + v * 6, baseY + rackH - 4, 4, 1);
            }
        }
    }

    drawBreakRoomCubicleRow(ctx, camera) {
        // Closer cubicle row - taller, with more detail, paired with files
        const baseY = 168;
        const off = (camera.x * 0.55) | 0;
        for (const c of this.cubicles) {
            const sx = c.x - off;
            const wrapped = ((sx % (GAME.WIDTH * 4)) + GAME.WIDTH * 4) % (GAME.WIDTH * 4);
            const screenX = wrapped > GAME.WIDTH * 2 ? wrapped - GAME.WIDTH * 4 : wrapped;
            if (screenX < -c.w - 4 || screenX > GAME.WIDTH + 4) continue;

            // Wall panel
            ctx.fillStyle = '#4a3828';
            ctx.fillRect(screenX, baseY - c.h, c.w, c.h);
            // Fabric texture (vertical stripes)
            ctx.fillStyle = '#5a4838';
            for (let dx = 1; dx < c.w; dx += 3) {
                ctx.fillRect(screenX + dx, baseY - c.h + 2, 1, c.h - 2);
            }
            // Highlight rim along the top edge
            ctx.fillStyle = '#a88858';
            ctx.fillRect(screenX, baseY - c.h, c.w, 2);
            ctx.fillStyle = '#caa870';
            ctx.fillRect(screenX, baseY - c.h, c.w, 1);
            // Dark shadow rim along bottom
            ctx.fillStyle = '#2a1810';
            ctx.fillRect(screenX, baseY - 2, c.w, 2);
            // Stack of file binders on top (occasional)
            if ((c.x & 31) < 16) {
                const bx = screenX + c.w / 2 - 6;
                ctx.fillStyle = '#a82020'; ctx.fillRect(bx,     baseY - c.h - 4, 4, 4);
                ctx.fillStyle = '#1a508a'; ctx.fillRect(bx + 4, baseY - c.h - 4, 4, 4);
                ctx.fillStyle = '#208a30'; ctx.fillRect(bx + 8, baseY - c.h - 4, 4, 4);
                // Binder highlights
                ctx.fillStyle = '#ff8080';
                ctx.fillRect(bx, baseY - c.h - 4, 1, 4);
            }
        }
    }

    // ----- sky: vertical pixel-banded gradient (no smooth gradient!) -----
    drawSky(ctx) {
        // SNES-style banded sunset palette top -> horizon
        const bands = [
            { y: 0,   c: '#1a1140' },
            { y: 18,  c: '#2b1a55' },
            { y: 36,  c: '#4a1f5c' },
            { y: 56,  c: '#6e2a5f' },
            { y: 78,  c: '#963656' },
            { y: 100, c: '#c84a4a' },
            { y: 120, c: '#e0683a' },
            { y: 140, c: '#ee8a3a' },
            { y: 158, c: '#f4a83f' },
            { y: 174, c: '#f6c25a' },
            { y: 186, c: '#f0d077' }
        ];
        for (let i = 0; i < bands.length; i++) {
            const top = bands[i].y;
            const bot = i < bands.length - 1 ? bands[i + 1].y : this.horizonY;
            ctx.fillStyle = bands[i].c;
            ctx.fillRect(0, top, GAME.WIDTH, bot - top);
            // Dither the band edge for that classic 16-bit feel
            if (i < bands.length - 1) {
                ctx.fillStyle = bands[i + 1].c;
                for (let x = (i & 1); x < GAME.WIDTH; x += 2) {
                    ctx.fillRect(x, bot - 1, 1, 1);
                }
            }
        }
        // Twinkling stars in the top bands
        ctx.fillStyle = '#fff8d0';
        for (let i = 0; i < 24; i++) {
            const x = (i * 31 + 7) % GAME.WIDTH;
            const y = (i * 19) % 40;
            const phase = Math.sin(this.time * 0.05 + i) > 0.3 ? 1 : 0;
            if (phase) ctx.fillRect(x, y, 1, 1);
        }
    }

    // ----- sun: pixel disk with rim glow and reflection bands -----
    drawSun(ctx) {
        const cx = this.sunX, cy = this.sunY, r = this.sunR;
        // Slow shimmer modulates the halo width
        const shimmer = Math.sin(this.time * 0.05) * 1.2;
        // Solid outer halo - one ring of warm color around the disk
        ctx.fillStyle = '#ee8a3a';
        this.fillPixelCircle(ctx, cx, cy, r + 4 + shimmer, 1);
        ctx.fillStyle = '#f4a83f';
        this.fillPixelCircle(ctx, cx, cy, r + 2, 1);
        // Sun body
        ctx.fillStyle = '#ffe07a';
        this.fillPixelCircle(ctx, cx, cy, r, 1);
        // Hot core (subtle pulse)
        ctx.fillStyle = '#fff5c0';
        this.fillPixelCircle(ctx, cx, cy, r - 5 + Math.sin(this.time * 0.08) * 0.8, 1);
        // Animated horizontal heat haze bands across the sun
        ctx.fillStyle = '#c84a4a';
        const bandShift = (this.time * 0.15) | 0;
        for (let i = 0; i < 4; i++) {
            const by = cy - r + 6 + ((i * 6 + bandShift) % (r * 2));
            ctx.fillRect(cx - r - 2, by, (r + 2) * 2, 1);
        }
    }

    // Slow-drifting flat clouds, drawn in the upper sky band
    drawClouds(ctx, camera) {
        const drift = this.time * 0.12;
        const clouds = [
            { y: 36, w: 36, sx: 20 },
            { y: 56, w: 24, sx: 130 },
            { y: 48, w: 30, sx: 220 },
            { y: 70, w: 18, sx: 80 }
        ];
        for (const c of clouds) {
            const x = ((c.sx + drift - camera.x * 0.05) % (GAME.WIDTH + 80) + GAME.WIDTH + 80) % (GAME.WIDTH + 80) - 40;
            // Cloud body: stacked pixel rows like SNES clouds
            ctx.fillStyle = '#e8a070';
            ctx.fillRect(x + 2, c.y,     c.w - 4, 1);
            ctx.fillStyle = '#f4c890';
            ctx.fillRect(x,     c.y + 1, c.w,     2);
            ctx.fillStyle = '#fff0c0';
            ctx.fillRect(x + 1, c.y + 1, c.w - 2, 1);
            ctx.fillStyle = '#c87060';
            ctx.fillRect(x + 4, c.y + 3, c.w - 8, 1);
        }
    }

    // Distant firefight: muzzle flashes flicker on the horizon
    drawDistantExplosions(ctx) {
        const flashes = [
            { x: 28,  base: 11 },
            { x: 92,  base: 23 },
            { x: 156, base: 41 },
            { x: 220, base: 59 }
        ];
        const baseY = this.horizonY - 14;
        for (const f of flashes) {
            // Each flash blinks on a different phase
            const v = Math.sin(this.time * 0.07 + f.base);
            if (v > 0.85) {
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(f.x - 1, baseY, 3, 1);
                ctx.fillRect(f.x, baseY - 1, 1, 3);
                ctx.fillStyle = '#fff5c0';
                ctx.fillRect(f.x, baseY, 1, 1);
            } else if (v > 0.6) {
                ctx.fillStyle = '#c84a4a';
                ctx.fillRect(f.x, baseY, 1, 1);
            }
        }
    }

    // Filled pixel-perfect circle. `step` = 1 solid, 2 dithered checkerboard.
    fillPixelCircle(ctx, cx, cy, r, step) {
        const r2 = r * r;
        for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
                if (x * x + y * y <= r2) {
                    if (step === 1 || ((x + y) & 1) === 0) {
                        ctx.fillRect(cx + x, cy + y, 1, 1);
                    }
                }
            }
        }
    }

    // ----- horizon haze band: pink mist where sky meets jungle -----
    drawHorizonHaze(ctx) {
        const y = this.horizonY - 14;
        ctx.fillStyle = '#e0683a';
        ctx.fillRect(0, y, GAME.WIDTH, 4);
        ctx.fillStyle = '#963656';
        ctx.fillRect(0, y + 4, GAME.WIDTH, 4);
        // Dithered top edge
        ctx.fillStyle = '#e0683a';
        for (let x = 0; x < GAME.WIDTH; x += 2) ctx.fillRect(x, y - 1, 1, 1);
        // Dithered bottom edge into dark
        ctx.fillStyle = '#4a1f3a';
        for (let x = 1; x < GAME.WIDTH; x += 2) ctx.fillRect(x, y + 8, 1, 1);
    }

    // ----- mountain ranges as solid silhouettes with ridge highlight -----
    drawMountains(ctx, heights, offset, fill, ridge) {
        const baseY = this.horizonY - 2;
        const w = heights.length;
        const off = Math.floor(((offset % w) + w) % w);
        ctx.fillStyle = fill;
        for (let x = 0; x < GAME.WIDTH; x++) {
            const h = heights[(x + off) % w];
            ctx.fillRect(x, baseY - h, 1, h);
        }
        // Ridge: 1-pixel highlight where the silhouette peaks
        if (ridge) {
            ctx.fillStyle = ridge;
            for (let x = 0; x < GAME.WIDTH; x++) {
                const h = heights[(x + off) % w];
                ctx.fillRect(x, baseY - h, 1, 1);
            }
        }
    }

    // ----- jungle tree line: silhouettes of palms made from pixel shapes -----
    drawTreeLine(ctx, trees, offset, fill, ridge, foreground) {
        const baseY = this.horizonY + (foreground ? 4 : 0);
        const off = Math.floor(((offset % (GAME.WIDTH * 4)) + GAME.WIDTH * 4) % (GAME.WIDTH * 4));
        ctx.fillStyle = fill;

        // Continuous canopy floor so trees blend into solid jungle
        const floorH = foreground ? 14 : 8;
        ctx.fillRect(0, baseY - floorH, GAME.WIDTH, floorH + 10);

        for (const t of trees) {
            const sx = t.x - off;
            const wrapped = ((sx % (GAME.WIDTH * 4)) + GAME.WIDTH * 4) % (GAME.WIDTH * 4);
            const screenX = wrapped > GAME.WIDTH * 2 ? wrapped - GAME.WIDTH * 4 : wrapped;
            if (screenX < -t.w * 2 || screenX > GAME.WIDTH + t.w * 2) continue;
            this.drawPalm(ctx, Math.floor(screenX), baseY - floorH, t.w, t.h, fill, ridge, foreground);
        }

        // Ridge highlight along tree-line top
        if (ridge) {
            ctx.fillStyle = ridge;
            // Sample treeline: keep the highlight subtle by only marking peaks
            ctx.fillRect(0, baseY - floorH, GAME.WIDTH, 1);
        }
    }

    // Palm tree silhouette: trunk + drooping fronds rendered as filled arcs.
    // Each frond is a sequence of vertical strokes whose vertical center
    // traces a parabolic curve outward and downward from the crown.
    drawPalm(ctx, x, baseY, w, h, fill, ridge, foreground) {
        ctx.fillStyle = fill;
        // Curved trunk
        const trunkW = Math.max(2, Math.floor(w / 6));
        for (let i = 0; i < h; i++) {
            const lean = Math.floor(Math.sin(i * 0.14) * (w / 8));
            ctx.fillRect(x - Math.floor(trunkW / 2) + lean, baseY - i, trunkW, 1);
        }
        // Crown anchor sits at the top of the trunk
        const cx = x + Math.floor(Math.sin(h * 0.14) * (w / 8));
        const cy = baseY - h;
        // Coconut bulb at crown base
        ctx.fillRect(cx - 2, cy - 1, 5, 3);

        // Fronds: each one is an arc that starts at the crown and droops outward.
        // Direction is (dx,dy), length is fr.len in pixels along the arc.
        const fr = Math.max(6, Math.floor(w * 0.9));
        const fronds = [
            { dx: -1, dy: -1.1, len: fr },
            { dx:  1, dy: -1.1, len: fr },
            { dx: -1.3, dy: -0.4, len: fr + 1 },
            { dx:  1.3, dy: -0.4, len: fr + 1 },
            { dx: -1.1, dy:  0.5, len: fr - 1 },
            { dx:  1.1, dy:  0.5, len: fr - 1 },
            { dx: -0.4, dy: -1.3, len: fr - 2 },
            { dx:  0.4, dy: -1.3, len: fr - 2 }
        ];
        for (const f of fronds) {
            const steps = f.len;
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                // Position along the frond
                const fx = Math.floor(cx + f.dx * i * 0.9);
                // Droop: parabola — starts up, curves down
                const droop = Math.floor((t * t) * f.len * 0.45 + f.dy * i * 0.5);
                const fy = cy + droop;
                // Thickness tapers from base to tip
                const thick = Math.max(1, Math.floor((1 - t) * 3) + 1);
                ctx.fillRect(fx, fy, 1, thick);
                // Side leaflets give the frond a feathered look
                if (i % 2 === 0 && i < steps - 1) {
                    ctx.fillRect(fx, fy - 1, 1, 1);
                    ctx.fillRect(fx, fy + thick, 1, 1);
                }
            }
        }

        // Highlight rim along the upper edge of each frond (foreground only)
        if (foreground && ridge) {
            ctx.fillStyle = ridge;
            for (const f of fronds.slice(0, 4)) {
                const steps = f.len;
                for (let i = 1; i <= steps; i += 2) {
                    const t = i / steps;
                    const fx = Math.floor(cx + f.dx * i * 0.9);
                    const droop = Math.floor((t * t) * f.len * 0.45 + f.dy * i * 0.5);
                    ctx.fillRect(fx, cy + droop - 1, 1, 1);
                }
            }
            // Coconut highlight
            ctx.fillRect(cx - 1, cy - 1, 1, 1);
            ctx.fillStyle = fill;
        }
    }

    // ----- floating embers/fireflies for jungle atmosphere -----
    drawEmbers(ctx) {
        ctx.fillStyle = '#ffd060';
        for (const e of this.embers) {
            const x = ((e.x + this.time * e.speed) % GAME.WIDTH + GAME.WIDTH) % GAME.WIDTH;
            const y = e.y + Math.floor(Math.sin(this.time * 0.04 + e.phase) * 2);
            if (y < this.horizonY - 6) {
                const bright = Math.sin(this.time * 0.1 + e.phase) > 0;
                ctx.fillStyle = bright ? '#fff0a0' : '#e0883a';
                ctx.fillRect(Math.floor(x), y, 1, 1);
            }
        }
    }
}

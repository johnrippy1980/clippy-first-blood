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
        if (this.theme === 'boardroom') return this.drawBoardRoom(ctx, camera);
        if (this.theme === 'keynote') return this.drawKeynote(ctx, camera);
        if (this.theme === 'founder') return this.drawFounderLair(ctx, camera);
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

    // ============================================
    // STAGE 4 - EXECUTIVE BOARDROOM (CEO floor)
    // Floor-to-ceiling windows looking out over a sunrise city skyline,
    // gold-trimmed walls with framed certificates, mahogany conference
    // table silhouette in foreground.
    // ============================================
    drawBoardRoom(ctx, camera) {
        this.drawBoardroomSky(ctx);
        this.drawBoardroomSkyline(ctx, camera);
        this.drawBoardroomWindowFrame(ctx);
        this.drawBoardroomWall(ctx);
        this.drawBoardroomFrames(ctx, camera);
        this.drawBoardroomTable(ctx, camera);
    }

    drawBoardroomSky(ctx) {
        // Sunrise gradient outside the window
        const bands = [
            { y: 0,   c: '#1a1a4a' },
            { y: 10,  c: '#2a2a5a' },
            { y: 22,  c: '#4a3a78' },
            { y: 34,  c: '#7a4a78' },
            { y: 48,  c: '#c84a78' },
            { y: 62,  c: '#ee8a3a' },
            { y: 78,  c: '#f4c860' },
            { y: 92,  c: '#fff0a8' },
            { y: 108, c: '#ffe0a0' }
        ];
        for (let i = 0; i < bands.length; i++) {
            const top = bands[i].y;
            const bot = i < bands.length - 1 ? bands[i + 1].y : 124;
            ctx.fillStyle = bands[i].c;
            ctx.fillRect(0, top, GAME.WIDTH, bot - top);
            if (i < bands.length - 1) {
                ctx.fillStyle = bands[i + 1].c;
                for (let x = (i & 1); x < GAME.WIDTH; x += 2) {
                    ctx.fillRect(x, bot - 1, 1, 1);
                }
            }
        }
        // Rising sun on the right
        const sx = 200, sy = 86, r = 14;
        ctx.fillStyle = '#ee8a3a';
        this.fillPixelCircle(ctx, sx, sy, r + 3, 1);
        ctx.fillStyle = '#ffd460';
        this.fillPixelCircle(ctx, sx, sy, r, 1);
        ctx.fillStyle = '#fff5c0';
        this.fillPixelCircle(ctx, sx, sy, r - 6, 1);
    }

    drawBoardroomSkyline(ctx, camera) {
        // Distant city skyline silhouette parallaxed slowly
        const baseY = 124;
        const off = (camera.x * 0.15) | 0;
        ctx.fillStyle = '#1a1140';
        const buildings = [
            { x: 10,  w: 30, h: 24 }, { x: 44, w: 14, h: 36 },
            { x: 62,  w: 24, h: 18 }, { x: 90, w: 18, h: 30 },
            { x: 112, w: 32, h: 22 }, { x: 148, w: 20, h: 28 },
            { x: 172, w: 16, h: 38 }, { x: 192, w: 28, h: 20 },
            { x: 224, w: 18, h: 32 }
        ];
        for (const b of buildings) {
            const sx = b.x - (off % 256);
            ctx.fillRect(sx, baseY - b.h, b.w, b.h);
            // Window lights
            ctx.fillStyle = '#ffd460';
            for (let wy = 4; wy < b.h - 2; wy += 4) {
                for (let wx = 2; wx < b.w - 2; wx += 4) {
                    if (((b.x + wx + wy * 3) & 7) < 2) {
                        ctx.fillRect(sx + wx, baseY - b.h + wy, 1, 1);
                    }
                }
            }
            ctx.fillStyle = '#1a1140';
        }
        // Faint smog/haze band
        ctx.fillStyle = 'rgba(192, 96, 96, 0.25)';
        ctx.fillRect(0, 118, GAME.WIDTH, 6);
    }

    drawBoardroomWindowFrame(ctx) {
        // Window mullions - the thick mahogany frames separating sky from wall
        const y = 124;
        ctx.fillStyle = '#3a2410';
        ctx.fillRect(0, y, GAME.WIDTH, 4);
        ctx.fillStyle = '#604830';
        ctx.fillRect(0, y, GAME.WIDTH, 2);
        ctx.fillStyle = '#806848';
        ctx.fillRect(0, y, GAME.WIDTH, 1);
        // Vertical window dividers
        ctx.fillStyle = '#3a2410';
        for (let x = 0; x < GAME.WIDTH; x += 64) {
            ctx.fillRect(x, 0, 3, y);
        }
        ctx.fillStyle = '#604830';
        for (let x = 0; x < GAME.WIDTH; x += 64) {
            ctx.fillRect(x, 0, 1, y);
        }
    }

    drawBoardroomWall(ctx) {
        // Mahogany wainscoting wall below the window frame
        const top = 128;
        ctx.fillStyle = '#3a1f10';
        ctx.fillRect(0, top, GAME.WIDTH, 192 - top);
        // Wainscoting panel divisions
        ctx.fillStyle = '#5a2f1a';
        ctx.fillRect(0, top + 2, GAME.WIDTH, 2);
        ctx.fillStyle = '#2a1408';
        ctx.fillRect(0, top + 4, GAME.WIDTH, 1);
        // Vertical panel lines every 32 px
        ctx.fillStyle = '#1a0e08';
        for (let x = 0; x < GAME.WIDTH; x += 32) {
            ctx.fillRect(x, top + 4, 1, 192 - top - 4);
        }
        // Gold-trim chair rail
        ctx.fillStyle = '#ffd460';
        ctx.fillRect(0, top + 30, GAME.WIDTH, 1);
        ctx.fillStyle = '#a8780a';
        ctx.fillRect(0, top + 31, GAME.WIDTH, 1);
    }

    drawBoardroomFrames(ctx, camera) {
        // Framed certificates / awards on the wall
        const off = (camera.x * 0.4) | 0;
        const items = [
            { x: 48,  w: 22, h: 18, type: 0 },
            { x: 130, w: 30, h: 14, type: 1 },
            { x: 200, w: 24, h: 20, type: 2 },
            { x: 280, w: 20, h: 16, type: 0 }
        ];
        for (const it of items) {
            const sx = ((it.x - off) % 320 + 320) % 320 - 40;
            if (sx < -it.w || sx > GAME.WIDTH) continue;
            const y = 138;
            // Frame
            ctx.fillStyle = '#a8780a';
            ctx.fillRect(sx, y, it.w, it.h);
            ctx.fillStyle = '#ffd460';
            ctx.fillRect(sx, y, it.w, 1);
            ctx.fillStyle = '#604010';
            ctx.fillRect(sx, y + it.h - 1, it.w, 1);
            // Inside paper
            ctx.fillStyle = '#fff8d0';
            ctx.fillRect(sx + 2, y + 2, it.w - 4, it.h - 4);
            // Content varies by type
            if (it.type === 0) {
                // Certificate with seal
                ctx.fillStyle = '#a82020';
                ctx.fillRect(sx + 4, y + 4, it.w - 8, 1);
                ctx.fillRect(sx + 4, y + 6, it.w - 10, 1);
                ctx.fillRect(sx + it.w - 8, y + it.h - 6, 4, 4);
                ctx.fillStyle = '#ffd460';
                ctx.fillRect(sx + it.w - 7, y + it.h - 5, 2, 2);
            } else if (it.type === 1) {
                // Stock chart going up
                ctx.fillStyle = '#208a30';
                for (let i = 0; i < (it.w - 6); i++) {
                    const hh = Math.max(1, Math.floor(i / 3));
                    ctx.fillRect(sx + 3 + i, y + it.h - 3 - hh, 1, hh);
                }
            } else {
                // CEO portrait
                ctx.fillStyle = '#a87040';
                ctx.fillRect(sx + 4, y + 4, it.w - 8, 6);  // head
                ctx.fillStyle = '#1a0e1e';
                ctx.fillRect(sx + 6, y + 6, 1, 1);          // eye
                ctx.fillRect(sx + it.w - 8, y + 6, 1, 1);   // eye
                ctx.fillStyle = '#3a2855';
                ctx.fillRect(sx + 4, y + 12, it.w - 8, it.h - 14);  // suit
                ctx.fillStyle = '#ff5050';
                ctx.fillRect(sx + it.w / 2 - 1, y + 12, 2, 4);     // tie
            }
        }
    }

    drawBoardroomTable(ctx, camera) {
        // Long conference table silhouette in the foreground
        const baseY = 174;
        const off = (camera.x * 0.7) | 0;
        ctx.fillStyle = '#1a0e08';
        ctx.fillRect(0, baseY, GAME.WIDTH, 6);
        // Mahogany top
        ctx.fillStyle = '#5a2f1a';
        ctx.fillRect(0, baseY, GAME.WIDTH, 2);
        ctx.fillStyle = '#806848';
        ctx.fillRect(0, baseY, GAME.WIDTH, 1);
        // Leather chairs at intervals
        for (let x = 8; x < GAME.WIDTH; x += 24) {
            const sx = ((x - off) % 192 + 192) % 192;
            // Chair back
            ctx.fillStyle = '#1a0808';
            ctx.fillRect(sx, baseY - 14, 10, 14);
            ctx.fillStyle = '#3a1a10';
            ctx.fillRect(sx + 1, baseY - 13, 8, 8);
            ctx.fillStyle = '#5a2a18';
            ctx.fillRect(sx + 1, baseY - 13, 8, 1);
        }
    }

    // ============================================
    // STAGE 5 - THE KEYNOTE (developer conference stage)
    // Giant LED screen, theater lighting, audience silhouettes,
    // red velvet curtains framing the stage.
    // ============================================
    drawKeynote(ctx, camera) {
        // Dim hall backdrop
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

        // Crossing spotlights from above
        this.drawKeynoteSpotlights(ctx);
        // Big LED screen at the back showing scrolling text
        this.drawKeynoteScreen(ctx);
        // Red velvet curtains framing the stage
        this.drawKeynoteCurtains(ctx);
        // Audience silhouettes in front of the stage
        this.drawKeynoteAudience(ctx, camera);
    }

    drawKeynoteSpotlights(ctx) {
        // Two crossing white spotlights from upper corners
        ctx.fillStyle = 'rgba(255, 240, 200, 0.10)';
        // Left cone
        for (let y = 0; y < 160; y++) {
            const w = Math.floor(y * 0.7);
            ctx.fillRect(0, y, w, 1);
        }
        for (let y = 0; y < 160; y++) {
            const w = Math.floor(y * 0.7);
            ctx.fillRect(GAME.WIDTH - w, y, w, 1);
        }
        // Color tints sweeping (red and blue) - shifts each frame
        const sway = Math.sin(this.time * 0.04);
        ctx.fillStyle = 'rgba(255, 60, 60, 0.10)';
        ctx.fillRect(40 + sway * 20, 0, 60, 140);
        ctx.fillStyle = 'rgba(60, 120, 255, 0.10)';
        ctx.fillRect(GAME.WIDTH - 100 - sway * 20, 0, 60, 140);
        // Beam dots streaming down through the air (looks volumetric)
        ctx.fillStyle = '#ffe070';
        for (let i = 0; i < 18; i++) {
            const x = (i * 13 + this.time) % GAME.WIDTH;
            const y = (i * 7 + this.time * 0.5) % 140;
            if (((i + this.time) | 0) & 3) continue;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    drawKeynoteScreen(ctx) {
        // Big LED screen - mounted high on the back wall
        const sX = 28, sY = 22, sW = GAME.WIDTH - 56, sH = 80;
        // Frame
        ctx.fillStyle = '#1a0e1e';
        ctx.fillRect(sX - 4, sY - 4, sW + 8, sH + 8);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(sX - 2, sY - 2, sW + 4, sH + 4);
        // Screen body
        ctx.fillStyle = '#0a1838';
        ctx.fillRect(sX, sY, sW, sH);
        // Subtle scanlines
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let y = sY; y < sY + sH; y += 2) ctx.fillRect(sX, y, sW, 1);

        // Big DEVELOPERS!!! text scrolling
        const t = (this.time * 0.5) | 0;
        const words = ['DEVELOPERS!', 'DEVELOPERS!', 'DEVELOPERS!'];
        for (let i = 0; i < words.length; i++) {
            const y = sY + 10 + i * 20;
            const wob = Math.floor(Math.sin(t * 0.05 + i) * 1);
            // Big text - drawn pixel-by-pixel via the font for crispness
            if (typeof drawPixelTextOutlined === 'function') {
                drawPixelTextOutlined(ctx, words[i],
                    GAME.WIDTH / 2 + wob, y,
                    i === 1 ? '#ffe070' : '#ff5050',
                    '#1a0000', 2, 'center', 1);
            }
        }
        // Microsoft-style 4-square logo above the text
        const lx = sX + 8, ly = sY + 6;
        ctx.fillStyle = '#ff5050'; ctx.fillRect(lx,     ly,     5, 5);
        ctx.fillStyle = '#50ff70'; ctx.fillRect(lx + 6, ly,     5, 5);
        ctx.fillStyle = '#5aa8e0'; ctx.fillRect(lx,     ly + 6, 5, 5);
        ctx.fillStyle = '#ffd460'; ctx.fillRect(lx + 6, ly + 6, 5, 5);
        // Stage edge / proscenium line
        ctx.fillStyle = '#3a1f10';
        ctx.fillRect(0, 124, GAME.WIDTH, 4);
        ctx.fillStyle = '#806040';
        ctx.fillRect(0, 124, GAME.WIDTH, 1);
    }

    drawKeynoteCurtains(ctx) {
        // Red velvet curtains on both sides framing the stage
        const fold = (sx, dir) => {
            ctx.fillStyle = '#7a1010';
            ctx.fillRect(sx, 0, 28, 124);
            // Folds (vertical stripes)
            for (let i = 0; i < 28; i += 4) {
                ctx.fillStyle = '#a82020';
                ctx.fillRect(sx + i, 0, 1, 124);
                ctx.fillStyle = '#5a0808';
                ctx.fillRect(sx + i + 2, 0, 1, 124);
            }
            // Top swag fringe
            ctx.fillStyle = '#a82020';
            for (let i = 0; i < 14; i++) {
                ctx.fillRect(sx + i * 2, 0, 1, 4 + (i & 3));
            }
            // Gold trim
            ctx.fillStyle = '#ffd460';
            ctx.fillRect(sx + (dir > 0 ? 27 : 0), 0, 1, 124);
        };
        fold(0, 1);
        fold(GAME.WIDTH - 28, -1);
    }

    drawKeynoteAudience(ctx, camera) {
        // Audience heads as silhouettes in front of the stage at floor level
        const baseY = 168;
        const off = (camera.x * 0.5) | 0;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, baseY, GAME.WIDTH, 12);
        ctx.fillStyle = '#1a1140';
        for (let x = 4; x < GAME.WIDTH; x += 8) {
            const sx = ((x + off) % 8) + x - (off % 8);
            const wob = ((sx * 7 + (this.time / 20 | 0)) & 7) === 0 ? -1 : 0;
            // Head
            ctx.fillRect(sx,     baseY - 8 + wob, 6, 5);
            // Shoulders
            ctx.fillRect(sx - 1, baseY - 3 + wob, 8, 4);
        }
        // Glowing phones held up in the crowd
        for (let i = 0; i < 8; i++) {
            const x = (i * 31 + this.time * 0.2) % GAME.WIDTH;
            const y = baseY - 4 + ((i * 7) % 3);
            if ((i + (this.time / 30 | 0)) & 1) {
                ctx.fillStyle = '#a8d8ff';
                ctx.fillRect(x, y - 2, 1, 2);
            }
        }
    }

    // ============================================
    // STAGE 6 - THE FOUNDER'S LAIR
    // Dark vault with a giant CRT showing Windows 95, stacks of money,
    // framed software boxes (Windows / Office / DOS), and gold trophies
    // hovering in the dark behind a faint green grid floor.
    // ============================================
    drawFounderLair(ctx, camera) {
        // Pitch black base
        ctx.fillStyle = '#08050a';
        ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
        // Slow code-rain background (Matrix-ish in green)
        this.drawFounderCodeRain(ctx);
        // Far wall - giant CRT monitor with Windows 95 desktop
        this.drawFounderCRT(ctx);
        // Framed software products on the wall
        this.drawFounderProductFrames(ctx, camera);
        // Money stacks on the floor (foreground)
        this.drawFounderMoneyStacks(ctx, camera);
        // Faint green grid (tron-style floor)
        this.drawFounderGrid(ctx);
    }

    drawFounderCodeRain(ctx) {
        // Green Matrix-style streams of binary
        ctx.fillStyle = '#0a3a14';
        for (let i = 0; i < 28; i++) {
            const x = (i * 11 + 4) % GAME.WIDTH;
            const offset = (this.time * (1 + (i % 3) * 0.3)) | 0;
            for (let j = 0; j < 6; j++) {
                const y = (offset + j * 18) % 192;
                if (((i + j) & 3) === 0) {
                    ctx.fillStyle = j === 0 ? '#50ff70' : '#208a30';
                    ctx.fillRect(x, y, 1, 6);
                }
            }
        }
    }

    drawFounderCRT(ctx) {
        // Big CRT monitor in the back. Shows the Windows 95 desktop.
        const mX = 40, mY = 22, mW = GAME.WIDTH - 80, mH = 80;
        // CRT case
        ctx.fillStyle = '#3a3838';
        ctx.fillRect(mX - 8, mY - 8, mW + 16, mH + 16);
        ctx.fillStyle = '#5a5858';
        ctx.fillRect(mX - 8, mY - 8, mW + 16, 2);
        ctx.fillStyle = '#1a1818';
        ctx.fillRect(mX - 8, mY + mH + 6, mW + 16, 2);
        // Screen with a slight curve illusion via dark corners
        ctx.fillStyle = '#0a205a';
        ctx.fillRect(mX, mY, mW, mH);
        ctx.fillStyle = '#3a78b8';
        ctx.fillRect(mX, mY, mW, 1);
        ctx.fillRect(mX, mY + mH - 1, mW, 1);
        // Win95-style 'Start' bar at the bottom
        ctx.fillStyle = '#a8a8a8';
        ctx.fillRect(mX + 2, mY + mH - 8, mW - 4, 6);
        ctx.fillStyle = '#dadada';
        ctx.fillRect(mX + 2, mY + mH - 8, mW - 4, 1);
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(mX + 2, mY + mH - 3, mW - 4, 1);
        // 'Start' button
        ctx.fillStyle = '#a8a8a8';
        ctx.fillRect(mX + 4, mY + mH - 7, 16, 4);
        ctx.fillStyle = '#dadada';
        ctx.fillRect(mX + 4, mY + mH - 7, 16, 1);
        // 4-square logo on Start button
        const lx = mX + 6, ly = mY + mH - 6;
        ctx.fillStyle = '#ff5050'; ctx.fillRect(lx,     ly,     2, 2);
        ctx.fillStyle = '#50ff70'; ctx.fillRect(lx + 3, ly,     2, 2);
        ctx.fillStyle = '#5aa8e0'; ctx.fillRect(lx,     ly + 3, 2, 2);
        ctx.fillStyle = '#ffd460'; ctx.fillRect(lx + 3, ly + 3, 2, 2);
        // Desktop icons (My Computer, Recycle Bin etc.)
        const icons = ['#a8a8c0', '#c0a070', '#5a5a5a', '#a82020'];
        for (let i = 0; i < icons.length; i++) {
            const ix = mX + 6, iy = mY + 4 + i * 14;
            ctx.fillStyle = icons[i];
            ctx.fillRect(ix, iy, 8, 8);
            ctx.fillStyle = '#fff';
            ctx.fillRect(ix, iy, 8, 1);
            ctx.fillStyle = '#0a205a';
            ctx.fillRect(ix - 1, iy + 9, 10, 2);   // label bar
        }
        // Cursor blinks at top-right
        if ((this.time & 16) < 8) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(mX + mW - 8, mY + 4, 1, 1);
            ctx.fillRect(mX + mW - 7, mY + 4, 1, 1);
            ctx.fillRect(mX + mW - 6, mY + 4, 1, 1);
            ctx.fillRect(mX + mW - 8, mY + 5, 1, 1);
            ctx.fillRect(mX + mW - 6, mY + 5, 1, 1);
        }
        // Reflective glass highlight
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(mX, mY, mW / 3, mH);
        // CRT scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let y = mY; y < mY + mH; y += 2) ctx.fillRect(mX, y, mW, 1);
    }

    drawFounderProductFrames(ctx, camera) {
        // Hovering "TROPHY" frames of his products
        const off = (camera.x * 0.25) | 0;
        const frames = [
            { x: 16,  label: 'WIN', col: '#5aa8e0' },
            { x: 64,  label: 'DOS', col: '#0a0612' },
            { x: 184, label: 'OFC', col: '#ff5050' },
            { x: 232, label: 'XCL', col: '#208a30' }
        ];
        for (const f of frames) {
            const sx = ((f.x - off) % 320 + 320) % 320 - 32;
            if (sx < -20 || sx > GAME.WIDTH) continue;
            const y = 116;
            // Gold trophy frame
            ctx.fillStyle = '#806010';
            ctx.fillRect(sx, y, 16, 14);
            ctx.fillStyle = '#ffd460';
            ctx.fillRect(sx, y, 16, 1);
            ctx.fillStyle = '#503006';
            ctx.fillRect(sx, y + 13, 16, 1);
            // Software box
            ctx.fillStyle = f.col;
            ctx.fillRect(sx + 2, y + 2, 12, 10);
            ctx.fillStyle = '#fff';
            ctx.fillRect(sx + 2, y + 2, 12, 1);
            // Label
            if (typeof drawPixelText === 'function') {
                drawPixelText(ctx, f.label, sx + 8, y + 5, '#fff', 1, 'center', 1);
            }
        }
    }

    drawFounderMoneyStacks(ctx, camera) {
        // Foreground money stacks
        const baseY = 168;
        const off = (camera.x * 0.7) | 0;
        for (let i = 0; i < 8; i++) {
            const sx = (((i * 36 - off) % (GAME.WIDTH + 36)) + GAME.WIDTH + 36) % (GAME.WIDTH + 36) - 18;
            // Stack of bills
            const stackH = 6 + (i % 3) * 2;
            for (let s = 0; s < stackH; s++) {
                ctx.fillStyle = s & 1 ? '#208a30' : '#1a4a18';
                ctx.fillRect(sx, baseY - s * 2, 20, 2);
                ctx.fillStyle = '#50a050';
                ctx.fillRect(sx + 2, baseY - s * 2, 16, 1);
                // $ symbol on top of each bill
                if (s === stackH - 1) {
                    ctx.fillStyle = '#fff8d0';
                    ctx.fillRect(sx + 9, baseY - s * 2 - 1, 2, 1);
                }
            }
            // Band around the stack
            ctx.fillStyle = '#a87040';
            ctx.fillRect(sx + 8, baseY - stackH * 2, 4, stackH * 2);
        }
    }

    drawFounderGrid(ctx) {
        // Tron-style green grid receding into the distance under the boss
        const baseY = 174;
        const horizonY = 130;
        ctx.fillStyle = '#0a3a14';
        // Horizontal grid lines (perspective)
        for (let i = 0; i < 8; i++) {
            const t = i / 8;
            const ly = horizonY + Math.pow(t, 2) * (baseY - horizonY);
            const alpha = 0.2 + t * 0.5;
            ctx.fillStyle = `rgba(80,255,112,${alpha})`;
            ctx.fillRect(0, ly, GAME.WIDTH, 1);
        }
        // Vertical converging lines from horizon to bottom
        const vp = GAME.WIDTH / 2;
        for (let i = -4; i <= 4; i++) {
            const bottomX = vp + i * (GAME.WIDTH / 8);
            const topX = vp + i * 4;
            const steps = 12;
            for (let s = 0; s < steps; s++) {
                const t = s / steps;
                const lx = topX + (bottomX - topX) * t;
                const ly = horizonY + (baseY - horizonY) * t;
                ctx.fillStyle = `rgba(80,255,112,${0.1 + t * 0.4})`;
                ctx.fillRect(Math.floor(lx), Math.floor(ly), 1, 1);
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

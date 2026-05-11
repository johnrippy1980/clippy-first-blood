// ============================================
// LEVEL - Tilemap and collision
// ============================================

class Level {
    constructor() {
        this.tiles = [];
        this.width = 0;
        this.height = 0;
        this.coverSpots = [];
        this.ladders = [];
        this.spawnPoints = [];
    }

    // Load a test level
    loadTestLevel() {
        // 64 tiles wide x 14 tiles tall (1024 x 224 pixels)
        this.width = 64;
        this.height = 14;

        // Create empty level
        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x] = TILE.EMPTY;
            }
        }

        // Ground layer (bottom 2 rows)
        for (let x = 0; x < this.width; x++) {
            this.tiles[12][x] = TILE.SOLID;
            this.tiles[13][x] = TILE.SOLID;
        }

        // Add some platforms
        // Platform 1
        for (let x = 8; x < 14; x++) {
            this.tiles[9][x] = TILE.PLATFORM;
        }

        // Platform 2
        for (let x = 18; x < 24; x++) {
            this.tiles[7][x] = TILE.PLATFORM;
        }

        // Platform 3 (higher)
        for (let x = 28; x < 32; x++) {
            this.tiles[5][x] = TILE.SOLID;
        }

        // Ladder
        for (let y = 6; y < 12; y++) {
            this.tiles[y][35] = TILE.LADDER;
            this.ladders.push({ x: 35 * GAME.TILE_SIZE, y: y * GAME.TILE_SIZE });
        }

        // Vine
        for (let y = 4; y < 12; y++) {
            this.tiles[y][45] = TILE.VINE;
            this.ladders.push({ x: 45 * GAME.TILE_SIZE, y: y * GAME.TILE_SIZE });
        }

        // Cover spots (doorways/caves)
        this.tiles[10][20] = TILE.COVER_SPOT;
        this.tiles[11][20] = TILE.COVER_SPOT;
        this.coverSpots.push({ x: 20 * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });

        this.tiles[10][40] = TILE.COVER_SPOT;
        this.tiles[11][40] = TILE.COVER_SPOT;
        this.coverSpots.push({ x: 40 * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });

        // Wall for wall-jumping practice
        for (let y = 6; y < 12; y++) {
            this.tiles[y][55] = TILE.SOLID;
            this.tiles[y][58] = TILE.SOLID;
        }

        // Some destructible blocks
        this.tiles[10][50] = TILE.DESTRUCTIBLE;
        this.tiles[10][51] = TILE.DESTRUCTIBLE;

        // Water at bottom of a pit
        this.tiles[12][25] = TILE.EMPTY;
        this.tiles[13][25] = TILE.WATER;
        this.tiles[12][26] = TILE.EMPTY;
        this.tiles[13][26] = TILE.WATER;

        // Enemy spawn points
        this.spawnPoints = [
            { x: 150, y: 160, type: 'STAPLER' },
            { x: 300, y: 160, type: 'STAPLER' },
            { x: 400, y: 80, type: 'FILE_FOLDER' },
            { x: 500, y: 100, type: 'FILE_FOLDER' },
            { x: 600, y: 160, type: 'RUBBER_BAND_BALL' },
            { x: 700, y: 160, type: 'TAPE_DISPENSER' },
            { x: 900, y: 120, type: 'FILE_CABINET' }
        ];
    }

    getTile(x, y) {
        const tileX = Math.floor(x / GAME.TILE_SIZE);
        const tileY = Math.floor(y / GAME.TILE_SIZE);

        if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) {
            return TILE.SOLID; // Out of bounds = solid
        }

        return this.tiles[tileY][tileX];
    }

    setTile(x, y, tile) {
        const tileX = Math.floor(x / GAME.TILE_SIZE);
        const tileY = Math.floor(y / GAME.TILE_SIZE);

        if (tileX >= 0 && tileX < this.width && tileY >= 0 && tileY < this.height) {
            this.tiles[tileY][tileX] = tile;
        }
    }

    isSolid(x, y) {
        const tile = this.getTile(x, y);
        return tile === TILE.SOLID || tile === TILE.DESTRUCTIBLE;
    }

    isPlatform(x, y) {
        return this.getTile(x, y) === TILE.PLATFORM;
    }

    isLadder(x, y) {
        const tile = this.getTile(x, y);
        return tile === TILE.LADDER || tile === TILE.VINE;
    }

    isWater(x, y) {
        return this.getTile(x, y) === TILE.WATER;
    }

    isCoverSpot(x, y) {
        return this.getTile(x, y) === TILE.COVER_SPOT;
    }

    getLadderAt(x, y) {
        if (this.isLadder(x, y)) {
            const tileX = Math.floor(x / GAME.TILE_SIZE);
            const tileY = Math.floor(y / GAME.TILE_SIZE);
            return { x: tileX * GAME.TILE_SIZE, y: tileY * GAME.TILE_SIZE };
        }
        return null;
    }

    getCoverSpotAt(x, y) {
        for (let spot of this.coverSpots) {
            if (Math.abs(x - spot.x - GAME.TILE_SIZE / 2) < GAME.TILE_SIZE &&
                Math.abs(y - spot.y - GAME.TILE_SIZE) < GAME.TILE_SIZE * 2) {
                return spot;
            }
        }
        return null;
    }

    destroyTile(x, y) {
        if (this.getTile(x, y) === TILE.DESTRUCTIBLE) {
            this.setTile(x, y, TILE.EMPTY);
            return true;
        }
        return false;
    }

    draw(ctx, camera) {
        const startX = Math.floor(camera.x / GAME.TILE_SIZE);
        const startY = Math.floor(camera.y / GAME.TILE_SIZE);
        const endX = Math.ceil((camera.x + GAME.WIDTH) / GAME.TILE_SIZE);
        const endY = Math.ceil((camera.y + GAME.HEIGHT) / GAME.TILE_SIZE);

        for (let y = startY; y <= endY && y < this.height; y++) {
            for (let x = startX; x <= endX && x < this.width; x++) {
                if (y < 0 || x < 0) continue;

                const tile = this.tiles[y][x];
                const screenX = x * GAME.TILE_SIZE - camera.x;
                const screenY = y * GAME.TILE_SIZE - camera.y;

                switch (tile) {
                    case TILE.SOLID:
                        this.drawSolidTile(ctx, screenX, screenY, x, y);
                        break;
                    case TILE.PLATFORM:
                        this.drawPlatformTile(ctx, screenX, screenY);
                        break;
                    case TILE.LADDER:
                        this.drawLadderTile(ctx, screenX, screenY);
                        break;
                    case TILE.VINE:
                        this.drawVineTile(ctx, screenX, screenY);
                        break;
                    case TILE.WATER:
                        this.drawWaterTile(ctx, screenX, screenY);
                        break;
                    case TILE.COVER_SPOT:
                        this.drawCoverSpotTile(ctx, screenX, screenY);
                        break;
                    case TILE.DESTRUCTIBLE:
                        this.drawDestructibleTile(ctx, screenX, screenY);
                        break;
                }
            }
        }
    }

    drawSolidTile(ctx, x, y, tileX, tileY) {
        const above = tileY > 0 ? this.tiles[tileY - 1][tileX] : TILE.SOLID;
        const leftEdge  = tileX === 0              || !this.isSolid(tileX * GAME.TILE_SIZE - 1, tileY * GAME.TILE_SIZE);
        const rightEdge = tileX === this.width - 1 || !this.isSolid((tileX + 1) * GAME.TILE_SIZE, tileY * GAME.TILE_SIZE);
        const isSurface = above === TILE.EMPTY || above === TILE.PLATFORM;

        if (isSurface) {
            this.drawGrassTopTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
        } else {
            this.drawDirtTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
        }
    }

    // SNES-style grass surface tile: jagged blade tops, deep soil with pebbles
    drawGrassTopTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        const GRASS_DEEP = '#1a4015';
        const GRASS_MID  = '#2d6a1e';
        const GRASS_LIT  = '#5dc23a';
        const GRASS_SPEC = '#a8e860';
        const DIRT_DEEP  = '#1a0e05';
        const DIRT_DARK  = '#3a2410';
        const DIRT_MID   = '#5a3818';
        const DIRT_LIT   = '#7a5020';
        const DIRT_SPEC  = '#a87040';

        // Dirt body fill first
        ctx.fillStyle = DIRT_MID;
        ctx.fillRect(x, y, 16, 16);
        // Soil texture: deterministic per-tile noise
        for (let py = 5; py < 16; py++) {
            for (let px = 0; px < 16; px++) {
                // Wang-style hash gives chaotic noise without diagonal banding
                let n = (tileX * 374761393) ^ (tileY * 668265263) ^ (px * 2147483647) ^ (py * 1597334677);
                n = (n ^ (n >>> 13)) * 1274126177;
                n = (n ^ (n >>> 16)) & 0xff;
                if (n < 64) { ctx.fillStyle = DIRT_DARK; ctx.fillRect(x + px, y + py, 1, 1); }
                else if (n > 200) { ctx.fillStyle = DIRT_LIT; ctx.fillRect(x + px, y + py, 1, 1); }
            }
        }
        // Pebble specks
        ctx.fillStyle = DIRT_SPEC;
        const pebbleSeed = (tileX * 13 + tileY * 31) & 0xff;
        ctx.fillRect(x + (pebbleSeed % 14) + 1, y + 8 + ((pebbleSeed >> 3) % 5), 2, 1);
        ctx.fillRect(x + ((pebbleSeed >> 5) % 12) + 2, y + 12 + ((pebbleSeed >> 2) % 3), 1, 1);

        // Grass band on top (4 rows)
        ctx.fillStyle = GRASS_MID;
        ctx.fillRect(x, y, 16, 5);
        ctx.fillStyle = GRASS_DEEP;
        ctx.fillRect(x, y + 4, 16, 1);
        // Jagged blade tops
        const bladeSeed = (tileX * 17 + tileY * 23) & 0xff;
        for (let px = 0; px < 16; px++) {
            const h = ((bladeSeed >> (px % 6)) + px * 3) % 4;  // 0..3
            ctx.fillStyle = GRASS_LIT;
            ctx.fillRect(x + px, y + 1 + h, 1, 3 - h);
            if (h === 0) {
                ctx.fillStyle = GRASS_SPEC;
                ctx.fillRect(x + px, y + 1, 1, 1);
            }
        }
        // Top-left highlight strip (SNES bevel)
        ctx.fillStyle = GRASS_SPEC;
        if (leftEdge) ctx.fillRect(x, y + 1, 1, 3);
        // Dirt edges get a darker outline
        ctx.fillStyle = DIRT_DEEP;
        if (leftEdge)  ctx.fillRect(x,      y + 5, 1, 11);
        if (rightEdge) ctx.fillRect(x + 15, y + 5, 1, 11);
        // Bottom shadow row
        ctx.fillStyle = DIRT_DEEP;
        ctx.fillRect(x, y + 15, 16, 1);
    }

    // SNES-style buried dirt tile
    drawDirtTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        const DIRT_DEEP = '#1a0e05';
        const DIRT_DARK = '#3a2410';
        const DIRT_MID  = '#5a3818';
        const DIRT_LIT  = '#7a5020';
        const DIRT_SPEC = '#a87040';

        ctx.fillStyle = DIRT_MID;
        ctx.fillRect(x, y, 16, 16);
        for (let py = 0; py < 16; py++) {
            for (let px = 0; px < 16; px++) {
                // Wang-style hash gives chaotic noise without diagonal banding
                let n = (tileX * 374761393) ^ (tileY * 668265263) ^ (px * 2147483647) ^ (py * 1597334677);
                n = (n ^ (n >>> 13)) * 1274126177;
                n = (n ^ (n >>> 16)) & 0xff;
                if (n < 70)        { ctx.fillStyle = DIRT_DARK; ctx.fillRect(x + px, y + py, 1, 1); }
                else if (n > 210)  { ctx.fillStyle = DIRT_LIT;  ctx.fillRect(x + px, y + py, 1, 1); }
            }
        }
        // Embedded rock cluster
        const rockSeed = (tileX * 41 + tileY * 19) & 0xff;
        const rx = x + (rockSeed % 11) + 2;
        const ry = y + ((rockSeed >> 3) % 11) + 2;
        ctx.fillStyle = DIRT_DEEP;
        ctx.fillRect(rx, ry, 4, 3);
        ctx.fillRect(rx + 1, ry - 1, 2, 1);
        ctx.fillStyle = DIRT_SPEC;
        ctx.fillRect(rx + 1, ry, 1, 1);
        // Edge outlines
        ctx.fillStyle = DIRT_DEEP;
        if (leftEdge)  ctx.fillRect(x,      y, 1, 16);
        if (rightEdge) ctx.fillRect(x + 15, y, 1, 16);
    }

    // SNES-style wooden platform: bright top, grain, drop shadow
    drawPlatformTile(ctx, x, y) {
        const TOP_LIT = '#d09050';
        const TOP     = '#a87040';
        const MID_LIT = '#8a5830';
        const MID     = '#6a4020';
        const DARK    = '#3a2410';
        const SHADOW  = '#1a0e05';

        // Solid plank body
        ctx.fillStyle = MID;
        ctx.fillRect(x, y, 16, 6);
        // Top highlight band
        ctx.fillStyle = TOP_LIT;
        ctx.fillRect(x, y, 16, 1);
        ctx.fillStyle = TOP;
        ctx.fillRect(x, y + 1, 16, 1);
        // Wood grain lines
        ctx.fillStyle = MID_LIT;
        ctx.fillRect(x + 1, y + 2, 4, 1);
        ctx.fillRect(x + 8, y + 2, 5, 1);
        ctx.fillRect(x + 2, y + 4, 6, 1);
        ctx.fillRect(x + 11, y + 4, 4, 1);
        // Bottom edge shadow
        ctx.fillStyle = DARK;
        ctx.fillRect(x, y + 5, 16, 1);
        // Drop shadow into the air beneath
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x, y + 6, 16, 2);
        // Bolts / rivets at corners
        ctx.fillStyle = SHADOW;
        ctx.fillRect(x + 1, y + 1, 1, 1);
        ctx.fillRect(x + 14, y + 1, 1, 1);
        ctx.fillStyle = TOP_LIT;
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x + 14, y, 1, 1);
    }

    drawLadderTile(ctx, x, y) {
        // Pixel-based ladder
        const ladderPalette = {
            0: null,
            1: '#2a1a0a',
            2: '#5a4030',
            3: '#8a6848',
            4: '#a88868'
        };
        // Draw vertical rails
        for (let py = 0; py < 16; py++) {
            ctx.fillStyle = ladderPalette[2];
            ctx.fillRect(x + 2, y + py, 3, 1);
            ctx.fillRect(x + 11, y + py, 3, 1);
        }
        // Draw rungs
        ctx.fillStyle = ladderPalette[3];
        ctx.fillRect(x + 2, y + 3, 12, 2);
        ctx.fillRect(x + 2, y + 10, 12, 2);
        // Highlights
        ctx.fillStyle = ladderPalette[4];
        ctx.fillRect(x + 3, y + 3, 1, 1);
        ctx.fillRect(x + 3, y + 10, 1, 1);
    }

    drawVineTile(ctx, x, y) {
        const vinePalette = {
            1: '#1a3a1a',
            2: '#2a5a2a',
            3: '#3a7a3a',
            4: '#4a9a4a'
        };
        // Main vine stem
        for (let py = 0; py < 16; py++) {
            ctx.fillStyle = vinePalette[2];
            ctx.fillRect(x + 6, y + py, 4, 1);
            // Add variation
            if (py % 3 === 0) {
                ctx.fillStyle = vinePalette[1];
                ctx.fillRect(x + 7, y + py, 2, 1);
            }
        }
        // Leaves
        ctx.fillStyle = vinePalette[3];
        ctx.fillRect(x + 2, y + 4, 5, 3);
        ctx.fillRect(x + 9, y + 10, 5, 3);
        ctx.fillStyle = vinePalette[4];
        ctx.fillRect(x + 3, y + 5, 2, 1);
        ctx.fillRect(x + 10, y + 11, 2, 1);
    }

    drawWaterTile(ctx, x, y) {
        const DEEP = '#0a1838';
        const DARK = '#1a3868';
        const MID  = '#3a78b8';
        const LIT  = '#5aa8e0';
        const FOAM = '#c8e8ff';

        // Deep base
        ctx.fillStyle = DEEP;
        ctx.fillRect(x, y, 16, 16);
        // Mid band
        ctx.fillStyle = DARK;
        ctx.fillRect(x, y + 2, 16, 14);
        ctx.fillStyle = MID;
        ctx.fillRect(x, y + 4, 16, 10);

        // Animated wave offset
        const t = (Date.now() / 80) | 0;
        const wave = t & 0x0f;

        // Surface foam line (top 2 px)
        ctx.fillStyle = FOAM;
        for (let px = 0; px < 16; px++) {
            const w = (px + wave) % 4;
            ctx.fillRect(x + px, y + (w < 2 ? 0 : 1), 1, 1);
        }
        // Light bands sweeping across
        ctx.fillStyle = LIT;
        for (let px = 0; px < 16; px++) {
            const w = (px - wave + 16) % 8;
            if (w < 2) ctx.fillRect(x + px, y + 5, 1, 1);
            if (w < 1) ctx.fillRect(x + px, y + 9, 1, 1);
        }
        // Deep caustic flecks
        ctx.fillStyle = DARK;
        for (let py = 7; py < 15; py += 2) {
            const cx = (py * 3 + wave) % 16;
            ctx.fillRect(x + cx, y + py, 1, 1);
        }
    }

    drawCoverSpotTile(ctx, x, y) {
        // Dark cave/doorway with pixel detail
        const cavePalette = {
            1: '#0a0a0a',
            2: '#1a1a1a',
            3: '#2a2a2a',
            4: '#3a3a3a'
        };
        // Background darkness
        ctx.fillStyle = cavePalette[1];
        ctx.fillRect(x, y, 16, 16);
        // Frame left
        ctx.fillStyle = cavePalette[3];
        ctx.fillRect(x, y, 3, 16);
        ctx.fillStyle = cavePalette[4];
        ctx.fillRect(x + 1, y, 1, 16);
        // Frame right
        ctx.fillStyle = cavePalette[3];
        ctx.fillRect(x + 13, y, 3, 16);
        ctx.fillStyle = cavePalette[4];
        ctx.fillRect(x + 14, y, 1, 16);
        // Frame top
        ctx.fillStyle = cavePalette[3];
        ctx.fillRect(x, y, 16, 3);
        ctx.fillStyle = cavePalette[4];
        ctx.fillRect(x + 3, y + 1, 10, 1);
    }

    drawDestructibleTile(ctx, x, y) {
        // Cracked stone with pixel detail
        const stonePalette = {
            1: '#443322',
            2: '#665544',
            3: '#887766',
            4: '#aa9988'
        };
        // Base stone
        for (let py = 0; py < 16; py++) {
            for (let px = 0; px < 16; px++) {
                const noise = ((px * 7 + py * 13) % 4) + 1;
                ctx.fillStyle = stonePalette[noise];
                ctx.fillRect(x + px, y + py, 1, 1);
            }
        }
        // Cracks
        ctx.fillStyle = '#221100';
        ctx.fillRect(x + 4, y, 1, 3);
        ctx.fillRect(x + 5, y + 3, 1, 2);
        ctx.fillRect(x + 6, y + 5, 1, 3);
        ctx.fillRect(x + 7, y + 8, 1, 2);
        ctx.fillRect(x + 8, y + 10, 1, 3);
        ctx.fillRect(x + 10, y + 5, 1, 4);
        ctx.fillRect(x + 11, y + 9, 1, 3);
    }
}

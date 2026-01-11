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
        // Check if this is a surface tile (has empty above)
        const aboveTile = tileY > 0 ? this.tiles[tileY - 1][tileX] : TILE.SOLID;

        if (aboveTile === TILE.EMPTY || aboveTile === TILE.PLATFORM) {
            // Surface tile with grass - use pixel sprite
            spriteRenderer.drawSprite(ctx, x, y, TILE_SPRITES.ground, TILE_PALETTE);
        } else {
            // Underground dirt - use pixel sprite
            spriteRenderer.drawSprite(ctx, x, y, TILE_SPRITES.dirt, TILE_PALETTE);
        }
    }

    drawPlatformTile(ctx, x, y) {
        // Use pixel sprite for platform
        spriteRenderer.drawSprite(ctx, x, y, TILE_SPRITES.platform, TILE_PALETTE);
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
        // Use pixel sprite for water
        spriteRenderer.drawSprite(ctx, x, y, TILE_SPRITES.water, TILE_PALETTE);
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

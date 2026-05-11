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
        this.theme = 'jungle';        // 'jungle' | 'breakroom'
    }

    // Hand-designed Stage 1: OFFICE JUNGLE
    // 100 tiles wide x 14 tall = 1600 x 224 px
    // Three sections: approach (0-30), combat (30-75), boss arena (75-100)
    loadTestLevel() { this.loadStage1(); }

    loadStage1() {
        this.theme = 'jungle';
        this.width = 100;
        this.height = 14;
        this.bossArenaX = 80 * GAME.TILE_SIZE;
        this.endX = 99 * GAME.TILE_SIZE;
        this.coverSpots = [];
        this.ladders = [];
        this.pickups = [];
        // Checkpoint x-coords (player respawns at the highest passed value)
        this.checkpoints = [
            { x: 50,             y: 160 },
            { x: 30 * 16,        y: 160 },
            { x: 56 * 16,        y: 7 * 16 },   // top of high plateau
            { x: 78 * 16,        y: 160 }       // just before boss arena
        ];

        // Empty grid
        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = new Array(this.width).fill(TILE.EMPTY);
        }

        const fill = (x1, y1, x2, y2, t) => {
            for (let y = y1; y <= y2; y++) {
                for (let x = x1; x <= x2; x++) {
                    if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
                        this.tiles[y][x] = t;
                    }
                }
            }
        };
        const ladder = (x, y1, y2) => {
            for (let y = y1; y <= y2; y++) {
                this.tiles[y][x] = TILE.LADDER;
                this.ladders.push({ x: x * GAME.TILE_SIZE, y: y * GAME.TILE_SIZE });
            }
        };
        const vine = (x, y1, y2) => {
            for (let y = y1; y <= y2; y++) {
                this.tiles[y][x] = TILE.VINE;
                this.ladders.push({ x: x * GAME.TILE_SIZE, y: y * GAME.TILE_SIZE });
            }
        };
        const cover = (x) => {
            this.tiles[10][x] = TILE.COVER_SPOT;
            this.tiles[11][x] = TILE.COVER_SPOT;
            this.coverSpots.push({ x: x * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });
        };

        // ---- Ground (rows 12-13 by default, with gaps where noted) ----
        fill(0, 12, this.width - 1, 13, TILE.SOLID);

        // ===== SECTION 1: APPROACH (tiles 0-30) =====
        // Gentle intro - one platform, one ladder, one enemy

        // Stepping platforms in the air
        fill(7, 10, 9, 10, TILE.PLATFORM);
        fill(13, 8, 16, 8, TILE.PLATFORM);

        // Ladder leading down to a low ledge / cover
        ladder(20, 7, 11);
        // Elevated ledge spanning 18-23
        fill(18, 7, 23, 7, TILE.SOLID);
        cover(22);  // safe spot mid-approach

        // First water pit (tile 26-27)
        fill(25, 12, 28, 13, TILE.EMPTY);
        fill(25, 13, 28, 13, TILE.WATER);
        // Small floating platform spanning the pit
        fill(26, 10, 27, 10, TILE.PLATFORM);

        // ===== SECTION 2: COMBAT (tiles 30-75) =====
        // Heavier enemies, vertical movement, destructibles, pickups

        // Vine descent area
        vine(34, 3, 11);

        // Mid-air platform with a flame thrower pickup
        fill(38, 7, 42, 7, TILE.PLATFORM);
        this.pickups.push({ x: 40 * GAME.TILE_SIZE, y: 5 * GAME.TILE_SIZE + 8, type: 'FLAME', taken: false });

        // Destructible block stack (shoot to clear)
        fill(46, 9, 47, 11, TILE.DESTRUCTIBLE);

        // Big pit with water (tiles 50-53)
        fill(50, 12, 53, 13, TILE.EMPTY);
        fill(50, 13, 53, 13, TILE.WATER);
        // Two platform stones across
        fill(51, 10, 51, 10, TILE.PLATFORM);
        fill(53, 9,  53, 9,  TILE.PLATFORM);

        // High plateau (tiles 56-62)
        fill(55, 8, 62, 11, TILE.SOLID);
        cover(60);  // doorway carved into the plateau side
        ladder(54, 8, 11);  // ladder up the front

        // Wall jump corridor (between two vertical walls)
        fill(66, 4, 66, 11, TILE.SOLID);
        fill(70, 4, 70, 11, TILE.SOLID);
        // Spread-shot pickup at the top
        this.pickups.push({ x: 68 * GAME.TILE_SIZE, y: 2 * GAME.TILE_SIZE + 8, type: 'SPREAD', taken: false });
        // Platform at the top of the chasm to land on
        fill(67, 3, 69, 3, TILE.SOLID);

        // ===== SECRET ROOM (above the wall-jump chasm) =====
        // The platform at row 3 looks like the ceiling, but the top wall block
        // at tiles 67-69, row 3 is actually a soft-landing zone. Just keep
        // wall-jumping past it - the chasm continues up into a hidden vault.
        // Carve out a 4-tile-wide x 3-tall pocket two rows above the platform.
        // Player can wall-jump up through the gap on the left side.
        fill(67, 0, 70, 2, TILE.EMPTY);          // hollow secret chamber
        fill(67, 0, 70, 0, TILE.SOLID);          // ceiling
        fill(66, 0, 66, 2, TILE.SOLID);          // left wall (continuation)
        fill(71, 0, 71, 2, TILE.SOLID);          // right wall (continuation)
        // Reward pickups - a 1UP and a heavy weapon (flagged as secret-room)
        this.pickups.push({ x: 68 * GAME.TILE_SIZE,     y: 1 * GAME.TILE_SIZE + 8, type: '1UP',            taken: false, secret: true });
        this.pickups.push({ x: 69 * GAME.TILE_SIZE + 8, y: 1 * GAME.TILE_SIZE + 8, type: 'STAPLE_REMOVER', taken: false, secret: true });
        // Mark the secret entrance gap (between the two walls at rows 0-2)
        // by removing the small piece of "ceiling" that would otherwise seal it
        this.tiles[3][68] = TILE.EMPTY;
        this.tiles[3][69] = TILE.EMPTY;

        // Tape dispenser turret perch
        fill(73, 9, 76, 9, TILE.SOLID);

        // ===== SECTION 3: BOSS ARENA (tiles 80-100) =====
        // Walled arena with the file cabinet, then the exit goal

        // Arena entrance gate (low wall the player drops over)
        fill(80, 9, 80, 11, TILE.SOLID);

        // Arena floor pre-cleared (no pits)
        // Arena back wall (right side, with a doorway)
        fill(95, 3, 95, 11, TILE.SOLID);
        // Pillars on either side of the cabinet for cover
        fill(85, 9, 85, 11, TILE.SOLID);
        fill(91, 9, 91, 11, TILE.SOLID);
        cover(84);  // safe doorway in left pillar

        // Laser pickup right before the boss (reward for getting here)
        this.pickups.push({ x: 81 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'LASER', taken: false });

        // Stage end marker (just past the back wall)
        fill(96, 9, 99, 11, TILE.EMPTY);

        // ---- Enemy spawn points ----
        this.spawnPoints = [
            // Section 1: approach
            { x: 11 * 16, y: 11 * 16, type: 'STAPLER' },
            { x: 22 * 16, y: 6  * 16, type: 'STAPLER' },        // on the ledge
            // Section 2: combat
            { x: 32 * 16, y: 6  * 16, type: 'FILE_FOLDER' },
            { x: 44 * 16, y: 5  * 16, type: 'FILE_FOLDER' },
            { x: 45 * 16, y: 11 * 16, type: 'STAPLER' },
            { x: 49 * 16, y: 11 * 16, type: 'RUBBER_BAND_BALL' },
            { x: 58 * 16, y: 7  * 16, type: 'STAPLER' },        // on plateau
            { x: 67 * 16, y: 11 * 16, type: 'STAPLER' },        // bottom of wall-jump
            { x: 74 * 16, y: 8  * 16, type: 'TAPE_DISPENSER' }, // on turret perch
            { x: 78 * 16, y: 11 * 16, type: 'RUBBER_BAND_BALL' },
            // Section 3: boss
            { x: 90 * 16, y: 8  * 16, type: 'FILE_CABINET' }
        ];
    }

    // ---- Stage 2: BREAK ROOM RUMBLE ----
    loadStage2() {
        this.theme = 'breakroom';
        this.width = 100;
        this.height = 14;
        this.bossArenaX = 82 * GAME.TILE_SIZE;
        this.endX = 99 * GAME.TILE_SIZE;
        this.coverSpots = [];
        this.ladders = [];
        this.pickups = [];
        this.checkpoints = [
            { x: 50,             y: 160 },
            { x: 30 * 16,        y: 160 },
            { x: 57 * 16,        y: 7 * 16 },
            { x: 80 * 16,        y: 160 }
        ];

        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = new Array(this.width).fill(TILE.EMPTY);
        }

        const fill = (x1, y1, x2, y2, t) => {
            for (let y = y1; y <= y2; y++) {
                for (let x = x1; x <= x2; x++) {
                    if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
                        this.tiles[y][x] = t;
                    }
                }
            }
        };
        const ladder = (x, y1, y2) => {
            for (let y = y1; y <= y2; y++) {
                this.tiles[y][x] = TILE.LADDER;
                this.ladders.push({ x: x * GAME.TILE_SIZE, y: y * GAME.TILE_SIZE });
            }
        };
        const cover = (x) => {
            this.tiles[10][x] = TILE.COVER_SPOT;
            this.tiles[11][x] = TILE.COVER_SPOT;
            this.coverSpots.push({ x: x * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });
        };

        // Linoleum floor
        fill(0, 12, this.width - 1, 13, TILE.SOLID);

        // ===== Section 1: ENTRY HALLWAY (0-30) =====
        // Conference table stepping platforms
        fill(6, 10, 9, 10, TILE.PLATFORM);
        fill(13, 8, 17, 8, TILE.PLATFORM);

        // Filing cabinet stack (climbable as ladder)
        ladder(20, 7, 11);
        fill(18, 7, 23, 7, TILE.SOLID);
        cover(22);

        // Coffee spill in the floor (counts as water hazard)
        fill(25, 12, 28, 13, TILE.EMPTY);
        fill(25, 13, 28, 13, TILE.WATER);
        fill(26, 10, 27, 10, TILE.PLATFORM);

        // ===== Section 2: BULLPEN (30-75) =====
        // Cubicle row (climb up the wall like a vine)
        ladder(33, 3, 11);

        // Suspended ceiling platform with FLAME pickup
        fill(37, 7, 42, 7, TILE.PLATFORM);
        this.pickups.push({ x: 40 * GAME.TILE_SIZE, y: 5 * GAME.TILE_SIZE + 8, type: 'STAPLE_REMOVER', taken: false });

        // Stacks of office boxes - destructible
        fill(46, 9, 47, 11, TILE.DESTRUCTIBLE);

        // Wide coffee puddle pit
        fill(50, 12, 54, 13, TILE.EMPTY);
        fill(50, 13, 54, 13, TILE.WATER);
        fill(51, 10, 51, 10, TILE.PLATFORM);
        fill(53, 9,  53, 9,  TILE.PLATFORM);

        // Mezzanine (executive lounge)
        fill(56, 8, 63, 11, TILE.SOLID);
        cover(60);
        ladder(55, 8, 11);

        // Reception desk wall-jump chasm
        fill(67, 4, 67, 11, TILE.SOLID);
        fill(71, 4, 71, 11, TILE.SOLID);
        this.pickups.push({ x: 69 * GAME.TILE_SIZE, y: 2 * GAME.TILE_SIZE + 8, type: 'FLAME', taken: false });
        fill(68, 3, 70, 3, TILE.SOLID);

        // Vending machine perch for the tape dispenser
        fill(74, 9, 77, 9, TILE.SOLID);

        // ===== Section 3: COPIER ARENA (82-100) =====
        fill(82, 9, 82, 11, TILE.SOLID);
        fill(95, 3, 95, 11, TILE.SOLID);
        fill(86, 9, 86, 11, TILE.SOLID);
        fill(92, 9, 92, 11, TILE.SOLID);
        cover(85);
        this.pickups.push({ x: 83 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'LASER', taken: false });
        fill(96, 9, 99, 11, TILE.EMPTY);

        // Enemy spawn points - more density than Stage 1, with Stage 2 unique enemies
        this.spawnPoints = [
            // Section 1: entry hallway
            { x: 10 * 16, y: 10 * 16, type: 'SWIVEL_CHAIR' },     // first encounter charges at you
            { x: 16 * 16, y: 7  * 16, type: 'HIGHLIGHTER' },
            { x: 22 * 16, y: 6  * 16, type: 'STAPLER' },
            { x: 30 * 16, y: 11 * 16, type: 'RUBBER_BAND_BALL' },
            // Section 2: bullpen
            { x: 34 * 16, y: 6  * 16, type: 'HIGHLIGHTER' },
            { x: 38 * 16, y: 6  * 16, type: 'FILE_FOLDER' },
            { x: 42 * 16, y: 5  * 16, type: 'HIGHLIGHTER' },
            { x: 45 * 16, y: 10 * 16, type: 'SWIVEL_CHAIR' },
            { x: 48 * 16, y: 11 * 16, type: 'STAPLER' },
            { x: 58 * 16, y: 7  * 16, type: 'SWIVEL_CHAIR' },     // top of plateau, dangerous
            { x: 60 * 16, y: 7  * 16, type: 'STAPLER' },
            { x: 65 * 16, y: 5  * 16, type: 'HIGHLIGHTER' },      // wall-jump area aerial sniper
            { x: 67 * 16, y: 11 * 16, type: 'TAPE_DISPENSER' },
            { x: 75 * 16, y: 8  * 16, type: 'TAPE_DISPENSER' },
            { x: 79 * 16, y: 11 * 16, type: 'RUBBER_BAND_BALL' },
            // Section 3: copier arena
            { x: 80 * 16, y: 11 * 16, type: 'SWIVEL_CHAIR' },     // last warning
            { x: 88 * 16, y: 8  * 16, type: 'PHOTOCOPIER' }
        ];
    }

    // ---- Stage 3: SERVER FARM SHOWDOWN ----
    loadStage3() {
        this.theme = 'serverroom';
        this.width = 110;
        this.height = 14;
        this.bossArenaX = 86 * GAME.TILE_SIZE;
        this.endX = 109 * GAME.TILE_SIZE;
        this.coverSpots = [];
        this.ladders = [];
        this.pickups = [];
        this.checkpoints = [
            { x: 50,             y: 160 },
            { x: 28 * 16,        y: 4 * 16 },
            { x: 60 * 16,        y: 7 * 16 },
            { x: 84 * 16,        y: 160 }
        ];

        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = new Array(this.width).fill(TILE.EMPTY);
        }

        const fill = (x1, y1, x2, y2, t) => {
            for (let y = y1; y <= y2; y++) {
                for (let x = x1; x <= x2; x++) {
                    if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
                        this.tiles[y][x] = t;
                    }
                }
            }
        };
        const ladder = (x, y1, y2) => {
            for (let y = y1; y <= y2; y++) {
                this.tiles[y][x] = TILE.LADDER;
                this.ladders.push({ x: x * GAME.TILE_SIZE, y: y * GAME.TILE_SIZE });
            }
        };
        const cover = (x) => {
            this.tiles[10][x] = TILE.COVER_SPOT;
            this.tiles[11][x] = TILE.COVER_SPOT;
            this.coverSpots.push({ x: x * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });
        };

        // Floor grating
        fill(0, 12, this.width - 1, 13, TILE.SOLID);

        // ===== Section 1: APPROACH (0-32) =====
        // Server rack catwalks
        fill(6, 9, 9, 9, TILE.PLATFORM);
        fill(13, 7, 17, 7, TILE.PLATFORM);
        fill(21, 5, 25, 5, TILE.PLATFORM);

        // Patch cable maintenance ladder
        ladder(28, 6, 11);
        fill(28, 5, 32, 5, TILE.SOLID);
        cover(30);

        // ===== Section 2: VERTICAL DATA CORE (32-70) =====
        // A series of platforms that climb upward
        fill(36, 10, 39, 10, TILE.PLATFORM);
        fill(42, 8,  45, 8,  TILE.PLATFORM);
        fill(48, 6,  51, 6,  TILE.PLATFORM);
        fill(54, 4,  57, 4,  TILE.PLATFORM);
        // Reward at the top: laser pickup
        this.pickups.push({ x: 55 * GAME.TILE_SIZE, y: 2 * GAME.TILE_SIZE + 8, type: 'LASER', taken: false });

        // Coolant pit (water tile re-skinned)
        fill(38, 12, 42, 13, TILE.EMPTY);
        fill(38, 13, 42, 13, TILE.WATER);

        // Mid plateau with cover
        fill(60, 8, 67, 11, TILE.SOLID);
        cover(63);
        ladder(59, 8, 11);

        // Suspended catwalk over a void
        fill(70, 6, 74, 6, TILE.PLATFORM);
        fill(76, 6, 80, 6, TILE.PLATFORM);
        // Drop the floor for a hazard pit
        fill(70, 12, 80, 13, TILE.EMPTY);
        fill(70, 13, 80, 13, TILE.WATER);
        // Single landing platform mid-pit
        fill(75, 10, 75, 10, TILE.PLATFORM);

        // Approach to boss
        fill(82, 12, 84, 13, TILE.SOLID);

        // ===== Section 3: BOSS ARENA (86-110) =====
        fill(86, 9, 86, 11, TILE.SOLID);                  // gate
        fill(106, 3, 106, 11, TILE.SOLID);                // back wall
        // Arena pillars
        fill(91, 9, 91, 11, TILE.SOLID);
        fill(102, 9, 102, 11, TILE.SOLID);
        cover(90);
        // Reward right before the boss
        this.pickups.push({ x: 87 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'STAPLE_REMOVER', taken: false });

        // Exit corridor
        fill(107, 9, 109, 11, TILE.EMPTY);

        // Enemy spawn points
        this.spawnPoints = [
            // Section 1
            { x: 9  * 16, y: 8  * 16, type: 'HIGHLIGHTER' },
            { x: 15 * 16, y: 6  * 16, type: 'FILE_FOLDER' },
            { x: 24 * 16, y: 4  * 16, type: 'HIGHLIGHTER' },
            { x: 30 * 16, y: 4  * 16, type: 'STAPLER' },
            // Section 2
            { x: 38 * 16, y: 9  * 16, type: 'SWIVEL_CHAIR' },
            { x: 44 * 16, y: 7  * 16, type: 'HIGHLIGHTER' },
            { x: 50 * 16, y: 5  * 16, type: 'STAPLER' },
            { x: 56 * 16, y: 3  * 16, type: 'HIGHLIGHTER' },
            { x: 62 * 16, y: 7  * 16, type: 'TAPE_DISPENSER' },
            { x: 65 * 16, y: 7  * 16, type: 'SWIVEL_CHAIR' },
            { x: 72 * 16, y: 5  * 16, type: 'STAPLER' },
            { x: 78 * 16, y: 5  * 16, type: 'STAPLER' },
            { x: 80 * 16, y: 4  * 16, type: 'HIGHLIGHTER' },
            { x: 84 * 16, y: 11 * 16, type: 'RUBBER_BAND_BALL' },
            // Section 3: boss arena
            { x: 95 * 16, y: 7  * 16, type: 'SHREDDER' }
        ];
    }

    // ---- Stage 4: EXECUTIVE BOARDROOM ----
    loadStage4() {
        this.theme = 'boardroom';
        this.width = 110;
        this.height = 14;
        this.bossArenaX = 88 * GAME.TILE_SIZE;
        this.endX = 109 * GAME.TILE_SIZE;
        this.coverSpots = [];
        this.ladders = [];
        this.pickups = [];
        this.checkpoints = [
            { x: 50,             y: 160 },
            { x: 32 * 16,        y: 160 },
            { x: 60 * 16,        y: 7 * 16 },
            { x: 86 * 16,        y: 160 }
        ];

        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = new Array(this.width).fill(TILE.EMPTY);
        }
        const fill = (x1, y1, x2, y2, t) => {
            for (let y = y1; y <= y2; y++)
                for (let x = x1; x <= x2; x++)
                    if (y >= 0 && y < this.height && x >= 0 && x < this.width)
                        this.tiles[y][x] = t;
        };
        const ladder = (x, y1, y2) => {
            for (let y = y1; y <= y2; y++) {
                this.tiles[y][x] = TILE.LADDER;
                this.ladders.push({ x: x * GAME.TILE_SIZE, y: y * GAME.TILE_SIZE });
            }
        };
        const cover = (x) => {
            this.tiles[10][x] = TILE.COVER_SPOT;
            this.tiles[11][x] = TILE.COVER_SPOT;
            this.coverSpots.push({ x: x * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });
        };

        // Marble floor
        fill(0, 12, this.width - 1, 13, TILE.SOLID);

        // ===== Section 1: ANTECHAMBER (0-30) =====
        // Stepping podiums
        fill(6, 10, 8, 10, TILE.PLATFORM);
        fill(12, 8, 15, 8, TILE.PLATFORM);
        fill(19, 6, 22, 6, TILE.PLATFORM);

        // Executive ladder
        ladder(26, 6, 11);
        fill(26, 5, 30, 5, TILE.SOLID);
        cover(28);

        // ===== Section 2: GLASS HALLWAY (30-65) =====
        // Long open span with three high platforms - aerial threats
        fill(34, 10, 36, 10, TILE.PLATFORM);
        fill(40, 8,  43, 8,  TILE.PLATFORM);
        fill(47, 6,  50, 6,  TILE.PLATFORM);
        // Marble pedestal w/ pickup
        fill(54, 8, 56, 8, TILE.SOLID);
        this.pickups.push({ x: 55 * GAME.TILE_SIZE, y: 6 * GAME.TILE_SIZE + 8, type: 'LASER', taken: false });

        // Glass-floor coffee-spill hazard (water)
        fill(38, 12, 42, 13, TILE.EMPTY);
        fill(38, 13, 42, 13, TILE.WATER);

        // ===== Section 3: WALL-JUMP ELEVATOR SHAFT (60-78) =====
        fill(60, 4, 60, 11, TILE.SOLID);
        fill(64, 4, 64, 11, TILE.SOLID);
        fill(61, 3, 63, 3, TILE.SOLID);   // top landing
        this.pickups.push({ x: 62 * GAME.TILE_SIZE, y: 1 * GAME.TILE_SIZE + 8, type: 'STAPLE_REMOVER', taken: false });

        // ===== Section 4: APPROACH (66-88) =====
        // Tiered floor leading to the boss arena
        fill(70, 11, 74, 11, TILE.SOLID);
        fill(77, 9, 81, 9, TILE.SOLID);
        cover(75);
        fill(83, 12, 85, 13, TILE.SOLID);

        // ===== Section 5: BOSS ARENA (88-110) =====
        fill(88, 9, 88, 11, TILE.SOLID);                // entrance gate
        fill(106, 3, 106, 11, TILE.SOLID);              // back wall
        // Symmetric pillars for cover
        fill(94, 9, 94, 11, TILE.SOLID);
        fill(102, 9, 102, 11, TILE.SOLID);
        cover(93);
        this.pickups.push({ x: 89 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'FLAME', taken: false });
        // Exit
        fill(107, 9, 109, 11, TILE.EMPTY);

        this.spawnPoints = [
            // Section 1
            { x: 10 * 16, y: 11 * 16, type: 'STAPLER' },
            { x: 18 * 16, y: 6  * 16, type: 'FILE_FOLDER' },
            { x: 24 * 16, y: 4  * 16, type: 'HIGHLIGHTER' },
            // Section 2
            { x: 36 * 16, y: 9  * 16, type: 'STAPLER' },
            { x: 44 * 16, y: 7  * 16, type: 'HIGHLIGHTER' },
            { x: 50 * 16, y: 5  * 16, type: 'FILE_FOLDER' },
            { x: 56 * 16, y: 7  * 16, type: 'STAPLER' },
            // Section 3 wall-jump area
            { x: 58 * 16, y: 4  * 16, type: 'HIGHLIGHTER' },
            { x: 65 * 16, y: 5  * 16, type: 'HIGHLIGHTER' },
            // Section 4
            { x: 72 * 16, y: 10 * 16, type: 'SWIVEL_CHAIR' },
            { x: 79 * 16, y: 8  * 16, type: 'TAPE_DISPENSER' },
            { x: 84 * 16, y: 11 * 16, type: 'RUBBER_BAND_BALL' },
            { x: 87 * 16, y: 11 * 16, type: 'SWIVEL_CHAIR' },
            // Section 5: final boss
            { x: 98 * 16, y: 6  * 16, type: 'CTRL_ALT_DEL' }
        ];
    }

    // ---- Stage 5: THE KEYNOTE - Final boss BALLMER on the developer stage ----
    loadStage5() {
        this.theme = 'keynote';
        this.width = 60;
        this.height = 14;
        this.bossArenaX = 14 * GAME.TILE_SIZE;     // boss arena starts almost immediately
        this.endX = 59 * GAME.TILE_SIZE;
        this.coverSpots = [];
        this.ladders = [];
        this.pickups = [];
        this.checkpoints = [
            { x: 50, y: 160 }     // single checkpoint at the stage entrance
        ];

        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = new Array(this.width).fill(TILE.EMPTY);
        }
        const fill = (x1, y1, x2, y2, t) => {
            for (let y = y1; y <= y2; y++)
                for (let x = x1; x <= x2; x++)
                    if (y >= 0 && y < this.height && x >= 0 && x < this.width)
                        this.tiles[y][x] = t;
        };
        const cover = (x) => {
            this.tiles[10][x] = TILE.COVER_SPOT;
            this.tiles[11][x] = TILE.COVER_SPOT;
            this.coverSpots.push({ x: x * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });
        };

        // Stage floor
        fill(0, 12, this.width - 1, 13, TILE.SOLID);

        // ===== Short entrance: a few speaker monitors to jump =====
        fill(4, 11, 5, 11, TILE.PLATFORM);
        fill(8, 10, 10, 10, TILE.PLATFORM);

        // ===== Boss arena (14-58) - one big open stage =====
        // Two speaker-monitor platforms scattered for verticality
        fill(20, 9, 22, 9, TILE.PLATFORM);
        fill(36, 9, 38, 9, TILE.PLATFORM);
        fill(50, 9, 52, 9, TILE.PLATFORM);
        // Cover spot mid-stage (a teleprompter)
        cover(28);
        cover(44);

        // No exit door until Ballmer is dead - the player runs off the right edge
        // after the boss arena finishes. Just a clean stage floor leads out.

        // Reward pickups within the arena
        this.pickups.push({ x: 12 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'LASER', taken: false });
        this.pickups.push({ x: 46 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'STAPLE_REMOVER', taken: false });

        // Single boss spawn - centered
        this.spawnPoints = [
            { x: 30 * 16, y: 8 * 16, type: 'BALLMER' }
        ];
    }

    // ---- Stage 6: THE FOUNDER - True final boss BILL GATES ----
    loadStage6() {
        this.theme = 'founder';
        this.width = 50;
        this.height = 14;
        this.bossArenaX = 12 * GAME.TILE_SIZE;
        this.endX = 49 * GAME.TILE_SIZE;
        this.coverSpots = [];
        this.ladders = [];
        this.pickups = [];
        this.checkpoints = [{ x: 50, y: 160 }];

        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = new Array(this.width).fill(TILE.EMPTY);
        }
        const fill = (x1, y1, x2, y2, t) => {
            for (let y = y1; y <= y2; y++)
                for (let x = x1; x <= x2; x++)
                    if (y >= 0 && y < this.height && x >= 0 && x < this.width)
                        this.tiles[y][x] = t;
        };
        const cover = (x) => {
            this.tiles[10][x] = TILE.COVER_SPOT;
            this.tiles[11][x] = TILE.COVER_SPOT;
            this.coverSpots.push({ x: x * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });
        };

        // Floor
        fill(0, 12, this.width - 1, 13, TILE.SOLID);

        // Floating data slabs across the arena
        fill(6,  10, 8,  10, TILE.PLATFORM);
        fill(14, 9,  16, 9,  TILE.PLATFORM);
        fill(22, 7,  26, 7,  TILE.PLATFORM);    // higher one for vertical mixup
        fill(32, 9,  34, 9,  TILE.PLATFORM);
        fill(40, 10, 42, 10, TILE.PLATFORM);
        // Mid-arena cover
        cover(20);
        cover(36);

        // Reward pickups
        this.pickups.push({ x: 10 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'LASER',          taken: false });
        this.pickups.push({ x: 24 * GAME.TILE_SIZE, y: 5  * GAME.TILE_SIZE, type: 'STAPLE_REMOVER', taken: false });
        this.pickups.push({ x: 44 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'FLAME',          taken: false });

        this.spawnPoints = [
            { x: 28 * 16, y: 8 * 16, type: 'BILL_GATES' }
        ];
    }

    // ---- Boss Rush: three arenas in a row, fight all three bosses ----
    loadBossRush() {
        this.theme = 'serverroom';
        this.width = 80;
        this.height = 14;
        this.bossArenaX = 12 * GAME.TILE_SIZE;      // boss intro fires at arena 1
        this.endX = 79 * GAME.TILE_SIZE;
        this.coverSpots = [];
        this.ladders = [];
        this.pickups = [];

        this.tiles = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = new Array(this.width).fill(TILE.EMPTY);
        }
        const fill = (x1, y1, x2, y2, t) => {
            for (let y = y1; y <= y2; y++)
                for (let x = x1; x <= x2; x++)
                    if (y >= 0 && y < this.height && x >= 0 && x < this.width)
                        this.tiles[y][x] = t;
        };
        const cover = (x) => {
            this.tiles[10][x] = TILE.COVER_SPOT;
            this.tiles[11][x] = TILE.COVER_SPOT;
            this.coverSpots.push({ x: x * GAME.TILE_SIZE, y: 10 * GAME.TILE_SIZE });
        };

        // Floor
        fill(0, 12, this.width - 1, 13, TILE.SOLID);
        // Dividing walls between arenas at x=24 and x=52
        fill(24, 3, 24, 11, TILE.SOLID);
        fill(52, 3, 52, 11, TILE.SOLID);
        // Walls have a doorway one tile high near the floor
        this.tiles[11][24] = TILE.EMPTY;
        this.tiles[11][52] = TILE.EMPTY;
        // Cover in each arena
        cover(10);
        cover(38);
        cover(66);
        // Reward pickups between arenas - laser/staple remover
        this.pickups.push({ x: 27 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'LASER',          taken: false });
        this.pickups.push({ x: 55 * GAME.TILE_SIZE, y: 11 * GAME.TILE_SIZE, type: 'STAPLE_REMOVER', taken: false });

        // One boss in each arena
        this.spawnPoints = [
            { x: 16 * 16, y: 8 * 16, type: 'FILE_CABINET' },
            { x: 44 * 16, y: 8 * 16, type: 'PHOTOCOPIER' },
            { x: 72 * 16, y: 8 * 16, type: 'SHREDDER' }
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

        if (this.theme === 'breakroom') {
            if (isSurface) {
                this.drawLinoleumTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            } else {
                this.drawCarpetTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            }
            return;
        }
        if (this.theme === 'serverroom') {
            if (isSurface) {
                this.drawGratingTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            } else {
                this.drawCableTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            }
            return;
        }
        if (this.theme === 'boardroom') {
            if (isSurface) {
                this.drawMarbleTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            } else {
                this.drawHardwoodTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            }
            return;
        }
        if (this.theme === 'keynote') {
            if (isSurface) {
                this.drawStageFloorTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            } else {
                this.drawStageUnderTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            }
            return;
        }
        if (this.theme === 'founder') {
            if (isSurface) {
                this.drawNeonFloorTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            } else {
                this.drawVoidTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
            }
            return;
        }
        if (isSurface) {
            this.drawGrassTopTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
        } else {
            this.drawDirtTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge);
        }
    }

    // Linoleum floor tile (theme: breakroom). White/gray tiles with grout lines.
    drawLinoleumTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        // Alternate light/dark squares like a checkerboard
        const alt = ((tileX + tileY) & 1) === 0;
        const TILE_LIT  = alt ? '#e8e0d0' : '#d0c8b8';
        const TILE_MID  = alt ? '#c8c0b0' : '#b0a898';
        const TILE_DARK = '#807868';
        const TILE_SHAD = '#403828';

        // Body
        ctx.fillStyle = TILE_MID;
        ctx.fillRect(x, y, 16, 16);
        // Highlight band along the top
        ctx.fillStyle = TILE_LIT;
        ctx.fillRect(x, y, 16, 2);
        // Subtle pock-mark texture
        for (let py = 3; py < 14; py++) {
            for (let px = 0; px < 16; px++) {
                let n = (tileX * 91 + tileY * 53 + px * 13 + py * 7) & 0xff;
                if (n < 12) { ctx.fillStyle = TILE_LIT; ctx.fillRect(x + px, y + py, 1, 1); }
                else if (n > 240) { ctx.fillStyle = TILE_SHAD; ctx.fillRect(x + px, y + py, 1, 1); }
            }
        }
        // Grout lines along the tile edges
        ctx.fillStyle = TILE_DARK;
        ctx.fillRect(x, y + 15, 16, 1);
        ctx.fillRect(x + 15, y, 1, 16);
        // Surface bevel
        ctx.fillStyle = TILE_LIT;
        ctx.fillRect(x, y, 1, 15);
    }

    // Beneath-floor carpet tile (theme: breakroom).
    drawCarpetTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        const BG  = '#3a2a18';
        const MID = '#5a4030';
        const LIT = '#7a5840';
        const DARK = '#1a0e08';

        ctx.fillStyle = BG;
        ctx.fillRect(x, y, 16, 16);
        // Berber carpet looped texture
        for (let py = 0; py < 16; py++) {
            for (let px = 0; px < 16; px++) {
                let n = (tileX * 71 + tileY * 41 + px * 17 + py * 23) & 0xff;
                if (n < 40) { ctx.fillStyle = DARK; ctx.fillRect(x + px, y + py, 1, 1); }
                else if (n < 90) { ctx.fillStyle = MID; ctx.fillRect(x + px, y + py, 1, 1); }
                else if (n > 220) { ctx.fillStyle = LIT; ctx.fillRect(x + px, y + py, 1, 1); }
            }
        }
        // Edge lines
        if (leftEdge)  { ctx.fillStyle = DARK; ctx.fillRect(x,     y, 1, 16); }
        if (rightEdge) { ctx.fillStyle = DARK; ctx.fillRect(x + 15, y, 1, 16); }
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

    // Metal floor grating (Stage 3)
    drawGratingTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        const DARK = '#0a0a14';
        const MID  = '#2a2a3a';
        const LIT  = '#5a5a7a';
        const SPEC = '#a0a0c0';
        // Body
        ctx.fillStyle = MID;
        ctx.fillRect(x, y, 16, 16);
        // Cross-hatch grating
        ctx.fillStyle = DARK;
        for (let i = 0; i < 16; i += 4) {
            ctx.fillRect(x + i, y, 1, 16);
            ctx.fillRect(x, y + i, 16, 1);
        }
        // Highlights at grating intersections
        ctx.fillStyle = LIT;
        for (let i = 1; i < 16; i += 4) {
            ctx.fillRect(x + i, y, 1, 1);
            ctx.fillRect(x, y + i, 1, 1);
        }
        // Top spec highlight
        ctx.fillStyle = SPEC;
        ctx.fillRect(x, y, 16, 1);
        // Bottom shadow
        ctx.fillStyle = DARK;
        ctx.fillRect(x, y + 15, 16, 1);
    }

    // Marble floor tile with gold-veined surface (Stage 4)
    drawMarbleTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        const ALT  = ((tileX + tileY) & 1) === 0;
        const BASE = ALT ? '#e8e0d0' : '#d8cabc';
        const LIT  = ALT ? '#fff8e8' : '#f0e2d0';
        const SHAD = ALT ? '#a8987a' : '#988868';
        const GOLD = '#ffd460';
        const SEAM = '#3a2410';

        // Body
        ctx.fillStyle = BASE;
        ctx.fillRect(x, y, 16, 16);
        // Top bevel
        ctx.fillStyle = LIT;
        ctx.fillRect(x, y, 16, 2);
        // Bottom shadow
        ctx.fillStyle = SHAD;
        ctx.fillRect(x, y + 14, 16, 2);
        // Diagonal vein - deterministic per tile so it tiles smoothly
        const veinSeed = (tileX * 73 + tileY * 41) & 0xff;
        if (veinSeed < 70) {
            ctx.fillStyle = SHAD;
            for (let i = 0; i < 14; i++) {
                const vx = x + 2 + i;
                const vy = y + 4 + Math.floor(Math.sin(i * 0.5 + veinSeed) * 3) + 3;
                ctx.fillRect(vx, vy, 1, 1);
            }
        } else if (veinSeed > 200) {
            ctx.fillStyle = GOLD;
            for (let i = 0; i < 10; i++) {
                const vx = x + 3 + i;
                const vy = y + 6 + Math.floor(Math.cos(i * 0.7 + veinSeed) * 2) + 2;
                ctx.fillRect(vx, vy, 1, 1);
            }
        }
        // Grout seams
        ctx.fillStyle = SEAM;
        ctx.fillRect(x, y + 15, 16, 1);
        ctx.fillRect(x + 15, y, 1, 16);
    }

    // Polished hardwood under the marble (Stage 4)
    drawHardwoodTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        const BG   = '#3a1f10';
        const MID  = '#5a2f1a';
        const LIT  = '#806848';
        const DARK = '#1a0e08';
        const GOLD = '#a8780a';

        ctx.fillStyle = BG;
        ctx.fillRect(x, y, 16, 16);
        // Plank grain
        for (let py = 0; py < 16; py++) {
            for (let px = 0; px < 16; px++) {
                let n = (tileX * 31 + tileY * 17 + px * 11 + py * 5) & 0xff;
                if (n < 70) { ctx.fillStyle = MID; ctx.fillRect(x + px, y + py, 1, 1); }
                else if (n > 220) { ctx.fillStyle = LIT; ctx.fillRect(x + px, y + py, 1, 1); }
            }
        }
        // Plank seam lines
        ctx.fillStyle = DARK;
        if ((tileX + tileY) & 1) ctx.fillRect(x, y + 8, 16, 1);
        // Edge gold trim
        if (leftEdge)  { ctx.fillStyle = GOLD; ctx.fillRect(x,     y, 1, 16); }
        if (rightEdge) { ctx.fillStyle = GOLD; ctx.fillRect(x + 15, y, 1, 16); }
    }

    // Neon-grid surface tile (Stage 6 founder lair) - dark with green grid
    drawNeonFloorTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        // Body
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(x, y, 16, 16);
        // Glowing green grid lines
        ctx.fillStyle = '#208a30';
        ctx.fillRect(x, y, 16, 1);
        ctx.fillStyle = '#50ff70';
        ctx.fillRect(x, y, 16, 1);
        ctx.fillStyle = '#0a3a14';
        ctx.fillRect(x, y + 15, 16, 1);
        // Vertical seam every other tile, alternating bright
        ctx.fillStyle = '#1a4a18';
        ctx.fillRect(x + 15, y, 1, 16);
        if ((tileX & 1) === 0) {
            ctx.fillStyle = '#50ff70';
            ctx.fillRect(x + 15, y, 1, 2);
        }
        // Subtle dust speck noise
        for (let py = 2; py < 15; py++) {
            for (let px = 0; px < 16; px++) {
                const n = (tileX * 31 + tileY * 17 + px * 5 + py * 11) & 0xff;
                if (n < 8) { ctx.fillStyle = '#1a4a18'; ctx.fillRect(x + px, y + py, 1, 1); }
            }
        }
    }

    // Void tile - pure black with faint circuit traces (Stage 6 below floor)
    drawVoidTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, 16, 16);
        // Sparse circuit lines
        ctx.fillStyle = '#0a3a14';
        const seed = (tileX * 71 + tileY * 41) & 0xff;
        if (seed < 90) {
            ctx.fillRect(x + 1, y + 5, 6, 1);
            ctx.fillRect(x + 6, y + 5, 1, 5);
            ctx.fillStyle = '#50ff70';
            ctx.fillRect(x + 7, y + 9, 1, 1);
        } else if (seed < 160) {
            ctx.fillRect(x + 10, y + 2, 1, 8);
            ctx.fillRect(x + 10, y + 9, 5, 1);
        }
    }

    // Stage floor tile (Stage 5 keynote): glossy wood planks under spotlight
    drawStageFloorTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        const DARK   = '#1a0808';
        const BASE   = '#3a1f10';
        const MID    = '#5a2f1a';
        const LIT    = '#806848';
        const SHINE  = '#c0a070';
        // Body
        ctx.fillStyle = BASE;
        ctx.fillRect(x, y, 16, 16);
        // Plank grain noise
        for (let py = 1; py < 15; py++) {
            for (let px = 0; px < 16; px++) {
                const n = (tileX * 31 + tileY * 17 + px * 11 + py * 5) & 0xff;
                if (n < 60) { ctx.fillStyle = DARK; ctx.fillRect(x + px, y + py, 1, 1); }
                else if (n > 220) { ctx.fillStyle = MID; ctx.fillRect(x + px, y + py, 1, 1); }
            }
        }
        // Polished top reflection band
        ctx.fillStyle = LIT;
        ctx.fillRect(x, y, 16, 1);
        ctx.fillStyle = SHINE;
        for (let px = 0; px < 16; px += 3) {
            ctx.fillRect(x + px, y + 1, 1, 1);
        }
        // Plank seam
        ctx.fillStyle = DARK;
        if ((tileX + tileY) & 1) ctx.fillRect(x, y + 8, 16, 1);
        ctx.fillRect(x, y + 15, 16, 1);
        // Gold trim on edges
        if (leftEdge)  { ctx.fillStyle = '#ffd460'; ctx.fillRect(x,      y, 1, 16); }
        if (rightEdge) { ctx.fillStyle = '#ffd460'; ctx.fillRect(x + 15, y, 1, 16); }
    }

    // Under-the-stage substrate - dark wooden truss
    drawStageUnderTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(x, y, 16, 16);
        // Bracing X-truss pattern
        ctx.fillStyle = '#3a1f10';
        for (let i = 0; i < 16; i++) {
            ctx.fillRect(x + i, y + i, 1, 1);
            ctx.fillRect(x + (15 - i), y + i, 1, 1);
        }
        // Bolt
        const seed = (tileX * 41 + tileY * 19) & 0xff;
        if (seed < 80) {
            ctx.fillStyle = '#806848';
            ctx.fillRect(x + (seed % 13) + 1, y + ((seed >> 3) % 13) + 1, 2, 2);
            ctx.fillStyle = '#ffd460';
            ctx.fillRect(x + (seed % 13) + 1, y + ((seed >> 3) % 13) + 1, 1, 1);
        }
        if (leftEdge)  { ctx.fillStyle = '#0a0612'; ctx.fillRect(x,      y, 1, 16); }
        if (rightEdge) { ctx.fillStyle = '#0a0612'; ctx.fillRect(x + 15, y, 1, 16); }
    }

    // Cable channel underneath the grating (Stage 3)
    drawCableTile(ctx, x, y, tileX, tileY, leftEdge, rightEdge) {
        const BG  = '#0a0a16';
        const RED = '#a82020';
        const BLU = '#2050a0';
        const YEL = '#ffaa20';
        const SPK = '#80c0ff';

        ctx.fillStyle = BG;
        ctx.fillRect(x, y, 16, 16);
        // Several colored cables snaking horizontally
        const cables = [{ c: RED, y: 3 }, { c: BLU, y: 7 }, { c: YEL, y: 11 }, { c: BLU, y: 14 }];
        for (const cable of cables) {
            const wave = ((tileX + tileY) & 1) ? 0 : 1;
            ctx.fillStyle = cable.c;
            ctx.fillRect(x, y + cable.y + wave, 16, 2);
            // Cable highlight
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(x, y + cable.y + wave, 16, 1);
        }
        // Occasional data spark
        const seed = (tileX * 37 + tileY * 41 + Math.floor(Date.now() / 200)) & 31;
        if (seed === 0) {
            ctx.fillStyle = SPK;
            ctx.fillRect(x + ((tileX * 7) % 14) + 1, y + ((tileY * 11) % 12) + 2, 1, 1);
        }
        // Edge outlines
        if (leftEdge)  { ctx.fillStyle = '#000'; ctx.fillRect(x,     y, 1, 16); }
        if (rightEdge) { ctx.fillStyle = '#000'; ctx.fillRect(x + 15, y, 1, 16); }
    }

    // SNES-style wooden platform: bright top, grain, drop shadow
    drawPlatformTile(ctx, x, y) {
        if (this.theme === 'breakroom') return this.drawShelfPlatformTile(ctx, x, y);
        if (this.theme === 'serverroom') return this.drawServerShelfTile(ctx, x, y);
        if (this.theme === 'boardroom') return this.drawMarblePlatformTile(ctx, x, y);
        if (this.theme === 'keynote') return this.drawStagePlatformTile(ctx, x, y);
        if (this.theme === 'founder') return this.drawNeonPlatformTile(ctx, x, y);
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

    // Floating neon-edge data slab (Stage 6 founder lair)
    drawNeonPlatformTile(ctx, x, y) {
        // Dark slab body
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(x, y, 16, 6);
        // Neon green top edge
        ctx.fillStyle = '#50ff70';
        ctx.fillRect(x, y, 16, 1);
        ctx.fillStyle = '#208a30';
        ctx.fillRect(x, y + 1, 16, 1);
        // Inner glow
        ctx.fillStyle = '#1a3a18';
        ctx.fillRect(x + 1, y + 2, 14, 2);
        // Bottom edge dim
        ctx.fillStyle = '#0a3a14';
        ctx.fillRect(x, y + 5, 16, 1);
        // Side neon studs
        ctx.fillStyle = '#50ff70';
        ctx.fillRect(x, y + 3, 1, 1);
        ctx.fillRect(x + 15, y + 3, 1, 1);
        // Subtle drop shadow
        ctx.fillStyle = 'rgba(80,255,112,0.15)';
        ctx.fillRect(x, y + 6, 16, 2);
    }

    // Speaker monitor / equipment crate platform (Stage 5 keynote)
    drawStagePlatformTile(ctx, x, y) {
        // Black equipment crate with gold corner braces
        ctx.fillStyle = '#1a1140';
        ctx.fillRect(x, y, 16, 6);
        ctx.fillStyle = '#3a2855';
        ctx.fillRect(x, y, 16, 1);
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(x, y + 5, 16, 1);
        // Vent slats
        ctx.fillStyle = '#5a4068';
        ctx.fillRect(x + 3, y + 2, 10, 1);
        ctx.fillRect(x + 3, y + 4, 10, 1);
        // Corner braces (gold)
        ctx.fillStyle = '#ffd460';
        ctx.fillRect(x,      y, 2, 2);
        ctx.fillRect(x + 14, y, 2, 2);
        ctx.fillStyle = '#a8780a';
        ctx.fillRect(x + 1, y + 1, 1, 1);
        ctx.fillRect(x + 14, y + 1, 1, 1);
        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y + 6, 16, 2);
    }

    // Marble pedestal platform (Stage 4 boardroom)
    drawMarblePlatformTile(ctx, x, y) {
        const LIT  = '#fff8e8';
        const TOP  = '#e8e0d0';
        const MID  = '#a8987a';
        const GOLD = '#ffd460';
        const DARK = '#3a2410';

        // Slab body
        ctx.fillStyle = TOP;
        ctx.fillRect(x, y, 16, 5);
        // Top bevel
        ctx.fillStyle = LIT;
        ctx.fillRect(x, y, 16, 1);
        // Bottom shadow
        ctx.fillStyle = MID;
        ctx.fillRect(x, y + 4, 16, 1);
        // Gold trim line under
        ctx.fillStyle = GOLD;
        ctx.fillRect(x, y + 5, 16, 1);
        ctx.fillStyle = DARK;
        ctx.fillRect(x, y + 6, 16, 1);
        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x, y + 7, 16, 2);
    }

    // Server rack shelf platform (Stage 3)
    drawServerShelfTile(ctx, x, y) {
        const DARK   = '#0a0a18';
        const METAL  = '#202840';
        const METALH = '#3a4060';
        const LED_G  = '#50ff70';
        const LED_R  = '#ff3030';
        const LED_OFF = '#0a2010';

        // Body
        ctx.fillStyle = METAL;
        ctx.fillRect(x, y, 16, 6);
        ctx.fillStyle = METALH;
        ctx.fillRect(x, y, 16, 1);
        ctx.fillStyle = DARK;
        ctx.fillRect(x, y + 5, 16, 1);
        // LED row
        const t = Math.floor(Date.now() / 120);
        for (let i = 0; i < 6; i++) {
            const lx = x + 2 + i * 2;
            const lit = (t + i * 3) & 1;
            const isRed = (i === 2 || i === 4);
            ctx.fillStyle = lit ? (isRed ? LED_R : LED_G) : LED_OFF;
            ctx.fillRect(lx, y + 2, 1, 2);
        }
        // Heatsink fin lines
        ctx.fillStyle = METALH;
        ctx.fillRect(x + 14, y + 1, 1, 4);
        ctx.fillStyle = DARK;
        // Bottom drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x, y + 6, 16, 2);
    }

    // File-shelf platform for the break room theme
    drawShelfPlatformTile(ctx, x, y) {
        const TOP_LIT = '#a890c8';
        const TOP     = '#6a5090';
        const SHELF   = '#3a2855';
        const TRIM    = '#1a1140';
        const PAPER   = '#d8c890';

        // Shelf body
        ctx.fillStyle = SHELF;
        ctx.fillRect(x, y, 16, 6);
        // Top trim (bright)
        ctx.fillStyle = TOP_LIT;
        ctx.fillRect(x, y, 16, 1);
        ctx.fillStyle = TOP;
        ctx.fillRect(x, y + 1, 16, 1);
        // Stacked binders / papers along the top
        ctx.fillStyle = '#a82020';
        ctx.fillRect(x + 1, y + 2, 3, 3);
        ctx.fillStyle = '#1a508a';
        ctx.fillRect(x + 5, y + 2, 3, 3);
        ctx.fillStyle = '#208a30';
        ctx.fillRect(x + 9, y + 2, 3, 3);
        ctx.fillStyle = PAPER;
        ctx.fillRect(x + 13, y + 2, 2, 3);
        // Binder highlights
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(x + 1, y + 2, 1, 1);
        ctx.fillRect(x + 5, y + 2, 1, 1);
        ctx.fillRect(x + 9, y + 2, 1, 1);
        // Bottom trim
        ctx.fillStyle = TRIM;
        ctx.fillRect(x, y + 5, 16, 1);
        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x, y + 6, 16, 2);
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

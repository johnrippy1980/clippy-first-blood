// ============================================
// SPRITE SYSTEM - Image-Based Loading
// Load PNG sprite sheets for authentic SNES look
// ============================================

class SpriteAtlas {
    constructor() {
        this.sheets = new Map();      // Map of sheet name -> Image
        this.frames = new Map();      // Map of frame name -> { sheet, x, y, w, h }
        this.loaded = false;
        this.onLoadCallbacks = [];
    }

    // Load a sprite sheet image with JSON metadata
    async loadSheet(name, imagePath, jsonPath = null) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = async () => {
                this.sheets.set(name, img);

                // If JSON metadata provided, load frame definitions
                if (jsonPath) {
                    try {
                        const response = await fetch(jsonPath);
                        const meta = await response.json();
                        this.parseMetadata(name, meta);
                    } catch (e) {
                        console.warn(`No JSON metadata for ${name}, using defaults`);
                    }
                }

                console.log(`Loaded sprite sheet: ${name} (${img.width}x${img.height})`);
                resolve(img);
            };
            img.onerror = () => reject(`Failed to load: ${imagePath}`);
            img.src = imagePath;
        });
    }

    // Parse JSON metadata for frame positions
    parseMetadata(sheetName, meta) {
        if (meta.frames) {
            for (const [frameName, frameData] of Object.entries(meta.frames)) {
                this.frames.set(frameName, {
                    sheet: sheetName,
                    x: frameData.x,
                    y: frameData.y,
                    w: frameData.w || meta.frameWidth,
                    h: frameData.h || meta.frameHeight
                });
            }
        }
    }

    // Define frames manually (grid-based layout)
    defineFrames(sheetName, frameWidth, frameHeight, frameNames) {
        const sheet = this.sheets.get(sheetName);
        if (!sheet) return;

        const cols = Math.floor(sheet.width / frameWidth);

        frameNames.forEach((name, index) => {
            if (name) {
                const col = index % cols;
                const row = Math.floor(index / cols);
                this.frames.set(name, {
                    sheet: sheetName,
                    x: col * frameWidth,
                    y: row * frameHeight,
                    w: frameWidth,
                    h: frameHeight
                });
            }
        });
    }

    // Get a frame by name
    getFrame(frameName) {
        return this.frames.get(frameName);
    }

    // Draw a frame to canvas
    drawFrame(ctx, frameName, x, y, flipH = false, scale = 1) {
        const frame = this.frames.get(frameName);
        if (!frame) {
            // Fallback: draw placeholder
            this.drawPlaceholder(ctx, x, y, 48, 48);
            return;
        }

        ctx.save();

        // Disable smoothing for crisp pixels
        ctx.imageSmoothingEnabled = false;

        // Handle individual sprite images (no sheet)
        if (frame.image) {
            const img = frame.image;
            if (flipH) {
                ctx.translate(x + img.width * scale, y);
                ctx.scale(-1, 1);
                x = 0;
                y = 0;
            }
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            ctx.restore();
            return;
        }

        // Handle sprite sheet frames
        const sheet = this.sheets.get(frame.sheet);
        if (!sheet) {
            ctx.restore();
            return;
        }

        if (flipH) {
            ctx.translate(x + frame.w * scale, y);
            ctx.scale(-1, 1);
            x = 0;
            y = 0;
        }

        ctx.drawImage(
            sheet,
            frame.x, frame.y, frame.w, frame.h,
            x, y, frame.w * scale, frame.h * scale
        );

        ctx.restore();
    }

    // Draw sheet region directly (for fallback)
    drawRegion(ctx, sheetName, sx, sy, sw, sh, dx, dy, dw, dh, flipH = false) {
        const sheet = this.sheets.get(sheetName);
        if (!sheet) return;

        ctx.save();
        ctx.imageSmoothingEnabled = false;

        if (flipH) {
            ctx.translate(dx + dw, dy);
            ctx.scale(-1, 1);
            dx = 0;
            dy = 0;
        }

        ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.restore();
    }

    // Placeholder for missing sprites
    drawPlaceholder(ctx, x, y, w, h) {
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.fillStyle = '#ff00ff';
        ctx.font = '8px monospace';
        ctx.fillText('?', x + w/2 - 3, y + h/2 + 3);
    }

    // Wait for all sheets to load
    onLoad(callback) {
        if (this.loaded) {
            callback();
        } else {
            this.onLoadCallbacks.push(callback);
        }
    }

    // Mark loading complete
    finishLoading() {
        this.loaded = true;
        this.onLoadCallbacks.forEach(cb => cb());
        this.onLoadCallbacks = [];
    }
}

// Global sprite atlas
const spriteAtlas = new SpriteAtlas();

// Individual sprite images storage
const individualSprites = new Map();

// Load a single sprite image file
function loadIndividualSprite(frameName, imagePath) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            individualSprites.set(frameName, img);
            // Also register in the sprite atlas for compatibility
            spriteAtlas.frames.set(frameName, {
                sheet: null,  // No sheet, individual image
                image: img,
                x: 0,
                y: 0,
                w: img.width,
                h: img.height
            });
            console.log(`Loaded sprite: ${frameName} (${img.width}x${img.height})`);
            resolve(img);
        };
        img.onerror = () => {
            console.warn(`Failed to load sprite: ${imagePath}`);
            reject(`Failed to load: ${imagePath}`);
        };
        img.src = imagePath;
    });
}

// ============================================
// SPRITE LOADER - Initialize all game sprites
// ============================================

async function loadAllSprites() {
    console.log('Loading sprite sheets...');

    // Load individual Clippy sprites (the clean cropped PNGs)
    const clippySprites = {
        'clippy_idle_01': 'stand',
        'clippy_idle_02': 'stand',
        'clippy_run_01': 'run_01',
        'clippy_run_02': 'run_02',
        'clippy_run_03': 'run_03',
        'clippy_jump_01': 'jump',
        'clippy_fall_01': 'jump',
        'clippy_crouch_01': 'crouch_shoot',
        'clippy_prone_01': 'prone',
        'clippy_prone_shoot_01': 'prone_shoot',
        'clippy_prone_shoot_heavy_01': 'prone_shoot_heavy',
        'clippy_climb_01': 'stand',
        'clippy_climb_02': 'stand',
        'clippy_cover_01': 'crouch_shoot',
        'clippy_hurt_01': 'death_hit',
        'clippy_shoot_01': 'run_shoot_01',
        'clippy_shoot_02': 'run_shoot_02',
        'clippy_death_01': 'death_hit',
        'clippy_death_02': 'death_explode',
        'clippy_death_03': 'death_burning'
    };

    // Load each individual sprite
    const loadPromises = [];
    for (const [frameName, fileName] of Object.entries(clippySprites)) {
        loadPromises.push(
            loadIndividualSprite(frameName, `images/sprites/clippy/${fileName}.png`)
        );
    }

    try {
        await Promise.all(loadPromises);
        console.log('Loaded individual Clippy sprites');
    } catch (e) {
        console.warn('Could not load all clippy sprites, using procedural fallback');
    }

    // Tile and enemy art is rendered procedurally in level.js / enemies.js
    // (the bundled tile PNGs were unusable - kept on disk for reference only).
    spriteAtlas.finishLoading();
    console.log('Sprite loading complete!');
}

// ============================================
// FALLBACK PROCEDURAL RENDERER
// Used when PNG sprites aren't available yet
// ============================================

class ProceduralSprites {
    constructor() {
        this.cache = new Map();
    }

    // Draw Clippy (fallback)
    drawClippy(ctx, x, y, state, animFrame, facingRight = true) {
        // Check if we have image sprites loaded
        const frameName = this.getClippyFrameName(state, animFrame);
        if (spriteAtlas.frames.has(frameName)) {
            spriteAtlas.drawFrame(ctx, frameName, x, y, !facingRight);
            return;
        }

        // Procedural fallback - simplified pixel art
        const sprite = CLIPPY_SPRITES[this.getClippySpriteKey(state, animFrame)];
        if (sprite) {
            this.drawPixelSprite(ctx, x, y, sprite, CLIPPY_PALETTE, !facingRight);
        }
    }

    getClippyFrameName(state, animFrame) {
        switch (state) {
            case PLAYER_STATE.RUNNING:
                // 3-frame run cycle: 1 -> 2 -> 3 -> 2 -> 1... (ping-pong for smooth motion)
                const runCycle = [1, 2, 3, 2];
                return `clippy_run_0${runCycle[animFrame % 4]}`;
            case PLAYER_STATE.JUMPING:
                return 'clippy_jump_01';
            case PLAYER_STATE.FALLING:
            case PLAYER_STATE.WALL_SLIDING:
                return 'clippy_fall_01';
            case PLAYER_STATE.CROUCHING:
                return 'clippy_crouch_01';
            case PLAYER_STATE.PRONE:
                return 'clippy_prone_01';
            case PLAYER_STATE.CLIMBING:
                return `clippy_climb_0${(animFrame % 2) + 1}`;
            case PLAYER_STATE.COVER:
                return 'clippy_cover_01';
            default:
                return `clippy_idle_0${(animFrame % 2) + 1}`;
        }
    }

    getClippySpriteKey(state, animFrame) {
        switch (state) {
            case PLAYER_STATE.RUNNING:
                return animFrame % 2 === 0 ? 'run1' : 'run2';
            case PLAYER_STATE.JUMPING:
            case PLAYER_STATE.FALLING:
            case PLAYER_STATE.WALL_SLIDING:
                return 'jump';
            case PLAYER_STATE.CROUCHING:
                return 'crouch';
            case PLAYER_STATE.PRONE:
                return 'prone';
            case PLAYER_STATE.CLIMBING:
                return 'climb';
            case PLAYER_STATE.COVER:
                return 'crouch';
            default:
                return 'idle';
        }
    }

    // Draw enemy (with image fallback)
    drawEnemy(ctx, x, y, behavior, animFrame, facingRight = true) {
        let frameName;
        switch (behavior) {
            case 'hop':
                frameName = animFrame % 2 === 0 ? 'stapler_idle' : 'stapler_hop';
                break;
            case 'fly_sine':
                frameName = animFrame % 2 === 0 ? 'folder_fly_01' : 'folder_fly_02';
                break;
            case 'bounce':
                frameName = animFrame % 2 === 0 ? 'rubber_ball_01' : 'rubber_ball_02';
                break;
            case 'stationary':
                frameName = 'tape_dispenser';
                break;
            case 'miniboss':
                frameName = `file_cabinet_0${(animFrame % 3) + 1}`;
                break;
            default:
                frameName = 'stapler_idle';
        }

        if (spriteAtlas.frames.has(frameName)) {
            spriteAtlas.drawFrame(ctx, frameName, x, y, !facingRight);
            return;
        }

        // Procedural fallback
        const spriteKey = behavior === 'hop' ? 'stapler' :
                         behavior === 'fly_sine' ? 'folder' :
                         behavior === 'bounce' ? 'rubberBall' : 'stapler';
        const palette = behavior === 'hop' ? STAPLER_PALETTE :
                       behavior === 'fly_sine' ? FOLDER_PALETTE :
                       behavior === 'bounce' ? RUBBER_BALL_PALETTE : STAPLER_PALETTE;

        if (ENEMY_SPRITES[spriteKey]) {
            this.drawPixelSprite(ctx, x, y, ENEMY_SPRITES[spriteKey], palette, !facingRight);
        }
    }

    // Draw tile (with image fallback)
    drawTile(ctx, x, y, tileType, animFrame = 0) {
        let frameName;
        switch (tileType) {
            case 'ground': frameName = 'grass_top'; break;
            case 'dirt': frameName = 'dirt'; break;
            case 'platform': frameName = 'platform'; break;
            case 'ladder': frameName = 'ladder'; break;
            case 'vine': frameName = 'vine'; break;
            case 'water': frameName = animFrame % 2 === 0 ? 'water_01' : 'water_02'; break;
            case 'destructible': frameName = 'destructible'; break;
            case 'cover': frameName = 'cover_spot'; break;
            default: frameName = 'dirt';
        }

        if (spriteAtlas.frames.has(frameName)) {
            spriteAtlas.drawFrame(ctx, frameName, x, y);
            return;
        }

        // Procedural fallback
        const spriteKey = tileType === 'ground' || tileType === 'dirt' ? tileType :
                         tileType === 'platform' ? 'platform' :
                         tileType === 'water' ? 'water' : 'dirt';

        if (TILE_SPRITES[spriteKey]) {
            this.drawPixelSprite(ctx, x, y, TILE_SPRITES[spriteKey], TILE_PALETTE);
        }
    }

    // Generic pixel sprite renderer (fallback)
    drawPixelSprite(ctx, x, y, data, palette, flipH = false) {
        const height = data.length;
        const width = data[0].length;

        ctx.save();

        if (flipH) {
            ctx.translate(x + width, y);
            ctx.scale(-1, 1);
            x = 0;
            y = 0;
        }

        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                const colorIndex = data[py][px];
                if (colorIndex > 0 && palette[colorIndex]) {
                    ctx.fillStyle = palette[colorIndex];
                    ctx.fillRect(x + px, y + py, 1, 1);
                }
            }
        }

        ctx.restore();
    }
}

// Global procedural sprite renderer (fallback)
const proceduralSprites = new ProceduralSprites();

// Legacy compatibility wrapper
const spriteRenderer = {
    drawSprite: function(ctx, x, y, data, palette, flipH = false) {
        proceduralSprites.drawPixelSprite(ctx, x, y, data, palette, flipH);
    }
};

// ============================================
// CLIPPY PALETTE - Classic MS Office colors
// ============================================
const CLIPPY_PALETTE = {
    0: null,           // Transparent
    1: '#1a1a1a',      // Black outline
    2: '#4a4a4a',      // Dark gray (shadow)
    3: '#7a7a7a',      // Medium gray
    4: '#a8a8a8',      // Light gray (metal)
    5: '#d4d4d4',      // Lighter gray (highlight)
    6: '#ffffff',      // White (shine)
    7: '#2a5298',      // Dark blue (eyes)
    8: '#4a82c8',      // Medium blue
    9: '#6ab2f8',      // Light blue (eye shine)
    10: '#8b4513',     // Brown (gun wood)
    11: '#654321',     // Dark brown
    12: '#cd853f',     // Light brown
    13: '#ff6b6b',     // Red (bandana)
    14: '#cc4444',     // Dark red
    15: '#228b22',     // Green (camo/jungle)
};

// ============================================
// CLIPPY SPRITES - 24x32 pixels (Rambo style)
// Fallback procedural sprites
// ============================================
const CLIPPY_SPRITES = {
    idle: [
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,13,14,13,13,13,13,14,13,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,5,5,6,6,5,5,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,6,6,6,6,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,5,5,5,5,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,4,5,5,5,5,4,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,1,4,4,4,4,4,4,4,4,1,1,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,4,5,5,4,4,5,5,4,4,4,1,0,0,0,0,0],
        [0,0,0,0,1,4,4,4,5,5,5,4,4,5,5,5,4,4,4,1,0,0,0,0],
        [0,0,0,1,4,4,4,5,5,5,5,4,4,5,5,5,5,4,4,4,1,0,0,0],
        [0,0,1,4,4,4,5,5,5,5,4,1,1,4,5,5,5,5,4,4,4,1,0,0],
        [0,0,1,4,4,5,5,5,5,4,1,0,0,1,4,5,5,5,5,4,4,1,0,0],
        [0,0,0,1,4,4,5,5,4,1,0,0,0,0,1,4,5,5,4,4,1,0,11,11],
        [0,0,0,0,1,4,4,4,1,0,0,0,0,0,0,1,4,4,4,1,0,11,10,11],
        [0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,1,1,1,0,11,10,10,11],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,10,11],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,11,10,10,10,11,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,11,10,10,10,11,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,11,10,10,11,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,11,11,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,1,4,1,1,4,1,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,4,4,1,1,4,4,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    run1: [
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,13,14,13,13,13,13,14,13,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,5,5,6,6,5,5,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,6,6,6,6,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,5,5,5,5,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,4,5,5,5,5,4,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,1,4,4,4,4,4,4,4,4,1,1,0,0,11,11,0,0],
        [0,0,0,0,0,1,4,4,4,5,5,4,4,5,5,4,4,4,1,11,10,11,0,0],
        [0,0,0,1,1,4,4,4,5,5,5,4,4,5,5,5,4,4,11,10,10,11,0,0],
        [0,0,1,4,4,4,4,5,5,5,5,4,4,5,5,5,5,11,10,10,10,11,0,0],
        [0,1,4,4,4,4,5,5,5,5,4,1,1,4,5,5,11,10,10,10,11,0,0,0],
        [0,1,4,4,4,5,5,5,5,4,1,0,0,1,4,11,10,10,10,11,0,0,0,0],
        [0,0,1,1,4,4,5,5,4,1,0,0,0,0,11,10,10,10,11,0,0,0,0,0],
        [0,0,0,0,1,4,4,4,1,0,0,0,0,0,0,11,11,11,0,0,0,0,0,0],
        [0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,1,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,1,0,0,0,0,0,1,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,1,4,4,1,0,0,0,0,0,0,0,1,4,4,1,0,0,0,0,0],
        [0,0,0,1,4,4,1,0,0,0,0,0,0,0,0,0,1,4,4,1,0,0,0,0],
        [0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    run2: [
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,13,14,13,13,13,13,14,13,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,5,5,6,6,5,5,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,6,6,6,6,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,5,5,5,5,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,4,5,5,5,5,4,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,11,11,0,0,1,1,4,4,4,4,4,4,4,4,1,1,0,0,0,0,0,0],
        [0,11,10,11,1,1,4,4,4,5,5,4,4,5,5,4,4,4,1,0,0,0,0,0],
        [11,10,10,11,4,4,4,4,5,5,5,4,4,5,5,5,4,4,4,1,1,0,0,0],
        [11,10,10,10,11,4,4,5,5,5,5,4,4,5,5,5,5,4,4,4,4,1,0,0],
        [0,11,10,10,10,11,5,5,5,5,4,1,1,4,5,5,5,5,4,4,4,4,1,0],
        [0,0,11,10,10,10,11,5,5,4,1,0,0,1,4,5,5,5,5,4,4,4,1,0],
        [0,0,0,11,10,10,10,11,4,1,0,0,0,0,1,4,5,5,4,4,1,1,0,0],
        [0,0,0,0,11,11,11,0,1,0,0,0,0,0,0,1,4,4,4,1,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,1,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,1,0,0,0,0,0,0,1,4,4,1,0,0,0,0],
        [0,0,0,0,0,1,4,4,1,0,0,0,0,0,0,0,0,1,4,4,1,0,0,0],
        [0,0,0,0,1,4,4,1,0,0,0,0,0,0,0,0,0,0,1,4,4,1,0,0],
        [0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    jump: [
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,13,14,13,13,13,13,14,13,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,5,5,6,6,5,5,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,6,6,6,6,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,5,5,5,5,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,4,5,5,5,5,4,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,1,4,4,1,1,1,4,4,4,4,4,4,4,4,1,1,1,4,4,1,0,0],
        [0,1,4,4,4,4,4,4,4,5,5,4,4,5,5,4,4,4,4,4,4,4,1,0],
        [0,1,4,4,5,5,4,4,5,5,5,4,4,5,5,5,4,4,5,5,4,4,1,0],
        [0,0,1,4,5,5,5,5,5,5,5,4,4,5,5,5,5,5,5,5,4,1,0,0],
        [0,0,0,1,4,5,5,5,5,5,4,1,1,4,5,5,5,5,5,4,1,0,11,11],
        [0,0,0,0,1,4,5,5,5,4,1,0,0,1,4,5,5,5,4,1,0,11,10,11],
        [0,0,0,0,0,1,4,5,4,1,0,0,0,0,1,4,5,4,1,0,11,10,10,11],
        [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1,1,1,0,11,10,10,10,11],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,10,11,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,10,11,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,10,10,11,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,11,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,1,0,0,0,0,1,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,1,0,0,0,0,0,0,1,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,1,0,0,0,0,0,0,0,0,1,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    crouch: [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,13,14,13,13,13,13,14,13,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,5,5,6,6,5,5,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,6,6,6,6,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,5,5,5,5,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,4,5,5,5,5,4,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,1,4,4,4,4,4,4,4,4,1,1,0,0,0,11,11,0],
        [0,0,0,0,0,1,4,4,4,5,5,4,4,5,5,4,4,4,1,0,11,10,11,0],
        [0,0,0,1,1,4,4,4,5,5,5,4,4,5,5,5,4,4,4,11,10,10,11,0],
        [0,0,1,4,4,4,4,5,5,5,5,4,4,5,5,5,5,4,11,10,10,10,11,0],
        [0,1,4,4,4,4,5,5,5,5,4,1,1,4,5,5,5,11,10,10,10,11,0,0],
        [0,1,1,4,4,5,5,5,5,4,1,0,0,1,4,5,11,10,10,10,11,0,0,0],
        [0,0,0,1,4,4,5,5,4,1,0,0,0,0,1,11,10,10,10,11,0,0,0,0],
        [0,0,0,0,1,4,4,4,1,4,4,1,1,4,4,0,11,11,11,0,0,0,0,0],
        [0,0,0,0,0,1,1,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
    ],
    prone: [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [11,11,11,11,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [10,10,10,10,10,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [11,11,11,11,11,0,13,13,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4,4],
        [0,0,0,0,0,0,13,13,1,4,5,6,6,5,4,7,8,9,5,4,4,4,4,4],
        [0,0,0,0,0,0,0,0,1,4,5,6,6,5,4,7,8,9,5,4,4,4,4,1],
        [0,0,0,0,0,0,0,0,1,4,4,5,5,4,4,4,4,4,4,4,4,1,1,0],
        [0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    climb: [
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,13,14,13,13,13,13,14,13,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,13,13,13,13,13,13,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,5,5,6,6,5,5,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,6,6,6,6,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,7,8,9,5,5,5,5,7,8,9,4,1,0,0,0,0,0],
        [0,0,0,0,0,1,4,4,5,5,5,5,5,5,5,5,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,0,1,4,4,4,5,5,5,5,4,4,4,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
        [0,0,0,1,4,4,1,1,4,4,4,4,4,4,4,4,1,1,4,4,1,0,0,0],
        [0,0,1,4,4,4,4,4,4,5,5,4,4,5,5,4,4,4,4,4,4,1,0,0],
        [0,1,4,4,4,5,5,4,5,5,5,4,4,5,5,5,4,5,5,4,4,4,1,0],
        [0,1,4,4,5,5,5,5,5,5,5,4,4,5,5,5,5,5,5,5,4,4,1,0],
        [0,0,1,4,5,5,5,5,5,5,4,1,1,4,5,5,5,5,5,5,4,1,0,0],
        [0,0,0,1,4,5,5,5,5,4,1,0,0,1,4,5,5,5,5,4,1,0,0,0],
        [0,0,0,0,1,4,5,5,4,1,0,0,0,0,1,4,5,5,4,1,0,0,0,0],
        [0,0,0,0,0,1,4,4,1,0,0,0,0,0,0,1,4,4,1,0,0,0,0,0],
        [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,4,4,1,1,4,4,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,4,1,0,0,1,4,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,4,1,0,0,1,4,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
};

// ============================================
// ENEMY PALETTES
// ============================================
const STAPLER_PALETTE = {
    0: null, 1: '#1a0000', 2: '#cc0000', 3: '#ff0000',
    4: '#880000', 5: '#444444', 6: '#666666', 7: '#ffffff', 8: '#000000'
};

const FOLDER_PALETTE = {
    0: null, 1: '#4a3520', 2: '#d4a574', 3: '#e8c89a',
    4: '#b8956a', 5: '#ff0000', 6: '#ffffff'
};

const RUBBER_BALL_PALETTE = {
    0: null, 1: '#2a1a0a', 2: '#654321', 3: '#8b6914',
    4: '#432108', 5: '#a67c52'
};

// ============================================
// ENEMY SPRITES - Simplified fallback
// ============================================
const ENEMY_SPRITES = {
    stapler: [
        [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
        [0,0,0,0,1,4,4,2,2,2,2,2,2,4,4,1,0,0,0,0],
        [0,0,0,1,4,2,2,2,2,2,2,2,2,2,2,4,1,0,0,0],
        [0,0,1,4,2,2,7,8,2,2,2,2,7,8,2,2,4,1,0,0],
        [0,0,1,4,2,2,7,8,2,2,2,2,7,8,2,2,4,1,0,0],
        [0,0,1,4,2,2,2,2,2,2,2,2,2,2,2,2,4,1,0,0],
        [0,1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1,0],
        [1,5,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,5,1],
        [1,5,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,5,1],
        [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
        [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    folder: [
        [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
        [0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0],
        [0,0,1,2,3,3,3,3,3,3,3,3,3,3,3,3,2,1,0,0],
        [0,1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,1,0],
        [1,2,3,3,5,5,3,3,3,3,3,3,5,5,3,3,3,3,2,1],
        [1,2,3,3,5,5,3,3,3,3,3,3,5,5,3,3,3,3,2,1],
        [1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,1],
        [1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,1],
        [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
        [0,1,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,1,0],
        [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    rubberBall: [
        [0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
        [0,0,0,0,1,1,2,2,2,2,2,2,2,2,1,1,0,0,0,0],
        [0,0,0,1,2,3,3,2,3,2,3,2,3,3,3,2,1,0,0,0],
        [0,0,1,2,3,2,3,3,2,3,2,3,2,3,2,3,2,1,0,0],
        [0,1,2,3,2,3,2,3,3,2,3,2,3,3,2,3,2,3,1,0],
        [0,1,2,2,3,2,3,2,3,3,2,3,2,3,3,2,3,2,1,0],
        [1,2,3,3,2,3,2,3,2,3,3,2,3,2,3,2,3,3,2,1],
        [1,2,2,3,3,2,3,2,3,2,3,3,2,3,2,3,2,2,2,1],
        [1,2,3,2,3,3,2,3,2,3,2,3,3,2,3,3,3,2,2,1],
        [0,1,2,2,3,2,3,3,2,3,2,3,2,3,3,2,3,2,1,0],
        [0,1,2,3,2,3,2,3,3,2,3,2,3,2,3,3,2,2,1,0],
        [0,0,1,2,3,2,3,2,3,3,2,3,2,3,2,3,2,1,0,0],
        [0,0,0,1,2,3,2,3,2,3,3,2,3,2,3,2,1,0,0,0],
        [0,0,0,0,1,1,2,2,2,2,2,2,2,2,1,1,0,0,0,0],
        [0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
};

// ============================================
// TILE SPRITES - Simplified fallback
// ============================================
const TILE_PALETTE = {
    0: null, 1: '#1a0a00', 2: '#4a3018', 3: '#6a4828', 4: '#8a6838',
    5: '#2a8a2a', 6: '#4aba4a', 7: '#6ada6a',
    8: '#1a4a6a', 9: '#2a6a9a', 10: '#4a8aba',
    11: '#5a4030', 12: '#7a5040', 13: '#3a2820'
};

const TILE_SPRITES = {
    ground: [
        [5,5,6,6,7,6,6,5,5,6,6,7,6,6,5,5],
        [6,6,7,7,6,7,7,6,6,7,7,6,7,7,6,6],
        [5,6,6,7,7,6,6,5,5,6,6,7,7,6,6,5],
        [2,3,3,3,4,3,3,2,2,3,3,3,4,3,3,2],
        [3,3,4,3,3,4,3,3,3,3,4,3,3,4,3,3],
        [3,4,3,3,3,3,4,3,3,4,3,3,3,3,4,3],
        [2,3,3,4,3,3,3,2,2,3,3,4,3,3,3,2],
        [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
        [3,4,3,3,4,3,3,3,3,4,3,3,4,3,3,3],
        [3,3,3,3,3,3,4,3,3,3,3,3,3,3,4,3],
        [2,3,4,3,3,3,3,2,2,3,4,3,3,3,3,2],
        [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
        [3,3,3,4,3,4,3,3,3,3,3,4,3,4,3,3],
        [2,3,3,3,3,3,3,2,2,3,3,3,3,3,3,2],
        [3,3,4,3,3,3,4,3,3,3,4,3,3,3,4,3],
        [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    ],
    dirt: [
        [2,3,3,3,4,3,3,2,2,3,3,3,4,3,3,2],
        [3,3,4,3,3,4,3,3,3,3,4,3,3,4,3,3],
        [3,4,3,3,3,3,4,3,3,4,3,3,3,3,4,3],
        [2,3,3,4,3,3,3,2,2,3,3,4,3,3,3,2],
        [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
        [3,4,3,3,4,3,3,3,3,4,3,3,4,3,3,3],
        [3,3,3,3,3,3,4,3,3,3,3,3,3,3,4,3],
        [2,3,4,3,3,3,3,2,2,3,4,3,3,3,3,2],
        [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
        [3,3,3,4,3,4,3,3,3,3,3,4,3,4,3,3],
        [2,3,3,3,3,3,3,2,2,3,3,3,3,3,3,2],
        [3,3,4,3,3,3,4,3,3,3,4,3,3,3,4,3],
        [3,4,3,3,4,3,3,3,3,4,3,3,4,3,3,3],
        [2,3,3,3,3,3,3,2,2,3,3,3,3,3,3,2],
        [3,3,3,4,3,3,4,3,3,3,3,4,3,3,4,3],
        [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    ],
    platform: [
        [11,11,12,11,11,12,11,11,11,11,12,11,11,12,11,11],
        [12,11,11,12,12,11,11,12,12,11,11,12,12,11,11,12],
        [11,12,11,11,11,11,12,11,11,12,11,11,11,11,12,11],
        [13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    water: [
        [8,8,9,9,10,9,9,8,8,9,9,10,9,9,8,8],
        [9,9,10,10,9,10,10,9,9,10,10,9,10,10,9,9],
        [8,9,9,10,10,9,9,8,8,9,9,10,10,9,9,8],
        [9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
        [8,9,9,9,9,9,9,8,8,9,9,9,9,9,9,8],
        [9,9,10,9,9,10,9,9,9,9,10,9,9,10,9,9],
        [9,10,9,9,9,9,10,9,9,10,9,9,9,9,10,9],
        [8,9,9,10,9,9,9,8,8,9,9,10,9,9,9,8],
        [9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
        [9,10,9,9,10,9,9,9,9,10,9,9,10,9,9,9],
        [9,9,9,9,9,9,10,9,9,9,9,9,9,9,10,9],
        [8,9,10,9,9,9,9,8,8,9,10,9,9,9,9,8],
        [9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
        [9,9,9,10,9,10,9,9,9,9,9,10,9,10,9,9],
        [8,9,9,9,9,9,9,8,8,9,9,9,9,9,9,8],
        [9,9,10,9,9,9,10,9,9,9,10,9,9,9,10,9],
    ],
};

// Helper to get current Clippy sprite based on state (legacy compatibility)
function getClippySprite(state, animFrame) {
    switch (state) {
        case PLAYER_STATE.RUNNING:
            return animFrame % 2 === 0 ? CLIPPY_SPRITES.run1 : CLIPPY_SPRITES.run2;
        case PLAYER_STATE.JUMPING:
        case PLAYER_STATE.FALLING:
        case PLAYER_STATE.WALL_SLIDING:
            return CLIPPY_SPRITES.jump;
        case PLAYER_STATE.CROUCHING:
            return CLIPPY_SPRITES.crouch;
        case PLAYER_STATE.PRONE:
            return CLIPPY_SPRITES.prone;
        case PLAYER_STATE.CLIMBING:
            return CLIPPY_SPRITES.climb;
        case PLAYER_STATE.COVER:
            return CLIPPY_SPRITES.crouch;
        default:
            return CLIPPY_SPRITES.idle;
    }
}

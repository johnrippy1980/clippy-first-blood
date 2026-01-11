#!/usr/bin/env node
/**
 * Extract sprites from the ChatGPT-generated Clippy's Revenge sprite sheet
 * Source: 1024x1536 PNG
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'ChatGPT Image Jan 10, 2026, 01_41_43 PM.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'images', 'sprites', 'clippy');
const ENEMIES_DIR = path.join(__dirname, '..', 'images', 'sprites', 'enemies');

// Ensure output directories exist
[OUTPUT_DIR, ENEMIES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Sprite extraction coordinates (x, y, width, height) based on visual inspection
// The sheet is 1024x1536
// Row heights are roughly: title ~90px, then rows ~150-200px each
// Small sprites are ~100-120px wide, large hero ~350px
const SPRITES = {
    clippy: [
        // Row 1: Title (skip) + Large hero on right (roughly x:530, y:50, 400x350)
        { name: 'hero_large', x: 530, y: 50, w: 450, h: 380 },

        // Row 2: Run cycle (5 small sprites) - y starts ~170
        { name: 'run_01', x: 15, y: 170, w: 105, h: 120 },
        { name: 'run_02', x: 125, y: 170, w: 105, h: 120 },
        { name: 'run_03', x: 235, y: 170, w: 105, h: 120 },
        { name: 'run_04', x: 345, y: 170, w: 105, h: 120 },
        { name: 'run_05', x: 455, y: 170, w: 105, h: 120 },

        // Row 3: Crouch shooting (5 sprites) - y starts ~310
        { name: 'crouch_01', x: 15, y: 310, w: 105, h: 120 },
        { name: 'crouch_02', x: 125, y: 310, w: 105, h: 120 },
        { name: 'crouch_03', x: 235, y: 310, w: 105, h: 120 },
        { name: 'crouch_04', x: 345, y: 310, w: 105, h: 120 },
        { name: 'crouch_05', x: 455, y: 310, w: 105, h: 120 },

        // Row 4: Prone positions (3 wide sprites) + standing shots - y starts ~450
        { name: 'prone_01', x: 15, y: 450, w: 140, h: 100 },
        { name: 'prone_02', x: 160, y: 450, w: 140, h: 100 },
        { name: 'prone_03', x: 305, y: 450, w: 140, h: 100 },
        { name: 'shoot_01', x: 455, y: 440, w: 105, h: 115 },
        { name: 'shoot_02', x: 565, y: 440, w: 105, h: 115 },

        // Row 5: Cover + jumps - y starts ~580
        { name: 'cover_01', x: 15, y: 580, w: 120, h: 150 },
        { name: 'cover_shoot', x: 140, y: 580, w: 120, h: 150 },
        { name: 'jump_01', x: 265, y: 580, w: 100, h: 150 },
        { name: 'jump_shoot', x: 370, y: 580, w: 120, h: 150 },
        { name: 'fall_01', x: 495, y: 580, w: 100, h: 150 },

        // Row 6: Tree + ladder/climb - y starts ~760
        { name: 'tree_cover', x: 15, y: 760, w: 130, h: 170 },
        { name: 'climb_01', x: 150, y: 760, w: 90, h: 170 },
        { name: 'climb_02', x: 245, y: 760, w: 90, h: 170 },
        { name: 'climb_03', x: 340, y: 760, w: 90, h: 170 },
        { name: 'ladder_01', x: 435, y: 760, w: 90, h: 170 },
        { name: 'ladder_02', x: 530, y: 760, w: 90, h: 170 },

        // Row 7: Rope/wall climb - y starts ~960
        { name: 'rope_01', x: 15, y: 960, w: 85, h: 160 },
        { name: 'rope_02', x: 105, y: 960, w: 85, h: 160 },
        { name: 'wall_01', x: 195, y: 960, w: 100, h: 160 },
        { name: 'wall_02', x: 300, y: 960, w: 100, h: 160 },
        { name: 'wall_03', x: 405, y: 960, w: 100, h: 160 },

        // Damage/Death area (right side of rows 6-7) - y ~960-1200
        { name: 'hurt_01', x: 530, y: 960, w: 120, h: 140 },
        { name: 'death_01', x: 660, y: 960, w: 170, h: 140 },
        { name: 'death_02', x: 840, y: 960, w: 170, h: 140 },

        // Row 8: More variations - y starts ~1140
        { name: 'wall_slide_01', x: 15, y: 1140, w: 90, h: 160 },
        { name: 'wall_slide_02', x: 110, y: 1140, w: 90, h: 160 },
        { name: 'wall_slide_03', x: 205, y: 1140, w: 100, h: 160 },
        { name: 'rappel_01', x: 310, y: 1140, w: 100, h: 160 },
        { name: 'rappel_02', x: 415, y: 1140, w: 100, h: 160 },

        // Bottom death explosions
        { name: 'death_explode_01', x: 530, y: 1140, w: 180, h: 160 },
        { name: 'death_explode_02', x: 720, y: 1140, w: 180, h: 160 },

        // Idle (reuse standing shoot poses)
        { name: 'idle_01', x: 455, y: 440, w: 105, h: 115 },
        { name: 'idle_02', x: 565, y: 440, w: 105, h: 115 },
    ],
    enemies: [
        // Stapler enemy (row 2, far right)
        { name: 'stapler_idle', x: 700, y: 230, w: 300, h: 150 },

        // Folder enemy (row 3, far right)
        { name: 'folder_idle', x: 700, y: 380, w: 300, h: 160 },

        // File cabinet boss (row 5, far right)
        { name: 'file_cabinet', x: 700, y: 600, w: 300, h: 220 },
    ]
};

// Target size for game sprites
const TARGET_SIZE = 48;

function extractSprite(sprite, outputDir, category) {
    const outputPath = path.join(outputDir, `${sprite.name}.png`);

    // Extract the sprite region
    const cropCmd = `magick "${SOURCE}" -crop ${sprite.w}x${sprite.h}+${sprite.x}+${sprite.y} +repage "${outputPath}"`;

    try {
        execSync(cropCmd, { stdio: 'pipe' });
        console.log(`  Extracted: ${sprite.name} (${sprite.w}x${sprite.h})`);
        return true;
    } catch (error) {
        console.error(`  ERROR extracting ${sprite.name}: ${error.message}`);
        return false;
    }
}

function resizeSprite(spritePath, targetSize) {
    const resizeCmd = `magick "${spritePath}" -resize ${targetSize}x${targetSize} -background transparent -gravity center -extent ${targetSize}x${targetSize} "${spritePath}"`;
    try {
        execSync(resizeCmd, { stdio: 'pipe' });
        return true;
    } catch (error) {
        console.error(`  ERROR resizing ${spritePath}: ${error.message}`);
        return false;
    }
}

console.log('===========================================');
console.log("Clippy's Revenge - Sprite Extractor");
console.log('===========================================');
console.log(`Source: ${SOURCE}`);
console.log(`Target size: ${TARGET_SIZE}x${TARGET_SIZE}`);
console.log('');

// Check source exists
if (!fs.existsSync(SOURCE)) {
    console.error('ERROR: Source sprite sheet not found!');
    process.exit(1);
}

// Extract Clippy sprites
console.log('Extracting Clippy sprites...');
let extracted = 0;
for (const sprite of SPRITES.clippy) {
    if (extractSprite(sprite, OUTPUT_DIR, 'clippy')) {
        extracted++;
    }
}
console.log(`Extracted ${extracted}/${SPRITES.clippy.length} Clippy sprites\n`);

// Extract enemy sprites
console.log('Extracting Enemy sprites...');
extracted = 0;
for (const sprite of SPRITES.enemies) {
    if (extractSprite(sprite, ENEMIES_DIR, 'enemies')) {
        extracted++;
    }
}
console.log(`Extracted ${extracted}/${SPRITES.enemies.length} Enemy sprites\n`);

// Ask about resizing
const args = process.argv.slice(2);
if (args.includes('--resize')) {
    console.log(`Resizing all sprites to ${TARGET_SIZE}x${TARGET_SIZE}...`);

    // Resize Clippy sprites
    for (const sprite of SPRITES.clippy) {
        const spritePath = path.join(OUTPUT_DIR, `${sprite.name}.png`);
        if (fs.existsSync(spritePath)) {
            resizeSprite(spritePath, TARGET_SIZE);
        }
    }

    // Resize enemy sprites
    for (const sprite of SPRITES.enemies) {
        const spritePath = path.join(ENEMIES_DIR, `${sprite.name}.png`);
        if (fs.existsSync(spritePath)) {
            resizeSprite(spritePath, TARGET_SIZE);
        }
    }

    console.log('Resizing complete!');
}

console.log('\n===========================================');
console.log('Extraction complete!');
console.log('===========================================');
console.log('\nTo resize sprites to game size, run:');
console.log('  node tools/extract-sprites.js --resize');

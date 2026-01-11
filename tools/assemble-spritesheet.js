#!/usr/bin/env node
/**
 * Assembles individual PNG sprites into spritesheets and resizes to game dimensions
 * Requires: sharp (npm install sharp)
 */

const fs = require('fs');
const path = require('path');

// Try to use sharp, fall back to canvas if not available
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.log('Installing sharp for image processing...');
    require('child_process').execSync('npm install sharp', { stdio: 'inherit' });
    sharp = require('sharp');
}

const SPRITES_DIR = path.join(__dirname, '..', 'images', 'sprites');

const SPRITE_CONFIGS = {
    clippy: {
        sourceDir: 'clippy',
        targetSize: 48,
        frames: [
            'idle_01', 'idle_02',
            'run_01', 'run_02', 'run_03', 'run_04',
            'jump_01', 'fall_01',
            'crouch_01', 'prone_01',
            'climb_01', 'climb_02',
            'cover_01', 'hurt_01',
            'shoot_01', 'shoot_up_01'
        ]
    },
    enemies: {
        sourceDir: 'enemies',
        targetSize: 32,
        frames: [
            'stapler_idle', 'stapler_hop', 'stapler_shoot',
            'folder_fly_01', 'folder_fly_02',
            'rubber_ball_01', 'rubber_ball_02',
            'tape_dispenser',
            'file_cabinet_01', 'file_cabinet_02', 'file_cabinet_03'
        ]
    },
    tiles: {
        sourceDir: 'tiles',
        targetSize: 16,
        frames: [
            'grass_top', 'dirt', 'platform', 'ladder', 'vine',
            'water_01', 'water_02', 'destructible', 'cover_spot'
        ]
    }
};

async function cropAndResize(inputPath, outputPath, targetSize) {
    // Load image
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Find the center and crop to square, then resize
    const size = Math.min(metadata.width, metadata.height);
    const left = Math.floor((metadata.width - size) / 2);
    const top = Math.floor((metadata.height - size) / 2);

    await image
        .extract({ left, top, width: size, height: size })
        .resize(targetSize, targetSize, {
            kernel: sharp.kernel.nearest // Preserve pixel art crispness
        })
        .png()
        .toFile(outputPath);

    return true;
}

async function assembleSpritesheet(name, config) {
    console.log(`\n=== Assembling ${name} spritesheet ===`);

    const sourceDir = path.join(SPRITES_DIR, config.sourceDir);
    const outputDir = path.join(SPRITES_DIR, '..'); // images/ folder

    const processedFrames = [];
    const targetSize = config.targetSize;

    // Process each frame
    for (const frameName of config.frames) {
        const inputPath = path.join(sourceDir, `${frameName}.png`);
        const outputPath = path.join(sourceDir, `${frameName}_cropped.png`);

        if (!fs.existsSync(inputPath)) {
            console.log(`  Skipping ${frameName} (not found)`);
            continue;
        }

        try {
            await cropAndResize(inputPath, outputPath, targetSize);
            processedFrames.push({ name: frameName, path: outputPath });
            console.log(`  Processed: ${frameName}`);
        } catch (err) {
            console.error(`  Error processing ${frameName}: ${err.message}`);
        }
    }

    if (processedFrames.length === 0) {
        console.log('  No frames to assemble');
        return;
    }

    // Create spritesheet (horizontal strip)
    const sheetWidth = processedFrames.length * targetSize;
    const sheetHeight = targetSize;

    // Composite all frames
    const composites = [];
    for (let i = 0; i < processedFrames.length; i++) {
        composites.push({
            input: processedFrames[i].path,
            left: i * targetSize,
            top: 0
        });
    }

    const sheetPath = path.join(outputDir, `${name}.png`);

    await sharp({
        create: {
            width: sheetWidth,
            height: sheetHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
    .composite(composites)
    .png()
    .toFile(sheetPath);

    console.log(`  Spritesheet saved: ${sheetPath}`);

    // Create JSON metadata
    const metadata = {
        image: `${name}.png`,
        frameWidth: targetSize,
        frameHeight: targetSize,
        frames: {}
    };

    for (let i = 0; i < processedFrames.length; i++) {
        metadata.frames[processedFrames[i].name] = {
            x: i * targetSize,
            y: 0,
            w: targetSize,
            h: targetSize
        };
    }

    const jsonPath = path.join(outputDir, `${name}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));
    console.log(`  Metadata saved: ${jsonPath}`);

    // Cleanup cropped files
    for (const frame of processedFrames) {
        fs.unlinkSync(frame.path);
    }

    return metadata;
}

async function main() {
    console.log('===========================================');
    console.log('Sprite Sheet Assembler');
    console.log('===========================================');

    const args = process.argv.slice(2);
    const targetSheet = args[0] || 'all';

    if (targetSheet === 'all' || targetSheet === 'clippy') {
        await assembleSpritesheet('clippy', SPRITE_CONFIGS.clippy);
    }

    if (targetSheet === 'all' || targetSheet === 'enemies') {
        await assembleSpritesheet('enemies', SPRITE_CONFIGS.enemies);
    }

    if (targetSheet === 'all' || targetSheet === 'tiles') {
        await assembleSpritesheet('tiles', SPRITE_CONFIGS.tiles);
    }

    console.log('\n===========================================');
    console.log('Assembly complete!');
    console.log('===========================================');
    console.log('\nSpritesheets created in images/');
    console.log('The game will automatically load these!');
}

main().catch(console.error);

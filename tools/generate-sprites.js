#!/usr/bin/env node
/**
 * Clippy: First Blood - Automated Sprite Generator with Image Guidance
 * Uses Leonardo AI API to generate all game sprites using reference images
 *
 * Setup:
 * 1. Get your API key from https://app.leonardo.ai/settings -> API
 * 2. Set environment variable: export LEONARDO_API_KEY="your-key-here"
 * 3. Put your Clippy reference image in: images/reference/clippy_reference.png
 * 4. Run: node tools/generate-sprites.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const API_KEY = process.env.LEONARDO_API_KEY;
const API_BASE = 'cloud.leonardo.ai';
const OUTPUT_DIR = path.join(__dirname, '..', 'images', 'sprites');
const REFERENCE_DIR = path.join(__dirname, '..', 'images', 'reference');

// Reference image paths (place your reference images here)
const REFERENCE_IMAGES = {
    clippy: path.join(REFERENCE_DIR, 'clippy_reference.png'),
    enemies: path.join(REFERENCE_DIR, 'enemies_reference.png'),
    tiles: path.join(REFERENCE_DIR, 'tiles_reference.png')
};

// Image Guidance settings (0.0 to 1.0 - higher = more like reference)
// 0.35 = keep paperclip character design but allow pose variation
const IMAGE_GUIDANCE_STRENGTH = 0.35;

// Leonardo model IDs
const MODELS = {
    PHOENIX: '6b645e3a-d64f-4341-a6d8-7a3690fbf042', // Leonardo Phoenix (photorealistic - NOT for pixel art)
    DIFFUSION_XL: '1e60896f-3c26-4296-8ecc-53e2afecc132', // Leonardo Diffusion XL
    ANIME_XL: 'e71a1c2f-4f80-4800-934f-2c68979d8cc8', // Anime XL
    KINO_XL: 'aa77f04e-3eec-4034-9c07-d0f619684628', // Leonardo Kino XL - better for stylized
    VISION_XL: '5c232a9e-9061-4777-980a-ddc8e65647c6', // Leonardo Vision XL
    ALBEDO_BASE: 'b820ea11-02bf-4652-97ae-9ac0cc00593d', // Albedo Base XL
};

// Active model
const ACTIVE_MODEL = MODELS.KINO_XL;

// YOUR EXACT WORKING PROMPT from Leonardo dashboard - emphasize PAPERCLIP shape
const CLIPPY_BASE_PROMPT = '16-bit SNES pixel art style, retro video game sprite, anthropomorphic metal paperclip character, silver wire paperclip body shape with bent wire arms and legs, big blue cartoon eyes on silver face, red bandana headband, holding assault rifle, NOT human, paperclip office supply character, sharp black outlines, limited color palette, no antialiasing, transparent background, centered composition';
const BASE_STYLE = CLIPPY_BASE_PROMPT; // Use same for compatibility
const CLIPPY_CHARACTER = CLIPPY_BASE_PROMPT; // Alias for generateImage function

// All sprite frame definitions - pose prompts get appended to CLIPPY_BASE_PROMPT
const SPRITE_FRAMES = {
    clippy: {
        size: { width: 768, height: 768 },
        targetSize: 48,
        useCharacterPrompt: true,
        frames: [
            { name: 'idle_01', prompt: 'standing idle pose, facing right, gun at ready position, slight bounce animation frame, confident stance' },
            { name: 'idle_02', prompt: 'standing idle pose, facing right, gun at ready, weight shifted, idle animation frame 2' },
            { name: 'run_01', prompt: 'running pose facing right, left leg forward, right leg back, arms holding gun, run cycle frame 1' },
            { name: 'run_02', prompt: 'running pose facing right, legs mid-stride, arms pumping, run cycle frame 2' },
            { name: 'run_03', prompt: 'running pose facing right, right leg forward, left leg back, run cycle frame 3' },
            { name: 'run_04', prompt: 'running pose facing right, legs passing, contact position, run cycle frame 4' },
            { name: 'jump_01', prompt: 'jumping pose, legs tucked up, arms holding gun upward, airborne, ascending' },
            { name: 'fall_01', prompt: 'falling pose, legs dangling down, arms spread, descending, falling animation' },
            { name: 'crouch_01', prompt: 'crouching pose, one knee down, low profile, gun aimed forward, ducking' },
            { name: 'prone_01', prompt: 'prone pose lying flat, belly on ground, gun aimed forward, crawling position' },
            { name: 'climb_01', prompt: 'climbing pose, arms gripping ladder, facing camera, vertical climbing frame 1' },
            { name: 'climb_02', prompt: 'climbing pose, alternate arms and legs, vertical climbing frame 2' },
            { name: 'cover_01', prompt: 'taking cover pose, back against wall, gun ready, peeking out' },
            { name: 'hurt_01', prompt: 'hurt pose, recoiling backward, arms up, hit by damage, pain reaction' },
            { name: 'shoot_01', prompt: 'shooting pose facing right, muzzle flash, gun firing forward, shooting stance' },
            { name: 'shoot_up_01', prompt: 'shooting upward pose, gun aimed straight up, looking up, firing at ceiling' },
        ]
    },
    enemies: {
        size: { width: 512, height: 512 },
        targetSize: 32,
        frames: [
            { name: 'stapler_idle', prompt: 'evil office stapler enemy sprite, angry red stapler with menacing eyes, idle stance, office supply villain, retro game enemy' },
            { name: 'stapler_hop', prompt: 'evil office stapler enemy sprite, angry red stapler with menacing eyes, hop attack pose, jumping motion, office supply villain' },
            { name: 'stapler_shoot', prompt: 'evil office stapler enemy sprite, angry red stapler with menacing eyes, shooting staples, attack pose, office supply villain' },
            { name: 'folder_fly_01', prompt: 'evil flying manila folder enemy sprite, folder with bat wings and angry eyes, swooping attack pose, flying frame 1, office supply villain' },
            { name: 'folder_fly_02', prompt: 'evil flying manila folder enemy sprite, folder with bat wings and angry eyes, wings up position, flying frame 2, office supply villain' },
            { name: 'rubber_ball_01', prompt: 'evil rubber band ball enemy sprite, brown tangled rubber band sphere with eyes peeking out, bouncing motion frame 1, chaotic villain' },
            { name: 'rubber_ball_02', prompt: 'evil rubber band ball enemy sprite, brown tangled rubber band sphere with eyes peeking out, squished bounce frame 2, chaotic villain' },
            { name: 'tape_dispenser', prompt: 'evil tape dispenser enemy sprite, black tape gun with red angry eyes, shooting sticky tape, stationary turret enemy' },
            { name: 'file_cabinet_01', prompt: 'evil file cabinet mini-boss sprite, tall gray filing cabinet with multiple drawer faces, drawers closed, intimidating stance, office boss enemy' },
            { name: 'file_cabinet_02', prompt: 'evil file cabinet mini-boss sprite, tall gray filing cabinet, top drawer open with angry expression, attack charging, office boss enemy' },
            { name: 'file_cabinet_03', prompt: 'evil file cabinet mini-boss sprite, tall gray filing cabinet, all drawers open shooting papers, full attack mode, office boss enemy' },
        ]
    },
    tiles: {
        size: { width: 256, height: 256 },
        targetSize: 16,
        frames: [
            { name: 'grass_top', prompt: 'grass-topped dirt ground tile, green grass on top with brown dirt below, tileable, office park outdoor theme, retro game tileset' },
            { name: 'dirt', prompt: 'brown dirt underground tile, no grass, solid earth, tileable, subtle texture variation, retro game tileset' },
            { name: 'platform', prompt: 'wooden platform tile, brown wood planks, office desk aesthetic, one-way platform, tileable horizontally, retro game tileset' },
            { name: 'ladder', prompt: 'wooden ladder tile, vertical brown rungs, climbable, tileable vertically, retro game tileset' },
            { name: 'vine', prompt: 'green jungle vine tile, organic climbable plant, leaves and tendrils, tileable vertically, retro game tileset' },
            { name: 'water_01', prompt: 'blue water tile frame 1, reflective surface, wave pattern, office water cooler spill aesthetic, tileable, retro game tileset' },
            { name: 'water_02', prompt: 'blue water tile frame 2, reflective surface, different wave pattern, animation frame, tileable, retro game tileset' },
            { name: 'destructible', prompt: 'cracked stone block tile, breakable block with visible cracks, office concrete aesthetic, retro game tileset' },
            { name: 'cover_spot', prompt: 'dark doorway cave entrance tile, shadowy interior, hiding spot for cover mechanic, office building doorframe, retro game tileset' },
        ]
    }
};

const NEGATIVE_PROMPT = 'blur, smooth, gradient, 3D render, realistic, modern, anti-aliasing, soft edges, photorealistic, complex background';

// API helper functions
function makeRequest(method, apiPath, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_BASE,
            port: 443,
            path: `/api/rest/v1${apiPath}`,
            method: method,
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// Upload init image for Image Guidance
async function uploadInitImage(imagePath) {
    console.log(`  Uploading reference image: ${path.basename(imagePath)}`);

    // Step 1: Get presigned URL from Leonardo
    const initResponse = await makeRequest('POST', '/init-image', {
        extension: path.extname(imagePath).slice(1) || 'png'
    });

    if (!initResponse.uploadInitImage) {
        throw new Error('Failed to get upload URL: ' + JSON.stringify(initResponse));
    }

    const { url, fields, id } = initResponse.uploadInitImage;

    // Step 2: Upload image to S3 using multipart form
    const imageData = fs.readFileSync(imagePath);
    const boundary = '----NodeFormBoundary' + Math.random().toString(36).substring(2);
    const parsedUrl = new URL(url);

    // Build multipart body
    const parts = [];
    const parsedFields = JSON.parse(fields);

    for (const [key, value] of Object.entries(parsedFields)) {
        parts.push(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
            `${value}\r\n`
        );
    }

    // Add file part
    parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="reference.png"\r\n` +
        `Content-Type: image/png\r\n\r\n`
    );

    const bodyBuffer = Buffer.concat([
        Buffer.from(parts.join('')),
        imageData,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    // Upload to S3
    await new Promise((resolve, reject) => {
        const protocol = parsedUrl.protocol === 'https:' ? https : require('http');
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': bodyBuffer.length
            }
        };

        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(bodyBuffer);
        req.end();
    });

    console.log(`  Reference image uploaded (ID: ${id})`);
    return id;
}

async function generateImage(prompt, width, height, seed = null, initImageId = null, useCharacterPrompt = false) {
    // Build the full prompt - for Clippy frames, combine base prompt with pose description
    let fullPrompt;
    if (useCharacterPrompt) {
        // Clippy frames: base character description + pose-specific details
        fullPrompt = `${CLIPPY_BASE_PROMPT}, ${prompt}`;
    } else {
        // Other sprites (enemies, tiles): just use the full prompt as-is with style
        fullPrompt = `${BASE_STYLE}, ${prompt}`;
    }

    const body = {
        height: height,
        width: width,
        modelId: ACTIVE_MODEL,
        prompt: fullPrompt,
        negative_prompt: NEGATIVE_PROMPT,
        num_images: 1,
        guidance_scale: 7,
        alchemy: true,
        photoReal: false,
        presetStyle: 'NONE'
    };

    if (seed !== null) {
        body.seed = seed;
    }

    // Add Image Guidance if we have a reference image AND strength > 0
    if (initImageId && IMAGE_GUIDANCE_STRENGTH > 0) {
        body.init_image_id = initImageId;
        body.init_strength = IMAGE_GUIDANCE_STRENGTH;
        body.controlnets = null; // Use standard img2img
    }

    console.log(`  Generating: ${prompt.substring(0, 50)}...`);

    const response = await makeRequest('POST', '/generations', body);

    if (response.error) {
        throw new Error(JSON.stringify(response));
    }

    return response.sdGenerationJob.generationId;
}

async function waitForGeneration(generationId, maxWait = 120000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
        const response = await makeRequest('GET', `/generations/${generationId}`);

        if (response.generations_by_pk) {
            const gen = response.generations_by_pk;
            if (gen.status === 'COMPLETE') {
                return gen.generated_images;
            } else if (gen.status === 'FAILED') {
                throw new Error('Generation failed');
            }
        }

        // Wait 2 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 2000));
        process.stdout.write('.');
    }

    throw new Error('Generation timed out');
}

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

async function generateSpriteSet(name, config) {
    console.log(`\n========================================`);
    console.log(`Generating ${name} sprites...`);
    console.log(`========================================`);

    const outputDir = path.join(OUTPUT_DIR, name);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const metadata = {
        image: `${name}_spritesheet.png`,
        frameWidth: config.targetSize,
        frameHeight: config.targetSize,
        frames: {}
    };

    let seedToUse = null;
    let initImageId = null;

    // Check for reference image
    const refImagePath = REFERENCE_IMAGES[name];
    if (refImagePath && fs.existsSync(refImagePath)) {
        try {
            initImageId = await uploadInitImage(refImagePath);
            console.log(`  Using reference image for ${name} sprites`);
        } catch (err) {
            console.log(`  Warning: Could not upload reference image: ${err.message}`);
            console.log(`  Proceeding without image guidance...`);
        }
    } else {
        console.log(`  No reference image found at: ${refImagePath || 'not configured'}`);
        console.log(`  Tip: Add a reference image for better results!`);
    }

    for (let i = 0; i < config.frames.length; i++) {
        const frame = config.frames[i];
        console.log(`\n[${i + 1}/${config.frames.length}] ${frame.name}`);

        try {
            // Generate - pass useCharacterPrompt flag from config
            const genId = await generateImage(
                frame.prompt,
                config.size.width,
                config.size.height,
                seedToUse,
                initImageId,
                config.useCharacterPrompt || false
            );

            // Wait for completion
            const images = await waitForGeneration(genId);
            console.log(' Done!');

            if (images && images.length > 0) {
                // Lock seed after first successful generation
                if (seedToUse === null && images[0].seed) {
                    seedToUse = images[0].seed;
                    console.log(`  Locked seed: ${seedToUse}`);
                }

                // Download
                const framePath = path.join(outputDir, `${frame.name}.png`);
                await downloadImage(images[0].url, framePath);
                console.log(`  Saved: ${framePath}`);

                // Add to metadata
                metadata.frames[frame.name] = {
                    file: `${frame.name}.png`,
                    x: i * config.targetSize,
                    y: 0,
                    w: config.targetSize,
                    h: config.targetSize
                };
            }

            // Rate limiting - wait 1 second between requests
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`  ERROR: ${error.message}`);
        }
    }

    // Save metadata
    const metaPath = path.join(outputDir, `${name}.json`);
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    console.log(`\nMetadata saved: ${metaPath}`);

    return metadata;
}

async function main() {
    console.log('===========================================');
    console.log('Clippy: First Blood - Sprite Generator');
    console.log('With Image Guidance Support');
    console.log('===========================================');

    if (!API_KEY) {
        console.error('\nERROR: LEONARDO_API_KEY environment variable not set!');
        console.log('\nTo get your API key:');
        console.log('1. Go to https://app.leonardo.ai/settings');
        console.log('2. Click on "API" in the left sidebar');
        console.log('3. Generate or copy your API key');
        console.log('4. Run: export LEONARDO_API_KEY="your-key-here"');
        console.log('5. Then run this script again');
        process.exit(1);
    }

    // Ensure directories exist
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(REFERENCE_DIR)) {
        fs.mkdirSync(REFERENCE_DIR, { recursive: true });
        console.log(`\nCreated reference image directory: ${REFERENCE_DIR}`);
        console.log('Place your reference images there:');
        console.log('  - clippy_reference.png (your good Clippy sprite)');
        console.log('  - enemies_reference.png (optional)');
        console.log('  - tiles_reference.png (optional)');
    }

    console.log(`\nOutput directory: ${OUTPUT_DIR}`);
    console.log(`Reference directory: ${REFERENCE_DIR}`);
    console.log('\nThis will generate all sprites using Leonardo AI.');
    console.log('With reference images, results will match your style!');
    console.log('Estimated time: 5-10 minutes');
    console.log('Estimated cost: ~50-100 API credits\n');

    // Check for command line args
    const args = process.argv.slice(2);
    const spriteSet = args[0] || 'all';

    if (spriteSet === 'all' || spriteSet === 'clippy') {
        await generateSpriteSet('clippy', SPRITE_FRAMES.clippy);
    }

    if (spriteSet === 'all' || spriteSet === 'enemies') {
        await generateSpriteSet('enemies', SPRITE_FRAMES.enemies);
    }

    if (spriteSet === 'all' || spriteSet === 'tiles') {
        await generateSpriteSet('tiles', SPRITE_FRAMES.tiles);
    }

    console.log('\n===========================================');
    console.log('Sprite generation complete!');
    console.log('===========================================');
    console.log('\nNext steps:');
    console.log('1. Review the generated sprites in images/sprites/');
    console.log('2. Run: node tools/assemble-spritesheet.js');
    console.log('\nThe game will automatically use the new sprites!');
}

main().catch(console.error);

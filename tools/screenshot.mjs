// Headless smoke test. Loads the engine modules in Node, renders one frame
// of a given scene, writes PNG to /tmp/clippy-screen.png.
//
// Usage: node tools/screenshot.mjs [scene=title|stage1|stage2|...|stage8]

import { createCanvas, Image, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Stub browser globals so engine modules load without complaint
global.Image = Image;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.window = { addEventListener() {}, removeEventListener() {}, AudioContext: class { constructor(){ this.state='suspended'; this.currentTime=0; this.sampleRate=44100; } resume(){} createGain(){ return { gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}, connect(){return this;}}; } createOscillator(){ return { type:'', frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}}, connect(){return this;}, start(){}, stop(){}}; } createBuffer(){ return { getChannelData(){return new Float32Array(1);}}; } createBufferSource(){ return { buffer:null, connect(){return this;}, start(){}, stop(){}}; } createBiquadFilter(){ return { type:'', Q:{value:0}, frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}}, connect(){return this;}}; }} };
global.AudioContext = global.window.AudioContext;
global.document = { addEventListener() {}, getElementById: () => ({ getContext: () => null }) };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
Object.defineProperty(global, 'navigator', { value: { getGamepads: () => [] }, configurable: true });

const { GAME, STAGES } = await import(path.join(ROOT, 'src/constants.js'));
const { sprites, CLIPPY_MANIFEST, ENEMY_MANIFEST } = await import(path.join(ROOT, 'src/sprites.js'));
const { Camera } = await import(path.join(ROOT, 'src/camera.js'));
const { Level, STAGE_LOADERS } = await import(path.join(ROOT, 'src/level.js'));
const { Player } = await import(path.join(ROOT, 'src/player.js'));
const { EnemyManager } = await import(path.join(ROOT, 'src/enemies.js'));
const { PickupManager } = await import(path.join(ROOT, 'src/pickups.js'));
const { Parallax } = await import(path.join(ROOT, 'src/parallax.js'));
const { drawHUD } = await import(path.join(ROOT, 'src/hud.js'));
const { drawText, drawTextOutlined } = await import(path.join(ROOT, 'src/pixelfont.js'));

// Manually load sprite PNGs via node-canvas loadImage
const loadAssets = async () => {
    const all = { ...CLIPPY_MANIFEST, ...ENEMY_MANIFEST };
    for (const [name, file] of Object.entries(all)) {
        const src = path.join(ROOT, 'assets/sprites', file);
        if (!fs.existsSync(src)) continue;
        try {
            const img = await loadImage(src);
            sprites.images.set(name, img);
            sprites.dims.set(name, { w: img.width, h: img.height });
        } catch (e) {
            // skip
        }
    }
};

const arg = process.argv[2] || 'stage1';
const canvas = createCanvas(GAME.W, GAME.H);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

await loadAssets();

function renderTitle() {
    ctx.fillStyle = '#000408'; ctx.fillRect(0, 0, GAME.W, GAME.H);
    drawTextOutlined(ctx, 'CLIPPY', GAME.W / 2, 38, '#ff5050', '#1a0000', 4, 'center');
    drawTextOutlined(ctx, 'FIRST BLOOD', GAME.W / 2, 78, '#ffe070', '#a82020', 2, 'center');
    drawText(ctx, 'A PAPERCLIP HERO REBORN', GAME.W / 2, 142, '#c0a0d0', 1, 'center');
    drawText(ctx, 'PRESS X TO START', GAME.W / 2, 168, '#fff', 1, 'center');
}

function renderStage(n) {
    const data = STAGE_LOADERS[n]();
    const level = new Level(data);
    const player = new Player(data.playerStart.x, data.playerStart.y);
    const enemies = new EnemyManager();
    const pickups = new PickupManager();
    const camera = new Camera();
    const parallax = new Parallax();
    parallax.setTheme(data.theme);
    camera.setBounds(level.width, level.height);
    for (const s of data.enemySpawns) enemies.spawn(s.x, s.y, s.type);
    pickups.loadFromLevel(data);
    // Warm up
    for (let i = 0; i < 30; i++) {
        level.update(); enemies.update(level, player); pickups.update(level, player);
        camera.follow(player, player.facing); camera.update(); parallax.update();
    }
    parallax.drawBack(ctx, camera);
    level.draw(ctx, camera);
    pickups.draw(ctx, camera);
    enemies.draw(ctx, camera);
    player.draw(ctx, camera);
    parallax.drawFront(ctx, camera);
    drawHUD(ctx, { player, score: 0, time: 0, boss: null });
    drawText(ctx, 'STAGE ' + n + ' ' + STAGES[n].name, 4, 18, '#fff', 1);
}

if (arg === 'title') renderTitle();
else if (arg.startsWith('stage')) renderStage(parseInt(arg.slice(5)));
else renderStage(1);

// Upscale 3x for inspection
const big = createCanvas(GAME.W * 3, GAME.H * 3);
const bctx = big.getContext('2d');
bctx.imageSmoothingEnabled = false;
bctx.drawImage(canvas, 0, 0, GAME.W * 3, GAME.H * 3);
const out = path.join(ROOT, 'screenshot.png');
fs.writeFileSync(out, big.toBuffer('image/png'));
console.log('Wrote', out);

// Headless screenshot of one rendered frame for visual verification.
// Usage: node tools/render-screenshot.js
const fs = require('fs');
const path = require('path');
const { createCanvas, Image } = require('canvas');

// Stub browser globals
global.Image = Image;
global.document = { getElementById: () => null };
global.window = { addEventListener() {}, removeEventListener() {} };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.input = { update() {}, jumpPressed: false };

// Use indirect eval so `const`/`class` go into global scope
const indirectEval = eval;
const loadInto = {};
// Stub Web Audio so audio.js can load without erroring (it inits lazily anyway)
global.AudioContext = class { constructor(){ this.state='suspended'; this.currentTime=0; this.sampleRate=44100; } resume(){} createGain(){ return { gain:{ value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){return this;} }; } createOscillator(){ return { type:'', frequency:{ value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){return this;}, start(){}, stop(){} }; } createBuffer(){ return { getChannelData(){return new Float32Array(1);} }; } createBufferSource(){ return { connect(){return this;}, start(){}, stop(){} }; } createBiquadFilter(){ return { type:'', Q:{value:0}, frequency:{ value:0, setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){return this;} }; } };
global.setTimeout = setTimeout;
const files = ['js/constants.js','js/pixelfont.js','js/audio.js','js/sprites.js','js/input.js','js/effects.js','js/player.js','js/enemies.js','js/pickups.js','js/level.js','js/parallax.js'];
const combined = files.map(p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8')).join('\n');
// Strip `const`/`class` declarations to `var`/global so they reach the global object.
// Easier: wrap with a `with(globalThis){}`-equivalent by assigning module locals to globalThis after eval.
// Indirect eval evaluates in global scope (script mode), so const declarations are at script-global level
// but in Node CJS that doesn't expose them on `global`. Solution: use Function constructor to grab refs.
indirectEval(`
${combined}
;global.GAME = GAME;
;global.PLAYER = PLAYER;
;global.PLAYER_STATE = PLAYER_STATE;
;global.WEAPON = WEAPON;
;global.AIM_DIR = AIM_DIR;
;global.TILE = TILE;
;global.PARALLAX = PARALLAX;
;global.COLORS = COLORS;
;global.SFX = SFX;
;global.ENEMY_TYPE = ENEMY_TYPE;
;global.Level = Level;
;global.Player = Player;
;global.EnemyManager = EnemyManager;
;global.ParallaxBackground = ParallaxBackground;
;global.spriteRenderer = spriteRenderer;
;global.spriteAtlas = spriteAtlas;
;global.proceduralSprites = proceduralSprites;
;global.ENEMY_SPRITES = ENEMY_SPRITES;
;global.STAPLER_PALETTE = STAPLER_PALETTE;
;global.FOLDER_PALETTE = FOLDER_PALETTE;
;global.RUBBER_BALL_PALETTE = RUBBER_BALL_PALETTE;
;global.TILE_PALETTE = TILE_PALETTE;
;global.TILE_SPRITES = TILE_SPRITES;
;global.CLIPPY_SPRITES = CLIPPY_SPRITES;
;global.CLIPPY_PALETTE = CLIPPY_PALETTE;
;global.particles = particles;
;global.pickupManager = pickupManager;
;global.PickupManager = PickupManager;
;global.drawPixelText = drawPixelText;
;global.drawPixelTextOutlined = drawPixelTextOutlined;
;global.PIXEL_FONT = PIXEL_FONT;
`);

const canvas = createCanvas(GAME.WIDTH, GAME.HEIGHT);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Build a fake game state
const stage = parseInt(process.argv[4] || '1', 10);
const level = new Level();
if (stage === 6) level.loadStage6();
else if (stage === 5) level.loadStage5();
else if (stage === 4) level.loadStage4();
else if (stage === 3) level.loadStage3();
else if (stage === 2) level.loadStage2();
else level.loadStage1();
const player = new Player(80, 160);
const enemies = new EnemyManager();
level.spawnPoints.forEach(s => enemies.spawn(s.x, s.y, s.type));
pickupManager.loadFromLevel(level);
const bg = new ParallaxBackground();
const themeMap = { 1: 'jungle', 2: 'breakroom', 3: 'serverroom', 4: 'boardroom', 5: 'keynote', 6: 'founder' };
bg.init(themeMap[stage] || 'jungle');

const cameraX = parseInt(process.argv[2] || '0', 10);
const mode = process.argv[3] || 'play';   // 'play' | 'title'
const camera = { x: cameraX, y: 0 };
player.x = cameraX + 80;

// Render
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
if (mode === 'title') {
  bg.draw(ctx, { x: 0, y: 0 });
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
  drawPixelTextOutlined(ctx, 'CLIPPY', GAME.WIDTH / 2, 36, '#ff5050', '#1a0000', 4, 'center', 1);
  drawPixelTextOutlined(ctx, 'FIRST BLOOD', GAME.WIDTH / 2, 76, '#ffe070', '#a82020', 2, 'center', 1);
  // Title flank icons
  function drawTitleClippyIcon(ctx, x, y) {
    ctx.fillStyle = '#cc4444'; ctx.fillRect(x + 4, y + 1, 16, 2);
    ctx.fillStyle = '#ff6b6b'; ctx.fillRect(x + 4, y, 16, 1);
    ctx.fillStyle = '#aa2828'; ctx.fillRect(x + 4, y + 3, 16, 1);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x + 4, y + 4, 16, 2); ctx.fillRect(x + 4, y + 4, 2, 16);
    ctx.fillRect(x + 18, y + 4, 2, 18); ctx.fillRect(x + 4, y + 20, 14, 2);
    ctx.fillStyle = '#a8a8c0';
    ctx.fillRect(x + 6, y + 6, 12, 1); ctx.fillRect(x + 6, y + 6, 1, 14);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x + 8, y + 8, 10, 2); ctx.fillRect(x + 8, y + 8, 2, 8);
    ctx.fillRect(x + 14, y + 8, 2, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 8, y + 12, 3, 3); ctx.fillRect(x + 13, y + 12, 3, 3);
    ctx.fillStyle = '#2a5298'; ctx.fillRect(x + 9, y + 13, 1, 2); ctx.fillRect(x + 14, y + 13, 1, 2);
  }
  drawTitleClippyIcon(ctx, GAME.WIDTH / 2 - 88, 38);
  drawTitleClippyIcon(ctx, GAME.WIDTH / 2 + 64, 38);
  drawPixelText(ctx, 'A PAPERCLIP HERO REBORN', GAME.WIDTH / 2, 116, '#c0a0d0', 1, 'center', 1);
  drawPixelTextOutlined(ctx, 'PRESS SHOOT TO START', GAME.WIDTH / 2, 140, '#ffffff', '#000000', 1, 'center', 1);
  drawPixelText(ctx, 'C 2026 OFFICE WARFARE LTD.', GAME.WIDTH / 2, 200, '#7a6090', 1, 'center', 1);
  drawPixelText(ctx, 'ARROWS MOVE   Z JUMP   X SHOOT', GAME.WIDTH / 2, 212, '#a8a0c0', 1, 'center', 1);
  // Skip play-mode renderers
} else if (mode === 'intro') {
  // Stage intro card
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
  const panelTop = 40;
  ctx.fillStyle = '#3a2855';
  ctx.fillRect(0, panelTop - 4, GAME.WIDTH, 80);
  ctx.fillStyle = '#1a1140';
  ctx.fillRect(0, panelTop, GAME.WIDTH, 72);
  ctx.fillStyle = '#564468';
  ctx.fillRect(0, panelTop, GAME.WIDTH, 2);
  ctx.fillStyle = '#0a0612';
  ctx.fillRect(0, panelTop + 72, GAME.WIDTH, 2);
  drawPixelTextOutlined(ctx, 'STAGE 1', GAME.WIDTH / 2, panelTop + 14, '#ffe070', '#a82020', 2, 'center', 1);
  drawPixelTextOutlined(ctx, 'OFFICE JUNGLE', GAME.WIDTH / 2, panelTop + 42, '#ff5050', '#1a0000', 3, 'center', 1);
  drawPixelText(ctx, 'READY?', GAME.WIDTH / 2, 200, '#ffffff', 2, 'center', 1);
} else if (mode === 'ending') {
  // Mock the final stats card from gameComplete
  bg.draw(ctx, { x: 0, y: 0 });
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
  const py = 40;
  ctx.fillStyle = '#0a0612'; ctx.fillRect(30, py - 4, GAME.WIDTH - 60, 130);
  ctx.fillStyle = '#3a2855'; ctx.fillRect(32, py - 2, GAME.WIDTH - 64, 126);
  ctx.fillStyle = '#564468'; ctx.fillRect(32, py - 2, GAME.WIDTH - 64, 2);
  drawPixelTextOutlined(ctx, 'MISSION COMPLETE', GAME.WIDTH / 2, py + 6, '#ffe070', '#a82020', 2, 'center', 1);
  const x1 = 46, x2 = GAME.WIDTH - 46;
  let row = py + 34;
  const line = (label, value, color) => {
    drawPixelText(ctx, label, x1, row, '#c0a0d0', 1, 'left', 1);
    drawPixelText(ctx, value, x2, row, color || '#ffffff', 1, 'right', 1);
    row += 12;
  };
  line('FINAL SCORE',    '124500', '#ffe070');
  line('TOTAL TIME',     '4:32', '#7af0ff');
  line('ENEMIES KILLED', '47',   '#ffffff');
  line('DEATHS',         '0',    '#50ff70');
  line('SECRETS',        '1 / 1','#50ff70');
  drawPixelTextOutlined(ctx, 'NO-DEATH RUN!', GAME.WIDTH / 2, row + 4, '#50ff70', '#0a3a14', 1, 'center', 1);
  drawPixelTextOutlined(ctx, 'BOSS RUSH UNLOCKED', GAME.WIDTH / 2, row + 18, '#ff60ff', '#3a0a3a', 1, 'center', 1);
  drawPixelText(ctx, 'SHOOT TO RETURN TO TITLE', GAME.WIDTH / 2, GAME.HEIGHT - 14, '#ffffff', 1, 'center', 1);
} else if (mode === 'clear') {
  // Stage clear celebration mock
  bg.draw(ctx, camera);
  level.draw(ctx, camera);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
  // Fireworks
  for (let i = 0; i < 3; i++) {
    particles.explosion(40 + i * 80, 80 + i * 20);
  }
  particles.update(); particles.draw(ctx, camera);
  drawPixelTextOutlined(ctx, 'STAGE CLEAR', GAME.WIDTH / 2, 38, '#ffe070', '#a82020', 3, 'center', 1);
  const py = 90;
  ctx.fillStyle = '#0a0612'; ctx.fillRect(40, py - 4, GAME.WIDTH - 80, 70);
  ctx.fillStyle = '#3a2855'; ctx.fillRect(42, py - 2, GAME.WIDTH - 84, 66);
  ctx.fillStyle = '#564468'; ctx.fillRect(42, py - 2, GAME.WIDTH - 84, 2);
  ctx.fillStyle = '#1a1140'; ctx.fillRect(42, py + 62, GAME.WIDTH - 84, 2);
  drawPixelText(ctx, 'SCORE',      54, py + 6,  '#c0a0d0', 1, 'left', 1);
  drawPixelText(ctx, '012700', GAME.WIDTH - 54, py + 6,  '#ffffff', 1, 'right', 1);
  drawPixelText(ctx, 'TIME BONUS', 54, py + 22, '#c0a0d0', 1, 'left', 1);
  drawPixelText(ctx, '023500', GAME.WIDTH - 54, py + 22, '#ffe070', 1, 'right', 1);
  drawPixelText(ctx, 'TIME',       54, py + 38, '#c0a0d0', 1, 'left', 1);
  drawPixelText(ctx, '0:55', GAME.WIDTH - 54, py + 38, '#ffffff', 1, 'right', 1);
  drawPixelText(ctx, 'TOTAL',      54, py + 54, '#ffe070', 1, 'left', 1);
  drawPixelTextOutlined(ctx, '036200', GAME.WIDTH - 54, py + 54, '#ff5050', '#1a0000', 1, 'right', 1);
  drawPixelTextOutlined(ctx, 'NEW HIGH SCORE!', GAME.WIDTH / 2, 180, '#ffe070', '#a82020', 1, 'center', 1);
  drawPixelText(ctx, 'SHOOT TO REPLAY', GAME.WIDTH / 2, 205, '#ffffff', 1, 'center', 1);
} else if (mode === 'boss') {
  // Render boss at low HP to show phase 2 rim
  // Find the file-cabinet enemy and damage it down
  const boss = enemies.enemies.find(e => e.behavior === 'miniboss');
  if (boss) { boss.health = boss.maxHealth * 0.3; boss.behaviorTimer = 80; boss.attackTelegraph = 1; }
  bg.draw(ctx, camera);
  level.draw(ctx, camera);
  pickupManager.draw(ctx, camera);
  enemies.draw(ctx, camera);
  player.draw(ctx, camera);
  particles.draw(ctx, camera);
} else if (mode === 'death') {
  // Render gameplay then overlay a dying clippy
  bg.draw(ctx, camera);
  level.draw(ctx, camera);
  enemies.draw(ctx, camera);
  player.state = PLAYER_STATE.DYING;
  player.deathPhase = 1;
  player.draw(ctx, camera);
  // Some explosion particles
  particles.explosion(player.x + player.width/2, player.y + player.height/2);
  particles.update();
  particles.draw(ctx, camera);
} else {
bg.draw(ctx, camera);
level.draw(ctx, camera);
pickupManager.draw(ctx, camera);
enemies.draw(ctx, camera);
// Player draw needs spriteAtlas to have frames - it'll fall back to procedural
player.draw(ctx, camera);

// Mock the HUD by directly calling the bar code
const game = {
  ctx, score: 1234, lives: 3, player,
  drawClippyIcon(ctx, x, y) { /* tiny clippy */ }
};
// Replicate drawHUD inline since we can't easily instantiate Game()
require('vm');  // not needed
// Just stub a minimal HUD
function tinyHUD() {
  const W = GAME.WIDTH, BAR_H = 22;
  ctx.fillStyle = '#0a0612'; ctx.fillRect(0,0,W,BAR_H);
  ctx.fillStyle = '#3a3050'; ctx.fillRect(0,1,W,BAR_H-2);
  ctx.fillStyle = '#564468'; ctx.fillRect(0,2,W,4);
  ctx.fillStyle = '#7a608c'; ctx.fillRect(0,3,W,1);
  ctx.fillStyle = '#2a2240'; ctx.fillRect(0,BAR_H-4,W,2);
  ctx.fillStyle = '#b09cc0'; ctx.fillRect(0,1,W,1);
  ctx.fillStyle = '#000';    ctx.fillRect(0,BAR_H-1,W,1);
  // Health bar
  ctx.fillStyle = '#000'; ctx.fillRect(31,5,82,10);
  for (let i = 0; i < 20; i++) {
    let top, bot;
    const p = i/20;
    if (p<0.3) { top='#ff5050'; bot='#a82020'; }
    else if (p<0.6) { top='#ffd040'; bot='#a87020'; }
    else { top='#50ff70'; bot='#208a30'; }
    const sx = 33 + i*3.9;
    ctx.fillStyle = bot; ctx.fillRect(sx, 7, 3, 6);
    ctx.fillStyle = top; ctx.fillRect(sx, 7, 3, 2);
  }
  ctx.fillStyle = '#7af0ff'; ctx.font = 'bold 8px monospace';
  ctx.fillText('001234', 122, 14);
}
tinyHUD();
}  // end of play branch

// Upscale 3x for viewing
const big = createCanvas(GAME.WIDTH*3, GAME.HEIGHT*3);
const bigCtx = big.getContext('2d');
bigCtx.imageSmoothingEnabled = false;
bigCtx.drawImage(canvas, 0, 0, GAME.WIDTH*3, GAME.HEIGHT*3);

const outPath = path.join(__dirname, '..', 'screenshot.png');
fs.writeFileSync(outPath, big.toBuffer('image/png'));
console.log('Wrote', outPath, `(${GAME.WIDTH*3}x${GAME.HEIGHT*3})`);

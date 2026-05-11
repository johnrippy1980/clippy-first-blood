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
const files = ['js/constants.js','js/sprites.js','js/input.js','js/player.js','js/enemies.js','js/level.js','js/parallax.js'];
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
`);

const canvas = createCanvas(GAME.WIDTH, GAME.HEIGHT);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Build a fake game state
const level = new Level();
level.loadTestLevel();
const player = new Player(80, 160);
const enemies = new EnemyManager();
level.spawnPoints.forEach(s => enemies.spawn(s.x, s.y, s.type));
const bg = new ParallaxBackground();
bg.init();

const camera = { x: 0, y: 0 };

// Render
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
bg.draw(ctx, camera);
level.draw(ctx, camera);
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

// Upscale 3x for viewing
const big = createCanvas(GAME.WIDTH*3, GAME.HEIGHT*3);
const bigCtx = big.getContext('2d');
bigCtx.imageSmoothingEnabled = false;
bigCtx.drawImage(canvas, 0, 0, GAME.WIDTH*3, GAME.HEIGHT*3);

const outPath = path.join(__dirname, '..', 'screenshot.png');
fs.writeFileSync(outPath, big.toBuffer('image/png'));
console.log('Wrote', outPath, `(${GAME.WIDTH*3}x${GAME.HEIGHT*3})`);

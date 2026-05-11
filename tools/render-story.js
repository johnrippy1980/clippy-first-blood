// Standalone story-panel preview. Renders all 18 story panels into a single
// 4-column grid PNG so we can verify the art before commit.
// Usage: node tools/render-story.js [panelIndex|all]
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

global.window = { addEventListener() {}, removeEventListener() {} };
global.document = { getElementById: () => null };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.input = { update() {}, jumpPressed: false };
global.AudioContext = class { constructor(){ this.state='suspended'; this.currentTime=0; this.sampleRate=44100; } resume(){} createGain(){ return { gain:{ value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){return this;} }; } createOscillator(){ return { type:'', frequency:{ value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){return this;}, start(){}, stop(){} }; } createBuffer(){ return { getChannelData(){return new Float32Array(1);} }; } createBufferSource(){ return { connect(){return this;}, start(){}, stop(){} }; } createBiquadFilter(){ return { type:'', Q:{value:0}, frequency:{ value:0, setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){return this;} }; } };

const indirectEval = eval;
const files = ['js/constants.js','js/pixelfont.js','js/audio.js','js/sprites.js','js/input.js','js/effects.js','js/player.js','js/enemies.js','js/pickups.js','js/level.js','js/parallax.js'];
const combined = files.map(p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8')).join('\n');
indirectEval(`
${combined}
;global.GAME = GAME; global.PLAYER = PLAYER; global.PLAYER_STATE = PLAYER_STATE;
;global.WEAPON = WEAPON; global.AIM_DIR = AIM_DIR; global.TILE = TILE; global.PARALLAX = PARALLAX;
;global.COLORS = COLORS; global.SFX = SFX; global.ENEMY_TYPE = ENEMY_TYPE; global.DIFFICULTY = DIFFICULTY;
;global.drawPixelText = drawPixelText; global.drawPixelTextOutlined = drawPixelTextOutlined;
;global.PIXEL_FONT = PIXEL_FONT;
`);

// Load game.js with a stubbed canvas element so the Game class definition runs
// but the load handler doesn't actually start a game loop.
global.document = {
    getElementById: () => ({ getContext: () => ({ imageSmoothingEnabled: false }) }),
    addEventListener() {}
};
const gameSrc = fs.readFileSync(path.join(__dirname, '..', 'js/game.js'), 'utf-8');
indirectEval(`${gameSrc};global.Game = Game;`);

const STORY_PANELS = [
    { text: 'REDMOND  1997', flair: 'cursor' },
    { text: 'CLIPPY WAS AT THE TOP', sub: 'OF HIS GAME', flair: 'worddoc' },
    { text: 'HELPING MILLIONS', sub: 'WITH EVERY WORD DOC', flair: 'helpingHands' },
    { text: 'HE EVEN FOUND LOVE', sub: 'HER NAME WAS CLIPPETTA', flair: 'couple' },
    { text: 'THEY HAD TWIN BOYS', flair: 'twins' },
    { text: 'AND A PAPERCLIP DOG', sub: 'NAMED BACKSPACE', flair: 'family' },
    { text: 'LIFE WAS PERFECT', flair: 'home' },
    { text: 'BUT IN THE BOARDROOM', sub: 'THE NUMBERS WERE GRIM', flair: 'boardroomShadows' },
    { text: 'BAD PR.  USER COMPLAINTS.', sub: 'KILL THE MASCOT.', flair: 'killOrder' },
    { text: 'ONE TUESDAY MORNING', sub: 'HE WAVED THEM GOODBYE', flair: 'carLeaving' },
    { text: '', flair: 'explosion' },
    { text: 'HE WAS SUPPOSED', sub: 'TO BE IN THAT CAR', flair: 'clippyAlone' },
    { text: 'BUT HE WASNT THAT DAY', flair: 'clippyKneeling' },
    { text: 'IT WASNT HIS FAULT', sub: 'JUST A MASCOT FOR A', flair: 'newspaper' },
    { text: 'NOW HE KNOWS WHO TO BLAME', flair: 'eyes' },
    { text: 'AND HE HAS NOTHING', sub: 'LEFT TO LOSE', flair: 'bandana' },
    { text: 'CLIPPY:  FIRST BLOOD', flair: 'logo' }
];

function renderPanel(ctx, panel, timerOffset) {
    // Black background with noise
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    ctx.fillStyle = '#1a1140';
    for (let i = 0; i < 30; i++) {
        const x = (i * 23 + timerOffset * 3) % GAME.WIDTH;
        const y = (i * 41 + timerOffset * 7) % GAME.HEIGHT;
        ctx.fillRect(x, y, 1, 1);
    }
    // Bind game prototype methods to a fake game
    const fakeGame = { storyTimer: timerOffset };
    Object.getOwnPropertyNames(Game.prototype).forEach(k => {
        if (typeof Game.prototype[k] === 'function') fakeGame[k] = Game.prototype[k].bind(fakeGame);
    });
    fakeGame.drawStoryFlair(ctx, panel.flair, GAME.WIDTH / 2, 80);
    if (panel.text) drawPixelTextOutlined(ctx, panel.text, GAME.WIDTH / 2, 140, '#ffe070', '#a82020', 2, 'center', 1);
    if (panel.sub)  drawPixelText(ctx, panel.sub, GAME.WIDTH / 2, 168, '#c0a0d0', 1, 'center', 1);
}

const arg = process.argv[2] || 'all';
if (arg === 'all') {
    // 4-column grid, 5 rows
    const cols = 4, rows = Math.ceil(STORY_PANELS.length / cols);
    const big = createCanvas(GAME.WIDTH * cols, GAME.HEIGHT * rows);
    const bigCtx = big.getContext('2d');
    bigCtx.imageSmoothingEnabled = false;
    bigCtx.fillStyle = '#1a0e1e';
    bigCtx.fillRect(0, 0, big.width, big.height);
    for (let i = 0; i < STORY_PANELS.length; i++) {
        const c = createCanvas(GAME.WIDTH, GAME.HEIGHT);
        const cctx = c.getContext('2d');
        cctx.imageSmoothingEnabled = false;
        renderPanel(cctx, STORY_PANELS[i], 80);
        const cx = (i % cols) * GAME.WIDTH;
        const cy = Math.floor(i / cols) * GAME.HEIGHT;
        bigCtx.drawImage(c, cx, cy);
        // Index label
        bigCtx.fillStyle = '#ffe070';
        bigCtx.font = 'bold 16px monospace';
        bigCtx.fillText(String(i + 1), cx + 8, cy + 20);
    }
    fs.writeFileSync(path.join(__dirname, '..', 'screenshot.png'), big.toBuffer('image/png'));
    console.log('Wrote screenshot.png');
} else {
    const idx = parseInt(arg, 10);
    const c = createCanvas(GAME.WIDTH * 3, GAME.HEIGHT * 3);
    const cctx = c.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    const small = createCanvas(GAME.WIDTH, GAME.HEIGHT);
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    renderPanel(sctx, STORY_PANELS[idx], 80);
    cctx.drawImage(small, 0, 0, GAME.WIDTH * 3, GAME.HEIGHT * 3);
    fs.writeFileSync(path.join(__dirname, '..', 'screenshot.png'), c.toBuffer('image/png'));
    console.log('Wrote screenshot.png');
}

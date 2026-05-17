// Entry point. Boot the game, set up fixed-timestep loop.

import { GAME } from './constants.js';
import { input } from './input.js';
import { Game } from './game.js';

const canvas = document.getElementById('screen');
const game = new Game(canvas);

// Kick off async asset loading. Boot scene shows until ready.
game.preload();

let lastTime = performance.now();
let accumulator = 0;

function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(now - lastTime, 200);
    lastTime = now;
    accumulator += dt;

    let ticks = 0;
    while (accumulator >= GAME.DT && ticks < GAME.MAX_TICKS_PER_FRAME) {
        input.update();
        game.tick();
        input.endFrame();
        accumulator -= GAME.DT;
        ticks++;
    }
    if (ticks === GAME.MAX_TICKS_PER_FRAME) {
        accumulator = 0; // drop spike, don't spiral
    }
    game.render();
}
requestAnimationFrame(loop);

// Pause music when tab hidden
document.addEventListener('visibilitychange', () => {
    // Audio context auto-suspends; no action needed beyond logging.
});

// Click-anywhere to allow autoplay on first interaction
window.addEventListener('keydown', () => { /* audio.init() runs in title tick */ }, { once: true });

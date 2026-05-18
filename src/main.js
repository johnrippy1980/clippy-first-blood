// Entry point. Boot the game, set up fixed-timestep loop.

import { GAME } from './constants.js';
import { input } from './input.js';
import { Game } from './game.js';
import { audio } from './audio.js';

const canvas = document.getElementById('screen');
const game = new Game(canvas);
// Expose for headless smoke tests + dev console
if (typeof window !== 'undefined') {
    window.__game = game;
    window.__audio = audio;
}

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

// First user gesture: init audio context + kick the title music.
// Both keydown AND pointerdown count, in case the user clicks the canvas
// before pressing X (the Audio context can only resume from inside a gesture
// handler, not from an arbitrary tick).
function _firstGesture() {
    audio.init();
    if (audio.ctx?.state === 'suspended') audio.ctx.resume();
    audio.playTrack('title');
    window.removeEventListener('keydown', _firstGesture);
    window.removeEventListener('pointerdown', _firstGesture);
    window.removeEventListener('touchstart', _firstGesture);
}
window.addEventListener('keydown', _firstGesture, { once: true });
window.addEventListener('pointerdown', _firstGesture, { once: true });
window.addEventListener('touchstart', _firstGesture, { once: true });
// Canvas itself: catch direct clicks (in case the window-level pointerdown
// listener loses the race with the canvas's own mouse handler).
canvas.addEventListener('pointerdown', _firstGesture, { once: true });
canvas.addEventListener('click', _firstGesture, { once: true });

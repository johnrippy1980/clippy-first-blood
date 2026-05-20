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

// Tab/window visibility — auto-pause the game and suspend music when
// the player switches away. Browsers will throttle the rAF loop on hidden
// tabs but won't pause the GAME state, so we do it explicitly to avoid
// the player coming back to a dead Clippy.
// Scenes that should auto-pause when the tab loses focus. Includes BOSS_INTRO
// so the cinematic doesn't drain its 150f timer while throttled in the
// background — coming back to a finished cinematic and an already-spawned
// boss with no warning was a real glitch path.
const AUTO_PAUSE_SCENES = new Set(['play', 'bossIntro']);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (AUTO_PAUSE_SCENES.has(game.scene)) {
            game.scene = 'pause';
            game.pauseIndex = 0;
        }
        if (audio._fileEl) try { audio._fileEl.pause(); } catch (_) {}
        if (audio.ctx) try { audio.ctx.suspend(); } catch (_) {}
    } else {
        // Resume audio context on return; music re-starts when the player
        // picks RESUME from the pause menu (which calls audio.playTrack).
        if (audio.ctx) try { audio.ctx.resume(); } catch (_) {}
    }
});

// Window blur also pauses, even if visibilitychange doesn't fire (Safari).
window.addEventListener('blur', () => {
    if (AUTO_PAUSE_SCENES.has(game.scene)) {
        game.scene = 'pause';
        game.pauseIndex = 0;
    }
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

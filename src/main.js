// Entry point. Boot the game, set up fixed-timestep loop.

import { GAME } from './constants.js';
import { input } from './input.js';
import { Game } from './game.js';
import { audio } from './audio.js';
import { achievements } from './achievements.js';
import { options } from './options.js';

// R364: honor persisted display preferences on boot.
//   scanlines — default ON; flip the overlay off if user disabled it
//   crtCurve  — default OFF (until toggled); add body class if user enabled it
if (typeof document !== 'undefined') {
    const slEl = document.getElementById('scanlines');
    if (slEl) slEl.style.display = options.get('scanlines') ? 'block' : 'none';
    if (options.get('crtCurve')) document.body.classList.add('crt-curve');
}

const canvas = document.getElementById('screen');
const game = new Game(canvas);
// Expose for headless smoke tests + dev console. Achievements is exposed
// so screenshot scripts can simulate post-game state (unlock clear_game)
// without mutating localStorage on the dev machine.
if (typeof window !== 'undefined') {
    window.__game = game;
    window.__audio = audio;
    window.__achievements = achievements;
}

// Kick off async asset loading. Boot scene shows until ready.
game.preload();

let lastTime = performance.now();
let accumulator = 0;
let _crashed = false;

// R364: Steam-ship error boundary. If anything in tick/render throws
// uncaught, freeze the loop + paint a friendly "CRASH" overlay so the
// player isn't staring at a stuck canvas. Without this, an exception
// in the game loop silently kills the rAF and the screen just freezes
// with no feedback.
function _paintCrashOverlay(err) {
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#a82020';
        ctx.fillRect(0, 88, canvas.width, 1);
        ctx.fillRect(0, 124, canvas.width, 1);
        ctx.fillStyle = '#ffe070';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CRASH', canvas.width / 2, 110);
        ctx.fillStyle = '#c0a0d0';
        ctx.font = '8px monospace';
        ctx.fillText('refresh the page to continue', canvas.width / 2, 140);
        ctx.fillStyle = '#604068';
        const msg = (err && err.message ? err.message : String(err)).slice(0, 60);
        ctx.fillText(msg, canvas.width / 2, 156);
    } catch (_) { /* even crash painting can fail — give up gracefully */ }
}

function loop(now) {
    if (_crashed) return;
    requestAnimationFrame(loop);
    const dt = Math.min(now - lastTime, 200);
    lastTime = now;
    accumulator += dt;

    try {
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
    } catch (err) {
        _crashed = true;
        console.error('Game loop crashed:', err);
        try { audio.stopTrack?.(); } catch (_) {}
        _paintCrashOverlay(err);
    }
}
requestAnimationFrame(loop);

// Also catch uncaught errors that bubble outside the game loop
// (async asset failures, listener handlers, etc.).
window.addEventListener('error', (ev) => {
    if (_crashed) return;
    _crashed = true;
    console.error('Window error:', ev.error || ev.message);
    _paintCrashOverlay(ev.error || ev.message);
});
window.addEventListener('unhandledrejection', (ev) => {
    if (_crashed) return;
    _crashed = true;
    console.error('Unhandled rejection:', ev.reason);
    _paintCrashOverlay(ev.reason);
});

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

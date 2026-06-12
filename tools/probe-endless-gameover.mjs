// R614 smoke: the GAME OVER screen is Endless-aware. After an Endless death the
// stat panel must read WAVE REACHED + RELICS HELD (not STAGE REACHED / STAGES
// CLEARED), surface the run's cleared-wave count + drafted relic count, and show
// a pulsing NEW BEST! badge when _modeNewBest is armed. Drives an Endless boot,
// stuffs a finished-run state, routes to GAME_OVER, lets the panel fully reveal,
// and asserts zero console/page errors across the animated frames. Also captures
// a screenshot for eyeballing. Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
    const out = {};
    const g = window.__game;
    if (!g) { out.err = 'no game'; return out; }

    // Boot Endless (stage 27) so endlessMode + _endless are armed.
    g.runRelics = [];
    g._relicOffer = null;
    g._relicReturnEndless = false;
    g._startStage(27);
    await new Promise(r => setTimeout(r, 400));
    // Settle out of the stage-intro/READY chain so its scene transitions don't
    // clobber the gameOver we force below.
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 120));
    out.endlessMode = g.endlessMode;

    // Stuff a finished run: cleared 12 waves, holding 2 relics, a fresh best.
    g._endless.cleared = 12;
    g.runRelics = ['glassEdge', 'juggernaut'];
    g._applyRunRelics();
    g._modeNewBest = true;
    g.player.kills = 87;
    g.player.maxCombo = 14;
    g.player.score = 42000;

    // Route to GAME_OVER. Clear any in-flight fade transition left over from
    // the stage-27 boot (otherwise it resolves to READY and clobbers us), then
    // switch scene + reset the story timer that drives the reveal.
    g.transition = 0;
    g.transitionTarget = null;
    g._readyTimer = -1;
    g.gameOverIndex = 0;
    g.storyTimer = 0;
    g.scene = 'gameOver';
    out.routed = true;
    return out;
});

// Let the real loop paint the full reveal: title settle (>40) + every stat row
// (6 rows * 6f) + the menu (>90) + several NEW BEST! pulse frames. ~110 frames.
await page.waitForTimeout(2200);
await page.screenshot({ path: 'tools/_shot-endless-gameover.png' });

const after = await page.evaluate(() => ({
    scene: window.__game.scene,
    endlessMode: window.__game.endlessMode,
    cleared: window.__game._endless?.cleared,
    relics: window.__game.runRelics?.length,
    newBest: window.__game._modeNewBest,
    storyTimer: window.__game.storyTimer,
}));

console.log(JSON.stringify({ errors, result, after }, null, 2));
await browser.close();
const ok = errors.length === 0
    && result.endlessMode === true
    && result.routed === true
    && after.scene === 'gameOver'
    && after.cleared === 12
    && after.relics === 2
    && after.newBest === true
    && after.storyTimer > 90;       // panel + menu fully revealed without crashing
console.log(ok ? 'ENDLESS GAMEOVER OK' : 'ENDLESS GAMEOVER FAIL');
process.exit(ok ? 0 : 1);

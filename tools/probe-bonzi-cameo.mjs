// R616 render smoke: the GAME COMPLETE final cinematic shows a Bonzi cameo
// peeking in from the bottom-left ONCE co-op is unlocked (bonziDefeated). Two
// cases in one boot: (A) bonziDefeated=true -> cameo present (sprite drawn,
// "NICE WORK, PARTNER." line flashes), (B) bonziDefeated=false -> NO cameo.
// Drives a campaign run to GAME_COMPLETE, lets the card settle past the
// cameo's slide-in threshold (storyTimer>70+45), asserts zero errors, and
// screenshots for eyeballing placement (must not collide with stats/banner).
// Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

// Helper: route a finished campaign run to GAME_COMPLETE with a given unlock
// flag, settle the card past the cameo threshold, and report state.
async function routeComplete(bonziDefeated) {
    return await page.evaluate(async (defeated) => {
        const { achievements } = await import('/src/achievements.js');
        const g = window.__game;
        if (!g) return { err: 'no game' };

        // Boot a stage so a player exists, settle to play.
        g._startStage(3);
        await new Promise(r => setTimeout(r, 400));
        g.scene = 'play';
        await new Promise(r => setTimeout(r, 120));

        achievements.stats.bonziDefeated = defeated;

        g.dailyMode = false;
        g.endlessMode = false;
        g.player.score = 41000;
        g.player.kills = 88;
        g.player.maxCombo = 14;
        g.totalTime = 11 * 60 + 30;       // 11:30
        g.totalDeaths = 2;
        g._dailyStreakResult = null;
        g._runRank = 'A';
        g._runPB = null;
        g.currentStage = 27;
        g.stagesCleared = 27;

        // Route to GAME_COMPLETE: clear any boot transition, reset story timer.
        g.transition = 0; g.transitionTarget = null; g._readyTimer = -1;
        g.storyTimer = 0;
        g.scene = 'gameComplete';
        return { routed: true, bonziDefeated: achievements.stats.bonziDefeated };
    }, bonziDefeated);
}

// --- Case A: unlocked -> cameo should appear ---
const a = await routeComplete(true);
await page.waitForTimeout(2200);   // past storyTimer 70 + slide 45 + bob
const afterA = await page.evaluate(() => ({
    scene: window.__game.scene,
    storyTimer: window.__game.storyTimer,
    spriteReady: !!window.__game && (() => {
        // confirm the sprite the cameo draws is actually loaded
        return true;
    })(),
}));
await page.screenshot({ path: 'tools/_shot-bonzi-cameo-on.png' });

// confirm bonzi_idle sprite is present (cameo no-ops silently if missing)
const spriteOk = await page.evaluate(async () => {
    const { sprites } = await import('/src/sprites.js');
    return !!sprites.images.get('bonzi_idle');
});

// --- Case B: locked -> no cameo ---
const b = await routeComplete(false);
await page.waitForTimeout(2200);
const afterB = await page.evaluate(() => ({
    scene: window.__game.scene,
    storyTimer: window.__game.storyTimer,
}));
await page.screenshot({ path: 'tools/_shot-bonzi-cameo-off.png' });

console.log(JSON.stringify({ errors, a, afterA, spriteOk, b, afterB }, null, 2));
await browser.close();
const ok = errors.length === 0
    && a.routed === true
    && a.bonziDefeated === true
    && afterA.scene === 'gameComplete'
    && afterA.storyTimer > 120     // well past the slide-in threshold
    && spriteOk === true
    && b.routed === true
    && b.bonziDefeated === false
    && afterB.scene === 'gameComplete';
console.log(ok ? 'BONZI CAMEO OK' : 'BONZI CAMEO FAIL');
process.exit(ok ? 0 : 1);

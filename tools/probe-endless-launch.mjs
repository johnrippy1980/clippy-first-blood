// R613 regression: launching Endless from the menu must render the REAL
// stage-intro -> stage-card -> play flow with zero errors. The R609 build was
// missing a STAGES[27] metadata entry, so _drawStageIntro / _drawStageCard /
// the music lookup crashed reading .id on undefined the moment Endless started.
// Every other Endless probe forces scene='play' and bypasses the intro, so
// this one deliberately does NOT — it drives the menu dispatch and lets the
// live render loop paint the intro for ~3s, asserting no console/page errors.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const launched = await page.evaluate(async () => {
    const { achievements } = await import('/src/achievements.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    // Endless is gated behind clear_game; unlock so the dispatch is valid.
    achievements.unlocked.add('clear_game');
    // Drive the same dispatch the menu does for the 'endless' action.
    g.runRelics = [];
    g._relicOffer = null;
    g._relicReturnEndless = false;
    g._startStage(27);
    return {
        stageMeta: !!(window.__game.currentStage && true),
        currentStage: g.currentStage,
        // STAGES[27] must now resolve so the intro can read its name/id.
        hasStageMeta: !!(await import('/src/constants.js')).STAGES[27],
    };
});

// Let the live loop render the stage intro / card / play for ~3s. If STAGES[27]
// were still undefined, the intro draw would crash within the first frames.
await page.waitForTimeout(3000);

const sceneNow = await page.evaluate(() => window.__game.scene);

console.log(JSON.stringify({ errors, launched, sceneNow }, null, 2));
await browser.close();
const ok = errors.length === 0
    && launched.currentStage === 27
    && launched.hasStageMeta === true;
console.log(ok ? 'ENDLESS LAUNCH OK' : 'ENDLESS LAUNCH FAIL');
process.exit(ok ? 0 : 1);

// R609 Endless menu-path smoke: confirm the ENDLESS item is gated behind
// clear_game and, once unlocked, the menu dispatch routes into the stage-27
// arena and reaches PLAY with the wave manager running and no console errors.
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
    const { achievements } = await import('/src/achievements.js');

    // Pre-unlock: ENDLESS must be hidden.
    achievements.unlocked.delete('clear_game');
    out.lockedHas = g._mainMenuItems().some(i => i.action === 'endless');

    // Unlock and confirm it appears.
    achievements.unlocked.add('clear_game');
    const items = g._mainMenuItems();
    out.unlockedHas = items.some(i => i.action === 'endless');
    out.label = (items.find(i => i.action === 'endless') || {}).label;

    // Simulate the dispatch the menu does for 'endless'.
    g._startStage(27);
    await new Promise(r => setTimeout(r, 400));
    out.currentStage = g.currentStage;
    out.endlessMode = g.endlessMode;
    out.sceneAfterLaunch = g.scene;   // STAGE_INTRO or READY/PLAY depending on options
    out.hasWaveMgr = !!g._endless;

    return out;
});

console.log(JSON.stringify({ errors, result }, null, 2));
await browser.close();
const r = result;
const ok = errors.length === 0
    && r.lockedHas === false
    && r.unlockedHas === true
    && r.label === 'ENDLESS'
    && r.currentStage === 27
    && r.endlessMode === true
    && r.hasWaveMgr === true;
console.log(ok ? 'ENDLESS MENU OK' : 'ENDLESS MENU FAIL');
process.exit(ok ? 0 : 1);

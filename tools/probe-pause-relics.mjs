// R612 smoke: with relics held, the PAUSE overlay renders the "RELICS HELD"
// loadout row without throwing, at both a light (2 relics) and worst-case
// (all 6 relics, two-line) loadout. Captures screenshots for eyeballing and
// asserts no console/page errors during the paused frames. Exits non-zero on
// fail.
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

    g._startStage(3);                 // a campaign stage; player exists
    await new Promise(r => setTimeout(r, 600));
    g.scene = 'play';                 // force out of any intro/READY beat
    await new Promise(r => setTimeout(r, 100));
    out.hasPlayer = !!g.player;

    // Light loadout: 2 relics -> single line.
    g.runRelics = ['glassEdge', 'juggernaut'];
    g._applyRunRelics();
    g.pauseIndex = 0;
    g._pauseAnim = 99;                // skip the reveal animation
    g._pauseReturnScene = 'play';
    g.scene = 'pause';
    out.lightDrew = true;
    return out;
});
// Let the real render loop paint several PAUSE frames before snapping.
await page.waitForTimeout(250);
await page.screenshot({ path: 'tools/_shot-pause-relics-light.png' });

const result2 = await page.evaluate(async () => {
    const out = {};
    const g = window.__game;
    // Worst case: all 6 relics -> two-line loadout, compressed menu spacing.
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 60));
    g.runRelics = ['glassEdge', 'hairTrigger', 'adrenaline', 'juggernaut', 'berserker', 'featherfoot'];
    g._applyRunRelics();
    g._pauseAnim = 99;
    g._pauseReturnScene = 'play';
    g.scene = 'pause';
    out.heldCount = g.runRelics.length;
    out.fullDrew = true;
    return out;
});
await page.waitForTimeout(250);
await page.screenshot({ path: 'tools/_shot-pause-relics-full.png' });

console.log(JSON.stringify({ errors, result, result2 }, null, 2));
await browser.close();
const ok = errors.length === 0
    && result.hasPlayer === true
    && result.lightDrew === true
    && result2.heldCount === 6
    && result2.fullDrew === true;
console.log(ok ? 'PAUSE RELICS OK' : 'PAUSE RELICS FAIL');
process.exit(ok ? 0 : 1);

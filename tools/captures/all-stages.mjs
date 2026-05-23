// Headless screenshot of every stage. Uses __game._startStage to skip.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-stages';
const STAGES = Array.from({ length: 22 }, (_, i) => i + 1);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(`CONSOLE: ${m.text()}`); });
page.on('response', r => { if (r.status() >= 400) errs.push(`HTTP ${r.status()}: ${r.url()}`); });
page.on('requestfailed', r => errs.push(`REQFAIL: ${r.url()} (${r.failure()?.errorText})`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await fs.mkdir(OUT, { recursive: true });

// Click + press X to leave title
await page.click('#screen');
await page.waitForTimeout(200);

for (const stage of STAGES) {
    // Force the game directly to stage N
    await page.evaluate((n) => {
        const g = window.__game;
        if (!g) return;
        g._startStage(n);
    }, stage);
    // Wait long enough for the intro card to finish (≥ ~2s)
    await page.waitForTimeout(2400);
    // Punch through STAGE_INTRO + READY + BOSS_INTRO with up to 6 X-presses
    // (each press dismisses one scene). FPS / beat-em-up modes skip the
    // READY card entirely so they land in fpsPlay / beatPlay directly.
    for (let attempt = 0; attempt < 6; attempt++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'fpsPlay' || s === 'beatPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(180);
    }
    // Final safety: if some scene flow is wedged, force-flip
    await page.evaluate(() => {
        const g = window.__game;
        if (!g) return;
        if (g.scene !== 'play' && g.scene !== 'fpsPlay' && g.scene !== 'beatPlay') {
            if (g._fpsArena) g.scene = 'fpsPlay';
            else if (g._beatEmUp) g.scene = 'beatPlay';
            else g.scene = 'play';
        }
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/stage-${stage}.png` });
    // Walk right and shoot for variety
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('KeyX');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('KeyX');
    await page.screenshot({ path: `${OUT}/stage-${stage}-action.png` });
}

const finalState = await page.evaluate(() => {
    const g = window.__game;
    return g ? { scene: g.scene, stage: g.currentStage, enemies: g.enemies?.length } : null;
});

await browser.close();
console.log('Final:', JSON.stringify(finalState));
console.log(`Errors (${errs.length}):`);
errs.forEach(e => console.log(' ', e));
console.log(`Screenshots in ${OUT}/`);

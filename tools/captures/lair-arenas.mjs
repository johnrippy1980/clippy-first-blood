// R356: snapshot each boss lair arena with the backdrop tint active.
// Forces the player to the boss-trigger x for each stage with a lair,
// fires the spawn, lets the tint fade in, screenshots.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-lairs';
// Stage IDs that have BOSS_LAIRS entries — main campaign + post-game
const STAGES = [1, 2, 3, 4, 5, 8, 11, 12, 13, 16, 18, 21, 22];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(`CONSOLE: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await fs.mkdir(OUT, { recursive: true });
await page.click('#screen');
await page.waitForTimeout(200);

for (const stage of STAGES) {
    await page.evaluate(n => window.__game?._startStage(n), stage);
    await page.waitForTimeout(700);
    // Dismiss any intro / ready scene
    for (let i = 0; i < 6; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'fpsPlay' || s === 'beatPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(180);
    }
    await page.waitForTimeout(300);
    // Now teleport player to boss-trigger x and force-spawn the boss.
    const result = await page.evaluate(() => {
        const g = window.__game;
        if (!g || !g.player || !g.level) return { ok: false, reason: 'no player' };
        const data = g.level.data || g.level;
        const trigX = data?.bossTrigger?.x;
        if (!trigX) return { ok: false, reason: 'no bossTrigger', stage: g.currentStage };
        // Snap player to trigger
        g.player.x = trigX + 4;
        if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
        // Some stages spawn lair via _spawnBoss directly
        if (typeof g._spawnBoss === 'function') {
            try { g._spawnBoss(); } catch (e) { return { ok: false, reason: `spawnBoss threw: ${e.message}` }; }
        }
        return { ok: true, stage: g.currentStage, hasLair: !!g._bossLair, lairBoss: g._bossLair?.bossKind };
    });
    // Boss intro cinematic can hold for ~3-4s. Mash through it.
    for (let i = 0; i < 12; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'fpsPlay' || s === 'beatPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(220);
    }
    // Tint fades in over 60 frames = 1s; wait 1.5s to be safe
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/lair-${stage}.png` });
    console.log(`stage ${stage}:`, JSON.stringify(result));
}

await browser.close();
console.log(`Errors (${errs.length}):`);
errs.forEach(e => console.log(' ', e));

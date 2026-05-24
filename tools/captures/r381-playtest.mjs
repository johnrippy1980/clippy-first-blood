// R381: real playtest — walk stage 22, force-spawn the brawler boss,
// capture 15 frames over 3 seconds to observe whether enemies actually
// animate (frame cycling) vs just bounce (squash/bob only).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r381';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await fs.mkdir(OUT, { recursive: true });
await page.click('#screen');
await page.waitForTimeout(200);

// Boot stage 22 + skip intros
await page.evaluate(() => { window.__game._startStage(22); });
await page.waitForTimeout(800);
await page.evaluate(() => { if (window.__game._bossIntro) window.__game._bossIntro.autoAdvance = true; });
for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}
await page.waitForTimeout(400);
const scene = await page.evaluate(() => window.__game?.scene);
console.log('Reached scene:', scene);

// Force-spawn the Mecha-Gates boss wave (wave 6)
await page.evaluate(() => {
    const g = window.__game;
    const beat = g?._beatEmUp;
    if (!beat) return 'no beatEmUp';
    // Skip to the boss wave
    beat.scroll = (beat.data.stageWidth || 1024) - 256;
    beat.waveIdx = 6;
    beat._spawnWave(6);
});
await page.waitForTimeout(800);

// Snap 15 frames @ 200ms — that's 3 seconds of gameplay
for (let i = 0; i < 15; i++) {
    await page.screenshot({ path: `${OUT}/f${String(i).padStart(2,'0')}.png` });
    await page.waitForTimeout(200);
}

// Dump diagnostic state
const diag = await page.evaluate(() => {
    const g = window.__game;
    const beat = g?._beatEmUp;
    if (!beat) return null;
    return {
        scene: g.scene,
        waveIdx: beat.waveIdx,
        enemyCount: beat.enemies.length,
        bossExists: !!beat._boss,
        bossHp: beat._boss?.hp,
        bossAnimT: beat._boss?._animT,
        bossW: beat._boss?.w,
        bossH: beat._boss?.h,
        scroll: beat.scroll,
    };
});
console.log('State:', JSON.stringify(diag));
console.log(`Errors (${errs.length}):`);
errs.slice(0, 5).forEach(e => console.log('  ', e));
await browser.close();

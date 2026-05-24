// R382: prove the helicopter is large + the brawler hip-sway is visible.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r382';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(200);

// Stage 21 (helicopter)
await page.evaluate(() => window.__game._startStage(21));
await page.waitForTimeout(800);
await page.evaluate(() => { if (window.__game._bossIntro) window.__game._bossIntro.autoAdvance = true; });
for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}
const s21 = await page.evaluate(() => window.__game?.scene);
console.log('stage 21 scene:', s21);

// Spawn the helicopter wave
await page.evaluate(() => {
    const g = window.__game; const beat = g?._beatEmUp; if (!beat) return;
    beat.scroll = (beat.data.stageWidth || 1024) - 256;
    beat.waveIdx = 4;
    beat._spawnWave(4);
});
await page.waitForTimeout(800);

// Capture
await page.screenshot({ path: `${OUT}/heli_a.png` });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/heli_b.png` });

// Diagnostic
const diag = await page.evaluate(() => {
    const g = window.__game; const beat = g?._beatEmUp; if (!beat) return null;
    return {
        scene: g.scene,
        enemyCount: beat.enemies.length,
        types: beat.enemies.map(e => e.type),
        bossHp: beat._boss?.hp,
        bossType: beat._boss?.type,
    };
});
console.log('helicopter diag:', JSON.stringify(diag));

// Stage 22 — capture brawler sway
await page.evaluate(() => window.__game._startStage(22));
await page.waitForTimeout(800);
await page.evaluate(() => { if (window.__game._bossIntro) window.__game._bossIntro.autoAdvance = true; });
for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}
// Spawn brawler wave (wave 5 has brawlers)
await page.evaluate(() => {
    const g = window.__game; const beat = g?._beatEmUp; if (!beat) return;
    beat.waveIdx = 5;
    beat._spawnWave(5);
    if (g._bossIntro) g._bossIntro.autoAdvance = true;
});
await page.waitForTimeout(1200);
for (let i = 0; i < 12; i++) {
    await page.screenshot({ path: `${OUT}/braw_${String(i).padStart(2,'0')}.png` });
    await page.waitForTimeout(150);
}
const diag22 = await page.evaluate(() => {
    const g = window.__game; const beat = g?._beatEmUp; if (!beat) return null;
    return {
        scene: g.scene,
        enemyCount: beat.enemies.length,
        types: beat.enemies.map(e => e.type),
        animTs: beat.enemies.map(e => e._animT),
        strideOffs: beat.enemies.map(e => e._strideOffX),
    };
});
console.log('stage 22 diag:', JSON.stringify(diag22));
console.log(`Errors (${errs.length}):`);
errs.slice(0, 5).forEach(e => console.log('  ', e));
await browser.close();

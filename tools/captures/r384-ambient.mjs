// R384: capture stages 4 (drips) + 21 (embers/lightning) over time to
// prove the ambient layers fire visibly.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r384';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(200);

// Stage 4 (Pipeline — drips)
await page.evaluate(() => window.__game._startStage(4));
await page.waitForTimeout(700);
for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(100);
}
await page.evaluate(() => { window.__game.player.invuln = 99999; });
// Snap 12 frames @ 250ms each — drips fire every ~60-100 frames so we need ~3+ seconds
for (let i = 0; i < 16; i++) {
    await page.screenshot({ path: `${OUT}/pipe_${String(i).padStart(2,'0')}.png` });
    await page.waitForTimeout(180);
}
const pipeDiag = await page.evaluate(() => {
    const g = window.__game;
    const ap = g._ambientProps;
    return {
        scene: g.scene,
        ambientCount: ap?.props?.length || 0,
        kinds: ap?.props?.map(p => p.kind) || [],
    };
});
console.log('pipe diag:', JSON.stringify(pipeDiag));

// Stage 21 (Helicopter chase — embers + lightning + fog)
await page.evaluate(() => window.__game._startStage(21));
await page.waitForTimeout(700);
for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(100);
}
await page.evaluate(() => { window.__game.player.invuln = 99999; });
// Lightning fires every 3-6s — capture 20 frames @ 250ms = 5s for at least one
for (let i = 0; i < 24; i++) {
    await page.screenshot({ path: `${OUT}/heli_${String(i).padStart(2,'0')}.png` });
    await page.waitForTimeout(220);
}
const heliDiag = await page.evaluate(() => {
    const g = window.__game;
    const ap = g._ambientProps;
    return {
        scene: g.scene,
        ambientCount: ap?.props?.length || 0,
        kinds: ap?.props?.map(p => p.kind) || [],
    };
});
console.log('heli diag:', JSON.stringify(heliDiag));
console.log(`Errors (${errs.length}):`);
errs.slice(0, 5).forEach(e => console.log('  ', e));
await browser.close();

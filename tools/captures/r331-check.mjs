import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r331', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console',   m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(400);
await page.evaluate(async () => {
    const mod = await import('./src/options.js');
    if (mod.options && mod.options.set) mod.options.set('showReady', false);
});
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(20);
    g.scene = 'play';
    g.readyT = 999;
});
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/r331/20-spawn.png' });

// Force-kill wave 0 enemies + force scroll to chokepoint 1
await page.evaluate(() => {
    const g = window.__game;
    const b = g._beatEmUp;
    if (b) {
        b.enemies.forEach(e => e.alive = false);
        // step scroll forward to ~chokepoint 1
        b.scroll = 250;
        b.player.x = b.scroll + 100;
    }
});
await page.waitForTimeout(2500);
const state1 = await page.evaluate(() => {
    const g = window.__game;
    const b = g._beatEmUp;
    return { scroll: Math.round(b.scroll), waveIdx: b.waveIdx, enemies: b.enemies.length, alive: b.enemies.filter(e => e.alive).length };
});
console.log('after chokepoint 1:', JSON.stringify(state1));
await page.screenshot({ path: '/tmp/r331/20-after-cp1.png' });

console.log(`ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ' + e);
await browser.close();

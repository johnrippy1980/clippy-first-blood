import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r337', { recursive: true });
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
    g._startStage(7);
    g.scene = 'play';
    g.readyT = 999;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r337/07-ballmer-beatem-spawn.png' });
// Force the Ballmer wave directly
await page.evaluate(() => {
    const g = window.__game;
    const b = g._beatEmUp;
    if (b) {
        b.enemies.forEach(e => e.alive = false);
        b.waveIdx = 3;
        b._spawnWave(3);
    }
});
await page.waitForTimeout(2000);
const state = await page.evaluate(() => {
    const g = window.__game;
    const b = g._beatEmUp;
    if (!b) return 'no _beatEmUp';
    return {
        waveIdx: b.waveIdx,
        waveSpawned: b.waveSpawned,
        boss: b._boss ? { type: b._boss.type, x: b._boss.x, y: b._boss.y, hp: b._boss.hp, alive: b._boss.alive, name: b._boss.name, isBoss: b._boss.isBoss } : null,
        enemies: b.enemies.map(e => ({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, alive: e.alive, isBoss: e.isBoss })),
    };
});
console.log('STATE:', JSON.stringify(state, null, 2));
await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/r337/07-wave4-ballmer.png' });
console.log(`ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ' + e);
await browser.close();

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r334', { recursive: true });
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
    g._startStage(21);
    g.scene = 'play';
    g.readyT = 999;
});
// Diagnose at intervals
for (let t = 0; t < 6; t++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
        const g = window.__game;
        return {
            scene: g.scene,
            bossIntroAge: g._bossIntro?.age,
            bossSpawned: g.bossSpawned,
            bossKind: g.boss?.kind,
            playerX: Math.round(g.player?.x),
        };
    });
    // try setting autoAdvance every tick in case the intro re-fires
    await page.evaluate(() => {
        const g = window.__game;
        if (g._bossIntro) g._bossIntro.autoAdvance = true;
    });
    console.log(`t=${t * 0.5}s: ${JSON.stringify(s)}`);
}
await page.screenshot({ path: '/tmp/r334/21-helicopter-spawn.png' });
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(2200);
await page.screenshot({ path: '/tmp/r334/21-helicopter-running.png' });
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(800);
const state = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        boss: g.boss ? { kind: g.boss.kind, x: Math.round(g.boss.x), y: Math.round(g.boss.y), hp: g.boss.hp, alive: g.boss.alive } : null,
        player: g.player ? { x: Math.round(g.player.x), y: Math.round(g.player.y) } : null,
        camera: g.camera ? { x: Math.round(g.camera.x), y: Math.round(g.camera.y) } : null,
    };
});
console.log('STATE:', JSON.stringify(state, null, 2));
await page.screenshot({ path: '/tmp/r334/21-helicopter-mid.png' });
console.log(`ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ' + e);
await browser.close();

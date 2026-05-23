import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r341', { recursive: true });
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
// Stage 1 — easiest boss (COPIER_3000)
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.readyT = 999;
});
// Force-spawn the boss
await page.waitForTimeout(800);
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = g.level.data.bossTrigger.x + 50;
    if (g._spawnBoss) g._spawnBoss();
});
// Skip boss intro
await page.waitForTimeout(600);
for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
        const g = window.__game;
        if (g._bossIntro) g._bossIntro.autoAdvance = true;
    });
    await page.waitForTimeout(200);
    const done = await page.evaluate(() => window.__game.scene === 'play');
    if (done) break;
}
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r341/01-copier-idle.png' });
// Force hp to 50% so phase 2 triggers
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss) {
        g.boss.hp = Math.floor(g.boss.maxHp * 0.45);
        g.boss.phase = 2;
    }
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/r341/01-copier-phase2.png' });
console.log(`ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ' + e);
await browser.close();

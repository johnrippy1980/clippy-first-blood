import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r330', { recursive: true });
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
    g._startStage(1);
    g.scene = 'play';
    g.readyT = 999;
});
await page.waitForTimeout(600);
// Trigger boss
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = g.level.data.bossTrigger.x + 50;
    if (g._spawnBoss) g._spawnBoss();
});
// Skip intro
for (let i = 0; i < 20; i++) {
    await page.evaluate(() => { const g = window.__game; if (g._bossIntro) g._bossIntro.autoAdvance = true; });
    await page.waitForTimeout(200);
    const done = await page.evaluate(() => window.__game.scene === 'play');
    if (done) break;
}
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/r330/01-copier-lair-enter.png' });
await page.waitForTimeout(2200);
await page.screenshot({ path: '/tmp/r330/01-copier-lair-active.png' });
const lair = await page.evaluate(() => {
    const g = window.__game;
    return g._bossLair ? {
        kind: g._bossLair.bossKind,
        state: g._bossLair.state,
        enterT: g._bossLair.enterT,
        nameTag: g._bossLair.spec.nameTag,
        bossAlive: g.boss?.alive,
    } : null;
});
console.log('lair:', JSON.stringify(lair));

// Test additional stages — indoor + outdoor
async function captureStage(stageId, label) {
    await page.evaluate((id) => {
        const g = window.__game;
        g._startStage(id);
        g.scene = 'play';
        g.readyT = 999;
        g._bossLair = null;
    }, stageId);
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        const g = window.__game;
        g.player.x = g.level.data.bossTrigger.x + 50;
        if (g._spawnBoss) g._spawnBoss();
    });
    for (let i = 0; i < 20; i++) {
        await page.evaluate(() => { const g = window.__game; if (g._bossIntro) g._bossIntro.autoAdvance = true; });
        await page.waitForTimeout(200);
        const done = await page.evaluate(() => window.__game.scene === 'play');
        if (done) break;
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `/tmp/r330/${label}.png` });
    const s = await page.evaluate(() => {
        const g = window.__game;
        return g._bossLair ? { kind: g._bossLair.bossKind, state: g._bossLair.state, name: g._bossLair.spec.nameTag } : null;
    });
    console.log(`${label}:`, JSON.stringify(s));
}

await captureStage(3, '03-server-lair');
await captureStage(11, '11-founder-lair');
await captureStage(13, '13-cloud-lair');
console.log(`ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ' + e);
await browser.close();

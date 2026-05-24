// R383: capture COPIER boss arena post-spawn with the new wider arena
// + boss spawned at far side. Should look like a real boss room with
// space between player and boss.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r383';
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

await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(700);
for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(100);
}

// Walk player to trigger + spawn boss
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = g.level.data.bossTrigger.x + 4;
    g.player.invuln = 99999;
    if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    g._spawnBoss();
    if (g._bossIntro) g._bossIntro.autoAdvance = true;
});
await page.waitForTimeout(500);
for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}
await page.waitForTimeout(800);

// Capture arena state
for (let i = 0; i < 6; i++) {
    await page.screenshot({ path: `${OUT}/arena_${i}.png` });
    await page.waitForTimeout(200);
}

const diag = await page.evaluate(() => {
    const g = window.__game;
    const lair = g._bossLair;
    const boss = g.boss;
    return {
        scene: g.scene,
        playerX: g.player?.x,
        bossX: boss?.x,
        bossY: boss?.y,
        bossKind: boss?.kind,
        gap: boss ? (boss.x - g.player.x) : null,
        arenaX: lair?.arenaX,
        arenaW: lair?.arenaW,
        arenaBg: lair?.spec?.arenaBg,
        bgOverride: g.parallax?.bgKeyOverride,
        levelWidth: g.level?.width,
    };
});
console.log('arena diag:', JSON.stringify(diag));
console.log(`Errors (${errs.length}):`);
errs.slice(0, 5).forEach(e => console.log('  ', e));
await browser.close();

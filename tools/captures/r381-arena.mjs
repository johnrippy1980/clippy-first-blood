// Trace what happens to parallax.bgKeyOverride during stage 1 boss spawn.
import { chromium } from 'playwright';

const URL = 'http://localhost:8765/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(200);

// Boot stage 1 + skip ready
await page.evaluate(() => { window.__game._startStage(1); });
await page.waitForTimeout(800);
for (let i = 0; i < 15; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}

// Snap state BEFORE spawn
const before = await page.evaluate(() => ({
    scene: window.__game.scene,
    bgOverride: window.__game.parallax?.bgKeyOverride,
    bossLair: !!window.__game._bossLair,
}));

// Force-spawn the boss
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = g.level.data.bossTrigger.x + 4;
    if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    g._spawnBoss();
    if (g._bossIntro) g._bossIntro.autoAdvance = true;
});
await page.waitForTimeout(500);
for (let i = 0; i < 15; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}

const after = await page.evaluate(() => ({
    scene: window.__game.scene,
    bgOverride: window.__game.parallax?.bgKeyOverride,
    bossLair: !!window.__game._bossLair,
    lairSpec: window.__game._bossLair?.spec?.nameTag,
    arenaBg: window.__game._bossLair?.spec?.arenaBg,
}));

console.log('BEFORE spawn:', JSON.stringify(before));
console.log('AFTER spawn: ', JSON.stringify(after));
await browser.close();

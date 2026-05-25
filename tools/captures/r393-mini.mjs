// R393: verify the SHREDDER mini-boss now aims at the player. Walk
// stage 2 to the mini-boss trigger, snap 8 frames of the firing.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r393';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(2));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// God-mode + walk to mini trigger
await page.evaluate(() => {
    const g = window.__game;
    g.player.invuln = 99999;
    g.player.x = (g.level.data.miniBossTrigger || 600) + 4;
    if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    if (g._spawnMiniBoss) g._spawnMiniBoss();
});
await page.waitForTimeout(800);

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (!dataUrl) return;
    await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Snap 10 frames over ~5s (mini fires every ~36 frames)
for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    await snap(`f${String(i).padStart(2,'0')}`);
}

const diag = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        bossKind: g.boss?.kind,
        bossX: g.boss?.x,
        bossIsMini: g.boss?.isMini,
        bossW: g.boss?.w,
        bossH: g.boss?.h,
        enemyBullets: g.enemies?._enemyBullets?.length || 0,
    };
});
console.log('mini:', JSON.stringify(diag));
console.log('errs:', errs.length);
await browser.close();

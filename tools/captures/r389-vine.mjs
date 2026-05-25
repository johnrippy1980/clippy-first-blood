// R389: reproduce the user's "vine gate in the middle" frame.
// Don't force-spawn — play through stage 1 to the boss naturally.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r389';
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
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Force-spawn boss + give the player huge HP so they survive the
// snap but boss DOESN'T die from contact.
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = g.level.data.bossTrigger.x + 4;
    g.player.hp = 9999; g.player.maxHp = 9999;
    if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    g._spawnBoss();
    if (g._bossIntro) g._bossIntro.autoAdvance = true;
});
await page.waitForTimeout(700);
for (let i = 0; i < 10; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}
await page.waitForTimeout(2500);   // let entrance anim finish (60f = 1s)

async function snap(name) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (!dataUrl) return;
    await fs.writeFile(`${OUT}/${name}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await snap('a_post_intro');
// Don't walk past — just dwell so the actual boss fight is visible
await page.waitForTimeout(500);
await snap('b_dwell1');
await page.waitForTimeout(500);
await snap('c_dwell2');
await page.waitForTimeout(500);
await snap('d_dwell3');

const diag = await page.evaluate(() => {
    const g = window.__game;
    return {
        playerX: g.player?.x,
        cameraViewX: g.camera?.viewX,
        gateX: g._bossLair?.arenaX,
        gateScreenX: (g._bossLair?.arenaX || 0) - (g.camera?.viewX || 0),
        gateW: g._bossLair?.gateW,
        arenaW: g._bossLair?.arenaW,
        bossX: g.boss?.x,
        bossScreenX: (g.boss?.x || 0) - (g.camera?.viewX || 0),
    };
});
console.log('diag:', JSON.stringify(diag));
console.log('errs:', errs.length);
await browser.close();

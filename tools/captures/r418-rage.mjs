// R418: verify rage mode triggers when hp drops to 1
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r418';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
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
// Drop player HP to 1 to auto-trigger rage
const triggered = await page.evaluate(() => {
    const p = window.__game.player;
    if (!p) return { error: 'no player' };
    p.hp = 1;
    return { hp: p.hp, rageUsed: p.rageUsedThisStage };
});
console.log('pre:', triggered);
// Tick a frame to let auto-trigger fire
await page.waitForTimeout(50);
const after = await page.evaluate(() => {
    const p = window.__game.player;
    return { hp: p.hp, rageFrames: p.rageFrames, rageUsed: p.rageUsedThisStage };
});
console.log('post:', after);
// Snap 5 frames during rage
for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(150);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/rage_${i}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Try hurting the player during rage — should be no-op
const hurtTest = await page.evaluate(() => {
    const p = window.__game.player;
    const beforeHp = p.hp;
    p.hurt(2, 1, 0, 0);
    return { beforeHp, afterHp: p.hp, rageFrames: p.rageFrames };
});
console.log('hurt test:', hurtTest);
console.log('done');
await browser.close();

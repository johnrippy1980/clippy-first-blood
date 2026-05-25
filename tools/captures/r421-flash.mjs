// R421+R422: verify screen flash fires on weapon pickup + grenade detonate
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r421';
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
await page.evaluate(() => { if (window.__game.player) window.__game.player.invuln = 99999; });
// Fire weapon pickup screen flash
await page.evaluate(() => window.__game.triggerScreenFlash(8, '#50ff70', 0.45));
for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(40);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/pickup_${i}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// Wait for first flash to fade, then fire grenade-style white flash
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.triggerScreenFlash(6, '#ffffff', 0.55));
for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(40);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/grenade_${i}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
console.log('done');
await browser.close();

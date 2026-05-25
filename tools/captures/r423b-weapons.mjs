// R423b: verify weapon switching + muzzle flash render
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r423b';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(23));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.waitForTimeout(800);
// Grant all weapons for the screenshot tour
await page.evaluate(() => {
    const w = window.__game._doomEngine.player.weapons;
    w.shotgun.owned = true; w.shotgun.ammo = 12;
    w.chainsaw.owned = true;
    w.bfg.owned = true; w.bfg.ammo = 3;
});
const labels = ['mg', 'shotgun', 'chainsaw', 'bfg'];
for (let i = 0; i < 4; i++) {
    // Press number key
    await page.keyboard.press(String(i + 1));
    await page.waitForTimeout(120);
    // Fire to capture muzzle flash
    await page.keyboard.down('KeyX');
    await page.waitForTimeout(50);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${labels[i]}_fire.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    await page.keyboard.up('KeyX');
    await page.waitForTimeout(300);
}
// Strafe right + verify it moves
await page.evaluate(() => { window.__game._doomEngine.player.x = 3; window.__game._doomEngine.player.y = 2; });
const beforeX = await page.evaluate(() => window.__game._doomEngine.player.x);
await page.keyboard.down('KeyD');
await page.waitForTimeout(400);
await page.keyboard.up('KeyD');
const afterX = await page.evaluate(() => window.__game._doomEngine.player.x);
console.log(`strafe-right: x ${beforeX.toFixed(2)} -> ${afterX.toFixed(2)}`);
console.log('done');
await browser.close();

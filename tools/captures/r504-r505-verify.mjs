// R504 + R505 verify: BFG charge glow + Doom pause inventory
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r504_r505';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { window.__game._doomEngine._introT = 0; });
await page.waitForTimeout(800);

// Grant BFG + ammo + switch
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.weapons.bfg.owned = true;
    d.player.weapons.bfg.ammo = 5;
    d.player.weaponIdx = 3;
    d.player.weapons.shotgun.owned = true;
    d.player.weapons.shotgun.ammo = 24;
    d.keys.add('red');
    d.keys.add('blue');
    d.player.score = 12450;
});

// Capture 4 frames during BFG charge — should show growing green orb
await page.waitForTimeout(400);
for (let i = 0; i < 4; i++) {
    const ct = (i + 1) * 7;
    await page.evaluate((v) => {
        const d = window.__game._doomEngine;
        d._bfgChargeT = v;
    }, ct);
    await page.waitForTimeout(120);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/0${i + 1}_bfg_charge_${(i + 1) * 7}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Clear charge, open pause overlay to verify R505 inventory rows
await page.evaluate(() => { window.__game._doomEngine._bfgChargeT = 0; });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const pauseShot = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (pauseShot) await fs.writeFile(`${OUT}/05_pause_overlay.png`, Buffer.from(pauseShot.replace(/^data:image\/png;base64,/, ''), 'base64'));

console.log('done');
await browser.close();

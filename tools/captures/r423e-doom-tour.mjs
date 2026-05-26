// R423e: walk + turn through Floor 11 to see clones, walls, weapons
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r423e';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);

async function snap(label) {
    await page.waitForTimeout(200);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Load FLOOR 11 (stage 16 — bigger, more enemies)
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.waitForTimeout(900);

// Spawn view
await snap('01_spawn');

// Walk forward into corridor
for (let i = 0; i < 35; i++) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(33);
    await page.keyboard.up('KeyW');
}
await snap('02_walk');

// Teleport near boss for boss billboard sight
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 14.5;
    d.player.y = 3.5;
    d.player.angle = -Math.PI / 2;   // face north toward boss
});
await snap('03_boss_view');

// Teleport near clones in W bathroom + check clone billboard
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 5.5;
    d.player.y = 13.0;
    d.player.angle = Math.PI / 2;    // face south toward W bathroom
});
await snap('04_clone_view');

// Switch to BFG + fire to capture muzzle flash w/ painted gun
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.weapons.bfg.owned = true;
    d.player.weapons.bfg.ammo = 5;
    d.player.weaponIdx = 3;
});
await page.keyboard.down('KeyX');
await page.waitForTimeout(50);
await snap('05_bfg_fire');
await page.keyboard.up('KeyX');

// Load BLOCK 11 for comparison
await page.evaluate(() => window.__game._startStage(23));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.waitForTimeout(900);
// Place player at hub looking east toward blue door
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 11.5; d.player.y = 8.5;
    d.player.angle = 0;   // face east
});
await snap('06_block11_hub');

console.log('done');
await browser.close();

// R397: snap each weapon firing
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r397';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
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
await page.evaluate(() => { window.__game.player.invuln = 99999; });

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

const weapons = ['MG', 'SPREAD', 'LASER', 'FLAME', 'HOMING', 'THUNDER', 'SHOTGUN'];
for (const w of weapons) {
    await page.evaluate((weapon) => {
        const g = window.__game;
        if (g.player?.setWeapon) g.player.setWeapon(weapon);
        else if (g.player) g.player.weapon = weapon;
    }, w);
    await page.keyboard.down('KeyX');
    await page.waitForTimeout(400);
    await snap(w);
    await page.keyboard.up('KeyX');
    await page.waitForTimeout(200);
}
console.log('done');
await browser.close();

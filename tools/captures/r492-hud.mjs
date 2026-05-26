// R492: snap the Doom HUD at each HP tier to verify face escalation
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r492';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
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

async function snapAtHp(hp, label, opts = {}) {
    await page.evaluate(({ h, o }) => {
        const d = window.__game._doomEngine;
        d.player.hp = h;
        d.player.rageFrames = o.rage ? 200 : 0;
        // Grant some keys + weapons for the HUD to render its state
        d.keys.add('red');
        if (o.allKeys) { d.keys.add('yellow'); d.keys.add('blue'); }
        d.player.weapons.shotgun.owned = true;
        d.player.weapons.shotgun.ammo = 12;
        if (o.allWeapons) {
            d.player.weapons.chainsaw.owned = true;
            d.player.weapons.bfg.owned = true;
            d.player.weapons.bfg.ammo = 3;
        }
        d.player.score = 12450;
    }, { h: hp, o: opts });
    await page.waitForTimeout(300);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

await snapAtHp(6, '01_full');
await snapAtHp(5, '02_hurt1');
await snapAtHp(4, '03_bloody_med');
await snapAtHp(3, '04_hurt2');
await snapAtHp(2, '05_bloody_heavy');
await snapAtHp(1, '06_hurt3');
await snapAtHp(3, '07_rage', { rage: true, allKeys: true, allWeapons: true });
await snapAtHp(1, '08_berserk', { rage: true, allKeys: true, allWeapons: true });

console.log('done');
await browser.close();

// R493+R494+R495: HUD stress test — big numbers, automap, overflow check
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r493';
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

// Test 1: HUGE ammo + score
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.weapons.shotgun.owned = true;
    d.player.weapons.shotgun.ammo = 999;
    d.player.weaponIdx = 1;
    d.player.score = 9999999;
    d.keys.add('red');
    d.keys.add('yellow');
    d.keys.add('blue');
});
await page.waitForTimeout(300);
const d1 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (d1) await fs.writeFile(`${OUT}/01_big_numbers.png`, Buffer.from(d1.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Test 2: chainsaw (long name)
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.weapons.chainsaw.owned = true;
    d.player.weaponIdx = 2;
});
await page.waitForTimeout(300);
const d2 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (d2) await fs.writeFile(`${OUT}/02_chainsaw_name.png`, Buffer.from(d2.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Test 3: open automap
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
const d3 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (d3) await fs.writeFile(`${OUT}/03_automap.png`, Buffer.from(d3.replace(/^data:image\/png;base64,/, ''), 'base64'));
await page.keyboard.press('Tab');

// Test 4: full HP rage + berserk states
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.hp = 1;
    d.player.rageFrames = 200;
});
await page.waitForTimeout(300);
const d4 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (d4) await fs.writeFile(`${OUT}/04_berserk.png`, Buffer.from(d4.replace(/^data:image\/png;base64,/, ''), 'base64'));

console.log('done');
await browser.close();

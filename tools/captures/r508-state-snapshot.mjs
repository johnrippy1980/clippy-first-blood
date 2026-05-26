// R508: snapshot of polish state — title, stage select, intro card
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r508';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
// Title screen
let u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/01_title.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));

await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; window.__game.gameCleared = true; });
await page.waitForTimeout(500);
// Open stage select
await page.evaluate(() => { window.__game.scene = 'stageSelect'; window.__game._stageSelectIndex = 0; });
await page.waitForTimeout(500);
u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/02_stage_select.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Quick Doom HUD glance with full inventory
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { window.__game._doomEngine._introT = 0; });
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.weapons.shotgun.owned = true; d.player.weapons.shotgun.ammo = 50;
    d.player.weapons.chainsaw.owned = true;
    d.player.weapons.bfg.owned = true; d.player.weapons.bfg.ammo = 9;
    d.player.weaponIdx = 1;
    d.keys.add('red'); d.keys.add('yellow'); d.keys.add('blue');
    d.player.score = 8888;
});
await page.waitForTimeout(400);
u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/03_doom_full_kit.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));

console.log('done');
await browser.close();

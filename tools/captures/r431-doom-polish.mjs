// R431+R435+R436+R437: full polish snap
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r431';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);

async function snap(label) {
    await page.waitForTimeout(250);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// FLOOR 11
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.waitForTimeout(800);
await snap('01_floor11_full_hp');

// Hurt the player to 4 HP
await page.evaluate(() => { window.__game._doomEngine.player.hp = 4; });
await snap('02_floor11_hurt_4hp');

// Down to 2 HP
await page.evaluate(() => { window.__game._doomEngine.player.hp = 2; });
await snap('03_floor11_hurt_2hp');

// Down to 1 HP — should trigger rage too
await page.evaluate(() => { window.__game._doomEngine.player.hp = 1; });
await page.waitForTimeout(300);
await snap('04_floor11_1hp_rage');

// Open automap with Tab
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
await snap('05_floor11_automap');
await page.keyboard.press('Tab');  // close

// Teleport to boss room — check exit indicator after kill
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 20.5; d.player.y = 2.5;
    d.player.angle = -Math.PI / 2;
    d.player.hp = 6;
    d.player.rageFrames = 0;
});
await page.waitForTimeout(200);
// Skip boss intro
for (let i = 0; i < 4; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(150);
}
// Kill boss instantly
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    const boss = d.entities.find(e => e.alive && e.kind === 'boss');
    if (boss) { boss.hp = 0; d._killEnemy(boss); }
});
await page.waitForTimeout(300);
await snap('06_floor11_boss_killed');

// Teleport back to spawn — exit indicator should point north
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 20.5; d.player.y = 28;
    d.player.angle = -Math.PI / 2;
});
await page.waitForTimeout(300);
await snap('07_floor11_exit_chevron');

// Now BLOCK 11 with sewer-textured floor/ceiling
await page.evaluate(() => window.__game._startStage(23));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.waitForTimeout(800);
await snap('08_block11_sewer');

// Walk forward
for (let i = 0; i < 30; i++) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(33);
    await page.keyboard.up('KeyW');
}
await snap('09_block11_walked');

console.log('done');
await browser.close();

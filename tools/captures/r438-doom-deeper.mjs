// R438-R443: snap deeper Doom polish
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r438';
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

// FLOOR 11 — intro fly-through
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Mid-intro snap (about 2s in)
await page.waitForTimeout(1500);
await snap('01_intro_flythrough');
// Wait out the intro
await page.waitForTimeout(3000);
// Spawn boss right next to player to test damage indicator
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 20.5; d.player.y = 10;
    d.player.angle = -Math.PI / 2;   // facing north
    // Spawn enemy bullet hitting from EAST
    d.bullets.push({
        x: d.player.x + 0.3,
        y: d.player.y,
        vx: -0.12, vy: 0,
        life: 50,
        fromEnemy: true,
        dmg: 1,
    });
});
await page.waitForTimeout(500);
await snap('02_damage_indicator');
// Reset HP
await page.evaluate(() => { window.__game._doomEngine.player.hp = 6; window.__game._doomEngine.player.iframes = 0; });
// Kill several enemies rapidly for combo
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    let killed = 0;
    for (const e of d.entities) {
        if (e.alive && e.kind === 'clone' && killed < 5) {
            d._killEnemy(e);
            killed++;
        }
    }
});
await page.waitForTimeout(300);
await snap('03_combo_x4');

// Open automap
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
await snap('04_automap');
await page.keyboard.press('Tab');

// Boss intro + phase 2 — teleport to boss
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.x = 20.5; d.player.y = 5;
    d.player.angle = -Math.PI / 2;
    d._bossIntroFired = true;   // skip intro
});
await page.waitForTimeout(200);
// Reduce boss HP to phase 2 threshold
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    const boss = d.entities.find(e => e.alive && e.kind === 'boss');
    if (boss) { boss.hp = 10; boss.maxHp = 70; }
});
await page.waitForTimeout(500);
await snap('05_phase2_boss');

// Trigger boss death + exit pillar
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    const boss = d.entities.find(e => e.alive && e.kind === 'boss');
    if (boss) { boss.hp = 0; d._killEnemy(boss); }
});
await page.waitForTimeout(800);
await snap('06_exit_pillar');

// Walk onto exit pad
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    if (d._exitTilePos) {
        d.player.x = d._exitTilePos.x;
        d.player.y = d._exitTilePos.y;
    }
});
await page.waitForTimeout(800);
await snap('07_stage_clear');

console.log('done');
await browser.close();

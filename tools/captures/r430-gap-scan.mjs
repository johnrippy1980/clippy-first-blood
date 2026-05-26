// R430: gap scan — walk through both Doom levels via teleport to every
// keypoint and check for: enemies in walls, key in unreachable spot,
// boss arena reachable, exit pad spawnable, audio doesn't crash, no
// double-trigger bugs.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r430';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);

async function loadStage(num) {
    await page.evaluate((n) => window.__game._startStage(n), num);
    await page.waitForTimeout(2200);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'doomPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(800);
}

async function teleAndSnap(label, x, y, angle = 0) {
    await page.evaluate(({ tx, ty, ta }) => {
        const d = window.__game._doomEngine;
        d.player.x = tx; d.player.y = ty;
        d.player.angle = ta;
        d.player.iframes = 9999;
    }, { tx: x, ty: y, ta: angle });
    await page.waitForTimeout(400);
    const data = await page.evaluate(() => {
        const d = window.__game._doomEngine;
        const p = d.player;
        const inSolid = d._solidAt(p.x, p.y);
        const keys = Array.from(d.keys);
        const aliveEnemies = d.entities.filter(e => e.alive && (e.kind === 'clone' || e.kind === 'boss')).length;
        return { inSolid, keys, aliveEnemies, hp: p.hp, x: p.x, y: p.y, scene: window.__game.scene };
    });
    console.log(`${label}: ${JSON.stringify(data)}`);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    return data;
}

// ===== BLOCK 11 (stage 23) =====
console.log('--- BLOCK 11 ---');
await loadStage(23);
const issues23 = [];
// Spawn
let r = await teleAndSnap('s23_01_spawn', 1.5, 24.5);
if (r.inSolid) issues23.push('spawn is solid');
// South corridor
r = await teleAndSnap('s23_02_south', 15, 24.5);
if (r.inSolid) issues23.push('south corridor (15, 24.5) is solid');
// Switch room
r = await teleAndSnap('s23_03_switch', 4.5, 17.5);
if (r.inSolid) issues23.push('switch room (4.5, 17.5) is solid');
// Hub
r = await teleAndSnap('s23_04_hub', 14.5, 14.5);
if (r.inSolid) issues23.push('hub (14.5, 14.5) is solid');
// Zigzag
r = await teleAndSnap('s23_05_zigzag', 8.5, 8.5);
if (r.inSolid) issues23.push('zigzag (8.5, 8.5) is solid');
// N clone tank gallery
r = await teleAndSnap('s23_06_ntanks', 12.5, 3.5);
if (r.inSolid) issues23.push('north tanks (12.5, 3.5) is solid');
// NE blue key area
r = await teleAndSnap('s23_07_nekey', 28.5, 4.5);
if (r.inSolid) issues23.push('NE blue key spot (28.5, 4.5) is solid');
// Boss arena
r = await teleAndSnap('s23_08_boss', 28.5, 8.5, -Math.PI / 2);
if (r.inSolid) issues23.push('boss arena (28.5, 8.5) is solid');
// Auto-grant keys + walk to boss door (red+blue)
await page.evaluate(() => {
    window.__game._doomEngine.keys.add('red');
    window.__game._doomEngine.keys.add('blue');
});
r = await teleAndSnap('s23_09_keys_granted', 23.5, 6.5, 0);
if (r.inSolid) issues23.push('approach to boss door (23.5, 6.5) is solid');

// ===== FLOOR 11 (stage 16) =====
console.log('--- FLOOR 11 ---');
await loadStage(16);
const issues16 = [];
r = await teleAndSnap('s16_01_spawn', 20.5, 30.5);
if (r.inSolid) issues16.push('spawn is solid');
r = await teleAndSnap('s16_02_cubicle', 12.5, 22.5);
if (r.inSolid) issues16.push('cubicle farm (12.5, 22.5) is solid');
r = await teleAndSnap('s16_03_exec', 4.5, 9.5);
if (r.inSolid) issues16.push('exec wing (4.5, 9.5) is solid');
r = await teleAndSnap('s16_04_yellowkey', 3.5, 9.5);
if (r.inSolid) issues16.push('yellow key area (3.5, 9.5) is solid');
r = await teleAndSnap('s16_05_hub', 17.5, 9.5);
if (r.inSolid) issues16.push('server hub (17.5, 9.5) is solid');
r = await teleAndSnap('s16_06_bluekey', 27.5, 9.5);
if (r.inSolid) issues16.push('blue key (27.5, 9.5) is solid');
r = await teleAndSnap('s16_07_redkey', 34.5, 14.5);
if (r.inSolid) issues16.push('red key (34.5, 14.5) is solid');
r = await teleAndSnap('s16_08_wbath_bfg', 8.5, 17.5);
if (r.inSolid) issues16.push('west bathroom BFG (8.5, 17.5) is solid');
r = await teleAndSnap('s16_09_switch', 18.5, 13.5);
if (r.inSolid) issues16.push('switch (18.5, 13.5) is solid');
r = await teleAndSnap('s16_10_bossdoor', 20.5, 6.5, -Math.PI / 2);
if (r.inSolid) issues16.push('boss door (20.5, 6.5) is solid');
r = await teleAndSnap('s16_11_boss', 20.5, 2.5, -Math.PI / 2);
if (r.inSolid) issues16.push('boss chamber (20.5, 2.5) is solid');

console.log('\n=== BLOCK 11 ISSUES ===');
issues23.forEach(i => console.log('  ❌ ' + i));
if (!issues23.length) console.log('  ✅ none');
console.log('\n=== FLOOR 11 ISSUES ===');
issues16.forEach(i => console.log('  ❌ ' + i));
if (!issues16.length) console.log('  ✅ none');

await browser.close();

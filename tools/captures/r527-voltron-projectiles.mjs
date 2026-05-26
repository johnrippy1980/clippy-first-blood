// R527: snap projectiles mid-flight + verify telegraph + post-fix
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r527';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(25));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'turretPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { if (window.__game._turretArena) window.__game._turretArena._introT = 0; });

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Spawn Voltron + force throw + watch projectile mid-flight
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.monsters = [];
    a.waveIdx = 4;
    a.waveSpawned = 0;
    a._voltronSpawned = false;
    a._spawnVoltron();
    a.voltron.introT = 0;
    a.voltron.scale = 0.9;
    // Pause player iframes & decrement so collision doesn't despawn
    a.player.iframes = 600;
    a.voltron.attackIdx = 0;
    a._voltronThrowMouse();
});
for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(80);
    await snap(`01_mouse_t${i}`);
    const projCount = await page.evaluate(() => window.__game._turretArena.bossProjectiles.length);
    if (projCount === 0) break;
}
await snap('02_after');

// Reset + throw floppy
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.bossProjectiles = [];
    a.voltron.attackIdx = 1;
    a._voltronThrowFloppy();
});
await page.waitForTimeout(150);
await snap('03_floppy_thrown');
await page.waitForTimeout(250);
await snap('04_floppy_spin');

// Many projectiles + bsod wave (phase 2)
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.voltron.phase = 2;
    a.voltron.face = 'scream';
    a.voltron.faceLockT = 200;
    a.bossProjectiles = [];
    for (let i = 0; i < 4; i++) {
        a.voltron.attackIdx = i;
        if (i % 2) a._voltronThrowFloppy();
        else a._voltronThrowMouse();
    }
    a._voltronBsodWave();
});
await page.waitForTimeout(100);
await snap('05_full_assault');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

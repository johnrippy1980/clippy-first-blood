// R526: snap the Voltron CRT boss at various states
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r526';
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
await page.waitForTimeout(200);

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Force Voltron spawn
await page.evaluate(() => {
    const a = window.__game._turretArena;
    if (a) {
        a.monsters = [];
        a.waveIdx = 4;
        a.waveSpawned = 0;
        a._voltronSpawned = false;
        a._spawnVoltron();
        a.voltron.introT = 0;
        a.voltron.scale = 0.9;
    }
});
await page.waitForTimeout(150);
await snap('01_spawn');

// Cycle through faces
for (const face of ['angry', 'normal', 'scream', 'hurt']) {
    await page.evaluate((f) => {
        const v = window.__game._turretArena.voltron;
        v.face = f;
        v.faceLockT = 100;
    }, face);
    await page.waitForTimeout(120);
    await snap(`02_face_${face}`);
}

// Phase 2 (low HP) — red screen
await page.evaluate(() => {
    const v = window.__game._turretArena.voltron;
    v.hp = 25;
    v.phase = 2;
    v.face = 'scream';
    v.faceLockT = 100;
});
await page.waitForTimeout(120);
await snap('03_phase2');

// Death
await page.evaluate(() => {
    const v = window.__game._turretArena.voltron;
    v.hp = 0;
    v.face = 'dead';
    v.faceLockT = 200;
});
await page.waitForTimeout(120);
await snap('04_dead');

// Spawn some projectiles
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.voltron.hp = 30; a.voltron.face = 'angry'; a.voltron.faceLockT = 100;
    a._voltronThrowMouse();
    a._voltronThrowFloppy();
});
await page.waitForTimeout(80);
await snap('05_projectiles');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

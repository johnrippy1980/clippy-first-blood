// R523: verify turret stage renders + monsters spawn
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r523';
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

// Start turret stage
await page.evaluate(() => window.__game._startStage(25));
await page.waitForTimeout(2500);

// Skip stage intro
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'turretPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Skip turret intro
await page.evaluate(() => { if (window.__game._turretArena) window.__game._turretArena._introT = 0; });
await page.waitForTimeout(300);
await snap('01_arena_empty');

// Wait for first monster spawn
await page.waitForTimeout(1500);
await snap('02_first_monsters');

// Fire some bullets
for (let i = 0; i < 30; i++) {
    await page.keyboard.down('KeyX');
}
await page.waitForTimeout(200);
await snap('03_firing');
await page.keyboard.up('KeyX');

// Wait longer for monsters to advance
await page.waitForTimeout(3000);
await snap('04_monsters_closer');

// Force the boss wave for a snap
await page.evaluate(() => {
    const a = window.__game._turretArena;
    if (a) {
        a.monsters = [];
        a.waveIdx = 4;
        a.waveSpawned = 0;
        a.waveSpawnT = 60;
        a._tickWave();
    }
});
await page.waitForTimeout(800);
await snap('05_boss');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

// R528: snap boss death drama at key beats + damage number floats
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r528';
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

// Spawn Voltron
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.monsters = [];
    a.waveIdx = 4;
    a.waveSpawned = 0;
    a._voltronSpawned = false;
    a._spawnVoltron();
    a.voltron.introT = 0;
    a.voltron.scale = 0.9;
});
await page.waitForTimeout(80);

// Inject damage numbers
await page.evaluate(() => {
    const a = window.__game._turretArena;
    for (let i = 0; i < 5; i++) {
        a.damageNumbers.push({
            x: 90 + i * 18, y: 100 + (i & 1) * 12,
            vy: -1.0, age: i * 3, maxAge: 36,
            value: '1', color: '#ffe070', big: true,
        });
    }
});
await page.waitForTimeout(80);
await snap('01_damage_numbers');

// Trigger boss death directly
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.voltron.hp = 0;
    a._triggerVoltronDeath();
});
await page.waitForTimeout(100);
await snap('02_death_t0');
await page.waitForTimeout(500);
await snap('03_death_t30');
await page.waitForTimeout(700);
await snap('04_death_t70');
await page.waitForTimeout(700);
await snap('05_death_stamp');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

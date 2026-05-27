import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r557_crtron';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(25));
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'turretPlay') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a._introT = 0;
    a.waveIdx = 4;
    a._voltronSpawned = false;
    a._spawnVoltron();
    a.voltron.introT = 0;
    a.voltron.scale = 0.9;
    a.player.iframes = 600;
});
await page.waitForTimeout(400);
const u1 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
await fs.writeFile(`${OUT}/01_spawn.png`, Buffer.from(u1.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Trigger attacks
for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
        const a = window.__game._turretArena;
        a.voltron.attackCD = 1;
    });
    await page.waitForTimeout(200);
}
const u2 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
await fs.writeFile(`${OUT}/02_attacks.png`, Buffer.from(u2.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Phase 2
await page.evaluate(() => {
    window.__game._turretArena.voltron.hp = 25;
});
await page.waitForTimeout(500);
const u3 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
await fs.writeFile(`${OUT}/03_phase2.png`, Buffer.from(u3.replace(/^data:image\/png;base64,/, ''), 'base64'));

// BSOD wave
await page.evaluate(() => {
    window.__game._turretArena._voltronBsodWave();
});
await page.waitForTimeout(300);
const u4 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
await fs.writeFile(`${OUT}/04_bsod.png`, Buffer.from(u4.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Death
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.voltron.hp = 0;
    a._triggerVoltronDeath();
});
await page.waitForTimeout(800);
const u5 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
await fs.writeFile(`${OUT}/05_death.png`, Buffer.from(u5.replace(/^data:image\/png;base64,/, ''), 'base64'));

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();

// R540: verify the new mid-campaign chain Stage 3 → Stage 25 → Stage 4
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r540';
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
    window.__game.unlockedStage = 24;
    window.__game.gameCleared = true;
});

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Start stage 3
await page.evaluate(() => window.__game._startStage(3));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Force clear
await page.evaluate(() => window.__game._onStageClear());
await page.waitForTimeout(200);
await page.evaluate(() => { window.__game.storyTimer = 200; });
await page.waitForTimeout(200);
await snap('01_stage3_clear');
// Advance
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);
await snap('02_stage_card_for_25');
// Verify it's the stage card for 25
const pending = await page.evaluate(() => window.__game._pendingStage);
console.log('pending stage after 3 clear:', pending);
// Advance to start stage 25
await page.keyboard.press('KeyX');
await page.waitForTimeout(2500);
const scene1 = await page.evaluate(() => window.__game?.scene);
console.log('after card advance:', scene1);
for (let i = 0; i < 6; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'turretPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await snap('03_turret_start');

// Force CRTRON spawn + immediate death to test stage 25 → 4 chain
await page.evaluate(() => {
    const a = window.__game._turretArena;
    if (a) {
        a._introT = 0;
        a.waveIdx = 4;
        a._voltronSpawned = false;
        a._spawnVoltron();
        a.voltron.introT = 0;
        a.voltron.scale = 0.9;
        a.voltron.hp = 0;
        a._triggerVoltronDeath();
    }
});
// Run for death sequence + clear
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(80);
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'stageCard' || s === 'play') break;
}
const scene2 = await page.evaluate(() => window.__game?.scene);
const pending2 = await page.evaluate(() => window.__game._pendingStage);
console.log('after turret clear scene:', scene2, 'pending:', pending2);
await snap('04_after_turret_clear');
// Advance
await page.keyboard.press('KeyX');
await page.waitForTimeout(2000);
const scene3 = await page.evaluate(() => window.__game?.scene);
console.log('after final advance:', scene3);
await snap('05_landed');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

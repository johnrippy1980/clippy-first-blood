// R516: verify melee combat in stage 7 brawler
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r516_melee';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; });

await page.evaluate(() => window.__game._startStage(7));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Wait for intro bark to appear
await page.waitForTimeout(1500);
await snap('01_intro_bark');

// Punch a few times — should see fist extensions
for (let i = 0; i < 5; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(80);
    await snap(`02_punch_${i}`);
}

// Jump + punch = jumpkick
await page.keyboard.down('Space');
await page.waitForTimeout(100);
await page.keyboard.up('Space');
await page.waitForTimeout(120);
await page.keyboard.press('KeyX');
await page.waitForTimeout(60);
await snap('03_jumpkick');

// Down+punch = roundhouse
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(60);
await page.keyboard.press('KeyX');
await page.waitForTimeout(80);
await snap('04_roundhouse');
await page.keyboard.up('ArrowDown');

// Force-jump waves cleared, then snap pickup
await page.evaluate(() => {
    const b = window.__game._beatEmUp;
    if (b) {
        b.waveIdx = (b.data?.waves?.length || 4);
        b.phase = 'clear';
        b._meleeGunPickup = { x: b.player.x + 60, y: b.player.y + b.player.h - 4 };
    }
});
await page.waitForTimeout(300);
await snap('05_gun_pickup');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

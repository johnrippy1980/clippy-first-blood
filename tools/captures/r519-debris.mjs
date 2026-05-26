// R519: verify chair-throw mechanic vs flying enemy
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r519';
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

// Wait for bark to clear
await page.waitForTimeout(2000);
await snap('01_pre_throw');

// Throw debris
await page.keyboard.press('KeyV');
await page.waitForTimeout(60);
await snap('02_throw_start');
await page.waitForTimeout(120);
await snap('03_throw_arc');
await page.waitForTimeout(180);
await snap('04_throw_fall');

// Force a helicopter to spawn and throw at it
await page.evaluate(() => {
    const b = window.__game._beatEmUp;
    if (b) {
        b.waveIdx = 2;
        b._spawnWave(2);
    }
});
await page.waitForTimeout(500);
await snap('05_helicopter_wave');

// Try jumping + jumpkick + then throw
await page.keyboard.press('KeyV');
await page.waitForTimeout(120);
await snap('06_chair_vs_chopper');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

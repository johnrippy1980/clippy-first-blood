// R566: capture stage 25 IN MOTION — boot via main-campaign entry (not
// stage-select) to verify intro card fires, then sample a few seconds of
// gameplay to see what the live enemies actually look like.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r566';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Drive _startStage(25) directly — same path the main-campaign 3→25 chain uses
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game._startStage(25);
});

// Sample every 250ms for 6s to catch intro card → ready → play
for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(250);
    const sc = await page.evaluate(() => window.__game?.scene);
    await snap(`t${String(i).padStart(2, '0')}_${sc}`);
}

// Now press X to advance past any cards and let play start
await page.keyboard.press('KeyX');
await page.waitForTimeout(400);
await page.keyboard.press('KeyX');
await page.waitForTimeout(400);

// Now in turretPlay — sample several seconds of live gameplay
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const sc = await page.evaluate(() => window.__game?.scene);
    await snap(`play_${String(i).padStart(2, '0')}_${sc}`);
    // Mash mouse to fire
    await page.mouse.move(512, 384);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
}

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();

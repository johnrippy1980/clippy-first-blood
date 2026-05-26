// R520: snap stage clear sequence at each beat
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r520';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; });
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Force stage clear sequence
await page.evaluate(() => {
    window.__game.scene = 'stageClear';
    window.__game.storyTimer = 0;
    window.__game.runStats = window.__game.runStats || {};
    window.__game.stageStats = { kills: 14, deaths: 0, damageTaken: 0, secrets: 1, weaponDamage: {}, shotsFired: 22 };
    window.__game.totalTime = 480;
});

// Snap at key beats
for (const t of [10, 60, 105, 150, 220, 320]) {
    await page.evaluate((tt) => { window.__game.storyTimer = tt; }, t);
    await page.waitForTimeout(120);
    await snap(`beat_${String(t).padStart(3, '0')}f`);
}

console.log('done');
await browser.close();

// R532: verify CRTRON boss intro card renders
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r532';
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

// Skip stage intro
for (let i = 0; i < 5; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'turretPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Force boss-intro scene
await page.evaluate(() => {
    window.__game.scene = 'bossIntro';
    window.__game._bossIntro = { age: 0, done: false };
    window.__game.currentStage = 25;
});

for (const age of [0, 30, 80, 130]) {
    await page.evaluate((a) => { window.__game._bossIntro.age = a; }, age);
    await page.waitForTimeout(100);
    await snap(`boss_age_${String(age).padStart(3,'0')}`);
}

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

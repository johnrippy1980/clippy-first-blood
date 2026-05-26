// R521: snap boss intro card at key beats
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r521';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; });
await page.evaluate(() => window.__game._startStage(4));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}

// Force boss intro
await page.evaluate(() => {
    window.__game.scene = 'bossIntro';
    window.__game._bossIntro = { age: 0, done: false };
});

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

for (const age of [0, 30, 70, 110, 130, 150]) {
    await page.evaluate((a) => { window.__game._bossIntro.age = a; }, age);
    await page.waitForTimeout(80);
    await snap(`age_${String(age).padStart(3, '0')}`);
}

console.log('done');
await browser.close();

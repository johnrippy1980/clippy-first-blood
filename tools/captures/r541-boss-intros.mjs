// R541: snap boss intro cards for stages I haven't audited
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r541';
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

async function snapBossIntro(stage, label) {
    await page.evaluate((s) => window.__game._startStage(s), stage);
    await page.waitForTimeout(2000);
    // Skip stage card if any
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(150);
    }
    // Force-fire boss intro
    await page.evaluate((s) => {
        window.__game.scene = 'bossIntro';
        window.__game._bossIntro = { age: 80, done: false };
        window.__game.currentStage = s;
    }, stage);
    await page.waitForTimeout(200);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

await snapBossIntro(11, '01_clippy2');
await snapBossIntro(12, '02_gauntlet');
await snapBossIntro(13, '03_algorithm');
await snapBossIntro(18, '04_jobs');
await snapBossIntro(22, '05_mecha_gates');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();

// R512: snap each unique boss for variety audit
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r512';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; });

// For each stage with a unique boss, spawn boss directly and snap mid-fight
const targets = [
    { stage: 1, label: '01_copier' },
    { stage: 2, label: '02_shredder' },
    { stage: 3, label: '03_ctrl_alt_del' },
    { stage: 4, label: '04_spindler' },
    { stage: 5, label: '05_ballmer' },
    { stage: 8, label: '06_gates' },
    { stage: 11, label: '07_clippy_2' },
    { stage: 13, label: '08_algorithm' },
    { stage: 16, label: '09_spindler_wheelchair' },
    { stage: 18, label: '10_jobs' },
    { stage: 21, label: '11_helicopter' },
    { stage: 22, label: '12_mecha_gates' },
];

for (const t of targets) {
    await page.evaluate((id) => window.__game._startStage(id), t.stage);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s && (s.endsWith('Play') || s === 'play')) break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    // Try to skip directly to boss for platformer stages
    await page.evaluate(() => {
        const g = window.__game;
        // Platformer: spawn boss now
        if (g.enemies && g.spawnBoss) {
            g.spawnBoss();
        }
    });
    await page.waitForTimeout(2000);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${t.label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log('snapped', t.label);
}

console.log('done');
await browser.close();

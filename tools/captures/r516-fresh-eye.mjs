// R516: fresh-eye audit — snap one representative frame from each engine
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r516';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; });

async function snapStage(id, label, holdMs = 2500) {
    await page.evaluate((s) => window.__game._startStage(s), id);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'beatPlay' || s === 'fpsPlay' || s === 'doomPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(holdMs);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log(label, 'done');
}

// Platformer stages — early/mid/late
await snapStage(1,  '01_jungle_pf');
await snapStage(4,  '02_pipeline_pf');
await snapStage(10, '03_gates_pf');
await snapStage(13, '04_cloud_pf');
// Beat-em-up
await snapStage(7,  '05_ballmer_beat');
await snapStage(22, '06_mecha_gates_beat');
// FPS
await snapStage(6,  '07_ballmer_fps');
// Doom
await snapStage(23, '08_block_11_doom');

console.log('done');
await browser.close();

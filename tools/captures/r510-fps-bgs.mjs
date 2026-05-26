// R510: verify each FPS stage's painted bgs load + the per-segment variety reads
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r510';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; });

// Stage 6 — Ballmer FPS
async function snapFps(stageId, label) {
    await page.evaluate((id) => window.__game._startStage(id), stageId);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(400);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

await snapFps(6, '01_ballmer_seg0');
// Skip ahead into later segments by killing some enemies + advancing wave
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    if (a) { a.segment = 1; a._refreshBg(); }
});
await page.waitForTimeout(500);
let u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/02_ballmer_seg1.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    if (a) { a.segment = 2; a._refreshBg(); }
});
await page.waitForTimeout(500);
u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/03_ballmer_seg2.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Gates stage 10 + Spindler stage 13
await snapFps(9, '04_gates_fps');
await snapFps(19, '05_spindler_fps');

console.log('done');
await browser.close();

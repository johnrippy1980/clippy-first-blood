// R534: verify S1 (stage 14) clear flow when entered via stage select
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r534';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
// Simulate stage-select entry (game cleared)
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(14));
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

// Force-clear the stage
await page.evaluate(() => { window.__game._onStageClear(); });
await page.waitForTimeout(200);
await page.evaluate(() => { window.__game.storyTimer = 200; });
await page.waitForTimeout(200);
await snap('01_clear_panel');

// Press X to advance past clear panel
await page.keyboard.press('KeyX');
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.__game?.scene);
console.log('after X:', after);
await snap('02_after_X');

// Should be on stage card (painted recyclebin) — give it time to settle
await page.waitForTimeout(400);
await snap('03_recyclebin_card');
// Press X to dismiss
await page.keyboard.press('KeyX');
await page.waitForTimeout(800);
const after2 = await page.evaluate(() => window.__game?.scene);
console.log('after dismiss:', after2);
await snap('04_after_dismiss');

await browser.close();

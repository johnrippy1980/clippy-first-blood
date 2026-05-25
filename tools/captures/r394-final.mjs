// R394: verify stage 22 → card_mecha_victory → GAME_COMPLETE chain.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r394';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);

await page.evaluate(() => window.__game._startStage(22));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Kill all enemies + force clear
await page.evaluate(() => {
    const g = window.__game;
    const beat = g._beatEmUp;
    if (!beat) return;
    for (const e of beat.enemies) e.alive = false;
    beat.phase = 'clear';
    beat.clearT = 0;
});

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (!dataUrl) return;
    await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(400);
    await snap(`final_${String(i).padStart(2,'0')}`);
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'stageCard' || s === 'gameComplete' || s === 'epilogue') {
        await page.keyboard.press('KeyX');
    }
}

const diag = await page.evaluate(() => ({
    scene: window.__game?.scene,
}));
console.log('after final:', JSON.stringify(diag));
console.log('errs:', errs.length);
await browser.close();

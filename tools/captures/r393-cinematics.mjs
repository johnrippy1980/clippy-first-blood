// R393: trigger stage-20 clear → 21 cinematic chain. Verify the
// card_chopper_horizon plays between them. Also test 22 → game complete
// → card_mecha_victory.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r393_cin';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);

// Test the 20→21 transition: stage 20, force-clear via wave bypass
await page.evaluate(() => window.__game._startStage(20));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Force the beat engine into "clear" phase
await page.evaluate(() => {
    const g = window.__game;
    const beat = g._beatEmUp;
    if (!beat) return;
    // Kill all enemies
    for (const e of beat.enemies) e.alive = false;
    // Force phase to clear
    beat.phase = 'clear';
    beat.clearT = 0;
});

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (!dataUrl) return;
    await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Snap stage clear progression
for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400);
    await snap(`s20clear_${String(i).padStart(2,'0')}`);
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'stageCard' || s === 'stageIntro' || s === 'story') {
        // Press X to advance through cards
        await page.keyboard.press('KeyX');
    }
}

const diag = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        stage: g.currentStage,
        extraCards: g._extraCards,
    };
});
console.log('after clear:', JSON.stringify(diag));
console.log('errs:', errs.length);
await browser.close();

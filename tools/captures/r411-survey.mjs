// R411: post-deploy survey — full play of stage 20, stage 22, stage 21
// with the new jump + crater bg + painted fires. Find next issues.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r411';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

async function playStage(stage, label) {
    await page.evaluate((n) => window.__game._startStage(n), stage);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'beatPlay' || s === 'play' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.evaluate(() => {
        const g = window.__game;
        if (g.player) g.player.invuln = 99999;
        if (g._beatEmUp?.player) g._beatEmUp.player.iframes = 999999;
    });
    await page.waitForTimeout(500);
    await snap(`${label}_open`);
    // Walk right + shoot
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('KeyX');
    await page.waitForTimeout(1500);
    await snap(`${label}_walk`);
    // Try jump
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(200);
    await snap(`${label}_jump1`);
    await page.waitForTimeout(200);
    await snap(`${label}_jump2`);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('KeyX');
    // Snap with embers visible
    await page.waitForTimeout(500);
    await snap(`${label}_settled`);
}

await playStage(20, 's20');
await playStage(22, 's22');
await playStage(21, 's21');

console.log('errs:', errs.length);
errs.slice(0, 5).forEach(e => console.log('  ', e.substring(0, 200)));
await browser.close();

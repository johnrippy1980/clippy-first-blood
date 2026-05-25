// R390: simulate real play of stages 1, 2, 3 with the player walking
// right and shooting. Snap multiple frames per stage to see live combat.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r390';
await fs.mkdir(OUT, { recursive: true });

async function playStage(stageNum, label) {
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
    await page.evaluate((n) => window.__game._startStage(n), stageNum);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 10; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(800);
    // Make invuln so we survive
    await page.evaluate(() => { if (window.__game?.player) window.__game.player.invuln = 99999; });

    async function snap(name) {
        const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
        if (!dataUrl) return;
        await fs.writeFile(`${OUT}/${label}_${name}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }

    // Walk + shoot
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('KeyX');
    await snap('a_start');
    for (let i = 1; i <= 5; i++) {
        await page.waitForTimeout(800);
        await snap(`b_walk${i}`);
    }
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('KeyX');
    await page.waitForTimeout(400);
    // Jump test
    await page.keyboard.down('ArrowRight');
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(300);
    await snap('c_jump');
    await page.keyboard.up('ArrowRight');

    console.log(`${label} done, errs=${errs.length}`);
    if (errs.length) errs.slice(0,2).forEach(e => console.log(' ', e.substring(0,150)));
    await browser.close();
}

await playStage(1, 's01');
await playStage(2, 's02');
await playStage(3, 's03');
await playStage(11, 's11');

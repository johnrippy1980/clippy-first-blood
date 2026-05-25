// R387: grade-the-game pass — snap each stage at multiple points so
// we can see what looks rough end-to-end.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r387';
await fs.mkdir(OUT, { recursive: true });

async function snap(name, stageNum) {
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
    // Mash X until we're in play state
    for (let i = 0; i < 12; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'beatPlay' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1500);
    async function shot(label) {
        const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
        if (!dataUrl) return;
        await fs.writeFile(`${OUT}/${name}_${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
    await shot('open');
    // Move
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowRight');
    await shot('mid');
    const diag = await page.evaluate(() => {
        const g = window.__game;
        return {
            scene: g.scene,
            level: !!g.level,
            beat: !!g._beatEmUp,
            fps: !!g._fpsArena,
            ambient: g._ambientProps?.props?.length || 0,
        };
    });
    console.log(`${name}:`, JSON.stringify(diag));
    if (errs.length) console.log('  errs:', errs.slice(0,2).map(e=>e.substring(0,160)));
    await browser.close();
}

// Sample every stage 1-22
for (let i = 1; i <= 22; i++) {
    await snap(`s${String(i).padStart(2,'0')}`, i);
}

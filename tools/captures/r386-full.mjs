// R386: full pass through 20/21/22 to see current quality post-fix.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r386f';
await fs.mkdir(OUT, { recursive: true });

async function snap(name, stageNum, midShots = 3) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await page.click('#screen');
    await page.waitForTimeout(500);
    await page.evaluate((n) => window.__game._startStage(n), stageNum);
    await page.waitForTimeout(1500);
    // Skip any intro
    for (let i = 0; i < 8; i++) {
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(800);
    async function canvasShot(label) {
        const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
        if (!dataUrl) return;
        await fs.writeFile(`${OUT}/${name}_${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
    await canvasShot('open');
    for (let i = 0; i < midShots; i++) {
        // Walk: hold right
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(800);
        await page.keyboard.up('ArrowRight');
        await canvasShot(`mid${i}`);
    }
    // For beatem stages: force final wave
    await page.evaluate(() => {
        const g = window.__game;
        const beat = g._beatEmUp;
        if (beat) {
            beat.scroll = (beat.data.stageWidth || 1024) - 256;
            beat.waveIdx = 6;
            if (beat._spawnWave) beat._spawnWave(6);
        }
    });
    await page.waitForTimeout(1500);
    await canvasShot('boss');
    const diag = await page.evaluate(() => {
        const g = window.__game;
        return {
            scene: g.scene,
            beatEnemies: g._beatEmUp?.enemies?.length || 0,
            beatTypes: g._beatEmUp?.enemies?.map(e => e.type),
            bossType: g._beatEmUp?._boss?.type,
            ambientCount: g._ambientProps?.props?.length || 0,
        };
    });
    console.log(`${name}:`, JSON.stringify(diag));
    if (errs.length) console.log(`  errs:`, errs.slice(0,2).map(e=>e.substring(0,150)));
    await browser.close();
}

await snap('s20', 20);
await snap('s21', 21);
await snap('s22', 22);

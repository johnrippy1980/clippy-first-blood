// R386: audit stages 20 (Mecha Approach beatem), 21 (Helicopter chase
// platformer), 22 (Mecha-Gates beatem final). Snap each at multiple
// points in the level — opening, mid, near-boss, boss-active — to see
// what's actually broken.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r386';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(200);

async function snapStage(stageNum, label) {
    await page.evaluate((n) => window.__game._startStage(n), stageNum);
    await page.waitForTimeout(800);
    // Skip intros
    for (let i = 0; i < 30; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'beatPlay' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);
    const scene = await page.evaluate(() => window.__game?.scene);
    // Opening
    await page.screenshot({ path: `${OUT}/${label}_open.png` });
    // For beatem: advance scroll incrementally. For platformer: walk right.
    if (scene === 'beatPlay') {
        for (let chunk = 0; chunk < 4; chunk++) {
            await page.evaluate((c) => {
                const g = window.__game; const beat = g._beatEmUp; if (!beat) return;
                const total = beat.data.stageWidth || 1024;
                beat.scroll = Math.floor(total * (c / 4));
                beat.waveIdx = c;
                if (beat._spawnWave) beat._spawnWave(c);
            }, chunk + 1);
            await page.waitForTimeout(800);
            await page.screenshot({ path: `${OUT}/${label}_mid${chunk}.png` });
        }
        // Push to boss wave
        await page.evaluate(() => {
            const g = window.__game; const beat = g._beatEmUp; if (!beat) return;
            const total = beat.data.stageWidth || 1024;
            beat.scroll = total - 256;
            beat.waveIdx = 6;
            if (beat._spawnWave) beat._spawnWave(6);
        });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/${label}_boss.png` });
    } else if (scene === 'play') {
        // Platformer: walk right via teleport then snap
        for (let chunk = 0; chunk < 4; chunk++) {
            await page.evaluate((c) => {
                const g = window.__game;
                if (!g.level) return;
                const target = (g.level.width - 32) * (c + 1) / 5;
                g.player.x = target;
                g.player.invuln = 99999;
                if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
            }, chunk);
            await page.waitForTimeout(400);
            await page.screenshot({ path: `${OUT}/${label}_mid${chunk}.png` });
        }
        // Trigger boss
        await page.evaluate(() => {
            const g = window.__game;
            if (g.level?.data?.bossTrigger) {
                g.player.x = g.level.data.bossTrigger.x + 4;
                if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
                if (g._spawnBoss) g._spawnBoss();
                if (g._bossIntro) g._bossIntro.autoAdvance = true;
            }
        });
        await page.waitForTimeout(500);
        for (let i = 0; i < 25; i++) {
            const s = await page.evaluate(() => window.__game?.scene);
            if (s === 'play') break;
            await page.keyboard.press('KeyX');
            await page.waitForTimeout(120);
        }
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${OUT}/${label}_boss.png` });
    }
    const diag = await page.evaluate(() => {
        const g = window.__game;
        const beat = g._beatEmUp;
        const ap = g._ambientProps;
        return {
            scene: g.scene,
            stage: g.currentStage,
            ambientKinds: ap?.props?.map(p => p.kind) || [],
            beatEnemies: beat?.enemies?.length || 0,
            beatEnemyTypes: beat?.enemies?.map(e => e.type) || [],
            beatBossHp: beat?._boss?.hp,
            beatBossType: beat?._boss?.type,
            beatScroll: beat?.scroll,
            beatStageW: beat?.data?.stageWidth,
            beatBgKey: beat?.data?.bgKey,
            bossKind: g.boss?.kind,
            bossHp: g.boss?.hp,
        };
    });
    return diag;
}

const r20 = await snapStage(20, 's20');
console.log('s20 (Mecha Approach):', JSON.stringify(r20));
const r21 = await snapStage(21, 's21');
console.log('s21 (Helicopter):', JSON.stringify(r21));
const r22 = await snapStage(22, 's22');
console.log('s22 (Mecha-Gates final):', JSON.stringify(r22));
console.log(`Errors (${errs.length}):`);
errs.slice(0, 5).forEach(e => console.log('  ', e));
await browser.close();

// R388: snap every platformer boss arena. Each stage gets its own
// fresh browser, walks the player to bossTrigger, force-spawns, snaps.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r388';
await fs.mkdir(OUT, { recursive: true });

// Stages that have boss arenas (platformer mode bosses)
const STAGES = [
    { n: 1,  name: 'copier' },
    { n: 2,  name: 'shredder' },
    { n: 3,  name: 'cad' },
    { n: 4,  name: 'spindler' },
    { n: 5,  name: 'ballmer' },
    { n: 10, name: 'gates_arena' },
    { n: 11, name: 'clippy2' },
    { n: 13, name: 'algorithm' },
    { n: 21, name: 'helicopter_chase' },
];

async function bossSnap(stage) {
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
    await page.evaluate((n) => window.__game._startStage(n), stage.n);
    await page.waitForTimeout(2200);
    // Skip intros
    for (let i = 0; i < 8; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'beatPlay' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(250);
    }
    // Walk + spawn boss
    await page.evaluate(() => {
        const g = window.__game;
        if (!g.level || !g.player) return;
        g.player.invuln = 99999;
        if (g.level.data?.bossTrigger) {
            g.player.x = g.level.data.bossTrigger.x + 4;
            if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
            g._spawnBoss();
            if (g._bossIntro) g._bossIntro.autoAdvance = true;
        }
    });
    await page.waitForTimeout(700);
    // Skip boss intro
    for (let i = 0; i < 12; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(150);
    }
    await page.waitForTimeout(2500);
    async function shot(label) {
        const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
        if (!dataUrl) return;
        await fs.writeFile(`${OUT}/${stage.name}_${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
    await shot('boss');
    // Mid-fight snap — give the boss a moment to do something
    await page.waitForTimeout(2500);
    await shot('mid');
    const diag = await page.evaluate(() => {
        const g = window.__game;
        return {
            scene: g.scene,
            bossKind: g.boss?.kind,
            bossHp: g.boss?.hp,
            bossX: g.boss?.x,
            bossY: g.boss?.y,
            bossW: g.boss?.w,
            bossH: g.boss?.h,
            playerX: g.player?.x,
            arenaX: g._bossLair?.arenaX,
            arenaW: g._bossLair?.arenaW,
            arenaBg: g._bossLair?.spec?.arenaBg,
            bgKey: g.parallax?.bgKeyOverride,
        };
    });
    console.log(`${stage.name}:`, JSON.stringify(diag));
    if (errs.length) console.log('  errs:', errs.slice(0,2).map(e => e.substring(0,160)));
    await browser.close();
}

for (const s of STAGES) {
    await bossSnap(s);
}

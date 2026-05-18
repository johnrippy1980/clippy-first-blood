// Generic stage traversal probe. For each stage 1..9, walk the player right
// with jump+climb assist and report stalled columns.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const results = [];
for (let stage = 1; stage <= 9; stage++) {
    await page.evaluate((s) => {
        const g = window.__game;
        g._startStage(s);
        g.scene = 'play';
        g.transition = 0;
        g.player.iFrames = 99999;
    }, stage);
    await page.waitForTimeout(400);

    await page.keyboard.down('ArrowRight');
    let lastX = -1, sameCount = 0, stuckAt = null, finalX = 0;
    const widthTiles = await page.evaluate(() => window.__game.level.data.width);
    for (let i = 0; i < 80; i++) {
        const state = await page.evaluate(() => ({
            x: window.__game.player.x | 0,
            grounded: !!window.__game.player.onGround,
            scene: window.__game.scene,
        }));
        finalX = state.x;
        if (state.scene !== 'play') break;     // hit boss/stage-clear
        if (state.x === lastX) {
            sameCount++;
            if (sameCount >= 2) {
                await page.keyboard.down('ArrowUp');
                await page.waitForTimeout(60);
                await page.keyboard.up('ArrowUp');
                await page.keyboard.press('z');
                await page.waitForTimeout(60);
                await page.keyboard.press('z');
            }
            if (sameCount >= 15) {
                stuckAt = state.x;
                break;
            }
        } else {
            sameCount = 0;
            lastX = state.x;
        }
        await page.waitForTimeout(80);
    }
    await page.keyboard.up('ArrowRight');
    const widthPx = widthTiles * 16;
    const progress = (finalX / widthPx * 100).toFixed(0);
    const stuckTile = stuckAt != null ? (stuckAt / 16).toFixed(1) : null;
    results.push({ stage, finalX, progress, stuckAt, stuckTile, widthTiles });
    console.log(`stage ${stage}: ${stuckAt != null ? `STUCK @ x=${stuckAt} (tile ${stuckTile})` : 'OK'}; progress ${progress}% (${finalX}/${widthPx})`);
}

await browser.close();
console.log('\nSUMMARY:');
for (const r of results) {
    console.log(`  stage ${r.stage}: ${r.stuckAt != null ? 'STUCK at tile ' + r.stuckTile : 'completed ' + r.progress + '%'}`);
}
console.log('ERRORS:', errors.length);

// R260: verify Stage 9 ceiling shelves render where placed.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r260', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

// Jump to Secret Recycle Bin (loader index 10 — that's makeStage9)
await page.evaluate(() => {
    window.__game._startStage(10);
    window.__game.scene = 'play';
    window.__game._stageIntro = null;
    window.__game._bossIntro = null;
    window.__game._bossEntrance = null;
});
await page.waitForTimeout(400);

// Dismiss the stage card with X taps
await page.focus('#screen');
for (let i = 0; i < 6; i++) {
    await page.keyboard.down('x');
    await page.waitForTimeout(80);
    await page.keyboard.up('x');
    await page.waitForTimeout(300);
}
await page.waitForTimeout(400);

// Pan camera through the stage — natural rAF advances after each jump
const positions = [8 * 16, 20 * 16, 36 * 16, 50 * 16];
for (let i = 0; i < positions.length; i++) {
    await page.evaluate((px) => {
        window.__game.player.x = px;
        window.__game.camera.x = px - 128;
        window.__game.camera.targetX = px - 128;
    }, positions[i]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/r260/stage9-pan-${i}.png` });
}

// Probe the level data
const probe = await page.evaluate(() => {
    const lvl = window.__game.level.data;
    const pickups = lvl.pickupSpawns.filter(p => p.y < 50);  // ceiling tier
    return {
        width: lvl.width,
        height: lvl.height,
        ceilingPickups: pickups,
    };
});
console.log(JSON.stringify(probe, null, 2));
console.log('Errors:', errs.length);
await browser.close();

// R260: visual capture of Stage 3 ceiling-duct layer.
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
await page.waitForTimeout(600);

await page.evaluate(() => {
    window.__game._startStage(3);
    window.__game.scene = 'play';
    window.__game._stageIntro = null;
    window.__game._bossIntro = null;
    window.__game._bossEntrance = null;
});

// Dismiss any modals
await page.focus('#screen');
for (let i = 0; i < 6; i++) {
    await page.keyboard.down('x');
    await page.waitForTimeout(80);
    await page.keyboard.up('x');
    await page.waitForTimeout(250);
}

// Pan to the three ceiling shelves
const positions = [
    { x: 15 * 16, label: 'duct-1' },
    { x: 42 * 16, label: 'duct-2' },
    { x: 71 * 16, label: 'duct-3' },
];
for (const pos of positions) {
    await page.evaluate((px) => {
        window.__game.player.x = px;
        window.__game.player.y = 16;  // up near ceiling
        window.__game.camera.x = px - 128;
        window.__game.camera.targetX = px - 128;
        window.__game.camera.y = 0;
        window.__game.camera.targetY = 0;
    }, pos.x);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/r260/stage3-${pos.label}.png` });
}

console.log('Errors:', errs.length);
await browser.close();

// R260: verify Stage 1 canopy layer renders + pickups load.
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

// Boot through title + story + stage card + READY
await page.focus('#screen');
for (let i = 0; i < 14; i++) {
    await page.keyboard.down('x');
    await page.waitForTimeout(80);
    await page.keyboard.up('x');
    await page.waitForTimeout(400);
}

// Should be in stage 1 now
await page.waitForTimeout(500);

const probe = await page.evaluate(() => ({
    scene: window.__game.scene,
    stage: window.__game.currentStage,
    width: window.__game.level?.data?.width,
    height: window.__game.level?.data?.height,
    canopyPickups: (window.__game.level?.data?.pickupSpawns || []).filter(p => p.y < 50),
}));

console.log(JSON.stringify(probe, null, 2));

// Pan camera through the canopy positions
const positions = [
    { x: 15 * 16, label: 'canopy-1-LIFE' },
    { x: 39 * 16, label: 'canopy-2-THUNDER' },
    { x: 65 * 16, label: 'canopy-3-LIFE' },
];
for (const pos of positions) {
    await page.evaluate((px) => {
        window.__game.player.x = px;
        window.__game.player.y = 32;  // float player near canopy
        window.__game.camera.x = px - 128;
        window.__game.camera.targetX = px - 128;
    }, pos.x);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/r260/stage1-${pos.label}.png` });
}

console.log('Errors:', errs.length);
await browser.close();

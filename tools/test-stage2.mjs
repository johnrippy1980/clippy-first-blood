// Smoke-test stage 2 trim: ensure it loads, player spawns on floor,
// no console errors. Capture a screenshot at start.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(2));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(400);

const info = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        width: g.level?.width,
        height: g.level?.height,
        playerX: Math.round(g.player.x),
        playerY: Math.round(g.player.y),
        bossTriggerX: g.level?.bossTrigger?.x,
        miniBossTrigger: g.level?.miniBossTrigger,
        enemyCount: g.enemies?.list?.length,
    };
});
console.log('Stage 2 state:', JSON.stringify(info));
await page.screenshot({ path: '/tmp/clippy-stage2.png' });

console.log(`Errors: ${errs.length}`);
errs.forEach(e => console.log('  ' + e));
await browser.close();

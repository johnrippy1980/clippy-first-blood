// R243: drive into stage 4 (THE PIPELINE) and snapshot. Stage 4 was added
// recently (R226) so it hasn't gotten a lot of real-input audit time.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r243', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

await page.evaluate(async () => {
    const g = window.__game;
    g._startStage(4);
    g.storyTimer = 999;
    g.scene = 'play';
    g.unlockedStage = 4;
});
// Let runtime settle through fades + intro
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/r243/01-start.png' });

// Walk right + shoot
await page.focus('#screen');
await page.keyboard.down('ArrowRight');
await page.keyboard.down('x');
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/r243/02-traversal.png' });

// Jump to test platforming
await page.keyboard.down('z');
await page.waitForTimeout(150);
await page.keyboard.up('z');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/r243/03-jumping.png' });

// Stop
await page.keyboard.up('ArrowRight');
await page.keyboard.up('x');
await page.waitForTimeout(500);

const state = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        stage: g.currentStage,
        playerX: Math.round(g.player?.x || 0),
        playerY: Math.round(g.player?.y || 0),
        playerHp: g.player?.hp,
        levelW: g.level?.width,
        levelH: g.level?.height,
        theme: g.level?.data?.theme,
        enemies: g.enemies?.enemies?.length || 0,
    };
});
console.log(JSON.stringify(state, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 5));
await browser.close();

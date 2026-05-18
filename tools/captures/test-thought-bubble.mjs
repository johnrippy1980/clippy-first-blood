// Player hides in cover near an enemy → enemy should show "WHERE'D HE GO?" bubble.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => console.log('[browser]', m.type(), m.text()));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(400);

await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(500);

// Player at cover col 19, spawn enemies nearby, then force cover state.
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.player.x = 19 * 16 - 6;
    g.player.y = (g.level.data.height - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.iFrames = 600; // make invincible for the duration of the test
    g.camera.x = Math.max(0, g.player.x - 128);

    g.enemies.enemies.length = 0;
    g.enemies.spawn(g.player.x + 80, g.player.y - 24, 'folder');
    g.enemies.spawn(g.player.x + 120, g.player.y - 16, 'folder');
    g.enemies.spawn(g.player.x - 80, g.player.y - 20, 'folder');
    for (const e of g.enemies.enemies) {
        e._grace = 0;
        e.activated = true;
    }
});
// Hold UP to enter and stay in cover
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(2000);
await page.keyboard.up('ArrowUp');
const dump = await page.evaluate(() => {
    return {
        playerState: window.__game.player.state,
        playerStateCover: window.__game.player.state === 'cover',
        enemies: window.__game.enemies.enemies.map(e => ({
            type: e.type,
            x: e.x,
            activated: e.activated,
            grace: e._grace,
            bubble: e._lostBubble,
        })),
    };
});
console.log('enemies:', JSON.stringify(dump, null, 2));
await page.screenshot({ path: '/tmp/thought-bubble.png' });
console.log('captured');
await browser.close();

// Player stands in tall grass next to an enemy → enemy should NOT fire,
// and should show a thought-bubble. Also captures the visual.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[browser err]', m.text()); });
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);

await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(500);

// Place the player INSIDE grass cluster 1 (cols 11-13, row h-3),
// spawn a folder sniper close enough to want to shoot.
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.player.x = 12 * 16;
    g.player.y = (g.level.data.height - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.iFrames = 600;
    g.camera.x = Math.max(0, g.player.x - 128);
    g.enemies.enemies.length = 0;
    g.enemies.spawn(g.player.x + 90, g.player.y - 24, 'folder');
    g.enemies.spawn(g.player.x - 90, g.player.y - 16, 'folder');
    for (const e of g.enemies.enemies) { e._grace = 0; e.activated = true; }
});
await page.waitForTimeout(2000);
const dump = await page.evaluate(() => ({
    grassHidden: window.__game.player.grassHidden,
    waterHidden: window.__game.player.waterHidden,
    enemies: window.__game.enemies.enemies.map(e => ({
        type: e.type,
        bubble: e._lostBubble ? e._lostBubble.text : null,
    })),
}));
console.log('state:', JSON.stringify(dump, null, 2));
await page.screenshot({ path: '/tmp/grass-cover.png' });

// Move player OUT of grass to col 16 (between clusters) — enemies should re-engage.
await page.evaluate(() => {
    window.__game.player.x = 16 * 16;
});
await page.waitForTimeout(400);
const out = await page.evaluate(() => ({
    grassHidden: window.__game.player.grassHidden,
}));
console.log('out of grass:', JSON.stringify(out));
await page.screenshot({ path: '/tmp/grass-out.png' });

await browser.close();

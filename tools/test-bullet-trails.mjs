// Force-spawn enemies + bullets to confirm trail render.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);

await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(700);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.player.x = 100;
    g.player.y = (g.level.data.height - 4) * 16;
    g.camera.x = 0;
    // Spawn 4 holepunch snipers close and ABOVE player so projectiles fly down diagonally.
    g.enemies.spawn(g.player.x + 30,  g.player.y - 60, 'holepunch');
    g.enemies.spawn(g.player.x + 80,  g.player.y - 80, 'holepunch');
    g.enemies.spawn(g.player.x + 130, g.player.y - 60, 'holepunch');
    g.enemies.spawn(g.player.x + 180, g.player.y - 90, 'holepunch');
    // Skip the activation grace so they fire immediately
    for (const e of g.enemies.enemies) e._grace = 0;
});
await page.waitForTimeout(1800);
// Log bullet count before screenshot
const cnt = await page.evaluate(() => window.__game.enemies.bullets.length);
console.log('bullets in flight:', cnt);
await page.screenshot({ path: '/tmp/bullet-trails.png' });
console.log('saved /tmp/bullet-trails.png');
await browser.close();

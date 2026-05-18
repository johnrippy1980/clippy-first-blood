// Test that the player can jump and land on platform tiles (one-way platforms).
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__game.scene = 'play'; });

// Clear all enemies and teleport Clippy directly under platform at (col 9, row 10)
// Stage 1 has plat(10, 8, 4) — a 4-tile platform spanning cols 8-11 at row 10
await page.evaluate(() => {
    const g = window.__game;
    g.enemies.enemies.length = 0;
    g.enemies.bullets.length = 0;
    g.player.x = 9 * 16;
    g.player.y = (14 - 4) * 16; // standing on floor
    g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    g.player.state = 'idle';
});
await page.waitForTimeout(150);

// Jump straight up
await page.keyboard.down('KeyZ');
await page.waitForTimeout(80);
await page.keyboard.up('KeyZ');

// Watch state for 2 seconds
const samples = [];
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const s = await page.evaluate(() => {
        const g = window.__game;
        return {
            x: g.player.x.toFixed(1),
            y: g.player.y.toFixed(1),
            vy: g.player.vy.toFixed(2),
            onGround: g.player.onGround,
            state: g.player.state,
        };
    });
    samples.push(s);
}
console.log('Frames:');
samples.forEach((s, i) => console.log(`  t=${i*100}ms`, JSON.stringify(s)));
await page.screenshot({ path: '/tmp/clippy-platform.png' });
await browser.close();

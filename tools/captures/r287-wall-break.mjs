// R287: verify breakable walls take damage from bullets.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

await page.evaluate(() => {
    window.__game._startStage(1);
});
await page.waitForTimeout(1500);
for (let i = 0; i < 8; i++) {
    await page.keyboard.down('x'); await page.waitForTimeout(60); await page.keyboard.up('x');
    await page.waitForTimeout(400);
}

const result = await page.evaluate(() => {
    const g = window.__game;
    if (g.scene !== 'play') return { error: 'not in play, scene=' + g.scene };
    const walls = g.pickups?.walls || [];
    if (walls.length === 0) return { error: 'no walls on stage 1' };
    const wall = walls[0];
    const hpBefore = wall.hp;
    // Spawn a bullet inside the wall and tick
    g.player.bullets.push({
        x: wall.x + 4, y: wall.y + 4,
        prevX: wall.x + 4, prevY: wall.y + 4,
        vx: 0, vy: 0,
        damage: 1,
        weapon: 'MG',
        life: 60,
        color: '#fff',
        hits: new Set(),
    });
    wall.update(g.level, g.player);
    const hpAfter = wall.hp;
    return { hpBefore, hpAfter, took: hpBefore - hpAfter, hitFlash: wall.hitFlash };
});

console.log('Wall damage test:', JSON.stringify(result));
console.log(result.took > 0 ? '✓ Wall takes damage' : '✗ Wall NOT damaged');
await browser.close();

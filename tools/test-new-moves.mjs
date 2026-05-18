// Verify: double jump reaches higher than single, and forward dash attack damages enemies.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__game.scene = 'play'; });

// === Double jump test ===
await page.evaluate(() => {
    const g = window.__game;
    g.enemies.enemies.length = 0;
    g.enemies.bullets.length = 0;
    g.player.x = 9 * 16;
    g.player.y = (14 - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    g.player.state = 'idle';
});
await page.waitForTimeout(150);

const startY = await page.evaluate(() => window.__game.player.y);
// First jump
await page.keyboard.down('KeyZ');
await page.waitForTimeout(60);
await page.keyboard.up('KeyZ');
await page.waitForTimeout(150);
// Second jump (in air)
await page.keyboard.down('KeyZ');
await page.waitForTimeout(40);
await page.keyboard.up('KeyZ');
await page.waitForTimeout(150);

let minYDouble = Infinity;
for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(30);
    const y = await page.evaluate(() => window.__game.player.y);
    if (y < minYDouble) minYDouble = y;
}
console.log('Single jump start y:', startY, '/ Double-jump apex y:', minYDouble.toFixed(1));
await page.screenshot({ path: '/tmp/clippy-doublejump.png' });

// === Dash attack test ===
await page.evaluate(() => {
    const g = window.__game;
    g.enemies.enemies.length = 0;
    g.enemies.bullets.length = 0;
    g.player.x = 9 * 16;
    g.player.y = (14 - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    g.player.state = 'idle';
    // Spawn a stapler right in front of the player
    g.enemies.spawn(11 * 16, (14 - 3) * 16, 'stapler');
});
await page.waitForTimeout(200);

const beforeKills = await page.evaluate(() => window.__game.player.kills);

// Double-tap right
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(50);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(50);
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(50);
await page.keyboard.up('ArrowRight');

// Sample state during dash
await page.waitForTimeout(60);
const midDash = await page.evaluate(() => ({
    state: window.__game.player.state,
    vx: window.__game.player.vx.toFixed(2),
    dashHits: window.__game.player.dashAtkHits ? window.__game.player.dashAtkHits.size : null,
}));
console.log('Mid-dash:', JSON.stringify(midDash));
await page.screenshot({ path: '/tmp/clippy-dashattack.png' });

await page.waitForTimeout(400);
const afterKills = await page.evaluate(() => window.__game.player.kills);
console.log(`Kills before dash: ${beforeKills}, after dash: ${afterKills}`);

console.log(`Errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e));
await browser.close();

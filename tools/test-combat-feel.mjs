// Hold X + walk right for 5s, sample 6 frames across the encounter.
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
await page.mouse.move(900, 384);
await page.keyboard.down('KeyX');
await page.keyboard.down('ArrowRight');
for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `/tmp/clippy-combat-${i}.png` });
}
await page.keyboard.up('KeyX');
await page.keyboard.up('ArrowRight');

const state = await page.evaluate(() => {
    const g = window.__game;
    return {
        kills: g.player.kills,
        hp: g.player.hp,
        x: g.player.x,
        score: g.player.score,
        enemies: g.enemies.enemies.length,
        bullets: g.player.bullets.length,
        enemyBullets: g.enemies.bullets.length,
    };
});
console.log('After 4.8s:', JSON.stringify(state));
console.log(`Errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e));
await browser.close();

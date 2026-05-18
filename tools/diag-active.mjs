// Active playtest: player runs right + shoots constantly. Verify enemies fall.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(200);

// Move right slowly + shoot frequently
await page.keyboard.down('ArrowRight');
for (let i = 0; i < 16; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(120);
}
await page.keyboard.up('ArrowRight');

const s = await page.evaluate(() => {
    const g = window.__game;
    return {
        hp: g.player.hp,
        x: Math.round(g.player.x),
        kills: g.player.kills,
        score: g.player.score,
        aliveEnemies: g.enemies.enemies.filter(e => e.alive).length,
    };
});
console.log('after active run:', JSON.stringify(s));
await page.screenshot({ path: '/tmp/active-playtest.png' });
await browser.close();

// Drive stage 1 for ~5s of gameplay to check for runtime errors + visual regressions.
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
await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.scene = 'play'; });

// Move right + fire for ~3s
await page.keyboard.down('ArrowRight');
for (let i = 0; i < 6; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(400);
}
await page.keyboard.up('ArrowRight');

// Jump
await page.keyboard.press('KeyZ');
await page.waitForTimeout(200);
await page.keyboard.press('KeyZ');  // double jump
await page.waitForTimeout(300);

await page.screenshot({ path: '/tmp/clippy-playthrough.png' });

const state = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        playerX: Math.round(g.player.x),
        playerY: Math.round(g.player.y),
        hp: g.player.hp,
        score: g.player.score,
        kills: g.player.kills,
        bullets: g.player.bullets?.length || 0,
        enemyCount: g.enemies?.list?.length,
    };
});
console.log('After 3s play:', JSON.stringify(state));
console.log(`Errors: ${errs.length}`);
errs.forEach(e => console.log('  ' + e));
await browser.close();

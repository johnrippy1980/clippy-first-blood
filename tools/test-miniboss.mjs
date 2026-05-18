// Verify mini-boss spawns mid-stage and clears without ending the stage.
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

// Teleport across the mini-boss trigger (x = 30 tiles = 480px)
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 32 * 16;
    g.player.y = (14 - 4) * 16;
});
await page.waitForTimeout(500);

const mid = await page.evaluate(() => {
    const g = window.__game;
    return {
        miniSpawned: g.miniBossSpawned,
        bossSpawned: g.bossSpawned,
        scene: g.scene,
        boss: g.boss?.name || null,
        mini: g.enemies.activeMiniBoss()?.name || null,
        miniHp: g.enemies.activeMiniBoss()?.hp ?? null,
    };
});
console.log('After mini-boss trigger:', JSON.stringify(mid));
await page.screenshot({ path: '/tmp/clippy-miniboss.png' });

// Kill the mini-boss
await page.evaluate(() => {
    const mb = window.__game.enemies.activeMiniBoss();
    if (mb) { mb.hp = 0; mb.alive = false; }
});
await page.waitForTimeout(300);

const after = await page.evaluate(() => {
    const g = window.__game;
    return {
        miniAlive: g.enemies.activeMiniBoss()?.alive ?? false,
        scene: g.scene,
        bossSpawned: g.bossSpawned,
    };
});
console.log('After mini-boss death:', JSON.stringify(after));

console.log(`Errors: ${errs.length}`);
errs.forEach(e => console.log('  ' + e));
await browser.close();

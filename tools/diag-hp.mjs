// Diagnose where HP loss comes from. Stage 1 idle, no movement, no shooting.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.scene = 'play'; });
// Check grace values immediately after spawn
const initialGraces = await page.evaluate(() => {
    return window.__game.enemies.enemies.map(e => ({ t: e.type, x: Math.round(e.x), grace: e._grace, active: e.activated }));
});
console.log('initial:', JSON.stringify(initialGraces));

// Sample HP every 500ms for 5s without moving
for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
        const g = window.__game;
        // The real enemy list is at g.enemies.enemies (EnemyManager.enemies),
        // not g.enemies.list. Capture it correctly.
        const enemies = g.enemies?.enemies || [];
        return {
            tick: g.frameCount,
            hp: g.player.hp,
            x: Math.round(g.player.x),
            y: Math.round(g.player.y),
            iFrames: g.player.iFrames,
            enemies: enemies.slice(0, 4).map(e => ({ type: e.type, x: Math.round(e.x), hp: e.hp, alive: e.alive, grace: e._grace, active: e.activated }))
        };
    });
    console.log(JSON.stringify(s));
}

await browser.close();

// Verify swamp areas have grunts + pickups around them.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.storyTimer = 0;
});

// Park at first swamp
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 24 * 16;
    g.player.y = (g.level.data.height - 4) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g.player.iFrames = 600;
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/swamp-1.png' });

// Park at second swamp
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 48 * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/swamp-2.png' });

const data = await page.evaluate(() => ({
    pickups: window.__game.pickups.pickups.map(p => ({ x: p.x, type: p.type })),
    enemies: window.__game.enemies.enemies.map(e => ({ x: e.x, type: e.type })),
}));
console.log(JSON.stringify(data, null, 2));
await browser.close();

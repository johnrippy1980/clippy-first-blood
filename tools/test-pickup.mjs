// Verify weapon-pickup visual fanfare.
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

await page.evaluate(() => {
    const g = window.__game;
    g.enemies.enemies.length = 0;
    g.enemies.bullets.length = 0;
    g.player.x = 9 * 16;
    g.player.y = (14 - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    g.player.state = 'idle';
    g.player.weapon = 'MG';  // baseline
});
await page.waitForTimeout(200);

// Trigger pickup directly
await page.evaluate(() => window.__game.player.pickup('SPREAD'));
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/clippy-pickup-flash.png' });

// Sample after another 200ms (mid-fade)
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/clippy-pickup-after.png' });

const state = await page.evaluate(() => ({
    weapon: window.__game.player.weapon,
    flash: window.__game.player.weaponPickupFlash,
}));
console.log('State:', JSON.stringify(state));
console.log(`Errors: ${errs.length}`);
errs.forEach(e => console.log('  ' + e));
await browser.close();

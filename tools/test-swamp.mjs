// Capture the swamp section of stage 1: wading, ducking under enemy fire.
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

// Teleport Clippy to right above the first swamp at tile col 24
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 24 * 16;
    g.player.y = (14 - 5) * 16;
    g.player.vx = 0;
    g.player.vy = 0;
});
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/clippy-swamp-1approach.png' });

// Walk right into the swamp
await page.mouse.move(800, 560);
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/clippy-swamp-2wading.png' });

// Stop, then duck-hide
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(150);
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/clippy-swamp-3hidden.png' });

const state = await page.evaluate(() => {
    const g = window.__game;
    return {
        x: g.player.x.toFixed(1),
        y: g.player.y.toFixed(1),
        inWater: g.player.inWater,
        waterFeet: g.player.waterFeet,
        waterHidden: g.player.waterHidden,
        vx: g.player.vx.toFixed(2),
        hp: g.player.hp,
    };
});
console.log('After duck:', JSON.stringify(state));

await page.keyboard.up('ArrowDown');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/clippy-swamp-4surface.png' });

console.log(`Errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e));
await browser.close();

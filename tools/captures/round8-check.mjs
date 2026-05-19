// Round-8 fidelity capture — sample MG/SPREAD bullet streaks + enemy gibs + danger pulse.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r8', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// 1) Hover an enemy at 1 HP — danger pulse should render
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(3);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(2000);
await page.keyboard.up('ArrowRight');
// Damage the nearest cabinet (6 HP) down to 1
await page.evaluate(() => {
    const g = window.__game;
    for (const e of g.enemies.enemies) {
        if (e.alive && e.maxHp > 2) {
            e.hp = 1;
            e.hitFlash = 0;
            break;
        }
    }
});
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/r8/danger-pulse.png' });

// 2) Capture MG bullets mid-flight
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});
await page.keyboard.down('KeyX');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/r8/mg-streaks.png' });
await page.keyboard.up('KeyX');

// 3) Capture enemy death with gibs
await page.evaluate(() => {
    const g = window.__game;
    // Force-kill the first cabinet so we see gibs
    for (const e of g.enemies.enemies) {
        if (e.alive && e.sprite === 'cabinet') {
            e.hp = 0.5;
            e.hurt = e.hurt || function(){};
            break;
        }
    }
});
await page.keyboard.down('KeyX');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/r8/gib-chunks.png' });
await page.keyboard.up('KeyX');

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

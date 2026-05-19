// Verify enemy alert "!" bubble fires on first activation
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r26', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});

// Get state of all enemies before activation
const pre = await page.evaluate(() => {
    const g = window.__game;
    return g.enemies.enemies.map(e => ({
        type: e.type, activated: !!e.activated,
        x: e.x | 0, alertBubble: e._alertBubble || 0,
    }));
});
console.log('pre-activation:', JSON.stringify(pre));

// Force activate the first enemy by yanking player next to it
await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies.enemies[0];
    if (e) {
        g.player.x = e.x - 32;
        g.player.y = e.y;
    }
});

await page.waitForTimeout(150);
const post = await page.evaluate(() => {
    const g = window.__game;
    return g.enemies.enemies.map(e => ({
        type: e.type, activated: !!e.activated,
        alertBubble: e._alertBubble || 0,
    }));
});
console.log('post-activation:', JSON.stringify(post));
await page.screenshot({ path: '/tmp/r26/alert.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

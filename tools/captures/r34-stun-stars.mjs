// Verify stunned-enemy visual: set _stunTimer, see stars over head
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r34', { recursive: true });

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
    const e = g.enemies.enemies.find(en => en.alive);
    if (e) {
        e.x = g.player.x + 40;
        e.y = g.player.y;
        e._stunTimer = 120;
        e.activated = true; e._grace = 0;
        window.__e = e;
    }
});

await page.waitForTimeout(120);
const state = await page.evaluate(() => {
    const e = window.__e;
    return { stun: e?._stunTimer | 0, hp: e?.hp };
});
console.log('state:', JSON.stringify(state));
await page.screenshot({ path: '/tmp/r34/stunned.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

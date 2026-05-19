// Verify pounce hint appears when player is hidden + target in range
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r36', { recursive: true });

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
        e.activated = true; e._grace = 0;
        window.__e = e;
    }
    // Spoof grass-hidden + pounce target so the hint appears
    g.player.grassHidden = true;
    g.player._pounceTarget = e;
});

// Hint is set each draw, so just wait a frame and screenshot
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r36/hint.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

// Captures every stage's boss-entrance banner so I can visually verify
// each one reads as a "real boss" moment. For each stage 1..8 plus
// secret stage 9, warp to the boss arena, force boss spawn, and snap.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/bossentrances', { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => { errors.push('PAGE: ' + e.message); console.error('PAGE ERROR:', e.message); });
page.on('console', m => { if (m.type() === 'error') { errors.push('CON: ' + m.text()); console.log('CON ERR:', m.text()); } });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

for (let stage = 1; stage <= 9; stage++) {
    // Force-skip into PLAY directly so the intro doesn't gate the screenshot.
    await page.evaluate((s) => {
        const g = window.__game;
        g._startStage(s);
        g.scene = 'play';
        // Clear any pending intro/fade state
        g.transition = 0;
    }, stage);
    await page.waitForTimeout(500);

    // Warp to boss arena
    await page.evaluate(() => {
        const g = window.__game;
        const trig = g.level.data.bossTrigger || { x: (g.level.data.width - 6) * 16 };
        g.player.x = trig.x + 10;
        g.player.y = (g.level.data.height - 6) * 16;
        g.camera.x = Math.max(0, g.player.x - 128);
        g.player.iFrames = 99999;
    });
    await page.waitForTimeout(1200); // wait for entrance animation peak
    await page.screenshot({ path: `/tmp/bossentrances/stage-${stage}.png` });
}

await browser.close();
console.log('ERRORS:', errors.length);
if (errors.length) for (const e of errors) console.log('  ', e);

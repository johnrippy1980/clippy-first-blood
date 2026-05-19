// Verify enemy-death shock ring renders + animates outward
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r44', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Drop into stage 1, mid-stage, kill the nearest enemy, capture frames
await page.evaluate(async () => {
    const { particles } = await import('/src/particles.js');
    // Manually spawn rings to verify draw path works in isolation
    particles.shockRing(120, 120, 22, 14, '#fff');
    particles.shockRing(160, 120, 36, 14, '#fff');
    particles.shockRing(200, 120, 52, 22, '#ffe070');
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
});
await page.waitForTimeout(80); // ~5 frames in
await page.screenshot({ path: '/tmp/r44/ring-early.png' });

// Programmatically kill nearest enemy via direct hp = 0 + damage call
const killResult = await page.evaluate(() => {
    const g = window.__game;
    if (!g.enemies?.enemies?.length) return { found: false };
    const e = g.enemies.enemies.find(en => en.alive);
    if (!e) return { found: false };
    const beforeRings = g.constructor === undefined ? 0 : 0;
    e.hp = 1;
    e.activated = true;
    e.hurt(99, 0, {});
    return { found: true, alive: e.alive };
});
console.log('kill result:', JSON.stringify(killResult));

await page.waitForTimeout(80);
await page.screenshot({ path: '/tmp/r44/ring-kill-mid.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

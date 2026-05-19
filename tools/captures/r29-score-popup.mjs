// Verify score popup scale ramps with combo tier
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r29', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(async () => {
    const m = await import('/src/particles.js');
    window.__particles = m.particles;
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});

// Simulate a kill at each tier by directly hp-zeroing an enemy then calling onBulletHit
for (const combo of [0, 6, 12, 25]) {
    await page.evaluate((c) => {
        const g = window.__game;
        g.player.combo = c - 1; // onBulletHit increments to c
        const e = g.enemies.enemies.find(en => en.alive);
        if (!e) return;
        // Fake bullet
        const b = { x: e.x + e.w / 2, y: e.y + e.h / 2, vx: 1, weapon: 'MG', damage: 99 };
        // Take hp to 0 + invoke kill
        e.hp = 0; e.alive = false;
        g.player.onBulletHit(b, e, true);
    }, combo);
    await page.waitForTimeout(60);
    const floats = await page.evaluate(() => {
        return (window.__particles?.floats || [])
            .filter(f => f.alive && /^\+\d/.test(f.text || ''))
            .map(f => ({ text: f.text, color: f.color, scale: f.scale, life: f.life }));
    });
    console.log(`combo=${combo}:`, JSON.stringify(floats));
}

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

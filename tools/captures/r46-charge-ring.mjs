// Verify boss charge-ring telegraph contracts toward the boss
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r46', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Isolated test: spawn a chargeRing manually and sample its radius over time
const samples = await page.evaluate(async () => {
    const { particles } = await import('/src/particles.js');
    // Clear ring pool
    for (const r of particles.rings) r.alive = false;
    // Fake follow target
    const follow = { x: 100, y: 100, w: 24, h: 24, alive: true };
    particles.chargeRing(112, 112, 30, 30, '#ff3030', follow);
    const ring = particles.rings.find(r => r.alive);
    const out = [];
    // Sample 6 frames apart by manually advancing update
    for (let i = 0; i < 6; i++) {
        const t = 1 - (ring.life / ring.maxLife);
        const r = Math.max(1, ring.maxR * (1 - t));
        out.push({ frame: i * 5, life: ring.life, r: Math.round(r) });
        for (let j = 0; j < 5; j++) ring.update();
    }
    return out;
});
console.log('contraction samples:', JSON.stringify(samples));

// Real boss path — pop a boss and let it telegraph
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    // Force-spawn boss
    g._spawnBoss?.();
});
await page.waitForTimeout(200); // let boss settle in
await page.evaluate(() => {
    // Force boss into telegraph window
    const b = window.__game.boss || window.__game.enemies.activeBoss?.();
    if (b) b.attackTimer = 30;
});
await page.waitForTimeout(100); // ~6 frames in
await page.screenshot({ path: '/tmp/r46/boss-charge.png' });
await page.waitForTimeout(300); // ring contracts further
await page.screenshot({ path: '/tmp/r46/boss-charge-late.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

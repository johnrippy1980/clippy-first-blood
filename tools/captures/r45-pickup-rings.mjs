// Verify pickup shock rings fire for LIFE / 1UP / weapon swap / weapon level
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r45', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Start play and trigger pickups directly
const result = await page.evaluate(async () => {
    const { particles } = await import('/src/particles.js');
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    // Wipe ring pool to known state
    for (const r of particles.rings) r.alive = false;
    // Trigger one of each pickup type at the player
    const p = g.player;
    p.pickup('SPREAD');   // weapon swap → 2 rings (color + white)
    const ringsAfterSpread = particles.rings.filter(r => r.alive).length;
    p.pickup('SPREAD');   // weapon level up → 1 ring
    const ringsAfterLvl = particles.rings.filter(r => r.alive).length;
    p.pickup('LIFE');     // hp → 1 ring (green)
    const ringsAfterLife = particles.rings.filter(r => r.alive).length;
    p.pickup('1UP');      // 1up → 2 rings (white + gold)
    const ringsAfter1Up = particles.rings.filter(r => r.alive).length;
    return { ringsAfterSpread, ringsAfterLvl, ringsAfterLife, ringsAfter1Up };
});
console.log('ring counts:', JSON.stringify(result));

await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r45/all-rings.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

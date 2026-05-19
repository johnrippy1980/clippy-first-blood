// Verify grenade detonation breaks crates in radius and spawns their drop.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));

    const player = g.player;
    const pm = g.pickups;
    pm.crates.length = 0;
    pm.pickups.length = 0;
    // Place a crate next to the player
    pm.spawnCrate(player.x + 12, player.y, 'LIFE');
    const cratesBefore = pm.crates.length;
    const pickupsBefore = pm.pickups.length;

    // Detonate a fake grenade at the crate's center
    const crate = pm.crates[0];
    player._detonateGrenade({ x: crate.x + crate.w / 2, y: crate.y + crate.h / 2 });

    return {
        cratesBefore, pickupsBefore,
        cratesAfter: pm.crates.length,
        pickupsAfter: pm.pickups.length,
        droppedType: pm.pickups[0]?.type,
    };
});
console.log('Grenade-vs-crate:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.cratesBefore === 1
    && result.cratesAfter === 0       // crate broken
    && result.pickupsAfter === 1      // drop spawned
    && result.droppedType === 'LIFE';
process.exit(ok ? 0 : 1);

// Verify grenade pickup grants count, throw consumes one, detonation
// damages enemies in radius and clears the in-flight grenade.
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

    // Test 1: pickup grants +2 grenades
    player.grenades = 0;
    player.pickup('GRENADE');
    const afterFirstPickup = player.grenades;
    player.pickup('GRENADE');
    const afterSecondPickup = player.grenades;  // should cap at 4
    player.pickup('GRENADE');
    const afterThirdPickup = player.grenades;   // should stay at 4

    // Test 2: throw consumes one
    player.grenades = 2;
    player.thrownGrenades.length = 0;
    player._grenadeCooldown = 0;
    player._throwGrenade();
    const afterThrow = {
        grenades: player.grenades,
        thrownCount: player.thrownGrenades.length,
    };

    // Test 3: detonation damages a nearby enemy
    // Spawn a fake enemy near the in-flight grenade's landing target
    const grenade = player.thrownGrenades[0];
    // Find an enemy currently in-stage, move it within radius
    const enemy = g.enemies.enemies[0];
    if (!enemy) return { error: 'no-enemy' };
    enemy.x = grenade.x - 10;
    enemy.y = grenade.y - 4;
    enemy.alive = true;
    const hpBefore = enemy.hp;
    // Force detonation by setting fuse to 1 and ticking
    grenade.fuse = 1;
    player._updateGrenades(g.level);
    const hpAfter = enemy.hp;
    const thrownAfterDetonate = player.thrownGrenades.length;

    // Test 4: throwing with 0 grenades fails gracefully (no thrown spawned, no decrement)
    player.grenades = 0;
    player.thrownGrenades.length = 0;
    player._grenadeCooldown = 0;
    player._throwGrenade();
    const failThrow = {
        grenades: player.grenades,
        thrownCount: player.thrownGrenades.length,
    };

    return {
        afterFirstPickup,
        afterSecondPickup,
        afterThirdPickup,
        afterThrow,
        hpBefore, hpAfter,
        thrownAfterDetonate,
        failThrow,
    };
});
console.log('Grenade flow:', JSON.stringify(result, null, 2));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.afterFirstPickup === 2
    && result.afterSecondPickup === 4
    && result.afterThirdPickup === 4         // cap
    && result.afterThrow.grenades === 1      // -1 on throw
    && result.afterThrow.thrownCount === 1   // projectile spawned
    && result.hpAfter < result.hpBefore      // damage applied
    && result.thrownAfterDetonate === 0      // grenade cleared
    && result.failThrow.grenades === 0       // no decrement
    && result.failThrow.thrownCount === 0;   // no projectile
process.exit(ok ? 0 : 1);

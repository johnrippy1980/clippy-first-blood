// Verify magnet tug-trail particles spawn while pickup is within pull range,
// and that _attracting resets when out of range so the chime can re-fire.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r65', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Boot a stage to get a level + player + pickup manager.
const result = await page.evaluate(async () => {
    const { particles } = await import('/src/particles.js');
    const g = window.__game;
    // Start play scene so a stage is loaded
    g.scene = 'play';
    if (!g._stageStarted) {
        // Best-effort: drive _startStage if available
        try { g._startStage(0); } catch (e) { /* */ }
    }
    // Wait a tick for stage to settle
    await new Promise(r => setTimeout(r, 100));

    // Fake a pickup near the player
    const player = g.player;
    if (!player) return { error: 'no-player' };
    const pm = g.pickups || g.pickupManager;
    if (!pm) return { error: 'no-pickup-manager' };

    // Spawn a pickup within magnet pull range (18px diag from player center)
    pm.spawn(player.x + 14, player.y + 8, 'M');
    const pickup = pm.pickups[pm.pickups.length - 1];
    pickup.vy = 0;

    // Drive several update ticks; count mote spawns
    const aliveBefore = particles.pool.filter(p => p.alive).length;
    for (let i = 0; i < 12; i++) {
        pickup.update(g.level, player);
        // Avoid pickup collision insta-eating it — keep distance from player
        pickup.x = player.x + 14 + (i * 0.1);
        pickup.y = player.y + 8;
    }
    const aliveAfter = particles.pool.filter(p => p.alive).length;

    // Now move pickup far away and confirm _attracting flips back to false
    pickup.x = player.x + 200;
    pickup.y = player.y + 200;
    pickup.update(g.level, player);
    const attractingAfterFar = pickup._attracting;

    return {
        spawnedMotes: aliveAfter - aliveBefore,
        attractingAfterFar,
        hadPickup: true,
    };
});
console.log('Tug-trail result:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.spawnedMotes >= 2
    && result.attractingAfterFar === false;
process.exit(ok ? 0 : 1);

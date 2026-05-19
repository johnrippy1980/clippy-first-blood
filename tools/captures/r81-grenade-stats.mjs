// Verify runStats.grenadeUses + grenadeKills tick on throw + detonate.
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

    const p = g.player;
    g.runStats.grenadeUses = 0;
    g.runStats.grenadeKills = 0;
    p.grenades = 2;
    p.thrownGrenades.length = 0;
    p._grenadeCooldown = 0;

    // First throw — increments grenadeUses
    p._throwGrenade();
    const usesAfter1 = g.runStats.grenadeUses;

    // Place a low-HP enemy at the grenade's landing spot, then detonate
    const gn = p.thrownGrenades[0];
    const enemy = g.enemies.enemies[0];
    enemy.x = gn.x - 8;
    enemy.y = gn.y - 4;
    enemy.alive = true;
    enemy.hp = 0.5;  // grenade dmg 3 → guaranteed kill
    gn.fuse = 1;
    p._updateGrenades(g.level);

    const killsAfter = g.runStats.grenadeKills;
    const usesAfterDetonate = g.runStats.grenadeUses;

    // Fail-throw with 0 grenades — should NOT increment uses
    p.grenades = 0;
    p._grenadeCooldown = 0;
    p._throwGrenade();
    const usesAfterFail = g.runStats.grenadeUses;

    return { usesAfter1, killsAfter, usesAfterDetonate, usesAfterFail };
});
console.log(JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.usesAfter1 === 1
    && result.killsAfter >= 1
    && result.usesAfterDetonate === 1  // detonate didn't double-count
    && result.usesAfterFail === 1;     // fail-throw doesn't count
process.exit(ok ? 0 : 1);

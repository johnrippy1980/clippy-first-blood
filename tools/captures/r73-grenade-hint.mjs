// Verify _everThrewGrenade flips on first throw and stays true.
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
    const before = player._everThrewGrenade;

    // Pickup grenades, hint should remain showable
    player.grenades = 0;
    player._everThrewGrenade = false;
    player.pickup('GRENADE');
    const afterPickup = {
        grenades: player.grenades,
        everThrew: player._everThrewGrenade,
    };

    // Throw — flag flips
    player._grenadeCooldown = 0;
    player._throwGrenade();
    const afterThrow = {
        grenades: player.grenades,
        everThrew: player._everThrewGrenade,
    };

    // Pickup again, ever-threw should stay true
    player.pickup('GRENADE');
    const afterSecondPickup = { everThrew: player._everThrewGrenade };

    return { before, afterPickup, afterThrow, afterSecondPickup };
});
console.log('Grenade hint flag:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.afterPickup.everThrew === false
    && result.afterThrow.everThrew === true
    && result.afterSecondPickup.everThrew === true;
process.exit(ok ? 0 : 1);

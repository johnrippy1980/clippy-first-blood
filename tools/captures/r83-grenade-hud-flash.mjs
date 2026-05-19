// Verify grenade pickup sets grenadePickupFlash and it decrements.
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
    p.grenades = 0;
    p.grenadePickupFlash = 0;
    p.pickup('GRENADE');
    const afterPickup = p.grenadePickupFlash;
    // Tick 5 frames via player.update
    for (let i = 0; i < 5; i++) p.update(g.level, g.camera);
    const afterTicks = p.grenadePickupFlash;
    return { afterPickup, afterTicks };
});
console.log(JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.afterPickup === 30
    && result.afterTicks < 30 && result.afterTicks >= 25;
process.exit(ok ? 0 : 1);

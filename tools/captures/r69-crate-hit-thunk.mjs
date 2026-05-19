// Verify audio.sfx('crateHit') fires per non-final crate hit and
// 'explode' fires on the final hit (not crateHit).
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
    const { audio } = await import('/src/audio.js');
    const { PickupManager } = await import('/src/pickups.js');
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));

    // Spy audio.sfx
    const calls = [];
    const orig = audio.sfx.bind(audio);
    audio.sfx = (name) => { calls.push(name); return orig(name); };

    const pm = g.pickups;
    pm.spawnCrate(60, 60, 'M');
    const crate = pm.crates[pm.crates.length - 1];
    crate.hp = 3;

    // Inject 3 bullets that overlap the crate, fire update one bullet at a time.
    const player = g.player;
    const fire = () => {
        player.bullets.push({ x: 65, y: 65, vx: 0, vy: 0, damage: 1, alive: true });
    };
    fire(); crate.update(g.level, player);  // hit 1 → crateHit
    fire(); crate.update(g.level, player);  // hit 2 → crateHit
    fire(); crate.update(g.level, player);  // hit 3 → explode (no crateHit)

    audio.sfx = orig;
    return {
        calls,
        crateHits: calls.filter(c => c === 'crateHit').length,
        explodes: calls.filter(c => c === 'explode').length,
        crateAlive: crate.alive,
    };
});
console.log('Crate hit thunk:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.crateHits === 2  // 2 non-final hits → crateHit
    && result.explodes === 1   // 1 final break → explode
    && result.crateAlive === false;
process.exit(ok ? 0 : 1);

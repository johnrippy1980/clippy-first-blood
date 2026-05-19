// Verify boss actually spawns after the BOSS_INTRO cinematic — and the
// stage doesn't accidentally end during the deferred-spawn gap.
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

    // Jam player past the boss trigger
    const trigger = g.level.data.bossTrigger.x;
    g.player.x = trigger + 10;
    // Tick play — should route through to BOSS_INTRO
    g._tickPlay();
    const afterTrigger = {
        scene: g.scene,
        bossSpawned: g.bossSpawned,
        clearScheduled: g._clearScheduled,
        bossAlive: !!g.boss,
    };

    // Tick the cinematic to completion
    for (let i = 0; i < 160; i++) g._tickBossIntro();
    const afterCinematic = {
        scene: g.scene,
        bossSpawned: g.bossSpawned,
        clearScheduled: g._clearScheduled,
        bossAlive: !!g.enemies.activeBoss(),
    };

    return { afterTrigger, afterCinematic };
});
console.log(JSON.stringify(result, null, 2));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.afterTrigger.scene === 'bossIntro'
    && result.afterTrigger.clearScheduled === false   // stage did NOT end early
    && result.afterCinematic.scene === 'play'
    && result.afterCinematic.bossAlive === true;       // boss now exists
process.exit(ok ? 0 : 1);

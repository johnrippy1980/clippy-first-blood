// Verify boss intro scene routes correctly: _spawnBoss transitions to
// BOSS_INTRO, ticks through both villain phase (150f) and Clippy counter
// phase (80f), then _finishBossIntro spawns the actual boss.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r75', { recursive: true });

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

    // Snapshot initial state
    const beforeSpawn = {
        scene: g.scene,
        bossSpawned: g.bossSpawned,
        hasBossIntro: !!g._bossIntro,
        bossAlive: !!g.boss,
    };

    // Trigger _spawnBoss — should route through BOSS_INTRO
    g._spawnBoss();
    const afterSpawnCall = {
        scene: g.scene,
        bossSpawned: g.bossSpawned,
        hasBossIntro: !!g._bossIntro,
        bossAlive: !!g.boss,
    };

    // Tick the boss intro to completion: villain 150f + counter 80f = 230f
    for (let i = 0; i < 240; i++) {
        g._tickBossIntro();
    }

    const afterIntro = {
        scene: g.scene,
        hasBossIntro: !!g._bossIntro,
        bossAlive: !!g.enemies.activeBoss(),
    };

    return { beforeSpawn, afterSpawnCall, afterIntro };
});
console.log('Boss intro flow:', JSON.stringify(result, null, 2));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.beforeSpawn.scene === 'play'
    && result.afterSpawnCall.scene === 'bossIntro'
    && result.afterSpawnCall.hasBossIntro === true
    && result.afterSpawnCall.bossAlive === false  // not spawned yet
    && result.afterIntro.scene === 'play'
    && result.afterIntro.hasBossIntro === false
    && result.afterIntro.bossAlive === true;  // boss now actually spawned
process.exit(ok ? 0 : 1);

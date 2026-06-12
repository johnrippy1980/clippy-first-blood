// R609 Endless / Survival smoke: boot the game, launch the new ENDLESS arena
// (stage 27), and exercise the wave manager. Confirms: the stage loads with
// endlessMode set, the wave manager inits, a breather advances into wave 1,
// grunts drip-spawn, killing them all clears the wave and bumps the counter,
// difficulty ramps, and bestEndlessWave persists. No real input — we poke the
// manager + enemy list directly to keep it deterministic. Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
    const out = { steps: [] };
    const g = window.__game;
    if (!g || typeof g._startStage !== 'function') { out.err = 'no game'; return out; }

    g._startStage(27);
    await new Promise(r => setTimeout(r, 300));
    out.endlessMode = g.endlessMode;
    out.hasEndless = !!g._endless;
    out.initState = g._endless && g._endless.state;
    out.startWave = g._endless && g._endless.wave;
    out.poolWave1 = g._ENDLESS_POOL();

    // Force into PLAY so the wave manager actually ticks. The stage routes
    // through STAGE_INTRO/READY; jump straight to PLAY for the probe.
    g.scene = 'play';

    // Drive the breather down to spawn wave 1.
    g._endless.breatherT = 1;
    g._tickEndlessWaves();   // breather hits 0 next call
    g._tickEndlessWaves();   // advances wave -> active, queues pendingSpawns
    out.afterBreather_wave = g._endless.wave;
    out.afterBreather_state = g._endless.state;
    out.pendingSpawns = g._endless.pendingSpawns;

    // Drip out the whole wave by zeroing the cooldown each call.
    let safety = 0;
    while (g._endless.pendingSpawns > 0 && safety++ < 200) {
        g._endless.spawnCd = 0;
        g._tickEndlessWaves();
    }
    out.spawnedCount = g.enemies.enemies.filter(e => e.alive).length;

    // Kill them all (simulate clear) and tick once: wave should clear + bump.
    for (const e of g.enemies.enemies) { e.alive = false; e.hp = 0; }
    // enemies.update normally culls dead; the manager counts alive directly,
    // so we can clear without a full world update.
    g._tickEndlessWaves();
    out.afterClear_state = g._endless.state;
    out.afterClear_cleared = g._endless.cleared;
    out.bestEndlessWave = (window.__game.achievementsStats && 0) || undefined;

    // Pull the persisted best from achievements.
    out.persistedBest = (await import('/src/achievements.js')).achievements.stats.bestEndlessWave;

    // Difficulty must have ramped from the wave-1 baseline.
    out.poolLater = (() => { g._endless.wave = 7; return g._ENDLESS_POOL(); })();

    return out;
});

console.log(JSON.stringify({ errors, result }, null, 2));
await browser.close();
const r = result;
const ok = errors.length === 0
    && r.endlessMode === true
    && r.hasEndless === true
    && r.afterBreather_wave === 1
    && r.afterBreather_state === 'active'
    && r.pendingSpawns >= 3
    && r.spawnedCount >= 3
    && r.afterClear_state === 'breather'
    && r.afterClear_cleared === 1
    && r.persistedBest >= 1
    && Array.isArray(r.poolLater) && r.poolLater.includes('summoner');
console.log(ok ? 'ENDLESS OK' : 'ENDLESS FAIL');
process.exit(ok ? 0 : 1);

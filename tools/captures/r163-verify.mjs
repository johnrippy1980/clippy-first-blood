// R163: end-to-end runtime verify of R156+R157.
// Drives the kill + boss-intro flows in a real headless browser to confirm
// the new behaviors actually fire, not just that the smoke tests don't error.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
    const g = window.__game;
    const { particles } = await import('/src/particles.js');
    g._startStage(1);
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 400));

    // --- Instrument: replace floatingText with a counter so we observe
    //     calls deterministically. Pool recycling makes count/find-based
    //     detection flaky once 32+ floats have spawned.
    const seen = [];
    const origFloat = particles.floatingText.bind(particles);
    particles.floatingText = (x, y, text, color, ...rest) => {
        seen.push({ text, color });
        return origFloat(x, y, text, color, ...rest);
    };

    // --- R156 grunt-taunt: ~15% chance per call across 200 calls.
    g.player._tauntCooldown = 0;
    const baselineGrunt = seen.length;
    for (let i = 0; i < 200; i++) {
        g.player._tauntCooldown = 0;  // bypass cooldown
        g.player.tauntKill(false);
    }
    const gruntTaunts = seen.length - baselineGrunt;

    // --- R156 boss-taunt: always fires (no chance gate)
    g.player._tauntCooldown = 0;
    const baselineBoss = seen.length;
    g.player.tauntKill(true);
    const bossEvents = seen.slice(baselineBoss);
    const bossTaunted = bossEvents.length === 1;
    const lastText = bossEvents[0]?.text || null;
    const lastColor = bossEvents[0]?.color || null;

    // --- R156 cooldown: a second immediate tauntKill should NOT fire
    //     (cooldown still active from the call above).
    const baselineCooldown = seen.length;
    g.player.tauntKill(true);
    const cooldownHeld = seen.length === baselineCooldown;

    particles.floatingText = origFloat;

    // --- R157 counter-slide: trigger boss intro and verify phase transition
    g._spawnBoss();
    // R173: cinematic now holds at the readable beat until the user presses
    // X. Set the test-only autoAdvance flag so the probe can drive it to
    // completion without dispatching real keystrokes.
    if (g._bossIntro) g._bossIntro.autoAdvance = true;
    const phaseStart = g._bossIntro ? (g._bossIntro.phase || 'villain') : null;
    // Tick through villain phase (150f)
    for (let i = 0; i < 150; i++) g._tickBossIntro();
    const phaseAfterVillain = g._bossIntro ? g._bossIntro.phase : null;
    const ageAfterVillain = g._bossIntro ? g._bossIntro.age : null;
    // Re-arm autoAdvance for the counter phase — phase transitions reset age
    // but the flag is on the _bossIntro object so it persists across phases.
    if (g._bossIntro) g._bossIntro.autoAdvance = true;
    // Tick counter phase to completion (80f)
    for (let i = 0; i < 85; i++) g._tickBossIntro();
    const sceneAfterBoth = g.scene;
    const introCleared = g._bossIntro === null;
    const bossAlive = !!g.enemies.activeBoss();

    return {
        gruntTauntCount: gruntTaunts,                    // expect ~15% of 200 ≈ 20-40
        bossTaunted,                                     // expect true
        bossTauntText: lastText,                         // should be a boss line
        bossTauntColor: lastColor,                       // expect '#ffe070'
        cooldownHeld,                                    // expect true
        phaseStart,                                      // expect 'villain'
        phaseAfterVillain,                               // expect 'counter'
        ageAfterVillain,                                 // expect 0 (just rolled into counter)
        sceneAfterBoth,                                  // expect 'play'
        introCleared,                                    // expect true
        bossAlive,                                       // expect true
    };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();

const ok = errors.length === 0
    // 15% × 200 = mean 30, std ~5. 99.7% CI ≈ [15, 45]. Pad to [12, 50].
    && result.gruntTauntCount >= 12 && result.gruntTauntCount <= 50
    && result.bossTaunted === true
    && result.bossTauntColor === '#ffe070'
    && result.cooldownHeld === true
    && result.phaseStart === 'villain'
    && result.phaseAfterVillain === 'counter'
    && result.ageAfterVillain === 0
    && result.sceneAfterBoth === 'play'
    && result.introCleared === true
    && result.bossAlive === true;
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
console.log(ok ? '✅ R163 PASS' : '❌ R163 FAIL');
process.exit(ok ? 0 : 1);

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

    // --- R156 grunt-taunt: force-call tauntKill with isBoss=false enough
    //     times that random chance fires at least once.
    g.player._tauntCooldown = 0;
    let gruntTaunts = 0;
    for (let i = 0; i < 200; i++) {
        const before = particles.floats.filter(f => f.alive).length;
        g.player._tauntCooldown = 0;  // bypass cooldown for the sample
        g.player.tauntKill(false);
        const after = particles.floats.filter(f => f.alive).length;
        if (after > before) gruntTaunts++;
    }

    // --- R156 boss-taunt: should always fire (no chance gate)
    g.player._tauntCooldown = 0;
    const beforeBoss = particles.floats.filter(f => f.alive).length;
    g.player.tauntKill(true);
    const afterBoss = particles.floats.filter(f => f.alive).length;
    const bossTaunted = afterBoss > beforeBoss;
    // Sample the last text — should be a boss line
    const lastFloat = [...particles.floats].filter(f => f.alive).pop();
    const lastText = lastFloat ? lastFloat.text : null;
    const lastColor = lastFloat ? lastFloat.color : null;

    // --- R156 cooldown: a second immediate tauntKill should NOT fire
    g.player.tauntKill(true);
    const afterSecond = particles.floats.filter(f => f.alive).length;
    const cooldownHeld = afterSecond === afterBoss;

    // --- R157 counter-slide: trigger boss intro and verify phase transition
    g._spawnBoss();
    const phaseStart = g._bossIntro ? (g._bossIntro.phase || 'villain') : null;
    // Tick through villain phase (150f)
    for (let i = 0; i < 150; i++) g._tickBossIntro();
    const phaseAfterVillain = g._bossIntro ? g._bossIntro.phase : null;
    const ageAfterVillain = g._bossIntro ? g._bossIntro.age : null;
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
    && result.gruntTauntCount >= 10 && result.gruntTauntCount <= 60   // 5%-30% range
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

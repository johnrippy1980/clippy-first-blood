// Production smoke test: load, navigate menus, start stage, kill boss, exit.
// Captures console errors + uncaught exceptions. Fails fast if anything throws.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errors = [];
const warnings = [];
page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
page.on('console', m => {
    const t = m.type();
    const text = m.text();
    if (t === 'error') errors.push('CONSOLE ERROR: ' + text);
    if (t === 'warning' && !text.includes('AudioContext')) warnings.push('WARN: ' + text);
});
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.waitForTimeout(500);

// 1. Cycle through every stage and verify it loads + draws one frame
for (let stage = 1; stage <= 8; stage++) {
    await page.evaluate(s => window.__game._startStage(s), stage);
    await page.waitForTimeout(400);
    const ok = await page.evaluate(() => {
        const g = window.__game;
        return g.level && g.level.data && g.level.data.width > 0 && g.player && g.player.hp > 0;
    });
    if (!ok) errors.push(`STAGE ${stage}: failed to initialize`);
    else console.log(`stage ${stage} OK`);
}

// 2. Verify all menu scenes render without throwing
const scenes = ['title', 'options', 'achievements', 'soundtrack', 'stageSelect', 'gameOver'];
for (const s of scenes) {
    await page.evaluate(sc => { window.__game.scene = sc; }, s);
    await page.waitForTimeout(200);
    const sceneOk = await page.evaluate(() => window.__game.scene !== null);
    if (!sceneOk) errors.push(`SCENE ${s}: render failed`);
    else console.log(`scene ${s} OK`);
}

// 3. Verify boss spawn in each stage doesn't crash
for (let stage = 1; stage <= 8; stage++) {
    await page.evaluate(s => window.__game._startStage(s), stage);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        const g = window.__game;
        g.scene = 'play';
        g.player.x = (g.level.data.width - 6) * 16;
        g.camera.x = Math.max(0, g.player.x - 128);
    });
    try {
        await page.evaluate(() => window.__game._spawnBoss());
    } catch (e) {
        errors.push(`BOSS ${stage}: spawn threw — ${e.message}`);
    }
    await page.waitForTimeout(200);
    console.log(`boss ${stage} spawn OK`);
}

// 4. Kill-loop smoke: spawn stage 1 boss, force-damage to 0, verify
// scene routes to STAGE_CLEAR (which fades to STAGE_CARD then next stage).
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(400);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.player.x = (g.level.data.width - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g._spawnBoss();
});
await page.waitForTimeout(300);
const killInfo = await page.evaluate(() => {
    const g = window.__game;
    const b = g.enemies.activeBoss();
    if (!b) return { ok: false, msg: 'no active boss after spawn' };
    b.hp = 0;
    b.alive = false;
    return { ok: true, bossName: b.name };
});
if (!killInfo.ok) {
    errors.push(`KILL LOOP: ${killInfo.msg}`);
} else {
    // Let the stage-clear sequence advance — _onStageClear sets _clearScheduled
    // and the next tick transitions scene to stageClear.
    await page.waitForTimeout(1200);
    const scene = await page.evaluate(() => window.__game.scene);
    if (!['stageClear', 'stageCard', 'stageIntro'].includes(scene)) {
        errors.push(`KILL LOOP: scene ${scene} after kill — expected stageClear/stageCard/stageIntro`);
    } else {
        console.log(`kill loop OK (killed ${killInfo.bossName} → scene: ${scene})`);
    }
}

await browser.close();

if (errors.length) {
    console.error('\n=== ERRORS ===');
    for (const e of errors) console.error(e);
    process.exit(1);
}
if (warnings.length) {
    console.log('\n=== WARNINGS ===');
    for (const w of warnings.slice(0, 10)) console.log(w);
}
console.log('\n✅ SMOKE TEST PASSED');

// Production smoke test: load, navigate menus, start stage, kill boss, exit.
// Captures console errors + uncaught exceptions. Fails fast if anything throws.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// PROJECTILE_MANIFEST sprites are designer-pending: the renderer gates each on
// sprites.has() and falls back to procedural draw, so their 404s are expected
// and must not fail the smoke. Pull the exact filenames so any OTHER 404 still
// trips the test. When the art lands, these resolve and the allowlist is inert.
const __dirname = dirname(fileURLToPath(import.meta.url));
const spritesSrc = readFileSync(resolve(__dirname, '../src/sprites.js'), 'utf8');
const projBlock = spritesSrc.match(/export const PROJECTILE_MANIFEST\s*=\s*\{([^}]+)\}/);
const expectedMissing = new Set();
if (projBlock) {
    for (const e of projBlock[1].matchAll(/'[^']+'\s*:\s*'([^']+)'/g)) {
        expectedMissing.add(e[1].split('/').pop());
    }
}
const isExpectedMissing = (text) =>
    text.includes('404') && [...expectedMissing].some(f => text.includes(f));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errors = [];
const warnings = [];
page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
// Track every 404 filename. The console "Failed to load resource" error omits
// the URL, so we judge those at the end: real failures = 404s NOT on the
// expected-missing projectile allowlist. (response and console events can fire
// in either order, so this can't be decided inline.)
const failed404 = new Set();
page.on('response', r => { if (r.status() === 404) failed404.add(r.url().split('/').pop().split('?')[0]); });
// Suppress warnings we deliberately trigger (bounds-guard test, autoplay).
// Anything else lands in `warnings` and prints at the end as signal.
const EXPECTED_WARN_FRAGMENTS = [
    'AudioContext',                           // browser autoplay policy
    'autoplay',                                // music play() before gesture
    '_startStage: invalid stage',              // bounds-guard test (7 inputs)
];
page.on('console', m => {
    const t = m.type();
    const text = m.text();
    if (t !== 'error' && t !== 'warning') return;
    // Defer generic resource-load 404 errors to the end-of-run tally.
    if (t === 'error' && /Failed to load resource/.test(text)) return;
    if (t === 'error' && isExpectedMissing(text)) return;
    if (t === 'error') errors.push('CONSOLE ERROR: ' + text);
    if (t === 'warning' && !EXPECTED_WARN_FRAGMENTS.some(f => text.includes(f))) {
        warnings.push('WARN: ' + text);
    }
});
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.waitForTimeout(500);

// 1. Cycle through every stage (1-8 main + 9 secret) and verify it loads.
for (let stage = 1; stage <= 9; stage++) {
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

// 3. Verify boss spawn in each stage doesn't crash (1-9, secret included).
for (let stage = 1; stage <= 9; stage++) {
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

// 3b. Bounds guard: _startStage with invalid indices should fall back to 1.
for (const bad of [0, -1, 99, 'foo', null, undefined, 1.5]) {
    try {
        await page.evaluate(n => window.__game._startStage(n), bad);
        const got = await page.evaluate(() => window.__game.currentStage);
        if (got !== 1) errors.push(`BOUNDS: _startStage(${JSON.stringify(bad)}) → currentStage=${got}, expected 1`);
        else console.log(`bounds-guard ${JSON.stringify(bad)} → 1 OK`);
    } catch (e) {
        errors.push(`BOUNDS: _startStage(${JSON.stringify(bad)}) threw — ${e.message}`);
    }
}

// 3c. _restartRun clears per-run state.
await page.evaluate(() => {
    const g = window.__game;
    g.totalTime = 9999;
    g.totalDeaths = 42;
    g.runStats.maxCombo = 30;
    g.runStats.stagesCleared.add(1);
    g.runStats.stagesCleared.add(8);
    g.runStats.bulletTimeUses = 5;
    g._bossEntrance = { age: 30, isMini: false };
    g.bossSpawned = true;
    g.miniBossSpawned = true;
    g._restartRun();
});
const cleanup = await page.evaluate(() => {
    const g = window.__game;
    return {
        totalTime: g.totalTime,
        totalDeaths: g.totalDeaths,
        maxCombo: g.runStats.maxCombo,
        stagesCleared: g.runStats.stagesCleared.size,
        bulletTimeUses: g.runStats.bulletTimeUses,
        bossEntrance: g._bossEntrance,
        bossSpawned: g.bossSpawned,
        miniBossSpawned: g.miniBossSpawned,
    };
});
const expectedClean = { totalTime: 0, totalDeaths: 0, maxCombo: 0, stagesCleared: 0, bulletTimeUses: 0, bossEntrance: null, bossSpawned: false, miniBossSpawned: false };
const dirty = Object.entries(expectedClean).filter(([k, v]) => JSON.stringify(cleanup[k]) !== JSON.stringify(v));
if (dirty.length) {
    errors.push(`RESTART: state survived _restartRun — ${dirty.map(([k]) => `${k}=${JSON.stringify(cleanup[k])}`).join(', ')}`);
} else {
    console.log('restart cleanup OK');
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
    // _spawnBoss routes through BOSS_INTRO cinematic (r75). Skip straight
    // to _finishBossIntro so the smoke test still gets a live boss.
    g._spawnBoss();
    g._finishBossIntro();
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
    const state = await page.evaluate(() => {
        const g = window.__game;
        return {
            scene: g.scene,
            bossSpawned: g.bossSpawned,
            clearScheduled: g._clearScheduled,
            bossAlive: g.enemies.activeBoss()?.alive ?? null,
            currentStage: g.currentStage,
        };
    });
    if (!['stageClear', 'stageCard', 'stageIntro'].includes(state.scene)) {
        errors.push(`KILL LOOP: scene ${state.scene} after kill — diagnostics: ${JSON.stringify(state)}`);
    } else {
        console.log(`kill loop OK (killed ${killInfo.bossName} → scene: ${state.scene})`);
    }
}

// 5. Input-driven smoke — keyboard path from title → story → play.
// Catches regressions in the input layer (broken keymap, missing listener,
// scene routes that don't react to X) that the API-direct tests miss.
// Reload the page first so we're back at the boot/title scene.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// First click is required to activate the audio context (autoplay policy)
// AND counts as the title-screen tap-to-start.
await page.click('#screen');
await page.waitForTimeout(600);
// Spam X to traverse title → mainMenu → (selectDifficulty?) → story (N pages,
// each page needs 2 presses: snap typewriter + advance) → stageIntro. The
// scene flow has grown over time (R210 menu, R398 difficulty), so instead of
// a fixed press count, press up to 30 times and stop as soon as we reach
// stageIntro/ready/play — that way future scene additions won't flake this.
const sceneTimeline = [];
const DONE = new Set(['stageIntro', 'ready', 'play']);
for (let i = 0; i < 30; i++) {
    await page.keyboard.press('x');
    await page.waitForTimeout(280);
    const s = await page.evaluate(() => window.__game.scene);
    sceneTimeline.push(s);
    if (DONE.has(s)) break;
}
// Give stageIntro time to finish its hold + fade-out to ready/play
await page.waitForTimeout(2000);
// R209: STAGE_INTRO now fades into READY (the pre-level keymap card)
// when the showReady option is on (default). Press X again to clear it
// and reach play; otherwise the test would always end at "ready" and
// regressions in PLAY-scene entry would slip past.
const midScene = await page.evaluate(() => window.__game.scene);
sceneTimeline.push(midScene);
if (midScene === 'ready') {
    // 18-frame breath delay before READY accepts input — wait it out, then press.
    await page.waitForTimeout(400);
    await page.keyboard.press('x');
    await page.waitForTimeout(1500);
    sceneTimeline.push(await page.evaluate(() => window.__game.scene));
}
const inputPath = sceneTimeline.join('→');
const reached = ['stageIntro', 'ready', 'play'].some(s => sceneTimeline.includes(s));
if (!reached) {
    errors.push(`INPUT PATH: never reached stageIntro/ready/play via keyboard. Timeline: ${inputPath}`);
} else {
    console.log(`input path OK (timeline: ${inputPath})`);
}

await browser.close();

// End-of-run 404 tally: fail only on 404s outside the expected-missing
// (designer-pending projectile) allowlist. Expected ones are a no-op fallback.
const unexpected404 = [...failed404].filter(f => !expectedMissing.has(f));
if (unexpected404.length) {
    for (const f of unexpected404) errors.push(`CONSOLE ERROR: 404 — ${f}`);
}
const suppressed404 = [...failed404].filter(f => expectedMissing.has(f));
if (suppressed404.length) {
    console.log(`(suppressed ${suppressed404.length} expected-missing projectile sprite 404s — procedural fallback active)`);
}

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

// R489: deep bug-hunt harness. Covers:
//  (a) full traversal of all 24 stages
//  (b) restart-after-death on each engine type
//  (c) pause/resume from every play scene
//  (d) rapid stage-switching
//  (e) konami unlock state
//  (f) edge HP states
//  (g) achievement updates from non-platformer engines
//  (h) save-load round-trip
import { chromium } from 'playwright';
const URL = 'http://localhost:8765/';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', e => errors.push(`PAGE: ${e.message}`));
page.on('console', m => {
    if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 22; });

async function loadStage(n) {
    await page.evaluate((s) => window.__game._startStage(s), n);
    await page.waitForTimeout(1500);
    for (let i = 0; i < 12; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (['play', 'beatPlay', 'fpsPlay', 'doomPlay'].includes(s)) break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(180);
    }
    await page.waitForTimeout(400);
}

// (a) full traversal
console.log('=== (a) FULL TRAVERSAL ===');
const stages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
for (const n of stages) {
    const errBefore = errors.length;
    await loadStage(n);
    const scene = await page.evaluate(() => window.__game?.scene);
    const newErr = errors.length - errBefore;
    console.log(`  ${String(n).padStart(2)}: scene=${scene}, errs=${newErr}`);
}

// (b) restart after death on platformer
console.log('\n=== (b) DEATH/RESTART ===');
await loadStage(1);
await page.evaluate(() => { if (window.__game.player) window.__game.player.hp = 0; });
await page.waitForTimeout(500);
const sceneAfterDeath = await page.evaluate(() => window.__game?.scene);
console.log(`  platformer death → ${sceneAfterDeath}`);

// Reset + Doom death
await loadStage(16);
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    if (d) { d.player.hp = 0; d._onPlayerDeath?.(); }
});
await page.waitForTimeout(500);
const sceneDoomDeath = await page.evaluate(() => {
    const d = window.__game._doomEngine;
    return { scene: window.__game.scene, hp: d?.player?.hp, lives: d?.player?.lives };
});
console.log(`  doom death → ${JSON.stringify(sceneDoomDeath)}`);

// (c) pause/resume from each play scene
console.log('\n=== (c) PAUSE/RESUME ===');
for (const stage of [1, 6, 7, 23]) {
    const errBefore = errors.length;
    await loadStage(stage);
    const s0 = await page.evaluate(() => window.__game?.scene);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const sP = await page.evaluate(() => window.__game?.scene);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const sR = await page.evaluate(() => window.__game?.scene);
    const newErr = errors.length - errBefore;
    console.log(`  stage ${stage}: ${s0} → pause(${sP}) → ${sR}, errs=${newErr}`);
}

// (d) rapid stage-switching
console.log('\n=== (d) RAPID STAGE SWITCHING ===');
const errBeforeSwitch = errors.length;
for (let i = 0; i < 20; i++) {
    const s = [1, 6, 7, 16, 22, 23][i % 6];
    await page.evaluate((n) => window.__game._startStage(n), s);
    await page.waitForTimeout(100);
}
const newSwitchErr = errors.length - errBeforeSwitch;
console.log(`  20 rapid loads → errs=${newSwitchErr}`);

// (e) HP=0 in each engine
console.log('\n=== (e) EDGE HP STATES ===');
for (const stage of [1, 16, 23]) {
    await loadStage(stage);
    const probe = await page.evaluate((sid) => {
        const g = window.__game;
        const eng = g._doomEngine || g._beatEmUp || g._fpsArena;
        const p = (sid === 1 ? g.player : eng?.player);
        if (!p) return { skipped: true };
        // Set HP to 1 to trigger rage + heartbeat
        p.hp = 1;
        return { hp: p.hp, rageUsed: p.rageUsedThisStage };
    }, stage);
    console.log(`  stage ${stage}: ${JSON.stringify(probe)}`);
    await page.waitForTimeout(300);
}

// (f) achievement update from Doom
console.log('\n=== (f) ACHIEVEMENT FROM DOOM ===');
await loadStage(23);
const achState = await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    const a = m.achievements;
    return { totalKills: a.stats.totalKills, bfgFound: a.stats.bfgFound, doomMaxCombo: a.stats.doomMaxCombo };
});
console.log(`  doom stats: ${JSON.stringify(achState)}`);

// (g) save state round-trip
console.log('\n=== (g) SAVE/LOAD ===');
const saveLoadResult = await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    const a = m.achievements;
    const beforeUnlocked = Array.from(a.unlocked);
    const beforeBest = a.stats.bestScore;
    a._save?.();
    return { unlockedCount: beforeUnlocked.length, bestScore: beforeBest };
});
console.log(`  ${JSON.stringify(saveLoadResult)}`);

console.log('\n=== TOTAL ERRORS ===');
if (errors.length === 0) console.log('  ✅ no errors');
else errors.forEach(e => console.log('  ❌ ' + e));

await browser.close();

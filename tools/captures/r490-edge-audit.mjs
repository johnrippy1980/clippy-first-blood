// R490: targeted edge-case audit.
import { chromium } from 'playwright';
const URL = 'http://localhost:8765/';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => errors.push(`PAGE: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 22; });

// (a) Pause from intermediate scenes
console.log('=== PAUSE FROM INTRO SCREENS ===');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
// We're in stageIntro now
let scene = await page.evaluate(() => window.__game.scene);
console.log(`  pre-pause: ${scene}`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const sceneAfter = await page.evaluate(() => window.__game.scene);
console.log(`  after Esc: ${sceneAfter}`);
// Should NOT have gone to pause from stage_intro

// (b) Boss intro pause
await page.evaluate(() => {
    window.__game.scene = 'bossIntro';
    window.__game._bossIntro = { age: 0, done: false };
});
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const bossPauseScene = await page.evaluate(() => window.__game.scene);
console.log(`  boss intro + Esc: ${bossPauseScene}`);

// (c) Achievement persistence — modify state, reload page, verify it persists
console.log('\n=== ACHIEVEMENT PERSISTENCE ===');
const beforeReload = await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    m.achievements.stats.totalKills = 42;
    m.achievements.unlocked.add('first_blood');
    m.achievements._save?.();
    return {
        totalKills: m.achievements.stats.totalKills,
        firstBlood: m.achievements.unlocked.has('first_blood'),
    };
});
console.log(`  before reload: ${JSON.stringify(beforeReload)}`);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const afterReload = await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    return {
        totalKills: m.achievements.stats.totalKills,
        firstBlood: m.achievements.unlocked.has('first_blood'),
    };
});
console.log(`  after reload: ${JSON.stringify(afterReload)}`);
if (beforeReload.firstBlood !== afterReload.firstBlood) {
    errors.push(`Achievement persistence failed: first_blood not preserved`);
}

// (d) ENEMY_STATS undefined types — synth an entity with weird type
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 22; });
await page.evaluate(() => window.__game._startStage(7));
await page.waitForTimeout(3000);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
const probe = await page.evaluate(() => {
    const beat = window.__game._beatEmUp;
    if (!beat) return { skipped: true };
    // Inject a fake-type enemy
    const fake = { x: 100, y: 100, w: 16, h: 16, hp: 1, alive: true, type: 'WEIRD_TYPE', hitFlash: 0 };
    beat.enemies.push(fake);
    // Force a kill via bullet
    beat.bullets.push({ x: 100, y: 100, vx: 0, vy: 0, life: 5 });
    return { injected: true };
});
console.log(`\n=== WEIRD ENEMY TYPE PROBE ===`);
console.log(`  ${JSON.stringify(probe)}`);
await page.waitForTimeout(800);

console.log('\n=== TOTAL ERRORS ===');
if (errors.length === 0) console.log('  ✅ no errors');
else errors.forEach(e => console.log('  ❌ ' + e));

await browser.close();

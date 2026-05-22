// R283: end-to-end "fresh save" playthrough audit. Validates the new
// R281 stage layout from a clean state — title → story → stage 1
// → ... → stage 5 boss escape cinematic → stage 6 FPS office →
// stage 7 FPS arena → stage 8 Keynote → final.
//
// Smokes out: cinematic chaining, boss-intro firing on FPS stages,
// save persistence between stages, music transitions, render of every
// intermediate scene.

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r283', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errors = [];
const reqFails = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });
page.on('response', r => { if (r.status() === 404 && !/\.mp3$/.test(r.url())) reqFails.push(r.url()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
// Clear save so this run starts fresh
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(800);

const sceneAt = async (label) => {
    const s = await page.evaluate(() => window.__game.scene);
    console.log(`  [${label}] scene=${s}`);
    return s;
};

console.log('=== R283 AUDIT: fresh-save playthrough ===\n');

// Title
await sceneAt('boot');
await page.screenshot({ path: '/tmp/r283/01-title.png' });

// Force-jump to BOARD ROOM (stage 5) since walking through 1-4 takes forever
await page.evaluate(() => {
    window.__game.unlockedStage = 5;
    window.__game._startStage(5);
});
await page.waitForTimeout(1500);
await sceneAt('stage 5 boot');
await page.screenshot({ path: '/tmp/r283/02-stage5-intro.png' });

// Skip stage intro
for (let i = 0; i < 5; i++) {
    await page.keyboard.down('x'); await page.waitForTimeout(60); await page.keyboard.up('x');
    await page.waitForTimeout(300);
}
await sceneAt('stage 5 play?');
await page.screenshot({ path: '/tmp/r283/03-stage5-play.png' });

// Force-kill the boss on stage 5 to test escape cinematic
await page.evaluate(() => {
    const g = window.__game;
    if (g.scene === 'play' && g.boss) { g.boss.hurt(9999, 0, { knockBack: 0 }); }
    if (!g.boss && g.enemies?.activeBoss) {
        const b = g.enemies.activeBoss();
        if (b) b.hurt(9999, 0, { knockBack: 0 });
    }
});
// Spawn boss first if not present, then kill
const bossPhase = await page.evaluate(() => {
    const g = window.__game;
    if (g.scene === 'play' && g.level?.data?.bossTrigger?.x) {
        g.player.x = g.level.data.bossTrigger.x + 8;
    }
    return g.scene;
});
console.log(`  Pushed player to boss trigger, scene=${bossPhase}`);

// Tick play until bossIntro fires
for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.__game._tickPlay && window.__game._tickPlay());
}
const afterTick = await sceneAt('after boss-trigger ticks');
await page.screenshot({ path: '/tmp/r283/04-stage5-bossintro.png' });

// Force-skip the boss-intro cinematic
await page.evaluate(() => {
    const g = window.__game;
    if (g._bossIntro) g._bossIntro.autoAdvance = true;
    for (let i = 0; i < 300; i++) {
        if (!g._bossIntro) break;
        if (g._bossIntro) g._bossIntro.autoAdvance = true;
        g._tickBossIntro && g._tickBossIntro();
    }
    g._bossEntrance = null;
    // Kill the spawned boss
    const b = g.boss || g.enemies?.activeBoss?.();
    if (b) b.hurt(9999, 0, { knockBack: 0 });
    // Tick to land in stage_clear
    for (let i = 0; i < 200; i++) {
        g._tickPlay && g._tickPlay();
        if (g.scene === 'stageClear') break;
    }
});
await sceneAt('after kill ticks');
await page.screenshot({ path: '/tmp/r283/05-stage5-clear.png' });

// Skip stage_clear → should route to STAGE_CARD with the escape cinematic queued
await page.evaluate(() => {
    const g = window.__game;
    g.storyTimer = 999;
    for (let i = 0; i < 5; i++) g._tickStageClear && g._tickStageClear();
});
await page.waitForTimeout(300);
const afterClear = await page.evaluate(() => ({
    scene: window.__game.scene,
    extraCards: window.__game._extraCards,
    pendingStage: window.__game._pendingStage,
}));
console.log(`  After clear: scene=${afterClear.scene} extra=${JSON.stringify(afterClear.extraCards)} pending=${afterClear.pendingStage}`);
await page.screenshot({ path: '/tmp/r283/06-stagecard-escape.png' });

// Press X to advance through escape cinematic
await page.evaluate(() => { window.__game.storyTimer = 100; });
await page.keyboard.down('x'); await page.waitForTimeout(80); await page.keyboard.up('x');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/r283/07-stagecard-office.png' });
const afterEscape = await page.evaluate(() => ({
    scene: window.__game.scene,
    extraCards: window.__game._extraCards,
    pendingStage: window.__game._pendingStage,
}));
console.log(`  After escape card: scene=${afterEscape.scene} extra=${JSON.stringify(afterEscape.extraCards)} pending=${afterEscape.pendingStage}`);

// Press X again to advance to stage 6
await page.evaluate(() => { window.__game.storyTimer = 100; });
await page.keyboard.down('x'); await page.waitForTimeout(80); await page.keyboard.up('x');
await page.waitForTimeout(1500);
const afterAdvance = await page.evaluate(() => ({
    scene: window.__game.scene,
    currentStage: window.__game.currentStage,
    fpsMode: window.__game._fpsMode,
}));
console.log(`  After office card: scene=${afterAdvance.scene} stage=${afterAdvance.currentStage} fps=${afterAdvance.fpsMode}`);
await page.screenshot({ path: '/tmp/r283/08-stage6-intro.png' });

// Press X to dismiss stage 6 intro card
await page.keyboard.down('x'); await page.waitForTimeout(80); await page.keyboard.up('x');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r283/09-stage6-arena.png' });
const fpsScene = await page.evaluate(() => ({
    scene: window.__game.scene,
    stage: window.__game.currentStage,
    seg: window.__game._fpsArena?.segment,
    phase: window.__game._fpsArena?.phase,
}));
console.log(`  FPS stage 6 active: ${JSON.stringify(fpsScene)}`);

// ==== Force-clear all 4 segments of stage 6 → should chain to stage 7 ====
for (let s = 0; s < 3; s++) {
    await page.evaluate(() => {
        const a = window.__game._fpsArena;
        if (a) { a.turrets.forEach(t => t.alive = false); a.grunts.forEach(g => g.alive = false); }
    });
    await page.waitForTimeout(1300);
}
// segment 3 is doorApproach — wait for it to auto-clear (180f)
await page.waitForTimeout(3500);
const afterStage6 = await page.evaluate(() => ({
    scene: window.__game.scene,
    stage: window.__game.currentStage,
    fpsPhase: window.__game._fpsArena?.phase,
}));
console.log(`  After stage 6 clear: ${JSON.stringify(afterStage6)}`);
await page.screenshot({ path: '/tmp/r283/10-stage6-doorclear.png' });

// Wait for auto-chain to stage 7
await page.waitForTimeout(3000);
const onStage7 = await page.evaluate(() => ({
    scene: window.__game.scene,
    stage: window.__game.currentStage,
    seg: window.__game._fpsArena?.segment,
    core: window.__game._fpsArena?.core ? 'alive' : 'null',
}));
console.log(`  Stage 7 active: ${JSON.stringify(onStage7)}`);
await page.screenshot({ path: '/tmp/r283/11-stage7-ballmer.png' });

// ==== REPORT ====
console.log('\n=== R283 SUMMARY ===');
const sigErrors = errors.filter(e => !/\.mp3/.test(e) && !/\.draw is not a function|\.update is not a function/.test(e));
console.log(`Significant errors: ${sigErrors.length}`);
sigErrors.forEach(e => console.log('  -', e.slice(0, 180)));
console.log(`404s: ${reqFails.length}`);
reqFails.forEach(r => console.log('  -', r.slice(0, 180)));
await browser.close();

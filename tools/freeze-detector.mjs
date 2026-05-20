// Freeze detector — plays every stage with simulated inputs and reports
// any frame window where the world stops responding. Catches the class
// of bug the user has been hitting (boss-encounter freezes, stuck-in-cover,
// state-machine traps) that don't show up in the API-direct smoke tests.
//
// Per stage:
//   1. Force-skip stage intro
//   2. Press X (shoot) + arrow-right held for 8 seconds
//   3. Sample player.x, scene, bullet count, enemy count every 30 frames
//   4. If 90 frames pass with NO change → FREEZE
//   5. Spawn boss at end, X-spam another 6 seconds, ensure boss takes hits
//
// Exits non-zero on any freeze. Output is one PASS/FAIL line per stage.

import { chromium } from 'playwright';

const STAGES = [1, 2, 3, 4, 5, 6, 7, 8];
const SAMPLE_F = 30;        // sample every 30 frames (~500ms)
const FREEZE_F = 120;       // 120 frames of no change = freeze
const PLAY_DURATION = 8000; // 8s of run+shoot per stage
const BOSS_DURATION = 6000; // 6s vs boss

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errors = [];

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(500);

async function snapshot() {
    return await page.evaluate(() => {
        const g = window.__game;
        return {
            scene: g.scene,
            playerX: g.player?.x ?? null,
            playerHp: g.player?.hp ?? null,
            playerLives: g.player?.lives ?? null,
            playerState: g.player?.state ?? null,
            bulletsActive: g.player?.bullets?.length ?? 0,
            enemyCount: g.enemies?.enemies?.length ?? 0,
            bossHp: g.enemies?.activeBoss()?.hp ?? null,
            slowMo: g.slowMoFrames || 0,
            hitPause: g.player?.hitPauseFrames || 0,
            iFrames: g.player?.iFrames || 0,
        };
    });
}

function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    for (const k of Object.keys(a)) if (a[k] !== b[k]) return false;
    return true;
}

async function freezeCheck(label, durationMs) {
    const samples = [];
    const interval = 250; // sample every 250ms (~15 game-frames)
    const ticks = Math.floor(durationMs / interval);
    let lastChange = 0;
    let prev = await snapshot();
    samples.push({ t: 0, ...prev });
    for (let i = 1; i <= ticks; i++) {
        await page.waitForTimeout(interval);
        const cur = await snapshot();
        samples.push({ t: i * interval, ...cur });
        // Scenes other than 'play' mean we already transitioned — that's a
        // successful state change, not a freeze. Anything past 'play' (e.g.
        // stageClear from a boss kill, gameOver from death) is a win for
        // this test. Stop sampling there.
        if (cur.scene !== 'play') return true;
        // Detect change in any of: position, scene, hp, bullet count, enemy count,
        // boss hp. If nothing changes for FREEZE_F frames worth of samples, freeze.
        const changed = !deepEqual(
            { x: prev.playerX, scene: prev.scene, hp: prev.playerHp,
              bullets: prev.bulletsActive, enemies: prev.enemyCount,
              bossHp: prev.bossHp },
            { x: cur.playerX, scene: cur.scene, hp: cur.playerHp,
              bullets: cur.bulletsActive, enemies: cur.enemyCount,
              bossHp: cur.bossHp }
        );
        if (changed) lastChange = i;
        prev = cur;
        if ((i - lastChange) >= 8) {
            errors.push(`FREEZE in ${label}: no change for ${(i - lastChange) * interval}ms — final state: ${JSON.stringify(cur)}`);
            return false;
        }
    }
    return true;
}

async function runStage(stage) {
    // Release ALL keys before each stage to prevent input state pollution
    // between runs. Without this, a key held in the previous stage can
    // remain "down" when the new stage begins.
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'x', 'z', 'c', 'v']) {
        await page.keyboard.up(k).catch(() => {});
    }
    // Boot fresh stage
    await page.evaluate((s) => {
        const g = window.__game;
        g._startStage(s);
        g.transition = 0;
        g.transitionTarget = null;
        g.storyTimer = 9999;
        g.scene = 'play';
        // Clear in-flight bullets to start clean
        if (g.player?.bullets) g.player.bullets.length = 0;
    }, stage);
    await page.waitForTimeout(400);

    // Run + shoot: hold ArrowRight + spam x
    await page.keyboard.down('ArrowRight');
    const shootInterval = setInterval(() => { page.keyboard.press('x').catch(() => {}); }, 100);

    const playOk = await freezeCheck(`stage${stage}-play`, PLAY_DURATION);

    clearInterval(shootInterval);
    await page.keyboard.up('ArrowRight');

    if (!playOk) return false;

    // Spawn boss + fight
    await page.evaluate(() => {
        const g = window.__game;
        g.player.x = (g.level.data.width - 6) * 16;
        g.camera.x = Math.max(0, g.player.x - 128);
        g._spawnBoss();
        g._finishBossIntro();
    });
    await page.waitForTimeout(800);

    // Boss fight: shoot heavily
    const bossShoot = setInterval(() => { page.keyboard.press('x').catch(() => {}); }, 80);
    const bossOk = await freezeCheck(`stage${stage}-boss`, BOSS_DURATION);
    clearInterval(bossShoot);
    return bossOk;
}

console.log(`Freeze detector — testing ${STAGES.length} stages (${PLAY_DURATION/1000}s play + ${BOSS_DURATION/1000}s boss each)`);
for (const stage of STAGES) {
    const ok = await runStage(stage);
    console.log(`  stage ${stage}: ${ok ? 'OK' : 'FREEZE'}`);
}

await browser.close();

if (errors.length) {
    console.error('\n=== FREEZES ===');
    for (const e of errors) console.error(e);
    process.exit(1);
}
console.log('\n✅ No freezes detected');

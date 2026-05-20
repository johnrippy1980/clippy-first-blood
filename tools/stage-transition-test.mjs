// Stage-transition stress test — replicates the bug user reported in
// stage 3/4 where Clippy can't move and falls through floor.
//
// Theory: previous-stage boss-kill happens while player is mid-action
// (pounce, grapple, slide, dash, cover). The action's state machine
// carries into the next stage, blocking input or putting Clippy in
// PRONE-hitbox geometry on a floor that doesn't expect it.
//
// Method:
//   For each [from-state, to-stage] pair:
//     1. Spawn stage `from-stage` with a boss
//     2. Force-set player.state to a transient action state
//     3. Kill the boss (triggering _onStageClear)
//     4. Wait for stage transition to next stage
//     5. Verify player can move on the next stage (x changes after right-hold)
//
// Reports any combo that produces a stuck player.

import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errors = [];

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(500);

// Each test case: kill boss while player is in a specific state, then verify
// the next stage spawns clean. We test stages 2→3, 3→4, 4→5 which are the
// stages the user reported issues with.
const TRANSITIONS = [
    { from: 1, to: 2, states: ['idle', 'pounce', 'grapple', 'cover', 'slide', 'roll', 'dash_attack', 'backdash'] },
    { from: 2, to: 3, states: ['idle', 'pounce', 'grapple', 'cover', 'slide', 'roll', 'dash_attack', 'backdash'] },
    { from: 3, to: 4, states: ['idle', 'pounce', 'grapple', 'cover', 'slide', 'roll', 'dash_attack', 'backdash'] },
    { from: 4, to: 5, states: ['idle', 'pounce', 'grapple', 'cover', 'slide', 'roll', 'dash_attack', 'backdash'] },
];

for (const { from, to, states } of TRANSITIONS) {
    for (const lockState of states) {
        const result = await page.evaluate(async ({ fromStage, lockState }) => {
            const g = window.__game;
            // Start the from-stage clean
            g._startStage(fromStage);
            g.transition = 0;
            g.transitionTarget = null;
            g.storyTimer = 9999;
            g.scene = 'play';
            // Place player near boss trigger + spawn boss directly
            g.player.x = (g.level.data.width - 6) * 16;
            g.camera.x = Math.max(0, g.player.x - 128);
            g._spawnBoss();
            g._finishBossIntro();
            // Wait one tick for boss to exist
            await new Promise(r => setTimeout(r, 100));
            const boss = g.enemies.activeBoss();
            if (!boss) return { ok: false, msg: 'no boss spawned' };
            // Force player into the trapped state, then kill boss
            const stateUpper = lockState.toUpperCase();
            // STATE enum is string-keyed; just write the value directly
            g.player.state = lockState;
            // Set some plausible timers so the state-tick has work to do
            g.player.rollTimer = 12;
            g.player.slideTimer = 12;
            g.player.dashAtkTimer = 12;
            g.player.backdashTimer = 12;
            g.player._grappleAnchor = { x: g.player.x + 30, y: g.player.y - 30 };
            g.player._grappleTimer = 0;
            g.player.pounceTimer = 12;
            // Kill the boss
            boss.hp = 0;
            boss.alive = false;
            return { ok: true };
        }, { fromStage: from, lockState });
        if (!result.ok) {
            errors.push(`SETUP FAIL: ${from}→${to} (state=${lockState}): ${result.msg}`);
            continue;
        }
        // Let stageClear panel fire + auto-advance to next stage
        // STAGE_CLEAR_DUR is around 240f = 4s. Wait extra for safety.
        await page.waitForTimeout(6000);

        // Now we should be on the next stage. Check player can move.
        const probe = await page.evaluate(() => {
            const g = window.__game;
            return {
                stage: g.currentStage,
                scene: g.scene,
                playerX: g.player?.x,
                playerState: g.player?.state,
                playerH: g.player?.h,
            };
        });

        // Force-skip any intro and try to move
        await page.evaluate(() => {
            const g = window.__game;
            g.transition = 0;
            g.transitionTarget = null;
            g.storyTimer = 9999;
            g.scene = 'play';
        });
        await page.waitForTimeout(200);
        const beforeX = await page.evaluate(() => window.__game.player?.x);
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(800);
        await page.keyboard.up('ArrowRight');
        const afterX = await page.evaluate(() => window.__game.player?.x);
        const moved = (afterX - beforeX) > 8;
        const finalState = await page.evaluate(() => ({
            playerState: window.__game.player?.state,
            playerY: window.__game.player?.y,
            levelHeight: window.__game.level?.height,
            scene: window.__game.scene,
        }));
        if (!moved) {
            errors.push(
                `STUCK: ${from}→${to} (locked in '${lockState}' before kill): ` +
                `player didn't move on next stage. before=${beforeX?.toFixed(0)}, after=${afterX?.toFixed(0)}, ` +
                `final=${JSON.stringify(finalState)}`
            );
        }
        // Also check if player fell out of world (y > level.height + 50)
        if (finalState.playerY > (finalState.levelHeight || 9999) + 50) {
            errors.push(
                `FELL: ${from}→${to} (locked in '${lockState}'): ` +
                `player y=${finalState.playerY} past level height ${finalState.levelHeight}`
            );
        }
    }
    console.log(`${from}→${to}: tested ${states.length} action states`);
}

await browser.close();

if (errors.length) {
    console.error('\n=== FAILURES ===');
    for (const e of errors) console.error(e);
    process.exit(1);
}
console.log('\n✅ All stage transitions survived state-locked boss kills');

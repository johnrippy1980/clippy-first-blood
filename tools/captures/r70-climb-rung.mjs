// Verify audio.sfx('climbRung') fires every ~14 frames while climbing,
// and stays silent while holding still on the ladder.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const { audio } = await import('/src/audio.js');
    const { input } = await import('/src/input.js');
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(3); } catch (e) { /* stage 3 has ladders */ }
    await new Promise(r => setTimeout(r, 200));

    const player = g.player;
    const level = g.level;

    // Spy audio.sfx
    const calls = [];
    const orig = audio.sfx.bind(audio);
    audio.sfx = (name) => { calls.push(name); return orig(name); };

    // Force player into climb state
    const STATE = (await import('/src/constants.js')).STATE;
    player.state = STATE.CLIMB;
    player.onLadder = true;
    // Place player at a known ladder tile in the loaded stage (stage 3 has ladderT at row 6, col 9, h=8)
    // 16px tiles → x ~ 9*16 = 144, y ~ 8*16 = 128
    player.x = 9 * 16;
    player.y = 8 * 16;

    // Stub _atLadder so it stays on
    player._atLadder = () => true;

    // Stub input.axis to drive vy upward
    const origAxis = input.axis;
    input.axis = () => ({ x: 0, y: -1 });

    // Drive 30 frames of climbing — expect 2 rung ticks (every 14f)
    let climbCalls = 0;
    for (let i = 0; i < 30; i++) {
        player._handleClimb(level);
    }
    climbCalls = calls.filter(c => c === 'climbRung').length;

    // Now hold still — y=0
    input.axis = () => ({ x: 0, y: 0 });
    for (let i = 0; i < 30; i++) {
        player._handleClimb(level);
    }
    const idleClimbCalls = calls.filter(c => c === 'climbRung').length;

    input.axis = origAxis;
    audio.sfx = orig;
    return {
        climbCallsAfterMoving: climbCalls,
        climbCallsAfterIdle: idleClimbCalls,
    };
});
console.log('Climb rung:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.climbCallsAfterMoving >= 2  // 30 frames @ every 14f → 2 ticks
    && result.climbCallsAfterIdle === result.climbCallsAfterMoving;  // no new ticks while idle
process.exit(ok ? 0 : 1);

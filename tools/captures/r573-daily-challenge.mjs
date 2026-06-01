// R573: verify Daily Challenge wiring — challenge determinism, modifier
// application on the live Player / PickupManager, and the submit payload
// routing to the per-day 'daily' board. Also captures the story banner.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r573';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);

// Drive a daily run for a forced challenge by overriding today's challenge,
// then launching via the same path the menu uses. We force AUSTERITY (noPickups
// + oneLife) and IRON MAN (oneLife + doubleDamage) to exercise every modifier.
async function launchDaily(forcedMods, forcedName) {
    return await page.evaluate(({ forcedMods, forcedName }) => {
        const g = window.__game;
        g._restartRun();
        // Arm a daily run with a forced challenge (bypass date rotation).
        g.runId = window.__leaderboard.newRunId();
        g.runCheckpoints = [];
        g._runWarped = false;
        g._leaderboardSubmitted = false;
        g.dailyMode = true;
        g.dailyChallenge = { id: 'test', name: forcedName, desc: 'TEST', mods: forcedMods, day: '20260531' };
        // Start stage 1 directly (skip the story screen).
        g._startStage(1);
        const p = g.player;
        return {
            hasPlayer: !!p,
            lives: p ? p.lives : null,
            damageTakenMult: p ? p.damageTakenMult : null,
            suppressDrops: g.pickups.suppressDrops,
            pickupCount: g.pickups.pickups.length,
        };
    }, { forcedMods, forcedName });
}

const austerity = await launchDaily({ noPickups: true, oneLife: true }, 'AUSTERITY');
console.log('AUSTERITY:', JSON.stringify(austerity));

const ironman = await launchDaily({ oneLife: true, doubleDamage: true }, 'IRON MAN');
console.log('IRON MAN :', JSON.stringify(ironman));

// Verify damage doubling actually bites: hp drop from a 1-dmg hit should be 2.
const dmgCheck = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    p.iFrames = 0; p.rageFrames = 0; p.godMode = false; p.shieldCharge = 0;
    p.secondChanceUsed = true;          // skip the bullet-time rescue
    const before = p.hp;
    p.hurt(1, 0);                        // 1 base damage, doubleDamage active
    return { before, after: p.hp, delta: before - p.hp };
});
console.log('damage x2 check:', JSON.stringify(dmgCheck));

// Capture the story banner for a daily run.
await page.evaluate(() => {
    const g = window.__game;
    g._restartRun();
    g.dailyMode = true;
    g.dailyChallenge = { id: 'test', name: 'AUSTERITY', desc: 'NO PICKUPS. ONE LIFE.', mods: { noPickups: true, oneLife: true }, day: '20260531' };
    g.scene = 'story';
    g.storyPage = 0;
    g.storyTimer = 200;   // fully revealed
    g.render();
});
await page.screenshot({ path: OUT + '/daily-story-banner.png' });

// Verify the submit payload routes to mode 'daily' with a dailyKey, by
// stubbing leaderboard.submit and triggering the game-complete submit block.
const submitPayload = await page.evaluate(() => {
    const g = window.__game;
    let captured = null;
    const orig = window.__leaderboard.submit;
    window.__leaderboard.submit = (args) => { captured = args; return Promise.resolve({ ok: true, verified: true }); };
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false;
    g._leaderboardSubmitted = false;
    g.dailyMode = true;
    g.dailyChallenge = { id: 'test', name: 'AUSTERITY', desc: 'X', mods: {}, day: '20260531' };
    g.runStats = { stagesCleared: new Set([1,2,3,4,5,6,7,8,9,10,11,12,13]), noDamageStages: 0, maxCombo: 0, weaponDamage: {} };
    g.player = { score: 42000, kills: 100, maxCombo: 10 };
    g.totalTime = 30000;
    g.scene = 'gameComplete';
    g.storyTimer = 0;
    g._tickGameComplete();   // storyTimer becomes 1 inside -> submit fires
    window.__leaderboard.submit = orig;
    return captured ? { mode: captured.mode, dailyKey: captured.dailyKey, score: captured.score } : null;
});
console.log('submit payload:', JSON.stringify(submitPayload));

await browser.close();

// Assertions.
let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (austerity.lives !== 0) fail('AUSTERITY should set lives=0 (oneLife), got ' + austerity.lives);
if (austerity.suppressDrops !== true) fail('AUSTERITY should suppress drops');
if (austerity.pickupCount !== 0) fail('AUSTERITY should have 0 stage pickups, got ' + austerity.pickupCount);
if (ironman.lives !== 0) fail('IRON MAN should set lives=0 (oneLife)');
if (ironman.damageTakenMult !== 2) fail('IRON MAN should set damageTakenMult=2, got ' + ironman.damageTakenMult);
if (ironman.suppressDrops !== false) fail('IRON MAN should NOT suppress drops');
if (dmgCheck.delta !== 2) fail('doubleDamage: 1 base dmg should remove 2 hp, removed ' + dmgCheck.delta);
if (!submitPayload || submitPayload.mode !== 'daily') fail('submit should route to mode=daily, got ' + JSON.stringify(submitPayload));
if (!submitPayload || submitPayload.dailyKey !== '20260531') fail('submit should carry dailyKey, got ' + JSON.stringify(submitPayload));
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

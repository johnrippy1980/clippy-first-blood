// R572: verify the personal-best detection + overlay on game-complete.
// Drives the real Game instance into GAME_COMPLETE twice:
//   1) fresh achievements stats -> a clean clear must flag a PB (rank+time).
//   2) after the first run wrote bests -> an identical clear must NOT flag.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r572';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.waitForTimeout(300);

// Seed a clean campaign clear and render game-complete. Returns the PB flags.
async function runClear(preBest) {
    return await page.evaluate((preBest) => {
        const g = window.__game;
        // Reset run state, then plant a clean S-tier clear.
        g._restartRun();
        g.scene = 'gameComplete';
        g.totalTime = 10 * 60 * 60;      // 10 min -> good time score
        g.totalDeaths = 0;
        g.runStats = { stagesCleared: new Set([1,2,3,4,5,6,7,8,9,10,11,12,13]),
                       noDamageStages: 6, maxCombo: 30, weaponDamage: {} };
        g.player = { score: 80000, kills: 200, maxCombo: 30, lives: 3 };
        g._runWarped = false;
        g._runRank = null;               // force recompute + PB eval on draw
        g._runPB = null;
        g._preRunBestScore = preBest;    // snapshot as if set at run start
        g.storyTimer = 60;               // past the flash/reveal gates
        // Render one frame -> _drawGameComplete runs the PB eval.
        g.render();
        return {
            pb: g._runPB,
            rank: g._runRank ? g._runRank.letter : null,
            storedTime: window.__achievements.stats.bestCampaignTime,
            storedRank: window.__achievements.stats.bestCampaignRank,
        };
    }, preBest);
}

// Clear stored campaign bests so run #1 is guaranteed a fresh record.
await page.evaluate(() => {
    const s = window.__achievements.stats;
    s.bestCampaignTime = 0;
    s.bestCampaignRank = '';
    s.bestScore = 0;
});

const first = await runClear(0);
console.log('RUN 1 (fresh):', JSON.stringify(first));
await page.screenshot({ path: OUT + '/pb-yes.png' });

// Run #2: identical clear, but bests are now stored from run #1. The
// pre-run snapshot equals the stored high score, so no record should flag.
const second = await runClear(80000);
console.log('RUN 2 (repeat):', JSON.stringify(second));
await page.screenshot({ path: OUT + '/pb-no.png' });

await browser.close();

// Assertions.
let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (!first.pb || !(first.pb.rank && first.pb.time)) fail('run1 should flag rank+time PB, got ' + JSON.stringify(first.pb));
if (first.pb && !first.pb.score) fail('run1 should flag score PB (preBest 0 < 80000)');
if (first.rank !== 'S') fail('run1 expected S rank, got ' + first.rank);
if (first.storedTime !== 10 * 60 * 60) fail('run1 should persist bestCampaignTime');
if (first.storedRank !== 'S') fail('run1 should persist bestCampaignRank S');
if (second.pb && (second.pb.rank || second.pb.time || second.pb.score)) {
    fail('run2 should flag NO PB, got ' + JSON.stringify(second.pb));
}
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

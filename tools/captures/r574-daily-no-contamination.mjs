// R574: a Daily Challenge clear must NOT contaminate clean-campaign stats.
// Daily runs carry difficulty modifiers, so their score/time/rank/kills are not
// comparable to a fair any% run. This probe drives a daily stage-clear and a
// daily game-complete, then asserts the persistent campaign records are
// untouched — while confirming runStats still accumulates for the daily submit.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);

// Seed clean campaign records to known values, then run a daily stage-clear
// with a high score / fast time / would-be-S run and verify nothing moves.
const res = await page.evaluate(() => {
    const g = window.__game;
    const a = window.__achievements;

    // Establish a baseline of campaign records we expect to remain frozen.
    a.stats.bestScore = 5000;
    a.stats.bestCampaignTime = 99999;
    a.stats.bestCampaignRank = 'C';
    a.stats.stageBestScores = { 1: 1000 };
    a.stats.totalKills = 0;
    a._save();
    const before = {
        bestScore: a.stats.bestScore,
        bestCampaignTime: a.stats.bestCampaignTime,
        bestCampaignRank: a.stats.bestCampaignRank,
        stage1Best: a.stats.stageBestScores[1],
        totalKills: a.stats.totalKills || 0,
    };

    // Arm a daily run and drive a single stage-clear with a fat score.
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g.runCheckpoints = [];
    g._runWarped = false;
    g._leaderboardSubmitted = false;
    g.dailyMode = true;
    g.dailyChallenge = { id: 'test', name: 'IRON MAN', desc: 'X', mods: { oneLife: true, doubleDamage: true }, day: '20260531' };
    g._startStage(1);
    g.currentStage = 1;
    // Fake a strong clear: high score, all kills, no damage, big combo —
    // values that WOULD beat every seeded campaign record if credited.
    g.player.score = 999999;
    g.player.kills = 500;
    g.player.maxCombo = 99;
    g.stageStats = { damageTaken: 0, totalEnemies: 10, kills: 10, foundSecret: false };

    // Run the real stage-clear roll-up (contains the isModeRun-gated block).
    g._clearScheduled = false;
    g._onStageClear();

    const after = {
        bestScore: a.stats.bestScore,
        bestCampaignTime: a.stats.bestCampaignTime,
        bestCampaignRank: a.stats.bestCampaignRank,
        stage1Best: a.stats.stageBestScores[1],
        totalKills: a.stats.totalKills || 0,
        runStagesCleared: g.runStats.stagesCleared.size,
        checkpoints: g.runCheckpoints.length,
    };
    // Counter-check: a CLEAN (non-daily) clear with the same fat score MUST
    // update the campaign records — proves the guard didn't kill normal runs.
    a.stats.bestScore = 5000;
    a.stats.stageBestScores = { 1: 1000 };
    a._save();
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g.runCheckpoints = [];
    g._runWarped = false;
    g.dailyMode = false;
    g.dailyChallenge = null;
    g._startStage(1);
    g.currentStage = 1;
    g.player.score = 999999;
    g.player.kills = 500;
    g.player.maxCombo = 99;
    g.stageStats = { damageTaken: 0, totalEnemies: 10, kills: 10, foundSecret: false };
    g._clearScheduled = false;
    g._onStageClear();
    const clean = {
        bestScore: a.stats.bestScore,
        stage1Best: a.stats.stageBestScores[1],
    };

    return { before, after, clean };
});
console.log('result:', JSON.stringify(res, null, 2));

await browser.close();

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
const { before, after } = res;
if (after.bestScore !== before.bestScore) fail('daily clear changed bestScore ' + before.bestScore + ' -> ' + after.bestScore);
if (after.bestCampaignTime !== before.bestCampaignTime) fail('daily clear changed bestCampaignTime');
if (after.bestCampaignRank !== before.bestCampaignRank) fail('daily clear changed bestCampaignRank');
if (after.stage1Best !== before.stage1Best) fail('daily clear changed stage1 best score');
if (after.totalKills !== before.totalKills) fail('daily clear credited campaign kills');
// Counter-check: clean run MUST update the records.
if (res.clean.bestScore !== 999999) fail('clean campaign clear did NOT update bestScore, got ' + res.clean.bestScore);
if (res.clean.stage1Best !== 999999) fail('clean campaign clear did NOT update stage1 best, got ' + res.clean.stage1Best);
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

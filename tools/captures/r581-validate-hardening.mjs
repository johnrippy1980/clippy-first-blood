// R581: server-side leaderboard hardening. Unit-tests the validateRun bounds
// (score/time/stages ceilings, score-rate cap, checkpoint-trail plausibility,
// frame-range checks) added on top of the existing hash + monotonic-trail
// checks. Pure-function tests — no browser, no DB. Run with: node <this>.
import { validateRun, computeHash, partitionKey } from '../../api/_validate.js';

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
const eq = (label, got, exp) => { if (got !== exp) fail(`${label}: got ${got}, expected ${exp}`); };

// Build a correctly-signed run, then let callers tweak fields. Re-sign unless
// the caller is specifically testing a hash mismatch.
function makeRun(over = {}, { resign = true } = {}) {
    const base = {
        runId: 'r-test-1',
        mode: 'any',
        score: 120000,
        timeFrames: 60 * 60 * 5,            // 5 minutes
        stagesCleared: 13,
        checkpoints: [
            { key: 's1', frame: 100 },
            { key: 's7', frame: 9000 },
            { key: 's13', frame: 60 * 60 * 5 - 50 },
        ],
    };
    const run = { ...base, ...over };
    if (over.checkpoints) run.checkpoints = over.checkpoints;
    run.hash = resign ? computeHash(run) : (over.hash ?? 'deadbeef');
    return run;
}

// --- A legitimate run must verify ---
eq('legit any% verifies', validateRun(makeRun()).verified, true);
eq('legit timeTrial verifies',
   validateRun(makeRun({ mode: 'timeTrial', score: 50000 })).verified, true);
eq('legit weekly verifies',
   validateRun(makeRun({ mode: 'weekly' })).verified, true);

// --- Magnitude ceilings ---
{
    const r = validateRun(makeRun({ score: 9_000_000 }));
    eq('score over cap rejected', r.verified, false);
    eq('score over cap reason', r.reason, 'score_too_high');
}
{
    const r = validateRun(makeRun({ timeFrames: 999 * 60 * 60 }));
    eq('time over cap rejected', r.verified, false);
    eq('time over cap reason', r.reason, 'time_too_high');
}
{
    const r = validateRun(makeRun({ stagesCleared: 99 }));
    eq('stages over cap rejected', r.verified, false);
    eq('stages over cap reason', r.reason, 'stages_too_high');
}
{
    const r = validateRun(makeRun({ score: -5 }));
    eq('negative score rejected', r.verified, false);
    eq('negative score reason', r.reason, 'bad_score');
}

// --- Score-rate ceiling: huge score, tiny time, but NOT a full Any% so the
// existing impossible_speed gate doesn't catch it. The rate cap should. ---
{
    // 1 stage, 120 frames (2s), 2,000,000 points → ~16,666 pts/frame >> 1200.
    const r = validateRun(makeRun({
        mode: 'bossRush', score: 2_000_000, timeFrames: 120, stagesCleared: 1,
        checkpoints: [{ key: 's1', frame: 100 }],
    }));
    eq('score-rate fake rejected', r.verified, false);
    eq('score-rate fake reason', r.reason, 'score_rate_impossible');
}

// --- Checkpoint trail plausibility ---
{
    // 1 stage but a 64-deep trail → padded fabrication.
    const cps = Array.from({ length: 64 }, (_, i) => ({ key: 'x', frame: i * 10 }));
    const r = validateRun(makeRun({
        mode: 'bossRush', stagesCleared: 1, score: 5000, timeFrames: 700,
        checkpoints: cps,
    }));
    eq('over-long trail rejected', r.verified, false);
    eq('over-long trail reason', r.reason, 'trail_too_long');
}
{
    // Checkpoint frame after the run end (beyond slop).
    const r = validateRun(makeRun({
        checkpoints: [{ key: 's1', frame: 100 }, { key: 'x', frame: 60 * 60 * 5 + 5000 }],
    }));
    eq('frame-after-end rejected', r.verified, false);
    eq('frame-after-end reason', r.reason, 'frame_after_end');
}
{
    // Negative checkpoint frame.
    const r = validateRun(makeRun({
        checkpoints: [{ key: 's1', frame: -10 }, { key: 's2', frame: 100 }],
    }));
    eq('negative frame rejected', r.verified, false);
    eq('negative frame reason', r.reason, 'bad_frame');
}

// --- Existing guards still fire ---
{
    const r = validateRun(makeRun({}, { resign: false }));
    eq('hash mismatch still rejected', r.verified, false);
    eq('hash mismatch reason', r.reason, 'hash_mismatch');
}
{
    // Out-of-order frames.
    const r = validateRun(makeRun({
        checkpoints: [{ key: 's1', frame: 9000 }, { key: 's2', frame: 100 },
                      { key: 's3', frame: 60 * 60 * 5 - 50 }],
    }));
    eq('out-of-order still rejected', r.verified, false);
    eq('out-of-order reason', r.reason, 'out_of_order');
}
{
    // Full Any% clear in under 30s — impossible_speed.
    const r = validateRun(makeRun({
        timeFrames: 600, stagesCleared: 13, score: 5000,
        checkpoints: [{ key: 's1', frame: 100 }, { key: 's13', frame: 590 }],
    }));
    eq('impossible_speed still rejected', r.verified, false);
    eq('impossible_speed reason', r.reason, 'impossible_speed');
}

// --- partitionKey sanity (unchanged, but guard against regression) ---
eq('weekly key ok', partitionKey('weekly', '2026W22'), '2026W22');
eq('weekly bad week null', partitionKey('weekly', '2026W54'), null);
eq('daily key ok', partitionKey('daily', '20260601'), '20260601');

console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);

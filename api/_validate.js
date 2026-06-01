// Light anti-cheat: validate a run's checkpoint trail is internally
// consistent and that the client-sent hash matches a server recomputation.
// This is the "light version" — it stops casual fake submissions (someone
// POSTing score=99999, time=1), not a determined attacker. Suspicious runs
// are stored with verified=false rather than rejected, so they show on an
// "unverified" board and can be reviewed manually.
import { createHash } from 'node:crypto';

// Must match the secret used client-side to sign submissions. Not a real
// secret (it ships in the bundle) — it only raises the bar past trivial.
const SIGN_SALT = process.env.CFB_SIGN_SALT || 'clippy-bonzi-1997';

const MODES = new Set(['any', 'hundred', 'bossRush', 'timeTrial', 'daily', 'weekly']);

// Modes whose runs are partitioned onto a sub-board by a routing key.
// daily → YYYYMMDD, weekly → <isoYear>W<ww>. Kept here so the API and
// validator agree on which modes require a partition key.
const PARTITIONED_MODES = new Set(['daily', 'weekly']);

// --- Plausibility ceilings ----------------------------------------------
// These reject physically-impossible magnitudes regardless of a valid hash.
// The signing salt ships in the bundle, so a determined faker can produce a
// matching hash for any payload; bounds are the layer that stops "score:
// 99999999, time: 1" even when correctly signed. Set generously above any
// real human run so legitimate players are never flagged.

// Hard cap on score. Real runs land well under 1M; allow a wide margin for
// combo-heavy beat-em-up / FPS clears before calling a submission fake.
const SCORE_MAX = 5_000_000;
// Hard cap on run length: ~3 hours at 60fps. Anything longer is an AFK/idle
// artifact, not a competitive run.
const TIME_MAX = 3 * 60 * 60 * 60;          // 648,000 frames
// Sustained scoring rate ceiling. Even the densest combo corridors don't
// average anywhere near this over a whole run; a tiny-time/huge-score fake
// blows past it. 1200 pts/frame ≈ 72,000 pts/sec.
const MAX_SCORE_PER_FRAME = 1200;
// Per-mode maximum stages a run can legitimately clear. Campaign is 13 main
// stages; the post-game modes have their own fixed structures. Used to reject
// inflated stagesCleared. Modes absent here fall back to a generous default.
const MODE_MAX_STAGES = {
    any: 13, hundred: 13, daily: 13, weekly: 13,
    bossRush: 13, timeTrial: 13,
};
const DEFAULT_MAX_STAGES = 30;              // covers side/post-game tiles
// A checkpoint trail has at most a few entries per stage (stage-enter + boss,
// etc.). Cap relative to stages so a 1-stage run can't ship a 64-deep trail.
const MAX_CHECKPOINTS_PER_STAGE = 6;
const MIN_CHECKPOINT_BUDGET = 8;            // floor so short runs aren't over-tight

// Recompute the submission hash the same way the client does.
export function computeHash({ runId, mode, score, timeFrames, stagesCleared, checkpoints }) {
    const trail = (checkpoints || [])
        .map((c) => `${c.key}:${c.frame}`)
        .join('|');
    const payload = `${runId}|${mode}|${score}|${timeFrames}|${stagesCleared}|${trail}|${SIGN_SALT}`;
    return createHash('sha256').update(payload).digest('hex');
}

// Returns { verified: boolean, reason?: string }. Never throws on bad data —
// returns verified:false so the run is stored but flagged.
export function validateRun(run) {
    const { mode, score, timeFrames, stagesCleared, checkpoints, hash } = run;

    if (!MODES.has(mode)) return { verified: false, reason: 'unknown_mode' };
    if (!Number.isFinite(score) || score < 0) return { verified: false, reason: 'bad_score' };
    if (!Number.isFinite(timeFrames) || timeFrames <= 0) return { verified: false, reason: 'bad_time' };
    if (!Number.isFinite(stagesCleared) || stagesCleared < 0) {
        return { verified: false, reason: 'bad_stages' };
    }

    // Absolute magnitude ceilings — reject impossible values even when the
    // hash matches (the salt is public, so a valid hash proves nothing about
    // honesty). These sit far above any real run.
    if (score > SCORE_MAX) return { verified: false, reason: 'score_too_high' };
    if (timeFrames > TIME_MAX) return { verified: false, reason: 'time_too_high' };
    const maxStages = MODE_MAX_STAGES[mode] ?? DEFAULT_MAX_STAGES;
    if (stagesCleared > maxStages) return { verified: false, reason: 'stages_too_high' };

    // Hash must match — proves the trail wasn't hand-edited after signing.
    if (hash !== computeHash(run)) return { verified: false, reason: 'hash_mismatch' };

    const cps = Array.isArray(checkpoints) ? checkpoints : [];
    if (cps.length === 0) return { verified: false, reason: 'no_checkpoints' };

    // Checkpoint trail can't be deeper than a few entries per stage cleared —
    // a 1-stage run shipping a 64-deep trail is fabricated padding.
    const cpBudget = Math.max(MIN_CHECKPOINT_BUDGET,
        (stagesCleared + 1) * MAX_CHECKPOINTS_PER_STAGE);
    if (cps.length > cpBudget) return { verified: false, reason: 'trail_too_long' };

    // Frames must be monotonically non-decreasing — checkpoint N can't happen
    // before checkpoint N-1 — and must sit within the run's own timeline.
    for (let i = 0; i < cps.length; i++) {
        const f = cps[i].frame;
        if (!Number.isFinite(f) || f < 0) return { verified: false, reason: 'bad_frame' };
        if (f > timeFrames + 1200) return { verified: false, reason: 'frame_after_end' };
        if (i > 0 && f < cps[i - 1].frame) return { verified: false, reason: 'out_of_order' };
    }

    // The final checkpoint frame should match the reported run time (within a
    // small slop for the post-boss cinematic frames).
    const lastFrame = cps[cps.length - 1].frame;
    if (Math.abs(lastFrame - timeFrames) > 1200) {
        return { verified: false, reason: 'time_trail_mismatch' };
    }

    // Sustained scoring-rate ceiling — catches "huge score, tiny time" fakes
    // for every mode (not just full Any% clears). No legitimate run averages
    // anywhere near MAX_SCORE_PER_FRAME over its full length.
    if (score / timeFrames > MAX_SCORE_PER_FRAME) {
        return { verified: false, reason: 'score_rate_impossible' };
    }

    // Reject physically impossible speeds: a full Any% run touches every main
    // stage; fewer than ~30s total is not humanly plausible for a real clear.
    if (mode === 'any' && stagesCleared >= 13 && timeFrames < 30 * 60) {
        return { verified: false, reason: 'impossible_speed' };
    }

    return { verified: true };
}

// Normalize a partition key for a partitioned mode. daily keys are 8 digits
// (YYYYMMDD); weekly keys are "<isoYear>W<ww>" (e.g. 2026W22). Returns the
// cleaned key, or null if it doesn't fit the mode's shape.
function partitionKey(mode, raw) {
    const s = String(raw ?? '').toUpperCase();
    if (mode === 'daily') {
        const d = s.replace(/[^0-9]/g, '').slice(0, 8);
        return d.length === 8 ? d : null;
    }
    if (mode === 'weekly') {
        const m = s.replace(/[^0-9W]/g, '').match(/^(\d{4})W(\d{2})$/);
        if (!m) return null;
        const wk = parseInt(m[2], 10);
        if (wk < 1 || wk > 53) return null;
        return `${m[1]}W${m[2]}`;
    }
    return null;
}

export { MODES, PARTITIONED_MODES, partitionKey };

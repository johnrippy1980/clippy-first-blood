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

const MODES = new Set(['any', 'hundred', 'bossRush', 'timeTrial', 'daily']);

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

    // Hash must match — proves the trail wasn't hand-edited after signing.
    if (hash !== computeHash(run)) return { verified: false, reason: 'hash_mismatch' };

    const cps = Array.isArray(checkpoints) ? checkpoints : [];
    if (cps.length === 0) return { verified: false, reason: 'no_checkpoints' };

    // Frames must be monotonically non-decreasing — checkpoint N can't happen
    // before checkpoint N-1.
    for (let i = 1; i < cps.length; i++) {
        if (!Number.isFinite(cps[i].frame) || cps[i].frame < cps[i - 1].frame) {
            return { verified: false, reason: 'out_of_order' };
        }
    }

    // The final checkpoint frame should match the reported run time (within a
    // small slop for the post-boss cinematic frames).
    const lastFrame = cps[cps.length - 1].frame;
    if (Math.abs(lastFrame - timeFrames) > 1200) {
        return { verified: false, reason: 'time_trail_mismatch' };
    }

    // Reject physically impossible speeds: a full Any% run touches every main
    // stage; fewer than ~30s total is not humanly plausible for a real clear.
    if (mode === 'any' && stagesCleared >= 13 && timeFrames < 30 * 60) {
        return { verified: false, reason: 'impossible_speed' };
    }

    return { verified: true };
}

export { MODES };

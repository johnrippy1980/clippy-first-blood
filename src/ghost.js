// Ghost replay. Records the player's path through a stage and plays the
// fastest recorded run back as a translucent silhouette to race against.
//
// Why a path recording and not an input replay: the game's simulation is not
// deterministic (enemy AI, particles, drops, camera all roll Math.random with
// no seeded PRNG), so replaying recorded inputs would desync within seconds.
// Recording the resolved player position each frame sidesteps that entirely —
// the ghost is sampled data, not a re-simulation, so it always plays back
// exactly as it was recorded.
//
// Scope: per-stage best, by stage clear time (frames). Only clean campaign
// runs record (the caller gates out daily/training/boss-rush/warp), so a
// ghost is always a fair pace to chase. Persisted to localStorage, one best
// path per stage.

const STORE_KEY = 'clippy_ghosts';
const STORE_VERSION = 1;
// Sample every N play-frames. 3 ≈ 20 Hz at 60 fps — smooth on playback once
// interpolated, at a third the storage of full-rate capture.
const SAMPLE_EVERY = 3;
// Hard cap on samples per stage so a pathological run (AFK, stuck) can't bloat
// localStorage. 4000 samples ≈ 200 s of stage time at 20 Hz — far beyond any
// real clear.
const MAX_SAMPLES = 4000;

class Ghost {
    constructor() {
        this._store = this._load();
        // Live recording state (null when not recording).
        this._rec = null;
        // Active playback path for the current stage (null when none / disabled).
        this._play = null;
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return { version: STORE_VERSION, stages: {} };
            const data = JSON.parse(raw);
            if (!data || data.version !== STORE_VERSION || typeof data.stages !== 'object') {
                return { version: STORE_VERSION, stages: {} };
            }
            return data;
        } catch {
            return { version: STORE_VERSION, stages: {} };
        }
    }

    _save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this._store)); } catch { /* private mode / quota */ }
    }

    // Does a best ghost exist for this stage?
    hasGhost(stage) {
        return !!this._store.stages[stage];
    }

    bestTime(stage) {
        const g = this._store.stages[stage];
        return g ? g.time : 0;
    }

    // Begin recording a fresh path for a stage. Discards any in-flight rec.
    startRecording(stage) {
        this._rec = { stage, samples: [], every: SAMPLE_EVERY };
    }

    // Called once per play-frame with the resolved player position. frame is
    // the per-stage frame counter (game.stageTime). Records on the sample
    // cadence; a no-op when not recording or past the cap.
    record(frame, x, y, facing) {
        const r = this._rec;
        if (!r) return;
        if (frame % r.every !== 0) return;
        if (r.samples.length >= MAX_SAMPLES) return;
        // Store rounded ints — sub-pixel precision isn't visible and keeps the
        // serialized path compact.
        r.samples.push([Math.round(x), Math.round(y), facing < 0 ? -1 : 1]);
    }

    // Finish the in-flight recording. Persists it as the stage's best only if
    // it beats the stored time (or none exists). stageTimeFrames is the clear
    // time used to rank. Returns true if a new best was stored.
    finishRecording(stage, stageTimeFrames) {
        const r = this._rec;
        this._rec = null;
        if (!r || r.stage !== stage || r.samples.length === 0) return false;
        const prev = this._store.stages[stage];
        if (prev && prev.time > 0 && stageTimeFrames >= prev.time) return false;
        this._store.stages[stage] = {
            time: stageTimeFrames,
            every: r.every,
            samples: r.samples,
        };
        this._save();
        return true;
    }

    // Drop the in-flight recording without saving (e.g. on death / stage abort).
    abortRecording() {
        this._rec = null;
    }

    // Arm playback of a stage's best path. No-op (clears playback) if there's
    // no ghost for the stage. Call at stage start.
    startPlayback(stage) {
        const g = this._store.stages[stage];
        this._play = g ? { samples: g.samples, every: g.every } : null;
        // Precompute a monotonic "furthest-X-reached" curve so pace deltas can
        // be computed by progress rather than raw X. Stages backtrack and the
        // raw path is not monotonic in X; the cumulative max is, which is what
        // "how far into the stage" actually means for a left-to-right run.
        this._progress = null;
        if (this._play) {
            const s = g.samples;
            const maxX = new Array(s.length);
            let m = -Infinity;
            for (let i = 0; i < s.length; i++) { if (s[i][0] > m) m = s[i][0]; maxX[i] = m; }
            this._progress = { maxX, every: g.every, time: g.time };
        }
    }

    stopPlayback() {
        this._play = null;
        this._progress = null;
    }

    get playing() { return !!this._play; }

    // Interpolated ghost position at a per-stage frame, or null if playback is
    // off or the frame is past the recorded path (ghost already finished, i.e.
    // you're now behind your best pace — the ghost has crossed the line).
    posAt(frame) {
        const p = this._play;
        if (!p) return null;
        const fpos = frame / p.every;
        const i = Math.floor(fpos);
        const a = p.samples[i];
        if (!a) return null;                 // past the end of the recording
        const b = p.samples[i + 1] || a;     // clamp at the final sample
        const t = fpos - i;
        return {
            x: a[0] + (b[0] - a[0]) * t,
            y: a[1] + (b[1] - a[1]) * t,
            facing: a[2],
        };
    }

    // Pace delta in frames: how far ahead (+) or behind (−) your best run you
    // are RIGHT NOW, measured by stage progress (furthest X reached), not by
    // the ghost's on-screen position. Returns the difference between the frame
    // the ghost first reached your current progress and the current frame.
    //   +N  → you're N frames ahead of your best pace (you got here sooner)
    //   −N  → you're N frames behind
    // Returns null when there's no ghost or the comparison isn't meaningful
    // yet (no forward progress, or you've already passed the ghost's furthest
    // point — you're in record territory).
    paceDeltaFrames(currentFrame, playerX) {
        const pr = this._progress;
        if (!pr) return null;
        const maxX = pr.maxX;
        const last = maxX[maxX.length - 1];
        if (last === undefined) return null;
        // Beyond the ghost's furthest progress: you've out-run the recording.
        if (playerX >= last) return null;
        // First sample index where the ghost's furthest-X reaches playerX.
        // maxX is non-decreasing → binary search for the lower bound.
        let lo = 0, hi = maxX.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (maxX[mid] < playerX) lo = mid + 1; else hi = mid;
        }
        // The frame the ghost was at when it first reached this progress.
        const ghostFrame = lo * pr.every;
        return ghostFrame - currentFrame;
    }
}

export const ghost = new Ghost();

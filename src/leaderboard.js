// Leaderboard client. Submits a finished run to /api/runs and fetches boards
// for display. Signing mirrors api/_validate.js exactly — same field order,
// same salt, same SHA-256 — so the server can verify the run.
//
// Everything here is best-effort and non-blocking: if the API is unreachable
// (offline, local file:// open, store not yet provisioned) submit/fetch resolve
// to a soft failure and the game carries on. The leaderboard is a bonus layer,
// never a gate on play.

const API = '/api/runs';
const NAME_KEY = 'clippy_lb_name';

// Must match CFB_SIGN_SALT default in api/_validate.js. This ships in the
// bundle — it only raises the bar above trivial fake POSTs, not real attackers.
const SIGN_SALT = 'clippy-bonzi-1997';

async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

class Leaderboard {
    constructor() {
        this._name = null;
        try { this._name = localStorage.getItem(NAME_KEY); } catch { /* private mode */ }
        // Last fetched board, keyed by mode, for the LEADERBOARD scene to draw
        // without re-requesting every frame. { entries, status, fetchedAt }.
        this._cache = new Map();
        // R694: rank of this session's last VERIFIED submit, keyed by mode —
        // { rank, total, day }. Session-only on purpose: a persisted rank goes
        // stale as other players submit, so we never show one across reloads.
        this._lastRank = new Map();
    }

    // Stable per-run id. crypto.randomUUID where available, else a cheap fallback.
    newRunId() {
        try { return 'r-' + crypto.randomUUID(); } catch { /* older browser */ }
        return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    get name() { return this._name; }
    setName(name) {
        this._name = String(name || '').toUpperCase().slice(0, 16) || 'AAA';
        try { localStorage.setItem(NAME_KEY, this._name); } catch { /* private mode */ }
        return this._name;
    }

    // Compute the same hash the server recomputes. Field order is load-bearing.
    async _sign({ runId, mode, score, timeFrames, stagesCleared, checkpoints }) {
        const trail = (checkpoints || []).map((c) => `${c.key}:${c.frame}`).join('|');
        const payload = `${runId}|${mode}|${score}|${timeFrames}|${stagesCleared}|${trail}|${SIGN_SALT}`;
        return sha256Hex(payload);
    }

    // Modes whose runs are partitioned onto a sub-board by a routing key
    // (the daily challenge's date, the weekly board's ISO-week). The key rides
    // along as `dailyKey` in the body / `day` in the query — reusing the same
    // partition column server-side — but it is NEVER part of the signed hash.
    static PARTITIONED = new Set(['daily', 'weekly']);

    // Submit a finished run. Returns { ok, verified?, reason?, error? }.
    // dailyKey is required for partitioned modes ('daily' → YYYYMMDD,
    // 'weekly' → <isoYear>W<ww>) — it routes the run onto the right sub-board.
    // It is NOT part of the signed hash (it's a routing key, not a scored
    // value), so it's added after signing.
    async submit({ runId, name, mode, score, timeFrames, stagesCleared, checkpoints, dailyKey }) {
        if (!runId) return { ok: false, error: 'no_run_id' };
        const playerName = this.setName(name || this._name || 'AAA');
        const body = {
            runId, name: playerName, mode,
            score: Math.floor(score || 0),
            timeFrames: Math.floor(timeFrames || 0),
            stagesCleared: Math.floor(stagesCleared || 0),
            checkpoints: checkpoints || [],
        };
        body.hash = await this._sign(body);
        if (Leaderboard.PARTITIONED.has(mode) && dailyKey) body.dailyKey = String(dailyKey);
        try {
            const res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) return { ok: false, error: 'http_' + res.status };
            const data = await res.json();
            // R694: the server returns this run's board rank (verified runs
            // only). Remember it so the LEADERBOARD scene can show "your last
            // run" on the matching tab. Keyed by day for partitioned boards so
            // yesterday's daily rank never shows against today's board.
            if (data.verified && data.rank) {
                this._lastRank.set(mode, {
                    rank: data.rank,
                    total: data.total || data.rank,
                    day: Leaderboard.PARTITIONED.has(mode) && dailyKey ? String(dailyKey) : null,
                });
            }
            return { ok: true, verified: data.verified, reason: data.reason,
                     rank: data.rank ?? null, total: data.total ?? null };
        } catch (err) {
            return { ok: false, error: String(err?.message || err) };
        }
    }

    // Fetch a board's top entries. Caches the result by cache key. Returns
    // { entries, status }. status: 'ok' | 'error'. For a partitioned board
    // (daily/weekly) pass opts.day (the partition key); the cache key becomes
    // '<mode>:<key>' so different days/weeks don't clobber each other.
    async fetch(mode, limit = 20, opts = {}) {
        const day = opts.day ? String(opts.day) : null;
        const partitioned = Leaderboard.PARTITIONED.has(mode);
        const cacheKey = partitioned && day ? `${mode}:${day}` : mode;
        let url = `${API}?mode=${encodeURIComponent(mode)}&limit=${limit}`;
        if (partitioned && day) url += `&day=${encodeURIComponent(day)}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('http_' + res.status);
            const data = await res.json();
            const entry = { entries: data.entries || [], status: 'ok', fetchedAt: Date.now() };
            this._cache.set(cacheKey, entry);
            return entry;
        } catch (err) {
            const entry = { entries: [], status: 'error', error: String(err?.message || err), fetchedAt: Date.now() };
            this._cache.set(cacheKey, entry);
            return entry;
        }
    }

    cached(mode, day = null) {
        const key = Leaderboard.PARTITIONED.has(mode) && day ? `${mode}:${day}` : mode;
        return this._cache.get(key) || null;
    }

    // R694: rank of this session's last verified submit on a board, or null.
    // For partitioned boards the stored day must match the requested one.
    lastRank(mode, day = null) {
        const r = this._lastRank.get(mode);
        if (!r) return null;
        if (Leaderboard.PARTITIONED.has(mode) && r.day !== (day ? String(day) : null)) return null;
        return r;
    }
}

export const leaderboard = new Leaderboard();

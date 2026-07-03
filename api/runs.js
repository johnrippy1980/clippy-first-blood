// /api/runs — leaderboard read + submit.
//   GET  /api/runs?mode=any&limit=20   → top runs for a board
//   POST /api/runs   { runId, name, mode, score, timeFrames,
//                      stagesCleared, checkpoints, hash }   → submit a run
import { ensureSchema, getSql } from './_db.js';
import { validateRun, MODES, PARTITIONED_MODES, MAX_CHECKPOINTS, partitionKey } from './_validate.js';

// Score-ranked boards sort high→low; time-ranked boards sort fast→slow.
const TIME_RANKED = new Set(['timeTrial']);
// R692: wave-ranked boards (endless) sort by depth — stages_cleared carries
// the wave count, so deeper runs beat grindier shallow ones; score breaks ties.
const WAVE_RANKED = new Set(['endless']);

// Reject oversized POST bodies before parsing — a legit submission is well
// under 8KB (a 64-entry checkpoint trail is a few hundred bytes). Anything
// bigger is junk or an attempt to exhaust the function.
const MAX_BODY_BYTES = 8 * 1024;

// Best-effort per-IP rate limit. In-memory, so it only spans a warm function
// instance (resets on cold start) — not a hard guarantee, but it blunts burst
// floods from a single source without any external store. Sliding window.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_POSTS = 20;                 // submissions per IP per minute
const _rate = new Map();                   // ip -> number[] (timestamps)

function rateLimited(ip) {
    const now = Date.now();
    const hits = (_rate.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
    hits.push(now);
    _rate.set(ip, hits);
    // Opportunistic cleanup so the map doesn't grow unbounded across IPs.
    if (_rate.size > 5000) {
        for (const [k, v] of _rate) {
            if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) _rate.delete(k);
        }
    }
    return hits.length > RATE_MAX_POSTS;
}

function clientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function clampName(raw) {
    return String(raw ?? 'AAA')
        .toUpperCase()
        .replace(/[^A-Z0-9 ._-]/g, '')
        .slice(0, 16)
        .trim() || 'AAA';
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    try {
        await ensureSchema();
        const sql = getSql();

        if (req.method === 'GET') {
            const mode = String(req.query.mode || 'any');
            if (!MODES.has(mode)) return res.status(400).json({ error: 'unknown_mode' });
            let limit = parseInt(req.query.limit, 10);
            if (!Number.isFinite(limit) || limit < 1) limit = 20;
            if (limit > 100) limit = 100;

            // Partitioned boards (daily / weekly): one score-ranked board per
            // partition key. The client passes ?day=<key>; runs are filtered by
            // daily_key. daily → YYYYMMDD, weekly → <isoYear>W<ww>.
            if (PARTITIONED_MODES.has(mode)) {
                const key = partitionKey(mode, req.query.day);
                if (!key) return res.status(400).json({ error: 'bad_key' });
                const partRows = await sql`
                    SELECT name, score, time_frames, stages_cleared, verified, created_at
                    FROM cfb_runs
                    WHERE mode = ${mode} AND daily_key = ${key} AND verified = true
                    ORDER BY score DESC
                    LIMIT ${limit}`;
                return res.status(200).json({ mode, day: key, entries: partRows });
            }

            const rows = TIME_RANKED.has(mode)
                ? await sql`
                    SELECT name, score, time_frames, stages_cleared, verified, created_at
                    FROM cfb_runs
                    WHERE mode = ${mode} AND verified = true
                    ORDER BY time_frames ASC
                    LIMIT ${limit}`
                : WAVE_RANKED.has(mode)
                ? await sql`
                    SELECT name, score, time_frames, stages_cleared, verified, created_at
                    FROM cfb_runs
                    WHERE mode = ${mode} AND verified = true
                    ORDER BY stages_cleared DESC, score DESC
                    LIMIT ${limit}`
                : await sql`
                    SELECT name, score, time_frames, stages_cleared, verified, created_at
                    FROM cfb_runs
                    WHERE mode = ${mode} AND verified = true
                    ORDER BY score DESC
                    LIMIT ${limit}`;

            return res.status(200).json({ mode, entries: rows });
        }

        if (req.method === 'POST') {
            // Burst guard — best-effort per-IP rate limit.
            if (rateLimited(clientIp(req))) {
                return res.status(429).json({ error: 'rate_limited' });
            }
            // Payload-size guard. Reject oversized bodies before JSON.parse so a
            // megabyte of garbage can't tie up the function. Works whether the
            // body arrives as a raw string or pre-parsed object.
            const rawBody = typeof req.body === 'string'
                ? req.body
                : (req.body != null ? JSON.stringify(req.body) : '');
            if (rawBody.length > MAX_BODY_BYTES) {
                return res.status(413).json({ error: 'payload_too_large' });
            }
            let body;
            try {
                body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
            } catch {
                return res.status(400).json({ error: 'bad_json' });
            }
            const run = {
                runId: String(body.runId || '').slice(0, 64),
                name: clampName(body.name),
                mode: String(body.mode || ''),
                score: Math.floor(Number(body.score) || 0),
                timeFrames: Math.floor(Number(body.timeFrames) || 0),
                stagesCleared: Math.floor(Number(body.stagesCleared) || 0),
                checkpoints: Array.isArray(body.checkpoints) ? body.checkpoints.slice(0, MAX_CHECKPOINTS) : [],
                hash: String(body.hash || ''),
            };
            if (!run.runId) return res.status(400).json({ error: 'missing_run_id' });

            // Partition key for daily/weekly boards. Stored in daily_key (a
            // generic partition column), NULL for unpartitioned modes. Not part
            // of the signed hash — it's a routing key, not a scored value.
            const dailyKey = PARTITIONED_MODES.has(run.mode)
                ? partitionKey(run.mode, body.dailyKey)
                : null;
            if (PARTITIONED_MODES.has(run.mode) && !dailyKey) {
                return res.status(400).json({ error: 'missing_partition_key' });
            }

            const { verified, reason } = validateRun(run);

            // Upsert on run_id so a retry from a flaky connection doesn't
            // create duplicate board entries.
            const [saved] = await sql`
                INSERT INTO cfb_runs
                    (run_id, name, mode, score, time_frames, stages_cleared, checkpoints, verified, daily_key)
                VALUES
                    (${run.runId}, ${run.name}, ${run.mode}, ${run.score},
                     ${run.timeFrames}, ${run.stagesCleared},
                     ${JSON.stringify(run.checkpoints)}::jsonb, ${verified}, ${dailyKey})
                ON CONFLICT (run_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    score = EXCLUDED.score,
                    time_frames = EXCLUDED.time_frames,
                    stages_cleared = EXCLUDED.stages_cleared,
                    checkpoints = EXCLUDED.checkpoints,
                    verified = EXCLUDED.verified,
                    daily_key = EXCLUDED.daily_key
                RETURNING id, verified`;

            return res.status(200).json({ ok: true, verified: saved.verified, reason });
        }

        return res.status(405).json({ error: 'method_not_allowed' });
    } catch (err) {
        return res.status(500).json({ error: 'server_error', detail: String(err?.message || err) });
    }
}

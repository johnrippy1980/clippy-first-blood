// /api/runs — leaderboard read + submit.
//   GET  /api/runs?mode=any&limit=20   → top runs for a board
//   POST /api/runs   { runId, name, mode, score, timeFrames,
//                      stagesCleared, checkpoints, hash }   → submit a run
import { ensureSchema, getSql } from './_db.js';
import { validateRun, MODES } from './_validate.js';

// Score-ranked boards sort high→low; time-ranked boards sort fast→slow.
const TIME_RANKED = new Set(['timeTrial']);

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

            // Daily Challenge: one score-ranked board per calendar day. The
            // client passes ?day=YYYYMMDD; runs are partitioned by daily_key.
            if (mode === 'daily') {
                const day = String(req.query.day || '').replace(/[^0-9]/g, '').slice(0, 8);
                if (day.length !== 8) return res.status(400).json({ error: 'bad_day' });
                const dailyRows = await sql`
                    SELECT name, score, time_frames, stages_cleared, verified, created_at
                    FROM cfb_runs
                    WHERE mode = 'daily' AND daily_key = ${day} AND verified = true
                    ORDER BY score DESC
                    LIMIT ${limit}`;
                return res.status(200).json({ mode, day, entries: dailyRows });
            }

            const rows = TIME_RANKED.has(mode)
                ? await sql`
                    SELECT name, score, time_frames, stages_cleared, verified, created_at
                    FROM cfb_runs
                    WHERE mode = ${mode} AND verified = true
                    ORDER BY time_frames ASC
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
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
            const run = {
                runId: String(body.runId || '').slice(0, 64),
                name: clampName(body.name),
                mode: String(body.mode || ''),
                score: Math.floor(Number(body.score) || 0),
                timeFrames: Math.floor(Number(body.timeFrames) || 0),
                stagesCleared: Math.floor(Number(body.stagesCleared) || 0),
                checkpoints: Array.isArray(body.checkpoints) ? body.checkpoints.slice(0, 64) : [],
                hash: String(body.hash || ''),
            };
            if (!run.runId) return res.status(400).json({ error: 'missing_run_id' });

            // Daily Challenge partition key (YYYYMMDD). Only meaningful for
            // mode='daily'; stored NULL otherwise. Not part of the signed hash
            // — it's a routing key, not a scored value.
            const dailyKey = run.mode === 'daily'
                ? String(body.dailyKey || '').replace(/[^0-9]/g, '').slice(0, 8) || null
                : null;
            if (run.mode === 'daily' && !dailyKey) {
                return res.status(400).json({ error: 'missing_daily_key' });
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

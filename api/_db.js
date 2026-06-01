// Shared Neon Postgres helper for the leaderboard API.
// DATABASE_URL is injected by Vercel's Neon integration. The schema is
// created lazily on first call so there's no separate migration step to run.
import { neon } from '@neondatabase/serverless';

let _sql = null;
let _ready = null;

function client() {
    if (!_sql) {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('DATABASE_URL is not set');
        _sql = neon(url);
    }
    return _sql;
}

// Idempotent schema bootstrap. Memoised so concurrent invocations in a warm
// function share a single CREATE attempt.
export function ensureSchema() {
    if (_ready) return _ready;
    const sql = client();
    _ready = (async () => {
        await sql`
            CREATE TABLE IF NOT EXISTS cfb_runs (
                id           BIGSERIAL PRIMARY KEY,
                run_id       TEXT NOT NULL UNIQUE,
                name         TEXT NOT NULL,
                mode         TEXT NOT NULL,
                score        INTEGER NOT NULL DEFAULT 0,
                time_frames  INTEGER NOT NULL DEFAULT 0,
                stages_cleared INTEGER NOT NULL DEFAULT 0,
                checkpoints  JSONB NOT NULL DEFAULT '[]'::jsonb,
                verified     BOOLEAN NOT NULL DEFAULT false,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `;
        // Daily Challenge runs share mode='daily' but partition by date
        // (YYYYMMDD) so each day's board is independent. Added idempotently
        // for tables created before the daily feature existed. NULL for all
        // non-daily modes.
        await sql`
            ALTER TABLE cfb_runs ADD COLUMN IF NOT EXISTS daily_key TEXT
        `;
        // Score boards (Any%, 100%, boss-rush) read by score DESC.
        await sql`
            CREATE INDEX IF NOT EXISTS cfb_runs_mode_score_idx
            ON cfb_runs (mode, score DESC)
        `;
        // Time boards (time-trial, speedruns) read by fastest time ASC.
        await sql`
            CREATE INDEX IF NOT EXISTS cfb_runs_mode_time_idx
            ON cfb_runs (mode, time_frames ASC)
        `;
        // Daily boards read by (day, score DESC) — one leaderboard per date.
        await sql`
            CREATE INDEX IF NOT EXISTS cfb_runs_daily_idx
            ON cfb_runs (daily_key, score DESC)
        `;
    })();
    return _ready;
}

export function getSql() {
    return client();
}

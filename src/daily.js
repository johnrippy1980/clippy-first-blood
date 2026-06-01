// Daily Challenge. A campaign run with a fixed, date-derived set of modifiers
// and its own per-day leaderboard board. Everyone playing on the same calendar
// day faces the same challenge and competes on that day's board.
//
// No seeded-RNG refactor: the game's enemy spawns/positions/timing are already
// deterministic (script-driven, not random rolls), so "same challenge for
// everyone" is achieved purely by applying the same modifiers — the run
// structure is identical for every player by construction.
//
// The board key is the LOCAL calendar date (YYYYMMDD) so "today's challenge"
// matches the player's wall clock. Pure, dependency-free, deterministic.

// Challenge rotation. The day-of-epoch index modulo this list picks the active
// challenge, so it cycles predictably and repeats every CHALLENGES.length days.
// Each modifier is read by the game when a daily run is launched:
//   oneLife       — start with a single life, no continues (player.lives = 0)
//   doubleDamage  — incoming damage is doubled (player.damageTakenMult = 2)
//   noPickups     — weapon/powerup pickups don't spawn (machine gun only)
const CHALLENGES = [
    { id: 'oneLife',   name: 'SUDDEN DEATH', desc: 'ONE LIFE. NO CONTINUES.',  mods: { oneLife: true } },
    { id: 'doubleDmg', name: 'GLASS WORLD',  desc: 'INCOMING DAMAGE DOUBLED.', mods: { doubleDamage: true } },
    { id: 'noPickups', name: 'BARE HANDS',   desc: 'NO WEAPON PICKUPS.',       mods: { noPickups: true } },
    { id: 'ironMan',   name: 'IRON MAN',     desc: 'ONE LIFE. DOUBLE DAMAGE.', mods: { oneLife: true, doubleDamage: true } },
    { id: 'austerity', name: 'AUSTERITY',    desc: 'NO PICKUPS. ONE LIFE.',    mods: { noPickups: true, oneLife: true } },
];

class DailyChallenge {
    // Local calendar day as YYYYMMDD integer-string. Used as the board key.
    todayKey(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    // ISO-8601 week key for the given date, "<isoYear>W<ww>" (e.g. 2026W22).
    // Used as the partition key for the rolling weekly Any% board — everyone
    // playing in the same ISO week competes on the same board, and it rolls
    // over automatically each Monday. ISO weeks start Monday; the week
    // containing the year's first Thursday is week 1 (which can belong to the
    // previous or next calendar year, hence the separate isoYear).
    weeklyKey(date = new Date()) {
        // Work in UTC on the local Y/M/D so the key is timezone-stable.
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        // Shift to the Thursday of this week: ISO day 1=Mon..7=Sun.
        const isoDay = d.getUTCDay() || 7;        // Sunday(0) → 7
        d.setUTCDate(d.getUTCDate() + 4 - isoDay);
        const isoYear = d.getUTCFullYear();
        const yearStart = Date.UTC(isoYear, 0, 1);
        const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
        return `${isoYear}W${String(week).padStart(2, '0')}`;
    }

    // Whole days since the Unix epoch in local time — a monotonic day index
    // that drives the rotation. Independent of timezone offset sign because we
    // build it from the local Y/M/D, not from getTime().
    _dayIndex(date = new Date()) {
        // Days since 1970-01-01 using local midnight. Date.UTC on local parts
        // gives a stable integer day count without DST drift.
        const ms = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        return Math.floor(ms / 86400000);
    }

    // The active challenge for a given day. Deterministic: same day → same
    // challenge for every player, worldwide.
    todayChallenge(date = new Date()) {
        const idx = ((this._dayIndex(date) % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length;
        const c = CHALLENGES[idx];
        return { ...c, day: this.todayKey(date) };
    }
}

export const dailyChallenge = new DailyChallenge();
export { CHALLENGES };

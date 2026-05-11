// ============================================
// DAILY SEED CHALLENGE
// ============================================
// Every calendar day everyone gets the same modifier. Best score
// per date is persisted locally. The seed comes from the date
// string so it's stable across browsers (no server required).

// Deterministic RNG (Mulberry32). Returns a function [0,1).
function dailyRng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Hash a string to a 32-bit seed (FNV-1a)
function dailyHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// Today's date string in UTC so different timezones share the seed
function dailyDateString(now) {
    const d = now || new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

const DAILY_MODIFIERS = [
    {
        id: 'ONE_SHOT',  name: 'GLASS PAPERCLIP',
        desc: 'YOU TAKE 3X DAMAGE',
        apply: (game) => { game.dailyDamageMul = 3; }
    },
    {
        id: 'BERSERKER', name: 'BERSERKER',
        desc: 'YOU DEAL 2X DAMAGE BUT TAKE 2X',
        apply: (game) => { game.dailyDamageMul = 2; game.dailyPlayerDmg = 2; }
    },
    {
        id: 'FAST_AND',  name: 'FAST AND FURIOUS',
        desc: 'EVERYTHING MOVES 1.5X SPEED',
        apply: (game) => { game.dailySpeedMul = 1.5; }
    },
    {
        id: 'PACIFIST',  name: 'PACIFIST',
        desc: 'YOU HAVE 2X HP BUT DEAL HALF',
        apply: (game) => { game.dailyHpMul = 2; game.dailyPlayerDmg = 0.5; }
    },
    {
        id: 'CHAOS',     name: 'CHAOS THEORY',
        desc: 'YOU GET A RANDOM WEAPON EVERY 10 SECONDS',
        apply: (game) => { game.dailyChaos = true; }
    },
    {
        id: 'DOUBLE',    name: 'DOUBLE TROUBLE',
        desc: 'TWICE AS MANY ENEMIES',
        apply: (game) => { game.dailyDoubleEnemies = true; }
    },
    {
        id: 'NO_GUN',    name: 'BARE PAPERCLIP',
        desc: 'NO PICKUPS - JUST THE MACHINE GUN',
        apply: (game) => { game.dailyNoPickups = true; }
    }
];

// Pick today's modifier deterministically from the seed.
function dailyModifierFor(dateStr) {
    const seed = dailyHash(dateStr);
    return DAILY_MODIFIERS[seed % DAILY_MODIFIERS.length];
}

// Persistence helpers
function dailyBestScore(dateStr) {
    try {
        const raw = localStorage.getItem('clippy_first_blood_daily_' + dateStr);
        return raw ? parseInt(raw, 10) || 0 : 0;
    } catch (e) { return 0; }
}
function dailySaveBest(dateStr, score) {
    try {
        const prev = dailyBestScore(dateStr);
        if (score > prev) {
            localStorage.setItem('clippy_first_blood_daily_' + dateStr, String(score));
            return true;
        }
    } catch (e) {}
    return false;
}

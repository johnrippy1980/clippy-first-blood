// Achievement system. 16 entries, persisted to localStorage.
// Each definition has: id (string), name, description, icon (1-char emoji or
// glyph), gate(stats) -> bool. Stats are updated after each stage; on every
// update we re-check unlock predicates against the stats object.

const STORAGE_KEY = 'clippy_achievements';

export const ACHIEVEMENT_LIST = [
    { id: 'first_blood',   name: 'FIRST BLOOD',     desc: 'KILL YOUR FIRST ENEMY',                 icon: '!',  gate: s => s.totalKills >= 1 },
    { id: 'clear_stage_1', name: 'OFFICE EXIT',     desc: 'CLEAR STAGE 1',                          icon: '1',  gate: s => s.stagesCleared.has(1) },
    // R226: kept id 'clear_stage_4' for save compat. Old stage 4 (BOARDROOM)
    // is now stage 5; new stage 4 is THE PIPELINE.
    { id: 'clear_stage_4', name: 'INTO THE LAB',    desc: 'CLEAR STAGE 4',                          icon: '4',  gate: s => s.stagesCleared.has(4) },
    { id: 'clear_stage_5', name: 'BOARDROOM BLOOD', desc: 'CLEAR STAGE 5',                          icon: '5',  gate: s => s.stagesCleared.has(5) },
    { id: 'clear_game',    name: 'THE LIST IS DONE',desc: 'COMPLETE THE GAME',                      icon: '*',  gate: s => s.stagesCleared.has(9) },
    { id: 'no_death_run',  name: 'UNTOUCHABLE',     desc: 'BEAT THE GAME WITH ZERO DEATHS',         icon: 'O',  gate: s => s.stagesCleared.has(9) && s.totalDeaths === 0 },
    { id: 'no_dmg_stage',  name: 'GHOST',           desc: 'CLEAR A STAGE WITHOUT TAKING DAMAGE',    icon: 'G',  gate: s => s.noDamageStages >= 1 },
    { id: 'combo_5',       name: 'STREAK',          desc: 'CHAIN 5 KILLS',                          icon: '5',  gate: s => s.maxCombo >= 5 },
    { id: 'combo_10',      name: 'RAMPAGE',         desc: 'CHAIN 10 KILLS',                         icon: 'X',  gate: s => s.maxCombo >= 10 },
    { id: 'combo_20',      name: 'CARNAGE',         desc: 'CHAIN 20 KILLS',                         icon: 'C',  gate: s => s.maxCombo >= 20 },
    { id: 'combo_30',      name: 'GOD-LIKE',        desc: 'CHAIN 30 KILLS',                         icon: '+',  gate: s => s.maxCombo >= 30 },
    { id: 'all_weapons',   name: 'ARSENAL',         desc: 'FIRE EVERY WEAPON TYPE',                 icon: 'W',  gate: s => Object.keys(s.weaponDamage || {}).filter(k => s.weaponDamage[k] > 0).length >= 6 },
    { id: 'speed_run',     name: 'SPEEDRUNNER',     desc: 'BEAT GAME UNDER 12 MINUTES',             icon: 'T',  gate: s => s.stagesCleared.has(9) && s.totalTime < 12 * 60 * 60 },
    { id: 'boss_rush',     name: 'GAUNTLET',        desc: 'BEAT THE BOSS RUSH STAGE',               icon: 'R',  gate: s => s.stagesCleared.has(8) },
    { id: 'secret_room',   name: 'OFF THE GRID',    desc: 'DISCOVER THE SECRET STAGE',              icon: 'S',  gate: s => s.secretStageDiscovered === true },
    { id: 'second_chance', name: 'CLOSE CALL',      desc: 'TRIGGER BULLET-TIME RESCUE',             icon: 'B',  gate: s => s.bulletTimeUses >= 1 },
    { id: 'high_score',    name: 'TOP TIER',        desc: 'SCORE OVER 100,000',                     icon: '$',  gate: s => s.bestScore >= 100000 },
    { id: 'ghillie',       name: 'GHILLIE SUIT',    desc: 'HIDE FROM 10 ENEMIES IN TALL COVER',     icon: '~',  gate: s => (s.enemiesLost || 0) >= 10 },
    { id: 'silent_strike', name: 'SILENT STRIKE',   desc: 'LAND A STEALTH POUNCE KILL',             icon: 'P',  gate: s => (s.pounceKills || 0) >= 1 },
    { id: 'grenadier',     name: 'GRENADIER',       desc: 'KILL 5 ENEMIES WITH GRENADES',           icon: '^',  gate: s => (s.grenadeKills || 0) >= 5 },
    // R223: paperclip dog-tag full set — 7 tags hidden behind
    // breakable walls across stages 2..8 (one per stage). Most are
    // tucked behind walls that take real exploration or a grenade
    // to reach. Single-run high-water mark; once earned, locked in.
    { id: 'full_set',      name: 'FULL SET',        desc: 'COLLECT 7 CLIPPY TAGS',                  icon: 'P',  gate: s => (s.tagsFound || 0) >= 7 },
];

class Achievements {
    constructor() {
        this.unlocked = new Set();
        this.banner = [];   // queue of {id, age} for popup display
        this.stats = {
            totalKills: 0,
            stagesCleared: new Set(),
            totalDeaths: 0,
            noDamageStages: 0,
            maxCombo: 0,
            weaponDamage: {},
            totalTime: 0,
            secretStageDiscovered: false,
            bulletTimeUses: 0,
            bestScore: 0,
            enemiesLost: 0,    // count of "target lost" thought-bubbles triggered
            pounceKills: 0,    // stealth pounce kills (Round 38)
            stageBestScores: {}, // { 1: 12000, 2: ... } per-stage best (Round 42)
            // Mode best times (frames). 0 = no time set. Persisted.
            bestBossRushTime: 0,
            bestTimeTrialTime: 0,
            // R223: paperclip dog-tags collected across all runs. Drives
            // the FULL SET achievement at 7 (one per main stage 2..8).
            // High-water mark — once earned, can't lose them.
            tagsFound: 0,
        };
        this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            // R226 migration: pre-version saves used the old 8-stage numbering
            // where stage 4=BOARDROOM, ..., 8=CLOUD, 9=RECYCLE BIN, etc. After
            // inserting THE PIPELINE at id=4 everything ≥4 shifts up by one.
            // Detect old saves by missing schemaVersion and shift their stage
            // refs (stageBestScores keys) up. stagesCleared isn't persisted —
            // it's a per-run Set rebuilt from scratch — so it's not migrated.
            if (!data.schemaVersion && data.stats?.stageBestScores) {
                const shifted = {};
                for (const k of Object.keys(data.stats.stageBestScores)) {
                    const n = parseInt(k, 10);
                    if (Number.isFinite(n) && n >= 4) {
                        shifted[n + 1] = data.stats.stageBestScores[k];
                    } else {
                        shifted[n] = data.stats.stageBestScores[k];
                    }
                }
                data.stats.stageBestScores = shifted;
            }
            if (Array.isArray(data.unlocked)) {
                for (const id of data.unlocked) {
                    if (ACHIEVEMENT_LIST.some(a => a.id === id)) this.unlocked.add(id);
                }
            }
            if (data.stats) {
                this.stats.bestScore = data.stats.bestScore || 0;
                this.stats.secretStageDiscovered = data.stats.secretStageDiscovered === true;
                if (data.stats.stageBestScores && typeof data.stats.stageBestScores === 'object') {
                    this.stats.stageBestScores = { ...data.stats.stageBestScores };
                }
                this.stats.bestBossRushTime = data.stats.bestBossRushTime || 0;
                this.stats.bestTimeTrialTime = data.stats.bestTimeTrialTime || 0;
            }
            // Persist with the new schema version on next _save() so we don't
            // re-run the migration. _load doesn't write directly.
            this._needsMigrationSave = !data.schemaVersion;
        } catch (e) {
            console.warn('Achievement load failed:', e);
        }
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                schemaVersion: 226,
                unlocked: Array.from(this.unlocked),
                stats: {
                    bestScore: this.stats.bestScore,
                    secretStageDiscovered: this.stats.secretStageDiscovered,
                    stageBestScores: this.stats.stageBestScores,
                    bestBossRushTime: this.stats.bestBossRushTime,
                    bestTimeTrialTime: this.stats.bestTimeTrialTime,
                },
            }));
        } catch (e) {}
    }

    // Update stats and check unlocks. Returns array of newly unlocked entries.
    update(snapshot) {
        Object.assign(this.stats, snapshot);
        if (snapshot.stagesCleared) this.stats.stagesCleared = snapshot.stagesCleared;
        const newly = [];
        for (const a of ACHIEVEMENT_LIST) {
            if (this.unlocked.has(a.id)) continue;
            try {
                if (a.gate(this.stats)) {
                    this.unlocked.add(a.id);
                    this.banner.push({ id: a.id, age: 0 });
                    newly.push(a);
                }
            } catch (e) {}
        }
        if (newly.length) this._save();
        return newly;
    }

    tickBanner() {
        for (const b of this.banner) b.age++;
        // Drop banners older than 300 frames (5s @ 60fps). Long enough that a
        // mid-firefight unlock can still register in the player's eye, short
        // enough that stacked banners don't pile up forever.
        this.banner = this.banner.filter(b => b.age < 300);
    }

    activeBanner() {
        return this.banner[0] || null;
    }

    get(id) { return ACHIEVEMENT_LIST.find(a => a.id === id); }
    isUnlocked(id) { return this.unlocked.has(id); }
}

export const achievements = new Achievements();

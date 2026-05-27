// Achievement system. Persisted to localStorage.
// Each definition has: id (string), name, description, icon (1-char emoji or
// glyph), gate(stats) -> bool. Stats are updated after each stage; on every
// update we re-check unlock predicates against the stats object.

import { audio } from './audio.js';

const STORAGE_KEY = 'clippy_achievements';

export const ACHIEVEMENT_LIST = [
    { id: 'first_blood',   name: 'FIRST BLOOD',     desc: 'KILL YOUR FIRST ENEMY',                 icon: '!',  gate: s => s.totalKills >= 1 },
    { id: 'clear_stage_1', name: 'OFFICE EXIT',     desc: 'CLEAR STAGE 1',                          icon: '1',  gate: s => s.stagesCleared.has(1) },
    // R226: kept id 'clear_stage_4' for save compat. Old stage 4 (BOARDROOM)
    // is now stage 5; new stage 4 is THE PIPELINE.
    { id: 'clear_stage_4', name: 'INTO THE LAB',    desc: 'CLEAR STAGE 4',                          icon: '4',  gate: s => s.stagesCleared.has(4) },
    { id: 'clear_stage_5', name: 'BOARDROOM BLOOD', desc: 'CLEAR STAGE 5',                          icon: '5',  gate: s => s.stagesCleared.has(5) },
    // R291: final stage (THE CLOUD) shifted from id 11 to id 13.
    { id: 'clear_game',    name: 'THE LIST IS DONE',desc: 'COMPLETE THE GAME',                      icon: '*',  gate: s => s.stagesCleared.has(13) },
    { id: 'no_death_run',  name: 'UNTOUCHABLE',     desc: 'BEAT THE GAME WITH ZERO DEATHS',         icon: 'O',  gate: s => s.stagesCleared.has(13) && s.totalDeaths === 0 },
    { id: 'no_dmg_stage',  name: 'GHOST',           desc: 'CLEAR A STAGE WITHOUT TAKING DAMAGE',    icon: 'G',  gate: s => s.noDamageStages >= 1 },
    { id: 'combo_5',       name: 'STREAK',          desc: 'CHAIN 5 KILLS',                          icon: '5',  gate: s => s.maxCombo >= 5,  progress: s => [Math.min(s.maxCombo || 0, 5),  5] },
    { id: 'combo_10',      name: 'RAMPAGE',         desc: 'CHAIN 10 KILLS',                         icon: 'X',  gate: s => s.maxCombo >= 10, progress: s => [Math.min(s.maxCombo || 0, 10), 10] },
    { id: 'combo_20',      name: 'CARNAGE',         desc: 'CHAIN 20 KILLS',                         icon: 'C',  gate: s => s.maxCombo >= 20, progress: s => [Math.min(s.maxCombo || 0, 20), 20] },
    { id: 'combo_30',      name: 'GOD-LIKE',        desc: 'CHAIN 30 KILLS',                         icon: '+',  gate: s => s.maxCombo >= 30, progress: s => [Math.min(s.maxCombo || 0, 30), 30] },
    { id: 'all_weapons',   name: 'ARSENAL',         desc: 'FIRE EVERY WEAPON TYPE',                 icon: 'W',  gate: s => Object.keys(s.weaponDamage || {}).filter(k => s.weaponDamage[k] > 0).length >= 6, progress: s => [Math.min(Object.keys(s.weaponDamage || {}).filter(k => s.weaponDamage[k] > 0).length, 6), 6] },
    // R291: speed_run final stage shifted 11→13; boss_rush gauntlet 10→12.
    { id: 'speed_run',     name: 'SPEEDRUNNER',     desc: 'BEAT GAME UNDER 12 MINUTES',             icon: 'T',  gate: s => s.stagesCleared.has(13) && s.totalTime < 12 * 60 * 60 },
    { id: 'boss_rush',     name: 'GAUNTLET',        desc: 'BEAT THE BOSS RUSH STAGE',               icon: 'R',  gate: s => s.stagesCleared.has(12) },
    { id: 'secret_room',   name: 'OFF THE GRID',    desc: 'DISCOVER THE SECRET STAGE',              icon: 'S',  gate: s => s.secretStageDiscovered === true },
    { id: 'second_chance', name: 'CLOSE CALL',      desc: 'TRIGGER BULLET-TIME RESCUE',             icon: 'B',  gate: s => s.bulletTimeUses >= 1 },
    { id: 'high_score',    name: 'TOP TIER',        desc: 'SCORE OVER 100,000',                     icon: '$',  gate: s => s.bestScore >= 100000 },
    { id: 'ghillie',       name: 'GHILLIE SUIT',    desc: 'HIDE FROM 10 ENEMIES IN TALL COVER',     icon: '~',  gate: s => (s.enemiesLost || 0) >= 10, progress: s => [Math.min(s.enemiesLost || 0, 10), 10] },
    { id: 'silent_strike', name: 'SILENT STRIKE',   desc: 'LAND A STEALTH POUNCE KILL',             icon: 'P',  gate: s => (s.pounceKills || 0) >= 1 },
    { id: 'grenadier',     name: 'GRENADIER',       desc: 'KILL 5 ENEMIES WITH GRENADES',           icon: '^',  gate: s => (s.grenadeKills || 0) >= 5, progress: s => [Math.min(s.grenadeKills || 0, 5), 5] },
    // R223: paperclip dog-tag full set — 7 tags hidden behind
    // breakable walls across stages 2..8 (one per stage). Most are
    // tucked behind walls that take real exploration or a grenade
    // to reach. Single-run high-water mark; once earned, locked in.
    { id: 'full_set',      name: 'FULL SET',        desc: 'COLLECT 7 CLIPPY TAGS',                  icon: 'P',  gate: s => (s.tagsFound || 0) >= 7, progress: s => [Math.min(s.tagsFound || 0, 7), 7] },
    // R359: post-game + Mecha-trilogy achievements. Each is single-clear
    // gated (set membership), so no per-run reset needed.
    { id: 'clear_training',name: 'WARM-UP',         desc: 'CLEAR THE TRAINING GROUND',              icon: 'T',  gate: s => s.stagesCleared.has(15) },
    // R470: boss-rush moved from stage 16 to stage 24 in R426. Updated.
    { id: 'boss_rush_mode',name: 'GAUNTLET RIDER',  desc: 'CLEAR POST-GAME BOSS RUSH MODE',         icon: 'R',  gate: s => s.stagesCleared.has(24) },
    { id: 'time_trial',    name: 'BEAT THE CLOCK',  desc: 'CLEAR TIME TRIAL',                       icon: 'C',  gate: s => s.stagesCleared.has(17) },
    { id: 'jobs_down',     name: 'REALITY CHECK',   desc: 'DEFEAT STEVE JOBS',                      icon: 'J',  gate: s => s.stagesCleared.has(18) },
    { id: 'core_breach',   name: 'CORE BREACH',     desc: 'CLEAR THE CORE BREACH',                  icon: 'X',  gate: s => s.stagesCleared.has(19) },
    { id: 'mecha_trilogy', name: 'NO PLACE TO HIDE',desc: 'CLEAR THE FULL MECHA TRILOGY',           icon: 'M',  gate: s => s.stagesCleared.has(20) && s.stagesCleared.has(21) && s.stagesCleared.has(22) },
    { id: 'helicopter',    name: 'CHOPPER DOWN',    desc: 'DEFEAT THE MECHA-CHOPPER',               icon: 'H',  gate: s => s.stagesCleared.has(21) },
    { id: 'mecha_gates',   name: 'THE LAST CLIPPY', desc: 'DEFEAT MECHA-GATES',                     icon: '#',  gate: s => s.stagesCleared.has(22) },
    // R470: Doom-mode achievements
    { id: 'block_11',      name: 'BLOCK CLEARED',   desc: 'DEFEAT SPINDLER UZIS IN BLOCK 11',       icon: 'B',  gate: s => s.stagesCleared.has(23) },
    { id: 'floor_11',      name: 'WHEELCHAIR DOWN', desc: 'DEFEAT SPINDLER WHEELCHAIR IN FLOOR 11', icon: 'F',  gate: s => s.stagesCleared.has(16) },
    { id: 'bfg_secret',    name: 'BIG GUN',         desc: 'FIND THE SECRET BFG IN FLOOR 11',         icon: 'G',  gate: s => (s.bfgFound || 0) >= 1 },
    { id: 'doom_combo_x4', name: 'CHAINSAW LOOP',   desc: 'REACH ×4 COMBO IN DOOM MODE',             icon: 'C',  gate: s => (s.doomMaxCombo || 0) >= 5 },
    { id: 'spindler_arc',  name: 'NO MORE SAMPLES', desc: 'DEFEAT BOTH SPINDLER FORMS',              icon: 'S',  gate: s => s.stagesCleared.has(23) && s.stagesCleared.has(16) },
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
            // R279: persisted konami unlock — once entered, the secret
            // stages stay visible in stage select across sessions.
            konamiUnlocked: false,
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
            // R281 migration: insert BALLMER OFFICE (6) + BALLMER ARENA (7).
            // Stages 6..end shift up by 2 to make room.
            const sv = data.schemaVersion || 0;
            if (sv < 281 && data.stats?.stageBestScores) {
                const shifted = {};
                for (const k of Object.keys(data.stats.stageBestScores)) {
                    const n = parseInt(k, 10);
                    if (Number.isFinite(n) && n >= 6) {
                        shifted[n + 2] = data.stats.stageBestScores[k];
                    } else {
                        shifted[n] = data.stats.stageBestScores[k];
                    }
                }
                data.stats.stageBestScores = shifted;
            }
            // R291 migration: insert KEYNOTE CORRIDOR (9) + GATES ARENA (10).
            // Stages 9..end shift up by another 2.
            if (sv < 291 && data.stats?.stageBestScores) {
                const shifted = {};
                for (const k of Object.keys(data.stats.stageBestScores)) {
                    const n = parseInt(k, 10);
                    if (Number.isFinite(n) && n >= 9) {
                        shifted[n + 2] = data.stats.stageBestScores[k];
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
                // R279: konami unlock persists across sessions so the
                // user doesn't have to re-enter the code every time.
                this.stats.konamiUnlocked = data.stats.konamiUnlocked === true;
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
                schemaVersion: 301,
                unlocked: Array.from(this.unlocked),
                stats: {
                    bestScore: this.stats.bestScore,
                    secretStageDiscovered: this.stats.secretStageDiscovered,
                    stageBestScores: this.stats.stageBestScores,
                    bestBossRushTime: this.stats.bestBossRushTime,
                    bestTimeTrialTime: this.stats.bestTimeTrialTime,
                    konamiUnlocked: this.stats.konamiUnlocked || false,
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
                    // R364: play the unlock chime so the banner has audio
                    // feedback — silent achievement unlocks were easy to
                    // miss during action.
                    try { audio.sfx?.('unlock'); } catch (_) {}
                    newly.push(a);
                }
            } catch (e) {}
        }
        if (newly.length) this._save();
        return newly;
    }

    tickBanner() {
        // R562: SEQUENTIAL queue — only the FRONT banner ages. When it
        // hits 300f (5s) it shifts off and the next one starts ticking.
        // Previously all banners aged in parallel and the 2nd+ would
        // expire silently before they ever got display time.
        if (this.banner.length === 0) return;
        const front = this.banner[0];
        front.age++;
        if (front.age >= 300) {
            this.banner.shift();
            // Reset the new front's age so its slide-in animation
            // (gated on age < 20) plays fresh.
            if (this.banner.length > 0) this.banner[0].age = 0;
        }
    }

    activeBanner() {
        return this.banner[0] || null;
    }

    get(id) { return ACHIEVEMENT_LIST.find(a => a.id === id); }
    isUnlocked(id) { return this.unlocked.has(id); }
}

export const achievements = new Achievements();

// Options: volume, scanlines, shake intensity, key rebinding.
// Persisted to localStorage.

const KEY = 'clippy_options';

const DEFAULTS = {
    // R288: default volumes to 100% so the game ships loud — players can
    // turn it down via the in-game volume sliders.
    musicVol: 1.0,
    sfxVol:   1.0,
    masterVol: 1.0,
    scanlines: true,
    shakeScale: 1.0,
    crtCurve: true,
    // R209 — Milos playtest #2: show the READY screen with the keymap
    // before each stage's first frame. Veterans can flip this off from
    // the READY screen itself (don't-show-again toggle). New players
    // see it by default so they get the bindings before getting shot.
    showReady: true,
    // Ghost replay: render the stored best-run path as a translucent
    // silhouette during clean campaign stages. Off by default — it's an
    // opt-in pace-racer, not something to surprise players with in normal
    // play. Enable via Options > SHOW GHOST.
    showGhost: false,
    // Accessibility: when on, suppress screen shake, slow-motion/freeze-frames,
    // and the high-combo vignette pulse. Off by default (byte-identical to the
    // shipped game-feel). For motion-sensitivity / reduced-motion preference.
    reducedMotion: false,
    // R649: campaign difficulty. 'normal' is the tuned baseline (1.0× damage
    // taken / 1.0× enemy HP). 'easy' halves incoming damage + softens enemy
    // HP for newcomers; 'hard' raises both for veterans. Non-'normal' runs are
    // excluded from the Any%/weekly leaderboards (non-comparable, like Daily).
    difficulty: 'normal',
    // R691: key-rebind overrides — { action: key } set from the CONTROLS
    // menu. Empty = shipped defaults. An override REPLACES that action's
    // whole default key set (input.js rebuilds the effective keymap).
    keyBinds: {},
};

class Options {
    constructor() {
        this.values = { ...DEFAULTS };
        this._load();
    }
    _load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            for (const k of Object.keys(DEFAULTS)) {
                if (data[k] !== undefined) this.values[k] = data[k];
            }
        } catch (e) {}
    }
    save() {
        try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) {}
    }
    set(k, v) { this.values[k] = v; this.save(); }
    get(k) { return this.values[k]; }
    reset() { this.values = { ...DEFAULTS }; this.save(); }
}

export const options = new Options();

// R649 (moved here R690): campaign difficulty multipliers. `taken` scales
// damage the PLAYER receives; `enemyHp` scales every enemy's HP. Normal is
// the shipped baseline (1.0/1.0) so existing balance is byte-identical.
// Order drives the EASY→NORMAL→HARD menu cycle. Lives here (not game.js)
// so the doom/fps/beatem sub-engines can consume the same table without
// importing game.js (circular).
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DIFFICULTY_MULTS = {
    easy:   { taken: 0.5, enemyHp: 0.75 },
    normal: { taken: 1.0, enemyHp: 1.0 },
    hard:   { taken: 1.5, enemyHp: 1.4 },
};
export function difficultyMults() {
    return DIFFICULTY_MULTS[options.get('difficulty')] || DIFFICULTY_MULTS.normal;
}

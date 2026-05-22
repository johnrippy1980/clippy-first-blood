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

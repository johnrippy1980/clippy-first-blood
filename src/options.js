// Options: volume, scanlines, shake intensity, key rebinding.
// Persisted to localStorage.

const KEY = 'clippy_options';

const DEFAULTS = {
    musicVol: 0.7,
    sfxVol:   0.85,
    scanlines: true,
    shakeScale: 1.0,
    crtCurve: true,
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

// ============================================
// MOD LOADER
// ============================================
// Players can drop a .json file into the LOAD MOD picker to register
// custom stages. Mod stages live alongside the built-in stages array
// with mod:true so they show up in Stage Select.
//
// Format (one file = one mod, can hold many stages):
// {
//   "name": "My Mod Pack",
//   "stages": [
//     {
//       "name": "PARKING LOT",
//       "theme": "jungle",            // any built-in theme
//       "width": 80, "height": 14,
//       "tiles": [[..],[..]],         // 2D array of tile IDs (h x w)
//       "bossArenaX": 0,              // optional
//       "endX": 1264,                 // optional
//       "checkpoints":  [{x,y}, ...], // optional
//       "coverSpots":   [{x,y}, ...], // optional
//       "ladders":      [{x,y}, ...], // optional
//       "pickups":      [{x,y,type,secret}, ...],
//       "spawnPoints":  [{x,y,type}, ...]
//     }
//   ]
// }
// Tile IDs are the values from constants.js TILE (0..8).

const Mods = {
    loaded: [],           // mods registered this session

    // Returns true if at least one mod is currently loaded.
    hasMods() { return this.loaded.length > 0; },

    // Flat list of mod stages (across all mods)
    allStages() {
        const out = [];
        for (const m of this.loaded) {
            for (const s of m.stages) out.push({ mod: m.name, stage: s });
        }
        return out;
    },

    // Validate a mod object - returns null on failure
    validate(mod) {
        if (!mod || typeof mod !== 'object') return null;
        if (typeof mod.name !== 'string') return null;
        if (!Array.isArray(mod.stages) || mod.stages.length === 0) return null;
        const themes = new Set(['jungle','breakroom','serverroom','boardroom','keynote','founder','cloud']);
        const sanitized = { name: String(mod.name).slice(0, 24), stages: [] };
        for (const s of mod.stages) {
            if (!s || !Array.isArray(s.tiles)) continue;
            const h = s.tiles.length;
            if (h <= 0 || h > 30) continue;
            const w = s.tiles[0] ? s.tiles[0].length : 0;
            if (w <= 0 || w > 200) continue;
            // Normalize tile rows: must all be the same width and consist of ints
            const tiles = [];
            for (let yy = 0; yy < h; yy++) {
                const row = s.tiles[yy];
                if (!Array.isArray(row) || row.length !== w) return null;
                const r = new Array(w);
                for (let xx = 0; xx < w; xx++) {
                    const v = row[xx] | 0;
                    r[xx] = (v >= 0 && v <= 8) ? v : 0;
                }
                tiles.push(r);
            }
            const theme = themes.has(s.theme) ? s.theme : 'jungle';
            const hasXY = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
            sanitized.stages.push({
                name: String(s.name || 'MOD STAGE').slice(0, 24),
                theme,
                width: w, height: h,
                bossArenaX: typeof s.bossArenaX === 'number' ? s.bossArenaX : (w - 6) * GAME.TILE_SIZE,
                endX: typeof s.endX === 'number' ? s.endX : (w - 1) * GAME.TILE_SIZE,
                tiles,
                checkpoints: Array.isArray(s.checkpoints) ? s.checkpoints.filter(hasXY).slice(0, 8) : [{ x: 50, y: 160 }],
                coverSpots:  Array.isArray(s.coverSpots)  ? s.coverSpots.filter(hasXY).slice(0, 16) : [],
                ladders:     Array.isArray(s.ladders)     ? s.ladders.filter(hasXY).slice(0, 64) : [],
                pickups:     Array.isArray(s.pickups)     ? s.pickups.filter(hasXY).slice(0, 32) : [],
                spawnPoints: Array.isArray(s.spawnPoints) ? s.spawnPoints.filter(hasXY).slice(0, 64) : []
            });
        }
        if (sanitized.stages.length === 0) return null;
        return sanitized;
    },

    // Register a validated mod
    register(mod) {
        const v = this.validate(mod);
        if (!v) return null;
        this.loaded.push(v);
        // Persist as a session-only convenience (intentionally NOT
        // localStorage - players have to re-pick the file each session so
        // a poisoned mod doesn't survive a reload)
        return v;
    },

    // Apply a mod stage onto a Level instance (replaces its current data)
    applyToLevel(level, stage) {
        level.theme = stage.theme;
        level.width = stage.width;
        level.height = stage.height;
        level.bossArenaX = stage.bossArenaX;
        level.endX = stage.endX;
        level.tiles = stage.tiles.map(row => row.slice());
        level.checkpoints = stage.checkpoints.map(c => ({ x: c.x | 0, y: c.y | 0 }));
        level.coverSpots  = stage.coverSpots.map(c => ({ x: c.x | 0, y: c.y | 0 }));
        level.ladders     = stage.ladders.map(c => ({ x: c.x | 0, y: c.y | 0 }));
        level.pickups     = stage.pickups
            .filter(p => (typeof p.type === 'string' && WEAPON[p.type]) || p.type === '1UP')
            .map(p => ({ x: p.x | 0, y: p.y | 0, type: p.type, secret: !!p.secret, taken: false }));
        level.spawnPoints = stage.spawnPoints
            .filter(s => typeof s.type === 'string' && ENEMY_TYPE[s.type])
            .map(s => ({ x: s.x | 0, y: s.y | 0, type: s.type }));
    },

    // File picker entry point. Reads a JSON file the user picked and
    // returns the registered mod via the callback.
    pickFile(onLoaded) {
        try {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json,application/json';
            inp.style.position = 'fixed';
            inp.style.opacity = '0';
            inp.onchange = (ev) => {
                const f = ev.target.files && ev.target.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const mod = JSON.parse(reader.result);
                        const reg = Mods.register(mod);
                        onLoaded(reg, null);
                    } catch (e) {
                        onLoaded(null, e.message);
                    }
                };
                reader.onerror = () => onLoaded(null, 'READ FAILED');
                reader.readAsText(f);
            };
            document.body.appendChild(inp);
            inp.click();
            setTimeout(() => { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 1000);
        } catch (e) {
            onLoaded(null, e.message);
        }
    }
};

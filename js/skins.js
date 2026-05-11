// ============================================
// CLIPPY SKINS - unlockable visual variants
// ============================================
// Each skin defines:
//   - filter: CSS filter string for PNG sprites (drawImage)
//   - palette: optional palette override for the procedural Clippy
//     (drawn via fillRect, since fillRect doesn't honor ctx.filter)
//   - unlock(ctx): predicate that returns true when the skin is
//     selectable. The argument carries handles to game and
//     achievements so the predicate can inspect them.
//
// Persisted selection: localStorage clippy_first_blood_skin = id.

const SKINS = [
    {
        id: 'classic',
        name: 'CLASSIC',
        desc: 'THE ORIGINAL PAPERCLIP',
        filter: null,
        palette: null,
        unlock: () => true
    },
    {
        id: 'golden',
        name: 'GOLDEN',
        desc: 'BEAT THE GAME ON HARD',
        filter: 'sepia(1) saturate(3) hue-rotate(-15deg) brightness(1.1)',
        // Procedural override - 24-bit gold tones replacing greys
        palette: {
            0: null,
            1: '#3a2a08',     // dark gold outline
            2: '#604008',
            3: '#8a6010',
            4: '#c89020',     // mid gold (replaces metal grey)
            5: '#e8b840',     // bright gold
            6: '#fff8c0',     // hot highlight
            7: '#2a5298', 8: '#4a82c8', 9: '#6ab2f8',
            10:'#8b4513', 11:'#654321', 12:'#cd853f',
            13:'#ff6b6b', 14:'#cc4444', 15:'#228b22'
        },
        unlock: (ctx) => ctx.achievements && ctx.achievements.has('HARD')
    },
    {
        id: 'chrome',
        name: 'CHROME',
        desc: 'EARN EVERY TROPHY',
        filter: 'saturate(0) brightness(1.25) contrast(1.2)',
        palette: {
            0: null,
            1: '#1a1a1a', 2: '#3a3a3a', 3: '#5a5a5a', 4: '#9a9a9a',
            5: '#d8d8d8', 6: '#ffffff',
            7: '#1a1a3a', 8: '#3a3a6a', 9: '#a8a8c8',
            10:'#5a5a5a', 11:'#3a3a3a', 12:'#9a9a9a',
            13:'#888888', 14:'#5a5a5a', 15:'#a8a8a8'
        },
        unlock: (ctx) => {
            if (!ctx.achievements || typeof ACHIEVEMENT_LIST === 'undefined') return false;
            return ACHIEVEMENT_LIST.every(a => ctx.achievements.has(a.id));
        }
    },
    {
        id: 'purple',
        name: 'CLIPPETTA',
        desc: 'IN MEMORY  -  CLEAR NG+',
        filter: 'hue-rotate(220deg) saturate(1.6) brightness(1.05)',
        palette: {
            0: null,
            1: '#1a0e3a', 2: '#3a2855', 3: '#564468', 4: '#7a608c',
            5: '#c0a0d0', 6: '#ffe8ff',
            7: '#8030c0', 8: '#a050e0', 9: '#d080ff',
            10:'#5a2a78', 11:'#3a1a4a', 12:'#a060c0',
            13:'#ff80c0', 14:'#cc4488', 15:'#5a2a78'
        },
        unlock: (ctx) => {
            try { return localStorage.getItem('clippy_first_blood_ngplus_clear') === '1'; }
            catch (e) { return false; }
        }
    },
    {
        id: 'shadow',
        name: 'SHADOW',
        desc: 'DEFEAT THE USURPER',
        filter: 'brightness(0.35) saturate(0.4) hue-rotate(200deg)',
        palette: {
            0: null,
            1: '#000000', 2: '#080810', 3: '#181828', 4: '#282838',
            5: '#383848', 6: '#484858',
            7: '#1a0a2a', 8: '#2a1a3a', 9: '#3a2a4a',
            10:'#0a0612', 11:'#000000', 12:'#1a1424',
            13:'#3a1424', 14:'#241018', 15:'#100818'
        },
        unlock: (ctx) => {
            // Stage 7 (THE USURPER) has been beaten - we record this via the
            // saveStageBest hook when a ghost is saved for stage 7.
            try {
                return !!localStorage.getItem('clippy_first_blood_ghost_6');
            } catch (e) { return false; }
        }
    },
    {
        id: 'rage',
        name: 'BLOOD MOON',
        desc: 'CHAIN A 20-HIT COMBO',
        filter: 'hue-rotate(-25deg) saturate(2.2) brightness(1.1) contrast(1.1)',
        palette: {
            0: null,
            1: '#1a0000', 2: '#3a0808', 3: '#5a1010', 4: '#8a2020',
            5: '#cc4040', 6: '#ff8080',
            7: '#4a0010', 8: '#7a1018', 9: '#a82030',
            10:'#3a0608', 11:'#1a0000', 12:'#601410',
            13:'#ff5050', 14:'#a82020', 15:'#5a1010'
        },
        unlock: (ctx) => {
            try { return parseInt(localStorage.getItem('clippy_first_blood_max_combo') || '0', 10) >= 20; }
            catch (e) { return false; }
        }
    }
];

function getSkinById(id) {
    return SKINS.find(s => s.id === id) || SKINS[0];
}

function getUnlockedSkins(ctx) {
    return SKINS.filter(s => s.unlock(ctx));
}

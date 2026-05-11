// ============================================
// PASSWORD - compact alphanumeric save / share code
// ============================================
// Encodes progress flags (achievements bitmap + skin id + a few
// boolean unlocks) into a base32 string with a checksum so the
// password can be shared between browsers / sent to a friend.
//
// Format (before encoding): a UTF-8 byte sequence
//   byte 0    version (currently 1)
//   bytes 1-2 achievement bitmap (16 bits, little-endian)
//   byte 3    skin index (0..255 - we use ~6)
//   byte 4    flags - bit0=bossRushUnlocked, bit1=ngplus_clear,
//             bit2=tutorial_done, bit3-7 reserved
//   byte 5    high-score upper-byte (capped at 255 * 256 = 65280)
//   byte 6    high-score middle-byte
//   byte 7    high-score low-byte
//   byte 8    max combo (capped at 255)
//   byte 9    checksum (sum of preceding bytes mod 251)
//
// The 10 bytes encode to 16 base32 chars (RFC 4648 alphabet).
// Displayed in 4-char groups separated by dashes.

const PWD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function pwdEncodeBase32(bytes) {
    let bits = 0, value = 0, output = '';
    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;
        while (bits >= 5) {
            output += PWD_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += PWD_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

function pwdDecodeBase32(s) {
    s = (s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0, value = 0;
    const out = [];
    for (let i = 0; i < s.length; i++) {
        const idx = PWD_ALPHABET.indexOf(s[i]);
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return out;
}

// Build the byte payload from the current Game/Achievements state
function pwdMakePayload(game, ach) {
    const bytes = new Array(10).fill(0);
    bytes[0] = 1;     // version
    // Bitmap of achievements - first 16 in ACHIEVEMENT_LIST order
    let bmp = 0;
    if (typeof ACHIEVEMENT_LIST !== 'undefined' && ach) {
        for (let i = 0; i < Math.min(16, ACHIEVEMENT_LIST.length); i++) {
            if (ach.has(ACHIEVEMENT_LIST[i].id)) bmp |= (1 << i);
        }
    }
    bytes[1] = bmp & 0xff;
    bytes[2] = (bmp >>> 8) & 0xff;
    // Skin index - look up in SKINS array
    let skinIdx = 0;
    if (typeof SKINS !== 'undefined' && game && game.skinId) {
        const found = SKINS.findIndex(s => s.id === game.skinId);
        if (found >= 0) skinIdx = found;
    }
    bytes[3] = skinIdx & 0xff;
    // Flag bits
    let flags = 0;
    if (game && game.bossRushUnlocked) flags |= 1;
    try {
        if (localStorage.getItem('clippy_first_blood_ngplus_clear') === '1') flags |= 2;
        if (localStorage.getItem('clippy_first_blood_tutorial_done') === '1') flags |= 4;
    } catch (e) {}
    bytes[4] = flags & 0xff;
    // High score - 24-bit big-endian
    const hi = Math.min(0xffffff, Math.max(0, (game && game.highScore) || 0));
    bytes[5] = (hi >>> 16) & 0xff;
    bytes[6] = (hi >>> 8) & 0xff;
    bytes[7] = hi & 0xff;
    // Max combo
    let maxCombo = 0;
    try { maxCombo = parseInt(localStorage.getItem('clippy_first_blood_max_combo') || '0', 10) || 0; } catch (e) {}
    bytes[8] = Math.min(255, maxCombo) & 0xff;
    // Checksum
    let sum = 0;
    for (let i = 0; i < 9; i++) sum = (sum + bytes[i]) & 0xff;
    bytes[9] = sum % 251;
    return bytes;
}

function pwdEncodeForDisplay(bytes) {
    const raw = pwdEncodeBase32(bytes);
    // 16-char raw -> "XXXX-XXXX-XXXX-XXXX"
    const groups = [];
    for (let i = 0; i < raw.length; i += 4) groups.push(raw.slice(i, i + 4));
    return groups.join('-');
}

// Decode a password string into a payload object. Returns null on
// checksum / version mismatch.
function pwdDecode(s) {
    const bytes = pwdDecodeBase32(s);
    if (bytes.length < 10) return null;
    if (bytes[0] !== 1) return null;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum = (sum + bytes[i]) & 0xff;
    if (bytes[9] !== sum % 251) return null;
    const bmp = bytes[1] | (bytes[2] << 8);
    const flags = bytes[4];
    return {
        version: 1,
        achievementBits: bmp,
        skinIndex: bytes[3],
        bossRushUnlocked: !!(flags & 1),
        ngplusClear: !!(flags & 2),
        tutorialDone: !!(flags & 4),
        highScore: (bytes[5] << 16) | (bytes[6] << 8) | bytes[7],
        maxCombo: bytes[8]
    };
}

// Apply a decoded payload to the game + localStorage. Only ever
// merges UP (so importing an older password can't strip progress).
function pwdApply(game, payload) {
    if (!payload) return false;
    try {
        // Achievements - union the bitmap with existing
        if (typeof ACHIEVEMENT_LIST !== 'undefined' && typeof achievements !== 'undefined') {
            for (let i = 0; i < Math.min(16, ACHIEVEMENT_LIST.length); i++) {
                if (payload.achievementBits & (1 << i)) {
                    achievements.grant(ACHIEVEMENT_LIST[i].id);
                }
            }
        }
        // Skin
        if (typeof SKINS !== 'undefined' && SKINS[payload.skinIndex]) {
            game.skinId = SKINS[payload.skinIndex].id;
            localStorage.setItem('clippy_first_blood_skin', game.skinId);
        }
        // Flag unlocks
        if (payload.bossRushUnlocked) {
            game.bossRushUnlocked = true;
            localStorage.setItem('clippy_first_blood_complete', '1');
        }
        if (payload.ngplusClear) {
            localStorage.setItem('clippy_first_blood_ngplus_clear', '1');
        }
        if (payload.tutorialDone) {
            localStorage.setItem('clippy_first_blood_tutorial_done', '1');
            game.tutorialDone = true;
        }
        // High score - take the max
        if (payload.highScore > game.highScore) {
            game.highScore = payload.highScore;
            localStorage.setItem('clippy_first_blood_hiscore', String(payload.highScore));
        }
        // Max combo
        const prevCombo = parseInt(localStorage.getItem('clippy_first_blood_max_combo') || '0', 10);
        if (payload.maxCombo > prevCombo) {
            localStorage.setItem('clippy_first_blood_max_combo', String(payload.maxCombo));
        }
    } catch (e) {}
    return true;
}

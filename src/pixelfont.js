// 5x7 pixel font baked as bit-arrays. Each glyph is 5 cols x 7 rows.
// Drawn with fillRect per pixel — keeps the SNES aesthetic and avoids
// any browser-font rendering, which would betray the resolution.

const F = {};
// Compact format: each row is a 5-bit binary number, msb = leftmost pixel.
const def = (ch, ...rows) => { F[ch] = rows; };

def('A', 0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001);
def('B', 0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110);
def('C', 0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111);
def('D', 0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110);
def('E', 0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111);
def('F', 0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000);
def('G', 0b01111, 0b10000, 0b10000, 0b10011, 0b10001, 0b10001, 0b01111);
def('H', 0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001);
def('I', 0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111);
def('J', 0b00001, 0b00001, 0b00001, 0b00001, 0b00001, 0b10001, 0b01110);
def('K', 0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001);
def('L', 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111);
def('M', 0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001);
def('N', 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001);
def('O', 0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110);
def('P', 0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000);
def('Q', 0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101);
def('R', 0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001);
def('S', 0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110);
def('T', 0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100);
def('U', 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110);
def('V', 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100);
def('W', 0b10001, 0b10001, 0b10001, 0b10001, 0b10101, 0b11011, 0b10001);
def('X', 0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001);
def('Y', 0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100);
def('Z', 0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111);
def('0', 0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110);
def('1', 0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110);
def('2', 0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111);
def('3', 0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110);
def('4', 0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010);
def('5', 0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110);
def('6', 0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110);
def('7', 0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000);
def('8', 0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110);
def('9', 0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100);
def(' ', 0,0,0,0,0,0,0);
def(':', 0,0b00100,0b00100,0,0b00100,0b00100,0);
def('.', 0,0,0,0,0,0b00110,0b00110);
def(',', 0,0,0,0,0,0b00110,0b00100);
def('-', 0,0,0,0b01110,0,0,0);
def('!', 0b00100,0b00100,0b00100,0b00100,0b00100,0,0b00100);
def('?', 0b01110,0b10001,0b00001,0b00010,0b00100,0,0b00100);
def("'",0b00100,0b00100,0,0,0,0,0);
def('/', 0,0b00001,0b00010,0b00100,0b01000,0b10000,0);
def('+', 0,0b00100,0b00100,0b11111,0b00100,0b00100,0);
def('(', 0b00010,0b00100,0b01000,0b01000,0b01000,0b00100,0b00010);
def(')', 0b01000,0b00100,0b00010,0b00010,0b00010,0b00100,0b01000);
def('x', 0,0,0,0b10001,0b01010,0b00100,0b01010);
def('"', 0b01010,0b01010,0,0,0,0,0);
def('%', 0b11001,0b11010,0b00100,0b00100,0b00100,0b01011,0b10011);
def('>', 0b10000,0b01000,0b00100,0b00010,0b00100,0b01000,0b10000);
def('<', 0b00001,0b00010,0b00100,0b01000,0b00100,0b00010,0b00001);
def('=', 0,0,0b11111,0,0b11111,0,0);
def('*', 0,0b01010,0b00100,0b11111,0b00100,0b01010,0);
def('#', 0b01010,0b11111,0b01010,0b01010,0b01010,0b11111,0b01010);
def('$', 0b00100,0b01111,0b10100,0b01110,0b00101,0b11110,0b00100);
def('&', 0b01100,0b10010,0b10100,0b01000,0b10101,0b10010,0b01101);
def('@', 0b01110,0b10001,0b10111,0b10101,0b10111,0b10000,0b01110);
def('[', 0b01110,0b01000,0b01000,0b01000,0b01000,0b01000,0b01110);
def(']', 0b01110,0b00010,0b00010,0b00010,0b00010,0b00010,0b01110);
def(';', 0,0b00100,0,0,0b00100,0b00100,0b01000);
def('~', 0,0,0,0b01001,0b10110,0,0);
def('^', 0b00100,0b01010,0b10001,0,0,0,0);
// R159: em-dash (—) used as section separators in banner titles like
// "ZONE 2 — SHOOTING". Without this glyph the font fell back to '?',
// reading as "ZONE 2 ? SHOOTING" in training tips and elsewhere.
def('—', 0,0,0,0b11111,0,0,0);
// R230: underscore — needed for artist credit "R_I_P" in soundtrack.
def('_', 0,0,0,0,0,0,0b11111);

const CHAR_W = 5;
const CHAR_H = 7;
const SPACING = 1;

export function textWidth(s, scale = 1) {
    return s.length * (CHAR_W + SPACING) * scale - SPACING * scale;
}

// Tracks chars that fell back to '?' so missing-glyph bugs surface in
// dev without requiring a visual screenshot. One warn per char per session.
const _warnedMissing = new Set();
export function drawText(ctx, s, x, y, color = '#fff', scale = 1, align = 'left') {
    const text = String(s).toUpperCase();
    const w = textWidth(text, scale);
    if (align === 'center') x = Math.round(x - w / 2);
    else if (align === 'right') x = Math.round(x - w);
    let cx = x;
    ctx.fillStyle = color;
    for (const ch of text) {
        let rows = F[ch];
        if (!rows) {
            if (!_warnedMissing.has(ch)) {
                _warnedMissing.add(ch);
                if (typeof console !== 'undefined') {
                    console.warn(`pixelfont: missing glyph '${ch}' (in "${text}"), falling back to '?'`);
                }
            }
            rows = F['?'];
        }
        for (let r = 0; r < CHAR_H; r++) {
            const bits = rows[r];
            if (!bits) continue;
            for (let c = 0; c < CHAR_W; c++) {
                if (bits & (1 << (CHAR_W - 1 - c))) {
                    ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
                }
            }
        }
        cx += (CHAR_W + SPACING) * scale;
    }
}

export function drawTextOutlined(ctx, s, x, y, color, outline, scale = 1, align = 'left') {
    // Draw outline first by stamping in 8 directions, then the main text.
    const orig = ctx.fillStyle;
    for (let dy = -scale; dy <= scale; dy += scale) {
        for (let dx = -scale; dx <= scale; dx += scale) {
            if (dx === 0 && dy === 0) continue;
            drawText(ctx, s, x + dx, y + dy, outline, scale, align);
        }
    }
    drawText(ctx, s, x, y, color, scale, align);
    ctx.fillStyle = orig;
}

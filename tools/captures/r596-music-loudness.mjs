// R596: loudness/clip analysis of EVERY music track shipped in assets/audio.
//
// Companion to r594-sfx-loudness.mjs. That one RENDERS the WebAudio synth
// (the game has no SFX files); this one analyzes REAL audio files on disk —
// the 30 MP3 tracks the game streams as its music bed. We decode each file to
// PCM via the browser's decodeAudioData (which handles MP3/OGG/WAV alike — point
// it at a .wav and it Just Works), then compute the same dBFS metrics.
//
// Why this matters: the game shuffles between these tracks at stage/scene
// changes. If one track is mastered 6 dB hotter than the rest, it'll JUMP OUT
// when the playlist rolls onto it — the player reaches for the volume knob. So
// per track we measure:
//   peak dBFS     — true sample ceiling (is anything clipping / brickwalled?)
//   RMS dBFS      — overall energy, the rough "how loud does it sit" number
//   loud-window   — loudest 3s RMS window, a crude integrated-loudness proxy
//                   (closer to perceived loudness than whole-file RMS, which a
//                   long quiet intro/outro drags down)
//   clip count    — samples at/over full scale (lossy MP3 can exceed 0 dBFS)
// Then we flag tracks whose loud-window sits far from the library median, so a
// mismatched master is caught before it ships.
import { chromium } from 'playwright';
import { readdirSync } from 'fs';

const AUDIO_DIR = 'assets/audio';
// Top-level .mp3 only — skip the _originals_pre_r352 archive subdir.
const files = readdirSync(AUDIO_DIR).filter(f => f.toLowerCase().endsWith('.mp3')).sort();
if (!files.length) { console.log('No MP3s found in', AUDIO_DIR); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newContext().then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });

// Decode + analyze every file inside the page so decodeAudioData is available.
const measure = await page.evaluate(async (files) => {
    const dbfs = (lin) => lin <= 1e-9 ? -Infinity : 20 * Math.log10(lin);

    // Whole-file peak / RMS / clip-count over a mono mixdown of all channels.
    const analyzeFull = (mono) => {
        let peak = 0, sumSq = 0, clipped = 0;
        const n = mono.length;
        for (let i = 0; i < n; i++) {
            const a = Math.abs(mono[i]);
            if (a > peak) peak = a;
            sumSq += mono[i] * mono[i];
            if (a >= 0.999) clipped++;
        }
        return { peakDb: +dbfs(peak).toFixed(2), rmsDb: +dbfs(Math.sqrt(sumSq / n)).toFixed(2), clipped };
    };

    // Loudest sliding `winS`-second RMS window — a perceived-loudness proxy that
    // ignores quiet intros/outros that would drag the whole-file RMS down. Step
    // the window in 0.5s hops over a downsampled energy envelope for speed.
    const loudWindow = (mono, sr, winS = 3) => {
        const hop = (sr * 0.5) | 0;
        const win = (sr * winS) | 0;
        if (mono.length < win) return analyzeFull(mono).rmsDb; // short track
        // Prefix sum of squares at hop resolution.
        let best = 0;
        let running = 0;
        // Seed first window.
        for (let i = 0; i < win; i++) running += mono[i] * mono[i];
        best = running / win;
        for (let start = hop; start + win <= mono.length; start += hop) {
            for (let i = start - hop; i < start; i++) running -= mono[i] * mono[i];
            for (let i = start + win - hop; i < start + win; i++) running += mono[i] * mono[i];
            const ms = running / win;
            if (ms > best) best = ms;
        }
        return +dbfs(Math.sqrt(best)).toFixed(2);
    };

    const out = {};
    for (const f of files) {
        try {
            const res = await fetch('/assets/audio/' + encodeURIComponent(f) + '?probe=' + Date.now());
            if (!res.ok) { out[f] = { err: 'HTTP ' + res.status }; continue; }
            const arr = await res.arrayBuffer();
            const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
            const buf = await ctx.decodeAudioData(arr);
            // Mono mixdown.
            const n = buf.length, ch = buf.numberOfChannels;
            const mono = new Float32Array(n);
            for (let c = 0; c < ch; c++) {
                const d = buf.getChannelData(c);
                for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
            }
            const full = analyzeFull(mono);
            out[f] = {
                ...full,
                loudWin: loudWindow(mono, buf.sampleRate),
                durS: +(buf.duration).toFixed(1),
                sr: buf.sampleRate,
                ch,
            };
        } catch (e) {
            out[f] = { err: String(e && e.message || e) };
        }
    }
    return out;
}, files);

await browser.close();

// --- Report ---
const rows = Object.entries(measure).filter(([, v]) => !v.err);
const failed = Object.entries(measure).filter(([, v]) => v.err);

const loudVals = rows.map(([, v]) => v.loudWin).filter(x => isFinite(x)).sort((a, b) => a - b);
const median = loudVals[Math.floor(loudVals.length / 2)];
const spread = loudVals.length ? (loudVals[loudVals.length - 1] - loudVals[0]).toFixed(1) : 'n/a';

console.log(`=== MUSIC LOUDNESS / CLIP ANALYSIS (${rows.length} tracks) ===`);
console.log(`median loud-window: ${median} dBFS    library spread: ${spread} dB\n`);
console.log('track'.padEnd(28), 'peak    RMS   loudWin  clip   dur(s)  ch');
const flags = [];
for (const [name, v] of rows.sort((a, b) => b[1].loudWin - a[1].loudWin)) {
    console.log(
        name.padEnd(28),
        String(v.peakDb).padStart(6), ' ',
        String(v.rmsDb).padStart(6), ' ',
        String(v.loudWin).padStart(6), ' ',
        String(v.clipped).padStart(5), ' ',
        String(v.durS).padStart(6), ' ',
        String(v.ch).padStart(2),
    );
    if (v.clipped > 0) flags.push(`CLIP  ${name}: ${v.clipped} samples ≥ -0.01 dBFS`);
    if (isFinite(v.loudWin) && v.loudWin > median + 3) flags.push(`LOUD  ${name}: loud-window ${v.loudWin} dBFS is ${(v.loudWin - median).toFixed(1)} dB above median (will jump out)`);
    if (isFinite(v.loudWin) && v.loudWin < median - 4) flags.push(`QUIET ${name}: loud-window ${v.loudWin} dBFS is ${(median - v.loudWin).toFixed(1)} dB below median (will dip)`);
}

console.log('\n=== FLAGS ===');
if (!flags.length) console.log('none — tracks are within a tight loudness band; no clipping.');
else flags.forEach(f => console.log('  ' + f));

if (failed.length) {
    console.log('\n=== DECODE FAILURES ===');
    failed.forEach(([n, v]) => console.log(`  ${n}: ${v.err}`));
}
if (errors.length) { console.log('\nPAGE ERRORS:', errors.length); errors.forEach(e => console.log('  ' + e)); }
console.log('\nDONE');

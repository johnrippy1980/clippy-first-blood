// R594: offline-render loudness/clip analysis of EVERY synthesized SFX.
//
// The game has no audio files — all sound is built live in WebAudio (audio.js).
// So to measure "is the mix balanced? is anything clipping?" we can't inspect a
// WAV; we have to RENDER the synth and analyze the resulting PCM. This drives
// the real audio engine through an OfflineAudioContext (deterministic, no
// realtime playback), captures each sfx('name') as a Float32 sample buffer, and
// computes peak dBFS, RMS dBFS, clipped-sample count, and active duration.
//
// Two taps are measured:
//   raw  — straight off the sfxBus, BEFORE the master tanh soft-limiter. This is
//          the true synth output; clipping here is a real "too hot" sound the
//          limiter is only masking.
//   out  — after the same tanh limiter the live game uses (master → limiter →
//          destination). This is what players actually hear.
//
// Output: a per-SFX table + flags for (a) raw clipping, (b) peaks within 0.5 dB
// of full-scale, and (c) loudness outliers (RMS far from the median), so we can
// spot a sound that's jarringly louder/quieter than the rest of the palette.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext().then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Pull the canonical list of SFX names straight from the sfx() switch source so
// the analysis can't drift out of sync with what the engine actually defines.
const names = await page.evaluate(async () => {
    const res = await fetch('/src/audio.js?probe=' + Date.now());
    const src = await res.text();
    const body = src.slice(src.indexOf('sfx(name)'));
    const end = body.indexOf('\n    }\n');           // end of the method
    const slice = body.slice(0, end > 0 ? end : 20000);
    const set = new Set();
    for (const m of slice.matchAll(/case\s+'([a-zA-Z0-9_]+)'/g)) set.add(m[1]);
    return [...set];
});

// Render one SFX offline and return its PCM measurements. We rebuild a minimal
// graph on an OfflineAudioContext and point the engine's ctx/buses at it, so the
// engine's own _gunshot/_explode/etc. synth code runs unmodified against the
// offline context. tanh limiter mirrors audio.js init().
const measure = await page.evaluate(async (names) => {
    const A = window.__audio;
    if (!A) return { err: 'no __audio global' };

    const SR = 48000, DUR = 1.0;
    const dbfs = (lin) => lin <= 1e-9 ? -Infinity : 20 * Math.log10(lin);

    const analyze = (buf) => {
        let peak = 0, sumSq = 0, clipped = 0, lastNonSilent = 0;
        const n = buf.length;
        for (let i = 0; i < n; i++) {
            const a = Math.abs(buf[i]);
            if (a > peak) peak = a;
            sumSq += buf[i] * buf[i];
            if (a >= 0.999) clipped++;
            if (a > 0.0005) lastNonSilent = i;
        }
        return {
            peakDb: +dbfs(peak).toFixed(2),
            rmsDb: +dbfs(Math.sqrt(sumSq / n)).toFixed(2),
            clipped,
            durMs: +(lastNonSilent / SR * 1000).toFixed(1),
        };
    };

    const out = {};
    for (const name of names) {
        try {
            const octx = new OfflineAudioContext(1, SR * DUR, SR);
            // Rebuild the bus chain on the offline ctx, mirroring init().
            const master = octx.createGain(); master.gain.value = 1.0;
            const sfxBus = octx.createGain(); sfxBus.gain.value = 1.0;
            const musicBus = octx.createGain();
            // tanh soft-limiter identical to the live game.
            const lim = octx.createWaveShaper();
            const curve = new Float32Array(1024);
            for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 1.4); }
            lim.curve = curve;
            // RAW tap: capture sfxBus output before the limiter, in parallel.
            // We can't read two render targets from one OfflineAudioContext, so
            // render twice — once raw (sfxBus→dest), once limited (full chain).
            // Point the engine at the offline graph.
            const savedCtx = A.ctx, savedMaster = A.master, savedSfx = A.sfxBus,
                  savedMusic = A.musicBus, savedMuted = A.muted;
            A.ctx = octx; A.master = master; A.sfxBus = sfxBus; A.musicBus = musicBus; A.muted = false;

            // --- RAW render: sfxBus straight to destination ---
            sfxBus.connect(octx.destination);
            A.sfx(name);
            const rawBuf = (await octx.startRendering()).getChannelData(0);

            // --- LIMITED render: fresh ctx, full chain ---
            const octx2 = new OfflineAudioContext(1, SR * DUR, SR);
            const master2 = octx2.createGain(); master2.gain.value = 1.0;
            const sfxBus2 = octx2.createGain(); sfxBus2.gain.value = 1.0;
            const musicBus2 = octx2.createGain();
            const lim2 = octx2.createWaveShaper();
            const c2 = new Float32Array(1024);
            for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; c2[i] = Math.tanh(x * 1.4); }
            lim2.curve = c2;
            sfxBus2.connect(master2); master2.connect(lim2); lim2.connect(octx2.destination);
            A.ctx = octx2; A.master = master2; A.sfxBus = sfxBus2; A.musicBus = musicBus2;
            A.sfx(name);
            const outBuf = (await octx2.startRendering()).getChannelData(0);

            // Restore the live engine.
            A.ctx = savedCtx; A.master = savedMaster; A.sfxBus = savedSfx;
            A.musicBus = savedMusic; A.muted = savedMuted;

            out[name] = { raw: analyze(rawBuf), out: analyze(outBuf) };
        } catch (e) {
            out[name] = { err: String(e && e.message || e) };
        }
    }
    return out;
}, names);

await browser.close();

if (measure.err) { console.log('FATAL:', measure.err); process.exit(1); }

// --- Report ---
const rows = Object.entries(measure).filter(([, v]) => !v.err);
const failed = Object.entries(measure).filter(([, v]) => v.err);

// Median RMS (raw) for outlier detection.
const rmsVals = rows.map(([, v]) => v.raw.rmsDb).filter(x => isFinite(x)).sort((a, b) => a - b);
const median = rmsVals[Math.floor(rmsVals.length / 2)];

console.log(`=== SFX LOUDNESS / CLIP ANALYSIS (${rows.length} sounds) ===`);
console.log(`median raw RMS: ${median} dBFS\n`);
console.log('name'.padEnd(22), 'rawPeak  rawRMS  clip   outPeak  outRMS  dur(ms)');
const flags = [];
for (const [name, v] of rows.sort((a, b) => b[1].raw.peakDb - a[1].raw.peakDb)) {
    const r = v.raw, o = v.out;
    console.log(
        name.padEnd(22),
        String(r.peakDb).padStart(6), ' ',
        String(r.rmsDb).padStart(6), ' ',
        String(r.clipped).padStart(5), ' ',
        String(o.peakDb).padStart(6), ' ',
        String(o.rmsDb).padStart(6), ' ',
        String(r.durMs).padStart(6),
    );
    if (r.clipped > 0) flags.push(`CLIP  ${name}: ${r.clipped} raw samples ≥ -0.01 dBFS (limiter is masking it)`);
    else if (r.peakDb > -0.5) flags.push(`HOT   ${name}: raw peak ${r.peakDb} dBFS (within 0.5 dB of full scale)`);
    if (isFinite(r.rmsDb) && r.rmsDb > median + 12) flags.push(`LOUD  ${name}: raw RMS ${r.rmsDb} dBFS is ${(r.rmsDb - median).toFixed(1)} dB above median`);
    if (isFinite(r.rmsDb) && r.rmsDb < median - 18) flags.push(`QUIET ${name}: raw RMS ${r.rmsDb} dBFS is ${(median - r.rmsDb).toFixed(1)} dB below median`);
}

console.log('\n=== FLAGS ===');
if (!flags.length) console.log('none — no raw clipping, no near-full-scale peaks, no big loudness outliers.');
else flags.forEach(f => console.log('  ' + f));

if (failed.length) {
    console.log('\n=== RENDER FAILURES ===');
    failed.forEach(([n, v]) => console.log(`  ${n}: ${v.err}`));
}
if (errors.length) { console.log('\nPAGE ERRORS:', errors.length); errors.forEach(e => console.log('  ' + e)); }
console.log('\nDONE');

// ============================================
// MIDI EXPORT - Serialize a chiptune pattern as a Standard MIDI File.
// ============================================
// MIDI Format-1 file with up to 4 tracks (lead / harmony / bass / drums).
// Division = 96 ticks per quarter -> 24 ticks per 16th-note step.
// Drums are written to General-MIDI channel 10 (index 9) with kick=36,
// snare=38, hihat=42.

const MIDI = {
    TPQN: 96,
    STEP_TICKS: 24,              // 1 step = 1 16th-note = TPQN/4
    NOTE_DUR_TICKS: 22,          // slightly shorter than step for clean separation
    DRUM_NOTE: { K: 36, S: 38, H: 42 },

    // Variable-length quantity (MIDI delta-time encoding)
    writeVarLen(bytes, value) {
        const buf = [value & 0x7f];
        while ((value >>= 7) > 0) buf.unshift((value & 0x7f) | 0x80);
        for (const b of buf) bytes.push(b);
    },

    writeUint32(bytes, value) {
        bytes.push((value >>> 24) & 0xff);
        bytes.push((value >>> 16) & 0xff);
        bytes.push((value >>> 8) & 0xff);
        bytes.push(value & 0xff);
    },
    writeUint16(bytes, value) {
        bytes.push((value >>> 8) & 0xff);
        bytes.push(value & 0xff);
    },

    // Convert a chiptune pattern into a Standard MIDI File byte array.
    // pattern: { events, length, bpm } from buildPattern()
    encodePattern(pattern, name) {
        if (!pattern || !pattern.events) return null;
        const tracks = [];

        // Track 0 - tempo + name (meta track)
        const meta = [];
        // Track name
        if (name) {
            this.writeVarLen(meta, 0);
            meta.push(0xff, 0x03, name.length);
            for (let i = 0; i < name.length; i++) meta.push(name.charCodeAt(i) & 0x7f);
        }
        // Tempo - microseconds per quarter
        const usPerQuarter = Math.round(60000000 / (pattern.bpm || 120));
        this.writeVarLen(meta, 0);
        meta.push(0xff, 0x51, 0x03,
            (usPerQuarter >>> 16) & 0xff,
            (usPerQuarter >>> 8) & 0xff,
            usPerQuarter & 0xff);
        // End of track
        this.writeVarLen(meta, 0);
        meta.push(0xff, 0x2f, 0x00);
        tracks.push(meta);

        // Bucket events by channel
        const byChannel = { 0: [], 1: [], 2: [], 3: [] };
        for (const ev of pattern.events) byChannel[ev.channel].push(ev);

        // Map our channels onto MIDI channels + program changes.
        const channelConfig = [
            { midiCh: 0, program: 80, name: 'Lead Square' },        // GM 80 = Square
            { midiCh: 1, program: 81, name: 'Harmony Saw' },        // GM 81 = Sawtooth
            { midiCh: 2, program: 38, name: 'Triangle Bass' },      // GM 38 = Synth Bass
            { midiCh: 9, program: 0,  name: 'Drums', isDrums: true }
        ];

        for (let ch = 0; ch < 4; ch++) {
            const cfg = channelConfig[ch];
            const events = byChannel[ch].slice().sort((a, b) => a.step - b.step);
            const track = [];

            // Track name
            this.writeVarLen(track, 0);
            track.push(0xff, 0x03, cfg.name.length);
            for (let i = 0; i < cfg.name.length; i++) track.push(cfg.name.charCodeAt(i) & 0x7f);

            // Program change (skip for drums - GM ch10 is fixed-percussion)
            if (!cfg.isDrums) {
                this.writeVarLen(track, 0);
                track.push(0xc0 | cfg.midiCh, cfg.program & 0x7f);
            }

            // Build absolute-time note on/off pairs
            const pairs = [];
            for (const e of events) {
                let pitch;
                if (cfg.isDrums) {
                    pitch = this.DRUM_NOTE[e.drum] || 36;
                } else if (e.midi != null) {
                    pitch = e.midi;
                } else continue;
                const onTick  = e.step * this.STEP_TICKS;
                const dur     = cfg.isDrums ? this.NOTE_DUR_TICKS
                                            : Math.max(4, e.dur * this.STEP_TICKS - 2);
                pairs.push({ tick: onTick, kind: 'on',  pitch, vel: cfg.isDrums ? 110 : 90 });
                pairs.push({ tick: onTick + dur, kind: 'off', pitch, vel: 64 });
            }
            // Stable sort by tick; off-before-on at same tick is fine for clean release
            pairs.sort((a, b) => a.tick - b.tick || (a.kind === 'on' ? 1 : -1));

            let lastTick = 0;
            for (const p of pairs) {
                const delta = p.tick - lastTick;
                this.writeVarLen(track, delta);
                track.push(((p.kind === 'on' ? 0x90 : 0x80) | cfg.midiCh) & 0xff, p.pitch & 0x7f, p.vel & 0x7f);
                lastTick = p.tick;
            }
            // End of track
            this.writeVarLen(track, 0);
            track.push(0xff, 0x2f, 0x00);
            tracks.push(track);
        }

        // Assemble the file
        const out = [];
        // Header chunk: 'MThd' + 6 + format + ntrks + division
        for (const c of 'MThd') out.push(c.charCodeAt(0));
        this.writeUint32(out, 6);
        this.writeUint16(out, 1);                 // format 1
        this.writeUint16(out, tracks.length);
        this.writeUint16(out, this.TPQN);

        // Track chunks
        for (const t of tracks) {
            for (const c of 'MTrk') out.push(c.charCodeAt(0));
            this.writeUint32(out, t.length);
            for (const b of t) out.push(b);
        }
        return new Uint8Array(out);
    },

    // Trigger a download of a MIDI buffer in the browser
    downloadBuffer(buffer, filename) {
        try {
            const blob = new Blob([buffer], { type: 'audio/midi' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return true;
        } catch (e) { return false; }
    },

    // Convenience wrapper - takes an Audio instance and a theme name
    exportTheme(audioObj, theme) {
        if (!audioObj || !audioObj.getPattern) return false;
        const pattern = audioObj.getPattern(theme);
        if (!pattern) return false;
        const name = 'Clippy First Blood - ' + (pattern.name || theme);
        const buf = this.encodePattern(pattern, name);
        if (!buf) return false;
        return this.downloadBuffer(buf, `clippy-${theme}.mid`);
    }
};

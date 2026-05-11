// ============================================
// AUDIO - Procedural chiptune + SFX
// All sounds synthesized at runtime via Web Audio.
// SNES-style: square waves for melody, triangle for bass,
// filtered noise for drums.
// ============================================

class Audio {
    constructor() {
        this.enabled = false;
        this.musicEnabled = true;
        this.sfxEnabled = true;
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;

        // Music sequencer state
        this.musicPlaying = false;
        this.nextNoteTime = 0;
        this.currentStep = 0;
        this.bpm = 132;
        this.stepsPerBeat = 4;       // 16th-note steps
        this.lookAhead = 0.1;
        this.scheduleAhead = 0.25;
        this.timerId = null;

        // Chiptune track for Stage 1 (jungle theme, A minor)
        // Each row: [step, channel, midiNote, durationSteps]
        // Channels: 0=lead square, 1=harmony square, 2=triangle bass, 3=noise drum
        // Pattern is 32 16th-notes long (2 bars), loops indefinitely
        this.pattern = this.buildPattern();
    }

    init() {
        if (this.ctx) return;
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new Ctx();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.4;
            this.masterGain.connect(this.ctx.destination);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.35;
            this.musicGain.connect(this.masterGain);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.55;
            this.sfxGain.connect(this.masterGain);

            this.enabled = true;
        } catch (e) {
            console.warn('Audio init failed', e);
        }
    }

    // Browsers require a user gesture before audio can play.
    // Call this on any keypress.
    resume() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    toggleMute() {
        if (!this.masterGain) return;
        const isMuted = this.masterGain.gain.value < 0.001;
        this.masterGain.gain.value = isMuted ? 0.4 : 0;
    }

    // ---------- Music ----------

    buildPattern() {
        // Helper: convert a melody string like 'A4 . C5 .' into events
        // Notation: NOTE+OCTAVE or '.' for rest. Each token = one 16th-note step.
        const compile = (channel, line) => {
            const tokens = line.trim().split(/\s+/);
            const events = [];
            let lastNote = null;
            let runStart = -1;
            for (let i = 0; i <= tokens.length; i++) {
                const tok = tokens[i];
                // Close out any held note when the token changes or we reach the end
                if (lastNote && (i === tokens.length || tok !== '_')) {
                    events.push({ step: runStart, channel, midi: lastNote, dur: i - runStart });
                    lastNote = null;
                }
                if (i === tokens.length) break;
                if (tok === '.' || tok === '_') continue;
                lastNote = this.noteToMidi(tok);
                runStart = i;
            }
            return events;
        };

        const lead =     'A4 _ E5 _ A4 _ C5 _  E5 _ D5 _ B4 _ G4 _  A4 _ E5 _ A4 _ C5 _  E5 _ G5 _ A5 _ _  _ ';
        const harmony =  'E4 _ _  _ E4 _ _  _   A4 _ _  _ B4 _ _  _  E4 _ _  _ E4 _ _  _   A4 _ B4 _ C5 _ _  _ ';
        const bass =     'A2 _ _  _ A2 _ _  _   A2 _ _  _ A2 _ _  _  F2 _ _  _ F2 _ _  _   E2 _ _  _ E2 _ _  _ ';
        // Drum: K = kick, S = snare, H = hihat, . = silent
        const drum =     'K . H . S . H . K . H . S . H K K . H . S . H . K . H . S . H K';

        const events = [];
        events.push(...compile(0, lead));
        events.push(...compile(1, harmony));
        events.push(...compile(2, bass));
        // Drums use a separate compile
        const drumTokens = drum.trim().split(/\s+/);
        drumTokens.forEach((tok, i) => {
            if (tok !== '.') events.push({ step: i, channel: 3, drum: tok, dur: 1 });
        });
        return { events, length: 32 };
    }

    noteToMidi(note) {
        // e.g. 'A4' = 69, 'C5' = 72, 'F#3' = 54
        const m = note.match(/^([A-G])(#|b)?(-?\d+)$/);
        if (!m) return null;
        const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
        const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
        const oct = parseInt(m[3], 10);
        return 12 + base + acc + (oct + 1) * 12;
    }

    midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    startMusic() {
        if (!this.ctx || this.musicPlaying || !this.musicEnabled) return;
        this.musicPlaying = true;
        this.nextNoteTime = this.ctx.currentTime + 0.05;
        this.currentStep = 0;
        this.scheduler();
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }

    scheduler() {
        if (!this.musicPlaying) return;
        const stepDur = 60 / this.bpm / this.stepsPerBeat;
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
            // Look at all events at the current step
            for (const ev of this.pattern.events) {
                if (ev.step === this.currentStep) {
                    this.playMusicEvent(ev, this.nextNoteTime, stepDur);
                }
            }
            this.nextNoteTime += stepDur;
            this.currentStep = (this.currentStep + 1) % this.pattern.length;
        }
        this.timerId = setTimeout(() => this.scheduler(), this.lookAhead * 1000);
    }

    playMusicEvent(ev, time, stepDur) {
        const dur = ev.dur * stepDur;
        switch (ev.channel) {
            case 0: this.playSquareNote(this.midiToFreq(ev.midi), time, dur, 0.18, 0.5); break;
            case 1: this.playSquareNote(this.midiToFreq(ev.midi), time, dur, 0.10, 0.25); break;
            case 2: this.playTriangleNote(this.midiToFreq(ev.midi), time, dur, 0.20); break;
            case 3: this.playDrum(ev.drum, time); break;
        }
    }

    playSquareNote(freq, time, dur, vol, duty) {
        // SNES-ish pulse wave via PeriodicWave
        const osc = this.ctx.createOscillator();
        osc.type = duty > 0.4 ? 'square' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.05, dur * 0.9));
        osc.connect(gain).connect(this.musicGain);
        osc.start(time);
        osc.stop(time + dur + 0.02);
    }

    playTriangleNote(freq, time, dur, vol) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.005);
        gain.gain.linearRampToValueAtTime(vol * 0.7, time + dur * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.05, dur * 0.95));
        osc.connect(gain).connect(this.musicGain);
        osc.start(time);
        osc.stop(time + dur + 0.02);
    }

    playDrum(type, time) {
        // White-noise drums with different filters and envelopes
        const buffer = this.getNoiseBuffer();
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        src.connect(filter).connect(gain).connect(this.musicGain);
        if (type === 'K') {
            // Kick: low-pass swept noise + thump
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(180, time);
            filter.frequency.exponentialRampToValueAtTime(60, time + 0.1);
            gain.gain.setValueAtTime(0.5, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
            // Add a thump sine
            const thump = this.ctx.createOscillator();
            thump.type = 'sine';
            thump.frequency.setValueAtTime(100, time);
            thump.frequency.exponentialRampToValueAtTime(40, time + 0.1);
            const tgain = this.ctx.createGain();
            tgain.gain.setValueAtTime(0.45, time);
            tgain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
            thump.connect(tgain).connect(this.musicGain);
            thump.start(time);
            thump.stop(time + 0.13);
        } else if (type === 'S') {
            // Snare: band-pass noise burst
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1800, time);
            filter.Q.value = 1.5;
            gain.gain.setValueAtTime(0.35, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        } else if (type === 'H') {
            // Hi-hat: high-pass tick
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(6000, time);
            gain.gain.setValueAtTime(0.15, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        }
        src.start(time);
        src.stop(time + 0.2);
    }

    getNoiseBuffer() {
        if (!this._noiseBuffer) {
            const len = this.ctx.sampleRate * 0.5;
            const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            this._noiseBuffer = buf;
        }
        return this._noiseBuffer;
    }

    // ---------- SFX ----------

    sfxShoot() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain).connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.12);
    }

    sfxJump() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.linearRampToValueAtTime(640, t + 0.12);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain).connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.16);
    }

    sfxHurt() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.25);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain).connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.32);
    }

    sfxEnemyHit() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const buffer = this.getNoiseBuffer();
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2400;
        filter.Q.value = 2;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        src.connect(filter).connect(gain).connect(this.sfxGain);
        src.start(t);
        src.stop(t + 0.08);
    }

    sfxExplosion() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const buffer = this.getNoiseBuffer();
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.exponentialRampToValueAtTime(80, t + 0.4);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.55, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        src.connect(filter).connect(gain).connect(this.sfxGain);
        src.start(t);
        src.stop(t + 0.55);
        // Low rumble underneath
        const rumble = this.ctx.createOscillator();
        rumble.type = 'sine';
        rumble.frequency.setValueAtTime(80, t);
        rumble.frequency.exponentialRampToValueAtTime(35, t + 0.4);
        const rg = this.ctx.createGain();
        rg.gain.setValueAtTime(0.4, t);
        rg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        rumble.connect(rg).connect(this.sfxGain);
        rumble.start(t);
        rumble.stop(t + 0.52);
    }

    sfxPickup() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t = this.ctx.currentTime;
        const freqs = [880, 1175, 1568];
        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t + i * 0.06);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.15, t + i * 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.1);
            osc.connect(g).connect(this.sfxGain);
            osc.start(t + i * 0.06);
            osc.stop(t + i * 0.06 + 0.12);
        });
    }
}

const audio = new Audio();

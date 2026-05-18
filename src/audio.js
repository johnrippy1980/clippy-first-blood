// Dark-synth Web Audio engine. Not chiptune — actual layered subtractive synth
// with detuned saw bass, sidechained kick, noise hats, lowpass filter sweeps,
// reverb send (convolver-free schroeder fake), and a master limiter.
//
// Music is sequenced as patterns of {step, length, voice, note} events.
// Voices: BASS (detuned saws → LP filter env), LEAD (square + sub),
//         PAD (triangle + slow LP), DRUM (kick, snare, hat, clap).

const NOTE_HZ = {};
(function buildNotes() {
    const base = 'C C# D D# E F F# G G# A A# B'.split(' ');
    for (let oct = 0; oct <= 8; oct++) {
        for (let i = 0; i < 12; i++) {
            const hz = 440 * Math.pow(2, (oct - 4) + (i - 9) / 12);
            NOTE_HZ[`${base[i]}${oct}`] = hz;
        }
    }
})();
function hz(n) {
    if (!n || n === '-' || n === '.') return 0;
    return NOTE_HZ[n] || 0;
}

// dream = atmospheric (title → story → ending, audio continuity)
// revenge = driving (gameplay + boss)
const FILE_TRACKS = {
    title:      'assets/audio/dream.mp3',  // continues into story without a gap
    story:      'assets/audio/dream.mp3',
    gameComplete: 'assets/audio/dream.mp3',
    // Gameplay + boss
    jungle:     'assets/audio/revenge.mp3',
    breakroom:  'assets/audio/revenge.mp3',
    serverroom: 'assets/audio/revenge.mp3',
    boardroom:  'assets/audio/revenge.mp3',
    keynote:    'assets/audio/revenge.mp3',
    founder:    'assets/audio/revenge.mp3',
    cloud:      'assets/audio/revenge.mp3',
    bossBattle: 'assets/audio/revenge.mp3',
};

class Audio {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.musicBus = null;
        this.sfxBus = null;
        this.reverbSend = null;
        this.muted = false;
        this.currentTrack = null;
        this._timer = null;
        this.beat = 0;
        this.bpm = 128;
        // HTML5 audio elements for file-backed music
        this._fileEl = null;
        this._fileGainNode = null;
        this._fileSource = null;
    }

    init() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.65;
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0.55;
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 0.85;

        // Sidechain envelope on music bus (modulated by kick)
        this.sidechainBase = 0.55;
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);

        // Soft limiter via WaveShaper
        const lim = this.ctx.createWaveShaper();
        const curve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
            const x = (i / 512) - 1;
            curve[i] = Math.tanh(x * 1.4);
        }
        lim.curve = curve;
        this.master.disconnect();
        this.master.connect(lim);
        lim.connect(this.ctx.destination);
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.master) this.master.gain.value = this.muted ? 0 : 0.65;
    }

    // ============= SFX =============
    // No more Atari beeps. Each shot = layered: low thump (sub kick), mid
    // body (filtered noise burst), high crack (HPF noise), and a tonal
    // click. Total ~120-200ms with proper envelope, not 50ms square waves.
    sfx(name) {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;
        switch (name) {
            case 'mg':       return this._gunshot(t, { thump: 80, body: 1400, bodyDur: 0.10, crack: 5000 });
            case 'spread':   return this._gunshot(t, { thump: 70, body: 900,  bodyDur: 0.16, crack: 4200, layers: 2 });
            case 'laser':    return this._laserBeam(t);
            case 'flame':    return this._flameLick(t);
            case 'homing':   return this._homingWoosh(t);
            case 'thunder':  return this._thunderHit(t);
            case 'jump':     return this._jumpWoosh(t);
            case 'hurt':     return this._hurtGrunt(t);
            case 'die':      return this._deathStinger(t);
            case 'pickup':   return this._pickupChime(t);
            case 'powerup':  return this._powerupChime(t);
            case 'explode':  return this._explode(t);
            case 'slide':    return this._slideRush(t);
            case 'backdash': return this._backdashWhoosh(t);
            case 'bossHit':  return this._bossHit(t);
            case 'bossExplode': return this._bossExplode(t);
            case 'comboBreak': return this._comboBreakRoar(t);
            case 'combo':    return this._comboHit(t, 1);
            case 'combo2':   return this._comboHit(t, 2);
            case 'combo3':   return this._comboHit(t, 3);
            case 'combo4':   return this._comboHit(t, 4);
            case 'select':   return this._uiClick(t, 880);
            case 'menu':     return this._uiClick(t, 660);
            case 'pause':    return this._uiClick(t, 440);
            case 'step':     return this._footstep(t);
            case 'land':     return this._landThump(t);
            case 'heartbeat': return this._heartbeat(t);
            // Environmental ambience
            case 'owlHoot':  return this._owlHoot(t);
            case 'batChitter': return this._batChitter(t);
            case 'splash':   return this._waterSplash(t);
            case 'frogCroak': return this._frogCroak(t);
            case 'wade':     return this._waterWade(t);
            case 'whizz':    return this._bulletWhizz(t);
        }
    }

    // Filtered noise sweep — high-passed white noise with a brief pitch dip,
    // mimicking a bullet passing close to the ear. Quiet enough to feel
    // incidental, not alarming.
    _bulletWhizz(t) {
        const dur = 0.10;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(2400, t);
        filt.frequency.exponentialRampToValueAtTime(800, t + dur);
        filt.Q.value = 4;
        const g = this.ctx.createGain();
        this._envOn(g, 0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
    }

    // Mournful 2-note hoot. Pitch dip, soft attack, ~0.8s tail.
    _owlHoot(t) {
        const notes = [
            { f: 320, start: 0,    dur: 0.30 },
            { f: 240, start: 0.40, dur: 0.45 },
        ];
        for (const n of notes) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(n.f * 1.05, t + n.start);
            o.frequency.exponentialRampToValueAtTime(n.f * 0.85, t + n.start + n.dur);
            g.gain.setValueAtTime(0, t + n.start);
            g.gain.linearRampToValueAtTime(0.18, t + n.start + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
            o.connect(g).connect(this.sfxBus);
            o.start(t + n.start); o.stop(t + n.start + n.dur + 0.05);
            // breath component
            this._noise(t + n.start, 0.04, n.dur, n.f * 2.5, 'bp', 0.8);
        }
    }

    // Bat chitter — short HPF noise burst with rapid amplitude modulation.
    _batChitter(t) {
        const dur = 0.35;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            // Trill: AM at ~30Hz
            const am = (Math.sin(i / d.length * Math.PI * 2 * 12) + 1) * 0.5;
            d[i] = (Math.random() * 2 - 1) * am * (1 - i / d.length);
        }
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'highpass'; filt.frequency.value = 4500; filt.Q.value = 3;
        const g = this.ctx.createGain();
        this._envOn(g, 0.10, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
    }

    // Water splash — noise burst into LPF + sub thump.
    _waterSplash(t) {
        // Sub thump
        const o = this.ctx.createOscillator(); const og = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
        this._envOn(og, 0.18, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        o.connect(og).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.12);
        // Splash noise
        this._noise(t, 0.18, 0.20, 1800, 'lp', 1.0);
        // Bright droplet sparkle
        this._noise(t + 0.04, 0.06, 0.10, 5000, 'hp', 1.2);
    }

    // Frog croak — short downward sawtooth chirp.
    _frogCroak(t) {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.12);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.10, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 700;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.16);
    }

    // Wading footstep — like footstep but watery and longer.
    _waterWade(t) {
        const dur = 0.14;
        this._noise(t, 0.09, dur, 800, 'lp', 1.0);
        // Trickle sparkle on top
        this._noise(t + 0.03, 0.05, 0.10, 3500, 'bp', 2.0);
    }

    _heartbeat(t) {
        // Two thumps in quick succession — like a real heartbeat
        for (const offset of [0, 0.13]) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(72, t + offset);
            o.frequency.exponentialRampToValueAtTime(38, t + offset + 0.10);
            g.gain.setValueAtTime(0.0, t + offset);
            g.gain.linearRampToValueAtTime(0.22, t + offset + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.14);
            o.connect(g).connect(this.sfxBus);
            o.start(t + offset); o.stop(t + offset + 0.16);
        }
    }

    _footstep(t) {
        // Short low-pass noise tick. Vary cutoff + gain per step so successive
        // footsteps don't sound robotically identical — alternating timbre
        // reads as left/right foot, not a metronome.
        const dur = 0.05;
        const cutoff = 500 + Math.random() * 250;   // 500-750 Hz
        const vol = 0.06 + Math.random() * 0.04;    // 0.06-0.10
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = cutoff;
        const g = this.ctx.createGain();
        this._envOn(g, vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
    }

    _landThump(t) {
        // Solid kick + dust whoosh
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.10);
        this._envOn(g, 0.32, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.16);
        this._noise(t, 0.10, 0.16, 1200, 'bp', 1.2);
    }

    // Real-feeling gunshot. Sub kick + filtered noise body + HPF crack.
    _gunshot(t, { thump = 80, body = 1400, bodyDur = 0.12, crack = 5000, layers = 1 }) {
        for (let layer = 0; layer < layers; layer++) {
            const start = t + layer * 0.025;
            // Sub-bass thump: kick-drum-style sine pitch sweep
            const o = this.ctx.createOscillator();
            const og = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(thump * 2, start);
            o.frequency.exponentialRampToValueAtTime(thump * 0.5, start + 0.10);
            og.gain.setValueAtTime(0.0, start);
            og.gain.linearRampToValueAtTime(0.55, start + 0.005);
            og.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
            o.connect(og).connect(this.sfxBus);
            o.start(start); o.stop(start + 0.16);

            // Body: bandpass noise, longer tail than the beep version
            const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * bodyDur) | 0, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
            const src = this.ctx.createBufferSource(); src.buffer = buf;
            const filt = this.ctx.createBiquadFilter();
            filt.type = 'bandpass';
            filt.frequency.setValueAtTime(body, start);
            filt.frequency.exponentialRampToValueAtTime(body * 0.4, start + bodyDur);
            filt.Q.value = 1.2;
            const g = this.ctx.createGain();
            this._envOn(g, 0.42, start);
            g.gain.exponentialRampToValueAtTime(0.001, start + bodyDur);
            src.connect(filt).connect(g).connect(this.sfxBus);
            src.start(start); src.stop(start + bodyDur + 0.02);

            // High crack at attack
            const crackBuf = this.ctx.createBuffer(1, (this.ctx.sampleRate * 0.025) | 0, this.ctx.sampleRate);
            const cd = crackBuf.getChannelData(0);
            for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
            const csrc = this.ctx.createBufferSource(); csrc.buffer = crackBuf;
            const cfilt = this.ctx.createBiquadFilter();
            cfilt.type = 'highpass';
            cfilt.frequency.value = crack;
            const cg = this.ctx.createGain();
            this._envOn(cg, 0.32, start);
            cg.gain.exponentialRampToValueAtTime(0.001, start + 0.025);
            csrc.connect(cfilt).connect(cg).connect(this.sfxBus);
            csrc.start(start); csrc.stop(start + 0.03);
        }
    }

    _jumpWoosh(t) {
        // Air-rush sound, not a beep. Filtered noise sweep upward.
        const dur = 0.20;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(800, t);
        filt.frequency.exponentialRampToValueAtTime(3000, t + dur);
        filt.Q.value = 3.5;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
    }

    _slideRush(t) {
        // Long sustained noise rush like a body sliding on concrete
        const dur = 0.40;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(2400, t);
        filt.frequency.exponentialRampToValueAtTime(600, t + dur);
        filt.Q.value = 1.6;
        const g = this.ctx.createGain();
        this._envOn(g, 0.28, t);
        g.gain.linearRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
    }

    _backdashWhoosh(t) {
        // Short reverse-flagged woosh — pitch drops on hi end, sub thump too
        this._slideRush(t);
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
        this._envOn(g, 0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.2);
    }

    _comboHit(t, tier = 1) {
        // Tier 1 (5x): single bright note
        // Tier 2 (10x): two notes a fifth apart, chord
        // Tier 3 (20x): chord with high overtone + reverb-y tail
        // Tier 4 (30x): sustained pad, three voices, slower release
        const baseFreqs = [
            [1100],                          // tier 1
            [880, 1320],                     // tier 2 — root + fifth
            [660, 990, 1320],                // tier 3 — major chord, higher voicing
            [440, 660, 880, 1320],           // tier 4 — full pad
        ];
        const freqs = baseFreqs[Math.max(0, Math.min(3, tier - 1))];
        const releaseDur = 0.10 + tier * 0.08; // longer tail for higher tiers
        for (const f of freqs) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = tier >= 3 ? 'sawtooth' : 'triangle';
            o.frequency.setValueAtTime(f, t);
            o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.08);
            const peak = 0.16 / freqs.length;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(peak, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, t + releaseDur);
            o.connect(g).connect(this.sfxBus);
            o.start(t); o.stop(t + releaseDur + 0.02);
        }
        // Tier 3+: add a HPF noise shimmer on top — bright/sparkly
        if (tier >= 3) this._noise(t + 0.02, 0.04, 0.15, 7000, 'hp', 1.4);
    }

    _comboBreakRoar(t) {
        // Sub pitch drop + filtered noise — sounds disappointing
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(280, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.28);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1200, t);
        filt.frequency.exponentialRampToValueAtTime(300, t + 0.28);
        this._envOn(g, 0.30, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.32);
    }

    _uiClick(t, pitch) {
        // Click + tail, not a square beep. Start gain at 0 then ramp UP fast
        // — a setValueAtTime jump from 0 → 0.16 creates an audible click at
        // the speaker that's unrelated to the intended click character.
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(pitch * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(pitch, t + 0.04);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.08);
        this._noise(t, 0.015, 0.10, 5000, 'hp', 1);
    }

    _tonal(t, type, f1, f2, dur, vol) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f1, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + dur);
        // Short attack ramp prevents the speaker-pop on hard onset.
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + dur + 0.02);
    }

    // Envelope helper: ramp from silence to `vol` over a 3ms attack so the
    // gain doesn't jump from 0 → vol on hard onset (audible click on speakers).
    // All SFX should call this instead of `g.gain.setValueAtTime(vol, t)`.
    _envOn(g, vol, t) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.003);
    }

    _noise(t, dur, vol, filterFreq, type = 'bp', q = 1.4) {
        const buf = this.ctx.createBuffer(1, Math.max(1, (this.ctx.sampleRate * dur) | 0), this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = type === 'bp' ? 'bandpass' : (type === 'lp' ? 'lowpass' : 'highpass');
        filt.frequency.value = filterFreq; filt.Q.value = q;
        const g = this.ctx.createGain();
        // Ramp UP from 0 over the first few ms — a jump from 0 to vol at t
        // produces an audible click at the speaker that's independent of the
        // intended noise character. ~2ms attack kills the click without
        // smearing the shape of the noise burst itself.
        const attack = Math.min(0.003, dur * 0.2);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + attack);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.05);
        return g;
    }

    _gunShot(t, dur, vol, type, fStart, fEnd) {
        // Layered: noise burst + thump + tonal click
        this._noise(t, dur, vol * 0.7, fStart, 'bp', 0.6);
        // Thump (sub kick) — short attack ramp to avoid click on hard onset
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.55, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
        // Click
        this._tonal(t, type, fStart * 1.2, fEnd * 0.5, dur * 0.4, vol * 0.5);
    }

    _laserBeam(t) {
        // Detuned square pair sweeping down — sci-fi pew
        for (let i = 0; i < 2; i++) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'sawtooth';
            o.detune.value = i === 0 ? -7 : 7;
            o.frequency.setValueAtTime(1800, t);
            o.frequency.exponentialRampToValueAtTime(320, t + 0.18);
            this._envOn(g, 0.18, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            o.connect(g).connect(this.sfxBus);
            o.start(t); o.stop(t + 0.2);
        }
        // High noise sizzle
        this._noise(t, 0.18, 0.10, 4000, 'hp', 1);
    }

    _flameLick(t) {
        this._noise(t, 0.10, 0.28, 600, 'lp', 1);
    }

    _homingWoosh(t) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(440, t);
        o.frequency.exponentialRampToValueAtTime(1320, t + 0.18);
        this._envOn(g, 0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.2);
        this._noise(t, 0.16, 0.10, 2200, 'bp', 4);
    }

    _thunderHit(t) {
        this._noise(t, 0.45, 0.5, 220, 'lp', 1.6);
        // Bright crack on top
        for (let i = 0; i < 3; i++) {
            this._noise(t + i * 0.04, 0.08, 0.18, 3600 + i * 800, 'bp', 4);
        }
        // Sub thump
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.4);
        this._envOn(g, 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.45);
    }

    _hurtGrunt(t) {
        // Pitched-down growl noise + tonal whimper
        this._noise(t, 0.18, 0.32, 800, 'bp', 1.8);
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(110, t + 0.25);
        this._envOn(g, 0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 900;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.3);
    }

    _deathStinger(t) {
        // Long descending sub-saw with noise tail
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(280, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.8);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1200, t);
        filt.frequency.exponentialRampToValueAtTime(220, t + 0.8);
        this._envOn(g, 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.9);
        this._noise(t + 0.1, 0.4, 0.18, 400, 'lp', 1.2);
    }

    _explode(t) {
        // Multi-layered: low rumble, mid noise burst, high crack
        this._noise(t, 0.5, 0.55, 200, 'lp', 1);
        this._noise(t, 0.25, 0.35, 900, 'bp', 1.2);
        this._noise(t + 0.02, 0.08, 0.18, 4000, 'hp', 1);
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
        this._envOn(g, 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.55);
    }

    _bossHit(t) {
        // Hi metallic clang + noise crunch
        this._tonal(t, 'square', 880, 480, 0.10, 0.26);
        this._noise(t, 0.10, 0.20, 1800, 'bp', 4);
    }

    _bossExplode(t) {
        for (let i = 0; i < 6; i++) {
            this._noise(t + i * 0.08, 0.25, 0.40, 200 + i * 200, 'bp', 1.4);
        }
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.8);
        this._envOn(g, 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.95);
    }

    _pickupChime(t) {
        this._tonal(t,        'square', 880, 1320, 0.06, 0.22);
        this._tonal(t + 0.06, 'square', 1320, 1760, 0.06, 0.20);
    }
    _powerupChime(t) {
        this._tonal(t,        'square',  660,  990, 0.07, 0.20);
        this._tonal(t + 0.07, 'square',  880, 1320, 0.07, 0.22);
        this._tonal(t + 0.14, 'square', 1320, 1760, 0.10, 0.26);
        this._tonal(t + 0.24, 'triangle', 1760, 2640, 0.10, 0.18);
    }
    _comboTick(t) {
        this._tonal(t, 'square', 1320, 1760, 0.05, 0.20);
    }

    // ============= MUSIC =============
    // Pattern format: rows of [kick, snare, hat, bassNote, padNote, leadNote].
    // 1/16 step grid. Patterns repeat seamlessly.
    playTrack(name) {
        // Same name — if the file element exists but is paused (autoplay blocked
        // on first attempt, then user gesture arrived), try to resume now.
        if (this.currentTrack === name) {
            if (this._fileEl && this._fileEl.paused && this.ctx?.state !== 'suspended') {
                this._fileEl.play().catch(() => {});
            }
            return;
        }
        // Continuity: if both old and new tracks resolve to the same file AND
        // we still hold the element, keep it. If it's paused (autoplay was
        // blocked or stopTrack paused it), try to resume in-place instead of
        // recreating — that preserves currentTime so no audible restart.
        const newFile = FILE_TRACKS[name];
        const curFile = FILE_TRACKS[this.currentTrack];
        if (newFile && curFile && newFile === curFile && this._fileEl) {
            this.currentTrack = name;
            if (this._fileEl.paused) {
                this._fileEl.play().catch(() => {});
            }
            return;
        }
        // Cross-fade: ramp outgoing track down while new one ramps up.
        // Falls back to instant cut if Web Audio is unavailable.
        const FADE_S = 0.35;
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        if (this.ctx && this._fileEl && this._fileGainNode) {
            const now = this.ctx.currentTime;
            const node = this._fileGainNode;
            const el = this._fileEl;
            try {
                node.gain.cancelScheduledValues(now);
                node.gain.setValueAtTime(node.gain.value, now);
                node.gain.linearRampToValueAtTime(0.0001, now + FADE_S);
            } catch (e) {}
            setTimeout(() => {
                try { el.pause(); } catch (e) {}
                try { node.disconnect(); } catch (e) {}
            }, FADE_S * 1000 + 30);
            // Drop refs so the next _playFile creates a fresh chain
            this._fileEl = null;
            this._fileGainNode = null;
            this._fileSource = null;
        } else if (this._fileEl) {
            try { this._fileEl.pause(); } catch (e) {}
            this._fileEl = null;
        }
        this.currentTrack = name;
        // Prefer real file if mapped
        if (newFile && this.ctx) {
            this._playFile(newFile, FADE_S);
            return;
        }
        const t = TRACKS[name];
        if (!t) return;
        this.bpm = t.bpm;
        this.beat = 0;
        this._scheduleBeat(t);
    }
    stopTrack() {
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        this.currentTrack = null;
        if (this._fileEl) {
            try { this._fileEl.pause(); } catch (e) {}
            this._fileEl = null;
        }
        if (this._fileGainNode) {
            try { this._fileGainNode.disconnect(); } catch (e) {}
            this._fileGainNode = null;
        }
        this._fileSource = null;
    }

    _playFile(path, fadeIn = 0) {
        const el = new window.Audio(path);
        el.loop = true;
        el.volume = 0.7;
        el.preload = 'auto';
        // Per-track gain so we can cross-fade independently.
        const targetGain = 0.85;
        try {
            const node = this.ctx.createGain();
            // Start silent if we're fading in, else jump straight to target.
            const startVal = fadeIn > 0 ? 0.0001 : targetGain;
            node.gain.setValueAtTime(startVal, this.ctx.currentTime);
            node.connect(this.musicBus);
            const src = this.ctx.createMediaElementSource(el);
            src.connect(node);
            if (fadeIn > 0) {
                node.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + fadeIn);
            }
            this._fileGainNode = node;
            this._fileSource = src;
        } catch (e) {
            // Browsers throw if the element is reused; fall back to direct play
        }
        el.play().catch(err => {
            console.warn('Music file blocked by autoplay policy:', err);
        });
        this._fileEl = el;
    }
    _scheduleBeat(track) {
        const stepMs = 60000 / this.bpm / 4;
        if (!this.ctx || this.muted) {
            this.beat = (this.beat + 1) % track.pattern.length;
            this._timer = setTimeout(() => this._scheduleBeat(track), stepMs);
            return;
        }
        const i = this.beat % track.pattern.length;
        const row = track.pattern[i];
        const now = this.ctx.currentTime;
        const stepSec = stepMs / 1000;
        const [kick, snare, hat, bassNote, padNote, leadNote] = row;

        // Sidechain pump if kick present
        if (kick) this._pumpMusic(now, stepSec * 1.2);

        if (kick) this._kick(now);
        if (snare) this._snare(now);
        if (hat) this._hat(now, hat === 'O' ? 1.3 : 1);
        if (bassNote && bassNote !== '-') this._bassNote(now, hz(bassNote), stepSec * (track.bassLen || 0.7));
        if (padNote && padNote !== '-') this._padNote(now, hz(padNote), stepSec * (track.padLen || 4));
        if (leadNote && leadNote !== '-') this._leadNote(now, hz(leadNote), stepSec * (track.leadLen || 0.9));

        this.beat++;
        this._timer = setTimeout(() => this._scheduleBeat(track), stepMs);
    }

    _pumpMusic(t, dur) {
        const base = this.sidechainBase;
        const g = this.musicBus.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(base * 0.35, t);
        g.linearRampToValueAtTime(base, t + dur);
    }

    _kick(t) {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(36, t + 0.12);
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.6, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(this.musicBus);
        o.start(t); o.stop(t + 0.22);
        // Click layer
        this._noise(t, 0.02, 0.22, 4000, 'hp', 1);
    }

    _snare(t) {
        // Noise body + tonal layer
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * 0.18) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 1.2;
        const g = this.ctx.createGain();
        this._envOn(g, 0.42, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        src.connect(filt).connect(g).connect(this.musicBus);
        src.start(t); src.stop(t + 0.2);
        // Tonal
        const o = this.ctx.createOscillator(); const og = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
        this._envOn(og, 0.18, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(og).connect(this.musicBus);
        o.start(t); o.stop(t + 0.12);
    }

    _hat(t, vel = 1) {
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * 0.04) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'highpass'; filt.frequency.value = 7000;
        const g = this.ctx.createGain();
        g.gain.value = 0.10 * vel;
        src.connect(filt).connect(g).connect(this.musicBus);
        src.start(t); src.stop(t + 0.05);
    }

    _bassNote(t, hz, dur) {
        if (!hz) return;
        // Detuned saw pair → lowpass envelope
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(900, t);
        filt.frequency.exponentialRampToValueAtTime(220, t + dur);
        filt.Q.value = 4;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.32, t + 0.01);
        g.gain.setValueAtTime(0.32, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        for (let i = -1; i <= 1; i += 2) {
            const o = this.ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = hz / 2; // octave down
            o.detune.value = i * 9;
            o.connect(filt);
            o.start(t); o.stop(t + dur + 0.05);
        }
        filt.connect(g).connect(this.musicBus);
    }

    _padNote(t, hz, dur) {
        if (!hz) return;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1400; filt.Q.value = 1;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.10, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0, t + dur);
        for (let i = 0; i < 2; i++) {
            const o = this.ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = hz * (i === 0 ? 1 : 1.5);
            o.detune.value = i === 0 ? -3 : 3;
            o.connect(filt);
            o.start(t); o.stop(t + dur + 0.05);
        }
        filt.connect(g).connect(this.musicBus);
    }

    _leadNote(t, hz, dur) {
        if (!hz) return;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(2400, t);
        filt.frequency.exponentialRampToValueAtTime(800, t + dur);
        filt.Q.value = 6;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        for (let i = -1; i <= 1; i += 2) {
            const o = this.ctx.createOscillator();
            o.type = 'square';
            o.frequency.value = hz;
            o.detune.value = i * 5;
            o.connect(filt);
            o.start(t); o.stop(t + dur + 0.05);
        }
        filt.connect(g).connect(this.musicBus);
    }
}

// ============= TRACKS =============
// Each row = [kick, snare, hat('o'|'O'|0), bass, pad, lead] at 1/16 steps.
// 16 steps = 1 bar. 4 bars per pattern is plenty.

const _ = 0;   // empty
const k = 1; const s = 1; const h = 'o'; const H = 'O';

function pat(rows) { return rows; }

const TRACKS = {
    title: {
        bpm: 92, bassLen: 1.6, padLen: 8, leadLen: 1.2,
        pattern: pat([
            // 16 steps, ambient slow track
            [k,_,_,_, _,_,_,_, _,_,_,_, _,_,_,_].slice(0,4).concat([k,_,_,_]),
        ]).flat ? [] :
        [
            [k,_,_,_,'A1','A3',_],
            [_,_,h,_,'-','-',_],
            [_,_,_,_,'-','-','E5'],
            [_,_,h,_,'-','-',_],
            [_,s,_,_,'-','-','D5'],
            [_,_,h,_,'-','-',_],
            [_,_,_,_,'-','-','C5'],
            [_,_,h,_,'-','-',_],
            [k,_,_,_,'F1','F3',_],
            [_,_,h,_,'-','-',_],
            [_,_,_,_,'-','-','C5'],
            [_,_,h,_,'-','-',_],
            [_,s,_,_,'-','-','A4'],
            [_,_,h,_,'-','-',_],
            [_,_,_,_,'-','-','G4'],
            [_,_,h,_,'-','-',_],
        ]
    },
    jungle: {
        bpm: 138, bassLen: 0.5, padLen: 4, leadLen: 0.7,
        pattern: [
            [k,_,_,_,'A1','A3','A4'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'A1','-','C5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'A1','-','E5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'A1','-','D5'],
            [_,_,H,_,'-','-','-'],
            [k,_,_,_,'F1','F3','C5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'F1','-','A4'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'F1','-','C5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'F1','-','E5'],
            [_,_,H,_,'-','-','-'],
        ]
    },
    breakroom: {
        bpm: 124, bassLen: 0.6, padLen: 4, leadLen: 0.9,
        pattern: [
            [k,_,_,_,'D1','D3','D5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'D1','-','F5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'D1','-','A5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'D1','-','F5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'A1','A3','C5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'A1','-','E5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'A1','-','D5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'A1','-','C5'],
            [_,_,H,_,'-','-','-'],
        ]
    },
    serverroom: {
        bpm: 152, bassLen: 0.5, padLen: 4, leadLen: 0.6,
        pattern: [
            [k,_,_,_,'E1','E3','E5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'E1','-','B5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'E1','-','G5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'E1','-','D5'],
            [_,_,H,_,'-','-','-'],
            [k,_,_,_,'A1','A3','E5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'A1','-','B5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'A1','-','C5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'A1','-','D5'],
            [_,_,H,_,'-','-','-'],
        ]
    },
    boardroom: {
        bpm: 116, bassLen: 0.6, padLen: 4, leadLen: 0.8,
        pattern: [
            [k,_,_,_,'F1','F3','C5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'-','-','F5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'-','-','C5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'-','-','F5'],
            [_,_,H,_,'-','-','-'],
            [k,_,_,_,'D1','D3','A4'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'-','-','D5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'-','-','A4'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'-','-','F5'],
            [_,_,H,_,'-','-','-'],
        ]
    },
    keynote: {
        bpm: 108, bassLen: 0.7, padLen: 4, leadLen: 1.0,
        pattern: [
            [k,_,_,_,'G1','G3','D5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'-','-','G5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'-','-','B5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'-','-','G5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'E1','E3','B4'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'-','-','E5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'-','-','G5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'-','-','B5'],
            [_,_,H,_,'-','-','-'],
        ]
    },
    founder: {
        bpm: 168, bassLen: 0.4, padLen: 4, leadLen: 0.6,
        pattern: [
            [k,_,_,_,'F#1','F#3','F#5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'F#1','-','C#5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'F#1','-','A5'],
            [_,_,H,_,'-','-','-'],
            [k,_,_,_,'F#1','-','C#6'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'D1','D3','D5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'D1','-','A5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'D1','-','F5'],
            [_,_,H,_,'-','-','-'],
            [k,_,_,_,'D1','-','A5'],
            [_,_,h,_,'-','-','-'],
        ]
    },
    cloud: {
        bpm: 176, bassLen: 0.4, padLen: 4, leadLen: 0.5,
        pattern: [
            [k,_,_,_,'C1','C3','C5'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'C1','-','G5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'C1','-','E5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'C1','-','G5'],
            [_,_,H,_,'-','-','-'],
            [k,_,_,_,'A#0','A#2','A#4'],
            [_,_,h,_,'-','-','-'],
            [_,_,_,_,'A#0','-','F5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'A#0','-','D5'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'A#0','-','F5'],
            [_,_,H,_,'-','-','-'],
        ]
    },
    bossBattle: {
        bpm: 160, bassLen: 0.4, padLen: 4, leadLen: 0.5,
        pattern: [
            [k,_,_,_,'E1','E3','E5'],
            [k,_,h,_,'-','-','-'],
            [_,_,_,_,'E1','-','G5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'E1','-','B5'],
            [_,_,H,_,'-','-','-'],
            [k,_,_,_,'E1','-','C6'],
            [_,_,h,_,'-','-','-'],
            [k,_,_,_,'D1','D3','D5'],
            [k,_,h,_,'-','-','-'],
            [_,_,_,_,'D1','-','F5'],
            [_,_,h,_,'-','-','-'],
            [_,s,_,_,'D1','-','A5'],
            [_,_,H,_,'-','-','-'],
            [k,_,_,_,'D1','-','C6'],
            [k,_,h,_,'-','-','-'],
        ]
    },
};

export const audio = new Audio();

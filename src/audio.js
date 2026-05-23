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
    // R302: dedicated credits-roll track. Was reusing 'dream.mp3' which
    // looped the title-screen vibe across the ending; 'hope.mp3' lands
    // the post-game emotional resolution.
    gameComplete: 'assets/audio/hope.mp3',
    // Gameplay + boss
    jungle:     'assets/audio/revenge.mp3',
    // R218 / R221: per-stage tracks. All Owl Hall masters, trimmed to
    // ~85s with a 6s tail fade so a stage that finishes near the
    // timer end doesn't cut abruptly. Stage-3..7 picked thematically
    // (server room → "No Remorse", boss rush → "Night Drive", etc.).
    breakroom:  'assets/audio/what-was-it-for.mp3',  // stage 2
    serverroom: 'assets/audio/no-remorse.mp3',       // stage 3
    // R226: pipeline = stage 4 (THE PIPELINE / Dr. Spindler's lab). Re-use
    // the bonus track ("You've Been Loving Me") — its melancholy, almost
    // hymn-like quality fits the body-horror lab discovery. Also frees the
    // bonus slot from menu-only purgatory.
    pipeline:   'assets/audio/youve-been-loving.mp3', // stage 4
    boardroom:  'assets/audio/no-pity.mp3',          // stage 5
    keynote:    'assets/audio/dont-go.mp3',          // stage 6
    founder:    'assets/audio/disbelief.mp3',        // stage 7
    cloud:      'assets/audio/the-path.mp3',         // stage 13 (final)
    bossBattle: 'assets/audio/night-drive.mp3',      // stage 12 boss rush
    // R302: 6 new tracks per stage/theme assignments.
    arenaBoss:    'assets/audio/arena.mp3',                    // stages 7 + 10 (Ballmer + Gates arenas)
    backstage:    'assets/audio/backstage.mp3',                // stages 6 + 9 (FPS chase corridors)
    apocalypse:   'assets/audio/the-light-bleeds-through.mp3', // stage 20 (Mecha-Gates super-secret)
    hope:         'assets/audio/hope.mp3',                     // game-complete credits roll
    realityField: 'assets/audio/time-is-a-flat-circle.mp3',    // stage 18 (Reality Distortion / Jobs)
    recycleBin:   'assets/audio/1.26x.mp3',                    // stage 14 (Recycle Bin secret)
    // R303: dedicated FPS Spindler / Core Breach track. "DREAMS FADE"
    // lands the deep-lab confrontation about Clippy's lost family.
    dreamsFade:   'assets/audio/dreams-fade.mp3',              // stage 19 (Core Breach)
    // R304: final 4 tracks — Training/BossRush Mode/Time Trial + a pure
    // bonus track for the soundtrack-screen gallery (no stage routing).
    training:    'assets/audio/resolution.mp3',                // stage 15 (Training Ground)
    bossRushMode:'assets/audio/evolution.mp3',                 // stage 16 (Boss Rush Mode post-game)
    timeTrial:   'assets/audio/never-the-same.mp3',            // stage 17 (Time Trial)
    // R305: pure bonus slot for the soundtrack gallery (no stage routing).
    // Was 'bonus' → youve-been-loving.mp3, but R226 wired that file as the
    // Stage 4 PIPELINE track. Having it listed as BOTH made the soundtrack
    // gallery misleading. Now bonus2 (different file) is the only bonus.
    bonus2:      'assets/audio/bonus-2.mp3',                   // soundtrack-only bonus
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
        if (this.ctx) {
            // R274: even if already initialized, retry resume() — chromium
            // can suspend the context if the tab lost focus between init
            // and the next user gesture.
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        // R284: 'interactive' hint forces chromium to pick the lowest-latency
        // buffer size (typically 256 samples ≈ 5.3ms @ 48kHz) instead of the
        // default 'playback' which uses ~25ms buffers. Drops perceived
        // shoot-to-sound lag by 15-20ms.
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.gain.value = 1.0;            // R288: default master 100%
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 1.0;          // R288: default music 100%
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 1.0;            // R288: default SFX 100%

        // Sidechain envelope on music bus (modulated by kick)
        this.sidechainBase = 1.0;                // R288: matches default 100%
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

        // R288: pull persisted volumes from options module if available.
        try {
            import('./options.js').then(mod => {
                const opt = mod.options;
                if (opt) {
                    this.setMusicVolume(opt.get('musicVol') ?? 1.0);
                    this.setSfxVolume(opt.get('sfxVol') ?? 1.0);
                    this.setMasterVolume(opt.get('masterVol') ?? 1.0);
                }
            }).catch(() => {});
        } catch (e) {}

        // R274: explicitly resume the context. Chromium starts AudioContext
        // suspended until a user gesture; without this the first sfx() call
        // can be silently swallowed or land 30-100ms late as the context
        // unsuspends mid-trigger.
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        // Pre-warm: play a silent 1-sample buffer so the audio pipeline
        // is "primed" before the player's first real shot. Without this
        // the very first SFX trigger can have audible attack latency
        // (the user reports "delay in weapon effects" — usually the
        // first shot after a long pause, when scheduler has to spool up).
        try {
            const warmBuf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
            const warmSrc = this.ctx.createBufferSource();
            warmSrc.buffer = warmBuf;
            warmSrc.connect(this.sfxBus);
            warmSrc.start();
        } catch (e) {}
    }

    toggleMute() {
        this.muted = !this.muted;
        // R288: respect persisted master volume (default 1.0) instead of
        // hardcoded 0.65 — pre-fix, toggleMute always slammed master back
        // to 0.65 regardless of user's slider position.
        if (this.master) this.master.gain.value = this.muted ? 0 : (this._masterVol ?? 1.0);
    }

    // R288: volume API — values are 0..1. Persisted via options.set.
    setMusicVolume(v) {
        this._musicVol = Math.max(0, Math.min(1, v));
        if (this.musicBus) this.musicBus.gain.value = this._musicVol;
        this.sidechainBase = this._musicVol;
    }
    setSfxVolume(v) {
        this._sfxVol = Math.max(0, Math.min(1, v));
        if (this.sfxBus) this.sfxBus.gain.value = this._sfxVol;
    }
    setMasterVolume(v) {
        this._masterVol = Math.max(0, Math.min(1, v));
        if (this.master && !this.muted) this.master.gain.value = this._masterVol;
    }
    getMusicVolume() { return this._musicVol ?? 1.0; }
    getSfxVolume()   { return this._sfxVol ?? 1.0; }
    getMasterVolume(){ return this._masterVol ?? 1.0; }

    // ============= SFX =============
    // No more Atari beeps. Each shot = layered: low thump (sub kick), mid
    // body (filtered noise burst), high crack (HPF noise), and a tonal
    // click. Total ~120-200ms with proper envelope, not 50ms square waves.
    sfx(name) {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;
        switch (name) {
            // R251: MG — sharper rifle bark. Higher crack (5000 -> 6200) for
            // the snap, beefier sub thump (80 -> 95) for chest punch, slightly
            // tighter body decay (0.10 -> 0.09) so consecutive shots stay
            // distinct at MG's fast fire rate.
            case 'mg':       return this._gunshot(t, { thump: 95, body: 1500, bodyDur: 0.09, crack: 6200, layers: 1 });
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
            case 'pounceStab': return this._pounceStab(t);
            case 'bossChargeTell': return this._bossChargeTell(t);
            case 'secretFound':   return this._secretFound(t);
            case 'bossEntrance':  return this._bossEntrance(t);
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
            case 'attract':  return this._attractChime(t);
            case 'respawn':  return this._respawnReady(t);
            case 'unlock':   return this._unlockDing(t);
            case 'crateHit': return this._crateHit(t);
            case 'climbRung': return this._climbRung(t);
            case 'grenadeThrow': return this._grenadeThrow(t);
            case 'shotgun':  return this._shotgunBlast(t);
            case 'chainsaw': return this._chainsawRev(t);
            // R248: RPG-style sound split for HOMING — launch on fire,
            // explosion on impact. Old 'homing' was a single woosh.
            case 'rpgLaunch': return this._rpgLaunch(t);
            case 'rpgImpact': return this._rpgImpact(t);
            // R257: dedicated charged-MG release. Was reusing 'thunder' but
            // after R251 made thunder a real thunderclap, the MG charge shot
            // sounded like the THUNDER weapon. Now: heavier MG bark + a
            // capacitor-whine pre-roll so the release reads as "stored
            // energy unleashed" rather than a lightning strike.
            case 'mgCharged': return this._mgChargedShot(t);
            // R258: dedicated MG overheat-vent. Was reusing 'comboBreak'
            // which is for combo-streak loss — different event, deserves
            // a different sound. Now: steam hiss + mechanical clunk.
            case 'mgOverheat': return this._mgOverheat(t);
            // R259: empty-grenade-belt click. Was reusing 'comboBreak'.
            // Now: soft mechanical empty-click.
            case 'grenadeFail': return this._grenadeFail(t);
            // R273: office FPS stage SFX.
            case 'typewriter':  return this._typewriterChatter(t);
            case 'fluorescent': return this._fluorescentBuzz(t);
            case 'faxRing':     return this._faxRing(t);
            case 'chairWhoosh': return this._chairWhoosh(t);
        }
    }

    // R249: DOOM-style shotgun — three-stage blast.
    //   1) sub kick (sub-30Hz body thump for chest punch)
    //   2) long mid-band noise body (~280ms) with low-pass roll-off for the
    //      "BOOM-RRRR" tail that defines DOOM's super-shotty
    //   3) bright high-pass crack at the head for the percussive snap
    // Heavier and longer than MG/SPREAD so the player FEELS each blast.
    _shotgunBlast(t) {
        // Sub thump — sine sweep 80Hz → 28Hz
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(80, t);
        o.frequency.exponentialRampToValueAtTime(28, t + 0.15);
        this._envOn(g, 0.65, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.2);
        // Mid body — long noise tail that rolls off lowpass for the BOOM
        this._noise(t,         0.45, 0.30, 700,  'lp', 1.2);
        this._noise(t + 0.005, 0.30, 0.28, 1200, 'bp', 1.6);
        // Bright crack — sharp head transient
        this._noise(t,         0.10, 0.18, 4200, 'hp', 1);
        // Mechanical "kachunk" tail — quick square click at 220Hz for the
        // pump-action read.
        this._tonal(t + 0.18, 'square', 220, 110, 0.06, 0.12);
    }

    // R259: empty grenade-belt click. Quick dull mechanical click — short
    // square click + a tiny lowpass-noise pop. Reads as "trigger pulled,
    // nothing happened" rather than the heavier comboBreak roar.
    _grenadeFail(t) {
        // Square click — 380Hz, quick decay
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(380, t);
        o.frequency.exponentialRampToValueAtTime(220, t + 0.04);
        this._envOn(g, 0.10, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1200;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.08);
        // Small noise tick — the metal-on-metal contact
        this._noise(t, 0.04, 0.04, 1800, 'bp', 2);
    }

    // R273: typewriter chatter — rapid 3-4 mechanical key strikes, used
    // when an office grunt fires a floppy-disk projectile. Each strike is
    // a square click + bp noise tick layered together.
    _typewriterChatter(t) {
        const strikes = [0, 0.05, 0.11, 0.16];   // staggered for ratchet feel
        for (const offset of strikes) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'square';
            // Slight pitch variation per strike sells mechanical irregularity
            const f = 520 + Math.random() * 80;
            o.frequency.setValueAtTime(f, t + offset);
            o.frequency.exponentialRampToValueAtTime(f * 0.55, t + offset + 0.03);
            this._envOn(g, 0.16, t + offset);
            g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.04);
            const filt = this.ctx.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.value = 2400;
            o.connect(filt).connect(g).connect(this.sfxBus);
            o.start(t + offset);
            o.stop(t + offset + 0.06);
            // High-frequency contact tick — the platen impact
            this._noise(t + offset, 0.08, 0.03, 5400, 'hp', 1);
        }
    }

    // R273: fluorescent buzz — long 60Hz hum with subtle warble, used as
    // ambient bed during the office stage. Single-shot ~1.2s; the caller
    // can loop by re-triggering.
    _fluorescentBuzz(t) {
        // 60Hz fundamental + 120Hz harmonic, slow random tremolo
        const o = this.ctx.createOscillator();
        const o2 = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = 60;
        o2.type = 'triangle';
        o2.frequency.value = 120;
        const o2g = this.ctx.createGain();
        o2g.gain.value = 0.5;
        this._envOn(g, 0.08, t);
        // Slight on/off flicker — fluorescents aren't steady
        g.gain.linearRampToValueAtTime(0.08, t + 0.4);
        g.gain.linearRampToValueAtTime(0.04, t + 0.55);
        g.gain.linearRampToValueAtTime(0.08, t + 0.7);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        o.connect(g).connect(this.sfxBus);
        o2.connect(o2g).connect(g);
        o.start(t); o2.start(t);
        o.stop(t + 1.25); o2.stop(t + 1.25);
    }

    // R273: fax ring — short two-tone telephone bell, used when a fax-machine
    // turret fires. ~280ms total, layered with a metallic clack on attack.
    _faxRing(t) {
        // Square wave bell, alternating high/low pitch
        const tones = [
            { f: 880, off: 0,    dur: 0.08 },
            { f: 660, off: 0.10, dur: 0.08 },
            { f: 880, off: 0.20, dur: 0.06 },
        ];
        for (const tone of tones) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.value = tone.f;
            this._envOn(g, 0.10, t + tone.off);
            g.gain.exponentialRampToValueAtTime(0.001, t + tone.off + tone.dur);
            const filt = this.ctx.createBiquadFilter();
            filt.type = 'bandpass';
            filt.frequency.value = tone.f;
            filt.Q.value = 2;
            o.connect(filt).connect(g).connect(this.sfxBus);
            o.start(t + tone.off);
            o.stop(t + tone.off + tone.dur + 0.02);
        }
        // Mechanical clack on attack — paper-feed solenoid
        this._noise(t, 0.06, 0.04, 1800, 'bp', 2);
    }

    // R273: chair whoosh — Ballmer hurling an office chair. Heavy low woosh
    // with rotational gyrations + a tail clang as it lands.
    _chairWhoosh(t) {
        // Low rumbling whoosh — bp noise sweeping low→mid as it sails
        this._noise(t,        0.32, 0.30, 220, 'bp', 1.5);
        this._noise(t + 0.05, 0.22, 0.25, 480, 'bp', 1.8);
        // Spinning rotational tone — sawtooth wobble suggesting end-over-end
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(80, t);
        o.frequency.linearRampToValueAtTime(160, t + 0.15);
        o.frequency.linearRampToValueAtTime(60, t + 0.30);
        this._envOn(g, 0.10, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 600;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.4);
        // Optional clatter at the tail — only if it landed
        // (caller can layer the impact separately when the chair hits something)
    }

    // R258: MG overheat vent. Two-stage:
    //   1) mechanical "clunk" — square thud at 180Hz dropping to 90Hz,
    //      the bolt slamming open as the gun locks itself
    //   2) long steam hiss — bp noise centered at 3.5kHz with slow decay,
    //      reads as pressurized vapor escaping the barrel
    _mgOverheat(t) {
        // Bolt clunk
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.05);
        this._envOn(g, 0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1200;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.10);
        // Steam hiss — long bp noise, slow attack so it ramps in behind
        // the clunk for a "OH the gun broke" 1-2 read.
        this._noise(t + 0.02, 0.18, 0.40, 3500, 'bp', 1.4);
        // Lower-frequency rumble underneath — the pressure building
        this._noise(t + 0.02, 0.10, 0.30, 600,  'bp', 1.2);
    }

    // R257: charged-MG release. Three-stage:
    //   1) brief capacitor whine pre-roll (4ms) — high-freq sine that sweeps
    //      DOWN, suggesting energy collapsing into the barrel
    //   2) heavy MG-style bark (deeper than regular MG — thump 105 vs 95)
    //   3) sustain tail — short hp noise crackle for the residual zap
    _mgChargedShot(t) {
        // Capacitor whine — quick 3.2kHz -> 1.4kHz dive, 50ms total
        const w = this.ctx.createOscillator(); const wg = this.ctx.createGain();
        w.type = 'sine';
        w.frequency.setValueAtTime(3200, t);
        w.frequency.exponentialRampToValueAtTime(1400, t + 0.04);
        this._envOn(wg, 0.10, t);
        wg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        w.connect(wg).connect(this.sfxBus);
        w.start(t); w.stop(t + 0.06);
        // Heavy bark — deeper sub thump + extended body
        this._gunshot(t + 0.03, { thump: 105, body: 1100, bodyDur: 0.14, crack: 5800, layers: 1 });
        // Residual electrical sustain — short HP noise crackle
        this._noise(t + 0.08, 0.08, 0.08, 4800, 'hp', 1);
    }

    // R248: RPG launch — whoosh ignition. Layered:
    //   - sub-frequency ignition thump (~60Hz)
    //   - rising noise sweep (the rocket motor spinning up)
    //   - high crackle (propellant)
    _rpgLaunch(t) {
        // Sub ignition
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(60, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        this._envOn(g, 0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.2);
        // Rising motor noise — bp sweep upward to suggest acceleration
        this._noise(t,        0.25, 0.30, 1400, 'bp', 1.8);
        this._noise(t + 0.04, 0.20, 0.25, 2200, 'bp', 2.2);
        // Propellant crackle on top
        this._noise(t, 0.10, 0.18, 4800, 'hp', 1);
    }

    // R248: RPG impact — explosion. Reuses _explode's layering but with a
    // brighter top + slightly more aggressive sub for the rocket-warhead read.
    _rpgImpact(t) {
        // Sub rumble — punchier and longer than _explode
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(95, t);
        o.frequency.exponentialRampToValueAtTime(24, t + 0.5);
        this._envOn(g, 0.6, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.6);
        // Mid + low + high noise burst — full-spectrum boom
        this._noise(t,        0.55, 0.45, 180,  'lp', 1);
        this._noise(t,        0.30, 0.35, 900,  'bp', 1.2);
        this._noise(t + 0.02, 0.12, 0.20, 4400, 'hp', 1);
        // Bright debris crackle ~0.1s after the boom
        this._noise(t + 0.08, 0.10, 0.18, 5200, 'hp', 1);
    }

    // Chainsaw rev — short sawtooth burst layered with noise. Called every
    // few frames while shoot is held, so each call is short (~80ms) and
    // overlaps with the next for a continuous chainsaw drone.
    // R251: CHAINSAW rev — grindier teeth. Boosted sawtooth gain (0.18 -> 0.24)
    // for the motor, plus a metallic high-frequency whine layer (~2800Hz BP)
    // that simulates the chain teeth biting. Noise gain bumped 0.12 -> 0.16
    // so the grind has bite. Called every few frames while shoot is held, so
    // each call stays short (~100-120ms) and overlaps for a continuous drone.
    _chainsawRev(t) {
        // Sawtooth growl — wobble between 110-160Hz for the "chuga-chuga"
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        const baseF = 110 + Math.random() * 50;
        o.frequency.setValueAtTime(baseF, t);
        o.frequency.linearRampToValueAtTime(baseF * 1.4, t + 0.04);
        o.frequency.linearRampToValueAtTime(baseF, t + 0.08);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.24, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + 0.12);
        // Noise layer — chain teeth grinding
        const n = this.ctx.createBufferSource();
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
        n.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1800;
        bp.Q.value = 4;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.16, t + 0.005);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        n.connect(bp).connect(ng).connect(this.master);
        n.start(t); n.stop(t + 0.08);
        // R251: metallic whine layer — high-frequency sine that wobbles 60Hz
        // around 2800Hz, simulating the chain teeth singing as they spin.
        // Quiet (~0.06) so it sits atop the growl without dominating.
        const w = this.ctx.createOscillator(); const wg = this.ctx.createGain();
        w.type = 'sine';
        const whineBase = 2800 + Math.random() * 200;
        w.frequency.setValueAtTime(whineBase, t);
        w.frequency.linearRampToValueAtTime(whineBase - 60, t + 0.05);
        w.frequency.linearRampToValueAtTime(whineBase, t + 0.10);
        wg.gain.setValueAtTime(0.0001, t);
        wg.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
        w.connect(wg).connect(this.master);
        w.start(t); w.stop(t + 0.12);
    }

    // Grenade throw — short metallic pin-pull click followed by a cloth/air
    // whoosh as it leaves the hand. Two layers so the tell is recognizable
    // even mid-combat.
    _grenadeThrow(t) {
        // Pin click — bright triangle pop
        const o = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(1800, t);
        o.frequency.exponentialRampToValueAtTime(1100, t + 0.02);
        this._envOn(og, 0.08, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.connect(og).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.05);
        // Whoosh — short HPF noise sweep, slightly delayed so the click
        // sits in front
        const dur = 0.16;
        const start = t + 0.03;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(1400, start);
        filt.frequency.exponentialRampToValueAtTime(500, start + dur);
        filt.Q.value = 2.5;
        const ng = this.ctx.createGain();
        this._envOn(ng, 0.10, start);
        ng.gain.exponentialRampToValueAtTime(0.001, start + dur);
        src.connect(filt).connect(ng).connect(this.sfxBus);
        src.start(start); src.stop(start + dur + 0.02);
    }

    // Metallic ladder tick — short HPF noise + low triangle pluck. Quieter
    // than 'step' so it doesn't dominate climbing sections; alternating Q
    // gives left/right hand variation, like _footstep.
    _climbRung(t) {
        const dur = 0.05;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'highpass';
        filt.frequency.value = 1800 + Math.random() * 600;
        filt.Q.value = 1 + Math.random() * 1.5;
        const ng = this.ctx.createGain();
        this._envOn(ng, 0.05, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(ng).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
        // Low triangle pluck for body
        const o = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(220, t);
        this._envOn(og, 0.03, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.connect(og).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.05);
    }

    // Wood thunk — bandpassed noise burst + low triangle thump. Short, dry,
    // dull. Plays per crate hit before destruction; the 'explode' on the
    // final break still lands the punctuation.
    _crateHit(t) {
        const dur = 0.07;
        // Noise body
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(420, t);
        filt.Q.value = 3;
        const ng = this.ctx.createGain();
        this._envOn(ng, 0.10, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(ng).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
        // Triangle thump for body
        const o = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.05);
        this._envOn(og, 0.08, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.connect(og).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.08);
    }

    // Three-note ascending triangle arpeggio (E5 → G#5 → B5) — golden
    // "you unlocked" beat. Bright, brief, and slightly louder than the
    // respawn chime so it cuts through gunfire when the banner slides in.
    _unlockDing(t) {
        const notes = [
            { f: 659.25, start: 0,    dur: 0.10 },
            { f: 830.61, start: 0.08, dur: 0.10 },
            { f: 987.77, start: 0.16, dur: 0.18 },
        ];
        for (const n of notes) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(n.f, t + n.start);
            g.gain.setValueAtTime(0, t + n.start);
            g.gain.linearRampToValueAtTime(0.16, t + n.start + 0.015);
            g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
            o.connect(g).connect(this.sfxBus);
            o.start(t + n.start); o.stop(t + n.start + n.dur + 0.02);
        }
    }

    // Two soft sine pings (G5 → C6) — "you're back" beat. Quiet enough to
    // sit under the music so the respawn doesn't feel celebratory; the
    // upward interval still signals readiness.
    _respawnReady(t) {
        const notes = [
            { f: 784, start: 0,    dur: 0.12 },
            { f: 1047, start: 0.10, dur: 0.20 },
        ];
        for (const n of notes) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(n.f, t + n.start);
            g.gain.setValueAtTime(0, t + n.start);
            g.gain.linearRampToValueAtTime(0.10, t + n.start + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);
            o.connect(g).connect(this.sfxBus);
            o.start(t + n.start); o.stop(t + n.start + n.dur + 0.02);
        }
    }

    // Short bright upward chirp — telegraphs that the magnet engaged.
    // Quieter than the pickup chime so it doesn't dominate when chained.
    _attractChime(t) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(660, t);
        o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
        this._envOn(g, 0.045, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.12);
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

    // R251: LASER beam — sci-fi zap. Detuned saw pair sweeping down for the
    // pew, PLUS a tonal sine "energy wash" beneath, PLUS a sharp high
    // crackle at the head. Reads as a charged beam, not Atari blip.
    _laserBeam(t) {
        // Detuned saw pair sweeping down (the classic pew)
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
        // Energy wash — pure sine descending an octave below the saws.
        // Adds body to the beam so it doesn't read as just "click".
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(900, t);
        o.frequency.exponentialRampToValueAtTime(160, t + 0.20);
        this._envOn(g, 0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.24);
        // High-frequency sizzle + sharp head crackle
        this._noise(t,         0.18, 0.10, 4000, 'hp', 1);
        this._noise(t + 0.005, 0.10, 0.04, 6500, 'hp', 1);
    }

    // R287: FLAME — back to a single clean hiss. The R251 4-layer version
    // (rumble + body + crackle + whine) read as "heavy industrial flame
    // burst" but called every few frames during continuous flame-fire it
    // stacked into a muddy roar. Single bp noise puff is what flame
    // weapons should sound like — overlapping calls naturally build into
    // a roar without each lick being a wall of noise.
    _flameLick(t) {
        this._noise(t, 0.12, 0.22, 1600, 'bp', 1.0);
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

    // R251: THUNDER — punchier thunderclap. Previous version was decent but
    // soft. Now: full low-frequency boom + delayed mid roll + 4 high-freq
    // crackles (was 3) staggered for the chain-lightning sizzle, and a
    // second sub thump for the "echo" feel of a real thunderclap.
    _thunderHit(t) {
        // Low-frequency boom — beefier (gain 0.5 -> 0.65) and slightly longer
        this._noise(t, 0.55, 0.65, 220, 'lp', 1.6);
        // Mid roll — bp tail for that "rumble" after the snap
        this._noise(t + 0.05, 0.40, 0.30, 600, 'bp', 1.4);
        // Bright crack on top (4 staggered crackles for more shimmer)
        for (let i = 0; i < 4; i++) {
            this._noise(t + i * 0.035, 0.08, 0.20, 3600 + i * 900, 'bp', 4);
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

    _pounceStab(t) {
        // Two-beat stealth strike: rising air-cut whoosh then sharp blade clack.
        // Whoosh: descending bp-noise sweep
        this._noise(t,         0.08, 0.18, 3200, 'bp', 6);
        this._noise(t + 0.04,  0.06, 0.18, 1400, 'bp', 6);
        // Blade clack: sharp square stab at 2.5kHz dropping to 600Hz
        this._tonal(t + 0.08, 'square', 2500, 600, 0.06, 0.30);
        this._noise(t + 0.08,  0.05, 0.10, 5000, 'hp', 2);
    }

    _bossEntrance(t) {
        // Heavy thunderous arrival — descending saw bass + low-noise rumble +
        // sharp metallic stab. ~1.2s total so it covers the red-flash + title
        // slide-in beats of the visual flourish.
        // Bass roar
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 1.0);
        this._envOn(g, 0.45, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 1.25);
        // Low rumble bed
        this._noise(t,        0.20, 0.95, 180, 'lp', 1.2);
        this._noise(t + 0.10, 0.18, 0.85, 220, 'lp', 1.0);
        // Sharp metallic stab on the front for the "arrived!" beat
        this._tonal(t,        'square',  880, 220, 0.10, 0.20);
        this._tonal(t + 0.04, 'sawtooth', 660, 110, 0.12, 0.16);
        // Rising siren tail in the back third
        this._tonal(t + 0.5, 'triangle', 110, 440, 0.50, 0.10);
    }

    _secretFound(t) {
        // Triumphant ascending arpeggio — perfect-fifth pattern (C → G → C → G)
        // played on a sine + triangle pair for a clean cyan-palette feel. Longer
        // tail than _powerupChime so it lands as a discovery moment, not a
        // mundane pickup.
        this._tonal(t,        'sine',     523, 784, 0.12, 0.18);   // C5 → G5
        this._tonal(t + 0.12, 'sine',     784, 1047, 0.12, 0.20);  // G5 → C6
        this._tonal(t + 0.24, 'sine',     1047, 1568, 0.14, 0.22); // C6 → G6
        this._tonal(t + 0.40, 'triangle', 1568, 2093, 0.40, 0.18); // G6 → C7 (long tail)
        // Sparkle layer — high-freq triangle pings on the offbeats
        this._tonal(t + 0.06, 'triangle', 2093, 2349, 0.08, 0.10);
        this._tonal(t + 0.30, 'triangle', 2349, 2637, 0.10, 0.10);
    }

    _bossChargeTell(t) {
        // ~500ms rising synth swell matching the contracting telegraph ring.
        // Low triangle base + filtered noise bed; the rising sweep telegraphs
        // "windup ending soon" without stomping on weapon SFX.
        this._tonal(t,        'triangle', 220, 660, 0.45, 0.16);
        this._tonal(t + 0.10, 'sine',     330, 990, 0.40, 0.10);
        // Filtered noise — adds the air-charging tail
        this._noise(t,         0.45, 0.10, 1200, 'bp', 3);
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
    // Side-chain duck: ramp musicBus.gain down to a target level over the
    // attack time, hold while held flag stays true, and ramp back to
    // sidechainBase on release. Used during story dialog / stage card text so
    // music doesn't compete with the read.
    setDuck(active, target = 0.18, attackS = 0.25, releaseS = 0.45) {
        if (!this.ctx || !this.musicBus) return;
        const now = this.ctx.currentTime;
        const g = this.musicBus.gain;
        try {
            g.cancelScheduledValues(now);
            g.setValueAtTime(g.value, now);
            if (active) {
                g.linearRampToValueAtTime(target, now + attackS);
            } else {
                g.linearRampToValueAtTime(this.sidechainBase, now + releaseS);
            }
        } catch (e) {}
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
        // R294: was el.volume = 0.7 + per-track gain 0.85 — combined 0.595×
        // which made the music volume slider top out at ~60% true output.
        // Now full-volume at the source; users control real 100% via the
        // music + master sliders (musicBus + master gain stages).
        el.volume = 1.0;
        el.preload = 'auto';
        const targetGain = 1.0;
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

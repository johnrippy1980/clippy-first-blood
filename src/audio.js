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
    // R545: two new tracks land. Steel Tongues = HOLD THE LINE (stage 25
    // turret-defense vs CRTRON — industrial siege siegework). Metro =
    // dedicated KEYNOTE CORRIDOR (stage 9), splitting from the shared
    // backstage.mp3 previously used for both stage 6 + 9.
    steelTongues: 'assets/audio/steel-tongues.mp3',            // stage 25 HOLD THE LINE
    metro:        'assets/audio/metro.mp3',                    // stage 9 KEYNOTE CORRIDOR
    // R546: CRTRON boss-phase music. Swaps in when the Voltron-CRT boss
    // spawns; playTrack handles the 350ms crossfade so the steelTongues
    // wave music ramps out as gears ramps in.
    gears:        'assets/audio/gears.mp3',                    // CRTRON boss spawn
    // R547: dedicated stage 21 MECHA CORRIDOR (helicopter chase). Was
    // reusing recycleBin which felt mismatched — chopper pursuit
    // deserves its own track.
    conduit:      'assets/audio/conduit.mp3',                  // stage 21 MECHA CORRIDOR
    // R548: dedicated stage 20 MECHA APPROACH opener. Was sharing
    // apocalypse with stage 22. Splits the mecha trilogy musically.
    direct:       'assets/audio/direct.mp3',                   // stage 20 MECHA APPROACH
    // R550: stage 22 MECHA-GATES true-final beat-em-up climax. 169s of
    // payback vengeance theme — fits the super-secret arc's climax.
    payback:      'assets/audio/payback.mp3',                  // stage 22 MECHA-GATES
    // R551: stage 24 BOSS RUSH MODE post-game gauntlet. Splits evolution
    // off stage 24 — now exclusive to stage 23 BLOCK 11.
    indirect:     'assets/audio/indirect.mp3',                 // stage 24 BOSS RUSH MODE
    // R552: pure soundtrack-gallery bonus. No stage routing — discoverable
    // only via the soundtrack screen.
    no:           'assets/audio/no.mp3',                       // bonus-gallery only
    // R553: stage 7 BALLMER ARENA brawl. Replaces bonus2 (demoted back
    // to gallery-only). Naming reflects Ballmer's famously sweat-soaked
    // keynote performances.
    sweat:        'assets/audio/sweat.mp3',                    // stage 7 BALLMER ARENA
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

        // R566p: post-process the music bus before it hits master. User
        // shipped tracks without mastering — they have headroom and lack
        // bass weight. Chain: musicBus → bassBoost → makeupGain → compressor
        // → master. The compressor catches peaks softly so we can push
        // makeupGain confidently without clipping; the low-shelf restores
        // the chest weight that consumer playback eats.
        this._musicBassBoost = this.ctx.createBiquadFilter();
        this._musicBassBoost.type = 'lowshelf';
        this._musicBassBoost.frequency.value = 110;   // boost below ~110Hz
        this._musicBassBoost.gain.value = 4.5;        // +4.5dB chest weight
        this._musicMakeup = this.ctx.createGain();
        this._musicMakeup.gain.value = 1.35;          // ~+2.6dB makeup
        this._musicComp = this.ctx.createDynamicsCompressor();
        this._musicComp.threshold.value = -10;        // start catching peaks at -10dB
        this._musicComp.knee.value = 6;               // soft knee for transparency
        this._musicComp.ratio.value = 3;              // gentle 3:1
        this._musicComp.attack.value = 0.012;         // 12ms — let transients through
        this._musicComp.release.value = 0.18;         // 180ms — musical release
        this.musicBus.connect(this._musicBassBoost);
        this._musicBassBoost.connect(this._musicMakeup);
        this._musicMakeup.connect(this._musicComp);
        this._musicComp.connect(this.master);
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
            // R568d (slice 4): Bonzi's banana — squelchy fire, sticky thud,
            // wet detonation pop, and a chain-detonate stinger.
            case 'bananaFire':           return this._bananaFire(t);
            case 'bananaStick':          return this._bananaStick(t);
            case 'bananaDetonate':       return this._bananaDetonate(t);
            case 'bananaDetonateChain':  return this._bananaDetonateChain(t);
            // R568e (slice 5): Bonzi's specials
            case 'gazeLock':             return this._gazeLock(t);
            case 'popupStorm':           return this._popupStorm(t);
            case 'dialUpScream':         return this._dialUpScream(t);
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
            // R334: helicopter chase SFX.
            case 'chopper':     return this._chopperWhup(t);
            case 'chopperGun':  return this._chopperGun(t);
            // R515: aliases for sfx names that were referenced throughout
            // the codebase but never wired in the switch. They were
            // silently falling through. Now they route to the closest
            // existing synth so the events actually have audio feedback.
            case 'hit':         return this._bossHit(t);     // player took a hit — sharp thud
            case 'playerHit':   return this._hurtGrunt(t);   // explicit damage grunt
            case 'enemyDie':    return this._deathStinger(t);// enemy dies — short stinger
            case 'enemyShoot':  return this._gunshot(t, { thump: 50, body: 700, bodyDur: 0.07, crack: 3200, layers: 1 });
            case 'bossDie':     return this._bossExplode(t); // big boss death
            case 'explosion':   return this._explode(t);     // alias for explode
            case 'crateBreak':  return this._crateHit(t);    // alias for crateHit
            case 'shoot':       return this._gunshot(t, { thump: 60, body: 1100, bodyDur: 0.08, crack: 4200, layers: 1 });
            // R566h: Doom-flavored enemy sounds. Distinct from the player's
            // `hurt`/`die` so it's clear who is making which sound.
            case 'enemySpot':   return this._enemySpot(t);    // sight player — aggressive snarl
            case 'enemyGrowl':  return this._enemyGrowl(t);   // distant ambient prowl
            case 'enemyAttack': return this._enemyAttack(t);  // melee swing/lunge shriek
            case 'enemyPain':   return this._enemyPain(t);    // took damage — sharper yelp
            // Doom-flavored door/pickup audio. Previous beeps/blips were
            // un-thematic for a Doom riff.
            case 'doorSlide':   return this._doorSlide(t);
            case 'doorOpen':    return this._doorSlide(t);
            case 'pickup_health': return this._pickupHealth(t);
            case 'pickup_armor':  return this._pickupArmor(t);
            case 'pickup_ammo':   return this._pickupAmmo(t);
            // R566i: brutal melee sounds for beat-em-up brawler stages.
            // Jab/cross = meaty thud, kick = heavier sub thud with bone-snap
            // crack, bone_crack = special finisher with wet body impact.
            case 'punch':       return this._punchImpact(t);
            case 'kick':        return this._kickImpact(t);
            case 'bone_crack':  return this._boneCrack(t);
            // R566i: FPS-stage enemy weapons. Differentiated voices so the
            // turret rattling isn't confused with a grunt's pistol burst or
            // the core boss's heavy cannon. All have brutal sub-bass.
            case 'enemyTurret': return this._enemyTurretFire(t);
            case 'enemyGrunt':  return this._enemyGruntFire(t);
            case 'enemyCore':   return this._enemyCoreFire(t);
            // R566j: surface-aware footstep variants. player.js dispatches
            // these based on stage theme. Generic 'step' remains the default
            // fallback (concrete-on-rubber sneaker).
            case 'stepMetal':   return this._footstepMetal(t);   // grate clank
            case 'stepWet':     return this._footstepWet(t);     // sewer slosh
            case 'stepCarpet':  return this._footstepCarpet(t);  // muted thud
            case 'stepGrass':   return this._footstepGrass(t);   // leafy crunch
            // R566k: player special-move sounds. dashAttack = knife strike
            // (air-cut + impact crack), pounceLaunch = rising leap whoosh.
            case 'dashAttack':  return this._dashAttackStrike(t);
            case 'pounceLaunch': return this._pounceLaunch(t);
            // R566k: boss-specific firing voices. Each major boss now has
            // its own attack sound matching their attack flavor.
            case 'boss_copier_fire':    return this._bossCopierFire(t);     // paper expulsion
            case 'boss_shredder_fire':  return this._bossShredderFire(t);   // grinding teeth + spray
            case 'boss_bsod_fire':      return this._bossBsodFire(t);       // glitch error tone burst
            case 'boss_ballmer_fire':   return this._bossBallmerFire(t);    // chair whoosh + shout
            case 'boss_gates_fire':     return this._bossGatesFire(t);      // CD-ROM whir + launch
            case 'boss_algorithm_fire': return this._bossAlgorithmFire(t);  // synth zap (cloud AI)
            case 'boss_clippy2_fire':   return this._bossClippy2Fire(t);    // distorted clippy
            case 'boss_spindler_fire':  return this._bossSpindlerFire(t);   // chemical hiss
            // R566l: CRTRON apocalyptic death — chained CRT-implosion glass
            // shatters, sub-bass collapse, electrical-discharge wail. Bigger
            // than the generic _bossExplode used elsewhere.
            case 'crtron_death':  return this._crtronDeath(t);
            // R566m: dramatic player death sting. Distinct from enemy `die`
            // (which is _deathStinger, reused for enemies). Player death
            // gets sub-bass collapse + descending dissonant chord + heart-
            // monitor flatline tone — sells the YOU DIED moment.
            case 'playerDeath': return this._playerDeathSting(t);
            // R566n: triumphant stings for stage clear + boss kill +
            // boss spotted moments. Currently those use generic chimes
            // (powerup/explode) that don't punctuate the beat properly.
            case 'stageClear':  return this._stageClearFanfare(t);
            case 'bossDefeated': return this._bossDefeatedSting(t);
            case 'bossSpotted':  return this._bossSpottedSting(t);
            // R566o: achievement-unlock sting (replaces the simple
            // _unlockDing). Triumphant 3-note climb + bell shimmer
            // + light music duck.
            case 'achievement':  return this._achievementUnlock(t);
            // R566o: per-weapon-class pickup voices. Each hints at the
            // weapon's character: MG=mechanical chunk, shotgun=shell-rack,
            // chainsaw=engine sputter, BFG=hum-charge, laser=sci-fi zap,
            // flame=hiss-ignite, thunder=spark-pop, homing=lock chime,
            // spread=triple-burst tease.
            case 'pickup_mg':       return this._pickupWeaponMg(t);
            case 'pickup_shotgun':  return this._pickupWeaponShotgun(t);
            case 'pickup_chainsaw': return this._pickupWeaponChainsaw(t);
            case 'pickup_bfg':      return this._pickupWeaponBfg(t);
            case 'pickup_laser':    return this._pickupWeaponLaser(t);
            case 'pickup_flame':    return this._pickupWeaponFlame(t);
            case 'pickup_thunder':  return this._pickupWeaponThunder(t);
            case 'pickup_homing':   return this._pickupWeaponHoming(t);
            case 'pickup_spread':   return this._pickupWeaponSpread(t);
            // R566p: pause/unpause swooshes — descending whoosh for enter
            // (world receding), rising whoosh for exit (world resuming).
            case 'pauseEnter':  return this._pauseEnter(t);
            case 'pauseExit':   return this._pauseExit(t);
            // R566p: HUD beat sounds — low-ammo warning click, weapon-cycle
            // mechanical ratchet. Heartbeat for low-HP already exists.
            case 'hudLowAmmo':     return this._hudLowAmmo(t);
            case 'hudWeaponCycle': return this._hudWeaponCycle(t);
            // R566q: looping chainsaw idle sputter. Plays at low volume
            // when chainsaw is equipped but not actively cutting. Each call
            // is a single ~0.4s tick — engine loop fires it on cadence.
            case 'chainsawIdle':   return this._chainsawIdle(t);
            // R566l: ambient environmental SFX. Triggered by stage tick
            // loops at low frequency for atmosphere. NOT replacing
            // existing owlHoot/batChitter/fluorescent/splash — these add
            // to the palette so Doom-mode corridors don't feel sterile.
            case 'distantGunfire': return this._distantGunfire(t);
            case 'waterDrip':      return this._waterDrip(t);
            case 'windHowl':       return this._windHowl(t);
            case 'electricalSpark': return this._electricalSpark(t);
            case 'metalCreak':     return this._metalCreak(t);
        }
    }

    // R334: a single rotor "WHUP" — short low-freq punch + filtered noise
    // burst. Called every ~6 frames by the helicopter boss to create the
    // continuous chopper sound. Frequency-modulated to feel like a real
    // rotor disk slicing air.
    _chopperWhup(t) {
        // Low-freq sine "thump" — the air-displacement pulse
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(95, t);
        o.frequency.exponentialRampToValueAtTime(55, t + 0.04);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.09);
        // High-mid filtered noise — the "wsh" of the blade tip
        const n = this.ctx.createBufferSource();
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.06, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        n.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1100;
        bp.Q.value = 1.6;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        n.connect(bp).connect(ng).connect(this.sfxBus);
        n.start(t); n.stop(t + 0.07);
    }

    // R334: short rattling mini-gun burst. 5 fast clicks + low-mid body.
    _chopperGun(t) {
        // Click train — 5 sharp pulses, ~12ms apart
        for (let i = 0; i < 5; i++) {
            const ts = t + i * 0.012;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(2200, ts);
            o.frequency.exponentialRampToValueAtTime(1500, ts + 0.006);
            g.gain.setValueAtTime(0.0001, ts);
            g.gain.exponentialRampToValueAtTime(0.10, ts + 0.001);
            g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.008);
            o.connect(g).connect(this.sfxBus);
            o.start(ts); o.stop(ts + 0.012);
        }
        // Body thump
        const o2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        o2.type = 'sawtooth';
        o2.frequency.setValueAtTime(140, t);
        o2.frequency.exponentialRampToValueAtTime(70, t + 0.06);
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o2.connect(g2).connect(this.sfxBus);
        o2.start(t); o2.stop(t + 0.1);
    }

    // R249: DOOM-style shotgun — three-stage blast.
    //   1) sub kick (sub-30Hz body thump for chest punch)
    //   2) long mid-band noise body (~280ms) with low-pass roll-off for the
    //      "BOOM-RRRR" tail that defines DOOM's super-shotty
    //   3) bright high-pass crack at the head for the percussive snap
    // Heavier and longer than MG/SPREAD so the player FEELS each blast.
    // R566h: shotgun upgraded to BRUTAL 12-gauge cannon.
    // Now has: (1) bigger sub-bass slam, (2) twin noise bodies for the
    // pellet spread (slightly detuned dual lowpass + bandpass for thicker
    // chest), (3) brighter crack with extended decay, (4) chunky pump
    // action follow-up with deeper "schhh-CLACK" feel, (5) bonus dry
    // "boom echo" tail at 60Hz so the room feels it.
    _shotgunBlast(t) {
        // SUB SLAM — fatter sine sweep, lower fundamental.
        // Was 80→28Hz, now 95→22Hz over 200ms for deeper chest punch.
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(95, t);
        o.frequency.exponentialRampToValueAtTime(22, t + 0.20);
        this._envOn(g, 0.95, t);                    // was 0.65 — way louder
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.26);

        // DRY BOOM ECHO — second low oscillator slightly later for room
        // reflection feel. Doom shotgun has this thick "BOOM" tail.
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(60, t + 0.03);
        o2.frequency.exponentialRampToValueAtTime(28, t + 0.28);
        this._envOn(g2, 0.40, t + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        o2.connect(g2).connect(this.sfxBus);
        o2.start(t + 0.03); o2.stop(t + 0.34);

        // MID BODY — beefier noise tail. Bumped gains, extended duration.
        this._noise(t,         0.62, 0.38, 700,  'lp', 1.2);    // was 0.45/0.30
        this._noise(t + 0.005, 0.48, 0.34, 1200, 'bp', 1.6);    // was 0.30/0.28
        // Sub-spread layer for pellet thickness
        this._noise(t + 0.01,  0.32, 0.22, 450,  'lp', 0.8);

        // BRIGHT CRACK — sharper attack, brighter (5200 vs 4200), longer
        this._noise(t,         0.18, 0.22, 5200, 'hp', 1);

        // MECHANICAL PUMP — was a single square click. Now: cocking +
        // shell-eject sequence. Reads as a real pump-action reload.
        // "Schhh" (shell sliding) at +180ms
        this._noise(t + 0.18, 0.08, 0.10, 2400, 'bp', 3);
        // "CLACK" mechanical seat at +260ms — heavier than original
        this._tonal(t + 0.26, 'square', 280, 140, 0.10, 0.16);
        // Bright metallic ping on the clack
        this._noise(t + 0.26, 0.06, 0.04, 3800, 'hp', 2);
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

    // R568d: banana fire — wet squelch + descending whistle. Reads as goofy
    // not as a gunshot. Pitched-down sine sweep does the work.
    _bananaFire(t) {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(620, t);
        o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
        this._envOn(g, 0.18, t, 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.22);
        // Mouth-pop layer — bright bandpass noise burst at attack
        this._noise(t, 0.08, 0.12, 2400, 'bp', 4);
    }

    // R568d: banana stick — short wet thud. Single low filtered noise pop.
    _bananaStick(t) {
        this._noise(t, 0.10, 0.22, 320, 'lp', 1.5);
        this._noise(t + 0.02, 0.04, 0.12, 1800, 'bp', 2);
    }

    // R568d: banana detonate — wet pop with mid-bass body. Short and snappy.
    _bananaDetonate(t) {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(170, t);
        o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
        this._envOn(g, 0.36, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.25);
        // Bright wet splash on top
        this._noise(t,         0.20, 0.16, 1400, 'bp', 1.6);
        this._noise(t + 0.04,  0.10, 0.14, 4000, 'hp', 1.2);
    }

    // R568d: chain-detonate — used when the player presses fire to mass-pop
    // every stuck blob at once. Bigger, longer, more bass.
    _bananaDetonateChain(t) {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.32);
        this._envOn(g, 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.42);
        this._noise(t,         0.28, 0.30, 800,  'lp', 1.4);
        this._noise(t + 0.02,  0.18, 0.22, 2200, 'bp', 1.8);
        this._noise(t + 0.06,  0.12, 0.18, 5200, 'hp', 1.2);
    }

    // R568e: GAZE — sci-fi target lock blip. Rising sine + brief bandpass tick.
    _gazeLock(t) {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, t);
        o.frequency.exponentialRampToValueAtTime(1760, t + 0.10);
        this._envOn(g, 0.18, t, 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.18);
        this._noise(t, 0.08, 0.08, 4200, 'bp', 4);
    }

    // R568e: POPUP STORM — rapid-fire window-popup chirps stacked, plus a
    // bright "system error" sting.
    _popupStorm(t) {
        for (let i = 0; i < 6; i++) {
            const dt = t + i * 0.04;
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(420 + Math.random() * 240, dt);
            this._envOn(g, 0.06, dt, 0.002);
            g.gain.exponentialRampToValueAtTime(0.001, dt + 0.05);
            o.connect(g).connect(this.sfxBus);
            o.start(dt); o.stop(dt + 0.06);
        }
        // Tail "error sting"
        this._noise(t + 0.10, 0.14, 0.20, 1800, 'bp', 2);
    }

    // R568e: DIAL-UP SCREAM — distorted modem screech + low rumble. The
    // signature internet-of-yore sound, distilled.
    _dialUpScream(t) {
        // High pitched dual-osc warble
        for (let i = 0; i < 2; i++) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(1200 + i * 80, t);
            o.frequency.linearRampToValueAtTime(2400 - i * 60, t + 0.25);
            o.frequency.linearRampToValueAtTime(900, t + 0.55);
            this._envOn(g, 0.18, t, 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
            o.connect(g).connect(this.sfxBus);
            o.start(t); o.stop(t + 0.62);
        }
        // Bandpass-filtered noise for the static texture
        this._noise(t, 0.55, 0.35, 1600, 'bp', 1.4);
        // Low rumble underneath
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(110, t);
        this._envOn(g, 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.5);
    }

    // Chainsaw rev — short sawtooth burst layered with noise. Called every
    // few frames while shoot is held, so each call is short (~80ms) and
    // overlaps with the next for a continuous chainsaw drone.
    // R251: CHAINSAW rev — grindier teeth. Boosted sawtooth gain (0.18 -> 0.24)
    // for the motor, plus a metallic high-frequency whine layer (~2800Hz BP)
    // that simulates the chain teeth biting. Noise gain bumped 0.12 -> 0.16
    // so the grind has bite. Called every few frames while shoot is held, so
    // each call stays short (~100-120ms) and overlaps for a continuous drone.
    // R566h: chainsaw — meatier, buzzier, more brutal.
    // Added: detuned sub-octave saw for thicker bass growl, heavier
    // teeth-grinding noise (broader Q, hotter gain), longer sustain so
    // each tick reads more like an actual chainsaw engagement rather
    // than a wimpy click. Now also routes through sfxBus for proper
    // gain compensation (was hitting master direct — louder than meters).
    _chainsawRev(t) {
        // PRIMARY GROWL — sawtooth bass, slightly lower base for thicker growl
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        const baseF = 90 + Math.random() * 40;     // was 110+50, now 90+40 — deeper
        o.frequency.setValueAtTime(baseF, t);
        o.frequency.linearRampToValueAtTime(baseF * 1.5, t + 0.04);   // bigger wobble
        o.frequency.linearRampToValueAtTime(baseF, t + 0.10);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.40, t + 0.005);         // was 0.24 — meaner
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);        // was 0.10 — longer
        o.connect(g).connect(this.sfxBus);                            // was master
        o.start(t); o.stop(t + 0.14);

        // SUB-OCTAVE LAYER — sawtooth at half the base freq for the
        // chest-feel growl real chainsaws have.
        const sub = this.ctx.createOscillator();
        const subG = this.ctx.createGain();
        sub.type = 'sawtooth';
        sub.frequency.setValueAtTime(baseF * 0.5, t);
        sub.frequency.linearRampToValueAtTime(baseF * 0.75, t + 0.04);
        sub.frequency.linearRampToValueAtTime(baseF * 0.5, t + 0.10);
        subG.gain.setValueAtTime(0.0001, t);
        subG.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
        subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.14);

        // GRINDING NOISE — heavier, broader bandpass for chunkier teeth
        const n = this.ctx.createBufferSource();
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.11, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.55;  // was 0.4
        n.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1600;
        bp.Q.value = 2.5;                          // was 4 — broader = chunkier
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.28, t + 0.005);   // was 0.16 — louder
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        n.connect(bp).connect(ng).connect(this.sfxBus);
        n.start(t); n.stop(t + 0.11);

        // METALLIC WHINE — chain teeth singing, slightly hotter
        const w = this.ctx.createOscillator(); const wg = this.ctx.createGain();
        w.type = 'sine';
        const whineBase = 2800 + Math.random() * 200;
        w.frequency.setValueAtTime(whineBase, t);
        w.frequency.linearRampToValueAtTime(whineBase - 80, t + 0.05);
        w.frequency.linearRampToValueAtTime(whineBase, t + 0.12);
        wg.gain.setValueAtTime(0.0001, t);
        wg.gain.exponentialRampToValueAtTime(0.09, t + 0.005);   // was 0.06
        wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        w.connect(wg).connect(this.sfxBus);
        w.start(t); w.stop(t + 0.14);
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

    // R566j: METAL footstep — sneaker on steel grating. Brighter bandpass
    // tick + a faint metallic ring at the impact for the grate vibration.
    // Sells server-room / cloud-floor environments.
    _footstepMetal(t) {
        // Sharp bright tick — bandpass at ~1800Hz with high Q
        this._noise(t, 0.10, 0.04, 1800, 'bp', 4);
        // Metallic ring — tiny sine ping at 2200Hz that decays fast.
        // Pitch varies per step so the grate sings differently each footfall.
        const ringF = 2000 + Math.random() * 400;
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(ringF, t);
        this._envOn(g, 0.035, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.10);
        // Small sub-thump under it — the grate flexes
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(140, t);
        sub.frequency.exponentialRampToValueAtTime(70, t + 0.05);
        this._envOn(subG, 0.06, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.08);
    }

    // R566j: WET footstep — sneaker on flooded concrete. Soft lowpass tick
    // + a quick splat noise tail. Different from 'wade' (which is sustained
    // wading); this is a single discrete footfall on shallow water/wet floor.
    _footstepWet(t) {
        // Soft body tick — lowpass noise, slightly muddier than dry concrete
        const dur = 0.07;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 600;
        const g = this.ctx.createGain();
        this._envOn(g, 0.10, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
        // Splat tail — bandpass mid noise for the water-spray decay
        this._noise(t + 0.02, 0.08, 0.10, 1400, 'bp', 2);
        // Tiny sub-pop — the puddle ripple
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t);
        sub.frequency.exponentialRampToValueAtTime(50, t + 0.06);
        this._envOn(subG, 0.05, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.10);
    }

    // R566j: CARPET footstep — muted lowpass thud, no high frequencies.
    // Reads as "Clippy is walking on plush boardroom carpet" — softer than
    // concrete, no tick attack, just body.
    _footstepCarpet(t) {
        // Just sub-bass body — no tick, no crack
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(120 + Math.random() * 20, t);
        sub.frequency.exponentialRampToValueAtTime(55, t + 0.08);
        this._envOn(subG, 0.07, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.12);
        // Tiny lowpass scuff — carpet fiber friction (very subtle)
        this._noise(t, 0.025, 0.05, 350, 'lp', 1);
    }

    // R566j: GRASS/LEAVES footstep — bandpass noise crunch for outdoor
    // jungle stages. Brighter than concrete, with a ruffling tail.
    _footstepGrass(t) {
        // Crunch — bandpass noise burst with broader Q for organic feel
        this._noise(t, 0.10, 0.06, 1600, 'bp', 1.8);
        // Higher rustle layer — bandpass at 2800Hz for the dry-leaf shimmer
        this._noise(t + 0.01, 0.05, 0.05, 2800, 'bp', 2.5);
        // Tiny ground-tap under it
        this._noise(t, 0.04, 0.03, 400, 'lp', 1);
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
    // R566h: BRUTAL gunshot — restored Doom-flavored chunkiness.
    // Original was 3 layers (thump/body/crack) at moderate gain. This adds:
    //  - Sub-octave kick-drum slam below the thump (45Hz fundamental)
    //    that hits chest like a real centerfire round.
    //  - Body noise tail extended + 12dB hotter for the meaty mid bark.
    //  - Crack noise burst pushed brighter (HPF higher, slightly longer)
    //    so the snap reads through music and SFX layers.
    //  - Cylinder/mechanism "click" pre-shot for the mechanical feel
    //    Doom guns have (1f offset so it doesn't smear the transient).
    _gunshot(t, { thump = 80, body = 1400, bodyDur = 0.12, crack = 5000, layers = 1 }) {
        for (let layer = 0; layer < layers; layer++) {
            const start = t + layer * 0.025;

            // SUB-OCTAVE SLAM — kick-drum punch below the main thump.
            // Sine sweep from 110Hz → 38Hz over 80ms. Brutal chest hit.
            const sub = this.ctx.createOscillator();
            const subG = this.ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(thump * 1.3, start);
            sub.frequency.exponentialRampToValueAtTime(thump * 0.4, start + 0.08);
            subG.gain.setValueAtTime(0.0, start);
            subG.gain.linearRampToValueAtTime(0.78, start + 0.004);
            subG.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
            sub.connect(subG).connect(this.sfxBus);
            sub.start(start); sub.stop(start + 0.15);

            // PRIMARY THUMP — the original kick, now louder
            const o = this.ctx.createOscillator();
            const og = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(thump * 2, start);
            o.frequency.exponentialRampToValueAtTime(thump * 0.5, start + 0.10);
            og.gain.setValueAtTime(0.0, start);
            og.gain.linearRampToValueAtTime(0.72, start + 0.005);
            og.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
            o.connect(og).connect(this.sfxBus);
            o.start(start); o.stop(start + 0.18);

            // BODY — extended bandpass noise with sub-resonance for meat.
            // Tail extended by 30% so the bark sustains instead of clipping.
            const bodyDurFinal = bodyDur * 1.3;
            const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * bodyDurFinal) | 0, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            // Heavier noise envelope — start hot, decay
            for (let i = 0; i < d.length; i++) {
                const env = Math.pow(1 - i / d.length, 0.7);
                d[i] = (Math.random() * 2 - 1) * env;
            }
            const src = this.ctx.createBufferSource(); src.buffer = buf;
            const filt = this.ctx.createBiquadFilter();
            filt.type = 'bandpass';
            filt.frequency.setValueAtTime(body, start);
            filt.frequency.exponentialRampToValueAtTime(body * 0.35, start + bodyDurFinal);
            filt.Q.value = 1.5;
            const g = this.ctx.createGain();
            this._envOn(g, 0.62, start);     // was 0.42 — meatier
            g.gain.exponentialRampToValueAtTime(0.001, start + bodyDurFinal);
            src.connect(filt).connect(g).connect(this.sfxBus);
            src.start(start); src.stop(start + bodyDurFinal + 0.02);

            // CRACK — sharper, brighter, slightly longer
            const crackBuf = this.ctx.createBuffer(1, (this.ctx.sampleRate * 0.035) | 0, this.ctx.sampleRate);
            const cd = crackBuf.getChannelData(0);
            for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
            const csrc = this.ctx.createBufferSource(); csrc.buffer = crackBuf;
            const cfilt = this.ctx.createBiquadFilter();
            cfilt.type = 'highpass';
            cfilt.frequency.value = crack * 1.1;  // push brighter
            const cg = this.ctx.createGain();
            this._envOn(cg, 0.48, start);    // was 0.32 — brighter snap
            cg.gain.exponentialRampToValueAtTime(0.001, start + 0.035);
            csrc.connect(cfilt).connect(cg).connect(this.sfxBus);
            csrc.start(start); csrc.stop(start + 0.04);
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

    // R566h: enemy hurt — guttural demon snarl with throat-rasp.
    // Original was a single saw whimper. Now: gravelly bandpass noise body
    // + dual-detuned saw growl (220Hz + 165Hz for fifth interval = menacing
    // dissonant feel) + throat-rasp noise burst. Reads as "thing in pain"
    // not "synth complaint".
    _hurtGrunt(t) {
        // Throat rasp — short bandpass noise burst at the attack
        this._noise(t, 0.32, 0.10, 600, 'bp', 2.5);
        this._noise(t, 0.18, 0.06, 1800, 'bp', 4);

        // Primary growl — saw at 220Hz, pitching down to 95Hz (deeper end)
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(95, t + 0.28);   // deeper drop
        this._envOn(g, 0.42, t);                                   // was 0.28
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 800;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.32);

        // Detuned dissonant fifth below — adds menace
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'sawtooth';
        o2.frequency.setValueAtTime(165, t);
        o2.frequency.exponentialRampToValueAtTime(70, t + 0.28);
        this._envOn(g2, 0.24, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
        const filt2 = this.ctx.createBiquadFilter();
        filt2.type = 'lowpass'; filt2.frequency.value = 700;
        o2.connect(filt2).connect(g2).connect(this.sfxBus);
        o2.start(t); o2.stop(t + 0.32);

        // Body-thud — sub-bass kick on impact so the hit lands physical
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(90, t);
        sub.frequency.exponentialRampToValueAtTime(40, t + 0.08);
        this._envOn(subG, 0.30, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.12);
    }

    // R566h: enemy death — much meaner, with throat-gurgle layer and
    // a death-rattle noise tail. Was just a saw decline + noise puff.
    // Now: collapse-thud sub + dual-saw demon scream pitching down to 30Hz
    // + bandpass throat gurgle + lowpass noise tail for the body falling.
    _deathStinger(t) {
        // COLLAPSE THUMP — body hits ground at start
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t);
        sub.frequency.exponentialRampToValueAtTime(35, t + 0.14);
        this._envOn(subG, 0.55, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.20);

        // PRIMARY DEATH WAIL — saw pitching from 280→30Hz over 900ms
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(280, t);
        o.frequency.exponentialRampToValueAtTime(30, t + 0.85);    // was 40, now deeper
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1400, t);
        filt.frequency.exponentialRampToValueAtTime(180, t + 0.85);
        this._envOn(g, 0.46, t);                                    // was 0.30
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.95);

        // DETUNED DEATH WAIL — adds the dissonant evil layer
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'sawtooth';
        o2.frequency.setValueAtTime(210, t);
        o2.frequency.exponentialRampToValueAtTime(22, t + 0.85);
        const filt2 = this.ctx.createBiquadFilter();
        filt2.type = 'lowpass';
        filt2.frequency.setValueAtTime(1000, t);
        filt2.frequency.exponentialRampToValueAtTime(140, t + 0.85);
        this._envOn(g2, 0.28, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
        o2.connect(filt2).connect(g2).connect(this.sfxBus);
        o2.start(t); o2.stop(t + 0.95);

        // THROAT GURGLE — heavier bandpass noise body for the wet gurgle
        this._noise(t + 0.05, 0.32, 0.45, 350, 'bp', 1.5);
        // FINAL BODY TAIL — extended lowpass rumble
        this._noise(t + 0.10, 0.50, 0.30, 350, 'lp', 1.2);
    }

    // R566h: ENEMY SPOT — Doom-style "they see you" aggressive snarl.
    // Pitched DOWN saw + bandpass throat-rasp. Short, jolting, alerting.
    // Used when a clone first sights the player (wake-up alert).
    _enemySpot(t) {
        // Throat rasp burst
        this._noise(t, 0.35, 0.08, 700, 'bp', 3);
        // Snarl — saw climbing from 180→260Hz (rising aggressive pitch)
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.linearRampToValueAtTime(260, t + 0.10);
        o.frequency.exponentialRampToValueAtTime(140, t + 0.22);
        this._envOn(g, 0.36, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.value = 800; filt.Q.value = 1.2;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.26);
        // Detuned octave-down for menace
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'sawtooth';
        o2.frequency.setValueAtTime(90, t);
        o2.frequency.linearRampToValueAtTime(130, t + 0.10);
        o2.frequency.exponentialRampToValueAtTime(70, t + 0.22);
        this._envOn(g2, 0.22, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        o2.connect(g2).connect(this.sfxBus);
        o2.start(t); o2.stop(t + 0.26);
    }

    // R566h: ENEMY GROWL — distant ambient prowl. Quieter, longer than
    // _enemySpot. Used for "something is in the corridor" atmosphere.
    _enemyGrowl(t) {
        // Long deep saw growl, slight pitch wobble
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(75, t);
        o.frequency.linearRampToValueAtTime(95, t + 0.30);
        o.frequency.linearRampToValueAtTime(70, t + 0.60);
        this._envOn(g, 0.22, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.30);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 600;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.64);
        // Subtle throat-rasp noise mid-growl
        this._noise(t + 0.20, 0.10, 0.30, 450, 'bp', 2);
    }

    // R566h: ENEMY ATTACK — melee swing/lunge shriek. Sharp rising
    // shriek + air-cut whoosh. Used when a clone lunges within melee.
    _enemyAttack(t) {
        // Air whoosh — bandpass noise descending
        this._noise(t, 0.20, 0.14, 2400, 'bp', 5);
        // Shriek — saw rising fast 300→520Hz then snap-decay
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, t);
        o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
        o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
        this._envOn(g, 0.32, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.value = 1400; filt.Q.value = 2;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.22);
    }

    // R566h: ENEMY PAIN — short sharp yelp on damage. Brighter + shorter
    // than _hurtGrunt so it reads as "stung, not dying."
    _enemyPain(t) {
        // Quick noise crack
        this._noise(t, 0.20, 0.04, 1800, 'bp', 3);
        // Short sharp saw yelp pitch DOWN
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(360, t);
        o.frequency.exponentialRampToValueAtTime(160, t + 0.10);
        this._envOn(g, 0.30, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1400;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.14);
    }

    // R566h: DOOR SLIDE — Doom-style "schhhhh" hydraulic open. Pure noise
    // band-pass sweep + low sub rumble for the mechanism, no tonal beeps.
    _doorSlide(t) {
        // Hydraulic hiss — descending bandpass noise over 600ms
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * 0.6) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(1800, t);
        filt.frequency.exponentialRampToValueAtTime(600, t + 0.6);
        filt.Q.value = 1.4;
        const g = this.ctx.createGain();
        this._envOn(g, 0.32, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.45);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + 0.64);
        // Low sub rumble — heavy mechanism
        const o = this.ctx.createOscillator(); const og = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(55, t);
        o.frequency.linearRampToValueAtTime(38, t + 0.55);
        this._envOn(og, 0.28, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.60);
        o.connect(og).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.62);
        // Final mechanical clack
        this._tonal(t + 0.55, 'square', 180, 90, 0.06, 0.10);
    }

    // R566h: HEALTH pickup — Doom-style absorbed-resource pulse, no chime.
    // Low sine pulse + tiny noise whoosh, hints at organic absorption.
    _pickupHealth(t) {
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(260, t);
        o.frequency.linearRampToValueAtTime(440, t + 0.12);
        this._envOn(g, 0.30, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.18);
        // Sub-octave thicken
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(130, t);
        o2.frequency.linearRampToValueAtTime(220, t + 0.12);
        this._envOn(g2, 0.20, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o2.connect(g2).connect(this.sfxBus);
        o2.start(t); o2.stop(t + 0.18);
        // Tiny noise whoosh
        this._noise(t, 0.10, 0.08, 2400, 'bp', 3);
    }

    // R566h: ARMOR pickup — metallic clink + low sine thud. Distinct from health.
    _pickupArmor(t) {
        // Metallic clink at attack — bright square
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(1200, t);
        o.frequency.exponentialRampToValueAtTime(620, t + 0.10);
        this._envOn(g, 0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'highpass'; filt.frequency.value = 800;
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.16);
        // Sub thud
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(90, t);
        sub.frequency.exponentialRampToValueAtTime(45, t + 0.10);
        this._envOn(subG, 0.30, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.14);
        // Brief metallic shimmer noise
        this._noise(t, 0.08, 0.10, 3200, 'hp', 2);
    }

    // R566h: AMMO pickup — mechanical click + magazine slap. No chime.
    _pickupAmmo(t) {
        // Click — short square
        this._tonal(t, 'square', 480, 320, 0.04, 0.06);
        // Magazine slap — quick noise thud
        this._noise(t + 0.04, 0.18, 0.08, 600, 'lp', 1.5);
        // Sub punch
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(75, t + 0.04);
        sub.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        this._envOn(subG, 0.22, t + 0.04);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t + 0.04); sub.stop(t + 0.16);
    }

    // R566i: PUNCH IMPACT — meaty thud for jab/cross strikes.
    // Sub-bass body kick + bandpass mid for the wet flesh contact +
    // small bone-clack transient. Reads as fist-meets-meat.
    _punchImpact(t) {
        // Body thud — sub sine punch
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(140, t);
        sub.frequency.exponentialRampToValueAtTime(50, t + 0.10);
        this._envOn(subG, 0.62, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.16);
        // Wet meat — bandpass noise body
        this._noise(t, 0.36, 0.12, 550, 'bp', 1.6);
        // Bone-clack transient — short bright noise crack
        this._noise(t, 0.16, 0.04, 2800, 'hp', 2);
    }

    // R566i: KICK IMPACT — heavier than punch, longer body decay, with
    // a snap-crack on impact for the boot-on-ribs feel.
    _kickImpact(t) {
        // Heavy sub-bass — kicks have more momentum than punches
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t);
        sub.frequency.exponentialRampToValueAtTime(38, t + 0.16);
        this._envOn(subG, 0.78, t);                  // hotter than punch
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.22);
        // Detuned sub-octave for chest punch — kick is a body blow
        const sub2 = this.ctx.createOscillator(); const sub2G = this.ctx.createGain();
        sub2.type = 'sine';
        sub2.frequency.setValueAtTime(70, t);
        sub2.frequency.exponentialRampToValueAtTime(28, t + 0.16);
        this._envOn(sub2G, 0.42, t);
        sub2G.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        sub2.connect(sub2G).connect(this.sfxBus);
        sub2.start(t); sub2.stop(t + 0.22);
        // Extended body — bigger lowpass noise tail
        this._noise(t, 0.50, 0.18, 450, 'lp', 1.4);
        // Snap-crack — sharp transient at attack
        this._noise(t, 0.22, 0.05, 3200, 'hp', 2);
    }

    // R566i: BONE CRACK — special finisher impact. Wet crunch + sharp
    // snap + extended decay. Reserved for combo finishers / specials.
    _boneCrack(t) {
        // Massive sub thump
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(160, t);
        sub.frequency.exponentialRampToValueAtTime(35, t + 0.22);
        this._envOn(subG, 0.85, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.28);
        // Wet body crunch — bandpass noise sweeping down
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * 0.18) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(900, t);
        filt.frequency.exponentialRampToValueAtTime(280, t + 0.18);
        filt.Q.value = 1.8;
        const g = this.ctx.createGain();
        this._envOn(g, 0.45, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + 0.20);
        // Sharp BONE-snap crack — bright noise burst at attack
        this._noise(t, 0.30, 0.06, 4500, 'hp', 2);
        // Stab tonal — quick square pitch-down for the "kssh" of breaking
        this._tonal(t + 0.02, 'square', 1800, 600, 0.08, 0.10);
    }

    // R566i: ENEMY TURRET FIRE — mechanical pulse-cannon. Different from
    // a gunshot: tighter attack, more "pew-thump" mechanical, with a
    // capacitor whine pre-roll for the energy-weapon feel.
    _enemyTurretFire(t) {
        // Capacitor whine — quick sine sweep up before the discharge
        const whine = this.ctx.createOscillator(); const whineG = this.ctx.createGain();
        whine.type = 'sawtooth';
        whine.frequency.setValueAtTime(800, t);
        whine.frequency.exponentialRampToValueAtTime(2200, t + 0.04);
        this._envOn(whineG, 0.10, t);
        whineG.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        whine.connect(whineG).connect(this.sfxBus);
        whine.start(t); whine.stop(t + 0.06);
        // Discharge thump — sub kick on release
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(140, t + 0.04);
        sub.frequency.exponentialRampToValueAtTime(55, t + 0.14);
        this._envOn(subG, 0.50, t + 0.04);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t + 0.04); sub.stop(t + 0.18);
        // Mid body — short bandpass noise for the energy-zap body
        this._noise(t + 0.04, 0.28, 0.08, 1600, 'bp', 2);
        // Bright zap crack
        this._noise(t + 0.04, 0.16, 0.05, 4200, 'hp', 2);
    }

    // R566i: ENEMY GRUNT FIRE — small-caliber pistol burst. Snappier
    // and lighter than the player's MG but still has chest-thump.
    _enemyGruntFire(t) {
        // Sub thump — quick light kick
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t);
        sub.frequency.exponentialRampToValueAtTime(45, t + 0.08);
        this._envOn(subG, 0.40, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.12);
        // Bandpass body — tighter than MG (smaller caliber)
        this._noise(t, 0.32, 0.08, 1100, 'bp', 1.8);
        // Sharp crack — bright snap
        this._noise(t, 0.26, 0.025, 5200, 'hp', 1.5);
    }

    // R566i: ENEMY CORE FIRE — huge boss cannon. Much bigger than a
    // grunt's pistol; this is a wall-shaking discharge.
    _enemyCoreFire(t) {
        // Massive sub slam — boss cannon
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(70, t);
        sub.frequency.exponentialRampToValueAtTime(22, t + 0.30);
        this._envOn(subG, 1.0, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.36);
        // Mid-low body rumble
        this._noise(t, 0.62, 0.45, 380, 'lp', 1.2);
        // Mid bark
        this._noise(t + 0.01, 0.42, 0.28, 850, 'bp', 1.4);
        // High crack
        this._noise(t, 0.22, 0.16, 4600, 'hp', 1.2);
        // Resonant cannon-tail — square pitch sweep mimicking a barrel echo
        const tail = this.ctx.createOscillator(); const tailG = this.ctx.createGain();
        tail.type = 'square';
        tail.frequency.setValueAtTime(120, t + 0.05);
        tail.frequency.exponentialRampToValueAtTime(45, t + 0.30);
        const tailFilt = this.ctx.createBiquadFilter();
        tailFilt.type = 'lowpass'; tailFilt.frequency.value = 500;
        this._envOn(tailG, 0.30, t + 0.05);
        tailG.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        tail.connect(tailFilt).connect(tailG).connect(this.sfxBus);
        tail.start(t + 0.05); tail.stop(t + 0.34);
    }

    _explode(t) {
        // R566m: light music duck so the boom has clearance.
        this.duck(0.03, 0.55, 0.15, 0.35);
        // Multi-layered: low rumble, mid noise burst, high crack
        this._noise(t, 0.5, 0.55, 200, 'lp', 1);
        this._noise(t, 0.25, 0.35, 900, 'bp', 1.2);
        this._noise(t + 0.02, 0.08, 0.18, 4000, 'hp', 1);
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
        this._envOn(g, 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.55);
    }

    // R566h: replaced the square-wave "clang" with a meaty body-thud.
    // Sub-bass kick + bandpass meat noise + a tight metallic shimmer
    // (kept the metallic feel but via filtered noise, not a 880Hz beep).
    _bossHit(t) {
        // Sub kick — body thud at attack
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(150, t);
        sub.frequency.exponentialRampToValueAtTime(55, t + 0.12);
        this._envOn(subG, 0.55, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.18);
        // Meat noise — bandpass mid for the wet impact
        this._noise(t, 0.32, 0.20, 600, 'bp', 1.8);
        // Metallic shimmer — bright noise crackle, not a square clang
        this._noise(t, 0.18, 0.10, 3200, 'hp', 2);
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

    // R566k: DASH ATTACK — knife strike. Was reusing `slide` (just a noise
    // rush). Now: air-cut whoosh + sharp impact crack on arrival.
    _dashAttackStrike(t) {
        // Air-cut whoosh — descending bandpass noise sweep
        this._noise(t, 0.18, 0.10, 3200, 'bp', 4);
        this._noise(t + 0.03, 0.14, 0.10, 1800, 'bp', 4);
        // Impact crack at end of dash — sharp HPF noise burst
        this._noise(t + 0.10, 0.32, 0.05, 4200, 'hp', 1.5);
        // Sub punch on impact — body weight behind the strike
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(140, t + 0.10);
        sub.frequency.exponentialRampToValueAtTime(55, t + 0.18);
        this._envOn(subG, 0.50, t + 0.10);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t + 0.10); sub.stop(t + 0.22);
    }

    // R566k: POUNCE LAUNCH — rising leap whoosh. Pairs with the existing
    // _pounceStab strike on landing.
    _pounceLaunch(t) {
        // Rising whoosh — bandpass noise climbing 600→2400Hz
        const dur = 0.22;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(600, t);
        filt.frequency.exponentialRampToValueAtTime(2400, t + dur);
        filt.Q.value = 3;
        const g = this.ctx.createGain();
        this._envOn(g, 0.24, t);
        g.gain.linearRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
        // Body-weight sub-thump on takeoff — the kick of pushing off
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(120, t);
        sub.frequency.exponentialRampToValueAtTime(60, t + 0.10);
        this._envOn(subG, 0.30, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.14);
    }

    // R566k: COPIER_3000 — paper expulsion: pneumatic puff + paper rustle.
    _bossCopierFire(t) {
        // Pneumatic puff — short lowpass noise burst
        this._noise(t, 0.18, 0.08, 800, 'lp', 1.4);
        // Paper rustle layer — bandpass higher freq for the dry sheets
        this._noise(t + 0.02, 0.12, 0.12, 2400, 'bp', 2.5);
        // Mechanism click — square pitch-down
        this._tonal(t, 'square', 600, 380, 0.06, 0.06);
    }

    // R566k: SHREDDER — grinding teeth + paper-tear spray.
    _bossShredderFire(t) {
        // Grinding teeth — sawtooth growl pitched low
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.linearRampToValueAtTime(220, t + 0.08);
        o.frequency.linearRampToValueAtTime(170, t + 0.16);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 900;
        this._envOn(g, 0.32, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.20);
        // Paper-tear noise — bright bandpass shred
        this._noise(t, 0.20, 0.16, 2200, 'bp', 1.8);
    }

    // R566k: CTRL_ALT_DEL (BSOD) — glitch error tone burst.
    _bossBsodFire(t) {
        // Glitchy detuned square stab — error-beep but mean
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(440, t);
        o.frequency.linearRampToValueAtTime(520, t + 0.05);
        o.frequency.linearRampToValueAtTime(360, t + 0.10);
        this._envOn(g, 0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.16);
        // Detuned dissonant layer for glitch feel
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'square';
        o2.frequency.setValueAtTime(465, t);
        o2.frequency.linearRampToValueAtTime(545, t + 0.05);
        o2.frequency.linearRampToValueAtTime(380, t + 0.10);
        this._envOn(g2, 0.18, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o2.connect(g2).connect(this.sfxBus);
        o2.start(t); o2.stop(t + 0.16);
        // Static noise burst — corrupted data
        this._noise(t, 0.16, 0.10, 3200, 'bp', 2);
    }

    // R566k: BALLMER — chair whoosh + shouted "DEVELOPERS" stand-in.
    // Uses the existing chair whoosh as a starting point but adds a
    // shouted-voice formant layer for the iconic Ballmer rage.
    _bossBallmerFire(t) {
        // Chair whoosh — fast bandpass noise sweep
        this._noise(t, 0.22, 0.14, 2800, 'bp', 3);
        this._noise(t + 0.03, 0.18, 0.10, 1400, 'bp', 3);
        // Shouted voice formant — saw + lowpass for vocal feel
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t);
        o.frequency.linearRampToValueAtTime(340, t + 0.10);
        o.frequency.linearRampToValueAtTime(180, t + 0.22);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1100;
        this._envOn(g, 0.34, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.26);
    }

    // R566k: GATES — CD-ROM whir + projectile launch.
    _bossGatesFire(t) {
        // CD-ROM spin-up whir — saw climbing fast
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(600, t);
        o.frequency.exponentialRampToValueAtTime(2400, t + 0.10);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 2;
        this._envOn(g, 0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.14);
        // Mechanical click of the launch
        this._tonal(t + 0.10, 'square', 800, 400, 0.10, 0.06);
        // Sub-thump on launch
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t + 0.10);
        sub.frequency.exponentialRampToValueAtTime(50, t + 0.18);
        this._envOn(subG, 0.32, t + 0.10);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t + 0.10); sub.stop(t + 0.22);
    }

    // R566k: ALGORITHM (cloud AI) — synth zap with FM wobble.
    _bossAlgorithmFire(t) {
        // FM zap — sine carrier modulated by a fast sine for the synthetic
        // "AI energy weapon" texture.
        const carrier = this.ctx.createOscillator(); const cg = this.ctx.createGain();
        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(880, t);
        carrier.frequency.exponentialRampToValueAtTime(340, t + 0.22);
        // FM modulator
        const mod = this.ctx.createOscillator(); const modGain = this.ctx.createGain();
        mod.type = 'sine';
        mod.frequency.setValueAtTime(40, t);
        mod.frequency.linearRampToValueAtTime(120, t + 0.22);
        modGain.gain.value = 120;
        mod.connect(modGain).connect(carrier.frequency);
        this._envOn(cg, 0.30, t);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        carrier.connect(cg).connect(this.sfxBus);
        carrier.start(t); carrier.stop(t + 0.26);
        mod.start(t); mod.stop(t + 0.26);
        // Bright crack on release
        this._noise(t, 0.12, 0.08, 3800, 'hp', 1.5);
    }

    // R566k: CLIPPY_2 — distorted clippy variant. Pitched-down ring
    // modulator over a square — sounds like Clippy if Clippy was demonic.
    _bossClippy2Fire(t) {
        // Pitched-down saw with vibrato — demonic Clippy chime
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.linearRampToValueAtTime(220, t + 0.06);
        o.frequency.linearRampToValueAtTime(180, t + 0.12);
        o.frequency.linearRampToValueAtTime(140, t + 0.20);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1400;
        this._envOn(g, 0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.24);
        // Detuned dissonant layer
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'sawtooth';
        o2.frequency.setValueAtTime(186, t);
        o2.frequency.linearRampToValueAtTime(228, t + 0.06);
        o2.frequency.linearRampToValueAtTime(186, t + 0.12);
        o2.frequency.linearRampToValueAtTime(145, t + 0.20);
        this._envOn(g2, 0.18, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o2.connect(g2).connect(this.sfxBus);
        o2.start(t); o2.stop(t + 0.24);
    }

    // R566k: SPINDLER — chemical hiss + flask launch.
    _bossSpindlerFire(t) {
        // Chemical hiss — bandpass noise tail
        this._noise(t, 0.18, 0.20, 2400, 'bp', 1.4);
        // Glass tinkle on launch — short square ping
        this._tonal(t, 'square', 1800, 1200, 0.06, 0.08);
        // Sub thud — flask launch impulse
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(95, t);
        sub.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        this._envOn(subG, 0.24, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.16);
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
        // R566m: duck music briefly so the boss death cuts through
        this.duck(0.05, 0.30, 0.5, 0.5);
        for (let i = 0; i < 6; i++) {
            this._noise(t + i * 0.08, 0.25, 0.40, 200 + i * 200, 'bp', 1.4);
        }
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.8);
        this._envOn(g, 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.95);
    }

    // R566l: CRTRON apocalyptic death. ~1.6 seconds, bigger than generic
    // _bossExplode. Composed of:
    //   - 12 chained CRT-implosion bursts staggered over 1.2s (each = sub
    //     thump + glass-shatter HPF noise crack + bright bp tail)
    //   - Continuous electrical-discharge wail (sawtooth + bandpass) layered
    //     across the whole duration, pitching down to demonic 25Hz
    //   - Final low rumble tail for the body falling apart
    _crtronDeath(t) {
        // R566m: duck music for the 1.6s apocalyptic sequence so the
        // implosions cut through. Attack fast, hold for the duration,
        // release as the rumble tail fades.
        this.duck(0.05, 0.20, 1.4, 0.6);
        // 12 chained CRT-implosion bursts
        for (let i = 0; i < 12; i++) {
            const bt = t + i * 0.10 + (Math.random() - 0.5) * 0.04;
            // Sub thump for each implosion
            const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
            sub.type = 'sine';
            const f = 120 + Math.random() * 60;
            sub.frequency.setValueAtTime(f, bt);
            sub.frequency.exponentialRampToValueAtTime(f * 0.35, bt + 0.08);
            this._envOn(subG, 0.55, bt);
            subG.gain.exponentialRampToValueAtTime(0.001, bt + 0.12);
            sub.connect(subG).connect(this.sfxBus);
            sub.start(bt); sub.stop(bt + 0.14);
            // Glass shatter — bright HPF noise crack
            this._noise(bt, 0.30, 0.10, 4200 + Math.random() * 800, 'hp', 1.5);
            // Mid noise tail — the wet implosion body
            this._noise(bt + 0.02, 0.20, 0.18, 900, 'bp', 1.8);
        }

        // Continuous electrical-discharge wail across the whole sequence
        const wail = this.ctx.createOscillator(); const wailG = this.ctx.createGain();
        wail.type = 'sawtooth';
        wail.frequency.setValueAtTime(440, t);
        wail.frequency.exponentialRampToValueAtTime(25, t + 1.4);
        const wailFilt = this.ctx.createBiquadFilter();
        wailFilt.type = 'lowpass';
        wailFilt.frequency.setValueAtTime(1800, t);
        wailFilt.frequency.exponentialRampToValueAtTime(200, t + 1.4);
        this._envOn(wailG, 0.40, t);
        wailG.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        wail.connect(wailFilt).connect(wailG).connect(this.sfxBus);
        wail.start(t); wail.stop(t + 1.5);

        // Detuned dissonant wail layer — adds the evil
        const wail2 = this.ctx.createOscillator(); const wail2G = this.ctx.createGain();
        wail2.type = 'sawtooth';
        wail2.frequency.setValueAtTime(330, t);
        wail2.frequency.exponentialRampToValueAtTime(18, t + 1.4);
        const wail2Filt = this.ctx.createBiquadFilter();
        wail2Filt.type = 'lowpass';
        wail2Filt.frequency.setValueAtTime(1400, t);
        wail2Filt.frequency.exponentialRampToValueAtTime(150, t + 1.4);
        this._envOn(wail2G, 0.26, t);
        wail2G.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        wail2.connect(wail2Filt).connect(wail2G).connect(this.sfxBus);
        wail2.start(t); wail2.stop(t + 1.5);

        // Final low rumble tail — the body collapsing
        this._noise(t + 1.0, 0.45, 0.60, 220, 'lp', 1.0);
        this._noise(t + 1.1, 0.30, 0.50, 380, 'lp', 1.2);
    }

    // R566m: music ducking helper. Drops the music bus gain to `depth` over
    // `attackS` seconds, holds for `holdS`, then ramps back to baseline
    // over `releaseS`. Use for big events (death, boss spawn, big explosion)
    // so the SFX can breathe without competing with the music bed.
    // Stacks safely — last call wins on the gain curve.
    duck(attackS = 0.05, depth = 0.25, holdS = 0.4, releaseS = 0.8) {
        if (!this.musicBus) return;
        const t = this.ctx.currentTime;
        const base = this.sidechainBase || 1.0;
        const target = base * depth;
        try {
            this.musicBus.gain.cancelScheduledValues(t);
            this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
            this.musicBus.gain.linearRampToValueAtTime(target, t + attackS);
            this.musicBus.gain.setValueAtTime(target, t + attackS + holdS);
            this.musicBus.gain.linearRampToValueAtTime(base, t + attackS + holdS + releaseS);
        } catch (e) { /* defensive: cancelScheduledValues can throw on older WA */ }
    }

    // R566m: PLAYER DEATH STING — dramatic 1.4s sequence for the
    // YOU DIED moment. Sub-bass collapse + descending dissonant minor
    // chord (root + flat-3 + flat-5) + heart-monitor flatline tone.
    // Ducks the music bus heavily so the sting cuts through.
    _playerDeathSting(t) {
        // Duck music bus hard for the sting duration
        this.duck(0.03, 0.10, 1.0, 0.6);

        // Sub-bass collapse — kick punch on impact
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(180, t);
        sub.frequency.exponentialRampToValueAtTime(30, t + 0.40);
        this._envOn(subG, 0.85, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.52);

        // Descending dissonant minor chord — root + flat-3 + flat-5.
        // Pitches down a fifth over 0.9s for the "everything fading"
        // feel. Triangle waves so it sits behind without sounding harsh.
        const chord = [
            { f: 220, gain: 0.20 },  // root A3
            { f: 261, gain: 0.16 },  // flat 3 (C4)
            { f: 311, gain: 0.14 },  // flat 5 (D#4)
        ];
        for (const note of chord) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(note.f, t + 0.10);
            o.frequency.exponentialRampToValueAtTime(note.f * 0.5, t + 1.0);
            this._envOn(g, note.gain, t + 0.10);
            g.gain.linearRampToValueAtTime(note.gain, t + 0.6);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
            o.connect(g).connect(this.sfxBus);
            o.start(t + 0.10); o.stop(t + 1.12);
        }

        // Heart-monitor flatline tone — sustained sine at ~660Hz over
        // the last 700ms. Comes in after the chord settles. Reads as
        // "asystole" — universal "patient died" signal.
        const flat = this.ctx.createOscillator(); const flatG = this.ctx.createGain();
        flat.type = 'sine';
        flat.frequency.setValueAtTime(660, t + 0.70);
        this._envOn(flatG, 0.14, t + 0.70);
        flatG.gain.linearRampToValueAtTime(0.14, t + 1.25);
        flatG.gain.exponentialRampToValueAtTime(0.001, t + 1.40);
        flat.connect(flatG).connect(this.sfxBus);
        flat.start(t + 0.70); flat.stop(t + 1.42);

        // Body-fall noise tail — body hits the ground in the first 200ms
        this._noise(t, 0.45, 0.20, 280, 'lp', 1.2);
        this._noise(t + 0.05, 0.28, 0.16, 600, 'bp', 1.5);
    }

    // R566n: STAGE CLEAR FANFARE — short triumphant 4-note arpeggio
    // (rising major chord: C4 → E4 → G4 → C5) layered over a sustained
    // pad. ~1.0s total. Used for non-boss stage clears (training, time
    // trial, post-game returns). Was using `powerup` (generic chime).
    _stageClearFanfare(t) {
        this.duck(0.05, 0.30, 0.9, 0.5);
        // Rising arpeggio — square + triangle layered for body
        const notes = [
            { f: 523, off: 0.00, dur: 0.20 },  // C5
            { f: 659, off: 0.10, dur: 0.20 },  // E5
            { f: 784, off: 0.20, dur: 0.20 },  // G5
            { f: 1047, off: 0.30, dur: 0.50 }, // C6 (held)
        ];
        for (const n of notes) {
            // Square for definition
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(n.f, t + n.off);
            this._envOn(g, 0.18, t + n.off);
            g.gain.exponentialRampToValueAtTime(0.001, t + n.off + n.dur);
            o.connect(g).connect(this.sfxBus);
            o.start(t + n.off); o.stop(t + n.off + n.dur + 0.02);
            // Triangle sub-octave for body
            const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
            o2.type = 'triangle';
            o2.frequency.setValueAtTime(n.f * 0.5, t + n.off);
            this._envOn(g2, 0.14, t + n.off);
            g2.gain.exponentialRampToValueAtTime(0.001, t + n.off + n.dur);
            o2.connect(g2).connect(this.sfxBus);
            o2.start(t + n.off); o2.stop(t + n.off + n.dur + 0.02);
        }
        // Sustained pad — root C chord underneath the whole thing
        const padFreqs = [262, 330, 392];  // C4 E4 G4
        for (const f of padFreqs) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(f, t);
            this._envOn(g, 0.06, t);
            g.gain.linearRampToValueAtTime(0.06, t + 0.7);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
            o.connect(g).connect(this.sfxBus);
            o.start(t); o.stop(t + 1.02);
        }
        // Sub thump at the start for impact
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t);
        sub.frequency.exponentialRampToValueAtTime(55, t + 0.12);
        this._envOn(subG, 0.35, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.18);
    }

    // R566n: BOSS DEFEATED — bigger triumphant sting for boss-kill
    // stage clears. ~1.6s. Builds on stageClear with a longer pad +
    // an extra octave-up arpeggio for the final climactic note.
    _bossDefeatedSting(t) {
        this.duck(0.05, 0.20, 1.4, 0.7);
        // Sub slam at start — boss falls
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(150, t);
        sub.frequency.exponentialRampToValueAtTime(45, t + 0.25);
        this._envOn(subG, 0.65, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.32);
        // Big rising fanfare — 5-note arpeggio (root, third, fifth,
        // root-up, fifth-up) in F major for the heroic "you did it" feel
        const notes = [
            { f: 349, off: 0.15, dur: 0.18 },  // F4
            { f: 440, off: 0.25, dur: 0.18 },  // A4
            { f: 523, off: 0.35, dur: 0.18 },  // C5
            { f: 698, off: 0.50, dur: 0.20 },  // F5
            { f: 1047, off: 0.70, dur: 0.80 }, // C6 — held final
        ];
        for (const n of notes) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(n.f, t + n.off);
            this._envOn(g, 0.20, t + n.off);
            g.gain.exponentialRampToValueAtTime(0.001, t + n.off + n.dur);
            o.connect(g).connect(this.sfxBus);
            o.start(t + n.off); o.stop(t + n.off + n.dur + 0.02);
            // Triangle body
            const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
            o2.type = 'triangle';
            o2.frequency.setValueAtTime(n.f * 0.5, t + n.off);
            this._envOn(g2, 0.16, t + n.off);
            g2.gain.exponentialRampToValueAtTime(0.001, t + n.off + n.dur);
            o2.connect(g2).connect(this.sfxBus);
            o2.start(t + n.off); o2.stop(t + n.off + n.dur + 0.02);
        }
        // Sustained F major pad through the whole sting
        const padFreqs = [175, 220, 262, 349];  // F3 A3 C4 F4
        for (const f of padFreqs) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(f, t + 0.1);
            this._envOn(g, 0.07, t + 0.1);
            g.gain.linearRampToValueAtTime(0.07, t + 1.2);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.55);
            o.connect(g).connect(this.sfxBus);
            o.start(t + 0.1); o.stop(t + 1.58);
        }
        // Cymbal-crash bandpass noise at start
        this._noise(t, 0.32, 0.18, 4200, 'hp', 1);
        this._noise(t, 0.20, 0.30, 1800, 'bp', 1.5);
    }

    // R566n: BOSS SPOTTED — sharp dramatic sting for boss-intro cinematic
    // start. Distinct from _bossEntrance (which is the heavy 1.2s arrival
    // at frame 20). This is a sharp 0.5s "OH SHIT" sting fired at scene
    // entry — sub stab + descending dissonant tritone + cymbal crash.
    _bossSpottedSting(t) {
        this.duck(0.03, 0.25, 0.4, 0.4);
        // Sub stab — sharp downward kick
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(220, t);
        sub.frequency.exponentialRampToValueAtTime(40, t + 0.20);
        this._envOn(subG, 0.70, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.26);
        // Dissonant tritone — root + flat-5 (the "devil's interval")
        // Pitches down to convey looming threat
        const root = this.ctx.createOscillator(); const rootG = this.ctx.createGain();
        root.type = 'sawtooth';
        root.frequency.setValueAtTime(440, t + 0.02);
        root.frequency.exponentialRampToValueAtTime(220, t + 0.45);
        const rootFilt = this.ctx.createBiquadFilter();
        rootFilt.type = 'lowpass'; rootFilt.frequency.value = 1200;
        this._envOn(rootG, 0.30, t + 0.02);
        rootG.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
        root.connect(rootFilt).connect(rootG).connect(this.sfxBus);
        root.start(t + 0.02); root.stop(t + 0.52);
        // Tritone partner (flat-5 above) — 622Hz (D#5) for the dissonance
        const trit = this.ctx.createOscillator(); const tritG = this.ctx.createGain();
        trit.type = 'sawtooth';
        trit.frequency.setValueAtTime(622, t + 0.02);
        trit.frequency.exponentialRampToValueAtTime(311, t + 0.45);
        const tritFilt = this.ctx.createBiquadFilter();
        tritFilt.type = 'lowpass'; tritFilt.frequency.value = 1400;
        this._envOn(tritG, 0.22, t + 0.02);
        tritG.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
        trit.connect(tritFilt).connect(tritG).connect(this.sfxBus);
        trit.start(t + 0.02); trit.stop(t + 0.52);
        // Cymbal crash — bright noise burst at attack
        this._noise(t, 0.40, 0.10, 4800, 'hp', 1);
        this._noise(t, 0.22, 0.20, 2400, 'bp', 1.5);
    }

    // R566o: ACHIEVEMENT UNLOCK — was a simple 3-note triangle arpeggio
    // (E5→G#5→B5). Now: rising 4-note climb (C5→E5→G5→C6) with bell
    // shimmer + light music duck so the celebratory sting cuts through.
    _achievementUnlock(t) {
        this.duck(0.04, 0.45, 0.55, 0.5);
        // Rising 4-note climb — square + triangle layered
        const notes = [
            { f: 523, off: 0.00, dur: 0.10 },  // C5
            { f: 659, off: 0.07, dur: 0.10 },  // E5
            { f: 784, off: 0.14, dur: 0.10 },  // G5
            { f: 1047, off: 0.22, dur: 0.30 }, // C6 held
        ];
        for (const n of notes) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(n.f, t + n.off);
            this._envOn(g, 0.20, t + n.off);
            g.gain.exponentialRampToValueAtTime(0.001, t + n.off + n.dur);
            o.connect(g).connect(this.sfxBus);
            o.start(t + n.off); o.stop(t + n.off + n.dur + 0.02);
        }
        // Bell shimmer — higher sine pings on top of the final note
        const shimmerFreqs = [1568, 2093, 2637];  // G6 C7 E7
        for (let i = 0; i < shimmerFreqs.length; i++) {
            const sh = this.ctx.createOscillator(); const shG = this.ctx.createGain();
            sh.type = 'sine';
            sh.frequency.setValueAtTime(shimmerFreqs[i], t + 0.22 + i * 0.04);
            this._envOn(shG, 0.08, t + 0.22 + i * 0.04);
            shG.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
            sh.connect(shG).connect(this.sfxBus);
            sh.start(t + 0.22 + i * 0.04); sh.stop(t + 0.57);
        }
        // Sub-thump at start for impact
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t);
        sub.frequency.exponentialRampToValueAtTime(55, t + 0.10);
        this._envOn(subG, 0.22, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.16);
    }

    // R566o: per-weapon pickup voices. Each is ~0.4-0.6s.

    // MG pickup — mechanical chunk + cocking-bolt rack
    _pickupWeaponMg(t) {
        // Magazine slap — quick lowpass thud
        this._noise(t, 0.30, 0.06, 600, 'lp', 1.5);
        // Bolt rack — square click sequence
        this._tonal(t + 0.08, 'square', 380, 220, 0.10, 0.06);
        this._tonal(t + 0.18, 'square', 280, 180, 0.12, 0.08);
        // Confirm chime — single bright note
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(880, t + 0.24);
        this._envOn(g, 0.18, t + 0.24);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
        o.connect(g).connect(this.sfxBus);
        o.start(t + 0.24); o.stop(t + 0.46);
    }

    // Shotgun pickup — shell-eject + pump rack
    _pickupWeaponShotgun(t) {
        // Sub thud
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(95, t);
        sub.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        this._envOn(subG, 0.35, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.18);
        // Shell slide — bandpass noise hiss
        this._noise(t + 0.08, 0.18, 0.10, 2400, 'bp', 2);
        // Pump rack — heavy square clack
        this._tonal(t + 0.20, 'square', 240, 130, 0.14, 0.10);
        // Confirm chime — low triangle note (matches shotgun's weight)
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(523, t + 0.30);
        this._envOn(g, 0.18, t + 0.30);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o.connect(g).connect(this.sfxBus);
        o.start(t + 0.30); o.stop(t + 0.57);
    }

    // Chainsaw pickup — brief engine sputter
    _pickupWeaponChainsaw(t) {
        // Sputter — sawtooth growl with quick wobble
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(120, t);
        o.frequency.linearRampToValueAtTime(180, t + 0.06);
        o.frequency.linearRampToValueAtTime(100, t + 0.12);
        o.frequency.linearRampToValueAtTime(160, t + 0.18);
        o.frequency.linearRampToValueAtTime(110, t + 0.30);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 1200;
        this._envOn(g, 0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.36);
        // Confirm chime — bright triangle
        const c = this.ctx.createOscillator(); const cg = this.ctx.createGain();
        c.type = 'triangle';
        c.frequency.setValueAtTime(987, t + 0.36);
        this._envOn(cg, 0.18, t + 0.36);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        c.connect(cg).connect(this.sfxBus);
        c.start(t + 0.36); c.stop(t + 0.57);
    }

    // BFG pickup — ominous hum-charge + bright confirm
    _pickupWeaponBfg(t) {
        // Light music duck — BFG pickup is a big moment
        this.duck(0.05, 0.35, 0.5, 0.5);
        // Low ominous hum — sine pitching UP slowly (charging up)
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(55, t);
        o.frequency.exponentialRampToValueAtTime(220, t + 0.40);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 800;
        this._envOn(g, 0.35, t);
        g.gain.linearRampToValueAtTime(0.35, t + 0.30);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.52);
        // Detuned partner for ominous dissonance
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'sawtooth';
        o2.frequency.setValueAtTime(58, t);
        o2.frequency.exponentialRampToValueAtTime(233, t + 0.40);
        const filt2 = this.ctx.createBiquadFilter();
        filt2.type = 'lowpass'; filt2.frequency.value = 800;
        this._envOn(g2, 0.20, t);
        g2.gain.linearRampToValueAtTime(0.20, t + 0.30);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
        o2.connect(filt2).connect(g2).connect(this.sfxBus);
        o2.start(t); o2.stop(t + 0.52);
        // Bright confirm chime at the top — triangle pad
        const c = this.ctx.createOscillator(); const cg = this.ctx.createGain();
        c.type = 'triangle';
        c.frequency.setValueAtTime(1047, t + 0.42);  // C6
        this._envOn(cg, 0.25, t + 0.42);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.80);
        c.connect(cg).connect(this.sfxBus);
        c.start(t + 0.42); c.stop(t + 0.82);
    }

    // LASER pickup — sci-fi zap + crystal ping
    _pickupWeaponLaser(t) {
        // Quick zap chirp — saw climbing fast
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(800, t);
        o.frequency.exponentialRampToValueAtTime(2400, t + 0.08);
        this._envOn(g, 0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.12);
        // Crystal ping — bright sine
        const c = this.ctx.createOscillator(); const cg = this.ctx.createGain();
        c.type = 'sine';
        c.frequency.setValueAtTime(2349, t + 0.10);  // D7
        this._envOn(cg, 0.20, t + 0.10);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
        c.connect(cg).connect(this.sfxBus);
        c.start(t + 0.10); c.stop(t + 0.42);
        // Fifth above for sci-fi feel
        const c2 = this.ctx.createOscillator(); const cg2 = this.ctx.createGain();
        c2.type = 'sine';
        c2.frequency.setValueAtTime(3520, t + 0.14);  // A7
        this._envOn(cg2, 0.10, t + 0.14);
        cg2.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        c2.connect(cg2).connect(this.sfxBus);
        c2.start(t + 0.14); c2.stop(t + 0.44);
    }

    // FLAME pickup — gas hiss + ignite WHOOMP
    _pickupWeaponFlame(t) {
        // Gas hiss — sustained bandpass noise
        this._noise(t, 0.22, 0.18, 1800, 'bp', 2.5);
        // WHOOMP ignite — sub thump + bright noise crack
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(120, t + 0.16);
        sub.frequency.exponentialRampToValueAtTime(45, t + 0.30);
        this._envOn(subG, 0.45, t + 0.16);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t + 0.16); sub.stop(t + 0.36);
        this._noise(t + 0.16, 0.30, 0.10, 3800, 'hp', 1.5);
        this._noise(t + 0.18, 0.20, 0.20, 600, 'lp', 1.4);
        // Confirm — warm low triangle (flame is orange/warm)
        const c = this.ctx.createOscillator(); const cg = this.ctx.createGain();
        c.type = 'triangle';
        c.frequency.setValueAtTime(440, t + 0.32);
        this._envOn(cg, 0.18, t + 0.32);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        c.connect(cg).connect(this.sfxBus);
        c.start(t + 0.32); c.stop(t + 0.57);
    }

    // THUNDER pickup — capacitor charge + spark pop
    _pickupWeaponThunder(t) {
        // Capacitor whine — saw climbing
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(1800, t + 0.18);
        this._envOn(g, 0.15, t);
        g.gain.linearRampToValueAtTime(0.20, t + 0.16);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.24);
        // Spark POP — bright HPF crack
        this._noise(t + 0.18, 0.30, 0.06, 5200, 'hp', 1.5);
        // Crackle tail
        this._noise(t + 0.22, 0.12, 0.10, 3200, 'bp', 3);
        // Confirm — bright triangle ping
        const c = this.ctx.createOscillator(); const cg = this.ctx.createGain();
        c.type = 'triangle';
        c.frequency.setValueAtTime(1320, t + 0.28);  // E6
        this._envOn(cg, 0.18, t + 0.28);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
        c.connect(cg).connect(this.sfxBus);
        c.start(t + 0.28); c.stop(t + 0.52);
    }

    // HOMING pickup — radar-lock chime
    _pickupWeaponHoming(t) {
        // Lock-on chirp — square pitching up in steps
        this._tonal(t,        'square', 600, 600, 0.04, 0.05);
        this._tonal(t + 0.08, 'square', 800, 800, 0.04, 0.05);
        this._tonal(t + 0.16, 'square', 1100, 1100, 0.06, 0.05);
        // Lock confirm — sustained higher note
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(1568, t + 0.24);  // G6
        this._envOn(g, 0.22, t + 0.24);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o.connect(g).connect(this.sfxBus);
        o.start(t + 0.24); o.stop(t + 0.57);
        // Sub thump on lock for satisfaction
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t + 0.24);
        sub.frequency.exponentialRampToValueAtTime(50, t + 0.34);
        this._envOn(subG, 0.20, t + 0.24);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t + 0.24); sub.stop(t + 0.38);
    }

    // SPREAD pickup — triple-burst tease (preview of the spread fire)
    _pickupWeaponSpread(t) {
        // Three quick light gunshot-style ticks
        for (let i = 0; i < 3; i++) {
            const st = t + i * 0.06;
            this._noise(st, 0.18, 0.04, 1400, 'bp', 2);
            const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(90, st);
            sub.frequency.exponentialRampToValueAtTime(40, st + 0.06);
            this._envOn(subG, 0.18, st);
            subG.gain.exponentialRampToValueAtTime(0.001, st + 0.08);
            sub.connect(subG).connect(this.sfxBus);
            sub.start(st); sub.stop(st + 0.10);
        }
        // Confirm chime
        const c = this.ctx.createOscillator(); const cg = this.ctx.createGain();
        c.type = 'triangle';
        c.frequency.setValueAtTime(784, t + 0.22);
        this._envOn(cg, 0.18, t + 0.22);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        c.connect(cg).connect(this.sfxBus);
        c.start(t + 0.22); c.stop(t + 0.47);
    }

    // R566p: PAUSE ENTER — descending whoosh + low sub thump. "World
    // receding" — fast attack, lowpass sweep down, brief sub at the end
    // as time stops. 0.25s. Distinct from the generic UI 'pause' click.
    _pauseEnter(t) {
        // Whoosh — bandpass noise descending 3000→400Hz
        const dur = 0.22;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(3000, t);
        filt.frequency.exponentialRampToValueAtTime(400, t + dur);
        filt.Q.value = 2;
        const g = this.ctx.createGain();
        this._envOn(g, 0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
        // Sub thump at the end — time stops
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t + 0.10);
        sub.frequency.exponentialRampToValueAtTime(45, t + 0.22);
        this._envOn(subG, 0.25, t + 0.10);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t + 0.10); sub.stop(t + 0.28);
    }

    // R566p: PAUSE EXIT — rising whoosh, sub-thump at start. "World
    // resuming" — sub kick first, then noise sweep up. Mirror of enter.
    _pauseExit(t) {
        // Sub kick at start — time restarts
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(45, t);
        sub.frequency.exponentialRampToValueAtTime(110, t + 0.10);
        this._envOn(subG, 0.30, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.16);
        // Rising whoosh — bandpass noise climbing 400→3000Hz
        const dur = 0.22;
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(400, t + 0.04);
        filt.frequency.exponentialRampToValueAtTime(3000, t + 0.04 + dur);
        filt.Q.value = 2;
        const g = this.ctx.createGain();
        this._envOn(g, 0.22, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04 + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t + 0.04); src.stop(t + 0.04 + dur + 0.02);
    }

    // R566p: HUD LOW AMMO — sharp warning click. Fires once when ammo
    // crosses below a threshold. Mechanical empty-ish click + brief
    // bright tone so it cuts through gunfire.
    _hudLowAmmo(t) {
        // Mechanical click
        this._tonal(t, 'square', 480, 280, 0.10, 0.06);
        // Warning bell — brief bright triangle
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(1318, t + 0.04);  // E6
        this._envOn(g, 0.14, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        o.connect(g).connect(this.sfxBus);
        o.start(t + 0.04); o.stop(t + 0.22);
    }

    // R566p: HUD WEAPON CYCLE — mechanical ratchet for weapon switch.
    // Tab/Q in Doom-mode or 1/2/3/4 number keys. Was reusing 'select'
    // (UI menu blip) — now sounds like an actual weapon-wheel rotation.
    _hudWeaponCycle(t) {
        // Short metallic ratchet — square click + bright noise tick
        this._tonal(t, 'square', 380, 260, 0.08, 0.05);
        this._noise(t, 0.10, 0.04, 2400, 'bp', 3);
        // Confirm — small sub pulse
        const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, t);
        sub.frequency.exponentialRampToValueAtTime(60, t + 0.05);
        this._envOn(subG, 0.10, t);
        subG.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        sub.connect(subG).connect(this.sfxBus);
        sub.start(t); sub.stop(t + 0.09);
    }

    // R566q: CHAINSAW IDLE — quiet sustained sputter played when chainsaw
    // is equipped but not actively cutting. Lower-gain version of the rev
    // synth, designed to be re-fired every ~30 frames for a continuous
    // running-engine feel. Without this, the chainsaw is silent between
    // cuts which breaks the "engine running" illusion.
    _chainsawIdle(t) {
        // Quiet sawtooth growl at idle frequency (lower than active rev)
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        const baseF = 75 + Math.random() * 20;     // idle is deeper than rev
        o.frequency.setValueAtTime(baseF, t);
        o.frequency.linearRampToValueAtTime(baseF * 1.15, t + 0.18);
        o.frequency.linearRampToValueAtTime(baseF * 0.95, t + 0.36);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 700;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);   // much quieter
        g.gain.linearRampToValueAtTime(0.10, t + 0.32);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.40);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.42);
        // Faint grinding noise layer
        const n = this.ctx.createBufferSource();
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.36, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
        n.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200;
        bp.Q.value = 2;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
        ng.gain.linearRampToValueAtTime(0.05, t + 0.32);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        n.connect(bp).connect(ng).connect(this.sfxBus);
        n.start(t); n.stop(t + 0.38);
    }

    // R566p: dynamic music-intensity helper. Boss fights = action peaks,
    // so we want the music to recede slightly to make room for SFX. Set
    // intensity 'high' during boss fights, 'normal' otherwise. The
    // existing duck() depth is multiplied by this factor.
    setMusicIntensity(level) {
        // 'normal' = baseline, 'high' = music pushed down 30% relative to
        // baseline (so SFX hits feel bigger during action). Also tightens
        // the master compressor for more pumping feel.
        if (!this._musicMakeup || !this._musicComp) return;
        const t = this.ctx.currentTime;
        if (level === 'high') {
            // Pull music down, push comp harder
            this._musicMakeup.gain.linearRampToValueAtTime(0.95, t + 0.5);
            this._musicComp.threshold.linearRampToValueAtTime(-16, t + 0.5);
            this._musicComp.ratio.linearRampToValueAtTime(5, t + 0.5);
        } else {
            // Restore baseline
            this._musicMakeup.gain.linearRampToValueAtTime(1.35, t + 0.5);
            this._musicComp.threshold.linearRampToValueAtTime(-10, t + 0.5);
            this._musicComp.ratio.linearRampToValueAtTime(3, t + 0.5);
        }
    }

    // R566l: DISTANT GUNFIRE — far-off bullet cracks (heavily lowpassed,
    // softer than enemyShoot). Adds the "fight happening elsewhere"
    // atmospheric layer to corridor levels.
    _distantGunfire(t) {
        // 2-3 staggered shots
        const shots = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < shots; i++) {
            const st = t + i * (0.08 + Math.random() * 0.06);
            // Lowpassed gunshot — far away
            this._noise(st, 0.14, 0.08, 600, 'lp', 1.4);
            // Faint sub thump
            const sub = this.ctx.createOscillator(); const subG = this.ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(70, st);
            sub.frequency.exponentialRampToValueAtTime(35, st + 0.05);
            this._envOn(subG, 0.10, st);
            subG.gain.exponentialRampToValueAtTime(0.001, st + 0.07);
            sub.connect(subG).connect(this.sfxBus);
            sub.start(st); sub.stop(st + 0.09);
        }
    }

    // R566l: WATER DRIP — single drop. Tiny lowpass body + bright tonal
    // ping for the surface tension break.
    _waterDrip(t) {
        // Body — short lowpass noise
        this._noise(t, 0.06, 0.04, 800, 'lp', 1.5);
        // Surface tension ping — bright sine pitch-up then down
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1800, t);
        o.frequency.exponentialRampToValueAtTime(2400, t + 0.02);
        o.frequency.exponentialRampToValueAtTime(900, t + 0.10);
        this._envOn(g, 0.10, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.14);
    }

    // R566l: WIND HOWL — sustained low whistle through ducts/cracks.
    // Bandpass noise with slow filter sweep + sine moan underneath.
    _windHowl(t) {
        const dur = 1.4;
        // Bandpass noise body — slow Q-modulated sweep
        const buf = this.ctx.createBuffer(1, (this.ctx.sampleRate * dur) | 0, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(350, t);
        filt.frequency.linearRampToValueAtTime(600, t + 0.6);
        filt.frequency.linearRampToValueAtTime(350, t + dur);
        filt.Q.value = 8;
        const g = this.ctx.createGain();
        this._envOn(g, 0.18, t);
        g.gain.linearRampToValueAtTime(0.18, t + dur - 0.4);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt).connect(g).connect(this.sfxBus);
        src.start(t); src.stop(t + dur + 0.02);
        // Low sine moan underneath
        const o = this.ctx.createOscillator(); const og = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t);
        o.frequency.linearRampToValueAtTime(140, t + 0.6);
        o.frequency.linearRampToValueAtTime(95, t + dur);
        this._envOn(og, 0.08, t);
        og.gain.linearRampToValueAtTime(0.08, t + dur - 0.4);
        og.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(og).connect(this.sfxBus);
        o.start(t); o.stop(t + dur + 0.02);
    }

    // R566l: ELECTRICAL SPARK — quick zap-and-crackle. Short bright noise
    // crack + a small tonal zap chirp. Good for server rooms, doom corridors.
    _electricalSpark(t) {
        // Bright crack — HPF noise burst
        this._noise(t, 0.22, 0.04, 4400, 'hp', 2);
        // Zap chirp — saw pitch-up tone
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(2400, t);
        o.frequency.exponentialRampToValueAtTime(4800, t + 0.03);
        this._envOn(g, 0.10, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + 0.08);
        // Tiny noise crackle tail
        this._noise(t + 0.04, 0.08, 0.06, 2800, 'bp', 3);
    }

    // R566l: METAL CREAK — building/structure groaning under stress.
    // Low slow saw with pitch wobble + bandpass noise scrape.
    _metalCreak(t) {
        const dur = 0.8;
        // Low groan — sawtooth with slow pitch wobble
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(90, t);
        o.frequency.linearRampToValueAtTime(120, t + 0.3);
        o.frequency.linearRampToValueAtTime(80, t + 0.6);
        o.frequency.linearRampToValueAtTime(95, t + dur);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 500;
        this._envOn(g, 0.16, t);
        g.gain.linearRampToValueAtTime(0.16, t + dur - 0.2);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(filt).connect(g).connect(this.sfxBus);
        o.start(t); o.stop(t + dur + 0.02);
        // Scrape noise — bandpass with high Q for metallic friction
        this._noise(t + 0.1, 0.08, 0.50, 1800, 'bp', 5);
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
        // R566q: equal-power crossfade — perceived loudness stays constant
        // across the transition. Default 600ms (was linear 350ms which felt
        // abrupt and could dip in the middle when both tracks were ramping).
        // Equal-power uses sine-in / cosine-out curves: gain follows
        // sin(t·π/2) for the new track and cos(t·π/2) for the old, so
        // (sin² + cos²) = 1 holds across the transition. Sounds smoother
        // than linear especially for stems with sustained content.
        const FADE_S = 0.6;
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        if (this.ctx && this._fileEl && this._fileGainNode) {
            const now = this.ctx.currentTime;
            const node = this._fileGainNode;
            const el = this._fileEl;
            try {
                node.gain.cancelScheduledValues(now);
                node.gain.setValueAtTime(node.gain.value, now);
                // Build a cosine curve (1→0) for equal-power fade-out.
                // Web Audio doesn't have setValueCurveAtTime everywhere
                // reliably, so we sample the curve with linear ramps.
                const STEPS = 24;
                const startVal = node.gain.value;
                for (let i = 1; i <= STEPS; i++) {
                    const f = i / STEPS;
                    const v = startVal * Math.cos(f * Math.PI / 2);
                    node.gain.linearRampToValueAtTime(Math.max(0.0001, v), now + FADE_S * f);
                }
            } catch (e) {}
            setTimeout(() => {
                try { el.pause(); } catch (e) {}
                try { node.disconnect(); } catch (e) {}
            }, FADE_S * 1000 + 50);
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
                // R566q: equal-power sine-in curve (was linear). Pairs with
                // the cosine-out fade-out in playTrack so the perceived
                // loudness stays constant across the crossfade.
                const STEPS = 24;
                const now = this.ctx.currentTime;
                for (let i = 1; i <= STEPS; i++) {
                    const f = i / STEPS;
                    const v = targetGain * Math.sin(f * Math.PI / 2);
                    node.gain.linearRampToValueAtTime(v, now + fadeIn * f);
                }
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

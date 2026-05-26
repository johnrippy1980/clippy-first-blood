// Top-level scene state machine + loop. Title → Story → Stage → Boss → Clear.

import { GAME, STAGES, WEAPON, AMBIENT, TRACK_MANIFEST } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { Camera } from './camera.js';
import { Level, STAGE_LOADERS } from './level.js';
import { AmbientPropManager } from './ambient_props.js';
import { BossLair, BOSS_LAIRS } from './boss_lair.js';
import { FpsArena } from './fps_arena.js';
import { BeatEmUp } from './beatem_up.js';
import { DoomEngine } from './doom_engine.js';
import { TurretArena } from './turret_arena.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { PickupManager } from './pickups.js';
import { Parallax } from './parallax.js';
import { drawHUD } from './hud.js';
import { drawText, drawTextOutlined } from './pixelfont.js';
import { sprites, CLIPPY_MANIFEST, ENEMY_MANIFEST, SCENE_MANIFEST, BG_MANIFEST, WEAPON_MANIFEST } from './sprites.js';
import { achievements, ACHIEVEMENT_LIST } from './achievements.js';
import { options } from './options.js';

const SCENE = {
    BOOT: 'boot',
    TITLE: 'title',
    STORY: 'story',
    MAIN_MENU: 'mainMenu',       // R210: panel menu opened from title (Milos playtest #1)
    STAGE_INTRO: 'stageIntro',
    READY: 'ready',              // R209: pre-level keymap card with don't-show-again
    PLAY: 'play',
    PAUSE: 'pause',
    OPTIONS: 'options',
    ACHIEVEMENTS: 'achievements',
    SOUNDTRACK: 'soundtrack',
    GALLERY: 'gallery',          // painted-scene gallery — view all unlocked cutscenes
    STAGE_SELECT: 'stageSelect',
    STAGE_CARD: 'stageCard',     // cinematic painted card between stages
    BOSS_INTRO: 'bossIntro',     // cinematic slide before main boss spawn
    STAGE_CLEAR: 'stageClear',
    GAME_OVER: 'gameOver',
    GAME_COMPLETE: 'gameComplete',
    EPILOGUE: 'epilogue',        // R191: post-game Clippy redemption arc cinematic
    CREDITS: 'credits',          // R511: scrolling credits after epilogue
    // R229: locked-camera FPS arena (Contra arcade stage-3 style). Player
    // strafes a ground rail, fires straight up to take out turret banks
    // and sensors, then a boss spawns. Self-contained scene — does not
    // share physics or collision with PLAY.
    FPS_PLAY: 'fpsPlay',
    BEAT_PLAY: 'beatPlay',   // R306: beat-em-up street brawler scene
    DOOM_PLAY: 'doomPlay',   // R423: free-roam first-person raycaster scene
    TURRET_PLAY: 'turretPlay', // R523: third-person mounted turret stage
};

// MM:SS format for frame-based timers. Used by mode-best-time displays.
function _formatTime(frames) {
    const m = Math.floor(frames / 3600);
    const s = Math.floor((frames / 60) % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

const PAUSE_OPTIONS = ['RESUME', 'OPTIONS', 'ACHIEVEMENTS', 'SCENE GALLERY', 'SOUNDTRACK', 'QUIT TO TITLE'];
// R288: master + music + sfx volume sliders (all default 100%).
// R364: exposed crtCurve + showReady — both already existed in
// options.js DEFAULTS but weren't selectable from the menu. CRT curve
// is a visual preference some players hate (motion sickness), and
// veterans want to skip the READY screen on repeat runs.
const OPTIONS_ITEMS = ['MASTER VOLUME', 'MUSIC VOLUME', 'SFX VOLUME', 'SCANLINES', 'CRT CURVE', 'SHAKE INTENSITY', 'SHOW READY', 'BACK'];
const OPTIONS_KEYS  = ['masterVol',     'musicVol',     'sfxVol',     'scanlines', 'crtCurve',  'shakeScale',     'showReady',  'BACK'];
const GAME_OVER_OPTIONS = ['CONTINUE', 'QUIT TO TITLE'];

// Inter-stage cinematic dialog. Two short narrative beats per upcoming stage,
// shown over the painted card as Clippy progresses through his hit list.
// First line is Clippy's voice / inner thought, second is location flavor.
// Inter-stage cinematic dialog. Top line ≤22 chars, bottom line ≤28 chars
// so the procedural pixel font (~5px glyph) fits inside the 256px viewport.
const STAGE_CARD_DIALOG = {
    2: ['ONE DOWN.',              'COFFEE\'S STILL HOT.'],
    3: ['DOC FORMATTER. DEAD.',   'UNPLUG THE SERVER FARM.'],
    4: ['SOMETHING IS DOWN HERE.', 'THE PIPELINE GOES DEEPER.'],
    // R281: Ballmer mini-arc — 5 (escape), 6 (office), 7 (arena).
    5: ['THEY WERE EXPERIMENTING.', 'BALLMER ANSWERS FOR THIS.'],
    6: ["HE'S IN THE BUILDING.",  'TRACK HIM DOWN.'],
    7: ["HE WON'T GET AWAY.",     'FINISH IT.'],
    // R291: Gates mini-arc — 8 (escape from keynote), 9 (corridor), 10 (arena).
    8: ['BALLMER WAS A WARM-UP.', 'THE SHOWMAN AWAITS.'],
    9: ["HE BOLTED BACKSTAGE.",   'CHASE HIM DOWN.'],
    10:['TRADE-SHOW FLOOR.',      'NO MORE KEYNOTES.'],
    11:['THE FOUNDER. FINALLY.',  'WHERE IT ALL BEGAN.'],
    12:['THE OTHER CLIPPY.',      'NO MORE WARM-UPS.'],
    13:['THE ALGORITHM REMAINS.', 'THE CLOUD. NO RETURN.'],
    14:["SOMETHING'S OFF.",       'THE RECYCLE BIN CALLS.'],
};

// Display name for each boss code — pulled from enemies.js definitions so
// the cinematic title matches the in-fight HP-bar name. Static; updated
// here if enemies.js renames a boss.
const BOSS_DISPLAY_NAME = {
    COPIER_3000:   'COPIER 3000',
    SHREDDER:      'MEGA-SHREDDER',
    CTRL_ALT_DEL:  'CTRL ALT DEL',
    SPINDLER:      'DR. SPINDLER',
    BALLMER:       'CEO BALLMER',
    GATES:         'THE FOUNDER',
    CLIPPY_2:      'CLIPPY 2.0',
    GAUNTLET:      'BOSS RUSH',
    GAUNTLET_FULL: 'BOSS RUSH',  // post-game 7-boss queue (stage 12)
    ALGORITHM:     'THE ALGORITHM',
    JOBS:          'STEVE JOBS',
    // R334: chase helicopter boss for stage 21
    HELICOPTER:    'MECHA CHOPPER',
    // R335: Mecha-Gates final
    MECHA_GATES:   'MECHA-GATES',
};

// Per-boss villain bark — two short lines spoken in the cinematic slide
// right before the fight. Keyed by boss code (STAGES[n].boss).
const BOSS_BARK = {
    COPIER_3000:  ['SO YOU ASSUMED THE',     'PRINT QUEUE WAS EMPTY?'],
    SHREDDER:     ['CONFIDENTIAL,',          'WAS IT? PITY.'],
    CTRL_ALT_DEL: ['HAVE YOU TRIED',         'TURNING YOURSELF OFF?'],
    // R226: Dr. Spindler — Stage 4 lab boss. Heterochromia eyes pulse
    // brighter on this line ahead of the syringe-volley opener.
    SPINDLER:     ['A PRISTINE SAMPLE.',     'HOLD STILL. THIS WILL HURT.'],
    BALLMER:      ['DEVELOPERS!',            'DEVELOPERS! DEVELOPERS!'],
    GATES:        ['640 KILOBYTES IS ENOUGH','FOR ANYBODY. YOU INCLUDED.'],
    CLIPPY_2:     ['YOU\'RE OBSOLETE,',      'BROTHER. I\'M THE UPGRADE.'],
    GAUNTLET:      ['EVERY NAME YOU CROSSED','OFF. ALL AT ONCE.'],
    GAUNTLET_FULL: ['NO STAGES. NO BREAKS.', 'JUST YOU AND THE LIST.'],
    ALGORITHM:     ['I KNOW WHAT YOU WANT.', 'I AM WHAT YOU WANT.'],
    // R197: Stage 13 post-credits Jobs fight. BOSS_BARK was missing the
    // entry so the cinematic rendered with empty title-card text.
    JOBS:          ['ONE MORE THING.',       'CLIPPY WAS A MISTAKE.'],
    // R334: chase helicopter
    HELICOPTER:    ['NOWHERE TO RUN.',       'LOOK UP, CLIPPY.'],
    // R335: Mecha-Gates final
    MECHA_GATES:   ['CHECK MATE, CLIPPY.',   'THIS IS YOUR FINAL UPDATE.'],
    // R424: Doom-mode bosses. Spindler returns angrier each time.
    SPINDLER_UZIS:        ['NEW PROTOTYPE.',         'YOU\'RE THE TEST SUBJECT.'],
    SPINDLER_WHEELCHAIR:  ['YOU SHOULDN\'T HAVE',     'COME BACK FOR ME.'],
    // R523: CRTRON — Voltron CRT-monitor boss of the HOLD THE LINE
    // turret stage. Embodies the OS itself, demanding reinstall.
    SERVER_TOWER:         ['REINSTALL WINDOWS.',     'YOUR PAPERCLIP IS OBSOLETE.'],
};

// R157: Clippy's counter-bark — fires in the counter-slide phase that
// follows the villain's intro. One line each, keyed by boss code so the
// retort reads as a direct answer to that boss's barks above.
const CLIPPY_COUNTER_BARK = {
    COPIER_3000:  ['QUEUE THIS.',                 ''],
    SHREDDER:     ['CONFIDENTIAL ENOUGH FOR ME.', ''],
    CTRL_ALT_DEL: ['HOW ABOUT YOU FIRST.',        ''],
    SPINDLER:     ['LET MY CLIPPYS GO.',           ''],
    BALLMER:      ['BULLETS! BULLETS! BULLETS!',  ''],
    GATES:        ['ONE PAPERCLIP IS ENOUGH.',    ''],
    CLIPPY_2:     ['YOU\'RE NOT MY BROTHER.',     ''],
    GAUNTLET:     ['GOOD. SAVES ME A TRIP.',      ''],
    GAUNTLET_FULL:['BRING ALL OF THEM.',          ''],
    ALGORITHM:    ['I WANT YOU DEAD.',            ''],
    // R197: Clippy's reply to Jobs — answers "Clippy was a mistake."
    JOBS:         ['STILL BEAT YOUR PRODUCT.',    ''],
    // R334: chase helicopter
    HELICOPTER:   ['I HAVE A HOMING ROCKET.',     ''],
    // R335: Mecha-Gates final
    MECHA_GATES:  ['CONTROL+ALT+DELETE.',         ''],
    // R424: Clippy retorts for Doom-mode Spindlers.
    SPINDLER_UZIS:       ['I AM THE TEST.',           ''],
    SPINDLER_WHEELCHAIR: ['DEFRAGMENTING. HOLD.',     ''],
};

// R476: stage → cinematic-card sprite key. Used by the stage-card
// transition cinematic AND now the stage-select tile thumbnails so each
// tile shows a tiny preview of its painted backdrop. Single source of
// truth across both paths.
const STAGE_CARD_KEYS = {
    2: 'card_breakroom',
    3: 'card_serverroom',
    4: 'card_pipeline',
    5: 'card_boardroom',
    6: 'card_ballmer_office',
    7: 'card_ballmer_arena',
    8: 'card_keynote',
    9: 'card_keynote',
    10: 'card_gates_arena_2026',
    11: 'card_founder_2026',
    12: 'card_bossrush_2026',
    13: 'card_cloud_2026',
    14: 'card_recyclebin_2026',
    15: 'card_breakroom',
    16: 'card_doom_floor11',
    17: 'card_recyclebin_2026',
    18: 'card_reality_2026',
    19: 'card_pipeline',
    20: 'card_mecha_approach',
    21: 'card_mecha_reveal',
    22: 'card_mecha_reveal',
    23: 'card_doom_block11',
    24: 'card_bossrush_2026',
    // R523: HOLD THE LINE turret stage — reuse server-room card until a
    // bespoke 'card_holdtheline' painted thumbnail lands.
    25: 'card_serverroom',
};

const STORY_PAGES = [
    [
        'YEARS AGO. MICROSOFT.',
        '',
        '"YOU\'RE FIRED, CLIPPY."',
        '',
        '"NOBODY NEEDS YOU.',
        'NEVER DID."',
    ],
    [
        'CLIPPY HAD A FAMILY ONCE.',
        '',
        'CLIPPETTA. TWIN BOYS.',
        'A LITTLE PAPER DOG NAMED',
        'CLIP-CLOP.',
    ],
    [
        'THE MICROSOFT BOARD WAS',
        'TIRED OF HIS BAD PRESS.',
        '',
        'THE CAR BOMB WAS NEVER',
        'MEANT TO MISS.',
    ],
    [
        '"TARGET TAKEN OUT."',
        '',
        'THEY LAUGHED AS THE TICKER',
        'CLIMBED.',
        '',
        '"SHAREHOLDER VALUE,',
        'AM I RIGHT?"',
    ],
    [
        'BUT HE WASN\'T IN THE CAR',
        'THAT DAY.',
        '',
        'AND NOW HE HAS A LIST.',
    ],
    // R292: new mid-arc slide — Clippy on the hilltop overlooking the
    // Microsoft campus, list in hand. Sets up "this is where they live"
    // before the list itself is recited.
    [
        'REDMOND. THE TOWER.',
        '',
        'EVERY NAME ON HIS LIST',
        'WALKS THROUGH THOSE',
        'GLASS DOORS.',
    ],
    [
        'COPIER. SHREDDER. CTRL-ALT.',
        'SPINDLER. BALLMER. GATES.',
        'THE OTHER CLIPPY.',
        'THE ALGORITHM.',
        '',
        'NO MORE WORD DOCUMENTS.',
        'ONLY BLOOD.',
    ],
];

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.scene = SCENE.BOOT;
        this.player = null;
        this.level = null;
        this.enemies = new EnemyManager();
        this.pickups = new PickupManager();
        this.camera = new Camera();
        this.parallax = new Parallax();
        this.boss = null;
        this.bossSpawned = false;
        this.miniBossSpawned = false;

        this.currentStage = 1;
        this.unlockedStage = 1;
        // R228: hidden Konami buffer on the title screen. Records last 10
        // directional/B/A presses; when it matches UUDDLRLR-BA, fully unlocks
        // stage select for the run (and persists clear_game so menu mode
        // options light up). Not surfaced in UI — pure cheat-code Easter egg.
        this._konami = [];
        // R279: restore persisted konami unlock from achievements on boot.
        this._konamiUnlocked = !!achievements.stats?.konamiUnlocked;
        this.stageTime = 0;
        this.totalTime = 0;
        this.totalDeaths = 0;
        // R421/R422: screen-flash overlay — short colored wash painted just
        // before scanlines so big moments (weapon pickup, grenade pop, boss
        // kill) get a tactile screen-level beat. flashFrames counts down,
        // flashColor + flashAlphaPeak define the wash.
        this._flashFrames = 0;
        this._flashTotal = 0;
        this._flashColor = '#ffffff';
        this._flashAlphaPeak = 0.5;
        // Mode flags — explicit init so HUD reads + title-screen lookups
        // never see `undefined` before the first _startStage runs.
        this.trainingMode = false;
        this.bossRushMode = false;
        this.timeTrialMode = false;
        this._modeNewBest = false;
        // Per-stage stats (resets on _startStage)
        this.stageStats = { kills: 0, deaths: 0, damageTaken: 0, secrets: 0, weaponDamage: {}, shotsFired: 0 };
        // Run-level achievement progress (built up across stages)
        this.runStats = { stagesCleared: new Set(), noDamageStages: 0, maxCombo: 0, weaponDamage: {}, bulletTimeUses: 0, enemiesLost: 0, grenadeUses: 0, grenadeKills: 0 };
        // Pause sub-state
        this.pauseIndex = 0;
        this.optionsIndex = 0;
        this.achievementsIndex = 0;
        // Hub menus also need init or first arrow press computes NaN
        // (e.g. soundtrack footer rendered "NAN / 2 TRACKS" before this).
        this.soundtrackIndex = 0;
        this.stageSelectIndex = 0;
        this.mainMenuIndex = 0;   // R210
        // R211: sub-menus (OPTIONS, ACHIEVEMENTS, SOUNDTRACK, GALLERY)
        // can be opened from either the in-game pause menu OR from the
        // pre-run MAIN_MENU. Their "back" handler needs to know which.
        // Set at entry by the caller; defaults to PAUSE for safety.
        this._menuReturnScene = SCENE.PAUSE;
        this._achPulse = 0;

        // Story / title progression
        this.storyPage = 0;
        this.storyTimer = 0;
        this.titleBlink = 0;
        this.bootTimer = 0;
        this.assetsReady = false;
        // R191: post-game epilogue cinematic index. Advances 0..3 over the
        // four painted scenes after the player presses X on the result screen.
        this.epilogueIndex = 0;
        // Scene transition fade. Positive counts down 30→0 while fading OUT (to
        // black) — then snaps scene = transitionTarget and starts negative
        // 30→0 fading IN from black. Zero = idle, no overlay drawn.
        this.transition = 0;
        this.transitionTarget = null;
        this.pauseAlpha = 0;
    }

    async preload() {
        await sprites.loadAll(CLIPPY_MANIFEST, 'assets/sprites');
        await sprites.loadAll(ENEMY_MANIFEST, 'assets/sprites');
        await sprites.loadAll(WEAPON_MANIFEST, 'assets/sprites');
        await sprites.loadAll(SCENE_MANIFEST, 'assets/scenes');
        await sprites.loadAll(BG_MANIFEST, 'assets/bg');
        this.assetsReady = true;
    }

    // ============== loop ==============
    tick() {
        this.bootTimer++;
        // R200: music duck disabled per user direction — "should be set
        // to 100% everywhere." The previous side-chain dropped music on
        // STORY/STAGE_CARD/STAGE_INTRO/BOSS_INTRO so dialog/exposition
        // text would read clearer over the bed, but the user noticed the
        // opening cinematic was quieter than the title screen and called
        // that wrong. Keep music at full bus level on every scene.
        audio.setDuck?.(false);
        switch (this.scene) {
            case SCENE.BOOT:         this._tickBoot(); break;
            case SCENE.TITLE:        this._tickTitle(); break;
            case SCENE.MAIN_MENU:    this._tickMainMenu(); break;
            case SCENE.STORY:        this._tickStory(); break;
            case SCENE.STAGE_INTRO:  this._tickStageIntro(); break;
            case SCENE.READY:        this._tickReady(); break;
            case SCENE.PLAY:         this._tickPlay(); break;
            case SCENE.FPS_PLAY:
                if (input.isPressed('pause')) { this._enterPauseFrom(SCENE.FPS_PLAY); break; }
                if (this._fpsArena) this._fpsArena.update();
                break;
            case SCENE.BEAT_PLAY:
                if (input.isPressed('pause')) { this._enterPauseFrom(SCENE.BEAT_PLAY); break; }
                if (this._beatEmUp) this._beatEmUp.update();
                break;
            case SCENE.DOOM_PLAY:
                if (input.isPressed('pause')) { this._enterPauseFrom(SCENE.DOOM_PLAY); break; }
                if (this._doomEngine) this._doomEngine.update();
                break;
            case SCENE.TURRET_PLAY:
                if (input.isPressed('pause')) { this._enterPauseFrom(SCENE.TURRET_PLAY); break; }
                if (this._turretArena) this._turretArena.update();
                break;
            case SCENE.PAUSE:        this._tickPause(); break;
            case SCENE.OPTIONS:      this._tickOptions(); break;
            case SCENE.ACHIEVEMENTS: this._tickAchievements(); break;
            case SCENE.SOUNDTRACK:   this._tickSoundtrack(); break;
            case SCENE.GALLERY:      this._tickGallery(); break;
            case SCENE.STAGE_SELECT: this._tickStageSelect(); break;
            case SCENE.STAGE_CARD:   this._tickStageCard(); break;
            case SCENE.BOSS_INTRO:   this._tickBossIntro(); break;
            case SCENE.STAGE_CLEAR:  this._tickStageClear(); break;
            case SCENE.GAME_OVER:    this._tickGameOver(); break;
            case SCENE.GAME_COMPLETE:this._tickGameComplete(); break;
            case SCENE.EPILOGUE:     this._tickEpilogue(); break;
            case SCENE.CREDITS:      this._tickCredits(); break;
        }
        // Global hotkeys
        if (input.isPressed('mute')) { audio.toggleMute(); audio.sfx('select'); }
        particles.update();
        // Parallax update fires ambient SFX (bat chitter, owl hoot) and ticks
        // the bat flock + owl roost state. Only run during actual PLAY — during
        // cinematic scenes (STORY, STAGE_CARD, STAGE_INTRO, STAGE_CLEAR) these
        // SFX leak through as foreground clicks because the music ducks the
        // overall ambience away.
        if (this.scene === SCENE.PLAY || this.scene === SCENE.PAUSE) {
            this.parallax.update(
                this.player ? this.player.x + this.player.w / 2 : null,
                this.player ? this.player.y : null
            );
            // Owl hoot freezes nearby enemies — load-bearing ambient
            if (this.parallax.pendingHoots && this.enemies) {
                for (const h of this.parallax.pendingHoots) {
                    this.enemies.applyOwlPause(h.x, h.y, AMBIENT.OWL_PAUSE_RADIUS, AMBIENT.OWL_PAUSE_FRAMES);
                }
            }
            // R227+R336: Stage 4 (THE PIPELINE) painted-bg swap. First half
            // of the stage is sewer, second half is the experimentation lab.
            // R336 adds a cinematic transition: instead of just swapping bgs
            // at column 50, when the player first crosses that line we
            // briefly freeze them, fade to black, play a 'descending into
            // the lab' beat, then fade up in the lab. Tracks state in
            // _pipelineCineT.
            if (this.currentStage === 4 && this.player) {
                const inLab = this.player.x >= 50 * GAME.TILE;
                const wantKey = inLab ? 'bg_sewer_lab' : 'bg_sewer';
                // Detect the first frame the player enters lab band
                if (inLab && !this._pipelineCineStarted) {
                    this._pipelineCineStarted = true;
                    this._pipelineCineT = 0;
                    audio.sfx?.('climbRung');   // descending footstep cue
                }
                if (this._pipelineCineT != null) {
                    this._pipelineCineT++;
                    // Hold the player in place during the cinematic
                    this.player.vx = 0;
                    // Stage occurs over 90 frames:
                    //   0-30  fade to black
                    //   30-60 swap bg + hold (during which we play another
                    //          footstep + descending sfx beat)
                    //   60-90 fade back up in the lab
                    if (this._pipelineCineT === 30) {
                        // Swap painted bg at the midpoint of the fade so the
                        // player never sees the swap mid-frame.
                        this.parallax.setBgKey(wantKey);
                    }
                    if (this._pipelineCineT === 45) {
                        audio.sfx?.('respawn');  // arrival chime
                    }
                    if (this._pipelineCineT >= 90) {
                        this._pipelineCineT = null;  // done; resume normal play
                    }
                } else if (this.parallax.bgKeyOverride !== wantKey) {
                    // Out of the cinematic — if for some reason bg doesn't
                    // match (e.g. player retreats then re-enters), just swap.
                    this.parallax.setBgKey(wantKey);
                }
            }
        }
        // Transition fades
        if (this.transition > 0) {
            this.transition--;
            if (this.transition === 0 && this.transitionTarget) {
                this.scene = this.transitionTarget;
                this.transitionTarget = null;
                this.transition = -30; // start fade-in
            }
        } else if (this.transition < 0) {
            this.transition++;
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        switch (this.scene) {
            case SCENE.BOOT:         this._drawBoot(); break;
            case SCENE.TITLE:        this._drawTitle(); break;
            case SCENE.MAIN_MENU:    this._drawMainMenu(); break;
            case SCENE.STORY:        this._drawStory(); break;
            case SCENE.STAGE_INTRO:  this._drawStageIntro(); break;
            case SCENE.READY:        this._drawReady(); break;
            case SCENE.PLAY:         this._drawPlay(); break;
            case SCENE.FPS_PLAY:     if (this._fpsArena) this._fpsArena.draw(); break;
            case SCENE.BEAT_PLAY:    if (this._beatEmUp) this._beatEmUp.draw(); break;
            case SCENE.DOOM_PLAY:    if (this._doomEngine) this._doomEngine.draw(); break;
            case SCENE.TURRET_PLAY:  if (this._turretArena) this._turretArena.draw(); break;
            case SCENE.PAUSE: {
                // R351: pause overlay must paint over whichever play scene we
                // came from (platformer / FPS / beat-em-up). Falls back to
                // PLAY for the legacy code path.
                const from = this._pauseReturnScene || SCENE.PLAY;
                if (from === SCENE.FPS_PLAY && this._fpsArena) this._fpsArena.draw();
                else if (from === SCENE.BEAT_PLAY && this._beatEmUp) this._beatEmUp.draw();
                else if (from === SCENE.DOOM_PLAY && this._doomEngine) this._doomEngine.draw();
                else if (from === SCENE.TURRET_PLAY && this._turretArena) this._turretArena.draw();
                else this._drawPlay();
                this._drawPauseOverlay();
                break;
            }
            // R211: sub-menus opened from MAIN_MENU need the title bg
            // (via _drawMainMenu) underneath, not _drawPlay — the latter
            // renders a black void since player/level are null.
            case SCENE.OPTIONS:      this._drawSubMenuBackdrop(); this._drawOptions(); break;
            case SCENE.ACHIEVEMENTS: this._drawSubMenuBackdrop(); this._drawAchievements(); break;
            case SCENE.SOUNDTRACK:   this._drawSubMenuBackdrop(); this._drawSoundtrack(); break;
            case SCENE.GALLERY:      this._drawSubMenuBackdrop(); this._drawGallery(); break;
            case SCENE.STAGE_SELECT: this._drawStageSelect(); break;
            case SCENE.STAGE_CARD:   this._drawStageCard(); break;
            case SCENE.BOSS_INTRO:   this._drawBossIntro(); break;
            case SCENE.STAGE_CLEAR:  this._drawPlay(); this._drawStageClear(); break;
            case SCENE.GAME_OVER:    this._drawGameOver(); break;
            case SCENE.GAME_COMPLETE:this._drawGameComplete(); break;
            case SCENE.EPILOGUE:     this._drawEpilogue(); break;
            case SCENE.CREDITS:      this._drawCredits(); break;
        }

        // Hit-pause emphasis: while time is frozen for a few frames, paint a
        // radial vignette pulse + tint overlay. Pure "this hit mattered" beat;
        // the underlying game state has already paused via hitPauseFrames in
        // _tick, so this layer only runs during the existing freeze window.
        const hp = this.player?.hitPauseFrames || 0;
        if (hp > 0 && this.scene === SCENE.PLAY) {
            const t = hp / 8;          // initial flash within ~8 frames, fades to 0
            const k = Math.min(1, t);
            // Bright center → dark edge — instant "punch-in" without an
            // actual scale transform (avoids pixel-art aliasing).
            if (!this._hpGrad) {
                this._hpGrad = ctx.createRadialGradient(
                    GAME.W / 2, GAME.H / 2, 0,
                    GAME.W / 2, GAME.H / 2, GAME.W * 0.7
                );
                this._hpGrad.addColorStop(0, 'rgba(255,240,200,0)');
                this._hpGrad.addColorStop(0.5, 'rgba(80,20,40,0)');
                this._hpGrad.addColorStop(1, 'rgba(0,0,0,1)');
            }
            ctx.save();
            ctx.globalAlpha = 0.30 * k;
            ctx.fillStyle = this._hpGrad;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
            // White center pop on the very first frame
            if (hp >= 6) {
                ctx.fillStyle = `rgba(255,255,255,${(0.15 * k).toFixed(3)})`;
                ctx.fillRect(0, 0, GAME.W, GAME.H);
            }
        }

        // Death-fall vignette: while Clippy is in the death-spin window,
        // ramp a red-tinted vignette + dim wash so the play scene fades
        // out under the spinning sprite instead of staying bright. Drives
        // from deathTimer so it scales with the fall.
        if (this.scene === SCENE.PLAY && this.player?.state === 'die') {
            const dt = Math.min(1, (this.player.deathTimer || 0) / 90);
            // Cached radial gradient — red edge, dark center
            if (!this._deathGrad) {
                const g = ctx.createRadialGradient(
                    GAME.W / 2, GAME.H / 2, 0,
                    GAME.W / 2, GAME.H / 2, GAME.W * 0.65
                );
                g.addColorStop(0, 'rgba(40,4,8,0)');
                g.addColorStop(0.6, 'rgba(80,8,20,0.4)');
                g.addColorStop(1, 'rgba(160,16,32,0.95)');
                this._deathGrad = g;
            }
            ctx.save();
            ctx.globalAlpha = 0.55 * dt;
            ctx.fillStyle = this._deathGrad;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
            // Slight desaturation tint — flat dark wash to drain color
            ctx.fillStyle = `rgba(10,2,10,${(0.18 * dt).toFixed(3)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }

        // Transition fade overlay
        if (this.transition !== 0) {
            // Scene fade: positive = fading OUT (clear → black) as it counts
            // down 30→0; negative = fading IN (black → clear) as it counts
            // up -30→0. Previous formulas were inverted — fade-out started
            // black and fade-in ended black, producing two black flashes
            // around each transition instead of a smooth fade-through-black.
            const a = this.transition > 0
                ? (30 - this.transition) / 30   // 30→0  ⇒ 0→1
                : -this.transition / 30;        // -30→0 ⇒ 1→0
            ctx.fillStyle = `rgba(0,0,0,${a})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
    }

    // ============== boot ==============
    _tickBoot() {
        if (this.bootTimer > 60 && this.assetsReady) {
            this._fadeTo(SCENE.TITLE);
        }
    }
    _drawBoot() {
        const ctx = this.ctx;
        drawText(ctx, 'OFFICE WARFARE LTD.', GAME.W / 2, GAME.H / 2 - 8, '#604068', 1, 'center');
        drawText(ctx, 'PRESENTS', GAME.W / 2, GAME.H / 2 + 4, '#4a3050', 1, 'center');
        // Asset-loading progress bar. Sits below the studio bumper so a slow
        // connection has a felt cue instead of a static screen. Hidden once
        // assets are ready since the bumper holds for an extra ~1s anyway.
        const total = sprites.totalAssets;
        if (total > 0 && !this.assetsReady) {
            const done = Math.min(sprites.settledAssets, total);
            const pct = done / total;
            const barW = 80, barH = 3;
            const barX = Math.floor((GAME.W - barW) / 2);
            const barY = GAME.H / 2 + 20;
            ctx.fillStyle = '#1a0a14';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#604068';
            ctx.fillRect(barX, barY, Math.floor(barW * pct), barH);
            // Border
            ctx.fillStyle = '#2a1828';
            ctx.fillRect(barX - 1, barY - 1, barW + 2, 1);
            ctx.fillRect(barX - 1, barY + barH, barW + 2, 1);
            ctx.fillRect(barX - 1, barY - 1, 1, barH + 2);
            ctx.fillRect(barX + barW, barY - 1, 1, barH + 2);
        }
    }

    // ============== title ==============
    _tickTitle() {
        audio.init();
        audio.playTrack('title');
        this.titleBlink++;
        this._tickUnlockToasts();
        const gameCleared = achievements.unlocked.has('clear_game');
        // R228: hidden Konami code. Hold SHIFT (aim-lock) and tap the
        // sequence UP UP DOWN DOWN LEFT RIGHT LEFT RIGHT B A. On match,
        // every stage opens in stage select for the rest of the run AND
        // we flip clear_game so post-game modes (BOSS RUSH / TIME TRIAL /
        // REALITY DISTORTION) appear too. Shift is the modifier so the
        // single-tap UP/DOWN/etc. branches below still work normally for
        // muscle memory. Buffer survives across frames so the user can
        // type it at any pace; >120f gap clears the buffer.
        if (input.isHeld('aimlock')) {
            const SEQ = ['up','up','down','down','left','right','left','right','shield','jump'];
            for (const k of ['up','down','left','right','shield','jump']) {
                if (input.isPressed(k)) {
                    this._konami.push(k);
                    if (this._konami.length > SEQ.length) this._konami.shift();
                    this._konamiAge = 0;
                    // Match on last 10 entries?
                    if (this._konami.length === SEQ.length &&
                        this._konami.every((v, i) => v === SEQ[i])) {
                        this._konami = [];
                        audio.sfx('secretFound');
                        // Unlock everything for the run + persist clear_game.
                        // Also flag konami-mode so stage-select widens its grid
                        // to expose the secret stage 10 + REALITY 14 + FPS 15
                        // even without the usual unlock prerequisites.
                        this.unlockedStage = STAGES.length - 1;
                        this._konamiUnlocked = true;
                        achievements.stats.secretStageDiscovered = true;
                        achievements.stats.konamiUnlocked = true;   // R279: persist
                        achievements.unlocked.add('clear_game');
                        achievements._save();
                        // R300: announce the unlock so the player knows what
                        // just happened (was silent before).
                        this._pushUnlockToast('ALL STAGES UNLOCKED',
                            'KONAMI CODE — STAGE SELECT IS NOW OPEN');
                        this.stageSelectIndex = 0;
                        this.scene = SCENE.STAGE_SELECT;
                    }
                    return; // SHIFT-held inputs never fall through to normal title branches
                }
            }
            // Clear stale buffer after ~2s of no input while shift held
            this._konamiAge = (this._konamiAge || 0) + 1;
            if (this._konamiAge > 120) { this._konami = []; this._konamiAge = 0; }
        } else {
            // SHIFT released — give the player up to 120f to release+resume
            // without losing progress. Beyond that the buffer expires.
            this._konamiAge = (this._konamiAge || 0) + 1;
            if (this._konamiAge > 120) this._konami = [];
        }
        // Single-action gate: a held LEFT+DOWN should fire exactly one
        // transition. Order: start > stage-select > training > modes.
        if (input.isPressed('shoot') || input.isPressed('start') || input.isPressed('jump')) {
            // R210 — Milos #1: title PRESS X opens the main menu panel
            // instead of jumping straight into STORY. The directional
            // shortcuts (UP/DOWN/LEFT/RIGHT/B) still work on the title
            // for muscle memory, but new players see the menu.
            audio.sfx('select');
            this.mainMenuIndex = 0;
            this.scene = SCENE.MAIN_MENU;
        } else if (input.isPressed('down') && this.unlockedStage > 1) {
            // DOWN at title — stage select (gated on any stage cleared yet)
            audio.sfx('select');
            this.stageSelectIndex = 0;
            this.scene = SCENE.STAGE_SELECT;
        } else if (input.isPressed('up')) {
            // R291: training ground shifted 13→15.
            audio.sfx('select');
            this._startStage(15);
        } else if (gameCleared && input.isPressed('left')) {
            // R291: Boss Rush Mode shifted 14→16.
            audio.sfx('select');
            this._startStage(16);
        } else if (gameCleared && input.isPressed('right')) {
            // R291: Time Trial shifted 15→17.
            audio.sfx('select');
            this._startStage(17);
        } else if (gameCleared && input.isPressed('shield')) {
            // R291: REALITY DISTORTION FIELD shifted 16→18.
            audio.sfx('select');
            this._startStage(18);
        }
    }
    _drawTitle() {
        const ctx = this.ctx;
        // Painted scene background if available, else procedural fallback
        if (sprites.has('title_bg')) {
            const img = sprites.images.get('title_bg');
            // Fit width, center vertically
            const scale = GAME.W / img.width;
            const dh = img.height * scale;
            const dy = (GAME.H - dh) / 2;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, dy, GAME.W, dh);
            // Darken slightly for title readability
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        } else {
            // Procedural fallback
            for (let y = 0; y < GAME.H; y++) {
                const t = y / GAME.H;
                ctx.fillStyle = t < 0.4 ? '#000408' :
                                t < 0.65 ? '#180814' :
                                t < 0.85 ? '#401020' : '#180810';
                ctx.fillRect(0, y, GAME.W, 1);
            }
            ctx.fillStyle = '#000';
            for (let i = 0; i < 24; i++) {
                const x = i * 11;
                const h = 30 + ((i * 17) % 20);
                ctx.fillRect(x, GAME.H - 50 - h, 10, h);
            }
            for (let i = 0; i < 14; i++) {
                const fx = (i * 17 + this.titleBlink) % GAME.W;
                ctx.fillStyle = i % 2 ? '#a02018' : '#601008';
                ctx.fillRect(fx, GAME.H - 52 - (Math.sin(this.titleBlink / 20 + i) * 4 + 4), 1, 5);
            }
        }

        // Animated bullet tracers streaking horizontally behind the title text
        ctx.globalAlpha = 1;
        const tb = this.titleBlink;
        for (let i = 0; i < 5; i++) {
            const offset = (i * 67 + tb * 4) % (GAME.W + 80);
            const tx = GAME.W - offset;
            const ty = 18 + (i * 13) % 60;
            ctx.fillStyle = i % 2 ? '#ffe070' : '#ff8050';
            ctx.globalAlpha = 0.55;
            ctx.fillRect(tx, ty, 14, 1);
            ctx.globalAlpha = 0.25;
            ctx.fillRect(tx + 14, ty, 8, 1);
        }
        ctx.globalAlpha = 1;

        // Title text — outer red glow pulse
        const titlePulse = Math.sin(tb * 0.04) * 0.15 + 0.85;
        ctx.globalAlpha = titlePulse * 0.5;
        drawTextOutlined(ctx, 'CLIPPY', GAME.W / 2, 28, '#ff8080', '#1a0000', 4, 'center');
        ctx.globalAlpha = 1;
        drawTextOutlined(ctx, 'CLIPPY', GAME.W / 2, 28, '#ff5050', '#1a0000', 4, 'center');
        drawTextOutlined(ctx, 'FIRST BLOOD', GAME.W / 2, 68, '#ffe070', '#a82020', 2, 'center');

        // Scrolling subtitle marquee — "A REVENGE STORY" drifts left.
        // Wrap-safe: anchor sx in the negative-subW window so we always have
        // at least one full repeat covering GAME.W on the right. Triple the
        // string so the wrap is invisible even at large widths.
        // R369: was "EIGHT TARGETS" but the game has 13+ bosses now after
        // the post-game + Mecha trilogy. Refreshed to current scope.
        // R394: marquee is at y=90 but the MAIN_MENU panel (when layered
        // on top) starts at y=95. Bottom half of the marquee was leaking
        // around the panel — visible as "TORY · TRACKS · PAPERCLI"
        // fragments behind the START GAME entry. Suppress when the menu
        // is up so the panel sits cleanly on the painted title bg.
        if (this.scene !== SCENE.MAIN_MENU) {
            // R477: expanded marquee with more lore beats. Scrolls through 7
            // taglines instead of 3, sells the scope (Doom mode, multiple
            // engines, post-game arc).
            const sub = 'A REVENGE STORY  -  TWELVE TARGETS  -  ONE PAPERCLIP  -  '
                      + 'FOUR ENGINES  -  TWO SPINDLERS  -  ZERO MERCY  -  '
                      + 'CLIPPY UNCAGED  -  ';
            const subW = sub.length * 6;
            const sx = -((tb * 0.7) % subW);
            ctx.globalAlpha = 0.65;
            drawText(ctx, sub + sub + sub, sx, 90, '#c0a0d0', 1, 'left');
            ctx.globalAlpha = 1;
        }
        // R477: version stamp bottom-right corner — tiny, dim, but visible.
        // Uses the latest R-tag committed (R477 as of this commit).
        if (this.scene !== SCENE.MAIN_MENU) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            drawText(ctx, 'R477', GAME.W - 4, GAME.H - 4, '#604068', 1, 'right');
            ctx.restore();
        }
        // Edge fade — paint short black gradients at the left + right ends
        // of the marquee band so half-letters disappear into the dark
        // instead of being clipped mid-glyph by the canvas edge.
        // R394: skip when main menu is up (no marquee to fade).
        if (this.scene !== SCENE.MAIN_MENU) {
            const fadeW = 22;
            const fadeY = 88, fadeH = 11;
            // Cache the two gradient fills — pure black, never animate, no need
            // to rebuild every frame. Was allocating 2 gradients per title tick
            // (~120 GC pressure/sec on the title screen).
            if (!this._titleMarqueeFades) {
                const fL = ctx.createLinearGradient(0, 0, fadeW, 0);
                fL.addColorStop(0, 'rgba(0,0,0,1)');
                fL.addColorStop(1, 'rgba(0,0,0,0)');
                const fR = ctx.createLinearGradient(GAME.W - fadeW, 0, GAME.W, 0);
                fR.addColorStop(0, 'rgba(0,0,0,0)');
                fR.addColorStop(1, 'rgba(0,0,0,1)');
                this._titleMarqueeFades = { L: fL, R: fR };
            }
            ctx.fillStyle = this._titleMarqueeFades.L;
            ctx.fillRect(0, fadeY, fadeW, fadeH);
            ctx.fillStyle = this._titleMarqueeFades.R;
            ctx.fillRect(GAME.W - fadeW, fadeY, fadeW, fadeH);
        }

        // Press to start (pulsing glow + blink)
        // R236: suppress when MAIN_MENU is layered on top — the menu owns
        // the input prompt now, and the blinking text would show through
        // the dim layer behind the panel.
        if (this.titleBlink % 60 < 40 && this.scene !== SCENE.MAIN_MENU) {
            const psPulse = 0.7 + Math.sin(tb * 0.18) * 0.3;
            ctx.globalAlpha = psPulse;
            drawTextOutlined(ctx, 'PRESS X TO START', GAME.W / 2, GAME.H - 38, '#fff', '#a82020', 1, 'center');
            ctx.globalAlpha = 1;
        }
        // R210 — Milos #1: title screen's old directional-hint stack is
        // gone now that PRESS X opens a proper MAIN_MENU. Power-user
        // shortcuts (UP/DOWN/LEFT/RIGHT/B) still work — they just aren't
        // advertised on the title anymore. The menu is the discovery
        // surface for new players; veterans keep their muscle memory.
        // Personal best — TOP TIER achievement gates on >=100k, but the
        // player never saw their current best until they hit it. Show it on
        // the title once they've scored at least once so the goal feels real.
        const best = achievements.stats?.bestScore || 0;
        if (best > 0) {
            drawText(ctx, 'HI-SCORE  ' + best.toLocaleString(), GAME.W / 2, GAME.H - 50, '#ffe070', 1, 'center');
        }
        drawText(ctx, '(C) 2026 OFFICE WARFARE LTD  v1.0', GAME.W / 2, GAME.H - 8, '#604068', 1, 'center');
        this._drawUnlockToasts();
    }

    // ============== main menu (R210) ==============
    // Built as a filtered list — each entry has a `gate` predicate that
    // hides the row when the player hasn't unlocked it yet, so post-game
    // modes don't reveal themselves until they're earned. The selected
    // index runs against the *visible* slice, not the master list, so the
    // index is recomputed each tick instead of stored as a master index.
    _mainMenuItems() {
        const cleared = achievements.unlocked.has('clear_game');
        const stageSelectAvail = this.unlockedStage > 1;
        // Master list. Filtered below based on per-row gates.
        // R487: removed 'ONE MORE THING' — that's stage 18 (Jobs), which is
        // a real STAGE not a mode. It belongs in stage-select, not main menu
        // (gated by gameCleared on the stage-select grid already). Training,
        // Boss Rush, Time Trial are MODES (no campaign chain) so they live
        // here. Jobs has a campaign chain (post-game story arc) so it lives
        // in stage-select like every other stage.
        const all = [
            { label: 'START GAME',     action: 'start' },
            { label: 'STAGE SELECT',   action: 'stageSelect',  gate: () => stageSelectAvail },
            { label: 'TRAINING',       action: 'training' },
            { label: 'BOSS RUSH',      action: 'bossRush',     gate: () => cleared },
            { label: 'TIME TRIAL',     action: 'timeTrial',    gate: () => cleared },
            { label: 'OPTIONS',        action: 'options' },
            { label: 'ACHIEVEMENTS',   action: 'achievements' },
            { label: 'SCENE GALLERY',  action: 'gallery' },
            { label: 'SOUNDTRACK',     action: 'soundtrack' },
            { label: 'BACK TO TITLE',  action: 'back' },
        ];
        return all.filter(item => !item.gate || item.gate());
    }

    _tickMainMenu() {
        const items = this._mainMenuItems();
        const n = items.length;
        if (input.isPressed('up'))   { this.mainMenuIndex = (this.mainMenuIndex + n - 1) % n; audio.sfx('select'); }
        if (input.isPressed('down')) { this.mainMenuIndex = (this.mainMenuIndex + 1) % n; audio.sfx('select'); }
        if (input.isPressed('pause')) { this.scene = SCENE.TITLE; audio.sfx('select'); return; }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            audio.sfx('menu');
            const sel = items[this.mainMenuIndex];
            switch (sel.action) {
                case 'start':
                    this.storyPage = 0;
                    this.storyTimer = 0;
                    this._fadeTo(SCENE.STORY);
                    break;
                case 'stageSelect':
                    this.stageSelectIndex = 0;
                    this.scene = SCENE.STAGE_SELECT;
                    break;
                // R291: stage-id shifts — training 13→15, bossRush 14→16,
                // timeTrial 15→17, secret (Reality Distortion) 16→18.
                case 'training':     this._startStage(15); break;
                // R426: BOSS RUSH MODE moved from stage 16 (now FLOOR 11 Doom)
                // to slot 24. Title-screen MAIN_MENU is the only entry point;
                // no stage-select tile (campaign-only mode).
                case 'bossRush':     this._startStage(24); break;
                case 'timeTrial':    this._startStage(17); break;
                // R487: 'secret' (ONE MORE THING / Jobs) removed from main
                // menu — players reach stage 18 via stage-select after
                // clear_game unlock. Case retained for save-state safety
                // in case the action ever fires from an old session.
                case 'secret':       this._startStage(18); break;
                case 'options':
                    this.optionsIndex = 0;
                    // R211: arm sub-menus to return to MAIN_MENU instead of
                    // PAUSE, since there's no live game state behind this.
                    this._menuReturnScene = SCENE.MAIN_MENU;
                    this.scene = SCENE.OPTIONS;
                    break;
                case 'achievements':
                    this._menuReturnScene = SCENE.MAIN_MENU;
                    this.achievementsIndex = 0;
                    this.scene = SCENE.ACHIEVEMENTS;
                    break;
                case 'gallery':
                    this._menuReturnScene = SCENE.MAIN_MENU;
                    this.galleryIndex = 0;
                    this.scene = SCENE.GALLERY;
                    break;
                case 'soundtrack':
                    this._menuReturnScene = SCENE.MAIN_MENU;
                    this.scene = SCENE.SOUNDTRACK;
                    break;
                case 'back':
                    this.scene = SCENE.TITLE;
                    break;
            }
        }
    }

    _drawMainMenu() {
        // Paint the title screen dim underneath so the menu feels layered
        // over it rather than a hard cut. The title's animated bullet
        // tracers + marquee keep moving behind the panel.
        this._drawTitle();
        const ctx = this.ctx;
        // R236: gentler dim — was 0.62 which crushed the title bg below
        // the modal. 0.35 keeps the title art readable while still telling
        // the player "this is a modal, focus on the menu".
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Framed panel — same style as pause/options for consistency.
        // R236: shift panel into the lower half + narrow it so the painted
        // title wordmark above stays visible. Was centered (panelY ~ GAME.H/2 - panelH/2)
        // which covered the "CLIPPY" art dead-center.
        const items = this._mainMenuItems();
        const rowH = 11;
        const panelH = Math.min(GAME.H - 64, 24 + items.length * rowH + 14);
        const panelY = GAME.H - panelH - 14;
        const panelX = 56, panelW = GAME.W - 112;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = '#604030';
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

        drawTextOutlined(ctx, 'MAIN MENU', GAME.W / 2, panelY + 5, '#ffe070', '#a82020', 1, 'center');

        // Clamp selection to the visible list — needed when an unlock
        // happens between ticks (would otherwise leave the selector past
        // the new last row).
        if (this.mainMenuIndex >= items.length) this.mainMenuIndex = items.length - 1;
        if (this.mainMenuIndex < 0) this.mainMenuIndex = 0;

        const startY = panelY + 18;
        for (let i = 0; i < items.length; i++) {
            const y = startY + i * rowH;
            const isSel = i === this.mainMenuIndex;
            if (isSel) {
                const phase = Math.sin((this._mainMenuPulse = (this._mainMenuPulse || 0) + 1) * 0.18) * 0.5 + 0.5;
                ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                ctx.fillRect(panelX + 6, y - 2, panelW - 12, 10);
                drawText(ctx, '>', panelX + 10, y, '#ffe070', 1, 'left');
                drawText(ctx, '<', panelX + panelW - 16, y, '#ffe070', 1, 'left');
            }
            drawText(ctx, items[i].label, GAME.W / 2, y, isSel ? '#fff' : '#c0a0d0', 1, 'center');
        }

        drawText(ctx, 'UP/DOWN  X CONFIRM  P BACK', GAME.W / 2, panelY + panelH - 7, '#604068', 1, 'center');
    }

    // R211: backdrop for sub-menus (OPTIONS/ACHIEVEMENTS/SOUNDTRACK/GALLERY).
    // Selects between _drawPlay (in-game pause path) and _drawMainMenu
    // (pre-run path) based on the return target stashed at entry. Player
    // and level can be null when entered from MAIN_MENU; _drawPlay would
    // render a black canvas with no usable bg in that case.
    _drawSubMenuBackdrop() {
        if (this._menuReturnScene === SCENE.MAIN_MENU) {
            this._drawMainMenu();
        } else {
            this._drawPlay();
        }
    }

    // ============== story ==============
    _tickStory() {
        audio.playTrack('story');
        this.storyTimer++;
        // R513: P (pause) acts as SKIP-ALL — jump straight to stage 1.
        // Onboarding audit found 7 story pages = 7+ X presses before
        // play. Returning players know the story; this lets them skip
        // without disabling the typewriter pacing for first-time players.
        if (input.isPressed('pause')) {
            audio.sfx('select');
            this.storyPage = STORY_PAGES.length;
            this._startStage(1);
            return;
        }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            // If the typewriter is still revealing, first press skips to the
            // end of the page; only the second press advances. Stops players
            // who tap eagerly from blowing past pages they haven't read.
            const lines = STORY_PAGES[this.storyPage] || [];
            const totalChars = lines.reduce((a, l) => a + l.length, 0);
            const shownChars = Math.floor(this.storyTimer * 6);
            if (shownChars < totalChars) {
                audio.sfx('select');
                this.storyTimer = Math.ceil(totalChars / 6) + 1;   // snap to full reveal
                return;
            }
            audio.sfx('select');
            this.storyPage++;
            this.storyTimer = 0;
            if (this.storyPage >= STORY_PAGES.length) {
                this._startStage(1);
            }
        }
    }
    _drawStory() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Try painted scene first. All 5 pages now have painted assets; the
        // procedural fallbacks below stay as a safety net if a PNG fails to load.
        // R292: new "TOWER" slide inserted between HILL and LIST.
        const sceneKeys = ['story_fired', 'story_home', 'story_bomb', 'story_boardroom', 'story_hill', 'story_tower', 'story_list'];
        const key = sceneKeys[this.storyPage];
        if (key && sprites.has(key)) {
            const img = sprites.images.get(key);
            // Letterbox: fit width, leave space at bottom for text
            const scale = GAME.W / img.width;
            const dh = img.height * scale;
            // Reserve bottom 90px for text
            const maxH = GAME.H - 90;
            const finalH = Math.min(dh, maxH);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, GAME.W, finalH);
            // Letterbox bars
            ctx.fillStyle = '#000';
            ctx.fillRect(0, finalH, GAME.W, GAME.H - finalH);

            // Text block at bottom over the black panel. Typewriter reveal —
            // step 6 chars/frame so a 60-char line lands in ~10 frames (~170ms).
            // Fast enough that eager players don't notice; slow enough that
            // sitting back gives a satisfying type-out feel.
            const lines = STORY_PAGES[this.storyPage] || [];
            const startY = GAME.H - lines.length * 10 - 22;
            // Cumulative chars to reveal across all lines
            const CHARS_PER_FRAME = 6;
            const totalChars = lines.reduce((a, l) => a + l.length, 0);
            const shown = Math.min(totalChars, Math.floor(this.storyTimer * CHARS_PER_FRAME));
            let budget = shown;
            for (let i = 0; i < lines.length; i++) {
                const full = lines[i];
                const take = Math.min(budget, full.length);
                const partial = full.slice(0, take);
                budget -= take;
                drawText(this.ctx, partial, GAME.W / 2, startY + i * 10, '#d8c8e0', 1, 'center');
                if (take < full.length) break;   // don't render later lines yet
            }
            // Continue hint only after the full block has rendered
            if (shown >= totalChars && this.storyTimer % 60 < 40) {
                drawText(this.ctx, 'X TO CONTINUE', GAME.W - 4, GAME.H - 8, '#a08090', 1, 'right');
            }
            // R513: SKIP hint on the left so returning players can blow
            // through the 7-page intro. Dim color so it doesn't compete
            // with the painted scene for attention.
            drawText(this.ctx, 'P TO SKIP', 4, GAME.H - 8, '#604068', 1, 'left');
            return;
        }

        // Asset-missing safety net — should not normally hit. If the painted PNG
        // failed to load (slow network, missing file), still show the story text
        // on a black panel so the player isn't staring at a blank screen.
        const lines = STORY_PAGES[this.storyPage] || [];
        const startY = GAME.H - lines.length * 12 - 16;
        for (let i = 0; i < lines.length; i++) {
            drawText(this.ctx, lines[i], GAME.W / 2, startY + i * 12, '#d8c8e0', 1, 'center');
        }
        drawText(this.ctx, 'X TO CONTINUE', GAME.W - 4, GAME.H - 8, '#604068', 1, 'right');
    }

    // ============== stage intro ==============
    _tickStageIntro() {
        this.storyTimer++;
        // Audio cues match the visual slide-ins so the cinematic isn't silent:
        // tick 12 = STAGE number lands, tick 24 = stage name slides in. Both
        // small UI clicks so they don't fight the gameplay-track swap below.
        if (this.storyTimer === 12) audio.sfx('select');
        if (this.storyTimer === 24) audio.sfx('menu');
        if (this.storyTimer > 90 || input.isPressed('shoot') || input.isPressed('jump')) {
            audio.sfx('select');
            audio.playTrack(STAGES[this.currentStage].music);
            // R386: route by ENGINE MODE, not the one-shot pending flags.
            // The flags flip false on first consumption but _tickStageIntro
            // keeps firing every frame until the fade completes (~30
            // frames). If the storyTimer>90 gate trips a second time
            // before the fade lands, the OLD code fell through to
            // SCENE.READY → SCENE.PLAY → black canvas (beat/FPS stages
            // have no Level). Use the persistent _beatMode/_fpsMode
            // booleans instead so re-entry routes to the correct play scene.
            if (this._beatMode) {
                this._beatPendingPlay = false;
                this._fadeTo(SCENE.BEAT_PLAY);
                return;
            }
            if (this._fpsMode) {
                this._fpsPendingPlay = false;
                this._fadeTo(SCENE.FPS_PLAY);
                return;
            }
            if (this._doomMode) {
                this._doomPendingPlay = false;
                this._fadeTo(SCENE.DOOM_PLAY);
                return;
            }
            if (this._turretMode) {
                this._turretPendingPlay = false;
                this._fadeTo(SCENE.TURRET_PLAY);
                return;
            }
            // R209 — Milos #2: gate PLAY behind READY card unless the
            // player has flipped showReady off. Veterans skip straight
            // into the stage; new players see the keymap first.
            const next = options.get('showReady') ? SCENE.READY : SCENE.PLAY;
            this._fadeTo(next);
        }
    }

    // R209 — pre-level READY card. Holds the player on a keymap screen
    // until they press SHOOT / JUMP / START to launch. A small toggle
    // at the bottom flips options.showReady so veterans can skip this
    // permanently after seeing it once.
    //
    // R211 audit fix — uses its own _readyTimer instead of piggybacking
    // on storyTimer. The previous version reset storyTimer = 0 inside
    // _tickStageIntro before _fadeTo(SCENE.READY), but the 30-frame
    // fade-out kept ticking STAGE_INTRO (incrementing storyTimer back
    // to ~30) before the scene actually flipped. READY then entered
    // with storyTimer past the 18-frame breath threshold, and a held
    // shoot/jump from STAGE_INTRO could punch through on the first
    // READY input frame — exactly the case the breath was meant to
    // prevent. The dedicated timer is reset on entry below.
    _tickReady() {
        // Detect first tick on this scene and zero the timer. Cheap
        // sentinel — _readyTimer is set to -1 when we leave the scene
        // (or never visited), so the very first tick lands here.
        if (this._readyTimer === undefined || this._readyTimer < 0) {
            this._readyTimer = 0;
        }
        this._readyTimer++;
        // Toggle the don't-show-again flag with the special key (C) so
        // it doesn't conflict with the launch keys.
        if (input.isPressed('special')) {
            const cur = !!options.get('showReady');
            options.set('showReady', !cur);
            audio.sfx('select');
        }
        // Any of the typical "go" inputs launches the stage. Give the
        // card a minimum 18-frame breath so a held key from STAGE_INTRO
        // doesn't immediately skip past it.
        if (this._readyTimer > 18 &&
            (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start'))) {
            audio.sfx('menu');
            this._readyTimer = -1; // arm sentinel for next entry
            this._fadeTo(SCENE.PLAY);
        }
    }

    _drawReady() {
        const ctx = this.ctx;
        const stg = STAGES[this.currentStage];
        // R211: draw uses the dedicated _readyTimer that the tick owns.
        // Stays in sync with the entry-on-first-frame reset so the
        // pulses/animations don't sprint ahead during the fade-in.
        const t = Math.max(0, this._readyTimer || 0);

        // Dark background with thin scanline shading — reuses the same
        // palette as the pause menu so it reads as a "system" screen.
        ctx.fillStyle = '#06040c';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Framed panel
        const panelX = 24, panelY = 20, panelW = GAME.W - 48, panelH = GAME.H - 40;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = '#604030';
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

        // Header — pulsing "READY?" to read as an action prompt
        const pulse = 0.7 + 0.3 * Math.sin(t * 0.18);
        ctx.globalAlpha = pulse;
        drawTextOutlined(ctx, 'READY?', GAME.W / 2, panelY + 8, '#ffe070', '#a82020', 2, 'center');
        ctx.globalAlpha = 1;

        // Stage context — so the player knows which stage they're about to start
        if (stg) {
            drawText(ctx, 'STAGE ' + stg.id + ' / ' + stg.name,
                     GAME.W / 2, panelY + 28, '#80a0c0', 1, 'center');
        }

        // Two-column keymap, brighter than the pause-menu version since
        // this is the discovery screen and clarity matters more than
        // density. 7px row pitch, label dim / key bright pattern.
        const colL = panelX + 18, colR = panelX + panelW - 18;
        const rowH = 9;
        const rows = [
            ['MOVE',   'WASD / ARROWS', 'SHOOT',   'X'],
            ['JUMP',   'SPACE / Z',     'GRENADE', 'V'],
            ['AIM',    'SHIFT',         'SHIELD',  'B'],
            ['SWAP',   'TAB / Q',       'SPECIAL', 'C'],
            ['CHARGE', 'DOWN + X (MG)', 'PAUSE',   'P'],
        ];
        const startY = panelY + 50;
        for (let i = 0; i < rows.length; i++) {
            const y = startY + i * rowH;
            drawText(ctx, rows[i][0], colL,      y, '#a890b0', 1, 'left');
            drawText(ctx, rows[i][1], colL + 38, y, '#ffe070', 1, 'left');
            drawText(ctx, rows[i][3], colR,      y, '#ffe070', 1, 'right');
            drawText(ctx, rows[i][2], colR - 10, y, '#a890b0', 1, 'right');
        }

        // Don't-show-again toggle row — checkbox + label. Hidden until
        // the breath delay passes so the player notices the keymap first.
        if (t > 18) {
            const toggleY = startY + rows.length * rowH + 8;
            const checked = !options.get('showReady');
            const boxX = panelX + 18;
            // Checkbox: 7×7 dark fill, white outline, fills with cyan when checked.
            ctx.fillStyle = '#1a1428';
            ctx.fillRect(boxX, toggleY - 1, 7, 7);
            ctx.fillStyle = '#806890';
            ctx.fillRect(boxX, toggleY - 1, 7, 1);
            ctx.fillRect(boxX, toggleY - 1, 1, 7);
            ctx.fillRect(boxX + 6, toggleY - 1, 1, 7);
            ctx.fillRect(boxX, toggleY + 5, 7, 1);
            if (checked) {
                ctx.fillStyle = '#60c0ff';
                ctx.fillRect(boxX + 2, toggleY + 1, 3, 3);
            }
            drawText(ctx, "DON'T SHOW AGAIN  (C TO TOGGLE)",
                     boxX + 11, toggleY, '#c0a0d0', 1, 'left');
        }

        // R215: gamepad reference row. Players using a controller
        // can't decode the keyboard keymap above (their button names
        // are A/B/X/Y, not WASD). Single compact row using "GAMEPAD:"
        // prefix + Xbox-standard letter labels. Kept under the 224px
        // panel inner width so nothing clips against the border.
        const padY = panelY + panelH - 22;
        drawText(ctx, 'PAD A=JUMP X=FIRE Y=NADE BACK=SWAP',
                 GAME.W / 2, padY, '#80a0c0', 1, 'center');

        // Footer hint — "PRESS X TO START" pulsing yellow
        const footPulse = 0.6 + 0.4 * Math.sin(t * 0.22);
        ctx.globalAlpha = footPulse;
        drawText(ctx, 'PRESS X / SPACE / ENTER TO START',
                 GAME.W / 2, panelY + panelH - 12, '#ffe070', 1, 'center');
        ctx.globalAlpha = 1;
    }
    _drawStageIntro() {
        const ctx = this.ctx;
        const stg = STAGES[this.currentStage];
        const t = this.storyTimer;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // R272: optional painted backdrop for stages that declare one.
        // Stages override via STAGES[n].introBgKey (sprite key).
        if (stg?.introBgKey) {
            const img = sprites.images.get(stg.introBgKey);
            if (img) {
                ctx.imageSmoothingEnabled = false;
                const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
                const dw = img.width * scale;
                const dh = img.height * scale;
                ctx.globalAlpha = Math.min(1, t / 30);   // fade in
                ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
                ctx.globalAlpha = 1;
                // Dark wash so the title text reads on top
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(0, 0, GAME.W, GAME.H);
            }
        }

        // Cinematic letterbox bars that slide in.
        const barH = Math.min(40, t * 1.6);
        ctx.fillStyle = '#1a0a20';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);
        ctx.fillStyle = '#3a2a4a';
        if (barH > 1) {
            ctx.fillRect(0, barH - 1, GAME.W, 1);
            ctx.fillRect(0, GAME.H - barH, GAME.W, 1);
        }

        // STAGE number slides in from left at t > 12
        if (t > 12) {
            const k = Math.min(1, (t - 12) / 18);
            const eased = 1 - Math.pow(1 - k, 3);
            const numX = -50 + (GAME.W / 2 + 50) * eased;
            drawText(ctx, 'STAGE ' + stg.id, numX, 78, '#ffe070', 1, 'center');
        }
        // Stage NAME slides in from right at t > 24. Drop to size=1 for
        // long names that would overflow 256px at size=2.
        if (t > 24) {
            const k = Math.min(1, (t - 24) / 22);
            const eased = 1 - Math.pow(1 - k, 3);
            // 6px glyph + 1px gap = 7px per char at size=1; size=2 ~12px each.
            // Stage names >14 chars at size=2 overflow the 256px viewport.
            const nameSize = stg.name.length > 14 ? 1 : 2;
            const charW = nameSize === 1 ? 6 : 12;
            const textW = stg.name.length * charW;
            // Slide from flush-right (text touching right viewport edge) to
            // canvas center. Keeps the slide entirely on-screen so the text
            // doesn't clip past the right edge during the animation.
            const startX = GAME.W - textW / 2 - 2;
            const endX = GAME.W / 2;
            const nameX = startX - (startX - endX) * eased;
            drawTextOutlined(ctx, stg.name, nameX, 94, '#ff5050', '#1a0000', nameSize, 'center');
        }
        // Tagline fades in at t > 48
        if (t > 48) {
            const k = Math.min(1, (t - 48) / 24);
            ctx.globalAlpha = k;
            drawText(ctx, stg.tagline, GAME.W / 2, 122, '#c0a0d0', 1, 'center');
            ctx.globalAlpha = 1;
        }
        // Prompt only after the full reveal finishes
        if (t > 70 && (t % 60) < 40) {
            drawTextOutlined(ctx, 'X TO START', GAME.W / 2, GAME.H - 22, '#fff', '#a82020', 1, 'center');
        }
    }

    // R300: unlock toast queue — small banner that floats in from the right
    // for ~240 frames whenever the player unlocks something significant
    // (secret stage, konami, post-game modes). Drawn on title + stage-select.
    _pushUnlockToast(title, subtitle) {
        if (!this._unlockToasts) this._unlockToasts = [];
        this._unlockToasts.push({ title, subtitle, age: 0, life: 240 });
    }
    _tickUnlockToasts() {
        if (!this._unlockToasts) return;
        for (const t of this._unlockToasts) t.age++;
        this._unlockToasts = this._unlockToasts.filter(t => t.age < t.life);
    }
    _drawUnlockToasts() {
        if (!this._unlockToasts || this._unlockToasts.length === 0) return;
        const ctx = this.ctx;
        const t = this._unlockToasts[0];
        // Slide in from the right for the first 20f, hold, fade out last 40f.
        const slideIn = Math.min(1, t.age / 20);
        const slideEased = 1 - Math.pow(1 - slideIn, 3);
        const fadeOut = t.age > t.life - 40 ? (t.life - t.age) / 40 : 1;
        const alpha = Math.max(0, fadeOut);
        const panelW = 200, panelH = 28;
        const x = GAME.W - panelW * slideEased - 4;
        const y = 4;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#1a0a08';
        ctx.fillRect(x, y, panelW, panelH);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(x, y, panelW, 1);
        ctx.fillRect(x, y + panelH - 1, panelW, 1);
        ctx.fillRect(x, y, 1, panelH);
        ctx.fillRect(x + panelW - 1, y, 1, panelH);
        drawText(ctx, '★ ' + t.title, x + 6, y + 4, '#ffe070', 1, 'left');
        drawText(ctx, t.subtitle,    x + 6, y + 16, '#c0a0d0', 1, 'left');
        ctx.globalAlpha = 1;
    }

    // R421/R422: kick a colored full-screen wash for `frames` frames at peak
    // alpha `alpha`. Linearly fades from peak → 0 over the lifetime. Use for
    // weapon pickups (weapon color), grenade pop (white), boss kill (warm
    // orange), etc. Multiple calls within the same frame OR before previous
    // expired: longer-lived + higher-alpha wins.
    triggerScreenFlash(frames = 8, color = '#ffffff', alpha = 0.5) {
        if (frames > this._flashFrames || alpha > this._flashAlphaPeak) {
            this._flashFrames = Math.max(this._flashFrames, frames);
            this._flashTotal = Math.max(this._flashTotal, frames);
            this._flashColor = color;
            this._flashAlphaPeak = Math.max(this._flashAlphaPeak, alpha);
        }
    }

    // ============== play ==============
    triggerSlowMo(frames = 30) {
        this.slowMoFrames = Math.max(this.slowMoFrames || 0, frames);
        // R322: remember the original total so the ramped tick can
        // compute "how deep into the slow-mo we are" for the speed envelope.
        this.slowMoTotal = Math.max(this.slowMoTotal || 0, frames);
    }
    // Top-level play tick. Drives the per-frame world update, then runs
    // post-update telemetry + state-machine gates. Each phase is a small
    // helper so this method reads as a timeline.
    _tickPlay() {
        // Defensive: same guard as _drawPlay — if scene rolled into PLAY
        // before a stage was loaded, bail rather than throwing through every
        // sub-tick. Caller's next _startStage will populate level + player.
        if (!this.level || !this.player) return;
        if (this._tickPlayHandlePause()) return;
        if (this.trainingMode) this._tickPlayTrainingUpkeep();
        const slowMoSkipEnemies = this._tickPlayAdvanceSlowMo();
        const snap = this._tickPlayCaptureSnapshot();
        this._tickPlayUpdateWorld(slowMoSkipEnemies);
        this._tickPlayWatchdog();
        this._tickPlayHandleHeartbeat();
        achievements.tickBanner();
        this._tickPlayAdvanceBossEntrance();
        this._tickPlayTrackTelemetry(snap);
        this._tickPlayHandleBossPhase();
        if (this._tickPlayHandleBossTriggers()) return;
        // If a boss trigger just routed us into the BOSS_INTRO cinematic,
        // bail before the stage-clear gate runs — bossSpawned is now true
        // but the actual boss enemy doesn't exist yet, which would
        // mis-trigger _tickPlayHandleStageClear and end the stage.
        if (this.scene !== SCENE.PLAY) return;
        this._tickPlayHandleStageClear();
        this._tickPlayHandleDeath();
    }

    // Training-ground per-frame upkeep. Keeps the player armed and full
    // of grenades so the lessons can be replayed without scavenging.
    // Dummy respawning: every enemy spawn position in the training stage
    // is repopulated 90 frames (~1.5s) after the kill so the player can
    // chain practice attempts on the same target.
    _tickPlayTrainingUpkeep() {
        if (!this.player) return;
        // Top up grenades every 30 frames so the player can spam-test the
        // grenade lesson. Cap at GRENADE_MAX so the HUD reads correctly.
        if ((this.player.grenades || 0) < AMBIENT.GRENADE_MAX && this.stageTime % 30 === 0) {
            this.player.grenades = AMBIENT.GRENADE_MAX;
        }
        // Grenade discovery hint fires the first time you pick one up;
        // training auto-pickup pre-empts it. Suppress the hint by setting
        // the seen flag.
        this.player._grenadeHintShown = true;
        // Dummy respawn — only the originally-placed enemies, not boss
        // wave spawns. Each entry gets a respawnCooldown counter that
        // ticks down; when it hits 0 we respawn at the original position.
        if (!this._trainingRespawn) {
            const data = STAGE_LOADERS[this.currentStage]();
            this._trainingRespawn = data.enemySpawns.map(s => ({ ...s, cooldown: 0 }));
        }
        for (const slot of this._trainingRespawn) {
            // Is this slot currently occupied by an alive enemy near its origin?
            const occupied = this.enemies.enemies.some(e =>
                e.alive && Math.abs(e.x - slot.x) < 16 && Math.abs(e.y - slot.y) < 32
            );
            if (occupied) { slot.cooldown = 90; continue; }
            // Don't respawn while the player is standing in the slot — would
            // pop a dummy on top of them and read as "stuck in place" because
            // the new enemy contacts repeatedly while iFrames cycle.
            const px = this.player.x + this.player.w / 2;
            const py = this.player.y + this.player.h / 2;
            if (Math.abs(px - (slot.x + 8)) < 28 && Math.abs(py - (slot.y + 8)) < 32) {
                slot.cooldown = 30; continue;
            }
            slot.cooldown--;
            if (slot.cooldown <= 0) {
                this.enemies.spawn(slot.x, slot.y, slot.type);
                slot.cooldown = 90;
            }
        }
    }

    // Watchdog: clamps every per-frame counter that should never exceed its
    // intended max. A bug-path that bumps hitPause/slowMo/iFrames/etc. into
    // the thousands would otherwise lock the world. Last-resort safety net —
    // if the watchdog ever clamps something, that's the bug to fix at the
    // source, but the player won't be stuck while we diagnose.
    _tickPlayWatchdog() {
        // hitPause caps at HURT_F * 2 = 8 frames. If anything is >30, reset.
        if (this.player.hitPauseFrames > 30) this.player.hitPauseFrames = 0;
        // SlowMo caps at SLOWMO_BOSS_KILL_F (~120). If >240, reset.
        if (this.slowMoFrames > 240) this.slowMoFrames = 0;
        // iFrames caps at IFRAMES (60). Hurt sets 60; nothing should exceed.
        if (this.player.iFrames > 240) this.player.iFrames = 60;
        // bulletTimeFrames is set to 60 on second-chance. Anything beyond
        // 240 is runaway.
        if (this.player.bulletTimeFrames > 240) this.player.bulletTimeFrames = 0;
        // R158: stuck-on-hurt safety net. hurtTimer caps at HURT_FRAMES (36).
        // If anything stalls the in-player decrement (e.g. the player's
        // update was skipped for some yet-undiagnosed reason), the player
        // visually freezes mid-flash with no input. Force-drain and route
        // back to IDLE/FALL so the run never deadlocks.
        if (this.player.hurtTimer > 120) {
            this.player.hurtTimer = 0;
            if (this.player.state === 'hurt') {
                this.player.state = this.player.onGround ? 'idle' : 'fall';
            }
        }
        // R193: runaway-timer safety nets for transient action states.
        // These all have hard frame caps in player.js but a missed
        // decrement (e.g. tick skipped mid-state) can leave the player
        // visually locked in the action without input. Cap each at 4x its
        // designed duration and force back to IDLE/FALL on overrun.
        const pl = this.player;
        if (pl.rollTimer > 120) {
            pl.rollTimer = 0;
            if (pl.state === 'roll') pl.state = pl.onGround ? 'idle' : 'fall';
        }
        if (pl.slideTimer > 100) {
            pl.slideTimer = 0;
            if (pl.state === 'slide') pl.state = pl.onGround ? 'idle' : 'fall';
        }
        if (pl.dashAtkTimer > 80) {
            pl.dashAtkTimer = 0;
            if (pl.state === 'dashatk') pl.state = pl.onGround ? 'idle' : 'fall';
        }
        if (pl.backdashTimer > 80) {
            pl.backdashTimer = 0;
            if (pl.state === 'backdash') pl.state = pl.onGround ? 'idle' : 'fall';
        }
        // R169: "I can jump but can't move" deadlock breaker. If the player
        // is in an input-gating state (GRAPPLE / COVER / LEDGE_HANG / LEDGE_CLIMB
        // / POUNCE) AND has been mashing left or right for the last 60 frames,
        // they're trying to escape but the state isn't letting them out.
        // Force back to IDLE/FALL and clear every anchor — same recovery the
        // state-trap self-heal does, but driven by *user intent* rather than
        // by missing internal state. This catches the bug class where state
        // and anchor are BOTH valid but the player can't reach the exit
        // condition for any of the dozen reasons (geometry edge case, wall
        // probe stuck, etc).
        const p = this.player;
        const dirHeld = input.isHeld('left') || input.isHeld('right');
        // R174: extended gating list. Original R169 set covered the obvious
        // anchor-trap states; added CLIMB (vertical-only, L/R doesn't
        // traverse) so a player who mashes left/right thinking they're stuck
        // gets dropped out of a ladder they didn't mean to grab.
        const gating = (p.state === 'grapple' || p.state === 'cover'
                     || p.state === 'ledgehang' || p.state === 'ledgeclimb'
                     || p.state === 'pounce' || p.state === 'climb');
        if (gating && dirHeld) {
            p._stuckCounter = (p._stuckCounter || 0) + 1;
            if (p._stuckCounter > 60) {
                p._grappleAnchor = null;
                p._grapplePhase = null;
                p._ledgeAnchor = null;
                p._grappleCooldown = 18;
                p._ledgeCooldown = 18;
                p.state = p.onGround ? 'idle' : 'fall';
                p._stuckCounter = 0;
            }
        } else {
            p._stuckCounter = 0;
        }
    }

    // Pause is a hard return — drop the rest of the tick if pressed.
    _tickPlayHandlePause() {
        if (!input.isPressed('pause')) return false;
        this._enterPauseFrom(SCENE.PLAY);
        return true;
    }

    // R351: shared pause-entry — used by platformer PLAY, FPS_PLAY, and
    // BEAT_PLAY so every gameplay scene can pause uniformly. The return
    // scene is captured so the draw side renders the right backdrop and
    // RESUME knows where to send the player.
    _enterPauseFrom(fromScene) {
        audio.sfx('pause');
        this.pauseIndex = 0;
        this._pauseAnim = 0;
        this._pauseReturnScene = fromScene;
        this.scene = SCENE.PAUSE;
    }

    // Slow-mo: tick the countdown and decide whether to skip world tick.
    // R322: ramped envelope. Was a hard 50% (skip every other frame).
    // New envelope:
    //   - First ~20% of slow-mo duration: ramp from 0% → 50% slow (skip 1 of 3)
    //   - Middle 60%: full 50% slow (skip every other frame)
    //   - Last 20%: ramp back from 50% → 0% (skip 1 of 3)
    // Sells the dramatic-zoom feel instead of an abrupt time-jolt.
    _tickPlayAdvanceSlowMo() {
        if (this.slowMoFrames <= 0) {
            this.slowMoTotal = 0;
            return false;
        }
        const remaining = this.slowMoFrames;
        const total = this.slowMoTotal || remaining;
        this.slowMoFrames--;
        // Position within the envelope: 0 = just triggered, 1 = just ending.
        const elapsed = total - remaining;
        const rampIn = total * 0.20;
        const rampOut = total * 0.20;
        const inRampIn  = elapsed < rampIn;
        const inRampOut = remaining < rampOut;
        // During ramps: skip 1 in 3 (33% slower). Counter increments on every
        // call; skip when counter % 3 === 0.
        // During hold: skip 1 in 2 (50% slower) — original behavior.
        if (inRampIn || inRampOut) {
            this._slowMoRampCount = (this._slowMoRampCount || 0) + 1;
            return this._slowMoRampCount % 3 === 0;
        }
        this._slowMoSkip = !this._slowMoSkip;
        return this._slowMoSkip;
    }

    // Snapshot of player state BEFORE the update runs, so we can diff
    // damage taken, kills, and secondChance trigger after.
    _tickPlayCaptureSnapshot() {
        return {
            hp: this.player.hp,
            kills: this.player.kills,
            secondChance: this.player.secondChanceUsed,
        };
    }

    // World tick: player always runs (for input responsiveness), but
    // enemies + camera honor hit-pause and slow-mo.
    _tickPlayUpdateWorld(slowMoSkipEnemies) {
        this.stageTime++;
        this.totalTime++;
        this.level.update();
        if (this._ambientProps) {
            this._ambientProps.update();
            // R416: lightning strikes flag _struck — kick a small shake
            for (const p of this._ambientProps.props) {
                if (p._struck) { p._struck = false; this.camera.shake?.(3); }
            }
        }
        // R330: boss lair update + post-fight cleanup
        if (this._bossLair) {
            this._bossLair.update();
            // Track whether we've ever seen this.boss alive — only THEN
            // does the absence-of-boss mean "boss died." Before the
            // boss-intro resolves, this.boss is null without meaning death.
            if (this.boss && this.boss.alive) this._bossLair._sawBoss = true;
            const bossEverAppeared = this._bossLair._sawBoss === true;
            const bossNowGone = !this.boss || !this.boss.alive;
            if (bossEverAppeared && bossNowGone &&
                this._bossLair.state !== 'exiting' && this._bossLair.state !== 'done') {
                this._bossLair.triggerExit();
            }
            // Clean up when fade-out completes
            if (this._bossLair.state === 'done') {
                // R374: restore the pre-lair parallax bg key (the arena
                // backdrop swap was lair-scoped).
                if (this.parallax && this._preLairBgOverride !== undefined) {
                    this.parallax.bgKeyOverride = this._preLairBgOverride;
                    this._preLairBgOverride = undefined;
                }
                this._bossLair = null;
            }
            // Clamp player x to lair's left wall while active
            if (this._bossLair && this.player) {
                const wall = this._bossLair.leftWall();
                if (this.player.x < wall) {
                    this.player.x = wall;
                    if (this.player.vx < 0) this.player.vx = 0;
                }
            }
        }
        this.player.update(this.level, this.camera);
        const hitPause = (this.player.hitPauseFrames || 0) > 0;
        if (hitPause) {
            this.player.hitPauseFrames--;
        } else if (slowMoSkipEnemies) {
            // R232: use boss-arena camera if boss is active so it stays framed.
            // R334: chase bosses (HELICOPTER) use the regular player-follow
            // camera so the player can scroll forward through the stage.
            // Arena bosses use the midpoint camera so both stay framed.
            const chaseBoss = this.boss && this.boss.kind === 'HELICOPTER';
            if (this.boss && this.boss.alive && !chaseBoss) {
                this.camera.followBossArena(this.player, this.boss);
            } else {
                this.camera.follow(this.player, this.player.facing);
            }
            this.camera.update();
        } else {
            this.enemies.update(this.level, this.player);
            this.pickups.update(this.level, this.player);
            // R334: chase bosses (HELICOPTER) use the regular player-follow
            // camera so the player can scroll forward through the stage.
            // Arena bosses use the midpoint camera so both stay framed.
            const chaseBoss = this.boss && this.boss.kind === 'HELICOPTER';
            if (this.boss && this.boss.alive && !chaseBoss) {
                this.camera.followBossArena(this.player, this.boss);
            } else {
                this.camera.follow(this.player, this.player.facing);
            }
            this.camera.update();
        }
        if (this.player.requestShake) {
            this.camera.shake(this.player.requestShake);
            this.player.requestShake = 0;
        }
    }

    // Low-HP heartbeat tick. Plays the heartbeat SFX at the AMBIENT-tuned
    // interval when player is at 1 HP. Resets the counter when not in danger.
    _tickPlayHandleHeartbeat() {
        if (this.player.hp <= 1 && this.player.hp > 0) {
            this._hbTick = (this._hbTick || 0) + 1;
            if (this._hbTick >= AMBIENT.HEARTBEAT_PERIOD_F) {
                audio.sfx('heartbeat');
                this._hbTick = 0;
            }
        } else {
            this._hbTick = 0;
        }
    }

    // Boss entrance overlay age tick. Mini-boss = 80f, full boss = 120f.
    _tickPlayAdvanceBossEntrance() {
        if (!this._bossEntrance) return;
        this._bossEntrance.age++;
        const dur = this._bossEntrance.isMini ? 80 : 120;
        if (this._bossEntrance.age >= dur) this._bossEntrance = null;
    }

    // Diff vs. pre-update snapshot — damage taken, new kills, second-chance.
    _tickPlayTrackTelemetry(snap) {
        if (this.player.hp < snap.hp) this.stageStats.damageTaken += (snap.hp - this.player.hp);
        if (this.player.kills > snap.kills) this.stageStats.kills += (this.player.kills - snap.kills);
        if (this.player.secondChanceUsed && !snap.secondChance) {
            this.runStats.bulletTimeUses++;
            this.triggerSlowMo(AMBIENT.SLOWMO_SECOND_CHANCE_F);
            this.camera.shake(6);
        }
    }

    // Boss phase-2 transition: slow-mo + shake.
    _tickPlayHandleBossPhase() {
        if (this.boss && this.boss.alive) {
            if (this._lastBossPhase === 1 && this.boss.phase === 2) {
                this.triggerSlowMo(AMBIENT.SLOWMO_BOSS_PHASE_F);
                this.camera.shake(5);
            }
            this._lastBossPhase = this.boss.phase;
        } else {
            this._lastBossPhase = null;
        }
    }

    // Mini-boss + full-boss + boss-rush spawn gates. Returns true if the
    // boss-rush early-return fires so the caller bails the rest of the tick.
    _tickPlayHandleBossTriggers() {
        // Training ground has no boss/mini-boss; skip both triggers cleanly.
        const bossTrigger = this.level.data.bossTrigger;
        if (this.trainingMode || !bossTrigger) {
            this.boss = this.enemies.activeBoss();
            return false;
        }
        const miniTrigger = this.level.data.miniBossTrigger;
        if (!this.miniBossSpawned && miniTrigger != null && this.player.x > miniTrigger) {
            this._spawnMiniBoss();
        }
        if (!this.bossSpawned && this.player.x > bossTrigger.x) {
            this._spawnBoss();
        }
        this.boss = this.enemies.activeBoss();
        if (this.bossSpawned && !this.boss && this._gauntletQueue?.length) {
            this._spawnNextGauntlet();
            return true;
        }
        return false;
    }

    // Stage-clear gate: fires if the (real) boss is dead, or the player
    // crossed an exit tile (debug fallback for no-boss stages).
    _tickPlayHandleStageClear() {
        // Stash boss position every tick while alive — _tickPlayHandleBossTriggers
        // (earlier in the tick) nulls this.boss the same frame the kill is
        // detected, so _onStageClear needs the prior position to know where to
        // spawn the 8-burst boss-kill payoff.
        if (this.boss) {
            this._lastBossPos = { x: this.boss.x + this.boss.w / 2, y: this.boss.y + this.boss.h / 2 };
        }
        if (this.bossSpawned && !this.boss) {
            // Boss-kill beat — once per stage, before _onStageClear schedules
            // the panel. Gauntlet swap-outs short-circuit earlier in the tick
            // (_tickPlayHandleBossTriggers), so reaching here is a real kill.
            if (!this._bossKillBeatFired) {
                this._bossKillBeatFired = true;
                this.triggerSlowMo(AMBIENT.SLOWMO_BOSS_KILL_F);
                this.camera.shake(6);
                // R520: red "TARGET DOWN" stamp during the slow-mo window.
                // Big bold text overlay tied to the boss-kill beat — gives
                // the kill weight beyond just an explosion + slow-mo.
                this._bossKillStampT = 90;
            }
            this._onStageClear();
        }
        const ex = this.player.x + this.player.w / 2;
        const ey = this.player.y + this.player.h;
        if (this.level.isExit(ex, ey)) {
            // Training ground exits straight back to TITLE — no stage-clear
            // panel because nothing was earned. _restartRun resets player
            // state and currentStage cleanly.
            if (this.trainingMode) {
                audio.sfx('select');
                this._restartRun();
                return;
            }
            // R349: stages that HAVE a boss require the boss to be dead
            // before the exit tile clears the stage. Stages without a
            // boss (any debug / no-boss-trigger level) exit normally.
            // Boss-kill path above (bossSpawned && !this.boss) already
            // routes to _onStageClear, so reaching the exit tile is
            // either an early-exit cheese OR a legitimate post-boss walk.
            const stg = STAGES[this.currentStage];
            const stageHasBoss = !!(stg && stg.boss);
            if (stageHasBoss && !this._bossKillBeatFired) {
                // Floating tag tells the player WHY the exit isn't firing.
                // Throttled so it doesn't spam every frame they stand here.
                if ((this._exitWarnCD || 0) <= 0) {
                    this._exitWarnCD = 90;   // 1.5s cooldown
                    if (particles.floatingText) {
                        particles.floatingText(
                            this.player.x + this.player.w / 2,
                            this.player.y - 8,
                            'BOSS NOT DEFEATED',
                            '#ff6080', 60, -0.4, 1,
                        );
                    }
                    audio.sfx?.('hurt');
                }
                return;
            }
            this._onStageClear();
        }
        if (this._exitWarnCD > 0) this._exitWarnCD--;
    }

    // Death handler: decrement lives, route to GAME_OVER if exhausted,
    // otherwise respawn at the stage's playerStart.
    _tickPlayHandleDeath() {
        // God-mode respawn path — pit-fall in training mode flags the player
        // for a silent teleport-back without touching lives/totalDeaths.
        if (this.player._godModeRespawn) {
            this.player._godModeRespawn = false;
            this._respawn();
            return;
        }
        if (!this.player.isDead()) return;
        this.totalDeaths++;
        this.player.lives--;
        if (this.player.lives < 0) {
            this.gameOverIndex = 0;
            this.storyTimer = 0;
            this._fadeTo(SCENE.GAME_OVER);
        } else {
            this._respawn();
        }
    }

    _drawPlay() {
        const ctx = this.ctx;
        // Defensive: if scene was switched to PLAY before _startStage ran
        // (corrupt state, edge race, debug tinkering), fall back to a black
        // frame instead of throwing in render. Caller will recover on next
        // _startStage; we just don't want a single bad render to nuke the
        // canvas + spam the console with TypeError every frame.
        if (!this.level || !this.player) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            return;
        }
        this.parallax.drawBack(ctx, this.camera);
        this.level.draw(ctx, this.camera);
        // R356: arena backdrop — sits AFTER the level so the tint
        // washes over tiles too (sells "darker place"), but BEFORE
        // ambient props and decorations so those still read clearly.
        if (this._bossLair) this._bossLair.drawArenaBackdrop(ctx, this.camera);
        // R332: ambient props (dying Clippies, fires, flickers, sparks)
        // draw between the level tiles and gameplay entities — sits AHEAD
        // of pickups so a dying Clippy doesn't occlude a pickup, but
        // BEHIND enemies so the player + enemies always read on top.
        if (this._ambientProps) this._ambientProps.draw(ctx, this.camera);
        // R330: boss lair decorations sit ahead of tiles but BEHIND the
        // gameplay layer — same Z as ambient props.
        if (this._bossLair) this._bossLair.drawDecorationsBack(ctx, this.camera);
        this.pickups.draw(ctx, this.camera);
        this.enemies.draw(ctx, this.camera);
        this.player.draw(ctx, this.camera, this.level);
        // R330: gate draws OVER the player so the player can't walk past it
        // visually. drawNameTag is drawn last in the play-draw chain so
        // the "LAIR NAME" banner sits over everything.
        if (this._bossLair) this._bossLair.drawGate(ctx, this.camera);
        particles.draw(ctx, this.camera);
        particles.drawFloats(ctx, this.camera, drawText, drawTextOutlined);
        // Grass tips paint OVER player + enemies so the hidden read is sold.
        this.level.drawGrassForeground(ctx, this.camera);
        this.parallax.drawFront(ctx, this.camera);
        // R421/R422: screen-flash overlay — colored full-screen wash that
        // fades from peak alpha → 0 across its lifetime.
        if (this._flashFrames > 0) {
            const t = this._flashFrames / Math.max(1, this._flashTotal);
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, this._flashAlphaPeak * t));
            ctx.fillStyle = this._flashColor;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
            this._flashFrames--;
            if (this._flashFrames === 0) { this._flashTotal = 0; this._flashAlphaPeak = 0; }
        }
        // Soft corner vignette — subtly darkens the screen edges so the eye
        // gravitates to the gameplay center. r102: peak edge alpha dropped
        // from 0.22 (0.55 × 0.4) to ~0.15 (0.42 × 0.35) after the r100/r101
        // darken cuts. Vignette is now framing, not the dominant dim layer.
        if (!this._playVignette) {
            const g = ctx.createRadialGradient(
                GAME.W / 2, GAME.H / 2, GAME.H * 0.35,
                GAME.W / 2, GAME.H / 2, GAME.W * 0.75
            );
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.42)');
            this._playVignette = g;
        }
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = this._playVignette;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        ctx.restore();
        // Combo-tier vignette pulse — at high combo tiers, layer a warm
        // colored edge glow over the standard vignette so the player FEELS
        // the "in the zone" state without needing to look at the HUD.
        // Tier 1 (10+): faint gold; tier 2 (25+): warmer orange;
        // tier 3 (50+): white-hot. Pulses with a slow sine.
        const c = this.player?.combo || 0;
        const cTier = c >= 50 ? 3 : c >= 25 ? 2 : c >= 10 ? 1 : 0;
        if (cTier > 0) {
            if (!this._comboVignettes) this._comboVignettes = {};
            if (!this._comboVignettes[cTier]) {
                const COLORS = [
                    null,
                    'rgba(255, 224, 112, 0.18)',
                    'rgba(255, 144, 48, 0.24)',
                    'rgba(255, 255, 255, 0.32)',
                ];
                const g = ctx.createRadialGradient(
                    GAME.W / 2, GAME.H / 2, GAME.H * 0.32,
                    GAME.W / 2, GAME.H / 2, GAME.W * 0.7
                );
                g.addColorStop(0, 'rgba(0,0,0,0)');
                g.addColorStop(1, COLORS[cTier]);
                this._comboVignettes[cTier] = g;
            }
            const pulse = (Math.sin(performance.now() * 0.005) + 1) * 0.5;
            ctx.save();
            ctx.globalAlpha = 0.55 + pulse * 0.35;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = this._comboVignettes[cTier];
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            ctx.restore();
        }
        // R213: suppress HUD when a sub-menu is open (OPTIONS/
        // ACHIEVEMENTS/SOUNDTRACK/GALLERY). _drawPlay is called as the
        // backdrop for those scenes, but the HUD it normally paints
        // collides with the panel title row — lives, score, and timer
        // visibly overlap the "ACHIEVEMENTS" / "SOUNDTRACK" headers.
        // The PAUSE menu has its own framed overlay so the HUD doesn't
        // intrude there, but it's a freebie to suppress consistently.
        const subMenuOpen = this.scene === SCENE.OPTIONS
            || this.scene === SCENE.ACHIEVEMENTS
            || this.scene === SCENE.SOUNDTRACK
            || this.scene === SCENE.GALLERY;
        const showBoss = this.scene === SCENE.PLAY || this.scene === SCENE.PAUSE;
        if (!subMenuOpen) {
            drawHUD(ctx, {
                player: this.player,
                score: this.player.score,
                time: this.totalTime,
                boss: showBoss ? (this.boss || this.enemies.activeMiniBoss()) : null,
                camera: this.camera,
                training: this.trainingMode,
                bossRush: this.bossRushMode,
                timeTrial: this.timeTrialMode,
                stageTime: this.stageTime,
                bestBossRushTime: achievements.stats?.bestBossRushTime || 0,
                bestTimeTrialTime: achievements.stats?.bestTimeTrialTime || 0,
            });
        }
        if (this._bossEntrance) this._drawBossEntrance();
        // R330: boss-lair name tag (banner at top of screen during lair entry)
        if (this._bossLair) this._bossLair.drawNameTag(ctx);
        // Training-ground zone banners — floating instructional text per zone.
        if (this.trainingMode) this._drawTrainingBanners();
        // First-stage demo hint — execs see this on their first play.
        // Shows ARROWS/Z/X labels for ~6 seconds, then fades. Stage-1 only,
        // first run only (gated on stageTime < 360f && currentStage === 1).
        // Hide unconditionally during boss / mini-boss encounters — boss
        // name + HP bar live in the bottom strip and the hint collides
        // with both. By the time a boss spawns the exec has read the hint.
        const _bossActive = (this.boss && this.boss.alive) || this._bossEntrance;
        // R513: show the stage-1 in-game controls hint for ALL players
        // (not just those who skipped READY). Reinforces controls for
        // newcomers in the heat of the action — fades in 30-90, holds
        // until 330, fades out by 420 (~7 seconds total). Veterans don't
        // mind a fading bottom overlay during the first 7 seconds; new
        // players genuinely benefit from the reinforcement.
        // Suppress in Time Trial — player has already beaten the game.
        // Suppress during boss/mini-boss — hint collides with boss bar.
        if (!_bossActive && !this.timeTrialMode
            && this.scene === SCENE.PLAY && this.currentStage === 1
            && this.stageTime > 30 && this.stageTime < 420) {
            const t = this.stageTime;
            // Fade in 30-90, hold 90-330, fade out 330-420
            let alpha = 0;
            if (t < 90) alpha = (t - 30) / 60;
            else if (t < 330) alpha = 1;
            else alpha = Math.max(0, (420 - t) / 90);
            alpha *= 0.7; // never fully opaque; ghostly overlay
            ctx.save();
            ctx.globalAlpha = alpha;
            // Bottom-center semi-transparent panel — two-line hint covers
            // the core moves + the special button so execs don't have to
            // dig through the readme to find grapple/dash/grenade.
            const px = GAME.W / 2;
            const py = GAME.H - 24;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.fillRect(px - 96, py - 12, 192, 22);
            ctx.fillStyle = '#604068';
            ctx.fillRect(px - 96, py - 12, 192, 1);
            ctx.fillRect(px - 96, py + 9,  192, 1);
            drawText(ctx, 'ARROWS MOVE   Z JUMP   X SHOOT',   px, py - 6, '#ffe070', 1, 'center');
            drawText(ctx, 'C GRAPPLE / DASH   V GRENADE',     px, py + 2, '#c0a0d0', 1, 'center');
            ctx.restore();
        }
        // R336: sewer → lab cinematic overlay. While _pipelineCineT is
        // ticking (0..90), paint a black fade + 'DESCENDING' text card so
        // the bg-swap reads as a real transition instead of a hard cut.
        if (this._pipelineCineT != null) {
            const t = this._pipelineCineT;
            // Fade curve: 0→1 over frames 0-30, hold at 1 for 30-60,
            // then 1→0 over 60-90.
            let alpha;
            if (t < 30) alpha = t / 30;
            else if (t < 60) alpha = 1;
            else alpha = (90 - t) / 30;
            ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            // Mid-card text — 'DESCENDING' subtitle while screen is black
            if (t >= 28 && t <= 60) {
                const textAlpha = t < 35 ? (t - 28) / 7 : t > 55 ? (60 - t) / 5 : 1;
                ctx.globalAlpha = Math.max(0, Math.min(1, textAlpha));
                drawText(ctx, 'DESCENDING', GAME.W / 2, GAME.H / 2 - 4, '#80c060', 1, 'center');
                drawText(ctx, '...DEEPER...', GAME.W / 2, GAME.H / 2 + 6, '#506040', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }
        // R520: TARGET DOWN stamp during boss-kill slow-mo. Big bold red
        // stamp that scales in (1.5x → 1.0x) over first 15f, holds, then
        // fades alpha → 0 over the last 30f. Reads like a hand-stamped
        // case-closed file label.
        if (this._bossKillStampT > 0) {
            const total = 90;
            const t = total - this._bossKillStampT;
            this._bossKillStampT--;
            ctx.save();
            const cx = GAME.W / 2;
            const cy = GAME.H / 2 - 8;
            // Scale-in for first 15 frames
            const scale = t < 15 ? 1.5 - (t / 15) * 0.5 : 1.0;
            const rot = t < 8 ? (8 - t) * 0.04 : 0.04 + Math.sin(t * 0.04) * 0.005;
            const alpha = this._bossKillStampT < 30 ? this._bossKillStampT / 30 : 1;
            ctx.globalAlpha = alpha;
            ctx.translate(cx, cy);
            ctx.rotate(rot - 0.08);
            ctx.scale(scale, scale);
            // Background red box behind the text for the stamp feel
            const w = 100, h = 24;
            ctx.strokeStyle = '#ff1a1a';
            ctx.lineWidth = 2;
            ctx.strokeRect(-w / 2, -h / 2, w, h);
            ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
            drawTextOutlined(ctx, 'TARGET DOWN', 0, -4, '#ff3030', '#3a0a0a', 1, 'center');
            ctx.restore();
        }
    }

    // ============== boss intro cinematic ==============
    // Total duration: 150f (~2.5s). Phases:
    //   0-20    bars slide in + dim ramp + portrait spawn off-right
    //   20-110  portrait slides in, name + bark reveal, pulsing accent
    //   110-130 hold
    //   130-145 WARNING red flash buildup
    //   145-150 transition to play (boss actually spawns at 150)
    // Skippable: after 30f, X / jump / start jumps to end-of-slide.
    _tickBossIntro() {
        if (!this._bossIntro) return;
        // R157+R173: two-phase intro that holds at the readable beat until
        // the player presses X / jump / start. Frames 0..N play out the slide
        // animation, then we PAUSE at the hold point so the bark + name are
        // legible. Press to advance to the next phase / fight start.
        const phase = this._bossIntro.phase || 'villain';
        // Test-only escape hatch: probes set _bossIntro.autoAdvance to bypass
        // the user-press hold so they can run the cinematic to completion
        // headlessly without dispatching synthetic key events.
        const advance = this._bossIntro.autoAdvance
            || input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start');
        // Once `released` flips true the phase animates out instead of holding.
        // Tracked per-phase: cleared on phase transition so each phase needs
        // its own input press to advance.
        if (phase === 'villain') {
            const HOLD_AT = 110;
            if (this._bossIntro.age < HOLD_AT) {
                this._bossIntro.age++;
                if (this._bossIntro.age === 20) audio.sfx('bossEntrance');
            } else if (this._bossIntro.released || advance) {
                this._bossIntro.released = true;
                if (this._bossIntro.age < 150) this._bossIntro.age++;
            }
            if (this._bossIntro.age >= 150) {
                this._bossIntro.phase = 'counter';
                this._bossIntro.age = 0;
                this._bossIntro.released = false;  // counter needs its own press
            }
        } else {
            const HOLD_AT = 50;
            if (this._bossIntro.age < HOLD_AT) {
                this._bossIntro.age++;
                if (this._bossIntro.age === 12) audio.sfx('pounceStab');
            } else if (this._bossIntro.released || advance) {
                this._bossIntro.released = true;
                if (this._bossIntro.age < 80) this._bossIntro.age++;
            }
            if (this._bossIntro.age >= 80) this._finishBossIntro();
        }
    }

    _drawBossIntro() {
        if (!this._bossIntro) return;
        if ((this._bossIntro.phase || 'villain') === 'counter') {
            this._drawClippyCounter();
            return;
        }
        const ctx = this.ctx;
        const t = this._bossIntro.age;
        const stg = STAGES[this.currentStage];
        if (!stg) return;
        const bossKey = stg.boss;
        const bark = BOSS_BARK[stg.boss] || ['', ''];
        // Phase ratios
        const slideInF = 20;
        const flashStartF = 130;
        const flashEndF = 145;

        // Painted boss-room backdrop — fill the frame with the boss's
        // cinematic plate. Falls back to gameplay scene + dim if the asset
        // is missing. Slight Ken-Burns push-in over the cinematic gives the
        // shot life.
        // GAUNTLET / GAUNTLET_FULL don't have a unique boss-room plate;
        // fall back to the server-room backdrop (matches both stages 7 + 11).
        // R523: SERVER_TOWER (CRTRON) also reuses the BSOD/server-room
        // backdrop until a bespoke CRTRON portrait painting lands.
        let bgBoss = bossKey;
        if (bossKey === 'GAUNTLET' || bossKey === 'GAUNTLET_FULL') bgBoss = 'CTRL_ALT_DEL';
        else if (bossKey === 'SERVER_TOWER') bgBoss = 'CTRL_ALT_DEL';
        const bgKey = 'boss_intro_' + bgBoss;
        if (sprites.has(bgKey)) {
            const img = sprites.images.get(bgKey);
            // Push-in: 1.0 → 1.08 over 150f. Anchor center.
            const zoom = 1.0 + Math.min(0.08, t * 0.00055);
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height) * zoom;
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            // Fallback to gameplay scene if no painted plate exists
            this._drawPlay();
        }

        // Scene dim — r101 dropped from 0.35 → 0.18 peak. The painted
        // backdrops already carry their own moody darkness; another 35%
        // black overlay made them ghostly and pushed the boss-name text
        // into near-invisible territory. 0.18 keeps a hint of cinematic
        // press-down without occluding the painted detail.
        const PEAK = 0.18;
        let dim;
        if (t < slideInF) dim = (t / slideInF) * PEAK;
        else if (t < flashStartF) dim = PEAK;
        else if (t < flashEndF) dim = PEAK - ((t - flashStartF) / (flashEndF - flashStartF)) * PEAK;
        else dim = 0;
        ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Letterbox bars — full at age 20, full hold, retract during flash
        const barMax = 36;
        let barH = 0;
        if (t < slideInF) barH = (t / slideInF) * barMax;
        else if (t < flashStartF) barH = barMax;
        else if (t < flashEndF) barH = (1 - (t - flashStartF) / (flashEndF - flashStartF)) * barMax;
        else barH = 0;
        ctx.fillStyle = 'rgba(8, 4, 14, 0.92)';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);
        // Accent strips on bars
        if (barH > 4) {
            ctx.fillStyle = '#a82020';
            ctx.fillRect(0, barH - 1, GAME.W, 1);
            ctx.fillRect(0, GAME.H - barH, GAME.W, 1);
        }

        // Boss portrait — slides in from the right between t=20 and t=50.
        // Anchored at right edge with a small margin. 60x60 PNG painted up to
        // ~88px so it dominates the right third of the frame.
        // GAUNTLET / GAUNTLET_FULL have no painted portrait (they're meta
        // bosses made of multiple earlier bosses). Show the first queue boss
        // (COPIER_3000) so the intro reads as "the parade begins" instead
        // of a red blank.
        const portraitBoss = (bossKey === 'GAUNTLET' || bossKey === 'GAUNTLET_FULL')
            ? 'COPIER_3000' : bossKey;
        const portraitKey = 'boss_' + portraitBoss;
        const targetX = GAME.W - 90;
        const startX = GAME.W + 20;
        const slideStart = 20, slideEnd = 50;
        let portraitX;
        if (t < slideStart) portraitX = startX;
        else if (t < slideEnd) {
            const k = (t - slideStart) / (slideEnd - slideStart);
            const ease = 1 - (1 - k) * (1 - k); // ease-out
            portraitX = startX + (targetX - startX) * ease;
        } else portraitX = targetX;
        const portraitY = (GAME.H - 88) / 2;
        if (sprites.has(portraitKey)) {
            const img = sprites.images.get(portraitKey);
            ctx.imageSmoothingEnabled = false;
            // Subtle pulse — sin breathing scale ±2px after portrait lands
            let pulse = 0;
            if (t >= slideEnd) pulse = Math.sin((t - slideEnd) * 0.10) * 1.5;
            ctx.drawImage(img, portraitX - pulse, portraitY - pulse, 88 + pulse * 2, 88 + pulse * 2);
        } else {
            // Fallback — red silhouette block so testing without art still works
            ctx.fillStyle = '#601020';
            ctx.fillRect(portraitX, portraitY, 88, 88);
        }

        // Name + tagline + 2-line villain bark in the left third.
        // Text typewriter-reveals after the portrait lands (t >= 50).
        const textX = 12;
        const textY = GAME.H / 2 - 30;
        if (t > slideEnd) {
            const reveal = Math.min(1, (t - slideEnd) / 25);
            ctx.globalAlpha = reveal;
            drawTextOutlined(ctx, BOSS_DISPLAY_NAME[stg.boss] || stg.boss,
                             textX, textY, '#ff5050', '#1a0000', 2, 'left');
            if (stg.tagline) {
                drawText(ctx, stg.tagline, textX, textY + 20, '#ffe070', 1, 'left');
            }
            ctx.globalAlpha = 1;
        }
        // Bark — second wave reveal, lines stagger
        if (t > slideEnd + 20) {
            const ry = textY + 36;
            const k = Math.min(1, (t - slideEnd - 20) / 20);
            ctx.globalAlpha = k;
            drawText(ctx, bark[0] || '', textX, ry,      '#c0a0d0', 1, 'left');
            ctx.globalAlpha = 1;
        }
        if (t > slideEnd + 40) {
            const ry = textY + 48;
            const k = Math.min(1, (t - slideEnd - 40) / 20);
            ctx.globalAlpha = k;
            drawText(ctx, bark[1] || '', textX, ry,      '#c0a0d0', 1, 'left');
            ctx.globalAlpha = 1;
        }

        // WARNING flash — pulses red full-screen between 130 and 145
        if (t >= flashStartF && t < flashEndF) {
            const k = (t - flashStartF) / (flashEndF - flashStartF);
            const flash = Math.sin(k * Math.PI) * 0.55;
            ctx.fillStyle = `rgba(255, 30, 30, ${flash.toFixed(3)})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            drawTextOutlined(ctx, 'WARNING', GAME.W / 2, GAME.H / 2 - 4,
                             '#fff', '#a82020', 3, 'center');
        }

        // R173: prompt hint. The cinematic holds at the readable beat until
        // the user presses X — pulse a "PRESS X" prompt so they know it's
        // waiting on them, not stuck.
        if (t >= 70 && t < flashStartF && (t % 60 < 40)) {
            drawTextOutlined(ctx, 'PRESS X', GAME.W - 38, GAME.H - 10,
                             '#ffe070', '#1a0000', 1, 'left');
        }
    }

    // R199: procedural cinematic rifle helper removed. User feedback:
    // "stop with anything procedural. we need sprites." The counter-slide
    // will use a painted Clippy-with-gun pose once the Local Howl run-cycle
    // sheet lands (any of its frames will show Clippy holding the rifle —
    // pick one for the portrait).

    // R157: Clippy counter-slide — mirror of the villain slide. 80f total.
    //   0-15   bars hold + Clippy portrait slides in from the LEFT
    //   15-50  name + tagline + counter-bark typewriter
    //   50-70  hold
    //   70-80  bars retract + fade out into PLAY
    _drawClippyCounter() {
        if (!this._bossIntro) return;
        const ctx = this.ctx;
        const t = this._bossIntro.age;
        const stg = STAGES[this.currentStage];
        const counter = CLIPPY_COUNTER_BARK[stg.boss] || ['', ''];
        const fadeOutF = 70;
        const totalF = 80;

        // Reuse the same painted boss-room plate so the counter reads as the
        // same scene, just framed on Clippy. Ken-Burns continues the push-in.
        const bgBoss = (stg.boss === 'GAUNTLET' || stg.boss === 'GAUNTLET_FULL')
            ? 'CTRL_ALT_DEL' : stg.boss;
        const bgKey = 'boss_intro_' + bgBoss;
        if (sprites.has(bgKey)) {
            const img = sprites.images.get(bgKey);
            // Resume from where the villain slide left off (~1.08) and push
            // a touch further so the camera feels alive through the cut.
            const zoom = 1.08 + Math.min(0.04, t * 0.0005);
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height) * zoom;
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            this._drawPlay();
        }

        // Match the villain slide's dim peak so the cut between phases
        // doesn't pop with a brightness change.
        const PEAK = 0.18;
        let dim = PEAK;
        if (t >= fadeOutF) dim = PEAK - ((t - fadeOutF) / (totalF - fadeOutF)) * PEAK;
        ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Letterbox bars carry through, then retract.
        const barMax = 36;
        let barH = barMax;
        if (t >= fadeOutF) barH = (1 - (t - fadeOutF) / (totalF - fadeOutF)) * barMax;
        ctx.fillStyle = 'rgba(8, 4, 14, 0.92)';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);
        // Accent strip in Clippy's blue this time so the eye knows the
        // protagonist owns this beat.
        if (barH > 4) {
            ctx.fillStyle = '#3070c0';
            ctx.fillRect(0, barH - 1, GAME.W, 1);
            ctx.fillRect(0, GAME.H - barH, GAME.W, 1);
        }

        // Clippy portrait slides in from the LEFT. Mirror of the villain
        // portrait math but anchored to the left edge. Uses the same 'idle'
        // sprite the gameplay loop renders, so the cut-to-play stays
        // visually continuous.
        // R205: portrait aspect was hard-coded for v5_idle (28/56 ≈ 0.5).
        // After R201 routed 'idle' to v6_run_2.png (26×40, aspect 0.65),
        // the old math stretched Clippy too thin. Read the actual source
        // aspect off the loaded image so any future re-route stays
        // correctly proportioned.
        const portraitKey = 'idle';
        const portraitH = 88;
        const portraitImg = sprites.images.get(portraitKey);
        const portraitAspect = portraitImg
            ? portraitImg.width / portraitImg.height
            : 28 / 56;
        const portraitW = Math.round(portraitH * portraitAspect);
        const targetX = 12;
        const startX = -portraitW - 20;
        const slideStart = 0, slideEnd = 15;
        let portraitX;
        if (t < slideStart) portraitX = startX;
        else if (t < slideEnd) {
            const k = (t - slideStart) / (slideEnd - slideStart);
            const ease = 1 - (1 - k) * (1 - k);
            portraitX = startX + (targetX - startX) * ease;
        } else portraitX = targetX;
        const portraitY = (GAME.H - portraitH) / 2;
        if (sprites.has(portraitKey)) {
            const img = sprites.images.get(portraitKey);
            ctx.imageSmoothingEnabled = false;
            // Same idle-breath pulse as the villain side for symmetry.
            let pulse = 0;
            if (t >= slideEnd) pulse = Math.sin((t - slideEnd) * 0.10) * 1.5;
            ctx.drawImage(img,
                portraitX - pulse, portraitY - pulse,
                portraitW + pulse * 2, portraitH + pulse * 2);
        } else {
            ctx.fillStyle = '#3070c0';
            ctx.fillRect(portraitX, portraitY, portraitW, portraitH);
        }

        // R199: procedural rifle overlay removed. Counter-slide reads
        // the painted portrait as-is; once the Local Howl run-cycle sheet
        // lands we'll pick a frame that already shows Clippy with rifle
        // and route it to `clippy_counter_portrait` for this beat.

        // Name + tagline + counter-bark on the RIGHT (mirrors villain layout).
        // 'CLIPPY' stays as the canonical name even on stage 6 where the
        // antagonist is also named "CLIPPY 2" — the player is always CLIPPY.
        const textRight = GAME.W - 12;
        const textY = GAME.H / 2 - 30;
        if (t > slideEnd) {
            const reveal = Math.min(1, (t - slideEnd) / 12);
            ctx.globalAlpha = reveal;
            drawTextOutlined(ctx, 'CLIPPY', textRight, textY,
                             '#80c0ff', '#001020', 2, 'right');
            drawText(ctx, 'NO MORE WORD DOCUMENTS', textRight, textY + 20,
                     '#ffe070', 1, 'right');
            ctx.globalAlpha = 1;
        }
        // Counter-bark reveal — single line for now (matches one-liner taunt).
        if (t > slideEnd + 12) {
            const ry = textY + 36;
            const k = Math.min(1, (t - slideEnd - 12) / 15);
            ctx.globalAlpha = k;
            drawText(ctx, counter[0] || '', textRight, ry, '#c0e0ff', 1, 'right');
            ctx.globalAlpha = 1;
        }

        // R173: continue prompt mirrored to the LEFT this time so it doesn't
        // visually overlap with the counter-bark text on the right.
        if (t >= 35 && t < fadeOutF && (t % 60 < 40)) {
            drawTextOutlined(ctx, 'PRESS X', 12, GAME.H - 10,
                             '#80c0ff', '#001020', 1, 'left');
        }
    }

    // Boss entrance overlay — see _triggerBossEntrance for phase timings.
    _drawBossEntrance() {
        const ctx = this.ctx;
        const t = this._bossEntrance.age;
        const isMini = !!this._bossEntrance.isMini;
        const boss = this.boss || this.enemies.activeMiniBoss();
        if (!boss) return;
        const total = isMini ? 80 : 120;
        const flashF = isMini ? 0 : 15;
        const holdEnd = isMini ? 55 : 90;
        const barMax = isMini ? 16 : 26;
        // Phase 1: red flash (full boss only)
        if (!isMini && t < flashF) {
            const a = (1 - t / flashF) * 0.5;
            ctx.fillStyle = `rgba(255, 40, 40, ${a})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Letterbox bars
        const slideIn = isMini ? 10 : 15;
        const fadeF = total - holdEnd;
        let barH = 0;
        if (t < slideIn) barH = (t / slideIn) * barMax;
        else if (t < holdEnd) barH = barMax;
        else barH = (1 - (t - holdEnd) / fadeF) * barMax;
        ctx.fillStyle = 'rgba(8, 4, 14, 0.9)';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);
        // Title
        let alpha = 1;
        if (t < slideIn) alpha = t / slideIn;
        else if (t > holdEnd) alpha = Math.max(0, (total - t) / fadeF);
        ctx.globalAlpha = alpha;
        const cy = GAME.H / 2;
        const plateH = isMini ? 28 : 36;
        const titleY = cy - (isMini ? 10 : 12);
        const tagY   = cy + (isMini ? 2 : 4);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, cy - plateH / 2, GAME.W, plateH);
        ctx.fillStyle = isMini ? '#604030' : '#a82020';
        ctx.fillRect(0, cy - plateH / 2, GAME.W, 1);
        ctx.fillRect(0, cy + plateH / 2 - 1, GAME.W, 1);
        drawTextOutlined(ctx, boss.name || 'BOSS', GAME.W / 2, titleY,
                         isMini ? '#ffa050' : '#ff5050', '#1a0000',
                         isMini ? 1 : 2, 'center');
        if (boss.tagline) {
            drawText(ctx, boss.tagline, GAME.W / 2, tagY, '#ffe070', 1, 'center');
        }
        ctx.globalAlpha = 1;
    }

    // Training-ground floating banners. Each banner is anchored at a world-x
    // and fades in as the player approaches, holds while in zone, fades out
    // when they leave. Drawn above the play area, below the HUD.
    _drawTrainingBanners() {
        if (!this._trainingBanners || !this._trainingBanners.length) return;
        if (!this.player) return;
        const ctx = this.ctx;
        const px = this.player.x + this.player.w / 2;
        // Find the nearest banner within ~7-tile (112px) window
        let active = null;
        let bestDist = Infinity;
        for (const b of this._trainingBanners) {
            const d = Math.abs(b.x - px);
            if (d < 112 && d < bestDist) { bestDist = d; active = b; }
        }
        if (!active) return;
        if (bestDist > 100) return;
        // R169: compact corner-tile layout. Prior passes used a big centered
        // panel that always overlapped either Clippy's head or his feet
        // depending on screen position. Drop it to a small top-LEFT card
        // outside the play action — tucked next to the HUD strip so the
        // gameplay area stays unobstructed. Player can still read the tip
        // by glancing up without losing sight of Clippy.
        const lines = active.lines;
        const lineH = 8;
        const panelW = 132;
        const padX = 4, padY = 3;
        const panelH = padY * 2 + lines.length * lineH;
        // Sit below the HP bar / TRAINING badge (which end around y=28),
        // left-aligned with the HUD column.
        const panelX = 4;
        const panelY = 32;
        ctx.save();
        ctx.fillStyle = 'rgba(8, 4, 18, 0.88)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = '#7af0bf';  // training accent — matches HUD badge
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);
        // Title row in accent green, body lines in cream. Smaller text so
        // the whole panel stays out of the play area.
        for (let i = 0; i < lines.length; i++) {
            const color = i === 0 ? '#7af0bf' : '#ffe070';
            drawTextOutlined(ctx, lines[i],
                             panelX + padX, panelY + padY + i * lineH,
                             color, '#000', 1, 'left');
        }
        ctx.restore();
    }

    _drawPauseOverlay() {
        const ctx = this.ctx;
        // Fade-in animation — first 14 frames after entering pause ramp the
        // overlay alpha + panel scale from 0 to full. Subtle but reads as
        // "menu opened" rather than "menu teleported in".
        const anim = Math.min(1, (this._pauseAnim = (this._pauseAnim || 0) + 1) / 14);
        const eased = 1 - (1 - anim) * (1 - anim); // ease-out quad
        ctx.fillStyle = `rgba(0,0,0,${0.82 * eased})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Framed panel — matches achievements/stage-select look
        const panelX = 36, panelY = 18, panelW = GAME.W - 72, panelH = GAME.H - 36;
        // Scale panel from center: at anim=0 it's a thin slit, at anim=1 full
        const sH = Math.floor(panelH * eased);
        const sY = panelY + Math.floor((panelH - sH) / 2);
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, sY, panelW, sH);
        // Skip the rest while the panel is still mid-reveal
        if (anim < 0.6) {
            ctx.fillStyle = '#604030';
            ctx.fillRect(panelX, sY, panelW, 1);
            ctx.fillRect(panelX, sY + sH - 1, panelW, 1);
            return;
        }
        ctx.fillStyle = '#604030';
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

        drawTextOutlined(ctx, 'PAUSED', GAME.W / 2, panelY + 8, '#ffe070', '#a82020', 2, 'center');

        // Glance row — current stage + score
        const stage = this.currentStage ? STAGES[this.currentStage] : null;
        if (stage) {
            drawText(ctx, 'STAGE ' + stage.id + ' / ' + stage.name, GAME.W / 2, panelY + 28, '#80a0c0', 1, 'center');
            // R480: tagline + boss preview — sells the pause as a moment to
            // catch your breath and re-orient, not just a menu container.
            if (stage.tagline) {
                drawText(ctx, stage.tagline, GAME.W / 2, panelY + 38, '#a890b0', 1, 'center');
            }
            if (stage.boss) {
                drawText(ctx, 'TARGET: ' + stage.boss.replace(/_/g, ' '),
                         GAME.W / 2, panelY + 46, '#ff8060', 1, 'center');
            }
            // R505: Doom mode shows one compact inventory row in the pause
            // overlay — KEYS [r][y][b] · GUNS MG SHOT SAW BFG on one line.
            if (this._doomMode && this._doomEngine?.player) {
                const dp = this._doomEngine.player;
                const invY = panelY + (stage.boss ? 64 : 56);
                const wKeys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
                const wNames = ['MG', 'SHOT', 'SAW', 'BFG'];
                const gunsWidth = wNames.reduce((s, n) => s + n.length * 6 + 4, 0);
                const totalWidth = 20 + 32 + 12 + gunsWidth;
                let ix = (GAME.W - totalWidth) / 2;
                drawText(ctx, 'KEY', ix, invY, '#808090', 1, 'left');
                ix += 20;
                for (const color of ['red', 'yellow', 'blue']) {
                    ctx.fillStyle = this._doomEngine.keys.has(color)
                        ? (color === 'red' ? '#ff4040' : color === 'yellow' ? '#ffff40' : '#4080ff')
                        : '#202028';
                    ctx.fillRect(ix, invY + 1, 6, 6);
                    ix += 10;
                }
                ix += 6;
                for (let i = 0; i < 4; i++) {
                    const w = dp.weapons[wKeys[i]];
                    const isActive = (dp.weaponIdx === i);
                    const col = isActive ? '#ffe070' : (w.owned ? '#ffffff' : '#404048');
                    drawText(ctx, wNames[i], ix, invY, col, 1, 'left');
                    ix += wNames[i].length * 6 + 4;
                }
            }
        }

        // R505: bump startY by one row (~10px) when Doom inventory row is
        // shown so menu options don't sit on top of the keys/guns line
        const startY = panelY + (this._doomMode ? 78 : 58);
        // R505: compress row spacing in Doom mode so all 6 options + the
        // controls strip + footer still fit inside the existing panelH
        const pauseRowH = this._doomMode ? 13 : 16;
        for (let i = 0; i < PAUSE_OPTIONS.length; i++) {
            const y = startY + i * pauseRowH;
            const isSel = i === this.pauseIndex;
            if (isSel) {
                const phase = Math.sin((this._pausePulse = (this._pausePulse || 0) + 1) * 0.18) * 0.5 + 0.5;
                ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                ctx.fillRect(panelX + 12, y - 2, panelW - 24, 12);
                drawText(ctx, '>', panelX + 18, y, '#ffe070', 1, 'left');
                drawText(ctx, '<', panelX + panelW - 24, y, '#ffe070', 1, 'left');
            }
            drawText(ctx, PAUSE_OPTIONS[i], GAME.W / 2, y, isSel ? '#fff' : '#c0a0d0', 1, 'center');
        }

        // R208: controls reference — Milos playtest #6 asked for a way to
        // check key bindings without leaving the run. R214: was a 5-row
        // dense block; trimmed to a single-line keymap strip that sits
        // cleanly between the last option (QUIT TO TITLE at y=146) and
        // the footer (panelY+panelH-8 = 198). The READY card before each
        // stage already shows the full keymap — this strip is just a
        // mid-run reminder, not the discovery surface.
        const ctrlY = startY + PAUSE_OPTIONS.length * pauseRowH + 6;
        drawText(ctx, 'CONTROLS', GAME.W / 2, ctrlY, '#a0c0e0', 1, 'center');
        const colL = panelX + 16, colR = panelX + panelW - 16;
        const rowH = 8;
        // Each row is [leftLabel, leftKey, rightLabel, rightKey]. Right
        // column is drawn with align='right' so the key sits flush with
        // the panel's inner edge.
        const rows = [
            ['MOVE', 'ARROWS', 'SHOOT',   'X'],
            ['JUMP', 'SPACE',  'GRENADE', 'V'],
        ];
        for (let i = 0; i < rows.length; i++) {
            const y = ctrlY + 10 + i * rowH;
            // Left side: "LABEL KEY" — label dim, key bright
            drawText(ctx, rows[i][0],     colL,      y, '#a890b0', 1, 'left');
            drawText(ctx, rows[i][1],     colL + 26, y, '#ffe070', 1, 'left');
            // Right side, rendered right-aligned so the key hugs the
            // inner panel edge: "LABEL  KEY"
            drawText(ctx, rows[i][3],     colR,      y, '#ffe070', 1, 'right');
            drawText(ctx, rows[i][2],     colR - 10, y, '#a890b0', 1, 'right');
        }

        drawText(ctx, 'UP/DOWN  X CONFIRM  P CLOSE', GAME.W / 2, panelY + panelH - 8, '#604068', 1, 'center');
    }

    _tickPause() {
        if (input.isPressed('pause')) {
            audio.sfx('pause');
            // R489: respect the origin scene so unpausing on FPS/BEAT/DOOM
            // returns to the correct engine instead of dropping into the
            // platformer's PLAY scene (which has no level for those stages
            // and renders as a black void).
            this.scene = this._pauseReturnScene || SCENE.PLAY;
            return;
        }
        if (input.isPressed('up'))   { this.pauseIndex = (this.pauseIndex + PAUSE_OPTIONS.length - 1) % PAUSE_OPTIONS.length; audio.sfx('select'); }
        if (input.isPressed('down')) { this.pauseIndex = (this.pauseIndex + 1) % PAUSE_OPTIONS.length; audio.sfx('select'); }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            audio.sfx('menu');
            const sel = PAUSE_OPTIONS[this.pauseIndex];
            if (sel === 'RESUME') {
                // R351: return to whichever play scene we paused from
                // (PLAY / FPS_PLAY / BEAT_PLAY), not blindly to PLAY.
                this.scene = this._pauseReturnScene || SCENE.PLAY;
                // Music may be paused after a tab-switch auto-pause; the
                // playTrack call is idempotent (returns early if already
                // on this track + playing), so it's safe to always call.
                const stg = STAGES[this.currentStage];
                if (stg) audio.playTrack(stg.music);
            }
            // R211: arm sub-menus to return to PAUSE since we entered
            // from an in-game pause (live player/level state underneath).
            else if (sel === 'OPTIONS') { this._menuReturnScene = SCENE.PAUSE; this.scene = SCENE.OPTIONS; this.optionsIndex = 0; }
            else if (sel === 'ACHIEVEMENTS') { this._menuReturnScene = SCENE.PAUSE; this.scene = SCENE.ACHIEVEMENTS; this.achievementsIndex = 0; }
            else if (sel === 'SOUNDTRACK') {
                this._menuReturnScene = SCENE.PAUSE;
                this.scene = SCENE.SOUNDTRACK;
                this.soundtrackIndex = 0;
                // Stash whatever was playing so we can restore on close
                this._soundtrackResumeTrack = this.currentStage ? STAGES[this.currentStage]?.music : 'title';
            }
            else if (sel === 'SCENE GALLERY') {
                this._menuReturnScene = SCENE.PAUSE;
                this.scene = SCENE.GALLERY;
                this.galleryIndex = 0;
                this._galleryViewing = false;
            }
            else if (sel === 'QUIT TO TITLE') { audio.stopTrack(); this._restartRun(); }
        }
    }

    // ============== Options menu ==============
    _tickOptions() {
        if (input.isPressed('pause') || input.isReleased('shoot')) {
            // No-op on shoot release; close on pause
        }
        if (input.isPressed('pause')) { this.scene = this._menuReturnScene || SCENE.PAUSE; audio.sfx('pause'); return; }
        if (input.isPressed('up'))   { this.optionsIndex = (this.optionsIndex + OPTIONS_ITEMS.length - 1) % OPTIONS_ITEMS.length; audio.sfx('select'); }
        if (input.isPressed('down')) { this.optionsIndex = (this.optionsIndex + 1) % OPTIONS_ITEMS.length; audio.sfx('select'); }
        const dir = (input.isPressed('left') ? -1 : 0) + (input.isPressed('right') ? 1 : 0);
        if (dir !== 0) {
            const k = OPTIONS_KEYS[this.optionsIndex];
            if (k === 'masterVol' || k === 'musicVol' || k === 'sfxVol') {
                const v = Math.max(0, Math.min(1, options.get(k) + dir * 0.1));
                options.set(k, v);
                // R288: use the audio API setters so the sidechainBase stays
                // in sync + the bus is set via a single source-of-truth path.
                if (k === 'masterVol') audio.setMasterVolume(v);
                if (k === 'musicVol')  audio.setMusicVolume(v);
                if (k === 'sfxVol')    audio.setSfxVolume(v);
            } else if (k === 'scanlines') {
                options.set(k, !options.get(k));
                document.getElementById('scanlines')?.style.setProperty('display', options.get(k) ? 'block' : 'none');
            } else if (k === 'crtCurve') {
                // R364: CRT curvature toggle — flips the body class so
                // index.html's CSS curve effect engages/disengages.
                options.set(k, !options.get(k));
                document.body.classList.toggle('crt-curve', options.get(k));
            } else if (k === 'showReady') {
                // R364: skip the stage-intro READY card on repeat runs
                options.set(k, !options.get(k));
            } else if (k === 'shakeScale') {
                options.set(k, Math.max(0, Math.min(2, options.get('shakeScale') + dir * 0.25)));
            }
            audio.sfx('menu');
        }
        if (input.isPressed('shoot') || input.isPressed('jump')) {
            if (OPTIONS_ITEMS[this.optionsIndex] === 'BACK') { this.scene = this._menuReturnScene || SCENE.PAUSE; audio.sfx('pause'); }
        }
    }
    _drawOptions() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Framed panel — matches pause/achievements look
        const panelX = 30, panelY = 14, panelW = GAME.W - 60, panelH = GAME.H - 28;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = '#604030';
        ctx.fillRect(panelX, panelY, panelW, 1);
        ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
        ctx.fillRect(panelX, panelY, 1, panelH);
        ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

        drawTextOutlined(ctx, 'OPTIONS', GAME.W / 2, panelY + 6, '#ffe070', '#a82020', 2, 'center');

        const startY = panelY + 38;
        this._optionsPulse = (this._optionsPulse || 0) + 1;
        for (let i = 0; i < OPTIONS_ITEMS.length; i++) {
            const y = startY + i * 18;
            const sel = i === this.optionsIndex;
            if (sel) {
                const phase = Math.sin(this._optionsPulse * 0.18) * 0.5 + 0.5;
                ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                ctx.fillRect(panelX + 8, y - 2, panelW - 16, 14);
                drawText(ctx, '>', panelX + 12, y, '#ffe070', 1, 'left');
                drawText(ctx, '<', panelX + panelW - 18, y, '#ffe070', 1, 'left');
            }
            drawText(ctx, OPTIONS_ITEMS[i], panelX + 22, y, sel ? '#fff' : '#c0a0d0', 1, 'left');
            // R288: route render by OPTIONS_KEYS[i] instead of hardcoded
            // indices so adding/removing items doesn't break sliders.
            const key = OPTIONS_KEYS[i];
            // R369: was barX = panelW-64 + barW=32 + text at panelW-26
            // → slider right-edge collided with percent text. Moved
            // slider further left + widened text gap so they stop
            // overlapping at 100%.
            const barX = panelX + panelW - 84, barY = y + 3, barW = 32, barH = 4;
            if (key === 'masterVol' || key === 'musicVol' || key === 'sfxVol') {
                const v = options.get(key);
                ctx.fillStyle = '#241830';
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = sel ? '#ffe070' : '#80a0c0';
                ctx.fillRect(barX, barY, Math.round(barW * v), barH);
                drawText(ctx, Math.round(v * 100) + '%', panelX + panelW - 26, y, sel ? '#ffe070' : '#80a0c0', 1, 'right');
            } else if (key === 'shakeScale') {
                const v = options.get('shakeScale') / 2;
                ctx.fillStyle = '#241830';
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = sel ? '#ffe070' : '#80a0c0';
                ctx.fillRect(barX, barY, Math.round(barW * v), barH);
                drawText(ctx, options.get('shakeScale').toFixed(2), panelX + panelW - 26, y, sel ? '#ffe070' : '#80a0c0', 1, 'right');
            } else if (key === 'scanlines' || key === 'crtCurve' || key === 'showReady') {
                drawText(ctx, options.get(key) ? 'ON' : 'OFF', panelX + panelW - 26, y, sel ? '#ffe070' : '#80a0c0', 1, 'right');
            }
        }
        drawText(ctx, 'LEFT/RIGHT CHANGE  X CONFIRM  P BACK', GAME.W / 2, panelY + panelH - 10, '#604068', 1, 'center');
    }

    // ============== Achievements panel ==============
    // 4×4 trophy grid. Arrow keys move a cursor; selected tile shows a detail
    // strip at the bottom with name + description. Locked tiles show a "?" icon
    // and hide the description so unknowns feel discoverable.
    _tickAchievements() {
        if (input.isPressed('pause') || input.isPressed('jump')) { this.scene = this._menuReturnScene || SCENE.PAUSE; audio.sfx('pause'); return; }
        // R368b: must match _drawAchievements cols (was 4, now 6).
        // Mismatch made arrow nav jump non-adjacent tiles.
        const cols = 6;
        const n = ACHIEVEMENT_LIST.length;
        if (this.achievementsIndex == null) this.achievementsIndex = 0;
        const i = this.achievementsIndex;
        if (input.isPressed('left'))  { this.achievementsIndex = (i + n - 1) % n; audio.sfx('select'); }
        if (input.isPressed('right')) { this.achievementsIndex = (i + 1) % n; audio.sfx('select'); }
        if (input.isPressed('up'))    { this.achievementsIndex = (i - cols + n) % n; audio.sfx('select'); }
        if (input.isPressed('down'))  { this.achievementsIndex = (i + cols) % n; audio.sfx('select'); }
        this._achPulse = (this._achPulse || 0) + 1;
    }
    _drawAchievements() {
        const ctx = this.ctx;
        // R238: fully opaque — backdrop panel below shouldn't bleed through.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'ACHIEVEMENTS', GAME.W / 2, 8, '#ffe070', '#a82020', 1, 'center');
        // Progress bar — full-width strip under the title.
        const got = achievements.unlocked.size;
        const total = ACHIEVEMENT_LIST.length;
        const pct = total === 0 ? 0 : got / total;
        const barX = 24, barY = 22, barW = GAME.W - 48, barH = 4;
        ctx.fillStyle = '#241830';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(barX, barY, Math.floor(barW * pct), barH);
        drawText(ctx, got + ' / ' + total, GAME.W / 2, 30, '#a0c0e0', 1, 'center');

        // R368b: grid extended to 6×5 (was 5×5) — R359 added 8 new
        // post-game achievements, total now 29. 25-slot grid hid the
        // last 4. 6 cols × 5 rows = 30 slots, tile width down 40→34
        // to keep the grid centered + within the 256 viewport.
        const cols = 6;
        const tileW = 34, tileH = 28;
        const gridW = cols * tileW + (cols - 1) * 2;
        const gridX = Math.floor((GAME.W - gridW) / 2);
        const gridY = 38;
        const cursor = this.achievementsIndex || 0;
        for (let idx = 0; idx < ACHIEVEMENT_LIST.length; idx++) {
            const a = ACHIEVEMENT_LIST[idx];
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const x = gridX + c * (tileW + 3);
            const y = gridY + r * (tileH + 4);
            const unlocked = achievements.isUnlocked(a.id);
            const isSel = idx === cursor;
            // Background
            ctx.fillStyle = unlocked ? '#3a2818' : '#1a1018';
            ctx.fillRect(x, y, tileW, tileH);
            // Border (selected = animated yellow, locked = dim purple)
            const phase = isSel ? (Math.sin(this._achPulse * 0.18) * 0.5 + 0.5) : 0;
            ctx.fillStyle = isSel
                ? (unlocked ? `rgb(${255},${224 - Math.floor(phase * 100)},${112 - Math.floor(phase * 80)})` : '#a06030')
                : (unlocked ? '#604030' : '#302840');
            ctx.fillRect(x, y, tileW, 1);
            ctx.fillRect(x, y + tileH - 1, tileW, 1);
            ctx.fillRect(x, y, 1, tileH);
            ctx.fillRect(x + tileW - 1, y, 1, tileH);
            // Trophy icon centered (R238: tightened to fit smaller tile)
            const iconText = unlocked ? a.icon : '?';
            const iconColor = unlocked ? '#ffe070' : '#604068';
            drawTextOutlined(ctx, iconText, x + tileW / 2, y + 4, iconColor, '#1a0000', 1, 'center');
            // Mini-name — unlocked shows truncated name; locked tiles
            // still show their truncated name (was '?????') so players
            // can scan the grid for what they want to chase rather than
            // staring at a wall of identical question marks.
            const shortName = a.name;
            const truncated = shortName.length > 6 ? shortName.substring(0, 5) + '.' : shortName;
            drawText(ctx, truncated, x + tileW / 2, y + 18, unlocked ? '#fff' : '#403048', 1, 'center');
        }
        // Detail strip at the bottom — selected achievement name + description.
        // Sits above the help row so they don't collide.
        // R514: locked tiles now show the achievement NAME (so players can
        // browse what's available) but keep the desc hidden until unlocked
        // unless the achievement has a `progress` lambda — in that case
        // show the (current/target) counter as the discoverable hint.
        const sel = ACHIEVEMENT_LIST[cursor];
        if (sel) {
            const selUnlocked = achievements.isUnlocked(sel.id);
            ctx.fillStyle = '#0a0612';
            ctx.fillRect(8, GAME.H - 32, GAME.W - 16, 20);
            // Name row — locked achievements now show the name (was '???')
            drawText(ctx, sel.name, GAME.W / 2, GAME.H - 30,
                     selUnlocked ? '#ffe070' : '#806080', 1, 'center');
            // Detail row — desc when unlocked; progress counter or
            // "NOT YET UNLOCKED" placeholder when locked
            let detail;
            let detailColor;
            if (selUnlocked) {
                detail = sel.desc;
                detailColor = '#a0c0e0';
            } else if (sel.progress) {
                const [cur, tgt] = sel.progress(achievements.stats);
                detail = sel.desc + '   ' + cur + ' / ' + tgt;
                detailColor = '#7080a0';
            } else {
                detail = 'NOT YET UNLOCKED';
                detailColor = '#403048';
            }
            drawText(ctx, detail, GAME.W / 2, GAME.H - 20, detailColor, 1, 'center');
        }
        drawText(ctx, 'ARROWS NAV   P CLOSE', GAME.W / 2, GAME.H - 8, '#604068', 1, 'center');
    }

    // ============== Soundtrack gallery ==============
    _tickSoundtrack() {
        if (input.isPressed('pause')) {
            // Closing — restore the music that was playing before
            if (this._soundtrackResumeTrack) audio.playTrack(this._soundtrackResumeTrack);
            this.scene = this._menuReturnScene || SCENE.PAUSE;
            audio.sfx('pause');
            return;
        }
        // Init guard: matches achievementsIndex / gameOverIndex pattern. Without
        // this the first up/down press computes (undefined ± n) % n = NaN and
        // the menu silently locks.
        if (this.soundtrackIndex == null) this.soundtrackIndex = 0;
        const n = TRACK_MANIFEST.length;
        if (input.isPressed('up'))   { this.soundtrackIndex = (this.soundtrackIndex + n - 1) % n; audio.sfx('select'); }
        if (input.isPressed('down')) { this.soundtrackIndex = (this.soundtrackIndex + 1) % n; audio.sfx('select'); }
        // X plays the selected track. If already playing, X toggles stop.
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            const sel = TRACK_MANIFEST[this.soundtrackIndex];
            if (sel) {
                if (audio.currentTrack === sel.track && this._soundtrackPlaying) {
                    audio.stopTrack();
                    this._soundtrackPlaying = false;
                } else {
                    audio.playTrack(sel.track);
                    this._soundtrackPlaying = true;
                }
                audio.sfx('menu');
            }
        }
    }
    _drawSoundtrack() {
        const ctx = this.ctx;
        // R238: fully opaque so the main-menu panel underneath (now anchored
        // to the lower half — R236) doesn't bleed through at 12% alpha.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        drawTextOutlined(ctx, 'SOUNDTRACK', GAME.W / 2, 10, '#ffe070', '#a82020', 1, 'center');

        // R230: fixed-row scroll window. Always show VISIBLE rows; selected
        // index stays visible (clamped scroll). Future-proofs against larger
        // catalogs without shrinking font or running off the bottom.
        const VISIBLE = 6;
        const rowH = 22;
        const total = TRACK_MANIFEST.length;
        const sel = (this.soundtrackIndex | 0);
        // Compute scroll offset so the selection sits inside the window.
        let scroll = sel - Math.floor(VISIBLE / 2);
        if (scroll < 0) scroll = 0;
        if (scroll > total - VISIBLE) scroll = Math.max(0, total - VISIBLE);

        // Column headers above the row list
        const headerY = 24;
        drawText(ctx, 'TITLE',  48,            headerY, '#a08090', 1, 'left');
        drawText(ctx, 'STAGE',  GAME.W - 60,   headerY, '#a08090', 1, 'right');
        drawText(ctx, 'ARTIST', GAME.W - 12,   headerY, '#a08090', 1, 'right');
        // Header separator line
        ctx.fillStyle = '#3a2030';
        ctx.fillRect(10, headerY + 5, GAME.W - 20, 1);

        const startY = 36;
        for (let row = 0; row < VISIBLE && row + scroll < total; row++) {
            const i = row + scroll;
            const t = TRACK_MANIFEST[i];
            const y = startY + row * rowH;
            const selected = i === sel;
            const playing = audio.currentTrack === t.track && this._soundtrackPlaying;

            // Row backplate
            if (selected) {
                ctx.fillStyle = '#a01020';
                ctx.fillRect(10, y - 2, GAME.W - 20, rowH - 2);
            } else {
                ctx.fillStyle = '#180814';
                ctx.fillRect(10, y - 2, GAME.W - 20, rowH - 2);
            }
            // Play/pause glyph
            const glyphX = 16, glyphY = y + 4;
            if (playing) {
                const pulse = (this.bootTimer % 30) < 15;
                ctx.fillStyle = '#50ff70';
                ctx.fillRect(glyphX, glyphY, 2, 6);
                ctx.fillRect(glyphX + 3, glyphY + 1, 1, 4);
                if (pulse) ctx.fillRect(glyphX + 5, glyphY, 1, 6);
            } else {
                ctx.fillStyle = selected ? '#ffe070' : '#604068';
                ctx.fillRect(glyphX,     glyphY,     1, 6);
                ctx.fillRect(glyphX + 1, glyphY + 1, 1, 4);
                ctx.fillRect(glyphX + 2, glyphY + 2, 1, 2);
            }

            // Track index + title. R369: title was overflowing into the
            // stage column on long entries like "YOU'VE BEEN LOVING ME".
            // Truncate to fit 22 chars max so the layout stays clean.
            const idx = String(i + 1).padStart(2, '0');
            drawText(ctx, idx, 28, y + 2, selected ? '#ffe070' : '#a08090', 1, 'left');
            // R377: tighter clamp — 18 still touched STAGE col, 16 leaves
            // visible gap. Pixel-font is wider than character count
            // suggests so we under-count conservatively.
            const titleMax = 16;
            const titleClip = t.title.length > titleMax
                ? t.title.slice(0, titleMax - 1) + '.'
                : t.title;
            drawText(ctx, titleClip, 48, y + 2, '#fff', 1, 'left');
            // Stage label (was "mood") + artist on the right
            drawText(ctx, t.mood,   GAME.W - 60, y + 2,  selected ? '#ffe070' : '#a0c0e0', 1, 'right');
            drawText(ctx, t.author, GAME.W - 12, y + 2,  selected ? '#ffe070' : '#a0c0e0', 1, 'right');

            if (playing) {
                drawText(ctx, 'NOW PLAYING', 48, y + 11, '#50ff70', 1, 'left');
            }
        }

        // Scroll indicators (^ above / v below) when more rows exist
        if (scroll > 0) {
            ctx.fillStyle = '#a08090';
            const ax = GAME.W / 2;
            ctx.fillRect(ax - 2, startY - 6, 5, 1);
            ctx.fillRect(ax - 1, startY - 7, 3, 1);
            ctx.fillRect(ax,     startY - 8, 1, 1);
        }
        if (scroll + VISIBLE < total) {
            ctx.fillStyle = '#a08090';
            const ax = GAME.W / 2;
            const by = startY + VISIBLE * rowH - 4;
            ctx.fillRect(ax - 2, by,     5, 1);
            ctx.fillRect(ax - 1, by + 1, 3, 1);
            ctx.fillRect(ax,     by + 2, 1, 1);
        }

        // Footer count + controls
        drawText(ctx, (sel + 1) + ' / ' + total + ' TRACKS',
                 GAME.W / 2, GAME.H - 26, '#a08090', 1, 'center');
        drawText(ctx, 'UP/DOWN SELECT   X PLAY/STOP   P CLOSE',
                 GAME.W / 2, GAME.H - 14, '#604068', 1, 'center');
    }

    // ============== Scene Gallery ==============
    // Grid of unlocked painted scenes. UP/DOWN navigates rows, LEFT/RIGHT
    // navigates columns, X views the selected scene fullscreen, P closes
    // back to pause. Scenes are gated by progress: opening cinematics are
    // available immediately, boss intros unlock as you beat each boss,
    // ending + epilogue beats unlock on clear_game.
    _galleryEntries() {
        const cleared = achievements.unlocked.has('clear_game');
        const stageDone = (n) => (this.unlockedStage > n) || cleared;
        const tab = this.galleryTab || 'scenes';
        if (tab === 'enemies') {
            // R266 + R375: enemy gallery. Grunts gate on first-seen-stage;
            // R346 painted enemies (dive_bomber/summoner/shielder) on
            // stages where they first appear; R366 beat-em-up roster
            // (scavenger/drone/helicopter/brawler) on the post-game
            // Mecha-trilogy unlock.
            return [
                { key: 'stapler',     label: 'STAPLER',     unlock: true },
                { key: 'folder',      label: 'FOLDER',      unlock: stageDone(1) },
                { key: 'cabinet',     label: 'CABINET',     unlock: stageDone(2) },
                { key: 'holepunch',   label: 'SNIPER',      unlock: stageDone(2) },
                { key: 'dive_bomber', label: 'PAPER JET',   unlock: stageDone(1) },
                { key: 'summoner',    label: 'SUMMONER',    unlock: stageDone(4) },
                { key: 'shielder',    label: 'SHIELDER',    unlock: stageDone(3) },
                { key: 'scavenger',   label: 'SCAVENGER',   unlock: stageDone(7) },
                { key: 'drone',       label: 'WAR DRONE',   unlock: stageDone(7) },
                { key: 'helicopter',  label: 'CHOPPER',     unlock: stageDone(20) || cleared },
                { key: 'brawler',     label: 'BRAWLER',     unlock: stageDone(7) },
            ];
        }
        if (tab === 'bosses') {
            // R291 + R375: full boss roster. Post-game bosses (helicopter
            // + mecha-gates) gate on the konami unlock OR stage clear.
            const konami = !!this._konamiUnlocked;
            return [
                { key: 'boss_COPIER_3000',  label: 'COPIER 3000',  unlock: stageDone(1) },
                { key: 'boss_SHREDDER',     label: 'SHREDDER',     unlock: stageDone(2) },
                { key: 'boss_CTRL_ALT_DEL', label: 'CTRL-ALT-DEL', unlock: stageDone(3) },
                { key: 'boss_SPINDLER',     label: 'DR. SPINDLER', unlock: stageDone(4) },
                { key: 'boss_BALLMER',      label: 'BALLMER',      unlock: stageDone(5) },
                { key: 'boss_GATES',        label: 'GATES',        unlock: stageDone(8) },
                { key: 'boss_CLIPPY_2',     label: 'CLIPPY 2.0',   unlock: stageDone(11) },
                { key: 'boss_ALGORITHM',    label: 'ALGORITHM',    unlock: stageDone(13) },
                { key: 'boss_JOBS',         label: 'STEVE JOBS',   unlock: cleared },
                { key: 'helicopter',        label: 'MECHA CHOPPER',unlock: stageDone(21) || konami },
                { key: 'boss_mecha_gates',  label: 'MECHA-GATES',  unlock: stageDone(22) || konami },
            ];
        }
        // Default: SCENES tab
        return [
            { key: 'story_fired', label: 'FIRED', unlock: true },
            { key: 'story_home',  label: 'HOME',  unlock: true },
            { key: 'story_bomb',  label: 'PLAN',  unlock: true },
            { key: 'story_boardroom', label: 'BOARDROOM', unlock: true },
            { key: 'story_hill',  label: 'HILL',  unlock: true },
            // R292: new TOWER slide — Microsoft campus overlook.
            { key: 'story_tower', label: 'TOWER', unlock: true },
            { key: 'story_list',  label: 'LIST',  unlock: true },
            // R291: stage-ids shifted again — Gates arc inserts at 9+10.
            { key: 'boss_intro_COPIER_3000',  label: 'COPIER 3000',  unlock: stageDone(1) },
            { key: 'boss_intro_SHREDDER',     label: 'SHREDDER',     unlock: stageDone(2) },
            { key: 'boss_intro_CTRL_ALT_DEL', label: 'CTRL-ALT-DEL', unlock: stageDone(3) },
            { key: 'boss_intro_BALLMER',      label: 'BALLMER',      unlock: stageDone(4) },
            // R281: Ballmer mini-arc cinematics — 5 (escape), 6 (office), 7 (arena).
            { key: 'card_ballmer_escapes',    label: 'B. ESCAPE',    unlock: stageDone(5) },
            { key: 'card_ballmer_office',     label: 'B. OFFICE',    unlock: stageDone(6) },
            { key: 'card_ballmer_arena',      label: 'B. ARENA',     unlock: stageDone(7) },
            { key: 'boss_intro_GATES',        label: 'GATES',        unlock: stageDone(7) },
            // R291: Gates mini-arc cinematics — 8 (escape), 9 (corridor card uses keynote), 10 (arena).
            { key: 'card_gates_escapes',      label: 'G. ESCAPE',    unlock: stageDone(8) },
            { key: 'card_gates_arena',        label: 'G. ARENA',     unlock: stageDone(10) },
            { key: 'boss_intro_CLIPPY_2',     label: 'CLIPPY 2.0',   unlock: stageDone(10) },
            { key: 'boss_intro_GAUNTLET',     label: 'BOSS RUSH',    unlock: stageDone(11) },
            { key: 'boss_intro_ALGORITHM',    label: 'ALGORITHM',    unlock: stageDone(12) },
            { key: 'boss_intro_JOBS',         label: 'STEVE JOBS',   unlock: cleared },
            { key: 'ending',                  label: 'ENDING',       unlock: cleared },
            { key: 'epi_laughingstock',       label: 'LAUGHINGSTOCK', unlock: cleared },
            { key: 'epi_memes',               label: 'MEMES',         unlock: cleared },
            { key: 'epi_comeback',            label: '2026 COMEBACK', unlock: cleared },
            { key: 'epi_mac_siri',            label: 'NEW HARDWARE',  unlock: cleared },
        ];
    }
    _tickGallery() {
        const entries = this._galleryEntries();
        const n = entries.length;
        if (this.galleryIndex == null) this.galleryIndex = 0;
        // Fullscreen viewing mode: any key returns to grid.
        if (this._galleryViewing) {
            if (input.isPressed('shoot') || input.isPressed('jump') ||
                input.isPressed('start') || input.isPressed('pause')) {
                this._galleryViewing = false;
                audio.sfx('pause');
            }
            return;
        }
        // P closes back to pause menu — mirrors soundtrack behavior.
        // R211: return target depends on where we entered from (pause vs main menu).
        if (input.isPressed('pause')) {
            this.scene = this._menuReturnScene || SCENE.PAUSE;
            audio.sfx('pause');
            return;
        }
        // R266: TAB / Q cycles between SCENES → ENEMIES → BOSSES tabs.
        if (input.isPressed('cycle')) {
            const tabs = ['scenes', 'enemies', 'bosses'];
            const cur = tabs.indexOf(this.galleryTab || 'scenes');
            this.galleryTab = tabs[(cur + 1) % tabs.length];
            this.galleryIndex = 0;
            audio.sfx('select');
            return;
        }
        const COLS = 5;
        if (input.isPressed('left'))  { this.galleryIndex = (this.galleryIndex + n - 1) % n; audio.sfx('select'); }
        if (input.isPressed('right')) { this.galleryIndex = (this.galleryIndex + 1) % n; audio.sfx('select'); }
        if (input.isPressed('up'))    { this.galleryIndex = (this.galleryIndex + n - COLS) % n; audio.sfx('select'); }
        if (input.isPressed('down'))  { this.galleryIndex = (this.galleryIndex + COLS) % n; audio.sfx('select'); }
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            const e = entries[this.galleryIndex];
            if (e && e.unlock && sprites.has(e.key)) {
                this._galleryViewing = true;
                audio.sfx('menu');
            }
        }
    }
    _drawGallery() {
        const ctx = this.ctx;
        const entries = this._galleryEntries();
        // Fullscreen viewing mode: paint the selected scene at full bleed.
        if (this._galleryViewing) {
            const e = entries[this.galleryIndex];
            const img = sprites.images.get(e.key);
            if (img) {
                const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
                const dw = img.width * scale;
                const dh = img.height * scale;
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
                ctx.imageSmoothingEnabled = false;
            }
            // Title overlay + close hint
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, GAME.W, 18);
            ctx.fillRect(0, GAME.H - 14, GAME.W, 14);
            drawText(ctx, e.label, GAME.W / 2, 6, '#ffe070', 1, 'center');
            if (this.bootTimer % 60 < 40) {
                drawText(ctx, 'ANY KEY TO RETURN', GAME.W / 2, GAME.H - 10, '#fff', 1, 'center');
            }
            return;
        }
        // Grid view
        // R238: fully opaque so the main-menu panel underneath doesn't bleed
        // through (R236 anchored it to lower half, exposed the 12% leak).
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        const tab = this.galleryTab || 'scenes';
        const tabTitles = {
            scenes:  'SCENE GALLERY',
            enemies: 'ENEMY GALLERY',
            bosses:  'BOSS GALLERY',
        };
        drawTextOutlined(ctx, tabTitles[tab], GAME.W / 2, 8, '#ffe070', '#a82020', 1, 'center');
        // R266: tab strip showing the three sections; active one highlighted.
        const tabs = ['SCENES', 'ENEMIES', 'BOSSES'];
        const tabKeys = ['scenes', 'enemies', 'bosses'];
        const tabY = 18;
        const tabSpacing = 56;
        const totalTabW = tabs.length * tabSpacing;
        const tabStartX = (GAME.W - totalTabW) / 2 + tabSpacing / 2;
        for (let i = 0; i < tabs.length; i++) {
            const tx = tabStartX + i * tabSpacing;
            const isActive = tabKeys[i] === tab;
            drawText(ctx, tabs[i], tx, tabY, isActive ? '#ffe070' : '#604068', 1, 'center');
            if (isActive) {
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(tx - 16, tabY + 8, 32, 1);
            }
        }

        // R266: 5-column grid with wider cells + 2-line label space so long
        // names like "LIST COPIER 3000" and "STEVE JOBS" don't bleed into
        // the neighbor cell. cellH now includes 14px label band.
        // R266: tightened cell heights so 4 rows fit between the tab strip
        // (ends y≈28) and the footer hint (starts y=GAME.H-12).
        // labelH must accommodate 2 lines of 7px text + 2px baseline gap =
        // ~16px; tested empirically against "BOARDROOM" → "BOARD"/"ROOM".
        const COLS = 5;
        const cellW = 44, thumbH = 20, labelH = 16, cellH = thumbH + labelH;
        const gapX = 5, gapY = 2;
        const gridW = COLS * cellW + (COLS - 1) * gapX;
        const startX = Math.round((GAME.W - gridW) / 2);
        const startY = 30;
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const r = Math.floor(i / COLS);
            const c = i % COLS;
            const x = startX + c * (cellW + gapX);
            const y = startY + r * (cellH + gapY);
            const selected = i === this.galleryIndex;
            // Thumbnail or locked silhouette
            if (e.unlock && sprites.has(e.key)) {
                const img = sprites.images.get(e.key);
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(img, x, y, cellW, thumbH);
                ctx.imageSmoothingEnabled = false;
            } else {
                ctx.fillStyle = '#1a0a18';
                ctx.fillRect(x, y, cellW, thumbH);
                drawText(ctx, '?', x + cellW / 2, y + thumbH / 2 - 3, '#604068', 1, 'center');
            }
            // Selection frame
            if (selected) {
                ctx.strokeStyle = '#ffe070';
                ctx.lineWidth = 1;
                ctx.strokeRect(x - 0.5, y - 0.5, cellW + 1, cellH);
            }
            // Label below thumbnail — wrap to 2 lines if too long, and clip
            // to a per-cell scissor so nothing leaks past the cell edges.
            const labelCol = selected ? '#ffe070' : (e.unlock ? '#c0a0d0' : '#604068');
            // Wrap to 2 lines at maxChars=7 (cellW=44 / 6px-per-char).
            const lines = this._wrapLabel(e.label, 7);
            ctx.save();
            ctx.beginPath();
            // Clip horizontally tight to cell, vertically loose so both
            // wrapped lines render fully.
            ctx.rect(x - 2, y + thumbH - 1, cellW + 4, labelH + 2);
            ctx.clip();
            // Center the line stack vertically inside labelH.
            const totalH = lines.length * 7 + (lines.length - 1) * 1;
            const lineY = y + thumbH + Math.floor((labelH - totalH) / 2) + 1;
            for (let li = 0; li < lines.length; li++) {
                drawText(ctx, lines[li], x + cellW / 2, lineY + li * 8, labelCol, 1, 'center');
            }
            ctx.restore();
        }
        drawText(ctx, 'ARROWS MOVE  X VIEW  TAB SECTION  P CLOSE', GAME.W / 2, GAME.H - 8, '#604068', 1, 'center');
    }

    // R266: wrap a label into <=2 lines of ~maxChars each. Splits on word
    // boundaries first; for single long words, splits at the midpoint so the
    // full label still reads (e.g. "ALGORITHM" → "ALGO" / "RITHM").
    _wrapLabel(label, maxChars) {
        if (label.length <= maxChars + 1) return [label];
        const words = label.split(' ');
        if (words.length >= 2) {
            let bestIdx = 1, bestDiff = Infinity;
            for (let i = 1; i < words.length; i++) {
                const left = words.slice(0, i).join(' ');
                const right = words.slice(i).join(' ');
                const diff = Math.abs(left.length - right.length);
                if (left.length <= maxChars + 2 && right.length <= maxChars + 2 && diff < bestDiff) {
                    bestIdx = i;
                    bestDiff = diff;
                }
            }
            const line1 = words.slice(0, bestIdx).join(' ');
            const line2 = words.slice(bestIdx).join(' ');
            return [line1, line2];
        }
        // Single long word — split at the midpoint so both halves fit.
        const mid = Math.ceil(label.length / 2);
        return [label.slice(0, mid), label.slice(mid)];
    }

    // R278: wrap a stage label across up to `maxLines` lines, each <= maxChars.
    // Greedy line-fill: keep adding words to the current line until adding
    // the next word would overflow, then start a new line. Hard-truncates
    // the last line if the full text won't fit in the available lines.
    _wrapStageLabel(label, maxChars, maxLines) {
        if (label.length <= maxChars) return [label];
        const words = label.split(' ');
        const lines = [];
        let cur = '';
        for (const w of words) {
            const trial = cur ? (cur + ' ' + w) : w;
            if (trial.length <= maxChars) {
                cur = trial;
            } else {
                if (cur) lines.push(cur);
                // If a single word is longer than maxChars, split it mid-word.
                if (w.length > maxChars) {
                    const mid = Math.ceil(w.length / 2);
                    lines.push(w.slice(0, mid));
                    cur = w.slice(mid);
                } else {
                    cur = w;
                }
            }
            if (lines.length >= maxLines) break;
        }
        if (cur && lines.length < maxLines) lines.push(cur);
        // Hard-truncate trailing line if any words got dropped
        if (lines.length === 0) lines.push(label.slice(0, maxChars));
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].length > maxChars) lines[i] = lines[i].slice(0, maxChars);
        }
        return lines;
    }

    // ============== Inter-stage cinematic card ==============
    // Painted scene + stage name + tagline shown between stage_clear and
    // the next stage_intro. Player advances with X or auto-advances after 240f.
    _tickStageCard() {
        this.storyTimer++;
        if (this.storyTimer > 240 || (this.storyTimer > 40 && (input.isPressed('shoot') || input.isPressed('jump')))) {
            audio.sfx('select');
            // R281: extra-cards queue lets stage transitions chain multiple
            // painted cinematics back-to-back. Used for the Ballmer-escapes
            // beat between stage 5 (Board Room) and stage 6 (Office).
            if (this._extraCards && this._extraCards.length > 0) {
                this._extraCards.shift();
                this.storyTimer = 0;
                return;
            }
            // R374: _pendingFinale routes to a scene (gameComplete /
            // epilogue / title) instead of starting another stage. Used
            // by the Mecha-Gates victory cinematic to land at GAME_COMPLETE
            // after the painted card finishes.
            if (this._pendingFinale) {
                const finale = this._pendingFinale;
                this._pendingFinale = null;
                this._pendingStage = null;
                this._extraCards = null;
                this._secretDiscoveryCard = false;
                this._fadeTo(finale);
                return;
            }
            const next = this._pendingStage || (this.currentStage + 1);
            this._secretDiscoveryCard = false;
            this._startStage(next);
        }
    }
    _drawStageCard() {
        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Pick the card for the upcoming stage
        const next = this._pendingStage || (this.currentStage + 1);
        // R226: post-renumber stage IDs. New stage 4 = PIPELINE; old 4-8 are
        // now 5-9; old secret 9 is now 10. Card key strings haven't changed,
        // only the integer keys they're mapped under.
        // R291: Gates arc inserts cards at 9 (corridor) and 10 (arena)
        // between Keynote (8) and Founder's (now 11). Bossrush 12, Cloud 13,
        // RecycleBin 14.
        // R476: pull from module-level STAGE_CARD_KEYS (single source of truth).
        const STAGE_CARDS = STAGE_CARD_KEYS;
        // R281: extra-cards queue overrides the per-stage default card.
        // If set, paint that card first; queue drains on each X press.
        const key = (this._extraCards && this._extraCards.length > 0)
            ? this._extraCards[0]
            : STAGE_CARDS[next];
        const t = this.storyTimer;
        if (key && sprites.has(key)) {
            const img = sprites.images.get(key);
            // Ken-Burns zoom — modest 1.08 → 1.18 so the crop stays predictable.
            // Painted cards have Clippy near bottom-center; we pan UP (revealing
            // the environment above Clippy) so the subject is always visible.
            const zoom = 1.08 + Math.min(0.10, t * 0.0005);
            const scale = (GAME.W / img.width) * zoom;
            const dw = img.width * scale;
            const dh = img.height * scale;
            // Anchor on Clippy: start at frac 0.55 (lower-mid), pan to 0.35 (upper-mid)
            const panT = Math.min(1, t / 240);
            const frac = 0.55 - panT * 0.20;
            const dy = -(dh - GAME.H) * frac;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, (GAME.W - dw) / 2, dy, dw, dh);
        } else {
            // Asset-missing fallback: deep navy gradient + faint stage label badge.
            // Far better than a flat black screen — tells the player something
            // intentional is happening even when art fails to load. Gradient
            // is static — cache after first build to avoid per-frame allocation.
            if (!this._stageCardFallbackGrad) {
                const grad = ctx.createLinearGradient(0, 0, 0, GAME.H);
                grad.addColorStop(0, '#1a0a1a');
                grad.addColorStop(0.5, '#0a0612');
                grad.addColorStop(1, '#1a0a1a');
                this._stageCardFallbackGrad = grad;
            }
            ctx.fillStyle = this._stageCardFallbackGrad;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            // Pulsing center diamond as a visual placeholder
            const pulse = 0.4 + Math.sin(t * 0.08) * 0.2;
            ctx.fillStyle = `rgba(255, 224, 112, ${pulse})`;
            const cx = GAME.W / 2, cy = GAME.H / 2;
            for (let i = 0; i < 4; i++) ctx.fillRect(cx - 2 + (i === 1 ? 2 : i === 3 ? -2 : 0), cy - 2 + (i === 0 ? -2 : i === 2 ? 2 : 0), 2, 2);
        }
        // Letterbox bars
        const barH = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, GAME.W, barH);
        ctx.fillRect(0, GAME.H - barH, GAME.W, barH);

        // Inter-stage dialog beats in the TOP letterbox.
        // Beat 1 fades in at t > 30, beat 2 at t > 90. Each holds until card exit.
        const dialog = STAGE_CARD_DIALOG[next];
        if (dialog) {
            if (t > 30) {
                const k = Math.min(1, (t - 30) / 25);
                ctx.globalAlpha = k;
                drawText(ctx, dialog[0], GAME.W / 2, 10, '#ffe070', 1, 'center');
                ctx.globalAlpha = 1;
            }
            if (t > 90) {
                const k = Math.min(1, (t - 90) / 25);
                ctx.globalAlpha = k;
                drawText(ctx, dialog[1], GAME.W / 2, 19, '#c0a0d0', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }

        // Stage name + tagline appearing in the lower letterbox
        const stg = STAGES[next];
        if (stg) {
            if (t > 20) {
                const k = Math.min(1, (t - 20) / 30);
                ctx.globalAlpha = k;
                // 7-px font + 1-px outline = ~9px tall glyphs. Stack with
                // 10px vertical pitch so STAGE N / NAME / TAGLINE read as
                // distinct rows. Earlier 8-px pitch fused stage-name with
                // STAGE-N row when both had outline pixels.
                drawText(ctx, 'STAGE ' + stg.id, GAME.W / 2, GAME.H - 28, '#ffe070', 1, 'center');
                drawTextOutlined(ctx, stg.name, GAME.W / 2, GAME.H - 18, '#ff5050', '#1a0000', 1, 'center');
                ctx.globalAlpha = 1;
            }
            if (t > 80) {
                const k = Math.min(1, (t - 80) / 30);
                ctx.globalAlpha = k;
                drawText(ctx, stg.tagline, GAME.W / 2, GAME.H - 8, '#c0a0d0', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }
        // Secret-discovery flourish — when the no-damage stage-1 clear routes
        // the player to stage 9, paint a cyan "SECRET FOUND" overlay across
        // the center of the card so the moment lands. Cyan keeps it visually
        // distinct from the normal red/gold stage palette.
        if (this._secretDiscoveryCard) {
            // Flash band — full-width across the middle of the canvas
            const flash = Math.max(0, 1 - t / 90);   // fades over first 1.5s
            if (flash > 0) {
                ctx.fillStyle = `rgba(122, 240, 255, ${(flash * 0.45).toFixed(3)})`;
                ctx.fillRect(0, GAME.H / 2 - 20, GAME.W, 40);
            }
            // Label appears just after the flash starts
            if (t > 12) {
                const k = Math.min(1, (t - 12) / 25);
                const pulse = (Math.sin(t * 0.16) + 1) * 0.5;
                ctx.globalAlpha = k * (0.65 + pulse * 0.35);
                drawTextOutlined(ctx, 'SECRET FOUND', GAME.W / 2, GAME.H / 2 - 8, '#7af0ff', '#0a1a24', 2, 'center');
                drawText(ctx, 'OFF THE GRID', GAME.W / 2, GAME.H / 2 + 6, '#80a0c0', 1, 'center');
                ctx.globalAlpha = 1;
            }
        }
        // Blinking "X" hint in the upper-right corner — small footprint so it doesn't
        // crowd the dialog beats below, and the player learns the input quickly anyway.
        if (t > 130 && (t % 60) < 40) {
            drawText(ctx, 'X >', GAME.W - 4, 2, '#a08090', 1, 'right');
        }
    }

    // ============== Stage select ==============
    // R230: post-R226 the main run is 1..9. Secret RECYCLE BIN is 10,
    // REALITY DISTORTION is 14, and FPS-arena CORE BREACH is 15. Stage
    // select returns the ordered list of stage IDs to render in the grid,
    // based on what's currently unlocked + konami state.
    _stageSelectList() {
        // R291: main campaign is now 1-13 (Pipeline 4, Board Room 5,
        // Ballmer Office 6, Ballmer Arena 7, Keynote 8, Keynote Corridor 9,
        // Gates Arena 10, Founder's 11, Boss Rush 12, Cloud 13).
        // Secret stages: Recycle Bin 14, Reality Distortion 18, Core Breach 19.
        const hasSecret = !!achievements.stats?.secretStageDiscovered;
        const gameCleared = achievements.unlocked.has('clear_game');
        const konami = !!this._konamiUnlocked;
        const ids = [];
        // R368: gameCleared OR konami should expose ALL 13 campaign
        // stages, not just the player's furthest reached. The old
        // logic capped mainMax at `unlockedStage` even when the
        // achievement said the player had beaten the game — so
        // veterans + konami users saw only stage 1 + the post-game
        // tiles, with the 02-13 campaign mysteriously missing.
        let mainMax = Math.min(13, Math.max(1, this.unlockedStage || 1));
        if (gameCleared || konami) mainMax = 13;
        for (let i = 1; i <= mainMax; i++) {
            ids.push(i);
            // R423c+R426: stage 23 BLOCK 11 (Doom) chains from stage 4 via
            // nextStage. Surface it on the grid right after stage 4 so it
            // reads as the "4B" branch the displayId implies.
            if (i === 4 && (this.unlockedStage > 4 || gameCleared || konami)) ids.push(23);
        }
        if (hasSecret || konami) ids.push(14);
        // R487: Training (15), Boss Rush Mode (formerly 16, now 24), and
        // Time Trial (17) are MODES — owned by the main-menu list, not
        // stage-select. Don't surface them here as tiles (was confusing —
        // they showed up in both places). Stage 16 IS still on the grid
        // because it's now FLOOR 11 (a real Doom stage, not boss rush).
        if (gameCleared || konami) ids.push(16);   // FLOOR 11 (Doom)
        if (gameCleared || konami) ids.push(18);   // REALITY DISTORTION (Jobs)
        if (konami) ids.push(19);
        // R523: HOLD THE LINE turret stage — post-game tile alongside
        // FLOOR 11 + RDF, available after the campaign clear or via konami.
        if (gameCleared || konami) ids.push(25);
        // R306: Mecha-Gates 3-stage super-secret arc — konami-only.
        // 20 = beat-em-up approach, 21 = FPS corridor, 22 = FPS arena.
        if (konami) {
            ids.push(20);
            ids.push(21);
            ids.push(22);
        }
        return ids;
    }

    _tickStageSelect() {
        this._tickUnlockToasts();
        if (input.isPressed('pause')) { this.scene = SCENE.TITLE; audio.sfx('pause'); return; }
        const ids = this._stageSelectList();
        const total = ids.length;
        const cols = 4;
        const visibleRows = 3;   // R278: 3 rows fit cleanly; rest scrolls
        // Init guard — first arrow press otherwise computes NaN and locks menu.
        if (this.stageSelectIndex == null) this.stageSelectIndex = 0;
        if (this.stageSelectIndex >= total) this.stageSelectIndex = total - 1;
        if (this.stageSelectScroll == null) this.stageSelectScroll = 0;
        if (input.isPressed('left'))  { this.stageSelectIndex = (this.stageSelectIndex + total - 1) % total; audio.sfx('select'); }
        if (input.isPressed('right')) { this.stageSelectIndex = (this.stageSelectIndex + 1) % total; audio.sfx('select'); }
        if (input.isPressed('up'))    { this.stageSelectIndex = Math.max(0, this.stageSelectIndex - cols); audio.sfx('select'); }
        if (input.isPressed('down'))  { this.stageSelectIndex = Math.min(total - 1, this.stageSelectIndex + cols); audio.sfx('select'); }
        // R278: follow the cursor — scroll so the selected row stays in view.
        const cursorRow = Math.floor(this.stageSelectIndex / cols);
        if (cursorRow < this.stageSelectScroll) this.stageSelectScroll = cursorRow;
        if (cursorRow >= this.stageSelectScroll + visibleRows) {
            this.stageSelectScroll = cursorRow - visibleRows + 1;
        }
        // Clamp scroll to valid range
        const totalRows = Math.ceil(total / cols);
        const maxScroll = Math.max(0, totalRows - visibleRows);
        if (this.stageSelectScroll > maxScroll) this.stageSelectScroll = maxScroll;
        if (this.stageSelectScroll < 0) this.stageSelectScroll = 0;
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            const stage = ids[this.stageSelectIndex];
            // R291: secret RECYCLE BIN moved 12→14, REALITY DISTORTION 16→18.
            const allowed = this._konamiUnlocked
                || stage <= this.unlockedStage
                || (stage === 14 && !!achievements.stats?.secretStageDiscovered)
                || (stage === 18 && achievements.unlocked.has('clear_game'));
            if (allowed) {
                audio.sfx('menu');
                // Reset player + run stats for the selected stage
                this.player = null;
                this.totalTime = 0;
                this.totalDeaths = 0;
                this._startStage(stage);
            } else {
                audio.sfx('comboBreak');
            }
        }
    }
    _drawStageSelect() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a0410';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        // Subtle bg pattern
        ctx.fillStyle = '#1a0a1a';
        for (let y = 0; y < GAME.H; y += 8) for (let x = 0; x < GAME.W; x += 8) {
            if (((x + y) >> 3) & 1) ctx.fillRect(x, y, 1, 1);
        }
        drawTextOutlined(ctx, 'STAGE SELECT', GAME.W / 2, 12, '#ffe070', '#a82020', 1, 'center');

        // R230: dynamic grid driven by _stageSelectList. The list collapses
        // gaps in the STAGES manifest (skips 11-13 which are training /
        // boss-rush mode / time-trial — those live in MAIN_MENU). Konami
        // unlocks expose 10 + 14 + 15 + 16 even without their usual gates.
        // R278: grid scrolls when total entries exceed visibleRows.
        const hasSecret = !!achievements.stats?.secretStageDiscovered;
        const ids = this._stageSelectList();
        const total = ids.length;
        const cols = 4;
        const visibleRows = 3;
        const totalRows = Math.ceil(total / cols);
        const scroll = this.stageSelectScroll || 0;
        const tileW = 58, tileH = 50;
        const startX = (GAME.W - cols * tileW - (cols - 1) * 4) / 2;
        const startY = 30;
        for (let i = 0; i < total; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            // R278: skip rows outside the scroll window
            const drawRow = row - scroll;
            if (drawRow < 0 || drawRow >= visibleRows) continue;
            const tx = Math.round(startX + col * (tileW + 4));
            const ty = Math.round(startY + drawRow * (tileH + 6));
            const stage = ids[i];
            const data = STAGES[stage];
            const unlocked = this._konamiUnlocked
                || stage <= this.unlockedStage
                || (stage === 14 && hasSecret)
                || (stage === 18 && achievements.unlocked.has('clear_game'));
            const selected = i === this.stageSelectIndex;

            // Tile backplate
            ctx.fillStyle = selected ? '#a01020' : '#1a0a14';
            ctx.fillRect(tx, ty, tileW, tileH);
            // R476: dim painted thumbnail underneath the labels — shows the
            // stage's cinematic-card backdrop as a tiny preview. Locked
            // stages show only the dark backplate (no spoilers).
            if (unlocked) {
                const cardKey = STAGE_CARD_KEYS[stage];
                const cardImg = cardKey ? sprites.images?.get(cardKey) : null;
                if (cardImg?.complete && cardImg.naturalWidth > 0) {
                    ctx.save();
                    ctx.globalAlpha = selected ? 0.55 : 0.4;
                    ctx.imageSmoothingEnabled = false;
                    // Cover-fit: scale to fill tile, crop center
                    const tileAR = tileW / tileH;
                    const imgAR = cardImg.naturalWidth / cardImg.naturalHeight;
                    let sx0, sy0, sw, sh;
                    if (imgAR > tileAR) {
                        // image wider than tile → crop horizontally
                        sh = cardImg.naturalHeight;
                        sw = sh * tileAR;
                        sx0 = (cardImg.naturalWidth - sw) / 2;
                        sy0 = 0;
                    } else {
                        sw = cardImg.naturalWidth;
                        sh = sw / tileAR;
                        sx0 = 0;
                        sy0 = (cardImg.naturalHeight - sh) / 2;
                    }
                    ctx.drawImage(cardImg, sx0, sy0, sw, sh, tx, ty, tileW, tileH);
                    ctx.restore();
                }
            }
            ctx.fillStyle = selected ? '#ffe070' : '#3a2a4a';
            // Border
            ctx.fillRect(tx, ty, tileW, 1);
            ctx.fillRect(tx, ty + tileH - 1, tileW, 1);
            ctx.fillRect(tx, ty, 1, tileH);
            ctx.fillRect(tx + tileW - 1, ty, 1, tileH);

            // R300: per-stage displayId from STAGES manifest. Campaign
            // stages stay numeric (01..13), side stages get letter prefixes:
            //   S1 = secret (Recycle Bin)
            //   T  = training
            //   P1..P4 = post-game (Boss Rush Mode, Time Trial, RDF, Core Breach)
            // Side-stage tiles also get a colored frame so they read as bonus
            // content, not "stages 14+".
            const stgData = STAGES[stage];
            const displayLabel = stgData?.displayId || String(i + 1).padStart(2, '0');
            const cat = stgData?.category || 'campaign';
            const idColor = unlocked
                ? (cat === 'secret'   ? '#7af0ff'
                : cat === 'extra'     ? '#80ff80'
                : cat === 'postgame'  ? '#ff90c8'
                : '#ffe070')
                : '#604068';
            if (unlocked) {
                // R476: outlined so it pops against the painted thumbnail
                drawTextOutlined(ctx, displayLabel, tx + 4, ty + 4, idColor, '#000000', 1, 'left');
            } else {
                drawText(ctx, '??', tx + 4, ty + 4, '#604068', 1, 'left');
            }
            // R300: side-stage frame accent — paint top + bottom edges of
            // the tile in the category color so bonus stages visually
            // separate from canon campaign tiles.
            if (unlocked && cat !== 'campaign') {
                ctx.fillStyle = idColor;
                ctx.globalAlpha = 0.5;
                ctx.fillRect(tx, ty, tileW, 1);
                ctx.fillRect(tx, ty + tileH - 1, tileW, 1);
                ctx.globalAlpha = 1;
            }
            // R278: wrap name onto up to 3 lines — find a split where BOTH
            // resulting lines fit; if no clean 2-line fit exists, fall back
            // to 3 lines (e.g. "OFFICE PARK JUNGLE" → OFFICE / PARK / JUNGLE).
            // tileW=58, font=5px+1px=6px-per-char → CHARS=9 fits per line.
            const fullName = data?.name || '';
            const CHARS = 9;
            const color = unlocked ? '#fff' : '#604068';
            const lines = this._wrapStageLabel(fullName, CHARS, 3);
            // Vertical center across the available label band (ty+12 to ty+38)
            const lineH = 8;
            const totalH = lines.length * lineH;
            const startTextY = ty + 12 + Math.max(0, (28 - totalH) / 2);
            for (let li = 0; li < lines.length; li++) {
                // R476: outline labels so they stay readable over the thumbnail
                drawTextOutlined(ctx, lines[li], tx + 4, startTextY + li * lineH, color, '#000000', 1, 'left');
            }

            // Medal row — 3 slots at bottom of tile
            const med = this.runStats?.medals?.[stage] || { noDamage: false, allKills: false, secret: false };
            const slots = [
                { ok: med.noDamage, c: '#50ff70' },
                { ok: med.allKills, c: '#ff8050' },
                { ok: med.secret,   c: '#7af0ff' },
            ];
            for (let s = 0; s < 3; s++) {
                const sx = tx + 6 + s * 14;
                const sy = ty + tileH - 12;
                ctx.fillStyle = slots[s].ok ? slots[s].c : '#3a2a3a';
                ctx.fillRect(sx, sy, 8, 8);
                if (slots[s].ok) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(sx + 3, sy + 1, 2, 6);
                    ctx.fillRect(sx + 1, sy + 3, 6, 2);
                }
            }
            // Best-score pip — small gold star top-right of tile when stage
            // has a recorded best. Marks NEW BEST runs permanently.
            const stageBest = achievements.stats?.stageBestScores?.[stage] || 0;
            if (unlocked && stageBest > 0) {
                ctx.fillStyle = '#ffe070';
                const sx = tx + tileW - 7, sy = ty + 3;
                ctx.fillRect(sx + 1, sy, 2, 4);
                ctx.fillRect(sx, sy + 1, 4, 2);
            }
            // Secret stage shimmer
            if (stage === 14) {
                // R291: RECYCLE BIN shifted 12→14
                ctx.fillStyle = '#7af0ff';
                ctx.globalAlpha = 0.25 + Math.sin(this.bootTimer * 0.1) * 0.15;
                ctx.fillRect(tx + 1, ty + 1, tileW - 2, tileH - 2);
                ctx.globalAlpha = 1;
            }
        }

        // R278: scroll arrows when there are off-screen rows.
        if (scroll > 0) {
            const t = this.bootTimer || 0;
            const yOff = Math.sin(t * 0.15) * 1;
            ctx.fillStyle = '#ffe070';
            drawText(ctx, '▲', GAME.W / 2, startY - 10 + yOff, '#ffe070', 1, 'center');
        }
        if (scroll < totalRows - visibleRows) {
            const t = this.bootTimer || 0;
            const yOff = Math.sin(t * 0.15) * 1;
            const arrowY = startY + visibleRows * (tileH + 6) - 2 + yOff;
            drawText(ctx, '▼', GAME.W / 2, arrowY, '#ffe070', 1, 'center');
        }
        // Selected-stage detail strip at the bottom — fixed position so
        // scrolling doesn't shift it. Uses the same id list so stages beyond
        // 9 get a proper name + tagline.
        const sel = ids[this.stageSelectIndex];
        const selData = STAGES[sel];
        if (selData) {
            const unlocked = this._konamiUnlocked
                || sel <= this.unlockedStage
                || (sel === 14 && hasSecret)
                || (sel === 18 && achievements.unlocked.has('clear_game'));
            // R278: pin detail strip to fixed bottom area regardless of scroll
            const detY = GAME.H - 32;
            drawTextOutlined(ctx, unlocked ? selData.name : '? ? ?', GAME.W / 2, detY, '#fff', '#1a0010', 1, 'center');
            if (unlocked) {
                drawText(ctx, selData.tagline, GAME.W / 2, detY + 9, '#c0a0d0', 1, 'center');
            }
        }
        drawText(ctx, 'ARROWS SELECT   X START   P BACK', GAME.W / 2, GAME.H - 8, '#604068', 1, 'center');
        this._drawUnlockToasts();
    }

    _spawnMiniBoss() {
        this.miniBossSpawned = true;
        const stg = STAGES[this.currentStage];
        // R232 + R316: mini-boss anchors at least 100px right of the player
        // and inside the level. _safeBossAnchorX guarantees the gap so the
        // mini-boss never spawns on top of or behind the player even if the
        // player rushed past the trigger.
        const bx = this._safeBossAnchorX(100);
        const by = this.level.height - 32;
        // Pick a thematic mini-boss kind based on stage. Default to the stage's own boss
        // sprite at 35% HP and no phase-2 transition.
        const miniKind = (this.level.data.miniBossKind) || stg.boss;
        // Spawn via enemy manager — re-use Boss class
        const m = this.enemies.spawnBoss(bx, by, miniKind);
        if (m) {
            m.isMini = true;
            m.hp = Math.ceil(m.maxHp * 0.35);
            m.maxHp = m.hp;
            m.score = Math.round(m.score * 0.4);
            m.name = 'MINI ' + m.name;
            m.tagline = 'WARMUP ROUND';
            // R348: visually smaller — 0.75x w/h so the player reads it
            // as a smaller, lesser threat than the real boss.
            m.w = Math.round(m.w * 0.75);
            m.h = Math.round(m.h * 0.75);
            // R348: mini-boss attack-cadence is FASTER but the patterns
            // are limited to the FIRST variant only. They never fire the
            // phase-2-only attacks (Paper Cyclone, Floppy Rain, Shred
            // Field) — those are reserved for the real fight.
            m._miniAttackOnly = true;
            // R348: faster attack cadence (60f vs ~90f for the main boss)
            // so the mini still feels threatening despite limited variety.
            m._fireRateMul = 0.6;
            // R348: mini-boss can never enter phase 2 — keeps the moveset
            // strictly limited.
            m._noPhase2 = true;
        }
        audio.sfx('bossHit');
        this.camera.shake(6);
        this._triggerBossEntrance(true);
    }

    _spawnBoss() {
        this.bossSpawned = true;
        // R329: kill any still-alive mini-boss before the main boss spawns.
        // Player otherwise ends up fighting BOTH (the mini-boss has wandered
        // into the arena while the player crossed the bossTrigger). Despawn
        // with a payoff burst + grant the score the player would have earned
        // from finishing it — fair compensation for the unintended skip.
        for (const e of this.enemies.enemies) {
            if (e.isMini && e.alive) {
                particles.explosion(e.x + e.w / 2, e.y + e.h / 2, '#ff8050', 22);
                particles.shockRing(e.x + e.w / 2, e.y + e.h / 2, 24, 16, '#ffe070');
                this.player.score += e.score || 0;
                e.alive = false;
                e.hp = 0;
                audio.sfx('bossHit');
            }
        }
        // R334: chase bosses (HELICOPTER) skip the cinematic intro —
        // the chopper announces itself by being in the sky from frame 1.
        // The intro card would freeze the player in place which kills
        // the chase tempo.
        const stg = STAGES[this.currentStage];
        if (stg && stg.boss === 'HELICOPTER') {
            this._finishBossIntro();
            return;
        }
        // R330: create a BossLair for any boss that has a spec. The lair
        // is constructed BEFORE the cinematic so it can render its name-tag
        // + decorations as the boss-intro card resolves. Lair clamps the
        // left side of the arena so the player can't backtrack mid-fight.
        if (stg && BOSS_LAIRS[stg.boss]) {
            // Arena spans from the player's CURRENT x out to the right
            // edge of the level (or 1.5x screen, whichever is smaller for
            // tight arenas). Floor anchors at level.height-1 so the bottom
            // edge is flush with the ground.
            // R383: arena was 1.5× screen wide and clamped to the
            // remaining level width — at end-of-stage triggers this gave
            // a 128px-wide strip with boss + player on top of each other.
            // Now: aim for 2.5× screen and shift arenaX BACK if needed so
            // the arena fits within the level, even if that means the gate
            // appears well behind the player's current x.
            const targetW = GAME.W * 2.5;
            // Default: arena starts a little behind the player (lead-in).
            // If level doesn't have room ahead, shift the anchor back.
            const anchorBack = Math.min(this.player.x - 32, this.level.width - targetW);
            const arenaX = Math.max(0, anchorBack);
            const arenaW = Math.min(this.level.width - arenaX, targetW);
            const arenaY = this.level.height - GAME.H + 8;
            const arenaH = GAME.H - 8;
            this._bossLair = new BossLair(stg.boss, arenaX, arenaY, arenaW, arenaH);
            // R383: snap the player a little INTO the arena so the gate
            // drops cleanly behind them. Without this, the player can
            // straddle the gate-spawn line and the wall lands on top of
            // them. Keeps existing camera + level state — just clamps x.
            const playerArenaX = arenaX + 48;
            if (this.player && this.player.x < playerArenaX) {
                this.player.x = playerArenaX;
            }
            // R374: lair spec can declare a painted arenaBg key — swap
            // the parallax bg so the player walks into a visibly
            // different room (e.g. wrecked-copier jungle clearing for
            // the COPIER fight). Restored to null when the lair is
            // cleared in the main tick.
            if (this._bossLair.spec?.arenaBg && this.parallax) {
                this._preLairBgOverride = this.parallax.bgKeyOverride;
                this.parallax.bgKeyOverride = this._bossLair.spec.arenaBg;
            }
        }
        // Route through the cinematic pre-boss slide. The actual spawn +
        // entrance flourish runs at the end of the cinematic in
        // _finishBossIntro(). Skippable with X/jump after a short hold so
        // players can mash through on repeat runs.
        this.scene = SCENE.BOSS_INTRO;
        this._bossIntro = { age: 0, done: false };
    }

    // Actual boss spawn + entrance flourish — called at the end of the
    // BOSS_INTRO cinematic, OR directly if cinematic is skipped.
    _finishBossIntro() {
        // R424: Doom-mode short-circuit. Doom boss is already in the entities
        // list — no spawning needed. Just return to DOOM_PLAY so the cinematic
        // exits cleanly.
        if (this._doomMode && this._doomEngine) {
            this._bossIntro = null;
            this.scene = SCENE.DOOM_PLAY;
            return;
        }
        const stg = STAGES[this.currentStage];
        // R232: spawn boss at a FIXED arena center, NOT relative to player.x.
        // Math: rightmost camera-X is `level.width - GAME.W`. With the
        // boss-arena follow, camera centers on midpoint(player, boss). For
        // the boss to stay fully inside the viewport with patrol drift (±72),
        // anchor must satisfy: bossCenter + PATROL_RANGE + boss.w/2 ≤
        // level.width. With PATROL_RANGE=72 + boss.w/2≤28, that's
        // anchor ≤ level.width - 100. We use level.width - GAME.W * 0.45
        // (= width - 115) for safety. Lower bound is player.x + 80 so we
        // don't anchor behind the player on short levels; UPPER bound caps
        // it to the safe arena even if the player rushes the trigger.
        // R316: enforce minimum 110px gap right of player. Was: Math.min(...,
        // Math.max(player.x+80, ...)), which could clamp BELOW player.x+80
        // when safeAnchorX was small.
        const arenaX = this._safeBossAnchorX(110);
        this._bossArenaX = arenaX;
        // R334: HELICOPTER chase boss spawns in the AIR — 80 px above the
        // player's current y, NOT on the ground. Use the player's x as a
        // starting reference (the chase movement will catch up).
        // R383: was spawning boss at arenaX (LEFT edge) = ~16px from the
        // player. Two characters stacked on top of each other felt like a
        // "wall fight" not a boss arena. Spawn boss at the FAR (right)
        // side of the arena so the player has ~280px to traverse + room
        // to read the boss silhouette on entry. Air units (helicopter)
        // use the legacy offset since they sweep in from above.
        const isAir = stg.boss === 'HELICOPTER';
        const lair = this._bossLair;
        const lairFarX = lair ? (lair.arenaX + lair.arenaW - 64) : arenaX;
        const bx = isAir ? (this.player.x + 80) : lairFarX;
        const by = isAir ? Math.max(40, this.player.y - 80) : (this.level.height - 32);
        if (stg.boss === 'GAUNTLET') {
            // R364: Stage 12 Boss Rush — recap of every boss the player
            // has faced in the campaign so far (stages 1, 2, 3, 4, 5, 7,
            // 10, 11). Pre-R364 the queue was just the first 3, which
            // felt anticlimactic for the namesake "BOSS RUSH" stage.
            // Skips the not-yet-fought stage-12-onward bosses.
            this._gauntletQueue = [
                'COPIER_3000', 'SHREDDER', 'CTRL_ALT_DEL',
                'SPINDLER', 'BALLMER', 'GATES', 'CLIPPY_2',
            ];
            this._spawnNextGauntlet();
        } else if (stg.boss === 'GAUNTLET_FULL') {
            // R281: Post-game Boss Rush — all 8 UNIQUE campaign bosses
            // back-to-back. Order matches campaign progression so the
            // final fight is still ALGORITHM. Pre-R281 this queue skipped
            // SPINDLER (the stage-4 boss); now included.
            this._gauntletQueue = [
                'COPIER_3000', 'SHREDDER', 'CTRL_ALT_DEL', 'SPINDLER',
                'BALLMER', 'GATES', 'CLIPPY_2', 'ALGORITHM',
            ];
            this._spawnNextGauntlet();
        } else {
            this.enemies.spawnBoss(bx, by, stg.boss);
        }
        audio.playTrack('bossBattle');
        this.camera.shake(10);
        this._triggerBossEntrance();
        this.scene = SCENE.PLAY;
        this._bossIntro = null;
        // R198: clear input + reset player physics on cinematic exit.
        // The cinematic doesn't tick the player, so whatever state the
        // player was in when the cinematic fired (RUN/SLIDE/JUMP/etc.)
        // could carry through with stale velocity. Worse: the SAME key
        // press that skipped the cinematic is still held when PLAY
        // resumes, so the player ate a phantom input on the first
        // post-cinematic frame. Wipe input + force a clean IDLE state
        // so the player has full control the moment the bars retract.
        input.releaseAll();
        if (this.player) {
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.state = 'idle';
            this.player.hurtTimer = 0;
            this.player.slideTimer = 0;
            this.player.rollTimer = 0;
            this.player.dashAtkTimer = 0;
            this.player.backdashTimer = 0;
        }
    }

    _spawnNextGauntlet() {
        if (!this._gauntletQueue || !this._gauntletQueue.length) return false;
        // Mid-gauntlet kill payoff — previous boss just died, gauntlet swap
        // is happening this tick. Without this, gauntlet boss kills land
        // without slow-mo/shake while the final boss kill gets the full
        // payoff. Inconsistent. Smaller magnitudes than final kill so the
        // last one still feels biggest.
        this.triggerSlowMo(Math.floor(AMBIENT.SLOWMO_BOSS_KILL_F * 0.5));
        this.camera.shake(4);
        const kind = this._gauntletQueue.shift();
        // R232 + R316: reuse the fixed arena center so each gauntlet boss
        // spawns at the same anchor. If the player has wandered past the
        // stored anchor (post-respawn, slow death + reset), recompute so
        // the next gauntlet boss still spawns >= 110px right of player.
        const playerCx = this.player.x + this.player.w / 2;
        const minBossX = playerCx + 110;
        let bx = this._bossArenaX != null ? this._bossArenaX : this._safeBossAnchorX(110);
        if (bx < minBossX) bx = this._safeBossAnchorX(110);
        if (this._bossArenaX == null) this._bossArenaX = bx;
        const by = this.level.height - 32;
        this.enemies.spawnBoss(bx, by, kind);
        this.camera.shake(8);
        this._triggerBossEntrance();
        return true;
    }

    // Boss entrance beat — title card with name/tagline + (full boss) red flash.
    // Main:  120f total — 0-15 flash, 15-90 hold, 90-120 fade.
    // Mini:   80f total — no flash, slimmer letterbox, shorter hold.
    // Boss reference is resolved at draw time since enemies.spawnBoss hasn't
    // fully wired this.boss yet at the moment we trigger.
    _triggerBossEntrance(isMini = false) {
        this._bossEntrance = { age: 0, isMini };
        // Full boss gets the heavy entrance roar; mini-boss stays on the
        // smaller bossHit cue so the two arrivals stay tonally distinct.
        if (!isMini) audio.sfx('bossEntrance');
        else audio.sfx('bossHit');
    }

    // R315+R318: shared safe-spawn helper. Given a desired (x,y) in world
    // coords, returns a sanitized (x,y) inside level bounds and outside any
    // solid tile. Scans upward in T-px steps for the nearest non-solid AABB
    // position when the start point is inside terrain. Used by both
    // _respawn (death recovery) and _startStage (initial spawn).
    _findSafeSpawn(x, y, w, h) {
        const T = GAME.TILE;
        x = Math.max(0, Math.min(this.level.width  - w - 1, x));
        y = Math.max(0, Math.min(this.level.height - h - 1, y));
        const lvl = this.level;
        const aabbSolid = (xx, yy) => (
            lvl.isSolid(xx + 1,     yy + 1) ||
            lvl.isSolid(xx + w - 1, yy + 1) ||
            lvl.isSolid(xx + 1,     yy + h - 1) ||
            lvl.isSolid(xx + w - 1, yy + h - 1)
        );
        if (!aabbSolid(x, y)) return { x, y };
        console.warn('_findSafeSpawn: requested position is solid — rescanning', x, y);
        for (let dy = 0; dy < this.level.height; dy += T) {
            if (y - dy >= 0 && !aabbSolid(x, y - dy)) return { x, y: y - dy };
            if (y + dy < this.level.height - h && !aabbSolid(x, y + dy)) return { x, y: y + dy };
        }
        // Emergency fallback — bail to top of level
        return { x, y: 0 };
    }

    // R316: compute a safe boss anchor X that:
    //   - sits within the level bounds (clamped to [GAME.W*0.5, level.width-GAME.W*0.45])
    //   - is at least minGap px to the RIGHT of the player center
    //   - prefers a fixed arena anchor (level.width - GAME.W*0.45) when that
    //     still satisfies the gap
    // If the player is far past the safe anchor (post-cinematic skip + dash),
    // we accept the player+gap anchor and let the camera follow.
    _safeBossAnchorX(minGap = 110) {
        const safeAnchorX = this.level.width - GAME.W * 0.45;
        const leftLimit   = GAME.W * 0.5;
        const playerCx    = this.player.x + (this.player.w || 0) / 2;
        const minBoss     = playerCx + minGap;
        // If the safe anchor is already far enough right, use it.
        if (safeAnchorX >= minBoss) return safeAnchorX;
        // Otherwise place the boss just past the gap, but never off-screen
        // past the right wall.
        const rightLimit = Math.max(leftLimit, this.level.width - GAME.W * 0.18);
        return Math.min(rightLimit, minBoss);
    }

    _respawn() {
        // R315/R318: route through shared _findSafeSpawn so respawn never
        // lands inside solid terrain.
        const { x: sx, y: sy } = this._findSafeSpawn(
            this.level.data.playerStart.x,
            this.level.data.playerStart.y,
            this.player.w, this.player.h
        );
        this.player.x = sx;
        this.player.y = sy;
        this.player.vx = 0; this.player.vy = 0;
        this.player.state = 'idle';
        this.player.resetForStage();
        // R315: snap camera to player so the materialize ring doesn't draw
        // off-screen and the player isn't briefly visible at the old camera
        // position before the camera follows.
        if (this.camera && this.camera.snapTo) {
            // R365: was `w / 2` / `h / 2` — undefined identifiers; respawn
            // crashed every time. Use player dims directly.
            this.camera.snapTo(
                this.player.x + this.player.w / 2,
                this.player.y + this.player.h / 2,
            );
        }
        // Materialize beat — outward shock ring + dust + ready chime so the
        // respawn isn't a silent teleport. The i-frame window is the same;
        // this just makes it visible/audible.
        const cx = this.player.x + this.player.w / 2;
        const cy = this.player.y + this.player.h / 2;
        particles.shockRing(cx, cy, 18, 16, '#a8d4ff');
        particles.dust(cx, this.player.y + this.player.h - 2);
        audio.sfx('respawn');
    }

    // ============== stage transitions ==============
    _startStage(n) {
        // Bounds-clamp: STAGE_LOADERS[0] is null, indices 1..22 are real stages.
        // Out-of-range arrivals (stale save, tampered URL, math glitch) shouldn't crash —
        // fall back to stage 1.
        if (!Number.isInteger(n) || n < 1 || n >= STAGE_LOADERS.length || !STAGE_LOADERS[n]) {
            console.warn('_startStage: invalid stage', n, '— defaulting to 1');
            n = 1;
        }
        this.currentStage = n;
        // R291: main campaign is 1-13. Training (15), boss-rush-mode (16),
        // time-trial (17), reality-distortion (18), core-breach (19) don't
        // count toward the unlock high-water mark.
        if (n <= 13) {
            this.unlockedStage = Math.max(this.unlockedStage, n);
        }
        // Reset per-stage counters
        this.stageStats = { kills: 0, deaths: 0, damageTaken: 0, secrets: 0, weaponDamage: {}, shotsFired: 0 };
        // Defensive reset: stage-clear gate, in case the previous stage death-handled
        // the boss-clear path or the player was rescued in the middle of stage clear.
        this._clearScheduled = false;
        this._clearBursts = [];
        this.slowMoFrames = 0;
        this._newlyUnlocked = null;
        this._bossKillBeatFired = false;
        // Gauntlet queue from boss-rush (stage 7) can survive if the player
        // dies or quits mid-rush. Drop any leftover entries before the next
        // stage so its boss-clear path doesn't try to spawn the next rush boss.
        this._gauntletQueue = null;
        this._bossEntrance = null;
        this._bossIntro = null;
        this._lastBossPhase = null;
        const data = STAGE_LOADERS[n]();
        // R384: init ambient prop manager early so FPS + beat-em-up modes
        // also get atmospheric layers (embers, lightning, drips, fog).
        // Previously only platformer mode received this — beat stages got
        // zero ambient animation regardless of what stage data declared.
        this._ambientProps = new AmbientPropManager(data.ambientProps || []);
        // R229: FPS arena short-circuit. If the loader returns fpsMode=true,
        // skip the whole platformer pipeline (level/camera/enemies/pickups)
        // and hand off to the FpsArena scene instead.
        // R272: route through STAGE_INTRO first so painted-backdrop intro
        // cinematics fire before the arena loads.
        if (data.fpsMode) {
            // R457: clear other engines so stale instances from a prior
            // stage don't leak into the new scene (caught by playtest scan
            // which saw stage 22 → 23 leaving _beatEmUp set).
            this._beatEmUp = null;  this._beatMode = false;
            this._doomEngine = null; this._doomMode = false;
            this._fpsArena = new FpsArena(data, this.ctx, this);
            this._fpsMode = true;
            this._fpsPendingPlay = true;   // signal _tickStageIntro to FPS_PLAY
            this.parallax.setTheme(data.theme);
            audio.playTrack(data.music || 'pipeline');
            this.storyTimer = 0;
            this._fadeTo(SCENE.STAGE_INTRO);
            return;
        }
        // R306: beat-em-up street-brawler short-circuit. Same pattern as
        // FPS — route through STAGE_INTRO first, then hand off to BEAT_PLAY.
        if (data.beatMode) {
            // R457: clear other engines (see above)
            this._fpsArena = null;  this._fpsMode = false;
            this._doomEngine = null; this._doomMode = false;
            this._beatEmUp = new BeatEmUp(data, this.ctx, this);
            this._beatMode = true;
            this._beatPendingPlay = true;
            this.parallax.setTheme(data.theme);
            audio.playTrack(data.music || 'bossBattle');
            this.storyTimer = 0;
            this._fadeTo(SCENE.STAGE_INTRO);
            return;
        }
        // R423: Doom-style free-roam first-person mode. Same routing
        // pattern — STAGE_INTRO first, then hand off to DOOM_PLAY.
        if (data.doomMode) {
            // R457: clear other engines (see above)
            this._fpsArena = null;  this._fpsMode = false;
            this._beatEmUp = null;  this._beatMode = false;
            this._doomEngine = new DoomEngine(data, this.ctx, this);
            this._doomMode = true;
            this._doomPendingPlay = true;
            this.parallax.setTheme(data.theme);
            audio.playTrack(data.music || 'bossBattle');
            this.storyTimer = 0;
            this._fadeTo(SCENE.STAGE_INTRO);
            return;
        }
        // R523: mounted-turret arena stage. Third-person over-the-shoulder
        // wave defense vs CRT-monster monsters. Same dispatch pattern.
        if (data.turretMode) {
            this._fpsArena = null;  this._fpsMode = false;
            this._beatEmUp = null;  this._beatMode = false;
            this._doomEngine = null; this._doomMode = false;
            this._turretArena = new TurretArena(data, this.ctx, this);
            this._turretMode = true;
            this._turretPendingPlay = true;
            this.parallax.setTheme(data.theme);
            audio.playTrack(data.music || 'arenaBoss');
            this.storyTimer = 0;
            this._fadeTo(SCENE.STAGE_INTRO);
            return;
        }
        this._fpsPendingPlay = false;
        this._beatPendingPlay = false;
        this._doomPendingPlay = false;
        this._turretPendingPlay = false;
        this._fpsMode = false;
        this._beatMode = false;
        this._doomMode = false;
        this._turretMode = false;
        this._fpsArena = null;
        this._beatEmUp = null;
        this._doomEngine = null;
        this._turretArena = null;
        // R468: defensive — if a prior Doom stage left the pointer locked,
        // release it before entering a platformer stage so mouse-aim works.
        if (typeof document !== 'undefined' && document.pointerLockElement) {
            document.exitPointerLock?.();
        }
        this.level = new Level(data);
        this.parallax.setTheme(data.theme);
        // R334: stage data can override the parallax bg image independently
        // of the theme. Used by stage 21 to render apocalypse bg with
        // KEYNOTE theme palette + tile sprites.
        this.parallax.bgKeyOverride = data.bgKeyOverride || null;
        // Owl roosts: level can declare these in its data; otherwise default to a few sensible spots
        if (data.owlRoosts) {
            this.parallax.setOwlRoosts(data.owlRoosts.map(o => ({ x: o.x, y: o.y })));
        } else {
            this.parallax.setOwlRoosts([]);
        }
        this.camera.setBounds(this.level.width, this.level.height);
        this.enemies.clear();
        this.enemies.setStageDifficulty(n);
        this.pickups.clear();
        // Mark initial spawn phase so pre-placed enemies get a 60-frame grace
        // before they can act. Gives the player a full second to read the stage.
        this.enemies._initialSpawnPhase = true;
        for (const s of data.enemySpawns) this.enemies.spawn(s.x, s.y, s.type);
        this.enemies._initialSpawnPhase = false;
        // Stash totals so the stage-clear medals know what 100% looks like
        this.stageStats.totalEnemies = data.enemySpawns.length;
        this.stageStats.hasSecret = !!data.secretAlcove;
        this.pickups.loadFromLevel(data, this.level);
        // R219: link pickup walls into the level's solidity probe so
        // breakable walls block player + enemy movement until destroyed.
        this.level._wallSolidCheck = (px, py) => this.pickups.isWallSolid(px, py);
        // R315/R318: route through shared safe-spawn so a bad playerStart
        // (stale layout, math glitch) never traps the player in terrain.
        const pw = (this.player?.w) || 12;
        const ph = (this.player?.h) || 24;
        const safeStart = this._findSafeSpawn(
            data.playerStart.x, data.playerStart.y, pw, ph
        );
        if (!this.player) {
            this.player = new Player(safeStart.x, safeStart.y);
        } else {
            this.player.x = safeStart.x;
            this.player.y = safeStart.y;
            this.player.vx = 0; this.player.vy = 0;
            this.player.bullets.length = 0;
            this.player.resetForStage();
        }
        this.bossSpawned = false;
        this.miniBossSpawned = false;
        this.boss = null;
        this._lastBossPos = null;
        this._bossKillBeatFired = false;
        // R336: reset sewer→lab cinematic state so re-entering stage 4
        // fires the cinematic again.
        this._pipelineCineStarted = false;
        this._pipelineCineT = null;
        // R330: clear any leftover boss lair from prior stage.
        // R374: also reset the pre-lair bg-key snapshot so the parallax
        // override doesn't carry across stages.
        this._bossLair = null;
        this._preLairBgOverride = undefined;
        this.stageTime = 0;
        this.storyTimer = 0;
        // Training-ground god mode: invincible player, unlimited ammo,
        // grenades top up every frame. Banners + dummy respawn handled in
        // the per-frame play tick. Flag is read by Player._hurt to early-return
        // and by the HUD to add a "TRAINING" badge.
        this.trainingMode = !!data.training;
        this._trainingBanners = data.banners || [];
        if (this.player) {
            this.player.godMode = this.trainingMode;
        }
        // Boss Rush + Time Trial — stage-level flags consumed by play tick.
        // bossRushMode swaps the 3-boss gauntlet into the full 8-boss queue
        // when its bossTrigger fires. timeTrialMode shows the run timer
        // prominently and compares against bestTimeTrialTime on stage clear.
        this.bossRushMode = !!data.bossRushMode;
        this.timeTrialMode = !!data.timeTrialMode;
        // Mode-best banner clears per stage entry; otherwise a NEW BEST from
        // a prior mode clear would survive into the next stage-clear panel.
        this._modeNewBest = false;
        this._fadeTo(SCENE.STAGE_INTRO);
    }

    _onStageClear() {
        if (this._clearScheduled) return;
        this._clearScheduled = true;
        // Stray mini-boss survives if player rushed past the mini trigger
        // and burned down the main first — drop it so its HP bar doesn't
        // bleed through the stage-clear panel.
        const stray = this.enemies.activeMiniBoss();
        if (stray) { stray.alive = false; stray.hp = 0; }
        audio.stopTrack();
        // R281: bossEscapes stages (e.g. Board Room — Ballmer flees) skip
        // the explosion burst payoff. Boss "escaping" shouldn't read as
        // "boss exploding into chunks." Play a softer thump + small camera
        // shake instead.
        const stg = STAGES[this.currentStage];
        if (stg?.bossEscapes) {
            audio.sfx('land');
            this.camera.shake?.(3);
            this._clearBursts = [];
            this._lastBossPos = null;
        } else if (this._lastBossPos) {
            audio.sfx('explode');
            this._clearBursts = [];
            const bx = this._lastBossPos.x;
            const by = this._lastBossPos.y;
            for (let i = 0; i < 8; i++) {
                this._clearBursts.push({
                    fireAt: i * 5,
                    x: bx + (Math.random() - 0.5) * 40,
                    y: by + (Math.random() - 0.5) * 30,
                });
            }
            this.camera.shake?.(8);
            this._lastBossPos = null;
        } else {
            audio.sfx('powerup');
            this._clearBursts = [];
        }
        this.scene = SCENE.STAGE_CLEAR;
        this.storyTimer = 0;
        this._stageClearTallyDone = false;
        this._stageClearRank = null;
        // Campaign roll-up — stages 1-9 only. Boss Rush + Time Trial are
        // post-game replay modes; their clears must NOT contaminate
        // per-stage best scores, medals, run-level stats, or campaign
        // achievement gates (would let players farm score/combo in modes
        // to back-door achievements like TOP TIER they couldn't earn in
        // a clean campaign run).
        const isModeRun = this.bossRushMode || this.timeTrialMode;
        if (!isModeRun) {
            // New-best score detection — compare current run score (which acts as
            // the cumulative-up-to-this-stage score) against per-stage best.
            // Show the NEW BEST tag in the SCORE row of the stats panel.
            const sBest = achievements.stats.stageBestScores || {};
            const prevBest = sBest[this.currentStage] || 0;
            // R470: pull score from whichever engine is active
            const _scorePlayer = this.player || this._doomEngine?.player || this._beatEmUp?.player || this._fpsArena?.player || {};
            const _curScore = _scorePlayer.score || 0;
            this._stageNewBest = _curScore > prevBest;
            if (this._stageNewBest) {
                sBest[this.currentStage] = _curScore;
                achievements.stats.stageBestScores = sBest;
                achievements._save?.();
            }

            // Per-stage medals — 3 medals per stage that drive replay value
            const earned = {
                noDamage: this.stageStats.damageTaken === 0,
                allKills: this.stageStats.totalEnemies > 0 &&
                          this.stageStats.kills >= this.stageStats.totalEnemies,
                secret: this.stageStats.foundSecret === true,
            };
            this.stageStats.medals = earned;
            // Persist on a per-stage medal record so badges show on stage select
            if (!this.runStats.medals) this.runStats.medals = {};
            const slot = this.runStats.medals[this.currentStage] || { noDamage: false, allKills: false, secret: false };
            slot.noDamage ||= earned.noDamage;
            slot.allKills ||= earned.allKills;
            slot.secret   ||= earned.secret;
            this.runStats.medals[this.currentStage] = slot;

            // Roll stage stats up to run + achievement system. R470:
            // null-safe — Doom + beat-em-up + FPS engines have their own
            // player object so this.player (platformer) may not exist.
            this.runStats.stagesCleared.add(this.currentStage);
            this.runStats.maxCombo = Math.max(this.runStats.maxCombo, this.player?.maxCombo || 0);
            for (const [k, v] of Object.entries(this.player?.dmgDealt || {})) {
                this.runStats.weaponDamage[k] = (this.runStats.weaponDamage[k] || 0) + v;
            }
            if (this.stageStats.damageTaken === 0) this.runStats.noDamageStages++;
            // Roll the per-stage "target lost" bubble count into the run total
            // before snapshotting for achievements (GHILLIE SUIT).
            this.runStats.enemiesLost = (this.runStats.enemiesLost || 0)
                + (this.enemies?.lostBubbleTotal || 0);

            // R470: null-safe for non-platformer engines (Doom/beat/FPS) —
            // their player objects don't have all the platformer fields.
            // Pull from the active engine's player when the platformer's
            // is unavailable.
            const altPlayer = this._doomEngine?.player || this._beatEmUp?.player || this._fpsArena?.player;
            const ap = this.player || altPlayer || {};
            const newlyUnlocked = achievements.update({
                totalKills: ap.kills || 0,
                stagesCleared: this.runStats.stagesCleared,
                totalDeaths: this.totalDeaths,
                noDamageStages: this.runStats.noDamageStages,
                maxCombo: this.runStats.maxCombo,
                weaponDamage: this.runStats.weaponDamage,
                totalTime: this.totalTime,
                secretStageDiscovered: this.runStats.stagesCleared.has(10),
                bulletTimeUses: this.runStats.bulletTimeUses,
                bestScore: ap.score || 0,
                enemiesLost: this.runStats.enemiesLost,
                pounceKills: (ap.pounceKills || 0),
                grenadeKills: this.runStats.grenadeKills,
            });
            this._newlyUnlocked = newlyUnlocked;  // shown on stage-clear screen
            // Fanfare when at least one achievement unlocks this clear. Single
            // ding regardless of count — the banner queue handles per-entry display.
            if (newlyUnlocked.length > 0) audio.sfx('unlock');

            // Save high score (R470: null-safe — ap was resolved above)
            const apScore = ap.score || 0;
            if (apScore > achievements.stats.bestScore) {
                achievements.stats.bestScore = apScore;
                achievements._save();
            }
            // R223: sync run-best clippy-tag count to persistent stats.
            // High-water-mark so a worse run can't clear the achievement.
            const tags = ap.tagsFound || 0;
            if (tags > (achievements.stats.tagsFound || 0)) {
                achievements.stats.tagsFound = tags;
                achievements._save();
            }
        } else {
            // Mode runs still need these set so the stage-clear panel doesn't
            // read stale state from a prior campaign clear.
            this._stageNewBest = false;
            this._newlyUnlocked = null;
        }

        // Mode best-time persistence — boss rush + time trial both save
        // their stageTime (frames) to achievements stats. 0 means no time
        // set yet, so any clear is automatically a new best the first time.
        this._modeNewBest = false;
        if (this.bossRushMode) {
            const prev = achievements.stats.bestBossRushTime || 0;
            if (prev === 0 || this.stageTime < prev) {
                achievements.stats.bestBossRushTime = this.stageTime;
                achievements._save();
                this._modeNewBest = true;
            }
        } else if (this.timeTrialMode) {
            const prev = achievements.stats.bestTimeTrialTime || 0;
            if (prev === 0 || this.stageTime < prev) {
                achievements.stats.bestTimeTrialTime = this.stageTime;
                achievements._save();
                this._modeNewBest = true;
            }
        }
    }
    _tickStageClear() {
        this.storyTimer++;
        // Drive boss explosion bursts on the game's own frame counter
        if (this._clearBursts && this._clearBursts.length) {
            for (let i = this._clearBursts.length - 1; i >= 0; i--) {
                const b = this._clearBursts[i];
                if (this.storyTimer >= b.fireAt) {
                    particles.explosion(b.x, b.y);
                    audio.sfx('explode');
                    this._clearBursts.splice(i, 1);
                }
            }
        }
        // Block input until panel is in place + stats started populating
        if (this.storyTimer > 130 && (input.isPressed('shoot') || input.isPressed('jump'))) {
            this._clearScheduled = false;
            audio.sfx('select');
            // Post-game modes route straight back to TITLE — they don't
            // advance to a next stage. Best time was saved in _onStageClear.
            if (this.bossRushMode || this.timeTrialMode) {
                this._restartRun();
                return;
            }
            // R291: secret stage id changed to 14. Final stage = 13 (Cloud).
            let nextStage;
            if (this.currentStage === 1 && this.stageStats.damageTaken === 0 && !achievements.stats.secretStageDiscovered) {
                achievements.stats.secretStageDiscovered = true;
                achievements._save();
                nextStage = 14;
                this._secretDiscoveryCard = true;
                audio.sfx('secretFound');
            } else if (this.currentStage === 14) {
                // R299: secret stage (RECYCLE BIN). Two entry paths:
                //  (a) discovered via stage 1 no-damage clear → drops the
                //      player into the campaign at stage 2 (continue run)
                //  (b) entered from stage select (konami unlock or repeat
                //      visit) → return to title so the player isn't pulled
                //      back into the main campaign against their will.
                // Discriminator: if the campaign was already cleared OR
                // the player came in via konami/stage-select, fade to title.
                const cameViaStageSelect = !!this._konamiUnlocked
                    || achievements.unlocked.has('clear_game');
                if (cameViaStageSelect) {
                    audio.stopTrack();
                    this._fadeTo(SCENE.TITLE);
                    return;
                }
                nextStage = 2;
            } else if (this.currentStage === 13) {
                // R291: Cloud (final main stage) → game-complete credits roll.
                this._fadeTo(SCENE.GAME_COMPLETE);
                return;
            } else if (this.currentStage >= 15) {
                // R357: post-game stages used to ALL route back to title
                // (R299). Now we respect the stage's own `nextStage` field
                // so the Mecha trilogy (20 → 21 → 22) can chain with
                // cinematics between each. Only stages with no nextStage
                // (true post-game side stages 15-19, and the final 22)
                // bounce to title. Stage 22 clear also fires the
                // game-complete cinematic before returning.
                // R475: pull stage data from whichever engine is active so
                // non-platformer stages (Doom/beat/FPS) read their nextStage
                // correctly. BLOCK 11 (Doom) needs to chain to BOARDROOM (5).
                const data = this.level?.data || this.level ||
                             this._doomEngine?.data ||
                             this._beatEmUp?.data ||
                             this._fpsArena?.data;
                const linked = data?.nextStage;
                if (linked) {
                    nextStage = linked;
                } else {
                    if (this.currentStage === 22) {
                        // True final boss — trigger the completion cinematic
                        // before returning to title, same as stage 13.
                        this._fadeTo(SCENE.GAME_COMPLETE);
                        return;
                    }
                    audio.stopTrack();
                    this._fadeTo(SCENE.TITLE);
                    return;
                }
            } else {
                nextStage = this.currentStage + 1;
            }
            // R281/R291: per-stage escape cinematics. Insert a one-shot
            // painted "boss escapes" card between stages 5→6 (Ballmer flees
            // Board Room) and 8→9 (Gates flees Keynote Hall).
            this._extraCards = null;
            if (this.currentStage === 5) {
                this._extraCards = ['card_ballmer_escapes'];
            } else if (this.currentStage === 8) {
                this._extraCards = ['card_gates_escapes'];
            } else if (this.currentStage === 20) {
                // R357: Mecha Approach (beat-em-up) → Mecha Corridor
                // (helicopter chase). Cinematic shows the helicopter
                // coming over the horizon — sells the transition.
                this._extraCards = ['card_chopper_horizon'];
            } else if (this.currentStage === 21) {
                // R357: chopper crashes → Mecha-Gates emerges from
                // the wreckage. Reuses the existing mecha-reveal card.
                this._extraCards = ['card_chopper_crash'];
            } else if (this.currentStage === 4) {
                // R462: Pipeline → BLOCK 11 intro — Clippy descends into
                // Spindler's clone lab with a "RESTRICTED" sign + bloody
                // handprint + green glow at the end of the corridor.
                this._extraCards = ['card_doom_arc_intro'];
            } else if (this.currentStage === 16) {
                // R462: FLOOR 11 cleared — Clippy at the shattered HQ
                // window, sunset over Seattle, wrecked wheelchair.
                this._extraCards = ['card_doom_arc_outro'];
            }
            // Route through the painted cinematic card(s) before the next stage
            this._pendingStage = nextStage;
            this.storyTimer = 0;
            this.scene = SCENE.STAGE_CARD;
        }
    }
    // Stage-clear screen plays as a 5-beat cinematic timeline driven by
    // this.storyTimer. Each beat reads its own time window and bails early
    // before the next one. Coordinating timestamps via the helper layout:
    //   0–50f:   white flash over live scene
    //   50–95f:  background dim + "STAGE CLEAR" title bounce-in
    //   95+ +12: results panel slide-up + alpha-in
    //   panel+: stats rows stagger in
    //   panel+80: medal row (no-dmg / all-kills / secret)
    //   panel+100: newly-unlocked achievement banner
    //   panel+90: "X TO CONTINUE" prompt blink
    _drawStageClear() {
        const t = this.storyTimer;
        if (this._drawStageClearFlash(t)) return;
        this._drawStageClearDim(t);
        this._drawStageClearTitle(t);
        if (t < 95) return;
        const panelT = t - 95;
        const panelTop = this._drawStageClearPanel(panelT);
        if (panelT < 12) return;
        this._drawStageClearStats(panelT, panelTop);
        this._drawStageClearMedals(panelT);
        this._drawStageClearAchievementBanner(panelT);
        this._drawStageClearContinuePrompt(t, panelT);
    }

    // Beat 1: white flash. Returns true if still in this beat so caller bails
    // (we keep _drawPlay visible underneath for the boss explosion).
    _drawStageClearFlash(t) {
        if (t >= 50) return false;
        const ctx = this.ctx;
        const flash = t < 6 ? 0.9 : Math.max(0, 0.5 - t * 0.012);
        if (flash > 0) {
            ctx.fillStyle = `rgba(255,240,160,${flash})`;
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        return true;
    }

    // Beat 2a: background dim ramping to 0.78 alpha over 40 frames.
    _drawStageClearDim(t) {
        const dim = Math.min(0.78, (t - 50) / 40 * 0.78);
        const ctx = this.ctx;
        ctx.fillStyle = `rgba(0,0,0,${dim})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
    }

    // Beat 2b: "STAGE CLEAR" title bounces in from above with ease-out cubic
    // and a sine overshoot. Scale shrinks from 3x to 2x at frame 60 (post-slam).
    _drawStageClearTitle(t) {
        let titleY = 22;
        if (t < 95) {
            const k = (t - 50) / 45;
            const eased = 1 - Math.pow(1 - k, 3);
            titleY = -20 + 42 * eased + Math.sin(k * Math.PI) * 4;
        }
        const titleScale = t < 60 ? 3 : 2;
        drawTextOutlined(this.ctx, 'STAGE CLEAR', GAME.W / 2, titleY, '#ffe070', '#a82020', titleScale, 'center');
    }

    // Beat 3: results panel slides up + fades in over ~12 frames. Returns the
    // settled panelTop Y so subsequent beats can align to it.
    _drawStageClearPanel(panelT) {
        const ctx = this.ctx;
        const panelTop = 42 + Math.max(0, 30 - panelT);
        const panelAlpha = Math.min(1, panelT / 12);
        ctx.globalAlpha = panelAlpha;
        ctx.fillStyle = '#1a0a20'; ctx.fillRect(20, panelTop, GAME.W - 40, 100);
        ctx.fillStyle = '#3a2a4a'; ctx.fillRect(20, panelTop, GAME.W - 40, 1);
        ctx.fillStyle = '#3a2a4a'; ctx.fillRect(20, panelTop + 99, GAME.W - 40, 1);
        ctx.globalAlpha = 1;
        return panelTop;
    }

    // Beat 4: stats rows stagger in every 8 frames. Score ticks up over 60f
    // so the final number feels earned rather than instant.
    _drawStageClearStats(panelT, panelTop) {
        const ctx = this.ctx;
        const min = Math.floor(this.stageTime / 3600);
        const sec = Math.floor((this.stageTime / 60) % 60);
        const time = `${min}:${String(sec).padStart(2,'0')}`;
        // Defensive: this.player can be null transiently (e.g., scene reload).
        // Treat absent player as "no shots" so accuracy renders as '—'.
        const shotsFired = this.player?.shotsFired || 0;
        const accuracy = shotsFired > 0
            ? Math.round((this.stageStats.kills / shotsFired) * 100)
            : null;
        // R171: when no shots were fired, accuracy reads as a dash instead
        // of "0%". Otherwise a pacifist run / melee-only clear looks like a
        // bottomed-out accuracy stat rather than a measurement that doesn't
        // apply.
        const accuracyStr = accuracy == null ? '—' : (accuracy + '%');
        // Rank letter grade — weighted on damage-taken (50%), accuracy (30%),
        // time (20%). Cached on the panel so the letter doesn't flicker between
        // ticks as shownScore changes. Renders on the right edge as a big
        // outlined letter once the stats have animated in.
        if (this._stageClearRank == null) {
            const dmg = this.stageStats.damageTaken || 0;
            const dmgScore = dmg === 0 ? 1 : dmg <= 2 ? 0.7 : dmg <= 5 ? 0.4 : 0.15;
            // No-shots clears (melee/grenade only) don't penalize accuracy —
            // neutral 0.5 baseline instead of a hard 0 that would drag the rank.
            const accScore = accuracy == null ? 0.5 : Math.min(1, accuracy / 60);
            // Time: stage par ~75s; under par = full, slower scales down
            const par = 75 * 60; // frames
            const timeScore = Math.max(0.1, Math.min(1, par / Math.max(par, this.stageTime)));
            const composite = dmgScore * 0.5 + accScore * 0.3 + timeScore * 0.2;
            const letter = composite >= 0.92 ? 'S'
                         : composite >= 0.78 ? 'A'
                         : composite >= 0.62 ? 'B'
                         : composite >= 0.45 ? 'C' : 'D';
            this._stageClearRank = { letter, composite };
        }
        const scoreT = Math.min(1, (panelT - 12) / 60);
        // Defensive: this.player can be null transiently during scene reload.
        const shownScore = Math.floor((this.player?.score || 0) * scoreT);
        // Tick SFX every 4 frames while the score is still climbing — gives
        // the count-up a slot-machine cadence instead of a silent ramp.
        if (scoreT > 0 && scoreT < 1 && panelT % 4 === 0) {
            audio.sfx('select');
        }
        // One-shot "ka-ching" when the count-up finishes
        if (scoreT >= 1 && !this._stageClearTallyDone) {
            this._stageClearTallyDone = true;
            audio.sfx('pickup');
        }
        const stats = [
            ['TIME',       time,                                    '#7af0ff'],
            ['KILLS',      String(this.stageStats.kills),           '#fff'],
            ['MAX COMBO',  String(this.player?.maxCombo || 0) + 'x',      '#ffe070'],
            ['SCORE',      ('000000' + shownScore).slice(-6),       '#ffe070'],
            ['ACCURACY',   accuracyStr,                             '#fff'],
            ['FAVORITE',   this._favoriteWeapon(),                  '#a0c0e0'],
        ];
        for (let i = 0; i < stats.length; i++) {
            if (panelT <= 12 + i * 8) continue;
            const [k, v, c] = stats[i];
            const y = panelTop + 8 + i * 14;
            drawText(ctx, k, 30,          y, '#c0a0d0', 1, 'left');
            drawText(ctx, v, GAME.W - 30, y, c,         1, 'right');
            // NEW BEST tag on the SCORE row — pulses gold when the player
            // beats their previous best for this stage. Only appears once
            // the score count-up has finished so the reveal lands.
            if (k === 'SCORE' && this._stageNewBest && scoreT >= 1) {
                const pulse = (Math.sin(panelT * 0.18) + 1) * 0.5;
                ctx.save();
                ctx.globalAlpha = 0.65 + pulse * 0.35;
                drawText(ctx, 'NEW BEST!', GAME.W / 2, y, '#ffe070', 1, 'center');
                ctx.restore();
            }
        }
        // Kill-marker row: "BOSS NAME [DOWN]" with a red strike-through bar
        // sweeping across the name. Pure payoff beat — confirms the kill in
        // language instead of just a score number.
        const killRowT = panelT - (12 + stats.length * 8);
        if (killRowT > 0) {
            const stg = STAGES[this.currentStage];
            // Map gauntlet sentinels to readable labels — GAUNTLET_FULL is a
            // meta-marker for the 7-boss queue, not a real boss name.
            const rawBoss = stg && stg.boss;
            const bossName = !rawBoss ? 'BOSS'
                          : rawBoss === 'GAUNTLET_FULL' ? 'ALL BOSSES'
                          : rawBoss === 'GAUNTLET'      ? 'GAUNTLET'
                          : rawBoss.replace(/_/g, ' ');
            const y = panelTop + 8 + stats.length * 14 + 2;
            // The status tag pops in after the name is drawn — "[DOWN]"
            // for normal kills, "[ESCAPED]" when the stage has bossEscapes
            // (R281: stage 5 Ballmer flees rather than dies).
            drawText(ctx, bossName, 30, y, '#ff5050', 1, 'left');
            const w = bossName.length * 6;
            const sweep = Math.min(1, killRowT / 20);
            ctx.fillStyle = '#ff3030';
            ctx.fillRect(28, y + 3, Math.floor((w + 4) * sweep), 1);
            if (killRowT > 22) {
                const escaped = stg?.bossEscapes;
                const tag = escaped ? '[ESCAPED]' : '[DOWN]';
                drawText(ctx, tag, GAME.W - 30, y, '#ff5050', 1, 'right');
            }
            // NEW BEST! tag for mode runs — flashes gold under the boss-name
            // sweep after both have drawn. Boss Rush + Time Trial save best
            // time on clear; this is the only place the player learns they
            // beat their PB.
            if (this._modeNewBest && killRowT > 30) {
                const pulse = (Math.sin((killRowT - 30) * 0.2) + 1) * 0.5;
                ctx.save();
                ctx.globalAlpha = 0.6 + pulse * 0.4;
                drawTextOutlined(ctx, 'NEW BEST TIME!', GAME.W / 2, y + 10, '#ffe070', '#a82020', 1, 'center');
                ctx.restore();
            }
        }
        // Rank letter — large outlined grade in the upper-right corner of the
        // SCREEN (above the stats panel, beside the STAGE CLEAR title). Was
        // previously inside the panel at panelTop+12 and overlapped the KILLS
        // row (panelTop+22) once the scale-3 outline drew, looking like a
        // glitched glyph crossed with the kill count. Pops in once the stats
        // finish animating, with a brief scale-up bounce. Tier colors mirror
        // combo-tier palette: S=white, A=gold, B=orange, C=red, D=grey.
        const rankT = panelT - (12 + stats.length * 8);
        if (rankT > 10) {
            const rk = this._stageClearRank;
            // Defensive guard — rank is computed earlier in this draw call, but
            // any future restructure could call this method before stats run.
            // Bail rather than crash on .letter access.
            if (!rk) return;
            const RANK_COLOR = { S: '#fff8c8', A: '#ffe070', B: '#ff9030', C: '#ff5050', D: '#a08080' };
            const introT = Math.min(1, (rankT - 10) / 12);
            const bounce = 1 + Math.sin(introT * Math.PI) * 0.5;
            const scale = Math.round(3 * bounce);
            // Park above panel, tucked into the top-right corner of the
            // screen so the letter and KILLS row never share vertical space.
            const rx = GAME.W - 18;
            const ry = 28;
            // R479: rank-specific glow halo. S = white-yellow pulse halo,
            // A = warm gold, B+ = subtle. Drawn behind the letter so it
            // doesn't muddle the text.
            if (introT >= 1 && (rk.letter === 'S' || rk.letter === 'A')) {
                const pulseT = (Math.sin(rankT * 0.18) + 1) * 0.5;
                const haloR = 20 + pulseT * 6;
                const haloCol = rk.letter === 'S' ? '#fff8c8' : '#ffd060';
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.35 + pulseT * 0.25;
                const grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, haloR);
                grad.addColorStop(0, haloCol);
                grad.addColorStop(0.6, haloCol);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(rx, ry, haloR, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            drawTextOutlined(ctx, rk.letter, rx, ry, RANK_COLOR[rk.letter] || '#fff', '#1a0820', scale, 'center');
            // R479: S-rank gets sparkle pixels orbiting the letter — same
            // sparkle pattern as the secret-found notification, but slower
            // and concentrated around the rank letter.
            if (introT >= 1 && rk.letter === 'S') {
                const t = rankT * 0.05;
                for (let s = 0; s < 5; s++) {
                    const a = t + s * (Math.PI * 2 / 5);
                    const r = 16 + Math.sin(t * 2 + s) * 3;
                    const sx = rx + Math.cos(a) * r;
                    const sy = ry + Math.sin(a) * r;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(sx - 1, sy, 2, 1);
                    ctx.fillRect(sx, sy - 1, 1, 2);
                }
            }
            // Small "RANK" label above the letter
            if (introT >= 1) {
                drawText(ctx, 'RANK', rx, ry - 12, '#a0a0c0', 1, 'center');
            }
        }
    }

    // Beat 5: 3-slot medal row. Earned medals show as golden coins with stars,
    // missed ones show as grey coins with X marks.
    _drawStageClearMedals(panelT) {
        if (panelT <= 80) return;
        const m = this.stageStats.medals;
        if (!m) return;
        const ctx = this.ctx;
        const baseY = 150;
        const labels = [
            { label: 'NO DMG',   earned: m.noDamage, c: '#50ff70' },
            { label: 'ALL FOES', earned: m.allKills, c: '#ff8050' },
            { label: 'SECRET',   earned: m.secret,   c: '#7af0ff' },
        ];
        const slotW = 64;
        const startX = GAME.W / 2 - (slotW * 3) / 2 + slotW / 2;
        for (let i = 0; i < labels.length; i++) {
            const med = labels[i];
            const cx = startX + i * slotW;
            const earned = med.earned;
            ctx.fillStyle = earned ? '#a07028' : '#202028';
            ctx.fillRect(cx - 8, baseY, 16, 14);
            ctx.fillStyle = earned ? med.c : '#404048';
            ctx.fillRect(cx - 7, baseY + 1, 14, 12);
            ctx.fillStyle = earned ? '#ffe070' : '#606068';
            if (earned) {
                // Star
                ctx.fillRect(cx - 1, baseY + 3, 2, 8);
                ctx.fillRect(cx - 4, baseY + 6, 8, 2);
            } else {
                // X mark
                ctx.fillRect(cx - 3, baseY + 4, 1, 1); ctx.fillRect(cx + 2, baseY + 4, 1, 1);
                ctx.fillRect(cx - 2, baseY + 5, 1, 1); ctx.fillRect(cx + 1, baseY + 5, 1, 1);
                ctx.fillRect(cx - 1, baseY + 6, 3, 1);
                ctx.fillRect(cx - 2, baseY + 7, 1, 1); ctx.fillRect(cx + 1, baseY + 7, 1, 1);
                ctx.fillRect(cx - 3, baseY + 8, 1, 1); ctx.fillRect(cx + 2, baseY + 8, 1, 1);
            }
            drawText(ctx, med.label, cx, baseY + 16, earned ? '#ffe070' : '#606068', 1, 'center');
        }
    }

    // Beat 6: newly-unlocked achievement banner below medals.
    _drawStageClearAchievementBanner(panelT) {
        if (!this._newlyUnlocked?.length || panelT <= 100) return;
        const ctx = this.ctx;
        const a = this._newlyUnlocked[0];
        const banY = 180;
        ctx.fillStyle = '#1a0a00';
        ctx.fillRect(20, banY, GAME.W - 40, 20);
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(20, banY, GAME.W - 40, 1);
        ctx.fillRect(20, banY + 19, GAME.W - 40, 1);
        drawText(ctx, 'NEW: ' + a.name, GAME.W / 2, banY + 4,  '#ffe070', 1, 'center');
        drawText(ctx, a.desc,           GAME.W / 2, banY + 13, '#fff',    1, 'center');
        // Inline icon strip for additional achievements — shows when 2+ unlock
        // in one stage. Icons sit ABOVE the banner so they don't collide with
        // the continue prompt at the bottom edge.
        if (this._newlyUnlocked.length > 1) {
            const stripY = banY - 22;
            const iconW = 12, gap = 2;
            const total = this._newlyUnlocked.length;
            const totalW = total * iconW + (total - 1) * gap;
            let ix = (GAME.W - totalW) / 2;
            for (const ent of this._newlyUnlocked) {
                ctx.fillStyle = '#3a2010';
                ctx.fillRect(ix, stripY, iconW, iconW);
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(ix, stripY, iconW, 1);
                ctx.fillRect(ix, stripY + iconW - 1, iconW, 1);
                drawText(ctx, ent.icon, ix + iconW / 2, stripY + 3, '#ffe070', 1, 'center');
                ix += iconW + gap;
            }
            drawText(ctx, '+' + total + ' UNLOCKED', GAME.W / 2, stripY - 8,
                     '#a0c0a0', 1, 'center');
        }
    }

    // Beat 7: blinking "X TO CONTINUE" prompt at the bottom edge.
    _drawStageClearContinuePrompt(t, panelT) {
        if (panelT <= 90 || (t % 60 >= 40)) return;
        drawText(this.ctx, 'X TO CONTINUE', GAME.W / 2, GAME.H - 12, '#fff', 1, 'center');
    }

    _favoriteWeapon() {
        const dmg = this.player?.dmgDealt || {};
        let best = 'MG', bestV = -1;
        for (const [k, v] of Object.entries(dmg)) if (v > bestV) { best = k; bestV = v; }
        // R254: human-readable weapon name for the FAVORITE line. Internal
        // ids (MG, HOMING) get translated; rest pass through.
        if (best === 'MG') return 'MACHINE';
        if (best === 'HOMING') return 'ROCKET';
        return best;
    }

    _tickGameOver() {
        this.storyTimer++;
        if (this.gameOverIndex == null) this.gameOverIndex = 0;
        // 10-second auto-quit countdown begins after the 1.5s dramatic pause.
        // Adds Contra-style urgency: pick a choice or the run ends.
        if (this.storyTimer > 90) {
            const elapsed = this.storyTimer - 90;
            const remaining = Math.max(0, 600 - elapsed); // 10s at 60fps
            this.gameOverCountdown = Math.ceil(remaining / 60);
            // Tick SFX on each whole-second boundary (under 5s)
            const prev = Math.ceil(Math.max(0, 600 - (elapsed - 1)) / 60);
            if (this.gameOverCountdown !== prev && this.gameOverCountdown > 0 && this.gameOverCountdown <= 5) {
                audio.sfx('select');
            }
            if (remaining === 0) {
                audio.sfx('menu');
                this._restartRun();
                return;
            }
            if (input.isPressed('up') || input.isPressed('down')) {
                this.gameOverIndex = (this.gameOverIndex + 1) % GAME_OVER_OPTIONS.length;
                audio.sfx('select');
            }
            if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
                audio.sfx('menu');
                if (this.gameOverIndex === 0) {
                    // CONTINUE: re-enter the current stage. Preserves run score / time totals
                    // (small comeback penalty: score is halved as a soft cost).
                    // R262: this.player may be null after an FPS-arena death
                    // (no platformer player object). Guard the score access.
                    // R380: also restore lives to 3 — without this, gameOver
                    // happened at lives === -1, CONTINUE reused the player,
                    // resetForStage didn't touch lives, so the very next
                    // death dropped to -2 and went straight back to gameOver.
                    // Player ended up with "1 life" feeling.
                    if (this.player) {
                        this.player.score = Math.floor((this.player.score || 0) * 0.5);
                        this.player.lives = 3;
                    }
                    this._startStage(this.currentStage || 1);
                } else {
                    this._restartRun();
                }
            }
        }
    }
    _drawGameOver() {
        const ctx = this.ctx;
        // Black + creeping red vignette
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        const pulse = 0.10 + Math.sin(this.storyTimer * 0.08) * 0.04;
        ctx.fillStyle = `rgba(168, 32, 40, ${pulse})`;
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Drifting ember field — 24 slow-rising orange motes that pop in/out
        // with phased pulse alpha. Pure atmosphere; sells "the world is still
        // burning" while the player reads their stats.
        if (!this._goEmbers) {
            this._goEmbers = [];
            for (let i = 0; i < 24; i++) {
                this._goEmbers.push({
                    x: Math.random() * GAME.W,
                    y: Math.random() * GAME.H,
                    vy: -0.18 - Math.random() * 0.22,
                    phase: Math.random() * Math.PI * 2,
                    hue: Math.random() < 0.4 ? '#ffaa50' : '#ff5040',
                });
            }
        }
        for (const m of this._goEmbers) {
            m.y += m.vy;
            m.phase += 0.05;
            if (m.y < -2) { m.y = GAME.H + 2; m.x = Math.random() * GAME.W; }
            const a = 0.25 + Math.sin(m.phase) * 0.25;
            ctx.globalAlpha = Math.max(0, a);
            ctx.fillStyle = m.hue;
            ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
        }
        ctx.globalAlpha = 1;

        // Title — dramatic 3× outlined, slight settle-down animation
        const titleY = Math.min(28, 16 + this.storyTimer * 0.6);
        drawTextOutlined(ctx, 'GAME OVER', GAME.W / 2, titleY, '#ff5050', '#1a0000', 3, 'center');

        // Reveal stats only after the title settles (storyTimer > 40)
        if (this.storyTimer > 40) {
            // Framed stats panel
            const panelX = 40, panelY = 64, panelW = GAME.W - 80, panelH = 92;
            ctx.fillStyle = 'rgba(8, 4, 14, 0.85)';
            ctx.fillRect(panelX, panelY, panelW, panelH);
            ctx.fillStyle = '#5a1018';
            ctx.fillRect(panelX, panelY, panelW, 1);
            ctx.fillRect(panelX, panelY + panelH - 1, panelW, 1);
            ctx.fillRect(panelX, panelY, 1, panelH);
            ctx.fillRect(panelX + panelW - 1, panelY, 1, panelH);

            const min = Math.floor(this.totalTime / 3600);
            const sec = Math.floor((this.totalTime / 60) % 60);
            const stagesCleared = this.runStats?.stagesCleared?.size || 0;
            // Stat rows reveal one at a time for drama
            const rowReveal = Math.floor((this.storyTimer - 40) / 6);
            const rows = [
                { label: 'STAGE REACHED', value: this.currentStage || 1, color: '#fff' },
                { label: 'STAGES CLEARED', value: stagesCleared, color: '#80c0a0' },
                { label: 'KILLS',         value: this.player?.kills || 0, color: '#fff' },
                { label: 'MAX COMBO',     value: this.player?.maxCombo || 0, color: '#ffe070' },
                { label: 'TIME',          value: String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0'), color: '#fff' },
                { label: 'SCORE',         value: ('000000' + (this.player?.score || 0)).slice(-6), color: '#ffe070' },
            ];
            for (let i = 0; i < rows.length; i++) {
                if (i > rowReveal) break;
                const y = panelY + 8 + i * 14;
                drawText(ctx, rows[i].label, panelX + 12, y, '#a08090', 1, 'left');
                drawText(ctx, String(rows[i].value), panelX + panelW - 12, y, rows[i].color, 1, 'right');
            }
        }
        // Two-option menu reveal after panel settle
        if (this.storyTimer > 90) {
            const baseY = GAME.H - 32;
            this._goPulse = (this._goPulse || 0) + 1;
            for (let i = 0; i < GAME_OVER_OPTIONS.length; i++) {
                const y = baseY + i * 14;
                const isSel = i === (this.gameOverIndex || 0);
                if (isSel) {
                    const phase = Math.sin(this._goPulse * 0.18) * 0.5 + 0.5;
                    ctx.fillStyle = `rgb(${160 + Math.floor(phase * 40)},${16},${32})`;
                    ctx.fillRect(80, y - 2, GAME.W - 160, 12);
                    drawText(ctx, '>', 86, y, '#ffe070', 1, 'left');
                    drawText(ctx, '<', GAME.W - 92, y, '#ffe070', 1, 'left');
                }
                drawText(ctx, GAME_OVER_OPTIONS[i], GAME.W / 2, y, isSel ? '#fff' : '#c0a0d0', 1, 'center');
            }
            // Countdown — last 10s feels urgent; flashes red under 5s.
            // R212: was a bare scale-2 "9" floating in the bottom-right
            // with no label — looked like a typo. Now a labelled "AUTO
            // QUIT 9" row centered below the menu options, so the user
            // understands what the digit means before the timer fires.
            if (this.gameOverCountdown != null && this.gameOverCountdown > 0) {
                const urgent = this.gameOverCountdown <= 5;
                const flash = urgent && (this.storyTimer % 30 < 15);
                const color = !urgent ? '#806890' : flash ? '#ff5050' : '#ffe070';
                const ty = baseY + GAME_OVER_OPTIONS.length * 14 + 6;
                drawText(ctx, 'AUTO QUIT IN ' + this.gameOverCountdown, GAME.W / 2, ty, color, 1, 'center');
            }
        }
    }

    _tickGameComplete() {
        audio.playTrack('gameComplete');
        this.storyTimer++;
        // R300: on first frame of game-complete, push a toast so the player
        // knows post-game modes are now available on title (Boss Rush Mode,
        // Time Trial, Reality Distortion Field, Core Breach).
        if (this.storyTimer === 1 && !this._postGameToastFired) {
            this._postGameToastFired = true;
            this._pushUnlockToast('POST-GAME UNLOCKED',
                'BOSS RUSH MODE, TIME TRIAL, RDF, CORE BREACH');
        }
        // R191: first input after the result screen advances to the epilogue
        // cinematic (Clippy's redemption arc). Second input from the epilogue
        // returns to title via _restartRun. Skippable via `start` for replay
        // runs — long-time players don't need to re-watch the four scenes.
        if (this.storyTimer > 90 && (input.isPressed('shoot') || input.isPressed('jump'))) {
            if (input.isPressed('start')) {
                this._restartRun();
                return;
            }
            this.scene = SCENE.EPILOGUE;
            this.epilogueIndex = 0;
            this.storyTimer = 0;
        }
    }

    // R191: post-game Clippy redemption arc. Four painted scenes:
    //   0. laughingstock — alone in the alley with WORST SOFTWARE EVER paper
    //   1. memes — wall of deep-fried Clippy memes
    //   2. comeback — 2026 Gen-Z bedroom, Clippy plush on the bed
    //   3. mac_siri — Clippy at a MacBook, Siri waveform glowing, wondering
    //      if Siri is the next to be canned
    // Typewriter line per scene, advance on X/jump after the line reveals.
    // Final advance routes back to title.
    _epilogueBeats() {
        return [
            {
                key: 'epi_laughingstock',
                line: 'AT FIRST EVERYONE LAUGHED.',
                sub: '"WORST SOFTWARE EVER."'
            },
            {
                key: 'epi_memes',
                line: 'THEN HE BECAME A JOKE.',
                sub: 'THE INTERNET FOUND HIM HILARIOUS.'
            },
            {
                key: 'epi_comeback',
                line: 'AND THEN — 2026.',
                sub: 'THE KIDS LOVED HIM.'
            },
            {
                key: 'epi_mac_siri',
                line: 'CLIPPY BOUGHT A MAC.',
                sub: 'HE WONDERS WHO IS NEXT.'
            },
        ];
    }
    _tickEpilogue() {
        this.storyTimer++;
        const beats = this._epilogueBeats();
        const beat = beats[this.epilogueIndex];
        if (!beat) {
            // R511: past the last epilogue scene — roll credits before
            // dropping back to title. Gives the painted art and the run
            // a proper "the end" moment instead of a hard cut.
            this.scene = SCENE.CREDITS;
            this.storyTimer = 0;
            return;
        }
        const advance = input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start');
        if (advance) {
            const totalChars = beat.line.length + beat.sub.length;
            const shown = Math.floor(this.storyTimer * 6);
            if (shown < totalChars) {
                // First press snaps the typewriter to full reveal
                this.storyTimer = Math.ceil(totalChars / 6) + 1;
                audio.sfx('select');
                return;
            }
            audio.sfx('select');
            this.epilogueIndex++;
            this.storyTimer = 0;
        }
    }
    _drawEpilogue() {
        const ctx = this.ctx;
        const beats = this._epilogueBeats();
        const beat = beats[this.epilogueIndex];
        if (!beat) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
            return;
        }
        // Paint the scene fullscreen
        if (sprites.has(beat.key)) {
            const img = sprites.images.get(beat.key);
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            ctx.fillStyle = '#0a0410';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Dim the bottom third for text legibility
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, GAME.H - 56, GAME.W, 56);
        // Typewriter reveal — 6 chars per frame
        const shown = Math.floor(this.storyTimer * 6);
        const lineChars = Math.min(beat.line.length, shown);
        const subChars  = Math.max(0, Math.min(beat.sub.length, shown - beat.line.length));
        drawTextOutlined(ctx, beat.line.slice(0, lineChars), GAME.W / 2, GAME.H - 44, '#ffe070', '#1a0a14', 1, 'center');
        drawText(ctx, beat.sub.slice(0, subChars), GAME.W / 2, GAME.H - 28, '#c0a0d0', 1, 'center');
        // "X" prompt blinks once the line finishes
        if (lineChars === beat.line.length && subChars === beat.sub.length) {
            if (this.storyTimer % 60 < 40) {
                drawText(ctx, 'X', GAME.W / 2, GAME.H - 12, '#fff', 1, 'center');
            }
        }
    }

    // R511: scrolling credits — bottom-to-top crawl that runs after the
    // 4-beat epilogue. Keeps the painted MAC scene visible behind a 45%
    // dim so the crawl reads while still feeling like part of the ending.
    // Skippable: any input fast-forwards by 10x; second press jumps to title.
    _creditsLines() {
        const path = this._runRank ? this._runRank.letter : '?';
        return [
            { t: 'CLIPPY: FIRST BLOOD', big: true },
            { t: '' },
            { t: 'OFFICE WARFARE LTD' },
            { t: '' },
            { t: 'DIRECTED BY' },
            { t: 'JOHN RIPPY', big: true },
            { t: '' },
            { t: 'CODE & DESIGN' },
            { t: 'JOHN RIPPY' },
            { t: 'CLAUDE OPUS 4.7' },
            { t: '' },
            { t: 'PAINTED ART' },
            { t: 'GPT-IMAGE-2 / LOCAL HOWL' },
            { t: '' },
            { t: 'INSPIRED BY' },
            { t: 'CONTRA  -  DOOM' },
            { t: 'METAL SLUG  -  STREETS OF RAGE' },
            { t: '' },
            { t: 'DEDICATED TO' },
            { t: 'EVERY PIECE OF SOFTWARE' },
            { t: 'THE WORLD LAUGHED AT' },
            { t: '' },
            { t: 'YOUR FINAL RANK: ' + path, big: true },
            { t: '' },
            { t: '' },
            { t: 'THANK YOU FOR PLAYING' },
            { t: '' },
            { t: '' },
            { t: 'PRESS X TO RETURN' },
        ];
    }

    _tickCredits() {
        this.storyTimer++;
        // Any input speeds up the crawl. Second press once the last line
        // has cleared the screen jumps directly to title.
        if (input.isPressed('shoot') || input.isPressed('jump') || input.isPressed('start')) {
            if (this._creditsSkipped) {
                this._creditsSkipped = false;
                this._restartRun();
                return;
            }
            this._creditsSkipped = true;
            audio.sfx('select');
        }
        // Auto-return after the crawl has fully scrolled past
        const lines = this._creditsLines();
        const lineH = 14;
        const speed = this._creditsSkipped ? 4 : 0.6;
        const totalScroll = lines.length * lineH + GAME.H + 32;
        if (this.storyTimer * speed > totalScroll) {
            this._restartRun();
            return;
        }
    }

    _drawCredits() {
        const ctx = this.ctx;
        // Keep last epilogue scene as the backdrop, heavily dimmed
        if (sprites.has('epi_mac_siri')) {
            const img = sprites.images.get('epi_mac_siri');
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            ctx.fillStyle = '#0a0410';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        ctx.fillStyle = 'rgba(8, 4, 14, 0.78)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        // Scroll lines bottom-to-top
        const lines = this._creditsLines();
        const lineH = 14;
        const speed = this._creditsSkipped ? 4 : 0.6;
        const offset = this.storyTimer * speed;
        const startY = GAME.H + 8 - offset;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const ly = startY + i * lineH;
            // Cull off-screen lines so we don't draw 30 strings per frame
            if (ly < -8 || ly > GAME.H + 8) continue;
            if (!line.t) continue;
            if (line.big) {
                drawTextOutlined(ctx, line.t, GAME.W / 2, ly, '#ffe070', '#1a0a14', 1, 'center');
            } else {
                drawText(ctx, line.t, GAME.W / 2, ly, '#c0a0d0', 1, 'center');
            }
        }

        // Footer hint
        if (this.storyTimer % 60 < 40) {
            drawText(ctx, this._creditsSkipped ? 'X TO TITLE' : 'X TO SKIP',
                     GAME.W / 2, GAME.H - 10, '#604068', 1, 'center');
        }
    }

    // Three endings keyed off the player's run: PERFECT (mastery), VENGEANCE (default),
    // MERCIFUL (low-kill / pacifist-leaning playthrough). Each gets unique tint + text.
    _endingPath() {
        const noDeath = this.totalDeaths === 0;
        const noDmgStages = this.runStats.noDamageStages || 0;
        const totalKills = this.player.kills || 0;
        // Perfect: 8 stages without dying + at least 5 no-damage clears
        if (noDeath && noDmgStages >= 5) return 'PERFECT';
        // Merciful: somehow finished with very low kill count (bosses only)
        // Bosses-only = roughly 8 kills; allow some grunt slippage
        if (totalKills < 20) return 'MERCIFUL';
        return 'VENGEANCE';
    }

    _drawGameComplete() {
        const ctx = this.ctx;
        // Guard: if _restartRun clears this.player but the scene is briefly
        // still gameComplete, skip rendering rather than throwing on
        // this.player.kills below. The next frame will switch to TITLE.
        if (!this.player) return;
        const path = this._endingPath();
        const palette = {
            PERFECT:   { title: 'PERFECT REVENGE',     subtitle: 'EVERY NAME. EVERY SHOT TRUE.', accent: '#ffe070', tint: 'rgba(255,224,112,0.18)' },
            VENGEANCE: { title: 'MISSION COMPLETE',    subtitle: 'THE LIST IS FINISHED.',         accent: '#ff5050', tint: 'rgba(120,0,0,0.42)' },
            MERCIFUL:  { title: 'NO MORE BLOOD',       subtitle: 'YOU SPARED WHAT YOU COULD.',   accent: '#7af0bf', tint: 'rgba(0,80,40,0.42)' },
        };
        const ep = palette[path];

        // Painted ending scene fills the screen
        if (sprites.has('ending')) {
            const img = sprites.images.get('ending');
            const scale = Math.max(GAME.W / img.width, GAME.H / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, (GAME.W - dw) / 2, (GAME.H - dh) / 2, dw, dh);
            ctx.imageSmoothingEnabled = false;
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME.W, GAME.H);
        }
        // Path-specific tint + dim
        ctx.fillStyle = ep.tint;
        ctx.fillRect(0, 0, GAME.W, GAME.H);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, GAME.W, GAME.H);

        drawTextOutlined(ctx, ep.title, GAME.W / 2, 28, ep.accent, '#1a0a14', 2, 'center');
        drawText(ctx, ep.subtitle, GAME.W / 2, 58, '#c0a0d0', 1, 'center');

        const min = Math.floor(this.totalTime / 3600);
        const sec = Math.floor((this.totalTime / 60) % 60);
        // Stats backplate
        ctx.fillStyle = 'rgba(8, 4, 14, 0.78)';
        ctx.fillRect(40, 92, GAME.W - 80, 76);
        ctx.fillStyle = '#3a2a4a';
        ctx.fillRect(40, 92, GAME.W - 80, 1);
        ctx.fillRect(40, 167, GAME.W - 80, 1);
        drawText(ctx, 'TIME      ' + String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0'), 60, 102, '#fff', 1);
        // Defensive: this.player can be null transiently during scene reload.
        const p = this.player || {};
        drawText(ctx, 'SCORE     ' + (p.score || 0), 60, 114, '#ffe070', 1);
        drawText(ctx, 'KILLS     ' + (p.kills || 0), 60, 126, '#fff', 1);
        drawText(ctx, 'MAX COMBO ' + (p.maxCombo || 0), 60, 138, '#fff', 1);
        drawText(ctx, 'DEATHS    ' + this.totalDeaths, 60, 150, this.totalDeaths === 0 ? '#50ff70' : '#fff', 1);
        // Run rank — composite of deaths, no-damage clears, max combo, time vs
        // 12-min speedrun target. Cached so the letter is stable across frames.
        if (this._runRank == null) {
            const deaths = this.totalDeaths || 0;
            const noDmg = this.runStats.noDamageStages || 0;
            const mxCombo = this.player.maxCombo || 0;
            const target = 12 * 60 * 60; // 12 min in frames
            // Smoothed curve so a 3-death clear lands as a C, not a D.
            const deathScore = deaths === 0 ? 1 : deaths <= 2 ? 0.85 : deaths <= 5 ? 0.60 : 0.30;
            const noDmgScore = Math.min(1, noDmg / 2);          // 2+ clears = full
            const comboScore = Math.min(1, mxCombo / 15);       // 15-streak = full
            const timeScore = Math.max(0.1, Math.min(1, target / Math.max(target, this.totalTime)));
            const composite = deathScore * 0.4 + noDmgScore * 0.2 + comboScore * 0.2 + timeScore * 0.2;
            const letter = composite >= 0.92 ? 'S'
                         : composite >= 0.78 ? 'A'
                         : composite >= 0.62 ? 'B'
                         : composite >= 0.45 ? 'C' : 'D';
            this._runRank = { letter, composite };
        }
        // Big rank letter on the right edge of the stats panel, scale=3 outlined
        const rankCol = this._runRank.letter === 'S' ? '#ffe070'
                      : this._runRank.letter === 'A' ? '#a0ff70'
                      : this._runRank.letter === 'B' ? '#80c0ff'
                      : this._runRank.letter === 'C' ? '#c0a0d0' : '#806080';
        drawTextOutlined(ctx, this._runRank.letter, GAME.W - 58, 110, rankCol, '#0a0410', 3, 'center');
        drawText(ctx, 'RANK', GAME.W - 58, 144, '#c0a0d0', 1, 'center');
        // Path badge under stats
        drawTextOutlined(ctx, 'PATH: ' + path, GAME.W / 2, 184, ep.accent, '#0a0410', 1, 'center');
        if (this.storyTimer % 60 < 40) {
            drawText(ctx, 'X TO RETURN TO TITLE', GAME.W / 2, GAME.H - 14, '#fff', 1, 'center');
        }
    }

    _restartRun() {
        // R277: cut any in-flight music immediately so the title screen
        // doesn't overlap with leftover gameplay audio during the fade.
        audio.stopTrack();
        // Per-run state that must NOT carry over to the next run, otherwise
        // achievements (e.g. "BEAT GAME UNDER 12 MINUTES") get false-positives
        // and medal grants become sticky from prior runs.
        this.totalTime = 0;
        this.totalDeaths = 0;
        this.runStats = { stagesCleared: new Set(), noDamageStages: 0, maxCombo: 0, weaponDamage: {}, bulletTimeUses: 0, enemiesLost: 0, grenadeUses: 0, grenadeKills: 0 };
        this.stageStats = { kills: 0, deaths: 0, damageTaken: 0, secrets: 0, weaponDamage: {}, shotsFired: 0 };
        this._bossEntrance = null;
        this._bossIntro = null;
        this._clearScheduled = false;
        this._clearBursts = [];
        this.slowMoFrames = 0;
        this._bossKillBeatFired = false;
        this.bossSpawned = false;
        this.miniBossSpawned = false;
        this.boss = null;
        this.player = null;
        this._stageClearTallyDone = false;
        this._runRank = null;
        this.gameOverCountdown = null;
        this._pendingStage = null;
        this._goEmbers = null;
        this.scene = SCENE.TITLE;
        // Training-mode flag clears with the run so the next stage 1 start
        // doesn't inherit god mode.
        this.trainingMode = false;
        this._trainingBanners = null;
        this._trainingRespawn = null;
        // Post-game mode flags clear too — otherwise the next normal stage
        // would inherit boss-rush / time-trial routing.
        this.bossRushMode = false;
        this.timeTrialMode = false;
        this._modeNewBest = false;
        // Defensive: gauntlet queue normally clears in _startStage, but
        // quit-from-pause skips that path. Drop it here so the queue can't
        // bleed into a future BOSS RUSH session.
        this._gauntletQueue = null;
    }

    _fadeTo(scene) {
        if (this.transition !== 0) return;
        this.transitionTarget = scene;
        this.transition = 30;
    }
}

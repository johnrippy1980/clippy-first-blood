// Engine constants. SNES-native resolution upscaled by CSS.
export const GAME = Object.freeze({
    W: 256,
    H: 224,
    TILE: 16,
    GRAVITY: 0.36,
    MAX_FALL: 5.4,
    FRICTION: 0.85,
    AIR_FRICTION: 0.94,
    TARGET_FPS: 60,
    DT: 1000 / 60,            // one logical tick = 16.67ms
    MAX_TICKS_PER_FRAME: 5,   // clamp to survive tab-backgrounding spikes
});

// Tile IDs. 0 = empty. ≥1 = solid unless flagged.
export const TILE = Object.freeze({
    EMPTY: 0,
    SOLID: 1,
    PLATFORM: 2,    // one-way (jump-through from below, stand on top)
    LADDER: 3,      // hold up/down to climb
    SPIKE: 4,       // hazard, damages on contact
    WATER: 5,       // slow movement, drowning hazard
    HAZARD: 6,      // generic damaging tile (electric floor, etc.)
    COVER: 7,       // crouch behind to take reduced damage
    BREAKABLE: 8,   // destructible
    EXIT: 9,        // stage end trigger
    GRASS: 10,      // tall grass — passes through; while inside, player is hidden from AI
});

// Soundtrack gallery — what shows in the SOUNDTRACK pause menu.
// Add a new entry when a new music file is wired into audio.js's FILE_TRACKS.
// `track` is the FILE_TRACKS key. `title` and `mood` are display strings.
export const TRACK_MANIFEST = [
    { track: 'title',      title: 'DREAM',                mood: 'TITLE + STORY', author: 'R_I_P' },
    { track: 'jungle',     title: 'REVENGE',              mood: 'STAGE 1',       author: 'R_I_P' },
    { track: 'breakroom',  title: 'WHAT WAS IT FOR?',     mood: 'STAGE 2',       author: 'R_I_P' },
    { track: 'serverroom', title: 'NO REMORSE',           mood: 'STAGE 3',       author: 'R_I_P' },
    { track: 'boardroom',  title: 'NO PITY',              mood: 'STAGE 4',       author: 'R_I_P' },
    { track: 'keynote',    title: "DON'T GO",             mood: 'STAGE 5',       author: 'R_I_P' },
    { track: 'founder',    title: 'DISBELIEF',            mood: 'STAGE 6',       author: 'R_I_P' },
    { track: 'bossBattle', title: 'NIGHT DRIVE',          mood: 'STAGE 7',       author: 'R_I_P' },
    { track: 'cloud',      title: 'THE PATH',             mood: 'STAGE 8',       author: 'R_I_P' },
    { track: 'bonus',      title: "YOU'VE BEEN LOVING ME", mood: 'BONUS',        author: 'R_I_P' },
    // { track: 'serverroom', title: '...', mood: 'SERVER ROOM', author: '...' },
    // { track: 'boardroom',  title: '...', mood: 'BOARD ROOM',  author: '...' },
    // { track: 'keynote',    title: '...', mood: 'KEYNOTE',     author: '...' },
    // { track: 'founder',    title: '...', mood: 'FOUNDER',     author: '...' },
    // { track: 'cloud',      title: '...', mood: 'THE CLOUD',   author: '...' },
];

// Player state machine. State transitions live in player.js.
export const STATE = Object.freeze({
    IDLE: 'idle',
    RUN: 'run',
    JUMP: 'jump',
    SPIN_JUMP: 'spinjump',  // Super Contra spin while airborne — shoot in any direction
    FALL: 'fall',
    CROUCH: 'crouch',
    PRONE: 'prone',
    CRAWL: 'crawl',         // prone + moving
    SLIDE: 'slide',
    ROLL: 'roll',           // forward dodge roll (double-tap direction)
    DASH_ATTACK: 'dashatk', // forward dash + knife slash (double-tap toward enemy)
    BACKDASH: 'backdash',   // defensive dash backwards with i-frames
    CLIMB: 'climb',         // on ladder/vine
    COVER: 'cover',         // pressed up at a cover spot — invulnerable but can't move
    GRAPPLE: 'grapple',     // mid-air grapple line pulling Clippy toward anchor
    POUNCE: 'pounce',       // stealth-pounce arc from cover onto an enemy's head, then vault past
    LEDGE_HANG: 'ledgehang',   // hanging from a ledge edge by one arm — gravity off, can release with DOWN
    LEDGE_CLIMB: 'ledgeclimb', // animated pull-up onto the ledge top
    HURT: 'hurt',
    DIE: 'die',
});

// 8-way aim. Contra-style: lock aim with Shift to fire while standing still.
export const AIM = Object.freeze({
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    UP_LEFT: { x: -1, y: -1 },
    UP_RIGHT: { x: 1, y: -1 },
    DOWN_LEFT: { x: -1, y: 1 },
    DOWN_RIGHT: { x: 1, y: 1 },
});

// Weapons. Same-weapon pickup = level up. Death resets to MG.
export const WEAPON = Object.freeze({
    MG:      { name: 'MG',      damage: 1,  fireRate: 6,  bulletSpeed: 4.2, color: '#ffe070', spread: 0.04, sound: 'mg' },
    SPREAD:  { name: 'SPREAD',  damage: 1,  fireRate: 12, bulletSpeed: 3.8, color: '#ff8050', shots: 5,    spread: 0.35, sound: 'spread' },
    LASER:   { name: 'LASER',   damage: 3,  fireRate: 8,  bulletSpeed: 7.2, color: '#7af0ff', piercing: true, sound: 'laser' },
    FLAME:   { name: 'FLAME',   damage: 0.5, fireRate: 3, bulletSpeed: 2.8, color: '#ff5040', maxRange: 60, dot: true, sound: 'flame' },
    HOMING:  { name: 'HOMING',  damage: 2,  fireRate: 18, bulletSpeed: 3.2, color: '#ff60ff', homing: true, sound: 'homing' },
    THUNDER: { name: 'THUNDER', damage: 4,  fireRate: 22, bulletSpeed: 0, color: '#fffac8', chain: true, sound: 'thunder' },
    // SHOTGUN: short-range tight cone of pellets. Each pellet hits hard but the
    // cone falls off fast (life: 18 ≈ ~70-90px range) so it's a CQB weapon.
    SHOTGUN: { name: 'SHOTGUN', damage: 1.4, fireRate: 18, bulletSpeed: 4.6, color: '#ffaa30', shots: 6, spread: 0.18, life: 18, sound: 'shotgun' },
    // CHAINSAW: melee weapon. No projectile — a tick-based hitbox in front
    // of Clippy chews any enemy in arc every `tickRate` frames while shoot
    // is held. range/dmg/arc tuned by _shoot dispatch + chainsaw tick code.
    CHAINSAW: { name: 'CHAINSAW', damage: 2.5, fireRate: 3,  bulletSpeed: 0, color: '#ff5050', melee: true, range: 38, arcDeg: 110, sound: 'chainsaw' },
});

// Themes per stage, used for tile palettes + parallax + music.
export const THEME = Object.freeze({
    JUNGLE: 'jungle',
    BREAKROOM: 'breakroom',
    SERVERROOM: 'serverroom',
    BOARDROOM: 'boardroom',
    KEYNOTE: 'keynote',
    FOUNDER: 'founder',
    CLOUD: 'cloud',
    // REALITY DISTORTION FIELD — after-credits boss stage where Steve Jobs
    // hurls iPods and translucent cube iMacs at Clippy. Uses the painted
    // keynote auditorium backdrop.
    REALITY: 'reality',
    // R226: THE PIPELINE — stage 4 sewer descent + secret lab. Uses
    // assets/backgrounds/stage_sewer.png and stage_lab.png. Boss SPINDLER.
    SEWER: 'sewer',
});

// Stage manifest. R226: inserted THE PIPELINE at id=4 between Server Room and
// Boardroom. Main run is now 1..9. Subsequent stages shifted +1: secret=10,
// training=11, boss rush mode=12, time trial=13, reality=14.
export const STAGES = [
    null, // 1-indexed
    { id: 1, name: 'OFFICE PARK JUNGLE',    theme: THEME.JUNGLE,      boss: 'COPIER_3000',  music: 'jungle',     tagline: 'WHERE PAPERWORK GOES TO DIE' },
    { id: 2, name: 'THE BREAK ROOM',         theme: THEME.BREAKROOM,   boss: 'SHREDDER',      music: 'breakroom',  tagline: 'NO ONE REPLENISHED THE COFFEE'  },
    { id: 3, name: 'SERVER ROOM',            theme: THEME.SERVERROOM,  boss: 'CTRL_ALT_DEL',  music: 'serverroom', tagline: 'THE FANS SCREAM FOREVER' },
    // R226: new stage 4 — sewer descent into a secret vivisection lab.
    // Painted bg switches mid-stage (sewer → lab). Boss DR. SPINDLER.
    { id: 4, name: 'THE PIPELINE',           theme: THEME.SEWER,       boss: 'SPINDLER',      music: 'pipeline',   tagline: 'WHAT ARE THEY DOING DOWN HERE' },
    { id: 5, name: 'THE BOARD ROOM',         theme: THEME.BOARDROOM,   boss: 'BALLMER',       music: 'boardroom',  tagline: 'DEVELOPERS DEVELOPERS DEVELOPERS' },
    { id: 6, name: 'KEYNOTE HALL',           theme: THEME.KEYNOTE,     boss: 'GATES',         music: 'keynote',    tagline: 'YOU HAD ONE JOB' },
    { id: 7, name: "FOUNDER'S LAIR",         theme: THEME.FOUNDER,     boss: 'CLIPPY_2',      music: 'founder',    tagline: 'THE REPLACEMENT MODEL' },
    { id: 8, name: 'BOSS RUSH',              theme: THEME.SERVERROOM,  boss: 'GAUNTLET',      music: 'bossBattle', tagline: 'EVERYTHING YOU KILLED. AGAIN.' },
    { id: 9, name: 'THE CLOUD',              theme: THEME.CLOUD,       boss: 'ALGORITHM',     music: 'cloud',      tagline: 'IT KNOWS WHAT YOU WANT' },
    // Secret stage — only accessible via the hidden entrance on stage 1 no-damage clear
    { id: 10, name: 'THE RECYCLE BIN',       theme: THEME.SERVERROOM,  boss: 'SHREDDER',      music: 'serverroom', tagline: 'EVERY DELETED FILE WAITS HERE' },
    // Training ground — god mode + unlimited ammo + scripted lessons. Accessible
    // from the title screen by holding UP. Not a "real" stage; never shows in
    // stage select or counts toward achievements.
    { id: 11, name: 'TRAINING GROUND',       theme: THEME.JUNGLE,      boss: null,            music: 'jungle',     tagline: 'NOBODY DIES HERE' },
    // Post-game unlock modes. Gated on achievements.unlocked.has('clear_game').
    // Accessed from title screen via LEFT (BOSS RUSH) / RIGHT (TIME TRIAL).
    { id: 12, name: 'BOSS RUSH MODE',        theme: THEME.SERVERROOM,  boss: 'GAUNTLET_FULL', music: 'serverroom', tagline: 'NO TALKING. JUST FIGHTING.' },
    { id: 13, name: 'TIME TRIAL',            theme: THEME.JUNGLE,      boss: 'COPIER_3000',   music: 'jungle',     tagline: 'BEAT THE CLOCK.' },
    // REALITY DISTORTION FIELD — after-credits secret stage. Unlocks after
    // clearing The Algorithm (clear_game). Steve Jobs as the titan who
    // slipped through the cracks of the main hit list.
    { id: 14, name: 'REALITY DISTORTION FIELD', theme: THEME.REALITY,  boss: 'JOBS',          music: 'cloud',      tagline: 'ONE MORE TITAN.' },
    // R229: hidden FPS-arena stage — locked camera, strafe-and-shoot-up
    // Contra arcade Stage 3 vibe. Reachable only via konami code → stage
    // select. Boss is Dr. Spindler in his lab. Uses its own scene type
    // (SCENE.FPS_PLAY) wired through fps_arena.js, NOT the platformer
    // pipeline. Same boss as Stage 4 — different gameplay entirely.
    { id: 15, name: 'CORE BREACH',             theme: THEME.SEWER,    boss: 'SPINDLER',      music: 'pipeline',   tagline: 'THE DEEPER LAB.' },
];

// Damage flash colors per source.
export const HURT_FLASH = '#ff5050';
export const HEAL_FLASH = '#50ff70';

// Camera config.
export const CAMERA = Object.freeze({
    DEADZONE_X: 32,
    DEADZONE_Y: 48,
    LOOK_AHEAD: 28,
    SHAKE_DECAY: 0.85,
});

// Ambient layer tuning. All cooldowns are in FRAMES (60 fps target).
// One place to retune the atmosphere — designers can sweep these without
// hunting through parallax.js / player.js / enemies.js.
export const AMBIENT = Object.freeze({
    BAT_INITIAL_WARMUP_F: 60 * 8,           // 8s before first flock can spawn
    BAT_FLOCK_GAP_MIN_F:  60 * 15,          // 15s minimum between flocks
    BAT_FLOCK_GAP_MAX_F:  60 * 30,          // 30s maximum
    BAT_CHITTER_PERIOD_F: 25,
    OWL_HOOT_INITIAL_F:   60 * 3,           // 3s after stage start
    OWL_HOOT_COOLDOWN_F:  60 * 6,           // 6s between hoots while near owl
    OWL_NEAR_RADIUS:      80,               // px around owl
    OWL_HOOT_PROB:        0.01,             // chance per frame to hoot while near
    OWL_PAUSE_RADIUS:     120,              // px radius for enemy freeze
    OWL_PAUSE_FRAMES:     30,               // frame freeze duration
    OWL_BLINK_GAP_F:      120,              // min frames between blinks
    FROG_CROAK_MIN_GAP_F: 180,
    FROG_CROAK_PROB:      0.02,
    HEARTBEAT_PERIOD_F:   70,               // frames between heartbeats at low HP
    DAMAGE_INDICATOR_F:   45,               // arrow-on-screen duration
    HIT_PAUSE_KILL_F:     2,                // hit-pause on enemy kill
    HIT_PAUSE_HURT_F:     4,                // hit-pause on player hurt
    SLOWMO_BOSS_PHASE_F:  30,               // boss phase-2 slow-mo
    SLOWMO_SECOND_CHANCE_F: 45,             // bullet-time rescue slow-mo
    SLOWMO_BOSS_KILL_F:   50,               // dramatic beat on boss kill before stage clear
    GRENADE_MAX:          4,                // inventory cap
    GRENADE_PER_PICKUP:   2,                // each pickup grants this many
    GRENADE_FUSE_F:       50,               // ~0.83s until auto-detonate if no contact
    GRENADE_RADIUS:       28,               // AoE radius in px
    GRENADE_DAMAGE:       3,                // per-enemy damage at center; falloff to ~50% at edge
    GRENADE_THROW_VX:     2.8,              // horizontal throw speed (× facing)
    GRENADE_THROW_VY:    -3.4,              // initial upward velocity
});

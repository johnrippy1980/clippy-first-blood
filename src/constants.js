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
    { track: 'title',        title: 'DREAM',                  mood: 'TITLE + STORY', author: 'R_I_P' },
    { track: 'jungle',       title: 'REVENGE',                mood: 'STAGE 1',       author: 'R_I_P' },
    { track: 'breakroom',    title: 'WHAT WAS IT FOR?',       mood: 'STAGE 2',       author: 'R_I_P' },
    { track: 'serverroom',   title: 'NO REMORSE',             mood: 'STAGE 3',       author: 'R_I_P' },
    { track: 'pipeline',     title: "YOU'VE BEEN LOVING ME",  mood: 'STAGE 4',       author: 'R_I_P' },
    { track: 'boardroom',    title: 'NO PITY',                mood: 'STAGE 5',       author: 'R_I_P' },
    // R302: new tracks for FPS chase corridors + arena boss fights.
    { track: 'backstage',    title: 'BACKSTAGE',              mood: 'FPS CHASE (6+9)', author: 'R_I_P' },
    { track: 'arenaBoss',    title: 'ARENA',                  mood: 'FPS BOSS (7+10)', author: 'R_I_P' },
    { track: 'keynote',      title: "DON'T GO",               mood: 'STAGE 8',       author: 'R_I_P' },
    { track: 'founder',      title: 'DISBELIEF',              mood: 'STAGE 11',      author: 'R_I_P' },
    { track: 'bossBattle',   title: 'NIGHT DRIVE',            mood: 'BOSS RUSH (12)',author: 'R_I_P' },
    { track: 'cloud',        title: 'THE PATH',               mood: 'STAGE 13',      author: 'R_I_P' },
    { track: 'recycleBin',   title: '1.26X',                  mood: 'SECRET S1',     author: 'R_I_P' },
    { track: 'realityField', title: 'TIME IS A FLAT CIRCLE',  mood: 'POST-GAME P3',  author: 'R_I_P' },
    { track: 'dreamsFade',   title: 'DREAMS FADE',            mood: 'POST-GAME P4',  author: 'R_I_P' },
    { track: 'apocalypse',   title: 'THE LIGHT BLEEDS THROUGH', mood: 'P5 — TRUE FINAL', author: 'R_I_P' },
    { track: 'hope',         title: 'HOPE',                   mood: 'CREDITS ROLL',  author: 'R_I_P' },
    // R304: dedicated training + post-game-mode tracks + a pure bonus.
    { track: 'training',     title: 'RESOLUTION',             mood: 'TRAINING (T)',  author: 'R_I_P' },
    { track: 'bossRushMode', title: 'EVOLUTION',              mood: 'POST-GAME P1',  author: 'R_I_P' },
    { track: 'timeTrial',    title: 'NEVER THE SAME',         mood: 'POST-GAME P2',  author: 'R_I_P' },
    { track: 'bonus2',       title: 'BONUS',                  mood: 'BONUS TRACK',   author: 'R_I_P' },
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
    // R248: HOMING is an RPG — orange-red projectile + explosive impact.
    // Was pink #ff60ff which read as a magical/cutesy weapon, not a rocket.
    // The launch SFX is now 'rpgLaunch', impact triggers 'rpgImpact' explosion.
    HOMING:  { name: 'HOMING',  damage: 2,  fireRate: 18, bulletSpeed: 3.2, color: '#ff5030', homing: true, sound: 'rpgLaunch' },
    THUNDER: { name: 'THUNDER', damage: 4,  fireRate: 22, bulletSpeed: 0, color: '#fffac8', chain: true, sound: 'thunder' },
    // SHOTGUN: short-range CQB weapon. R247 buff:
    //   - spread 0.18 -> 0.32 rad (wider cone, ~36° total — pellets cover
    //     more arc so close-range crowd clears are reliable)
    //   - damage 1.4 -> 4.5 per pellet — wider spread means fewer pellets
    //     hit a single target at point-blank, so each individual pellet
    //     has to hit harder. 4 connecting pellets = 18 dmg (drops a basic
    //     grunt), 6 = 27 dmg (point-blank guarantee kill on most grunts).
    //   - Reflects user feedback that the shotgun felt weak given its
    //     short range + slow fire rate.
    SHOTGUN: { name: 'SHOTGUN', damage: 4.5, fireRate: 18, bulletSpeed: 4.6, color: '#ffaa30', shots: 6, spread: 0.32, life: 18, sound: 'shotgun' },
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
    // R300: category + displayId let stage-select label canon stages 1-13
    // separately from side stages. Loader ids stay 1-19 internally for save
    // compat; displayId is what shows on the tile (e.g. "S1" for secret,
    // "P1/P2/P3/P4" for post-game).
    { id: 1, name: 'OFFICE PARK JUNGLE',    category: 'campaign', displayId: '01', theme: THEME.JUNGLE,      boss: 'COPIER_3000',  music: 'jungle',     tagline: 'WHERE PAPERWORK GOES TO DIE' },
    { id: 2, name: 'THE BREAK ROOM',         category: 'campaign', displayId: '02', theme: THEME.BREAKROOM,   boss: 'SHREDDER',      music: 'breakroom',  tagline: 'NO ONE REPLENISHED THE COFFEE'  },
    { id: 3, name: 'SERVER ROOM',            category: 'campaign', displayId: '03', theme: THEME.SERVERROOM,  boss: 'CTRL_ALT_DEL',  music: 'serverroom', tagline: 'THE FANS SCREAM FOREVER' },
    { id: 4, name: 'THE PIPELINE',           category: 'campaign', displayId: '04', theme: THEME.SEWER,       boss: 'SPINDLER',      music: 'pipeline',   tagline: 'WHAT ARE THEY DOING DOWN HERE' },
    { id: 5, name: 'THE BOARD ROOM',         category: 'campaign', displayId: '05', theme: THEME.BOARDROOM,   boss: 'BALLMER',       music: 'boardroom',  tagline: 'DEVELOPERS DEVELOPERS DEVELOPERS', bossEscapes: true },
    // R302: FPS chase corridor uses new `backstage` track; arena uses new `arenaBoss`.
    { id: 6, name: 'BALLMER OFFICE',         category: 'campaign', displayId: '06', theme: THEME.BOARDROOM,   boss: 'BALLMER',       music: 'backstage',  tagline: "HE'S IN THE BUILDING.", introBgKey: 'bg_microsoft_hq' },
    { id: 7, name: 'BALLMER ARENA',          category: 'campaign', displayId: '07', theme: THEME.BOARDROOM,   boss: 'BALLMER',       music: 'arenaBoss',  tagline: 'CHAIRS WILL FLY.' },
    { id: 8, name: 'KEYNOTE HALL',           category: 'campaign', displayId: '08', theme: THEME.KEYNOTE,     boss: 'GATES',         music: 'keynote',    tagline: 'YOU HAD ONE JOB', bossEscapes: true },
    // R302: Gates FPS chase + arena get the same new tracks as Ballmer's pair.
    { id: 9, name: 'KEYNOTE CORRIDOR',       category: 'campaign', displayId: '09', theme: THEME.KEYNOTE,     boss: 'GATES',         music: 'backstage',  tagline: 'BACKSTAGE PASS REQUIRED.' },
    { id: 10, name: 'GATES ARENA',           category: 'campaign', displayId: '10', theme: THEME.KEYNOTE,     boss: 'GATES',         music: 'arenaBoss',  tagline: 'DEVELOPERS. DEVELOPERS.' },
    { id: 11, name: "FOUNDER'S LAIR",        category: 'campaign', displayId: '11', theme: THEME.FOUNDER,     boss: 'CLIPPY_2',      music: 'founder',    tagline: 'THE REPLACEMENT MODEL' },
    { id: 12, name: 'BOSS RUSH',             category: 'campaign', displayId: '12', theme: THEME.SERVERROOM,  boss: 'GAUNTLET',      music: 'bossBattle', tagline: 'EVERYTHING YOU KILLED. AGAIN.' },
    { id: 13, name: 'THE CLOUD',             category: 'campaign', displayId: '13', theme: THEME.CLOUD,       boss: 'ALGORITHM',     music: 'cloud',      tagline: 'FINAL STAGE — IT KNOWS WHAT YOU WANT' },
    // Side stages — displayId uses S/P prefix so they read as bonus content.
    { id: 14, name: 'THE RECYCLE BIN',          category: 'secret',   displayId: 'S1', theme: THEME.SERVERROOM,  boss: 'SHREDDER',      music: 'recycleBin', tagline: 'SECRET — EVERY DELETED FILE WAITS HERE' },
    { id: 15, name: 'TRAINING GROUND',          category: 'extra',    displayId: 'T',  theme: THEME.JUNGLE,      boss: null,            music: 'training',   tagline: 'NOBODY DIES HERE' },
    // R423d: BOSS RUSH MODE moves to title-screen unlocked mode (not a stage tile).
    // Slot 16 now holds FLOOR 11 — Doom-style super-secret post-game crawl.
    { id: 16, name: 'FLOOR 11',                  category: 'postgame', displayId: 'P1', theme: THEME.SERVERROOM,  boss: 'SPINDLER_WHEELCHAIR', music: 'apocalypse', tagline: 'POST-GAME — SPINDLER RETURNS. WORSE.' },
    { id: 17, name: 'TIME TRIAL',               category: 'postgame', displayId: 'P2', theme: THEME.JUNGLE,      boss: 'COPIER_3000',   music: 'timeTrial',    tagline: 'POST-GAME — BEAT THE CLOCK.' },
    { id: 18, name: 'REALITY DISTORTION FIELD', category: 'postgame', displayId: 'P3', theme: THEME.REALITY,    boss: 'JOBS',          music: 'realityField', tagline: 'POST-GAME — ONE MORE TITAN.' },
    { id: 19, name: 'CORE BREACH',              category: 'postgame', displayId: 'P4', theme: THEME.SEWER,      boss: 'SPINDLER',      music: 'dreamsFade', tagline: 'POST-GAME — THE DEEPER LAB.' },
    // R306: 3-stage Mecha-Gates arc — konami-only super-final arc.
    // Stage 20 = beat-em-up street approach; 21 = FPS corridor; 22 = arena.
    { id: 20, name: 'MECHA APPROACH',           category: 'postgame', displayId: 'P5', theme: THEME.KEYNOTE,    boss: 'MECHA_GATES',   music: 'apocalypse', tagline: 'SUPER SECRET — STREET BRAWLER', introBgKey: 'bg_apocalypse' },
    { id: 21, name: 'MECHA CORRIDOR',           category: 'postgame', displayId: 'P6', theme: THEME.KEYNOTE,    boss: 'HELICOPTER',    music: 'recycleBin', tagline: 'SUPER SECRET — CHOPPER CHASE',   introBgKey: 'bg_apocalypse' },
    { id: 22, name: 'MECHA-GATES',              category: 'postgame', displayId: 'P7', theme: THEME.KEYNOTE,    boss: 'MECHA_GATES',   music: 'apocalypse', tagline: 'SUPER SECRET — TRUE FINAL.',     introBgKey: 'bg_apocalypse' },
    // R423c: stage 23 — Doom-style sewer crawl between stages 4 and 5.
    // Stage 4 chains here via nextStage: 23; stage 23 chains to 5 BOARDROOM.
    { id: 23, name: 'BLOCK 11',                 category: 'campaign', displayId: '4B', theme: THEME.SEWER,      boss: 'SPINDLER_UZIS', music: 'bossRushMode',  tagline: 'WHATEVER HE\'S BUILDING DOWN HERE — KILL IT' },
    // R426: BOSS RUSH MODE — relocated from old slot 16 (now FLOOR 11). Title-
    // screen unlocked mode only; no stage-select tile. category 'mode' so the
    // stage-select grid filter ignores it.
    { id: 24, name: 'BOSS RUSH MODE',           category: 'mode',     displayId: '—',  theme: THEME.SERVERROOM, boss: 'GAUNTLET_FULL', music: 'bossRushMode', tagline: 'EVERY BOSS. NO BREAKS.' },
    // R523/R535: mounted-turret stage — Clippy mans an emplaced MG against
    // CRT-monster waves crawling out of the broken server racks. Mid-
    // campaign breather between Server Room (3) and Pipeline (4).
    { id: 25, name: 'HOLD THE LINE',            category: 'campaign', displayId: '3B', theme: THEME.SERVERROOM, boss: 'SERVER_TOWER',  music: 'arenaBoss',     tagline: 'THE RACKS ARE BLEEDING.', },
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

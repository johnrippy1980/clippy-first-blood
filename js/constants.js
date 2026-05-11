// ============================================
// CLIPPY: FIRST BLOOD - Game Constants
// SNES-style run & gun (Contra 3 + Blackthorne)
// ============================================

const GAME = {
    WIDTH: 256,
    HEIGHT: 224,
    FPS: 60,
    TILE_SIZE: 16,
    GRAVITY: 0.5,
    MAX_FALL_SPEED: 8
};

// Player states
const PLAYER_STATE = {
    IDLE: 'idle',
    RUNNING: 'running',
    JUMPING: 'jumping',
    FALLING: 'falling',
    CROUCHING: 'crouching',
    PRONE: 'prone',
    SLIDING: 'sliding',
    CLIMBING: 'climbing',
    WALL_SLIDING: 'wallSliding',
    COVER: 'cover',         // Blackthorne-style hiding
    HURT: 'hurt',
    DYING: 'dying'
};

// Aim directions (8-way)
const AIM_DIR = {
    RIGHT: 0,
    UP_RIGHT: 1,
    UP: 2,
    UP_LEFT: 3,
    LEFT: 4,
    DOWN_LEFT: 5,
    DOWN: 6,
    DOWN_RIGHT: 7
};

// Weapon types
const WEAPON = {
    MACHINE_GUN: {
        name: 'Machine Gun',
        damage: 1,
        fireRate: 5,    // frames between shots
        bulletSpeed: 8,
        spread: 0,
        color: '#ff0'
    },
    SPREAD: {
        name: 'Spread Gun',
        damage: 1,
        fireRate: 15,
        bulletSpeed: 7,
        spread: 5,      // 5 bullets
        color: '#f80'
    },
    LASER: {
        name: 'Laser',
        damage: 3,
        fireRate: 20,
        bulletSpeed: 12,
        spread: 0,
        piercing: true,
        color: '#f0f'
    },
    FLAME: {
        name: 'Flamethrower',
        damage: 0.5,
        fireRate: 2,
        bulletSpeed: 4,
        spread: 0,
        color: '#f40'
    },
    STAPLE_REMOVER: {
        name: 'Staple Remover',
        damage: 5,
        fireRate: 30,
        bulletSpeed: 10,
        spread: 0,
        explosive: true,
        color: '#0ff'
    },
    HOMING: {
        name: 'Homing',
        damage: 2,
        fireRate: 12,
        bulletSpeed: 3.2,
        spread: 0,
        homing: true,
        color: '#80ff60'
    },
    THUNDER: {
        name: 'Thunder',
        damage: 3,
        fireRate: 22,
        bulletSpeed: 11,
        spread: 0,
        chain: true,        // chains to nearby enemies on hit
        color: '#80c0ff'
    }
};

// Player physics
// Difficulty modes - applied as multipliers/flags at stage load
const DIFFICULTY = {
    EASY: {
        name: 'EASY',
        healthMul: 1.5,           // 150 HP instead of 100
        livesStart: 5,
        continuesStart: 5,
        enemyDamageMul: 0.6,
        playerDamageMul: 1.0,
        regenSpeed: 1.5,
        color: '#50ff70',
        description: 'MORE HEALTH AND LIVES'
    },
    NORMAL: {
        name: 'NORMAL',
        healthMul: 1.0,
        livesStart: 3,
        continuesStart: 3,
        enemyDamageMul: 1.0,
        playerDamageMul: 1.0,
        regenSpeed: 1.0,
        color: '#ffe070',
        description: 'AS INTENDED'
    },
    HARD: {
        name: 'HARD',
        healthMul: 0.7,
        livesStart: 2,
        continuesStart: 1,
        enemyDamageMul: 1.4,
        playerDamageMul: 0.8,
        regenSpeed: 0.5,
        color: '#ff5050',
        description: 'NO CHECKPOINTS'
    }
};

const PLAYER = {
    WIDTH: 16,
    HEIGHT: 32,
    CROUCH_HEIGHT: 20,
    PRONE_HEIGHT: 10,

    RUN_SPEED: 2,
    RUN_ACCEL: 0.3,
    RUN_FRICTION: 0.85,

    JUMP_FORCE: -7,
    DOUBLE_JUMP_FORCE: -6,
    WALL_JUMP_X: 4,
    WALL_JUMP_Y: -6,
    WALL_SLIDE_SPEED: 1,

    CLIMB_SPEED: 1.5,

    MAX_HEALTH: 100,
    HEALTH_REGEN_RATE: 0.5,   // Health per frame when in cover
    HEALTH_REGEN_DELAY: 120,  // Frames before regen starts (2 seconds)

    INVINCIBILITY_FRAMES: 60
};

// Enemy types
const ENEMY_TYPE = {
    STAPLER: {
        name: 'Stapler',
        width: 20,
        height: 16,
        health: 3,
        damage: 10,
        speed: 1,
        behavior: 'hop',
        projectile: 'staple',
        score: 100
    },
    FILE_FOLDER: {
        name: 'Flying File Folder',
        width: 24,
        height: 12,
        health: 2,
        damage: 10,
        speed: 1.5,
        behavior: 'fly_sine',
        projectile: 'paperclip',
        score: 150
    },
    RUBBER_BAND_BALL: {
        name: 'Rubber Band Ball',
        width: 16,
        height: 16,
        health: 4,
        damage: 15,
        speed: 2,
        behavior: 'bounce',
        projectile: null,
        score: 200
    },
    TAPE_DISPENSER: {
        name: 'Tape Dispenser',
        width: 24,
        height: 20,
        health: 5,
        damage: 5,
        speed: 0.5,
        behavior: 'stationary',
        projectile: 'tape',
        score: 250
    },
    FILE_CABINET: {
        name: 'File Cabinet',
        width: 32,
        height: 48,
        health: 20,
        damage: 20,
        speed: 0,
        behavior: 'miniboss',
        projectile: 'drawer',
        score: 1000
    },
    PHOTOCOPIER: {
        name: 'Copier 3000',
        width: 44,
        height: 40,
        health: 28,
        damage: 18,
        speed: 0,
        behavior: 'photocopier_boss',
        projectile: 'paper',
        score: 1500
    },
    SWIVEL_CHAIR: {
        name: 'Swivel Chair',
        width: 20,
        height: 24,
        health: 4,
        damage: 15,
        speed: 1.2,
        behavior: 'charge',
        projectile: null,
        score: 250
    },
    HIGHLIGHTER: {
        name: 'Highlighter',
        width: 18,
        height: 14,
        health: 2,
        damage: 8,
        speed: 0.8,
        behavior: 'hover_sniper',
        projectile: 'beam',
        score: 200
    },
    SHREDDER: {
        name: 'Mega-Shredder',
        width: 40,
        height: 44,
        health: 32,
        damage: 20,
        speed: 0,
        behavior: 'shredder_boss',
        projectile: 'blade',
        score: 2500
    },
    CTRL_ALT_DEL: {
        name: 'Ctrl-Alt-Del',
        width: 56,
        height: 56,
        health: 50,
        damage: 22,
        speed: 0,
        behavior: 'ctrl_alt_del_boss',
        projectile: 'data',
        score: 5000
    },
    BALLMER: {
        name: 'CEO Ballmer',
        width: 36,
        height: 56,
        health: 70,
        damage: 24,
        speed: 1.4,
        behavior: 'ballmer_boss',
        projectile: 'coffee',
        score: 9999
    },
    BILL_GATES: {
        name: 'The Founder',
        width: 32,
        height: 52,
        health: 100,
        damage: 28,
        speed: 0.4,
        behavior: 'bill_gates_boss',
        projectile: 'dollar',
        score: 25000
    },
    CLIPPY_2: {
        name: 'Clippy 2.0',
        width: 36,
        height: 56,
        health: 120,
        damage: 30,
        speed: 1.2,
        behavior: 'clippy2_boss',
        projectile: 'corporate',
        score: 50000
    },
    ALGORITHM: {
        name: 'The Algorithm',
        width: 48,
        height: 48,
        health: 140,
        damage: 32,
        speed: 0,
        behavior: 'algorithm_boss',
        projectile: 'data',
        score: 75000
    }
};

// Tile types for level
const TILE = {
    EMPTY: 0,
    SOLID: 1,
    PLATFORM: 2,      // Can jump through from below
    LADDER: 3,
    VINE: 4,
    WATER: 5,
    SPIKES: 6,
    COVER_SPOT: 7,    // Doorway/cave for hiding
    DESTRUCTIBLE: 8
};

// Parallax layer speeds (relative to camera)
const PARALLAX = {
    SKY: 0.1,
    FAR_MOUNTAINS: 0.2,
    NEAR_MOUNTAINS: 0.4,
    FAR_TREES: 0.6,
    NEAR_TREES: 0.8,
    FOREGROUND: 1.2
};

// Colors (SNES palette style)
const COLORS = {
    SKY_TOP: '#1a1a40',
    SKY_BOTTOM: '#2d4a6e',
    GROUND: '#4a3728',
    GRASS: '#2d5a1e',
    WATER: '#1e4a6e',
    CLIPPY_BODY: '#a0a0b0',
    CLIPPY_EYES: '#ffffff',
    CLIPPY_OUTLINE: '#505060',
    HUD_BG: '#000000',
    HUD_HEALTH: '#00ff00',
    HUD_HEALTH_LOW: '#ff0000',
    HUD_TEXT: '#ffffff'
};

// Sound effects (to be loaded)
const SFX = {
    SHOOT: 'shoot.wav',
    JUMP: 'jump.wav',
    HURT: 'hurt.wav',
    DEATH: 'death.wav',
    POWERUP: 'powerup.wav',
    ENEMY_HIT: 'enemy_hit.wav',
    ENEMY_DEATH: 'enemy_death.wav',
    COVER_ENTER: 'cover_enter.wav',
    COVER_EXIT: 'cover_exit.wav'
};

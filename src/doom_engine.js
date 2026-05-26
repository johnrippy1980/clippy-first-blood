// R423: Doom-style free-roam first-person raycaster. SNES-resolution
// (256×224) so it slots into the existing scene pipeline alongside the
// platformer / fps-arena / beat-em-up engines. No WebGL, no build step —
// pure vertical-column raycasting on a 2D tile grid (Wolfenstein 3D era).
//
// Phase 1 (R423a, this file): movement + walls + ceiling/floor + minimap.
// Painted wall textures, enemies-as-billboards, gun HUD, and pickups land
// in follow-up phases.

import { GAME } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { sprites } from './sprites.js';
import { drawText, drawTextOutlined } from './pixelfont.js';

const W = GAME.W;
const H = GAME.H;
const HUD_H = 32;
const VIEW_H = H - HUD_H;
const NUM_COLS = W;                 // one ray per pixel column
const FOV = Math.PI / 3;            // 60° — matches Doom 1
const MOVE_SPEED = 0.06;            // tiles per frame
const STRAFE_SPEED = 0.05;
const TURN_SPEED = 0.045;           // radians per frame

// Wall palette per tile id — flat colors for phase 1 so we can verify the
// raycaster math before sinking painted textures into it. ids 1+ are solid.
//   1 = cubicle divider (grey carpet)
//   2 = exec wall (dark wood)
//   3 = server-room glass (cyan)
//   4 = bathroom tile (white)
//   5 = vending machine (red)
const WALL_LIGHT = {
    1: { ns: '#7a7a82', ew: '#5e5e66' },   // cubicle
    2: { ns: '#624028', ew: '#4a2e1a' },   // exec
    3: { ns: '#5090b0', ew: '#3a7090' },   // glass
    4: { ns: '#d0d0d8', ew: '#a8a8b0' },   // bathroom
    5: { ns: '#c04030', ew: '#902820' },   // vending
    // R423e: door tiles. 10 = plain door (opens on touch), 12 = red-key,
    // 13 = yellow-key, 14 = blue-key. Doors stay solid until opened; once
    // opened, the engine deletes them from the map. Switches (20) flip
    // adjacent doors. Exit pad (30) is a non-solid trigger.
    10: { ns: '#806040', ew: '#604030', kind: 'door' },
    12: { ns: '#c02020', ew: '#902020', kind: 'doorKey', key: 'red' },
    13: { ns: '#c0c020', ew: '#909020', kind: 'doorKey', key: 'yellow' },
    14: { ns: '#2080c0', ew: '#205090', kind: 'doorKey', key: 'blue' },
    20: { ns: '#404068', ew: '#282844', kind: 'switch' },
    30: { ns: '#50ff70', ew: '#208040', kind: 'exit', soft: true },
};
// Soft = walk-through (non-solid). Exit pad qualifies; doors don't.
function isSolidTile(id, openedDoors) {
    if (!id) return false;
    if (openedDoors && openedDoors.has(id + '_open')) return false;
    const info = WALL_LIGHT[id];
    if (!info) return id > 0;   // unknown id treated as wall
    return !info.soft;
}

// Default test map — 16×16 grid, walls around the edges plus a few inner
// dividers so movement + collision are clear from the get-go.
const DEFAULT_MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,1,1,0,0,0,0,2,2,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,2,0,0,1],
    [1,0,0,1,0,0,0,3,3,0,0,0,0,0,0,1],
    [1,0,0,1,0,0,0,0,0,0,0,5,0,0,0,1],
    [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,4,4,4,4,0,0,0,0,0,1],
    [1,0,0,0,0,0,4,0,0,4,0,0,2,2,0,1],
    [1,0,0,0,0,0,4,0,0,0,0,0,2,0,0,1],
    [1,0,0,0,0,0,4,4,4,4,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,1,1,0,0,0,3,3,0,0,0,0,0,1],
    [1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

export class DoomEngine {
    constructor(stageData, ctx, game) {
        this.ctx = ctx;
        this.game = game;
        this.data = stageData;
        this.t = 0;

        this.map = stageData.doomMap || DEFAULT_MAP;
        this.mapW = this.map[0].length;
        this.mapH = this.map.length;

        // Find a starting empty tile in the middle area
        let startX = 2.5, startY = 2.5;
        if (stageData.doomStart) {
            startX = stageData.doomStart.x;
            startY = stageData.doomStart.y;
        }
        // Player state (in tile coordinates; angle in radians)
        this.player = {
            x: startX,
            y: startY,
            angle: 0,
            hp: 6,
            maxHp: 6,
            lives: 3,
            iframes: 0,
            score: 0,
            // R418: rage parity with the other engines
            rageFrames: 0,
            rageMaxFrames: 300,
            rageUsedThisStage: false,
            // R423b: weapon inventory. mg/shotgun/chainsaw/bfg. Only mg owned
            // at spawn; pickups grant the others. weaponIdx is the active slot.
            weapons: {
                mg:       { owned: true,  cooldown: 0, rate: 4,  ammo: Infinity, name: 'MG' },
                shotgun:  { owned: false, cooldown: 0, rate: 28, ammo: 0,        name: 'SHOTGUN' },
                chainsaw: { owned: false, cooldown: 0, rate: 6,  ammo: Infinity, name: 'CHAINSAW' },
                bfg:      { owned: false, cooldown: 0, rate: 90, ammo: 0,        name: 'BFG' },
            },
            weaponIdx: 0,   // 0=mg, 1=shotgun, 2=chainsaw, 3=bfg
            muzzleFlash: 0, // counts down; > 0 = draw flash overlay
        };

        // Z-buffer per column for sprite occlusion.
        this.zbuffer = new Float32Array(NUM_COLS);

        // R423e: door state. doorsOpened = Set of "x,y" strings for tiles
        // that have been opened (the engine treats them as empty afterward).
        // keys = Set of {'red','yellow','blue'} collected.
        // entities = pickups + enemies + boss, each {x,y,kind,...}.
        this.doorsOpened = new Set();
        this.keys = new Set();
        this.entities = [];
        this.bullets = [];
        // Spawn entities from stage data (clones, keys, pickups, boss).
        const spawns = stageData.doomEntities || [];
        for (const s of spawns) this.entities.push(Object.assign({ alive: true }, s));
        this.bossKind = stageData.doomBoss || null;
        this._levelCleared = false;
        this._exitT = 0;
        // Use-action edge detector for door interaction (R423e). The 'jump'
        // action is reused as "USE" since Doom-2 binds Use to space; here
        // space = jump in the global keymap.
        this._useEdge = false;

        // R423b: click-to-lock-mouse. Listener installed once; the engine
        // owns the canvas listener so other scenes aren't affected (the
        // pointer is auto-released on scene change).
        this._installPointerLockOnce();
    }

    _installPointerLockOnce() {
        if (typeof document === 'undefined') return;
        if (DoomEngine._lockListenerInstalled) return;
        const canvas = document.getElementById('screen');
        if (!canvas) return;
        canvas.addEventListener('click', () => {
            // Only request when a Doom scene is the active engine; cheap
            // guard so we don't capture pointer in other scenes.
            const g = (typeof window !== 'undefined') ? window.__game : null;
            if (g && g._doomEngine && g.scene === 'doomPlay') {
                input.requestPointerLock?.();
            }
        });
        DoomEngine._lockListenerInstalled = true;
    }

    update() {
        // R420 parity — hitstop / slow-mo for boss kills
        if (this._hitStopFrames > 0) { this._hitStopFrames--; return; }
        if (this._slowMoFrames > 0) {
            this._slowMoFrames--;
            this._slowMoSkip = !this._slowMoSkip;
            if (this._slowMoSkip) return;
        }
        this.t++;
        this._tickPlayer();
    }

    _tickPlayer() {
        const ax = input.axis();
        const p = this.player;
        const rageMul = p.rageFrames > 0 ? 1.5 : 1;
        // R423b: modern Doom controls.
        //  W/S = forward/back (axis.y, negative = up = forward)
        //  A/D = STRAFE left/right (axis.x)
        //  Mouse X = turn (yaw)
        // Mouse-look — consume delta. Scaled so a slow drag turns naturally.
        const md = input.getMouseDelta?.() || { dx: 0, dy: 0 };
        if (md.dx) p.angle += md.dx * 0.0035 * rageMul;
        // Forward/back (along view vector)
        if (Math.abs(ax.y) > 0.1) {
            const sp = MOVE_SPEED * rageMul * (ax.y < 0 ? 1 : -0.7);
            this._moveBy(Math.cos(p.angle) * sp, Math.sin(p.angle) * sp);
        }
        // Strafe (perpendicular to view vector)
        if (Math.abs(ax.x) > 0.1) {
            const sp = STRAFE_SPEED * rageMul * (ax.x > 0 ? 1 : -1);
            // Right perpendicular = (cos(a+90°), sin(a+90°)) = (-sin a, cos a)
            this._moveBy(-Math.sin(p.angle) * sp, Math.cos(p.angle) * sp);
        }
        // Weapon switching: 1/2/3/4 keys mapped via raw event listener
        // (input.js doesn't have these in KEYMAP). Check window event flags.
        this._pollWeaponSwitch();
        // Fire on shoot held (cooldown gated)
        const w = this._activeWeapon();
        if (w.cooldown > 0) w.cooldown--;
        if (input.isHeld?.('shoot') && w.cooldown <= 0 && w.owned && (w.ammo > 0 || w.ammo === Infinity)) {
            this._fire();
        }
        if (p.muzzleFlash > 0) p.muzzleFlash--;
        if (p.rageFrames > 0) p.rageFrames--;
        if (p.iframes > 0) p.iframes--;
        // R423e: USE (Space/jump) — try to open a door / hit a switch
        if (input.isPressed?.('jump') && !this._useEdge) {
            this._useEdge = true;
            this._tryUse();
        } else if (!input.isHeld?.('jump')) {
            this._useEdge = false;
        }
        // R423e: tick entities (pickups, enemies, bullets, floaters)
        this._tickEntities();
        this._tickBullets();
        // Check exit pad
        if (this._onExitPad() && !this._levelCleared) {
            this._levelCleared = true;
            this._exitT = 0;
            audio.sfx?.('powerup');
        }
        if (this._levelCleared) {
            this._exitT++;
            if (this._exitT > 90) {
                // Trigger stage clear via the game's stageClear path
                const game = (typeof window !== 'undefined') ? window.__game : null;
                if (game) {
                    // Mark stage cleared so existing chain logic fires
                    game._stageClearReason = 'doomExit';
                    game._fadeTo('stageClear');
                    this._levelCleared = false;   // don't refire
                }
            }
        }
    }

    _onExitPad() {
        const mx = Math.floor(this.player.x);
        const my = Math.floor(this.player.y);
        if (mx < 0 || my < 0 || mx >= this.mapW || my >= this.mapH) return false;
        return this.map[my][mx] === 30;
    }

    _tickEntities() {
        const p = this.player;
        for (const e of this.entities) {
            if (!e.alive) continue;
            if (e.kind === 'floater') {
                e.life--;
                if (e.life <= 0) e.alive = false;
                continue;
            }
            // Pickup: collide with player within 0.6 tiles
            if (e.kind === 'key' || e.kind === 'ammo' || e.kind === 'health' || e.kind === 'weapon') {
                const d = Math.hypot(e.x - p.x, e.y - p.y);
                if (d < 0.6) {
                    this._applyPickup(e);
                    e.alive = false;
                }
                continue;
            }
            // Enemy AI: chase player, shoot if line-of-sight + in range
            if (e.kind === 'clone' || e.kind === 'boss') {
                this._tickEnemy(e);
            }
        }
        // Compact dead entities occasionally
        if (this.t % 60 === 0) {
            this.entities = this.entities.filter(e => e.alive);
        }
    }

    _applyPickup(e) {
        const p = this.player;
        if (e.kind === 'key') {
            this.keys.add(e.color);
            audio.sfx?.('powerup');
            this._floatText(`+ ${e.color.toUpperCase()} KEYCARD`, p.x, p.y);
        } else if (e.kind === 'health') {
            p.hp = Math.min(p.maxHp, p.hp + (e.amount || 2));
            audio.sfx?.('pickup');
            this._floatText(`+${e.amount || 2} HP`, p.x, p.y);
        } else if (e.kind === 'ammo') {
            const target = e.weapon || 'shotgun';
            const w = p.weapons[target];
            if (w) {
                w.ammo = (w.ammo === Infinity ? Infinity : (w.ammo || 0) + (e.amount || 8));
                audio.sfx?.('pickup');
                this._floatText(`+${e.amount || 8} ${target.toUpperCase()}`, p.x, p.y);
            }
        } else if (e.kind === 'weapon') {
            const target = e.weapon;
            if (target && p.weapons[target]) {
                const w = p.weapons[target];
                w.owned = true;
                if (w.ammo !== Infinity && w.ammo < (e.amount || 12)) w.ammo = (e.amount || 12);
                // Auto-switch to new weapon
                const keys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
                p.weaponIdx = keys.indexOf(target);
                audio.sfx?.('powerup');
                this._floatText(`GOT ${w.name}!`, p.x, p.y);
                // Big screen flash for weapon pickup
                const game = (typeof window !== 'undefined') ? window.__game : null;
                game?.triggerScreenFlash?.(10, '#ffe070', 0.45);
            }
        }
    }

    _tickEnemy(e) {
        const p = this.player;
        if (e.hp == null) e.hp = (e.kind === 'boss') ? 30 : 4;
        if (e.fireCD == null) e.fireCD = 60 + (Math.random() * 60) | 0;
        if (e.hitFlash == null) e.hitFlash = 0;
        if (e.hitFlash > 0) e.hitFlash--;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        // Chase if 3-12 tiles away
        if (dist > 0.8 && dist < 12) {
            const sp = (e.kind === 'boss') ? 0.022 : 0.018;
            const nx = e.x + (dx / dist) * sp;
            const ny = e.y + (dy / dist) * sp;
            // Tile-aware: don't walk through walls
            if (!this._solidAt(nx, e.y)) e.x = nx;
            if (!this._solidAt(e.x, ny)) e.y = ny;
        }
        // Shoot at player if in range + line of sight (raycast quick check)
        e.fireCD--;
        if (e.fireCD <= 0 && dist < 8 && this._hasLOS(e.x, e.y, p.x, p.y)) {
            this.bullets.push({
                x: e.x, y: e.y,
                vx: (dx / dist) * 0.12,
                vy: (dy / dist) * 0.12,
                life: 80,
                fromEnemy: true,
                dmg: (e.kind === 'boss') ? 2 : 1,
            });
            e.fireCD = (e.kind === 'boss') ? 30 : (80 + Math.random() * 40) | 0;
            audio.sfx?.('shoot');
        }
    }

    _hasLOS(x1, y1, x2, y2) {
        // Simple stepped LOS — sample 12 points between the two
        const steps = 12;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const sx = x1 + (x2 - x1) * t;
            const sy = y1 + (y2 - y1) * t;
            if (this._solidAt(sx, sy)) return false;
        }
        return true;
    }

    _tickBullets() {
        const p = this.player;
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
            if (b.life <= 0 || this._solidAt(b.x, b.y)) {
                this.bullets.splice(i, 1);
                continue;
            }
            if (b.fromEnemy) {
                // Hit player?
                const d = Math.hypot(b.x - p.x, b.y - p.y);
                if (d < 0.4 && p.iframes <= 0) {
                    this._damagePlayer(b.dmg || 1);
                    this.bullets.splice(i, 1);
                }
            } else {
                // Hit enemy?
                for (const e of this.entities) {
                    if (!e.alive || (e.kind !== 'clone' && e.kind !== 'boss')) continue;
                    const d = Math.hypot(b.x - e.x, b.y - e.y);
                    const hitRadius = (e.kind === 'boss') ? 0.6 : 0.4;
                    if (d < hitRadius) {
                        e.hp = (e.hp || 4) - (b.dmg || 1);
                        e.hitFlash = 6;
                        this.bullets.splice(i, 1);
                        if (e.hp <= 0) {
                            e.alive = false;
                            audio.sfx?.('enemyDie');
                            this.player.score += (e.kind === 'boss') ? 5000 : 100;
                            if (e.kind === 'boss') this._onBossKill(e);
                        }
                        break;
                    }
                }
            }
        }
    }

    _damagePlayer(dmg) {
        const p = this.player;
        // R418 rage parity — rage blocks damage
        if (p.rageFrames > 0) {
            p.iframes = Math.max(p.iframes, 12);
            return;
        }
        p.hp -= dmg;
        p.iframes = 60;
        audio.sfx?.('playerHit');
        if (p.hp <= 0) this._onPlayerDeath();
        else if (p.hp <= 1 && !p.rageUsedThisStage) this._triggerRage();
    }

    _triggerRage() {
        const p = this.player;
        p.rageFrames = p.rageMaxFrames;
        p.rageUsedThisStage = true;
        audio.sfx?.('powerup');
        audio.sfx?.('explosion');
        this._floatText('RAGE!!', p.x, p.y);
    }

    _onPlayerDeath() {
        const p = this.player;
        p.lives--;
        if (p.lives < 0) {
            const game = (typeof window !== 'undefined') ? window.__game : null;
            game?._fadeTo?.('gameOver');
            return;
        }
        // Respawn at start
        p.x = this.data.doomStart?.x || 2.5;
        p.y = this.data.doomStart?.y || 2.5;
        p.hp = p.maxHp;
        p.iframes = 120;
    }

    _onBossKill(boss) {
        // R420 parity — hitstop + slow-mo + screen flash on boss kill
        this._hitStopFrames = 12;
        this._slowMoFrames = 60;
        const game = (typeof window !== 'undefined') ? window.__game : null;
        game?.triggerScreenFlash?.(10, '#ffe070', 0.55);
        game?.camera?.shake?.(8);
        // Spawn the exit pad in the boss room (boss data may include exitAt)
        if (this.data.exitAt) {
            const { x, y } = this.data.exitAt;
            if (this.map[y] && this.map[y][x] != null) this.map[y][x] = 30;
        }
        this._floatText('BOSS DOWN', boss.x, boss.y);
    }

    _activeWeapon() {
        const keys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
        return this.player.weapons[keys[this.player.weaponIdx]];
    }

    _pollWeaponSwitch() {
        // Install one-time number-key listener that flags a pending switch.
        if (!this._numListener) {
            this._numListener = true;
            this._pendingSwitch = null;
            window.addEventListener('keydown', (e) => {
                if (e.key === '1') this._pendingSwitch = 0;
                else if (e.key === '2') this._pendingSwitch = 1;
                else if (e.key === '3') this._pendingSwitch = 2;
                else if (e.key === '4') this._pendingSwitch = 3;
            });
        }
        if (this._pendingSwitch != null) {
            const keys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
            const w = this.player.weapons[keys[this._pendingSwitch]];
            if (w && w.owned) {
                this.player.weaponIdx = this._pendingSwitch;
                audio.sfx?.('select');
            }
            this._pendingSwitch = null;
        }
    }

    _fire() {
        const p = this.player;
        const w = this._activeWeapon();
        w.cooldown = w.rate;
        if (w.ammo !== Infinity) w.ammo--;
        p.muzzleFlash = 5;
        // Per-weapon SFX cue. Painted gun art will replace these flat
        // beats later; for now the audio carries the differentiation.
        if (w === p.weapons.mg)       audio.sfx?.('mg');
        else if (w === p.weapons.shotgun)  audio.sfx?.('explode');
        else if (w === p.weapons.chainsaw) audio.sfx?.('hit');
        else if (w === p.weapons.bfg)      audio.sfx?.('powerup');
        // R423e: spawn projectile(s) per weapon
        // MG: 1 bullet, fast, 1 dmg
        // Shotgun: 5 pellets in a spread, 1 dmg each (5 max if all connect)
        // Chainsaw: short-range melee hitscan (single ray, 2 dmg, 1 tile reach)
        // BFG: huge slow projectile, 12 dmg, splash later
        const fx = Math.cos(p.angle);
        const fy = Math.sin(p.angle);
        if (w === p.weapons.mg) {
            this.bullets.push({ x: p.x + fx * 0.3, y: p.y + fy * 0.3, vx: fx * 0.25, vy: fy * 0.25, life: 80, dmg: 1 });
        } else if (w === p.weapons.shotgun) {
            for (let i = -2; i <= 2; i++) {
                const ang = p.angle + i * 0.06;
                this.bullets.push({ x: p.x + fx * 0.3, y: p.y + fy * 0.3, vx: Math.cos(ang) * 0.28, vy: Math.sin(ang) * 0.28, life: 50, dmg: 1 });
            }
        } else if (w === p.weapons.chainsaw) {
            // Melee — hitscan at 1.2 tiles
            const reach = 1.2;
            const tx = p.x + fx * reach;
            const ty = p.y + fy * reach;
            for (const e of this.entities) {
                if (!e.alive || (e.kind !== 'clone' && e.kind !== 'boss')) continue;
                if (Math.hypot(e.x - tx, e.y - ty) < 0.7) {
                    e.hp = (e.hp || 4) - 2;
                    e.hitFlash = 6;
                    if (e.hp <= 0) {
                        e.alive = false;
                        audio.sfx?.('enemyDie');
                        p.score += (e.kind === 'boss') ? 5000 : 100;
                        if (e.kind === 'boss') this._onBossKill(e);
                    }
                    break;
                }
            }
        } else if (w === p.weapons.bfg) {
            this.bullets.push({ x: p.x + fx * 0.3, y: p.y + fy * 0.3, vx: fx * 0.18, vy: fy * 0.18, life: 200, dmg: 12, isBFG: true });
        }
    }

    _moveBy(dx, dy) {
        const p = this.player;
        const PAD = 0.18;
        // X axis
        const nx = p.x + dx;
        const checkX = nx + (dx > 0 ? PAD : -PAD);
        if (!this._solidAt(checkX, p.y)) p.x = nx;
        // Y axis
        const ny = p.y + dy;
        const checkY = ny + (dy > 0 ? PAD : -PAD);
        if (!this._solidAt(p.x, checkY)) p.y = ny;
    }

    _solidAt(x, y) {
        const mx = Math.floor(x);
        const my = Math.floor(y);
        if (mx < 0 || my < 0 || mx >= this.mapW || my >= this.mapH) return true;
        const id = this.map[my][mx] || 0;
        if (!id) return false;
        if (this.doorsOpened.has(`${mx},${my}`)) return false;
        const info = WALL_LIGHT[id];
        if (info && info.soft) return false;   // exit pad walkable
        return true;
    }

    // R423e: USE — try to open a door in front of the player. Range = 1 tile.
    // Plain doors open immediately; keyed doors need the matching key.
    _tryUse() {
        const p = this.player;
        const reach = 1.0;
        const tx = p.x + Math.cos(p.angle) * reach;
        const ty = p.y + Math.sin(p.angle) * reach;
        const mx = Math.floor(tx);
        const my = Math.floor(ty);
        if (mx < 0 || my < 0 || mx >= this.mapW || my >= this.mapH) return;
        const id = this.map[my][mx];
        const info = WALL_LIGHT[id];
        if (!info) return;
        if (info.kind === 'door') {
            this.doorsOpened.add(`${mx},${my}`);
            audio.sfx?.('select');
        } else if (info.kind === 'doorKey') {
            if (this.keys.has(info.key)) {
                this.doorsOpened.add(`${mx},${my}`);
                audio.sfx?.('powerup');
                this._floatText(`${info.key.toUpperCase()} DOOR UNLOCKED`, p.x, p.y);
            } else {
                audio.sfx?.('hit');
                this._floatText(`NEED ${info.key.toUpperCase()} KEYCARD`, p.x, p.y);
            }
        } else if (info.kind === 'switch') {
            // Open all switch-flagged doors in the level (simple toggle —
            // each switch fires once)
            if (!this.doorsOpened.has(`switch_${mx},${my}`)) {
                this.doorsOpened.add(`switch_${mx},${my}`);
                // Open all 'door' tiles that have switchTriggered flag — for
                // simplicity, this implementation opens ALL plain doors so
                // a switch effectively unlocks paths.
                for (let y2 = 0; y2 < this.mapH; y2++) {
                    for (let x2 = 0; x2 < this.mapW; x2++) {
                        if (this.map[y2][x2] === 10) {
                            this.doorsOpened.add(`${x2},${y2}`);
                        }
                    }
                }
                audio.sfx?.('powerup');
                this._floatText('SWITCH ACTIVATED', p.x, p.y);
            }
        }
    }

    // Spawn an on-screen world-space text via the game's particles system.
    _floatText(text, wx, wy) {
        // World coords mapped to projected screen position later — for now
        // we attach floating-text to the entity list with a short life.
        this.entities.push({
            kind: 'floater',
            text, x: wx, y: wy, life: 60, maxLife: 60, alive: true,
        });
    }

    draw() {
        const ctx = this.ctx;
        // Sky/ceiling band — dim grey-blue to suggest fluorescent panels
        ctx.fillStyle = '#283040';
        ctx.fillRect(0, 0, W, VIEW_H / 2);
        // Floor band — commercial carpet brown
        ctx.fillStyle = '#3a2c20';
        ctx.fillRect(0, VIEW_H / 2, W, VIEW_H / 2);

        this._raycast();
        this._drawSprites();
        this._drawWeapon();
        this._drawHud();
        this._drawMinimap();
        // R423e: pickup/key floating text overlays — drawn world-space
        this._drawFloaters();
        // R423e: damage flash overlay
        if (this.player.iframes > 50) {
            const ctx = this.ctx;
            ctx.save();
            ctx.globalAlpha = (this.player.iframes - 50) / 10 * 0.4;
            ctx.fillStyle = '#ff2020';
            ctx.fillRect(0, 0, W, VIEW_H);
            ctx.restore();
        }
    }

    // R423e: billboard sprite renderer. Sorts entities back-to-front by
    // distance, projects each onto the camera plane, scales by depth, and
    // clips per-column against the z-buffer so walls properly occlude.
    _drawSprites() {
        const ctx = this.ctx;
        const p = this.player;
        // Collect drawable sprite entities + bullets
        const drawable = [];
        for (const e of this.entities) {
            if (!e.alive) continue;
            if (e.kind === 'floater') continue;
            drawable.push(e);
        }
        for (const b of this.bullets) {
            drawable.push({ x: b.x, y: b.y, kind: 'bullet', _bullet: b });
        }
        // Sort back-to-front for painter's algorithm
        drawable.sort((a, b) => {
            const da = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
            const db = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
            return db - da;
        });
        for (const e of drawable) this._drawSprite(e);
    }

    _drawSprite(e) {
        const ctx = this.ctx;
        const p = this.player;
        // Translate sprite to camera space
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        // Inverse camera matrix: forward = (cos a, sin a), right = (-sin a, cos a)
        // Use a unit camera plane (the half-FOV scaling lives in the H multiplier
        // for screen X below — keeps perspective consistent with the raycaster's
        // own column-to-angle mapping).
        const ca = Math.cos(-p.angle);
        const sa = Math.sin(-p.angle);
        // After rotating so forward = +x: transformed coords
        const tx = dx * ca - dy * sa;     // forward distance
        const ty = dx * sa + dy * ca;     // lateral offset
        if (tx <= 0.05) return;            // behind camera
        // Screen X from lateral / forward, using same FOV as raycaster
        const halfFov = FOV / 2;
        const camPlane = Math.tan(halfFov);
        const screenX = (W / 2) * (1 + (ty / tx) / camPlane);
        const spriteH = Math.min(VIEW_H * 4, VIEW_H / tx);
        const spriteW = spriteH * (e.kind === 'bullet' ? 0.2 : 1);
        const drawY = (VIEW_H - spriteH) / 2;
        const drawX = screenX - spriteW / 2;
        // Per-column z-buffer occlusion
        const startX = Math.max(0, drawX | 0);
        const endX = Math.min(NUM_COLS - 1, (drawX + spriteW) | 0);
        // Distance fade
        const fade = Math.max(0.3, 1 - tx / 10);
        let baseColor, accentColor;
        if (e.kind === 'bullet') {
            baseColor = e._bullet?.fromEnemy ? '#ff8060' : '#ffe070';
            accentColor = '#ffffff';
        } else if (e.kind === 'clone') {
            baseColor = e.hitFlash > 0 ? '#ffffff' : '#909098';
            accentColor = e.hitFlash > 0 ? '#ffffff' : '#ff3030';
        } else if (e.kind === 'boss') {
            baseColor = e.hitFlash > 0 ? '#ffffff' : '#d8d8e0';
            accentColor = e.hitFlash > 0 ? '#ffffff' : '#c04030';
        } else if (e.kind === 'key') {
            baseColor = e.color === 'red' ? '#c02020' :
                        e.color === 'yellow' ? '#c0c020' :
                        e.color === 'blue' ? '#2080c0' : '#c0c0c0';
            accentColor = '#ffffff';
        } else if (e.kind === 'health') {
            baseColor = '#40c050';
            accentColor = '#ffffff';
        } else if (e.kind === 'ammo') {
            baseColor = '#c0a040';
            accentColor = '#ffe070';
        } else if (e.kind === 'weapon') {
            baseColor = '#a0a0a8';
            accentColor = '#ffe070';
        } else return;
        // Painted sprite key lookup — added in the texture-load step. For
        // now we draw vector blocks so the engine is testable before art lands.
        const spriteImg = this._getSpriteFor(e);
        if (spriteImg && this._fadeReady(spriteImg)) {
            // Draw painted sprite column-by-column, respecting zbuffer
            const iw = spriteImg.width;
            for (let sx = startX; sx <= endX; sx++) {
                if (this.zbuffer[sx] < tx) continue;
                const u = ((sx - drawX) / spriteW) * iw | 0;
                if (u < 0 || u >= iw) continue;
                ctx.drawImage(
                    spriteImg,
                    u, 0, 1, spriteImg.height,
                    sx, drawY, 1, spriteH,
                );
            }
            // Hit-flash overlay
            if (e.hitFlash > 0) {
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = '#ffffff';
                for (let sx = startX; sx <= endX; sx++) {
                    if (this.zbuffer[sx] < tx) continue;
                    ctx.fillRect(sx, drawY, 1, spriteH);
                }
                ctx.restore();
            }
            return;
        }
        // Vector fallback — rectangle billboard
        ctx.save();
        ctx.globalAlpha = fade;
        for (let sx = startX; sx <= endX; sx++) {
            if (this.zbuffer[sx] < tx) continue;
            ctx.fillStyle = baseColor;
            ctx.fillRect(sx, drawY, 1, spriteH);
        }
        // Accent stripe (eyes / detail) — center band
        const bandY = drawY + spriteH * 0.25 | 0;
        const bandH = Math.max(1, spriteH * 0.1 | 0);
        ctx.fillStyle = accentColor;
        for (let sx = startX; sx <= endX; sx++) {
            if (this.zbuffer[sx] < tx) continue;
            ctx.fillRect(sx, bandY, 1, bandH);
        }
        ctx.restore();
    }

    _getSpriteFor(e) {
        if (!sprites || !sprites.images) return null;
        if (e.kind === 'clone') return sprites.images.get('doom_clone');
        if (e.kind === 'boss') {
            if (this.bossKind === 'SPINDLER_UZIS') return sprites.images.get('doom_boss_spindler_uzis');
            if (this.bossKind === 'SPINDLER_WHEELCHAIR') return sprites.images.get('doom_boss_spindler_wheelchair');
        }
        if (e.kind === 'key') return sprites.images.get(`doom_key_${e.color}`);
        if (e.kind === 'health') return sprites.images.get('doom_health');
        if (e.kind === 'ammo') return sprites.images.get('doom_ammo');
        if (e.kind === 'weapon') return sprites.images.get(`doom_pickup_${e.weapon}`);
        return null;
    }

    _fadeReady(img) {
        // Image element loaded check
        return img && img.complete && img.naturalWidth > 0;
    }

    _drawFloaters() {
        const ctx = this.ctx;
        const p = this.player;
        for (const e of this.entities) {
            if (!e.alive || e.kind !== 'floater') continue;
            // Project floater position to screen X (same as sprite)
            const dx = e.x - p.x;
            const dy = e.y - p.y;
            const ca = Math.cos(-p.angle);
            const sa = Math.sin(-p.angle);
            const tx = dx * ca - dy * sa;
            const ty = dx * sa + dy * ca;
            if (tx <= 0.05) continue;
            const camPlane = Math.tan(FOV / 2);
            const screenX = (W / 2) * (1 + (ty / tx) / camPlane);
            const screenY = VIEW_H / 2 - 20;
            const a = Math.min(1, e.life / 30);
            ctx.save();
            ctx.globalAlpha = a;
            drawText(ctx, e.text, screenX | 0, screenY, '#ffe070', 1, 'center');
            ctx.restore();
        }
    }

    // R423e: first-person weapon view. Painted HUD sprites swap in if loaded,
    // vector fallback retained for hot-load safety.
    _drawWeapon() {
        const ctx = this.ctx;
        const p = this.player;
        const w = this._activeWeapon();
        const keyMap = { mg: 'doom_weapon_mg', shotgun: 'doom_weapon_shotgun',
                         chainsaw: 'doom_weapon_chainsaw', bfg: 'doom_weapon_bfg' };
        const wKeys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
        const sprKey = keyMap[wKeys[p.weaponIdx]];
        const img = sprKey && sprites.images?.get(sprKey);
        const baseY = VIEW_H - 4;
        // Recoil bob — when firing, weapon dips down a few pixels
        const recoil = p.muzzleFlash > 0 ? (p.muzzleFlash * 1.5) | 0 : 0;
        if (img && img.complete && img.naturalWidth > 0) {
            const hudH = Math.min(128, VIEW_H);
            const hudW = (img.width / img.height) * hudH;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, (W - hudW) / 2 | 0, baseY - hudH + recoil, hudW | 0, hudH | 0);
            ctx.restore();
        } else {
            // Vector fallback
            ctx.save();
            ctx.fillStyle = '#181820';
            if (w === p.weapons.mg) {
                ctx.fillRect(W / 2 - 22, baseY - 18 + recoil, 44, 18);
                ctx.fillStyle = '#404048';
                ctx.fillRect(W / 2 - 4, baseY - 30 + recoil, 8, 16);
            } else if (w === p.weapons.shotgun) {
                ctx.fillRect(W / 2 - 26, baseY - 22 + recoil, 52, 22);
                ctx.fillStyle = '#5e2818';
                ctx.fillRect(W / 2 - 26, baseY - 8 + recoil, 52, 8);
                ctx.fillStyle = '#202028';
                ctx.fillRect(W / 2 - 6, baseY - 34 + recoil, 12, 14);
            } else if (w === p.weapons.chainsaw) {
                ctx.fillRect(W / 2 - 16, baseY - 28 + recoil, 32, 28);
                ctx.fillStyle = '#a0a0a8';
                ctx.fillRect(W / 2 - 4, baseY - 56 + recoil, 8, 28);
                ctx.fillStyle = '#ffe070';
                for (let i = 0; i < 7; i++) {
                    ctx.fillRect(W / 2 - 5, baseY - 54 + recoil + i * 4, 2, 2);
                    ctx.fillRect(W / 2 + 3, baseY - 54 + recoil + i * 4, 2, 2);
                }
            } else if (w === p.weapons.bfg) {
                ctx.fillRect(W / 2 - 32, baseY - 30 + recoil, 64, 30);
                ctx.fillStyle = '#206030';
                ctx.fillRect(W / 2 - 12, baseY - 44 + recoil, 24, 18);
                ctx.fillStyle = '#80ff80';
                ctx.fillRect(W / 2 - 6, baseY - 38 + recoil, 12, 8);
            }
            ctx.restore();
        }
        // Muzzle flash — radial white-yellow burst at barrel tip
        if (p.muzzleFlash > 0) {
            const fT = p.muzzleFlash / 5;
            const fx = W / 2;
            const fy = (w === p.weapons.bfg) ? baseY - 36 :
                       (w === p.weapons.shotgun) ? baseY - 30 :
                       (w === p.weapons.chainsaw) ? baseY - 50 :
                       baseY - 24;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.85 * fT;
            const r = 18 * fT + 4;
            const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
            grad.addColorStop(0, w === p.weapons.bfg ? '#a0ff80' : '#ffffff');
            grad.addColorStop(0.4, w === p.weapons.bfg ? '#50d040' : '#ffd060');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(fx, fy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    _raycast() {
        const ctx = this.ctx;
        const p = this.player;
        for (let col = 0; col < NUM_COLS; col++) {
            // Map column to camera plane x in [-1, 1]
            const cameraX = 2 * col / NUM_COLS - 1;
            const rayAngle = p.angle + cameraX * (FOV / 2);
            const rayDirX = Math.cos(rayAngle);
            const rayDirY = Math.sin(rayAngle);
            // DDA setup
            let mapX = Math.floor(p.x);
            let mapY = Math.floor(p.y);
            const deltaX = Math.abs(1 / (rayDirX || 1e-9));
            const deltaY = Math.abs(1 / (rayDirY || 1e-9));
            let stepX, stepY, sideX, sideY;
            if (rayDirX < 0) { stepX = -1; sideX = (p.x - mapX) * deltaX; }
            else             { stepX =  1; sideX = (mapX + 1 - p.x) * deltaX; }
            if (rayDirY < 0) { stepY = -1; sideY = (p.y - mapY) * deltaY; }
            else             { stepY =  1; sideY = (mapY + 1 - p.y) * deltaY; }
            // Step until we hit a wall
            let hit = 0;
            let side = 0;
            let cell = 0;
            for (let i = 0; i < 64; i++) {
                if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
                else               { sideY += deltaY; mapY += stepY; side = 1; }
                if (mapX < 0 || mapY < 0 || mapX >= this.mapW || mapY >= this.mapH) { hit = 1; cell = 1; break; }
                cell = this.map[mapY][mapX] || 0;
                if (cell > 0) { hit = 1; break; }
            }
            if (!hit) { this.zbuffer[col] = 999; continue; }
            // Perpendicular distance (avoids fisheye)
            const dist = (side === 0)
                ? (sideX - deltaX)
                : (sideY - deltaY);
            this.zbuffer[col] = dist;
            const lineH = Math.min(VIEW_H * 4, Math.abs(VIEW_H / Math.max(0.0001, dist)));
            const drawStart = Math.max(0, (VIEW_H - lineH) / 2 | 0);
            const drawEnd = Math.min(VIEW_H - 1, (VIEW_H + lineH) / 2 | 0);
            // R423e: try painted texture first. Each wall id 1..5 has a
            // doom_wall_N.png; if loaded, sample the column from it.
            // Doors (10,12,13,14) and switches/exit fall back to flat color.
            let tex = null;
            if (cell >= 1 && cell <= 5) {
                tex = sprites.images?.get(`doom_wall_${cell}`);
                if (tex && (!tex.complete || tex.naturalWidth === 0)) tex = null;
            }
            if (tex) {
                // Compute the hit position along the wall (0..1) for the U coord
                let wallX;
                if (side === 0) wallX = p.y + dist * rayDirY;
                else            wallX = p.x + dist * rayDirX;
                wallX -= Math.floor(wallX);
                let texX = (wallX * tex.width) | 0;
                // Mirror to match how DDA hits the wall on the back side.
                // Standard Lode/Wolf3D convention: flip when ray hits from
                // the side the texture would otherwise read backwards.
                if (side === 0 && rayDirX < 0) texX = tex.width - texX - 1;
                if (side === 1 && rayDirY > 0) texX = tex.width - texX - 1;
                // Distance fade: darken further-away walls by clipping alpha
                const fade = Math.max(0.35, 1 - dist / 9);
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                ctx.globalAlpha = 1;
                ctx.drawImage(tex,
                    texX, 0, 1, tex.height,
                    col, drawStart, 1, drawEnd - drawStart);
                // N/S walls slightly darker via overlay (Doom side shading)
                if (side === 1) {
                    ctx.globalAlpha = 0.35;
                    ctx.fillStyle = '#000';
                    ctx.fillRect(col, drawStart, 1, drawEnd - drawStart);
                }
                // Distance fog wash
                if (fade < 0.95) {
                    ctx.globalAlpha = (1 - fade) * 0.8;
                    ctx.fillStyle = '#0a0a14';
                    ctx.fillRect(col, drawStart, 1, drawEnd - drawStart);
                }
                ctx.restore();
                continue;
            }
            // Fallback: flat colored wall (doors, exits, missing textures)
            const pal = WALL_LIGHT[cell] || WALL_LIGHT[1];
            let col_color = (side === 1) ? pal.ew : pal.ns;
            // Distance fade — gets dim past ~6 tiles
            const fade = Math.max(0.25, 1 - dist / 8);
            col_color = this._tintHex(col_color, fade);
            ctx.fillStyle = col_color;
            ctx.fillRect(col, drawStart, 1, drawEnd - drawStart);
        }
    }

    // Multiply a #rrggbb hex by a 0..1 factor.
    _tintHex(hex, k) {
        const r = parseInt(hex.slice(1, 3), 16) * k | 0;
        const g = parseInt(hex.slice(3, 5), 16) * k | 0;
        const b = parseInt(hex.slice(5, 7), 16) * k | 0;
        return `rgb(${r},${g},${b})`;
    }

    _drawHud() {
        const ctx = this.ctx;
        const y = H - HUD_H;
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, y, W, HUD_H);
        ctx.fillStyle = '#404048';
        ctx.fillRect(0, y, W, 1);
        // HP bar bottom-left
        const p = this.player;
        for (let i = 0; i < p.maxHp; i++) {
            ctx.fillStyle = i < p.hp ? '#ff4040' : '#400808';
            ctx.fillRect(6 + i * 7, y + 6, 5, 8);
        }
        drawText(ctx, this.data.name || 'FLOOR 11', 6, y + 18, '#a0a0b0', 1, 'left');
        // R423e: collected key icons — squares in HP-bar row
        const keyX = 6 + p.maxHp * 7 + 6;
        let kx = keyX;
        for (const color of ['red', 'yellow', 'blue']) {
            if (this.keys.has(color)) {
                ctx.fillStyle = color === 'red' ? '#ff4040' : color === 'yellow' ? '#ffff40' : '#4080ff';
                ctx.fillRect(kx, y + 6, 6, 8);
                kx += 8;
            }
        }
        // Right side — active weapon + ammo
        const w = this._activeWeapon();
        const ammoStr = w.ammo === Infinity ? '∞' : String(w.ammo);
        drawText(ctx, `${w.name} ${ammoStr}`, W - 6, y + 8, '#ffe070', 1, 'right');
        // Weapon slots 1-4: dim = unowned, bright = owned, yellow = active
        const keys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
        for (let i = 0; i < 4; i++) {
            const w2 = this.player.weapons[keys[i]];
            const isActive = (this.player.weaponIdx === i);
            const col = isActive ? '#ffe070' : (w2.owned ? '#a0a0b8' : '#404048');
            drawText(ctx, String(i + 1), W - 96 + i * 22, y + 18, col, 1, 'left');
        }
    }

    _drawMinimap() {
        const ctx = this.ctx;
        const SIZE = 4;   // px per tile
        const ox = W - this.mapW * SIZE - 4;
        const oy = 4;
        // Background panel
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(ox - 2, oy - 2, this.mapW * SIZE + 4, this.mapH * SIZE + 4);
        for (let my = 0; my < this.mapH; my++) {
            for (let mx = 0; mx < this.mapW; mx++) {
                const cell = this.map[my][mx];
                if (cell > 0 && !this.doorsOpened.has(`${mx},${my}`)) {
                    ctx.fillStyle = (WALL_LIGHT[cell] || WALL_LIGHT[1]).ns;
                    ctx.fillRect(ox + mx * SIZE, oy + my * SIZE, SIZE, SIZE);
                }
            }
        }
        // Show enemies as red dots, pickups as colored dots
        for (const e of this.entities) {
            if (!e.alive) continue;
            let col = null;
            if (e.kind === 'clone') col = '#ff4040';
            else if (e.kind === 'boss') col = '#ff80ff';
            else if (e.kind === 'key') col = (e.color === 'red' ? '#ff4040' : e.color === 'yellow' ? '#ffff40' : '#4080ff');
            else if (e.kind === 'health') col = '#40c050';
            else if (e.kind === 'ammo') col = '#c0a040';
            else if (e.kind === 'weapon') col = '#a0a0a8';
            if (col) {
                ctx.fillStyle = col;
                ctx.fillRect(ox + e.x * SIZE - 1, oy + e.y * SIZE - 1, 2, 2);
            }
        }
        // Player dot + facing
        const p = this.player;
        const px = ox + p.x * SIZE;
        const py = oy + p.y * SIZE;
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(px - 1, py - 1, 2, 2);
        const tx = px + Math.cos(p.angle) * 5;
        const ty = py + Math.sin(p.angle) * 5;
        ctx.strokeStyle = '#ffe070';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();
    }
}

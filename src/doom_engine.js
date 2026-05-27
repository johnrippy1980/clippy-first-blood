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
import { achievements } from './achievements.js';

const W = GAME.W;
const H = GAME.H;
// R492: Doom-1 style HUD bar — taller (40px) to fit central face panel
// flanked by HP/ammo on left + keys/weapons on right, with bordered
// sub-panels.
const HUD_H = 40;
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
            kills: 0,         // R489: kill counter rolls into achievements
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

        // R442: level intro fly-through — spin the camera 360° at spawn
        // for ~4s before allowing input. Skippable with X / jump.
        this._introT = 240;        // ~4s at 60fps
        this._introStartAngle = this.player.angle;
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
        // R530: tick deferred floaters (replaces setTimeout from R437)
        if (this._deferredFloats && this._deferredFloats.length) {
            for (let i = this._deferredFloats.length - 1; i >= 0; i--) {
                const d = this._deferredFloats[i];
                d.t--;
                if (d.t <= 0) {
                    this._floatText(d.text, d.x, d.y);
                    this._deferredFloats.splice(i, 1);
                }
            }
        }
        // R442: level intro fly-through — spin camera + lock input
        if (this._introT > 0) {
            this._introT--;
            // 360° rotation over the intro duration
            const total = 240;
            const t = (total - this._introT) / total;
            this.player.angle = this._introStartAngle + t * Math.PI * 2;
            // Skip on input
            if (input.isPressed?.('shoot') || input.isPressed?.('jump') || input.isPressed?.('start')) {
                this._introT = 0;
                this.player.angle = this._introStartAngle;
            }
            return;   // skip player control during intro
        }
        this._tickPlayer();
        // R484: low-HP heartbeat at HP ≤ 1 — same cadence as platformer
        if (this.player.hp <= 1 && this.player.hp > 0) {
            this._hbTick = (this._hbTick || 0) + 1;
            if (this._hbTick >= 50) {   // ~0.83s between beats
                audio.sfx?.('heartbeat');
                this._hbTick = 0;
            }
        } else {
            this._hbTick = 0;
        }
        // R434: ambient atmosphere SFX — fluorescent buzz every 4s, drip every
        // ~3s on sewer levels, occasional distant clone snarl. Cheap atmospherics.
        if (this.t % 240 === 0) audio.sfx?.('fluorescent');
        const isSewer = this.data.theme === 'sewer';
        if (isSewer && this.t % 180 === 0) audio.sfx?.('splash');
        // Distant clone snarl: pick a random alive clone every ~6s and play
        // a low-volume hurt SFX as "ambient distant scream"
        if (this.t % 360 === 100) {
            const alive = this.entities.filter(e => e.alive && e.kind === 'clone');
            if (alive.length > 0) audio.sfx?.('hurt');
        }
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
        // R453: gamepad right-stick X for yaw
        const padTurn = input.getGamepadTurn?.() || 0;
        if (Math.abs(padTurn) > 0.1) p.angle += padTurn * 0.04 * rageMul;
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
        // R504: BFG charge-up. When player holds shoot with BFG active +
        // ammo + cooldown ready, tick chargeT up to 30. At 30, fire.
        // Releasing shoot mid-charge cancels (preserves ammo).
        const isBFG = (w === p.weapons.bfg);
        if (isBFG && w.cooldown <= 0 && w.owned && w.ammo > 0) {
            if (input.isHeld?.('shoot')) {
                if (this._bfgChargeT == null) this._bfgChargeT = 0;
                this._bfgChargeT++;
                // Audio cue at start of charge
                if (this._bfgChargeT === 1) audio.sfx?.('powerup');
                if (this._bfgChargeT >= 30) {
                    this._fire();
                    this._bfgChargeT = null;
                }
            } else if (this._bfgChargeT != null && this._bfgChargeT > 0) {
                // Released mid-charge — cancel
                this._bfgChargeT = null;
            }
        } else if (input.isHeld?.('shoot') && w.cooldown <= 0 && w.owned && (w.ammo > 0 || w.ammo === Infinity)) {
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
        // R436: automap toggle on Tab/Q
        if (input.isPressed?.('cycle')) {
            this._automapOpen = !this._automapOpen;
            audio.sfx?.('select');
        }
        // R423e: tick entities (pickups, enemies, bullets, floaters)
        this._tickEntities();
        this._tickBullets();
        // R424: trigger BOSS_INTRO cinematic the first time the player gets
        // within line-of-sight + 5 tiles of the boss. Pauses Doom updates
        // automatically since the scene routes to SCENE.BOSS_INTRO.
        if (!this._bossIntroFired) {
            const boss = this.entities.find(e => e.alive && e.kind === 'boss');
            if (boss) {
                const d = Math.hypot(boss.x - p.x, boss.y - p.y);
                if (d < 5 && this._hasLOS(p.x, p.y, boss.x, boss.y)) {
                    this._bossIntroFired = true;
                    const game = (typeof window !== 'undefined') ? window.__game : null;
                    if (game) {
                        // Reuse the platformer boss-intro flow — it auto-reads
                        // STAGES[currentStage].boss for the painted plate.
                        game.scene = 'bossIntro';
                        game._bossIntro = { age: 0, done: false };
                        // R437: swap to heavier track when boss intro fires.
                        // Both Doom stages get 'arenaBoss' (heavier than the
                        // corridor track). audio.playTrack handles crossfade.
                        audio.playTrack?.('arenaBoss');
                    }
                }
            }
        }
        // R440: Exit pad detection + proximity hint
        if (this._exitTilePos && !this._levelCleared) {
            const d = Math.hypot(this._exitTilePos.x - p.x, this._exitTilePos.y - p.y);
            if (d < 4 && !this._exitHintFired) {
                this._exitHintFired = true;
                this._floatText('STEP ON GREEN PAD', this._exitTilePos.x, this._exitTilePos.y - 0.6);
            }
        }
        if (this._onExitPad() && !this._levelCleared) {
            this._levelCleared = true;
            this._exitT = 0;
            audio.sfx?.('powerup');
            audio.sfx?.('secretFound');
            const game = (typeof window !== 'undefined') ? window.__game : null;
            game?.triggerScreenFlash?.(20, '#80ff80', 0.6);
        }
        if (this._levelCleared) {
            this._exitT++;
            if (this._exitT > 90) {
                // Trigger stage clear via the game's stageClear path
                const game = (typeof window !== 'undefined') ? window.__game : null;
                if (game) {
                    // Mark stage cleared so existing chain logic fires
                    game._stageClearReason = 'doomExit';
                    // R470: invoke the proper clear hook so achievement
                    // stats roll up (stagesCleared, scores, etc.). Without
                    // this the doom-stage achievements never fire because
                    // the runStats roll-up only runs on _onStageClear.
                    try {
                        if (game._onStageClear) game._onStageClear();
                    } catch (e) {}
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
            // R432: corpse puddle expires after its life ticks. Doesn't block
            // player movement (kind isn't 'clone' so not solid).
            if (e.kind === 'puddle') {
                e.life--;
                if (e.life <= 0) e.alive = false;
                continue;
            }
            // R433: bullet-impact spark — drifts for a few frames then dies
            if (e.kind === 'spark') {
                e.x += e.vx || 0;
                e.y += e.vy || 0;
                e.life--;
                if (e.life <= 0) e.alive = false;
                continue;
            }
            // R452: wall decal — static, just ticks toward expiration
            if (e.kind === 'decal') {
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
            // R451: barrel — static target until shot, then explodes
            if (e.kind === 'barrel') {
                if (e.hp == null) e.hp = 2;
                if (e.hitFlash > 0) e.hitFlash--;
                // Render-only entity, no AI tick
            }
        }
        // Compact dead entities occasionally
        if (this.t % 60 === 0) {
            this.entities = this.entities.filter(e => e.alive);
        }
    }

    _applyPickup(e) {
        const p = this.player;
        const game = (typeof window !== 'undefined') ? window.__game : null;
        if (e.kind === 'key') {
            this.keys.add(e.color);
            audio.sfx?.('powerup');
            this._floatText(`+ ${e.color.toUpperCase()} KEYCARD`, p.x, p.y);
            // R448: key pickup flash in the key color
            const col = e.color === 'red' ? '#ff5050' : e.color === 'yellow' ? '#ffff60' : '#5090ff';
            game?.triggerScreenFlash?.(8, col, 0.3);
            // R499: trigger HUD key pulse so the new slot draws attention
            this._keyPulseT = 45;
            this._keyPulseColor = e.color;
        } else if (e.kind === 'health') {
            p.hp = Math.min(p.maxHp, p.hp + (e.amount || 2));
            audio.sfx?.('pickup');
            this._floatText(`+${e.amount || 2} HP`, p.x, p.y);
            // R448: green pulse flash on health pickup
            game?.triggerScreenFlash?.(6, '#50ff70', 0.25);
        } else if (e.kind === 'ammo') {
            const target = e.weapon || 'shotgun';
            const w = p.weapons[target];
            if (w) {
                w.ammo = (w.ammo === Infinity ? Infinity : (w.ammo || 0) + (e.amount || 8));
                audio.sfx?.('pickup');
                this._floatText(`+${e.amount || 8} ${target.toUpperCase()}`, p.x, p.y);
                // R448: yellow pulse flash on ammo pickup
                game?.triggerScreenFlash?.(4, '#ffe070', 0.18);
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
                // R437: BFG is the secret weapon — extra fanfare
                if (target === 'bfg') {
                    audio.sfx?.('secretFound');
                    game?.triggerScreenFlash?.(20, '#50ff80', 0.6);
                    this._floatText('SECRET FOUND!', p.x, p.y);
                    // R470: stat bump for the 'bfg_secret' achievement
                    achievements.update?.({ bfgFound: 1 });
                }
            }
        }
    }

    _tickEnemy(e) {
        const p = this.player;
        const isBoss = e.kind === 'boss';
        // R439: boss HP scaled per kind. UZIS = 40, WHEELCHAIR = 70 (tougher).
        if (e.hp == null) {
            if (isBoss) e.hp = (this.bossKind === 'SPINDLER_WHEELCHAIR') ? 70 : 40;
            else e.hp = 4;
            e.maxHp = e.hp;
        }
        if (e.fireCD == null) e.fireCD = 60 + (Math.random() * 60) | 0;
        if (e.hitFlash == null) e.hitFlash = 0;
        if (e.hitFlash > 0) e.hitFlash--;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        // R444: wake-up gate. Clones idle until they first sight the player.
        // Bosses always alert (they're behind a keycard door, no surprise).
        if (!isBoss && !e._alerted) {
            // Alert range = 9 tiles + LOS. Once alerted, stay alerted forever.
            if (dist < 9 && this._hasLOS(e.x, e.y, p.x, p.y)) {
                e._alerted = true;
                e._wakeT = 30;       // 30-frame stagger before they start chasing
                this._floatText('!', e.x, e.y - 0.5);
                audio.sfx?.('hurt');  // quick yelp as wake-up alert
            } else {
                // Idle — light bob in place
                return;
            }
        }
        if (e._wakeT > 0) { e._wakeT--; return; }   // stagger before chase
        // R439: phase 2 kicks in at <50% HP for bosses — faster + more shots
        const phase2 = isBoss && (e.hp / e.maxHp < 0.5);
        if (phase2 && !e._phase2Announced) {
            e._phase2Announced = true;
            this._floatText('!!!', e.x, e.y);
            audio.sfx?.('bossChargeTell');
            // Big visual shake
            const game = (typeof window !== 'undefined') ? window.__game : null;
            game?.triggerScreenFlash?.(8, '#ff3030', 0.4);
        }
        // Chase. Boss speed bumps in phase 2.
        if (dist > 0.8 && dist < 12) {
            let sp = isBoss ? (phase2 ? 0.035 : 0.022) : 0.018;
            const nx = e.x + (dx / dist) * sp;
            const ny = e.y + (dy / dist) * sp;
            if (!this._solidAt(nx, e.y)) e.x = nx;
            if (!this._solidAt(e.x, ny)) e.y = ny;
        }
        // R439: attack patterns by enemy type
        // R447: bosses get a 20f charge-up before each heavy attack. Set
        // chargeT counts DOWN from 20 → 0; during charge, sprite flashes red
        // (via hitFlash trick), then attack fires when chargeT hits 0.
        e.fireCD--;
        if (e.fireCD <= 0 && dist < 9 && this._hasLOS(e.x, e.y, p.x, p.y)) {
            if (isBoss && !e._charging) {
                // Begin charge-up — set _charging flag + chargeT
                e._charging = true;
                e._chargeT = 20;
                audio.sfx?.('bossChargeTell');
            } else if (!isBoss) {
                // Clones: no charge, fire immediately
                this._enemyAttack(e, dx, dy, dist, phase2);
                e.fireCD = 70 + (Math.random() * 30) | 0;
            }
        }
        // Tick boss charge
        if (e._charging) {
            e._chargeT--;
            // Red hit-flash during charge
            e.hitFlash = Math.max(e.hitFlash || 0, 1);
            if (e._chargeT <= 0) {
                e._charging = false;
                this._enemyAttack(e, dx, dy, dist, phase2);
                e.hitFlash = 0;
                e.fireCD = phase2 ? 22 : 36;
            }
        }
        return;   // skip legacy single-bullet code below
        // ↓ unreachable but kept for diff cleanliness
        {
            this.bullets.push({
                x: e.x, y: e.y,
                vx: (dx / dist) * 0.12,
                vy: (dy / dist) * 0.12,
                life: 80,
                fromEnemy: true,
                dmg: isBoss ? 2 : 1,
            });
            e.fireCD = isBoss ? 30 : (80 + Math.random() * 40) | 0;
            // R427: enemy fire SFX — bosses get heavier punch
            audio.sfx?.(e.kind === 'boss' ? 'mg' : 'spread');
        }
    }

    // R439: per-enemy attack patterns. Spawns bullets with proper spreads.
    _enemyAttack(e, dx, dy, dist, phase2) {
        const isBoss = e.kind === 'boss';
        const baseAng = Math.atan2(dy, dx);
        const speed = 0.12;
        const spawnB = (ang, dmg) => {
            this.bullets.push({
                x: e.x, y: e.y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                life: 80,
                fromEnemy: true,
                dmg,
            });
        };
        if (!isBoss) {
            // Clones: single shot
            spawnB(baseAng, 1);
            audio.sfx?.('spread');
            return;
        }
        // BOSS attack patterns
        if (this.bossKind === 'SPINDLER_UZIS') {
            // Dual Uzis = 3-bullet burst with slight spread
            const spread = 0.10;
            for (let i = -1; i <= 1; i++) {
                spawnB(baseAng + i * spread, 2);
            }
            audio.sfx?.('mg');
            return;
        }
        if (this.bossKind === 'SPINDLER_WHEELCHAIR') {
            if (phase2) {
                // Phase 2: 5-bullet minigun fan
                const spread = 0.08;
                for (let i = -2; i <= 2; i++) {
                    spawnB(baseAng + i * spread, 2);
                }
                audio.sfx?.('mg');
                // Occasional CHARGE RUSH — 1-in-3 chance to dash 2 tiles toward player
                if (Math.random() < 0.3) {
                    const ndx = Math.cos(baseAng) * 1.5;
                    const ndy = Math.sin(baseAng) * 1.5;
                    if (!this._solidAt(e.x + ndx, e.y + ndy)) {
                        e.x += ndx;
                        e.y += ndy;
                        audio.sfx?.('chairWhoosh');
                    }
                }
            } else {
                // Phase 1: 3-bullet burst
                const spread = 0.12;
                for (let i = -1; i <= 1; i++) {
                    spawnB(baseAng + i * spread, 2);
                }
                audio.sfx?.('mg');
            }
            return;
        }
        // Fallback: single shot
        spawnB(baseAng, 2);
        audio.sfx?.('mg');
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
        if (this._whizzCooldown > 0) this._whizzCooldown--;
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            // R533: defensive guard. _damagePlayer can trigger _onPlayerDeath
            // which sets `this.bullets.length = 0`, leaving stale indices in
            // this loop with `b === undefined`. Skip the dead slot instead
            // of crashing the game loop on Floor 11's lethal final hit.
            if (!b) continue;
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
            // R486: near-miss whizz SFX for ENEMY bullets only (player's own
            // shots zipping past would be confusing). Tile coords: 1 tile
            // threshold = "very close" in raycaster world units.
            if (b.fromEnemy && !b._whizzPlayed && (this._whizzCooldown || 0) <= 0) {
                const pdx = b.x - p.x, pdy = b.y - p.y;
                const d2 = pdx * pdx + pdy * pdy;
                if (b._prevD2 != null && d2 > b._prevD2 && b._prevD2 < 1.0) {
                    audio.sfx?.('whizz');
                    this._whizzCooldown = 18;
                    b._whizzPlayed = true;
                }
                b._prevD2 = d2;
            }
            if (b.life <= 0 || this._solidAt(b.x, b.y)) {
                // R433: spark burst on wall hit — small short-lived particle
                // entities at impact point. Only for player bullets (enemy
                // shots passing into walls don't need feedback).
                if (this._solidAt(b.x, b.y) && !b.fromEnemy) {
                    for (let k = 0; k < 4; k++) {
                        this.entities.push({
                            alive: true, kind: 'spark',
                            x: b.x, y: b.y,
                            vx: (Math.random() - 0.5) * 0.04,
                            vy: (Math.random() - 0.5) * 0.04,
                            life: 12, maxLife: 12,
                            color: b.isBFG ? '#50ff80' : '#ffe070',
                        });
                    }
                    // R452: wall decal — bullet hole that lingers 8s
                    // Step back one frame so decal sits ON the wall surface,
                    // not buried inside it
                    this.entities.push({
                        alive: true, kind: 'decal',
                        x: b.x - (b.vx || 0) * 0.5,
                        y: b.y - (b.vy || 0) * 0.5,
                        life: 480, maxLife: 480,
                    });
                    // Cap decals at 24 to prevent runaway entity count
                    let decalCount = 0;
                    for (let k = this.entities.length - 1; k >= 0; k--) {
                        if (this.entities[k].alive && this.entities[k].kind === 'decal') {
                            decalCount++;
                            if (decalCount > 24) { this.entities[k].alive = false; break; }
                        }
                    }
                }
                this.bullets.splice(i, 1);
                continue;
            }
            if (b.fromEnemy) {
                // Hit player?
                const d = Math.hypot(b.x - p.x, b.y - p.y);
                if (d < 0.4 && p.iframes <= 0) {
                    // R438: record bullet velocity direction so damage indicator
                    // knows which direction the hit came from. World angle of
                    // the bullet (atan2 of velocity); converted to view-relative
                    // bearing later.
                    this._lastHitAngle = Math.atan2(b.vy, b.vx) + Math.PI;
                    this._damagePlayer(b.dmg || 1);
                    this.bullets.splice(i, 1);
                }
            } else {
                // Hit enemy?
                let didHit = false;
                for (const e of this.entities) {
                    if (!e.alive || (e.kind !== 'clone' && e.kind !== 'boss' && e.kind !== 'barrel')) continue;
                    const d = Math.hypot(b.x - e.x, b.y - e.y);
                    // R446: BFG has bigger hitbox + pierces multiple enemies
                    const hitRadius = b.isBFG ? 1.2 :
                                      (e.kind === 'barrel') ? 0.5 :
                                      (e.kind === 'boss') ? 0.6 : 0.4;
                    if (d < hitRadius) {
                        // BFG-tagged bullets: don't double-damage same enemy
                        if (b._hitIds && b._hitIds.has(e)) continue;
                        e.hp = (e.hp || 4) - (b.dmg || 1);
                        e.hitFlash = 6;
                        didHit = true;
                        if (e.hp <= 0) {
                            if (e.kind === 'barrel') {
                                this._explodeBarrel(e);
                            } else {
                                this._killEnemy(e);
                            }
                        } else {
                            audio.sfx?.('hurt');
                            e.fireCD = Math.max(e.fireCD || 0, 24);
                            // R444: any hit alerts the enemy (if not already)
                            e._alerted = true;
                        }
                        if (b.isBFG) {
                            // BFG pierces — register hit + reduce pierce count
                            if (!b._hitIds) b._hitIds = new Set();
                            b._hitIds.add(e);
                            b._piercesLeft = (b._piercesLeft != null) ? b._piercesLeft - 1 : 2;
                            if (b._piercesLeft <= 0) {
                                this.bullets.splice(i, 1);
                                break;
                            }
                        } else {
                            this.bullets.splice(i, 1);
                            break;
                        }
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
        audio.sfx?.('hurt');
        // R438: arm damage indicator timer (30f visible)
        this._damageIndicatorT = 30;
        if (p.hp <= 0) this._onPlayerDeath();
        else if (p.hp <= 1 && !p.rageUsedThisStage) this._triggerRage();
    }

    _triggerRage() {
        const p = this.player;
        p.rageFrames = p.rageMaxFrames;
        p.rageUsedThisStage = true;
        audio.sfx?.('powerup');
        audio.sfx?.('explode');
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
        // R449: clear stale per-life state so respawn is fresh
        p.rageFrames = 0;
        p.rageUsedThisStage = false;
        this._comboCount = 0;
        this._lastKillT = null;
        this._damageIndicatorT = 0;
        // Clear bullets in flight so player doesn't insta-die on respawn
        this.bullets.length = 0;
        // Death sting
        audio.sfx?.('die');
    }

    // R451: barrel detonation. Splash damage to all enemies + player in
    // radius 1.5 tiles. Chains: a barrel can detonate adjacent barrels.
    _explodeBarrel(b) {
        b.alive = false;
        audio.sfx?.('explode');
        const game = (typeof window !== 'undefined') ? window.__game : null;
        game?.triggerScreenFlash?.(8, '#ff8030', 0.4);
        game?.camera?.shake?.(4);
        // Spawn 16 fire particles
        if (game?._particles?.explosion) {
            game._particles.explosion(b.x * 16, b.y * 16, '#ff8030', 16);
        }
        // Splash damage
        const R = 1.5;
        for (const e of this.entities) {
            if (!e.alive) continue;
            if (e === b) continue;
            const d = Math.hypot(e.x - b.x, e.y - b.y);
            if (d > R) continue;
            if (e.kind === 'clone' || e.kind === 'boss') {
                e.hp = (e.hp || 4) - 4;
                e.hitFlash = 8;
                e._alerted = true;
                if (e.hp <= 0) this._killEnemy(e);
            } else if (e.kind === 'barrel') {
                // Chain reaction
                this._explodeBarrel(e);
            }
        }
        // Splash on player too
        const dp = Math.hypot(this.player.x - b.x, this.player.y - b.y);
        if (dp < R && this.player.iframes <= 0) {
            this._lastHitAngle = Math.atan2(this.player.y - b.y, this.player.x - b.x);
            this._damagePlayer(2);
        }
    }

    // R432: enemy death — gore burst + score + death-puddle entity. The
    // entity becomes a slime-puddle "corpse" that lingers for 240f then
    // expires (mostly visual flavor; doesn't block movement).
    _killEnemy(e) {
        e.alive = false;
        const isBoss = (e.kind === 'boss');
        audio.sfx?.('explode');
        audio.sfx?.('hurt');     // double SFX for screamy death
        // R441: kill combo — chained kills within 4s bump multiplier
        const now = this.t;
        if (this._lastKillT == null || (now - this._lastKillT) > 240) {
            this._comboCount = 1;
        } else {
            this._comboCount = (this._comboCount || 0) + 1;
        }
        this._lastKillT = now;
        // R470: track Doom-mode max combo for achievement (max-aware)
        const prior = achievements.stats?.doomMaxCombo || 0;
        if (this._comboCount > prior) {
            achievements.update?.({ doomMaxCombo: this._comboCount });
        }
        const multiplier = (this._comboCount >= 5) ? 4 :
                           (this._comboCount >= 4) ? 3 :
                           (this._comboCount >= 3) ? 2 : 1;
        const base = isBoss ? 5000 : 100;
        const gain = base * multiplier;
        this.player.score += gain;
        // R489: kill counter for achievements (totalKills stat). Resolved
        // via ap.kills in _onStageClear.
        this.player.kills = (this.player.kills || 0) + 1;
        // Show combo toast when ×2 or higher
        if (multiplier > 1 && !isBoss) {
            this._floatText(`COMBO ×${multiplier}!`, e.x, e.y - 0.4);
            audio.sfx?.('combo' + Math.min(4, multiplier - 1));
        }
        return this._continueKill(e, isBoss);
    }

    _continueKill(e, isBoss) {
        // Slime-puddle corpse entity (kind='puddle') — drawn as flat green
        // billboard via _drawSprite vector fallback. Sits where the enemy fell.
        this.entities.push({
            alive: true,
            kind: 'puddle',
            x: e.x, y: e.y,
            life: isBoss ? 600 : 240,
            maxLife: isBoss ? 600 : 240,
            scale: isBoss ? 1.5 : 1.0,
        });
        // R450: random loot drops on kill
        if (isBoss) {
            // Boss guaranteed drops: big health + big ammo cache
            this.entities.push({
                alive: true, kind: 'health',
                x: e.x - 0.3, y: e.y, amount: 4,
            });
            this.entities.push({
                alive: true, kind: 'ammo',
                x: e.x + 0.3, y: e.y, weapon: 'shotgun', amount: 24,
            });
        } else {
            // Clone: 25% ammo, 10% health (cumulative — both possible)
            if (Math.random() < 0.25) {
                const isShotgun = Math.random() < 0.5;
                this.entities.push({
                    alive: true, kind: 'ammo',
                    x: e.x + (Math.random() - 0.5) * 0.4,
                    y: e.y + (Math.random() - 0.5) * 0.4,
                    weapon: isShotgun ? 'shotgun' : 'mg',
                    amount: isShotgun ? 3 : 8,
                });
            }
            if (Math.random() < 0.10) {
                this.entities.push({
                    alive: true, kind: 'health',
                    x: e.x + (Math.random() - 0.5) * 0.4,
                    y: e.y + (Math.random() - 0.5) * 0.4,
                    amount: 1,
                });
            }
        }
        // Spawn 12 gore particles via game.particles (the existing platformer
        // particle system); they ride screen space so won't track world but
        // give a nice 1-second burst on kill.
        const game = (typeof window !== 'undefined') ? window.__game : null;
        if (game?._particles?.explosion) {
            game._particles.explosion(e.x * 16, e.y * 16, '#50ff60', 12);
        }
        if (isBoss) this._onBossKill(e);
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
            // R437: remember exit location for HUD arrow
            this._exitTilePos = { x: x + 0.5, y: y + 0.5 };
        }
        this._floatText('BOSS DOWN', boss.x, boss.y);
        // R437: another floater pointing at exit pad
        // R530: was setTimeout (fired regardless of pause/scene); now a
        // frame-counted deferred floater that respects the game loop.
        if (this._exitTilePos) {
            this._deferredFloats = this._deferredFloats || [];
            this._deferredFloats.push({
                t: 48,                              // ~800ms at 60fps
                text: 'FIND EXIT',
                x: boss.x,
                y: boss.y - 0.6,
            });
        }
        // R437: end-of-stage music change — calmer track for the victory walk
        audio.playTrack?.('hope');
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
        // R500: weapon swap animation — 12 frames total. Frames 0-6 slide
        // the current weapon down off-screen; mid-swap we flip weaponIdx;
        // frames 6-12 slide the new weapon up into view.
        if (this._weaponSwapT > 0) this._weaponSwapT--;
        if (this._pendingSwitch != null) {
            const keys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
            const w = this.player.weapons[keys[this._pendingSwitch]];
            // Block re-switch during an active swap animation
            if (w && w.owned && this._weaponSwapT === 0 &&
                this._pendingSwitch !== this.player.weaponIdx) {
                this._weaponSwapTarget = this._pendingSwitch;
                this._weaponSwapT = 12;
                audio.sfx?.('select');
            }
            this._pendingSwitch = null;
        }
        // Mid-swap: at frame 6, commit the new weaponIdx
        if (this._weaponSwapT === 6 && this._weaponSwapTarget != null) {
            this.player.weaponIdx = this._weaponSwapTarget;
            this._weaponSwapTarget = null;
        }
    }

    _fire() {
        const p = this.player;
        const w = this._activeWeapon();
        w.cooldown = w.rate;
        if (w.ammo !== Infinity) w.ammo--;
        // R463: extended to 12f so 3-frame cycle (fire/recover/rest) reads.
        // muzzleFlash > 6 → fire pose (6f), 1-6 → recover pose (6f), 0 → rest
        p.muzzleFlash = 12;
        // Per-weapon SFX cue. Painted gun art will replace these flat
        // beats later; for now the audio carries the differentiation.
        // R427: dedicated SFX per weapon
        if (w === p.weapons.mg)       audio.sfx?.('mg');
        else if (w === p.weapons.shotgun)  audio.sfx?.('shotgun');
        else if (w === p.weapons.chainsaw) {
            // R503: chainsaw fires every 6f; playing SFX on every shot
            // sounds choppy. Throttle to once per 18f for a continuous
            // rev feel without overlapping noise.
            this._chainsawSfxT = (this._chainsawSfxT || 0) + 1;
            if (this._chainsawSfxT >= 18 || this._chainsawSfxT === 1) {
                audio.sfx?.('chainsaw');
                if (this._chainsawSfxT >= 18) this._chainsawSfxT = 0;
            }
        }
        else if (w === p.weapons.bfg)      { audio.sfx?.('powerup'); audio.sfx?.('explode'); }
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
                        this._killEnemy(e);
                    } else {
                        audio.sfx?.('hurt');
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
        // R430: guard against NaN — when player teleports or bullet vx/vy
        // gets corrupted, NaN coords would crash this.map[NaN][NaN].
        if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
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
                // R427: denial click for locked doors
                audio.sfx?.('pause');
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
        // R431: textured floor + ceiling. Use per-pixel projection à la Wolf3D
        // when painted textures available; fall back to flat color otherwise.
        // Theme picks tileset: serverroom = office, sewer = sewer.
        const theme = this.data.theme;
        const floorKey = (theme === 'sewer') ? 'doom_floor_concrete' : 'doom_floor_carpet';
        const ceilKey  = (theme === 'sewer') ? 'doom_ceiling_sewer'  : 'doom_ceiling_office';
        const floorTex = sprites.images?.get(floorKey);
        const ceilTex  = sprites.images?.get(ceilKey);
        if (floorTex?.complete && floorTex.naturalWidth > 0 &&
            ceilTex?.complete && ceilTex.naturalWidth > 0) {
            this._drawFloorCeiling(floorTex, ceilTex);
        } else {
            // Fallback flat fills
            ctx.fillStyle = '#283040';
            ctx.fillRect(0, 0, W, VIEW_H / 2);
            ctx.fillStyle = '#3a2c20';
            ctx.fillRect(0, VIEW_H / 2, W, VIEW_H / 2);
        }

        this._raycast();
        this._drawSprites();
        // R440: 3D exit pad light pillar — column of green light rising from
        // the exit tile, visible when in line of sight. Drawn after sprites
        // so it can blend over walls.
        if (this._exitTilePos) this._drawExitPillar();
        this._drawWeapon();
        this._drawHud();
        // R458/R498: tiny corner RADAR — proximity view of nearby walls +
        // enemies. Way smaller than the original minimap (8% of screen);
        // full automap on Tab still available. Best of both — situational
        // awareness without dominating the view.
        this._drawRadar();
        // R423e: pickup/key floating text overlays — drawn world-space
        this._drawFloaters();
        // R436: full-screen automap overlay if Tab toggled on. Draws over
        // everything else.
        if (this._automapOpen) this._drawAutomap();
        // R443: stage-clear celebration overlay while waiting for fade
        if (this._levelCleared && this._exitT > 0) {
            const ctx = this.ctx;
            const t = Math.min(1, this._exitT / 30);
            ctx.save();
            // Letterbox bars + dim
            ctx.fillStyle = `rgba(0, 0, 0, ${0.6 * t})`;
            ctx.fillRect(0, 0, W, VIEW_H);
            // Big STAGE CLEAR
            const ny = 50 + (1 - t) * -50;     // slide-in from top
            drawTextOutlined(ctx, 'STAGE CLEAR', W / 2, ny, '#ffe070', '#000000', 2, 'center');
            // Stats lines
            const p = this.player;
            const startY = ny + 28;
            ctx.globalAlpha = Math.max(0, t - 0.3);
            drawTextOutlined(ctx, `SCORE  ${p.score}`, W / 2, startY, '#ffffff', '#000000', 1, 'center');
            const aliveClones = this.entities.filter(e => e.alive && e.kind === 'clone').length;
            const totalEnemies = this.entities.filter(e => e.kind === 'clone' || e.kind === 'puddle').length;
            const killed = totalEnemies - aliveClones;
            drawTextOutlined(ctx, `KILLS  ${killed}`, W / 2, startY + 12, '#ffffff', '#000000', 1, 'center');
            drawTextOutlined(ctx, `KEYS   ${this.keys.size}/3`, W / 2, startY + 24, '#ffffff', '#000000', 1, 'center');
            const hasBfg = p.weapons.bfg.owned;
            drawTextOutlined(ctx, `SECRET ${hasBfg ? 'FOUND' : 'MISSED'}`, W / 2, startY + 36, hasBfg ? '#50ff80' : '#a0a0b0', '#000000', 1, 'center');
            ctx.restore();
        }
        // R458: TAB-FOR-MAP hint — visible for the first 4 seconds AFTER the
        // intro fly-through ends. Subtle top-right blink so player knows
        // they can press Tab for the map (since we removed the always-on mini).
        if (this._introT <= 0 && this.t < 480 && !this._automapOpen) {
            const ctx = this.ctx;
            const phase = (this.t / 30) | 0;
            if (phase % 2 === 0) {
                ctx.save();
                const fade = Math.max(0, 1 - (this.t - 240) / 240);
                ctx.globalAlpha = fade;
                // R498: position TAB hint BELOW the radar (which now lives
                // top-right at y=4..54) so they don't overlap.
                drawTextOutlined(ctx, 'TAB FOR MAP', W - 6, 60, '#a0c0ff', '#000000', 1, 'right');
                ctx.restore();
            }
        }
        // R442: intro overlay — stage name banner over fly-through
        if (this._introT > 0) {
            const ctx = this.ctx;
            // Letterbox bars
            ctx.save();
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, 32);
            ctx.fillRect(0, VIEW_H - 32, W, 32);
            // Big stage name
            drawTextOutlined(ctx, this.data.name || 'DOOM STAGE', W / 2, 14, '#ff5050', '#000000', 2, 'center');
            // Tagline / boss name
            const stg = (typeof window !== 'undefined' && window.__game?.constructor)
                ? window.__game.constructor.STAGES?.[window.__game.currentStage]
                : null;
            // R554: humanize the boss-kind label — underscores were
            // reading literally on the intro screen (SPINDLER_WHEELCHAIR).
            const bossLabel = (this.bossKind || '').replace(/_/g, ' ');
            drawTextOutlined(ctx, bossLabel, W / 2, VIEW_H - 22, '#ffe070', '#000000', 1, 'center');
            // Skip hint
            const skipAlpha = (this.t % 60 < 30) ? 1 : 0.4;
            ctx.globalAlpha = skipAlpha;
            drawText(ctx, 'PRESS X TO SKIP', W / 2, VIEW_H - 10, '#a0a0b0', 1, 'center');
            ctx.restore();
        }
        // R437: exit-pad direction chevron — when the exit pad is active
        // and not yet on the player, show a pulsing arrow at the top of the
        // viewport pointing toward the exit's bearing.
        if (this._exitTilePos && !this._levelCleared) {
            const ex = this._exitTilePos.x, ey = this._exitTilePos.y;
            const px = this.player.x, py = this.player.y;
            const dxw = ex - px;
            const dyw = ey - py;
            const bearing = Math.atan2(dyw, dxw) - this.player.angle;
            const c = this.ctx;
            const pulse = (Math.sin(this.t * 0.2) + 1) * 0.5;
            c.save();
            c.globalAlpha = 0.6 + pulse * 0.4;
            const cx = W / 2, cy = 14;
            c.translate(cx, cy);
            c.rotate(bearing + Math.PI / 2);  // 0 rad = "in front" → arrow pointing up
            c.fillStyle = '#50ff80';
            // Arrow chevron
            c.beginPath();
            c.moveTo(0, -6);
            c.lineTo(5, 4);
            c.lineTo(0, 1);
            c.lineTo(-5, 4);
            c.closePath();
            c.fill();
            c.restore();
            drawTextOutlined(c, 'EXIT', cx, cy + 8, '#50ff80', '#000000', 1, 'center');
        }
        // R423e: damage flash overlay
        if (this.player.iframes > 50) {
            const ctx = this.ctx;
            ctx.save();
            ctx.globalAlpha = (this.player.iframes - 50) / 10 * 0.4;
            ctx.fillStyle = '#ff2020';
            ctx.fillRect(0, 0, W, VIEW_H);
            ctx.restore();
        }
        // R438: directional damage indicator — red arc on screen edge
        // pointing toward incoming threat.
        if (this._damageIndicatorT > 0) {
            this._damageIndicatorT--;
            const ctx = this.ctx;
            const t = this._damageIndicatorT / 30;
            // Convert world hit angle to view-relative bearing
            const viewAngle = (this._lastHitAngle || 0) - this.player.angle;
            // Position arc at one of 8 octants on the screen edge
            const cx = W / 2, cy = VIEW_H / 2;
            const radius = Math.min(W, VIEW_H) * 0.45;
            const ax = cx + Math.cos(viewAngle) * radius;
            const ay = cy + Math.sin(viewAngle) * radius;
            ctx.save();
            ctx.globalAlpha = t * 0.85;
            // Red wedge — gradient circle at the bearing
            const grad = ctx.createRadialGradient(ax, ay, 0, ax, ay, 60);
            grad.addColorStop(0, '#ff3030');
            grad.addColorStop(0.5, '#c01010');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ax, ay, 60, 0, Math.PI * 2);
            ctx.fill();
            // Hard chevron arrowhead pointing FROM screen edge INTO center
            ctx.translate(ax, ay);
            ctx.rotate(viewAngle + Math.PI);
            ctx.fillStyle = '#ff5050';
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(12, 0);
            ctx.lineTo(0, 8);
            ctx.lineTo(4, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // R440: green light pillar at the exit pad — projected as a vertical
    // strip of additive green light. Respects z-buffer so walls hide it.
    _drawExitPillar() {
        const ctx = this.ctx;
        const p = this.player;
        const ex = this._exitTilePos.x;
        const ey = this._exitTilePos.y;
        const dx = ex - p.x, dy = ey - p.y;
        const ca = Math.cos(-p.angle), sa = Math.sin(-p.angle);
        const tx = dx * ca - dy * sa;
        const ty = dx * sa + dy * ca;
        if (tx <= 0.05) return;
        const halfFov = FOV / 2;
        const camPlane = Math.tan(halfFov);
        const screenX = (W / 2) * (1 + (ty / tx) / camPlane);
        const colW = Math.max(4, (VIEW_H / tx) * 0.8) | 0;
        const startX = Math.max(0, screenX - colW / 2 | 0);
        const endX = Math.min(NUM_COLS - 1, screenX + colW / 2 | 0);
        // Pillar extends from floor to ceiling
        const pulse = (Math.sin(this.t * 0.2) + 1) * 0.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (0.25 + pulse * 0.25) * Math.max(0.2, 1 - tx / 10);
        for (let sx = startX; sx <= endX; sx++) {
            if (this.zbuffer[sx] < tx) continue;
            const middleness = 1 - Math.abs((sx - screenX) / (colW / 2));
            ctx.fillStyle = middleness > 0.5 ? '#80ff80' : '#208040';
            ctx.fillRect(sx, 0, 1, VIEW_H);
        }
        ctx.restore();
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
        // R445: bullet sprites get distinct sizes by type
        let bulletScale = 1;
        if (e.kind === 'bullet') {
            const b = e._bullet;
            if (b?.isBFG) bulletScale = 1.2;          // BFG = big green ball
            else if (b?.fromEnemy) bulletScale = 0.4;  // enemy = small red
            else bulletScale = 0.35;                    // player = small tracer
        }
        const spriteW = spriteH * (e.kind === 'bullet' ? bulletScale : 1);
        const drawY = (VIEW_H - spriteH) / 2;
        const drawX = screenX - spriteW / 2;
        // Per-column z-buffer occlusion
        const startX = Math.max(0, drawX | 0);
        const endX = Math.min(NUM_COLS - 1, (drawX + spriteW) | 0);
        // Distance fade
        const fade = Math.max(0.3, 1 - tx / 10);
        let baseColor, accentColor;
        if (e.kind === 'bullet') {
            // R445: painted bullet — colored circle with additive glow halo.
            // Skip the vector-stripe fallback for bullets; render directly.
            const b = e._bullet;
            const core = b?.isBFG ? '#a0ff80' : b?.fromEnemy ? '#ff4040' : '#ffe070';
            const halo = b?.isBFG ? '#208030' : b?.fromEnemy ? '#a00010' : '#a06010';
            const cx = screenX | 0;
            const cy = (drawY + spriteH / 2) | 0;
            const r = Math.max(1, spriteW / 2) | 0;
            ctx.save();
            // Halo (additive, larger)
            if (this.zbuffer[cx] >= tx) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.5 * fade;
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
                ctx.fill();
                // Core
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = fade;
                ctx.fillStyle = core;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                // White center pinpoint
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(cx, cy, 1, 1);
            }
            ctx.restore();
            return;
        }
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
        } else if (e.kind === 'barrel') {
            // R451: red barrel — flash white when hit, dark band on top
            baseColor = e.hitFlash > 0 ? '#ffffff' : '#c04030';
            accentColor = e.hitFlash > 0 ? '#ffffff' : '#ffe070';
        } else if (e.kind === 'decal') {
            // R452: dark bullet hole — small 3x3 dark pixel that fades over life
            const ageT = e.life / e.maxLife;
            if (ageT <= 0) return;
            const px = screenX | 0;
            const py = (drawY + spriteH * 0.5) | 0;
            if (this.zbuffer[px] >= tx) {
                ctx.save();
                ctx.globalAlpha = ageT * 0.65;
                ctx.fillStyle = '#181820';
                ctx.fillRect(px - 1, py - 1, 3, 3);
                ctx.restore();
            }
            return;
        } else if (e.kind === 'spark') {
            // R433: tiny 2x2 spark pixel in the spark color, fades fast
            const ageT = e.life / e.maxLife;
            if (ageT <= 0) return;
            ctx.save();
            ctx.globalAlpha = ageT;
            ctx.fillStyle = e.color || '#ffe070';
            const px = (screenX | 0);
            const py = (drawY + spriteH * 0.5) | 0;
            if (this.zbuffer[px] >= tx) ctx.fillRect(px, py, 2, 2);
            ctx.restore();
            return;
        } else if (e.kind === 'puddle') {
            // R432: green slime puddle billboard — sinks toward the floor as
            // it ages. Drawn as low-profile streak of green pixels.
            const ageT = e.life / e.maxLife;
            if (ageT <= 0) return;
            const puddleH = Math.max(2, spriteH * 0.15) | 0;
            const puddleW = Math.max(4, spriteW * 0.7 * (e.scale || 1)) | 0;
            const yBase = drawY + spriteH - puddleH;
            const xBase = screenX - puddleW / 2;
            ctx.save();
            ctx.globalAlpha = Math.min(1, ageT * 1.5) * 0.85;
            for (let sx = Math.max(0, xBase | 0); sx <= Math.min(NUM_COLS - 1, (xBase + puddleW) | 0); sx++) {
                if (this.zbuffer[sx] < tx) continue;
                // Darker outer, brighter center
                const middleness = 1 - Math.abs((sx - screenX) / (puddleW / 2));
                ctx.fillStyle = middleness > 0.5 ? '#50ff60' : '#208030';
                ctx.fillRect(sx, yBase, 1, puddleH);
            }
            ctx.restore();
            return;
        } else return;
        // Painted sprite key lookup — added in the texture-load step. For
        // now we draw vector blocks so the engine is testable before art lands.
        const spriteImg = this._getSpriteFor(e);
        if (spriteImg && this._fadeReady(spriteImg)) {
            // R460: enemy bob — alive enemies sway up/down on world-time so
            // they don't look frozen. Boss bobs slower + larger. Charging
            // boss vibrates instead of bobs (more menacing).
            let bob = 0;
            if (e.kind === 'clone') bob = Math.sin(this.t * 0.18 + (e.x + e.y)) * (spriteH * 0.04);
            else if (e.kind === 'boss') {
                if (e._charging) bob = (Math.random() - 0.5) * (spriteH * 0.06);
                else bob = Math.sin(this.t * 0.10 + e.x) * (spriteH * 0.05);
            }
            const adjY = drawY + bob;
            // Draw painted sprite column-by-column, respecting zbuffer
            const iw = spriteImg.width;
            for (let sx = startX; sx <= endX; sx++) {
                if (this.zbuffer[sx] < tx) continue;
                const u = ((sx - drawX) / spriteW) * iw | 0;
                if (u < 0 || u >= iw) continue;
                ctx.drawImage(
                    spriteImg,
                    u, 0, 1, spriteImg.height,
                    sx, adjY, 1, spriteH,
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
        if (e.kind === 'clone') {
            // R464: 4-frame walk cycle + attack + hurt poses
            // hurt frame for the brief hitFlash window
            if (e.hitFlash > 2) {
                const hurt = sprites.images.get('doom_clone_hurt');
                if (hurt?.complete) return hurt;
            }
            // attack frame during _charging (if boss-style) — clones use it
            // briefly when their fireCD just hit 0
            if (e.fireCD != null && e.fireCD < 8) {
                const atk = sprites.images.get('doom_clone_attack');
                if (atk?.complete) return atk;
            }
            // Walking cycle — only when alerted (idle clones stay on frame 1)
            if (e._alerted) {
                // Phase-shift per clone so they don't sync
                const phase = ((this.t + (e.x * 13 + e.y * 7) | 0) / 8) | 0;
                const frame = (phase % 4) + 1;
                const img = sprites.images.get(`doom_clone_walk_${frame}`);
                if (img?.complete) return img;
            }
            return sprites.images.get('doom_clone_walk_1') || sprites.images.get('doom_clone');
        }
        if (e.kind === 'boss') {
            // R464: bosses swap to fire-pose while charging (the new fire
            // sprite has bigger muzzle flash + ammo belts cascading)
            const firing = !!e._charging;
            if (this.bossKind === 'SPINDLER_UZIS') {
                if (firing) {
                    const f = sprites.images.get('doom_boss_spindler_uzis_fire');
                    if (f?.complete) return f;
                }
                return sprites.images.get('doom_boss_spindler_uzis');
            }
            if (this.bossKind === 'SPINDLER_WHEELCHAIR') {
                if (firing) {
                    const f = sprites.images.get('doom_boss_spindler_wheelchair_fire');
                    if (f?.complete) return f;
                }
                return sprites.images.get('doom_boss_spindler_wheelchair');
            }
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
        const wKeys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
        const activeKey = wKeys[p.weaponIdx];
        // R463: 3-frame cycle based on muzzle flash phase (12f total)
        let sprKey;
        if (p.muzzleFlash > 6) sprKey = `doom_weapon_${activeKey}_fire`;
        else if (p.muzzleFlash > 0) sprKey = `doom_weapon_${activeKey}_recover`;
        else sprKey = `doom_weapon_${activeKey}`;
        const img = sprKey && sprites.images?.get(sprKey);
        const baseY = VIEW_H - 4;
        // R459/R463: BEEFIER RECOIL — bigger dip + horizontal shake on fire.
        // muzzleFlash now 12f (R463), so scale to 24px peak.
        const mf = p.muzzleFlash || 0;
        const fT = mf / 12;
        const recoil = (fT * 24) | 0;
        const xShake = mf > 0 ? ((Math.random() - 0.5) * mf * 0.6) | 0 : 0;
        // R459: walking bob — gentle sine sway when player moves (matches
        // axis input). Adds subtle motion when not firing.
        const ax = input.axis();
        const moving = Math.abs(ax.x) > 0.1 || Math.abs(ax.y) > 0.1;
        const bobY = moving ? (Math.sin(this.t * 0.25) * 3) | 0 : 0;
        const bobX = moving ? (Math.sin(this.t * 0.125) * 2) | 0 : 0;
        // R500: weapon swap slide offset. _weaponSwapT counts 12→0.
        // 12..7 = sliding OLD weapon DOWN (offset 0 → +VIEW_H/2)
        // 6     = swap point (weaponIdx flips elsewhere)
        // 6..0  = sliding NEW weapon UP (offset +VIEW_H/2 → 0)
        let swapOffset = 0;
        if (this._weaponSwapT > 0) {
            if (this._weaponSwapT > 6) {
                // exit phase: 12..6 → 0..1 progress
                const t = (12 - this._weaponSwapT) / 6;
                swapOffset = (t * (VIEW_H * 0.6)) | 0;
            } else {
                // entry phase: 6..0 → 1..0
                const t = this._weaponSwapT / 6;
                swapOffset = (t * (VIEW_H * 0.6)) | 0;
            }
        }
        if (img && img.complete && img.naturalWidth > 0) {
            const hudH = Math.min(128, VIEW_H);
            const hudW = (img.width / img.height) * hudH;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img,
                ((W - hudW) / 2 + xShake + bobX) | 0,
                (baseY - hudH + recoil + bobY + swapOffset) | 0,
                hudW | 0, hudH | 0);
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
        // R504/R507: BFG charging glow — orb floats ABOVE the gun (where the
        // projectile will spawn) so the BFG sprite's painted green cross
        // doesn't swallow the effect. Plus a screen-edge green vignette
        // that intensifies with charge to sell the "powering up" beat.
        if (this._bfgChargeT > 0 && w === p.weapons.bfg) {
            const cT = this._bfgChargeT / 30;
            const cR = 8 + cT * 28;
            const fx = W / 2;
            // Position above gun in the viewport, where the projectile spawns
            // baseY is at viewport bottom; gun sprite extends ~120px up.
            // Float orb well above gun top (~y=40 in 256x180 viewport).
            const fy = 50 + recoil + bobY + swapOffset;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Strong alpha that pulses
            ctx.globalAlpha = 0.85 + Math.sin(this.t * 0.5) * 0.15;
            const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, cR);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.2, '#e0ffd0');
            grad.addColorStop(0.5, '#60ff60');
            grad.addColorStop(0.8, '#208030');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(fx, fy, cR, 0, Math.PI * 2);
            ctx.fill();
            // Crackling tendrils — 4 short lines flickering out from core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.9 * cT;
            for (let i = 0; i < 4; i++) {
                const a = this.t * 0.3 + i * Math.PI / 2 + Math.random() * 0.5;
                const len = cR * 0.7 + Math.random() * cR * 0.3;
                ctx.beginPath();
                ctx.moveTo(fx, fy);
                ctx.lineTo(fx + Math.cos(a) * len, fy + Math.sin(a) * len);
                ctx.stroke();
            }
            ctx.restore();

            // Screen-edge green vignette — frames the action
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.15 + cT * 0.25;
            const vg = ctx.createRadialGradient(W / 2, VIEW_H / 2, VIEW_H * 0.4, W / 2, VIEW_H / 2, VIEW_H * 0.9);
            vg.addColorStop(0, 'rgba(0,0,0,0)');
            vg.addColorStop(1, '#40ff40');
            ctx.fillStyle = vg;
            ctx.fillRect(0, 0, W, VIEW_H);
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

    // R431: textured floor + ceiling using inverse projection.
    // For each scanline y in the lower (floor) and upper (ceiling) halves,
    // compute the world distance to that horizon row and step a "ray" from
    // left to right scanline columns to find the world (x,y) under each
    // pixel. Sample the appropriate texture there. Cheap to compute at
    // 256×112 pixel cost.
    _drawFloorCeiling(floorTex, ceilTex) {
        // R454: optimized to ~half the prior cost via:
        //  1. Reusable ImageData buffer (no re-alloc per frame)
        //  2. Bitwise AND for power-of-2 texture wrap (fw=64=0x40, so & 63)
        //  3. Half-resolution sampling (every other column, fill 2px wide)
        //  4. Hoisted scaled-color lookups, inlined indexing math
        const ctx = this.ctx;
        const p = this.player;
        const halfH = (VIEW_H / 2) | 0;
        // Reuse the ImageData buffer across frames — saves a ~57KB alloc.
        // Only re-fetch if size changed (canvas resize) or first call.
        if (!this._fcBuf || this._fcBuf.width !== W || this._fcBuf.height !== VIEW_H) {
            this._fcBuf = ctx.getImageData(0, 0, W, VIEW_H);
        }
        const imgData = this._fcBuf;
        const data = imgData.data;
        const fdata = this._getTexData(floorTex);
        const cdata = this._getTexData(ceilTex);
        const fw = floorTex.naturalWidth, fh = floorTex.naturalHeight;
        const cw = ceilTex.naturalWidth, ch = ceilTex.naturalHeight;
        // Bitwise mask path is hot, so require power-of-2 textures.
        // (64x64 — already power-of-2.) Fall through to generic if not.
        const fwMask = (fw & (fw - 1)) === 0 ? fw - 1 : 0;
        const fhMask = (fh & (fh - 1)) === 0 ? fh - 1 : 0;
        const cwMask = (cw & (cw - 1)) === 0 ? cw - 1 : 0;
        const chMask = (ch & (ch - 1)) === 0 ? ch - 1 : 0;
        const fastMask = fwMask && fhMask && cwMask && chMask;
        const halfFov = FOV / 2;
        const dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
        const planeX = -dirY * Math.tan(halfFov);
        const planeY = dirX * Math.tan(halfFov);
        const rayDir0X = dirX - planeX;
        const rayDir0Y = dirY - planeY;
        const rayDir1X = dirX + planeX;
        const rayDir1Y = dirY + planeY;
        const posZ = 0.5 * VIEW_H;
        // Step every OTHER column then duplicate — halves the inner loop
        // work at the cost of slight visual blockiness on the floor pattern.
        const STEP = 2;
        for (let y = halfH + 1; y < VIEW_H; y++) {
            const py2 = y - halfH;
            const rowDist = posZ / py2;
            const stepX = rowDist * (rayDir1X - rayDir0X) / W * STEP;
            const stepY = rowDist * (rayDir1Y - rayDir0Y) / W * STEP;
            let fx = p.x + rowDist * rayDir0X;
            let fy = p.y + rowDist * rayDir0Y;
            const fade = Math.max(0.3, 1 - rowDist / 8);
            // Pre-scale fade as fixed-point (0..256) for *fade>>8 instead of float*
            const f8 = (fade * 256) | 0;
            const ceilY = VIEW_H - y - 1;
            const rowBase = y * W * 4;
            const cRowBase = ceilY * W * 4;
            if (fastMask) {
                for (let x = 0; x < W; x += STEP) {
                    // Use (fx * fw | 0) & mask — matches original sampling
                    // formula at high speed since power-of-2 masks bypass %.
                    // Add fw*4 before mask to handle small negative fx without
                    // garbage (we have walls at 0 so this rarely matters).
                    const fu = (((fx * fw) | 0) + (fw << 2)) & fwMask;
                    const fv = (((fy * fh) | 0) + (fh << 2)) & fhMask;
                    const fi = (fv * fw + fu) << 2;
                    const di = rowBase + (x << 2);
                    const fr = (fdata[fi]     * f8) >> 8;
                    const fg = (fdata[fi + 1] * f8) >> 8;
                    const fb = (fdata[fi + 2] * f8) >> 8;
                    data[di]     = fr;
                    data[di + 1] = fg;
                    data[di + 2] = fb;
                    data[di + 3] = 255;
                    // duplicate to next column
                    data[di + 4] = fr;
                    data[di + 5] = fg;
                    data[di + 6] = fb;
                    data[di + 7] = 255;
                    // Ceiling
                    const cu = (((fx * cw) | 0) + (cw << 2)) & cwMask;
                    const cv = (((fy * ch) | 0) + (ch << 2)) & chMask;
                    const ci = (cv * cw + cu) << 2;
                    const di2 = cRowBase + (x << 2);
                    const cr = (cdata[ci]     * f8) >> 8;
                    const cg = (cdata[ci + 1] * f8) >> 8;
                    const cb = (cdata[ci + 2] * f8) >> 8;
                    data[di2]     = cr;
                    data[di2 + 1] = cg;
                    data[di2 + 2] = cb;
                    data[di2 + 3] = 255;
                    data[di2 + 4] = cr;
                    data[di2 + 5] = cg;
                    data[di2 + 6] = cb;
                    data[di2 + 7] = 255;
                    fx += stepX;
                    fy += stepY;
                }
            } else {
                // Generic path (non-power-of-2 textures)
                for (let x = 0; x < W; x += STEP) {
                    const fu = (((fx * fw) | 0) % fw + fw) % fw;
                    const fv = (((fy * fh) | 0) % fh + fh) % fh;
                    const fi = (fv * fw + fu) << 2;
                    const di = rowBase + (x << 2);
                    const fr = (fdata[fi]     * f8) >> 8;
                    const fg = (fdata[fi + 1] * f8) >> 8;
                    const fb = (fdata[fi + 2] * f8) >> 8;
                    data[di] = fr; data[di + 1] = fg; data[di + 2] = fb; data[di + 3] = 255;
                    data[di + 4] = fr; data[di + 5] = fg; data[di + 6] = fb; data[di + 7] = 255;
                    const cu = (((fx * cw) | 0) % cw + cw) % cw;
                    const cv = (((fy * ch) | 0) % ch + ch) % ch;
                    const ci = (cv * cw + cu) << 2;
                    const di2 = cRowBase + (x << 2);
                    const cr = (cdata[ci]     * f8) >> 8;
                    const cg = (cdata[ci + 1] * f8) >> 8;
                    const cb = (cdata[ci + 2] * f8) >> 8;
                    data[di2] = cr; data[di2 + 1] = cg; data[di2 + 2] = cb; data[di2 + 3] = 255;
                    data[di2 + 4] = cr; data[di2 + 5] = cg; data[di2 + 6] = cb; data[di2 + 7] = 255;
                    fx += stepX;
                    fy += stepY;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    // Pull pixel data once and cache on the image element to avoid the
    // ~1ms cost of getImageData per frame.
    _getTexData(img) {
        if (img._cachedTexData) return img._cachedTexData;
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(img, 0, 0);
        img._cachedTexData = cx.getImageData(0, 0, c.width, c.height).data;
        return img._cachedTexData;
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
            if (cell >= 1 && cell <= 11) {
                // R537/R538b: procedural wall-texture variation. Map data
                // uses mostly tile id 1 (cubicle). Hash (mapX,mapY) and
                // substitute textures 2-11. Floor 11 corridors now have
                // 11 distinct wall faces mixed by deterministic hash so
                // the same tile always looks the same but adjacent walls
                // vary — eliminating the "TEAMWORK on repeat" feel.
                let effectiveCell = cell;
                if (cell === 1) {
                    const phash = ((mapX * 2654435761) ^ (mapY * 40503) ^ 0xDEADBEEF) >>> 0;
                    const r = phash % 100;
                    if (r < 8)       effectiveCell = 2;  // wood door (8%)
                    else if (r < 14) effectiveCell = 3;  // glass+racks (6%)
                    else if (r < 19) effectiveCell = 4;  // bathroom tile (5%)
                    else if (r < 22) effectiveCell = 5;  // vending machine (3%)
                    else if (r < 28) effectiveCell = 6;  // water cooler (6%)
                    else if (r < 33) effectiveCell = 7;  // copier (5%)
                    else if (r < 37) effectiveCell = 8;  // fire extinguisher (4%)
                    else if (r < 42) effectiveCell = 9;  // open server rack (5%)
                    else if (r < 48) effectiveCell = 10; // PERSISTENCE poster (6%)
                    else if (r < 53) effectiveCell = 11; // sticky-note chaos (5%)
                    // else stays as 1 (cubicle baseline ~47%)
                }
                tex = sprites.images?.get(`doom_wall_${effectiveCell}`);
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
                // R461: per-cell variation — hash (mapX, mapY) to permute the
                // texture so identical adjacent tiles don't read as one
                // repeated poster wall. Three permutations: identity,
                // horizontal mirror, half-width offset.
                const hash = ((mapX * 73856093) ^ (mapY * 19349663)) >>> 0;
                const variant = hash % 3;
                if (variant === 1) texX = tex.width - texX - 1;          // mirror
                else if (variant === 2) texX = (texX + (tex.width / 2)) % tex.width | 0;   // offset
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

    // R492: Doom-1 style HUD bar. Three bordered panels — LEFT (HP+ammo
    // numerics), CENTER (Clippy face that bloodies with damage), RIGHT
    // (weapons + keycards). Score + stage label at the very bottom.
    _drawHud() {
        const ctx = this.ctx;
        const p = this.player;
        const y = H - HUD_H;
        // Background panel — dark blue-grey with a top highlight + bottom shadow
        ctx.fillStyle = '#181820';
        ctx.fillRect(0, y, W, HUD_H);
        // Subtle gradient — top is brighter, bottom darker
        const grad = ctx.createLinearGradient(0, y, 0, y + HUD_H);
        grad.addColorStop(0, 'rgba(80, 80, 100, 0.18)');
        grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, W, HUD_H);
        // Top edge highlight
        ctx.fillStyle = '#606078';
        ctx.fillRect(0, y, W, 1);
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, y + 1, W, 1);

        // --- panel dividers ---
        // Three sections: left (0-86), center (86-170), right (170-256)
        const leftX = 0, leftW = 86;
        const centerX = 86, centerW = 84;
        const rightX = 170, rightW = 86;
        // Vertical dividers
        ctx.fillStyle = '#404048';
        ctx.fillRect(leftX + leftW - 1, y + 2, 1, HUD_H - 4);
        ctx.fillRect(centerX + centerW - 1, y + 2, 1, HUD_H - 4);

        // --- LEFT PANEL: HP bar + ammo numeric ---
        // "HEALTH" label
        drawText(ctx, 'HEALTH', leftX + 4, y + 4, '#a0a0b0', 1, 'left');
        // HP bar — bigger chunks, brighter
        const hpBarY = y + 13;
        for (let i = 0; i < p.maxHp; i++) {
            const filled = i < p.hp;
            ctx.fillStyle = filled ? '#ff4040' : '#400808';
            ctx.fillRect(leftX + 4 + i * 8, hpBarY, 6, 10);
            // Top highlight on filled cells
            if (filled) {
                ctx.fillStyle = '#ff8080';
                ctx.fillRect(leftX + 4 + i * 8, hpBarY, 6, 1);
            }
        }
        // Heart icon + numeric HP for instant read
        ctx.fillStyle = '#ff4040';
        const hx = leftX + 4, hy = y + 27;
        ctx.fillRect(hx + 0, hy + 1, 2, 1);
        ctx.fillRect(hx + 3, hy + 1, 2, 1);
        ctx.fillRect(hx + 0, hy + 2, 5, 1);
        ctx.fillRect(hx + 1, hy + 3, 3, 1);
        ctx.fillRect(hx + 2, hy + 4, 1, 1);
        drawText(ctx, `${p.hp}/${p.maxHp}`, leftX + 12, y + 27, '#ffffff', 1, 'left');
        // Ammo readout for active weapon
        const w = this._activeWeapon();
        const ammoStr = w.ammo === Infinity ? '--' : String(w.ammo);
        drawText(ctx, 'AMMO', leftX + 50, y + 4, '#a0a0b0', 1, 'left');
        drawText(ctx, ammoStr, leftX + 50, y + 13, '#ffe070', 1, 'left');
        drawText(ctx, w.name, leftX + 50, y + 27, '#80a0c0', 1, 'left');

        // --- CENTER PANEL: bloody Clippy face ---
        // R492: HP-tier face escalation. Uses extended bloody frames when
        // they're loaded; falls back to original 5-frame set otherwise.
        let faceKey = 'doom_face_full';
        if (p.rageFrames > 0 && p.hp <= 1) faceKey = 'doom_face_berserk'; // R492 new
        else if (p.rageFrames > 0) faceKey = 'doom_face_rage';
        else if (p.hp <= 1) faceKey = 'doom_face_hurt3';
        else if (p.hp <= 2) faceKey = 'doom_face_bloody_heavy'; // R492 new
        else if (p.hp <= 3) faceKey = 'doom_face_hurt2';
        else if (p.hp <= 4) faceKey = 'doom_face_bloody_med'; // R492 new
        else if (p.hp <= 5) faceKey = 'doom_face_hurt1';
        // Fallback chain if the new bloody frames aren't loaded yet
        const faceFallbacks = {
            doom_face_bloody_med:   'doom_face_hurt1',
            doom_face_bloody_heavy: 'doom_face_hurt2',
            doom_face_berserk:      'doom_face_rage',
        };
        let faceImg = sprites.images?.get(faceKey);
        if (!faceImg?.complete || faceImg.naturalWidth === 0) {
            const fallback = faceFallbacks[faceKey] || 'doom_face_full';
            faceImg = sprites.images?.get(fallback);
        }
        // Face well — slight inset panel
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(centerX + 18, y + 2, 48, 36);
        ctx.fillStyle = '#403040';
        ctx.fillRect(centerX + 18, y + 2, 48, 1);
        ctx.fillRect(centerX + 18, y + 37, 48, 1);
        ctx.fillRect(centerX + 18, y + 2, 1, 36);
        ctx.fillRect(centerX + 65, y + 2, 1, 36);
        if (faceImg?.complete && faceImg.naturalWidth > 0) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            const faceSize = 32;
            const fx = (centerX + (centerW - faceSize) / 2) | 0;
            const fy = y + (HUD_H - faceSize) / 2 | 0;
            const shake = (p.iframes > 50) ? ((Math.random() - 0.5) * 2) | 0 : 0;
            ctx.drawImage(faceImg, fx + shake, fy + shake, faceSize, faceSize);
            // R496: white hit-flash overlay during first 8 frames of iframes
            // so each damage event visibly pops on the face panel.
            const flashFrames = 8;
            if (p.iframes > 60 - flashFrames) {
                const t = (p.iframes - (60 - flashFrames)) / flashFrames;
                ctx.globalAlpha = t * 0.6;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(fx + shake, fy + shake, faceSize, faceSize);
                ctx.globalAlpha = 1;
            }
            ctx.restore();
        }
        // Score below face
        // R501: smooth count-up display score that lerps toward the real
        // score over a few frames. Sells each kill as a visible tick-up
        // instead of a snap. Maintains a separate _hudScore tween value.
        const realScore = p.score || 0;
        if (this._hudScore == null) this._hudScore = realScore;
        if (this._hudScore < realScore) {
            // Move ~10% of the gap per frame, min 1 to ensure it converges
            const gap = realScore - this._hudScore;
            const step = Math.max(1, Math.floor(gap * 0.12));
            this._hudScore = Math.min(realScore, this._hudScore + step);
        } else if (this._hudScore > realScore) {
            this._hudScore = realScore;   // score reset (rare)
        }
        // Score readout — pulses yellow→white when actively counting up
        const counting = this._hudScore < realScore;
        const scoreCol = counting ? '#ffffff' : '#ffe070';
        drawText(ctx, `${this._hudScore | 0}`, centerX + centerW / 2, y + HUD_H - 4, scoreCol, 1, 'center');

        // --- RIGHT PANEL: keycards (top row) + weapon slots (bottom row) ---
        drawText(ctx, 'KEYS', rightX + 4, y + 4, '#a0a0b0', 1, 'left');
        const colors = ['red', 'yellow', 'blue'];
        // R499: decrement key-pulse timer
        if (this._keyPulseT > 0) this._keyPulseT--;
        for (let i = 0; i < colors.length; i++) {
            const c = colors[i];
            const has = this.keys.has(c);
            const kx = rightX + 4 + i * 12;
            const ky = y + 13;
            // R499: pulse the just-picked-up key
            const pulsing = this._keyPulseT > 0 && this._keyPulseColor === c;
            const pulse = pulsing ? (Math.sin(this._keyPulseT * 0.5) + 1) * 0.5 : 0;
            // Outline frame
            ctx.fillStyle = pulsing ? '#ffffff' : '#202028';
            ctx.fillRect(kx - (pulsing ? 1 : 0), ky - (pulsing ? 1 : 0),
                         10 + (pulsing ? 2 : 0), 10 + (pulsing ? 2 : 0));
            if (has) {
                const baseCol = c === 'red' ? '#ff4040' : c === 'yellow' ? '#ffff40' : '#4080ff';
                ctx.fillStyle = pulsing && pulse > 0.5 ? '#ffffff' : baseCol;
                ctx.fillRect(kx + 1, ky + 1, 8, 8);
                // White highlight
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(kx + 2, ky + 2, 2, 1);
            } else {
                // Empty slot — faint X
                ctx.fillStyle = '#383848';
                ctx.fillRect(kx + 2, ky + 4, 6, 1);
            }
        }
        // Weapon slots
        drawText(ctx, 'WEAPONS', rightX + 4, y + 27, '#a0a0b0', 1, 'left');
        const wKeys = ['mg', 'shotgun', 'chainsaw', 'bfg'];
        for (let i = 0; i < wKeys.length; i++) {
            const w2 = p.weapons[wKeys[i]];
            const isActive = (p.weaponIdx === i);
            const wx = rightX + 50 + i * 9;
            const wy = y + 27;
            // R508: active slot draws as bright yellow numeral on dark bg
            // (was black-on-implicit-yellow but the bg fill was never drawn,
            // so active slot was effectively invisible against #181820 HUD)
            if (isActive) {
                ctx.fillStyle = '#ffe070';
                ctx.fillRect(wx - 1, wy - 1, 6, 8);
                drawText(ctx, String(i + 1), wx, wy, '#181820', 1, 'left');
            } else {
                const col = w2.owned ? '#ffffff' : '#404048';
                drawText(ctx, String(i + 1), wx, wy, col, 1, 'left');
            }
        }

        // R441: combo indicator — top-center above HUD strip (was right)
        if (this._lastKillT != null) {
            const since = this.t - this._lastKillT;
            if (since < 240 && this._comboCount >= 2) {
                const fade = 1 - (since / 240);
                ctx.save();
                ctx.globalAlpha = fade;
                const txt = `×${this._comboCount}`;
                const col = this._comboCount >= 5 ? '#ff80ff' :
                            this._comboCount >= 4 ? '#ff8050' :
                            this._comboCount >= 3 ? '#ffe070' : '#80ff80';
                drawTextOutlined(ctx, txt, W - 6, y - 14, col, '#000000', 2, 'right');
                const barW = 30;
                ctx.fillStyle = '#000';
                ctx.fillRect(W - 6 - barW, y - 4, barW, 2);
                ctx.fillStyle = col;
                ctx.fillRect(W - 6 - barW, y - 4, barW * fade, 2);
                ctx.restore();
            }
        }
        // Stage name — top edge of HUD strip, full width centered
        drawTextOutlined(ctx, this.data.name || 'FLOOR 11', W / 2, y - 8, '#ffe070', '#000000', 1, 'center');
    }

    // R498: tiny corner radar — shows walls + entities within RADAR_TILES
    // of the player. Always visible but small (8% of screen). Tab opens the
    // full automap as before.
    _drawRadar() {
        const ctx = this.ctx;
        const RADAR_PX = 50;       // total radar size
        const RADAR_TILES = 6;     // half-extent in world units
        const ox = W - RADAR_PX - 4;
        const oy = 4;
        const p = this.player;
        // Backplate
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(ox - 1, oy - 1, RADAR_PX + 2, RADAR_PX + 2);
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(ox, oy, RADAR_PX, RADAR_PX);
        ctx.strokeStyle = '#404048';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox, oy, RADAR_PX, RADAR_PX);
        // Walls within radar range — draw as small dark blocks
        const pxPerTile = RADAR_PX / (RADAR_TILES * 2);
        const cx0 = Math.floor(p.x - RADAR_TILES);
        const cy0 = Math.floor(p.y - RADAR_TILES);
        const cx1 = Math.ceil(p.x + RADAR_TILES);
        const cy1 = Math.ceil(p.y + RADAR_TILES);
        for (let my = cy0; my <= cy1; my++) {
            if (my < 0 || my >= this.mapH) continue;
            for (let mx = cx0; mx <= cx1; mx++) {
                if (mx < 0 || mx >= this.mapW) continue;
                const cell = this.map[my][mx];
                if (!cell || this.doorsOpened.has(`${mx},${my}`)) continue;
                const rx = ox + (mx - p.x + RADAR_TILES) * pxPerTile;
                const ry = oy + (my - p.y + RADAR_TILES) * pxPerTile;
                ctx.fillStyle = '#506060';
                ctx.fillRect(rx | 0, ry | 0, Math.max(1, pxPerTile | 0), Math.max(1, pxPerTile | 0));
            }
        }
        // Entities — red enemies, colored keys, etc.
        for (const e of this.entities) {
            if (!e.alive) continue;
            const dx = e.x - p.x, dy = e.y - p.y;
            if (Math.abs(dx) > RADAR_TILES || Math.abs(dy) > RADAR_TILES) continue;
            let col = null;
            if (e.kind === 'clone') col = '#ff4040';
            else if (e.kind === 'boss') col = '#ff80ff';
            else if (e.kind === 'key') col = (e.color === 'red' ? '#ff4040' : e.color === 'yellow' ? '#ffff40' : '#4080ff');
            else if (e.kind === 'health') col = '#40c050';
            else if (e.kind === 'ammo') col = '#c0a040';
            else if (e.kind === 'weapon') col = '#a0a0a8';
            else if (e.kind === 'barrel') col = '#c04030';
            if (col) {
                const rx = ox + (e.x - p.x + RADAR_TILES) * pxPerTile;
                const ry = oy + (e.y - p.y + RADAR_TILES) * pxPerTile;
                ctx.fillStyle = col;
                ctx.fillRect((rx - 1) | 0, (ry - 1) | 0, 2, 2);
            }
        }
        // Player dot + facing
        const cx = ox + RADAR_PX / 2;
        const cy = oy + RADAR_PX / 2;
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
        ctx.strokeStyle = '#ffe070';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(p.angle) * 6, cy + Math.sin(p.angle) * 6);
        ctx.stroke();
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
        // R437: pulsing exit pad indicator on minimap (only after boss kill)
        if (this._exitTilePos) {
            const pulse = (Math.sin(this.t * 0.15) + 1) * 0.5;
            ctx.fillStyle = pulse > 0.5 ? '#80ffa0' : '#208040';
            const ex = ox + this._exitTilePos.x * SIZE | 0;
            const ey = oy + this._exitTilePos.y * SIZE | 0;
            ctx.fillRect(ex - 3, ey - 3, 6, 6);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(ex - 1, ey - 1, 2, 2);
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

    // R436: full-screen automap (Tab toggle). Doom-style wireframe view of
    // the entire level — walls drawn as line outlines, player arrow at
    // their current position + heading, keys/items pinned with color dots.
    _drawAutomap() {
        const ctx = this.ctx;
        // Black backdrop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
        ctx.fillRect(0, 0, W, H);
        // Fit map to viewport (leave 16px padding all sides; HUD strip stays
        // exposed at bottom so weapon row + HP read while map is open)
        const padT = 18, padL = 8, padR = 8, padB = HUD_H + 4;
        const availW = W - padL - padR;
        const availH = H - padT - padB;
        const SIZE = Math.max(2, Math.min((availW / this.mapW) | 0, (availH / this.mapH) | 0));
        const mapPxW = this.mapW * SIZE;
        const mapPxH = this.mapH * SIZE;
        const ox = padL + (availW - mapPxW) / 2 | 0;
        const oy = padT + (availH - mapPxH) / 2 | 0;
        // Title
        drawText(ctx, 'AUTOMAP', W / 2, 4, '#ffe070', 1, 'center');
        drawText(ctx, 'TAB TO CLOSE', W / 2, H - HUD_H - 6, '#a0a0b0', 1, 'center');
        // Walls — DOOM-style outlines instead of fill blocks so adjacent
        // walls don't merge into a solid blob. Draw each wall tile's
        // exposed edges (any edge adjacent to an empty tile gets a line).
        ctx.strokeStyle = '#a08070';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let my = 0; my < this.mapH; my++) {
            for (let mx = 0; mx < this.mapW; mx++) {
                const cell = this.map[my][mx];
                const open = this.doorsOpened.has(`${mx},${my}`);
                if (!cell || open) continue;
                const x = ox + mx * SIZE;
                const y = oy + my * SIZE;
                // Top edge
                if (my === 0 || !this.map[my - 1][mx] || this.doorsOpened.has(`${mx},${my - 1}`)) {
                    ctx.moveTo(x, y); ctx.lineTo(x + SIZE, y);
                }
                // Bottom
                if (my === this.mapH - 1 || !this.map[my + 1][mx] || this.doorsOpened.has(`${mx},${my + 1}`)) {
                    ctx.moveTo(x, y + SIZE); ctx.lineTo(x + SIZE, y + SIZE);
                }
                // Left
                if (mx === 0 || !this.map[my][mx - 1] || this.doorsOpened.has(`${mx - 1},${my}`)) {
                    ctx.moveTo(x, y); ctx.lineTo(x, y + SIZE);
                }
                // Right
                if (mx === this.mapW - 1 || !this.map[my][mx + 1] || this.doorsOpened.has(`${mx + 1},${my}`)) {
                    ctx.moveTo(x + SIZE, y); ctx.lineTo(x + SIZE, y + SIZE);
                }
            }
        }
        ctx.stroke();
        // Color-code doors
        for (let my = 0; my < this.mapH; my++) {
            for (let mx = 0; mx < this.mapW; mx++) {
                const cell = this.map[my][mx];
                if (this.doorsOpened.has(`${mx},${my}`)) continue;
                const info = WALL_LIGHT[cell];
                if (!info || (info.kind !== 'door' && info.kind !== 'doorKey' && info.kind !== 'switch')) continue;
                const col = info.kind === 'switch' ? '#80a0ff' :
                            info.kind === 'door' ? '#806040' :
                            info.key === 'red' ? '#ff4040' :
                            info.key === 'yellow' ? '#ffff40' :
                            info.key === 'blue' ? '#4080ff' : '#a0a0a0';
                ctx.fillStyle = col;
                ctx.fillRect(ox + mx * SIZE + 1, oy + my * SIZE + 1, SIZE - 2, SIZE - 2);
            }
        }
        // Entities — bigger dots than minimap
        for (const e of this.entities) {
            if (!e.alive) continue;
            let col = null;
            let r = 3;
            if (e.kind === 'clone') { col = '#ff4040'; r = 3; }
            else if (e.kind === 'boss') { col = '#ff80ff'; r = 5; }
            else if (e.kind === 'key') {
                col = (e.color === 'red' ? '#ff4040' : e.color === 'yellow' ? '#ffff40' : '#4080ff');
                r = 4;
            }
            else if (e.kind === 'health') { col = '#40c050'; r = 3; }
            else if (e.kind === 'ammo') { col = '#c0a040'; r = 3; }
            else if (e.kind === 'weapon') { col = '#a0a0a8'; r = 4; }
            if (col) {
                ctx.fillStyle = col;
                ctx.fillRect(ox + e.x * SIZE - r / 2, oy + e.y * SIZE - r / 2, r, r);
            }
        }
        // Player arrow
        const p = this.player;
        const ppx = ox + p.x * SIZE;
        const ppy = oy + p.y * SIZE;
        ctx.fillStyle = '#ffe070';
        ctx.fillRect(ppx - 2, ppy - 2, 4, 4);
        // Heading line — longer so visible on full map
        ctx.strokeStyle = '#ffe070';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ppx, ppy);
        ctx.lineTo(ppx + Math.cos(p.angle) * 10, ppy + Math.sin(p.angle) * 10);
        ctx.stroke();
        // Legend
        let lx = 6, ly = H - HUD_H - 24;
        const swatch = (label, color) => {
            ctx.fillStyle = color;
            ctx.fillRect(lx, ly, 4, 4);
            drawText(ctx, label, lx + 8, ly - 1, color, 1, 'left');
            lx += label.length * 6 + 18;
        };
        swatch('YOU', '#ffe070');
        swatch('BOSS', '#ff80ff');
        swatch('KEY', '#4080ff');
    }
}

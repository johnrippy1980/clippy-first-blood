// Input layer. Keyboard + gamepad + touch.
// Tracks pressed (current frame), held (continuous), and buffered (press in last N ms)
// so sub-tick taps still register. This is critical for tight Contra-style controls.

import { options } from './options.js';

const PRESS_BUFFER_MS = 100;

const DEFAULT_KEYMAP = {
    'ArrowLeft': 'left',   'a': 'left',  'A': 'left',
    'ArrowRight': 'right', 'd': 'right', 'D': 'right',
    'ArrowUp': 'up',       'w': 'up',    'W': 'up',
    'ArrowDown': 'down',   's': 'down',  'S': 'down',
    ' ': 'jump',           'z': 'jump',  'Z': 'jump',
    'x': 'shoot',          'X': 'shoot',
    'c': 'special',        'C': 'special',
    'v': 'grenade',        'V': 'grenade',
    'b': 'shield',         'B': 'shield',
    'Shift': 'aimlock',
    'Enter': 'start',
    'Escape': 'pause',     'p': 'pause', 'P': 'pause',
    'm': 'mute',           'M': 'mute',
    'Tab': 'cycle',        'q': 'cycle', 'Q': 'cycle',
    // R568 (co-op slice 1): tag-team swap. T key for keyboard, gamepad-2
    // START button handled separately in the input.tag() poll. Reserved
    // here so input.isPressed('tag') works.
    't': 'tag',            'T': 'tag',
};

// ============== R691: key rebinding ==============
// The CONTROLS menu writes { action: key } overrides into options
// ('keyBinds'); the effective keymap is rebuilt from defaults + overrides.
// An override replaces the action's ENTIRE default key set, and steals the
// chosen key from whatever action currently holds it.

// Menu/system actions stay fixed so a bad bind can't lock the player out.
export const REBINDABLE_ACTIONS = [
    'left', 'right', 'up', 'down', 'jump', 'shoot',
    'special', 'grenade', 'shield', 'aimlock', 'cycle', 'tag',
];

// Keys of the non-rebindable actions — can never be stolen or assigned.
export const RESERVED_KEYS = new Set(['Enter', 'Escape', 'p', 'P', 'm', 'M']);

// Letter keys register as both cases (shift held / caps lock).
function keyVariants(key) {
    if (key.length === 1 && key.toLowerCase() !== key.toUpperCase()) {
        return [key.toLowerCase(), key.toUpperCase()];
    }
    return [key];
}

let keymap = { ...DEFAULT_KEYMAP };

function rebuildKeymap() {
    const overrides = options.get('keyBinds') || {};
    const m = {};
    for (const [k, a] of Object.entries(DEFAULT_KEYMAP)) {
        // A remapped action drops all of its default keys.
        if (overrides[a] !== undefined) continue;
        m[k] = a;
    }
    for (const key of Object.values(overrides)) {
        // Steal pass — free the chosen keys from default owners first so
        // assignment order can't matter.
        for (const v of keyVariants(key)) delete m[v];
    }
    for (const [a, key] of Object.entries(overrides)) {
        for (const v of keyVariants(key)) m[v] = a;
    }
    keymap = m;
}

// Effective keys for an action, case-deduped ('a'/'A' -> 'A'), in a stable
// order. Used by the CONTROLS menu + READY-screen keymap card.
export function keysForAction(action) {
    const out = [];
    for (const [k, a] of Object.entries(keymap)) {
        if (a !== action) continue;
        const canon = k.length === 1 ? k.toUpperCase() : k;
        if (!out.includes(canon)) out.push(canon);
    }
    return out;
}

// Bind `key` as the sole keyboard key for `action`. Returns false (no-op)
// for reserved keys / non-rebindable actions.
export function rebindKey(action, key) {
    if (!REBINDABLE_ACTIONS.includes(action)) return false;
    if (RESERVED_KEYS.has(key)) return false;
    const next = { ...(options.get('keyBinds') || {}) };
    // Steal from any other override that holds this key — that action
    // falls back to its defaults.
    for (const [a, k] of Object.entries(next)) {
        if (a !== action && keyVariants(k).some(v => keyVariants(key).includes(v))) {
            delete next[a];
        }
    }
    next[action] = key;
    options.set('keyBinds', next);
    rebuildKeymap();
    input.releaseAll();
    return true;
}

export function resetKeyBindings() {
    options.set('keyBinds', {});
    rebuildKeymap();
    input.releaseAll();
}

// ============== R693: gamepad button rebinding ==============
// Same override model as keyBinds: the CONTROLS menu writes
// { action: buttonIndex } into options ('padBinds'); the effective pad
// map is rebuilt from defaults + overrides. An override replaces the
// action's ENTIRE default button set and steals the chosen button from
// whatever action currently holds it.

const DEFAULT_PADMAP = {
    jump:    [0],       // A
    special: [1],       // B
    shoot:   [2],       // X
    grenade: [3],       // Y
    shield:  [4],       // LB
    aimlock: [5],       // RB
    // Pad players had NO tag button before R693 — the R568 comment above
    // promised a gamepad-2 START poll that was never built. LT was unused.
    tag:     [6],
    cycle:   [8, 10],   // Back/Select + left-stick click (some pads omit Back)
};

// Directions ride the d-pad/left stick and START drives pause/start —
// fixed so a bad bind can't strand menu navigation.
export const PAD_REBINDABLE_ACTIONS = Object.keys(DEFAULT_PADMAP);
export const RESERVED_PAD_BUTTONS = new Set([9, 12, 13, 14, 15]);

let padmap = {};    // buttonIndex -> action

function rebuildPadmap() {
    const overrides = options.get('padBinds') || {};
    const m = {};
    for (const [a, btns] of Object.entries(DEFAULT_PADMAP)) {
        // A remapped action drops all of its default buttons.
        if (overrides[a] !== undefined) continue;
        for (const b of btns) m[b] = a;
    }
    // Steal pass — free the chosen buttons from default owners first so
    // assignment order can't matter.
    for (const b of Object.values(overrides)) delete m[b];
    for (const [a, b] of Object.entries(overrides)) m[b] = a;
    padmap = m;
}

// Effective buttons for an action, ascending. Used by the CONTROLS menu.
export function padButtonsForAction(action) {
    const out = [];
    for (const [b, a] of Object.entries(padmap)) {
        if (a === action) out.push(Number(b));
    }
    return out.sort((x, y) => x - y);
}

// Bind `btn` as the sole pad button for `action`. Returns false (no-op)
// for reserved buttons / non-pad-rebindable actions.
export function rebindPadButton(action, btn) {
    if (!PAD_REBINDABLE_ACTIONS.includes(action)) return false;
    if (RESERVED_PAD_BUTTONS.has(btn)) return false;
    const next = { ...(options.get('padBinds') || {}) };
    for (const [a, b] of Object.entries(next)) {
        if (a !== action && b === btn) delete next[a];
    }
    next[action] = btn;
    options.set('padBinds', next);
    rebuildPadmap();
    input.releaseAll();
    return true;
}

export function resetPadBindings() {
    options.set('padBinds', {});
    rebuildPadmap();
    input.releaseAll();
}

// Apply persisted overrides at load.
rebuildKeymap();
rebuildPadmap();

class Input {
    constructor() {
        this.held = new Set();        // currently down
        this.pressed = new Set();     // pressed this tick
        this.released = new Set();    // released this tick
        this.pressTimes = new Map();  // action -> ms timestamp of last press
        this.gamepadIndex = null;
        this.touchPad = null;
        // 360-degree aim. Mouse position relative to player, OR right-stick.
        // Stored as unit vector (ax, ay) and computed angle (radians).
        this.aimVec = { x: 1, y: 0 };
        this.aimAngle = 0;
        this.aimActive = false;       // true when mouse moved or stick non-zero
        this.mouseX = 0; this.mouseY = 0;
        // R423b: relative mouse motion for Doom-mode look. Accumulated each
        // mousemove, consumed (zeroed) by getMouseDelta() once per frame.
        this.mouseDx = 0; this.mouseDy = 0;
        this.pointerLocked = false;
        // R659: per-source held tracking. The gamepad poll used to call
        // _up() for every unpressed button EVERY tick, so a connected but
        // idle controller released keyboard-held actions continuously —
        // keyboard play was broken the moment a pad was plugged in. Keyboard
        // and gamepad each track their own held set; an action only truly
        // releases when neither source still holds it.
        this._kbHeld = new Set();
        this._padHeld = new Set();
        // R686: pointer (mouse + touch overlay) is the third input source.
        // Without its own held set, a keyboard/pad release for the same
        // action dropped an active mouse/touch hold (e.g. keyup on the fire
        // key silently released a held left-button autofire).
        this._ptrHeld = new Set();

        // R691: one-shot key capture for the CONTROLS rebind menu. When
        // armed, the next keydown goes to the callback INSTEAD of the
        // action dispatch (so pressing the current shoot key to rebind it
        // doesn't also fire a shot).
        this._captureCb = null;
        // R693: pad-button counterpart, serviced by _pollGamepad.
        this._padCaptureCb = null;
        this._padCapturePrev = null;

        window.addEventListener('keydown', e => {
            if (this._captureCb) {
                e.preventDefault();
                const cb = this._captureCb;
                this._captureCb = null;
                cb(e.key);
                return;
            }
            const a = keymap[e.key];
            if (!a) return;
            this._kbHeld.add(a);
            this._down(a);
        });
        window.addEventListener('keyup', e => {
            const a = keymap[e.key];
            if (!a) return;
            this._kbHeld.delete(a);
            if (!this._padHeld.has(a) && !this._ptrHeld.has(a)) this._up(a);
        });
        window.addEventListener('gamepadconnected', e => { this.gamepadIndex = e.gamepad.index; });
        window.addEventListener('gamepaddisconnected', () => {
            this.gamepadIndex = null;
            // R659: polling stops on disconnect, so anything the pad was
            // holding would stay stuck in `held` forever. Release it all
            // (unless the keyboard also holds it).
            for (const a of this._padHeld) {
                if (!this._kbHeld.has(a) && !this._ptrHeld.has(a)) this._up(a);
            }
            this._padHeld.clear();
        });

        // R198: browsers don't fire keyup for held keys when the window
        // loses focus, so a key held during a tab-switch / minimize stays
        // stuck in `held` forever. Coming back, the player walks left
        // forever or can't move because a directional input is pinned.
        // Clear all input state whenever focus leaves the window or the
        // tab is hidden — much safer than trying to track which keys
        // might or might not still be physically down.
        window.addEventListener('blur', () => this.releaseAll());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.releaseAll();
        });

        // Prevent scrolling with arrow keys / space + Tab focus-switch.
        window.addEventListener('keydown', e => {
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Tab'].includes(e.key)) {
                e.preventDefault();
            }
        });

        this._setupTouch();
        this._setupMouse();
    }

    _setupMouse() {
        const canvas = (typeof document !== 'undefined') ? document.getElementById('screen') : null;
        if (!canvas || typeof canvas.addEventListener !== 'function') return;
        canvas.addEventListener('mousemove', e => {
            // R468: while pointer is locked (Doom mode), clientX/Y is
            // pinned to lock-time coords or canvas center depending on
            // browser. Don't update absolute mouseX/Y or aimActive — those
            // belong to non-locked aim flows (platformer/beat-em-up). Only
            // accumulate the relative movementX/Y delta for Doom yaw.
            if (this.pointerLocked) {
                this.mouseDx += e.movementX || 0;
                this.mouseDy += e.movementY || 0;
                return;
            }
            const rect = canvas.getBoundingClientRect();
            // Scale mouse to canvas-internal coords (256x224 internal)
            const sx = (e.clientX - rect.left) / rect.width * 256;
            const sy = (e.clientY - rect.top) / rect.height * 224;
            this.mouseX = sx;
            this.mouseY = sy;
            this.aimActive = true;
        });
        // R423b: pointer-lock tracking. Doom engine calls requestLock() on
        // first canvas click; this state lets gameplay code differentiate
        // "mouse aim available raw" vs "mouse aim from position only."
        document.addEventListener('pointerlockchange', () => {
            const wasLocked = this.pointerLocked;
            this.pointerLocked = (document.pointerLockElement === canvas);
            // R468: when pointer is RELEASED (e.g. exiting Doom mode), drop
            // aimActive so platformer falls back to keyboard aim until the
            // user actually moves the mouse. Without this, mouseX/Y could
            // be stale at whatever position they had pre-Doom — making the
            // platformer aim point at a fixed off-screen spot.
            if (wasLocked && !this.pointerLocked) {
                this.aimActive = false;
                this.mouseDx = 0;
                this.mouseDy = 0;
            }
        });
        canvas.addEventListener('mousedown', e => {
            if (e.button === 0) this._ptrDown('shoot');
        });
        canvas.addEventListener('mouseup', e => {
            if (e.button === 0) this._ptrUp('shoot');
            if (e.button === 2) this._ptrUp('special');
        });
        canvas.addEventListener('mousedown', e => {
            // Right-click triggers special (back-dash)
            if (e.button === 2) { this._ptrDown('special'); }
        });
        // Suppress right-click menu so back-dash works
        canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
        });
        // Middle-click = aim-lock toggle (alternate to Shift)
        canvas.addEventListener('mousedown', e => { if (e.button === 1) this._ptrDown('aimlock'); });
        canvas.addEventListener('mouseup',   e => { if (e.button === 1) this._ptrUp('aimlock'); });
        // Hide cursor over canvas — we draw our own reticule
        canvas.style.cursor = 'none';
    }

    // R423b: consume and clear accumulated mouse delta since last frame.
    // Used by Doom engine for view-angle turning. Returns { dx, dy }.
    getMouseDelta() {
        const dx = this.mouseDx;
        const dy = this.mouseDy;
        this.mouseDx = 0;
        this.mouseDy = 0;
        return { dx, dy };
    }

    // R453: gamepad right-stick X for Doom-mode yaw. Returns -1..1 (deadzone'd).
    getGamepadTurn() {
        return this.gamepadTurnX || 0;
    }

    // R666: fire-and-forget dual-rumble pulse. Silently no-ops without a
    // connected pad or actuator support (Chrome: vibrationActuator,
    // Firefox: hapticActuators[0]). strong = low-frequency motor (body
    // thump), weak = high-frequency motor (texture buzz).
    rumble(strong = 1.0, weak = 0.5, ms = 120) {
        if (this.gamepadIndex == null) return;
        const gp = navigator.getGamepads?.()[this.gamepadIndex];
        const act = gp?.vibrationActuator || gp?.hapticActuators?.[0];
        if (!act?.playEffect) return;
        act.playEffect('dual-rumble', {
            duration: ms,
            strongMagnitude: Math.min(1, Math.max(0, strong)),
            weakMagnitude: Math.min(1, Math.max(0, weak)),
        }).catch(() => {});
    }

    // R423b: request pointer-lock on the canvas. Browsers require this be
    // called from a user gesture; the Doom engine calls it from a click
    // handler. Safe to call when already locked — browser no-ops.
    requestPointerLock() {
        const canvas = (typeof document !== 'undefined') ? document.getElementById('screen') : null;
        if (canvas && canvas.requestPointerLock) canvas.requestPointerLock();
    }

    // Compute aim relative to a player position. Returns { x, y, angle }.
    aimFor(playerScreenX, playerScreenY) {
        if (this.aimActive) {
            const dx = this.mouseX - playerScreenX;
            const dy = this.mouseY - playerScreenY;
            const d = Math.hypot(dx, dy) || 1;
            return { x: dx / d, y: dy / d, angle: Math.atan2(dy, dx) };
        }
        // Fall back to keyboard direction axes
        const x = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
        const y = (this.isHeld('down')  ? 1 : 0) - (this.isHeld('up')   ? 1 : 0);
        if (x === 0 && y === 0) return { x: 1, y: 0, angle: 0 };
        const d = Math.hypot(x, y);
        return { x: x / d, y: y / d, angle: Math.atan2(y, x) };
    }

    // R686: pointer-source wrappers. Mouse buttons and touch-overlay buttons
    // register in _ptrHeld so the keyboard/pad release paths know the action
    // is still physically held by a pointer.
    _ptrDown(action) {
        if (!action) return;
        this._ptrHeld.add(action);
        this._down(action);
    }

    _ptrUp(action) {
        if (!action) return;
        this._ptrHeld.delete(action);
        if (!this._kbHeld.has(action) && !this._padHeld.has(action)) this._up(action);
    }

    _down(action) {
        if (!action) return;
        if (!this.held.has(action)) {
            this.pressed.add(action);
            this.pressTimes.set(action, performance.now());
        }
        this.held.add(action);
    }

    _up(action) {
        if (!action) return;
        if (this.held.has(action)) {
            this.released.add(action);
        }
        this.held.delete(action);
    }

    // Was the action pressed this tick?
    isPressed(a) { return this.pressed.has(a); }
    // Is it currently held down?
    isHeld(a) { return this.held.has(a); }
    isReleased(a) { return this.released.has(a); }

    // R198: full state wipe. Called on focus loss + when exiting a scene
    // that didn't tick the player (boss intro cinematic). Keeps held keys
    // from the pre-cinematic frame from being inherited into PLAY.
    releaseAll() {
        this.held.clear();
        this.pressed.clear();
        this.released.clear();
        this.pressTimes.clear();
        this._kbHeld.clear();
        this._padHeld.clear();
        this._ptrHeld.clear();
    }

    // R691: arm/disarm the one-shot rebind capture (see keydown handler).
    beginKeyCapture(cb) { this._captureCb = cb; }
    cancelKeyCapture()  { this._captureCb = null; }

    // R693: arm/disarm the one-shot pad-button capture (see _pollGamepad).
    beginPadCapture(cb) { this._padCaptureCb = cb; this._padCapturePrev = null; }
    cancelPadCapture()  { this._padCaptureCb = null; }

    // Was it pressed in the last PRESS_BUFFER_MS? Useful for forgiving jump input.
    isBuffered(a) {
        const t = this.pressTimes.get(a);
        if (t == null) return false;
        return performance.now() - t < PRESS_BUFFER_MS;
    }
    // Consume the buffered press so the next isBuffered() returns false.
    consume(a) { this.pressTimes.delete(a); }

    // Returns -1/0/+1 for horizontal, vertical.
    axis() {
        const x = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
        const y = (this.isHeld('down')  ? 1 : 0) - (this.isHeld('up')   ? 1 : 0);
        return { x, y };
    }

    update() {
        this._pollGamepad();
    }

    // Called at the END of each frame to clear per-frame state.
    endFrame() {
        this.pressed.clear();
        this.released.clear();
    }

    _pollGamepad() {
        if (this.gamepadIndex == null) return;
        const gp = navigator.getGamepads?.()[this.gamepadIndex];
        if (!gp) return;

        // R693: one-shot button capture for the CONTROLS rebind menu.
        // Mirrors the keyboard capture: while armed, a fresh button press
        // goes to the callback INSTEAD of action dispatch, and normal pad
        // input is frozen so pressing the current shoot button to rebind
        // it doesn't also fire a shot.
        if (this._padCaptureCb) {
            const down = new Set();
            for (let i = 0; i < gp.buttons.length; i++) {
                if (gp.buttons[i]?.pressed) down.add(i);
            }
            // Snapshot on the first armed poll so a button already held
            // when capture started can't instantly bind itself.
            if (this._padCapturePrev === null) { this._padCapturePrev = down; return; }
            for (const i of down) {
                if (!this._padCapturePrev.has(i)) {
                    const cb = this._padCaptureCb;
                    this._padCaptureCb = null;
                    cb(i);
                    return;
                }
            }
            this._padCapturePrev = down;
            return;
        }

        const dz = 0.35;
        const ax = gp.axes[0] || 0;
        const ay = gp.axes[1] || 0;
        this._set('left',  ax < -dz || gp.buttons[14]?.pressed);
        this._set('right', ax >  dz || gp.buttons[15]?.pressed);
        this._set('up',    ay < -dz || gp.buttons[12]?.pressed);
        this._set('down',  ay >  dz || gp.buttons[13]?.pressed);
        this._set('start', gp.buttons[9]?.pressed);
        this._set('pause', gp.buttons[9]?.pressed);
        // R693: rebindable actions dispatch through the effective padmap
        // (was hardcoded A/B/X/Y/LB/RB + R215's Back/LS for cycle — those
        // live on as DEFAULT_PADMAP). An action with several buttons is
        // held while ANY of them is down.
        const actDown = {};
        for (const [b, a] of Object.entries(padmap)) {
            if (gp.buttons[b]?.pressed) actDown[a] = true;
        }
        for (const a of PAD_REBINDABLE_ACTIONS) this._set(a, !!actDown[a]);
        // Right stick for 360 aim
        const rx = gp.axes[2] || 0;
        const ry = gp.axes[3] || 0;
        // R453: cache right-stick X for Doom-mode yaw input (separate from
        // the aimVec which targets a world point). gamepadTurnX is consumed
        // by the Doom engine via getGamepadTurn() per frame.
        this.gamepadTurnX = Math.abs(rx) > dz ? rx : 0;
        if (Math.hypot(rx, ry) > dz) {
            const d = Math.hypot(rx, ry);
            this.aimVec.x = rx / d;
            this.aimVec.y = ry / d;
            this.aimAngle = Math.atan2(ry, rx);
            this.aimActive = true;
        }
    }

    _set(action, pressed) {
        // R659: edge-triggered per source. Only touch the shared held set on
        // actual pad transitions, and never release an action the keyboard
        // still holds.
        if (pressed) {
            if (!this._padHeld.has(action)) {
                this._padHeld.add(action);
                this._down(action);
            }
        } else if (this._padHeld.has(action)) {
            this._padHeld.delete(action);
            if (!this._kbHeld.has(action) && !this._ptrHeld.has(action)) this._up(action);
        }
    }

    _setupTouch() {
        if (typeof document === 'undefined') return;
        // Only build touch UI on devices that report touch capability. Desktop
        // browsers can still register touch events via dev tools — fine, the
        // overlay just won't show because the CSS rule gates it on (hover:none)
        // OR a manual `data-touch="on"` toggle.
        const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        const overlay = document.getElementById('touch-overlay');
        if (!overlay) return;
        if (!hasTouch) return;
        overlay.setAttribute('data-active', 'true');

        // Each button has an action; press/release dispatches to the input
        // state machine the same way keyboard does. Touch IDs are tracked so
        // overlapping fingers don't fight each other.
        const bind = (id, action) => {
            const el = overlay.querySelector(`[data-act="${id}"]`);
            if (!el) return;
            const start = e => { e.preventDefault(); this._ptrDown(action); el.classList.add('held'); };
            const end   = e => { e.preventDefault(); this._ptrUp(action); el.classList.remove('held'); };
            el.addEventListener('touchstart', start, { passive: false });
            el.addEventListener('touchend', end, { passive: false });
            el.addEventListener('touchcancel', end, { passive: false });
            // pointerdown/up too, so the same overlay works on hybrid pen/touch.
            el.addEventListener('pointerdown', start);
            el.addEventListener('pointerup', end);
            el.addEventListener('pointerleave', end);
        };
        bind('left', 'left');
        bind('right', 'right');
        bind('up', 'up');
        bind('down', 'down');
        bind('jump', 'jump');
        bind('shoot', 'shoot');
        bind('special', 'special');
        bind('grenade', 'grenade');
        bind('shield', 'shield');
        bind('pause', 'pause');
    }
}

export const input = new Input();

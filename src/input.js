// Input layer. Keyboard + gamepad + touch.
// Tracks pressed (current frame), held (continuous), and buffered (press in last N ms)
// so sub-tick taps still register. This is critical for tight Contra-style controls.

const PRESS_BUFFER_MS = 100;

const KEYMAP = {
    'ArrowLeft': 'left',   'a': 'left',  'A': 'left',
    'ArrowRight': 'right', 'd': 'right', 'D': 'right',
    'ArrowUp': 'up',       'w': 'up',    'W': 'up',
    'ArrowDown': 'down',   's': 'down',  'S': 'down',
    ' ': 'jump',           'z': 'jump',  'Z': 'jump',
    'x': 'shoot',          'X': 'shoot',
    'c': 'special',        'C': 'special',
    'Shift': 'aimlock',
    'Enter': 'start',
    'Escape': 'pause',     'p': 'pause', 'P': 'pause',
    'm': 'mute',           'M': 'mute',
};

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

        window.addEventListener('keydown', e => this._down(KEYMAP[e.key]));
        window.addEventListener('keyup', e => this._up(KEYMAP[e.key]));
        window.addEventListener('gamepadconnected', e => { this.gamepadIndex = e.gamepad.index; });
        window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });

        // Prevent scrolling with arrow keys / space
        window.addEventListener('keydown', e => {
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
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
            const rect = canvas.getBoundingClientRect();
            // Scale mouse to canvas-internal coords (256x224 internal)
            const sx = (e.clientX - rect.left) / rect.width * 256;
            const sy = (e.clientY - rect.top) / rect.height * 224;
            this.mouseX = sx;
            this.mouseY = sy;
            this.aimActive = true;
        });
        canvas.addEventListener('mousedown', e => {
            if (e.button === 0) this._down('shoot');
        });
        canvas.addEventListener('mouseup', e => {
            if (e.button === 0) this._up('shoot');
            if (e.button === 2) this._up('special');
        });
        canvas.addEventListener('mousedown', e => {
            // Right-click triggers special (back-dash)
            if (e.button === 2) { this._down('special'); }
        });
        // Suppress right-click menu so back-dash works
        canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
        });
        // Middle-click = aim-lock toggle (alternate to Shift)
        canvas.addEventListener('mousedown', e => { if (e.button === 1) this._down('aimlock'); });
        canvas.addEventListener('mouseup',   e => { if (e.button === 1) this._up('aimlock'); });
        // Hide cursor over canvas — we draw our own reticule
        canvas.style.cursor = 'none';
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
        const dz = 0.35;
        const ax = gp.axes[0] || 0;
        const ay = gp.axes[1] || 0;
        this._set('left',  ax < -dz || gp.buttons[14]?.pressed);
        this._set('right', ax >  dz || gp.buttons[15]?.pressed);
        this._set('up',    ay < -dz || gp.buttons[12]?.pressed);
        this._set('down',  ay >  dz || gp.buttons[13]?.pressed);
        this._set('jump',  gp.buttons[0]?.pressed);     // A
        this._set('shoot', gp.buttons[2]?.pressed);     // X
        this._set('special', gp.buttons[1]?.pressed);   // B
        this._set('aimlock', gp.buttons[5]?.pressed);   // RB
        this._set('start', gp.buttons[9]?.pressed);
        this._set('pause', gp.buttons[9]?.pressed);
        // Right stick for 360 aim
        const rx = gp.axes[2] || 0;
        const ry = gp.axes[3] || 0;
        if (Math.hypot(rx, ry) > dz) {
            const d = Math.hypot(rx, ry);
            this.aimVec.x = rx / d;
            this.aimVec.y = ry / d;
            this.aimAngle = Math.atan2(ry, rx);
            this.aimActive = true;
        }
    }

    _set(action, pressed) {
        if (pressed) this._down(action);
        else this._up(action);
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
            const start = e => { e.preventDefault(); this._down(action); el.classList.add('held'); };
            const end   = e => { e.preventDefault(); this._up(action); el.classList.remove('held'); };
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
        bind('pause', 'pause');
    }
}

export const input = new Input();

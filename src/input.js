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
    }

    _set(action, pressed) {
        if (pressed) this._down(action);
        else this._up(action);
    }

    _setupTouch() {
        if (!('ontouchstart' in window)) return;
        // Touch is added later as overlay UI. Leave hook here.
    }
}

export const input = new Input();

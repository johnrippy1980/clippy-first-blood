// ============================================
// INPUT HANDLER - Keyboard & Gamepad
// ============================================

class InputHandler {
    constructor() {
        // Physical keyboard state (updated continuously by key events)
        this.physicalKeys = {};
        // Combined state read by the rest of the game
        this.keys = {};
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        this.previousKeys = {};
        // One-shot press buffer: a fast keydown+keyup between two updates
        // would otherwise be lost. Set on keydown, drained by update().
        this.pressBuffer = {};

        // Touch-control state - any touch button can synthesize a key
        this.touchKeys = {};
        this.touchActive = false;
        this.touchEnabled = (typeof window !== 'undefined') &&
            ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
        // Gamepad-synthesized keys, refreshed each update()
        this.padKeys = {};
        this.padDeadzone = 0.35;
        this.padConnected = false;

        // Bind keyboard events
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Bind touch events on the game canvas if it exists
        if (this.touchEnabled) {
            const canvas = (typeof document !== 'undefined') && document.getElementById && document.getElementById('gameCanvas');
            if (canvas) {
                canvas.addEventListener('touchstart', (e) => this.onTouch(e, canvas), { passive: false });
                canvas.addEventListener('touchmove',  (e) => this.onTouch(e, canvas), { passive: false });
                canvas.addEventListener('touchend',   (e) => this.onTouch(e, canvas), { passive: false });
                canvas.addEventListener('touchcancel',(e) => this.onTouch(e, canvas), { passive: false });
            }
        }

        // Prevent default for game keys
        this.gameKeys = [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'KeyW', 'KeyA', 'KeyS', 'KeyD',
            'Space', 'KeyZ', 'KeyX', 'KeyC', 'KeyP', 'KeyT', 'KeyH', 'KeyN',
            'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
            'Escape'
        ];
    }

    onKeyDown(e) {
        if (this.gameKeys.includes(e.code)) {
            e.preventDefault();
        }
        // Browsers fire keydown repeatedly while a key is held - the
        // pressBuffer only catches the FIRST transition from up->down.
        if (!this.physicalKeys[e.code]) this.pressBuffer[e.code] = true;
        this.physicalKeys[e.code] = true;
    }

    onKeyUp(e) {
        if (this.gameKeys.includes(e.code)) {
            e.preventDefault();
        }
        this.physicalKeys[e.code] = false;
    }

    // ---- Touch handling ----
    // Translates touches into virtual key states that get merged with
    // physical keys on every update().
    onTouch(e, canvas) {
        e.preventDefault();
        this.touchActive = true;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        // Clear current touch keys then rebuild from active touches
        const next = {};
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            const x = (t.clientX - rect.left) * scaleX;
            const y = (t.clientY - rect.top) * scaleY;
            const tk = this.touchButtonAt(x, y);
            if (tk) next[tk] = true;
        }
        this.touchKeys = next;
    }

    // Map a canvas-space x/y to a virtual key code. The button layout below
    // mirrors the one drawn by the renderer.
    touchButtonAt(x, y) {
        // D-pad on the lower-left (5 zones - 4 directions + center deadzone)
        const dpadCx = 32, dpadCy = 188, dpadR = 28;
        const dx = x - dpadCx, dy = y - dpadCy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < dpadR * dpadR) {
            if (dist2 < 64) return null;        // 8px deadzone
            const ang = Math.atan2(dy, dx);
            const a = (ang + Math.PI * 2) % (Math.PI * 2);
            // 8-way slice
            const slice = Math.round(a / (Math.PI / 4)) % 8;
            switch (slice) {
                case 0: return 'ArrowRight';
                case 1: this.touchKeys['ArrowDown'] = true; return 'ArrowRight';
                case 2: return 'ArrowDown';
                case 3: this.touchKeys['ArrowDown'] = true; return 'ArrowLeft';
                case 4: return 'ArrowLeft';
                case 5: this.touchKeys['ArrowUp']   = true; return 'ArrowLeft';
                case 6: return 'ArrowUp';
                case 7: this.touchKeys['ArrowUp']   = true; return 'ArrowRight';
            }
        }
        // Jump / shoot buttons on the lower-right
        const jx = GAME.WIDTH - 56, jy = 196;
        if ((x - jx) ** 2 + (y - jy) ** 2 < 256) return 'KeyZ';   // Z = jump
        const sx = GAME.WIDTH - 18, sy = 184;
        if ((x - sx) ** 2 + (y - sy) ** 2 < 256) return 'KeyX';   // X = shoot
        // Pause button top-right
        if (x > GAME.WIDTH - 20 && y < 20) return 'KeyP';
        return null;
    }

    // Poll any connected gamepads and translate them into virtual keys.
    // Standard mapping: left stick / d-pad -> arrows, A -> Z (jump),
    // B -> X (shoot), Start -> P (pause), Back -> Escape.
    pollGamepad() {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
        const pads = navigator.getGamepads();
        if (!pads) return;
        const prevConnected = this.padConnected;
        this.padConnected = false;
        const next = {};
        for (const pad of pads) {
            if (!pad) continue;
            this.padConnected = true;
            const dz = this.padDeadzone;
            // Left stick
            const lx = pad.axes[0] || 0;
            const ly = pad.axes[1] || 0;
            if (lx < -dz) next['ArrowLeft']  = true;
            if (lx >  dz) next['ArrowRight'] = true;
            if (ly < -dz) next['ArrowUp']    = true;
            if (ly >  dz) next['ArrowDown']  = true;
            // D-pad (buttons 12-15 on Standard gamepad)
            if (pad.buttons[12] && pad.buttons[12].pressed) next['ArrowUp']    = true;
            if (pad.buttons[13] && pad.buttons[13].pressed) next['ArrowDown']  = true;
            if (pad.buttons[14] && pad.buttons[14].pressed) next['ArrowLeft']  = true;
            if (pad.buttons[15] && pad.buttons[15].pressed) next['ArrowRight'] = true;
            // Face buttons
            if (pad.buttons[0] && pad.buttons[0].pressed)   next['KeyZ']       = true; // A -> jump
            if (pad.buttons[1] && pad.buttons[1].pressed)   next['KeyX']       = true; // B -> shoot
            if (pad.buttons[2] && pad.buttons[2].pressed)   next['ShiftLeft']  = true; // X -> aim lock
            if (pad.buttons[3] && pad.buttons[3].pressed)   next['KeyC']       = true; // Y -> cover
            // Shoulder buttons - alt shoot / jump
            if (pad.buttons[4] && pad.buttons[4].pressed)   next['KeyX']       = true;
            if (pad.buttons[5] && pad.buttons[5].pressed)   next['KeyX']       = true;
            // Start / Select
            if (pad.buttons[9] && pad.buttons[9].pressed)   next['KeyP']       = true;
            if (pad.buttons[8] && pad.buttons[8].pressed)   next['Escape']     = true;
        }
        // Treat new gamepad keys as fresh keydowns (sticky-press buffer)
        // so their just-pressed events fire even when the polling interval
        // is shorter than one tick.
        for (const k in next) {
            if (!this.padKeys[k]) this.pressBuffer[k] = true;
        }
        this.padKeys = next;
        if (!prevConnected && this.padConnected) {
            // First-time connect notification could go here
        }
    }

    // Call at start of each frame
    update() {
        // Poll gamepads first so their state is included in the merge below.
        this.pollGamepad();

        // Combine physical + touch + gamepad into this.keys for the rest
        this.keys = {};
        for (const k in this.physicalKeys) {
            if (this.physicalKeys[k]) this.keys[k] = true;
        }
        for (const k in this.touchKeys) {
            if (this.touchKeys[k]) this.keys[k] = true;
        }
        for (const k in this.padKeys) {
            if (this.padKeys[k]) this.keys[k] = true;
        }

        // Calculate just pressed/released versus the previous frame
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        for (const key in this.keys) {
            if (this.keys[key] && !this.previousKeys[key]) {
                this.keysJustPressed[key] = true;
            }
        }
        // Drain the one-shot press buffer - catches a tap that started
        // and ended entirely between two physics ticks. These fire as
        // 'just pressed' even though the key is no longer down.
        for (const key in this.pressBuffer) {
            if (this.pressBuffer[key]) this.keysJustPressed[key] = true;
        }
        this.pressBuffer = {};
        for (const key in this.previousKeys) {
            if (this.previousKeys[key] && !this.keys[key]) {
                this.keysJustReleased[key] = true;
            }
        }

        // Snapshot for next frame
        this.previousKeys = { ...this.keys };
    }

    // Helpers for common inputs
    get left() {
        return this.keys['ArrowLeft'] || this.keys['KeyA'];
    }

    get right() {
        return this.keys['ArrowRight'] || this.keys['KeyD'];
    }

    get up() {
        return this.keys['ArrowUp'] || this.keys['KeyW'];
    }

    get down() {
        return this.keys['ArrowDown'] || this.keys['KeyS'];
    }

    get jump() {
        return this.keys['Space'] || this.keys['KeyZ'];
    }

    get jumpPressed() {
        return this.keysJustPressed['Space'] || this.keysJustPressed['KeyZ'];
    }

    get shoot() {
        return this.keys['KeyX'] || this.keys['ControlLeft'] || this.keys['ControlRight'];
    }

    get shootPressed() {
        return this.keysJustPressed['KeyX'] ||
               this.keysJustPressed['ControlLeft'] ||
               this.keysJustPressed['ControlRight'];
    }

    get lockAim() {
        return this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    }

    get cover() {
        return this.keysJustPressed['KeyC'];
    }

    get downPressed() {
        return this.keysJustPressed['ArrowDown'] || this.keysJustPressed['KeyS'];
    }

    get pausePressed() {
        return this.keysJustPressed['KeyP'] || this.keysJustPressed['Escape'];
    }

    // Get aim direction based on input (8-way)
    getAimDirection(facingRight = true) {
        const up = this.up;
        const down = this.down;
        const left = this.left;
        const right = this.right;

        if (up && right) return AIM_DIR.UP_RIGHT;
        if (up && left) return AIM_DIR.UP_LEFT;
        if (down && right) return AIM_DIR.DOWN_RIGHT;
        if (down && left) return AIM_DIR.DOWN_LEFT;
        if (up) return AIM_DIR.UP;
        if (down) return AIM_DIR.DOWN;
        if (right) return AIM_DIR.RIGHT;
        if (left) return AIM_DIR.LEFT;

        // Default to facing direction
        return facingRight ? AIM_DIR.RIGHT : AIM_DIR.LEFT;
    }

    // Get movement vector
    getMovement() {
        let dx = 0;
        let dy = 0;

        if (this.left) dx -= 1;
        if (this.right) dx += 1;
        if (this.up) dy -= 1;
        if (this.down) dy += 1;

        return { x: dx, y: dy };
    }
}

// Global input instance
const input = new InputHandler();

// ============================================
// INPUT HANDLER - Keyboard & Gamepad
// ============================================

class InputHandler {
    constructor() {
        this.keys = {};
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        this.previousKeys = {};

        // Bind keyboard events
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Prevent default for game keys
        this.gameKeys = [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'KeyW', 'KeyA', 'KeyS', 'KeyD',
            'Space', 'KeyZ', 'KeyX', 'KeyC',
            'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight'
        ];
    }

    onKeyDown(e) {
        if (this.gameKeys.includes(e.code)) {
            e.preventDefault();
        }
        this.keys[e.code] = true;
    }

    onKeyUp(e) {
        if (this.gameKeys.includes(e.code)) {
            e.preventDefault();
        }
        this.keys[e.code] = false;
    }

    // Call at start of each frame
    update() {
        // Calculate just pressed/released
        this.keysJustPressed = {};
        this.keysJustReleased = {};

        for (let key in this.keys) {
            if (this.keys[key] && !this.previousKeys[key]) {
                this.keysJustPressed[key] = true;
            }
            if (!this.keys[key] && this.previousKeys[key]) {
                this.keysJustReleased[key] = true;
            }
        }

        // Store previous state
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

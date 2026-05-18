import { CAMERA, GAME } from './constants.js';

export class Camera {
    constructor() {
        this.x = 0; this.y = 0;
        this.shakeX = 0; this.shakeY = 0;
        this.shakeIntensity = 0;
        this.targetX = 0; this.targetY = 0;
        this.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    setBounds(maxX, maxY) {
        this.bounds.maxX = Math.max(0, maxX - GAME.W);
        this.bounds.maxY = Math.max(0, maxY - GAME.H);
    }

    follow(target, facing = 1) {
        // Combine facing lookahead with velocity-based lead — momentum matters
        const facingLead = CAMERA.LOOK_AHEAD * facing;
        const velLead = (target.vx || 0) * 8;
        const lookAhead = facingLead * 0.6 + velLead * 0.4;
        this.targetX = target.x - GAME.W / 2 + lookAhead;
        // Vertical lead when falling/jumping so the player sees their landing
        const vyLead = Math.max(-24, Math.min(24, (target.vy || 0) * 4));
        this.targetY = target.y - GAME.H / 2 - 24 + vyLead;
    }

    shake(intensity, decay = CAMERA.SHAKE_DECAY) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
        this._shakeDecay = decay;
    }

    update() {
        // Smooth follow
        this.x += (this.targetX - this.x) * 0.18;
        this.y += (this.targetY - this.y) * 0.12;

        // Clamp
        this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
        this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));

        // Shake
        if (this.shakeIntensity > 0.05) {
            this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeY = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeIntensity *= this._shakeDecay || CAMERA.SHAKE_DECAY;
        } else {
            this.shakeX = 0; this.shakeY = 0;
            this.shakeIntensity = 0;
        }
    }

    // Effective view origin including shake.
    get viewX() { return Math.round(this.x + this.shakeX); }
    get viewY() { return Math.round(this.y + this.shakeY); }
}

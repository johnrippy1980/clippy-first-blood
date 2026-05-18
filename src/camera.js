import { CAMERA, GAME } from './constants.js';

export class Camera {
    constructor() {
        this.x = 0; this.y = 0;
        this.shakeX = 0; this.shakeY = 0;
        this.shakeIntensity = 0;
        this.targetX = 0; this.targetY = 0;
        this.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        // Smoothed lookahead values — prevent target-jumping on facing flips
        // or short vx flicks, which read as twitchy camera in playtest.
        this._leadX = 0;
        this._leadY = 0;
    }

    setBounds(maxX, maxY) {
        this.bounds.maxX = Math.max(0, maxX - GAME.W);
        this.bounds.maxY = Math.max(0, maxY - GAME.H);
    }

    follow(target, facing = 1) {
        // Combine facing lookahead with velocity-based lead. Both pieces are
        // lerped via _leadX/_leadY so direction changes don't snap the camera.
        const facingLead = CAMERA.LOOK_AHEAD * facing;
        const velLead = (target.vx || 0) * 4;   // halved from 8 — short flicks shouldn't pan
        const desiredLeadX = facingLead * 0.6 + velLead * 0.4;
        this._leadX += (desiredLeadX - this._leadX) * 0.08;   // ~12-frame ease
        this.targetX = target.x - GAME.W / 2 + this._leadX;
        // Vertical lead when falling/jumping so the player sees their landing
        const vyLead = Math.max(-24, Math.min(24, (target.vy || 0) * 4));
        this._leadY += (vyLead - this._leadY) * 0.12;
        this.targetY = target.y - GAME.H / 2 - 24 + this._leadY;
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

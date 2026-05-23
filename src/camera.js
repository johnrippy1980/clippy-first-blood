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

    // R232: during a boss fight, both player AND boss must stay framed.
    // Standard follow() chases the player and lets the boss drift off the
    // right edge. This biases the camera toward the midpoint between them,
    // weighted slightly toward the boss so the player can't cheese it
    // off-screen by walking left.
    followBossArena(player, boss) {
        // Decay velocity lookahead — chasing the player's dash pulls the
        // camera off the boss.
        this._leadX += (0 - this._leadX) * 0.12;
        this._leadY += (0 - this._leadY) * 0.12;
        const pcx = player.x + (player.w || 0) / 2;
        const bcx = boss.x + (boss.w || 0) / 2;
        const midX = pcx * 0.4 + bcx * 0.6;
        this.targetX = midX - GAME.W / 2;
        const pcy = player.y + (player.h || 0) / 2;
        const bcy = boss.y + (boss.h || 0) / 2;
        const midY = pcy * 0.5 + bcy * 0.5;
        this.targetY = midY - GAME.H / 2 - 8;
    }

    // R315: hard-snap the camera to a world point so the next follow()
    // doesn't lerp in from the previous position. Used on respawn/scene
    // transitions where a smooth slide is wrong.
    snapTo(worldX, worldY) {
        this.targetX = worldX - GAME.W / 2;
        this.targetY = worldY - GAME.H / 2;
        this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.targetX));
        this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.targetY));
        this._leadX = 0;
        this._leadY = 0;
    }

    shake(intensity, decay = CAMERA.SHAKE_DECAY) {
        // R322: add a brief sustain at peak intensity before exponential
        // decay starts. A 3-frame hold makes hits feel like an impact
        // ("BOOM") rather than a flick ("blip"). Bigger shakes get
        // proportionally longer sustains.
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
        this._shakeDecay = decay;
        const sustain = Math.min(6, Math.floor(intensity / 2));
        this._shakeSustain = Math.max(this._shakeSustain || 0, sustain);
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
            // R322: vertical-biased shake (1.4× y-magnitude) — impact
            // hits read more "thumpy" with stronger vertical motion.
            this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 1.4;
            // R322: hold at peak for `_shakeSustain` frames before decay.
            if (this._shakeSustain && this._shakeSustain > 0) {
                this._shakeSustain--;
            } else {
                this.shakeIntensity *= this._shakeDecay || CAMERA.SHAKE_DECAY;
            }
        } else {
            this.shakeX = 0; this.shakeY = 0;
            this.shakeIntensity = 0;
            this._shakeSustain = 0;
        }
    }

    // Effective view origin including shake.
    get viewX() { return Math.round(this.x + this.shakeX); }
    get viewY() { return Math.round(this.y + this.shakeY); }
}

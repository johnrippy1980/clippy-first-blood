// R332: ambient-prop system. Levels can populate a list of decorative
// entities that tick + draw with the world. No gameplay impact —
// purely visual storytelling: a dying Clippy staggers and falls, a
// fluorescent fixture flickers, a fire dances, etc.
//
// Stage data adds `ambientProps: [{kind, x, y, ...}]` and the level
// instantiates AmbientPropManager which owns the lifecycle.

import { particles } from './particles.js';
import { sprites } from './sprites.js';
import { audio } from './audio.js';

// Per-kind tick + draw. Each entry takes the prop state object + camera.
const KINDS = {
    // Dying Clippy NPC — staggers in place, drops to knees, dies with a
    // final-breath particle puff + brief floating-text gasp. After dying,
    // body lies on the ground as a static silhouette for the rest of the
    // stage.
    dyingClippy: {
        tick(p) {
            if (p.state === 'dead') return;
            p.t = (p.t || 0) + 1;
            if (p.state === 'stagger') {
                // Brief stagger pose for first 60 frames, then drop
                if (p.t >= 60) {
                    p.state = 'falling';
                    p.t = 0;
                    p.vy = -1.4;
                }
            } else if (p.state === 'falling') {
                p.vy += 0.18;
                p.fallY = (p.fallY || 0) + p.vy;
                if (p.fallY >= 0) {
                    p.fallY = 0;
                    p.state = 'dead';
                    // Final-breath puff: 5 grey particles drifting upward
                    for (let i = 0; i < 5; i++) {
                        particles.spawn?.(
                            p.x + (Math.random() - 0.5) * 6,
                            p.y - 4 + (Math.random() - 0.5) * 3,
                            (Math.random() - 0.5) * 0.4,
                            -0.4 - Math.random() * 0.3,
                            40 + (Math.random() * 20) | 0,
                            '#a0a0a8', 1, -0.01,
                        );
                    }
                    // Gasp text — single line that fades quickly
                    particles.floatingText?.(p.x, p.y - 10, '...help', '#c0c0d0', 90, -0.25, 1);
                }
            }
        },
        draw(ctx, p, camera) {
            const dx = Math.round(p.x - camera.viewX);
            const dy = Math.round(p.y - camera.viewY + (p.fallY || 0));
            // Sample 'clippy_hurt' if available, else 'clippy_walk_01', else fallback
            // to a simple 8x10 pixel-art silhouette.
            // (Reuse the standard v5 Clippy character art at desaturated
            // tone so it reads as "another Clippy, dying" not the hero.)
            const desat = p.state === 'dead' ? 0.85 : 0.65;
            ctx.save();
            ctx.globalAlpha = desat;
            // Body — small grey clippy shape
            ctx.fillStyle = p.state === 'dead' ? '#605860' : '#807888';
            if (p.state === 'dead') {
                // Lying horizontal — 12 wide x 4 tall
                ctx.fillRect(dx - 6, dy - 2, 12, 4);
                // Bandana smear
                ctx.fillStyle = '#601018';
                ctx.fillRect(dx - 5, dy - 1, 4, 1);
            } else if (p.state === 'stagger') {
                // Upright but tilted — 4 wide x 12 tall, slight sway
                const sway = Math.sin(p.t * 0.3) * 2;
                ctx.fillRect(dx - 2 + (sway | 0), dy - 12, 4, 12);
                ctx.fillStyle = '#a01020';
                ctx.fillRect(dx - 3 + (sway | 0), dy - 11, 6, 1);
            } else {
                // Falling — diagonal
                const lean = Math.min(8, p.t * 0.2);
                ctx.fillRect(dx - 2 + (lean | 0), dy - 12 + (lean | 0), 4, 12);
                ctx.fillStyle = '#a01020';
                ctx.fillRect(dx - 3 + (lean | 0), dy - 11 + (lean | 0), 6, 1);
            }
            ctx.restore();
        },
    },

    // Burning-fire prop — pulses orange/yellow with rising sparks.
    // Decorative; never hits the player.
    fire: {
        tick(p) {
            p.t = (p.t || 0) + 1;
            // Emit a rising ember every ~10 frames
            if ((p.t % 12) === 0) {
                particles.spawn?.(
                    p.x + (Math.random() - 0.5) * 4,
                    p.y - 2,
                    (Math.random() - 0.5) * 0.3,
                    -0.5 - Math.random() * 0.4,
                    24 + (Math.random() * 12) | 0,
                    Math.random() < 0.4 ? '#ff5020' : '#ffaa50', 1, -0.02,
                );
            }
        },
        draw(ctx, p, camera) {
            const dx = Math.round(p.x - camera.viewX);
            const dy = Math.round(p.y - camera.viewY);
            const flicker = 0.7 + 0.3 * Math.sin(p.t * 0.4);
            const sizeFlick = 0.85 + 0.15 * Math.sin(p.t * 0.55 + 1.3);
            const w = Math.round(6 * sizeFlick);
            const h = Math.round(10 * sizeFlick);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Outer red glow
            ctx.globalAlpha = 0.4 * flicker;
            ctx.fillStyle = '#a01020';
            ctx.fillRect(dx - w, dy - h, w * 2, h);
            // Orange core
            ctx.globalAlpha = 0.7 * flicker;
            ctx.fillStyle = '#ff7030';
            ctx.fillRect(dx - w / 2, dy - h + 2, w, h - 2);
            // Bright tip
            ctx.globalAlpha = 0.85 * flicker;
            ctx.fillStyle = '#ffe070';
            ctx.fillRect(dx - 1, dy - h + 2, 2, h / 2 | 0);
            ctx.restore();
        },
    },

    // Flickering fluorescent — bright white tube that briefly fails on
    // a deterministic cycle. Casts a cone of dim light below it during
    // the failure (sells the dread/horror beat).
    flicker: {
        tick(p) {
            p.t = (p.t || 0) + 1;
            // 6% chance per frame to flicker, 12-frame cooldown
            p.cd = (p.cd || 0) - 1;
            if (p.cd <= 0 && Math.random() < 0.06) {
                p.flickerT = 8 + (Math.random() * 6) | 0;
                p.cd = 60 + (Math.random() * 60) | 0;
            }
            if (p.flickerT > 0) p.flickerT--;
        },
        draw(ctx, p, camera) {
            const dx = Math.round(p.x - camera.viewX);
            const dy = Math.round(p.y - camera.viewY);
            const isFlickerFrame = (p.flickerT > 0) && ((p.flickerT & 1) === 0);
            ctx.save();
            // Tube body
            if (!isFlickerFrame) {
                ctx.fillStyle = '#fff8c8';
                ctx.fillRect(dx - 6, dy, 12, 2);
                // Glow
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.30;
                ctx.fillStyle = '#fff8c8';
                ctx.fillRect(dx - 8, dy - 1, 16, 4);
            } else {
                // Off / failed
                ctx.fillStyle = '#403828';
                ctx.fillRect(dx - 6, dy, 12, 2);
            }
            ctx.restore();
        },
    },

    // Severed-cable spark — fixed point that emits an electric crack
    // every ~30 frames with a bright sparking flash. Server-room flavor.
    sparkCable: {
        tick(p) {
            p.t = (p.t || 0) + 1;
            if ((p.t % 28) === 0) {
                p.sparkT = 8;
                // 4-6 spark particles in a fan
                for (let i = 0; i < 5; i++) {
                    particles.spawn?.(
                        p.x, p.y,
                        (Math.random() - 0.5) * 2.2,
                        -0.6 - Math.random() * 1.4,
                        16 + (Math.random() * 6) | 0,
                        '#80c0ff', 1, 0.08,
                    );
                }
            }
            if (p.sparkT > 0) p.sparkT--;
        },
        draw(ctx, p, camera) {
            const dx = Math.round(p.x - camera.viewX);
            const dy = Math.round(p.y - camera.viewY);
            // Cable hangs from above (4 px straight down).
            ctx.fillStyle = '#202028';
            ctx.fillRect(dx - 1, dy - 8, 2, 8);
            ctx.fillStyle = '#404048';
            ctx.fillRect(dx - 1, dy - 8, 1, 8);
            // Spark flash
            if (p.sparkT > 0) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = p.sparkT / 8;
                ctx.fillStyle = '#a0e0ff';
                ctx.fillRect(dx - 2, dy - 2, 4, 4);
                ctx.fillStyle = '#fff';
                ctx.fillRect(dx, dy, 1, 1);
                ctx.restore();
            }
        },
    },
};

export class AmbientPropManager {
    constructor(propSpecs = []) {
        // Each spec is shallow-copied so we don't mutate stage data.
        this.props = propSpecs.map(s => {
            const p = Object.assign({}, s);
            // Default starting state per kind
            if (s.kind === 'dyingClippy') p.state = p.state || 'stagger';
            return p;
        });
    }
    update() {
        for (const p of this.props) {
            const k = KINDS[p.kind];
            if (k && k.tick) k.tick(p);
        }
    }
    draw(ctx, camera) {
        for (const p of this.props) {
            const k = KINDS[p.kind];
            if (k && k.draw) k.draw(ctx, p, camera);
        }
    }
}

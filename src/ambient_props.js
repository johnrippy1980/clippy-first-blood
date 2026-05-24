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
            // R347: painted sprites for the dying-Clippy ambient prop.
            // Falls back to the legacy procedural blob if assets missing.
            const desat = p.state === 'dead' ? 0.85 : 0.7;
            ctx.save();
            ctx.globalAlpha = desat;
            const useStaggerSprite = sprites.images.get('clippy_dying_stagger');
            const useDeadSprite = sprites.images.get('clippy_dying_dead');
            if (p.state === 'dead' && useDeadSprite) {
                // Lying horizontal — anchored at bottom of bbox
                const img = useDeadSprite;
                ctx.drawImage(img, dx - img.width / 2 | 0, dy - img.height + 1);
            } else if (p.state === 'stagger' && useStaggerSprite) {
                // Upright; subtle sway via integer offset
                const sway = Math.sin(p.t * 0.18) * 1;
                const img = useStaggerSprite;
                ctx.drawImage(img, (dx - img.width / 2 + sway) | 0, dy - img.height);
            } else if (p.state === 'falling' && useStaggerSprite) {
                // Falling — reuse stagger sprite tilted via translate/rotate
                const img = useStaggerSprite;
                const lean = Math.min(0.6, p.t * 0.02);
                ctx.translate(dx, dy);
                ctx.rotate(lean);
                ctx.drawImage(img, -img.width / 2 | 0, -img.height);
            } else {
                // Procedural fallback (legacy R332 path) — kept for the
                // moment when sprites haven't loaded yet during boot.
                ctx.fillStyle = p.state === 'dead' ? '#605860' : '#807888';
                if (p.state === 'dead') {
                    ctx.fillRect(dx - 6, dy - 2, 12, 4);
                } else if (p.state === 'stagger') {
                    const sway = Math.sin(p.t * 0.3) * 2;
                    ctx.fillRect(dx - 2 + (sway | 0), dy - 12, 4, 12);
                } else {
                    const lean = Math.min(8, p.t * 0.2);
                    ctx.fillRect(dx - 2 + (lean | 0), dy - 12 + (lean | 0), 4, 12);
                }
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

    // R384: drifting embers — for apocalyptic / mecha-gates stages.
    // Anchor point at p.x/p.y is the SOURCE; embers stream up and
    // drift sideways with a wind bias. Spawns one every few frames
    // and never owns its own draw — particles handle the rendering.
    embers: {
        tick(p) {
            p.t = (p.t || 0) + 1;
            const period = p.period || 6;
            const wind = p.wind ?? 0.5;
            if ((p.t % period) === 0) {
                const sx = p.x + (Math.random() - 0.5) * (p.spread || 60);
                const sy = p.y + (Math.random() - 0.5) * 8;
                particles.spawn?.(
                    sx, sy,
                    wind + (Math.random() - 0.5) * 0.4,
                    -0.3 - Math.random() * 0.6,
                    80 + (Math.random() * 40) | 0,
                    Math.random() < 0.5 ? '#ff5020' : '#ffaa50', 1, -0.005,
                );
            }
        },
        draw() {},
    },

    // R384: lightning — full-screen white flash on a slow random cycle.
    // For mecha-gates / cloud / nightmare stages. p.x/p.y unused; the
    // flash is a screen-space overlay drawn by the manager itself.
    lightning: {
        tick(p) {
            p.t = (p.t || 0) + 1;
            p.cd = (p.cd || (180 + Math.random() * 240)) - 1;
            if (p.cd <= 0 && (p.flashT || 0) <= 0) {
                // Multi-stroke: main flash + 1-2 quick afterstrokes
                p.flashT = 8;
                p.strokeQueue = (Math.random() < 0.5) ? [4, 6] : [3];
                p.cd = 240 + Math.random() * 360;
            }
            if (p.flashT > 0) {
                p.flashT--;
                if (p.flashT === 0 && p.strokeQueue && p.strokeQueue.length) {
                    p.flashT = p.strokeQueue.shift();
                }
            }
        },
        draw(ctx, p) {
            if ((p.flashT || 0) <= 0) return;
            const a = p.flashT / 10;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.55 * a;
            ctx.fillStyle = '#dde6ff';
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.restore();
        },
    },

    // R384: water drip — sewer/pipeline stages. Releases a single droplet
    // from p.x/p.y that falls until it hits a surface (p.floorY) and splashes.
    drip: {
        tick(p) {
            p.t = (p.t || 0) + 1;
            p.cd = (p.cd ?? (40 + Math.random() * 60)) - 1;
            if (p.cd <= 0 && !p.dropY) {
                p.dropY = 0;
                p.dropV = 0;
                p.cd = 60 + Math.random() * 80;
            }
            if (p.dropY !== undefined && p.dropY !== null) {
                p.dropV += 0.20;
                p.dropY += p.dropV;
                const fallH = p.fallH || 40;
                if (p.dropY >= fallH) {
                    p.dropY = null;
                    p.splashT = 8;
                    // tiny splash particles
                    for (let i = 0; i < 3; i++) {
                        particles.spawn?.(
                            p.x + (Math.random() - 0.5) * 4,
                            p.y + fallH,
                            (Math.random() - 0.5) * 0.6,
                            -0.6 - Math.random() * 0.3,
                            12 + (Math.random() * 6) | 0,
                            '#88aabb', 1, 0.02,
                        );
                    }
                }
            }
            if (p.splashT > 0) p.splashT--;
        },
        draw(ctx, p, camera) {
            const dx = Math.round(p.x - camera.viewX);
            const dy = Math.round(p.y - camera.viewY);
            if (p.dropY !== undefined && p.dropY !== null) {
                ctx.save();
                ctx.globalAlpha = 0.85;
                ctx.fillStyle = '#88aacc';
                ctx.fillRect(dx, dy + Math.round(p.dropY), 1, 2);
                ctx.fillStyle = '#aaccdd';
                ctx.fillRect(dx, dy + Math.round(p.dropY), 1, 1);
                ctx.restore();
            }
        },
    },

    // R384: fog drift — soft horizontal banks of grey-purple haze that
    // roll across the BG layer. Cheap perlin-ish: 3 banks at different
    // speeds, alpha-modulated by camera position.
    fogBank: {
        tick(p) {
            p.t = (p.t || 0) + 1;
            p.driftX = ((p.driftX || 0) + (p.speed || 0.15));
            if (p.driftX > 320) p.driftX -= 640;
        },
        draw(ctx, p, camera) {
            const baseY = Math.round(p.y - camera.viewY);
            const baseX = Math.round(p.x - camera.viewX);
            ctx.save();
            ctx.globalAlpha = p.alpha || 0.22;
            ctx.fillStyle = p.color || '#403850';
            for (let i = -1; i <= 2; i++) {
                const bx = baseX + (i * 220) - p.driftX % 220;
                ctx.beginPath();
                ctx.ellipse(bx, baseY, 80, 14, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        },
    },

    // R384: neon sign flicker — for cyberpunk / mainframe / office bg.
    // Painted-on-bg sign that briefly buzzes off. Uses a rect for the
    // sign body and a brighter inner rect for the bulb. Real painted
    // signs come from bg art; this just adds the live flicker overlay.
    neonSign: {
        tick(p) {
            p.t = (p.t || 0) + 1;
            p.cd = (p.cd || 0) - 1;
            if (p.cd <= 0 && Math.random() < 0.025) {
                p.failT = 6 + (Math.random() * 8) | 0;
                p.cd = 80 + Math.random() * 140;
            }
            if (p.failT > 0) p.failT--;
        },
        draw(ctx, p, camera) {
            const dx = Math.round(p.x - camera.viewX);
            const dy = Math.round(p.y - camera.viewY);
            const w = p.w || 14;
            const h = p.h || 4;
            const failed = (p.failT > 0) && ((p.failT & 1) === 0);
            const color = p.color || '#ff60a0';
            ctx.save();
            if (!failed) {
                ctx.fillStyle = color;
                ctx.fillRect(dx, dy, w, h);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.35;
                ctx.fillRect(dx - 2, dy - 1, w + 4, h + 2);
            } else {
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#403020';
                ctx.fillRect(dx, dy, w, h);
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

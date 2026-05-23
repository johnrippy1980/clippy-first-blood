# R325 — New enemy types + boss attacks (proposal)

Date: 2026-05-23

## Existing grunt roster (for reference)

| Type | HP | Behavior | Notes |
|---|---|---|---|
| folder | 2 | `fly_sine` — flies in sine wave, shoots periodically | Stages 1, 2 |
| stapler | 1 | `hop` — hops short, leaps long at player | Stages 1-3 |
| cabinet | 6 | `charge` — slow walk, charges player on sight | Stages 3-5 |
| holepunch | 3 | `hover_sniper` — stationary, charges beam shot | Stages 5-13 |

## New enemy proposals

### 1. **dive_bomber** — paper-airplane / data-drone
- HP 1 (low, fast)
- Behavior: spawns from edge of screen, glides horizontally above player at fixed Y. When player's X is within ±8 of dive_bomber's X, it commits to a 45° dive trajectory toward the player's last known position. Single-use — explodes on contact OR on hitting terrain.
- Telegraph: brief screen flash + audio cue when it commits to the dive.
- Theme fit: jungle (paper airplane), serverroom (data drone), keynote (drone with mic).
- Estimated effort: 1 new behavior in enemies.js, no new sprite (reuse folder sprite at smaller scale OR commission new).

### 2. **summoner** — Clippy doppelgänger
- HP 5 (medium, stationary)
- Behavior: stands still, summons a `folder` every 4 seconds up to 3 active. Killing it stops the summons but the spawned folders persist.
- Telegraph: glowing aura when it's about to summon (~30 frames before spawn).
- Theme fit: founder, cloud (since the Founder/Algorithm is literally the source of all Clippies). Pairs well with the existing "you're fighting copies of yourself" theme.
- Estimated effort: 1 new behavior + 1 new sprite (creepy paperclip-with-eyes).

### 3. **shielder** — file cabinet with riot shield
- HP 4 (medium, slow)
- Behavior: walks toward player, holds a 12px-wide shield in front. Bullets hitting the shield ricochet (1 frame), don't deal damage. Player has to jump over or flank around.
- Telegraph: visible shield sprite in front of body. When it crouches periodically (~every 5s for 60 frames), the shield drops and the body is exposed.
- Theme fit: boardroom, serverroom (security guard variant).
- Estimated effort: 1 new behavior + shield collision logic + 1 new sprite (cabinet with shield).

## New boss attack proposals

### COPIER_3000 — Paper Cyclone
- Trigger: at <40% HP only.
- Mechanic: 360° radial spray of 8 paper-page projectiles. Each ricochets off walls ONCE. Lasts ~2 seconds.
- Telegraph: boss spins in place for 30 frames (page-load animation) before firing.
- Estimated effort: small — extend existing _firePaperJam to a radial variant.

### SHREDDER — Shred Field
- Trigger: at <50% HP, repeats every ~10 seconds.
- Mechanic: temporarily marks a 3-tile-wide strip of arena floor as hazard. Whirling-blades sprite cycles for 90 frames. Player takes 1 dmg/tick if standing in the strip.
- Telegraph: 30-frame warning blink before blades activate.
- Estimated effort: medium — new hazard-tile system.

### GATES — Floppy Rain
- Trigger: at <60% HP, every 8 seconds.
- Mechanic: 6 floppy-disk projectiles spawn off-screen above the arena and rain down at random X positions with slight homing toward player.
- Telegraph: Gates looks UP for 30 frames, then the floppies appear.
- Estimated effort: small — reuses existing floppy projectile, new spawn pattern.

## Proposed implementation order (smallest → biggest)

1. **COPIER_3000 Paper Cyclone** (~30 min)
2. **GATES Floppy Rain** (~45 min)
3. **dive_bomber** new enemy + sprite (~1.5 hr)
4. **summoner** new enemy + sprite (~2 hr)
5. **shielder** new enemy + sprite + collision (~2.5 hr)
6. **SHREDDER Shred Field** new hazard system (~2 hr)

Approve any subset. Default suggestion: ship #1 + #2 + #3 (the smallest cluster that adds real variety). Skip the rest unless playtest demands more.

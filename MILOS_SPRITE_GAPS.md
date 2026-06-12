# Clippy sprite pack — what's wired, and what's still missing

Status as of this pass. Milos's pose pack (`Downloads/Clippy/Clippy-Poses:Moves/`)
is now driving **every player-character animation state** in the game except the
items in "GAPS" below. All wired frames are downscaled, alpha-hardened, and
facing-corrected via `tools/convert-friend-poses.py` into `assets/sprites/friend/`.

## Fully wired from Milos's art (no further work needed)

| Game state | Source pose | Notes |
|---|---|---|
| Idle (breathing) | Idle up/down | two-frame eye-line shift |
| Walk cycle | Walking 1/2/3 | 4-frame cycle 1→2→3→2 |
| Walk + fire | Walking & Firing 1/2/3 | muzzle flash baked in |
| Stand + fire | Firing 1/2 | straight-ahead |
| Jump rise / peak | Jump 2/3 | gun lowered |
| Fall | Jump 4 | |
| Jump + fire (airborne shooting) | Walking & Firing 1 | reused — reads as airborne fire |
| Spin-jump / pounce | Jump-Double 4/5 | front-flip rotation |
| Crouch / crouch-fire | Crouch up/down | |
| Prone / crawl / prone-fire | Crawl + Crawl & Firing | wide low silhouette |
| Slide / roll | Slide 2 (+ Slide 1 brace) | real low slide w/ streaks |
| Climb (ladder/rope) | Climbing 1/2 | hand-over-hand |
| Cover / cover-fire | Crouch + Slide 1 | derived, on-style |
| Backdash | Slide 1 (brace) | facing flip mirrors it |
| Hurt / first death beat | Low HP up/down | |
| Ledge hang / climb | Climbing + Crouch | derived, on-style |
| Angled aim (up/diagonal) | Firing 1 (fallback) | see GAP #1 — works but not ideal |

## GAPS — art Milos would need to draw for a 100% native pack

### 1. Angled firing poses (HIGH value — most visible)
Right now, aiming up or diagonally reuses the **straight-ahead** firing pose
(`Firing 1`) plus a small procedural arm. It's acceptable but the body doesn't
actually angle. Ideal: 3 firing poses matching the aim bands the engine uses —
- **Fire up** (gun ~straight overhead, ~-80°)
- **Fire diagonal-up** (~-45°)
- **Fire diagonal-down** (~+45°)
(Down/crouch-fire is already covered by the crouch-fire pose.)
Same framing/scale as `Firing 1/2`. Facing RIGHT (engine mirrors for left).

### 2. Per-weapon firing bodies (MEDIUM — 7 poses)
The game shows a distinct Clippy-holding-this-gun body for each non-default
weapon so the player can read which weapon they hold. These are still on the
**old `v6_*` art style** (lighter grey, clashes with the new pack):
`shotgun, spread, laser, flame, homing, thunder, chainsaw`.
Ideal: 7 standing/firing poses, one per weapon silhouette. Lower priority than
#1 because they only show with power-ups, but they're the most obvious remaining
style break.

### 3. Death effect frames (LOW — gameplay-minor)
The hit/stagger beat uses Low HP art, but the **explode** and **burning** death
beats are still on the old `v2_death.png`. Ideal: 1–2 frames of Clippy coming
apart / on fire. Brief on-screen, lowest priority.

### Not needed
- **Shield bubble** (Milos drew one) — the game's shield is a procedural animated
  disc with pulse + charge-tick readout; a static sprite would lose that
  feedback. Left procedural on purpose. His bubble is a fine optional alt if we
  ever want a painted look, but it's not a gap.

## How to add new art when Milos delivers
1. Drop the new high-res PNG(s) anywhere reachable.
2. Run: `python3 tools/convert-friend-poses.py --height 40 "/path/Foo.png=out_name"`
   (height 40 for standing poses; 24–26 for crouch/prone/slide; 32 for climb).
   Source art should face RIGHT; pass `--flip` only if a frame faces left.
3. Point the relevant key(s) in `CLIPPY_MANIFEST` (`src/sprites.js`) at
   `friend/out_name.png`.
4. Verify: `node tools/probe-friend-poses.mjs` (writes a contact sheet to
   `tools/screenshots/`), then hard-reload the game.

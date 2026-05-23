# R323 — Audio audit proposal

Date: 2026-05-23
Mode: proposal only — no changes applied until user approves.

## Part 1 — SFX quality

All 54 SFX are **procedurally synthesized** via Web Audio API
(triangle/sine/sawtooth oscillators + filtered noise + envelope ramps).
There are no file-based "bloop" SFX in the codebase. Verdict: **no
Atari-cheap SFX found.**

Spot-checked: `_uiClick` uses a triangle + freq sweep + noise burst —
not a square beep. `_gunshot` layers a thump (low sine), body
(filtered noise burst), and crack (high sine) — Contra-class layered.
`_thunderHit`, `_laserBeam`, `_chainsawRev` all use multiple oscillator
banks + filtered noise.

The 3 lowest-effort SFX I'd flag, if you ever wanted to spend art
budget on them:

1. **`select` / `menu` / `pause`** — three UI clicks that differ only
   in pitch (880 / 660 / 440 Hz). Same triangle wave + freq sweep.
   They're _functional_ but uniform. Could differentiate with: a
   harder click for "select" (added high-noise crack), a softer click
   for "pause" (rounder body, longer tail).
2. **`pickup`** — `_pickupChime` is a single triangle ding. Could add
   a tiny sparkle (high-noise burst) to feel rewarding.
3. **`step`** — `_footstep` is a brief low filtered noise. Fine for
   standard stages but could vary per surface (sewer = wet splat,
   keynote = wooden stage thud).

**Recommendation:** SFX layer is fine. Skip unless playtest surfaces
something specific.

## Part 2 — Per-stage track audit

Track → stage assignments (from src/audio.js FILE_TRACKS):

| Stage | Track file | Notes |
|---|---|---|
| 1 OFFICE PARK JUNGLE | `revenge.mp3` | Defaults; never re-evaluated. |
| 2 THE BREAK ROOM | `what-was-it-for.mp3` | Melancholy fits "everyone's gone." |
| 3 SERVER ROOM | `no-remorse.mp3` | Aggressive matches Ctrl+Alt+Del fight. |
| 4 THE PIPELINE | `youve-been-loving.mp3` | Hymn-like fits body-horror lab. |
| 5 THE BOARD ROOM | `no-pity.mp3` | Corporate menace. |
| 6 BALLMER OFFICE (FPS) | `backstage.mp3` | Backstage chase corridor. |
| 7 BALLMER ARENA | `arena.mp3` | Dedicated arena-boss track. |
| 8 KEYNOTE HALL | `dont-go.mp3` | Pleading vibe before betrayal. |
| 9 KEYNOTE CORRIDOR (FPS) | `backstage.mp3` | **Re-use** — same as stage 6. |
| 10 GATES ARENA | `arena.mp3` | **Re-use** — same as stage 7. |
| 11 FOUNDER'S LAIR | `disbelief.mp3` | Stage 7 was assigned this — see audit note. |
| 12 BOSS RUSH | `night-drive.mp3` | Driving rhythm for the gauntlet. |
| 13 THE CLOUD | `the-path.mp3` | Final-boss ascendant. |
| 14 RECYCLE BIN (S1) | `1.26x.mp3` | Glitched / accelerated vibe. |
| 15 TRAINING GROUND | `resolution.mp3` | Calm tutorial. |
| 16 BOSS RUSH MODE (P1) | `evolution.mp3` | Distinct from stage-12 night-drive. |
| 17 TIME TRIAL (P2) | `never-the-same.mp3` | Driving time pressure. |
| 18 RDF (P3) | `time-is-a-flat-circle.mp3` | Surreal — fits Jobs. |
| 19 CORE BREACH (P4) | `dreams-fade.mp3` | Dedicated FPS Spindler. |
| 20 MECHA APPROACH (P5) | `apocalypse` = `the-light-bleeds-through.mp3` | Apocalypse arrival. |
| 21 MECHA CORRIDOR (P6) | `backstage.mp3` | **Re-use** — same as stages 6 + 9. |
| 22 MECHA-GATES (P7) | `apocalypse` (same as 20) | **Re-use** — same as stage 20. |

### Issues / proposals

**(A) `backstage.mp3` carries 3 different stages** (6, 9, 21). Stages
6 + 9 are both Ballmer/Gates pre-arena corridor chases — defensible
re-use. Stage 21 (Mecha Corridor) is a different mood (post-
apocalypse mech-chase) and probably shouldn't share the track with
the 90s-corporate stages.

→ **Proposal A**: assign stage 21 to `1.26x.mp3` instead. The
glitched/accelerated feel matches a mech-chase. Stage 14 (Recycle
Bin) is currently the only user of `1.26x.mp3` — it's a side
stage, so freeing the track to also fire on 21 is fine (player
will rarely play both back-to-back).

→ **Proposal A-alt**: leave 21 on `backstage.mp3` since they're
both "chase corridor" stages, just stylistically different. The
shared rhythm preserves the "this is a corridor between two boss
arenas" identity. Honestly defensible.

**(B) `apocalypse` plays in stages 20 AND 22** with stage 21 between
them on a different track. So the player hears apocalypse → backstage
→ apocalypse. That's actually fine — the corridor between two boss
fights is supposed to feel different.

**(C) Track quality is uniform** — all are Owl Hall masters with the
same loudness target. No outlier "weaker" tracks.

**(D) `hope.mp3` is wired to both `gameComplete` AND `hope` keys.**
Latter is unused per the FILE_TRACKS comments — verified no caller.
Could remove the duplicate `hope` entry but it's harmless aliasing.

### Net recommendation

The track assignments are already thoughtful (the per-track comments
in audio.js show real reasoning). The only one I'd flag is the
3-stage re-use of `backstage.mp3` (Proposal A vs A-alt). Both
defensible — your call.

**Approval requested for:** Proposal A (stage 21 → `1.26x.mp3`) or
A-alt (no change). Everything else stays.

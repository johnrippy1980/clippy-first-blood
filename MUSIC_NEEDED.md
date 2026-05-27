# MUSIC NEEDED — R542 audit (R545 update), 2026-05-26

## R545 → R548 UPDATE — FIVE NEW TRACKS LANDED

- **STEEL TONGUES** → stage 25 HOLD THE LINE (Tier-1 #1 closed).
  Industrial siege metal for the turret-defense wave phase.
- **METRO** → stage 9 KEYNOTE CORRIDOR (Tier-2 #4 closed).
  Splits stage 9 off from the shared `backstage.mp3`.
- **GEARS** → CRTRON boss-phase (Tier-1 #2 closed). Auto-swaps in
  via `audio.playTrack('gears')` inside `_spawnVoltron()` — the
  existing 350ms playTrack crossfade ramps STEEL TONGUES out as
  GEARS ramps in the moment the boss spawns.
- **CONDUIT** → stage 21 MECHA CORRIDOR helicopter chase (Tier-2
  #5 closed). Splits the chopper pursuit off from the shared
  `recycleBin.mp3` (which was the S1 secret theme — felt
  mismatched against the chase beat).
- **DIRECT** → stage 20 MECHA APPROACH opener (Tier-2 #3 partial).
  Splits the mecha-trilogy opener off from the shared
  `apocalypse.mp3`. Mecha trilogy now has DIRECT → CONDUIT → ?
  (stage 22 still shares apocalypse with stage 16).

Both Tier-1 critical items + 3 Tier-2 items now closed. 26 shipped
tracks total. Outstanding wishlist items below.

All 26 currently-shipped tracks are wired and present on disk. The
list below identifies **NEW tracks** that today's content would
benefit from. These are NOT bugs — every stage HAS a track today
(reusing existing ones). These are the **upgrade slots** if you
want to compose more.

## CURRENT TRACK ASSIGNMENTS

| Stage | Name | Track (file) | Status |
|-------|------|--------------|--------|
| Title + Story | DREAM (`dream.mp3`) | shipped |
| 1 OFFICE PARK JUNGLE | REVENGE (`revenge.mp3`) | shipped |
| 2 THE BREAK ROOM | WHAT WAS IT FOR? (`what-was-it-for.mp3`) | shipped |
| 3 SERVER ROOM | NO REMORSE (`no-remorse.mp3`) | shipped |
| **25 HOLD THE LINE (NEW)** | ARENA (`arena.mp3`) | **REUSED — needs own track** |
| 4 THE PIPELINE | YOU'VE BEEN LOVING ME (`youve-been-loving.mp3`) | shipped |
| 5 THE BOARD ROOM | NO PITY (`no-pity.mp3`) | shipped |
| 6 BALLMER OFFICE | BACKSTAGE (`backstage.mp3`) | shipped |
| 7 BALLMER ARENA | ARENA (`arena.mp3`) | shipped |
| 8 KEYNOTE HALL | DON'T GO (`dont-go.mp3`) | shipped |
| 9 KEYNOTE CORRIDOR | BACKSTAGE (`backstage.mp3`) | shipped (shared with 6) |
| 10 GATES ARENA | ARENA (`arena.mp3`) | shipped (shared with 7+25) |
| 11 FOUNDER'S LAIR | DISBELIEF (`disbelief.mp3`) | shipped |
| 12 BOSS RUSH | NIGHT DRIVE (`night-drive.mp3`) | shipped |
| 13 THE CLOUD | THE PATH (`the-path.mp3`) | shipped |
| 14 RECYCLE BIN (S1) | 1.26X (`1.26x.mp3`) | shipped |
| 15 TRAINING GROUND | RESOLUTION (`resolution.mp3`) | shipped |
| 16 FLOOR 11 (Doom) | THE LIGHT BLEEDS THROUGH (`the-light-bleeds-through.mp3`) | shipped |
| 17 TIME TRIAL | NEVER THE SAME (`never-the-same.mp3`) | shipped |
| 18 REALITY DISTORTION (Jobs) | TIME IS A FLAT CIRCLE (`time-is-a-flat-circle.mp3`) | shipped |
| 19 CORE BREACH | DREAMS FADE (`dreams-fade.mp3`) | shipped |
| 20 MECHA APPROACH | THE LIGHT BLEEDS THROUGH (`the-light-bleeds-through.mp3`) | shipped (shared with 16+22) |
| 21 MECHA CORRIDOR | 1.26X (`1.26x.mp3`) | shipped (shared with 14) |
| 22 MECHA-GATES | THE LIGHT BLEEDS THROUGH (`the-light-bleeds-through.mp3`) | shipped (shared with 16+20) |
| 23 BLOCK 11 (Doom) | EVOLUTION (`evolution.mp3`) | shipped (shared with 24) |
| 24 BOSS RUSH MODE | EVOLUTION (`evolution.mp3`) | shipped |
| Credits | HOPE (`hope.mp3`) | shipped |
| Bonus | BONUS (`bonus-2.mp3`) | shipped |

## RECOMMENDED NEW TRACKS

### TIER 1 — strongest case for a unique track

1. ~~**HOLD THE LINE** (stage 25)~~ — **LANDED R545 (steel-tongues.mp3)**

2. ~~**CRTRON BOSS**~~ — **LANDED R546 (gears.mp3)**

### TIER 2 — desirable variety

3. **MECHA TRILOGY UNIFIED THEME** (stages 20, 21, 22)
   - Currently all 3 share `the-light-bleeds-through.mp3`
   - The trilogy is a 3-act arc; could have an INTRO version (20),
     CHASE version (21), and FINAL CLIMAX version (22)
   - Filenames: `mecha-approach.mp3`, `mecha-chase.mp3`,
     `mecha-final.mp3` (or 3 variants of one base composition)

4. ~~**KEYNOTE CORRIDOR** (stage 9)~~ — **LANDED R545 (metro.mp3)**

5. ~~**MECHA CORRIDOR** (stage 21 chopper chase)~~ — **LANDED R547 (conduit.mp3)**

### TIER 3 — nice-to-have

6. **STAGE 7 BALLMER ARENA** (currently `arena.mp3`)
   - Could have its own brawl theme since it's the new MELEE
     brawler variant (R516)
   - Filename: `boardroom-brawl.mp3`

7. **STAGE 22 MECHA-GATES** (currently `apocalypse.mp3` shared with 16+20)
   - Climactic true-final brawl — deserves an own track
   - Filename: `mecha-gates-final.mp3` (or layered re-mix of
     `the-light-bleeds-through.mp3`)

## SUMMARY (POST-R548)

- **0 tracks broken or missing** (all 26 declared files exist)
- **0 Tier-1 critical gaps** closed
- **2 desirable additions** still outstanding
- Best remaining ROI: stage 22 MECHA-GATES finale — currently still
  shares apocalypse.mp3 with stage 16. Splitting it off would
  complete the mecha trilogy musical arc DIRECT → CONDUIT → ?

REMAINING WISHLIST: 2 tracks
- Stage 22 MECHA-GATES finale (currently shares apocalypse with 16)
- Stage 7 BALLMER ARENA dedicated brawl theme (currently shares
  arena.mp3 with stage 10)

# Clippy: First Blood

Contra-style run-and-gun starring Microsoft Clippy on a revenge mission against the board. Vanilla JS + Canvas, no build step.

## Run locally

```bash
npm run dev   # starts python http server on :8765
open http://localhost:8765/
```

## Test

```bash
npm test                 # full pipeline: asset manifest + runtime smoke
npm run test:assets      # ~50ms: validate every MANIFEST entry resolves to a file on disk
npm run test:smoke       # ~10s: load all 22 stages, render menu scenes, spawn bosses, kill stage 1, _restartRun clean
npm run test:perf        # ~5s: 60Hz sample over 3s of stage 1 play — avg FPS, p95 + max frame time
npm run test:stability   # ~15s: cycle all stages + replay, fail if heap grows past 30 MB
npm run tour             # capture mid-stage screenshot per stage → /tmp/tour-stageN.png
npm run audit:traversal  # BFS reachability check — every stage 100% completable
```

A passing `npm test` means: no missing assets on disk, no thrown exceptions on cold load, every scene route renders, every boss spawn works, kill-loop transitions correctly, and 7 invalid-input cases on `_startStage` fall back gracefully.

## Layout

- `src/` — engine
  - `game.js` — top-level scene state machine + loop
  - `player.js` — state machine, physics, weapons
  - `enemies.js` — grunt AI + phased bosses (Copier, Shredder, Ctrl-Alt-Del, Spindler, Ballmer, Gates, Clippy-2, Algorithm, Jobs, Helicopter, Mecha-Gates, plus Gauntlet variants)
  - `boss_lair.js` — boss-arena gating, painted gates, lair tints + decorations
  - `beatem_up.js` — beat-em-up scene engine (stages 7, 20, 22)
  - `fps_arena.js` — FPS corridor scene engine (stages 3, 6, 9)
  - `level.js` — tile collision, stage geometry, cover renderers
  - `parallax.js` — multi-layer painted backgrounds
  - `hud.js`, `camera.js`, `particles.js`, `input.js`, `audio.js`, `pickups.js`, `sprites.js`
  - `achievements.js`, `pixelfont.js`, `options.js`, `constants.js`, `main.js`
- `assets/` — sprites, painted backgrounds, music, SFX
- `tools/` — canonical test + audit scripts
- `tools/captures/` — ad-hoc visual capture scripts kept for archaeology

## Engine

- 256×224 internal resolution upscaled to canvas
- Fixed-timestep accumulator loop @ 60Hz
- Tile collision: AABB sweep X+Y separately, one-way platforms
- Scene state machine: BOOT → TITLE → STORY → STAGE_INTRO → READY → PLAY / FPS_PLAY / BEAT_PLAY → BOSS_INTRO → STAGE_CLEAR → STAGE_CARD → ... → GAME_COMPLETE → EPILOGUE
- 22 stages: 13-stage main campaign + 6 post-game (Recycle Bin secret, Training, Boss Rush Mode, Time Trial, Reality Distortion Field, Core Breach) + 3-stage Mecha trilogy (konami unlock)
- 3 gameplay modes: platformer (default), FPS rail-shooter, beat-em-up brawler
- Web Audio for SFX (procedural) + HTML5 audio for music (cross-faded tracks)

## Conventions

- No build step. ES modules served direct.
- Sprite sheets sliced at load time; missing assets fall back to procedural draws.
- Visual changes verified via `tools/quick-tour.mjs` or a one-off in `tools/captures/`.

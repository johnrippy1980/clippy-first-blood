# Clippy: First Blood

Contra-style run-and-gun starring Microsoft Clippy on a revenge mission against the board. Vanilla JS + Canvas, no build step.

## Run locally

```bash
npm run dev   # starts python http server on :8765
open http://localhost:8765/
```

## Desktop app (download & play)

A standalone desktop build (Electron) runs the game outside the browser — no
server, no internet needed. A small in-process server (`electron/main.js`) serves
the same `index.html`/`src`/`assets` the dev server does, so behavior is identical.

**Controllers** work out of the box (Xbox/PlayStation/generic via the Gamepad
API): left stick / d-pad move, A jump, X shoot, B special, Y grenade, RB aim-lock,
LB shield, right stick 360° aim, Start pause, Back/L3 cycle weapon.

The leaderboard is online-only and fails soft when offline — the rest of the game
(all stages, saves, achievements, ghosts) is fully local via `localStorage`.

```bash
npm run desktop     # run the app from source (dev)
npm run dist:mac    # build a .dmg into dist/  (macOS, ~230MB — assets dominate)
npm run dist:win    # build a Windows installer into dist/
```

The local Mac build is **ad-hoc signed** (no Apple Developer cert). On first
launch Gatekeeper will block it; either right-click the app → **Open** →
**Open**, or run:

```bash
xattr -dr com.apple.quarantine "/Applications/Clippy First Blood.app"
```

## Releasing (CI builds for both platforms)

`.github/workflows/release.yml` builds the Mac `.dmg` **and** Windows `.exe` on
real GitHub-hosted runners and attaches them to a GitHub Release. Push a version
tag to trigger it:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

(Or run it manually from the repo's **Actions** tab → *release* → *Run workflow*.)

By default both builds are unsigned (Mac ad-hoc; Windows triggers a SmartScreen
warning until it earns reputation). To ship a **signed + notarized** Mac build
that opens with no Gatekeeper prompt, add these repo secrets (Settings → Secrets
and variables → Actions) — the workflow auto-detects them:

| Secret | What it is |
| --- | --- |
| `CSC_LINK` | base64 of your *Developer ID Application* `.p12` (`base64 -i cert.p12 \| pbcopy`) |
| `CSC_KEY_PASSWORD` | the `.p12` export password |
| `APPLE_ID` | your Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password from [appleid.apple.com](https://appleid.apple.com) → Sign-In & Security |
| `APPLE_TEAM_ID` | 10-char team id (Developer portal → Membership) |

With no secrets set, `build/notarize.cjs` cleanly no-ops and the build stays
ad-hoc — nothing breaks, you just get the unsigned `.dmg`.

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

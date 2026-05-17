# Clippy: First Blood — Handoff Prompt

Use this as a system/context prompt when continuing work in Claude Code on the terminal. It captures everything needed to pick up where the cloud session left off.

---

## Project

A vanilla-JS HTML5 Canvas SNES-style run-and-gun browser game. The player is **Clippy**, the Microsoft Office paperclip, on a revenge rampage. No build step, no framework — `<script>` tags load everything.

- **Repo:** `clippy-first-blood`
- **Working branch:** `claude/improve-code-quality-ZnnV4`
- **Latest commit at handoff:** `e52e3bc` (push history at `git log --oneline -30`)
- **Demo:** `cd <repo> && python3 -m http.server 8000` → `http://localhost:8000`
- **Standalone:** there's also `clippy-standalone.html` (gitignored) — a single-file build via the bundle script. Open directly in any browser, no server.

## Story

Clippy is at the highest point of his life — helping the world with Word files, married to **Clippetta**, twin paperclip sons, paperclip dog. The Microsoft board, embarrassed by his bad PR, arranges a car bomb. The family dies. Clippy was supposed to be in the car but wasn't that day. He survives. The game is his revenge tour through Microsoft's history — break room, server room, board room, keynote, founder's lair, the cloud — culminating in fights against **Ballmer**, **Bill Gates**, **Clippy 2.0**, and **The Algorithm**.

## Architecture

Resolution `256 × 224` (SNES native), upscaled 3× to `768 × 672` via CSS. `imageSmoothingEnabled = false` for pixel-perfect look. Fixed-timestep accumulator loop with `requestAnimationFrame`, deltaTime clamped to 5 timesteps to survive tab backgrounding.

### Files (`js/`)

| File | Purpose |
|---|---|
| `constants.js` | `GAME`, `PLAYER`, `WEAPON`, `DIFFICULTY`, `ENEMY_TYPE`, `TILE`, `PLAYER_STATE`, `AIM_DIR`. Bosses have a `tagline` field. |
| `pixelfont.js` | `drawPixelText` / `drawPixelTextOutlined` with 7×9 bitmap font. |
| `audio.js` | Web Audio synth. 8 chiptune patterns (jungle/breakroom/serverroom/boardroom/keynote/founder/cloud/title). Per-weapon SFX, jump, hurt, explosion, pickup, slide, combo-break. Music mixer + SFX mixer. |
| `sprites.js` | `SpriteAtlas` (loads PNG sheets + individual PNGs). `ProceduralSprites.drawClippy/drawEnemy` for pixel-array fallback. `CLIPPY_SPRITES` + `CLIPPY_PALETTE`. New: manifest-driven multi-frame PNG loader. |
| `input.js` | Keyboard + touch (virtual d-pad) + gamepad. Press buffer for sub-tick taps. Rebindable via menu. P2 proxy uses numpad. |
| `effects.js` | Particle system. `spawn`, `explosion`, `hitSpark`, `muzzleFlash`, `landDust`, `damageNumber`, `scorePopup`, `jumpPuff`. |
| `achievements.js` | 16-entry `ACHIEVEMENT_LIST`. Loads/saves to localStorage with allowlist gating. Banner queue. |
| `skins.js` | CLASSIC, GOLDEN, CHROME, CLIPPETTA, SHADOW, BLOOD MOON. Each has CSS filter (for PNG) + palette override (for procedural). Per-skin unlock predicate. |
| `password.js` | Encode/decode 10-byte save payload (achievements bitmap + skin + flags + score + combo + checksum). 16-char base32 in 4-char groups. |
| `daily.js` | Date-seeded daily challenge: 7 modifiers (`GLASS PAPERCLIP`, `BERSERKER`, `FAST AND FURIOUS`, `PACIFIST`, `CHAOS THEORY`, `DOUBLE TROUBLE`, `BARE PAPERCLIP`). Best score per date in localStorage. |
| `online_leaderboard.js` | Share-URL encoder/decoder (`TextEncoder`/`TextDecoder`, base64url). POST/GET via `window.CLIPPY_LEADERBOARD_URL` if configured. |
| `midi_export.js` | Standard MIDI File format-1 encoder (TPQN=96). Exports any of the 8 audio patterns. |
| `mods.js` | JSON mod loader. Sanitizes user-supplied stage data (tile array, spawn list, pickups, etc.). Stages appear in Stage Select tagged `mod:true`. |
| `player.js` | Player class. States: idle / running / jumping / falling / crouching / prone / sliding / climbing / wallSliding / cover / hurt / dying. Weapons, bullets, slide attack, second-chance bullet-time rescue, weapon-level upgrade. |
| `enemies.js` | `EnemyManager` + `Enemy`. Behaviors: hop, fly_sine, bounce, stationary, charge, hover_sniper, miniboss, photocopier_boss, shredder_boss, ctrl_alt_del_boss, ballmer_boss, bill_gates_boss, clippy2_boss, algorithm_boss. Bosses have phase 2, telegraphed attacks, multi-stage death. |
| `pickups.js` | Weapon + 1UP pickups. AABB collision. Low-HP magnet at 1HP. Same-weapon stacking → level 2. |
| `level.js` | Tile array, 7 themed renderers, 8 stage loaders, boss-rush, helper queries (`isSolid`, `getCoverSpotAt`, `getLadderAt`), mod-stage loader. |
| `parallax.js` | 7 themed parallax backgrounds. |
| `game.js` | Main `Game` class (~4900 LOC). Per-screen update + render: title, story, stageIntro, playing, cutscene, stageClear, gameComplete, initials, leaderboard, achievements, help, skins, password, daily, menu, midi, rebind, modStages, stageSelect, pause overlay. Persistence, run flags, camera, HUD. |

### Tools

- `tools/render-screenshot.js` — headless harness via `node-canvas`. Renders one frame to PNG. Used for smoke-testing after changes. Args: `node tools/render-screenshot.js <cameraX> <title|play> <stageN>`. Smoke-test all 8: `for s in 1..8; do node tools/render-screenshot.js 0 play $s; done`.

## Controls

| Action | Default |
|---|---|
| Move | Arrow Keys / WASD |
| Jump | Space / Z |
| Shoot | X / Ctrl |
| Lock aim | Shift (hold) |
| Take cover | C (near cover tile) |
| Prone | Down + Down (double-tap) |
| **Slide** | Down + Jump while running |
| Pause | P |
| Mute | M |

P2 (co-op stub): Numpad arrows + Numpad 7/9 for jump/shoot.

## Content

### 8 Stages

| # | Name | Theme | Boss |
|---|---|---|---|
| 1 | Office Park Jungle | jungle | Photocopier 3000 |
| 2 | The Break Room | breakroom | Mega-Shredder |
| 3 | Server Room | serverroom | Ctrl-Alt-Del |
| 4 | The Board Room | boardroom | CEO Ballmer |
| 5 | Keynote Hall | keynote | Bill Gates ("The Founder") |
| 6 | The Founder | founder | Clippy 2.0 |
| 7 | Boss Rush | serverroom | 3 prior bosses |
| 8 | The Cloud | cloud | The Algorithm |

### Bosses (with taglines)

- Copier 3000 — PC-LOAD-LETTER OF DEATH
- Mega-Shredder — CHEWS THROUGH ANYTHING
- Ctrl-Alt-Del — THE BLUE SCREEN OF DEATH
- CEO Ballmer — DEVELOPERS DEVELOPERS DEVELOPERS
- The Founder — YOU HAD ONE JOB, CLIPPY
- Clippy 2.0 — THE REPLACEMENT MODEL
- The Algorithm — IT KNOWS WHAT YOU WANT

### Weapons

MACHINE_GUN, SPREAD, LASER, FLAME, STAPLE_REMOVER, HOMING, THUNDER. Each has distinct fire SFX. Same-weapon repeat pickup → level 2 (+50% damage). Death resets level.

### Skins (Unlock condition)

- CLASSIC (default)
- GOLDEN (clear a stage with no damage)
- CHROME (clear all 6 main stages)
- CLIPPETTA (complete a NewGame+ run)
- SHADOW (clear secret room)
- BLOOD MOON (chain a 20-hit combo)

### Daily Modifiers

GLASS PAPERCLIP (3× damage taken), BERSERKER (2× both ways), FAST AND FURIOUS (1.5× speed), PACIFIST (2× HP / 0.5× dmg), CHAOS THEORY (random weapon every 10s), DOUBLE TROUBLE (2× enemies), BARE PAPERCLIP (no pickups, machine gun only).

## Features Already Implemented (this branch)

**Mechanics**
- Slide attack: state, motion streaks in procedural sprite, sfxSlide, speed-line particles, crouch-entry foot-clip fix.
- Bullet-time second chance: once per stage, lethal hit → 40% slow-mo + 1 HP grace + red vignette + "CLOSE!" popup.
- Weapon level-up via same-weapon stacking, "+" badge in HUD, +500 score when already maxed.
- Combo milestones (5/10/20/30 → STREAK/RAMPAGE/CARNAGE/GOD-LIKE) with bonus score, label popup, screen shake, pickup chime.
- High-combo kill sparkles (count + color tier scale with streak).
- Combo-break SFX on 5+ streak expire.
- Low-HP pickup magnet at 1 HP.

**Bosses**
- Per-boss intro card with tagline.
- Boss HP bar with color-tier fill, hit flash on damage, 50% tick mark, PHASE 2 banner the first time HP crosses 50%.
- Bosses drop bonus random weapon pickup in addition to the guaranteed 1UP.

**HUD / Title / UI**
- Pause-menu shake-intensity slider, persisted in localStorage.
- End-of-run "FAVORITE WEAPON" affinity badge (tracks damage dealt per weapon).
- Title screen daily-challenge ticker (scrolls today's modifier + your best).
- Speedrun timer in HUD.
- Pause was uncancellable — fixed.

**Persistence / state**
- `resetRunFlags()` helper centralizes per-run mode reset, called from every run-start path.
- Leaderboard parse validated as Array, importSharedEntry coerces types.
- escape/unescape replaced with TextEncoder/TextDecoder.
- Mod x/y validated as finite numbers.
- Achievement IDs allowlisted on localStorage load.

**Bugfixes too long to list — see commits.** A few standouts:
- Player `maxHealth` was NaN at constructor (read before assignment).
- Plateau-top checkpoints on 4 stages put feet inside the SOLID wall.
- Boss-rush had no checkpoints array + doors were 1-tile-tall (player couldn't walk through standing).
- Off-screen boss "rain" attacks used hard-coded world coords way left of arena.
- `playerDamageMul` and `regenSpeed` difficulty config were dead — wired up.

## Pending Work

### Sprite-sheet integration (in progress, blocked on PNGs)

The user provided 4 Metal-Slug-style sprite sheets:
1. Player (Clippy as red-bandana soldier)
2. File cabinet (gray drawer with arms)
3. File folder (yellow folder with teeth)
4. Stapler (green stapler with teeth)

**Status:** Loader infrastructure is shipped (`21b92d4`).
- `images/sprites/sheets/manifest.json` defines per-sheet grid + frame names + in-game drawW/drawH.
- `sprites.js loadAllSprites` fetches the manifest, calls `loadSheet` + `defineFrames` per sheet.
- `defineFrames` extended with `cols` + `drawW`/`drawH` so big source frames scale down to in-game size.
- `drawFrame` honors drawW/drawH.
- `drawEnemy` switch tries new frame names first, falls through to legacy + procedural.
- `Player.animFrame` cycles 0..15 (was 0..3) to support the 9-frame run cycle.

**What's missing:** the four PNG files themselves. They need to live at:
```
images/sprites/sheets/player.png
images/sprites/sheets/cabinet.png
images/sprites/sheets/folder.png
images/sprites/sheets/stapler.png
```

The manifest's `frameW`/`frameH`/`drawW`/`drawH` are educated guesses — once the real PNGs are in, run:
```
file images/sprites/sheets/*.png
```
and tune the per-cell dimensions in the manifest to match.

### Remaining feature ideas (deferred)

- A second secret stage (longstanding request).
- Distinct slide pose as full sprite rather than reusing prone + motion streaks.
- Combo trail particles tied to weapon color.
- End-of-stage results breakdown (currently only at game-complete).
- Daily ticker pulling from online leaderboard endpoint instead of just local best.

## Constraints / Preferences

- **Look:** strict SNES aesthetic. No vector primitives (`quadraticCurveTo`, etc.) — all art is `fillRect` with palette colors. Earlier feedback was "looks like Atari 2800" when there were curves; that's been purged.
- **Controls:** must feel "silky smooth and accurate." Variable-jump cut is per-jump (resets latch on each new jump). Press buffer catches sub-tick taps. Fire rate is integer-frame, not float.
- **Scope discipline:** every change should be smoke-tested via `tools/render-screenshot.js`. Avoid adding features without verifying all 8 stages still load.

## Known Sandbox Constraints (if continuing in a cloud agent)

- **`supabase.co` is firewall-blocked** (`HTTP 403 host_not_allowed`). The user's preferred image hosting is unreachable from the cloud sandbox. Use git as the binary-asset transport: have them `git add images/sprites/sheets/*.png && git commit && git push`, then `git pull` on the sandbox.
- **`github.com` / `raw.githubusercontent.com` are reachable.**
- **Chat-pasted images are visible in context but never land as files** on the sandbox disk. There is no tool to write image-content to disk. Anything binary must come through git.
- Stop hook checks for untracked files — keep `git status` clean.

## How to Verify Changes

After any edit:
```bash
node --check js/<changed>.js          # syntax
node tools/render-screenshot.js 0 play 1   # rendering smoke test
for s in 1 2 3 4 5 6 7 8; do node tools/render-screenshot.js 0 play $s; done  # all stages
rm -f screenshot.png
```

Then commit + push + smoke-check in browser.

## Suggested Next Session Goals (pick one)

1. **Wire up the sprite sheets** — needs the PNGs in `images/sprites/sheets/`. Tune manifest dimensions. Verify each enemy / player state renders cleanly.
2. **Second secret stage** — design a hidden short stage accessible from stage 5 (or after a no-damage stage 1 clear). Reuse an existing theme or add a new one (`darkweb`, `recycle_bin`).
3. **Damage-number polish** — colors per weapon kind, crit-shake on the number.
4. **Speedrun leaderboard** — separate from regular leaderboard, sorted by time not score. Persistence already in place for per-stage best times.

---

End of handoff. Hand this whole document to the next agent as the opening message.

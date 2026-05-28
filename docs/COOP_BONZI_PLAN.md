# Co-op + Bonzi Buddy — Implementation Plan

Status: **planned**, not started. Designed in conversation with John
on 2026-05-27 evening.

## Premise

Add **local 2-player tag-team co-op** with **Bonzi Buddy as P2**. Bonzi
is mechanically distinct from Clippy (not a re-skin). Single-player
experience is **untouched** — co-op is purely additive and is unlocked
by beating a hidden post-game boss.

The narrative hook: a corporate boardroom name-drop in the existing
intro cinematic foreshadows Bonzi as Clippy's eventual replacement.
On a 2nd playthrough (or post-game), the player finds and fights Bonzi
in a hidden stage. Defeating him triggers a forced-alliance cinematic
and unlocks co-op.

## Design decisions (locked)

| Decision | Choice |
|---|---|
| Stage coverage | **All 25 stages** — engine-specific co-op behavior per engine type |
| Lives | **Shared pool, 2× count** (6 instead of 3). Either character dying drains it. Letting one player carry the other is intentional. |
| Networking | **Local only** for v1 |
| Achievements | **Co-op-only set** in addition to existing 35 |
| Tag cooldown | **5s base + death-cancel override** (see "Tag mechanics" below) |
| Co-op unlock | **Hidden post-game stage** (`THE COMPETITION`, stage 26) where Bonzi is the boss |
| Foreshadowing | Boardroom cinematic name-drops Bonzi; pays off in post-game |

## Tag mechanics

- Normal tag: **5s cooldown** between voluntary swaps. Strategic but not punishing.
- **Death-cancel tag:** if active character drops to ≤1 HP, the other
  player can tag in **instantly** regardless of cooldown. Resets the
  cooldown to 8s after the rescue. Rewards observation + coordination.
- **Forced swap on death:** if active character actually dies, swap is
  instant. The other character takes over with their saved state.
  Shared lives pool drains by 1.

This avoids both extremes (10s = too rigid, 0s = combo-spam meta).

## State snapshots (per character)

Each character has independent state. On tag-out, snapshot:
- HP / max HP / weapon inventory / active weapon / ammo
- Grenade count
- Combo counter + multiplier
- Score
- Tag cooldown timer
- Position + facing (so swap-in lands nearby)
- Active status effects (rage, iframes, etc.)

Shared across the run:
- Lives pool (6 default)
- Stage progression
- Stage best scores (best of either character)
- Co-op achievement progress

## Engine-specific co-op treatment

| Engine | Stages | Treatment |
|---|---|---|
| Platformer (side-scroll) | 1-5, 8, 10-15, 18 | Tag-swap works natively. Single character on screen at a time. |
| FPS arena (3rd-person back) | 6, 19 | Same — tag swaps which character is at the turret. |
| Beat-em-up brawler | 7, 20, 22 | Same. Tag-in spawns from screen edge (canonical beat-em-up entry). |
| Doom raycaster (1st-person) | 16, 23 | **Special case** — 1st-person co-op is awkward. Tag-in plays a partner-assist (Bonzi reaches in from screen edge, fires popup storm, exits). Doesn't actually swap controlled character; it's a support call. |
| Turret arena | 25 | Same as FPS. Tag swaps which character is at the gun. |

## Bonzi character profile

Slow + heavy + intrusive. Foil to Clippy's fast + nimble + sharp.

### Movement
- Walk speed: **80%** of Clippy's
- Jump height: **110%** (bigger frame, more vertical)
- Air control: **worse** (committed to jumps)
- Slide replaced with **shoulder charge** — same i-frames, pushes
  enemies back instead of sliding under them.

### Specials
- **GAZE** (tap special) — purple targeting line locks onto nearest
  enemy through walls for 2s. Active = bullets autoaim slightly toward
  target. Tags the enemy visually for P1 too. Cooldown 8s.
- **POPUP STORM** (hold + release special) — swarm of fake IE-window
  sprites fly outward and damage enemies on contact. Replaces grenade.
- **DIAL-UP SCREAM** (special while not aimed) — 3-tile-radius enemy
  stun for 2s. Cooldown 12s.
- **CRYING TANTRUM** (passive) — below 2 HP, eyes glow red, shoulder
  charge does 2× damage. Tear particles.

### Weapon
**Banana that peels into being a gun.** Fires sticky purple goo.
- Sticks 2s, detonates on timer OR 2nd shot
- Lower DPS than Clippy's MG but spammable + area control
- Bonzi can't pick up Clippy's weapons (single weapon for him)

### Tag-in attack
**BANANA BARRAGE** — Bonzi swings in from above on a vine
(Donkey Kong reference), peels and throws 3 bananas in a fan, lands
stomp. 4-frame i-frames on the swap.

## Co-op-only achievements

Locked behind `coopMode === true`:

- **TWO PAPERCLIPS** — clear stage 1 in co-op
- **PROFESSIONAL PARTNERSHIP** — clear the full main campaign in co-op
- **SYNCED HEARTBEAT** — both players' HP at 1 simultaneously, then both survive a wave
- **TAG TEAM CHAMPIONS** — clear a boss with 4+ tag swaps during the fight
- **CARRY ON** — one player dies 5+ times in a stage and the other still clears it
- **PERFECT HANDOFF** — chain 5 tags in a single fight without missing damage
- **RIDE OR DIE** — clear all 25 stages with the same character active for every boss kill
- **ANNOYING ASSISTANT** — Bonzi-only kills in a stage (Clippy doesn't fire)
- **CLIPS OVER GORILLAS** — Clippy-only kills in a stage
- **NEW MANAGEMENT** — defeat Bonzi as boss in single-player (unlock prereq)

## Boardroom cinematic name-drop

Existing BOARDROOM cinematic gets 3 new dialog lines injected. No
new art needed — just dialog overlay on the existing scene.

```
BOARD MEMBER 1: "We're done with him."
BOARD MEMBER 2: "What about the replacement? Bonzi?"
BOARD MEMBER 3: "He's testing well. Aggressive growth."
BOARD MEMBER 1: "Then it's settled. Clippy is out."
```

Reads as normal corporate flavor on first playthrough. After the
THE COMPETITION reveal, "aggressive growth" becomes foreshadowing
for Bonzi's spyware-aggression character.

## Stage 26: THE COMPETITION

**Unlock gate:** Visible only after the player has cleared the main
campaign (stages 1-13) at least once. Shows as `???` on the
post-game stage-select grid until earned.

**Stage tagline (on the select tile):**
> "He wasn't the only one they replaced."

**Scene:** A corporate office launch party. Bonzi is being celebrated
on stage. Clippy crashes through the window.

**Boss fight:** Bonzi uses the same abilities that the player will
later unlock (banana gun, popup storm, dial-up scream, crying tantrum
when low HP). Combat foreshadowing — the player learns the moveset
they're about to get.

**Defeat cinematic:** Bonzi and Clippy realize they were BOTH let go
by Microsoft. Forced alliance. Co-op mode unlocks. Bonzi becomes
playable.

## Gallery callbacks (slice 7.5)

After defeating Bonzi:
- A new **BONZI VARIANT** tile appears in the SCENES gallery, pointing
  at the existing BOARDROOM cinematic but with the name-drop dialog
  highlighted so observant players see the foreshadowing was there
  all along.
- Bonzi himself gets a portrait entry in the BOSSES gallery tab.
- Bonzi gets a player-character entry in a new section (if we add a
  CHARACTERS tab — optional).

## Implementation slices

Build in order. Each slice ends playable.

### Slice 1 — Foundation (1-2 days)
- `coopMode` flag in game state
- 2nd input dispatcher (gamepad 2 + alt keyboard scheme)
- Stub Bonzi as a Player subclass — copies Clippy exactly, labeled "BONZI"
- Tag button binding (TAB / gamepad 2 START)
- HUD: 2nd portrait + HP bar + ammo + tag-cooldown indicator
- Shared lives (6 default)
- "CO-OP" menu option on title (initially hidden behind unlock — see slice 7)
- Tag-cooldown timer (no abilities yet)

**Playable:** Two identical Clippys taking turns. Validates pipeline.

### Slice 2 — Tag-swap animation + death-cancel (3-4 days)
- 1.5s swap-in animation (outgoing salutes, incoming drops/swings/slides in)
- Death-cancel mechanic (instant swap on ≤1 HP)
- Panic-tag UI flash on P2's portrait when P1 is in danger
- Per-engine swap entry: brawler = walk-in from side, platformer = drop
  from above, FPS/turret = step in from behind
- Tag-in sound + character voice cue

**Playable:** Tag feel polished. Death rescue works.

### Slice 3 — Bonzi sprite + base movement (1 week + ~$5 gen budget)

Asset generation via Local Howl image-gen (gemini-pro):
- Side-view: idle, run cycle (6 frames), jump, fall, hurt, death, charge
- Behind-view for FPS/turret: idle + run 2 frames
- Portrait for gallery + HUD
- Boss-intro plate for "BONZI HAS ARRIVED" sting

Engine work:
- Wire sprites into existing animation system
- Bonzi movement profile (80% speed, 110% jump, worse air control)
- Bonzi can't equip Clippy's weapons

**Playable:** Bonzi looks and moves distinctly. Still uses MG fallback.

### Slice 4 — Bonzi's banana weapon (3-4 days)
- New weapon class: banana fires sticky purple goo
- Goo: sticks 2s, detonates on timer OR 2nd shot
- Mass-detonate visual on chain explosions
- Replace Bonzi's MG with banana (no weapon swap UI for him)
- Sound: squelch fire, wet-pop detonation, sticky contact

**Playable:** Bonzi has a meaningful primary weapon.

### Slice 5 — Bonzi's specials (1 week)
Ship each ability as its own commit:
- **GAZE** — wall-piercing target lock + soft autoaim
- **POPUP STORM** — IE-window swarm
- **DIAL-UP SCREAM** — radial enemy stun
- **CRYING TANTRUM** — low-HP rage passive

**Playable:** Bonzi feels mechanically distinct. Players choose him for certain encounters.

### Slice 6 — Co-op achievements + polish (3-4 days)
- New `coopOnly: true` flag in achievements.js
- 9 new achievements (see list above)
- Bonzi gallery portrait + bio
- Stage-select: "CO-OP" badge on completed-in-co-op stages
- Stage clear: dual score display in co-op

**Playable:** Co-op feature-complete. Players unlock unique achievements.

### Slice 6.5 — Boardroom name-drop (10 minutes)
- Inject 3 new dialog lines into BOARDROOM cinematic
- No new art
- No unlock changes — fires on every playthrough as flavor text

### Slice 7 — THE COMPETITION boss fight (~1 week)
- New stage 26 (post-game tile, gated on main-campaign clear)
- Boss-intro plate (1 generated image)
- Boss fight: Bonzi uses same abilities the player will get
- Defeat cinematic (2 generated images + story-card sequence)
- Co-op unlock gate: `stats.bonziDefeated === true` reveals CO-OP menu
- `NEW MANAGEMENT` achievement on first defeat

**This is where co-op actually unlocks.** Until this slice ships,
slices 1-6 are gated behind a debug flag or hidden menu.

### Slice 7.5 — Gallery callbacks (1 hour)
- BONZI VARIANT tile in SCENES gallery (points at BOARDROOM with
  dialog highlight overlay)
- Bonzi BOSSES gallery entry
- Optional: CHARACTERS gallery tab

## Total scope estimate

**Slices 1-6 (functional co-op):** ~3 weeks focused work + ~$3 asset gen

**Slices 1-7.5 (co-op + boss unlock + gallery):** ~4 weeks + ~$10 asset gen

## Risk areas to watch

1. **Input system** — current code assumes single input source. The 2nd
   dispatcher must NOT interfere with single-player (autodetect by
   controller count + which keys are pressed).

2. **Doom stages** — 1st-person co-op is genuinely awkward. The
   support-call workaround is the best compromise but it's the slice
   with the most engine-specific code.

3. **HUD real estate** — SNES resolution 256×224 is tight. P2's HUD
   needs to live on the opposite side from P1's. Mock up the layout
   before coding.

4. **Save schema migration** — coopMode-aware achievements need a
   separate flag (`stats.coopMode`) and a schema bump. Precedent exists
   in R565d (schemaVersion 301→302).

5. **Two characters means double the sprite work** — Bonzi needs his own
   versions of: hurt, death, special-move poses, gallery portrait,
   boss-intro plate. Budget the asset-gen time generously.

## Decision points to revisit when building

- **Does Bonzi unlock progressively or all-at-once?** Could ship as
  bare base movement + banana, then unlock specials by playing co-op
  with him for X stages. More grindy but adds reason to keep playing.
- **Achievement variants** — should some single-player achievements
  have a "co-op" variant that's harder (like "Beat boss rush" vs
  "Beat boss rush in co-op")?
- **Story integration depth** — does the ENDING cinematic change if
  the player has unlocked Bonzi vs not? Could add a 2-second tag where
  Bonzi appears at the end of Clippy's final scene.

---

When ready to start, begin with **Slice 1**. It's the cheapest
validation — 1-2 days of work that proves the tag-swap pipeline before
any Bonzi assets land. If slice 1 feels right, the rest is content
generation on a known foundation.

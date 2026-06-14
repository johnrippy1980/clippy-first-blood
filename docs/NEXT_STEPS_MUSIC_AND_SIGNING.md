# Next steps — remastered music swap + code signing

Two parked tasks waiting on assets/accounts. Written 2026-06-14.

---

## 1. Replace in-game music with John's re-mastered tracks

**Source:** `~/Documents/Me/Tracks/Clippy First Blood/` — 30 high-quality WAV
files (John's own re-masters; ~9.3 GB total). These should REPLACE the current
in-game music, which is lower-quality MP3.

**Why a swap, not new wiring:** the game references music by FIXED MP3 filenames
in the `MUSIC` map in `src/audio.js` (e.g. `title: 'assets/audio/dream.mp3'`).
So the whole job is: convert each WAV → MP3, write it to `assets/audio/` under
the EXISTING canonical filename. **No code changes needed** if names are kept.

**Tooling:** `ffmpeg` is installed (v8.1.1 at `/opt/homebrew/bin/ffmpeg`).
Suggested encode (matches the existing ~192-256kbps stereo MP3s; tune if John
wants higher): `ffmpeg -i "in.wav" -codec:a libmp3lame -b:a 256k -ar 44100 out.mp3`

### WAV → canonical MP3 name map (30 tracks)

| Source WAV | → `assets/audio/<name>.mp3` |
| --- | --- |
| `1.26x.wav` | `1.26x.mp3` |
| `arena.wav` | `arena.mp3` |
| `backstage.wav` | `backstage.mp3` |
| `bonus.wav` | `bonus-2.mp3`  ⚠️ note the `-2` suffix |
| `Conduit.wav` | `conduit.mp3` |
| `direct.wav` | `direct.mp3` |
| `disbelief.wav` | `disbelief.mp3` |
| `Don't Go.wav` | `dont-go.mp3` |
| `dreams fade.wav` | `dreams-fade.mp3` |
| `evolution.wav` | `evolution.mp3` |
| `Gears.wav` | `gears.mp3` |
| `hope.wav` | `hope.mp3` |
| `indirect.wav` | `indirect.mp3` |
| `Metro.wav` | `metro.mp3` |
| `never the same.wav` | `never-the-same.mp3` |
| `Night Drive.wav` | `night-drive.mp3` |
| `No pity.wav` | `no-pity.mp3` |
| `No remorse.wav` | `no-remorse.mp3` |
| `NO.wav` | `no.mp3` |
| `payback.wav` | `payback.mp3` |
| `resolution.wav` | `resolution.mp3` |
| `Steel Tongues.wav` | `steel-tongues.mp3` |
| `sweat.wav` | `sweat.mp3` |
| `The Dream.wav` | `dream.mp3`  ⚠️ verify — `dream.mp3` is title/story/credits |
| `the light bleeds through.wav` | `the-light-bleeds-through.mp3` |
| `the path.wav` | `the-path.mp3` |
| `The Revenge.wav` | `revenge.mp3`  ⚠️ verify rename |
| `time is a flat circle.wav` | `time-is-a-flat-circle.mp3` |
| `What was it for?.wav` | `what-was-it-for.mp3` |
| `You've been loving me.wav` | `youve-been-loving.mp3` |

⚠️ Before overwriting, CONFIRM the three flagged renames by ear (`The Dream` →
`dream`, `The Revenge` → `revenge`, `bonus` → `bonus-2`). The current originals
are preserved in `assets/audio/_originals_pre_r352/` and are gitignored, so we
have a fallback. Also there's no WAV that obviously maps to the existing
`bonus-2.mp3` vs a plain `bonus.mp3` — current dir only has `bonus-2.mp3`, and
`bonus.wav` is the only bonus source, so `bonus.wav → bonus-2.mp3`.

### Process when picked up
1. Convert all 30 WAVs → MP3 into a temp dir, spot-check a few by ear + confirm
   durations roughly match the originals (catches a bad name mapping).
2. Copy over `assets/audio/<name>.mp3` (keep `_originals_pre_r352/` untouched).
3. Re-run `npm run test:assets` (every MANIFEST/MUSIC path must still resolve)
   and a quick in-game listen on a couple of stages.
4. Watch repo size: 30 MP3s at higher bitrate will grow the repo + each desktop
   build's 230 MB asset payload. If they balloove, consider VBR (`-q:a 2`).
5. Commit `Rxxx: remaster in-game music (higher-quality re-masters)` + push.
   This IS a user-facing change but there's no changelog file in THIS repo
   (the changelog rule is for seo-dashboard-app, a different project) — just
   commit + push, Vercel auto-deploys.

---

## 2. Code signing (so installers open with no warnings)

The CI pipeline (`.github/workflows/release.yml`) already builds Mac `.dmg` +
Windows `.exe` and auto-signs the Mac build the moment Apple secrets exist.
Today's v1.0.0 installers are UNSIGNED (Mac ad-hoc → Gatekeeper prompt; Windows
→ SmartScreen "unknown publisher"). Both still install + run fine.

### When John gets his Apple Developer account ($99/yr)
Add these as repo secrets (Settings → Secrets and variables → Actions), then
re-push a tag — the workflow flips to a signed + notarized build automatically,
no code changes:

| Secret | What it is |
| --- | --- |
| `CSC_LINK` | base64 of the *Developer ID Application* `.p12` (`base64 -i cert.p12 \| pbcopy`) |
| `CSC_KEY_PASSWORD` | the `.p12` export password |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password (appleid.apple.com → Sign-In & Security) |
| `APPLE_TEAM_ID` | 10-char team id (Developer portal → Membership) |

Windows code signing is a SEPARATE paid cert (e.g. an OV/EV cert from a CA);
not wired yet. SmartScreen warnings fade as download reputation builds, so this
is lower priority than Mac.

### Cut a new release
`git tag v1.0.1 && git push origin v1.0.1` → CI builds both, attaches to a
GitHub Release at github.com/johnrippy1980/clippy-first-blood/releases.

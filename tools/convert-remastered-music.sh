#!/usr/bin/env bash
# Convert John's re-mastered WAVs → 320k MP3 under the game's canonical filenames.
# Source durations were verified to match the existing originals 1:1 before this
# ran, so the name map below is duration-confirmed (no track swaps).
set -euo pipefail

SRC="$HOME/Documents/Me/Tracks/Clippy First Blood"
OUT="/tmp/cfb-music-out"
mkdir -p "$OUT"

# "WAV basename (no ext)" -> "canonical mp3 name (no ext)"
declare -a MAP=(
  "1.26x|1.26x"
  "arena|arena"
  "backstage|backstage"
  "bonus|bonus-2"
  "Conduit|conduit"
  "direct|direct"
  "disbelief|disbelief"
  "Don't Go|dont-go"
  "dreams fade|dreams-fade"
  "evolution|evolution"
  "Gears|gears"
  "hope|hope"
  "indirect|indirect"
  "Metro|metro"
  "never the same|never-the-same"
  "Night Drive|night-drive"
  "No pity|no-pity"
  "No remorse|no-remorse"
  "NO|no"
  "payback|payback"
  "resolution|resolution"
  "Steel Tongues|steel-tongues"
  "sweat|sweat"
  "The Dream|dream"
  "the light bleeds through|the-light-bleeds-through"
  "the path|the-path"
  "The Revenge|revenge"
  "time is a flat circle|time-is-a-flat-circle"
  "What was it for?|what-was-it-for"
  "You've been loving me|youve-been-loving"
)

i=0
for entry in "${MAP[@]}"; do
  wav="${entry%%|*}"
  mp3="${entry##*|}"
  i=$((i+1))
  in="$SRC/$wav.wav"
  out="$OUT/$mp3.mp3"
  if [[ ! -f "$in" ]]; then
    echo "[$i/30] MISSING SOURCE: $in" >&2
    exit 1
  fi
  echo "[$i/30] $wav.wav -> $mp3.mp3"
  ffmpeg -nostdin -y -loglevel error -i "$in" \
    -codec:a libmp3lame -b:a 320k -ar 44100 -ac 2 "$out"
done

echo "DONE: $i files in $OUT"
ls -1 "$OUT" | wc -l

#!/usr/bin/env python3
"""R352 — Master the Clippy First Blood soundtrack from WAV originals.

For each game MP3 we have a matching WAV in ~/Downloads/Clippy Tracks/.
This script applies a mastering chain (high-pass, low-shelf, presence
shelf, gentle bus compression, loudnorm to -14 LUFS) and re-encodes to
320 kbps MP3 with clean ID3 tags:

    artist:  R_I_P
    album:   Clippy First Blood
    year:    2026
    title:   <human title derived from the WAV filename>
    comment: <empty>

Mp3 path inside the repo stays the same — game code references those
paths and we don't want to touch it.
"""
import os
import subprocess
import sys

REPO_MP3_DIR = '/Users/jrippy/clippy-first-blood/assets/audio'
WAV_DIR = '/Users/jrippy/Downloads/Clippy Tracks'

# Explicit mapping: { mp3_basename: (wav_filename, display_title) }
# Titles are human-readable (Title Case with proper punctuation).
MAP = {
    '1.26x.mp3':                       ('1.26x.wav',                       '1.26x'),
    'arena.mp3':                       ('arena.wav',                       'Arena'),
    'backstage.mp3':                   ('backstage.wav',                   'Backstage'),
    'bonus-2.mp3':                     ('bonus.wav',                       'Bonus'),
    'disbelief.mp3':                   ('disbelief.wav',                   'Disbelief'),
    'dont-go.mp3':                     ("Don't Go.wav",                    "Don't Go"),
    'dream.mp3':                       ('The Dream.wav',                   'The Dream'),
    'dreams-fade.mp3':                 ('dreams fade.wav',                 'Dreams Fade'),
    'evolution.mp3':                   ('evolution.wav',                   'Evolution'),
    'hope.mp3':                        ('hope_.wav',                       'Hope'),
    'never-the-same.mp3':              ('never the same.wav',              'Never the Same'),
    'night-drive.mp3':                 ('Night Drive.wav',                 'Night Drive'),
    'no-pity.mp3':                     ('No pity.wav',                     'No Pity'),
    'no-remorse.mp3':                  ('No remorse.wav',                  'No Remorse'),
    'resolution.mp3':                  ('resolution.wav',                  'Resolution'),
    'revenge.mp3':                     ('The Revenge.wav',                 'The Revenge'),
    'the-light-bleeds-through.mp3':    ('the light bleeds through.wav',    'The Light Bleeds Through'),
    'the-path.mp3':                    ('the path.wav',                    'The Path'),
    'time-is-a-flat-circle.mp3':       ('time is a flat circle.wav',       'Time Is a Flat Circle'),
    'what-was-it-for.mp3':             ('What was it for?.wav',            'What Was It For?'),
    'youve-been-loving.mp3':           ("You've been loving me.wav",       "You've Been Loving Me"),
}

ARTIST = 'R_I_P'
ALBUM = 'Clippy First Blood'
YEAR = '2026'

# Mastering chain. Order matters:
#   1. highpass: kill subsonic rumble below 28 Hz (clean low end)
#   2. equalizer low-shelf: +2 dB @ 80 Hz (body / weight)
#   3. equalizer mid scoop: -1 dB @ 400 Hz (de-mud)
#   4. equalizer high-shelf: +1.5 dB @ 9 kHz (air / presence)
#   5. acompressor: gentle 4:1 glue compression
#   6. loudnorm: integrated -14 LUFS, TP -1.0, LRA 11 (Steam / streaming)
FILTER = ','.join([
    'highpass=f=28',
    'equalizer=f=80:t=q:w=0.7:g=2',
    'equalizer=f=400:t=q:w=1.0:g=-1',
    'equalizer=f=9000:t=q:w=0.8:g=1.5',
    'acompressor=threshold=-18dB:ratio=4:attack=20:release=200:makeup=2',
    'loudnorm=I=-14:TP=-1.0:LRA=11',
])


def master_one(mp3_name, wav_name, title):
    wav_path = os.path.join(WAV_DIR, wav_name)
    mp3_path = os.path.join(REPO_MP3_DIR, mp3_name)
    if not os.path.exists(wav_path):
        print(f'  MISSING WAV: {wav_path}')
        return False
    cmd = [
        'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
        '-i', wav_path,
        '-af', FILTER,
        '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '44100',
        '-id3v2_version', '3', '-write_id3v1', '1',
        '-map_metadata', '-1',  # strip ALL input metadata first
        '-metadata', f'title={title}',
        '-metadata', f'artist={ARTIST}',
        '-metadata', f'album_artist={ARTIST}',
        '-metadata', f'album={ALBUM}',
        '-metadata', f'date={YEAR}',
        '-metadata', f'TYER={YEAR}',
        '-metadata', 'comment=',
        mp3_path,
    ]
    print(f'  {mp3_name:40s} <- {wav_name}  [{title}]')
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f'    FAIL: {r.stderr.strip()}')
        return False
    return True


if __name__ == '__main__':
    only = sys.argv[1] if len(sys.argv) > 1 else None
    items = MAP.items() if not only else [(only, MAP[only])]
    print(f'=== R352 master {len(items)} track(s) ===')
    ok = 0
    for mp3_name, (wav_name, title) in items:
        if master_one(mp3_name, wav_name, title):
            ok += 1
    print(f'Done. {ok}/{len(items)} succeeded.')

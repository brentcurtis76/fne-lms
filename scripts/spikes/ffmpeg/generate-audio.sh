#!/usr/bin/env bash
#
# Z0B ffmpeg spike — step 1: build SYNTHETIC Spanish session audio.
#
# Hard rule (CLAUDE.md): no real session audio, ever. Every sample here is
# macOS `say` text-to-speech over a synthetic consulting-session script
# (corpus-es.txt). Nothing recorded, nothing from a school.
#
# Output profile mimics a Zoom cloud "audio only" recording: M4A container,
# AAC, 32 kHz. The exact profile Zoom emits is confirmed in the credentialed
# spike (Z0B-2) — this one only needs a representative input to transcode.
#
# Usage: ./generate-audio.sh [OUT_DIR]
set -euo pipefail

OUT_DIR="${1:-${TMPDIR:-/tmp}/zoom-ffmpeg-spike}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORPUS="$HERE/corpus-es.txt"
WORK="$OUT_DIR/work"

# Rotating voices so the looped block is not one speaker on repeat.
VOICES=("Mónica" "Paulina" "Flo (Spanish (Spain))")
SILENCE_SECONDS=2.0
SAMPLE_RATE=32000

mkdir -p "$WORK"
rm -f "$WORK"/seg_*.aiff "$WORK/concat.txt"

echo "==> Synthesizing speech segments (macOS say, Spanish voices)"
i=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  voice="${VOICES[$((i % ${#VOICES[@]}))]}"
  say -v "$voice" -o "$WORK/seg_$(printf '%03d' "$i").aiff" "$line"
  i=$((i + 1))
done < "$CORPUS"
echo "    $i segments"

echo "==> Generating ${SILENCE_SECONDS}s silence spacer (split points for silencedetect)"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "anullsrc=r=$SAMPLE_RATE:cl=mono" -t "$SILENCE_SECONDS" \
  -c:a pcm_s16le "$WORK/silence.wav"

echo "==> Assembling one block (speech / silence / speech / ...)"
: > "$WORK/concat.txt"
for f in "$WORK"/seg_*.aiff; do
  # Normalize each segment to a common PCM profile so concat is lossless.
  ffmpeg -hide_banner -loglevel error -y -i "$f" \
    -ar "$SAMPLE_RATE" -ac 1 -c:a pcm_s16le "${f%.aiff}.wav"
  echo "file '${f%.aiff}.wav'" >> "$WORK/concat.txt"
  echo "file '$WORK/silence.wav'" >> "$WORK/concat.txt"
done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$WORK/concat.txt" \
  -c:a pcm_s16le "$WORK/block.wav"

BLOCK_SECONDS=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WORK/block.wav")
echo "    block duration: ${BLOCK_SECONDS}s"

for TARGET in 3600 7200; do
  LOOPS=$(python3 -c "import math,sys; print(math.ceil($TARGET/float('$BLOCK_SECONDS')))")
  LABEL="$((TARGET / 3600))h"
  echo "==> Building ${LABEL} M4A (loop x${LOOPS}, trimmed to ${TARGET}s)"
  ffmpeg -hide_banner -loglevel error -y \
    -stream_loop "$((LOOPS - 1))" -i "$WORK/block.wav" \
    -t "$TARGET" -ar "$SAMPLE_RATE" -ac 1 -c:a aac -b:a 64k \
    "$OUT_DIR/session-${LABEL}.m4a"
  ls -l "$OUT_DIR/session-${LABEL}.m4a" | awk '{print "    " $9 " " $5 " bytes"}'
done

echo "==> Done. Inputs in $OUT_DIR"

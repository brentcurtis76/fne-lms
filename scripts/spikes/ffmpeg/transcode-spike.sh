#!/usr/bin/env bash
#
# Z0B ffmpeg spike — step 2: measure the M4A → mono 16 kHz Ogg/Opus transcode.
#
# The question this answers: does a 2-hour session fit under the verified 25 MB
# cap that every OpenAI /v1/audio/transcriptions model enforces (plan §20), in
# a single request, and what does the transcode cost in wall time and CPU?
#
# Prints a markdown table on stdout and writes the same rows as TSV to
# $OUT_DIR/transcode-results.tsv.
#
# Usage: ./transcode-spike.sh [OUT_DIR]
set -euo pipefail

OUT_DIR="${1:-${TMPDIR:-/tmp}/zoom-ffmpeg-spike}"
RESULTS="$OUT_DIR/transcode-results.tsv"
WHISPER_CAP_BYTES=$((25 * 1000 * 1000)) # 25 MB, decimal — the documented cap

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }

FFMPEG_VERSION="$(ffmpeg -version | head -1)"
echo "ffmpeg: $FFMPEG_VERSION"
echo "host:   $(uname -srm)"
echo

printf 'source\tduration_s\tbitrate_kbps\tin_bytes\tout_bytes\treal_s\tuser_s\tsys_s\tcpu_pct\tunder_25mb\n' > "$RESULTS"

echo "| Source | Duration | Target bitrate | Input | Output | Wall time | CPU | Under 25 MB? |"
echo "|---|---|---|---|---|---|---|---|"

for LABEL in 1h 2h; do
  SRC="$OUT_DIR/session-${LABEL}.m4a"
  [ -f "$SRC" ] || { echo "missing $SRC — run generate-audio.sh first" >&2; exit 1; }

  DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
  IN_BYTES=$(stat -f%z "$SRC" 2>/dev/null || stat -c%s "$SRC")

  for KBPS in 12 16; do
    DEST="$OUT_DIR/session-${LABEL}-${KBPS}k.opus"
    TIMING="$OUT_DIR/.timing"

    # -ac 1 -ar 16000: mono 16 kHz is what a speech-to-text model consumes;
    # anything more is bytes the 25 MB cap has to carry for no accuracy gain.
    /usr/bin/time -p ffmpeg -hide_banner -loglevel error -y -i "$SRC" \
      -ac 1 -ar 16000 -c:a libopus -b:a "${KBPS}k" \
      -application voip -vbr on "$DEST" 2> "$TIMING"

    REAL=$(awk '/^real/{print $2}' "$TIMING")
    USER=$(awk '/^user/{print $2}' "$TIMING")
    SYS=$(awk '/^sys/{print $2}' "$TIMING")
    OUT_BYTES=$(stat -f%z "$DEST" 2>/dev/null || stat -c%s "$DEST")
    CPU_PCT=$(python3 -c "print(f'{(($USER+$SYS)/$REAL)*100:.0f}')")
    UNDER=$([ "$OUT_BYTES" -lt "$WHISPER_CAP_BYTES" ] && echo yes || echo no)

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "session-${LABEL}.m4a" "$DURATION" "$KBPS" "$IN_BYTES" "$OUT_BYTES" \
      "$REAL" "$USER" "$SYS" "$CPU_PCT" "$UNDER" >> "$RESULTS"

    python3 - "$LABEL" "$DURATION" "$KBPS" "$IN_BYTES" "$OUT_BYTES" "$REAL" "$CPU_PCT" "$UNDER" <<'PY'
import sys
label, dur, kbps, inb, outb, real, cpu, under = sys.argv[1:]
mb = lambda b: f"{int(b)/1_000_000:.1f} MB"
print(f"| session-{label}.m4a | {float(dur)/60:.0f} min | {kbps} kbps | {mb(inb)} | "
      f"{mb(outb)} | {float(real):.1f} s | {cpu}% | {'**yes**' if under=='yes' else '**NO**'} |")
PY
    rm -f "$TIMING"
  done
done

echo
echo "Whisper/gpt-4o-transcribe request cap: 25 MB (decimal) on every model — plan §20."
echo "TSV: $RESULTS"

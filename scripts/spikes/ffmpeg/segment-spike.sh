#!/usr/bin/env bash
#
# Z0B ffmpeg spike — step 3: multi-segment fallback.
#
# The single-request path (transcode-spike.sh) is the happy path. This measures
# the fallback the plan reserves for when a session does NOT fit in one request
# — chunking at silence boundaries only, never mid-word, so no sentence is cut
# across two transcription calls.
#
# Uses ffmpeg's silencedetect to find candidate split points in the 2h file,
# picks the boundary closest to each target chunk length, splits losslessly,
# and tabulates the resulting segments.
#
# Usage: ./segment-spike.sh [OUT_DIR] [TARGET_CHUNK_SECONDS]
set -euo pipefail

OUT_DIR="${1:-${TMPDIR:-/tmp}/zoom-ffmpeg-spike}"
TARGET_CHUNK="${2:-600}"   # 10 min — comfortably inside the gpt-4o output-token ceiling
SRC="$OUT_DIR/session-2h-16k.opus"
SEG_DIR="$OUT_DIR/segments"
NOISE_FLOOR="-30dB"
MIN_SILENCE="1.0"

[ -f "$SRC" ] || { echo "missing $SRC — run transcode-spike.sh first" >&2; exit 1; }
mkdir -p "$SEG_DIR"
rm -f "$SEG_DIR"/*.opus

echo "==> silencedetect on $(basename "$SRC") (noise=$NOISE_FLOOR, min duration=${MIN_SILENCE}s)"
SILENCE_LOG="$OUT_DIR/silencedetect.log"
/usr/bin/time -p ffmpeg -hide_banner -nostats -i "$SRC" \
  -af "silencedetect=noise=${NOISE_FLOOR}:d=${MIN_SILENCE}" -f null - \
  > /dev/null 2> "$SILENCE_LOG"

DETECT_REAL=$(awk '/^real/{print $2}' "$SILENCE_LOG")
SILENCE_COUNT=$(grep -c "silence_start" "$SILENCE_LOG" || true)
echo "    detected $SILENCE_COUNT silence windows in ${DETECT_REAL}s"

# Split point = the midpoint of a detected silence window: safest place to cut.
grep -E "silence_(start|end)" "$SILENCE_LOG" \
  | sed -E 's/.*silence_start: ([0-9.]+).*/S \1/; s/.*silence_end: ([0-9.]+).*/E \1/' \
  > "$OUT_DIR/silence-points.txt"

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")

python3 - "$OUT_DIR" "$TARGET_CHUNK" "$DURATION" <<'PY' > "$OUT_DIR/split-points.txt"
import sys
out_dir, target, duration = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])

# Rebuild (start, end) silence windows, tolerating a trailing unterminated one.
starts, ends = [], []
for line in open(f"{out_dir}/silence-points.txt"):
    kind, value = line.split()
    (starts if kind == "S" else ends).append(float(value))
midpoints = [(s + e) / 2 for s, e in zip(starts, ends)]

# Walk the file in target-length strides, snapping each cut to the nearest
# silence midpoint. A stride with no silence anywhere near it is reported
# rather than force-cut — a hard cut mid-sentence is the thing to avoid.
cuts, cursor = [], 0.0
while cursor + target < duration:
    ideal = cursor + target
    candidates = [m for m in midpoints if m > cursor + target * 0.5]
    if not candidates:
        break
    chosen = min(candidates, key=lambda m: abs(m - ideal))
    if chosen <= cursor:
        break
    cuts.append(chosen)
    cursor = chosen
for c in cuts:
    print(f"{c:.3f}")
PY

CUT_COUNT=$(wc -l < "$OUT_DIR/split-points.txt" | tr -d ' ')
echo "==> ${CUT_COUNT} split points chosen (target chunk ${TARGET_CHUNK}s, snapped to silence)"

# -c copy: container-level split, no re-encode, no quality loss, near-zero cost.
mapfile -t CUTS < "$OUT_DIR/split-points.txt" 2>/dev/null || \
  { CUTS=(); while IFS= read -r l; do CUTS+=("$l"); done < "$OUT_DIR/split-points.txt"; }

PREV=0
IDX=0
{
  for CUT in "${CUTS[@]}" "$DURATION"; do
    DEST="$SEG_DIR/segment-$(printf '%02d' "$IDX").opus"
    ffmpeg -hide_banner -loglevel error -y -i "$SRC" \
      -ss "$PREV" -to "$CUT" -c copy "$DEST"
    PREV="$CUT"
    IDX=$((IDX + 1))
  done
} 2>&1

echo
echo "| Segment | Start | End | Length | Size |"
echo "|---|---|---|---|---|"
PREV=0
IDX=0
for CUT in "${CUTS[@]}" "$DURATION"; do
  DEST="$SEG_DIR/segment-$(printf '%02d' "$IDX").opus"
  BYTES=$(stat -f%z "$DEST" 2>/dev/null || stat -c%s "$DEST")
  python3 -c "
start, end, b, i = $PREV, $CUT, $BYTES, $IDX
fmt = lambda s: f'{int(s)//60:02d}:{int(s)%60:02d}'
print(f'| segment-{i:02d} | {fmt(start)} | {fmt(end)} | {fmt(end-start)} | {b/1_000_000:.2f} MB |')
"
  PREV="$CUT"
  IDX=$((IDX + 1))
done

echo
echo "Segments: $IDX · dir: $SEG_DIR"
echo "silencedetect wall time on a 2h file: ${DETECT_REAL}s"

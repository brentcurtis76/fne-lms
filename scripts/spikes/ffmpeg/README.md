# ffmpeg / transcode spike — Z0B

Measures the audio half of the recording pipeline (plan §12 stages 6–7): can a
2-hour session be transcribed in **one** request, what does the transcode cost,
and what does shipping ffmpeg to Vercel actually weigh.

Results: `docs/planning/zoom-spike-results.md` §5.

## Hard rule

**Synthetic audio only.** Every sample is macOS `say` text-to-speech over
`corpus-es.txt`, a synthetic consulting-session script. No real session audio is
used, recorded, or referenced — the repo rule admits no exception, and a spike
is not a reason to make one.

`corpus-es.txt` is also the source of
`__tests__/lib/zoom/fixtures/precision.json`, so the sanitizer's false-positive
corpus and this spike's speech are the same synthetic transcript.

## Dependencies

**System `ffmpeg` only** — this phase adds nothing to `package.json`. Measured
with the version recorded in the results doc. Install with `brew install ffmpeg`.

## Scripts

Run in order; each writes into `OUT_DIR` (default: a temp directory).
Generated media is large and never committed.

```bash
OUT=/tmp/zoom-ffmpeg-spike
./scripts/spikes/ffmpeg/generate-audio.sh  "$OUT"   # synthetic 1h + 2h M4A
./scripts/spikes/ffmpeg/transcode-spike.sh "$OUT"   # → mono 16 kHz Ogg/Opus, 12 & 16 kbps
./scripts/spikes/ffmpeg/segment-spike.sh   "$OUT"   # silence-boundary split fallback
./scripts/spikes/ffmpeg/bundle-size.sh              # ffmpeg-static size, nothing installed
```

| Script | What it measures |
|---|---|
| `generate-audio.sh` | Builds the inputs. Rotating Spanish voices with 2 s silence spacers, looped to exactly 1 h and 2 h, encoded as mono 32 kHz AAC in M4A. |
| `transcode-spike.sh` | Wall time, CPU%, input/output sizes per bitrate, and the verdict against the 25 MB transcription cap. |
| `segment-spike.sh` | `silencedetect` split points, chosen cut positions, resulting segment count and sizes. Splits with `-c copy` — no re-encode. |
| `bundle-size.sh` | `ffmpeg-static` published binary sizes, read from release metadata. Installs nothing and does not touch `package.json`. |

## Notes on the measurements

**The silence spacers are deliberate.** `segment-spike.sh` needs real silence to
find cut points; audio with no gaps would make the multi-segment fallback
untestable.

**Looping does not flatter the output size.** Opus is frame-based and does not
exploit redundancy across a 4-minute loop, and the transcode targets a fixed
bitrate anyway, so output size is essentially bitrate × duration. What the loop
affects is wall time and CPU, which are measured directly.

**The input profile is an assumption.** Zoom's exact audio-only M4A profile is
confirmed in the credentialed spike (Z0B-2). This one only needs a
representative input to transcode, and mono 32 kHz AAC at 64 kbps is that.

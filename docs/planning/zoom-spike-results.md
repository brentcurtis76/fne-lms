# Zoom Z0B — Technical spike results

> Phase **Z0B** of `docs/planning/zoom-integration-plan.md` (§15). Branch
> `feat/zoom-spike`.
>
> **Chunk Z0B-1 (this document's current content): credential-free spikes.** No
> Zoom account, app, or secret existed when these were run, so nothing here
> touches the Zoom API. All content is synthetic.
>
> **Structure is append-only by design.** Chunk Z0B-2 adds the credentialed
> sections (§6–§9) and the field visits fill in §7. Do not renumber sections —
> the hardware protocol and the plan's §15 row reference them.

| Section | Spike | Chunk | Status |
|---|---|---|---|
| §1 | Permissions-Policy override for `/meet` | Z0B-1 | ✅ Verified |
| §2 | `/meet/diag` capability probe | Z0B-1 | ✅ Built |
| §3 | Sanitizer required Node layer | Z0B-1 | ✅ Measured |
| §4 | NER recall layer feasibility | Z0B-1 | ✅ Measured (cold start open) |
| §5 | ffmpeg transcode + segmentation | Z0B-1 | ✅ Measured |
| §6 | customerKey round trip | Z0B-2 | ⏳ Needs credentials |
| §7 | Hardware/network field results | Field visits | ⏳ Needs school visits |
| §8 | Recording round trip + start/stop control | Z0B-2 | ⏳ Needs credentials |
| §9 | Gate G2 — consent-report retrieval | Z0B-2 | ⏳ Needs credentials |

**Measurement host** for everything below: macOS (Darwin 24.3.0, arm64), Node
v22.22.0, Python 3.12.12, ffmpeg 8.1. Figures from a developer laptop are
directionally useful, not a production benchmark; where that matters it is said
so explicitly.

---

## 1. Permissions-Policy override for `/meet`

### Problem

`next.config.js` had a single header block matching `/:path*` whose
`Permissions-Policy` was `camera=(), microphone=(), geolocation=()`. That denies
camera and microphone on **every** route. A denying Permissions-Policy blocks
`getUserMedia` before the browser prompts, so the future Zoom embed could not
acquire devices at all — the page would fail silently with a permission error
the user cannot resolve.

### Change

A second entry, declared **after** the global block:

```js
{
  source: '/meet/:path*',
  headers: [{
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
  }],
}
```

`display-capture` is included for screen sharing. `geolocation` stays denied —
no meeting surface needs it.

### Evidence — `curl -I` against a dev server

Next.js applies every matching header group in order, and for a repeated key the
later value wins. That behaviour was verified rather than assumed:

```
### /meet/diag (meeting surface — expect permissive)
HTTP/1.1 307 Temporary Redirect
Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), geolocation=()

### /meet (bare prefix — expect permissive)
HTTP/1.1 307 Temporary Redirect
Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), geolocation=()

### /meet/session/abc (existing meet route — expect permissive)
HTTP/1.1 307 Temporary Redirect
Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), geolocation=()

### /login (non-meet — expect restrictive)
HTTP/1.1 200 OK
Permissions-Policy: camera=(), microphone=(), geolocation=()

### /dashboard (non-meet — expect restrictive)
HTTP/1.1 200 OK
Permissions-Policy: camera=(), microphone=(), geolocation=()

### /meetings (adjacent prefix — MUST stay restrictive)
HTTP/1.1 404 Not Found
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Three things this proves beyond "last wins":

- **Exactly one** `Permissions-Policy` header is emitted on `/meet/*`
  (`curl -I … | grep -ci '^permissions-policy'` → `1`). The entry overrides; it
  does not append a second, ambiguous header.
- The **other six** security headers from the global block still apply on
  `/meet` — full raw response:
  `X-DNS-Prefetch-Control`, `Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`,
  `Referrer-Policy`. The override is scoped to one key.
- `/meetings` does **not** inherit the permissive policy. `/meet/:path*` matches
  `/meet` and `/meet/<anything>`, not a longer word starting with `meet` — the
  same prefix trap the middleware matcher had to avoid in Z1a.

The 307s are the middleware bouncing an unauthenticated request to
`/login?next=%2Fmeet%2Fdiag`; headers are applied regardless of the response
being a redirect, which is itself worth knowing.

**No middleware or SSR fallback was needed.** The config-level override holds,
so the contingency in the chunk brief did not apply.

### Verdict

✅ Works as specified. The embed is not blocked by the platform's own headers.

**Not covered:** whether a *browser* honours the policy end-to-end on school
hardware. That is what the `getUserMedia` probe in `/meet/diag` measures during
the field visits (§7), and it is the only test that counts.

---

## 2. `/meet/diag` capability probe

`pages/meet/diag.tsx`. The instrument consultores open on a school machine
during a field visit. Gating is **session presence only**, mirroring
`pages/meet/session/[id].tsx` — there is no meeting here, so there is nothing to
authorize against, and a role check would lock out the consultores it exists
for.

### What it reports

| Group | Readings |
|---|---|
| Identity | browser + version, full user agent, platform |
| Capacity | CPU cores, `deviceMemory`, screen resolution + DPR |
| Network | `downlink`, `rtt`, `effectiveType`, save-data mode |
| Runtime | WebAssembly, WebGL renderer (flags software rasterizers), storage estimate |
| Isolation | `crossOriginIsolated`, `SharedArrayBuffer` — **measured only** |
| Locale | IANA timezone (graded against `America/Santiago`) |
| Devices | `getUserMedia` camera + microphone acquisition, behind a button |

Each row is graded **OK / Atención / Falla** against the §17 device classes
(P0 = Win10 4 GB dual-core or Win11 i5; P1 = Chromebook 4 GB or Android tablet)
with the threshold stated on the row. "Copiar resultados" copies one JSON blob;
a read-only textarea holds the same JSON as a fallback, because the clipboard
API needs a secure context and school machines are not reliable about that.

### Deliberate choices

- **`crossOriginIsolated` / `SharedArrayBuffer` are measured, never enabled.**
  No COOP/COEP headers are added anywhere in this change. Per the plan's
  verified vendor facts, their absence costs 720p send, noise suppression and
  tab audio — not the meeting — so they are reported as data rather than graded
  as failures.
- **CPU load is reported as "not measurable from the browser."** The §17
  threshold is CPU < 90% during a call; no browser API gives that. The row
  points at the on-device step of the protocol instead of inventing a proxy.
- **`getUserMedia` sits behind a button and releases devices immediately.** A
  camera light left on during a school visit is alarming. It doubles as the live
  proof of §1: it can only succeed because `/meet/*` grants camera and
  microphone.
- **No feature flag.** The page is session-gated and harmless.

A placeholder block reads *"Prueba de conexión: disponible próximamente"* where
Z0B-2 adds the test-join once a test meeting exists.

**Not covered:** the page has no automated test. It is a field instrument whose
entire output depends on the host machine, so a jsdom test would assert the mock
rather than the behaviour. The e2e coverage that would exercise it belongs to
Z1c, which owns `/meet` specs.

---

## 3. Sanitizer — required Node layer

`lib/zoom/sanitizer.ts`. Pure function, zero dependencies, no I/O. Not imported
by any production code path — Z5 wires it.

Fixtures: `__tests__/lib/zoom/fixtures/`, all names synthetic, es-CL classroom
register. The same JSON is scored by the Python NER spike (§4), so every recall
number in this document is comparable.

### 3.1 Must-catch suite — BLOCKING

22 cases, 26 mentions of explicit student references: role nouns
("la estudiante X"), honorifics (don/doña, Sra., profe, tía), course
designations ("de 5°B, Antonia"), bare capitalized names, compound names, and
repeat mentions.

**Result: 26/26 — 100%.**

Enforced as ordinary vitest assertions, so a miss is a failing test and a red
build. There is no threshold to tune: the repo's student-PII rule is absolute
and a sanitizer miss is a defect, not an accepted rate.

The suite also asserts what must **survive**: attendee full names, attendees
referred to by first name only, and institution names (`Colegio San Mateo`,
`Fundación Nueva Educación`).

### 3.2 Adversarial suite — MONITORING, no threshold asserted

30 cases, 33 mentions. Recall is computed and printed by the test; nothing is
gated on it.

**Node-only recall: 78.8% (26/33).**

| Category | Recall | Caught |
|---|---|---|
| compound-name | 100.0% | 6/6 |
| common-word-collision | 80.0% | 8/10 |
| nickname | 75.0% | 6/8 |
| whisper-misspelling | 66.7% | 6/9 |

Every miss, named:

| Case | Category | Mention | Why it escapes |
|---|---|---|---|
| adv-01 | whisper-misspelling | `martina` | Lowercase, no capitalized mention anywhere in the transcript |
| adv-29 | whisper-misspelling | `amanda` | Same, in unpunctuated run-on speech |
| adv-12 | nickname | `pancho` | Same |
| adv-05 | whisper-misspelling | `Ignacia` | Only mention is sentence-initial |
| adv-08 | nickname | `Cami` | Only mention is sentence-initial |
| adv-20 | common-word-collision | `Rosa` | Sentence-initial **and** an ordinary Spanish word |
| adv-27 | common-word-collision | `Paz` | Same |

The pattern is one gap, not seven: **capitalization is the only signal a
dependency-free layer has for a name with no trigger word, and it is unavailable
at a sentence start and destroyed by lowercasing.** That is precisely the gap
§4 exists to close.

This is **below the plan's ≥90% Node-only target** (§15 DoD, errata #38). Stated
plainly rather than tuned around. The target was set before anyone had measured
it; §4 shows what closing it actually costs.

### 3.3 Precision suite — BLOCKING

594 words / 16 paragraphs of realistic name-free consulting-session speech,
which must come through **byte-identical**.

**Result: 0 redactions, 0 persons, status `sanitized`.**

This suite exists because recall alone is a trap. The obvious fix for the
sentence-initial misses above — redact every unrecognized capitalized sentence
opener — was implemented and measured:

| Variant | Adversarial recall | Clean paragraphs damaged |
|---|---|---|
| Shipped (conservative) | 78.8% | 0 of 16 |
| Aggressive sentence-initial | 84.8% | **10 of 16** |

Six points of recall for wrecking two thirds of the transcript is not a trade
worth making, and the aggressive variant was reverted. Spanish has thousands of
words that can open a sentence; a hand-maintained list cannot cover them, which
is the honest reason this layer stops where it does.

### 3.4 Behaviour contracts

Beyond recall, 24 unit tests cover the properties the pipeline depends on:

- **Stable tokens.** The same person mentioned three times yields one
  `[persona N]`; two people yield two numbers; numbering starts at 1.
- **Attendee preservation**, including first-name-only reference. An empty
  attendee list redacts everyone — the fail-safe direction. A malformed
  attendee list is tolerated rather than trusted.
- **Purity.** Inputs are not mutated; repeated calls are byte-identical.
- **Uncertain never passes through.** A capitalized ordinary word mid-sentence
  ("Rosa") is recorded `confidence: 'uncertain'` and **redacted**. A test
  asserts no uncertain detection is ever left with `action !== 'redacted'`.
- **Flagged behaviour.** A transcript above the student-reference density
  threshold returns `status: 'flagged'` with a stated reason, which blocks
  minuta generation until a human reviews it (§6 state machine). Critically, a
  flagged transcript is **still fully redacted** — flagging is an extra gate,
  never a substitute for sanitization. Ordinary consulting speech does not
  flag; the threshold is caller-overridable.
- **Detection offsets** point at the original surface text, and each detection
  names the layer that fired.

**Not covered:** real transcription output. Every fixture is hand-written to
imitate Whisper artefacts; none came from an actual transcription run, because
that needs a recording, which needs credentials. Re-scoring these suites against
genuine Whisper output on synthetic audio is a Z0B-2 / Z5 item and could move
the adversarial number in either direction.

---

## 4. NER recall layer — feasibility

`scripts/spikes/ner/`. Deliberately **not** under `api/`, `pages/`, or `lib/`:
`main` auto-deploys, so a `.py` file on the deployable surface would go live the
moment this phase merged.

Measured with spaCy 3.8.14 + `es_core_news_md` 3.8.0 on Python 3.12.12.

### 4.1 Footprint

| Item | Size |
|---|---|
| site-packages, clean venv from `requirements.txt` | **186 MB** |
| ↳ `es_core_news_md` | 52 MB |
| ↳ `numpy` | 34 MB |
| ↳ `spacy` | 28 MB |
| ↳ `pip` + `setuptools` (not needed at runtime) | 21 MB |

**Vercel's Python function limit is 500 MB uncompressed** — verified against
official docs, not assumed (see 4.4). At ~165 MB of actual runtime dependencies
this is **~33% of budget**, with no need for the 5 GB large-functions path.

### 4.2 Load and latency

| Measurement | Value |
|---|---|
| Model load (cold-import proxy) | 0.37 – 0.54 s |
| Throughput | ~8,700 – 9,300 words/s |
| ~1 h transcript (8,910 words) | 0.95 – 1.03 s |
| ~2 h transcript (17,820 words) | 1.95 – 2.13 s |

A 2-hour transcript is a ~2 second call. Latency is not a constraint on this
design.

### 4.3 Recall — the finding that inverts the plan's assumption

Scored on the **same fixtures** as §3. `NER any` = entities of every label minus
the Node layer's non-person lexicon; `+shape` additionally drops spans longer
than 6 tokens or containing a verb.

| Slice | Mentions | Node-only | NER PER | NER any | NER any+shape | Node+PER | **Node+any+shape** |
|---|---|---|---|---|---|---|---|
| must-catch (blocking) | 26 | 100.0% | 80.8% | 100.0% | 100.0% | 100.0% | **100.0%** |
| adversarial (monitoring) | 33 | 78.8% | 57.6% | 93.9% | 93.9% | 81.8% | **93.9%** |
| ↳ common-word-collision | 10 | 80.0% | 50.0% | 100.0% | 100.0% | 90.0% | **100.0%** |
| ↳ compound-name | 6 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | **100.0%** |
| ↳ nickname | 8 | 75.0% | 62.5% | 87.5% | 87.5% | 75.0% | **87.5%** |
| ↳ whisper-misspelling | 9 | 66.7% | 33.3% | 88.9% | 88.9% | 66.7% | **88.9%** |

**The naive integration is worse than no integration.** Taking only `PER`
entities scores 57.6% on the adversarial suite — below the Node layer's 78.8% —
and even introduces a false redaction on the clean corpus. Combining it with
Node adds just 3 points (78.8% → 81.8%).

The reason is visible in the entity dump: **Spanish NER usually detects the
ambiguous name and then mislabels it.**

```
Florencia  → LOC        Rosa       → MISC
Emilia     → LOC        Sol        → MISC
Cami       → LOC        Milagros   → LOC
Balentina  → ORG        MATILDE    → ORG
```

Accepting every label and vetoing with the Node layer's own non-person lexicon
lifts adversarial recall to **93.9%**, with must-catch still at 100% and only
2 of 33 adversarial mentions missed by both layers.

Two constants are now exported from `lib/zoom/sanitizer.ts` so the veto lists
live in one place instead of being copied into a second service that would
drift: `NON_PERSON_TERMS` and `MAX_NAME_TOKENS`.

`MAX_NAME_TOKENS` is **6**, set by measurement: at 4, `María de los Ángeles
Tapia` is cut and compound-name recall drops to 66.7%.

### 4.4 The precision problem — why this is not yet a recommendation to ship

| Configuration | Adversarial recall | False redactions on 594 clean words |
|---|---|---|
| Node-only (shipped) | 78.8% | **0** |
| NER PER-only | 57.6% | 1 |
| NER any-label | 93.9% | **26** |
| NER any-label + shape filter | 93.9% | **14** |

The any-label variant reaches the plan's recall target and then falsely redacts
14–26 spans in 594 words of ordinary session speech. The false positives are not
names at all — they are sentence-initial verbs and clauses that spaCy emits as
`MISC`:

```
'Vamos'  'Quiero'  'Propongo'  'Sugiero'  'Estamos'  'La idea'
'Ese equilibrio'  'La asistencia a las instancias de trabajo colaborativo'
```

The shape filter (≤6 tokens, no verb) removes the clause-shaped ones and halves
the damage without costing any recall, but single-token verbs survive because
spaCy tags them as nouns inside the entity span.

**Confound, disclosed:** the precision corpus is written **without accents** (it
doubles as text-to-speech input for §5). Spanish NER is measurably sensitive to
diacritics, so this figure is a **lower bound on precision** — the real
false-positive rate on accented transcripts is likely better, possibly much
better. Re-measuring on accented text is the first thing Z5 should do.

### 4.5 Verdict

**Feasible, cheap, and not yet ready to switch on.**

- Fits comfortably (33% of the Python bundle budget), runs in ~2 s for a 2 h
  transcript, and the deploy-ready function + pinned `requirements.txt` are
  written and verified to install from a clean venv.
- Ship it **only** in the any-label + veto + shape-filter composition. PER-only
  is worse than not shipping.
- Before enabling it in Z5: re-measure precision on accented text; if the false
  positive rate stays material, use NER as a **flagging** signal (raise
  `sanitization_status` to `flagged` for human review) rather than as a
  redaction source. That converts recall into a review signal at zero cost to
  minuta quality, and matches the plan's fail-safe posture.

Fail-closed is already encoded in the function contract: any non-200, timeout,
or malformed response obliges the caller to set `sanitization_status='flagged'`,
and the error body carries `"sanitizationStatus": "flagged"` so the rule is
visible at the boundary. Recall never degrades silently.

**Packaging note:** spaCy 3.8.14 imports `click` at package-import time, but
typer 0.27 no longer pulls it in transitively. Without an explicit `click` pin,
`import spacy` fails with `ModuleNotFoundError`. `requirements.txt` pins it.

### 4.6 Vercel Python runtime — official docs, checked 2026-07-29

Source: [Python runtime](https://vercel.com/docs/functions/runtimes/python)
(page last updated 2026-07-06) and
[Functions limits](https://vercel.com/docs/functions/limitations)
(last updated 2026-07-01).

| Fact | Value |
|---|---|
| Python versions | **3.12 (default)**, 3.13, 3.14 |
| Bundle size, Python | **500 MB** uncompressed (250 MB for other runtimes) |
| Large functions | up to **5 GB**, needs fluid compute + Active CPU; opt in with `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` |
| Max duration | Pro: 300 s default, **800 s** max, 1800 s extended (beta) |
| Request/response body | **4.5 MB** |
| Entrypoint | `api/*.py` defining `handler` (`BaseHTTPRequestHandler`) or an ASGI/WSGI `app` |
| Bundling | no tree-shaking for Python; trim with `excludeFiles` |

Two notes for the plan:

- Plan §20 records "bundle 250MB". That is correct for the **Node** runtime and
  the ffmpeg-in-Next.js case it was written about; Python functions get 500 MB.
  Not a contradiction — an addition.
- The 4.5 MB body limit bounds the NER request. A 2 h transcript is ~110 KB of
  text, so there is no issue, but a caller must not batch many transcripts into
  one call.

### 4.7 Cold start — NOT MEASURED (item 4b skipped)

The optional preview-deployment probe was **not executed**. Reasons, so the PM
can overrule with full information:

1. The measurement requires a root `requirements.txt`. Per the official docs
   read above, *"Vercel detects your framework automatically when it finds a
   matching dependency in `requirements.txt`"* — in a project whose framework is
   Next.js, whether that changes framework detection is genuinely unclear, and
   the failure mode is a broken Preview build on the branch carrying this
   phase's PR.
2. The build would additionally need to fetch a 52 MB model wheel from a GitHub
   release during install — a second failure surface, on a path nobody has
   exercised in this project.
3. The chunk brief's own instruction is explicit: *"If any part of this sequence
   is unclear, skip 4b entirely and report cold start as unmeasured."* It is
   unclear, so it was skipped rather than risked.

**Lower bound from local data:** model load is 0.37–0.54 s on an M-series
laptop. A Vercel cold start adds runtime init plus reading ~165 MB of
dependencies from the bundle, so a low-single-digit-seconds cold start is the
expectation — but that is an estimate, not a measurement, and must not be
recorded as one.

**How to close it cheaply and safely:** deploy the function to a **separate
Vercel project** (its own repo or root directory), which is what the plan's
architecture describes anyway — the NER layer is "a separate Vercel Python
function" (§12), not a route inside the LMS. That removes the framework
detection question entirely and measures the real thing. Owner: Z5, or Z0B-2 if
deploy access is available sooner.

---

## 5. ffmpeg — transcode and segmentation

`scripts/spikes/ffmpeg/`. System ffmpeg **8.1**; no npm dependency added.

Inputs are synthetic: macOS `say` over a synthetic consulting-session script,
rotating Spanish voices with 2 s silence spacers, looped to exactly 1 h and 2 h,
encoded mono 32 kHz AAC in M4A. No real session audio was used or referenced.

### 5.1 Transcode — does 2 h fit in one request?

Target: mono 16 kHz Ogg/Opus, `-application voip -vbr on`.

| Source | Duration | Bitrate | Input | Output | Wall time | CPU | Under 25 MB? |
|---|---|---|---|---|---|---|---|
| session-1h.m4a | 60 min | 12 kbps | 26.1 MB | 5.0 MB | 22.0 s | 115% | **yes** |
| session-1h.m4a | 60 min | 16 kbps | 26.1 MB | 6.5 MB | 22.3 s | 114% | **yes** |
| session-2h.m4a | 120 min | 12 kbps | 52.3 MB | 10.1 MB | 44.2 s | 115% | **yes** |
| session-2h.m4a | 120 min | 16 kbps | 52.3 MB | **13.0 MB** | 44.4 s | 114% | **yes** |

**Verdict: yes, comfortably.** A 2-hour session at the higher quality setting is
13.0 MB against the verified 25 MB cap — roughly half the budget. Even a
3-hour overrun would fit at 16 kbps. **16 kbps is the recommended setting**; the
12 kbps option buys 2.9 MB of headroom nobody needs and costs audio quality on
exactly the low-fidelity school audio that most needs it.

Transcode cost is ~22 s per hour of audio at ~115% CPU (slightly over one core),
well inside a Pro function's 800 s ceiling with room for download and upload in
the same invocation.

### 5.2 Multi-segment fallback

Not the default path — measured so it exists when a session overruns badly or a
future model tightens the cap.

| Measurement | Value |
|---|---|
| `silencedetect` on the 2 h file (noise −30 dB, min 1.0 s) | 471 silence windows in **6.20 s** |
| Target chunk length | 600 s |
| Segments produced | **13** |
| Segment size | ~1.08 MB each |
| Split method | `-c copy` — container-level, no re-encode, no quality loss |

Cuts are snapped to the midpoint of a detected silence window, so no sentence is
split across two transcription calls. A stride with no nearby silence is
reported rather than force-cut.

**Known rough edge:** the last segment is a 7-second tail (0.01 MB) because the
final stride ends near the file end. Harmless but wasteful — merge a trailing
segment below ~30 s into its predecessor when this is productionized in Z5.

### 5.3 Bundle feasibility — measured without installing anything

`ffmpeg-static`'s npm tarball is only 0.05 MB because it downloads the binary in
a postinstall hook, so the tarball size is meaningless. The published release
assets are what would land in a bundle:

| Asset | Uncompressed | Gzipped |
|---|---|---|
| **ffmpeg-linux-x64** (the Vercel target) | **79.8 MB** | 29.4 MB |
| ffmpeg-linux-arm64 | 51.1 MB | 25.6 MB |
| ffmpeg-darwin-arm64 | 45.6 MB | 19.2 MB |

Release tag `b6.1.1`, resolved from release metadata; nothing was downloaded and
`package.json` was not modified.

**Against the limits:** 79.8 MB fits the 250 MB Node bundle limit with room for
the Next.js server, and is far inside the 500 MB Python limit if the transcode
ever moves next to the NER function.

**The `outputFileTracingIncludes` mechanism, documented only — nothing enabled.**
This repo is Next.js 14.2 (Pages Router). Next.js does not honour Vercel's
`includeFiles`; the equivalent is `outputFileTracingIncludes` in
`next.config.js`, keyed by route:

```js
// NOT enabled — this is the shape Z5 would add.
experimental: {
  outputFileTracingIncludes: {
    '/api/jobs/transcode': ['./node_modules/ffmpeg-static/ffmpeg'],
  },
},
```

In Next.js 14 this key lives under `experimental`; it graduated to top level in
Next 15, so a future Next upgrade moves it. Whoever enables it must verify the
binary's executable bit survives tracing — a known failure mode with static
binaries — and that the traced path matches the actual postinstall output
location.

### 5.4 Transcription cost

Arithmetic only, from the plan's verified per-minute prices (§20). **No external
API calls were made.**

| Session length | gpt-4o-mini-transcribe ($0.003/min) | whisper-1 / gpt-4o-transcribe ($0.006/min) |
|---|---|---|
| 1 hour (60 min) | $0.18 | $0.36 |
| 2 hours (120 min) | $0.36 | $0.72 |

At, say, 40 sessions a month averaging 90 minutes: **$10.80/month** on the mini
model, **$21.60/month** on the full ones. Transcription is not a cost driver for
this project; per §20 the cost dial is Supabase storage retention.

Note that only `whisper-1` provides vtt/srt/word timestamps, and the gpt-4o
models cap at ~2k output tokens (~10-minute chunks). If the minuta pipeline ever
needs timestamps or diarization-adjacent structure, that constrains the model
choice independently of price.

---

## 6–9. Reserved for Z0B-2 and the field visits

Not started. Every item below needs either Zoom credentials or a school visit,
and neither existed for chunk Z0B-1.

- **§6 customerKey round trip** — SDK join + external client + report API.
  Gates the Z7 attendance-matching design (plan §16).
- **§7 Hardware/network field results** — the device × browser × network matrix
  from §17, executed with `docs/planning/zoom-hw-protocol.md`. This is the
  embed go/no-go for Z3.
- **§8 Recording round trip and start/stop control** — record → webhook →
  download → S3 multipart → verify → trash → permanent delete, plus the
  enable-after-consent PATCH read-back and the stop-and-confirm mechanism that
  the §12 late-decline design depends on.
- **§9 Gate G2** — whether disclaimer consent events are retrievable via API or
  scheduled portal export. Blocks the link-out recording backstop.

---

## Open items handed forward

| # | Item | Owner |
|---|---|---|
| 1 | NER cold start on Vercel — unmeasured; measure via a separate Vercel project (§4.7) | Z5 / Z0B-2 |
| 2 | Re-measure NER precision on **accented** text before enabling the layer (§4.4) | Z5 |
| 3 | Node-only adversarial recall is 78.8%, below the plan's ≥90% target (§3.2). The target predates measurement; §4 shows the cost of closing it | PM decision |
| 4 | Re-score both suites against real Whisper output once a recording exists (§3.4) | Z0B-2 / Z5 |
| 5 | Merge trailing sub-30 s segment in the multi-segment fallback (§5.2) | Z5 |
| 6 | Verify the executable bit survives `outputFileTracingIncludes` tracing (§5.3) | Z5 |
| 7 | `/meet/diag` has no automated test; e2e for `/meet` belongs to Z1c (§2) | Z1c |

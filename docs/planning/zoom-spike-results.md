# Zoom Z0B — Technical spike results

> Phase **Z0B** of `docs/planning/zoom-integration-plan.md` (§15). Branch
> `feat/zoom-spike`.
>
> **Chunk Z0B-1 (this document's current content): credential-free spikes.** No
> Zoom account, app, or secret existed when these were run, so nothing here
> touches the Zoom API. All content is synthetic.
>
> **Chunk Z0B-1r** (remediation, 2026-07-29) amended §3 in place after PM
> review found an under-redaction vector in the attendee preservation rule: the
> revised rule, its fixtures and the re-measured numbers are in §3.5.
>
> **Chunk Z0B-1r2** (sealing round, 2026-07-29) amended §3 again: r1's rule
> judged a merged span as one person, which left a cross-entry leak open and
> undercounted connector-joined people. Spans are now classified as segments —
> final rule, closure evidence and residuals R1–R3 in §3.5.1.
>
> **Chunk Z0B-2** (2026-07-29) adds the credentialed sections **§6, §8 and §9**
> and unblocks Part B of the hardware protocol. It ran against FNE's real Zoom
> account with synthetic meeting content only; §6's preamble states the credential
> handling. Brent validated the webhook subscription and granted the remaining S2S
> scopes mid-run, so both initially-partial deliverables closed: real webhook events
> were captured (§6.1) and the **G2 verdict is definitive** (§9.3). **All 7 subscribed
> events are captured, the ≥500 retry schedule is measured, and the fixture library is
> complete** — nothing in §6, §8 or §9 is left waiting on an external step.
>
> **Structure is append-only by design.** Do not renumber sections — the hardware
> protocol and the plan's §15 row reference them. In particular **§7 stays the
> hardware/network field-results section** (`zoom-hw-protocol.md` points at it by
> number), so Z0B-2's recording measurements are in **§8**, the section reserved
> for them, and not in §7.

| Section | Spike | Chunk | Status |
|---|---|---|---|
| §1 | Permissions-Policy override for `/meet` | Z0B-1 | ✅ Verified |
| §2 | `/meet/diag` capability probe | Z0B-1 | ✅ Built |
| §3 | Sanitizer required Node layer | Z0B-1 (+Z0B-1r, Z0B-1r2) | ✅ Measured; preservation rule tightened §3.5, sealed by segment classification §3.5.1 |
| §4 | NER recall layer feasibility | Z0B-1 | ✅ Measured (cold start open) |
| §5 | ffmpeg transcode + segmentation | Z0B-1 | ✅ Measured |
| §6 | Webhook harness + customerKey round trip | Z0B-2 | ✅ customerKey **verdict delivered**; subscription validated mid-run, **all 7 events captured**, retry schedule measured, 7-fixture library committed |
| §7 | Hardware/network field results | Field visits | ⏳ Needs school visits — **Part B of the protocol is now unblocked** |
| §8 | Recording round trip + start/stop control | Z0B-2 | ✅ Round trip executed end to end; **stop verdict delivered and `recording.stopped` observed** |
| §9 | Gate G2 — consent-report retrieval | Z0B-2 | ✅ **FAIL (definitive)** — all 13 probed, 0 scope-blocked; plus §9.4, the Settings API misreports the disclaimer |

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

**Re-verified against a production build** (`npm run build && next start`), since
dev-server header behaviour is not by itself evidence about production:

```
/meet/diag             Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), geolocation=()
/meet                  Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), geolocation=()
/meet/session/abc      Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), geolocation=()
/login                 Permissions-Policy: camera=(), microphone=(), geolocation=()
/dashboard             Permissions-Policy: camera=(), microphone=(), geolocation=()
/meetings              Permissions-Policy: camera=(), microphone=(), geolocation=()

duplicate-header check on /meet/diag: 1
```

Identical to dev. The override is a build-time route-header rule, not a
dev-only convenience.

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

Current version **`node-1.6.0`**, after six remediation rounds recorded in
§3.5 → §3.5.5. r4 closed the *trigger-reach* class (where a trigger may mark);
r5 closed *lexicon candidacy* (may a trigger token itself be marked). Both hold
unchanged. **Z0B-1r6 closes the three questions that survived r5, and they are
three DIFFERENT classes rather than one** — the vocabulary the module does not
have (school-register titles, F12), a morphology filter switched off by a global
length floor (short accented preterites, F13), and a course-code recognizer that
could not fire on the spelling it was written for (numeric codes, F14). All
three were reproduced by the PM on `0011f8c` before they were ruled (§3.5.5).

**The module's known-defect list is now EMPTY.** What remains is argued
residuals: R1, R2, R4, R5, **R6** (open-world titles, new and by construction),
the accepted inverted-unknown overcount, and the 7 plan-sanctioned adversarial
misses (§3.2).

### 3.1 Must-catch suite — BLOCKING

63 cases, 61 mentions of explicit student references: role nouns
("la estudiante X"), honorifics (don/doña, Sra., profe, tía), course
designations ("de 5°B, Antonia"), bare capitalized names, compound names,
repeat mentions, the 11-case attendee-collision family built across Z0B-1r
(§3.5) and Z0B-1r2 (§3.5.1), the 3-case segment-split family plus the
lowercased role-noun name added in Z0B-1r3 (§3.5.2), the 3-case **guard-cost**
family added in Z0B-1r4 (§3.5.3) — the cases that prove the trigger-gap and
plausibility guards did not buy precision with recall — the 13-case
**trigger-token-candidacy** family added in Z0B-1r5 (§3.5.4), and the 10-case
**recognizer-completeness** family added in Z0B-1r6 (§3.5.5).

**Result: 61/61 — 100%** (26/26 shipped in Z0B-1; +5 cases / 5 mentions in
Z0B-1r; +7 cases / 9 mentions in Z0B-1r2; +3 cases / 6 mentions in Z0B-1r3;
+3 cases / 4 mentions in Z0B-1r4; +13 cases / 6 mentions in Z0B-1r5; +10 cases
/ 5 mentions in Z0B-1r6).

The r5 and r6 families are both deliberately **preserve-weighted** — 23 cases
between them carrying 11 new mentions but 22 new `mustPreserve` assertions.
That ratio is the shape of the defects they guard: these instances redacted the
right mention for the wrong reason, or invented a person out of a job title or a
course code, and a recall-only score saw nothing either time. Suite-wide there
are now **40 `mustPreserve` assertions against 61 mentions**; four rounds
running, the thing that hid the defect was an assertion the suite did not make,
not a case it did not contain. r6 makes the point at its sharpest: **all 61
mentions are caught on the old module too** (§3.5.5) — every single r6 failure
is an over-redaction, a destroyed attendee, a miscount or a spurious flag.

Enforced as ordinary vitest assertions, so a miss is a failing test and a red
build. There is no threshold to tune: the repo's student-PII rule is absolute
and a sanitizer miss is a defect, not an accepted rate.

The suite also asserts what must **survive**: attendee full names, attendees
referred to by first name only, roster names in inverted order, institution
names (`Colegio San Mateo`, `Fundación Nueva Educación`), the **title beside a
redacted name** added in r5 (`la Sra. [persona 1]`, `La Alumna [persona 1]`,
`El Dr. [persona 1]`), and — new in r6 — **school-register titles**
(`La Sra. Directora confirmó`, `La Directora Marcela`), **short preterites after
a title** (`la profesora dejó la pauta`) and **numeric course codes**
(`de 5°B, [persona 1] entre ellos`, `de 1ºA, [persona 1] entre ellos`).

### 3.2 Adversarial suite — MONITORING, no threshold asserted

30 cases, 33 mentions. Recall is computed and printed by the test; nothing is
gated on it.

**Node-only recall: 78.8% (26/33).** Re-measured unchanged after the Z0B-1r
preservation-rule change, after the Z0B-1r2 segment-classification change, after
the Z0B-1r3 role-pattern filter + punctuation split, after the Z0B-1r4 class
closure, after the Z0B-1r5 candidacy closure and after the Z0B-1r6 recognizer
closure (§3.5): identical 26/33 seven times over, same seven misses, same
per-category split, zero over-redactions. Expected for r1/r2 — every miss here
is a detection failure, and the rules those rounds changed decide what happens to
spans that *were* detected. r3 *does* touch detection, but only the role-pattern
layer's lowercase branch, and no fixture in this suite puts a lowercased name
next to a role noun (adv-13 and adv-30 capitalize theirs); the punctuation split
changes counts, not which mentions disappear. Every one of the five ending-set
variants measured in §3.5.2 scored 26/33 — the suite cannot discriminate between
them, which is why the choice was made on the blocking bars instead.

r4 removes two **wrong redactions** here without moving recall at all, which is
the delta worth naming rather than burying:

| Case | On `fce2476` | On `node-1.4.0` | Recall |
|---|---|---|---|
| adv-11 | `El profesor [persona 1] mencionó que [persona 2]…` — `jefe` redacted, **2 people** | `El profesor jefe mencionó que [persona 1]…` — **1 person** | 1/1 → 1/1 |
| adv-12 | `La asistente [persona 1] que pancho llegó…` — the VERB redacted, the NAME missed | `La asistente contó que pancho llegó…` | 0/1 → 0/1 |

Both were invisible to a recall-only score, so **both fixtures were amended** to
record the surviving text in `mustPreserve` (`El profesor jefe`, `La asistente
contó`). The `pancho` miss in adv-12 is untouched and stays a tracked
adversarial miss — §3.5.2 named this case as the one already exercising the
honorific defect silently, and the fix removes the wrong redaction without
buying the missing one. Nothing was re-scored to make a number move: overall
recall is 26/33 before and after, and over-redactions are 2 → 0.

**r5 changes nothing in this suite, and that is a checked claim rather than an
assumption.** No adversarial fixture's text was edited, none was added, and no
case's score moved: **26/33 before → 26/33 after**, same seven misses, same
per-category split, **0 over-redactions before → 0 after**. The case worth
naming is adv-11 (`El profesor jefe mencionó que Nachito…`), because r5 puts
`jefe` into `HONORIFICS` and therefore changes *how* that line is processed:
`jefe` now acts as a trigger and licenses the following token, which here is
`mencionó` — filtered by `NON_NAME_ENDINGS`. `El profesor jefe` survives via a
different mechanism than it did on r4 (a candidacy veto rather than the absence
of a rule), and the `mustPreserve` assertion r4 added is what proves the
substitution did not cost anything.

**r6 likewise changes nothing here, checked the same way.** No adversarial
fixture's text was edited, none was added, no score moved: **26/33 before →
26/33 after**, same seven misses, same per-category split, **0 over-redactions
before → 0 after**. This is the round where that claim needed checking hardest,
because r6 both widens a trigger set (F12) and loosens a filter floor (F13) —
either could plausibly have moved a mention. Neither did: no adversarial fixture
puts a school-register title beside a name, and the misses are all
capitalization-signal failures (§3.2's table), which no amount of new trigger
vocabulary reaches. The one case worth naming is **adv-12**
(`La asistente contó que pancho llegó…`), because F13 lowers the `ó` floor and
`contó` is 5 characters — already above the old floor, so the sentence is
processed identically and `La asistente contó` still survives via the same
`mustPreserve` assertion r4 added.

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

**1886 words / 37 paragraphs** of realistic name-free consulting-session speech,
which must come through **byte-identical**. Five blocks: the original 594 words
/ 16 paragraphs (also the ffmpeg spike's TTS corpus, written accent-free);
**631 words / 9 paragraphs added in Z0B-1r3, built around ROLE NOUNS** — the
construction the original block never contained, which is exactly why defect D3
(§3.5.2) survived four green suites for three rounds; **323 words / 6
paragraphs added in Z0B-1r4**, built around the three constructions r3's block
still had no coverage of: HONORIFIC-headed sentences, CROSS-SENTENCE
trigger/candidate pairs, and name-free SENTENCE-INITIAL VERBS — plus the
course + institution construction found during r4 implementation (§3.5.3); and
**183 words / 3 paragraphs added in Z0B-1r5**, built around TITLE-CASE lexicon
tokens: course designations (`En Quinto Básico`, `En Primero Medio`, `la
cobertura de Cuarto Básico`), the compound title `Profesor Jefe` together with
the `jefa técnica` construction that promoting `jefe`/`jefa` to `HONORIFICS`
would otherwise have over-redacted, and standalone title-case honorifics and
role words (`La Educadora de Kinder`, `el Asistente de la sala chica`); and
**155 words / 3 paragraphs added in Z0B-1r6**, one per fix — SCHOOL-REGISTER
titles in both their title-case (`La Directora del establecimiento`, `La
Coordinadora preparó`, `El Inspector avisó`) and compound es-CL forms (`la
coordinadora pedagógica`, `la secretaria administrativa`), which the F12
promotion would over-redact without its `COMMON_WORDS` containment; SHORT
ACCENTED PRETERITES immediately after a title (`la profesora dejó`, `el
coordinador pasó`, `la educadora sacó`); and NUMERIC COURSE CODES in all three
spellings (`de 5°B`, `En 1ºA`, `de 8°A`).

Honorific-*addressed* people are deliberately **not** here. "La Sra. Elena" is
name-bearing, so it belongs in a suite that asserts a redaction, not in a corpus
that asserts zero; the r5 attendee cases live in must-catch (mc-41…mc-44).

**Result: 0 redactions, 0 persons, status `sanitized`** (density 1.64 < 2.0) —
unchanged after the Z0B-1r rule change, the Z0B-1r2 segment-classification
change, the Z0B-1r3 role-pattern filter, the Z0B-1r4 class closure, the
Z0B-1r5 candidacy closure and the Z0B-1r6 recognizer closure (§3.5);
byte-identical output on every paragraph and on the joined corpus, seven
measurements running. (Density moves 1.62 → 1.64 purely because the corpus grew:
the numerator is still 0 redactions plus the same student-keyword count per
word.) The original block contains no name spans at all, so nothing in it
reaches the preservation decision; the r3, r4, r5 and r6 blocks reach the
*detection* decision on every sentence, which is the point of them.

Every one of the six r4 paragraphs was **reproduced as a redaction on
`fce2476` before the guards landed** — 5 of 6 damaged, 12 redactions, and the
joined corpus at density 2.52 → status **`flagged`**. All three r5 paragraphs
were likewise **reproduced as redactions on `a9f6f87`** — 3 of 3 damaged, 8
redactions read paragraph-by-paragraph, and the joined 34-paragraph corpus at
**20 redactions / 8 persons / density 2.77 → status `flagged`**. (The joined
figure exceeds the per-paragraph sum because cross-reference propagates a
marked `Profesora`/`Educadora`/`Básico` across the whole corpus once any single
paragraph marks it — which is itself a measure of how far one fused title
travels.) All three r6 paragraphs were **reproduced as redactions on `0011f8c`**
— 3 of 3 damaged, 8 redactions read paragraph-by-paragraph (4 + 2 + 2), and the
joined 37-paragraph corpus at **11 redactions / 7 persons / density 2.23 →
status `flagged`**. A blocking corpus that cannot reach a construction cannot
guard it, and this is now the **fifth round running** in which the gap in the
corpus, not the gap in the code, is what let a defect survive.

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

Beyond recall, 92 unit tests cover the properties the pipeline depends on:

- **Stable tokens.** The same person mentioned three times yields one
  `[persona N]`; two people yield two numbers; numbering starts at 1.
- **Attendee preservation**, including first-name-only reference, inverted
  roster order, a name carrying its own connectors, and a partial reference to
  one roster entry, under the coverage rule of §3.5. An empty attendee list
  redacts everyone — the fail-safe direction. A malformed attendee list is
  tolerated rather than trusted.
- **Segment independence** (§3.5.1). One bridged span holding an attendee and a
  student comes out `Camila Fuentes y [persona 1]`; two attendees bridged by
  `y` come out untouched with zero redactions; two students bridged by `y` get
  two numbers with the connector emitted verbatim between them; and a person
  assembled from two different attendees' tokens is redacted whole.
- **Segment splitting at gap punctuation** (§3.5.2). A comma-joined pair comes
  out `[persona 1], [persona 2]` with the comma intact; a span merged across a
  sentence boundary splits and keeps its period; `Sra. Elena` does **not**
  split; whole-span coverage runs first, so the inverted attendee
  `Fuentes, Camila` is preserved before any splitting can touch it.
- **Role-pattern name plausibility** (§3.5.2). Verbs, quantifiers, adjectives
  and gerunds after a role noun are left alone; a lowercased name next to one is
  still redacted, recorded `uncertain`; a capitalized candidate stays `high`
  even when it is an ordinary word (`la alumna Rosa`); and the measured `-ando`
  collision is asserted in all three of its states.
- **Trigger gap discipline — G1** (§3.5.3). A role noun, a course word and an
  honorific are each asserted not to reach across a sentence terminator; the
  abbreviation exception (`Sra. Elena`) and the constructions that legitimately
  carry a comma (`de quinto básico, Emilia`, `la estudiante, Martina`) are
  asserted to keep firing.
- **Uniform name plausibility — G2** (§3.5.3). The five honorific-headed verb
  sentences are left alone; `don ignacio` is still redacted and recorded
  `honorific`/`uncertain`; `tía Rosa` still lands `high`; a pattern layer can
  never mark a sentence-initial ordinary word; an institution head after a
  course word survives (`del Colegio San Mateo`); and course-pattern is asserted
  to still require capitalization.
- **Left-extension veto — G3** (§3.5.3). A sentence-opening verb stays outside
  the persona span (`Quedaron [persona 1] y [persona 2]`), genuine compound
  names still extend (`Juan Pablo`, `María José Aravena`, `Ana María Tapia`),
  and name-free sentence-initial verbs are untouched.
- **Trigger-token candidacy — G4/G4′** (§3.5.4). One assertion per path: the
  capitalization layer cannot self-mark a lexicon token (V1); left extension
  breaks at each of the four lexicons, one case per lexicon (V2); a title
  following a title is vetoed (V3); the course-vs-role asymmetry on
  `NON_PERSON_PROPER` is asserted from **both** sides — `el alumno Julio` and
  `don Santiago` are caught, `en quinto básico Lenguaje` is untouched — and the
  narrow miss it buys (`de quinto básico, Julio`) is asserted as a residual
  together with its cross-reference redemption; `jefe`/`jefa` are asserted
  vetoed as candidates **and** active as triggers (V4), with the `jefa técnica`
  over-redaction that promotion would otherwise cause asserted absent; and the
  `nina`/`niña` carve-out is asserted in both directions, including the
  cross-reference leak it would otherwise open.
- **Titles survive redaction** (§3.5.4). `La Sra. [persona 1] reclamó…` and
  `La Alumna [persona 1] no llegó…` are asserted as exact output strings.
- **Bare-attendee interplay** (§3.5.4). Once the title leaves the span,
  `Sra. Elena` reduces to a one-token span and the attendee is preserved
  through the bare-roster-token path rather than whole-span coverage. All three
  states are asserted: preserved when clean, redacted when another person in the
  transcript contaminates the token (the caveat is unchanged by r5), and routed
  back through whole-span coverage when the attendee is named in full behind the
  title (`La Sra. Elena Vidal`).
- **School register — F12** (§3.5.5). Five title-case register titles are
  asserted never marked; the trigger half is asserted on **two** members
  (`directora`, `docente`) in their LOWERCASE form, where the new trigger is the
  only path that can reach them; the title survives beside a redacted name
  (`la directora [persona 1]`); an attendee addressed by a register title is
  preserved whole (`La Directora Marcela`); the five compound es-CL role titles
  the promotion reaches into are asserted NOT over-redacted; and **R6 is
  asserted from both sides in one test** — `La Sra. Bibliotecaria` over-redacts
  and `La Sra. Solange` redacts, which is what makes the trade explicit rather
  than implied.
- **Per-ending floor — F13** (§3.5.5). Four 4-character preterites after a title
  are asserted clean (`dejó`, `sacó`, `pasó`, `tocó`); the 3-character boundary
  itself is asserted (`dió`); and both directions of "no other floor moved" are
  locked — `juan`/`ivan` are still caught next to a role noun (the `an` floor is
  where it was) and `josé` is still caught (the un-audited `é` floor did not
  move with it).
- **Numeric course codes — F14** (§3.5.5). The code letter is asserted never
  name material, with and without a name beside it; the course pattern is
  asserted to genuinely **fire** from a numeric code (the assertion is the
  `layer: 'course-pattern'` label, not just the redaction); the spaced and
  ordinal-indicator spellings are asserted (`5 ° B`, `1ºA`); a sentence-initial
  lone `B` with nothing numeric behind it is untouched; the ordinal indicators
  are asserted excluded from words (`1ºA`, `3ª`); and G4′ is asserted still to
  hold at the new trigger site (`En 5°B Lenguaje`).
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

### 3.5 Preservation rule — tightened in Z0B-1r (`SANITIZER_VERSION node-1.1.0`)

> **Superseded in part by §3.5.1** (`node-1.2.0`, Z0B-1r2). The two-pass order,
> the bare-name heuristic and the accepted over-redaction below all still hold;
> the span-level table was replaced by segment classification, which closed the
> cross-entry residual this section flagged. Kept in place as the record of what
> r1 changed and why.

**The defect.** The shipped v1.0.0 rule preserved a span that shared **one**
significant token with any attendee. With `Camila Fuentes` on the roster, the
transcript sentence "la estudiante **Camila Pérez** se conversó con la dupla"
came through the sanitizer **completely intact** — surname included — because
the span shared the token `camila`. Detection was never the problem: the span
was found, classified as a person, and then handed back whole. No fixture in any
of the three suites covered the case, so all four suites stayed green over it.
Found by PM review 2026-07-29, before Z5 wires the module into any path.

**The rule after r1** (span-level; superseded by §3.5.1). A span is preserved
only where the roster accounts for *all* of it. Writing `S` for the span's
significant tokens (connectors dropped), `A.tokens` for the union of all roster
tokens (≥3 chars, connectors dropped) and `A.keys` for each roster name's tokens
sorted:

| Span shape | Preserved iff |
|---|---|
| `\|S\| ≥ 2` | `join(S) ∈ A.fullNames` **or** `sorted(S) ∈ A.keys` **or** `∀t ∈ S: t ∈ A.tokens` |
| `\|S\| = 1` | `S₀ ∈ A.tokens` **and** `S₀ ∉ contaminated` |
| `\|S\| = 0` | never (an all-connector span has the least evidence, not the most) |

`contaminated` = every significant token of every span this transcript redacted.
A multi-token span carrying any token the roster cannot explain is redacted
**whole** — there is no partial preservation, because a half-redacted name still
names.

The single-token branch is the plan's "a bare *Camila* means the attendee"
heuristic, and it is kept — with the §12 asymmetry applied to it. Once this
transcript has redacted a `Camila Pérez`, a later bare `Camila` is genuinely
ambiguous between the attendee and the redacted student, and uncertain resolves
to redaction. The redacted bare mention reuses the student's `[persona N]`,
since the person-number map is keyed by token.

**Two passes, not one sweep.** The contaminated set must be complete before any
bare name is judged, and the contaminating mention can appear *after* the bare
one ("Camila dijo… la estudiante Camila Pérez faltó"). So multi-token spans and
roster-less bare names are settled first, then the deferred bare names.
Emission stays in document order, so person numbering still follows reading
order.

**Accepted cost — over-redaction of an attendee's extended name.** With a roster
entry of `Camila Fuentes`, the surface `Camila Fuentes Soto` now redacts: `soto`
is a token the roster cannot explain. The direction is safe (a `[persona N]`
where a facilitator's name would read better) and the fix is roster hygiene —
store the name the transcript will actually contain. Asserted as a contract test
so the behaviour is deliberate rather than discovered.

**Known residual — cross-entry token coverage. → CLOSED in Z0B-1r2, §3.5.1.**
Rule `∀t ∈ S: t ∈ A.tokens` draws on the union of all roster tokens, so a span
whose tokens each belong to a *different* attendee was still preserved: roster
`{Camila Fuentes, Rodrigo Pérez}` + student `Camila Pérez` → preserved, because
`camila` and `perez` are both roster tokens. r1 left it open deliberately: the
obvious tightening (require all tokens from one roster entry) redacts `Camila
Fuentes` when the roster says `Camila Andrea Fuentes` — a common Zoom
display-name/profile mismatch — and it breaks the legitimate merged span `Camila
Fuentes y Rodrigo Pérez`, which `buildSpans` bridges into a single span across
the connector. Both objections are answered by classifying at segment level
instead of span level; the PM ruled that design and §3.5.1 implements it.

**Test coverage added** (must-catch, blocking): `mc-23` distinct student sharing
a given name → whole span redacted; `mc-24` bare colliding given name after the
student appears → redacted, one person number for both; `mc-25` bare given name
with no collision → preserved (the heuristic survives); `mc-26` `Fuentes,
Camila` inverted order → preserved; `mc-27` attendee full name after a redacted
collision → preserved (coverage beats contamination). Plus six contract
assertions in `sanitizer.test.ts`. Verified against the pre-fix module: mc-23,
mc-24 and mc-27 leak 5 mentions, and the blocking suite goes red.

### 3.5.1 Segment classification — sealing round Z0B-1r2 (`SANITIZER_VERSION node-1.2.0`)

**The two defects.** Both PM-reproduced on `6340838`, both rooted in the same
mistake: r1 judged a *span* as if it were a *person*. `buildSpans` merges name
tokens across connectors, so one span can hold two people.

- **D1 — cross-entry union leak** (the residual above, now closed). Roster
  `{Camila Fuentes, Rodrigo Pérez}`, transcript "la alumna **Camila Pérez**
  llegó" → **preserved intact, 0 persons**. The span was stitched from two
  different attendees' tokens, and the union rule could not tell. It overrode a
  high-confidence `role-pattern` detection to do it.
- **D2 — connector-merged people share one token.** "el alumno **Matías y
  Tomás**" → **one `[persona 1]` for two students**. Nothing leaked, but
  `personCount`, `redactionCount` and therefore the §6 flag-density metric all
  undercounted the students present — a privacy-relevant miscount, since density
  is what decides whether a transcript is `flagged` for human review.

**The rule now.** A span is classified as a sequence of **segments** — the runs
of significant tokens between the span's internal **connector** positions (the
bridges `buildSpans` crossed). A segment is one person-reference; a span may
hold several. Writing `S` for the span's significant tokens and `E_i` for the
roster entries, each with its own token set `T_i`:

| Step | Test | Outcome |
|---|---|---|
| 1 | `\|S\| ≥ 2` **and** (`join(S) ∈ fullNames` **or** `sorted(S) ∈ keys` **or** `S ⊆ T_i` for a **single** `i`) | preserve the WHOLE span |
| 2 | otherwise, per segment: `\|seg\| ≥ 2` → `join(seg) ∈ fullNames` **or** `sorted(seg) ∈ keys` **or** `seg ⊆ T_i` for a **single** `i` | that segment preserved, else redacted |
| 2 | otherwise, per segment: `\|seg\| = 1` → token `∈ A.tokens` **and** `∉ contaminated` | that segment preserved, else redacted |
| — | `\|S\| = 0` (a span of nothing but connectors) | nothing emitted at all |

Coverage is per **entry**, never the union — that single change is what kills
D1: `Camila Pérez` has no internal connector, so it is one segment; step 1 fails
because no single entry spans it, step 2's `|seg| ≥ 2` branch fails for the same
reason, and it is redacted whole even though both tokens exist somewhere on the
roster.

Step 1 is restricted to `|S| ≥ 2` on purpose: a lone roster token is the
bare-name heuristic (with contamination), not whole-span coverage. Without that
restriction a bare `Camila` after a redacted `Camila Pérez` would be preserved
by step 1 and mc-24 would break.

**Segments act independently.** Passing segments are preserved, failing segments
are redacted, and the connector text between them is emitted verbatim, so a
**mixed span is now a legal output**: roster `{Camila Fuentes}` + "con Camila
Fuentes y Martina" → `con Camila Fuentes y [persona 1]`. r1's "no partial
preservation" invariant moves DOWN one level and is absolute there: inside a
segment, never a partial action. In r1 that same sentence destroyed the
attendee's name along with the student's.

**One number per segment.** Every redacted segment draws its own `[persona N]`
from the existing token-keyed map, so `el alumno Matías y Tomás` →
`el alumno [persona 1] y [persona 2]` (D2 closed), while repeat mentions still
reuse their number and a contaminated bare name still lands on the number of the
person that contaminated it. `personCount` / `redactionCount` / density now count
per segment. Contamination bookkeeping collects the tokens of redacted
**segments**, and r1's two-pass order extends unchanged: pass 1 settles
`|seg| ≥ 2` and non-roster singletons everywhere, then roster-token singletons
resolve against the completed contaminated set — a bare roster token can precede
the span that contaminates it.

**Accepted over-redaction, re-derived.** Does `Camila Fuentes Soto` against a
roster `Camila Fuentes` behave differently now? No. Step 1 fails (`soto` is in no
entry); the surface carries no internal connector, so segmentation yields one
three-token segment, which fails the same test and is redacted whole. Identical
to r1 — the note stands as written, safe direction, roster hygiene is the fix.

**Documented residuals** — roster-identity limits, not detection gaps:

| # | Residual | Behaviour | Why it stands |
|---|---|---|---|
| R1 | exact-name collision | a student truly named `Camila Fuentes` while attendee `Camila Fuentes` exists is **preserved** | textually indistinguishable; irreducible without discourse identity |
| R2 | entry-subset reference | `Andrea Fuentes` against roster `Camila Andrea Fuentes` is **preserved** | deliberate — partial references to attendees are routine, and tightening breaks display-name variance for marginal gain |
| R3 | punctuation-joined people share a segment → **CLOSED in Z0B-1r3, §3.5.2** | `Martina Rojas, Benjamín Soto` → both redacted, but as **one** `[persona N]` | segments split at connector TOKENS; a comma is not one, and `buildSpans` merges adjacent name tokens whatever punctuation sits between them. Undercount, never under-redaction |

R3 is **measured, not assumed**. The PM's pre-implementation estimate was that a
comma would split such a span into singleton segments, giving ≥2 personas —
overcounting, the safe direction for the density metric. It does not: the
implemented behaviour is one segment and **one** persona for the pair (fixture
`mc-34` asserts the true count). The inverted single person `Rojas, Benjamín`
gets the *right* count for the same reason. Splitting on punctuation instead was
considered and rejected here: `la Sra. Elena` merges across the abbreviation
period, so punctuation-splitting would read one person as two, and `Fuentes,
Camila` only survives because step 1 fires before segmentation. The trade is not
obviously positive, so the measured behaviour stands and is documented rather
than tuned.

> **Overruled in Z0B-1r3.** Both objections turned out to be answerable in the
> rule itself — the abbreviation set `tokenize` already uses exempts `Sra.`, and
> step 1 genuinely does run before segmentation — so the split ships, R3 closes,
> and what remains is an overcount rather than an undercount. §3.5.2.

**Also fixed, same layer.** `role-pattern` marks whatever follows a role noun,
including a connector: "la alumna **de** séptimo" produced a span whose only
token was `de`, which r1 redacted — `la alumna [persona 1] séptimo`, one more
person in the density metric and an unreadable sentence. A span with no
significant tokens now emits nothing: there is no identity in it to redact.

**Fail-on-old proof.** The new fixtures and contract assertions were run against
the `6340838` module (`git stash` on `lib/zoom/sanitizer.ts` only, restored
after): **14 failing tests, 139/153 passing**, split as

- **4 leaked mentions** — `mc-28: Camila Pérez`, `mc-28: Camila`,
  `mc-29: Camila Pérez`, `mc-29: Camila` (D1);
- **1 over-redacted attendee** — `mc-31: Camila Fuentes`, destroyed by the
  all-or-nothing span rule;
- **3 `personCount` mismatches** — `mc-12` 1≠2, `mc-29` 0≠1, `mc-32` 1≠2 (D2);
- the blocking must-catch suite goes red (9 failures), the contract suite goes
  red (5 failures), and **precision and adversarial stay green** — the new
  fixtures isolate exactly the two defects and touch nothing else.

**Test coverage added** (must-catch, blocking): `mc-28` D1 exactly → whole span
redacted; `mc-29` D1 plus a later bare `Camila` → redacted, one number for both;
`mc-30` two attendees bridged by `y` → both preserved, zero redactions;
`mc-31` mixed span → attendee preserved, student redacted; `mc-32` D2 → two
distinct numbers; `mc-33` roster `María de los Ángeles Rojas` + surface `María de
los Ángeles` → preserved intact; `mc-34` comma-joined students → both redacted,
count documented (R3). **`mc-12` amended**: `expectedPersonCount` added and set
to 2 — before this change the case passed on recall while its count was wrong,
which is exactly how D2 stayed invisible. Plus nine contract assertions in
`sanitizer.test.ts` covering segment independence, per-segment numbering,
verbatim connector survival, the D1 role-pattern detection now ending
`redacted`, and R2.

**Numbers after the round**: must-catch **40/40 (100%)** across 34 cases;
adversarial **78.8% (26/33)**, unchanged, zero over-redactions; precision **0
redactions / 0 persons, byte-identical** on 594 words; 153 sanitizer tests
green in 4 files (was 120).

### 3.5.2 Role-pattern filter + punctuation-aware segments — sealing round Z0B-1r3 (`SANITIZER_VERSION node-1.3.0`)

**The two defects.** Both PM-reproduced on `82afe79`, both counting/precision
defects rather than leaks — which is precisely why four green suites carried them
for three rounds.

- **D3 — role-pattern marked ANY token after a role noun.** Present since
  `node-1.0.0`. `Los alumnos trabajaron bien y las estudiantes avanzaron rápido.`
  → `Los alumnos [persona 1] bien y las estudiantes [persona 2] rápido.` Two
  verbs, two people. `Hay dos estudiantes más que…` → the quantifier became a
  person. This fires on close to every plural-role-noun sentence in real speech:
  it corrupts the text the minuta is built from *and* inflates `personCount` →
  density → spurious `flagged` states (§6), which defeats the automation goal.
  It survived because the precision corpus — the suite whose entire job is
  false positives — contained **no role nouns at all**.
- **D4 — punctuation-joined people shared a segment** (v1.2's residual R3, now
  overruled). `Asistieron la alumna Martina Rojas, Benjamín Soto y la niña
  Florencia.` → `Asistieron la alumna [persona 1] y la niña [persona 2].` Three
  students, two personas, and the comma swallowed by the replacement. Same
  undercount class as D2, on the same §6 metric. The sentence-boundary variant
  is the same defect: `…la estudiante Martina Rojas. Benjamín Soto llegó…` →
  `…la estudiante [persona 1] llegó…`, two students as one person with the
  period eaten.

**D3 — the rule now.** A role noun licenses evidence only for a candidate that
could be a name:

| Candidate | Evidence | Why |
|---|---|---|
| CAPITALIZED | `role-pattern` / `high`, exactly as before | role context is legitimate disambiguation — `la alumna Rosa` must stay high |
| lowercase, and ∉ `COMMON_WORDS` ∪ `NON_PERSON_PROPER` ∪ `ORG_HEADS` ∪ `COURSE_WORDS`, and carrying no `NON_NAME_ENDINGS` ending | `role-pattern` / `uncertain` → redacted | the Whisper-lowercasing case the branch exists for (`el alumno benjamín`) |
| lowercase, anything else | nothing | `trabajaron`, `más`, `nueva`, `estudiando`, `de séptimo` |

The one-connector variants (`la estudiante, martina`, `el alumno llamado diego`)
follow the same rule; they previously required capitalization outright, so the
lowercase half of that construction is new coverage.

`NON_NAME_ENDINGS` is matched against the **accent-preserving** lowercase
surface, and that is what makes an ending set viable at all: Spanish spells the
name/verb minimal pairs apart on the accent. `necesitan` vs `Sebastián`,
`hablaban` vs `Esteban`, `tenían` vs `Antonia` — filter the unaccented ending and
the accented names walk through untouched. Where the transcription has already
dropped the accent the name falls into the filter and is missed, which is the
same accent-loss gap §3.2 already tracks, not a new one.

**The ending-set measurement.** Five variants, scored on the two blocking bars
and the monitoring metric. The lowercase-name probes are `el alumno <name>` with
the name lowercased throughout the transcript — the only situation any of these
endings can cost a redaction.

| Variant | must-catch | precision (new role-noun block) | adversarial | lowercase-name probes |
|---|---|---|---|---|
| **A — shipped** | **46/46** | **0 redactions / 9 clean** | **26/33 (78.8%)** | catches `benjamín`, `maría`; misses `fernando`, `esteban` |
| B — minus `ando` | 46/46 | ✗ **2 redactions / 1 paragraph damaged** | 26/33 (78.8%) | also catches `fernando` |
| C — minus `an`/`en` | 46/46 | ✗ **4 redactions / 2 paragraphs damaged** | 26/33 (78.8%) | also catches `esteban` |
| D — plus the `ía` imperfect family | 46/46 | 0 redactions / 9 clean | 26/33 (78.8%) | ✗ **misses `maría`** |
| E — plus singular participles `ado`/`ada`/`ido`/`ida` | 46/46 | 0 redactions / 9 clean | 26/33 (78.8%) | same as A here, but would miss `amado`, `frida`, `cándida` |

Read straight off the table: **B and C fail the blocking precision bar**, so
`ando` and `an`/`en` are forced in — not chosen on a recall tiebreak. `ando`
collides with `fernando`/`rolando`/`armando`/`orlando` and `an`/`en` with
`esteban`/`carmen`; both collisions are accepted and asserted. **D and E hold
both bars and tie A on adversarial recall** — the monitoring suite has no fixture
that can separate them — so the tie broke on the probes, where D provably loses
`maría`/`lucía`/`sofía` and E gratuitously widens the filter for constructions
the corpus never needs. The shipped set is therefore the *smallest* set that
keeps the precision corpus clean: every ending beyond that is name recall given
away for nothing, and §12's asymmetry says an ambiguous surface should redact
rather than walk through.

What that leaves redacting, deliberately: an open-class word after a role noun
whose shape is a name's shape. `la alumna tranquila`, `los alumnos nuevos`, `el
alumno seleccionado`, and the singular imperfect `la alumna tenía dudas` (the
plural `los alumnos tenían` is covered by `an`). Over-redaction, safe direction,
costs minuta wording only — the same trade as the accepted `Camila Fuentes Soto`
over-redaction of §3.5.

**D4 — the rule now.** A segment ends at a connector token (unchanged) **and** at
an inter-token gap containing `,` `;` or `.`, unless the token before the period
is in `ABBREVIATIONS` — the set `tokenize` already consults for sentence starts,
so `Sra. Elena` stays one person. Whole-span coverage (step 1) is untouched and
still runs **first**, which is what keeps the inverted attendee `Fuentes, Camila`
whole: it matches the roster on sorted keys before any splitting can carve it in
two. Measured results:

| Input (roster `Camila Fuentes`) | v1.2 | v1.3 |
|---|---|---|
| `…la alumna Martina Rojas, Benjamín Soto y la niña Florencia.` | 2 personas, comma swallowed | **3 personas**, `[persona 1], [persona 2] y la niña [persona 3]` |
| `…la estudiante Martina Rojas. Benjamín Soto llegó…` | 1 persona, period swallowed | **2 personas**, period intact |
| `…quedaron Martina Rojas, Benjamín Soto y otro más.` (`mc-34`) | 1 persona | **2 personas** |
| `…aparece Rojas, Benjamín…` (inverted unknown) | 1 persona | **2 personas** — accepted overcount |
| `…con la Sra. Elena…` | 1 persona | 1 persona, unchanged |
| `…aparece Fuentes, Camila…` (inverted attendee) | preserved whole | preserved whole, unchanged |

**Residuals after this round.** R1 and R2 are the only ones, both roster-identity
limits, neither a detection gap; R3 is closed and what replaces it is an accepted
counting artifact in the *safe* direction.

| # | Residual | Behaviour | Why it stands |
|---|---|---|---|
| R1 | exact-name collision | a student truly named `Camila Fuentes` while attendee `Camila Fuentes` exists is **preserved** | textually indistinguishable; irreducible without discourse identity |
| R2 | entry-subset reference | `Andrea Fuentes` against roster `Camila Andrea Fuentes` is **preserved** | deliberate — partial references to attendees are routine, and tightening breaks display-name variance for marginal gain |
| — | *(accepted artifact, replaces R3)* inverted-unknown overcount | `Rojas, Benjamín` → both redacted, counted as **two** people | nothing leaks; one extra person in the §6 density metric is the safe direction for a metric that decides whether a human looks. The undercount it replaces — three comma-joined students reported as one — was the unsafe direction on that same metric |

R1 has one new surface worth naming: `Rojas, Camila` (unknown surname, given name
on the roster) now splits into a redacted `Rojas` and a bare `Camila`, and the
bare roster token resolves to the attendee under the plan's own "a lone Camila
means the attendee" heuristic unless something else in the transcript
contaminates it. Under v1.2 the pair was redacted whole. It is the identical
trade the connector case has always made (`Camila Fuentes y Martina` → the
attendee survives), moved onto punctuation, and it is R1's family: an inverted
surface whose given name is a roster token is not distinguishable from the
attendee without discourse identity.

**Fail-on-old proof.** The new and amended fixtures plus the new contract
assertions were run against the `82afe79` module (`git stash` on
`lib/zoom/sanitizer.ts` only, restored after): **22 failing tests, 160/182
passing**, split cleanly by defect —

- **D3 — 16 failures.** 9 precision paragraphs damaged (25 redactions across the
  corpus, joined status `flagged` instead of `sanitized` — the spurious-flag harm
  reproduced end to end) + 5 contract assertions (verb/quantifier/gerund
  survival, `uncertain` confidence on a lowercased name, the connector variant,
  the `-ando` states).
- **D4 — 6 failures.** 3 `personCount` mismatches (`mc-34` 1≠2, `mc-35` 2≠3,
  `mc-36` 1≠2) + 3 contract assertions (comma pair, sentence-boundary split,
  inverted-unknown overcount).
- **0 leaked mentions.** Neither defect was an under-redaction, so must-catch
  recall is 46/46 on the old module too — the failures are counts and precision,
  which is exactly how both defects stayed invisible.
- **The over-correction guards pass on BOTH modules**, as they must: `Sra. Elena`
  unsplit, `Fuentes, Camila` preserved whole, a capitalized candidate still
  `high`, and `mc-37` (`el alumno benjamín`) redacted — the old module caught it
  by marking everything, the new one by the filter, and the fixture exists to
  prove the filter did not throw the branch away.

**Test coverage added** (must-catch, blocking): `mc-35` three students in one
comma list → 3 personas; `mc-36` cross-sentence merge → 2 personas; `mc-37`
lowercased name next to a role noun → redacted `uncertain`. **`mc-34` amended a
second time**: `expectedPersonCount` 1 → 2 (r2 recorded it as R3's measured
undercount; r3 closes it). Precision corpus extended by 9 paragraphs / 631 words
of role-noun speech — the blocking gap that hid D3. Plus 11 contract assertions
in `sanitizer.test.ts` across two new groups.

**Handed forward — the honorific layer carries D3's defect. → CLOSED in
Z0B-1r4, §3.5.3**, together with two more instances of the same class the PM
probe then found (cross-sentence firing in two layers, and left-extension
swallowing a verb). Not fixed here: the Z0B-1r3 ruling scopes the
name-plausibility filter to `role-pattern`, and expanding it unilaterally is not
this round's call. Reproduced on `node-1.3.0`:

```
La profesora terminaba explicando dos veces la misma consigna.
  → La profesora [persona 1] explicando dos veces la misma consigna.
El profesor entregó la pauta corregida ayer.  → El profesor [persona 1] la pauta…
La asistente contó que faltaban materiales.   → La asistente [persona 1] que faltaban…
```

`HONORIFICS` contains `profesor/profesora/asistente/educador/educadora/maestro/
maestra/tio/tia`, several of which are ordinary sentence subjects in this
register, and the layer marks whatever follows `high` "regardless of the
following token's capitalization or wordiness". Same harm as D3 — corrupted
minuta text plus inflated density — and the same fix shape. The r3 precision
corpus deliberately contains no honorific-headed constructions, so this is a
**known blocking-suite gap**, stated rather than papered over. Note `adv-12`
already exercises it silently: `La asistente contó que pancho llegó…` redacts
`contó` and misses `pancho`.

**Numbers after the round**: must-catch **46/46 (100%)** across 37 cases;
adversarial **78.8% (26/33)**, unchanged for the fourth round running, zero
over-redactions; precision **0 redactions / 0 persons, byte-identical** on 1225
words / 25 paragraphs, joined status `sanitized` (density 1.88 < 2.0); **182
sanitizer tests green in 4 files** (was 153).

### 3.5.3 Trigger-gap + plausibility CLASS closure — final remediation round Z0B-1r4 (`SANITIZER_VERSION node-1.4.0`)

> This is the **last** remediation round of Z0B-1. r1 fixed a rule, r2 fixed two
> defects, r3 fixed two more — and r3's own hand-forward (open item 10) is the
> evidence that fixing instances was not converging. r4 closes the CLASS instead,
> and the closure argument now lives in the module header as a **MARKING-PATH
> AUDIT**: every path that can create evidence, and which guards bound it.

**The class, stated.** *A marking path fires on a trigger-adjacent token without
(a) gap discipline or (b) name plausibility.* r3 fixed exactly one instance —
role-pattern's plausibility — and the same shape was still live in three more
places. All five instances below were PM-reproduced on `fce2476`, and all five
were re-reproduced by this round before any code changed:

| Instance group | Input | `fce2476` output | Path |
|---|---|---|---|
| honorific | `La profesora terminaba explicando…` | `La profesora [persona 1] explicando…` | honorific, no plausibility |
| honorific | `El profesor entregó la pauta…` | `El profesor [persona 1] la pauta…` | honorific, no plausibility |
| honorific | `La señora dijo que faltaban sillas…` | `La señora [persona 1] que faltaban…` | honorific, no plausibility |
| cross-sentence | `Vimos a los niños de quinto básico. Entonces decidimos…` | `…básico. [persona 1] decidimos…` | course-pattern, across `.` |
| cross-sentence | `Llegaron temprano los alumnos. Entonces conversamos…` | `…alumnos. [persona 1] conversamos…` | role-pattern, across `.` |
| left-extension | `Quedaron Martina Rojas y Benjamín Soto a cargo…` | `[persona 1] y [persona 2] a cargo…` | left-extension swallowed the verb |

**The closure — three uniform guards.**

**G1 — gap discipline** (`patternGapBlocked`). Every trigger-adjacent pattern —
honorific, role-pattern, course-pattern, in both their i−1 and i−2 forms — is
blocked when any gap between the trigger and the candidate carries a sentence
terminator `[.!?¡¿\n•·]`, unless the token before it is in `ABBREVIATIONS`. That
set is the one `tokenize` already consults for sentence starts, so `Sra. Elena`
keeps firing and the two can never disagree. Commas and plain spaces stay legal
inside a pattern, so `de 5°B, Martina` and `la estudiante, Martina` are
unaffected. The i−2 variants check **both** gaps, which is what closes the
course-pattern instance above (`quinto` … `.` … `Entonces`).

**G2 — uniform name plausibility** (`nameCandidateEvidence`). r3's
`rolePatternEvidence` generalized into ONE predicate, parameterized by layer and
shared by honorific, role-pattern and course-pattern:

| Candidate | Evidence | Why |
|---|---|---|
| CAPITALIZED | `high` | trigger context is legitimate disambiguation — `la alumna Rosa`, `tía Rosa` stay `high` |
| CAPITALIZED ∧ sentence-initial ∧ ∈ `COMMON_WORDS` | nothing | capitalization carries no information at a sentence start; defence in depth behind G1, so `Entonces` can never be marked by a pattern layer |
| CAPITALIZED ∧ ∈ `ORG_HEADS` | nothing | **added by this round's own finding — see below** |
| lowercase ∧ ∉ `COMMON_WORDS` ∪ `NON_PERSON_PROPER` ∪ `ORG_HEADS` ∪ `COURSE_WORDS` ∧ ¬`carriesNonNameEnding` | `uncertain` → redacted | r3's shipped predicate, now shared — the Whisper-lowercasing case (`el alumno benjamín`, `don ignacio`, `la profe marcela`) |
| lowercase, anything else | nothing | `terminaba`, `entregó`, `contó`, `trabajaron`, `de séptimo` |

Course-pattern keeps `token.capitalized` as a hard requirement at its call sites,
so routing it through the shared predicate adds guards without relaxing one: its
lowercase branch is unreachable from that layer and could only ever have produced
`uncertain` anyway, never `high`. A contract test asserts it
(`de quinto básico, emilia` stays untouched).

**G3 — left-extension veto**. The extension pass absorbs a capitalized token to
the left of a detected name. `COMMON_WORDS` was its only word filter, and Spanish
sentence openers are an open class, so a capitalized verb walked straight in.
`carriesNonNameEnding` — the same morphology the pattern layers use — is now
tested on the extension candidate too, which is the one place that function reads
a CAPITALIZED token. `Quedaron` dies on `-aron`; every compound name in the
fixtures is unaffected, because `Juan`, `Ana`, `Luis`, `José` sit under the
length-5 floor and `María`, `Sebastián`, `Constanza`, `Matilde`, `Benjamín`
carry no filtered ending.

**DECLARED — a fourth instance, found by this round, fixed under the same
guards.** The scope rule for r4 was class closure, so this is fixed here and not
handed back:

```
Trabajamos en primero básico del Colegio San Mateo.
  → Trabajamos en primero básico del [persona 1] San Mateo.     (fce2476)
```

The course-pattern **i−2** path marks any capitalized token two positions after a
course word, with no constraint on what sits between — and `Colegio` is
capitalized. G1 does not catch it (there is no sentence break) and G2 as ruled
does not either, because the capitalized branch returns `high` unconditionally.
The institution is destroyed *and* the sanitizer reports a person that does not
exist. The fix is one more veto on the capitalized branch: **∈ `ORG_HEADS` →
nothing**.

Why the veto stops at `ORG_HEADS` and does **not** extend to `NON_PERSON_PROPER`,
which would have been the tidier-looking rule: `NON_PERSON_PROPER` contains
`julio`, `abril`, `santiago`, `concepcion` — real es-CL given names — and the
capitalization layer already vetoes that whole set outright, so `el alumno Julio`
would become a **miss**. That is a leak, not a precision gain. `ORG_HEADS`
carries no given-name collision, and every member of it that is not also in
`NON_PERSON_PROPER` (`villa`, `avenida`, `calle`, `sala`, `sector`, `red`,
`ciudad`, `poblacion`, `redes`) remains reachable by the capitalization layer if
it ever appears as a surname. Recall cost: **zero**, by construction.

**`COMMON_WORDS` additions — six, every one forced by a new blocking paragraph.**
Routing the honorific layer through G2 exposed exactly what the ruling predicted:
short, high-frequency verbs that `NON_NAME_ENDINGS` cannot reach, because they
sit under the length-5 floor that exists to protect `juan` and `ivan`.

| Added | Forced by | What it is | es-CL given-name collision |
|---|---|---|---|
| `dijo` | `La señora dijo que faltaban sillas…` | preterite of *decir* | none |
| `hizo` | `La educadora hizo el seguimiento…` | preterite of *hacer* | none |
| `vino` | `El tío vino a buscar a su sobrino…` | preterite of *venir* / the noun | none |
| `quiso` | `La profesora quiso probar el formato…` | preterite of *querer* | none |
| `propuso` | `El maestro propuso dejar el registro…` | preterite of *proponer* | none |
| `jefe` | `El profesor jefe mencionó…` | noun; `profesor jefe` is the es-CL homeroom-teacher term | none |

No addition can leak: `COMMON_WORDS` membership downgrades a capitalized
mid-sentence token to `uncertain` (still redacted) and blocks a lowercase one,
and none of these six is a name. **The list is not claimed to be complete** — an
unlisted short verb after an honorific still resolves to `uncertain` and redacts,
which is over-redaction in the §12-safe direction, costing minuta wording. What
closes the class is G1/G2/G3; this lexicon is a precision refinement on top, and
saying otherwise would be claiming a closed list over an open one.

**Fail-on-old proof.** The new and amended fixtures plus the new contract
assertions were run against the `fce2476` module (`git stash` on
`lib/zoom/sanitizer.ts` only, restored after): **16 failing tests, 196/212
passing**, split by instance group —

| Instance group | Failures | Which |
|---|---|---|
| honorific | **5** | precision paragraphs 26, 27, 28 damaged (9 redactions: `terminaba`, `entregó`, `dijo`, `contó`, `vino`, `educadora hizo`, `jefe`, `quiso`, `propuso`) + 2 contract assertions (the five verb sentences; `don ignacio` recorded `high` instead of `uncertain`) — the `educadora hizo` span is **jointly caused**, `hizo` marked by the honorific layer and `educadora` by role-pattern reaching across the preceding `.` from `apoderados`, so one surface carries both instance groups at once |
| cross-sentence | **5** | precision paragraph 29 damaged (2 redactions, both `Entonces` — one via course-pattern, one via role-pattern) + 4 contract assertions (role noun, course word and honorific each reaching across `.`; the sentence-initial-ordinary-word guard) |
| left-extension | **2** | `mc-40` over-redacts `Quedaron` (mustPreserve fails) + 1 contract assertion on the exact output string |
| course → `ORG_HEADS` *(declared above)* | **2** | precision paragraph 31 damaged (`Colegio` redacted) + 1 contract assertion |
| corpus-level, jointly caused | **2** | the whole-corpus zero-redaction assertion (12 redactions) and the no-flag assertion (density **2.52** → status `flagged`) |

- **0 leaked mentions.** must-catch recall is **50/50 on the old module too** —
  every one of these is an over-redaction, a miscount or a spurious flag, which
  is exactly how the class survived five green suites for four rounds. The one
  must-catch failure is `mc-40`'s `mustPreserve`, not a `mustRedact`.
- **The over-correction guards pass on BOTH modules**, as they must: `don
  ignacio` and `la profe marcela` redacted (`mc-38`, `mc-39` — the old module by
  marking everything, the new one through G2's lowercase branch, and the fixtures
  exist to prove the branch was not thrown away); `Sra. Elena` unsplit and still
  detected; `de quinto básico, Emilia` still caught; `Fuentes, Camila` preserved
  whole; compound-name left extension intact.

**Residuals after this round — unchanged.** R1 and R2, both roster-identity
limits and neither a detection gap; the accepted inverted-unknown overcount; and
the plan-sanctioned adversarial misses (§3.2), which are a measured monitoring
number, not defects. Nothing was added to this list by r4, and open item 10
closes.

> **Superseded claim.** r4 declared itself "the FINAL remediation round of
> Z0B-1". That claim was wrong, and §3.5.4 records why: r4 closed the question
> *where may a trigger reach* and never asked *may the trigger token itself be
> marked*. The guards it built all hold — none of them was reopened by r5 — but
> the closure argument covered one half of the marking question, not both.

**Numbers after the round**: must-catch **50/50 (100%)** across 40 cases;
adversarial **78.8% (26/33)**, unchanged for the fifth round running, over-
redactions **2 → 0**; precision **0 redactions / 0 persons, byte-identical** on
1548 words / 31 paragraphs, joined status `sanitized` (density 1.74 < 2.0);
**212 sanitizer tests green in 4 files** (was 182).

### 3.5.4 Trigger-token candidacy — lexicon closure, round Z0B-1r5 (`SANITIZER_VERSION node-1.5.0`)

**The class.** r4 bounded *where a trigger may reach* (G1 gap discipline, G2
plausibility, G3 the extension veto) and its guards all hold under probing. It
never asked the complementary question: **may the trigger token itself be name
material?** The answer was *yes*, on three paths at once —

- the **capitalization layer** had a skip list containing `NON_PERSON_PROPER` and
  an `ORG_HEADS` lookbehind, and nothing else, so a title-case `Sra`,
  `Profesora`, `Alumna`, `Quinto` or `Dr` self-marked;
- **left-extension** broke on `COMMON_WORDS` / `NON_PERSON_PROPER` / `ORG_HEADS`
  and G3, so a *sentence-initial* `Doña` — already skipped by the capitalization
  layer — was absorbed leftward into the name beside it anyway;
- the **shared pattern predicate** licensed any capitalized candidate, so a title
  following a title (`Profesor` → `Jefe`) was marked too.

The consequence is not cosmetic, and it is why this class outranked everything
else found this round. **A title fused into a person span makes the span fail
roster coverage**, so the worst victims are ATTENDEES — §12's "attendee names
are preserved" breaking in the most common es-CL registers, while the mention
itself was still redacted, which is exactly why a recall-scored suite saw
nothing.

**Reproduced on `a9f6f87`** (every one is a fixture now):

| Roster | Input | `node-1.4.0` | `node-1.5.0` |
|---|---|---|---|
| `Elena Vidal` | `La Sra. Elena presentó el informe…` | `La [persona 1] presentó…` — **attendee destroyed** | `La Sra. Elena presentó…` |
| `Marcela Soto` | `La Profesora Marcela propuso…` | `La [persona 1] propuso…` — **attendee destroyed** | `La Profesora Marcela propuso…` |
| `Carmen Ruiz` | `Doña Carmen firmó el acta…` | `[persona 1] firmó…` — **attendee destroyed** | `Doña Carmen firmó…` |
| `Elena Vidal` | `La Prof. Elena entregó la pauta…` | `La [persona 1] entregó…` — **attendee destroyed** | `La Prof. Elena entregó…` |
| *(non-attendee)* | `La Sra. Rosa reclamó…` | `La [persona 1] reclamó…` — title swallowed | `La Sra. [persona 1] reclamó…` |
| *(any)* | `Los niños de Quinto Básico salieron…` | `Los niños de [persona 1] salieron…` — **a course is a person** | unchanged |
| *(any)* | `La Alumna Martina no llegó…` | `La [persona 1] no llegó…` — role word fused | `La Alumna [persona 1] no llegó…` |
| *(any)* | `El Profesor Jefe mencionó el calendario.` | `El [persona 1] mencionó…` — compound title | unchanged |
| *(any)* | `El Dr. Martínez revisó el informe…` | `El [persona 1] revisó…` | `El Dr. [persona 1] revisó…` |
| *(any)* | `En quinto básico Lenguaje se trabajó…` | `en quinto básico [persona 1]…` — a **subject** is a person | unchanged |

The `Sra. Elena` row deserves its own sentence, because the obvious reading is
wrong: the abbreviation guard was **correct** to refuse to split `Sra. Elena`,
and "fix the split" would have been the wrong repair. The defect is upstream —
`Sra` carried evidence at all. With G4 in place the guard's role changes rather
than disappearing: it no longer holds a span together, it lets the honorific
**trigger** reach across its own period.

**The fix — V1…V4, one veto shared by every path.**

- **V1 — capitalization skip.** `HONORIFICS ∪ ROLE_NOUNS ∪ COURSE_WORDS ∪
  ABBREVIATIONS` join `NON_PERSON_PROPER` in the layer's skip list. A trigger
  token can never self-mark.
- **V2 — left-extension break.** The same four lexicons join the break
  conditions. This is the half V1 cannot cover: `Doña` is sentence-initial, so
  the capitalization layer had *already* skipped it and the extension pass
  absorbed it regardless.
- **V3 — shared pattern predicate.** Candidates ∈ the same four lexicons are
  vetoed: a title is never the name that follows a title. Applied **before** the
  capitalized/lowercase split rather than only to the capitalized branch, which
  let path 2's ad-hoc "candidate is not itself a role noun" test be deleted
  instead of duplicated. **V3′ (G4′)**: at **course** call sites only, candidates
  ∈ `NON_PERSON_PROPER` are additionally vetoed — that is what kills `Básico` and
  the school subjects. Role and honorific sites deliberately keep
  `NON_PERSON_PROPER` reachable; the asymmetry is argued below.
- **V4 — `jefe`/`jefa` join `HONORIFICS`**, while staying in `COMMON_WORDS`:
  different mechanisms, neither redundant. As a *candidate* `Jefe` is vetoed by
  V3, so `El Profesor Jefe mencionó…` stays intact; as a *trigger* it licenses
  what follows, so `el profesor jefe marcelo…` now catches `marcelo`, which was a
  clean miss on `a9f6f87`.
- Path 8 (**cross-reference**) gets the veto too, so the layer cannot re-open
  through the back door what V1–V3 closed.

**Same-class discoveries, fixed here and declared.** Per the round's scope rule,
two instances found during implementation are in the same class and were fixed:

1. **`ABBREVIATIONS` were never in any veto.** `dr` / `dra` / `prof` / `ing` /
   `lic` are the `Sra` construction *without* its `HONORIFICS` membership, so
   `El Dr. Martínez` and `La Prof. Elena` fused exactly like `La Sra. Elena` —
   including the attendee-destroying variant. They are not triggers, so vetoing
   them costs no recall at all: the name beside them is still caught by the
   capitalization layer. Whether they should *become* triggers is a recall
   question this round deliberately does not answer (residual).
2. **Course sites marked school-subject vocabulary.** `NON_PERSON_PROPER` is
   vetoed by the capitalization layer but was not vetoed at course call sites, so
   `en quinto básico Lenguaje` produced `[persona 1]`. This is the concrete case
   G4′ exists for beyond `Básico` itself.

**Collision audit.** The r4 precedent (`julio`/`abril`/`santiago` blocking a
blanket `NON_PERSON_PROPER` veto) says a lexicon veto must be argued member by
member, not asserted. Every member of the four vetoed lexicons was scanned for
plausible es-CL given names and surnames:

| Lexicon | Members scanned | Verdict |
|---|---|---|
| `HONORIFICS` | `don dona sr sra srta senor senora senorita profe profesor profesora tio tia miss mister maestro maestra educador educadora asistente jefe jefa` | **Recall-safe, one caveat.** No given-name collisions. One surname collision: **`Maestro`** (rare in Chile, real). See R5 below. |
| `ROLE_NOUNS` | `alumno/a(s) estudiante(s) nino/a(s) chico/a(s) joven(es) apoderado/a(s) pupilo/a companero/a(s) hermano/a hijo/a madre padre mama papa tutor/a` | **One real collision, carved out.** `niña` and the given name **`Nina`** both normalize to `nina`, so a blanket veto would have made a girl called Nina undetectable on *every* path — a recall regression introduced by the fix. |
| `COURSE_WORDS` | `primero segundo tercero cuarto quinto sexto septimo octavo primer tercer basico basica medio media kinder prekinder` | **Recall-safe.** No given-name or surname collisions in es-CL. |
| `ABBREVIATIONS` | `sr sra srta dr dra prof ing lic` | **Recall-safe.** No collisions; and none of them is a trigger, so the veto is pure subtraction from false-positive marking. |

The `Nina` carve-out is implemented as `LEXICON_NAME_COLLISIONS`, tested on the
**accent-preserving** lowercase surface rather than the normalized one — the
spelled `niña` keeps its veto, the tilde-free `Nina` escapes it. It had to reach
path 8 as well: cross-reference propagates on the accent-stripped norm, so
without the veto there, redacting a student called `Nina` would have turned
**every `niña` in the transcript** into that student. That leak is present on
`a9f6f87` and is one of the r5 fail-on-old failures (`mc-53`).

**Partial-name residue (R5).** `Maestro` as a surname now loses only its own
token: `El informe de Cristóbal Maestro` emits `[persona 1] Maestro`. The given
name still redacts; a lone surname survives. Under the §12 asymmetry that is the
right side of the trade — the alternative is letting `Maestro` be name material
again, which re-opens the whole class and destroys an attendee every time a
title-case title appears. Worth being precise about the contract: this is a
**miss of one token**, not a partial redaction of a span. The surname was never
inside the redacted segment, so "never act partially INSIDE a segment" is
untouched.

**The asymmetry, and what it costs (R4).** `NON_PERSON_PROPER` holds `julio`,
`abril`, `santiago`, `concepcion` — real es-CL given names whose ONLY detection
path is a role or honorific pattern, because the capitalization layer vetoes the
set outright. So G4′ is course-sites-only, `el alumno Julio` is a catch
(`mc-49` locks it), and the price is paid where a student is referenced **only**
through a course designation: `el caso de quinto básico, Julio` was caught on
`node-1.4.0` and is a **miss** on `node-1.5.0`. Stated plainly because it is a
real recall loss, not a pre-existing gap. It is narrow — the name must be a
month or place AND the reference must be course-only — and self-healing: one
mention beside a role noun, an honorific, or anywhere capitalized mid-sentence
redeems him through cross-reference. Both halves are asserted in the contract
suite. The reverse trade costs `el alumno Julio`, which is the far commoner
construction.

**V4 cost containment.** Promoting `jefe`/`jefa` to triggers introduced one
over-redaction of its own: `la jefa técnica revisó…` → `la jefa [persona 1]
revisó…`, because the adjective in that es-CL role title is reached by no other
filter. `tecnica`/`tecnico` were added to `COMMON_WORDS` — neither is a given
name, so the containment costs nothing — and the construction is asserted in the
contract suite and in precision paragraph 33. The general residue stands
unchanged from r4: an unlisted adjective after a newly promoted trigger
over-redacts, in the §12-safe direction.

**Fail-on-old proof.** The new and amended fixtures plus the new contract
assertions were run against the `a9f6f87` module (module file swapped only,
restored after): **41 failing tests, 237/278 passing**, grouped by instance
family —

| Instance family | Failures | Which |
|---|---|---|
| attendee-destroyed | **8** | `mc-41` `mc-42` `mc-43` `mc-51` — each fails both its `mustPreserve` assertion (`La Sra. Elena`, `La Profesora Marcela`, `Doña Carmen`, `La Prof. Elena`) and its `expectedPersonCount: 0` |
| title-swallowed | **3** | `mc-16` (`la Sra. [persona 1]` — the amended pre-existing fixture), `mc-44` (`La Sra. [persona 1]`), `mc-50` (`El Dr. [persona 1]`) |
| course-fused | **4** | `mc-45` (`Quinto Básico`) and `mc-52` (`quinto básico Lenguaje`), each failing `mustPreserve` + `expectedPersonCount` |
| role-word-fused | **1** | `mc-46` (`La Alumna [persona 1]`) |
| compound-title | **2** | `mc-47` (`El Profesor Jefe`) — `mustPreserve` + count |
| jefe-as-trigger (a genuine MISS on old) | **3** | `mc-48` — `marcelo` leaks; the redaction assertion, the neutral-token assertion and the count all fail |
| collision carve-out | **1** | `mc-53` — `la niña de kinder` over-redacted on old, via the cross-reference norm collision |
| suite-level | **1** | must-catch "leaks nothing across the whole suite" (`mc-48: marcelo`) |
| precision corpus | **5** | paragraphs 32, 33, 34 damaged + the whole-corpus zero-redaction assertion (**20 redactions**) + the no-flag assertion (density **2.77** → `flagged`) |
| contract — abbreviation reframing | **2** | the two assertions that used to expect the span `Sra. Elena` and now expect `Elena` |
| contract — G4 block | **8** | V1, V2, V3 title-following-title, V3 asymmetry, V3 accepted-miss, V4 both directions, the `nina` carve-out, titles-survive |
| contract — bare-attendee interplay | **3** | preserved-when-clean, contaminated, whole-span-behind-the-title |

- **One leaked mention on the old module** (`mc-48`'s `marcelo`), so must-catch
  recall on `a9f6f87` is **55/56**. Everything else in the table is an
  over-redaction, a destroyed attendee, a miscount or a spurious flag — which is
  precisely how this class survived **six** green suites for five rounds.
- **`V4 — promoting a trigger does not over-redact the role title around it`
  passes on both modules**, as it must: on the old one trivially (`jefe` was not
  a trigger), on the new one through the `COMMON_WORDS` containment. It is in the
  suite to stop a future round from re-introducing the cost.
- **Every r1–r4 guard passes on the new module unchanged**: `don ignacio` and
  `la profe marcela` still redacted as `uncertain`; `de quinto básico, Emilia`
  still caught; `Fuentes, Camila` preserved whole; `Quedaron` outside the span;
  `del Colegio San Mateo` intact; compound-name left extension intact.

**Residuals after this round.** R1 and R2 (roster-identity limits, unchanged);
**R4** and **R5**, new and both priced above; the accepted inverted-unknown
overcount; and the plan-sanctioned adversarial misses (§3.2). What this round
claims is **lexicon-candidacy closure**: every lexicon in the module now has an
explicit, tested relationship to name candidacy, written into the header's
per-lexicon table — never / downgrade / reachable-via-patterns / bridging-only —
and a new lexicon is not finished until it has a row there.

**Numbers after the round**: must-catch **56/56 (100%)** across 53 cases, with
30 `mustPreserve` assertions; adversarial **78.8% (26/33)**, unchanged for the
sixth round running, over-redactions **0 → 0**; precision **0 redactions / 0
persons, byte-identical** on 1731 words / 34 paragraphs, joined status
`sanitized` (density 1.62 < 2.0); **278 sanitizer tests green in 4 files**
(was 212).

### 3.5.5 Recognizer completeness — sealing round Z0B-1r6 (`SANITIZER_VERSION node-1.6.0`)

**Three classes, not one.** r5 closed lexicon candidacy: every lexicon the
module HAS now has a stated, tested relationship to name candidacy, and that
closure holds unchanged here. r5's own report correctly refused to fix the three
things it had found beyond that boundary, handing them forward as open items
12–14 rather than patching them unruled. All three are **different classes** —
from r5 and from each other:

| # | Fix | Class | Why r5's closure could not reach it |
|---|---|---|---|
| 12 | **F12 school register** | *vocabulary the module does not have* | G4 vetoes lexicon MEMBERS. `directora`, `coordinadora`, `inspector`, `docente` were in **no** lexicon, so to this module a job title was an ordinary capitalized unknown. Nothing to veto. |
| 13 | **F13 per-ending floor** | *a morphology filter disabled by a global constant* | Not about candidacy at all. `MIN_ENDING_FILTER_LENGTH = 5` exists to protect `juan`/`ivan` from the `an` ending, and being global it also switched off the `ó` marker for every short preterite. |
| 14 | **F14 numeric course codes** | *a trigger the module carries but cannot reach* | `looksLikeCourse`'s numeric branch was **provably dead** — `WORD_RE` matches letter-initial runs, so a digit-only token never exists and the branch never fired on any input. |

**Reproduced by the PM on `0011f8c`** before any of it was ruled; every instance
is a fixture now:

| Roster | Input | `node-1.5.0` | `node-1.6.0` |
|---|---|---|---|
| *(any)* | `La Sra. Directora confirmó la fecha…` | `La Sra. [persona 1] confirmó…` — **a person invented out of a job title** | `La Sra. Directora confirmó…` |
| `Marcela Soto` | `La Directora Marcela propuso…` | `La [persona 1] propuso…` — **attendee destroyed** | `La Directora Marcela propuso…` |
| *(any)* | `Al final la profesora dejó la pauta…` | `…la profesora [persona 1] la pauta…` — **a verb is a person** | unchanged |
| *(any)* | `Los apoderados de 5°B, Antonia entre ellos…` | `de 5°[persona 1], [persona 2] entre ellos…` — **course code mangled, count inflated to 2** | `de 5°B, [persona 1] entre ellos…` |
| *(any)* | `Los apoderados de 5°B firmaron el acta.` | `de 5°[persona 1] firmaron…` — **one invented person, zero students in the sentence** | unchanged |
| *(any)* | `Los apoderados de 1ºA, Antonia entre ellos…` | `de 1[persona 1], [persona 2] entre ellos…` | `de 1ºA, [persona 1] entre ellos…` |

**F12 — school-register title lexicon.** `SCHOOL_REGISTER_TITLES` holds eleven
stems in singular and plural, masculine and feminine: `director`,
`subdirector`, `coordinador`, `inspector`, `rector`, `orientador`, `secretario`,
`psicólogo`, `supervisor`, `sostenedor`, `docente`. They get the v1.5
`jefe`/`jefa` treatment exactly — **vetoed as candidates** by G4, so "La Sra.
Directora confirmó…" comes through intact, and **active as triggers**, so "la
directora Marcela" is caught with layer `honorific` and the lowercase-only "la
docente antonia" is caught at all (a clean miss on `0011f8c`). Stored as their
own set rather than merged into `HONORIFICS`, so the candidacy table keeps one
row per argued decision.

The observation that makes the fix worth making rather than merely arguable:
"La Directora Marcela" was **destroying the attendee** in precisely the way r5
closed for `Profesora` — the same failure mode re-entering through vocabulary no
lexicon contained.

**F12 collision audit — every member, before admission.** The r4 precedent
(`julio`/`abril`/`santiago` blocking a blanket `NON_PERSON_PROPER` veto) says a
veto is argued member by member, not asserted:

| Member (all four inflections) | Given-name collision | Surname collision | Verdict |
|---|---|---|---|
| `director` / `directora` | none | none | admit |
| `subdirector` / `subdirectora` | none | none | admit |
| `coordinador` / `coordinadora` | none | none | admit |
| `inspector` / `inspectora` | none | none | admit |
| `rector` / `rectora` | none | none | admit |
| `orientador` / `orientadora` | none | none | admit |
| `secretario` / `secretaria` | none | none | admit |
| `psicólogo` / `psicóloga` | none | none | admit |
| `supervisor` / `supervisora` | none | none | admit |
| `sostenedor` / `sostenedora` | none | none | admit |
| `docente` / `docentes` | none | none | admit |

**Nothing dropped, and no `LEXICON_NAME_COLLISIONS` carve-out needed** — unlike
`ROLE_NOUNS`, where `niña`/`Nina` forced one, and unlike `HONORIFICS`, where
`maestro` is a real if rare es-CL surname and pays for it with residual R5. The
check that mattered is the surname column: Spanish does form occupational
surnames of this exact morphology (`Pastor`, `Herrero`, `Escudero`), and none of
the eleven is one of them. Two of the four inflections are also checked against
`NON_PERSON_PROPER`, which already holds the *abstract* nouns of the same family
(`direccion`, `rectoria`, `coordinacion`, `orientacion`) — different tokens, no
overlap, no behaviour change to either set.

**F12 cost containment**, the V4 `jefa técnica` lesson applied to eleven
triggers at once. Promoting a word to a trigger licenses whatever follows it,
and the es-CL compound titles put an ADJECTIVE there: "coordinadora
pedagógica", "directora académica", "inspector general", "orientadora escolar",
"secretaria administrativa", "directora subrogante". Those adjectives join
`COMMON_WORDS` (none is a given name, so the containment costs no recall) and
the constructions are asserted in the contract suite and in precision paragraph
35. Two properties are worth separating: what makes the promotion **affordable**
is `NON_NAME_ENDINGS`, not the word list — "las coordinadoras dijeron",
"la Directora confirmó", "el coordinador pasó" are all clean because the
ending filter stops the verb, which is a rule rather than an enumeration. The
word list is only for adjectives, where no rule reaches. `mc-58` is the fixture
that goes red if a future round widens the register without the ending filter
behind it.

**F13 — per-ending floor.** A length floor is a property of the ending it
protects against, not of the filter. The global floor of 5 exists for one
reason — `juan` and `ivan` versus the `an` ending — and being global it silently
disabled the accented-`ó` preterite marker for every short preterite. `ó` now
carries its own floor of 3:

| Ending | Floor | Audit |
|---|---|---|
| `ó` | **3** | **No es-CL given name ends in accented `-ó`.** Word-final stressed `-ó` in Spanish is essentially the 3rd-person preterite and nothing else; the name-shaped near misses end `-é` (`José`, `René`, `Noé`) or `-ón`/`-án` (`Ramón`, `Simón`, `Julián`), none of which this row touches. The 3-and-4 character band it opens is verbs only (`dió`, `vió`, `dejó`, `sacó`, `pasó`, `tocó`, `notó`, `miró`). No common es-CL surname of 3–4 characters ends in `-ó` either — which had to be checked separately, because G3 runs this same filter on **capitalized** left-extension candidates, i.e. on surnames. |
| *(every other ending)* | 5 | Unchanged. Deliberately not relaxed: `-é` and the rest have **not** been audited, and auditing one ending does not license moving another. The contract suite locks both sides — `juan`/`ivan` still caught next to a role noun, and `josé` still caught, so a future round cannot quietly generalise the `ó` row. |

The audit note lives in the code beside the floor table, so the argument travels
with the constant. Unchanged and unrelated: an accent-stripped `dejo` after a
title still redacts as `uncertain` — that is the pre-existing accent-loss trade
the module makes everywhere (§3.2), not a gap F13 opens.

**F14 — numeric course codes.** Both halves, as ruled:

- **(a)** A single-letter token whose preceding raw text matches
  `/\d{1,2}\s*[°º]\s*$/` is a **course-code letter**, set once in `tokenize` as
  a positional property (`courseCodeLetter`). It joins the **G4 family** — never
  name material on any path — and it **satisfies `looksLikeCourse`**, so the
  course i-1/i-2 patterns genuinely fire from `5°B` for the first time. The
  assertion that proves it is the layer label: `Antonia` in "de 5°B, Antonia" is
  now `course-pattern`, where before it was caught by the capitalization layer
  as an accident while the course code was destroyed beside it.
- **(b)** `COURSE_NUMERIC_RE` and the forward `°`-lookahead are **deleted**.
  They were unreachable — `WORD_RE` matches letter-initial runs, so
  `COURSE_NUMERIC_RE.test(token.raw)` could never be true — so the removal is
  behaviour-free and the lookbehind in (a) is what replaces them.

Result asserted exactly: `Los apoderados de 5°B, [persona 1] entre ellos,
firmaron.` — code intact, `Antonia` redacted once, `personCount` 1. Plain `5°B`
with no adjacent name is untouched, which on `0011f8c` was itself a defect
(`de 5°[persona 1] firmaron` — one invented person in a sentence containing no
students at all).

**Same-class discovery, fixed here and declared.** Per the round's scope rule:
**the ordinal-indicator spelling `1ºA`.** Unicode classifies `º` (U+00BA
MASCULINE ORDINAL INDICATOR) as `Lo` — a *letter* — so `\p{L}` accepted it and
"1ºA" tokenized as the two-character word **`ºA`**. That token matched no course
recognizer and was marked by the role-pattern layer as an uncertain lowercase
name, giving `de 1[persona 1] firmaron`: the same defect as the `5°B` instance,
the same mangled course code, the same inflated count, reachable only through
this spelling — and **invisible to a fix written against `°`** (U+00B0, which is
a symbol and was therefore never glued to the letter). `WORD_RE` now excludes
both ordinal indicators, so `1ºA` behaves identically to `5°B`. One side effect,
stated because it moves a metric: a standalone "3ª" used to contribute the token
`ª` — a word containing no letters — to `wordCount`, and now contributes none,
which shifts the §6 density denominator on texts carrying bare ordinals. No
fixture contains one, so no measured figure in this document moves.

**Fail-on-old proof.** The new fixtures and contract assertions were run against
the `0011f8c` module (module file swapped only, restored after): **27 failing
tests, 310/337 passing**, grouped by fix —

| Fix | Failures | Which |
|---|---|---|
| **F12** school register | **8** | `mc-54` (`La Sra. Directora confirmó` + count) and `mc-55` (`La Directora Marcela` + count, **attendee destroyed**); precision paragraph 35 (4 redactions); contract — title-case never marked, the two-member lowercase trigger half, attendee preserved |
| **F13** per-ending floor | **5** | `mc-59` (`la profesora dejó la pauta` + count); precision paragraph 36 (2 redactions); contract — the four 4-character preterites, the 3-character boundary `dió` |
| **F14** numeric course codes | **12** | `mc-60` (`de 5°B, [persona 1] entre ellos` + count **2 → 1**), `mc-61` (`de 5°B firmaron` + count), `mc-62` (`de 1ºA…` + count, the same-class ordinal instance); precision paragraph 37 (2 redactions); contract — letter never name material, course pattern genuinely fires, spaced + ordinal spellings, ordinal exclusion from words, G4′ at the new trigger site |
| suite-level (all three) | **2** | precision whole-corpus zero-redaction (**11 redactions**) and the no-flag assertion (density **2.23** → `flagged`) |

- **Zero leaked mentions on the old module.** Must-catch recall on `0011f8c` is
  **61/61** — every one of the 27 failures is an over-redaction, a destroyed
  attendee, a miscount, a mangled course code or a spurious flag. r5 had one
  leak (`mc-48`'s `marcelo`); r6 has none, which is the sharpest statement yet
  of why a recall-scored suite could not have found any of this. It also means
  **F12/F13/F14 buy no recall** except through F12's lowercase trigger half
  (asserted in the contract suite, where it does fail on old); what they buy is
  precision, attendee survival and metric accuracy.
- **New cases that PASS on old, and why they are still worth having**: `mc-56`
  and `mc-57` (a CAPITALIZED name after a register title was already caught by
  the capitalization layer — they lock the *layer* and the surviving title, and
  their lowercase twins in the contract suite are the ones that fail on old);
  `mc-58` (the forward-looking cost lock on the register promotion, the
  `V4 — does not over-redact the role title` pattern); `mc-63` (R6's flip side,
  which asserts unchanged behaviour on purpose); and the contract cases for the
  unmoved `-an`/`-é` floors and the sentence-initial lone `B`.
- **Every r1–r5 guard passes on the new module unchanged**: `don ignacio` and
  `la profe marcela` still `uncertain`; `de quinto básico, Emilia` still caught;
  `Fuentes, Camila` preserved whole; `Quedaron` outside the span; `del Colegio
  San Mateo` intact; G4's V1–V4 and the `nina` carve-out all green; R4's
  accepted narrow miss (`de quinto básico, Julio`) still exactly as documented.

**Residuals after this round.** R1 and R2 (roster-identity limits, unchanged);
R4 and R5 (the priced costs of G4/G4′, unchanged); **R6 open-world titles**,
new; the accepted inverted-unknown overcount; and the plan-sanctioned
adversarial misses (§3.2).

**R6 is a residual by construction, not by omission**, and the reason has to be
said plainly because the obvious "fix" for it is a leak. `SCHOOL_REGISTER_TITLES`
is an enumeration and job titles are an open class, so an unlisted capitalized
title after an honorific — "La Sra. Bibliotecaria avisó…" — is still marked by
the capitalization layer and still redacts. That is over-redaction in the
§12-safe direction. The flip side is the same construction: **"La Sra. Solange"
is a NAME**, and nothing distinguishes the two except a list. The capitalization
layer must therefore keep marking unknown capitalized words; stop it in order to
clean up unlisted titles and every unlisted given name in that register walks
through unredacted. Both halves are asserted in one contract test and `mc-63`
locks the second, so the trade is explicit rather than implied. The only safe
way to shrink R6 is to lengthen the list — which is why the register is a
lexicon with a collision audit rather than a heuristic.

**What this round claims: the known-defect list is EMPTY.** Open items 12, 13
and 14 are closed; nothing was found this round that is handed forward
unfixed. What remains is argued residuals — R1, R2, R4, R5, R6, the accepted
inverted-unknown overcount, and the 7 plan-sanctioned adversarial misses — each
with a stated reason it is a trade rather than a bug.

**Numbers after the round**: must-catch **61/61 (100%)** across 63 cases, with
40 `mustPreserve` assertions; adversarial **78.8% (26/33)**, unchanged for the
seventh round running, over-redactions **0 → 0**; precision **0 redactions / 0
persons, byte-identical** on 1886 words / 37 paragraphs, joined status
`sanitized` (density 1.64 < 2.0); **337 sanitizer tests green in 4 files**
(was 278).

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

## 6. Webhook harness and customerKey round trip

> Chunk **Z0B-2**, 2026-07-29. First credentialed section: everything below ran
> against FNE's real Zoom account (S2S app "GENERA LMS S2S", Meeting SDK app
> "GENERA LMS SDK") with **synthetic meeting content only**. Every meeting created
> by this chunk is named `PRUEBA SPIKE — no unirse`; audio and video came from
> Chromium's fake media device, never from a person.
>
> Credentials live only in the worktree's gitignored `.env.spike.local`. No secret
> appears in any file in this commit, and every spike script routes output through
> a redactor (`scripts/spikes/zoom/lib.mjs` → `makeRedactor`) that collapses the
> seven credentials plus any JWT-shaped string before printing.

### 6.1 Webhook verification harness

**Built** (`scripts/spikes/webhook/`):

| File | Role |
|---|---|
| `receiver.mjs` | Standalone Node HTTP receiver. Deliberately NOT a Next.js route — the production endpoint is Z1b's. Answers the CRC challenge, and records for every request the raw bytes, the full header set, the arrival skew, and **two** signatures: one over the raw body and one over `JSON.stringify(JSON.parse(body))`. |
| `make-fixtures.mjs` | Converts raw captures into the redacted fixture library under `__tests__/lib/zoom/fixtures/webhooks/`, mapping real account/user/meeting/uuid/email values to stable synthetic ones while preserving byte-level key order and spacing. |

Exposed with `cloudflared` (a quick tunnel; `ngrok` is also installed). The CRC
responder was verified twice — locally and through the public tunnel:

```
POST /api/zoom/webhook  {"event":"endpoint.url_validation","payload":{"plainToken":"tunnelcheck"}}
→ 200 {"plainToken":"tunnelcheck","encryptedToken":"eb2b179e…22a0"}   (1.47 s end-to-end through the tunnel)
```

**CRC algorithm confirmed**: `encryptedToken = HMAC-SHA256(plainToken, secretToken)`,
hex. **Signature scheme**: `x-zm-signature: v0=HMAC-SHA256("v0:{x-zm-request-timestamp}:{rawBody}", secretToken)`.

#### The subscription was validated, and real events were captured

Brent validated the endpoint in the Marketplace mid-run. Zoom's CRC request
arrived from `user-agent: Zoom Marketplace/1.0a`, the responder answered it, and
the subscription went live. Real deliveries followed.

**Real header set**, observed on every delivery:

```
x-zm-request-id         78be6d38_8508_4ea9_8999_e25d10eb8455
x-zm-request-timestamp  1785368934
x-zm-signature          v0=<hex>
traceparent             00-a72d0946077f1e534818509a19565308-275c9fe0b06977cb-02
user-agent              Zoom Marketplace/1.0a
```

Confirms §20's claim that `x-zm-request-id` and `traceparent` are present.

**⚠️ `x-zm-request-timestamp` is epoch SECONDS, not milliseconds.** This spike
assumed milliseconds and was wrong; the assumption was corrected in the receiver,
in the vector tests and in the fixture generator. The value is 10 digits
(`1785368934`), and real skew is **sub-second to ~1 s**. The trap is a genuine unit
asymmetry inside Zoom's own payload: `event_ts` in the BODY is epoch
**milliseconds** (13 digits, `1785368934817`), so one request carries both units.
Reading the header as milliseconds makes every request look ~56 years stale. Both
facts are now locked by tests so the mistake cannot be reintroduced.

**Signature verification against real traffic**: every delivery verified
`sig-ok` against the raw body. The scheme and inputs are confirmed in production
conditions, not just as vectors.

**A finding that vindicates proving the re-serialization rule by construction:**
for **every** real payload Zoom sent, the bytes were already canonical JSON —
`JSON.stringify(JSON.parse(body))` was byte-identical, so the re-serialized
signature *also* matched (`re-sig-ALSO-ok` on all of them). A verifier that
re-serialized before hashing would therefore have **passed every live test** and
still been wrong. Zoom promises nothing about formatting, so the raw-body rule is a
robustness requirement that live traffic cannot demonstrate. The deterministic
vector — which constructs a non-canonical body and asserts that premise before
asserting the conclusion — is the only thing that catches it.

**Events captured** (`meeting.*` and `recording.*`, all signature-verified):

| Event | Deliveries | Skew |
|---|---|---|
| `endpoint.url_validation` | 1 | — |
| `meeting.started` | 1 | 838 ms |
| `meeting.participant_joined` | 2 | 398 ms / 544 ms |
| `recording.started` | 2 | 400 ms / 813 ms |
| `recording.stopped` | 2 | 1004 ms / 942 ms |
| `meeting.participant_left` | 2 | (answered 500 on purpose — see below) |

**`recording.stopped` arrives, and this is the important one**: it is the
confirmation signal §8.4 identifies as the *only* possible one, and it landed twice,
each time within seconds of the `recording.stop` API call. §8.4's verdict is no
longer resting on an inference from §20.

| Claim | Status |
|---|---|
| CRC challenge-response algorithm | ✅ Verified locally, through the tunnel, **and by Zoom's own validation** |
| Signature scheme over the raw body | ✅ Verified as vectors **and against real traffic** |
| **Re-serialized body must fail** | ✅ Proven by construction — and shown to be *unprovable* from live traffic |
| Tamper / replay / rotated-secret rejection | ✅ Proven as vectors |
| Real header set | ✅ **Observed** (above) |
| Timestamp unit and real skew | ✅ **Measured** — seconds, sub-second skew (corrected a wrong assumption) |
| `recording.stopped` delivery | ✅ **Observed** ×2 |
| Retry behaviour on ≥500 | ✅ **Observed** — see §6.1.1 |
| §20's "retries resend an identical body" | ✅ **Confirmed** — see §6.1.1 |
| `meeting.ended`, `recording.completed` | ✅ **Observed** — `recording.completed` (6 499 B raw, carries `download_token`), `meeting.ended` (skew **−15 ms**, i.e. Zoom's clock marginally AHEAD — a freshness check must tolerate negative skew, so the comparison has to be absolute) |
| Redacted real-payload fixture library | ✅ **All 7 subscribed events captured and written** — see §6.1.2 |

#### 6.1.1 Retry behaviour on ≥500 — measured

Two `meeting.participant_left` deliveries were deliberately answered `500` (the
receiver's `FAIL_EVENTS` mode). Both were retried, and both retries arrived at
**304 s ≈ 5.1 min** — confirming §20's "3× at 5/20/60 min on ≥500".

A retry is identifiable because **`x-zm-request-id` is stable across it**. That
distinction had to be made carefully: a first reading of the two *original*
deliveries looked like a retry pair and was not — they arrived 4 ms apart with
*different* request-ids and *different* bodies, being the two distinct participants
leaving. Only the repeated request-id separates a genuine retry from two similar
events.

What changes and what does not, across a retry:

| Field | Across a retry |
|---|---|
| `x-zm-request-id` | **identical** |
| raw body (bytes) | **identical** → `sha256(body)` identical |
| `x-zm-request-timestamp` | **differs** (`1785369686` → `1785369990`) |
| `x-zm-signature` | **differs** (recomputed over the new timestamp) |

**This validates §6's schema choice and exposes the adjacent trap.**
`zoom_webhook_events.dedupe_key = sha256(raw body) UNIQUE` is correct: the bodies
are byte-identical, so the hash collides exactly as intended and the retry is
absorbed. But the signature and the timestamp both change, so **any dedupe key that
folded in the timestamp or the signature — for example hashing the signed string
`v0:{timestamp}:{body}` rather than the body alone — would fail to dedupe and would
double-process every retried event.** `x-zm-request-id` is a viable alternative or
cross-check key, being stable across retries and unique per event.

A second consequence for Z1b: because Zoom re-signs rather than replaying the
original header, a retry arriving 5 minutes late carries a *fresh* timestamp, so a
freshness check does not reject it. That is the desired behaviour — but it holds
only because of the re-signing, not because the window is generous.

#### 6.1.2 Fixture library — all 7 events, and two redaction defects worth recording

`__tests__/lib/zoom/fixtures/webhooks/` now holds a redacted capture of **every one
of the 7 subscribed events**: `meeting.started`, `meeting.participant_joined`,
`meeting.participant_left`, `meeting.ended`, `recording.started`,
`recording.stopped`, `recording.completed`. Each stores the raw body byte-for-byte
(key order and spacing preserved — the whole point), the allowlisted header set, the
observed skew, and whether Zoom's bytes were canonical.

`recording.completed` is the valuable one: 6 499 B raw, and it carries the
`download_token` alongside **6 `recording_files`** — the two-segment structure from
§8.3, visible in the webhook payload itself rather than inferred from a later API
read.

**Two real leaks were caught by scanning the generated output, not by design.** Both
are fixed, both are now locked by tests, and both are recorded here because the
pattern matters more than the instances:

1. **Zoom sends the S2S Client ID in a `clientid` request header.** The generator
   stripped only `authorization`, so a credential went straight into a fixture that
   was about to be committed. Fixed by **allowlisting** headers rather than
   denylisting them — a header nobody has vetted now simply does not ship. This also
   removed the `cf-*`/`x-forwarded-*` headers, which describe this spike's
   cloudflared tunnel rather than Zoom's request and would have misinformed Z1b about
   the real header set.
2. **`recording_play_passcode` (~98 chars) is a live playback credential** for the
   real recording, and it did not match the shorter `password` pattern. Fixed
   specifically, plus a catch-all backstop that redacts any long high-entropy value
   under a `*token|passcode|secret|key` field name — because guessing Zoom's field
   names correctly is precisely what failed twice.

The lesson for Z1b, which handles these payloads for real: **the sensitive surface of
a Zoom webhook is wider than the documented fields.** A `download_token` at the top
level, a playback passcode nested in the object, and a client id in a header are
three different shapes in three different places, and `zoom_webhook_events.raw_payload`
stores all of it (nulled at 30 d per §6).

**Committed test gate** — `__tests__/lib/zoom/webhook-signature-vectors.test.ts`,
**32 tests**, covering plan §17's "HMAC/CRC vectors incl. re-serialized-body-must-fail":
CRC vector + token/secret sensitivity; signature over raw bytes; failure on
re-serialization, on equal-length tampering, on timestamp substitution, on a
rotated secret, and on a truncated signature (the `timingSafeEqual` length trap);
and the freshness window including non-numeric rejection. It also locks the
timestamp-unit facts (seconds header vs millisecond `event_ts`, and the ~56-year
error a millisecond reading produces). The suite then walks the fixture directory,
verifies each fixture's signature over its stored raw bytes, asserts that no real
identifier, credential, tunnel header or long opaque token ever shipped, and **logs
the fixture count** so an empty library would be visible in CI output rather than
silently green.

The reference verifier in that test file is local to the test on purpose:
`lib/zoom/*` belongs to Z1b's parallel branch, and a shared module here would
collide on merge. When Z1b lands its verifier these vectors should be re-pointed
at it and the local copy deleted — that turns a self-consistency check into a real
contract test. Recorded as an open item.

### 6.2 customerKey round trip — evidence

**Method.** Two Playwright Chromium contexts joined one spike meeting as
license-free guests through the Meeting SDK Component View (the exact school-user
case), each carrying a distinct `customerKey` in UUID-sans-hyphens form (§4).
Repeated on a second meeting with one **signed-in** joiner (the licensed host,
`role:1` + ZAK) alongside a signed-out guest, which supplies the signed-in half of
the comparison. Four participants across three meetings in total.

**Join worked.** This is also the functional verification of the SDK app's
Embed toggle, which was unconfirmed going in:

| Participant | Role | Time to join |
|---|---|---|
| Guest A | 0 | 3 642 ms |
| Guest B | 0 | 3 924 ms |
| Host | 1 (+ZAK) | 4 211 ms |

(Developer laptop on home fibre — a floor, not a school-hardware figure. The
protocol's B1 threshold is 20 s; these land at ~20 % of it with ~16 s of headroom
for slower machines and networks.)

**What comes back from `GET /report/meetings/{uuid}/participants`** — the field
set, verbatim, reproduced identically across two meetings:

| Field | Signed-in joiner (ZAK host) | Signed-out guest (SDK, license-free) |
|---|---|---|
| `customer_key` | ✅ exact value as sent | ✅ **exact value as sent** |
| `user_email` | the licensed host's real address (**populated**) | `""` (empty string) |
| `participant_user_id` | `CEqlVj4iQWeb5xKSCJ8-Vw` | **field absent from the row** |
| `id` | `CEqlVj4iQWeb5xKSCJ8-Vw` | `""` (empty string) |
| `user_id` | `16778240` | `16787456` — per-occurrence, NOT a stable identity |
| `name` | display name as sent | display name as sent |
| `registrant_id` | absent (no registration used) | absent |
| `join_time` / `leave_time` / `duration` | populated | populated |

Confirms §20's "email only when signed-in" and its note that
`participant_user_id` replaces the deprecated `id` — and shows that for a
signed-out guest **neither** is available.

**Bonus finding — the key is also visible live.** The SDK's in-meeting roster
(`user-added` event) carries the customerKey as `userIdentity` on each participant
object, alongside `isGuest: true` and `userRole: 0`. So attendance can be matched
*during* the meeting, not only from the post-hoc report — useful to Z7 if live
attendance display is ever wanted, and a second independent path to the same
identity if the report is delayed.

### 6.3 customerKey VERDICT

**customerKey survives the round trip, exactly as sent, and is the only identity
field that does.**

Z7's proposed hierarchy is **customerKey → registrant → email → name**. Evidence
per rung:

1. **customerKey — CONFIRMED, and load-bearing.** Returned byte-identical for all
   four participants across three meetings, for both signed-in and signed-out
   joiners. Because school users join license-free as guests, this is not merely
   the preferred rung — for them it is the **only** populated identity field.
   Recommend Z1b mint it as `user:{profile_id}`-derived and store the mapping at
   join time, so the report row can be resolved without trusting a display name.
2. **registrant — NOT EXERCISED.** These meetings used `approval_type: 2` (no
   registration), matching the plan's design: platform join issues credentials
   directly and never registers anyone. The rung stays in the hierarchy as a
   defensive fallback for meetings created outside the platform, but nothing in
   the planned flow produces a registrant, so it is untested and expected to be
   dead code in practice. Z7 should not spend effort on it before Z6 confirms a
   real registrant path exists.
3. **email — CONFIRMED PRESENT for signed-in joiners ONLY, and empty for exactly
   the population that matters.** It resolves FNE staff who join from a logged-in
   Zoom client, and is `""` for every school user. Keep the rung; do not rely on
   it.
4. **name — last resort, and genuinely last.** The display name is fully
   attacker/typo-controlled and is the only field left once the first three miss.
   Z7 must treat a name match as a *suggestion requiring facilitator
   confirmation*, never an automatic attendance write — which is what the plan's
   "attendance-suggestion panel (facilitator applies)" design already does.

**One hazard the hierarchy must not inherit:** `user_id` (e.g. `16778240`) looks
like a stable identity and is not. It differed per participant per occurrence and
is a per-meeting handle. It must not be used as a matching key.

**A second, separate finding with schema consequences — see §8.4:** the meeting
**UUID rotates per occurrence**, so a UUID captured at provision time cannot be
used to look up a later occurrence's report or recording.

---

## 7. Hardware / network field results

**Still awaiting school visits** — this section is filled by consultores executing
`docs/planning/zoom-hw-protocol.md`, and no visit has happened. The device ×
browser × network matrix from §17 and the embed go/no-go for Z3 both live here.

What changed in Z0B-2: **Part B of the protocol is no longer blocked.** It required
a test meeting and a join instrument, and both now exist:

- `/meet/diag` has a working test-join block (§2 of this document, extended by
  Z0B-2 — manual meeting number + passcode, Component View join, time-to-join
  measured automatically and folded into the copyable JSON).
- A licensed host can create `PRUEBA SPIKE` meetings on demand
  (`scripts/spikes/zoom/create-meeting.mjs`).

The protocol has been updated accordingly: Part B's ⛔ banner is replaced with
operating instructions, and the results table's B1–B4 columns are live.

**Two things the field visits no longer need to discover**, because Z0B-2 settled
them centrally:

- **The SDK app's Embed capability works.** Three SDK joins succeeded against
  in-account meetings (§6.2). A field-visit join failure is therefore a
  hardware/network result, not an account-configuration ambiguity — which is the
  distinction the protocol's "eso también es un resultado" rule depends on.
- **B1 has ~16 s of headroom on good hardware.** Joins landed at 3.6–4.2 s against
  a 20 s threshold. The field visits measure how much of that headroom P0 machines
  and school networks consume.

**Not verified here, and only verifiable in the field:** everything the protocol
exists to measure — behaviour on 4 GB dual-core Windows 10, on Chromebooks and
Android tablets, on a bad school network, CPU under load, and audio quality with a
real human on the other end. No laptop measurement substitutes for those, and the
embed verdict stays open until they are in.

---

## 8. Recording round trip and start/stop control

### 8.1 The full round trip — executed end to end

`record → claim → download → stream to Supabase (S3 multipart) → verify → trash → permanent delete`

Storage target was a **local** Supabase stack with a scratch bucket
(`zoom-recordings-spike`, 2 GB file limit mirroring §7's production ceiling).
Production storage was never touched.

**The recording.** A 6-minute synthetic meeting with a licensed host (`role:1` +
ZAK) and one guest. Zoom reported it as 12 minutes — Zoom counts from meeting start
rather than from recording start, which matters for any duration cross-check Z7
does against planned hours.

| File | Zoom-reported bytes | Stored bytes | Verify |
|---|---|---|---|
| MP4 | 2 175 742 | 2 175 742 | ✅ MATCH |
| M4A | 434 147 | 434 147 | ✅ MATCH |
| TIMELINE (JSON) | 93 | 93 | ✅ MATCH (in runs 1–2) |

Total `total_size` 2 609 982 across 3 files.

> ⚠️ **These byte counts are NOT representative of a real session and must not be
> used for capacity or cost planning.** Chromium's fake media device emits a
> static test pattern and a pure tone; AAC and H.264 are variable-bitrate, so
> near-silent, near-static input compresses to a small fraction of real content.
> The measured M4A works out to roughly 4.8 kbps, where Zoom's real mono M4A runs
> an order of magnitude higher. The plan's audio sizing rests on Z0B-1 §5, which
> measured a real es-CL TTS corpus through ffmpeg and produced the 2 h → 13.0 MB
> @16 kbps figure; nothing here supersedes that. **The honest statement is: the
> transfer pipeline is proven, the file sizes are not.** A representative size
> figure needs a recording of real speech — see open items.

**Throughput and wall time**, at a production-realistic 8 MiB part size:

| File | Parts | Wall time | Throughput |
|---|---|---|---|
| MP4 | 1 | 743 ms | 2.79 MB/s |
| M4A | 1 | 401 ms | 1.03 MB/s |

Both files are smaller than a single legal S3 part, so this run exercised the
*end-to-end path* but not the multipart state machine. A second run at a 512 KiB
part size drove the MP4 through **5 parts** (4 × 524 288 B + 78 590 B final),
completed, and HEAD-verified byte-exact at 1.11 MB/s. Production must keep ≥5 MiB
parts; the small size exists only because a synthetic recording cannot fill one.
Throughput figures are loopback-to-localhost and say nothing about Vercel→Supabase
in production.

**No disk buffering.** The Zoom response body is consumed as a web stream and
pushed part-by-part into S3; peak memory is one part. Nothing is written to disk or
`/tmp` at any point — satisfying §12 stage 3.

**Token re-fetch path exercised.** §12 stage 2 allows either the webhook payload's
`download_token` or a re-fetch. Because no webhook was delivered (§6.1), only the
**re-fetch** path ran: `GET /meetings/{uuid}/recordings?include_fields=download_access_token&ttl=3600`
returned a token, and the download authenticated with `Authorization: Bearer <token>`
→ 200. **The payload-token path is unverified.** Both are documented in §20; the one
a resumed or retried job must use is the one that was tested, which is the more
important of the two.

**Deletion.** Verify-before-delete held: HEAD size was compared to Zoom's reported
size before any destructive call, and each destructive call was preceded by a fresh
re-read of the meeting proving its topic starts with `PRUEBA SPIKE`.

```
DELETE …/recordings/{fileId}?action=trash   → 204
DELETE …/recordings/{fileId}?action=delete  → 204
GET    …/recordings                         → 404 {"code":3301,"message":"Esta grabación no existe."}
```

Both semantics confirmed. The final 404 distinguishes cleanly from the
*"aún se está procesando"* 3301 seen while Zoom was still encoding — same code,
different message, so **code 3301 alone is not a "no recording" signal** and Z4
must read the message or treat 3301 as retryable.

**Ordering defect found.** The script deleted per file — transfer, verify, trash,
delete, next file — and the TIMELINE file's `download_url` then returned **404 with
an HTML error page** after its MP4 and M4A siblings had been deleted. It had
downloaded fine in the two earlier runs. **Z4 must transfer and verify every file
in a recording BEFORE deleting any of them**, rather than interleaving. Left as
found rather than papered over, because the interleaved order is the one a naive
per-file job would choose.

**Cloud recording capacity confirmed.** The freed storage worked: the account
recorded successfully on the first attempt. No quota error at any point.

### 8.2 Partial-upload recovery

The transfer was killed mid-stream after 2 parts, deliberately without aborting the
S3 upload, and then inspected:

| Probe | Result |
|---|---|
| `ListParts` after the kill | 200 — server retains **both** parts with their ETags |
| Part sizes reported by `ListParts` | **`Size: 0` for every part** (Supabase quirk — the sizes are wrong, the ETags are right) |
| `HeadObject` on the target key | **404 — the object does not exist** |

**What resume requires**, concretely:

1. **The object is invisible until `CompleteMultipartUpload`.** A crashed transfer
   leaves no partial object, so the verify step can never observe a truncated file
   and mistake it for a complete one. This is a genuinely helpful property: it
   makes verify-before-delete safe against crashes for free.
2. **Resume state must be persisted by the job, not discovered from storage.**
   Supabase's `ListParts` returns `Size: 0`, so a resuming worker cannot recompute
   its byte offset from the server's view. It must have durably recorded
   `{storage key, uploadId, partNumber → ETag, bytes consumed}` before each part —
   which maps onto the `zoom_recording_files.transfer_status` machine the plan
   already specifies, with the addition that `uploadId` and the part list need
   somewhere to live.
3. **Zoom-side resume is a re-download, not a range request.** The download was not
   resumed from an offset; a resuming job re-fetches (with a re-fetched token if the
   old one expired) and re-streams the parts it has not yet uploaded. Whether
   Zoom's download endpoint honours HTTP Range was **not tested** — worth knowing
   before Z4 commits to a resume strategy for large files.
4. **Dangling uploads need a sweeper.** An abandoned `uploadId` persists until
   aborted. `AbortMultipartUpload` works (used to clean up after the probe), but
   nothing expires it automatically, so a crash-loop would accumulate orphaned
   multipart state.

### 8.3 Recording start/stop control — the §12 mechanism

**(a) The consent-gated enablement PATCH, read-back confirmed.**

| Step | Result |
|---|---|
| Provisioned effective `auto_recording` | `"none"` ✅ (§8 invariant holds) |
| `PATCH /meetings/{id}` `settings.auto_recording:"cloud"` | **204, empty body, no `content-type`** |
| Read-back via `GET /meetings/{id}` | `"cloud"` — enablement confirmed |
| `PATCH` back to `"none"` | 204; read-back `"none"` |

**The read-back is not belt-and-braces — it is the only confirmation that exists.**
The PATCH returns 204 with no body whatsoever, so a caller that trusts the status
code has learned nothing about the effective value. §12's insistence on
"response read back and confirmed" is load-bearing, and now evidenced.

Two further behaviours worth having in writing:

- **An unrecognised `auto_recording` value returns 204 and silently coerces to
  `"none"`** — tested from both `"none"` and `"cloud"` starting states. The failure
  direction is fail-safe: a typo can only ever turn recording **off**, never on. It
  cannot, however, be detected from the status code, which is another argument for
  the read-back.
- **`PATCH {settings:{}}` is a true no-op** — it preserves `"cloud"` rather than
  clearing it, so partial setting PATCHes do not clobber unrelated settings.

**(b) Stopping a running recording.**

The plan left the mechanism open: "Zoom live-meeting control API vs facilitator SDK
action + webhook confirmation". Measured against a live, actively-recording meeting:

| Call | Result |
|---|---|
| `PATCH /live_meetings/{id}/events` `{method:"recording.stop"}` | **202 Accepted** |
| `PATCH …` `{method:"recording.start"}` | **202 Accepted** |
| `PATCH …` `{method:"recording.stop"}` again | **202 Accepted** |

And the read-back question:

| Probe | Result |
|---|---|
| `GET /live_meetings/{id}` | 404 — *"This API endpoint is not recognized"* (does not exist) |
| `GET /live_meetings/{id}/events` | 404 — write-only endpoint |
| `GET /meetings/{id}` | 200, but the only recording field is the **configured** `auto_recording`, not live state |
| `GET /metrics/meetings/{id}?type=live` | scope-blocked (`dashboard:read:meeting:admin`) |

**The stop demonstrably took effect** — established after the fact from the
recording's own segment boundaries, which is the strongest evidence available
without the webhook. The meeting's recording listing came back with **six files:
two complete sets**, each with its own time range:

| Segment | Files | `recording_start` → `recording_end` |
|---|---|---|
| 1 | MP4 357 003 B · M4A 68 147 B · TIMELINE 93 B | 23:11:16 → **23:13:14** |
| 2 | MP4 35 170 B · M4A 6 483 B · TIMELINE 21 B | **23:13:30** → 23:13:40 |

Segment 1 ends within seconds of the `recording.stop` call and segment 2 begins
within seconds of the `recording.start` that followed it. So the 202 was not merely
accepted-and-forgotten: recording actually stopped and actually resumed, on demand,
server-side. This narrows the unverified gap in §8.4 to the *arrival of the
confirmation event* rather than the *effect of the call*.

#### A consequence for the pipeline: one meeting can yield N recording segments

Each start/stop cycle produced a **separate, complete file set under the same
meeting UUID** — its own MP4, M4A and TIMELINE, with its own start/end. §12's
pipeline is written in the singular ("claim recording file", "transcode M4A →
Opus", "transcribe"), and the late-decline flow *deliberately stops and may
resume* recording, so producing multiple segments is not an edge case here — it is
the expected output of the very flow §12 designs.

Consequences Z4/Z5 must absorb:

- The transfer job iterates **file sets**, not files, and must store each segment
  distinctly (`zoom_recording_files` already keys on the Zoom file id, so the table
  shape survives; the *job* logic and the playback UI are what assume one file).
- Transcription must handle a **fragmented timeline**: two M4A files covering
  disjoint intervals, with a gap where recording was off. Concatenating them
  silently would fabricate continuity across a period that was deliberately not
  recorded — which in a consent-driven stop is precisely the period someone
  refused. The gap is meaningful and must survive into the transcript.
- The minuta prompt therefore consumes sanitized text that may be discontinuous,
  and the notice/audit trail should be able to say why.

### 8.4 VERDICT — the mechanism Z4/Z5 build the late-decline flow on

**Use the Live Meeting Controls API (`PATCH /live_meetings/{id}/events` with
`method: "recording.stop"`), server-side. It works with no facilitator action, and
recording can be restarted the same way.** That settles §12's open question in
favour of the API over a facilitator SDK action.

**But the confirmation half is forced, and this is the consequential part:**

- `202 Accepted` means *queued*, not *stopped*. It is not confirmation.
- **There is no read-back of live recording state at all.** The two plausible
  endpoints do not exist, and the configured-setting field on `GET /meetings/{id}`
  answers a different question.

Therefore **the `recording.stopped` webhook is the only possible confirmation
signal**, and §12's late-decline flow ("issue the credentials only after the stop
is confirmed") is **necessarily webhook-dependent — there is no polling
alternative.** Two consequences the plan should absorb:

1. **The webhook subscription becomes a correctness dependency of the consent
   system**, not merely an observability one. §18's runbook already covers
   re-validation every 72 h and disablement after 6 failures; that runbook is now
   protecting a privacy control, and should say so. If the subscription is down,
   the platform cannot confirm a stop, and the safe behaviour is to keep holding
   the join credentials.
2. **A timeout policy is needed.** Since confirmation can never arrive if webhooks
   are broken, the flow needs a defined answer for "stop requested, no
   `recording.stopped` after N seconds". The fail-safe choice is to keep credentials
   held and surface it to the facilitator — never to release on a timer.

✅ **Both halves are now verified.** The *effect* of the stop is measured from the
recording's own segment boundaries (above). And after Brent validated the webhook
subscription mid-run, the confirmation event was **observed directly**:
`recording.stopped` was delivered **twice**, each time within ~1 s of the
corresponding `recording.stop` API call, signature-verified (§6.1). The
`recording.started` events bracket them, so the full
start → stop → start → stop cycle is visible in the event stream.

So the late-decline flow has the confirmation signal it needs, and §8.4's verdict
rests on measurement rather than on §20's documented event list. The architectural
constraint stands unchanged and is now fully evidenced: **the webhook is the only
confirmation path** — 202 is not confirmation, no read-back exists — so the
subscription's health is a correctness dependency of the consent system, and the
"stop requested, no `recording.stopped` after N seconds" timeout policy still has
to fail safe by keeping join credentials held.

---

## 9. Gate G2 — consent-report retrieval

**Question** (§12): are the in-client recording-disclaimer consent events
retrievable via API or a scheduled portal export? G1 already FAILED (FNE is on
**Pro**; disclaimer-text customization and consent reporting require
Business/Education/API/Enterprise with ≥100 licenses — §20, KB0068402), so §12's
link-out backstop stays closed regardless of this answer. The purpose here is to
make the verdict **citable** rather than inferred from a pricing page.

### 9.1 The disclaimer was real, and a participant really clicked it

The account-level disclaimer is ON and locked, and it appeared for every
participant in every recorded spike meeting. Captured verbatim (es-ES — §20 notes
the SDK has no es-CL):

**Participant disclaimer** (guest, `role:0`) — controls offered were
**"Lo tengo"** / **"Salir de la reunión"**, and the guest clicked "Lo tengo":

> La reunión se está grabando
> Al seguir adelante con esta reunión está dando su consentimiento a ser grabado.
> El propietario de cuenta y el anfitrión pueden ver las grabaciones en la nube de
> Zoom y cualquier participante con permiso puede grabar en su dispositivo local.
> Estas personas pueden compartir estas grabaciones con aplicaciones y otros.

**Host confirmation** (`role:1`) — a *different*, separate dialog
("Continuar" / "Cancelar"):

> Grabar esta reunión?
> Al continuar, todas las caras, conversaciones y comparticiones de pantalla se
> grabarán en la nube.

**This text independently confirms G1's consequence, which the plan had asserted
from the entitlement docs alone.** The standard participant disclaimer evidences
consent to **being recorded** and nothing else — it says nothing about
speech-to-text transcription or AI processing. §12's rule that "without custom
text, the standard disclaimer evidences `recording` only, NOT
`transcription`/`ai_processing`" is now backed by the rendered string, not just by
KB0068402. That is a stronger footing for the dossier than the plan previously had.

Note also that the disclaimer is a **post-join** interruption for guests, not a
pre-join gate: the guest had already joined (`state=joined`) when it appeared. The
platform's own pre-join consent capture (§12) is therefore doing genuinely
different work, not duplicating Zoom's.

### 9.2 Retrieval attempts — the full list

Every endpoint that could plausibly carry per-participant consent evidence, probed
against a meeting where the disclaimer was displayed and clicked. Response bodies
were searched case-insensitively for `consent`, `consentimiento`, `disclaimer`,
`agree`, `acknowledg`, `acceptance`, `accepted_at`, `recording_consent` — over the
whole raw JSON, so an undocumented or nested field could not be missed by checking
known key names only.

All 13 scopes were granted by Brent mid-run, so **every probe ran — none is
scope-blocked**. A distinction the probe now enforces in code, because conflating
the two would have produced a false PASS: a marker word appearing *anywhere* in a
body is not evidence. The settings endpoints legitimately contain the strings
"consent" and "disclaimer" as **configuration field names**. Evidence requires a
marker on a record that identifies a **person**, so the probe only counts hits
inside participant-shaped rows.

| # | Endpoint | Result | Per-participant consent evidence |
|---|---|---|---|
| 1 | `GET /report/meetings/{uuid}/participants` | 200 | **None** — 2 rows, no consent field (full field list in §6.2) |
| 2 | `GET /report/meetings/{uuid}` | 200 | **None** |
| 3 | `GET /past_meetings/{uuid}/participants` | 200 | **None** — 2 rows, no consent field |
| 4 | `GET /meetings/{uuid}/recordings` | 200 | **None** — nothing on the recording artifact |
| 5 | `GET /report/activities` | 200 | **None** — 2 activity rows, no consent field |
| 6 | `GET /report/cloud_recording` | 200 | **None** |
| 7 | `GET /meetings/{id}/recordings/analytics_details` | 200 | **None** |
| 8 | `GET /users/{host}/settings` | 200 | **None** — marker words present as CONFIG names only |
| 9 | `GET /accounts/me/settings` | 200 | **None** — marker words present as CONFIG names only |
| 10 | `GET /metrics/meetings/{uuid}/participants` (Dashboard) | 400 | ⛔ **ENTITLEMENT**: *"only available for ZMP and Business or higher accounts that have enabled the Dashboard feature"* |
| 11 | same, `include_fields=registrant_id` | 400 | ⛔ same entitlement wall |
| 12 | `GET /metrics/meetings/{uuid}` | 400 | ⛔ same entitlement wall |
| 13 | `GET /archive_files` (Archiving API) | 400 | ⛔ **ENTITLEMENT**: *"Not available for this account"* |

**9 answered 200. 6 participant rows inspected across them. Zero consent fields on
any row.** The four that did not answer are blocked by **tier entitlement, not by
scope** — which is a stronger negative result than a missing scope: it is not "we
did not ask", it is "this account tier cannot use these APIs at all".

Reproducible: `node scripts/spikes/zoom/g2-consent-probe.mjs <meetingId> <meetingUuid>`.

### 9.3 G2 VERDICT

**G2 = FAIL. Definitive.**

- Every one of the 13 endpoints was probed with full scopes granted. Nine answered;
  none carries per-participant consent evidence, including the two most plausible
  carriers — the participants report (which *does* carry `customer_key`, proving it
  can hold per-person platform data) and the recording artifact itself.
- The remaining four are **entitlement-blocked on Pro**: the entire Dashboard API
  family and the Archiving API are unavailable to this tier. Consent reporting is
  gated by the same class of entitlement as disclaimer customization (KB0068402,
  G1), and this is that gate showing up empirically in three separate endpoints.
- No portal export offering consent data was found.

**No consequence changes.** §12's backstop was already closed by G1: link-out-mode
recording stays DISABLED, and in SDK mode an unidentified participant in a recorded
meeting makes that recording ineligible for transfer. G2 failing confirms the
architecture the plan already chose; nothing depends on it passing.

### 9.4 ⚠️ Separate finding: the Settings API does NOT report the disclaimer state

Discovered while confirming the disclaimer was on. Both levels report it **off**:

| Setting | API value |
|---|---|
| `recording.recording_disclaimer` (user level) | **`false`** |
| `recording.recording_disclaimer` (account level) | **`false`** |
| `recording.recording_notification_for_zoom_client.ask_host_to_confirm` | **`false`** |
| `recording.auto_recording` (both levels) | `"none"` ✅ accurate |
| `recording.cloud_recording` | `true` ✅ accurate |

Yet the participant disclaimer **demonstrably appeared and had to be clicked** in
every recorded spike meeting — its verbatim text is in §9.1 — and the host
**demonstrably got** a separate "Grabar esta reunión? Continuar/Cancelar"
confirmation. So both `recording_disclaimer` and `ask_host_to_confirm` read `false`
while the behaviour they name is active.

This spike does not establish *why* (the dialogs may be driven by an
account-level lock the API does not surface, by a regional/organisational policy, or
by Zoom having made the consent dialog mandatory for cloud recording irrespective of
the toggle). What it establishes is the operational fact:

> **`recording_disclaimer` from the Settings API is not a usable signal for
> "is the disclaimer in force".**

**Consequence for the plan, and it is not cosmetic.** §12 states *"Settings drift
(disclaimer found off) always triggers the ineligible rule"*, and §18's quarterly
audit checklist includes verifying the disclaimer. If either is implemented by
reading `recording_disclaimer`, it will read `false` **always** — so the drift
check either permanently marks every recording ineligible for transfer (disabling
the pipeline) or, if someone "fixes" it by inverting the test, provides false
confidence. Either way it is non-functional as specified.

What IS reliably checkable, and should carry the audit: **`auto_recording` is
accurate at both levels** (`"none"`), which is the §18 item that actually protects
the consent gate ("account-level auto-recording verified OFF and not locked-on").
The disclaimer's presence needs a different verification method — a periodic manual
check in the portal, or a human-observed join — and §18 should say so rather than
implying an API check exists.

---

## Open items handed forward

| # | Item | Owner |
|---|---|---|
| 1 | NER cold start on Vercel — unmeasured; measure via a separate Vercel project (§4.7). **Z0B-2 did not attempt this**: it needs a throwaway Vercel project that does not exist, and creating/deploying one is out of scope (no deployments) | Z5 |
| 2 | Re-measure NER precision on **accented** text before enabling the layer (§4.4) | Z5 |
| 3 | Node-only adversarial recall is 78.8%, below the plan's ≥90% target (§3.2). The target predates measurement; §4 shows the cost of closing it | PM decision |
| 4 | Re-score both suites against real Whisper output once a recording exists (§3.4). **Z0B-2 skipped this**: no `OPENAI_API_KEY` exists in the repo's `.env.local`, and the chunk was instructed not to ask for one. A recording now exists, so the blocker is purely the key | Z5 |
| 15 | ~~Webhook payload capture~~ — **CLOSED in-run** (§6.1): subscription validated; real header set, timestamp unit and skew measured; **all 7 subscribed events captured** and signature-verified against live traffic; ≥500 retry schedule measured at 304 s with an identical body (§6.1.1); **7-fixture redacted library committed** (§6.1.2) | Closed 2026-07-30 |
| 16 | ~~Confirm `recording.stopped` actually arrives~~ — **CLOSED** (§8.4): observed twice, each within ~1 s of the `recording.stop` call, signature-verified. The late-decline design's confirmation signal is measured | Closed 2026-07-30 |
| 17 | ~~G2 is provisional~~ — **CLOSED** (§9.3): all 13 endpoints probed with full scopes, 9 answered, zero per-participant consent evidence, 4 entitlement-blocked on Pro. **FAIL is definitive** | Closed 2026-07-30 |
| 18 | **Meeting UUID rotates per occurrence (§6.3, §8)** — a UUID captured at provision time is stale for any later occurrence. `zoom_internal.zoom_meetings.uuid` must be occurrence-aware, populated from `meeting.started`, not from the create response | **Z1b — schema consequence** |
| 19 | **Transfer-then-delete ordering (§8.1)** — deleting files one at a time breaks the remaining files' `download_url`. Transfer and verify every file, then delete | **Z4** |
| 20 | **Resume state must be job-persisted (§8.2)** — Supabase `ListParts` returns `Size: 0`, so a worker cannot recompute its offset from storage; `uploadId` + part/ETag list need a durable home. Also untested: whether Zoom's download endpoint honours HTTP Range | **Z4** |
| 21 | **Recording byte sizes are not representative (§8.1)** — synthetic media compresses ~10× smaller than real speech. A real-speech recording is needed before any storage-cost figure is quoted from §8 | Z4 / Z5 |
| 22 | **`@zoom/meetingsdk@6.2.0` pins `peer react@18.2.0` exactly** (repo runs 18.3.1) and its CDN bundle treats React/ReactDOM as externals. Z3 must choose: pin React 18.2.0, use `overrides`/`--legacy-peer-deps`, or load Zoom's own vendor React globals as `/meet/diag` now does | **Z3** |
| 23 | **Re-point the webhook signature vectors at Z1b's real verifier** and delete the test-local reference implementation (§6.1), turning a self-consistency check into a contract test | Z1b |
| 24 | `supabase/config.toml` gained `[storage]`+`[storage.s3_protocol]` on this branch while `feat/zoom-core` adds `[api]` to the same file — **sequence the merge** | PM |
| 25 | **One meeting can yield N recording segments (§8.3)** — each start/stop cycle emits a complete file set (MP4+M4A+TIMELINE) under the same meeting UUID. The transfer job must iterate file SETS, and transcription must preserve the gap between them rather than concatenating across a period that was deliberately not recorded | **Z4 / Z5** |
| 26a | **`recording_disclaimer` from the Settings API is not a usable signal (§9.4)** — it reads `false` at user AND account level while the disclaimer demonstrably appears and must be clicked. §12's "settings drift (disclaimer found off)" rule and §18's audit checklist cannot be implemented against it; `auto_recording` IS accurate and should carry the audit instead | **PM / Z4 / §18** |
| 26d | **A Zoom webhook's sensitive surface is wider than the documented fields (§6.1.2)** — a top-level `download_token`, a nested ~98-char `recording_play_passcode`, and the S2S Client ID in a `clientid` REQUEST HEADER are three different shapes in three places. `zoom_webhook_events.raw_payload` stores all of it; the 30-day nulling in §6 is doing more work than it looks | **Z1b / Z4** |
| 26e | **Dedupe must key on the BODY only (§6.1.1)** — across a retry the body and `x-zm-request-id` are identical but the timestamp and signature both change, so a key derived from the signed string `v0:{ts}:{body}` would double-process every retry. §6's `sha256(raw body)` is correct as written | Z1b |
| 26b | `x-zm-request-timestamp` is epoch **SECONDS** while body `event_ts` is **milliseconds** (§6.1) — this spike assumed milliseconds and was wrong; corrected in the receiver, the vectors and the fixture generator. Z1b's verifier must not repeat it | Z1b |
| 26c | **A re-serializing verifier passes every live payload** (§6.1) — every real body Zoom sent was already canonical JSON, so live traffic cannot demonstrate the raw-body rule. Keep the constructed vector as the gate | Z1b |
| 26 | Zoom-side residue: the stop-control meeting's recording (~0.45 MB, 2 segments) was **left in place on purpose** so the G2 probes can be re-run against a meeting with a genuine disclaimer click. Delete it once G2 is settled | Z0B-2 follow-up |
| 5 | Merge trailing sub-30 s segment in the multi-segment fallback (§5.2) | Z5 |
| 6 | Verify the executable bit survives `outputFileTracingIncludes` tracing (§5.3) | Z5 |
| 7 | `/meet/diag` has no automated test; e2e for `/meet` belongs to Z1c (§2) | Z1c |
| 8 | ~~Cross-entry token coverage still preserves `Camila Pérez` when the roster holds `Camila Fuentes` **and** `Rodrigo Pérez`~~ — **CLOSED** in Z0B-1r2 by segment classification (`node-1.2.0`, §3.5.1): coverage is per roster entry, spans are classified as segments, and the connector-merged undercount (D2) closed with it | Closed 2026-07-29 |
| 9 | ~~Role-pattern marks any token after a role noun (D3); punctuation-joined people share a segment (D4, v1.2's residual R3)~~ — **CLOSED** in Z0B-1r3 (`node-1.3.0`, §3.5.2) by the name-plausibility filter and the gap-punctuation split. Residuals now R1 + R2 only, plus the accepted inverted-unknown overcount; documented in §3.5.2 and in the module header | Closed 2026-07-29 |
| 10 | ~~**The honorific layer carries D3's defect** — `HONORIFICS` marks whatever follows regardless of wordiness, so `La profesora terminaba…` → `La profesora [persona 1]…` (§3.5.2)~~ — **CLOSED** in Z0B-1r4 (`node-1.4.0`, §3.5.3). The honorific layer was one of four instances of a single defect CLASS (trigger-adjacent marking without gap discipline or name plausibility); r4 closed the class with three uniform guards — G1 gap discipline on every trigger layer, G2 one shared plausibility predicate, G3 a left-extension veto — plus a MARKING-PATH AUDIT in the module header that states, per path, which guards bound it. The precision corpus gained the honorific, cross-sentence, sentence-initial-verb and course+institution constructions it lacked | Closed 2026-07-29 |
| 11 | ~~**Trigger and structural lexicon tokens are themselves eligible as name material** — a title-case `Sra`/`Profesora`/`Alumna`/`Quinto`/`Dr` self-marks, a sentence-initial `Doña` is absorbed by left-extension, and the fused span then fails roster coverage, DESTROYING the attendee beside it~~ — **CLOSED** in Z0B-1r5 (`node-1.5.0`, §3.5.4) by G4 (a candidacy veto over `HONORIFICS ∪ ROLE_NOUNS ∪ COURSE_WORDS ∪ ABBREVIATIONS`, applied on every marking path including cross-reference) and G4′ (`NON_PERSON_PROPER` at course sites only). Every lexicon in the module now has an explicit, tested candidacy relationship in the header table. Priced costs: R4 (course-only month-named student) and R5 (lexicon-token surname residue) | Closed 2026-07-29 |
| 12 | ~~**Title-case role titles OUTSIDE every lexicon still become people** — `La Sra. Directora confirmó…` → `La Sra. [persona 1] confirmó…`, a person invented out of a job title; the attendee variant `La Directora Marcela` destroys the roster name~~ — **CLOSED** in Z0B-1r6 (`node-1.6.0`, §3.5.5) by **F12**: `SCHOOL_REGISTER_TITLES` (11 stems × 4 inflections, collision-audited member by member, nothing dropped and no carve-out needed) gets the v1.5 `jefe`/`jefa` treatment — vetoed as candidates by G4, active as triggers, so `la directora Marcela` and the lowercase `la docente antonia` are now caught. Compound-title adjectives (`pedagógica`, `general`, `administrativa`, `subrogante`…) joined `COMMON_WORDS` as cost containment. Priced cost: residual **R6** (open-world titles) | Closed 2026-07-29 |
| 13 | ~~**Short preterites under the ending-filter length floor produce false people** — `la profesora dejó la pauta…` → `la profesora [persona 1] la pauta…`; `dejó` is 4 characters and the floor was a global 5, so the `ó` marker was never tested~~ — **CLOSED** in Z0B-1r6 (`node-1.6.0`, §3.5.5) by **F13**: the floor is now per-ending. `ó` drops to 3 on an audit (no es-CL given name — and no short es-CL surname, which matters because G3 runs this filter on capitalized extension candidates — ends in accented `-ó`); every other ending keeps the 5-character `juan`/`ivan` floor, and the contract suite locks both sides so the row cannot be quietly generalised | Closed 2026-07-29 |
| 14 | ~~**The numeric branch of `looksLikeCourse` is unreachable**, and the course-code letter `B` is itself name material, so `de 5°B, Antonia` emits `de 5°[persona 1], [persona 2]` — mangled course code, count inflated~~ — **CLOSED** in Z0B-1r6 (`node-1.6.0`, §3.5.5) by **F14**: a single-letter token with `\d{1,2}\s*[°º]` behind it is a course-code letter — never name material (it joins the G4 family) and a genuine `looksLikeCourse` trigger, so the course patterns fire from `5°B` for the first time; `COURSE_NUMERIC_RE` and the dead forward lookahead are removed. Same-class instance found and fixed with it: `º` (U+00BA) is `\p{L}`, so `1ºA` tokenized as the word `ºA` and redacted — `WORD_RE` now excludes both ordinal indicators | Closed 2026-07-29 |

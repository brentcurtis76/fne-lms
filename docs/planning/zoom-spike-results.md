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
> **Structure is append-only by design.** Chunk Z0B-2 adds the credentialed
> sections (§6–§9) and the field visits fill in §7. Do not renumber sections —
> the hardware protocol and the plan's §15 row reference them.

| Section | Spike | Chunk | Status |
|---|---|---|---|
| §1 | Permissions-Policy override for `/meet` | Z0B-1 | ✅ Verified |
| §2 | `/meet/diag` capability probe | Z0B-1 | ✅ Built |
| §3 | Sanitizer required Node layer | Z0B-1 (+Z0B-1r, Z0B-1r2) | ✅ Measured; preservation rule tightened §3.5, sealed by segment classification §3.5.1 |
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

Current version **`node-1.5.0`**, after five remediation rounds recorded in
§3.5 → §3.5.4. r4 closed the *trigger-reach* class (where a trigger may mark).
**Z0B-1r5 closes the complementary question r4 never asked — may the trigger
token ITSELF be marked?** — and the answer had been yes on three paths at once,
which is how capitalized titles ("Sra", "Profesora", "Doña", "Alumna") and
course vocabulary ("Quinto", "Básico") were fusing into person spans and
destroying the ATTENDEES standing beside them. Every lexicon in the module now
has an explicit, tested relationship to name candidacy (§3.5.4). Residual list:
R1, R2, the two priced costs of this round (R4, R5), the accepted
inverted-unknown overcount and the plan-sanctioned adversarial misses.

### 3.1 Must-catch suite — BLOCKING

53 cases, 56 mentions of explicit student references: role nouns
("la estudiante X"), honorifics (don/doña, Sra., profe, tía), course
designations ("de 5°B, Antonia"), bare capitalized names, compound names,
repeat mentions, the 11-case attendee-collision family built across Z0B-1r
(§3.5) and Z0B-1r2 (§3.5.1), the 3-case segment-split family plus the
lowercased role-noun name added in Z0B-1r3 (§3.5.2), the 3-case **guard-cost**
family added in Z0B-1r4 (§3.5.3) — the cases that prove the trigger-gap and
plausibility guards did not buy precision with recall — and the 13-case
**trigger-token-candidacy** family added in Z0B-1r5 (§3.5.4).

**Result: 56/56 — 100%** (26/26 shipped in Z0B-1; +5 cases / 5 mentions in
Z0B-1r; +7 cases / 9 mentions in Z0B-1r2; +3 cases / 6 mentions in Z0B-1r3;
+3 cases / 4 mentions in Z0B-1r4; +13 cases / 6 mentions in Z0B-1r5).

The r5 family is deliberately **preserve-weighted**: 13 cases carrying only 6
new mentions but 12 new `mustPreserve` assertions. That ratio is the shape of
the defect it guards — r5's instances redacted the right mention for the wrong
reason and destroyed an attendee doing it, so a recall-only score saw nothing.
Suite-wide there are now **30 `mustPreserve` assertions against 56 mentions**;
three rounds running, the thing that hid the defect was an assertion the suite
did not make, not a case it did not contain.

Enforced as ordinary vitest assertions, so a miss is a failing test and a red
build. There is no threshold to tune: the repo's student-PII rule is absolute
and a sanitizer miss is a defect, not an accepted rate.

The suite also asserts what must **survive**: attendee full names, attendees
referred to by first name only, roster names in inverted order, institution
names (`Colegio San Mateo`, `Fundación Nueva Educación`), and — new in r5 —
the **title beside a redacted name** (`la Sra. [persona 1]`, `La Alumna
[persona 1]`, `El Dr. [persona 1]`).

### 3.2 Adversarial suite — MONITORING, no threshold asserted

30 cases, 33 mentions. Recall is computed and printed by the test; nothing is
gated on it.

**Node-only recall: 78.8% (26/33).** Re-measured unchanged after the Z0B-1r
preservation-rule change, after the Z0B-1r2 segment-classification change, after
the Z0B-1r3 role-pattern filter + punctuation split, after the Z0B-1r4 class
closure, and after the Z0B-1r5 candidacy closure (§3.5): identical 26/33 six
times over, same seven misses, same
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

**1731 words / 34 paragraphs** of realistic name-free consulting-session speech,
which must come through **byte-identical**. Four blocks: the original 594 words
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
role words (`La Educadora de Kinder`, `el Asistente de la sala chica`).

Honorific-*addressed* people are deliberately **not** here. "La Sra. Elena" is
name-bearing, so it belongs in a suite that asserts a redaction, not in a corpus
that asserts zero; the r5 attendee cases live in must-catch (mc-41…mc-44).

**Result: 0 redactions, 0 persons, status `sanitized`** (density 1.62 < 2.0) —
unchanged after the Z0B-1r rule change, the Z0B-1r2 segment-classification
change, the Z0B-1r3 role-pattern filter, the Z0B-1r4 class closure and the
Z0B-1r5 candidacy closure (§3.5); byte-identical output on every paragraph and
on the joined corpus, six measurements running. The original block contains no
name spans at all, so nothing in it reaches the preservation decision; the r3,
r4 and r5 blocks reach the *detection* decision on every sentence, which is the
point of them.

Every one of the six r4 paragraphs was **reproduced as a redaction on
`fce2476` before the guards landed** — 5 of 6 damaged, 12 redactions, and the
joined corpus at density 2.52 → status **`flagged`**. All three r5 paragraphs
were likewise **reproduced as redactions on `a9f6f87`** — 3 of 3 damaged, 8
redactions read paragraph-by-paragraph, and the joined 34-paragraph corpus at
**20 redactions / 8 persons / density 2.77 → status `flagged`**. (The joined
figure exceeds the per-paragraph sum because cross-reference propagates a
marked `Profesora`/`Educadora`/`Básico` across the whole corpus once any single
paragraph marks it — which is itself a measure of how far one fused title
travels.) A blocking corpus that cannot reach a construction cannot guard it,
and this is now the **fourth round running** in which the gap in the corpus, not
the gap in the code, is what let a defect survive.

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

Beyond recall, 76 unit tests cover the properties the pipeline depends on:

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
| 8 | ~~Cross-entry token coverage still preserves `Camila Pérez` when the roster holds `Camila Fuentes` **and** `Rodrigo Pérez`~~ — **CLOSED** in Z0B-1r2 by segment classification (`node-1.2.0`, §3.5.1): coverage is per roster entry, spans are classified as segments, and the connector-merged undercount (D2) closed with it | Closed 2026-07-29 |
| 9 | ~~Role-pattern marks any token after a role noun (D3); punctuation-joined people share a segment (D4, v1.2's residual R3)~~ — **CLOSED** in Z0B-1r3 (`node-1.3.0`, §3.5.2) by the name-plausibility filter and the gap-punctuation split. Residuals now R1 + R2 only, plus the accepted inverted-unknown overcount; documented in §3.5.2 and in the module header | Closed 2026-07-29 |
| 10 | ~~**The honorific layer carries D3's defect** — `HONORIFICS` marks whatever follows regardless of wordiness, so `La profesora terminaba…` → `La profesora [persona 1]…` (§3.5.2)~~ — **CLOSED** in Z0B-1r4 (`node-1.4.0`, §3.5.3). The honorific layer was one of four instances of a single defect CLASS (trigger-adjacent marking without gap discipline or name plausibility); r4 closed the class with three uniform guards — G1 gap discipline on every trigger layer, G2 one shared plausibility predicate, G3 a left-extension veto — plus a MARKING-PATH AUDIT in the module header that states, per path, which guards bound it. The precision corpus gained the honorific, cross-sentence, sentence-initial-verb and course+institution constructions it lacked | Closed 2026-07-29 |
| 11 | ~~**Trigger and structural lexicon tokens are themselves eligible as name material** — a title-case `Sra`/`Profesora`/`Alumna`/`Quinto`/`Dr` self-marks, a sentence-initial `Doña` is absorbed by left-extension, and the fused span then fails roster coverage, DESTROYING the attendee beside it~~ — **CLOSED** in Z0B-1r5 (`node-1.5.0`, §3.5.4) by G4 (a candidacy veto over `HONORIFICS ∪ ROLE_NOUNS ∪ COURSE_WORDS ∪ ABBREVIATIONS`, applied on every marking path including cross-reference) and G4′ (`NON_PERSON_PROPER` at course sites only). Every lexicon in the module now has an explicit, tested candidacy relationship in the header table. Priced costs: R4 (course-only month-named student) and R5 (lexicon-token surname residue) | Closed 2026-07-29 |
| 12 | **Title-case role titles OUTSIDE every lexicon still become people** — `La Sra. Directora confirmó…`, `La Coordinadora pidió…`, `El Inspector avisó…`. `directora`/`coordinadora`/`inspector`/`rectora` are in no lexicon, so the capitalization layer marks them `high` and emits `La Sra. [persona 1] confirmó…`. **Different class** from r5 (these are not lexicon members, so G4 cannot reach them) — it is the general capitalized-unknown-word behaviour, deliberate by §12 but visibly wrong on role vocabulary. Widening `ROLE_NOUNS`/`HONORIFICS` would fix it and is a recall/precision trade, not a bug fix, so it is handed forward rather than taken | PM decision |
| 13 | **Short preterites under the ending-filter length floor produce false people** — `la profesora dejó la pauta…` → `la profesora [persona 1] la pauta…`. `dejó` is 4 characters and `MIN_ENDING_FILTER_LENGTH` is 5 (the floor exists to protect `juan`/`ivan` from the `an` ending), so the `ó` preterite marker is never tested. Reproduces on `a9f6f87` and on `node-1.5.0` identically after any role noun or honorific. **Different class** from r5 (a morphology-filter floor, not lexicon candidacy). Candidate fix: a per-ending floor — no es-CL given name ends in accented `ó`, so that ending alone could drop to a 3-character floor. Not taken this round | Z0B-2 / next round |
| 14 | **The numeric branch of `looksLikeCourse` is unreachable** — `WORD_RE` matches letter-initial runs only, so a pure-digit token never exists and `COURSE_NUMERIC_RE.test(token.raw)` can never be true. `de 5°B, Antonia` is caught by the capitalization layer, not by course-pattern; the `°` lookahead is dead code. Related artifact: the course-code letter `B` is itself marked, so `de 5°B, Antonia` emits `de 5°[persona 1], [persona 2]` — an extra person in the §6 density metric (overcount, safe direction) and a mangled course code in the minuta. Pre-existing, unrelated to r5's class | Z0B-2 / next round |

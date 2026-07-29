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

### 3.1 Must-catch suite — BLOCKING

34 cases, 40 mentions of explicit student references: role nouns
("la estudiante X"), honorifics (don/doña, Sra., profe, tía), course
designations ("de 5°B, Antonia"), bare capitalized names, compound names,
repeat mentions, and the 12-case attendee-collision family built across Z0B-1r
(§3.5) and Z0B-1r2 (§3.5.1).

**Result: 40/40 — 100%** (26/26 shipped in Z0B-1; +5 cases / 5 mentions in
Z0B-1r; +7 cases / 9 mentions in Z0B-1r2).

Enforced as ordinary vitest assertions, so a miss is a failing test and a red
build. There is no threshold to tune: the repo's student-PII rule is absolute
and a sanitizer miss is a defect, not an accepted rate.

The suite also asserts what must **survive**: attendee full names, attendees
referred to by first name only, roster names in inverted order, and institution
names (`Colegio San Mateo`, `Fundación Nueva Educación`).

### 3.2 Adversarial suite — MONITORING, no threshold asserted

30 cases, 33 mentions. Recall is computed and printed by the test; nothing is
gated on it.

**Node-only recall: 78.8% (26/33).** Re-measured unchanged after the Z0B-1r
preservation-rule change and again after the Z0B-1r2 segment-classification
change (§3.5): identical 26/33 three times over, same seven misses, same
per-category split, zero over-redactions. Expected — every miss here is a
detection failure, and the rules that changed decide what happens to spans that
*were* detected. No fixture in this suite names a person who shares a token with
its attendee, which is the only input either change can move.

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

**Result: 0 redactions, 0 persons, status `sanitized`** — unchanged after the
Z0B-1r rule change and after the Z0B-1r2 segment-classification change (§3.5);
byte-identical output on every paragraph and on the joined corpus, three
measurements running. The corpus contains no name spans at all, so nothing in it
reaches the preservation decision.

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

Beyond recall, 39 unit tests cover the properties the pipeline depends on:

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
| R3 | punctuation-joined people share a segment | `Martina Rojas, Benjamín Soto` → both redacted, but as **one** `[persona N]` | segments split at connector TOKENS; a comma is not one, and `buildSpans` merges adjacent name tokens whatever punctuation sits between them. Undercount, never under-redaction |

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
| 8 | ~~Cross-entry token coverage still preserves `Camila Pérez` when the roster holds `Camila Fuentes` **and** `Rodrigo Pérez`~~ — **CLOSED** in Z0B-1r2 by segment classification (`node-1.2.0`, §3.5.1): coverage is per roster entry, spans are classified as segments, and the connector-merged undercount (D2) closed with it. Residuals R1–R3 documented in §3.5.1 and in the module header | Closed 2026-07-29 |

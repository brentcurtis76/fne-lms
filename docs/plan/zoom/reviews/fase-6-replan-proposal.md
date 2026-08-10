# Z3 (fase 6) — RE-PLAN PROPOSAL

> Written per SOP §3.9 after Sol's **second** `REQUEST CHANGES` (4 MAJOR + 2 MINOR) at round
> 9. **The PM proposes; it amends nothing.** Owner decision required, then Codex/Sol review of
> the amendment itself before any further execution.
>
> Branch `feat/zoom-embed` @ `fc8a564d`, 8 commits. **All five local gates and all six CI
> gates are green at this head**, and the migration is applied and PM-verified in production.
> **Nothing here is blocked on broken code.** The problem is scope.

> **AMENDED 2026-08-08 after Sol's review of this proposal — `REQUEST CHANGES`, 4 MAJOR + 3
> MINOR, all accepted.** Two claims below were wrong as written and are corrected in place:
> "zero findings against Component View" (overstated — the *first*-pass findings were partly
> cross-cutting; what holds is that no **second**-pass finding touches it), and "zero
> downstream cost" (false — §12 keeps recording disabled in link-out mode, so deferring
> Client View withholds the Z4 recording workflow from mobile/Firefox users). Sol also
> established that **the existing hardware protocol cannot clear Z3b** — it drives Component
> View via `/meet/diag` and is decided on P0 desktop — and that **"ships inert" was not an
> executable requirement**, which was the hole the PM flagged as likeliest. `PLAN.md` carries
> the corrected amendment; this file is kept as the reasoning trail.

---

## 1. What the plan got wrong, and the evidence

### 1.1 The plan treated Component View and Client View as one deliverable. They are not.

§15 lists them in a single row: *"Component View (desktop) + Client View route (mobile)"*, one
phase, 5–8 agent-days. **Nine rounds of evidence say they are different kinds of work.**

| | Component View | Client View |
|---|---|---|
| What it is | a **widget** you mount in your own element | an **app takeover** that owns the page |
| Findings **still open at `fc8a564d`** | **none** | M4 (r5), then 3 of Sol's 4 new MAJOR |
| First-pass findings (since closed) | partly cross-cutting: M1 fallback, M3 loader/deadline, M5 runtime proof | the same, plus its own |
| Defects found in-flight | none | CSS 403 (r7), `about:blank` race (r8), the `join` deadline (r7→r8) |
| Real-browser status | **joins in 4.2–6.1 s, proven r6/r7/r8** | joins, but only after a chain of fixes, and the state machine is still wrong |
| Field-testable today | yes (desktop, in the office) | **no** — mobile/tablet, and the hardware gate is waived |

The pattern is not bad luck. **Client View is being driven as if it were a widget** — promise-wrapped, deadlined, mounted in an iframe for CSS isolation — and each round has found the next place where that mismatch leaks. Sol's M1 is the clearest instance: r8 fixed the deadline for the human phase and the *same* error reappeared one step later, after «Entrar».

### 1.2 The plan's mobile answer ("Client View route") is not implementable as written.

r4 verified it and r5 proved it: **Next's Pages Router permits a global stylesheet only in
`_app.tsx`, and `_app` wraps every page**, so no route in this router can be a CSS boundary.
§15's literal instruction cannot be satisfied. The iframe was the PM's substitute, and it is
the thing that then produced the `about:blank` race and the teardown asymmetry (Sol M3).

### 1.3 The waiver removed the feedback loop that would have caught all of this early.

§16's hardware/network verdict was **waived, not cleared**, on 2026-08-08 — a decision the PM
recommended and still thinks was right *for Component View*. But Client View's entire audience
is mobile, tablet and Firefox, and **the waiver means no one has ever run it on the devices it
exists for.** Every Client View finding since has come from a laptop with fake devices. **We
are hardening a path against a simulation of its own users.**

### 1.4 Eight PM errors, and what they have in common.

Recorded individually in the ledger with their rounds. The repeated shape: **verifying the
half a change was about and not the half it moved.** The `noopener` logic (r3), the post-
«Entrar» phase (r8), the "matches too early" probe that tested the extreme rather than the
realistic middle (r8), and three separate staleness failures on the reviewer's own entry
document. **A re-plan that leaves the review load where it is will reproduce these.**

---

## 2. Proposed amendment: SPLIT Z3, do not re-scope it in place

**Z3 becomes desktop-only and closes. Client View becomes its own phase, sequenced behind the
hardware verdict it depends on.**

### 2.1 Z3 (amended) — "Embedded experience, desktop"

**Scope:** Component View for desktop; `PreJoinCheck`; es-ES; SDK-failure auto-fallback to
link; the per-route Permissions-Policy (already shipped in Z0B). **Mobile, tablet and Firefox
receive the Z2 platform link — exactly what production serves today.**

**What ships as-is, already proven and Sol-clean:** the `mode:'sdk'` join outcome; the §9 ZAK
issuance rule and its audit table; the credential discipline; the flag; the link fallback.

**Remaining work — small, and none of it Client View:**

| From | Item |
|---|---|
| Sol M4 | Request-scoped budget + `AbortSignal` on the ZAK path; exhaustion returns the existing 200 link payload and writes **no** audit row |
| Sol m2 | `join.ts:4` — correct "Nothing here writes" to disclose the conditional audit write |
| Sol m1 | Rebuild both review artifacts from measurement, not memory |
| r2 backlog | The §9-facts-read-twice cleanup, if it is cheap once the route is open |
| Sol MAJOR 2 | **Make Client View structurally unreachable** — link mode requested *before* any bundle, iframe, SDK/media worker or Client View join starts; no ZAK minted and no audit row written for a credential that will be discarded; blocking tests on mobile, tablet and Firefox. **This is a DoD item, not a note — and Sol M3 may move to Z3b only once it is proven** |

**Sol M1, M2 and M3 leave Z3 with the Client View path.** They are not waived — they move.

### 2.2 New phase — "Z3b: Client View (mobile/Firefox embed)"

**Dependency, as corrected by Sol (MAJOR 1):** Z3b needs Z3. **Implementation may BEGIN behind an
off-by-default gate; Z3b may not CLOSE or default-on until a REVISED, Client-View-specific
protocol clears against the final build.** The PM's original wording blocked Z3b *start* on the
existing §16 verdict, and that was wrong twice over: **the existing protocol drives Component
View through `/meet/diag` and its verdict is decided on P0 desktop machines**, so it cannot
clear Client View at all — and a visit run against the old, defective implementation could not
have cleared the eventual build regardless.

**Scope carried in:** Sol M1 (the three-state machine: bounded → human → bounded), M2 (a signal
that proves *usability*, not a layout rectangle), M3 (one abandonment path used by both manual
and automatic failure), the iframe boundary and its CSS, and the mobile trigger.

**Design note for whoever plans it, from the evidence:** the promise-wrapping is the root. An
app-takeover SDK has at least three machine/human alternations, and modelling it as one
`await` is what produced M3, then r8's fix, then M1. **Z3b should start from a state machine,
not from a `join()` call.**

---

## 3. Which later phases this invalidates

**Assessed against §15's dependency line — the honest answer is: almost none, and that is the
strongest argument for the split.**

| Phase | Depends on Z3? | Effect |
|---|---|---|
| **Z4** recording | No — needs Z1b, Z0B numbers, consent capture | **Not blocked, but DEGRADED**: §12 keeps recording off in link-out mode and G1 failed, so mobile/tablet/Firefox sessions get no Z4 workflow until Z3b |
| **Z5** transcription | No — needs Z4 | **Not blocked, but DEGRADED**: no Z4 recording for that population ⇒ no transcript, and no Z8 minuta input |
| **Z6** community meetings | Needs Z2 only | **None** |
| **Z7** attendance + hours | Needs Z2 + the customerKey verdict (PASS) | **None** |
| **Z8–Z11** | Need Z5/Z2 | **None** |
| **Z12** hardening | Health panel + runbooks | Gains one item: Z3b's status |

**No pre-existing implementation phase Z4–Z12 is structurally blocked on Z3 or Z3b.** §15's
dependency line reads *"Z3 needs Z0B-pass + Z2"* and nothing needs Z3. **The deferral costs no
downstream *sequencing*.**

**But it is NOT product-neutral, and the PM's original "only cost" claim was false** — Sol
re-review MAJOR 3, accepted. **§12 disables recording in link-out mode** (consent capture cannot
be guaranteed on a shareable URL) and **G1 failed definitively**, so the disclaimer backstop
stays closed. **Mobile/tablet/Firefox sessions that stay on the Z2 link therefore do not receive
the full Z4 recording workflow, and contribute no Z5 transcript or Z8 minuta input**, until
Client View or another consent-safe path ships. It belongs in Z4's rollout expectations. It does
not create a hard Z4→Z3b dependency.

**And §15's Z3 DoD** — *"School user joins embedded w/o Zoom account"* — is met on **desktop
only** until Z3b ships.

---

## 4. Decision Log entry (proposed)

> **2026-08-08 — Z3 split, proposed by the PM after Sol's second `REQUEST CHANGES`.**
> Z3 becomes desktop-only (Component View) and closes with Sol **M4 + m1 + m2 remediated AND
> structural unreachability proven** — link mode chosen before any Client View bundle, iframe,
> SDK/media worker, join, ZAK or issuance audit, across **every** non-Component branch of
> `selectEmbedView()` including narrow desktop, not merely the three named populations.
> Client View moves to a new phase **Z3b**, carrying Sol M1/M2/M3, and is sequenced behind
> §16's hardware/network verdict being **CLEARED rather than waived** — because its audience is
> mobile/tablet/Firefox and nine rounds established that laptop simulation does not stand in
> for it. §15's Z3 row is amended; §15's "Client View route (mobile)" wording is retired as
> unimplementable in this router (Next permits global CSS only in `_app.tsx`, which wraps every
> page). No later phase depends on Z3, so the deferral has no downstream sequencing cost.
> **Owner decision: `<pending>`. Reviewer sign-off on the amendment: `<pending>`.**

---

## 5. What the PM recommends, and what it is not

**Recommend the split.** It closes a phase that is genuinely finished on desktop, stops
hardening a path against a simulation of its own users, and returns Client View to the
dependency it always had.

**It is not a retreat from the embed.** Component View is the surface most GENERA users are on,
it joins in 4.2 s, and **no finding still open at `fc8a564d` touches it** — the accurate form of
a claim this document twice overstated as "nothing against it".

**It is not a criticism of the executors.** Eight of this phase's findings were the PM's error;
executors caught four and falsified a PM ruling with an experiment. The loop worked. What it
was pointed at was too big.

**The PM will not amend `PLAN.md` on this proposal.** §0.1 makes plan decisions settled and
owner-owned; the ledger records the proposal, and the amendment lands only after Brent's
decision and a reviewer's sign-off on the amendment itself.

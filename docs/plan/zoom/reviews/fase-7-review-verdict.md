# Fase 7 (Z7) — independent review verdict · chunk Z7-1

> **Provenance, stated first because it changes how much weight this file carries.**
> The reviewer's verbatim message was **not supplied to the executor**. What follows is
> the verdict as **relayed by Brent** in the Z7-r2 dispatch, cross-checked against the
> PM's own record in `PLAN.md` §15.3.8 (committed `ac573883`), which carries the same
> figures and rulings. Every claim below is attributed to its source. **This is a
> faithful record of a relayed verdict, not a transcript** — if the raw Codex output is
> still available, replace this file's "Verdict" and "Rulings" sections with it verbatim
> and keep the provenance note.

| | |
|---|---|
| Chunk | **Z7-1** — attendance data plane + the actual-elapsed instants |
| Reviewed | cumulative diff `43999499..e5b5a26d` |
| Head | `e5b5a26d` (3 commits from base `main` @ `43999499`) |
| Branch | `feat/zoom-hours` |
| Verdict | **`PASS` — no blocking defects** |
| Date | 2026-08-12 |
| Reviewer | Codex, independent, read-only, under `docs/planning/review-protocol.md` + lean overlay §4.3 |

## Verdict

**`PASS`. No blocking defects on the cumulative diff.** Recorded per lean overlay §4.3,
under which `PASS` means SHOULD-FIX and NIT items may be carried rather than fixed
before close. Two such items came back; both are given a state below rather than left in
a backlog.

## Gates, independently re-run by the reviewer

These are **the reviewer's own measurements**, not a restatement of the executor's
(source: `PLAN.md` §15.3.8):

| Gate | Reviewer's result |
|---|---|
| `npm run type-check` | PASS |
| `npm run lint` | PASS, zero warnings |
| `npm test` | **306 files / 7,074 passed + 11 skipped**, jsdom `environment` **205 ms** |
| `npm run build` | PASS, **156 static pages** |
| `supabase db reset` | clean |
| `npm run test:db` | **537 tests / 11 files** |

The non-zero `environment` time is what makes `[A0]` hold on the reviewer's side too:
the run was real, not the base checkout's silently-skipped 254 files / 6,575 tests.

**Sealed surfaces confirmed untouched by the reviewer:** `tests/e2e/`, Z3b
(`lib/meet/*`, `JoinMeetingButton.*`), the billing ledger, and the override files.

## The reviewer's probes went beyond the executor's

Two of the reviewer's own mutation probes went past the three the executor ran, and both
landed (source: Brent's relay, corroborated by §15.3.8):

1. **The surface-type mutation failed exactly tests 26–29 and 45** — the uuid collision in
   both directions plus the unknown-surface-type denial. Same result the executor
   measured, independently reproduced.
2. **A repaired INVOKER probe.** The executor's own probe (i) dropped `SECURITY DEFINER`
   and produced 51/71 failures — but by way of an *incidental* error:
   `public.has_global_workspace_access` reads `user_roles` unqualified and breaks under
   `search_path = ''`. The executor flagged in the review request that this probe might be
   proving "the function breaks" rather than "the persona is denied". **The reviewer
   repaired the probe** — retaining a usable search path instead of leaning on that error
   — and it then failed **only** the globally-scoped facilitator test and the explicit
   `SECURITY DEFINER` assertion.

That repaired result is the material one: it is what makes the definer predicate
**load-bearing rather than incidentally load-bearing**. The executor's weakest piece of
self-evidence was correctly identified and replaced with a stronger measurement.

## Rulings the executor asked the reviewer to weigh — all upheld

| Question | Ruling |
|---|---|
| **`[A7]` partial** — three existing test files edited (two `toHaveBeenCalledWith` assertions in `__tests__/api/zoom/webhook.test.ts`, and the `setMeetingStatus` wire assertions in `__tests__/lib/zoom/webhook-store.test.ts` after the transition moved onto an RPC) | **Accepted.** Not a blocking violation. |
| **Both migrations amended in place** rather than superseded, while unmerged and unapplied everywhere including production | **Upheld.** Amending in place is correct here; no split required. |
| **`anon` now returns `42501`** from `zoom_attendance` rather than an empty set, because the facilitator predicate is EXECUTE-revoked from `anon` | **Accepted** as the intended, stricter posture. |
| **The applies-from set is caller-supplied** rather than hard-coded in SQL, to avoid a third drifting copy of the monotonicity rule | **Accepted**; the wire assertions in `webhook-store.test.ts` are sufficient protection. |
| **No named correction RPC** — removing the trigger reopens a plain service-role `UPDATE` as the Z7-3 correction path, proved in pgTAP | **Accepted**; leaving the semantics to Z7-3 is right. |

## Non-blocking items, each with the state the PM assigned

Per `PLAN.md` §15.3.8. Both are recorded here with the PM's disposition, not a new one.

| # | Item | State |
|---|---|---|
| 1 | `readLifecycleInstant` (`lib/zoom/webhook-lifecycle.ts:75`) accepts any safe integer as an epoch: header **seconds** silently become a 1970 instant, and `Number.MAX_SAFE_INTEGER` throws `RangeError`. Unreachable today — production callers pass only body `event_ts` | **(b) assigned to Z7-2**, whose scope already owns that file and which parses `join_time`/`leave_time` through the same helper family. Named criterion **`[B1]`** |
| 2 | `public.has_global_workspace_access` (`00000000000000_baseline.sql:3987`) is `SECURITY DEFINER` with an unqualified `user_roles` reference and no fixed `search_path` — a pre-existing latent defect in the baseline | **NO STATE YET — needs an owner (Brent).** Not Z7's: it predates the phase and is repo-wide. Recommended home is the RLS workstream the 2026-08-10 measurement already calls for. **Z7 does not close over it** |

Item 2 is carried forward **untouched**. It is named in Z7-2's out-of-scope list
specifically so no executor "fixes it while in there".

## What this verdict does NOT establish

- **Nothing about deployment.** Every gate ran against a local Postgres. Both Z7-1
  migrations are unapplied in production; per §0.1(d) the phase is not closed until Brent
  applies them and the schema is verified read-only. Z1b broke session approval in
  production despite ten green review rounds.
- **Nothing about real Zoom traffic.** Z0B's capture is the only evidence behind the
  fixture shapes (§15.3.5).
- **It closes the chunk, not the phase.** Z7-2 … Z7-5 remain.

---

# Fase 7 (Z7) — verdict · chunk Z7-2

| | |
|---|---|
| Chunk | **Z7-2** — participant ingestion |
| Reviewed | cumulative diff `43999499..a530aafb` |
| Verdict history | `FAIL`(2 × P1) on `6177ad5e` → `FAIL`(1 BLOCKER) on `3e852828` → **`FINDINGS`** on `a530aafb` |
| Current verdict | **`FINDINGS` — the phase contract is unsatisfiable, not merely unimplemented** |
| Date | 2026-08-12 |
| Reviewer | Codex, independent, read-only, under `docs/planning/review-protocol.md` + lean overlay §4.3 |

> **Provenance:** relayed by Brent, as with the Z7-1 verdict above. Attributed, not a transcript.

## The finding

**UUID-less webhook pairing is not safely decidable.** Two histories produce *identical*
webhook input and *identical* database state, yet the contract requires opposite outcomes:

| | History 1 | History 2 |
|---|---|---|
| What happened | B joins as "Ana"; **B** leaves as "Ana" | B joins as "Ana"; **A's join webhook is never delivered**; **A** leaves as "Ana" |
| DB before the leave | one open row, `identity_tokens = ["nm:ana"]` | one open row, `identity_tokens = ["nm:ana"]` |
| Leave event | name "Ana" | name "Ana" |
| Contract requires | close B ([R3] fallback pairing) | close **nobody** ([R4]: a leave matching no open interval of its own writes no row) |

No implementation can satisfy both, because nothing observable distinguishes them.

## Independently reproduced by the executor before accepting

```
H1 DB-STATE-BEFORE-LEAVE: one open row, tokens ["nm:ana"]
H1 CLOSES: [{"id":"row-1","leftAt":"2026-07-30T00:10:00.000Z"}]
H2 DB-STATE-BEFORE-LEAVE: one open row, tokens ["nm:ana"]
H2 CLOSES: [{"id":"row-1","leftAt":"2026-07-30T00:10:00.000Z"}]
```

Identical state, identical input, identical output. History 2's close is wrong twice over:
it closes a stranger's interval, and it stamps B's interval with A's `leave_time`.

Attempt 4's ambiguity guard only fires at `open.length > 1`
(`lib/zoom/participant-lifecycle.ts:240`); with exactly **one** homonym open it closes that
row. The attempt-4 regression at `participant-lifecycle.test.ts:413` covers only History 1,
which is why the suite was green.

## Contract lines in conflict

- **[R3]** (`docs/plan/zoom/prompts/Z7-r2.md:87`) — *"The interval key is
  `participant.participant_uuid` when non-empty, **falling back to the identity token**."*
- **[R4]** (`:94`) — *"A `participant_left` that matches **no open interval** writes NO row …
  Z7-3's report is authoritative (§11) and supplies the truth."*

[R3] mandates fallback pairing; [R4] mandates not closing when the leave's own join was never
seen. In the uuid-less homonym case those are the same observation.

## The reviewer's replan block — for the PM, not the executor

```
Z7-2 CONTRACT REPLAN

1. Stop closing UUID-less attendance intervals from webhook fallback identity.
2. Treat name and email tokens as reconciliation evidence only, never sufficient
   authority for a destructive close.
3. Default all UUID-less pairing/closure to Z7-3's authoritative participant report.
4. Retain source_event_key and the persisted identity evidence for idempotency and
   reconciliation.
5. If customer_key remains eligible for webhook closure, first document and prove its
   uniqueness and joined→left stability; otherwise route it to reconciliation too.
6. Specify how Z7-3 supersedes or merges open webhook intervals before implementation.
7. Add the missing-join/homonym regression: one open namesake row plus another person's
   name-only leave must close nothing.
```

**Items 5 and 6 are contract decisions, not code**: item 5 requires evidence about Zoom's
`customer_key` semantics that this phase does not have, and item 6 defines the Z7-2/Z7-3
boundary. That is why this is `FINDINGS` and not `FAIL`.

## Stop rules in force

- Overlay §5's **same-category stop remains triggered** (two consecutive `FAIL`s on
  identity/pairing, now a `FINDINGS` on the same axis).
- The reviewer's instruction is explicit: **"Do not start a fourth identity-pairing patch
  cycle; replan the phase boundary."**
- The executor has stopped. No pairing code was written in response to this verdict.

## Gates at `a530aafb`, independently re-run by the reviewer

type-check PASS · lint PASS · build PASS · `npm test` **310 files / 7,168 passed** ·
pgTAP **11 files / 559 tests** PASS · worktree clean.

**The implementation satisfies the current contract in some histories, but is unsafe
because that contract is unsatisfiable.** As reproduced immediately above, the code at
`a530aafb` can close a stranger's interval and stamp it with the wrong `leave_time`.
Nothing is merged, nothing is applied to production, and no chunk is closed.

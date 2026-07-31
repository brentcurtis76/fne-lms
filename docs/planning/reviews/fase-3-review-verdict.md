# Fase 3 (Z1b) — Independent review verdict (Sol)

Archived by the PM. Round 1 below is the findings/fix block **as relayed through Brent**
(the full prose verdict, if longer, was not forwarded); PM triage follows. Remediation
round: **Z1b-sol1**. Per the relay, re-review scope = the fix commits only.

## Round 1 (verdict: REQUEST CHANGES, 2026-07-30) — six findings, as relayed

1. **Webhook ordering and projection** — lifecycle transitions are unconditional
   assignments, so a delayed/swept `meeting.started` flips an `ended` meeting back to
   `started` (re-entering the EXCLUDE active set); `session_meetings_public` is never
   moved by lifecycle events (no `live`/`ended`); PROJECT_STATE claims absolute
   assignments are inherently safe. DoD: started→ended, ended-before-started, duplicate
   deliveries, swept-older-started-after-ended — internal stays `ended`, projection stays
   `ended`, reservation never reactivated.
2. **Retry-After propagation** — the runner stores `retryAfterSeconds` in the failure
   record but `fail_zoom_job` schedules `run_after` purely on the 30·2^n backoff; a 600 s
   provider hint is re-claimed at 30/60/120/240 s. Carry the hint into the RPC;
   `run_after ≥ max(backoff, hint)`; unchanged behavior with no hint; update grant/
   signature assertions (pgTAP 002).
3. **Source-state and reservation revalidation** — provision never validates the session
   (status, is_active, modality/provider intent): it creates for cancelled/draft/inactive/
   ineligible sessions; a resumed pending reservation is reused without comparing stored
   `starts_at`/`duration` against the current source, so the EXCLUDE-protected interval
   can differ from what is sent to Zoom. Coordinate intent with Z2's additive
   `is_zoom_managed` column rather than inventing a rival mechanism.
4. **Ambiguous create outcome** — a transport failure/5xx/unreadable-success during
   `createMeeting` is treated as a definite failure: the row goes `error` (releasing the
   host interval) and the retry creates again, though the first request may have reached
   Zoom. Distinguish definite pre-create rejection from ambiguous outcome; never
   auto-create after ambiguous; keep the reservation blocking and park in an explicit
   manual-reconciliation state with the provider request id when available; document that
   an ambiguous failure cannot name the possible first meeting.
5. **Oversized webhook response** — the 1 MiB overflow path destroys the socket before
   the 413 is flushed (clients see ECONNRESET, not 413); tests use an EventEmitter double,
   not a real HTTP server.
6. **Documentation cleanup** — PROJECT_STATE head/figures lag the final head
   (`ae210a5`, 3646/237); `db-types.ts` dedupe docs don't describe the enqueue API's
   conflict-absorption result; re-run gates and update the review request with exact
   evidence.

## PM triage (Round 1)

**ALL SIX VALID** — anchors independently re-verified by the PM before dispatch. Four
qualify earlier PM rulings, conceded explicitly:

- **F1 concedes** the PM's acceptance (Z1b-3 approval, repeated in Z1b-4) of "idempotent
  by construction — absolute writes" as a sufficiency argument: idempotent is not
  order-safe, and the sweep the PM routed in makes the out-of-order replay REACHABLE.
  The projection gap compounds it — §6 calls the projection the UI's status surface, and
  nothing in the phase ever sets `live`/`ended`. Verified: no `session_meetings_public`
  reference anywhere in the lifecycle/store path.
- **F2 concedes** an unchecked link in the PM's own triage contract: the ledger required
  structural storage of `retryAfterSeconds` and never verified it fed scheduling.
  Verified: `runner.ts:97` captures it; `fail()` passes only `p_retryable`; the RPC has
  no hint parameter.
- **F3** was never in the Z1b-4 dispatch scope — a genuine scope gap, not a deviation:
  the handler validates schedule fields, never session eligibility. Verified: no
  status/modality/provider check on the source row.
- **F4 concedes** the PM's explicit praise of "`error` releases the reservation": right
  for definite failures, wrong for ambiguous ones — the r1 checkpoint covered
  crash-after-success, not maybe-it-landed. Verified: the catch wraps `createMeeting`,
  marks `error` (releasing the interval), rethrows retryable → the retry re-creates with
  no anchor.
- **F5** verified: `readRawBody` destroys inside `onData` before the handler can write
  the 413.
- **F6** verified: PROJECT_STATE figures predate `ae210a5`; the `db-types` dedupe comment
  predates the enqueue result type.

Severity as triaged: F1/F3/F4 correctness (MAJOR-class), F2 operational correctness
(MAJOR-class), F5 protocol behavior (MINOR-plus), F6 docs (MINOR, fix-now in the same
round per standing rule). All six go to one remediation round (Z1b-sol1); the migration
edit in F2 is legitimate pre-merge (the Z1b migrations exist only on this unmerged branch
and are re-applied from scratch by CI and local stacks).

## Round 2 — Re-review of Z1b-sol1 (verdict: REQUEST CHANGES, 2026-07-31)

Scope: the fix commits `ad649b3..9648c3b` + verification of the six R1 findings, run at
head `da38eb9`; Sol re-ran the full gate set itself (3680/238, pgTAP 91/91, queue proof
40/40 at split 19/21, clean checkout). Verdict: **REQUEST CHANGES — 2 MAJOR / 2 MINOR**;
remediation round **Z1b-sol2** per the verdict's own fix block.

**MAJOR ①** `lib/zoom/api.ts:232` — F4 still treats schema-invalid 2xx creates as
successes. Only empty/non-JSON bodies classify as ambiguous; a valid-JSON `{}` reaches
`mapMeeting()` through the unchecked cast and yields a meeting with `id`/`joinUrl`
undefined (Sol reproduced: 201 `{}` → `{"passcode":"","settings":{}}`). The provisioner
can then mark the row `provisioned` with no number and complete — bypassing the
manual-reconciliation behavior R1-F4 required, though Zoom may have created a meeting.

**MAJOR ②** `meeting-provision.ts:1016` — the ambiguous marker does not prevent a later
create. A parked row (`pending`, no number, `last_error.reason=ambiguous_create_outcome`)
satisfies `heldReservation`; requeueing the terminal job — the designated manual-triage
lever — silently creates again. The parked state must be handler-enforced.

**MINOR ③** `webhook.test.ts:86` / `webhook-store.ts:375` — F1's production store chain
is untested; the suites re-implement the guards in memory from the exported sets. First
lifecycle fix whose correctness depends on the persistence filter itself ⇒ close the
executor's flagged caveat with a real `createSupabaseWebhookStore` test.

**MINOR ④** docs — the review-request residual text overclaims (pre-checkpoint orphans
carry NO `stage_state.meeting.number` to name them — the code header states this
correctly); the `21 files, +1889/−89` figure is the through-F5 diff (full range: 22,
+2014/−101); the dossier §8 comment still says 85 pgTAP tests (now 91).

## PM triage (Round 2)

**ALL FOUR VALID** — anchors re-verified in the code before dispatch. Two qualify the
PM's Z1b-sol1 round: ② the PM verified that ambiguous outcomes PARK the row but never
replayed the parked job — the recovery path itself was the regression vector; ③ the PM
accepted "doubles import the rule" as a recorded residual — Sol correctly overturns
recorded-not-tested for the first store method whose correctness lives in the filter.
① is partly a pre-existing Z1b-2 gap (the unchecked `mapMeeting` cast) that F4's
classification made load-bearing. ④'s dossier line is the PM's own file — the PM fixes
it at the round's approval, not the executor. Severities as filed. One round: Z1b-sol2.

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

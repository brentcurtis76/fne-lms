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

## Round 3 — Re-review of Z1b-sol2 (verdict: REQUEST CHANGES, 2026-07-31)

Relayed as the Z1b-sol3 fix block (no prose verdict forwarded). Three findings:

**① (MAJOR-class)** The operator-recorded-number recovery path is incomplete. A pending
row with the ambiguous marker plus a manually populated `zoom_meeting_number` takes the
`alreadyCreated` replay path — built for rows `markProvisioned` completed — so it
publishes a `scheduled` projection while the row is still `pending` with NO passcode,
NO join_url, NULL `effective_settings` (drift read from absence → 'none'), and the
marker uncleared. Required: re-read the discovered meeting from Zoom, validate, then
`markProvisioned` atomically (number, non-empty passcode/join_url, effective settings
with an EXPLICIT `auto_recording`, status `provisioned`, `last_error` cleared) BEFORE
any projection; unusable read-back ⇒ stay parked, job terminal, no projection, never
`createMeeting`. Extend the recovery test to assert the full row outcome, not only the
zero create count.

**② (MAJOR-minus)** Create-success validation must fail closed for the fields
`meeting_provision` always requests: require non-empty `password` and a `settings`
object with an explicit string `auto_recording`; absence ⇒ the ambiguous
unusable-success classification (reservation stays pending, no projection). Fail-on-old
cases: `{id, join_url, settings:{}}`, omitted settings, omitted password; assert absence
can never become `effective_auto_recording='none'` / `settings_drift=false`.

**③ (MINOR, docs)** The commentary overclaims unification: empty and schema-invalid
bodies use `ZoomUnusableSuccessError`; client-level unparseable JSON remains
`ZoomRetryableError` with an explicit `ambiguous` outcome. State the asymmetry (or
intentionally unify).

## PM triage (Round 3)

**ALL THREE VALID** — anchors re-verified (`meeting-provision.ts:1075` keys
`alreadyCreated` on the number alone; `api.ts:234/238` type-check password/settings only
when present; `client.ts:269` is `ZoomRetryableError` + `outcome:'ambiguous'`). Two
concessions: ① qualifies the PM's sol2 approval — the PM accepted "both resolution paths
are test-covered" without checking that the populate-the-number test asserted only the
create count, not the resulting row's integrity; ③'s overclaim is the **PM's own** — the
executor's sol2 report described the class asymmetry accurately ("the pre-existing
client-level unparseable path"), while the PM's ledger row and dossier §7c wrote "all
three unified under `ZoomUnusableSuccessError`". The PM corrects its own two documents at
approval; the executor corrects any same claim in code commentary. ② tightens the PM's
accepted shape-only residual — provision always requests both fields, so absence is
anomalous, and Sol is right that it must not coerce to a clean-looking 'none'. One
round: **Z1b-sol3**.

## Round 4 — Re-review of Z1b-sol3 (verdict: REQUEST CHANGES, 2026-07-31)

Relayed as the Z1b-sol4 fix block. **One finding** (MAJOR-class): the operator-recovery
write path has no lease guard and no state guard. After the recovery `getMeeting`
validates, the handler writes `markProvisioned` keyed on `id` ALONE (verified:
`meeting-provision.ts:780` — `.eq('id', meetingId)`, no status/number condition) with no
heartbeat since before the GET. Two reachable races: a lost/expired lease lets a
non-owner write; and — the sharper one — a webhook can legitimately advance the row
`pending → started` while the GET is in flight (`LIFECYCLE_STARTED_APPLIES_FROM`
includes `'pending'`, `webhook-store.ts:52`), after which the late recovery write RESETS
the row to `provisioned` and republishes a `scheduled` projection — reintroducing
through the recovery path the exact order-safety class R2-F1 fixed for the webhook path.
Required: heartbeat immediately after validation and before any write (false ⇒
`ZoomJobLeaseLostError`, zero writes); the recovery write becomes compare-and-set
(`WHERE id AND status='pending' AND zoom_meeting_number=recordedNumber`, exactly-one-row
semantics); a CAS miss stops before `upsertProjection`; create/checkpoint-adoption
branches unchanged. DoD includes fail-on-old against `a67bc18`.

## PM triage (Round 4)

**VALID — and it overturns the PM's sol3 ruling on scrutiny C, conceded in full.** The
PM's acceptance reasoned about the duplicate-writer case ("a non-owner's late write is
an absolute idempotent write of the same Zoom-truth") and MISSED the lifecycle race: the
row is not static while the GET is in flight, and `started`-from-`pending` makes the
clobber reachable, not theoretical. Recovery needs the same monotonicity discipline the
webhook store received in sol1 — a guarded, compare-and-set write. PM design note for
the round: a CAS miss is a LEGITIMATE world-advance (another worker completed recovery,
or lifecycle moved the row) — the job completes with a structured `superseded` result
rather than failing into triage; and the miss leaves a documented residual (a row
advanced past `pending` before recovery keeps NULL passcode/join_url — the historical
record of a meeting that ran without platform join; the CAS never fires again by
design). One round: **Z1b-sol4**.

## Round 5 — Re-review of Z1b-sol4 (verdict: REQUEST CHANGES, 2026-07-31)

Relayed as the Z1b-sol5 fix block. Two substantive findings + docs:

**① (MAJOR-class)** The successful-recovery projection race: the CAS
(`meeting-provision.ts:1479`) and `upsertProjection` are two calls. A webhook landing in
the gap (started→ended on the now-provisioned row; the projection does not exist yet so
lifecycle's guarded update no-ops) is followed by the late projection INSERT of
`scheduled` — a permanently wrong public row for an ended meeting, with no later event
to correct it. Fix: one database transaction (service-role-only SECURITY DEFINER RPC)
making the provisioned row and the scheduled projection visible atomically; CAS miss
writes neither; regression test drives REAL `applyWebhookLifecycle` into the old gap.

**② (MAJOR-class)** The checkpoint-adoption exemption is unsound — remove it:
argumentless `ctx.heartbeat()` before adoption (false ⇒ LeaseLost, zero writes);
adoption guarded on `id + status='pending' + zoom_meeting_number IS NULL` with
exactly-one semantics; projection published atomically with it; tests for a stale/lost-
lease adopter and lifecycle-immediately-after-adoption.

**③ (docs)** sol4's round record never landed in `fase-3-review-request.md` (its
commits touched no docs); dossier §7e's "structurally absent" ruling and its
projection-race statement need correction.

## PM triage (Round 5)

**ALL THREE VALID — two are PM concessions.** ② overturns the PM's §7e "structurally
absent" ruling on a SECOND axis: the PM analyzed single-adopter-vs-lifecycle (NULL
number ⇒ lifecycle cannot find the row — true) and missed the dual-adopter interleaving
— a stale adopter whose lease was reclaimed writes its UNGUARDED `markProvisioned`
AFTER the fresh adopter's write gave the row a number and lifecycle advanced it: the
same clobber, through adoption, one lease-loss deep. The executor's original
no-heartbeat rationale (a checkpoint-overwriting heartbeat) is already answered by the
argumentless form sol4 proved safe against the RPC's COALESCE. ③ is a PM verification
slip conceded: sol4's diff contained no review-request update and the PM's re-review
did not catch the omission (ledger/dossier carried the record; the per-round
review-request convention broke silently). ① is the CAS's sibling gap — real,
millisecond-window, permanent-consequence (a `scheduled` projection nothing ever
corrects). PM notes for the round: the RPC(s) must follow the §6 discipline (SECURITY
DEFINER, `SET search_path=''`, service-role-only EXECUTE, pgTAP 002 extended — its
count will grow past 91, superseding the DoD's literal); the in-RPC projection write
must never move an existing projection backward (reuse the applies-from discipline);
dossier §7e corrections are the PM's at approval, the review-request backfill (sol4 +
sol5 records) is the executor's. One round: **Z1b-sol5**.

## Round 6 — Re-review of Z1b-sol5 (verdict: REQUEST CHANGES, 2026-07-31)

Relayed as the Z1b-sol6 fix block. Sol ruled on the residual §7f explicitly put before
it: the two-call shape on the LAST two paths is an R6 finding, not a Z2 baseline.

**① (MAJOR-class)** Fresh-create persistence is the same two-call gap R5-① closed for
recovery: `markProvisioned` (meeting-provision.ts:1624) → `upsertProjection` (:1643).
Fix: one guarded service-role transaction — REUSE `adopt_checkpoint_meeting` if its
`pending` + NULL-number CAS fits (it does: the post-create fresh write IS that
transition), or a generalized finalization RPC; CAS miss ⇒ no late projection write,
structured supersession.

**② (MAJOR-class)** Already-provisioned replay is not monotonic: the replay branch
re-upserts `scheduled` through the UNGUARDED `upsertProjection` (:910 — plain ON
CONFLICT DO UPDATE, no status guard; it predates the monotonic work), so a late replay
clobbers a `live`/`ended` projection back to `scheduled`. Fix: one transaction that
locks/reads the current internal row and derives the public status (provisioned →
scheduled · started → live · ended → ended · cancelled → cancelled), never moving an
existing projection backward — and RECREATING a missing projection for an
already-started/ended meeting (which structurally heals the sol2-era stranded-
projection residual).

**③** Fail-on-old regressions for both, incl. the replay-heals-missing-projection case
and wire/pgTAP coverage for any new or changed RPC signature.

**④ (docs)** Replace the dossier's "re-upserts idempotently" residual ruling; 002's
section-A comment says 20 asserts (now 26); the dossier §8 comment says 91 pgTAP tests
(now 115 — the PM's own figure gone stale a second time).

## PM triage (Round 6)

**ALL FOUR VALID.** ① is concession-flavored: the PM's §7f framing — "fresh-create
publishes into a projection that cannot pre-exist" — did not mitigate the race, because
the R5 race never required a pre-existing projection; that WAS the race. The analysis
is conceded; the PROCESS held (the residual was explicitly routed to Sol rather than
silently accepted, and Sol ruled). ② is verified real at the anchor (:910 unguarded).
④'s dossier items are the PM's at approval; 002's comment and the review-request are
the executor's. **Convergence statement for the owner**: after sol6, every provision-
path persistence is atomic and monotonic — fresh-create (reused adopt RPC), recovery +
adoption (sol5), replay (new sync RPC) — the two-call surface of this handler is
EXHAUSTED by construction; a hypothetical R7 finding would be a new class, not this one
again. One round: **Z1b-sol6**.

## Round 7 — Re-review of Z1b-sol6 (verdict: REQUEST CHANGES, 2026-07-31)

Relayed as the Z1b-sol7 fix block. Two findings, both on the sol6 supersession
semantics:

**① (MAJOR-class)** The fresh-create CAS miss shrugs at a distinguishable ambiguity:
the handler completes with a warn whose own text admits "if the winner recorded a
DIFFERENT number, zoom <id> is an orphan" (meeting-provision.ts:1781) — without reading
the winner's persisted `zoom_meeting_number`, which `findMeetingBySurface` provides.
Required: read it after the failed CAS; equal to `created.id` ⇒ structured SAFE
supersession, complete; different or unreadable ⇒ typed NON-retryable
`possible_orphan` failure with the created number in durable job evidence. Tests incl.
no-retry-into-create.

**② (MAJOR-class)** Replay-sync `missing`/`not_publishable` warn-and-complete
(:1538) — a vanished internal row or an impossible status produces a GREEN job and a
console line nobody consumes. Required: typed non-retryable failures (or an explicit
§18-consumed durable state); queue row `failed`, actionable meeting evidence retained,
never retried into fresh creation.

**③ (docs)** Correct the review-request AND the PM dossier claims that these outcomes
"must complete" / "cannot be distinguished".

## PM triage (Round 7)

**BOTH VALID — both overturn the PM's sol6 rulings, conceded in full.** ① the PM
accepted "the process can't tell, so the result claims neither" without checking
whether the ignorance was necessary — it is not: one SELECT of the winner's number
distinguishes same-meeting supersession from a real orphan, and the code's own warn
text knew it. ② the PM conflated the executor's correct danger analysis (a RETRY into
the fresh path would create a second meeting) with the wrong remedy (complete): a
non-retryable failure has no retry, preserves evidence where triage looks, and a
requeued `failed` job re-enters the replay path (the row holds the winner's number),
never the create path — completing green was the one option that HIDES the anomaly.
The executor's own R7 scrutiny note invited this second opinion; the PM's ruling was
the weak link. ③ splits as before: review-request = executor; the dossier §7g lines
("the epistemics are right", the complete-don't-throw praise) = the PM at approval.
No migration is needed (the winner-read uses the existing store; classification is
TS-side). One round: **Z1b-sol7**.

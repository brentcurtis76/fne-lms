# Fase Z1b — Review request

> Per CLAUDE.md executor rule 6. Reviewer protocol: `docs/planning/review-protocol.md`.
> Design authority: `docs/planning/zoom-integration-plan.md` §6, §8–§12, §14, §15, §17, plus the §0 ledger rows Z1b-1…Z1b-3.

## Branch and scope of this request

| | |
|---|---|
| Branch | `feat/zoom-core` (PR [#26](https://github.com/brentcurtis76/fne-lms/pull/26), **draft — not marked ready**) |
| Base | `origin/main` @ `18057e2` (absorbed mid-phase via merge `5d54f12`, which brought the contracts track `c878ec7`) |
| Implementation head, Z1b-4·r1 | `ae210a5` (`4b71b3c` → `ccb8fce` → `ae210a5`) |
| Head at THIS request | **Z1b-sol7** implementation `a311ff6` plus the review-record commit containing the sol7 section |
| Commits ahead of `origin/main` | **65** through `a311ff6`; this review-record commit is the 66th |
| `origin/main` this round | **deliberately NOT merged** — Sol R8's scope is the Z1b-sol7 remediation only |
| Net diff vs `origin/main` (at `ae210a5`) | 53 files, +11734/−70 |
| This chunk (Z1b-4) alone | merge `5d54f12` + 3 commits; 15 files, +2484/−92 |
| Z1b-4·r1 remediation | `ccb8fce` (fix + tests + `PROJECT_STATE.md`) + `ae210a5` (type-clean); 2 PM findings, no scope beyond them |

Z1b-4 is the **closing chunk**. Chunks Z1b-1, Z1b-2 (+r1) and Z1b-3 were each reviewed and
approved by the PM already; their evidence is in the plan's §0 ledger. This file covers the
phase as a whole, with the sharpest attention on Z1b-4, which no one has reviewed yet.

### Z1b-4 commits

| SHA | What |
|---|---|
| `5d54f12` | merge `origin/main` — absorbs the contracts track; conflict-free as predicted |
| `83e30d5` | `meeting_provision` handler + registration + mock-mode round trip (items A, B) |
| `c9b5ebc` | `webhook_sweep` job + shared lifecycle + hourly enqueue (item C) |
| `4b71b3c` | §17 overlapping-ticker proof, wired into Gate 3 (item E) |

## Sol R1 remediation — round Z1b-sol1

Sol's round 1 returned **REQUEST CHANGES** with six findings; the PM triaged **all six VALID**
(archive + triage: `docs/planning/reviews/fase-3-review-verdict.md`, committed at `ad649b3`).
Per the relay, **Sol's re-review scope is these fix commits only.** One commit per finding, F6
last, no unrelated churn.

| SHA | Finding | What changed |
|---|---|---|
| `e748d32` | **F1** order-safe lifecycle + projection | Lifecycle writes became GUARDED transitions — the guard is the UPDATE's own `WHERE ... status IN (...)` in Postgres, not an in-process check, so the route and a concurrent sweep converge. `started` applies only from `pending`/`provisioned`/`started`; `ended` from anything but `cancelled`/`deleted`. `session_meetings_public.meeting_status` now moves WITH the lifecycle (`live`/`ended`) under the same rule, from the surface keys the guarded UPDATE returns, and only when the internal transition applied. The "absolute writes ⇒ safe" claim is withdrawn in `webhook-lifecycle.ts`, `webhook-sweep.ts` and `PROJECT_STATE.md`. |
| `8e726ef` | **F2** Retry-After reaches `run_after` | `fail_zoom_job` gains `p_retry_after_seconds integer DEFAULT NULL`; `run_after = now() + GREATEST(<existing backoff>, COALESCE(hint, 0))`. Migration amended IN PLACE (branch-only, re-applied from scratch by CI and `supabase db reset`; nothing dropped). REVOKE/GRANT moved to the new five-arg signature — they key on it — and pgTAP 002's four EXECUTE asserts with them. Threaded `FailZoomJobArgs` → `queue.fail` → runner. |
| `6691f1f` | **F3** source-state + reservation revalidation | Eligibility gate before any reservation: `is_active`, `status = 'programada'`, modality `online`/`hibrida`, `meeting_provider = 'zoom'`; anything else fails non-retryably with `reason: 'session_ineligible'` + `detail: <check>`. A bare reservation left on a now-ineligible session is released to `cancelled` (outside the EXCLUDE predicate); one with a real meeting behind it is deliberately left blocking. A resumed `pending` reservation is compared against the current source and atomically re-reserved on drift (23P01 ⇒ candidate walk). **No `is_zoom_managed` column** — named seam comment only; that is Z2's additive migration. |
| `3107d02` | **F4** ambiguous create outcomes | `ZoomError.outcome: 'not_executed' \| 'ambiguous'`, set at the client (definite = a status arrived and was <500; ambiguous = transport throw, ≥500, unreadable/empty 2xx). On ambiguous the provision handler does NOT `markError` (that releases the interval): the row stays `pending`, `last_error` is written without a status change, and the job fails non-retryably under `ambiguous_create_outcome` with the provider `requestId`. Documented: an ambiguous failure cannot NAME the possible meeting — the blocked interval is the safety, not knowledge. |
| `7d4b062` | **F5** 413 reaches the client | The overflow path pauses instead of destroying; the handler sets `Connection: close`, writes the 413, and discards the rest of the upload only after the response flushes. New real-`http.Server` integration test with a real client. |
| (this commit) | **F6** documentation truth pass | `PROJECT_STATE.md` figures + head; the `db-types.ts` dedupe comment; this section. |

### Fail-on-old evidence (every fix, measured against the pre-fix source)

Each was captured by stashing ONLY the source file(s) and re-running the new tests, so the
assertions are proven to bite rather than asserted to.

| Finding | Pre-fix observation |
|---|---|
| F1 | A late/swept `meeting.started` over an `ended` row: `expected 'started' to be 'ended'`. Projection: `setProjectionStatus` `called 1 times, but got 0 times` — the lifecycle never touched `session_meetings_public` at all. |
| F2 | `run_after` = `QUEUE_NOW + 30 000 ms` where the 600 s hint requires `+600 000 ms`; the `fail` call carried **no** `p_retry_after_seconds` at all, while `last_error` stored `retryAfterSeconds: 600`. |
| F3 | **All 8** ineligible sessions (cancelled · draft · awaiting-approval · under-way · soft-deleted · presencial · google_meet · null provider) reached `createMeeting` — one meeting minted each. Reschedule case: the EXCLUDE-protected interval stayed at `19:00Z` while Zoom was sent `21:00Z`. |
| F4 | The create-then-lose-the-response fake produced **3 meetings across 3 ticker runs** (`expected […3 items] to have a length of 1 but got 3`) — one per tick, each releasing and re-reserving the host. |
| F5 | The real client received **`ECONNRESET`**, never a status code (`expected 'ECONNRESET' to be undefined`). |

## Sol R2 remediation — round Z1b-sol2

Sol's round 2 (re-review of Z1b-sol1 at head `da38eb9`) returned **REQUEST CHANGES** with
**2 MAJOR / 2 MINOR**; the PM triaged **all four VALID** (archive + triage in the verdict file,
committed at `c552594`). **Sol R3's scope is the fix commits below only** — `origin/main` was
deliberately NOT merged this round. One commit per finding, ④ last.

| SHA | Finding | What changed |
|---|---|---|
| `ddb07d3` | **① MAJOR** unusable 2xx creates | `createMeeting` shape-checks the response **before** `mapMeeting`'s unchecked cast, over exactly the fields the provisioner persists and joins with: positive safe-integer `id`, non-empty `join_url`, and the `password`/`settings` shapes `mapMeeting` silently coerces. Fields nobody persists (`uuid`, `host_id`, `topic`, `start_time`, `duration`, `timezone`) are deliberately **not** checked — rejecting there would turn a usable meeting into a human-triage event. All three unusable-2xx paths (empty · schema-invalid · the client-level unparseable one) now carry `outcome: 'ambiguous'` with `status` + `requestId`. The empty-body throw already reached the ambiguous branch (verified — it passed `outcome` explicitly) but was a `ZoomConfigError`; both it and the new throw are now `ZoomUnusableSuccessError`, which carries the ambiguous outcome as a **class invariant** rather than a per-call-site argument. |
| `db304d6` | **② MAJOR** parked-ambiguous enforced | The handler now refuses a row parked by an unresolved ambiguous create — after the two anchors resolve, before reservation reuse, host resolution or any Zoom call — non-retryably under a **distinct** reason `ambiguous_unresolved`, writing nothing: not the reservation, not the row, not Zoom. Distinct rather than reusing `ambiguous_create_outcome` because they are different events with different side effects (Zoom answering ambiguously *writes* the marker; an operator requeueing without resolving writes nothing), and §18 should be able to tell them apart. The anchors still win, which **is** the resolution path. `parseAmbiguousCreateMarker` replaces the boolean-only check so the refusal can carry the parked `x-zm-request-id`. |
| `e2d747a` | **③ MINOR** production store chain tested | 8 tests drive the real `createSupabaseWebhookStore` — through `defaultZoomWebhookStore`, so the `.schema('zoom_internal')` wiring is exercised — with real `supabase-js` over an intercepted `fetch`. No local DB. Asserts the guards **on the wire**: `ended` applies and returns surface keys from the UPDATE's `RETURNING`; a later `started` carries the started applies-from filter and reports `applied=false`; projection `live` cannot overwrite `ended`; requests target `zoom_internal.zoom_meetings` (by `Content-Profile`) and `public.session_meetings_public` (which must not carry it); a PostgREST error throws rather than reporting the silent no-op `applied: false` means. |
| (this commit) | **④ MINOR** remediation records | The two orphan classes distinguished (scrutiny area ② + limitation 7); the `21 files, +1889/−89` figure relabelled as the **through-F5** implementation diff with the full round's `22 files, +2014/−101` alongside; this section. `fase-3-pm-dossier.md` deliberately untouched — its §8 "85 tests" line is the PM's file and the PM fixes it at approval. |

### Fail-on-old evidence (Z1b-sol2)

Same method: stash **only** the source file(s), re-run the new tests. `meeting-provision.ts` was
first confirmed byte-identical between `da38eb9` and the ① commit, so ②'s stash reproduces
`da38eb9` exactly.

| Finding | Pre-fix observation |
|---|---|
| ① | **14 of 16** new `fake.test.ts` tests fail. `201 {}` and nine other unusable bodies return a mapped "meeting" instead of throwing. The 2 that pass are the pre-existing client-level unparseable path and the must-not-over-reject guard — neither is a new fix, and both are pinned here on purpose. End to end, driving the **real** live adapter over an intercepted fetch: **2 of 2** `meeting-provision.test.ts` tests fail — the row reached `markProvisioned` with `zoom_meeting_number` undefined and the job **completed**. |
| ② | **2 of 2** regression tests fail, at the assertion that matters: `expected "createMeeting" to be called 1 times, but got 2 times`. One requeue of the terminal job creates a **second** meeting at Zoom. (The 2 accompanying guard tests — a park resolved by a recorded meeting number, and one resolved by clearing `last_error` — pass against `da38eb9` **by design**: they protect the documented recovery path against the new gate, so they must be green on both sides.) |
| ③ | **Not applicable** — ③ is a coverage finding against code that is already correct, so its tests pass on both sides. The equivalent proof is **mutation**, run at this head: dropping `.in()` from `setMeetingStatus` fails 2 tests · dropping it from `setProjectionStatus` fails 2 · swapping the two applies-from sets fails 2 · dropping `.schema('zoom_internal')` fails 1. `webhook-store.ts` restored byte-identical after each (`git diff --stat` empty). |

### Gates at the Z1b-sol2 head

| Gate | Result |
|---|---|
| `npm run type-check` | clean (exit 0) |
| `npm run lint` (zero warnings) | clean (exit 0) |
| `npm test` | **3710/3710 in 239 files** (from **3680/238** at `da38eb9`: **+30 / +1**) |
| `npm run build` | OK — `/api/zoom/webhook` and the Zoom routes in the route table |
| `npm run test:db` | **PASS — 6 files, 91 tests** — unchanged this round (no migration touched), re-run to prove it |
| `npm run test:queue` | **PASS** — 40 jobs, 2 concurrent loops, split **21/19**, every job executed exactly once |

Per-file test delta: `fake.test.ts` 36→**52** (+16) · `meeting-provision.test.ts` 39→**45** (+6) ·
new `__tests__/lib/zoom/webhook-store.test.ts` (**8**). 16+6+8 = the +30 above; no other suite moved.

**Scanners, this round:** both committed scanners still exit **2** in this worktree — same cause as
the previous two rounds, their inputs are gitignored and live in the spike worktree, so they
scanned nothing. Reported as exit 2, **not** as a pass; the PM re-runs the real replication. Manual
audit of the Z1b-sol2 **implementation** diff — `c552594..e2d747a`, the three fix commits ①–③,
6 files, +864/−20; ④ adds only this file, so the round total is 7 files (stated precisely here
because collapsing the two is exactly the error ④ corrects upstream): 0 emails, 0 non-synthetic URLs
(only `example-synthetic.test`, plus the `.supabase.test` host the intercepted fetch never
dials), 0 secrets, 0 real PII. New identifiers this round are synthetic and inert: meeting numbers
`82000000042`/`82000000777` (the `82xxxxxxxxx` range), request ids
`synthetic-zm-request-id-0003`/`0004`/`0042`, dedupe key `synthetic-dedupe-0001`, and the
placeholder service-role string `sb_secret_synthetic_service_role_key`, which is a literal in a
test that never reaches a network.

## Sol R3 remediation — round Z1b-sol3

Sol's round 3 (re-review of Z1b-sol2 at head `c39c6af`) returned **REQUEST CHANGES** with
**1 MAJOR / 1 MAJOR-minus / 1 MINOR**; the PM triaged **all three VALID** (archive + triage in
the verdict file, committed at `c39c6af`). **Sol R4's scope is the fix commits below only** —
`origin/main` was deliberately NOT merged this round.

Commit order is ② → ① → ③, not ①-first: ① reuses ②'s tightened requirement set through
`findUnusableProvisionedMeetingFields`, so ② has to land first for ①'s commit to stand alone.

| SHA | Finding | What changed |
|---|---|---|
| `3470672` | **② MAJOR-minus** fail-closed create validation | `password` and `settings` are now REQUIRED in a create response, not type-checked only when present, and `settings` must carry an **explicit string `auto_recording`**. `meeting_provision` sends both on every create, so a 2xx without them is anomalous — and `mapMeeting`'s `?? ''` / `?? {}` turned that absence into a persisted empty passcode and an empty `effective_settings`, which §9.4 reads as a clean `'none'`. Failure ⇒ `ZoomUnusableSuccessError`, i.e. the ambiguous unusable-success classification: reservation stays `pending`, no `markProvisioned`, no projection. The two `fake.test.ts` tests that asserted the OLD optional-when-present semantics are **inverted, not deleted**. |
| `a67bc18` | **① MAJOR** operator-recovery completed from Zoom | `alreadyCreated` keyed on the number alone, so an operator-resolved row (`pending` + the discovered number + the park marker, nothing else) took the replay path built for `markProvisioned`-completed rows: no `markProvisioned`, NULL passcode/join_url/effective settings, marker uncleared, and a `scheduled` projection for a meeting nobody could join. The states are now split by STATUS — `provisioned` (or later) + number ⇒ today's replay, unchanged; `pending` + number ⇒ **recovery**: `ZoomApi.getMeeting` re-reads the meeting, the result must clear ②'s bar (`findUnusableProvisionedMeetingFields`) plus an identity check that Zoom answered about the number we asked for, and only then does **one** `markProvisioned` write number + passcode + join_url + effective settings + `provisioned`, clearing `last_error` in the SAME UPDATE. Projection publishes after that write, never before. A failing or unusable read-back ⇒ **zero writes**, terminal under a distinct `recovery_unusable` reason carrying the recorded number as `detail`. `createMeeting` is unreachable from every recovery outcome: each "do not create" guard now reads `hasNumber`. Resolution 2 (clear `last_error`, no number) is untouched. |
| `830d31d` | **③ MINOR** classification commentary | Three code comments claimed the three unusable-2xx paths were unified under one class. One **outcome** is true; one **class** is not — empty and schema-invalid are `ZoomUnusableSuccessError` (`non_retryable`), client-level unparseable JSON stays a `ZoomRetryableError` with an explicit `outcome: 'ambiguous'` (`client.ts:269`). `api.ts`'s create block, `ZoomUnusableSuccessError`'s own doc comment and the `fake.test.ts` commentary now state the asymmetry and why it is deliberate (that path is generic client machinery shared with GET/PATCH, where `retryable` is the right kind). The classes were **not** unified — that would have changed GET semantics. Pinned by assertion too: the unparseable-2xx test now asserts the error is NOT a `ZoomUnusableSuccessError` and that its kind is `retryable`. `fase-3-pm-dossier.md` and the ledger carry the same overclaim in the PM's own words and are deliberately untouched. |

### Fail-on-old evidence (Z1b-sol3)

Same method: revert **only** the source file(s) to `c39c6af`, re-run the new tests. ①'s check
keeps HEAD's `api.ts` (②'s rules) and reverts only `meeting-provision.ts`, so the two findings
are measured independently.

| Finding | Pre-fix observation |
|---|---|
| ① | **5 of 5** new tests fail against `c39c6af`'s handler (52 pass at this head): *a resolved park RECOVERS: the row is completed from Zoom before anything publishes* · *derives §9.4 drift from the RECOVERY read-back, never from the empty row* · *leaves the parked row UNTOUCHED when recovery hits* {a number that does not answer at Zoom · a read-back with no passcode · a read-back whose settings never state auto_recording}. On the old handler the row stays `pending` with NULL passcode/join_url/effective settings, the marker survives, the projection publishes anyway, and the drift case reports `'none'` for a meeting Zoom says is recording to the cloud. |
| ② | **10 tests** fail against `c39c6af`'s `lib/zoom/api.ts` (106 pass at this head): 7 adapter-level in `fake.test.ts` (5 new bodies — omitted password · blank password · omitted settings · settings with no `auto_recording` · non-string `auto_recording` — plus the inverted omits-the-optional-fields test and the new `settings: {}` unit case) and 3 end-to-end in `meeting-provision.test.ts` driving the REAL live adapter over an intercepted fetch (`{id, join_url, settings:{}}` · omitted settings · omitted password). On the old source each of those completes the job with `effective_auto_recording: 'none'`, `settings_drift: false`, and a row carrying an empty passcode. |
| ③ | **Not applicable by design** — ③ is a commentary fix over behaviour that is already correct, so its two new assertions (the unparseable 2xx is NOT a `ZoomUnusableSuccessError`; its kind is `retryable`) pass on both sides. They exist to make a future silent unification fail loudly, not to prove a fix. |

### Gates at the Z1b-sol3 head

| Gate | Result |
|---|---|
| `npm run type-check` | clean (exit 0) |
| `npm run lint` (zero warnings) | clean (exit 0) |
| `npm test` | **3723/3723 in 239 files** (from **3710/239** at `c39c6af`: **+13 / +0**) |
| `npm run build` | OK |
| `npm run test:db` | **PASS — 6 files, 91 tests** — unchanged this round (no migration touched), re-run to prove it |
| `npm run test:queue` | **PASS** — 40 jobs, 2 concurrent loops, split **21/19**, every job executed exactly once |

Per-file test delta: `fake.test.ts` 52→**58** (+6) · `meeting-provision.test.ts` 45→**52** (+7).
6+7 = the +13 above; no other suite moved.

**Scanners, this round:** both committed scanners (`scripts/spikes/webhook/scan-identifiers.mjs`,
`scan-credentials.mjs`) still exit **2** in this worktree — same cause as the previous three
rounds: their input, `scripts/spikes/webhook/captures/events.jsonl`, is gitignored and lives in
the spike worktree, so they scanned nothing. Reported as exit 2, **not** as a pass; the PM re-runs
the real replication. Manual audit of the Z1b-sol3 diff `c39c6af..830d31d` — 5 files, +507/−89:
0 emails, 0 non-synthetic URLs (only `example-synthetic.test` and `x.test`, neither dialled),
0 secrets, 0 real PII. New identifiers this round are synthetic and inert: meeting number
`82000000999` (the `82xxxxxxxxx` range, deliberately absent from the fake so the read-back 404s)
and the passcode literal `rec0very77` on a fake-minted meeting; `82000000042` and `246813` are
pre-existing fixture values reused verbatim.

### What to scrutinize in Z1b-sol3

**A. The recovery trigger is `status === 'pending'`, not the marker.** Sol's finding specifies
`pending` + number + the ambiguous marker. The implementation keys on `pending` + number and reads
the marker only to carry its `request_id` onto the failure. That is deliberately BROADER: keying
on the marker would leave `pending` + number **without** a marker on the old replay path — the
same defect, differing only in how the number got there. Nothing this handler writes produces
that state, so today it is operator-only either way. The judgment to check is the other edge:
every row with a number and any status OTHER than `pending` still takes the replay path
unchanged, which is what keeps a `started`/`ended` row from being dragged back to `provisioned`.

**B. Anchor 1 was split into two variables.** `hasNumber` (number present) now drives every "do
not create" guard — adoption, the parked gate, the held-reservation reuse, the meeting-id
resolution — while `alreadyCreated`/`operatorRecovery` only choose which finishing branch runs.
If any guard were left reading `alreadyCreated`, a recovery row would fall through to the
candidate walk and create a SECOND meeting. Worth re-deriving from the source rather than trusting
the tests: this is the one refactor in the round that could reintroduce R1-F4.

**C. Recovery does no heartbeat before its Zoom GET.** The adopt path deliberately skips the
heartbeat (it would overwrite the checkpoint); recovery skips it for a weaker reason — there is no
checkpoint to protect and the branch is one short GET plus one UPDATE. A lost lease during that
GET means `markProvisioned` is written by a worker that no longer owns the job. The write is
absolute and idempotent, so the outcome is the same row either way, but it is a departure from the
create path's "checkpoint before the network" discipline and is called out rather than hidden.

**D. ② is a fail-closed tightening of a live-account contract.** The evidence that Zoom always
reflects `password` and `settings.auto_recording` on a create is the Z0B spike plus this
integration always sending both. If a real account ever answers 201 without them, provisioning
now parks instead of completing — the deliberate trade (a human-triage event over a silently
unjoinable meeting), but it is the one change in this round whose blast radius is the live API's
behaviour rather than this repo's.

**E. `findUnusableProvisionedMeetingFields` validates AFTER `mapMeeting`.** It projects the mapped
meeting back to wire names and delegates to `findUnusableCreateFields`, so there is exactly one
rule set. The claim to check is that the map is lossless for these four fields — absent `password`
arrives as `''`, absent `settings` as `{}` — and that GET semantics are untouched for every other
reader of `getMeeting`.

## Sol R4 remediation — round Z1b-sol4 (backfilled during Z1b-sol5)

This record was omitted from the executor-owned review request during Z1b-sol4. The PM archive and
dossier already preserve that round; this is the required executor-side backfill. Sol R4 reviewed
the Z1b-sol3 head and the PM accepted one valid finding: recovery could write after losing its job
lease. The round base was archive `9eac80c`; its two remediation commits were `23f730a` and
`beab6e8` (**2 commits**, implementation head `beab6e8`). `origin/main` was not merged.

### Objective and scope — Z1b-sol4

**Objective.** Make operator recovery lease-safe and prevent an outdated recovery worker from
completing a row whose recovery state changed while Zoom was queried.

**In scope:** an argumentless heartbeat after validation and before the recovery write; a dedicated
recovery CAS constrained by meeting id, `pending`, and the recorded meeting number; a structured
superseded result on CAS miss; handler and production-store wire regressions.

**Out of scope:** fresh-create/adoption behavior, lifecycle transitions, schema/migrations, UI,
live Zoom calls, CI, deployment, and changes to the PM dossier.

### Commits and files by risk — Z1b-sol4

| SHA | What |
|---|---|
| `23f730a` | recovery lease heartbeat, guarded store write, structured superseded completion, handler/harness tests |
| `beab6e8` | production-store wire coverage for the new recovery CAS |

Round diff `9eac80c..beab6e8`: **4 files, +503/−10**.

- **Highest:** `lib/zoom/jobs/meeting-provision.ts` (+157/−5) — lease/CAS ordering and the
  recovery completion state machine.
- **High:** `__tests__/lib/zoom/jobs/meeting-provision.test.ts` (+164/−5) — lease loss,
  supersession, and lifecycle regressions.
- **Medium:** `__tests__/lib/zoom/jobs/meeting-provision-store.test.ts` (+157, new) — exact
  PostgREST filter/returning behavior on the production store.
- **Lower:** `__tests__/lib/zoom/jobs/provisionHarness.ts` (+25) — recovery CAS model.

### Test and fail-on-old evidence — Z1b-sol4

The full unit suite moved from **3723/3723 in 239 files** to **3730/3730 in 240 files**: handler
52→55 (+3) plus the new four-test store suite (+4). Against pre-fix handler source `a67bc18`,
**4/55 handler tests failed** (lost lease, both lifecycle-reachability variants, and the recovery
success heartbeat assertion). Against the old production store, **3/4 store tests failed** because
the recovery method did not exist; the unchanged fresh-create `markProvisioned` case passed by
design. Thus **7/59** tests failed across the two focused suites on old source.

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` | clean, zero warnings |
| `npm test` | **3730/3730 in 240 files** |
| `npm run build` | OK |
| `npm run test:db` | **6 files, 91 tests, PASS** |
| `npm run test:queue` | **40/40 exactly once**, concurrent split **21/19** |

### Deviations and judgment calls — Z1b-sol4

1. The fix added a dedicated `markRecoveredProvisioned` method rather than widening ordinary
   `markProvisioned`; this isolated recovery's stricter guard.
2. The expected meeting number came from the validated recovery patch rather than a separate
   method argument; the store still placed the number in the UPDATE predicate.
3. Exactly-one semantics were enforced from the returned-row count (`length === 1`).
4. A CAS miss completed the job with a structured `superseded` result rather than failing it.
5. The recovery success test gained a heartbeat assertion, so it intentionally joined the
   fail-on-old count even though its original business outcome had already been green.
6. A separate production-store suite was added because handler doubles could not prove the CAS
   predicates were actually emitted on the wire. The PM accepted all six choices.

### What an independent reviewer should scrutinize hardest — Z1b-sol4

1. **Heartbeat placement:** it must be argumentless and after the Zoom read-back validation, so it
   checks ownership without overwriting a job checkpoint.
2. **CAS filters on the wire:** id, `pending`, and the recorded number must all be present, and a
   zero-row response must not be mistaken for success.
3. **Real lifecycle reachability:** the started/ended webhook helper must still be reachable during
   recovery tests rather than replaced by a projection-only fake.
4. **Recovery field completeness:** passcode, join URL, effective settings, status and `last_error`
   must remain one internal write.

**Known limitation deferred from Z1b-sol4:** recovery still wrote the public projection in a second
statement after its internal CAS. A webhook could move the projection to `live`/`ended` in that
gap and the late recovery upsert could regress it to `scheduled`. Z1b-sol5 closes that gap.

## Sol R5 remediation — round Z1b-sol5

Sol R5 reviewed Z1b-sol4 and returned two valid concurrency findings plus the missing executor
record above. The round base is `d401960`; implementation commit `cfe22fb` plus this documentation
commit are the round's **2 commits**. `origin/main` was not merged, the PM dossier was not edited,
and no live Zoom or deployment action was performed.

### Objective and scope — Z1b-sol5

**Objective.** Remove the recovery/adoption projection race by making each guarded internal write
and its public projection one transaction, and apply the same lease/state discipline to checkpoint
adoption that recovery already had.

**In scope:** one additive migration defining two service-role-only `SECURITY DEFINER` RPCs with
`SET search_path = ''`; atomic recovery and checkpoint-adoption CAS writes; projection updates in
the same transaction without moving `live`, `ended`, or `cancelled` backward; argumentless adoption
heartbeat; structured superseded adoption; production-store, real-lifecycle, and pgTAP regressions.

**Out of scope:** fresh-create/replay behavior, other job types, Zoom API behavior, UI, dependencies,
CI, destructive schema changes, live account calls, deployment, and the PM-owned dossier.

### Fixes, commits, and files by risk — Z1b-sol5

| SHA | Finding | What changed |
|---|---|---|
| `cfe22fb` | **F1 atomic recovery** | `recover_provisioned_meeting` performs the pending+recorded-number CAS, complete provisioned write, `last_error = NULL`, and guarded projection in one transaction. A miss returns false before any projection write. |
| `cfe22fb` | **F2 atomic adoption + lease** | adoption first calls argumentless `heartbeat`; lease loss writes nothing. `adopt_checkpoint_meeting` accepts only pending+NULL-number state, performs the full internal/projection transaction, and a miss returns structured superseded completion. |
| (this commit) | **F3 records** | backfills Z1b-sol4 and records Z1b-sol5 in the executor review request; PM dossier deliberately untouched. |

Implementation diff `d401960..cfe22fb`: **6 files, +842/−171**.

- **Highest:** `supabase/migrations/20260731120000_zoom_provision_rpcs.sql` (+154, new) — both
  privileged transactional CAS operations and projection anti-regression guards.
- **High:** `lib/zoom/jobs/meeting-provision.ts` (+123/−99) —
  adoption heartbeat, RPC calls, superseded control flow, and removal of the second projection write.
- **High:** `supabase/tests/002-zoom-internal-isolation.sql` — EXECUTE isolation and real-database
  success/miss/backward-projection behavior for both RPCs.
- **Medium:** `__tests__/lib/zoom/jobs/meeting-provision.test.ts` and
  `meeting-provision-store.test.ts` — lease/CAS/lifecycle and RPC wire regressions.
- **Lower:** `__tests__/lib/zoom/jobs/provisionHarness.ts` — atomic transaction model and a
  test-only legacy seam used solely for fail-on-old proof.

### Test and fail-on-old evidence — Z1b-sol5

The full unit suite moved from **3730/3730** to **3735/3735 in 240 files**. The provision handler
suite is now **59 tests** (+4) and the store suite **5 tests** (+1). The pgTAP suite moved from
**91** to **115** assertions (+24).

- With only `meeting-provision.ts` restored to `d401960`, the four focused handler regressions
  failed: **4 failed / 55 skipped of 59** — stale adopter lease loss, adoption CAS supersession,
  real lifecycle after adoption, and real lifecycle after recovery.
- With the old production store, **4/5** store tests failed because the two RPC-backed methods did
  not exist; the unchanged fresh-create `markProvisioned` wire test passed by design.
- With the new migration removed from a temporary reset, pgTAP 002 aborted at the first missing
  RPC signature: it reported **54/74 failed subtests after 20 ran**. This proves the old schema
  cannot satisfy the 24 new assertions; it does not pretend all 24 executed individually. The
  migration was restored and a clean reset then passed all 115 assertions.

| Gate | Result at implementation head `cfe22fb` |
|---|---|
| `npm run type-check` | clean (exit 0) |
| `npm run lint` | clean, zero warnings (exit 0) |
| `npm test` | **3735/3735 in 240 files** |
| `npm run build` | OK — 156 static pages generated |
| `supabase db reset` + `npm run test:db` | **PASS — 6 files, 115 tests** |
| `npm run test:queue` | **PASS — 40/40 exactly once**, concurrent split **19/21** |

### Deviations and judgment calls — Z1b-sol5

1. **Pre-authorized test-wire rewire:** the recovery store tests moved from PostgREST UPDATE-chain
   assertions to the new RPC names and exact argument objects; retaining the old chain assertions
   would test code that no longer exists. The unchanged fresh-create wire assertion remains.
2. Both RPCs take the complete provisioned payload even though some fields duplicate the Zoom
   meeting number guard. That keeps the SQL signatures explicit and makes every persisted field
   reviewable at the call boundary.
3. Projection conflict updates are permitted only while the existing public state is `scheduled`;
   `live`, `ended`, and `cancelled` are all preserved. `cancelled` is stricter than the finding's
   minimum and avoids resurrecting an explicitly cancelled surface row.
4. Adoption CAS miss is a successful structured supersession, matching recovery, because another
   actor has already made this worker's checkpoint stale; retrying the stale write is not useful.
5. The migration uses schema-qualified object and function references throughout because the
   security-definer search path is deliberately empty.

### What an independent reviewer should scrutinize hardest — Z1b-sol5

1. **False-return atomicity:** neither RPC may touch the projection unless its guarded internal
   UPDATE affected exactly one row.
2. **Projection monotonicity:** an immediately interleaved real `meeting.started`/`meeting.ended`
   transition must win over late recovery/adoption publication.
3. **Privilege boundary:** only `service_role` should have EXECUTE; `anon`, `authenticated`, and
   PUBLIC must remain denied on both exact signatures.
4. **Adoption lease ordering:** the argumentless heartbeat must precede every adoption write and a
   false result must produce zero writes.
5. **RPC payload fidelity:** passcode, join URL, effective settings, status, and `last_error` must
   land together and the projection must derive its surface keys from the row actually updated.

**Known limitations / Sol R6 notes:** fresh-create and already-provisioned replay still use their
existing `markProvisioned`/projection paths; they were outside both R5 findings and should not be
mistaken for coverage by the new RPCs. The new RPCs intentionally do not contact Zoom or resolve
ambiguous meetings themselves. `supabase/.branches/`, if recreated by local Supabase gates, is CLI
state only and must remain untracked/uncommitted; its final presence is reported separately.

> **Superseded by Z1b-sol6.** Sol R6 ruled that residual a finding, not a Z2 baseline, and the PM
> triaged it VALID — conceding the "a fresh create publishes into a projection that cannot
> pre-exist" framing above. See the next section.

## Sol R6 remediation — round Z1b-sol6

Sol R6 reviewed Z1b-sol5 and returned **REQUEST CHANGES** with two concurrency findings, their
regressions, and a docs item; the PM triaged **all four VALID**
(`docs/planning/reviews/fase-3-review-verdict.md`, Round 6 + PM triage). ① is
concession-flavoured: the §7f framing that kept fresh-create out of R5's scope was wrong, because
the R5 race never required a pre-existing projection — a pre-existing projection was what the race
PRODUCED. The round base is `ae05331`; implementation commit `1490187` plus this documentation
commit are the round's **2 commits**. `origin/main` was not merged, the PM dossier was not edited,
and no live Zoom or deployment action was performed.

### Objective and scope — Z1b-sol6

**Objective.** Make the last two provisioning persistence paths — fresh create and
already-provisioned replay — atomic and monotonic, so that every write in this handler is one
guarded transaction and no unguarded writer is left in the module at all.

**In scope:** reuse of `adopt_checkpoint_meeting` for the fresh-create persist; one additive
service-role-only `SECURITY DEFINER` projection-sync function with `SET search_path = ''`;
removal of `markProvisioned`, `upsertProjection` and the public client's `upsert` seam; the
structured fresh-create supersession result; handler, production-store and pgTAP regressions;
002's stale section-A count comment; this record.

**Out of scope:** the PM-owned dossier (its "re-upserts idempotently" ruling and stale §8 figure
are the PM's corrections at approval), other job types, Zoom API behaviour, UI, dependencies, CI,
`origin/main`, destructive schema changes, live account calls, and deployment.

### Fixes, commits, and files by risk — Z1b-sol6

| SHA | Finding | What changed |
|---|---|---|
| `1490187` | **① atomic fresh create** | The fresh path's `markProvisioned` → projection-upsert pair is replaced by ONE call to the EXISTING `adopt_checkpoint_meeting`. The fit was verified, not assumed: at that instant the row is exactly `pending` + `zoom_meeting_number IS NULL` (the reservation INSERT/UPDATE put it there; nothing since has touched it), which is that RPC's CAS verbatim, over the identical field set including `last_error = NULL`; `growth_community_id` comes from the same `session` row the projection already used. The post-create checkpoint heartbeat is the lease proof immediately before the write, mirroring adoption's argumentless one. A miss returns `MeetingProvisionCreateSupersededResult` and writes nothing. |
| `1490187` | **② monotonic + healing replay** | New `zoom_internal.sync_projection_from_meeting(uuid, uuid)`: `SELECT … FOR UPDATE` the internal row, derive the public status (`provisioned→scheduled · started→live · ended→ended · cancelled→cancelled · deleted→cancelled`; `pending`/`error` ⇒ typed `not_publishable` no-op), then `INSERT … ON CONFLICT DO UPDATE` behind a never-backward guard. The replay branch calls it instead of upserting `scheduled`. Because the status is READ, the same call recreates a missing projection at the meeting's real status. |
| `1490187` | **② vector removal** | `upsertProjection` had exactly one caller (shared by fresh create and replay) and `markProvisioned` exactly one; after ① and ② both had zero. Both are removed from `MeetingProvisionStore` and the Supabase store, and `ProvisionPublicClient` lost its `upsert` member — the module can no longer write `public.session_meetings_public` at all except through a guarded RPC. |
| `1490187` | **③ regressions** | See the evidence table below. |
| (this commit) | **④ docs** | This section. 002's section-A count comment was corrected in `1490187` alongside the asserts it counts. |

Implementation diff `ae05331..1490187`: **7 files, +895/−71**.

- **Highest:** `supabase/migrations/20260731120000_zoom_provision_rpcs.sql` (+130/−2, amended in
  place — the branch-only precedent set by F2 in sol1) — the derived-status projection sync, its
  never-backward guard, and the grants/revokes for the third signature.
- **High:** `lib/zoom/jobs/meeting-provision.ts` (+197/−56) — the fresh-create RPC call and its
  supersession branch, the replay sync call, and the removal of both unguarded writers.
- **High:** `supabase/tests/002-zoom-internal-isolation.sql` (+180/−10) — EXECUTE isolation for the
  new signature plus 21 real-database behaviour asserts for the status map, the guard in both
  directions, the healing case and the typed no-ops.
- **Medium:** `__tests__/lib/zoom/jobs/meeting-provision.test.ts`,
  `meeting-provision-store.test.ts` — lifecycle-in-the-gap, CAS miss, replay monotonicity/healing,
  and the RPC wire assertions.
- **Lower:** `__tests__/lib/zoom/jobs/provisionHarness.ts` — the projection-sync model and two more
  test-only legacy seams. `lib/zoom/webhook-store.ts` (+8) — comment only: the reciprocal
  drift pointer to the SQL guard.

### Fail-on-old evidence — Z1b-sol6

Captured by reverting ONLY the file under test to `ae05331` and re-running the new suites at the
new head, then restoring.

| Control | Pre-fix observation |
|---|---|
| `meeting-provision.ts` @ `ae05331`, handler suite | **9 failed / 58 passed of 67.** 8 are genuine: the fresh-create lifecycle gap (`expected 'scheduled' to be 'ended'`), the fresh-create CAS miss (`expected { meeting_id: 'meeting-1', …(6) } to deeply equal { meeting_id: 'meeting-1', …(3) }` — the old source returned a full provisioned result and clobbered the winner's number), the three replay-monotonicity cases (`expected 'scheduled' to be 'live'` / `'ended'` / `'cancelled'`), the two healing cases, and the `not_publishable` no-op. The 9th — "adopts the post-create checkpoint after a genuine mid-crash" — is a REWIRE artifact, not a regression signal: its crash injection moved from `markProvisioned` to `adoptCheckpointMeeting` because that is now the fresh-create persist, so on old source no crash is injected at all. Stated plainly rather than counted as proof. |
| `meeting-provision.ts` @ `ae05331`, store suite | **7 failed / 4 passed of 11** — the five `sync_projection_from_meeting` wire tests plus the outcome-passthrough case (the method does not exist), and the assertion that the store exposes NEITHER `markProvisioned` NOR `upsertProjection` (on old source it exposes both). |
| migration @ `ae05331`, clean reset + pgTAP | 002 aborted at the FIRST new assert: `ERROR: function "zoom_internal.sync_projection_from_meeting(uuid, uuid)" does not exist`, reported as `Failed 72/98 subtests`, `Bad plan. You planned 98 tests but ran 26`. This proves the old schema cannot satisfy the 24 new assertions; it does NOT claim all 24 executed individually. The migration was restored and a clean reset then passed all 139. |

### Gates at the Z1b-sol6 head

| Gate | Result at implementation head `1490187` |
|---|---|
| `npm run type-check` | clean (exit 0) |
| `npm run lint` | clean, zero warnings (exit 0) |
| `npm test` | **3749/3749 in 240 files** (from 3735/240; +8 handler, +6 store) |
| `npm run build` | OK — full route table generated |
| `supabase db reset` + `npm run test:db` | **PASS — 6 files, 139 tests** (from 115; +24 in 002, whose own plan goes 74 → 98) |
| `npm run test:queue` | **PASS — 40/40 exactly once**, concurrent split **21/19** |

`supabase/.branches/` did **not** reappear during this round's local database gates; the working
tree at the implementation commit contained the seven intended files and nothing else.

### Deviations and judgment calls — Z1b-sol6

1. **Reuse, not a new function, for ①.** The fit was checked field by field before committing to
   it — CAS predicate, the five written columns plus `last_error`, and the `growth_community_id`
   parameter all match exactly. No generalized finalization RPC was needed, so none was written.
2. **A THIRD supersession shape, because the existing one would have lied.**
   `MeetingProvisionAdoptionSupersededResult` says `adopted: false`, and a fresh-create miss
   adopted nothing — it created. The two states also differ operationally: an adoption miss means
   somebody persisted the same checkpoint (nothing lost), while a fresh-create miss is EITHER that
   or a rival that created a different meeting, leaving ours orphaned at Zoom. ~~This process cannot
   tell which, so the result claims neither; it carries the number and the `console.warn` says
   plainly that it is an orphan only if the winner recorded a different one.~~
   > **Corrected in Z1b-sol7 (Sol R7 ①, triaged VALID).** "This process cannot tell which" was
   > wrong, and it was my claim, not a limit of the situation: the winner's persisted
   > `zoom_meeting_number` is one SELECT away through `findMeetingBySurface`, which already selects
   > it. The handler now reads it and RESOLVES the split — equal ⇒ a completion that claims
   > `orphan_risk: false`, different or unreadable ⇒ a terminal `possible_orphan` failure. A warn
   > whose own text named the orphan condition was evidence the code knew the question; it just
   > never asked it.
3. **The sync signature takes a second parameter.** `zoom_meetings` has no `growth_community_id`,
   and the projection needs it for the §7 growth-community SELECT policy, so the function is
   `(p_meeting_id uuid, p_growth_community_id uuid)` rather than the one-argument sketch.
4. **Self-transitions are allowed by the guard.** `→ live` applies from `{scheduled, live}` and
   `→ ended` from `{scheduled, live, ended}` — the SQL twins of the two `webhook-store.ts`
   constants, which include their own target for the same reason (a duplicate delivery must
   re-apply harmlessly). `→ cancelled` likewise applies from `{scheduled, live, cancelled}`, which
   is what makes `deleted → cancelled` idempotent; `→ scheduled` applies only from `scheduled`.
   `ended` and `cancelled` are terminal against each other in BOTH directions.
5. **`markProvisioned` was removed too, though the finding named only `upsertProjection`.** After
   ① it had zero production callers, and the reasoning Sol gave for removing the one applies
   verbatim to the other: an unguarded write left lying around is the vector. Both survive in the
   test harness as explicitly-labelled legacy seams so fail-on-old can revert one source file.
6. ~~**`missing` and `not_publishable` warn and COMPLETE; they do not throw.** Throwing on `missing`
   would be actively dangerous: the retry would find no row, take the fresh path, and create a
   SECOND meeting for a surface Zoom already holds one for.~~
   > **Corrected in Z1b-sol7 (Sol R7 ②, triaged VALID).** The danger analysis was right and the
   > remedy was wrong. A NON-retryable failure has no retry, so it cannot reach the fresh path at
   > all; completing green was the one option that HID a vanished row behind a successful job.
   > Both outcomes now fail terminally under `sync_missing_row` / `sync_not_publishable`, and the
   > requeue lever a human can still pull is closed by a job-level anomaly gate.
7. **No heartbeat guards the replay sync,** and that is deliberate. Unlike recovery, nothing here
   is a verdict formed before a network round trip — the value written is read inside the same
   transaction it is written in, so even a worker whose lease was stolen an hour ago can only
   publish the current truth.
8. **Migration amended in place** rather than adding a second file, following sol1's F2 precedent:
   this migration is branch-only and is re-applied from scratch by CI and `supabase db reset`.
   Nothing was dropped or altered destructively; `adopt_checkpoint_meeting` is byte-identical.
9. **The projection's `ends_at` is no longer computed in TypeScript.** Every publishing RPC reads
   it off `zoom_meetings.ends_at`, the STORED generated column, so the window the UI shows and the
   window the §9 EXCLUDE constraint defends are one value rather than two that agree today.

### What an independent reviewer should scrutinize hardest — Z1b-sol6

1. **Is the fresh-path CAS actually always satisfiable?** The claim is that `pending` +
   NULL-number holds at the write on every route into the create branch — fresh INSERT, resumed
   reservation, re-reserved-after-drift, and the candidate walk over an `error` row. If any route
   can arrive with a number already set, the fresh path would supersede itself forever.
2. **The two copies of the applies-from rule.** `webhook-store.ts`'s constants and the SQL `CASE`
   cannot share code. Check they agree, and that the pgTAP behaviour asserts would catch it if a
   future edit moved one.
3. **`deleted → cancelled`.** This is the one status mapping with no lifecycle precedent; the
   webhook path never writes `cancelled`. Confirm that reading a `deleted` meeting as a cancelled
   badge is right for the §7 surfaces, and that it cannot resurrect an `ended` one.
4. **The supersession is a completion, three times over now.** Recovery, adoption and fresh create
   all complete rather than fail on a CAS miss. Confirm the fresh-create case is not the one that
   should reach the §18 triage panel, given it is the only one that can leave an orphan at Zoom.
   > **Answered by Sol R7 ①: it IS that case, when the winner's number is not ours.** The
   > invitation was the right one to issue and the answer went against me. Fixed in Z1b-sol7 —
   > the miss is split by a winner-read, and only the same-meeting half still completes.
5. **Privilege boundary on the third signature.** `sync_projection_from_meeting` writes a PUBLIC
   table from a `SECURITY DEFINER` body; only `service_role` may EXECUTE it, and the blanket
   re-revoke at the end of the migration must not have missed it.

**Known limitations / Sol R7 notes:** the create→checkpoint window documented in the module header
is unchanged and remains irreducible without a Zoom-side idempotency key. ~~A fresh-create CAS miss
cannot distinguish "another worker adopted my checkpoint" from "another worker created a different
meeting"; naming the number on the result is the whole mitigation.~~ **Corrected in Z1b-sol7: it
can, and now does — see the sol7 section below.** `sync_projection_from_meeting`
is called only from the replay branch — Z2's reschedule/cancel flows are its obvious second caller
and are not wired here. `supabase/.branches/`, if recreated by local Supabase gates, is CLI state
only and must remain untracked/uncommitted.

## Sol R7 remediation — round Z1b-sol7

Sol R7 reviewed Z1b-sol6 and returned **REQUEST CHANGES** with two findings plus a docs item; the
PM triaged **both VALID, and both overturn the PM's own sol6 rulings**
(`docs/planning/reviews/fase-3-review-verdict.md`, Round 7 + PM triage). They are the same defect
seen twice: **R6 made every write guarded, and left two places where the guard FIRING was reported
as success.** The round base is `abecb91`; implementation commit `a311ff6` plus this documentation
commit are the round's **2 commits**. No migration was needed (the winner-read uses the existing
store; the classification is TS-side), `origin/main` was not merged, the PM dossier was not
edited, and no live Zoom or deployment action was performed.

### Objective and scope — Z1b-sol7

**Objective.** Make an anomaly report as an anomaly. The fresh-create CAS miss resolves its own
ambiguity instead of declining to, and the replay sync's two anomalous outcomes fail the job
instead of completing it — without reopening the double-create path that made completing look
attractive in sol6.

**In scope:** the winner-read after a failed fresh-create CAS and the two results it splits into;
typed non-retryable `possible_orphan` / `sync_missing_row` / `sync_not_publishable` failures with
structured evidence; a job-level anomaly gate closing the requeue path; `evidence` on the runner's
failure record; the module header's contract; handler regressions; this record and the sol6 claims
it corrects.

**Out of scope:** the PM-owned dossier (its §7g praise lines — "the epistemics are right", the
complete-don't-throw commendation — are the PM's corrections at approval), migrations (none
needed), other job types, Zoom API behaviour, UI, dependencies, CI, `origin/main`, live account
calls, and deployment.

### Fixes, commits, and files by risk — Z1b-sol7

| SHA | Finding | What changed |
|---|---|---|
| `a311ff6` | **① the CAS miss resolves its ambiguity** | After `adoptCheckpointMeeting` returns false on the fresh path, the row is RE-READ through `findMeetingBySurface` (which already selects `zoom_meeting_number`) and the winner's number compared to `created.id`. **Equal** ⇒ the winner adopted our own checkpoint: `MeetingProvisionCreateSupersededResult` completes, now carrying `winner_zoom_meeting_number` and `orphan_risk: false` — a checked claim, and a shape the sol6 claims-neither form cannot be mistaken for. **Different, or unreadable by any route** (row gone, number back to NULL, the read itself throwing) ⇒ terminal `ZoomPossibleOrphanError`, reason `possible_orphan`, `detail` = which of those four causes, `evidence` = `{meeting_id, created_zoom_meeting_number, winner_zoom_meeting_number, cause}`. |
| `a311ff6` | **② replay anomalies are terminal** | `missing` / `not_publishable` keep the `console.warn` as a live-tail line and then throw `ZoomReplaySyncAnomalyError` — reasons `sync_missing_row` / `sync_not_publishable`, `detail` = the meeting number, `evidence` = `{meeting_id, zoom_meeting_number, sync_outcome}`. Non-retryable, so the job row goes `failed` through the runner's existing fail path. |
| `a311ff6` | **② the requeue is closed** | A job-level anomaly gate at the top of the handler, mirroring the sol4 row-marker gate including its position: **after** the two anchors, so a repaired surface replays instead of being refused forever, and **before** every write, reservation and Zoom call. It parses `ctx.job.last_error` (`ZoomJobRow.last_error`, verified present at `db-types.ts:165`) and refuses non-retryably under `anomaly_unresolved` when the marker names an unresolved anomaly and nothing anchors the surface. |
| `a311ff6` | **evidence seam** | `ZoomJobFailureRecord.evidence?: Record<string, unknown>`, read off the error exactly as `reason` and `detail` already are, and dropped unless it is a plain object. `zoom_jobs.last_error` is the durable record Sol asked for; `zoom_internal` is service-role-only, so meeting numbers there are no new exposure. |
| (this commit) | **③ docs** | This section, plus the four sol6 claims below that are mine. |

Implementation diff `abecb91..a311ff6`: **3 files, +971/−57**.

- **Highest:** `lib/zoom/jobs/meeting-provision.ts` (+427/−35) — the winner-read and its two
  outcomes, three new error classes, the marker parser, the job-level gate, and ~90 lines of
  header contract.
- **Medium:** `lib/zoom/jobs/runner.ts` (+34) — the `evidence` field and its reader. Additive; no
  existing behaviour changes.
- **Medium:** `__tests__/lib/zoom/jobs/meeting-provision.test.ts` (+510/−22) — **+11 test cases** (67 → 78) and
  2 rewritten in place: the sol6 fresh-create CAS-miss test is now the safe-supersession case, and
  the sol6 `not_publishable` replay test now asserts a failure instead of a completion.

### Fail-on-old evidence — Z1b-sol7

Captured by reverting ONLY the file under test to `abecb91` and re-running the handler suite at the
new head, then restoring. Both controls were run; the file was restored and re-verified green
(`78 passed`) after each.

| Control | Pre-fix observation |
|---|---|
| `meeting-provision.ts` @ `abecb91` | **13 failed / 65 passed of 78.** All 13 are genuine, and there is no rewire artifact this round. ① — the safe supersession (`expected { meeting_id: 'meeting-1', …(3) } to deeply equal { …(5) }`: the old shape has neither `winner_zoom_meeting_number` nor `orphan_risk`), the different-number case and the read-throws case (`expected 'unknown' to be 'non_retryable'` — old source RETURNS, so the assertion sees no typed failure at all), both unreadable-winner cases (`expected undefined to be 'possible_orphan'`), and the requeue round trip (`expected 'done' to be 'failed'`). ② — `not_publishable` and `missing` (`expected 'unknown' to be 'non_retryable'`), the queue-row-red case, the three-requeue gate case, the repaired-row case and the cleared-marker case (all `expected 'done' to be 'failed'` — sol6's green job, exactly), and the gate's total-parser case (`promise resolved … instead of rejecting`). |
| `runner.ts` @ `abecb91` (new source elsewhere) | **9 failed / 69 passed of 78** — every assertion that reads `evidence`, as `expected undefined to deeply equal { … }` or `to match object`. This isolates the seam: without the runner field the failures are still typed and still terminal, but the numbers a human needs never reach `zoom_jobs.last_error`. |

### Gates at the Z1b-sol7 head

| Gate | Result at implementation head `a311ff6` |
|---|---|
| `npm run type-check` | clean (exit 0) |
| `npm run lint` | clean, zero warnings (exit 0) |
| `npm test` | **3760/3760 in 240 files** (from 3749/240; +11 in the handler suite, 67 → 78) |
| `npm run build` | OK — full route table generated |
| `supabase db reset` + `npm run test:db` | **PASS — 6 files, 139 tests** — unchanged from sol6, as expected: no migration was touched, and the fix is entirely TS-side |
| `npm run test:queue` | **PASS — 40/40 exactly once**, concurrent split **20/20** |

Every gate was then **re-run in full at the round's final head** (this documentation commit, which
touches no code): type-check clean, lint clean, `npm test` 3760/3760 in 240 files, build OK,
`supabase db reset` + `test:db` PASS 139, `test:queue` PASS 40/40 exactly once. The only figure
that differs is the queue proof's split, which is nondeterministic by construction — 20/20 at
`a311ff6`, 21/19 at the final head.

`supabase/.branches/` did **not** reappear during either round of local database gates; the working
tree at both commits contained the intended files and nothing else.

### Deviations and judgment calls — Z1b-sol7

1. **The refusal carries the original evidence forward, and this is load-bearing.** Found by my own
   test, not by reasoning: the first draft of the gate matched only the anomaly record shape, and
   the three-requeue loop failed on the SECOND requeue with a real second create. `fail_zoom_job`
   REPLACES `last_error` — the same field the gate reads — so the refusal record buried the
   anomaly it was refusing. Unlike the sol4 precedent, where the marker is on the ROW and the
   failure on the JOB, here there is one column. `parseTerminalAnomalyMarker` therefore matches the
   refusal shape too (`reason: 'anomaly_unresolved'`, original in `detail`) and every refusal
   re-states the evidence verbatim. Without both halves the gate would have held exactly once and
   erased the orphaned meeting number doing it.
2. **The gate sits AFTER the anchors, on the sol4 precedent, and that is what makes ① requeue-safe
   rather than requeue-jammed.** A `possible_orphan` requeue against a row that now carries the
   winner's number is `hasNumber` ⇒ anchor 1 ⇒ the REPLAY path; `createMeeting` is unreachable and
   no marker-clearing is needed. Refusing it up front would have been simpler and would have
   parked a surface that is already correct.
3. **`evidence` is a new field on the runner's record, not a formatted `detail` string.** `detail`
   is one string and ① needs two numbers. Encoding them into it would have made triage parse a
   sentence — the exact anti-pattern the runner header forbids for `message`. The field is
   additive, ignores anything that is not a plain object, and no existing failure sets it.
4. **Four unreadable causes, one failure.** `different_number`, `row_missing`, `number_null` and
   `read_failed` all fail; only exact equality completes. Not knowing is not the same as being
   safe, and sol6's result treated them alike. `detail` keeps them distinguishable for triage.
5. **The re-read is wrapped in try/catch.** A throwing store call would otherwise escape as an
   untyped error, which `fail_zoom_job` treats as RETRYABLE by default — and a retry after a
   fresh-create CAS miss is precisely what must not happen.
6. **The `console.warn`s stay.** Sol allowed it; they are the live-tail signal, and the durable
   record is now the failure beside them, not instead of them.
7. **`not_publishable` is self-limiting even unresolved,** because the row has a number: a requeue
   replays, fails identically and creates nothing. It is in the gate's reason set anyway, for the
   case where that row is LATER deleted — at which point it becomes `missing`'s problem.
8. **Clearing a `sync_missing_row` job's `last_error` while the Zoom meeting still exists
   re-enables fresh creation.** One-way, exactly like clearing an ambiguous-create marker, and
   documented per-reason in the header: the correct resolution for that anomaly is to RESTORE the
   row carrying its number, not to clear the marker. Tested in both directions rather than glossed.

### What an independent reviewer should scrutinize hardest — Z1b-sol7

1. **Is the winner-read the RIGHT read?** It goes through `findMeetingBySurface` (surface_type +
   surface_id), not by `meetingId`. On this path they are the same row — the reservation for this
   surface — but if a future path could ever reach the fresh-create branch with a `meetingId` that
   is not the surface's current row, the comparison would be against the wrong row and a real
   orphan could read as safe.
2. **The gate's reason set versus the reasons the handler can actually emit.** `possible_orphan`,
   `sync_missing_row`, `sync_not_publishable` are gated; `ambiguous_create_outcome`,
   `recovery_unusable`, `no_host_available`, `session_ineligible` deliberately are not (the first
   is gated by its ROW marker, the rest cannot create on requeue). Check that split — a reason in
   the wrong bucket either jams a recoverable queue or reopens a create path.
3. **Deciding `possible_orphan` from a read taken AFTER the CAS.** The re-read is not in the CAS's
   transaction, so the winner's number can change again between them. My argument that this is
   safe: any value other than exact equality fails, and a value that later becomes ours cannot make
   an orphan appear — only a false `possible_orphan`, which costs a triage item, never a lost
   meeting. Check the asymmetry rather than the sequence.
4. **The one-column marker problem (deviation 1).** The carry-forward is asserted by a
   three-iteration loop; convince yourself that three is enough and that the parser cannot be
   walked out of matching by a fourth record shape — a refusal of a refusal, say.
5. **`missing` now fails a job that may be entirely benign.** If an operator deletes a
   `zoom_meetings` row on purpose while a redelivered job is in flight, sol6 completed and sol7
   fails. I judge that correct — a surface with a meeting at Zoom and no row is an anomaly however
   it arose — but it does convert a silent case into a triage item, and that is my call to defend.

**Known limitations / Sol R8 notes:** the create→checkpoint window in the module header is
unchanged and still irreducible without a Zoom-side idempotency key; `possible_orphan` is a THIRD
orphan class beside the two documented there, and like them its remedy is manual cancellation at
Zoom — no automated orphan sweep exists. The gate is a TypeScript guard over a text column, not a
database constraint: an operator who edits `zoom_jobs.last_error` by hand can walk past it, which
is the same property the row-marker gate has and the same reason both are documented as contracts.
`docs/runbooks/zoom.md` (plan §16, later phase) still does not exist, so all three resolution paths
remain a human reading `zoom_jobs.last_error` — `.reason`, `.detail`, `.evidence` — directly.
`supabase/.branches/`, if recreated by local Supabase gates, is CLI state only and must remain
untracked/uncommitted.

## Objective and scope (from plan §15, Z1b)

**Objective.** A secure Zoom schema plus the runtime that drives it: `zoom_internal` reachable
only by the service role, a durable job queue, a verified webhook receiver, host provisioning
under a real concurrency reservation, and the planned-minutes snapshot.

**In scope (delivered):** `zoom_internal` schema + GRANT lockdown (§6) · core tables with the
§9 host-concurrency EXCLUDE reservation · job-queue RPCs (`FOR UPDATE SKIP LOCKED`) ·
`session_meetings_public` projection with RLS per the §7 matrix · planned-minutes snapshot
column · the `lib/zoom/*` client layer (S2S token, REST client, SDK JWT signer, webhook
verification, `ZoomApi` seam + fake) · job runtime (ticker, runner, queue, registry) · the
webhook route · `host_sync` + reconcile · **`meeting_provision`** · **`webhook_sweep`** ·
**the §17 overlapping-ticker proof**.

**Out of scope (deliberately not here):** approve/reschedule/cancel hooks and any UI (Z2) ·
community-meeting provisioning (Z6) · recording, attendance and transcript handling (Z4/Z5/Z7)
· the Marketplace repoint and the Vercel env vars (human, post-merge) · migrations,
dependencies and es-CL copy in Z1b-4 specifically (server-only chunk).

## Files by risk

### Highest — concurrency and the reservation

- `lib/zoom/jobs/meeting-provision.ts` **(new, 921 lines after `ccb8fce`)** — host resolution,
  the EXCLUDE-backed reservation, the Zoom create, the post-create checkpoint, the projection
  upsert, and every resume path.
- `supabase/migrations/20260729120100_zoom_internal_tables.sql` (Z1b-1, approved) — the
  `zoom_meetings_host_no_overlap` EXCLUDE constraint this chunk now actually depends on.
- `scripts/ci/queue-concurrency-proof.mjs` **(new)** + the Gate-3 step in
  `.github/workflows/ci.yml` — the only CI edit of the phase.

### High — shared lifecycle and idempotency

- `lib/zoom/webhook-lifecycle.ts` **(new)** — extracted from the route so the route and the
  sweep share one implementation.
- `pages/api/zoom/webhook.ts` **(modified)** — now imports the extracted lifecycle; the gate
  order and CRC handling are untouched from approved Z1b-3.
- `lib/zoom/jobs/webhook-sweep.ts` **(new)**, `lib/zoom/webhook-store.ts` **(modified)**.

### Medium — dispatch and failure taxonomy

- `lib/zoom/jobs/registry.ts` **(modified)** — both new types registered; optional deps added.
- `lib/zoom/jobs/runner.ts` **(modified)** — `reason` added to the structured failure record.
- `pages/api/cron/zoom-reconcile.ts` **(modified)** — the hourly `webhook_sweep` enqueue.

### Lower — tests, config

- `__tests__/lib/zoom/jobs/{meeting-provision.test.ts, webhook-sweep.test.ts, provisionHarness.ts}`
- `__tests__/api/cron/zoom-reconcile.test.ts` (updated for the second planned job)
- `package.json` (one script: `test:queue`)

## Test evidence

Gates at head `4b71b3c`, local, macOS:

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` (zero warnings) | clean |
| `npm test` | **3641/3641 in 237 files** |
| `npm run build` | OK — all three Zoom routes in the route table |
| `npm run test:db` | **PASS — 6 files, 85 tests**, after a clean `supabase db reset` |
| `npm run test:queue` (§17 proof) | **PASS** — 40 jobs, 2 concurrent loops, splits 21/19 and 19/21 |

Merged baseline after absorbing `origin/main`: **3617/235**. Z1b-4's own delta: **+24 / +2**
— `meeting-provision.test.ts` (16), `webhook-sweep.test.ts` (7), `+1` in the reconcile suite.
`provisionHarness.ts` is a shared helper, not a test file.

**Z1b-4·r1 re-run at `ccb8fce`** (the fix commit; the doc commit after it touches no code):
type-check clean, lint clean, `npm test` **3646/3646 in 237 files** (+5 in
`meeting-provision.test.ts`, now 21), build OK, `npm run test:queue` PASS. **Negative controls,
run by the executor and not committed:** disabling the checkpoint adoption alone makes the
mid-crash test fail with `expected "createMeeting" to be called 1 times, but got 2 times` — the
orphan the finding describes; restoring the old `effectiveAutoRecording = 'none'` makes the
persisted-drift test fail with `expected 'none' to be 'cloud'`. Both new assertions bite.

### Z1b-sol1 re-run — gates at the final head (`7d4b062` + this doc commit), local, macOS

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` (zero warnings) | clean |
| `npm test` | **3680/3680 in 238 files** (from **3646/237** at `ae210a5`: **+34 / +1**) |
| `npm run build` | OK — all three Zoom routes in the route table |
| `npm run test:db` | **PASS — 6 files, 91 tests**, after a clean `supabase db reset` (mandatory this round: `20260729120200` was amended and pgTAP 002 changed) |
| `npm run test:queue` | **PASS** — 40 jobs, 2 concurrent loops, split 21/19 |

Per-file delta over `ae210a5`: `meeting-provision.test.ts` 21→**39** · `client.test.ts` 39→**44** ·
`zoom-ticker.test.ts` 24→**27** · `webhook.test.ts` 17→**21** · `webhook-sweep.test.ts` 7→**9** ·
new `__tests__/api/zoom/webhook-oversize.server.test.ts` (**2**). pgTAP `002` went 44 → **50**
asserts: the four `fail_zoom_job` EXECUTE asserts moved to the five-arg signature, plus four new
scheduling asserts run **as `service_role`** (unhinted ≈30 s · a 600 s hint floors `run_after` at
600 s · a 5 s hint cannot shorten the 60 s second backoff, and its `pending` return).

**Scanners, this round:** both committed scanners still exit **2** in this worktree, for the same
reason as before — their inputs are gitignored and live in the spike worktree, so they scanned
nothing. Reported as exit 2, not as a pass; the PM re-runs the real replication. Manual audit of
the Z1b-sol1 **implementation** diff, F1 through F5 — `ad649b3..7d4b062`, 21 files, +1889/−89;
the full round including F6's docs pass is `ad649b3..9648c3b`, 22 files, +2014/−101 (figure
relabelled in Z1b-sol2 per Sol R2 ④ — it had read as if it covered the whole round): 0 emails,
0 non-synthetic URLs (only
`example-synthetic.test`), 0 secrets, 0 real PII. New identifiers introduced this round are all
synthetic and inert: meeting numbers `82000001111`/`82000005555`/`82000009999` (the `82xxxxxxxxx`
range), request ids `synthetic-zm-request-id-0001`/`0002`, surface uuids of the obvious repeated
pattern, and `pgTAP` job/meeting uuids in the existing `dddddddd-`/`eeeeeeee-` families.

**Negative control on the §17 proof** (run by the executor, not committed): replacing the RPC
with a naive non-locking `SELECT`+`UPDATE` makes all 40 jobs double-execute and the proof fail
loudly. The assertions bite; the green is not vacuous.

**Scanners:** both committed scanners exit **2** in this worktree — their inputs are gitignored
and live in the spike worktree, so they scanned nothing. Reported honestly rather than as a
pass. Manual audit of the chunk diff: 0 emails, 0 non-synthetic URLs, 0 secrets, meeting
numbers all in the synthetic `82xxxxxxxxx` range. The one non-obvious value, `86084701483`, is
pre-existing in the synthetic fixture library and was only moved verbatim in a comment.

## What to scrutinize in Z1b-sol1 (the re-review scope)

**A. The guards are asserted against DOUBLES, not against PostgREST.** F1's monotonicity and
F3/F4's store additions are proven by in-memory doubles that model the conditional UPDATE (they
import the applies-from sets from the store, so the RULE cannot drift). What no test in this
repo exercises is the supabase-js chain itself — `update().eq().in().select()` on
`zoom_meetings`, and the `public`-schema chain on `session_meetings_public`. That gap is
pre-existing for every other store method in the phase, but F1 is the first one whose
CORRECTNESS depends on the filter reaching Postgres rather than merely on the row being written.

**B. `hibrida` is my call, and it is a widening.** The dispatch said "online-modality"; Sol's DoD
named only `presencial` as must-not-provision. I included `hibrida` because a hybrid session has
a remote leg and is exactly as entitled to a meeting, and because the real intent gate is Z2's
`is_zoom_managed`. If you disagree, `PROVISION_ELIGIBLE_MODALITIES` is one line.

**C. Eligibility is re-checked on the idempotent replay path too.** A `meeting_provision` that
re-runs after `complete_zoom_job` lost a race (at-least-once) will now fail
`session_ineligible` if the session has since moved to `en_progreso`, instead of returning its
idempotent result. The meeting and the row are untouched and the release guard refuses to touch
a row with a meeting number — so the cost is a spurious `failed` job in triage, not a data
problem. I judged a stricter gate worth that; say if you would rather exempt the
`alreadyCreated` path.

**D. `'cancelled'` as the release status.** F3 releases a bare reservation to `cancelled` rather
than `error`. `error` also frees the interval but reads as "provisioning failed transiently" and
invites a resume; `cancelled` says the meeting is not going to happen. Both are outside the
EXCLUDE predicate, so the host is freed either way.

**E. F4 changed the semantics of an UNTYPED throw.** A plain `Error` out of `createMeeting` is
now ambiguous (reservation kept, job terminal) where it used to be a definite failure
(reservation released, retryable). That is deliberate — an untyped throw is exactly the case
where we do not know — but it converts a previously-retrying failure class into a triage item.
The pre-existing test that covered this path was rewritten in place rather than deleted.

## The 4 areas to scrutinize hardest

**① The load-count query is an approximation, and I am claiming that is safe.**
`countHostLoads` re-derives the ±15/+45 reservation window in TypeScript rather than calling
`zoom_internal.meeting_reservation_window`, because PostgREST cannot invoke that function. My
argument is that this is safe *by construction* — the count only ORDERS candidates, and the
EXCLUDE constraint is what actually prevents double-booking, so an approximate count can pick
a worse host but can never produce an overlap. Please check that argument rather than the
arithmetic: if there is a path where the ordering alone can cause a wrong outcome, I have
missed it. The duplicated buffer constants (`RESERVATION_LEAD_MINUTES` /
`RESERVATION_TRAIL_MINUTES`) are a second copy of a number that lives in SQL, and copies drift.

**② The resume paths and what "created exactly once" actually guarantees.** *(Rewritten in
Z1b-4·r1 — `ccb8fce`. The original text of this section over-claimed; both findings are fixed,
and the part that cannot be fixed is now stated instead of implied.)*

Zoom's create API takes **no idempotency key**, so exactly-once creation is not purchasable from
the provider — it is reconstructed from two anchors, checked in order: (1) the row's
`zoom_meeting_number`; (2) a `stage: 'created'` checkpoint written into the job's own
`stage_state` by the heartbeat immediately after `createMeeting` returns, which a re-run
**adopts** (`markProvisioned` from the checkpoint) rather than creating again. `fail_zoom_job`
leaves `stage_state` untouched, which is the only window the checkpoint must survive;
`complete_zoom_job` replaces it, which is exactly why the row and not the checkpoint is anchor 1.

The honest guarantee: **a re-run that sees either anchor never creates a second meeting.**

**The residual, which is what to scrutinize.** If the process dies — or the lease is lost, so the
post-create heartbeat returns `false` and nothing is written — *between* the create returning and
the checkpoint landing, the retry sees neither anchor and creates a second meeting; the first is
orphaned at Zoom. This is irreducible without a provider-side idempotency key.

**Two orphan classes, and only one of them is named** (corrected in Z1b-sol2 per Sol R2 ④; the
code header at `meeting-provision.ts:97` already drew this line and this text did not):

- **Checkpoint LANDED.** `stage_state.meeting.number` on the failed job is the meeting number,
  and `fail_zoom_job` leaves `stage_state` untouched, so it survives for a human to act on. Normally
  this case does not orphan at all — the retry adopts. It orphans only when there is nothing to
  adopt onto, e.g. the `zoom_meetings` row is gone. Dead-job triage works here.
- **Pre-checkpoint crash or lease-loss.** Nothing was written, so the meeting is named **nowhere**:
  not on the row, not in `stage_state`, not in `last_error`. Dead-job triage on
  `stage_state.meeting.number` does not apply, because there is no such value. Recovering it
  requires a **Zoom-side search** — list the host's meetings around that window and match topic and
  start time — which is the same fuzzy reconciliation an `ambiguous_create_outcome` park needs.

Please check that judgment — the alternative I rejected was a pre-create `listMeetings` scan by
topic+time, which is that same fuzzy match on staff-authored text, done on every create, and would
still race.

Two sub-points worth your attention. First, the plaintext passcode now sits in
`zoom_jobs.stage_state`; I argue that is §5-equivalent to `zoom_meetings.passcode` because
`zoom_internal` is service-role-only by the same GRANT lockdown, so it is not a new exposure —
but it *is* a second location for a secret, and that is a real change. Second, the pre-create
heartbeat moved inside the create branch: left outside it, the `reserved` stage would overwrite
the checkpoint on the adopt path and reopen the window. That means the two resume paths no longer
verify the lease before writing; I judged that safe because both write values that are already
fixed (the row's, or the checkpoint's), so two workers racing write identical bytes.

**Settings drift is no longer assumed on any path.** `findMeetingBySurface` selects
`effective_settings`, and `effective_auto_recording` is derived from the row on the row-adopt path
and from the checkpoint's settings on the checkpoint-adopt path. The previous hardcoded `'none'`
reported a clean run for a meeting Zoom was recording; a negative control confirms the new test
fails against that old line.

**③ Host candidacy silently excludes personal hosts of non-facilitators.**
`orderHostCandidates` returns `null` for a host whose `profile_id` is a real profile that is not
a facilitator of this session, so it never becomes a candidate. I believe that is §9's intent —
you should not get somebody else's personal Zoom host. But combined with a small pool it makes
`no_host_available` reachable in a way that looks like a bug from the outside, and the terminal
non-retryable failure means no automatic recovery. Check that the terminal-vs-retryable call is
right here: I chose terminal because no backoff creates a host.

**④ The CI edit is three steps, not one.**
The dispatch authorized a single narrow CI edit. The Gate-3 job had no Node toolchain at all, so
the proof required `actions/setup-node` + `npm ci` alongside the run step. The change is purely
additive and confined to that one job — no other job is touched — but it is three steps rather
than the one the prompt described, and that is my judgment call to defend, not a technicality to
wave through. Also worth checking: `eval "$(supabase status -o env | grep '^DB_URL=')"` runs in
CI, and I verified the exact command locally, but a CI-only difference in that output format
would break the step.

## Known limitations and deferred items

1. **`meeting_provision` is never enqueued by product code yet.** Nothing calls it — the
   approve/reschedule/cancel hooks that will are Z2. It is reachable today only by a manual
   enqueue. That is per scope, but it means the handler ships without a production caller.
2. **`community_meeting` surfaces are rejected non-retryably** until Z6 wires them.
3. **The projection's `has_recording` is never written** — recordings are Z4.
4. **Stalled-lifecycle and settings-drift sweeps remain documented placeholders** in
   `planReconcileJobs()`; only `host_sync` and `webhook_sweep` are live.
5. **The §9.4 drift signal is recorded, not alerted on.** It lands in the job result, the row's
   `effective_settings` and a `console.warn`. Wiring it to the §18 health panel is a later chunk.
6. **`zoom_meeting_uuid` capture is only exercised against the fake**, since no live Zoom
   credentials exist in this worktree (`ZOOM_MODE=mock` throughout, per the dispatch).
7. **The create→persist window is narrowed, not closed** (Z1b-4·r1, see scrutiny area ②). A
   crash or lease-loss before the post-create checkpoint lands still orphans a meeting at Zoom.
   Cleanup is manual, and **which manual path depends on whether the checkpoint landed** — see
   the two orphan classes in scrutiny area ②. Dead-job triage on `stage_state.meeting.number`
   only works for the landed-checkpoint class; a pre-checkpoint orphan is named nowhere and needs
   a Zoom-side search by host + window + topic. Irreducible without a Zoom idempotency key; no
   automated orphan sweep exists (a candidate for a later chunk).
8. **`docs/runbooks/zoom.md` does not exist yet** (plan §16 puts it in a later phase), but two
   `meeting-provision.ts` comments cited it as if it did — one of them pre-existing, one added by
   F4. Corrected in F6: both now say the runbook is unwritten and that triage today means a human
   reading `zoom_jobs.last_error` and `stage_state` directly. This matters more after F4, because
   `ambiguous_create_outcome` is a failure class whose ONLY resolution is manual reconciliation
   against Zoom.
9. **Repo-level debt carried, not introduced (Z1b-3 finding ⑦):** `tsconfig.json` excludes
   `__tests__` from type-check *and* sets `strict: false`, which contradicts CLAUDE.md's
   "TypeScript strict". Already ticketed; Brent rules on the wording.
10. **Post-merge human prerequisites:** repoint the Marketplace subscription to
   `https://<prod>/api/zoom/webhook`; set `ZOOM_WEBHOOK_SECRET_TOKEN` and `CRON_SECRET` in
   Vercel (Production). If validation 401s at repoint, see the CRC contingency in the Z1b-3
   ledger row.

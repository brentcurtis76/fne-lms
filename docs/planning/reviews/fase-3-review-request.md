# Fase Z1b — Review request

> Per CLAUDE.md executor rule 6. Reviewer protocol: `docs/planning/review-protocol.md`.
> Design authority: `docs/planning/zoom-integration-plan.md` §6, §8–§12, §14, §15, §17, plus the §0 ledger rows Z1b-1…Z1b-3.

## Branch and scope of this request

| | |
|---|---|
| Branch | `feat/zoom-core` (PR [#26](https://github.com/brentcurtis76/fne-lms/pull/26), **draft — not marked ready**) |
| Base | `origin/main` @ `18057e2` (absorbed mid-phase via merge `5d54f12`, which brought the contracts track `c878ec7`) |
| Head at request time | `4b71b3c`; **`ccb8fce` + this doc commit after the Z1b-4·r1 remediation** |
| Commits ahead of `origin/main` | **28** (26 + the 2 r1 commits) |
| Net diff vs `origin/main` | 53 files, +11734/−70 |
| This chunk (Z1b-4) alone | merge `5d54f12` + 3 commits; 15 files, +2484/−92 |
| Z1b-4·r1 remediation | `ccb8fce` (fix + tests + `PROJECT_STATE.md`) + this doc commit; 2 PM findings, no scope beyond them |

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

**Negative control on the §17 proof** (run by the executor, not committed): replacing the RPC
with a naive non-locking `SELECT`+`UPDATE` makes all 40 jobs double-execute and the proof fail
loudly. The assertions bite; the green is not vacuous.

**Scanners:** both committed scanners exit **2** in this worktree — their inputs are gitignored
and live in the spike worktree, so they scanned nothing. Reported honestly rather than as a
pass. Manual audit of the chunk diff: 0 emails, 0 non-synthetic URLs, 0 secrets, meeting
numbers all in the synthetic `82xxxxxxxxx` range. The one non-obvious value, `86084701483`, is
pre-existing in the synthetic fixture library and was only moved verbatim in a comment.

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
orphaned at Zoom. This is irreducible without a provider-side idempotency key. What the
checkpoint buys when it lands is that the orphan is **named**: `stage_state.meeting.number` on
the failed job is the meeting number a human cancels via dead-job triage. Please check that
judgment — the alternative I rejected was a pre-create `listMeetings` scan by topic+time, which
is a fuzzy match on staff-authored text and would still race.

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
   Cleanup is manual, via dead-job triage on `stage_state.meeting.number`. Irreducible without a
   Zoom idempotency key; no automated orphan sweep exists (a candidate for a later chunk).
8. **Repo-level debt carried, not introduced (Z1b-3 finding ⑦):** `tsconfig.json` excludes
   `__tests__` from type-check *and* sets `strict: false`, which contradicts CLAUDE.md's
   "TypeScript strict". Already ticketed; Brent rules on the wording.
9. **Post-merge human prerequisites:** repoint the Marketplace subscription to
   `https://<prod>/api/zoom/webhook`; set `ZOOM_WEBHOOK_SECRET_TOKEN` and `CRON_SECRET` in
   Vercel (Production). If validation 401s at repoint, see the CRC contingency in the Z1b-3
   ledger row.

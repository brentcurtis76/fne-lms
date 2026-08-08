# Fase 5 (Zoom phase Z2) — PM dossier for independent review

> Written by the PM per `docs/plan/zoom/PLAN.md` §0.2 step 2. This is the independent
> reviewer's map of the phase. It is a **lead, never a boundary** — review the diff.

---

## 1. Identity

| | |
|---|---|
| **Phase** | **Z2 — Link-mode session MVP** (Zoom plan §15). Review-request numbering `fase-5`. |
| **Branch** | `feat/zoom-sess` |
| **Base** | `main` at the merge-base; the branch is **30 commits** ahead |
| **Head at review** | `2f0e5385` |
| **PR** | **NONE OPEN at the time of writing.** The last Zoom PR was #42 (Z1c). Opening it is Brent's call; if it is open by the time you read this, review against it and tell us if its contents differ from `main...feat/zoom-sess`. |
| **Diff size** | **75 files, +16,741 / −139** |
| **Migrations** | **4** (see §6) |
| **Rounds** | 20 (r1–r20). Six ended `FINDINGS` with nothing committed — see §9. |

Repo root is `/Users/brentcurtis/dev/fne-lms` (moved out of `~/Documents` on 2026-08-05
after iCloud evicted the shared `.git`; never put a checkout under `~/Documents`).

---

## 2. Scope — authoritative for your scope-fidelity check

This phase is **not in the GENERA itinerary**. The authority is `PLAN.md` §15's Z2 row plus
the per-chunk scopes below.

**§15 Z2 row, verbatim:** *Provision-at-approve hooks (+bulk, reschedule sync + atomic
pre-execution reschedule→reservation+snapshot update, cancel, series); `/meet/session/[id]`
SSR page + join API (link-out mode); JoinMeetingButton in detail pages + workspace Sesiones
tab; notifications `session_created/rescheduled/cancelled` + reminders w/ platform link;
dual-zone ("hora Chile" inputs + Madrid preview) wiring; dial-in display; v2.1:
hours-consumer audit (school-hours-report + analytics off `actual_duration_minutes`, onto
ledger/snapshot).*

**§15 exit criteria:** *Staging: approve → join via platform link works per persona matrix;
cancel kills join; no consumer displays non-ledger hours.*

### 2.1 Chunk → commit map

| Chunk | What it delivered | Sealing commit |
|---|---|---|
| Z2-1 | Durable managed intent + provision-at-approve enqueue (+ migration) | `42ecdf6` |
| Z2-2a | Join policy + join API | `6c71eda` |
| Z2-2b | `/meet/session/[id]` SSR + JoinMeetingButton + scheduler control | `c2be4ec9` |
| Z2-3a | Atomic pre-execution reschedule → reservation + snapshot RPC (+ migration) | `334de02a` |
| Z2-3b | Zoom convergence: `meeting_sync` / `meeting_delete`, cancel/series/modality-flip | `118a9db8` |
| Z2-5a | School-hours-report drill-down repair (two phantom columns) | `8c350fa7` |
| Z2-5b | §11 hours retarget: both consumers bill from the ledger | `24be1034` |
| Z2-4a | `session_created` / `session_rescheduled` / `session_cancelled` notifications | `ea2b4556` |
| Z2-4b | RFC 5545 `SEQUENCE` on every .ics surface | `3685644c` |
| Z2-4c | Dual-zone: Chile-marked inputs + Spain preview | `f92c2bcb` |
| Z2-4d | `dial_in_numbers` column + RPC derivation (+ migration) | `978e68a1` |
| Z2-4e | Dial-in through the join opening + rendering (+ migration) | `2f0e5385` |

**Chunk numbering is not contiguous and that is deliberate:** Z2-2/3/5 were each split, and
**Z2-4 was lost by an earlier PM and recovered mid-phase** (§9, finding 4), which is why the
4-series sealed after the 5-series.

### 2.2 Explicitly OUT of scope (do not report as missing)

- **Meeting SDK embed / Component View** — phase Z3.
- **Attendance ingestion, hours comparison, override UI** — phase Z7.
- **Recording, transcripts, sanitizer, AI minuta** — later phases; recording is provisioned
  OFF and only enabled by the consent-gated PATCH.
- `METHOD`/iMIP and any subscribable calendar feed — open, unowned (§8, item 1).
- Admin/consultor session-detail dial-in rendering — PM ruling, Z2-4e.

---

## 3. File inventory by risk

### 3.1 HIGHEST RISK — money, authorization, or a trust boundary

| File | Purpose |
|---|---|
| `lib/services/billable-hours.ts` **(new)** | The ONE derivation of "how many hours does this session bill". Two modes; `charged_total` counts only `consumida`/`penalizada`, and an un-ledgered session contributes **0**. |
| `pages/api/sessions/reports/analytics.ts` | `total_hours_actual` retargeted off `actual_duration_minutes` onto the ledger. Money-adjacent KPI. |
| `lib/services/school-hours-report.ts` | Drill-down retargeted; also repaired two columns the query never had. |
| `supabase/migrations/20260805120000_reschedule_hours_rpc.sql` | Atomic reschedule → reservation + snapshot. 304 lines of SECURITY DEFINER SQL. |
| `pages/api/meet/session/[id]/join.ts` **(new)** | **The single authorized opening through the zoom_internal trust boundary.** Seven documented outcomes; Z2-4e widened outcome 7 only. |
| `lib/utils/meeting-join-policy.ts` **(new)** | Join authorization decision. |
| `lib/utils/meeting-dial-in.ts` **(new)** | Whitelist that builds the dial-in payload. Decides what credential-shaped data leaves the boundary. |
| `supabase/migrations/20260806120000_zoom_dial_in_numbers.sql` | Adds `dial_in_numbers`; **re-issues two SECURITY DEFINER RPCs by hand-copy** at identical signatures. |
| `lib/zoom/jobs/meeting-provision.ts` | Amended in Z2-1 only; untouched by Z2-4d/4e. Its CAS/atomicity was settled over four earlier review rounds. |

### 3.2 MEDIUM — behaviour visible to users

`lib/services/session-lifecycle-notifications.ts` (new) · `lib/notificationEvents.ts` ·
`lib/notificationService.ts` · `lib/utils/session-ical.ts` · `lib/utils/session-timezone.ts` ·
`lib/zoom/jobs/meeting-sync.ts` (new) · `lib/zoom/jobs/meeting-delete.ts` (new) ·
`lib/zoom/provisioning-intent.ts` (new) · `pages/api/sessions/[id]/index.ts` ·
`pages/api/sessions/edit-requests/[eid].ts` · `pages/api/sessions/[id]/{approve,cancel}.ts` ·
`pages/api/sessions/bulk-approve.ts` · `pages/api/sessions/series/[groupId]/cancel.ts` ·
the three `ical.ts` endpoints · `pages/meet/session/[id].tsx` ·
`components/sessions/{JoinMeetingButton,MeetingDialIn,EditRequestModal}.tsx` ·
`pages/admin/sessions/create.tsx`

### 3.3 LOWER — types, flags, fake, migrations, tests

`lib/zoom/{api,fake,jobs/registry}.ts` · `lib/featureFlags.ts` · `lib/types/*` ·
`supabase/migrations/20260804120000_zoom_managed_intent.sql` ·
`supabase/migrations/20260807120000_backfill_zoom_dial_in_numbers.sql` (DML only) ·
`supabase/tests/{002,011,012}*.sql` · 28 test files.

---

## 4. Invariants, with entry points for verifying each

1. **The raw `join_url` never leaves the trust boundary except through the join route.**
   `pages/api/meet/session/[id]/join.ts:26` (outcome table), `:164` (the internal read),
   `:182-195` (the only response carrying it). Negative side:
   `lib/utils/session-ical.ts:16-20`, `lib/services/session-lifecycle-notifications.ts`
   (invariant 2 in its header), `__tests__/lib/zoom/dial-in-forbidden-surfaces.test.ts`.
2. **Dial-in credentials leave through the same single opening and nowhere else.**
   `lib/utils/meeting-dial-in.ts:1-28` (the ruling and the whitelist rationale),
   `buildJoinDialIn` at `:69`.
3. **`public.session_meetings_public` carries zero secret fields.**
   `supabase/migrations/20260729120300_session_meetings_public.sql:44` (the table COMMENT);
   asserted at schema level in `supabase/tests/002-zoom-internal-isolation.sql` (Z2-4d `[F7]`).
4. **Billing hours come from the ledger, never from `actual_duration_minutes`.**
   `lib/services/billable-hours.ts:63-100`; consumers at `school-hours-report.ts:222`
   (`per_session_display`) and `analytics.ts:358` (`charged_total`) — **the only two
   callsites in the tree**.
5. **`charged_total` counts only a ledger row with a charged status.**
   `billable-hours.ts:41-58` (`CHARGED_LEDGER_STATUSES` and the `devuelta` trap),
   `:86-92` (the un-ledgered ⇒ 0 branch).
6. **A reschedule is told to Zoom, to the ledger and to the participants.**
   `pages/api/sessions/[id]/index.ts` (PUT: sync enqueue, notification, hours RPC) and
   `pages/api/sessions/edit-requests/[eid].ts` (the second path).
7. **Notification payloads never carry `meeting_link` or credentials.**
   `lib/services/session-lifecycle-notifications.ts` header invariant 2; recipients are the
   session's own facilitators + attendees only.
8. **The cleanup gate is ungated by both §14 flags** (Z2-3b's `[A10]` ruling) — a kill switch
   must not strand live Zoom meetings.
9. **Every table in `public` has RLS.** `supabase/tests/001-rls-enabled.sql`; the four
   migrations add no `public` table and no RLS change.

---

## 5. What the PM verified — and what it did NOT

### 5.1 Verified, by the PM, at the head `2f0e5385`

```bash
npm run type-check && npm run lint && npm test && npm run build
npm run test:db
```

**type-check 0 · lint 0 · 4617 passed / 281 files · build 0 · `test:db` Files=9, Tests=393,
Result: PASS.** Run unpiped with per-gate exit codes captured to files (never through
`tail`, which has twice masked a failure on this workstream).

Also verified by the PM directly, not through the tests that assert them:
- Both provisioning RPCs report `uuid, bigint, text, text, jsonb, uuid` via
  `oidvectortypes`, and **exactly two functions exist with those names — no overloads**.
- `public.session_meetings_public` has **0** columns matching `%dial%`.
- `has_column_privilege('anon', 'zoom_internal.zoom_meetings', 'dial_in_numbers', 'SELECT')`
  is **false**.
- The two hand-copied SECURITY DEFINER bodies in `20260806120000` differ from their
  originals in `20260731120000` by **exactly one line each** (diffed programmatically).
- The backfill's pgTAP hand-copy (`002-zoom-internal-isolation.sql:828-831`) is
  **character-identical** to the migration's statement.
- `billableHours` has exactly two callsites in the tree.
- `Europe/Madrid` / `CONSULTANT_TIMEZONE` appear only in `lib/utils/session-timezone.ts`.

**PM-run mutation probes** (each reverted with blob-hash proof of byte-identity):
mode-blind `!entry` in `billableHours` → 5 fail; `end_time` dropped from
`hasScheduleChanged` → 4 fail; iCal sequence pinned to a **nonzero** constant → 10 fail;
Spain pinned to a **fixed UTC+1** zone → 6 fail (passes January, fails July); the dial-in
derivation deleted from **`recover_provisioned_meeting`** → pgTAP test 88 only (the mirror
of the executor's, which killed 90 only); the dial-in **whitelist bypassed** → caught;
`dial_in` made unconditional → 8 fail, including the `[A7]` payload-shape assertions.

### 5.2 NOT verified — your highest-yield hunting ground

1. **Nothing has run against a real Zoom tenant.** Every handler test uses
   `createZoomFake()`; CI runs `ZOOM_MODE=mock`. **The dial-in wire shape
   (`settings.global_dial_in_numbers`) comes from Zoom's documentation, not an observed
   response** — the fake is the only producer these assertions have ever seen.
2. **Nothing has been applied to production.** All four migrations are unapplied there.
   Local green proves code, not deployment — Z1b shipped six unapplied migrations and broke
   session approval in production after ten green review rounds.
3. **No browser, no device, no viewport.** The dual-zone previews and the dial-in block were
   never rendered in a real browser. No screen-reader check; the Spain preview has no
   `aria-describedby`.
4. **No e2e coverage for dial-in.** The seeded synthetic tenant provisions without an audio
   plan, and giving it one would change what every other assertion in
   `tests/e2e/zoom-join-authz.spec.ts` runs against.
5. **Supabase doubles, not PostgREST.** The analytics and school-report suites use
   hand-built doubles; the widened `select()` in `series/[groupId]/ical.ts` is not proven
   against real PostgREST.
6. **Two hand-copies are the structural weak points** — the two RPC bodies and the backfill
   statement. The PM diffed both mechanically (§5.1), but a diff proves sameness, not
   correctness of the original.
7. **The unit suite flaked twice, unexplained.** Two failures in early runs at `7315ec85`
   (`pasantias-pdf` method guards returning 200; `api-auth` at file level), then **47 clean
   runs** across two sessions at the same tree. The PM's attribution to a new test file was
   **wrong and was overturned by the executor's investigation**. Cause unknown. Watch CI.
8. Four suites carry pre-existing within-file order dependencies, exposed under
   `--sequence.shuffle` with and without this branch.

---

## 6. Migrations — all four unapplied in production

| File | Kind | Notes |
|---|---|---|
| `20260804120000_zoom_managed_intent.sql` | additive columns | Z2-1 |
| `20260805120000_reschedule_hours_rpc.sql` | new SECURITY DEFINER RPC (304 lines) | Z2-3a; pgTAP `012-` (451 lines) |
| `20260806120000_zoom_dial_in_numbers.sql` | additive column + **two RPCs re-issued in place** | Z2-4d; no DROP, signatures unchanged |
| `20260807120000_backfill_zoom_dial_in_numbers.sql` | **DML only** | Z2-4e; guarded, idempotent |

No `DROP`, no destructive `ALTER`, no RLS change, no `public` table added.

**Required before merge is considered complete** (Brent-authorized, read-only): confirm in
production the Z2-1 columns, the reschedule RPC, `zoom_internal.zoom_meetings.dial_in_numbers`,
both provisioning RPC signatures — **and** count `consultor_sessions` with
`status='completada'` that have no `contract_hours_ledger` row, which sizes the visible
`total_hours_actual` drop when the retarget ships (see §8 item 3).

---

## 7. Accepted deviations — challenge any of these

The PM ruled on each; none was ruled by Brent. If you think a ruling is wrong, file it at
the severity it deserves.

1. **`end_time` counts as a reschedule** (r15). The PM's earlier prompt omitted it; the
   executor excluded it and flagged the exclusion; the PM **overruled itself** — extending a
   session re-bills the school and extends the Zoom meeting, so silence was wrong.
2. **`charged_total` + no ledger row ⇒ 0** (r13). A behaviour change: a *finalized* session
   with no ledger row used to contribute its scheduled duration and now contributes nothing.
   Deliberate; unmeasured in production (§5.2 item 2, §8 item 3).
3. **Dial-in rendering lives in `JoinMeetingButton`, not the page** (r20). The PM's prompt
   named the page; the executor moved it because `getServerSideProps` never reads
   `zoom_internal` and props would have put the passcode in served HTML before any click.
   **Accepted as better than the ruling.**
4. **Dial-in credentials may leave through the join route** (r20 ruling 1). The reasoning is
   that the route already returns the passcode-embedded `join_url` to the same caller. **This
   is the single most consequential PM ruling of the phase — scrutinise it.**
5. **Value-based reschedule comparison** rather than key-presence, in the edit-request path.
6. **Emit notifications before the hours sync**, which can 500 — so a 500 response may still
   have notified. The update has committed, so the move is real.
7. **A partial recipient read still notifies whoever was found**, with the shortfall logged.
8. **Grants re-asserted per signature** in `20260806120000` rather than repeating the
   ancestor's blanket revoke. PM logged the stated rationale as imprecise but the action
   correct.
9. **`test:db` did not run for four rounds** (Docker down); r14–r16 shipped without it. None
   touched SQL, and the gate was green before and after.

---

## 8. Open items and residual risks

1. **`SEQUENCE` narrows the stale-calendar problem; it does not close it.** All three .ics
   endpoints serve `Content-Disposition: attachment` and there is **no subscription surface**,
   so a revision only reaches someone who re-downloads and re-imports. The two real remedies
   — a subscribable feed, or `METHOD:REQUEST` by e-mail — are **product decisions, unowned**.
2. **Dial-in does not survive the outage that motivates it.** `PLAN.md:187` justifies dial-in
   as a school-internet-outage fallback, but a participant with no internet cannot load the
   page that shows the number, and the disclosure rules forbid notifications and .ics for
   these values. What ships serves a different real case (failing A/V, or a device that
   cannot run the client, while the page still loads). **Brent's call.**
3. **`total_hours_actual` will visibly drop** for any tenant with finalized-but-un-ledgered
   sessions. Unquantified — see §6.
4. `total_hours_actual` keeps a name that is now inaccurate.
5. Four other ledger readers do not route through `billableHours` (none reads
   `actual_duration_minutes`, so none carries the defect).
6. Two unruled defects logged in r11: `bucketError` `continue`
   (`lib/services/school-hours-report.ts:139-142`) and the `SESSION_STATUS_FALLBACK`
   mismatch (`:57-63`).
7. No send-once ledger for lifecycle notifications; a 30-session series cancel emits 30
   sequential notifications with no batching.
8. `create.tsx` computes the date input's `min` from UTC "today", not Chile today — an
   off-by-one-day trap for a late-evening Chilean scheduler.
9. Notification `defaultUrl` is `/consultor/sessions` for all three lifecycle events, though
   an attendee may not be a consultor (pre-existing pattern).
10. Rendered dial-in numbers have no ordering, cap or country preference.
11. A dead-lettered `meeting_sync` leaves the row ahead of Zoom until reconcile;
    `sync_host_busy` has no automatic remedy.
12. Local env: this host's Docker registry path is wedged, so the Homebrew `supabase` CLI
    hangs on `db reset`; use `npx supabase` (2.111.0).

---

## 9. How this phase was built — context for judging it

Twenty rounds. **Six ended `STATUS: FINDINGS` with nothing committed, and every one of the
six was a PM error**, caught by the executor refusing to build on a bad instruction:

1. r2 — a prompt required a transition the frozen plan forbids.
2. r9 — an acceptance criterion contradicted §14; the executor escalated instead of choosing.
3. r10 — a chunk was told to build on a query referencing two columns that never existed.
4. r12 — two PM rulings contradicted each other, inflating a money KPI.
5. **r18 — the PM asked for a `DROP` the repo forbids RED-tier**, on two SECURITY DEFINER
   RPCs whose 6-arg signature the pgTAP suite asserts by literal string.
6. r15 — the PM's blocking finding (a test file destabilising the unit gate) was **wrong**;
   the executor's 35-run investigation overturned it and the PM's own 12-run replication
   confirmed the reversal.

Two PM naming slips also reached prompts (`assertCreateResponse` for
`findUnusableCreateFields`; a stale review-path). **The dossier's §5.2 and §7 are where a
seventh PM error is most likely to be hiding.**

---

## 10. Gate commands

From a worktree of `feat/zoom-sess` at `2f0e5385`, with `node_modules` installed and
`.env.local` present (gitignored, carries real keys — copy it, never print or commit it):

```bash
npm run type-check && npm run lint && npm test && npm run build
```

```bash
npm run test:db
```

Docker must be up for `test:db`; if `supabase db reset` hangs, use `npx supabase`.

---

# ADDENDUM — remediation of Sol's `REQUEST CHANGES`, rounds r21–r28

> Appended by the PM after the twelve-item verdict. Everything above still stands as the
> map of the phase; this section is the record of what changed since, and it is what the
> re-review should be scoped against.

## A1. Identity at re-review

| | |
|---|---|
| **Head** | **`ea60941e`** (the dossier commit sits on top and is docs-only) |
| **Was** | `2f0e5385` at first review |
| **Rounds** | r21–r28, eight remediation rounds |
| **Gates at head, PM-verified** | type-check 0 · lint 0 · **4726 passed / 283 files** · build 0 · **`test:db` Files=11, Tests=466, PASS** · **mandatory e2e list 88 passed, 7 specs, no-skip guard green** |
| **Migrations** | **SEVEN** — `20260804120000_zoom_managed_intent`, `20260805120000_reschedule_hours_rpc` (rewritten in r21), `20260806120000_zoom_dial_in_numbers`, `20260807120000_backfill_zoom_dial_in_numbers`, `20260808120000_session_reschedule_atomic`, `20260809120000_fix_bucket_summary_fanout`, `20260809120100_reschedule_rpc_uses_bucket_summary` — **none applied to production**. *(ERRATUM: this line said "6" at re-review while enumerating seven. Sol's m5. The count was wrong in the document written to be the reviewer's map, on the same axis as M4. `PROJECT_STATE.md` now carries a filename manifest instead of a count, and so does this row.)* |

## A2. The twelve items

| # | What it was | Closed by |
|---|---|---|
| 1 | `DROP CONSTRAINT` in the reschedule migration — a RED-tier rule break | r21 — block deleted; revision now uses an allowed `action` + typed `details.event_type`; allowlist back to its 16 baseline values, **PM-verified in the catalog** |
| 2 | Two reschedule flows, schedule and ledger written separately | r21 — one service-role `apply_session_reschedule`; atomicity proved by injected failure; optimistic guard moved inside |
| 3 | `get_bucket_summary` multiplied allocations by ledger rows | r22 — allocations and ledger aggregated separately. **A live production defect, not a Z2 regression** |
| 4 | Join route trusted a projection that can be stale | r23 — source `status`/`modality` refuse **before `zoom_internal` is read at all** |
| 5 | `meeting_provision` / `meeting_delete` uncoordinated per surface | r24 — post-create re-check + explicit compensation; failure parks loudly |
| 6 | Managed sessions got no platform link anywhere | r26 — one predicate across notifications, both reminders, all three .ics |
| 7 | Workspace tab had no join control | r26 |
| 8 | Failed ledger read read as "no hours" | r27 — fails instead; a second, worse instance found and fixed |
| 9 | Join policy not enforced on `/meet` SSR | r25 — **after a plan amendment; see A3** |
| 10 | Backfill proved by a retyped copy of the migration | r27 — replays the migration's own recorded statements; proved by editing the file only |
| 11 | `PROJECT_STATE.md` | r28 |
| 12a | Full gate re-run | r28 |
| **12b** | **Staging against a real audio-plan Zoom tenant** | ❌ **NOT DONE — owner's, needs real credentials** |

## A3. The plan was amended — read this before reviewing item 9

`PLAN.md` §5 said `authorizeMeetingJoin()` governs the `/meet` page's `getServerSideProps`.
**Round r23 refused to implement it and was right.** `canViewSession` and the §5 join list are
not nested, so substituting one for the other re-tiers four roles; and the page renders a raw
pasted `meeting_link` for `google_meet`/`teams`/`otro` sessions, so widening page visibility
widens who can join those. A **mandatory** e2e spec encoded the opposite.

**Amended by owner decision**, recorded in `PLAN.md` §5 with full rationale: page visibility
keeps `canViewSession`; **`authorizeMeetingJoin()` governs the join CAPABILITY** — the Zoom
affordance *and* the raw pasted link; the §14 kill switch is enforced in `/meet` SSR.

A second owner ruling followed: the mandatory spec asserted that view-only personas **do**
receive the raw pasted link. **Owner ruled "make it consistent"** — view-only means the same
for every provider, and those assertions were inverted deliberately.

**Both were owner decisions, not PM ones.** Challenge them if you disagree, but do not read
them as a PM ignoring the plan.

## A4. What the PM verified at re-review — and what it did not

**Verified independently at `ea60941e`:** all five gates, re-run unpiped with per-gate exit
codes. **The new e2e spec re-run by the PM itself** against a freshly seeded local stack —
**12 passed**. The seeded fixtures read directly from the database: three sessions, two
unmanaged, **one managed with a NULL `meeting_link`** — added, never flipped. The `ci.yml`
change is exactly two `echo` lines with their rationale. The backfill hand-copy is gone.

**Eight PM mutation probes across these rounds**, each deliberately different from the
round's own, each reverted with blob-hash proof: neutralising the optimistic guard (writes
**both** tables); `SUM(DISTINCT …)` — the plausible wrong fix, which passes the fan-out case
and dies on the equal-allocations case; reopening **only** `cancelada`; disabling **only**
the second coordination point (exactly one test fell); leaking the link into props while the
UI still denies; widening live job statuses so an anomaly defers silently.

**NOT verified, and this is the re-review's highest-yield ground:**

1. **Nothing has run against a real Zoom tenant. Item 12b is not done.** Everything green is
   green against the fake adapter.
2. **Nothing is applied to production.** Six migrations wait, including a `get_bucket_summary`
   replacement that changes numbers every hours dashboard shows.
3. **`mode: 'link'` and the dial-in block have no e2e coverage** — the synthetic tenant seeds
   no `zoom_internal` row, so the opening answers `pending`.
4. **The §14 OFF branch has no e2e coverage** — one Playwright run has one server, so the flag
   has one value per run. Unit-tested only.
5. **The e2e tenant now runs with the Zoom master flag ON**, which is not the production-safe
   default. Whether that should be the default, or whether two jobs are warranted, is
   unresolved.
6. **r24's deferral rests on r24's compensation being unconditional** — read off the module
   header and its two compensation sites, not proved in r27. The r27 round flagged this as its
   own top scrutiny item.
7. **The migration-statements replay asserts what ran, not what is on disk.** They coincide in
   CI, which resets every run; locally they require `db reset` in the loop.

## A5. New accepted deviations — challenge these too

1. **r21** — only duration-relevant updates route through the new RPC, so the optimistic guard
   now exists in two places.
2. **r22** — `SET search_path TO 'public'` added to `get_bucket_summary` so the RPC can call
   it. Function is invoker-rights, so this is a hardening, not a privilege change.
3. **r26** — a `session_cancelled` notification now carries a link that resolves to the closed
   page. Suppressing it needed a special case the criteria forbade.
4. **r27** — the fix extended to a second query Sol did not name, whose error was never
   captured at all.
5. **r28** — `FEATURE_ZOOM_MEETINGS` turned ON for the e2e tenant. Forced: with it off there is
   no affordance to assert.
6. **r28** — `PROJECT_STATE.md` updated in Spanish, matching the existing document rather than
   `CLAUDE.md`'s English-for-technical-docs rule.

## A6. Standing items deliberately left unruled

`SESSION_STATUS_FALLBACK` mismatch · `total_hours_actual`'s now-inaccurate name ·
`create.tsx`'s date `min` computed from UTC rather than Chile time ·
four suites with pre-existing within-file order dependencies (visible under
`--sequence.shuffle`, present with and without this branch) ·
`'edit_approval_blocked'` at `pages/api/sessions/edit-requests/[eid].ts:195`, **which is not in
the `session_activity_log` action allowlist and would throw if that branch fired** —
pre-existing, unrelated to Zoom, and its fix must follow r21's pattern rather than widening the
allowlist.

## A7. The PM's own errors, for calibration

The first review found nine PM errors; remediation added more. Items **1** and **8** were both
**PM failures of ruling** — a `DROP` approved without grepping the migration, then forbidden
two rounds later; and a defect logged "unruled" across three rounds and never ruled. Item
**9** was a PM ruling that would have shipped a disclosure regression, refused by an executor.
And during r26 the PM nearly filed a finding against a correct test suite on the strength of
its own bad patch, catching it only by re-checking the instrument.

**Six rounds across this phase ended `FINDINGS` with nothing committed, and every one traced
to the PM.** Where this dossier and the code disagree, the code is more likely right.

---

# ADDENDUM 2 — Sol round-2 remediation, round r29

**Head: `c453cee3`.** Sol's round-2 verdict was `REQUEST CHANGES` (narrow): four MAJOR, six
MINOR. **The PM verified all four MAJORs against the code before dispatching; every one held.**
Round r29 closed them in one pass.

| Finding | Fix | PM verification |
|---|---|---|
| **M1** — a checkpointed meeting survives when `meeting_delete` retires the bare reservation first: numberless row ⇒ delete skips Zoom, marks `deleted`, clears `last_error`, completes green ⇒ the provisioner's compensation cannot fire because it required an ACTIVE status ⇒ terminal `session_ineligible` and a **live meeting** | Compensation predicate widened to ACTIVE **or** retired (`cancelled`/`deleted`), keeping the numberless precondition — a retired numberless row is the row whose retirement proves Zoom was never called. Module header's false "no third window" claim corrected | Interleaving driven deterministically with the **real** `meeting_delete`; end state asserts the fake holds no meeting. Round's probe restoring ACTIVE-only fails it with the live-meeting diff printed first |
| **M2** — `schools`/`clientes`/`contratos` reads swallowed `.error`, so a failed read returned **200 with an empty whole-school report** | All three destructure and throw; PGRST116 still the honest 404 | Asserted per read; legitimate-empty still returns a valid empty report |
| **M3** — `hour_types` read swallowed, so a `presencial` cancellation evaluated under online thresholds ⇒ **wrong durable money status** | Throws on `.error`. **PM ruled fix-now** rather than deferring: pre-existing is not a defence when the harm is a wrong billing status on a ledger row | Successful `presencial`/`online`/`both` still classify exactly as before |
| **M4** — `PROJECT_STATE.md` said four migrations; the branch carries **seven**. The Z1b closing defect re-armed by the document recording the rule against it | Every occurrence corrected and **the count replaced by a seven-file tick-off manifest** | PM ran both DoD greps: `grep -c` = 3, and the manifest **diffs identically** against `git diff --name-only main...HEAD -- supabase/migrations/` |

**MINORs closed:** m1 (compensation-loudness claim qualified where written — it was true for two of three triggers), m4 (`if_updated_at` now passed on the edit-request path; a stale value returns 409 with nothing written), m6 (the §5 amendment's location recorded in the review file; `main` deliberately **not** merged so the fix diff stays clean for re-review). m2 and the `'edit_approval_blocked'` audit insert are ticketed, by explicit PM ruling.

**Gates at `c453cee3`, PM-re-run:** type-check 0 · lint 0 · **4740 passed / 284 files** · build 0 · **`test:db` Files=11, Tests=466, PASS** · mandatory e2e 88 passed, 7 specs, guard green.

**PM-verified beyond the gates:** `.env.local` restored (zero localhost references, production host back) after the round wrote it for the e2e run; the manifest matches git exactly; the widened predicate keeps its numberless precondition and the ambiguous-park precedence.

## New, for this re-review

1. **One PM probe survived, and it is a COVERAGE observation, not a defect.** Dropping the
   `held.zoom_meeting_number === null` precondition from the widened predicate passes all 116
   tests in that suite. **The code is right** — the comment explains that a retired *numberless*
   row is the one whose retirement proves Zoom was never called — **but nothing pins that
   precondition.** A future edit could drop it silently. Worth a test; not worth a round on its
   own. Recorded rather than fixed, because this round was scoped to the findings.
2. **Two overlapping concurrency guards** now exist on the edit-request path — the pre-existing
   JS old-value comparison and the RPC's `SESSION_CONFLICT` — with different 409 copy. The round
   flagged it and did not change it. Wants a ruling.
3. **The branch still does not contain the §5 amendment** (m6, accepted): it lives on `main`, and
   merging was deliberately deferred so this fix diff stays reviewable. A branch-only reader sees
   the pre-amendment sentence; merging resolves it.

**Unchanged and still true:** item 12b is not done — **no code in this phase has ever run against
a real Zoom tenant**; seven migrations are unapplied in production; `mode:'link'`, the dial-in
block and the §14 OFF branch have no e2e coverage; the A6 standing items remain deliberately
unruled.

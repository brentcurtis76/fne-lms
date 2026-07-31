# Fase 3 (Z1b) — PM dossier for the independent reviewer

> PM-authored per plan §0.2 step 2. This document is your map, never your boundary: review
> the actual diff (`git diff 2786fa8...ae210a5`, or `origin/main...feat/zoom-core`). The §0
> execution ledger in `docs/planning/zoom-integration-plan.md` is the normative record of
> every verdict and accepted deviation; this dossier condenses it and points at the code.

| Fact | Value |
|---|---|
| Phase | **Z1b — Secure schema + jobs + webhook + hours snapshot** (plan §15 row) |
| Branch / PR | `feat/zoom-core` · [PR #26](https://github.com/brentcurtis76/fne-lms/pull/26) (draft until your verdict + Brent's merge) |
| Base → head | `2786fa8` → `ae210a5` · **30 first-parent branch commits** (91 total incl. two absorbed `origin/main` merges) |
| Chunks | Z1b-1 (cold-reviewed) · Z1b-2 (+r1) · Z1b-3 · Z1b-4 (+r1 + a type-gate finding ③) |
| Final gates (PM re-run at `ae210a5`) | type-check ✓ · lint ✓ (zero warnings) · vitest **3646/3646 in 237 files** · build ✓ · `test:db` 85/85 ✓ · `test:queue` ✓ · CI 8/8 |
| Test delta over the `2786fa8` fork baseline (2735/211) | **+911 tests / +26 files** |

## 1. Scope

**In (from §15 Z1b + the four chunk prompts, all recorded in §0):**
`zoom_internal` schema exposed-but-grant-denied per §6, all seven tables incl. the §9
EXCLUDE host reservation and the single-row token cache; job-queue RPCs
(claim/heartbeat/complete/fail, SECURITY DEFINER, `SET search_path = ''`); public
projection `session_meetings_public` + §7 RLS; `contract_hours_ledger.planned_minutes_snapshot`
+ `createReservation` write + 3-TZ tests; pgTAP `002` + `011`; the `lib/zoom` client layer
(S2S token provider, REST client with retry taxonomy + read-back, pure SDK-JWT signer,
webhook verifier, `ZoomApi` seam + trap-faithful fake); webhook receiver route; ticker +
hourly reconcile crons + `vercel.json` schedules; `host_sync` and `webhook_sweep` jobs;
`meeting_provision` with mock-mode round trip; the §17 overlapping-ticker proof as a Gate-3
CI step; phase docs.

**Out (verify nothing leaked in):** provisioning hooks at approve/reschedule/cancel and all
UI (Z2); community-meeting provisioning (Z6); recording/attendance/transcript handling
(Z4/Z5/Z7); Marketplace repoint (human, post-merge); migrations beyond Z1b-1's five; new
dependencies (none — `package.json` gained only the `test:queue` script); es-CL copy (no
user-facing surface in this phase).

## 2. Chunk → commit map

| Chunk | Commits | What landed |
|---|---|---|
| Z1b-1 | `dc9d532`…`f1d3504` (7) | Schema: lockdown, tables, RPCs, projection+RLS, snapshot, pgTAP. **Cold-reviewed** (executor session died unreported; branch was the evidence). |
| Z1b-2 | `9578ec2` (main merge) + `68dff88`,`aa71fd6`,`6c7e4ef`,`ae28bd2`,`9768522`,`c3acb6f`,`9747b06` | `lib/zoom` client layer; committed 41-vector suite rewired onto the production verifier; diag route onto the pure signer (its 34-test suite passes **unmodified**); an executor history-rewrite of then-unpushed commits removed a reconstructed UUID (fast-forward push proves nothing published was rewritten). |
| Z1b-2r1 | `2f17ec4`,`a30ac38` | Two PM findings: a false in-file comment; OAuth-endpoint 429 → `rate_limit` (was `auth`), `parseRetryAfter` moved to the `errors.ts` leaf. |
| Z1b-3 | `e700315`,`c344b89`,`a6eb34e`,`be6556f`,`1fec986` | Webhook route, ticker+runner+queue seams, `host_sync`, reconcile skeleton, crons. |
| Z1b-4 | `5d54f12` (main merge incl. the parallel contracts track) + `83e30d5`,`c9b5ebc`,`4b71b3c`,`302ecaa` | `meeting_provision` + round trip; shared `webhook-lifecycle` + `webhook_sweep`; the §17 proof + the ONE CI edit; phase docs. |
| Z1b-4r1 | `ccb8fce`,`6772cfa`,`ae210a5` | Two PM findings (create→persist window narrowed via checkpoint-adopt + honest residual; drift derived on every resume path) + 13 test-file type errors cleared for the incoming `tsconfig.tests.json` gate (branch `chore/ts-tests`). |

## 3. File inventory by risk

**HIGH — security boundaries, credentials, money, concurrency**
- `supabase/migrations/20260729120000…120400_*.sql` — §6 grant-denial lockdown; tables (secrets live in `zoom_internal.zoom_meetings`; `dedupe_key` UNIQUE; single-row token cache; the §9 `EXCLUDE USING gist` reservation, active-statuses only); job RPCs; projection + §7 RLS; additive `planned_minutes_snapshot`.
- `pages/api/zoom/webhook.ts` — the internet-facing ingress. Gate order 404-unconfigured → 405 → 413 (cap enforced DURING a hand-rolled bounded read, `bodyParser:false`) → 401 (typed reason logged, never echoed) → **CRC answered only AFTER verification** (an unverified CRC responder is a chosen-plaintext MAC oracle on the secret — module header ~line 30) → ledger insert (`ON CONFLICT DO NOTHING`) → duplicate-with-`processed_at IS NULL` **resumes** instead of absorbing.
- `lib/zoom/verifier.ts` — HMAC over the raw bytes; `dedupe_key = sha256(body)` ALONE (retries re-sign: identical body, fresh ts/signature); header=SECONDS vs `event_ts`=ms; **600 s freshness** (derivation in the module header, evidence-cited to `zoom-spike-results.md` §6.1/§6.1.1); length-checked constant-time compare.
- `lib/zoom/token.ts` — S2S creds (env names only in errors); DB row + in-process single-flight; correct under BOTH re-grant regimes (the results doc records nothing on the question — verified); OAuth 429 ⇒ `rate_limit` since r1.
- `lib/zoom/signer.ts` — pure credential minting; §20 clamps enforced; role is always the caller's server-side decision (§5).
- `lib/zoom/jobs/meeting-provision.ts` — INSERT-is-the-reservation (23P01 walks candidates; resume re-proves the host); **two-anchor create-exactly-once** (row number, else `stage:'created'` checkpoint adopted) with the RESIDUAL stated in the header — read it before anything else; §10 instants only via `session-timezone.ts`; `zoom_meeting_uuid` stays NULL (captured at `meeting.started`); `consultor_sessions.meeting_link` never written; plaintext passcode in `stage_state` argued §5-equivalent (service-role-only schema).
- `lib/zoom/cron-auth.ts` — dual scheme (`Bearer CRON_SECRET` | `x-cron-key`), each independently fail-closed, constant-time; NOT gated on the feature flag (§14 kill-switch: the flag hides surface, never stops machinery).
- `pages/api/meet/diag-signature.ts` — refactor onto the pure signer only; its committed 34-test suite is byte-identical to `origin/main`'s and passes.

**MEDIUM — correctness plumbing**
`lib/zoom/{client,api,fake,errors,db-types,service-client,webhook-store,webhook-lifecycle}.ts`,
`lib/zoom/jobs/{queue,runner,registry,types,host-sync,webhook-sweep}.ts`,
`pages/api/cron/{zoom-ticker,zoom-reconcile}.ts`, `lib/services/hour-tracking.ts` (snapshot
write), `supabase/tests/{002,011}*.sql`, `.github/workflows/ci.yml` (three additive steps in
the Gate-3 job only), `vercel.json` (two crons), `package.json` (one script),
`scripts/ci/queue-concurrency-proof.mjs` (note: sits outside both lint and type-check —
pre-existing config gap, ticketed).

**LOW** — 12 test files (+ the round-trip harness genuinely modeling the EXCLUDE constraint),
`supabase/config.toml` (`[api]` union), `PROJECT_STATE.md`, `fase-3-review-request.md`.

## 4. Invariants and their entry points

1. **`zoom_internal` unreachable by browsers** — grants, not exposure: migration `…120000` + pgTAP `002`; `serviceClient.schema('zoom_internal')` is the only path (`lib/zoom/service-client.ts`).
2. **One host, one window** — `…120100` EXCLUDE constraint (active statuses only) + `meeting-provision.ts` (the insert IS the reservation; `error` status releases it; resume re-enters the predicate).
3. **Webhook trust boundary** — `verifier.ts:214` `verifyZoomWebhook`; route gate order incl. CRC-after-verify; rejection reasons are §18's secret-rotation signal, logged server-side only.
4. **Retries absorbed, crashes healed** — body-only dedupe key; `processed_at IS NULL` resume in the route; `webhook_sweep` (age floor 15 min, bounded 200, heartbeats) re-runs the SAME code (`webhook-lifecycle.ts` — both callers import it).
5. **Occurrence uuid captured at `meeting.started`, never at provision** — `webhook-lifecycle.ts:66-84`; `ended` cannot blank it; provision leaves NULL (routed Z0B finding).
6. **Create exactly-once, honestly bounded** — the two anchors + the documented residual (`meeting-provision.ts` header). The dead job's `stage_state.meeting.number` NAMES any orphan for manual cleanup.
7. **§9.4 drift keys on `auto_recording` read-back, never `recording_disclaimer`** — `client.ts` `UNVERIFIABLE_SETTINGS_FIELDS` (also modeled in the fake); derived on EVERY provision path since r1, never a constant.
8. **Job triage keys on the typed `kind`, never message strings** — `runner.ts` structural failure records into `last_error` (text column ⇒ `last_error::jsonb->>'kind'`).
9. **Hours invariant** — snapshot written at `createReservation` (`hour-tracking.ts`), 3-TZ suite; the `hours` CHECK untouched.
10. **No raw meeting secret leaves the service layer** — projection zero-secret by construction (`…120300`); `meeting_link` never written; join surfaces arrive in Z2.

## 5. What the PM independently verified — and did NOT

**Verified (commands re-run by the PM at every reviewed head; full evidence in the §0 rows):**
all four gates at 8 heads (final: 3646/237 at `ae210a5`); CI 8/8 at every reviewed head;
`supabase db reset` + `test:db` 85/85; **fail-on-old re-executions** (r1 of Z1b-2: 3F pre-fix
each `ZoomAuthError` → 32/32; r1 of Z1b-4: pre-fix handler → 4F/17P incl. the mid-crash
adoption test → 21/21 at head); the §17 **queue proof three times** (splits 19/21, 21/19,
19/21 — real contention; plus the executor's uncommitted negative control: a non-locking
claim double-executes all 40 and fails loudly); **identifier/credential scans replicated
from the spike worktree on every chunk** (the committed scanners exit 2 here by design — no
vacuous passes were accepted): 187 provider-minted values (full + segments) and all 6
credentials, **zero hits in the tree AND in `main..feat/zoom-core` history**, institutional
email only in its 11 pre-existing public files; the committed diag suite proven
byte-identical to main; the vector-suite rewire proven assertion-identical; the merge
commits' diffs vs `origin/main` proven to contain exactly the expected files; zoom test
files under the incoming `tsconfig.tests.json`: 13 → 0 errors.

**NOT verified — your highest-yield hunting ground:**
- **No live Zoom call was made in this phase.** Every behavior of the live adapter rests on
  the Z0B-2 captures and the fake's fidelity to them. The SQL-vs-PostgREST marshaling of the
  RPCs (the proof speaks `pg`; production speaks supabase-js) is untested until Z2 staging.
- **Vercel cron semantics in production** (GET + `Bearer CRON_SECRET`) are per platform
  docs, not observed; the webhook subscription still points at the dead spike tunnel until
  Brent repoints it post-merge.
- **The §7 RLS matrix is pgTAP-proven but not e2e-proven** (the authenticated-PostgREST
  denial spec is Z1c per §6).
- **`meeting_provision` has no production caller** (hooks are Z2) — it is reachable only by
  manual enqueue; the round trip is mock-mode.
- The fake's `listUsers` ignores pagination (host_sync pagination tested against a stub).
- PM review of Z1b-1 was **cold** (no executor report existed); deviations there are
  PM-derived from the diff, not declared.

## 6. Accepted deviations a reviewer should challenge

The ledger rows record all ~40 with rationale; these are the judgment calls that most
deserve hostile reading: CRC-after-verify (adopted as a standing rule — the MAC-oracle
argument); the 600 s freshness default; the ticker claiming ALL job types (unknown ⇒
terminal `'failed'`, never `'dead'` — deploy-skew trade); the structured-failure JSON inside
a text `last_error`; host_sync's two refusals (runaway pagination; empty-inventory — PM
AFFIRMED both: mass-deactivation is the dangerous direction); the TS re-derivation of the
±15/+45 load window (ordering-only; the constraint is the authority); the `pg`-direct
concurrency proof; `growth_community_id` added to the projection upsert (fixed a latent
Z1b-1 gap — without it the §7 GC policy matched nothing); the r1 checkpoint's plaintext
passcode in `stage_state`; the diag route keeping TTL 1800 vs the signer's 2 h default.

## 7. Open items and residual risks

- **The create→persist RESIDUAL** (irreducible without a Zoom idempotency key): crash or
  lease-loss before the checkpoint lands still orphans one scheduled meeting at Zoom;
  cleanup is manual via the dead job's named meeting number. A Zoom-side orphan sweep is a
  future reconcile seam.
- §9.4 drift is recorded (row + job result + warn), not alerted — §18 wiring is Z12.
- Post-merge prerequisites (Brent): repoint Marketplace to `https://<prod>/api/zoom/webhook`;
  set `ZOOM_WEBHOOK_SECRET_TOKEN` + `CRON_SECRET` in Vercel. Watch item: if Marketplace
  validation 401s at repoint, the logged reason names the failing check (see the route
  header's CRC note).
- Branch `chore/ts-tests` (separate track): its `type-check:tests` gate will cover this
  phase's test files — already clean (13 → 0); overlap with this branch is `ci.yml`
  (different jobs) + `package.json` (one script line each).
- Two sessions in this phase ended without delivering their report (Z1b-1, and Z1b-4r1's
  ①/② portion) — both were cold-reviewed from the branch per §0.1; the r1 executor's report
  arrived only for finding ③.

## 7b. Sol-R1 remediation record (Z1b-sol1, 2026-07-31) — read WITH the verdict archive

Sol R1: REQUEST CHANGES, six findings, ALL triaged valid (four qualified earlier PM
rulings — conceded in `fase-3-review-verdict.md`). Fixed in six commits, one per finding:
`e748d32` (order-safe lifecycle + projection: guard = the UPDATE's own `WHERE status IN`,
applies-from sets exported as the single rule; projection driven `live`/`ended`, never
resurrecting `cancelled`) · `8e726ef` (`fail_zoom_job` + `p_retry_after_seconds`;
`run_after = GREATEST(backoff, hint)` — a floor, never a replacement; grants + pgTAP
moved to the five-arg signature; pgTAP 44→50 incl. hinted/unhinted/floor asserts as
`service_role`) · `6691f1f` (eligibility gate before any reservation: `is_active` ·
`status='programada'` · modality `online|hibrida` · `meeting_provider='zoom'`, all four
columns verified against the live table; bare stale reservations released to `cancelled`;
resumed reservations re-proven against the current source interval) · `3107d02`
(`ZoomError.outcome: 'not_executed'|'ambiguous'`; ambiguous keeps the row `pending` —
the interval stays blocked — and terminally fails the job under
`ambiguous_create_outcome` with the provider request id) · `7d4b062` (413 flushed with
`Connection: close` before teardown; real-`http.Server` test) · `9648c3b` (docs truth
pass; also corrected two comments citing a runbook that does not exist yet).

**PM verification of the round**: all six diffs read; fail-on-old re-executed (pre-fix
source restored → **15/39 provision tests fail**, incl. the 8-ineligible-sessions and
3-meetings-across-3-ticks cases; HEAD → 39/39 + the 2 real-server tests); gates re-run
(**3680/3680 in 238 files**, build OK); `supabase db reset` from scratch + `test:db`
**91/91**; `test:queue` PASS; CI 8/8; scanner replication CLEAN over the fix commits.

**PM rulings on the flagged judgment calls** (executor scrutiny A–E): `hibrida`
eligibility ACCEPTED (a hybrid session has a remote leg; `presencial` never provisions;
one-line revert available — **product-visible, flagged to Brent**); `programada`-only
ACCEPTED (verified as the sole approved-pre-execution status in the live CHECK);
strict eligibility on the replay path ACCEPTED with its asymmetry as argued — the
checkpoint-adopt path is exempt because blocking it loses Zoom-truth entirely, the
row-anchor path is gated because blocking it costs at most a stranded projection row
(NEW RESIDUAL: first run dies between `markProvisioned` and the projection upsert AND
the session leaves `programada` before the replay ⇒ the projection row never lands;
visible as the failed job in triage; healed by the future stalled-lifecycle sweep or
Z2's sync); `cancelled` as the release status ACCEPTED (truthful; outside the EXCLUDE
predicate either way); untyped-throw-as-ambiguous ACCEPTED (the unknown case is exactly
where we do not know).

**New residuals for §7**: `ambiguous_create_outcome` is a failure class whose ONLY
resolution is manual reconciliation against Zoom — and an ambiguous failure cannot NAME
the possible first meeting (no runbook exists yet; triage = reading `zoom_jobs.last_error`
+ `stage_state` directly). The F1/F3/F4 store guards are proven against in-memory doubles
that import the applies-from sets; the supabase-js chains themselves
(`update().eq().in().select()`, and the `public`-schema projection chain) are exercised
by no test in the repo — F1 is the first store method whose CORRECTNESS depends on the
filter reaching Postgres, which sharpens the §5 "doubles, not PostgREST" caveat.

## 8. Exact local gate commands

```bash
npm run type-check && npm run lint && npm test && npm run build
npm run test:db          # local Supabase stack; 6 files / 85 tests
supabase db start && eval "$(supabase status -o env | grep '^DB_URL=')" \
  && SUPABASE_DB_URL="${DB_URL}" npm run test:queue   # §17 proof, ~40 jobs
```

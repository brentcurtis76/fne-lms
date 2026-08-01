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

## 7c. Sol-R2 remediation record (Z1b-sol2, 2026-07-31)

Sol R2 (re-review of sol1 at `da38eb9`): REQUEST CHANGES — 2 MAJOR / 2 MINOR, all
triaged valid (two qualified the PM's sol1-round verification; conceded in the verdict
archive Round 2). Fixed in four commits: `ddb07d3` (①: `findUnusableCreateFields`
shape-checks a 2xx create over exactly the fields the provisioner persists —
safe-integer id, non-empty join_url, password/settings shapes; the empty-body and
schema-invalid classes unified under `ZoomUnusableSuccessError`, whose constructor
FORCES `outcome:'ambiguous'`, while the client-level unparseable-2xx remains
`ZoomRetryableError` carrying `outcome:'ambiguous'` — one outcome, two classes.
*[Corrected in sol3 per Sol R3 ③: this line originally claimed "all three unified";
the overclaim was the PM's own — the executor's sol2 report stated the asymmetry
accurately]*) · `db304d6` (②: handler-enforced parked state — after the
anchors, before any reservation reuse/host resolution/Zoom call, a pending-no-number
row carrying the `ambiguous_create_outcome` marker fails under the DISTINCT reason
`ambiguous_unresolved`; the manual resolution contract — populate the number, or clear
`last_error` — is documented in the module header and both paths are test-covered) ·
`e2d747a` (③: 8 tests drive the real `createSupabaseWebhookStore` through
`defaultZoomWebhookStore` with real supabase-js over an intercepted fetch — schema,
table, and `status IN(...)` filters asserted on the wire) · `8cbb277` (④:
review-request record corrected — the two orphan classes distinguished; the 21-file
figure labeled as the through-F5 diff).

**PM verification**: both MAJOR fail-on-olds re-executed (①: 14/52 fail pre-fix;
②: fails on `"createMeeting" … got 2 times` itself); the ③ mutation probe re-executed
by the PM with an asserted-applied mutation (guard removed → 2/8 fail; the PM's own
first probe silently failed to apply — the same trap the executor self-caught — and
was redone); gates at `8cbb277`: **3710/3710 in 239 files**, build OK, `test:db`
91/91, `test:queue` PASS; CI 8/8 — including the PR merge-ref already exercising the
UNION of this branch's workflow with the newly-merged T2 e2e topology (Gate 4 ran the
seeded-Supabase form, green), which de-risks the phase-close absorption. Scanner
replication CLEAN over the full branch. All five deviations accepted (the getMeeting
cast stays unvalidated — a GET is retryable, not ambiguous; noted as later hardening).

**Residuals added this round**: `ambiguous_unresolved` is a second reason string on
the §18 surface (deliberate — "Zoom was ambiguous" vs "an operator requeued without
resolving"); the manual resolution contract lives in a code comment until the Z12
runbook exists; the ③ tests prove the store SENDS the guard — that Postgres honours
`status IN(...)` semantics is the pgTAP suite's territory; settings validation is
shape-only (a false-`{}` settings body under-reports §9.4 drift — pre-existing,
unchanged).

## 7d. Sol-R3 remediation record (Z1b-sol3, 2026-07-31)

Sol R3: REQUEST CHANGES — 3 findings (① MAJOR operator-recovery incomplete; ② MAJOR-minus
fail-open create validation for always-requested fields; ③ MINOR classification
commentary — an overclaim that was the PM's own wording, corrected above in §7c). Fixed
in `3470672` (② first — ① depends on its rule set), `a67bc18` (①), `830d31d` (③),
`b64e945` (round record).

① The anchor split: `hasNumber` now drives EVERY do-not-create guard (adoption, parked
gate, held-reservation, branch selector, the `created` result flag) while status only
selects the branch — `pending`+number ⇒ operator recovery (Zoom `getMeeting` read-back →
identity check → the ②-bar validation via `findUnusableProvisionedMeetingFields` → ONE
`markProvisioned` that clears `last_error` in the same UPDATE → only then the
projection); `provisioned`-or-later+number ⇒ the unchanged replay. Unusable read-back ⇒
zero writes, terminal `recovery_unusable` (a THIRD reason string on the §18 surface —
deliberate: "re-check the number" is a different operator action from "resolve the
queue"). The executor's self-caught note is load-bearing: keying replay on
`status==='provisioned'` alone would have dropped `started`/`ended`+number rows into the
candidate walk — a second meeting; `hasNumber` guarding prevents the whole class.
② `password` required non-empty; `settings` required with an explicit string
`auto_recording`; absence ⇒ `ZoomUnusableSuccessError` (parked, never a clean-looking
`'none'`/`drift=false`). `readAutoRecording`'s floor comment is truthful again.
③ Corrected in `api.ts`, `errors.ts` (which carried the same overclaim) and the fake
suite, with pinning assertions (`not.toBeInstanceOf(ZoomUnusableSuccessError)`,
`kind==='retryable'`); classes deliberately NOT unified; GET semantics untouched.

**PM verification**: all three diffs read; fail-on-old re-executed — ① 5/52 fail with
only `meeting-provision.ts` reverted; ② 14/110 fail running BOTH suites with only
`api.ts` reverted (the executor's 10 named + 4 of ①'s recovery tests that import ②'s
validator — a cross-dependency superset, consistent); gates at the final head:
**3723/3723 in 239 files**, build OK, `test:db` 91/91, `test:queue` PASS; scanner
replication CLEAN. Deviations 1–6 ALL ACCEPTED — notably recovery keyed on
`pending`+number as STATE rather than marker provenance (a marker-less operator row
would otherwise hit the same defect; the marker is still read for its `request_id`) and
the distinct `recovery_unusable` reason. **Scrutiny C accepted as-is**: recovery does no
heartbeat before its Zoom GET — a lost lease there means a non-owner writes
`markProvisioned`, an absolute idempotent write of Zoom-truth (same resulting row); the
create path's checkpoint discipline guards an IRREVERSIBLE call, a GET is free —
recorded, Sol may re-weigh. **Environment note**: the zoom worktree was renamed
mid-round (`fne-lms-zoom-core` → `/Users/brentcurtis/Documents/fne-zoom`); the executor
verified tree identity (branch/SHA/cleanliness) before proceeding — the right call —
and every PM-owned reference is updated.

## 7e. Sol-R4 remediation record (Z1b-sol4, 2026-07-31)

Sol R4: REQUEST CHANGES — ONE finding, which **overturned the PM's sol3 scrutiny-C
ruling** (conceded in the verdict archive Round 4): the recovery write was ID-only with
no lease guard, and `started`-applies-from-`pending` makes the lifecycle race reachable
— a webhook advancing the row mid-read-back would be clobbered back to `provisioned`
by the late recovery write, reintroducing the R2-F1 order-safety class through recovery.
Fixed in `23f730a` (fix) + `beab6e8` (store-wire suite).

The fix, verified hunk-by-hunk to touch ONLY the recovery branch, the store seam, the
result types and the header (rule 4): post-validation `ctx.heartbeat()` BEFORE any
write — argumentless, verified against the RPC's `COALESCE` so it cannot blank the
job's checkpoint; false ⇒ LeaseLost, zero writes. The write is a DEDICATED
compare-and-set, `markRecoveredProvisioned` (`WHERE id AND status='pending' AND
zoom_meeting_number=<recorded>`, `.select('id')` with **exactly-one** semantics — the
executor's `length === 1`-not-`>= 1` reasoning is right: a store that stopped filtering
by id must read as refusal); the guard number is DERIVED from the persisted patch, so
guard and payload cannot drift (accepted deviation — better than the spec). CAS miss ⇒
stop before the projection, complete with a structured `superseded` result carrying the
row ids (a legitimate world-advance is not a triage event); the residual is ASSERTED,
not just documented — a superseded row keeps NULL passcode/join_url forever (the CAS is
one-way), the historical record of a meeting that ran without platform join.

**PM verification**: fail-on-old re-executed — **7/59 fail** with the `a67bc18`-era
handler restored, including the clobber in its own words (`expected 'provisioned' to be
'ended'`), 59/59 at head; the race tests drive the advance through the REAL
`applyWebhookLifecycle` and its applies-from guard (reachability proven, not assumed);
gates at `beab6e8`: **3730/3730 in 240 files** (+7/+1), build OK, `test:db` 91/91,
`test:queue` PASS (21/19); scans CLEAN. All six deviations ACCEPTED — notably the
UNREQUESTED store-wire suite (closes the same R2-③ doubles-gap class for the provision
store proactively) and the strict-reading deviation that the recovery-success test is
no longer green-on-old (it now asserts the new guard; green-at-head is the DoD's
intent). The adoption-branch exemption argument is PM-verified: pre-adoption rows carry
`zoom_meeting_number = NULL` and the lifecycle finds rows BY number
(`findMeetingIdByNumber`), so no lifecycle event can reach one — the race is
structurally absent there, not merely unhandled. *[ERRATUM sol5, Sol R5 ②: TRUE for
lifecycle-direct but FALSE overall — the PM's argument missed the dual-adopter
interleaving: a stale reclaimed adopter's unguarded write lands after the fresh
adopter's number made the row lifecycle-reachable. The exemption was removed in sol5;
adoption is now heartbeat-guarded and CAS-atomic with its projection]*

**Residuals**: `superseded` has no reader yet (shaped for the §18 health query, Z12);
the projection race variant "already at ended, not overwritten" is unreachable from a
parked create (a parked row never published a projection) — the tests assert
no-projection-call + `undefined`, and covering the seeded-artificial state is left to
Sol's discretion. *[ERRATUM sol5, Sol R5 ①: this framing analyzed the wrong window —
the REAL race was the CAS→projection two-call gap itself: a webhook landing between
them no-ops on the not-yet-existing projection and the late `scheduled` INSERT then
stands forever. Closed in sol5 by making transition + projection one SECURITY DEFINER
transaction]*

## 7f. Sol-R5 remediation record (Z1b-sol5, 2026-07-31)

Sol R5: REQUEST CHANGES — 2 findings + docs; two PM concessions (§7e's errata above;
and sol4's review-request omission was a PM verification slip — the per-round record
convention broke silently and the re-review missed it; backfilled by the executor this
round). Fixed in `cfe22fb` (fix) + `d40affd` (docs; sol4 backfill + sol5 record). A
STEP-0 stop preceded the round: the executor found untracked `supabase/.branches/` (a
4-byte Supabase-CLI state file left by the PM's own verification runs), stopped with
zero writes, and resumed on explicit PM approval — the discipline working; `.branches`
in `.gitignore` is a noted one-line hygiene candidate for a later round.

The fix: NEW additive function-only migration `20260731120000_zoom_provision_rpcs.sql`
— `recover_provisioned_meeting` + `adopt_checkpoint_meeting`, both SECURITY DEFINER +
empty search_path + signature-specific grants + a blanket re-revoke that strips only
the untrusted roles (prior service-role grants survive — PM-verified). Each function is
ONE transaction: the CAS (recovery: `pending` + recorded number; adoption: `pending` +
number IS NULL; `GET DIAGNOSTICS` exactly-one) then the projection publish whose ON
CONFLICT update is guarded `WHERE meeting_status='scheduled'` — `live`/`ended`/
`cancelled` are never regressed. Row-lock serialization gives the exact spec property:
lifecycle either wins before the CAS (miss, nothing written) or arrives after the
atomic commit and finds the projection to advance. The adoption branch lost its
exemption: argumentless heartbeat first (LeaseLost ⇒ zero writes), miss ⇒ structured
supersession matching recovery.

**PM verification**: migration read whole; handler wiring + heartbeat placement
verified; fail-on-old re-executed — **11/64 fail** with the pre-sol5 handler (the
executor's 8 named + 3 rewired recovery assertions, the usual consistent superset),
64/64 at head; **pgTAP 115/115 on a clean reset, re-executed**, and the executor's
negative control REPLICATED by the PM (migration removed ⇒ 002 aborts at the first
missing signature, "Failed 54/74 after 20 executed" — honestly reported as an abort,
not dressed as independent failures; restored ⇒ 115/115 again); gates at `d40affd`:
**3735/3735 in 240 files** (+5/+0), build OK, `test:queue` PASS (20/20 — a fourth
distinct split); CI 8/8; scans CLEAN. All six deviations ACCEPTED (the pre-authorized
wire-assertion rewire executed as authorized; `cancelled` added to the preserved set;
full-payload RPC signatures; schema-qualification under the empty search_path).

**Residuals**: fresh-create and already-provisioned replay RETAIN their existing
two-call `markProvisioned`/projection paths — outside R5's findings by its own scope;
their race exposure differs (fresh-create publishes into a projection that cannot
pre-exist; replay re-upserts idempotently) but they are NOT covered by the new atomic
RPCs — recorded for Sol R6's judgment and as the natural Z2 hardening baseline (any
future provision path should build on the atomic RPCs, not the two-call shape).

## 8. Exact local gate commands

```bash
npm run type-check && npm run lint && npm test && npm run build
npm run test:db          # local Supabase stack; 6 files / 91 tests
supabase db start && eval "$(supabase status -o env | grep '^DB_URL=')" \
  && SUPABASE_DB_URL="${DB_URL}" npm run test:queue   # §17 proof, ~40 jobs
```

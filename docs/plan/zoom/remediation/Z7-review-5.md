# Z7 independent review — remediation round 5

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `290478810f17c86cfbcdbcad2ba03cb655a9d100`
- Rejected tree: `718211ee6cbf71c85322572cfc03e5b26ba43cc5`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact branch/SHA/tree/base/35 commits/clean state passed
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The fourth cold review independently confirmed the 83-file cumulative inventory,
pagination integrity (including adversarial cases), JSON-ledger fail-closed scoping,
terminal report batches, UUID fill-only authority, override replay/concurrency,
effective-minute formulas, RLS/grants, and additive migrations. Resolve all four remaining
findings below without regressing those accepted areas.

## Z7-R5.1 — Financial availability failure permits reservation and approval (`MAJOR`)

`lib/services/hour-tracking.ts` collapses a `get_bucket_summary` RPC error and absent
data into `null`. `createReservation()` interprets that result as not over budget, inserts
the ledger row, and allows both single and bulk approval to continue. The reviewer reproduced
a successful reservation and ledger insert during an RPC error.

Affected entry paths include `pages/api/sessions/[id]/approve.ts` and
`pages/api/sessions/bulk-approve.ts`.

**Required:** distinguish dependency failure from a validated empty/missing result. An RPC
failure or inconsistent missing bucket must cause no ledger mutation and no approval/session
status mutation, returning a generic 500 at both API boundaries. Define and test the legitimate
successful-empty/missing-bucket contract rather than treating every absence alike.

**Acceptance:** inject an RPC error into single and bulk approval; assert generic 500, zero
ledger inserts, and zero session-status updates. Separately cover valid under-budget,
over-budget, and the explicitly valid successful-empty/missing-bucket cases. Perform an honest
fail-on-old probe proving the new tests reproduce the mutation before the fix.

## Z7-R5.2 — Reader inventory is incomplete and overclaimed (`MINOR`)

The TypeScript scanner covers only `lib/` and `pages/` and only literal
`.from('contract_hours_ledger')` calls. It misses
`components/workspace/WorkspaceSessionsTab.tsx`, so the direct table census is at least
14 files/22 touches rather than 13/21. It also omits indirect financial RPC consumers such
as `get_bucket_summary` and `get_consultant_earnings`; R5.1 escaped through that blind spot.
The SQL scanner recognizes only `l`/`chl` aliases.

**Required:** scan every production TypeScript root, classify direct table uses and indirect
RPC/view/function consumers, and make SQL discovery alias-independent. Classify every current
consumer by financial/status/write/historical role and fail-closed authority. Correct all
counts, claims, and exceptions in the cumulative review artifact.

**Acceptance:** the executable guard detects the component touch, every current RPC consumer,
alternate SQL aliases, multiline/destructured RPC calls, and view/function references when
unclassified. Add mutation probes for representative direct, RPC, and alternate-alias cases.
Mechanical searches and the documented inventory must have zero unexplained consumers.

## Z7-R5.3 — Project state routes reviewers to round three (`MINOR`)

`PROJECT_STATE.md` still says the final independent round-three review is pending even though
round-four remediation and review have occurred.

**Required:** state that round-five remediation is in progress/then review-ready and another
cumulative independent review is pending. Preserve explicit not-accepted, not-merged,
not-deployed, local-only migration, and not-production-verified language.

**Acceptance:** no current Z7 state entry says round three is pending; state and the round-five
review request agree without claiming acceptance.

## Z7-R5.4 — Production entrypoint comments describe pre-Z7 behavior (`MINOR`)

`pages/api/cron/zoom-reconcile.ts` says only two jobs exist although attendance candidate jobs
are planned, while `pages/api/zoom/webhook.ts` says participant handling arrives later and
non-lifecycle events do nothing despite current joined/left dispatch.

**Required:** document the two global hourly jobs plus attendance candidate jobs, and accurately
describe participant joined/left handling and ignored event boundaries.

**Acceptance:** comments match `planReconcileJobs()` and webhook dispatch behavior; cron and
webhook tests remain green.

## Evidence and boundaries

Update `docs/plan/zoom/reviews/fase-7-review-request.md` cumulatively from the immutable base
through the eventual tree. Add every new round-five path to its mechanically exact inventory,
and replace overclaimed direct-reader evidence with the expanded direct-and-indirect consumer
guard and honest counts. External dispatch remains authoritative for the self-referential final
canonical SHA.

Run focused R5/fail-on-old tests; prior high-risk focused suites; type-check; zero-warning lint;
full Vitest; production build; full pgTAP; real override concurrency; mandatory 117-test Chromium;
and the UTC/America-Santiago/Europe-Madrid matrix. Record inherited advisory/broad-suite/timezone
deviations explicitly.

No merge, push, deployment, Vercel call, production/remote DB access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit code/tests/docs/evidence
and return ordered detached SHAs after the current builder head.

# FNE release integration and CI adapter

Branch `fix/doc-links`, base `541c84b92320e6b8e9f36450f1f72c530cf109c8`; three local commits: reviewed app repair `7d27ea9ad`, unchanged frozen security package `0f7ec5ff0`, and this test/CI adapter. Brent explicitly approved merge/deploy in the source conversation; the delegated release owner remains sole actor. No production SQL or merge has occurred at this checkpoint.

## Scope and preservation

The four product files remain byte-for-byte as reviewed in `7d27ea9ad`. The security migration, pgTAP105, original before/after browser spec and HTTP script remain byte-identical to the frozen executor deliverables. The original browser spec is immutable historical evidence and opt-in; its expected document failure cannot describe repaired behavior.

Current acceptance is separately derived in `tests/e2e/urgent-anonymous-current.spec.ts`: identical existing workflows, loopback fixture preparation, and document download must now succeed. Its two unrelated report defects remain explicit expected failures, not actual passes. The standalone current config executes it alongside the stronger four document cases.

The four document cases are added to the existing mandatory CI list, retaining every previous mandatory spec and the existing no-skip guard. The Playwright step exports the runner's `.env.local`, using the established seed-step pattern so collection sees the disposable API/DB URLs. `helpers/fne-storage-fixture.ts` refuses non-loopback targets, requires seeded synthetic accounts, installs the disclosed permissive bucket model only locally, prepares synthetic workspace/consultor access and refreshes role cache transactionally. Candidate restrictive anonymous policies still govern those buckets.

## Validation and independent review

- Unchanged product: 24 focused tests; full unit 502 files / 12,477 passes / 12 existing skips; Node22 build149 pages; type-check and zero-warning lint; pgTAP68 files / 6,657 assertions; four actual role/file journeys twice; original candidate HTTP110/110.
- Adapter: current browser run19 expected outcomes = **17 actual passes + 2 unchanged expected report failures**, zero skips/unexpected/flaky; type-check and zero-warning lint; action runtime guard; candidate HTTP110/110 after local Storage model installation. Evidence `.doclinks/current-acceptance.log`, `tests/e2e/.doclinks/current-acceptance.json`, `.doclinks/adapter-*.log`.
- Independent reviewer `/root/review_ci_adapter` initially found missing environment export in the Actions Playwright step. That P1 was fixed and the reviewer returned **Approve adapter packaging; no remaining blocking findings**. Review was read-only and full hosted CI remains mandatory before release.

## Review focus and limitations

1. CI fixture isolation: loopback refusal precedes SQL; synthetic rows and modeled permissive policies must never run in Production.
2. Test registration: four required document cases run through the standard gate and no existing required test is removed/skipped. Historical expected-failure spec remains frozen; current derivative must not mask the two unrelated report defects.
3. Payload identity: verify four frozen hashes at publication and application; no change to auth/service grants, public reads or unrelated buckets.
4. Release authority and atomicity: refresh GitHub main/deployment SHA and live catalog before application; execute exact migration plus its history registration in one transaction with drift guards; merge only through protected main after all seven CI checks.

Fresh read-only production catalog at2026-10-06T19:12:35Z: main Production project `sxlogxqzmarhqsblxmtj`; target migration absent;113 history entries; intended public buckets/policies and seven vulnerable anon ACLs match; no independent anon/PUBLIC column grants, role memberships or named public function references. Catalog-only evidence `.doclinks/live-preflight.json`. Refresh and bind this state again immediately before application.

Release order: hosted CI and final SHA review; fresh drift guards; atomic SQL/history apply and postcatalog; protected main merge; verify Vercel deploys resulting merge SHA; safe live app/public-read checks. If application rollback is needed, preserve the security restrictions. No production synthetic uploads, notifications or private records are authorized by this adapter.

## Hosted CI fixture correction

Initial run37518134949 passed six required checks but E2E reported243 passes and six session-disclosure failures: each expected two seeded attendees and received three. The document helper's community role INSERT fired the existing attendee-sync trigger, adding the synthetic consultant to the Zoom fixture. The correction snapshots that user's pre-existing attendance IDs and removes only newly added rows for that same synthetic user/community within the helper transaction. No trigger, product code, frozen security file, existing assertion or mandatory spec changes. Independent reviewer `/root/review_ci_adapter` approved the correction without blocking findings. Targeted local verification runs the four document journeys before all55 session-disclosure tests, preserving the same cross-spec ordering that exposed the failure. Local correction validation: **59 actual passes**, zero skips/failures in41.9s; type-check passed. Hosted CI remains required before release.

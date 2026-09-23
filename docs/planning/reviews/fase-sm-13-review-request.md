# SM-13 / SM-14 review request

## State

- Branch: `fix/sm09-ci`
- Dispatched base and HEAD: `28e6d1e85261b1d1829d002ba882043d6f0fe20d`
- Unit commits: 0 (the order prohibits Git mutations)
- Cumulative sequence: SM-13 initial r0 plus remediations r1–r3; Brent-authorized successor SM-14 r0 closes the replan finding only.

## Objective and scope

Objective: close `SM13-R3-B1` without changing product behavior. The two Zoom negative controls must start their own production child servers on isolated loopback ports, prove those children are ready, retain the invalid-mode and missing-credential security outcomes, and allow the mandatory/no-skip gate to complete on the preserved B10a candidate.

In scope: `tests/e2e/zoom-mock-mode.spec.ts` test-harness port selection/readiness; the six inherited same-session authority-transition assertions in `071-b10a-referenced-tables-rls.sql`; this review request; local synthetic CI-equivalent evidence.

Out of scope: product behavior, policy, migrations, RLS policies/helpers, application/configuration/CI changes, dependencies, expected security outcomes, shared or Production data, publication, and deployment.

## Files by risk

Security-test harness:

- `tests/e2e/zoom-mock-mode.spec.ts` — replaces fixed ports 3101/3102 with OS-selected `127.0.0.1` ports. The coordinator port and each previously selected control port are excluded. Readiness requires this child's own `Ready in` output, a 401 from the real cron route, and a still-live child process. The tests explicitly assert coordinator/PRIMARY/SECONDARY port inequality while preserving serial queue use and both config-shaped negative outcomes.

Higher security-test risk, inherited and byte-preserved in SM-14:

- `supabase/tests/071-b10a-referenced-tables-rls.sql` — six rollback-only assertions exercise one authenticated school leader through deactivation, reactivation, school reassignment, former-school denial, forced-password denial, and flag-clear recovery. SM-14 makes no SQL change.

Documentation:

- `docs/planning/reviews/fase-sm-13-review-request.md` — records the Brent-approved successor replan, final scope, evidence contract, scrutiny points, and limitations.

## Validation evidence

- Untouched-state baseline: focused pgTAP 201/201; type-check and zero-warning lint clean; Vitest 359 files / 9,363 passed / 1 pre-existing skip; CI build 149 pages; full pgTAP 43 files / 4,302 passed; focused B10a 1/1. The only red results were the known Zoom PRIMARY collision and serial SECONDARY non-run: focused 2 passed / 1 failed / 1 non-run; mandatory 221 passed / 1 failed / 1 non-run; JSON checker failed only on SECONDARY. Exact commands, names, durations, and evidence IDs: `RUN/evidence/baseline.md`.
- Focused post-fix Zoom gate: 4/4 passed with zero skips. PRIMARY and SECONDARY each reached the real cron entry point on a distinct OS-selected loopback port; the run logged both ports and the tests asserted that neither equals coordinator port 3101 and SECONDARY does not equal PRIMARY.
- Final required state: focused Zoom 4/4; mandatory Chromium 223/223 with JSON no-skip checker green; focused B10a 1/1; focused pgTAP 201/201; type-check and zero-warning lint clean; Vitest 9,363 passed / 1 pre-existing skip; CI build 149 pages; full pgTAP 4,302/4,302; `git diff --check` and `pm-unit precheck SM-14 0` green. Exact final evidence IDs and durations are in `RUN/executor-report-r0.md`.
- UI_REQUIRED remains no: the only new code is a test harness. Playwright is API/token and process-isolation evidence, not visible UI acceptance.

## Reviewer scrutiny

1. Verify `selectControlPort` binds only `127.0.0.1`, asks the OS for an available port, closes the reservation before Next starts, and excludes both the coordinator and prior control port.
2. Verify readiness cannot be satisfied by an unrelated listener: it requires this child process's `Ready in` output, the route's 401, and the child still alive after the probe.
3. Verify PRIMARY still proves invalid `ZOOM_MODE` fails before the live adapter exists, and SECONDARY still proves missing credentials fail before OAuth/network use.
4. Verify the shared `zoom_jobs` queue remains serial and each phase clears it, so isolated ports do not introduce concurrent database mutation.
5. Verify the inherited 201-assertion SQL delta is byte-identical to the SM-13 reviewed candidate and still restores school 9711 before downstream probes.

## Known limitations and deferred items

- Port reservation and child bind are necessarily two operations; another process could race for the released port. Such a race fails closed because the child cannot emit its own ready signal and remain alive, so an unrelated 401 alone is insufficient.
- The no-skip checker consumes `pm-unit ui-run`'s `RUN/ui/<run>/report.json`; ui-run overrides the repository reporter destination while retaining Playwright JSON semantics.
- The build/test environment uses only coordinator-generated loopback Supabase values and synthetic flags. No live Zoom credentials are present and neither negative control can construct an outbound Zoom request.
- Independent review, commit, publication, merge, deployment, and Production verification remain pending and separately authorized.

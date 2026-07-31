# CODEX REVIEW — T2 round 1

VERDICT: PASS

T2 meets [A1]–[A5]. The final tree implements the isolated local-Supabase topology, synthetic idempotent fixtures, real-login storage states for both roles, behavior-level authorization coverage, and a demonstrated fail-on-skip guard. No product code, migration, dependency, or `middleware.ts` change is present, and no frozen decision is violated.

BLOCKING:

- None.

SHOULD-FIX:

- None.

NITS:

- [N1] `.github/workflows/ci.yml:6` still says every job has a 20-minute timeout, while the reworked E2E job correctly uses 30 minutes at line 95. This is a stale comment only.
- [N2] `docs/plan/evidence/t2/README.md:33` says run 2 demonstrates the skip guard; the table and independently verified run show that run 3 (`30602616645`) is the demonstration.

NOTES ON THE PLAN ITSELF:

- [A1] Verified in workflow and CI logs: `supabase start`, full `db reset`, locally derived URL/keys before the production build, and `if: always()` teardown all ran successfully. No remote Supabase credentials are used.
- [A2] The seeder uses only reserved-domain/invented fixtures, refuses non-local hosts before creating a client, writes the real `schools`/`profiles`/`user_roles` shape, reasserts auth confirmation/password/profile state, and converges on rerun without deletion.
- [A3] The helper drives `/login` and saves the resulting auth-helpers session. The spec proves behavior, not mere execution: both fixtures complete real login; the admin passes middleware and the page's own role check; the authenticated docente is redirected from `/admin/schools` to `/dashboard` rather than `/login`.
- [A4] The mandatory list contains the smoke and fixture specs. The guard rejects absent, zero-test, `skip`, and `fixme` cases. In run `30602616645`, Playwright exited successfully with 7 passed / 1 skipped, the guard alone failed on the skipped docente denial test, and teardown still succeeded; the scratch skip is reverted in the final tree.
- [A5] Independently verified run `30603388897` green on code head `eb908ed` (six of six checks; 8 E2E tests passed; guard and teardown succeeded). During this review, run `30626801265` also completed green on final PR head `3051203`, so the documentation-only head is fully green as well.
- Scope is appropriate. The plan/SOP/review history added on this branch is the frozen project control material the phase depends on and is explicitly intended to land with T2; executable changes remain confined to the stated CI/test-infrastructure surface.

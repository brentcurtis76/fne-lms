# Login recovery after password reset — review request

## State and scope

- Branch: `fix/login-loop`; base: `801805248fa50ddcc6fc1736befec91ff0d71755` (current main at intake).
- Delivery: three local commits above base: two implementation commits plus a documentation-only approval record. No push, PR, merge or deployment.
- Authority/objective: Brent's password-reset/login incident report followed by “fix it”; eliminate the confirmed indefinite login spinner and competing redirects. This is a bounded bug repair, not an itinerary phase.
- In scope: login session initialization, credential submission, password-state/profile checks, post-login navigation, recoverable failures, regression coverage.
- Out of scope: password mutation/recovery authorization, middleware/RLS changes, dashboard data loading, provider settings, production access or release.

## Result

Login now has one owned flow for an existing session or submitted credentials. It waits for session/router initialization, validates existing sessions with the provider, clears invalid sessions locally, and checks the forced-password flag before choosing a destination. Session events cannot race the sign-in handler into another redirect. Invalid credentials remain editable. Failed checks, cancelled/rejected navigation and a 15-second network-stage deadline show an accessible Spanish retry panel. Navigation is awaited separately so a slow dashboard response does not become a false authentication failure.

Retry reloads the page because the authentication SDK cannot cancel an outstanding password sign-in. A monotonically increasing attempt ID prevents late responses or work from an unmounted page from initiating new navigation. Safe deep links remain supported; login/logout/recovery destinations cannot send successful users back into an auth loop. Login input labels are associated with their inputs.

## Files by risk

- Authentication/navigation: `pages/login.tsx` (sole application change).
- Regression coverage: `__tests__/components/LoginPage.signIn.test.tsx` (39 expanded cases), `__tests__/components/LoginPage.sessionProvider.test.tsx` (real-provider integration), `__tests__/components/LoginPage.passwordRecovery.test.tsx` (session-context mock update), `tests/e2e/login-resilience.spec.ts` (five browser cases).
- Documentation: `PROJECT_STATE.md`, this request.

## Original validation (commit `2148c8723`)

- Type check and zero-warning lint: PASS; focused lint repeated after the browser-selector correction.
- Production build: PASS, Node 22.16.0, one build worker, local synthetic Supabase configuration only.
- Focused login/reset suites: original 75 tests passed; final login regression suite 31/31 and recovery-request component suite 12/12 passed. Full-unit result below is authoritative for final cumulative coverage.
- Full unit suite: 445 files, 10,525 passed, 12 existing skips, zero failures (409.32 seconds).
- pgTAP: 46 files, 4,687 assertions, PASS against a newly created isolated local stack.
- Browser authentication lifecycle: four existing tests PASS against the production build, including registration → approval → invitation → initial password → login → administrative reset → forced change → self-service recovery → new-password login; invitation resend/cooldown, removed debug routes and forced-change access denial also pass.
- Browser resilience: three tests PASS with retries disabled. Stalled authentication → timeout panel → reload → successful login at 1366×768 and 390×844; failed password-state check stays on login, then reload resumes a validated session successfully.
- Both retry-panel screenshots inspected: readable text, visible retry button, no horizontal overflow.
- The first new browser run hit a strict-locator ambiguity between our alert and Next.js's route announcer. The test now scopes the alert to `main`; all three cases pass. No application change was needed.

Local evidence: `/tmp/genera-auth-investigation/` (`unit-final.log`, `type-check-final.log`, `lint-final.log`, `build.log`, `pgtap.log`, `e2e-focused.log`, `e2e-resilience-final.log`). Screenshots: the two `test-results/e2e-login-resilience-*/login-retry-*.png` files in this worktree. Raw local-stack credential output and `.env.local` are not part of the commit.

The shared dependency tree has an unavailable optional native canvas binary. Unit runs use a process-local canvas stub (`/tmp/genera-auth-investigation/no-canvas.cjs`); no dependency or application configuration was edited. Browser checks use real Chromium and the production build. Full E2E outside the auth-related specs and remote CI were not run.

## Reviewer focus

1. Session-event ownership: `SIGNED_IN` must never bypass forced-password/profile checks, including React StrictMode setup/cleanup.
2. Deadline and late responses: timeout invalidates the attempt; retry reloads instead of issuing a competing SDK request. Navigation already submitted to Next.js is not abortable by this code.
3. Invalid versus temporarily unavailable sessions: only explicit invalid-session cases trigger local sign-out; provider outages offer retry without erasing a session.
4. Authorization and destinations: unreadable/malformed password state fails closed; forced-password and profile requirements take precedence over `next`; external/self-auth destinations cannot loop.

## Limitations

The original user's exact incident could not be reproduced because the affected computer and route were unavailable. The prior code's indefinite-spinner failure paths were reproduced with controlled stalled requests and cancelled navigation, and these paths now have passing regression coverage. A separate dashboard data request can still have its own loading behavior; this patch does not change it. Independent review, publication and production verification remain separate from this local implementation.

## Claude review correction (2026-09-26)

Review of `2148c87238e6d2738f8238bd4c6d6acb002ea770`: REQUEST CHANGES, two major findings. Original report preserved at `/home/brent/Projects/pm-workflow/reviews/genera-login-loop-claude-findings.md`. The subsequent independent re-review approved application commit `fecc185373a37cf356d768ae0774f738914655db` with notes; see the approval record below.

- MAJOR-1: race only authentication/session verification, session cleanup, password-state and profile requests against 15 seconds. Clear the timer before awaiting navigation. Show an explicit page-loading message during navigation. Unit coverage allows navigation to resolve after the deadline; Chromium holds the actual dashboard data response past 20 simulated seconds and then completes. The initial bundle-stall browser probe hit Next.js's own 3.8-second asset fallback, so the final test holds the data response instead.
- MAJOR-2: restore structured console diagnostics containing only controlled stage/reason labels and numeric HTTP status. No provider message, token, email, user ID or arbitrary error object is logged by the new diagnostics. A regression test checks the RPC failure stage/status and absence of synthetic private fields. HTTP status is read from the RPC response envelope, not its PostgREST error object; a Chromium assertion verifies status 503 through the real SDK. Diagnostics remain browser-console output; no new telemetry service is introduced.
- MINOR-1: successful `push` returning to `/login` now produces recovery and a `returned-to-login` diagnostic; pathname is read from the browser after navigation rather than a captured router object.
- MINOR-2: invalid-credential and unconfirmed-email outcomes release the automatic-session guard; a later cross-tab session can continue. A stale session already being cleared is not retried against the same cached context.
- MINOR-3: existing-session continuation keeps the neutral verification screen.
- MINOR-4: initialization timeout counts from mount across router identity/readiness changes. Each submitted login still receives its own full 15 seconds, including after a long time spent entering credentials.
- MINOR-5: tests now cover changing router identity/readiness, slow navigation, successful push returning to login, stalled getUser/signOut, the installed real SessionContextProvider, and an actual browser retaining revoked pre-reset cookies. The browser case creates its own synthetic account, signs in, changes its password using the isolated provider, verifies that its old access token is rejected and its browser cookies are still present, then logs in with the new password. It deletes only that test account afterward.

### Diagnosis and remaining boundaries

Claude's real-provider reproduction is valid: auth-helpers-react 0.5.0 retains its initialization error after a later SIGNED_IN event and consequently keeps exposing a null session. Login now recognizes that error before accepting credentials or navigating and offers a reload to recreate the provider. The integration test uses the installed provider, proves that the error persists after SIGNED_IN, proves no navigation occurs, then remounts with a successful session lookup and reaches the dashboard. This is containment at the login boundary; it does not modify the shared provider.

The original incident is still not attributed to a confirmed trigger. Dashboard's own null-session redirect and independent loading behavior remain unchanged and are follow-up candidates. Navigation itself has no application deadline; Next.js owns asset/navigation failures. A permanently pending navigation can therefore continue displaying the explicit page-loading message. Reload recovery does not guarantee success during an ongoing provider/network outage.

### Revised validation

Final validation: type-check, zero-warning lint and production build PASS; 446 unit files / 10,534 passed / 12 existing skips; 46 pgTAP files / 4,687 assertions; all nine auth/resilience Chromium cases PASS with zero retries. Final logs: `revision-typecheck-final.log`, `revision-lint-final.log`, `revision-build-final.log`, `revision-unit-final.log`, `revision-pgtap.log`, `revision-e2e-final-head.log` under `/tmp/genera-auth-investigation/`. The exact candidate commit is recorded in the external re-review handoff. All new browser checks use synthetic data against the isolated local stack and the production build, with retries disabled. The first revised browser run exposed a missing synthetic profile and the Next.js asset-timeout behavior; the corrected five-case resilience run passes. The existing four-case auth lifecycle passed in the initial revised run. All nine auth/resilience browser cases passed again on the final production build after the RPC diagnostic correction (`revision-e2e-final-head.log`). No application source change was needed for those test corrections.

The unit suite's counts include expanded parameterized cases (the original 31 were expanded cases, not 31 source-level test blocks). Full application E2E outside the auth-related specs and remote CI remain unrun. Publication and deployment remain pending.

## Independent approval record (2026-09-26)

**APPROVE WITH NOTES**, Claude Code, for application commit `fecc185373a37cf356d768ae0774f738914655db`. Full report: `/home/brent/Projects/pm-workflow/reviews/genera-login-loop-claude-rereview-findings.md`. Both prior MAJOR findings are independently resolved. Prior minor findings are addressed; test faithfulness is substantially resolved with the remaining assertion gap below. Provider sticky-error containment and real revoked-cookie coverage were accepted.

The reviewer independently ran 103 focused tests, changed-file ESLint and incremental type-check successfully. Full unit, build, pgTAP and browser evidence comes from the executor's previously recorded runs; the reviewer inspected those logs, not reran those suites.

Non-blocking notes retained for follow-up:

- Add safe SDK error-code/name classification to distinguish network, lock and provider failures. Use controlled values; current diagnostics intentionally expose only stage/reason/status.
- The revoked-cookie browser case proves successful new-password login but does not explicitly assert the expired-session message and login URL before submission. Its access token is fresh and its session revoked. An expired access token with a dead refresh token can instead be removed by auth-js during initialization; this is not a second real-browser scenario covered by the current test.
- Document in code that a successful Next.js navigation normally unmounts login before `push` resolves; the ownership assertion then exits silently. The pathname check is relevant when login remains mounted, as on a middleware bounce.
- Wrong-password/unconfirmed-email outcomes currently produce error-level console entries; downgrading expected user-correctable outcomes would reduce future telemetry noise.
- Provider-error recovery still requires reload and may repeatedly fail during an ongoing outage. The global provider and dashboard null-session/loading candidates remain unchanged, and the original incident remains unattributed.

This approval-record commit changes documentation only; reviewed application and test files remain byte-for-byte unchanged. No test rerun was needed for this record. Approval is not publication or release: remote CI, non-auth application E2E and production verification remain outstanding. Nothing has been pushed, merged or deployed.

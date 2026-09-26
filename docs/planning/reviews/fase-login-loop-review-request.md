# Login recovery after password reset — review request

## State and scope

- Branch: `fix/login-loop`; base: `801805248fa50ddcc6fc1736befec91ff0d71755` (current main at intake).
- Delivery: one local commit above base, including this request. No push, PR, merge or deployment.
- Authority/objective: Brent's password-reset/login incident report followed by “fix it”; eliminate the confirmed indefinite login spinner and competing redirects. This is a bounded bug repair, not an itinerary phase.
- In scope: login session initialization, credential submission, password-state/profile checks, post-login navigation, recoverable failures, regression coverage.
- Out of scope: password mutation/recovery authorization, middleware/RLS changes, dashboard data loading, provider settings, production access or release.

## Result

Login now has one bounded flow for an existing session or submitted credentials. It waits for session/router initialization, validates existing sessions with the provider, clears invalid sessions locally, and checks the forced-password flag before choosing a destination. Session events cannot race the sign-in handler into another redirect. Invalid credentials remain editable. Failed checks, cancelled/rejected navigation and a 15-second deadline show an accessible Spanish retry panel.

Retry reloads the page because the authentication SDK cannot cancel an outstanding password sign-in. A monotonically increasing attempt ID prevents late responses or work from an unmounted page from initiating new navigation. Safe deep links remain supported; login/logout/recovery destinations cannot send successful users back into an auth loop. Login input labels are associated with their inputs.

## Files by risk

- Authentication/navigation: `pages/login.tsx` (sole application change).
- Regression coverage: `__tests__/components/LoginPage.signIn.test.tsx` (31 cases), `__tests__/components/LoginPage.passwordRecovery.test.tsx` (session-context mock update), `tests/e2e/login-resilience.spec.ts` (three browser cases).
- Documentation: `PROJECT_STATE.md`, this request.

## Validation

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

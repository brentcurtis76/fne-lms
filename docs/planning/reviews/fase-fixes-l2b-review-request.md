# GENERA fixes, level 2 (second part): a page behind a permission on a full load; one unsteady browser test

Branch: `fix/l2b`. Base: `be1913a8b` (main, 17 Nov 2026 14:08, pull request 195: the redesign's step 5c; the first part of level 2 went live as pull request 193).
4 commits in a straight line on main, no merge commits: two for the permissions fix, one for the test, this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026; its second level is "dead ends in normal use". This release holds one item of phase F15 (finding N63) and the cure for a browser test that failed a release's CI by chance on 17 Nov (finding N132). On 17 Nov the owner asked for both to go out together, after the redesign's steps 5b and 5c.

## What changes

No migration. No database change of any kind. No server route changes.

**Permissions on a full load (N63)** — `contexts/PermissionContext.tsx`, `pages/admin/quotes/index.tsx`
- A page behind a permission (the quotes list, `/admin/quotes`) sent away a person who HOLDS the permission whenever the page was loaded in full (typed address, reload, Back): the permissions context answered "finished, no permissions" while the sign-in state was still being established, and the page pushed the person to `/admin`, an address with no page. The context now reports "loading" until it is known who the person is and their first answer, or a failure, has arrived. Nobody signed in still gives "finished, no permissions".
- An answer that arrives late for a previous person, or for an older request of the same person, is dropped whole (permissions, the saved copy in the browser and the "settled" marker are left alone).
- The quotes list sends a person without access to `/dashboard`, which exists for every role.
- The sign-in flow and `middleware.ts` are not touched.

**The revoked-session browser test (N132)** — `tests/e2e/auth-lifecycle.spec.ts`
- The test "a session revoked while the page is open lands on /login and stays there (no loop)" waited for Playwright's `networkidle`. Playwright counts a request as in flight until its body is read; the side menu's `/api/pasantias/mine` check never reads the body of an answer that is not ok, so when the revoke landed while that request was in flight the page was quiet but never "idle", and the test waited five minutes and failed. Cause shown with four instrumented failing runs, server logs and a reproduction outside the application.
- The test now waits until no request is still awaiting its answer and nothing has started or navigated for 500 ms (the same quiet window, capped at 30 s), and fails on any navigation away from `/login` after the landing. No assertion removed, no retry added, no timeout raised. The application code is unchanged: the menu line belongs to the redesign and is recorded for it.

## Files, grouped by risk

- Highest: `contexts/PermissionContext.tsx` (every page that asks for a permission reads it).
- Low: `pages/admin/quotes/index.tsx` (one redirect target).
- Tests: `__tests__/contexts/PermissionContext.lateSession.test.tsx`, `__tests__/components/permissions/PermissionGuard.fullLoad.test.tsx` (new), `tests/e2e/auth-lifecycle.spec.ts` (one test's way of waiting).

## What changes for people

- An admin who reloads the quotes list, or opens it from a typed address or with Back, stays on it instead of landing on a «404».
- Nothing else is visible.

## Validation (on this branch, after it was replayed on `be1913a8b`)

- Unit tests: 619 files, 19,343 pass, 18 skipped. Type check and lint pass.
- CI's mandatory browser tests, run locally with the CI script: 30 files, 344 pass, no skips, no second tries.
- The revoked-session test file alone, eight runs in a row after the change: eight pass (before: it failed 1 run in 4 on main and 2 in 4 on the previous release branch).
- Database tests were not run again: this release changes no migration and no database test.
- The permissions fix was read by a second model (one change asked for and made: the late answer) and used by sight in a browser on 17 Nov, before the replay: the admin stays on the quotes list on reload, typed address and Back.

## Review focus

1. `contexts/PermissionContext.tsx`: can "loading" stay true for ever (a sign-in state that never settles, a failed request); can one person's saved permissions be shown to the next person on the same browser.
2. The test: does it still prove what its name says.

## Known and left for later

- The side menu's `/api/pasantias/mine` request stays open for about five minutes after a 401 (recorded for the redesign, which owns the menu). Five other browser test files wait for `networkidle` and could hang the same way.
- Since the owner's decision of 17 Nov that Gestión is for admins only, the quotes list's own permission check matters only for admins.

No credentials, no personal data in tests (invented people only), no Production action by any agent.

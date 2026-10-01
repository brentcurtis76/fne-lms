# SM-B008 — W-B10c-01b middleware verified identity — review request

- **Branch:** `fix/sm-b008-mw` (local only, not pushed), base `fix/sm09-ci` at `2e119d117`, 2 commits (round 1 answers Codex review r0: CHANGES_REQUIRED, 3 blocking + 1 note).
- **Worked by hand** (Brent, 2026-10-01): Herdr/PM loop bypassed; Claude Code implemented, Codex reviews independently. Plan criterion SM-C010 (plan session PS-20260929-061858, approved 2026-09-29), SM-17 completion plan step A2.
- **Predecessor:** W-B10c-01a / SM-18 (`a98e2f6df`, API cookie identity) — this unit mirrors it for page/middleware decisions.

## Objective

`middleware.ts` makes every role/school/community decision from the identity the auth server verifies for the cookie's access token, not from the client-controlled `session.user` that auth-helpers returns as stored for a legacy JSON cookie. A lower-role caller whose own valid token is paired with a cookie naming a privileged user is denied. Login redirects (with `next=`), the forced-password-change gate and its escape hatches, and legitimate access are preserved.

**In scope:** `middleware.ts`, `__tests__/middleware.test.ts`, `__tests__/middleware.forced-password-change.test.ts`, `tests/e2e/auth-lifecycle.spec.ts` (the SM-17 A2 four-file allowlist) and this file.
**Out of scope:** logout/recovery-grant behavior (SM-B009, needs Brent's decision), direct `getSession()` in API routes (SM-B015), revocation of an unexpired JWT, any migration/RLS change, push/PR/merge/deploy.

## Change

- After `getSession()`, `supabase.auth.getUser(session.access_token)` resolves the caller; every role/community/school lookup and the forced-change log use that verified id. No fallback to the cookie's user. `getSession()` may refresh first; the token verified is the one it returns.
- **Token rejected by the auth server** (forged / revoked / dead cookie):
  - API paths → `401 {code: SESSION_INVALID}` (round 1: no longer falls through as anonymous — Codex r0 #1: `assignment-matrix/content-stats.ts` reads `session.user.id` with a service-role client, so falling through was a bypass).
  - Pages → treated as signed out (session-required pages → `/login?next=…`; others → anonymous) **and the `sb-*-auth-token[.n]` cookies are expired** on that response (round 1 — Codex r0 #2: otherwise `pages/login.tsx:46–50` sees the leftover client session and pushes back to `next`, a loop).
- **Auth server unreachable** (`isAuthRetryableFetchError`): API → 503 `PASSWORD_STATE_UNAVAILABLE`; pages → the existing retry panel `/change-password?estado=no-verificado`; cookie kept. Same fail-closed shape as an unreadable forced-change flag.
- **Round 2 (Codex r1):**
  - *Outage loop* — `pages/api/auth/password-change-state.ts` answered 401 for a retryable `getUser` error, so `/change-password` sent the user to `/login`, whose retained session pushed back through the middleware's retry panel. It now answers **503 `PASSWORD_STATE_UNAVAILABLE`**, which the page already renders as its retry panel (it stops there).
  - *Mounted-session loop* — `pages/login.tsx` pushed to `next` on any remembered session. It now calls `lib/auth/remembered-session.ts` `checkRememberedSession()`: `getUser()` first; confirmed → proceed as before; rejected → `signOut({ scope: 'local' })` and show the form; unreachable → stay with a retry message, session kept. Covers client-side navigation where the React session context survives the cookie expiry.

## Tests

- `__tests__/middleware.test.ts`: stub gains `getUser` (default = the session's own user, so the 24 existing cases are unchanged) and **10 new cases**: forged cookie denied on `/admin/users`, `/community/workspace`, another school's page, with the role lookup for the verified id only; real admin allowed with `getUser(token)`; rejected token → login + `next`, no role lookup, auth cookie expired (and only it); no user on `/meet` → login; rejected token on an API → 401 `SESSION_INVALID`, cookie expired, no RPC/role lookup; rejected token on a no-session page → anonymous + cookie expired; unreachable auth server → API 503 with cookie kept, page → retry panel.
- **All 10 fail on the base middleware** (10 failed / 24 passed) and pass on this one.
- `__tests__/middleware.forced-password-change.test.ts`: stub gains `getUser`; 161/161 unchanged.
- `tests/e2e/auth-lifecycle.spec.ts` — `middleware verified identity (W-B10c-01b)` (round 1 — Codex r0 #3): synthetic community + synthetic admin and docente **in that community**, so under the docente's own token the admin's `user_roles` row is readable (`user_roles_community_member_view`) — the precondition is asserted over PostgREST, so the case cannot pass vacuously. The docente's token in a legacy cookie naming the admin → `GET /admin/user-management` answers **307 → /dashboard** (`maxRedirects: 0`, the middleware's own answer); positive control: the admin's honest cookie → **200**. Exact-id cleanup (roles, profiles, auth users, community) in `finally`.

## Gate evidence (local, round 2 tree, 2026-10-01)

| Gate | Result |
|---|---|
| focused middleware suites | 195/195 (10 new cases fail on the base middleware) |
| `__tests__/lib/auth/remembered-session.test.ts` (new, node env) | 4/4 |
| `__tests__/api/auth/password-change-state.availability.test.ts` (new) | 2/2 (retryable → 503, rejected → 401) |
| existing login / change-password / security suites | 207/207 — **but see note**: `.tsx` component tests do not execute in this checkout |
| `npm run type-check` / `npm run lint` | exit 0 / exit 0 |
| `npm test` | 366 files, 9,547 passed, 1 skipped |
| `npm run build` (synthetic public env) | exit 0 |
| e2e `--grep "W-B10c-01b"` | **2 passed**: forged cookie → 307 (old code: 200); **revoked session while the page is open → lands on /login and stays** (7 rejected requests in the server log, then quiet) |
| revoked-session e2e with the round-1 `pages/login.tsx` | **failed** (did not settle on /login within 5 min) — the loop reproduced |

E2E environment: disposable stack `sm1001disposable` (API :55021, DB :55022), app `dev:unsafe` on :3311, gitignored `.env.local`. Cleanup: every passing run removes its rows in `finally`; the deliberately failing run was killed by its timeout and left 1 account + 1 community, removed afterwards by exact id (residue now 0).

**Note — component tests silently skipped:** in this checkout (and the configured SM root) every `__tests__/**/*.test.tsx` (67 files, including `LoginPage.passwordRecovery`) reports "no tests" under Vitest 0.34.6 / Node 22.16 without error; the 366 files counted are `.ts` only. Pre-existing, not caused by this unit; the round-2 logic was therefore put in `lib/auth/remembered-session.ts` and tested in node. Needs its own investigation (CI may share it).

## Scrutinize hardest

1. **Failure modes of `getUser`**: rejected token → cookie expired + login (no loop); unreachable server → retry panel / 503, cookie kept. Check the retryable classification and that expiring the cookie on a public no-session page is harmless.
2. **Latency**: one extra auth-server round trip per matched request that carries a session (all API routes + app pages). Acceptable? No caching was added.
3. **API 401 on a rejected cookie**: a public API route (form, webhook) reached with a dead cookie now gets 401 instead of anonymous handling. Rare (getSession refreshes expired tokens first) but a behavior change. Routes that still read `session.user` directly are SM-B015's inventory (the audit found `pages/api/admin/assignment-matrix/{group-assignments,audit-log,content-stats}.ts`).
4. **Refreshed cookies on redirects**: as before this unit, redirect responses are new objects and do not carry cookies `getSession()` may have written on `res` (pre-existing; installed supabase-js is 2.91.1).
5. **e2e assertion**: 307 status and `/dashboard` location are the middleware's own answer; confirm no other layer could produce them for the forged case.

## Known limitations

- Revoked session replayed before JWT expiry: `getUser` asks the auth server, so a revoked session should now fail, but this unit does not prove it (SM-18 D5 measured provider behavior for APIs).
- W-B10c-01 parent stays held (needs SM-B009 logout decision, SM-B015 inventory, SM-B010 final review, Brent's gate decision).

## Release port onto origin/main (2026-10-01)

`origin/main` (0cb21adef) already carries a newer `pages/login.tsx` (the login-loop recovery work, `2148c8723`/`fecc18537`) whose `runLogin` validates a remembered session with `auth.getUser()`, signs out locally when the provider rejects it, refuses to navigate when verification or cleanup is unavailable, and guards every step with an attempt id. That covers what SM-B008 rounds 2–3 added to the older SM-branch login page (`lib/auth/remembered-session.ts`). The release branch `fix/sm-hand-rel` therefore keeps main's login page unchanged and carries from SM-B008: the middleware (rounds 0–1), `pages/api/auth/password-change-state.ts` 503-on-outage + its test, and the two e2e cases. The remembered-session helper and its test exist only on `fix/sm-b008-mw`. The revoked-session e2e is re-run against main's login page on the release tree.

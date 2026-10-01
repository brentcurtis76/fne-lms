# SM-B008 — W-B10c-01b middleware verified identity — review request

- **Branch:** `fix/sm-b008-mw` (local only, not pushed), base `fix/sm09-ci` at `2e119d117`, 1 commit.
- **Worked by hand** (Brent, 2026-10-01): Herdr/PM loop bypassed; Claude Code implemented, Codex reviews independently. Plan criterion SM-C010 (plan session PS-20260929-061858, approved 2026-09-29), SM-17 completion plan step A2.
- **Predecessor:** W-B10c-01a / SM-18 (`a98e2f6df`, API cookie identity) — this unit mirrors it for page/middleware decisions.

## Objective

`middleware.ts` makes every role/school/community decision from the identity the auth server verifies for the cookie's access token, not from the client-controlled `session.user` that auth-helpers returns as stored for a legacy JSON cookie. A lower-role caller whose own valid token is paired with a cookie naming a privileged user is denied. Login redirects (with `next=`), the forced-password-change gate and its escape hatches, and legitimate access are preserved.

**In scope:** `middleware.ts`, `__tests__/middleware.test.ts`, `__tests__/middleware.forced-password-change.test.ts`, `tests/e2e/auth-lifecycle.spec.ts` (the SM-17 A2 four-file allowlist) and this file.
**Out of scope:** logout/recovery-grant behavior (SM-B009, needs Brent's decision), direct `getSession()` in API routes (SM-B015), revocation of an unexpired JWT, any migration/RLS change, push/PR/merge/deploy.

## Change

- After `getSession()`, `supabase.auth.getUser(session.access_token)` resolves the caller. `userId` = the verified id, or `null` on any error / missing user (logged as `[middleware] session verification failed`, no PII).
- `!userId` takes the existing no-session branch exactly (session-required pages → `/login?next=…`; everything else falls through as anonymous). No fallback to the cookie's user.
- All four `session.user.id` uses (forced-change log, `/admin`, `/community/workspace`, school-scoped role lookups) now use `userId`.
- The forced-change RPC was already safe (it reads `auth.uid()` from the signed JWT); it now only runs after verification.

## Tests

- `__tests__/middleware.test.ts`: stub gains `getUser` (default = the session's own user, so the 24 existing cases are unchanged) and 7 new cases: forged cookie denied on `/admin/users`, `/community/workspace`, another school's page (and role lookup is for the verified id, never the claimed id); real admin allowed and `getUser` called with the token; verification error → login with `next`, no role lookup; no user on `/meet` → login; unverifiable API request falls through like an anonymous one, no RPC.
- The 7 new cases **fail on the old middleware** (7 failed / 24 passed) and pass on the new one.
- `__tests__/middleware.forced-password-change.test.ts`: stub gains `getUser` returning the session's own user; 161/161 unchanged.
- `tests/e2e/auth-lifecycle.spec.ts`: new describe `middleware verified identity (W-B10c-01b)` — synthetic admin + docente, docente's real token in a legacy cookie naming the admin → `/admin/users` and `/community/workspace` answer **307 → /dashboard** from the middleware itself (read with `maxRedirects: 0`, so client-side page gating cannot mask a middleware pass); positive control: admin's honest cookie → 200. Exact-id cleanup in `finally`. **NOT YET RUN** — needs Brent's SM-K021 decision on synthetic local rows and a verified isolated stack.

## Gate evidence (local, this tree, 2026-10-01)

| Gate | Result |
|---|---|
| focused `vitest run __tests__/middleware.test.ts __tests__/middleware.forced-password-change.test.ts` | 192/192 |
| `npm run type-check` | exit 0 |
| `npm run lint` (zero warnings) | exit 0 |
| `npm test` | 364 files, 9,538 passed, 1 skipped (SM-33 baseline 9,531 + 7 new) |
| `npm run build` (synthetic public env) | exit 0 |
| `git diff --check` | clean |
| e2e D6 browser | pending (see above) |

## Scrutinize hardest

1. **Failure mode of `getUser`**: a transient auth-server error now logs users out of session-required pages (redirect to login) instead of trusting the cookie. Fail-closed by design; check it cannot loop (login page is not in the matcher).
2. **Latency**: one extra auth-server round trip per matched request that carries a session (all API routes + app pages). Acceptable? No caching was added.
3. **API fall-through**: an unverifiable cookie on `/api/*` is treated as anonymous and reaches the route, which authenticates itself (`getApiUser` verifies since SM-18). Any API route that trusts middleware instead of authenticating itself would be exposed — that inventory is SM-B015, not this unit.
4. **Token refresh**: `getSession()` may refresh and rewrite cookies on `res` before `getUser`; verify the refreshed token, not a stale one, is the one verified (auth-helpers 0.10 / supabase-js 2.49).
5. **e2e assertion**: 307 status and `/dashboard` location are the middleware's own answer; confirm no other layer could produce them for the forged case.

## Known limitations

- Revoked session replayed before JWT expiry: `getUser` asks the auth server, so a revoked session should now fail, but this unit does not prove it (SM-18 D5 measured provider behavior for APIs).
- W-B10c-01 parent stays held (needs SM-B009 logout decision, SM-B015 inventory, SM-B010 final review, Brent's gate decision).

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

## Tests

- `__tests__/middleware.test.ts`: stub gains `getUser` (default = the session's own user, so the 24 existing cases are unchanged) and **10 new cases**: forged cookie denied on `/admin/users`, `/community/workspace`, another school's page, with the role lookup for the verified id only; real admin allowed with `getUser(token)`; rejected token → login + `next`, no role lookup, auth cookie expired (and only it); no user on `/meet` → login; rejected token on an API → 401 `SESSION_INVALID`, cookie expired, no RPC/role lookup; rejected token on a no-session page → anonymous + cookie expired; unreachable auth server → API 503 with cookie kept, page → retry panel.
- **All 10 fail on the base middleware** (10 failed / 24 passed) and pass on this one.
- `__tests__/middleware.forced-password-change.test.ts`: stub gains `getUser`; 161/161 unchanged.
- `tests/e2e/auth-lifecycle.spec.ts` — `middleware verified identity (W-B10c-01b)` (round 1 — Codex r0 #3): synthetic community + synthetic admin and docente **in that community**, so under the docente's own token the admin's `user_roles` row is readable (`user_roles_community_member_view`) — the precondition is asserted over PostgREST, so the case cannot pass vacuously. The docente's token in a legacy cookie naming the admin → `GET /admin/user-management` answers **307 → /dashboard** (`maxRedirects: 0`, the middleware's own answer); positive control: the admin's honest cookie → **200**. Exact-id cleanup (roles, profiles, auth users, community) in `finally`.

## Gate evidence (local, round 1 tree, 2026-10-01)

| Gate | Result |
|---|---|
| focused `vitest run __tests__/middleware.test.ts __tests__/middleware.forced-password-change.test.ts` | 195/195 (34 + 161) |
| same 10 new cases on the **base** middleware | 10 failed / 24 passed (discriminates) |
| `npm run type-check` | exit 0 |
| `npm run lint` (zero warnings) | exit 0 |
| `npm test` | 364 files, 9,541 passed, 1 skipped (base 9,531 + 10 new) |
| `npm run build` (synthetic public env) | exit 0 |
| `git diff --check` | clean |
| e2e `--grep "W-B10c-01b"` on this tree | **1 passed** (forged → 307 /dashboard; admin → 200) |
| same e2e on the **base** middleware | **1 failed: expected 307, received 200** — the bug reproduced end to end |

E2E environment: disposable Supabase stack `sm1001disposable` (API 127.0.0.1:55021, DB 127.0.0.1:55022; all SM migrations through `20260926210000`, no seed), app via `npm run dev:unsafe` on :3311 (`E2E_PORT=3311`), gitignored `.env.local` pointing at that stack. Brent authorised synthetic local accounts on 2026-10-01. Fixtures logged by the spec (1 community, 2 accounts); after both runs 0 `e2e-b10c01b-%` users, 0 fixture communities, 0 fixture role rows.

## Scrutinize hardest

1. **Failure modes of `getUser`**: rejected token → cookie expired + login (no loop); unreachable server → retry panel / 503, cookie kept. Check the retryable classification and that expiring the cookie on a public no-session page is harmless.
2. **Latency**: one extra auth-server round trip per matched request that carries a session (all API routes + app pages). Acceptable? No caching was added.
3. **API 401 on a rejected cookie**: a public API route (form, webhook) reached with a dead cookie now gets 401 instead of anonymous handling. Rare (getSession refreshes expired tokens first) but a behavior change. Routes that still read `session.user` directly are SM-B015's inventory (the audit found `pages/api/admin/assignment-matrix/{group-assignments,audit-log,content-stats}.ts`).
4. **Refreshed cookies on redirects**: as before this unit, redirect responses are new objects and do not carry cookies `getSession()` may have written on `res` (pre-existing; installed supabase-js is 2.91.1).
5. **e2e assertion**: 307 status and `/dashboard` location are the middleware's own answer; confirm no other layer could produce them for the forged case.

## Known limitations

- Revoked session replayed before JWT expiry: `getUser` asks the auth server, so a revoked session should now fail, but this unit does not prove it (SM-18 D5 measured provider behavior for APIs).
- W-B10c-01 parent stays held (needs SM-B009 logout decision, SM-B015 inventory, SM-B010 final review, Brent's gate decision).

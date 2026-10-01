# SM-B015 batch 1 — user-writable `user_metadata.roles` granted admin — review request

- **Branch:** `fix/meta-admin` (local only), base `fix/sm09-ci` at `2e119d117`, 2 commits (round 1 answers Codex r0 CHANGES_REQUIRED: 1 blocking + 4 notes).
- **Origin:** SM-B015 direct-session route inventory (2026-10-01, `sm-b015-route-inventory.md`, 68 rows) — this is its most urgent item because it needs **no forged cookie**: any signed-in user can call `supabase.auth.updateUser({ data: { roles: ['admin'] } })` from the browser console, and these routes then accepted them as admin (or consultor) and wrote through the **service-role** client. Exploitable in Production today if this code is live there.
- **Authority:** Brent's 2026-10-01 instruction to work SM by hand and fix what blocks it; plan criterion SM-C019 (each risky route gets a bounded remediation). Codex reviews.

## Affected routes (all `getSession()` + `session.user.user_metadata.roles` → service-role)

| Route | Old gate | Effect for a self-promoted user |
|---|---|---|
| `POST /api/upcoming-courses` | metadata `admin` OR DB admin | create catalog entries |
| `PUT/DELETE /api/upcoming-courses/[id]` | same | edit / delete any upcoming course |
| `GET /api/upcoming-courses/admin` | same | read inactive/unpublished entries |
| `GET/POST /api/course-proposals` | metadata `admin`/`consultor` OR DB | read all proposals, create proposals |
| `PUT/DELETE /api/course-proposals/[id]` | same + `created_by === session.user.id` | edit/delete own proposals (and, with a forged cookie id, anyone's) |

## Change

Round 0 (8 files):
- `lib/api-auth.ts`: new `requireVerifiedRole(req, res, roles, forbiddenMessage)` — identity from `getApiUser()` (auth-server verified since SM-18; cookie or Bearer), role from an **active `user_roles` row** via the service client; never reads `user_metadata`.
- The 5 route files use it; every `session.user.id` (ownership, `created_by`) is the verified `caller.id`. Public GETs are unchanged.

Round 1 (Codex r0):
- **Blocking #1 — forced-password bypass via Bearer:** `requireVerifiedRole` now asks `getForcedPasswordChangeVerdict` for the verified caller before any role decision and returns the established body/status (403 `PASSWORD_CHANGE_REQUIRED` / 503 `PASSWORD_STATE_UNAVAILABLE`). It returns `{ status, body }` on refusal, and the routes send exactly that.
- **#3 — the four other metadata-authority sites**, fixed here:
  - `pages/api/admin/approve-user.ts` (Bearer-only): metadata branch removed; active admin row required; forced-password gate added.
  - `pages/api/admin/notification-types.ts` (Bearer-only): metadata **and the legacy `profiles.role` column** replaced by `requireVerifiedRole(['admin'])`.
  - `pages/api/transformation/assessments/[id]/{evaluate-objective,finalize}.ts`: `isAdmin(session)` (metadata) removed; admin only from an active row; the caller is resolved with `auth.getUser(session.access_token)` and that id replaces every `session.user.id` (these were also forged-cookie targets in the inventory).
- **#5 — inactive course disclosure:** public `GET /api/upcoming-courses/[id]` now filters `is_active = true` (the admin page uses PUT/DELETE on that path, never GET).
- **#2 / #4 — tests:**
  - `lib/__tests__/api-auth.requireVerifiedRole.test.ts` (8): the role mock honours `user_id`, `role_type IN` and `is_active`; adds inactive-row 403, flagged admin 403 `PASSWORD_CHANGE_REQUIRED`, unreadable flag 503.
  - `__tests__/api/upcoming-courses/metadata-authority.test.ts` (18): all 8 protected handlers pass every refusal (401/403/forced 403/503/500) through unchanged with **no** service-role access; both POSTs attribute `created_by` to the verified id; PUT/DELETE on someone else's proposal → 403 with no write, on the caller's own → proceeds; public list and detail GETs need no caller and filter `is_active`. The **repository guard** now scans `pages/api` **and** `lib`, catches dotted/optional/bracket/destructured metadata role reads plus `metadataHasRole`, `extractRolesFromMetadata`, `isAdmin|hasRole|hasAnyRole|getUserRoles(session…)`, proves its detector on positive and negative fixtures, and lists its one reviewed exception (`lib/api-auth.ts`: metadata roles feed only the auth log line).
  - `__tests__/api/admin/approve-user.authority.test.ts` (3): metadata-claimed admin → 403 no write; flagged admin → 403 `PASSWORD_CHANGE_REQUIRED` no write; active admin → 200.

## Scrutinize hardest

1. `requireVerifiedRole` uses the service client for the role read (like `checkIsAdmin`'s `hasAdminPrivileges`); confirm `is_active` and role names match `types/roles.ts`.
2. Behavior change: an admin whose DB role row is missing but whose metadata said admin loses access. That is the point, but check no legitimate admin relies on metadata only (the `user_roles` table is the system of record per `utils/roleUtils.ts`).
3. The guard's regex `user_metadata\??\.roles?\b` and its comment filter.
4. course-proposals ownership now uses the verified id — confirm no client sends a different `created_by`.

## Not in this batch

The other SM-B015 batches (forged-cookie `session.user.id` in ~40 routes, e.g. `admin/roles/permissions/overlay.ts`, `admin/networks/schools.ts`, reports, assignment-matrix). No other role-authorizing metadata site remains in `pages/api` or `lib` (the guard enforces it). Client pages that read metadata for display only (`pages/admin/debug/course-module-ids.tsx`, `pages/admin/transformation/metrics.tsx`) are not authority and are left for the SSR batch.

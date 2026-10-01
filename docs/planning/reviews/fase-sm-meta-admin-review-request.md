# SM-B015 batch 1 — user-writable `user_metadata.roles` granted admin — review request

- **Branch:** `fix/meta-admin` (local only), base `fix/sm09-ci` at `2e119d117`, 1 commit.
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

## Change (8 files)

- `lib/api-auth.ts`: new `requireVerifiedRole(req, res, roles)` — identity from `getApiUser()` (auth-server verified since SM-18), role from an **active `user_roles` row** via the service client; never reads `user_metadata`. 401 no verified caller / 403 no such role / 500 lookup error (fail closed).
- The 5 route files: the `getSession()` + metadata block is replaced by `requireVerifiedRole`; every `session.user.id` (ownership checks, `created_by`) is now the verified `caller.id`. Public GETs of upcoming courses are unchanged.
- Tests: `lib/__tests__/api-auth.requireVerifiedRole.test.ts` (5: no session 401; **metadata says admin but no DB role → 403**; DB role → verified user; cookie-claimed id ≠ verified id → looks up the verified id; lookup error → 500) and `__tests__/api/upcoming-courses/metadata-authority.test.ts` (8 handlers × 401/403/500, each asserting the service client is never touched after a denial, + a **repository guard**: no file under `pages/api` reads `user_metadata.roles` outside comments).

## Gate evidence

See the commit body / table below once the full run completes.

## Scrutinize hardest

1. `requireVerifiedRole` uses the service client for the role read (like `checkIsAdmin`'s `hasAdminPrivileges`); confirm `is_active` and role names match `types/roles.ts`.
2. Behavior change: an admin whose DB role row is missing but whose metadata said admin loses access. That is the point, but check no legitimate admin relies on metadata only (the `user_roles` table is the system of record per `utils/roleUtils.ts`).
3. The guard's regex `user_metadata\??\.roles?\b` and its comment filter.
4. course-proposals ownership now uses the verified id — confirm no client sends a different `created_by`.

## Not in this batch

The other SM-B015 batches (forged-cookie `session.user.id` in ~40 routes, e.g. `admin/roles/permissions/overlay.ts`, `admin/networks/schools.ts`, reports, assignment-matrix). Client pages that read metadata for display only (`pages/admin/debug/course-module-ids.tsx`, `pages/admin/transformation/metrics.tsx`) are not authority and are left for the SSR batch.

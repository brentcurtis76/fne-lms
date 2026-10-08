# NOTIF-19 (N4-01) — review request: preferences API rewrite

- **Branch:** `fix/notif19-rebuild` · **base/HEAD:** `d0e72ebdc30a642f0cfc78276a323e363206fa56` · **commits:** 0 (uncommitted
  working tree; the PM commits on acceptance). Same-unit rebuild (order r1) of the reviewed N4-01 change (`725b705c2`, set aside
  because `PROJECT_STATE.md` changed on main): the five code/test/doc files are carried over unchanged in substance; their
  dependencies (`lib/api-auth.ts`, `lib/notifications/*`, `lib/notificationService.ts`, `lib/email/*`) are identical between the
  old base `541c84b92` and `d0e72ebdc`. The `PROJECT_STATE.md` section is added above main's current top section.
- **Objective (order r1, same as r0):** replace the broken `/api/user/notification-preferences` with an authenticated, owner-only GET of
  effective notification email settings and a strictly validated PUT of category choices on the existing schema. Keep the
  resolver precedence, mandatory events, legacy in-app preferences and the dormant outbox. Document the contract for N4-02.
- **In scope:** the route, its logic module, a Vitest suite through the real handler, a Playwright spec for the real route.
- **Out of scope:** the settings page and entry points (N4-02/N4-03), retiring the admin tab and dead routes (N4-03),
  migrations/RLS, digest scheduling/hour (N5-01), producers and worker, flags in production, deployments.

## API contract (for N4-02)

`GET /api/user/notification-preferences` and `PUT` (same response). Auth: session cookie or `Authorization: Bearer <jwt>`,
verified by `requireVerifiedCaller` (auth server + forced-password gate). The user is always the verified caller; any
`user_id` in the query string is ignored, and one in the body is refused.

**200 response**
```jsonc
{
  "categories": [
    {
      "category": "courses",            // courses|assignments|community|sessions|advisory|licitaciones|qa_support|system, catalog order
      "label": "Cursos y aprendizaje",  // CATEGORY_LABELS (es-CL)
      "email_mode": "default",          // stored choice: default|immediate|digest|off; "default" when no row
      "stored": false,                  // whether a row exists
      "events": [
        {
          "event_type": "course_assigned",
          "mandatory": false,
          "catalog_default": "immediate",   // immediate|digest|off
          "mode": "immediate",              // resolveEmailPreference result
          "delivery": "immediate",          // what is sent today: digest → immediate while digest.available is false
          "reason": "catalog_default",      // mandatory|category_mode|legacy_suppressed|catalog_default
          "legacy_suppressed": false        // a legacy row suppresses this event whenever the category is "default"
        }
      ]
    }
  ],
  "digest": { "available": false },          // NOTIFICATION_OUTBOX_DELIVERY (isOutboxDeliveryEnabled)
  "address_suppression": "unavailable"       // suppressed|clear|unavailable (bounce suppression of the caller's address)
}
```
Every catalog event is listed under its category. The page filters by role and scope for display only. Legacy rule: the exact
`(user_id, event_type)` row with `email_enabled=false`; `meeting_finalized` counts any such row (as `getCommunityRecipients`).

**PUT body:** `{ "categories": [ { "category": "<category>", "email_mode": "default|immediate|digest|off" } ] }`, 1–8 entries,
distinct categories, no other key at either level. Only the listed categories are written, in one upsert on
`(user_id, category)`; other stored rows (a stored `digest` included) are kept. `pref_version`, `created_at` and `updated_at`
are the database's. `default` is stored as a `default` row, which re-applies legacy suppression.

**Errors** — body `{ "error": "<es-CL message>", "code": "<code>" }` unless noted:

| Status | code | When |
|---|---|---|
| 400 | `invalid_body` | not an object, `categories` missing/not an array/empty/over 8, entry not an object, missing or non-string field |
| 400 | `unknown_field` | any other key: `user_id`, `global_settings`, `preferences`, `in_app_enabled`, `mandatory`, `pref_version`, timestamps, `events`… |
| 400 | `unknown_category` / `invalid_mode` / `duplicate_category` | as named |
| 400 | `digest_unavailable` | a `digest` choice while the digest is off, unless that category is already stored as `digest` |
| 401 | — (`{"error":"No autorizado"}`) | no, invalid or revoked credentials |
| 403 / 503 | `PASSWORD_CHANGE_REQUIRED` / `PASSWORD_STATE_UNAVAILABLE` | forced-password gate |
| 405 | — | any other method; `Allow: GET, PUT` |
| 500 | `read_failed` / `write_failed` / `unexpected` | database read/write failure or exception; nothing partial is written, no success is claimed |

## Files, by risk
- **High — auth/ownership boundary:** `pages/api/user/notification-preferences.ts` (rewritten, 93 lines). It now reads and writes through the
  caller's own client (`createApiSupabaseClient`, so the owner-only RLS applies too). The service role is used only for the
  bounce-suppression RPC.
- **Medium — logic:** `lib/notifications/preferences-api.ts` (new): body validation, digest rule, view building, read/upsert.
- **Tests:** `__tests__/api/notification-preferences.test.ts` (new, 63 tests), `tests/e2e/notification-preferences-api.spec.ts` (new, 2 tests).
- **Docs:** this file, `PROJECT_STATE.md` (one section).

## Test evidence
- Focused `npx vitest run __tests__/api/notification-preferences.test.ts`: 63 tests (D1 6, D2 5, D3 26 invalid bodies + 1
  digest + 9 roles + 2, D4 3 methods + 3 credential cases + 8). In the original round, seven hand mutants (meeting rule,
  compat delivery, digest check, service-role client, entry key check, 405, merge) each failed 1–6 tests; not re-run here.
- Regression (catalog, resolver, three api-auth suites), type-check, lint, `npm test`, build on this rebuild's final state:
  see the r1 executor report (`runs/NOTIF-19/executor-report-r1.md`) for exact commands, exit codes and counts.
- Playwright through `pm-unit ui-run` on a new private stack `notif19r1` (API 56421 / DB 56422, migrations copied unaltered
  from `d0e72ebdc`): 2 tests. Desktop 1366×768: cookie save, reload, mandatory, legacy and Predeterminado, invalid and digest
  refusals. Mobile 390×844: an admin using a Bearer token cannot change A's settings, and calls without credentials are
  refused. Fixtures are deleted by exact id, and the manifest records zero remaining.

## Scrutinize hardest
1. **Which client does what:** reads and the upsert use the caller's cookie/Bearer client (RLS plus an explicit `user_id`
   filter). `requireVerifiedCaller` and the suppression RPC use the service role. Check that no path takes an id from the request.
2. **Legacy rule parity:** the view mirrors `resolveEmailChannel` (exact `event_type` row) and `getCommunityRecipients`
   (any false row for `meeting_finalized`). The sync path also falls back to the category name when `event_type` is missing.
   No catalog event lacks one, so that fallback is not modelled.
3. **The digest rule:** the stored rows are read before the write, with no lock. Owners write only their own rows, so the
   only race is the same person in two tabs. With the flag off, resending an already stored `digest` is allowed so a page can
   send its full state back. Confirm that is the reading you want.
4. **`delivery` while the flag is on** is reported as `digest`. Today's sync path still sends a digest choice immediately in
   every case, and the digest itself is N5-01. So `delivery` is truthful for the flag-off state that production is in.
5. **The legacy admin tab** (`components/configuration/UserPreferences.tsx`, outside the allowlist) still sends the old shape.
   Its GET now gets 200 with keys it ignores, and its PUT gets 400 instead of the old 500. Both fail silently in the UI, as before.

## Known limitations / deferred
- No digest-hour field: none is stored yet (N5-01), so the response does not promise one.
- `address_suppression` is `unavailable` wherever `NOTIFICATION_SUPPRESSION_SECRET` is unset (local, and any environment without the key).
- Raw bodies over Next's default 1 MB limit get Next's own 413. Anything under it that is too large fails validation with 400.
- Admin tab and dead routes: N4-03. The spec is not in CI's mandatory e2e list (`scripts/ci/e2e-mandatory.mjs` is outside the allowlist).

# RD-4c — platform redesign, step 4c: 25 leftover pages retired. Review request

- **Branch:** `feat/rd-retire` · **Base:** step 4a of the redesign (`feat/rd-tokens`; main once that is published) · **Commits:** 6 (the retirement, one test kept, one test tightened, the inventory rebuilt twice, this record)
- **Part of the platform redesign** (plan phase 4). Brent confirmed the list on 2026-11-13.

## Objective and scope

Delete 25 test, debug and old pages, with exactly the things that must change with them. Everything else on the platform behaves and looks as before.

**In (deleted):** `/test`, `/test-logout`, `/test-rbac`, `/test-sentry`, `/test-sidebar-role`, `/test-toast`, `/test-user-role`, `/email-showcase`, `/brand-preview`, the stray file `pages/_app 2.tsx`, `/debug-feedback-permissions`, `/dashboard-old`, `/creador-de-cursos`, `/courses/[id]`, `/my-paths/[id]`, `/admin/bucket-test`, `/admin/debug/ids`, `/admin/debug/course-module-ids`, `/admin/setup-news`, `/admin/test-session`, `/admin/test-spanish-input`, `/admin/create-course`, `/admin/new-reporting`, `/admin/form-usage`, `/admin/apply-network-migration`.

**Out, on purpose:**
- `middleware.ts` and `lib/auth/forced-password-change.ts` are untouched, although both still list `/dashboard-old`, `/creador-de-cursos`, `/courses`, `/debug-feedback-permissions` and `/my-paths`. A listed address with no page answers "not found" after the same checks as before.
- Components, helpers and API routes that only these pages used are not deleted (listed under "Known limitations").
- Vías de Transformación (its own piece of work), `/my-paths` (the redirect page), `/course-manager`, `/admin/licitaciones/criterios`.

## Files, grouped by risk

**Higher — a page that stays changes**
- `pages/admin/network-management.tsx` — the yellow notice «Migración de Base de Datos Requerida» (shown only when the network tables cannot be read) loses its last line, the link «Ver instrucciones detalladas →» to the retired page. The heading, the text and the four steps stay.

**Medium — lists that named a retired page**
- `components/DynamicFavicon.tsx` — `/brand-preview` out of the list of addresses that get the GENERA icon.
- `lib/qa/exportToClaudeCode.ts`, `pages/api/qa/seed-codebase-index.ts` — retired paths out of two lists of the QA tool (hints in an export prompt; one row fewer written by a seed route that is refused in Production).

**Lower**
- The 25 page files (5,600 lines).
- `docs/plan/redesign/inventory/**` — rebuilt: 152 screen files (177 before), the 25 out of `areas.json`.

## Tests changed on purpose

- `tests/e2e/footer-heading-order.spec.ts` (CI) — it guards the heading levels of `components/Footer.tsx`. Since the public site got its own footer, `/brand-preview` was the only page of this spec that still drew `Footer.tsx`. The five public pages are checked as before; a new case signs in as the seeded docente and checks `/dashboard`, which draws `Footer.tsx` through the frame (it waits for the panel's greeting, so the headings exist, and checks it is still on `/dashboard`).
- `tests/e2e/notification-settings.spec.ts` (CI) — the step that followed the old header's bell on `/dashboard-old` to the settings page is removed. **That bell is now drawn only on `/pending-approval`, which an approved account cannot stay on: no browser test opens it any more.** No substitute was invented.
- `__tests__/lib/api-auth.server-side-user.test.ts` — `my-paths/[id]` out of its list of pages (the live copy, `mi-aprendizaje/ruta/[id]`, stays in it).

## Evidence (local, 2026-11-14)

- **Pictures** (one local stack, one snapshot; 4a built, a full run; this branch built, a full run): the 25 retired addresses are gone (500 = 25 × 20 visitor × width), **all 3,000 others are the same**, every landing among them.
- **Browser tests on the plain seeded local copy:** `footer-heading-order`, `notification-settings` and the panel pin tests: 45 of 45.
- **Gates on this branch:** `npm run type-check` clean; `npm run lint` clean; `npm test` 549 files, 18,333 tests passed, 12 skipped. The production build passed when the harness built it.
- **Independent review** (another model, read-only): approve with notes. No live link, redirect, import or `router.push` points at a retired page. At the retired addresses, read from the middleware: a signed-out visitor gets "not found" (the retired `/admin/*` pages still send to the sign-in page first), a signed-in one "not found" after one extra read of the password state, one who must change their password is sent there as before. Nothing worse than "not found": no loop, no error, no leak. Its notes on the footer test were taken in.

## Where to look hardest

1. **Addresses stored outside the code.** Old rows of `user_notifications` in Production could still hold `/courses/<id>` or `/my-paths/<id>` (code of 2025 wrote such links; no code does today). A person who follows one now gets "not found" where they got an unstyled or duplicate page. Not checked in Production.
2. **The middleware still names the retired addresses.** Deliberate; removing them is a change to the access layer and belongs with the clean-up.
3. **The footer test's new case** depends on the seeded docente account and on the panel's greeting text («¡Hola, …»).
4. **`pages/api/qa/seed-codebase-index.ts`** answers «Seeded N codebase index entries» with one fewer; rows already in a database are not removed.

## Known limitations

- Now used by nothing, left for the clean-up: `components/dashboard/unified/*` and `pages/api/dashboard/unified.ts`; `src/components/CheckUserRole.tsx`; `lib/services/coursesService.ts`; `pages/api/admin/form-usage-stats.ts` with `lib/formSubmissionTracker.ts`; `pages/api/admin/init-supervisor-tables.ts`; `pages/api/auth/logout.ts` (check before removing: it is on the forced-password allow-list). `components/layout/Header.tsx` and the old bell stay in use through `/pending-approval` only.
- The yellow notice on Redes de Colegios still tells an admin to run SQL by hand; it was there before and only shows if the tables cannot be read.
- The picture harness keeps three lookups for retired pages (a mask and two ids); they do nothing.

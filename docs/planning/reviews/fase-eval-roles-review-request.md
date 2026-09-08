# Assigned evaluations for every school role

Branch: `codex/eval-roles`
Base: `3dccd148` (current main, including assessment completion and draft recovery)
Scope: one implementation commit above this base. Brent explicitly requested merge to main and production publication on 2026-09-08; PR CI will validate the rebased commit before merge. Original local validation below ran before rebasing; the application change applied without conflict.

## Problem and behavior

An assigned community leader could open the response URL, but could not discover it in the sidebar. The sidebar both restricted the link to `docente` and skipped the assignment lookup unless the primary role was `docente`; administrators were skipped as well.

The user requested that all school roles can respond to their assigned evaluations. The sidebar now queries personal assignments for every authenticated account and shows **Procesos de Cambio → Mis Evaluaciones** when that account has an assignment. The lookup remains filtered by the signed-in user ID. Its state is bound to that ID and late responses from a previous session are ignored.

In scope: personal evaluation discovery for all existing roles, desktop/mobile navigation, pending/error/session-change behavior. Out of scope: changing roles or assignments, granting school-wide access to other people's evaluations, assessment administration, migration-plan configuration, schema changes, deployment.

## Files and risk

- `components/layout/Sidebar.tsx`: removes two role-based discovery gates and scopes cached assignment visibility to the current account. The underlying `requiresAssessments` gate remains.
- `__tests__/components/layout/Sidebar.assessmentAccess.test.tsx`: renders the real sidebar with synthetic identity/query fixtures; covers all nine roles with and without assignments, mobile, query failure, late results and logout. Also checks that assigned school roles do not gain the assessment-builder link.
- `PROJECT_STATE.md` and this note: implementation status and validation limitations.

The response pages and middleware contain no docente-only role requirement for these routes. The existing list/detail/save/submit API handlers use the authenticated user and explicit assignee checks; save and submit additionally enforce `can_edit` and `can_submit`. The checked-in RLS policies also recognize assignees by user ID. These authorization layers were reviewed and remain unchanged.

## Validation

- Node 22.22.0; dependency versions from the repository lockfile.
- Focused sidebar suite: **21/21 passed**.
- Related sidebar, assignment API, submission and response-form suites: **75/75 passed**, six files.
- TypeScript: passed.
- ESLint: passed, zero warnings.
- Production build: passed, 149 static pages; configured only against local Supabase.
- Playwright smoke against that production build on local port 3108: **2/2 passed**. This is a smoke check, not a logged-in browser walkthrough for every role.
- Full Vitest suite: **8,615 passed, 11 skipped**, 378 files passed; exit 0 (569 seconds).
- Local pgTAP suite: **1,930/1,931 passed**, 24 files. Failure is test 31 of `017-ledger-insert-sequence-boundaries.sql`: expected zero BEFORE triggers on `contract_hours_ledger`, found one. No SQL, migration, ledger code, or database configuration changed in this task. The full DB gate is not green and release readiness is not claimed.

Dependencies in the original checkout included iCloud-offloaded files that stalled test startup. A separate cache was installed from the lockfile, without changing repository dependencies or the original checkout. The unbuilt optional canvas package was excluded from that local test installation; no canvas behavior is part of this change.

## Review focus

1. Verify that assignment-based discovery is the intended policy for every role, including administrators and users with multiple roles.
2. Verify that the current-user filter and state key prevent an earlier session from showing another account's navigation state.
3. Confirm that administrative siblings remain independently gated; this change grants no assessment-builder or cross-user response access.
4. Keep evidence boundaries explicit: real component tests and a local build are not proof of a production deployment or of every live assignee's data integrity.

## Remaining work

Review and controlled integration/deployment are pending. Investigate the existing local ledger pgTAP failure separately before treating all required gates as green. Existing production migration-plan warnings are outside this navigation fix.

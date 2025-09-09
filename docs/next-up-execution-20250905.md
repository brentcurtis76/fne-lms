Next Up Execution — 2025-09-05

- Typed routes: Added feature flag wrapper to route handlers.
  - Enable via env: `ENABLE_TYPED_ROUTES=true`
  - Files: `pages/api/admin/networks/index.ts`, `pages/api/admin/networks/schools.ts`, `pages/api/learning-paths/index.ts`
  - Rollback: unset env var to revert to legacy handlers.

- Threads migration (tests first): Updated references from `community_threads` to `message_threads`.
  - Tests: `tests/workspace/groupAssignmentComments.test.tsx`, `tests/workspace/discussionCountsIntegration.test.ts`
  - App code: `pages/community/workspace.tsx`
  - Rollback: revert these files; or create a DB view `community_threads` -> `message_threads` (see `docs/threads-drift-decision.md`).

- RLS tightening for activity_feed: Added staged migration using workspace membership.
  - Migration: `database/migrations/20250905_tighten_activity_feed_rls.sql`
  - Run STAGING first, verify with role-scoped JWTs, then apply to PROD.
  - Rollback: commented block at bottom of the SQL file restores temporary authenticated-only policy.

Verification notes
- Typed routes: smoke GET/POST on the endpoints with both flag states.
- Threads: run `npm test tests/workspace/` locally; UI smoke check for discussion counts.
- RLS: verify expected allow/deny using `docs/rls-test-checklist.md` probes.


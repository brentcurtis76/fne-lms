# Schema Health — Needs vs. Backlog (2025-09-05)

## What Still Needs To Be Done (Stability/Security)
- None. Current PROD posture meets the platform stability and security needs defined in the tracker.
  - Anonymous access blocked on sensitive tables (`user_roles`, `courses`, `activity_feed`, `clientes`, `contratos`, `cuotas`).
  - RLS enabled and forced where required; service-role bypass retained.
  - Backward-compatibility view for threads present to avoid runtime breakage.

## Monitors (Lightweight)
- Guest-grants / anon exposure quick check (weekly): scripts/security/run-security-check.js
- Spot REST checks for anon on a few hot tables after deploys (user_roles, courses, activity_feed).

## Backlog (Do Later — Nice to Have)
- Activity feed membership: When `community_members` exists in PROD, extend `workspace_members_can_read_activity` with the membership predicate; re‑verify.
- Typed routes adoption (gradual): Keep flag off in PROD; adopt `types/database.generated.ts` on 2 more read paths and canary.
- Type‑drift CI (optional): Keep manual-only or gated on `database/**` changes. Re‑enable later when convenient.
- RLS matrix automation: Add a small script to exercise allow/deny for core roles and archive logs per deploy.
- SECURITY DEFINER audit: Ensure all such functions pin `search_path`; minimize surface.
- Index sanity (low risk window): Confirm indexes on RLS filter columns and common FKs; use concurrent builds.
- Secrets rotation window: Rotate JWT secret (regenerates anon/service keys) and update envs; verify with quick REST count.
- Threads view cleanup: Remove `community_threads` view once all references are confirmed gone.
- Backups: Run a restore smoke test from the latest backup and capture notes.

## Notes
- All above items are improvements, not required for stability tonight. Prioritize with product/ops as time allows.

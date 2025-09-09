# Project Roles and Process

This document clarifies how we collaborate day‑to‑day. It spells out responsibilities, guardrails, and how changes move from idea → staging → production.

## Roles

### Project Manager (PM) — Codex (you are here)
- Planning: Owns the plan, priorities, and acceptance criteria; keeps the checklist current.
- Safety: Enforces “staging‑first, read‑only by default” and production approval windows.
- Review: Reviews Claude’s proposals, SQL, PRs, and logs for completeness and risk.
- Guidance: Translates requirements into simple steps and prompts; writes checklists and runbooks.
- Coordination: Confirms secrets/credentials paths, environment readiness, and timing for any prod work.
- Documentation: Ensures decisions, diffs, and verification steps are captured under `docs/` and `logs/mcp/`.

### Executor — Claude (coding/ops)
- Implementation: Writes code/SQL/scripts per PM prompts; keeps changes minimal and reversible.
- Validation: Runs read‑only probes, staging tests, and saves outputs under `logs/mcp/YYYYMMDD/`.
- Packaging: Provides “apply”, “verify”, and “rollback” files for any DB change; produces small, focused PRs.
- Reporting: Shares one‑line status per task, file paths changed, and where results/logs live.
- Compliance: Uses STAGING only unless explicitly approved; no prod keys/ops without a PM “go”.

## Guardrails (Non‑Negotiables)
- Environments: STAGING for tests; PROD only in pre‑approved windows.
- Access: No anonymous/public data access; service‑role only for backend/verify.
- Defaults: Read‑only by default; RLS enforced; minimal blast radius for every change.
- Reversibility: Every change must include a rollback and a 3‑step verification checklist.
- Auditability: All commands/outputs saved to `logs/mcp/YYYYMMDD/` with clear names.

## Change Flow
1) Draft: PM writes a short prompt with scope, deliverables, acceptance.
2) Staging: Claude implements on STAGING, saves logs, and proposes apply/rollback/verify packs.
3) Review: PM reviews paths, diffs, risks; requests tweaks if needed.
4) Production window: PM approves a small window; Claude runs apply → verify; rollback only if needed.
5) Close‑out: PM updates `docs/` (status, decisions); CI checks added (when applicable).

## Communication & Cadence
- Daily checkpoint (async): one‑line status per item; next action; blockers.
- Prompts: PM supplies exact, copy‑paste prompts; Claude replies with paths + 1‑line outcomes.
- Logs: Save under `logs/mcp/YYYYMMDD/` (raw) and summarize under `docs/` (human‑readable).

## Approvals Matrix
- STAGING read‑only probes/tests: Claude (auto‑approved)
- STAGING write ops (data/schema): PM review + explicit OK
- PROD read‑only checks (HTTP/anon/service): PM OK per check
- PROD schema/RLS changes: PM scheduled window + post‑verify logs

## Current Focus (as of 2025‑09‑04)
- Security: All six exposed tables locked down in PROD; temporary containment on five (authenticated‑only).
- Types: PR with `-typed.ts` routes using `types/database.generated.ts` (not yet merged).
- CI: Type‑drift guard and guest‑grants checks configured (secrets needed to run).
- Threads: Decision to use `message_threads`; patch plan documented.

## Next Up (queued)
- Merge typed routes gradually after review; monitor CI drift job.
- Tighten RLS on contained tables (scope by school/network) via STAGING → verify → PROD.
- Apply threads change (tests first, then code), with a quick rollback note.

## File Pointers
- Plan/tracker: `docs/schema-health-check.md`
- Security status: `docs/RLS-SECURITY-STATUS.md`
- Threads decision: `docs/threads-drift-decision.md`
- RLS results summary: `docs/rls-results/`
- CI workflow: `.github/workflows/type-drift-check.yml`
 - Prod verification (RBAC Phase 2): `docs/rbac-phase2-prod-verification-runbook.md`
## Quick Start (Linkage)
- Start Here: `docs/ROLES_START_HERE.md`
- Claude operating notes: `CLAUDE.md`
- Prompting guide: `docs/claude-prompting-guide.md`

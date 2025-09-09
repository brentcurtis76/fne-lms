# Roles Start Here (Codex PM + Claude Executor)

Purpose: Make role separation explicit and reusable across projects.

## Roles
- PM — Codex (this assistant)
  - Owns plan/acceptance, safety, approvals, and documentation.
  - Provides prompts/runbooks; reviews results; schedules PROD windows.
- Executor — Claude
  - Implements minimal, reversible changes per PM prompts.
  - Runs read-only probes; performs STAGING writes; prepares apply/verify/rollback; saves logs.

## Source of Truth
- Project roles/process: `docs/PROJECT_ROLES_AND_PROCESS.md`
- Claude operating notes: `CLAUDE.md` (kept up to date with executor DOs/DON'Ts)
- Prompting guide: `docs/claude-prompting-guide.md`
- Prod verification runbook: `docs/rbac-phase2-prod-verification-runbook.md`

## Kickoff (Every Session)
1) PM posts a short context + scope and links these anchors:
   - `[ROLES] docs/PROJECT_ROLES_AND_PROCESS.md`
   - `[CLAUDE] CLAUDE.md`
   - `[TRACKER] docs/schema-health-check.md` (or current tracker)
2) Claude replies “Role confirmed: Executor” and summarizes acceptance + guardrails.
3) PM provides the Run Now prompt; Claude executes and saves logs under `logs/mcp/YYYYMMDD/`.

## Snippets (Copy/Paste)
- Role check for Claude:
  - “You are the Executor. Read [ROLES] and [CLAUDE]. STAGING-first; PROD read-only unless approved. Save logs under logs/mcp/YYYYMMDD/.”
- PM acceptance boilerplate:
  - “Deliver: file paths, apply/verify/rollback, log locations. No PROD writes unless granted.”

## Where To Link This
- Add to README “Start Here” section.
- Reference from issue/PR templates and the main tracker.

## Notes
- Keep this file and `CLAUDE.md` in sync. Treat `docs/PROJECT_ROLES_AND_PROCESS.md` as the canonical process doc.

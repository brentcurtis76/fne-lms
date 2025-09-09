# Claude Executor Prompting Guide (Token‑Efficient)

Purpose: Provide consistent, low‑token prompts that still yield high‑quality, reversible work from the Executor (Claude), aligned with our tracker and guardrails.

## Principles
- Single source of truth: Reference files by path, not by pasting contents. Claude can read files locally.
- Context anchors: Point to the same small set of canonical docs every session; avoid repeating their text.
- Deltas only: For ongoing work, send what changed, what to do next, and acceptance criteria.
- Role check: Always have Claude confirm “Executor” role and guardrails before acting.
- Staging‑first: Explicitly state STAGING vs PROD posture for every task.
- Reversibility + logs: Require apply/verify/rollback and log paths for each change.

## Canonical Context Anchors
- Tracker: `docs/schema-health-check.md`
- Roles & Process: `docs/PROJECT_ROLES_AND_PROCESS.md`
- Security Status: `docs/RLS-SECURITY-STATUS.md`
- Threads Decision: `docs/threads-drift-decision.md`

Tip: Use these short handles once per session: [TRACKER], [ROLES], [SECURITY], [THREADS].

## Prompt Templates

### 1) Session Kickoff (Day/Task Start)
"""
Context
- [TRACKER], [ROLES], [SECURITY], [THREADS]

Role Check
- You are the Executor (Claude). STAGING‑first, PROD read‑only. Apply/verify/rollback + logs under `logs/mcp/<YYYYMMDD>/`.

Scope
- Goal: <one sentence>
- Deliverables: <bulleted list of file paths/outputs>
- Acceptance: <bulleted pass criteria>

Constraints
- No PROD writes; minimal diffs; reversible with rollback notes.

Outputs
- Paths changed + 1‑line rationale
- Apply/verify/rollback steps
- Log paths
"""

### 2) Run Now (Execution)
"""
Role Check: Executor. Operate on STAGING only.

Artifacts
- <paths to use>

Tasks (Run Now)
1) <Task A>
   - Apply: <command>
   - Verify: <command>
   - Logs: <path>
   - Rollback: <command>
2) <Task B> ...

Acceptance
- <bulleted checks>

Return
- One‑line status per task + log paths. Confirm no PROD changes.
"""

### 3) Reconcile Report (After Claude Reports)
"""
I will verify the reported files vs repo. If mismatches, deliver the missing files with same names or align to existing. Provide any absent scripts/migrations and save logs to the specified date paths.
Outstanding:
- <list of missing files or renames>
Actions Requested:
- <bullet per missing artifact with exact path and acceptance>
"""

### 4) Patch Task (Surgical Code/SQL Changes)
"""
Context: [TRACKER]
Task: <short description>
Files to edit: <paths>
Acceptance: <tests pass / behavior / SQL checks>
Guardrails: reversible; no unrelated changes; minimal diff.
Outputs: patch paths, apply/verify/rollback, logs.
"""

### 5) Verification & Logs (Standard)
"""
Verification
- Commands: <exact commands>
- Expected: <outcomes>
Logs
- Save raw outputs under `logs/mcp/<YYYYMMDD>/<area>/...`
Deliver back
- Link paths + 1‑line summary per artifact.
"""

## Token‑Saving Tactics
- Reference paths; avoid inlining file contents.
- Reuse short handles [TRACKER]/[ROLES]/[SECURITY]/[THREADS] instead of repeating URLs/paths every time.
- Ask Claude to read files and confirm key points rather than you quoting them.
- Send only incremental scope/acceptance deltas between runs.
- Keep acceptance criteria concise and testable to reduce rework.

## Example Minimal Prompt (Typed Routes Smoke Test)
"""
Context: [TRACKER], [ROLES]
Role: Executor; STAGING‑first; logs to `logs/mcp/20250905/`.
Artifacts: `pages/api/... (wrappers present)`, `scripts/test-typed-routes-flag.js`.
Run Now
1) Legacy: `ENABLE_TYPED_ROUTES=false npm run dev` → `node scripts/test-typed-routes-flag.js` → save to `logs/mcp/20250905/typed-routes/smoke-test.log`
2) Typed: `ENABLE_TYPED_ROUTES=true npm run dev` → run script again → append log
Acceptance: script reports handler toggle + 2xx for 3 endpoints.
Return: Status + log path. No PROD changes.
"""

## Operational Checklist (Use per Task)
- Role confirmed (Executor) and environment (STAGING vs PROD) stated
- Artifacts/paths listed
- Apply/Verify/Rollback specified
- Logs path specified
- Acceptance criteria explicit
- Minimal diffs + rollback documented


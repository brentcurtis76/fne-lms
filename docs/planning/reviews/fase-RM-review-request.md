# Review Request — Phase RM: repository instruction mirror

| | |
|---|---|
| **Branch** | `fix/rls-public` |
| **Base** | `main` @ `43999499` |
| **Commits** | 28 from base including the round-2 phase-close documentation commit; executor implementation commits `20149faa`, `a6433ad7`, plus the phase-close commit |
| **Status** | **EXECUTION COMPLETE — ready for independent review; R0 remains blocked on that verdict** |
| **Date** | 2026-08-13 |

## Objective and scope

Restore the invariant stated by `AGENTS.md`: it mirrors canonical `CLAUDE.md`, and a reader of
either file receives the same governing rules.

In scope: reconcile `AGENTS.md` toward `CLAUDE.md`; route content unique to `AGENTS.md` through
owner gate Q6; apply Brent's ruling; create this canonical review request, the RLS ledger entry,
and the worktree-environment evidence record; update `PROJECT_STATE.md` at execution end.

Out of scope: changing any rule's substance; application, database, migration, test, RLS,
function, or allowlist work; deployment; any production-database access.

## Section correspondence (ARM-1)

| `CLAUDE.md` section | `AGENTS.md` section | Shape and disposition |
|---|---|---|
| Preamble | Preamble + Project Context / Architecture | Reworded-same-meaning agent preamble; project facts are carried in Architecture. Q6 promoted the precedence/remediation rule into canonical `CLAUDE.md`; file-perspective wording remains presentation only. |
| Who Are You? | Who Are You? | Missing-from-AGENTS: added from canonical text. |
| Bridge Workflow | Bridge Workflow | Missing-from-AGENTS: added from canonical text. |
| Commands | Commands | Reworded-same-meaning toward canonical command descriptions. |
| CI — Four Gates | CI — Four Gates | Reworded-same-meaning toward canonical gate names and force. |
| Executor Rules | Executor Rules | Conflict-resolved-toward-CLAUDE: canonical numbering, bridge-report step, and gate wording now match. |
| Hard Rules / NO DEPLOYMENTS | Hard Rules / NO DEPLOYMENTS | Reworded-same-meaning with identical canonical force, including RED-tier and no Vercel CI trigger. |
| Hard Rules / Database Safety | Hard Rules / Database Safety | Reworded-same-meaning with all five canonical rules present. |
| Hard Rules / Privacy — Ley 21.719 | Hard Rules / Privacy — Ley 21.719 | Reworded-same-meaning with all four canonical rules present. |
| Hard Rules / Memory Discipline | Hard Rules / Memory Discipline | Missing-from-AGENTS: added verbatim. |
| Project Context / Architecture | Project Context / Architecture | Missing-from-AGENTS as a section: added from canonical text. Q6 promoted per-role middleware testing into canonical `CLAUDE.md`; the two Architecture rules now match. |
| API Route Pattern | API Route Pattern | Reworded-same-meaning to canonical heading and example. |
| Page Pattern | Page Pattern | Reworded-same-meaning to canonical heading and example. |
| RBAC Roles | RBAC Roles | Reworded-same-meaning to canonical role descriptions and future-type wording. |
| Testing Conventions | Testing Conventions | Reworded-same-meaning to canonical four-item form. |

After Q6, both files have 112 lines. A section-header comparison finds only the agent-specific
title. The remaining preamble text differences express file perspective and locate the shared
project summary differently; they do not change any governing rule.

## Edit classification (ARM-4)

Every edit fits one of the contract's three permitted classes:

| Classification | Edits |
|---|---|
| **added** | Who Are You?, Bridge Workflow, Memory Discipline, Project Context/Architecture, canonical hard-rule subsections, and canonical explanatory details that were absent from `AGENTS.md`. |
| **reworded-same-meaning** | Commands, CI description, hard-rule prose, patterns/headings, RBAC descriptions, Testing Conventions, and relocation of the Auth Middleware Warning into Architecture without deleting its unique per-role requirement. |
| **conflict-resolved-toward-CLAUDE** | Executor Rules now use canonical ordering and include the bridge-report rule; compact `AGENTS.md` wording was replaced wherever canonical wording carried stronger or more precise force. |

No rule was rewritten as a new fourth category, softened, or tightened by executor judgment.

## Q6 — both candidates promoted (ARM-5)

Verification narrowed the prompt's section-level example to two actual governing-rule deltas:

1. `AGENTS.md:3` said that if the files diverge, `CLAUDE.md` wins and the divergence must be fixed
   in the same PR. `CLAUDE.md:4` previously said only that `AGENTS.md` mirrors it.
2. The former Auth Middleware Warning is mostly canonical already: both files call middleware/RBAC
   the most bug-prone area and require extra scrutiny plus session-invalidation checks. Only
   **per-role testing on any middleware/RBAC change** existed uniquely in `AGENTS.md`.

Brent promoted both. `CLAUDE.md:4` now carries the precedence and same-PR remediation rule, and
`CLAUDE.md:75` now requires per-role testing. `AGENTS.md` carries the same rules from its own file
perspective. Nothing was retired, so `RM-retired-guidance.md` does not exist.

## Files created or modified, grouped by risk

### High — repository-wide governing instructions

- `AGENTS.md` — common reconciliation, including both rules later promoted by Q6.
- `CLAUDE.md` — the two Brent-approved Q6 promotions only.

### Medium — phase handoff and audit trail

- `docs/planning/reviews/fase-RM-review-request.md` — canonical phase-close handoff.
- `docs/plan/rls/LEDGER.md` — round-1, PM-verification, and round-2 records.
- `PROJECT_STATE.md` — execution end and independent-review queue.
- `docs/plan/rls/evidence/RM-worktree-env-gap.md` — required red-gate/setup evidence.

### Deliberately not created

- `docs/plan/rls/evidence/RM-retired-guidance.md` — both candidates were promoted; nothing was retired.

## Test evidence (ARM-9)

Exact command:

```bash
npm run type-check && npm run lint && npm test && npm run build
```

| Gate | Evidence |
|---|---|
| TypeScript | Passed, `tsc --noEmit`. |
| ESLint | Passed with `--max-warnings=0`. |
| Vitest | **305 files passed; 7,059 tests passed; 11 skipped (7,070 total)** in 38.73s; environment 244ms. This proves the mandated command ran; it does not prove suite-discovery completeness. |
| Next.js build | **Passed** with the existing main-checkout `.env.local` linked into this worktree; 156/156 static pages and the full route table emitted; middleware 73.4 kB. The prior red result was a worktree setup gap, not a base/code failure. |

The 305-file Vitest result also resolves the documented jsdom hazard for this run: the known
silent-drop baseline was 254 files plus 51 jsdom files, and 254 + 51 = 305; non-zero environment
time was reported. The count is evidence for this specific discovery check, not a permanent
guarantee for future runs.

Verbatim terminal summary from the round-2 chain:

```text
 Test Files  305 passed (305)
      Tests  7059 passed | 11 skipped (7070)
   Start at  11:46:37
   Duration  38.73s (transform 2.08s, setup 3.09s, collect 8.35s, tests 22.90s, environment 244ms, prepare 109ms)

 ✓ Compiled successfully
 ✓ Collecting page data
 ✓ Generating static pages (156/156)
 ✓ Collecting build traces
 ✓ Finalizing page optimization

ƒ Middleware                                                                                          73.4 kB
```

`npm ci` succeeded before round 1. `test:db` and e2e were not run: RM edits documentation,
starts no database, runs no query, and renders no UI, so the conditional DB/UI rule is not met.

## Areas for independent review

1. **Q6 implementation** — confirm that the precedence/remediation sentence and per-role
   middleware testing are now canonical without changing either rule's substance.
2. **Hard-rule force** — compare NO DEPLOYMENTS, Database Safety, Privacy, and Memory Discipline
   line by line; this workstream has repeatedly narrowed rules through reasonable-sounding prose.
3. **Executor sequence** — verify the exact conditional phrase `+ test:db/e2e when DB/UI touched`
   and the canonical bridge/report ordering survived unchanged.
4. **Agent-specific preamble** — confirm that differing titles/preamble labels are presentation
   and both files now state the same precedence/remediation rule.
5. **Environment-gap correction** — scrutinize why the round-1 merge-base control was
   non-discriminating and whether the new evidence prevents recurrence without exposing secrets.

## Known limitations and deferred items

- The ignored `.env.local` symlink is local worktree setup and is intentionally not committed.
- Independent review has not yet occurred; execution is complete, but R0 stays blocked until the
  reviewer returns no blocking finding.
- RM changes instructions and documentation only; it includes no application, database,
  migration, test-source, deployment, or production-database change.

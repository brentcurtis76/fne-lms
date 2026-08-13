# Review Request — Phase RM: repository instruction mirror

| | |
|---|---|
| **Branch** | `fix/rls-public` |
| **Base** | `main` @ `43999499` |
| **Commits** | 24 from base after the blocked-checkpoint documentation commit; implementation commit `20149faa` |
| **Status** | **BLOCKED on owner gate Q6** — this is a reviewable checkpoint, not a phase-close claim |
| **Date** | 2026-08-13 |

## Objective and scope

Restore the invariant stated by `AGENTS.md`: it mirrors canonical `CLAUDE.md`, and a reader of
either file receives the same governing rules.

In scope: reconcile `AGENTS.md` toward `CLAUDE.md`; route content unique to `AGENTS.md` through
owner gate Q6; create this canonical review request and the RLS ledger entry; update
`PROJECT_STATE.md` only when the phase actually ends.

Out of scope: changing any rule's substance; application, database, migration, test, RLS,
function, or allowlist work; deployment; any production-database access.

## Section correspondence (ARM-1)

| `CLAUDE.md` section | `AGENTS.md` section | Shape and disposition |
|---|---|---|
| Preamble | Preamble + Project Context / Architecture | Reworded-same-meaning agent preamble; the project facts are carried in Architecture. Two rules unique to the `AGENTS.md` form remain Q6 candidates below. |
| Who Are You? | Who Are You? | Missing-from-AGENTS: added from canonical text. |
| Bridge Workflow | Bridge Workflow | Missing-from-AGENTS: added from canonical text. |
| Commands | Commands | Reworded-same-meaning toward canonical command descriptions. |
| CI — Four Gates | CI — Four Gates | Reworded-same-meaning toward canonical gate names and force. |
| Executor Rules | Executor Rules | Conflict-resolved-toward-CLAUDE: canonical numbering, bridge-report step, and gate wording now match. |
| Hard Rules / NO DEPLOYMENTS | Hard Rules / NO DEPLOYMENTS | Reworded-same-meaning with identical canonical force, including RED-tier and no Vercel CI trigger. |
| Hard Rules / Database Safety | Hard Rules / Database Safety | Reworded-same-meaning with all five canonical rules present. |
| Hard Rules / Privacy — Ley 21.719 | Hard Rules / Privacy — Ley 21.719 | Reworded-same-meaning with all four canonical rules present. |
| Hard Rules / Memory Discipline | Hard Rules / Memory Discipline | Missing-from-AGENTS: added verbatim. |
| Project Context / Architecture | Project Context / Architecture | Missing-from-AGENTS as a section: added from canonical text. The unique per-role middleware rule is preserved pending Q6. |
| API Route Pattern | API Route Pattern | Reworded-same-meaning to canonical heading and example. |
| Page Pattern | Page Pattern | Reworded-same-meaning to canonical heading and example. |
| RBAC Roles | RBAC Roles | Reworded-same-meaning to canonical role descriptions and future-type wording. |
| Testing Conventions | Testing Conventions | Reworded-same-meaning to canonical four-item form. |

After the common reconciliation, both files have 112 lines. A line comparison finds only the
agent-specific title/preamble and the two Q6 candidates below; the remainder is identical.

## Edit classification (ARM-4)

Every edit fits one of the contract's three permitted classes:

| Classification | Edits |
|---|---|
| **added** | Who Are You?, Bridge Workflow, Memory Discipline, Project Context/Architecture, canonical hard-rule subsections, and canonical explanatory details that were absent from `AGENTS.md`. |
| **reworded-same-meaning** | Commands, CI description, hard-rule prose, patterns/headings, RBAC descriptions, Testing Conventions, and relocation of the Auth Middleware Warning into Architecture without deleting its unique per-role requirement. |
| **conflict-resolved-toward-CLAUDE** | Executor Rules now use canonical ordering and include the bridge-report rule; compact `AGENTS.md` wording was replaced wherever canonical wording carried stronger or more precise force. |

No rule was rewritten as a new fourth category, softened, or tightened by executor judgment.

## Q6 — content unique to `AGENTS.md` (ARM-5)

Verification narrowed the prompt's section-level example to two actual governing-rule deltas:

1. `AGENTS.md:3` says that if the files diverge, `CLAUDE.md` wins and the divergence must be fixed
   in the same PR. `CLAUDE.md:4` says only that `AGENTS.md` mirrors it; it does not carry the
   precedence/remediation rule.
2. The former Auth Middleware Warning is mostly canonical already: both files call middleware/RBAC
   the most bug-prone area and require extra scrutiny plus session-invalidation checks. Only
   **per-role testing on any middleware/RBAC change** exists uniquely in `AGENTS.md`; it is now
   preserved in the corresponding Architecture bullet.

Both contract branches are prepared, but neither has been selected:

- **APPROVE**: add both rules to `CLAUDE.md` as canonical and keep them mirrored in `AGENTS.md`.
- **REJECT**: remove both from `AGENTS.md` as governing guidance and create
  `docs/plan/rls/evidence/RM-retired-guidance.md` recording their text, rejection reason, and date.

Brent must select one branch (or rule separately on the two candidates). Until then, the mirror
invariant remains deliberately unresolved and RM cannot close.

## Files created or modified, grouped by risk

### High — repository-wide governing instructions

- `AGENTS.md` — common reconciliation; Q6-only content preserved.

### Medium — phase handoff and audit trail

- `docs/planning/reviews/fase-RM-review-request.md` — this blocked-checkpoint review request.
- `docs/plan/rls/LEDGER.md` — round-1 execution record and D-9 disposition.

### Not modified because RM is not closed

- `CLAUDE.md` — awaits Q6 approval branch only.
- `PROJECT_STATE.md` — phase-end update awaits actual phase end.
- `docs/plan/rls/evidence/RM-retired-guidance.md` — rejection branch only.

## Test evidence (ARM-9)

Exact command:

```bash
npm run type-check && npm run lint && npm test && npm run build
```

| Gate | Evidence |
|---|---|
| TypeScript | Passed, `tsc --noEmit`. |
| ESLint | Passed with `--max-warnings=0`. |
| Vitest | **305 files passed; 7,059 tests passed; 11 skipped (7,070 total)**. This proves the mandated command ran; it does not prove suite-discovery completeness. |
| Next.js build | Compilation passed, then page generation failed because `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent. The same command at merge base `43999499`, in a clean detached worktree after `npm ci`, failed identically. Verified base/environment failure; no credentials or configuration were invented. |

`npm ci` succeeded before the gates. `test:db` and e2e were not run: RM edits documentation,
starts no database, runs no query, and renders no UI, so the conditional DB/UI rule is not met.

## Areas for independent review

1. **Q6 inventory boundary** — confirm that the precedence/remediation sentence and per-role
   middleware testing are the only substantive rules still unique to `AGENTS.md`.
2. **Hard-rule force** — compare NO DEPLOYMENTS, Database Safety, Privacy, and Memory Discipline
   line by line; this workstream has repeatedly narrowed rules through reasonable-sounding prose.
3. **Executor sequence** — verify the exact conditional phrase `+ test:db/e2e when DB/UI touched`
   and the canonical bridge/report ordering survived unchanged.
4. **Agent-specific preamble** — confirm that differing titles/preamble labels are presentation,
   while their governing-rule differences are fully captured by Q6.
5. **Base build classification** — confirm the branch and merge-base failures share the same
   missing-variable cause and that RM did not touch runtime files.

## Known limitations and deferred items

- Q6 is unanswered, so ARM-1/ARM-5 and the mirror invariant are only partially satisfied.
- `PROJECT_STATE.md` is intentionally not updated: the phase-end condition has not occurred.
- The build gate is red from a reproduced base/environment failure. Resolving repository build
  configuration or supplying environment credentials is outside RM's documentation-only scope.
- Independent review has not yet occurred; this checkpoint does not claim phase completion.

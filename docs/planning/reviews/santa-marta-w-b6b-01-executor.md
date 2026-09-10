# W-B6b-01 r1 — executor report

**Status: READY_FOR_REVIEW** (implementation + executor validation only; not review approval, UI verification, release or Directora acceptance).

## Actor and configuration

- Actor: Claude Code, sole product executor. Model self-identified `claude-opus-5`; effort medium as ordered (runtime effort setting not independently observable by executor). Fallback NONE.
- Skill: bounded-executor 1.1.0 delivered as an explicit packet; native skill loading not claimed. No subagents, tasks, Bridge or MCP used.
- Session window: 2026-09-10 07:49–08:12 -03. Context occupancy UNKNOWN; no compaction observed.
- Authority: W-B6b-01 r1 under SM-AUTONOMY-2026-09-10 (REPORTED by order). External actions: NONE. No commit/push/PR/merge.

## State identity

- Root `/Users/brentcurtis/dev/wt/sm-nav-dir`, branch `fix/nav-dir`, HEAD = base `10983e7fe1a6f579cef6ba9a1407847543fad6ec` (unchanged, uncommitted working-tree delivery).
- Before: status clean. After (`git status --porcelain`):
  - ` M components/layout/Sidebar.tsx` — sha256 `5793e9510cd6da533fe9cabb133b69ad4a5905e4bc4c1ac0f98ccdc8abe6f2e4`; `git diff` sha256 `1dbd7d1ddd8f6d4031156e60b88e858d631aee88e73a7fbbbf70175fc7aff258` (+9/−7)
  - `?? __tests__/components/layout/Sidebar.schoolResults.test.tsx` — sha256 `05e7dd31284484ae8c08454b785b80d28cfdf0d3721c1be68288d73c6016c812`
  - `?? docs/planning/reviews/santa-marta-w-b6b-01-checkpoint.md` and this report.
- Git-ignored `.env.local` (mode 600, 878 B, mtime 07:48:42, identical to the PM runtime JSON mtime) existed at intake; not created, read or modified by executor.

## Change

The single «Panel de Resultados» child (`id: vias-resultados-escuela`, href `/directivo/assessments/dashboard`, label/description/icon unchanged) was moved from the `adminOnly` «Vías de Transformación» group into «Reportes», gated `restrictedRoles: ['admin', 'equipo_directivo']` (same model as sibling «Reporte de Horas»). No helper, page, API, auth or schema edits. Refactoring NONE.

Rationale: `lib/sidebar/childVisibility.ts` has no gate that excludes admins, so adding a second directivo-only definition would duplicate the link for admin+directivo users. One definition makes exactly-once hold by construction without opening the Vías group.

**Deviation for PM decision:** admin now reaches «Panel de Resultados» under «Reportes» instead of «Vías de Transformación». Admin access stays usable; the other three Vías children and their gates are unchanged.

## Criteria map

| ID | Evidence (executor) | Status |
|---|---|---|
| N1 | New test: directivo sees exactly 1 link with href `/directivo/assessments/dashboard` inside the Reportes group, desktop and mobile Sidebar modes; link is focusable. | Met in DOM tests; real viewport/click UI → PM |
| N2 | Link is a standard `next/link` anchor to the existing route; destination page/API auth untouched; destination API test `__tests__/api/assessment-builder/dashboard.test.ts` passes (4). Actual click/keyboard navigation in a browser NOT performed by executor. | Implementation met; journey → PM UI |
| N3 | Exactly 1 link: admin, admin+directivo, docente+directivo (secondary), directivo+consultor. 0 links: docente, consultor, lider_comunidad, lider_generacion, supervisor_de_red, community_manager, encargado_licitacion, no roles. Directivo: no Vías button, no `/vias-transformacion` or `/admin/transformation/assessments` anchors. Admin keeps the three remaining Vías children. | Met |
| N4 | Directivo with all groups expanded: exactly 1 «Contexto Transversal» link. | Met |
| N5 | Existing Sidebar suites and the full gates pass on final state (below); diff limited to allowlist. | Met (see flake note) |

Negative control: the new test file includes a control that restores the pre-change placement in the real `NAVIGATION_ITEMS` and asserts directivo gets 0 links. Separately, the new test was run against the unmodified HEAD Sidebar before the edit: 5 failed / 12 passed (directivo, mixed-directivo and control cases red; admin/unrelated-role cases green).

## Validation (final product state unless noted; logs in `/tmp/sm-b6b-validation/`)

| Command | Exit | Result | Log |
|---|---|---|---|
| `npx vitest run __tests__/components/layout/ __tests__/api/assessment-builder/dashboard.test.ts` (baseline, before change) | 0 | 4 files, 62 tests | baseline-sidebar-dest.log |
| `npx vitest run __tests__/components/layout/Sidebar.schoolResults.test.tsx` (HEAD Sidebar, red run) | 1 | 5 failed, 12 passed | red-before-change.log |
| `npx vitest run __tests__/components/layout/ __tests__/api/assessment-builder/dashboard.test.ts` | 0 | 5 files, 79 tests passed | focused-after.log |
| `npm run type-check` | 0 | clean | type-check.log |
| `npm run lint` (max-warnings 0) | 0 | clean | lint.log |
| `npm test` run 1 (07:54) | 1 | 430/431 files; 1 failed, 9897 passed, 12 skipped | unit-full.log |
| `npx vitest run __tests__/lib/auth/recovery-crypto.test.ts` ×15 | 0 ×15 | 15/15 pass | recovery-crypto-reruns.log |
| `npm test` run 2 (08:01) | 0 | 431 files; 9898 passed, 12 skipped | unit-full-rerun.log |
| `npm run build` with the 14 keys of `local-runtime-env.json` injected as process env | 0 | compiled successfully | build.log |

Flake note: run 1 failed `recovery envelope cryptography > rejects tampering without exposing plaintext`. That test overwrites the last two characters of a randomly generated envelope with `aa`, which can leave the envelope unchanged or touch only non-significant bits. The test is unrelated to this diff (no Sidebar imports), passed 15/15 in isolation and passed in full run 2 on identical hashes. This is REPORTED as a nondeterministic pre-existing test, not relabeled PASS; route it to a future unit.

Build environment note: Next reported `Environments: .env.local`. Injected process env overrides the 14 known keys; any other keys in `.env.local` are UNKNOWN because its contents were not read. No hosted/provider calls were intentionally made. `e2e`/`test:db` were not run (no DB change; e2e/UI assigned to PM).

## UI attribution

No browser, Computer Use or Playwright journeys were performed by the executor. The app was not started; no listener on 3127 (checked); PID NONE. All N1/N2 viewport, click and keyboard journeys (desktop 1366×768, mobile 390×844, directivo own-school and denied roles) remain UI_NOT_RUN by executor and are assigned to PM.

## Hygiene and artifacts

- No debug/provisional code; one explanatory comment added at the moved child.
- Temporary artifacts: logs in `/tmp/sm-b6b-validation/` RETAINED as evidence. `.next/` build output RETAINED (generated, git-ignored). No scratch files created in the worktree.

## Routed findings (not acted on; outside allowlist)

1. Stale docs: `docs/QA_SCENARIOS_ADMIN.md`, `docs/QA_TEST_RESULTS_ADMIN.md`, `docs/QA_MAPPING_ANALYSIS_ADMIN_2026-02-08.md`, `docs/ADMIN_SCENARIO_AUDIT_2026-02-08.md` (SV-42 under Vías), the equipo_directivo QA docs (SV-21/SV-26 "no sidebar link"), and the navigation description string in `pages/api/qa/seed-codebase-index.ts` now describe the old placement.
2. Pre-existing: `MainLayout.tsx` `effectiveIsAdmin` collects `auth.userRoles` without the `is_active` filter used for `userRoles`, so an inactive admin role row could set `isAdmin`. This unit does not make that worse (the new gate uses the filtered `userRoles` or `isAdmin`, and Vías already depended on `isAdmin`), but it matters for the "inactive roles must not gain visibility" intent.
3. Pre-existing: the destination page and API also admit `consultor`, who still has no sidebar link (unchanged by this order).
4. Flaky `__tests__/lib/auth/recovery-crypto.test.ts` tamper test (above).

## Counters and next action

Initial implementation 1, remediation 0 / cap 2. Product writes stopped at this report. Next: PM independent review of the frozen state (hashes above), a decision on the admin-placement deviation, and PM UI verification.

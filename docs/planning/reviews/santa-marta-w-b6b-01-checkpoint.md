# W-B6b-01 r1 — executor checkpoint

Actor: Claude Code (claude-opus-5, effort medium as ordered; runtime self-reported model ID claude-opus-5). Skill delivered as explicit packet; native skill loading not claimed. Context occupancy UNKNOWN; no compaction observed.

## CP1 — after discovery (2026-09-10 ~07:55 -03)

State lock OBSERVED: root `/Users/brentcurtis/dev/wt/sm-nav-dir`, branch `fix/nav-dir`, HEAD `10983e7fe1a6f579cef6ba9a1407847543fad6ec`, status clean. `npm ci` completed (log `/tmp/sm-b6b-validation/npm-ci.log`: 1348 packages). No other writer observed.

Findings:
- `vias-transformacion` parent is `adminOnly: true`; its child `vias-resultados-escuela` («Panel de Resultados», `/directivo/assessments/dashboard`) has no gate, so only `isAdmin` users see it. Siblings: «Mis Evaluaciones» (ungated), «Contexto Transversal» (ungated, duplicate of Procesos de Cambio child `transversal-context-admin` which already admits equipo_directivo), «Todas las Evaluaciones» (adminOnly).
- `reportes` group has no parent gate; children use `restrictedRoles` (`reporte-horas`: `['admin','equipo_directivo']`).
- Child gating helper `lib/sidebar/childVisibility.ts` has no "exclude admin" gate; a second definition gated `['equipo_directivo']` would duplicate the link for admin+directivo users.
- Destination page allows `equipo_directivo|admin|consultor` client-side; API `school-results` returns 403 unless admin/consultor/directivo. Unchanged by this unit.

Plan: move the single «Panel de Resultados» child definition from `vias-transformacion` into `reportes`, gated `restrictedRoles: ['admin','equipo_directivo']` (the Reportes child model). Exactly-once holds by construction. Deviation to disclose: admin now finds the link under Reportes instead of Vías de Transformación. Legacy QA docs describing SV-42 under Vías become stale (outside allowlist; routed to PM).

Next: write test first, record red run against HEAD Sidebar, then apply the Sidebar change.

## CP2 — after coherent edit and validation (2026-09-10 ~08:10 -03)

- New test written first; red run on unmodified Sidebar: 5 failed / 12 passed (`/tmp/sm-b6b-validation/red-before-change.log`).
- Sidebar edit applied (single child moved into `reportes`, `restrictedRoles: ['admin','equipo_directivo']`). Product writes then stopped.
- Focused (layout suites + destination API test): 5 files / 79 tests pass. type-check exit 0; lint exit 0; build exit 0 with synthetic runtime env passed explicitly.
- Full unit run 1: exit 1, one failure in `__tests__/lib/auth/recovery-crypto.test.ts` (tamper test); 15/15 isolated reruns pass on the same state. Full rerun in progress.
- No app server started; no listener on 3127.

## CP3 — delivery (2026-09-10 ~08:12 -03)

- Full unit run 2 on identical hashes: exit 0, 431 files, 9898 passed, 12 skipped.
- Status READY_FOR_REVIEW; see `santa-marta-w-b6b-01-executor.md`. Product writes stopped.

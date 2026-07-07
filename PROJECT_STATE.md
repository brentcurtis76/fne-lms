# PROJECT_STATE.md

> Documento vivo de estado (estructura según §2.2 del itinerario de construcción).
> Convenciones durables: CLAUDE.md / AGENTS.md. Cada fase termina actualizando este archivo.

## Meta
- Last phase completed: — ninguna (pre-Fase 0; este documento establece el baseline)
- Date: 2026-07-07
- Model used: Claude (Cowork) — diagnóstico y baseline, sin cambios de código
- Commit SHA: `0650746` en `main` ("observability(bots): structured, privacy-safe save-failure logging")
- Working tree: 3 archivos modificados sin commit (`lib/businessDays.ts`, `lib/__tests__/businessDays.test.ts`, `lib/licitacionService.ts`)

## Architecture invariants (never violate)
- RLS habilitado en toda tabla del schema `public`; `school_id` en cada fila (multi-tenant por colegio)
- El asesor nunca lee contenido crudo de sesiones ajenas; leadership/FNE ve solo métricas macro
- El sociograma jamás se expone a roles estudiante/familia (bloqueo estructural, no solo norma)
- Ningún dato nuevo de menores se almacena sin registro de consentimiento + referencia EIPD (Ley 21.719; gate = Fase 2)
- Next.js Pages Router + `getServerSideProps`; TypeScript strict; fetching con `fetch()` crudo (no TanStack/SWR)
- API routes: auth → role check → validation → logic
- Cambios de schema solo aditivos; nunca `DROP`/`TRUNCATE`; migraciones vía DB agent
- NO deployments por agentes (RED-tier); Vercel auto-deploya `main`
- Branches ≤20 caracteres
- Solo datos sintéticos en dev/test; PII de estudiantes nunca en prompts, commits ni logs

## Data model (current)
- Baseline legado FNE-LMS: 38 migraciones en `/supabase/migrations` (última: `20260601_create_tractor_signups`); instancia Supabase dedicada
- Dominios existentes: cursos/learning paths, assessment builder (objetivos/indicadores), sesiones de consultor, generaciones + growth communities, licitaciones Ley SEP (+feriados), hour tracking, contratos, propuestas web/PDF, sistema QA, notificaciones, roadmap, badges, bots, expense reports/fx-rates
- 9 roles existentes (`types/roles.ts`): admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, supervisor_de_red, community_manager, docente, encargado_licitacion
- Tablas GENERA (`persons`, `enrollments`, `consent_records`, planes, sociograma, señales…): **no existen aún** (Fases 1+)
- RLS: presente en áreas clave (p.ej. fix `20260208_fix_consultor_rls_gaps`) pero sin verificación homogénea; matriz pgTAP rol×tabla×operación pendiente
- `/supabase/tests` no existe; único test SQL suelto: `/database/tests/consultor_sessions_rls.test.sql` (fuera de `supabase test db`)

## Modules (current)
- `/pages` + `/pages/api` (~40 áreas): admin, consultor, docente, directivo, licitaciones, sessions, courses, reports, propuestas, qa, community, contracts…
- `/lib` (~68 dirs), `/components` (~73 dirs), `/utils`, `/hooks`, `/types` (fuente de roles), `middleware.ts` (auth/RBAC — área más propensa a bugs)
- Tests: ~180 archivos unit/integration (Vitest: `/__tests__`, `/tests`; configs `vitest.config.ts` + `vitest.config.api.ts`); ~18 specs Playwright (`/tests/e2e`, `/tests/qa`; `testDir: ./tests`)
- Bridge Cowork→Claude Code: `/.cc-bridge` + `/cc-bridge-mcp-server`
- CI: **no existe** (`.github/` ausente) — objetivo central de Fase 0

## Test status
- Sin CI; suites no ejecutadas en esta sesión (el baseline formal se medirá cuando Fase 0 cablee los gates)
- Última medición conocida (`genera-health-report.md`, 2026-04-06): unit 1518/1531 — 13 fallos en 5 archivos (assessment-builder `cobertura-gate`, `detalle` + 3 untracked WIP); `tsc` fallaba por 13 componentes WIP untracked en `lib/propuestas/components`
- ESLint: `.eslintrc.json` presente desde 2026-04-06 (M1 del health report resuelto)
- pgTAP: sin helpers de Supabase instalados; `supabase test db` no cableado
- Known-skipped/xfail: sin registro formal — se normaliza con CI en Fase 0

## Consent & compliance ledger
- El LMS actual es de formación docente (usuarios adultos): **ninguna tabla contiene datos sensibles de menores** hoy
- Regla vigente: cero datos de menores hasta que exista la arquitectura de consentimiento (Fase 2 = HARD GATE) + EIPD previa al tratamiento (Art. 15 ter)
- Umbrales Art. 16 quáter: <14 consentimiento parental para todo dato; dato sensible <16 requiere parental; 16–17 consentimiento propio explícito. GENERA maneja datos sensibles ⇒ regla práctica: parental para <16
- No existe portal estatal de consentimiento: la captura, prueba y revocabilidad del consentimiento son responsabilidad propia (auditable, sin casillas premarcadas)
- Fixtures de test: exclusivamente sintéticos/seudónimos (requisito legal, no solo higiene)

## Open decisions / debts (with owner)
- [Brent] Confirmar recorte de beta Dic-2026 a producto institucional B2B (2–3 colegios piloto); diferir B2C/Transbank, RAG y móvil a 2027
- [Brent/legal] Encargar EIPD + redacción legal del consentimiento parental — bloquean el paso Fase 2→3
- [Claude Code · Fase 0] Re-baseline de tests: resolver o `.skip()` con TODO los 13 fallos conocidos (assessment-builder) para que CI parta verde
- [Claude Code · Fase 0] CLAUDE.md actual describe 4 roles; `types/roles.ts` define 9 — corregir al reescribir CLAUDE.md/AGENTS.md
- [Claude Code · Fase 0] Decidir destino de archivos WIP untracked en `lib/propuestas/components` (si persisten)
- [Brent] 3 archivos modificados sin commit en `main` — commitear o descartar antes de mergear Fase 0

## Next phase: Fase 0 — Repo hardening, CI, and state scaffolding
- Objective: establecer el entorno de trabajo para agentes IA sobre `fne-lms-working`
- Scope (in): CLAUDE.md + AGENTS.md; CI con 4 gates (typecheck, unit, `supabase test db`, Playwright); pgTAP + Supabase test helpers; regla lint `data-testid`; hook que bloquee migraciones que deshabiliten RLS; branch protection exigiendo checks verdes
- Scope (out): cualquier feature, cualquier cambio de schema
- Files likely touched: `/.github/workflows/*`, `/CLAUDE.md`, `/AGENTS.md`, `/PROJECT_STATE.md`, `/supabase/tests/000-setup.sql`, `playwright.config.ts`
- Dependencies: ninguna · Context budget ~120K
- Model: itinerario recomienda GPT-5.5-Codex para scaffolding CI/terminal; ejecución despachada a Claude Code vía bridge (pipeline vigente)
- DoD: builds y typecheck pasan; CI corre los 4 gates en PR; una tabla deliberadamente world-readable falla el test `rls_enabled`; este documento actualizado al cierre

## Human-review queue (batched)
- EIPD (documento legal) — requerida antes de cualquier tratamiento de datos de menores (pre-Fase 2)
- Redacción es-CL del consentimiento parental (libre, específica, inequívoca, informada)
- Due diligence de copyright del corpus RAG — bloquea Fases 10–11
- Ética sociométrica: revisar toda superficie que pudiera revelar estatus de un menor (Fase 6, permanente)

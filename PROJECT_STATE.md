# PROJECT_STATE.md

> Documento vivo de estado (estructura según §2.2 del itinerario de construcción).
> Convenciones durables: CLAUDE.md / AGENTS.md. Cada fase termina actualizando este archivo.

## Meta
- Last phase completed: **Fase 0 — Repo hardening, CI, state scaffolding** + correcciones consolidadas pre-PR (bloques 1–3, 2026-07-08); verificación de checks en GitHub pendiente del primer PR — ver Next phase
- Date: 2026-07-08
- Model used: Claude (Cowork, ejecución directa autorizada por Brent tras fallo del bridge — task #1119 `failed` x3 intentos)
- Commit SHA: rama `feat/fase0-ci` — `50c56b0` → `c45302f` → `57f42cc` → `33e7336` (cierre Fase 0) → bloque 1 (lint+timeouts+baseline+idioma) → cierre bloques (este commit)
- Base: `main` @ `0650746`
- Correcciones pre-PR aplicadas: CI 6 checks + baseline pgTAP corregido (bloque 1); GENERA-01 actualizado — secuenciación beta, Art. 16 quáter + EIPD, categorías sin comparabilidad, guardrails sociograma, próximos pasos → itinerario (bloque 2); decisiones router/beta registradas (bloque 3)

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
- **Nuevo (Fase 0):** migración que deshabilite RLS = bloqueada por hook (`scripts/hooks/block-rls-disable.sh`, self-test 4/4) y por CI (`scripts/ci/check-rls-migrations.sh`)
- **Router (decisión 2026-07-08):** los módulos GENERA se construyen en **Pages Router** — consistencia con el codebase; migrar de router a mitad de proyecto es riesgo de timeline inaceptable. Los paths del itinerario que asumen App Router se traducen al despachar cada fase: `/app/api/dsr/*` → `/pages/api/dsr/*`, `/app/(circle-mode)/*` → `/pages/circle/*`, `/app/(asesor)/dashboard/*` → `/pages/asesor/dashboard*`, etc.
- **Idioma (convención Fase 0):** UI y copy de cara al usuario en es-CL; código, commits, migraciones y docs técnicos en inglés

## Data model (current)
- Sin cambios de schema en Fase 0 (scope out, cumplido). Baseline legado FNE-LMS: 38 migraciones (`/supabase/migrations`, última `20260601_create_tractor_signups`)
- Dominios existentes: cursos/learning paths, assessment builder, sesiones de consultor, generaciones + growth communities, licitaciones Ley SEP, hour tracking, contratos, propuestas web/PDF, sistema QA, notificaciones, roadmap, badges, bots, expense reports/fx-rates
- 9 roles (`types/roles.ts`): admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, supervisor_de_red, community_manager, docente, encargado_licitacion
- Tablas GENERA (`persons`, `enrollments`, `consent_records`, planes, sociograma, señales…): no existen aún (Fases 1+)
- Verificación RLS homogénea: ahora automatizada — `supabase/tests/001-rls-enabled.sql` exige `public` limpio con **allowlist vacía** (agregar excepción legacy = revisión humana + entrada aquí)

## Modules (current)
- Sin módulos nuevos de producto. Infra nueva Fase 0:
  - `/.github/workflows/ci.yml` — 6 checks: typecheck, lint (zero warnings), unit, `supabase test db`, e2e smoke + RLS migration guard; todos con `timeout-minutes: 20`
  - `/supabase/tests/` — `000-setup.sql` (pgTAP + helpers `tests.*` vendored API-compatible con basejump), `001-rls-enabled.sql` (DoD), `010-consultor-sessions-rls.sql` (migrado desde `database/tests/`)
  - `/scripts/ci/check-rls-migrations.sh`, `/scripts/hooks/block-rls-disable.sh`, `/.claude/settings.json` (PreToolUse)
  - `/tests/e2e/smoke.spec.ts` (gate e2e de Fase 0), `playwright.config.ts` (CI → servidor de producción)
  - `/.eslintrc.testid.json` + `npm run lint:testid` (advisory hasta limpiar baseline)
  - `CLAUDE.md` reescrito (9 roles reales, <200 líneas) + `AGENTS.md` espejo + `docs/ci-setup.md`
- CI commands: ver `docs/ci-setup.md`. Runners: node 22, npm ci, Supabase CLI latest (setup-cli), Playwright chromium

## Test status
- **Typecheck**: PASS local (tsc --noEmit incremental, 0 errores, sandbox 2026-07-07). Full cold-check → Gate 1 en primer PR
- **Lint (Gate 1b, zero warnings)**: no ejecutable completo en sandbox; primer veredicto real en el PR — si nace rojo, triage en el mismo PR
- **Hook anti-RLS-disable**: 4/4 self-tests (block Write, pass benigno, block Bash, guard CI limpio sobre 38 migraciones)
- **pgTAP**: suite escrita (setup 2 asserts + rls-enabled 3 asserts + consultor 8 asserts); ejecución → Gate 3 (sandbox sin Docker/psql/sudo)
- **Unit (Vitest)**: no ejecutable en sandbox (node_modules darwin-arm64 / esbuild nativo; npm ci Linux inviable — procesos background terminados por el entorno). → Gate 2 en primer PR. Riesgo conocido: 13 fallos de abril (assessment-builder `cobertura-gate`, `detalle`) podrían reaparecer; resolver fix/`.skip()`+TODO en ese PR
- **E2E**: smoke spec listo; ejecución → Gate 4 (CI construye prod + placeholders de env)
- Known-skipped/xfail: ninguno registrado aún; se formaliza con el primer PR verde

## Consent & compliance ledger
- Sin cambios: el LMS actual es de formación docente (adultos); ninguna tabla con datos sensibles de menores
- Gate vigente: cero datos de menores hasta arquitectura de consentimiento (Fase 2) + EIPD previa (Art. 15 ter)
- Umbrales Art. 16 quáter: <14 parental todo dato; sensible <16 parental; 16–17 propio explícito. GENERA = sensible ⇒ parental <16
- Sin portal estatal: captura/prueba/revocación propias, auditables, sin casillas premarcadas
- Fixtures: exclusivamente sintéticos (los helpers `tests.create_supabase_user` generan usuarios `@test.local`)

## Decisiones tomadas (log)
- **2026-07-08 · Recorte beta Dic-2026 — CONFIRMADO por Brent:** beta = solo producto institucional B2B con 2–3 colegios piloto; rol familia sin paywall; B2C/Transbank, apps móviles e ingesta masiva RAG → 2027, tras validación del piloto. Reflejado en GENERA-01 §6
- **2026-07-08 · Pages Router para módulos GENERA** (ver Architecture invariants) — paths del itinerario se traducen al despachar cada fase
- **2026-07-08 · Comparabilidad entre colegios NO es objetivo de GENERA:** métricas macro FNE (frecuencia sesiones, % completitud, salud grupal) operan sobre estructura/slugs canónicos, independientes de etiquetas locales. Conversación Arnoldo reencuadrada a consistencia pedagógica (GENERA-01 §7)

## Open decisions / debts (with owner)
- [Brent · AHORA] `git push origin feat/fase0-ci` + abrir PR (sandbox sin credenciales GitHub) → los 6 checks corren = DoD verificable. Checklist completo: `docs/ci-setup.md`
- [Brent · tras 1er PR] Activar branch protection en `main` con los 6 checks (nombres exactos en `docs/ci-setup.md`)
- [Brent] Bridge caído: task #1119 `failed` (3 intentos, "Claude Code invocation failed") — revisar supervisor en la Mac; `jb` tampoco existe en el sandbox. Mientras tanto: ejecución directa autorizada caso a caso
- [Brent] Rama `bridge/rescue-1119-20260707T222223` contiene tus 3 archivos rescatados (`businessDays*`, `licitacionService`) — recuperar o descartar
- [Brent/PR] Si Gate 3 falla aplicando migraciones desde cero (schema anterior a 2026-02): baseline `supabase db dump --linked` + archivar las 38 migraciones a `supabase/migrations-archive/` en el MISMO PR (procedimiento completo en `docs/ci-setup.md`)
- [Claude/PR] Si Gate 2 muestra los 13 fallos de abril, o Gate 1b (lint, zero warnings) nace rojo: fix o `.skip()`/triage con TODO vinculado, en el mismo PR
- [Brent] 7 docs `.md` sueltos quedaron visibles como untracked al des-ignorar `docs/**/*.md` (code reviews, notes) — commitear o descartar
- [Brent/legal] EIPD + redacción de consentimiento parental — bloquean Fase 2→3
- Eliminado: script roto `test:db:supervisor` (apuntaba a archivo inexistente); `test:db` ahora = `supabase test db`

## Next phase: Fase 1 — Core GENERA data model + multi-tenant RLS + seed sintético
- **Gate de entrada**: primer PR de `feat/fase0-ci` con 4 gates verdes + branch protection activa (cierre formal del DoD Fase 0)
- Objective: `persons` (identidad estable), `school_tenants`, `enrollments` y `asesor_assignments` time-bounded, enum `developmental_stage`, `guardianship`; `has_role_on_school()` security-definer envuelta en `(select ...)`; políticas RLS 4 roles GENERA × SELECT/INSERT/UPDATE/DELETE; `seed:test` (3 colegios, ~90 estudiantes 3–18, ~6 asesores, ~20 equipos base, familias, 1 leadership)
- Files likely touched: `/supabase/migrations/*`, `/lib/auth/roles.ts`, `/supabase/tests/002-rls-core.sql`, `/scripts/seed-test.ts`
- Dependencies: Fase 0 verde · Context budget ~200K · Model: Opus-class (schema + RLS correctness)
- DoD: matriz pgTAP rol×tabla×operación verde (~40–60 asserts); toda tabla nueva con RLS + columnas de policies indexadas; `seed:test` idempotente

## Human-review queue (batched)
- Verificar en el primer PR: los 6 checks aparecen y corren (evidencia DoD Fase 0) — Brent
- Revisar los pasajes reescritos de GENERA-01 (§4 sociograma, §6 secuencia+ley, §7 categorías, próximos pasos) — calidad de español y tono para Arnoldo/Sandra/Mora — Brent
- EIPD (documento legal) — requerida antes de Fase 2
- Redacción es-CL del consentimiento parental (libre, específica, inequívoca, informada)
- Due diligence copyright corpus RAG — bloquea Fases 10–11
- Ética sociométrica: toda superficie que pudiera revelar estatus de un menor (Fase 6, permanente)

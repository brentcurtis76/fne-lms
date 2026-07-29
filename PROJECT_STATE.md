# PROJECT_STATE.md

> Documento vivo de estado (estructura según §2.2 del itinerario: `docs/planning/GENERA-itinerario-construccion.md`).
> Convenciones durables: CLAUDE.md / AGENTS.md. Cada fase termina actualizando este archivo.
> Phase close requires `docs/planning/reviews/fase-<N>-review-request.md` (see CLAUDE.md executor rules). Reviewer verdict is recorded in the Human-review queue before merge.

## Meta
- Last phase completed: **Z1a — Remediación de divulgación de sesiones (WP-0) + auth** (plan Zoom §15, primera fase de agente). **CERRADA**: Sol R3 `APPROVE` sin hallazgos (2026-07-29) y merge a `main` como `c8b84f4` vía PR [#24](https://github.com/brentcurtis76/fne-lms/pull/24), rama `fix/sess-leak` (24 commits preservados). Las 6 observaciones de R1 y los 2 MAJOR de R2 quedaron corregidos antes del merge
- Date: 2026-07-29
- Model used: Claude Opus 5 (ejecución directa; PM = sesión Fable sobre el plan Zoom)
- Commit SHA: `fix/sess-leak` — base `959c1fe` → `edc1714` (Z1a-1..3) → `2ef3a9e` (docs) → `5d117ca` (Z1a-4, remediación de las 6 observaciones del reviewer) → `62a448d` (Z1a-5, los 2 MAJOR de la re-review R2). 22 commits, 61 archivos, +7427/−769
- Phase anterior: **Fase 0 — Repo hardening, CI, state scaffolding** + correcciones consolidadas pre-PR (bloques 1–3, 2026-07-08), rama `feat/fase0-ci`, base `main` @ `0650746`
- Nota: Z1a **no es una fase del itinerario GENERA**; pertenece al plan de integración Zoom (`docs/planning/zoom-integration-plan.md`). El itinerario sigue con Fase 1 — ver Next phase

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
- **Nuevo (Z1a) · Política de divulgación de sesiones:** `lib/utils/session-disclosure.ts` es la ÚNICA fuente de verdad sobre qué contiene el payload de una sesión. Ningún endpoint de sesión reimplementa la autorización en línea: todos construyen `SessionAccessContext` y llaman `canViewSession()`. Los correos personales, el `meeting_link` crudo, el `meeting_transcript` y los informes `facilitators_only` solo llegan a quien la política lo permite; el resto recibe `has_meeting` + `join_path`
- **Nuevo (Z1a) · Roles fail-closed:** una consulta EXITOSA a `user_roles` es autoritativa y final — cero filas significa cero roles. `user_roles_cache` solo se consulta cuando la consulta autoritativa FALLA (error de DB), y sus filas se marcan `is_active: null` + `from_cache: true`. **Desde Z1a-5 esas filas no autorizan EN ABSOLUTO:** `getHighestRole()` descarta toda fila `from_cache`, así que una lista de roles solo-caché resuelve `highestRole = null` y cada vía de autorización deniega por su rama de 403 existente. El fallback se conserva únicamente para que el usuario no quede como un desconocido ante el shell durante una caída; es inerte para autorización por construcción. Revocar un rol surte efecto en la siguiente petición, sin depender de refrescar la vista materializada
- **Nuevo (Z1a) · Alcance de listas = alcance de detalle:** el scope de toda colección de sesiones es la UNIÓN de lo que concede `canViewSession()`, expresada en la consulta (`.or(...)`) para no romper paginación ni `count: 'exact'`. **Desde Z1a-5 esa traducción vive una sola vez** en `lib/utils/session-scope.ts` (`buildSessionScope` + `hidesDraftSessions`) y la consumen tanto `GET /api/sessions` como el export `.ics` masivo `GET /api/sessions/ical`: código compartido, no copiado, para que no vuelvan a divergir. Lista, export y detalle no pueden discrepar sobre qué sesiones existen
- **Nuevo (Z1a) · Artefactos salientes:** ningún `.ics` ni payload de notificación lleva el enlace crudo de reunión (se usa el link de plataforma `/meet/session/{id}`), ni direcciones de correo salvo para quien `canViewParticipantEmails()` autoriza (canal ATTENDEE incluido). En producción, la URL absoluta de esos artefactos debe venir de configuración: `getAppBaseUrl()` lanza excepción antes que confiar en el encabezado `Host`
- **Nuevo (Z1a) · Facturación en hora local:** `calculateNoticeHours` se ancla en `America/Santiago` vía `getSessionDateTime`; los umbrales de cláusula (48h/336h) se verifican bajo TZ=UTC / Santiago / Madrid
- **Router (decisión 2026-07-08):** los módulos GENERA se construyen en **Pages Router** — consistencia con el codebase; migrar de router a mitad de proyecto es riesgo de timeline inaceptable. Los paths del itinerario que asumen App Router se traducen al despachar cada fase: `/app/api/dsr/*` → `/pages/api/dsr/*`, `/app/(circle-mode)/*` → `/pages/circle/*`, `/app/(asesor)/dashboard/*` → `/pages/asesor/dashboard*`, etc.
- **Idioma (convención Fase 0):** UI y copy de cara al usuario en es-CL; código, commits, migraciones y docs técnicos en inglés

## Data model (current)
- Sin cambios de schema en Fase 0 (scope out, cumplido). Baseline legado FNE-LMS: 38 migraciones (`/supabase/migrations`, última `20260601_create_tractor_signups`)
- Dominios existentes: cursos/learning paths, assessment builder, sesiones de consultor, generaciones + growth communities, licitaciones Ley SEP, hour tracking, contratos, propuestas web/PDF, sistema QA, notificaciones, roadmap, badges, bots, expense reports/fx-rates
- 9 roles (`types/roles.ts`): admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, supervisor_de_red, community_manager, docente, encargado_licitacion
- Tablas GENERA (`persons`, `enrollments`, `consent_records`, planes, sociograma, señales…): no existen aún (Fases 1+)
- Verificación RLS homogénea: ahora automatizada — `supabase/tests/001-rls-enabled.sql` exige `public` limpio salvo la **allowlist legacy 2026-07-08 (22 tablas pre-Fase-0 sin RLS, aprobada por Brent** — ver Open decisions; el objetivo es vaciarla, no crecerla). Toda tabla NUEVA sin RLS sigue rompiendo CI
- **Feature registro genérico (2026-07-20, rama `feat/registro-gen`, no es fase del itinerario):** `tractor_signups.generation_id` (uuid nullable, FK → `generations` ON DELETE SET NULL; migración `20260720134519`). La tabla ahora acepta dos `source`: `lideres_generacion_tractor` y `registro_general`. Convención confirmada: `user_roles.generation_id` es exclusivo de `lider_generacion`; el registro genérico solo escribe `profiles.generation_id` (fill-only-if-empty y solo si el colegio del perfil coincide). Migración aplicada en prod 2026-07-20 (Management API, autorizada por Brent; versión registrada en `supabase_migrations.schema_migrations`)

## Modules (current)
- Sin módulos nuevos de producto. Infra nueva Fase 0:
  - `/.github/workflows/ci.yml` — 6 checks: typecheck, lint (zero warnings), unit, `supabase test db`, e2e smoke + RLS migration guard; todos con `timeout-minutes: 20`
  - `/supabase/tests/` — `000-setup.sql` (pgTAP + helpers `tests.*` vendored API-compatible con basejump), `001-rls-enabled.sql` (DoD), `010-consultor-sessions-rls.sql` (migrado desde `database/tests/`)
  - `/scripts/ci/check-rls-migrations.sh`, `/scripts/hooks/block-rls-disable.sh`, `/.claude/settings.json` (PreToolUse)
  - `/tests/e2e/smoke.spec.ts` (gate e2e de Fase 0), `playwright.config.ts` (CI → servidor de producción)
  - `/.eslintrc.testid.json` + `npm run lint:testid` (advisory hasta limpiar baseline)
  - `CLAUDE.md` reescrito (9 roles reales, <200 líneas) + `AGENTS.md` espejo + `docs/ci-setup.md`
- CI commands: ver `docs/ci-setup.md`. Runners: node 22, npm ci, Supabase CLI latest (setup-cli), Playwright chromium
- **Z1a — Divulgación de sesiones + auth (2026-07-28, `fix/sess-leak`, plan Zoom §15, NO es fase del itinerario):** sin cambios de schema (cero migraciones; una migración en este diff sería rechazo automático).
  - Política nueva: `lib/utils/session-disclosure.ts` (informes por visibilidad, redacción de correos, link/transcripción, `has_meeting`/`join_path`), consumida por los 6 GET de sesión — detalle, lista, `reports`, `reports/[rid]`, `materials`, `attendees` — y por los 3 endpoints `.ics`
  - Superficie nueva: `pages/meet/session/[id].tsx` — interstitial SSR, único lugar que revela un enlace manual heredado, reautorizado en cada visita vía `lib/utils/session-meet-access.ts` (sin oráculo de existencia: todo lo no autorizado colapsa a un `not-found` idéntico)
  - Auth: `middleware.ts` suma `/meet` y `/consultor` al matcher (solo presencia de sesión); el redirect no autenticado lleva `?next=`, que `pages/login.tsx` honra detrás de `lib/utils/safe-redirect.ts`
  - Artefactos: `lib/utils/session-ical.ts` (links de plataforma + VTIMEZONE real de Chile vía `@touch4it/ical-timezones`; ATTENDEE fail-closed), `lib/notificationEvents.ts` + `pages/api/cron/session-reminders.ts` (`join_url` tipado), `lib/utils/app-url.ts`
  - Facturación: `lib/services/hour-tracking.ts` — `calculateNoticeHours` en hora de pared chilena (bug en vivo)
- **Registro público (2026-07-20, `feat/registro-gen`):** `/registro` (todas las escuelas + generación opcional) junto a `/registro-tractor` (Santa Marta); ambos alimentan `/admin/tractor-signups` (panel "Registros", filtro por origen, confirmación extra para grants de equipo_directivo). Ambos endpoints comparten `lib/signupSubmission.ts` (dedup re-abre registros descartados); helpers compartidos en `lib/signups.ts` (ex `tractorSignups.ts`); contrato de generación en `deriveGenerationOutcome()`. Página pública nueva `/privacidad` (Ley 21.719, contenido compartido con el modal del footer) — los checkboxes de consentimiento enlazan ahí. Tests: pgTAP `020-tractor-signups-rls.sql`, e2e `tests/e2e/registro.spec.ts` (local, no gate CI), stub supabase compartido `__tests__/helpers/supabaseStub.ts`

## Test status
Al cierre de Z1a (`62a448d`, local, macOS):
- **Typecheck** (`npm run type-check`): limpio
- **Lint** (`npm run lint`, zero warnings): limpio
- **Unit/integración (Vitest)**: **2735/2735 en 211 archivos**. Delta de la fase: 2544 (Z1a-1) → 2590 (Z1a-2) → 2641 (Z1a-3) → 2697 (Z1a-4) → **2735 (Z1a-5)**, es decir **+191 tests / +11 archivos** sobre la línea base 2544/200
- **Build** (`npm run build`): OK; `/meet/session/[id]` aparece como ruta SSR dinámica; bundle de middleware 73.7 kB
- **pgTAP** (`npm run test:db`): no ejecutado localmente — Z1a no tiene migraciones; CI lo corre igual
- **E2E** (`npm run e2e`): no ejecutado localmente (sin entorno Supabase sembrado en esta máquina); veredicto = gate e2e del PR
- **Método de prueba Z1a-4:** cada corrección del reviewer tiene un test que FALLA en el head revisado (`4cde531`) — implementar test → revertir el fix → registrar el conteo → restaurar. T1 7/10 fallan, T2 2/10, T3 4, T4 5/12, T5 9/17
- **Método de prueba Z1a-5:** mismo protocolo contra el head re-revisado (`9b8a9b9`), fix por fix. Finding ① (`utils/roleUtils.ts` revertido): `cached-roles-never-authorize` 8/10 fallan + `role-revocation-fail-closed` 2/10. Finding ② (`pages/api/sessions/ical.ts` revertido): `ical-scope-union` 6/13. `session-scope.test.ts` (15) cubre el módulo nuevo, así que no es prueba de regresión contra el head anterior
- Los 13 fallos de abril (assessment-builder `cobertura-gate`, `detalle`) **no reaparecen**: la suite completa está verde
- Known-skipped/xfail: los specs e2e de `/meet`, del round-trip `next=` de login y de los deep links de middleware son stubs `.skip()` hasta Z1c

## Consent & compliance ledger
- Sin cambios: el LMS actual es de formación docente (adultos); ninguna tabla con datos sensibles de menores
- Gate vigente: cero datos de menores hasta arquitectura de consentimiento (Fase 2) + EIPD previa (Art. 15 ter)
- Umbrales Art. 16 quáter: <14 parental todo dato; sensible <16 parental; 16–17 propio explícito. GENERA = sensible ⇒ parental <16
- Sin portal estatal: captura/prueba/revocación propias, auditables, sin casillas premarcadas
- Fixtures: exclusivamente sintéticos (los helpers `tests.create_supabase_user` generan usuarios `@test.local`)

## Decisiones tomadas (log)
- **2026-07-08 · Recorte beta Dic-2026 — CONFIRMADO por Brent:** beta = solo producto institucional B2B con 2–3 colegios piloto; rol familia sin paywall; B2C/Transbank, apps móviles e ingesta masiva RAG → 2027, tras validación del piloto. Reflejado en GENERA-01 §6
- **2026-07-08 · Pages Router para módulos GENERA** (ver Architecture invariants) — paths del itinerario se traducen al despachar cada fase
- **2026-07-28 · Z1a: la política de divulgación vive en un solo módulo.** Los cinco GET de sesión reimplementaban la autorización en línea y cada copia divergía. Se unifican en `canViewSession()` + `session-disclosure.ts`; reintroducir un chequeo de rol en línea en un endpoint de sesión es una regresión, no un atajo
- **2026-07-28 · Z1a: los enlaces crudos de reunión no salen de la plataforma.** Todo artefacto saliente (.ics, notificación, correo) lleva `/meet/session/{id}`; el enlace real se revela solo en el interstitial, reautorizado al abrirlo. Los callers privilegiados (admin/facilitador/consultor con alcance) siguen recibiendo el campo crudo en la API porque los formularios de edición lo requieren
- **2026-07-28 · Z1a-4: fail-closed sobre disponibilidad en revocación de roles.** Ante "consulta exitosa, cero filas" se elige denegar, no consultar caché. Se conserva el fallback SOLO ante error de DB para no expulsar a todos durante una caída, y esas filas no otorgan alcance
- **2026-07-28 · Z1a-5: el riesgo residual del camino degradado NO era aceptable — decisión revertida.** Z1a-4 dejó documentado que una fila `admin` en caché seguía produciendo `highestRole = 'admin'` durante una caída, como concesión a la continuidad. Sol (re-review R2) sostuvo que la continuidad no requiere autorizar desde un rol no verificable y posiblemente revocado, y que un modo degradado donde los usuarios comunes pierden acceso pero los administradores lo conservan es fail-open justo donde importa. Concedido: `getHighestRole()` descarta las filas de caché por completo. El fallback sobrevive solo como dato de presentación, sin poder de autorización
- **2026-07-28 · Z1a-5: una colección de sesiones = un solo constructor de scope.** La traducción de `canViewSession()` a filtro de consulta se escribía en línea en cada endpoint de colección y las copias divergieron (el export `.ics` masivo ni siquiera miraba `is_active`). Vive en `lib/utils/session-scope.ts`; añadir un endpoint que devuelva un conjunto de sesiones con su propio branching de roles es una regresión, no un atajo
- **2026-07-08 · Comparabilidad entre colegios NO es objetivo de GENERA:** métricas macro FNE (frecuencia sesiones, % completitud, salud grupal) operan sobre estructura/slugs canónicos, independientes de etiquetas locales. Conversación Arnoldo reencuadrada a consistencia pedagógica (GENERA-01 §7)

## Open decisions / debts (with owner)

### Deudas que arrastra Z1a
- [Brent · POST-MERGE · watch item] **Confirmar que la producción en Vercel tiene origen configurado.** Desde Z1a-4 `getAppBaseUrl()` LANZA en producción si no hay `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` ni `VERCEL_PROJECT_PRODUCTION_URL`; ya no cae al encabezado `Host`. Vercel inyecta `VERCEL_PROJECT_PRODUCTION_URL` por defecto, así que se espera satisfecho, pero no está verificado desde la máquina de ejecución. **#24 ya está mergeado**, así que dejó de ser un bloqueo previo y pasó a ser vigilancia en producción: si las descargas `.ics` o el cron de recordatorios devuelven 500, definir `NEXT_PUBLIC_BASE_URL` en Vercel (proyecto fne-lms, Production). Son los únicos consumidores de `getAppBaseUrl`; nada más se ve afectado
- [Claude · ticket aparte] **Migración a `getUser()`**: todo SSR y toda API route del repo (incluidas las nuevas) confían en la cookie de `getSession()` en lugar de validar contra el servidor de auth. Z1a no amplió la deuda, tampoco la cerró
- [Claude · post-Z2] **`/consultor/**` sin gating de rol en servidor**: el middleware ahora exige sesión (estrictamente más que antes), pero la comprobación de rol sigue siendo client-side
- [Brent+DB agent · ticket aparte] **`user_roles_cache` es una VISTA MATERIALIZADA** (`baseline.sql:11406`) con `GRANT ALL … TO anon, authenticated`: no admite RLS, así que los roles de cualquier usuario son legibles con la anon key. Su trigger sobre `profiles` solo hace `pg_notify` y nadie escucha; solo se refresca por RPC explícita. Z1a-4 lo neutralizó en código (fail-closed + filas de caché sin alcance + refresco en los 3 caminos de revocación) y Z1a-5 lo completó (esas filas ya no autorizan nada), pero el arreglo de schema requiere migración → fuera del alcance de esta fase
- ~~[Reviewer/Brent] **Riesgo residual del camino degradado**: si la consulta a `user_roles` falla, una fila `admin` en caché aún produce `highestRole = 'admin'`~~ — **CERRADO en Z1a-5** (`62a448d`): `getHighestRole()` descarta las filas `from_cache`, así que el camino degradado no otorga ningún rol. El fallback se mantiene; lo que se eliminó es su poder de autorización, no su disponibilidad
- [Brent] **Consultores globales (`school_id` NULL) reciben correos de participantes** — coherente con el modelo `canViewSession` existente; cero filas así en producción hoy. Pregunta de producto, no defecto
- [Claude · Z1c] E2E de navegador para `/meet`, el round-trip `next=` de login y los deep links de middleware (hoy stubs `.skip()`); tests de integración contra DB sembrada

### Deudas previas
- [Brent · AHORA] `git push origin feat/fase0-ci` + abrir PR (sandbox sin credenciales GitHub) → los 6 checks corren = DoD verificable. Checklist completo: `docs/ci-setup.md`
- [Brent · tras 1er PR] Activar branch protection en `main` con los 6 checks (nombres exactos en `docs/ci-setup.md`)
- [Brent] Bridge caído: task #1119 `failed` (3 intentos, "Claude Code invocation failed") — revisar supervisor en la Mac; `jb` tampoco existe en el sandbox. Mientras tanto: ejecución directa autorizada caso a caso
- [Brent] Rama `bridge/rescue-1119-20260707T222223` contiene tus 3 archivos rescatados (`businessDays*`, `licitacionService`) — recuperar o descartar
- [Brent/PR] Si Gate 3 falla aplicando migraciones desde cero (schema anterior a 2026-02): baseline `supabase db dump --linked` + archivar las 38 migraciones a `supabase/migrations-archive/` en el MISMO PR (procedimiento completo en `docs/ci-setup.md`)
- [Claude/PR] Si Gate 2 muestra los 13 fallos de abril, o Gate 1b (lint, zero warnings) nace rojo: fix o `.skip()`/triage con TODO vinculado, en el mismo PR
- [Brent] 7 docs `.md` sueltos quedaron visibles como untracked al des-ignorar `docs/**/*.md` (code reviews, notes) — commitear o descartar
- [Brent+DB agent · post-Fase 0] **22 tablas legacy sin RLS en producción** (detectadas por el baseline 2026-07-08, allowlisted en `001-rls-enabled.sql` con OK de Brent): answers, assignments, course_prerequisites, deleted_blocks, deleted_courses, deleted_lessons, deleted_modules, group_assignment_discussions, growth_community_transformation_access, instructors, learning_path_courses, learning_paths, menu_permissions, metadata_sync_log, modules, profiles_role_backup, propuesta_rate_limits, qa_tester_time_logs, questions, quizzes, student_answers, submissions. Sin datos de menores, pero legibles vía REST con anon key. Remediación: policies tabla-por-tabla en PR dedicado (no habilitar RLS sin policies — rompería producción); al habilitar cada una, quitarla de la allowlist
- [Registro Fase 0] El test tier-3 de `010-consultor-sessions-rls.sql` ahora asserta el comportamiento real: consultor con `school_id NULL` NO ve sesiones (no existe policy de acceso global; 0 filas así en producción al 2026-07-08). Si algún día se quiere "consultor global", requiere policy nueva + flip del assert
- [Brent/legal] EIPD + redacción de consentimiento parental — bloquean Fase 2→3
- Eliminado: script roto `test:db:supervisor` (apuntaba a archivo inexistente); `test:db` ahora = `supabase test db`

## Next phase
Dos hilos en paralelo, con dueños distintos:

**(a) Plan Zoom — Z1b** (continúa donde termina Z1a; ver `docs/planning/zoom-integration-plan.md` §15 y el ledger de §0)
- **Gate de entrada**: PR #24 con re-review aprobado y merge a `main`
- Z1c es quien trae la cobertura e2e/integración que Z1a dejó como stubs

**(b) Itinerario GENERA — Fase 1: Core data model + multi-tenant RLS + seed sintético**
- **Gate de entrada**: primer PR de `feat/fase0-ci` con 6 checks verdes + branch protection activa (cierre formal del DoD Fase 0)
- Objective: `persons` (identidad estable), `school_tenants`, `enrollments` y `asesor_assignments` time-bounded, enum `developmental_stage`, `guardianship`; `has_role_on_school()` security-definer envuelta en `(select ...)`; políticas RLS 4 roles GENERA × SELECT/INSERT/UPDATE/DELETE; `seed:test` (3 colegios, ~90 estudiantes 3–18, ~6 asesores, ~20 equipos base, familias, 1 leadership)
- Files likely touched: `/supabase/migrations/*`, `/lib/auth/roles.ts`, `/supabase/tests/002-rls-core.sql`, `/scripts/seed-test.ts`
- Dependencies: Fase 0 verde · Context budget ~200K · Model: Opus-class (schema + RLS correctness)
- DoD: matriz pgTAP rol×tabla×operación verde (~40–60 asserts); toda tabla nueva con RLS + columnas de policies indexadas; `seed:test` idempotente

## Human-review queue (batched)
- **Z1a: confirmar variables de entorno de producción en Vercel** — ya no bloquea el merge (#24 mergeado); queda como vigilancia post-merge, ver debts
- Verificar en el primer PR: los 6 checks aparecen y corren (evidencia DoD Fase 0) — Brent
- Revisar los pasajes reescritos de GENERA-01 (§4 sociograma, §6 secuencia+ley, §7 categorías, próximos pasos) — calidad de español y tono para Arnoldo/Sandra/Mora — Brent
- EIPD (documento legal) — requerida antes de Fase 2
- Redacción es-CL del consentimiento parental (libre, específica, inequívoca, informada)
- Due diligence copyright corpus RAG — bloquea Fases 10–11
- Ética sociométrica: toda superficie que pudiera revelar estatus de un menor (Fase 6, permanente)

# Vías de Transformación (to be deleted)

Area `09-vias-transformacion`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `c30585b2f` (2026-11-16).

Brent, 13 Nov 2026: Vías de Transformación is going to be deleted from the platform. Its screens are listed with their address and who reaches them, and nothing else. Which files go is confirmed with him on the leftover list.

10 screen files, 17 API files, 0 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/transformation` | `pages/admin/transformation.tsx` | 462 | — | To be deleted |
| `/admin/transformation/assessments` | `pages/admin/transformation/assessments.tsx` | 550 | Vías de Transformación › Todas las Evaluaciones | To be deleted |
| `/admin/transformation/metrics` | `pages/admin/transformation/metrics.tsx` | 346 | — | To be deleted |
| `/community/transformation/assessment` | `pages/community/transformation/assessment.tsx` | 1255 | — | To be deleted |
| `/community/transformation/report` | `pages/community/transformation/report.tsx` | 334 | — | To be deleted |
| `/community/transformation/results/[assessmentId]` | `pages/community/transformation/results/[assessmentId].tsx` | 698 | — | To be deleted |
| `/community/workspace/transformation/evaluate` | `pages/community/workspace/transformation/evaluate.tsx` | 498 | — | To be deleted |
| `/test/sequential-questions` | `pages/test/sequential-questions.tsx` | 41 | — | To be deleted |
| `/vias-transformacion/[id]` | `pages/vias-transformacion/[id].tsx` | 957 | — | To be deleted |
| `/vias-transformacion` | `pages/vias-transformacion/index.tsx` | 532 | Vías de Transformación; Vías de Transformación › Mis Evaluaciones | To be deleted |

## /admin/transformation

File `pages/admin/transformation.tsx` · 462 lines · frame: MainLayout

**To be deleted**

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.45 `router.push → /login  (when !session)`
  - l.60 `router.push → /  (when !hasAdminRole)`
- Linked from: nothing in the code (reached by typing the address, or from outside)
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | sent to /dashboard |
| equipo_directivo | — | sent to /dashboard |
| lider_generacion | — | sent to /dashboard |
| lider_comunidad | — | sent to /dashboard |
| supervisor_de_red | — | sent to /dashboard |
| community_manager | — | sent to /dashboard |
| docente | — | sent to /dashboard |
| encargado_licitacion | — | sent to /dashboard |

## /admin/transformation/assessments

File `pages/admin/transformation/assessments.tsx` · 550 lines · frame: MainLayout

**To be deleted**

### Who reaches it

- Menu: Vías de Transformación › «Todas las Evaluaciones» → `/admin/transformation/assessments` — admin only; the group: admin only (`Sidebar.tsx` l.349)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.102 `router.push → /login  (when !session)`
  - l.118 `router.push → /  (when !hasAdminRole)`
- Linked from: `components/layout/Sidebar.tsx:351`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | no | sent to /dashboard |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/transformation-assessments` | ? | `pages/admin/transformation/assessments.tsx:129` |

## /admin/transformation/metrics

File `pages/admin/transformation/metrics.tsx` · 346 lines · frame: none · getServerSideProps

**To be deleted**

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.45 `server redirect → /auth/login?redirect=/admin/transformation/metrics  (when !user)`
  - l.61 `isAdmin = roles.has('admin') \|\| roles.has('consultor')`
  - l.70 `server redirect → /403  (when !isAdmin && !(env !== 'production'))`
- Linked from: `pages/community/workspace/transformation/evaluate.tsx:481`, `pages/community/workspace/transformation/evaluate.tsx:482`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/lib/api-auth.server-side-user.test.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | sent to /dashboard |
| equipo_directivo | — | sent to /dashboard |
| lider_generacion | — | sent to /dashboard |
| lider_comunidad | — | sent to /dashboard |
| supervisor_de_red | — | sent to /dashboard |
| community_manager | — | sent to /dashboard |
| docente | — | sent to /dashboard |
| encargado_licitacion | — | sent to /dashboard |

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/transformation/assessments` | POST | `pages/admin/transformation/metrics.tsx:147` |

## /community/transformation/assessment

File `pages/community/transformation/assessment.tsx` · 1255 lines · frame: none

**To be deleted**

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.168 `router.push → /login  (when !authLoading && !user)`
- Linked from: `pages/community/transformation/report.tsx:145`, `pages/community/transformation/report.tsx:62`, `pages/community/transformation/results/[assessmentId].tsx:166`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/transformation/area-questions` | GET | `components/transformation/SequentialQuestions.tsx:98` |
| `/api/transformation/assessments` | POST | `pages/community/transformation/assessment.tsx:332` |
| `/api/transformation/assessments/[id]` | PATCH | `components/transformation/SequentialQuestions.tsx:225`, `pages/community/transformation/assessment.tsx:568` |
| `/api/transformation/assessments/[id]/evaluate` | POST | `pages/community/transformation/assessment.tsx:712` |
| `/api/transformation/assessments/[id]/evaluate-objective` | POST | `components/transformation/SequentialQuestions.tsx:282` |
| `/api/transformation/assessments/[id]/finalize` | POST | `components/transformation/SequentialQuestions.tsx:503`, `pages/community/transformation/assessment.tsx:768` |

## /community/transformation/report

File `pages/community/transformation/report.tsx` · 334 lines · frame: none · getServerSideProps

**To be deleted**

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: nothing in the code (reached by typing the address, or from outside)
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

## /community/transformation/results/[assessmentId]

File `pages/community/transformation/results/[assessmentId].tsx` · 698 lines · frame: none · getServerSideProps

**To be deleted**

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.101 `server redirect → /login?redirect=/community/transformation/results/[*]  (when !user)`
- Linked from: nothing in the code (reached by typing the address, or from outside)
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/lib/api-auth.server-side-user.test.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/transformation/assessments/[id]/evaluate` | POST | `pages/community/transformation/results/[assessmentId].tsx:262` |

## /community/workspace/transformation/evaluate

File `pages/community/workspace/transformation/evaluate.tsx` · 498 lines · frame: none · getServerSideProps

**To be deleted**

### Who reaches it

- Menu: no entry.
- Middleware: the workspace rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.51 `server redirect → /auth/login?redirect=/community/workspace/transformation/evaluate  (when !user)`
- Linked from: `pages/admin/transformation/metrics.tsx:157`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/lib/api-auth.server-side-user.test.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass if has a community, else /dashboard |
| equipo_directivo | — | pass if has a community, else /dashboard |
| lider_generacion | — | pass if has a community, else /dashboard |
| lider_comunidad | — | pass if has a community, else /dashboard |
| supervisor_de_red | — | pass if has a community, else /dashboard |
| community_manager | — | pass if has a community, else /dashboard |
| docente | — | pass if has a community, else /dashboard |
| encargado_licitacion | — | pass if has a community, else /dashboard |

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/transformation/chat` | POST | `hooks/useTransformationChat.ts:134`, `hooks/useTransformationChat.ts:74` |
| `/api/transformation/history` | GET | `pages/community/workspace/transformation/evaluate.tsx:153` |

## /test/sequential-questions

File `pages/test/sequential-questions.tsx` · 41 lines · frame: none

**To be deleted**

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: nothing in the code (reached by typing the address, or from outside)
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/transformation/area-questions` | GET | `components/transformation/SequentialQuestions.tsx:98` |
| `/api/transformation/assessments/[id]` | PATCH | `components/transformation/SequentialQuestions.tsx:225` |
| `/api/transformation/assessments/[id]/evaluate-objective` | POST | `components/transformation/SequentialQuestions.tsx:282` |
| `/api/transformation/assessments/[id]/finalize` | POST | `components/transformation/SequentialQuestions.tsx:503` |

## /vias-transformacion/[id]

File `pages/vias-transformacion/[id].tsx` · 957 lines · frame: MainLayout

**To be deleted**

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.190 `router.push → /login  (when !authLoading && !user)`
- Linked from: `pages/admin/transformation/assessments.tsx:409`, `pages/admin/transformation/assessments.tsx:436`, `pages/vias-transformacion/index.tsx:168`, `pages/vias-transformacion/index.tsx:365`, `pages/vias-transformacion/index.tsx:389`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/transformation/area-questions` | GET | `components/transformation/SequentialQuestions.tsx:98` |
| `/api/transformation/assessments/[id]` | PATCH | `components/transformation/SequentialQuestions.tsx:225` |
| `/api/transformation/assessments/[id]/evaluate` | POST | `pages/vias-transformacion/[id].tsx:382` |
| `/api/transformation/assessments/[id]/evaluate-objective` | POST | `components/transformation/SequentialQuestions.tsx:282` |
| `/api/transformation/assessments/[id]/finalize` | POST | `components/transformation/SequentialQuestions.tsx:503`, `pages/vias-transformacion/[id].tsx:426` |
| `/api/vias-transformacion/[id]` | GET | `pages/vias-transformacion/[id].tsx:213`, `pages/vias-transformacion/[id].tsx:458` |
| `/api/vias-transformacion/[id]/collaborators` | DELETE, POST | `pages/vias-transformacion/[id].tsx:497`, `pages/vias-transformacion/[id].tsx:530` |
| `/api/vias-transformacion/eligible-collaborators` | ? | `components/transformation/CollaboratorSelector.tsx:45` |

## /vias-transformacion

File `pages/vias-transformacion/index.tsx` · 532 lines · frame: MainLayout

**To be deleted**

### Who reaches it

- Menu: «Vías de Transformación» → `/vias-transformacion` — admin only (`Sidebar.tsx` l.328)
- Menu: Vías de Transformación › «Mis Evaluaciones» → `/vias-transformacion` — everyone signed in; the group: admin only (`Sidebar.tsx` l.336)
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.27 `ALLOWED_ROLES = ['admin']`
  - l.244 `Solo administradores pueden acceder a las Vías de Transformación.`
  - l.247 `router.push → /  (when hasPermission === false)`
- Linked from: `components/DynamicFavicon.tsx:42`, `components/layout/Sidebar.tsx:331`, `components/layout/Sidebar.tsx:338`, `pages/vias-transformacion/[id].tsx:594`, `pages/vias-transformacion/[id].tsx:626`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 5, community_manager 1, equipo_directivo 2.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | pass |
| equipo_directivo | no | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/vias-transformacion` | GET, POST | `components/transformation/AssessmentSetupModal.tsx:70`, `pages/vias-transformacion/index.tsx:110` |
| `/api/vias-transformacion/eligible-collaborators` | ? | `components/transformation/CollaboratorSelector.tsx:45` |

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/transformation-assessments` | `pages/api/admin/transformation-assessments.ts` | GET | `/admin/transformation/assessments` | `__tests__/api/admin/transformation-assessments.test.ts`, `__tests__/api/forged-session-sweep.test.ts`, `pages/admin/transformation/assessments.tsx` |
| `/api/admin/transformation/assign-access` | `pages/api/admin/transformation/assign-access.ts` | POST | **no screen** | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/admin/transformation/revoke-access` | `pages/api/admin/transformation/revoke-access.ts` | POST | **no screen** | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/transformation/area-questions` | `pages/api/transformation/area-questions.ts` | GET | `/community/transformation/assessment`, `/test/sequential-questions`, `/vias-transformacion/[id]` | `components/transformation/SequentialQuestions.tsx`, `pages/api/transformation/personalizacion-questions.ts` |
| `/api/transformation/assessments` | `pages/api/transformation/assessments.ts` | POST | `/admin/transformation/metrics`, `/community/transformation/assessment` | `__tests__/api/forged-session-sweep.test.ts`, `pages/admin/transformation/metrics.tsx`, `pages/community/transformation/assessment.tsx` |
| `/api/transformation/assessments/[id]` | `pages/api/transformation/assessments/[id].ts` | PATCH | `/community/transformation/assessment`, `/test/sequential-questions`, `/vias-transformacion/[id]` | `__tests__/api/forged-session-sweep.test.ts`, `components/transformation/SequentialQuestions.tsx`, `pages/community/transformation/assessment.tsx`, `supabase/migrations/20261009120000_transformation_school_scope.sql` |
| `/api/transformation/assessments/[id]/evaluate-objective` | `pages/api/transformation/assessments/[id]/evaluate-objective.ts` | POST | `/community/transformation/assessment`, `/test/sequential-questions`, `/vias-transformacion/[id]` | `__tests__/api/transformation/assessment-verified-identity.test.ts`, `components/transformation/SequentialQuestions.tsx` |
| `/api/transformation/assessments/[id]/evaluate` | `pages/api/transformation/assessments/[id]/evaluate.ts` | POST | `/community/transformation/assessment`, `/community/transformation/results/[assessmentId]`, `/vias-transformacion/[id]` | `__tests__/api/forged-session-sweep.test.ts`, `pages/community/transformation/assessment.tsx`, `pages/community/transformation/results/[assessmentId].tsx`, `pages/vias-transformacion/[id].tsx` |
| `/api/transformation/assessments/[id]/finalize` | `pages/api/transformation/assessments/[id]/finalize.ts` | POST | `/community/transformation/assessment`, `/test/sequential-questions`, `/vias-transformacion/[id]` | `__tests__/api/transformation/assessment-verified-identity.test.ts`, `components/transformation/SequentialQuestions.tsx`, `pages/community/transformation/assessment.tsx`, `pages/vias-transformacion/[id].tsx` |
| `/api/transformation/assessments/[id]/responses` | `pages/api/transformation/assessments/[id]/responses.ts` | GET, PUT | **no screen** | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/transformation/chat` | `pages/api/transformation/chat.ts` | POST | `/community/workspace/transformation/evaluate` | `__tests__/api/transformation/forged-session.test.ts`, `hooks/useTransformationChat.ts` |
| `/api/transformation/history` | `pages/api/transformation/history.ts` | GET | `/community/workspace/transformation/evaluate` | `__tests__/api/forged-session-sweep.test.ts`, `pages/community/workspace/transformation/evaluate.tsx` |
| `/api/transformation/personalizacion-questions` | `pages/api/transformation/personalizacion-questions.ts` | GET | **no screen** |  |
| `/api/vias-transformacion/[id]/collaborators` | `pages/api/vias-transformacion/[id]/collaborators.ts` | DELETE, GET, POST | `/vias-transformacion/[id]` | `__tests__/api/transformation/forged-session.test.ts`, `pages/vias-transformacion/[id].tsx` |
| `/api/vias-transformacion/[id]` | `pages/api/vias-transformacion/[id]/index.ts` | GET, PATCH | `/vias-transformacion/[id]` | `__tests__/api/transformation/forged-session.test.ts`, `pages/vias-transformacion/[id].tsx` |
| `/api/vias-transformacion/eligible-collaborators` | `pages/api/vias-transformacion/eligible-collaborators.ts` | GET | `/vias-transformacion`, `/vias-transformacion/[id]` | `__tests__/api/transformation/forged-session.test.ts`, `components/transformation/CollaboratorSelector.tsx` |
| `/api/vias-transformacion` | `pages/api/vias-transformacion/index.ts` | GET, POST | `/vias-transformacion` | `components/transformation/AssessmentSetupModal.tsx`, `pages/vias-transformacion/index.tsx` |


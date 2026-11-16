# Screens and their tests

Written by `scripts/redesign/inventory.mjs` from commit `007807e90`. For phase 3 (the safety net). A browser test is counted for a screen when the test file names the screen's address; that is weaker than "the test checks the screen". CI runs 28 of 69 browser test files (`scripts/ci/e2e-mandatory.mjs`).

- 150 screens with an address.
- 30 are named by a browser test that CI runs.
- 49 are named only by tests CI skips, or have only unit tests.
- 71 have no test at all.

## No test at all

| Area | Address | File |
|---|---|---|
| 01-acceso | `/pending-approval` | `pages/pending-approval.tsx` |
| 01-acceso | `/registro-tractor` | `pages/registro-tractor.tsx` (Looks like a leftover but is in use) |
| 03-aprendizaje | `/course-manager` | `pages/course-manager.tsx` (Looks like a leftover but is in use) |
| 03-aprendizaje | `/mi-aprendizaje/tareas` | `pages/mi-aprendizaje/tareas.tsx` |
| 03-aprendizaje | `/my-paths` | `pages/my-paths.tsx` (Looks like a leftover but is in use) |
| 04-cursos | `/admin/assignment-matrix` | `pages/admin/assignment-matrix.tsx` |
| 04-cursos | `/admin/course-builder/[courseId]/[moduleId]` | `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx` |
| 04-cursos | `/admin/course-builder/[courseId]/edit` | `pages/admin/course-builder/[courseId]/edit.tsx` |
| 04-cursos | `/admin/course-builder/[courseId]` | `pages/admin/course-builder/[courseId]/index.tsx` |
| 04-cursos | `/admin/course-builder/[courseId]/lesson/[lessonId]` | `pages/admin/course-builder/[courseId]/lesson/[lessonId].tsx` |
| 04-cursos | `/admin/course-builder` | `pages/admin/course-builder/index.tsx` |
| 04-cursos | `/admin/course-builder/new` | `pages/admin/course-builder/new.tsx` |
| 04-cursos | `/admin/courses/[id]/assign` | `pages/admin/courses/[id]/assign.tsx` |
| 04-cursos | `/admin/learning-paths` | `pages/admin/learning-paths.tsx` |
| 04-cursos | `/admin/learning-paths/[id]/assign` | `pages/admin/learning-paths/[id]/assign.tsx` |
| 04-cursos | `/admin/learning-paths/[id]/edit` | `pages/admin/learning-paths/[id]/edit.tsx` |
| 04-cursos | `/admin/learning-paths/new` | `pages/admin/learning-paths/new.tsx` |
| 04-cursos | `/admin/upcoming-courses` | `pages/admin/upcoming-courses/index.tsx` |
| 05-tareas | `/admin/assignment-overview` | `pages/admin/assignment-overview.tsx` |
| 05-tareas | `/admin/assignment-review/[id]` | `pages/admin/assignment-review/[id].tsx` |
| 05-tareas | `/assignments/[id]/submissions` | `pages/assignments/[id]/submissions.tsx` |
| 05-tareas | `/community/workspace/assignments/[id]/groups` | `pages/community/workspace/assignments/[id]/groups.tsx` |
| 06-sesiones | `/admin/bulk-tag-sessions` | `pages/admin/bulk-tag-sessions.tsx` |
| 06-sesiones | `/admin/consultant-assignments` | `pages/admin/consultant-assignments.tsx` |
| 06-sesiones | `/admin/sessions/[id]` | `pages/admin/sessions/[id].tsx` |
| 06-sesiones | `/admin/sessions/approvals` | `pages/admin/sessions/approvals.tsx` |
| 06-sesiones | `/admin/sessions` | `pages/admin/sessions/index.tsx` |
| 06-sesiones | `/consultor/sessions/reports` | `pages/consultor/sessions/reports.tsx` |
| 08-gestor-de-cambio | `/admin/assessment-builder` | `pages/admin/assessment-builder/index.tsx` |
| 08-gestor-de-cambio | `/demo/assessments/[templateId]` | `pages/demo/assessments/[templateId]/index.tsx` (Looks like a leftover but is in use) |
| 08-gestor-de-cambio | `/demo/assessments` | `pages/demo/assessments/index.tsx` (Looks like a leftover but is in use) |
| 09-vias-transformacion | `/admin/transformation` | `pages/admin/transformation.tsx` (To be deleted) |
| 09-vias-transformacion | `/admin/transformation/assessments` | `pages/admin/transformation/assessments.tsx` (To be deleted) |
| 09-vias-transformacion | `/community/transformation/assessment` | `pages/community/transformation/assessment.tsx` (To be deleted) |
| 09-vias-transformacion | `/community/transformation/report` | `pages/community/transformation/report.tsx` (To be deleted) |
| 09-vias-transformacion | `/test/sequential-questions` | `pages/test/sequential-questions.tsx` (To be deleted) |
| 09-vias-transformacion | `/vias-transformacion/[id]` | `pages/vias-transformacion/[id].tsx` (To be deleted) |
| 09-vias-transformacion | `/vias-transformacion` | `pages/vias-transformacion/index.tsx` (To be deleted) |
| 10-licitaciones | `/admin/licitaciones/criterios` | `pages/admin/licitaciones/criterios.tsx` (Looks like a leftover but is in use) |
| 10-licitaciones | `/admin/licitaciones/feriados` | `pages/admin/licitaciones/feriados.tsx` |
| 10-licitaciones | `/admin/licitaciones/templates` | `pages/admin/licitaciones/templates.tsx` |
| 10-licitaciones | `/licitaciones/[id]/evaluacion` | `pages/licitaciones/[id]/evaluacion.tsx` |
| 10-licitaciones | `/licitaciones/importar` | `pages/licitaciones/importar.tsx` |
| 10-licitaciones | `/licitaciones` | `pages/licitaciones/index.tsx` |
| 10-licitaciones | `/licitaciones/nueva` | `pages/licitaciones/nueva.tsx` |
| 11-gestion | `/admin/clients` | `pages/admin/clients.tsx` |
| 11-gestion | `/admin/quotes/[id]/edit` | `pages/admin/quotes/[id]/edit.tsx` |
| 11-gestion | `/admin/quotes` | `pages/admin/quotes/index.tsx` |
| 11-gestion | `/admin/quotes/new` | `pages/admin/quotes/new.tsx` |
| 11-gestion | `/contract-print/[id]` | `pages/contract-print/[id].tsx` |
| 11-gestion | `/quote/[id]` | `pages/quote/[id].tsx` |
| 13-reportes | `/detailed-reports` | `pages/detailed-reports.tsx` |
| 13-reportes | `/reporte-horas` | `pages/reporte-horas.tsx` |
| 14-personas | `/admin/role-management` | `pages/admin/role-management.tsx` |
| 15-comunicacion | `/admin/events` | `pages/admin/events.tsx` |
| 17-horas-gastos | `/admin/consultant-earnings` | `pages/admin/consultant-earnings.tsx` |
| 17-horas-gastos | `/admin/consultant-rates` | `pages/admin/consultant-rates.tsx` |
| 17-horas-gastos | `/expense-reports` | `pages/expense-reports.tsx` |
| 17-horas-gastos | `/mis-horas` | `pages/mis-horas.tsx` |
| 18-qa | `/admin/qa/assignments` | `pages/admin/qa/assignments.tsx` |
| 18-qa | `/admin/qa/confirm` | `pages/admin/qa/confirm.tsx` |
| 18-qa | `/admin/qa/coverage` | `pages/admin/qa/coverage.tsx` |
| 18-qa | `/admin/qa/feature-checklist` | `pages/admin/qa/feature-checklist.tsx` |
| 18-qa | `/admin/qa/generate` | `pages/admin/qa/generate.tsx` |
| 18-qa | `/admin/qa/import-markdown` | `pages/admin/qa/import-markdown.tsx` |
| 18-qa | `/admin/qa/lighthouse` | `pages/admin/qa/lighthouse.tsx` |
| 18-qa | `/admin/qa/load-tests` | `pages/admin/qa/load-tests.tsx` |
| 18-qa | `/admin/qa/runs/[runId]` | `pages/admin/qa/runs/[runId].tsx` |
| 18-qa | `/admin/qa/time-tracking` | `pages/admin/qa/time-tracking.tsx` |
| 19-sistema | `/admin/roadmap` | `pages/admin/roadmap.tsx` |
| 20-sitio-publico | `/privacidad` | `pages/privacidad.tsx` |

## No browser test that CI runs

| Area | Address | Browser tests CI skips | Unit tests |
|---|---|---|---|
| 01-acceso | `/403` | `e2e/assessment-frequency-validation.spec.ts`, `e2e/notification-unsubscribe.spec.ts` | — |
| 01-acceso | `/change-password` | — | 1 |
| 01-acceso | `/registro` | `e2e/registro.spec.ts` | 1 |
| 03-aprendizaje | `/mi-aprendizaje` | `e2e/notification-dispatch.spec.ts`, `e2e/notification-mail-mirror.spec.ts`, `e2e/panel-pin.spec.ts` | — |
| 03-aprendizaje | `/mi-aprendizaje/ruta/[id]` | `e2e/panel-pin.spec.ts` | 1 |
| 03-aprendizaje | `/student/course/[courseId]` | `e2e/panel-pin.spec.ts` | — |
| 03-aprendizaje | `/student/lesson/[lessonId]` | `e2e/urgent-anonymous-boundaries.spec.ts`, `e2e/urgent-anonymous-current.spec.ts` | — |
| 04-cursos | `/admin/course-builder/[courseId]/[moduleId]/[lessonId]` | `e2e/urgent-anonymous-boundaries.spec.ts`, `e2e/urgent-anonymous-current.spec.ts` | — |
| 05-tareas | `/assignments` | `e2e/notification-catalog-links.spec.ts` | — |
| 05-tareas | `/assignments/[id]` | `e2e/assessment-frequency-validation.spec.ts`, `e2e/due-reminders.spec.ts` | — |
| 05-tareas | `/quiz-reviews` | `e2e/urgent-anonymous-boundaries.spec.ts`, `e2e/urgent-anonymous-current.spec.ts` | — |
| 05-tareas | `/quiz-reviews/[id]` | `e2e/urgent-anonymous-boundaries.spec.ts`, `e2e/urgent-anonymous-current.spec.ts` | — |
| 06-sesiones | `/admin/sessions/create` | `e2e/reservation.spec.ts` | 2 |
| 06-sesiones | `/consultor/sessions/[id]` | `e2e/notification-catalog-links.spec.ts`, `e2e/session-reminders.spec.ts` | 1 |
| 06-sesiones | `/consultor/sessions` | — | 1 |
| 06-sesiones | `/meet/diag` | — | 4 |
| 07-espacio-colaborativo | `/admin/growth-communities/[id]/members` | — | 2 |
| 07-espacio-colaborativo | `/admin/growth-communities` | — | 2 |
| 07-espacio-colaborativo | `/user/[userId]` | `e2e/sentry-replay-disabled.spec.ts` | — |
| 08-gestor-de-cambio | `/admin/assessment-builder/[templateId]/expectations` | `e2e/assessment-builder-expectations-editor.spec.ts` | 1 |
| 08-gestor-de-cambio | `/admin/assessment-builder/[templateId]` | `e2e/assessment-frequency-validation.spec.ts` | 2 |
| 08-gestor-de-cambio | `/admin/assessment-builder/create` | — | 1 |
| 08-gestor-de-cambio | `/admin/context-questions` | `e2e/context-questions/admin-ui.spec.ts` | — |
| 08-gestor-de-cambio | `/admin/context-questions/overview` | `e2e/context-questions/admin-ui.spec.ts` | — |
| 08-gestor-de-cambio | `/demo/assessments/[templateId]/results` | — | 1 |
| 08-gestor-de-cambio | `/directivo/assessments/dashboard` | `e2e/proc-pilot-journey.spec.ts` | 1 |
| 08-gestor-de-cambio | `/docente/assessments/[instanceId]/results` | `e2e/assessment-results.spec.ts`, `e2e/proc-pilot-journey.spec.ts` | — |
| 08-gestor-de-cambio | `/school/migration-plan` | — | 1 |
| 08-gestor-de-cambio | `/school/transversal-context/edit` | `e2e/proc-pilot-journey.spec.ts` | 1 |
| 08-gestor-de-cambio | `/school/transversal-context` | `e2e/proc-pilot-journey.spec.ts` | 2 |
| 09-vias-transformacion | `/admin/transformation/metrics` | — | 1 |
| 09-vias-transformacion | `/community/transformation/results/[assessmentId]` | — | 1 |
| 09-vias-transformacion | `/community/workspace/transformation/evaluate` | — | 1 |
| 10-licitaciones | `/admin/licitaciones/consultores` | `e2e/flows/proposal-consultant-crud.spec.ts` | — |
| 10-licitaciones | `/admin/licitaciones/documentos-propuesta` | `e2e/flows/proposal-document-library.spec.ts` | — |
| 10-licitaciones | `/licitaciones/[id]` | `e2e/flows/proposal-admin-visibility.spec.ts`, `e2e/flows/proposal-buckets.spec.ts`, `e2e/flows/proposal-config.spec.ts`, `e2e/flows/proposal-versioning.spec.ts` | — |
| 10-licitaciones | `/propuesta/[slug]` | `e2e/flows/proposal-buckets.spec.ts`, `e2e/flows/proposal-web-view.spec.ts` | — |
| 11-gestion | `/contracts` | `e2e/urgent-anonymous-boundaries.spec.ts`, `e2e/urgent-anonymous-current.spec.ts` | 1 |
| 14-personas | `/admin/school-users` | — | 1 |
| 15-comunicacion | `/admin/news` | `e2e/urgent-anonymous-boundaries.spec.ts`, `e2e/urgent-anonymous-current.spec.ts` | — |
| 16-notificaciones | `/notificaciones/baja` | `e2e/notification-unsubscribe.spec.ts` | — |
| 18-qa | `/admin/qa/import` | `qa/auth-redirects.spec.ts`, `qa/qa-system.spec.ts` | — |
| 18-qa | `/admin/qa` | `qa/auth-redirects.spec.ts`, `qa/qa-system.spec.ts` | — |
| 18-qa | `/admin/qa/runs` | `qa/qa-system.spec.ts` | — |
| 18-qa | `/admin/qa/scenarios` | `qa/auth-redirects.spec.ts`, `qa/qa-system.spec.ts` | — |
| 18-qa | `/qa` | `qa/auth-redirects.spec.ts`, `qa/qa-system.spec.ts` | — |
| 18-qa | `/qa/run/[scenarioId]` | `qa/auth-redirects.spec.ts` | — |
| 19-sistema | `/admin/feedback` | `e2e/feedback-notify-admins.spec.ts` | — |
| 20-sitio-publico | `/` | — | 1 |

## Named by a browser test that CI runs

| Area | Address | Tests |
|---|---|---|
| 01-acceso | `/login` | `e2e/auth-cookie-identity.spec.ts`, `e2e/auth-lifecycle.spec.ts`, `e2e/login-resilience.spec.ts`, `e2e/look-switch.spec.ts`, `e2e/notification-preferences-api.spec.ts`, `e2e/notification-settings.spec.ts`, `e2e/pasantias-leads-admin.spec.ts`, `e2e/smoke.spec.ts` |
| 01-acceso | `/reset-password` | `e2e/auth-lifecycle.spec.ts` |
| 02-panel | `/dashboard` | `e2e/auth-lifecycle.spec.ts`, `e2e/ci-fixture.spec.ts`, `e2e/footer-heading-order.spec.ts`, `e2e/look-switch.spec.ts`, `e2e/notification-settings.spec.ts`, `e2e/pasantias-leads-admin.spec.ts` |
| 05-tareas | `/community/workspace/assignments/[id]/discussion` | `e2e/finance-messaging-access.spec.ts` |
| 06-sesiones | `/meet/session/[id]` | `e2e/session-disclosure.spec.ts`, `e2e/session-ical.spec.ts`, `e2e/zoom-join-authz.spec.ts`, `e2e/zoom-managed-join.spec.ts` |
| 07-espacio-colaborativo | `/community/workspace` | `e2e/auth-lifecycle.spec.ts`, `e2e/community-document-links.spec.ts`, `e2e/meeting-create-and-access.spec.ts` |
| 08-gestor-de-cambio | `/docente/assessments/[instanceId]` | `e2e/assessment-draft.spec.ts` |
| 08-gestor-de-cambio | `/docente/assessments` | `e2e/assessment-delivery.spec.ts` |
| 12-pasantias | `/admin/pasantia-leads` | `e2e/ci-fixture.spec.ts`, `e2e/pasantias-flow.spec.ts`, `e2e/pasantias-leads-admin.spec.ts` |
| 12-pasantias | `/admin/pasantia-participants` | `e2e/pasantias-participant-intake.spec.ts` |
| 12-pasantias | `/admin/pasantias-panel` | `e2e/pasantias-panel.spec.ts` |
| 12-pasantias | `/pasantias/nomina` | `e2e/pasantias-participant-intake.spec.ts` |
| 12-pasantias | `/profile/pasantia` | `e2e/pasantias-panel.spec.ts` |
| 13-reportes | `/reports` | `e2e/learning-path-governance.spec.ts` |
| 14-personas | `/admin/network-management` | `e2e/network-supervisors.spec.ts` |
| 14-personas | `/admin/schools` | `e2e/ci-fixture.spec.ts` |
| 14-personas | `/admin/tractor-signups` | `e2e/auth-lifecycle.spec.ts` |
| 14-personas | `/admin/user-management` | `e2e/auth-lifecycle.spec.ts` |
| 14-personas | `/profile` | `e2e/notification-settings.spec.ts` |
| 16-notificaciones | `/configuracion/apariencia` | `e2e/look-switch.spec.ts` |
| 16-notificaciones | `/configuracion` | `e2e/look-switch.spec.ts`, `e2e/notification-settings.spec.ts` |
| 16-notificaciones | `/configuracion/notificaciones` | `e2e/look-switch.spec.ts`, `e2e/notification-settings.spec.ts` |
| 16-notificaciones | `/notifications` | `e2e/notification-settings.spec.ts` |
| 19-sistema | `/admin/configuration` | `e2e/notification-settings.spec.ts` |
| 20-sitio-publico | `/equipo` | `e2e/footer-heading-order.spec.ts` |
| 20-sitio-publico | `/nosotros` | `e2e/footer-heading-order.spec.ts` |
| 20-sitio-publico | `/noticias` | `e2e/footer-heading-order.spec.ts` |
| 20-sitio-publico | `/noticias/[slug]` | `e2e/footer-heading-order.spec.ts` |
| 20-sitio-publico | `/pasantias` | `e2e/footer-heading-order.spec.ts`, `e2e/pasantias-flow.spec.ts`, `e2e/pasantias-form.spec.ts`, `e2e/pasantias-page.spec.ts` |
| 20-sitio-publico | `/programas` | `e2e/footer-heading-order.spec.ts`, `e2e/pasantias-page.spec.ts` |


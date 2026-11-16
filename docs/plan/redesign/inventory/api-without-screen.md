# API files that no screen calls

Written by `scripts/redesign/inventory.mjs` from commit `c4375a085`. An API file is listed here when no screen, and no piece a screen draws, names its address. "Named in" shows where else the address appears (scheduled jobs in `vercel.json`, server code, tests). Nothing here is a verdict: an address can be called from outside the platform (a webhook, a link in an email).

## Marco (the frame around every screen)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/feedback/notify-admins` | `pages/api/feedback/notify-admins.ts` | POST | `__tests__/api/feedback/notify-admins.test.ts`, `components/feedback/FeedbackModal.tsx`, `tests/e2e/feedback-notify-admins.spec.ts` |

## Acceso (sign-in, sign-up, passwords)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/auth/logout` | `pages/api/auth/logout.ts` | POST | `__tests__/middleware.forced-password-change.test.ts`, `lib/auth/forced-password-change.ts` |

## Panel (Mi Panel)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/badges/award-and-announce` | `pages/api/badges/award-and-announce.ts` | POST | **nothing** |
| `/api/dashboard/unified` | `pages/api/dashboard/unified.ts` | GET | `components/dashboard/unified/UnifiedDashboard.tsx` |

## Cursos (course builder, upcoming courses, learning paths, assignment matrix)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/courses/complete` | `pages/api/courses/complete.ts` | POST | **nothing** |
| `/api/learning-paths/assign` | `pages/api/learning-paths/assign.ts` | POST | `__tests__/api/learning-paths/governance-boundary.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/assignments/[id]` | `pages/api/learning-paths/assignments/[id].ts` | DELETE, GET | `__tests__/api/learning-paths/management-routes-boundary.test.ts` |
| `/api/learning-paths/session/activity` | `pages/api/learning-paths/session/activity.ts` | POST | `__tests__/api/learning-paths/session-activity.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/session/end` | `pages/api/learning-paths/session/end.ts` | POST | `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/session/heartbeat` | `pages/api/learning-paths/session/heartbeat.ts` | POST | `__tests__/api/learning-paths/session-heartbeat.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/session/start` | `pages/api/learning-paths/session/start.ts` | POST | `__tests__/api/learning-paths/governance-boundary.test.ts`, `scripts/redesign/harness/rules.mjs`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/user/[userId]` | `pages/api/learning-paths/user/[userId].ts` | GET | `__tests__/api/learning-paths/governance-boundary.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |

## Tareas y quizzes (assignments, group work, quiz review)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/assignments/collaborative-submit` | `pages/api/assignments/collaborative-submit.ts` | POST | `__tests__/api/forged-session-sweep.test.ts`, `components/assignments/CollaborativeSubmissionModal.tsx` |
| `/api/assignments/feedback` | `pages/api/assignments/feedback.ts` | POST | **nothing** |
| `/api/assignments/shareable-members` | `pages/api/assignments/shareable-members.ts` | GET | `__tests__/api/assignments/forged-session.test.ts`, `components/assignments/CollaborativeSubmissionModal.tsx` |

## Sesiones y consultorías (sessions, approvals, video meetings)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/sessions/capabilities` | `pages/api/sessions/capabilities.ts` | GET | `__tests__/api/sessions/session-zoom-capabilities.test.ts` |
| `/api/zoom/webhook` | `pages/api/zoom/webhook.ts` | POST | `__tests__/api/zoom/webhook-oversize.server.test.ts`, `__tests__/api/zoom/webhook.test.ts`, `__tests__/middleware.forced-password-change.test.ts` |

## Espacio Colaborativo y comunidades

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/messaging/send` | `pages/api/messaging/send.ts` | POST | `__tests__/api/messaging/send.test.ts`, `__tests__/lib/notificationService.producer-contract.test.ts`, `__tests__/lib/notificationService.source-context.test.ts`, `tests/e2e/messaging-notifications.spec.ts` |
| `/api/storage/download-url` | `pages/api/storage/download-url.ts` | POST | **nothing** |

## Gestor de Cambio (registros, context, migration plan, results)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/admin/assessment-builder/templates/[templateId]/expectations/[indicatorId]` | `pages/api/admin/assessment-builder/templates/[templateId]/expectations/[indicatorId].ts` | DELETE, GET, PUT | `__tests__/api/assessment-builder/expectations-concurrent-rules.test.ts`, `__tests__/api/assessment-builder/expectations-level-descriptors.test.ts`, `__tests__/api/assessment-builder/expectations-put-validation.test.ts`, `__tests__/api/assessment-builder/expectations.test.ts`, `__tests__/api/assessment-builder/per-year-weights.test.ts`, `__tests__/api/assessment-builder/weight-distributor.test.ts` |
| `/api/admin/assessment-builder/templates/[templateId]/snapshots/[snapshotId]` | `pages/api/admin/assessment-builder/templates/[templateId]/snapshots/[snapshotId].ts` | GET | **nothing** |

## Vías de Transformación (to be deleted)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/admin/transformation/assign-access` | `pages/api/admin/transformation/assign-access.ts` | POST | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/admin/transformation/revoke-access` | `pages/api/admin/transformation/revoke-access.ts` | POST | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/transformation/assessments/[id]/responses` | `pages/api/transformation/assessments/[id]/responses.ts` | GET, PUT | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/transformation/personalizacion-questions` | `pages/api/transformation/personalizacion-questions.ts` | GET | **nothing** |

## Licitaciones (processes, templates, proposals)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/propuestas/bloques/[id]` | `pages/api/propuestas/bloques/[id].ts` | DELETE, GET, PATCH | **nothing** |
| `/api/propuestas/download/[id]` | `pages/api/propuestas/download/[id].ts` | GET | **nothing** |
| `/api/propuestas/fichas/[id]` | `pages/api/propuestas/fichas/[id].ts` | DELETE, GET, PATCH | **nothing** |
| `/api/propuestas/plantillas/[id]` | `pages/api/propuestas/plantillas/[id].ts` | DELETE, GET, PATCH | **nothing** |

## Gestión (clients, contracts, quotes)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/contracts/[id]/hours/ledger/[ledgerId]` | `pages/api/contracts/[id]/hours/ledger/[ledgerId].ts` | PATCH | `__tests__/api/hour-tracking/ledger-json.test.ts`, `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`, `supabase/migrations/20260813120800_ledger_insert_override_sequence_privileges.sql` |
| `/api/contracts/[id]/hours/ledger` | `pages/api/contracts/[id]/hours/ledger/index.ts` | GET, POST | `__tests__/api/hour-tracking/ledger-json.test.ts` |
| `/api/quotes/create` | `pages/api/quotes/create.ts` | POST | `__tests__/api/admin/assignment-matrix-quotes-forged-session.test.ts` |
| `/api/quotes/list` | `pages/api/quotes/list.ts` | GET | `__tests__/api/forged-session-sweep.test.ts` |

## Pasantías (leads, travellers, panel, my trip)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/admin/pasantia-participants/[rosterId]` | `pages/api/admin/pasantia-participants/[rosterId].ts` | GET | `__tests__/api/admin/pasantia-participants.test.ts`, `__tests__/pages/admin/pasantia-participants.test.tsx` |
| `/api/admin/pasantias-panel/bulk` | `pages/api/admin/pasantias-panel/bulk.ts` |  | `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx` |
| `/api/admin/pasantias-panel/documents/[docId]` | `pages/api/admin/pasantias-panel/documents/[docId].ts` | GET | `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx` |
| `/api/admin/pasantias-panel/letter-assets` | `pages/api/admin/pasantias-panel/letter-assets.ts` | POST | `__tests__/api/admin/pasantias-panel.test.ts` |
| `/api/admin/pasantias-panel/participants/[id]` | `pages/api/admin/pasantias-panel/participants/[id].ts` | GET, PATCH | `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx` |
| `/api/admin/pasantias-panel/participants/[id]/documents` | `pages/api/admin/pasantias-panel/participants/[id]/documents.ts` |  | `__tests__/api/admin/pasantias-panel.test.ts` |
| `/api/admin/pasantias-panel/participants/[id]/letter` | `pages/api/admin/pasantias-panel/participants/[id]/letter.ts` |  | `__tests__/api/admin/pasantias-panel.test.ts` |
| `/api/admin/pasantias-panel/participants/[id]/send-letter` | `pages/api/admin/pasantias-panel/participants/[id]/send-letter.ts` |  | `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx` |
| `/api/admin/pasantias-panel/rosters/[rosterId]` | `pages/api/admin/pasantias-panel/rosters/[rosterId].ts` |  | `__tests__/api/admin/pasantias-panel.test.ts` |
| `/api/pasantias/mine` | `pages/api/pasantias/mine/index.ts` | GET | `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/components/layout/Sidebar.miPasantia.test.tsx`, `components/layout/Sidebar.tsx`, `tests/e2e/panel-pin.spec.ts`, `tests/e2e/pasantias-panel.spec.ts` |
| `/api/pasantias/participants/[id]` | `pages/api/pasantias/participants/[id].ts` |  | `__tests__/api/pasantias-participants.test.ts`, `__tests__/lib/pasantias/participants/school-funding.test.ts`, `__tests__/pages/pasantias-nomina.test.tsx` |
| `/api/pasantias/participants/finalize` | `pages/api/pasantias/participants/finalize.ts` |  | `__tests__/api/pasantias-participants.test.ts` |
| `/api/pasantias/participants/school` | `pages/api/pasantias/participants/school.ts` |  | `__tests__/api/pasantias-participants.test.ts`, `__tests__/pages/pasantias-nomina.test.tsx` |

## Personas (users, schools, networks, roles, profile)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/admin/apply-supervisor-migration` | `pages/api/admin/apply-supervisor-migration.ts` | POST | `__tests__/api/admin/apply-supervisor-migration.test.ts` |
| `/api/admin/check-permissions` | `pages/api/admin/check-permissions.ts` | GET | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/admin/init-supervisor-tables` | `pages/api/admin/init-supervisor-tables.ts` | POST | **nothing** |
| `/api/admin/networks/all-schools` | `pages/api/admin/networks/all-schools.ts` | GET | **nothing** |
| `/api/admin/networks/available-schools` | `pages/api/admin/networks/available-schools.ts` | GET | `__tests__/api/admin/admin-forged-session.test.ts` |
| `/api/admin/networks/test-schools` | `pages/api/admin/networks/test-schools.ts` | GET | **nothing** |
| `/api/admin/roles/permissions/overlay` | `pages/api/admin/roles/permissions/overlay.ts` | POST | `__tests__/api/admin/admin-forged-session.test.ts` |

## Comunicación (news and events)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/news/[slug]` | `pages/api/news/[slug].ts` | GET | **nothing** |

## Notificaciones

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/admin/notification-analytics` | `pages/api/admin/notification-analytics.ts` | GET | **nothing** |
| `/api/notifications/mark-read` | `pages/api/notifications/mark-read.ts` | POST | **nothing** |
| `/api/webhooks/resend` | `pages/api/webhooks/resend.ts` | POST | `__tests__/api/webhooks/resend.test.ts`, `tests/e2e/notification-bounce.spec.ts` |

## Horas, tarifas y gastos

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/fx-rates/latest` | `pages/api/fx-rates/latest.ts` | GET | `__tests__/api/hour-tracking/fx-rates.test.ts`, `tests/e2e/fx-rates.spec.ts` |
| `/api/fx-rates/refresh` | `pages/api/fx-rates/refresh.ts` | POST | `__tests__/api/hour-tracking/fx-rates.test.ts`, `tests/e2e/fx-rates.spec.ts` |

## QA (the platform's own test tool)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/admin/test-runs/cleanup` | `pages/api/admin/test-runs/cleanup.ts` | POST | `__tests__/api/admin/admin-forged-session.test.ts` |
| `/api/qa/__tests__/qa-diagnostic-capture.test` | `pages/api/qa/__tests__/qa-diagnostic-capture.test.ts` |  | **nothing** |

## Sistema (configuration, support, roadmap, test and debug pages, scheduled jobs)

| Address | File | Methods | Named in |
|---|---|---|---|
| `/api/admin/check-rls-policies` | `pages/api/admin/check-rls-policies.ts` | GET | **nothing** |
| `/api/admin/emergency-restore` | `pages/api/admin/emergency-restore.ts` |  | **nothing** |
| `/api/admin/form-usage-stats` | `pages/api/admin/form-usage-stats.ts` | GET | **nothing** |
| `/api/admin/system-updates` | `pages/api/admin/system-updates.ts` | POST | **nothing** |
| `/api/bots/telegram` | `pages/api/bots/telegram.ts` | POST | `__tests__/api/bots/telegram.test.ts` |
| `/api/check-env` | `pages/api/check-env.js` |  | **nothing** |
| `/api/cron/auth-retention` | `pages/api/cron/auth-retention.ts` |  | `__tests__/api/cron/auth-retention.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/due-reminders.spec.ts`, `tests/e2e/notification-dispatch.spec.ts`, `tests/e2e/session-reminders.spec.ts` +1 |
| `/api/cron/cleanup-learning-path-sessions` | `pages/api/cron/cleanup-learning-path-sessions.ts` | GET, POST | `__tests__/api/cron/cleanup-learning-path-sessions.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/cron/update-learning-path-summaries.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `pages/api/cron/update-learning-path-summaries.ts`, `tests/e2e/learning-path-governance.spec.ts` +1 |
| `/api/cron/due-reminders` | `pages/api/cron/due-reminders.ts` |  | `__tests__/api/cron/due-reminders.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `vercel.json` |
| `/api/cron/email-digest` | `pages/api/cron/email-digest.ts` |  | `__tests__/api/cron/email-digest.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/notification-dispatch.spec.ts`, `vercel.json` |
| `/api/cron/monitor-enrollments` | `pages/api/cron/monitor-enrollments.ts` |  | `__tests__/lib/notificationService.dispatch.test.ts`, `__tests__/lib/notificationService.source-context.test.ts` |
| `/api/cron/notification-email-retention` | `pages/api/cron/notification-email-retention.ts` |  | `__tests__/api/cron/notification-email-retention.test.ts` |
| `/api/cron/notification-emails` | `pages/api/cron/notification-emails.ts` |  | `__tests__/api/cron/notification-emails.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/notification-dispatch.spec.ts`, `vercel.json` |
| `/api/cron/pasantias-letters` | `pages/api/cron/pasantias-letters.ts` |  | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/pasantias-panel.spec.ts`, `vercel.json` |
| `/api/cron/pasantias-retention` | `pages/api/cron/pasantias-retention.ts` |  | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/pasantias-panel.spec.ts`, `vercel.json` |
| `/api/cron/recovery-outbox` | `pages/api/cron/recovery-outbox.ts` |  | `__tests__/api/cron/recovery-outbox.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/auth-lifecycle.spec.ts`, `vercel.json` |
| `/api/cron/session-reminders` | `pages/api/cron/session-reminders.ts` |  | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/sessions/session-notifications.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `__tests__/middleware.forced-password-change.test.ts`, `vercel.json` |
| `/api/cron/test-reminders` | `pages/api/cron/test-reminders.ts` |  | **nothing** |
| `/api/cron/update-learning-path-summaries` | `pages/api/cron/update-learning-path-summaries.ts` | POST | `__tests__/api/cron/update-learning-path-summaries.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/cron/zoom-reconcile` | `pages/api/cron/zoom-reconcile.ts` |  | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/cron/zoom-reconcile.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/zoom-mock-mode.spec.ts`, `vercel.json` |
| `/api/cron/zoom-ticker` | `pages/api/cron/zoom-ticker.ts` |  | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/cron/zoom-ticker.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/zoom-mock-mode.spec.ts`, `vercel.json` |
| `/api/debug/check-course-images` | `pages/api/debug/check-course-images.ts` | GET | **nothing** |
| `/api/monitoring/run-checks` | `pages/api/monitoring/run-checks.ts` | POST | **nothing** |
| `/api/test-bucket` | `pages/api/test-bucket.js` |  | **nothing** |
| `/api/test/notification-triggers` | `pages/api/test/notification-triggers.ts` |  | **nothing** |

86 of 364 API files.

## Addresses the code names that have no file

| Named in | Address | How |
|---|---|---|
| `components/common/ErrorBoundary.tsx:156` | `/api/qa/error-capture` | fetch(…) |
| `components/qa/QAFloatingWidget.tsx:137` | `/api/auth` | url.includes(…) |
| `lib/auth/recovery-cookie.ts:28` | `/api/auth/recovery` | only named (may be a prefix test, not a call) |
| `lib/pushNotifications.js:218` | `/api/notifications/test-push` | fetch(…) |
| `lib/uf-service.ts:242` | `/api/uf` | fetch(…) |


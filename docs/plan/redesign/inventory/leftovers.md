# Leftover pages — for Brent to decide

Written by `scripts/redesign/inventory.mjs` from commit `58b8d169f`. The marks are in `areas.json`. Brent's answers are recorded in the redesign ledger and, once given, in the column "Decision".

## Vías de Transformación (to be deleted)

| Address | File | What it does | Who can open it | Linked from | Tests that visit it | Decision |
|---|---|---|---|---|---|---|
| `/admin/transformation` | `pages/admin/transformation.tsx` | Part of Vías de Transformación. | the /admin rule; signed-out: sent to /login; the page has its own check | nothing | none | Goes with Vías (Brent, 13 Nov 2026) |
| `/admin/transformation/assessments` | `pages/admin/transformation/assessments.tsx` | Part of Vías de Transformación. | the /admin rule; signed-out: sent to /login; the page has its own check | `components/layout/Sidebar.tsx:351`, the menu | none | Goes with Vías (Brent, 13 Nov 2026) |
| `/admin/transformation/metrics` | `pages/admin/transformation/metrics.tsx` | Part of Vías de Transformación. | the /admin rule; signed-out: sent to /login; the page has its own check | `pages/community/workspace/transformation/evaluate.tsx:481`, `pages/community/workspace/transformation/evaluate.tsx:482` | `__tests__/lib/api-auth.server-side-user.test.ts` | Goes with Vías (Brent, 13 Nov 2026) |
| `/community/transformation/assessment` | `pages/community/transformation/assessment.tsx` | Part of Vías de Transformación. | no role rule; signed-out: not stopped by the middleware; the page has its own check | `pages/community/transformation/report.tsx:145`, `pages/community/transformation/report.tsx:62`, `pages/community/transformation/results/[assessmentId].tsx:166` | none | Goes with Vías (Brent, 13 Nov 2026) |
| `/community/transformation/report` | `pages/community/transformation/report.tsx` | Part of Vías de Transformación. | no role rule; signed-out: not stopped by the middleware | nothing | none | Goes with Vías (Brent, 13 Nov 2026) |
| `/community/transformation/results/[assessmentId]` | `pages/community/transformation/results/[assessmentId].tsx` | Part of Vías de Transformación. | no role rule; signed-out: not stopped by the middleware; the page has its own check | nothing | `__tests__/lib/api-auth.server-side-user.test.ts` | Goes with Vías (Brent, 13 Nov 2026) |
| `/community/workspace/transformation/evaluate` | `pages/community/workspace/transformation/evaluate.tsx` | Part of Vías de Transformación. | the workspace rule; signed-out: sent to /login; the page has its own check | `pages/admin/transformation/metrics.tsx:157` | `__tests__/lib/api-auth.server-side-user.test.ts` | Goes with Vías (Brent, 13 Nov 2026) |
| `/test/sequential-questions` | `pages/test/sequential-questions.tsx` | A test page for the Vías question flow. | not covered; signed-out: not stopped by the middleware | nothing | none | Goes with Vías (Brent, 13 Nov 2026) |
| `/vias-transformacion/[id]` | `pages/vias-transformacion/[id].tsx` | Part of Vías de Transformación. | not covered; signed-out: not stopped by the middleware; the page has its own check | `pages/admin/transformation/assessments.tsx:409`, `pages/admin/transformation/assessments.tsx:436`, `pages/vias-transformacion/index.tsx:168` | none | Goes with Vías (Brent, 13 Nov 2026) |
| `/vias-transformacion` | `pages/vias-transformacion/index.tsx` | Part of Vías de Transformación. | not covered; signed-out: not stopped by the middleware; the page has its own check | `components/DynamicFavicon.tsx:43`, `components/layout/Sidebar.tsx:331`, `components/layout/Sidebar.tsx:338`, the menu | none | Goes with Vías (Brent, 13 Nov 2026) |

## Test, debug and old pages

| Address | File | What it does | Who can open it | Linked from | Tests that visit it | Decision |
|---|---|---|---|---|---|---|
| `/_app 2` | `pages/_app 2.tsx` | A six-line stray copy of the app shell. Next.js serves it at the address «/_app 2» as an empty page. **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/new-reporting` | `pages/admin/new-reporting.tsx` | «Vista Previa: Nuevo Dashboard de Reportes»: a preview of a reports dashboard that was never linked. The only user of components/dashboard/unified. Admin only. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login; the page has its own check | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/dashboard-old` | `pages/dashboard-old.tsx` | The old panel with the old header. A browser test that CI runs uses its notification bell (notification-settings.spec.ts): the test must change in the same release. **Recommendation: retire, with its test.** | no role rule; signed-out: not stopped by the middleware; the page has its own check | `lib/auth/forced-password-change.ts:143`, `middleware.ts:338` | `tests/e2e/notification-settings.spec.ts (CI)` | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/courses/[id]` | `pages/courses/[id].tsx` | An unstyled course page in English with no frame. A QA test that CI skips names it (tests/qa/auth-redirects.spec.ts). **Recommendation: retire.** | no role rule; signed-out: not stopped by the middleware | `middleware.ts:335`, `pages/api/qa/seed-codebase-index.ts:133` | `tests/qa/auth-redirects.spec.ts` | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/my-paths/[id]` | `pages/my-paths/[id].tsx` | A copy of the learning-route page; the live one is /mi-aprendizaje/ruta/[id]. Nothing links to this copy. **Recommendation: retire.** | no role rule; signed-out: not stopped by the middleware; the page has its own check | `middleware.ts:349` | `__tests__/lib/api-auth.server-side-user.test.ts` | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/create-course` | `pages/admin/create-course.tsx` | An old form that writes a course and its modules straight into the database, with the old header. Admin only. The course builder replaced it. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/creador-de-cursos` | `pages/creador-de-cursos.tsx` | An old «Panel de Creador de Cursos» with the old header; its buttons lead nowhere useful. **Recommendation: retire.** | no role rule; signed-out: not stopped by the middleware; the page has its own check | `lib/auth/forced-password-change.ts:141`, `middleware.ts:336` | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/test-session` | `pages/admin/test-session.tsx` | Dumps the session as raw data. Admin only. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/apply-network-migration` | `pages/admin/apply-network-migration.tsx` | Instructions and a button to create the «Supervisor de Red» tables. The tables exist today (they are in the baseline migration). Linked from Redes de Colegios. Admin only. **Recommendation: retire, with its link.** | the /admin rule; signed-out: sent to /login; the page has its own check | `pages/admin/network-management.tsx:666`, `pages/admin/network-management.tsx:667` | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/setup-news` | `pages/admin/setup-news.tsx` | A one-time set-up page for the news table: it asks the database to create it. Admin only. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/bucket-test` | `pages/admin/bucket-test.tsx` | Lists the file-storage buckets and can ask the database to create one. Admin only. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/debug/course-module-ids` | `pages/admin/debug/course-module-ids.tsx` | Lists course and module ids (a second copy). Admin only. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login; the page has its own check | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/debug/ids` | `pages/admin/debug/ids.tsx` | Lists course and module ids. Admin only. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login; the page has its own check | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/form-usage` | `pages/admin/form-usage.tsx` | «Uso del Formulario de Contacto»: counts contact-form sends against a free Formspree plan of 50 a month. Nothing on the site records a send any more (only this page reads the counter), so it always shows old numbers. Nothing links to it. Admin only. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login; the page has its own check | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/admin/test-spanish-input` | `pages/admin/test-spanish-input.tsx` | A test of typing accents and ñ into a field. Admin only. **Recommendation: retire.** | the /admin rule; signed-out: sent to /login | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/brand-preview` | `pages/brand-preview.tsx` | A 1,580-line internal brand guide and audit page. A browser test that CI runs visits it (footer-heading-order.spec.ts): the test must change in the same release that retires the page. **Recommendation: retire, with its test.** | not covered; signed-out: not stopped by the middleware | `components/DynamicFavicon.tsx:31` | `tests/e2e/footer-heading-order.spec.ts (CI)` | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/debug-feedback-permissions` | `pages/debug-feedback-permissions.tsx` | Shows the signed-in person's role and whether they count as admin. **Recommendation: retire.** | no role rule; signed-out: not stopped by the middleware; the page has its own check | `lib/auth/forced-password-change.ts:144`, `middleware.ts:339` | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/email-showcase` | `pages/email-showcase.tsx` | Previews of the e-mail templates, built into the site as a page. Still shows the old blue. **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/test-logout` | `pages/test-logout.tsx` | Shows whether there is a session and offers sign-out buttons. **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware; the page has its own check | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/test-rbac` | `pages/test-rbac.tsx` | Prints the role-system settings of the site (public settings only). **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware; the page has its own check | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/test-sentry` | `pages/test-sentry.tsx` | A button that sends a test error to Sentry. **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/test-sidebar-role` | `pages/test-sidebar-role.tsx` | Draws the menu with the signed-in person's role values next to it. **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/test-toast` | `pages/test-toast.tsx` | A demonstration of every toast message. **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/test-user-role` | `pages/test-user-role.tsx` | Shows the session's user and role, with the old header. **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware; the page has its own check | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |
| `/test` | `pages/test.tsx` | Shows the words «Test Page Works». **Recommendation: retire.** | not covered; signed-out: not stopped by the middleware | nothing | none | Retire in phase 4 (Brent, 13 Nov 2026) |

## Look like leftovers but are in use (stay)

| Address | File | What it does | Who can open it | Linked from | Tests that visit it | Decision |
|---|---|---|---|---|---|---|
| `/registro-tractor` | `pages/registro-tractor.tsx` | Sign-up form reached from outside (a link people receive). | not covered; signed-out: not stopped by the middleware | nothing | none |  |
| `/registro` | `pages/registro.tsx` | Sign-up form reached from outside (a link people receive). The sign-in screen does not link to it. | not covered; signed-out: not stopped by the middleware | nothing | `tests/e2e/registro.spec.ts`, `__tests__/components/RegistroPage.generation.test.tsx` |  |
| `/course-manager` | `pages/course-manager.tsx` | A redirect to /mi-aprendizaje. Old notifications still point at it (components/notifications/NotificationDropdown.tsx). | no role rule; signed-out: not stopped by the middleware | `components/notifications/NotificationDropdown.tsx:138`, `components/notifications/NotificationDropdown.tsx:148`, `lib/auth/forced-password-change.ts:139` | none |  |
| `/my-paths` | `pages/my-paths.tsx` | A redirect to /mi-aprendizaje. The route page sends people to it. | no role rule; signed-out: not stopped by the middleware | `components/DynamicFavicon.tsx:33`, `lib/auth/forced-password-change.ts:154`, `middleware.ts:349` | none |  |
| `/meet/diag` | `pages/meet/diag.tsx` | «Diagnóstico del equipo»: camera, microphone and connection test for video sessions. No link inside the platform; it has four unit tests and is given to people as an address. | signed-in only; signed-out: sent to /login; the page has its own check | nothing | `__tests__/lib/api-auth.server-side-user.test.ts`, `__tests__/pages/meet-diag-join-section.test.ts`, `__tests__/pages/meet/diag-join-passcode.test.tsx`, `__tests__/pages/meet/diag-ssr.test.ts` |  |
| `/demo/assessments/[templateId]` | `pages/demo/assessments/[templateId]/index.tsx` | Practice mode of Gestor de Cambio: a live feature. | not covered; signed-out: not stopped by the middleware; the page has its own check | `pages/admin/assessment-builder/[templateId]/index.tsx:1670`, `pages/demo/assessments/[templateId]/results.tsx:181`, `pages/demo/assessments/[templateId]/results.tsx:192` | none |  |
| `/demo/assessments/[templateId]/results` | `pages/demo/assessments/[templateId]/results.tsx` | Practice mode of Gestor de Cambio: a live feature. | not covered; signed-out: not stopped by the middleware; the page has its own check | `pages/demo/assessments/[templateId]/index.tsx:224` | `__tests__/pages/demo/results-adapter.test.ts` |  |
| `/demo/assessments` | `pages/demo/assessments/index.tsx` | Practice mode of Gestor de Cambio: a live feature, opened from the registro template editor. | not covered; signed-out: not stopped by the middleware; the page has its own check | `pages/demo/assessments/[templateId]/index.tsx:273` | none |  |
| `/admin/licitaciones/criterios` | `pages/admin/licitaciones/criterios.tsx` | «Criterios de Evaluación Técnica»: a working editor of evaluation criteria per template. Nothing links to it (also finding D10 of the Licitaciones review of 13 Nov). Admin only. Brent, 13 Nov 2026: it stays and is redesigned with Licitaciones. | the /admin rule; signed-out: sent to /login; the page has its own check | nothing | none | Stays (Brent, 13 Nov 2026) |
| `/pasantias/nomina` | `pages/pasantias/nomina.tsx` | The travellers' list form, opened with a personal link generated in Nóminas de pasantes. | not covered; signed-out: not stopped by the middleware | nothing | `tests/e2e/pasantias-participant-intake.spec.ts (CI)`, `__tests__/pages/pasantias-nomina.test.tsx` |  |

## Dead files

| Address | File | What it does | Who can open it | Linked from | Tests that visit it | Decision |
|---|---|---|---|---|---|---|
| — | `pages/admin/course-builder/[id].tsx.broken` | Not a screen: the ending .broken keeps Next.js from serving it. | — | nothing | none |  |

## Vías de Transformación (to be deleted): the files behind it

Found by following imports. 16 files are used by these screens only and can go with them; 1 are also used by screens that stay and must stay; 17 API files belong to the area.

**Used only by these screens**

- `components/transformation/AreaSelectionModal.tsx`
- `components/transformation/AssessmentSetupModal.tsx`
- `components/transformation/CollaboratorSelector.tsx`
- `components/transformation/DimensionCard.tsx`
- `components/transformation/EvaluationCharts.tsx`
- `components/transformation/EvaluationSummary.tsx`
- `components/transformation/GradeSelector.tsx`
- `components/transformation/ObjectiveResults.tsx`
- `components/transformation/PreAssessmentQuestions.tsx`
- `components/transformation/ResultsDisplay.tsx`
- `components/transformation/SequentialQuestions.tsx`
- `hooks/useTransformationChat.ts`
- `lib/transformation/accessControl.ts`
- `types/grades.ts`
- `types/transformation.ts`
- `utils/transformationReportPdf.ts`

**Shared with screens that stay (do not delete)**

- `lib/api-auth.ts` — also used by 15 other screens, for example `/admin/growth-communities/[id]/members`, `/admin/growth-communities`, `/admin/pasantia-leads`

**API files of the area**

- `pages/api/admin/transformation-assessments.ts`
- `pages/api/admin/transformation/assign-access.ts`
- `pages/api/admin/transformation/revoke-access.ts`
- `pages/api/transformation/area-questions.ts`
- `pages/api/transformation/assessments.ts`
- `pages/api/transformation/assessments/[id].ts`
- `pages/api/transformation/assessments/[id]/evaluate-objective.ts`
- `pages/api/transformation/assessments/[id]/evaluate.ts`
- `pages/api/transformation/assessments/[id]/finalize.ts`
- `pages/api/transformation/assessments/[id]/responses.ts`
- `pages/api/transformation/chat.ts`
- `pages/api/transformation/history.ts`
- `pages/api/transformation/personalizacion-questions.ts`
- `pages/api/vias-transformacion/[id]/collaborators.ts`
- `pages/api/vias-transformacion/[id]/index.ts`
- `pages/api/vias-transformacion/eligible-collaborators.ts`
- `pages/api/vias-transformacion/index.ts`

## Components that no screen draws

Found by following imports from every page file: nothing reaches these files. Candidates for the clean-up (phase 8); a test may still import them.

- `components/AssignTeachersModal.tsx`
- `components/BlockActionButtons.tsx`
- `components/BlockTitleWithActions.tsx`
- `components/BlockTutorial.tsx`
- `components/ClientOnly.tsx`
- `components/DragDropWrapper.tsx`
- `components/EventsTimeline.tsx`
- `components/LessonBreadcrumb.tsx`
- `components/LessonTimeline.tsx`
- `components/NewsSlider.tsx`
- `components/OptimizedVideo.tsx`
- `components/QuickHelp.tsx`
- `components/RegistrationModal.tsx`
- `components/TeamMemberImage.tsx`
- `components/TimelineEditor.tsx`
- `components/YouTubeHelper.tsx`
- `components/activity/ActivityCard.tsx`
- `components/activity/ActivityFeed.tsx`
- `components/activity/ActivityFeedPlaceholder.tsx`
- `components/activity/ActivityFilters.tsx`
- `components/activity/ActivityNotifications.tsx`
- `components/activity/ActivitySummary.tsx`
- `components/activity/QuickActions.tsx`
- `components/admin/ModernUserManagement.tsx`
- `components/assignments/AssignmentCard.tsx`
- `components/assignments/AssignmentForm.tsx`
- `components/assignments/CollaborativeSubmissionModal.tsx`
- `components/assignments/CreateGroupModal.tsx`
- `components/assignments/GroupSubmissionModal.tsx`
- `components/assignments/SimpleGroupSubmissionModal.tsx`
- `components/auth/AuthWrapper.tsx`
- `components/auth/ProtectedRoute.tsx`
- `components/blocks/BlockRenderer.tsx`
- `components/common/ErrorBoundary.tsx`
- `components/contracts/ContractPDF.tsx`
- `components/contracts/ContractPDFComplete.tsx`
- `components/feedback/FeedbackButton.tsx`
- `components/layout/Header-backup.tsx`
- `components/messaging/MessageThread.tsx`
- `components/notifications/MobileNotificationOptimizations.tsx`
- `components/notifications/NotificationSkeleton.tsx`
- `components/propuestas-web/ModuleTimeline.tsx`
- `components/quiz/QuizResultDisplay.tsx`
- `components/quiz/QuizTaker.tsx`
- `components/quotes/QuoteForm.tsx`
- `components/reports/EmptyStates.tsx`
- `components/reports/EnhancedMobileUserCard.tsx`
- `components/reports/ReportLoadingSkeleton.tsx`
- `components/reports/ResponsiveChart.tsx`
- `components/reports/VirtualizedTable.tsx`
- `components/sessions/CancellationDialog.tsx`
- `components/workspace/SimplifiedGroupAssignments.tsx`
- `components/workspace/WorkspaceSidebar.tsx`
- `src/components/CourseBuilderTimeline.tsx`
- `src/components/LessonList.tsx`
- `src/components/VideoBlockEditor.tsx`

## Not under pages/

| File | What it is | Decision |
|---|---|---|
| `src/pages/test-course-timeline.tsx` | Not served: Next.js uses the pages/ folder at the root and ignores src/pages. Dead code. |  |
| `src/pages/admin/course-builder.tsx` | Not served, for the same reason. Dead code. |  |
| `components/layout/Header-backup.tsx` | A 28-byte file holding one comment. |  |
| `components/layout/Header.tsx` | The old header. Still used by pending-approval (a live screen) and by six leftover pages; it can go once those are retired and pending-approval is restyled. |  |
| `Menu group «Vías de Transformación» (components/layout/Sidebar.tsx)` | Goes with Vías. Its entry «Contexto Transversal» opens /school/transversal-context, which belongs to Gestor de Cambio and stays; the same page is already in the Gestor de Cambio group. |  |


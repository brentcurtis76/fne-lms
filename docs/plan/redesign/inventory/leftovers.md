# Leftover pages — for Brent to decide

Written by `scripts/redesign/inventory.mjs` from commit `3ff6aa13f`. The marks are in `areas.json`. Brent's answers are recorded in the redesign ledger and, once given, in the column "Decision".

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
| `/vias-transformacion` | `pages/vias-transformacion/index.tsx` | Part of Vías de Transformación. | not covered; signed-out: not stopped by the middleware; the page has its own check | `components/DynamicFavicon.tsx:42`, `components/layout/Sidebar.tsx:331`, `components/layout/Sidebar.tsx:338`, the menu | none | Goes with Vías (Brent, 13 Nov 2026) |

## Look like leftovers but are in use (stay)

| Address | File | What it does | Who can open it | Linked from | Tests that visit it | Decision |
|---|---|---|---|---|---|---|
| `/registro-tractor` | `pages/registro-tractor.tsx` | Sign-up form reached from outside (a link people receive). | not covered; signed-out: not stopped by the middleware | `lib/look.ts:100` | none |  |
| `/registro` | `pages/registro.tsx` | Sign-up form reached from outside (a link people receive). The sign-in screen does not link to it. | not covered; signed-out: not stopped by the middleware | `lib/look.ts:99` | `tests/e2e/registro.spec.ts`, `__tests__/components/RegistroPage.generation.test.tsx` |  |
| `/course-manager` | `pages/course-manager.tsx` | A redirect to /mi-aprendizaje. Old notifications still point at it (components/notifications/NotificationDropdown.tsx). | no role rule; signed-out: not stopped by the middleware | `components/notifications/NotificationDropdown.tsx:138`, `components/notifications/NotificationDropdown.tsx:148`, `lib/auth/forced-password-change.ts:139` | none |  |
| `/my-paths` | `pages/my-paths.tsx` | A redirect to /mi-aprendizaje. The route page sends people to it. | no role rule; signed-out: not stopped by the middleware | `components/DynamicFavicon.tsx:32`, `lib/auth/forced-password-change.ts:154`, `middleware.ts:349` | none |  |
| `/meet/diag` | `pages/meet/diag.tsx` | «Diagnóstico del equipo»: camera, microphone and connection test for video sessions. No link inside the platform; it has four unit tests and is given to people as an address. | signed-in only; signed-out: sent to /login; the page has its own check | nothing | `__tests__/lib/api-auth.server-side-user.test.ts`, `__tests__/pages/meet-diag-join-section.test.ts`, `__tests__/pages/meet/diag-join-passcode.test.tsx`, `__tests__/pages/meet/diag-ssr.test.ts` |  |
| `/demo/assessments/[templateId]` | `pages/demo/assessments/[templateId]/index.tsx` | Practice mode of Gestor de Cambio: a live feature. | not covered; signed-out: not stopped by the middleware; the page has its own check | `pages/admin/assessment-builder/[templateId]/index.tsx:1670`, `pages/demo/assessments/[templateId]/results.tsx:181`, `pages/demo/assessments/[templateId]/results.tsx:192` | none |  |
| `/demo/assessments/[templateId]/results` | `pages/demo/assessments/[templateId]/results.tsx` | Practice mode of Gestor de Cambio: a live feature. | not covered; signed-out: not stopped by the middleware; the page has its own check | `pages/demo/assessments/[templateId]/index.tsx:224` | `__tests__/pages/demo/results-adapter.test.ts` |  |
| `/demo/assessments` | `pages/demo/assessments/index.tsx` | Practice mode of Gestor de Cambio: a live feature, opened from the registro template editor. | not covered; signed-out: not stopped by the middleware; the page has its own check | `pages/demo/assessments/[templateId]/index.tsx:273` | none |  |
| `/admin/licitaciones/criterios` | `pages/admin/licitaciones/criterios.tsx` | «Criterios de Evaluación Técnica»: a working editor of evaluation criteria per template. Nothing links to it (also finding D10 of the Licitaciones review of 13 Nov). Admin only. Brent, 13 Nov 2026: it stays and is redesigned with Licitaciones. | the /admin rule; signed-out: sent to /login; the page has its own check | nothing | none | Stays (Brent, 13 Nov 2026) |
| `/pasantias/nomina` | `pages/pasantias/nomina.tsx` | The travellers' list form, opened with a personal link generated in Nóminas de pasantes. | not covered; signed-out: not stopped by the middleware | `lib/look.ts:111` | `tests/e2e/pasantias-participant-intake.spec.ts (CI)`, `__tests__/pages/pasantias-nomina.test.tsx` |  |

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
- `components/dashboard/unified/AdvancedFilters.tsx`
- `components/dashboard/unified/CommunityHealthCard.tsx`
- `components/dashboard/unified/DashboardCard.tsx`
- `components/dashboard/unified/KPISummaryCard.tsx`
- `components/dashboard/unified/UnifiedDashboard.tsx`
- `components/dashboard/unified/UpcomingSessionsCard.tsx`
- `components/dashboard/unified/WorkspaceActivityCard.tsx`
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
- `src/components/CheckUserRole.tsx`
- `src/components/CourseBuilderTimeline.tsx`
- `src/components/LessonList.tsx`
- `src/components/VideoBlockEditor.tsx`

## Not under pages/

| File | What it is | Decision |
|---|---|---|
| `src/pages/test-course-timeline.tsx` | Not served: Next.js uses the pages/ folder at the root and ignores src/pages. Dead code. |  |
| `src/pages/admin/course-builder.tsx` | Not served, for the same reason. Dead code. |  |
| `components/layout/Header-backup.tsx` | A 28-byte file holding one comment. |  |
| `components/layout/Header.tsx` | The old header. Still used by pending-approval (a live screen); the six leftover pages that also drew it were retired in phase 4c. It can go once pending-approval is restyled. |  |
| `Menu group «Vías de Transformación» (components/layout/Sidebar.tsx)` | Goes with Vías. Its entry «Contexto Transversal» opens /school/transversal-context, which belongs to Gestor de Cambio and stays; the same page is already in the Gestor de Cambio group. |  |


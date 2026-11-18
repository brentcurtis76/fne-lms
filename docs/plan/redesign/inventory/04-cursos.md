# Cursos (course builder, upcoming courses, learning paths, assignment matrix)

Area `04-cursos`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `d701100d0` (2026-11-18).

Course system: see the note on 03-aprendizaje.

15 screen files, 30 API files, 45 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/assignment-matrix` | `pages/admin/assignment-matrix.tsx` | 117 | Personas › Matriz de Asignaciones |  |
| `/admin/course-builder/[courseId]/[moduleId]/[lessonId]` | `pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx` | 1313 | — |  |
| `/admin/course-builder/[courseId]/[moduleId]` | `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx` | 666 | — |  |
| `/admin/course-builder/[courseId]/edit` | `pages/admin/course-builder/[courseId]/edit.tsx` | 700 | — |  |
| `/admin/course-builder/[courseId]` | `pages/admin/course-builder/[courseId]/index.tsx` | 738 | — |  |
| `/admin/course-builder/[courseId]/lesson/[lessonId]` | `pages/admin/course-builder/[courseId]/lesson/[lessonId].tsx` | 730 | — |  |
| — | `pages/admin/course-builder/[id].tsx.broken` | 598 | — | Dead file |
| `/admin/course-builder` | `pages/admin/course-builder/index.tsx` | 637 | Cursos › Constructor de Cursos |  |
| `/admin/course-builder/new` | `pages/admin/course-builder/new.tsx` | 390 | — |  |
| `/admin/courses/[id]/assign` | `pages/admin/courses/[id]/assign.tsx` | 929 | — |  |
| `/admin/learning-paths` | `pages/admin/learning-paths.tsx` | 306 | Cursos › Rutas de Aprendizaje |  |
| `/admin/learning-paths/[id]/assign` | `pages/admin/learning-paths/[id]/assign.tsx` | 857 | — |  |
| `/admin/learning-paths/[id]/edit` | `pages/admin/learning-paths/[id]/edit.tsx` | 479 | — |  |
| `/admin/learning-paths/new` | `pages/admin/learning-paths/new.tsx` | 456 | — |  |
| `/admin/upcoming-courses` | `pages/admin/upcoming-courses/index.tsx` | 588 | Cursos › Próximos Cursos |  |

## /admin/assignment-matrix

File `pages/admin/assignment-matrix.tsx` · 117 lines · frame: MainLayout

### Who reaches it

- Menu: Personas › «Matriz de Asignaciones» → `/admin/assignment-matrix` — admin only; the group: admin only (`Sidebar.tsx` l.460)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.30 `router.push → /login  (when !session?.user)`
  - l.37 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.38 `allowedRoles = ['admin', 'consultor']`
  - l.41 `router.push → /dashboard  (when !userRole \|\| !allowedRoles.includes(userRole))`
  - l.61 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:462`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1, community_manager 1.

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

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Matriz de Asignaciones» | h1 |  | AssignmentMatrixPage · l.100 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.30 |
| `/dashboard` | `router.push` | `!userRole \|\| !allowedRoles.includes(userRole)` | checkAuth · l.41 |
| `/login` | `router.push` |  | checkAuth · l.61 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAuth · l.37 |
| `allowedRoles = ['admin', 'consultor']` | checkAuth · l.38 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Cargando... | `loading` |  | AssignmentMatrixPage · l.67 |
| `MainLayout` |  |  |  | AssignmentMatrixPage · l.86 |
| `AssignmentMatrixContainer` |  |  |  | AssignmentMatrixPage · l.111 |

**Other texts on screen** (2)

- «Matriz de Asignaciones \| Genera» — AssignmentMatrixPage · l.83
- «Visualiza y gestiona asignaciones de cursos y rutas por usuario o grupo» — AssignmentMatrixPage · l.104

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/admin/assignment-matrix/AssignmentCard.tsx`
- `components/admin/assignment-matrix/AssignmentDetailPanel.tsx`
- `components/admin/assignment-matrix/AssignmentMatrixContainer.tsx`
- `components/admin/assignment-matrix/AuditLogSection.tsx`
- `components/admin/assignment-matrix/BatchAssignModal.tsx`
- `components/admin/assignment-matrix/CommunityAssignModal.tsx`
- `components/admin/assignment-matrix/CommunityAssignSection.tsx`
- `components/admin/assignment-matrix/ContentBatchView.tsx`
- `components/admin/assignment-matrix/GroupDetailPanel.tsx`
- `components/admin/assignment-matrix/QuickAssignDropdown.tsx`
- `components/admin/assignment-matrix/SkeletonLoaders.tsx`
- `components/admin/assignment-matrix/SourceBadge.tsx`
- `components/admin/assignment-matrix/UnassignConfirmModal.tsx`
- `components/admin/assignment-matrix/UserGroupPanel.tsx`
- `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`
- `components/admin/assignment-matrix/hooks/useOverlapDetection.ts`
- `hooks/useDebounce.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/assignment-matrix/audit-log` | GET | `components/admin/assignment-matrix/AuditLogSection.tsx:78` |
| `/api/admin/assignment-matrix/content-stats` | GET | `components/admin/assignment-matrix/ContentBatchView.tsx:50` |
| `/api/admin/assignment-matrix/group-assignments` | GET | `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:330` |
| `/api/admin/assignment-matrix/user-assignments` | GET | `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:300` |
| `/api/admin/courses` | GET | `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:378` |
| `/api/admin/users` | GET | `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:245`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:518`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:563` |
| `/api/courses/batch-assign` | POST | `components/admin/assignment-matrix/BatchAssignModal.tsx:234`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:420`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:531` |
| `/api/courses/search-assignees` | ? | `components/admin/assignment-matrix/BatchAssignModal.tsx:112` |
| `/api/courses/unassign` | DELETE | `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:468` |
| `/api/learning-paths/batch-assign` | POST | `components/admin/assignment-matrix/BatchAssignModal.tsx:235`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:444`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:576` |
| `/api/learning-paths/search-assignees` | ? | `components/admin/assignment-matrix/BatchAssignModal.tsx:113` |
| `/api/learning-paths/unassign` | DELETE | `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:492` |
| `/api/reports/filter-options` | GET | `components/admin/assignment-matrix/BatchAssignModal.tsx:85`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:180` |

## /admin/course-builder/[courseId]/[moduleId]/[lessonId]

File `pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx` · 1313 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.86 `router.push → /login`
  - l.97 `adminInMetadata = metadataHasRole(session.user?.user_metadata, 'admin')`
- Linked from: `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:248`, `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:291`, `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:547`, `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:587`, `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:588`, `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:595`, `pages/student/lesson/[lessonId].tsx:663`, `pages/student/lesson/[lessonId].tsx:665`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`.

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

### Approved changes (decided by Brent with the mock-ups; not losses)

- One lesson editor for both kinds of course: it replaces this module editor and the simple-course editor /admin/course-builder/[courseId]/lesson/[lessonId]. (cursos.md §8.3 row 'Lesson editor' and §8.5; approved by Brent 13 Nov 2026 09:25)
- The editor saves a draft by itself and has «Publicar» in place of «Guardar Cambios» / «Guardado» / «Guardar»; the save state line sits under the title. New texts: «Publicar», «Guardando borrador...», «Borrador guardado · {n} cambios sin publicar», «Publicada · sin cambios pendientes», «Hay cambios sin publicar. Los docentes siguen viendo la versión publicada hasta que presiones «Publicar».», «Descartar borrador», «¿Publicar la lección?», «Los docentes verán esta versión de inmediato.», «¿Descartar el borrador?», «{n} docentes ya completaron este bloque.», «Vista previa del borrador», «Abrir como docente». (cursos.md §8.3 row 'Lesson editor with autosaved draft' and §8.5 first row; approved by Brent 13 Nov 2026 09:25)
- «Vista Previa» opens in the page, not a new tab, and records nothing. (cursos.md §8.5 first row; approved by Brent 13 Nov 2026 09:25)
- The amber «Hay cambios sin guardar», the floating «Tienes cambios sin guardar» and confirm('Tienes cambios sin guardar. ¿Deseas salir de todos modos?') are replaced by the unpublished-changes notice; leaving never loses work because the draft saves itself. (cursos.md §8.5 row 'Amber «Hay cambios sin guardar»'; approved by Brent 13 Nov 2026 09:25)
- The eye that collapsed a block moves from the left column to the block itself; each block card has «Colapsar» / «Expandir». (cursos.md §8.5 rows 'Left column' and 'Bloques de la Lección'; approved by Brent 13 Nov 2026 09:25)
- The per-block save buttons «Guardar Bloque», «Guardar Quiz», «Guardar Enlaces», «Guardar Tarea», «Guardar Bibliografía» go away: every change saves itself to the draft. Applies to the block editors shared with the simple editor. (cursos.md §8.5 row 'Bloques de la Lección'; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 09:25 (told to him))
- Block delete: today a browser confirm('¿Estás seguro de que deseas eliminar este bloque? Esta acción no se puede deshacer.') in the module editor and no question in the simple editor; mock-up: the shared confirmation with the same question plus the learner-count warning, and nothing is erased until «Publicar». (cursos.md §8.5 row 'Block delete'; approved by Brent 13 Nov 2026 09:25)
- Save toasts (English messages today) become shared toasts in Spanish; the three quiz validations move to «Publicar» (not drawn). (cursos.md §8.5 row 'Save toasts'; approved by Brent 13 Nov 2026 09:25)

### What the page file itself draws

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Estructura de la Lección» | h3 |  | LessonEditorPage · l.893 |
| «¡Comienza a crear!» | h4 | `blocks.length === 0` | LessonEditorPage · l.919 |
| «Bloques de la Lección» | h2 |  | LessonEditorPage · l.997 |
| «No hay bloques en esta lección» | h3 | `blocks.length === 0` | LessonEditorPage · l.1006 |
| «Agregar Nuevo Bloque» | h3 |  | LessonEditorPage · l.1200 |
| «{cleanLabel}» | h4 | `each Object.values(BLOCK_TYPES)` | LessonEditorPage · l.1217 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
|  | `{(e) => { e.stopPropagation(); toggleBlockCollapse(block.id); }}` |  |  |  | SortableTimelineItem · l.818 |
| «Volver al Módulo» | `{() => router.push('/admin/course-builder/${courseId}/${moduleId}')}` |  |  |  | LessonEditorPage · l.861 |
| «Vista Previa» | `{async () => { if (hasUnsavedChanges) { await handleSave(); setTimeout(() => { w…}` |  |  |  | LessonEditorPage · l.868 |
| «← Volver al Curso» | `{() => router.back()}` |  |  |  | LessonEditorPage · l.951 |
| «↑» · tooltip «Mover arriba» | `{(e) => { e.stopPropagation(); moveBlockUp(index); }}` | `!(blocks.length === 0) && each blocks` | `{index === 0}` |  | LessonEditorPage · l.1024 |
| «↓» · tooltip «Mover abajo» | `{(e) => { e.stopPropagation(); moveBlockDown(index); }}` | `!(blocks.length === 0) && each blocks` | `{index === blocks.length - 1}` |  | LessonEditorPage · l.1035 |
| «{cleanLabel} {blockConfig.description} [Contenido] [Multimedia] [Interactivo] [Recursos]» | `{() => handleAddBlock(blockConfig.type as any)}` | `each Object.values(BLOCK_TYPES)` |  |  | LessonEditorPage · l.1211 |

**Other things that react to a click** (2)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{index + 1} {block.payload?.title} / {getBlockConfig(block.type).label} {getBlockSubtitle(block)}» | `{() => { if (!isDragging) { setActiveBlockId(block.id); const blockElement = doc…}` |  | SortableTimelineItem · l.770 |
| `div` | «↑ ↓» | `{() => setActiveBlockId(block.id)}` | `!(blocks.length === 0) && each blocks` | LessonEditorPage · l.1012 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título de la Lección» | text | «Enter lesson title» |  |  | `id=lessonTitle (id used by code)` | LessonEditorPage · l.982 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `DndContext` | `onDragEnd={handleDragEnd}` | `!(blocks.length === 0)` | LessonEditorPage · l.927 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Estás seguro de que deseas eliminar este bloque? Esta acción no se puede deshacer.» |  | handleDeleteBlock · l.560 |

**Toasts** (13)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Invalid Lesson ID.» | `!lessonId` | LessonEditorPage · l.184 |
| error | «Los bloques de quiz deben tener al menos una pregunta» | `block.type === 'quiz' && (!block.payload.questions \|\| block.payload.questions.length === 0)` | LessonEditorPage · l.194 |
| error | «Todas las preguntas del quiz deben tener texto» | `block.type === 'quiz' && (!question.question \|\| question.question.trim() === '')` | LessonEditorPage · l.202 |
| error | «La pregunta "{question.question}" debe tener al menos una respuesta correcta» | `block.type === 'quiz' && question.type !== 'open-ended' && question.options && !hasCorrectAnswer` | LessonEditorPage · l.211 |
| error | «Failed to save lesson: {lessonError.message}» | `lessonError` | LessonEditorPage · l.231 |
| error | «Failed to save {blockType} block: {result.error.message}» | `result.error` | LessonEditorPage · l.357 |
| success | «Lesson saved successfully!» | `!saveError` | LessonEditorPage · l.447 |
| error | «An unexpected error occurred while saving blocks.» |  | LessonEditorPage · l.451 |
| error | «Failed to save lesson. Please check your internet connection and try again.» |  | LessonEditorPage · l.456 |
| success | «Bloque eliminado exitosamente.» | `!blockToDelete.id.startsWith('new-') && !existingBlock` | handleDeleteBlock · l.586 |
| success | «Bloque eliminado exitosamente.» |  | handleDeleteBlock · l.645 |
| error | «Error al eliminar el bloque: {error.message}» |  | handleDeleteBlock · l.650 |
| success | «Orden de bloques actualizado» | `active.id !== over?.id && oldIndex !== -1 && newIndex !== -1` | handleDragEnd · l.746 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «El bloque no se eliminó correctamente de la base de datos» | `throw (shown by whoever catches it)` | `!blockToDelete.id.startsWith('new-') && verifyBlock` | handleDeleteBlock · l.613 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` |  | handleLogout · l.86 |
| `/admin/course-builder/[*]/[*]` | `router.push` |  | LessonEditorPage · l.862 |
| `/student/lesson/[*]` | `window.open` | `hasUnsavedChanges` | LessonEditorPage · l.873 |
| `/student/lesson/[*]` | `window.open` | `!(hasUnsavedChanges)` | LessonEditorPage · l.876 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `adminInMetadata = metadataHasRole(session.user?.user_metadata, 'admin')` | getUser · l.97 |

**Pieces placed here, with the texts and settings handed to them** (10)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | LessonEditorPage · l.842 |
| `ResponsiveFunctionalPageHeader` | title: Editor de Lección: {lessonTitle} · subtitle: {courseTitle} > {moduleTitle} · primaryAction: Guardar Cambios / Guardado |  |  | LessonEditorPage · l.851 |
| `TextBlockEditor` |  | `!(blocks.length === 0) && each blocks && block.type === 'text'` |  | LessonEditorPage · l.1051 |
| `VideoBlockEditor` |  | `!(blocks.length === 0) && each blocks && block.type === 'video'` |  | LessonEditorPage · l.1063 |
| `ImageBlockEditor` |  | `!(blocks.length === 0) && each blocks && block.type === 'image'` |  | LessonEditorPage · l.1079 |
| `QuizBlockEditor` |  | `!(blocks.length === 0) && each blocks && block.type === 'quiz'` |  | LessonEditorPage · l.1095 |
| `FileDownloadBlockEditor` |  | `!(blocks.length === 0) && each blocks && block.type === 'download'` |  | LessonEditorPage · l.1108 |
| `ExternalLinkBlockEditor` |  | `!(blocks.length === 0) && each blocks && block.type === 'external-links'` |  | LessonEditorPage · l.1122 |
| `GroupAssignmentBlockEditor` |  | `!(blocks.length === 0) && each blocks && block.type === 'group-assignment'` |  | LessonEditorPage · l.1135 |
| `BibliographyBlockEditor` |  | `!(blocks.length === 0) && each blocks && block.type === 'bibliography'` |  | LessonEditorPage · l.1149 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bibliografía & Recursos» | LessonEditorPage · l.515 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| scroll | `blockElement.scrollIntoView()` | handleAddBlock · l.548 |
| scroll | `blockElement.scrollIntoView()` | SortableTimelineItem · l.785 |

**Values shown from data** (3)

- `{index + 1}` — SortableTimelineItem · l.797
- `{block.payload?.title} / {getBlockConfig(block.type).label}` — SortableTimelineItem · l.809
- `{getBlockSubtitle(block)}` — SortableTimelineItem · l.813

**Other texts on screen** (6)

- «{blocks.length} bloque s» — LessonEditorPage · l.896
- «Arrastra los bloques para reordenar» — LessonEditorPage · l.907, when `blocks.length > 0`
- «Agrega bloques para estructurar tu lección» — LessonEditorPage · l.923, when `blocks.length === 0`
- «Hay cambios sin guardar» — LessonEditorPage · l.972, when `hasUnsavedChanges`
- «Título de la Lección» (label) — LessonEditorPage · l.979
- «Agrega contenido usando los botones de abajo» — LessonEditorPage · l.1007, when `blocks.length === 0`

**Reads and writes the database directly:** `table:blocks` (delete, insert, select, update), `table:courses` (select), `table:lessons` (select, update), `table:modules` (select), `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/blocks/BibliographyBlockEditor.tsx`
- `components/blocks/BlockEditorWrapper.tsx`
- `components/blocks/ExternalLinkBlockEditor.tsx`
- `components/blocks/FileDownloadBlockEditor.tsx`
- `components/blocks/GroupAssignmentBlockEditor.tsx`
- `components/blocks/ImageBlockEditor.tsx`
- `components/blocks/QuizBlockEditor.tsx`
- `components/blocks/TextBlockEditor.tsx`
- `components/blocks/VideoBlockEditor.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `components/ui/button.tsx`
- `config/blockTypes.ts`
- `src/components/TipTapEditor.tsx`
- `types/roles.ts`
- `utils/storage.js`

## /admin/course-builder/[courseId]/[moduleId]

File `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx` · 666 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.70 `router.push → /login`
  - l.83 `router.push → /login  (when !session?.user)`
  - l.96 `adminFromMetadata = metadataHasRole(session.user.user_metadata, 'admin')`
  - l.97 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.107 `router.push → /dashboard  (when !adminFromMetadata && !adminFromProfile)`
  - l.112 `router.push → /login`
- Linked from: `components/LessonBreadcrumb.tsx:122`, `components/LessonBreadcrumb.tsx:223`, `components/LessonBreadcrumb.tsx:224`, `pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx:862`, `pages/admin/course-builder/[courseId]/index.tsx:681`
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

### What the page file itself draws

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Cargando...» | h2 | `loading \|\| !user` | ModuleDetailPage · l.449 |
| «Oops! Algo salió mal.» | h2 | `error` | ModuleDetailPage · l.470 |
| «Módulo no disponible» | h2 | `!module` | ModuleDetailPage · l.500 |
| «Lecciones» | h2 |  | ModuleDetailPage · l.558 |
| «Este módulo aún no tiene lecciones» | h3 | `lessons.length === 0` | ModuleDetailPage · l.564 |
| «{lesson.order_number} . {lesson.title}» | h3 | `!(lessons.length === 0) && each lessons` | ModuleDetailPage · l.584 |

**Buttons** (6)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al Curso» | `{() => router.push('/admin/course-builder/${module.course_id}')}` |  |  |  | ModuleDetailPage · l.539 |
| «Editar Módulo» | `{() => router.push('/admin/course-builder/${module.course_id}/${module.id}/edit')}` |  |  |  | ModuleDetailPage · l.546 |
| «Creando lección... / Crear Primera Lección» | `{handleCreateFirstLesson}` | `lessons.length === 0` | `{isCreatingLesson}` |  | ModuleDetailPage · l.567 |
| «Mover» | `{() => handleOpenMoveModal(lesson)}` | `!(lessons.length === 0) && each lessons` |  |  | ModuleDetailPage · l.602 |
| «Eliminar» | `{() => handleOpenDeleteModal(lesson)}` | `!(lessons.length === 0) && each lessons` |  |  | ModuleDetailPage · l.608 |
| «Creando lección... / Crear Una Nueva Lección» | `{handleCreateNewLesson}` | `!(lessons.length === 0)` | `{isCreatingLesson}` |  | ModuleDetailPage · l.621 |

**Links** (6)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a los detalles del curso» | `/admin/course-builder/[*]` | `error && isValidUUID(courseIdForLink)` |  | ModuleDetailPage · l.473 |
| «Volver a los detalles del curso» |  | `error && isValidUUID(courseIdForLink)` |  | ModuleDetailPage · l.474 |
| «Volver a los detalles del curso» | `/admin/course-builder/[*]` | `!module && isValidUUID(courseIdForLink)` |  | ModuleDetailPage · l.503 |
| «Volver a los detalles del curso» |  | `!module && isValidUUID(courseIdForLink)` |  | ModuleDetailPage · l.504 |
| «Editar» | `/admin/course-builder/[*]/[*]/[*]` | `!(lessons.length === 0) && each lessons` |  | ModuleDetailPage · l.587 |
| «Editar» |  | `!(lessons.length === 0) && each lessons` |  | ModuleDetailPage · l.591 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `DeleteLessonModal` | component | `{isDeleteModalOpen}` |  | ModuleDetailPage · l.638 |
| `MoveLessonModal` | component | `{isMoveModalOpen}` |  | ModuleDetailPage · l.649 |

**Toasts** (16)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «IDs de curso o módulo no válidos.» | `!isValidUUID(courseIdStr) \|\| !isValidUUID(moduleIdStr)` | handleCreateFirstLesson · l.222 |
| loading | «Creando primera lección...» |  | handleCreateFirstLesson · l.227 |
| success | «Lección creada! Redirigiendo al editor...» |  | handleCreateFirstLesson · l.247 |
| error | «Error al crear lección: {e.message \|\| 'Error descono…}» |  | handleCreateFirstLesson · l.252 |
| error | «IDs de curso o módulo no válidos.» | `!isValidUUID(courseIdStr) \|\| !isValidUUID(moduleIdStr)` | handleCreateNewLesson · l.263 |
| loading | «Creando nueva lección...» |  | handleCreateNewLesson · l.268 |
| success | «Lección creada! Redirigiendo al editor...» |  | handleCreateNewLesson · l.290 |
| error | «Error al crear lección: {e.message \|\| 'Error descono…}» |  | handleCreateNewLesson · l.295 |
| error | «No se ha seleccionado ninguna lección para eliminar.» | `!selectedLessonForDeletion` | handleConfirmDelete · l.316 |
| loading | «Eliminando lección...» |  | handleConfirmDelete · l.323 |
| success | «Lección eliminada exitosamente» |  | handleConfirmDelete · l.350 |
| error | «Error al eliminar: {error.message}» |  | handleConfirmDelete · l.358 |
| error | «No se ha seleccionado ninguna lección para mover.» | `!selectedLessonForMove` | handleConfirmMove · l.380 |
| loading | «Moviendo lección...» |  | handleConfirmMove · l.387 |
| success | «Lección movida exitosamente al nuevo módulo» |  | handleConfirmMove · l.420 |
| error | «Error al mover la lección: {error.message}» |  | handleConfirmMove · l.428 |

**Messages set on the page** (11)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error: ID del curso o del módulo no encontrado en la URL.» | `setError` | `!courseIdStr \|\| !moduleIdStr` | fetchModuleAndLessons · l.129 |
| «Error: El ID del curso ('{courseIdStr}') no es válido.» | `setError` | `!isValidUUID(courseIdStr)` | fetchModuleAndLessons · l.136 |
| «Error: El ID del módulo ('{moduleIdStr}') no es válido.» | `setError` | `!isValidUUID(moduleIdStr)` | fetchModuleAndLessons · l.143 |
| «Error al cargar el módulo: {moduleError.message} (Code: {moduleError.code})» | `setError` | `moduleError` | fetchModuleAndLessons · l.170 |
| «Módulo no encontrado o no pertenece a este curso.» | `setError` | `!(moduleError) && !moduleData` | fetchModuleAndLessons · l.174 |
| «Error al cargar lecciones: {lessonsError.message} (Code: {lessonsError.code})» | `setError` | `lessonsError` | fetchModuleAndLessons · l.191 |
| «Error inesperado: {e.message \|\| String(e)}» | `setError` |  | fetchModuleAndLessons · l.200 |
| «No se pudo obtener la lección creada.» | `throw (shown by whoever catches it)` | `!newLesson` | handleCreateFirstLesson · l.244 |
| «No se pudo obtener la lección creada.» | `throw (shown by whoever catches it)` | `!newLesson` | handleCreateNewLesson · l.287 |
| «Error al eliminar la lección.» | `throw (shown by whoever catches it)` | `deleteLessonError` | handleConfirmDelete · l.346 |
| «Error al mover la lección.» | `throw (shown by whoever catches it)` | `updateError` | handleConfirmMove · l.416 |

**Moves to another page from code** (8)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` |  | handleLogout · l.70 |
| `/login` | `router.push` | `!session?.user` | fetchModuleAndLessons · l.83 |
| `/dashboard` | `router.push` | `!adminFromMetadata && !adminFromProfile` | fetchModuleAndLessons · l.107 |
| `/login` | `router.push` |  | fetchModuleAndLessons · l.112 |
| `/admin/course-builder/[*]/[*]/[*]` | `router.push` |  | handleCreateFirstLesson · l.248 |
| `/admin/course-builder/[*]/[*]/[*]` | `router.push` |  | handleCreateNewLesson · l.291 |
| `/admin/course-builder/[*]` | `router.push` |  | ModuleDetailPage · l.540 |
| `/admin/course-builder/[*]/[*]/edit` | `router.push` |  | ModuleDetailPage · l.547 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `adminFromMetadata = metadataHasRole(session.user.user_metadata, 'admin')` | fetchModuleAndLessons · l.96 |
| `userRole = await getUserPrimaryRole(session.user.id)` | fetchModuleAndLessons · l.97 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Cargando... | `loading \|\| !user` |  | ModuleDetailPage · l.438 |
| `MainLayout` | pageTitle: Error | `error` |  | ModuleDetailPage · l.460 |
| `MainLayout` | pageTitle: Módulo no encontrado | `!module` |  | ModuleDetailPage · l.490 |
| `MainLayout` |  |  |  | ModuleDetailPage · l.520 |
| `ResponsiveFunctionalPageHeader` | subtitle: {courseTitle} > Módulo {module.order_number} · primaryAction: Crear Primera Lección / Crear Nueva Lección |  |  | ModuleDetailPage · l.529 |
| `PlusCircleIcon` | aria-hidden: true | `lessons.length === 0` |  | ModuleDetailPage · l.573 |
| `PlusCircleIcon` | aria-hidden: true | `!(lessons.length === 0)` |  | ModuleDetailPage · l.627 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Lección 1» | ModuleDetailPage · l.234 |
| «Error desconocido» | ModuleDetailPage · l.252 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| address value | `[courseId] (part of the address)` | l.1 |
| address value | `[moduleId] (part of the address)` | l.1 |

**Values shown from data** (1)

- `{error}` — ModuleDetailPage · l.471, when `error`

**Other texts on screen** (2)

- «No se pudo cargar la información del módulo. Es posible que no exista o haya sido eliminado.» — ModuleDetailPage · l.501, when `!module`
- «Comienza por agregar la primera.» — ModuleDetailPage · l.565, when `lessons.length === 0`

**Reads and writes the database directly:** `table:blocks` (delete), `table:courses` (select), `table:lessons` (delete, insert, select, update), `table:modules` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/DeleteLessonModal.tsx`
- `components/MoveLessonModal.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

## /admin/course-builder/[courseId]/edit

File `pages/admin/course-builder/[courseId]/edit.tsx` · 700 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.69 `router.push → /login  (when !session?.user)`
  - l.82 `adminFromMetadata = metadataHasRole(session.user.user_metadata, 'admin')`
  - l.83 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.94 `router.push → /dashboard  (when !isAdminUser)`
  - l.157 `router.push → /login`
  - l.401 `router.push → /login`
- Linked from: `pages/admin/course-builder/[courseId]/index.tsx:493`, `pages/api/qa/seed-codebase-index.ts:102`
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

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Curso» | h1 |  | EditCourse · l.461 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Convertir a estructura simple / modular» | `{() => setShowConversionModal(true)}` | `course.structure_type && course.structure_type !== structureType` |  |  | EditCourse · l.555 |
| «Guardando... / Guardar Cambios» (submits the form) |  |  | `{saving \|\| !title.trim()}` |  | EditCourse · l.653 |

**Links** (6)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a Cursos» | `/admin/course-builder` | `!course` |  | EditCourse · l.427 |
| «Volver a Cursos» |  | `!course` |  | EditCourse · l.428 |
| «← Volver al Curso» | `/admin/course-builder/[*]` |  |  | EditCourse · l.456 |
| «← Volver al Curso» |  |  |  | EditCourse · l.457 |
| «Cancelar» | `/admin/course-builder/[*]` |  |  | EditCourse · l.648 |
| «Cancelar» |  |  |  | EditCourse · l.649 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del Curso *» | text | «Ej: Introducción a la Inteligencia Artificial» · required |  |  | `id=title (id used by code)` | EditCourse · l.474 |
| «Descripción» | textarea | «Describe el contenido y objetivos del curso...» |  |  | `id=description (id used by code)` | EditCourse · l.490 |
| «Simple Las lecciones se organizan directamente en el curso sin módulos. Ideal para cursos cortos con pocas lecciones.» | radio | `structure` · disabled: `{hasExistingModules}` |  |  | `id=structure-simple (id used by code)` | EditCourse · l.507 |
| «Estructurado Las lecciones se organizan en módulos. Ideal para cursos completos con múltiples temas.» | radio | `structure` |  |  | `id=structure-structured (id used by code)` | EditCourse · l.526 |
| «Instructor» | select | disabled: `{loadingInstructors}` | «Selecciona un instructor», «(lista) {inst.full_name}» |  | `id=instructor (id used by code)` | EditCourse · l.578 |
| «Nueva Imagen (opcional) / Imagen del Curso» | file | accepts `image/*` |  |  | `id=thumbnail (id used by code)` | EditCourse · l.618 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Thumbnail actual · {currentThumbnailUrl} | `currentThumbnailUrl` |  | EditCourse · l.604 |
| img · alt Vista previa · {URL.createObjectURL(thumbnail)} | `thumbnail` |  | EditCourse · l.637 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | EditCourse · l.467 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmModal` | component | `{showInstructorChangeModal}` | title: Cambiar Instructor · message: ¿Estás seguro de que quieres cambiar el instructor de "{pendingInstructorChange.old…}" a "{pendingInstructorChange.new…}"? Este cambio afectará cómo se muestra el curso. · confirmText: Sí, cambiar · cancelText: Cancelar | EditCourse · l.667 |
| `ConvertStructureModal` | component | `{showConversionModal}` |  | EditCourse · l.686 |

**Toasts** (7)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar el curso» | `courseId && error` | checkAuthAndLoadCourse · l.108 |
| success | «Curso actualizado exitosamente» |  | performSave · l.234 |
| success | «Curso convertido a estructura {targetStructure === 'simple…} exitosamente» |  | handleStructureConversion · l.311 |
| error | «Error al convertir la estructura del curso» |  | handleStructureConversion · l.318 |
| error | «Error al actualizar el curso:» |  | handleInstructorChangeConfirm · l.341 |
| error | «El título es requerido» | `!title.trim()` | handleSubmit · l.351 |
| error | «Error al actualizar el curso:» |  | handleSubmit · l.385 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` | `thumbnail` | EditCourse · l.638 |

**Moves to another page from code** (5)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuthAndLoadCourse · l.69 |
| `/dashboard` | `router.push` | `!isAdminUser` | checkAuthAndLoadCourse · l.94 |
| `/login` | `router.push` |  | checkAuthAndLoadCourse · l.157 |
| `/admin/course-builder/[*]` | `router.push` |  | performSave · l.235 |
| `/login` | `router.push` |  | handleLogout · l.401 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `adminFromMetadata = metadataHasRole(session.user.user_metadata, 'admin')` | checkAuthAndLoadCourse · l.82 |
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAuthAndLoadCourse · l.83 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Curso no encontrado | `!course` |  | EditCourse · l.417 |
| `MainLayout` | pageTitle: Editar: {course.title} · breadcrumbs: Cursos / Editar |  |  | EditCourse · l.438 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `targetStructure` | «structured / simple» | handleStructureConversion · l.245 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Módulo Principal» | EditCourse · l.279 |
| «Módulo creado durante conversión de estructura» | EditCourse · l.280 |
| «Sin instructor» | EditCourse · l.367 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.399 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.400 |
| address value | `[courseId] (part of the address)` | l.1 |

**Other texts on screen** (17)

- «Cargando...» — EditCourse · l.409, when `loading \|\| !user`
- «Curso no encontrado» — EditCourse · l.426, when `!course`
- «Modifica la información general del curso» — EditCourse · l.462
- «Título del Curso *» (label) — EditCourse · l.471
- «Descripción» (label) — EditCourse · l.487
- «Estructura del Curso» (label) — EditCourse · l.502
- «Simple Las lecciones se organizan directamente en el curso sin módulos. Ideal para cursos cortos con pocas lecciones.» (label) — EditCourse · l.517
- «Estructurado Las lecciones se organizan en módulos. Ideal para cursos completos con múltiples temas.» (label) — EditCourse · l.535
- «Nota:» — EditCourse · l.546, when `hasExistingModules`
- «Este curso ya tiene módulos creados. Para cambiar a estructura simple, primero debe eliminar todos los módulos.» — EditCourse · l.546, when `hasExistingModules`
- «Esta acción reorganizará las lecciones del curso según la nueva estructura seleccionada.» — EditCourse · l.566, when `course.structure_type && course.structure_type !== structureType`
- «Instructor» (label) — EditCourse · l.575
- «Cargando instructores...» — EditCourse · l.593, when `loadingInstructors`
- «Imagen Actual» (label) — EditCourse · l.600, when `currentThumbnailUrl`
- «Nueva Imagen (opcional) / Imagen del Curso» (label) — EditCourse · l.615
- «Formatos soportados: JPG, PNG, GIF (max 5MB)» — EditCourse · l.626
- «Vista Previa Nueva Imagen» (label) — EditCourse · l.633, when `thumbnail`

**Reads and writes the database directly:** `bucket:course-assets` (getPublicUrl, upload), `table:courses` (select, update), `table:instructors` (select), `table:lessons` (select, update), `table:modules` (delete, insert, select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/ConvertStructureModal.tsx`
- `components/common/ConfirmModal.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

## /admin/course-builder/[courseId]

File `pages/admin/course-builder/[courseId]/index.tsx` · 738 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.75 `router.push → /login`
  - l.84 `router.push → /login  (when !session?.user)`
  - l.97 `adminFromMetadata = metadataHasRole(session.user.user_metadata, 'admin')`
  - l.98 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.109 `router.push → /login`
- Linked from: `components/LessonBreadcrumb.tsx:117`, `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:473`, `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:503`, `pages/admin/course-builder/[courseId]/[moduleId]/index.tsx:540`, `pages/admin/course-builder/[courseId]/edit.tsx:235`, `pages/admin/course-builder/[courseId]/edit.tsx:444`, `pages/admin/course-builder/[courseId]/edit.tsx:456`, `pages/admin/course-builder/[courseId]/edit.tsx:648`, `pages/admin/course-builder/[courseId]/lesson/[lessonId].tsx:436`, `pages/admin/course-builder/[courseId]/lesson/[lessonId].tsx:439`, `pages/admin/course-builder/[courseId]/lesson/[lessonId].tsx:570`, `pages/admin/course-builder/index.tsx:613` and 2 more
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

### What the page file itself draws

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Lecciones del Curso / Módulos del Curso» | h2 |  | CourseDetailPage · l.503 |
| «Crear Nueva Lección» | h3 | `showCreateLessonForm && course.structure_type === 'simple'` | CourseDetailPage · l.510 |
| «Crear Nuevo Módulo» | h3 | `showCreateModuleForm && course.structure_type !== 'simple'` | CourseDetailPage · l.556 |
| «{lesson.order_number} . {lesson.title}» | h3 | `course.structure_type === 'simple' && directLessons.length > 0 && each directLessons` | CourseDetailPage · l.646 |
| «{moduleItem.order_number} . {moduleItem.title}» | h3 | `!(course.structure_type === 'simple') && modules.length > 0 && each modules` | CourseDetailPage · l.675 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Cursos» | `{() => router.push('/admin/course-builder')}` |  |  |  | CourseDetailPage · l.486 |
| «Cancelar» | `{() => { setShowCreateLessonForm(false); setNewLessonTitle(''); }}` | `showCreateLessonForm && course.structure_type === 'simple'` | `{isSubmittingLesson}` |  | CourseDetailPage · l.530 |
| «Guardando... / Guardar Lección» (submits the form) |  | `showCreateLessonForm && course.structure_type === 'simple'` | `{isSubmittingLesson}` |  | CourseDetailPage · l.541 |
| «Cancelar» | `{() => { setShowCreateModuleForm(false); setNewModuleTitle(''); setNewModuleDesc…}` | `showCreateModuleForm && course.structure_type !== 'simple'` | `{isSubmittingModule}` |  | CourseDetailPage · l.613 |
| «Guardando... / Guardar Módulo» (submits the form) |  | `showCreateModuleForm && course.structure_type !== 'simple'` | `{isSubmittingModule}` |  | CourseDetailPage · l.625 |
| «Eliminar» |  | `course.structure_type === 'simple' && directLessons.length > 0 && each directLessons` |  |  | CourseDetailPage · l.654 |
| «Editar» | `{() => handleOpenEditModal(moduleItem)}` | `!(course.structure_type === 'simple') && modules.length > 0 && each modules` |  |  | CourseDetailPage · l.686 |
| «Eliminar» | `{() => handleOpenDeleteModal(moduleItem)}` | `!(course.structure_type === 'simple') && modules.length > 0 && each modules` |  |  | CourseDetailPage · l.692 |

**Links** (8)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a Cursos» | `/admin/course-builder` | `error` |  | CourseDetailPage · l.435 |
| «Volver a Cursos» |  | `error` |  | CourseDetailPage · l.436 |
| «Editar Información» | `/admin/course-builder/[*]/edit` |  |  | CourseDetailPage · l.493 |
| «Editar Información» |  |  |  | CourseDetailPage · l.494 |
| «Editar Contenido» | `/admin/course-builder/[*]/lesson/[*]` | `course.structure_type === 'simple' && directLessons.length > 0 && each directLessons` |  | CourseDetailPage · l.649 |
| «Editar Contenido» |  | `course.structure_type === 'simple' && directLessons.length > 0 && each directLessons` |  | CourseDetailPage · l.650 |
| «Ver Lecciones» | `/admin/course-builder/[*]/[*]` | `!(course.structure_type === 'simple') && modules.length > 0 && each modules` |  | CourseDetailPage · l.681 |
| «Ver Lecciones» |  | `!(course.structure_type === 'simple') && modules.length > 0 && each modules` |  | CourseDetailPage · l.682 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título de la Lección *» | text | «Ej: Introducción al curso» · required |  | `showCreateLessonForm && course.structure_type === 'simple'` | `id=newLessonTitle (id used by code)` | CourseDetailPage · l.516 |
| «Título del Módulo *» | text | «Ej: ¿Qué es el plan personal?» · required · also `onKeyDown={(e) => { // Log key events to debug the issue console.log('Key pressed:', e.key…} · onInput={(e) => { // Additional handler for input events const target = e.target as HTML…}` |  | `showCreateModuleForm && course.structure_type !== 'simple'` | `id=newModuleTitle (id used by code)` | CourseDetailPage · l.562 |
| «Descripción (Opcional)» | textarea | «Describe brevemente el contenido del módulo...» |  | `showCreateModuleForm && course.structure_type !== 'simple'` | `id=newModuleDescription (id used by code)` | CourseDetailPage · l.600 |

**Forms** (2)

| On submit | Shown when | Where |
|---|---|---|
| `{handleLessonSubmit}` | `showCreateLessonForm && course.structure_type === 'simple'` | CourseDetailPage · l.511 |
| `{handleModuleSubmit}` | `showCreateModuleForm && course.structure_type !== 'simple'` | CourseDetailPage · l.557 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `DeleteModuleModal` | component | `{isDeleteModalOpen}` |  | CourseDetailPage · l.711 |
| `EditModuleModal` | component | `{isEditModalOpen}` |  | CourseDetailPage · l.722 |

**Toasts** (16)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «El título del módulo es obligatorio.» | `!newModuleTitle.trim()` | handleModuleSubmit · l.173 |
| error | «ID del curso no encontrado. No se puede crear el módulo.» | `!courseId` | handleModuleSubmit · l.177 |
| success | «Módulo creado exitosamente!» |  | handleModuleSubmit · l.197 |
| error | «No se pudo crear el módulo.» |  | handleModuleSubmit · l.204 |
| error | «El título de la lección es obligatorio.» | `!newLessonTitle.trim()` | handleLessonSubmit · l.213 |
| error | «ID del curso no encontrado. No se puede crear la lección.» | `!courseId` | handleLessonSubmit · l.217 |
| success | «Lección creada exitosamente!» |  | handleLessonSubmit · l.237 |
| error | «No se pudo crear la lección.» |  | handleLessonSubmit · l.243 |
| error | «No se ha seleccionado ningún módulo para eliminar.» | `!selectedModuleForDeletion` | handleConfirmDelete · l.264 |
| loading | «Eliminando módulo y lecciones...» |  | handleConfirmDelete · l.271 |
| success | «Módulo y todas sus lecciones eliminados exitosamente» |  | handleConfirmDelete · l.325 |
| error | «Error al eliminar: {error.message}» |  | handleConfirmDelete · l.333 |
| error | «No se ha seleccionado ningún módulo para editar.» | `!selectedModuleForEdit` | handleConfirmEdit · l.355 |
| loading | «Actualizando módulo...» |  | handleConfirmEdit · l.362 |
| success | «Módulo actualizado exitosamente» |  | handleConfirmEdit · l.379 |
| error | «Error al actualizar: {error.message}» |  | handleConfirmEdit · l.393 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Curso no encontrado.» | `throw (shown by whoever catches it)` | `!courseData` | CourseDetailPage · l.129 |
| «Ocurrió un error al cargar los datos del curso.» | `setError` |  | CourseDetailPage · l.165 |
| «Error al eliminar el módulo.» | `throw (shown by whoever catches it)` | `deleteModuleError` | handleConfirmDelete · l.321 |
| «Error al actualizar el módulo.» | `throw (shown by whoever catches it)` | `updateError` | handleConfirmEdit · l.375 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` |  | handleLogout · l.75 |
| `/login` | `router.push` | `!session?.user` | checkSession · l.84 |
| `/login` | `router.push` |  | checkSession · l.109 |
| `/admin/course-builder` | `router.push` |  | CourseDetailPage · l.487 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `adminFromMetadata = metadataHasRole(session.user.user_metadata, 'admin')` | checkSession · l.97 |
| `userRole = await getUserPrimaryRole(session.user.id)` | checkSession · l.98 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!courseId` | CourseDetailPage · l.117 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Cargando... | `loading \|\| !user` |  | CourseDetailPage · l.408 |
| `MainLayout` | pageTitle: Error | `error` |  | CourseDetailPage · l.425 |
| `MainLayout` | pageTitle: Curso no encontrado | `!course` |  | CourseDetailPage · l.447 |
| `MainLayout` |  |  |  | CourseDetailPage · l.463 |
| `ResponsiveFunctionalPageHeader` | primaryAction: Crear Lección / Crear Módulo |  |  | CourseDetailPage · l.472 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[courseId] (part of the address)` | l.1 |

**Values shown from data** (1)

- `{moduleItem.description}` — CourseDetailPage · l.677, when `!(course.structure_type === 'simple') && modules.length > 0 && each modules && moduleItem.description`

**Other texts on screen** (8)

- «Cargando...» — CourseDetailPage · l.417, when `loading \|\| !user`
- «Error: {error}» — CourseDetailPage · l.434, when `error`
- «Curso no encontrado.» — CourseDetailPage · l.456, when `!course`
- «Título de la Lección *» (label) — CourseDetailPage · l.513, when `showCreateLessonForm && course.structure_type === 'simple'`
- «Título del Módulo *» (label) — CourseDetailPage · l.559, when `showCreateModuleForm && course.structure_type !== 'simple'`
- «Descripción (Opcional)» (label) — CourseDetailPage · l.597, when `showCreateModuleForm && course.structure_type !== 'simple'`
- «Este curso aún no tiene lecciones.» — CourseDetailPage · l.665, when `course.structure_type === 'simple' && !(directLessons.length > 0)`
- «Este curso aún no tiene módulos.» — CourseDetailPage · l.704, when `!(course.structure_type === 'simple') && !(modules.length > 0)`

**Reads and writes the database directly:** `table:blocks` (delete), `table:courses` (select), `table:lessons` (delete, insert, select), `table:modules` (delete, insert, select, update), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/DeleteModuleModal.tsx`
- `components/EditModuleModal.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

## /admin/course-builder/[courseId]/lesson/[lessonId]

File `pages/admin/course-builder/[courseId]/lesson/[lessonId].tsx` · 730 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.240 `router.push → /login`
  - l.251 `adminInMetadata = metadataHasRole(session.user?.user_metadata, 'admin')`
- Linked from: `pages/admin/course-builder/[courseId]/index.tsx:649`
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

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Agregar Bloque» | h3 |  | SimpleLessonEditorPage · l.620 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al Curso» | `{handleBack}` |  |  |  | SimpleLessonEditorPage · l.592 |
| «{config.label}» | `{() => addBlock(key as BlockType)}` | `each Object.entries(BLOCK_TYPES)` |  |  | SimpleLessonEditorPage · l.625 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título de la Lección» | text |  |  |  |  | SimpleLessonEditorPage · l.607 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `DndContext` | `onDragEnd={handleDragEnd}` |  | SimpleLessonEditorPage · l.638 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «Tienes cambios sin guardar. ¿Deseas salir de todos modos?» | `hasUnsavedChanges` | handleBack · l.435 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Los bloques de quiz deben tener al menos una pregunta» | `block.type === 'quiz' && (!quizPayload.questions \|\| quizPayload.questions.length === 0)` | handleSave · l.315 |
| error | «Todas las preguntas del quiz deben tener texto» | `block.type === 'quiz' && (!question.question \|\| question.question.trim() === '')` | handleSave · l.322 |
| error | «La pregunta "{question.question}" debe tener al menos una respuesta correcta» | `block.type === 'quiz' && question.type !== 'open-ended' && question.options && !hasCorrectAnswer` | handleSave · l.331 |
| success | «Lección guardada exitosamente» |  | handleSave · l.417 |
| error | «Error al guardar la lección» |  | handleSave · l.421 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` |  | handleLogout · l.240 |
| `/student/lesson/[*]` | `router.push` |  | handlePreview · l.429 |
| `/admin/course-builder/[*]` | `router.push` | `hasUnsavedChanges && confirm('Tienes cambios sin guardar. ¿Deseas salir de todos modos?')` | handleBack · l.436 |
| `/admin/course-builder/[*]` | `router.push` | `!(hasUnsavedChanges)` | handleBack · l.439 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `adminInMetadata = metadataHasRole(session.user?.user_metadata, 'admin')` | getUser · l.251 |

**Pieces placed here, with the texts and settings handed to them** (10)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `TextBlockEditor` |  | `block.type === 'text'` |  | SortableBlock · l.117 |
| `VideoBlockEditor` |  | `block.type === 'video'` |  | SortableBlock · l.129 |
| `ImageBlockEditor` |  | `block.type === 'image'` |  | SortableBlock · l.139 |
| `QuizBlockEditor` |  | `block.type === 'quiz'` |  | SortableBlock · l.151 |
| `FileDownloadBlockEditor` |  | `block.type === 'download'` |  | SortableBlock · l.162 |
| `ExternalLinkBlockEditor` |  | `block.type === 'external-links'` |  | SortableBlock · l.174 |
| `GroupAssignmentBlockEditor` |  | `block.type === 'group-assignment'` |  | SortableBlock · l.185 |
| `BibliographyBlockEditor` |  | `block.type === 'bibliography'` |  | SortableBlock · l.194 |
| `MainLayout` | breadcrumbs: Cursos |  |  | SimpleLessonEditorPage · l.564 |
| `ResponsiveFunctionalPageHeader` | subtitle: Editor de lección para curso simple · primaryAction: Guardar · secondaryAction: Vista Previa |  |  | SimpleLessonEditorPage · l.577 |

**Other texts on screen** (5)

- «Arrastrar para reordenar» (title) — SortableBlock · l.106
- «Cargando...» — SimpleLessonEditorPage · l.557, when `!user`
- «Título de la Lección» (label) — SimpleLessonEditorPage · l.604
- «No hay bloques aún. Agrega bloques usando los botones de arriba.» — SimpleLessonEditorPage · l.665, when `!(blocks.length > 0)`
- «Tienes cambios sin guardar» — SimpleLessonEditorPage · l.674, when `hasUnsavedChanges`

**Reads and writes the database directly:** `table:blocks` (delete, insert, select, update), `table:courses` (select), `table:lessons` (select, update), `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/blocks/BibliographyBlockEditor.tsx`
- `components/blocks/BlockEditorWrapper.tsx`
- `components/blocks/ExternalLinkBlockEditor.tsx`
- `components/blocks/FileDownloadBlockEditor.tsx`
- `components/blocks/GroupAssignmentBlockEditor.tsx`
- `components/blocks/ImageBlockEditor.tsx`
- `components/blocks/QuizBlockEditor.tsx`
- `components/blocks/TextBlockEditor.tsx`
- `components/blocks/VideoBlockEditor.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `components/ui/button.tsx`
- `config/blockTypes.ts`
- `src/components/TipTapEditor.tsx`
- `types/roles.ts`
- `utils/storage.js`

## pages/admin/course-builder/[id].tsx.broken

File `pages/admin/course-builder/[id].tsx.broken` · 598 lines

**Dead file** — Not a screen: the ending .broken keeps Next.js from serving it.

## /admin/course-builder

File `pages/admin/course-builder/index.tsx` · 637 lines · frame: MainLayout

### Who reaches it

- Menu: Cursos › «Constructor de Cursos» → `/admin/course-builder` — everyone signed in; the group: admin only (`Sidebar.tsx` l.246)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.75 `router.push → /login  (when !session?.user)`
  - l.98 `adminInMetadata = metadataHasRole(session.user.user_metadata, 'admin')`
  - l.109 `isAdmin = adminInMetadata \|\| hasAdminRoleInDB`
  - l.420 `router.push → /login`
  - l.452 `No tienes permiso para acceder a esta página.`
- Linked from: `components/layout/Sidebar.tsx:248`, `lib/notifications/catalog.ts:380`, `pages/admin/course-builder/[courseId]/edit.tsx:427`, `pages/admin/course-builder/[courseId]/edit.tsx:443`, `pages/admin/course-builder/[courseId]/index.tsx:435`, `pages/admin/course-builder/[courseId]/index.tsx:487`, `pages/admin/course-builder/[courseId]/lesson/[lessonId].tsx:569`, `pages/admin/course-builder/new.tsx:205`, `pages/admin/course-builder/new.tsx:243`, `pages/admin/courses/[id]/assign.tsx:199`, `pages/admin/courses/[id]/assign.tsx:509`, `pages/admin/courses/[id]/assign.tsx:527` and 2 more
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

### Approved changes (decided by Brent with the mock-ups; not losses)

- New «Duplicar» on each course card. New texts: «Duplicar», «¿Duplicar este curso?», «Copia de {título}», «Sin publicar», «Duplicando curso...», «Curso duplicado. La copia queda sin asignar y sin publicar.», «{n} docentes con avance», «Sin asignar». (cursos.md §8.3 row 'Course list with «Duplicar»'; approved by Brent 13 Nov 2026 09:25)
- Course cards no longer open on hover: badge, title, instructor, description and the actions «Editar», «Ver», «Asignar», «Eliminar» are always visible, plus «Duplicar» and a line with the number of learners. (cursos.md §8.4 row 'Course card'; approved by Brent 13 Nov 2026 09:25)
- The delete pop-up adds a warning with the number of learners; the rule that the button wakes only when 'Eliminar' is typed stays. (cursos.md §8.4 row 'Delete modal'; approved by Brent 13 Nov 2026 09:25)
- Delete pop-up wording: «…se moverán a tablas de respaldo.» becomes «Esta acción no se puede deshacer. Se eliminan el curso, sus módulos, lecciones y bloques.» (cursos.md §8.4 row 'Delete modal'; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 09:25 (the reworded sentence was told to him))

### Notes

- «Crear Nuevo Curso» links to /admin/course-builder/new, which exists as pages/admin/course-builder/new.tsx but was not read for these notes. (cursos.md §7 item 14)
- «No hay cursos todavía», «Acceso Denegado» … «Ir al Panel» and «Cargando...» use the foundations' empty state, notice and skeleton (not drawn); «No se encontraron cursos» is drawn. (cursos.md §8.4 row 'Empty …')

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `userRole !== null && userRole !== 'admin'` | CourseBuilder · l.451 |
| «Agregar Nuevo Curso» | h2 |  | CourseBuilder · l.549 |
| «No hay cursos todavía» | h3 | `courses.length === 0` | CourseBuilder · l.575 |
| «No se encontraron cursos» | h3 | `!(courses.length === 0) && filterCourses(courses).length === 0` | CourseBuilder · l.590 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Limpiar» | `{() => setInstructorFilter('')}` | `instructorFilter` |  |  | CourseBuilder · l.502 |
| «Anterior» | `{() => handlePageChange(currentPage - 1)}` |  | `{currentPage === 1 \|\| loading}` |  | CourseBuilder · l.522 |
| «Siguiente» | `{() => handlePageChange(currentPage + 1)}` |  | `{currentPage >= totalPages \|\| loading}` |  | CourseBuilder · l.532 |
| «Agregar Nuevo Curso Haz clic para expandir el formulario / Completa el formulario para crear un nuevo curso» | `{() => setIsFormCollapsed(!isFormCollapsed)}` |  |  |  | CourseBuilder · l.544 |
| «Limpiar búsqueda» | `{() => setSearchQuery('')}` | `!(courses.length === 0) && filterCourses(courses).length === 0` |  |  | CourseBuilder · l.592 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ir al Panel» | `/dashboard` | `userRole !== null && userRole !== 'admin'` |  | CourseBuilder · l.453 |
| «Ir al Panel» |  | `userRole !== null && userRole !== 'admin'` |  | CourseBuilder · l.454 |
| «Crear Nuevo Curso» | `/admin/course-builder/new` | `courses.length === 0` |  | CourseBuilder · l.578 |
| «Crear Nuevo Curso» |  | `courses.length === 0` |  | CourseBuilder · l.579 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «Todos los instructores», «(lista) {name}» |  |  | CourseBuilder · l.489 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `DeleteCourseModal` | component | `{isDeleteModalOpen}` |  | CourseBuilder · l.624 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error inesperado al cargar cursos» |  | CourseBuilder · l.189 |
| error | «No se ha seleccionado ningún curso para eliminar.» | `!selectedCourseForDeletion` | handleConfirmDelete · l.251 |
| loading | «Eliminando curso...» |  | handleConfirmDelete · l.258 |
| success | «Curso eliminado exitosamente» |  | handleConfirmDelete · l.403 |
| error | «Error al eliminar: {error.message}» |  | handleConfirmDelete · l.409 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar los cursos» | `throw (shown by whoever catches it)` | `!response.ok` | CourseBuilder · l.167 |
| «Error al eliminar el curso principal.» | `throw (shown by whoever catches it)` | `deleteCourseError` | handleConfirmDelete · l.399 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | CourseBuilder · l.75 |
| `/admin/courses/[*]/assign` | `router.push` |  | handleOpenAssignModal · l.245 |
| `/login` | `router.push` |  | handleLogout · l.420 |
| `/admin/course-builder/[*]` | `router.push` | `!(courses.length === 0) && !(filterCourses(courses).length === 0) && each filterCourses(courses)` | CourseBuilder · l.613 |
| `/student/course/[*]` | `router.push` | `!(courses.length === 0) && !(filterCourses(courses).length === 0) && each filterCourses(courses)` | CourseBuilder · l.614 |
| `/admin/courses/[*]/assign` | `router.push` | `!(courses.length === 0) && !(filterCourses(courses).length === 0) && each filterCourses(courses)` | CourseBuilder · l.615 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `adminInMetadata = metadataHasRole(session.user.user_metadata, 'admin')` | CourseBuilder · l.98 |
| `isAdmin = adminInMetadata \|\| hasAdminRoleInDB` | CourseBuilder · l.109 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `userRole !== null && userRole !== 'admin'` |  | CourseBuilder · l.440 |
| `MainLayout` |  |  |  | CourseBuilder · l.465 |
| `ResponsiveFunctionalPageHeader` | title: Gestor de Cursos · subtitle: {totalCourses} curso{totalCourses !== 1 ? 's' : …} creado{totalCourses !== 1 ? 's' : …} · searchPlaceholder: Buscar cursos... |  |  | CourseBuilder · l.474 |
| `CourseBuilderForm` |  | `!isFormCollapsed` |  | CourseBuilder · l.559 |
| `AdminCourseCard` |  | `!(courses.length === 0) && !(filterCourses(courses).length === 0) && each filterCourses(courses)` |  | CourseBuilder · l.602 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.418 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.419 |

**Other texts on screen** (7)

- «Cargando...» — CourseBuilder · l.432, when `loading \|\| user === undefined`
- «No tienes permiso para acceder a esta página.» — CourseBuilder · l.452, when `userRole !== null && userRole !== 'admin'`
- «Filtrar por instructor» — CourseBuilder · l.486
- «Mostrando {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(totalCourses, (currentPage…} de {totalCourses}» — CourseBuilder · l.514
- «Página {currentPage} de {totalPages}» — CourseBuilder · l.529
- «¡Comienza creando tu primer curso!» — CourseBuilder · l.576, when `courses.length === 0`
- «Intenta con otros términos de búsqueda» — CourseBuilder · l.591, when `!(courses.length === 0) && filterCourses(courses).length === 0`

**Reads and writes the database directly:** `table:blocks` (delete), `table:courses` (delete), `table:lesson_assignments` (delete), `table:lessons` (delete, select), `table:modules` (delete, select), `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/DeleteCourseModal.tsx`
- `components/courses/AdminCourseCard.tsx`
- `components/courses/CourseThumbnail.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `src/components/CourseBuilderForm.tsx`
- `types/roles.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/courses` | GET | `pages/admin/course-builder/index.tsx:165` |
| `/api/admin/get-instructors` | GET | `src/components/CourseBuilderForm.tsx:37` |

## /admin/course-builder/new

File `pages/admin/course-builder/new.tsx` · 390 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.38 `router.push → /login  (when !session?.user)`
  - l.49 `router.push → /  (when userError)`
  - l.54 `adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin')`
  - l.65 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.75 `router.push → /dashboard  (when !adminRole && !adminFromProfile)`
  - l.89 `router.push → /login`
  - l.223 `router.push → /login`
- Linked from: `pages/admin/course-builder/index.tsx:578`, `pages/api/qa/seed-codebase-index.ts:97`
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

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Crear Nuevo Curso» | h1 |  | NewCourse · l.253 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «← Volver» | `{() => router.back()}` |  |  |  | NewCourse · l.254 |
| «Crear Curso» (submits the form) |  |  |  |  | NewCourse · l.377 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del Curso *» | text | «Ej: Introducción a la Educación Relacional» · required |  |  | `id=title (id used by code)` | NewCourse · l.267 |
| «Descripción *» | textarea | «Describe el contenido y objetivos del curso...» · required |  |  | `id=description (id used by code)` | NewCourse · l.282 |
| «Simple Las lecciones se organizan directamente en el curso sin módulos. Ideal para cursos cortos (1-5 lecciones).» | radio | `structure` |  |  | `id=structure-simple (id used by code)` | NewCourse · l.299 |
| «Estructurado Las lecciones se organizan en módulos. Ideal para cursos completos con múltiples temas.» | radio | `structure` |  |  | `id=structure-structured (id used by code)` | NewCourse · l.317 |
| «Instructor» | select | disabled: `{loadingInstructors}` | «Selecciona un instructor», «(lista) {inst.full_name}» |  | `id=instructor (id used by code)` | NewCourse · l.341 |
| «Imagen de Portada» | file | accepts `image/*` |  |  | `id=thumbnail (id used by code)` | NewCourse · l.364 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | NewCourse · l.262 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Por favor completa el título y la descripción.» | `!title \|\| !description` | handleSubmit · l.122 |
| error | «Error al subir la imagen: {uploadError.message}» | `thumbnail && uploadError` | handleSubmit · l.150 |
| error | «Error de seguridad: No tienes permisos para crear cursos. / Esto puede ser debido a políticas de Row Level Security (RLS) / en la tabla "courses". Contacta al administrador.» | `error && error.message.includes('violates row-level security policy')` | handleSubmit · l.189 |
| error | «Error al crear el curso: {error.message}» | `error && !(error.message.includes('violates row-level security policy'))` | handleSubmit · l.195 |
| success | «Curso creado exitosamente» |  | handleSubmit · l.202 |
| error | «Error: {err.message \|\| 'Error desco…}» |  | handleSubmit · l.209 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No active session. Please login again.» | `throw (shown by whoever catches it)` | `!session` | handleSubmit · l.131 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAdminAccess · l.38 |
| `/` | `router.push` | `userError` | checkAdminAccess · l.49 |
| `/dashboard` | `router.push` | `!adminRole && !adminFromProfile` | checkAdminAccess · l.75 |
| `/login` | `router.push` |  | checkAdminAccess · l.89 |
| `/admin/course-builder` | `router.push` |  | handleSubmit · l.205 |
| `/login` | `router.push` |  | handleLogout · l.223 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin')` | checkAdminAccess · l.54 |
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAdminAccess · l.65 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Crear Nuevo Curso · breadcrumbs: Cursos / Crear Nuevo Curso |  |  | NewCourse · l.238 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Error desconocido al crear el curso» | NewCourse · l.209 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.221 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.222 |

**Other texts on screen** (10)

- «Verificando permisos...» — NewCourse · l.231, when `loading`
- «Título del Curso *» (label) — NewCourse · l.264
- «Descripción *» (label) — NewCourse · l.279
- «Estructura del Curso *» (label) — NewCourse · l.294
- «Simple Las lecciones se organizan directamente en el curso sin módulos. Ideal para cursos cortos (1-5 lecciones).» (label) — NewCourse · l.308
- «Estructurado Las lecciones se organizan en módulos. Ideal para cursos completos con múltiples temas.» (label) — NewCourse · l.326
- «Instructor» (label) — NewCourse · l.338
- «Cargando instructores...» — NewCourse · l.356, when `loadingInstructors`
- «Imagen de Portada» (label) — NewCourse · l.361
- «Recomendado: Imagen en formato 4:3 (400x300px). Máximo 2MB.» — NewCourse · l.372

**Reads and writes the database directly:** `bucket:course-assets` (upload), `table:courses` (insert, select), `table:instructors` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/roleUtils.ts`

## /admin/courses/[id]/assign

File `pages/admin/courses/[id]/assign.tsx` · 929 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.153 `router.push → /login  (when !session?.user)`
  - l.166 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.167 `hasAccess = ['admin', 'consultor'].includes(userRole)`
  - l.171 `router.push → /dashboard  (when !hasAccess)`
  - l.459 `router.push → /login`
- Linked from: `pages/admin/course-builder/index.tsx:245`, `pages/admin/course-builder/index.tsx:615`
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

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Asignar Curso» | h1 |  | AssignCourse · l.534 |
| «Asignados actualmente» | h3 |  | AssignCourse · l.552 |
| «Resumen de Asignacion» | h3 |  | AssignCourse · l.854 |

**Buttons** (12)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Cursos» | `{() => router.push('/admin/course-builder')}` |  |  |  | AssignCourse · l.526 |
| «Asignados actualmente {assignedUsers.length} [Cargando...]» | `{() => setAssignedSectionExpanded(!assignedSectionExpanded)}` |  |  |  | AssignCourse · l.547 |
| «Cancelar» | `{clearUnassignSelection}` | `assignedSectionExpanded && !(assignedUsers.length === 0) && selectedToUnassign.size > 0` |  |  | AssignCourse · l.615 |
| «Desasignar ( {selectedToUnassign.size} )» | `{() => handleBatchUnassign(Array.from(selectedToUnassign))}` | `assignedSectionExpanded && !(assignedUsers.length === 0) && selectedToUnassign.size > 0` | `{unassigning}` |  | AssignCourse · l.621 |
| «Seleccionar todos» | `{selectAllFilteredForUnassign}` | `assignedSectionExpanded && !(assignedUsers.length === 0) && !(selectedToUnassign.size > 0)` |  |  | AssignCourse · l.630 |
| «Desasignar» | `{(e) => { e.stopPropagation(); handleUnassign(user.id); }}` | `assignedSectionExpanded && !(assignedUsers.length === 0) && each filteredAssignedUsers` | `{unassigning}` |  | AssignCourse · l.665 |
| «Seleccionar todos» | `{selectAllUnassigned}` | `searchResults.length > 0 && searchResults.some(u => !u.isAlreadyAssigned)` |  |  | AssignCourse · l.751 |
| «Desasignar» | `{(e) => { e.preventDefault(); e.stopPropagation(); handleUnassign(user.id); }}` | `!(searching && searchResults.length === 0) && !(searchResults.length === 0) && each searchResults && user.isAlreadyAssigned` | `{unassigning}` |  | AssignCourse · l.821 |
| «[icon X]» | `{() => removeFromSelection(user.id)}` | `!(selectedUsers.length === 0) && each selectedUsers` |  |  | AssignCourse · l.881 |
| «Limpiar seleccion» | `{clearSelections}` | `!(selectedUsers.length === 0)` |  |  | AssignCourse · l.896 |
| «Asignando... / Confirmar Asignacion» | `{handleAssign}` |  | `{assigning \|\| selectedUsers.length === 0}` |  | AssignCourse · l.908 |
| «Cancelar» | `{() => router.push('/admin/course-builder')}` |  |  |  | AssignCourse · l.915 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{user.name} {user.email} [{user.school_name}] Desasignar» | `{() => toggleUnassignSelection(user.id)}` | `assignedSectionExpanded && !(assignedUsers.length === 0) && each filteredAssignedUsers` | AssignCourse · l.642 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Filtrar por Colegio» | select |  | «Todos los colegios ( {assignedUsers.length} )», «(lista) {schoolName} ( {count} )» | `assignedSectionExpanded && !(assignedUsers.length === 0) && assignedSchools.length > 0` | `id=assignedSchoolFilter (id used by code)` | AssignCourse · l.579 |
|  | checkbox |  |  | `assignedSectionExpanded && !(assignedUsers.length === 0) && each filteredAssignedUsers` |  | AssignCourse · l.650 |
| «Filtrar por Colegio» | select |  | «Todos los colegios», «(lista) {school.name}» |  | `id=schoolFilter (id used by code)` | AssignCourse · l.693 |
| «Filtrar por Comunidad de Crecimiento» | select |  | «Todas las comunidades», «(lista) {community.name}» | `selectedSchool && filteredCommunities.length > 0` | `id=communityFilter (id used by code)` | AssignCourse · l.714 |
| «Buscar usuarios por nombre o email...» | text | «Buscar usuarios por nombre o email...» |  |  |  | AssignCourse · l.736 |
| «{user.name} {user.email} [{user.school_name} [·] {user.community_name}] [Asignado Desasignar]» | checkbox | disabled: `{user.isAlreadyAssigned}` |  | `!(searching && searchResults.length === 0) && !(searchResults.length === 0) && each searchResults` |  | AssignCourse · l.792 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onScroll={handleScroll}` |  | AssignCourse · l.762 |

**Toasts** (10)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para asignar cursos» | `!hasAccess` | checkAuthAndLoadCourse · l.170 |
| error | «Error al cargar los datos» |  | checkAuthAndLoadCourse · l.198 |
| error | «Error al buscar» |  | searchAssignees · l.246 |
| error | «Debes seleccionar al menos un usuario» | `selectedUsers.length === 0` | handleAssign · l.293 |
| loading | «Asignando curso...» |  | handleAssign · l.298 |
| success | «Curso asignado exitosamente: {result.assignments_created} asignaciones creadas{result.assignments_skipped …}» |  | handleAssign · l.321 |
| error | «Error al asignar el curso» |  | handleAssign · l.342 |
| loading | «Desasignando curso... / Desasignando {userIds.length} usuarios...» |  | handleBatchUnassign · l.357 |
| success | «Curso desasignado exitosamente / {userIds.length} usuarios desasignados exitosamente» |  | handleBatchUnassign · l.380 |
| error | «Error al desasignar el curso» |  | handleBatchUnassign · l.399 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to load course» | `throw (shown by whoever catches it)` | `!courseResponse.ok` | checkAuthAndLoadCourse · l.184 |
| «Failed to search assignees» | `throw (shown by whoever catches it)` | `!response.ok` | searchAssignees · l.231 |
| «Failed to assign course» | `throw (shown by whoever catches it)` | `!response.ok` | handleAssign · l.316 |
| «Failed to unassign course» | `throw (shown by whoever catches it)` | `!response.ok` | handleBatchUnassign · l.375 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuthAndLoadCourse · l.153 |
| `/dashboard` | `router.push` | `!hasAccess` | checkAuthAndLoadCourse · l.171 |
| `/admin/course-builder` | `router.push` |  | checkAuthAndLoadCourse · l.199 |
| `/login` | `router.push` |  | handleLogout · l.459 |
| `/admin/course-builder` | `router.push` |  | AssignCourse · l.527 |
| `/admin/course-builder` | `router.push` |  | AssignCourse · l.916 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAuthAndLoadCourse · l.166 |
| `hasAccess = ['admin', 'consultor'].includes(userRole)` | checkAuthAndLoadCourse · l.167 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!scrollRef.current \|\| !hasMore \|\| searching` | AssignCourse · l.253 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Asignar: {course.title} · breadcrumbs: Panel / Cursos / Asignar |  |  | AssignCourse · l.503 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Unknown error» | AssignCourse · l.229 |
| «Bearer {token}» | AssignCourse · l.433 |
| «Sin nombre» | AssignCourse · l.445 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (6)

- `{course.title}` — AssignCourse · l.538
- `{user.name}` — AssignCourse · l.658, when `assignedSectionExpanded && !(assignedUsers.length === 0) && each filteredAssignedUsers`
- `{user.email}` — AssignCourse · l.659, when `assignedSectionExpanded && !(assignedUsers.length === 0) && each filteredAssignedUsers`
- `{user.school_name}` — AssignCourse · l.661, when `assignedSectionExpanded && !(assignedUsers.length === 0) && each filteredAssignedUsers && user.school_name`
- `{user.name}` — AssignCourse · l.873, when `!(selectedUsers.length === 0) && each selectedUsers`
- `{user.email}` — AssignCourse · l.876, when `!(selectedUsers.length === 0) && each selectedUsers`

**Other texts on screen** (16)

- «Cargando...» — AssignCourse · l.496, when `loading \|\| !course`
- «Asignar Curso» — AssignCourse · l.517
- «Asignando:» — AssignCourse · l.538
- «Total asignados: {totalAssigned}» — AssignCourse · l.540
- «No hay usuarios asignados.» — AssignCourse · l.570, when `assignedSectionExpanded && assignedUsers.length === 0`
- «Filtrar por Colegio» (label) — AssignCourse · l.576, when `assignedSectionExpanded && !(assignedUsers.length === 0) && assignedSchools.length > 0`
- «Mostrando {filteredAssignedUsers.length} de {assignedUsers.length} usuarios» — AssignCourse · l.602, when `assignedSectionExpanded && !(assignedUsers.length === 0) && assignedSchoolFilter`
- «{selectedToUnassign.size} seleccionado(s)» — AssignCourse · l.607, when `assignedSectionExpanded && !(assignedUsers.length === 0) && selectedToUnassign.size > 0`
- «Filtrar por Colegio» (label) — AssignCourse · l.690
- «Filtrar por Comunidad de Crecimiento» (label) — AssignCourse · l.711, when `selectedSchool && filteredCommunities.length > 0`
- «{searchResults.filter(u => !u.isAlre…} usuario(s) disponible(s) para asignar» — AssignCourse · l.748, when `searchResults.length > 0 && searchResults.some(u => !u.isAlreadyAssigned)`
- «Buscando usuarios...» — AssignCourse · l.770, when `searching && searchResults.length === 0`
- «No se encontraron usuarios / Ingresa un termino de busqueda» — AssignCourse · l.773, when `!(searching && searchResults.length === 0) && searchResults.length === 0`
- «{user.name} {user.email} [{user.school_name} [·] {user.community_name}] [Asignado Desasignar]» (label) — AssignCourse · l.781, when `!(searching && searchResults.length === 0) && !(searchResults.length === 0) && each searchResults`
- «No has seleccionado ningun usuario» — AssignCourse · l.860, when `selectedUsers.length === 0`
- «{selectedUsers.length} usuario s» — AssignCourse · l.893, when `!(selectedUsers.length === 0)`

**Reads and writes the database directly:** `table:growth_communities` (select), `table:profiles` (select), `table:schools` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `hooks/useDebounce.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/course-assignments` | GET | `pages/admin/courses/[id]/assign.tsx:432` |
| `/api/courses/[id]` | GET | `pages/admin/courses/[id]/assign.tsx:182` |
| `/api/courses/batch-assign` | POST | `pages/admin/courses/[id]/assign.tsx:303` |
| `/api/courses/search-assignees` | POST | `pages/admin/courses/[id]/assign.tsx:213` |
| `/api/courses/unassign` | DELETE | `pages/admin/courses/[id]/assign.tsx:362` |

## /admin/learning-paths

File `pages/admin/learning-paths.tsx` · 306 lines · frame: MainLayout

### Who reaches it

- Menu: Cursos › «Rutas de Aprendizaje» → `/admin/learning-paths` — admin only; the group: admin only (`Sidebar.tsx` l.260)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.44 `router.push → /login  (when !session?.user)`
  - l.57 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.58 `hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole)`
  - l.62 `router.push → /dashboard  (when !hasAccess)`
  - l.77 `router.push → /login`
  - l.139 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:262`, `pages/admin/learning-paths/[id]/assign.tsx:192`, `pages/admin/learning-paths/[id]/assign.tsx:461`, `pages/admin/learning-paths/[id]/assign.tsx:479`, `pages/admin/learning-paths/[id]/assign.tsx:845`, `pages/admin/learning-paths/[id]/edit.tsx:115`, `pages/admin/learning-paths/[id]/edit.tsx:133`, `pages/admin/learning-paths/[id]/edit.tsx:227`, `pages/admin/learning-paths/[id]/edit.tsx:260`, `pages/admin/learning-paths/[id]/edit.tsx:275`, `pages/admin/learning-paths/[id]/edit.tsx:460`, `pages/admin/learning-paths/new.tsx:112` and 4 more
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 3, community_manager 1, equipo_directivo 1.

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

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «No hay rutas de aprendizaje» | h3 | `learningPaths.length === 0` | AdminLearningPaths · l.196 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Crear Primera Ruta» | `{() => router.push('/admin/learning-paths/new')}` | `learningPaths.length === 0` |  |  | AdminLearningPaths · l.202 |
| «[icon TrashIcon]» | `{() => openDeleteModal(path)}` | `!(learningPaths.length === 0) && each learningPaths` |  |  | AdminLearningPaths · l.275 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon PencilIcon]» | `/admin/learning-paths/[*]/edit` | `!(learningPaths.length === 0) && each learningPaths` |  | AdminLearningPaths · l.265 |
| «[icon PencilIcon]» |  | `!(learningPaths.length === 0) && each learningPaths` |  | AdminLearningPaths · l.266 |
| «[icon UserGroupIcon]» | `/admin/learning-paths/[*]/assign` | `!(learningPaths.length === 0) && each learningPaths` |  | AdminLearningPaths · l.270 |
| «[icon UserGroupIcon]» |  | `!(learningPaths.length === 0) && each learningPaths` |  | AdminLearningPaths · l.271 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | `!(learningPaths.length === 0)` | AdminLearningPaths · l.215 |
| «Descripción» | `!(learningPaths.length === 0)` | AdminLearningPaths · l.218 |
| «Cursos» | `!(learningPaths.length === 0)` | AdminLearningPaths · l.221 |
| «Asignados» | `!(learningPaths.length === 0)` | AdminLearningPaths · l.224 |
| «Creado por» | `!(learningPaths.length === 0)` | AdminLearningPaths · l.227 |
| «Acciones» | `!(learningPaths.length === 0)` | AdminLearningPaths · l.230 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmModal` | component | `{deleteModalOpen}` | title: Eliminar Ruta de Aprendizaje · message: ¿Estás seguro de que deseas eliminar la ruta "{pathToDelete?.name}"? Esta acción eliminará todas las asignaciones y no se puede deshacer. · confirmText: Eliminar · cancelText: Cancelar | AdminLearningPaths · l.293 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para acceder a esta página» | `!hasAccess` | checkAuthAndLoadData · l.61 |
| error | «Error al cargar las rutas de aprendizaje» |  | loadLearningPaths · l.99 |
| loading | «Eliminando ruta de aprendizaje...» |  | handleDelete · l.107 |
| success | «Ruta de aprendizaje eliminada exitosamente» |  | handleDelete · l.122 |
| error | «Error al eliminar la ruta de aprendizaje» |  | handleDelete · l.131 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch learning paths» | `throw (shown by whoever catches it)` | `!response.ok` | loadLearningPaths · l.92 |
| «Failed to delete learning path» | `throw (shown by whoever catches it)` | `!response.ok` | handleDelete · l.119 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuthAndLoadData · l.44 |
| `/dashboard` | `router.push` | `!hasAccess` | checkAuthAndLoadData · l.62 |
| `/login` | `router.push` |  | checkAuthAndLoadData · l.77 |
| `/login` | `router.push` |  | handleLogout · l.139 |
| `/admin/learning-paths/new` | `router.push` |  | AdminLearningPaths · l.186 |
| `/admin/learning-paths/new` | `router.push` | `learningPaths.length === 0` | AdminLearningPaths · l.203 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAuthAndLoadData · l.57 |
| `hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole)` | checkAuthAndLoadData · l.58 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Rutas de Aprendizaje · breadcrumbs: Panel / Rutas de Aprendizaje |  |  | AdminLearningPaths · l.164 |
| `ResponsiveFunctionalPageHeader` | title: Rutas de Aprendizaje · subtitle: Crea y gestiona rutas de aprendizaje personalizadas · primaryAction: Crear Nueva Ruta |  |  | AdminLearningPaths · l.180 |

**Values shown from data** (2)

- `{path.name}` — AdminLearningPaths · l.239, when `!(learningPaths.length === 0) && each learningPaths`
- `{path.description}` — AdminLearningPaths · l.244, when `!(learningPaths.length === 0) && each learningPaths`

**Other texts on screen** (6)

- «Cargando...» — AdminLearningPaths · l.157, when `loading`
- «Rutas de Aprendizaje - Administración» — AdminLearningPaths · l.177
- «Comienza creando tu primera ruta de aprendizaje para guiar a los estudiantes.» — AdminLearningPaths · l.200, when `learningPaths.length === 0`
- «{path.course_count} cursos» — AdminLearningPaths · l.249, when `!(learningPaths.length === 0) && each learningPaths`
- «{path.assignment_count} usuarios» — AdminLearningPaths · l.254, when `!(learningPaths.length === 0) && each learningPaths`
- «{path.created_by_name} / Desconocido» — AdminLearningPaths · l.259, when `!(learningPaths.length === 0) && each learningPaths`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/common/ConfirmModal.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/learning-paths` | GET | `pages/admin/learning-paths.tsx:85` |
| `/api/learning-paths/[id]` | DELETE | `pages/admin/learning-paths.tsx:110` |

## /admin/learning-paths/[id]/assign

File `pages/admin/learning-paths/[id]/assign.tsx` · 857 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.146 `router.push → /login  (when !session?.user)`
  - l.159 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.160 `hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole)`
  - l.164 `router.push → /dashboard  (when !hasAccess)`
  - l.437 `router.push → /login`
- Linked from: `pages/admin/learning-paths.tsx:270`
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

### What the page file itself draws

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Asignar Ruta de Aprendizaje» | h1 |  | AssignLearningPath · l.486 |
| «Resumen de Asignación» | h3 |  | AssignLearningPath · l.772 |

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Rutas de Aprendizaje» | `{() => router.push('/admin/learning-paths')}` |  |  |  | AssignLearningPath · l.478 |
| «Usuarios ( {totalAssignedUsers} )» | `{() => setActiveTab('users')}` |  |  |  | AssignLearningPath · l.497 |
| «Grupos ( {totalAssignedGroups} )» | `{() => setActiveTab('groups')}` |  |  |  | AssignLearningPath · l.508 |
| «Desasignar» | `{(e) => { e.preventDefault(); e.stopPropagation(); handleUnassign(user.id); }}` | `!(searchingUsers && userSearchResults.length === 0) && !(userSearchResults.length === 0) && each userSearchResults && user.isAlreadyAssigned` | `{unassigning}` |  | AssignLearningPath · l.613 |
| «Desasignar» | `{(e) => { e.preventDefault(); e.stopPropagation(); handleUnassign(undefined, gro…}` | `!(searchingGroups && groupSearchResults.length === 0) && !(groupSearchResults.length === 0) && each groupSearchResults && group.isAlreadyAssigned` | `{unassigning}` |  | AssignLearningPath · l.736 |
| «[icon X]» | `{() => removeFromSelection(assignee.id, assignee.type)}` | `!(selectedAssignees.length === 0) && each selectedAssignees` |  |  | AssignLearningPath · l.805 |
| «Limpiar selección» | `{clearSelections}` | `!(selectedAssignees.length === 0)` |  |  | AssignLearningPath · l.825 |
| «Asignando... / Confirmar Asignación» | `{handleAssign}` |  | `{assigning \|\| selectedAssignees.length === 0}` |  | AssignLearningPath · l.837 |
| «Cancelar» | `{() => router.push('/admin/learning-paths')}` |  |  |  | AssignLearningPath · l.844 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Filtrar por Colegio» | select |  | «Todos los colegios», «(lista) {school.name}» | `activeTab === 'users'` | `id=userSchoolFilter (id used by code)` | AssignLearningPath · l.531 |
| «Buscar usuarios por nombre o email...» | text | «Buscar usuarios por nombre o email...» |  | `activeTab === 'users'` |  | AssignLearningPath · l.551 |
| «{user.name} {user.email} [Asignado Desasignar]» | checkbox | disabled: `{user.isAlreadyAssigned}` |  | `activeTab === 'users' && !(searchingUsers && userSearchResults.length === 0) && !(userSearchResults.length === 0) && each userSearchResults` |  | AssignLearningPath · l.591 |
| «Filtrar por Colegio» | select |  | «Todos los colegios», «(lista) {school.name}» | `!(activeTab === 'users')` | `id=groupSchoolFilter (id used by code)` | AssignLearningPath · l.648 |
| «Buscar grupos por nombre...» | text | «Buscar grupos por nombre...» |  | `!(activeTab === 'users')` |  | AssignLearningPath · l.668 |
| «{group.name} [{group.description}] {group.member_count} miembros [Asignado Desasignar]» | checkbox | disabled: `{group.isAlreadyAssigned}` |  | `!(activeTab === 'users') && !(searchingGroups && groupSearchResults.length === 0) && !(groupSearchResults.length === 0) && each groupSearchResults` |  | AssignLearningPath · l.708 |

**Other gestures (keys, hover, drag, blur)** (2)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onScroll={() => handleScroll('users')}` | `activeTab === 'users'` | AssignLearningPath · l.561 |
| `div` | `onScroll={() => handleScroll('groups')}` | `!(activeTab === 'users')` | AssignLearningPath · l.678 |

**Toasts** (10)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para asignar rutas de aprendizaje» | `!hasAccess` | checkAuthAndLoadPath · l.163 |
| error | «Error al cargar los datos» |  | checkAuthAndLoadPath · l.191 |
| error | «Error al buscar» |  | searchAssignees · l.271 |
| error | «Debes seleccionar al menos un usuario o grupo» | `selectedAssignees.length === 0` | handleAssign · l.327 |
| loading | «Asignando ruta de aprendizaje...» |  | handleAssign · l.332 |
| success | «Ruta asignada exitosamente: {result.assignments_created} asignaciones creadas{result.assignments_skipped …}» |  | handleAssign · l.357 |
| error | «Error al asignar la ruta de aprendizaje» |  | handleAssign · l.380 |
| loading | «Desasignando ruta de aprendizaje...» |  | handleUnassign · l.390 |
| success | «Ruta desasignada exitosamente: {result.unassigned_count} desasignaciones» |  | handleUnassign · l.412 |
| error | «Error al desasignar la ruta de aprendizaje» |  | handleUnassign · l.429 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to load learning path» | `throw (shown by whoever catches it)` | `!pathResponse.ok` | checkAuthAndLoadPath · l.177 |
| «Failed to search assignees» | `throw (shown by whoever catches it)` | `!response.ok` | searchAssignees · l.256 |
| «Failed to assign learning path» | `throw (shown by whoever catches it)` | `!response.ok` | handleAssign · l.352 |
| «Failed to unassign learning path» | `throw (shown by whoever catches it)` | `!response.ok` | handleUnassign · l.407 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuthAndLoadPath · l.146 |
| `/dashboard` | `router.push` | `!hasAccess` | checkAuthAndLoadPath · l.164 |
| `/admin/learning-paths` | `router.push` |  | checkAuthAndLoadPath · l.192 |
| `/login` | `router.push` |  | handleLogout · l.437 |
| `/admin/learning-paths` | `router.push` |  | AssignLearningPath · l.479 |
| `/admin/learning-paths` | `router.push` |  | AssignLearningPath · l.845 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAuthAndLoadPath · l.159 |
| `hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole)` | checkAuthAndLoadPath · l.160 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!scrollRef.current \|\| !hasMore \|\| isSearching` | AssignLearningPath · l.285 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Asignar: {learningPath.name} · breadcrumbs: Panel / Rutas de Aprendizaje / Asignar |  |  | AssignLearningPath · l.455 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Unknown error» | AssignLearningPath · l.249 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (3)

- `{learningPath.name}` — AssignLearningPath · l.490
- `{assignee.name}` — AssignLearningPath · l.795, when `!(selectedAssignees.length === 0) && each selectedAssignees`
- `{assignee.email}` — AssignLearningPath · l.799, when `!(selectedAssignees.length === 0) && each selectedAssignees && assignee.email`

**Other texts on screen** (14)

- «Cargando...» — AssignLearningPath · l.445, when `loading \|\| !learningPath`
- «Asignar Ruta de Aprendizaje» — AssignLearningPath · l.469
- «Asignando:» — AssignLearningPath · l.490
- «Filtrar por Colegio» (label) — AssignLearningPath · l.528, when `activeTab === 'users'`
- «Buscando usuarios...» — AssignLearningPath · l.569, when `activeTab === 'users' && searchingUsers && userSearchResults.length === 0`
- «No se encontraron usuarios / Ingresa un término de búsqueda» — AssignLearningPath · l.572, when `activeTab === 'users' && !(searchingUsers && userSearchResults.length === 0) && userSearchResults.length === 0`
- «{user.name} {user.email} [Asignado Desasignar]» (label) — AssignLearningPath · l.580, when `activeTab === 'users' && !(searchingUsers && userSearchResults.length === 0) && !(userSearchResults.length === 0) && each userSearchResults`
- «Filtrar por Colegio» (label) — AssignLearningPath · l.645, when `!(activeTab === 'users')`
- «Buscando grupos...» — AssignLearningPath · l.686, when `!(activeTab === 'users') && searchingGroups && groupSearchResults.length === 0`
- «No se encontraron grupos / Ingresa un término de búsqueda» — AssignLearningPath · l.689, when `!(activeTab === 'users') && !(searchingGroups && groupSearchResults.length === 0) && groupSearchResults.length === 0`
- «{group.name} [{group.description}] {group.member_count} miembros [Asignado Desasignar]» (label) — AssignLearningPath · l.697, when `!(activeTab === 'users') && !(searchingGroups && groupSearchResults.length === 0) && !(groupSearchResults.length === 0) && each groupSearchResults`
- «No has seleccionado ningún usuario o grupo» — AssignLearningPath · l.778, when `selectedAssignees.length === 0`
- «{selectedUserCount} usuario s» — AssignLearningPath · l.818, when `!(selectedAssignees.length === 0) && selectedUserCount > 0`
- «{selectedGroupCount} grupo s» — AssignLearningPath · l.821, when `!(selectedAssignees.length === 0) && selectedGroupCount > 0`

**Reads and writes the database directly:** `table:learning_path_assignments` (select), `table:profiles` (select), `table:schools` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `hooks/useDebounce.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/learning-paths/[id]` | GET | `pages/admin/learning-paths/[id]/assign.tsx:175` |
| `/api/learning-paths/batch-assign` | POST | `pages/admin/learning-paths/[id]/assign.tsx:338` |
| `/api/learning-paths/search-assignees` | POST | `pages/admin/learning-paths/[id]/assign.tsx:233` |
| `/api/learning-paths/unassign` | DELETE | `pages/admin/learning-paths/[id]/assign.tsx:393` |

## /admin/learning-paths/[id]/edit

File `pages/admin/learning-paths/[id]/edit.tsx` · 479 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.72 `router.push → /login  (when !session?.user)`
  - l.85 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.86 `hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole)`
  - l.90 `router.push → /dashboard  (when !hasAccess)`
  - l.239 `router.push → /login`
- Linked from: `pages/admin/learning-paths.tsx:265`
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

### What the page file itself draws

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Ruta de Aprendizaje» | h1 |  | EditLearningPath · l.282 |
| «Cursos Disponibles» | h2 |  | EditLearningPath · l.294 |
| «{course.title}» | h3 | `!(filteredCourses.length === 0) && each filteredCourses` | EditLearningPath · l.331 |
| «Detalles de la Ruta» | h2 |  | EditLearningPath · l.351 |
| «Cursos en la Ruta ( {selectedCourses.length} )» | h3 |  | EditLearningPath · l.388 |
| «{course.course_title}» | h4 | `!(selectedCourses.length === 0) && each selectedCourses` | EditLearningPath · l.433 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Rutas de Aprendizaje» | `{() => router.push('/admin/learning-paths')}` |  |  |  | EditLearningPath · l.274 |
| «[icon XIcon]» | `{() => handleRemoveCourse(course.course_id)}` | `!(selectedCourses.length === 0) && each selectedCourses` |  |  | EditLearningPath · l.439 |
| «Cancelar» | `{() => router.push('/admin/learning-paths')}` |  |  |  | EditLearningPath · l.459 |
| «Guardando... / Guardar Cambios» | `{handleSave}` |  | `{saving \|\| !name \|\| !description \|\| selectedCourses.length === 0}` |  | EditLearningPath · l.465 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{course.title} {course.description} [✓ Agregado a la ruta]» | `{() => !isSelected && handleAddCourse(course)}` | `!(filteredCourses.length === 0) && each filteredCourses` | EditLearningPath · l.322 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar cursos...» | text | «Buscar cursos...» |  |  |  | EditLearningPath · l.303 |
| «Nombre de la Ruta *» | text | «Ej: Introducción a la Docencia» |  |  | `id=name (id used by code)` | EditLearningPath · l.361 |
| «Descripción *» | textarea | «Describe el objetivo y contenido de esta ruta de aprendizaje...» |  |  | `id=description (id used by code)` | EditLearningPath · l.375 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `DragDropContext` | `onDragEnd={handleDragEnd}` | `!(selectedCourses.length === 0)` | EditLearningPath · l.399 |

**Toasts** (11)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para editar rutas de aprendizaje» | `!hasAccess` | checkAuthAndLoadData · l.89 |
| error | «Solo puedes editar tus propias rutas de aprendizaje» | `userRole !== 'admin' && pathData.created_by !== session.user.id` | checkAuthAndLoadData · l.114 |
| error | «Error al cargar los datos» |  | checkAuthAndLoadData · l.132 |
| error | «Este curso ya está en la ruta» | `selectedCourses.find(c => c.course_id === course.id)` | handleAddCourse · l.142 |
| success | «"{course.title}" agregado a la ruta» |  | handleAddCourse · l.154 |
| error | «El nombre es requerido» | `!name.trim()` | handleSave · l.187 |
| error | «La descripción es requerida» | `!description.trim()` | handleSave · l.192 |
| error | «Debes agregar al menos un curso a la ruta» | `selectedCourses.length === 0` | handleSave · l.197 |
| loading | «Actualizando ruta de aprendizaje...» |  | handleSave · l.202 |
| success | «Ruta de aprendizaje actualizada exitosamente» |  | handleSave · l.226 |
| error | «Error al actualizar la ruta de aprendizaje» |  | handleSave · l.231 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to load learning path» | `throw (shown by whoever catches it)` | `!pathResponse.ok` | checkAuthAndLoadData · l.103 |
| «Failed to update learning path» | `throw (shown by whoever catches it)` | `!response.ok` | handleSave · l.223 |

**Moves to another page from code** (8)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuthAndLoadData · l.72 |
| `/dashboard` | `router.push` | `!hasAccess` | checkAuthAndLoadData · l.90 |
| `/admin/learning-paths` | `router.push` | `userRole !== 'admin' && pathData.created_by !== session.user.id` | checkAuthAndLoadData · l.115 |
| `/admin/learning-paths` | `router.push` |  | checkAuthAndLoadData · l.133 |
| `/admin/learning-paths` | `router.push` |  | handleSave · l.227 |
| `/login` | `router.push` |  | handleLogout · l.239 |
| `/admin/learning-paths` | `router.push` |  | EditLearningPath · l.275 |
| `/admin/learning-paths` | `router.push` |  | EditLearningPath · l.460 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAuthAndLoadData · l.85 |
| `hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole)` | checkAuthAndLoadData · l.86 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Editar: {learningPath.name} · breadcrumbs: Panel / Rutas de Aprendizaje / Editar |  |  | EditLearningPath · l.254 |
| `Droppable` | droppableId: selected-courses | `!(selectedCourses.length === 0)` |  | EditLearningPath · l.400 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (2)

- `{course.description}` — EditLearningPath · l.334, when `!(filteredCourses.length === 0) && each filteredCourses`
- `{course.sequence} .` — EditLearningPath · l.430, when `!(selectedCourses.length === 0) && each selectedCourses`

**Other texts on screen** (8)

- «Cargando...» — EditLearningPath · l.247, when `loading \|\| !learningPath`
- «Editar Ruta de Aprendizaje» — EditLearningPath · l.268
- «Modifica la secuencia de cursos para esta ruta de aprendizaje» — EditLearningPath · l.286
- «No se encontraron cursos» — EditLearningPath · l.316, when `filteredCourses.length === 0`
- «✓ Agregado a la ruta» — EditLearningPath · l.339, when `!(filteredCourses.length === 0) && each filteredCourses && isSelected`
- «Nombre de la Ruta *» (label) — EditLearningPath · l.358
- «Descripción *» (label) — EditLearningPath · l.372
- «Haz clic en los cursos de la izquierda para agregarlos a esta ruta» — EditLearningPath · l.395, when `selectedCourses.length === 0`

**Reads and writes the database directly:** `table:courses` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/learning-paths/[id]` | GET, PUT | `pages/admin/learning-paths/[id]/edit.tsx:101`, `pages/admin/learning-paths/[id]/edit.tsx:209` |

## /admin/learning-paths/new

File `pages/admin/learning-paths/new.tsx` · 456 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.70 `router.push → /login  (when !session?.user)`
  - l.83 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.84 `hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole)`
  - l.88 `router.push → /dashboard  (when !hasAccess)`
  - l.218 `router.push → /login`
- Linked from: `pages/admin/learning-paths.tsx:186`, `pages/admin/learning-paths.tsx:203`
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

### What the page file itself draws

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Crear Nueva Ruta de Aprendizaje» | h1 |  | NewLearningPath · l.261 |
| «Cursos Disponibles» | h2 |  | NewLearningPath · l.273 |
| «{course.title}» | h3 | `!(filteredCourses.length === 0) && each filteredCourses` | NewLearningPath · l.310 |
| «Detalles de la Ruta» | h2 |  | NewLearningPath · l.330 |
| «Cursos Seleccionados» | h3 |  | NewLearningPath · l.367 |
| «{course.title}» | h4 | `!(selectedCourses.length === 0) && each selectedCourses` | NewLearningPath · l.411 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Rutas de Aprendizaje» | `{() => router.push('/admin/learning-paths')}` |  |  |  | NewLearningPath · l.253 |
| «[icon XIcon]» | `{() => handleRemoveCourse(course.id)}` | `!(selectedCourses.length === 0) && each selectedCourses` |  |  | NewLearningPath · l.416 |
| «Cancelar» | `{() => router.push('/admin/learning-paths')}` |  |  |  | NewLearningPath · l.436 |
| «Guardando... / Guardar Ruta» | `{handleSave}` |  | `{saving \|\| !name \|\| !description \|\| selectedCourses.length === 0}` |  | NewLearningPath · l.442 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{course.title} {course.description} [✓ Agregado a la ruta]» | `{() => !isSelected && handleAddCourse(course)}` | `!(filteredCourses.length === 0) && each filteredCourses` | NewLearningPath · l.301 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar cursos...» | text | «Buscar cursos...» |  |  |  | NewLearningPath · l.282 |
| «Nombre de la Ruta *» | text | «Ej: Introducción a la Docencia» |  |  | `id=name (id used by code)` | NewLearningPath · l.340 |
| «Descripción *» | textarea | «Describe el objetivo y contenido de esta ruta de aprendizaje...» |  |  | `id=description (id used by code)` | NewLearningPath · l.354 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `DragDropContext` | `onDragEnd={handleDragEnd}` | `!(selectedCourses.length === 0)` | NewLearningPath · l.378 |

**Toasts** (10)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para crear rutas de aprendizaje» | `!hasAccess` | checkAuthAndLoadCourses · l.87 |
| error | «Error al cargar los datos» |  | checkAuthAndLoadCourses · l.111 |
| error | «Este curso ya está en la ruta» | `selectedCourses.find(c => c.id === course.id)` | handleAddCourse · l.121 |
| success | «"{course.title}" agregado a la ruta» |  | handleAddCourse · l.131 |
| error | «El nombre es requerido» | `!name.trim()` | handleSave · l.164 |
| error | «La descripción es requerida» | `!description.trim()` | handleSave · l.169 |
| error | «Debes agregar al menos un curso a la ruta» | `selectedCourses.length === 0` | handleSave · l.174 |
| loading | «Creando ruta de aprendizaje...» |  | handleSave · l.179 |
| success | «Ruta de aprendizaje creada exitosamente» |  | handleSave · l.205 |
| error | «Error al crear la ruta de aprendizaje» |  | handleSave · l.210 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to create learning path» | `throw (shown by whoever catches it)` | `!response.ok` | handleSave · l.200 |

**Moves to another page from code** (7)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuthAndLoadCourses · l.70 |
| `/dashboard` | `router.push` | `!hasAccess` | checkAuthAndLoadCourses · l.88 |
| `/admin/learning-paths` | `router.push` |  | checkAuthAndLoadCourses · l.112 |
| `/admin/learning-paths` | `router.push` |  | handleSave · l.206 |
| `/login` | `router.push` |  | handleLogout · l.218 |
| `/admin/learning-paths` | `router.push` |  | NewLearningPath · l.254 |
| `/admin/learning-paths` | `router.push` |  | NewLearningPath · l.437 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAuthAndLoadCourses · l.83 |
| `hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole)` | checkAuthAndLoadCourses · l.84 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Crear Ruta de Aprendizaje · breadcrumbs: Panel / Rutas de Aprendizaje / Crear Nueva |  |  | NewLearningPath · l.233 |
| `Droppable` | droppableId: selected-courses | `!(selectedCourses.length === 0)` |  | NewLearningPath · l.379 |

**Values shown from data** (2)

- `{course.description}` — NewLearningPath · l.313, when `!(filteredCourses.length === 0) && each filteredCourses`
- `{index + 1} .` — NewLearningPath · l.408, when `!(selectedCourses.length === 0) && each selectedCourses`

**Other texts on screen** (9)

- «Cargando...» — NewLearningPath · l.226, when `loading`
- «Crear Ruta de Aprendizaje» — NewLearningPath · l.247
- «Define una secuencia de cursos para guiar el aprendizaje de los estudiantes» — NewLearningPath · l.265
- «No se encontraron cursos» — NewLearningPath · l.295, when `filteredCourses.length === 0`
- «✓ Agregado a la ruta» — NewLearningPath · l.318, when `!(filteredCourses.length === 0) && each filteredCourses && isSelected`
- «Nombre de la Ruta *» (label) — NewLearningPath · l.337
- «Descripción *» (label) — NewLearningPath · l.351
- «Arrastra para reordenar los cursos.» — NewLearningPath · l.368
- «Haz clic en los cursos de la izquierda para agregarlos a esta ruta» — NewLearningPath · l.374, when `selectedCourses.length === 0`

**Reads and writes the database directly:** `table:courses` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/learning-paths` | POST | `pages/admin/learning-paths/new.tsx:186` |

## /admin/upcoming-courses

File `pages/admin/upcoming-courses/index.tsx` · 588 lines · frame: MainLayout

### Who reaches it

- Menu: Cursos › «Próximos Cursos» → `/admin/upcoming-courses` — admin only; the group: admin only (`Sidebar.tsx` l.253)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/layout/Sidebar.tsx:255`
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

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Próximos Cursos» | h1 |  | UpcomingCoursesAdmin · l.230 |
| «Vista previa (como se verá en el dashboard)» | h2 | `!(loading) && !(courses.length === 0)` | UpcomingCoursesAdmin · l.274 |
| «Gestionar Cursos ( {courses.length} )» | h2 | `!(loading) && !(courses.length === 0)` | UpcomingCoursesAdmin · l.290 |
| «Editar Curso Próximo / Nuevo Curso Próximo» | h3 | `showModal` · screen size: `sm:block` | UpcomingCoursesAdmin · l.432 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar Curso» | `{() => { resetForm(); setShowModal(true); }}` |  |  |  | UpcomingCoursesAdmin · l.235 |
| «Crear primer curso próximo» | `{() => { resetForm(); setShowModal(true); }}` | `!(loading) && courses.length === 0` |  |  | UpcomingCoursesAdmin · l.259 |
| «[icon EyeOff]» · tooltip «{course.is_active ? 'Desactivar' : 'Activar'}» | `{() => handleToggleActive(course)}` | `!(loading) && !(courses.length === 0) && each courses` |  |  | UpcomingCoursesAdmin · l.384 |
| «[icon Edit2]» · tooltip «Editar» | `{() => openEditModal(course)}` | `!(loading) && !(courses.length === 0) && each courses` |  |  | UpcomingCoursesAdmin · l.395 |
| «[icon Trash2]» · tooltip «Eliminar» | `{() => handleDelete(course.id)}` | `!(loading) && !(courses.length === 0) && each courses` |  |  | UpcomingCoursesAdmin · l.402 |
| «Guardando... / Actualizar / Crear» | `{handleSave}` | `showModal` · screen size: `sm:block sm:flex` | `{saving}` |  | UpcomingCoursesAdmin · l.561 |
| «Cancelar» | `{() => { setShowModal(false); resetForm(); }}` | `showModal` · screen size: `sm:block sm:flex` |  |  | UpcomingCoursesAdmin · l.569 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título *» | text | «Nombre del curso» |  | `showModal` · screen size: `sm:block` |  | UpcomingCoursesAdmin · l.443 |
| «Descripción» | textarea | «Descripción breve del curso» |  | `showModal` · screen size: `sm:block` |  | UpcomingCoursesAdmin · l.457 |
| «Relator» | select |  | «Seleccionar relator...», «(lista) {instructor.full_name}» | `showModal` · screen size: `sm:block` |  | UpcomingCoursesAdmin · l.471 |
| «URL de Imagen» | url | «https://...» |  | `showModal` · screen size: `sm:block` |  | UpcomingCoursesAdmin · l.490 |
| «Fecha Estimada de Lanzamiento» | date |  |  | `showModal` · screen size: `sm:block` |  | UpcomingCoursesAdmin · l.516 |
| «Orden de Visualización» | number | `min={0}` |  | `showModal` · screen size: `sm:block` |  | UpcomingCoursesAdmin · l.532 |
| «Activo (visible en el dashboard)» | checkbox |  |  | `showModal` · screen size: `sm:block` | `id=is_active (id used by code)` | UpcomingCoursesAdmin · l.546 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · {course.thumbnail_url} | `!(loading) && !(courses.length === 0) && each courses && course.thumbnail_url` |  | UpcomingCoursesAdmin · l.329 |
| img · alt Preview · {thumbnailUrl} | `showModal && thumbnailUrl` · screen size: `sm:block` |  | UpcomingCoursesAdmin · l.499 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Orden» | `!(loading) && !(courses.length === 0)` | UpcomingCoursesAdmin · l.297 |
| «Curso» | `!(loading) && !(courses.length === 0)` | UpcomingCoursesAdmin · l.300 |
| «Relator» | `!(loading) && !(courses.length === 0)` | UpcomingCoursesAdmin · l.303 |
| «Fecha Estimada» | `!(loading) && !(courses.length === 0)` | UpcomingCoursesAdmin · l.306 |
| «Estado» | `!(loading) && !(courses.length === 0)` | UpcomingCoursesAdmin · l.309 |
| «Acciones» | `!(loading) && !(courses.length === 0)` | UpcomingCoursesAdmin · l.312 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Curso Próximo / Nuevo Curso Próximo» | written in this file | `showModal` |  | UpcomingCoursesAdmin · l.423 |
| «(sin título)» | written in this file | `showModal` |  | UpcomingCoursesAdmin · l.425 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Estás seguro de eliminar este curso próximo?» |  | handleDelete · l.174 |

**Toasts** (9)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para acceder a esta página» | `!response.ok && (response.status === 401 \|\| response.status === 403)` | UpcomingCoursesAdmin · l.45 |
| error | «Error al cargar los cursos próximos» |  | UpcomingCoursesAdmin · l.55 |
| error | «El título es requerido» | `!title.trim()` | handleSave · l.125 |
| success | «Curso actualizado / Curso creado» |  | handleSave · l.161 |
| error | «Error al guardar el curso» |  | handleSave · l.167 |
| success | «Curso eliminado» |  | handleDelete · l.183 |
| error | «Error al eliminar el curso» |  | handleDelete · l.187 |
| success | «Curso desactivado / Curso activado» |  | handleToggleActive · l.201 |
| error | «Error al cambiar el estado» |  | handleToggleActive · l.205 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar cursos próximos» | `throw (shown by whoever catches it)` | `!response.ok` | UpcomingCoursesAdmin · l.48 |
| «Error al guardar» | `throw (shown by whoever catches it)` | `!response.ok` | handleSave · l.158 |
| «Error al eliminar» | `throw (shown by whoever catches it)` | `!response.ok` | handleDelete · l.181 |
| «Error al actualizar» | `throw (shown by whoever catches it)` | `!response.ok` | handleToggleActive · l.199 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Próximos Cursos |  |  | UpcomingCoursesAdmin · l.218 |
| `UpcomingCourseCard` |  | `!(loading) && !(courses.length === 0) && each courses .filter((c) => c.is_active)` |  | UpcomingCoursesAdmin · l.282 |

**Values shown from data** (2)

- `{course.title}` — UpcomingCoursesAdmin · l.340, when `!(loading) && !(courses.length === 0) && each courses`
- `{course.description}` — UpcomingCoursesAdmin · l.344, when `!(loading) && !(courses.length === 0) && each courses && course.description`

**Other texts on screen** (15)

- «Administra los cursos que aparecerán como &quot;Próximamente&quot; en el dashboard» — UpcomingCoursesAdmin · l.232
- «Cargando cursos...» — UpcomingCoursesAdmin · l.253, when `loading`
- «No hay cursos próximos aún» — UpcomingCoursesAdmin · l.258, when `!(loading) && courses.length === 0`
- «Sin asignar» — UpcomingCoursesAdmin · l.358, when `!(loading) && !(courses.length === 0) && each courses && !(course.instructor)`
- «Por confirmar» — UpcomingCoursesAdmin · l.368, when `!(loading) && !(courses.length === 0) && each courses && !(course.estimated_release_date)`
- «Activo / Inactivo» — UpcomingCoursesAdmin · l.372, when `!(loading) && !(courses.length === 0) && each courses`
- «Título *» (label) — UpcomingCoursesAdmin · l.440, when `showModal`, screen size: `sm:block`
- «Descripción» (label) — UpcomingCoursesAdmin · l.454, when `showModal`, screen size: `sm:block`
- «Relator» (label) — UpcomingCoursesAdmin · l.468, when `showModal`, screen size: `sm:block`
- «URL de Imagen» (label) — UpcomingCoursesAdmin · l.487, when `showModal`, screen size: `sm:block`
- «Fecha Estimada de Lanzamiento» (label) — UpcomingCoursesAdmin · l.513, when `showModal`, screen size: `sm:block`
- «Se mostrará como &quot;Disponible en [Mes Año]&quot;» — UpcomingCoursesAdmin · l.523, when `showModal`, screen size: `sm:block`
- «Orden de Visualización» (label) — UpcomingCoursesAdmin · l.529, when `showModal`, screen size: `sm:block`
- «Números menores aparecen primero» — UpcomingCoursesAdmin · l.540, when `showModal`, screen size: `sm:block`
- «Activo (visible en el dashboard)» (label) — UpcomingCoursesAdmin · l.553, when `showModal`, screen size: `sm:block`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/courses/UpcomingCourseCard.tsx`
- `types/roles.ts`
- `utils/authHelpers.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/get-instructors` | GET | `pages/admin/upcoming-courses/index.tsx:64` |
| `/api/auth/session` | GET | `utils/authHelpers.ts:71` |
| `/api/upcoming-courses` | POST | `pages/admin/upcoming-courses/index.tsx:149` |
| `/api/upcoming-courses/[id]` | DELETE, PUT | `pages/admin/upcoming-courses/index.tsx:143`, `pages/admin/upcoming-courses/index.tsx:177`, `pages/admin/upcoming-courses/index.tsx:193` |
| `/api/upcoming-courses/admin` | GET | `pages/admin/upcoming-courses/index.tsx:42` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/ConvertStructureModal.tsx

Used by: `/admin/course-builder/[courseId]/edit`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Advertencia: Múltiples Módulos» | h4 | `targetStructure === 'simple' && moduleCount > 1` | getConversionWarning · l.37 |
| «Convertir Estructura del Curso» | h3 | screen size: `sm:block sm:flex` | ConvertStructureModal · l.100 |
| «{courseTitle}» | h4 | screen size: `sm:block sm:flex` | ConvertStructureModal · l.114 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` | screen size: `sm:block sm:flex` | `{isConverting}` |  | ConvertStructureModal · l.103 |
| «Convirtiendo... / Convertir Estructura» | `{onConfirm}` | screen size: `sm:block sm:flex` | `{isConverting}` |  | ConvertStructureModal · l.148 |
| «Cancelar» | `{onClose}` | screen size: `sm:block sm:flex` | `{isConverting}` |  | ConvertStructureModal · l.160 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Convertir Estructura del Curso» | written in this file |  |  | ConvertStructureModal · l.85 |
| «(sin título)» | written in this file |  |  | ConvertStructureModal · l.87 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | ConvertStructureModal · l.27 |

**Other texts on screen** (19)

- «Este curso tiene {moduleCount} módulos. Al convertir a estructura simple, todas las lecciones se moverán directamente al curso y se eliminarán los módulos. La organización modular se perderá.» — getConversionWarning · l.38, when `targetStructure === 'simple' && moduleCount > 1`
- «La conversión a estructura» — getConversionDescription · l.57, when `targetStructure === 'simple'`
- «simple» — getConversionDescription · l.57, when `targetStructure === 'simple'`
- «realizará los siguientes cambios:» — getConversionDescription · l.57, when `targetStructure === 'simple'`
- «Todas las lecciones se moverán directamente al curso» — getConversionDescription · l.60, when `targetStructure === 'simple'`
- «Se eliminarán todos los módulos ( {moduleCount} módulo s )» — getConversionDescription · l.61, when `targetStructure === 'simple'`
- «Las lecciones mantendrán su orden secuencial» — getConversionDescription · l.62, when `targetStructure === 'simple'`
- «Los estudiantes verán las lecciones en una lista única» — getConversionDescription · l.63, when `targetStructure === 'simple'`
- «La conversión a estructura» — getConversionDescription · l.71, when `!(targetStructure === 'simple')`
- «modular» — getConversionDescription · l.71, when `!(targetStructure === 'simple')`
- «realizará los siguientes cambios:» — getConversionDescription · l.71, when `!(targetStructure === 'simple')`
- «Se creará un módulo principal para organizar las lecciones» — getConversionDescription · l.74, when `!(targetStructure === 'simple')`
- «Todas las lecciones ( {lessonCount} lección es ) se moverán al nuevo módulo» — getConversionDescription · l.75, when `!(targetStructure === 'simple')`
- «Podrás crear módulos adicionales después de la conversión» — getConversionDescription · l.76, when `!(targetStructure === 'simple')`
- «Los estudiantes verán las lecciones organizadas por módulos» — getConversionDescription · l.77, when `!(targetStructure === 'simple')`
- «Simple / Modular» — ConvertStructureModal · l.116, screen size: `sm:block sm:flex`
- «Simple / Modular» — ConvertStructureModal · l.124, screen size: `sm:block sm:flex`
- «Nota:» — ConvertStructureModal · l.139, screen size: `sm:block sm:flex`
- «Esta acción puede ser revertida convirtiendo el curso de vuelta a su estructura original.» — ConvertStructureModal · l.139, screen size: `sm:block sm:flex`

### components/DeleteCourseModal.tsx

Used by: `/admin/course-builder`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Confirmar Eliminación» | h2 |  | DeleteCourseModal · l.27 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Eliminando... / Eliminar Curso» | `{onConfirm}` |  | `{!isConfirmationMatch \|\| isDeleting}` |  | DeleteCourseModal · l.52 |
| «Cancelar» | `{onClose}` |  | `{isDeleting}` |  | DeleteCourseModal · l.59 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Para confirmar, escribe &quot; Eliminar &quot; en el campo de abajo:» | text | «Eliminar» |  |  | `id=confirmationInput (id used by code)` | DeleteCourseModal · l.41 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Confirmar Eliminación» | written in this file |  |  | DeleteCourseModal · l.25 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | DeleteCourseModal · l.22 |

**Values shown from data** (1)

- `{courseTitle}` — DeleteCourseModal · l.31

**Other texts on screen** (4)

- «¿Estás seguro de que quieres eliminar el curso &quot;» — DeleteCourseModal · l.31
- «&quot;?» — DeleteCourseModal · l.31
- «Esta acción no se puede deshacer directamente. El curso y todo su contenido asociado se moverán a tablas de respaldo.» — DeleteCourseModal · l.34
- «Para confirmar, escribe &quot; Eliminar &quot; en el campo de abajo:» (label) — DeleteCourseModal · l.38

### components/DeleteLessonModal.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Confirmar Eliminación» | h3 |  | DeleteLessonModal · l.27 |
| «Esta acción no se puede deshacer» | h4 |  | DeleteLessonModal · l.45 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon XIcon]» | `{onClose}` |  | `{isDeleting}` |  | DeleteLessonModal · l.31 |
| «Cancelar» | `{onClose}` |  | `{isDeleting}` |  | DeleteLessonModal · l.61 |
| «Eliminando... / Eliminar Lección» | `{onConfirm}` |  | `{isDeleting}` |  | DeleteLessonModal · l.68 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Confirmar Eliminación» | written in this file |  |  | DeleteLessonModal · l.22 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | DeleteLessonModal · l.19 |

**Other texts on screen** (4)

- «Se eliminará permanentemente la lección» — DeleteLessonModal · l.49
- «&quot; {lessonTitle} &quot;» — DeleteLessonModal · l.49
- «y todo su contenido, incluyendo todos los bloques de contenido.» — DeleteLessonModal · l.49
- «¿Estás seguro de que deseas eliminar esta lección? Esta acción no se puede deshacer.» — DeleteLessonModal · l.56

### components/DeleteModuleModal.tsx

Used by: `/admin/course-builder/[courseId]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Confirmar Eliminación» | h3 |  | DeleteModuleModal · l.27 |
| «Esta acción no se puede deshacer» | h4 |  | DeleteModuleModal · l.45 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon XIcon]» | `{onClose}` |  | `{isDeleting}` |  | DeleteModuleModal · l.31 |
| «Cancelar» | `{onClose}` |  | `{isDeleting}` |  | DeleteModuleModal · l.61 |
| «Eliminando... / Eliminar Módulo y Lecciones» | `{onConfirm}` |  | `{isDeleting}` |  | DeleteModuleModal · l.68 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Confirmar Eliminación» | written in this file |  |  | DeleteModuleModal · l.22 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | DeleteModuleModal · l.19 |

**Other texts on screen** (6)

- «Se eliminará permanentemente el módulo» — DeleteModuleModal · l.49
- «&quot; {moduleTitle} &quot;» — DeleteModuleModal · l.49
- «y» — DeleteModuleModal · l.49
- «todas sus lecciones asociadas» — DeleteModuleModal · l.49
- «, incluyendo todo el contenido de bloques.» — DeleteModuleModal · l.49
- «¿Estás seguro de que deseas eliminar este módulo y todas sus lecciones? Esta acción eliminará todo el contenido de forma permanente.» — DeleteModuleModal · l.56

### components/EditModuleModal.tsx

Used by: `/admin/course-builder/[courseId]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Módulo» | h3 |  | EditModuleModal · l.54 |
| «Actualizar información del módulo» | h4 |  | EditModuleModal · l.112 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon XIcon]» | `{onClose}` |  | `{isUpdating}` |  | EditModuleModal · l.58 |
| «Cancelar» | `{onClose}` |  | `{isUpdating}` |  | EditModuleModal · l.124 |
| «Actualizando... / Guardar Cambios» | `{handleConfirm}` |  | `{isUpdating \|\| !newTitle.trim()}` |  | EditModuleModal · l.131 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del Módulo *» | text | «Ingresa el título del módulo» · disabled: `{isUpdating}` · also `onKeyDown={handleKeyDown}` |  |  | `id=moduleTitle (id used by code)` | EditModuleModal · l.73 |
| «Descripción (Opcional)» | textarea | «Describe brevemente el contenido del módulo...» · disabled: `{isUpdating}` |  |  | `id=moduleDescription (id used by code)` | EditModuleModal · l.93 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Módulo» | written in this file |  |  | EditModuleModal · l.49 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | EditModuleModal · l.46 |

**Other texts on screen** (3)

- «Título del Módulo *» (label) — EditModuleModal · l.70
- «Descripción (Opcional)» (label) — EditModuleModal · l.90
- «Los cambios se aplicarán inmediatamente y serán visibles en toda la plataforma.» — EditModuleModal · l.116

### components/MoveLessonModal.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Mover Lección» | h3 |  | MoveLessonModal · l.76 |
| «Mover lección a otro módulo» | h4 |  | MoveLessonModal · l.94 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon XIcon]» | `{onClose}` |  | `{isMoving}` |  | MoveLessonModal · l.80 |
| «Cancelar» | `{onClose}` |  | `{isMoving}` |  | MoveLessonModal · l.160 |
| «Moviendo... / Mover Lección» | `{handleConfirm}` |  | `{isMoving \|\| !selectedModuleId \|\| availableModules.length === 0}` |  | MoveLessonModal · l.167 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{module.order_number} . {module.title}» | radio | `targetModule` |  | `!(loading) && availableModules.length > 0 && each availableModules` · hidden by its class (`sr-only`); another control opens it or it is for screen readers |  | MoveLessonModal · l.124 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Mover Lección» | written in this file |  |  | MoveLessonModal · l.71 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | MoveLessonModal · l.68 |

**Other texts on screen** (7)

- «La lección» — MoveLessonModal · l.98
- «&quot; {lessonTitle} &quot;» — MoveLessonModal · l.98
- «se moverá al módulo seleccionado y se reorganizará automáticamente.» — MoveLessonModal · l.98
- «Cargando módulos...» — MoveLessonModal · l.107, when `loading`
- «Selecciona el módulo de destino:» (label) — MoveLessonModal · l.111, when `!(loading) && availableModules.length > 0`
- «{module.order_number} . {module.title}» (label) — MoveLessonModal · l.116, when `!(loading) && availableModules.length > 0 && each availableModules`
- «No hay otros módulos disponibles en este curso.» — MoveLessonModal · l.153, when `!(loading) && !(availableModules.length > 0)`

**Reads and writes the database directly:** `table:modules` (select)

### components/admin/assignment-matrix/AssignmentCard.tsx

Used by: `/admin/assignment-matrix`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{assignment.contentTitle}» | h4 |  | AssignmentCard · l.90 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Trash2]» · tooltip «Desasignar» | `{() => onUnassign(assignment)}` | `showUnassign` | `{disabled}` |  | AssignmentCard · l.104 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SourceBadge` |  |  |  | AssignmentCard · l.132 |
| `OverlapBadge` |  | `assignment.source === 'directa_y_ruta'` |  | AssignmentCard · l.137 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getReadOnlyMessage()` | «Gestionado por: {lpName}», «Ver detalles» | getReadOnlyMessage · l.53 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Gestionado por: {lpName}» | AssignmentCard · l.53 |
| «Ver detalles» | AssignmentCard · l.55 |

**Values shown from data** (3)

- `{assignment.contentDescription}` — AssignmentCard · l.94, when `assignment.contentDescription`
- `{readOnlyMessage}` — AssignmentCard · l.123, when `!(showUnassign) && readOnlyMessage && !(assignment.source === 'inscripcion_otro')`
- `{formatDate(assignment.assignedAt)}` — AssignmentCard · l.145, when `assignment.assignedAt`

**Other texts on screen** (5)

- «Fuente inferida - inscripción existe pero sin registro de asignación directa ni de ruta. Puede ser auto-inscripción o datos migrados.» (title) — AssignmentCard · l.115, when `!(showUnassign) && readOnlyMessage && assignment.source === 'inscripcion_otro'`
- «Fuente desconocida» — AssignmentCard · l.120, when `!(showUnassign) && readOnlyMessage && assignment.source === 'inscripcion_otro'`
- «Por: {assignment.assignedByName}» — AssignmentCard · l.150, when `assignment.assignedByName`
- «{assignment.progress} % completado» — AssignmentCard · l.155, when `isCourse && assignment.progress !== undefined`
- «{assignment.coursesCompleted} / {assignment.courseCount} cursos» — AssignmentCard · l.162, when `isLP && assignment.courseCount !== undefined`

### components/admin/assignment-matrix/AssignmentDetailPanel.tsx

Used by: `/admin/assignment-matrix`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Selecciona un usuario» | h3 | `!userAssignments && !loading && !error` | AssignmentDetailPanel · l.104 |
| «Error al cargar» | h3 | `error` | AssignmentDetailPanel · l.133 |
| «{user.name}» | h2 |  | AssignmentDetailPanel · l.168 |
| «Rutas de Aprendizaje» | h3 | `!(assignments.length === 0) && lpAssignments.length > 0` | AssignmentDetailPanel · l.196 |
| «Cursos» | h3 | `!(assignments.length === 0) && courseAssignments.length > 0` | AssignmentDetailPanel · l.216 |
| «Asignar» | h3 |  | AssignmentDetailPanel · l.245 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar» | `{onRefresh}` | `error` |  |  | AssignmentDetailPanel · l.139 |
| «[icon RefreshCw]» · tooltip «Actualizar» | `{onRefresh}` |  | `{loading}` |  | AssignmentDetailPanel · l.172 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `UnassignConfirmModal` | component | `{unassignModalData.isOpen}` |  | AssignmentDetailPanel · l.270 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Ruta "{assignment.contentTitle}" desasignada» | `assignment.type === 'learning_path'` | handleUnassignConfirm · l.76 |
| success | «Curso "{assignment.contentTitle}" desasignado» | `!(assignment.type === 'learning_path') && (assignment.source === 'asignacion_directa' \|\| assignment.source === 'directa_y_ruta')` | handleUnassignConfirm · l.81 |
| error | «Error al desasignar» |  | handleUnassignConfirm · l.88 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!userAssignments` | AssignmentDetailPanel · l.151 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `UserHeaderSkeleton` |  | `loading` |  | AssignmentDetailPanel · l.119 |
| `AssignmentListSkeleton` |  | `loading` |  | AssignmentDetailPanel · l.121 |
| `EmptyState` | title: Sin asignaciones · description: Este usuario no tiene cursos ni rutas asignadas. Usa el panel de abajo para asignar contenido. | `assignments.length === 0` |  | AssignmentDetailPanel · l.186 |
| `AssignmentCard` |  | `!(assignments.length === 0) && lpAssignments.length > 0 && each lpAssignments` |  | AssignmentDetailPanel · l.202 |
| `AssignmentCard` |  | `!(assignments.length === 0) && courseAssignments.length > 0 && each courseAssignments` |  | AssignmentDetailPanel · l.222 |
| `AuditLogSection` | entityType: user |  |  | AssignmentDetailPanel · l.236 |
| `QuickAssignDropdown` |  |  |  | AssignmentDetailPanel · l.246 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `statsLine` | «Cursos: {stats.totalCourses}{stats.overlappingCourses > …} · Rutas: {stats.totalLPs}» | AssignmentDetailPanel · l.160 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «({stats.overlappingCourses} con superposición)» | AssignmentDetailPanel · l.160 |

**Values shown from data** (3)

- `{error}` — AssignmentDetailPanel · l.136, when `error`
- `{user.email}` — AssignmentDetailPanel · l.169
- `{statsLine}` — AssignmentDetailPanel · l.170

**Other texts on screen** (1)

- «Selecciona un usuario del panel izquierdo para ver sus asignaciones» — AssignmentDetailPanel · l.108, when `!userAssignments && !loading && !error`

### components/admin/assignment-matrix/AssignmentMatrixContainer.tsx

Used by: `/admin/assignment-matrix`

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Por Usuario» | `{() => setViewMode('users')}` | `viewMode === 'content'` |  |  | AssignmentMatrixContainer · l.156 |
| «Por Contenido» | `{() => setViewMode('content')}` | `viewMode === 'content'` |  |  | AssignmentMatrixContainer · l.163 |
| «Por Usuario» | `{() => setViewMode('users')}` |  |  |  | AssignmentMatrixContainer · l.202 |
| «Por Contenido» | `{() => setViewMode('content')}` |  |  |  | AssignmentMatrixContainer · l.209 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `BatchAssignModal` | component | `{batchAssignModal.isOpen}` |  | AssignmentMatrixContainer · l.182 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «No hay comunidad seleccionada» | `throw (shown by whoever catches it)` | `!filters.communityId` | handleAssignCourseToCommunity · l.113 |
| «No hay comunidad seleccionada» | `throw (shown by whoever catches it)` | `!filters.communityId` | handleAssignLPToCommunity · l.118 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ContentBatchView` |  | `viewMode === 'content'` |  | AssignmentMatrixContainer · l.175 |
| `UserGroupPanel` |  |  |  | AssignmentMatrixContainer · l.223 |
| `GroupDetailPanel` |  | `selectedGroup` |  | AssignmentMatrixContainer · l.257 |
| `AssignmentDetailPanel` |  | `!(selectedGroup)` |  | AssignmentMatrixContainer · l.267 |

### components/admin/assignment-matrix/AuditLogSection.tsx

Used by: `/admin/assignment-matrix`

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Historial de Asignaciones [( {total} )]» | `{() => setIsExpanded(!isExpanded)}` |  |  |  | AuditLogSection · l.132 |
| «Anterior» | `{() => setPage(p => Math.max(1, p - 1))}` | `!(loading && logs.length === 0) && !(error) && !(logs.length === 0) && totalPages > 1` | `{page === 1 \|\| loading}` |  | AuditLogSection · l.224 |
| «Siguiente» | `{() => setPage(p => Math.min(totalPages, p + 1))}` | `!(loading && logs.length === 0) && !(error) && !(logs.length === 0) && totalPages > 1` | `{page === totalPages \|\| loading}` |  | AuditLogSection · l.234 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar historial» | `throw (shown by whoever catches it)` | `!response.ok` | AuditLogSection · l.82 |
| «Error al cargar historial» | `setError` |  | AuditLogSection · l.90 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isExpanded` | AuditLogSection · l.58 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `action` | «asigno / desasigno» | getActionText · l.119 |
| `contentTypeText` | «el curso / la ruta» | getActionText · l.120 |

**Values shown from data** (2)

- `{error}` — AuditLogSection · l.159, when `isExpanded && !(loading && logs.length === 0) && error`
- `{getActionText(log)}` — AuditLogSection · l.191, when `!(loading && logs.length === 0) && !(error) && !(logs.length === 0) && each logs`

**Other texts on screen** (6)

- «Cargando historial...» — AuditLogSection · l.156, when `isExpanded && loading && logs.length === 0`
- «No hay historial de asignaciones» — AuditLogSection · l.162, when `isExpanded && !(loading && logs.length === 0) && !(error) && logs.length === 0`
- «{log.performerName} / Usuario desconocido» — AuditLogSection · l.189, when `!(loading && logs.length === 0) && !(error) && !(logs.length === 0) && each logs`
- «{log.contentTitle} / Contenido desconocido» — AuditLogSection · l.193, when `!(loading && logs.length === 0) && !(error) && !(logs.length === 0) && each logs`
- «Parte de asignacion masiva ( {log.metadata.batchSize} usuarios)» — AuditLogSection · l.212, when `!(error) && !(logs.length === 0) && each logs && log.metadata?.batchSize && log.metadata.batchSize > 1`
- «Pagina {page} de {totalPages}» — AuditLogSection · l.231, when `!(loading && logs.length === 0) && !(error) && !(logs.length === 0) && totalPages > 1`

### components/admin/assignment-matrix/BatchAssignModal.tsx

Used by: `/admin/assignment-matrix`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Asignar Curso / Ruta» | h3 |  | BatchAssignModal · l.286 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  |  |  | BatchAssignModal · l.294 |
| «[icon X]» | `{() => removeSelected(user.id)}` | `selectedUsers.length > 0 && each selectedUsers` |  |  | BatchAssignModal · l.369 |
| «Seleccionar todos ( {selectableUsers.length} disponibles)» | `{toggleSelectAll}` |  | `{selectableUsers.length === 0 \|\| loading}` |  | BatchAssignModal · l.383 |
| «{user.name} [Ya asignado] {user.email} [{[user.school_name, user.community_n…}]» | `{() => toggleUser(user)}` | `!(loading) && !(users.length === 0) && each users` | `{isDisabled}` |  | BatchAssignModal · l.427 |
| «Cargar más usuarios...» | `{() => { setPage(p => p + 1); fetchUsers(false); }}` | `hasMore && !loading` |  |  | BatchAssignModal · l.482 |
| «Cancelar» | `{onClose}` |  | `{assigning}` |  | BatchAssignModal · l.500 |
| «Asignar a {selectedCount} usuario(s)» | `{handleAssign}` |  | `{selectedCount === 0 \|\| assigning}` |  | BatchAssignModal · l.507 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «Asignar Curso / Ruta {contentTitle} Todas las escuelas {school.name} Todas las comunidades {community.name} [{selectedC…» | `{(e) => e.stopPropagation()}` |  | BatchAssignModal · l.275 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select | disabled: `{loadingSchools}` | «Todas las escuelas», «(lista) {school.name}» |  |  | BatchAssignModal · l.309 |
|  | select | disabled: `{loadingCommunities}` | «Todas las comunidades», «(lista) {community.name}» |  |  | BatchAssignModal · l.327 |
| «Buscar por nombre o email...» | text | «Buscar por nombre o email...» |  |  |  | BatchAssignModal · l.345 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Asignar Curso / Ruta» | written in this file |  |  | BatchAssignModal · l.270 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar usuarios» | `!(response.ok)` | BatchAssignModal · l.145 |
| error | «Error al cargar usuarios» |  | BatchAssignModal · l.150 |
| success | «Asignado a {userIds.length} usuario(s)» | `response.ok` | handleAssign · l.248 |
| error | «Error al asignar» | `!(response.ok)` | handleAssign · l.253 |
| error | «Error al asignar» |  | handleAssign · l.257 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!contentId` | BatchAssignModal · l.103 |
| `!isOpen` | BatchAssignModal · l.263 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `body` | «users / users» | BatchAssignModal · l.115 |

**Values shown from data** (1)

- `{contentTitle}` — BatchAssignModal · l.289

**Other texts on screen** (5)

- «{selectedCount} usuario(s) seleccionado(s)» — BatchAssignModal · l.358, when `selectedUsers.length > 0`
- «{totalCount} usuario(s) total» — BatchAssignModal · l.401
- «Cargando usuarios...» — BatchAssignModal · l.411, when `loading`
- «No se encontraron usuarios con los filtros seleccionados / No hay usuarios disponibles» — BatchAssignModal · l.414, when `!(loading) && users.length === 0`
- «[{selectedCount} seleccionado(s)]» — BatchAssignModal · l.496

### components/admin/assignment-matrix/CommunityAssignModal.tsx

Used by: `/admin/assignment-matrix`

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Asignar a Comunidad» | h2 |  | CommunityAssignModal · l.136 |
| «Cursos ( {courseResults.length} )» | h3 | `courseResults.length > 0` | CommunityAssignModal · l.203 |
| «{course.title}» | h4 | `courseResults.length > 0 && each courseResults` | CommunityAssignModal · l.217 |
| «Rutas de Aprendizaje ( {lpResults.length} )» | h3 | `lpResults.length > 0` | CommunityAssignModal · l.248 |
| «{lp.title}» | h4 | `lpResults.length > 0 && each lpResults` | CommunityAssignModal · l.262 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  |  |  | CommunityAssignModal · l.144 |
| «Asignar» | `{() => handleAssignCourse(course)}` | `courseResults.length > 0 && each courseResults` | `{disabled \|\| isAssigning}` |  | CommunityAssignModal · l.226 |
| «Asignar» | `{() => handleAssignLP(lp)}` | `lpResults.length > 0 && each lpResults` | `{disabled \|\| isAssigning}` |  | CommunityAssignModal · l.274 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onClose}` |  | CommunityAssignModal · l.125 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar curso o ruta de aprendizaje...» | text | «Buscar curso o ruta de aprendizaje...» · disabled: `{disabled}` |  |  |  | CommunityAssignModal · l.170 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Asignar a Comunidad» | written in this file |  |  | CommunityAssignModal · l.123 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Curso asignado a {result.assigned} usuario(s)» | `result.assigned > 0` | handleAssignCourse · l.83 |
| success | «Todos los usuarios ya tenían el curso asignado» | `!(result.assigned > 0)` | handleAssignCourse · l.85 |
| error | «Error al asignar curso» |  | handleAssignCourse · l.89 |
| success | «Ruta asignada a {result.assigned} usuario(s)» | `result.assigned > 0` | handleAssignLP · l.106 |
| success | «Todos los usuarios ya tenían la ruta asignada» | `!(result.assigned > 0)` | handleAssignLP · l.108 |
| error | «Error al asignar ruta» |  | handleAssignLP · l.112 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | CommunityAssignModal · l.118 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «, {lastResult.skipped} ya tenían asignación» | CommunityAssignModal · l.159 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 5000)` | CommunityAssignModal · l.67 |

**Values shown from data** (2)

- `{course.description}` — CommunityAssignModal · l.221, when `courseResults.length > 0 && each courseResults && course.description`
- `{lp.description}` — CommunityAssignModal · l.266, when `lpResults.length > 0 && each lpResults && lp.description`

**Other texts on screen** (7)

- «usuario» — CommunityAssignModal · l.141
- «s» — CommunityAssignModal · l.141
- «Curso / Ruta &quot; {lastResult.title} &quot;:» — CommunityAssignModal · l.157, when `lastResult`
- «{lastResult.assigned} asignado(s){lastResult.skipped > 0 ? `,…} / ya asignado a todos los usuarios» — CommunityAssignModal · l.158, when `lastResult`
- «Escribe para buscar cursos o rutas de aprendizaje» — CommunityAssignModal · l.190, when `!searchQuery`
- «No se encontraron resultados para &quot; {searchQuery} &quot;» — CommunityAssignModal · l.196, when `searchQuery && !hasResults && !isSearching`
- «{lp.courseCount} cursos incluidos» — CommunityAssignModal · l.270, when `lpResults.length > 0 && each lpResults`

### components/admin/assignment-matrix/CommunityAssignSection.tsx

Used by: `/admin/assignment-matrix`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Asignar a Todos» | `{() => setIsModalOpen(true)}` |  | `{disabled}` |  | CommunityAssignSection · l.66 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `CommunityAssignModal` | component | `{isModalOpen}` |  | CommunityAssignSection · l.77 |

**Values shown from data** (1)

- `{communityName}` — CommunityAssignSection · l.58

**Other texts on screen** (1)

- «{userCount} usuario s» — CommunityAssignSection · l.61

### components/admin/assignment-matrix/ContentBatchView.tsx

Used by: `/admin/assignment-matrix`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Vista por Contenido» | h2 |  | ContentBatchView · l.102 |
| «Cursos» | h3 | `!loading && !error && showCourses && courses.length > 0` | ContentBatchView · l.172 |
| «Rutas de Aprendizaje» | h3 | `!loading && !error && showLPs && learningPaths.length > 0` | ContentBatchView · l.191 |
| «No se encontró contenido» | h3 | `!loading && !error && !loading && courses.length === 0 && learningPaths.length === 0` | ContentBatchView · l.211 |
| «{course.title}» | h4 |  | CourseCard · l.306 |
| «{learningPath.name}» | h4 |  | LearningPathCard · l.376 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Anterior» | `{() => onPageChange(page - 1)}` |  | `{page <= 1}` |  | PaginationControls · l.271 |
| «Siguiente» | `{() => onPageChange(page + 1)}` |  | `{page >= totalPages}` |  | PaginationControls · l.282 |
| «[icon Plus]» · tooltip «Asignar a usuarios» | `{onAssign}` |  |  |  | CourseCard · l.320 |
| «[icon Plus]» · tooltip «Asignar a usuarios» | `{onAssign}` |  |  |  | LearningPathCard · l.388 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar por título...» | text | «Buscar por título...» |  |  |  | ContentBatchView · l.128 |
|  | select |  | «Todo el contenido», «Solo cursos», «Solo rutas» |  |  | ContentBatchView · l.139 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar contenido» | `throw (shown by whoever catches it)` | `!response.ok` | ContentBatchView · l.53 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `totalPages <= 1` | PaginationControls · l.260 |

**Values shown from data** (4)

- `{error}` — ContentBatchView · l.162, when `error`
- `{course.instructorName}` — CourseCard · l.310, when `course.instructorName`
- `{course.description}` — CourseCard · l.315, when `course.description`
- `{learningPath.description}` — LearningPathCard · l.383, when `learningPath.description`

**Other texts on screen** (28)

- «Gestiona asignaciones masivas de cursos y rutas» — ContentBatchView · l.104
- «cursos» — ContentBatchView · l.111, when `filters.contentType !== 'learning_paths'`
- «rutas» — ContentBatchView · l.117, when `filters.contentType !== 'courses'`
- «No hay resultados para "{filters.searchQuery}" / No hay contenido disponible» — ContentBatchView · l.214, when `!loading && !error && !loading && courses.length === 0 && learningPaths.length === 0`
- «Mostrando {startItem} - {endItem} de {totalItems}» — PaginationControls · l.267
- «Página {page} de {totalPages}» — PaginationControls · l.279
- «Asignaciones directas al curso» (title) — CourseCard · l.331
- «directo» — CourseCard · l.333
- «s» — CourseCard · l.333
- «Incluido en {course.learningPathCount} ruta(s) de aprendizaje» (title) — CourseCard · l.336, when `course.learningPathCount > 0`
- «ruta» — CourseCard · l.338, when `course.learningPathCount > 0`
- «s» — CourseCard · l.338, when `course.learningPathCount > 0`
- «{course.directAssigneeCount} directo s» — CourseCard · l.346, when `course.directAssigneeCount > 0 \|\| course.lpAssigneeCount > 0`
- «Usuarios con acceso via rutas de aprendizaje (puede incluir algunos usuarios ya contados en asignaciones directas)» (title) — CourseCard · l.348, when `(course.directAssigneeCount > 0 \|\| course.lpAssigneeCount > 0) && course.lpAssigneeCount > 0`
- «· + {course.lpAssigneeCount} via rutas» — CourseCard · l.348, when `(course.directAssigneeCount > 0 \|\| course.lpAssigneeCount > 0) && course.lpAssigneeCount > 0`
- «Sin asignar» — CourseCard · l.358, when `!(course.directAssigneeCount > 0 \|\| course.lpAssigneeCount > 0)`
- «{learningPath.courseCount} cursos» — LearningPathCard · l.379
- «Usuarios asignados directamente a esta ruta» (title) — LearningPathCard · l.399
- «usuario» — LearningPathCard · l.401
- «s» — LearningPathCard · l.401
- «Espacios de trabajo colaborativos (no escuelas ni comunidades)» (title) — LearningPathCard · l.404, when `learningPath.groupAssigneeCount > 0`
- «espacio» — LearningPathCard · l.406, when `learningPath.groupAssigneeCount > 0`
- «s» — LearningPathCard · l.406, when `learningPath.groupAssigneeCount > 0`
- «de trabajo» — LearningPathCard · l.406, when `learningPath.groupAssigneeCount > 0`
- «{learningPath.directAssigneeCount} usuario s» — LearningPathCard · l.414, when `learningPath.directAssigneeCount > 0 \|\| learningPath.groupAssigneeCount > 0`
- «Espacios de trabajo colaborativos (community_workspaces), no escuelas ni comunidades» (title) — LearningPathCard · l.416, when `(learningPath.directAssigneeCount > 0 \|\| learningPath.groupAssigneeCount > 0) && learningPath.groupAssigneeCount > 0`
- «· {learningPath.groupAssigneeCount} espacio s» — LearningPathCard · l.416, when `(learningPath.directAssigneeCount > 0 \|\| learningPath.groupAssigneeCount > 0) && learningPath.groupAssigneeCount > 0`
- «Sin asignar» — LearningPathCard · l.426, when `!(learningPath.directAssigneeCount > 0 \|\| learningPath.groupAssigneeCount > 0)`

### components/admin/assignment-matrix/GroupDetailPanel.tsx

Used by: `/admin/assignment-matrix`

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Selecciona un grupo» | h3 | `!selectedGroup && !loading && !error` | GroupDetailPanel · l.43 |
| «Error al cargar» | h3 | `error` | GroupDetailPanel · l.72 |
| «{groupName}» | h2 |  | GroupDetailPanel · l.114 |
| «Rutas de Aprendizaje» | h3 | `!(groupAssignments.length === 0) && lpAssignments.length > 0` | GroupDetailPanel · l.141 |
| «Cursos» | h3 | `!(groupAssignments.length === 0) && courseAssignments.length > 0` | GroupDetailPanel · l.160 |
| «Resumen del Grupo» | h3 |  | GroupDetailPanel · l.181 |
| «{assignment.contentTitle}» | h4 |  | GroupAssignmentCard · l.224 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar» | `{onRefresh}` | `error` |  |  | GroupDetailPanel · l.78 |
| «[icon RefreshCw]» · tooltip «Actualizar» | `{onRefresh}` |  | `{loading}` |  | GroupDetailPanel · l.117 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!selectedGroup` | GroupDetailPanel · l.90 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `UserHeaderSkeleton` |  | `loading` |  | GroupDetailPanel · l.58 |
| `AssignmentListSkeleton` |  | `loading` |  | GroupDetailPanel · l.60 |
| `EmptyState` | title: Sin asignaciones · description: Este grupo no tiene cursos ni rutas asignadas a sus {groupMemberCount} miembros. | `groupAssignments.length === 0` |  | GroupDetailPanel · l.131 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `statsLine` | «Cursos: {courseAssignments.length} · Rutas: {lpAssignments.length} · Miembros: {groupMemberCount}» | GroupDetailPanel · l.97 |
| `groupTypeLabel` | «Escuela / Comunidad» | GroupDetailPanel · l.100 |

**Values shown from data** (9)

- `{error}` — GroupDetailPanel · l.75, when `error`
- `{groupTypeLabel}` — GroupDetailPanel · l.110
- `{statsLine}` — GroupDetailPanel · l.115
- `{groupMemberCount}` — GroupDetailPanel · l.184
- `{courseAssignments.length}` — GroupDetailPanel · l.188
- `{lpAssignments.length}` — GroupDetailPanel · l.192
- `{assignment.contentDescription}` — GroupAssignmentCard · l.228, when `assignment.contentDescription`
- `{assignment.assignedCount} / {totalMembers} ( {coverage} %)` — GroupAssignmentCard · l.242
- `{assignment.averageProgress} %` — GroupAssignmentCard · l.259, when `assignment.type === 'course' && assignment.averageProgress !== undefined`

**Other texts on screen** (7)

- «Selecciona una escuela o comunidad del panel izquierdo para ver sus asignaciones» — GroupDetailPanel · l.47, when `!selectedGroup && !loading && !error`
- «Miembros» — GroupDetailPanel · l.185
- «Cursos» — GroupDetailPanel · l.189
- «Rutas» — GroupDetailPanel · l.193
- «Cobertura» — GroupAssignmentCard · l.240
- «Progreso promedio» — GroupAssignmentCard · l.258, when `assignment.type === 'course' && assignment.averageProgress !== undefined`
- «✓ {assignment.completedCount} completaron ( {completionRate} %)» — GroupAssignmentCard · l.275, when `assignment.completedCount > 0`

### components/admin/assignment-matrix/QuickAssignDropdown.tsx

Used by: `/admin/assignment-matrix`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{course.title} [{course.description}] [Ya asignado]» | `{() => handleAssignCourse(course)}` | `showDropdown && courseResults.length > 0 && each courseResults` | `{disabled \|\| isAssigning}` | `testid=assign-item-course-{course.id}` | QuickAssignDropdown · l.201 |
| «{lp.title} [{lp.description}] {lp.courseCount} cursos [Ya asignada]» | `{() => handleAssignLP(lp)}` | `showDropdown && lpResults.length > 0 && each lpResults` | `{disabled \|\| isAssigning}` | `testid=assign-item-lp-{lp.id}` | QuickAssignDropdown · l.254 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar curso o ruta para asignar...» | text | «Buscar curso o ruta para asignar...» · disabled: `{disabled}` · also `onFocus={handleInputFocus}` |  |  |  | QuickAssignDropdown · l.136 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Curso "{course.title}" asignado» | `success` | handleAssignCourse · l.91 |
| error | «Error al asignar curso» |  | handleAssignCourse · l.96 |
| success | «Ruta "{lp.title}" asignada» | `success` | handleAssignLP · l.116 |
| error | «Error al asignar ruta» |  | handleAssignLP · l.121 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('mousedown')` | QuickAssignDropdown · l.61 |

**Values shown from data** (1)

- `{selectedOverlap.message}` — QuickAssignDropdown · l.162, when `selectedOverlap && selectedOverlap.hasOverlap`

**Other texts on screen** (5)

- «Superposición detectada / Ya asignado» — QuickAssignDropdown · l.157, when `selectedOverlap && selectedOverlap.hasOverlap`
- «No se creará duplicado; se usará la inscripción existente.» — QuickAssignDropdown · l.167, when `selectedOverlap && selectedOverlap.hasOverlap && selectedOverlap.overlappingCourses.length > 0`
- «No se encontraron resultados para &quot; {searchQuery} &quot;» — QuickAssignDropdown · l.180, when `showDropdown && !hasResults && searchQuery && !isSearching`
- «Cursos» — QuickAssignDropdown · l.191, when `showDropdown && courseResults.length > 0`
- «Rutas de Aprendizaje» — QuickAssignDropdown · l.244, when `showDropdown && lpResults.length > 0`

### components/admin/assignment-matrix/SkeletonLoaders.tsx

Used by: `/admin/assignment-matrix`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h3 |  | EmptyState · l.169 |

**Values shown from data** (3)

- `{icon}` — EmptyState · l.166
- `{description}` — EmptyState · l.173, when `description`
- `{action}` — EmptyState · l.178, when `action`

### components/admin/assignment-matrix/SourceBadge.tsx

Used by: `/admin/assignment-matrix`

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `sourceCount <= 1` | OverlapBadge · l.75 |

**Other texts written in the code (safety net: not tied to an element by the script)** (8)

| Text | Where |
|---|---|
| «Directa» | SourceBadge · l.19 |
| «Asignación directa» | SourceBadge · l.23 |
| «Ruta» | SourceBadge · l.26 |
| «Vía ruta de aprendizaje: {lpName}» | SourceBadge · l.33 |
| «Directa + LP» | SourceBadge · l.38 |
| «Asignación directa + {multiLPName}» | SourceBadge · l.42 |
| «Inscripción» | SourceBadge · l.46 |
| «Fuente inferida - sin registro de asignación» | SourceBadge · l.50 |

**Values shown from data** (1)

- `{config.label}` — SourceBadge · l.58

**Other texts on screen** (2)

- «Este curso tiene {sourceCount} fuentes de asignación» (title) — OverlapBadge · l.78
- «fuentes» — OverlapBadge · l.95

### components/admin/assignment-matrix/UnassignConfirmModal.tsx

Used by: `/admin/assignment-matrix`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Desasignar {contentTypeLabel}» | h3 |  | UnassignConfirmModal · l.93 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  | `{isSubmitting}` |  | UnassignConfirmModal · l.97 |
| «Cancelar» | `{onClose}` |  | `{isSubmitting}` |  | UnassignConfirmModal · l.186 |
| «Eliminar Todo / Desasignar» | `{handleConfirm}` |  | `{isSubmitting}` |  | UnassignConfirmModal · l.193 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «Desasignar {contentTypeLabel} {contentTitle} Usuario: {userName} Se quitara la asignacion directa de este {contentTypeL…» | `{(e) => e.stopPropagation()}` |  | UnassignConfirmModal · l.83 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Limpieza completa Eliminar tambien las inscripciones de los cursos de esta ruta» | checkbox |  |  | `false && contentType === 'learning_path'` |  | UnassignConfirmModal · l.156 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Desasignar {contentTypeLabel}» | written in this file |  |  | UnassignConfirmModal · l.79 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!isOpen` | UnassignConfirmModal · l.52 |
| `contentType === 'course' && isLPSource` | UnassignConfirmModal · l.74 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `contentTypeLabel` | «curso / ruta» | UnassignConfirmModal · l.67 |

**Values shown from data** (3)

- `{contentTitle}` — UnassignConfirmModal · l.110
- `{sourceLPNames.join(', ')}` — UnassignConfirmModal · l.124, when `isMixedSource`
- `{userName}` — UnassignConfirmModal · l.130, when `!(isMixedSource)`

**Other texts on screen** (12)

- «Usuario: {userName}» — UnassignConfirmModal · l.113
- «Se quitara la» — UnassignConfirmModal · l.122, when `isMixedSource`
- «asignacion directa» — UnassignConfirmModal · l.122, when `isMixedSource`
- «de este» — UnassignConfirmModal · l.122, when `isMixedSource`
- «. El usuario seguira teniendo acceso a traves de:» — UnassignConfirmModal · l.122, when `isMixedSource`
- «Se desasignara este» — UnassignConfirmModal · l.130, when `!(isMixedSource)`
- «de» — UnassignConfirmModal · l.130, when `!(isMixedSource)`
- «El progreso se conservara» — UnassignConfirmModal · l.140, when `hasProgress`
- «Progreso actual: {progressPercent}% / El usuario podra continuar donde lo dejo si se reasigna.» — UnassignConfirmModal · l.141, when `hasProgress`
- «Limpieza completa Eliminar tambien las inscripciones de los cursos de esta ruta» (label) — UnassignConfirmModal · l.155, when `false && contentType === 'learning_path'`
- «Atencion:» — UnassignConfirmModal · l.176, when `false && contentType === 'learning_path' && cleanSlate`
- «Esta accion eliminara permanentemente todo el progreso del usuario en los cursos de esta ruta.» — UnassignConfirmModal · l.176, when `false && contentType === 'learning_path' && cleanSlate`

### components/admin/assignment-matrix/UserGroupPanel.tsx

Used by: `/admin/assignment-matrix`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Asignaciones del Grupo» | h4 | `activeTab === 'groups' && selectedGroup` | UserGroupPanel · l.487 |

**Buttons** (6)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Usuarios» | `{() => setActiveTab('users')}` |  |  |  | UserGroupPanel · l.177 |
| «Grupos» | `{() => setActiveTab('groups')}` |  |  |  | UserGroupPanel · l.188 |
| «{user.fullName} {user.email} [{user.schoolName}] [{roleBadge.label}]» | `{() => onSelectUser(user.id)}` | `activeTab === 'users' && users.length > 0 && each userVirtualizer.getVirtualItems()` |  |  | UserGroupPanel · l.309 |
| «Escuelas» | `{() => setGroupFilterType('school')}` | `activeTab === 'groups'` |  |  | UserGroupPanel · l.389 |
| «Comunidades» | `{() => setGroupFilterType('community')}` | `activeTab === 'groups'` |  |  | UserGroupPanel · l.400 |
| «{group.name} [{groupMemberCount} miembro s]» | `{() => handleGroupClick(group.id)}` | `activeTab === 'groups' && each currentGroupList` |  |  | UserGroupPanel · l.450 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar usuarios...» | text | «Buscar usuarios...» |  | `activeTab === 'users'` |  | UserGroupPanel · l.209 |
|  | select |  | «Todas las escuelas», «(lista) {school.name}» | `activeTab === 'users'` |  | UserGroupPanel · l.222 |
|  | select |  | «Todas las comunidades», «(lista) {comm.name}» | `activeTab === 'users'` |  | UserGroupPanel · l.239 |
| «{groupFilterType === 'school' ? 'Buscar escuelas...' : 'Buscar comunidades...'}» | text | «{groupFilterType === 'school' ? 'Buscar escuelas...' : 'Buscar comunidades...'}» |  | `activeTab === 'groups'` |  | UserGroupPanel · l.416 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `UserListSkeleton` |  | `activeTab === 'users' && usersLoading && users.length === 0` |  | UserGroupPanel · l.266 |
| `EmptyState` | title: No se encontraron usuarios · description: No hay usuarios que coincidan con "{filters.searchQuery}" / Ajusta los filtros para ver usuarios | `activeTab === 'users' && users.length === 0 && !usersLoading && !usersError` |  | UserGroupPanel · l.271 |
| `CommunityAssignSection` |  | `activeTab === 'users' && selectedCommunity && onCommunitySearchChange && onAssignCourseToCommunity && onAssignLPToCommunity` |  | UserGroupPanel · l.356 |
| `EmptyState` | title: No se encontraron {groupFilterType === 'school…} / No hay {groupFilterType === 'school…} disponibles · description: Prueba con otros términos de búsqueda | `activeTab === 'groups' && currentGroupList.length === 0` |  | UserGroupPanel · l.430 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `roleMap` | «Admin», «Consultor», «Directivo», «Docente», «Estudiante», «Líder Com.», «Líder Gen.», «Supervisor» | getRoleBadge · l.142 |

**Values shown from data** (3)

- `{usersError}` — UserGroupPanel · l.259, when `activeTab === 'users' && usersError`
- `{assignment.contentTitle}` — UserGroupPanel · l.505, when `selectedGroup && !(groupAssignmentsLoading) && !(groupAssignments.length === 0) && each groupAssignments.slice(0, 5)`
- `( {assignment.assignedCount} / {groupMemberCount} )` — UserGroupPanel · l.506, when `selectedGroup && !(groupAssignmentsLoading) && !(groupAssignments.length === 0) && each groupAssignments.slice(0, 5)`

**Other texts on screen** (2)

- «Sin asignaciones comunes» — UserGroupPanel · l.495, when `activeTab === 'groups' && selectedGroup && !(groupAssignmentsLoading) && groupAssignments.length === 0`
- «+ {groupAssignments.length - 5} más...» — UserGroupPanel · l.512, when `selectedGroup && !(groupAssignmentsLoading) && !(groupAssignments.length === 0) && groupAssignments.length > 5`

### components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts

Used by: `/admin/assignment-matrix`

**Messages set on the page** (14)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to load filter options» | `throw (shown by whoever catches it)` | `!response.ok` | loadFilterOptions · l.182 |
| «Error al cargar usuarios» | `throw (shown by whoever catches it)` | `!response.ok` | loadUsers · l.249 |
| «Error al cargar usuarios» | `setUsersError` |  | loadUsers · l.283 |
| «Error al cargar asignaciones» | `throw (shown by whoever catches it)` | `!response.ok` | loadUserAssignments · l.304 |
| «Error al cargar asignaciones del grupo» | `throw (shown by whoever catches it)` | `!response.ok` | loadGroupAssignments · l.335 |
| «Error al cargar asignaciones del grupo» | `setGroupAssignmentsError` |  | loadGroupAssignments · l.344 |
| «Error al asignar curso» | `throw (shown by whoever catches it)` | `!response.ok` | assignCourse · l.428 |
| «Error al asignar ruta» | `throw (shown by whoever catches it)` | `!response.ok` | assignLP · l.452 |
| «Error al desasignar curso» | `throw (shown by whoever catches it)` | `!response.ok` | unassignCourse · l.476 |
| «Error al desasignar ruta» | `throw (shown by whoever catches it)` | `!response.ok` | unassignLP · l.500 |
| «Error al obtener usuarios de la comunidad» | `throw (shown by whoever catches it)` | `!usersResponse.ok` | assignCourseToCommunity · l.521 |
| «Error al asignar curso a la comunidad» | `throw (shown by whoever catches it)` | `!response.ok` | assignCourseToCommunity · l.539 |
| «Error al obtener usuarios de la comunidad» | `throw (shown by whoever catches it)` | `!usersResponse.ok` | assignLPToCommunity · l.566 |
| «Error al asignar ruta a la comunidad» | `throw (shown by whoever catches it)` | `!response.ok` | assignLPToCommunity · l.584 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Ruta sin título» | useAssignmentMatrix · l.404 |

**Reads and writes the database directly:** `table:learning_paths` (select)

### components/admin/assignment-matrix/hooks/useOverlapDetection.ts

Used by: `/admin/assignment-matrix`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `message` | «El usuario ya tiene "{existing.title}" por {existing.source}. No se creará duplicado. / El usuario ya tiene este curso. No se creará duplicado.» | checkCourseOverlap · l.74 |
| `message` | «El usuario ya tiene asignada la ruta "{lpTitle}". / El usuario ya tiene asignada esta ruta.» | checkLPOverlap · l.123 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «asignación directa» | useOverlapDetection · l.44 |
| «asignación directa y ruta» | useOverlapDetection · l.50 |
| «inscripción existente» | useOverlapDetection · l.53 |

### components/blocks/BibliographyBlockEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{block.payload.title}» | h3 | `mode === 'preview' && block.payload.title` | BibliographyBlockEditor · l.335 |
| «Recursos ( {block.payload.items?.length} )» | h3 |  | BibliographyBlockEditor · l.441 |
| «Editando PDF / Imagen / Enlace» | h4 | `each block.payload.items && expandedItems.has(item.id)` | BibliographyBlockEditor · l.571 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar PDF» | `{() => addItem('pdf')}` |  |  |  | BibliographyBlockEditor · l.445 |
| «Agregar Enlace» | `{() => addItem('link')}` |  |  |  | BibliographyBlockEditor · l.452 |
| «Agregar Imagen» | `{() => addItem('image')}` |  |  |  | BibliographyBlockEditor · l.459 |
| «[icon ChevronUp]» · tooltip «Mover arriba» | `{() => moveItem(index, 'up')}` | `each block.payload.items && index > 0` |  |  | BibliographyBlockEditor · l.519 |
| «[icon ChevronDown]» · tooltip «Mover abajo» | `{() => moveItem(index, 'down')}` | `each block.payload.items && index < block.payload.items.length - 1` |  |  | BibliographyBlockEditor · l.528 |
| «Cerrar / Editar» · tooltip «{expandedItems.has(item.id) ? 'Cerrar edición' : 'Editar'}» | `{() => toggleItemExpanded(item.id)}` | `each block.payload.items` |  |  | BibliographyBlockEditor · l.536 |
| «[icon Trash2]» · tooltip «Eliminar» | `{() => deleteItem(item.id)}` | `each block.payload.items` |  |  | BibliographyBlockEditor · l.557 |
| «Eliminar archivo y subir otro» | `{() => { // Clear all file-related fields when deleting const updatedItems = blo…}` | `each block.payload.items && expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && item.url` |  |  | BibliographyBlockEditor · l.654 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
|  |  | `mode === 'preview' && each block.payload.items && !(item.type === 'pdf') && !(item.type === 'image')` |  | BibliographyBlockEditor · l.351 |
|  |  |  |  | BibliographyBlockEditor · l.456 |
|  |  | `each block.payload.items && !(item.type === 'pdf') && !(item.type === 'image')` |  | BibliographyBlockEditor · l.482 |
| «Ver archivo» | `{item.url}` (new tab) | `each block.payload.items && expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && item.url` |  | BibliographyBlockEditor · l.643 |

**Fields** (11)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título de la Sección» | text | «Ej: Bibliografía & Recursos» |  |  |  | BibliographyBlockEditor · l.387 |
| «Descripción (opcional)» | textarea | «Descripción breve de los recursos disponibles» |  |  |  | BibliographyBlockEditor · l.401 |
| «Agrupar por categorías» | checkbox |  |  |  |  | BibliographyBlockEditor · l.413 |
| «Ordenar por:» | select |  | «Manual», «Título», «Autor», «Año», «Tipo» |  |  | BibliographyBlockEditor · l.424 |
| «Título *» | text | «{item.type === 'pdf' ? 'Título del documento' : item.type === 'image' ? 'Título …}» |  | `each block.payload.items && expandedItems.has(item.id)` |  | BibliographyBlockEditor · l.582 |
| «Subiendo archivo... / Seleccionar PDF / Seleccionar Imagen» | file | disabled: `{uploadingFile}` · accepts `{item.type === 'pdf' ? '.pdf' : 'image/*'}` |  | `each block.payload.items && expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && !(item.url)` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=file-{item.id}` | BibliographyBlockEditor · l.673 |
| «Archivo PDF / Imagen / URL *» | url | «https://ejemplo.com/recurso» |  | `each block.payload.items && expandedItems.has(item.id) && (!((item.type === 'pdf' \|\| item.type === 'image')))` |  | BibliographyBlockEditor · l.714 |
| «Autor(es)» | text | «Nombre del autor o autores» |  | `each block.payload.items && expandedItems.has(item.id)` |  | BibliographyBlockEditor · l.731 |
| «Año» | text | «2024» · `maxLength={4}` |  | `each block.payload.items && expandedItems.has(item.id)` |  | BibliographyBlockEditor · l.745 |
| «Categoría» | text | «Ej: Lecturas obligatorias, Material complementario» |  | `each block.payload.items && expandedItems.has(item.id)` |  | BibliographyBlockEditor · l.761 |
| «Descripción» | textarea | «Breve descripción del recurso» |  | `each block.payload.items && expandedItems.has(item.id)` |  | BibliographyBlockEditor · l.775 |

**Embedded media** (5)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image | `mode === 'preview' && each block.payload.items && !(item.type === 'pdf') && item.type === 'image'` |  | BibliographyBlockEditor · l.349 |
| Image |  |  | BibliographyBlockEditor · l.464 |
| Image | `each block.payload.items && !(item.type === 'pdf') && item.type === 'image'` |  | BibliographyBlockEditor · l.480 |
| img · alt {item.title \|\| 'Vista previa'} · {item.url} | `expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && item.url && item.type === 'image'` |  | BibliographyBlockEditor · l.602 |
| Image | `expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && item.url && !(item.type === 'pdf')` |  | BibliographyBlockEditor · l.623 |

**Toasts** (12)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Hay {invalidItems.length} {invalidItems.length === 1 ?…} sin archivo cargado. Por favor, sube los archivos o elimina los elementos vacíos.» | `invalidItems.length > 0` | handleSave · l.87 |
| success | «{type === 'pdf' ? 'PDF' : ty…} agregado. Complete los detalles abajo.» |  | addItem · l.122 |
| error | «Solo se permiten archivos PDF» | `itemType === 'pdf' && file.type !== 'application/pdf'` | handleFileUpload · l.175 |
| error | «Solo se permiten archivos de imagen (JPG, PNG, GIF, etc.)» | `itemType === 'image' && !file.type.startsWith('image/')` | handleFileUpload · l.180 |
| error | «El archivo es demasiado grande: {fileSizeMB.toFixed(2)} MB. El tamaño máximo permitido es {maxSizeMB} MB.» | `fileSizeMB > maxSizeMB` | handleFileUpload · l.197 |
| error | «Error: El archivo es demasiado grande para el servidor. Tamaño: {fileSizeMB.toFixed(2)} MB» | `error && (error.message?.includes('size') \|\| error.message?.includes('large'))` | handleFileUpload · l.228 |
| error | «Error: Formato de archivo no permitido» | `error && (!(error.message?.includes('size') \|\| error.message?.includes('large'))) && (error.message?.includes('type') \|\| error.message?.includes('format'))` | handleFileUpload · l.232 |
| error | «Error al subir archivo: {error.message}» | `error && (!(error.message?.includes('size') \|\| error.message?.includes('large'))) && (!(error.message?.includes('type') \|\| error.message?.includes('format')))` | handleFileUpload · l.236 |
| plain | «Archivo subido. Haz clic en "Guardar Cambios" para guardar.» |  | handleFileUpload · l.289 |
| success | «PDF subido exitosamente» | `itemType === 'pdf'` | handleFileUpload · l.300 |
| success | «Imagen subida exitosamente» | `!(itemType === 'pdf') && itemType === 'image'` | handleFileUpload · l.302 |
| error | «Error al subir el archivo» |  | handleFileUpload · l.307 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Could not get public URL for uploaded file» | `throw (shown by whoever catches it)` | `!publicUrlData.data \|\| !publicUrlData.data.publicUrl` | handleFileUpload · l.248 |
| «Item not found» | `throw (shown by whoever catches it)` | `!currentItem` | handleFileUpload · l.264 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `BlockEditorWrapper` | title: Bibliografía · subtitle: Referencias y recursos | `mode === 'preview'` |  | BibliographyBlockEditor · l.325 |
| `BlockEditorWrapper` | title: Editar Bibliografía · subtitle: Configure las referencias y recursos · saveButtonText: Guardar Bibliografía |  |  | BibliographyBlockEditor · l.370 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Has URL ({item.url.substring(0, 50)}...)» | BibliographyBlockEditor · l.44 |
| «Título de la imagen» | BibliographyBlockEditor · l.587 |
| «Título del enlace» | BibliographyBlockEditor · l.587 |

**Values shown from data** (4)

- `{block.payload.description}` — BibliographyBlockEditor · l.339, when `mode === 'preview' && block.payload.description`
- `{item.author}` — BibliographyBlockEditor · l.355, when `mode === 'preview' && each block.payload.items && item.author`
- `• {item.author}` — BibliographyBlockEditor · l.490, when `each block.payload.items && item.author`
- `( {item.year} )` — BibliographyBlockEditor · l.495, when `each block.payload.items && item.year`

**Other texts on screen** (25)

- «{item.title} / Sin título» — BibliographyBlockEditor · l.354, when `mode === 'preview' && each block.payload.items`
- «No hay recursos agregados» — BibliographyBlockEditor · l.362, when `mode === 'preview' && ((!block.payload.items \|\| block.payload.items.length === 0))`
- «Título de la Sección» (label) — BibliographyBlockEditor · l.383
- «Descripción (opcional)» (label) — BibliographyBlockEditor · l.398
- «Agrupar por categorías» (label) — BibliographyBlockEditor · l.412
- «Ordenar por:» (label) — BibliographyBlockEditor · l.423
- «{item.title} / Nuevo {item.type === 'pdf' ? 'PDF'…}» — BibliographyBlockEditor · l.486, when `each block.payload.items`
- «📎 {item.filename} [• {(item.filesize / 1024 / 102…} MB]» — BibliographyBlockEditor · l.502, when `each block.payload.items && item.filename && item.type !== 'link'`
- «⚠️ Sin archivo cargado» — BibliographyBlockEditor · l.511, when `each block.payload.items && !item.url && item.type !== 'link'`
- «Título *» (label) — BibliographyBlockEditor · l.579, when `each block.payload.items && expandedItems.has(item.id)`
- «Archivo PDF / Imagen / URL *» (label) — BibliographyBlockEditor · l.593, when `each block.payload.items && expandedItems.has(item.id)`
- «{item.filename} / {item.url.split('/').pop()} / Archivo cargado» — BibliographyBlockEditor · l.626, when `each block.payload.items && expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && item.url`
- «Tamaño desconocido» — BibliographyBlockEditor · l.634, when `each block.payload.items && expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && item.url`
- «MB» — BibliographyBlockEditor · l.636, when `expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && item.url && item.filesize`
- «⚠️ ARCHIVO MUY GRANDE» — BibliographyBlockEditor · l.638, when `((item.type === 'pdf' \|\| item.type === 'image')) && item.url && item.filesize && item.filesize > 10 * 1024 * 1024`
- «Subiendo archivo... / Seleccionar PDF / Seleccionar Imagen» (label) — BibliographyBlockEditor · l.681, when `each block.payload.items && expandedItems.has(item.id) && ((item.type === 'pdf' \|\| item.type === 'image')) && !(item.url)`
- «Autor(es)» (label) — BibliographyBlockEditor · l.728, when `each block.payload.items && expandedItems.has(item.id)`
- «Año» (label) — BibliographyBlockEditor · l.742, when `each block.payload.items && expandedItems.has(item.id)`
- «Categoría» (label) — BibliographyBlockEditor · l.758, when `each block.payload.items && expandedItems.has(item.id)`
- «Descripción» (label) — BibliographyBlockEditor · l.772, when `each block.payload.items && expandedItems.has(item.id)`
- «Recuerda hacer clic en &quot;Guardar Bibliografía&quot; para guardar todos los cambios.» — BibliographyBlockEditor · l.787, when `each block.payload.items && expandedItems.has(item.id) && hasUnsavedChanges`
- «No hay recursos agregados» — BibliographyBlockEditor · l.799, when `(!block.payload.items \|\| block.payload.items.length === 0)`
- «Agrega PDFs o enlaces externos usando los botones de arriba» — BibliographyBlockEditor · l.801, when `(!block.payload.items \|\| block.payload.items.length === 0)`
- «⚠️ Tienes cambios sin guardar» — BibliographyBlockEditor · l.818, when `hasUnsavedChanges`
- «Los archivos subidos se guardarán automáticamente. Para otros cambios, haz clic en &quot;Guardar Bibliografía&quot;.» — BibliographyBlockEditor · l.821, when `hasUnsavedChanges`

**Reads and writes the database directly:** `bucket:course-materials` (getPublicUrl, upload)

### components/blocks/BlockEditorWrapper.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h2 |  | BlockEditorWrapper · l.39 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ChevronDown]» | `{onToggleCollapse}` |  |  |  | BlockEditorWrapper · l.48 |
| «[icon Trash2]» | `{onDelete}` |  |  |  | BlockEditorWrapper · l.51 |
| «{deleteButtonText}» | `{onDelete}` | `!isCollapsed` |  |  | BlockEditorWrapper · l.64 |
| «{saveButtonText}» | `{onSave}` | `!isCollapsed && showSaveButton && onSave` |  |  | BlockEditorWrapper · l.72 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Guardar Bloque» | BlockEditorWrapper · l.29 |
| «Eliminar Bloque» | BlockEditorWrapper · l.30 |

**Values shown from data** (1)

- `{subtitle}` — BlockEditorWrapper · l.43, when `subtitle`

### components/blocks/ExternalLinkBlockEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Enlaces Externos: {block.payload.title} / Sin título» | h2 |  | ExternalLinkBlockEditor · l.115 |
| «Enlaces ( {block.payload.links.length} )» | h3 | `!isCollapsed` | ExternalLinkBlockEditor · l.192 |
| «{link.title} / Enlace {linkIndex + 1}» | h4 | `!isCollapsed && each block.payload.links` | ExternalLinkBlockEditor · l.216 |
| «Vista previa:» | h5 | `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id)) && link.url && isValidUrl(link.url)` | ExternalLinkBlockEditor · l.370 |
| «{link.title} / Sin título» | h6 | `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id)) && link.url && isValidUrl(link.url)` | ExternalLinkBlockEditor · l.384 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ChevronDown]» | `{() => onToggleCollapse(block.id)}` |  |  |  | ExternalLinkBlockEditor · l.120 |
| «[icon Trash2]» | `{() => onDelete(block.id)}` |  |  |  | ExternalLinkBlockEditor · l.123 |
| «Agregar Enlace» | `{addLink}` | `!isCollapsed` |  |  | ExternalLinkBlockEditor · l.195 |
| «[icon Eye]» · tooltip «{link.isActive ? 'Desactivar enlace' : 'Activar enlace'}» | `{() => updateLink(link.id, 'isActive', !link.isActive)}` | `!isCollapsed && each block.payload.links` |  |  | ExternalLinkBlockEditor · l.229 |
| «Colapsar / Editar» | `{() => setExpandedLinkId( expandedLinkId === link.id ? null : link.id )}` | `!isCollapsed && each block.payload.links` |  |  | ExternalLinkBlockEditor · l.240 |
| «[icon Trash2]» | `{() => removeLink(link.id)}` | `!isCollapsed && each block.payload.links` |  |  | ExternalLinkBlockEditor · l.250 |
| «Eliminar Bloque» | `{() => onDelete(block.id)}` | `!isCollapsed` |  |  | ExternalLinkBlockEditor · l.408 |
| «Guardar Enlaces» | `{() => onSave(block.id)}` | `!isCollapsed` |  |  | ExternalLinkBlockEditor · l.415 |

**Fields** (11)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del Bloque» | text | «Ingrese el título para esta sección de enlaces» |  | `!isCollapsed` |  | ExternalLinkBlockEditor · l.136 |
| «Descripción» | textarea | «Descripción opcional para la colección de enlaces» |  | `!isCollapsed` |  | ExternalLinkBlockEditor · l.149 |
| «Agrupar por categoría» | checkbox |  |  | `!isCollapsed` |  | ExternalLinkBlockEditor · l.161 |
| «Mostrar miniaturas» | checkbox |  |  | `!isCollapsed` |  | ExternalLinkBlockEditor · l.170 |
| «Mostrar descripciones» | checkbox |  |  | `!isCollapsed` |  | ExternalLinkBlockEditor · l.179 |
| «Título del enlace» | text | «Título descriptivo del enlace» |  | `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))` |  | ExternalLinkBlockEditor · l.284 |
| «Categoría» | text | «Categoría (opcional)» |  | `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))` |  | ExternalLinkBlockEditor · l.296 |
| «URL del enlace» | url | «https://ejemplo.com» |  | `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))` |  | ExternalLinkBlockEditor · l.316 |
| «Descripción» | textarea | «Descripción del enlace (opcional)» |  | `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))` |  | ExternalLinkBlockEditor · l.333 |
| «URL de miniatura (opcional)» | url | «https://ejemplo.com/imagen.jpg» |  | `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))` |  | ExternalLinkBlockEditor · l.346 |
| «Abrir en nueva pestaña» | checkbox |  |  | `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))` |  | ExternalLinkBlockEditor · l.357 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {link.title} · {link.thumbnail} | `each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id)) && link.url && isValidUrl(link.url) && link.thumbnail` |  | ExternalLinkBlockEditor · l.374 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin categoría» | ExternalLinkBlockEditor · l.84 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `id=categories-{block.id}` | ExternalLinkBlockEditor · l.304 |

**Values shown from data** (2)

- `{link.description}` — ExternalLinkBlockEditor · l.388, when `each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id)) && link.url && isValidUrl(link.url) && link.description`
- `{link.url}` — ExternalLinkBlockEditor · l.392, when `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id)) && link.url && isValidUrl(link.url)`

**Other texts on screen** (16)

- «Título del Bloque» (label) — ExternalLinkBlockEditor · l.133, when `!isCollapsed`
- «Descripción» (label) — ExternalLinkBlockEditor · l.146, when `!isCollapsed`
- «Agrupar por categoría» (label) — ExternalLinkBlockEditor · l.160, when `!isCollapsed`
- «Mostrar miniaturas» (label) — ExternalLinkBlockEditor · l.169, when `!isCollapsed`
- «Mostrar descripciones» (label) — ExternalLinkBlockEditor · l.178, when `!isCollapsed`
- «URL inválida» — ExternalLinkBlockEditor · l.224, when `!isCollapsed && each block.payload.links && link.url && !isValidUrl(link.url)`
- «URL:» — ExternalLinkBlockEditor · l.264, when `!isCollapsed && each block.payload.links && (!expandedLinkId \|\| expandedLinkId !== link.id)`
- «Sin URL» — ExternalLinkBlockEditor · l.264, when `!isCollapsed && each block.payload.links && (!expandedLinkId \|\| expandedLinkId !== link.id)`
- «Descripción:» — ExternalLinkBlockEditor · l.268, when `!isCollapsed && each block.payload.links && (!expandedLinkId \|\| expandedLinkId !== link.id) && link.description`
- «Categoría:» — ExternalLinkBlockEditor · l.273, when `!isCollapsed && each block.payload.links && (!expandedLinkId \|\| expandedLinkId !== link.id) && link.category`
- «Título del enlace» (label) — ExternalLinkBlockEditor · l.281, when `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))`
- «Categoría» (label) — ExternalLinkBlockEditor · l.293, when `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))`
- «URL del enlace» (label) — ExternalLinkBlockEditor · l.313, when `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))`
- «Descripción» (label) — ExternalLinkBlockEditor · l.330, when `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))`
- «URL de miniatura (opcional)» (label) — ExternalLinkBlockEditor · l.343, when `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))`
- «Abrir en nueva pestaña» (label) — ExternalLinkBlockEditor · l.356, when `!isCollapsed && each block.payload.links && (!(!expandedLinkId \|\| expandedLinkId !== link.id))`

### components/blocks/FileDownloadBlockEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Subiendo archivos... / Subir archivos» | h3 |  | FileDownloadBlockEditor · l.197 |
| «Archivos ( {block.payload.files.length} )» | h3 | `block.payload.files.length > 0` | FileDownloadBlockEditor · l.215 |
| «{file.name}» | h4 | `block.payload.files.length > 0 && each block.payload.files` | FileDownloadBlockEditor · l.231 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Subiendo... / Seleccionar Archivos» | `{triggerFileUpload}` |  | `{isUploading}` |  | FileDownloadBlockEditor · l.203 |
| «[icon Download]» | `{() => window.open(file.url, '_blank')}` | `block.payload.files.length > 0 && each block.payload.files` |  |  | FileDownloadBlockEditor · l.239 |
| «[icon Trash2]» | `{() => removeFile(file.id)}` | `block.payload.files.length > 0 && each block.payload.files` |  |  | FileDownloadBlockEditor · l.246 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del Bloque» | text | «Ingrese el título para esta sección de archivos» |  |  |  | FileDownloadBlockEditor · l.141 |
| «Descripción» | textarea | «Descripción opcional para los archivos» |  |  |  | FileDownloadBlockEditor · l.154 |
| «Permitir descarga masiva (ZIP)» | checkbox |  |  |  |  | FileDownloadBlockEditor · l.166 |
| «Requiere autenticación» | checkbox |  |  |  |  | FileDownloadBlockEditor · l.175 |
|  | file | accepts `.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mov,.avi` · `multiple=true` |  | hidden by its class (`hidden`); another control opens it or it is for screen readers |  | FileDownloadBlockEditor · l.187 |
| «Descripción del archivo (opcional)» | text | «Descripción del archivo (opcional)» |  | `block.payload.files.length > 0 && each block.payload.files` |  | FileDownloadBlockEditor · l.257 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image | `type.startsWith('image/')` |  | getFileIcon · l.45 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{file.url}` | `window.open` | `block.payload.files.length > 0 && each block.payload.files` | FileDownloadBlockEditor · l.242 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `BlockEditorWrapper` |  |  |  | FileDownloadBlockEditor · l.128 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `sizes` | «Bytes», «KB», «MB», «GB» | formatFileSize · l.38 |
| `formatFileSize()` | «0 Bytes» | formatFileSize · l.36 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «0 Bytes» | FileDownloadBlockEditor · l.36 |

**Values shown from data** (2)

- `{getFileIcon(file.type)}` — FileDownloadBlockEditor · l.224, when `block.payload.files.length > 0 && each block.payload.files`
- `{formatFileSize(file.size)} • {file.type}` — FileDownloadBlockEditor · l.234, when `block.payload.files.length > 0 && each block.payload.files`

**Other texts on screen** (5)

- «Título del Bloque» (label) — FileDownloadBlockEditor · l.138
- «Descripción» (label) — FileDownloadBlockEditor · l.151
- «Permitir descarga masiva (ZIP)» (label) — FileDownloadBlockEditor · l.165
- «Requiere autenticación» (label) — FileDownloadBlockEditor · l.174
- «Selecciona múltiples archivos para subir (PDF, Word, Excel, PowerPoint, imágenes, videos)» — FileDownloadBlockEditor · l.201

### components/blocks/GroupAssignmentBlockEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{block.payload.title}» | h3 | `mode === 'preview' && block.payload.title` | GroupAssignmentBlockEditor · l.179 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar Enlace» | `{() => addResource('link')}` |  |  |  | GroupAssignmentBlockEditor · l.292 |
| «Agregar Documento» | `{() => addResource('document')}` |  |  |  | GroupAssignmentBlockEditor · l.300 |
| «[icon Trash2]» | `{() => deleteResource(resource.id)}` | `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources` |  |  | GroupAssignmentBlockEditor · l.326 |
| «Cambiar» | `{() => updateResource(resource.id, 'url', '')}` | `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources && !(resource.type === 'link') && resource.url` |  |  | GroupAssignmentBlockEditor · l.375 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
|  |  |  |  | GroupAssignmentBlockEditor · l.297 |

**Fields** (8)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título de la Tarea» | text | «Ingrese el título de la tarea grupal» |  |  |  | GroupAssignmentBlockEditor · l.245 |
| «Descripción» | textarea | «Describa brevemente la tarea grupal» |  |  |  | GroupAssignmentBlockEditor · l.259 |
| «Instrucciones» | textarea | «Proporcione instrucciones detalladas para completar la tarea» |  |  |  | GroupAssignmentBlockEditor · l.273 |
| «Título del recurso» | text | «{resource.type === 'link' ? 'Nombre del enlace' : 'Nombre del documento'}» |  | `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources` |  | GroupAssignmentBlockEditor · l.340 |
| «URL del enlace» | url | «https://ejemplo.com/recurso» |  | `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources && resource.type === 'link'` |  | GroupAssignmentBlockEditor · l.354 |
| «Archivo» | text | `readOnly=true` |  | `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources && !(resource.type === 'link') && resource.url` |  | GroupAssignmentBlockEditor · l.369 |
| «Archivo» | file | disabled: `{uploadingFile}` · accepts `.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif` |  | `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources && !(resource.type === 'link') && !(resource.url)` |  | GroupAssignmentBlockEditor · l.385 |
| «Descripción (opcional)» | textarea | «Breve descripción del recurso» |  | `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources` |  | GroupAssignmentBlockEditor · l.407 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «El archivo no debe superar los 10MB» | `file.size > 10 * 1024 * 1024` | handleFileUpload · l.89 |
| error | «Tipo de archivo no permitido. Use PDF, Word, Excel, PowerPoint, imágenes o texto.» | `!allowedTypes.includes(file.type)` | handleFileUpload · l.109 |
| success | «Archivo subido exitosamente» |  | handleFileUpload · l.149 |
| error | «Error de permisos. Por favor, contacte al administrador.» | `error.message?.includes('row-level security')` | handleFileUpload · l.155 |
| error | «Error de configuración del almacenamiento.» | `!(error.message?.includes('row-level security')) && error.message?.includes('bucket')` | handleFileUpload · l.157 |
| error | «Error al subir el archivo: {error.message \|\| 'Error des…}» | `!(error.message?.includes('row-level security')) && !(error.message?.includes('bucket'))` | handleFileUpload · l.159 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `BlockEditorWrapper` | title: Tarea Grupal · subtitle: Sin título | `mode === 'preview'` |  | GroupAssignmentBlockEditor · l.168 |
| `BlockEditorWrapper` | title: Editar Tarea Grupal · subtitle: Configure los detalles de la plantilla de tarea grupal · saveButtonText: Guardar Tarea |  |  | GroupAssignmentBlockEditor · l.228 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Error desconocido» | GroupAssignmentBlockEditor · l.159 |

**Values shown from data** (2)

- `{block.payload.description}` — GroupAssignmentBlockEditor · l.185, when `mode === 'preview' && block.payload.description`
- `{block.payload.instructions}` — GroupAssignmentBlockEditor · l.192, when `mode === 'preview' && block.payload.instructions`

**Other texts on screen** (25)

- «Instrucciones:» — GroupAssignmentBlockEditor · l.191, when `mode === 'preview' && block.payload.instructions`
- «Recursos ( {block.payload.resources.length} ):» — GroupAssignmentBlockEditor · l.198, when `mode === 'preview' && block.payload.resources && block.payload.resources.length > 0`
- «{resource.title} / Sin título» — GroupAssignmentBlockEditor · l.207, when `mode === 'preview' && block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources`
- «Los grupos y estudiantes se asignarán cuando el instructor cree una instancia de esta tarea» — GroupAssignmentBlockEditor · l.218, when `mode === 'preview'`
- «Título de la Tarea» (label) — GroupAssignmentBlockEditor · l.241
- «Descripción» (label) — GroupAssignmentBlockEditor · l.256
- «Instrucciones» (label) — GroupAssignmentBlockEditor · l.270
- «Las instrucciones específicas para cada instancia se pueden personalizar al crear la tarea» — GroupAssignmentBlockEditor · l.281
- «Recursos para la Tarea» (label) — GroupAssignmentBlockEditor · l.288
- «Enlace / Documento» — GroupAssignmentBlockEditor · l.322, when `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources`
- «Título del recurso» (label) — GroupAssignmentBlockEditor · l.337, when `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources`
- «URL del enlace» (label) — GroupAssignmentBlockEditor · l.351, when `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources && resource.type === 'link'`
- «Archivo» (label) — GroupAssignmentBlockEditor · l.364, when `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources && !(resource.type === 'link')`
- «Subiendo archivo...» — GroupAssignmentBlockEditor · l.393, when `each block.payload.resources && !(resource.type === 'link') && !(resource.url) && uploadingFile`
- «Formatos permitidos: PDF, Word, Excel, PowerPoint, texto e imágenes (máx. 10MB)» — GroupAssignmentBlockEditor · l.396, when `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources && !(resource.type === 'link') && !(resource.url)`
- «Descripción (opcional)» (label) — GroupAssignmentBlockEditor · l.404, when `block.payload.resources && block.payload.resources.length > 0 && each block.payload.resources`
- «No hay recursos agregados» — GroupAssignmentBlockEditor · l.422, when `!(block.payload.resources && block.payload.resources.length > 0)`
- «Los recursos serán visibles para los estudiantes en el espacio colaborativo» — GroupAssignmentBlockEditor · l.424, when `!(block.payload.resources && block.payload.resources.length > 0)`
- «Nota: Los recursos no se mostrarán en la lección, solo estarán disponibles cuando los estudiantes accedan a la tarea en el espacio colaborativo.» — GroupAssignmentBlockEditor · l.430
- «Información sobre Tareas Grupales» — GroupAssignmentBlockEditor · l.439
- «Esta es una plantilla que se reutilizará para diferentes cohortes» — GroupAssignmentBlockEditor · l.441
- «Los grupos se crearán cuando el instructor active una instancia de esta tarea» — GroupAssignmentBlockEditor · l.442
- «Las fechas de entrega se establecerán para cada instancia específica» — GroupAssignmentBlockEditor · l.443
- «Los estudiantes verán la tarea en &quot;Mis Tareas&quot; cuando esté activa» — GroupAssignmentBlockEditor · l.444
- «Los cambios se guardarán automáticamente al hacer clic en &quot;Guardar Tarea&quot; o al guardar la lección completa.» — GroupAssignmentBlockEditor · l.456, when `hasUnsavedChanges`

**Reads and writes the database directly:** `bucket:course-materials` (getPublicUrl, upload)

### components/blocks/ImageBlockEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar por URL» | `{addImageByUrl}` |  |  |  | ImageBlockEditor · l.169 |
| «[icon X]» | `{() => removeImage(image.id)}` | `!(images.length === 0) && each images` |  |  | ImageBlockEditor · l.222 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del bloque» | text | «Título del bloque» |  |  |  | ImageBlockEditor · l.154 |
|  | file | disabled: `{isUploading}` · accepts `image/*` · `multiple=true` |  |  |  | ImageBlockEditor · l.180 |
| «URL de la imagen» | text | «URL de la imagen» |  | `!(images.length === 0) && each images` |  | ImageBlockEditor · l.231 |
| «Texto alternativo» | text | «Texto alternativo» |  | `!(images.length === 0) && each images` |  | ImageBlockEditor · l.238 |
| «Pie de foto» | text | «Pie de foto» |  | `!(images.length === 0) && each images` |  | ImageBlockEditor · l.245 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {image.alt \|\| `Imagen ${index + 1}`} · {image.src} | `!(images.length === 0) && each images && image.src` |  | ImageBlockEditor · l.211 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error uploading {file.name}: {error.message}» | `setUploadError` | `error` | handleFileChange · l.88 |
| «Failed to upload images» | `setUploadError` |  | handleFileChange · l.107 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `BlockEditorWrapper` |  |  |  | ImageBlockEditor · l.142 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin imágenes» | ImageBlockEditor · l.139 |

**Values shown from data** (1)

- `{uploadError}` — ImageBlockEditor · l.196, when `uploadError`

**Other texts on screen** (5)

- «Título del bloque» (label) — ImageBlockEditor · l.151
- «Agregar imágenes» (label) — ImageBlockEditor · l.166
- «Subiendo...» — ImageBlockEditor · l.191, when `isUploading`
- «No hay imágenes. Sube archivos o agrega URLs.» — ImageBlockEditor · l.204, when `images.length === 0`
- «Imagen {index + 1}» — ImageBlockEditor · l.219, when `!(images.length === 0) && each images`

### components/blocks/QuizBlockEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Quiz: {block.payload.title} / Sin título» | h2 |  | QuizBlockEditor · l.161 |
| «Preguntas ( {block.payload.questions.length} )» | h3 | `!isCollapsed` | QuizBlockEditor · l.273 |
| «Pregunta {questionIndex + 1}» | h4 | `!isCollapsed && each block.payload.questions` | QuizBlockEditor · l.295 |

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ChevronDown]» | `{() => onToggleCollapse(block.id)}` |  |  |  | QuizBlockEditor · l.166 |
| «[icon Trash2]» | `{() => onDelete(block.id)}` |  |  |  | QuizBlockEditor · l.169 |
| «Agregar Pregunta» | `{addQuestion}` | `!isCollapsed` |  |  | QuizBlockEditor · l.276 |
| «Colapsar / Expandir» | `{() => setActiveQuestionId( activeQuestionId === question.id ? null : question.i…}` | `!isCollapsed && each block.payload.questions` |  |  | QuizBlockEditor · l.299 |
| «[icon Trash2]» | `{() => removeQuestion(question.id)}` | `!isCollapsed && each block.payload.questions` |  |  | QuizBlockEditor · l.309 |
| «Agregar opción» | `{() => addOption(question.id)}` | `each block.payload.questions && activeQuestionId === question.id && question.type !== 'open-ended' && question.type === 'multiple-choice' && question.options.length < 6` |  |  | QuizBlockEditor · l.373 |
| «[icon Trash2]» | `{() => removeOption(question.id, option.id)}` | `activeQuestionId === question.id && question.type !== 'open-ended' && each question.options && question.options.length > 2` |  |  | QuizBlockEditor · l.405 |
| «Eliminar Quiz» | `{() => onDelete(block.id)}` | `!isCollapsed` |  |  | QuizBlockEditor · l.485 |
| «Guardar Quiz» | `{() => onSave(block.id)}` | `!isCollapsed` |  |  | QuizBlockEditor · l.492 |

**Fields** (17)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del Quiz» | text | «Ingrese el título del quiz» |  | `!isCollapsed` |  | QuizBlockEditor · l.183 |
| «Puntos Totales» | number | `readOnly=true` |  | `!isCollapsed` |  | QuizBlockEditor · l.195 |
| «Descripción» | textarea | «Descripción del quiz (opcional)» |  | `!isCollapsed` |  | QuizBlockEditor · l.208 |
| «Instrucciones» | textarea | «Instrucciones para los estudiantes (opcional)» |  | `!isCollapsed` |  | QuizBlockEditor · l.221 |
| «Permitir reintentos» | checkbox |  |  | `!isCollapsed` |  | QuizBlockEditor · l.233 |
| «Mostrar resultados» | checkbox |  |  | `!isCollapsed` |  | QuizBlockEditor · l.242 |
| «Preguntas aleatorias» | checkbox |  |  | `!isCollapsed` |  | QuizBlockEditor · l.251 |
| «Respuestas aleatorias» | checkbox |  |  | `!isCollapsed` |  | QuizBlockEditor · l.260 |
| «Pregunta» | textarea | «Escriba la pregunta aquí...» |  | `!isCollapsed && each block.payload.questions && activeQuestionId === question.id` |  | QuizBlockEditor · l.325 |
| «Tipo de pregunta» | select |  | «Opción múltiple», «Verdadero/Falso», «Pregunta abierta» | `!isCollapsed && each block.payload.questions && activeQuestionId === question.id` |  | QuizBlockEditor · l.339 |
| «Puntos» | number | `min=1 step=1` · also `onFocus={(e) => e.target.select()}` |  | `!isCollapsed && each block.payload.questions && activeQuestionId === question.id` |  | QuizBlockEditor · l.353 |
| «Correcta» | text | «{`Opción ${String.fromCharCode(65 + optionIndex)}`}» |  | `each block.payload.questions && activeQuestionId === question.id && question.type !== 'open-ended' && each question.options` |  | QuizBlockEditor · l.389 |
| «Correcta» | radio | `{'correct-${question.id}'}` |  | `each block.payload.questions && activeQuestionId === question.id && question.type !== 'open-ended' && each question.options` |  | QuizBlockEditor · l.396 |
| «Límite de caracteres (opcional)» | number | «Sin límite» · `min=0 step=50` |  | `!isCollapsed && each block.payload.questions && activeQuestionId === question.id && question.type === 'open-ended'` |  | QuizBlockEditor · l.426 |
| «Respuesta esperada (referencia para el consultor)» | textarea | «Escriba aquí la respuesta modelo o puntos clave esperados...» |  | `!isCollapsed && each block.payload.questions && activeQuestionId === question.id && question.type === 'open-ended'` |  | QuizBlockEditor · l.441 |
| «Guía de calificación (instrucciones para el consultor)» | textarea | «Ej: Asignar puntos completos si menciona X, Y y Z. Deducir 50% si falta algún elemento clave...» |  | `!isCollapsed && each block.payload.questions && activeQuestionId === question.id && question.type === 'open-ended'` |  | QuizBlockEditor · l.454 |
| «Explicación (opcional)» | textarea | «Explique por qué esta es la respuesta correcta...» |  | `!isCollapsed && each block.payload.questions && activeQuestionId === question.id` |  | QuizBlockEditor · l.469 |

**Values shown from data** (1)

- `{String.fromCharCode(65 + optionInde…}` — QuizBlockEditor · l.386, when `each block.payload.questions && activeQuestionId === question.id && question.type !== 'open-ended' && each question.options`

**Other texts on screen** (17)

- «Título del Quiz» (label) — QuizBlockEditor · l.180, when `!isCollapsed`
- «Puntos Totales» (label) — QuizBlockEditor · l.192, when `!isCollapsed`
- «Descripción» (label) — QuizBlockEditor · l.205, when `!isCollapsed`
- «Instrucciones» (label) — QuizBlockEditor · l.218, when `!isCollapsed`
- «Permitir reintentos» (label) — QuizBlockEditor · l.232, when `!isCollapsed`
- «Mostrar resultados» (label) — QuizBlockEditor · l.241, when `!isCollapsed`
- «Preguntas aleatorias» (label) — QuizBlockEditor · l.250, when `!isCollapsed`
- «Respuestas aleatorias» (label) — QuizBlockEditor · l.259, when `!isCollapsed`
- «Pregunta» (label) — QuizBlockEditor · l.322, when `!isCollapsed && each block.payload.questions && activeQuestionId === question.id`
- «Tipo de pregunta» (label) — QuizBlockEditor · l.336, when `!isCollapsed && each block.payload.questions && activeQuestionId === question.id`
- «Puntos» (label) — QuizBlockEditor · l.350, when `!isCollapsed && each block.payload.questions && activeQuestionId === question.id`
- «Opciones de respuesta» (label) — QuizBlockEditor · l.369, when `!isCollapsed && each block.payload.questions && activeQuestionId === question.id && question.type !== 'open-ended'`
- «Correcta» (label) — QuizBlockEditor · l.403, when `each block.payload.questions && activeQuestionId === question.id && question.type !== 'open-ended' && each question.options`
- «Límite de caracteres (opcional)» (label) — QuizBlockEditor · l.423, when `!isCollapsed && each block.payload.questions && activeQuestionId === question.id && question.type === 'open-ended'`
- «Respuesta esperada (referencia para el consultor)» (label) — QuizBlockEditor · l.438, when `!isCollapsed && each block.payload.questions && activeQuestionId === question.id && question.type === 'open-ended'`
- «Guía de calificación (instrucciones para el consultor)» (label) — QuizBlockEditor · l.451, when `!isCollapsed && each block.payload.questions && activeQuestionId === question.id && question.type === 'open-ended'`
- «Explicación (opcional)» (label) — QuizBlockEditor · l.466, when `!isCollapsed && each block.payload.questions && activeQuestionId === question.id`

### components/blocks/TextBlockEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre del bloque» | text | «Ingrese un título para identificar este bloque» |  |  |  | TextBlockEditor · l.43 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `BlockEditorWrapper` |  |  |  | TextBlockEditor · l.31 |
| `TipTapEditor` |  |  |  | TextBlockEditor · l.56 |

**Other texts on screen** (2)

- «Nombre del bloque» (label) — TextBlockEditor · l.40
- «Contenido» (label) — TextBlockEditor · l.53

### components/blocks/VideoBlockEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre del bloque» | text | «Ingrese un título para identificar este bloque» |  |  |  | VideoBlockEditor · l.60 |
| «URL del Video (YouTube o Vimeo)» | text | «https://www.youtube.com/watch?v=...» |  |  | `id=video-url-{block.id}` | VideoBlockEditor · l.73 |
| «Leyenda del Video (opcional)» | text | «Descripción breve del video» |  |  | `id=video-caption-{block.id}` | VideoBlockEditor · l.100 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {`Previsualización de Video: ${block.payload.title \|\| 'Sin título'}`} · {embedUrl} | `embedUrl && block.payload.url` |  | VideoBlockEditor · l.85 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `BlockEditorWrapper` |  |  |  | VideoBlockEditor · l.48 |

**Other texts on screen** (3)

- «Nombre del bloque» (label) — VideoBlockEditor · l.57
- «URL del Video (YouTube o Vimeo)» (label) — VideoBlockEditor · l.70
- «Leyenda del Video (opcional)» (label) — VideoBlockEditor · l.97

### components/common/ConfirmModal.tsx

Used by: `/admin/course-builder/[courseId]/edit`, `/admin/learning-paths`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h3 |  | ConfirmModal · l.58 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  |  |  | ConfirmModal · l.62 |
| «{cancelText}» | `{onClose}` |  |  |  | ConfirmModal · l.79 |
| «{confirmText}» | `{handleConfirm}` |  |  |  | ConfirmModal · l.85 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{title} {message} {cancelText} {confirmText}» | `{(e) => e.stopPropagation()}` |  | ConfirmModal · l.46 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «{title}» | written in this file |  |  | ConfirmModal · l.41 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | ConfirmModal · l.31 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Confirmar acción» | ConfirmModal · l.25 |
| «Confirmar» | ConfirmModal · l.27 |
| «Cancelar» | ConfirmModal · l.28 |

**Values shown from data** (1)

- `{message}` — ConfirmModal · l.72

### components/courses/AdminCourseCard.tsx

Used by: `/admin/course-builder`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{course.title}» | h3 | `!isExpanded` | AdminCourseCard · l.182 |
| «{course.title}» | h3 | `isExpanded` | AdminCourseCard · l.204 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Editar» | `{(e) => { e.stopPropagation(); onEdit?.(course.id); }}` | `isExpanded` |  |  | AdminCourseCard · l.235 |
| «Ver» | `{(e) => { e.stopPropagation(); onView?.(course.id); }}` | `isExpanded` |  |  | AdminCourseCard · l.245 |
| «Asignar» | `{(e) => { e.stopPropagation(); onAssign?.(course.id); }}` | `isExpanded` |  |  | AdminCourseCard · l.255 |
| «Eliminar» | `{(e) => { e.stopPropagation(); onDelete?.(course.id); }}` | `isExpanded` |  |  | AdminCourseCard · l.265 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `motion.div` | «Simple / Modular [{course.title} {instructorName}] [{course.title} {instructorName} [{course.description}] Editar Ver A…» · also `onMouseEnter={handleMouseEnter} · onMouseLeave={handleMouseLeave}` | `{handleTap}` |  | AdminCourseCard · l.124 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {instructorName} · {instructorPhoto} | `instructorPhoto` |  | AdminCourseCard · l.143 |
| img · alt {course.title} · {course.thumbnail_url} | `!(instructorPhoto) && course.thumbnail_url` |  | AdminCourseCard · l.151 |
| img · alt {instructorName} · {instructorPhoto} | `isExpanded && instructorPhoto` |  | AdminCourseCard · l.211 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!isMobile \|\| !isExpanded` | AdminCourseCard · l.55 |
| `isMobile` | AdminCourseCard · l.69 |
| `isMobile` | AdminCourseCard · l.77 |
| `!isMobile` | AdminCourseCard · l.86 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CourseThumbnail` |  | `!(instructorPhoto) && !(course.thumbnail_url)` |  | AdminCourseCard · l.158 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin instructor» | AdminCourseCard · l.91 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | AdminCourseCard · l.49 |
| listener | `document.addEventListener('mousedown')` | AdminCourseCard · l.63 |

**Values shown from data** (3)

- `{instructorName}` — AdminCourseCard · l.185, when `!isExpanded`
- `{instructorName}` — AdminCourseCard · l.221, when `isExpanded`
- `{course.description}` — AdminCourseCard · l.228, when `isExpanded && course.description`

**Other texts on screen** (1)

- «Simple / Modular» — AdminCourseCard · l.170

### components/courses/CourseThumbnail.tsx

Used by: `/admin/course-builder`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{truncateTitle(title)}» | h3 |  | CourseThumbnail · l.88 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {instructorName} · {instructorPhotoUrl} | `instructorName && instructorPhotoUrl` |  | CourseThumbnail · l.103 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getDifficultyLabel()` | «Principiante», «Intermedio», «Avanzado» | getDifficultyLabel · l.44 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Principiante» | CourseThumbnail · l.44 |
| «Intermedio» | CourseThumbnail · l.46 |
| «Avanzado» | CourseThumbnail · l.48 |

**Values shown from data** (3)

- `{instructorName}` — CourseThumbnail · l.92, when `instructorName`
- `{getInitials(instructorName)}` — CourseThumbnail · l.110, when `instructorName && !(instructorPhotoUrl)`
- `{getDifficultyLabel(difficultyLevel)}` — CourseThumbnail · l.123, when `difficultyLevel && getDifficultyLabel(difficultyLevel)`

### components/courses/UpcomingCourseCard.tsx

Used by: `/admin/upcoming-courses`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{course.title}» | h3 | `!isExpanded` | UpcomingCourseCard · l.168 |
| «{course.title}» | h3 | `isExpanded` | UpcomingCourseCard · l.197 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `motion.div` | «Próximamente [{course.title} [{course.instructor.full_name}]] [{course.title} [{course.instructor.full_name}] [{course.…» · also `onMouseEnter={handleMouseEnter} · onMouseLeave={handleMouseLeave}` | `{handleTap}` |  | UpcomingCourseCard · l.119 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {course.title} · {course.thumbnail_url} | `course.thumbnail_url` |  | UpcomingCourseCard · l.139 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!isMobile \|\| !isExpanded` | UpcomingCourseCard · l.50 |
| `isMobile` | UpcomingCourseCard · l.64 |
| `isMobile` | UpcomingCourseCard · l.72 |
| `!isMobile` | UpcomingCourseCard · l.81 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | UpcomingCourseCard · l.44 |
| listener | `document.addEventListener('mousedown')` | UpcomingCourseCard · l.58 |

**Values shown from data** (4)

- `{course.instructor.full_name}` — UpcomingCourseCard · l.176, when `!isExpanded && course.instructor`
- `{course.instructor.full_name}` — UpcomingCourseCard · l.207, when `isExpanded && course.instructor`
- `{course.description}` — UpcomingCourseCard · l.215, when `isExpanded && course.description`
- `{formattedDate}` — UpcomingCourseCard · l.247, when `!isExpanded && formattedDate`

**Other texts on screen** (4)

- «Próximamente» — UpcomingCourseCard · l.161
- «Disponible en {formattedDate}» — UpcomingCourseCard · l.224, when `isExpanded && formattedDate`
- «Fecha por confirmar» — UpcomingCourseCard · l.232, when `isExpanded && !(formattedDate)`
- «Fecha por confirmar» — UpcomingCourseCard · l.255, when `!isExpanded && !(formattedDate)`

### components/layout/FunctionalPageHeader.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/[moduleId]`, `/admin/course-builder/[courseId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`, `/admin/course-builder`, `/admin/learning-paths`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h1 |  | FunctionalPageHeader · l.47 |
| «{title}» | h1 |  | MobileFunctionalPageHeader · l.122 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[{primaryAction.icon}] {primaryAction.label}» | `{primaryAction.onClick}` | `primaryAction` |  |  | FunctionalPageHeader · l.75 |
| «[{primaryAction.icon}] {primaryAction.label} +» | `{primaryAction.onClick}` | `primaryAction` |  |  | MobileFunctionalPageHeader · l.128 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{searchPlaceholder}» | text | «{searchPlaceholder}» |  | `onSearchChange` |  | FunctionalPageHeader · l.60 |
| «{searchPlaceholder}» | text | «{searchPlaceholder}» |  | `onSearchChange` |  | MobileFunctionalPageHeader · l.147 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Buscar...» | FunctionalPageHeader · l.32 |

**Values shown from data** (5)

- `{icon}` — FunctionalPageHeader · l.44
- `{subtitle}` — FunctionalPageHeader · l.92, when `subtitle`
- `{icon}` — MobileFunctionalPageHeader · l.119
- `{children}` — MobileFunctionalPageHeader · l.159, when `children`
- `{subtitle}` — MobileFunctionalPageHeader · l.168, when `subtitle`

### components/ui/button.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Button» | l.54 |

### config/blockTypes.ts

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `BLOCK_TYPES` | «Bloque de Texto», «Contenido con formato», «Contenido de texto con formato rich text», «Bloque de Video», «Video multimedia», «Videos de YouTube, Vimeo o archivos locales», «Evaluación Interactiva», «Quiz de evaluación», «Cuestionarios y evaluaciones con puntuación», «Archivos para Descargar», «Recursos descargables», «Documentos, PDFs y archivos para descargar», «Enlaces Externos», «Recursos externos», «Enlaces organizados a recursos web externos», «Tarea Grupal», «Asignación colaborativa», «Tarea para grupos de estudiantes con entrega conjunta», «Bibliografía», «Referencias y recursos», «Colección de PDFs y enlaces externos organizados» | l.22 |
| `getBlockSubtitle()` | «Contenido configurado / Sin contenido», «Video configurado / Sin video», «Imagen configurada», «Sin imagen» | getBlockSubtitle · l.130 |

**Other texts written in the code (safety net: not tied to an element by the script)** (10)

| Text | Where |
|---|---|
| «Galería de Imágenes» | BLOCK_TYPES · l.43 |
| «Carrusel de imágenes» | BLOCK_TYPES · l.44 |
| «Imágenes individuales o carruseles múltiples» | BLOCK_TYPES · l.45 |
| «Contenido configurado» | getBlockSubtitle · l.130 |
| «Sin contenido» | getBlockSubtitle · l.130 |
| «Video configurado» | getBlockSubtitle · l.132 |
| «Sin video» | getBlockSubtitle · l.132 |
| «{imageCount} imágenes» | getBlockSubtitle · l.136 |
| «Imagen configurada» | getBlockSubtitle · l.138 |
| «Sin imagen» | getBlockSubtitle · l.140 |

### hooks/useDebounce.ts

Used by: `/admin/assignment-matrix`, `/admin/courses/[id]/assign`, `/admin/learning-paths/[id]/assign`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, delay)` | useDebounce · l.7 |

### src/components/CourseBuilderForm.tsx

Used by: `/admin/course-builder`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Guardando... / Crear Curso» (submits the form) |  |  | `{loading}` |  | CourseBuilderForm · l.204 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del Curso» | text | «Ingresa el título del curso» · required |  |  | `id=courseTitle (id used by code)` | CourseBuilderForm · l.113 |
| «Descripción del Curso» | textarea | «Ingresa la descripción del curso» · required |  |  | `id=courseDescription (id used by code)` | CourseBuilderForm · l.128 |
| «Simple Las lecciones se organizan directamente en el curso sin módulos. Ideal para cursos cortos (1-5 lecciones).» | radio | `structure` |  |  | `id=structure-simple (id used by code)` | CourseBuilderForm · l.145 |
| «Modular Las lecciones se organizan en módulos. Ideal para cursos completos con múltiples temas.» | radio | `structure` |  |  | `id=structure-structured (id used by code)` | CourseBuilderForm · l.163 |
| «Instructor» | select | required | «Selecciona un instructor...», «(lista) {instructor.full_name}» |  | `id=instructorSelect (id used by code)` | CourseBuilderForm · l.187 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | CourseBuilderForm · l.108 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «HTTP error! status: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchInstructors · l.40 |
| «Por favor selecciona un instructor» | `setErrorMessage` | `!selectedInstructorId \|\| selectedInstructorId.trim() === ''` | handleSubmit · l.60 |
| «Error al crear el curso:» | `setErrorMessage` | `error` | handleSubmit · l.78 |
| «✅ ¡Curso creado exitosamente!» | `setSuccessMessage` | `!(error)` | handleSubmit · l.80 |

**Values shown from data** (2)

- `{successMessage}` — CourseBuilderForm · l.98, when `successMessage`
- `{errorMessage}` — CourseBuilderForm · l.103, when `errorMessage`

**Other texts on screen** (6)

- «Título del Curso» (label) — CourseBuilderForm · l.110
- «Descripción del Curso» (label) — CourseBuilderForm · l.125
- «Estructura del Curso» (label) — CourseBuilderForm · l.140
- «Simple Las lecciones se organizan directamente en el curso sin módulos. Ideal para cursos cortos (1-5 lecciones).» (label) — CourseBuilderForm · l.154
- «Modular Las lecciones se organizan en módulos. Ideal para cursos completos con múltiples temas.» (label) — CourseBuilderForm · l.172
- «Instructor» (label) — CourseBuilderForm · l.184

**Reads and writes the database directly:** `table:courses` (insert)

### src/components/TipTapEditor.tsx

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{item.label}» · tooltip «{item.title}» · aria «{item.ariaLabel}» | `{item.action}` |  | `{!isEnabled}` |  | renderButton · l.91 |
| «Reducir / Expandir» · tooltip «{isFullscreen ? 'Minimizar (Esc)' : 'Maximizar'}» · aria «{isFullscreen ? 'Minimizar editor' : 'Maximizar editor'}» | `{onToggleFullscreen}` | `expandable && onToggleFullscreen` |  |  | MenuBar · l.122 |
| «Cerrar» · tooltip «Cerrar (Esc)» · aria «Cerrar pantalla completa» | `{() => setIsFullscreen(false)}` |  |  |  | TipTapEditor · l.383 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editor en pantalla completa» | written in this file |  |  | TipTapEditor · l.375 |

**Draws nothing when** (5)

| Condition | Where |
|---|---|
| `!editor` | MenuBar · l.73 |
| `!editor \|\| editor.isFocused` | TipTapEditor · l.185 |
| `current === next` | TipTapEditor · l.188 |
| `!isFullscreen` | TipTapEditor · l.193 |
| `!editor` | TipTapEditor · l.348 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Icon` | aria-hidden: true |  |  | renderButton · l.101 |
| `Minimize2Icon` | aria-hidden: true | `expandable && onToggleFullscreen && isFullscreen` |  | MenuBar · l.130 |
| `Maximize2Icon` | aria-hidden: true | `expandable && onToggleFullscreen && !(isFullscreen)` |  | MenuBar · l.132 |
| `XIcon` | aria-hidden: true |  |  | TipTapEditor · l.390 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `toolbarGroups` | «Negrita», «Negrita (Ctrl+B)», «Cursiva», «Cursiva (Ctrl+I)», «Subrayado», «Subrayar», «Subrayado (Ctrl+U)», «Encabezado nivel 2», «Título 2», «Encabezado 2 (Ctrl+Alt+2)», «Encabezado nivel 3», «Título 3», «Encabezado 3 (Ctrl+Alt+3)», «Lista con viñetas», «Viñetas», «Lista con viñetas (Ctrl+Shift+8)», «Lista numerada», «Números», «Lista numerada (Ctrl+Shift+7)», «Deshacer», «Deshacer (Ctrl+Z)», «Rehacer», «Rehacer (Ctrl+Shift+Z)» | TipTapEditor · l.206 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (11)

| Kind | What | Where |
|---|---|---|
| role | `role=toolbar` | MenuBar · l.108 |
| listener | `window.addEventListener('keydown')` | TipTapEditor · l.197 |
| focus | `editor.chain().focus()` | TipTapEditor · l.213 |
| focus | `editor.chain().focus()` | TipTapEditor · l.226 |
| focus | `editor.chain().focus()` | TipTapEditor · l.239 |
| focus | `editor.chain().focus()` | TipTapEditor · l.257 |
| focus | `editor.chain().focus()` | TipTapEditor · l.271 |
| focus | `editor.chain().focus()` | TipTapEditor · l.290 |
| focus | `editor.chain().focus()` | TipTapEditor · l.303 |
| focus | `editor.chain().focus()` | TipTapEditor · l.321 |
| focus | `editor.chain().focus()` | TipTapEditor · l.334 |

**Values shown from data** (1)

- `{group.buttons.map(renderButton)}` — MenuBar · l.114, when `each toolbarGroups`

**Other texts on screen** (2)

- «Formato de texto» (aria-label) — MenuBar · l.108
- «Editor» — TipTapEditor · l.382

### types/roles.ts

Used by: `/admin/assignment-matrix`, `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/[moduleId]`, `/admin/course-builder/[courseId]/edit`, `/admin/course-builder/[courseId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`, `/admin/course-builder`, `/admin/course-builder/new`, `/admin/courses/[id]/assign`, `/admin/learning-paths`, `/admin/learning-paths/[id]/assign`, `/admin/learning-paths/[id]/edit`, `/admin/learning-paths/new`, `/admin/upcoming-courses`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `ROLE_NAMES` | «Administrador Global», «Consultor FNE», «Equipo Directivo», «Líder de Generación», «Líder de Comunidad», «Supervisor de Red», «Community Manager», «Docente», «Encargado de Licitacion» | l.305 |
| `ROLE_DESCRIPTIONS` | «Staff de FNE con control total de la plataforma. Pueden pertenecer a comunidades para colaboración.», «Consultores FNE asignados a colegios específicos. Pueden pertenecer a comunidades para colaboración.», «Administradores a nivel de colegio. Pueden pertenecer a comunidades para colaboración.», «Líderes de generaciones Tractor/Innova. Pueden pertenecer a comunidades para colaboración.», «Líderes de Comunidades de Crecimiento (2-16 miembros). Crean automáticamente su propia comunidad.», «Supervisores con acceso limitado a reportes de una red específica de colegios. Pueden inscribirse en cursos como estudiantes.», «Gestores de comunidad con acceso a panel, perfil, aprendizaje, cursos y rendición de gastos.», «Docentes participantes en cursos. Pueden pertenecer a comunidades para colaboración.», «Encargados de procesos de licitacion en establecimientos educacionales. Gestionan el proceso de contratacion de ATEs bajo Ley SEP.» | l.318 |
| `ROLE_ORGANIZATIONAL_REQUIREMENTS` | «Global role - no organizational scope required», «Must be assigned to a specific school», «Must be assigned to a specific school and generation», «Must be assigned to a school (community auto-created)», «Network-level role - no specific school required», «Content management role - no organizational scope required», «Must be assigned to a specific school for procurement management» | l.342 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Unknown role type: {roleType}» | validateRoleAssignment · l.413 |
| «Role "{ROLE_NAMES[roleType]}" requires a school assignment» | validateRoleAssignment · l.421 |
| «Role "{ROLE_NAMES[roleType]}" requires a generation assignment» | validateRoleAssignment · l.429 |
| «Role "{ROLE_NAMES[roleType]}" requires a community assignment» | validateRoleAssignment · l.437 |

### utils/authHelpers.ts

Used by: `/admin/upcoming-courses`

**Access checks in the code** (3)

| Line of code | Where |
|---|---|
| `{ effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, contextUser.id)` | getEnhancedUserInfo · l.32 |
| `{ effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, session.user.id)` | getEnhancedUserInfo · l.52 |
| `{ effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, sessionData.user.id)` | getEnhancedUserInfo · l.76 |

### utils/roleUtils.ts

Used by: `/admin/assignment-matrix`, `/admin/course-builder/[courseId]/[moduleId]`, `/admin/course-builder/[courseId]/edit`, `/admin/course-builder/[courseId]`, `/admin/course-builder/new`, `/admin/courses/[id]/assign`, `/admin/learning-paths`, `/admin/learning-paths/[id]/assign`, `/admin/learning-paths/[id]/edit`, `/admin/learning-paths/new`, `/admin/upcoming-courses`

**Access checks in the code** (7)

| Line of code | Where |
|---|---|
| `return await isGlobalAdmin(supabase, userId);` | hasAdminPrivileges · l.161 |
| `userRoles = await getUserRoles(supabase, userId)` | getEffectiveRoleAndStatus · l.1151 |
| `highestRole = getHighestRole(userRoles)` | getEffectiveRoleAndStatus · l.1152 |
| `isAdmin = await hasAdminPrivileges(supabase, userId)` | getEffectiveRoleAndStatus · l.1158 |
| `isAdmin = await hasAdminPrivileges(supabase, userId)` | getEffectiveRoleAndStatus · l.1158 |
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

### utils/storage.js

Used by: `/admin/course-builder/[courseId]/[moduleId]/[lessonId]`, `/admin/course-builder/[courseId]/lesson/[lessonId]`

**Reads and writes the database directly:** `bucket:{bucketName}` (getPublicUrl, list, upload)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/assignment-matrix/audit-log` | `pages/api/admin/assignment-matrix/audit-log.ts` | GET | `/admin/assignment-matrix` | `__tests__/api/admin/assignment-matrix-lp-report-scope.test.ts`, `__tests__/api/admin/assignment-matrix-quotes-forged-session.test.ts`, `components/admin/assignment-matrix/AuditLogSection.tsx`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/admin/assignment-matrix/content-stats` | `pages/api/admin/assignment-matrix/content-stats.ts` | GET | `/admin/assignment-matrix` | `__tests__/api/admin/assignment-matrix-lp-report-scope.test.ts`, `__tests__/api/admin/assignment-matrix-quotes-forged-session.test.ts`, `__tests__/middleware.test.ts`, `components/admin/assignment-matrix/ContentBatchView.tsx`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/admin/assignment-matrix/group-assignments` | `pages/api/admin/assignment-matrix/group-assignments.ts` | GET | `/admin/assignment-matrix` | `__tests__/api/admin/assignment-matrix-lp-report-scope.test.ts`, `__tests__/api/admin/assignment-matrix-quotes-forged-session.test.ts`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/admin/assignment-matrix/user-assignments` | `pages/api/admin/assignment-matrix/user-assignments.ts` | GET | `/admin/assignment-matrix` | `__tests__/api/admin/assignment-matrix-lp-report-scope.test.ts`, `__tests__/api/learning-paths/governance-boundary.test.ts`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/admin/course-assignments` | `pages/api/admin/course-assignments.ts` | DELETE, GET, POST | `/admin/courses/[id]/assign` | `__tests__/api/admin/auth-cookie-boundary.test.ts`, `__tests__/api/admin/course-assignments.test.ts`, `components/AssignTeachersModal.tsx`, `pages/admin/courses/[id]/assign.tsx`, `tests/e2e/learning-path-governance.spec.ts` +2 |
| `/api/admin/courses` | `pages/api/admin/courses/index.ts` | GET | `/admin/assignment-matrix`, `/admin/course-builder` | `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`, `pages/admin/course-builder/index.tsx` |
| `/api/admin/get-instructors` | `pages/api/admin/get-instructors.ts` | GET | `/admin/course-builder`, `/admin/upcoming-courses` | `pages/admin/upcoming-courses/index.tsx`, `src/components/CourseBuilderForm.tsx` |
| `/api/courses/[id]` | `pages/api/courses/[id].ts` | GET | `/admin/courses/[id]/assign` | `__tests__/api/reports/detailed-rpc-definitions.test.ts`, `pages/admin/courses/[id]/assign.tsx`, `scripts/seed-qa-phase2.js` |
| `/api/courses/batch-assign` | `pages/api/courses/batch-assign.ts` | POST | `/admin/assignment-matrix`, `/admin/courses/[id]/assign` | `__tests__/api/courses/batch-assign.test.ts`, `components/admin/assignment-matrix/BatchAssignModal.tsx`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`, `pages/admin/courses/[id]/assign.tsx`, `scripts/populate-qa-scenarios.js` +1 |
| `/api/courses/complete` | `pages/api/courses/complete.ts` | POST | **no screen** | `__tests__/api/cursos-admin-only-routes.test.ts` |
| `/api/courses/search-assignees` | `pages/api/courses/search-assignees.ts` | POST | `/admin/assignment-matrix`, `/admin/courses/[id]/assign` | `components/admin/assignment-matrix/BatchAssignModal.tsx`, `pages/admin/courses/[id]/assign.tsx` |
| `/api/courses/unassign` | `pages/api/courses/unassign.ts` | DELETE | `/admin/assignment-matrix`, `/admin/courses/[id]/assign` | `__tests__/api/courses/unassign.test.ts`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`, `pages/admin/courses/[id]/assign.tsx` |
| `/api/learning-paths/[id]` | `pages/api/learning-paths/[id].ts` | DELETE, GET, PUT | `/admin/learning-paths`, `/admin/learning-paths/[id]/assign`, `/admin/learning-paths/[id]/edit`, `/mi-aprendizaje/ruta/[id]` | `__tests__/api/learning-paths/governance-boundary.test.ts`, `__tests__/api/learning-paths/management-routes-boundary.test.ts`, `lib/services/learningPathSessionTracker.ts`, `pages/admin/learning-paths.tsx`, `pages/admin/learning-paths/[id]/assign.tsx` +4 |
| `/api/learning-paths/[id]/enhanced-progress` | `pages/api/learning-paths/[id]/enhanced-progress.ts` | GET | `/mi-aprendizaje/ruta/[id]` | `__tests__/api/learning-paths/enhanced-progress.test.ts`, `pages/mi-aprendizaje/ruta/[id].tsx`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/analytics` | `pages/api/learning-paths/analytics.ts` | GET | `/reports` | `__tests__/api/learning-paths/analytics-contract.test.ts`, `__tests__/api/learning-paths/governance-boundary.test.ts`, `components/reports/LearningPathAnalytics.tsx`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/assign` | `pages/api/learning-paths/assign.ts` | POST | **no screen** | `__tests__/api/learning-paths/governance-boundary.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/assignments/[id]` | `pages/api/learning-paths/assignments/[id].ts` | DELETE, GET | **no screen** | `__tests__/api/learning-paths/management-routes-boundary.test.ts` |
| `/api/learning-paths/batch-assign` | `pages/api/learning-paths/batch-assign.ts` | POST | `/admin/assignment-matrix`, `/admin/learning-paths/[id]/assign` | `__tests__/api/learning-paths/management-routes-boundary.test.ts`, `components/admin/assignment-matrix/BatchAssignModal.tsx`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`, `pages/admin/learning-paths/[id]/assign.tsx` |
| `/api/learning-paths` | `pages/api/learning-paths/index.ts` | GET, POST | `/admin/learning-paths`, `/admin/learning-paths/new` | `__tests__/api/learning-paths/governance-boundary.test.ts`, `pages/admin/learning-paths.tsx`, `pages/admin/learning-paths/new.tsx`, `scripts/check-ledger.mjs`, `supabase/migrations/20260908180000_learning_path_governance.sql` +1 |
| `/api/learning-paths/my-paths` | `pages/api/learning-paths/my-paths.ts` | GET | `/dashboard`, `/mi-aprendizaje` | `__tests__/helpers/panelFakes.tsx`, `__tests__/pages/dashboard.clasico.test.tsx`, `__tests__/pages/dashboard.nuevo.test.tsx`, `__tests__/pages/dashboard.samePanel.test.tsx`, `hooks/usePanel.ts` +5 |
| `/api/learning-paths/search-assignees` | `pages/api/learning-paths/search-assignees.ts` | POST | `/admin/assignment-matrix`, `/admin/learning-paths/[id]/assign` | `__tests__/api/learning-paths/management-routes-boundary.test.ts`, `components/admin/assignment-matrix/BatchAssignModal.tsx`, `pages/admin/learning-paths/[id]/assign.tsx` |
| `/api/learning-paths/session/activity` | `pages/api/learning-paths/session/activity.ts` | POST | **no screen** | `__tests__/api/learning-paths/session-activity.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/session/end` | `pages/api/learning-paths/session/end.ts` | POST | **no screen** | `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/session/heartbeat` | `pages/api/learning-paths/session/heartbeat.ts` | POST | **no screen** | `__tests__/api/learning-paths/session-heartbeat.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/session/start` | `pages/api/learning-paths/session/start.ts` | POST | **no screen** | `__tests__/api/learning-paths/governance-boundary.test.ts`, `scripts/redesign/harness/rules.mjs`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/unassign` | `pages/api/learning-paths/unassign.ts` | DELETE | `/admin/assignment-matrix`, `/admin/learning-paths/[id]/assign` | `__tests__/api/learning-paths/management-routes-boundary.test.ts`, `__tests__/api/learning-paths/unassign-sources.test.ts`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`, `pages/admin/learning-paths/[id]/assign.tsx`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/learning-paths/user/[userId]` | `pages/api/learning-paths/user/[userId].ts` | GET | **no screen** | `__tests__/api/learning-paths/governance-boundary.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/upcoming-courses/[id]` | `pages/api/upcoming-courses/[id].ts` | DELETE, GET, PUT | `/admin/upcoming-courses` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `pages/admin/upcoming-courses/index.tsx` |
| `/api/upcoming-courses/admin` | `pages/api/upcoming-courses/admin.ts` | GET | `/admin/upcoming-courses` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `pages/admin/upcoming-courses/index.tsx` |
| `/api/upcoming-courses` | `pages/api/upcoming-courses/index.ts` | GET, POST | `/admin/upcoming-courses`, `/dashboard` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `__tests__/helpers/panelFakes.tsx`, `__tests__/pages/dashboard.clasico.test.tsx`, `__tests__/pages/dashboard.nuevo.test.tsx`, `__tests__/pages/dashboard.samePanel.test.tsx` +4 |


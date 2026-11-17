# Horas, tarifas y gastos

Area `17-horas-gastos`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `45d07ead5` (2026-11-17).

4 screen files, 10 API files, 15 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/consultant-earnings` | `pages/admin/consultant-earnings.tsx` | 169 | Consultorías › Ganancias |  |
| `/admin/consultant-rates` | `pages/admin/consultant-rates.tsx` | 102 | Consultorías › Tarifas |  |
| `/expense-reports` | `pages/expense-reports.tsx` | 778 | Gestión › Rendición de Gastos |  |
| `/mis-horas` | `pages/mis-horas.tsx` | 113 | Mi Trabajo › Mis Horas |  |

## /admin/consultant-earnings

File `pages/admin/consultant-earnings.tsx` · 169 lines · frame: MainLayout

### Who reaches it

- Menu: Consultorías › «Ganancias» → `/admin/consultant-earnings` — admin only; the group: admin or consultor (`Sidebar.tsx` l.524)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.41 `router.push → /login  (when !session?.user)`
  - l.57 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.62 `router.push → /dashboard  (when !isAdminUser)`
  - l.69 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:526`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1, consultor 1, equipo_directivo 1.

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
| «Ganancias de Consultores» | h1 |  | ConsultantEarningsPage · l.126 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Seleccionar Consultor» | select |  | «Seleccionar consultor...», «(lista) {c.first_name} {c.last_name}» |  |  | ConsultantEarningsPage · l.138 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.41 |
| `/dashboard` | `router.push` | `!isAdminUser` | initializeAuth · l.62 |
| `/login` | `router.push` |  | initializeAuth · l.69 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.57 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!router.isReady` | ConsultantEarningsPage · l.30 |
| `!user \|\| !isAdmin` | ConsultantEarningsPage · l.108 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ConsultantEarningsPage · l.113 |
| `ConsultantEarningsDashboard` |  | `selectedConsultantId` |  | ConsultantEarningsPage · l.154 |

**Other texts on screen** (4)

- «Cargando...» — ConsultantEarningsPage · l.103, when `loading`
- «Visualice las ganancias en EUR y CLP por consultor y período.» — ConsultantEarningsPage · l.128
- «Seleccionar Consultor» (label) — ConsultantEarningsPage · l.135
- «Seleccione un consultor para ver sus ganancias.» — ConsultantEarningsPage · l.160, when `!(selectedConsultantId)`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/hours/ConsultantEarningsDashboard.tsx`
- `lib/exportUtils.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/consultant-assignment-users` | GET | `pages/admin/consultant-earnings.tsx:77` |
| `/api/consultant-earnings/[consultant_id]` | GET | `components/hours/ConsultantEarningsDashboard.tsx:156` |
| `/api/consultant-earnings/[consultant_id]/pdf` | ? | `components/hours/ConsultantEarningsDashboard.tsx:286` |

## /admin/consultant-rates

File `pages/admin/consultant-rates.tsx` · 102 lines · frame: MainLayout

### Who reaches it

- Menu: Consultorías › «Tarifas» → `/admin/consultant-rates` — admin only; the group: admin or consultor (`Sidebar.tsx` l.516)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.31 `router.push → /login  (when !session?.user)`
  - l.47 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.52 `router.push → /dashboard  (when !isAdminUser)`
  - l.56 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:518`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1, consultor 1, equipo_directivo 2.

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
| «Tarifas de Consultores» | h1 |  | ConsultantRatesPage · l.88 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.31 |
| `/dashboard` | `router.push` | `!isAdminUser` | initializeAuth · l.52 |
| `/login` | `router.push` |  | initializeAuth · l.56 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.47 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!router.isReady` | ConsultantRatesPage · l.20 |
| `!user \|\| !isAdmin` | ConsultantRatesPage · l.70 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ConsultantRatesPage · l.75 |
| `ConsultantRateManager` |  |  |  | ConsultantRatesPage · l.95 |

**Other texts on screen** (2)

- «Cargando...» — ConsultantRatesPage · l.65, when `loading`
- «Gestione las tarifas por hora en EUR para cada consultor y tipo de servicio.» — ConsultantRatesPage · l.90

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/admin/ConsultantRateManager.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/consultant-assignment-users` | GET | `components/admin/ConsultantRateManager.tsx:142` |
| `/api/admin/consultant-rates` | GET, POST | `components/admin/ConsultantRateManager.tsx:124`, `components/admin/ConsultantRateManager.tsx:272` |
| `/api/admin/consultant-rates/[id]` | DELETE, PATCH | `components/admin/ConsultantRateManager.tsx:236`, `components/admin/ConsultantRateManager.tsx:302` |
| `/api/admin/consultant-rates/csv` | ? | `components/admin/ConsultantRateManager.tsx:372` |
| `/api/hour-types` | GET | `components/admin/ConsultantRateManager.tsx:155` |

## /expense-reports

File `pages/expense-reports.tsx` · 778 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Rendición de Gastos» → `/expense-reports` — permission: view_expense_reports_all or view_expense_reports_school or view_expense_reports_own; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.577)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.110 `router.push → /login  (when !session?.user)`
  - l.123 `hasAccess = false`
  - l.126 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.148 `router.push → /dashboard  (when !hasAccess)`
  - l.161 `router.push → /login`
  - l.210 `router.push → /login`
- Linked from: `components/DynamicFavicon.tsx:40`, `components/layout/Sidebar.tsx:579`, `lib/auth/forced-password-change.ts:149`, `middleware.ts:344`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1, community_manager 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | pass |
| equipo_directivo | no | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | if permission view_expense_reports_all or view_expense_reports_school or view_expense_reports_own | pass |
| docente | no | pass |
| encargado_licitacion | if permission view_expense_reports_all or view_expense_reports_school or view_expense_reports_own | pass |

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Crear Nuevo Reporte / Editar Reporte» | h1 | `(activeTab === 'nuevo' \|\| activeTab === 'editar')` | ExpenseReportsPage · l.477 |
| «No hay reportes de gastos» | h3 | `activeTab === 'lista' && !(expenseReports.length > 0)` | ExpenseReportsPage · l.619 |
| «Eliminar Reporte» | h3 | `deleteModalReport` | ExpenseReportsPage · l.670 |
| «Conectar Telegram» | h3 | `telegramLink` | ExpenseReportsPage · l.714 |

**Buttons** (14)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Generando… / Conectar Telegram» · tooltip «Vincular tu Telegram para enviar boletas desde el celular» | `{handleConnectTelegram}` | `activeTab === 'lista'` | `{generatingTelegramCode}` |  | ExpenseReportsPage · l.413 |
| «PDF» · tooltip «Exportar todos los reportes como PDF» | `{async () => { try { await ExpenseReportExporter.exportMultipleReportsToPDF(expe…}` | `activeTab === 'lista' && expenseReports.length > 0` |  |  | ExpenseReportsPage · l.425 |
| «Excel» · tooltip «Exportar todos los reportes como Excel» | `{async () => { try { await ExpenseReportExporter.exportMultipleReportsToExcel(ex…}` | `activeTab === 'lista' && expenseReports.length > 0` |  |  | ExpenseReportsPage · l.441 |
| «Volver a Reportes» | `{() => setActiveTab('lista')}` | `(activeTab === 'nuevo' \|\| activeTab === 'editar')` |  |  | ExpenseReportsPage · l.469 |
| «[icon Eye]» · tooltip «Ver detalles» | `{() => setSelectedReport(report)}` | `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue…` |  |  | ExpenseReportsPage · l.551 |
| «[icon Edit]» · tooltip «Editar reporte» | `{() => { setEditingReport(report); setActiveTab('editar'); }}` | `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue… && report.status === 'draft' && report.submitted_by === currentUser.id` |  |  | ExpenseReportsPage · l.561 |
| «[icon Send]» · tooltip «Enviar para revisión» | `{() => handleSubmitReport(report.id)}` | `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue… && report.status === 'draft' && report.submitted_by === currentUser.id` |  |  | ExpenseReportsPage · l.571 |
| «[icon Check]» · tooltip «Aprobar reporte» | `{() => handleApproveReport(report.id)}` | `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue… && isDesignatedApprover() && report.status === 'submitted'` |  |  | ExpenseReportsPage · l.583 |
| «[icon X]» · tooltip «Rechazar reporte» | `{() => handleRejectReport(report.id)}` | `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue… && isDesignatedApprover() && report.status === 'submitted'` |  |  | ExpenseReportsPage · l.590 |
| «[icon Trash2]» · tooltip «Eliminar reporte» | `{() => setDeleteModalReport(report)}` | `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue… && (((report.submitted_by === currentUser.id && report.status === 'draft') \|\| isAdmin))` |  |  | ExpenseReportsPage · l.601 |
| «Crear Primer Reporte» | `{() => setActiveTab('nuevo')}` | `activeTab === 'lista' && !(expenseReports.length > 0)` |  |  | ExpenseReportsPage · l.621 |
| «Cancelar» | `{() => setDeleteModalReport(null)}` | `deleteModalReport` |  |  | ExpenseReportsPage · l.686 |
| «Eliminar Reporte» | `{() => handleDeleteReport(deleteModalReport)}` | `deleteModalReport` |  |  | ExpenseReportsPage · l.692 |
| «Cerrar» | `{() => setTelegramLink(null)}` | `telegramLink` |  |  | ExpenseReportsPage · l.744 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Abrir Telegram» | `{telegramLink.deepLink}` (new tab) | `telegramLink && telegramLink.deepLink` |  | ExpenseReportsPage · l.729 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.499 |
| «Período» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.500 |
| «Total» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.501 |
| «Estado» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.502 |
| «Enviado por» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.503 |
| «Acciones» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.504 |

**Pop-ups** (3)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Eliminar Reporte» | written in this file | `deleteModalReport` |  | ExpenseReportsPage · l.662 |
| «Conectar Telegram» | written in this file | `telegramLink` |  | ExpenseReportsPage · l.706 |
| `ExpenseReportDetails` | component | `{!!selectedReport}` |  | ExpenseReportsPage · l.757 |

**Browser prompt()** (1)

| Text | When | Where |
|---|---|---|
| «Comentarios de rechazo (opcional):» |  | handleRejectReport · l.344 |

**Toasts** (15)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No se pudo generar el código. Inténtalo de nuevo.» |  | handleConnectTelegram · l.99 |
| error | «Error al cargar los reportes de gastos» |  | loadExpenseReports · l.186 |
| error | «Error al cargar las categorías» |  | loadCategories · l.202 |
| success | «Reporte eliminado exitosamente» |  | handleDeleteReport · l.279 |
| error | «Error al eliminar el reporte:» |  | handleDeleteReport · l.283 |
| success | «Reporte enviado para revisión» |  | handleSubmitReport · l.303 |
| error | «Error al enviar el reporte:» |  | handleSubmitReport · l.307 |
| success | «Reporte aprobado» |  | handleApproveReport · l.335 |
| error | «Error al aprobar el reporte:» |  | handleApproveReport · l.339 |
| success | «Reporte rechazado» |  | handleRejectReport · l.370 |
| error | «Error al rechazar el reporte:» |  | handleRejectReport · l.374 |
| success | «Resumen exportado como PDF» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.429 |
| error | «Error al exportar PDF» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.431 |
| success | «Resumen exportado como Excel» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.445 |
| error | «Error al exportar Excel» | `activeTab === 'lista' && expenseReports.length > 0` | ExpenseReportsPage · l.447 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «link-code request failed: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | handleConnectTelegram · l.93 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.110 |
| `/dashboard` | `router.push` | `!hasAccess` | checkSession · l.148 |
| `/login` | `router.push` |  | checkSession · l.161 |
| `/login` | `router.push` |  | handleLogout · l.210 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `hasAccess = false` | checkSession · l.123 |
| `userRole = await getUserPrimaryRole(session.user.id)` | checkSession · l.126 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ExpenseReportsPage · l.390 |
| `ResponsiveFunctionalPageHeader` | title: Rendición de Gastos · subtitle: Gestión de reportes de gastos y reembolsos · searchPlaceholder: Buscar por nombre, descripción... · primaryAction: Nuevo Reporte | `activeTab === 'lista'` |  | ExpenseReportsPage · l.400 |
| `ExpenseReportForm` |  | `activeTab === 'nuevo'` |  | ExpenseReportsPage · l.634 |
| `ExpenseReportForm` |  | `activeTab === 'editar' && editingReport` |  | ExpenseReportsPage · l.645 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getStatusText()` | «Borrador», «Enviado», «Aprobado», «Rechazado» | getStatusText · l.260 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | ExpenseReportsPage · l.90 |
| «Borrador» | ExpenseReportsPage · l.260 |
| «Aprobado» | ExpenseReportsPage · l.262 |
| «Rechazado» | ExpenseReportsPage · l.263 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.208 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.209 |

**Values shown from data** (8)

- `{report.report_name}` — ExpenseReportsPage · l.523, when `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue…`
- `{report.description}` — ExpenseReportsPage · l.525, when `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue… && report.description`
- `{formatDate(report.start_date)} - {formatDate(report.end_date)}` — ExpenseReportsPage · l.530, when `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue…`
- `{formatCurrency(report.total_amount)}` — ExpenseReportsPage · l.535, when `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue…`
- `{getStatusText(report.status)}` — ExpenseReportsPage · l.540, when `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue…`
- `{report.profiles?.first_name} {report.profiles?.last_name}` — ExpenseReportsPage · l.545, when `activeTab === 'lista' && expenseReports.length > 0 && each expenseReports .filter(report => { if (!searchQue…`
- `{deleteModalReport.report_name}` — ExpenseReportsPage · l.678, when `deleteModalReport`
- `{telegramLink.code}` — ExpenseReportsPage · l.724, when `telegramLink`

**Other texts on screen** (9)

- «Cargando...» — ExpenseReportsPage · l.383, when `loading`
- «{expenseReports.length} reporte / reportes» — ExpenseReportsPage · l.489, when `activeTab === 'lista'`
- «Comienza creando tu primer reporte de gastos» — ExpenseReportsPage · l.620, when `activeTab === 'lista' && !(expenseReports.length > 0)`
- «Esta acción no se puede deshacer» — ExpenseReportsPage · l.671, when `deleteModalReport`
- «¿Estás seguro de que deseas eliminar el reporte» — ExpenseReportsPage · l.677, when `deleteModalReport`
- «Se eliminarán también todos los gastos asociados a este reporte.» — ExpenseReportsPage · l.681, when `deleteModalReport`
- «Envía boletas desde tu celular» — ExpenseReportsPage · l.715, when `telegramLink`
- «Abre Telegram y envíale este código al bot, o toca el enlace directo:» — ExpenseReportsPage · l.721, when `telegramLink`
- «El código vence en 15 minutos. Luego solo envía una foto de tu boleta al bot.» — ExpenseReportsPage · l.739, when `telegramLink`

**Reads and writes the database directly:** `table:expense_categories` (select), `table:expense_report_access` (select), `table:expense_reports` (delete, select, update), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/expenses/ExpenseReportDetails.tsx`
- `components/expenses/ExpenseReportForm.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `lib/currency-service.ts`
- `lib/expenseReportExport.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/bots/link-code` | POST | `pages/expense-reports.tsx:88` |
| `/api/expense-reports/[id]/notify` | POST | `pages/expense-reports.tsx:228` |
| `/api/expense-reports/receipt-link` | ? | `components/expenses/ExpenseReportDetails.tsx:111`, `components/expenses/ExpenseReportForm.tsx:707` |

## /mis-horas

File `pages/mis-horas.tsx` · 113 lines · frame: MainLayout

### Who reaches it

- Menu: Mi Trabajo › «Mis Horas» → `/mis-horas` — admin or consultor; the group: admin or consultor (`Sidebar.tsx` l.194)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.33 `router.push → /login  (when !session?.user)`
  - l.52 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.59 `router.push → /dashboard  (when !isAdminUser && !isConsultor)`
  - l.63 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:196`, `lib/auth/forced-password-change.ts:153`, `middleware.ts:348`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: consultor 5.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | no | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Mis Horas» | h1 |  | MisHorasPage · l.95 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.33 |
| `/dashboard` | `router.push` | `!isAdminUser && !isConsultor` | initializeAuth · l.59 |
| `/login` | `router.push` |  | initializeAuth · l.63 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.52 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!router.isReady` | MisHorasPage · l.22 |
| `!user` | MisHorasPage · l.77 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | MisHorasPage · l.82 |
| `HelpButton` | sectionId: mis-horas |  |  | MisHorasPage · l.100 |
| `ConsultantEarningsDashboard` |  |  |  | MisHorasPage · l.103 |

**Other texts on screen** (2)

- «Cargando...» — MisHorasPage · l.72, when `loading`
- «Consulte sus ganancias en EUR y CLP por período de tiempo.» — MisHorasPage · l.97

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/hours/ConsultantEarningsDashboard.tsx`
- `components/tutorials/HelpButton.tsx`
- `components/tutorials/HelpDrawer.tsx`
- `components/tutorials/VimeoEmbed.tsx`
- `components/ui/dialog.tsx`
- `lib/exportUtils.ts`
- `lib/tutorials/content.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/consultant-earnings/[consultant_id]` | GET | `components/hours/ConsultantEarningsDashboard.tsx:156` |
| `/api/consultant-earnings/[consultant_id]/pdf` | ? | `components/hours/ConsultantEarningsDashboard.tsx:286` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/admin/ConsultantRateManager.tsx

Used by: `/admin/consultant-rates`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Tarifa / Agregar Tarifa» | h2 | `showModal` | ConsultantRateManager · l.506 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar Tarifa» | `{openAddModal}` |  |  |  | ConsultantRateManager · l.381 |
| «[icon Edit2]» · aria «{`Editar tarifa de ${rate.profiles?.first_name ?? 'consultor'}`}» | `{() => openEditModal(rate)}` | `!(loading) && !(rates.length === 0) && each rates` |  |  | ConsultantRateManager · l.451 |
| «Confirmar» | `{() => { handleDeactivate(rate); setConfirmDeactivate(null); }}` | `!(loading) && !(rates.length === 0) && each rates && active && confirmDeactivate?.id === rate.id` |  |  | ConsultantRateManager · l.460 |
| «No» | `{() => setConfirmDeactivate(null)}` | `!(loading) && !(rates.length === 0) && each rates && active && confirmDeactivate?.id === rate.id` |  |  | ConsultantRateManager · l.469 |
| «[icon X]» · aria «{`Desactivar tarifa de ${rate.profiles?.first_name ?? 'consultor'}`}» | `{() => setConfirmDeactivate(rate)}` | `!(rates.length === 0) && each rates && !(active && confirmDeactivate?.id === rate.id) && active` |  |  | ConsultantRateManager · l.477 |
| «[icon X]» · aria «Cerrar dialogo» | `{closeModal}` | `showModal` |  |  | ConsultantRateManager · l.510 |
| «Cancelar» | `{closeModal}` | `showModal` | `{saving}` |  | ConsultantRateManager · l.624 |
| «Guardando... / Actualizar / Crear Tarifa» | `{handleSave}` | `showModal` | `{saving}` |  | ConsultantRateManager · l.631 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Exportar CSV» | `/api/admin/consultant-rates/csv` |  |  | ConsultantRateManager · l.371 |

**Fields** (8)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Solo activas» | select |  | «Todos los consultores», «(lista) {c.first_name} {c.last_name}» |  |  | ConsultantRateManager · l.329 |
| «Solo activas» | select |  | «Todos los tipos de hora», «(lista) {ht.display_name}» |  |  | ConsultantRateManager · l.343 |
| «Solo activas» | checkbox |  |  |  |  | ConsultantRateManager · l.358 |
| «Consultor *» | select |  | «Seleccionar consultor...», «(lista) {c.first_name} {c.last_name}» | `showModal && !editingRate` |  | ConsultantRateManager · l.535 |
| «Tipo de Hora *» | select |  | «Seleccionar tipo de hora...», «(lista) {ht.display_name}» | `showModal && !editingRate` |  | ConsultantRateManager · l.556 |
| «Tarifa (EUR/hora) *» | number | «0.00» · `min=0 step=0.01` |  | `showModal` |  | ConsultantRateManager · l.580 |
| «Vigente Desde *» | date |  |  | `showModal && !editingRate` |  | ConsultantRateManager · l.598 |
| «Vigente Hasta (vacío = sin fecha de término)» | date |  |  | `showModal` |  | ConsultantRateManager · l.613 |

**Table columns** (7)

| Text | Shown when | Where |
|---|---|---|
| «Consultor» | `!(loading) && !(rates.length === 0)` | ConsultantRateManager · l.404 |
| «Tipo de Hora» | `!(loading) && !(rates.length === 0)` | ConsultantRateManager · l.405 |
| «Tarifa EUR» | `!(loading) && !(rates.length === 0)` | ConsultantRateManager · l.406 |
| «Vigente Desde» | `!(loading) && !(rates.length === 0)` | ConsultantRateManager · l.407 |
| «Vigente Hasta» | `!(loading) && !(rates.length === 0)` | ConsultantRateManager · l.408 |
| «Estado» | `!(loading) && !(rates.length === 0)` | ConsultantRateManager · l.409 |
| «Acciones» | `!(loading) && !(rates.length === 0)` | ConsultantRateManager · l.410 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Tarifa / Agregar Tarifa» | written in this file | `showModal` |  | ConsultantRateManager · l.498 |

**Toasts** (7)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar tarifas» | `!response.ok` | ConsultantRateManager · l.128 |
| error | «Error de red al cargar tarifas» |  | ConsultantRateManager · l.134 |
| success | «Tarifa actualizada correctamente» | `editingRate` | handleSave · l.248 |
| success | «Tarifa creada correctamente» | `!(editingRate)` | handleSave · l.284 |
| error | «Error al desactivar tarifa» | `!response.ok` | handleDeactivate · l.308 |
| success | «Tarifa desactivada correctamente» |  | handleDeactivate · l.312 |
| error | «Error de red al desactivar tarifa» |  | handleDeactivate · l.315 |

**Messages set on the page** (7)

| Text | Set by | When | Where |
|---|---|---|---|
| «La tarifa EUR debe ser un número válido mayor o igual a 0.» | `setFormError` | `isNaN(rateEur) \|\| rateEur < 0` | handleSave · l.220 |
| «Error al actualizar tarifa» | `setFormError` | `editingRate && !response.ok` | handleSave · l.244 |
| «Debe seleccionar un consultor.» | `setFormError` | `!(editingRate) && !payload.consultant_id` | handleSave · l.260 |
| «Debe seleccionar un tipo de hora.» | `setFormError` | `!(editingRate) && !payload.hour_type_key` | handleSave · l.264 |
| «La fecha de inicio es requerida.» | `setFormError` | `!(editingRate) && !payload.effective_from` | handleSave · l.268 |
| «Error al crear tarifa» | `setFormError` | `!(editingRate) && !response.ok` | handleSave · l.280 |
| «Error de red. Intente nuevamente.» | `setFormError` |  | handleSave · l.290 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> Exportar CSV` |  | ConsultantRateManager · l.371 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!response.ok` | ConsultantRateManager · l.143 |
| `!response.ok` | ConsultantRateManager · l.156 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| focus | `modalRef.current.focus()` | openAddModal · l.183 |
| focus | `modalRef.current.focus()` | openEditModal · l.197 |

**Values shown from data** (5)

- `{rate.profiles.first_name} {rate.profiles.last_name} / —` — ConsultantRateManager · l.418, when `!(loading) && !(rates.length === 0) && each rates`
- `{formatEur(rate.rate_eur)}` — ConsultantRateManager · l.433, when `!(loading) && !(rates.length === 0) && each rates`
- `{formatDate(rate.effective_from)}` — ConsultantRateManager · l.436, when `!(loading) && !(rates.length === 0) && each rates`
- `{formatDate(rate.effective_to)}` — ConsultantRateManager · l.437, when `!(loading) && !(rates.length === 0) && each rates`
- `{formError}` — ConsultantRateManager · l.523, when `showModal && formError`

**Other texts on screen** (9)

- «Solo activas» (label) — ConsultantRateManager · l.357
- «Cargando tarifas...» — ConsultantRateManager · l.394, when `loading`
- «No se encontraron tarifas con los filtros seleccionados.» — ConsultantRateManager · l.397, when `!(loading) && rates.length === 0`
- «Activa / Inactiva» — ConsultantRateManager · l.439, when `!(loading) && !(rates.length === 0) && each rates`
- «Consultor *» (label) — ConsultantRateManager · l.532, when `showModal && !editingRate`
- «Tipo de Hora *» (label) — ConsultantRateManager · l.553, when `showModal && !editingRate`
- «Tarifa (EUR/hora) *» (label) — ConsultantRateManager · l.573, when `showModal`
- «Vigente Desde *» (label) — ConsultantRateManager · l.595, when `showModal && !editingRate`
- «Vigente Hasta (vacío = sin fecha de término)» (label) — ConsultantRateManager · l.609, when `showModal`

### components/expenses/ExpenseReportDetails.tsx

Used by: `/expense-reports`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{report.report_name}» | h2 |  | ExpenseReportDetails · l.181 |
| «Información General» | h3 |  | ExpenseReportDetails · l.270 |
| «Estado y Fechas» | h3 |  | ExpenseReportDetails · l.299 |
| «Gastos Detallados ( {report.expense_items.length} )» | h3 | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.336 |
| «Resumen por Categoría» | h3 | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.423 |
| «{category}» | h4 | `report.expense_items && report.expense_items.length > 0 && each Object.entries( report.expense_items.reduce((acc,…` | ExpenseReportDetails · l.447 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Eye]» · tooltip «{`Ver boleta: ${item.receipt_filename \|\| 'archivo'}`}» | `{() => handleReceiptClick(item)}` | `hasReceipt` |  |  | ReceiptCell · l.140 |
| «[icon Download]» · tooltip «Descargar boleta» | `{async () => { const url = await getReceiptUrl(item); if (url) { const link = do…}` | `hasReceipt` |  |  | ReceiptCell · l.147 |
| «[icon X]» | `{onClose}` |  |  |  | ExpenseReportDetails · l.184 |
| «PDF» · tooltip «Descargar como PDF» | `{async () => { try { console.log('ExpenseReportExporter:', ExpenseReportExporter…}` |  |  |  | ExpenseReportDetails · l.206 |
| «Excel» · tooltip «Descargar como Excel» | `{async () => { try { await ExpenseReportExporter.exportToExcel(report); toast.su…}` |  |  |  | ExpenseReportDetails · l.230 |
| «Editar» · tooltip «{report.status !== 'draft' ? 'Editar como autor del reporte' : 'Editar reporte'}» | `{() => onEdit(report)}` | `(isAdmin \|\| (currentUser && report.submitted_by === currentUser.id) \|\| report.status === 'draft')` |  |  | ExpenseReportDetails · l.248 |
| «Eliminar» | `{() => onDelete(report)}` |  |  |  | ExpenseReportDetails · l.257 |

**Table columns** (7)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.344 |
| «Categoría» | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.345 |
| «Descripción» | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.346 |
| «Proveedor» | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.347 |
| «N° Factura/Boleta» | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.348 |
| «Monto» | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.349 |
| «Boleta» | `report.expense_items && report.expense_items.length > 0` | ExpenseReportDetails · l.350 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «{report.report_name}» | written in this file |  |  | ExpenseReportDetails · l.175 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No se pudo abrir la boleta» | `!(url)` | handleReceiptClick · l.128 |
| error | «No se pudo abrir la boleta» | `hasReceipt && !(url)` | ReceiptCell · l.156 |
| success | «Reporte exportado como PDF» | `ExpenseReportExporter && typeof ExpenseReportExporter.exportToPDF === 'function'` | ExpenseReportDetails · l.215 |
| error | «Error al exportar PDF» |  | ExpenseReportDetails · l.220 |
| success | «Reporte exportado como Excel» |  | ExpenseReportDetails · l.234 |
| error | «Error al exportar Excel» |  | ExpenseReportDetails · l.236 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «exportToPDF is not a function» | `throw (shown by whoever catches it)` | `!(ExpenseReportExporter && typeof ExpenseReportExporter.exportToPDF === 'function')` | ExpenseReportDetails · l.217 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `archivo: receipt.pdf` | `hasReceipt && url` | ReceiptCell · l.153 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{url}` | `window.open` | `url` | handleReceiptClick · l.126 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen \|\| !report` | ExpenseReportDetails · l.77 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getStatusText()` | «Borrador», «Enviado», «Aprobado», «Rechazado» | getStatusText · l.99 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Borrador» | ExpenseReportDetails · l.99 |
| «Aprobado» | ExpenseReportDetails · l.101 |
| «Rechazado» | ExpenseReportDetails · l.102 |

**Values shown from data** (16)

- `{getStatusText(report.status)}` — ExpenseReportDetails · l.197
- `{report.description}` — ExpenseReportDetails · l.284, when `report.description`
- `{report.profiles?.email}` — ExpenseReportDetails · l.292
- `{formatDate(report.created_at)}` — ExpenseReportDetails · l.304
- `{formatDate(report.submitted_at)}` — ExpenseReportDetails · l.310, when `report.submitted_at`
- `{formatDate(report.reviewed_at)}` — ExpenseReportDetails · l.317, when `report.reviewed_at`
- `{report.review_comments}` — ExpenseReportDetails · l.324, when `report.review_comments`
- `{formatDate(item.expense_date)}` — ExpenseReportDetails · l.356, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items`
- `{item.description}` — ExpenseReportDetails · l.371, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items`
- `{item.notes}` — ExpenseReportDetails · l.373, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items && item.notes`
- `{item.vendor} / -` — ExpenseReportDetails · l.376, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items`
- `{item.expense_number} / -` — ExpenseReportDetails · l.379, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items`
- `{formatCurrencyWithSymbol(item.origi…}` — ExpenseReportDetails · l.386, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items && item.currency && item.currency !== 'CLP' && item.original_amount`
- `$ {item.amount.toLocaleString('es-CL')}` — ExpenseReportDetails · l.394, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items && !(item.currency && item.currency !== 'CLP' && item.original_amount)`
- `{formatCurrency(report.total_amount)}` — ExpenseReportDetails · l.409, when `report.expense_items && report.expense_items.length > 0`
- `{formatCurrency(data.total)}` — ExpenseReportDetails · l.452, when `report.expense_items && report.expense_items.length > 0 && each Object.entries( report.expense_items.reduce((acc,…`

**Other texts on screen** (15)

- «Boleta disponible» (title) — ReceiptCell · l.164, when `hasReceipt`
- «Sin boleta» — ReceiptCell · l.171
- «Detalles del Reporte de Gastos» — ExpenseReportDetails · l.182
- «Total:» — ExpenseReportDetails · l.201
- «Período» — ExpenseReportDetails · l.274
- «Descripción» — ExpenseReportDetails · l.283, when `report.description`
- «Enviado por» — ExpenseReportDetails · l.289
- «Creado» — ExpenseReportDetails · l.303
- «Enviado» — ExpenseReportDetails · l.309, when `report.submitted_at`
- «Revisado» — ExpenseReportDetails · l.316, when `report.reviewed_at`
- «Comentarios de Revisión» — ExpenseReportDetails · l.323, when `report.review_comments`
- «{item.expense_categories?.name} / Sin categoría» — ExpenseReportDetails · l.365, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items`
- «≈ $ {item.amount.toLocaleString('es-CL')} CLP» — ExpenseReportDetails · l.389, when `report.expense_items && report.expense_items.length > 0 && each report.expense_items && item.currency && item.currency !== 'CLP' && item.original_amount`
- «Total:» — ExpenseReportDetails · l.407, when `report.expense_items && report.expense_items.length > 0`
- «{data.count} gasto s» — ExpenseReportDetails · l.449, when `report.expense_items && report.expense_items.length > 0 && each Object.entries( report.expense_items.reduce((acc,…`

### components/expenses/ExpenseReportForm.tsx

Used by: `/expense-reports`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Reporte de Gastos / Nuevo Reporte de Gastos» | h2 |  | ExpenseReportForm · l.459 |
| «Información del Reporte» | h3 |  | ExpenseReportForm · l.467 |
| «Gastos» | h3 |  | ExpenseReportForm · l.526 |
| «Gasto {index + 1}» | h4 | `each expenseItems` | ExpenseReportForm · l.547 |

**Buttons** (6)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar Gasto» | `{addExpenseItem}` |  |  |  | ExpenseReportForm · l.527 |
| «[icon Trash2]» · tooltip «Eliminar gasto» | `{() => removeExpenseItem(index)}` | `each expenseItems && expenseItems.length > 1` |  |  | ExpenseReportForm · l.549 |
| «Ver Boleta» · tooltip «Ver boleta» | `{async () => { try { // GES-1.5: a just-chosen file opens from the browser's // …}` | `each expenseItems && ((item.receipt_url \|\| item.receipt_filename))` |  |  | ExpenseReportForm · l.699 |
| «Eliminar» · tooltip «Eliminar y reemplazar» | `{() => handleReceiptDelete(index)}` | `each expenseItems && ((item.receipt_url \|\| item.receipt_filename))` |  |  | ExpenseReportForm · l.732 |
| «Cancelar» | `{onCancel}` |  |  |  | ExpenseReportForm · l.796 |
| «Guardando... / Actualizar Reporte / Guardar Reporte» | `{handleSaveReport}` |  | `{loading}` |  | ExpenseReportForm · l.804 |

**Fields** (13)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre del Reporte *» | text | «Ej: Gastos Marzo 2025» |  |  |  | ExpenseReportForm · l.474 |
| «Descripción» | text | «Descripción opcional del reporte» |  |  |  | ExpenseReportForm · l.487 |
| «Fecha de Inicio *» | date |  |  |  |  | ExpenseReportForm · l.500 |
| «Fecha de Fin *» | date | `min={reportForm.start_date}` |  |  |  | ExpenseReportForm · l.512 |
| «Categoría *» | select |  | «Seleccionar categoría», «(lista) {category.name}» | `each expenseItems` |  | ExpenseReportForm · l.565 |
| «Descripción *» | text | «Descripción del gasto» |  | `each expenseItems` |  | ExpenseReportForm · l.583 |
| «💰 Moneda *» | select |  | «(lista) {currency.symbol} {currency.code} - {currency.name}» | `each expenseItems` |  | ExpenseReportForm · l.596 |
| «💵 Monto ( {item.currency} ) *» | number | «0.00» · `min=0 step={(item.currency === 'CLP' \|\| !item.currency) ? '1' : '0.01'}` |  | `each expenseItems` |  | ExpenseReportForm · l.614 |
| «Fecha del Gasto *» | date |  |  | `each expenseItems` |  | ExpenseReportForm · l.643 |
| «Proveedor» | text | «Nombre del proveedor» |  | `each expenseItems` |  | ExpenseReportForm · l.655 |
| «Número de Factura/Boleta» | text | «Ej: 12345, B-001, F-4567» |  | `each expenseItems` |  | ExpenseReportForm · l.668 |
| «Subiendo archivo... / Hacer clic para subir boleta PDF, JPG, PNG (máx. 50MB)» | file | accepts `.pdf,.jpg,.jpeg,.png,.gif,.webp` |  | `each expenseItems && (!((item.receipt_url \|\| item.receipt_filename)))` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | ExpenseReportForm · l.745 |
| «Notas» | textarea | «Notas adicionales sobre este gasto» |  | `each expenseItems` |  | ExpenseReportForm · l.780 |

**Toasts** (16)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al convertir moneda» | `(field === 'currency' \|\| field === 'amount') && sourceAmount > 0 && item.currency` | updateExpenseItem · l.173 |
| success | «✅ Boleta subida exitosamente: {file.name}» |  | handleReceiptUpload · l.210 |
| error | «Error al subir la boleta:» |  | handleReceiptUpload · l.214 |
| error | «Error al eliminar la boleta del servidor:» | `fileName && deleteError` | handleReceiptDelete · l.241 |
| error | «Error al actualizar la base de datos» | `item.id && dbError` | handleReceiptDelete · l.258 |
| success | «Boleta eliminada» |  | handleReceiptDelete · l.293 |
| error | «Error al eliminar la boleta» |  | handleReceiptDelete · l.297 |
| error | «El nombre del reporte es obligatorio» | `!reportForm.report_name.trim()` | handleSaveReport · l.310 |
| error | «Las fechas de inicio y fin son obligatorias» | `!reportForm.start_date \|\| !reportForm.end_date` | handleSaveReport · l.315 |
| error | «La fecha de inicio no puede ser posterior a la fecha de fin» | `new Date(reportForm.start_date) > new Date(reportForm.end_date)` | handleSaveReport · l.320 |
| error | «Debe agregar al menos un gasto válido» | `validItems.length === 0` | handleSaveReport · l.329 |
| success | «Reporte actualizado exitosamente» | `editingReport` | handleSaveReport · l.390 |
| success | «Reporte creado exitosamente» | `!(editingReport)` | handleSaveReport · l.444 |
| error | «Error al guardar el reporte:» |  | handleSaveReport · l.450 |
| error | «No se pudo abrir la boleta» | `each expenseItems && ((item.receipt_url \|\| item.receipt_filename)) && !(url)` | ExpenseReportForm · l.719 |
| error | «Error al abrir la boleta» | `each expenseItems && ((item.receipt_url \|\| item.receipt_filename))` | ExpenseReportForm · l.723 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Usuario no autenticado» | `throw (shown by whoever catches it)` | `!(editingReport) && !user` | handleSaveReport · l.395 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` |  | handleReceiptUpload · l.199 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{url}` | `window.open` | `each expenseItems && ((item.receipt_url \|\| item.receipt_filename)) && url` | ExpenseReportForm · l.717 |

**Other texts on screen** (19)

- «Nombre del Reporte *» (label) — ExpenseReportForm · l.471
- «Descripción» (label) — ExpenseReportForm · l.484
- «Fecha de Inicio *» (label) — ExpenseReportForm · l.497
- «Fecha de Fin *» (label) — ExpenseReportForm · l.509
- «Total del Reporte:» — ExpenseReportForm · l.539
- «Categoría *» (label) — ExpenseReportForm · l.562, when `each expenseItems`
- «Descripción *» (label) — ExpenseReportForm · l.580, when `each expenseItems`
- «💰 Moneda *» (label) — ExpenseReportForm · l.593, when `each expenseItems`
- «💵 Monto ( {item.currency} ) *» (label) — ExpenseReportForm · l.610, when `each expenseItems`
- «CLP» — ExpenseReportForm · l.632, when `each expenseItems && item.currency !== 'CLP' && item.conversion_rate && item.original_amount`
- «Tasa: {item.conversion_rate?.toFixed(2)}» — ExpenseReportForm · l.633, when `each expenseItems && item.currency !== 'CLP' && item.conversion_rate && item.original_amount`
- «Fecha del Gasto *» (label) — ExpenseReportForm · l.640, when `each expenseItems`
- «Proveedor» (label) — ExpenseReportForm · l.652, when `each expenseItems`
- «Número de Factura/Boleta» (label) — ExpenseReportForm · l.665, when `each expenseItems`
- «📄 Boleta/Recibo» (label) — ExpenseReportForm · l.681, when `each expenseItems`
- «✅ {item.receipt_filename} / Archivo subido» — ExpenseReportForm · l.690, when `each expenseItems && ((item.receipt_url \|\| item.receipt_filename))`
- «Boleta subida correctamente» — ExpenseReportForm · l.693, when `each expenseItems && ((item.receipt_url \|\| item.receipt_filename))`
- «Subiendo archivo... / Hacer clic para subir boleta PDF, JPG, PNG (máx. 50MB)» (label) — ExpenseReportForm · l.744, when `each expenseItems && (!((item.receipt_url \|\| item.receipt_filename)))`
- «Notas» (label) — ExpenseReportForm · l.777, when `each expenseItems`

**Reads and writes the database directly:** `bucket:{RECEIPTS_BUCKET}` (remove, upload), `rpc:recompute_expense_report_total`, `table:expense_items` (delete, insert, update), `table:expense_reports` (insert, select, update)

### components/hours/ConsultantEarningsDashboard.tsx

Used by: `/admin/consultant-earnings`, `/mis-horas`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Desglose por Tipo de Hora» | h3 | `!loading && data && !(data.by_hour_type.length === 0)` | ConsultantEarningsDashboard · l.378 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Actualizar» | `{loadEarnings}` |  | `{loading}` |  | ConsultantEarningsDashboard · l.265 |
| «Exportar CSV» | `{handleExportCSV}` | `data && data.by_hour_type.length > 0` |  |  | ConsultantEarningsDashboard · l.276 |
| «Descargar PDF» | `{() => { window.open( '/api/consultant-earnings/${consultantId}/pdf?from=${from}…}` | `data && data.by_hour_type.length > 0` |  |  | ConsultantEarningsDashboard · l.283 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Desde» | date |  |  |  |  | ConsultantEarningsDashboard · l.249 |
| «Hasta» | date |  |  |  |  | ConsultantEarningsDashboard · l.258 |

**Table columns** (7)

| Text | Shown when | Where |
|---|---|---|
| «Tipo de Hora» | `!loading && data && !(data.by_hour_type.length === 0)` | ConsultantEarningsDashboard · l.386 |
| «Hs. Ejecutadas» | `!loading && data && !(data.by_hour_type.length === 0)` | ConsultantEarningsDashboard · l.389 |
| «Hs. Penalizadas» | `!loading && data && !(data.by_hour_type.length === 0)` | ConsultantEarningsDashboard · l.392 |
| «Total Horas» | `!loading && data && !(data.by_hour_type.length === 0)` | ConsultantEarningsDashboard · l.395 |
| «Tarifa EUR/h» | `!loading && data && !(data.by_hour_type.length === 0)` | ConsultantEarningsDashboard · l.398 |
| «Total EUR» | `!loading && data && !(data.by_hour_type.length === 0)` | ConsultantEarningsDashboard · l.401 |
| «Total CLP» | `!loading && data && !(data.by_hour_type.length === 0)` | ConsultantEarningsDashboard · l.404 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No hay datos para exportar.» | `!data \|\| data.by_hour_type.length === 0` | handleExportCSV · l.185 |
| success | «CSV descargado correctamente» |  | handleExportCSV · l.232 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «La fecha de inicio no puede ser posterior a la fecha de término.» | `setError` | `from > to` | ConsultantEarningsDashboard · l.146 |
| «Error al cargar ganancias» | `setError` | `!response.ok` | ConsultantEarningsDashboard · l.161 |
| «Error de red al cargar ganancias.» | `setError` |  | ConsultantEarningsDashboard · l.167 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/api/consultant-earnings/[*]/pdf?from=[*]&to=[*]` | `window.open` | `data && data.by_hour_type.length > 0` | ConsultantEarningsDashboard · l.285 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!from \|\| !to` | ConsultantEarningsDashboard · l.144 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Download` | aria-hidden: true | `data && data.by_hour_type.length > 0` |  | ConsultantEarningsDashboard · l.280 |
| `FileText` | aria-hidden: true | `data && data.by_hour_type.length > 0` |  | ConsultantEarningsDashboard · l.292 |
| `KPICard` | title: Total Horas · subtitle: Ejecutadas + Penalizadas | `!loading && data` |  | ConsultantEarningsDashboard · l.343 |
| `KPICard` | title: Total EUR · subtitle: Según tarifas vigentes | `!loading && data` |  | ConsultantEarningsDashboard · l.350 |
| `KPICard` | title: Total CLP · subtitle: TC: {fxRate.rate_clp_per_eur.toL…} CLP/EUR | `!loading && data` |  | ConsultantEarningsDashboard · l.357 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Ganancias — {consultantName ?? 'Consulto…} ({data.period.from} a {data.period.to})» | ConsultantEarningsDashboard · l.215 |
| «Consultor» | ConsultantEarningsDashboard · l.215 |
| «Horas Totales» | ConsultantEarningsDashboard · l.218 |
| «Horas Ejecutadas» | ConsultantEarningsDashboard · l.219 |
| «Horas Penalizadas» | ConsultantEarningsDashboard · l.220 |

**Values shown from data** (16)

- `{title}` — KPICard · l.109
- `{value}` — KPICard · l.110
- `{subtitle}` — KPICard · l.111, when `subtitle`
- `{icon}` — KPICard · l.117
- `{error}` — ConsultantEarningsDashboard · l.304, when `error`
- `{row.display_name}` — ConsultantEarningsDashboard · l.412, when `!loading && data && !(data.by_hour_type.length === 0) && each data.by_hour_type`
- `{row.executed_hours.toFixed(2)}` — ConsultantEarningsDashboard · l.415, when `!loading && data && !(data.by_hour_type.length === 0) && each data.by_hour_type`
- `{row.penalized_hours.toFixed(2)}` — ConsultantEarningsDashboard · l.418, when `!loading && data && !(data.by_hour_type.length === 0) && each data.by_hour_type`
- `{row.total_hours.toFixed(2)}` — ConsultantEarningsDashboard · l.421, when `!loading && data && !(data.by_hour_type.length === 0) && each data.by_hour_type`
- `{formatEur(row.total_eur)}` — ConsultantEarningsDashboard · l.429, when `!loading && data && !(data.by_hour_type.length === 0) && each data.by_hour_type`
- `{formatClp(row.total_clp)}` — ConsultantEarningsDashboard · l.432, when `!loading && data && !(data.by_hour_type.length === 0) && each data.by_hour_type`
- `{data.by_hour_type .reduce((s, r) =>…}` — ConsultantEarningsDashboard · l.442, when `!loading && data && !(data.by_hour_type.length === 0)`
- `{data.by_hour_type .reduce((s, r) =>…}` — ConsultantEarningsDashboard · l.447, when `!loading && data && !(data.by_hour_type.length === 0)`
- `{totals?.total_hours.toFixed(2)}` — ConsultantEarningsDashboard · l.452, when `!loading && data && !(data.by_hour_type.length === 0)`
- `{formatEur(totals?.total_eur ?? 0)}` — ConsultantEarningsDashboard · l.456, when `!loading && data && !(data.by_hour_type.length === 0)`
- `{formatClp(totals?.total_clp ?? null)}` — ConsultantEarningsDashboard · l.459, when `!loading && data && !(data.by_hour_type.length === 0)`

**Other texts on screen** (11)

- «Desde» (label) — ConsultantEarningsDashboard · l.248
- «Hasta» (label) — ConsultantEarningsDashboard · l.257
- «Cargando ganancias...» — ConsultantEarningsDashboard · l.311, when `loading`
- «Tipo de cambio:» — ConsultantEarningsDashboard · l.329, when `!loading && data && fxRate`
- «1 EUR = {fxRate.rate_clp_per_eur.toLocaleStr…} CLP» — ConsultantEarningsDashboard · l.329, when `!loading && data && fxRate`
- «(actualizado:» — ConsultantEarningsDashboard · l.331, when `!loading && data && fxRate`
- «— Advertencia: este tipo de cambio puede estar desactualizado.» — ConsultantEarningsDashboard · l.334, when `!loading && data && fxRate && fxRate.is_stale`
- «No hay horas consumidas o penalizadas en el período seleccionado.» — ConsultantEarningsDashboard · l.373, when `!loading && data && data.by_hour_type.length === 0`
- «Sin tarifa» — ConsultantEarningsDashboard · l.426, when `!loading && data && !(data.by_hour_type.length === 0) && each data.by_hour_type && !(row.rate_eur !== null)`
- «Total» — ConsultantEarningsDashboard · l.441, when `!loading && data && !(data.by_hour_type.length === 0)`
- «Seleccione un período y haga clic en Actualizar para ver las ganancias.» — ConsultantEarningsDashboard · l.474, when `!loading && !data && !error`

### components/layout/FunctionalPageHeader.tsx

Used by: `/expense-reports`

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

### components/tutorials/HelpButton.tsx

Used by: `/mis-horas`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon HelpCircle]» · aria «Ayuda y tutoriales» | `{() => setOpen(true)}` |  |  |  | HelpButton · l.15 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `HelpDrawer` | component | `{open}` |  | HelpButton · l.23 |

### components/tutorials/HelpDrawer.tsx

Used by: `/mis-horas`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{section.overview.title} ( {section.overview.durationMin} min)» | h3 |  | HelpDrawer · l.32 |
| «Otros videos cortos» | h3 | `section.deepDives.length > 0` | HelpDrawer · l.43 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{open}` |  | HelpDrawer · l.23 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | HelpDrawer · l.24 |
| `DialogHeader` |  |  |  | HelpDrawer · l.25 |
| `DialogTitle` |  |  |  | HelpDrawer · l.26 |
| `DialogDescription` |  |  |  | HelpDrawer · l.27 |
| `VimeoEmbed` |  |  |  | HelpDrawer · l.38 |
| `VimeoEmbed` |  | `section.deepDives.length > 0 && each section.deepDives` |  | HelpDrawer · l.55 |

**Values shown from data** (1)

- `{step}` — HelpDrawer · l.59, when `section.deepDives.length > 0 && each section.deepDives && dive.textSteps && dive.textSteps.length > 0 && each dive.textSteps`

**Other texts on screen** (3)

- «Ayuda — {section.title}» — HelpDrawer · l.26
- «Videos y guías para {section.title.toLowerCase()}» — HelpDrawer · l.27
- «{dive.title} {dive.durationMin} min» (label) — HelpDrawer · l.47, when `section.deepDives.length > 0 && each section.deepDives`

### components/tutorials/VimeoEmbed.tsx

Used by: `/mis-horas`

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {title} · {`https://player.vimeo.com/video/${vimeoId}?dnt=1`} |  |  | VimeoEmbed · l.21 |

**Other texts on screen** (1)

- «Video próximamente» — VimeoEmbed · l.13, when `!vimeoId`

### components/ui/dialog.tsx

Used by: `/mis-horas`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### lib/currency-service.ts

Used by: `/expense-reports`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Exchange rate API error» | `throw (shown by whoever catches it)` | `!response.ok` | fetchExchangeRates · l.65 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `formatters` | «USD», «EUR», «GBP», «CLP» | formatCurrency · l.150 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Peso Chileno» | getAvailableCurrencies · l.187 |
| «Dólar Estadounidense» | getAvailableCurrencies · l.188 |
| «Euro» | getAvailableCurrencies · l.189 |
| «Libra Esterlina» | getAvailableCurrencies · l.190 |

### lib/expenseReportExport.ts

Used by: `/expense-reports`

**Downloads and printing** (4)

| How | When | Where |
|---|---|---|
| `doc.save()` |  | exportToPDF · l.315 |
| `XLSX.writeFile()` |  | exportToExcel · l.462 |
| `doc.save()` |  | exportMultipleReportsToPDF · l.557 |
| `XLSX.writeFile()` |  | exportMultipleReportsToExcel · l.616 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (9)

| Name | Texts | Where |
|---|---|---|
| `filename` | «Reporte_Gastos_{report.report_name.replace(…}_{new Date().toISOString().sl…}.pdf» | exportToPDF · l.314 |
| `summaryData` | «REPORTE DE GASTOS», «Información General», «Nombre del Reporte:», «Estado:», «Período:», «{this.formatDate(report.star…} - {this.formatDate(report.end_…}», «Total:», «Descripción:», «Información del Solicitante», «Nombre:», «{report.profiles?.first_name} {report.profiles?.last_name}», «Email:», «Fecha de Creación:», «Fecha de Envío:» | exportToExcel · l.323 |
| `itemsData` | «Fecha», «Categoría», «Descripción», «Proveedor», «N° Factura/Boleta», «Monto (CLP)», «Moneda», «Monto Original», «Tasa de Cambio», «Tiene Boleta», «Notas» | exportToExcel · l.357 |
| `categoryData` | «Resumen por Categoría», «Categoría», «Cantidad de Gastos», «Total (CLP)» | exportToExcel · l.423 |
| `filename` | «Reporte_Gastos_{report.report_name.replace(…}_{new Date().toISOString().sl…}.xlsx» | exportToExcel · l.461 |
| `filename` | «Resumen_Reportes_Gastos_{new Date().toISOString().sl…}.pdf» | exportMultipleReportsToPDF · l.556 |
| `summaryData` | «RESUMEN DE REPORTES DE GASTOS», «Total de reportes:», «Monto total:», «Fecha de generación:», «Nombre del Reporte», «Período», «Estado», «Enviado por», «Email», «Total (CLP)» | exportMultipleReportsToExcel · l.565 |
| `filename` | «Resumen_Reportes_Gastos_{new Date().toISOString().sl…}.xlsx» | exportMultipleReportsToExcel · l.615 |
| `getStatusText()` | «Borrador», «Enviado», «Aprobado», «Rechazado» | getStatusText · l.119 |

**Other texts written in the code (safety net: not tied to an element by the script)** (12)

| Text | Where |
|---|---|
| «Borrador» | ExpenseReportExporter · l.119 |
| «Aprobado» | ExpenseReportExporter · l.121 |
| «Rechazado» | ExpenseReportExporter · l.122 |
| «Información del Reporte» | ExpenseReportExporter · l.161 |
| «Enviado por: {report.profiles?.first_name} {report.profiles?.last_name}» | ExpenseReportExporter · l.178 |
| «Fecha de creación: {this.formatDate(report.crea…}» | ExpenseReportExporter · l.182 |
| «Fecha de envío: {this.formatDate(report.subm…}» | ExpenseReportExporter · l.185 |
| «Detalle de Gastos» | ExpenseReportExporter · l.196 |
| «Sin categoría» | ExpenseReportExporter · l.201 |
| «Página {i} de {pageCount} - Generado el {new Date().toLocaleString('…}» | ExpenseReportExporter · l.306 |
| «Gastos Detallados» | ExpenseReportExporter · l.410 |
| «Resumen Categorías» | ExpenseReportExporter · l.457 |

### lib/exportUtils.ts

Used by: `/admin/consultant-earnings`, `/mis-horas`

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al exportar a Excel» | `throw (shown by whoever catches it)` |  | exportToExcel · l.110 |
| «Error al exportar a PDF» | `throw (shown by whoever catches it)` |  | exportToPDF · l.181 |
| «Tipo de exportación no soportado» | `throw (shown by whoever catches it)` |  | exportReport · l.227 |

**Downloads and printing** (3)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` |  | exportToCSV · l.71 |
| `URL.createObjectURL()` |  | exportToExcel · l.101 |
| `doc.save()` |  | exportToPDF · l.178 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `exportData` | «Reporte FNE - {tabName}», «Sistema Genera» | exportReport · l.203 |
| `csvEscape()` | «"{safeValue.replace(/"/g, '""…}"» | csvEscape · l.30 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Período: {metadata.dateRange}» | ReportExporter · l.132 |
| «Generado por: {metadata.generatedBy}» | ReportExporter · l.137 |
| «Total de registros: {metadata.totalRecords}» | ReportExporter · l.142 |
| «Fecha de generación: {new Date().toLocaleDateStri…}» | ReportExporter · l.146 |
| «Reporte exportado como {type.toUpperCase()}» | ReportExporter · l.230 |
| «Error al exportar reporte» | ReportExporter · l.235 |

### lib/tutorials/content.ts

Used by: `/mis-horas`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TUTORIALS` | «Mi Aprendizaje», «Cómo encontrar y retomar tus cursos», «Qué significa cada estado: Comenzar / Continuar / Completado», «Mis Sesiones», «Tu día a día en Mis Sesiones», «Las 6 pestañas de una sesión», «Exportar sesiones a tu calendario (iCal)», «Mis Reportes», «Leer tus reportes de sesiones», «Mis Horas», «Revisar tus horas y exportarlas», «Por qué mis horas ejecutadas vs. penalizadas difieren», «Proceso de Cambio», «Cómo completar un Proceso de Cambio de principio a fin», «Entender la jerarquía: Objetivos, Acciones e Indicadores», «Los 5 tipos de indicador», «Cobertura como gate», «Guardado automático, progreso y envío», «Ver tus resultados», «Espacio Colaborativo», «Tu comunidad de crecimiento», «Documentos: subir, carpetas, permisos», «Mensajería: hilos, menciones, adjuntos», «Reuniones: crear acta» | l.23 |

### types/roles.ts

Used by: `/admin/consultant-earnings`, `/admin/consultant-rates`, `/expense-reports`, `/mis-horas`

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

### utils/roleUtils.ts

Used by: `/admin/consultant-earnings`, `/admin/consultant-rates`, `/expense-reports`, `/mis-horas`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/consultant-rates/[id]` | `pages/api/admin/consultant-rates/[id].ts` | DELETE, GET, PATCH | `/admin/consultant-rates` | `__tests__/api/hour-tracking/consultant-rates.test.ts`, `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`, `components/admin/ConsultantRateManager.tsx` |
| `/api/admin/consultant-rates/csv` | `pages/api/admin/consultant-rates/csv.ts` | GET | `/admin/consultant-rates` | `__tests__/api/hour-tracking/rates-csv.test.ts`, `components/admin/ConsultantRateManager.tsx` |
| `/api/admin/consultant-rates` | `pages/api/admin/consultant-rates/index.ts` | GET, POST | `/admin/consultant-rates` | `__tests__/api/hour-tracking/consultant-rates.test.ts`, `components/admin/ConsultantRateManager.tsx`, `scripts/redesign/harness/seed/30-sesiones-horas.mjs` |
| `/api/consultant-earnings/[consultant_id]` | `pages/api/consultant-earnings/[consultant_id].ts` | GET | `/admin/consultant-earnings`, `/mis-horas` | `__tests__/api/hour-tracking/earnings.test.ts`, `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`, `components/hours/ConsultantEarningsDashboard.tsx` |
| `/api/consultant-earnings/[consultant_id]/pdf` | `pages/api/consultant-earnings/[consultant_id]/pdf.ts` | GET | `/admin/consultant-earnings`, `/mis-horas` | `__tests__/api/hour-tracking/earnings-pdf.test.ts`, `components/hours/ConsultantEarningsDashboard.tsx` |
| `/api/expense-reports/[id]/notify` | `pages/api/expense-reports/[id]/notify.ts` | POST | `/expense-reports` | `__tests__/api/expense-reports/notify.test.ts`, `pages/expense-reports.tsx` |
| `/api/expense-reports/receipt-link` | `pages/api/expense-reports/receipt-link.ts` | GET | `/expense-reports` | `__tests__/api/expense-reports/receipt-link.test.ts`, `components/expenses/ExpenseReportDetails.tsx`, `components/expenses/ExpenseReportForm.tsx` |
| `/api/fx-rates/latest` | `pages/api/fx-rates/latest.ts` | GET | **no screen** | `__tests__/api/hour-tracking/fx-rates.test.ts`, `tests/e2e/fx-rates.spec.ts` |
| `/api/fx-rates/refresh` | `pages/api/fx-rates/refresh.ts` | POST | **no screen** | `__tests__/api/hour-tracking/fx-rates.test.ts`, `tests/e2e/fx-rates.spec.ts` |
| `/api/hour-types` | `pages/api/hour-types/index.ts` | GET | `/admin/bulk-tag-sessions`, `/admin/consultant-rates`, `/admin/sessions/create` | `__tests__/pages/admin/sessions/create-timezone.test.tsx`, `__tests__/pages/admin/sessions/create-zoom-managed.test.tsx`, `components/admin/ConsultantRateManager.tsx`, `pages/admin/bulk-tag-sessions.tsx`, `pages/admin/sessions/create.tsx` |


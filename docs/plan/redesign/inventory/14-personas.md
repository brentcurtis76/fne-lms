# Personas (users, schools, networks, roles, profile)

Area `14-personas`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `c7e27398c` (2026-11-22).

7 screen files, 33 API files, 24 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/network-management` | `pages/admin/network-management.tsx` | 1179 | Personas › Redes de Colegios |  |
| `/admin/role-management` | `pages/admin/role-management.tsx` | 675 | Sistema › Roles y Permisos |  |
| `/admin/school-users` | `pages/admin/school-users.tsx` | 821 | Usuarios del Colegio |  |
| `/admin/schools` | `pages/admin/schools.tsx` | 1544 | Personas › Escuelas |  |
| `/admin/tractor-signups` | `pages/admin/tractor-signups.tsx` | 776 | Personas › Registros |  |
| `/admin/user-management` | `pages/admin/user-management.tsx` | 1028 | Personas › Usuarios |  |
| `/profile` | `pages/profile.tsx` | 819 | Mi Perfil |  |

## /admin/network-management

File `pages/admin/network-management.tsx` · 1179 lines · frame: MainLayout

### Who reaches it

- Menu: Personas › «Redes de Colegios» → `/admin/network-management` — admin only; the group: admin only (`Sidebar.tsx` l.452)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.125 `router.push → /login  (when !session?.user)`
  - l.137 `role = await getUserPrimaryRole(session.user.id)`
  - l.143 `router.push → /dashboard  (when profileData && role !== 'admin')`
  - l.153 `router.push → /login`
  - l.579 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:454`
- Tests: browser tests that CI runs: `tests/e2e/network-supervisors.spec.ts`.
- QA scenarios that name this address: admin 1, community_manager 1, consultor 1, equipo_directivo 1, lider_comunidad 1, supervisor_de_red 1.

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

**Titles** (10)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Migración de Base de Datos Requerida» | h3 | `migrationError` | NetworkManagementPage · l.653 |
| «{network.name}» | h3 | `each filteredNetworks` | NetworkManagementPage · l.734 |
| «No hay redes» | h3 | `filteredNetworks.length === 0` | NetworkManagementPage · l.843 |
| «Crear Nueva Red» | h3 | `showCreateModal` | NetworkManagementPage · l.866 |
| «Editar Red» | h3 | `showEditModal && selectedNetwork` | NetworkManagementPage · l.921 |
| «Asignar Escuelas a &quot; {selectedNetwork.name} &quot;» | h3 | `showSchoolModal && selectedNetwork` | NetworkManagementPage · l.975 |
| «No hay escuelas» | h3 | `showSchoolModal && selectedNetwork && !(availableSchools.length > 0)` | NetworkManagementPage · l.1041 |
| «Asignar Supervisor a &quot; {selectedNetwork.name} &quot;» | h3 | `showSupervisorModal && selectedNetwork` | NetworkManagementPage · l.1075 |
| «No hay usuarios disponibles» | h3 | `showSupervisorModal && selectedNetwork && !(availableUsers.length > 0)` | NetworkManagementPage · l.1102 |
| «Confirmar Eliminación» | h3 | `showDeleteConfirm && selectedNetwork` | NetworkManagementPage · l.1138 |

**Buttons** (18)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Nueva Red» | `{() => setShowCreateModal(true)}` |  |  |  | NetworkManagementPage · l.632 |
| «[icon Edit3]» · tooltip «Editar red» | `{() => openEditModal(network)}` | `each filteredNetworks` |  |  | NetworkManagementPage · l.740 |
| «[icon Trash2]» · tooltip «Eliminar red» | `{() => openDeleteConfirm(network)}` | `each filteredNetworks` |  |  | NetworkManagementPage · l.747 |
| «[icon X]» · tooltip «Remover escuela» | `{() => handleRemoveSchool(school.id)}` | `each filteredNetworks && network.schools.length > 0 && each network.schools.slice(0, 3)` |  |  | NetworkManagementPage · l.777 |
| «[icon X]» · tooltip «Remover supervisor» | `{() => handleRemoveSupervisor(supervisor.user_id)}` | `each filteredNetworks && network.supervisors.length > 0 && each network.supervisors` |  |  | NetworkManagementPage · l.805 |
| «Escuelas» | `{() => openSchoolModal(network)}` | `each filteredNetworks` |  |  | NetworkManagementPage · l.820 |
| «Supervisores» | `{() => openSupervisorModal(network)}` | `each filteredNetworks` |  |  | NetworkManagementPage · l.827 |
| «Nueva Red» | `{() => setShowCreateModal(true)}` | `filteredNetworks.length === 0 && !searchQuery` |  |  | NetworkManagementPage · l.849 |
| «Cancelar» | `{() => { setShowCreateModal(false); setNetworkForm({ name: '', description: '' }…}` | `showCreateModal` |  |  | NetworkManagementPage · l.897 |
| «Crear Red» | `{handleCreateNetwork}` | `showCreateModal` |  |  | NetworkManagementPage · l.906 |
| «Cancelar» | `{() => { setShowEditModal(false); setNetworkForm({ name: '', description: '' });…}` | `showEditModal && selectedNetwork` |  |  | NetworkManagementPage · l.950 |
| «Actualizar» | `{handleUpdateNetwork}` | `showEditModal && selectedNetwork` |  |  | NetworkManagementPage · l.960 |
| «Cancelar» | `{() => { setShowSchoolModal(false); setSelectedSchools([]); setSelectedNetwork(n…}` | `showSchoolModal && selectedNetwork` |  |  | NetworkManagementPage · l.1049 |
| «Guardar Cambios ( {selectedSchools.length} )» | `{handleAssignSchools}` | `showSchoolModal && selectedNetwork` | `{selectedSchools.length === 0}` |  | NetworkManagementPage · l.1059 |
| «Cancelar» | `{() => { setShowSupervisorModal(false); setSelectedUser(''); setSelectedNetwork(…}` | `showSupervisorModal && selectedNetwork` |  |  | NetworkManagementPage · l.1110 |
| «Asignar Supervisor» | `{handleAssignSupervisor}` | `showSupervisorModal && selectedNetwork` | `{!selectedUser}` |  | NetworkManagementPage · l.1120 |
| «Cancelar» | `{() => { setShowDeleteConfirm(false); setSelectedNetwork(null); }}` | `showDeleteConfirm && selectedNetwork` |  |  | NetworkManagementPage · l.1155 |
| «Eliminar Red» | `{handleDeleteNetwork}` | `showDeleteConfirm && selectedNetwork` | `{selectedNetwork.supervisor_count > 0}` |  | NetworkManagementPage · l.1164 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «Todas las redes», «Con supervisores», «Sin supervisores» |  |  | NetworkManagementPage · l.622 |
| «Nombre de la Red *» | text | «Ej: Red Norte, Red Metropolitana» |  | `showCreateModal` |  | NetworkManagementPage · l.873 |
| «Descripción» | textarea | «Descripción opcional de la red» |  | `showCreateModal` |  | NetworkManagementPage · l.886 |
| «Nombre de la Red *» | text |  |  | `showEditModal && selectedNetwork` |  | NetworkManagementPage · l.928 |
| «Descripción» | textarea |  |  | `showEditModal && selectedNetwork` |  | NetworkManagementPage · l.940 |
| «{school.name} [En esta red] [Asignado a: {school.current_network.name}]» | checkbox | disabled: `{isDisabled}` |  | `showSchoolModal && selectedNetwork && availableSchools.length > 0 && each availableSchools` |  | NetworkManagementPage · l.1006 |
| «Seleccionar Usuario» | select |  | «Selecciona un usuario...», «(lista) {user.full_name} ( {user.email} )» | `showSupervisorModal && selectedNetwork && availableUsers.length > 0` |  | NetworkManagementPage · l.1085 |

**Pop-ups** (5)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Crear Nueva Red» | written in this file | `showCreateModal` |  | NetworkManagementPage · l.864 |
| «Editar Red» | written in this file | `showEditModal && selectedNetwork` |  | NetworkManagementPage · l.919 |
| «Asignar Escuelas a &quot; {selectedNetwork.name} &quot;» | written in this file | `showSchoolModal && selectedNetwork` |  | NetworkManagementPage · l.973 |
| «Asignar Supervisor a &quot; {selectedNetwork.name} &quot;» | written in this file | `showSupervisorModal && selectedNetwork` |  | NetworkManagementPage · l.1073 |
| «Confirmar Eliminación» | written in this file | `showDeleteConfirm && selectedNetwork` |  | NetworkManagementPage · l.1134 |

**Toasts** (40)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Solo administradores pueden acceder a la gestión de redes» | `profileData && role !== 'admin'` | initializeAuth · l.142 |
| error | «Error de autenticación» | `!session?.access_token` | fetchNetworks · l.163 |
| error | «Las tablas de red no existen. Por favor aplique la migración de base de datos.» | `!response.ok && errorData.details && errorData.details.includes('does not exist')` | fetchNetworks · l.181 |
| error | «Error al cargar redes» |  | fetchNetworks · l.192 |
| error | «Error al cargar escuelas» | `!(response.ok)` | fetchAllSchoolsWithNetworks · l.219 |
| error | «El nombre de la red es requerido» | `!networkForm.name.trim()` | handleCreateNetwork · l.249 |
| error | «Error de autenticación» | `!session?.access_token` | handleCreateNetwork · l.256 |
| success | «Red creada exitosamente» | `response.ok` | handleCreateNetwork · l.272 |
| error | «{data.error}: {data.details}» | `!(response.ok) && data.details` | handleCreateNetwork · l.279 |
| error | «Error al crear la red» | `!(response.ok) && !(data.details)` | handleCreateNetwork · l.281 |
| error | «Error al crear la red» |  | handleCreateNetwork · l.286 |
| error | «El nombre de la red es requerido» | `!selectedNetwork \|\| !networkForm.name.trim()` | handleUpdateNetwork · l.292 |
| error | «Error de autenticación» | `!session?.access_token` | handleUpdateNetwork · l.299 |
| success | «Red actualizada exitosamente» | `response.ok` | handleUpdateNetwork · l.318 |
| error | «Error al actualizar la red» | `!(response.ok)` | handleUpdateNetwork · l.324 |
| error | «Error al actualizar la red» |  | handleUpdateNetwork · l.328 |
| error | «Error de autenticación» | `!session?.access_token` | handleDeleteNetwork · l.338 |
| success | «Red eliminada exitosamente» | `response.ok` | handleDeleteNetwork · l.353 |
| error | «Error al eliminar la red» | `!(response.ok)` | handleDeleteNetwork · l.358 |
| error | «Error al eliminar la red» |  | handleDeleteNetwork · l.362 |
| error | «Selecciona al menos una escuela» | `!selectedNetwork \|\| selectedSchools.length === 0` | handleAssignSchools · l.368 |
| error | «Error de autenticación» | `!session?.access_token` | handleAssignSchools · l.375 |
| success | «Operación completada» | `response.ok` | handleAssignSchools · l.398 |
| warn | «Escuelas omitidas por conflictos: {conflictNames}» | `response.ok && summary && conflicted_schools && conflicted_schools.length > 0` | handleAssignSchools · l.406 |
| warn | «Algunas escuelas no pudieron ser asignadas» | `!(response.ok) && response.status === 409 && data.summary` | handleAssignSchools · l.419 |
| error | «Error al asignar escuelas» | `!(response.ok) && !(response.status === 409 && data.summary)` | handleAssignSchools · l.422 |
| error | «Error al asignar escuelas» |  | handleAssignSchools · l.427 |
| error | «Selecciona un usuario» | `!selectedNetwork \|\| !selectedUser` | handleAssignSupervisor · l.433 |
| error | «Error de autenticación» | `!session?.access_token` | handleAssignSupervisor · l.440 |
| success | «Supervisor asignado exitosamente» | `response.ok` | handleAssignSupervisor · l.459 |
| error | «Error al asignar supervisor» | `!(response.ok)` | handleAssignSupervisor · l.465 |
| error | «Error al asignar supervisor» |  | handleAssignSupervisor · l.469 |
| error | «Error de autenticación» | `!session?.access_token` | handleRemoveSchool · l.479 |
| success | «Escuela removida exitosamente» | `response.ok` | handleRemoveSchool · l.498 |
| error | «Error al remover escuela» | `!(response.ok)` | handleRemoveSchool · l.501 |
| error | «Error al remover escuela» |  | handleRemoveSchool · l.505 |
| error | «Error de autenticación» | `!session?.access_token` | handleRemoveSupervisor · l.515 |
| success | «Supervisor removido exitosamente» | `response.ok` | handleRemoveSupervisor · l.534 |
| error | «Error al remover supervisor» | `!(response.ok)` | handleRemoveSupervisor · l.537 |
| error | «Error al remover supervisor» |  | handleRemoveSupervisor · l.541 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar redes» | `throw (shown by whoever catches it)` | `!response.ok` | fetchNetworks · l.185 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.125 |
| `/dashboard` | `router.push` | `profileData && role !== 'admin'` | initializeAuth · l.143 |
| `/login` | `router.push` |  | initializeAuth · l.153 |
| `/login` | `router.push` |  | handleLogout · l.579 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.137 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | NetworkManagementPage · l.604 |
| `ResponsiveFunctionalPageHeader` | title: Gestión de Redes · subtitle: Administra redes de colegios y supervisores · searchPlaceholder: Buscar redes... |  |  | NetworkManagementPage · l.613 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | NetworkManagementPage · l.169 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.577 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.578 |

**Values shown from data** (10)

- `{networks.length}` — NetworkManagementPage · l.677
- `{networks.reduce((sum, n) => sum + n…}` — NetworkManagementPage · l.689
- `{networks.reduce((sum, n) => sum + n…}` — NetworkManagementPage · l.703
- `{networks.filter(n => n.supervisor_c…}` — NetworkManagementPage · l.717
- `{network.description}` — NetworkManagementPage · l.736, when `each filteredNetworks && network.description`
- `{network.school_count}` — NetworkManagementPage · l.760, when `each filteredNetworks`
- `{network.supervisor_count}` — NetworkManagementPage · l.764, when `each filteredNetworks`
- `{school.name}` — NetworkManagementPage · l.776, when `each filteredNetworks && network.schools.length > 0 && each network.schools.slice(0, 3)`
- `{supervisor.first_name} {supervisor.last_name}` — NetworkManagementPage · l.802, when `each filteredNetworks && network.supervisors.length > 0 && each network.supervisors`
- `{selectedSchools.length}` — NetworkManagementPage · l.988, when `showSchoolModal && selectedNetwork && selectedSchools.length > 0`

**Other texts on screen** (34)

- «Las tablas de red no existen en la base de datos. Para usar esta funcionalidad:» — NetworkManagementPage · l.657, when `migrationError`
- «Ve al Dashboard de Supabase → SQL Editor» — NetworkManagementPage · l.659, when `migrationError`
- «Copia el contenido de» — NetworkManagementPage · l.660, when `migrationError`
- «/database/add-supervisor-de-red-role-fixed.sql» — NetworkManagementPage · l.660, when `migrationError`
- «Ejecuta el SQL en DOS PASOS (ver archivo para instrucciones)» — NetworkManagementPage · l.661, when `migrationError`
- «Recarga esta página» — NetworkManagementPage · l.662, when `migrationError`
- «Total Redes» — NetworkManagementPage · l.678
- «Escuelas Asignadas» — NetworkManagementPage · l.692
- «Supervisores Activos» — NetworkManagementPage · l.706
- «Sin Supervisores» — NetworkManagementPage · l.720
- «Escuelas» — NetworkManagementPage · l.761, when `each filteredNetworks`
- «Supervisores» — NetworkManagementPage · l.765, when `each filteredNetworks`
- «Escuelas Asignadas:» — NetworkManagementPage · l.772, when `each filteredNetworks && network.schools.length > 0`
- «+ {network.schools.length - 3} más» — NetworkManagementPage · l.787, when `each filteredNetworks && network.schools.length > 0 && network.schools.length > 3`
- «Supervisores:» — NetworkManagementPage · l.798, when `each filteredNetworks && network.supervisors.length > 0`
- «No se encontraron redes que coincidan con tu búsqueda. / Comienza creando tu primera red de colegios.» — NetworkManagementPage · l.844, when `filteredNetworks.length === 0`
- «Nombre de la Red *» (label) — NetworkManagementPage · l.870, when `showCreateModal`
- «Descripción» (label) — NetworkManagementPage · l.883, when `showCreateModal`
- «Nombre de la Red *» (label) — NetworkManagementPage · l.925, when `showEditModal && selectedNetwork`
- «Descripción» (label) — NetworkManagementPage · l.937, when `showEditModal && selectedNetwork`
- «Nota:» — NetworkManagementPage · l.981, when `showSchoolModal && selectedNetwork`
- «Las escuelas que ya pertenecen a otra red aparecen deshabilitadas y muestran a qué red están asignadas. Solo puedes seleccionar escuelas disponibles o las que ya están en esta red.» — NetworkManagementPage · l.981, when `showSchoolModal && selectedNetwork`
- «escuela» — NetworkManagementPage · l.988, when `showSchoolModal && selectedNetwork && selectedSchools.length > 0`
- «s» — NetworkManagementPage · l.988, when `showSchoolModal && selectedNetwork && selectedSchools.length > 0`
- «seleccionada» — NetworkManagementPage · l.988, when `showSchoolModal && selectedNetwork && selectedSchools.length > 0`
- «s» — NetworkManagementPage · l.988, when `showSchoolModal && selectedNetwork && selectedSchools.length > 0`
- «{school.name} [En esta red] [Asignado a: {school.current_network.name}]» (label) — NetworkManagementPage · l.1000, when `showSchoolModal && selectedNetwork && availableSchools.length > 0 && each availableSchools`
- «No se encontraron escuelas en el sistema.» — NetworkManagementPage · l.1043, when `showSchoolModal && selectedNetwork && !(availableSchools.length > 0)`
- «Seleccionar Usuario» (label) — NetworkManagementPage · l.1082, when `showSupervisorModal && selectedNetwork && availableUsers.length > 0`
- «Todos los usuarios ya tienen roles de supervisor asignados.» — NetworkManagementPage · l.1104, when `showSupervisorModal && selectedNetwork && !(availableUsers.length > 0)`
- «¿Estás seguro de que quieres eliminar la red &quot; {selectedNetwork.name} &quot;?» — NetworkManagementPage · l.1141, when `showDeleteConfirm && selectedNetwork`
- «Advertencia:» — NetworkManagementPage · l.1148, when `showDeleteConfirm && selectedNetwork && selectedNetwork.supervisor_count > 0`
- «Esta red tiene» — NetworkManagementPage · l.1148, when `showDeleteConfirm && selectedNetwork && selectedNetwork.supervisor_count > 0`
- «supervisor(es) activo(s). Primero debes remover todos los supervisores antes de eliminar la red.» — NetworkManagementPage · l.1148, when `showDeleteConfirm && selectedNetwork && selectedNetwork.supervisor_count > 0`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/networks` | DELETE, GET, POST, PUT | `pages/admin/network-management.tsx:167`, `pages/admin/network-management.tsx:260`, `pages/admin/network-management.tsx:303`, `pages/admin/network-management.tsx:342` |
| `/api/admin/networks/all-schools-simple` | GET | `pages/admin/network-management.tsx:201` |
| `/api/admin/networks/schools` | DELETE, PUT | `pages/admin/network-management.tsx:379`, `pages/admin/network-management.tsx:483` |
| `/api/admin/networks/supervisors` | DELETE, POST | `pages/admin/network-management.tsx:444`, `pages/admin/network-management.tsx:519` |
| `/api/admin/networks/supervisors-simple` | GET | `pages/admin/network-management.tsx:231` |

## /admin/role-management

File `pages/admin/role-management.tsx` · 675 lines · frame: MainLayout

### Who reaches it

- Menu: Sistema › «Roles y Permisos» → `/admin/role-management` — superadmin only; permission: manage_permissions; the group: everyone signed in (`Sidebar.tsx` l.740)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.217 `router.push → /login`
  - l.222 `router.push → /login  (when !user \|\| !session)`
  - l.236 `router.push → /dashboard  (when !response.ok)`
  - l.247 `router.push → /dashboard  (when !(data.is_superadmin))`
  - l.251 `router.push → /dashboard`
- Linked from: `components/layout/Sidebar.tsx:742`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1, community_manager 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | if superadmin | pass |
| consultor | if superadmin, permission manage_permissions | sent to /dashboard — **the menu shows it, the middleware refuses** |
| equipo_directivo | if superadmin, permission manage_permissions | sent to /dashboard — **the menu shows it, the middleware refuses** |
| lider_generacion | if superadmin, permission manage_permissions | sent to /dashboard — **the menu shows it, the middleware refuses** |
| lider_comunidad | if superadmin, permission manage_permissions | sent to /dashboard — **the menu shows it, the middleware refuses** |
| supervisor_de_red | if superadmin, permission manage_permissions | sent to /dashboard — **the menu shows it, the middleware refuses** |
| community_manager | if superadmin, permission manage_permissions | sent to /dashboard — **the menu shows it, the middleware refuses** |
| docente | if superadmin, permission manage_permissions | sent to /dashboard — **the menu shows it, the middleware refuses** |
| encargado_licitacion | if superadmin, permission manage_permissions | sent to /dashboard — **the menu shows it, the middleware refuses** |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Gestión de Roles y Permisos» | h1 |  | RoleManagement · l.412 |
| «{category.name}» | h3 | `each roles && expandedCategories[role] && each PERMISSION_CATEGORIES` | RoleManagement · l.525 |
| «Advertencia: Cambio Crítico» | h3 | `showConfirmModal` | RoleManagement · l.642 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{handleCancelChanges}` | `hasChanges` | `{saving}` |  | RoleManagement · l.421 |
| «Guardando... / Guardar Cambios» | `{handleSaveChanges}` | `hasChanges` | `{saving}` |  | RoleManagement · l.428 |
| «{role.replace(/_/g, ' ').charAt(0).t…}» | `{() => toggleCategory(role)}` | `each roles` |  |  | RoleManagement · l.501 |
| «{SCOPE_LABELS[scope]}» · tooltip «{`${hasPermission ? 'Desactivar' : 'Activar'} ${SCOPE_LABELS[scope]}`}» | `{() => togglePermission(role, permissionKey)}` | `expandedCategories[role] && each PERMISSION_CATEGORIES && each category.actions && each action.scopes` |  |  | RoleManagement · l.539 |
| «Otorgado / Denegado» | `{() => togglePermission(role, permission)}` | `expandedCategories[role] && each PERMISSION_CATEGORIES && category.unscopedPermissions && category.unscopedPermissions.length > 0 && each category.unscopedPermissions` |  |  | RoleManagement · l.567 |
| «Colapsar Todos / Expandir Todos» | `{() => { const allExpanded = roles.every(role => expandedCategories[role]); cons…}` |  |  |  | RoleManagement · l.592 |
| «Cancelar» | `{handleCancelChange}` | `showConfirmModal` |  |  | RoleManagement · l.657 |
| «Sí, Continuar» | `{handleConfirmDangerousChange}` | `showConfirmModal` |  |  | RoleManagement · l.663 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Seleccionar Rol para Editar» | select |  | «(lista) {role.replace(/_/g, ' ').charAt(0).t…}» |  |  | RoleManagement · l.482 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Advertencia: Cambio Crítico» | written in this file | `showConfirmModal` |  | RoleManagement · l.633 |

**Browser alert()** (3)

| Text | When | Where |
|---|---|---|
| «Cambios guardados exitosamente» | `response.ok` | handleSaveChanges · l.351 |
| «Error al guardar: {error.error}» | `!(response.ok)` | handleSaveChanges · l.354 |
| «Error al guardar cambios» |  | handleSaveChanges · l.358 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/404` | `router.push` | `!isFeatureEnabled('FEATURE_SUPERADMIN_RBAC')` | RoleManagement · l.183 |
| `/login` | `router.push` |  | handleLogout · l.217 |
| `/login` | `router.push` | `!user \|\| !session` | checkAccess · l.222 |
| `/dashboard` | `router.push` | `!response.ok` | checkAccess · l.236 |
| `/dashboard` | `router.push` | `!(data.is_superadmin)` | checkAccess · l.247 |
| `/dashboard` | `router.push` |  | checkAccess · l.251 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isSuperadmin` | RoleManagement · l.389 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Gestión de Roles y Permisos | `loading` |  | RoleManagement · l.371 |
| `MainLayout` | pageTitle: Gestión de Roles y Permisos |  |  | RoleManagement · l.399 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `PERMISSION_CATEGORIES` | «Dashboard & Core», «Ver Reportes», «Learning Paths», «Ver», «Crear», «Editar», «Eliminar», «Asignar», «Courses & Content», «Gestionar Contenido», «News & Articles», «Publicar», «Events», «User Management», «Gestionar Roles», «Schools & Organizations», «Gestionar Generaciones», «Gestionar Comunidades», «Consultants», «Financial Management», «Ver Informes de Gastos», «Crear Informes de Gastos», «Editar Informes de Gastos», «Aprobar Informes de Gastos», «Ver Flujo de Caja», «Contracts & Internships», «Ver Contratos», «Crear Contratos», «Editar Contratos», «Eliminar Contratos», «Ver Propuestas de Pasantías», «Crear Propuestas de Pasantías», «Editar Propuestas de Pasantías», «Aprobar Propuestas de Pasantías», «Workspace & Collaboration», «Ver Workspace», «Crear Contenido», «Editar Contenido», «Gestionar Tareas de Grupo», «System Administration» | l.27 |
| `SCOPE_LABELS` | «Propio», «Colegio», «Generación», «Comunidad», «Red», «Todos» | l.144 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | RoleManagement · l.230 |
| «Bearer {session?.access_token}» | RoleManagement · l.259 |

**Values shown from data** (2)

- `{action.label}` — RoleManagement · l.532, when `each roles && expandedCategories[role] && each PERMISSION_CATEGORIES && each category.actions`
- `{permission.replace(/_/g, ' ').charA…}` — RoleManagement · l.564, when `expandedCategories[role] && each PERMISSION_CATEGORIES && category.unscopedPermissions && category.unscopedPermissions.length > 0 && each category.unscopedPermissions`

**Other texts on screen** (24)

- «Cargando...» — RoleManagement · l.382, when `loading`
- «Fase 3 - Edición Completa» — RoleManagement · l.416
- «Modo de Desarrollo» — RoleManagement · l.450, when `isMock`
- «- Usando datos de prueba» — RoleManagement · l.450, when `isMock`
- «Modo de Prueba Activo» — RoleManagement · l.468, when `testMode`
- «- Los cambios son temporales» — RoleManagement · l.468, when `testMode`
- «Seleccionar Rol para Editar» (label) — RoleManagement · l.479
- «Nota:» — RoleManagement · l.612
- «Haz clic en los botones de alcance para cambiar permisos. Los cambios se guardan cuando presionas &quot;Guardar Cambios&quot;.» — RoleManagement · l.612
- «Alcances:» — RoleManagement · l.615
- «Propio:» — RoleManagement · l.617
- «Solo acceso a registros propios» — RoleManagement · l.617
- «Colegio:» — RoleManagement · l.618
- «Acceso a registros del colegio asignado» — RoleManagement · l.618
- «Generación:» — RoleManagement · l.619
- «Acceso a registros de la generación asignada» — RoleManagement · l.619
- «Comunidad:» — RoleManagement · l.620
- «Acceso a registros de la comunidad asignada» — RoleManagement · l.620
- «Red:» — RoleManagement · l.621
- «Acceso a registros de toda la red asignada» — RoleManagement · l.621
- «Todos:» — RoleManagement · l.622
- «Acceso a todos los registros del sistema» — RoleManagement · l.622
- «Estás a punto de remover un permiso crítico del rol Admin ( {pendingChange?.permission.replace(/…} ). Esto podría bloquear el acceso a funciones esenciales del sistema.» — RoleManagement · l.646, when `showConfirmModal`
- «¿Estás seguro que deseas continuar?» — RoleManagement · l.651, when `showConfirmModal`

**Reads and writes the database directly:** `table:profiles` (select)

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/auth/is-superadmin` | GET | `pages/admin/role-management.tsx:228` |
| `/api/admin/roles/permissions` | GET | `pages/admin/role-management.tsx:257` |
| `/api/admin/roles/permissions/update` | POST | `pages/admin/role-management.tsx:339` |

## /admin/school-users

File `pages/admin/school-users.tsx` · 821 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: «Usuarios del Colegio» → `/admin/school-users` — roles: equipo_directivo (`Sidebar.tsx` l.389)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.49 `server redirect → /login  (when !user)`
  - l.54 `if (await isGlobalAdmin(service, user.id)) { return { redirect: { destination: '/admin/user-management', permanent: false } }; }`
  - l.60 `server redirect → /dashboard  (when schoolId === null)`
  - l.268 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:392`, `middleware.ts:235`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/lib/api-auth.server-side-user.test.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | no | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | yes | pass |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | no | sent to /dashboard |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Usuarios del colegio — {schoolName}» | h1 |  | SchoolUsersPage · l.524 |
| «Crear Nuevo Usuario» | h3 | `showAddForm` | SchoolUsersPage · l.606 |
| «Confirmar Eliminación» | h3 | `showDeleteModal && userToDelete` | SchoolUsersPage · l.760 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Anterior» | `{() => handlePageChange(currentPage - 1)}` |  | `{currentPage === 1 \|\| loading}` |  | SchoolUsersPage · l.581 |
| «Siguiente» | `{() => handlePageChange(currentPage + 1)}` |  | `{currentPage >= totalPages \|\| loading}` |  | SchoolUsersPage · l.591 |
| «[icon X]» | `{() => setShowAddForm(false)}` | `showAddForm` |  |  | SchoolUsersPage · l.607 |
| «Cancelar» | `{() => setShowAddForm(false)}` | `showAddForm` |  |  | SchoolUsersPage · l.699 |
| «Guardar y agregar otro» | `{() => handleSubmitNewUser(true)}` | `showAddForm` | `{isCreating}` |  | SchoolUsersPage · l.706 |
| «Creando... / Guardar» (submits the form) |  | `showAddForm` | `{isCreating}` |  | SchoolUsersPage · l.715 |
| «Cancelar» | `{() => { setShowDeleteModal(false); setUserToDelete(null); }}` | `showDeleteModal && userToDelete` |  |  | SchoolUsersPage · l.777 |
| «Eliminar Usuario» | `{handleConfirmDelete}` | `showDeleteModal && userToDelete` |  |  | SchoolUsersPage · l.786 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Email *» | email | «usuario@ejemplo.com» · required |  | `showAddForm` |  | SchoolUsersPage · l.626 |
| «Contraseña *» | password | «{PASSWORD_POLICY_SUMMARY}» · required · `minLength={PASSWORD_POLICY.minLength}` |  | `showAddForm` |  | SchoolUsersPage · l.641 |
| «Nombre» | text | «Nombre» |  | `showAddForm` |  | SchoolUsersPage · l.656 |
| «Apellido» | text | «Apellido» |  | `showAddForm` |  | SchoolUsersPage · l.668 |
| «Rol» | select |  | «(lista) {ROLE_NAMES[roleType as UserRoleType]}» | `showAddForm` |  | SchoolUsersPage · l.680 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => { e.preventDefault(); handleSubmitNewUser(false); }}` | `showAddForm` | SchoolUsersPage · l.614 |

**Pop-ups** (5)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Crear Nuevo Usuario» | written in this file | `showAddForm` |  | SchoolUsersPage · l.603 |
| `RoleAssignmentModal` | component | `{showRoleModal}` |  | SchoolUsersPage · l.739 |
| «Confirmar Eliminación» | written in this file | `showDeleteModal && userToDelete` |  | SchoolUsersPage · l.753 |
| `PasswordResetModal` | component | `{showPasswordResetModal}` |  | SchoolUsersPage · l.798 |
| `UserEditModal` | component | `{showEditModal}` |  | SchoolUsersPage · l.808 |

**Toasts** (8)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar usuarios» |  | SchoolUsersPage · l.206 |
| success | «Usuario eliminado correctamente» |  | handleConfirmDelete · l.348 |
| error | «Error al eliminar usuario: {error.message}» |  | handleConfirmDelete · l.362 |
| error | «Email y contraseña son obligatorios» | `!newUserEmail.trim() \|\| !newUserPassword.trim()` | handleSubmitNewUser · l.375 |
| error | «{passwordError}» | `passwordError` | handleSubmitNewUser · l.390 |
| success | «Usuario creado. Puedes agregar otro.» | `result.success && result.user && addAnother` | handleSubmitNewUser · l.440 |
| success | «Usuario creado correctamente. El usuario deberá cambiar su contraseña en el primer inicio de sesión.» | `result.success && result.user && !(addAnother)` | handleSubmitNewUser · l.449 |
| error | «Error al crear usuario: {errorMessage}» |  | handleSubmitNewUser · l.473 |

**Messages set on the page** (8)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch users» | `throw (shown by whoever catches it)` | `!response.ok` | SchoolUsersPage · l.173 |
| «No authentication token available» | `throw (shown by whoever catches it)` | `!session?.access_token` | handleConfirmDelete · l.320 |
| «Invalid response from server: {responseText.substring(0, 1…}» | `throw (shown by whoever catches it)` |  | handleConfirmDelete · l.337 |
| «Server error: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | handleConfirmDelete · l.341 |
| «No active session» | `throw (shown by whoever catches it)` | `!session` | handleSubmitNewUser · l.405 |
| «Failed to create user» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmitNewUser · l.427 |
| «No session found» | `throw (shown by whoever catches it)` | `!session` | handlePasswordReset · l.489 |
| «Failed to reset password» | `throw (shown by whoever catches it)` | `!response.ok` | handlePasswordReset · l.503 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `server redirect` | `!user` | getServerSideProps · l.49 |
| `/admin/user-management` | `server redirect` | `await isGlobalAdmin(service, user.id)` | getServerSideProps · l.55 |
| `/dashboard` | `server redirect` | `schoolId === null` | getServerSideProps · l.60 |
| `/login` | `router.push` |  | handleLogout · l.268 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `if (await isGlobalAdmin(service, user.id)) { return { redirect: { destination: '/admin/user-management', permanent: false } }; }` | getServerSideProps · l.54 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!sessionUser` | SchoolUsersPage · l.115 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | SchoolUsersPage · l.514 |
| `UnifiedUserManagement` |  |  |  | SchoolUsersPage · l.529 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Sin nombre» | SchoolUsersPage · l.277 |
| «Bearer {session.access_token}» | SchoolUsersPage · l.327 |
| «Este email ya está registrado en el sistema» | SchoolUsersPage · l.468 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| focus | `emailInputRef.current.focus()` | handleSubmitNewUser · l.446 |

**Values shown from data** (1)

- `{userToDelete.email}` — SchoolUsersPage · l.769, when `showDeleteModal && userToDelete`

**Other texts on screen** (10)

- «No hay usuarios para mostrar / Mostrando {pageStart}-{pageEnd} de {totalUsers} usuarios» — SchoolUsersPage · l.575
- «Página {currentPage} de {totalPages}» — SchoolUsersPage · l.588
- «Email *» (label) — SchoolUsersPage · l.623, when `showAddForm`
- «Contraseña *» (label) — SchoolUsersPage · l.638, when `showAddForm`
- «Nombre» (label) — SchoolUsersPage · l.653, when `showAddForm`
- «Apellido» (label) — SchoolUsersPage · l.665, when `showAddForm`
- «Rol» (label) — SchoolUsersPage · l.677, when `showAddForm`
- «Los roles de Líder de Comunidad y Líder de Generación requieren información adicional y deben asignarse desde la opción &quot;Cambiar Rol&quot; del usuario una vez creado.» — SchoolUsersPage · l.692, when `showAddForm`
- «¿Estás seguro de que quieres eliminar al usuario» — SchoolUsersPage · l.768, when `showDeleteModal && userToDelete`
- «Esta acción no se puede deshacer.» — SchoolUsersPage · l.772, when `showDeleteModal && userToDelete`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/PasswordResetModal.tsx`
- `components/RoleAssignmentModal.tsx`
- `components/admin/UnifiedUserManagement.tsx`
- `components/admin/UserEditModal.tsx`
- `components/common/ConfirmModal.tsx`
- `constants/externalSchools.ts`
- `constants/toastMessages.ts`
- `constants/toastStyles.ts`
- `lib/api-auth.ts`
- `lib/auth/password-generator.ts`
- `lib/auth/password-policy.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`
- `utils/toastUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/assign-role` | POST | `utils/roleUtils.ts:810` |
| `/api/admin/create-user` | POST | `pages/admin/school-users.tsx:408` |
| `/api/admin/delete-user` | POST | `pages/admin/school-users.tsx:323` |
| `/api/admin/remove-role` | POST | `utils/roleUtils.ts:858` |
| `/api/admin/reset-password` | POST | `pages/admin/school-users.tsx:492` |
| `/api/admin/update-qa-tester-status` | POST | `components/admin/UserEditModal.tsx:116` |
| `/api/admin/update-user` | POST | `components/admin/UserEditModal.tsx:72` |
| `/api/admin/user-roles` | GET | `components/RoleAssignmentModal.tsx:143` |
| `/api/admin/users` | GET | `pages/admin/school-users.tsx:171` |

## /admin/schools

File `pages/admin/schools.tsx` · 1544 lines · frame: MainLayout

### Who reaches it

- Menu: Personas › «Escuelas» → `/admin/schools` — admin only; the group: admin only (`Sidebar.tsx` l.444)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.151 `router.push → /login  (when !user)`
  - l.163 `router.push → /dashboard  (when !profile)`
  - l.167 `userRole = await getUserPrimaryRole(user.id)`
  - l.170 `router.push → /dashboard  (when userRole !== 'admin')`
  - l.178 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:446`, `pages/api/qa/seed-codebase-index.ts:133`
- Tests: browser tests that CI runs: `tests/e2e/ci-fixture.spec.ts`; browser tests CI skips: `tests/qa/auth-redirects.spec.ts`.
- QA scenarios that name this address: admin 3, community_manager 1, consultor 1, equipo_directivo 1, lider_comunidad 1, lider_generacion 1, supervisor_de_red 1.

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

**Titles** (13)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Gestión de Escuelas» | h1 |  | SchoolsManagement · l.836 |
| «No hay escuelas registradas» | h3 | `!(loading) && schools.length === 0` | SchoolsManagement · l.855 |
| «{school.name}» | h3 | `!(loading) && !(schools.length === 0) && each schools` | SchoolsManagement · l.875 |
| «{generation.name}» | h4 | `!(schools.length === 0) && each schools && expandedSchools.has(school.id) && school.has_generations === true && school.generations && school.generations.length > 0 && each school.generations` | SchoolsManagement · l.955 |
| «Editar Escuela / Nueva Escuela» | h2 | `showSchoolModal` | SchoolsManagement · l.1000 |
| «Editar Generación / Nueva Generación» | h2 | `showGenerationModal` | SchoolsManagement · l.1056 |
| «{confirmationModal.title}» | h2 | `confirmationModal.show` | SchoolsManagement · l.1194 |
| «Vincular Cliente a {linkingSchool?.name}» | h2 | `showClientModal` | SchoolsManagement · l.1236 |
| «Editar Cliente: {editingCliente.nombre_fantasia}» | h2 | `showClientEditModal && editingCliente` | SchoolsManagement · l.1276 |
| «Información Legal» | h3 | `showClientEditModal && editingCliente` | SchoolsManagement · l.1283 |
| «Representante Legal» | h3 | `showClientEditModal && editingCliente` | SchoolsManagement · l.1366 |
| «Encargado de Proyecto» | h3 | `showClientEditModal && editingCliente` | SchoolsManagement · l.1435 |
| «Contacto Administrativo» | h3 | `showClientEditModal && editingCliente` | SchoolsManagement · l.1479 |

**Buttons** (19)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Nueva Escuela» | `{handleAddSchool}` |  |  |  | SchoolsManagement · l.839 |
| «[icon ChevronDown]» | `{() => handleToggleExpand(school.id)}` | `!(loading) && !(schools.length === 0) && each schools` |  |  | SchoolsManagement · l.865 |
| «[icon Edit2]» · tooltip «Editar cliente» | `{() => handleEditCliente(school.cliente_id!)}` | `!(loading) && !(schools.length === 0) && each schools && school.cliente_id` |  |  | SchoolsManagement · l.896 |
| «Generación» | `{() => handleAddGeneration(school)}` | `!(loading) && !(schools.length === 0) && each schools && school.has_generations === true` |  |  | SchoolsManagement · l.909 |
| «[icon Edit2]» | `{() => handleEditSchool(school)}` | `!(loading) && !(schools.length === 0) && each schools` |  |  | SchoolsManagement · l.917 |
| «[icon Trash2]» | `{() => handleDeleteSchool(school)}` | `!(loading) && !(schools.length === 0) && each schools` |  |  | SchoolsManagement · l.923 |
| «[icon FileText]» · tooltip «Crear contrato» | `{() => handleCreateContract(school)}` | `!(loading) && !(schools.length === 0) && each schools && school.cliente_id` |  |  | SchoolsManagement · l.930 |
| «[icon Plus]» · tooltip «Vincular cliente» | `{() => handleLinkClient(school)}` | `!(loading) && !(schools.length === 0) && each schools && !(school.cliente_id)` |  |  | SchoolsManagement · l.938 |
| «[icon Edit2]» | `{() => handleEditGeneration(generation, school)}` | `!(schools.length === 0) && each schools && expandedSchools.has(school.id) && school.has_generations === true && school.generations && school.generations.length > 0 && each school.generations` |  |  | SchoolsManagement · l.971 |
| «[icon Trash2]» | `{() => handleDeleteGeneration(generation)}` | `!(schools.length === 0) && each schools && expandedSchools.has(school.id) && school.has_generations === true && school.generations && school.generations.length > 0 && each school.generations` |  |  | SchoolsManagement · l.977 |
| «Cancelar» | `{() => setShowSchoolModal(false)}` | `showSchoolModal` |  |  | SchoolsManagement · l.1035 |
| «Actualizar / Crear Escuela» | `{handleSaveSchool}` | `showSchoolModal` |  |  | SchoolsManagement · l.1041 |
| «Cancelar» | `{() => setShowGenerationModal(false)}` | `showGenerationModal` |  |  | SchoolsManagement · l.1173 |
| «Actualizar / Crear Generación» | `{handleSaveGeneration}` | `showGenerationModal` |  |  | SchoolsManagement · l.1179 |
| «Cancelar» | `{() => setConfirmationModal({ ...confirmationModal, show: false })}` | `confirmationModal.show` |  |  | SchoolsManagement · l.1215 |
| «OK» | `{() => confirmationModal.onConfirm()}` | `confirmationModal.show` |  |  | SchoolsManagement · l.1221 |
| «Cancelar» | `{() => { setShowClientModal(false); setLinkingSchool(null); }}` | `showClientModal` |  |  | SchoolsManagement · l.1258 |
| «Cancelar» | `{() => { setShowClientEditModal(false); setEditingCliente(null); }}` | `showClientEditModal && editingCliente` |  |  | SchoolsManagement · l.1523 |
| «Guardar Cambios» | `{handleSaveCliente}` | `showClientEditModal && editingCliente` |  |  | SchoolsManagement · l.1532 |

**Fields** (23)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre *» | text | «Nombre de la escuela» |  | `showSchoolModal` |  | SchoolsManagement · l.1009 |
| «Habilitar generaciones para esta escuela» | checkbox |  |  | `showSchoolModal` |  | SchoolsManagement · l.1020 |
| «Nombre *» | text | «Ej: Tractor, Innova» |  | `showGenerationModal` |  | SchoolsManagement · l.1068 |
| «Rango de Grados» | select |  | «Seleccione un rango...», «P1-P2», «P1-P3», «P1-PreKinder», «P1-Kinder», «P2-P3», «P2-PreKinder», «P2-Kinder», «P3-PreKinder», «P3-Kinder», «PreKinder-Kinder», «P1-2do», «P1-3ro», «P1-4to», «P1-5to», «P1-6to», «P1-8vo», «P1-12vo», «PreKinder-2do», «PreKinder-3ro», «PreKinder-4to», «PreKinder-5to», «PreKinder-6to», «PreKinder-8vo», «PreKinder-12vo», «Kinder-2do», «Kinder-3ro», «Kinder-4to», «Kinder-5to», «Kinder-6to», «Kinder-8vo», «Kinder-12vo», «1ro-2do», «1ro-3ro», «1ro-4to», «1ro-5to», «1ro-6to», «1ro-8vo», «1ro-12vo», «3ro-4to», «3ro-5to», «3ro-6to», «3ro-8vo», «3ro-12vo», «5to-6to», «5to-8vo», «5to-12vo», «7mo-8vo», «7mo-12vo», «9no-12vo», «Equipo Directivo», «Docentes», «Asistentes de la Educación», «Apoderados», «Otro» | `showGenerationModal` |  | SchoolsManagement · l.1081 |
| «Descripción» | textarea | «Descripción opcional» |  | `showGenerationModal` |  | SchoolsManagement · l.1162 |
| «Seleccionar Cliente» | select |  | «Seleccione un cliente...», «(lista) {cliente.nombre_fantasia} - {cliente.rut}» | `showClientModal` |  | SchoolsManagement · l.1244 |
| «Nombre Legal *» | text | «Nombre legal de la organización» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1290 |
| «Nombre de Fantasía *» | text | «Nombre comercial» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1303 |
| «RUT *» | text | «XX.XXX.XXX-X» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1316 |
| «Dirección *» | text | «Dirección completa» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1329 |
| «Comuna» | text | «Comuna» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1342 |
| «Ciudad» | text | «Ciudad» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1355 |
| «Nombre Representante Legal *» | text | «Nombre completo» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1373 |
| «RUT Representante Legal *» | text | «XX.XXX.XXX-X» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1386 |
| «Fecha Escritura» | date |  |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1399 |
| «Nombre Notario» | text | «Nombre del notario» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1411 |
| «Comuna Notaría» | text | «Comuna de la notaría» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1424 |
| «Nombre Encargado» | text | «Nombre completo» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1442 |
| «Teléfono Encargado» | tel | «+56 9 XXXX XXXX» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1455 |
| «Email Encargado» | email | «email@ejemplo.com» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1468 |
| «Nombre Contacto» | text | «Nombre completo» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1486 |
| «Teléfono Contacto» | tel | «+56 9 XXXX XXXX» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1499 |
| «Email Contacto» | email | «email@ejemplo.com» |  | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1512 |

**Pop-ups** (5)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Escuela / Nueva Escuela» | written in this file | `showSchoolModal` |  | SchoolsManagement · l.998 |
| «Editar Generación / Nueva Generación» | written in this file | `showGenerationModal` |  | SchoolsManagement · l.1054 |
| «{confirmationModal.title}» | written in this file | `confirmationModal.show` |  | SchoolsManagement · l.1192 |
| «Vincular Cliente a {linkingSchool?.name}» | written in this file | `showClientModal` |  | SchoolsManagement · l.1234 |
| «Editar Cliente: {editingCliente.nombre_fantasia}» | written in this file | `showClientEditModal && editingCliente` |  | SchoolsManagement · l.1274 |

**Browser confirm()** (4)

| Question | When | Where |
|---|---|---|
| «¿Está seguro de eliminar la escuela "{school.name}"? Esta acción no se puede deshacer.» |  | handleDeleteSchool · l.398 |
| «{confirmMessage}» | `editingSchool && !editingSchool.has_generations && schoolForm.has_generations` | handleSaveSchool · l.451 |
| «¿Está seguro de eliminar la generación "{generation.name}"? Esta acción no se puede deshacer.» |  | handleDeleteGeneration · l.517 |
| «Este cliente tiene {contracts.length} contrato(s) asociado(s). / Los cambios al nombre y RUT del representante legal solo afectarán contratos y licitaciones futuros. / Los demás campos del cliente sí afectarán los contratos existentes que se regeneren. / ¿Desea continuar?» | `contracts && contracts.length > 0` | handleSaveCliente · l.762 |

**Toasts** (40)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Perfil no encontrado.» | `!profile` | checkAuth · l.162 |
| error | «Acceso denegado. Solo administradores.» | `userRole !== 'admin'` | checkAuth · l.169 |
| error | «Error al cargar escuelas» |  | fetchSchools · l.268 |
| error | «Error al actualizar la escuela: {schoolError.message \|\| 'Err…}» | `schoolError` | performGenerationTransition · l.349 |
| error | «Error al actualizar las comunidades» | `communityError` | performGenerationTransition · l.361 |
| error | «Error al actualizar los perfiles de usuario» | `profileError` | performGenerationTransition · l.378 |
| success | «Escuela actualizada exitosamente - ahora opera sin generaciones» |  | performGenerationTransition · l.387 |
| error | «Error al transicionar la escuela» |  | performGenerationTransition · l.393 |
| success | «Escuela eliminada exitosamente» |  | handleDeleteSchool · l.410 |
| error | «Error al eliminar la escuela» |  | handleDeleteSchool · l.414 |
| error | «El nombre de la escuela es requerido» | `!schoolForm.name.trim()` | handleSaveSchool · l.420 |
| success | «Escuela actualizada exitosamente» | `editingSchool` | handleSaveSchool · l.469 |
| success | «Escuela creada exitosamente» | `!(editingSchool)` | handleSaveSchool · l.483 |
| error | «Error al guardar la escuela» |  | handleSaveSchool · l.490 |
| success | «Generación eliminada exitosamente» |  | handleDeleteGeneration · l.529 |
| error | «Error al eliminar la generación» |  | handleDeleteGeneration · l.533 |
| error | «El nombre de la generación es requerido» | `!generationForm.name.trim()` | handleSaveGeneration · l.539 |
| error | «No se ha seleccionado una escuela» | `!selectedSchool` | handleSaveGeneration · l.544 |
| success | «Generación actualizada exitosamente» | `editingGeneration` | handleSaveGeneration · l.561 |
| success | «Generación creada exitosamente» | `!(editingGeneration)` | handleSaveGeneration · l.573 |
| error | «Error al guardar la generación» |  | handleSaveGeneration · l.580 |
| error | «Esta escuela no tiene un cliente asociado» | `!school.cliente_id` | handleCreateContract · l.586 |
| error | «Cliente no encontrado» | `clientCheckError \|\| !cliente` | handleSaveLinkClient · l.611 |
| error | «Este cliente ya está vinculado a otra escuela» | `cliente.school_id` | handleSaveLinkClient · l.616 |
| success | «Cliente vinculado exitosamente» |  | handleSaveLinkClient · l.644 |
| error | «Error al vincular cliente:» |  | handleSaveLinkClient · l.650 |
| error | «Cliente no encontrado» | `error \|\| !cliente` | handleEditCliente · l.664 |
| error | «Error al cargar datos del cliente» |  | handleEditCliente · l.691 |
| error | «El nombre legal es requerido» | `!clienteForm.nombre_legal.trim()` | handleSaveCliente · l.698 |
| error | «El nombre de fantasía es requerido» | `!clienteForm.nombre_fantasia.trim()` | handleSaveCliente · l.702 |
| error | «El RUT es requerido» | `!clienteForm.rut.trim()` | handleSaveCliente · l.706 |
| error | «El RUT no es válido» | `!validateRut(clienteForm.rut)` | handleSaveCliente · l.710 |
| error | «La dirección es requerida» | `!clienteForm.direccion.trim()` | handleSaveCliente · l.714 |
| error | «El nombre del representante legal es requerido» | `!clienteForm.nombre_representante.trim()` | handleSaveCliente · l.718 |
| error | «El RUT del representante legal es requerido» | `!clienteForm.rut_representante.trim()` | handleSaveCliente · l.722 |
| error | «El RUT del representante legal no es válido» | `!validateRut(clienteForm.rut_representante)` | handleSaveCliente · l.726 |
| error | «No hay cliente seleccionado para editar» | `!editingCliente` | handleSaveCliente · l.731 |
| error | «Ya existe otro cliente con este RUT» | `clienteForm.rut !== editingCliente.rut && existingCliente` | handleSaveCliente · l.748 |
| success | «Cliente actualizado exitosamente» |  | handleSaveCliente · l.798 |
| error | «Error al actualizar cliente:» |  | handleSaveCliente · l.805 |

**Moves to another page from code** (5)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.151 |
| `/dashboard` | `router.push` | `!profile` | checkAuth · l.163 |
| `/dashboard` | `router.push` | `userRole !== 'admin'` | checkAuth · l.170 |
| `/login` | `router.push` |  | checkAuth · l.178 |
| `/contracts?cliente_id=[*]&school_name=[*]` | `router.push` |  | handleCreateContract · l.591 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(user.id)` | checkAuth · l.167 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Escuelas · userRole: admin | `!isAdmin` |  | SchoolsManagement · l.811 |
| `MainLayout` | pageTitle: Gestión de Escuelas · userRole: admin |  |  | SchoolsManagement · l.826 |

**Other texts written in the code (safety net: not tied to an element by the script)** (16)

| Text | Where |
|---|---|
| «Error desconocido» | SchoolsManagement · l.349 |
| «¿Está seguro de desactivar las generaciones para "{schoolForm.name}"?» | SchoolsManagement · l.431 |
| «Esto hará que:» | SchoolsManagement · l.432 |
| «Las comunidades de crecimiento ya no requerirán generaciones» | SchoolsManagement · l.434 |
| «Los usuarios ya no estarán asignados a generaciones» | SchoolsManagement · l.435 |
| «Las generaciones existentes permanecerán pero no se usarán» | SchoolsManagement · l.436 |
| «Esta acción se puede revertir más tarde.» | SchoolsManagement · l.438 |
| «¿Está seguro de activar las generaciones para "{schoolForm.name}"?» | SchoolsManagement · l.448 |
| «Deberá asignar generaciones a las comunidades y usuarios después de este cambio.» | SchoolsManagement · l.449 |
| «Educación Parvularia» | SchoolsManagement · l.1087 |
| «Desde P1» | SchoolsManagement · l.1099 |
| «Desde PreKinder» | SchoolsManagement · l.1108 |
| «Desde Kinder» | SchoolsManagement · l.1117 |
| «Educación Básica» | SchoolsManagement · l.1126 |
| «Educación Media» | SchoolsManagement · l.1143 |
| «Grupos Especiales» | SchoolsManagement · l.1148 |

**Values shown from data** (5)

- `{generation.grade_range}` — SchoolsManagement · l.957, when `each schools && expandedSchools.has(school.id) && school.has_generations === true && school.generations && school.generations.length > 0 && each school.generations && generation.grade_range`
- `{generation.description}` — SchoolsManagement · l.967, when `each schools && expandedSchools.has(school.id) && school.has_generations === true && school.generations && school.generations.length > 0 && each school.generations && generation.description`
- `{confirmationModal.message}` — SchoolsManagement · l.1199, when `confirmationModal.show && confirmationModal.message`
- `{detail}` — SchoolsManagement · l.1205, when `confirmationModal.show && confirmationModal.details && confirmationModal.details.length > 0 && each confirmationModal.details`
- `{confirmationModal.note}` — SchoolsManagement · l.1211, when `confirmationModal.show && confirmationModal.note`

**Other texts on screen** (33)

- «Administra las escuelas y sus generaciones» — SchoolsManagement · l.837
- «Comienza creando la primera escuela» — SchoolsManagement · l.856, when `!(loading) && schools.length === 0`
- «usuarios» — SchoolsManagement · l.879, when `!(loading) && !(schools.length === 0) && each schools`
- «{school._count?.generations} generaciones» — SchoolsManagement · l.882, when `!(loading) && !(schools.length === 0) && each schools && school.has_generations === true`
- «Sin generaciones» — SchoolsManagement · l.887, when `!(loading) && !(schools.length === 0) && each schools && school.has_generations === false`
- «Cliente vinculado» — SchoolsManagement · l.894, when `!(loading) && !(schools.length === 0) && each schools && school.cliente_id`
- «usuarios» — SchoolsManagement · l.960, when `!(schools.length === 0) && each schools && expandedSchools.has(school.id) && school.has_generations === true && school.generations && school.generations.length > 0 && each school.generations`
- «{generation._count?.communities} comunidades» — SchoolsManagement · l.962, when `!(schools.length === 0) && each schools && expandedSchools.has(school.id) && school.has_generations === true && school.generations && school.generations.length > 0 && each school.generations`
- «Nombre *» (label) — SchoolsManagement · l.1006, when `showSchoolModal`
- «Habilitar generaciones para esta escuela» (label) — SchoolsManagement · l.1019, when `showSchoolModal`
- «Marcar solo si la escuela organiza estudiantes por generaciones (ej: Tractor, Innova)» — SchoolsManagement · l.1029, when `showSchoolModal`
- «Escuela: {selectedSchool.name}» — SchoolsManagement · l.1060, when `showGenerationModal && selectedSchool`
- «Nombre *» (label) — SchoolsManagement · l.1065, when `showGenerationModal`
- «Rango de Grados» (label) — SchoolsManagement · l.1078, when `showGenerationModal`
- «Descripción» (label) — SchoolsManagement · l.1159, when `showGenerationModal`
- «Seleccionar Cliente» (label) — SchoolsManagement · l.1241, when `showClientModal`
- «Nombre Legal *» (label) — SchoolsManagement · l.1287, when `showClientEditModal && editingCliente`
- «Nombre de Fantasía *» (label) — SchoolsManagement · l.1300, when `showClientEditModal && editingCliente`
- «RUT *» (label) — SchoolsManagement · l.1313, when `showClientEditModal && editingCliente`
- «Dirección *» (label) — SchoolsManagement · l.1326, when `showClientEditModal && editingCliente`
- «Comuna» (label) — SchoolsManagement · l.1339, when `showClientEditModal && editingCliente`
- «Ciudad» (label) — SchoolsManagement · l.1352, when `showClientEditModal && editingCliente`
- «Nombre Representante Legal *» (label) — SchoolsManagement · l.1370, when `showClientEditModal && editingCliente`
- «RUT Representante Legal *» (label) — SchoolsManagement · l.1383, when `showClientEditModal && editingCliente`
- «Fecha Escritura» (label) — SchoolsManagement · l.1396, when `showClientEditModal && editingCliente`
- «Nombre Notario» (label) — SchoolsManagement · l.1408, when `showClientEditModal && editingCliente`
- «Comuna Notaría» (label) — SchoolsManagement · l.1421, when `showClientEditModal && editingCliente`
- «Nombre Encargado» (label) — SchoolsManagement · l.1439, when `showClientEditModal && editingCliente`
- «Teléfono Encargado» (label) — SchoolsManagement · l.1452, when `showClientEditModal && editingCliente`
- «Email Encargado» (label) — SchoolsManagement · l.1465, when `showClientEditModal && editingCliente`
- «Nombre Contacto» (label) — SchoolsManagement · l.1483, when `showClientEditModal && editingCliente`
- «Teléfono Contacto» (label) — SchoolsManagement · l.1496, when `showClientEditModal && editingCliente`
- «Email Contacto» (label) — SchoolsManagement · l.1509, when `showClientEditModal && editingCliente`

**Reads and writes the database directly:** `rpc:get_school_user_counts`, `table:clientes` (select, update), `table:contratos` (select), `table:generations` (delete, insert, update), `table:growth_communities` (update), `table:profiles` (select, update), `table:schools` (delete, insert, select, update), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/roleUtils.ts`

## /admin/tractor-signups

File `pages/admin/tractor-signups.tsx` · 776 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: Personas › «Registros» → `/admin/tractor-signups` — admin only; the group: admin only (`Sidebar.tsx` l.412)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.65 `server redirect → /login  (when !user)`
  - l.69 `isAdmin = await isGlobalAdmin(service, user.id)`
  - l.69 `isAdmin = await isGlobalAdmin(service, user.id)`
  - l.71 `server redirect → /dashboard  (when !isAdmin)`
- Linked from: `components/layout/Sidebar.tsx:414`
- Tests: browser tests that CI runs: `tests/e2e/auth-lifecycle.spec.ts`; unit tests of the page: `__tests__/components/TractorSignupsPage.grantWarning.test.tsx`, `__tests__/lib/api-auth.server-side-user.test.ts`.

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

**Buttons** (12)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Gestionar» | `{() => openManage(row)}` |  |  |  | TractorSignupsAdminPage · l.357 |
| «[icon RefreshCw]» · tooltip «Actualizar» | `{fetchRows}` |  | `{loading}` |  | TractorSignupsAdminPage · l.379 |
| «[icon Download]» · tooltip «Exportar CSV» | `{() => handleExport('csv')}` |  |  |  | TractorSignupsAdminPage · l.388 |
| «[icon FileSpreadsheet]» · tooltip «Exportar Excel» | `{() => handleExport('excel')}` |  |  |  | TractorSignupsAdminPage · l.396 |
| «Cancelar» | `{() => setConfirmGrant(false)}` | `manageRow && confirmGrant && !confirmDelete` | `{busy}` | `testid=signups-grant-cancel` | TractorSignupsAdminPage · l.589 |
| «Confirmar acceso» | `{() => runAction('grant')}` | `manageRow && confirmGrant && !confirmDelete` | `{busy}` | `testid=signups-grant-confirm` | TractorSignupsAdminPage · l.598 |
| «Otorgar acceso» | `{() => { // School-admin tier gets an explicit confirm step. if (manageRow.role …}` | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete` | `{busy \|\| manageRow.status === 'granted'}` |  | TractorSignupsAdminPage · l.616 |
| «Reenviar invitación» · tooltip «{manageRow.status !== 'granted' ? 'Disponible una vez otorgado el acceso' : 'Env…}» | `{() => runAction('resend')}` | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete` | `{busy \|\| manageRow.status !== 'granted' \|\| !manageRow.linked_user_id}` | `testid=signups-resend-invite` | TractorSignupsAdminPage · l.640 |
| «Descartar» | `{() => runAction('dismiss')}` | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete` | `{busy \|\| manageRow.status !== 'pending'}` |  | TractorSignupsAdminPage · l.659 |
| «Eliminar» | `{() => setConfirmDelete(true)}` | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete` | `{busy}` |  | TractorSignupsAdminPage · l.672 |
| «Cancelar» | `{() => setConfirmDelete(false)}` | `manageRow && !(confirmGrant && !confirmDelete) && !(!confirmDelete)` | `{busy}` |  | TractorSignupsAdminPage · l.714 |
| «Eliminar usuario y registro / Eliminar registro» | `{() => runAction('delete')}` | `manageRow && !(confirmGrant && !confirmDelete) && !(!confirmDelete)` | `{busy}` |  | TractorSignupsAdminPage · l.722 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar nombre, email o profesión» | text | «Buscar nombre, email o profesión» |  |  |  | TractorSignupsAdminPage · l.423 |
|  | select |  | «Todos los colegios», «(lista) {school.name}» |  |  | TractorSignupsAdminPage · l.432 |
|  | select |  | «Todos los orígenes», «(lista) {SIGNUP_SOURCE_LABELS[sourceKey]}» |  | `testid=signups-source-filter` | TractorSignupsAdminPage · l.441 |
|  | select |  | «Todos los roles», «(lista) {TRACTOR_ROLE_LABELS[roleKey]}» |  |  | TractorSignupsAdminPage · l.455 |
|  | select |  | «Todos los estados», «(lista) {TRACTOR_STATUS_LABELS[statusKey]}» |  |  | TractorSignupsAdminPage · l.468 |
|  | select |  | «Todos», «Ya es usuario», «Nuevo usuario» |  |  | TractorSignupsAdminPage · l.481 |
| «También eliminar la cuenta de la plataforma (inicio de sesión, perfil y roles). [Esta persona ya tenía una cuenta antes de este registro; se eliminará por completo.]» | checkbox |  |  | `manageRow && !(confirmGrant && !confirmDelete) && !(!confirmDelete) && manageRow.linked_user_id` |  | TractorSignupsAdminPage · l.696 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{manageRow !== null}` |  | TractorSignupsAdminPage · l.533 |

**Toasts** (9)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «{message}» |  | TractorSignupsAdminPage · l.116 |
| plain | «Acceso otorgado. {json.emailMessage ?? 'No se…} / Puedes reenviar la invitación desde este mismo panel.» | `action === 'grant' && json.email && json.email.sent === false` | runAction · l.210 |
| success | «Acceso otorgado» | `action === 'grant' && !(json.email && json.email.sent === false)` | runAction · l.217 |
| plain | «{json.generation.warning}» | `action === 'grant' && json.generation?.warning` | runAction · l.221 |
| success | «Invitación reenviada» | `!(action === 'grant') && action === 'resend' && json.success` | runAction · l.225 |
| plain | «No se pudo enviar el correo» | `!(action === 'grant') && action === 'resend' && !(json.success)` | runAction · l.227 |
| success | «Registro descartado» | `!(action === 'grant') && !(action === 'resend') && action === 'dismiss'` | runAction · l.234 |
| success | «Usuario y registro eliminados / Registro eliminado» | `!(action === 'grant') && !(action === 'resend') && !(action === 'dismiss')` | runAction · l.236 |
| error | «Error al procesar la acción» |  | runAction · l.249 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar registros» | `throw (shown by whoever catches it)` | `!response.ok` | TractorSignupsAdminPage · l.109 |
| «No se pudo completar la acción» | `throw (shown by whoever catches it)` | `!response.ok` | runAction · l.201 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `server redirect` | `!user` | getServerSideProps · l.65 |
| `/dashboard` | `server redirect` | `!isAdmin` | getServerSideProps · l.71 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `isAdmin = await isGlobalAdmin(service, user.id)` | getServerSideProps · l.69 |
| `isAdmin = await isGlobalAdmin(service, user.id)` | getServerSideProps · l.69 |

**Pieces placed here, with the texts and settings handed to them** (49)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SourceBadge` |  |  |  | TractorSignupsAdminPage · l.322 |
| `RoleBadge` |  |  |  | TractorSignupsAdminPage · l.339 |
| `ExistingUserBadge` |  |  |  | TractorSignupsAdminPage · l.344 |
| `StatusBadge` |  |  |  | TractorSignupsAdminPage · l.349 |
| `Settings2` | aria-hidden: true |  |  | TractorSignupsAdminPage · l.362 |
| `MainLayout` | pageTitle: Registros |  |  | TractorSignupsAdminPage · l.371 |
| `ResponsiveFunctionalPageHeader` | title: Registros · subtitle: Registros públicos de acceso (Líderes Tractor y registro general) |  |  | TractorSignupsAdminPage · l.373 |
| `RefreshCw` | aria-hidden: true |  |  | TractorSignupsAdminPage · l.386 |
| `Download` | aria-hidden: true |  |  | TractorSignupsAdminPage · l.394 |
| `FileSpreadsheet` | aria-hidden: true |  |  | TractorSignupsAdminPage · l.402 |
| `StatCard` | label: Total |  |  | TractorSignupsAdminPage · l.409 |
| `StatCard` | label: Pendientes |  |  | TractorSignupsAdminPage · l.410 |
| `StatCard` | label: Accesos otorgados |  |  | TractorSignupsAdminPage · l.411 |
| `StatCard` | label: Ya eran usuarios |  |  | TractorSignupsAdminPage · l.412 |
| `Filter` | aria-hidden: true |  |  | TractorSignupsAdminPage · l.417 |
| `Loader2` | aria-hidden: true | `loading` |  | TractorSignupsAdminPage · l.500 |
| `Users` | aria-hidden: true | `!(loading) && filteredRows.length === 0` |  | TractorSignupsAdminPage · l.506 |
| `EnhancedTable` |  | `!(loading) && !(filteredRows.length === 0)` · screen size: `hidden md:block` |  | TractorSignupsAdminPage · l.513 |
| `TractorSignupCard` |  | `!(loading) && !(filteredRows.length === 0) && each filteredRows` · screen size: `md:hidden` |  | TractorSignupsAdminPage · l.525 |
| `DialogContent` |  |  |  | TractorSignupsAdminPage · l.539 |
| `DialogHeader` |  | `manageRow` |  | TractorSignupsAdminPage · l.542 |
| `DialogTitle` |  | `manageRow` |  | TractorSignupsAdminPage · l.543 |
| `DialogDescription` |  | `manageRow` |  | TractorSignupsAdminPage · l.544 |
| `Detail` | label: Origen | `manageRow` |  | TractorSignupsAdminPage · l.548 |
| `SourceBadge` |  | `manageRow` |  | TractorSignupsAdminPage · l.549 |
| `Detail` | label: Generación | `manageRow` |  | TractorSignupsAdminPage · l.551 |
| `Detail` | label: Colegio | `manageRow` |  | TractorSignupsAdminPage · l.552 |
| `Detail` | label: Rol | `manageRow` |  | TractorSignupsAdminPage · l.553 |
| `RoleBadge` |  | `manageRow` |  | TractorSignupsAdminPage · l.554 |
| `Detail` | label: Nacimiento | `manageRow` |  | TractorSignupsAdminPage · l.556 |
| `Detail` | label: Profesión | `manageRow` |  | TractorSignupsAdminPage · l.557 |
| `Detail` | label: Registro | `manageRow` |  | TractorSignupsAdminPage · l.558 |
| `Detail` | label: Estado | `manageRow` |  | TractorSignupsAdminPage · l.559 |
| `StatusBadge` |  | `manageRow` |  | TractorSignupsAdminPage · l.560 |
| `Detail` | label: ¿Ya es usuario? | `manageRow` |  | TractorSignupsAdminPage · l.563 |
| `Detail` | label: Otorgado | `manageRow && manageRow.granted_at` |  | TractorSignupsAdminPage · l.574 |
| `AlertTriangle` | aria-hidden: true | `manageRow && confirmGrant && !confirmDelete` |  | TractorSignupsAdminPage · l.581 |
| `Loader2` | aria-hidden: true | `manageRow && confirmGrant && !confirmDelete && pendingAction === 'grant'` |  | TractorSignupsAdminPage · l.606 |
| `CheckCircle2` | aria-hidden: true | `manageRow && confirmGrant && !confirmDelete && !(pendingAction === 'grant')` |  | TractorSignupsAdminPage · l.608 |
| `Loader2` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete && pendingAction === 'grant'` |  | TractorSignupsAdminPage · l.630 |
| `CheckCircle2` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete && !(pendingAction === 'grant')` |  | TractorSignupsAdminPage · l.632 |
| `Loader2` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete && pendingAction === 'resend'` |  | TractorSignupsAdminPage · l.653 |
| `Send` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete && !(pendingAction === 'resend')` |  | TractorSignupsAdminPage · l.655 |
| `Loader2` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete && pendingAction === 'dismiss'` |  | TractorSignupsAdminPage · l.666 |
| `XCircle` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete && !(pendingAction === 'dismiss')` |  | TractorSignupsAdminPage · l.668 |
| `Trash2` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !confirmDelete` |  | TractorSignupsAdminPage · l.678 |
| `AlertTriangle` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !(!confirmDelete)` |  | TractorSignupsAdminPage · l.685 |
| `Loader2` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !(!confirmDelete) && pendingAction === 'delete'` |  | TractorSignupsAdminPage · l.729 |
| `Trash2` | aria-hidden: true | `manageRow && !(confirmGrant && !confirmDelete) && !(!confirmDelete) && !(pendingAction === 'delete')` |  | TractorSignupsAdminPage · l.731 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `message` | «Error al cargar registros» | TractorSignupsAdminPage · l.114 |
| `exportData` | «registros-publicos-{new Date().toISOString().sl…}», «Registros públicos» | handleExport · l.293 |
| `columns` | «Nombre», «Origen», «Colegio», «Rol», «¿Ya es usuario?», «Estado» | TractorSignupsAdminPage · l.308 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «No se envió el correo de invitación.» | TractorSignupsAdminPage · l.210 |
| «Enviar de nuevo el correo de invitación» | TractorSignupsAdminPage · l.648 |

**Values shown from data** (14)

- `{row.full_name}` — TractorSignupsAdminPage · l.314
- `{row.email}` — TractorSignupsAdminPage · l.315
- `{row.school_name}` — TractorSignupsAdminPage · l.329
- `{row.generation_name}` — TractorSignupsAdminPage · l.331, when `row.generation_name`
- `{value}` — TractorSignupsAdminPage · l.339
- `{error}` — TractorSignupsAdminPage · l.494, when `error`
- `{manageRow.full_name} / {manageRow.email}` — TractorSignupsAdminPage · l.543, when `manageRow`
- `{manageRow.email}` — TractorSignupsAdminPage · l.544, when `manageRow`
- `{manageRow.role_label}` — TractorSignupsAdminPage · l.554, when `manageRow`
- `{manageRow.school_name}` — TractorSignupsAdminPage · l.584, when `manageRow && confirmGrant && !confirmDelete`
- `{label}` — StatCard · l.754
- `{value}` — StatCard · l.755
- `{label}` — Detail · l.771
- `{children} / {value} / —` — Detail · l.772

**Other texts on screen** (11)

- «Filtros» — TractorSignupsAdminPage · l.418
- «Cargando registros» — TractorSignupsAdminPage · l.501, when `loading`
- «No hay registros que coincidan con los filtros.» — TractorSignupsAdminPage · l.507, when `!(loading) && filteredRows.length === 0`
- «Sí — {formatExistingRoles(manageRow.exist…} / sin roles activos» — TractorSignupsAdminPage · l.565, when `manageRow && manageRow.is_existing_user`
- «No» — TractorSignupsAdminPage · l.569, when `manageRow && !(manageRow.is_existing_user)`
- «Estás por otorgar acceso con rol» — TractorSignupsAdminPage · l.583, when `manageRow && confirmGrant && !confirmDelete`
- «Equipo Directivo» — TractorSignupsAdminPage · l.583, when `manageRow && confirmGrant && !confirmDelete`
- «en» — TractorSignupsAdminPage · l.583, when `manageRow && confirmGrant && !confirmDelete`
- «. Este rol tiene permisos de administración sobre el colegio. ¿Deseas continuar?» — TractorSignupsAdminPage · l.584, when `manageRow && confirmGrant && !confirmDelete`
- «Se eliminará este registro de forma permanente. Marca la casilla para eliminar también la cuenta de la plataforma.» — TractorSignupsAdminPage · l.686, when `manageRow && !(confirmGrant && !confirmDelete) && !(!confirmDelete)`
- «También eliminar la cuenta de la plataforma (inicio de sesión, perfil y roles). [Esta persona ya tenía una cuenta antes de este registro; se eliminará por completo.]» (label) — TractorSignupsAdminPage · l.695, when `manageRow && !(confirmGrant && !confirmDelete) && !(!confirmDelete) && manageRow.linked_user_id`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/admin/TractorSignupCard.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `components/reports/EnhancedTable.tsx`
- `components/ui/dialog.tsx`
- `lib/api-auth.ts`
- `lib/exportUtils.ts`
- `lib/signups.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/tractor-signups` | GET | `pages/admin/tractor-signups.tsx:106` |
| `/api/admin/tractor-signups/grant` | ? | `pages/admin/tractor-signups.tsx:191` |
| `/api/admin/tractor-signups/resend-invite` | ? | `pages/admin/tractor-signups.tsx:190` |

## /admin/user-management

File `pages/admin/user-management.tsx` · 1028 lines · frame: MainLayout

### Who reaches it

- Menu: Personas › «Usuarios» → `/admin/user-management` — admin only; the group: admin only (`Sidebar.tsx` l.404)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.321 `router.push → /login  (when !session?.user)`
  - l.336 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.337 `adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin') \|\| userRole === 'admin'`
  - l.340 `router.push → /dashboard  (when !adminRole)`
  - l.676 `router.push → /login`
  - l.741 `Solo administradores pueden acceder a la gestión de usuarios.`
- Linked from: `components/layout/Sidebar.tsx:406`, `components/notifications/ModernNotificationCenter.tsx:316`, `components/notifications/NotificationDropdown.tsx:145`, `pages/admin/qa/index.tsx:875`, `pages/admin/qa/index.tsx:876`, `pages/admin/qa/index.tsx:893`, `pages/admin/qa/index.tsx:894`, `pages/admin/school-users.tsx:55`, `pages/api/qa/seed-codebase-index.ts:18`, `pages/notifications.tsx:277`
- Tests: browser tests that CI runs: `tests/e2e/auth-lifecycle.spec.ts`; unit tests of the page: `__tests__/pages/admin/user-management.expense-access.test.tsx`.
- QA scenarios that name this address: admin 2, community_manager 1, consultor 1, equipo_directivo 1, lider_comunidad 1, lider_generacion 1, supervisor_de_red 1.

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

- The list becomes a table with columns «Usuario», «Colegio», «Roles», «Estado», «Acciones»; a row expands (one at a time) to show the details, «Reportes de gastos» and «Asignaciones». New texts: column heads «Usuario», «Colegio», «Roles», «Estado». (usuarios.md 'Changed on purpose', Layout and 'New texts' bullet 1; approved by Brent 13 Nov 2026 10:19)
- Action buttons move from the expanded panel into the row, by status: pending «Aprobar Usuario», «Rechazar Usuario»; approved «Gestionar Roles» + pencil «Editar Usuario»; rejected «Eliminar Usuario»; the rest in a «more» menu. (usuarios.md 'Changed on purpose', Layout; approved by Brent 13 Nov 2026 10:19)
- All of a user's roles show as badges in the row. (usuarios.md 'Changed on purpose', Layout; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:19)
- Loading shows skeleton rows inside the table with «Cargando usuarios...» in the pagination line; no full-page spinner, the list no longer disappears. (usuarios.md 'Changed on purpose', Loading; approved by Brent 13 Nov 2026 10:19)
- The «Gestión de Roles» pop-up keeps its content while saving. (usuarios.md 'Changed on purpose', Loading; approved by Brent 13 Nov 2026 10:19)
- Delete (behaviour): one confirmation instead of two, and the false early toast «Usuario eliminado exitosamente» is gone. The second pop-up's title «Confirmar Eliminación» is dropped here (still used by the role delete). (usuarios.md 'Changed on purpose', Delete; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:19 (told it changes behaviour))
- Consultant assignment (behaviour): the clicked consultant is the consultant, not the student. The pop-up title and button change from «Editar Asignación de Consultor» / «Actualizar Asignación» to «Nueva Asignación de Consultor» / «Crear Asignación». (usuarios.md 'Changed on purpose', Consultant assignment; 'Where it sits', 'Odd things, as handled' item 3; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:19 (told it changes behaviour))
- The bulk assignment confirmation is a small pop-up (question, explanation, «Cancelar», «Confirmar») instead of a toast with buttons. (usuarios.md 'Changed on purpose', Consultant assignment; approved by Brent 13 Nov 2026 10:19)
- Search (behaviour) really includes the school name, as the placeholder says. (usuarios.md 'Changed on purpose', Search; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:19 (told it changes behaviour))
- The community filter lists communities of the chosen school from the whole list, not only the current page. (usuarios.md 'Changed on purpose', Community filter; approved by Brent 13 Nov 2026 10:19)
- A community without generation shows in the role scope line. (usuarios.md 'Changed on purpose', Other; approved by Brent 13 Nov 2026 10:19)
- The «Red: {network}» line shows for supervisors. (usuarios.md 'Changed on purpose', Other; approved by Brent 13 Nov 2026 10:19)
- The «Tester QA» label is linked to its switch (id qa_tester); the switch still saves on click. (usuarios.md 'Changed on purpose', Other; approved by Brent 13 Nov 2026 10:19)
- Bulk import accepts every role the screen lists (including community_manager) plus encargado_licitacion. (usuarios.md 'Changed on purpose', Other; approved by Brent 13 Nov 2026 10:19)
- In «Crear Nuevo Usuario» the password rule is help text under the field instead of the placeholder. (usuarios.md 'Changed on purpose', Other; approved by Brent 13 Nov 2026 10:19)
- The tab title is «Gestión de Usuarios» in every state (today the main state shows «Genera - Hub de Transformación»). (usuarios.md 'Changed on purpose', Other; approved by Brent 13 Nov 2026 10:19)
- The assignments badge says «1 asignación» in the singular (today always «asignaciones»); on wide screens the table has fixed column widths so a row stays on one or two lines. (usuarios.md 'Where it sits', 'Corrections by the phase 1 session (13 Nov 2026)'; mock-up approved by Brent 13 Nov 2026 10:19)
- New labels for assistive technology: «Más acciones para {name}» / «Más acciones», «Filtrar por estado», «Buscar», «Mostrar contraseñas» / «Ocultar contraseñas», «Pasos», «Exitoso» / «Fallido». (usuarios.md 'New texts' bullet 2; approved by Brent 13 Nov 2026 10:19)
- New pop-up eyebrow «Gestión de Usuarios». (usuarios.md 'New texts' bullet 3; approved by Brent 13 Nov 2026 10:19)

### Notes

- In bulk import an empty role cell becomes docente. (usuarios.md §6 item 11, last sentence)
- The same user list component (UUM) also runs /admin/school-users, with props hideBulkImport, hideExpenseAccess, lockedSchoolId, hideCommunityFilter, hideApprove, hideReject, hideAssign (UUM:80-86); the edit pop-up has disableSchoolEdit and hideQaTesterToggle. These switches must survive (the mock-up shows them with «Maqueta · pantalla»). (usuarios.md §6 item 18)
- Sample-only texts, not for the build: the invented error reasons, «Red QA Cordillera», community names. (usuarios.md 'New texts' bullet 4)
- No place in the mock-up, must survive: sign-in redirects and «No hay sesión activa»; server-load messages («Error al cargar datos organizacionales», «Error de autenticación», «Error al cargar datos de asignación», «Cargando datos...», the audit warning); the English server messages of roles; import «RUT inválido», the password-policy row error and «Debe seleccionar un colegio antes de continuar» (unreachable today too); the texts for editing an existing consultant assignment (the page never does); «Rol actualizado a {role}» (dead code today). (usuarios.md 'No place in the mock-up')

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h3 | `!isAdmin` | UserManagement · l.740 |
| «Crear Nuevo Usuario» | h3 | `showAddForm` | UserManagement · l.824 |
| «Confirmar Eliminación» | h3 | `showDeleteModal && userToDelete` | UserManagement · l.959 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Anterior» | `{() => handlePageChange(currentPage - 1)}` |  | `{currentPage === 1 \|\| loading}` |  | UserManagement · l.800 |
| «Siguiente» | `{() => handlePageChange(currentPage + 1)}` |  | `{currentPage >= totalPages \|\| loading}` |  | UserManagement · l.808 |
| «[icon X]» | `{() => setShowAddForm(false)}` | `showAddForm` |  |  | UserManagement · l.825 |
| «Cancelar» | `{() => setShowAddForm(false)}` | `showAddForm` |  |  | UserManagement · l.888 |
| «Creando... / Crear Usuario» (submits the form) |  | `showAddForm` | `{isCreating}` |  | UserManagement · l.895 |
| «Cancelar» | `{() => { setShowDeleteModal(false); setUserToDelete(null); }}` | `showDeleteModal && userToDelete` |  |  | UserManagement · l.976 |
| «Eliminar Usuario» | `{handleConfirmDelete}` | `showDeleteModal && userToDelete` |  |  | UserManagement · l.985 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Email *» | email | «usuario@ejemplo.com» · required |  | `showAddForm` |  | UserManagement · l.838 |
| «Contraseña *» | password | «{PASSWORD_POLICY_SUMMARY}» · required · `minLength={PASSWORD_POLICY.minLength}` |  | `showAddForm` |  | UserManagement · l.851 |
| «Nombre» | text | «Nombre» |  | `showAddForm` |  | UserManagement · l.866 |
| «Apellido» | text | «Apellido» |  | `showAddForm` |  | UserManagement · l.878 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleAddUser}` | `showAddForm` | UserManagement · l.832 |

**Pop-ups** (7)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Crear Nuevo Usuario» | written in this file | `showAddForm` |  | UserManagement · l.821 |
| `RoleAssignmentModal` | component | `{showRoleModal}` |  | UserManagement · l.920 |
| `ConsultantAssignmentModal` | component | `{showConsultantModal}` |  | UserManagement · l.933 |
| «Confirmar Eliminación» | written in this file | `showDeleteModal && userToDelete` |  | UserManagement · l.952 |
| `PasswordResetModal` | component | `{showPasswordResetModal}` |  | UserManagement · l.998 |
| `BulkUserImportModal` | component | `{showBulkImportModal}` |  | UserManagement · l.1009 |
| `UserEditModal` | component | `{showEditModal}` |  | UserManagement · l.1019 |

**Toasts** (13)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar usuarios» |  | UserManagement · l.205 |
| success | «Usuario aprobado correctamente» |  | handleApproveUser · l.251 |
| error | «Error al aprobar usuario:» |  | handleApproveUser · l.256 |
| success | «Usuario rechazado» |  | handleRejectUser · l.307 |
| error | «Error al rechazar usuario:» |  | handleRejectUser · l.312 |
| success | «Rol actualizado a {newRole}» |  | handleRoleChange · l.458 |
| error | «Error al actualizar rol: {error.message}» |  | handleRoleChange · l.470 |
| success | «Usuario eliminado correctamente» |  | handleConfirmDelete · l.529 |
| error | «Error al eliminar usuario: {error.message}» |  | handleConfirmDelete · l.546 |
| error | «Email y contraseña son obligatorios» | `!newUserEmail.trim() \|\| !newUserPassword.trim()` | handleAddUser · l.565 |
| error | «{passwordError}» | `passwordError` | handleAddUser · l.583 |
| success | «Usuario creado correctamente. El usuario deberá cambiar su contraseña en el primer inicio de sesión.» | `result.success && result.user` | handleAddUser · l.636 |
| error | «Error al crear usuario: {errorMessage}» |  | handleAddUser · l.657 |

**Messages set on the page** (15)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch users» | `throw (shown by whoever catches it)` | `!response.ok` | UserManagement · l.175 |
| «No authentication token available» | `throw (shown by whoever catches it)` | `!session?.access_token` | handleApproveUser · l.229 |
| «Failed to approve user» | `throw (shown by whoever catches it)` | `!response.ok` | handleApproveUser · l.248 |
| «No authentication token available» | `throw (shown by whoever catches it)` | `!session?.access_token` | handleRejectUser · l.285 |
| «Failed to reject user» | `throw (shown by whoever catches it)` | `!response.ok` | handleRejectUser · l.304 |
| «No authentication token available» | `throw (shown by whoever catches it)` | `!session?.access_token` | handleRoleChange · l.423 |
| «Invalid response from server: {responseText.substring(0, 1…}...» | `throw (shown by whoever catches it)` |  | handleRoleChange · l.446 |
| «Server error: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | handleRoleChange · l.450 |
| «No authentication token available» | `throw (shown by whoever catches it)` | `!session?.access_token` | handleConfirmDelete · l.494 |
| «Invalid response from server: {responseText.substring(0, 1…}...» | `throw (shown by whoever catches it)` |  | handleConfirmDelete · l.516 |
| «Server error: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | handleConfirmDelete · l.520 |
| «No active session» | `throw (shown by whoever catches it)` | `!session` | handleAddUser · l.600 |
| «Failed to create user» | `throw (shown by whoever catches it)` | `!response.ok` | handleAddUser · l.622 |
| «No session found» | `throw (shown by whoever catches it)` | `!session` | handlePasswordReset · l.682 |
| «Failed to reset password» | `throw (shown by whoever catches it)` | `!response.ok` | handlePasswordReset · l.699 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAdminAndFetchUsers · l.321 |
| `/dashboard` | `router.push` | `!adminRole` | checkAdminAndFetchUsers · l.340 |
| `/login` | `router.push` |  | handleLogout · l.676 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkAdminAndFetchUsers · l.336 |
| `adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin') \|\| userRole === 'admin'` | checkAdminAndFetchUsers · l.337 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Gestión de Usuarios | `loading` |  | UserManagement · l.707 |
| `MainLayout` | pageTitle: Acceso Denegado | `!isAdmin` |  | UserManagement · l.727 |
| `MainLayout` |  |  |  | UserManagement · l.750 |
| `UnifiedUserManagement` |  |  |  | UserManagement · l.759 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Sin nombre» | UserManagement · l.78 |
| «Bearer {session.access_token}» | UserManagement · l.237 |
| «Sin escuela» | UserManagement · l.277 |
| «Este email ya está registrado en el sistema» | UserManagement · l.652 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.674 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.675 |

**Values shown from data** (1)

- `{userToDelete.email}` — UserManagement · l.968, when `showDeleteModal && userToDelete`

**Other texts on screen** (10)

- «Cargando usuarios...» — UserManagement · l.718, when `loading`
- «Solo administradores pueden acceder a la gestión de usuarios.» — UserManagement · l.741, when `!isAdmin`
- «No hay usuarios para mostrar / Mostrando {pageStart}-{pageEnd} de {totalUsers} usuarios» — UserManagement · l.796
- «Página {currentPage} de {totalPages}» — UserManagement · l.807
- «Email *» (label) — UserManagement · l.835, when `showAddForm`
- «Contraseña *» (label) — UserManagement · l.848, when `showAddForm`
- «Nombre» (label) — UserManagement · l.863, when `showAddForm`
- «Apellido» (label) — UserManagement · l.875, when `showAddForm`
- «¿Estás seguro de que quieres eliminar al usuario» — UserManagement · l.967, when `showDeleteModal && userToDelete`
- «Esta acción no se puede deshacer.» — UserManagement · l.971, when `showDeleteModal && userToDelete`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/ConsultantAssignmentModal.tsx`
- `components/PasswordResetModal.tsx`
- `components/RoleAssignmentModal.tsx`
- `components/admin/BulkUserImportModal.tsx`
- `components/admin/UnifiedUserManagement.tsx`
- `components/admin/UserEditModal.tsx`
- `components/common/ConfirmModal.tsx`
- `constants/externalSchools.ts`
- `constants/toastMessages.ts`
- `constants/toastStyles.ts`
- `lib/auth/password-generator.ts`
- `lib/auth/password-policy.ts`
- `types/roles.ts`
- `utils/bulkUserParser.ts`
- `utils/roleUtils.ts`
- `utils/toastUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/approve-user` | POST | `pages/admin/user-management.tsx:233`, `pages/admin/user-management.tsx:289` |
| `/api/admin/assign-role` | POST | `utils/roleUtils.ts:810` |
| `/api/admin/bulk-create-users` | POST | `components/admin/BulkUserImportModal.tsx:181` |
| `/api/admin/consultant-assignment-users` | GET | `components/ConsultantAssignmentModal.tsx:100` |
| `/api/admin/consultant-assignments` | ? | `components/ConsultantAssignmentModal.tsx:586` |
| `/api/admin/create-user` | POST | `pages/admin/user-management.tsx:604` |
| `/api/admin/delete-user` | POST | `pages/admin/user-management.tsx:498` |
| `/api/admin/remove-role` | POST | `utils/roleUtils.ts:858` |
| `/api/admin/reset-password` | POST | `pages/admin/user-management.tsx:685` |
| `/api/admin/update-qa-tester-status` | POST | `components/admin/UserEditModal.tsx:116` |
| `/api/admin/update-role` | POST | `pages/admin/user-management.tsx:427` |
| `/api/admin/update-user` | POST | `components/admin/UserEditModal.tsx:72` |
| `/api/admin/user-roles` | GET | `components/RoleAssignmentModal.tsx:143` |
| `/api/admin/users` | GET | `pages/admin/user-management.tsx:173` |

## /profile

File `pages/profile.tsx` · 819 lines · frame: MainLayout

### Who reaches it

- Menu: «Mi Perfil» → `/profile` — everyone signed in (`Sidebar.tsx` l.124)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.83 `router.push → /login?next=[*]  (when !session?.user)`
  - l.95 `adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin')`
  - l.463 `router.push → /pending-approval  (when !(updateError) && isNewUser)`
  - l.475 `router.push → /login`
- Linked from: `components/DynamicFavicon.tsx:18`, `components/layout/MainLayout.tsx:391`, `components/layout/Sidebar.tsx:127`, `components/layout/Sidebar.tsx:1309`, `components/layout/TopBarNuevo.tsx:109`, `components/panel/PanelClasico.tsx:86`, `components/panel/PanelClasico.tsx:87`, `components/panel/PanelNuevo.tsx:88`, `components/panel/PanelNuevo.tsx:89`, `hooks/usePanel.ts:248`, `lib/auth/forced-password-change.ts:156`, `lib/frontend-auth-utils.ts:143` and 4 more
- Tests: browser tests that CI runs: `tests/e2e/look-frame.spec.ts`, `tests/e2e/look-panel.spec.ts`, `tests/e2e/notification-settings.spec.ts`; browser tests CI skips: `tests/e2e/panel-pin.spec.ts`, `tests/qa/auth-redirects.spec.ts`; unit tests of the page: `__tests__/notifications/entry-points.test.tsx`, `__tests__/pages/profile.direct-open.test.tsx`.
- QA scenarios that name this address: admin 1, community_manager 2.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | yes | pass |
| lider_generacion | yes | pass |
| lider_comunidad | yes | pass |
| supervisor_de_red | yes | pass |
| community_manager | yes | pass |
| docente | yes | pass |
| encargado_licitacion | yes | pass |

### What the page file itself draws

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Error de Sesión» | h2 | `!session && router.query.from === 'login'` | ProfilePage · l.499 |
| «Vista previa del avatar» | h3 | `showAvatarModal` | ProfilePage · l.783 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar sesión» | `{handleLogout}` |  |  |  | ProfilePage · l.762 |
| «Guardar perfil» (submits the form) |  |  |  |  | ProfilePage · l.769 |
| «Cancelar» | `{closeAvatarModal}` | `showAvatarModal` |  |  | ProfilePage · l.797 |
| «Confirmar» | `{confirmAvatar}` | `showAvatarModal` |  |  | ProfilePage · l.803 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a Iniciar Sesión» | `/login` | `!session && router.query.from === 'login'` |  | ProfilePage · l.503 |
| «Notificaciones por correo Elige qué notificaciones recibes por correo» | `/configuracion/notificaciones` |  | `testid=profile-notification-settings` | ProfilePage · l.746 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{() => document.getElementById('avatar-input')?.click()}` |  | ProfilePage · l.586 |

**Fields** (10)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | file | accepts `image/png,image/jpeg,image/gif,image/webp` |  | hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=avatar-input (id used by code)` | ProfilePage · l.593 |
| «Nombre» | text | required |  |  | `id=firstName (id used by code)` | ProfilePage · l.608 |
| «Segundo nombre (opcional)» | text |  |  |  | `id=middleName (id used by code)` | ProfilePage · l.621 |
| «Apellidos» | text | required |  |  | `id=lastName (id used by code)` | ProfilePage · l.633 |
| «Correo electrónico» | email | `readOnly=true` |  |  |  | ProfilePage · l.646 |
| «Escuela» | text | `readOnly=true` |  | `!isAdmin && schools.length <= 1` | `id=school (id used by code)` | ProfilePage · l.658 |
| «Escuela» | select |  | «Selecciona una escuela», «(lista) {schoolItem.name} [- {schoolItem.location}] [({schoolItem.type})]» | `!(!isAdmin && schools.length <= 1)` | `id=school (id used by code)` | ProfilePage · l.666 |
| «Escuela externa (afiliación)» | text | `readOnly=true` |  | `isConsultant && profile?.external_school_affiliation` |  | ProfilePage · l.691 |
| «Comunidades de crecimiento / Comunidad de crecimiento» | text | `readOnly=true` |  | `!(growthCommunities.length > 0)` |  | ProfilePage · l.720 |
| «Descripción» | textarea | «Cuéntanos sobre ti...» |  |  | `id=description (id used by code)` | ProfilePage · l.732 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Profile avatar · {previewUrl} | `previewUrl` | `id=avatar-preview` | ProfilePage · l.568 |
| img · alt Profile avatar · {avatarUrl} | `!(previewUrl) && avatarUrl` | `id=avatar-preview` | ProfilePage · l.575 |
| img · alt Avatar Preview · {previewUrl} | `showAvatarModal` |  | ProfilePage · l.787 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => { e.preventDefault(); handleSave(); }}` |  | ProfilePage · l.603 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Vista previa del avatar» | written in this file | `showAvatarModal` |  | ProfilePage · l.781 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «{TOAST_MESSAGES.USER.PROFILE_ERROR + ': ' + updateError.message}» | `updateError` | handleSave · l.409 |
| success | «{TOAST_MESSAGES.USER.PROFILE_UPDATED}» | `!(updateError) && avatarUploadFailed` | handleSave · l.454 |
| error | «{avatarErrorMessage}» | `!(updateError) && avatarUploadFailed` | handleSave · l.455 |
| success | «{TOAST_MESSAGES.USER.PROFILE_UPDATED}» | `!(updateError) && !(avatarUploadFailed)` | handleSave · l.457 |
| error | «{TOAST_MESSAGES.NETWORK.UNEXPECTED_ERROR}» |  | handleSave · l.469 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `router.push` | `!session?.user` | getSessionAndProfile · l.83 |
| `/pending-approval` | `router.push` | `!(updateError) && isNewUser` | handleSave · l.463 |
| `/login` | `router.push` |  | handleLogout · l.475 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin')` | getSessionAndProfile · l.95 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ProfilePage · l.512 |
| `ResponsiveFunctionalPageHeader` | title: Mi Perfil · subtitle: Completa tu información personal para acceder a la plataforma / Actualiza tu información personal · primaryAction: Editar Perfil |  |  | ProfilePage · l.521 |
| `PasswordChangeSection` |  |  |  | ProfilePage · l.743 |
| `Bell` | aria-hidden: true |  |  | ProfilePage · l.752 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «El almacenamiento para avatares no está configurado. Tu perfil se guardará sin la imagen.» | ProfilePage · l.335 |
| «Error inesperado al subir la imagen. Tu perfil se guardará sin la imagen.» | ProfilePage · l.351 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (8)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 1500)` | handleSave · l.462 |
| lookup | `getElementById('profile-form')` | ProfilePage · l.529 |
| scroll | `formElement.scrollIntoView()` | ProfilePage · l.531 |
| mark | `id=profile-page` | ProfilePage · l.538 |
| mark | `id=success-alert` | ProfilePage · l.541 |
| mark | `id=profile-form` | ProfilePage · l.562 |
| lookup | `getElementById('avatar-input')` | ProfilePage · l.588 |
| address value | `?from` | l.1 |

**Values shown from data** (1)

- `{community.name}` — ProfilePage · l.711, when `growthCommunities.length > 0 && each growthCommunities`

**Other texts on screen** (15)

- «Cargando...» — ProfilePage · l.483, when `loading`
- «Hubo un problema al establecer tu sesión. Por favor, intenta iniciar sesión nuevamente.» — ProfilePage · l.501, when `!session && router.query.from === 'login'`
- «Perfil cargado exitosamente» — ProfilePage · l.543, when `dataLoaded`
- «@keyframes fadeIn { 0% { opacity: 0; transform: translate(-50%, -20px); } 100% { opacity: 1; transform: translate(-50%, 0); } } @keyframes fadeOut { 0% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(…» — ProfilePage · l.544, when `dataLoaded`
- «PNG, JPG, GIF o WEBP (max. 10MB)» — ProfilePage · l.600
- «Nombre» (label) — ProfilePage · l.607
- «Segundo nombre (opcional)» (label) — ProfilePage · l.620
- «Apellidos» (label) — ProfilePage · l.632
- «Correo electrónico» (label) — ProfilePage · l.645
- «Escuela» (label) — ProfilePage · l.656
- «Escuela externa (afiliación)» (label) — ProfilePage · l.687, when `isConsultant && profile?.external_school_affiliation`
- «Esta información es gestionada por los administradores» — ProfilePage · l.698, when `isConsultant && profile?.external_school_affiliation`
- «Comunidades de crecimiento / Comunidad de crecimiento» (label) — ProfilePage · l.705
- «Descripción» (label) — ProfilePage · l.731
- «Esta es la apariencia que tendrá tu avatar» — ProfilePage · l.793, when `showAvatarModal`

**Reads and writes the database directly:** `bucket:avatars` (getPublicUrl, upload), `table:generations` (select), `table:profiles` (insert, select, update), `table:red_escuelas` (select), `table:schools` (select), `table:user_roles` (insert, select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/profile/PasswordChangeSection.tsx`
- `constants/externalSchools.ts`
- `constants/toastMessages.ts`
- `constants/toastStyles.ts`
- `types/roles.ts`
- `utils/toastUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/change-password` | POST | `components/profile/PasswordChangeSection.tsx:72` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/ConsultantAssignmentModal.tsx

Used by: `/admin/user-management`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Asignación de Consultor / Nueva Asignación de Consultor» | h2 |  | ConsultantAssignmentModal · l.662 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{() => { toast.dismiss(t.id); resolve(false); }}` | `formData.assignment_scope !== 'individual' && affectedCount > 0` |  |  | handleSubmit · l.486 |
| «Confirmar» | `{() => { toast.dismiss(t.id); resolve(true); }}` | `formData.assignment_scope !== 'individual' && affectedCount > 0` |  |  | handleSubmit · l.495 |
|  | `{onClose}` |  |  |  | ConsultantAssignmentModal · l.665 |
| «Cancelar» | `{onClose}` | `!(dataLoading)` |  |  | ConsultantAssignmentModal · l.993 |
| «Guardando... / Actualizar Asignación / Crear Asignación» (submits the form) |  | `!(dataLoading)` | `{loading}` |  | ConsultantAssignmentModal · l.1000 |

**Fields** (13)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Consultor *» | select | required | «Seleccionar consultor...», «(lista) {consultant.first_name} {consultant.last_name} ( {consultant.email} )» | `!(dataLoading)` |  | ConsultantAssignmentModal · l.687 |
| «Individual» | radio | `assignment_scope` |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.709 |
| «Comunidad» | radio | `assignment_scope` |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.720 |
| «Generación» | radio | `assignment_scope` · disabled: `{!!formData.school_id && !shouldShowGenerationField()}` |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.737 |
| «Escuela» | radio | `assignment_scope` |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.749 |
| «Usuario a Asignar *» | select | required | «Seleccionar usuario...», «(lista) {student.first_name} {student.last_name} ( {student.email} ) - {student.role}» | `!(dataLoading) && !fixedUser && formData.assignment_scope === 'individual'` |  | ConsultantAssignmentModal · l.783 |
| «Usuario (Opcional - para asignar a la comunidad de un usuario específico)» | select |  | «Seleccionar usuario...», «(lista) {student.first_name} {student.last_name} ( {student.email} ) - {student.role}» | `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && !fixedUser && formData.assignment_scope === 'community'` |  | ConsultantAssignmentModal · l.809 |
| «Escuela *» | select | required | «Seleccionar escuela...», «(lista) {school.name}» | `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && !(formData.assignment_scope === 'community' && formData.student_id && formData.school_id)` |  | ConsultantAssignmentModal · l.835 |
| «Generación *» | select | required · disabled: `{!formData.school_id}` | «Seleccionar generación...», «Esta escuela no tiene generaciones», «(lista) {generation.name}» | `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && ((formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community') && shouldShowGenerationField())` |  | ConsultantAssignmentModal · l.857 |
| «Comunidad de Crecimiento *» | select | required · disabled: `{!formData.school_id \|\| (shouldShowGenerationField() && !formData.generation_id)}` | «Seleccionar comunidad...», «No hay comunidades disponibles», «(lista) {community.name}» | `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && formData.assignment_scope === 'community' && !(formData.student_id && formData.community_id)` |  | ConsultantAssignmentModal · l.890 |
| «Puede asignar cursos» | checkbox |  |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.939 |
| «Establecer fecha de finalización» | checkbox |  |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.955 |
| «Fecha de finalización» | datetime-local | required · `min={(() => { const d = new Date(); const year = d.getFullYear(); const month = Stri…}` |  | `!(dataLoading) && formData.has_end_date` |  | ConsultantAssignmentModal · l.966 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` | `!(dataLoading)` | ConsultantAssignmentModal · l.681 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Asignación de Consultor / Nueva Asignación de Consultor» | written in this file |  |  | ConsultantAssignmentModal · l.658 |

**Toasts** (19)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error de autenticación» | `sessionError \|\| !session?.access_token` | fetchData · l.95 |
| error | «Error al cargar datos de asignación» |  | fetchData · l.119 |
| error | «Debe seleccionar un consultor» | `!formData.consultant_id` | validateForm · l.384 |
| error | «Debe seleccionar un usuario» | `formData.assignment_scope === 'individual' && !formData.student_id` | validateForm · l.391 |
| error | «El consultor no puede asignarse a sí mismo» | `formData.assignment_scope === 'individual' && formData.consultant_id === formData.student_id` | validateForm · l.395 |
| error | «Debe seleccionar una escuela» | `formData.assignment_scope === 'school' && !formData.school_id` | validateForm · l.401 |
| error | «Debe seleccionar una escuela» | `formData.assignment_scope === 'generation' && !formData.school_id` | validateForm · l.407 |
| error | «Debe seleccionar una generación» | `formData.assignment_scope === 'generation' && shouldShowGenerationField() && !formData.generation_id` | validateForm · l.411 |
| error | «Debe seleccionar una escuela» | `formData.assignment_scope === 'community' && !formData.school_id` | validateForm · l.417 |
| error | «Debe seleccionar una generación» | `formData.assignment_scope === 'community' && shouldShowGenerationField() && !formData.generation_id` | validateForm · l.421 |
| error | «Debe seleccionar una comunidad» | `formData.assignment_scope === 'community' && !formData.community_id` | validateForm · l.425 |
| error | «Debe especificar una fecha de finalización» | `formData.has_end_date && !formData.ends_at` | validateForm · l.432 |
| plain | «¿Está seguro de que desea asignar el consultor a TODOS los {affectedCount} usuarios de {entityName} ? Esta acción asignará el consultor a todos los usuarios actuales y futuros de {entityName} . Cancelar Confirmar» | `formData.assignment_scope !== 'individual' && affectedCount > 0` | handleSubmit · l.480 |
| error | «Error de autenticación» | `sessionError \|\| !session?.access_token` | handleSubmit · l.533 |
| error | «{errorMessage}» | `!response.ok` | handleSubmit · l.612 |
| success | «{successMessage}» |  | handleSubmit · l.624 |
| error | «Error: {error.message}» | `error instanceof Error` | handleSubmit · l.644 |
| error | «{error}» | `!(error instanceof Error) && typeof error === 'string'` | handleSubmit · l.646 |
| error | «Error al guardar la asignación» | `!(error instanceof Error) && !(typeof error === 'string')` | handleSubmit · l.648 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch assignment data» | `throw (shown by whoever catches it)` | `!response.ok` | fetchData · l.108 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | ConsultantAssignmentModal · l.655 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `tempSchool` | «Escuela del usuario» | handleInputChange · l.271 |
| `method` | «PUT / POST» | handleSubmit · l.587 |
| `successMessage` | «Asignación creada exitosamente» | handleSubmit · l.617 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | ConsultantAssignmentModal · l.102 |
| «Asignación actualizada exitosamente» | ConsultantAssignmentModal · l.619 |
| «Consultor asignado exitosamente a {affectedCount} usuarios de {entityName}» | ConsultantAssignmentModal · l.621 |
| «Esta asignación se aplicará a TODOS los usuarios de la comunidad seleccionada.» | ConsultantAssignmentModal · l.926 |

**Values shown from data** (1)

- `{fixedUser.first_name} {fixedUser.last_name} ( {fixedUser.email} )` — ConsultantAssignmentModal · l.768, when `!(dataLoading) && fixedUser`

**Other texts on screen** (26)

- «¿Está seguro de que desea asignar el consultor a TODOS los {affectedCount} usuarios de {entityName} ?» — handleSubmit · l.483, when `formData.assignment_scope !== 'individual' && affectedCount > 0`
- «Esta acción asignará el consultor a todos los usuarios actuales y futuros de {entityName} .» — handleSubmit · l.484, when `formData.assignment_scope !== 'individual' && affectedCount > 0`
- «Cargando datos...» — ConsultantAssignmentModal · l.678, when `dataLoading`
- «Consultor *» (label) — ConsultantAssignmentModal · l.684, when `!(dataLoading)`
- «Tipo de Asignación *» (label) — ConsultantAssignmentModal · l.704, when `!(dataLoading)`
- «Individual» (label) — ConsultantAssignmentModal · l.708, when `!(dataLoading)`
- «Comunidad» (label) — ConsultantAssignmentModal · l.719, when `!(dataLoading)`
- «Generación» (label) — ConsultantAssignmentModal · l.730, when `!(dataLoading)`
- «Escuela» (label) — ConsultantAssignmentModal · l.748, when `!(dataLoading)`
- «Usuario Seleccionado» (label) — ConsultantAssignmentModal · l.765, when `!(dataLoading) && fixedUser`
- «La asignación se aplicará según el tipo seleccionado arriba» — ConsultantAssignmentModal · l.772, when `!(dataLoading) && fixedUser`
- «Usuario a Asignar *» (label) — ConsultantAssignmentModal · l.780, when `!(dataLoading) && !fixedUser && formData.assignment_scope === 'individual'`
- «Usuario (Opcional - para asignar a la comunidad de un usuario específico)» (label) — ConsultantAssignmentModal · l.806, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && !fixedUser && formData.assignment_scope === 'community'`
- «Escuela *» (label) — ConsultantAssignmentModal · l.825, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community'))`
- «{schools.find(s => s.id === formData…} / Escuela del usuario» — ConsultantAssignmentModal · l.830, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && formData.assignment_scope === 'community' && formData.student_id && formData.school_id`
- «Generación *» (label) — ConsultantAssignmentModal · l.854, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && ((formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community') && shouldShowGenerationField())`
- «Comunidad de Crecimiento *» (label) — ConsultantAssignmentModal · l.880, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && formData.assignment_scope === 'community'`
- «{communities.find(c => c.id === form…} / Comunidad del usuario» — ConsultantAssignmentModal · l.885, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && formData.assignment_scope === 'community' && formData.student_id && formData.community_id`
- «Advertencia: Asignación Masiva» — ConsultantAssignmentModal · l.921, when `!(dataLoading) && formData.assignment_scope !== 'individual'`
- «[Esta asignación se aplicará a TODOS los usuarios de la escuela seleccionada.] [Esta asignación se aplicará a TODOS los usuarios de la generación seleccionada.] [Esta asignación se aplicará a TODOS los usuarios de la comunidad seleccionada…» — ConsultantAssignmentModal · l.923, when `!(dataLoading) && formData.assignment_scope !== 'individual'`
- «Permisos» (label) — ConsultantAssignmentModal · l.935, when `!(dataLoading)`
- «Puede asignar cursos» (label) — ConsultantAssignmentModal · l.938, when `!(dataLoading)`
- «Duración» (label) — ConsultantAssignmentModal · l.951, when `!(dataLoading)`
- «Establecer fecha de finalización» (label) — ConsultantAssignmentModal · l.954, when `!(dataLoading)`
- «Fecha de finalización» (label) — ConsultantAssignmentModal · l.965, when `!(dataLoading) && formData.has_end_date`
- «La asignación será indefinida hasta que se elimine manualmente.» — ConsultantAssignmentModal · l.986, when `!(dataLoading) && !formData.has_end_date`

### components/PasswordResetModal.tsx

Used by: `/admin/school-users`, `/admin/user-management`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Restablecer Contraseña» | h2 |  | PasswordResetModal · l.92 |
| «Importante» | h3 |  | PasswordResetModal · l.118 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  |  |  | PasswordResetModal · l.96 |
| «Ocultar / Mostrar» | `{() => setShowPassword(!showPassword)}` |  |  |  | PasswordResetModal · l.144 |
| «Generar contraseña segura» | `{generateRandomPassword}` |  |  | `testid=reset-generate-password` | PasswordResetModal · l.152 |
| «Cancelar» | `{onClose}` |  | `{isResetting}` |  | PasswordResetModal · l.196 |
| «Restableciendo... / Restablecer Contraseña» (submits the form) |  |  | `{isResetting}` |  | PasswordResetModal · l.204 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Contraseña Temporal» | {showPassword ? "text" : "password"} | «Ingresa una contraseña temporal» · required · `minLength={PASSWORD_POLICY.minLength}` |  |  | `id=temporaryPassword (id used by code)` | PasswordResetModal · l.134 |
| «Confirmar Contraseña» | {showPassword ? "text" : "password"} | «Confirma la contraseña» · required · `minLength={PASSWORD_POLICY.minLength}` |  |  | `id=confirmPassword (id used by code)` | PasswordResetModal · l.181 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | PasswordResetModal · l.104 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Restablecer Contraseña» | written in this file |  |  | PasswordResetModal · l.84 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Por favor ingresa una contraseña temporal» | `!temporaryPassword.trim()` | handleSubmit · l.50 |
| error | «Las contraseñas no coinciden» | `temporaryPassword !== confirmPassword` | handleSubmit · l.55 |
| error | «{policyError}» | `policyError` | handleSubmit · l.64 |
| success | «Contraseña restablecida correctamente» |  | handleSubmit · l.71 |
| error | «Error al restablecer la contraseña» |  | handleSubmit · l.77 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen \|\| !user` | PasswordResetModal · l.33 |

**Values shown from data** (3)

- `{user.name}` — PasswordResetModal · l.109
- `{user.email}` — PasswordResetModal · l.110
- `✓ / •` — PasswordResetModal · l.169, when `each PASSWORD_RULES`

**Other texts on screen** (4)

- «Usuario:» — PasswordResetModal · l.108
- «El usuario deberá cambiar esta contraseña temporal en su próximo inicio de sesión.» — PasswordResetModal · l.122
- «Contraseña Temporal» (label) — PasswordResetModal · l.130
- «Confirmar Contraseña» (label) — PasswordResetModal · l.178

### components/RoleAssignmentModal.tsx

Used by: `/admin/school-users`, `/admin/user-management`

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Gestión de Roles» | h2 |  | RoleAssignmentModal · l.484 |
| «Roles Actuales» | h3 | `!(loading)` | RoleAssignmentModal · l.507 |
| «Detalles del Rol / Editar Rol / Asignar Nuevo Rol» | h3 | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm)` | RoleAssignmentModal · l.589 |
| «{ROLE_NAMES[selectedRoleForView.role…}» | h4 | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView` | RoleAssignmentModal · l.623 |
| «Confirmar Eliminación» | h3 | `showDeleteConfirm && roleToDelete` | RoleAssignmentModal · l.1005 |

**Buttons** (12)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  |  |  | RoleAssignmentModal · l.489 |
| «[icon Edit]» · tooltip «Editar rol» | `{(e) => { e.stopPropagation(); handleEditRole(role); }}` | `!(loading) && !(userRoles.length === 0) && each userRoles` |  |  | RoleAssignmentModal · l.545 |
| «[icon Trash2]» · tooltip «Remover rol» | `{(e) => { e.stopPropagation(); handleDeleteClick(role); }}` | `!(loading) && !(userRoles.length === 0) && each userRoles` |  |  | RoleAssignmentModal · l.555 |
| «+ Asignar Primer Rol» | `{handleStartNewRole}` | `!(loading) && userRoles.length === 0 && !showNewRoleForm` |  |  | RoleAssignmentModal · l.579 |
| «+ Nuevo Rol» | `{handleStartNewRole}` | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isViewing \|\| isEditing))` |  |  | RoleAssignmentModal · l.608 |
| «Editar» | `{() => handleEditRole(selectedRoleForView)}` | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView` |  |  | RoleAssignmentModal · l.626 |
| «Actualizando... / Actualizar Rol» · tooltip «{filteredAvailableRoles.length === 0 ? 'No hay roles disponibles para asignar co…}» | `{handleUpdateRole}` | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && isEditing` | `{loading \|\| filteredAvailableRoles.length === 0 \|\| (selectedRole === 'lider_comu…}` |  | RoleAssignmentModal · l.921 |
| «Cancelar» | `{handleCancelEdit}` | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && isEditing` | `{loading}` |  | RoleAssignmentModal · l.929 |
| «Asignando... / Asignar Rol» · tooltip «{invalidTitle}» · aria «{noAllowedRoles ? 'Asignar Rol (sin roles disponibles)' : 'Asignar Rol'}» | `{handleAssignRole}` | `!(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && !(isEditing) && showNewRoleForm` | `{loading \|\| isFormInvalid}` |  | RoleAssignmentModal · l.958 |
| «Cerrar» | `{onClose}` |  |  |  | RoleAssignmentModal · l.986 |
| «Eliminando... / Eliminar Rol» | `{handleConfirmDelete}` | `showDeleteConfirm && roleToDelete` | `{loading}` |  | RoleAssignmentModal · l.1024 |
| «Cancelar» | `{handleCancelDelete}` | `showDeleteConfirm && roleToDelete` | `{loading}` |  | RoleAssignmentModal · l.1031 |

**Other things that react to a click** (2)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{ROLE_NAMES[role.role_type]} {getRoleDisplayInfo(role)}» | `{() => handleViewRole(role)}` | `!(loading) && !(userRoles.length === 0) && each userRoles` | RoleAssignmentModal · l.519 |
| `div` | «[icon Edit]» | `{(e) => e.stopPropagation()}` | `!(loading) && !(userRoles.length === 0) && each userRoles` | RoleAssignmentModal · l.544 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Tipo de Rol» | select | disabled: `{filteredAvailableRoles.length === 0}` | «Sin roles disponibles», «(lista) {ROLE_NAMES[roleType]}» | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm))` |  | RoleAssignmentModal · l.682 |
| «Colegio (Opcional)» | select |  | «Sin colegio específico / Seleccionar colegio», «(lista) {school.name}» | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm))` |  | RoleAssignmentModal · l.716 |
|  | select | required | «Seleccionar generación (requerido) / Seleccionar generación», «(lista) {generation.name} ( {generation.grade_range} )» | `((isEditing \|\| showNewRoleForm)) && (['lider_generacion', 'lider_comunidad'].includes(selectedRole)) && !(cannotAssignGenLeader) && !(!schoolHasGenerations && selectedRole === 'lider_comunidad')` |  | RoleAssignmentModal · l.770 |
| «Crear nueva comunidad Se creará automáticamente con el nombre del líder.» | radio | `liderCommunityMode` |  | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && selectedRole === 'lider_comunidad'` |  | RoleAssignmentModal · l.816 |
| «Asignar como líder a una comunidad existente Permite agregar un co-líder o cambiar el líder de una comunidad ya existente sin duplicarla.» | radio | `liderCommunityMode` |  | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && selectedRole === 'lider_comunidad'` |  | RoleAssignmentModal · l.837 |
| «Crear nueva comunidad Se creará automáticamente con el nombre del líder.» | select |  | «Seleccionar comunidad existente», «(lista) {community.name}» | `!(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && selectedRole === 'lider_comunidad' && liderCommunityMode === 'existing'` |  | RoleAssignmentModal · l.855 |
| «Comunidad / Comunidad de Crecimiento (Opcional)» | select |  | «Sin asignar a comunidad específica», «(lista) {community.name}» | `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && !(selectedRole === 'lider_comunidad')` |  | RoleAssignmentModal · l.884 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Gestión de Roles» | written in this file |  |  | RoleAssignmentModal · l.479 |
| «Confirmar Eliminación» | written in this file | `showDeleteConfirm && roleToDelete` |  | RoleAssignmentModal · l.997 |

**Toasts** (21)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar datos de roles» |  | loadData · l.181 |
| error | «Rol no permitido. Selecciona uno de la lista.» | `!filteredAvailableRoles.includes(selectedRole)` | handleAssignRole · l.191 |
| error | «No se puede asignar Líder de Generación en escuelas sin generaciones» | `selectedRole === 'lider_generacion' && selectedSchool && school?.has_generations === false` | handleAssignRole · l.201 |
| error | «La escuela "{school?.name}" utiliza generaciones. Debe seleccionar una generación para crear la comunidad.» | `selectedRole === 'lider_comunidad' && selectedSchool && liderCommunityMode === 'new' && schoolHasGenerations && !selectedGeneration` | handleAssignRole · l.213 |
| error | «Debes seleccionar una comunidad existente.» | `selectedRole === 'lider_comunidad' && liderCommunityMode === 'existing' && !selectedCommunity` | handleAssignRole · l.220 |
| success | «Rol de líder asignado a la comunidad existente» | `result.success && selectedRole === 'lider_comunidad' && liderCommunityMode === 'existing'` | handleAssignRole · l.247 |
| success | «Rol asignado y comunidad creada correctamente» | `result.success && selectedRole === 'lider_comunidad' && !(liderCommunityMode === 'existing')` | handleAssignRole · l.249 |
| success | «Rol asignado correctamente» | `result.success && !(selectedRole === 'lider_comunidad')` | handleAssignRole · l.252 |
| error | «Error al asignar rol» | `!(result.success)` | handleAssignRole · l.281 |
| error | «Error inesperado al asignar rol» |  | handleAssignRole · l.285 |
| success | «Rol removido correctamente» | `result.success` | handleRemoveRole · l.304 |
| error | «Error al remover rol» | `!(result.success)` | handleRemoveRole · l.310 |
| error | «Error inesperado al remover rol» |  | handleRemoveRole · l.314 |
| error | «Rol no permitido. Selecciona uno de la lista.» | `!filteredAvailableRoles.includes(selectedRole)` | handleUpdateRole · l.377 |
| error | «Debes seleccionar una comunidad existente.» | `selectedRole === 'lider_comunidad' && liderCommunityMode === 'existing' && !selectedCommunity` | handleUpdateRole · l.384 |
| error | «Error al actualizar rol» | `!removeResult.success` | handleUpdateRole · l.392 |
| success | «Rol de líder asignado a la comunidad existente» | `assignResult.success && selectedRole === 'lider_comunidad' && liderCommunityMode === 'existing'` | handleUpdateRole · l.418 |
| success | «Rol asignado y comunidad creada correctamente» | `assignResult.success && selectedRole === 'lider_comunidad' && !(liderCommunityMode === 'existing')` | handleUpdateRole · l.420 |
| success | «Rol actualizado correctamente» | `assignResult.success && !(selectedRole === 'lider_comunidad')` | handleUpdateRole · l.423 |
| error | «Error al actualizar rol» | `!(assignResult.success)` | handleUpdateRole · l.437 |
| error | «Error inesperado al actualizar rol» |  | handleUpdateRole · l.441 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error fetching roles» | `throw (shown by whoever catches it)` | `!response.ok` | loadData · l.145 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | RoleAssignmentModal · l.476 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `invalidTitle` | «No hay roles disponibles para asignar con los permisos actuales. / Complete todos los campos requeridos» | RoleAssignmentModal · l.951 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin ámbito específico» | RoleAssignmentModal · l.468 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: permissions_{userId}` | handleAssignRole · l.242 |
| role | `role=alert` | RoleAssignmentModal · l.698 |
| role | `role=radiogroup` | RoleAssignmentModal · l.814 |

**Values shown from data** (9)

- `{userName} ( {userEmail} )` — RoleAssignmentModal · l.485
- `{ROLE_NAMES[role.role_type]}` — RoleAssignmentModal · l.533, when `!(loading) && !(userRoles.length === 0) && each userRoles`
- `{getRoleDisplayInfo(role)}` — RoleAssignmentModal · l.538, when `!(loading) && !(userRoles.length === 0) && each userRoles`
- `{ROLE_DESCRIPTIONS[selectedRoleForVi…}` — RoleAssignmentModal · l.633, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView`
- `{selectedRoleForView.school.name}` — RoleAssignmentModal · l.642, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView && selectedRoleForView.school`
- `{selectedRoleForView.generation.name} ( {selectedRoleForView.generation.grad…} )` — RoleAssignmentModal · l.650, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView && selectedRoleForView.generation`
- `{selectedRoleForView.community.name}` — RoleAssignmentModal · l.660, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView && selectedRoleForView.community`
- `{ROLE_DESCRIPTIONS[selectedRole]}` — RoleAssignmentModal · l.702, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && !(filteredAvailableRoles.length === 0)`
- `{ROLE_NAMES[roleToDelete.role_type]}` — RoleAssignmentModal · l.1012, when `showDeleteConfirm && roleToDelete`

**Other texts on screen** (26)

- «Cargando...» — RoleAssignmentModal · l.501, when `loading`
- «Este usuario no tiene roles asignados» — RoleAssignmentModal · l.514, when `!(loading) && userRoles.length === 0`
- «Este usuario no tiene roles asignados» — RoleAssignmentModal · l.578, when `!(loading) && userRoles.length === 0 && !showNewRoleForm`
- «Colegio:» — RoleAssignmentModal · l.641, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView && selectedRoleForView.school`
- «Generación:» — RoleAssignmentModal · l.649, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView && selectedRoleForView.generation`
- «Comunidad:» — RoleAssignmentModal · l.659, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView && selectedRoleForView.community`
- «Sin ámbito organizacional específico» — RoleAssignmentModal · l.666, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && isViewing && selectedRoleForView && !selectedRoleForView.school && !selectedRoleForView.generation && !selectedRoleForView.community`
- «Tipo de Rol» (label) — RoleAssignmentModal · l.679, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm))`
- «No hay roles disponibles para asignar con los permisos actuales.» — RoleAssignmentModal · l.699, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && filteredAvailableRoles.length === 0`
- «Colegio (Opcional)» (label) — RoleAssignmentModal · l.712, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm))`
- «Los administradores pueden opcionalmente asociarse a un colegio específico» — RoleAssignmentModal · l.733, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && selectedRole === 'admin'`
- «Generación (Requerido) / (No disponible) / (Opcional) [*]» (label) — RoleAssignmentModal · l.750, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && (['lider_generacion', 'lider_comunidad'].includes(selectedRole))`
- «Error:» — RoleAssignmentModal · l.759, when `!(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && (['lider_generacion', 'lider_comunidad'].includes(selectedRole)) && cannotAssignGenLeader`
- «Esta escuela no utiliza generaciones. No se puede asignar el rol de Líder de Generación.» — RoleAssignmentModal · l.759, when `!(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && (['lider_generacion', 'lider_comunidad'].includes(selectedRole)) && cannotAssignGenLeader`
- «Esta escuela no utiliza generaciones. La comunidad se creará directamente bajo la escuela.» — RoleAssignmentModal · l.765, when `((isEditing \|\| showNewRoleForm)) && (['lider_generacion', 'lider_comunidad'].includes(selectedRole)) && !(cannotAssignGenLeader) && !schoolHasGenerations && selectedRole === 'lider_comunidad'`
- «Esta escuela utiliza generaciones. Debe seleccionar una generación para crear la comunidad.» — RoleAssignmentModal · l.791, when `(['lider_generacion', 'lider_comunidad'].includes(selectedRole)) && !(cannotAssignGenLeader) && !(!schoolHasGenerations && selectedRole === 'lider_comunidad') && isRequired && !selectedGeneration`
- «No hay generaciones disponibles para esta escuela.» — RoleAssignmentModal · l.796, when `(['lider_generacion', 'lider_comunidad'].includes(selectedRole)) && !(cannotAssignGenLeader) && !(!schoolHasGenerations && selectedRole === 'lider_comunidad') && schoolGenerations.length === 0 && selectedSchool`
- «Comunidad / Comunidad de Crecimiento (Opcional)» (label) — RoleAssignmentModal · l.809, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm))`
- «Modo de comunidad» (aria-label) — RoleAssignmentModal · l.814, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && selectedRole === 'lider_comunidad'`
- «Crear nueva comunidad Se creará automáticamente con el nombre del líder.» (label) — RoleAssignmentModal · l.815, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && selectedRole === 'lider_comunidad'`
- «Asignar como líder a una comunidad existente Permite agregar un co-líder o cambiar el líder de una comunidad ya existente sin duplicarla.» (label) — RoleAssignmentModal · l.836, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && selectedRole === 'lider_comunidad'`
- «Todos los roles pueden pertenecer a una comunidad de crecimiento para colaboración y reportes» — RoleAssignmentModal · l.911, when `!(loading) && !(userRoles.length === 0 && !showNewRoleForm) && ((isEditing \|\| showNewRoleForm)) && !(selectedRole === 'lider_comunidad')`
- «Esta acción no se puede deshacer» — RoleAssignmentModal · l.1006, when `showDeleteConfirm && roleToDelete`
- «¿Estás seguro de que deseas eliminar el rol» — RoleAssignmentModal · l.1012, when `showDeleteConfirm && roleToDelete`
- «Advertencia:» — RoleAssignmentModal · l.1017, when `showDeleteConfirm && roleToDelete && roleToDelete.role_type === 'admin'`
- «Eliminar un rol de administrador puede limitar el acceso a funciones críticas del sistema.» — RoleAssignmentModal · l.1017, when `showDeleteConfirm && roleToDelete && roleToDelete.role_type === 'admin'`

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select)

### components/admin/BulkUserImportModal.tsx

Used by: `/admin/user-management`

**Titles** (8)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Importar Usuarios en Masa» | h3 |  | BulkUserImportModal · l.323 |
| «Asignación Organizacional» | h4 | `step === 'input'` | BulkUserImportModal · l.373 |
| «Formato de Datos» | h4 | `step === 'input'` | BulkUserImportModal · l.484 |
| «Contraseñas iniciales» | h4 | `step === 'input'` | BulkUserImportModal · l.505 |
| «Vista Previa ( {parsedUsers.length} usuarios válidos)» | h4 | `step === 'preview'` | BulkUserImportModal · l.555 |
| «{invalidUsers.length} usuarios con errores» | h4 | `step === 'preview' && invalidUsers.length > 0` | BulkUserImportModal · l.580 |
| «Resultados de Importación» | h4 | `step === 'results' && importResults` | BulkUserImportModal · l.658 |
| «Aviso de seguridad» | h4 | `step === 'results' && importResults && credentials.length > 0` | BulkUserImportModal · l.697 |

**Buttons** (12)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{handleClose}` |  |  |  | BulkUserImportModal · l.327 |
| «Descargar Ejemplo» | `{downloadSampleCSV}` | `step === 'input'` |  |  | BulkUserImportModal · l.531 |
| «← Volver a editar» | `{() => setStep('input')}` | `step === 'preview'` |  |  | BulkUserImportModal · l.558 |
| «[icon EyeOff]» | `{() => setShowPasswords(!showPasswords)}` | `step === 'results' && importResults && credentials.length > 0` |  | `testid=bulk-toggle-passwords` | BulkUserImportModal · l.663 |
| «Copiar Credenciales» | `{copyCredentials}` | `step === 'results' && importResults && credentials.length > 0` |  | `testid=bulk-copy-credentials` | BulkUserImportModal · l.672 |
| «Descargar CSV» | `{downloadResults}` | `step === 'results' && importResults` |  |  | BulkUserImportModal · l.681 |
| «Cancelar» | `{handleClose}` | `step === 'input'` |  |  | BulkUserImportModal · l.793 |
| «Continuar» | `{handleParse}` | `step === 'input'` | `{!globalSchoolId \|\| loadingOrgData}` |  | BulkUserImportModal · l.799 |
| «Volver» | `{() => setStep('input')}` | `step === 'preview'` |  |  | BulkUserImportModal · l.811 |
| «Importando... / Importar {parsedUsers.length} Usuarios» | `{handleImport}` | `step === 'preview'` | `{isImporting \|\| parsedUsers.length === 0}` |  | BulkUserImportModal · l.817 |
| «Importar Más Usuarios» | `{handleReset}` | `step === 'results'` |  |  | BulkUserImportModal · l.839 |
| «Cerrar» | `{handleClose}` | `step === 'results'` |  |  | BulkUserImportModal · l.845 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Colegio *» | select |  | «Seleccionar colegio (requerido)», «(lista) {school.name}» | `step === 'input' && !(loadingOrgData)` |  | BulkUserImportModal · l.394 |
| «Generación [(recomendado)]» | select | disabled: `{!globalSchoolId \|\| filteredGenerations.length === 0}` | «Seleccione colegio primero / Sin generaciones / Sin asignar», «(lista) {gen.name} ({gen.grade_range})» | `step === 'input' && !(loadingOrgData)` |  | BulkUserImportModal · l.424 |
| «Comunidad» | select | disabled: `{!globalSchoolId}` | «Seleccione colegio primero / Sin asignar», «(lista) {comm.name}» | `step === 'input' && !(loadingOrgData)` |  | BulkUserImportModal · l.458 |
| «email,nombre,apellido,rol usuario1@ejemplo.cl,Juan,Pérez,docente usuario2@ejemplo.cl,María,González,lider_comunidad usuario3@ejemplo.cl,Pedro,Soto,consultor» | textarea | «email,nombre,apellido,rol usuario1@ejemplo.cl,Juan,Pérez,docente usuario2@ejemplo.cl,María,González,lider_comunidad usuario3@ejemplo.cl,Pedro,Soto,consultor» |  | `step === 'input'` |  | BulkUserImportModal · l.540 |

**Table columns** (9)

| Text | Shown when | Where |
|---|---|---|
| «Email» | `step === 'preview'` | BulkUserImportModal · l.604 |
| «Nombre» | `step === 'preview'` | BulkUserImportModal · l.607 |
| «Apellido» | `step === 'preview'` | BulkUserImportModal · l.610 |
| «Rol» | `step === 'preview'` | BulkUserImportModal · l.613 |
| «Colegio» | `step === 'preview'` | BulkUserImportModal · l.616 |
| «Estado» | `step === 'results' && importResults` | BulkUserImportModal · l.743 |
| «Email» | `step === 'results' && importResults` | BulkUserImportModal · l.746 |
| «Contraseña» | `step === 'results' && importResults` | BulkUserImportModal · l.749 |
| «Error» | `step === 'results' && importResults` | BulkUserImportModal · l.752 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Importar Usuarios en Masa» | written in this file |  |  | BulkUserImportModal · l.317 |

**Toasts** (12)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar datos organizacionales» |  | loadOrganizationalData · l.90 |
| error | «Debe seleccionar un colegio antes de continuar» | `!globalSchoolId` | handleParse · l.131 |
| error | «Por favor ingrese datos para importar» | `!csvText.trim()` | handleParse · l.136 |
| error | «No se encontraron datos válidos para procesar» | `result.valid.length === 0 && result.invalid.length === 0` | handleParse · l.150 |
| plain | «{result.invalid.length} usuarios con errores no serán importados» | `result.invalid.length > 0` | handleParse · l.158 |
| error | «No hay usuarios válidos para importar» | `parsedUsers.length === 0` | handleImport · l.172 |
| plain | «La importación se registró, pero no se pudo escribir la auditoría.» | `data.audited === false` | handleImport · l.214 |
| success | «{succeeded} usuarios importados correctamente» | `failed === 0` | handleImport · l.224 |
| plain | «{succeeded} usuarios importados, {failed} fallaron» | `!(failed === 0)` | handleImport · l.226 |
| error | «Error al importar usuarios» |  | handleImport · l.237 |
| error | «No hay credenciales para copiar» | `credentials.length === 0` | copyCredentials · l.304 |
| success | «Credenciales copiadas al portapapeles» |  | copyCredentials · l.313 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al importar usuarios» | `throw (shown by whoever catches it)` | `!response.ok` | handleImport · l.203 |

**Downloads and printing** (4)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` |  | downloadSampleCSV · l.272 |
| `archivo: usuarios_ejemplo.csv` |  | downloadSampleCSV · l.275 |
| `URL.createObjectURL()` |  | downloadResults · l.294 |
| `archivo: resultados_importacion.csv` |  | downloadResults · l.297 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | BulkUserImportModal · l.126 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Bearer {session?.access_token}» | BulkUserImportModal · l.185 |
| «email,nombre,apellido,rol usuario1@ejemplo.cl,Juan,Pérez,docente usuario2@ejemplo.cl,María,González,lider_comunidad usuario3@ejemplo.cl,Pedro,Soto,consultor» | BulkUserImportModal · l.543 |

**Values shown from data** (9)

- `{user.email}` — BulkUserImportModal · l.624, when `step === 'preview' && each parsedUsers.slice(0, 10)`
- `{user.firstName} / -` — BulkUserImportModal · l.625, when `step === 'preview' && each parsedUsers.slice(0, 10)`
- `{user.lastName} / -` — BulkUserImportModal · l.626, when `step === 'preview' && each parsedUsers.slice(0, 10)`
- `{selectedSchoolName} / -` — BulkUserImportModal · l.638, when `step === 'preview' && each parsedUsers.slice(0, 10)`
- `{importResults.filter(r => r.success…}` — BulkUserImportModal · l.719, when `step === 'results' && importResults`
- `{importResults.filter(r => !r.succes…}` — BulkUserImportModal · l.730, when `step === 'results' && importResults`
- `{result.email}` — BulkUserImportModal · l.767, when `step === 'results' && importResults && each importResults`
- `{(() => { const issued = credentials…}` — BulkUserImportModal · l.768, when `step === 'results' && importResults && each importResults`
- `{result.error} / -` — BulkUserImportModal · l.777, when `step === 'results' && importResults && each importResults`

**Other texts on screen** (41)

- «Datos» — BulkUserImportModal · l.344, screen size: `hidden sm:inline`
- «Vista Previa» — BulkUserImportModal · l.353, screen size: `hidden sm:inline`
- «Resultados» — BulkUserImportModal · l.362, screen size: `hidden sm:inline`
- «Todos los usuarios importados serán asignados a la organización seleccionada. Para usuarios con rol» — BulkUserImportModal · l.378, when `step === 'input'`
- «lider_comunidad» — BulkUserImportModal · l.379, when `step === 'input'`
- «, se creará una comunidad automáticamente.» — BulkUserImportModal · l.379, when `step === 'input'`
- «Cargando datos...» — BulkUserImportModal · l.385, when `step === 'input' && loadingOrgData`
- «Colegio *» (label) — BulkUserImportModal · l.391, when `step === 'input' && !(loadingOrgData)`
- «Debe seleccionar un colegio» — BulkUserImportModal · l.413, when `step === 'input' && !(loadingOrgData) && !globalSchoolId`
- «Generación [(recomendado)]» (label) — BulkUserImportModal · l.420, when `step === 'input' && !(loadingOrgData)`
- «Este colegio usa generaciones. Requerido para rol lider_comunidad.» — BulkUserImportModal · l.448, when `step === 'input' && !(loadingOrgData) && selectedSchoolHasGenerations && !globalGenerationId && globalSchoolId`
- «Comunidad» (label) — BulkUserImportModal · l.455, when `step === 'input' && !(loadingOrgData)`
- «Para rol lider_comunidad se creará automáticamente.» — BulkUserImportModal · l.472, when `step === 'input' && !(loadingOrgData)`
- «Pegue los datos en formato CSV o copie desde Excel. Columnas:» — BulkUserImportModal · l.486, when `step === 'input'`
- «email, nombre, apellido, rol» — BulkUserImportModal · l.487, when `step === 'input'`
- «Roles válidos: admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, community_manager, docente» — BulkUserImportModal · l.490, when `step === 'input'`
- «Cada usuario recibe una» — BulkUserImportModal · l.511, when `step === 'input'`
- «contraseña única» — BulkUserImportModal · l.511, when `step === 'input'`
- «, generada de forma segura. No se comparte una misma contraseña entre personas.» — BulkUserImportModal · l.511, when `step === 'input'`
- «Todos deberán» — BulkUserImportModal · l.515, when `step === 'input'`
- «cambiarla en su primer inicio de sesión» — BulkUserImportModal · l.515, when `step === 'input'`
- «; hasta entonces no podrán usar la plataforma.» — BulkUserImportModal · l.515, when `step === 'input'`
- «Las contraseñas se muestran» — BulkUserImportModal · l.519, when `step === 'input'`
- «una sola vez» — BulkUserImportModal · l.519, when `step === 'input'`
- «, al terminar la importación. Cópialas antes de cerrar esta ventana y entrégalas por un medio seguro.» — BulkUserImportModal · l.519, when `step === 'input'`
- «Si tu archivo incluye una columna» — BulkUserImportModal · l.524, when `step === 'input'`
- «password» — BulkUserImportModal · l.524, when `step === 'input'`
- «, esa contraseña se usará y debe cumplir la política de seguridad.» — BulkUserImportModal · l.524, when `step === 'input'`
- «Asignación:» — BulkUserImportModal · l.569, when `step === 'preview'`
- «> {generations.find(g => g.id …}» — BulkUserImportModal · l.570, when `step === 'preview'`
- «> {communities.find(c => c.id …}» — BulkUserImportModal · l.571, when `step === 'preview'`
- «Fila {user.rowNumber} : {user.email} / Sin email - {user.errors?.join(', ')}» — BulkUserImportModal · l.585, when `step === 'preview' && invalidUsers.length > 0 && each invalidUsers.slice(0, 3)`
- «... y {invalidUsers.length - 3} más» — BulkUserImportModal · l.590, when `step === 'preview' && invalidUsers.length > 0 && invalidUsers.length > 3`
- «{user.role} [(auto-comunidad)]» — BulkUserImportModal · l.628, when `step === 'preview' && each parsedUsers.slice(0, 10)`
- «... y {parsedUsers.length - 10} usuarios más» — BulkUserImportModal · l.647, when `step === 'preview' && parsedUsers.length > 10`
- «Estas contraseñas se muestran» — BulkUserImportModal · l.699, when `step === 'results' && importResults && credentials.length > 0`
- «una sola vez» — BulkUserImportModal · l.699, when `step === 'results' && importResults && credentials.length > 0`
- «y no quedan guardadas en ninguna parte. Cópialas ahora y entrégalas por un medio seguro; al cerrar esta ventana no será posible recuperarlas.» — BulkUserImportModal · l.699, when `step === 'results' && importResults && credentials.length > 0`
- «Si se pierden, restablece la contraseña de la persona desde la lista de usuarios.» — BulkUserImportModal · l.704, when `step === 'results' && importResults && credentials.length > 0`
- «Exitosos» — BulkUserImportModal · l.718, when `step === 'results' && importResults`
- «Fallidos» — BulkUserImportModal · l.729, when `step === 'results' && importResults`

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select)

### components/admin/TractorSignupCard.tsx

Used by: `/admin/tractor-signups`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Gestionar» | `{() => onManage(row)}` |  | `{busy}` |  | TractorSignupCard · l.151 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Settings2` | aria-hidden: true |  |  | TractorSignupCard · l.157 |

**Values shown from data** (8)

- `{SIGNUP_SOURCE_LABELS[source]}` — SourceBadge · l.50
- `{children}` — RoleBadge · l.58
- `{TRACTOR_STATUS_LABELS[status]}` — StatusBadge · l.71
- `{row.full_name} / —` — TractorSignupCard · l.116
- `{row.email}` — TractorSignupCard · l.117
- `{row.school_name}` — TractorSignupCard · l.131
- `{row.generation_name} / —` — TractorSignupCard · l.135
- `{row.role_label}` — TractorSignupCard · l.140

**Other texts on screen** (8)

- «No» — ExistingUserBadge · l.83, when `!row.is_existing_user`
- «Sí» — ExistingUserBadge · l.91
- «{roles} / Sin roles activos» — ExistingUserBadge · l.93
- «Origen» — TractorSignupCard · l.124
- «Colegio» — TractorSignupCard · l.130
- «Generación» — TractorSignupCard · l.134
- «Rol» — TractorSignupCard · l.138
- «¿Ya es usuario?» — TractorSignupCard · l.144

### components/admin/UnifiedUserManagement.tsx

Used by: `/admin/school-users`, `/admin/user-management`

**Titles** (10)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Gestión de Usuarios» | h1 |  | UnifiedUserManagement · l.249 |
| «No se encontraron usuarios» | h3 | `users.length === 0` | UnifiedUserManagement · l.441 |
| «{getUserName(user)}» | h3 | `!(users.length === 0) && each users` | UnifiedUserManagement · l.483 |
| «Detalles del Usuario» | h4 | `!(users.length === 0) && each users && expandedUserId === user.id` | UnifiedUserManagement · l.536 |
| «Acciones» | h4 | `!(users.length === 0) && each users && expandedUserId === user.id` | UnifiedUserManagement · l.573 |
| «Asignaciones» | h4 | `!(users.length === 0) && each users && expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …)` | UnifiedUserManagement · l.705 |
| «Como Consultor:» | h5 | `each users && expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.consultant_assignments && user.consultant_assignments.length > 0` | UnifiedUserManagement · l.709 |
| «Como Estudiante:» | h5 | `each users && expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.student_assignments && user.student_assignments.length > 0` | UnifiedUserManagement · l.728 |
| «Cursos Asignados ( {user.course_assignments.length} ):» | h5 | `each users && expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.course_assignments && user.course_assignments.length > 0` | UnifiedUserManagement · l.741 |
| «Rutas de Aprendizaje Asignadas ( {user.learning_path_assignments.leng…} ):» | h5 | `each users && expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.learning_path_assignments && user.learning_path_assignments.length > 0` | UnifiedUserManagement · l.754 |

**Buttons** (15)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Importar Usuarios» | `{onBulkImport}` | `!hideBulkImport` |  |  | UnifiedUserManagement · l.256 |
| «Nuevo Usuario» | `{onAddUser}` |  |  |  | UnifiedUserManagement · l.264 |
| «Pendientes {stats.pending}» | `{() => onStatusChange('pending')}` |  |  |  | UnifiedUserManagement · l.276 |
| «Aprobados {stats.approved}» | `{() => onStatusChange('approved')}` |  |  |  | UnifiedUserManagement · l.295 |
| «Total {stats.total}» | `{() => onStatusChange('all')}` |  |  |  | UnifiedUserManagement · l.314 |
| «Buscar» (submits the form) |  |  | `{isLoading}` |  | UnifiedUserManagement · l.357 |
| «Limpiar» | `{onClearSearch}` | `searchQuery && onClearSearch` |  |  | UnifiedUserManagement · l.370 |
| «Aprobar Usuario» | `{(e) => { e.stopPropagation(); onApprove(user.id); }}` | `each users && expandedUserId === user.id && user.approval_status === 'pending' && !hideApprove` |  |  | UnifiedUserManagement · l.578 |
| «Rechazar Usuario» | `{(e) => { e.stopPropagation(); onReject(user.id); }}` | `each users && expandedUserId === user.id && user.approval_status === 'pending' && !hideReject` |  |  | UnifiedUserManagement · l.590 |
| «Deshabilitar / Habilitar» | `{(e) => { e.stopPropagation(); onExpenseAccessToggle(user, !expenseEnabled); }}` | `expandedUserId === user.id && user.approval_status === 'approved' && !hideExpenseAccess && !(isAdminRole)` | `{isUpdatingExpense}` |  | UnifiedUserManagement · l.616 |
| «Editar Usuario» | `{(e) => { e.stopPropagation(); onEditUser(user); }}` | `!(users.length === 0) && each users && expandedUserId === user.id && user.approval_status === 'approved'` |  |  | UnifiedUserManagement · l.637 |
| «Gestionar Roles» | `{(e) => { e.stopPropagation(); onRoleChange(user); }}` | `!(users.length === 0) && each users && expandedUserId === user.id && user.approval_status === 'approved'` |  |  | UnifiedUserManagement · l.648 |
| «Asignar Estudiantes» | `{(e) => { e.stopPropagation(); onAssign(user); }}` | `each users && expandedUserId === user.id && user.approval_status === 'approved' && getUserPrimaryRole(user) === 'consultor' && !hideAssign` |  |  | UnifiedUserManagement · l.660 |
| «Restablecer Contraseña» | `{(e) => { e.stopPropagation(); onPasswordReset(user); }}` | `!(users.length === 0) && each users && expandedUserId === user.id && user.approval_status === 'approved'` |  |  | UnifiedUserManagement · l.672 |
| «Eliminar Usuario» | `{(e) => { e.stopPropagation(); setDeleteConfirm({ isOpen: true, user }); }}` | `!(users.length === 0) && each users && expandedUserId === user.id` |  |  | UnifiedUserManagement · l.685 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{getUserName(user).split(' ').filter…} / ? {getUserName(user)} {getRoleDisplayName(user)} [QA] [{getAssignmentCount(use…» | `{() => toggleExpanded(user.id)}` | `!(users.length === 0) && each users` | UnifiedUserManagement · l.456 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar por nombre, email o escuela...» | text | «Buscar por nombre, email o escuela...» |  |  |  | UnifiedUserManagement · l.348 |
| «Filtrar por Colegio» | select | disabled: `{lockedSchoolId != null}` | «Todos los colegios», «(lista) {school.name}» | `schools.length > 0` | `id=school-filter (id used by code)` | UnifiedUserManagement · l.390 |
| «Filtrar por Comunidad» | select |  | «Todas las comunidades», «(lista) {community.name}» | `!hideCommunityFilter && uniqueCommunities.length > 0` | `id=community-filter (id used by code)` | UnifiedUserManagement · l.418 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => { e.preventDefault(); onSearchSubmit(); }}` |  | UnifiedUserManagement · l.337 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmModal` | component | `{deleteConfirm.isOpen}` | title: Eliminar Usuario · message: ¿Estás seguro de que deseas eliminar a {deleteConfirm.user ? getUse…}? · confirmText: Eliminar · cancelText: Cancelar | UnifiedUserManagement · l.778 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «{TOAST_MESSAGES.CRUD.DELETE_SUCCESS('Usuario')}» | `deleteConfirm.user` | UnifiedUserManagement · l.784 |

**Access checks in the code** (5)

| Line of code | Where |
|---|---|
| `highestRole = getHighestRole(user.user_roles \|\| [])` | resolvePrimaryRole · l.90 |
| `primaryRole = getUserPrimaryRole(user)` | UnifiedUserManagement · l.448 |
| `getUserPrimaryRole(user) \|\| ''` | UnifiedUserManagement · l.486 |
| `getUserPrimaryRole(user) === 'consultor'` | UnifiedUserManagement · l.560 |
| `getUserPrimaryRole(user) === 'consultor'` | UnifiedUserManagement · l.659 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `getUserName()` | «Sin nombre» | getUserName · l.148 |
| `getRoleDisplayName()` | «Sin rol» | getRoleDisplayName · l.169 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Sin nombre» | UnifiedUserManagement · l.148 |
| «Sin escuela» | UnifiedUserManagement · l.161 |
| «Sin rol» | UnifiedUserManagement · l.169 |

**Values shown from data** (4)

- `{getUserName(user).split(' ').filter…} / ?` — UnifiedUserManagement · l.474, when `!(users.length === 0) && each users`
- `{getRoleDisplayName(user)}` — UnifiedUserManagement · l.486, when `!(users.length === 0) && each users`
- `{getExternalSchoolLabel(user.externa…}` — UnifiedUserManagement · l.563, when `!(users.length === 0) && each users && expandedUserId === user.id && getUserPrimaryRole(user) === 'consultor' && user.external_school_affiliation`
- `( {assignment.path.description} )` — UnifiedUserManagement · l.760, when `((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.learning_path_assignments && user.learning_path_assignments.length > 0 && each user.learning_path_assignments && assignment.path?.description`

**Other texts on screen** (21)

- «Administra los usuarios y permisos del sistema» — UnifiedUserManagement · l.251
- «Filtrar por Colegio» (label) — UnifiedUserManagement · l.387, when `schools.length > 0`
- «Filtrar por Comunidad» (label) — UnifiedUserManagement · l.415, when `!hideCommunityFilter && uniqueCommunities.length > 0`
- «Intenta con otros términos de búsqueda / No hay usuarios en esta categoría» — UnifiedUserManagement · l.442, when `users.length === 0`
- «Puede ejecutar pruebas QA» (title) — UnifiedUserManagement · l.490, when `!(users.length === 0) && each users && user.can_run_qa_tests`
- «QA» — UnifiedUserManagement · l.492, when `!(users.length === 0) && each users && user.can_run_qa_tests`
- «{getAssignmentCount(user)} asignaciones» — UnifiedUserManagement · l.496, when `!(users.length === 0) && each users && getAssignmentCount(user) > 0`
- «Pendiente / Aprobado / Rechazado» — UnifiedUserManagement · l.517, when `!(users.length === 0) && each users`
- «Fecha de registro» — UnifiedUserManagement · l.539, when `!(users.length === 0) && each users && expandedUserId === user.id`
- «{new Date(user.created_at).toLocaleD…} / No disponible» — UnifiedUserManagement · l.540, when `!(users.length === 0) && each users && expandedUserId === user.id`
- «Roles asignados» — UnifiedUserManagement · l.546, when `!(users.length === 0) && each users && expandedUserId === user.id && user.user_roles && user.user_roles.length > 0`
- «- {role.school.name}» — UnifiedUserManagement · l.551, when `each users && expandedUserId === user.id && user.user_roles && user.user_roles.length > 0 && each user.user_roles`
- «- Red: {role.network.name}» — UnifiedUserManagement · l.553, when `expandedUserId === user.id && user.user_roles && user.user_roles.length > 0 && each user.user_roles && role.role_type === 'supervisor_de_red' && role.network?.name`
- «Escuela externa» — UnifiedUserManagement · l.562, when `!(users.length === 0) && each users && expandedUserId === user.id && getUserPrimaryRole(user) === 'consultor' && user.external_school_affiliation`
- «Reportes de gastos» — UnifiedUserManagement · l.608, when `each users && expandedUserId === user.id && user.approval_status === 'approved' && !hideExpenseAccess`
- «Admin - acceso total» — UnifiedUserManagement · l.610, when `expandedUserId === user.id && user.approval_status === 'approved' && !hideExpenseAccess && isAdminRole`
- «Habilitado / Bloqueado» — UnifiedUserManagement · l.613, when `expandedUserId === user.id && user.approval_status === 'approved' && !hideExpenseAccess && !(isAdminRole)`
- «• {assignment.student?.first_name} {assignment.student?.last_name} - Monitoreo / Mentoría / Evaluación / Apoyo / Completa / {assignment.assignment_type}» — UnifiedUserManagement · l.712, when `expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.consultant_assignments && user.consultant_assignments.length > 0 && each user.consultant_assignments`
- «• Consultor: {assignment.consultant?.first_name} {assignment.consultant?.last_name}» — UnifiedUserManagement · l.731, when `expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.student_assignments && user.student_assignments.length > 0 && each user.student_assignments`
- «• {assignment.course?.title} / Curso sin título» — UnifiedUserManagement · l.744, when `expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.course_assignments && user.course_assignments.length > 0 && each user.course_assignments`
- «Ruta sin título» — UnifiedUserManagement · l.758, when `expandedUserId === user.id && ((user.consultant_assignments && user.consultant_assignments.length > 0) \|\| (user.student_assignments && user.student_assignments.length > 0) \|\| (user.course_assignments …) && user.learning_path_assignments && user.learning_path_assignments.length > 0 && each user.learning_path_assignments`

### components/admin/UserEditModal.tsx

Used by: `/admin/school-users`, `/admin/user-management`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Usuario» | h2 |  | UserEditModal · l.148 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  |  |  | UserEditModal · l.149 |
|  | `{() => handleQATesterToggle(!formData.can_run_qa_tests)}` | `!hideQaTesterToggle` | `{updatingQATester}` |  | UserEditModal · l.273 |
| «Guardando... / Guardar Cambios» (submits the form) |  |  | `{loading}` |  | UserEditModal · l.297 |
| «Cancelar» | `{onClose}` |  | `{loading}` |  | UserEditModal · l.314 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Correo Electrónico» | email | required |  |  | `id=email (id used by code)` | UserEditModal · l.175 |
| «Nombre» | text |  |  |  | `id=first_name (id used by code)` | UserEditModal · l.190 |
| «Apellido» | text |  |  |  | `id=last_name (id used by code)` | UserEditModal · l.204 |
| «Escuela/Organización» | text | «Opcional» · disabled: `{disableSchoolEdit}` |  |  | `id=school (id used by code)` | UserEditModal · l.218 |
| «Escuela Externa (Afiliación)» | select |  | «Sin afiliación externa», «(lista) {school.label}» | `isConsultant` | `id=external_school (id used by code)` | UserEditModal · l.236 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | UserEditModal · l.169 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Usuario» | written in this file |  |  | UserEditModal · l.145 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Usuario actualizado exitosamente» |  | handleSubmit · l.95 |
| error | «Error al actualizar usuario» |  | handleSubmit · l.100 |
| success | «Usuario habilitado como tester QA / Usuario deshabilitado como tester QA» |  | handleQATesterToggle · l.135 |
| error | «Error al actualizar estado de tester QA» |  | handleQATesterToggle · l.138 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «No hay sesión activa» | `throw (shown by whoever catches it)` | `!session` | handleSubmit · l.68 |
| «Error al actualizar usuario» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmit · l.92 |
| «No hay sesión activa» | `throw (shown by whoever catches it)` | `!session` | handleQATesterToggle · l.113 |
| «Error al actualizar estado de tester QA» | `throw (shown by whoever catches it)` | `!response.ok` | handleQATesterToggle · l.131 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen \|\| !user` | UserEditModal · l.58 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | UserEditModal · l.76 |

**Other texts on screen** (11)

- «Atención:» — UserEditModal · l.162, when `formData.email !== originalEmail`
- «Cambiar el email actualizará las credenciales de acceso del usuario.» — UserEditModal · l.163, when `formData.email !== originalEmail`
- «Correo Electrónico» (label) — UserEditModal · l.171
- «Nombre» (label) — UserEditModal · l.186
- «Apellido» (label) — UserEditModal · l.200
- «Escuela/Organización» (label) — UserEditModal · l.214
- «Escuela Externa (Afiliación)» (label) — UserEditModal · l.232, when `isConsultant`
- «Escuela donde trabaja fuera de FNE (solo informativo)» — UserEditModal · l.253, when `isConsultant`
- «Tester QA» (label) — UserEditModal · l.265, when `!hideQaTesterToggle`
- «Puede acceder a /qa y ejecutar pruebas» — UserEditModal · l.269, when `!hideQaTesterToggle`
- «✓ Este usuario puede ejecutar pruebas QA» — UserEditModal · l.290, when `!hideQaTesterToggle && formData.can_run_qa_tests`

### components/common/ConfirmModal.tsx

Used by: `/admin/school-users`, `/admin/user-management`

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

### components/layout/FunctionalPageHeader.tsx

Used by: `/admin/network-management`, `/admin/tractor-signups`, `/profile`

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

### components/profile/PasswordChangeSection.tsx

Used by: `/profile`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Seguridad» | h3 |  | PasswordChangeSection · l.132 |
| «¡Contraseña actualizada!» | h4 | `isExpanded && successMessage` | PasswordChangeSection · l.158 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Seguridad Cambiar tu contraseña de acceso Contraer / Expandir» | `{() => setIsExpanded(!isExpanded)}` |  |  |  | PasswordChangeSection · l.122 |
| «Cerrar» | `{() => { setSuccessMessage(false); setIsExpanded(false); }}` | `isExpanded && successMessage` |  |  | PasswordChangeSection · l.164 |
| «[icon EyeOffIcon]» | `{() => setShowCurrentPassword(!showCurrentPassword)}` | `isExpanded && !(successMessage)` |  |  | PasswordChangeSection · l.193 |
| «[icon EyeOffIcon]» | `{() => setShowNewPassword(!showNewPassword)}` | `isExpanded && !(successMessage)` |  |  | PasswordChangeSection · l.223 |
| «[icon EyeOffIcon]» | `{() => setShowConfirmPassword(!showConfirmPassword)}` | `isExpanded && !(successMessage)` |  |  | PasswordChangeSection · l.253 |
| «Cancelar» | `{handleCancel}` | `isExpanded && !(successMessage)` | `{isSubmitting}` |  | PasswordChangeSection · l.313 |
| «Actualizando... / Actualizar Contraseña» | `{handleSubmit}` | `isExpanded && !(successMessage)` | `{isSubmitting \|\| !allRequirementsMet \|\| !currentPassword}` |  | PasswordChangeSection · l.321 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Contraseña actual *» | {showCurrentPassword ? 'text' : 'password'} | «Ingresa tu contraseña actual» · disabled: `{isSubmitting}` |  | `isExpanded && !(successMessage)` | `id=current-password (id used by code)` | PasswordChangeSection · l.183 |
| «Nueva contraseña *» | {showNewPassword ? 'text' : 'password'} | «Ingresa tu nueva contraseña» · disabled: `{isSubmitting}` |  | `isExpanded && !(successMessage)` | `id=new-password (id used by code)` | PasswordChangeSection · l.213 |
| «Confirmar nueva contraseña *» | {showConfirmPassword ? 'text' : 'password'} | «Confirma tu nueva contraseña» · disabled: `{isSubmitting}` |  | `isExpanded && !(successMessage)` | `id=confirm-password (id used by code)` | PasswordChangeSection · l.243 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Contraseña actualizada exitosamente» | `savedSuccess === 'true'` | PasswordChangeSection · l.33 |
| error | «Por favor cumple todos los requisitos de la contraseña» | `!allRequirementsMet` | handleSubmit · l.65 |
| success | «Contraseña actualizada exitosamente» |  | handleSubmit · l.105 |
| error | «Error al actualizar la contraseña» |  | handleSubmit · l.108 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cambiar la contraseña» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmit · l.86 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: {PASSWORD_SUCCESS_KEY}` | PasswordChangeSection · l.26 |

**Other texts on screen** (11)

- «Tu contraseña ha sido cambiada exitosamente.» — PasswordChangeSection · l.162, when `isExpanded && successMessage`
- «Contraseña actual *» (label) — PasswordChangeSection · l.179, when `isExpanded && !(successMessage)`
- «Nueva contraseña *» (label) — PasswordChangeSection · l.209, when `isExpanded && !(successMessage)`
- «Confirmar nueva contraseña *» (label) — PasswordChangeSection · l.239, when `isExpanded && !(successMessage)`
- «Las contraseñas no coinciden» — PasswordChangeSection · l.266, when `isExpanded && !(successMessage) && confirmPassword && !passwordsMatch`
- «Requisitos de la contraseña:» — PasswordChangeSection · l.273, when `isExpanded && !(successMessage)`
- «Al menos 8 caracteres» — PasswordChangeSection · l.282, when `isExpanded && !(successMessage)`
- «Al menos una letra mayúscula» — PasswordChangeSection · l.290, when `isExpanded && !(successMessage)`
- «Al menos una letra minúscula» — PasswordChangeSection · l.298, when `isExpanded && !(successMessage)`
- «Al menos un número» — PasswordChangeSection · l.306, when `isExpanded && !(successMessage)`
- «@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } .animate-fadeIn { animation: fadeIn 0.2s ease-out; }» — PasswordChangeSection · l.333, when `isExpanded`

### components/reports/EnhancedTable.tsx

Used by: `/admin/tractor-signups`

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Anterior» | `{() => goToPage(currentPage - 1)}` | `totalPages > 1` · screen size: `sm:hidden` | `{currentPage === 1}` |  | EnhancedTable · l.213 |
| «Siguiente» | `{() => goToPage(currentPage + 1)}` | `totalPages > 1` · screen size: `sm:hidden` | `{currentPage === totalPages}` |  | EnhancedTable · l.220 |
|  | `{() => goToPage(currentPage - 1)}` | `totalPages > 1` · screen size: `hidden sm:flex` | `{currentPage === 1}` |  | EnhancedTable · l.241 |
| «{page}» | `{() => goToPage(page)}` | `totalPages > 1` · screen size: `hidden sm:flex` |  |  | EnhancedTable · l.265 |
|  | `{() => goToPage(currentPage + 1)}` | `totalPages > 1` · screen size: `hidden sm:flex` | `{currentPage === totalPages}` |  | EnhancedTable · l.279 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `tr` | «{column.render(getNestedValue(row, c…} / {String(getNestedValue(row, column.k…}» | `{() => onRowClick?.(row)}` | `paginatedData.length > 0 && each paginatedData` | EnhancedTable · l.181 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{searchPlaceholder}» | text | «{searchPlaceholder}» |  | `searchable` |  | EnhancedTable · l.141 |

**Table columns** (1)

| Text | Shown when | Where |
|---|---|---|
| «{column.label} [{getSortIcon(column.key)}]» | `each columns` | EnhancedTable · l.163 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Buscar...» | EnhancedTable · l.25 |

**Values shown from data** (4)

- `{column.render(getNestedValue(row, c…} / {String(getNestedValue(row, column.k…}` — EnhancedTable · l.189, when `paginatedData.length > 0 && each paginatedData && each columns`
- `{(currentPage - 1) * pageSize + 1}` — EnhancedTable · l.232, when `totalPages > 1`, screen size: `hidden sm:flex`
- `{Math.min(currentPage * pageSize, so…}` — EnhancedTable · l.233, when `totalPages > 1`, screen size: `hidden sm:flex`
- `{sortedData.length}` — EnhancedTable · l.236, when `totalPages > 1`, screen size: `hidden sm:flex`

**Other texts on screen** (6)

- «Mostrando {sortedData.length} de {data.length} registros» — EnhancedTable · l.150, when `searchable && searchTerm`
- «No se encontraron resultados / No hay datos disponibles» — EnhancedTable · l.199, when `!(paginatedData.length > 0)`
- «Mostrando» — EnhancedTable · l.231, when `totalPages > 1`, screen size: `hidden sm:flex`
- «a» — EnhancedTable · l.232, when `totalPages > 1`, screen size: `hidden sm:flex`
- «de» — EnhancedTable · l.236, when `totalPages > 1`, screen size: `hidden sm:flex`
- «resultados» — EnhancedTable · l.236, when `totalPages > 1`, screen size: `hidden sm:flex`

### components/ui/dialog.tsx

Used by: `/admin/tractor-signups`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### constants/externalSchools.ts

Used by: `/admin/school-users`, `/admin/user-management`, `/profile`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `EXTERNAL_SCHOOLS` | «Escola Virolai», «Escola Sadako», «Institut Angeleta Ferrer», «Institut Escola Les Vinyes», «Escola La Maquinista», «Institut Escola El Puig», «Escola Octavio Paz» | l.7 |

### constants/toastMessages.ts

Used by: `/admin/school-users`, `/admin/user-management`, `/profile`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TOAST_MESSAGES` | «Cambios guardados exitosamente», «Error al guardar los cambios», «Guardando cambios...», «Sesión iniciada correctamente», «Sesión cerrada correctamente», «Contraseña actualizada exitosamente», «Se ha enviado un enlace de recuperación a tu correo», «Tu sesión ha expirado. Por favor, inicia sesión nuevamente», «Error al iniciar sesión. Verifica tus credenciales», «Error al cerrar sesión», «Error al actualizar la contraseña», «Error de autenticación», «No tienes permisos para realizar esta acción», «Archivo eliminado exitosamente», «Error al eliminar el archivo», «Tipo de archivo no permitido», «Subiendo archivo...», «Procesando archivo...», «Por favor completa todos los campos requeridos», «Correo electrónico inválido», «Número de teléfono inválido», «Fecha inválida», «Las contraseñas no coinciden», «La contraseña debe tener al menos 8 caracteres», «Formato inválido», «Error de conexión. Verifica tu conexión a internet», «Error del servidor. Por favor, intenta más tarde», «La operación tardó demasiado. Por favor, intenta nuevamente», «Error inesperado. Por favor, intenta nuevamente», «Rol actualizado exitosamente», «Perfil actualizado correctamente», «Foto de perfil actualizada», «Contraseña restablecida exitosamente», «Error al aprobar el usuario», «Error al actualizar el rol», «Error al actualizar el perfil», «Inscripción exitosa», «Curso completado», «Progreso guardado», «Lección completada», «Error al inscribirse en el curso», «Error al guardar el progreso», «Tarea enviada exitosamente», «Tarea calificada», «Retroalimentación enviada», «Error al enviar la tarea», «Error al calificar la tarea», «Grupo creado exitosamente», «Te has unido al grupo», «Has salido del grupo», «Miembro agregado al grupo», «Miembro eliminado del grupo», «Error al unirse al grupo», «Error al salir del grupo», «Publicación creada exitosamente», «Publicación eliminada», «Comentario agregado», «Me gusta agregado», «Guardado exitosamente», «Error al crear la publicación», «Error al agregar el comentario», «Notificación enviada», «Notificación marcada como leída», «Preferencias de notificación actualizadas», «Error al enviar la notificación», «Error al actualizar las preferencias», «Contrato creado exitosamente», «Contrato firmado», «Contrato actualizado», «Anexo agregado al contrato», «Error al crear el contrato», «Error al firmar el contrato», «Reporte generado exitosamente», «Reporte exportado exitosamente», «Descargando reporte...», «Error al generar el reporte», «Error al exportar el reporte», «Suplantación iniciada correctamente», «Suplantación terminada correctamente», «Error al iniciar suplantación» | l.6 |

**Other texts written in the code (safety net: not tied to an element by the script)** (17)

| Text | Where |
|---|---|
| «Error al cargar {entity.toLowerCase()}: {error}» | TOAST_MESSAGES · l.26 |
| «Error al cargar {entity.toLowerCase()}» | TOAST_MESSAGES · l.26 |
| «Creando {entity.toLowerCase()}...» | TOAST_MESSAGES · l.30 |
| «Actualizando {entity.toLowerCase()}...» | TOAST_MESSAGES · l.31 |
| «Eliminando {entity.toLowerCase()}...» | TOAST_MESSAGES · l.32 |
| «Cargando {entity.toLowerCase()}...» | TOAST_MESSAGES · l.33 |
| «Error al subir el archivo: {error}» | TOAST_MESSAGES · l.56 |
| «Error al subir el archivo» | TOAST_MESSAGES · l.56 |
| «El archivo excede el tamaño máximo permitido de {maxSize}» | TOAST_MESSAGES · l.59 |
| «Usuario {userName} aprobado exitosamente» | TOAST_MESSAGES · l.87 |
| «Usuario {userName} rechazado» | TOAST_MESSAGES · l.88 |
| «Operación exitosa» | TOAST_MESSAGES · l.184 |
| «Cargando...» | TOAST_MESSAGES · l.186 |
| «Copiado al portapapeles» | TOAST_MESSAGES · l.187 |
| «Enviado exitosamente» | TOAST_MESSAGES · l.188 |
| «Operación cancelada» | TOAST_MESSAGES · l.189 |
| «¿Estás seguro de que deseas eliminar?» | TOAST_MESSAGES · l.190 |

### constants/toastStyles.ts

Used by: `/admin/school-users`, `/admin/user-management`, `/profile`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `baseStyle` | «Inter, system-ui, -apple-system, sans-serif» | l.29 |

### lib/api-auth.ts

Used by: `/admin/school-users`, `/admin/tractor-signups`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Server configuration error» | `throw (shown by whoever catches it)` | `!supabaseUrl \|\| !serviceRoleKey` | createServiceRoleClient · l.113 |
| «Failed to initialize admin connection» | `throw (shown by whoever catches it)` |  | createServiceRoleClient · l.125 |

### lib/auth/password-generator.ts

Used by: `/admin/school-users`, `/admin/user-management`

**Messages set on the page** (6)

| Text | Set by | When | Where |
|---|---|---|---|
| «[password-generator] no cryptographically secure random source is available» | `throw (shown by whoever catches it)` | `!webCrypto \|\| typeof webCrypto.getRandomValues !== 'function'` | cryptoRandomBytes · l.74 |
| «[password-generator] random source returned no bytes» | `throw (shown by whoever catches it)` | `this.offset >= this.buffer.length && (!refilled \|\| refilled.length === 0)` | nextByte · l.104 |
| «[password-generator] unsupported alphabet size: {size}» | `throw (shown by whoever catches it)` | `!Number.isInteger(size) \|\| size <= 0 \|\| size > 256` | next · l.115 |
| «[password-generator] random source exhausted the rejection budget — refusing to bias the draw» | `throw (shown by whoever catches it)` |  | next · l.128 |
| «[password-generator] requested length {length} exceeds the policy maximum of {PASSWORD_POLICY.maxLength}» | `throw (shown by whoever catches it)` | `length > PASSWORD_POLICY.maxLength` | generateCompliantPassword · l.161 |
| «[password-generator] generated a password that violates the shared policy: {errors.join('; ')}» | `throw (shown by whoever catches it)` | `!valid` | generateCompliantPassword · l.186 |

### lib/auth/password-policy.ts

Used by: `/admin/school-users`, `/admin/user-management`

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «La contraseña debe tener al menos {PASSWORD_POLICY.minLength} caracteres» | `errors.push` | `password.length < PASSWORD_POLICY.minLength` | validatePasswordPolicy · l.104 |
| «La contraseña no puede superar los {PASSWORD_POLICY.maxLength} caracteres» | `errors.push` | `password.length > PASSWORD_POLICY.maxLength` | validatePasswordPolicy · l.108 |
| «La contraseña debe contener al menos una letra mayúscula» | `errors.push` | `PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)` | validatePasswordPolicy · l.112 |
| «La contraseña debe contener al menos una letra minúscula» | `errors.push` | `PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)` | validatePasswordPolicy · l.116 |
| «La contraseña debe contener al menos un número» | `errors.push` | `PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)` | validatePasswordPolicy · l.120 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Al menos una letra mayúscula» | PASSWORD_RULES · l.68 |
| «Al menos una letra minúscula» | PASSWORD_RULES · l.73 |
| «Al menos un número» | PASSWORD_RULES · l.78 |
| «La contraseña es obligatoria» | validatePasswordPolicy · l.100 |
| «una letra mayúscula, una letra minúscula y un número.» | PASSWORD_POLICY_SUMMARY · l.140 |

### lib/exportUtils.ts

Used by: `/admin/tractor-signups`

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

### lib/signups.ts

Used by: `/admin/tractor-signups`

**Texts kept in lists and helpers in the code (labels, options, status names)** (7)

| Name | Texts | Where |
|---|---|---|
| `SANTA_MARTA_NETWORK_NAME` | «Santa Marta» | l.6 |
| `SIGNUP_SOURCE_LABELS` | «Líderes Tractor», «Registro general» | l.11 |
| `SIGNUP_SOURCE_INVITE_BODY` | «Ya puedes activar tu cuenta para ingresar a la plataforma Genera como parte de Líderes de la Generación Tractor.», «Ya puedes activar tu cuenta para ingresar a la plataforma Genera.» | l.18 |
| `TRACTOR_ROLE_LABELS` | «Docente», «Equipo Directivo» | l.36 |
| `TRACTOR_STATUS_LABELS` | «Pendiente», «Acceso otorgado», «Descartado» | l.41 |
| `GENERATION_WARNINGS` | «La generación del registro ya no corresponde al colegio; se otorgó sin generación.», «La generación no se aplicó porque el perfil pertenece a otro colegio.», «El perfil ya tiene otra generación asignada; no se modificó.» | l.226 |
| `ROLE_LABEL_BY_TYPE` | «Admin», «Consultor», «Equipo Directivo», «Líder Generación», «Líder Comunidad», «Community Manager», «Docente», «Supervisor de Red», «Encargado Licitación» | l.313 |

**Reads and writes the database directly:** `table:generations` (select), `table:red_escuelas` (select), `table:redes_de_colegios` (select), `table:schools` (select)

### types/roles.ts

Used by: `/admin/network-management`, `/admin/school-users`, `/admin/schools`, `/admin/tractor-signups`, `/admin/user-management`, `/profile`

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

### utils/bulkUserParser.ts

Used by: `/admin/user-management`

**Messages set on the page** (9)

| Text | Set by | When | Where |
|---|---|---|---|
| «Email es requerido» | `errors.push` | `!emailForValidation` | parseUserRow · l.154 |
| «Email inválido» | `errors.push` | `!(!emailForValidation) && !isValidEmail(emailForValidation)` | parseUserRow · l.156 |
| «Rol '{roleForValidation}' inválido» | `errors.push` | `roleForValidation && DANGEROUS_CHARS.includes(roleForValidation.charAt(0))` | parseUserRow · l.163 |
| «El rol Supervisor de Red debe asignarse desde Gestión de Redes.» | `errors.push` | `!(roleForValidation && DANGEROUS_CHARS.includes(roleForValidation.charAt(0))) && String(finalRole ?? '').trim().toLowerCase() === 'supervisor_de_red'` | parseUserRow · l.176 |
| «Rol '{roleForValidation}' inválido» | `errors.push` | `!(roleForValidation && DANGEROUS_CHARS.includes(roleForValidation.charAt(0))) && !(String(finalRole ?? '').trim().toLowerCase() === 'supervisor_de_red') && roleForValidation && !validRoles.includes(roleForValidation)` | parseUserRow · l.178 |
| «RUT inválido» | `errors.push` | `DANGEROUS_CHARS.includes(rutForValidation.charAt(0))` | parseUserRow · l.183 |
| «RUT inválido» | `errors.push` | `!(DANGEROUS_CHARS.includes(rutForValidation.charAt(0))) && options.validateRut && rutForValidation && !validateRut(rutForValidation)` | parseUserRow · l.185 |
| «Se generará una contraseña segura automáticamente» | `warnings.push` | `!(password)` | parseUserRow · l.207 |
| «La columna "email" es requerida.» | `throw (shown by whoever catches it)` | `columns.email === -1` | parseBulkUserData · l.343 |

### utils/roleUtils.ts

Used by: `/admin/network-management`, `/admin/school-users`, `/admin/schools`, `/admin/tractor-signups`, `/admin/user-management`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Error al asignar rol» | assignRoleViaAPI · l.834 |
| «Error de conexión al asignar rol» | assignRoleViaAPI · l.846 |
| «Error al remover rol» | removeRoleViaAPI · l.871 |
| «Error de conexión al remover rol» | removeRoleViaAPI · l.877 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

### utils/toastUtils.ts

Used by: `/admin/school-users`, `/admin/user-management`, `/profile`

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «{message}» |  | toastSuccess · l.36 |
| error | «{message}» |  | toastError · l.50 |

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/apply-supervisor-migration` | `pages/api/admin/apply-supervisor-migration.ts` | POST | **no screen** | `__tests__/api/admin/apply-supervisor-migration.test.ts` |
| `/api/admin/approve-user` | `pages/api/admin/approve-user.ts` | POST | `/admin/user-management` | `__tests__/api/admin/approve-user.authority.test.ts`, `pages/admin/user-management.tsx` |
| `/api/admin/assign-role` | `pages/api/admin/assign-role.ts` | POST | `/admin/school-users`, `/admin/user-management` | `__tests__/api/admin/assign-role.test.ts`, `__tests__/api/admin/auth-cookie-boundary.test.ts`, `scripts/seed-qa-phase2-final.js`, `scripts/seed-qa-phase2-retest.js`, `scripts/seed-qa-phase2.js` +3 |
| `/api/admin/auth/is-superadmin` | `pages/api/admin/auth/is-superadmin.ts` | GET | `/admin/role-management` | `pages/admin/role-management.tsx` |
| `/api/admin/bulk-create-users` | `pages/api/admin/bulk-create-users.ts` | POST | `/admin/user-management` | `__tests__/api/admin/bulk-create-users.test.ts`, `components/admin/BulkUserImportModal.tsx`, `tests/e2e/network-supervisors.spec.ts` |
| `/api/admin/check-permissions` | `pages/api/admin/check-permissions.ts` | GET | **no screen** | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/admin/create-user` | `pages/api/admin/create-user.ts` | POST | `/admin/school-users`, `/admin/user-management` | `__tests__/api/admin/create-user.test.ts`, `__tests__/pages/admin/school-users.test.tsx`, `pages/admin/school-users.tsx`, `pages/admin/user-management.tsx`, `tests/e2e/network-supervisors.spec.ts` |
| `/api/admin/delete-user` | `pages/api/admin/delete-user.ts` | POST | `/admin/school-users`, `/admin/user-management` | `__tests__/api/admin/delete-user.test.ts`, `pages/admin/school-users.tsx`, `pages/admin/user-management.tsx` |
| `/api/admin/init-supervisor-tables` | `pages/api/admin/init-supervisor-tables.ts` | POST | **no screen** |  |
| `/api/admin/networks/all-schools-simple` | `pages/api/admin/networks/all-schools-simple.ts` | GET | `/admin/network-management` | `pages/admin/network-management.tsx` |
| `/api/admin/networks/all-schools` | `pages/api/admin/networks/all-schools.ts` | GET | **no screen** |  |
| `/api/admin/networks/available-schools` | `pages/api/admin/networks/available-schools.ts` | GET | **no screen** | `__tests__/api/admin/admin-forged-session.test.ts` |
| `/api/admin/networks` | `pages/api/admin/networks/index.ts` | DELETE, GET, POST, PUT | `/admin/network-management` | `__tests__/api/admin/networks-index.test.ts`, `pages/admin/network-management.tsx`, `scripts/ci/e2e-mandatory.mjs`, `tests/e2e/ci-fixture.spec.ts`, `tests/e2e/network-supervisors.spec.ts` |
| `/api/admin/networks/schools` | `pages/api/admin/networks/schools.ts` | DELETE, GET, POST, PUT | `/admin/network-management` | `__tests__/api/admin/admin-forged-session.test.ts`, `__tests__/api/admin/networks-schools.test.ts`, `pages/admin/network-management.tsx` |
| `/api/admin/networks/supervisors-simple` | `pages/api/admin/networks/supervisors-simple.ts` | GET | `/admin/network-management` | `pages/admin/network-management.tsx` |
| `/api/admin/networks/supervisors` | `pages/api/admin/networks/supervisors.ts` | DELETE, GET, POST | `/admin/network-management` | `__tests__/api/admin/networks-supervisors.test.ts`, `__tests__/utils/roleUtils.assignSupervisorRole.test.ts`, `pages/admin/network-management.tsx`, `tests/e2e/network-supervisors.spec.ts` |
| `/api/admin/networks/test-schools` | `pages/api/admin/networks/test-schools.ts` | GET | **no screen** |  |
| `/api/admin/remove-role` | `pages/api/admin/remove-role.ts` | POST | `/admin/school-users`, `/admin/user-management` | `__tests__/api/admin/remove-role.test.ts`, `utils/roleUtils.ts` |
| `/api/admin/reset-password` | `pages/api/admin/reset-password.ts` | POST | `/admin/school-users`, `/admin/user-management` | `__tests__/api/admin/auth-cookie-boundary.test.ts`, `__tests__/api/admin/reset-password.test.ts`, `pages/admin/school-users.tsx`, `pages/admin/user-management.tsx`, `tests/e2e/auth-cookie-identity.spec.ts` +1 |
| `/api/admin/roles/permissions` | `pages/api/admin/roles/permissions.ts` | GET | `/admin/role-management` | `pages/admin/role-management.tsx` |
| `/api/admin/roles/permissions/overlay` | `pages/api/admin/roles/permissions/overlay.ts` | POST | **no screen** | `__tests__/api/admin/admin-forged-session.test.ts` |
| `/api/admin/roles/permissions/update` | `pages/api/admin/roles/permissions/update.ts` | POST | `/admin/role-management` | `pages/admin/role-management.tsx` |
| `/api/admin/schools` | `pages/api/admin/schools.ts` | POST | `/contracts` | `components/contracts/ContractForm.tsx`, `scripts/populate-qa-scenarios.js`, `scripts/seed-qa-phase2-final.js`, `scripts/seed-qa-phase2.js` |
| `/api/admin/tractor-signups/grant` | `pages/api/admin/tractor-signups/grant.ts` | POST | `/admin/tractor-signups` | `__tests__/api/admin/tractor-signups-grant.test.ts`, `__tests__/components/TractorSignupsPage.grantWarning.test.tsx`, `pages/admin/tractor-signups.tsx`, `tests/e2e/auth-lifecycle.spec.ts` |
| `/api/admin/tractor-signups` | `pages/api/admin/tractor-signups/index.ts` | GET | `/admin/tractor-signups` | `__tests__/components/TractorSignupsPage.grantWarning.test.tsx`, `__tests__/security/no-phantom-audit-table.test.ts`, `pages/admin/tractor-signups.tsx` |
| `/api/admin/tractor-signups/resend-invite` | `pages/api/admin/tractor-signups/resend-invite.ts` | POST | `/admin/tractor-signups` | `__tests__/api/admin/resend-invite.test.ts`, `pages/admin/tractor-signups.tsx`, `supabase/tests/052-invitation-resend-claim.sql`, `tests/e2e/auth-lifecycle.spec.ts` |
| `/api/admin/update-role` | `pages/api/admin/update-role.ts` | POST | `/admin/user-management` | `pages/admin/user-management.tsx` |
| `/api/admin/update-user` | `pages/api/admin/update-user.ts` | POST | `/admin/school-users`, `/admin/user-management` | `__tests__/api/admin/update-user.test.ts`, `__tests__/components/UserEditModal.disableSchoolEdit.test.tsx`, `components/admin/UserEditModal.tsx`, `scripts/populate-qa-scenarios.js`, `scripts/seed-qa-phase2-final.js` +2 |
| `/api/admin/user-roles` | `pages/api/admin/user-roles.ts` | GET | `/admin/school-users`, `/admin/user-management` | `__tests__/api/admin/user-roles.test.ts`, `__tests__/components/RoleAssignmentModal.allowedRoles.test.tsx`, `__tests__/components/RoleAssignmentModal.liderCommunityMode.test.tsx`, `components/RoleAssignmentModal.tsx` |
| `/api/admin/users` | `pages/api/admin/users.ts` | GET | `/admin/assignment-matrix`, `/admin/school-users`, `/admin/user-management` | `__tests__/api/admin/users-list.test.ts`, `__tests__/middleware.forced-password-change.test.ts`, `__tests__/middleware.test.ts`, `__tests__/pages/admin/school-users.test.tsx`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts` +5 |
| `/api/admin/users/search` | `pages/api/admin/users/search.ts` | GET | `/admin/assessment-builder/[templateId]` | `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/user/onboarding-state` | `pages/api/user/onboarding-state.ts` | GET, PUT | `/admin/qa`, `/admin/qa/coverage`, `/admin/qa/feature-checklist`, `/admin/qa/lighthouse`, `/admin/qa/load-tests` | `hooks/useOnboarding.ts` |
| `/api/users/[userId]/school` | `pages/api/users/[userId]/school.ts` | GET | `/user/[userId]` | `__tests__/api/forged-session-sweep.test.ts`, `__tests__/api/users/school.test.ts`, `__tests__/pages/user-profile-view.test.tsx`, `pages/user/[userId].tsx` |


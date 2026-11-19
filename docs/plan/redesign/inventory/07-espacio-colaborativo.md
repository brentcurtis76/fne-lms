# Espacio Colaborativo y comunidades

Area `07-espacio-colaborativo`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `ca9dad512` (2026-11-19).

4 screen files, 19 API files, 73 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/growth-communities/[id]/members` | `pages/admin/growth-communities/[id]/members.tsx` | 1100 | — |  |
| `/admin/growth-communities` | `pages/admin/growth-communities/index.tsx` | 1071 | Comunidades |  |
| `/community/workspace` | `pages/community/workspace.tsx` | 3061 | Espacio Colaborativo › Vista General; Espacio Colaborativo › Sesiones; Espacio Colaborativo › Gestión Comunidades |  |
| `/user/[userId]` | `pages/user/[userId].tsx` | 392 | — |  |

## /admin/growth-communities/[id]/members

File `pages/admin/growth-communities/[id]/members.tsx` · 1100 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.77 `server redirect → /login  (when !user)`
  - l.93 `isAdmin = rows.some((r) => r.role_type === 'admin')`
  - l.106 `server redirect → /dashboard  (when !(isAdmin) && (!edRow \|\| edRow.school_id === null \|\| edRow.school_id === undefined))`
  - l.112 `server redirect → /dashboard  (when !(isAdmin) && !Number.isFinite(schoolId))`
  - l.146 `server redirect → /dashboard  (when role === 'equipo_directivo' && edSchoolId !== null && (!Number.isFinite(communitySchoolId) \|\| communitySchoolId !== edSchoolId))`
  - l.247 `router.push → /login`
- Linked from: `pages/admin/growth-communities/index.tsx:707`, `pages/admin/growth-communities/index.tsx:708`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/components/GrowthCommunityMembersPage.leaders.test.tsx`, `__tests__/lib/api-auth.server-side-user.test.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | sent to /dashboard |
| equipo_directivo | — | pass |
| lider_generacion | — | sent to /dashboard |
| lider_comunidad | — | sent to /dashboard |
| supervisor_de_red | — | sent to /dashboard |
| community_manager | — | sent to /dashboard |
| docente | — | sent to /dashboard |
| encargado_licitacion | — | sent to /dashboard |

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{community.name}» | h2 |  | GrowthCommunityMembersPage · l.524 |
| «Confirmar asignación» | h3 | `confirmOpen` | GrowthCommunityMembersPage · l.912 |
| «Promover a líder» | h3 | `promoteTarget` | GrowthCommunityMembersPage · l.978 |
| «Cambiar líder: {demoteTarget.first_name} {demoteTarget.last_name}» | h3 | `demoteTarget` | GrowthCommunityMembersPage · l.1021 |

**Buttons** (18)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Comunidades» | `{() => router.push('/admin/growth-communities')}` |  |  |  | GrowthCommunityMembersPage · l.507 |
| «Cambiar líder» | `{() => setChangeLeaderTargetId(m.user_id)}` | `!(leaders.length === 0) && each leaders` |  |  | GrowthCommunityMembersPage · l.585 |
| «Promover a líder» | `{() => setPromoteTargetId(m.user_id)}` | `!(filteredCurrent.length === 0) && each filteredCurrent` |  |  | GrowthCommunityMembersPage · l.642 |
| «Quitar» | `{() => handleRemove(m.user_id)}` | `!(filteredCurrent.length === 0) && each filteredCurrent` |  |  | GrowthCommunityMembersPage · l.649 |
| «Deseleccionar todos / Seleccionar todos» | `{handleSelectAllUnassigned}` |  | `{filteredUnassigned.length === 0}` |  | GrowthCommunityMembersPage · l.673 |
| «Cambiar de comunidad ( {filteredReassign.length} )» | `{() => setReassignOpen((v) => !v)}` |  |  |  | GrowthCommunityMembersPage · l.743 |
| «Deseleccionar todos / Seleccionar todos» | `{handleSelectAllReassign}` | `reassignOpen` | `{filteredReassign.length === 0}` |  | GrowthCommunityMembersPage · l.771 |
| «Deseleccionar» | `{() => { setSelectedUnassigned(new Set()); setSelectedReassign(new Set()); }}` | `totalSelected > 0` |  |  | GrowthCommunityMembersPage · l.883 |
| «{bulkLabel}» | `{() => setConfirmOpen(true)}` | `totalSelected > 0` | `{submitting \|\| totalSelected === 0}` |  | GrowthCommunityMembersPage · l.893 |
| «[icon X]» · aria «Cerrar» | `{() => setConfirmOpen(false)}` | `confirmOpen` |  |  | GrowthCommunityMembersPage · l.913 |
| «Cancelar» | `{() => setConfirmOpen(false)}` | `confirmOpen` |  |  | GrowthCommunityMembersPage · l.953 |
| «Confirmar» | `{handleConfirmAssign}` | `confirmOpen` | `{submitting}` |  | GrowthCommunityMembersPage · l.960 |
| «[icon X]» · aria «Cerrar» | `{() => setPromoteTargetId(null)}` | `promoteTarget` |  |  | GrowthCommunityMembersPage · l.979 |
| «Cancelar» | `{() => setPromoteTargetId(null)}` | `promoteTarget` | `{promoteSubmitting}` |  | GrowthCommunityMembersPage · l.995 |
| «Promoviendo... / Confirmar» | `{handleConfirmPromote}` | `promoteTarget` | `{promoteSubmitting}` |  | GrowthCommunityMembersPage · l.1003 |
| «[icon X]» · aria «Cerrar» | `{() => setChangeLeaderTargetId(null)}` | `demoteTarget` |  |  | GrowthCommunityMembersPage · l.1024 |
| «Cancelar» | `{() => setChangeLeaderTargetId(null)}` | `demoteTarget` | `{demoteSubmitting}` |  | GrowthCommunityMembersPage · l.1074 |
| «Aplicando... / Confirmar» | `{handleConfirmDemote}` | `demoteTarget` | `{demoteSubmitting}` |  | GrowthCommunityMembersPage · l.1082 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar usuarios» | text | «Buscar por nombre o email» |  |  |  | GrowthCommunityMembersPage · l.540 |
| «Seleccionar todos los usuarios sin asignar» | checkbox |  |  |  |  | GrowthCommunityMembersPage · l.687 |
| «{`Seleccionar ${displayName(u)}`}» | checkbox |  |  | `!(filteredUnassigned.length === 0) && each filteredUnassigned` |  | GrowthCommunityMembersPage · l.720 |
| «{`Reasignar ${displayName(u)}`}» | checkbox |  |  | `reassignOpen && !(filteredReassign.length === 0) && each filteredReassign` |  | GrowthCommunityMembersPage · l.815 |
| «Convertir en miembro de esta comunidad El usuario perderá su rol de líder pero seguirá siendo miembro de esta comunidad usando su otro rol activo en este colegio.» | radio | `demote_mode` |  | `demoteTarget` |  | GrowthCommunityMembersPage · l.1035 |
| «Quitar de esta comunidad El usuario será removido completamente de esta comunidad. Podrá volver a ser asignado a otra comunidad más tarde.» | radio | `demote_mode` |  | `demoteTarget` |  | GrowthCommunityMembersPage · l.1054 |

**Table columns** (15)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | `!(leaders.length === 0)` | GrowthCommunityMembersPage · l.568 |
| «Email» | `!(leaders.length === 0)` | GrowthCommunityMembersPage · l.571 |
| «Acciones» | `!(leaders.length === 0)` | GrowthCommunityMembersPage · l.574 |
| «Nombre» |  | GrowthCommunityMembersPage · l.613 |
| «Email» |  | GrowthCommunityMembersPage · l.616 |
| «Rol» |  | GrowthCommunityMembersPage · l.619 |
| «Acciones» |  | GrowthCommunityMembersPage · l.622 |
| «Nombre» |  | GrowthCommunityMembersPage · l.695 |
| «Email» |  | GrowthCommunityMembersPage · l.698 |
| «Rol» |  | GrowthCommunityMembersPage · l.701 |
| «Seleccionar» | `reassignOpen` | GrowthCommunityMembersPage · l.784 |
| «Nombre» | `reassignOpen` | GrowthCommunityMembersPage · l.787 |
| «Email» | `reassignOpen` | GrowthCommunityMembersPage · l.790 |
| «Rol» | `reassignOpen` | GrowthCommunityMembersPage · l.793 |
| «Actualmente en» | `reassignOpen` | GrowthCommunityMembersPage · l.796 |

**Pop-ups** (3)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Confirmar asignación» | written in this file | `confirmOpen` |  | GrowthCommunityMembersPage · l.909 |
| «Promover a líder» | written in this file | `promoteTarget` |  | GrowthCommunityMembersPage · l.975 |
| «Cambiar líder: {demoteTarget.first_name} {demoteTarget.last_name}» | written in this file | `demoteTarget` |  | GrowthCommunityMembersPage · l.1018 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Quitar este usuario de la comunidad?» |  | handleRemove · l.320 |

**Toasts** (16)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar miembros» | `!res.ok` | GrowthCommunityMembersPage · l.230 |
| error | «Error de red al cargar miembros» |  | GrowthCommunityMembersPage · l.235 |
| error | «Error al quitar miembro» | `!res.ok` | handleRemove · l.331 |
| success | «Miembro quitado de la comunidad» |  | handleRemove · l.334 |
| error | «Error de red al quitar miembro» |  | handleRemove · l.337 |
| error | «La asignación excede la capacidad máxima ({json.currentMemberCount ?? …} / {json.maxTeachers ?? '—'})» | `!res.ok && json.error === 'exceeds_max'` | handleConfirmAssign · l.357 |
| error | «Error al asignar miembros» | `!res.ok && !(json.error === 'exceeds_max')` | handleConfirmAssign · l.361 |
| success | «{assigned} usuario(s) asignado(s){skipped > 0 ? `, ${skipped}…}» | `assigned > 0` | handleConfirmAssign · l.368 |
| error | «Ningún usuario asignado{skipped > 0 ? `, ${skipped}…}» | `!(assigned > 0)` | handleConfirmAssign · l.372 |
| error | «Error de red al asignar miembros» |  | handleConfirmAssign · l.380 |
| error | «Error al promover a líder» | `!res.ok` | handleConfirmPromote · l.413 |
| success | «{displayName(promoteTarget)} ahora es líder de la comunidad.» |  | handleConfirmPromote · l.418 |
| error | «Error de red al promover a líder» |  | handleConfirmPromote · l.422 |
| error | «Error al cambiar líder» | `!res.ok` | handleConfirmDemote · l.449 |
| success | «Líder convertido en miembro / Líder removido de la comunidad» |  | handleConfirmDemote · l.454 |
| error | «Error de red al cambiar líder» |  | handleConfirmDemote · l.462 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `server redirect` | `!user` | getServerSideProps · l.77 |
| `/dashboard` | `server redirect` | `!(isAdmin) && (!edRow \|\| edRow.school_id === null \|\| edRow.school_id === undefined)` | getServerSideProps · l.106 |
| `/dashboard` | `server redirect` | `!(isAdmin) && !Number.isFinite(schoolId)` | getServerSideProps · l.112 |
| `/dashboard` | `server redirect` | `role === 'equipo_directivo' && edSchoolId !== null && (!Number.isFinite(communitySchoolId) \|\| communitySchoolId !== edSchoolId)` | getServerSideProps · l.146 |
| `/login` | `router.push` |  | handleLogout · l.247 |
| `/admin/growth-communities` | `router.push` |  | GrowthCommunityMembersPage · l.509 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `isAdmin = rows.some((r) => r.role_type === 'admin')` | getServerSideProps · l.93 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | GrowthCommunityMembersPage · l.494 |
| `ResponsiveFunctionalPageHeader` | title: Miembros de la comunidad · subtitle: {community.name} — {schoolName} |  |  | GrowthCommunityMembersPage · l.502 |
| `Info` | aria-hidden: true | `leaders.length === 0` |  | GrowthCommunityMembersPage · l.560 |
| `TriangleAlert` | aria-hidden: true | `reassignOpen` |  | GrowthCommunityMembersPage · l.761 |
| `Info` | aria-hidden: true | `excludedTotal > 0` |  | GrowthCommunityMembersPage · l.844 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `map` | «Este usuario ya es líder de esta comunidad.», «El usuario no tiene un rol activo en este colegio.», «El usuario pertenece a una generación distinta.», «Identificador de usuario inválido.» | handleConfirmPromote · l.407 |
| `map` | «Este usuario no tiene otro rol en este colegio. Usa 'Quitar de esta comunidad' en su lugar.», «El usuario pertenece a otra generación; no se puede mantener como miembro.», «El otro rol del usuario ya pertenece a otra comunidad. Reasigna ese rol primero o usa 'Quitar de esta comunidad'.», «Error inconsistente al cambiar líder. Contacta a soporte.» | handleConfirmDemote · l.440 |
| `bulkLabel` | «Asignando... / Asignar {selectedUnassigned.size} nuevo(s) y reasignar {selectedReassign.size} / Reasignar {selectedReassign.size} usuario(s) / Asignar {selectedUnassigned.size} usuario(s)» | GrowthCommunityMembersPage · l.468 |
| `skippedReasonLabel()` | «sin rol elegible en este colegio», «ya pertenece a esta comunidad», «es líder de comunidad», «pertenece a otra generación» | skippedReasonLabel · l.178 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «es líder de comunidad» | skippedReasonLabel · l.182 |

**Values shown from data** (20)

- `{schoolName}` — GrowthCommunityMembersPage · l.525
- `{currentCount}` — GrowthCommunityMembersPage · l.529
- `{eligibleCount}` — GrowthCommunityMembersPage · l.534
- `{displayName(m)}` — GrowthCommunityMembersPage · l.582, when `!(leaders.length === 0) && each leaders`
- `{m.email} / —` — GrowthCommunityMembersPage · l.583, when `!(leaders.length === 0) && each leaders`
- `{displayName(m)}` — GrowthCommunityMembersPage · l.637, when `!(filteredCurrent.length === 0) && each filteredCurrent`
- `{m.email} / —` — GrowthCommunityMembersPage · l.638, when `!(filteredCurrent.length === 0) && each filteredCurrent`
- `{m.role_type}` — GrowthCommunityMembersPage · l.639, when `!(filteredCurrent.length === 0) && each filteredCurrent`
- `{displayName(u)}` — GrowthCommunityMembersPage · l.730, when `!(filteredUnassigned.length === 0) && each filteredUnassigned`
- `{u.email} / —` — GrowthCommunityMembersPage · l.731, when `!(filteredUnassigned.length === 0) && each filteredUnassigned`
- `{u.role_type}` — GrowthCommunityMembersPage · l.732, when `!(filteredUnassigned.length === 0) && each filteredUnassigned`
- `{displayName(u)}` — GrowthCommunityMembersPage · l.825, when `reassignOpen && !(filteredReassign.length === 0) && each filteredReassign`
- `{u.email} / —` — GrowthCommunityMembersPage · l.826, when `reassignOpen && !(filteredReassign.length === 0) && each filteredReassign`
- `{u.role_type}` — GrowthCommunityMembersPage · l.827, when `reassignOpen && !(filteredReassign.length === 0) && each filteredReassign`
- `{u.current_community_name} / {u.current_community_id}` — GrowthCommunityMembersPage · l.828, when `reassignOpen && !(filteredReassign.length === 0) && each filteredReassign`
- `{totalSelected}` — GrowthCommunityMembersPage · l.924, when `confirmOpen`
- `{community.name}` — GrowthCommunityMembersPage · l.925, when `confirmOpen`
- `{displayName(u)}` — GrowthCommunityMembersPage · l.932, when `confirmOpen && selectedUnassigned.size > 0 && each selectedUnassignedUsers`
- `{displayName(u)} ( {u.current_community_name} / {u.current_community_id} )` — GrowthCommunityMembersPage · l.944, when `confirmOpen && selectedReassign.size > 0 && each selectedReassignUsers`
- `{displayName(promoteTarget)}` — GrowthCommunityMembersPage · l.990, when `promoteTarget`

**Other texts on screen** (28)

- «/ {maxTeachers}» — GrowthCommunityMembersPage · l.530
- «miembro(s)» — GrowthCommunityMembersPage · l.530
- «(capacidad) / actuales» — GrowthCommunityMembersPage · l.531
- «elegible(s)» — GrowthCommunityMembersPage · l.534
- «Líderes de la comunidad ( {leaders.length} )» — GrowthCommunityMembersPage · l.554
- «Esta comunidad no tiene líderes activos. Promueve un miembro abajo.» — GrowthCommunityMembersPage · l.561, when `leaders.length === 0`
- «Miembros actuales (no líderes) ( {nonLeaderMembers.length} )» — GrowthCommunityMembersPage · l.605
- «No hay miembros que coincidan con la búsqueda» — GrowthCommunityMembersPage · l.631, when `filteredCurrent.length === 0`
- «Sin asignar ( {filteredUnassigned.length} )» — GrowthCommunityMembersPage · l.670
- «No hay usuarios sin asignar» — GrowthCommunityMembersPage · l.710, when `filteredUnassigned.length === 0`
- «Estos usuarios ya pertenecen a otra comunidad. Al asignarlos aquí se» — GrowthCommunityMembersPage · l.766, when `reassignOpen`
- «moverán» — GrowthCommunityMembersPage · l.767, when `reassignOpen`
- «y dejarán de ser miembros de su comunidad anterior.» — GrowthCommunityMembersPage · l.767, when `reassignOpen`
- «No hay usuarios para reasignar» — GrowthCommunityMembersPage · l.805, when `reassignOpen && filteredReassign.length === 0`
- «{excludedTotal} usuario(s) del colegio no aparecen como elegibles» — GrowthCommunityMembersPage · l.846, when `excludedTotal > 0`
- «Ver detalles» (label) — GrowthCommunityMembersPage · l.850, when `excludedTotal > 0`
- «{excluded?.reasons.is_leader} es líder de otra comunidad y no puede moverse desde aquí» — GrowthCommunityMembersPage · l.853, when `excludedTotal > 0 && (excluded?.reasons.is_leader ?? 0) > 0`
- «{excluded?.reasons.generation_mismat…} pertenece a una generación distinta a la de esta comunidad» — GrowthCommunityMembersPage · l.859, when `excludedTotal > 0 && (excluded?.reasons.generation_mismatch ?? 0) > 0`
- «usuario(s) seleccionado(s)» — GrowthCommunityMembersPage · l.875, when `totalSelected > 0`
- «( {selectedReassign.size} reasignación(es))» — GrowthCommunityMembersPage · l.877, when `totalSelected > 0 && hasReassignments`
- «Vas a asignar» — GrowthCommunityMembersPage · l.924, when `confirmOpen`
- «usuario(s) a» — GrowthCommunityMembersPage · l.924, when `confirmOpen`
- «{selectedUnassigned.size} nuevo(s) miembro(s)» — GrowthCommunityMembersPage · l.929, when `confirmOpen && selectedUnassigned.size > 0`
- «{selectedReassign.size} se moverá(n) desde otra comunidad» — GrowthCommunityMembersPage · l.939, when `confirmOpen && selectedReassign.size > 0`
- «¿Promover a» — GrowthCommunityMembersPage · l.990, when `promoteTarget`
- «como líder de esta comunidad?» — GrowthCommunityMembersPage · l.990, when `promoteTarget`
- «Convertir en miembro de esta comunidad El usuario perderá su rol de líder pero seguirá siendo miembro de esta comunidad usando su otro rol activo en este colegio.» (label) — GrowthCommunityMembersPage · l.1034, when `demoteTarget`
- «Quitar de esta comunidad El usuario será removido completamente de esta comunidad. Podrá volver a ser asignado a otra comunidad más tarde.» (label) — GrowthCommunityMembersPage · l.1053, when `demoteTarget`

**Reads and writes the database directly:** `table:growth_communities` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `lib/api-auth.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/growth-communities/[id]/leaders` | DELETE, POST | `pages/admin/growth-communities/[id]/members.tsx:399`, `pages/admin/growth-communities/[id]/members.tsx:432` |
| `/api/admin/growth-communities/[id]/members` | DELETE, GET, POST | `pages/admin/growth-communities/[id]/members.tsx:227`, `pages/admin/growth-communities/[id]/members.tsx:326`, `pages/admin/growth-communities/[id]/members.tsx:349` |

## /admin/growth-communities

File `pages/admin/growth-communities/index.tsx` · 1071 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: «Comunidades» → `/admin/growth-communities` — roles: admin, equipo_directivo (`Sidebar.tsx` l.381)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.67 `server redirect → /login  (when !user)`
  - l.83 `isAdmin = rows.some((r) => r.role_type === 'admin')`
  - l.93 `server redirect → /dashboard  (when !edRow \|\| edRow.school_id === null \|\| edRow.school_id === undefined)`
  - l.99 `server redirect → /dashboard  (when !Number.isFinite(schoolId))`
  - l.256 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:384`, `middleware.ts:238`, `pages/admin/growth-communities/[id]/members.tsx:509`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/components/GrowthCommunitiesIndexPage.crud.test.tsx`, `__tests__/lib/api-auth.server-side-user.test.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
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
| «Crear comunidad» | h2 | `showCreateModal` | GrowthCommunitiesIndexPage · l.744 |
| «Editar comunidad» | h2 | `editTarget` | GrowthCommunitiesIndexPage · l.872 |
| «Eliminar comunidad» | h2 | `deleteTarget` | GrowthCommunitiesIndexPage · l.999 |

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Crear comunidad» | `{openCreateModal}` | `role === 'admin'` | `{!canCreate}` |  | GrowthCommunitiesIndexPage · l.605 |
| «Crear comunidad» | `{openCreateModal}` | `role === 'equipo_directivo'` | `{!canCreate}` |  | GrowthCommunitiesIndexPage · l.627 |
| «[icon Pencil]» · tooltip «Editar comunidad» · aria «Editar comunidad» | `{() => openEditModal(c)}` | `!(!selectedSchoolId) && !(loading) && !(communities.length === 0) && each communities` |  |  | GrowthCommunitiesIndexPage · l.698 |
| «[icon Trash2]» · tooltip «Eliminar comunidad» · aria «Eliminar comunidad» | `{() => openDeleteModal(c)}` | `!(!selectedSchoolId) && !(loading) && !(communities.length === 0) && each communities` |  |  | GrowthCommunitiesIndexPage · l.714 |
| «Cancelar» | `{closeCreateModal}` | `showCreateModal` | `{submitting}` |  | GrowthCommunitiesIndexPage · l.841 |
| «Creando... / Crear comunidad» (submits the form) |  | `showCreateModal` | `{submitting}` |  | GrowthCommunitiesIndexPage · l.849 |
| «Cancelar» | `{closeEditModal}` | `editTarget` | `{editSubmitting}` |  | GrowthCommunitiesIndexPage · l.969 |
| «Guardando... / Guardar cambios» (submits the form) |  | `editTarget` | `{editSubmitting}` |  | GrowthCommunitiesIndexPage · l.977 |
| «Cancelar» | `{closeDeleteModal}` | `deleteTarget && !deletePreviewLoading && deleteDeletable` | `{deleteSubmitting}` |  | GrowthCommunitiesIndexPage · l.1036 |
| «Eliminando... / Eliminar» | `{handleDeleteConfirm}` | `deleteTarget && !deletePreviewLoading && deleteDeletable` | `{deleteSubmitting}` |  | GrowthCommunitiesIndexPage · l.1044 |
| «Cerrar» | `{closeDeleteModal}` | `deleteTarget && !(!deletePreviewLoading && deleteDeletable)` |  |  | GrowthCommunitiesIndexPage · l.1054 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Gestionar miembros» | `/admin/growth-communities/[*]/members` | `!(!selectedSchoolId) && !(loading) && !(communities.length === 0) && each communities` |  | GrowthCommunitiesIndexPage · l.707 |

**Fields** (9)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Colegio» | select |  | «Selecciona un colegio», «(lista) {s.name}» | `role === 'admin'` | `id=filter-school (id used by code)` | GrowthCommunitiesIndexPage · l.590 |
| «Nombre *» | text | required · `maxLength={NAME_MAX} minLength={1}` |  | `showCreateModal` | `id=cc-name (id used by code)` | GrowthCommunitiesIndexPage · l.760 |
| «Generación *» | select | required | «Selecciona una generación», «(lista) {g.name}» | `showCreateModal && showGenerationField` | `id=cc-generation (id used by code)` | GrowthCommunitiesIndexPage · l.780 |
| «Capacidad máxima» | number | `min={MAX_TEACHERS_MIN} max={MAX_TEACHERS_MAX} step={1}` |  | `showCreateModal` | `id=cc-max (id used by code)` | GrowthCommunitiesIndexPage · l.804 |
| «Descripción» | textarea | `maxLength={DESCRIPTION_MAX}` |  | `showCreateModal` | `id=cc-description (id used by code)` | GrowthCommunitiesIndexPage · l.826 |
| «Nombre *» | text | required · `maxLength={NAME_MAX} minLength={1}` |  | `editTarget` | `id=ec-name (id used by code)` | GrowthCommunitiesIndexPage · l.888 |
| «Generación *» | select | required | «Selecciona una generación», «(lista) {g.name}» | `editTarget && showGenerationField` | `id=ec-generation (id used by code)` | GrowthCommunitiesIndexPage · l.908 |
| «Capacidad máxima» | number | `min={MAX_TEACHERS_MIN} max={MAX_TEACHERS_MAX} step={1}` |  | `editTarget` | `id=ec-max (id used by code)` | GrowthCommunitiesIndexPage · l.932 |
| «Descripción» | textarea | `maxLength={DESCRIPTION_MAX}` |  | `editTarget` | `id=ec-description (id used by code)` | GrowthCommunitiesIndexPage · l.954 |

**Forms** (2)

| On submit | Shown when | Where |
|---|---|---|
| `{handleCreateSubmit}` | `showCreateModal` | GrowthCommunitiesIndexPage · l.742 |
| `{handleEditSubmit}` | `editTarget` | GrowthCommunitiesIndexPage · l.870 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» |  | GrowthCommunitiesIndexPage · l.642 |
| «ID» |  | GrowthCommunitiesIndexPage · l.645 |
| «Generación» |  | GrowthCommunitiesIndexPage · l.648 |
| «Capacidad» |  | GrowthCommunitiesIndexPage · l.651 |
| «Miembros» |  | GrowthCommunitiesIndexPage · l.654 |
| «Acciones» |  | GrowthCommunitiesIndexPage · l.657 |

**Pop-ups** (3)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Crear comunidad» | written in this file | `showCreateModal` |  | GrowthCommunitiesIndexPage · l.735 |
| «Editar comunidad» | written in this file | `editTarget` |  | GrowthCommunitiesIndexPage · l.863 |
| «Eliminar comunidad» | written in this file | `deleteTarget` |  | GrowthCommunitiesIndexPage · l.991 |

**Toasts** (31)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar colegios» | `error` | GrowthCommunitiesIndexPage · l.154 |
| error | «Error al cargar comunidades» | `!res.ok` | GrowthCommunitiesIndexPage · l.172 |
| error | «Error de red al cargar comunidades» |  | GrowthCommunitiesIndexPage · l.197 |
| error | «Selecciona un colegio» | `!selectedSchoolId` | handleCreateSubmit · l.277 |
| error | «El nombre debe tener entre 1 y {NAME_MAX} caracteres.» | `trimmedName.length < 1 \|\| trimmedName.length > NAME_MAX` | handleCreateSubmit · l.283 |
| error | «Esta escuela utiliza generaciones; debes seleccionar una.» | `requiresGeneration && !formGenerationId` | handleCreateSubmit · l.289 |
| error | «La capacidad debe ser un número entero entre {MAX_TEACHERS_MIN} y {MAX_TEACHERS_MAX}.» | `!Number.isInteger(parsedMax) \|\| parsedMax < MAX_TEACHERS_MIN \|\| parsedMax > MAX_TEACHERS_MAX` | handleCreateSubmit · l.299 |
| error | «La descripción debe tener máximo {DESCRIPTION_MAX} caracteres.» | `formDescription.length > DESCRIPTION_MAX` | handleCreateSubmit · l.304 |
| success | «Comunidad creada correctamente.» | `res.status === 201` | handleCreateSubmit · l.329 |
| error | «Ya existe una comunidad con ese nombre.» | `payload.error === 'duplicate_name'` | handleCreateSubmit · l.343 |
| error | «Esta escuela utiliza generaciones; debes seleccionar una.» | `!(payload.error === 'duplicate_name') && payload.error === 'generation_required'` | handleCreateSubmit · l.345 |
| error | «Error al crear la comunidad» | `!(payload.error === 'duplicate_name') && !(payload.error === 'generation_required')` | handleCreateSubmit · l.347 |
| error | «Error de red al crear la comunidad» |  | handleCreateSubmit · l.350 |
| error | «El nombre debe tener entre 1 y {NAME_MAX} caracteres.» | `trimmedName.length < 1 \|\| trimmedName.length > NAME_MAX` | handleEditSubmit · l.382 |
| error | «Esta escuela utiliza generaciones; debes seleccionar una.» | `requiresGeneration && !editGenerationId` | handleEditSubmit · l.388 |
| error | «La capacidad debe ser un número entero entre {MAX_TEACHERS_MIN} y {MAX_TEACHERS_MAX}.» | `!Number.isInteger(parsedMax) \|\| parsedMax < MAX_TEACHERS_MIN \|\| parsedMax > MAX_TEACHERS_MAX` | handleEditSubmit · l.398 |
| error | «La descripción debe tener máximo {DESCRIPTION_MAX} caracteres.» | `editDescription.length > DESCRIPTION_MAX` | handleEditSubmit · l.405 |
| error | «No hay cambios para guardar.» | `Object.keys(body).length === 0` | handleEditSubmit · l.426 |
| success | «Comunidad actualizada.» | `res.status === 200` | handleEditSubmit · l.439 |
| error | «Error al actualizar la comunidad» | `payload.error === 'school_id_immutable'` | handleEditSubmit · l.458 |
| error | «Algunos miembros pertenecen a otra generación. No se puede cambiar la generación. (Conflictos: {payload.conflicting_member_…})» | `!(payload.error === 'school_id_immutable') && payload.error === 'members_have_other_generation'` | handleEditSubmit · l.460 |
| error | «Ya existe una comunidad con ese nombre.» | `!(payload.error === 'school_id_immutable') && !(payload.error === 'members_have_other_generation') && payload.error === 'duplicate_name'` | handleEditSubmit · l.464 |
| error | «La generación seleccionada no es válida para esta escuela.» | `!(payload.error === 'school_id_immutable') && !(payload.error === 'members_have_other_generation') && !(payload.error === 'duplicate_name') && payload.error === 'generation_invalid'` | handleEditSubmit · l.466 |
| error | «Esta escuela utiliza generaciones; debes seleccionar una.» | `!(payload.error === 'members_have_other_generation') && !(payload.error === 'duplicate_name') && !(payload.error === 'generation_invalid') && payload.error === 'generation_required'` | handleEditSubmit · l.468 |
| error | «Error al actualizar la comunidad» | `!(payload.error === 'members_have_other_generation') && !(payload.error === 'duplicate_name') && !(payload.error === 'generation_invalid') && !(payload.error === 'generation_required')` | handleEditSubmit · l.470 |
| error | «Error de red al actualizar la comunidad» |  | handleEditSubmit · l.473 |
| error | «Error al cargar la comunidad» | `!(res.status === 200 && payload.deletable === true) && !(res.status === 409 && payload.error === 'has_dependencies')` | openDeleteModal · l.507 |
| error | «Error de red al cargar la comunidad» |  | openDeleteModal · l.511 |
| success | «Comunidad eliminada» | `res.status === 200 && payload.deleted === true` | handleDeleteConfirm · l.546 |
| error | «Error al eliminar la comunidad.» | `!(res.status === 200 && payload.deleted === true) && !(res.status === 409 && payload.error === 'has_dependencies')` | handleDeleteConfirm · l.555 |
| error | «Error al eliminar la comunidad.» |  | handleDeleteConfirm · l.558 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `server redirect` | `!user` | getServerSideProps · l.67 |
| `/dashboard` | `server redirect` | `!edRow \|\| edRow.school_id === null \|\| edRow.school_id === undefined` | getServerSideProps · l.93 |
| `/dashboard` | `server redirect` | `!Number.isFinite(schoolId)` | getServerSideProps · l.99 |
| `/login` | `router.push` |  | handleLogout · l.256 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `isAdmin = rows.some((r) => r.role_type === 'admin')` | getServerSideProps · l.83 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `cancelled` | GrowthCommunitiesIndexPage · l.236 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | GrowthCommunitiesIndexPage · l.565 |
| `ResponsiveFunctionalPageHeader` | title: Comunidades de crecimiento · subtitle: Gestiona los miembros de cada comunidad |  |  | GrowthCommunitiesIndexPage · l.573 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `BLOCKER_LABELS` | «Miembros / líderes activos», «Sesiones de consultoría», «Asignaciones de consultores», «Espacios de trabajo de la comunidad», «Grupos de asignaciones», «Tareas asignadas», «Entregas compartidas», «Referencias en perfiles (legado)» | l.32 |

**Values shown from data** (9)

- `{c.name}` — GrowthCommunitiesIndexPage · l.684, when `!(!selectedSchoolId) && !(loading) && !(communities.length === 0) && each communities`
- `{c.id}` — GrowthCommunitiesIndexPage · l.685, when `!(!selectedSchoolId) && !(loading) && !(communities.length === 0) && each communities`
- `{c.generation_id} / —` — GrowthCommunitiesIndexPage · l.686, when `!(!selectedSchoolId) && !(loading) && !(communities.length === 0) && each communities`
- `{c.max_teachers} / —` — GrowthCommunitiesIndexPage · l.689, when `!(!selectedSchoolId) && !(loading) && !(communities.length === 0) && each communities`
- `{c.member_count} / {c.max_teachers}` — GrowthCommunitiesIndexPage · l.692, when `!(!selectedSchoolId) && !(loading) && !(communities.length === 0) && each communities`
- `{formDescription.length} / {DESCRIPTION_MAX}` — GrowthCommunitiesIndexPage · l.834, when `showCreateModal`
- `{editDescription.length} / {DESCRIPTION_MAX}` — GrowthCommunitiesIndexPage · l.962, when `editTarget`
- `{deleteTarget.name}` — GrowthCommunitiesIndexPage · l.1005, when `deleteTarget`
- `{BLOCKER_LABELS[b.kind]} / {b.kind} : {b.count}` — GrowthCommunitiesIndexPage · l.1022, when `!(deletePreviewLoading) && !(deleteDeletable) && deleteBlockers && deleteBlockers.length > 0 && each deleteBlockers`

**Other texts on screen** (17)

- «Colegio» (label) — GrowthCommunitiesIndexPage · l.584, when `role === 'admin'`
- «{communities.length} comunidad(es) / Selecciona un colegio para ver sus comunidades» — GrowthCommunitiesIndexPage · l.621
- «Cargando...» — GrowthCommunitiesIndexPage · l.672, when `!(!selectedSchoolId) && loading`
- «Este colegio no tiene comunidades» — GrowthCommunitiesIndexPage · l.678, when `!(!selectedSchoolId) && !(loading) && communities.length === 0`
- «Nombre *» (label) — GrowthCommunitiesIndexPage · l.754, when `showCreateModal`
- «Generación *» (label) — GrowthCommunitiesIndexPage · l.774, when `showCreateModal && showGenerationField`
- «Capacidad máxima» (label) — GrowthCommunitiesIndexPage · l.798, when `showCreateModal`
- «Entre {MAX_TEACHERS_MIN} y {MAX_TEACHERS_MAX} (por defecto {MAX_TEACHERS_DEFAULT} ).» — GrowthCommunitiesIndexPage · l.814, when `showCreateModal`
- «Descripción» (label) — GrowthCommunitiesIndexPage · l.820, when `showCreateModal`
- «Nombre *» (label) — GrowthCommunitiesIndexPage · l.882, when `editTarget`
- «Generación *» (label) — GrowthCommunitiesIndexPage · l.902, when `editTarget && showGenerationField`
- «Capacidad máxima» (label) — GrowthCommunitiesIndexPage · l.926, when `editTarget`
- «Entre {MAX_TEACHERS_MIN} y {MAX_TEACHERS_MAX} (por defecto {MAX_TEACHERS_DEFAULT} ).» — GrowthCommunitiesIndexPage · l.942, when `editTarget`
- «Descripción» (label) — GrowthCommunitiesIndexPage · l.948, when `editTarget`
- «Comprobando dependencias...» — GrowthCommunitiesIndexPage · l.1010, when `deleteTarget && deletePreviewLoading`
- «Esta comunidad no tiene miembros ni dependencias. ¿Confirmas la eliminación?» — GrowthCommunitiesIndexPage · l.1013, when `deleteTarget && !(deletePreviewLoading) && deleteDeletable`
- «No se puede eliminar esta comunidad. Debes resolver primero:» — GrowthCommunitiesIndexPage · l.1018, when `deleteTarget && !(deletePreviewLoading) && !(deleteDeletable) && deleteBlockers && deleteBlockers.length > 0`

**Reads and writes the database directly:** `table:generations` (select), `table:schools` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `lib/api-auth.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/growth-communities` | GET, POST | `pages/admin/growth-communities/index.tsx:169`, `pages/admin/growth-communities/index.tsx:322` |
| `/api/admin/growth-communities/[id]` | DELETE, PATCH | `pages/admin/growth-communities/index.tsx:432`, `pages/admin/growth-communities/index.tsx:485`, `pages/admin/growth-communities/index.tsx:529` |

## /community/workspace

File `pages/community/workspace.tsx` · 3061 lines · frame: MainLayout

### Who reaches it

- Menu: Espacio Colaborativo › «Vista General» → `/community/workspace?section=overview` — everyone signed in; the group: needs a community (admin and consultor pass) (`Sidebar.tsx` l.219)
- Menu: Espacio Colaborativo › «Sesiones» → `/community/workspace?section=sessions` — everyone signed in; the group: needs a community (admin and consultor pass) (`Sidebar.tsx` l.225)
- Menu: Espacio Colaborativo › «Gestión Comunidades» → `/community/workspace?section=communities` — permission: manage_communities_all; the group: needs a community (admin and consultor pass) (`Sidebar.tsx` l.230)
- Middleware: the workspace rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.351 `location.href → /login  (when !(!authLoading && user) && !authLoading && !user)`
  - l.912 `router.push → /dashboard  (when error)`
  - l.2818 `No tienes permisos para ver los mensajes de esta comunidad.`
- Linked from: `components/layout/Sidebar.tsx:1286`, `components/layout/Sidebar.tsx:221`, `components/layout/Sidebar.tsx:227`, `components/layout/Sidebar.tsx:232`, `components/panel/CommunityCardNuevo.tsx:125`, `components/panel/PanelClasico.tsx:205`, `components/panel/PanelClasico.tsx:206`, `lib/auth/forced-password-change.ts:177`, `lib/notifications/catalog.ts:170`, `lib/notifications/catalog.ts:325`, `lib/notifications/catalog.ts:331`, `lib/notifications/catalog.ts:336` and 17 more
- Tests: browser tests that CI runs: `tests/e2e/auth-lifecycle.spec.ts`, `tests/e2e/community-document-links.spec.ts`, `tests/e2e/meeting-create-and-access.spec.ts`; browser tests CI skips: `tests/e2e/meeting-agreements-tasks.spec.ts`, `tests/e2e/meeting-finalize-email-outcome.spec.ts`, `tests/e2e/messaging-notifications.spec.ts`, `tests/e2e/notification-catalog-links.spec.ts`, `tests/e2e/panel-pin.spec.ts`, `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`; unit tests of the page: `__tests__/pages/community/workspace.documents.test.tsx`, `__tests__/pages/community/workspace.mention-scope.test.tsx`, `__tests__/pages/community/workspace.messages.test.tsx`, `__tests__/pages/community/workspace.sendback3.test.tsx`, `__tests__/pages/community/workspace.shell.test.tsx`, `__tests__/pages/community/workspace.switch.test.tsx`, `components/__tests__/GroupAssignmentsContent.test.skip.tsx`, `components/__tests__/GroupAssignmentsContent.test.tsx`.
- QA scenarios that name this address: admin 7, consultor 2, lider_comunidad 5.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass if has a community, else /dashboard |
| equipo_directivo | if has a community | pass if has a community, else /dashboard |
| lider_generacion | if has a community | pass if has a community, else /dashboard |
| lider_comunidad | if has a community | pass if has a community, else /dashboard |
| supervisor_de_red | if has a community | pass if has a community, else /dashboard |
| community_manager | if has a community | pass if has a community, else /dashboard |
| docente | if has a community | pass if has a community, else /dashboard |
| encargado_licitacion | if has a community | pass if has a community, else /dashboard |

### What the page file itself draws

**Titles** (19)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Selecciona una Comunidad» | h3 | `!currentWorkspace` | renderMainContent · l.671 |
| «Miembros de la Comunidad» | h2 | `!(!currentWorkspace)` | renderMainContent · l.687 |
| «Gestión de Comunidades» | h2 |  | renderMainContent · l.789 |
| «Sin Acceso al Espacio Colaborativo» | h3 | `error` | CommunityWorkspacePage · l.905 |
| «{currentWorkspace.custom_name} / {currentWorkspace.name}» | h1 | `currentWorkspace` | CommunityWorkspacePage · l.1009 |
| «{currentWorkspace.custom_name} / {currentWorkspace.name}» | h3 | `currentWorkspace && activeSection !== 'overview' && activeSection !== 'communities' && false` | CommunityWorkspacePage · l.1063 |
| «No hay espacio de trabajo seleccionado» | h3 | `!workspace` | MeetingsTabContent · l.1259 |
| «Reuniones de {workspace.community?.name}» | h2 |  | MeetingsTabContent · l.1274 |
| «No hay reuniones» | h3 | `!(loading) && !(meetings.length > 0)` | MeetingsTabContent · l.1364 |
| «No hay espacio de trabajo seleccionado» | h3 | `!workspace` | DocumentsTabContent · l.1807 |
| «Documentos en {currentFolder.folder_name} / Documentos» | h2 |  | DocumentsTabContent · l.1843 |
| «Cambiar nombre del documento» | h3 | `renameTarget` | DocumentsTabContent · l.1951 |
| «Mover documento» | h3 | `moveTargets` | DocumentsTabContent · l.2018 |
| «No hay espacio de trabajo seleccionado» | h3 | `!workspace` | MessagingTabContent · l.2800 |
| «Sin permisos de acceso» | h3 | `!permissions.can_view_messages` | MessagingTabContent · l.2814 |
| «Mensajería de {workspace.community?.name}» | h2 |  | MessagingTabContent · l.2829 |
| «{thread.thread_title}» | h3 | `(activeView === 'threads' \|\| !selectedThread) && !(loading) && threads.length > 0 && each filterThreadsBySearch(threads)` | MessagingTabContent · l.2887 |
| «No hay hilos de conversación» | h3 | `(activeView === 'threads' \|\| !selectedThread) && !(loading) && !(threads.length > 0)` | MessagingTabContent · l.2926 |
| «{selectedThread.thread_title}» | h3 | `!(activeView === 'threads' \|\| !selectedThread)` | MessagingTabContent · l.2953 |

**Buttons** (23)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{selectedCommunity?.display_name} / {selectedCommunity?.name} / Seleccionar Comunidad [{selectedCommunity.school_name} - {selectedCommunity.generation_name}]» | `{() => setShowCommunitySelector(!showCommunitySelector)}` |  |  |  | renderCommunitySelector · l.593 |
| «{community.display_name} / {community.name} {community.school_name} - {community.generation_name}» | `{() => handleCommunityChosen(community.id)}` | `showCommunitySelector && each workspaceAccess.availableCommunities` |  |  | renderCommunitySelector · l.618 |
| «[icon X]» · aria «Cerrar aviso» | `{() => setThreadLinkFailed(false)}` | `threadLinkFailed` |  | `testid=thread-link-unavailable-dismiss` | renderMainContent · l.654 |
| «[icon ChevronDownIcon]» |  | `!(!currentWorkspace)` |  |  | renderMainContent · l.704 |
| «Volver al Panel Principal» | `{() => router.push('/dashboard')}` | `error` |  |  | CommunityWorkspacePage · l.911 |
| «[icon Settings]» · tooltip «Editar nombre e imagen de la comunidad» | `{() => setShowWorkspaceSettings(true)}` | `currentWorkspace && ((canEditWorkspace \|\| workspaceAccess?.accessType === 'community_member' \|\| workspaceAccess?.accessType === 'admin'))` |  |  | CommunityWorkspacePage · l.1025 |
| «Configuración de la comunidad» | `{() => setShowWorkspaceSettings(true)}` | `currentWorkspace && activeSection !== 'overview' && activeSection !== 'communities' && false && canEditWorkspace` |  |  | CommunityWorkspacePage · l.1072 |
| «Nueva Reunión» | `{handleCreateMeeting}` | `canManage` |  |  | MeetingsTabContent · l.1283 |
| «{label}» | `{() => handleSortChange(field)}` | `each [ { field: 'meeting_date' as const, label: 'Fecha…` |  |  | MeetingsTabContent · l.1310 |
| «Crear Primera Reunión» | `{handleCreateMeeting}` | `!(loading) && !(meetings.length > 0) && canManage` |  |  | MeetingsTabContent · l.1373 |
| «Subir Documento» | `{() => setShowUploadModal(true)}` | `permissions.can_view` |  |  | DocumentsTabContent · l.1852 |
| «Mover» | `{() => openMoveDialog(documents.filter(doc => selectedDocuments.includes(doc.id)…}` | `selectedDocuments.length > 0` |  |  | DocumentsTabContent · l.1870 |
| «Descargar» | `{() => toast('Descargar múltiples próximamente', { icon: 'ℹ️' })}` | `selectedDocuments.length > 0` |  |  | DocumentsTabContent · l.1876 |
| «Cancelar» | `{() => setSelectedDocuments([])}` | `selectedDocuments.length > 0` |  |  | DocumentsTabContent · l.1882 |
| «[icon X]» | `{() => setRenameTarget(null)}` | `renameTarget` | `{actionBusy}` |  | DocumentsTabContent · l.1954 |
| «Cancelar» | `{() => setRenameTarget(null)}` | `renameTarget` | `{actionBusy}` |  | DocumentsTabContent · l.1981 |
| «Guardar» (submits the form) |  | `renameTarget` | `{actionBusy}` | `testid=document-rename-save` | DocumentsTabContent · l.1989 |
| «[icon X]» | `{() => setMoveTargets(null)}` | `moveTargets` | `{actionBusy}` |  | DocumentsTabContent · l.2021 |
| «Cancelar» | `{() => setMoveTargets(null)}` | `moveTargets` | `{actionBusy}` |  | DocumentsTabContent · l.2046 |
| «Mover» | `{() => void handleMoveSave()}` | `moveTargets` | `{actionBusy}` | `testid=document-move-save` | DocumentsTabContent · l.2054 |
| «Nuevo Hilo» | `{() => setShowThreadCreationModal(true)}` | `permissions.can_create_threads` |  |  | MessagingTabContent · l.2838 |
| «Crear Primer Hilo» | `{() => setShowThreadCreationModal(true)}` | `(activeView === 'threads' \|\| !selectedThread) && !(loading) && !(threads.length > 0) && permissions.can_create_threads` |  |  | MessagingTabContent · l.2935 |
| «[icon X]» | `{() => { setSelectedThread(null); setActiveView('threads'); }}` | `!(activeView === 'threads' \|\| !selectedThread)` |  |  | MessagingTabContent · l.2956 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{member.first_name?.charAt(0)} / U {member.last_name?.charAt(0)} {member.first_name} {member.last_name} / {member.email} / Usuario sin nombre {member.user_roles?.map((role: any) …}» | `/user/[*]` | `showMembers && !(membersError) && communityMembers.length > 0 && each communityMembers` |  | renderMainContent · l.722 |

**Other things that react to a click** (2)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «Miembros de la Comunidad ( — / {communityMembers.length} ) [Error al cargar]» | `{() => setShowMembers(!showMembers)}` | `!(!currentWorkspace)` | renderMainContent · l.682 |
| `div` | «{thread.thread_title} {thread.category_config.label} [{thread.description}] Por {thread.creator_name} {thread.message_c…» | `{() => handleThreadSelect(thread)}` | `(activeView === 'threads' \|\| !selectedThread) && !(loading) && threads.length > 0 && each filterThreadsBySearch(threads)` | MessagingTabContent · l.2881 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre del documento» | text | `maxLength={200}` |  | `renameTarget` | `testid=document-rename-input` | DocumentsTabContent · l.1969 |
| «Carpeta de destino» | select |  | «Sin carpeta», «(lista) {folder.folder_name}» | `moveTargets` | `testid=document-move-folder` | DocumentsTabContent · l.2030 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {`${member.first_name} ${member.last_name}`} · {member.avatar_url} | `!(membersError) && communityMembers.length > 0 && each communityMembers && member.avatar_url` |  | renderMainContent · l.728 |
| img · alt {currentWorkspace.custom_name \|\| currentWorkspace.name} · {currentWorkspace.image_url} | `currentWorkspace && currentWorkspace.image_url` |  | CommunityWorkspacePage · l.998 |
| img · alt {currentWorkspace.custom_name \|\| currentWorkspace.name} · {currentWorkspace.image_url} | `currentWorkspace && activeSection !== 'overview' && activeSection !== 'communities' && false && currentWorkspace.image_url` |  | CommunityWorkspacePage · l.1052 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => { e.preventDefault(); void handleRenameSave(); }}` | `renameTarget` | DocumentsTabContent · l.1962 |

**Pop-ups** (14)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `WorkspaceSettingsModal` | component | `{showWorkspaceSettings}` |  | CommunityWorkspacePage · l.1096 |
| `MeetingDocumentationModal` | component | `{showCreateModal}` |  | MeetingsTabContent · l.1386 |
| `MeetingDetailsModal` | component | `{showDetailsModal}` |  | MeetingsTabContent · l.1404 |
| `MeetingDeletionModal` | component | `{showDeleteModal}` |  | MeetingsTabContent · l.1422 |
| `DocumentUploadModal` | component | `{showUploadModal}` |  | DocumentsTabContent · l.1911 |
| `DocumentPreview` | component | `{showPreviewModal}` |  | DocumentsTabContent · l.1924 |
| «Cambiar nombre del documento» | written in this file | `renameTarget` |  | DocumentsTabContent · l.1938 |
| «Cambiar nombre del documento» | written in this file | `renameTarget` |  | DocumentsTabContent · l.1942 |
| «Mover documento» | written in this file | `moveTargets` |  | DocumentsTabContent · l.2005 |
| «Mover documento» | written in this file | `moveTargets` |  | DocumentsTabContent · l.2009 |
| `ConfirmModal` | component | `{true}` | title: Eliminar documento · message: El documento «{deleteTarget.title}» dejará de verse en este espacio. ¿Continuar? · confirmText: Eliminar · cancelText: Cancelar | DocumentsTabContent · l.2071 |
| `AttachmentPreview` | component | `{showAttachmentPreview}` |  | MessagingTabContent · l.3017 |
| `ThreadCreationModal` | component | `{showThreadCreationModal}` |  | MessagingTabContent · l.3034 |
| `ConfirmModal` | component | `{showDeleteConfirm}` | title: Eliminar mensaje · message: ¿Estás seguro de que deseas eliminar este mensaje? Esta acción no se puede deshacer. · confirmText: Eliminar · cancelText: Cancelar | MessagingTabContent · l.3043 |

**Toasts** (43)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No se pudieron cargar los miembros de la comunidad. Intenta nuevamente.» | `membersErrorToastRef.current !== communityId` | notifyError · l.212 |
| error | «Error al cargar el espacio colaborativo» |  | initializeWorkspace · l.412 |
| error | «No se pudo cargar el espacio de trabajo» | `!(workspace)` | loadWorkspace · l.439 |
| error | «Error al cargar el espacio de trabajo» |  | loadWorkspace · l.444 |
| success | «Configuración actualizada» | `currentWorkspace` | CommunityWorkspacePage · l.1110 |
| error | «Error al cargar las reuniones» |  | loadMeetings · l.1181 |
| error | «Error al cargar los documentos» |  | loadDocuments · l.1554 |
| success | «Carpeta creada exitosamente» |  | handleCreateFolder · l.1633 |
| error | «Error al crear la carpeta» |  | handleCreateFolder · l.1636 |
| error | «Tu sesión expiró. Vuelve a iniciar sesión para descargar el documento.» | `action === 'download' && !session?.access_token` | handleDocumentAction · l.1668 |
| loading | «Preparando descarga...» | `action === 'download'` | handleDocumentAction · l.1672 |
| success | «Descarga completada» | `action === 'download'` | handleDocumentAction · l.1681 |
| error | «Tu sesión expiró. Vuelve a iniciar sesión para descargar el documento.» | `action === 'download' && (error as { reason?: string } \| null)?.reason === 'session'` | handleDocumentAction · l.1685 |
| error | «No se pudo abrir el documento. Inténtalo de nuevo.» | `action === 'download' && !((error as { reason?: string } \| null)?.reason === 'session')` | handleDocumentAction · l.1688 |
| plain | «Compartir documentos próximamente» | `action === 'share'` | handleDocumentAction · l.1708 |
| success | «Nombre actualizado» |  | handleRenameSave · l.1733 |
| error | «{(error as Error).message}» |  | handleRenameSave · l.1736 |
| success | «Documento movido» | `!moveBulk` | handleMoveSave · l.1751 |
| error | «{(error as Error).message}» | `!moveBulk` | handleMoveSave · l.1753 |
| success | «{moved} documento(s) movido(s)» | `!(!moveBulk) && refused === 0` | handleMoveSave · l.1770 |
| error | «{moved} documento(s) movido(s). {refused} no se pudieron mover: solo quien los subió o el líder de la comunidad puede moverlos.» | `!(!moveBulk) && !(refused === 0)` | handleMoveSave · l.1772 |
| success | «Documento eliminado» |  | handleHideConfirm · l.1785 |
| error | «{(error as Error).message}» |  | handleHideConfirm · l.1788 |
| success | «{uploadedDocuments.length} documento(s) subido(s) exitosamente» |  | handleUploadComplete · l.1796 |
| plain | «Descargar múltiples próximamente» | `selectedDocuments.length > 0` | DocumentsTabContent · l.1877 |
| error | «Error al cargar los hilos de conversación» |  | loadThreads · l.2265 |
| error | «Error al cargar los mensajes» |  | loadThreadMessages · l.2282 |
| success | «Hilo de conversación creado exitosamente» |  | handleThreadCreate · l.2451 |
| error | «No se pudo crear la conversación. Tu texto sigue aquí; inténtalo de nuevo.» | `typeof error?.threadId === 'string'` | handleThreadCreate · l.2457 |
| error | «Error al crear el hilo: {error?.message \|\| 'Error de…}» | `!(typeof error?.threadId === 'string')` | handleThreadCreate · l.2459 |
| success | «Mensaje enviado» | `failedAttachments.length === 0` | handleMessageSend · l.2529 |
| error | «Mensaje enviado, pero no se adjuntó: {names.join(', ')}. / {names.length > 1 ? 'Adjúnta…} en un nuevo mensaje.» |  | handleMessageSend · l.2533 |
| error | «Error al enviar el mensaje» |  | handleMessageSend · l.2544 |
| loading | «Preparando descarga...» | `attachment.storage_path` | handleAttachmentDownload · l.2566 |
| success | «Descarga completada» | `attachment.storage_path` | handleAttachmentDownload · l.2594 |
| success | «Mensaje editado» |  | handleSaveEdit · l.2643 |
| error | «Error al editar el mensaje» |  | handleSaveEdit · l.2646 |
| error | «Error al quitar la reacción» | `existingReaction && deleteError` | handleReaction · l.2680 |
| error | «Error al agregar la reacción» | `!(existingReaction) && insertError` | handleReaction · l.2710 |
| error | «Error al procesar la reacción» |  | handleReaction · l.2755 |
| error | «Error al eliminar el mensaje» | `error` | confirmDeleteMessage · l.2779 |
| success | «Mensaje eliminado» |  | confirmDeleteMessage · l.2786 |
| error | «Error al eliminar el mensaje» |  | confirmDeleteMessage · l.2789 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «No tienes acceso a ningún espacio colaborativo. Contacta al administrador.» | `setError` | `!access.canAccess` | initializeWorkspace · l.376 |
| «Error al cargar el espacio colaborativo» | `setError` |  | initializeWorkspace · l.411 |
| «No se pudo cargar el espacio de trabajo» | `setError` | `!(workspace)` | loadWorkspace · l.438 |
| «Error al cargar el espacio de trabajo» | `setError` |  | loadWorkspace · l.443 |

**Downloads and printing** (2)

| How | When | Where |
|---|---|---|
| `window.URL.createObjectURL()` | `attachment.storage_path` | handleAttachmentDownload · l.2583 |
| `archivo: {attachment.file_name}` | `attachment.storage_path` | handleAttachmentDownload · l.2587 |

**Moves to another page from code** (8)

| Goes to | How | When | Where |
|---|---|---|---|
| `/mi-aprendizaje/tareas[*]` | `router.replace` | `urlSection === 'group-assignments'` | CommunityWorkspacePage · l.274 |
| `/login` | `location.href` | `!(!authLoading && user) && !authLoading && !user` | CommunityWorkspacePage · l.351 |
| `[*][*]` | `router.replace` | `typeof window !== 'undefined' && params.has('thread')` | handleCommunityChosen · l.473 |
| `/dashboard` | `router.push` | `error` | CommunityWorkspacePage · l.912 |
| `{downloadUrl}` | `window.location.assign` | `action === 'download'` | handleDocumentAction · l.1680 |
| `{attachment.storage_path}` | `window.open` | `attachment.storage_path && !session?.access_token` | handleAttachmentDownload · l.2562 |
| `{attachment.storage_path}` | `window.open` | `attachment.storage_path && !response.ok` | handleAttachmentDownload · l.2578 |
| `{attachment.storage_path}` | `window.open` | `attachment.storage_path` | handleAttachmentDownload · l.2598 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!workspaceAccess?.canAccess` | CommunityWorkspacePage · l.301 |
| `startedForUserRef.current === user.id` | CommunityWorkspacePage · l.340 |
| `!targetThreadId \|\| !workspace \|\| loading` | MessagingTabContent · l.2232 |

**Pieces placed here, with the texts and settings handed to them** (17)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `FeedContainer` | userName: Usuario | `!(!currentWorkspace)` |  | renderMainContent · l.777 |
| `WorkspaceSessionsTab` |  |  |  | renderMainContent · l.819 |
| `MainLayout` |  | `authLoading \|\| loading` |  | CommunityWorkspacePage · l.871 |
| `LoadingSkeleton` |  | `authLoading \|\| loading` |  | CommunityWorkspacePage · l.882 |
| `MainLayout` |  | `error` |  | CommunityWorkspacePage · l.890 |
| `MainLayout` |  |  |  | CommunityWorkspacePage · l.970 |
| `ResponsiveFunctionalPageHeader` | title: Espacio Colaborativo · subtitle: {selectedCommunity.name} • {selectedCommunity.school_na…} / Herramientas de colaboración para comunidades · searchPlaceholder: Buscar en documentos, mensajes, reuniones... |  |  | CommunityWorkspacePage · l.979 |
| `HelpButton` | sectionId: espacio-colaborativo |  |  | CommunityWorkspacePage · l.987 |
| `WorkspaceTabNavigation` |  |  |  | CommunityWorkspacePage · l.1039 |
| `MeetingFilters` |  |  |  | MeetingsTabContent · l.1294 |
| `MeetingCard` |  | `!(loading) && meetings.length > 0 && each filterMeetingsBySearch(meetings)` |  | MeetingsTabContent · l.1348 |
| `FolderNavigation` |  |  |  | DocumentsTabContent · l.1820 |
| `DocumentFilters` |  |  |  | DocumentsTabContent · l.1830 |
| `DocumentGrid` |  |  |  | DocumentsTabContent · l.1894 |
| `MessageFilters` |  |  |  | MessagingTabContent · l.2849 |
| `MessageCard` |  | `(!(activeView === 'threads' \|\| !selectedThread)) && messages.length > 0 && each messages` |  | MessagingTabContent · l.2972 |
| `MessageComposer` |  | `(!(activeView === 'threads' \|\| !selectedThread)) && permissions.can_send_messages` |  | MessagingTabContent · l.2996 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `communityParam` | «?communityId={query.communityId}&from=workspace / ?from=workspace» | CommunityWorkspacePage · l.273 |
| `breadcrumbs` | «Espacio Colaborativo» | getBreadcrumbs · l.947 |
| `renderMainContent()` | «Administrador», «Consultor», «Equipo Directivo», «Líder de Generación», «Líder de Comunidad», «Docente» | renderMainContent · l.750 |
| `getPageTitle()` | «Vista General - Espacio Colaborativo», «Gestión de Comunidades», «Reuniones», «Documentos», «Mensajería», «Espacio Colaborativo» | getPageTitle · l.937 |

**Other texts written in the code (safety net: not tied to an element by the script)** (16)

| Text | Where |
|---|---|
| «Administrador» | CommunityWorkspacePage · l.750 |
| «Consultor» | CommunityWorkspacePage · l.751 |
| «Equipo Directivo» | CommunityWorkspacePage · l.752 |
| «Líder de Generación» | CommunityWorkspacePage · l.753 |
| «Líder de Comunidad» | CommunityWorkspacePage · l.754 |
| «Docente» | CommunityWorkspacePage · l.755 |
| «Vista General - Espacio Colaborativo» | CommunityWorkspacePage · l.937 |
| «Fecha» | MeetingsTabContent · l.1305 |
| «Título» | MeetingsTabContent · l.1306 |
| «Estado» | MeetingsTabContent · l.1307 |
| «Creación» | MeetingsTabContent · l.1308 |
| «Usuario desconocido» | DocumentsTabContent · l.1541 |
| «Error desconocido» | MessagingTabContent · l.2459 |
| «Adjúntalos» | MessagingTabContent · l.2535 |
| «Adjúntalo» | MessagingTabContent · l.2535 |
| «Bearer {session.access_token}» | MessagingTabContent · l.2572 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: workspace-sidebar-collapsed` | CommunityWorkspacePage · l.257 |
| listener | `window.addEventListener('resize')` | CommunityWorkspacePage · l.291 |
| storage | `sessionStorage: workspace_return_community` | initializeWorkspace · l.387 |
| role | `role=alert` | renderMainContent · l.648 |
| mark | `testid=thread-link-unavailable` | renderMainContent · l.648 |
| mark | `testid=document-delete-confirm` | DocumentsTabContent · l.2070 |
| address value | `?thread` | l.1 |

**Values shown from data** (10)

- `( — / {communityMembers.length} )` — renderMainContent · l.690, when `!(!currentWorkspace)`
- `{error}` — CommunityWorkspacePage · l.908, when `error`
- `{selectedCommunity?.school_name} • {selectedCommunity?.generation_name}` — CommunityWorkspacePage · l.1012, when `currentWorkspace`
- `{renderCommunitySelector()}` — CommunityWorkspacePage · l.1016, when `currentWorkspace && workspaceAccess && workspaceAccess.availableCommunities.length > 1`
- `{currentWorkspace.community?.school?…} - {currentWorkspace.community?.generat…}` — CommunityWorkspacePage · l.1066, when `currentWorkspace && activeSection !== 'overview' && activeSection !== 'communities' && false`
- `{renderMainContent()}` — CommunityWorkspacePage · l.1089
- `{thread.category_config.label}` — MessagingTabContent · l.2888, when `(activeView === 'threads' \|\| !selectedThread) && !(loading) && threads.length > 0 && each filterThreadsBySearch(threads)`
- `{thread.description}` — MessagingTabContent · l.2900, when `!(loading) && threads.length > 0 && each filterThreadsBySearch(threads) && thread.description`
- `{thread.latest_message.author_name} :` — MessagingTabContent · l.2916, when `!(loading) && threads.length > 0 && each filterThreadsBySearch(threads) && thread.latest_message`
- `{thread.latest_message.content.slice…} ...` — MessagingTabContent · l.2917, when `!(loading) && threads.length > 0 && each filterThreadsBySearch(threads) && thread.latest_message`

**Other texts on screen** (27)

- «No pudimos abrir la conversación del enlace. Puede que ya no exista o que no tengas acceso a ella.» — renderMainContent · l.653, when `threadLinkFailed`
- «Elige una comunidad de crecimiento para acceder a su espacio colaborativo.» — renderMainContent · l.675, when `!currentWorkspace`
- «No se pudieron cargar los miembros de la comunidad» (title) — renderMainContent · l.694, when `!(!currentWorkspace) && membersError`
- «Error al cargar» — renderMainContent · l.699, when `!(!currentWorkspace) && membersError`
- «No se pudieron cargar los miembros de la comunidad.» — renderMainContent · l.714, when `!(!currentWorkspace) && showMembers && membersError`
- «Revisa tu conexión e inténtalo nuevamente.» — renderMainContent · l.716, when `!(!currentWorkspace) && showMembers && membersError`
- «Tú» (title) — renderMainContent · l.762, when `!(membersError) && communityMembers.length > 0 && each communityMembers && member.id === user?.id`
- «No hay otros miembros en esta comunidad aún.» — renderMainContent · l.769, when `!(!currentWorkspace) && showMembers && !(membersError) && !(communityMembers.length > 0)`
- «Administra las comunidades de crecimiento bajo tu supervisión.» — renderMainContent · l.793
- «🚧 Gestión de comunidades en desarrollo. Próximamente podrás administrar múltiples comunidades desde aquí.» — renderMainContent · l.797
- «Selecciona una comunidad para ver sus reuniones.» — MeetingsTabContent · l.1263, when `!workspace`
- «Documentación y seguimiento de reuniones» — MeetingsTabContent · l.1278
- «Ordenar por:» — MeetingsTabContent · l.1302
- «Comienza creando la primera reunión de la comunidad. / No se han programado reuniones en esta comunidad.» — MeetingsTabContent · l.1367, when `!(loading) && !(meetings.length > 0)`
- «Selecciona una comunidad para ver sus documentos.» — DocumentsTabContent · l.1811, when `!workspace`
- «{documents.length} documento(s) • {folders.length} carpeta(s)» — DocumentsTabContent · l.1846
- «{selectedDocuments.length} documento(s) seleccionados» — DocumentsTabContent · l.1866, when `selectedDocuments.length > 0`
- «Selecciona una comunidad para acceder a la mensajería.» — MessagingTabContent · l.2804, when `!workspace`
- «No tienes permisos para ver los mensajes de esta comunidad.» — MessagingTabContent · l.2818, when `!permissions.can_view_messages`
- «Comunicación en tiempo real con los miembros de la comunidad» — MessagingTabContent · l.2833
- «Por {thread.creator_name}» — MessagingTabContent · l.2904, when `(activeView === 'threads' \|\| !selectedThread) && !(loading) && threads.length > 0 && each filterThreadsBySearch(threads)`
- «{thread.message_count} mensaje(s)» — MessagingTabContent · l.2906, when `(activeView === 'threads' \|\| !selectedThread) && !(loading) && threads.length > 0 && each filterThreadsBySearch(threads)`
- «{thread.participant_count} participante(s)» — MessagingTabContent · l.2907, when `(activeView === 'threads' \|\| !selectedThread) && !(loading) && threads.length > 0 && each filterThreadsBySearch(threads)`
- «Último: {new Date(thread.latest_message.crea…}» — MessagingTabContent · l.2909, when `!(loading) && threads.length > 0 && each filterThreadsBySearch(threads) && thread.latest_message`
- «Comienza creando el primer hilo de conversación. / No se han creado hilos de conversación en esta comunidad.» — MessagingTabContent · l.2929, when `(activeView === 'threads' \|\| !selectedThread) && !(loading) && !(threads.length > 0)`
- «{selectedThread.message_count} mensaje(s)» — MessagingTabContent · l.2954, when `!(activeView === 'threads' \|\| !selectedThread)`
- «No hay mensajes en este hilo» — MessagingTabContent · l.2988, when `(!(activeView === 'threads' \|\| !selectedThread)) && !(messages.length > 0)`

**Reads and writes the database directly:** `table:community_messages` (update), `table:message_reactions` (delete, insert, select), `table:message_threads` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/common/ConfirmModal.tsx`
- `components/community/WorkspaceSettingsModal.tsx`
- `components/community/WorkspaceSettingsNuevo.tsx`
- `components/community/useWorkspaceSettings.ts`
- `components/documents/DocumentFilters.tsx`
- `components/documents/DocumentGrid.tsx`
- `components/documents/DocumentPreview.tsx`
- `components/documents/DocumentUploadModal.tsx`
- `components/documents/FolderNavigation.tsx`
- `components/feed/CommentModal.tsx`
- `components/feed/CommentThread.tsx`
- `components/feed/ConfirmationModal.tsx`
- `components/feed/CreatePostModal.tsx`
- `components/feed/FeedContainer.tsx`
- `components/feed/MentionList.tsx`
- `components/feed/PostCard.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `components/meetings/AttachmentRow.tsx`
- `components/meetings/FinalizeMeetingDialog.tsx`
- `components/meetings/MeetingCard.tsx`
- `components/meetings/MeetingDeletionModal.tsx`
- `components/meetings/MeetingDetailsModal.tsx`
- `components/meetings/MeetingDocumentationModal.tsx`
- `components/meetings/MeetingFilters.tsx`
- `components/meetings/MeetingModalFooter.tsx`
- `components/meetings/RichTextView.tsx`
- `components/meetings/TaskTracker.tsx`
- `components/meetings/WorkSessionBanner.tsx`
- `components/meetings/persistMeeting.ts`
- `components/messaging/AttachmentPreview.tsx`
- `components/messaging/MentionPicker.tsx`
- `components/messaging/MessageCard.tsx`
- `components/messaging/MessageComposer.tsx`
- `components/messaging/MessageFilters.tsx`
- `components/messaging/ThreadCreationModal.tsx`
- `components/tutorials/HelpButton.tsx`
- `components/tutorials/HelpDrawer.tsx`
- `components/tutorials/VimeoEmbed.tsx`
- `components/ui/dialog.tsx`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/Field.tsx`
- `components/workspace/WorkspaceSessionsTab.tsx`
- `components/workspace/WorkspaceTabNavigation.tsx`
- `lib/colorAlpha.ts`
- `lib/community/fetchCommunityMembers.ts`
- `lib/meetings/audience-labels.ts`
- `lib/meetings/constants.ts`
- `lib/meetings/meeting-documents.ts`
- `lib/meetings/meeting-save.ts`
- `lib/profile-cards.ts`
- `lib/services/communityWorkspace.js`
- `lib/services/feedService.ts`
- `lib/tutorials/content.ts`
- `lib/utils/file-format.ts`
- `lib/utils/profile-name.ts`
- `lib/utils/session-ui-helpers.tsx`
- `src/components/TipTapEditor.tsx`
- `types/activity.ts`
- `types/documents.ts`
- `types/meetings.ts`
- `types/messaging.ts`
- `types/roles.ts`
- `utils/documentUtils.ts`
- `utils/meetingDeletion.ts`
- `utils/meetingUtils.ts`
- `utils/messagingUtils-simple.ts`
- `utils/messagingUtils.ts`
- `utils/navigationManager.ts`
- `utils/roleUtils.ts`
- `utils/storage.js`
- `utils/workspaceUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/community/documents/[id]/link` | ? | `utils/documentUtils.ts:620` |
| `/api/community/ensure-workspace` | POST | `utils/workspaceUtils.ts:390` |
| `/api/community/members` | GET | `lib/community/fetchCommunityMembers.ts:45`, `pages/community/workspace.tsx:227` |
| `/api/community/search-users` | GET | `components/feed/CreatePostModal.tsx:62` |
| `/api/community/workspace-message-notifications` | POST | `utils/messagingUtils-simple.ts:896` |
| `/api/meetings/[id]/autosave` | POST | `components/meetings/MeetingDocumentationModal.tsx:733` |
| `/api/meetings/[id]/finalize` | POST | `components/meetings/FinalizeMeetingDialog.tsx:151` |
| `/api/meetings/[id]/recipients` | GET | `components/meetings/FinalizeMeetingDialog.tsx:118` |
| `/api/meetings/[id]/work-session/[sessionId]/end` | ? | `components/meetings/MeetingDocumentationModal.tsx:458` |
| `/api/meetings/[id]/work-session/start` | POST | `components/meetings/MeetingDocumentationModal.tsx:671` |
| `/api/meetings/delete` | POST | `utils/meetingDeletion.ts:52` |
| `/api/messaging/mention` | POST | `lib/services/feedService.ts:365` |
| `/api/sessions` | GET | `components/workspace/WorkspaceSessionsTab.tsx:124` |
| `/api/storage/download` | ? | `pages/community/workspace.tsx:2568` |

## /user/[userId]

File `pages/user/[userId].tsx` · 392 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.36 `router.push → /login  (when !session?.user)`
  - l.52 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.74 `router.push → /login`
  - l.132 `roles = await getUserRoles(supabase, targetUserId)`
  - l.189 `router.push → /login`
  - l.227 `El perfil que buscas no existe o no tienes permisos para verlo.`
- Linked from: `components/community/MemberProfileModal.tsx:166`, `components/community/MemberProfileModal.tsx:167`, `components/community/MemberProfileNuevo.tsx:45`, `middleware.ts:364`, `pages/community/workspace.tsx:722`, `pages/community/workspace.tsx:724`
- Tests: browser tests that CI runs: `tests/e2e/look-panel.spec.ts`; browser tests CI skips: `tests/e2e/sentry-replay-disabled.spec.ts`; unit tests of the page: `__tests__/pages/user-profile-view.test.tsx`.

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

### What the page file itself draws

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Usuario no encontrado» | h1 | `!profileData` | UserProfileView · l.226 |
| «{profileData.first_name} {profileData.last_name}» | h1 |  | UserProfileView · l.291 |
| «Información de Contacto» | h3 | `!cardOnly` | UserProfileView · l.305 |
| «Roles» | h3 | `!cardOnly` | UserProfileView · l.321 |
| «Cursos Asignados ( {enrolledCourses.length} )» | h2 | `!cardOnly` | UserProfileView · l.348 |
| «{course.title}» | h3 | `!cardOnly && enrolledCourses.length > 0 && each enrolledCourses` | UserProfileView · l.369 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver al Panel» | `/dashboard` | `!profileData` |  | UserProfileView · l.228 |
| «Volver al Panel» | `/dashboard` |  |  | UserProfileView · l.263 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {`${profileData.first_name} ${profileData.last_name}`} · {profileData.avatar_url} | `profileData.avatar_url` |  | UserProfileView · l.278 |
| img · alt {course.title} · {course.thumbnail_url} | `!cardOnly && enrolledCourses.length > 0 && each enrolledCourses && course.thumbnail_url` |  | UserProfileView · l.358 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.36 |
| `/login` | `router.push` |  | checkSession · l.74 |
| `/login` | `router.push` |  | handleLogout · l.189 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkSession · l.52 |
| `roles = await getUserRoles(supabase, targetUserId)` | loadUserProfile · l.132 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | UserProfileView · l.194 |
| `MainLayout` |  | `!profileData` |  | UserProfileView · l.215 |
| `MainLayout` |  |  |  | UserProfileView · l.242 |
| `ResponsiveFunctionalPageHeader` | title: {profileData.first_name} {profileData.last_name} · subtitle: Perfil de usuario |  |  | UserProfileView · l.255 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin instructor» | UserProfileView · l.167 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.187 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.188 |
| address value | `[userId] (part of the address)` | l.1 |

**Values shown from data** (3)

- `{profileData.first_name?.charAt(0)} {profileData.last_name?.charAt(0)}` — UserProfileView · l.285, when `!(profileData.avatar_url)`
- `{profileData.email}` — UserProfileView · l.295, when `!cardOnly`
- `{course.description}` — UserProfileView · l.370, when `!cardOnly && enrolledCourses.length > 0 && each enrolledCourses`

**Other texts on screen** (10)

- «Cargando...» — UserProfileView · l.206, when `loading`
- «El perfil que buscas no existe o no tienes permisos para verlo.» — UserProfileView · l.227, when `!profileData`
- «{profileData.first_name} {profileData.last_name} - Genera» — UserProfileView · l.252
- «Email:» — UserProfileView · l.308, when `!cardOnly && !cardOnly`
- «Institución:» — UserProfileView · l.311, when `!cardOnly && profileData.school`
- «Descripción:» — UserProfileView · l.314, when `!cardOnly && profileData.description`
- «[Administrador Global] [Consultor FNE] [Equipo Directivo] [Líder de Generación] [Líder de Comunidad] [Docente]» — UserProfileView · l.325, when `!cardOnly && userRoles.length > 0 && each userRoles`
- «Sin roles asignados» — UserProfileView · l.336, when `!cardOnly && !(userRoles.length > 0)`
- «Instructor:» — UserProfileView · l.372, when `!cardOnly && enrolledCourses.length > 0 && each enrolledCourses`
- «Este usuario no tiene cursos asignados actualmente.» — UserProfileView · l.384, when `!cardOnly && !(enrolledCourses.length > 0)`

**Reads and writes the database directly:** `table:course_assignments` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `lib/profile-cards.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/users/[userId]/school` | GET | `pages/user/[userId].tsx:118` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/common/ConfirmModal.tsx

Used by: `/community/workspace`

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

### components/community/WorkspaceSettingsModal.tsx

Used by: `/community/workspace`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Configuración de la Comunidad» | h3 |  | WorkspaceSettingsModal · l.52 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  | `{isLoading}` |  | WorkspaceSettingsModal · l.55 |
| «[icon X]» | `{handleRemoveImage}` | `canChangePicture && imagePreview` |  |  | WorkspaceSettingsModal · l.100 |
| «Cancelar» | `{onClose}` |  | `{isLoading}` |  | WorkspaceSettingsModal · l.146 |
| «Guardando... / Guardar cambios» | `{handleSave}` |  | `{saveDisabled}` |  | WorkspaceSettingsModal · l.153 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre de la Comunidad» | text | «Ingresa un nombre personalizado» · `maxLength={100}` |  |  |  | WorkspaceSettingsModal · l.70 |
| «Subir imagen» | file | accepts `image/jpeg,image/jpg,image/png,image/webp` |  | `canChangePicture` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=community-image-upload (id used by code)` | WorkspaceSettingsModal · l.117 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Vista previa · {imagePreview} | `canChangePicture && imagePreview` |  | WorkspaceSettingsModal · l.95 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `WorkspaceSettingsNuevo` | component | `{isOpen}` |  | WorkspaceSettingsModal · l.44 |
| «Configuración de la Comunidad» | written in this file |  |  | WorkspaceSettingsModal · l.49 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | WorkspaceSettingsModal · l.46 |

**Other texts on screen** (6)

- «Nombre de la Comunidad» (label) — WorkspaceSettingsModal · l.67
- «Cualquier miembro puede cambiar el nombre del grupo» — WorkspaceSettingsModal · l.79
- «Imagen de la Comunidad» (label) — WorkspaceSettingsModal · l.86, when `canChangePicture`
- «Subir imagen» (label) — WorkspaceSettingsModal · l.125, when `canChangePicture`
- «Máx. 5MB (JPEG, PNG, WebP)» — WorkspaceSettingsModal · l.133, when `canChangePicture`
- «La imagen la cambian los administradores y el gestor de la comunidad.» — WorkspaceSettingsModal · l.138, when `canChangePicture`

### components/community/WorkspaceSettingsNuevo.tsx

Used by: `/community/workspace`

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{onClose}` |  | `{isLoading}` | `testid=workspace-settings-cancel` | WorkspaceSettingsNuevo · l.48 |
| «Guardando... / Guardar cambios» | `{handleSave}` |  | `{saveDisabled}` | `testid=workspace-settings-save` | WorkspaceSettingsNuevo · l.51 |
| «[icon X]» · tooltip «Quitar imagen» · aria «Quitar imagen» | `{handleRemoveImage}` | `canChangePicture && imagePreview` |  | `testid=workspace-settings-remove-image` | WorkspaceSettingsNuevo · l.77 |
| «Subir imagen» | `{() => fileInputRef.current?.click()}` | `canChangePicture` |  | `testid=workspace-settings-upload` | WorkspaceSettingsNuevo · l.102 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Ingresa un nombre personalizado» | text | «Ingresa un nombre personalizado» · `maxLength={100}` |  |  | `testid=workspace-settings-name` | WorkspaceSettingsNuevo · l.58 |
|  | file | accepts `image/jpeg,image/jpg,image/png,image/webp` |  | `canChangePicture` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=community-image-upload` | WorkspaceSettingsNuevo · l.94 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Vista previa · {imagePreview} | `canChangePicture && imagePreview` |  | WorkspaceSettingsNuevo · l.76 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{isOpen}` | eyebrow: Mi Comunidad de Crecimiento · title: Configuración de la Comunidad | WorkspaceSettingsNuevo · l.39 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Field` | label: Nombre de la Comunidad · help: Cualquier miembro puede cambiar el nombre del grupo |  |  | WorkspaceSettingsNuevo · l.57 |
| `X` | aria-hidden: true | `canChangePicture && imagePreview` |  | WorkspaceSettingsNuevo · l.85 |
| `Camera` | aria-hidden: true | `canChangePicture && !(imagePreview)` |  | WorkspaceSettingsNuevo · l.90 |
| `Upload` | aria-hidden: true | `canChangePicture` |  | WorkspaceSettingsNuevo · l.103 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=group` | WorkspaceSettingsNuevo · l.69 |

**Other texts on screen** (3)

- «Imagen de la Comunidad» — WorkspaceSettingsNuevo · l.71, when `canChangePicture`
- «Máx. 5MB (JPEG, PNG, WebP)» — WorkspaceSettingsNuevo · l.107, when `canChangePicture`
- «La imagen la cambian los administradores y el gestor de la comunidad.» — WorkspaceSettingsNuevo · l.112, when `canChangePicture`

### components/community/useWorkspaceSettings.ts

Used by: `/community/workspace`

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «La imagen debe ser menor a 5MB» | `file.size > 5 * 1024 * 1024` | handleImageSelect · l.53 |
| error | «Solo se permiten imágenes (JPEG, PNG, WebP)» | `!allowedTypes.includes(file.type)` | handleImageSelect · l.60 |
| error | «{renameError}» | `nameChanged && renameError` | handleSave · l.147 |
| success | «Configuración actualizada exitosamente» |  | handleSave · l.155 |
| error | «Error al guardar la configuración» |  | handleSave · l.160 |

### components/documents/DocumentFilters.tsx

Used by: `/community/workspace`

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{() => updateFilters({ search: '' })}` | `filters.search` |  |  | DocumentFilters · l.133 |
| «Cuadrícula» | `{() => onViewModeChange('grid')}` |  |  |  | DocumentFilters · l.144 |
| «Lista» | `{() => onViewModeChange('list')}` |  |  |  | DocumentFilters · l.155 |
| «Filtros [{activeFilterCount}]» | `{() => setShowAdvancedFilters(!showAdvancedFilters)}` |  |  |  | DocumentFilters · l.169 |
| «Limpiar» | `{clearFilters}` | `activeFilterCount > 0` |  |  | DocumentFilters · l.193 |
| «{tag}» | `{() => addTagFilter(tag)}` | `showAdvancedFilters && availableTags.length > 0 && each availableTags .filter(tag => !filters.tags?.inclu…` |  |  | DocumentFilters · l.240 |
| «[icon X]» | `{() => removeTagFilter(tag)}` | `showAdvancedFilters && filters.tags && filters.tags.length > 0 && each filters.tags` |  |  | DocumentFilters · l.261 |
| «Descendente / Ascendente» | `{() => updateFilters({ sort_order: filters.sort_order === 'asc' ? 'desc' : 'asc'…}` | `showAdvancedFilters` |  |  | DocumentFilters · l.366 |
| «[icon X]» | `{() => updateFilters({ search: '' })}` | `activeFilterCount > 0 && !showAdvancedFilters && filters.search` |  |  | DocumentFilters · l.397 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar documentos por título, descripción o nombre de archivo...» | text | «Buscar documentos por título, descripción o nombre de archivo...» · disabled: `{loading}` |  |  |  | DocumentFilters · l.124 |
| «Etiquetas» | text | «Agregar etiqueta...» · also `onKeyPress={(e) => { if (e.key === 'Enter' && tagInput.trim()) { addTagFilter(tagInput.trim…}` |  | `showAdvancedFilters` |  | DocumentFilters · l.214 |
| «{fileType.extension.toUpperCase()}» | checkbox |  |  | `showAdvancedFilters && each SUPPORTED_FILE_TYPES` |  | DocumentFilters · l.282 |
| «Subido por» | select |  | «Todos los usuarios», «(lista) {uploader.name}» | `showAdvancedFilters` |  | DocumentFilters · l.302 |
| «Fecha de Subida» | date | «Desde» |  | `showAdvancedFilters` |  | DocumentFilters · l.325 |
| «Fecha de Subida» | date | «Hasta» |  | `showAdvancedFilters` |  | DocumentFilters · l.335 |
| «Ordenar por:» | select |  | «Fecha de subida», «Nombre», «Tamaño», «Descargas», «Visualizaciones» | `showAdvancedFilters` |  | DocumentFilters · l.354 |

**Other texts on screen** (13)

- «Etiquetas» (label) — DocumentFilters · l.209, when `showAdvancedFilters`
- «Tipos de Archivo» (label) — DocumentFilters · l.276, when `showAdvancedFilters`
- «{fileType.extension.toUpperCase()}» (label) — DocumentFilters · l.281, when `showAdvancedFilters && each SUPPORTED_FILE_TYPES`
- «Subido por» (label) — DocumentFilters · l.298, when `showAdvancedFilters`
- «Fecha de Subida» (label) — DocumentFilters · l.320, when `showAdvancedFilters`
- «Ordenar por:» (label) — DocumentFilters · l.350, when `showAdvancedFilters`
- «Filtros activos:» — DocumentFilters · l.393, when `activeFilterCount > 0 && !showAdvancedFilters`
- «Búsqueda: &quot;» — DocumentFilters · l.396, when `activeFilterCount > 0 && !showAdvancedFilters && filters.search`
- «&quot;» — DocumentFilters · l.396, when `activeFilterCount > 0 && !showAdvancedFilters && filters.search`
- «{filters.tags.length} etiqueta(s)» — DocumentFilters · l.406, when `activeFilterCount > 0 && !showAdvancedFilters && filters.tags && filters.tags.length > 0`
- «{filters.mime_types.length} tipo(s) de archivo» — DocumentFilters · l.411, when `activeFilterCount > 0 && !showAdvancedFilters && filters.mime_types && filters.mime_types.length > 0`
- «Usuario específico» — DocumentFilters · l.417, when `activeFilterCount > 0 && !showAdvancedFilters && filters.uploaded_by`
- «Rango de fechas» — DocumentFilters · l.422, when `activeFilterCount > 0 && !showAdvancedFilters && ((filters.date_from \|\| filters.date_to))`

### components/documents/DocumentGrid.tsx

Used by: `/community/workspace`

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{folder.folder_name}» | h3 |  | FolderCard · l.215 |
| «{document.title}» | h3 |  | DocumentCard · l.290 |
| «No hay documentos» | h3 | `folders.length === 0 && documents.length === 0` | DocumentGrid · l.529 |
| «Carpetas» | h3 | `viewMode === 'grid' && folders.length > 0` | DocumentGrid · l.546 |
| «Documentos ( {documents.length} )» | h3 | `viewMode === 'grid' && documents.length > 0` | DocumentGrid · l.559 |
| «Carpetas» | h3 | `folders.length > 0` | DocumentGrid · l.585 |
| «Documentos ( {documents.length} )» | h3 | `documents.length > 0` | DocumentGrid · l.598 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver» | `{() => { onDocumentAction('view', document); setActiveDropdown(null); }}` |  |  |  | DocumentActionsDropdown · l.124 |
| «Descargar» | `{() => { onDocumentAction('download', document); setActiveDropdown(null); }}` |  |  |  | DocumentActionsDropdown · l.135 |
| «Compartir» | `{() => { onDocumentAction('share', document); setActiveDropdown(null); }}` | `permissions.can_share` |  |  | DocumentActionsDropdown · l.147 |
| «Editar» | `{() => { onDocumentAction('edit', document); setActiveDropdown(null); }}` | `canManage` |  |  | DocumentActionsDropdown · l.160 |
| «Mover» | `{() => { onDocumentAction('move', document); setActiveDropdown(null); }}` | `canManage` |  |  | DocumentActionsDropdown · l.173 |
| «Eliminar» | `{() => { onDocumentAction('delete', document); setActiveDropdown(null); }}` | `canManage` |  |  | DocumentActionsDropdown · l.188 |
| «[icon MoreVertical]» | `{(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === document.id …}` |  |  |  | DocumentCard · l.251 |
| «[icon MoreVertical]» | `{(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === document.id …}` |  |  |  | DocumentRow · l.416 |

**Other things that react to a click** (3)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{folder.folder_name} {folder.document_count} documentos {folder.subfolder_count} subcarpetas» | `{() => onFolderClick(folder)}` |  | FolderCard · l.206 |
| `div` | «{getFileIcon(document.mime_type)} {document.title} {document.description} / Sin descripción [{tag} [+ {document.tags.le…» | `{() => onDocumentClick(document)}` |  | DocumentCard · l.264 |
| `div` | «{getFileIcon(document.mime_type)} {document.title} {document.file_name}» | `{() => onDocumentClick(document)}` |  | DocumentRow · l.360 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | checkbox |  |  |  |  | DocumentCard · l.241 |
|  | checkbox |  |  |  |  | DocumentRow · l.350 |
|  | checkbox |  |  | `documents.length > 0` |  | DocumentGrid · l.613 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image |  |  | getFileIcon · l.92 |
| img · alt {document.title} · {document.thumbnail_url} | `document.thumbnail_url` |  | DocumentCard · l.271 |

**Table columns** (12)

| Text | Shown when | Where |
|---|---|---|
| «Documento» | `loading` | DocumentGrid · l.463 |
| «Tamaño» | `loading` | DocumentGrid · l.466 |
| «Subido por» | `loading` | DocumentGrid · l.469 |
| «Fecha» | `loading` | DocumentGrid · l.472 |
| «Estadísticas» | `loading` | DocumentGrid · l.475 |
| «Acciones» | `loading` | DocumentGrid · l.478 |
| «Documento» | `documents.length > 0` | DocumentGrid · l.620 |
| «Tamaño» | `documents.length > 0` | DocumentGrid · l.623 |
| «Subido por» | `documents.length > 0` | DocumentGrid · l.626 |
| «Fecha» | `documents.length > 0` | DocumentGrid · l.629 |
| «Estadísticas» | `documents.length > 0` | DocumentGrid · l.632 |
| «Acciones» | `documents.length > 0` | DocumentGrid · l.635 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `canManage = canManageAll \|\| (!!userId && document.uploaded_by === userId)` | DocumentActionsDropdown · l.120 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('click')` | DocumentGrid · l.80 |

**Values shown from data** (15)

- `{getFileIcon(document.mime_type)}` — DocumentCard · l.281, when `!(document.thumbnail_url)`
- `{tag}` — DocumentCard · l.301, when `document.tags.length > 0 && each document.tags.slice(0, 2)`
- `+ {document.tags.length - 2}` — DocumentCard · l.309, when `document.tags.length > 0 && document.tags.length > 2`
- `{document.formatted_size}` — DocumentCard · l.316
- `{document.relative_time}` — DocumentCard · l.317
- `{document.view_count}` — DocumentCard · l.324
- `{document.download_count}` — DocumentCard · l.328
- `{getFileIcon(document.mime_type)}` — DocumentRow · l.364
- `{document.title}` — DocumentRow · l.368
- `{document.file_name}` — DocumentRow · l.371
- `{document.formatted_size}` — DocumentRow · l.379
- `{document.uploader_name}` — DocumentRow · l.387
- `{document.relative_time}` — DocumentRow · l.395
- `{document.view_count}` — DocumentRow · l.404
- `{document.download_count}` — DocumentRow · l.408

**Other texts on screen** (6)

- «{folder.document_count} documentos» — FolderCard · l.219
- «{folder.subfolder_count} subcarpetas» — FolderCard · l.220
- «{document.description} / Sin descripción» — DocumentCard · l.293
- «Comienza subiendo tu primer documento o creando una carpeta.» — DocumentGrid · l.533, when `folders.length === 0 && documents.length === 0`
- «{selectedDocuments.length} seleccionados» — DocumentGrid · l.563, when `viewMode === 'grid' && documents.length > 0 && selectedDocuments.length > 0`
- «{selectedDocuments.length} seleccionados» — DocumentGrid · l.602, when `documents.length > 0 && selectedDocuments.length > 0`

### components/documents/DocumentPreview.tsx

Used by: `/community/workspace`

**Titles** (8)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Vista previa no disponible» | h3 | `!canPreview` | renderPreviewContent · l.326 |
| «{document.title}» | h2 |  | DocumentPreview · l.462 |
| «Error al cargar» | h3 | `!(loading) && previewError` | DocumentPreview · l.525 |
| «Información del Documento» | h3 |  | DocumentPreview · l.541 |
| «Descripción» | h3 | `document.description` | DocumentPreview · l.590 |
| «Etiquetas» | h3 | `document.tags.length > 0` | DocumentPreview · l.602 |
| «Estadísticas» | h3 |  | DocumentPreview · l.621 |
| «Ubicación» | h3 | `document.folder_name` | DocumentPreview · l.657 |

**Buttons** (10)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Descargar» | `{handleDownload}` | `!canPreview` |  |  | renderPreviewContent · l.333 |
| «Abrir» | `{handleExternalOpen}` | `!canPreview` |  |  | renderPreviewContent · l.340 |
| «[icon ZoomOut]» | `{handleZoomOut}` | `document.mime_type.startsWith('image/')` | `{imageZoom <= 25}` |  | renderPreviewContent · l.362 |
| «[icon ZoomIn]» | `{handleZoomIn}` | `document.mime_type.startsWith('image/')` | `{imageZoom >= 300}` |  | renderPreviewContent · l.372 |
| «[icon RotateCw]» | `{handleRotate}` | `document.mime_type.startsWith('image/')` |  |  | renderPreviewContent · l.380 |
| «Restablecer» | `{handleResetView}` | `document.mime_type.startsWith('image/')` |  |  | renderPreviewContent · l.386 |
| «[icon Edit2]» · tooltip «Editar documento» | `{() => onEdit(document)}` | `canEdit && onEdit` |  |  | DocumentPreview · l.474 |
| «[icon Share2]» · tooltip «Compartir documento» | `{() => onShare(document)}` | `onShare` |  |  | DocumentPreview · l.484 |
| «Descargar» | `{handleDownload}` |  |  |  | DocumentPreview · l.493 |
| «[icon X]» | `{onClose}` |  |  |  | DocumentPreview · l.501 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {document.title} · {documentUrl \|\| undefined} | `document.mime_type.startsWith('image/')` |  | renderPreviewContent · l.397 |
| iframe · {document.title} · {`${documentUrl}#view=FitH`} | `document.mime_type === 'application/pdf'` |  | renderPreviewContent · l.416 |
| video | `document.mime_type.startsWith('video/')` |  | renderPreviewContent · l.431 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «{document.title}» | written in this file |  |  | DocumentPreview · l.450 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «HTTP {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchWhole · l.143 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` | `kind === 'fetched'` | DocumentPreview · l.170 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
|  | `window.open` |  | handleExternalOpen · l.286 |

**Draws nothing when** (7)

| Condition | Where |
|---|---|
| `!current()` | DocumentPreview · l.169 |
| `!current()` | DocumentPreview · l.175 |
| `!current()` | DocumentPreview · l.196 |
| `!current()` | DocumentPreview · l.201 |
| `kind !== 'video' \|\| !video \|\| !shownUrl \|\| !previous.url \|\| previous.documentId !== documentId` | DocumentPreview · l.231 |
| `previous.url === shownUrl && previous.tick === reloadTick` | DocumentPreview · l.232 |
| `!isOpen \|\| !document` | DocumentPreview · l.271 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `LINK_FAILED` | «No se pudo abrir el documento. Inténtalo de nuevo.» | l.39 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Error al cargar el PDF» | loadErrorOf · l.53 |
| «Error al cargar el video» | loadErrorOf · l.55 |
| «Error al cargar la imagen» | loadErrorOf · l.56 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, LINK_MAX_AGE_MS)` | DocumentPreview · l.206 |
| listener | `video.addEventListener('loadedmetadata')` | DocumentPreview · l.240 |
| lookup | `querySelector(source)` | DocumentPreview · l.241 |

**Values shown from data** (12)

- `{imageZoom} %` — renderPreviewContent · l.369, when `document.mime_type.startsWith('image/')`
- `{document.file_name}` — DocumentPreview · l.465
- `{previewError}` — DocumentPreview · l.528, when `!(loading) && previewError`
- `{document.file_name}` — DocumentPreview · l.549
- `{formatFileSize(document.file_size)}` — DocumentPreview · l.559
- `{document.uploader_name}` — DocumentPreview · l.569
- `{formatRelativeTime(document.created…}` — DocumentPreview · l.579
- `{document.description}` — DocumentPreview · l.593, when `document.description`
- `{document.view_count}` — DocumentPreview · l.630
- `{document.download_count}` — DocumentPreview · l.639
- `{document.current_version}` — DocumentPreview · l.647
- `{document.folder_name}` — DocumentPreview · l.662, when `document.folder_name`

**Other texts on screen** (10)

- «Este tipo de archivo no se puede previsualizar en el navegador.» — renderPreviewContent · l.330, when `!canPreview`
- «Tu navegador no soporta la reproducción de videos.» — renderPreviewContent · l.440, when `document.mime_type.startsWith('video/')`
- «Cargando vista previa...» — DocumentPreview · l.518, when `loading`
- «Archivo» — DocumentPreview · l.548
- «Tamaño» — DocumentPreview · l.558
- «Subido por» — DocumentPreview · l.568
- «Fecha de subida» — DocumentPreview · l.578
- «Visualizaciones» — DocumentPreview · l.628
- «Descargas» — DocumentPreview · l.637
- «Versión» — DocumentPreview · l.645

### components/documents/DocumentUploadModal.tsx

Used by: `/community/workspace`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Subir Documentos» | h2 |  | DocumentUploadModal · l.350 |
| «Resultado de la subida» | h3 | `results.length > 0` | DocumentUploadModal · l.402 |
| «Archivos Seleccionados» | h3 | `formData.files.length > 0` | DocumentUploadModal · l.435 |
| «Se encontraron errores:» | h3 | `errors.length > 0` | DocumentUploadModal · l.611 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  | `{uploading}` |  | DocumentUploadModal · l.351 |
| «Seleccionar Archivos» | `{() => fileInputRef.current?.click()}` |  | `{uploading}` |  | DocumentUploadModal · l.389 |
| «[icon X]» | `{() => removeFile(index)}` | `formData.files.length > 0 && each formData.files && !uploading` |  |  | DocumentUploadModal · l.466 |
| «Nueva Carpeta» | `{() => setShowCreateFolder(!showCreateFolder)}` |  | `{uploading}` |  | DocumentUploadModal · l.519 |
| «Crear» | `{handleCreateFolder}` | `showCreateFolder` | `{creatingFolder \|\| !newFolderName.trim()}` |  | DocumentUploadModal · l.540 |
| «[icon X]» | `{() => removeTag(tag)}` | `formData.tags.length > 0 && each formData.tags && !uploading` |  |  | DocumentUploadModal · l.590 |
| «Cancelar» | `{onClose}` |  | `{uploading}` |  | DocumentUploadModal · l.628 |
| «Subiendo... / Subir Documentos» | `{handleUpload}` |  | `{uploading \|\| formData.files.length === 0 \|\| !formData.title.trim()}` |  | DocumentUploadModal · l.635 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | file | accepts `{SUPPORTED_FILE_TYPES.map(type => type.extension).join(',')}` · `multiple=true` |  | hidden by its class (`hidden`); another control opens it or it is for screen readers |  | DocumentUploadModal · l.373 |
| «Título *» | text | «Título del documento» · disabled: `{uploading}` · `maxLength={DOCUMENT_TITLE_MAX}` |  |  |  | DocumentUploadModal · l.487 |
| «Descripción» | textarea | «Descripción opcional del documento» · disabled: `{uploading}` |  |  |  | DocumentUploadModal · l.503 |
| «Nombre de la carpeta» | text | «Nombre de la carpeta» · disabled: `{creatingFolder}` |  | `showCreateFolder` |  | DocumentUploadModal · l.532 |
|  | select | disabled: `{uploading}` | «Carpeta raíz», «(lista) {folder.folder_name}» |  |  | DocumentUploadModal · l.550 |
| «Etiquetas» | text | «Escribe una etiqueta y presiona Enter» · disabled: `{uploading}` · also `onKeyPress={handleTagKeyPress}` |  |  |  | DocumentUploadModal · l.571 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onDrop={handleDrop} · onDragOver={handleDrag} · onDragEnter={handleDrag} · onDragLeave={handleDrag}` |  | DocumentUploadModal · l.362 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Subir Documentos» | written in this file |  |  | DocumentUploadModal · l.346 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Tipo de archivo no soportado: {file.name}» | `newErrors.push` | `!fileTypeConfig` | handleFiles · l.169 |
| «Archivo demasiado grande: {file.name}. Máximo: {formatFileSize( fileTypeCon…}» | `newErrors.push` | `file.size > fileTypeConfig.max_size` | handleFiles · l.175 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | DocumentUploadModal · l.339 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Error al crear la carpeta. Inténtalo de nuevo.» | DocumentUploadModal · l.255 |
| «Selecciona al menos un archivo para subir.» | DocumentUploadModal · l.264 |
| «El título es requerido.» | DocumentUploadModal · l.269 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 1500)` | handleUpload · l.332 |
| mark | `testid=upload-results` | DocumentUploadModal · l.401 |
| mark | `testid=upload-result` | DocumentUploadModal · l.404 |
| mark | `testid=upload-selected-file` | DocumentUploadModal · l.439 |

**Values shown from data** (7)

- `{outcome.fileName}` — DocumentUploadModal · l.419, when `results.length > 0 && each results`
- `{outcome.message}` — DocumentUploadModal · l.423, when `results.length > 0 && each results && !(outcome.status === 'success')`
- `{outcome.warning}` — DocumentUploadModal · l.425, when `results.length > 0 && each results && outcome.warning`
- `{file.name}` — DocumentUploadModal · l.448, when `formData.files.length > 0 && each formData.files`
- `{formatFileSize(file.size)}` — DocumentUploadModal · l.449, when `formData.files.length > 0 && each formData.files`
- `{progress.error}` — DocumentUploadModal · l.451, when `formData.files.length > 0 && each formData.files && progress?.status === 'error' && progress.error`
- `{error}` — DocumentUploadModal · l.617, when `errors.length > 0 && each errors`

**Other texts on screen** (7)

- «Arrastra archivos aquí o haz clic para seleccionar» — DocumentUploadModal · l.384
- «Formatos soportados: PDF, DOC, XLS, PPT, imágenes, videos» — DocumentUploadModal · l.387
- «Subido» — DocumentUploadModal · l.421, when `results.length > 0 && each results && outcome.status === 'success'`
- «Título *» (label) — DocumentUploadModal · l.484
- «Descripción» (label) — DocumentUploadModal · l.500
- «Carpeta» (label) — DocumentUploadModal · l.516
- «Etiquetas» (label) — DocumentUploadModal · l.567

### components/documents/FolderNavigation.tsx

Used by: `/community/workspace`

**Buttons** (10)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Renombrar Carpeta» | `{startEditingFolder}` |  |  |  | FolderActionsDropdown · l.119 |
| «Eliminar Carpeta» | `{() => handleDeleteFolder(currentFolder.id)}` |  |  |  | FolderActionsDropdown · l.129 |
| «Inicio» | `{() => onFolderNavigate(null)}` |  | `{loading}` |  | FolderNavigation · l.146 |
| «{item.name}» | `{() => onFolderNavigate(item.id)}` | `each breadcrumb` | `{loading}` |  | FolderNavigation · l.159 |
| «[icon Check]» | `{handleEditFolder}` | `currentFolder && editingFolder === currentFolder.id` |  |  | FolderNavigation · l.185 |
| «[icon X]» | `{cancelEditing}` | `currentFolder && editingFolder === currentFolder.id` |  |  | FolderNavigation · l.191 |
| «[icon MoreVertical]» | `{() => setShowFolderActions(!showFolderActions)}` | `!(currentFolder && editingFolder === currentFolder.id) && currentFolder && permissions.can_manage_folders` |  |  | FolderNavigation · l.209 |
| «Nueva Carpeta» | `{() => setShowCreateFolder(!showCreateFolder)}` | `permissions.can_create_folder` | `{loading}` |  | FolderNavigation · l.228 |
| «Creando... / Crear» | `{handleCreateFolder}` | `showCreateFolder` | `{creatingFolder \|\| !newFolderName.trim()}` |  | FolderNavigation · l.258 |
| «[icon X]» | `{() => { setShowCreateFolder(false); setNewFolderName(''); }}` | `showCreateFolder` | `{creatingFolder}` |  | FolderNavigation · l.265 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | text | also `onKeyPress={(e) => { if (e.key === 'Enter') handleEditFolder(); if (e.key === 'Escape') can…}` |  | `currentFolder && editingFolder === currentFolder.id` |  | FolderNavigation · l.174 |
| «Nombre de la carpeta» | text | «Nombre de la carpeta» · disabled: `{creatingFolder}` · also `onKeyPress={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') s…}` |  | `showCreateFolder` |  | FolderNavigation · l.245 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Estás seguro de que quieres eliminar esta carpeta? Esta acción no se puede deshacer.» |  | handleDeleteFolder · l.89 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!currentFolder \|\| !permissions.can_manage_folders` | FolderActionsDropdown · l.115 |

**Values shown from data** (1)

- `{currentFolder.folder_name}` — FolderNavigation · l.204, when `!(currentFolder && editingFolder === currentFolder.id) && currentFolder`

**Other texts on screen** (2)

- «{currentFolder.subfolder_count} subcarpetas» — FolderNavigation · l.284, when `currentFolder`
- «{currentFolder.document_count} documentos» — FolderNavigation · l.287, when `currentFolder`

### components/feed/CommentModal.tsx

Used by: `/community/workspace`

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «(sin título)» | written in this file |  |  | CommentModal · l.46 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | CommentModal · l.43 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CommentThread` |  |  |  | CommentModal · l.57 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('keydown')` | CommentModal · l.30 |
| listener | `document.addEventListener('mousedown')` | CommentModal · l.31 |

### components/feed/CommentThread.tsx

Used by: `/community/workspace`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Comentarios» | h3 |  | CommentThread · l.283 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon DotsHorizontalIcon]» | `{() => setShowMenu(!showMenu)}` | `isOwnComment` |  |  | CommentItem · l.84 |
| «Eliminar» | `{handleDelete}` | `isOwnComment && showMenu` |  |  | CommentItem · l.92 |
| «Responder» | `{() => onReply(comment)}` | `!isReply` |  |  | CommentItem · l.113 |
|  | `{onClose}` | `onClose` |  |  | CommentThread · l.285 |
| «Cargando... / Cargar más comentarios» | `{handleLoadMore}` | `!(loading && comments.length === 0) && comments.length > 0 && hasMore` | `{loading}` |  | CommentThread · l.322 |
|  | `{() => setReplyingTo(null)}` | `replyingTo` |  |  | CommentThread · l.348 |
| «Enviando... / Enviar» (submits the form) |  |  | `{!newComment.trim() \|\| posting}` |  | CommentThread · l.367 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{replyingTo ? 'Escribe tu respuesta...' : 'Escribe un comentario...'}» | text | «{replyingTo ? 'Escribe tu respuesta...' : 'Escribe un comentario...'}» · disabled: `{posting}` |  |  |  | CommentThread · l.359 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {`${comment.author.first_name} ${comment.author.last_name}`} · {comment.author.avatar_url} | `comment.author?.avatar_url` |  | CommentItem · l.56 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | CommentThread · l.358 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmationModal` | component | `{showDeleteConfirm}` | title: Eliminar comentario · message: ¿Estás seguro de que deseas eliminar este comentario? Esta acción no se puede deshacer. · confirmText: Eliminar · cancelText: Cancelar | CommentItem · l.140 |

**Browser alert()** (1)

| Text | When | Where |
|---|---|---|
| «Error al eliminar el comentario» |  | handleDelete · l.269 |

**Values shown from data** (5)

- `{comment.author?.first_name?.[0]} {comment.author?.last_name?.[0]}` — CommentItem · l.62, when `!(comment.author?.avatar_url)`
- `{comment.author?.first_name} {comment.author?.last_name}` — CommentItem · l.72
- `{formatDistanceToNow(new Date(commen…}` — CommentItem · l.76
- `{comment.content}` — CommentItem · l.105
- `{replyingTo.author?.first_name} {replyingTo.author?.last_name}` — CommentThread · l.346, when `replyingTo`

**Other texts on screen** (3)

- «(editado)» — CommentItem · l.107, when `comment.is_edited`
- «Sé el primero en comentar» — CommentThread · l.335, when `!(loading && comments.length === 0) && !(comments.length > 0)`
- «Respondiendo a» — CommentThread · l.346, when `replyingTo`

**Reads and writes the database directly:** `table:post_comments` (delete)

### components/feed/ConfirmationModal.tsx

Used by: `/community/workspace`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h3 | screen size: `sm:block sm:flex` | ConfirmationModal · l.37 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{confirmText}» | `{() => { onConfirm(); onClose(); }}` | screen size: `sm:block sm:flex` |  |  | ConfirmationModal · l.49 |
| «{cancelText}» | `{onClose}` | screen size: `sm:block sm:flex` |  |  | ConfirmationModal · l.59 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «{title}» | written in this file |  |  | ConfirmationModal · l.27 |
| «(sin título)» | written in this file |  |  | ConfirmationModal · l.29 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | ConfirmationModal · l.24 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Confirmar» | ConfirmationModal · l.20 |
| «Cancelar» | ConfirmationModal · l.21 |

**Values shown from data** (1)

- `{message}` — ConfirmationModal · l.41, screen size: `sm:block sm:flex`

### components/feed/CreatePostModal.tsx

Used by: `/community/workspace`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Crear publicación» | h3 | screen size: `sm:block` | CreatePostModal · l.266 |

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon XIcon]» | `{handleClose}` | screen size: `sm:block` |  |  | CreatePostModal · l.267 |
| «[icon XIcon]» | `{() => removeFile(index)}` | `selectedFiles.length > 0 && each selectedFiles && file.type.startsWith('image/')` · screen size: `sm:block` |  |  | CreatePostModal · l.315 |
| «[icon XIcon]» | `{() => removeFile(index)}` | `selectedFiles.length > 0 && each selectedFiles && !(file.type.startsWith('image/'))` · screen size: `sm:block` |  |  | CreatePostModal · l.333 |
| «[icon PhotographIcon]» · tooltip «Agregar imagen» | `{() => { setFileInputType('image'); setPostType('image'); setTimeout(() => fileI…}` | screen size: `sm:block` |  |  | CreatePostModal · l.370 |
| «[icon DocumentIcon]» · tooltip «Agregar documento» | `{() => { setFileInputType('document'); setPostType('document'); setTimeout(() =>…}` | screen size: `sm:block` |  |  | CreatePostModal · l.381 |
| «[icon LinkIcon]» · tooltip «Agregar enlace» | `{() => setPostType('link')}` | screen size: `sm:block` |  |  | CreatePostModal · l.392 |
| «[icon HashtagIcon]» · tooltip «Agregar hashtag» |  | screen size: `sm:block` |  |  | CreatePostModal · l.399 |
| «[icon AtSymbolIcon]» · tooltip «Mencionar a alguien» |  | screen size: `sm:block` |  |  | CreatePostModal · l.405 |
| «Publicando... / Publicar» | `{handleSubmit}` | screen size: `sm:block` | `{(!editor?.getText().trim() && selectedFiles.length === 0 && !linkUrl) \|\| isSubm…}` |  | CreatePostModal · l.413 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Pega el enlace aquí» | url | «Pega el enlace aquí» |  | `postType === 'link'` · screen size: `sm:block` |  | CreatePostModal · l.349 |
|  | file | accepts `{fileInputType === 'document' ? '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf…}` · `multiple=true` |  | screen size: `sm:block hidden` |  | CreatePostModal · l.428 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {authorName} · {authorAvatar} | `authorAvatar && authorAvatar.startsWith('http')` · screen size: `sm:block` |  | CreatePostModal · l.279 |
| img · alt {`Preview ${index + 1}`} · {URL.createObjectURL(file)} | `selectedFiles.length > 0 && each selectedFiles && file.type.startsWith('image/')` · screen size: `sm:block` |  | CreatePostModal · l.310 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Crear publicación» | written in this file |  |  | CreatePostModal · l.257 |
| «(sin título)» | written in this file |  |  | CreatePostModal · l.259 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch users» | `throw (shown by whoever catches it)` | `!response.ok` | CreatePostModal · l.68 |
| «No se pudo publicar. Inténtalo de nuevo.» | `setPublishError` |  | handleSubmit · l.201 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` | `selectedFiles.length > 0 && each selectedFiles && file.type.startsWith('image/')` · screen size: `sm:block` | CreatePostModal · l.311 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!props.clientRect` | CreatePostModal · l.86 |
| `!isOpen` | CreatePostModal · l.254 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Cargando...» | CreatePostModal · l.181 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| role | `role=alert` | CreatePostModal · l.361 |
| mark | `testid=create-post-error` | CreatePostModal · l.361 |

**Values shown from data** (4)

- `{authorName.split(' ').map(n => n[0]…}` — CreatePostModal · l.285, when `!(authorAvatar && authorAvatar.startsWith('http'))`, screen size: `sm:block`
- `{authorName}` — CreatePostModal · l.291, screen size: `sm:block`
- `{file.name}` — CreatePostModal · l.326, when `selectedFiles.length > 0 && each selectedFiles && !(file.type.startsWith('image/'))`, screen size: `sm:block`
- `{publishError}` — CreatePostModal · l.361, when `publishError`, screen size: `sm:block`

**Other texts on screen** (2)

- «Publicando en tu comunidad» — CreatePostModal · l.292, screen size: `sm:block`
- «{(file.size / 1024 / 1024).toFixed(2)} MB» — CreatePostModal · l.329, when `selectedFiles.length > 0 && each selectedFiles && !(file.type.startsWith('image/'))`, screen size: `sm:block`

### components/feed/FeedContainer.tsx

Used by: `/community/workspace`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «No hay publicaciones aún» | h3 | `!loading && posts.length === 0` | FeedContainer · l.196 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{userName.split(' ').map(n => n[0]).…} ¿Qué quieres compartir?» | `{() => setShowCreateModal(true)}` |  |  |  | FeedContainer · l.111 |
| «Crear publicación» | `{() => setShowCreateModal(true)}` | `!loading && posts.length === 0` |  |  | FeedContainer · l.202 |
| «[icon PlusIcon]» | `{() => setShowCreateModal(true)}` | screen size: `lg:hidden` |  |  | FeedContainer · l.214 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {userName} · {userAvatar} | `userAvatar` |  | FeedContainer · l.117 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `CreatePostModal` | component | `{showCreateModal}` |  | FeedContainer · l.222 |
| `CommentModal` | component | `{showCommentModal}` |  | FeedContainer · l.233 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!reset && !hasMore` | FeedContainer · l.28 |
| `loading \|\| !hasMore` | FeedContainer · l.71 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `PostCard` |  | `each posts` |  | FeedContainer · l.148 |
| `FeedSkeleton` |  | `loading && posts.length === 0` |  | FeedContainer · l.161 |
| `FeedSkeleton` |  | `loading && posts.length === 0` |  | FeedContainer · l.162 |
| `FeedSkeleton` |  | `loading && posts.length === 0` |  | FeedContainer · l.163 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('scroll')` | FeedContainer · l.82 |

**Other texts on screen** (4)

- «Actualizando...» — FeedContainer · l.140, when `refreshing`
- «Cargando más publicaciones...» — FeedContainer · l.175, when `loading && posts.length > 0`
- «No hay más publicaciones» — FeedContainer · l.183, when `!hasMore && posts.length > 0`
- «Sé el primero en compartir algo con tu comunidad» — FeedContainer · l.200, when `!loading && posts.length === 0`

### components/feed/MentionList.tsx

Used by: `/community/workspace`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{item.display_name.split(' ').map(n …} {item.display_name} [{getRoleLabel(item.role)}] [{item.email}]» | `{() => selectItem(index)}` | `each props.items` |  |  | l.90 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {item.display_name} · {item.avatar_url} | `each props.items && item.avatar_url` |  | l.100 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getRoleLabel()` | «Administrador», «Líder de Comunidad», «Consultor», «Docente» | getRoleLabel · l.66 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Administrador» | MentionList · l.66 |
| «Líder de Comunidad» | MentionList · l.68 |
| «Consultor» | MentionList · l.70 |
| «Docente» | MentionList · l.72 |

**Other texts on screen** (1)

- «No se encontraron usuarios» — l.81, when `!props.items.length`

### components/feed/PostCard.tsx

Used by: `/community/workspace`

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver menos / Ver más» | `{() => setShowFullText(!showFullText)}` | `post.type === 'text' && post.content.text && post.content.text.length > 150` |  |  | renderContent · l.147 |
|  | `{() => setCurrentImageIndex(index)}` | `post.type === 'image' && post.media && post.media.length > 0 && post.media.length > 1 && each post.media` |  |  | renderContent · l.175 |
| «[icon DotsHorizontalIcon]» | `{() => setShowMenu(!showMenu)}` |  |  |  | PostCard · l.321 |
| «Editar publicación» | `{handleEdit}` | `showMenu && isOwnPost` |  |  | PostCard · l.330 |
| «Eliminar publicación» | `{handleDelete}` | `showMenu && isOwnPost` |  |  | PostCard · l.337 |
| «Me gusta» | `{handleReaction}` |  |  |  | PostCard · l.383 |
| «Comentar» | `{() => onComment?.(post.id)}` |  |  |  | PostCard · l.399 |
| «Compartir» |  |  |  |  | PostCard · l.407 |
| «[icon BookmarkSolidIcon]» | `{handleSave}` |  |  |  | PostCard · l.414 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{media.metadata?.name} / Documento [{(media.metadata.size / 1024 / 1024)…} MB]» | `{media.url}` (new tab) | `post.type === 'document' && post.media && post.media.length > 0 && each post.media` |  | renderContent · l.200 |
| «{post.content.document.name} {(post.content.document.size / 1024 …} MB» | `{post.content.document.url}` (new tab) | `post.type === 'document' && post.content.document` |  | renderContent · l.224 |
| «{post.content.link.title} [{post.content.link.description}] {post.content.link.domain}» | `{post.content.link.url}` (new tab) | `post.type === 'link' && post.content.link` |  | renderContent · l.251 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {post.media[currentImageIndex].caption \|\| 'Imagen'} · {post.media[currentImageIndex].url} | `post.type === 'image' && post.media && post.media.length > 0` |  | renderContent · l.166 |
| img · alt {post.content.link.title} · {post.content.link.image} | `post.type === 'link' && post.content.link && post.content.link.image` |  | renderContent · l.259 |
| img · alt {`${post.author.first_name} ${post.author.last_name}`} · {post.author.avatar_url} | `post.author?.avatar_url && post.author.avatar_url.startsWith('http')` |  | PostCard · l.297 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmationModal` | component | `{showDeleteConfirm}` | title: Eliminar publicación · message: ¿Estás seguro de que deseas eliminar esta publicación? Esta acción no se puede deshacer. · confirmText: Eliminar · cancelText: Cancelar | PostCard · l.431 |

**Browser alert()** (2)

| Text | When | Where |
|---|---|---|
| «Editar publicación - Próximamente» |  | handleEdit · l.106 |
| «Error al eliminar la publicación» |  | confirmDelete · l.122 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('click')` | PostCard · l.134 |

**Values shown from data** (11)

- `{part}` — renderTextWithMentions · l.52, when `each parts && index % 2 === 0`
- `@ {part}` — renderTextWithMentions · l.55, when `each parts && !(index % 2 === 0)`
- `{renderTextWithMentions(post.content…}` — renderContent · l.143, when `post.type === 'text'`
- `{renderTextWithMentions(post.content…}` — renderContent · l.161, when `post.type === 'image' && post.content.text`
- `{renderTextWithMentions(post.content…}` — renderContent · l.194, when `post.type === 'document' && post.content.text`
- `{renderTextWithMentions(post.content…}` — renderContent · l.248, when `post.type === 'link' && post.content.text`
- `{post.author?.first_name?.[0]} {post.author?.last_name?.[0]}` — PostCard · l.303, when `!(post.author?.avatar_url && post.author.avatar_url.startsWith('http'))`
- `{post.author?.first_name} {post.author?.last_name}` — PostCard · l.309
- `{formatDistanceToNow(new Date(post.c…}` — PostCard · l.312
- `{renderContent()}` — PostCard · l.350
- `# {tag}` — PostCard · l.358, when `post.hashtags && post.hashtags.length > 0 && each post.hashtags`

**Other texts on screen** (2)

- «{reactionCount} Me gusta» — PostCard · l.372, when `reactionCount > 0`
- «{post.comment_count} comentarios» — PostCard · l.375, when `post.comment_count && post.comment_count > 0`

### components/layout/FunctionalPageHeader.tsx

Used by: `/admin/growth-communities/[id]/members`, `/admin/growth-communities`, `/community/workspace`, `/user/[userId]`

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

### components/meetings/AttachmentRow.tsx

Used by: `/community/workspace`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon TrashIcon]» · tooltip «{removeTitle}» | `{onRemove}` |  |  |  | AttachmentRow · l.47 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Eliminar archivo» | AttachmentRow · l.32 |

**Values shown from data** (3)

- `{getFileIcon(fileType)}` — AttachmentRow · l.41
- `{filename}` — AttachmentRow · l.43
- `{formatFileSize(fileSize)}` — AttachmentRow · l.44

### components/meetings/FinalizeMeetingDialog.tsx

Used by: `/community/workspace`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{() => onOpenChange(false)}` |  | `{submitting}` |  | FinalizeMeetingDialog · l.257 |
| «Enviando… / Finalizar y enviar» | `{handleSubmit}` |  | `{submitting \|\| (recipients.kind === 'ready' && recipients.count === 0)}` |  | FinalizeMeetingDialog · l.265 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{AUDIENCE_PICKER_LABELS.with_access}» | radio | `audience` · disabled: `{submitting}` |  |  |  | FinalizeMeetingDialog · l.205 |
| «{AUDIENCE_PICKER_LABELS.attended} [La asistencia aún no se registra en la plataforma.]» | radio | `audience` · disabled: `{submitting \|\| nobodyAttended}` |  |  |  | FinalizeMeetingDialog · l.217 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{open}` |  | FinalizeMeetingDialog · l.192 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No se pudo finalizar la reunión» | `res.status === 409` | handleSubmit · l.161 |
| error | «Error al finalizar la reunión» | `!res.ok` | handleSubmit · l.171 |
| error | «{warning}» | `warning` | handleSubmit · l.179 |
| success | «Reunión finalizada. Resumen enviado a {recipientLabel(result.sent …}.» | `!(warning)` | handleSubmit · l.181 |
| error | «Error al finalizar la reunión» |  | handleSubmit · l.186 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «HTTP {res.status}» | `throw (shown by whoever catches it)` | `!res.ok` | FinalizeMeetingDialog · l.120 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!open` | FinalizeMeetingDialog · l.110 |
| `cancelled` | FinalizeMeetingDialog · l.123 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | FinalizeMeetingDialog · l.193 |
| `DialogHeader` |  |  |  | FinalizeMeetingDialog · l.194 |
| `DialogTitle` |  |  |  | FinalizeMeetingDialog · l.195 |
| `DialogDescription` |  |  |  | FinalizeMeetingDialog · l.196 |
| `TipTapEditor` | placeholder: Agrega un mensaje para los destinatarios… |  |  | FinalizeMeetingDialog · l.246 |
| `DialogFooter` |  |  |  | FinalizeMeetingDialog · l.256 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `CONFLICT_MESSAGES` | «La reunión ya no está en borrador», «La reunión ya fue finalizada por otro usuario», «La asistencia aún no se registra en la plataforma. Elige «Las personas con acceso a la reunión».» | l.22 |
| `emailWarning()` | «Reunión finalizada, pero el resumen no se envió por correo: los envíos están desactivados en este entorno de pruebas.», «Reunión finalizada, pero el resumen no se envió por correo: el envío no está autorizado para esta comunidad.», «Reunión finalizada, pero el resumen no se envió por correo: no hay destinatarios.», «Reunión finalizada, pero el servicio de correo rechazó todos los envíos: nadie recibió el resumen.», «Reunión finalizada, pero no se pudo preparar el envío del resumen: nadie lo recibió.», «Reunión finalizada, pero el resumen solo se envió a {sent} de {recipientLabel(sent + faile…}.», «Reunión finalizada, pero no se pudo enviar el resumen por correo.» | emailWarning · l.45 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Reunión finalizada, pero el resumen no se envió por correo: los envíos están desactivados en este entorno de pruebas.» | emailWarning · l.45 |
| «Reunión finalizada, pero el resumen no se envió por correo: el envío no está autorizado para esta comunidad.» | emailWarning · l.47 |
| «Reunión finalizada, pero el resumen no se envió por correo: no hay destinatarios.» | emailWarning · l.49 |
| «Reunión finalizada, pero el servicio de correo rechazó todos los envíos: nadie recibió el resumen.» | emailWarning · l.53 |
| «Reunión finalizada, pero no se pudo preparar el envío del resumen: nadie lo recibió.» | emailWarning · l.55 |
| «Reunión finalizada, pero el resumen solo se envió a {sent} de {recipientLabel(sent + faile…}.» | emailWarning · l.58 |
| «Reunión finalizada, pero no se pudo enviar el resumen por correo.» | emailWarning · l.60 |

**Other texts on screen** (8)

- «Finalizar reunión» — FinalizeMeetingDialog · l.195
- «Al finalizar “ {meetingTitle} ”, se enviará un resumen por correo y la reunión pasará a completada. Esta acción no se puede deshacer.» — FinalizeMeetingDialog · l.196
- «Destinatarios» (label) — FinalizeMeetingDialog · l.203
- «{AUDIENCE_PICKER_LABELS.with_access}» (label) — FinalizeMeetingDialog · l.204
- «{AUDIENCE_PICKER_LABELS.attended} [La asistencia aún no se registra en la plataforma.]» (label) — FinalizeMeetingDialog · l.216
- «Calculando…» — FinalizeMeetingDialog · l.235, when `recipients.kind === 'loading'`
- «Se enviará a {recipients.count} destinatarios» — FinalizeMeetingDialog · l.237, when `recipients.kind === 'ready'`
- «Mensaje del facilitador (opcional)» (label) — FinalizeMeetingDialog · l.243

### components/meetings/MeetingCard.tsx

Used by: `/community/workspace`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Resumen» | h4 | `meeting.summary` | renderSummarySection · l.151 |
| «Notas» | h4 | `meeting.notes` | renderSummarySection · l.159 |
| «{meeting.title}» | h3 |  | MeetingCard · l.298 |

**Buttons** (10)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon DownloadIcon]» · tooltip «Descargar documento» | `{() => handleDownload(attachment)}` | `each attachments` |  |  | renderDocumentsSection · l.277 |
| «[icon EyeIcon]» · tooltip «Ver detalles» | `{() => onView(meeting.id)}` | `onView` |  | `testid=meeting-view-{meeting.id}` | MeetingCard · l.394 |
| «[icon PencilIcon]» · tooltip «Editar reunión» | `{() => onEdit(meeting.id)}` | `canEdit && onEdit` |  | `testid=meeting-edit-{meeting.id}` | MeetingCard · l.405 |
| «[icon TrashIcon]» · tooltip «Eliminar reunión» | `{() => onDelete(meeting.id)}` | `canDelete && onDelete` |  | `testid=meeting-delete-{meeting.id}` | MeetingCard · l.416 |
| «Resumen» | `{() => toggleSection('summary')}` | `meetingWithDetails` |  |  | MeetingCard · l.452 |
| «Acuerdos ( {meetingWithDetails.agreements.length} )» | `{() => toggleSection('agreements')}` | `meetingWithDetails && canReadContent && meetingWithDetails.agreements.length > 0` |  | `testid=meeting-chip-agreements-{meeting.id}` | MeetingCard · l.466 |
| «Compromisos ( {meetingWithDetails.commitments.leng…} )» | `{() => toggleSection('commitments')}` | `meetingWithDetails && canReadContent && meetingWithDetails.commitments.length > 0` |  | `testid=meeting-chip-commitments-{meeting.id}` | MeetingCard · l.481 |
| «Tareas ( {meetingWithDetails.tasks.length} )» | `{() => toggleSection('tasks')}` | `meetingWithDetails && canReadContent && meetingWithDetails.tasks.length > 0` |  | `testid=meeting-chip-tasks-{meeting.id}` | MeetingCard · l.496 |
| «Documentos» | `{() => toggleSection('documents')}` | `meetingWithDetails && canReadContent` |  |  | MeetingCard · l.511 |
| «[icon ChevronUpIcon]» | `{() => setIsExpanded(!isExpanded)}` | `meetingWithDetails` |  |  | MeetingCard · l.536 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{part}» | `{part}` (new tab) | `each parts && part.match(urlRegex)` |  | renderTextWithLinks · l.132 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {`${attendee.user_profile.first_name} ${attendee.user_profile.last_name}`} · {attendee.user_profile.avatar_url} | `meetingWithDetails && meetingWithDetails.attendees && meetingWithDetails.attendees.length > 0 && each meetingWithDetails.attendees.slice(0, 5) && attendee.user_profile && attendee.user_profile.avatar_url` |  | MeetingCard · l.360 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{url}` | `window.open` |  | handleDownload · l.244 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `TaskTracker` | itemType: commitment | `each meetingWithDetails.commitments` |  | renderCommitmentsSection · l.205 |
| `TaskTracker` | itemType: task | `each meetingWithDetails.tasks` |  | renderTasksSection · l.225 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin nombre» | MeetingCard · l.373 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=meeting-content-hidden-{meeting.id}` | MeetingCard · l.528 |

**Values shown from data** (16)

- `{renderTextWithLinks(meeting.summary)}` — renderSummarySection · l.152, when `meeting.summary`
- `{renderTextWithLinks(meeting.notes)}` — renderSummarySection · l.160, when `meeting.notes`
- `{index + 1}` — renderAgreementsSection · l.180, when `each meetingWithDetails.agreements`
- `{agreement.agreement_text}` — renderAgreementsSection · l.184, when `each meetingWithDetails.agreements`
- `{agreement.category}` — renderAgreementsSection · l.186, when `each meetingWithDetails.agreements && agreement.category`
- `{getFileIcon(attachment.file_type)}` — renderDocumentsSection · l.271, when `each attachments`
- `{attachment.filename}` — renderDocumentsSection · l.273, when `each attachments`
- `{formatFileSize(attachment.file_size)}` — renderDocumentsSection · l.274, when `each attachments`
- `{meetingStatusLabels[meeting.status]}` — MeetingCard · l.313, when `!(meeting.status === 'borrador')`
- `{meeting.description}` — MeetingCard · l.320, when `meeting.description`
- `{formatMeetingDate(meeting.meeting_d…}` — MeetingCard · l.329
- `{meeting.location}` — MeetingCard · l.340, when `meeting.location`
- `{profileName(meeting.facilitator, '')}` — MeetingCard · l.347, when `meeting.facilitator && meeting.facilitator.first_name`
- `+ {meetingWithDetails.attendees.length…}` — MeetingCard · l.380, when `meetingWithDetails && meetingWithDetails.attendees && meetingWithDetails.attendees.length > 0 && meetingWithDetails.attendees.length > 5`
- `{MEETING_CONTENT_HIDDEN_TEXT}` — MeetingCard · l.528, when `meetingWithDetails && !canReadContent`
- `{MEETING_CONTENT_HIDDEN_TEXT}` — MeetingCard · l.556, when `isExpanded && meetingWithDetails && !(activeSection === 'summary') && !canReadContent`

**Other texts on screen** (12)

- «No hay resumen o notas disponibles.» — renderSummarySection · l.166, when `!meeting.summary && !meeting.notes`
- «No se registraron acuerdos en esta reunión.» — renderAgreementsSection · l.173, when `!meetingWithDetails?.agreements.length`
- «No se registraron compromisos en esta reunión.» — renderCommitmentsSection · l.199, when `!meetingWithDetails?.commitments.length`
- «No se asignaron tareas en esta reunión.» — renderTasksSection · l.219, when `!meetingWithDetails?.tasks.length`
- «No se adjuntaron documentos en esta reunión.» — renderDocumentsSection · l.260, when `attachments.length === 0`
- «Esta reunión está en borrador» (title) — MeetingCard · l.302, when `meeting.status === 'borrador'`
- «Borrador» — MeetingCard · l.310, when `meeting.status === 'borrador'`
- «{meeting.duration_minutes} min» — MeetingCard · l.334
- «{profileName(attendee.user_profile, …} / Participante» — MeetingCard · l.371, when `meetingWithDetails && meetingWithDetails.attendees && meetingWithDetails.attendees.length > 0 && each meetingWithDetails.attendees.slice(0, 5)`
- «{meetingWithDetails.attendees.length} participante s» — MeetingCard · l.384, when `meetingWithDetails && meetingWithDetails.attendees && meetingWithDetails.attendees.length > 0`
- «{taskStats.completedTasks} / {taskStats.totalTasks} completadas» — MeetingCard · l.433, when `taskStats && taskStats.totalTasks > 0`
- «{taskStats.overdueTasks} vencidas» — MeetingCard · l.441, when `taskStats && taskStats.totalTasks > 0 && taskStats.overdueTasks > 0`

**Reads and writes the database directly:** `table:meeting_attachments` (select)

### components/meetings/MeetingDeletionModal.tsx

Used by: `/community/workspace`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Sin permisos para eliminar» | h3 | `!(checkingPermission) && !hasPermission` · screen size: `sm:block` | MeetingDeletionModal · l.157 |
| «Eliminar Reunión» | h3 | `!(checkingPermission) && !(!hasPermission)` · screen size: `sm:block` | MeetingDeletionModal · l.179 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar» | `{handleClose}` | `!(checkingPermission) && !hasPermission` · screen size: `sm:block` |  |  | MeetingDeletionModal · l.163 |
| «[icon XIcon]» | `{handleClose}` | `!(checkingPermission) && !(!hasPermission)` · screen size: `sm:block` | `{isDeleting}` |  | MeetingDeletionModal · l.183 |
| «Cancelar» | `{handleClose}` | `!(checkingPermission) && !(!hasPermission)` · screen size: `sm:block` | `{isDeleting}` |  | MeetingDeletionModal · l.281 |
| «Archivando... / Eliminando... / Archivar reunión / Eliminar permanentemente» | `{handleDelete}` | `!(checkingPermission) && !(!hasPermission)` · screen size: `sm:block` | `{isDeleting \|\| confirmText.toLowerCase() !== CONFIRM_PHRASE}` |  | MeetingDeletionModal · l.289 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{handleClose}` | screen size: `sm:block` | MeetingDeletionModal · l.140 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Archivar reunión La reunión se ocultará pero podrá ser recuperada posteriormente» | radio | `deletionType` · disabled: `{isDeleting}` |  | `!(checkingPermission) && !(!hasPermission)` · screen size: `sm:block` |  | MeetingDeletionModal · l.202 |
| «Eliminar permanentemente La reunión y todos sus datos serán eliminados de forma irreversible» | radio | `deletionType` · disabled: `{isDeleting}` |  | `!(checkingPermission) && !(!hasPermission)` · screen size: `sm:block` |  | MeetingDeletionModal · l.218 |
| «Para confirmar, escribe &quot; {CONFIRM_PHRASE} &quot;» | text | «Escribe aquí para confirmar» · disabled: `{isDeleting}` |  | `!(checkingPermission) && !(!hasPermission)` · screen size: `sm:block` |  | MeetingDeletionModal · l.268 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Sin permisos para eliminar» | written in this file |  |  | MeetingDeletionModal · l.136 |
| «(sin título)» | written in this file |  |  | MeetingDeletionModal · l.139 |

**Toasts** (9)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al verificar permisos» |  | checkPermissionAndLoadDetails · l.70 |
| error | «Por favor escribe la frase de confirmación correctamente» | `confirmText.toLowerCase() !== CONFIRM_PHRASE` | handleDelete · l.78 |
| success | «Reunión archivada exitosamente» | `deletionType === 'soft' && result.success` | handleDelete · l.89 |
| error | «Error al archivar la reunión» | `deletionType === 'soft' && !(result.success)` | handleDelete · l.93 |
| success | «{message}» | `!(deletionType === 'soft') && result.success` | handleDelete · l.103 |
| error | «{error}» | `!(deletionType === 'soft') && result.success && result.errors.length > 0` | handleDelete · l.107 |
| error | «Error al eliminar la reunión» | `!(deletionType === 'soft') && !(result.success)` | handleDelete · l.113 |
| error | «{error}» | `!(deletionType === 'soft') && !(result.success)` | handleDelete · l.114 |
| error | «Error inesperado al eliminar la reunión» |  | handleDelete · l.119 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | MeetingDeletionModal · l.133 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `CONFIRM_PHRASE` | «eliminar reunión» | MeetingDeletionModal · l.48 |
| `message` | «Reunión eliminada permanentemente» | handleDelete · l.99 |

**Other texts on screen** (12)

- «No tienes permisos para eliminar esta reunión. Solo el creador, administradores, o líderes de la comunidad pueden eliminar reuniones.» — MeetingDeletionModal · l.161, when `!(checkingPermission) && !hasPermission`, screen size: `sm:block`
- «Estás a punto de eliminar la reunión:» — MeetingDeletionModal · l.196, when `!(checkingPermission) && !(!hasPermission)`, screen size: `sm:block`
- «&quot; {meetingTitle} &quot;» — MeetingDeletionModal · l.196, when `!(checkingPermission) && !(!hasPermission)`, screen size: `sm:block`
- «Archivar reunión La reunión se ocultará pero podrá ser recuperada posteriormente» (label) — MeetingDeletionModal · l.201, when `!(checkingPermission) && !(!hasPermission)`, screen size: `sm:block`
- «Eliminar permanentemente La reunión y todos sus datos serán eliminados de forma irreversible» (label) — MeetingDeletionModal · l.217, when `!(checkingPermission) && !(!hasPermission)`, screen size: `sm:block`
- «Se eliminarán permanentemente:» — MeetingDeletionModal · l.237, when `!(checkingPermission) && !(!hasPermission) && deletionType === 'hard' && meetingDetails`, screen size: `sm:block`
- «{meetingDetails.agreements?.length} acuerdos» — MeetingDeletionModal · l.241, when `!(checkingPermission) && !(!hasPermission) && deletionType === 'hard' && meetingDetails`, screen size: `sm:block`
- «{meetingDetails.commitments?.length} compromisos» — MeetingDeletionModal · l.245, when `!(checkingPermission) && !(!hasPermission) && deletionType === 'hard' && meetingDetails`, screen size: `sm:block`
- «{meetingDetails.tasks?.length} tareas» — MeetingDeletionModal · l.249, when `!(checkingPermission) && !(!hasPermission) && deletionType === 'hard' && meetingDetails`, screen size: `sm:block`
- «{meetingDetails.attendees?.length} registros de participantes» — MeetingDeletionModal · l.253, when `!(checkingPermission) && !(!hasPermission) && deletionType === 'hard' && meetingDetails`, screen size: `sm:block`
- «Todos los archivos adjuntos» — MeetingDeletionModal · l.257, when `!(checkingPermission) && !(!hasPermission) && deletionType === 'hard' && meetingDetails`, screen size: `sm:block`
- «Para confirmar, escribe &quot; {CONFIRM_PHRASE} &quot;» (label) — MeetingDeletionModal · l.265, when `!(checkingPermission) && !(!hasPermission)`, screen size: `sm:block`

### components/meetings/MeetingDetailsModal.tsx

Used by: `/community/workspace`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{meeting.title}» | h2 | `!(loading) && meeting` · screen size: `sm:block` | MeetingDetailsModal · l.183 |
| «Resumen» | h3 | `!(loading) && meeting && activeTab === 'summary' && hasSummary` · screen size: `sm:block` | MeetingDetailsModal · l.369 |
| «Notas» | h3 | `!(loading) && meeting && activeTab === 'summary' && hasNotes` · screen size: `sm:block` | MeetingDetailsModal · l.375 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon XIcon]» | `{onClose}` | `!(loading) && meeting` · screen size: `sm:block` |  |  | MeetingDetailsModal · l.200 |
| «Enviar correo de actualización» · tooltip «Disponible próximamente» |  | `!(loading) && meeting && meeting.status === 'completada' && meeting.finalized_at` · screen size: `sm:block` | `true` |  | MeetingDetailsModal · l.229 |
| «{tab.label} ({tab.count})» | `{() => setActiveTab(tab.id)}` | `!(loading) && meeting && each ([ { id: 'summary', label: 'Resumen y Notas', ico…` · screen size: `sm:block` |  |  | MeetingDetailsModal · l.336 |
| «[icon DownloadIcon]» · tooltip «Descargar documento» | `{() => handleDownload(attachment)}` | `canReadContent && activeTab === 'documents' && !(loadingAttachments) && attachments.length > 0 && each attachments` · screen size: `sm:block` |  |  | MeetingDetailsModal · l.527 |
| «Cerrar» | `{onClose}` | `!(loading) && meeting` · screen size: `sm:block` |  |  | MeetingDetailsModal · l.549 |
| «Eliminar Reunión» | `{() => { onClose(); // Small delay so the modal's close transition finishes // b…}` | `!(loading) && meeting && canDelete && onDelete` · screen size: `sm:block` |  |  | MeetingDetailsModal · l.556 |
| «Editar Reunión» | `{() => { onEdit(meeting.id); onClose(); }}` | `!(loading) && meeting && canEdit && onEdit` · screen size: `sm:block` |  |  | MeetingDetailsModal · l.573 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onClose}` | screen size: `sm:block` | MeetingDetailsModal · l.164 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {profileName(attendee.user_profile, 'Asistente')} · {attendee.user_profile.avatar_url} | `activeTab === 'attendees' && meeting.attendees && meeting.attendees.length > 0 && each meeting.attendees && attendee.user_profile && attendee.user_profile.avatar_url` · screen size: `sm:block` |  | MeetingDetailsModal · l.396 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «{meeting.title}» | written in this file |  |  | MeetingDetailsModal · l.160 |
| «(sin título)» | written in this file |  |  | MeetingDetailsModal · l.163 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No se pudo cargar la información de la reunión» | `!(details)` | loadMeetingDetails · l.95 |
| error | «Error al cargar los detalles de la reunión» |  | loadMeetingDetails · l.99 |
| error | «No se pudo abrir el archivo» | `!url` | handleDownload · l.147 |
| error | «Error al descargar el archivo» |  | handleDownload · l.153 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{url}` | `window.open` |  | handleDownload · l.150 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | MeetingDetailsModal · l.157 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `RichTextView` |  | `!(loading) && meeting && activeTab === 'summary' && hasSummary` · screen size: `sm:block` |  | MeetingDetailsModal · l.370 |
| `RichTextView` |  | `!(loading) && meeting && activeTab === 'summary' && hasNotes` · screen size: `sm:block` |  | MeetingDetailsModal · l.376 |
| `RichTextView` |  | `meeting && canReadContent && activeTab === 'agreements' && meeting.agreements && meeting.agreements.length > 0 && each meeting.agreements` · screen size: `sm:block` |  | MeetingDetailsModal · l.440 |
| `TaskTracker` | itemType: commitment | `meeting && canReadContent && activeTab === 'commitments' && meeting.commitments.length > 0 && each meeting.commitments` · screen size: `sm:block` |  | MeetingDetailsModal · l.469 |
| `TaskTracker` | itemType: task | `meeting && canReadContent && activeTab === 'tasks' && meeting.tasks.length > 0 && each meeting.tasks` · screen size: `sm:block` |  | MeetingDetailsModal · l.491 |

**Other texts written in the code (safety net: not tied to an element by the script)** (8)

| Text | Where |
|---|---|
| «Usuario» | MeetingDetailsModal · l.219 |
| «Resumen y Notas» | MeetingDetailsModal · l.287 |
| «Participantes» | MeetingDetailsModal · l.294 |
| «Acuerdos» | MeetingDetailsModal · l.301 |
| «Compromisos» | MeetingDetailsModal · l.310 |
| «Tareas» | MeetingDetailsModal · l.317 |
| «Documentos» | MeetingDetailsModal · l.324 |
| «Usuario sin nombre» | MeetingDetailsModal · l.409 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid=meeting-content-hidden` | MeetingDetailsModal · l.357 |
| timer | `setTimeout(…, CLOSE_BEFORE_DELETE_MS)` | MeetingDetailsModal · l.561 |

**Values shown from data** (9)

- `{meetingStatusLabels[meeting.status]} / {meeting.status}` — MeetingDetailsModal · l.187, when `!(loading) && meeting`, screen size: `sm:block`
- `{formatDate(meeting.meeting_date)}` — MeetingDetailsModal · l.192, when `!(loading) && meeting`, screen size: `sm:block`
- `{meeting.location}` — MeetingDetailsModal · l.247, when `!(loading) && meeting && meeting.location`, screen size: `sm:block`
- `{MEETING_CONTENT_HIDDEN_TEXT}` — MeetingDetailsModal · l.357, when `!(loading) && meeting && !canReadContent`, screen size: `sm:block`
- `{index + 1}` — MeetingDetailsModal · l.436, when `meeting && canReadContent && activeTab === 'agreements' && meeting.agreements && meeting.agreements.length > 0 && each meeting.agreements`, screen size: `sm:block`
- `{agreement.category}` — MeetingDetailsModal · l.446, when `canReadContent && activeTab === 'agreements' && meeting.agreements && meeting.agreements.length > 0 && each meeting.agreements && agreement.category`, screen size: `sm:block`
- `{getFileIcon(attachment.file_type)}` — MeetingDetailsModal · l.521, when `canReadContent && activeTab === 'documents' && !(loadingAttachments) && attachments.length > 0 && each attachments`, screen size: `sm:block`
- `{attachment.filename}` — MeetingDetailsModal · l.523, when `canReadContent && activeTab === 'documents' && !(loadingAttachments) && attachments.length > 0 && each attachments`, screen size: `sm:block`
- `{formatFileSize(attachment.file_size)}` — MeetingDetailsModal · l.524, when `canReadContent && activeTab === 'documents' && !(loadingAttachments) && attachments.length > 0 && each attachments`, screen size: `sm:block`

**Other texts on screen** (14)

- «{meeting.duration_minutes} min» — MeetingDetailsModal · l.196, when `!(loading) && meeting`, screen size: `sm:block`
- «Finalizada el» — MeetingDetailsModal · l.217, when `!(loading) && meeting && meeting.status === 'completada' && meeting.finalized_at`, screen size: `sm:block`
- «por» — MeetingDetailsModal · l.219, when `!(loading) && meeting && meeting.status === 'completada' && meeting.finalized_at && meeting.finalized_by_profile`, screen size: `sm:block`
- «Resumen enviado a {audienceProseLabel(meeting.finalize…} .» — MeetingDetailsModal · l.223, when `!(loading) && meeting && meeting.status === 'completada' && meeting.finalized_at && meeting.finalize_audience`, screen size: `sm:block`
- «Facilitador: {profileName(nameOnly(meeting.facili…}» — MeetingDetailsModal · l.253, when `!(loading) && meeting && meeting.facilitator`, screen size: `sm:block`
- «Creado por: {profileName(nameOnly(meeting.create…}» — MeetingDetailsModal · l.261, when `!(loading) && meeting && meeting.created_by_profile`, screen size: `sm:block`
- «{meeting.attendees.length} participante s» — MeetingDetailsModal · l.269, when `!(loading) && meeting && meeting.attendees && meeting.attendees.length > 0`, screen size: `sm:block`
- «No hay resumen o notas para esta reunión.» — MeetingDetailsModal · l.381, when `!(loading) && meeting && activeTab === 'summary' && !hasSummary && !hasNotes`, screen size: `sm:block`
- «{profileName(attendee.user_profile, …} / Participante» — MeetingDetailsModal · l.407, when `meeting && activeTab === 'attendees' && meeting.attendees && meeting.attendees.length > 0 && each meeting.attendees`, screen size: `sm:block`
- «Facilitador / Secretario / {attendee.role}» — MeetingDetailsModal · l.413, when `activeTab === 'attendees' && meeting.attendees && meeting.attendees.length > 0 && each meeting.attendees && attendee.role && attendee.role !== 'participant'`, screen size: `sm:block`
- «No se registraron participantes para esta reunión.» — MeetingDetailsModal · l.423, when `!(loading) && meeting && activeTab === 'attendees' && !(meeting.attendees && meeting.attendees.length > 0)`, screen size: `sm:block`
- «No hay acuerdos registrados para esta reunión.» — MeetingDetailsModal · l.456, when `!(loading) && meeting && canReadContent && activeTab === 'agreements' && !(meeting.agreements && meeting.agreements.length > 0)`, screen size: `sm:block`
- «No hay documentos adjuntos a esta reunión.» — MeetingDetailsModal · l.539, when `meeting && canReadContent && activeTab === 'documents' && !(loadingAttachments) && !(attachments.length > 0)`, screen size: `sm:block`
- «No se pudo cargar la información de la reunión.» — MeetingDetailsModal · l.587, when `!(loading) && !(meeting)`, screen size: `sm:block`

**Reads and writes the database directly:** `table:meeting_attachments` (select)

### components/meetings/MeetingDocumentationModal.tsx

Used by: `/community/workspace`

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Reunión / Documentar Reunión» | h2 |  | MeetingDocumentationModal · l.1577 |
| «Documentos» | h3 | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS` | MeetingDocumentationModal · l.1913 |
| «Archivos existentes ( {existingAttachments.length} )» | h4 | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && existingAttachments.length > 0` | MeetingDocumentationModal · l.1944 |
| «Archivos seleccionados ( {selectedFiles.length} )» | h4 | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && selectedFiles.length > 0` | MeetingDocumentationModal · l.1971 |
| «Acuerdos» | h3 | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS` | MeetingDocumentationModal · l.1991 |
| «Compromisos» | h3 | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS` | MeetingDocumentationModal · l.2049 |
| «Tareas» | h3 | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS` | MeetingDocumentationModal · l.2133 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon XIcon]» | `{handleClose}` |  | `{isSubmitting}` | `testid=meeting-modal-close` | MeetingDocumentationModal · l.1607 |
| «Agregar Acuerdo» | `{addAgreement}` | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS` |  |  | MeetingDocumentationModal · l.1994 |
| «[icon TrashIcon]» | `{() => removeAgreement(index)}` | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.agreements.length === 0) && each formData.agreements` |  |  | MeetingDocumentationModal · l.2015 |
| «Agregar Compromiso» | `{addCommitment}` | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS` |  |  | MeetingDocumentationModal · l.2052 |
| «[icon TrashIcon]» | `{() => removeCommitment(index)}` | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.commitments.length === 0) && each formData.commitments` |  |  | MeetingDocumentationModal · l.2077 |
| «Agregar Tarea» | `{addTask}` | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS` |  |  | MeetingDocumentationModal · l.2136 |
| «[icon TrashIcon]» · aria «Eliminar tarea» | `{() => removeTask(index)}` | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks` |  | `testid=meeting-task-remove-{index}` | MeetingDocumentationModal · l.2159 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{handleClose}` |  | MeetingDocumentationModal · l.1571 |

**Fields** (17)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título de la Reunión *» | text | «Ej: Reunión de planificación semanal» |  | `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION` |  | MeetingDocumentationModal · l.1680 |
| «Fecha y Hora *» | datetime-local | also `onBlur={(e) => setMeetingDateIncomplete(e.currentTarget.validity.badInput)}` |  | `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION` | `testid=meeting-date` | MeetingDocumentationModal · l.1694 |
| «Duración (minutos)» | number | `min=15 max=480` |  | `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION` |  | MeetingDocumentationModal · l.1716 |
| «Ubicación» | text | «Ej: Sala de reuniones, Zoom, etc.» |  | `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION` |  | MeetingDocumentationModal · l.1731 |
| «{profileName(user, 'Usuario sin nomb…} [( {PROTECTED_ROLE_LABELS[protectedAtte…} )]» | checkbox | disabled: `{protectedAttendees.has(user.id)}` |  | `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && each availableUsers` | `testid=meeting-attendee-{user.id}` | MeetingDocumentationModal · l.1749 |
| «Usuario fuera de la comunidad» | checkbox | disabled: `true` · `readOnly=true` |  | `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && each historicalAttendeeIds` |  | MeetingDocumentationModal · l.1780 |
| «{profileName(user, 'Usuario sin nomb…}» | checkbox |  |  | `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && each readerCandidates` | `testid=meeting-reader-{user.id}` | MeetingDocumentationModal · l.1824 |
| «Estado de la Reunión» | select | disabled: `{isFinalized}` | «(lista) {label}» | `!(loadingMeeting) && currentStep === MeetingFormStep.SUMMARY` | `testid=meeting-status-select` | MeetingDocumentationModal · l.1853 |
| «Seleccionar archivos» | file | `file-upload` · accepts `.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif` · `multiple=true` |  | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS` · hidden by its class (`sr-only`); another control opens it or it is for screen readers | `id=file-upload (id used by code)` | MeetingDocumentationModal · l.1924 |
|  | select | disabled: `{assigneePickerDisabled}` | «Asignar a…», «(lista) {profileName(user, 'Usuario sin nomb…}» | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.commitments.length === 0) && each formData.commitments` | `testid=meeting-commitment-assignee-{index}` | MeetingDocumentationModal · l.2097 |
| «Fecha límite del compromiso» | date |  |  | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.commitments.length === 0) && each formData.commitments` | `testid=meeting-commitment-due-{index}` | MeetingDocumentationModal · l.2113 |
| «Título de la tarea...» | text | «Título de la tarea...» |  | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks` | `testid=meeting-task-title-{index}` | MeetingDocumentationModal · l.2170 |
|  | select | disabled: `{assigneePickerDisabled}` | «Asignar a…», «(lista) {profileName(user, 'Usuario sin nomb…}» | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks` | `testid=meeting-task-assignee-{index}` | MeetingDocumentationModal · l.2190 |
| «Fecha límite de la tarea» | date |  |  | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks` | `testid=meeting-task-due-{index}` | MeetingDocumentationModal · l.2206 |
|  | select |  | «(lista) {label}» | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks` |  | MeetingDocumentationModal · l.2215 |
| «Categoría (opcional)» | text | «Categoría (opcional)» |  | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks` |  | MeetingDocumentationModal · l.2227 |
| «Horas estimadas» | number | «Horas estimadas» · `min=0 step=0.5` |  | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks` |  | MeetingDocumentationModal · l.2235 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Reunión / Documentar Reunión» | written in this file |  |  | MeetingDocumentationModal · l.1569 |
| `FinalizeMeetingDialog` | component | `{finalizeOpen}` |  | MeetingDocumentationModal · l.2281 |

**Browser confirm()** (3)

| Question | When | Where |
|---|---|---|
| «Esta reunión fue modificada{who} mientras editabas. / ¿Recargar para ver los últimos cambios? Se perderán los cambios locales no guardados.» | `res.status === 409` | MeetingDocumentationModal · l.766 |
| «{UNSAVED_CLOSE_QUESTION}» |  | closeForm · l.831 |
| «{SAVE_CONFLICT_MESSAGE} ¿Recargar ahora?» | `targetMeetingId && updateResult.conflict` | persistMeetingData · l.1002 |

**Browser alert()** (1)

| Text | When | Where |
|---|---|---|
| «{msg}» | `res.status === 409 && (body?.code === 'meeting_finalized_concurrently' \|\| body?.code === 'meeting_not_draft') && typeof window !== 'undefined'` | MeetingDocumentationModal · l.760 |

**Toasts** (17)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «{MEMBERS_LOAD_ERROR_MESSAGE}» |  | MeetingDocumentationModal · l.420 |
| error | «Error al cargar los datos de la reunión» |  | loadMeetingData · l.618 |
| error | «Por favor completa los campos requeridos» | `runValidations && !validateStep(currentStep)` | persistMeetingData · l.911 |
| error | «{meetingInfoProblem()}» | `!formData.meeting_info.title \|\| !meetingDateIso` | persistMeetingData · l.920 |
| error | «{saveFailureSummary(itemProblems)}» | `itemProblems.length > 0` | persistMeetingData · l.932 |
| error | «{AUTOSAVE_STILL_RUNNING_MESSAGE}» | `inFlightAutosave && !answered` | persistMeetingData · l.972 |
| error | «{SAVE_CONFLICT_MESSAGE}» | `targetMeetingId && updateResult.conflict` | persistMeetingData · l.1000 |
| error | «No se pudo guardar la reunión.» | `!targetMeetingId \|\| problems.length > 0` | persistMeetingData · l.1050 |
| error | «{saveFailureSummary(problems)}» | `problems.length > 0` | persistMeetingData · l.1117 |
| success | «Borrador guardado» |  | handleSaveDraft · l.1199 |
| error | «Error inesperado al guardar el borrador» |  | handleSaveDraft · l.1203 |
| error | «No se pudo guardar la reunión antes de finalizarla.» |  | handleOpenFinalize · l.1224 |
| error | «Por favor completa los campos requeridos» | `!validateStep(currentStep)` | handleNext · l.1253 |
| error | «Error inesperado al {mode === 'edit' ? 'actualiz…} la reunión» |  | handleSubmit · l.1279 |
| success | «Reunión actualizada correctamente / Reunión guardada como borrador. Ábrela y pulsa «Finalizar reunión» para enviar el resumen.» | `saved && mountedRef.current` | handleSubmit · l.1288 |
| error | «Tipo de archivo no permitido: {file.name}» | `!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type)` | handleFileSelect · l.1427 |
| error | «Archivo demasiado grande: {file.name}. Máximo {MAX_ATTACHMENT_LABEL}.» | `file.size > MAX_ATTACHMENT_BYTES` | handleFileSelect · l.1434 |

**Draws nothing when** (13)

| Condition | Where |
|---|---|
| `!isOpen` | MeetingDocumentationModal · l.401 |
| `!active` | MeetingDocumentationModal · l.411 |
| `!active \|\| controller.signal.aborted` | MeetingDocumentationModal · l.416 |
| `!isOpen \|\| !lastSavedAt` | MeetingDocumentationModal · l.432 |
| `workSessionEndedRef.current` | MeetingDocumentationModal · l.456 |
| `typeof window === 'undefined'` | MeetingDocumentationModal · l.481 |
| `!id \|\| autosaveInFlightRef.current` | MeetingDocumentationModal · l.717 |
| `currentMeetingIdRef.current !== id` | MeetingDocumentationModal · l.721 |
| `saveInFlightRef.current` | MeetingDocumentationModal · l.723 |
| `storedStatusRef.current !== MEETING_STATUS.BORRADOR` | MeetingDocumentationModal · l.724 |
| `!currentMeetingId` | MeetingDocumentationModal · l.813 |
| `storedStatusRef.current !== MEETING_STATUS.BORRADOR` | MeetingDocumentationModal · l.814 |
| `!isOpen` | MeetingDocumentationModal · l.1566 |

**Pieces placed here, with the texts and settings handed to them** (9)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `WorkSessionBanner` |  | `formData.summary_info.status === MEETING_STATUS.BORRADOR` |  | MeetingDocumentationModal · l.1620 |
| `TipTapEditor` | placeholder: Resumen de la reunión… | `!(loadingMeeting) && currentStep === MeetingFormStep.SUMMARY` |  | MeetingDocumentationModal · l.1872 |
| `TipTapEditor` | placeholder: Notas adicionales, observaciones… | `!(loadingMeeting) && currentStep === MeetingFormStep.SUMMARY` |  | MeetingDocumentationModal · l.1892 |
| `AttachmentRow` |  | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && existingAttachments.length > 0 && each existingAttachments` |  | MeetingDocumentationModal · l.1949 |
| `AttachmentRow` |  | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && selectedFiles.length > 0 && each selectedFiles` |  | MeetingDocumentationModal · l.1974 |
| `TipTapEditor` | placeholder: Describe el acuerdo… | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.agreements.length === 0) && each formData.agreements` |  | MeetingDocumentationModal · l.2023 |
| `TipTapEditor` | placeholder: Describe el compromiso… | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.commitments.length === 0) && each formData.commitments` |  | MeetingDocumentationModal · l.2086 |
| `TipTapEditor` | placeholder: Describe la tarea… | `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks` |  | MeetingDocumentationModal · l.2179 |
| `MeetingModalFooter` |  |  |  | MeetingDocumentationModal · l.2259 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (10)

| Name | Texts | Where |
|---|---|---|
| `FINALIZED_STATE_LOCKED_MESSAGE` | «Esta reunión ya fue finalizada: su estado no se puede cambiar.» | l.109 |
| `SAVE_CONFLICT_MESSAGE` | «Otra persona guardó esta reunión mientras editabas. Recarga para ver sus cambios; lo que escribiste no se guardó.» | l.113 |
| `UNSAVED_CLOSE_QUESTION` | «Tienes cambios sin guardar. ¿Cerrar y descartarlos?» | l.117 |
| `AUTOSAVE_STILL_RUNNING_MESSAGE` | «No se pudo guardar: el guardado automático sigue en curso. Inténtalo de nuevo en unos segundos.» | l.164 |
| `MEMBERS_LOAD_ERROR_MESSAGE` | «No se pudieron cargar los miembros de la comunidad. Intenta nuevamente.» | l.168 |
| `STEPS` | «Información», «Datos básicos de la reunión», «Resumen», «Resumen y notas de la reunión», «Acuerdos y Compromisos», «Acuerdos, compromisos y tareas» | l.207 |
| `msg` | «Esta reunión fue finalizada mientras editabas. Recargando… / Esta reunión ya no está en borrador. Recargando…» | MeetingDocumentationModal · l.756 |
| `who` | «por {body.updated_by_name}» | MeetingDocumentationModal · l.765 |
| `meetingInfoProblem()` | «Escribe el título de la reunión.», «La fecha y hora están incompletas: completa día, mes, año, hora y minutos.», «Indica la fecha y hora de la reunión.» | meetingInfoProblem · l.1246 |
| `historicalAssigneeLabel()` | «Usuario fuera de la comunidad», «No se pudo verificar la membresía», «Verificando membresía…» | historicalAssigneeLabel · l.1468 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Escribe el título de la reunión.» | MeetingDocumentationModal · l.1246 |
| «Indica la fecha y hora de la reunión.» | MeetingDocumentationModal · l.1248 |
| «{profileName(member, 'Usuari…} (no es participante)» | MeetingDocumentationModal · l.1467 |
| «Usuario sin nombre» | MeetingDocumentationModal · l.1467 |
| «No se pudo verificar la membresía» | MeetingDocumentationModal · l.1469 |
| «Verificando membresía…» | MeetingDocumentationModal · l.1470 |
| «Una persona» | MeetingDocumentationModal · l.1531 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (16)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, SAVED_TICK_INTERVAL_MS)` | MeetingDocumentationModal · l.433 |
| listener | `window.addEventListener('beforeunload')` | MeetingDocumentationModal · l.487 |
| listener | `window.addEventListener('pagehide')` | MeetingDocumentationModal · l.488 |
| timer | `setTimeout(…, AUTOSAVE_DEBOUNCE_MS)` | MeetingDocumentationModal · l.816 |
| timer | `setTimeout(…, AUTOSAVE_WAIT_LIMIT_MS)` | persistMeetingData · l.966 |
| mark | `testid=meeting-{kind}-{index}-errors` | renderItemMessages · l.1503 |
| mark | `testid=meeting-no-participants-{scope}` | renderNoParticipantsHint · l.1513 |
| mark | `testid=meeting-members-status-{scope}` | renderMembersStatus · l.1544 |
| mark | `testid=meeting-members-status-{scope}` | renderMembersStatus · l.1551 |
| mark | `testid=meeting-members-status-{scope}` | renderMembersStatus · l.1558 |
| mark | `testid=meeting-unsaved-changes` | MeetingDocumentationModal · l.1603 |
| mark | `testid=meeting-step-body` | MeetingDocumentationModal · l.1655 |
| mark | `testid=meeting-save-problems` | MeetingDocumentationModal · l.1663 |
| mark | `testid=meeting-date-incomplete` | MeetingDocumentationModal · l.1706 |
| mark | `testid=meeting-assignee-not-participant-warning` | MeetingDocumentationModal · l.1792 |
| mark | `testid=meeting-readers` | MeetingDocumentationModal · l.1817 |

**Values shown from data** (6)

- `{problem.message}` — renderItemMessages · l.1505, when `each messages`
- `{STEPS[currentStep].title} : {STEPS[currentStep].description}` — MeetingDocumentationModal · l.1580
- `{step.title}` — MeetingDocumentationModal · l.1639, when `each STEPS`
- `{problem.message}` — MeetingDocumentationModal · l.1667, when `!(loadingMeeting) && meetingLevelProblems.length > 0 && each meetingLevelProblems`
- `{index + 1}` — MeetingDocumentationModal · l.2012, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.agreements.length === 0) && each formData.agreements`
- `{index + 1}` — MeetingDocumentationModal · l.2074, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.commitments.length === 0) && each formData.commitments`

**Other texts on screen** (34)

- «Marca primero a los participantes en el paso 1 (Información): solo a ellos se les puede asignar.» — renderNoParticipantsHint · l.1514, when `membersLoadState === 'success' && participantOptions.length === 0`
- «Cargando miembros de la comunidad…» — renderMembersStatus · l.1545, when `membersLoadState === 'idle' \|\| membersLoadState === 'loading'`
- «No se pudieron cargar los miembros de la comunidad.» — renderMembersStatus · l.1552, when `membersLoadState === 'error'`
- «Esta comunidad aún no tiene miembros asignados.» — renderMembersStatus · l.1559, when `availableUsers.length === 0`
- «Guardando…» — MeetingDocumentationModal · l.1588, when `currentMeetingId && storedStatusRef.current === MEETING_STATUS.BORRADOR && savingIndicator === 'saving'`
- «Error al guardar» — MeetingDocumentationModal · l.1590, when `currentMeetingId && storedStatusRef.current === MEETING_STATUS.BORRADOR && savingIndicator === 'error'`
- «Guardado hace {formatDistanceToNowStrict(lastSaved…}» — MeetingDocumentationModal · l.1593, when `currentMeetingId && storedStatusRef.current === MEETING_STATUS.BORRADOR && savingIndicator === 'idle' && lastSavedAt`
- «· Cambios sin guardar» — MeetingDocumentationModal · l.1604, when `isDirty`
- «No se guardó todo:» — MeetingDocumentationModal · l.1664, when `!(loadingMeeting) && meetingLevelProblems.length > 0`
- «Título de la Reunión *» (label) — MeetingDocumentationModal · l.1677, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION`
- «Fecha y Hora *» (label) — MeetingDocumentationModal · l.1691, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION`
- «La fecha y hora están incompletas: completa día, mes, año, hora y minutos.» — MeetingDocumentationModal · l.1707, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && meetingDateIncomplete`
- «Duración (minutos)» (label) — MeetingDocumentationModal · l.1713, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION`
- «Ubicación» (label) — MeetingDocumentationModal · l.1728, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION`
- «Asistentes» (label) — MeetingDocumentationModal · l.1742, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION`
- «{profileName(user, 'Usuario sin nomb…} [( {PROTECTED_ROLE_LABELS[protectedAtte…} )]» (label) — MeetingDocumentationModal · l.1748, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && each availableUsers`
- «Usuario fuera de la comunidad» (label) — MeetingDocumentationModal · l.1775, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && each historicalAttendeeIds`
- «{person.name} ya no es participante, pero tiene [{person.commitments} compromiso{person.commitments === 1 ? …}] [y] [{person.tasks} tarea{person.tasks === 1 ? '' : '…}] asignad o / os . Vuelve a marcarla o reasigna en el paso 3 antes de gu…» — MeetingDocumentationModal · l.1797, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && assigneesNotParticipating.length > 0 && each assigneesNotParticipating`
- «Otras personas con acceso» (label) — MeetingDocumentationModal · l.1811, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION`
- «Por ejemplo, alguien que no pudo asistir. Podrán ver los acuerdos, compromisos, tareas y documentos de esta reunión.» — MeetingDocumentationModal · l.1815, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION`
- «Todos los miembros de la comunidad son participantes.» — MeetingDocumentationModal · l.1820, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && membersLoadState === 'success' && availableUsers.length > 0 && readerCandidates.length === 0`
- «{profileName(user, 'Usuario sin nomb…}» (label) — MeetingDocumentationModal · l.1823, when `!(loadingMeeting) && currentStep === MeetingFormStep.INFORMATION && each readerCandidates`
- «Estado de la Reunión» (label) — MeetingDocumentationModal · l.1850, when `!(loadingMeeting) && currentStep === MeetingFormStep.SUMMARY`
- «Resumen de la Reunión *» (label) — MeetingDocumentationModal · l.1869, when `!(loadingMeeting) && currentStep === MeetingFormStep.SUMMARY`
- «Puedes incluir enlaces en el resumen. Los enlaces se mostrarán como texto clickeable.» — MeetingDocumentationModal · l.1884, when `!(loadingMeeting) && currentStep === MeetingFormStep.SUMMARY`
- «Notas Adicionales» (label) — MeetingDocumentationModal · l.1889, when `!(loadingMeeting) && currentStep === MeetingFormStep.SUMMARY`
- «Seleccionar archivos» (label) — MeetingDocumentationModal · l.1922, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS`
- «o arrastrar y soltar» — MeetingDocumentationModal · l.1934, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS`
- «PDF, Word, Excel, PowerPoint, o imágenes hasta {MAX_ATTACHMENT_LABEL}» — MeetingDocumentationModal · l.1936, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS`
- «No se han agregado acuerdos.» — MeetingDocumentationModal · l.2005, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && formData.agreements.length === 0`
- «No se han agregado compromisos.» — MeetingDocumentationModal · l.2064, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && formData.commitments.length === 0`
- «Los compromisos son opcionales.» — MeetingDocumentationModal · l.2065, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && formData.commitments.length === 0`
- «No se han agregado tareas.» — MeetingDocumentationModal · l.2147, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && formData.tasks.length === 0`
- «T {index + 1}» — MeetingDocumentationModal · l.2156, when `!(loadingMeeting) && currentStep === MeetingFormStep.AGREEMENTS && !(formData.tasks.length === 0) && each formData.tasks`

**Reads and writes the database directly:** `table:meeting_attachments` (select), `table:meeting_read_grants` (select), `table:meeting_work_sessions` (select), `table:profiles` (select)

### components/meetings/MeetingFilters.tsx

Used by: `/community/workspace`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Filtros [Activos]» | `{() => setIsExpanded(!isExpanded)}` |  |  |  | MeetingFilters · l.126 |
| «Limpiar» | `{onClearFilters}` | `hasActiveFilters()` |  |  | MeetingFilters · l.140 |

**Fields** (9)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar reuniones...» | text | «Buscar reuniones...» |  |  |  | MeetingFilters · l.114 |
| «Desde» | date |  |  | `isExpanded` |  | MeetingFilters · l.162 |
| «Hasta» | date |  |  | `isExpanded` |  | MeetingFilters · l.171 |
| «{meetingStatusLabels[status]}» | checkbox |  |  | `isExpanded && each statusOptions` · hidden by its class (`sr-only`); another control opens it or it is for screen readers |  | MeetingFilters · l.189 |
| «{priorityLabels[priority]}» | checkbox |  |  | `isExpanded && each priorityOptions` · hidden by its class (`sr-only`); another control opens it or it is for screen readers |  | MeetingFilters · l.217 |
| «Tareas asignadas a mí» | checkbox |  |  | `isExpanded` |  | MeetingFilters · l.244 |
| «Reuniones creadas por mí» | checkbox |  |  | `isExpanded` |  | MeetingFilters · l.255 |
| «Con tareas vencidas» | checkbox |  |  | `isExpanded` |  | MeetingFilters · l.266 |
| «Mis borradores (creador, facilitador, secretario o co-editor)» | checkbox |  |  | `isExpanded` |  | MeetingFilters · l.277 |

**Other texts on screen** (12)

- «Rango de Fechas» (label) — MeetingFilters · l.155, when `isExpanded`
- «Desde» (label) — MeetingFilters · l.161, when `isExpanded`
- «Hasta» (label) — MeetingFilters · l.170, when `isExpanded`
- «Estado de Reunión» (label) — MeetingFilters · l.183, when `isExpanded`
- «{meetingStatusLabels[status]}» (label) — MeetingFilters · l.188, when `isExpanded && each statusOptions`
- «Prioridad de Tareas» (label) — MeetingFilters · l.211, when `isExpanded`
- «{priorityLabels[priority]}» (label) — MeetingFilters · l.216, when `isExpanded && each priorityOptions`
- «Filtros Rápidos» (label) — MeetingFilters · l.239, when `isExpanded`
- «Tareas asignadas a mí» (label) — MeetingFilters · l.243, when `isExpanded`
- «Reuniones creadas por mí» (label) — MeetingFilters · l.254, when `isExpanded`
- «Con tareas vencidas» (label) — MeetingFilters · l.265, when `isExpanded`
- «Mis borradores (creador, facilitador, secretario o co-editor)» (label) — MeetingFilters · l.276, when `isExpanded`

### components/meetings/MeetingModalFooter.tsx

Used by: `/community/workspace`

**Buttons** (6)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Anterior» | `{onPrevious}` |  | `{currentStep === MeetingFormStep.INFORMATION \|\| isSubmitting \|\| isSavingDraft}` |  | MeetingModalFooter · l.67 |
| «Cancelar» | `{onClose}` |  | `{isSubmitting \|\| isSavingDraft}` |  | MeetingModalFooter · l.77 |
| «Guardando… / Guardar borrador» · tooltip «Guarda el estado actual como borrador sin validar el resumen» | `{onSaveDraft}` | `canSaveDraft` | `{isSubmitting \|\| isSavingDraft}` |  | MeetingModalFooter · l.86 |
| «Siguiente» | `{onNext}` | `currentStep < MeetingFormStep.AGREEMENTS` | `{isSubmitting \|\| isSavingDraft}` |  | MeetingModalFooter · l.97 |
| «Subiendo {selectedFileCount} archivo{selectedFileCount !== 1 ? '…}… / Guardando… / Guardar Cambios / Crear Reunión» | `{onSubmit}` | `!(currentStep < MeetingFormStep.AGREEMENTS)` | `{isSubmitting \|\| isSavingDraft}` |  | MeetingModalFooter · l.106 |
| «Finalizar reunión» | `{onOpenFinalize}` | `showFinalize` | `{isSubmitting \|\| isSavingDraft}` |  | MeetingModalFooter · l.128 |

### components/meetings/RichTextView.tsx

Used by: `/community/workspace`

**Values shown from data** (2)

- `{emptyText}` — RichTextView · l.39, when `!text && emptyText`
- `{text}` — RichTextView · l.44

### components/meetings/TaskTracker.tsx

Used by: `/community/workspace`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h3 | `!(itemType === 'commitment' && !isEmptyDoc(commitmentDoc))` | TaskTracker · l.203 |

**Buttons** (6)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Iniciar» | `{() => handleStatusChange('en_progreso')}` | `canUpdateProgress && item.status !== 'completado' && item.status === 'pendiente'` | `{isUpdating}` |  | TaskTracker · l.298 |
| «Completar» | `{() => handleStatusChange('completado')}` | `canUpdateProgress && item.status !== 'completado'` | `{isUpdating}` |  | TaskTracker · l.307 |
| «Reabrir» | `{() => handleStatusChange('en_progreso')}` | `canUpdateProgress && item.status === 'completado'` | `{isUpdating}` |  | TaskTracker · l.319 |
| «Notas» | `{() => setShowNotes(!showNotes)}` | `canUpdateProgress` |  |  | TaskTracker · l.329 |
| «Cancelar» | `{() => setShowNotes(false)}` | `canUpdateProgress && showNotes` |  |  | TaskTracker · l.371 |
| «Guardar» | `{saveNotes}` | `canUpdateProgress && showNotes` | `{isUpdating}` |  | TaskTracker · l.377 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Actualizar progreso: {item.progress_percentage} %» | range | disabled: `{isUpdating}` · `min=0 max=100 step=5` |  | `canUpdateProgress && item.status !== 'completado' && item.status !== 'cancelado'` |  | TaskTracker · l.344 |
| «Notas y comentarios» | textarea | «Agregar notas sobre el progreso...» |  | `canUpdateProgress && showNotes` |  | TaskTracker · l.363 |

**Toasts** (9)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «{itemType === 'task' ? 'Tare…} actualizado correctamente» | `result.success` | handleStatusChange · l.101 |
| error | «Error al actualizar estado» | `!(result.success)` | handleStatusChange · l.104 |
| error | «Error inesperado al actualizar estado» |  | handleStatusChange · l.108 |
| success | «Progreso actualizado» | `result.success` | handleProgressUpdate · l.129 |
| error | «Error al actualizar progreso» | `!(result.success)` | handleProgressUpdate · l.132 |
| error | «Error inesperado al actualizar progreso» |  | handleProgressUpdate · l.136 |
| success | «Notas guardadas» | `result.success` | saveNotes · l.150 |
| error | «Error al guardar notas» | `!(result.success)` | saveNotes · l.154 |
| error | «Error inesperado al guardar notas» |  | saveNotes · l.158 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `RichTextView` |  | `itemType === 'commitment' && !isEmptyDoc(commitmentDoc)` |  | TaskTracker · l.197 |
| `RichTextView` |  | `itemType === 'task' && !isEmptyDoc(taskDescriptionDoc)` |  | TaskTracker · l.208 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Tarea» | TaskTracker · l.101 |
| «Compromiso» | TaskTracker · l.101 |
| «Sin asignar» | TaskTracker · l.233 |

**Values shown from data** (8)

- `{getStatusIcon(item.status)}` — TaskTracker · l.192
- `{description}` — TaskTracker · l.214, when `!(itemType === 'task' && !isEmptyDoc(taskDescriptionDoc)) && description`
- `{statusLabels[item.status]}` — TaskTracker · l.222
- `{profileName(item.assigned_to_profil…}` — TaskTracker · l.233, when `item.assigned_to_profile`
- `{priorityLabels[priority]}` — TaskTracker · l.256, when `priority`
- `{category}` — TaskTracker · l.263, when `category`
- `{item.progress_percentage} %` — TaskTracker · l.280
- `{item.notes}` — TaskTracker · l.394, when `!canUpdateProgress && item.notes`

**Other texts on screen** (6)

- «( Hoy / {daysUntilDue}d / {Math.abs(daysUntilDue)}d vencido )» — TaskTracker · l.244, when `item.due_date && daysUntilDue !== null`
- «{estimatedHours} h estimadas» — TaskTracker · l.270, when `estimatedHours`
- «Progreso» — TaskTracker · l.279
- «Actualizar progreso: {item.progress_percentage} %» (label) — TaskTracker · l.341, when `canUpdateProgress && item.status !== 'completado' && item.status !== 'cancelado'`
- «Notas y comentarios» (label) — TaskTracker · l.360, when `canUpdateProgress && showNotes`
- «Notas:» — TaskTracker · l.393, when `!canUpdateProgress && item.notes`

### components/meetings/WorkSessionBanner.tsx

Used by: `/community/workspace`

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `sessions.length === 0` | WorkSessionBanner · l.23 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Alguien» | WorkSessionBanner · l.26 |

**Values shown from data** (1)

- `{name}` — WorkSessionBanner · l.35

**Other texts on screen** (7)

- «Iniciado por» — WorkSessionBanner · l.35
- «el» — WorkSessionBanner · l.35
- «Activo hace» — WorkSessionBanner · l.36
- «editor» — WorkSessionBanner · l.38, when `others > 0`
- «es» — WorkSessionBanner · l.38, when `others > 0`
- «adicional» — WorkSessionBanner · l.38, when `others > 0`
- «es» — WorkSessionBanner · l.38, when `others > 0`

### components/meetings/persistMeeting.ts

Used by: `/community/workspace`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «No se pudo confirmar quiénes tienen acceso a la reunión. Vuelve a guardar.» | readMeetingPeople · l.335 |

**Reads and writes the database directly:** `bucket:meeting-documents` (remove), `table:community_meetings` (insert, select), `table:meeting_agreements`, `table:meeting_attachments` (delete, insert, select), `table:meeting_attendees` (delete, insert, select), `table:meeting_commitments`, `table:meeting_read_grants` (delete, insert, select), `table:meeting_tasks`

### components/messaging/AttachmentPreview.tsx

Used by: `/community/workspace`

**Titles** (8)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Vista previa no disponible» | h3 | `!canPreview` | renderPreviewContent · l.122 |
| «{attachment.file_name}» | h3 | `attachment.mime_type.startsWith('audio/')` | renderPreviewContent · l.246 |
| «{attachment.file_name}» | h2 |  | AttachmentPreview · l.279 |
| «Error al cargar» | h3 | `!(loading) && previewError` | AttachmentPreview · l.344 |
| «Información del Archivo» | h3 |  | AttachmentPreview · l.360 |
| «Contexto del Mensaje» | h3 | `message` | AttachmentPreview · l.399 |
| «Descripción» | h3 | `attachment.description` | AttachmentPreview · l.439 |
| «Estadísticas» | h3 |  | AttachmentPreview · l.450 |

**Buttons** (13)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Descargar» | `{handleDownload}` | `!canPreview` |  |  | renderPreviewContent · l.129 |
| «Abrir» | `{handleExternalOpen}` | `!canPreview` |  |  | renderPreviewContent · l.136 |
| «[icon ZoomOut]» | `{handleZoomOut}` | `attachment.mime_type.startsWith('image/')` | `{imageZoom <= 25}` |  | renderPreviewContent · l.156 |
| «[icon ZoomIn]» | `{handleZoomIn}` | `attachment.mime_type.startsWith('image/')` | `{imageZoom >= 300}` |  | renderPreviewContent · l.166 |
| «[icon RotateCw]» | `{handleRotate}` | `attachment.mime_type.startsWith('image/')` |  |  | renderPreviewContent · l.174 |
| «Restablecer» | `{handleResetView}` | `attachment.mime_type.startsWith('image/')` |  |  | renderPreviewContent · l.180 |
| «[icon Reply]» · tooltip «Responder mensaje» | `{handleReply}` | `canReply && message && onReply` |  |  | AttachmentPreview · l.293 |
| «[icon Share2]» · tooltip «Compartir archivo» | `{() => onShare(attachment)}` | `onShare` |  |  | AttachmentPreview · l.303 |
| «Descargar» | `{handleDownload}` |  |  |  | AttachmentPreview · l.312 |
| «[icon X]» | `{onClose}` |  |  |  | AttachmentPreview · l.320 |
| «Descargar Archivo» | `{handleDownload}` |  |  |  | AttachmentPreview · l.478 |
| «Responder Mensaje» | `{handleReply}` | `canReply && message && onReply` |  |  | AttachmentPreview · l.487 |
| «Abrir en Nueva Ventana» | `{handleExternalOpen}` |  |  |  | AttachmentPreview · l.496 |

**Embedded media** (4)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {attachment.file_name} · {attachment.storage_path} | `attachment.mime_type.startsWith('image/')` |  | renderPreviewContent · l.191 |
| iframe · {attachment.file_name} · {`${attachment.storage_path}#view=FitH`} | `attachment.mime_type === 'application/pdf'` |  | renderPreviewContent · l.210 |
| video | `attachment.mime_type.startsWith('video/')` |  | renderPreviewContent · l.225 |
| audio | `attachment.mime_type.startsWith('audio/')` |  | renderPreviewContent · l.249 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «{attachment.file_name}» | written in this file |  |  | AttachmentPreview · l.267 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar la imagen» | `setPreviewError` | `attachment.mime_type.startsWith('image/')` | renderPreviewContent · l.199 |
| «Error al cargar el PDF» | `setPreviewError` | `attachment.mime_type === 'application/pdf'` | renderPreviewContent · l.215 |
| «Error al cargar el video» | `setPreviewError` | `attachment.mime_type.startsWith('video/')` | renderPreviewContent · l.229 |
| «Error al cargar el audio» | `setPreviewError` | `attachment.mime_type.startsWith('audio/')` | renderPreviewContent · l.253 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{attachment.storage_path}` | `window.open` | `attachment.storage_path` | handleExternalOpen · l.84 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen \|\| !attachment` | AttachmentPreview · l.70 |

**Values shown from data** (11)

- `{imageZoom} %` — renderPreviewContent · l.163, when `attachment.mime_type.startsWith('image/')`
- `{previewError}` — AttachmentPreview · l.347, when `!(loading) && previewError`
- `{attachment.file_name}` — AttachmentPreview · l.368
- `{formatFileSize(attachment.file_size)}` — AttachmentPreview · l.378
- `{formatRelativeTime(attachment.creat…}` — AttachmentPreview · l.388
- `{message.author_name}` — AttachmentPreview · l.407, when `message`
- `{message.content}` — AttachmentPreview · l.417, when `message`
- `{formatRelativeTime(message.created_…}` — AttachmentPreview · l.427, when `message`
- `{attachment.description}` — AttachmentPreview · l.442, when `attachment.description`
- `{attachment.download_count}` — AttachmentPreview · l.459
- `{attachment.view_count}` — AttachmentPreview · l.468

**Other texts on screen** (13)

- «Este tipo de archivo no se puede previsualizar en el navegador.» — renderPreviewContent · l.126, when `!canPreview`
- «Tu navegador no soporta la reproducción de videos.» — renderPreviewContent · l.232, when `attachment.mime_type.startsWith('video/')`
- «Tu navegador no soporta la reproducción de audio.» — renderPreviewContent · l.256, when `attachment.mime_type.startsWith('audio/')`
- «Adjunto en mensaje de {message.author_name}» — AttachmentPreview · l.283, when `message`
- «Cargando vista previa...» — AttachmentPreview · l.337, when `loading`
- «Nombre del archivo» — AttachmentPreview · l.367
- «Tamaño» — AttachmentPreview · l.377
- «Subido» — AttachmentPreview · l.387
- «Autor» — AttachmentPreview · l.406, when `message`
- «Mensaje» — AttachmentPreview · l.416, when `message`
- «Fecha del mensaje» — AttachmentPreview · l.426, when `message`
- «Descargas» — AttachmentPreview · l.457
- «Visualizaciones» — AttachmentPreview · l.466

### components/messaging/MentionPicker.tsx

Used by: `/community/workspace`

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{getRoleIcon(suggestion.role)} {suggestion.display_name} [{getRoleLabel(suggestion.role)}] [{suggestion.email}] [@todos] [@ {suggestion.role}]» | `{() => onSelect(suggestion)}` | `each filteredSuggestions` |  |  | MentionPicker · l.151 |
| «@todos Mencionar a todos en la comunidad Especial» | `{() => onSelect({ type: 'all' as MentionType, id: 'all', display_name: 'todos', …}` | `query === ''` |  |  | MentionPicker · l.216 |
| «@lideres Mencionar a los líderes de comunidad Rol» | `{() => onSelect({ type: 'role' as MentionType, id: 'lider_comunidad', display_na…}` | `query === ''` |  |  | MentionPicker · l.237 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {suggestion.display_name} · {suggestion.avatar} | `each filteredSuggestions && suggestion.avatar` |  | MentionPicker · l.161 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isVisible \|\| filteredSuggestions.length === 0` | MentionPicker · l.116 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getRoleLabel()` | «Administrador», «Líder de Comunidad», «Consultor», «Docente» | getRoleLabel · l.98 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Administrador» | MentionPicker · l.98 |
| «Líder de Comunidad» | MentionPicker · l.100 |
| «Consultor» | MentionPicker · l.102 |
| «Docente» | MentionPicker · l.104 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('mousedown')` | MentionPicker · l.47 |
| listener | `document.addEventListener('keydown')` | MentionPicker · l.63 |
| scroll | `selectedElement.scrollIntoView()` | MentionPicker · l.72 |

**Other texts on screen** (6)

- «Mencionar usuario» — MentionPicker · l.139
- «buscando &quot; {query} &quot;» — MentionPicker · l.141, when `query`
- «Menciones especiales» — MentionPicker · l.213, when `query === ''`
- «↑↓ navegar» — MentionPicker · l.266
- «Enter seleccionar» — MentionPicker · l.267
- «Esc cerrar» — MentionPicker · l.268

### components/messaging/MessageCard.tsx

Used by: `/community/workspace`

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «@ {displayName}» | `{() => onMentionClick && onMentionClick(part)}` | `each parts && index % 2 === 1` |  |  | renderContent · l.119 |
| «{emoji} [{count}] [{reactionSummary.users.slice(0, 5).m…} [y {reactionSummary.users.lengt…} más]]» · tooltip «{getReactionLabel(reactionType)}» · also `onMouseEnter={() => setExpandedReactions(prev => ({ ...prev, [reactionType]: true }))} · onMouseLeave={() => setExpandedReactions(prev => ({ ...prev, [reactionType]: false }))}` | `{() => handleReactionToggle(reactionType)}` |  |  |  | renderReactionButton · l.140 |
| «{message.author_name}» | `{() => onUserClick && onUserClick(message.author_id)}` |  |  |  | MessageCard · l.208 |
| «[icon Download]» · tooltip «Descargar» | `{(e) => { e.stopPropagation(); onDownloadAttachment && onDownloadAttachment(atta…}` | `message.attachments.length > 0 && message.attachments.filter(att => att.mime_type && att.mime_type.startsWith('image/')).length > 0 && each message.attachments .filter(att => att.mime_type …` |  |  | MessageCard · l.252 |
| «[icon Download]» · tooltip «Descargar» | `{() => onDownloadAttachment(attachment)}` | `message.attachments.length > 0 && each message.attachments.filter(att => !att.mime_type … && onDownloadAttachment` |  |  | MessageCard · l.287 |
| «😊» · tooltip «Reaccionar» | `{() => setShowReactions(!showReactions)}` |  |  |  | MessageCard · l.316 |
| «{reaction.emoji}» · tooltip «{reaction.label}» | `{() => handleReactionToggle(reaction.type)}` | `showReactions && each REACTION_TYPES` |  |  | MessageCard · l.328 |
| «Responder» | `{() => onReply(message)}` | `permissions.can_send_messages && onReply` |  |  | MessageCard · l.343 |
| «Editar» | `{() => onEdit(message)}` | `isOwnMessage && permissions.can_edit_own_messages && onEdit` |  |  | MessageCard · l.355 |
| «Eliminar» | `{() => onDelete && onDelete(message.id)}` | `(isOwnMessage && permissions.can_delete_own_messages) \|\| permissions.can_moderate_messages` |  |  | MessageCard · l.367 |
| «[icon MoreHorizontal]» · tooltip «Más opciones» |  |  |  |  | MessageCard · l.378 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onMouseEnter={() => setShowActions(true)} · onMouseLeave={() => setShowActions(false)}` |  | MessageCard · l.167 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image | `mimeType.startsWith('image/')` |  | getFileIcon · l.95 |
| img · alt {message.author_name} · {message.author_avatar} | `message.author_avatar` |  | MessageCard · l.192 |
| img · alt {attachment.file_name} · {attachment.storage_path} | `message.attachments.length > 0 && message.attachments.filter(att => att.mime_type && att.mime_type.startsWith('image/')).length > 0 && each message.attachments .filter(att => att.mime_type …` |  | MessageCard · l.245 |

**Values shown from data** (9)

- `{message.reply_to_message.author_name}` — MessageCard · l.179, when `message.reply_to_message && showReplyThread`
- `{formatRelativeTime(message.reply_to…}` — MessageCard · l.180, when `message.reply_to_message && showReplyThread`
- `{message.reply_to_message.content.su…} ...` — MessageCard · l.182, when `message.reply_to_message && showReplyThread`
- `{formatRelativeTime(message.created_…}` — MessageCard · l.214
- `{renderContent(message.content)}` — MessageCard · l.231
- `{getFileIcon(attachment.mime_type \|\|…}` — MessageCard · l.274, when `message.attachments.length > 0 && each message.attachments.filter(att => !att.mime_type …`
- `{attachment.file_name}` — MessageCard · l.278, when `message.attachments.length > 0 && each message.attachments.filter(att => !att.mime_type …`
- `{formatFileSize(attachment.file_size…}` — MessageCard · l.281, when `message.attachments.length > 0 && each message.attachments.filter(att => !att.mime_type …`
- `{message.reactions.map((reactionSumm…}` — MessageCard · l.303, when `message.reactions.length > 0`

**Other texts on screen** (3)

- «(editado)» — MessageCard · l.216, when `message.is_edited`
- «Sistema» — MessageCard · l.220, when `message.message_type === 'system'`
- «Anuncio» — MessageCard · l.225, when `message.message_type === 'announcement'`

### components/messaging/MessageComposer.tsx

Used by: `/community/workspace`

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{editingMessage ? onCancelEdit : onCancelReply}` | `(replyToMessage \|\| editingMessage)` |  |  | MessageComposer · l.375 |
| «[icon Loader2]» | `{handleSubmit}` |  | `{(!content.trim() && attachments.length === 0) \|\| isSubmitting \|\| disabled}` |  | MessageComposer · l.409 |
| «[icon X]» | `{() => removeAttachment(index)}` | `attachments.length > 0 && each attachments` |  |  | MessageComposer · l.471 |
| «[icon Paperclip]» · tooltip «Adjuntar archivo» | `{() => fileInputRef.current?.click()}` | `allowAttachments` | `{disabled \|\| isSubmitting}` |  | MessageComposer · l.502 |
| «[icon Smile]» · tooltip «Agregar emoji» | `{() => setShowEmojiPicker(!showEmojiPicker)}` |  | `{disabled \|\| isSubmitting}` |  | MessageComposer · l.523 |
| «{emoji}» | `{() => { setContent(prev => prev + emoji); setShowEmojiPicker(false); }}` | `showEmojiPicker && each quickEmojis` |  |  | MessageComposer · l.539 |
| «[icon AtSign]» · tooltip «Mencionar usuario» | `{() => { if (textareaRef.current) { const cursorPosition = textareaRef.current.s…}` | `allowMentions` | `{disabled \|\| isSubmitting}` |  | MessageComposer · l.556 |
| «Cancelar» | `{editingMessage ? onCancelEdit : onCancelReply}` | `(replyToMessage \|\| editingMessage)` | `{isSubmitting}` |  | MessageComposer · l.580 |
| «Enviando... / Guardar cambios / Enviar mensaje» | `{handleSubmit}` |  | `{(!content.trim() && attachments.length === 0) \|\| isSubmitting \|\| disabled}` |  | MessageComposer · l.588 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{placeholder}» | textarea | «{placeholder}» · disabled: `{disabled \|\| isSubmitting}` · `maxLength={maxLength}` · also `onKeyDown={handleKeyPress}` |  |  |  | MessageComposer · l.391 |
|  | file | accepts `{DEFAULT_MESSAGING_CONFIG.allowed_attachment_types.join(',')}` · `multiple=true` |  | `allowAttachments` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | MessageComposer · l.510 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onDrop={handleDrop} · onDragOver={handleDragOver}` |  | MessageComposer · l.385 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image | `attachments.length > 0 && each attachments && file.type.startsWith('image/')` |  | MessageComposer · l.464 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `MentionPicker` | component | `{showMentionPicker}` |  | MessageComposer · l.428 |

**Browser alert()** (3)

| Text | When | Where |
|---|---|---|
| «Archivo no válido: {file.name}» | `!isValidAttachment(file)` | MessageComposer · l.198 |
| «No se pueden adjuntar más de {DEFAULT_MESSAGING_CONFIG.ma…} archivos» | `attachments.length + validFiles.length > DEFAULT_MESSAGING_CONFIG.max_attachments_per_message` | MessageComposer · l.205 |
| «{validationResult.errors.join('\n')}» | `!validationResult.is_valid` | MessageComposer · l.271 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!mentionPosition` | MessageComposer · l.163 |
| `!content.trim() && attachments.length === 0` | MessageComposer · l.242 |
| `isSubmitting \|\| disabled` | MessageComposer · l.243 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Escribe un mensaje...» | MessageComposer · l.71 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| focus | `textareaRef.current.focus()` | MessageComposer · l.113 |
| focus | `textareaRef.current.focus()` | MessageComposer · l.186 |
| listener | `document.addEventListener('mousedown')` | MessageComposer · l.346 |
| focus | `textareaRef.current.focus()` | MessageComposer · l.562 |

**Values shown from data** (6)

- `{replyToMessage.author_name}` — MessageComposer · l.362, when `((replyToMessage \|\| editingMessage)) && replyToMessage`
- `{replyToMessage.content.substring(0,…} ...` — MessageComposer · l.363, when `((replyToMessage \|\| editingMessage)) && replyToMessage`
- `{content.length} / {maxLength}` — MessageComposer · l.404
- `{file.name}` — MessageComposer · l.468, when `attachments.length > 0 && each attachments`
- `( {formatFileSize(file.size)} )` — MessageComposer · l.469, when `attachments.length > 0 && each attachments`
- `{error}` — MessageComposer · l.489, when `validation && !validation.is_valid && each validation.errors`

**Other texts on screen** (2)

- «Respondiendo a» — MessageComposer · l.362, when `((replyToMessage \|\| editingMessage)) && replyToMessage`
- «Editando mensaje» — MessageComposer · l.371, when `((replyToMessage \|\| editingMessage)) && editingMessage`

### components/messaging/MessageFilters.tsx

Used by: `/community/workspace`

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{() => { if (activeView === 'messages') { updateMessageFilters({ search: '' }); …}` | `((activeView === 'messages' && messageFilters.search) \|\| (activeView === 'threads' && threadFilters.search))` |  |  | MessageFilters · l.153 |
| «Mensajes» | `{() => onViewChange('messages')}` |  |  |  | MessageFilters · l.170 |
| «Hilos» | `{() => onViewChange('threads')}` |  |  |  | MessageFilters · l.181 |
| «Filtros [{activeFilterCount}]» | `{() => setShowAdvancedFilters(!showAdvancedFilters)}` |  |  |  | MessageFilters · l.195 |
| «Limpiar» | `{clearFilters}` | `activeFilterCount > 0` |  |  | MessageFilters · l.219 |
| «Descendente / Ascendente» | `{() => { const currentOrder = activeView === 'messages' ? messageFilters.sort_or…}` | `showAdvancedFilters` |  |  | MessageFilters · l.539 |
| «[icon X]» | `{() => { if (activeView === 'messages') { updateMessageFilters({ search: '' }); …}` | `activeFilterCount > 0 && !showAdvancedFilters && (((activeView === 'messages' && messageFilters.search) \|\| (activeView === 'threads' && threadFilters.search)))` |  |  | MessageFilters · l.580 |

**Fields** (15)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{activeView === 'messages' ? "Buscar mensajes por contenido, autor o menciones..…}» | text | «{activeView === 'messages' ? "Buscar mensajes por contenido, autor o menciones..…}» · disabled: `{loading}` |  |  |  | MessageFilters · l.133 |
| «Categoría» | select |  | «Todas las categorías», «(lista) {category.label}» | `showAdvancedFilters && activeView === 'messages'` |  | MessageFilters · l.241 |
| «Menciones» | select |  | «Todos los mensajes», «Solo menciones», «Mis mensajes» | `showAdvancedFilters && activeView === 'messages'` |  | MessageFilters · l.265 |
| «Archivos Adjuntos» | select |  | «Todos los mensajes», «Con archivos», «Sin archivos» | `showAdvancedFilters && activeView === 'messages'` |  | MessageFilters · l.286 |
| «Autor» | select |  | «Todos los autores», «(lista) {author.name}» | `showAdvancedFilters && activeView === 'messages'` |  | MessageFilters · l.307 |
| «Tipo de Mensaje» | select |  | «Todos los tipos», «Regular», «Sistema», «Anuncio» | `showAdvancedFilters && activeView === 'messages'` |  | MessageFilters · l.329 |
| «Rango de Fechas» | date | «Desde» |  | `showAdvancedFilters && activeView === 'messages'` |  | MessageFilters · l.352 |
| «Rango de Fechas» | date | «Hasta» |  | `showAdvancedFilters && activeView === 'messages'` |  | MessageFilters · l.362 |
| «Categoría» | select |  | «Todas las categorías», «(lista) {category.label}» | `showAdvancedFilters && !(activeView === 'messages')` |  | MessageFilters · l.383 |
| «Estado» | select |  | «Todos los hilos», «Activos», «Fijados», «Archivados» | `showAdvancedFilters && !(activeView === 'messages')` |  | MessageFilters · l.407 |
| «Participación» | select |  | «Todos los hilos», «Participando», «No participando» | `showAdvancedFilters && !(activeView === 'messages')` |  | MessageFilters · l.429 |
| «Creado por» | select |  | «Todos los creadores», «(lista) {author.name}» | `showAdvancedFilters && !(activeView === 'messages')` |  | MessageFilters · l.450 |
| «Rango de Fechas de Creación» | date | «Desde» |  | `showAdvancedFilters && !(activeView === 'messages')` |  | MessageFilters · l.473 |
| «Rango de Fechas de Creación» | date | «Hasta» |  | `showAdvancedFilters && !(activeView === 'messages')` |  | MessageFilters · l.483 |
| «Ordenar por:» | select |  | «Fecha de creación», «Relevancia», «Actividad del hilo», «Último mensaje», «Fecha de creación», «Número de mensajes», «Participantes», «Título» | `showAdvancedFilters` |  | MessageFilters · l.503 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `newOrder` | «desc / asc» | MessageFilters · l.544 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Buscar mensajes por contenido, autor o menciones...» | MessageFilters · l.145 |
| «Buscar hilos por título, descripción o categoría...» | MessageFilters · l.146 |

**Other texts on screen** (24)

- «Categoría» (label) — MessageFilters · l.237, when `showAdvancedFilters && activeView === 'messages'`
- «Menciones» (label) — MessageFilters · l.261, when `showAdvancedFilters && activeView === 'messages'`
- «Archivos Adjuntos» (label) — MessageFilters · l.282, when `showAdvancedFilters && activeView === 'messages'`
- «Autor» (label) — MessageFilters · l.303, when `showAdvancedFilters && activeView === 'messages'`
- «Tipo de Mensaje» (label) — MessageFilters · l.325, when `showAdvancedFilters && activeView === 'messages'`
- «Rango de Fechas» (label) — MessageFilters · l.347, when `showAdvancedFilters && activeView === 'messages'`
- «Categoría» (label) — MessageFilters · l.379, when `showAdvancedFilters && !(activeView === 'messages')`
- «Estado» (label) — MessageFilters · l.403, when `showAdvancedFilters && !(activeView === 'messages')`
- «Participación» (label) — MessageFilters · l.425, when `showAdvancedFilters && !(activeView === 'messages')`
- «Creado por» (label) — MessageFilters · l.446, when `showAdvancedFilters && !(activeView === 'messages')`
- «Rango de Fechas de Creación» (label) — MessageFilters · l.468, when `showAdvancedFilters && !(activeView === 'messages')`
- «Ordenar por:» (label) — MessageFilters · l.499, when `showAdvancedFilters`
- «Filtros activos:» — MessageFilters · l.573, when `activeFilterCount > 0 && !showAdvancedFilters`
- «Búsqueda: &quot;» — MessageFilters · l.579, when `activeFilterCount > 0 && !showAdvancedFilters && (((activeView === 'messages' && messageFilters.search) \|\| (activeView === 'threads' && threadFilters.search)))`
- «&quot;» — MessageFilters · l.579, when `activeFilterCount > 0 && !showAdvancedFilters && (((activeView === 'messages' && messageFilters.search) \|\| (activeView === 'threads' && threadFilters.search)))`
- «Categoría específica» — MessageFilters · l.598, when `activeFilterCount > 0 && !showAdvancedFilters && (((activeView === 'messages' && messageFilters.category) \|\| (activeView === 'threads' && threadFilters.category)))`
- «Filtro de menciones» — MessageFilters · l.607, when `activeFilterCount > 0 && !showAdvancedFilters && activeView === 'messages' && messageFilters.mention_filter !== 'all'`
- «Filtro de archivos» — MessageFilters · l.612, when `activeFilterCount > 0 && !showAdvancedFilters && activeView === 'messages' && messageFilters.attachment_filter !== 'all'`
- «Autor específico» — MessageFilters · l.617, when `activeFilterCount > 0 && !showAdvancedFilters && activeView === 'messages' && messageFilters.author_id`
- «Tipo específico» — MessageFilters · l.622, when `activeFilterCount > 0 && !showAdvancedFilters && activeView === 'messages' && messageFilters.message_type`
- «Estado específico» — MessageFilters · l.633, when `activeFilterCount > 0 && !showAdvancedFilters && activeView === 'threads' && threadFilters.status !== 'all'`
- «Filtro de participación» — MessageFilters · l.638, when `activeFilterCount > 0 && !showAdvancedFilters && activeView === 'threads' && threadFilters.participant_filter !== 'all'`
- «Creador específico» — MessageFilters · l.643, when `activeFilterCount > 0 && !showAdvancedFilters && activeView === 'threads' && threadFilters.created_by`
- «Rango de fechas» — MessageFilters · l.653, when `activeFilterCount > 0 && !showAdvancedFilters && (((activeView === 'messages' && (messageFilters.date_from \|\| messageFilters.date_to)) \|\| (activeView === 'threads' && (threadFilters.date_from \|\| threadFilters.date_to))))`

### components/messaging/ThreadCreationModal.tsx

Used by: `/community/workspace`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Crear Nuevo Hilo de Conversación» | h2 |  | ThreadCreationModal · l.99 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{handleClose}` |  | `{submitting}` |  | ThreadCreationModal · l.103 |
| «Cancelar» | `{handleClose}` |  | `{submitting}` |  | ThreadCreationModal · l.231 |
| «Creando... / Crear Hilo» (submits the form) |  |  | `{submitting}` |  | ThreadCreationModal · l.239 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del Hilo *» | text | «Ej: Planificación del próximo semestre» · disabled: `{fixedFieldDisabled}` · `maxLength={100}` |  |  | `id=thread_title (id used by code)` | ThreadCreationModal · l.124 |
| «Descripción (opcional)» | textarea | «Describe brevemente el propósito de este hilo...» · disabled: `{fixedFieldDisabled}` · `maxLength={300}` |  |  | `id=description (id used by code)` | ThreadCreationModal · l.144 |
| «Categoría *» | select | disabled: `{fixedFieldDisabled}` | «(lista) {category.label}», «Otra categoría...» |  | `id=category (id used by code)` | ThreadCreationModal · l.165 |
| «Nombre de la categoría personalizada *» | text | «Ej: Actividades Especiales» · disabled: `{fixedFieldDisabled}` · `maxLength={50}` |  | `showCustomCategory` | `id=custom_category_name (id used by code)` | ThreadCreationModal · l.193 |
| «Mensaje Inicial *» | textarea | «Escribe el primer mensaje para iniciar la conversación...» · disabled: `{submitting}` · `maxLength={2000}` |  |  | `id=initial_message (id used by code)` | ThreadCreationModal · l.214 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | ThreadCreationModal · l.113 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Crear Nuevo Hilo de Conversación» | written in this file |  |  | ThreadCreationModal · l.93 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Por favor ingresa un título para el hilo» | `!formData.thread_title.trim()` | handleSubmit · l.44 |
| error | «Por favor ingresa un mensaje inicial» | `!formData.initial_message.trim()` | handleSubmit · l.49 |
| error | «Por favor ingresa un nombre para la categoría personalizada» | `formData.category === 'custom' && !formData.custom_category_name?.trim()` | handleSubmit · l.54 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | ThreadCreationModal · l.90 |

**Other texts on screen** (10)

- «La conversación ya fue creada. Solo falta enviar el primer mensaje.» — ThreadCreationModal · l.116, when `threadAlreadyCreated`
- «Título del Hilo *» (label) — ThreadCreationModal · l.121
- «{formData.thread_title.length} /100 caracteres» — ThreadCreationModal · l.134
- «Descripción (opcional)» (label) — ThreadCreationModal · l.141
- «{(formData.description \|\| '').length} /300 caracteres» — ThreadCreationModal · l.154
- «Categoría *» (label) — ThreadCreationModal · l.161
- «Nombre de la categoría personalizada *» (label) — ThreadCreationModal · l.190, when `showCustomCategory`
- «{(formData.custom_category_name \|\| '…} /50 caracteres» — ThreadCreationModal · l.203, when `showCustomCategory`
- «Mensaje Inicial *» (label) — ThreadCreationModal · l.211
- «{formData.initial_message.length} /2000 caracteres» — ThreadCreationModal · l.224

### components/tutorials/HelpButton.tsx

Used by: `/community/workspace`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon HelpCircle]» · aria «Ayuda y tutoriales» | `{() => setOpen(true)}` |  |  |  | HelpButton · l.15 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `HelpDrawer` | component | `{open}` |  | HelpButton · l.23 |

### components/tutorials/HelpDrawer.tsx

Used by: `/community/workspace`

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

Used by: `/community/workspace`

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {title} · {`https://player.vimeo.com/video/${vimeoId}?dnt=1`} |  |  | VimeoEmbed · l.21 |

**Other texts on screen** (1)

- «Video próximamente» — VimeoEmbed · l.13, when `!vimeoId`

### components/ui/dialog.tsx

Used by: `/community/workspace`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### components/ui/kit/Button.tsx

Used by: `/community/workspace`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{content}» | `{(event) => { if (loading) { // Not clickable while it works; also keeps a submi…}` |  |  |  | l.159 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{content}» |  | `typeof rest.href === 'string' && inert` |  | l.131 |
| «{content}» | `{href}` | `typeof rest.href === 'string' && href.startsWith('/')` |  | l.145 |
| «{content}» | `{href}` | `typeof rest.href === 'string'` |  | l.151 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SpinnerMark` |  | `loading` |  | l.120 |

### components/ui/kit/Dialog.tsx

Used by: `/community/workspace`

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `RadixDialog.Close` | aria-label: Cerrar | `dismissable` | `testid={testId ? '${testId}-close' : undefined}` | Dialog · l.193 |
| `X` | aria-hidden: true | `dismissable` |  | Dialog · l.204 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll({FOCUSABLE})` | firstFocusable · l.75 |
| mark | `testid={testId}` | Dialog · l.130 |
| focus | `candidate.focus()` | Dialog · l.151 |
| focus | `box.focus()` | Dialog · l.154 |
| focus | `target.focus()` | Dialog · l.160 |

**Values shown from data** (5)

- `{eyebrow}` — Dialog · l.179, when `eyebrow`
- `{title}` — Dialog · l.180
- `{description}` — Dialog · l.189, when `description`
- `{children}` — Dialog · l.208
- `{footer}` — Dialog · l.218, when `footer`

### components/ui/kit/Field.tsx

Used by: `/community/workspace`

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | {type} |  |  |  |  | l.229 |
|  | textarea |  |  |  |  | l.237 |
|  | select |  |  |  |  | l.248 |
|  | {type} |  |  |  |  | l.268 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `AlertCircle` | aria-hidden: true | `error` |  | Field · l.133 |
| `ChevronDown` | aria-hidden: true | hidden by its class (`hidden`); another control opens it or it is for screen readers |  | l.251 |
| `Search` | aria-hidden: true |  |  | l.264 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `AT_LEAST_ONE` | «Marca al menos una opción.» | l.181 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll(input[type="checkbox"])` | boxes · l.194 |
| listener | `group.addEventListener('change')` | useAtLeastOneTicked · l.203 |
| listener | `form.addEventListener('reset')` | useAtLeastOneTicked · l.204 |

**Values shown from data** (3)

- `{help}` — Field · l.127, when `help`
- `{children}` — Field · l.157, when `group`
- `{children}` — Field · l.170

**Other texts on screen** (2)

- «{label} {mark}» (label) — Field · l.152, when `group`
- «{label} {mark}» (label) — Field · l.166

### components/workspace/WorkspaceSessionsTab.tsx

Used by: `/community/workspace`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Sesiones» | h2 | `loading` | WorkspaceSessionsTab · l.219 |
| «Sesiones» | h2 | `sessions.length === 0` | WorkspaceSessionsTab · l.238 |
| «{session.title}» | h3 |  | renderSessionCard · l.282 |
| «Sesiones» | h2 |  | WorkspaceSessionsTab · l.357 |
| «Próximas Sesiones» | h3 | `upcomingSessions.length > 0` | WorkspaceSessionsTab · l.371 |
| «Sesiones Pasadas» | h3 | `pastSessions.length > 0` | WorkspaceSessionsTab · l.390 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon RefreshCw]» |  | `loading` | `true` |  | WorkspaceSessionsTab · l.220 |
| «[icon RefreshCw]» · aria «Refrescar sesiones» | `{handleRefresh}` | `sessions.length === 0` |  |  | WorkspaceSessionsTab · l.239 |
| «[icon RefreshCw]» · aria «Refrescar sesiones» | `{handleRefresh}` |  |  |  | WorkspaceSessionsTab · l.358 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Unirse a la reunión» · also `onKeyDown={(e) => e.stopPropagation()}` | `{buildSessionJoinPath(session.id)}` | `sessionHasJoinControl(session)` | `testid=workspace-session-join` | renderSessionCard · l.336 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar sesiones» |  | WorkspaceSessionsTab · l.142 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «No hay sesión de autenticación» | `throw (shown by whoever catches it)` | `!authSession?.access_token` | WorkspaceSessionsTab · l.120 |
| «Error al cargar sesiones» | `throw (shown by whoever catches it)` | `!response.ok` | WorkspaceSessionsTab · l.134 |
| «Error al cargar sesiones» | `setError` |  | WorkspaceSessionsTab · l.141 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/consultor/sessions/[*]` | `router.push` | `canOpenDetails` | renderSessionCard · l.264 |
| `/consultor/sessions/[*]` | `router.push` | `canOpenDetails && (e.key === 'Enter' \|\| e.key === ' ')` | renderSessionCard · l.268 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `getUserPrimaryRole(userId) .then((role) => { if (!cancelled) setCanOpenDetails(SESSION_DETAILS_ROLES.has(role)); }) .catch(() => { if (!cancelled) se…` | WorkspaceSessionsTab · l.96 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!userId` | WorkspaceSessionsTab · l.95 |
| `!data` | WorkspaceSessionsTab · l.168 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Video` | aria-hidden: true | `sessionHasJoinControl(session)` |  | renderSessionCard · l.345 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Bearer {authSession.access_token}» | WorkspaceSessionsTab · l.127 |
| «Ver detalles de {session.title}» | WorkspaceSessionsTab · l.270 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| role | `role=list` | WorkspaceSessionsTab · l.378 |
| role | `role=list` | WorkspaceSessionsTab · l.397 |

**Values shown from data** (10)

- `# {session.session_number}` — renderSessionCard · l.286, when `session.recurrence_group_id && session.session_number`
- `{badge.label}` — renderSessionCard · l.294
- `{format(parseISO(session.session_dat…}` — renderSessionCard · l.310
- `{formatTime(session.start_time)} - {formatTime(session.end_time)}` — renderSessionCard · l.316
- `{session.schools.name}` — renderSessionCard · l.323, when `session.schools`
- `{session.growth_communities.name}` — renderSessionCard · l.329, when `session.growth_communities`
- `{upcomingSessions.length}` — WorkspaceSessionsTab · l.374, when `upcomingSessions.length > 0`
- `{renderSessionCard(session)}` — WorkspaceSessionsTab · l.380, when `upcomingSessions.length > 0 && each upcomingSessions`
- `{pastSessions.length}` — WorkspaceSessionsTab · l.393, when `pastSessions.length > 0`
- `{renderSessionCard(session)}` — WorkspaceSessionsTab · l.399, when `pastSessions.length > 0 && each pastSessions`

**Other texts on screen** (2)

- «Selecciona una comunidad para ver sus sesiones» — WorkspaceSessionsTab · l.208, when `!workspace`
- «No hay sesiones registradas para esta comunidad» — WorkspaceSessionsTab · l.250, when `sessions.length === 0`

**Reads and writes the database directly:** `table:contract_hours_ledger` (select)

### components/workspace/WorkspaceTabNavigation.tsx

Used by: `/community/workspace`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{tab.name}» | `{() => onSectionChange(tab.id)}` | `each tabs` |  |  | WorkspaceTabNavigation · l.46 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Icon` | aria-hidden: true | `each tabs` |  | WorkspaceTabNavigation · l.57 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Vista General» | WorkspaceTabNavigation · l.30 |
| «Reuniones» | WorkspaceTabNavigation · l.31 |
| «Sesiones» | WorkspaceTabNavigation · l.32 |
| «Documentos» | WorkspaceTabNavigation · l.33 |
| «Mensajes» | WorkspaceTabNavigation · l.34 |
| «Gestión» | WorkspaceTabNavigation · l.35 |

**Other texts on screen** (1)

- «Tabs» (aria-label) — WorkspaceTabNavigation · l.40

### lib/api-auth.ts

Used by: `/admin/growth-communities/[id]/members`, `/admin/growth-communities`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Server configuration error» | `throw (shown by whoever catches it)` | `!supabaseUrl \|\| !serviceRoleKey` | createServiceRoleClient · l.113 |
| «Failed to initialize admin connection» | `throw (shown by whoever catches it)` |  | createServiceRoleClient · l.125 |

### lib/colorAlpha.ts

Used by: `/community/workspace`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «withAlpha expects two hex characters, got "{hh}"» | `throw (shown by whoever catches it)` | `!TWO_HEX.test(hh)` | alphaFromHex · l.19 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `withAlpha()` | «rgb({named[1]} / {alpha})» | withAlpha · l.26 |

### lib/community/fetchCommunityMembers.ts

Used by: `/community/workspace`

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Community members request failed with status {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchCommunityMembers · l.73 |
| «Community members response is not valid JSON» | `throw (shown by whoever catches it)` |  | fetchCommunityMembers · l.83 |
| «Community members response has no members array» | `throw (shown by whoever catches it)` | `!Array.isArray(members)` | fetchCommunityMembers · l.91 |

### lib/meetings/audience-labels.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `AUDIENCE_PICKER_LABELS` | «Las personas con acceso a la reunión», «Solo los asistentes» | l.19 |
| `AUDIENCE_PROSE_LABELS` | «toda la comunidad de crecimiento», «sólo quienes asistieron» | l.28 |
| `audienceProseLabel()` | «las personas con acceso a la reunión» | audienceProseLabel · l.44 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «las personas con acceso a la reunión» | audienceProseLabel · l.44 |

### lib/meetings/constants.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `MAX_ATTACHMENT_LABEL` | «10 MB» | l.31 |

### lib/meetings/meeting-documents.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `MEETING_CONTENT_HIDDEN_TEXT` | «Solo los participantes, el líder de la comunidad y las personas con acceso ven los acuerdos, compromisos, tareas y documentos de esta reunión.» | l.25 |

**Reads and writes the database directly:** `bucket:{MEETING_DOCUMENTS_BUCKET}` (createSignedUrl)

### lib/meetings/meeting-save.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `noun` | «compromiso / tarea» | checkAssignee · l.59 |
| `KIND_LABEL` | «La reunión», «Acuerdo», «Compromiso», «Tarea», «Participantes», «Personas con acceso», «Documento» | l.126 |

**Other texts written in the code (safety net: not tied to an element by the script)** (11)

| Text | Where |
|---|---|
| «Elige a quién se asigna {kind === 'commitment' ? 'es…}.» | checkAssignee · l.61 |
| «La persona asignada a {kind === 'commitment' ? 'es…} {noun} ya no es participante. Asígnalo a un participante o vuelve a marcarla en el paso 1.» | checkAssignee · l.68 |
| «Escribe el acuerdo o elimínalo.» | validateMeetingItems · l.83 |
| «Describe el compromiso o elimínalo.» | validateMeetingItems · l.89 |
| «Indica la fecha límite del compromiso.» | validateMeetingItems · l.94 |
| «Escribe el título de la tarea o elimínala.» | validateMeetingItems · l.100 |
| «Indica la fecha límite de la tarea.» | validateMeetingItems · l.105 |
| «{label}: falta la fecha o no es válida.» | describeSaveError · l.161 |
| «{label}: falta la persona asignada o no es válida.» | describeSaveError · l.165 |
| «{label}: el texto no puede quedar vacío.» | describeSaveError · l.168 |
| «{first} (y {problems.length - 1} problema{problems.length - 1 === 1 ?…} más)» | saveFailureSummary · l.188 |

### lib/profile-cards.ts

Used by: `/community/workspace`, `/user/[userId]`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Usuario» | cardName · l.59 |

**Reads and writes the database directly:** `rpc:get_profile_cards`

### lib/services/communityWorkspace.js

Used by: `/community/workspace`

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «workspace not found» | `throw (shown by whoever catches it)` | `!data` | getWorkspaceSettings · l.70 |
| «No se proporcionó ningún archivo» | `throw (shown by whoever catches it)` | `!file` | uploadCommunityImage · l.114 |
| «El archivo debe ser menor a 5MB» | `throw (shown by whoever catches it)` | `file.size > maxSize` | uploadCommunityImage · l.120 |
| «Solo se permiten imágenes (JPEG, PNG, WebP)» | `throw (shown by whoever catches it)` | `!allowedTypes.includes(file.type)` | uploadCommunityImage · l.126 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `canEdit = canEditWorkspaceWithRoles(roles, workspace.community_id)` | canEditWorkspace · l.233 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `WORKSPACE_RENAME_MESSAGES` | «Solo los miembros de la comunidad pueden cambiar su nombre.», «El nombre debe tener entre 1 y 100 caracteres, con al menos una letra o un número, sin caracteres invisibles.», «No se pudo guardar. Inténtalo de nuevo.» | l.25 |
| `communityWorkspaceService` | «workspace not found», «No se proporcionó ningún archivo», «El archivo debe ser menor a 5MB», «Solo se permiten imágenes (JPEG, PNG, WebP)», «Error al subir la imagen» | l.31 |

**Reads and writes the database directly:** `bucket:community-images` (getPublicUrl, remove, upload), `rpc:rename_community_workspace`, `table:community_workspaces` (select, update), `table:user_roles` (select)

### lib/services/feedService.ts

Used by: `/community/workspace`

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «{MENTION_NOTIFICATION_FAILED}» | `input.mentions && input.mentions.length > 0 && mentionNotificationFailed` | createPost · l.395 |

**Messages set on the page** (8)

| Text | Set by | When | Where |
|---|---|---|---|
| «Usuario no autenticado» | `throw (shown by whoever catches it)` | `!user` | createPost · l.203 |
| «No se pudo subir «{failedUpload.file.name}». La publicación no se guardó; inténtalo de nuevo.» | `throw (shown by whoever catches it)` | `failedUpload` | createPost · l.231 |
| «Las tablas del feed no están configuradas. Por favor, contacta al administrador.» | `throw (shown by whoever catches it)` | `postError && !((postError as { code?: string }).code === '23505') && postError.message?.includes('relation "community_posts" does not exist')` | createPost · l.267 |
| «La publicación se guardó sin sus archivos. Elimínala desde el feed e inténtalo de nuevo.» | `throw (shown by whoever catches it)` | `uploads.length > 0 && mediaData.length > 0 && mediaError && (removeError \|\| !Array.isArray(removed) \|\| removed.length === 0)` | createPost · l.331 |
| «No se pudo guardar la publicación con sus archivos. Inténtalo de nuevo.» | `throw (shown by whoever catches it)` | `uploads.length > 0 && mediaData.length > 0 && mediaError` | createPost · l.336 |
| «Usuario no autenticado» | `throw (shown by whoever catches it)` | `!user` | toggleReaction · l.469 |
| «Usuario no autenticado» | `throw (shown by whoever catches it)` | `!user` | addComment · l.513 |
| «Usuario no autenticado» | `throw (shown by whoever catches it)` | `!user` | toggleSavePost · l.598 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `canAccess = await supabase.rpc('can_access_workspace', { p_user_id: user.id, p_workspace_id: workspaceId })` | createPost · l.206 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `MENTION_NOTIFICATION_FAILED` | «Tu publicación se guardó, pero no pudimos enviar la notificación de mención.» | l.16 |
| `NO_PERMISSION` | «No tienes permisos para publicar en esta comunidad. Verifica que estés asignado a la comunidad.» | l.19 |
| `PUBLISH_FAILED` | «No se pudo publicar. Inténtalo de nuevo.» | l.21 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | FeedService · l.369 |

**Reads and writes the database directly:** `bucket:post-media` (getPublicUrl, upload), `rpc:can_access_workspace`, `rpc:increment_post_view_count`, `table:community_posts` (delete, insert, select, update), `table:post_comments` (insert, select), `table:post_hashtags` (insert, select), `table:post_media` (insert, select), `table:post_mentions` (insert), `table:post_reactions` (delete, insert, select), `table:posts_with_engagement` (select), `table:saved_posts` (delete, insert, select)

### lib/tutorials/content.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TUTORIALS` | «Mi Aprendizaje», «Cómo encontrar y retomar tus cursos», «Qué significa cada estado: Comenzar / Continuar / Completado», «Mis Sesiones», «Tu día a día en Mis Sesiones», «Las 6 pestañas de una sesión», «Exportar sesiones a tu calendario (iCal)», «Mis Reportes», «Leer tus reportes de sesiones», «Mis Horas», «Revisar tus horas y exportarlas», «Por qué mis horas ejecutadas vs. penalizadas difieren», «Proceso de Cambio», «Cómo completar un Proceso de Cambio de principio a fin», «Entender la jerarquía: Objetivos, Acciones e Indicadores», «Los 5 tipos de indicador», «Cobertura como gate», «Guardado automático, progreso y envío», «Ver tus resultados», «Espacio Colaborativo», «Tu comunidad de crecimiento», «Documentos: subir, carpetas, permisos», «Mensajería: hilos, menciones, adjuntos», «Reuniones: crear acta» | l.23 |

### lib/utils/file-format.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `sizes` | «Bytes», «KB», «MB», «GB» | formatFileSize · l.25 |
| `formatFileSize()` | «0 Bytes» | formatFileSize · l.22 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «0 Bytes» | formatFileSize · l.22 |

### lib/utils/profile-name.ts

Used by: `/community/workspace`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin nombre» | profileName · l.32 |

### lib/utils/session-ui-helpers.tsx

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `badges` | «Borrador», «Pendiente Aprobación», «Programada», «En Progreso», «Pendiente Informe», «Completada», «Cancelada» | getStatusBadge · l.23 |
| `label` | «Penalizada / Devuelta» | getCancellationSubBadge · l.90 |

**Values shown from data** (1)

- `{label}` — getCancellationSubBadge · l.94

**Other texts on screen** (1)

- «Admin» — getCancellationSubBadge · l.99, when `adminOverride`

### src/components/TipTapEditor.tsx

Used by: `/community/workspace`

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

### types/activity.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `ACTIVITY_TYPE_CONFIG` | «Reunión creada», «Reunión completada», «Tarea asignada», «Documento subido», «Carpeta creada», «Mensaje enviado», «Hilo creado», «Usuario se unió», «Espacio creado» | l.367 |
| `IMPORTANCE_LEVELS` | «Baja», «Actividad rutinaria», «Media», «Actividad importante», «Alta», «Actividad crítica», «Urgente», «Requiere atención inmediata», «Crítica», «Máxima prioridad» | l.461 |
| `ACTIVITY_ACTIONS` | «Ver detalles», «Editar», «Responder», «Descargar», «Compartir», «Marcar» | l.513 |

### types/documents.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `DEFAULT_FOLDER_STRUCTURE` | «Presentaciones», «Plantillas», «Evaluaciones», «Recursos», «Planificación», «Informes», «Guías», «Formularios» | l.385 |

### types/meetings.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `statusLabels` | «Pendiente», «En Progreso», «Completado», «Vencido», «Cancelado» | l.403 |
| `priorityLabels` | «Baja», «Media», «Alta», «Crítica» | l.411 |
| `meetingStatusLabels` | «Borrador», «Programada», «En Progreso», «Completada», «Cancelada», «Pospuesta» | l.418 |

### types/messaging.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `REACTION_TYPES` | «Me gusta», «Me encanta», «Buena idea», «Excelente», «Interesante», «Tengo dudas» | l.25 |
| `THREAD_CATEGORIES` | «General», «Conversaciones generales», «Recursos», «Compartir recursos y materiales», «Preguntas», «Preguntas y respuestas», «Proyectos», «Colaboración en proyectos», «Ideas», «Compartir ideas y propuestas», «Tareas y trabajos asignados» | l.43 |

### types/roles.ts

Used by: `/community/workspace`, `/user/[userId]`

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

### utils/documentUtils.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (7)

| Name | Texts | Where |
|---|---|---|
| `UPLOAD_FAILED_MESSAGE` | «No se pudo subir el archivo. Inténtalo de nuevo.» | l.241 |
| `RECORD_FAILED_MESSAGE` | «El archivo se subió, pero el documento no se pudo guardar. Inténtalo de nuevo.» | l.242 |
| `VERSION_WARNING_MESSAGE` | «El documento se guardó, pero no su historial de versiones.» | l.244 |
| `folderPath` | «folder-{folderId} / root» | buildDocumentStoragePath · l.273 |
| `DOCUMENT_ACTION_MESSAGES` | «Solo quien subió el documento o el líder de la comunidad puede hacerlo.», «El nombre debe tener entre 1 y 200 caracteres.», «La carpeta ya no existe en este espacio.», «No se pudo completar la acción. Inténtalo de nuevo.» | l.480 |
| `checkFileBeforeUpload()` | «El nombre del archivo es demasiado largo (máximo {DOCUMENT_FILE_NAME_MAX} caracteres). Cámbiale el nombre e inténtalo de nuevo.», «El título no puede tener más de {DOCUMENT_TITLE_MAX} caracteres.», «No se reconoce el tipo del archivo (máximo {DOCUMENT_MIME_TYPE_MAX} caracteres).», «Tipo de archivo no soportado: {file.type}», «Archivo demasiado grande: {file.name}. Máximo permitido: {formatFileSize( fileTypeCon…}» | checkFileBeforeUpload · l.285 |
| `formatRelativeTime()` | «Hace un momento», «Hace {Math.floor(diffInSeconds / …} minutos», «Hace {Math.floor(diffInSeconds / …} horas», «Hace {Math.floor(diffInSeconds / …} días» | formatRelativeTime · l.760 |

**Other texts written in the code (safety net: not tied to an element by the script)** (12)

| Text | Where |
|---|---|
| «El nombre del archivo es demasiado largo (máximo {DOCUMENT_FILE_NAME_MAX} caracteres). Cámbiale el nombre e inténtalo de nuevo.» | checkFileBeforeUpload · l.285 |
| «El título no puede tener más de {DOCUMENT_TITLE_MAX} caracteres.» | checkFileBeforeUpload · l.288 |
| «No se reconoce el tipo del archivo (máximo {DOCUMENT_MIME_TYPE_MAX} caracteres).» | checkFileBeforeUpload · l.291 |
| «Tipo de archivo no soportado: {file.type}» | checkFileBeforeUpload · l.295 |
| «Archivo demasiado grande: {file.name}. Máximo permitido: {formatFileSize( fileTypeCon…}» | checkFileBeforeUpload · l.298 |
| «Document link failed» | DocumentLinkError · l.595 |
| «Bearer {session.access_token}» | getDocumentLink · l.625 |
| «Hace un momento» | formatRelativeTime · l.760 |
| «Hace {Math.floor(diffInSeconds / …} minutos» | formatRelativeTime · l.761 |
| «Hace {Math.floor(diffInSeconds / …} horas» | formatRelativeTime · l.762 |
| «Hace {Math.floor(diffInSeconds / …} días» | formatRelativeTime · l.763 |
| «File» | getFileTypeIcon · l.784 |

**Reads and writes the database directly:** `bucket:{DOCUMENTS_BUCKET}` (upload), `rpc:can_manage_workspace_documents`, `rpc:get_document_statistics`, `rpc:get_folder_breadcrumb`, `rpc:get_recent_document_activity`, `rpc:hide_community_document`, `rpc:increment_document_counter`, `rpc:move_community_document`, `rpc:rename_community_document`, `table:community_documents` (insert, select), `table:document_access_log` (insert), `table:document_folders` (insert, select), `table:document_versions` (insert, select)

### utils/meetingDeletion.ts

Used by: `/community/workspace`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se pudo archivar la reunión. Es posible que no tengas permisos suficientes o que la reunión no exista.» | `throw (shown by whoever catches it)` | `count === 0` | softDeleteMeeting · l.118 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Error al eliminar la reunión. Inténtalo nuevamente.» | deleteMeeting · l.66 |
| «Error desconocido» | deleteMeeting · l.87 |
| «Error al archivar la reunión» | softDeleteMeeting · l.131 |

**Reads and writes the database directly:** `table:community_meetings` (select, update), `table:community_workspaces` (select), `table:user_roles` (select)

### utils/meetingUtils.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `refusal` | «The meeting update reached no row (refused)» | updateMeeting · l.338 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Error al actualizar {itemType === 'task' ? 'tare…}» | updateTaskStatus · l.586 |
| «Error inesperado al actualizar estado» | updateTaskStatus · l.593 |

**Reads and writes the database directly:** `rpc:get_my_meeting_rights`, `rpc:update_meeting_item_progress`, `table:community_meetings` (select, update), `table:community_workspaces` (select), `table:meeting_agreements` (select), `table:meeting_attendees` (select), `table:meeting_commitments` (select), `table:meeting_tasks` (select), `table:user_roles` (select)

### utils/messagingUtils-simple.ts

Used by: `/community/workspace`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Messaging feature not yet implemented» | `throw (shown by whoever catches it)` | `threadError && (threadError?.code === '42P01' \|\| threadError?.message?.includes('does not exist'))` | createThread · l.516 |
| «Messaging feature not yet implemented» | `throw (shown by whoever catches it)` | `error && (error?.code === '42P01' \|\| error?.message?.includes('does not exist'))` | sendMessage · l.626 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Usuario» | withMessageDetails · l.346 |
| «No se pudo crear la conversación» | ThreadCreationIncompleteError · l.424 |
| «Error desconocido» | failureReason · l.579 |
| «No se guardó el registro del archivo» | sendMessage · l.683 |
| «Bearer {session.access_token}» | requestMessageNotifications · l.900 |

**Reads and writes the database directly:** `bucket:message-attachments` (getPublicUrl, upload), `table:community_messages` (insert, select), `table:community_workspaces` (select), `table:message_attachments` (insert, select), `table:message_reactions` (select), `table:message_threads` (insert, select), `table:profiles` (select)

### utils/messagingUtils.ts

Used by: `/community/workspace`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `labels` | «Me gusta», «Me encanta», «Buena idea», «Excelente», «Interesante», «Tengo dudas» | getReactionLabel · l.41 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Reacción» | getReactionLabel · l.49 |

### utils/navigationManager.ts

Used by: `/community/workspace`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, delay)` | navigate · l.49 |

### utils/roleUtils.ts

Used by: `/community/workspace`, `/user/[userId]`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

### utils/storage.js

Used by: `/community/workspace`

**Reads and writes the database directly:** `bucket:{bucketName}` (getPublicUrl, list, upload)

### utils/workspaceUtils.ts

Used by: `/community/workspace`

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `isAdmin = userRoles.some(role => role.role_type === 'admin')` | getUserWorkspaceAccess · l.91 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Sin escuela» | getAllCommunitiesForAdmin · l.210 |
| «Sin generación» | getAllCommunitiesForAdmin · l.211 |

**Reads and writes the database directly:** `rpc:can_access_workspace`, `table:community_workspaces` (select), `table:growth_communities` (select), `table:user_roles` (select), `table:workspace_activities` (insert)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/growth-communities/[id]` | `pages/api/admin/growth-communities/[id]/index.ts` |  | `/admin/growth-communities` | `__tests__/api/admin/growth-communities-index.test.ts`, `__tests__/components/GrowthCommunitiesIndexPage.crud.test.tsx`, `pages/admin/growth-communities/index.tsx` |
| `/api/admin/growth-communities/[id]/leaders` | `pages/api/admin/growth-communities/[id]/leaders.ts` |  | `/admin/growth-communities/[id]/members` | `__tests__/api/admin/growth-communities-leaders.test.ts`, `__tests__/components/GrowthCommunityMembersPage.leaders.test.tsx`, `pages/admin/growth-communities/[id]/members.tsx` |
| `/api/admin/growth-communities/[id]/members` | `pages/api/admin/growth-communities/[id]/members.ts` |  | `/admin/growth-communities/[id]/members` | `__tests__/api/admin/growth-communities-members.test.ts`, `__tests__/components/GrowthCommunityMembersPage.leaders.test.tsx`, `pages/admin/growth-communities/[id]/members.tsx` |
| `/api/admin/growth-communities` | `pages/api/admin/growth-communities/index.ts` | GET, POST | `/admin/growth-communities` | `__tests__/components/GrowthCommunitiesIndexPage.crud.test.tsx`, `pages/admin/growth-communities/index.tsx` |
| `/api/community/documents/[id]/link` | `pages/api/community/documents/[id]/link.ts` | GET | `/community/workspace` | `__tests__/api/community/document-link.test.ts`, `__tests__/utils/documentUtils.private-store.test.ts`, `tests/e2e/community-document-links.spec.ts`, `utils/documentUtils.ts` |
| `/api/community/ensure-workspace` | `pages/api/community/ensure-workspace.ts` | POST | `/community/workspace`, `/dashboard` | `__tests__/api/community/ensure-workspace.test.ts`, `__tests__/api/group-quiz-notifications.test.ts`, `__tests__/api/reports/forged-session.test.ts`, `tests/e2e/panel-pin.spec.ts`, `utils/workspaceUtils.ts` |
| `/api/community/members` | `pages/api/community/members.ts` | GET | `/community/workspace`, `/dashboard` | `__tests__/api/community/members.test.ts`, `__tests__/api/reports/forged-session.test.ts`, `__tests__/components/meetings/MeetingDocumentationModal.clear-rich-text.test.tsx`, `__tests__/components/meetings/MeetingDocumentationModal.end-dedup.test.tsx`, `__tests__/components/meetings/MeetingDocumentationModal.finalize-refresh.test.tsx` +14 |
| `/api/community/search-users` | `pages/api/community/search-users.ts` | GET | `/community/workspace` | `__tests__/api/community/search-users.test.ts`, `__tests__/components/feed/CreatePostModal.mention-workspace.test.tsx`, `components/feed/CreatePostModal.tsx`, `tests/e2e/messaging-notifications.spec.ts` |
| `/api/community/workspace-message-notifications` | `pages/api/community/workspace-message-notifications.ts` | POST | `/community/workspace`, `/community/workspace/assignments/[id]/discussion` | `__tests__/api/community/workspace-message-notifications.test.ts`, `tests/e2e/messaging-notifications.spec.ts`, `utils/messagingUtils-simple.ts` |
| `/api/meetings/[id]/autosave` | `pages/api/meetings/[id]/autosave.ts` | POST | `/community/workspace` | `__tests__/api/meetings/autosave.test.ts`, `components/meetings/MeetingDocumentationModal.tsx`, `tests/e2e/meeting-agreements-tasks.spec.ts`, `tests/e2e/meeting-create-and-access.spec.ts`, `tests/e2e/meeting-finalize-email-outcome.spec.ts` |
| `/api/meetings/[id]/finalize` | `pages/api/meetings/[id]/finalize.ts` | POST | `/community/workspace` | `__tests__/api/meetings/finalize.test.ts`, `__tests__/components/meetings/FinalizeMeetingDialog.test.tsx`, `__tests__/lib/notificationService.producer-contract.test.ts`, `components/meetings/FinalizeMeetingDialog.tsx`, `tests/e2e/messaging-notifications.spec.ts` |
| `/api/meetings/[id]/recipients` | `pages/api/meetings/[id]/recipients.ts` | GET | `/community/workspace` | `__tests__/api/meetings/recipients.test.ts`, `components/meetings/FinalizeMeetingDialog.tsx`, `tests/e2e/meeting-create-and-access.spec.ts`, `tests/e2e/meeting-finalize-email-outcome.spec.ts` |
| `/api/meetings/[id]/work-session/[sessionId]/end` | `pages/api/meetings/[id]/work-session/[sessionId]/end.ts` | POST | `/community/workspace` | `__tests__/api/meetings/work-session-end.test.ts`, `components/meetings/MeetingDocumentationModal.tsx`, `tests/e2e/meeting-agreements-tasks.spec.ts`, `tests/e2e/meeting-create-and-access.spec.ts`, `tests/e2e/meeting-finalize-email-outcome.spec.ts` |
| `/api/meetings/[id]/work-session/start` | `pages/api/meetings/[id]/work-session/start.ts` | POST | `/community/workspace` | `__tests__/api/meetings/work-session-start.test.ts`, `components/meetings/MeetingDocumentationModal.tsx`, `tests/e2e/meeting-agreements-tasks.spec.ts`, `tests/e2e/meeting-create-and-access.spec.ts`, `tests/e2e/meeting-finalize-email-outcome.spec.ts` |
| `/api/meetings/delete` | `pages/api/meetings/delete.ts` | POST | `/community/workspace` | `__tests__/api/meetings/delete.test.ts`, `tests/e2e/meeting-create-and-access.spec.ts`, `utils/meetingDeletion.ts` |
| `/api/messaging/mention` | `pages/api/messaging/mention.ts` | POST | `/community/workspace` | `__tests__/api/messaging/mention.test.ts`, `__tests__/lib/notificationService.producer-contract.test.ts`, `lib/services/feedService.ts`, `tests/e2e/messaging-notifications.spec.ts` |
| `/api/messaging/send` | `pages/api/messaging/send.ts` | POST | **no screen** | `__tests__/api/messaging/send.test.ts`, `__tests__/lib/notificationService.producer-contract.test.ts`, `__tests__/lib/notificationService.source-context.test.ts`, `tests/e2e/messaging-notifications.spec.ts` |
| `/api/storage/download-url` | `pages/api/storage/download-url.ts` | POST | **no screen** | `__tests__/api/storage/download-authorization.test.ts` |
| `/api/storage/download` | `pages/api/storage/download.ts` | GET | `/community/workspace`, `/student/lesson/[lessonId]` | `__tests__/api/storage/download-authorization.test.ts`, `__tests__/pages/community/workspace.documents.test.tsx`, `__tests__/pages/community/workspace.messages.test.tsx`, `components/student/StudentBlockRenderer.tsx`, `pages/community/workspace.tsx` +5 |


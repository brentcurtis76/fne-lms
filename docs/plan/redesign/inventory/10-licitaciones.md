# Licitaciones (processes, templates, proposals)

Area `10-licitaciones`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `45d07ead5` (2026-11-17).

11 screen files, 42 API files, 29 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/licitaciones/consultores` | `pages/admin/licitaciones/consultores.tsx` | 854 | — |  |
| `/admin/licitaciones/criterios` | `pages/admin/licitaciones/criterios.tsx` | 666 | — | Looks like a leftover but is in use |
| `/admin/licitaciones/documentos-propuesta` | `pages/admin/licitaciones/documentos-propuesta.tsx` | 625 | — |  |
| `/admin/licitaciones/feriados` | `pages/admin/licitaciones/feriados.tsx` | 535 | Gestión › Feriados |  |
| `/admin/licitaciones/templates` | `pages/admin/licitaciones/templates.tsx` | 753 | Gestión › Plantillas de Bases |  |
| `/licitaciones/[id]` | `pages/licitaciones/[id].tsx` | 964 | — |  |
| `/licitaciones/[id]/evaluacion` | `pages/licitaciones/[id]/evaluacion.tsx` | 1117 | — |  |
| `/licitaciones/importar` | `pages/licitaciones/importar.tsx` | 360 | — |  |
| `/licitaciones` | `pages/licitaciones/index.tsx` | 689 | Gestión › Procesos |  |
| `/licitaciones/nueva` | `pages/licitaciones/nueva.tsx` | 598 | — |  |
| `/propuesta/[slug]` | `pages/propuesta/[slug].tsx` | 220 | — |  |

## /admin/licitaciones/consultores

File `pages/admin/licitaciones/consultores.tsx` · 854 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.132 `router.push → /login  (when !user)`
  - l.144 `router.push → /dashboard  (when !roles.includes('admin'))`
  - l.153 `router.push → /login`
- Linked from: `components/licitaciones/ProposalConfigPanel.tsx:1070`, `components/licitaciones/ProposalConfigPanel.tsx:1071`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/flows/proposal-consultant-crud.spec.ts`.

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
| «Consultores FNE» | h1 |  | ConsultoresAdminPage · l.449 |

**Buttons** (15)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver» | `{() => router.back()}` |  |  |  | ConsultoresAdminPage · l.439 |
| «Nuevo Consultor» | `{openCreate}` |  |  |  | ConsultoresAdminPage · l.454 |
| «Agregar el primero» | `{openCreate}` | `!(loading) && consultores.length === 0` |  |  | ConsultoresAdminPage · l.470 |
| «[icon Pencil]» · tooltip «Editar» | `{() => openEdit(c)}` | `!(loading) && !(consultores.length === 0) && each consultores` |  |  | ConsultoresAdminPage · l.533 |
| «[icon Trash2]» · tooltip «Desactivar» | `{() => setConfirmDeleteId(c.id)}` | `!(loading) && !(consultores.length === 0) && each consultores` |  |  | ConsultoresAdminPage · l.540 |
| «Agregar» | `{addEspecialidad}` |  |  |  | ConsultoresAdminPage · l.653 |
| «[icon X]» | `{() => removeEspecialidad(i)}` | `each form.especialidades` |  |  | ConsultoresAdminPage · l.664 |
| «+ Agregar» | `{addFormacion}` |  |  |  | ConsultoresAdminPage · l.680 |
| «[icon X]» | `{() => removeFormacion(i)}` | `each form.formacion_academica` |  |  | ConsultoresAdminPage · l.710 |
| «+ Agregar» | `{addExperiencia}` |  |  |  | ConsultoresAdminPage · l.726 |
| «[icon X]» | `{() => removeExperiencia(i)}` | `each form.experiencia_profesional` |  |  | ConsultoresAdminPage · l.755 |
| «Cancelar» | `{() => setDialogOpen(false)}` |  |  |  | ConsultoresAdminPage · l.813 |
| «Guardando... / Guardar cambios / Crear consultor» | `{handleSave}` |  | `{saving \|\| uploadingFoto \|\| uploadingCv}` |  | ConsultoresAdminPage · l.816 |
| «Cancelar» | `{() => setConfirmDeleteId(null)}` |  |  |  | ConsultoresAdminPage · l.838 |
| «Desactivando... / Desactivar» | `{() => confirmDeleteId && handleDelete(confirmDeleteId)}` |  | `{deleting}` |  | ConsultoresAdminPage · l.841 |

**Fields** (14)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre completo *» | text | «Ej: Arnoldo Cisternas» |  |  |  | ConsultoresAdminPage · l.571 |
| «Título *» | text | «Ej: Director del Programa» |  |  |  | ConsultoresAdminPage · l.580 |
| «Categoría *» | select |  | «(lista) {v}» |  |  | ConsultoresAdminPage · l.593 |
| «Orden de aparición» | number | `min=0` |  |  |  | ConsultoresAdminPage · l.613 |
| «Perfil profesional (bio)» | textarea | «Descripción del perfil profesional...» |  |  |  | ConsultoresAdminPage · l.628 |
| «Especialidades» | text | «Escribir y presionar Enter» · also `onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEspecialidad(); } }}` |  |  |  | ConsultoresAdminPage · l.641 |
| «Año» | number | «Año» |  | `each form.formacion_academica` |  | ConsultoresAdminPage · l.691 |
| «Institución» | text | «Institución» |  | `each form.formacion_academica` |  | ConsultoresAdminPage · l.698 |
| «Título» | text | «Título» |  | `each form.formacion_academica` |  | ConsultoresAdminPage · l.704 |
| «Empresa» | text | «Empresa» |  | `each form.experiencia_profesional` |  | ConsultoresAdminPage · l.737 |
| «Cargo» | text | «Cargo» |  | `each form.experiencia_profesional` |  | ConsultoresAdminPage · l.743 |
| «Función» | text | «Función» |  | `each form.experiencia_profesional` |  | ConsultoresAdminPage · l.749 |
| «Foto de perfil (PNG/JPG)» | file | disabled: `{uploadingFoto}` · accepts `image/png,image/jpeg,image/jpg,image/webp` |  |  |  | ConsultoresAdminPage · l.778 |
| «CV (PDF)» | file | disabled: `{uploadingCv}` · accepts `application/pdf` |  |  |  | ConsultoresAdminPage · l.797 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Nombre / Título» | `!(loading) && !(consultores.length === 0)` | ConsultoresAdminPage · l.479 |
| «Categoría» | `!(loading) && !(consultores.length === 0)` · screen size: `hidden md:table-cell` | ConsultoresAdminPage · l.480 |
| «Especialidades» | `!(loading) && !(consultores.length === 0)` · screen size: `hidden lg:table-cell` | ConsultoresAdminPage · l.481 |
| «Foto» | `!(loading) && !(consultores.length === 0)` · screen size: `hidden md:table-cell` | ConsultoresAdminPage · l.482 |
| «CV» | `!(loading) && !(consultores.length === 0)` · screen size: `hidden md:table-cell` | ConsultoresAdminPage · l.483 |
| «Acciones» | `!(loading) && !(consultores.length === 0)` | ConsultoresAdminPage · l.484 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{dialogOpen}` |  | ConsultoresAdminPage · l.558 |
| `Dialog` | component | `{!!confirmDeleteId}` |  | ConsultoresAdminPage · l.828 |

**Toasts** (16)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Solo administradores pueden gestionar consultores» | `!roles.includes('admin')` | checkAuth · l.143 |
| error | «Error al cargar consultores» | `!(res.ok)` | ConsultoresAdminPage · l.169 |
| error | «Error al cargar consultores» |  | ConsultoresAdminPage · l.172 |
| error | «Nombre y título son requeridos» | `!form.nombre.trim() \|\| !form.titulo.trim()` | handleSave · l.212 |
| error | «Error al guardar consultor» | `!res.ok` | handleSave · l.244 |
| success | «Consultor actualizado / Consultor creado» |  | handleSave · l.248 |
| error | «Error al guardar consultor» |  | handleSave · l.252 |
| error | «Error al desactivar consultor» | `!res.ok` | handleDelete · l.264 |
| success | «Consultor desactivado» |  | handleDelete · l.267 |
| error | «Error al desactivar consultor» |  | handleDelete · l.271 |
| error | «Error al subir foto» | `!res.ok` | handleUploadFoto · l.290 |
| success | «Foto subida» |  | handleUploadFoto · l.294 |
| error | «Error al subir foto» |  | handleUploadFoto · l.296 |
| error | «Error al subir CV» | `!res.ok` | handleUploadCv · l.311 |
| success | «CV subido» |  | handleUploadCv · l.315 |
| error | «Error al subir CV» |  | handleUploadCv · l.317 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.132 |
| `/dashboard` | `router.push` | `!roles.includes('admin')` | checkAuth · l.144 |
| `/login` | `router.push` |  | checkAuth · l.153 |

**Pieces placed here, with the texts and settings handed to them** (10)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Consultores | `!authReady` |  | ConsultoresAdminPage · l.416 |
| `MainLayout` | pageTitle: Consultores FNE |  |  | ConsultoresAdminPage · l.431 |
| `DialogContent` |  |  |  | ConsultoresAdminPage · l.559 |
| `DialogHeader` |  |  |  | ConsultoresAdminPage · l.560 |
| `DialogTitle` |  |  |  | ConsultoresAdminPage · l.561 |
| `DialogFooter` |  |  |  | ConsultoresAdminPage · l.812 |
| `DialogContent` |  |  |  | ConsultoresAdminPage · l.829 |
| `DialogHeader` |  |  |  | ConsultoresAdminPage · l.830 |
| `DialogTitle` |  |  |  | ConsultoresAdminPage · l.831 |
| `DialogFooter` |  |  |  | ConsultoresAdminPage · l.837 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `CATEGORIA_LABELS` | «Comité Internacional», «Equipo FNE», «Asesor Internacional» | l.33 |
| `method` | «PATCH / POST» | handleSave · l.234 |

**Values shown from data** (7)

- `{c.nombre}` — ConsultoresAdminPage · l.491, when `!(loading) && !(consultores.length === 0) && each consultores`
- `{c.titulo}` — ConsultoresAdminPage · l.492, when `!(loading) && !(consultores.length === 0) && each consultores`
- `{CATEGORIA_LABELS[c.categoria]}` — ConsultoresAdminPage · l.495, when `!(loading) && !(consultores.length === 0) && each consultores`, screen size: `hidden md:table-cell`
- `{e}` — ConsultoresAdminPage · l.504, when `!(loading) && !(consultores.length === 0) && each consultores && (each (c.especialidades \|\| []).slice(0, 3))`, screen size: `hidden lg:table-cell`
- `+ {(c.especialidades?.length \|\| 0) - 3}` — ConsultoresAdminPage · l.512, when `!(loading) && !(consultores.length === 0) && each consultores && ((c.especialidades?.length \|\| 0) > 3)`, screen size: `hidden lg:table-cell`
- `✓ {form.foto_path.split('/').pop()}` — ConsultoresAdminPage · l.774, when `form.foto_path`
- `✓ {form.cv_pdf_path.split('/').pop()}` — ConsultoresAdminPage · l.793, when `form.cv_pdf_path`

**Other texts on screen** (17)

- «Biblioteca de consultores para propuestas de licitación» — ConsultoresAdminPage · l.451
- «No hay consultores registrados» — ConsultoresAdminPage · l.469, when `!(loading) && consultores.length === 0`
- «Editar Consultor / Nuevo Consultor» — ConsultoresAdminPage · l.561
- «Nombre completo *» (label) — ConsultoresAdminPage · l.568
- «Título *» (label) — ConsultoresAdminPage · l.579
- «Categoría *» (label) — ConsultoresAdminPage · l.592
- «Orden de aparición» (label) — ConsultoresAdminPage · l.610
- «Perfil profesional (bio)» (label) — ConsultoresAdminPage · l.625
- «Especialidades» (label) — ConsultoresAdminPage · l.639
- «Formación académica» (label) — ConsultoresAdminPage · l.679
- «Experiencia profesional» (label) — ConsultoresAdminPage · l.725
- «Foto de perfil (PNG/JPG)» (label) — ConsultoresAdminPage · l.770
- «Subiendo...» — ConsultoresAdminPage · l.788, when `uploadingFoto`
- «CV (PDF)» (label) — ConsultoresAdminPage · l.791
- «Subiendo...» — ConsultoresAdminPage · l.807, when `uploadingCv`
- «Desactivar consultor» — ConsultoresAdminPage · l.831
- «El consultor será desactivado y no aparecerá en nuevas propuestas. Puede reactivarlo editándolo directamente en la base de datos.» — ConsultoresAdminPage · l.834

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/ui/dialog.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/my-roles` | GET | `pages/admin/licitaciones/consultores.tsx:136` |
| `/api/propuestas/consultores` | GET | `pages/admin/licitaciones/consultores.tsx:164`, `pages/admin/licitaciones/consultores.tsx:233` |
| `/api/propuestas/consultores/[id]` | DELETE | `pages/admin/licitaciones/consultores.tsx:232`, `pages/admin/licitaciones/consultores.tsx:261` |
| `/api/propuestas/upload` | POST | `pages/admin/licitaciones/consultores.tsx:287`, `pages/admin/licitaciones/consultores.tsx:308` |

## /admin/licitaciones/criterios

File `pages/admin/licitaciones/criterios.tsx` · 666 lines · frame: MainLayout

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.93 `router.push → /login  (when !user)`
  - l.107 `router.push → /dashboard  (when !roles.includes('admin'))`
  - l.115 `router.push → /login`
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

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Criterios de Evaluacion Tecnica» | h1 |  | CriteriosAdminPage · l.346 |
| «Criterios» | h2 | `selectedProgramaId` | CriteriosAdminPage · l.377 |
| «Nuevo Criterio» | h3 | `selectedProgramaId && !(loading) && showAddForm` | CriteriosAdminPage · l.580 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver» | `{() => router.push('/admin/licitaciones/templates')}` |  |  |  | CriteriosAdminPage · l.336 |
| «Agregar criterio» | `{() => setShowAddForm(!showAddForm)}` | `selectedProgramaId` |  |  | CriteriosAdminPage · l.391 |
| «[icon Save]» · tooltip «Guardar» · aria «Guardar criterio» | `{() => handleSaveCriterio(c.id)}` | `selectedProgramaId && !(loading) && each criterios && editing` | `{saving[c.id]}` |  | CriteriosAdminPage · l.482 |
| «Cancelar» | `{() => setEditingRows(prev => { const next = { ...prev }; delete next[c.id]; ret…}` | `selectedProgramaId && !(loading) && each criterios && editing` |  |  | CriteriosAdminPage · l.491 |
| «Editar» | `{() => setEditingRows(prev => ({ ...prev, [c.id]: { id: c.id, nombre_criterio: c…}` | `selectedProgramaId && !(loading) && each criterios && !(editing)` |  |  | CriteriosAdminPage · l.529 |
| «[icon Trash2]» · tooltip «Desactivar» · aria «{`Desactivar criterio ${c.nombre_criterio}`}» | `{() => handleDeleteCriterio(c.id, c.nombre_criterio)}` | `!(loading) && each criterios && !(editing) && c.is_active` | `{saving[c.id]}` |  | CriteriosAdminPage · l.548 |
| «Guardando... / Agregar Criterio» | `{handleAddCriterio}` | `selectedProgramaId && !(loading) && showAddForm` | `{saving.new}` |  | CriteriosAdminPage · l.632 |
| «Cancelar» | `{() => { setShowAddForm(false); setNewRow({ nombre_criterio: '', puntaje_maximo:…}` | `selectedProgramaId && !(loading) && showAddForm` |  |  | CriteriosAdminPage · l.639 |

**Fields** (9)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Programa» | select |  | «Seleccione un programa...», «(lista) {p.nombre}» |  | `id=programa-select (id used by code)` | CriteriosAdminPage · l.357 |
|  | text |  |  | `selectedProgramaId && !(loading) && each criterios && editing` |  | CriteriosAdminPage · l.427 |
|  | number | `min={1} step={1}` |  | `selectedProgramaId && !(loading) && each criterios && editing` |  | CriteriosAdminPage · l.440 |
|  | number | `min={0}` |  | `selectedProgramaId && !(loading) && each criterios && editing` |  | CriteriosAdminPage · l.455 |
|  | checkbox |  |  | `selectedProgramaId && !(loading) && each criterios && editing` |  | CriteriosAdminPage · l.469 |
| «Nombre *» | text | «Nombre del criterio» |  | `selectedProgramaId && !(loading) && showAddForm` |  | CriteriosAdminPage · l.586 |
| «Puntaje Max *» | number | «20» · `min={1}` |  | `selectedProgramaId && !(loading) && showAddForm` |  | CriteriosAdminPage · l.598 |
| «Orden» | number | «{String(criterios.length + 1)}» · `min={0}` |  | `selectedProgramaId && !(loading) && showAddForm` |  | CriteriosAdminPage · l.609 |
| «Descripcion (opcional)» | textarea | «Descripcion del criterio de evaluacion» |  | `selectedProgramaId && !(loading) && showAddForm` |  | CriteriosAdminPage · l.622 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Criterio» | `selectedProgramaId && !(loading)` | CriteriosAdminPage · l.412 |
| «Max pts» | `selectedProgramaId && !(loading)` | CriteriosAdminPage · l.413 |
| «Orden» | `selectedProgramaId && !(loading)` | CriteriosAdminPage · l.414 |
| «Activo» | `selectedProgramaId && !(loading)` | CriteriosAdminPage · l.415 |
| «Acciones» | `selectedProgramaId && !(loading)` | CriteriosAdminPage · l.416 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Desactivar el criterio "{nombre}"?» |  | handleDeleteCriterio · l.236 |

**Toasts** (16)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Solo administradores pueden gestionar criterios» | `!roles.includes('admin')` | checkAuth · l.106 |
| error | «Error al cargar programas» |  | loadProgramas · l.143 |
| error | «Error al cargar criterios» |  | CriteriosAdminPage · l.159 |
| error | «Nombre del criterio requerido» | `!editing.nombre_criterio.trim()` | handleSaveCriterio · l.191 |
| error | «Puntaje maximo debe ser mayor a 0» | `isNaN(puntaje) \|\| puntaje <= 0` | handleSaveCriterio · l.196 |
| error | «Error al actualizar criterio» | `!res.ok` | handleSaveCriterio · l.218 |
| success | «Criterio actualizado» |  | handleSaveCriterio · l.221 |
| error | «Error al actualizar criterio» |  | handleSaveCriterio · l.229 |
| error | «Error al eliminar criterio» | `!res.ok` | handleDeleteCriterio · l.246 |
| success | «Criterio desactivado» |  | handleDeleteCriterio · l.249 |
| error | «Error al eliminar criterio» |  | handleDeleteCriterio · l.252 |
| error | «Nombre del criterio requerido» | `!newRow.nombre_criterio.trim()` | handleAddCriterio · l.260 |
| error | «Puntaje maximo debe ser mayor a 0» | `isNaN(puntaje) \|\| puntaje <= 0` | handleAddCriterio · l.265 |
| error | «Error al crear criterio» | `!res.ok` | handleAddCriterio · l.285 |
| success | «Criterio creado» |  | handleAddCriterio · l.288 |
| error | «Error al crear criterio» |  | handleAddCriterio · l.300 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.93 |
| `/dashboard` | `router.push` | `!roles.includes('admin')` | checkAuth · l.107 |
| `/login` | `router.push` |  | checkAuth · l.115 |
| `/admin/licitaciones/templates` | `router.push` |  | CriteriosAdminPage · l.337 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Criterios de Evaluacion | `!authReady` |  | CriteriosAdminPage · l.312 |
| `MainLayout` | pageTitle: Criterios de Evaluacion · userRole: admin |  |  | CriteriosAdminPage · l.327 |

**Values shown from data** (4)

- `{editedTotalActivePuntaje.toFixed(1)} / 100` — CriteriosAdminPage · l.380, when `selectedProgramaId`
- `{c.descripcion}` — CriteriosAdminPage · l.511, when `!(loading) && each criterios && !(editing) && c.descripcion`
- `{c.puntaje_maximo}` — CriteriosAdminPage · l.514, when `selectedProgramaId && !(loading) && each criterios && !(editing)`
- `{c.orden}` — CriteriosAdminPage · l.515, when `selectedProgramaId && !(loading) && each criterios && !(editing)`

**Other texts on screen** (10)

- «Administre los criterios de evaluacion por programa. La suma de puntajes maximos debe ser 100.» — CriteriosAdminPage · l.348
- «Programa» (label) — CriteriosAdminPage · l.354
- «Total puntaje activos:» — CriteriosAdminPage · l.379, when `selectedProgramaId`
- «Activo / Inactivo» — CriteriosAdminPage · l.517, when `selectedProgramaId && !(loading) && each criterios && !(editing)`
- «No hay criterios definidos para este programa.» — CriteriosAdminPage · l.569, when `selectedProgramaId && !(loading) && criterios.length === 0`
- «Nombre *» (label) — CriteriosAdminPage · l.583, when `selectedProgramaId && !(loading) && showAddForm`
- «Puntaje Max *» (label) — CriteriosAdminPage · l.595, when `selectedProgramaId && !(loading) && showAddForm`
- «Orden» (label) — CriteriosAdminPage · l.608, when `selectedProgramaId && !(loading) && showAddForm`
- «Descripcion (opcional)» (label) — CriteriosAdminPage · l.619, when `selectedProgramaId && !(loading) && showAddForm`
- «⚠ La suma de puntajes maximos de criterios activos es {totalActivePuntaje.toFixed(1)} , no 100. Ajuste los criterios.» — CriteriosAdminPage · l.658, when `selectedProgramaId && Math.abs(totalActivePuntaje - 100) > 0.01 && criterios.length > 0`

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/licitaciones.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/licitaciones/criterios` | DELETE, GET, PATCH, POST | `pages/admin/licitaciones/criterios.tsx:151`, `pages/admin/licitaciones/criterios.tsx:203`, `pages/admin/licitaciones/criterios.tsx:241`, `pages/admin/licitaciones/criterios.tsx:271` |
| `/api/admin/licitaciones/templates` | GET | `pages/admin/licitaciones/criterios.tsx:126` |
| `/api/auth/my-roles` | GET | `pages/admin/licitaciones/criterios.tsx:97` |

## /admin/licitaciones/documentos-propuesta

File `pages/admin/licitaciones/documentos-propuesta.tsx` · 625 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.146 `router.push → /login  (when !user)`
  - l.158 `router.push → /dashboard  (when !roles.includes('admin'))`
  - l.167 `router.push → /login`
- Linked from: `components/licitaciones/ProposalConfigPanel.tsx:1454`, `components/licitaciones/ProposalConfigPanel.tsx:1455`, `components/licitaciones/ProposalConfigPanel.tsx:1526`, `components/licitaciones/ProposalConfigPanel.tsx:1527`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/flows/proposal-document-library.spec.ts`.

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
| «Biblioteca de Documentos» | h1 |  | DocumentosPropuestaAdminPage · l.371 |

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver» | `{() => router.back()}` |  |  |  | DocumentosPropuestaAdminPage · l.361 |
| «Nuevo Documento» | `{openCreate}` |  |  |  | DocumentosPropuestaAdminPage · l.376 |
| «Agregar el primero» | `{openCreate}` | `!(loading) && documentos.length === 0` |  |  | DocumentosPropuestaAdminPage · l.403 |
| «[icon Pencil]» · tooltip «Editar» | `{() => openEdit(doc)}` | `!(loading) && !(documentos.length === 0) && each documentos` |  |  | DocumentosPropuestaAdminPage · l.455 |
| «[icon Trash2]» · tooltip «Eliminar» | `{() => setConfirmDeleteId(doc.id)}` | `!(loading) && !(documentos.length === 0) && each documentos` |  |  | DocumentosPropuestaAdminPage · l.462 |
| «Cancelar» | `{() => setDialogOpen(false)}` |  |  |  | DocumentosPropuestaAdminPage · l.584 |
| «Guardando... / Guardar cambios / Crear documento» | `{handleSave}` |  | `{saving \|\| uploadingFile}` |  | DocumentosPropuestaAdminPage · l.587 |
| «Cancelar» | `{() => setConfirmDeleteId(null)}` |  |  |  | DocumentosPropuestaAdminPage · l.609 |
| «Eliminando... / Eliminar» | `{() => confirmDeleteId && handleDelete(confirmDeleteId)}` |  | `{deleting}` |  | DocumentosPropuestaAdminPage · l.612 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre *» | text | «Ej: Certificado de Pertenencia FNE» |  |  |  | DocumentosPropuestaAdminPage · l.491 |
| «Tipo *» | select |  | «(lista) {v}» |  |  | DocumentosPropuestaAdminPage · l.502 |
| «Descripción (opcional)» | text | «Ej: Certificado vigente emitido por MINEDUC» |  |  |  | DocumentosPropuestaAdminPage · l.520 |
| «Fecha de emisión» | date |  |  |  |  | DocumentosPropuestaAdminPage · l.534 |
| «Fecha de vencimiento» | date |  |  |  |  | DocumentosPropuestaAdminPage · l.545 |
| «Archivo (PDF) [*]» | file | disabled: `{uploadingFile}` · accepts `application/pdf,image/png,image/jpeg` |  |  |  | DocumentosPropuestaAdminPage · l.564 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | `!(loading) && !(documentos.length === 0)` | DocumentosPropuestaAdminPage · l.412 |
| «Tipo» | `!(loading) && !(documentos.length === 0)` · screen size: `hidden md:table-cell` | DocumentosPropuestaAdminPage · l.413 |
| «Emisión» | `!(loading) && !(documentos.length === 0)` · screen size: `hidden md:table-cell` | DocumentosPropuestaAdminPage · l.414 |
| «Vencimiento» | `!(loading) && !(documentos.length === 0)` | DocumentosPropuestaAdminPage · l.417 |
| «Acciones» | `!(loading) && !(documentos.length === 0)` | DocumentosPropuestaAdminPage · l.418 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{dialogOpen}` |  | DocumentosPropuestaAdminPage · l.481 |
| `Dialog` | component | `{!!confirmDeleteId}` |  | DocumentosPropuestaAdminPage · l.599 |

**Toasts** (14)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Solo administradores pueden gestionar documentos» | `!roles.includes('admin')` | checkAuth · l.157 |
| error | «Error al cargar documentos» | `!(res.ok)` | DocumentosPropuestaAdminPage · l.183 |
| error | «Error al cargar documentos» |  | DocumentosPropuestaAdminPage · l.186 |
| error | «El nombre es requerido» | `!form.nombre.trim()` | handleSave · l.221 |
| error | «Debe subir un archivo» | `!form.archivo_path && !editing` | handleSave · l.225 |
| error | «Error al guardar documento» | `!res.ok` | handleSave · l.252 |
| success | «Documento actualizado / Documento creado» |  | handleSave · l.256 |
| error | «Error al guardar documento» |  | handleSave · l.260 |
| error | «Error al eliminar documento» | `!res.ok` | handleDelete · l.272 |
| success | «Documento eliminado» |  | handleDelete · l.275 |
| error | «Error al eliminar documento» |  | handleDelete · l.279 |
| error | «Error al subir archivo» | `!res.ok` | handleUploadFile · l.298 |
| success | «Archivo subido» |  | handleUploadFile · l.302 |
| error | «Error al subir archivo» |  | handleUploadFile · l.304 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.146 |
| `/dashboard` | `router.push` | `!roles.includes('admin')` | checkAuth · l.158 |
| `/login` | `router.push` |  | checkAuth · l.167 |

**Pieces placed here, with the texts and settings handed to them** (10)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Documentos | `!authReady` |  | DocumentosPropuestaAdminPage · l.338 |
| `MainLayout` | pageTitle: Documentos para Propuestas |  |  | DocumentosPropuestaAdminPage · l.353 |
| `DialogContent` |  |  |  | DocumentosPropuestaAdminPage · l.482 |
| `DialogHeader` |  |  |  | DocumentosPropuestaAdminPage · l.483 |
| `DialogTitle` |  |  |  | DocumentosPropuestaAdminPage · l.484 |
| `DialogFooter` |  |  |  | DocumentosPropuestaAdminPage · l.583 |
| `DialogContent` |  |  |  | DocumentosPropuestaAdminPage · l.600 |
| `DialogHeader` |  |  |  | DocumentosPropuestaAdminPage · l.601 |
| `DialogTitle` |  |  |  | DocumentosPropuestaAdminPage · l.602 |
| `DialogFooter` |  |  |  | DocumentosPropuestaAdminPage · l.608 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `TIPO_LABELS` | «Certificado de Pertenencia», «Evaluaciones de Clientes», «Carta de Recomendación», «Ficha de Servicio», «Otro» | l.28 |
| `method` | «PATCH / POST» | handleSave · l.242 |

**Values shown from data** (5)

- `{doc.nombre}` — DocumentosPropuestaAdminPage · l.434, when `!(loading) && !(documentos.length === 0) && each documentos`
- `{doc.descripcion}` — DocumentosPropuestaAdminPage · l.436, when `!(loading) && !(documentos.length === 0) && each documentos && doc.descripcion`
- `{TIPO_LABELS[doc.tipo]}` — DocumentosPropuestaAdminPage · l.442, when `!(loading) && !(documentos.length === 0) && each documentos`, screen size: `hidden md:table-cell`
- `{formatDate(doc.fecha_emision)}` — DocumentosPropuestaAdminPage · l.448, when `!(loading) && !(documentos.length === 0) && each documentos`, screen size: `hidden md:table-cell`
- `✓ {form.archivo_path.split('/').pop()}` — DocumentosPropuestaAdminPage · l.560, when `form.archivo_path`

**Other texts on screen** (18)

- «Sin vencimiento» — ExpiryBadge · l.316, when `status === 'no_expiry'`
- «Vencido» — ExpiryBadge · l.321, when `status === 'expired'`
- «Vence» — ExpiryBadge · l.328, when `status === 'expiring_soon'`
- «Vigente hasta {formatDate(doc.fecha_vencimiento)}» — ExpiryBadge · l.332
- «Certificados, evaluaciones y cartas para anexar a propuestas» — DocumentosPropuestaAdminPage · l.373
- «Hay {documentos.filter(d => getExpirySta…} documento(s) vencido(s). Los certificados vencidos bloquean la generación de propuestas.» — DocumentosPropuestaAdminPage · l.386, when `documentos.some(d => getExpiryStatus(d) === 'expired')`
- «No hay documentos registrados» — DocumentosPropuestaAdminPage · l.402, when `!(loading) && documentos.length === 0`
- «Editar Documento / Nuevo Documento» — DocumentosPropuestaAdminPage · l.484
- «Nombre *» (label) — DocumentosPropuestaAdminPage · l.490
- «Tipo *» (label) — DocumentosPropuestaAdminPage · l.501
- «Descripción (opcional)» (label) — DocumentosPropuestaAdminPage · l.517
- «Fecha de emisión» (label) — DocumentosPropuestaAdminPage · l.531
- «Fecha de vencimiento» (label) — DocumentosPropuestaAdminPage · l.542
- «Archivo (PDF) [*]» (label) — DocumentosPropuestaAdminPage · l.556
- «Subiendo...» — DocumentosPropuestaAdminPage · l.574, when `uploadingFile`
- «Deje vacío para conservar el archivo actual» — DocumentosPropuestaAdminPage · l.577, when `editing && !form.archivo_path`
- «Eliminar documento» — DocumentosPropuestaAdminPage · l.602
- «El documento será eliminado de la biblioteca y no estará disponible para nuevas propuestas. Esta acción es irreversible.» — DocumentosPropuestaAdminPage · l.605

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/ui/dialog.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/my-roles` | GET | `pages/admin/licitaciones/documentos-propuesta.tsx:150` |
| `/api/propuestas/documentos` | GET | `pages/admin/licitaciones/documentos-propuesta.tsx:178`, `pages/admin/licitaciones/documentos-propuesta.tsx:241` |
| `/api/propuestas/documentos/[id]` | DELETE | `pages/admin/licitaciones/documentos-propuesta.tsx:240`, `pages/admin/licitaciones/documentos-propuesta.tsx:269` |
| `/api/propuestas/upload` | POST | `pages/admin/licitaciones/documentos-propuesta.tsx:295` |

## /admin/licitaciones/feriados

File `pages/admin/licitaciones/feriados.tsx` · 535 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Feriados» → `/admin/licitaciones/feriados` — admin only; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.613)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.97 `router.push → /login  (when !user)`
  - l.111 `router.push → /dashboard  (when !roles.includes('admin'))`
  - l.119 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:615`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 2, encargado_licitacion 1.

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

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Feriados Chile» | h1 |  | FeriadosAdminPage · l.318 |
| «Nuevo Feriado» | h3 | `showAddForm` | FeriadosAdminPage · l.372 |

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Licitaciones» | `{() => router.push('/licitaciones')}` |  |  |  | FeriadosAdminPage · l.310 |
| «Cargando... / Cargar feriados {selectedYear}» · tooltip «{`Agregar automaticamente todos los feriados de Chile para ${selectedYear}`}» | `{handleBulkSeed}` |  | `{bulkSeeding}` |  | FeriadosAdminPage · l.347 |
| «Agregar Feriado» | `{() => { setShowAddForm(!showAddForm); setNewFeriado({ fecha: '${selectedYear}-0…}` |  |  |  | FeriadosAdminPage · l.356 |
| «Guardando... / Guardar» | `{handleAdd}` | `showAddForm` | `{addingSaving}` |  | FeriadosAdminPage · l.397 |
| «Cancelar» | `{() => setShowAddForm(false)}` | `showAddForm` |  |  | FeriadosAdminPage · l.404 |
| «Guardando... / Guardar» | `{() => handleSaveEdit(feriado.id)}` | `!(loading) && !(feriados.length === 0) && each feriados && editingId === feriado.id` | `{saving}` |  | FeriadosAdminPage · l.466 |
| «Cancelar» | `{cancelEdit}` | `!(loading) && !(feriados.length === 0) && each feriados && editingId === feriado.id` |  |  | FeriadosAdminPage · l.474 |
| «[icon Edit2]» · aria «{`Editar ${feriado.nombre}`}» | `{() => startEdit(feriado)}` | `!(loading) && !(feriados.length === 0) && each feriados && !(editingId === feriado.id)` |  |  | FeriadosAdminPage · l.489 |
| «... / Confirmar» | `{() => handleDelete(feriado.id)}` | `!(feriados.length === 0) && each feriados && !(editingId === feriado.id) && confirmDeleteId === feriado.id` | `{deletingId === feriado.id}` |  | FeriadosAdminPage · l.498 |
| «Cancelar» | `{() => setConfirmDeleteId(null)}` | `!(feriados.length === 0) && each feriados && !(editingId === feriado.id) && confirmDeleteId === feriado.id` |  |  | FeriadosAdminPage · l.505 |
| «[icon Trash2]» · aria «{`Eliminar ${feriado.nombre}`}» | `{() => setConfirmDeleteId(feriado.id)}` | `!(feriados.length === 0) && each feriados && !(editingId === feriado.id) && !(confirmDeleteId === feriado.id)` |  |  | FeriadosAdminPage · l.513 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Filtrar por año:» | select |  | «(lista) {y}» |  | `id=year-filter (id used by code)` | FeriadosAdminPage · l.332 |
| «Fecha» | date |  |  | `showAddForm` | `id=new-feriado-fecha (id used by code)` | FeriadosAdminPage · l.376 |
| «Nombre del Feriado» | text | «Ej: Año Nuevo» |  | `showAddForm` | `id=new-feriado-nombre (id used by code)` | FeriadosAdminPage · l.386 |
| «Fecha del feriado» | date |  |  | `!(loading) && !(feriados.length === 0) && each feriados && editingId === feriado.id` |  | FeriadosAdminPage · l.440 |
| «Nombre del feriado» | text |  |  | `!(loading) && !(feriados.length === 0) && each feriados && editingId === feriado.id` |  | FeriadosAdminPage · l.451 |

**Table columns** (4)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» | `!(loading) && !(feriados.length === 0)` | FeriadosAdminPage · l.428 |
| «Nombre» | `!(loading) && !(feriados.length === 0)` | FeriadosAdminPage · l.429 |
| «Año» | `!(loading) && !(feriados.length === 0)` | FeriadosAdminPage · l.430 |
| «Acciones» | `!(loading) && !(feriados.length === 0)` · hidden by its class (`sr-only`); another control opens it or it is for screen readers | FeriadosAdminPage · l.431 |

**Toasts** (13)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar feriados» |  | FeriadosAdminPage · l.81 |
| error | «Solo administradores pueden gestionar feriados» | `!roles.includes('admin')` | FeriadosAdminPage · l.110 |
| error | «Fecha y nombre son requeridos» | `!newFeriado.fecha \|\| !newFeriado.nombre.trim()` | handleAdd · l.139 |
| success | «Feriado agregado exitosamente» |  | handleAdd · l.156 |
| error | «Error al crear feriado» |  | handleAdd · l.161 |
| error | «Fecha y nombre son requeridos» | `!editForm.fecha \|\| !editForm.nombre.trim()` | handleSaveEdit · l.184 |
| success | «Feriado actualizado exitosamente» |  | handleSaveEdit · l.201 |
| error | «Error al actualizar feriado» |  | handleSaveEdit · l.205 |
| success | «Feriado eliminado exitosamente» |  | handleDelete · l.229 |
| error | «Error al eliminar feriado» |  | handleDelete · l.233 |
| success | «Todos los feriados de {selectedYear} ya estaban registrados» | `inserted === 0` | handleBulkSeed · l.259 |
| success | «{inserted} feriado{inserted !== 1 ? 's' : ''} agregado{inserted !== 1 ? 's' : ''} para {selectedYear}» | `!(inserted === 0)` | handleBulkSeed · l.261 |
| error | «Error al cargar feriados» |  | handleBulkSeed · l.265 |

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar feriados» | `throw (shown by whoever catches it)` | `!res.ok` | FeriadosAdminPage · l.76 |
| «Error al crear feriado» | `throw (shown by whoever catches it)` | `!res.ok` | handleAdd · l.153 |
| «Error al actualizar feriado» | `throw (shown by whoever catches it)` | `!res.ok` | handleSaveEdit · l.198 |
| «Error al eliminar feriado» | `throw (shown by whoever catches it)` | `!res.ok` | handleDelete · l.226 |
| «Error al cargar feriados» | `throw (shown by whoever catches it)` | `!res.ok` | handleBulkSeed · l.254 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | FeriadosAdminPage · l.97 |
| `/dashboard` | `router.push` | `!roles.includes('admin')` | FeriadosAdminPage · l.111 |
| `/login` | `router.push` |  | FeriadosAdminPage · l.119 |
| `/licitaciones` | `router.push` |  | FeriadosAdminPage · l.311 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Feriados Chile · userRole: admin |  |  | FeriadosAdminPage · l.300 |
| `Calendar` | aria-hidden: true |  |  | FeriadosAdminPage · l.319 |

**Values shown from data** (4)

- `{editForm.fecha.split('-')[0]} / {feriado.year}` — FeriadosAdminPage · l.461, when `!(loading) && !(feriados.length === 0) && each feriados && editingId === feriado.id`
- `{formatDate(feriado.fecha)}` — FeriadosAdminPage · l.482, when `!(loading) && !(feriados.length === 0) && each feriados && !(editingId === feriado.id)`
- `{feriado.nombre}` — FeriadosAdminPage · l.485, when `!(loading) && !(feriados.length === 0) && each feriados && !(editingId === feriado.id)`
- `{feriado.year}` — FeriadosAdminPage · l.486, when `!(loading) && !(feriados.length === 0) && each feriados && !(editingId === feriado.id)`

**Other texts on screen** (6)

- «Gestione los feriados nacionales utilizados en el cálculo del cronograma de licitaciones» — FeriadosAdminPage · l.323
- «Filtrar por año:» (label) — FeriadosAdminPage · l.331
- «{feriados.length} feriado s» — FeriadosAdminPage · l.342
- «Fecha» (label) — FeriadosAdminPage · l.375, when `showAddForm`
- «Nombre del Feriado» (label) — FeriadosAdminPage · l.385, when `showAddForm`
- «No hay feriados registrados para el año {selectedYear} .» — FeriadosAdminPage · l.421, when `!(loading) && feriados.length === 0`

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/licitaciones.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/licitaciones/feriados` | DELETE, GET, POST, PUT | `pages/admin/licitaciones/feriados.tsx:145`, `pages/admin/licitaciones/feriados.tsx:190`, `pages/admin/licitaciones/feriados.tsx:218`, `pages/admin/licitaciones/feriados.tsx:246` +1 |
| `/api/auth/my-roles` | GET | `pages/admin/licitaciones/feriados.tsx:101` |

## /admin/licitaciones/templates

File `pages/admin/licitaciones/templates.tsx` · 753 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Plantillas de Bases» → `/admin/licitaciones/templates` — admin only; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.605)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.237 `router.push → /login  (when !user)`
  - l.248 `router.push → /dashboard  (when !adminAccess)`
  - l.257 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:607`, `pages/admin/licitaciones/criterios.tsx:337`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1, encargado_licitacion 1.

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
| «BASES DE LICITACION» | h3 |  | TemplatePreview · l.80 |
| «{template.nombre_servicio}» | h4 |  | TemplatePreview · l.81 |
| «Plantillas de Bases» | h1 |  | LicitacionesTemplatesPage · l.436 |
| «{item.programa.nombre}» | h2 | `each filteredProgramas` | LicitacionesTemplatesPage · l.497 |

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Trash2]» · tooltip «Eliminar» · aria «{`Eliminar ${label} ${idx + 1}`}» | `{() => removeItem(idx)}` | `each value` |  |  | ArrayEditor · l.52 |
| «Agregar item» | `{addItem}` |  |  |  | ArrayEditor · l.63 |
| «{label}» | `{() => onChange(!checked)}` |  | `{disabled}` |  | ToggleSwitch · l.160 |
| «Volver a Licitaciones» | `{() => router.push('/licitaciones')}` |  |  |  | LicitacionesTemplatesPage · l.427 |
| «Limpiar filtro» | `{() => setFilterProgramaId('')}` | `filterProgramaId` |  |  | LicitacionesTemplatesPage · l.461 |
| «Cerrar editor / Editar plantilla» | `{() => { if (editingProgramaId === item.programa.id) { setEditingProgramaId(null…}` | `each filteredProgramas` |  |  | LicitacionesTemplatesPage · l.508 |
| «Historial de versiones ( {inactiveTemplates.length} )» | `{() => toggleHistory(item.programa.id)}` | `each filteredProgramas && inactiveTemplates.length > 0` |  |  | LicitacionesTemplatesPage · l.526 |
| «Activando... / Reactivar» · aria «{`Reactivar version ${t.version}`}» | `{() => handleToggleActive(t.id, true)}` | `each filteredProgramas && inactiveTemplates.length > 0 && historyExpanded && each inactiveTemplates` | `{togglingTemplateId === t.id}` |  | LicitacionesTemplatesPage · l.558 |
| «Ocultar vista previa / Ver vista previa del documento» | `{() => setShowPreview(!showPreview)}` | `each filteredProgramas && editingProgramaId === item.programa.id` |  |  | LicitacionesTemplatesPage · l.708 |
| «Guardando... / Guardar como nueva version» | `{handleSave}` | `each filteredProgramas && editingProgramaId === item.programa.id` | `{saving}` |  | LicitacionesTemplatesPage · l.725 |
| «Cancelar» | `{() => setEditingProgramaId(null)}` | `each filteredProgramas && editingProgramaId === item.programa.id` |  |  | LicitacionesTemplatesPage · l.728 |

**Fields** (9)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{`${label} ${idx + 1}`}» | text | «{`${label} ${idx + 1}`}» |  | `each value` | `id=array-{label.toLowerCase().replace…}-{idx}` | ArrayEditor · l.43 |
| «Filtrar por programa:» | select |  | «Todos los programas», «(lista) {item.programa.nombre}» |  | `id=filter-programa (id used by code)` | LicitacionesTemplatesPage · l.447 |
| «Nombre del Servicio *» | text | «Nombre del servicio» |  | `each filteredProgramas && editingProgramaId === item.programa.id` | `id=template-nombre-servicio (id used by code)` | LicitacionesTemplatesPage · l.586 |
| «Objetivo *» | textarea | «Descripcion del objetivo del servicio» |  | `each filteredProgramas && editingProgramaId === item.programa.id` | `id=template-objetivo (id used by code)` | LicitacionesTemplatesPage · l.601 |
| «Frecuencia de Sesiones» | textarea | «Descripcion de la frecuencia de sesiones» |  | `each filteredProgramas && editingProgramaId === item.programa.id` | `id=template-frecuencia (id used by code)` | LicitacionesTemplatesPage · l.621 |
| «Lugar de Realizacion» | textarea | «Lugar donde se realizaran las sesiones» |  | `each filteredProgramas && editingProgramaId === item.programa.id` | `id=template-lugar (id used by code)` | LicitacionesTemplatesPage · l.634 |
| «Contrapartes Tecnicas» | textarea | «Descripcion de las contrapartes tecnicas» |  | `each filteredProgramas && editingProgramaId === item.programa.id` | `id=template-contrapartes (id used by code)` | LicitacionesTemplatesPage · l.647 |
| «Condiciones de Pago» | textarea | «Condiciones de pago» |  | `each filteredProgramas && editingProgramaId === item.programa.id` | `id=template-condiciones-pago (id used by code)` | LicitacionesTemplatesPage · l.661 |
| «Condiciones de Pago (detallado)» | textarea | «Condiciones de pago detalladas» |  | `each filteredProgramas && editingProgramaId === item.programa.id` | `id=template-condiciones-pago-detallado (id used by code)` | LicitacionesTemplatesPage · l.696 |

**Table columns** (4)

| Text | Shown when | Where |
|---|---|---|
| «Version» | `each filteredProgramas && inactiveTemplates.length > 0 && historyExpanded` | LicitacionesTemplatesPage · l.543 |
| «Nombre del servicio» | `each filteredProgramas && inactiveTemplates.length > 0 && historyExpanded` | LicitacionesTemplatesPage · l.544 |
| «Fecha» | `each filteredProgramas && inactiveTemplates.length > 0 && historyExpanded` | LicitacionesTemplatesPage · l.545 |
| «Accion» | `each filteredProgramas && inactiveTemplates.length > 0 && historyExpanded` | LicitacionesTemplatesPage · l.546 |

**Toasts** (12)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Solo administradores pueden acceder a esta pagina» | `!adminAccess` | checkAuth · l.247 |
| error | «Error al cargar plantillas» | `!res.ok` | fetchTemplates · l.267 |
| error | «Error al cargar plantillas» |  | fetchTemplates · l.272 |
| error | «Error al actualizar estado» | `!res.ok` | handleToggleActive · l.289 |
| success | «Plantilla activada / Plantilla desactivada» |  | handleToggleActive · l.292 |
| error | «Error al actualizar estado de la plantilla» |  | handleToggleActive · l.296 |
| error | «El nombre del servicio es requerido» | `!editForm.nombre_servicio.trim()` | handleSave · l.354 |
| error | «El objetivo es requerido» | `!editForm.objetivo.trim()` | handleSave · l.358 |
| error | «Debe ingresar al menos un objetivo especifico» | `filteredForm.objetivos_especificos.length === 0` | handleSave · l.369 |
| error | «Error al guardar plantilla» | `!res.ok` | handleSave · l.383 |
| success | «Plantilla guardada como nueva version» |  | handleSave · l.387 |
| error | «Error al guardar plantilla» |  | handleSave · l.391 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.237 |
| `/dashboard` | `router.push` | `!adminAccess` | checkAuth · l.248 |
| `/login` | `router.push` |  | checkAuth · l.257 |
| `/licitaciones` | `router.push` |  | LicitacionesTemplatesPage · l.428 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Plantillas Licitaciones | `!authReady \|\| loading` |  | LicitacionesTemplatesPage · l.404 |
| `MainLayout` | pageTitle: Plantillas Licitaciones |  |  | LicitacionesTemplatesPage · l.419 |
| `ToggleSwitch` | label: Desactivar plantilla / Activar plantilla | `each filteredProgramas && activeTemplate` |  | LicitacionesTemplatesPage · l.485 |
| `Clock` | aria-hidden: true | `each filteredProgramas && inactiveTemplates.length > 0` |  | LicitacionesTemplatesPage · l.533 |
| `ArrayEditor` | label: Objetivos Especificos | `each filteredProgramas && editingProgramaId === item.programa.id` |  | LicitacionesTemplatesPage · l.611 |
| `ArrayEditor` | label: Resultados Esperados | `each filteredProgramas && editingProgramaId === item.programa.id` |  | LicitacionesTemplatesPage · l.674 |
| `ArrayEditor` | label: Requisitos ATE | `each filteredProgramas && editingProgramaId === item.programa.id` |  | LicitacionesTemplatesPage · l.680 |
| `ArrayEditor` | label: Documentos a Adjuntar | `each filteredProgramas && editingProgramaId === item.programa.id` |  | LicitacionesTemplatesPage · l.686 |

**Values shown from data** (8)

- `{label}` — ArrayEditor · l.39
- `{template.objetivo}` — TemplatePreview · l.85
- `{obj}` — TemplatePreview · l.93, when `template.objetivos_especificos.length > 0 && each template.objetivos_especificos.filter(Boolean)`
- `{r}` — TemplatePreview · l.116, when `template.resultados_esperados.length > 0 && each template.resultados_esperados.filter(Boolean)`
- `{r}` — TemplatePreview · l.127, when `template.requisitos_ate.length > 0 && each template.requisitos_ate.filter(Boolean)`
- `{d}` — TemplatePreview · l.138, when `template.documentos_adjuntar.length > 0 && each template.documentos_adjuntar.filter(Boolean)`
- `{t.nombre_servicio} / —` — LicitacionesTemplatesPage · l.553, when `each filteredProgramas && inactiveTemplates.length > 0 && historyExpanded && each inactiveTemplates`
- `{new Date(t.updated_at).toLocaleDate…} / —` — LicitacionesTemplatesPage · l.554, when `each filteredProgramas && inactiveTemplates.length > 0 && historyExpanded && each inactiveTemplates`

**Other texts on screen** (26)

- «Objetivo:» — TemplatePreview · l.84
- «Objetivos Especificos:» — TemplatePreview · l.90, when `template.objetivos_especificos.length > 0`
- «Especificaciones Administrativas:» — TemplatePreview · l.101, when `template.especificaciones_admin.frecuencia`
- «Frecuencia:» — TemplatePreview · l.103, when `template.especificaciones_admin.frecuencia`
- «Lugar:» — TemplatePreview · l.104, when `template.especificaciones_admin.frecuencia`
- «Contrapartes:» — TemplatePreview · l.105, when `template.especificaciones_admin.frecuencia`
- «Condiciones de pago:» — TemplatePreview · l.106, when `template.especificaciones_admin.frecuencia`
- «Resultados Esperados:» — TemplatePreview · l.113, when `template.resultados_esperados.length > 0`
- «Requisitos ATE:» — TemplatePreview · l.124, when `template.requisitos_ate.length > 0`
- «Documentos a Adjuntar:» — TemplatePreview · l.135, when `template.documentos_adjuntar.length > 0`
- «Gestione las plantillas de Bases para cada programa. Cada guardado crea una nueva version y archiva la anterior.» — LicitacionesTemplatesPage · l.438
- «Filtrar por programa:» (label) — LicitacionesTemplatesPage · l.444
- «Activa» — LicitacionesTemplatesPage · l.492, when `each filteredProgramas && activeTemplate`
- «Version {activeTemplate.version} activa [— {activeTemplate.nombre_servi…}]» — LicitacionesTemplatesPage · l.499, when `each filteredProgramas && activeTemplate`
- «Sin plantilla activa» — LicitacionesTemplatesPage · l.504, when `each filteredProgramas && !(activeTemplate)`
- «v {t.version}» — LicitacionesTemplatesPage · l.552, when `each filteredProgramas && inactiveTemplates.length > 0 && historyExpanded && each inactiveTemplates`
- «Nombre del Servicio *» (label) — LicitacionesTemplatesPage · l.583, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «Objetivo *» (label) — LicitacionesTemplatesPage · l.598, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «Especificaciones Administrativas» — LicitacionesTemplatesPage · l.618, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «Frecuencia de Sesiones» (label) — LicitacionesTemplatesPage · l.620, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «Lugar de Realizacion» (label) — LicitacionesTemplatesPage · l.633, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «Contrapartes Tecnicas» (label) — LicitacionesTemplatesPage · l.646, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «Condiciones de Pago» (label) — LicitacionesTemplatesPage · l.660, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «Condiciones de Pago (detallado)» (label) — LicitacionesTemplatesPage · l.693, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «Guardar crea una nueva version y desactiva la version anterior. La version anterior queda en el historial.» — LicitacionesTemplatesPage · l.733, when `each filteredProgramas && editingProgramaId === item.programa.id`
- «No se encontro el programa seleccionado. / No se encontraron programas activos.» — LicitacionesTemplatesPage · l.743, when `filteredProgramas.length === 0`

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/licitaciones.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/licitaciones/templates` | GET, PATCH, POST | `pages/admin/licitaciones/templates.tsx:264`, `pages/admin/licitaciones/templates.tsx:282`, `pages/admin/licitaciones/templates.tsx:375` |
| `/api/auth/my-roles` | GET | `pages/admin/licitaciones/templates.tsx:241` |

## /licitaciones/[id]

File `pages/licitaciones/[id].tsx` · 964 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.209 `router.push → /login  (when !user)`
  - l.221 `router.push → /dashboard  (when !adminAccess && !encargadoAccess)`
  - l.231 `router.push → /login`
- Linked from: `middleware.ts:345`, `pages/contracts.tsx:862`, `pages/contracts.tsx:863`, `pages/licitaciones/[id]/evaluacion.tsx:280`, `pages/licitaciones/[id]/evaluacion.tsx:624`, `pages/licitaciones/[id]/evaluacion.tsx:667`, `pages/licitaciones/importar.tsx:197`, `pages/licitaciones/index.tsx:427`, `pages/licitaciones/index.tsx:607`, `pages/licitaciones/index.tsx:611`, `pages/licitaciones/index.tsx:612`, `pages/licitaciones/index.tsx:614` and 1 more
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/flows/proposal-admin-visibility.spec.ts`, `tests/e2e/flows/proposal-buckets.spec.ts`, `tests/e2e/flows/proposal-config.spec.ts`, `tests/e2e/flows/proposal-versioning.spec.ts`; unit tests of the page: `__tests__/pages/licitaciones/licitacion-detail-step2.test.tsx`, `__tests__/pages/licitaciones/licitacion-detail-step6-carta.test.tsx`.

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

**Titles** (11)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{licitacion.nombre_licitacion}» | h1 |  | LicitacionDetailPage · l.509 |
| «1 Creacion de Licitacion [(Completado)]» | h2 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.555 |
| «Informacion General» | h3 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.564 |
| «Presupuesto y Plazos» | h3 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.571 |
| «Cliente» | h3 | `!(historicalView === 'pending') && !(historicalView === 'archive') && licitacion.cliente` | LicitacionDetailPage · l.581 |
| «2 Publicacion [(Completado)]» | h2 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.595 |
| «Bases [(Completado)] [(Disponible cuando la publicacion este confirmada)]» | h2 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.780 |
| «Propuestas [(Completado)] [(Disponible en Paso 3)]» | h2 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.811 |
| «Evaluacion [(Completado)] [(Disponible en Paso 4)]» | h2 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.842 |
| «Adjudicacion [(Completado)] [(Disponible en Paso 5)]» | h2 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.890 |
| «Contrato [(Completado)] [(Disponible en Paso 6)]» | h2 | `!(historicalView === 'pending') && !(historicalView === 'archive')` | LicitacionDetailPage · l.920 |

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Copiado! / Copiar texto» | `{handleCopyText}` |  | `{!publicacionText \|\| timelinePendingForChosenDate}` |  | LicitacionDetailPage · l.458 |
| «Volver a Licitaciones» | `{() => router.push('/licitaciones')}` |  |  |  | LicitacionDetailPage · l.497 |
| «Eliminando... / Eliminar» | `{() => { if (window.confirm( '¿Eliminar la licitacion "${licitacion.numero_licit…}` | `isAdmin` | `{deleting}` |  | LicitacionDetailPage · l.517 |
| «Cancelar ajuste / Ajustar fechas (admin)» | `{() => { // Start from the stored dates (after a reload nothing else is loaded).…}` | `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done && isAdmin` |  |  | LicitacionDetailPage · l.624 |
| «Guardando... / Guardar fechas ajustadas» | `{handleSaveDates}` | `!(historicalView === 'archive') && step2Done && isAdmin && editingTimeline` | `{savingDates}` |  | LicitacionDetailPage · l.658 |
| «Subiendo... / Subir» | `{handleUploadImage}` | `!(step2Done) && step2Active && canConfirmPublicacion && imageFile` | `{uploadingImage}` |  | LicitacionDetailPage · l.724 |
| «Confirmando... / Confirmar Publicacion» | `{() => { if (window.confirm('Esta acción no se puede deshacer. ¿Confirmar la pub…}` | `!(historicalView === 'archive') && !(step2Done) && step2Active && canConfirmPublicacion` | `{confirmingPublicacion \|\| !fechaPublicacion}` |  | LicitacionDetailPage · l.746 |
| «Ir a Evaluacion de Propuestas →» | `{() => router.push('/licitaciones/${id}/evaluacion')}` | `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep5Locked && isStep5Active` |  |  | LicitacionDetailPage · l.858 |
| «Ver resumen de evaluacion» | `{() => router.push('/licitaciones/${id}/evaluacion')}` | `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep5Locked && !(isStep5Active)` |  |  | LicitacionDetailPage · l.868 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{key.replace(/_/g, ' ')}» | date |  |  | `step2Done && isAdmin && editingTimeline && each (Object.keys(editedDates) as Array<keyof Timeline…` |  | LicitacionDetailPage · l.650 |
| «Fecha de publicacion *» | date |  |  | `!(historicalView === 'pending') && !(historicalView === 'archive') && !(step2Done) && step2Active` |  | LicitacionDetailPage · l.681 |
| «Imagen de publicacion (opcional)» | file | accepts `image/png,image/jpeg,image/jpg,image/webp` |  | `!(historicalView === 'archive') && !(step2Done) && step2Active && canConfirmPublicacion` |  | LicitacionDetailPage · l.717 |

**Browser confirm()** (2)

| Question | When | Where |
|---|---|---|
| «¿Eliminar la licitacion "{licitacion.numero_licitacion}"? / Se eliminaran permanentemente todos los datos asociados: ATEs, documentos, evaluaciones, historial, etc. / Esta accion no se puede deshacer.» | `isAdmin` | LicitacionDetailPage · l.519 |
| «Esta acción no se puede deshacer. ¿Confirmar la publicación?» | `!(historicalView === 'archive') && !(step2Done) && step2Active && canConfirmPublicacion` | LicitacionDetailPage · l.748 |

**Toasts** (17)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tiene permisos para acceder a licitaciones» | `!adminAccess && !encargadoAccess` | checkAuth · l.220 |
| error | «Error al cargar licitacion» | `!res.ok` | fetchLicitacion · l.250 |
| error | «Error al cargar licitacion» |  | fetchLicitacion · l.264 |
| error | «Error al calcular cronograma» | `latestFechaRef.current === fecha` | LicitacionDetailPage · l.298 |
| error | «Error al subir imagen» | `!res.ok` | handleUploadImage · l.321 |
| success | «Imagen subida exitosamente» |  | handleUploadImage · l.325 |
| error | «Error al subir imagen» |  | handleUploadImage · l.329 |
| error | «Ingrese la fecha de publicacion» | `!fechaPublicacion \|\| !id` | handleConfirmPublicacion · l.337 |
| error | «Error al confirmar publicacion» | `!res.ok` | handleConfirmPublicacion · l.357 |
| success | «Publicacion confirmada exitosamente» |  | handleConfirmPublicacion · l.361 |
| error | «Error al confirmar publicacion» |  | handleConfirmPublicacion · l.364 |
| error | «Error al guardar fechas» | `!res.ok` | handleSaveDates · l.383 |
| success | «Fechas actualizadas correctamente» |  | handleSaveDates · l.387 |
| error | «Error al guardar fechas» |  | handleSaveDates · l.391 |
| error | «Error al eliminar licitacion» | `!res.ok` | handleDeleteLicitacion · l.404 |
| success | «Licitacion eliminada exitosamente» |  | handleDeleteLicitacion · l.407 |
| error | «Error al eliminar licitacion» |  | handleDeleteLicitacion · l.410 |

**Moves to another page from code** (9)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.209 |
| `/dashboard` | `router.push` | `!adminAccess && !encargadoAccess` | checkAuth · l.221 |
| `/login` | `router.push` |  | checkAuth · l.231 |
| `/licitaciones` | `router.push` | `!res.ok` | fetchLicitacion · l.251 |
| `/licitaciones` | `router.push` |  | fetchLicitacion · l.265 |
| `/licitaciones` | `router.push` |  | handleDeleteLicitacion · l.408 |
| `/licitaciones` | `router.push` |  | LicitacionDetailPage · l.498 |
| `/licitaciones/[*]/evaluacion` | `router.push` | `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep5Locked && isStep5Active` | LicitacionDetailPage · l.859 |
| `/licitaciones/[*]/evaluacion` | `router.push` | `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep5Locked && !(isStep5Active)` | LicitacionDetailPage · l.869 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!authReady` | LicitacionDetailPage · l.162 |
| `!licitacion` | LicitacionDetailPage · l.172 |
| `licitacion.estado !== 'cerrada'` | LicitacionDetailPage · l.173 |
| `latestFechaRef.current !== fecha` | LicitacionDetailPage · l.293 |

**Pieces placed here, with the texts and settings handed to them** (35)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Licitacion | `loading \|\| !licitacion` |  | LicitacionDetailPage · l.428 |
| `Check` | aria-hidden: true | `copied` |  | LicitacionDetailPage · l.463 |
| `Copy` | aria-hidden: true | `!(copied)` |  | LicitacionDetailPage · l.463 |
| `MainLayout` |  |  |  | LicitacionDetailPage · l.488 |
| `ArchiveView` |  | `!(historicalView === 'pending') && historicalView === 'archive'` |  | LicitacionDetailPage · l.542 |
| `InfoRow` | label: Numero | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.565 |
| `InfoRow` | label: Programa | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.566 |
| `InfoRow` | label: Ano | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.567 |
| `InfoRow` | label: Correo licitacion | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.568 |
| `InfoRow` | label: Monto minimo | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.572 |
| `InfoRow` | label: Monto maximo | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.573 |
| `InfoRow` | label: Duracion minima | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.574 |
| `InfoRow` | label: Duracion maxima | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.575 |
| `InfoRow` | label: Peso tecnico | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.576 |
| `InfoRow` | label: Peso economico | `!(historicalView === 'pending') && !(historicalView === 'archive')` |  | LicitacionDetailPage · l.577 |
| `InfoRow` | label: Nombre legal | `!(historicalView === 'pending') && !(historicalView === 'archive') && licitacion.cliente` |  | LicitacionDetailPage · l.582 |
| `InfoRow` | label: RUT | `!(historicalView === 'pending') && !(historicalView === 'archive') && licitacion.cliente` |  | LicitacionDetailPage · l.583 |
| `InfoRow` | label: Representante | `!(historicalView === 'pending') && !(historicalView === 'archive') && licitacion.cliente` |  | LicitacionDetailPage · l.584 |
| `InfoRow` | label: Comuna | `!(historicalView === 'pending') && !(historicalView === 'archive') && licitacion.cliente` |  | LicitacionDetailPage · l.585 |
| `InfoRow` | label: Limite solicitud de bases | `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done` |  | LicitacionDetailPage · l.615 |
| `InfoRow` | label: Limite consultas | `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done` |  | LicitacionDetailPage · l.616 |
| `InfoRow` | label: Inicio propuestas | `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done` |  | LicitacionDetailPage · l.617 |
| `InfoRow` | label: Limite propuestas | `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done` |  | LicitacionDetailPage · l.618 |
| `InfoRow` | label: Limite evaluacion | `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done` |  | LicitacionDetailPage · l.619 |
| `InfoRow` | label: Limite solicitud de bases (+5 dias habiles) | `!(historicalView === 'archive') && !(step2Done) && step2Active && displayTimeline.fecha_limite_solicitud_bases` |  | LicitacionDetailPage · l.701 |
| `InfoRow` | label: Limite consultas (+3 dias habiles) | `!(historicalView === 'archive') && !(step2Done) && step2Active && displayTimeline.fecha_limite_solicitud_bases` |  | LicitacionDetailPage · l.702 |
| `InfoRow` | label: Inicio recepcion propuestas (+1 dia habil) | `!(historicalView === 'archive') && !(step2Done) && step2Active && displayTimeline.fecha_limite_solicitud_bases` |  | LicitacionDetailPage · l.703 |
| `InfoRow` | label: Limite propuestas (+5 dias habiles) | `!(historicalView === 'archive') && !(step2Done) && step2Active && displayTimeline.fecha_limite_solicitud_bases` |  | LicitacionDetailPage · l.704 |
| `InfoRow` | label: Limite evaluacion (+3 dias habiles) | `!(historicalView === 'archive') && !(step2Done) && step2Active && displayTimeline.fecha_limite_solicitud_bases` |  | LicitacionDetailPage · l.705 |
| `Step3Bases` |  | `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep3Locked` |  | LicitacionDetailPage · l.791 |
| `Step4Propuestas` |  | `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep4Locked` |  | LicitacionDetailPage · l.822 |
| `Step6Adjudicacion` |  | `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep6Locked` |  | LicitacionDetailPage · l.901 |
| `Step7Contrato` |  | `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep7Locked` |  | LicitacionDetailPage · l.931 |
| `ProposalConfigPanel` |  | `!(historicalView === 'pending') && !(historicalView === 'archive') && isAdmin` |  | LicitacionDetailPage · l.944 |
| `DocumentCenter` |  | `!(historicalView === 'pending') && !(historicalView === 'archive') && activeStep >= 2` |  | LicitacionDetailPage · l.952 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `STEPS` | «Creacion», «Publicacion», «Bases», «Propuestas», «Evaluacion», «Adjudicacion», «Contrato» | l.21 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Imagen publicacion - {licitacion?.numero_licitaci…}» | LicitacionDetailPage · l.312 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2000)` | handleCopyText · l.274 |
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (7)

- `{step.label}` — Stepper · l.72, when `each STEPS`
- `{label}` — InfoRow · l.89
- `{value} / -` — InfoRow · l.90
- `{info.label}` — EstadoBadge · l.98
- `{licitacion.numero_licitacion}` — LicitacionDetailPage · l.508
- `{licitacion.school?.name} — {licitacion.year}` — LicitacionDetailPage · l.510
- `{formatDate(licitacion.fecha_publica…}` — LicitacionDetailPage · l.610, when `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done`

**Other texts on screen** (15)

- «Texto de publicacion» — LicitacionDetailPage · l.454
- «{publicacionText} / Seleccione una escuela con cliente vinculado para generar el texto.» — LicitacionDetailPage · l.455
- «Cargando» (aria-label) — LicitacionDetailPage · l.539, when `historicalView === 'pending'`
- «Fecha de publicacion» — LicitacionDetailPage · l.609, when `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done`
- «Cronograma calculado» — LicitacionDetailPage · l.613, when `!(historicalView === 'pending') && !(historicalView === 'archive') && step2Done`
- «{key.replace(/_/g, ' ')}» (label) — LicitacionDetailPage · l.647, when `step2Done && isAdmin && editingTimeline && each (Object.keys(editedDates) as Array<keyof Timeline…`
- «Fecha de publicacion *» (label) — LicitacionDetailPage · l.677, when `!(historicalView === 'pending') && !(historicalView === 'archive') && !(step2Done) && step2Active`
- «Calculando cronograma...» — LicitacionDetailPage · l.688, when `!(historicalView === 'archive') && !(step2Done) && step2Active && timelineLoading`
- «Cronograma calculado (dias habiles, sin feriados chilenos)» — LicitacionDetailPage · l.698, when `!(historicalView === 'archive') && !(step2Done) && step2Active && displayTimeline.fecha_limite_solicitud_bases`
- «Imagen de publicacion (opcional)» (label) — LicitacionDetailPage · l.713, when `!(historicalView === 'archive') && !(step2Done) && step2Active && canConfirmPublicacion`
- «Imagen subida» — LicitacionDetailPage · l.736, when `!(step2Done) && step2Active && canConfirmPublicacion && uploadedImageUrl`
- «Al confirmar, el estado cambiara a &ldquo;Recepcion de Bases&rdquo; y el cronograma quedara registrado.» — LicitacionDetailPage · l.758, when `!(historicalView === 'archive') && !(step2Done) && step2Active && canConfirmPublicacion`
- «Este paso estara disponible cuando la licitacion avance al estado &ldquo;Publicacion Pendiente&rdquo;.» — LicitacionDetailPage · l.766, when `!(historicalView === 'pending') && !(historicalView === 'archive') && !(step2Done) && !(step2Active)`
- «Complete la evaluacion de propuestas de cada ATE usando la pagina de evaluacion.» — LicitacionDetailPage · l.856, when `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep5Locked && isStep5Active`
- «La evaluacion fue completada. El Acta de Reunion fue firmada y subida.» — LicitacionDetailPage · l.867, when `!(historicalView === 'pending') && !(historicalView === 'archive') && !isStep5Locked && !(isStep5Active)`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/licitaciones/ArchiveView.tsx`
- `components/licitaciones/BucketConfigSection.tsx`
- `components/licitaciones/DocumentCenter.tsx`
- `components/licitaciones/DocumentPreview.tsx`
- `components/licitaciones/ProposalConfigPanel.tsx`
- `components/licitaciones/ProposalPreview.tsx`
- `components/licitaciones/Step3Bases.tsx`
- `components/licitaciones/Step4Propuestas.tsx`
- `components/licitaciones/Step6Adjudicacion.tsx`
- `components/licitaciones/Step7Contrato.tsx`
- `lib/licitaciones/documentPreview.ts`
- `lib/licitaciones/publicacionText.ts`
- `lib/propuestas-web/constants.ts`
- `lib/propuestas-web/pdf-generator.ts`
- `lib/propuestas/types/hours.ts`
- `lib/propuestas/validation.ts`
- `types/licitaciones.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/my-roles` | GET | `pages/licitaciones/[id].tsx:213` |
| `/api/licitaciones/[id]` | DELETE, GET, PATCH | `pages/licitaciones/[id].tsx:245`, `pages/licitaciones/[id].tsx:375`, `pages/licitaciones/[id].tsx:401` |
| `/api/licitaciones/[id]/adjudicacion` | POST | `components/licitaciones/Step6Adjudicacion.tsx:129` |
| `/api/licitaciones/[id]/adjudicacion-confirmar` | POST | `components/licitaciones/Step6Adjudicacion.tsx:240` |
| `/api/licitaciones/[id]/advance` | POST | `components/licitaciones/Step3Bases.tsx:327`, `components/licitaciones/Step4Propuestas.tsx:239` |
| `/api/licitaciones/[id]/ates` | DELETE, GET, PATCH, POST, PUT | `components/licitaciones/Step3Bases.tsx:153`, `components/licitaciones/Step3Bases.tsx:180`, `components/licitaciones/Step3Bases.tsx:208`, `components/licitaciones/Step3Bases.tsx:88` +4 |
| `/api/licitaciones/[id]/close` | POST | `components/licitaciones/Step7Contrato.tsx:128` |
| `/api/licitaciones/[id]/consultas` | GET, POST | `components/licitaciones/Step3Bases.tsx:286`, `components/licitaciones/Step3Bases.tsx:89` |
| `/api/licitaciones/[id]/documentos` | DELETE, GET | `components/licitaciones/ArchiveView.tsx:61`, `components/licitaciones/DocumentCenter.tsx:115`, `components/licitaciones/DocumentCenter.tsx:215`, `components/licitaciones/Step3Bases.tsx:360` +1 |
| `/api/licitaciones/[id]/download-doc` | GET | `components/licitaciones/ArchiveView.tsx:82`, `components/licitaciones/DocumentCenter.tsx:143`, `components/licitaciones/DocumentPreview.tsx:40` |
| `/api/licitaciones/[id]/download-zip` | POST | `components/licitaciones/DocumentCenter.tsx:179` |
| `/api/licitaciones/[id]/evaluacion` | GET | `pages/licitaciones/[id].tsx:178` |
| `/api/licitaciones/[id]/generate-bases` | GET | `components/licitaciones/Step3Bases.tsx:248` |
| `/api/licitaciones/[id]/generate-carta` | GET | `components/licitaciones/Step6Adjudicacion.tsx:171`, `components/licitaciones/Step7Contrato.tsx:103` |
| `/api/licitaciones/[id]/generate-propuesta` | POST | `components/licitaciones/ProposalConfigPanel.tsx:682` |
| `/api/licitaciones/[id]/propuestas` | GET | `components/licitaciones/ProposalConfigPanel.tsx:248`, `components/licitaciones/ProposalConfigPanel.tsx:711` |
| `/api/licitaciones/[id]/publicacion` | POST | `pages/licitaciones/[id].tsx:348` |
| `/api/licitaciones/[id]/timeline` | GET | `pages/licitaciones/[id].tsx:289` |
| `/api/licitaciones/[id]/upload` | POST | `components/licitaciones/ArchiveView.tsx:111`, `components/licitaciones/Step6Adjudicacion.tsx:206`, `components/licitaciones/Step7Contrato.tsx:68`, `pages/licitaciones/[id].tsx:314` |
| `/api/licitaciones/check-deadlines` | POST | `pages/licitaciones/[id].tsx:163` |
| `/api/propuestas/bloques` | GET | `components/licitaciones/ProposalConfigPanel.tsx:247` |
| `/api/propuestas/consultores` | GET | `components/licitaciones/ProposalConfigPanel.tsx:245` |
| `/api/propuestas/documentos` | GET | `components/licitaciones/ProposalConfigPanel.tsx:246` |
| `/api/propuestas/fichas` | GET | `components/licitaciones/ProposalConfigPanel.tsx:244` |
| `/api/propuestas/plantillas` | GET | `components/licitaciones/ProposalConfigPanel.tsx:243` |

## /licitaciones/[id]/evaluacion

File `pages/licitaciones/[id]/evaluacion.tsx` · 1117 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.236 `router.push → /login  (when !user)`
  - l.253 `router.push → /dashboard  (when !adminAccess && !encargadoAccess)`
  - l.262 `router.push → /login`
- Linked from: `pages/licitaciones/[id].tsx:859`, `pages/licitaciones/[id].tsx:869`
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

### What the page file itself draws

**Titles** (9)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Evaluacion de Propuestas» | h1 |  | EvaluacionPage · l.678 |
| «Comision Evaluadora» | h2 |  | EvaluacionPage · l.701 |
| «Datos de la Reunion» | h2 |  | EvaluacionPage · l.777 |
| «Puntajes por ATE» | h2 | `!(ates.length === 0)` | EvaluacionPage · l.829 |
| «A. Evaluacion Tecnica» | h3 | `!(ates.length === 0) && each ates` · hidden by its class (`hidden`); another control opens it or it is for screen readers | EvaluacionPage · l.863 |
| «B. Evaluacion Economica» | h3 | `!(ates.length === 0) && each ates` · hidden by its class (`hidden`); another control opens it or it is for screen readers | EvaluacionPage · l.964 |
| «Acciones» | h2 | `isEditable` | EvaluacionPage · l.1012 |
| «Subir Acta Firmada» | h3 | `isEditable` | EvaluacionPage · l.1055 |
| «Ranking en Tiempo Real» | h2 |  | EvaluacionPage · l.1102 |

**Tabs** (1)

| Text | Does | Shown when | Where |
|---|---|---|---|
| «{ate.nombre_ate}» | `{() => setActiveAteId(ate.id)}` | `!(ates.length === 0) && each ates` | EvaluacionPage · l.835 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Licitacion» | `{() => router.push('/licitaciones/${id}')}` |  |  |  | EvaluacionPage · l.666 |
| «Guardando... / Guardar Evaluacion» | `{handleSave}` | `isEditable` | `{saving}` |  | EvaluacionPage · l.1015 |
| «Generando... / Generar Acta de Reunion» · tooltip «{!canGenerateActa() ? 'Complete la comision y los puntajes de al menos 1 ATE par…}» | `{handleGenerateActa}` | `isEditable` | `{generatingActa \|\| !canGenerateActa()}` |  | EvaluacionPage · l.1027 |
| «Procesando... / Subir Acta Firmada» | `{() => fileInputRef.current?.click()}` | `isEditable && !(actaSigned)` | `{uploadingActa \|\| advancing}` |  | EvaluacionPage · l.1080 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Acta generada — descargar» | `{actaUrl}` (new tab) | `isEditable && actaUrl` |  | EvaluacionPage · l.1047 |

**Fields** (10)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre *» | text | «Nombre completo» · disabled: `{!isEditable}` |  | `each committee` | `id=cm-nombre-{idx}` | EvaluacionPage · l.713 |
| «RUT» | text | «12.345.678-9» · disabled: `{!isEditable}` |  | `each committee` | `id=cm-rut-{idx}` | EvaluacionPage · l.734 |
| «Cargo» | text | «Director / Jefe UTP» · disabled: `{!isEditable}` |  | `each committee` | `id=cm-cargo-{idx}` | EvaluacionPage · l.755 |
| «Fecha de evaluacion» | date | disabled: `{!isEditable}` |  |  | `id=fecha-evaluacion (id used by code)` | EvaluacionPage · l.783 |
| «Hora inicio (HH:MM)» | time | disabled: `{!isEditable}` |  |  | `id=hora-inicio (id used by code)` | EvaluacionPage · l.796 |
| «Hora fin (HH:MM)» | time | disabled: `{!isEditable}` |  |  | `id=hora-fin (id used by code)` | EvaluacionPage · l.809 |
| «{criterio.nombre_criterio} — Puntaje (maximo: {criterio.puntaje_maximo} )» | number | «0» · disabled: `{!isEditable}` · `min={0} max={criterio.puntaje_maximo} step={1}` |  | `!(ates.length === 0) && each ates && each criterios` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=score-{ate.id}-{criterio.id}` | EvaluacionPage · l.893 |
| «Comentario para {criterio.nombre_criterio} (opcional)» | textarea | «Comentario (opcional)» · disabled: `{!isEditable}` |  | `!(ates.length === 0) && each ates && each criterios` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=comment-{ate.id}-{criterio.id}` | EvaluacionPage · l.928 |
| «Monto propuesto (CLP)» | number | «15000000» · disabled: `{!isEditable}` · `min={1} step={1000}` |  | `!(ates.length === 0) && each ates` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=monto-{ate.id}` | EvaluacionPage · l.976 |
|  | file | accepts `.pdf,.png,.jpg,.jpeg` |  | `isEditable && !(actaSigned)` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=acta-upload` | EvaluacionPage · l.1069 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «ATE» |  | RankingPanel · l.128 |
| «Tec.» |  | RankingPanel · l.129 |
| «Eco.» |  | RankingPanel · l.130 |
| «T.Pond.» |  | RankingPanel · l.131 |
| «E.Pond.» |  | RankingPanel · l.132 |
| «Total» |  | RankingPanel · l.133 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «ATENCION: Esta accion es irreversible. Al confirmar: - El Acta firmada quedara registrada - El proceso avanzara a "Adjudicacion Pendiente" - No sera posible volver a la etapa de Evaluacion ¿Confirmar?» |  | handleUploadActa · l.580 |

**Toasts** (15)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tiene permisos para acceder a evaluaciones» | `!adminAccess && !encargadoAccess` | checkAuth · l.252 |
| error | «Error al cargar licitacion» | `!licRes.ok` | EvaluacionPage · l.279 |
| error | «Error al cargar datos de evaluacion» |  | EvaluacionPage · l.352 |
| error | «Error al guardar evaluacion» | `!res.ok` | handleSave · l.522 |
| success | «Evaluacion guardada exitosamente» |  | handleSave · l.526 |
| error | «Error al guardar evaluacion» |  | handleSave · l.528 |
| error | «Corrija los errores en la Comision Evaluadora antes de generar el Acta» | `!validateCommittee()` | handleGenerateActa · l.542 |
| error | «Error al generar el Acta» | `!res.ok` | handleGenerateActa · l.555 |
| success | «Acta de Reunion generada exitosamente» |  | handleGenerateActa · l.560 |
| error | «Error al generar el Acta» |  | handleGenerateActa · l.566 |
| error | «Error al subir el Acta» | `!uploadRes.ok` | handleUploadActa · l.602 |
| success | «Acta firmada subida. Avanzando estado...» |  | handleUploadActa · l.607 |
| error | «Error al avanzar estado» | `!advanceRes.ok` | handleUploadActa · l.619 |
| success | «Estado avanzado a Adjudicacion Pendiente» |  | handleUploadActa · l.623 |
| error | «Error al procesar el Acta firmada» |  | handleUploadActa · l.626 |

**Moves to another page from code** (7)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.236 |
| `/dashboard` | `router.push` | `!adminAccess && !encargadoAccess` | checkAuth · l.253 |
| `/login` | `router.push` |  | checkAuth · l.262 |
| `/licitaciones/[*]` | `router.push` | `!licRes.ok` | EvaluacionPage · l.280 |
| `{json.data.url}` | `window.open` | `json.data.url` | handleGenerateActa · l.563 |
| `/licitaciones/[*]` | `router.push` |  | handleUploadActa · l.624 |
| `/licitaciones/[*]` | `router.push` |  | EvaluacionPage · l.667 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!ate` | EvaluacionPage · l.385 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Evaluacion | `loading \|\| !licitacion` |  | EvaluacionPage · l.639 |
| `MainLayout` | pageTitle: Evaluacion de Propuestas |  |  | EvaluacionPage · l.657 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Nombre requerido» | EvaluacionPage · l.437 |
| «Acta firmada — {licitacion?.numero_licitaci…}» | EvaluacionPage · l.593 |
| «Complete la comision y los puntajes de al menos 1 ATE para generar el Acta» | EvaluacionPage · l.1033 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| role | `role=tablist` | EvaluacionPage · l.833 |
| role | `role=tabpanel` | EvaluacionPage · l.855 |
| mark | `id=panel-{ate.id}` | EvaluacionPage · l.855 |
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (13)

- `{info.label}` — EstadoBadge · l.88
- `{row.nombre_ate}` — RankingPanel · l.146, when `each rows`
- `{row.puntaje_tecnico}` — RankingPanel · l.148, when `each rows`
- `{row.puntaje_economico}` — RankingPanel · l.149, when `each rows`
- `{row.puntaje_tecnico_ponderado}` — RankingPanel · l.150, when `each rows`
- `{row.puntaje_economico_ponderado}` — RankingPanel · l.151, when `each rows`
- `{row.puntaje_total}` — RankingPanel · l.152, when `each rows`
- `{licitacion.numero_licitacion}` — EvaluacionPage · l.677
- `{licitacion.nombre_licitacion}` — EvaluacionPage · l.679
- `{committeeErrors[idx].nombre}` — EvaluacionPage · l.727, when `each committee && committeeErrors[idx]?.nombre`
- `{committeeErrors[idx].rut}` — EvaluacionPage · l.748, when `each committee && committeeErrors[idx]?.rut`
- `{criterio.nombre_criterio}` — EvaluacionPage · l.882, when `!(ates.length === 0) && each ates && each criterios`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- `{(() => { const row = liveRanking.fi…}` — EvaluacionPage · l.995, when `!(ates.length === 0) && each ates`, hidden by its class (`hidden`); another control opens it or it is for screen readers

**Other texts on screen** (21)

- «Ingrese puntajes y montos para ver el ranking» — RankingPanel · l.112, when `rows.length === 0`
- «Ponderacion: Tecnica {pesoTecnico} % / Economica {pesoEconomico} %» — RankingPanel · l.120
- «La evaluacion esta completa. Esta vista es de solo lectura. / Este paso no esta disponible en el estado actual.» — EvaluacionPage · l.688, when `!isEditable`
- «Miembro {idx + 1}» — EvaluacionPage · l.705, when `each committee`
- «Nombre *» (label) — EvaluacionPage · l.710, when `each committee`
- «RUT» (label) — EvaluacionPage · l.731, when `each committee`
- «Cargo» (label) — EvaluacionPage · l.752, when `each committee`
- «Fecha de evaluacion» (label) — EvaluacionPage · l.780
- «Hora inicio (HH:MM)» (label) — EvaluacionPage · l.793
- «Hora fin (HH:MM)» (label) — EvaluacionPage · l.806
- «No hay ATEs con propuestas registradas para evaluar.» — EvaluacionPage · l.824, when `ates.length === 0`
- «Empresas ATE para evaluar» (aria-label) — EvaluacionPage · l.833, when `!(ates.length === 0)`
- «Maximo: {criterio.puntaje_maximo} pts» — EvaluacionPage · l.885, when `!(ates.length === 0) && each ates && each criterios`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «{criterio.nombre_criterio} — Puntaje (maximo: {criterio.puntaje_maximo} )» (label) — EvaluacionPage · l.890, when `!(ates.length === 0) && each ates && each criterios`, hidden by its class (`hidden sr-only`); another control opens it or it is for screen readers
- «Max: {criterio.puntaje_maximo}» — EvaluacionPage · l.919, when `!(ates.length === 0) && each ates && each criterios && isOver`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «Comentario para {criterio.nombre_criterio} (opcional)» (label) — EvaluacionPage · l.925, when `!(ates.length === 0) && each ates && each criterios`, hidden by its class (`hidden sr-only`); another control opens it or it is for screen readers
- «Puntaje Tecnico: {criterios.reduce((sum, c) => { cons…} / 100» — EvaluacionPage · l.953, when `!(ates.length === 0) && each ates`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «Monto propuesto (CLP)» (label) — EvaluacionPage · l.970, when `!(ates.length === 0) && each ates`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «Puntaje Economico» — EvaluacionPage · l.994, when `!(ates.length === 0) && each ates`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «Suba el Acta firmada por los miembros de la comision (PDF o imagen). Esta accion avanzara el estado a &ldquo;Adjudicacion Pendiente&rdquo;.» — EvaluacionPage · l.1059, when `isEditable`
- «Acta firmada subida correctamente» — EvaluacionPage · l.1065, when `isEditable && actaSigned`

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/evaluacionService.ts`
- `types/licitaciones.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/my-roles` | GET | `pages/licitaciones/[id]/evaluacion.tsx:240` |
| `/api/licitaciones/[id]` | GET | `pages/licitaciones/[id]/evaluacion.tsx:275` |
| `/api/licitaciones/[id]/advance` | POST | `pages/licitaciones/[id]/evaluacion.tsx:611` |
| `/api/licitaciones/[id]/evaluacion` | GET, POST | `pages/licitaciones/[id]/evaluacion.tsx:288`, `pages/licitaciones/[id]/evaluacion.tsx:514` |
| `/api/licitaciones/[id]/generate-acta` | GET | `pages/licitaciones/[id]/evaluacion.tsx:551` |
| `/api/licitaciones/[id]/upload` | POST | `pages/licitaciones/[id]/evaluacion.tsx:595` |

## /licitaciones/importar

File `pages/licitaciones/importar.tsx` · 360 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.88 `router.push → /login  (when !user)`
  - l.134 `router.push → /login`
- Linked from: `pages/licitaciones/index.tsx:397`
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

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Importar Licitacion Historica» | h1 |  | ImportarLicitacionPage · l.246 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Licitaciones» | `{() => router.push('/licitaciones')}` |  |  |  | ImportarLicitacionPage · l.238 |
| «Cancelar» | `{() => router.push('/licitaciones')}` |  |  |  | ImportarLicitacionPage · l.340 |
| «Registrando... / Registrar Licitacion Historica» (submits the form) |  |  | `{submitting}` |  | ImportarLicitacionPage · l.347 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select | disabled: `{!isAdmin && schools.length === 1}` | «Seleccione una escuela...», «(lista) {s.name}» |  | `id=field-school_id` | ImportarLicitacionPage · l.258 |
|  | select |  | «(lista) {y}» |  | `id=field-year` | ImportarLicitacionPage · l.275 |
|  | select |  | «Seleccione un programa...», «(lista) {p.nombre}» |  | `id=field-programa_id` | ImportarLicitacionPage · l.289 |
| «Ej: Asesoria integral 2023» | text | «Ej: Asesoria integral 2023» · `maxLength={500}` |  |  | `id=field-nombre_licitacion` | ImportarLicitacionPage · l.303 |
| «Se genera automaticamente si se deja en blanco» | text | «Se genera automaticamente si se deja en blanco» · `maxLength={100}` |  |  | `id=field-numero_licitacion` | ImportarLicitacionPage · l.315 |
| «Contexto adicional sobre esta licitacion historica...» | textarea | «Contexto adicional sobre esta licitacion historica...» · `maxLength={2000}` |  |  | `id=field-notas` | ImportarLicitacionPage · l.327 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | ImportarLicitacionPage · l.254 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tiene permisos para importar licitaciones» | `!adminAccess && !encargadoAccess` | checkAuth · l.102 |
| error | «Error al registrar licitacion historica» | `!res.ok` | handleSubmit · l.192 |
| success | «Licitacion historica registrada» |  | handleSubmit · l.196 |
| error | «Error inesperado al registrar licitacion historica» |  | handleSubmit · l.199 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.88 |
| `/licitaciones` | `router.push` | `!adminAccess && !encargadoAccess` | checkAuth · l.103 |
| `/login` | `router.push` |  | checkAuth · l.134 |
| `/licitaciones/[*]` | `router.push` |  | handleSubmit · l.197 |
| `/licitaciones` | `router.push` |  | ImportarLicitacionPage · l.239 |
| `/licitaciones` | `router.push` |  | ImportarLicitacionPage · l.342 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Importar Licitacion Historica | `authLoading` |  | ImportarLicitacionPage · l.209 |
| `MainLayout` | pageTitle: Importar Licitacion Historica |  |  | ImportarLicitacionPage · l.230 |
| `Field` | label: Escuela |  |  | ImportarLicitacionPage · l.257 |
| `Field` | label: Ano |  |  | ImportarLicitacionPage · l.274 |
| `Field` | label: Programa FNE |  |  | ImportarLicitacionPage · l.288 |
| `Field` | label: Nombre de la Licitacion |  |  | ImportarLicitacionPage · l.302 |
| `Field` | label: Numero de Licitacion (opcional) |  |  | ImportarLicitacionPage · l.314 |
| `Field` | label: Notas (opcional) |  |  | ImportarLicitacionPage · l.326 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Seleccione un ano» | ImportarLicitacionPage · l.158 |

**Values shown from data** (1)

- `{errors[name]}` — Field · l.46, when `errors[name]`

**Other texts on screen** (2)

- «{label} [*]» (label) — Field · l.41
- «Registre una licitacion pasada para mantenerla en el historial. Se guarda directamente como &quot;cerrada&quot;.» — ImportarLicitacionPage · l.251

**Reads and writes the database directly:** `table:programas` (select), `table:schools` (select)

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/my-roles` | GET | `pages/licitaciones/importar.tsx:92` |
| `/api/licitaciones` | POST | `pages/licitaciones/importar.tsx:183` |

## /licitaciones

File `pages/licitaciones/index.tsx` · 689 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Procesos» → `/licitaciones` — roles: admin, encargado_licitacion; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.597)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.176 `router.push → /login  (when !user)`
  - l.185 `router.push → /dashboard  (when !response.ok)`
  - l.198 `router.push → /dashboard  (when !adminAccess && !encargadoAccess)`
  - l.222 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:599`, `lib/auth/forced-password-change.ts:150`, `lib/notificationEvents.ts:627`, `lib/notificationEvents.ts:639`, `lib/notificationEvents.ts:651`, `lib/notificationEvents.ts:663`, `lib/notificationEvents.ts:675`, `lib/notificationEvents.ts:687`, `lib/notificationEvents.ts:699`, `lib/notificationEvents.ts:711`, `lib/notificationEvents.ts:723`, `lib/notificationEvents.ts:735` and 21 more
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 4, community_manager 2, consultor 3, equipo_directivo 2, docente 1, lider_comunidad 1.

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
| encargado_licitacion | yes | pass |

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Licitaciones / Mis Licitaciones» | h1 |  | LicitacionesPage · l.370 |
| «Acciones Requeridas ( {actionableLicitaciones.length} )» | h3 | `isEncargado && !isAdmin && actionableLicitaciones.length > 0` | LicitacionesPage · l.419 |
| «Próximos Vencimientos (próximos 3 días hábiles)» | h3 | `upcomingDeadlines.length > 0` | LicitacionesPage · l.443 |
| «No hay licitaciones» | h3 | `!(loading) && licitaciones.length === 0` | LicitacionesPage · l.559 |

**Buttons** (6)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Exportando... / Exportar a Excel» | `{handleExportExcel}` | `isAdmin` | `{exporting}` |  | LicitacionesPage · l.386 |
| «Importar histórica» | `{() => router.push('/licitaciones/importar')}` | `(isAdmin \|\| isEncargado)` |  |  | LicitacionesPage · l.396 |
| «Nueva Licitación» | `{() => router.push('/licitaciones/nueva')}` | `isAdmin` |  |  | LicitacionesPage · l.405 |
| «{lic.numero_licitacion} — {NEXT_ACTION[lic.estado]}» | `{() => router.push('/licitaciones/${lic.id}')}` | `isEncargado && !isAdmin && actionableLicitaciones.length > 0 && each actionableLicitaciones.slice(0, 5)` |  |  | LicitacionesPage · l.426 |
| «[icon ChevronLeft]» · aria «Página anterior» | `{() => setPage(p => Math.max(1, p - 1))}` | `!(loading) && !(licitaciones.length === 0) && totalPages > 1` | `{page === 1}` |  | LicitacionesPage · l.661 |
| «[icon ChevronRight]» · aria «Página siguiente» | `{() => setPage(p => Math.min(totalPages, p + 1))}` | `!(loading) && !(licitaciones.length === 0) && totalPages > 1` | `{page === totalPages}` |  | LicitacionesPage · l.672 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{lic.numero_licitacion}» | `/licitaciones/[*]` | `!(loading) && !(licitaciones.length === 0) && each licitaciones` |  | LicitacionesPage · l.611 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `tr` | «{lic.numero_licitacion} [{lic.schools?.name} / -] {lic.nombre_licitacion} {nextAction} / — {lic.year} {formatDate(lic.f…» | `{() => router.push('/licitaciones/${lic.id}')}` | `!(loading) && !(licitaciones.length === 0) && each licitaciones` | LicitacionesPage · l.605 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Mostrar históricas (licitaciones cerradas)» | checkbox |  |  |  |  | LicitacionesPage · l.473 |
| «Estado» | select |  | «Todos los estados», «(lista) {ESTADO_DISPLAY[e].label}» |  | `id=filter-estado (id used by code)` | LicitacionesPage · l.488 |
| «Año» | select |  | «Todos los años», «(lista) {y}» |  | `id=filter-year (id used by code)` | LicitacionesPage · l.502 |
| «Escuela» | select |  | «Todas las escuelas», «(lista) {s.name}» | `isAdmin && schools.length > 0` | `id=filter-school (id used by code)` | LicitacionesPage · l.518 |
| «Programa» | select |  | «Todos los programas», «(lista) {p.nombre}» | `programas.length > 0` | `id=filter-programa (id used by code)` | LicitacionesPage · l.535 |

**Table columns** (8)

| Text | Shown when | Where |
|---|---|---|
| «Número» | `!(loading) && !(licitaciones.length === 0)` | LicitacionesPage · l.573 |
| «Escuela» | `!(loading) && !(licitaciones.length === 0) && isAdmin` | LicitacionesPage · l.577 |
| «Nombre» | `!(loading) && !(licitaciones.length === 0)` | LicitacionesPage · l.581 |
| «Estado» | `!(loading) && !(licitaciones.length === 0)` | LicitacionesPage · l.584 |
| «Acción Requerida» | `!(loading) && !(licitaciones.length === 0)` | LicitacionesPage · l.587 |
| «Año» | `!(loading) && !(licitaciones.length === 0)` | LicitacionesPage · l.590 |
| «Fecha Publicación» | `!(loading) && !(licitaciones.length === 0)` | LicitacionesPage · l.593 |
| «Creado» | `!(loading) && !(licitaciones.length === 0)` | LicitacionesPage · l.596 |

**Toasts** (8)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al verificar permisos» | `!response.ok` | checkAuth · l.184 |
| error | «No tiene permisos para acceder a licitaciones» | `!adminAccess && !encargadoAccess` | checkAuth · l.197 |
| error | «Error al cargar licitaciones» | `!res.ok` | LicitacionesPage · l.273 |
| error | «Error al cargar licitaciones» |  | LicitacionesPage · l.282 |
| error | «Error al exportar» | `!res.ok` | handleExportExcel · l.311 |
| error | «No hay licitaciones para exportar» | `rows.length === 0` | handleExportExcel · l.317 |
| success | «Exportando {rows.length} licitaciones...» |  | handleExportExcel · l.322 |
| error | «Error al exportar licitaciones» |  | handleExportExcel · l.324 |

**Moves to another page from code** (9)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.176 |
| `/dashboard` | `router.push` | `!response.ok` | checkAuth · l.185 |
| `/dashboard` | `router.push` | `!adminAccess && !encargadoAccess` | checkAuth · l.198 |
| `/login` | `router.push` |  | checkAuth · l.222 |
| `/licitaciones/importar` | `router.push` | `(isAdmin \|\| isEncargado)` | LicitacionesPage · l.397 |
| `/licitaciones/nueva` | `router.push` | `isAdmin` | LicitacionesPage · l.406 |
| `/licitaciones/[*]` | `router.push` | `isEncargado && !isAdmin && actionableLicitaciones.length > 0 && each actionableLicitaciones.slice(0, 5)` | LicitacionesPage · l.427 |
| `/licitaciones/[*]` | `router.push` | `!(loading) && !(licitaciones.length === 0) && each licitaciones` | LicitacionesPage · l.607 |
| `/licitaciones/[*]` | `router.push` | `!(loading) && !(licitaciones.length === 0) && each licitaciones` | LicitacionesPage · l.614 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!currentUser` | LicitacionesPage · l.167 |
| `!currentUser` | LicitacionesPage · l.258 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Licitaciones |  |  | LicitacionesPage · l.359 |
| `AlertTriangle` | aria-hidden: true | `isEncargado && !isAdmin && actionableLicitaciones.length > 0` |  | LicitacionesPage · l.420 |
| `AlertTriangle` | aria-hidden: true | `upcomingDeadlines.length > 0` |  | LicitacionesPage · l.444 |
| `ChevronLeft` | aria-hidden: true | `!(loading) && !(licitaciones.length === 0) && totalPages > 1` |  | LicitacionesPage · l.667 |
| `ChevronRight` | aria-hidden: true | `!(loading) && !(licitaciones.length === 0) && totalPages > 1` |  | LicitacionesPage · l.678 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `DEADLINE_FIELDS` | «Plazo solicitud de bases», «Plazo de consultas», «Plazo de propuestas», «Plazo de evaluación» | l.66 |

**Values shown from data** (9)

- `{info.label}` — EstadoBadge · l.59
- `{item.numero_licitacion}` — LicitacionesPage · l.450, when `upcomingDeadlines.length > 0 && each upcomingDeadlines`
- `{formatDate(item.deadline_date)}` — LicitacionesPage · l.454, when `upcomingDeadlines.length > 0 && each upcomingDeadlines`
- `{lic.schools?.name} / -` — LicitacionesPage · l.620, when `!(loading) && !(licitaciones.length === 0) && each licitaciones && isAdmin`
- `{lic.nombre_licitacion}` — LicitacionesPage · l.624, when `!(loading) && !(licitaciones.length === 0) && each licitaciones`
- `{nextAction}` — LicitacionesPage · l.632, when `!(loading) && !(licitaciones.length === 0) && each licitaciones && nextAction`
- `{lic.year}` — LicitacionesPage · l.637, when `!(loading) && !(licitaciones.length === 0) && each licitaciones`
- `{formatDate(lic.fecha_publicacion)}` — LicitacionesPage · l.640, when `!(loading) && !(licitaciones.length === 0) && each licitaciones`
- `{formatDate(lic.created_at)}` — LicitacionesPage · l.643, when `!(loading) && !(licitaciones.length === 0) && each licitaciones`

**Other texts on screen** (14)

- «Licitaciones de {encargadoSchoolName}» — LicitacionesPage · l.374, when `isEncargado && !isAdmin && encargadoSchoolName`
- «Procesos de licitación de servicios ATE bajo Ley SEP» — LicitacionesPage · l.380, when `(!isEncargado \|\| isAdmin)`
- «({item.school_name})» — LicitacionesPage · l.451, when `upcomingDeadlines.length > 0 && each upcomingDeadlines`
- «HOY» — LicitacionesPage · l.456, when `upcomingDeadlines.length > 0 && each upcomingDeadlines && item.days_remaining === 0`
- «mañana» — LicitacionesPage · l.459, when `upcomingDeadlines.length > 0 && each upcomingDeadlines && item.days_remaining === 1`
- «en {item.days_remaining} días» — LicitacionesPage · l.462, when `upcomingDeadlines.length > 0 && each upcomingDeadlines && item.days_remaining > 1`
- «Mostrar históricas (licitaciones cerradas)» (label) — LicitacionesPage · l.472
- «Estado» (label) — LicitacionesPage · l.487
- «Año» (label) — LicitacionesPage · l.501
- «Escuela» (label) — LicitacionesPage · l.517, when `isAdmin && schools.length > 0`
- «Programa» (label) — LicitacionesPage · l.534, when `programas.length > 0`
- «Crea la primera licitación con el botón "Nueva Licitación" / No hay licitaciones asignadas a su escuela» — LicitacionesPage · l.560, when `!(loading) && licitaciones.length === 0`
- «Mostrando {((page - 1) * LIMIT) + 1} &ndash; {Math.min(page * LIMIT, total)} de {total}» — LicitacionesPage · l.657, when `!(loading) && !(licitaciones.length === 0) && totalPages > 1`
- «Página {page} de {totalPages}» — LicitacionesPage · l.669, when `!(loading) && !(licitaciones.length === 0) && totalPages > 1`

**Reads and writes the database directly:** `table:programas` (select), `table:schools` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/licitacionesExport.ts`
- `types/licitaciones.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/my-roles` | GET | `pages/licitaciones/index.tsx:180` |
| `/api/licitaciones` | GET | `pages/licitaciones/index.tsx:269`, `pages/licitaciones/index.tsx:307` |
| `/api/licitaciones/check-deadlines` | POST | `pages/licitaciones/index.tsx:168` |

## /licitaciones/nueva

File `pages/licitaciones/nueva.tsx` · 598 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.120 `router.push → /login  (when !user)`
  - l.141 `router.push → /login`
- Linked from: `pages/licitaciones/index.tsx:406`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/licitaciones/nueva-requires-cliente.test.tsx`.
- QA scenarios that name this address: encargado_licitacion 1.

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

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Nueva Licitacion» | h1 |  | NuevaLicitacionPage · l.317 |
| «Escuela» | h2 |  | NuevaLicitacionPage · l.323 |
| «Programa» | h2 |  | NuevaLicitacionPage · l.390 |
| «Datos de la Licitacion» | h2 |  | NuevaLicitacionPage · l.408 |
| «Campos Opcionales» | h2 |  | NuevaLicitacionPage · l.528 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Licitaciones» | `{() => router.push('/licitaciones')}` |  |  |  | NuevaLicitacionPage · l.309 |
| «Cancelar» | `{() => router.push('/licitaciones')}` |  |  |  | NuevaLicitacionPage · l.577 |
| «Creando... / Crear Licitacion» (submits the form) · tooltip «{schoolSinCliente ? SIN_CLIENTE : undefined}» |  |  | `{submitting \|\| schoolSinCliente}` |  | NuevaLicitacionPage · l.584 |

**Fields** (14)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «Seleccione una escuela...», «(lista) {s.name}» |  | `id=field-school_id` | NuevaLicitacionPage · l.329 |
|  | select |  | «(lista) {y}» |  | `id=field-year` | NuevaLicitacionPage · l.345 |
|  | select |  | «Seleccione un programa...», «(lista) {p.nombre}» |  | `id=field-programa_id` | NuevaLicitacionPage · l.392 |
| «Ej: Asesoria integral para transformacion educativa 2026» | text | «Ej: Asesoria integral para transformacion educativa 2026» · `maxLength={500}` |  |  | `id=field-nombre_licitacion` | NuevaLicitacionPage · l.411 |
| «licitaciones@escuela.cl» | email | «licitaciones@escuela.cl» |  |  | `id=field-email_licitacion` | NuevaLicitacionPage · l.423 |
|  | select |  | «UF», «CLP» |  | `id=field-tipo_moneda` | NuevaLicitacionPage · l.435 |
| «0» | number | «0» · `min=0 step=0.01` |  |  | `id=field-monto_minimo` | NuevaLicitacionPage · l.447 |
| «0» | number | «0» · `min=0 step=0.01` |  |  | `id=field-monto_maximo` | NuevaLicitacionPage · l.460 |
| «Ej: 6 meses» | text | «Ej: 6 meses» |  |  | `id=field-duracion_minima` | NuevaLicitacionPage · l.475 |
| «Ej: 12 meses» | text | «Ej: 12 meses» |  |  | `id=field-duracion_maxima` | NuevaLicitacionPage · l.486 |
| «Peso Evaluacion Tecnica *» | range | `min=1 max=99` |  |  | `id=field-peso_evaluacion_tecnica (id used by code)` | NuevaLicitacionPage · l.504 |
| «Ej: 30» | number | «Ej: 30» · `min=1` |  |  | `id=field-participantes_estimados` | NuevaLicitacionPage · l.531 |
|  | select |  | «Sin preferencia», «Presencial», «Virtual», «Hibrido» |  | `id=field-modalidad_preferida` | NuevaLicitacionPage · l.543 |
| «Observaciones o contexto adicional...» | textarea | «Observaciones o contexto adicional...» · `maxLength={2000}` |  |  | `id=field-notas` | NuevaLicitacionPage · l.558 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | NuevaLicitacionPage · l.320 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Solo administradores pueden crear licitaciones» | `!roles.includes('admin')` | checkAuth · l.129 |
| error | «No se pudo cargar el cliente vinculado» | `error \|\| !data` | handleSchoolChange · l.183 |
| error | «Error al crear licitacion» | `!res.ok` | handleSubmit · l.265 |
| success | «Licitacion creada exitosamente» |  | handleSubmit · l.269 |
| error | «Error inesperado al crear licitacion» |  | handleSubmit · l.272 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.120 |
| `/licitaciones` | `router.push` | `!roles.includes('admin')` | checkAuth · l.130 |
| `/login` | `router.push` |  | checkAuth · l.141 |
| `/licitaciones/[*]` | `router.push` |  | handleSubmit · l.270 |
| `/licitaciones` | `router.push` |  | NuevaLicitacionPage · l.310 |
| `/licitaciones` | `router.push` |  | NuevaLicitacionPage · l.579 |

**Pieces placed here, with the texts and settings handed to them** (15)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Nueva Licitacion | `authLoading` |  | NuevaLicitacionPage · l.282 |
| `MainLayout` | pageTitle: Nueva Licitacion |  |  | NuevaLicitacionPage · l.300 |
| `Field` | label: Escuela |  |  | NuevaLicitacionPage · l.328 |
| `Field` | label: Ano de Licitacion |  |  | NuevaLicitacionPage · l.344 |
| `Field` | label: Programa FNE |  |  | NuevaLicitacionPage · l.391 |
| `Field` | label: Nombre de la Licitacion |  |  | NuevaLicitacionPage · l.410 |
| `Field` | label: Correo electronico de contacto para la licitacion |  |  | NuevaLicitacionPage · l.422 |
| `Field` | label: Moneda |  |  | NuevaLicitacionPage · l.434 |
| `Field` | label: Monto minimo ({form.tipo_moneda}) |  |  | NuevaLicitacionPage · l.446 |
| `Field` | label: Monto maximo ({form.tipo_moneda}) |  |  | NuevaLicitacionPage · l.459 |
| `Field` | label: Duracion minima del servicio |  |  | NuevaLicitacionPage · l.474 |
| `Field` | label: Duracion maxima del servicio |  |  | NuevaLicitacionPage · l.485 |
| `Field` | label: Participantes estimados |  |  | NuevaLicitacionPage · l.530 |
| `Field` | label: Modalidad preferida |  |  | NuevaLicitacionPage · l.542 |
| `Field` | label: Notas adicionales |  |  | NuevaLicitacionPage · l.557 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `SIN_CLIENTE` | «Esta escuela no tiene un cliente vinculado. Vincule un cliente antes de crear la licitación.» | l.73 |
| `DEFAULT_FORM` | «UF» | l.77 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «El cliente no tiene toda la informacion legal requerida. Edite el cliente en la seccion de Escuelas.» | NuevaLicitacionPage · l.193 |
| «Ingrese el monto minimo» | NuevaLicitacionPage · l.213 |
| «Ingrese el monto maximo» | NuevaLicitacionPage · l.214 |

**Values shown from data** (3)

- `{errors[name]}` — Field · l.68, when `errors[name]`
- `{errors.peso_evaluacion_tecnica}` — NuevaLicitacionPage · l.520, when `errors.peso_evaluacion_tecnica`
- `{SIN_CLIENTE}` — NuevaLicitacionPage · l.574, when `schoolSinCliente`

**Other texts on screen** (11)

- «{label} [*]» (label) — Field · l.63
- «Complete los campos para crear un nuevo proceso de licitacion» — NuevaLicitacionPage · l.318
- «Cargando informacion del cliente...» — NuevaLicitacionPage · l.361, when `loadingCliente`
- «Cliente vinculado» — NuevaLicitacionPage · l.368, when `selectedCliente && !loadingCliente`
- «Nombre legal:» — NuevaLicitacionPage · l.372, when `selectedCliente && !loadingCliente`
- «RUT:» — NuevaLicitacionPage · l.375, when `selectedCliente && !loadingCliente`
- «Representante:» — NuevaLicitacionPage · l.378, when `selectedCliente && !loadingCliente`
- «Comuna:» — NuevaLicitacionPage · l.381, when `selectedCliente && !loadingCliente`
- «Peso Evaluacion Tecnica *» (label) — NuevaLicitacionPage · l.499
- «Tecnica: {pesoTecnico} %» — NuevaLicitacionPage · l.515
- «Economica: {pesoEconomico} %» — NuevaLicitacionPage · l.516

**Reads and writes the database directly:** `table:clientes` (select), `table:programas` (select), `table:schools` (select)

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/my-roles` | GET | `pages/licitaciones/nueva.tsx:124` |
| `/api/licitaciones` | POST | `pages/licitaciones/nueva.tsx:256` |

## /propuesta/[slug]

File `pages/propuesta/[slug].tsx` · 220 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.155 `router.push → /  (when error)`
- Linked from: `components/licitaciones/ProposalConfigPanel.tsx:1632`, `components/licitaciones/ProposalConfigPanel.tsx:1652`, `components/licitaciones/ProposalConfigPanel.tsx:1653`, `lib/look.ts:113`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/flows/proposal-buckets.spec.ts`, `tests/e2e/flows/proposal-web-view.spec.ts`.

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

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Propuesta no disponible» | h1 | `error` | PublicProposalPage · l.152 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al inicio» | `{() => router.push('/')}` | `error` |  |  | PublicProposalPage · l.154 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Esta propuesta ha expirado y ya no está disponible.» | `setError` | `!(res.ok && json.data) && res.status === 410` | PublicProposalPage · l.38 |
| «Propuesta no encontrada» | `setError` | `!(res.ok && json.data) && !(res.status === 410)` | PublicProposalPage · l.40 |
| «Error al cargar la propuesta» | `setError` |  | PublicProposalPage · l.43 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/` | `router.push` | `error` | PublicProposalPage · l.155 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!slug \|\| typeof slug !== 'string'` | PublicProposalPage · l.80 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ProposalPublicView` |  | `snapshot && metadata` |  | PublicProposalPage · l.188 |
| `ProposalUnlockScreen` |  | `metadata` |  | PublicProposalPage · l.205 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Propuesta de consultoría educativa para {metadata.schoolName}. {metadata.serviceName} {metadata.programYear}.» | PublicProposalPage · l.176 |
| «Propuesta personalizada de consultoría educativa para {metadata.schoolName}» | PublicProposalPage · l.182 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: {SESSION_KEY_PREFIX}{s}` | PublicProposalPage · l.52 |
| storage | `sessionStorage: {SESSION_KEY_PREFIX}{slug}` | handleUnlockWithCode · l.119 |
| address value | `?admin` | l.1 |
| address value | `[slug] (part of the address)` | l.1 |

**Values shown from data** (1)

- `{error}` — PublicProposalPage · l.153, when `error`

**Other texts on screen** (5)

- «Cargando Propuesta - Fundación Nueva Educación» — PublicProposalPage · l.128, when `loading && !snapshot`
- «Cargando propuesta...» — PublicProposalPage · l.133, when `loading && !snapshot`
- «Error - Fundación Nueva Educación» — PublicProposalPage · l.144, when `error`
- «{pageTitle} - Fundación Nueva Educación» — PublicProposalPage · l.173, when `snapshot && metadata`
- «Propuesta para {metadata.schoolName} - Fundación Nueva Educación» — PublicProposalPage · l.198, when `metadata`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/propuestas-web/BucketDistribution.tsx`
- `components/propuestas-web/BucketTimeline.tsx`
- `components/propuestas-web/ConsultantCard.tsx`
- `components/propuestas-web/ContentBlockSection.tsx`
- `components/propuestas-web/DocumentCard.tsx`
- `components/propuestas-web/DownloadablesSection.tsx`
- `components/propuestas-web/PricingSection.tsx`
- `components/propuestas-web/ProposalPublicView.tsx`
- `components/propuestas-web/ProposalUnlockScreen.tsx`
- `lib/propuestas-web/constants.ts`
- `lib/propuestas-web/pdf-generator.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/propuestas/web/[slug]` | GET | `pages/propuesta/[slug].tsx:32` |
| `/api/propuestas/web/[slug]/admin-access` | GET | `pages/propuesta/[slug].tsx:86` |
| `/api/propuestas/web/[slug]/download-doc` | POST | `components/propuestas-web/DownloadablesSection.tsx:39` |
| `/api/propuestas/web/[slug]/download-zip` | POST | `components/propuestas-web/DownloadablesSection.tsx:63` |
| `/api/propuestas/web/[slug]/verify` | POST | `components/propuestas-web/ProposalUnlockScreen.tsx:36`, `pages/propuesta/[slug].tsx:56` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/licitaciones/ArchiveView.tsx

Used by: `/licitaciones/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Archivo Historico» | h2 |  | ArchiveView · l.132 |
| «{bucket.label}» | h3 | `!(loading) && each BUCKETS` | ArchiveView · l.151 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Generando... / Descargar» | `{() => handleDownload(doc)}` | `!(loading) && each BUCKETS && !(bucketDocs.length === 0) && each bucketDocs` | `{downloadingId === doc.id}` |  | ArchiveView · l.179 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Subiendo... / Subir archivo PDF, Word o imagen · hasta 25 MB» | file | disabled: `{uploading}` · accepts `.pdf,.doc,.docx,image/*` |  | `!(loading) && each BUCKETS && canUpload` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | ArchiveView · l.200 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar documentos» |  | ArchiveView · l.69 |
| error | «Error al descargar documento» |  | handleDownload · l.97 |
| success | «Archivo subido» |  | handleUpload · l.119 |
| error | «Error al subir archivo» |  | handleUpload · l.122 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar documentos» | `throw (shown by whoever catches it)` | `!res.ok` | ArchiveView · l.64 |
| «No se pudo generar el enlace de descarga» | `throw (shown by whoever catches it)` | `!res.ok` | handleDownload · l.85 |
| «Enlace de descarga no disponible» | `throw (shown by whoever catches it)` | `!signedUrl` | handleDownload · l.89 |
| «Error al subir archivo» | `throw (shown by whoever catches it)` | `!res.ok` | handleUpload · l.117 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{signedUrl}` | `window.open` |  | handleDownload · l.95 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DocumentPreview` |  | `!(loading) && each BUCKETS && !(bucketDocs.length === 0) && each bucketDocs` |  | ArchiveView · l.178 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `BUCKETS` | «Publicaciones», «Bases», «Propuestas», «Evaluacion», «Adjudicacion», «Anexos», «Otros» | l.22 |

**Values shown from data** (2)

- `{doc.nombre}` — ArchiveView · l.170, when `!(loading) && each BUCKETS && !(bucketDocs.length === 0) && each bucketDocs`
- `{doc.file_name} · {formatFileSize(doc.file_siz…} · {formatDate(doc.created_at)}` — ArchiveView · l.171, when `!(loading) && each BUCKETS && !(bucketDocs.length === 0) && each bucketDocs`

**Other texts on screen** (5)

- «Licitacion cerrada · documentacion de registro» — ArchiveView · l.134
- «Cargando documentos...» — ArchiveView · l.141, when `loading`
- «{bucketDocs.length} archivo s» — ArchiveView · l.152, when `!(loading) && each BUCKETS`
- «Sin archivos en esta categoria.» — ArchiveView · l.160, when `!(loading) && each BUCKETS && bucketDocs.length === 0`
- «Subiendo... / Subir archivo PDF, Word o imagen · hasta 25 MB» (label) — ArchiveView · l.195, when `!(loading) && each BUCKETS && canUpload`

### components/licitaciones/BucketConfigSection.tsx

Used by: `/licitaciones/[id]`

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Trash2]» · tooltip «Eliminar» | `{() => removeBucket(bucket.id)}` | `customBuckets.length > 0 && each customBuckets` |  |  | BucketConfigSection · l.255 |
| «Agregar actividad personalizada» | `{() => setShowCustomForm(true)}` | `!showCustomForm` |  |  | BucketConfigSection · l.294 |
| «Agregar» | `{addCustomBucket}` | `!(!showCustomForm)` | `{!customName.trim()}` |  | BucketConfigSection · l.340 |
| «Cancelar» | `{() => { setShowCustomForm(false); setCustomName(''); }}` | `!(!showCustomForm)` |  |  | BucketConfigSection · l.348 |

**Fields** (10)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | checkbox |  |  | `each BUCKET_TEMPLATES` |  | BucketConfigSection · l.140 |
|  | number | `min=0` |  | `each BUCKET_TEMPLATES && active` |  | BucketConfigSection · l.167 |
|  | select |  | «Mes...», «(lista) {m.label}» | `each BUCKET_TEMPLATES && active && template.distributionType === 'bloque'` |  | BucketConfigSection · l.185 |
| «Notas (opcional)» | text | «Notas (opcional)» |  | `each BUCKET_TEMPLATES && active` |  | BucketConfigSection · l.198 |
|  | number | `min=0` |  | `customBuckets.length > 0 && each customBuckets` |  | BucketConfigSection · l.244 |
|  | select |  | «Mes...», «(lista) {m.label}» | `customBuckets.length > 0 && each customBuckets && bucket.distributionType === 'bloque'` |  | BucketConfigSection · l.266 |
| «Notas (opcional)» | text | «Notas (opcional)» |  | `customBuckets.length > 0 && each customBuckets` |  | BucketConfigSection · l.279 |
| «Nombre de la actividad» | text | «Nombre de la actividad» |  | `!(!showCustomForm)` |  | BucketConfigSection · l.305 |
| «Tipo» | select |  | «Taller / Bloque», «Sesiones regulares», «Flexible» | `!(!showCustomForm)` |  | BucketConfigSection · l.315 |
| «Modalidad» | select |  | «Presencial», «Online», «Asincrónico», «Híbrido» | `!(!showCustomForm)` |  | BucketConfigSection · l.327 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `DIST_LABELS` | «Taller», «Sesiones», «Flexible» | l.14 |
| `MOD_LABELS` | «Presencial», «Online», «Asincrónico», «Híbrido» | l.26 |

**Values shown from data** (6)

- `{template.label}` — BucketConfigSection · l.147, when `each BUCKET_TEMPLATES`
- `{DIST_LABELS[template.distributionTy…}` — BucketConfigSection · l.151, when `each BUCKET_TEMPLATES`
- `{MOD_LABELS[template.modalidad]}` — BucketConfigSection · l.158, when `each BUCKET_TEMPLATES`
- `{bucket.label}` — BucketConfigSection · l.225, when `customBuckets.length > 0 && each customBuckets`
- `{DIST_LABELS[bucket.distributionType]}` — BucketConfigSection · l.229, when `customBuckets.length > 0 && each customBuckets`
- `{MOD_LABELS[bucket.modalidad]}` — BucketConfigSection · l.236, when `customBuckets.length > 0 && each customBuckets`

**Other texts on screen** (8)

- «hrs» — BucketConfigSection · l.176, when `each BUCKET_TEMPLATES && active`
- «Actividades Personalizadas» — BucketConfigSection · l.216, when `customBuckets.length > 0`
- «hrs» — BucketConfigSection · l.253, when `customBuckets.length > 0 && each customBuckets`
- «Nueva actividad personalizada» — BucketConfigSection · l.304, when `!(!showCustomForm)`
- «Tipo» (label) — BucketConfigSection · l.314, when `!(!showCustomForm)`
- «Modalidad» (label) — BucketConfigSection · l.326, when `!(!showCustomForm)`
- «Resumen:» — BucketConfigSection · l.367, when `activeBuckets.length > 0`
- «{grandTotal} hrs» — BucketConfigSection · l.367, when `activeBuckets.length > 0`

### components/licitaciones/DocumentCenter.tsx

Used by: `/licitaciones/[id]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Centro de Documentos» | h2 |  | DocumentCenter · l.260 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Generando ZIP... / Descargar Todo» | `{handleDownloadZip}` | `documentos.length > 0` | `{downloadingZip}` |  | DocumentCenter · l.266 |
| «{folder.label} {folderDocs.length} archivo s» | `{() => toggleFolder(folder.key)}` | `!(documentos.length === 0) && each FOLDERS` |  |  | DocumentCenter · l.295 |
| «⌛» · tooltip «Descargar» | `{() => handleDownload(doc)}` | `!(documentos.length === 0) && each FOLDERS && isExpanded && each folderDocs` | `{downloadingId === doc.id}` |  | DocumentCenter · l.330 |
| «⌛» · tooltip «Eliminar documento» | `{() => { if (window.confirm('¿Eliminar "${doc.nombre}"? Esta accion no se puede …}` | `each FOLDERS && isExpanded && each folderDocs && isAdmin` | `{deletingId === doc.id}` |  | DocumentCenter · l.345 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Eliminar "{doc.nombre}"? Esta accion no se puede deshacer.» | `each FOLDERS && isExpanded && each folderDocs && isAdmin` | DocumentCenter · l.347 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar documentos» |  | DocumentCenter · l.123 |
| error | «Error al descargar documento» |  | handleDownload · l.166 |
| error | «Error al descargar ZIP» |  | handleDownloadZip · l.201 |
| success | «Documento eliminado» |  | handleDeleteDoc · l.222 |
| error | «Error al eliminar documento» |  | handleDeleteDoc · l.225 |

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar documentos» | `throw (shown by whoever catches it)` | `!res.ok` | DocumentCenter · l.118 |
| «No se pudo generar el enlace de descarga» | `throw (shown by whoever catches it)` | `!res.ok` | handleDownload · l.148 |
| «Enlace de descarga no disponible» | `throw (shown by whoever catches it)` | `!signedUrl` | handleDownload · l.154 |
| «Error al generar ZIP» | `throw (shown by whoever catches it)` | `!res.ok` | handleDownloadZip · l.186 |
| «Error al eliminar documento» | `throw (shown by whoever catches it)` | `!res.ok` | handleDeleteDoc · l.220 |

**Downloads and printing** (3)

| How | When | Where |
|---|---|---|
| `archivo: {doc.file_name \|\| doc.nombre}` |  | handleDownload · l.160 |
| `URL.createObjectURL()` |  | handleDownloadZip · l.191 |
| `archivo: {zipName}.zip` |  | handleDownloadZip · l.195 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `folderDocs.length === 0` | DocumentCenter · l.288 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DocumentPreview` |  | `!(documentos.length === 0) && each FOLDERS && isExpanded && each folderDocs` |  | DocumentCenter · l.329 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `FOLDERS` | «01 — Publicacion», «02 — Bases», «03 — Propuestas», «04 — Evaluacion», «05 — Adjudicacion», «06 — Otros» | l.34 |

**Values shown from data** (2)

- `{doc.nombre}` — DocumentCenter · l.321, when `!(documentos.length === 0) && each FOLDERS && isExpanded && each folderDocs`
- `{doc.file_name} [· {formatFileSize(doc.file_siz…}] [· {formatDate(doc.created_at)}]` — DocumentCenter · l.322, when `!(documentos.length === 0) && each FOLDERS && isExpanded && each folderDocs`

**Other texts on screen** (3)

- «Cargando documentos...» — DocumentCenter · l.248, when `loading`
- «( {documentos.length} archivos)» — DocumentCenter · l.262, when `documentos.length > 0`
- «No hay documentos registrados para esta licitacion.» — DocumentCenter · l.282, when `documentos.length === 0`

### components/licitaciones/DocumentPreview.tsx

Used by: `/licitaciones/[id]`

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Vista previa» · aria «{`Vista previa de ${documento.nombre}`}» |  |  |  | `testid=preview-document-{documento.id}` | DocumentPreview · l.77 |
| «[icon X]» · aria «Cerrar vista previa» |  |  |  | `testid=close-document-preview` | DocumentPreview · l.90 |
| «Reintentar» | `{() => setAttempt(value => value + 1)}` | `error` |  | `testid=retry-document-preview` | DocumentPreview · l.94 |
| «Generando... / Descargar documento» | `{onDownload}` |  | `{downloading}` | `testid=download-preview-document` | DocumentPreview · l.103 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {`Vista previa de ${documento.nombre}`} · {url} | `!loading && !error && url && kind === 'pdf'` |  | DocumentPreview · l.96 |
| img · alt {documento.nombre} · {url} | `!loading && !error && url && kind === 'image'` |  | DocumentPreview · l.98 |

**Messages set on the page** (8)

| Text | Set by | When | Where |
|---|---|---|---|
| «El archivo supera los 25 MB permitidos para la vista previa.» | `throw (shown by whoever catches it)` | `(documento.file_size \|\| 0) > MAX_PREVIEW_SIZE` | load · l.38 |
| «No tienes permiso para ver este documento. / No se pudo cargar la vista previa.» | `throw (shown by whoever catches it)` | `!response.ok` | load · l.41 |
| «El enlace del documento no está disponible.» | `throw (shown by whoever catches it)` | `!signedUrl` | load · l.45 |
| «No se pudo cargar el archivo. Intenta nuevamente.» | `throw (shown by whoever catches it)` | `!file.ok` | load · l.47 |
| «El archivo supera los 25 MB permitidos para la vista previa.» | `throw (shown by whoever catches it)` | `Number(file.headers.get('content-length')) > MAX_PREVIEW_SIZE` | load · l.49 |
| «El archivo supera los 25 MB permitidos para la vista previa.» | `throw (shown by whoever catches it)` | `blob.size > MAX_PREVIEW_SIZE` | load · l.53 |
| «No se pudo cargar la vista previa.» | `setError` | `!controller.signal.aborted` | load · l.62 |
| «No se pudo mostrar la imagen.» | `setError` | `!loading && !error && url && kind === 'image'` | DocumentPreview · l.98 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` | `!(kind === 'docx')` | load · l.58 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!open` | DocumentPreview · l.26 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Eye` | aria-hidden: true |  |  | DocumentPreview · l.79 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Este documento no contiene texto para mostrar.» | DocumentPreview · l.56 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| mark | `testid=document-preview-dialog` | DocumentPreview · l.84 |
| role | `role=status` | DocumentPreview · l.93 |
| role | `role=alert` | DocumentPreview · l.94 |

**Values shown from data** (3)

- `{documento.nombre}` — DocumentPreview · l.85
- `{error}` — DocumentPreview · l.94, when `error`
- `{text}` — DocumentPreview · l.99, when `!loading && !error && text !== null`

**Other texts on screen** (4)

- «{documento.file_name} · Vista de texto: no incluye imágenes ni formato original.» — DocumentPreview · l.86
- «Cargando vista previa...» — DocumentPreview · l.93, when `loading`
- «Este formato no admite vista previa. Puedes descargar el documento para abrirlo.» — DocumentPreview · l.95, when `kind === 'unsupported'`
- «Si tu navegador no muestra el PDF, puedes descargarlo.» — DocumentPreview · l.102, when `kind === 'pdf'`

### components/licitaciones/ProposalConfigPanel.tsx

Used by: `/licitaciones/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «P Generar Propuesta FNE Solo Admin» | h2 |  | ProposalConfigPanel · l.737 |
| «Propuesta Web Generada» | h3 | `panelOpen && !(!dataLoaded) && lastGenResult` | ProposalConfigPanel · l.1602 |

**Buttons** (18)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{title}» | `{onToggle}` |  |  |  | SectionHeader · l.150 |
| «P Generar Propuesta FNE Solo Admin» | `{() => setPanelOpen(o => !o)}` |  |  |  | ProposalConfigPanel · l.732 |
| «Objetivo General: revisar coherencia» | `{() => setObjetivoExpanded(o => !o)}` | `panelOpen && !(!dataLoaded) && selectedFicha && validationResult && validationResult.warnings.some(w => w.rule === 6)` |  |  | ProposalConfigPanel · l.810 |
| «Por hora» | `{() => setPrecioModelo('per_hour')}` | `panelOpen && !(!dataLoaded) && secPrecio` |  |  | ProposalConfigPanel · l.1147 |
| «Precio fijo» | `{() => setPrecioModelo('fixed')}` | `panelOpen && !(!dataLoaded) && secPrecio` |  |  | ProposalConfigPanel · l.1158 |
| «Cargar desde plantilla» | `{loadFromPlantilla}` | `panelOpen && !(!dataLoaded) && secModulos` | `{!selectedPlantilla}` |  | ProposalConfigPanel · l.1269 |
| «Agregar módulo» | `{addModule}` | `panelOpen && !(!dataLoaded) && secModulos` |  |  | ProposalConfigPanel · l.1277 |
| «[icon ArrowUp]» | `{() => moveModule(i, 'up')}` | `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos` | `{i === 0}` |  | ProposalConfigPanel · l.1304 |
| «[icon ArrowDown]» | `{() => moveModule(i, 'down')}` | `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos` | `{i === modulos.length - 1}` |  | ProposalConfigPanel · l.1312 |
| «[icon Trash2]» | `{() => removeModule(i)}` | `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos` |  |  | ProposalConfigPanel · l.1330 |
| «Generando... / Generar Propuesta Final» | `{handleGenerate}` | `panelOpen && !(!dataLoaded)` | `{generating \|\| !plantillaId \|\| !fichaId \|\| (validationResult !== null && !valida…}` |  | ProposalConfigPanel · l.1542 |
| «Ocultar Vista Previa / Vista Previa» · tooltip «Muestra el PDF tal como se generará y descargará» | `{() => setShowPreview((v) => !v)}` | `panelOpen && !(!dataLoaded)` | `{!previewSnapshot}` |  | ProposalConfigPanel · l.1562 |
| «[icon Copy]» · tooltip «Copiar código» | `{() => copyToClipboard(lastGenResult.access_code, 'Código')}` | `panelOpen && !(!dataLoaded) && lastGenResult` |  |  | ProposalConfigPanel · l.1614 |
| «[icon Copy]» · tooltip «Copiar enlace» | `{() => copyToClipboard( '${window.location.origin}/propuesta/${lastGenResult.web…}` | `panelOpen && !(!dataLoaded) && lastGenResult` |  |  | ProposalConfigPanel · l.1634 |
| «Copiar Link + Código» | `{() => { const url = '${window.location.origin}/propuesta/${lastGenResult.web_sl…}` | `panelOpen && !(!dataLoaded) && lastGenResult` |  |  | ProposalConfigPanel · l.1661 |
| «Link» · tooltip «Copiar enlace web» | `{() => copyToClipboard( '${window.location.origin}/propuesta/${p.web_slug}', 'En…}` | `secHistorial && !(propuestas.length === 0) && each propuestas && p.estado === 'completada' && p.web_slug` |  |  | ProposalConfigPanel · l.1747 |
| «Código {p.access_code_plain}» · tooltip «Copiar código de acceso» | `{() => copyToClipboard(p.access_code_plain as string, 'Código')}` | `secHistorial && !(propuestas.length === 0) && each propuestas && p.estado === 'completada' && p.access_code_plain` |  |  | ProposalConfigPanel · l.1763 |
| «Regenerar Código» · tooltip «Próximamente» |  | `secHistorial && !(propuestas.length === 0) && each propuestas && p.estado === 'completada'` | `true` |  | ProposalConfigPanel · l.1774 |

**Links** (5)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Agregar consultores» | `/admin/licitaciones/consultores` (new tab) | `panelOpen && !(!dataLoaded) && secConsultores && consultores.length === 0` |  | ProposalConfigPanel · l.1070 |
| «Subir documentos» | `/admin/licitaciones/documentos-propuesta` (new tab) | `panelOpen && !(!dataLoaded) && secDocumentos && documentos.length === 0` |  | ProposalConfigPanel · l.1454 |
| «Gestionar biblioteca» | `/admin/licitaciones/documentos-propuesta` (new tab) | `panelOpen && !(!dataLoaded) && secDocumentos` |  | ProposalConfigPanel · l.1526 |
| «Ver Propuesta Web» | `/propuesta/[*]` (new tab) | `panelOpen && !(!dataLoaded) && lastGenResult` |  | ProposalConfigPanel · l.1652 |
| «PDF» | `{p.download_url}` (new tab) | `secHistorial && !(propuestas.length === 0) && each propuestas && p.estado === 'completada' && p.download_url` |  | ProposalConfigPanel · l.1784 |

**Fields** (19)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Objetivo de la propuesta...» | textarea | «Objetivo de la propuesta...» |  | `!(!dataLoaded) && selectedFicha && validationResult && validationResult.warnings.some(w => w.rule === 6) && objetivoExpanded` |  | ProposalConfigPanel · l.832 |
| «Plantilla» | select |  | «— Seleccionar —», «(lista) {p.nombre}» | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.882 |
| «Ficha de Servicio» | select | disabled: `{!!plantillaId}` | «— Seleccionar —», «(lista) Folio {f.folio} — {f.nombre_servicio}» | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.899 |
| «Presencial (hrs)» | number | `min=0` |  | `panelOpen && !(!dataLoaded) && secHoras` |  | ProposalConfigPanel · l.940 |
| «Online Sincrónica (hrs)» | number | `min=0` |  | `panelOpen && !(!dataLoaded) && secHoras` |  | ProposalConfigPanel · l.954 |
| «Online Asincrónica (hrs)» | number | `min=0` |  | `panelOpen && !(!dataLoaded) && secHoras` |  | ProposalConfigPanel · l.968 |
| «Incluir acceso a Plataforma de Crecimiento» | checkbox |  |  | `panelOpen && !(!dataLoaded) && secPlataforma` |  | ProposalConfigPanel · l.1030 |
| «Beneficios de la plataforma» | textarea | «Ej: Contenidos audiovisuales, formación cruzada, gestión del conocimiento interno» |  | `panelOpen && !(!dataLoaded) && secPlataforma && plataforma` |  | ProposalConfigPanel · l.1045 |
| «{c.nombre} [✓ en Ficha] {c.titulo} Comité Intl. / Equipo FNE / Asesor Intl.» | checkbox |  |  | `!(!dataLoaded) && secConsultores && !(consultores.length === 0) && each consultores` |  | ProposalConfigPanel · l.1096 |
| «Valor UF por hora» | number | «Ej: 1.2» · `min=0 step=0.01` |  | `panelOpen && !(!dataLoaded) && secPrecio && precioModelo === 'per_hour'` |  | ProposalConfigPanel · l.1177 |
| «Precio fijo (UF)» | number | «Ej: 888» · `min=0 step=0.01` |  | `panelOpen && !(!dataLoaded) && secPrecio && !(precioModelo === 'per_hour')` |  | ProposalConfigPanel · l.1205 |
| «Forma de pago» | select |  | «— Seleccionar —», «3 cuotas iguales», «2 cuotas iguales», «Pago único», «Personalizado» | `panelOpen && !(!dataLoaded) && secPrecio` |  | ProposalConfigPanel · l.1231 |
| «Detalle de pago» | text | «Ej: 33% inicio, 33% julio, 34% noviembre» |  | `panelOpen && !(!dataLoaded) && secPrecio` |  | ProposalConfigPanel · l.1247 |
| «{`Módulo ${i + 1}`}» | text | «{`Módulo ${i + 1}`}» |  | `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos` |  | ProposalConfigPanel · l.1321 |
| «Presencial» | number | `min=0` |  | `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos` |  | ProposalConfigPanel · l.1343 |
| «Sincrónica» | number | `min=0` |  | `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos` |  | ProposalConfigPanel · l.1357 |
| «Asincrónica» | number | `min=0` |  | `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos` |  | ProposalConfigPanel · l.1371 |
| «Mes» | select |  | «—», «(lista) {mes}» | `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos` |  | ProposalConfigPanel · l.1385 |
| «{doc.nombre} {TIPO_LABELS[doc.tipo]} [Vencido — bloquea generación] [Vence {formatDate(doc.fecha_vencimiento)}] [Vence: {formatDate(doc.fecha_vencimiento)}]» | checkbox | disabled: `{doc.expired}` |  | `!(!dataLoaded) && secDocumentos && !(documentos.length === 0) && each documentos` |  | ProposalConfigPanel · l.1480 |

**Toasts** (14)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error de red al cargar {label}» | `result.status === 'rejected'` | getJson · l.255 |
| error | «Respuesta inválida al cargar {label}» |  | getJson · l.262 |
| error | «Error inesperado al cargar datos de configuración» |  | ProposalConfigPanel · l.285 |
| success | «Configuración cargada desde plantilla» |  | loadFromPlantilla · l.567 |
| success | «{label} copiado al portapapeles» |  | copyToClipboard · l.587 |
| error | «Error al copiar» |  | copyToClipboard · l.589 |
| error | «Seleccione una plantilla y ficha antes de generar» | `!plantillaId \|\| !fichaId` | handleGenerate · l.599 |
| error | «Ficha de servicio no encontrada» | `!selectedFicha` | handleGenerate · l.603 |
| error | «Hay {validationResult.errors.len…} error(es) de validación MINEDUC. Corrija antes de generar.» | `validationResult && !validationResult.valid` | handleGenerate · l.607 |
| error | «Hay {expiredSelected.length} certificado(s) vencido(s) seleccionado(s). Actualícelos antes de generar.» | `expiredSelected.length > 0` | handleGenerate · l.617 |
| error | «Sin conexión al servidor. Verifique su red e intente nuevamente.» |  | handleGenerate · l.688 |
| error | «Error al generar propuesta» | `!res.ok` | handleGenerate · l.695 |
| success | «Propuesta generada exitosamente» |  | handleGenerate · l.699 |
| error | «Error inesperado al generar propuesta» |  | handleGenerate · l.719 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!selectedPlantilla \|\| !selectedFicha` | ProposalConfigPanel · l.321 |
| `!selectedFicha` | ProposalConfigPanel · l.450 |

**Pieces placed here, with the texts and settings handed to them** (15)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ValidationRow` | label: Nombre del Servicio · detail: coincide con la Ficha | `panelOpen && !(!dataLoaded) && selectedFicha && validationResult` |  | ProposalConfigPanel · l.770 |
| `ValidationRow` | label: Horas presenciales + sincrónicas · detail: {subtotalHoras}/{selectedFicha.horas_presenc…} registradas | `panelOpen && !(!dataLoaded) && selectedFicha && validationResult` |  | ProposalConfigPanel · l.779 |
| `ValidationRow` | label: Destinatarios | `panelOpen && !(!dataLoaded) && selectedFicha && validationResult` |  | ProposalConfigPanel · l.790 |
| `ValidationRow` | label: Consultores en Ficha · detail: {selectedConsultores.length} seleccionado(s) | `panelOpen && !(!dataLoaded) && selectedFicha && validationResult` |  | ProposalConfigPanel · l.799 |
| `ValidationRow` | label: Suma de módulos | `panelOpen && !(!dataLoaded) && selectedFicha && validationResult && validationResult.errors.some(e => e.rule === 7)` |  | ProposalConfigPanel · l.846 |
| `SectionHeader` | title: Configuración de Horas | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.928 |
| `SectionHeader` | title: Distribución de Actividades | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.1007 |
| `BucketConfigSection` |  | `panelOpen && !(!dataLoaded) && secBuckets` |  | ProposalConfigPanel · l.1013 |
| `SectionHeader` | title: Plataforma de Crecimiento | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.1022 |
| `SectionHeader` | title: Equipo Consultor ({consultoresIds.length} seleccionado{consultoresIds.length !== 1…}) | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.1060 |
| `SectionHeader` | title: Propuesta Económica | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.1138 |
| `SectionHeader` | title: Módulos / Actividades | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.1261 |
| `SectionHeader` | title: Documentos Adjuntos ({documentosIds.length} seleccionado{documentosIds.length !== 1 …}) | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.1444 |
| `ProposalPreview` |  | `panelOpen && !(!dataLoaded) && showPreview && previewSnapshot` |  | ProposalConfigPanel · l.1590 |
| `SectionHeader` | title: Historial de Propuestas ({propuestas.length}) | `panelOpen && !(!dataLoaded)` |  | ProposalConfigPanel · l.1679 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (6)

| Name | Texts | Where |
|---|---|---|
| `TIPO_LABELS` | «Cert. Pertenencia», «Eval. Clientes», «Carta Rec.», «Ficha MINEDUC», «Otro» | l.72 |
| `MESES` | «Enero», «Febrero», «Marzo», «Abril», «Mayo», «Junio», «Julio», «Agosto», «Septiembre», «Octubre», «Noviembre», «Diciembre» | l.88 |
| `WEB_STATUS_LABELS` | «Borrador», «Publicada», «Vista», «Expirada» | l.121 |
| `payload` | «3 cuotas iguales» | handleGenerate · l.631 |
| `text` | «Link: {url} Código: {lastGenResult.access_code}» | ProposalConfigPanel · l.1665 |
| `color` | «amber / green / red» | ValidationRow · l.1831 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Escuela» | ProposalConfigPanel · l.324 |

**Values shown from data** (8)

- `{validationResult.warnings.find(w =>…}` — ProposalConfigPanel · l.826, when `!(!dataLoaded) && selectedFicha && validationResult && validationResult.warnings.some(w => w.rule === 6) && objetivoExpanded`
- `{lastGenResult.access_code}` — ProposalConfigPanel · l.1611, when `panelOpen && !(!dataLoaded) && lastGenResult`
- `{formatDateTime(p.created_at)}` — ProposalConfigPanel · l.1708, when `!(!dataLoaded) && secHistorial && !(propuestas.length === 0) && each propuestas`
- `{p.estado}` — ProposalConfigPanel · l.1711, when `!(!dataLoaded) && secHistorial && !(propuestas.length === 0) && each propuestas`
- `{WEB_STATUS_LABELS[p.web_status]} / {p.web_status}` — ProposalConfigPanel · l.1725, when `secHistorial && !(propuestas.length === 0) && each propuestas && p.web_status`
- `{p.error_message}` — ProposalConfigPanel · l.1797, when `secHistorial && !(propuestas.length === 0) && each propuestas && p.estado === 'error' && p.error_message`
- `{label} :` — ValidationRow · l.1837
- `{detail}` — ValidationRow · l.1840

**Other texts on screen** (60)

- «Validación MINEDUC» — ProposalConfigPanel · l.761, when `panelOpen && !(!dataLoaded) && selectedFicha && validationResult`
- «Ficha: Folio {selectedFicha.folio} — {selectedFicha.nombre_servicio}» — ProposalConfigPanel · l.763, when `panelOpen && !(!dataLoaded) && selectedFicha && validationResult`
- «Ficha MINEDUC:» — ProposalConfigPanel · l.825, when `!(!dataLoaded) && selectedFicha && validationResult && validationResult.warnings.some(w => w.rule === 6) && objetivoExpanded`
- «Propuesta:» — ProposalConfigPanel · l.831, when `!(!dataLoaded) && selectedFicha && validationResult && validationResult.warnings.some(w => w.rule === 6) && objetivoExpanded`
- «Puede generar» — ProposalConfigPanel · l.865, when `panelOpen && !(!dataLoaded) && selectedFicha && validationResult && validationResult.valid`
- «No puede generar (» — ProposalConfigPanel · l.870, when `panelOpen && !(!dataLoaded) && selectedFicha && validationResult && !(validationResult.valid)`
- «error» — ProposalConfigPanel · l.870, when `panelOpen && !(!dataLoaded) && selectedFicha && validationResult && !(validationResult.valid)`
- «es» — ProposalConfigPanel · l.871, when `panelOpen && !(!dataLoaded) && selectedFicha && validationResult && !(validationResult.valid)`
- «Plantilla» (label) — ProposalConfigPanel · l.881, when `panelOpen && !(!dataLoaded)`
- «Ficha de Servicio» (label) — ProposalConfigPanel · l.896, when `panelOpen && !(!dataLoaded)`
- «La ficha se determina por la plantilla seleccionada» — ProposalConfigPanel · l.914, when `panelOpen && !(!dataLoaded) && plantillaId`
- «{selectedFicha.horas_presenciales} h presenciales registradas · {selectedFicha.destinatarios.join(',…}» — ProposalConfigPanel · l.918, when `panelOpen && !(!dataLoaded) && selectedFicha`
- «Presencial (hrs)» (label) — ProposalConfigPanel · l.937, when `panelOpen && !(!dataLoaded) && secHoras`
- «Online Sincrónica (hrs)» (label) — ProposalConfigPanel · l.951, when `panelOpen && !(!dataLoaded) && secHoras`
- «Online Asincrónica (hrs)» (label) — ProposalConfigPanel · l.965, when `panelOpen && !(!dataLoaded) && secHoras`
- «Subtotal presencial:» — ProposalConfigPanel · l.992, when `panelOpen && !(!dataLoaded) && secHoras`
- «hrs» — ProposalConfigPanel · l.992, when `panelOpen && !(!dataLoaded) && secHoras`
- «(de {selectedFicha.horas_presenc…} registradas)» — ProposalConfigPanel · l.993, when `panelOpen && !(!dataLoaded) && secHoras`
- «Total:» — ProposalConfigPanel · l.996, when `panelOpen && !(!dataLoaded) && secHoras`
- «{totalHoras} hrs» — ProposalConfigPanel · l.997, when `panelOpen && !(!dataLoaded) && secHoras`
- «asíncronas)» — ProposalConfigPanel · l.998, when `panelOpen && !(!dataLoaded) && secHoras`
- «Incluir acceso a Plataforma de Crecimiento» (label) — ProposalConfigPanel · l.1029, when `panelOpen && !(!dataLoaded) && secPlataforma`
- «Beneficios de la plataforma» (label) — ProposalConfigPanel · l.1042, when `panelOpen && !(!dataLoaded) && secPlataforma && plataforma`
- «No hay consultores.» — ProposalConfigPanel · l.1069, when `panelOpen && !(!dataLoaded) && secConsultores && consultores.length === 0`
- «{c.nombre} [✓ en Ficha] {c.titulo} Comité Intl. / Equipo FNE / Asesor Intl.» (label) — ProposalConfigPanel · l.1088, when `!(!dataLoaded) && secConsultores && !(consultores.length === 0) && each consultores`
- «Ficha registra {selectedFicha.equipo_trabajo.length} miembro(s) en equipo de trabajo. Se requieren al menos 2 coincidencias.» — ProposalConfigPanel · l.1127, when `panelOpen && !(!dataLoaded) && secConsultores && selectedFicha?.equipo_trabajo`
- «Valor UF por hora» (label) — ProposalConfigPanel · l.1174, when `panelOpen && !(!dataLoaded) && secPrecio && precioModelo === 'per_hour'`
- «Total calculado» (label) — ProposalConfigPanel · l.1188, when `panelOpen && !(!dataLoaded) && secPrecio && precioModelo === 'per_hour'`
- «UF» — ProposalConfigPanel · l.1192, when `panelOpen && !(!dataLoaded) && secPrecio && precioModelo === 'per_hour'`
- «( {precioUfNum} × {totalHoras} h)» — ProposalConfigPanel · l.1193, when `panelOpen && !(!dataLoaded) && secPrecio && precioModelo === 'per_hour'`
- «Precio fijo (UF)» (label) — ProposalConfigPanel · l.1202, when `panelOpen && !(!dataLoaded) && secPrecio && !(precioModelo === 'per_hour')`
- «Total» (label) — ProposalConfigPanel · l.1216, when `panelOpen && !(!dataLoaded) && secPrecio && !(precioModelo === 'per_hour')`
- «{fixedUfNum.toFixed(2)} UF» — ProposalConfigPanel · l.1219, when `panelOpen && !(!dataLoaded) && secPrecio && !(precioModelo === 'per_hour')`
- «Forma de pago» (label) — ProposalConfigPanel · l.1228, when `panelOpen && !(!dataLoaded) && secPrecio`
- «Detalle de pago» (label) — ProposalConfigPanel · l.1244, when `panelOpen && !(!dataLoaded) && secPrecio`
- «Sin módulos configurados. Use &ldquo;Cargar desde plantilla&rdquo; o agregue manualmente.» — ProposalConfigPanel · l.1289, when `panelOpen && !(!dataLoaded) && secModulos && modulos.length === 0`
- «{mTotal} h» — ProposalConfigPanel · l.1327, when `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos`
- «Presencial» (label) — ProposalConfigPanel · l.1340, when `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos`
- «Sincrónica» (label) — ProposalConfigPanel · l.1354, when `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos`
- «Asincrónica» (label) — ProposalConfigPanel · l.1368, when `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos`
- «Mes» (label) — ProposalConfigPanel · l.1382, when `!(!dataLoaded) && secModulos && !(modulos.length === 0) && each modulos`
- «Suma módulos:» — ProposalConfigPanel · l.1409, when `panelOpen && !(!dataLoaded) && secModulos && !(modulos.length === 0)`
- «{modulos.reduce( (acc, m) => acc + m…} h» — ProposalConfigPanel · l.1410, when `panelOpen && !(!dataLoaded) && secModulos && !(modulos.length === 0)`
- «h total» — ProposalConfigPanel · l.1434, when `panelOpen && !(!dataLoaded) && secModulos && !(modulos.length === 0)`
- «No hay documentos.» — ProposalConfigPanel · l.1453, when `panelOpen && !(!dataLoaded) && secDocumentos && documentos.length === 0`
- «{doc.nombre} {TIPO_LABELS[doc.tipo]} [Vencido — bloquea generación] [Vence {formatDate(doc.fecha_vencimiento)}] [Vence: {formatDate(doc.fecha_vencimiento)}]» (label) — ProposalConfigPanel · l.1468, when `!(!dataLoaded) && secDocumentos && !(documentos.length === 0) && each documentos`
- «Los CVs de los consultores seleccionados se incluyen automáticamente.» — ProposalConfigPanel · l.1525, when `panelOpen && !(!dataLoaded) && secDocumentos`
- «Seleccione una plantilla para continuar» — ProposalConfigPanel · l.1572, when `panelOpen && !(!dataLoaded) && !plantillaId`
- «Seleccione una ficha de servicio» — ProposalConfigPanel · l.1575, when `panelOpen && !(!dataLoaded) && plantillaId && !fichaId`
- «{validationResult.errors.length} error es de validación MINEDUC» — ProposalConfigPanel · l.1578, when `panelOpen && !(!dataLoaded) && validationResult && !validationResult.valid`
- «La generación puede tomar hasta 60 segundos. No cierre la página.» — ProposalConfigPanel · l.1585, when `panelOpen && !(!dataLoaded)`
- «Comparta el enlace y código de acceso con el cliente» — ProposalConfigPanel · l.1603, when `panelOpen && !(!dataLoaded) && lastGenResult`
- «Código de Acceso» (label) — ProposalConfigPanel · l.1609, when `panelOpen && !(!dataLoaded) && lastGenResult`
- «Enlace Web» (label) — ProposalConfigPanel · l.1627, when `panelOpen && !(!dataLoaded) && lastGenResult`
- «{window.location.origin}/propuesta/{lastGenResult.web_slug} / /propuesta/{lastGenResult.web_slug}» — ProposalConfigPanel · l.1629, when `panelOpen && !(!dataLoaded) && lastGenResult`
- «No hay propuestas generadas aún para esta licitación.» — ProposalConfigPanel · l.1688, when `panelOpen && !(!dataLoaded) && secHistorial && propuestas.length === 0`
- «v {p.version}» — ProposalConfigPanel · l.1705, when `!(!dataLoaded) && secHistorial && !(propuestas.length === 0) && each propuestas`
- «vista» — ProposalConfigPanel · l.1736, when `secHistorial && !(propuestas.length === 0) && each propuestas && p.view_count != null && p.view_count > 0`
- «s» — ProposalConfigPanel · l.1736, when `secHistorial && !(propuestas.length === 0) && each propuestas && p.view_count != null && p.view_count > 0`
- «&middot; {formatDateTime(p.viewed_at)}» — ProposalConfigPanel · l.1738, when `!(propuestas.length === 0) && each propuestas && p.view_count != null && p.view_count > 0 && p.viewed_at`

### components/licitaciones/ProposalPreview.tsx

Used by: `/licitaciones/[id]`

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · Vista previa de la propuesta · {pdfUrl} | `!(error) && pdfUrl` |  | ProposalPreview · l.100 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al generar la vista previa» | `setError` |  | ProposalPreview · l.62 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` |  | ProposalPreview · l.44 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `cancelled` | ProposalPreview · l.42 |
| `cancelled` | ProposalPreview · l.54 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 1000)` | ProposalPreview · l.29 |

**Values shown from data** (1)

- `{error}` — ProposalPreview · l.95, when `error`

**Other texts on screen** (4)

- «Vista Previa — refleja el PDF que se generará y descargará» — ProposalPreview · l.86
- «Se actualiza 1 s tras el último cambio» — ProposalPreview · l.88
- «No se pudo generar la vista previa» — ProposalPreview · l.94, when `error`
- «Generando vista previa…» — ProposalPreview · l.109, when `!(error) && loading`

### components/licitaciones/Step3Bases.tsx

Used by: `/licitaciones/[id]`

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{ates.length} ATE s Registro de ATEs» | h3 |  | Step3Bases · l.402 |
| «Editar ATE / Agregar nueva ATE» | h4 | `showAteForm` | Step3Bases · l.430 |
| «Generacion de Bases» | h3 |  | Step3Bases · l.618 |
| «Consultas ( {consultas.length} )» | h3 |  | Step3Bases · l.692 |
| «Avanzar a Recepción de Propuestas» | h3 |  | Step3Bases · l.819 |

**Buttons** (12)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar / Agregar nueva ATE» | `{() => { setShowAteForm(!showAteForm); if (showAteForm) { setEditingAteId(null);…}` |  |  |  | Step3Bases · l.409 |
| «Guardando... / Actualizar ATE / Agregar ATE» | `{handleAddAte}` | `showAteForm` | `{savingAte}` |  | Step3Bases · l.513 |
| «Cancelar» | `{() => { setEditingAteId(null); setAteForm(EMPTY_ATE_FORM); setAteFormErrors({})…}` | `showAteForm && editingAteId` |  |  | Step3Bases · l.524 |
| «Marcar bases enviadas» · aria «{`Marcar bases enviadas a ${ate.nombre_ate}`}» | `{() => handleMarkBasesSent(ate)}` | `ates.length > 0 && each ates && !(ate.fecha_envio_bases)` |  |  | Step3Bases · l.572 |
| «Editar» | `{() => handleEditAte(ate)}` | `ates.length > 0 && each ates` |  |  | Step3Bases · l.584 |
| «[icon Trash2]» · aria «{`Eliminar ATE ${ate.nombre_ate}`}» | `{() => handleDeleteAte(ate)}` | `ates.length > 0 && each ates && !ate.propuesta_url` |  |  | Step3Bases · l.592 |
| «Generando... / Generar Bases (.docx)» | `{handleGenerateBases}` |  | `{!isAdmin \|\| generatingBases}` |  | Step3Bases · l.624 |
| «⌛» · tooltip «Eliminar documento» | `{() => handleDeleteBasesDoc(doc)}` | `basesDocumentos.length > 0 && each basesDocumentos.slice(0, 5) && isAdmin` | `{deletingDocId === doc.id}` |  | Step3Bases · l.661 |
| «Cerrar / Registrar consulta» | `{() => setShowConsultasForm(!showConsultasForm)}` |  |  |  | Step3Bases · l.696 |
| «Guardando... / Registrar consulta» | `{handleAddConsulta}` | `showConsultasForm` | `{savingConsulta}` |  | Step3Bases · l.772 |
| «Cancelar» | `{() => { setShowConsultasForm(false); setConsultaForm(EMPTY_CONSULTA_FORM); }}` | `showConsultasForm` |  |  | Step3Bases · l.779 |
| «Avanzando... / Avanzar a Recepción de Propuestas» | `{handleAdvance}` | `canAdvance` | `{advancing}` |  | Step3Bases · l.826 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Descargar ultima version» | `{lastGeneratedUrl}` (new tab) | `lastGeneratedUrl` |  | Step3Bases · l.636 |

**Fields** (11)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre ATE *» | text | «Nombre de la ATE o empresa» |  | `showAteForm` | `id=ate-nombre (id used by code)` | Step3Bases · l.439 |
| «RUT» | text | «12.345.678-5» |  | `showAteForm` | `id=ate-rut (id used by code)` | Step3Bases · l.453 |
| «Nombre Contacto» | text | «Nombre del representante» |  | `showAteForm` | `id=ate-contacto (id used by code)` | Step3Bases · l.467 |
| «Correo Electronico» | email | «contacto@ate.cl» |  | `showAteForm` | `id=ate-email (id used by code)` | Step3Bases · l.478 |
| «Telefono» | text | «+56 9 1234 5678» |  | `showAteForm` | `id=ate-telefono (id used by code)` | Step3Bases · l.492 |
| «Fecha Solicitud de Bases» | date |  |  | `showAteForm` | `id=ate-fecha-solicitud (id used by code)` | Step3Bases · l.503 |
| «Pregunta *» | textarea | «Ingrese la pregunta de la consulta» |  | `showConsultasForm` | `id=consulta-pregunta (id used by code)` | Step3Bases · l.715 |
| «Respuesta» | textarea | «Ingrese la respuesta (opcional)» |  | `showConsultasForm` | `id=consulta-respuesta (id used by code)` | Step3Bases · l.727 |
| «Fecha Pregunta» | date |  |  | `showConsultasForm` | `id=consulta-fecha-pregunta (id used by code)` | Step3Bases · l.738 |
| «Fecha Respuesta» | date |  |  | `showConsultasForm` | `id=consulta-fecha-respuesta (id used by code)` | Step3Bases · l.748 |
| «ATE (opcional)» | select |  | «-- Sin ATE especifica --», «(lista) {ate.nombre_ate}» | `showConsultasForm` | `id=consulta-ate (id used by code)` | Step3Bases · l.758 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Nombre ATE» | `ates.length > 0` | Step3Bases · l.543 |
| «RUT» | `ates.length > 0` | Step3Bases · l.544 |
| «Contacto» | `ates.length > 0` | Step3Bases · l.545 |
| «Fecha Solicitud» | `ates.length > 0` | Step3Bases · l.546 |
| «Bases Enviadas» | `ates.length > 0` | Step3Bases · l.547 |
| «Acciones» | `ates.length > 0` | Step3Bases · l.548 |

**Browser confirm()** (3)

| Question | When | Where |
|---|---|---|
| «¿Eliminar la ATE "{ate.nombre_ate}"? Esta accion no se puede deshacer.» |  | handleDeleteAte · l.203 |
| «¿Avanzar a Recepción de Propuestas? Esta acción cambiará el estado de la licitación.» |  | handleAdvance · l.321 |
| «¿Eliminar "{doc.file_name}"? Esta accion no se puede deshacer.» |  | handleDeleteBasesDoc · l.354 |

**Toasts** (23)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar datos del Paso 3» |  | Step3Bases · l.107 |
| error | «Error al guardar ATE» | `!res.ok` | handleAddAte · l.161 |
| success | «ATE actualizada / ATE registrada exitosamente» |  | handleAddAte · l.165 |
| error | «Error al guardar ATE» |  | handleAddAte · l.171 |
| error | «Error al marcar bases enviadas» | `!res.ok` | handleMarkBasesSent · l.191 |
| success | «Bases marcadas como enviadas» |  | handleMarkBasesSent · l.195 |
| error | «Error al marcar bases enviadas» |  | handleMarkBasesSent · l.198 |
| error | «Error al eliminar ATE» | `!res.ok` | handleDeleteAte · l.216 |
| success | «ATE eliminada» |  | handleDeleteAte · l.220 |
| error | «Error al eliminar ATE» |  | handleDeleteAte · l.223 |
| error | «Error al generar Bases» | `!res.ok` | handleGenerateBases · l.252 |
| success | «Documento de Bases generado exitosamente» |  | handleGenerateBases · l.256 |
| error | «Error al generar Bases» |  | handleGenerateBases · l.260 |
| error | «La pregunta es requerida» | `!consultaForm.pregunta.trim()` | handleAddConsulta · l.272 |
| error | «Error al registrar consulta» | `!res.ok` | handleAddConsulta · l.294 |
| success | «Consulta registrada exitosamente» |  | handleAddConsulta · l.298 |
| error | «Error al registrar consulta» |  | handleAddConsulta · l.303 |
| error | «Debe marcar las bases como enviadas a al menos una ATE antes de avanzar.» | `atesWithBasesSent.length === 0` | handleAdvance · l.316 |
| error | «Error al avanzar estado» | `!res.ok` | handleAdvance · l.335 |
| success | «Licitacion avanzada a Recepcion de Propuestas» |  | handleAdvance · l.339 |
| error | «Error al avanzar estado» |  | handleAdvance · l.343 |
| success | «Documento eliminado» |  | handleDeleteBasesDoc · l.367 |
| error | «Error al eliminar documento» |  | handleDeleteBasesDoc · l.370 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al eliminar documento» | `throw (shown by whoever catches it)` | `!res.ok` | handleDeleteBasesDoc · l.365 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `method` | «PUT / POST» | handleAddAte · l.150 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Nombre ATE requerido» | Step3Bases · l.124 |
| «RUT invalido. Ingrese un RUT valido (ej: 12.345.678-5)» | Step3Bases · l.127 |
| «Correo electronico invalido» | Step3Bases · l.130 |

**Values shown from data** (10)

- `{ateFormErrors.nombre_ate}` — Step3Bases · l.448, when `showAteForm && ateFormErrors.nombre_ate`
- `{ateFormErrors.rut_ate}` — Step3Bases · l.462, when `showAteForm && ateFormErrors.rut_ate`
- `{ateFormErrors.email}` — Step3Bases · l.487, when `showAteForm && ateFormErrors.email`
- `{ate.nombre_ate}` — Step3Bases · l.555, when `ates.length > 0 && each ates`
- `{ate.email}` — Step3Bases · l.556, when `ates.length > 0 && each ates && ate.email`
- `{ate.rut_ate} / -` — Step3Bases · l.558, when `ates.length > 0 && each ates`
- `{ate.telefono}` — Step3Bases · l.561, when `ates.length > 0 && each ates && ate.telefono`
- `{formatDate(ate.fecha_solicitud_base…}` — Step3Bases · l.563, when `ates.length > 0 && each ates`
- `{doc.file_name}` — Step3Bases · l.656, when `basesDocumentos.length > 0 && each basesDocumentos.slice(0, 5)`
- `{new Date(doc.created_at).toLocaleDa…}` — Step3Bases · l.657, when `basesDocumentos.length > 0 && each basesDocumentos.slice(0, 5)`

**Other texts on screen** (21)

- «Nombre ATE *» (label) — Step3Bases · l.436, when `showAteForm`
- «RUT» (label) — Step3Bases · l.452, when `showAteForm`
- «Nombre Contacto» (label) — Step3Bases · l.466, when `showAteForm`
- «Correo Electronico» (label) — Step3Bases · l.477, when `showAteForm`
- «Telefono» (label) — Step3Bases · l.491, when `showAteForm`
- «Fecha Solicitud de Bases» (label) — Step3Bases · l.502, when `showAteForm`
- «No hay ATEs registradas. Agregue la primera ATE usando el botón anterior.» — Step3Bases · l.609, when `!(ates.length > 0)`
- «Versiones anteriores generadas:» — Step3Bases · l.651, when `basesDocumentos.length > 0`
- «Estado: Bases no generadas. Haga clic en &ldquo;Generar Bases&rdquo; para crear el documento Word.» — Step3Bases · l.682, when `basesDocumentos.length === 0`
- «Pregunta *» (label) — Step3Bases · l.712, when `showConsultasForm`
- «Respuesta» (label) — Step3Bases · l.726, when `showConsultasForm`
- «Fecha Pregunta» (label) — Step3Bases · l.737, when `showConsultasForm`
- «Fecha Respuesta» (label) — Step3Bases · l.747, when `showConsultasForm`
- «ATE (opcional)» (label) — Step3Bases · l.757, when `showConsultasForm`
- «P: {consulta.pregunta}» — Step3Bases · l.793, when `consultas.length > 0 && each consultas`
- «R: {consulta.respuesta}» — Step3Bases · l.797, when `consultas.length > 0 && each consultas && consulta.respuesta`
- «Pregunta: {formatDate(consulta.fecha_pregunta)}» — Step3Bases · l.802, when `consultas.length > 0 && each consultas && consulta.fecha_pregunta`
- «Respuesta: {formatDate(consulta.fecha_respuesta)}» — Step3Bases · l.803, when `consultas.length > 0 && each consultas && consulta.fecha_respuesta`
- «No hay consultas registradas.» — Step3Bases · l.810, when `!(consultas.length > 0)`
- «{atesWithBasesSent.length} ATE s tienen / tiene las bases enviadas. Puede avanzar al siguiente paso.» — Step3Bases · l.822, when `canAdvance`
- «Para avanzar, debe marcar las bases como enviadas a al menos una ATE registrada.» — Step3Bases · l.836, when `!(canAdvance)`

### components/licitaciones/Step4Propuestas.tsx

Used by: `/licitaciones/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{ate.nombre_ate}» | h4 | `each ates` | Step4Propuestas · l.311 |
| «Avanzar a Evaluación» | h3 |  | Step4Propuestas · l.541 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Subiendo... / Subir propuesta» | `{() => handleUploadProposal(ate)}` | `each ates && !(ate.propuesta_url)` | `{state.uploading \|\| !state.file}` |  | Step4Propuestas · l.418 |
| «Agregar ATE» | `{() => setShowNewAteForm(!showNewAteForm)}` |  |  |  | Step4Propuestas · l.445 |
| «Guardando... / Agregar ATE» | `{handleAddNewAte}` | `showNewAteForm` | `{savingNewAte}` |  | Step4Propuestas · l.528 |
| «Cancelar» | `{() => { setShowNewAteForm(false); setNewAteForm(EMPTY_NEW_ATE); }}` | `showNewAteForm` |  |  | Step4Propuestas · l.531 |
| «Avanzando... / Avanzar a Evaluación» | `{handleAdvance}` | `canAdvance` | `{advancing}` |  | Step4Propuestas · l.548 |

**Fields** (8)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Archivo de propuesta (PDF, Word, imagen — max 25MB)» | file | accepts `.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp` |  | `each ates && !(ate.propuesta_url)` | `id=file-ate-{ate.id}` | Step4Propuestas · l.366 |
| «Fecha de la propuesta» | date |  |  | `each ates && !(ate.propuesta_url)` | `id=fecha-propuesta-{ate.id}` | Step4Propuestas · l.388 |
| «Notas (opcional)» | text | «Observaciones sobre la propuesta» |  | `each ates && !(ate.propuesta_url)` | `id=notas-ate-{ate.id}` | Step4Propuestas · l.404 |
| «Nombre ATE *» | text | «Nombre de la ATE» |  | `showNewAteForm` | `id=new-ate-nombre (id used by code)` | Step4Propuestas · l.464 |
| «RUT» | text | «12.345.678-5» |  | `showNewAteForm` | `id=new-ate-rut (id used by code)` | Step4Propuestas · l.478 |
| «Contacto» | text | «Nombre del representante» |  | `showNewAteForm` | `id=new-ate-contacto (id used by code)` | Step4Propuestas · l.492 |
| «Correo» | email | «contacto@ate.cl» |  | `showNewAteForm` | `id=new-ate-email (id used by code)` | Step4Propuestas · l.503 |
| «Telefono» | text | «+56 9 1234 5678» |  | `showNewAteForm` | `id=new-ate-telefono (id used by code)` | Step4Propuestas · l.517 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Avanzar a Evaluación Pendiente? Esta acción cambiará el estado de la licitación.» |  | handleAdvance · l.233 |

**Toasts** (13)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar ATEs» |  | Step4Propuestas · l.81 |
| error | «Seleccione un archivo para subir» | `!state?.file` | handleUploadProposal · l.98 |
| plain | «Advertencia: La fecha de propuesta ({state.fecha_propuesta}) esta fuera del periodo de recepcion ({licitacion.fecha_inicio_pro…} a {licitacion.fecha_limite_pro…}). Puede continuar de todas formas.» | `state.fecha_propuesta && licitacion.fecha_inicio_propuestas && licitacion.fecha_limite_propuestas && (fecha < inicio \|\| fecha > limite)` | handleUploadProposal · l.108 |
| error | «Error al subir propuesta» | `!res.ok` | handleUploadProposal · l.138 |
| success | «Propuesta de {ate.nombre_ate} recibida exitosamente» |  | handleUploadProposal · l.142 |
| error | «Error al subir propuesta» |  | handleUploadProposal · l.157 |
| error | «Error al agregar ATE» | `!res.ok` | handleAddNewAte · l.206 |
| success | «ATE agregada exitosamente» |  | handleAddNewAte · l.210 |
| error | «Error al agregar ATE» |  | handleAddNewAte · l.215 |
| error | «Debe subir al menos una propuesta antes de avanzar a Evaluacion.» | `atesWithProposal.length === 0` | handleAdvance · l.228 |
| error | «Error al avanzar estado» | `!res.ok` | handleAdvance · l.247 |
| success | «Licitacion avanzada a Evaluacion Pendiente» |  | handleAdvance · l.251 |
| error | «Error al avanzar estado» |  | handleAdvance · l.255 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Nombre ATE requerido» | Step4Propuestas · l.173 |
| «RUT invalido. Ingrese un RUT valido (ej: 12.345.678-5)» | Step4Propuestas · l.176 |
| «Correo electronico invalido» | Step4Propuestas · l.179 |

**Values shown from data** (6)

- `{ate.email}` — Step4Propuestas · l.313, when `each ates && ate.email`
- `( {formatFileSize(ate.propuesta_size)} )` — Step4Propuestas · l.334, when `each ates && ate.propuesta_url && ate.propuesta_size`
- `{ate.notas}` — Step4Propuestas · l.343, when `each ates && ate.propuesta_url && ate.notas`
- `{newAteFormErrors.nombre_ate}` — Step4Propuestas · l.473, when `showNewAteForm && newAteFormErrors.nombre_ate`
- `{newAteFormErrors.rut_ate}` — Step4Propuestas · l.487, when `showNewAteForm && newAteFormErrors.rut_ate`
- `{newAteFormErrors.email}` — Step4Propuestas · l.512, when `showNewAteForm && newAteFormErrors.email`

**Other texts on screen** (21)

- «de» — Step4Propuestas · l.287
- «ATEs con propuesta recibida.» — Step4Propuestas · l.287
- «Fecha limite: {formatDate(licitacion.fecha_limite_…}» — Step4Propuestas · l.289, when `licitacion.fecha_limite_propuestas`
- «RUT: {ate.rut_ate}» — Step4Propuestas · l.312, when `each ates && ate.rut_ate`
- «Propuesta recibida» — Step4Propuestas · l.318, when `each ates && ate.propuesta_url`
- «Sin propuesta» — Step4Propuestas · l.322, when `each ates && !(ate.propuesta_url)`
- «{ate.propuesta_filename} / Propuesta» — Step4Propuestas · l.332, when `each ates && ate.propuesta_url`
- «Fecha de propuesta: {formatDate(ate.fecha_propuesta)}» — Step4Propuestas · l.338, when `each ates && ate.propuesta_url && ate.fecha_propuesta`
- «La fecha seleccionada ( {state.fecha_propuesta} ) es posterior al limite de propuestas ( {licitacion.fecha_limite_propuestas} ). La propuesta se registrara de todas formas.» — Step4Propuestas · l.354, when `each ates && !(ate.propuesta_url) && state.fecha_propuesta && licitacion.fecha_limite_propuestas && new Date(state.fecha_propuesta) > new Date(licitacion.fecha_limite_propuestas)`
- «Archivo de propuesta (PDF, Word, imagen — max 25MB)» (label) — Step4Propuestas · l.363, when `each ates && !(ate.propuesta_url)`
- «Fecha de la propuesta» (label) — Step4Propuestas · l.385, when `each ates && !(ate.propuesta_url)`
- «Notas (opcional)» (label) — Step4Propuestas · l.401, when `each ates && !(ate.propuesta_url)`
- «No hay ATEs registradas. Agregue una ATE para poder subir propuestas.» — Step4Propuestas · l.437, when `ates.length === 0`
- «¿Necesita agregar una ATE que no estaba en el Paso 3?» — Step4Propuestas · l.444
- «Nombre ATE *» (label) — Step4Propuestas · l.461, when `showNewAteForm`
- «RUT» (label) — Step4Propuestas · l.477, when `showNewAteForm`
- «Contacto» (label) — Step4Propuestas · l.491, when `showNewAteForm`
- «Correo» (label) — Step4Propuestas · l.502, when `showNewAteForm`
- «Telefono» (label) — Step4Propuestas · l.516, when `showNewAteForm`
- «{atesWithProposal.length} ATE s tienen / tiene propuesta recibida. Puede avanzar al siguiente paso.» — Step4Propuestas · l.544, when `canAdvance`
- «Para avanzar a Evaluación, debe subir al menos una propuesta de ATE.» — Step4Propuestas · l.558, when `!(canAdvance)`

### components/licitaciones/Step6Adjudicacion.tsx

Used by: `/licitaciones/[id]`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «1. Seleccion del Ganador» | h3 |  | Step6Adjudicacion · l.318 |
| «2. Datos de la Adjudicacion» | h3 |  | Step6Adjudicacion · l.366 |
| «3. Documentos» | h3 |  | Step6Adjudicacion · l.454 |
| «4. Confirmacion FNE» | h3 |  | Step6Adjudicacion · l.528 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Guardando... / Guardar Adjudicacion» | `{handleSave}` |  | `{saving \|\| !selectedAteId}` |  | Step6Adjudicacion · l.456 |
| «Generando... / Generar Carta de Adjudicacion» | `{handleGenerateCarta}` |  | `{!isAdmin \|\| generatingCarta \|\| !selectedAteId}` |  | Step6Adjudicacion · l.467 |
| «Subiendo... / Subir Carta Firmada» | `{() => fileInputRef.current?.click()}` | `!(cartaSigned)` | `{uploadingCarta}` |  | Step6Adjudicacion · l.511 |
| «Procesando... / Si — Proveedor FNE (genera Contrato)» | `{() => handleConfirm(true)}` |  | `{confirming \|\| !selectedAteId \|\| !cartaReady}` |  | Step6Adjudicacion · l.535 |
| «Procesando... / No — Proveedor Externo (cerrar proceso)» | `{() => handleConfirm(false)}` |  | `{confirming \|\| !selectedAteId}` |  | Step6Adjudicacion · l.542 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Carta generada — descargar» | `{cartaUrl}` (new tab) | `cartaUrl` |  | Step6Adjudicacion · l.482 |

**Fields** (8)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{ate.nombre_ate} [Mayor puntaje] [Puntaje total: {Number(ate.puntaje_total).toFixed(1)}]» | radio | `ganador-ate` |  | `each sortedAtes` |  | Step6Adjudicacion · l.331 |
| «Monto adjudicado (UF)» | number | «100.00» · `min={0} step={0.01}` |  |  | `id=monto-uf (id used by code)` | Step6Adjudicacion · l.374 |
| «Fecha de la oferta ganadora» | date |  |  |  | `id=fecha-oferta (id used by code)` | Step6Adjudicacion · l.389 |
| «Condiciones de pago» | textarea | «Detalle las condiciones de pago acordadas...» |  |  | `id=condiciones (id used by code)` | Step6Adjudicacion · l.401 |
| «Nombre coordinacion» | text | «Director / Jefe de UTP» |  |  | `id=contacto-nombre (id used by code)` | Step6Adjudicacion · l.414 |
| «Correo coordinacion» | email | «coordinacion@escuela.cl» |  |  | `id=contacto-email (id used by code)` | Step6Adjudicacion · l.427 |
| «Telefono coordinacion» | text | «+56 9 1234 5678» |  |  | `id=contacto-telefono (id used by code)` | Step6Adjudicacion · l.440 |
|  | file | accepts `.pdf,.png,.jpg,.jpeg` |  | `!(cartaSigned)` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=carta-upload` | Step6Adjudicacion · l.500 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «{msg}» |  | handleConfirm · l.236 |

**Toasts** (15)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar ATEs» |  | Step6Adjudicacion · l.95 |
| error | «Debe seleccionar un ATE ganador» | `!selectedAteId` | saveAdjudicacion · l.113 |
| error | «Error al guardar adjudicacion» | `!res.ok` | saveAdjudicacion · l.137 |
| success | «Datos de adjudicacion guardados» |  | saveAdjudicacion · l.141 |
| error | «Error al guardar adjudicacion» |  | saveAdjudicacion · l.144 |
| error | «Guarde primero los datos de adjudicacion» | `!selectedAteId` | handleGenerateCarta · l.161 |
| error | «Error al generar la Carta» | `!res.ok` | handleGenerateCarta · l.175 |
| success | «Carta de Adjudicacion generada exitosamente» |  | handleGenerateCarta · l.180 |
| error | «Error al generar la Carta» |  | handleGenerateCarta · l.186 |
| error | «Error al subir la Carta» | `!res.ok` | handleUploadCarta · l.213 |
| success | «Carta firmada subida exitosamente» |  | handleUploadCarta · l.218 |
| error | «Error al subir la Carta» |  | handleUploadCarta · l.221 |
| error | «Error al confirmar adjudicacion» | `!res.ok` | handleConfirm · l.248 |
| success | «Adjudicacion confirmada. Estado: Contrato Pendiente / Adjudicacion externa confirmada» |  | handleConfirm · l.252 |
| error | «Error al confirmar adjudicacion» |  | handleConfirm · l.259 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{json.data.url}` | `window.open` | `json.data.url` | handleGenerateCarta · l.183 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `msg` | «¿Confirmar que el ATE es proveedor FNE? El estado cambiara a "Contrato Pendiente". / ¿Confirmar adjudicacion a proveedor externo? El estado cambiara a "Adjudicada (Externa)".» | handleConfirm · l.232 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Carta firmada — {licitacion.numero_licitacion}» | Step6Adjudicacion · l.204 |

**Values shown from data** (2)

- `{winner.nombre_ate}` — Step6Adjudicacion · l.280, when `!isEditable && winner`
- `{licitacion.condiciones_pago}` — Step6Adjudicacion · l.291, when `!isEditable && licitacion.condiciones_pago`

**Other texts on screen** (16)

- «Adjudicacion completada» — Step6Adjudicacion · l.275, when `!isEditable`
- «ATE Ganador» — Step6Adjudicacion · l.279, when `!isEditable && winner`
- «Monto: $ {Number(winner.monto_propuesto).toLo…} CLP» — Step6Adjudicacion · l.282, when `!isEditable && winner && winner.monto_propuesto`
- «Condiciones de pago» — Step6Adjudicacion · l.290, when `!isEditable && licitacion.condiciones_pago`
- «{ate.nombre_ate} [Mayor puntaje] [Puntaje total: {Number(ate.puntaje_total).toFixed(1)}]» (label) — Step6Adjudicacion · l.323, when `each sortedAtes`
- «No hay ATEs evaluadas. Complete el Paso 5 primero.» — Step6Adjudicacion · l.358, when `ates.length === 0`
- «Monto adjudicado (UF)» (label) — Step6Adjudicacion · l.371
- «Fecha de la oferta ganadora» (label) — Step6Adjudicacion · l.386
- «Condiciones de pago» (label) — Step6Adjudicacion · l.398
- «Nombre coordinacion» (label) — Step6Adjudicacion · l.411
- «Correo coordinacion» (label) — Step6Adjudicacion · l.424
- «Telefono coordinacion» (label) — Step6Adjudicacion · l.437
- «Suba la Carta de Adjudicacion firmada (PDF o imagen).» — Step6Adjudicacion · l.491
- «Carta firmada subida» — Step6Adjudicacion · l.496, when `cartaSigned`
- «¿El ATE adjudicado es proveedor registrado en FNE?» — Step6Adjudicacion · l.532
- «Genere la Carta de adjudicación antes de confirmar la adjudicación.» — Step6Adjudicacion · l.552, when `!cartaReady`

### components/licitaciones/Step7Contrato.tsx

Used by: `/licitaciones/[id]`

**Buttons** (6)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Generando... / Generar Carta de adjudicación» | `{handleGenerateCarta}` | `estado === 'contrato_pendiente' && ganador_es_fne && !carta_adjudicacion_url && isAdmin` | `{generatingCarta}` |  | Step7Contrato · l.184 |
| «Generar Contrato» | `{() => router.push('/contracts?tab=nuevo&licitacion_id=${licitacion.id}')}` | `estado === 'contrato_pendiente' && ganador_es_fne && isAdmin` | `{!canGenerateContract}` |  | Step7Contrato · l.204 |
| «Subiendo... / Seleccionar Archivo» | `{() => fileInputRef.current?.click()}` | `estado === 'adjudicada_externo'` | `{uploading}` |  | Step7Contrato · l.322 |
| «Cerrar Licitacion» | `{() => setShowCloseConfirm(true)}` | `estado === 'adjudicada_externo' && !showCloseConfirm` |  |  | Step7Contrato · l.341 |
| «Cerrando... / Confirmar Cierre» | `{handleClose}` | `estado === 'adjudicada_externo' && !(!showCloseConfirm)` | `{closing}` |  | Step7Contrato · l.356 |
| «Cancelar» | `{() => setShowCloseConfirm(false)}` | `estado === 'adjudicada_externo' && !(!showCloseConfirm)` | `{closing}` |  | Step7Contrato · l.363 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver Contrato» | `/contracts?contrato_id=[*]` | `estado === 'contrato_generado' && contrato_id` |  | Step7Contrato · l.261 |
| «Ver Contrato Vinculado» | `/contracts?contrato_id=[*]` | `estado === 'cerrada' && contrato_id` |  | Step7Contrato · l.418 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | file | accepts `.pdf,.doc,.docx,.png,.jpg,.jpeg` |  | `estado === 'adjudicada_externo'` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | Step7Contrato · l.329 |

**Toasts** (7)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Documento subido exitosamente» |  | handleUploadDocument · l.78 |
| error | «Error al subir documento» |  | handleUploadDocument · l.81 |
| error | «Error al generar la Carta» | `!res.ok` | handleGenerateCarta · l.106 |
| success | «Carta de Adjudicacion generada exitosamente» |  | handleGenerateCarta · l.109 |
| error | «Error al generar la Carta» |  | handleGenerateCarta · l.115 |
| success | «Licitacion cerrada exitosamente» |  | handleClose · l.139 |
| error | «Error al cerrar licitacion» |  | handleClose · l.143 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al subir documento» | `throw (shown by whoever catches it)` | `!res.ok` | handleUploadDocument · l.75 |
| «Error al cerrar licitacion» | `throw (shown by whoever catches it)` | `!res.ok` | handleClose · l.136 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `{json.data.url}` | `window.open` | `json.data?.url` | handleGenerateCarta · l.111 |
| `/contracts?tab=nuevo&licitacion_id=[*]` | `router.push` | `estado === 'contrato_pendiente' && ganador_es_fne && isAdmin` | Step7Contrato · l.206 |

**Values shown from data** (4)

- `{new Date(licitacion.fecha_adjudicac…}` — Step7Contrato · l.276, when `estado === 'contrato_generado' && licitacion.fecha_adjudicacion`
- `{licitacion.tipo_moneda} {licitacion.monto_adjudicado_uf.toLo…}` — Step7Contrato · l.284, when `estado === 'contrato_generado' && licitacion.monto_adjudicado_uf`
- `{new Date(licitacion.fecha_adjudicac…}` — Step7Contrato · l.403, when `estado === 'cerrada' && licitacion.fecha_adjudicacion`
- `{licitacion.tipo_moneda} {licitacion.monto_adjudicado_uf.toLo…}` — Step7Contrato · l.411, when `estado === 'cerrada' && licitacion.monto_adjudicado_uf`

**Other texts on screen** (23)

- «Contrato Pendiente — ATE FNE» — Step7Contrato · l.166, when `estado === 'contrato_pendiente' && ganador_es_fne`
- «La licitacion fue adjudicada a un ATE de FNE. El siguiente paso es generar el contrato en el modulo de contratos.» — Step7Contrato · l.170, when `estado === 'contrato_pendiente' && ganador_es_fne`
- «Falta la Carta de adjudicación generada. Debe generarse antes de generar el contrato.» — Step7Contrato · l.181, when `estado === 'contrato_pendiente' && ganador_es_fne && !carta_adjudicacion_url`
- «Un administrador debe generar la Carta de adjudicación para continuar.» — Step7Contrato · l.194, when `estado === 'contrato_pendiente' && ganador_es_fne && !carta_adjudicacion_url && !(isAdmin)`
- «(Genere la Carta de adjudicación para habilitar)» — Step7Contrato · l.216, when `estado === 'contrato_pendiente' && ganador_es_fne && isAdmin && !carta_adjudicacion_url`
- «Solo los administradores pueden generar contratos desde esta vista.» — Step7Contrato · l.224, when `estado === 'contrato_pendiente' && ganador_es_fne && !isAdmin`
- «Contrato Generado» — Step7Contrato · l.243, when `estado === 'contrato_generado'`
- «El contrato ha sido generado y vinculado a esta licitacion.» — Step7Contrato · l.247, when `estado === 'contrato_generado'`
- «Contrato Vinculado» — Step7Contrato · l.257, when `estado === 'contrato_generado' && contrato_id`
- «Ver detalles del contrato en el modulo de contratos» — Step7Contrato · l.258, when `estado === 'contrato_generado' && contrato_id`
- «Fecha adjudicacion:» — Step7Contrato · l.275, when `estado === 'contrato_generado' && licitacion.fecha_adjudicacion`
- «Monto adjudicado:» — Step7Contrato · l.283, when `estado === 'contrato_generado' && licitacion.monto_adjudicado_uf`
- «Adjudicada a Proveedor Externo» — Step7Contrato · l.306, when `estado === 'adjudicada_externo'`
- «La licitacion fue adjudicada a un proveedor externo a FNE. Suba los documentos finales y luego cierre la licitacion.» — Step7Contrato · l.310, when `estado === 'adjudicada_externo'`
- «Suba documentos finales (contrato externo, resoluciones, etc.)» — Step7Contrato · l.319, when `estado === 'adjudicada_externo'`
- «PDF, Word o imagen — max 25 MB» — Step7Contrato · l.321, when `estado === 'adjudicada_externo'`
- «¿Confirmar cierre de la licitacion?» — Step7Contrato · l.350, when `estado === 'adjudicada_externo' && !(!showCloseConfirm)`
- «Esta accion es irreversible. La licitacion quedara en estado &quot;Cerrada&quot;.» — Step7Contrato · l.353, when `estado === 'adjudicada_externo' && !(!showCloseConfirm)`
- «Licitacion Cerrada» — Step7Contrato · l.390, when `estado === 'cerrada'`
- «Esta licitacion ha sido cerrada. No se pueden realizar mas acciones.» — Step7Contrato · l.394, when `estado === 'cerrada'`
- «Fecha adjudicacion:» — Step7Contrato · l.402, when `estado === 'cerrada' && licitacion.fecha_adjudicacion`
- «Monto adjudicado:» — Step7Contrato · l.410, when `estado === 'cerrada' && licitacion.monto_adjudicado_uf`
- «Este paso estara disponible cuando la licitacion sea adjudicada.» — Step7Contrato · l.439

### components/propuestas-web/BucketDistribution.tsx

Used by: `/propuesta/[slug]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Distribución de Actividades» | h2 |  | BucketDistribution · l.35 |
| «{bucket.label}» | h3 | `each buckets` | BucketDistribution · l.46 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!buckets \|\| buckets.length === 0` | BucketDistribution · l.22 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `DIST_LABELS` | «Taller», «Sesiones regulares», «Flexible» | l.4 |
| `MOD_LABELS` | «Presencial», «Online», «Asincrónico», «Híbrido» | l.10 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `id=actividades` | BucketDistribution · l.31 |

**Values shown from data** (5)

- `{DIST_LABELS[bucket.distributionType]} / {bucket.distributionType}` — BucketDistribution · l.50, when `each buckets`
- `{MOD_LABELS[bucket.modalidad]} / {bucket.modalidad}` — BucketDistribution · l.53, when `each buckets`
- `{bucket.hours}` — BucketDistribution · l.60, when `each buckets`
- `{bucket.notes}` — BucketDistribution · l.68, when `each buckets && bucket.notes`
- `{hours} {MOD_LABELS[mod]} / {mod}` — BucketDistribution · l.85, when `each Object.entries(byMod)`

**Other texts on screen** (5)

- «Programa de Actividades» — BucketDistribution · l.34
- «Personalizada» — BucketDistribution · l.56, when `each buckets && bucket.isCustom`
- «hrs» — BucketDistribution · l.62, when `each buckets`
- «Total Actividades» — BucketDistribution · l.79
- «{grandTotal} hrs» — BucketDistribution · l.81

### components/propuestas-web/BucketTimeline.tsx

Used by: `/propuesta/[slug]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Línea de Tiempo del Programa» | h3 |  | BucketTimeline · l.32 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!buckets \|\| buckets.length === 0` | BucketTimeline · l.24 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `DIST_STYLE` | «Taller», «Recurrente», «Flexible» | l.6 |

**Values shown from data** (1)

- `{bucket.label}` — BucketTimeline · l.62, when `each buckets`

**Other texts on screen** (6)

- «Mes {m}» — BucketTimeline · l.41, when `each months`
- «{bucket.hours} hrs · {style.label}» — BucketTimeline · l.65, when `each buckets`
- «{bucket.hours} h» — BucketTimeline · l.87, when `each buckets && each months && isActive && bucket.distributionType === 'bloque'`
- «Taller / Evento puntual» — BucketTimeline · l.107
- «Sesiones recurrentes» — BucketTimeline · l.111
- «Disponible todo el programa» — BucketTimeline · l.115

### components/propuestas-web/ConsultantCard.tsx

Used by: `/propuesta/[slug]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{consultant.nombre}» | h3 |  | ConsultantCard · l.50 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver menos / Ver más» | `{() => setExpanded(!expanded)}` | `hasDetails` |  |  | ConsultantCard · l.59 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image · alt {consultant.nombre} · {consultant.fotoPath} | `consultant.fotoPath` |  | ConsultantCard · l.35 |

**Values shown from data** (5)

- `{initialsForName(consultant.nombre)}` — ConsultantCard · l.45, when `!(consultant.fotoPath)`
- `{consultant.titulo}` — ConsultantCard · l.51
- `{consultant.bio}` — ConsultantCard · l.55
- `{item.degree} — {item.institution} ( {item.year} )` — ConsultantCard · l.78, when `hasDetails && expanded && consultant.formacion && consultant.formacion.length > 0 && each consultant.formacion`
- `{item}` — ConsultantCard · l.110, when `hasDetails && expanded && consultant.especialidades && consultant.especialidades.length > 0 && each consultant.especialidades`

**Other texts on screen** (4)

- «Formación» — ConsultantCard · l.74, when `hasDetails && expanded && consultant.formacion && consultant.formacion.length > 0`
- «Experiencia» — ConsultantCard · l.90, when `hasDetails && expanded && consultant.experiencia && consultant.experiencia.length > 0`
- «{item.cargo} en {item.empresa}» — ConsultantCard · l.94, when `hasDetails && expanded && consultant.experiencia && consultant.experiencia.length > 0 && each consultant.experiencia`
- «Especialidades» — ConsultantCard · l.106, when `hasDetails && expanded && consultant.especialidades && consultant.especialidades.length > 0`

### components/propuestas-web/ContentBlockSection.tsx

Used by: `/propuesta/[slug]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{section.text}» | h3 | `section.type === 'heading'` | renderSection · l.144 |
| «{block.titulo}» | h2 |  | ContentBlockSection · l.314 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image · alt {section.text \|\| block.titulo} · {section.path} | `section.type === 'image' && section.path` |  | renderSection · l.289 |
| Image · {editorialPlate.src} | `editorialPlate` |  | ContentBlockSection · l.320 |
| Image · alt {img.alt} · {img.path} | `block.imagenes && block.imagenes.length > 0 && each block.imagenes .filter((img) => img.path)` |  | ContentBlockSection · l.342 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TITLE_IMAGE_MAP` | «Estadías INSPIRA», «Barcelona», «Sagrada Familia» | l.7 |

**Values shown from data** (12)

- `{text}` — InsightCard · l.111
- `{firstChar} {restText}` — renderSection · l.161, when `section.type === 'paragraph' && isFirst`
- `{text.slice(firstSentence.length).tr…}` — renderSection · l.181, when `section.type === 'paragraph' && showAsInsight && (text.length > (firstSentence?.length \|\| 0) + 10)`
- `{numbered.lead} :` — renderSection · l.197, when `section.type === 'paragraph' && numbered && numbered.lead`
- `{String(i + 1).padStart(2, '0')}` — renderSection · l.205, when `section.type === 'paragraph' && numbered && each numbered.items`
- `{item}` — renderSection · l.208, when `section.type === 'paragraph' && numbered && each numbered.items`
- `{boldPart}` — renderSection · l.226, when `section.type === 'paragraph' && boldPart`
- `{String(i + 1).padStart(2, '0')}` — renderSection · l.255, when `section.type === 'list' && isStepCandidate && each items`
- `{item}` — renderSection · l.258, when `section.type === 'list' && isStepCandidate && each items`
- `{String(i + 1).padStart(2, '0')}` — renderSection · l.273, when `section.type === 'list' && each items`
- `{item}` — renderSection · l.276, when `section.type === 'list' && each items`
- `{String(index + 1).padStart(2, '0')}` — ContentBlockSection · l.311

**Other texts on screen** (1)

- «&ldquo; {text.replace(/[.!?]+$/, '')} &rdquo;» — PullQuote · l.99

### components/propuestas-web/DocumentCard.tsx

Used by: `/propuesta/[slug]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{document.nombre}» | h4 |  | DocumentCard · l.28 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Descargando... / Descargar» | `{() => onDownload(document.id)}` |  | `{downloading}` |  | DocumentCard · l.35 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TIPO_LABELS` | «Certificado», «Carta de Recomendación», «Evaluaciones de Clientes», «Ficha de Servicio», «Documento» | l.4 |

**Values shown from data** (2)

- `{typeLabel}` — DocumentCard · l.29
- `{document.descripcion}` — DocumentCard · l.31, when `document.descripcion`

### components/propuestas-web/DownloadablesSection.tsx

Used by: `/propuesta/[slug]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Documentos de Respaldo» | h2 |  | DownloadablesSection · l.115 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Generando ZIP... / Descargar propuesta y documentos (.zip)» | `{handleDownloadZip}` |  | `{downloadingZip}` |  | DownloadablesSection · l.120 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al descargar el documento» |  | handleDownload · l.54 |
| success | «ZIP descargado» |  | handleDownloadZip · l.88 |
| plain | «No se pudieron incluir {skippedCount} documento{skippedCount === 1 ? '' : '…}{detail}» | `skippedCount > 0` | handleDownloadZip · l.97 |
| error | «Error al descargar ZIP» |  | handleDownloadZip · l.103 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al descargar» | `throw (shown by whoever catches it)` | `!res.ok` | handleDownload · l.48 |
| «Error al descargar ZIP» | `throw (shown by whoever catches it)` | `!res.ok` | handleDownloadZip · l.71 |

**Downloads and printing** (2)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` |  | handleDownloadZip · l.75 |
| `archivo: {filename}` |  | handleDownloadZip · l.82 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{json.data.url}` | `window.open` |  | handleDownload · l.52 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `documents.length === 0` | DownloadablesSection · l.29 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DocumentCard` |  | `each sorted` |  | DownloadablesSection · l.141 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `detail` | «: {names.join(', ')}» | handleDownloadZip · l.96 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `id=documentos` | DownloadablesSection · l.110 |

**Other texts on screen** (1)

- «Anexos» — DownloadablesSection · l.114

### components/propuestas-web/PricingSection.tsx

Used by: `/propuesta/[slug]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Propuesta Económica» | h2 |  | PricingSection · l.21 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `id=propuesta-economica` | PricingSection · l.15 |

**Values shown from data** (3)

- `{totalUf.toFixed(2)}` — PricingSection · l.31
- `{pricing.formaPago}` — PricingSection · l.41, when `pricing.formaPago`
- `{pricing.formaPagoDetalle}` — PricingSection · l.43, when `pricing.formaPago && pricing.formaPagoDetalle`

**Other texts on screen** (5)

- «UF» — PricingSection · l.16
- «Inversión» — PricingSection · l.20
- «Inversión Total» — PricingSection · l.28
- «UF» — PricingSection · l.32
- «Forma de Pago» — PricingSection · l.40, when `pricing.formaPago`

### components/propuestas-web/ProposalPublicView.tsx

Used by: `/propuesta/[slug]`

**Titles** (8)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{snapshot.serviceName}» | h1 |  | ProposalPublicView · l.224 |
| «Índice» | h2 |  | ProposalPublicView · l.251 |
| «Fundación Nueva Educación» | h2 |  | ProposalPublicView · l.270 |
| «Modelo de Consultoría» | h2 |  | ProposalPublicView · l.307 |
| «{phase.title}» | h3 | `each PHASES` | ProposalPublicView · l.313 |
| «Equipo de Consultoría» | h2 | `fneConsultants.length > 0` | ProposalPublicView · l.326 |
| «Asesores Internacionales» | h2 |  | ProposalPublicView · l.341 |
| «¿Tienes preguntas?» | h2 |  | ProposalPublicView · l.409 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Generando... / Descargar PDF» | `{handleDownloadPDF}` |  | `{generatingPdf}` |  | ProposalPublicView · l.429 |

**Links** (5)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{String(index + 1).padStart(2, '0')} {section.label}» · tooltip «{section.label}» | `#[*]` | `each indexSections` |  | ProposalPublicView · l.206 |
| «{String(index + 1).padStart(2, '0')} {section.label}» | `#[*]` | `each indexSections` |  | ProposalPublicView · l.255 |
| «Email {FNE_CONTACT_EMAIL}» | `mailto:[*]` |  |  | ProposalPublicView · l.416 |
| «Teléfono +56 9 4162 3577» | `tel:+56941623577` |  |  | ProposalPublicView · l.421 |
| «Contactar» | `mailto:[*]` |  |  | ProposalPublicView · l.438 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image · alt Fundación Nueva Educación · /logos/fne-logo-bw.png |  |  | ProposalPublicView · l.182 |
| Image · alt {school.name} · {school.src} | `each REFERENCE_SCHOOLS` |  | ProposalPublicView · l.358 |
| Image · alt Fundación Nueva Educación · /logos/fne-logo-gold.png |  |  | ProposalPublicView · l.448 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «PDF descargado» |  | handleDownloadPDF · l.91 |
| error | «Error al generar el PDF» |  | handleDownloadPDF · l.94 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ConsultantCard` |  | `fneConsultants.length > 0 && each fneConsultants` |  | ProposalPublicView · l.330 |
| `ConsultantCard` |  | `each INTERNATIONAL_ADVISORS` |  | ProposalPublicView · l.346 |
| `ContentBlockSection` | sectionId: contenido-{index + 1} | `each snapshot.contentBlocks` |  | ProposalPublicView · l.381 |
| `BucketDistribution` |  | `hasBuckets` |  | ProposalPublicView · l.390 |
| `BucketTimeline` |  | `hasBuckets` |  | ProposalPublicView · l.395 |
| `PricingSection` |  |  |  | ProposalPublicView · l.400 |
| `DownloadablesSection` |  | `hasDocuments` |  | ProposalPublicView · l.403 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (5)

| Name | Texts | Where |
|---|---|---|
| `CONSULTANT_PHOTOS` | «Arnoldo Cisternas», «Gabriela Naranjo», «Ignacio» | l.35 |
| `PHASES` | «Inicia», «Diagnóstico y levantamiento de necesidades. Identificamos las áreas de mejora y establecemos la línea base.», «Inspira», «Formación y acompañamiento. Implementamos programas de desarrollo profesional contextualizados.», «Evoluciona», «Consolidación y autonomía. Aseguramos la sostenibilidad de los cambios y la transferencia de capacidades.» | l.41 |
| `REFERENCE_SCHOOLS` | «Escola Virolai», «Coral Regí · Sandra Entrena», «Escola Sadako», «Jordi Mussons», «IE Les Vinyes», «Sergi Del Moral · Betlem Cuesta», «Escola El Puig», «Carol Giralt», «Escola Octavio Paz», «Ana Vicálvaro», «Institut Angeleta Ferrer», «Abraham De La Fuente» | l.62 |
| `programLabel` | «Programa Evoluciona / Programa Preparación» | ProposalPublicView · l.100 |
| `sections` | «Fundación Nueva Educación», «Modelo de Consultoría» | ProposalPublicView · l.120 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Distribución de Actividades» | ProposalPublicView · l.136 |
| «Línea de Tiempo del Programa» | ProposalPublicView · l.137 |
| «Propuesta Económica» | ProposalPublicView · l.140 |
| «Documentos de Respaldo» | ProposalPublicView · l.143 |
| «Años de experiencia» | ProposalPublicView · l.288 |
| «Países» | ProposalPublicView · l.289 |
| «Colegios acompañados» | ProposalPublicView · l.290 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (10)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('scroll')` | ProposalPublicView · l.168 |
| listener | `window.addEventListener('resize')` | ProposalPublicView · l.169 |
| mark | `id=hero` | ProposalPublicView · l.219 |
| mark | `id=indice` | ProposalPublicView · l.247 |
| mark | `id=about` | ProposalPublicView · l.266 |
| mark | `id=model` | ProposalPublicView · l.303 |
| mark | `id=team` | ProposalPublicView · l.322 |
| mark | `id=advisors` | ProposalPublicView · l.337 |
| mark | `id=timeline` | ProposalPublicView · l.393 |
| mark | `id=contacto` | ProposalPublicView · l.406 |

**Values shown from data** (14)

- `{snapshot.schoolName}` — ProposalPublicView · l.191
- `{snapshot.programYear}` — ProposalPublicView · l.193
- `{programLabel}` — ProposalPublicView · l.223
- `{snapshot.schoolName}` — ProposalPublicView · l.227
- `{snapshot.programYear}` — ProposalPublicView · l.229
- `{snapshot.cliente.ciudad}` — ProposalPublicView · l.233, when `snapshot.cliente?.ciudad`
- `{snapshot.destinatarios.join(', ')}` — ProposalPublicView · l.239, when `snapshot.destinatarios && snapshot.destinatarios.length > 0`
- `{stat.value}` — ProposalPublicView · l.294, when `each [ { icon: Award, value: '6+', label: 'Años de exp…`
- `{stat.label}` — ProposalPublicView · l.295, when `each [ { icon: Award, value: '6+', label: 'Años de exp…`
- `{phase.number}` — ProposalPublicView · l.312, when `each PHASES`
- `{phase.description}` — ProposalPublicView · l.314, when `each PHASES`
- `{school.name}` — ProposalPublicView · l.366, when `each REFERENCE_SCHOOLS`
- `{school.leader}` — ProposalPublicView · l.370, when `each REFERENCE_SCHOOLS && school.leader`
- `{snapshot.fichaObjetivo}` — ProposalPublicView · l.461, when `snapshot.fichaObjetivo`

**Other texts on screen** (17)

- «Índice de secciones» (aria-label) — ProposalPublicView · l.202
- «Índice» — ProposalPublicView · l.203
- «Evoluciona / Preparación» — ProposalPublicView · l.220
- «Contenido» — ProposalPublicView · l.250
- «Quiénes Somos» — ProposalPublicView · l.269
- «Desde 2018, la Fundación Nueva Educación trabaja por la transformación de comunidades educativas a través de la formación docente, el liderazgo escolar y la innovación pedagógica.» — ProposalPublicView · l.275
- «Nuestro equipo de consultores expertos diseña programas a medida que responden a las necesidades específicas de cada comunidad educativa, combinando metodologías probadas con enfoques innovadores.» — ProposalPublicView · l.281
- «Nuestro Enfoque» — ProposalPublicView · l.306
- «Equipo Asignado» — ProposalPublicView · l.325, when `fneConsultants.length > 0`
- «Red Internacional» — ProposalPublicView · l.340
- «Centros de Referencia en Barcelona» — ProposalPublicView · l.352
- «Contacto» — ProposalPublicView · l.408
- «Nuestro equipo está disponible para resolver tus dudas y acompañarte en el proceso de toma de decisiones.» — ProposalPublicView · l.411
- «Transformando comunidades educativas» — ProposalPublicView · l.456
- «{snapshot.ficha.nombre_servicio} — {snapshot.ficha.dimension} · {snapshot.ficha.categoria} · Folio {snapshot.ficha.folio}» — ProposalPublicView · l.470, when `((snapshot.ficha \|\| snapshot.licitacion)) && snapshot.ficha`
- «Licitación {snapshot.licitacion.numero} — {snapshot.licitacion.nombre} ( {snapshot.licitacion.year} )» — ProposalPublicView · l.477, when `((snapshot.ficha \|\| snapshot.licitacion)) && snapshot.licitacion`
- «&copy; {new Date().getFullYear()} Fundación Nueva Educación. Todos los derechos reservados.» — ProposalPublicView · l.484

### components/propuestas-web/ProposalUnlockScreen.tsx

Used by: `/propuesta/[slug]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{metadata.schoolName}» | h1 |  | ProposalUnlockScreen · l.75 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Verificando... / Acceder a la Propuesta» (submits the form) |  |  | `{loading \|\| !code.trim()}` |  | ProposalUnlockScreen · l.111 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «CÓDIGO DE ACCESO» | text | «CÓDIGO DE ACCESO» · disabled: `{loading}` · `maxLength={6}` |  |  |  | ProposalUnlockScreen · l.86 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image · alt Fundación Nueva Educación · /logos/fne-logo-gold.png |  |  | ProposalUnlockScreen · l.65 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | ProposalUnlockScreen · l.84 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Código incorrecto» | `setError` | `!(res.ok && json.data?.snapshot)` | handleSubmit · l.47 |
| «Error de conexión. Intenta nuevamente.» | `setError` |  | handleSubmit · l.53 |

**Values shown from data** (2)

- `{metadata.serviceName}` — ProposalUnlockScreen · l.76
- `{error}` — ProposalUnlockScreen · l.100, when `error`

**Other texts on screen** (2)

- «{remaining} intento{remaining !== 1 ? 's' : ''} restante{remaining !== 1 ? 's' : ''} / Demasiados intentos. Intenta más tarde.» — ProposalUnlockScreen · l.102, when `error && remaining != null`
- «Ingresa el código que te fue enviado por tu consultor FNE» — ProposalUnlockScreen · l.129

### components/ui/dialog.tsx

Used by: `/admin/licitaciones/consultores`, `/admin/licitaciones/documentos-propuesta`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### lib/evaluacionService.ts

Used by: `/licitaciones/[id]/evaluacion`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «El monto propuesto de la ATE {ate.id} debe ser mayor a 0» | `throw (shown by whoever catches it)` | `ate.monto_propuesto <= 0` | calculateEconomicScores · l.33 |

### lib/licitaciones/documentPreview.ts

Used by: `/licitaciones/[id]`

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «El archivo Word no contiene un documento válido.» | `throw (shown by whoever catches it)` | `!entry` | extractDocxText · l.23 |
| «El archivo Word contiene XML no permitido.» | `throw (shown by whoever catches it)` | `/<!DOCTYPE\|<!ENTITY/i.test(xml)` | extractDocxText · l.43 |
| «El archivo Word no es válido.» | `throw (shown by whoever catches it)` | `document.querySelector('parsererror')` | extractDocxText · l.45 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelector(parsererror)` | extractDocxText · l.45 |

### lib/licitaciones/publicacionText.ts

Used by: `/licitaciones/[id]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `FECHA_PENDIENTE` | «[fecha pendiente]» | l.10 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Con el objetivo de asesorar al equipo directivo y lideres del establecimiento» | buildPublicacionText · l.52 |
| «en el Modelo Relacional es que el {schoolName}, de la comuna de {comuna},» | buildPublicacionText · l.54 |
| «Bases de la licitacion se pueden solicitar hasta el {fechaLimite} al» | buildPublicacionText · l.59 |

### lib/licitacionesExport.ts

Used by: `/licitaciones`

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `XLSX.writeFile()` |  | exportToExcel · l.143 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `headers` | «Numero», «Escuela», «Programa», «Nombre», «Estado», «Ano», «Fecha Publicacion», «Fecha Limite Bases», «Fecha Limite Propuestas», «Fecha Limite Evaluacion», «Monto Minimo», «Monto Maximo», «Moneda», «Peso Tecnico (%)», «Peso Economico (%)», «ATE Ganadora», «Monto Adjudicado», «Fecha Adjudicacion», «Contrato Vinculado» | exportToExcel · l.52 |
| `filename` | «Licitaciones_{new Date().toISOString().sl…}.xlsx» | exportToExcel · l.142 |

### lib/propuestas-web/constants.ts

Used by: `/licitaciones/[id]`, `/propuesta/[slug]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `RETIRED_ADVISOR_NAMES` | «Boris Mir» | l.14 |
| `INTERNATIONAL_ADVISORS` | «Coral Regí», «Comité Internacional — Ex-Directora Escola Virolai», «Bióloga y educadora, ex-directora de la Escuela Virolai. Asesora internacional y miembro del comité científico de Educación Mañana, la Junta de la Sociedad Cat…», «Jordi Mussons», «Comité Internacional — Director Escola Sadako», «Maestro y director de Escola Sadako de Barcelona desde 2006, institución referente en innovación educativa a nivel internacional. Estudió Biología y encontró e…», «Sandra Entrena», «Comité Internacional — Encargada de Innovación, Escola Virolai», «Encargada de Innovación de Escola Virolai, una de las escuelas líderes del cambio hacia el nuevo paradigma educativo en Europa. Educadora de larga trayectoria …», «Anna Comas», «Comité Internacional — Ex-Directora Escola La Maquinista», «Fue la directora de la escuela de La Maquinista, un proyecto educativo innovador que se ha transformado en un referente de cambio. Licenciada en Filosofía y Ci…», «Pepe Menéndez», «Comité Internacional — Ex-Director Adjunto Jesuitas Educació», «Director adjunto de Jesuitas Educació, promotor del proyecto Horizonte 2020 para la transformación profunda de la educación de las escuelas Jesuitas de Catalun…», «Joan Quintana», «Comité Internacional — Psicólogo y Director Instituto Relacional», «Psicólogo especializado en Comportamiento y Desarrollo Organizacional y en Coaching Relacional, con experiencia en organizaciones públicas, privadas, educación…» | l.26 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Bióloga y educadora, ex-directora de la Escuela Virolai. Asesora internacional y miembro del comité científico de Educación Mañana, la Junta de la Sociedad Catalana de Pedagogía y el Consejo Escolar de Cataluña desde 2014. Colabora con Fundación Bofill, Fundación Carulla y el Comité Internacional d…» | INTERNATIONAL_ADVISORS · l.30 |
| «Maestro y director de Escola Sadako de Barcelona desde 2006, institución referente en innovación educativa a nivel internacional. Estudió Biología y encontró en el escultismo la clave para educar desde la responsabilidad y el compromiso sostenible y social. Miembro de la junta directiva de AEC.» | INTERNATIONAL_ADVISORS · l.39 |
| «Encargada de Innovación de Escola Virolai, una de las escuelas líderes del cambio hacia el nuevo paradigma educativo en Europa. Educadora de larga trayectoria como formadora de profesores en Barcelona. Pilar formativo de Escola Nova 21. Diseñó programas en metodologías activas, evaluación formativa…» | INTERNATIONAL_ADVISORS · l.48 |
| «Fue la directora de la escuela de La Maquinista, un proyecto educativo innovador que se ha transformado en un referente de cambio. Licenciada en Filosofía y Ciencias de la Educación. Colaboradora con la UB, UAB, Diputación y el Departamento de Educación de Catalunya. Actualmente mentora en el Progr…» | INTERNATIONAL_ADVISORS · l.57 |
| «Director adjunto de Jesuitas Educació, promotor del proyecto Horizonte 2020 para la transformación profunda de la educación de las escuelas Jesuitas de Catalunya. Autor de "Educar para la Vida" (2024) y "Escuelas que valgan la pena" (2020). Participó en seminarios sobre Nueva Educación en Chile.» | INTERNATIONAL_ADVISORS · l.66 |
| «Psicólogo especializado en Comportamiento y Desarrollo Organizacional y en Coaching Relacional, con experiencia en organizaciones públicas, privadas, educación y salud. Co-fundador del Instituto Relacional, formador en competencias relacionales docentes y director del programa de Dirección Avanzada…» | INTERNATIONAL_ADVISORS · l.75 |

### lib/propuestas-web/pdf-generator.ts

Used by: `/licitaciones/[id]`, `/propuesta/[slug]`

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `pdf.save()` |  | generateProposalPDF · l.946 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (10)

| Name | Texts | Where |
|---|---|---|
| `MES` | «Enero», «Febrero», «Marzo», «Abril», «Mayo», «Junio», «Julio», «Agosto», «Septiembre», «Octubre», «Noviembre», «Diciembre» | l.22 |
| `DIST_LABELS` | «Taller», «Sesiones regulares», «Flexible» | l.28 |
| `MOD_LABELS` | «Presencial», «Online», «Asincrónico», «Híbrido» | l.33 |
| `programLabel` | «Programa Evoluciona / Programa Preparación» | buildProposalPdf · l.303 |
| `tocNames` | «Sobre Fundación Nueva Educación», «Modelo de Consultoría», «Equipo de Consultoría», «Asesores Internacionales», «Contenidos del Programa», «Distribución de Actividades [if hasBuckets]», «Línea de Tiempo del Programa [if hasBuckets]», «Propuesta Económica», «Datos de Referencia [if hasFichaOrLic]», «Documentos de Apoyo [if hasDocs]» | buildProposalPdf · l.365 |
| `statsData` | «Años de experiencia», «Países», «Colegios acompañados» | buildProposalPdf · l.421 |
| `phases` | «Inicia», «Diagnóstico y levantamiento de necesidades. Identificamos las áreas de mejora y establecemos la línea base.», «Inspira», «Formación y acompañamiento. Implementamos programas de desarrollo profesional contextualizados.», «Evoluciona», «Consolidación y autonomía. Aseguramos la sostenibilidad de los cambios y la transferencia de capacidades.» | buildProposalPdf · l.458 |
| `distHead` | «Actividad», «Horas», «Modalidad», «Tipo», «Notas» | buildProposalPdf · l.660 |
| `tlHead` | «Actividad» | buildProposalPdf · l.721 |
| `dHead` | «Documento», «Tipo» | buildProposalPdf · l.878 |

**Other texts written in the code (safety net: not tied to an element by the script)** (20)

| Text | Where |
|---|---|
| «FUNDACIÓN NUEVA EDUCACIÓN» | buildProposalPdf · l.295 |
| «Hub de Transformación Educativa» | buildProposalPdf · l.300 |
| «{snapshot.programYear} · Versión {snapshot.version}» | buildProposalPdf · l.334 |
| «Índice» | buildProposalPdf · l.359 |
| «Transformando comunidades educativas desde 2018» | buildProposalPdf · l.407 |
| «Desde 2018, la Fundación Nueva Educación trabaja por la transformación de comunidades educativas a través de la formación docente, el liderazgo escolar y la innovación pedagógica. Con más de 6 años de experiencia, acompañamos a colegios en su proceso de mejora continua.» | buildProposalPdf · l.410 |
| «Nuestro equipo de consultores expertos diseña programas a medida que responden a las necesidades específicas de cada comunidad educativa, combinando metodologías probadas con enfoques innovadores.» | buildProposalPdf · l.413 |
| «Nuestro Enfoque» | buildProposalPdf · l.450 |
| «Nuestro modelo de acompañamiento se estructura en tres fases progresivas que aseguran un proceso de transformación sostenible y contextualizado a las necesidades de cada comunidad educativa.» | buildProposalPdf · l.453 |
| «FORMACIÓN» | buildProposalPdf · l.534 |
| «{INTERNATIONAL_ADVISORS.leng…} asesores del comité internacional» | buildProposalPdf · l.573 |
| «Mes {i + 1}» | buildProposalPdf · l.720 |
| «{snapshot.totalHours} horas totales de acompañamiento» | buildProposalPdf · l.808 |
| «INVERSIÓN TOTAL» | buildProposalPdf · l.821 |
| «Forma de pago» | buildProposalPdf · l.832 |
| «Detalle de pago» | buildProposalPdf · l.839 |
| «{f.nombre_servicio} — {f.dimension} · {f.categoria} · Folio {f.folio}» | buildProposalPdf · l.857 |
| «LICITACIÓN» | buildProposalPdf · l.862 |
| «Licitación {l.numero} — {l.nombre} ({l.year})» | buildProposalPdf · l.864 |
| «Disponibles para descarga en la versión web de esta propuesta» | buildProposalPdf · l.876 |

### lib/propuestas/types/hours.ts

Used by: `/licitaciones/[id]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `BUCKET_TEMPLATES` | «Taller 1», «Taller 2», «Acompañamiento Directivo a la Dirección», «Asesoría en Gestión del Cambio», «Acompañamiento al Equipo de Gestión», «Asesoría Directiva Online», «Acompañamiento Técnico Online», «Taller Residencial para Líderes de Generación Tractor», «Taller Residencial para Líderes de Proyecto Innova», «Taller Residencial para el Equipo Directivo», «Plataforma de Crecimiento», «Visita de Asesor Internacional in-situ» | l.36 |

### lib/propuestas/validation.ts

Used by: `/licitaciones/[id]`

**Other texts written in the code (safety net: not tied to an element by the script)** (12)

| Text | Where |
|---|---|
| «Se requieren configuración y ficha de servicio para validar» | validateProposalConfig · l.64 |
| «El nombre del servicio debe coincidir exactamente con la Ficha. Esperado: "{ficha.nombre_servicio}"» | validateProposalConfig · l.81 |
| «Las horas presenciales + sincrónicas ({horasRegistradas}) son menores que las registradas en la Ficha ({fichaHoras})» | validateProposalConfig · l.96 |
| «Las horas presenciales + sincrónicas ({horasRegistradas}) superan las horas registradas en la Ficha ({fichaHoras}). Verifique que sea intencional.» | validateProposalConfig · l.104 |
| «Las horas asincrónicas no pueden ser negativas» | validateProposalConfig · l.115 |
| «Los destinatarios "{invalid.join(', ')}" no están registrados en la Ficha de Servicio» | validateProposalConfig · l.130 |
| «Se requieren al menos 2 consultores del equipo registrado en la Ficha. Solo se encontraron {matches.length}» | validateProposalConfig · l.151 |
| «Revise que el objetivo de la propuesta sea coherente con el objetivo de la Ficha de Servicio» | validateProposalConfig · l.163 |
| «La suma de horas de los módulos ({sumModuleHours}) no coincide con el total de horas ({config.total_hours})» | validateProposalConfig · l.179 |
| «Certificado vigente» | validateProposalConfig · l.192 |
| «Vencido el {doc.fecha_vencimiento}» | validateProposalConfig · l.193 |
| «El documento "{doc.nombre}" está vencido ({doc.fecha_vencimiento}). Actualice el certificado antes de generar la propuesta» | validateProposalConfig · l.194 |

### types/licitaciones.ts

Used by: `/admin/licitaciones/criterios`, `/admin/licitaciones/feriados`, `/admin/licitaciones/templates`, `/licitaciones/[id]`, `/licitaciones/[id]/evaluacion`, `/licitaciones`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `ESTADO_DISPLAY` | «Borrador», «Publicación Pendiente», «Recepción de Bases», «Propuestas Pendientes», «Evaluación Pendiente», «Adjudicación Pendiente», «Contrato Pendiente», «Contrato Generado», «Adjudicada (Externa)», «Cerrada» | l.30 |
| `NEXT_ACTION` | «Registrar publicación», «Registrar ATEs y enviar bases», «Subir propuestas de ATEs», «Completar evaluación», «Confirmar adjudicación», «Generar contrato» | l.47 |

**Other texts written in the code (safety net: not tied to an element by the script)** (40)

| Text | Where |
|---|---|
| «Escuela requerida» | CreateLicitacionSchema · l.149 |
| «Programa requerido» | CreateLicitacionSchema · l.150 |
| «Nombre requerido» | CreateLicitacionSchema · l.151 |
| «Nombre demasiado largo» | CreateLicitacionSchema · l.151 |
| «Correo electronico invalido» | CreateLicitacionSchema · l.152 |
| «Monto minimo debe ser positivo» | CreateLicitacionSchema · l.153 |
| «Monto maximo debe ser positivo» | CreateLicitacionSchema · l.154 |
| «Duracion minima requerida» | CreateLicitacionSchema · l.156 |
| «Duracion maxima requerida» | CreateLicitacionSchema · l.157 |
| «Minimo 1%» | CreateLicitacionSchema · l.158 |
| «Maximo 99%» | CreateLicitacionSchema · l.158 |
| «Año minimo 2024» | CreateLicitacionSchema · l.159 |
| «Año maximo 2030» | CreateLicitacionSchema · l.159 |
| «Presencial» | CreateLicitacionSchema · l.161 |
| «Virtual» | CreateLicitacionSchema · l.161 |
| «Hibrido» | CreateLicitacionSchema · l.161 |
| «Notas demasiado largas» | CreateLicitacionSchema · l.162 |
| «Presupuesto maximo debe ser mayor o igual al minimo» | CreateLicitacionSchema · l.164 |
| «Ano minimo 2000» | CreateHistoricoLicitacionSchema · l.174 |
| «Ano maximo 2030» | CreateHistoricoLicitacionSchema · l.174 |
| «Numero demasiado largo» | CreateHistoricoLicitacionSchema · l.176 |
| «Formato YYYY-MM-DD» | CreateHistoricoLicitacionSchema · l.187 |
| «Fecha debe ser formato YYYY-MM-DD» | PublicacionSchema · l.199 |
| «Nombre ATE requerido» | CreateAteSchema · l.261 |
| «Telefono demasiado largo» | CreateAteSchema · l.265 |
| «Correo invalido» | UpdateAteSchema · l.275 |
| «Pregunta requerida» | CreateConsultaSchema · l.307 |
| «Pregunta demasiado larga» | CreateConsultaSchema · l.307 |
| «Respuesta demasiado larga» | CreateConsultaSchema · l.308 |
| «Nombre del servicio requerido» | BasesTemplateSchema · l.344 |
| «Objetivo requerido» | BasesTemplateSchema · l.345 |
| «Formato HH:MM requerido» | SaveEvaluationSchema · l.455 |
| «Formato YYYY-MM-DD requerido» | SaveEvaluationSchema · l.457 |
| «Puntaje debe ser >= 0» | SaveEvaluationSchema · l.461 |
| «Puntaje no puede exceder 100» | SaveEvaluationSchema · l.461 |
| «Monto debe ser positivo» | SaveEvaluationSchema · l.466 |
| «Monto excede limite» | SaveEvaluationSchema · l.466 |
| «Puntaje maximo debe ser positivo» | CriterioSchema · l.493 |
| «Debe confirmar el cierre de la licitacion» | CloseLicitacionSchema · l.517 |
| «Formato de fecha invalido. Use YYYY-MM-DD» | FeriadoSchema · l.532 |

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/licitaciones/criterios` | `pages/api/admin/licitaciones/criterios.ts` | DELETE, GET, PATCH, POST | `/admin/licitaciones/criterios` | `pages/admin/licitaciones/criterios.tsx` |
| `/api/admin/licitaciones/feriados` | `pages/api/admin/licitaciones/feriados.ts` | DELETE, GET, POST, PUT | `/admin/licitaciones/feriados` | `__tests__/api/licitaciones/generate-contract.test.ts`, `pages/admin/licitaciones/feriados.tsx` |
| `/api/admin/licitaciones/templates` | `pages/api/admin/licitaciones/templates.ts` | GET, PATCH, POST | `/admin/licitaciones/criterios`, `/admin/licitaciones/templates` | `pages/admin/licitaciones/criterios.tsx`, `pages/admin/licitaciones/templates.tsx` |
| `/api/licitaciones/[id]` | `pages/api/licitaciones/[id].ts` | DELETE, GET, PATCH | `/contracts`, `/licitaciones/[id]`, `/licitaciones/[id]/evaluacion` | `__tests__/api/licitaciones/create-requires-cliente.test.ts`, `__tests__/api/licitaciones/detail-encargado-cliente.test.ts`, `__tests__/api/licitaciones/licitaciones-historico.test.ts`, `__tests__/api/licitaciones/licitaciones-index.test.ts`, `__tests__/api/licitaciones/patch-encargado-school.test.ts` +7 |
| `/api/licitaciones/[id]/adjudicacion-confirmar` | `pages/api/licitaciones/[id]/adjudicacion-confirmar.ts` | POST | `/licitaciones/[id]` | `__tests__/api/licitaciones/carta-stuck-tender.test.ts`, `components/licitaciones/Step6Adjudicacion.tsx` |
| `/api/licitaciones/[id]/adjudicacion` | `pages/api/licitaciones/[id]/adjudicacion.ts` | POST | `/licitaciones/[id]` | `components/licitaciones/Step6Adjudicacion.tsx` |
| `/api/licitaciones/[id]/advance` | `pages/api/licitaciones/[id]/advance.ts` | POST | `/licitaciones/[id]`, `/licitaciones/[id]/evaluacion` | `__tests__/api/licitaciones/ates.test.ts`, `components/licitaciones/Step3Bases.tsx`, `components/licitaciones/Step4Propuestas.tsx`, `pages/licitaciones/[id]/evaluacion.tsx` |
| `/api/licitaciones/[id]/ates` | `pages/api/licitaciones/[id]/ates.ts` | DELETE, GET, PATCH, POST, PUT | `/licitaciones/[id]` | `__tests__/api/licitaciones/ates.test.ts`, `components/licitaciones/Step3Bases.tsx`, `components/licitaciones/Step4Propuestas.tsx`, `components/licitaciones/Step6Adjudicacion.tsx` |
| `/api/licitaciones/[id]/close` | `pages/api/licitaciones/[id]/close.ts` | POST | `/licitaciones/[id]` | `__tests__/api/licitaciones/generate-contract.test.ts`, `components/licitaciones/Step7Contrato.tsx` |
| `/api/licitaciones/[id]/consultas` | `pages/api/licitaciones/[id]/consultas.ts` | GET, POST | `/licitaciones/[id]` | `__tests__/api/licitaciones/ates.test.ts`, `components/licitaciones/Step3Bases.tsx` |
| `/api/licitaciones/[id]/documentos` | `pages/api/licitaciones/[id]/documentos.ts` | DELETE | `/licitaciones/[id]` | `components/licitaciones/ArchiveView.tsx`, `components/licitaciones/DocumentCenter.tsx`, `components/licitaciones/Step3Bases.tsx` |
| `/api/licitaciones/[id]/download-doc` | `pages/api/licitaciones/[id]/download-doc.ts` | GET | `/licitaciones/[id]` | `__tests__/components/licitaciones/document-preview.test.tsx`, `components/licitaciones/ArchiveView.tsx`, `components/licitaciones/DocumentCenter.tsx`, `components/licitaciones/DocumentPreview.tsx` |
| `/api/licitaciones/[id]/download-zip` | `pages/api/licitaciones/[id]/download-zip.ts` | POST | `/licitaciones/[id]` | `components/licitaciones/DocumentCenter.tsx` |
| `/api/licitaciones/[id]/evaluacion` | `pages/api/licitaciones/[id]/evaluacion.ts` | GET, POST | `/licitaciones/[id]`, `/licitaciones/[id]/evaluacion` | `pages/licitaciones/[id].tsx`, `pages/licitaciones/[id]/evaluacion.tsx` |
| `/api/licitaciones/[id]/generate-acta` | `pages/api/licitaciones/[id]/generate-acta.ts` | GET | `/licitaciones/[id]/evaluacion` | `pages/licitaciones/[id]/evaluacion.tsx` |
| `/api/licitaciones/[id]/generate-bases` | `pages/api/licitaciones/[id]/generate-bases.ts` | GET | `/licitaciones/[id]` | `__tests__/api/licitaciones/client-document-access.test.ts`, `components/licitaciones/Step3Bases.tsx` |
| `/api/licitaciones/[id]/generate-carta` | `pages/api/licitaciones/[id]/generate-carta.ts` | GET | `/licitaciones/[id]` | `__tests__/api/licitaciones/carta-stuck-tender.test.ts`, `__tests__/api/licitaciones/client-document-access.test.ts`, `__tests__/components/licitaciones/carta-before-award.test.tsx`, `components/licitaciones/Step6Adjudicacion.tsx`, `components/licitaciones/Step7Contrato.tsx` |
| `/api/licitaciones/[id]/generate-contract` | `pages/api/licitaciones/[id]/generate-contract.ts` | POST | `/contracts` | `__tests__/api/licitaciones/client-document-access.test.ts`, `__tests__/api/licitaciones/generate-contract.test.ts`, `pages/contracts.tsx` |
| `/api/licitaciones/[id]/generate-propuesta` | `pages/api/licitaciones/[id]/generate-propuesta.ts` | POST | `/licitaciones/[id]` | `__tests__/api/licitaciones/generate-propuesta-stale.test.ts`, `components/licitaciones/ProposalConfigPanel.tsx` |
| `/api/licitaciones/[id]/propuestas` | `pages/api/licitaciones/[id]/propuestas.ts` | GET | `/licitaciones/[id]` | `__tests__/api/licitaciones/propuesta-access-code.test.ts`, `__tests__/components/licitaciones/proposal-access-code.test.tsx`, `components/licitaciones/ProposalConfigPanel.tsx` |
| `/api/licitaciones/[id]/publicacion` | `pages/api/licitaciones/[id]/publicacion.ts` | POST | `/licitaciones/[id]` | `__tests__/api/licitaciones/publicacion.test.ts`, `pages/licitaciones/[id].tsx` |
| `/api/licitaciones/[id]/timeline` | `pages/api/licitaciones/[id]/timeline.ts` | GET | `/licitaciones/[id]` | `__tests__/pages/licitaciones/licitacion-detail-step2.test.tsx`, `pages/licitaciones/[id].tsx` |
| `/api/licitaciones/[id]/upload` | `pages/api/licitaciones/[id]/upload.ts` | POST | `/licitaciones/[id]`, `/licitaciones/[id]/evaluacion` | `components/licitaciones/ArchiveView.tsx`, `components/licitaciones/Step6Adjudicacion.tsx`, `components/licitaciones/Step7Contrato.tsx`, `pages/licitaciones/[id].tsx`, `pages/licitaciones/[id]/evaluacion.tsx` |
| `/api/licitaciones/check-deadlines` | `pages/api/licitaciones/check-deadlines.ts` | POST | `/licitaciones`, `/licitaciones/[id]` | `pages/licitaciones/[id].tsx`, `pages/licitaciones/index.tsx`, `scripts/redesign/harness/rules.mjs` |
| `/api/licitaciones` | `pages/api/licitaciones/index.ts` | GET, POST | `/licitaciones`, `/licitaciones/importar`, `/licitaciones/nueva` | `__tests__/api/licitaciones/create-requires-cliente.test.ts`, `__tests__/api/licitaciones/licitaciones-historico.test.ts`, `__tests__/api/licitaciones/licitaciones-index.test.ts`, `__tests__/pages/licitaciones/nueva-requires-cliente.test.tsx`, `pages/licitaciones/importar.tsx` +2 |
| `/api/propuestas/bloques` | `pages/api/propuestas/bloques.ts` | GET, POST | `/licitaciones/[id]` | `components/licitaciones/ProposalConfigPanel.tsx` |
| `/api/propuestas/bloques/[id]` | `pages/api/propuestas/bloques/[id].ts` | DELETE, GET, PATCH | **no screen** |  |
| `/api/propuestas/consultores` | `pages/api/propuestas/consultores.ts` | GET, POST | `/admin/licitaciones/consultores`, `/licitaciones/[id]` | `components/licitaciones/ProposalConfigPanel.tsx`, `pages/admin/licitaciones/consultores.tsx` |
| `/api/propuestas/consultores/[id]` | `pages/api/propuestas/consultores/[id].ts` | DELETE, GET, PATCH | `/admin/licitaciones/consultores` | `pages/admin/licitaciones/consultores.tsx` |
| `/api/propuestas/documentos` | `pages/api/propuestas/documentos.ts` | GET, POST | `/admin/licitaciones/documentos-propuesta`, `/licitaciones/[id]` | `components/licitaciones/ProposalConfigPanel.tsx`, `pages/admin/licitaciones/documentos-propuesta.tsx` |
| `/api/propuestas/documentos/[id]` | `pages/api/propuestas/documentos/[id].ts` | DELETE, GET, PATCH | `/admin/licitaciones/documentos-propuesta` | `pages/admin/licitaciones/documentos-propuesta.tsx` |
| `/api/propuestas/download/[id]` | `pages/api/propuestas/download/[id].ts` | GET | **no screen** |  |
| `/api/propuestas/fichas` | `pages/api/propuestas/fichas.ts` | GET, POST | `/licitaciones/[id]` | `components/licitaciones/ProposalConfigPanel.tsx` |
| `/api/propuestas/fichas/[id]` | `pages/api/propuestas/fichas/[id].ts` | DELETE, GET, PATCH | **no screen** |  |
| `/api/propuestas/plantillas` | `pages/api/propuestas/plantillas.ts` | GET, POST | `/licitaciones/[id]` | `components/licitaciones/ProposalConfigPanel.tsx` |
| `/api/propuestas/plantillas/[id]` | `pages/api/propuestas/plantillas/[id].ts` | DELETE, GET, PATCH | **no screen** |  |
| `/api/propuestas/upload` | `pages/api/propuestas/upload.ts` | POST | `/admin/licitaciones/consultores`, `/admin/licitaciones/documentos-propuesta` | `pages/admin/licitaciones/consultores.tsx`, `pages/admin/licitaciones/documentos-propuesta.tsx` |
| `/api/propuestas/web/[slug]/admin-access` | `pages/api/propuestas/web/[slug]/admin-access.ts` | GET | `/propuesta/[slug]` | `pages/propuesta/[slug].tsx` |
| `/api/propuestas/web/[slug]/download-doc` | `pages/api/propuestas/web/[slug]/download-doc.ts` | POST | `/propuesta/[slug]` | `components/propuestas-web/DownloadablesSection.tsx` |
| `/api/propuestas/web/[slug]/download-zip` | `pages/api/propuestas/web/[slug]/download-zip.ts` | POST | `/propuesta/[slug]` | `components/propuestas-web/DownloadablesSection.tsx` |
| `/api/propuestas/web/[slug]` | `pages/api/propuestas/web/[slug]/index.ts` | GET | `/propuesta/[slug]` | `pages/propuesta/[slug].tsx` |
| `/api/propuestas/web/[slug]/verify` | `pages/api/propuestas/web/[slug]/verify.ts` | POST | `/propuesta/[slug]` | `__tests__/api/licitaciones/propuesta-access-code.test.ts`, `__tests__/api/propuestas/access-code-reservation.test.ts`, `components/propuestas-web/ProposalUnlockScreen.tsx`, `pages/propuesta/[slug].tsx` |


# Gestor de Cambio (registros, context, migration plan, results)

Area `08-gestor-de-cambio`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `45d07ead5` (2026-11-17).

16 screen files, 40 API files, 31 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/assessment-builder/[templateId]/expectations` | `pages/admin/assessment-builder/[templateId]/expectations.tsx` | 1836 | — |  |
| `/admin/assessment-builder/[templateId]` | `pages/admin/assessment-builder/[templateId]/index.tsx` | 3207 | — |  |
| `/admin/assessment-builder/create` | `pages/admin/assessment-builder/create.tsx` | 459 | — |  |
| `/admin/assessment-builder` | `pages/admin/assessment-builder/index.tsx` | 804 | Gestor de Cambio › Constructor de Registros |  |
| `/admin/context-questions` | `pages/admin/context-questions/index.tsx` | 741 | Gestor de Cambio › Preguntas de Contexto |  |
| `/admin/context-questions/overview` | `pages/admin/context-questions/overview.tsx` | 489 | Gestor de Cambio › Resumen Respuestas |  |
| `/demo/assessments/[templateId]` | `pages/demo/assessments/[templateId]/index.tsx` | 425 | — | Looks like a leftover but is in use |
| `/demo/assessments/[templateId]/results` | `pages/demo/assessments/[templateId]/results.tsx` | 395 | — | Looks like a leftover but is in use |
| `/demo/assessments` | `pages/demo/assessments/index.tsx` | 204 | — | Looks like a leftover but is in use |
| `/directivo/assessments/dashboard` | `pages/directivo/assessments/dashboard.tsx` | 814 | Reportes › Panel de Resultados |  |
| `/docente/assessments/[instanceId]` | `pages/docente/assessments/[instanceId]/index.tsx` | 729 | — |  |
| `/docente/assessments/[instanceId]/results` | `pages/docente/assessments/[instanceId]/results.tsx` | 207 | — |  |
| `/docente/assessments` | `pages/docente/assessments/index.tsx` | 407 | Mi Aprendizaje › Feedback; Gestor de Cambio › Mis Registros |  |
| `/school/migration-plan` | `pages/school/migration-plan/index.tsx` | 837 | Gestor de Cambio › Plan de Migración |  |
| `/school/transversal-context/edit` | `pages/school/transversal-context/edit.tsx` | 1081 | — |  |
| `/school/transversal-context` | `pages/school/transversal-context/index.tsx` | 1633 | Gestor de Cambio › Contexto Transversal; Vías de Transformación › Contexto Transversal |  |

## /admin/assessment-builder/[templateId]/expectations

File `pages/admin/assessment-builder/[templateId]/expectations.tsx` · 1836 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.180 `router.push → /login  (when !session?.user)`
  - l.801 `router.push → /login`
  - l.1001 `No tienes permiso para editar expectativas.`
- Linked from: `pages/admin/assessment-builder/[templateId]/index.tsx:1599`, `pages/admin/assessment-builder/[templateId]/index.tsx:1736`, `pages/api/qa/seed-codebase-index.ts:200`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/assessment-builder-expectations-editor.spec.ts`; unit tests of the page: `__tests__/pages/admin/assessment-builder-expectations-editor.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | sent to /dashboard |
| lider_generacion | — | sent to /dashboard |
| lider_comunidad | — | sent to /dashboard |
| supervisor_de_red | — | sent to /dashboard |
| community_manager | — | sent to /dashboard |
| docente | — | sent to /dashboard |
| encargado_licitacion | — | sent to /dashboard |

### What the page file itself draws

**Titles** (9)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `hasPermission === false` | ExpectationsEditor · l.1000 |
| «Template no encontrado» | h1 | `!template` | ExpectationsEditor · l.1026 |
| «{template.name}» | h2 |  | ExpectationsEditor · l.1113 |
| «Procesos Generativos» | h4 | `weightObjectives.length > 0 && isWeightDistributorOpen` | ExpectationsEditor · l.1264 |
| «Practicas Generativas» | h5 | `weightObjectives.length > 0 && isWeightDistributorOpen && each currentYearObjs && expandedWeightObjective === obj.id && obj.modules.length > 0` | ExpectationsEditor · l.1327 |
| «Indicadores» | h6 | `each currentYearObjs && expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules && expandedWeightModule === mod.id && mod.indicators.length > 0` | ExpectationsEditor · l.1395 |
| «Sin indicadores» | h4 | `moduleExpectations.length === 0` | ExpectationsEditor · l.1558 |
| «{module.moduleOrder} . {module.moduleName}» | h3 | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1573 |
| «Leyenda:» | h4 | `moduleExpectations.length > 0` | ExpectationsEditor · l.1765 |

**Tabs** (1)

| Text | Does | Shown when | Where |
|---|---|---|---|
| «Año {yr}» | `{() => setSelectedWeightYear(yr)}` | `weightObjectives.length > 0 && isWeightDistributorOpen && each [1, 2, 3, 4, 5]` | ExpectationsEditor · l.1183 |

**Buttons** (13)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Guardando... / Guardar Cambios» | `{handleSaveAll}` | `isDraft && isAdmin` | `{isSaving \|\| !hasChanges}` |  | ExpectationsEditor · l.1072 |
| «Distribución de Pesos» | `{() => setIsWeightDistributorOpen(prev => !prev)}` | `weightObjectives.length > 0` |  |  | ExpectationsEditor · l.1151 |
| «[icon ChevronUp]» · aria «{isWeightDistributorOpen ? 'Cerrar distribución de pesos' : 'Abrir distribución …}» | `{() => setIsWeightDistributorOpen(prev => !prev)}` | `weightObjectives.length > 0` |  |  | ExpectationsEditor · l.1166 |
| «Copiar de...» | `{() => setShowCopyDropdown(prev => !prev)}` | `weightObjectives.length > 0 && isWeightDistributorOpen` | `{!isDraft \|\| !isAdmin}` |  | ExpectationsEditor · l.1207 |
| «Año {yr} [(predeterminado)]» | `{() => handleCopyFromYear(yr)}` | `weightObjectives.length > 0 && isWeightDistributorOpen && showCopyDropdown && each [1, 2, 3, 4, 5] .filter((yr) => yr !== selectedWe…` |  |  | ExpectationsEditor · l.1221 |
| «Guardando... / Guardar Año {selectedWeightYear}» | `{() => handleSaveYearWeights()}` | `weightObjectives.length > 0 && isWeightDistributorOpen && isDraft && isAdmin && weightsDirtyByYear[selectedWeightYear]` | `{isSavingWeights}` |  | ExpectationsEditor · l.1237 |
| «Distribuir equitativamente» | `{() => { const percents = distributeEquitably(currentYearObjs.length); setYearWe…}` | `weightObjectives.length > 0 && isWeightDistributorOpen && isDraft && isAdmin && currentYearObjs.length > 1` |  |  | ExpectationsEditor · l.1270 |
| «{obj.name} %» | `{() => setExpandedWeightObjective(prev => prev === obj.id ? null : obj.id)}` | `weightObjectives.length > 0 && isWeightDistributorOpen && each currentYearObjs` |  |  | ExpectationsEditor · l.1289 |
| «Distribuir equitativamente» | `{() => { const percents = distributeEquitably(obj.modules.length); setYearWeight…}` | `isWeightDistributorOpen && each currentYearObjs && expandedWeightObjective === obj.id && obj.modules.length > 0 && isDraft && isAdmin && obj.modules.length > 1` |  |  | ExpectationsEditor · l.1333 |
| «{mod.name} %» | `{() => setExpandedWeightModule(prev => prev === mod.id ? null : mod.id)}` | `isWeightDistributorOpen && each currentYearObjs && expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules` |  |  | ExpectationsEditor · l.1354 |
| «Distribuir equitativamente» | `{() => { const percents = distributeEquitably(mod.indicators.length); setYearWei…}` | `expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules && expandedWeightModule === mod.id && mod.indicators.length > 0 && isDraft && isAdmin && mod.indicators.length > 1` |  |  | ExpectationsEditor · l.1401 |
| «[icon Info]» · aria «{`Ver descriptores de nivel para ${indicator.indicatorName}`}» | `{() => setExpandedDescriptors(prev => prev === indicator.indicatorId ? null : in…}` | `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators && indicator.indicatorCategory === 'profundidad' && indicator.levelDescriptors` |  |  | ExpectationsEditor · l.1633 |
| «Guardando... / Guardar» | `{handleSaveAll}` | `hasChanges && isAdmin` | `{isSaving}` |  | ExpectationsEditor · l.1822 |

**Links** (8)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ir al Panel» | `/dashboard` | `hasPermission === false` |  | ExpectationsEditor · l.1002 |
| «Ir al Panel» |  | `hasPermission === false` |  | ExpectationsEditor · l.1003 |
| «Volver a la lista» | `/admin/assessment-builder` | `!template` |  | ExpectationsEditor · l.1027 |
| «Volver a la lista» |  | `!template` |  | ExpectationsEditor · l.1028 |
| «Volver al template» | `/admin/assessment-builder/[*]` |  |  | ExpectationsEditor · l.1060 |
| «Volver al template» |  |  |  | ExpectationsEditor · l.1061 |
| «Ir al editor de template» | `/admin/assessment-builder/[*]` | `moduleExpectations.length === 0` |  | ExpectationsEditor · l.1562 |
| «Ir al editor de template» |  | `moduleExpectations.length === 0` |  | ExpectationsEditor · l.1563 |

**Fields** (11)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | checkbox | disabled: `{disabled}` |  | `indicator.indicatorCategory === 'cobertura'` |  | renderYearCell · l.821 |
| «{`Cantidad de frecuencia: ${cellLabel}`}» | text | «-» · disabled: `{disabled}` |  | `indicator.indicatorCategory === 'frecuencia'` | `testid={draftKey}` | renderYearCell · l.845 |
| «{`Periodo de frecuencia: ${cellLabel}`}» | select | disabled: `{disabled}` | «(lista) día / año / {u.substring(0, 3)}» | `indicator.indicatorCategory === 'frecuencia'` | `testid={draftKey}-unit` | renderYearCell · l.869 |
|  | checkbox | disabled: `{disabled}` |  | `indicator.indicatorCategory === 'traspaso'` |  | renderYearCell · l.894 |
|  | checkbox | disabled: `{disabled}` |  | `indicator.indicatorCategory === 'detalle'` |  | renderYearCell · l.909 |
|  | select | disabled: `{disabled}` | «-», «0», «1», «2», «3», «4» |  |  | renderYearCell · l.923 |
| «{`Peso de ${obj.name} (%) Año ${selectedWeightYear}`}» | number | disabled: `{!isDraft \|\| !isAdmin \|\| currentYearObjs.length === 1}` · `min=0 max=100 step=1` |  | `weightObjectives.length > 0 && isWeightDistributorOpen && each currentYearObjs` |  | ExpectationsEditor · l.1300 |
| «{`Peso de ${mod.name} (%) Año ${selectedWeightYear}`}» | number | disabled: `{!isDraft \|\| !isAdmin \|\| obj.modules.length === 1}` · `min=0 max=100 step=1` |  | `isWeightDistributorOpen && each currentYearObjs && expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules` |  | ExpectationsEditor · l.1365 |
| «{`Peso de ${ind.name} (%) Año ${selectedWeightYear}`}» | number | disabled: `{!isDraft \|\| !isAdmin \|\| mod.indicators.length === 1}` · `min=0 max=100 step=1` |  | `expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules && expandedWeightModule === mod.id && mod.indicators.length > 0 && each mod.indicators` |  | ExpectationsEditor · l.1466 |
|  | select | disabled: `{!isDraft \|\| !isAdmin}` | «0», «1», «2» | `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators` |  | ExpectationsEditor · l.1689 |
|  | select | disabled: `{!isDraft \|\| !isAdmin}` | «0», «1», «2» | `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators && requiresDual && indicator.expectationsGI` |  | ExpectationsEditor · l.1727 |

**Table columns** (8)

| Text | Shown when | Where |
|---|---|---|
| «Indicador» | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1582 |
| «Tipo» | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1585 |
| «Año 1» | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1588 |
| «Año 2» | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1591 |
| «Año 3» | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1594 |
| «Año 4» | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1597 |
| «Año 5» | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1600 |
| «Toler.» | `!(moduleExpectations.length === 0) && each moduleExpectations` | ExpectationsEditor · l.1603 |

**Toasts** (18)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar datos» |  | ExpectationsEditor · l.468 |
| error | «{FREQUENCY_COUNT_ERROR}» | `invalidFrequencyCells.length > 0` | handleSaveAll · l.571 |
| error | «{FREQUENCY_RANGE_ERROR}» | `blockingOutOfRangeCells.length > 0` | handleSaveAll · l.577 |
| success | «No hay cambios para guardar» | `updates.length === 0` | handleSaveAll · l.606 |
| success | «{updates.length} expectativa{updates.length !== 1 ? 's' …} guardada{updates.length !== 1 ? 's' …}» |  | handleSaveAll · l.634 |
| error | «Error al guardar expectativas» |  | handleSaveAll · l.637 |
| error | «Los pesos de los procesos deben sumar 100% (actual: {s}%)» | `weightObjectives.length > 1 && Math.abs(s - 100) > 0.5` | handleSaveWeights · l.663 |
| error | «Los pesos de las prácticas de "{obj.name}" deben sumar 100% (actual: {s}%)» | `obj.modules.length > 1 && Math.abs(s - 100) > 0.5` | handleSaveWeights · l.671 |
| error | «Los pesos de los indicadores de "{mod.name}" deben sumar 100% (actual: {s}%)» | `mod.indicators.length > 1 && Math.abs(s - 100) > 0.5` | handleSaveWeights · l.679 |
| success | «Distribución de pesos guardada» |  | handleSaveWeights · l.706 |
| error | «Error al guardar pesos» |  | handleSaveWeights · l.709 |
| error | «Los pesos de los procesos del Año {selectedWeightYear} deben sumar 100% (actual: {s}%)» | `currentYearObjs.length > 1 && Math.abs(s - 100) > 0.5` | handleSaveYearWeights · l.724 |
| error | «Los pesos de las prácticas de "{obj.name}" (Año {selectedWeightYear}) deben sumar 100% (actual: {s}%)» | `obj.modules.length > 1 && Math.abs(s - 100) > 0.5` | handleSaveYearWeights · l.732 |
| error | «Los pesos de los indicadores de "{mod.name}" (Año {selectedWeightYear}) deben sumar 100% (actual: {s}%)» | `mod.indicators.length > 1 && Math.abs(s - 100) > 0.5` | handleSaveYearWeights · l.740 |
| success | «Pesos del Año {selectedWeightYear} guardados» |  | handleSaveYearWeights · l.769 |
| error | «Error al guardar pesos por año» |  | handleSaveYearWeights · l.772 |
| error | «No hay datos de pesos disponibles para Año {sourceYear}» | `!sourceWeights \|\| sourceWeights.length === 0` | handleCopyFromYear · l.782 |
| success | «Pesos copiados del Año {sourceYear}{sourceLabel} al Año {selectedWeightYear}» |  | handleCopyFromYear · l.794 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar expectativas» | `throw (shown by whoever catches it)` | `!expectationsRes.ok` | ExpectationsEditor · l.235 |
| «Error al guardar pesos» | `throw (shown by whoever catches it)` | `!response.ok` | handleSaveWeights · l.702 |
| «Error al guardar pesos por año» | `throw (shown by whoever catches it)` | `!response.ok` | handleSaveYearWeights · l.764 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.180 |
| `/admin/assessment-builder` | `router.push` |  | ExpectationsEditor · l.469 |
| `/login` | `router.push` |  | handleLogout · l.801 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!templateId \|\| typeof templateId !== 'string' \|\| !user \|\| hasPermission === false` | ExpectationsEditor · l.227 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `hasPermission === false` |  | ExpectationsEditor · l.989 |
| `MainLayout` |  | `!template` |  | ExpectationsEditor · l.1015 |
| `MainLayout` |  |  |  | ExpectationsEditor · l.1042 |
| `ResponsiveFunctionalPageHeader` | title: Calibración |  |  | ExpectationsEditor · l.1051 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `FREQUENCY_COUNT_ERROR` | «No se guardaron los cambios: la cantidad de frecuencia debe ser un número entero mayor o igual a 0.» | l.110 |
| `FREQUENCY_RANGE_ERROR` | «No se guardaron los cambios: hay expectativas de frecuencia fuera del rango o de los pasos que permite el indicador.» | l.113 |
| `details` | «: {data.details.join('; ')}» | handleSaveAll · l.620 |
| `giRow` | «GI {renderYearCell(module.moduleId, ind…} {renderYearCell(module.moduleId, ind…} {renderYearCell(module.moduleId, ind…} {renderYearCell(module.moduleId, ind…} {renderYearCell(module.moduleId, ind…} 0 1 2» | ExpectationsEditor · l.1710 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «{ind.indicatorCode \|\| ind.in…} ({generationType}, Año {yearKey.slice(4)})» | ExpectationsEditor · l.531 |
| «{ind.indicatorCode \|\| ind.in…} ({generationType}, Año {yearKey.slice(4)}): {violation.message}» | ExpectationsEditor · l.556 |
| «{indicator.indicatorName}, {generationType}, Año {yearKey.slice(4)}» | ExpectationsEditor · l.840 |
| «Abrir distribución de pesos» | ExpectationsEditor · l.1170 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (12)

| Kind | What | Where |
|---|---|---|
| focus | `document.getElementById(invalidFrequencyCells[0].….focus()` | handleSaveAll · l.572 |
| focus | `document.getElementById(blockingOutOfRangeCells[0….focus()` | handleSaveAll · l.578 |
| storage | `localStorage: rememberMe` | handleLogout · l.799 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.800 |
| role | `role=tabpanel` | ExpectationsEditor · l.1178 |
| mark | `id=year-weight-panel` | ExpectationsEditor · l.1178 |
| role | `role=tablist` | ExpectationsEditor · l.1181 |
| role | `role=alert` | ExpectationsEditor · l.1516 |
| mark | `testid=frequency-count-error id=frequency-count-error` | ExpectationsEditor · l.1516 |
| role | `role=alert` | ExpectationsEditor · l.1531 |
| mark | `testid=frequency-range-error id=frequency-range-error` | ExpectationsEditor · l.1531 |
| address value | `[templateId] (part of the address)` | l.1 |

**Values shown from data** (10)

- `{stats.configured}` — ExpectationsEditor · l.1069
- `{stats.total}` — ExpectationsEditor · l.1069
- `{ind.name}` — ExpectationsEditor · l.1460, when `expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules && expandedWeightModule === mod.id && mod.indicators.length > 0 && each mod.indicators`
- `{FREQUENCY_COUNT_ERROR}` — ExpectationsEditor · l.1524, when `showFrequencyErrors && invalidFrequencyCells.length > 0`
- `{cell.label}` — ExpectationsEditor · l.1547, when `outOfRangeCells.length > 0 && each outOfRangeCells`
- `{indicator.indicatorCode}` — ExpectationsEditor · l.1627, when `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators && indicator.indicatorCode`
- `{indicator.indicatorName}` — ExpectationsEditor · l.1631, when `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators`
- `{level}` — ExpectationsEditor · l.1649, when `each module.indicators && expandedDescriptors === indicator.indicatorId && indicator.levelDescriptors && each (['level0', 'level1', 'level2', 'level3', 'level4… && desc`
- `{desc}` — ExpectationsEditor · l.1650, when `each module.indicators && expandedDescriptors === indicator.indicatorId && indicator.levelDescriptors && each (['level0', 'level1', 'level2', 'level3', 'level4… && desc`
- `{gtRow} {giRow}` — ExpectationsEditor · l.1748, when `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators`

**Other texts on screen** (69)

- «Cargando...» — ExpectationsEditor · l.981, when `loading \|\| hasPermission === null`
- «No tienes permiso para editar expectativas.» — ExpectationsEditor · l.1001, when `hasPermission === false`
- «de» — ExpectationsEditor · l.1069
- «indicadores configurados» — ExpectationsEditor · l.1069
- «Solo lectura (consultor) / Solo lectura (publicado)» — ExpectationsEditor · l.1083, when `!(isDraft && isAdmin)`
- «Cómo calibrar el template:» — ExpectationsEditor · l.1094
- «Profundidad (0-4):» — ExpectationsEditor · l.1096
- «Selecciona el nivel de madurez esperado para cada año de transformación» — ExpectationsEditor · l.1096
- «Cobertura:» — ExpectationsEditor · l.1097
- «Marca si se espera que el indicador esté implementado en ese año» — ExpectationsEditor · l.1097
- «Frecuencia:» — ExpectationsEditor · l.1098
- «Ingresa el valor mínimo esperado (ej: 4 veces por semestre)» — ExpectationsEditor · l.1098
- «Traspaso:» — ExpectationsEditor · l.1099
- «Marca si se espera que el evaluador adjunte evidencia y sugerencias de mejora ese año» — ExpectationsEditor · l.1099
- «Detalle:» — ExpectationsEditor · l.1100
- «Marca si se espera que el evaluador responda la selección múltiple ese año» — ExpectationsEditor · l.1100
- «Tolerancia:» — ExpectationsEditor · l.1101
- «Define cuántos niveles por debajo de lo esperado se considera &quot;en camino&quot; (0-2)» — ExpectationsEditor · l.1101
- «Deja en blanco (-) si no hay expectativa definida para ese año» — ExpectationsEditor · l.1102
- «Pesos:» — ExpectationsEditor · l.1103
- «Distribuye la importancia relativa (%) de cada proceso, práctica e indicador. Deben sumar 100% en cada nivel.» — ExpectationsEditor · l.1103
- «Área: {AREA_LABELS[template.area]}» — ExpectationsEditor · l.1115
- «Nivel: {template.gradeName}» — ExpectationsEditor · l.1116, when `template.gradeName`
- «Versión: {template.version}» — ExpectationsEditor · l.1117
- «Borrador / Publicado» — ExpectationsEditor · l.1118
- «Este nivel requiere» — ExpectationsEditor · l.1132, when `template.requiresDualExpectations`
- «expectativas duales» — ExpectationsEditor · l.1132, when `template.requiresDualExpectations`
- «: configure tanto» — ExpectationsEditor · l.1132, when `template.requiresDualExpectations`
- «GT» — ExpectationsEditor · l.1134, when `template.requiresDualExpectations`
- «como» — ExpectationsEditor · l.1136, when `template.requiresDualExpectations`
- «GI» — ExpectationsEditor · l.1138, when `template.requiresDualExpectations`
- «para cada indicador.» — ExpectationsEditor · l.1140, when `template.requiresDualExpectations`
- «Cambios sin guardar» (title) — ExpectationsEditor · l.1162, when `weightObjectives.length > 0 && Object.values(weightsDirtyByYear).some(Boolean)`
- «Cambios sin guardar» (aria-label) — ExpectationsEditor · l.1162, when `weightObjectives.length > 0 && Object.values(weightsDirtyByYear).some(Boolean)`
- «Año de transformación» (aria-label) — ExpectationsEditor · l.1181, when `weightObjectives.length > 0 && isWeightDistributorOpen`
- «Cambios sin guardar» (title) — ExpectationsEditor · l.1199, when `weightObjectives.length > 0 && isWeightDistributorOpen && each [1, 2, 3, 4, 5] && weightsDirtyByYear[yr]`
- «Cambios sin guardar para Año {selectedWeightYear}» — ExpectationsEditor · l.1253, when `weightObjectives.length > 0 && isWeightDistributorOpen && weightsDirtyByYear[selectedWeightYear]`
- «Total: {weightSum(currentYearObjs)} %» — ExpectationsEditor · l.1266, when `weightObjectives.length > 0 && isWeightDistributorOpen`
- «Total: {weightSum(obj.modules)} %» — ExpectationsEditor · l.1329, when `weightObjectives.length > 0 && isWeightDistributorOpen && each currentYearObjs && expandedWeightObjective === obj.id && obj.modules.length > 0`
- «Total: {weightSum(mod.indicators)} %» — ExpectationsEditor · l.1397, when `each currentYearObjs && expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules && expandedWeightModule === mod.id && mod.indicators.length > 0`
- «Sin expectativa para Año {selectedWeightYear} — no participará en el registro» (title) — ExpectationsEditor · l.1437, when `expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules && expandedWeightModule === mod.id && mod.indicators.length > 0 && each mod.indicators`
- «Cob / Frec / Tras / Det / Prof» — ExpectationsEditor · l.1444, when `expandedWeightObjective === obj.id && obj.modules.length > 0 && each obj.modules && expandedWeightModule === mod.id && mod.indicators.length > 0 && each mod.indicators`
- «(sin expectativa)» — ExpectationsEditor · l.1462, when `each obj.modules && expandedWeightModule === mod.id && mod.indicators.length > 0 && each mod.indicators && isInactive`
- «Revisa: {invalidFrequencyCells.map(cell => c…}» — ExpectationsEditor · l.1525, when `showFrequencyErrors && invalidFrequencyCells.length > 0`
- «1 expectativa de frecuencia no calza con las reglas de su indicador / {outOfRangeCells.length} expectativas de frecuencia no calzan con las reglas de sus indicadores (mínimo, máximo o pasos). No se podrá publicar el template hasta corregir…» — ExpectationsEditor · l.1539, when `outOfRangeCells.length > 0`
- «Agrega módulos e indicadores al template antes de configurar expectativas.» — ExpectationsEditor · l.1560, when `moduleExpectations.length === 0`
- «Cambios sin guardar» (title) — ExpectationsEditor · l.1622, when `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators && hasDirtyRows`
- «GT» — ExpectationsEditor · l.1662, when `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators && requiresDual`
- «Cob / Frec / Tras / Det / Prof» — ExpectationsEditor · l.1665, when `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators && !(requiresDual)`
- «GI» — ExpectationsEditor · l.1718, when `!(moduleExpectations.length === 0) && each moduleExpectations && each module.indicators && requiresDual && indicator.expectationsGI`
- «Tipos de generación:» — ExpectationsEditor · l.1770, when `moduleExpectations.length > 0 && template?.requiresDualExpectations`
- «GT» — ExpectationsEditor · l.1773, when `moduleExpectations.length > 0 && template?.requiresDualExpectations`
- «Generacion Tractor (expectativas mas altas)» — ExpectationsEditor · l.1774, when `moduleExpectations.length > 0 && template?.requiresDualExpectations`
- «GI» — ExpectationsEditor · l.1777, when `moduleExpectations.length > 0 && template?.requiresDualExpectations`
- «Generacion Innova (expectativas adaptadas)» — ExpectationsEditor · l.1778, when `moduleExpectations.length > 0 && template?.requiresDualExpectations`
- «Tipos de indicador:» — ExpectationsEditor · l.1784, when `moduleExpectations.length > 0`
- «Cob» — ExpectationsEditor · l.1787, when `moduleExpectations.length > 0`
- «Cobertura (Si/No implementado)» — ExpectationsEditor · l.1788, when `moduleExpectations.length > 0`
- «Frec» — ExpectationsEditor · l.1791, when `moduleExpectations.length > 0`
- «Frecuencia (minimo esperado por periodo)» — ExpectationsEditor · l.1792, when `moduleExpectations.length > 0`
- «Prof» — ExpectationsEditor · l.1795, when `moduleExpectations.length > 0`
- «Profundidad (niveles 0-4)» — ExpectationsEditor · l.1796, when `moduleExpectations.length > 0`
- «Tras» — ExpectationsEditor · l.1799, when `moduleExpectations.length > 0`
- «Traspaso (Se espera evidencia y mejoras ese ano)» — ExpectationsEditor · l.1800, when `moduleExpectations.length > 0`
- «Det» — ExpectationsEditor · l.1803, when `moduleExpectations.length > 0`
- «Detalle (Se espera que el evaluador complete la seleccion multiple ese ano)» — ExpectationsEditor · l.1804, when `moduleExpectations.length > 0`
- «Tolerancia:» — ExpectationsEditor · l.1809, when `moduleExpectations.length > 0`
- «Número de niveles por debajo del esperado que se considera &quot;en camino&quot;. Por ejemplo, si el esperado es nivel 3 y tolerancia es 1, alcanzar nivel 2 se considera &quot;en camino&quot;.» — ExpectationsEditor · l.1809, when `moduleExpectations.length > 0`
- «Hay cambios sin guardar» — ExpectationsEditor · l.1821, when `hasChanges && isAdmin`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `lib/services/assessment-builder/frequencyConfig.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/assessment-builder/templates/[templateId]/expectations` | GET, PUT | `pages/admin/assessment-builder/[templateId]/expectations.tsx:232`, `pages/admin/assessment-builder/[templateId]/expectations.tsx:612`, `pages/admin/assessment-builder/[templateId]/expectations.tsx:694`, `pages/admin/assessment-builder/[templateId]/expectations.tsx:756` |

## /admin/assessment-builder/[templateId]

File `pages/admin/assessment-builder/[templateId]/index.tsx` · 3207 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.1337 `router.push → /login`
  - l.1385 `No tienes permiso para editar templates de registro.`
  - l.1426 `canEdit = !isArchived && isAdmin`
- Linked from: `pages/admin/assessment-builder/[templateId]/expectations.tsx:1060`, `pages/admin/assessment-builder/[templateId]/expectations.tsx:1562`, `pages/admin/assessment-builder/create.tsx:218`, `pages/admin/assessment-builder/index.tsx:335`, `pages/admin/assessment-builder/index.tsx:608`, `pages/api/qa/seed-codebase-index.ts:195`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/assessment-frequency-validation.spec.ts`; unit tests of the page: `__tests__/api/assessment-builder/duplicate-from-editor.test.ts`, `__tests__/api/assessment-builder/publish-indicator-count.test.ts`, `__tests__/pages/admin/assessment-builder-frequency.test.tsx`, `__tests__/pages/admin/assessment-builder-publish.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | sent to /dashboard |
| lider_generacion | — | sent to /dashboard |
| lider_comunidad | — | sent to /dashboard |
| supervisor_de_red | — | sent to /dashboard |
| community_manager | — | sent to /dashboard |
| docente | — | sent to /dashboard |
| encargado_licitacion | — | sent to /dashboard |

### What the page file itself draws

**Titles** (17)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `hasPermission === false` | TemplateEditor · l.1384 |
| «Template no encontrado» | h1 | `!template` | TemplateEditor · l.1410 |
| «Este template tiene registros en uso» | h4 | `!isDraft && usageStats?.hasResponses` | TemplateEditor · l.1463 |
| «{template.name}» | h2 | `!(isEditingTemplate)` | TemplateEditor · l.1522 |
| «{ENTITY_LABELS.objectives}» | h3 |  | TemplateEditor · l.1780 |
| «Sin {ENTITY_LABELS.objectives.toLowerCas…}» | h4 | `objectives.length === 0` | TemplateEditor · l.1798 |
| «{ENTITY_LABELS.modules} ( {objectiveModules.length} )» | h4 | `!(objectives.length === 0) && each objectives && objective.isExpanded` | TemplateEditor · l.1896 |
| «{ENTITY_LABELS.indicators} ( {(module.indicators \|\| []).length} )» | h5 | `objective.isExpanded && !(objectiveModules.length === 0) && each objectiveModules && module.isExpanded` | TemplateEditor · l.2003 |
| «Acceso Demo» | h3 | `template.status === 'published' && !isArchived && isAdmin` | TemplateEditor · l.2137 |
| «Editar {ENTITY_LABELS.objective} / Nuevo {ENTITY_LABELS.objective}» | h3 | `isObjectiveModalOpen` | TemplateEditor · l.2324 |
| «Editar {ENTITY_LABELS.module} / Nueva {ENTITY_LABELS.module}» | h3 | `isModuleModalOpen` | TemplateEditor · l.2389 |
| «Editar {ENTITY_LABELS.indicator} / Nuevo {ENTITY_LABELS.indicator}» | h3 | `isIndicatorModalOpen` | TemplateEditor · l.2473 |
| «Historial de Versiones» | h3 | `isVersionHistoryOpen` | TemplateEditor · l.2898 |
| «Vista Previa del Evaluador» | h3 | `isPreviewOpen && previewModule` | TemplateEditor · l.2982 |
| «{previewModule.name}» | h4 | `isPreviewOpen && previewModule` | TemplateEditor · l.2998 |
| «{indicator.name}» | h5 | `isPreviewOpen && previewModule && !(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted` | TemplateEditor · l.3046 |
| «Confirmar Eliminación» | h3 | `showDeleteConfirm && deleteConfirmData` | TemplateEditor · l.3159 |

**Buttons** (59)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Guardando... / Guardar» | `{handleUpdateTemplate}` | `isEditingTemplate` | `{isSaving}` |  | TemplateEditor · l.1501 |
| «Cancelar» | `{() => { setIsEditingTemplate(false); setTemplateForm({ name: template.name, des…}` | `isEditingTemplate` |  |  | TemplateEditor · l.1508 |
| «[icon Edit2]» · tooltip «Editar información» · aria «Editar información del template» | `{() => setIsEditingTemplate(true)}` | `!isEditingTemplate && canEdit` |  |  | TemplateEditor · l.1540 |
| «[icon History]» · tooltip «Historial de versiones» · aria «Ver historial de versiones» | `{openVersionHistory}` | `!isEditingTemplate` |  |  | TemplateEditor · l.1549 |
| «¿Eliminar?» | `{executeConfirm}` | `isDraft && isAdmin && pendingConfirm?.key === 'delete-draft-template'` |  |  | TemplateEditor · l.1574 |
| «Cancelar» | `{cancelConfirm}` | `isDraft && isAdmin && pendingConfirm?.key === 'delete-draft-template'` |  |  | TemplateEditor · l.1580 |
| «Eliminando... / Eliminar» · tooltip «Eliminar template» | `{handleDelete}` | `isDraft && isAdmin && !(pendingConfirm?.key === 'delete-draft-template')` | `{isDeleting}` |  | TemplateEditor · l.1588 |
| «Sí, publicar» | `{() => executePublish()}` | `isDraft && isAdmin && publishStep === 'confirm'` |  | `testid=publish-confirm-btn` | TemplateEditor · l.1609 |
| «Cancelar» | `{() => setPublishStep(null)}` | `isDraft && isAdmin && publishStep === 'confirm'` |  | `testid=publish-cancel-btn` | TemplateEditor · l.1616 |
| «Publicando... / Publicar» · tooltip «{modules.length === 0 ? `Agrega ${ENTITY_LABELS.modules.toLowerCase()} e indicad…}» | `{handlePublish}` | `isDraft && isAdmin && !(publishStep === 'confirm')` | `{isPublishing \|\| modules.length === 0}` | `testid=publish-btn` | TemplateEditor · l.1625 |
| «Eliminando... / Eliminar» · tooltip «Eliminar template» | `{handleDelete}` | `!(isDraft) && isArchived && isAdmin` | `{isDeleting}` |  | TemplateEditor · l.1647 |
| «Restaurando... / Restaurar» | `{handleRestore}` | `!(isDraft) && isArchived && isAdmin` | `{isArchiving}` |  | TemplateEditor · l.1656 |
| «¿Confirmar?» | `{executeConfirm}` | `!(isDraft) && isArchived && isAdmin && pendingConfirm?.key === 'duplicate-template'` |  |  | TemplateEditor · l.1666 |
| «Cancelar» | `{cancelConfirm}` | `!(isDraft) && isArchived && isAdmin && pendingConfirm?.key === 'duplicate-template'` |  |  | TemplateEditor · l.1672 |
| «Creando borrador... / Editar (Nueva Versión)» | `{confirmDuplicate}` | `!(isDraft) && isArchived && isAdmin && !(pendingConfirm?.key === 'duplicate-template')` | `{isDuplicating}` |  | TemplateEditor · l.1680 |
| «¿Archivar?» | `{executeConfirm}` | `!(isDraft) && !(isArchived) && isAdmin && pendingConfirm?.key === 'archive-template'` |  |  | TemplateEditor · l.1711 |
| «Cancelar» | `{cancelConfirm}` | `!(isDraft) && !(isArchived) && isAdmin && pendingConfirm?.key === 'archive-template'` |  |  | TemplateEditor · l.1717 |
| «Archivando... / Archivar» · tooltip «Archivar template» | `{confirmArchive}` | `!(isDraft) && !(isArchived) && isAdmin && !(pendingConfirm?.key === 'archive-template')` | `{isArchiving}` |  | TemplateEditor · l.1725 |
| «¿Confirmar?» | `{executeConfirm}` | `!(isDraft) && !(isArchived) && isAdmin && pendingConfirm?.key === 'duplicate-template'` |  |  | TemplateEditor · l.1745 |
| «Cancelar» | `{cancelConfirm}` | `!(isDraft) && !(isArchived) && isAdmin && pendingConfirm?.key === 'duplicate-template'` |  |  | TemplateEditor · l.1751 |
| «Duplicando... / Duplicar» · tooltip «Crear copia borrador» | `{confirmDuplicate}` | `!(isDraft) && !(isArchived) && isAdmin && !(pendingConfirm?.key === 'duplicate-template')` | `{isDuplicating}` |  | TemplateEditor · l.1759 |
| «Agregar {ENTITY_LABELS.objective}» | `{() => openObjectiveModal()}` | `canEdit` |  | `testid=add-objective-btn` | TemplateEditor · l.1784 |
| «Agregar {ENTITY_LABELS.objective}» | `{() => openObjectiveModal()}` | `objectives.length === 0 && canEdit` |  |  | TemplateEditor · l.1803 |
| «# {objIndex + 1} {objective.name} {objectiveModules.length} {ENTITY_LABELS.modules.toLowerCase()} / {ENTITY_LABELS.module.toLowerCase()} [{objective.description}]» · aria «{`${objective.isExpanded ? 'Contraer' : 'Expandir'} ${ENTITY_LABELS.objective.to…}» | `{() => setObjectives(prev => prev.map(o => o.id === objective.id ? { ...o, isExp…}` | `!(objectives.length === 0) && each objectives` |  |  | TemplateEditor · l.1826 |
| «[icon Edit2]» · tooltip «{`Editar ${ENTITY_LABELS.objective.toLowerCase()}`}» · aria «{`Editar ${ENTITY_LABELS.objective.toLowerCase()}: ${objective.name}`}» | `{() => openObjectiveModal(objective)}` | `!(objectives.length === 0) && each objectives && canEdit` |  |  | TemplateEditor · l.1855 |
| «¿Eliminar?» | `{executeConfirm}` | `!(objectives.length === 0) && each objectives && canEdit && pendingConfirm?.key === 'delete-objective-${objective.id}'` |  |  | TemplateEditor · l.1865 |
| «Cancelar» | `{cancelConfirm}` | `!(objectives.length === 0) && each objectives && canEdit && pendingConfirm?.key === 'delete-objective-${objective.id}'` |  |  | TemplateEditor · l.1871 |
| «[icon Trash2]» · tooltip «{`Eliminar ${ENTITY_LABELS.objective.toLowerCase()}`}» · aria «{`Eliminar ${ENTITY_LABELS.objective.toLowerCase()}: ${objective.name}`}» | `{() => confirmDeleteObjective(objective)}` | `!(objectives.length === 0) && each objectives && canEdit && !(pendingConfirm?.key === 'delete-objective-${objective.id}')` |  |  | TemplateEditor · l.1879 |
| «Agregar {ENTITY_LABELS.module}» | `{() => openModuleModal(objective.id)}` | `!(objectives.length === 0) && each objectives && objective.isExpanded && canEdit` |  | `testid=add-module-btn` | TemplateEditor · l.1900 |
| «# {modIndex + 1} {module.name} [{module.description}]» | `{() => toggleModuleExpand(module.id)}` | `each objectives && objective.isExpanded && !(objectiveModules.length === 0) && each objectiveModules` |  |  | TemplateEditor · l.1924 |
| «[icon Eye]» · tooltip «Vista previa del evaluador» · aria «{`Vista previa del evaluador: ${module.name}`}» | `{() => openModulePreview(module)}` | `each objectives && objective.isExpanded && !(objectiveModules.length === 0) && each objectiveModules` |  |  | TemplateEditor · l.1944 |
| «[icon Edit2]» · tooltip «{`Editar ${ENTITY_LABELS.module.toLowerCase()}`}» · aria «{`Editar ${ENTITY_LABELS.module.toLowerCase()}: ${module.name}`}» | `{() => openModuleModal(objective.id, module)}` | `objective.isExpanded && !(objectiveModules.length === 0) && each objectiveModules && canEdit` |  |  | TemplateEditor · l.1954 |
| «¿Eliminar?» | `{executeConfirm}` | `!(objectiveModules.length === 0) && each objectiveModules && canEdit && pendingConfirm?.key === 'delete-module-${module.id}'` |  |  | TemplateEditor · l.1964 |
| «Cancelar» | `{cancelConfirm}` | `!(objectiveModules.length === 0) && each objectiveModules && canEdit && pendingConfirm?.key === 'delete-module-${module.id}'` |  |  | TemplateEditor · l.1970 |
| «[icon Trash2]» · tooltip «{`Eliminar ${ENTITY_LABELS.module.toLowerCase()}`}» · aria «{`Eliminar ${ENTITY_LABELS.module.toLowerCase()}: ${module.name}`}» | `{() => confirmDeleteModule(module)}` | `!(objectiveModules.length === 0) && each objectiveModules && canEdit && !(pendingConfirm?.key === 'delete-module-${module.id}')` |  |  | TemplateEditor · l.1978 |
| «Agregar» | `{() => openIndicatorModal(module.id)}` | `!(objectiveModules.length === 0) && each objectiveModules && module.isExpanded && canEdit` |  | `testid=add-indicator-btn` | TemplateEditor · l.2007 |
| «[icon Edit2]» · tooltip «Editar indicador» · aria «{`Editar indicador: ${indicator.name}`}» | `{() => openIndicatorModal(module.id, indicator)}` | `!(!module.indicatorsLoaded) && (!((module.indicators \|\| []).length === 0)) && (each (module.indicators \|\| [])) && canEdit` |  |  | TemplateEditor · l.2067 |
| «¿Eliminar?» | `{executeConfirm}` | `(each (module.indicators \|\| [])) && canEdit && !isLockedCobertura && pendingConfirm?.key === 'delete-indicator-${indicator.id}'` |  |  | TemplateEditor · l.2078 |
| «Cancelar» | `{cancelConfirm}` | `(each (module.indicators \|\| [])) && canEdit && !isLockedCobertura && pendingConfirm?.key === 'delete-indicator-${indicator.id}'` |  |  | TemplateEditor · l.2084 |
| «[icon Trash2]» · tooltip «Eliminar indicador» · aria «{`Eliminar indicador: ${indicator.name}`}» | `{() => confirmDeleteIndicator(module.id, indicator)}` | `(each (module.indicators \|\| [])) && canEdit && !isLockedCobertura && !(pendingConfirm?.key === 'delete-indicator-${indicator.id}')` |  |  | TemplateEditor · l.2092 |
| «Acceso Demo {demoUsers.length} usuario s con acceso» | `{handleDemoSectionToggle}` | `template.status === 'published' && !isArchived && isAdmin` |  |  | TemplateEditor · l.2130 |
| «Copiar enlace demo» | `{copyDemoLink}` | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen` |  |  | TemplateEditor · l.2154 |
| «{u.full_name} / {u.email} [{u.email}] [Seleccionado]» | `{() => { if (selectedDemoUsers.includes(u.id)) { setSelectedDemoUsers(prev => pr…}` | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && demoSearchResults.length > 0 && each demoSearchResults` |  |  | TemplateEditor · l.2190 |
| «[icon X]» | `{() => setSelectedDemoUsers(prev => prev.filter(id => id !== uid))}` | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && selectedDemoUsers.length > 0 && each selectedDemoUsers` |  |  | TemplateEditor · l.2231 |
| «Otorgando... / Otorgar Acceso» | `{handleGrantDemoAccess}` | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && selectedDemoUsers.length > 0` | `{grantingAccess}` |  | TemplateEditor · l.2240 |
| «Revocando... / Revocar» | `{() => handleRevokeDemoAccess(du.user_id)}` | `isDemoSectionOpen && !(loadingDemoUsers) && !(demoUsers.length === 0) && each demoUsers` | `{revokingUserId === du.user_id}` |  | TemplateEditor · l.2291 |
| «Cancelar» | `{() => setIsObjectiveModalOpen(false)}` | `isObjectiveModalOpen` |  |  | TemplateEditor · l.2358 |
| «Guardando... / Actualizar / Crear» | `{handleSaveObjective}` | `isObjectiveModalOpen` | `{isSaving}` |  | TemplateEditor · l.2364 |
| «Cancelar» | `{() => setIsModuleModalOpen(false)}` | `isModuleModalOpen` |  |  | TemplateEditor · l.2441 |
| «Guardando... / Actualizar / Crear» | `{handleSaveModule}` | `isModuleModalOpen` | `{isSaving}` |  | TemplateEditor · l.2447 |
| «[icon X]» · aria «Eliminar opción» | `{() => { const newOptions = indicatorForm.detalleOptions.filter((_, i) => i !== …}` | `isIndicatorModalOpen && indicatorForm.category === 'detalle' && each indicatorForm.detalleOptions && indicatorForm.detalleOptions.length > 2` |  |  | TemplateEditor · l.2751 |
| «Agregar opción» | `{() => { setIndicatorForm({ ...indicatorForm, detalleOptions: [...indicatorForm.…}` | `isIndicatorModalOpen && indicatorForm.category === 'detalle' && indicatorForm.detalleOptions.length < 15` |  |  | TemplateEditor · l.2767 |
| «Cancelar» | `{() => setIsIndicatorModalOpen(false)}` | `isIndicatorModalOpen` |  |  | TemplateEditor · l.2865 |
| «Guardando... / Actualizar / Crear» | `{handleSaveIndicator}` | `isIndicatorModalOpen` | `{isSaving}` | `testid=indicator-save-btn` | TemplateEditor · l.2871 |
| «×» | `{() => setIsVersionHistoryOpen(false)}` | `isVersionHistoryOpen` |  |  | TemplateEditor · l.2901 |
| «Cerrar» | `{() => setIsVersionHistoryOpen(false)}` | `isVersionHistoryOpen` |  |  | TemplateEditor · l.2955 |
| «[icon X]» · aria «Cerrar vista previa» | `{() => setIsPreviewOpen(false)}` | `isPreviewOpen && previewModule` |  |  | TemplateEditor · l.2985 |
| «Cancelar» | `{() => { setShowDeleteConfirm(false); setDeleteConfirmData(null); }}` | `showDeleteConfirm && deleteConfirmData` |  |  | TemplateEditor · l.3182 |
| «Eliminando... / Eliminar Permanentemente» | `{() => executeDelete(true)}` | `showDeleteConfirm && deleteConfirmData` | `{isDeleting}` |  | TemplateEditor · l.3191 |

**Links** (12)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ir al Panel» | `/dashboard` | `hasPermission === false` |  | TemplateEditor · l.1386 |
| «Ir al Panel» |  | `hasPermission === false` |  | TemplateEditor · l.1387 |
| «Volver a la lista» | `/admin/assessment-builder` | `!template` |  | TemplateEditor · l.1411 |
| «Volver a la lista» |  | `!template` |  | TemplateEditor · l.1412 |
| «Volver a la lista» | `/admin/assessment-builder` |  |  | TemplateEditor · l.1446 |
| «Volver a la lista» |  |  |  | TemplateEditor · l.1447 |
| «Calibración» | `/admin/assessment-builder/[*]/expectations` | `isDraft` |  | TemplateEditor · l.1599 |
| «Calibración» |  | `isDraft` |  | TemplateEditor · l.1600 |
| «Probar Demo» | `/demo/assessments/[*]` | `!(isDraft) && !(isArchived)` |  | TemplateEditor · l.1702 |
| «Probar Demo» |  | `!(isDraft) && !(isArchived)` |  | TemplateEditor · l.1703 |
| «Calibración» | `/admin/assessment-builder/[*]/expectations` | `!(isDraft) && !(isArchived)` |  | TemplateEditor · l.1736 |
| «Calibración» |  | `!(isDraft) && !(isArchived)` |  | TemplateEditor · l.1737 |

**Other things that react to a click** (5)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{() => setIsObjectiveModalOpen(false)}` | `isObjectiveModalOpen` | TemplateEditor · l.2316 |
| `div` |  | `{() => setIsModuleModalOpen(false)}` | `isModuleModalOpen` | TemplateEditor · l.2381 |
| `div` |  | `{() => setIsIndicatorModalOpen(false)}` | `isIndicatorModalOpen` | TemplateEditor · l.2465 |
| `div` |  | `{() => setIsVersionHistoryOpen(false)}` | `isVersionHistoryOpen` | TemplateEditor · l.2889 |
| `div` |  | `{() => setIsPreviewOpen(false)}` | `isPreviewOpen && previewModule` | TemplateEditor · l.2971 |

**Fields** (33)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre» | text |  |  | `isEditingTemplate` |  | TemplateEditor · l.1484 |
| «Descripción» | textarea |  |  | `isEditingTemplate` |  | TemplateEditor · l.1493 |
| «Agregar usuarios» | text | «Buscar por nombre o email...» |  | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen` |  | TemplateEditor · l.2174 |
| «Nombre *» | text | «{`Ej: ${ENTITY_LABELS.objective} 1`}» |  | `isObjectiveModalOpen` | `id=objective-name (id used by code)` | TemplateEditor · l.2333 |
| «Descripción» | textarea | «Descripción del objetivo...» |  | `isObjectiveModalOpen` | `id=objective-description (id used by code)` | TemplateEditor · l.2345 |
| «Nombre *» | text | «Ej: Conocimiento del Estudiante» |  | `isModuleModalOpen` | `id=module-name (id used by code)` | TemplateEditor · l.2398 |
| «Descripción» | textarea | «Ej: Práctica centrada en conocer el contexto de cada estudiante» |  | `isModuleModalOpen` | `id=module-description (id used by code)` | TemplateEditor · l.2410 |
| «Instrucciones» | textarea | «Ej: Para evaluar esta práctica, revise los registros de entrevistas individuales y compare con el plan de acompañamiento...» |  | `isModuleModalOpen` | `id=module-instructions (id used by code)` | TemplateEditor · l.2425 |
| «Nombre *» | text | «Ej: Conocimiento de contextos» |  | `isIndicatorModalOpen` | `id=indicator-name (id used by code)` | TemplateEditor · l.2484 |
| «Código» | text | «Ej: P1.1» |  | `isIndicatorModalOpen` | `id=indicator-code (id used by code)` | TemplateEditor · l.2495 |
| «Descripción» | textarea | «Descripción del indicador...» |  | `isIndicatorModalOpen` | `id=indicator-description (id used by code)` | TemplateEditor · l.2508 |
| «Orientaciones para interpretar el indicador» | textarea | «Instrucciones para el LLM al interpretar este indicador en el informe...» |  | `isIndicatorModalOpen` | `id=indicator-evaluation-guidance (id used by code)` | TemplateEditor · l.2525 |
| «Categoría *» | select | disabled: `{isFirstIndicatorLocked}` | «Cobertura (Sí/No)», «Frecuencia (Número)», «Profundidad (Niveles 0-4)», «Traspaso (Evidencia + Sugerencias)», «Detalle (Selección múltiple)» | `isIndicatorModalOpen` | `id=indicator-category (id used by code)` | TemplateEditor · l.2543 |
| «Por {FREQUENCY_UNIT_LABELS[unit]}» | checkbox |  |  | `isIndicatorModalOpen && indicatorForm.category === 'frecuencia' && each FREQUENCY_UNIT_OPTIONS` | `testid=frequency-allowed-unit-{unit}` | TemplateEditor · l.2580 |
| «Período por defecto *» | select |  | «(lista) Por {FREQUENCY_UNIT_LABELS[unit]}» | `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'` | `testid=frequency-default-unit id=frequency-default-unit (id used by code)` | TemplateEditor · l.2618 |
| «Valor mínimo» | number |  |  | `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'` | `testid=frequency-min id=frequency-min (id used by code)` | TemplateEditor · l.2645 |
| «Valor máximo» | number |  |  | `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'` | `testid=frequency-max id=frequency-max (id used by code)` | TemplateEditor · l.2656 |
| «Paso» | number | `min={0}` |  | `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'` | `testid=frequency-step id=frequency-step (id used by code)` | TemplateEditor · l.2667 |
| «Enlace de Evidencia (URL)» | text | «https://...» · disabled: `true` |  | `isIndicatorModalOpen && indicatorForm.category === 'traspaso'` |  | TemplateEditor · l.2701 |
| «Sugerencias de Mejora» | textarea | «Describe las sugerencias de mejora...» · disabled: `true` |  | `isIndicatorModalOpen && indicatorForm.category === 'traspaso'` |  | TemplateEditor · l.2712 |
| «{`Opción ${idx + 1}`}» | text | «{`Opción ${idx + 1}`}» · `maxLength={200}` |  | `isIndicatorModalOpen && indicatorForm.category === 'detalle' && each indicatorForm.detalleOptions` |  | TemplateEditor · l.2738 |
| «Nivel 0 - No implementado» | text | «Descriptor para nivel 0...» |  | `isIndicatorModalOpen && indicatorForm.category === 'profundidad'` |  | TemplateEditor · l.2803 |
| «Nivel 1 - Inicial» | text | «Descriptor para nivel 1...» |  | `isIndicatorModalOpen && indicatorForm.category === 'profundidad'` |  | TemplateEditor · l.2815 |
| «Nivel 2 - En desarrollo» | text | «Descriptor para nivel 2...» |  | `isIndicatorModalOpen && indicatorForm.category === 'profundidad'` |  | TemplateEditor · l.2827 |
| «Nivel 3 - Consolidado» | text | «Descriptor para nivel 3...» |  | `isIndicatorModalOpen && indicatorForm.category === 'profundidad'` |  | TemplateEditor · l.2839 |
| «Nivel 4 - Ejemplar» | text | «Descriptor para nivel 4...» |  | `isIndicatorModalOpen && indicatorForm.category === 'profundidad'` |  | TemplateEditor · l.2851 |
| «Sí» | radio | `{'preview-${indicator.id}'}` |  | `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'cobertura'` |  | TemplateEditor · l.3056 |
| «No» | radio | `{'preview-${indicator.id}'}` |  | `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'cobertura'` |  | TemplateEditor · l.3064 |
| «Valor» | number | «Valor» · disabled: `true` |  | `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'frecuencia'` |  | TemplateEditor · l.3074 |
| «{level} : {desc}» | radio | `{'preview-prof-${indicator.id}'}` · disabled: `true` |  | `each sorted && indicator.category === 'profundidad' && each ([0, 1, 2, 3, 4] as const) && desc` |  | TemplateEditor · l.3083 |
| «Adjunte link a carpeta con evidencia de sus respuestas» | url | «https://...» · disabled: `true` |  | `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'traspaso'` |  | TemplateEditor · l.3096 |
| «Mejoras sugeridas» | textarea | «¿Con la experiencia adquirida, qué mejoras sugieres...?» · disabled: `true` |  | `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'traspaso'` |  | TemplateEditor · l.3103 |
| «{opt}» | checkbox | disabled: `true` |  | `(!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'detalle' && (each (indicator.detalleOptions \|\| []))` |  | TemplateEditor · l.3112 |

**Table columns** (4)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && !(loadingDemoUsers) && !(demoUsers.length === 0)` | TemplateEditor · l.2264 |
| «Email» | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && !(loadingDemoUsers) && !(demoUsers.length === 0)` | TemplateEditor · l.2267 |
| «Acceso otorgado» | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && !(loadingDemoUsers) && !(demoUsers.length === 0)` | TemplateEditor · l.2270 |
| «Acción» | `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && !(loadingDemoUsers) && !(demoUsers.length === 0)` | TemplateEditor · l.2273 |

**Pop-ups** (11)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar {ENTITY_LABELS.objective} / Nuevo {ENTITY_LABELS.objective}» | written in this file | `isObjectiveModalOpen` |  | TemplateEditor · l.2314 |
| «Editar {ENTITY_LABELS.objective} / Nuevo {ENTITY_LABELS.objective}» | written in this file | `isObjectiveModalOpen` |  | TemplateEditor · l.2318 |
| «Editar {ENTITY_LABELS.module} / Nueva {ENTITY_LABELS.module}» | written in this file | `isModuleModalOpen` |  | TemplateEditor · l.2379 |
| «Editar {ENTITY_LABELS.module} / Nueva {ENTITY_LABELS.module}» | written in this file | `isModuleModalOpen` |  | TemplateEditor · l.2383 |
| «Editar {ENTITY_LABELS.indicator} / Nuevo {ENTITY_LABELS.indicator}» | written in this file | `isIndicatorModalOpen` |  | TemplateEditor · l.2463 |
| «Editar {ENTITY_LABELS.indicator} / Nuevo {ENTITY_LABELS.indicator}» | written in this file | `isIndicatorModalOpen` |  | TemplateEditor · l.2467 |
| «Historial de Versiones» | written in this file | `isVersionHistoryOpen` |  | TemplateEditor · l.2887 |
| «Historial de Versiones» | written in this file | `isVersionHistoryOpen` |  | TemplateEditor · l.2891 |
| «Vista Previa del Evaluador» | written in this file | `isPreviewOpen && previewModule` |  | TemplateEditor · l.2969 |
| «Vista Previa del Evaluador» | written in this file | `isPreviewOpen && previewModule` |  | TemplateEditor · l.2973 |
| «Confirmar Eliminación» | written in this file | `showDeleteConfirm && deleteConfirmData` |  | TemplateEditor · l.3157 |

**Toasts** (49)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar el template» |  | TemplateEditor · l.381 |
| success | «Template actualizado» |  | handleUpdateTemplate · l.417 |
| error | «Error al actualizar el template» |  | handleUpdateTemplate · l.420 |
| error | «El nombre del objetivo es requerido» | `!objectiveForm.name.trim()` | handleSaveObjective · l.444 |
| success | «{ENTITY_LABELS.objective} actualizado» | `editingObjective` | handleSaveObjective · l.472 |
| success | «{ENTITY_LABELS.objective} creado» | `!(editingObjective)` | handleSaveObjective · l.491 |
| error | «{msg}» |  | handleSaveObjective · l.497 |
| success | «{ENTITY_LABELS.objective} eliminado» |  | handleDeleteObjective · l.520 |
| error | «{msg}» |  | handleDeleteObjective · l.523 |
| error | «El nombre de la {ENTITY_LABELS.module} es requerido» | `!moduleForm.name.trim()` | handleSaveModule · l.547 |
| success | «{ENTITY_LABELS.module} actualizada» | `editingModule` | handleSaveModule · l.577 |
| success | «{ENTITY_LABELS.module} creada» | `!(editingModule)` | handleSaveModule · l.599 |
| error | «Error al guardar la {ENTITY_LABELS.module.toLowe…}» |  | handleSaveModule · l.605 |
| success | «{ENTITY_LABELS.module} eliminada» |  | handleDeleteModule · l.626 |
| error | «{msg}» |  | handleDeleteModule · l.629 |
| error | «El nombre del indicador es requerido» | `!indicatorForm.name.trim()` | handleSaveIndicator · l.754 |
| error | «{result.error!}» | `indicatorForm.category === 'profundidad' && !result.valid` | handleSaveIndicator · l.768 |
| error | «Los indicadores de frecuencia requieren al menos un período permitido» | `indicatorForm.category === 'frecuencia' && indicatorForm.frequencyUnitOptions.length === 0` | handleSaveIndicator · l.777 |
| error | «Configuración de frecuencia incompleta: {check.errors[0]}» | `indicatorForm.category === 'frecuencia' && !check.valid` | handleSaveIndicator · l.782 |
| error | «Los indicadores de detalle requieren al menos 2 opciones» | `indicatorForm.category === 'detalle' && filledOptions.length < 2` | handleSaveIndicator · l.791 |
| error | «Las opciones de detalle no pueden repetirse» | `indicatorForm.category === 'detalle' && unique.size !== filledOptions.length` | handleSaveIndicator · l.796 |
| success | «Indicador actualizado» | `editingIndicator` | handleSaveIndicator · l.863 |
| plain | «Atención: {data.expectationWarnings.le…} expectativa(s) ya no calzan con las nuevas reglas / y deben corregirse en Expectativas antes de publicar. {data.expectationWarnings.jo…}» | `editingIndicator && Array.isArray(data.expectationWarnings) && data.expectationWarnings.length > 0` | handleSaveIndicator · l.867 |
| success | «Indicador creado» | `!(editingIndicator)` | handleSaveIndicator · l.897 |
| error | «{msg}» |  | handleSaveIndicator · l.903 |
| success | «Indicador eliminado» |  | handleDeleteIndicator · l.930 |
| plain | «Los códigos de indicadores pueden no coincidir con el orden actual» |  | handleDeleteIndicator · l.931 |
| error | «{msg}» |  | handleDeleteIndicator · l.934 |
| error | «El template debe tener al menos una {ENTITY_LABELS.module.toLowe…} para ser publicado» | `modules.length === 0` | handlePublish · l.943 |
| error | «{indicatorBlocker}» | `indicatorBlocker` | handlePublish · l.949 |
| success | «Template publicado correctamente» |  | executePublish · l.979 |
| error | «Error al publicar template» |  | executePublish · l.982 |
| success | «Nueva versión borrador creada. Ahora puedes editar.» |  | handleDuplicate · l.1004 |
| error | «Error al duplicar template» |  | handleDuplicate · l.1009 |
| success | «Template archivado correctamente» |  | handleArchive · l.1048 |
| error | «Error al archivar template» |  | handleArchive · l.1052 |
| success | «Template restaurado correctamente» |  | handleRestore · l.1073 |
| error | «Error al restaurar template» |  | handleRestore · l.1078 |
| error | «Los templates publicados deben ser archivados antes de eliminarse» | `!template.is_archived` | handleDelete · l.1096 |
| success | «Template eliminado correctamente» |  | handleDelete · l.1121 |
| error | «Error al eliminar template» |  | handleDelete · l.1125 |
| success | «Template eliminado correctamente» |  | executeDelete · l.1150 |
| error | «Error al eliminar template» |  | executeDelete · l.1154 |
| success | «Acceso demo otorgado» |  | handleGrantDemoAccess · l.1285 |
| error | «Error al otorgar acceso demo» |  | handleGrantDemoAccess · l.1291 |
| success | «Acceso demo revocado» |  | handleRevokeDemoAccess · l.1313 |
| error | «Error al revocar acceso demo» |  | handleRevokeDemoAccess · l.1316 |
| success | «Enlace copiado al portapapeles» |  | copyDemoLink · l.1327 |
| error | «No se pudo copiar el enlace» |  | copyDemoLink · l.1329 |

**Messages set on the page** (18)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar el template» | `throw (shown by whoever catches it)` | `!templateRes.ok` | TemplateEditor · l.353 |
| «Error al actualizar el template» | `throw (shown by whoever catches it)` | `!response.ok` | handleUpdateTemplate · l.411 |
| «Error al actualizar el objetivo» | `throw (shown by whoever catches it)` | `editingObjective && !response.ok` | handleSaveObjective · l.465 |
| «Error al crear el objetivo» | `throw (shown by whoever catches it)` | `!(editingObjective) && !response.ok` | handleSaveObjective · l.486 |
| «Error al eliminar el objetivo» | `throw (shown by whoever catches it)` | `!response.ok` | handleDeleteObjective · l.514 |
| «Error al actualizar la {ENTITY_LABELS.module}» | `throw (shown by whoever catches it)` | `editingModule && !response.ok` | handleSaveModule · l.570 |
| «Error al crear la {ENTITY_LABELS.module}» | `throw (shown by whoever catches it)` | `!(editingModule) && !response.ok` | handleSaveModule · l.594 |
| «Error al eliminar la {ENTITY_LABELS.module}» | `throw (shown by whoever catches it)` | `!response.ok` | handleDeleteModule · l.622 |
| «Error al crear el indicador» | `throw (shown by whoever catches it)` | `!(editingIndicator) && !response.ok` | handleSaveIndicator · l.886 |
| «Error al eliminar el indicador» | `throw (shown by whoever catches it)` | `!response.ok` | handleDeleteIndicator · l.920 |
| «Error al publicar» | `throw (shown by whoever catches it)` | `!response.ok` | executePublish · l.973 |
| «Error al duplicar» | `throw (shown by whoever catches it)` | `!response.ok` | handleDuplicate · l.1000 |
| «Error al archivar template» | `throw (shown by whoever catches it)` | `!response.ok` | handleArchive · l.1045 |
| «Error al restaurar template» | `throw (shown by whoever catches it)` | `!response.ok` | handleRestore · l.1070 |
| «Error al eliminar template» | `throw (shown by whoever catches it)` | `!response.ok` | handleDelete · l.1118 |
| «Error al eliminar template» | `throw (shown by whoever catches it)` | `!response.ok` | executeDelete · l.1147 |
| «Error al otorgar acceso demo» | `throw (shown by whoever catches it)` | `!response.ok` | handleGrantDemoAccess · l.1283 |
| «Error al revocar acceso demo» | `throw (shown by whoever catches it)` | `!response.ok` | handleRevokeDemoAccess · l.1311 |

**Moves to another page from code** (5)

| Goes to | How | When | Where |
|---|---|---|---|
| `/admin/assessment-builder/[*]` | `router.push` |  | handleDuplicate · l.1006 |
| `/admin/assessment-builder` | `router.push` |  | handleArchive · l.1049 |
| `/admin/assessment-builder` | `router.push` |  | handleDelete · l.1122 |
| `/admin/assessment-builder` | `router.push` |  | executeDelete · l.1151 |
| `/login` | `router.push` |  | handleLogout · l.1337 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `canEdit = !isArchived && isAdmin` | TemplateEditor · l.1426 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!templateId \|\| typeof templateId !== 'string' \|\| !userId \|\| hasPermission === false` | TemplateEditor · l.345 |
| `!template` | TemplateEditor · l.1216 |
| `previewCoberturaAnswer === null` | TemplateEditor · l.3026 |
| `previewCoberturaAnswer === false` | TemplateEditor · l.3027 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `hasPermission === false` |  | TemplateEditor · l.1373 |
| `MainLayout` |  | `!template` |  | TemplateEditor · l.1399 |
| `MainLayout` |  |  |  | TemplateEditor · l.1429 |
| `ResponsiveFunctionalPageHeader` | title: Constructor de Registros |  |  | TemplateEditor · l.1438 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (8)

| Name | Texts | Where |
|---|---|---|
| `STATUS_LABELS` | «Borrador», «Publicado», «Archivado» | l.58 |
| `msg` | «Error al guardar el objetivo» | handleSaveObjective · l.496 |
| `msg` | «Error al eliminar el objetivo» | handleDeleteObjective · l.522 |
| `msg` | «Error al eliminar la {ENTITY_LABELS.module}» | handleDeleteModule · l.628 |
| `msg` | «Error al guardar el indicador» | handleSaveIndicator · l.902 |
| `msg` | «Error al eliminar el indicador» | handleDeleteIndicator · l.933 |
| `publishIndicatorBlocker()` | «El template debe tener al menos un indicador para ser publicado» | publishIndicatorBlocker · l.95 |
| `TemplateEditor()` | «Para publicar: {check.errors[0]}» | TemplateEditor · l.2680 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Error al actualizar el indicador» | TemplateEditor · l.847 |
| «Agrega {ENTITY_LABELS.modules.toLow…} e indicadores antes de publicar» | TemplateEditor · l.1630 |
| «Publicar template» | TemplateEditor · l.1630 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (8)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('keydown')` | TemplateEditor · l.304 |
| storage | `localStorage: rememberMe` | handleLogout · l.1335 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.1336 |
| mark | `testid=objective-card` | TemplateEditor · l.1819 |
| mark | `testid=module-card` | TemplateEditor · l.1918 |
| mark | `testid=indicator-row` | TemplateEditor · l.2029 |
| mark | `testid=frequency-config-hint` | TemplateEditor · l.2681 |
| address value | `[templateId] (part of the address)` | l.1 |

**Values shown from data** (18)

- `{statusStyle.label}` — TemplateEditor · l.1523, when `!(isEditingTemplate)`
- `{template.description}` — TemplateEditor · l.1528, when `!(isEditingTemplate) && template.description`
- `{module.instructions}` — TemplateEditor · l.1997, when `!(objectiveModules.length === 0) && each objectiveModules && module.isExpanded && module.instructions`
- `# {indIndex + 1}` — TemplateEditor · l.2036, when `module.isExpanded && !(!module.indicatorsLoaded) && (!((module.indicators \|\| []).length === 0)) && (each (module.indicators \|\| []))`
- `{indicator.code}` — TemplateEditor · l.2041, when `!(!module.indicatorsLoaded) && (!((module.indicators \|\| []).length === 0)) && (each (module.indicators \|\| [])) && indicator.code`
- `{indicator.name}` — TemplateEditor · l.2045, when `module.isExpanded && !(!module.indicatorsLoaded) && (!((module.indicators \|\| []).length === 0)) && (each (module.indicators \|\| []))`
- `{CATEGORY_LABELS[indicator.category]}` — TemplateEditor · l.2048, when `module.isExpanded && !(!module.indicatorsLoaded) && (!((module.indicators \|\| []).length === 0)) && (each (module.indicators \|\| []))`
- `{du.full_name} / —` — TemplateEditor · l.2281, when `isDemoSectionOpen && !(loadingDemoUsers) && !(demoUsers.length === 0) && each demoUsers`
- `{du.email}` — TemplateEditor · l.2284, when `isDemoSectionOpen && !(loadingDemoUsers) && !(demoUsers.length === 0) && each demoUsers`
- `{new Date(du.granted_at).toLocaleDat…}` — TemplateEditor · l.2287, when `isDemoSectionOpen && !(loadingDemoUsers) && !(demoUsers.length === 0) && each demoUsers`
- `{new Date(version.createdAt).toLocal…}` — TemplateEditor · l.2934, when `isVersionHistoryOpen && !(loadingVersions) && !(versions.length === 0) && each versions`
- `{version.stats.modules} {ENTITY_LABELS.modules.toLowerCase()}` — TemplateEditor · l.2946, when `isVersionHistoryOpen && !(loadingVersions) && !(versions.length === 0) && each versions`
- `{previewModule.description}` — TemplateEditor · l.3000, when `isPreviewOpen && previewModule && previewModule.description`
- `{previewModule.instructions}` — TemplateEditor · l.3005, when `isPreviewOpen && previewModule && previewModule.instructions`
- `{CATEGORY_LABELS[indicator.category]}` — TemplateEditor · l.3033, when `isPreviewOpen && previewModule && !(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted`
- `{indicator.code}` — TemplateEditor · l.3043, when `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.code`
- `{indicator.description}` — TemplateEditor · l.3048, when `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.description`
- `• {deleteConfirmData.counts.modules} {ENTITY_LABELS.modules.toLowerCase()}` — TemplateEditor · l.3174, when `showDeleteConfirm && deleteConfirmData && deleteConfirmData.counts`

**Other texts on screen** (97)

- «Cargando...» — TemplateEditor · l.1365, when `loading \|\| hasPermission === null`
- «No tienes permiso para editar templates de registro.» — TemplateEditor · l.1385, when `hasPermission === false`
- «Hay {usageStats.instanceCount} registro s asignado s con {usageStats.responseCount} respuesta s registrada s . Los cambios que realices afectarán a los nuevos registros. Las respuestas existentes mantendrán su snapshot actual.» — TemplateEditor · l.1466, when `!isDraft && usageStats?.hasResponses`
- «Nombre» (label) — TemplateEditor · l.1483, when `isEditingTemplate`
- «Descripción» (label) — TemplateEditor · l.1492, when `isEditingTemplate`
- «Vía de Evolución: {AREA_LABELS[template.area]}» — TemplateEditor · l.1531, when `!(isEditingTemplate)`
- «Versión: {template.version}» — TemplateEditor · l.1532, when `!(isEditingTemplate)`
- «Modo edición - Puedes modificar el template / Modo lectura - Solo visualización» — TemplateEditor · l.1568, when `isDraft`
- «¿Publicar este template?» — TemplateEditor · l.1608, when `isDraft && isAdmin && publishStep === 'confirm'`
- «Template archivado v {template.version} - No disponible para nuevos registros» — TemplateEditor · l.1643, when `!(isDraft) && isArchived`
- «Template publicado v{template.version} - Puedes editar / Template publicado v{template.version} - Solo lectura» — TemplateEditor · l.1696, when `!(isDraft) && !(isArchived)`
- «(con {usageStats.responseCount} respuestas)» — TemplateEditor · l.1698, when `!(isDraft) && !(isArchived) && usageStats?.hasResponses`
- «{objectives.length} objetivo s» — TemplateEditor · l.1781
- «Agrega {ENTITY_LABELS.objectives.toLowerCas…} para organizar las {ENTITY_LABELS.modules.toLowerCase()} e indicadores que componen el registro» — TemplateEditor · l.1799, when `objectives.length === 0`
- «Sin {ENTITY_LABELS.modules.toLowerCase()} . Agrega {ENTITY_LABELS.modules.toLow…} usando el botón de arriba.» — TemplateEditor · l.1912, when `!(objectives.length === 0) && each objectives && objective.isExpanded && objectiveModules.length === 0`
- «Instrucciones:» — TemplateEditor · l.1996, when `!(objectiveModules.length === 0) && each objectiveModules && module.isExpanded && module.instructions`
- «Cargando indicadores...» — TemplateEditor · l.2019, when `!(objectiveModules.length === 0) && each objectiveModules && module.isExpanded && !module.indicatorsLoaded`
- «Sin indicadores. Agrega indicadores usando el botón de arriba.» — TemplateEditor · l.2021, when `each objectiveModules && module.isExpanded && !(!module.indicatorsLoaded) && ((module.indicators \|\| []).length === 0)`
- «{ENTITY_LABELS.indicator} de cobertura bloqueado (primer {ENTITY_LABELS.indicator.toL…})» (title) — TemplateEditor · l.2038, when `!(!module.indicatorsLoaded) && (!((module.indicators \|\| []).length === 0)) && (each (module.indicators \|\| [])) && isLockedCobertura`
- «/demo/assessments/ {template.id}» — TemplateEditor · l.2161, when `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen`
- «Agregar usuarios» (label) — TemplateEditor · l.2168, when `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen`
- «Buscando...» — TemplateEditor · l.2182, when `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && demoSearching`
- «Cargando usuarios...» — TemplateEditor · l.2254, when `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && loadingDemoUsers`
- «Ningún usuario tiene acceso demo a este template.» — TemplateEditor · l.2257, when `template.status === 'published' && !isArchived && isAdmin && isDemoSectionOpen && !(loadingDemoUsers) && demoUsers.length === 0`
- «Nombre *» (label) — TemplateEditor · l.2330, when `isObjectiveModalOpen`
- «Descripción» (label) — TemplateEditor · l.2344, when `isObjectiveModalOpen`
- «Nombre *» (label) — TemplateEditor · l.2395, when `isModuleModalOpen`
- «Descripción» (label) — TemplateEditor · l.2409, when `isModuleModalOpen`
- «Breve resumen de esta práctica. Aparece como subtítulo bajo el nombre — siempre visible para el evaluador. (1-2 oraciones)» — TemplateEditor · l.2419, when `isModuleModalOpen`
- «Instrucciones» (label) — TemplateEditor · l.2424, when `isModuleModalOpen`
- «Guía detallada para el evaluador. Aparece en un recuadro azul al expandir la sección. Explica qué evidencia buscar y cómo evaluar los indicadores.» — TemplateEditor · l.2434, when `isModuleModalOpen`
- «Nombre *» (label) — TemplateEditor · l.2481, when `isIndicatorModalOpen`
- «Código» (label) — TemplateEditor · l.2494, when `isIndicatorModalOpen`
- «Descripción» (label) — TemplateEditor · l.2507, when `isIndicatorModalOpen`
- «Aparece como texto de ayuda junto al indicador cuando el evaluador lo completa. Aclara qué se está midiendo.» — TemplateEditor · l.2517, when `isIndicatorModalOpen`
- «Orientaciones para interpretar el indicador» (label) — TemplateEditor · l.2522, when `isIndicatorModalOpen`
- «Instrucciones para la IA al generar el informe a partir de las respuestas del registro. Ejemplo: &quot;Realizar esto más de una vez al año no es necesario — no señalar baja frecuencia como problema.&quot;» — TemplateEditor · l.2534, when `isIndicatorModalOpen`
- «Categoría *» (label) — TemplateEditor · l.2540, when `isIndicatorModalOpen`
- «El primer indicador de cada práctica siempre es de tipo Cobertura» — TemplateEditor · l.2560, when `isIndicatorModalOpen && isFirstIndicatorLocked`
- «Períodos permitidos» — TemplateEditor · l.2569, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «(selecciona al menos uno)» — TemplateEditor · l.2571, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «El docente podrá elegir entre estas opciones al responder» — TemplateEditor · l.2575, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «Por {FREQUENCY_UNIT_LABELS[unit]}» (label) — TemplateEditor · l.2579, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia' && each FREQUENCY_UNIT_OPTIONS`
- «Debes seleccionar al menos un período» — TemplateEditor · l.2610, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia' && indicatorForm.frequencyUnitOptions.length === 0`
- «Período por defecto *» (label) — TemplateEditor · l.2615, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «Se muestra seleccionado al docente hasta que elija otro período permitido» — TemplateEditor · l.2632, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «Rango de puntuación» — TemplateEditor · l.2637, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «El puntaje del indicador se normaliza entre el mínimo y el máximo. Requerido para publicar.» — TemplateEditor · l.2640, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «Valor mínimo» (label) — TemplateEditor · l.2644, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «Valor máximo» (label) — TemplateEditor · l.2655, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «Paso» (label) — TemplateEditor · l.2666, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia'`
- «Para publicar: {check.errors[0]}» — TemplateEditor · l.2681, when `isIndicatorModalOpen && indicatorForm.category === 'frecuencia' && !(check.valid)`
- «Vista previa de campos Traspaso» — TemplateEditor · l.2692, when `isIndicatorModalOpen && indicatorForm.category === 'traspaso'`
- «Los docentes verán estos dos campos al responder este indicador» — TemplateEditor · l.2694, when `isIndicatorModalOpen && indicatorForm.category === 'traspaso'`
- «Enlace de Evidencia (URL)» (label) — TemplateEditor · l.2698, when `isIndicatorModalOpen && indicatorForm.category === 'traspaso'`
- «Sugerencias de Mejora» (label) — TemplateEditor · l.2709, when `isIndicatorModalOpen && indicatorForm.category === 'traspaso'`
- «Opciones de selección» — TemplateEditor · l.2727, when `isIndicatorModalOpen && indicatorForm.category === 'detalle'`
- «(mínimo 2, máximo 15)» — TemplateEditor · l.2729, when `isIndicatorModalOpen && indicatorForm.category === 'detalle'`
- «El evaluador podrá marcar todas las que aplican» — TemplateEditor · l.2733, when `isIndicatorModalOpen && indicatorForm.category === 'detalle'`
- «Debes ingresar al menos 2 opciones» — TemplateEditor · l.2783, when `isIndicatorModalOpen && indicatorForm.category === 'detalle' && indicatorForm.detalleOptions.map(o => o.trim()).filter(o => o.length > 0).length < 2`
- «Descriptores de nivel» — TemplateEditor · l.2793, when `isIndicatorModalOpen && indicatorForm.category === 'profundidad'`
- «(al menos uno requerido)» — TemplateEditor · l.2795, when `isIndicatorModalOpen && indicatorForm.category === 'profundidad'`
- «Nivel 0 - No implementado» (label) — TemplateEditor · l.2800, when `isIndicatorModalOpen && indicatorForm.category === 'profundidad'`
- «Nivel 1 - Inicial» (label) — TemplateEditor · l.2812, when `isIndicatorModalOpen && indicatorForm.category === 'profundidad'`
- «Nivel 2 - En desarrollo» (label) — TemplateEditor · l.2824, when `isIndicatorModalOpen && indicatorForm.category === 'profundidad'`
- «Nivel 3 - Consolidado» (label) — TemplateEditor · l.2836, when `isIndicatorModalOpen && indicatorForm.category === 'profundidad'`
- «Nivel 4 - Ejemplar» (label) — TemplateEditor · l.2848, when `isIndicatorModalOpen && indicatorForm.category === 'profundidad'`
- «Cargando versiones...» — TemplateEditor · l.2911, when `isVersionHistoryOpen && loadingVersions`
- «No hay versiones publicadas aún.» — TemplateEditor · l.2917, when `isVersionHistoryOpen && !(loadingVersions) && versions.length === 0`
- «Publica el template para crear la primera versión.» — TemplateEditor · l.2920, when `isVersionHistoryOpen && !(loadingVersions) && versions.length === 0`
- «Versión {version.version}» — TemplateEditor · l.2931, when `isVersionHistoryOpen && !(loadingVersions) && !(versions.length === 0) && each versions`
- «{version.stats.objectives} objetivos» — TemplateEditor · l.2945, when `!(loadingVersions) && !(versions.length === 0) && each versions && version.stats.objectives > 0`
- «{version.stats.indicators} indicadores» — TemplateEditor · l.2947, when `isVersionHistoryOpen && !(loadingVersions) && !(versions.length === 0) && each versions`
- «Así verá esta práctica quien complete el registro» — TemplateEditor · l.2983, when `isPreviewOpen && previewModule`
- «Cargando indicadores...» — TemplateEditor · l.3013, when `isPreviewOpen && previewModule && !previewModule.indicatorsLoaded`
- «Esta práctica aún no tiene indicadores.» — TemplateEditor · l.3015, when `isPreviewOpen && previewModule && !(!previewModule.indicatorsLoaded) && ((previewModule.indicators \|\| []).length === 0)`
- «Sí» (label) — TemplateEditor · l.3055, when `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'cobertura'`
- «No» (label) — TemplateEditor · l.3063, when `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'cobertura'`
- «{level} : {desc}» (label) — TemplateEditor · l.3082, when `each sorted && indicator.category === 'profundidad' && each ([0, 1, 2, 3, 4] as const) && desc`
- «Adjunte link a carpeta con evidencia de sus respuestas» (label) — TemplateEditor · l.3093, when `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'traspaso'`
- «El archivo enlazado debe ser accesible para cualquier persona con el link» — TemplateEditor · l.3097, when `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'traspaso'`
- «Mejoras sugeridas» (label) — TemplateEditor · l.3100, when `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'traspaso'`
- «Selecciona todas las que aplican:» — TemplateEditor · l.3109, when `!(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'detalle'`
- «{opt}» (label) — TemplateEditor · l.3111, when `(!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'detalle' && (each (indicator.detalleOptions \|\| []))`
- «Sin opciones definidas» — TemplateEditor · l.3117, when `(!((previewModule.indicators \|\| []).length === 0)) && each sorted && indicator.category === 'detalle' && ((!indicator.detalleOptions \|\| indicator.detalleOptions.length === 0))`
- «Seleccione Sí o No para ver cómo se comporta el registro» — TemplateEditor · l.3129, when `isPreviewOpen && previewModule && !(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && previewCoberturaAnswer === null && sorted.length > 1`
- «Esta práctica no se implementa en este establecimiento» — TemplateEditor · l.3134, when `isPreviewOpen && previewModule && !(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && previewCoberturaAnswer === false`
- «Los demás indicadores no se mostrarán al evaluador» — TemplateEditor · l.3135, when `isPreviewOpen && previewModule && !(!previewModule.indicatorsLoaded) && (!((previewModule.indicators \|\| []).length === 0)) && previewCoberturaAnswer === false`
- «Comportamiento real:» — TemplateEditor · l.3146, when `isPreviewOpen && previewModule`
- «El primer indicador (Cobertura) actúa como filtro. Pruebe seleccionando Sí o No arriba para ver cómo cambia la vista del evaluador.» — TemplateEditor · l.3146, when `isPreviewOpen && previewModule`
- «¿Estás seguro de eliminar el template» — TemplateEditor · l.3163, when `showDeleteConfirm && deleteConfirmData`
- «&quot; {template.name} &quot;» — TemplateEditor · l.3163, when `showDeleteConfirm && deleteConfirmData`
- «⚠️ Este template tiene datos asociados:» — TemplateEditor · l.3168, when `showDeleteConfirm && deleteConfirmData && deleteConfirmData.counts`
- «• {deleteConfirmData.counts.instances} registros» — TemplateEditor · l.3171, when `showDeleteConfirm && deleteConfirmData && deleteConfirmData.counts`
- «• {deleteConfirmData.counts.responses} respuestas» — TemplateEditor · l.3172, when `showDeleteConfirm && deleteConfirmData && deleteConfirmData.counts`
- «• {deleteConfirmData.counts.snapshots} versiones guardadas» — TemplateEditor · l.3173, when `showDeleteConfirm && deleteConfirmData && deleteConfirmData.counts`
- «Esta acción es permanente y no se puede deshacer.» — TemplateEditor · l.3177, when `showDeleteConfirm && deleteConfirmData && deleteConfirmData.counts`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `lib/services/assessment-builder/frequencyConfig.ts`
- `lib/validation/profundidadValidator.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/assessment-builder/templates/[templateId]` | DELETE, GET, PUT | `pages/admin/assessment-builder/[templateId]/index.tsx:1103`, `pages/admin/assessment-builder/[templateId]/index.tsx:1137`, `pages/admin/assessment-builder/[templateId]/index.tsx:1138`, `pages/admin/assessment-builder/[templateId]/index.tsx:350` +1 |
| `/api/admin/assessment-builder/templates/[templateId]/archive` | POST | `pages/admin/assessment-builder/[templateId]/index.tsx:1039`, `pages/admin/assessment-builder/[templateId]/index.tsx:1064` |
| `/api/admin/assessment-builder/templates/[templateId]/demo-access` | DELETE, GET, POST | `pages/admin/assessment-builder/[templateId]/index.tsx:1220`, `pages/admin/assessment-builder/[templateId]/index.tsx:1274`, `pages/admin/assessment-builder/[templateId]/index.tsx:1302` |
| `/api/admin/assessment-builder/templates/[templateId]/duplicate` | POST | `pages/admin/assessment-builder/[templateId]/index.tsx:992` |
| `/api/admin/assessment-builder/templates/[templateId]/modules` | GET, POST | `pages/admin/assessment-builder/[templateId]/index.tsx:374`, `pages/admin/assessment-builder/[templateId]/index.tsx:580` |
| `/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]` | DELETE, PUT | `pages/admin/assessment-builder/[templateId]/index.tsx:556`, `pages/admin/assessment-builder/[templateId]/index.tsx:616` |
| `/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators` | GET, POST | `pages/admin/assessment-builder/[templateId]/index.tsx:1169`, `pages/admin/assessment-builder/[templateId]/index.tsx:1198`, `pages/admin/assessment-builder/[templateId]/index.tsx:876` |
| `/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]` | DELETE, PUT | `pages/admin/assessment-builder/[templateId]/index.tsx:836`, `pages/admin/assessment-builder/[templateId]/index.tsx:914` |
| `/api/admin/assessment-builder/templates/[templateId]/objectives` | GET, POST | `pages/admin/assessment-builder/[templateId]/index.tsx:367`, `pages/admin/assessment-builder/[templateId]/index.tsx:474` |
| `/api/admin/assessment-builder/templates/[templateId]/objectives/[objectiveId]` | DELETE, PUT | `pages/admin/assessment-builder/[templateId]/index.tsx:452`, `pages/admin/assessment-builder/[templateId]/index.tsx:508` |
| `/api/admin/assessment-builder/templates/[templateId]/publish` | POST | `pages/admin/assessment-builder/[templateId]/index.tsx:965` |
| `/api/admin/assessment-builder/templates/[templateId]/versions` | GET | `pages/admin/assessment-builder/[templateId]/index.tsx:1021` |
| `/api/admin/users/search` | GET | `pages/admin/assessment-builder/[templateId]/index.tsx:1250` |

## /admin/assessment-builder/create

File `pages/admin/assessment-builder/create.tsx` · 459 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.46 `router.push → /login  (when !session?.user)`
  - l.69 `isAdmin = roles?.some((r: any) => r.role_type === 'admin') \|\| false`
  - l.231 `router.push → /login`
  - l.258 `No tienes permiso para crear templates de registro.`
- Linked from: `pages/admin/assessment-builder/index.tsx:494`, `pages/admin/assessment-builder/index.tsx:533`, `pages/api/qa/seed-codebase-index.ts:190`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/admin/assessment-builder-create-via.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
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
| «Acceso Denegado» | h1 | `hasPermission === false` | CreateTemplate · l.257 |
| «Nuevo Template de Registro» | h2 |  | CreateTemplate · l.298 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «&#9696; Guardando... / Crear Template» (submits the form) |  |  | `{isSaving}` |  | CreateTemplate · l.433 |

**Links** (6)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ir al Panel» | `/dashboard` | `hasPermission === false` |  | CreateTemplate · l.259 |
| «Ir al Panel» |  | `hasPermission === false` |  | CreateTemplate · l.260 |
| «Volver a la lista» | `/admin/assessment-builder` |  |  | CreateTemplate · l.288 |
| «Volver a la lista» |  |  |  | CreateTemplate · l.289 |
| «Cancelar» | `/admin/assessment-builder` |  |  | CreateTemplate · l.428 |
| «Cancelar» |  |  |  | CreateTemplate · l.429 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Vía de Evolución *» | select |  | «(lista) {label} (Próximamente)» |  | `id=area (id used by code)` | CreateTemplate · l.310 |
| «Nivel *» | select | disabled: `{loadingGrades}` | «Selecciona un nivel», «(lista) {grade.name} (GT)» | `!(isSchoolVia)` | `id=grade_id (id used by code)` | CreateTemplate · l.344 |
| «Nombre del Template *» | text | «Ej: Registro de Personalización 2026» · also `onMouseDown={(e) => { focusedAtMouseDownRef.current = document.activeElement === e.currentTa…} · onFocus={(e) => { if (e.target.value && e.target.value === autoGeneratedNameRef.current)…}` |  |  | `testid=template-name-input id=name (id used by code)` | CreateTemplate · l.372 |
| «Descripción» | textarea | «Descripción opcional del template...» |  |  | `id=description (id used by code)` | CreateTemplate · l.413 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | CreateTemplate · l.304 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Los consultores solo tienen acceso de lectura al constructor de registros.» | `isConsultor && !isAdmin` | checkAuth · l.73 |
| success | «Template creado exitosamente» |  | handleSubmit · l.217 |
| error | «Error al crear el template» |  | handleSubmit · l.221 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al crear el template» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmit · l.214 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.46 |
| `/admin/assessment-builder` | `router.push` | `isConsultor && !isAdmin` | checkAuth · l.74 |
| `/admin/assessment-builder/[*]` | `router.push` |  | handleSubmit · l.218 |
| `/login` | `router.push` |  | handleLogout · l.231 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `isAdmin = roles?.some((r: any) => r.role_type === 'admin') \|\| false` | checkAuth · l.69 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!formData.area \|\| !viaRules` | CreateTemplate · l.119 |
| `!isSchoolVia && !formData.grade_id` | CreateTemplate · l.120 |
| `!isSchoolVia && !grade` | CreateTemplate · l.123 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `hasPermission === false` |  | CreateTemplate · l.246 |
| `MainLayout` |  |  |  | CreateTemplate · l.271 |
| `ResponsiveFunctionalPageHeader` | title: Constructor de Registros · subtitle: Crear nuevo template |  |  | CreateTemplate · l.280 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «El área de transformación es requerida» | CreateTemplate · l.180 |
| «Cargando las reglas de asignación por vía…» | CreateTemplate · l.184 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.229 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.230 |
| mark | `testid=template-school-via-note` | CreateTemplate · l.335 |

**Values shown from data** (3)

- `{errors.area}` — CreateTemplate · l.327, when `errors.area`
- `{errors.grade_id}` — CreateTemplate · l.360, when `!(isSchoolVia) && errors.grade_id`
- `{errors.name}` — CreateTemplate · l.400, when `errors.name`

**Other texts on screen** (12)

- «Cargando...» — CreateTemplate · l.238, when `hasPermission === null`
- «No tienes permiso para crear templates de registro.» — CreateTemplate · l.258, when `hasPermission === false`
- «Crea un nuevo template de registro para una vía de evolución» — CreateTemplate · l.300
- «Vía de Evolución *» (label) — CreateTemplate · l.307
- «Selecciona la vía de evolución para este template» — CreateTemplate · l.329
- «Esta vía se asigna a una persona del equipo directivo de cada escuela, elegida en Contexto Transversal. El template no lleva nivel.» — CreateTemplate · l.336, when `isSchoolVia`
- «Nivel *» (label) — CreateTemplate · l.341, when `!(isSchoolVia)`
- «Selecciona el nivel educativo para este template. (GT) indica niveles de Generación Tractor.» — CreateTemplate · l.362, when `!(isSchoolVia)`
- «Nombre del Template *» (label) — CreateTemplate · l.369
- «Nombre generado automáticamente. Puedes modificarlo.» — CreateTemplate · l.403, when `formData.name && formData.name === autoGeneratedNameRef.current`
- «Descripción» (label) — CreateTemplate · l.410
- «Una breve descripción del propósito de este template» — CreateTemplate · l.422

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `lib/services/assessment-builder/viaRules.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/assessment-builder/grades` | GET | `pages/admin/assessment-builder/create.tsx:88` |
| `/api/admin/assessment-builder/templates` | GET, POST | `pages/admin/assessment-builder/create.tsx:137`, `pages/admin/assessment-builder/create.tsx:200` |

## /admin/assessment-builder

File `pages/admin/assessment-builder/index.tsx` · 804 lines · frame: MainLayout

### Who reaches it

- Menu: Gestor de Cambio › «Constructor de Registros» → `/admin/assessment-builder` — admin or consultor; the group: everyone signed in (`Sidebar.tsx` l.276)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.64 `router.push → /login  (when !session?.user)`
  - l.348 `router.push → /login`
  - l.375 `No tienes permiso para acceder al Constructor de Registros.`
- Linked from: `components/layout/Sidebar.tsx:278`, `middleware.ts:223`, `pages/admin/assessment-builder/[templateId]/expectations.tsx:1027`, `pages/admin/assessment-builder/[templateId]/expectations.tsx:469`, `pages/admin/assessment-builder/[templateId]/index.tsx:1049`, `pages/admin/assessment-builder/[templateId]/index.tsx:1122`, `pages/admin/assessment-builder/[templateId]/index.tsx:1151`, `pages/admin/assessment-builder/[templateId]/index.tsx:1411`, `pages/admin/assessment-builder/[templateId]/index.tsx:1446`, `pages/admin/assessment-builder/[templateId]/index.tsx:382`, `pages/admin/assessment-builder/create.tsx:288`, `pages/admin/assessment-builder/create.tsx:428` and 2 more
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | no | sent to /dashboard |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `hasPermission === false` | AssessmentBuilderIndex · l.374 |
| «Quién responde cada vía» | h2 | `activeTab === 'active' && viaRules` | AssessmentBuilderIndex · l.448 |
| «No hay templates archivados» | h3 | `!(loading) && filteredTemplates.length === 0 && activeTab === 'archived'` | AssessmentBuilderIndex · l.513 |
| «No hay templates todavía / No se encontraron templates» | h3 | `!(loading) && filteredTemplates.length === 0 && !(activeTab === 'archived')` | AssessmentBuilderIndex · l.523 |
| «Confirmar Eliminación» | h3 | `deleteConfirmation` | AssessmentBuilderIndex · l.682 |
| «Duplicar Template» | h3 | `duplicateModal` | AssessmentBuilderIndex · l.727 |

**Buttons** (10)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Activos» | `{() => setActiveTab('active')}` |  |  |  | AssessmentBuilderIndex · l.421 |
| «Archivados» | `{() => setActiveTab('archived')}` |  |  |  | AssessmentBuilderIndex · l.431 |
| «[icon Copy]» · tooltip «Duplicar» | `{() => openDuplicateModal(template)}` | `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates && isAdmin && !template.is_archived` |  |  | AssessmentBuilderIndex · l.623 |
| «[icon Archive]» · tooltip «Archivar» | `{() => handleArchive(template)}` | `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates && isAdmin && template.status === 'published' && !template.is_archived` | `{isArchiving === template.id}` |  | AssessmentBuilderIndex · l.634 |
| «[icon RotateCcw]» · tooltip «Restaurar» | `{() => handleRestore(template)}` | `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates && isAdmin && template.is_archived` | `{isArchiving === template.id}` |  | AssessmentBuilderIndex · l.646 |
| «[icon Trash2]» · tooltip «Eliminar» | `{() => handleDelete(template)}` | `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates && (isAdmin && (template.status === 'draft' \|\| template.is_archived))` | `{isDeleting === template.id}` |  | AssessmentBuilderIndex · l.658 |
| «Cancelar» | `{() => setDeleteConfirmation(null)}` | `deleteConfirmation` |  |  | AssessmentBuilderIndex · l.705 |
| «Eliminando... / Eliminar Permanentemente» | `{() => executeDelete(deleteConfirmation.template.id, true)}` | `deleteConfirmation` | `{isDeleting === deleteConfirmation.template.id}` |  | AssessmentBuilderIndex · l.711 |
| «Cancelar» | `{closeDuplicateModal}` | `duplicateModal` | `{isDuplicating}` |  | AssessmentBuilderIndex · l.781 |
| «Duplicando... / Duplicar Template» | `{handleDuplicate}` | `duplicateModal` | `{isDuplicating \|\| !duplicateReady}` |  | AssessmentBuilderIndex · l.788 |

**Links** (8)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ir al Panel» | `/dashboard` | `hasPermission === false` |  | AssessmentBuilderIndex · l.376 |
| «Ir al Panel» |  | `hasPermission === false` |  | AssessmentBuilderIndex · l.377 |
| «Nuevo Template» | `/admin/assessment-builder/create` | `activeTab === 'active' && isAdmin` |  | AssessmentBuilderIndex · l.494 |
| «Nuevo Template» |  | `activeTab === 'active' && isAdmin` | `testid=create-template-btn` | AssessmentBuilderIndex · l.495 |
| «Crear Template» | `/admin/assessment-builder/create` | `!(loading) && filteredTemplates.length === 0 && !(activeTab === 'archived') && templates.length === 0 && isAdmin` |  | AssessmentBuilderIndex · l.533 |
| «Crear Template» |  | `!(loading) && filteredTemplates.length === 0 && !(activeTab === 'archived') && templates.length === 0 && isAdmin` |  | AssessmentBuilderIndex · l.534 |
| «[icon Eye]» | `/admin/assessment-builder/[*]` | `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates` |  | AssessmentBuilderIndex · l.608 |
| «[icon Eye]» · tooltip «{template.is_archived \|\| !isAdmin ? 'Ver' : 'Editar'}» |  | `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates` |  | AssessmentBuilderIndex · l.609 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «Todos los estados», «Borrador», «Publicado» |  |  | AssessmentBuilderIndex · l.471 |
|  | select |  | «Todas las áreas», «(lista) {label}» |  |  | AssessmentBuilderIndex · l.481 |
| «Nombre del nuevo template *» | text | «Nombre del template» |  | `duplicateModal` | `id=duplicate-name (id used by code)` | AssessmentBuilderIndex · l.740 |
| «Nivel *» | select |  | «Selecciona un nivel», «(lista) {grade.name} (GT)» | `duplicateModal && !(duplicateIsSchoolVia)` | `id=duplicate-grade (id used by code)` | AssessmentBuilderIndex · l.760 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | `!(loading) && !(filteredTemplates.length === 0)` | AssessmentBuilderIndex · l.549 |
| «Área» | `!(loading) && !(filteredTemplates.length === 0)` | AssessmentBuilderIndex · l.552 |
| «Versión» | `!(loading) && !(filteredTemplates.length === 0)` | AssessmentBuilderIndex · l.555 |
| «Estado» | `!(loading) && !(filteredTemplates.length === 0)` | AssessmentBuilderIndex · l.558 |
| «Actualizado» | `!(loading) && !(filteredTemplates.length === 0)` | AssessmentBuilderIndex · l.561 |
| «Acciones» | `!(loading) && !(filteredTemplates.length === 0)` | AssessmentBuilderIndex · l.564 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Confirmar Eliminación» | written in this file | `deleteConfirmation` |  | AssessmentBuilderIndex · l.680 |
| «Duplicar Template» | written in this file | `duplicateModal` |  | AssessmentBuilderIndex · l.725 |

**Browser confirm()** (2)

| Question | When | Where |
|---|---|---|
| «¿Estás seguro de eliminar el template "{template.name}"? Esta acción no se puede deshacer.» | `template.status === 'draft'` | handleDelete · l.158 |
| «¿Estás seguro de archivar el template "{template.name}"? No podrá ser usado para nuevos registros.» |  | handleArchive · l.239 |

**Toasts** (13)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar templates» |  | AssessmentBuilderIndex · l.142 |
| error | «Los templates publicados deben ser archivados antes de eliminarse» | `!template.is_archived` | handleDelete · l.167 |
| success | «Template eliminado correctamente» |  | handleDelete · l.194 |
| error | «Error al eliminar template» |  | handleDelete · l.198 |
| success | «Template eliminado correctamente» |  | executeDelete · l.222 |
| error | «Error al eliminar template» |  | executeDelete · l.227 |
| success | «Template archivado correctamente» |  | handleArchive · l.254 |
| error | «Error al archivar template» |  | handleArchive · l.259 |
| success | «Template restaurado correctamente» |  | handleRestore · l.282 |
| error | «Error al restaurar template» |  | handleRestore · l.287 |
| error | «Por favor completa todos los campos» | `!duplicateModal \|\| !duplicateReady` | handleDuplicate · l.310 |
| success | «Template duplicado exitosamente: {data.stats.modules} módulos, {data.stats.indicators} indicadores, {data.stats.expectations} expectativas copiadas» |  | handleDuplicate · l.331 |
| error | «Error al duplicar template» |  | handleDuplicate · l.338 |

**Messages set on the page** (6)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar templates» | `throw (shown by whoever catches it)` | `!response.ok` | AssessmentBuilderIndex · l.135 |
| «Error al eliminar template» | `throw (shown by whoever catches it)` | `!response.ok` | handleDelete · l.191 |
| «Error al eliminar template» | `throw (shown by whoever catches it)` | `!response.ok` | executeDelete · l.219 |
| «Error al archivar template» | `throw (shown by whoever catches it)` | `!response.ok` | handleArchive · l.251 |
| «Error al restaurar template» | `throw (shown by whoever catches it)` | `!response.ok` | handleRestore · l.279 |
| «Error al duplicar template» | `throw (shown by whoever catches it)` | `!response.ok` | handleDuplicate · l.328 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.64 |
| `/admin/assessment-builder/[*]` | `router.push` |  | handleDuplicate · l.335 |
| `/login` | `router.push` |  | handleLogout · l.348 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!user \|\| hasPermission === false` | AssessmentBuilderIndex · l.121 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `hasPermission === false` |  | AssessmentBuilderIndex · l.363 |
| `MainLayout` |  |  |  | AssessmentBuilderIndex · l.399 |
| `ResponsiveFunctionalPageHeader` | title: Constructor de Registros · subtitle: {templates.length} template{templates.length !== 1 ? 's…} · searchPlaceholder: Buscar templates... |  |  | AssessmentBuilderIndex · l.408 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `STATUS_LABELS` | «Borrador», «Publicado», «Archivado» | l.13 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.346 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.347 |
| mark | `testid=via-rules-card` | AssessmentBuilderIndex · l.447 |
| mark | `testid=template-status-badge` | AssessmentBuilderIndex · l.598 |

**Values shown from data** (8)

- `{label}` — AssessmentBuilderIndex · l.454, when `activeTab === 'active' && viaRules && each Object.entries(AREA_LABELS)`
- `{template.name}` — AssessmentBuilderIndex · l.576, when `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates`
- `{template.grade.name}` — AssessmentBuilderIndex · l.578, when `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates && template.grade`
- `{template.description}` — AssessmentBuilderIndex · l.588, when `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates && template.description`
- `{AREA_LABELS[template.area]}` — AssessmentBuilderIndex · l.592, when `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates`
- `{template.version}` — AssessmentBuilderIndex · l.595, when `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates`
- `{statusStyle.label}` — AssessmentBuilderIndex · l.598, when `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates`
- `{new Date(template.updated_at).toLoc…}` — AssessmentBuilderIndex · l.602, when `!(loading) && !(filteredTemplates.length === 0) && each filteredTemplates`

**Other texts on screen** (22)

- «Cargando...» — AssessmentBuilderIndex · l.355, when `loading && hasPermission === null`
- «No tienes permiso para acceder al Constructor de Registros.» — AssessmentBuilderIndex · l.375, when `hasPermission === false`
- «{VIA_TARGET_LABELS[target]} / Sin regla» — AssessmentBuilderIndex · l.455, when `activeTab === 'active' && viaRules && each Object.entries(AREA_LABELS)`
- «El responsable del equipo directivo se elige por escuela en Contexto Transversal. Para cambiar quién responde una vía, contacte al equipo técnico: solo es posible mientras la vía no tenga templates publicados.» — AssessmentBuilderIndex · l.461, when `activeTab === 'active' && viaRules`
- «Cargando templates...» — AssessmentBuilderIndex · l.506, when `loading`
- «Los templates archivados aparecerán aquí» — AssessmentBuilderIndex · l.517, when `!(loading) && filteredTemplates.length === 0 && activeTab === 'archived'`
- «¡Comienza creando tu primer template de registro! / Intenta con otros términos de búsqueda o filtros» — AssessmentBuilderIndex · l.526, when `!(loading) && filteredTemplates.length === 0 && !(activeTab === 'archived')`
- «¿Estás seguro de eliminar el template» — AssessmentBuilderIndex · l.686, when `deleteConfirmation`
- «&quot; {deleteConfirmation.template.name} &quot;» — AssessmentBuilderIndex · l.686, when `deleteConfirmation`
- «⚠️ Este template tiene datos asociados:» — AssessmentBuilderIndex · l.691, when `deleteConfirmation && deleteConfirmation.counts`
- «• {deleteConfirmation.counts.instances} registros» — AssessmentBuilderIndex · l.694, when `deleteConfirmation && deleteConfirmation.counts`
- «• {deleteConfirmation.counts.responses} respuestas» — AssessmentBuilderIndex · l.695, when `deleteConfirmation && deleteConfirmation.counts`
- «• {deleteConfirmation.counts.snapshots} versiones guardadas» — AssessmentBuilderIndex · l.696, when `deleteConfirmation && deleteConfirmation.counts`
- «• {deleteConfirmation.counts.modules} módulos» — AssessmentBuilderIndex · l.697, when `deleteConfirmation && deleteConfirmation.counts`
- «Esta acción es permanente y no se puede deshacer.» — AssessmentBuilderIndex · l.700, when `deleteConfirmation && deleteConfirmation.counts`
- «Se creará una copia del template» — AssessmentBuilderIndex · l.731, when `duplicateModal`
- «&quot; {duplicateModal.template.name} &quot;» — AssessmentBuilderIndex · l.731, when `duplicateModal`
- «con todos sus módulos, indicadores y expectativas.» — AssessmentBuilderIndex · l.731, when `duplicateModal`
- «Nombre del nuevo template *» (label) — AssessmentBuilderIndex · l.737, when `duplicateModal`
- «Esta vía se asigna a una persona del equipo directivo de cada escuela: la copia no lleva nivel.» — AssessmentBuilderIndex · l.753, when `duplicateModal && duplicateIsSchoolVia`
- «Nivel *» (label) — AssessmentBuilderIndex · l.757, when `duplicateModal && !(duplicateIsSchoolVia)`
- «Puede ser el mismo nivel que el original o diferente.» — AssessmentBuilderIndex · l.774, when `duplicateModal && !(duplicateIsSchoolVia)`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `lib/services/assessment-builder/viaRules.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/assessment-builder/grades` | GET | `pages/admin/assessment-builder/index.tsx:106` |
| `/api/admin/assessment-builder/templates` | GET | `pages/admin/assessment-builder/index.tsx:132` |
| `/api/admin/assessment-builder/templates/[templateId]` | DELETE | `pages/admin/assessment-builder/index.tsx:174`, `pages/admin/assessment-builder/index.tsx:209`, `pages/admin/assessment-builder/index.tsx:210` |
| `/api/admin/assessment-builder/templates/[templateId]/archive` | POST | `pages/admin/assessment-builder/index.tsx:245`, `pages/admin/assessment-builder/index.tsx:273` |
| `/api/admin/assessment-builder/templates/[templateId]/duplicate` | POST | `pages/admin/assessment-builder/index.tsx:316` |

## /admin/context-questions

File `pages/admin/context-questions/index.tsx` · 741 lines · frame: MainLayout

### Who reaches it

- Menu: Gestor de Cambio › «Preguntas de Contexto» → `/admin/context-questions` — admin only; the group: everyone signed in (`Sidebar.tsx` l.292)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.110 `router.push → /login  (when !session)`
  - l.113 `if (!metadataHasRole(session.user.user_metadata, 'admin')) { router.push('/dashboard'); return; }`
  - l.114 `router.push → /dashboard  (when !metadataHasRole(session.user.user_metadata, 'admin'))`
  - l.158 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:294`, `pages/admin/context-questions/overview.tsx:340`, `pages/admin/context-questions/overview.tsx:341`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/context-questions/admin-ui.spec.ts`.

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
| «Editar Pregunta / Nueva Pregunta» | h2 | `showForm` | ContextQuestionsPage · l.366 |
| «No hay preguntas todavía» | h3 | `!(fetchLoading) && questions.length === 0` | ContextQuestionsPage · l.546 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a configuración» | `{() => router.push('/admin/configuration')}` |  |  |  | ContextQuestionsPage · l.340 |
| «Agregar Pregunta» | `{openAddForm}` | `!showForm` |  |  | ContextQuestionsPage · l.349 |
| «[icon X]» | `{closeForm}` | `showForm` |  |  | ContextQuestionsPage · l.376 |
| «Cancelar» | `{closeForm}` | `showForm` | `{saving}` |  | ContextQuestionsPage · l.508 |
| «Guardando... / Actualizar / Crear Pregunta» | `{handleSave}` | `showForm` | `{saving}` |  | ContextQuestionsPage · l.515 |
| «Agregar Primera Pregunta» | `{openAddForm}` | `!(fetchLoading) && questions.length === 0 && !showForm` |  |  | ContextQuestionsPage · l.555 |
| «[icon Edit2]» · tooltip «Editar» | `{() => openEditForm(question)}` | `!(fetchLoading) && !(questions.length === 0) && each questions` |  |  | ContextQuestionsPage · l.691 |
| «[icon Loader2]» · tooltip «{question.is_active ? 'Desactivar' : 'Activar'}» | `{() => handleToggleActive(question)}` | `!(fetchLoading) && !(questions.length === 0) && each questions && !(isStructuralQuestion(question))` | `{togglingId === question.id}` |  | ContextQuestionsPage · l.708 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Texto de la pregunta *» | textarea | «Ej: ¿Cuántos estudiantes tiene el establecimiento?» |  | `showForm` |  | ContextQuestionsPage · l.390 |
| «Tipo de pregunta *» | select | disabled: `{editingIsStructural}` | «(lista) {QUESTION_TYPE_LABELS[type]}» | `showForm` |  | ContextQuestionsPage · l.404 |
| «Orden de visualización» | number | `min={0}` |  | `showForm` |  | ContextQuestionsPage · l.433 |
| «Opciones *» | text | «Opción 1, Opción 2, Opción 3» |  | `showForm && showOptionsField` |  | ContextQuestionsPage · l.450 |
| «Placeholder» | text | «Texto de ejemplo para el campo» |  | `showForm` |  | ContextQuestionsPage · l.468 |
| «Texto de ayuda» | text | «Instrucciones adicionales para el usuario» |  | `showForm` |  | ContextQuestionsPage · l.482 |
| «Respuesta obligatoria» | checkbox |  |  | `showForm` | `id=is_required (id used by code)` | ContextQuestionsPage · l.493 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Orden» | `!(fetchLoading) && !(questions.length === 0)` | ContextQuestionsPage · l.570 |
| «Pregunta» | `!(fetchLoading) && !(questions.length === 0)` | ContextQuestionsPage · l.576 |
| «Tipo» | `!(fetchLoading) && !(questions.length === 0)` | ContextQuestionsPage · l.582 |
| «Obligatoria» | `!(fetchLoading) && !(questions.length === 0)` | ContextQuestionsPage · l.588 |
| «Estado» | `!(fetchLoading) && !(questions.length === 0)` | ContextQuestionsPage · l.594 |
| «Acciones» | `!(fetchLoading) && !(questions.length === 0)` | ContextQuestionsPage · l.600 |

**Toasts** (8)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar preguntas» |  | ContextQuestionsPage · l.138 |
| error | «El texto de la pregunta es obligatorio» | `!formData.question_text.trim()` | handleSave · l.204 |
| error | «Ingresa al menos 2 opciones separadas por comas» | `needsOptions && optionsArray.length < 2` | handleSave · l.216 |
| success | «Pregunta actualizada correctamente / Pregunta creada correctamente» |  | handleSave · l.256 |
| error | «Error al guardar pregunta» |  | handleSave · l.263 |
| success | «Pregunta desactivada» | `question.is_active` | handleToggleActive · l.279 |
| success | «Pregunta activada» | `!(question.is_active)` | handleToggleActive · l.289 |
| error | «Error al cambiar estado» |  | handleToggleActive · l.294 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar preguntas» | `throw (shown by whoever catches it)` | `!res.ok` | ContextQuestionsPage · l.132 |
| «Error al guardar pregunta» | `throw (shown by whoever catches it)` | `!res.ok` | handleSave · l.253 |
| «Error al desactivar pregunta» | `throw (shown by whoever catches it)` | `question.is_active && !res.ok` | handleToggleActive · l.278 |
| «Error al activar pregunta» | `throw (shown by whoever catches it)` | `!(question.is_active) && !res.ok` | handleToggleActive · l.288 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session` | check · l.110 |
| `/dashboard` | `router.push` | `!metadataHasRole(session.user.user_metadata, 'admin')` | check · l.114 |
| `/login` | `router.push` |  | handleLogout · l.158 |
| `/admin/configuration` | `router.push` |  | ContextQuestionsPage · l.341 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `if (!metadataHasRole(session.user.user_metadata, 'admin')) { router.push('/dashboard'); return; }` | check · l.113 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ContextQuestionsPage · l.322 |
| `ResponsiveFunctionalPageHeader` | title: Preguntas de Contexto Transversal · subtitle: {questions.length} pregunta{questions.length !== 1 ? 's…} |  |  | ContextQuestionsPage · l.331 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `QUESTION_TYPE_LABELS` | «Texto», «Número», «Selección única», «Selección múltiple», «Sí / No», «Escala», «Texto largo» | l.49 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.156 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.157 |

**Values shown from data** (4)

- `{question.display_order}` — ContextQuestionsPage · l.618, when `!(fetchLoading) && !(questions.length === 0) && each questions`
- `{question.question_text}` — ContextQuestionsPage · l.627, when `!(fetchLoading) && !(questions.length === 0) && each questions`
- `{question.help_text}` — ContextQuestionsPage · l.638, when `!(fetchLoading) && !(questions.length === 0) && each questions && question.help_text`
- `{QUESTION_TYPE_LABELS[question.quest…} / {question.question_type}` — ContextQuestionsPage · l.651, when `!(fetchLoading) && !(questions.length === 0) && each questions`

**Other texts on screen** (18)

- «Pregunta Estructural» — ContextQuestionsPage · l.372, when `showForm && editingIsStructural`
- «Texto de la pregunta *» (label) — ContextQuestionsPage · l.387, when `showForm`
- «Tipo de pregunta *» (label) — ContextQuestionsPage · l.401, when `showForm`
- «El tipo no se puede cambiar en preguntas estructurales» — ContextQuestionsPage · l.423, when `showForm && editingIsStructural`
- «Orden de visualización» (label) — ContextQuestionsPage · l.430, when `showForm`
- «Opciones *» (label) — ContextQuestionsPage · l.447, when `showForm && showOptionsField`
- «Separa las opciones con comas» — ContextQuestionsPage · l.458, when `showForm && showOptionsField`
- «Placeholder» (label) — ContextQuestionsPage · l.465, when `showForm`
- «Texto de ayuda» (label) — ContextQuestionsPage · l.479, when `showForm`
- «Respuesta obligatoria» (label) — ContextQuestionsPage · l.500, when `showForm`
- «Agrega preguntas personalizadas para la sección de Contexto Transversal de las evaluaciones.» — ContextQuestionsPage · l.550, when `!(fetchLoading) && questions.length === 0`
- «Estructural» — ContextQuestionsPage · l.633, when `!(fetchLoading) && !(questions.length === 0) && each questions && isStructuralQuestion(question)`
- «Opciones: {question.options.join(', ')}» — ContextQuestionsPage · l.643, when `!(fetchLoading) && !(questions.length === 0) && each questions && question.options && question.options.length > 0`
- «Obligatoria» — ContextQuestionsPage · l.665, when `!(fetchLoading) && !(questions.length === 0) && each questions && question.is_required`
- «Opcional» — ContextQuestionsPage · l.669, when `!(fetchLoading) && !(questions.length === 0) && each questions && !(question.is_required)`
- «Activa» — ContextQuestionsPage · l.678, when `!(fetchLoading) && !(questions.length === 0) && each questions && question.is_active`
- «Inactiva» — ContextQuestionsPage · l.682, when `!(fetchLoading) && !(questions.length === 0) && each questions && !(question.is_active)`
- «Las preguntas estructurales no se pueden desactivar» (title) — ContextQuestionsPage · l.701, when `!(fetchLoading) && !(questions.length === 0) && each questions && isStructuralQuestion(question)`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `types/roles.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/context-questions` | GET, POST | `pages/admin/context-questions/index.tsx:129`, `pages/admin/context-questions/index.tsx:244` |
| `/api/admin/context-questions/[id]` | DELETE, PUT | `pages/admin/context-questions/index.tsx:237`, `pages/admin/context-questions/index.tsx:274`, `pages/admin/context-questions/index.tsx:282` |

## /admin/context-questions/overview

File `pages/admin/context-questions/overview.tsx` · 489 lines · frame: MainLayout

### Who reaches it

- Menu: Gestor de Cambio › «Resumen Respuestas» → `/admin/context-questions/overview` — admin only; the group: everyone signed in (`Sidebar.tsx` l.300)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.156 `router.push → /login  (when !session?.user)`
  - l.174 `adminFromMetadata = metadataHasRole( session.user.user_metadata, 'admin' )`
  - l.189 `router.push → /dashboard  (when !adminFromMetadata && !hasAdminRoleInDB)`
  - l.196 `router.push → /login`
  - l.206 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:302`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/context-questions/admin-ui.spec.ts`.

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

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Administrar Preguntas» | `/admin/context-questions` |  |  | ContextQuestionsOverview · l.340 |
| «{school.name}» | `/school/transversal-context?school_id=[*]` | `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.schools` |  | ContextQuestionsOverview · l.414 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Escuela» | `!(dataLoading) && (!(!data \|\| data.schools.length === 0))` | ContextQuestionsOverview · l.365 |
| «Total Estudiantes» | `!(dataLoading) && (!(!data \|\| data.schools.length === 0))` | ContextQuestionsOverview · l.368 |
| «Niveles» | `!(dataLoading) && (!(!data \|\| data.schools.length === 0))` | ContextQuestionsOverview · l.371 |
| «Ano Impl.» | `!(dataLoading) && (!(!data \|\| data.schools.length === 0))` | ContextQuestionsOverview · l.374 |
| «Sist. Periodos» | `!(dataLoading) && (!(!data \|\| data.schools.length === 0))` | ContextQuestionsOverview · l.377 |
| «{q.question_text.slice(0, 30)} ... / {q.question_text}» | `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.questions` | ContextQuestionsOverview · l.382 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error de autenticacion» | `!session?.access_token` | fetchOverview · l.221 |
| error | «Error al cargar la vista general» |  | fetchOverview · l.245 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch overview» | `throw (shown by whoever catches it)` | `!res.ok` | fetchOverview · l.233 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.156 |
| `/dashboard` | `router.push` | `!adminFromMetadata && !hasAdminRoleInDB` | initializeAuth · l.189 |
| `/login` | `router.push` |  | initializeAuth · l.196 |
| `/login` | `router.push` |  | handleLogout · l.206 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `adminFromMetadata = metadataHasRole( session.user.user_metadata, 'admin' )` | initializeAuth · l.174 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isAdmin` | ContextQuestionsOverview · l.283 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ContextQuestionsOverview · l.288 |
| `ResponsiveFunctionalPageHeader` | title: Contexto Transversal — Vista Global · subtitle: Respuestas de todas las escuelas |  |  | ContextQuestionsOverview · l.299 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | ContextQuestionsOverview · l.227 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.204 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.205 |

**Values shown from data** (10)

- `{GRADE_LEVEL_LABELS[gl]} / {gl}` — renderGradeLevels · l.60, when `levels.length <= 3 && each levels`
- `{String(value)}` — renderCustomCell · l.95, when `questionType === 'scale'`
- `{String(value)}` — renderCustomCell · l.97, when `questionType === 'select'`
- `{str.slice(0, 50)} ... / {str}` — renderCustomCell · l.107
- `{totalSchools}` — ContextQuestionsOverview · l.310
- `/ {totalSchools}` — ContextQuestionsOverview · l.320
- `/ {totalSchools}` — ContextQuestionsOverview · l.331
- `{renderGradeLevels( structural?.grad…}` — ContextQuestionsOverview · l.433, when `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.schools`
- `{structural.period_system}` — ContextQuestionsOverview · l.453, when `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.schools && structural?.period_system`
- `{renderCustomCell( responseRow?.resp…}` — ContextQuestionsOverview · l.465, when `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.schools && each data.questions`

**Other texts on screen** (13)

- «&mdash;» — renderGradeLevels · l.54, when `!levels \|\| levels.length === 0`
- «{levels.length} niveles» — renderGradeLevels · l.71
- «&mdash;» — renderCustomCell · l.80, when `value === undefined \|\| value === null \|\| value === ''`
- «&mdash;» — renderCustomCell · l.100, when `questionType === 'multiselect' && !(arr.join(', '))`
- «Total Escuelas» — ContextQuestionsOverview · l.309
- «Con Contexto Estructural» — ContextQuestionsOverview · l.316
- «Con Respuestas Personalizadas» — ContextQuestionsOverview · l.327
- «Cargando datos...» — ContextQuestionsOverview · l.354, when `dataLoading`
- «No hay escuelas registradas.» — ContextQuestionsOverview · l.358, when `!(dataLoading) && (!data \|\| data.schools.length === 0)`
- «&mdash;» — ContextQuestionsOverview · l.428, when `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.schools && !(structural?.total_students != null)`
- «Ano {structural.implementation_y…}» — ContextQuestionsOverview · l.443, when `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.schools`
- «&mdash;» — ContextQuestionsOverview · l.446, when `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.schools && !(structural?.implementation_year_2026 != null)`
- «&mdash;» — ContextQuestionsOverview · l.457, when `!(dataLoading) && (!(!data \|\| data.schools.length === 0)) && each data.schools && !(structural?.period_system)`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `types/assessment-builder.ts`
- `types/roles.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/context-questions/overview` | GET | `pages/admin/context-questions/overview.tsx:225` |

## /demo/assessments/[templateId]

File `pages/demo/assessments/[templateId]/index.tsx` · 425 lines · frame: MainLayout

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.57 `router.push → /login  (when !session?.user)`
  - l.232 `router.push → /login`
- Linked from: `pages/admin/assessment-builder/[templateId]/index.tsx:1702`, `pages/demo/assessments/[templateId]/results.tsx:181`, `pages/demo/assessments/[templateId]/results.tsx:192`, `pages/demo/assessments/[templateId]/results.tsx:240`, `pages/demo/assessments/[templateId]/results.tsx:248`, `pages/demo/assessments/[templateId]/results.tsx:252`, `pages/demo/assessments/index.tsx:192`
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
| «{ENTITY_LABELS.objective} : {objective.name}» | h3 | `objectives.length > 0 && each objectives` | DemoAssessmentForm · l.374 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «GT» | `{() => setGenerationType('GT')}` |  |  |  | DemoAssessmentForm · l.299 |
| «GI» | `{() => setGenerationType('GI')}` |  |  |  | DemoAssessmentForm · l.310 |
| «Reiniciar» | `{handleReset}` |  |  |  | DemoAssessmentForm · l.325 |
| «Ver Resultados» | `{handleViewResults}` |  | `{progress.percentage < 100}` |  | DemoAssessmentForm · l.332 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a Demos» | `/demo/assessments` |  |  | DemoAssessmentForm · l.273 |
| «Volver a Demos» |  |  |  | DemoAssessmentForm · l.274 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Año:» | select |  | «(lista) Año {y}» |  | `id=demo-year (id used by code)` | DemoAssessmentForm · l.286 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar la evaluación demo» |  | DemoAssessmentForm · l.118 |
| success | «Respuestas reiniciadas» |  | handleReset · l.210 |
| error | «Error al guardar datos para resultados» |  | handleViewResults · l.226 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar la evaluación demo» | `throw (shown by whoever catches it)` | `!response.ok` | DemoAssessmentForm · l.101 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.57 |
| `/demo/assessments/[*]/results` | `router.push` |  | handleViewResults · l.224 |
| `/login` | `router.push` |  | handleLogout · l.232 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!templateId \|\| typeof templateId !== 'string'` | DemoAssessmentForm · l.78 |
| `!user \|\| !templateId` | DemoAssessmentForm · l.92 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | DemoAssessmentForm · l.245 |
| `ResponsiveFunctionalPageHeader` | title: Evaluación Demo · subtitle: Evaluación |  |  | DemoAssessmentForm · l.254 |
| `ModuleCard` |  | `objectives.length > 0 && each objectives && each objective.modules` |  | DemoAssessmentForm · l.385 |
| `ModuleCard` |  | `!(objectives.length > 0) && each modules` |  | DemoAssessmentForm · l.407 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: demo_responses_{templateId}` | DemoAssessmentForm · l.80 |
| storage | `sessionStorage: demo_template_{templateId}` | handleViewResults · l.220 |
| address value | `[templateId] (part of the address)` | l.1 |

**Values shown from data** (1)

- `{objective.description}` — DemoAssessmentForm · l.380, when `objectives.length > 0 && each objectives && objective.description`

**Other texts on screen** (7)

- «Cargando...» — DemoAssessmentForm · l.239, when `loading \|\| !user`
- «MODO DEMO — Las respuestas no se guardan. Este es un entorno de práctica.» — DemoAssessmentForm · l.265
- «Año:» (label) — DemoAssessmentForm · l.283
- «Progreso» — DemoAssessmentForm · l.346
- «{progress.answered} de {progress.total} indicadores ( {progress.percentage} %)» — DemoAssessmentForm · l.347
- «Todos los indicadores respondidos» — DemoAssessmentForm · l.362, when `progress.percentage === 100`
- «Sin {ENTITY_LABELS.modules.toLowerCase()} en este {ENTITY_LABELS.objective.toLowerCase…}» — DemoAssessmentForm · l.396, when `objectives.length > 0 && each objectives && objective.modules.length === 0`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/assessment/IndicatorInput.tsx`
- `components/assessment/ModuleCard.tsx`
- `components/assessment/inputs/CoberturaInput.tsx`
- `components/assessment/inputs/DetalleInput.tsx`
- `components/assessment/inputs/FrecuenciaInput.tsx`
- `components/assessment/inputs/ProfundidadInput.tsx`
- `components/assessment/inputs/TraspasoInput.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/demo/assessments/[templateId]` | GET | `pages/demo/assessments/[templateId]/index.tsx:97` |

## /demo/assessments/[templateId]/results

File `pages/demo/assessments/[templateId]/results.tsx` · 395 lines · frame: MainLayout

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.152 `router.push → /login  (when !session?.user)`
  - l.224 `router.push → /login`
- Linked from: `pages/demo/assessments/[templateId]/index.tsx:224`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/demo/results-adapter.test.ts`.

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

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al instrumento» | `{handleBackToForm}` |  |  |  | DemoAssessmentResults · l.318 |
| «Cambiar Año/Generación» | `{handleChangeYear}` |  |  |  | DemoAssessmentResults · l.328 |
| «Reiniciar Demo» | `{handleReset}` |  |  |  | DemoAssessmentResults · l.336 |

**Moves to another page from code** (7)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.152 |
| `/demo/assessments/[*]` | `router.replace` | `!templateRaw \|\| !responsesRaw` | DemoAssessmentResults · l.181 |
| `/demo/assessments/[*]` | `router.replace` |  | DemoAssessmentResults · l.192 |
| `/login` | `router.push` |  | handleLogout · l.224 |
| `/demo/assessments/[*]` | `router.push` |  | handleBackToForm · l.240 |
| `/demo/assessments/[*]` | `router.push` |  | handleReset · l.248 |
| `/demo/assessments/[*]?openYearSelector=1` | `router.push` |  | handleChangeYear · l.252 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!templateId \|\| typeof templateId !== 'string'` | DemoAssessmentResults · l.173 |
| `!storedData \|\| !responses` | DemoAssessmentResults · l.198 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | DemoAssessmentResults · l.290 |
| `ResponsiveFunctionalPageHeader` | title: Resultados · subtitle: {areaLabel} - {template.name} |  |  | DemoAssessmentResults · l.299 |
| `SummaryCards` |  |  |  | DemoAssessmentResults · l.345 |
| `StrengthsWeaknesses` |  |  |  | DemoAssessmentResults · l.357 |
| `GapAnalysisSection` |  | `scoringResults.gapAnalysis` |  | DemoAssessmentResults · l.363 |
| `ResultsCharts` |  |  |  | DemoAssessmentResults · l.370 |
| `DetailedResults` |  |  |  | DemoAssessmentResults · l.372 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `genLabel` | «GT / GI» | DemoAssessmentResults · l.274 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: demo_template_{templateId}` | DemoAssessmentResults · l.176 |
| storage | `sessionStorage: demo_responses_{templateId}` | DemoAssessmentResults · l.177 |
| address value | `[templateId] (part of the address)` | l.1 |

**Other texts on screen** (4)

- «Cargando...» — DemoAssessmentResults · l.259, when `loading \|\| !user`
- «No se encontraron resultados» — DemoAssessmentResults · l.267, when `!scoringResults \|\| !storedData`
- «MODO DEMO — Estos resultados son simulados basados en sus respuestas de práctica.» — DemoAssessmentResults · l.310
- «Resultados simulados — {new Date().toLocaleDateString('es-C…} — Año {storedData.year} — {genLabel}» — DemoAssessmentResults · l.381

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/assessment/results/DetailedResults.tsx`
- `components/assessment/results/GapAnalysisSection.tsx`
- `components/assessment/results/ModuleResultCard.tsx`
- `components/assessment/results/ResultsCharts.tsx`
- `components/assessment/results/StrengthsWeaknesses.tsx`
- `components/assessment/results/SummaryCards.tsx`
- `components/assessment/results/types.ts`
- `components/layout/FunctionalPageHeader.tsx`
- `types/assessment-builder.ts`

## /demo/assessments

File `pages/demo/assessments/index.tsx` · 204 lines · frame: MainLayout

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.48 `router.push → /login  (when !session?.user)`
  - l.97 `router.push → /login`
- Linked from: `pages/demo/assessments/[templateId]/index.tsx:273`
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

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «No tienes demos asignados» | h3 | `!(loading) && demos.length === 0` | DemoAssessmentsListPage · l.142 |
| «{demo.name}» | h3 |  | DemoCard · l.172 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Iniciar Demo» | `/demo/assessments/[*]` |  |  | DemoCard · l.192 |
| «Iniciar Demo» |  |  |  | DemoCard · l.193 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar demos» |  | DemoAssessmentsListPage · l.83 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar demos» | `throw (shown by whoever catches it)` | `!response.ok` | DemoAssessmentsListPage · l.76 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.48 |
| `/login` | `router.push` |  | handleLogout · l.97 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!user` | DemoAssessmentsListPage · l.69 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | DemoAssessmentsListPage · l.109 |
| `ResponsiveFunctionalPageHeader` | title: Demos Disponibles · subtitle: Instrumentos de evaluación en modo de práctica |  |  | DemoAssessmentsListPage · l.118 |

**Values shown from data** (2)

- `{demo.areaLabel}` — DemoCard · l.180
- `{demo.description}` — DemoCard · l.185, when `demo.description`

**Other texts on screen** (5)

- «Cargando...» — DemoAssessmentsListPage · l.103, when `!user`
- «MODO DEMO — Las respuestas no se guardan. Este es un entorno de práctica para conocer los instrumentos.» — DemoAssessmentsListPage · l.129
- «Cargando demos...» — DemoAssessmentsListPage · l.137, when `loading`
- «Contacta a un administrador para solicitar acceso a demos de instrumentos.» — DemoAssessmentsListPage · l.146, when `!(loading) && demos.length === 0`
- «v {demo.version}» — DemoCard · l.175

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/demo/assessments` | GET | `pages/demo/assessments/index.tsx:73` |

## /directivo/assessments/dashboard

File `pages/directivo/assessments/dashboard.tsx` · 814 lines · frame: MainLayout

### Who reaches it

- Menu: Reportes › «Panel de Resultados» → `/directivo/assessments/dashboard` — roles: admin, equipo_directivo; the group: everyone signed in (`Sidebar.tsx` l.649)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.149 `router.push → /login  (when !session?.user)`
  - l.167 `router.push → /  (when !hasPermission)`
  - l.282 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:651`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/proc-pilot-journey.spec.ts`; unit tests of the page: `__tests__/pages/directivo-dashboard-school-choice.test.tsx`, `__tests__/pages/directivo-dashboard-unavailable.test.tsx`.
- QA scenarios that name this address: admin 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | pass |
| equipo_directivo | yes | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### Approved changes (decided by Brent with the mock-ups; not losses)

- Without permission (as a docente) the page shows the message in place; today it is a toast and a redirect. (gestor.md Screen B table row 'B1 §0 no permission'; approved by Brent 13 Nov 2026 10:00)
- «Actualizar» moves to the header and dims the page while keeping it in place (today the page blanks); toast «Datos actualizados». «(Nivel esperado: …)» in the year line is hidden when there are no results. (gestor.md Screen B table rows 'B1 §1 loading' and 'B1 §4 year line'; approved by Brent 13 Nov 2026 10:00)
- Admin and consultor get a school picker in the header (today the page cannot work for them). New text: select label «Colegio». (gestor.md Screen B 'Changed on purpose' bullet 1 and 'New texts' bullet 4; LEDGER Choices, Phase 1 Gestor; approved by Brent 13 Nov 2026 10:00)
- «Promedio por Vía de Transformación» becomes horizontal bars on a 0–100 axis with the value at the end and hover text «58% · Puntuación (12 registros)»; «Resumen por Curso» becomes one bar per course with its percentage and sign, hover giving grade and generation. (gestor.md Screen B table rows 'b. bar chart' and 'a. «Resumen por Curso»'; approved by Brent 13 Nov 2026 10:00)
- The radar «Perfil de Transformación» prints its values at each point (today no tooltip at all); still only with three areas or more. (gestor.md Screen B table row 'b. radar'; approved by Brent 13 Nov 2026 10:00)
- The expected level is drawn as a dashed line on both bar charts (today it is only words in the year line). New chart keys: «Puntuación, de 0 a 100», «Promedio del curso, de 0 a 100», «Nivel esperado: …». (gestor.md Screen B 'Changed on purpose' bullet 2 and 'New texts' bullet 3; approved by Brent 13 Nov 2026 10:00)
- One colour for the bars: the seven area colours are gone and the area is named in words on every bar, card and column. (gestor.md Screen B 'Changed on purpose' bullet 3; LEDGER Brent's decisions, decision (2) approved by Brent 13 Nov 2026 10:00)
- The two-slice donut «Cumplimiento de Expectativas» becomes one split bar («Cumplen», «En desarrollo») with the two counts under it. (gestor.md Screen B 'Changed on purpose' bullet 4 and table row 'Por Curso a. donut'; approved by Brent 13 Nov 2026 10:00)
- The per-course cards «Detalle por Curso» become a table (course and grade, GT/GI badge, one column per area, average, level, expectation) that stacks on a phone. New table heads: «Curso», «Generación», «Promedio», «Nivel», «Expectativa». (gestor.md Screen B 'Changed on purpose' bullet 4, table row 'b. «Detalle por Curso»' and 'New texts' bullet 4; approved by Brent 13 Nov 2026 10:00)
- Whether the average meets the expectation is said in words with a sign (today only the colour of the level text). New texts: «Cumple el nivel esperado» / «Bajo el nivel esperado»; «Cumple» in the table column «Expectativa». (gestor.md Screen B 'Changed on purpose' bullet 5 and 'New texts' bullet 1; approved by Brent 13 Nov 2026 10:00)
- Courses without registros are no longer counted in «Cumplen Expectativa» or in the split bar (today they count as 0%). This changes a number; the notes say the build must confirm it. (gestor.md Screen B 'Changed on purpose' bullet 6; LEDGER Brent's decisions, decision (3) approved by Brent 13 Nov 2026 10:00 (he was told it changes a number))
- New text: «De N cursos con resultado. Nivel esperado: …» (gestor.md Screen B 'New texts' bullet 2; approved by Brent 13 Nov 2026 10:00)

### Notes

- The dark strip «Maqueta · ver como» at the foot of the Gestor mock-ups (/maqueta/registro, /maqueta/resultados) switches sample states and is not part of the design. (gestor.md 'Where it sits in the mock-up', opening paragraph)

### What the page file itself draws

**Titles** (12)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Selecciona una Escuela» | h2 | `choosesSchool && !selectedSchoolId` | DirectivoDashboard · l.323 |
| «Resultados aún no disponibles» | h3 | `!hasResults && (schoolResults?.unavailableResults ?? 0) > 0` | DirectivoDashboard · l.439 |
| «No hay registros completados» | h3 | `!hasResults && !((schoolResults?.unavailableResults ?? 0) > 0)` | DirectivoDashboard · l.448 |
| «Promedio por Vía de Transformación» | h3 | `!(!hasResults) && activeTab === 'overview'` | DirectivoDashboard · l.548 |
| «Perfil de Transformación» | h3 | `!(!hasResults) && activeTab === 'overview' && radarData.length >= 3` | DirectivoDashboard · l.579 |
| «Detalle por Área» | h3 | `!(!hasResults) && activeTab === 'overview'` | DirectivoDashboard · l.604 |
| «{area.label}» | h4 | `!(!hasResults) && activeTab === 'overview' && each Object.values(areas)` | DirectivoDashboard · l.618 |
| «Cumplimiento de Expectativas» | h3 | `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0` | DirectivoDashboard · l.642 |
| «Resumen por Curso» | h3 | `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0` | DirectivoDashboard · l.669 |
| «Detalle por Curso» | h3 | `!(!hasResults) && activeTab === 'courses'` | DirectivoDashboard · l.712 |
| «{course.courseName}» | h4 | `!(!hasResults) && activeTab === 'courses' && each courses` | DirectivoDashboard · l.727 |
| «No hay cursos configurados» | h3 | `!(!hasResults) && activeTab === 'courses' && courses.length === 0` | DirectivoDashboard · l.796 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{school.name}» | `{() => handleSchoolSelect(school.id)}` | `choosesSchool && !selectedSchoolId && each schools` |  |  | DirectivoDashboard · l.329 |
| «Cambiar colegio» | `{handleChangeSchool}` | `choosesSchool` |  | `testid=results-change-school` | DirectivoDashboard · l.393 |
| «Actualizar» | `{handleRefresh}` |  | `{refreshing}` |  | DirectivoDashboard · l.416 |
| «Vista General» | `{() => setActiveTab('overview')}` | `!(!hasResults)` |  |  | DirectivoDashboard · l.462 |
| «Por Curso» | `{() => setActiveTab('courses')}` | `!(!hasResults)` |  |  | DirectivoDashboard · l.472 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permiso para acceder a esta página» | `!hasPermission` | checkAuth · l.166 |
| error | «Error al cargar resultados de la escuela» |  | DirectivoDashboard · l.232 |
| success | «Datos actualizados» |  | handleRefresh · l.277 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar resultados» | `throw (shown by whoever catches it)` | `!response.ok` | DirectivoDashboard · l.224 |
| «Error al cargar resultados por curso» | `throw (shown by whoever catches it)` | `!response.ok` | DirectivoDashboard · l.244 |

**Charts** (3)

| Chart | Series | Shown when | Where |
|---|---|---|---|
| BarChart | Bar `score` (slices: one colour per data row) | `!(!hasResults) && activeTab === 'overview'` | DirectivoDashboard · l.553 |
| RadarChart | Radar `score` «Promedio» | `!(!hasResults) && activeTab === 'overview' && radarData.length >= 3` | DirectivoDashboard · l.584 |
| PieChart | Pie `value` (slices: one colour per data row) | `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0` | DirectivoDashboard · l.647 |

**Moves to another page from code** (5)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.149 |
| `/` | `router.push` | `!hasPermission` | checkAuth · l.167 |
| `/login` | `router.push` |  | handleLogout · l.282 |
| `/directivo/assessments/dashboard?school_id=[*]` | `router.push` |  | handleSchoolSelect · l.287 |
| `/directivo/assessments/dashboard` | `router.push` |  | handleChangeSchool · l.291 |

**Draws nothing when** (5)

| Condition | Where |
|---|---|
| `!choosesSchool` | DirectivoDashboard · l.205 |
| `!user` | DirectivoDashboard · l.218 |
| `currentSchoolQuery.current !== schoolQuery` | DirectivoDashboard · l.228 |
| `!user` | DirectivoDashboard · l.238 |
| `currentSchoolQuery.current !== schoolQuery` | DirectivoDashboard · l.248 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `choosesSchool && !selectedSchoolId` |  | DirectivoDashboard · l.306 |
| `ResponsiveFunctionalPageHeader` | title: Panel de Resultados · subtitle: Selecciona una escuela | `choosesSchool && !selectedSchoolId` |  | DirectivoDashboard · l.315 |
| `MainLayout` |  |  |  | DirectivoDashboard · l.378 |
| `ResponsiveFunctionalPageHeader` | title: Panel de Resultados · subtitle: Escuela |  |  | DirectivoDashboard · l.387 |
| `CartesianGrid` | strokeDasharray: 3 3 | `!(!hasResults) && activeTab === 'overview'` |  | DirectivoDashboard · l.554 |
| `Pie` | cx: 50% · cy: 50% | `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0` |  | DirectivoDashboard · l.648 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `AREA_COLORS` | «rgb(var(--color-serie-1, var(--color-blue-500)))», «rgb(var(--color-serie-2, var(--color-legacy-10b981)))», «rgb(var(--color-serie-3, 245 158 11))», «rgb(var(--color-serie-4, var(--color-legacy-8b5cf6)))», «rgb(var(--color-serie-5, var(--color-legacy-ec4899)))», «rgb(var(--color-serie-1, var(--color-legacy-06b6d4)))», «rgb(var(--color-serie-2, var(--color-legacy-f97316)))» | l.115 |
| `pieData` | «Cumplen», «En desarrollo» | DirectivoDashboard · l.371 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Puntuación ({props.payload.count} registros)» | DirectivoDashboard · l.560 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| mark | `testid=results-choose-school` | DirectivoDashboard · l.324 |
| mark | `testid=results-unavailable-note` | DirectivoDashboard · l.427 |
| mark | `testid=course-unavailable-{course.courseId}` | DirectivoDashboard · l.744 |
| address value | `?school_id` | l.1 |

**Values shown from data** (17)

- `{schoolResults?.transformationYear}` — DirectivoDashboard · l.408
- `{Math.round(overall?.avgScore \|\| 0)} %` — DirectivoDashboard · l.495, when `!(!hasResults) && activeTab === 'overview'`
- `{overall?.totalInstances}` — DirectivoDashboard · l.513, when `!(!hasResults) && activeTab === 'overview'`
- `{Object.keys(areas).length}` — DirectivoDashboard · l.525, when `!(!hasResults) && activeTab === 'overview'`
- `{coursesMetExpectations} / {scoredCourses.length}` — DirectivoDashboard · l.537, when `!(!hasResults) && activeTab === 'overview'`
- `{Math.round(area.avgScore)} %` — DirectivoDashboard · l.621, when `!(!hasResults) && activeTab === 'overview' && each Object.values(areas)`
- `{levelInfo.label}` — DirectivoDashboard · l.624, when `!(!hasResults) && activeTab === 'overview' && each Object.values(areas)`
- `{course.courseName}` — DirectivoDashboard · l.679, when `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0 && each scoredCourses`
- `( {course.gradeLevelLabel} )` — DirectivoDashboard · l.680, when `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0 && each scoredCourses`
- `{course.generationType}` — DirectivoDashboard · l.683, when `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0 && each scoredCourses`
- `{Math.round(course.summary.avgScore)} %` — DirectivoDashboard · l.695, when `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0 && each scoredCourses`
- `{course.generationType}` — DirectivoDashboard · l.730, when `!(!hasResults) && activeTab === 'courses' && each courses`
- `{course.gradeLevelLabel}` — DirectivoDashboard · l.741, when `!(!hasResults) && activeTab === 'courses' && each courses`
- `{Math.round(course.summary.avgScore)} %` — DirectivoDashboard · l.749, when `!(!hasResults) && activeTab === 'courses' && each courses && !(isUnavailableOnly(course))`
- `{levelInfo.label}` — DirectivoDashboard · l.752, when `!(!hasResults) && activeTab === 'courses' && each courses && !(isUnavailableOnly(course))`
- `{areaResult.label}` — DirectivoDashboard · l.771, when `activeTab === 'courses' && each courses && Object.keys(course.byArea).length > 0 && each Object.values(course.byArea)`
- `{Math.round(areaResult.totalScore)} %` — DirectivoDashboard · l.772, when `activeTab === 'courses' && each courses && Object.keys(course.byArea).length > 0 && each Object.values(course.byArea)`

**Other texts on screen** (21)

- «Cargando...» — DirectivoDashboard · l.298, when `loading \|\| !user`
- «Elige un colegio para ver sus resultados» — DirectivoDashboard · l.325, when `choosesSchool && !selectedSchoolId`
- «Año de transformación:» — DirectivoDashboard · l.408
- «(Nivel esperado: {schoolResults.expectedLevel.label} )» — DirectivoDashboard · l.410, when `schoolResults?.expectedLevel`
- «Un registro completado aún no tiene resultado disponible y no se incluye en los promedios. / {schoolResults!.unavailableR…} registros completados aún no tienen resultado disponible y no se incluyen en los promedios.» — DirectivoDashboard · l.427, when `(schoolResults?.unavailableResults ?? 0) > 0`
- «Hay registros completados, pero sus resultados todavía no están disponibles.» — DirectivoDashboard · l.443, when `!hasResults && (schoolResults?.unavailableResults ?? 0) > 0`
- «Cuando los docentes completen sus registros, los resultados aparecerán aquí.» — DirectivoDashboard · l.452, when `!hasResults && !((schoolResults?.unavailableResults ?? 0) > 0)`
- «Promedio General» — DirectivoDashboard · l.492, when `!(!hasResults) && activeTab === 'overview'`
- «{overall?.levelLabel} / Por Comenzar» — DirectivoDashboard · l.498, when `!(!hasResults) && activeTab === 'overview'`
- «Registros» — DirectivoDashboard · l.510, when `!(!hasResults) && activeTab === 'overview'`
- «completados» — DirectivoDashboard · l.516, when `!(!hasResults) && activeTab === 'overview'`
- «Áreas» — DirectivoDashboard · l.522, when `!(!hasResults) && activeTab === 'overview'`
- «evaluadas» — DirectivoDashboard · l.528, when `!(!hasResults) && activeTab === 'overview'`
- «Cumplen Expectativa» — DirectivoDashboard · l.534, when `!(!hasResults) && activeTab === 'overview'`
- «cursos» — DirectivoDashboard · l.540, when `!(!hasResults) && activeTab === 'overview'`
- «{area.count} eval.» — DirectivoDashboard · l.619, when `!(!hasResults) && activeTab === 'overview' && each Object.values(areas)`
- «Generación Tractor / Generación Innova» (title) — DirectivoDashboard · l.683, when `!(!hasResults) && activeTab === 'courses' && scoredCourses.length > 0 && each scoredCourses`
- «Generación Tractor / Generación Innova» (title) — DirectivoDashboard · l.730, when `!(!hasResults) && activeTab === 'courses' && each courses`
- «Resultado no disponible» — DirectivoDashboard · l.745, when `!(!hasResults) && activeTab === 'courses' && each courses && isUnavailableOnly(course)`
- «{course.summary.unavailableR…} registro{course.summary.unavailableR…} completado{course.summary.unavailableR…} sin resultado disponible / Sin registros completados» — DirectivoDashboard · l.782, when `!(!hasResults) && activeTab === 'courses' && each courses && Object.keys(course.byArea).length === 0`
- «Configure los cursos en el cuestionario transversal para ver resultados por curso.» — DirectivoDashboard · l.800, when `!(!hasResults) && activeTab === 'courses' && courses.length === 0`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/directivo/assessments/course-results` | GET | `pages/directivo/assessments/dashboard.tsx:241` |
| `/api/directivo/assessments/school-results` | GET | `pages/directivo/assessments/dashboard.tsx:221` |
| `/api/school/transversal-context/schools` | GET | `pages/directivo/assessments/dashboard.tsx:175` |

## /docente/assessments/[instanceId]

File `pages/docente/assessments/[instanceId]/index.tsx` · 729 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.158 `router.push → /login  (when !session?.user)`
  - l.411 `router.push → /login`
  - l.446 `canEdit = assignee?.canEdit && !isCompleted && instance?.status !== 'archived' && !submitting && !leaving && draftState.ready && !draftState.recovery…`
  - l.524 `Sin autorización para enviar`
- Linked from: `pages/docente/assessments/index.tsx:386`, `pages/docente/assessments/index.tsx:393`
- Tests: browser tests that CI runs: `tests/e2e/assessment-draft.spec.ts`; browser tests CI skips: `tests/e2e/assessment-frequency-validation.spec.ts`, `tests/e2e/proc-pilot-journey.spec.ts`; unit tests of the page: `__tests__/pages/docente/assessment-archived-readonly.test.tsx`, `__tests__/pages/docente/assessment-completion.test.tsx`, `__tests__/pages/docente/assessment-form-autosave.test.tsx`, `__tests__/pages/docente/assessment-frequency.test.tsx`.

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

### Approved changes (decided by Brent with the mock-ups; not losses)

- The loading and load-error states («cargando», «no cargó») now sit inside the frame; texts and retry-assessment-load kept. (gestor.md 'Where it sits', Screen A table row 'A1 §1 load error, §2 loading'; approved by Brent 13 Nov 2026 10:00)
- A sticky strip under the top bar carries progress («Progreso», «N de M indicadores (X%)», bar), the save status with «Último guardado: HH:MM:SS», «Volver a registros», «Guardar» and «Enviar», so they stay in view down a long registro (today they scroll away). The save error, refusal list and 'draft in this browser' line become a red notice at the top of the body; «Registro completado» becomes a green notice there. All testids kept. (gestor.md Screen A 'Changed on purpose' bullet 1 and table rows A1 §5, §9, §11; approved by Brent 13 Nov 2026 10:00)
- New left index (desktop only) lists every práctica with how many indicators are answered and jumps to it. New texts: «X de Y respondidos», «No impl.», «Sin prácticas», aria-label «Índice del registro». (gestor.md Screen A 'Changed on purpose' bullet 2 and 'New texts' bullet 4; approved by Brent 13 Nov 2026 10:00)
- A new line under the strip says why «Enviar» is grey. New texts: «Para enviar faltan N indicadores por responder.» / «Para enviar falta 1 indicador por responder.» (gestor.md Screen A 'Changed on purpose' bullet 3 and 'New texts' bullet 1; approved by Brent 13 Nov 2026 10:00)
- Read-only and archived registros say so in a notice (today only faded fields), and an archived registro no longer shows «Sin autorización para enviar». New texts: «Solo lectura: puedes ver las respuestas, pero no modificarlas.», «Este registro está archivado: puedes ver las respuestas, pero no modificarlas.» (gestor.md Screen A 'Changed on purpose' bullet 4 and 'New texts' bullets 2-3; approved by Brent 13 Nov 2026 10:00)
- One level mark for the whole product (four small bars filled up to the level, plus the level's name) replaces today's three colour codes; on this form it replaces the coloured left border of the Profundidad choices. The results dashboard uses the same mark. (gestor.md Screen A 'Changed on purpose' bullet 5 and table row A2.5; LEDGER Brent's decisions, decision (1) approved by Brent 13 Nov 2026 10:00)
- Each práctica header also says «X de Y respondidos», counted like the progress. (gestor.md Screen A 'Changed on purpose' bullet 6; approved by Brent 13 Nov 2026 10:00)
- «Estado» in the context card is a badge. (gestor.md Screen A table row 'A1 §7 context card'; approved by Brent 13 Nov 2026 10:00)
- The browser confirm() when leaving with unsaved changes has no place in the mock-up; in the build it becomes a pop-up of the shared kind with today's text. (gestor.md Screen A table row 'A3 leaving with unsaved changes'; approved by Brent 13 Nov 2026 10:00)
- The hand-built submit dialog becomes the shared pop-up, with the same title, body, buttons and testids. (gestor.md Screen A table row 'A4 §1 submit dialog'; approved by Brent 13 Nov 2026 10:00)

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «No pudimos cargar el registro» | h1 | `loadError` | AssessmentResponseForm · l.417 |
| «¿Enviar el registro?» | h2 | `confirmSubmitOpen` | AssessmentResponseForm · l.539 |
| «Encontramos un borrador pendiente en este navegador» | h2 | `draftState.recovery.length > 0` | AssessmentResponseForm · l.606 |
| «{ENTITY_LABELS.objective} : {objective.name}» | h3 | `objectives.length > 0 && each objectives` | AssessmentResponseForm · l.676 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar carga» | `{() => void fetchAssessment()}` | `loadError` |  | `testid=retry-assessment-load` | AssessmentResponseForm · l.420 |
| «Guardando y volviendo... / Volver a registros» | `{handleBack}` |  | `{leaving}` | `testid=assessment-back-button` | AssessmentResponseForm · l.469 |
| «Guardar» | `{handleManualSave}` | `!isCompleted && canEdit` | `{saving \|\| submitting \|\| leaving \|\| !hasUnsavedChanges}` | `testid=assessment-save-button` | AssessmentResponseForm · l.488 |
| «Enviando... / Enviar» | `{handleSubmit}` | `!isCompleted && canSubmit` | `{submitting \|\| leaving \|\| !draftState.ready \|\| draftState.recovery.length > 0 \|\|…}` | `testid=assessment-submit-button` | AssessmentResponseForm · l.499 |
| «Cancelar» | `{() => setConfirmSubmitOpen(false)}` | `confirmSubmitOpen` |  | `testid=assessment-submit-cancel` | AssessmentResponseForm · l.547 |
| «Sí, enviar» | `{confirmSubmit}` | `confirmSubmitOpen` |  | `testid=assessment-submit-confirm-button` | AssessmentResponseForm · l.555 |
| «Recuperar borrador ( {new Date(draft.savedAt).toLocaleStr…} )» | `{() => recoverDraft(draft.key)}` | `draftState.recovery.length > 0 && each draftState.recovery` |  | `testid=recover-assessment-draft` | AssessmentResponseForm · l.609 |
| «Descartar borradores y usar las respuestas del servidor» | `{() => draftSession.discardRecovery()}` | `draftState.recovery.length > 0` |  | `testid=discard-assessment-drafts` | AssessmentResponseForm · l.614 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «¿Enviar el registro?» | written in this file | `confirmSubmitOpen` |  | AssessmentResponseForm · l.531 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «{LEAVE_WITH_UNSAVED_MESSAGE}» |  | onRouteChangeStart · l.145 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «{saveFailureMessage(SAVE_FAILED_MESSAGE)}» | `!(await saveResponses())` | handleManualSave · l.331 |
| error | «{saveFailureMessage(BACK_SAVE_FAILED_MESSAGE)}» | `draftSession?.state.pendingCount && !(await saveResponses())` | handleBack · l.339 |
| error | «Hay respuestas pendientes de guardar. Intenta nuevamente antes de enviar.» | `!saved` | confirmSubmit · l.380 |
| error | «Faltan {data.missingCount} respuestas por completar» | `!response.ok && data.missingCount` | confirmSubmit · l.391 |
| success | «Registro completado» |  | confirmSubmit · l.399 |
| error | «Error al enviar el registro» |  | confirmSubmit · l.402 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Navegación cancelada: hay respuestas sin guardar» | `throw (shown by whoever catches it)` |  | onRouteChangeStart · l.147 |
| «Error al cargar el registro» | `throw (shown by whoever catches it)` | `!response.ok` | AssessmentResponseForm · l.187 |
| «No se pudieron recuperar las respuestas guardadas.» | `setLoadError` | `sequence === loadSequence.current` | AssessmentResponseForm · l.213 |
| «Error al enviar» | `throw (shown by whoever catches it)` | `!response.ok && !(data.missingCount)` | confirmSubmit · l.393 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.158 |
| `{ASSESSMENTS_LIST_PATH}` | `router.push` |  | handleBack · l.343 |
| `/login` | `router.push` |  | handleLogout · l.411 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `canEdit = assignee?.canEdit && !isCompleted && instance?.status !== 'archived' && !submitting && !leaving && draftState.ready && !draftState.recovery…` | AssessmentResponseForm · l.446 |

**Draws nothing when** (5)

| Condition | Where |
|---|---|
| `!scope \|\| typeof instanceId !== 'string'` | AssessmentResponseForm · l.93 |
| `!draftSession` | AssessmentResponseForm · l.118 |
| `!events \|\| !draftSession` | AssessmentResponseForm · l.142 |
| `!user \|\| typeof instanceId !== 'string' \|\| !draftSession` | AssessmentResponseForm · l.179 |
| `sequence !== loadSequence.current` | AssessmentResponseForm · l.191 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | AssessmentResponseForm · l.449 |
| `ResponsiveFunctionalPageHeader` | title: Registro · subtitle: Registro |  |  | AssessmentResponseForm · l.458 |
| `HelpButton` | sectionId: proceso-de-cambio |  |  | AssessmentResponseForm · l.463 |
| `ModuleCard` |  | `objectives.length > 0 && each objectives && each objective.modules` |  | AssessmentResponseForm · l.688 |
| `ModuleCard` |  | `!(objectives.length > 0) && each modules` |  | AssessmentResponseForm · l.711 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `INSTANCE_STATUS_LABELS` | «Pendiente», «En progreso», «Completado», «Archivado» | l.31 |
| `SAVE_FAILED_MESSAGE` | «No se pudieron guardar tus respuestas. Revisa tu conexión e intenta nuevamente.» | l.38 |
| `LEAVE_WITH_UNSAVED_MESSAGE` | «Tienes respuestas sin guardar en el servidor. Salir puede requerir recuperar el borrador de este navegador. ¿Deseas salir de todos modos?» | l.39 |
| `BACK_SAVE_FAILED_MESSAGE` | «No se pudieron guardar tus respuestas antes de salir. Revisa tu conexión e intenta nuevamente.» | l.41 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «El servidor rechazó el guardado.» | saveRefusalReasons · l.51 |
| «Sin generación» | AssessmentResponseForm · l.444 |
| «Sin estado» | AssessmentResponseForm · l.445 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (16)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('beforeunload')` | AssessmentResponseForm · l.126 |
| listener | `window.addEventListener('online')` | AssessmentResponseForm · l.127 |
| role | `role=alert` | AssessmentResponseForm · l.416 |
| mark | `testid=assessment-submit-unavailable` | AssessmentResponseForm · l.519 |
| mark | `testid=assessment-context-summary` | AssessmentResponseForm · l.569 |
| mark | `testid=assessment-context-course` | AssessmentResponseForm · l.575 |
| mark | `testid=assessment-context-grade` | AssessmentResponseForm · l.581 |
| mark | `testid=assessment-context-year` | AssessmentResponseForm · l.587 |
| mark | `testid=assessment-context-generation` | AssessmentResponseForm · l.593 |
| mark | `testid=assessment-context-status` | AssessmentResponseForm · l.599 |
| role | `role=alert` | AssessmentResponseForm · l.605 |
| mark | `testid=assessment-save-status` | AssessmentResponseForm · l.620 |
| mark | `testid=assessment-save-refusal` | AssessmentResponseForm · l.626 |
| role | `role=alert` | AssessmentResponseForm · l.634 |
| role | `role=status` | AssessmentResponseForm · l.656 |
| address value | `[instanceId] (part of the address)` | l.1 |

**Values shown from data** (6)

- `{loadError}` — AssessmentResponseForm · l.418, when `loadError`
- `{generationLabel}` — AssessmentResponseForm · l.593
- `{statusLabel}` — AssessmentResponseForm · l.599
- `{draftState.saveError}` — AssessmentResponseForm · l.624, when `!isCompleted && draftState.ready && !draftState.recovery.length && draftState.saveError`
- `{reason}` — AssessmentResponseForm · l.627, when `!isCompleted && draftState.ready && !draftState.recovery.length && draftState.saveError && saveRefusal && each describeRefusal(saveRefusal)`
- `{objective.description}` — AssessmentResponseForm · l.682, when `objectives.length > 0 && each objectives && objective.description`

**Other texts on screen** (24)

- «Para proteger tus respuestas, el formulario estará disponible cuando podamos recuperarlas.» — AssessmentResponseForm · l.419, when `loadError`
- «Cargando...» — AssessmentResponseForm · l.431, when `loading \|\| !user \|\| loadedScope !== scope \|\| !draftSession`
- «Guardando...» — AssessmentResponseForm · l.484, when `saving`
- «Solo el docente responsable puede enviar este registro» (title) — AssessmentResponseForm · l.519, when `!isCompleted && !canSubmit`
- «Sin autorización para enviar» — AssessmentResponseForm · l.524, when `!isCompleted && !canSubmit`
- «Al enviar, el registro queda completado y no podrás modificar tus respuestas. Tus respuestas pendientes se guardarán antes de enviar.» — AssessmentResponseForm · l.543, when `confirmSubmitOpen`
- «Curso» — AssessmentResponseForm · l.574
- «{instance?.courseInfo?.courseName} / Sin curso asignado» — AssessmentResponseForm · l.575
- «Nivel» — AssessmentResponseForm · l.580
- «{gradeLabel} / Sin nivel» — AssessmentResponseForm · l.581
- «Año de transformación» — AssessmentResponseForm · l.586
- «Año {instance.transformationYear} / Sin año» — AssessmentResponseForm · l.587
- «Generación» — AssessmentResponseForm · l.592
- «Estado» — AssessmentResponseForm · l.598
- «Puedes recuperarlo para continuar. Sus respuestas reemplazarán las correspondientes del formulario; las demás se conservarán. Si otra persona o pestaña actualizó el registro, revisa antes de recuperar.» — AssessmentResponseForm · l.607, when `draftState.recovery.length > 0`
- «Guardando respuestas… / Cambios pendientes de guardar en el servidor. / Respuestas guardadas en el servidor.» — AssessmentResponseForm · l.621, when `!isCompleted && draftState.ready && !draftState.recovery.length`
- «Hay un borrador de tus cambios en este navegador para recuperarlos al volver.» — AssessmentResponseForm · l.623, when `!isCompleted && draftState.ready && !draftState.recovery.length && hasUnsavedChanges && !draftState.storageError`
- «Último guardado: {new Date(draftState.lastSavedAt).to…}» — AssessmentResponseForm · l.630, when `!isCompleted && draftState.ready && !draftState.recovery.length && draftState.lastSavedAt`
- «No pudimos asegurar el respaldo en este navegador. No cierres la página con cambios pendientes; espera la confirmación del guardado en el servidor.» — AssessmentResponseForm · l.635, when `draftState.storageError`
- «Progreso» — AssessmentResponseForm · l.642
- «{progress.answered} de {progress.total} indicadores ( {progress.percentage} %)» — AssessmentResponseForm · l.643
- «Registro completado» — AssessmentResponseForm · l.659, when `isCompleted`
- «Los informes individuales y del colegio se generarán una vez que todas las personas responsables hayan completado sus registros y los asesores correspondientes hayan aportado su retroalimentación al proceso.» — AssessmentResponseForm · l.662, when `isCompleted`
- «Sin {ENTITY_LABELS.modules.toLowerCase()} en este {ENTITY_LABELS.objective.toLowerCase…}» — AssessmentResponseForm · l.699, when `objectives.length > 0 && each objectives && objective.modules.length === 0`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/assessment/IndicatorInput.tsx`
- `components/assessment/ModuleCard.tsx`
- `components/assessment/inputs/CoberturaInput.tsx`
- `components/assessment/inputs/DetalleInput.tsx`
- `components/assessment/inputs/FrecuenciaInput.tsx`
- `components/assessment/inputs/ProfundidadInput.tsx`
- `components/assessment/inputs/TraspasoInput.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `components/tutorials/HelpButton.tsx`
- `components/tutorials/HelpDrawer.tsx`
- `components/tutorials/VimeoEmbed.tsx`
- `components/ui/dialog.tsx`
- `lib/services/assessment-builder/responseDraft.ts`
- `lib/tutorials/content.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/docente/assessments/[instanceId]` | GET | `pages/docente/assessments/[instanceId]/index.tsx:184` |
| `/api/docente/assessments/[instanceId]/responses` | PUT | `lib/services/assessment-builder/responseDraft.ts:180` |
| `/api/docente/assessments/[instanceId]/submit` | POST | `pages/docente/assessments/[instanceId]/index.tsx:383` |

## /docente/assessments/[instanceId]/results

File `pages/docente/assessments/[instanceId]/results.tsx` · 207 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.37 `router.push → /login  (when !session?.user)`
  - l.92 `router.push → /login`
- Linked from: `pages/docente/assessments/index.tsx:379`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/assessment-results.spec.ts`, `tests/e2e/proc-pilot-journey.spec.ts`.

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

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a registros» | `/docente/assessments` |  |  | AssessmentResults · l.146 |
| «Volver a registros» |  |  |  | AssessmentResults · l.147 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar resultados» |  | AssessmentResults · l.77 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar resultados» | `throw (shown by whoever catches it)` | `!response.ok` | AssessmentResults · l.65 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.37 |
| `/docente/assessments` | `router.push` |  | AssessmentResults · l.78 |
| `/login` | `router.push` |  | handleLogout · l.92 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!user \|\| !instanceId` | AssessmentResults · l.58 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | AssessmentResults · l.127 |
| `ResponsiveFunctionalPageHeader` | title: Resultados · subtitle: {template.areaLabel} - {template.name} |  |  | AssessmentResults · l.136 |
| `HelpButton` | sectionId: proceso-de-cambio |  |  | AssessmentResults · l.141 |
| `SummaryCards` |  |  |  | AssessmentResults · l.153 |
| `StrengthsWeaknesses` |  |  |  | AssessmentResults · l.165 |
| `GapAnalysisSection` |  | `results.gapAnalysis` |  | AssessmentResults · l.171 |
| `ResultsCharts` |  |  |  | AssessmentResults · l.178 |
| `DetailedResults` |  |  |  | AssessmentResults · l.180 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[instanceId] (part of the address)` | l.1 |

**Other texts on screen** (4)

- «Cargando...» — AssessmentResults · l.111, when `loading \|\| !user`
- «No se encontraron resultados» — AssessmentResults · l.119, when `!results`
- «Registro completado el {new Date(results.instance.completed…}» — AssessmentResults · l.189
- «Versión del instrumento: {results.instance.snapshotVersion}» — AssessmentResults · l.199

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/assessment/results/DetailedResults.tsx`
- `components/assessment/results/GapAnalysisSection.tsx`
- `components/assessment/results/ModuleResultCard.tsx`
- `components/assessment/results/ResultsCharts.tsx`
- `components/assessment/results/StrengthsWeaknesses.tsx`
- `components/assessment/results/SummaryCards.tsx`
- `components/assessment/results/types.ts`
- `components/layout/FunctionalPageHeader.tsx`
- `components/tutorials/HelpButton.tsx`
- `components/tutorials/HelpDrawer.tsx`
- `components/tutorials/VimeoEmbed.tsx`
- `components/ui/dialog.tsx`
- `lib/tutorials/content.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/docente/assessments/[instanceId]/results` | GET | `pages/docente/assessments/[instanceId]/results.tsx:62` |

## /docente/assessments

File `pages/docente/assessments/index.tsx` · 407 lines · frame: MainLayout

### Who reaches it

- Menu: Mi Aprendizaje › «Feedback» → `/docente/assessments` — roles: admin, consultor; the group: everyone signed in (`Sidebar.tsx` l.161)
- Menu: Gestor de Cambio › «Mis Registros» → `/docente/assessments` — only with a registro assigned; the group: everyone signed in (`Sidebar.tsx` l.316)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.91 `router.push → /login  (when !session?.user)`
  - l.143 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:163`, `components/layout/Sidebar.tsx:318`, `pages/docente/assessments/[instanceId]/index.tsx:43`, `pages/docente/assessments/[instanceId]/results.tsx:146`, `pages/docente/assessments/[instanceId]/results.tsx:78`
- Tests: browser tests that CI runs: `tests/e2e/assessment-delivery.spec.ts`; browser tests CI skips: `tests/e2e/proc-pilot-journey.spec.ts`; unit tests of the page: `__tests__/pages/docente/assessments-list-cards.test.tsx`.
- QA scenarios that name this address: admin 1, consultor 1, lider_generacion 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | if has a registro assigned | pass |
| lider_generacion | if has a registro assigned | pass |
| lider_comunidad | if has a registro assigned | pass |
| supervisor_de_red | if has a registro assigned | pass |
| community_manager | if has a registro assigned | pass |
| docente | if has a registro assigned | pass |
| encargado_licitacion | if has a registro assigned | pass |

### What the page file itself draws

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «No hay registros asignados» | h3 | `!(loading) && assessments.length === 0` | DocenteAssessmentsPage · l.204 |
| «Por Completar ( {pendingAssessments.length} )» | h2 | `!(loading) && !(assessments.length === 0) && pendingAssessments.length > 0` | DocenteAssessmentsPage · l.216 |
| «Completados ( {completedAssessments.length} )» | h2 | `!(loading) && !(assessments.length === 0) && completedAssessments.length > 0` | DocenteAssessmentsPage · l.234 |
| «Archivados ( {archivedAssessments.length} )» | h2 | `!(loading) && !(assessments.length === 0) && archivedAssessments.length > 0` | DocenteAssessmentsPage · l.252 |
| «{assessment.templateName}» | h3 |  | AssessmentCard · l.299 |

**Links** (6)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver Resultados» | `/docente/assessments/[*]/results` | `isCompleted` |  | AssessmentCard · l.379 |
| «Ver Resultados» |  | `isCompleted` |  | AssessmentCard · l.380 |
| «Ver registro» | `/docente/assessments/[*]` | `!(isCompleted) && isArchived` |  | AssessmentCard · l.386 |
| «Ver registro» |  | `!(isCompleted) && isArchived` |  | AssessmentCard · l.387 |
| «Continuar» | `/docente/assessments/[*]` | `!(isCompleted) && !(isArchived)` |  | AssessmentCard · l.393 |
| «Continuar» |  | `!(isCompleted) && !(isArchived)` |  | AssessmentCard · l.394 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Filtrar por estado» | select |  | «Todos los estados», «Pendiente», «En Progreso», «Completado», «Archivado» |  | `testid=assessment-status-filter` | DocenteAssessmentsPage · l.182 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar registros» |  | DocenteAssessmentsPage · l.129 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar registros» | `throw (shown by whoever catches it)` | `!response.ok` | DocenteAssessmentsPage · l.122 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.91 |
| `/login` | `router.push` |  | handleLogout · l.143 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!user` | DocenteAssessmentsPage · l.112 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | DocenteAssessmentsPage · l.161 |
| `ResponsiveFunctionalPageHeader` | title: Mis Registros · subtitle: {assessments.length} registro{assessments.length !== 1 ? …} asignado{assessments.length !== 1 ? …} |  |  | DocenteAssessmentsPage · l.170 |
| `HelpButton` | sectionId: proceso-de-cambio |  |  | DocenteAssessmentsPage · l.175 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `STATUS_CONFIG` | «Pendiente», «En Progreso», «Completado», «Archivado» | l.50 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=assessment-card-course-{assessment.id}` | AssessmentCard · l.353 |

**Values shown from data** (4)

- `{statusConfig.icon} {statusConfig.label}` — AssessmentCard · l.308
- `{assessment.generationType}` — AssessmentCard · l.313, when `assessment.generationType`
- `{AREA_LABELS[assessment.templateArea]}` — AssessmentCard · l.349
- `{[ assessment.gradeLevel ? (GRADE_LE…}` — AssessmentCard · l.353, when `(assessment.gradeLevel \|\| assessment.courseName)`

**Other texts on screen** (10)

- «Cargando...» — DocenteAssessmentsPage · l.155, when `!user`
- «Cargando registros...» — DocenteAssessmentsPage · l.199, when `loading`
- «Cuando te asignen registros, aparecerán aquí.» — DocenteAssessmentsPage · l.208, when `!(loading) && assessments.length === 0`
- «v {assessment.templateVersion}» — AssessmentCard · l.305
- «Actualizado» — AssessmentCard · l.327, when `isNewerVersion`
- «Nueva versión — el instrumento fue actualizado desde tu último registro» — AssessmentCard · l.336, when `isNewerVersion`
- «Registro archivado: disponible solo para consulta, no se puede continuar ni enviar.» — AssessmentCard · l.343, when `isArchived`
- «Año {assessment.transformationYear}» — AssessmentCard · l.364
- «Asignado: {new Date(assessment.assignedAt).toL…}» — AssessmentCard · l.365
- «Completado: {new Date(assessment.completedAt).to…}» — AssessmentCard · l.369, when `assessment.completedAt`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/tutorials/HelpButton.tsx`
- `components/tutorials/HelpDrawer.tsx`
- `components/tutorials/VimeoEmbed.tsx`
- `components/ui/dialog.tsx`
- `lib/tutorials/content.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/docente/assessments` | GET | `pages/docente/assessments/index.tsx:119` |

## /school/migration-plan

File `pages/school/migration-plan/index.tsx` · 837 lines · frame: MainLayout

### Who reaches it

- Menu: Gestor de Cambio › «Plan de Migración» → `/school/migration-plan` — roles: admin, consultor, equipo_directivo; the group: everyone signed in (`Sidebar.tsx` l.308)
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.107 `router.push → /login  (when !session?.user)`
  - l.361 `router.push → /login`
  - l.396 `No tienes permiso para acceder al Plan de Migración.`
- Linked from: `components/layout/Sidebar.tsx:310`, `pages/school/transversal-context/index.tsx:935`, `pages/school/transversal-context/index.tsx:936`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/school-migration-plan-defaults.test.tsx`, `__tests__/pages/school/migration-plan-denied-state.test.tsx`.
- QA scenarios that name this address: admin 2, consultor 1, equipo_directivo 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | yes | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### What the page file itself draws

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `hasPermission === false \|\| planLoadFailed` | MigrationPlanPage · l.395 |
| «Selecciona una Escuela» | h2 | `isAdmin && !schoolId && schools.length > 0` | MigrationPlanPage · l.428 |
| «Sin Escuela Asignada» | h1 | `!schoolId` | MigrationPlanPage · l.460 |
| «Proyección de Transformación» | h3 | `grades.length > 0` | MigrationPlanPage · l.544 |
| «Planificación de Generaciones» | h3 |  | MigrationPlanPage · l.655 |
| «Advertencia» | h3 | `hasYear5GI()` | MigrationPlanPage · l.675 |
| «Matriz de Migración» | h2 |  | MigrationPlanPage · l.687 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{school.name}» | `{() => handleSchoolSelect(school.id)}` | `isAdmin && !schoolId && schools.length > 0 && each schools` |  |  | MigrationPlanPage · l.431 |
| «Volver a Selección de Escuelas» | `{async () => { setSchoolId(null); setSchoolName(''); setGrades([]); setEntries([…}` | `isAdmin` |  |  | MigrationPlanPage · l.505 |
| «{genType}» · tooltip «{isLocked ? 'Este nivel es siempre GT' : !canWritePlan ? 'Solo lectura' : `Clic …}» | `{() => toggleCell(year, grade.id, isLocked)}` | `each grades && each [1, 2, 3, 4, 5]` | `{isLocked \|\| !canWritePlan}` |  | MigrationPlanPage · l.753 |
| «Guardando... / Guardar Plan» | `{handleSave}` | `canWritePlan` | `{!saveEnabled}` | `testid=migration-plan-save` | MigrationPlanPage · l.789 |

**Links** (8)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ir al Panel» | `/dashboard` | `hasPermission === false \|\| planLoadFailed` |  | MigrationPlanPage · l.397 |
| «Ir al Panel» |  | `hasPermission === false \|\| planLoadFailed` |  | MigrationPlanPage · l.398 |
| «Ir al Panel» | `/dashboard` | `!schoolId` |  | MigrationPlanPage · l.462 |
| «Ir al Panel» |  | `!schoolId` |  | MigrationPlanPage · l.463 |
| «Volver al Contexto Transversal» | `/school/transversal-context` | `!(isAdmin)` |  | MigrationPlanPage · l.533 |
| «Volver al Contexto Transversal» |  | `!(isAdmin)` |  | MigrationPlanPage · l.534 |
| «Ver Contexto Transversal» | `/school/transversal-context[*]` |  |  | MigrationPlanPage · l.639 |
| «Ver Contexto Transversal» |  |  |  | MigrationPlanPage · l.643 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | number | `min=0 max=100` |  | `grades.length > 0 && each [1, 2, 3, 4, 5]` |  | MigrationPlanPage · l.621 |

**Table columns** (2)

| Text | Shown when | Where |
|---|---|---|
| «Nivel» |  | MigrationPlanPage · l.704 |
| «Año {year} [(Actual)]» | `each [1, 2, 3, 4, 5]` | MigrationPlanPage · l.708 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar el plan de migración» |  | MigrationPlanPage · l.220 |
| plain | «{data.warning}» | `data.warning` | handleSave · l.303 |
| success | «Plan de migración guardado exitosamente» | `!(data.warning)` | handleSave · l.305 |
| error | «Error al guardar el plan de migración» |  | handleSave · l.309 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar el plan de migración» | `throw (shown by whoever catches it)` | `!response.ok` | MigrationPlanPage · l.208 |
| «Error al guardar el plan de migración» | `throw (shown by whoever catches it)` | `!response.ok` | handleSave · l.296 |

**Charts** (1)

| Chart | Series | Shown when | Where |
|---|---|---|---|
| PieChart | Pie `value` (slices: 2) | `grades.length > 0 && each [1, 2, 3, 4, 5]` | MigrationPlanPage · l.564 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.107 |
| `/login` | `router.push` |  | handleLogout · l.361 |
| `/school/migration-plan?school_id=[*]` | `router.push` |  | handleSchoolSelect · l.366 |
| `/school/migration-plan` | `router.push` | `isAdmin` | MigrationPlanPage · l.525 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!schoolId` | MigrationPlanPage · l.199 |

**Pieces placed here, with the texts and settings handed to them** (9)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `hasPermission === false \|\| planLoadFailed` |  | MigrationPlanPage · l.384 |
| `MainLayout` |  | `isAdmin && !schoolId && schools.length > 0` |  | MigrationPlanPage · l.411 |
| `ResponsiveFunctionalPageHeader` | title: Plan de Migración · subtitle: Selecciona una escuela | `isAdmin && !schoolId && schools.length > 0` |  | MigrationPlanPage · l.420 |
| `MainLayout` |  | `!schoolId` |  | MigrationPlanPage · l.449 |
| `MainLayout` |  |  |  | MigrationPlanPage · l.474 |
| `ResponsiveFunctionalPageHeader` | title: Plan de Migración · subtitle: Definir generaciones por año |  |  | MigrationPlanPage · l.483 |
| `CompletionStatusBadge` |  | `completionStatus` |  | MigrationPlanPage · l.493 |
| `Pie` | cx: 50% · cy: 50% · innerRadius: 60% · outerRadius: 100% | `grades.length > 0 && each [1, 2, 3, 4, 5]` |  | MigrationPlanPage · l.565 |
| `ChangeHistorySection` | feature: migration_plan | `grades.length > 0` |  | MigrationPlanPage · l.818 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Clic para cambiar a {isGT ? 'GI' : 'GT'}» | MigrationPlanPage · l.764 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.359 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.360 |
| address value | `?school_id` | l.1 |

**Values shown from data** (1)

- `{percentage} %` — MigrationPlanPage · l.587, when `grades.length > 0 && each [1, 2, 3, 4, 5]`

**Other texts on screen** (27)

- «Cargando...» — MigrationPlanPage · l.375, when `loading && hasPermission !== false`
- «No tienes permiso para acceder al Plan de Migración.» — MigrationPlanPage · l.396, when `hasPermission === false \|\| planLoadFailed`
- «No se encontró una escuela asociada a tu cuenta.» — MigrationPlanPage · l.461, when `!schoolId`
- «Porcentaje estimado de transformación al final de cada año» — MigrationPlanPage · l.549, when `grades.length > 0`
- «Año {year}» — MigrationPlanPage · l.593, when `grades.length > 0 && each [1, 2, 3, 4, 5]`
- «(Actual)» — MigrationPlanPage · l.601, when `grades.length > 0 && each [1, 2, 3, 4, 5] && isCurrentYear`
- «GT» — MigrationPlanPage · l.612, when `grades.length > 0`
- «= 100% transformado desde el inicio» — MigrationPlanPage · l.612, when `grades.length > 0`
- «GI» — MigrationPlanPage · l.616, when `grades.length > 0`
- «por año:» — MigrationPlanPage · l.616, when `grades.length > 0`
- «Año {year} :» — MigrationPlanPage · l.620, when `grades.length > 0 && each [1, 2, 3, 4, 5]`
- «Define qué niveles serán» — MigrationPlanPage · l.657
- «Generación Tractor (GT)» — MigrationPlanPage · l.657
- «y cuáles» — MigrationPlanPage · l.657
- «Generación Innova (GI)» — MigrationPlanPage · l.657
- «para cada año de transformación. Los niveles de Medio Menor a Segundo Básico son siempre GT y no pueden modificarse.» — MigrationPlanPage · l.657
- «Año actual de transformación:» — MigrationPlanPage · l.662, when `transformationYear`
- «Año» — MigrationPlanPage · l.662, when `transformationYear`
- «El Año 5 tiene niveles marcados como GI. Se recomienda que todos los niveles sean GT en el Año 5.» — MigrationPlanPage · l.677, when `hasYear5GI()`
- «GT» — MigrationPlanPage · l.690
- «Generación Tractor» — MigrationPlanPage · l.691
- «GI» — MigrationPlanPage · l.694
- «Generación Innova» — MigrationPlanPage · l.695
- «Siempre GT» (title) — MigrationPlanPage · l.734, when `each grades && grade.is_always_gt`
- «Tienes cambios sin guardar» — MigrationPlanPage · l.781, when `hasChanges`
- «Plan sin guardar: se muestra lo que el sistema aplica hoy» — MigrationPlanPage · l.783, when `!(hasChanges) && entries.length === 0`
- «Todos los cambios guardados» — MigrationPlanPage · l.785, when `!(hasChanges) && !(entries.length === 0)`

**Reads and writes the database directly:** `table:profiles` (select), `table:schools` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/school/ChangeHistorySection.tsx`
- `components/school/CompletionStatusBadge.tsx`
- `lib/services/assessment-builder/migrationPlanRule.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/school/change-history` | GET | `components/school/ChangeHistorySection.tsx:87` |
| `/api/school/completion-status` | GET | `pages/school/migration-plan/index.tsx:230` |
| `/api/school/migration-plan` | GET, PUT | `pages/school/migration-plan/index.tsx:204`, `pages/school/migration-plan/index.tsx:284` |
| `/api/school/transversal-context/schools` | GET | `pages/school/migration-plan/index.tsx:178`, `pages/school/migration-plan/index.tsx:515` |

## /school/transversal-context/edit

File `pages/school/transversal-context/edit.tsx` · 1081 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: signed-in only; with ?school_id= an equipo directivo only passes for its own school. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.84 `router.push → /login  (when !session?.user)`
  - l.113 `isAdmin = roles.some(r => r.role_type === 'admin')`
  - l.408 `router.push → /login`
- Linked from: `pages/school/transversal-context/index.tsx:1384`, `pages/school/transversal-context/index.tsx:1385`, `pages/school/transversal-context/index.tsx:894`, `pages/school/transversal-context/index.tsx:895`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/proc-pilot-journey.spec.ts`; unit tests of the page: `__tests__/pages/school/transversal-context-edit.test.tsx`.

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

**Titles** (10)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{q.question_text}» | h3 |  | renderTotalStudents · l.417 |
| «{q.question_text}» | h3 |  | renderGradeLevels · l.444 |
| «Preescolar» | h4 |  | renderGradeLevels · l.453 |
| «Educación Básica» | h4 |  | renderGradeLevels · l.474 |
| «Educación Media» | h4 |  | renderGradeLevels · l.495 |
| «{q.question_text}» | h3 |  | renderCoursesPerLevel · l.524 |
| «{q.question_text}» | h3 |  | renderImplementationYear · l.562 |
| «{q.question_text}» | h3 |  | renderProgramaInicia · l.620 |
| «{q.question_text}» | h3 |  | renderPeriodSystem · l.705 |
| «Acceso Denegado» | h1 | `hasPermission === false \|\| !schoolId` | TransversalContextEdit · l.946 |

**Buttons** (14)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{GRADE_LEVEL_LABELS[level]}» | `{() => toggleGradeLevel(level)}` | `each GRADE_LEVEL_CATEGORIES.preescolar` |  |  | renderGradeLevels · l.456 |
| «{GRADE_LEVEL_LABELS[level]}» | `{() => toggleGradeLevel(level)}` | `each GRADE_LEVEL_CATEGORIES.basica` |  |  | renderGradeLevels · l.477 |
| «{GRADE_LEVEL_LABELS[level]}» | `{() => toggleGradeLevel(level)}` | `each GRADE_LEVEL_CATEGORIES.media` |  |  | renderGradeLevels · l.498 |
| «Año {year}» | `{() => setFormData(prev => ({ ...prev, implementation_year_2026: year as 1 \| 2 \|…}` | `each [1, 2, 3, 4, 5]` |  |  | renderImplementationYear · l.571 |
| «Sí» | `{() => setFormData(prev => ({ ...prev, programa_inicia_completed: true }))}` |  |  |  | renderProgramaInicia · l.628 |
| «No» | `{() => setFormData(prev => ({ ...prev, programa_inicia_completed: false, program…}` |  |  |  | renderProgramaInicia · l.639 |
| «{hours} horas» | `{() => setFormData(prev => ({ ...prev, programa_inicia_hours: hours }))}` | `formData.programa_inicia_completed && each ([20, 40, 80] as const)` |  |  | renderProgramaInicia · l.665 |
| «Semestral 2 períodos por año» | `{() => setFormData(prev => ({ ...prev, period_system: 'semestral' }))}` |  |  |  | renderPeriodSystem · l.713 |
| «Trimestral 3 períodos por año» | `{() => setFormData(prev => ({ ...prev, period_system: 'trimestral' }))}` |  |  |  | renderPeriodSystem · l.725 |
| «{n}» | `{() => updateCustomResponse(q.id, n)}` | `q.question_type === 'scale' && each [1, 2, 3, 4, 5]` |  |  | renderGenericQuestion · l.799 |
| «Sí» | `{() => updateCustomResponse(q.id, true)}` | `q.question_type === 'boolean'` |  |  | renderGenericQuestion · l.817 |
| «No» | `{() => updateCustomResponse(q.id, false)}` | `q.question_type === 'boolean'` |  |  | renderGenericQuestion · l.828 |
| «{opt}» | `{() => { const current = Array.isArray(customResponses[q.id]) ? (customResponses…}` | `q.question_type === 'multiselect' && (each (q.options \|\| []))` |  |  | renderGenericQuestion · l.864 |
| «&#9696; Guardando... / Guardar» (submits the form) |  |  | `{saving}` | `testid=context-submit` | TransversalContextEdit · l.1039 |

**Links** (6)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ir al Panel» | `/dashboard` | `hasPermission === false \|\| !schoolId` |  | TransversalContextEdit · l.950 |
| «Ir al Panel» |  | `hasPermission === false \|\| !schoolId` |  | TransversalContextEdit · l.951 |
| «Volver al dashboard» | `/school/transversal-context?school_id=[*]` |  |  | TransversalContextEdit · l.979 |
| «Volver al dashboard» |  |  |  | TransversalContextEdit · l.983 |
| «Cancelar» | `/school/transversal-context?school_id=[*]` |  |  | TransversalContextEdit · l.1031 |
| «Cancelar» |  |  |  | TransversalContextEdit · l.1035 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Ej: 500» | number | «Ej: 500» · `min={1}` |  |  |  | renderTotalStudents · l.423 |
|  | number | `min={1} max={10}` |  | `each [...formData.grade_levels] .sort((a, b) => { cons…` |  | renderCoursesPerLevel · l.542 |
| «Año en que se completó» | number | «Ej: 2024» · `min={2015} max={2030}` |  | `formData.programa_inicia_completed` |  | renderProgramaInicia · l.685 |
| «{q.question_text} [*]» | text | «{q.placeholder \|\| ''}» |  | `q.question_type === 'text'` |  | renderGenericQuestion · l.761 |
| «{q.question_text} [*]» | textarea | «{q.placeholder \|\| ''}» |  | `q.question_type === 'textarea'` |  | renderGenericQuestion · l.773 |
| «{q.question_text} [*]» | number | «{q.placeholder \|\| ''}» |  | `q.question_type === 'number'` |  | renderGenericQuestion · l.785 |
| «{q.question_text} [*]» | select |  | «{q.placeholder} / -- Seleccionar --», «(lista) {opt}» | `q.question_type === 'select'` |  | renderGenericQuestion · l.843 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | TransversalContextEdit · l.989 |

**Toasts** (9)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar las preguntas del cuestionario» |  | TransversalContextEdit · l.220 |
| error | «No se guardó el contexto: revise los cursos bloqueados» | `!response.ok && response.status === 409 && data.code === 'courses_have_dependencies'` | handleSubmit · l.339 |
| error | «{msg}» | `!response.ok && response.status === 409 && data.code === 'context_already_exists'` | handleSubmit · l.345 |
| success | «Contexto guardado exitosamente» |  | handleSubmit · l.352 |
| plain | «{data.warning}» | `data.warning` | handleSubmit · l.358 |
| success | «{parts.join(', ')}» | `data.coursesGenerated !== undefined` | handleSubmit · l.363 |
| error | «Error al guardar respuestas personalizadas. Intente de nuevo.» | `filteredResponses.length > 0 && !customRes.ok` | handleSubmit · l.385 |
| error | «Error al guardar respuestas personalizadas. Intente de nuevo.» | `filteredResponses.length > 0` | handleSubmit · l.390 |
| error | «Error al guardar el contexto» |  | handleSubmit · l.400 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al guardar» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmit · l.348 |
| «{data.coursesDeleted} cursos eliminados» | `parts.push` | `data.coursesGenerated !== undefined && data.coursesDeleted` | handleSubmit · l.362 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.84 |
| `/school/transversal-context?school_id=[*]` | `router.push` | `customSaveOk` | handleSubmit · l.396 |
| `/login` | `router.push` |  | handleLogout · l.408 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `isAdmin = roles.some(r => r.role_type === 'admin')` | checkAuth · l.113 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `hasPermission === false \|\| !schoolId` |  | TransversalContextEdit · l.935 |
| `MainLayout` |  |  |  | TransversalContextEdit · l.962 |
| `ResponsiveFunctionalPageHeader` | title: Cuestionario Transversal · subtitle: Mi Escuela |  |  | TransversalContextEdit · l.971 |
| `ChangeHistorySection` | feature: transversal_context |  |  | TransversalContextEdit · l.1061 |
| `ChangeHistorySection` | feature: context_responses |  |  | TransversalContextEdit · l.1066 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `parts` | «{data.coursesGenerated} cursos generados» | handleSubmit · l.361 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Ingrese el número total de estudiantes» | TransversalContextEdit · l.279 |
| «Seleccione al menos un nivel» | TransversalContextEdit · l.284 |
| «Seleccione el año de implementación» | TransversalContextEdit · l.289 |
| «Seleccione el sistema de períodos» | TransversalContextEdit · l.294 |
| «Este campo es obligatorio» | TransversalContextEdit · l.300 |
| «La nueva configuración eliminaría cursos con docentes o registros asociados.» | TransversalContextEdit · l.336 |
| «Esta escuela ya tiene un contexto transversal guardado. Recargue la página para editarlo.» | TransversalContextEdit · l.343 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| role | `role=alert` | renderImplementationYear · l.598 |
| mark | `testid=context-year-change-warning` | renderImplementationYear · l.598 |
| role | `role=alert` | TransversalContextEdit · l.994 |
| mark | `testid=context-blocked-courses` | TransversalContextEdit · l.994 |
| role | `role=alert` | TransversalContextEdit · l.1024 |
| mark | `testid=context-save-error` | TransversalContextEdit · l.1024 |
| address value | `?school_id` | l.1 |

**Values shown from data** (15)

- `{q.help_text}` — renderTotalStudents · l.421, when `q.help_text`
- `{errors.total_students}` — renderTotalStudents · l.437, when `errors.total_students`
- `{q.help_text}` — renderGradeLevels · l.448, when `q.help_text`
- `{errors.grade_levels}` — renderGradeLevels · l.515, when `errors.grade_levels`
- `{q.help_text}` — renderCoursesPerLevel · l.528, when `q.help_text`
- `{GRADE_LEVEL_LABELS[level]}` — renderCoursesPerLevel · l.539, when `each [...formData.grade_levels] .sort((a, b) => { cons…`
- `{q.help_text}` — renderImplementationYear · l.566, when `q.help_text`
- `{errors.implementation_year_2026}` — renderImplementationYear · l.613, when `errors.implementation_year_2026`
- `{q.help_text}` — renderProgramaInicia · l.624, when `q.help_text`
- `{q.help_text}` — renderPeriodSystem · l.709, when `q.help_text`
- `{errors.period_system}` — renderPeriodSystem · l.740, when `errors.period_system`
- `{errors[errorKey]}` — renderGenericQuestion · l.890, when `errors[errorKey]`
- `{blockedSave.message}` — TransversalContextEdit · l.1000, when `blockedSave`
- `{c.course_name}` — TransversalContextEdit · l.1005, when `blockedSave && blockedSave.courses.length > 0 && each blockedSave.courses`
- `{saveError}` — TransversalContextEdit · l.1024, when `saveError`

**Other texts on screen** (14)

- «curso / cursos» — renderCoursesPerLevel · l.550, when `each [...formData.grade_levels] .sort((a, b) => { cons…`
- «El año de implementación determina el nivel de madurez esperado para los registros. Año 1 = Incipiente, Año 5 = Consolidado.» — renderImplementationYear · l.592
- «Está cambiando el año de implementación de {savedYear} a {formData.implementation_year_2026} . Los registros ya creados conservan el año con el que fueron generados: no se reescriben ni se recalculan automáticamente. Si necesita actualizar…» — renderImplementationYear · l.604, when `savedYear !== null && formData.implementation_year_2026 !== savedYear`
- «Horas completadas» (label) — renderProgramaInicia · l.660, when `formData.programa_inicia_completed`
- «Año en que se completó» (label) — renderProgramaInicia · l.682, when `formData.programa_inicia_completed`
- «{q.question_text} [*]» (label) — renderGenericQuestion · l.749
- «Cargando...» — TransversalContextEdit · l.927, when `loading \|\| hasPermission === null`
- «No tiene permiso para editar el contexto transversal.» — TransversalContextEdit · l.948, when `hasPermission === false \|\| !schoolId`
- «No se guardó el contexto» — TransversalContextEdit · l.999, when `blockedSave`
- «docente asignado / docentes asignados» — TransversalContextEdit · l.1007, when `blockedSave && blockedSave.courses.length > 0 && each blockedSave.courses`
- «({c.inactiveAssignments} en el historial)» — TransversalContextEdit · l.1008, when `blockedSave && blockedSave.courses.length > 0 && each blockedSave.courses`
- «registro activo / registros activos» — TransversalContextEdit · l.1010, when `blockedSave && blockedSave.courses.length > 0 && each blockedSave.courses`
- «({c.archivedInstances} archivado{c.archivedInstances === 1 ?…})» — TransversalContextEdit · l.1011, when `blockedSave && blockedSave.courses.length > 0 && each blockedSave.courses`
- «El historial de asignaciones y registros (incluido el archivado) se conserva y no puede eliminarse desde aquí. Mantenga los niveles y cantidades actuales o solicite una resolución administrativa.» — TransversalContextEdit · l.1017, when `blockedSave`

**Reads and writes the database directly:** `table:profiles` (select), `table:schools` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/school/ChangeHistorySection.tsx`
- `lib/constants/transversal-context.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/school/change-history` | GET | `components/school/ChangeHistorySection.tsx:87` |
| `/api/school/transversal-context` | GET, POST | `pages/school/transversal-context/edit.tsx:166`, `pages/school/transversal-context/edit.tsx:322` |
| `/api/school/transversal-context/custom-responses` | GET, POST | `pages/school/transversal-context/edit.tsx:208`, `pages/school/transversal-context/edit.tsx:376` |
| `/api/school/transversal-context/questions` | GET | `pages/school/transversal-context/edit.tsx:200` |

## /school/transversal-context

File `pages/school/transversal-context/index.tsx` · 1633 lines · frame: MainLayout

### Who reaches it

- Menu: Gestor de Cambio › «Contexto Transversal» → `/school/transversal-context` — roles: admin, consultor, equipo_directivo; the group: everyone signed in (`Sidebar.tsx` l.284)
- Menu: Vías de Transformación › «Contexto Transversal» → `/school/transversal-context` — everyone signed in; the group: admin only (`Sidebar.tsx` l.341)
- Middleware: signed-in only; with ?school_id= an equipo directivo only passes for its own school. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.179 `router.push → /login  (when !session?.user)`
  - l.209 `isAdmin = roles.some(r => r.role_type === 'admin')`
  - l.236 `router.push → /dashboard  (when (!(isAdmin \|\| isConsultor)) && directivoRole?.school_id && parsedQuerySchoolId !== null && parsedQuerySchoolId !== effectiveSchoolId)`
  - l.428 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:286`, `components/layout/Sidebar.tsx:343`, `middleware.ts:272`, `pages/admin/context-questions/overview.tsx:414`, `pages/admin/context-questions/overview.tsx:415`, `pages/school/migration-plan/index.tsx:533`, `pages/school/migration-plan/index.tsx:639`, `pages/school/migration-plan/index.tsx:640`, `pages/school/transversal-context/edit.tsx:1031`, `pages/school/transversal-context/edit.tsx:1032`, `pages/school/transversal-context/edit.tsx:396`, `pages/school/transversal-context/edit.tsx:979` and 1 more
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/proc-pilot-journey.spec.ts`; unit tests of the page: `__tests__/pages/school/transversal-context-assign.test.tsx`, `__tests__/pages/school/transversal-context-late-answer.test.tsx`, `__tests__/pages/school/transversal-context-replace.test.tsx`.
- QA scenarios that name this address: admin 3, community_manager 1, consultor 2, equipo_directivo 2.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | yes | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### What the page file itself draws

**Titles** (14)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `hasPermission === false` | TransversalContextDashboard · l.694 |
| «Selecciona una escuela» | h3 | `!schoolId` | TransversalContextDashboard · l.738 |
| «{q.question_text}» | h3 | `context && each allQuestions && widgetType === 'total_students'` | TransversalContextDashboard · l.963 |
| «{q.question_text} ( {sortedGradeLevels.length} seleccionados)» | h3 | `context && each allQuestions && widgetType === 'grade_levels'` | TransversalContextDashboard · l.984 |
| «{q.question_text}» | h3 | `context && each allQuestions && widgetType === 'courses_per_level'` | TransversalContextDashboard · l.1018 |
| «{q.question_text}» | h3 | `context && each allQuestions && widgetType === 'implementation_year'` | TransversalContextDashboard · l.1051 |
| «{q.question_text}» | h3 | `context && each allQuestions && widgetType === 'period_system'` | TransversalContextDashboard · l.1079 |
| «{q.question_text}» | h3 | `context && each allQuestions && widgetType === 'programa_inicia'` | TransversalContextDashboard · l.1104 |
| «{q.question_text}» | h3 | `context && each allQuestions && widgetType === 'generic'` | TransversalContextDashboard · l.1134 |
| «Estructura de Cursos» | h3 | `courseStructure.length > 0` | TransversalContextDashboard · l.1218 |
| «{GRADE_LEVEL_LABELS[gradeLevel as Gr…} / {gradeLevel}» | h4 | `courseStructure.length > 0 && each Object.entries(coursesByGrade)` | TransversalContextDashboard · l.1227 |
| «Escuela sin configurar / Configure su escuela» | h3 | `!context` | TransversalContextDashboard · l.1373 |
| «Asignar Docente» | h3 | `assignModalOpen` | TransversalContextDashboard · l.1403 |
| «Cambiar Docente» | h3 | `replaceModalOpen` | TransversalContextDashboard · l.1516 |

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Selección de Escuelas» | `{async () => { setSchoolId(null); setSchoolName(''); setContext(null); setCourse…}` | `canSelectSchool` |  |  | TransversalContextDashboard · l.819 |
| «[icon X]» · tooltip «Cerrar» | `{() => setAssignmentNotice(null)}` | `assignmentNotice` |  | `testid=assign-docente-warnings-dismiss` | TransversalContextDashboard · l.1178 |
| «[icon X]» · tooltip «Cerrar» | `{() => setReplacementNotice(null)}` | `replacementNotice` |  | `testid=replace-docente-success-dismiss` | TransversalContextDashboard · l.1202 |
| «Asignar» | `{() => openAssignModal(course)}` | `courseStructure.length > 0 && each Object.entries(coursesByGrade) && each courses && canOfferAssign` |  | `testid=open-assign-docente-{course.id}` | TransversalContextDashboard · l.1267 |
| «Cambiar docente» | `{() => openReplaceModal(course)}` | `each Object.entries(coursesByGrade) && each courses && isLocked && canReplaceDocente` |  | `testid=open-replace-docente-{course.id}` | TransversalContextDashboard · l.1306 |
| «[icon X]» | `{closeAssignModal}` | `assignModalOpen` |  | `testid=assign-docente-close` | TransversalContextDashboard · l.1406 |
| «Cancelar» | `{closeAssignModal}` | `assignModalOpen` |  | `testid=assign-docente-cancel` | TransversalContextDashboard · l.1481 |
| «Asignando... / Asignar» | `{handleAssignDocente}` | `assignModalOpen` | `{!selectedDocente \|\| assigning}` | `testid=assign-docente-submit` | TransversalContextDashboard · l.1488 |
| «[icon X]» | `{closeReplaceModal}` | `replaceModalOpen` |  | `testid=replace-docente-close` | TransversalContextDashboard · l.1519 |
| «Cancelar» | `{closeReplaceModal}` | `replaceModalOpen` |  | `testid=replace-docente-cancel` | TransversalContextDashboard · l.1599 |
| «Cambiando... / Cambiar docente» | `{handleReplaceDocente}` | `replaceModalOpen` | `{!selectedReplacement \|\| replacing}` | `testid=replace-docente-submit` | TransversalContextDashboard · l.1606 |

**Links** (8)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ir al Panel» | `/dashboard` | `hasPermission === false` |  | TransversalContextDashboard · l.700 |
| «Ir al Panel» |  | `hasPermission === false` |  | TransversalContextDashboard · l.701 |
| «Editar / Completar» | `/school/transversal-context/edit[*]` | `!isReadOnlyViewer` |  | TransversalContextDashboard · l.894 |
| «Editar / Completar» |  | `!isReadOnlyViewer` |  | TransversalContextDashboard · l.898 |
| «Ver Plan de Migración» | `/school/migration-plan[*]` | `context` |  | TransversalContextDashboard · l.935 |
| «Ver Plan de Migración» |  | `context` |  | TransversalContextDashboard · l.939 |
| «Completar Cuestionario» | `/school/transversal-context/edit[*]` | `!context && !isReadOnlyViewer` |  | TransversalContextDashboard · l.1384 |
| «Completar Cuestionario» |  | `!context && !isReadOnlyViewer` |  | TransversalContextDashboard · l.1388 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «-- Seleccionar escuela --», «(lista) {school.name}» | `!schoolId && !(loadingSchools) && schools.length > 0` |  | TransversalContextDashboard · l.753 |
| «Seleccionar Docente» | select |  | «-- Seleccionar --», «(lista) {displayName} — {roleLabels} / {displayName}» | `assignModalOpen && !(loadingDocentes) && !(availableDocentes.length === 0)` | `testid=assign-docente-select` | TransversalContextDashboard · l.1439 |
| «Nuevo docente» | select |  | «-- Seleccionar --», «(lista) {displayName} — {roleLabels} / {displayName}» | `replaceModalOpen && !(loadingReplaceCandidates) && !(replaceCandidates.length === 0)` | `testid=replace-docente-select` | TransversalContextDashboard · l.1560 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Asignar Docente» | written in this file | `assignModalOpen` |  | TransversalContextDashboard · l.1400 |
| «Cambiar Docente» | written in this file | `replaceModalOpen` |  | TransversalContextDashboard · l.1513 |

**Toasts** (10)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar el contexto» |  | TransversalContextDashboard · l.349 |
| error | «Error al cargar docentes» |  | openAssignModal · l.469 |
| error | «{message}» | `!response.ok \|\| data.success !== true` | handleAssignDocente · l.527 |
| plain | «{message} Hay advertencias que revisar.» | `warnings.length > 0` | handleAssignDocente · l.540 |
| success | «{message}» | `!(warnings.length > 0)` | handleAssignDocente · l.543 |
| error | «{message}» |  | handleAssignDocente · l.552 |
| error | «Error al cargar docentes» |  | openReplaceModal · l.594 |
| error | «{message}» | `!response.ok \|\| data.success !== true` | handleReplaceDocente · l.636 |
| success | «{message}» |  | handleReplaceDocente · l.645 |
| error | «{message}» |  | handleReplaceDocente · l.652 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar el contexto» | `throw (shown by whoever catches it)` | `!response.ok` | TransversalContextDashboard · l.337 |
| «Error al cargar docentes» | `throw (shown by whoever catches it)` | `!response.ok` | openAssignModal · l.451 |
| «Error al cargar docentes» | `throw (shown by whoever catches it)` | `!response.ok` | openReplaceModal · l.585 |

**Moves to another page from code** (5)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.179 |
| `/dashboard` | `router.push` | `(!(isAdmin \|\| isConsultor)) && directivoRole?.school_id && parsedQuerySchoolId !== null && parsedQuerySchoolId !== effectiveSchoolId` | checkAuth · l.236 |
| `/login` | `router.push` |  | handleLogout · l.428 |
| `/school/transversal-context?school_id=[*]` | `router.push` | `selectedId` | handleSchoolSelect · l.716 |
| `/school/transversal-context` | `router.push` | `canSelectSchool` | TransversalContextDashboard · l.837 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `isAdmin = roles.some(r => r.role_type === 'admin')` | checkAuth · l.209 |

**Draws nothing when** (6)

| Condition | Where |
|---|---|
| `!isCurrent()` | TransversalContextDashboard · l.343 |
| `!isCurrent()` | TransversalContextDashboard · l.347 |
| `!schoolId \|\| !hasPermission` | TransversalContextDashboard · l.366 |
| `previousSchoolId === null \|\| previousSchoolId === schoolId` | TransversalContextDashboard · l.410 |
| `!context.courses_per_level \|\| Object.keys(context.courses_per_level).length === 0` | TransversalContextDashboard · l.1008 |
| `isReadOnlyViewer` | TransversalContextDashboard · l.1124 |

**Pieces placed here, with the texts and settings handed to them** (10)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `hasPermission === false` |  | TransversalContextDashboard · l.683 |
| `MainLayout` |  | `!schoolId` |  | TransversalContextDashboard · l.721 |
| `ResponsiveFunctionalPageHeader` | title: Contexto Transversal · subtitle: Selecciona una escuela | `!schoolId` |  | TransversalContextDashboard · l.730 |
| `MainLayout` |  |  |  | TransversalContextDashboard · l.801 |
| `ResponsiveFunctionalPageHeader` | title: Contexto Transversal · subtitle: Mi Escuela |  |  | TransversalContextDashboard · l.810 |
| `CompletionStatusBadge` |  | `schoolId && Object.keys(completionStatus).length > 0` |  | TransversalContextDashboard · l.911 |
| `CompletionStatusBadge` |  | `schoolId && Object.keys(completionStatus).length > 0` |  | TransversalContextDashboard · l.921 |
| `ViaResponsiblesSection` |  | `context && schoolId` |  | TransversalContextDashboard · l.1343 |
| `ChangeHistorySection` | feature: transversal_context | `context && schoolId && !isReadOnlyViewer` |  | TransversalContextDashboard · l.1350 |
| `ChangeHistorySection` | feature: context_responses | `context && schoolId && !isReadOnlyViewer` |  | TransversalContextDashboard · l.1356 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `DOCENTE_ROLE_BADGE_LABELS` | «Docente», «Admin», «Consultor», «Directivo», «Líder generación», «Líder comunidad» | l.42 |

**Other texts written in the code (safety net: not tied to an element by the script)** (8)

| Text | Where |
|---|---|
| «No se pudo completar la asignación del docente» | TransversalContextDashboard · l.524 |
| «Docente asignado correctamente» | TransversalContextDashboard · l.537 |
| «Error al asignar docente» | TransversalContextDashboard · l.550 |
| «Docente cambiado correctamente» | TransversalContextDashboard · l.643 |
| «Error al cambiar docente» | TransversalContextDashboard · l.650 |
| «Complete el cuestionario transversal para configurar su escuela» | TransversalContextDashboard · l.887 |
| «El equipo directivo de esta escuela aún no ha completado el cuestionario transversal. Como administrador puede completarlo ahora.» | TransversalContextDashboard · l.1380 |
| «Complete el cuestionario transversal para configurar los datos de su escuela y habilitar los registros de transformación.» | TransversalContextDashboard · l.1381 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (19)

| Kind | What | Where |
|---|---|---|
| mark | `testid=access-denied` | TransversalContextDashboard · l.693 |
| mark | `testid=school-picker-hint` | TransversalContextDashboard · l.741 |
| role | `role=status` | TransversalContextDashboard · l.848 |
| mark | `testid=consultor-read-only-notice` | TransversalContextDashboard · l.848 |
| role | `role=status` | TransversalContextDashboard · l.1161 |
| mark | `testid=assign-docente-warnings` | TransversalContextDashboard · l.1161 |
| role | `role=status` | TransversalContextDashboard · l.1192 |
| mark | `testid=replace-docente-success` | TransversalContextDashboard · l.1192 |
| mark | `testid=course-card-{course.id}` | TransversalContextDashboard · l.1248 |
| mark | `testid=course-active-assignment-{assignment.id}` | TransversalContextDashboard · l.1282 |
| mark | `testid=course-assignment-locked-{course.id}` | TransversalContextDashboard · l.1297 |
| role | `role=alert` | TransversalContextDashboard · l.1319 |
| mark | `testid=course-assignment-integrity-warning-{course.id}` | TransversalContextDashboard · l.1319 |
| role | `role=alert` | TransversalContextDashboard · l.1462 |
| mark | `testid=assign-docente-error` | TransversalContextDashboard · l.1462 |
| mark | `testid=replace-docente-current` | TransversalContextDashboard · l.1532 |
| role | `role=alert` | TransversalContextDashboard · l.1583 |
| mark | `testid=replace-docente-error` | TransversalContextDashboard · l.1583 |
| address value | `?school_id` | l.1 |

**Values shown from data** (14)

- `{GRADE_LEVEL_LABELS[level as GradeLe…} / {level}` — TransversalContextDashboard · l.989, when `context && each allQuestions && widgetType === 'grade_levels' && each sortedGradeLevels`
- `{GRADE_LEVEL_LABELS[level as GradeLe…} / {level}` — TransversalContextDashboard · l.1026, when `context && each allQuestions && widgetType === 'courses_per_level' && each sortedGradeLevels`
- `{count}` — TransversalContextDashboard · l.1029, when `context && each allQuestions && widgetType === 'courses_per_level' && each sortedGradeLevels`
- `{assignmentNotice.message}` — TransversalContextDashboard · l.1171, when `assignmentNotice`
- `{w}` — TransversalContextDashboard · l.1174, when `assignmentNotice && each assignmentNotice.warnings`
- `{replacementNotice.message}` — TransversalContextDashboard · l.1200, when `replacementNotice`
- `{course.course_name}` — TransversalContextDashboard · l.1261, when `courseStructure.length > 0 && each Object.entries(coursesByGrade) && each courses`
- `{assignment.profiles?.name} / {assignment.docente_id}` — TransversalContextDashboard · l.1287, when `each Object.entries(coursesByGrade) && each courses && activeCount > 0 && each activeAssignments`
- `{selectedCourse?.course_name}` — TransversalContextDashboard · l.1417, when `assignModalOpen`
- `{assignError}` — TransversalContextDashboard · l.1468, when `assignModalOpen && assignError`
- `{w}` — TransversalContextDashboard · l.1472, when `assignModalOpen && assignError && assignErrorWarnings.length > 0 && each assignErrorWarnings`
- `{replaceCourse?.course_name}` — TransversalContextDashboard · l.1530, when `replaceModalOpen`
- `{currentDocenteOf(replaceCourse)?.pr…} / {currentDocenteOf(replaceCourse)?.do…} / —` — TransversalContextDashboard · l.1534, when `replaceModalOpen`
- `{replaceError.message}` — TransversalContextDashboard · l.1593, when `replaceModalOpen && replaceError`

**Other texts on screen** (39)

- «Solo directivos, consultores y administradores pueden acceder al contexto transversal.» — TransversalContextDashboard · l.698, when `hasPermission === false`
- «Como administrador, selecciona una escuela para ver su contexto transversal. / Como consultor, selecciona una escuela para consultar su contexto transversal en modo solo lectura.» — TransversalContextDashboard · l.741, when `!schoolId`
- «No hay escuelas disponibles» — TransversalContextDashboard · l.767, when `!schoolId && !(loadingSchools) && !(schools.length > 0)`
- «Vista de solo lectura» — TransversalContextDashboard · l.853, when `isReadOnlyViewer`
- «Como consultor puede consultar el contexto transversal de cualquier escuela registrada, pero no puede editarlo ni asignar o cambiar docentes.» — TransversalContextDashboard · l.855, when `isReadOnlyViewer`
- «Contexto Estructural» — TransversalContextDashboard · l.871, when `hasCompleteContext`
- «Última actualización: {new Date(context.updated_at).toLoca…}» — TransversalContextDashboard · l.872, when `hasCompleteContext`
- «Cuestionario pendiente» — TransversalContextDashboard · l.881, when `!(hasCompleteContext)`
- «El equipo directivo de esta escuela aún no ha completado el cuestionario transversal / El equipo directivo debe completar el cuestionario transversal; como administrador también puede completarlo / Complete el cuestionario transversal para…» — TransversalContextDashboard · l.882, when `!(hasCompleteContext)`
- «Contexto Estructural» — TransversalContextDashboard · l.910, when `schoolId && Object.keys(completionStatus).length > 0`
- «Preguntas de Contexto» — TransversalContextDashboard · l.920, when `schoolId && Object.keys(completionStatus).length > 0`
- «{context.total_students?.toLocaleStr…} / No especificado» — TransversalContextDashboard · l.966, when `context && each allQuestions && widgetType === 'total_students'`
- «No hay niveles seleccionados» — TransversalContextDashboard · l.997, when `context && each allQuestions && widgetType === 'grade_levels' && sortedGradeLevels.length === 0`
- «Año {context.implementation_year_2026} / No especificado» — TransversalContextDashboard · l.1054, when `context && each allQuestions && widgetType === 'implementation_year'`
- «[Incipiente - Primer año de transformación] [En Desarrollo - Segundo año de transformación] [Avanzado - Tercer año de transformación] [Consolidando - Cuarto año de transformación] [Consolidado - Quinto año de transformación]» — TransversalContextDashboard · l.1057, when `context && each allQuestions && widgetType === 'implementation_year'`
- «{context.period_system} / No especificado» — TransversalContextDashboard · l.1082, when `context && each allQuestions && widgetType === 'period_system'`
- «[2 períodos por año académico] [3 períodos por año académico]» — TransversalContextDashboard · l.1085, when `context && each allQuestions && widgetType === 'period_system'`
- «Sí / No» — TransversalContextDashboard · l.1107, when `context && each allQuestions && widgetType === 'programa_inicia'`
- «{context.programa_inicia_hours} horas/año» — TransversalContextDashboard · l.1111, when `context && each allQuestions && widgetType === 'programa_inicia' && context.programa_inicia_completed && context.programa_inicia_hours`
- «Sí / No» — TransversalContextDashboard · l.1138, when `context && each allQuestions && widgetType === 'generic'`
- «Sin respuesta» — TransversalContextDashboard · l.1139, when `context && each allQuestions && widgetType === 'generic' && (value === undefined \|\| value === null \|\| value === '')`
- «Docente asignado con advertencias: {assignmentNotice.courseName}» — TransversalContextDashboard · l.1168, when `assignmentNotice`
- «Docente cambiado: {replacementNotice.courseName}» — TransversalContextDashboard · l.1199, when `replacementNotice`
- «{courseStructure.length} cursos configurados» — TransversalContextDashboard · l.1219, when `courseStructure.length > 0`
- «Este curso ya tiene un docente asignado. Mientras el registro no haya comenzado, el equipo directivo puede cambiar el docente con «Cambiar docente»; si ya comenzó, se requiere una resolución administrativa controlada. No es posible desasignar desde esta página.» — TransversalContextDashboard · l.1301, when `courseStructure.length > 0 && each Object.entries(coursesByGrade) && each courses && isLocked`
- «Estado de asignación inválido» — TransversalContextDashboard · l.1324, when `courseStructure.length > 0 && each Object.entries(coursesByGrade) && each courses && hasIntegrityConflict`
- «Este curso registra {activeCount} docentes activos y solo debe tener uno. No es posible asignar ni desasignar desde esta página: solicite una resolución administrativa controlada para corregir la asignación de este curso.» — TransversalContextDashboard · l.1325, when `courseStructure.length > 0 && each Object.entries(coursesByGrade) && each courses && hasIntegrityConflict`
- «El equipo directivo de esta escuela aún no ha completado el cuestionario transversal. No hay contexto que consultar por ahora. / El equipo directivo de esta escuela aún no ha completado el cuestionario transversal. Como administrador puede…» — TransversalContextDashboard · l.1376, when `!context`
- «Asignar docente al curso» — TransversalContextDashboard · l.1417, when `assignModalOpen`
- «No hay docentes disponibles para asignar» — TransversalContextDashboard · l.1428, when `assignModalOpen && !(loadingDocentes) && availableDocentes.length === 0`
- «Todos los docentes ya están asignados o no hay docentes en esta escuela» — TransversalContextDashboard · l.1431, when `assignModalOpen && !(loadingDocentes) && availableDocentes.length === 0`
- «Seleccionar Docente» (label) — TransversalContextDashboard · l.1436, when `assignModalOpen && !(loadingDocentes) && !(availableDocentes.length === 0)`
- «No se pudo completar la asignación» — TransversalContextDashboard · l.1467, when `assignModalOpen && assignError`
- «Curso» — TransversalContextDashboard · l.1530, when `replaceModalOpen`
- «Docente actual:» — TransversalContextDashboard · l.1533, when `replaceModalOpen`
- «El cambio solo es posible mientras el registro del curso no haya comenzado y no registre respuestas. El docente anterior pierde el acceso a los registros pendientes y el nuevo docente los recibe en blanco: las respuestas nunca se transfieren.» — TransversalContextDashboard · l.1539, when `replaceModalOpen`
- «No hay otros docentes disponibles en esta escuela» — TransversalContextDashboard · l.1552, when `replaceModalOpen && !(loadingReplaceCandidates) && replaceCandidates.length === 0`
- «Nuevo docente» (label) — TransversalContextDashboard · l.1557, when `replaceModalOpen && !(loadingReplaceCandidates) && !(replaceCandidates.length === 0)`
- «El registro ya comenzó / No se pudo cambiar el docente» — TransversalContextDashboard · l.1588, when `replaceModalOpen && replaceError`

**Reads and writes the database directly:** `table:profiles` (select), `table:schools` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/school/ChangeHistorySection.tsx`
- `components/school/CompletionStatusBadge.tsx`
- `components/school/ViaResponsiblesSection.tsx`
- `lib/constants/transversal-context.ts`
- `types/assessment-builder.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/school/change-history` | GET | `components/school/ChangeHistorySection.tsx:87` |
| `/api/school/completion-status` | GET | `pages/school/transversal-context/index.tsx:382` |
| `/api/school/transversal-context` | GET | `pages/school/transversal-context/index.tsx:335` |
| `/api/school/transversal-context/assign-docente` | POST | `pages/school/transversal-context/index.tsx:501` |
| `/api/school/transversal-context/custom-responses` | GET | `pages/school/transversal-context/index.tsx:381` |
| `/api/school/transversal-context/docentes` | GET | `pages/school/transversal-context/index.tsx:444`, `pages/school/transversal-context/index.tsx:579` |
| `/api/school/transversal-context/questions` | GET | `pages/school/transversal-context/index.tsx:371` |
| `/api/school/transversal-context/replace-docente` | POST | `pages/school/transversal-context/index.tsx:617` |
| `/api/school/transversal-context/schools` | GET | `pages/school/transversal-context/index.tsx:292`, `pages/school/transversal-context/index.tsx:827` |
| `/api/school/transversal-context/via-responsibles` | GET, POST | `components/school/ViaResponsiblesSection.tsx:111`, `components/school/ViaResponsiblesSection.tsx:84` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/assessment/IndicatorInput.tsx

Used by: `/demo/assessments/[templateId]`, `/docente/assessments/[instanceId]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{indicator.name}» | h4 |  | IndicatorInput · l.52 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CoberturaInput` |  | `indicator.category === 'cobertura'` |  | IndicatorInput · l.61 |
| `FrecuenciaInput` |  | `indicator.category === 'frecuencia'` |  | IndicatorInput · l.70 |
| `ProfundidadInput` |  | `indicator.category === 'profundidad'` |  | IndicatorInput · l.86 |
| `TraspasoInput` |  | `indicator.category === 'traspaso'` |  | IndicatorInput · l.101 |
| `DetalleInput` |  | `indicator.category === 'detalle'` |  | IndicatorInput · l.110 |

**Values shown from data** (3)

- `{indicator.code}` — IndicatorInput · l.44, when `indicator.code`
- `{CATEGORY_LABELS[indicator.category]}` — IndicatorInput · l.48
- `{indicator.description}` — IndicatorInput · l.54, when `indicator.description`

### components/assessment/ModuleCard.tsx

Used by: `/demo/assessments/[templateId]`, `/docente/assessments/[instanceId]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{module.name}» | h3 |  | ModuleCard · l.52 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{module.name} [No implementada] [{module.description}] {activeIndicators.length} indicador es» · aria «{`${expanded ? 'Contraer' : 'Expandir'} ${module.name}`}» | `{onToggle}` |  |  |  | ModuleCard · l.44 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `IndicatorInput` |  | `expanded && each visibleIndicators` |  | ModuleCard · l.84 |

**Values shown from data** (1)

- `{module.instructions}` — ModuleCard · l.75, when `expanded && module.instructions`

**Other texts on screen** (1)

- «Esta práctica no se implementa en este establecimiento» — ModuleCard · l.94, when `expanded && showGateMessage`

### components/assessment/inputs/CoberturaInput.tsx

Used by: `/demo/assessments/[templateId]`, `/docente/assessments/[instanceId]`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Sí» · aria «{indicatorName ? `Sí: ${indicatorName}` : 'Sí'}» | `{() => onChange(true)}` |  | `{disabled}` |  | CoberturaInput · l.12 |
| «No» · aria «{indicatorName ? `No: ${indicatorName}` : 'No'}» | `{() => onChange(false)}` |  | `{disabled}` |  | CoberturaInput · l.25 |

### components/assessment/inputs/DetalleInput.tsx

Used by: `/demo/assessments/[templateId]`, `/docente/assessments/[instanceId]`

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{opt}» | checkbox | disabled: `{disabled}` |  | `each options` | `id=detalle-{indicatorId}-{idx}` | DetalleInput · l.40 |

**Other texts on screen** (3)

- «Sin opciones definidas para este indicador.» — DetalleInput · l.24, when `options.length === 0`
- «Selecciona todas las que aplican» — DetalleInput · l.30
- «{opt}» (label) — DetalleInput · l.32, when `each options`

### components/assessment/inputs/FrecuenciaInput.tsx

Used by: `/demo/assessments/[templateId]`, `/docente/assessments/[instanceId]`

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Cantidad de frecuencia» | number | «0» · disabled: `{disabled}` · `min={config?.min ?? 0} max={config?.max} step={config?.step ?? 1}` |  |  | `testid=frecuencia-value-input` | FrecuenciaInput · l.72 |
| «Unidad de frecuencia» | select | disabled: `{disabled}` | «(lista) {FREQUENCY_UNIT_LABELS[u]}» |  | `testid=frecuencia-unit-select` | FrecuenciaInput · l.96 |

**Other texts on screen** (1)

- «veces por» — FrecuenciaInput · l.95

### components/assessment/inputs/ProfundidadInput.tsx

Used by: `/demo/assessments/[templateId]`, `/docente/assessments/[instanceId]`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{level.value} . {level.label} [{descriptor}]» | `{() => onChange(level.value)}` | `each MATURITY_LEVELS` | `{disabled}` |  | ProfundidadInput · l.33 |

### components/assessment/inputs/TraspasoInput.tsx

Used by: `/demo/assessments/[templateId]`, `/docente/assessments/[instanceId]`

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Link a carpeta con evidencia» | url | «https://...» · disabled: `{disabled}` |  |  | `id=evidence-link-{indicatorId}` | TraspasoInput · l.16 |
| «Mejoras sugeridas» | textarea | «¿Con la experiencia adquirida, qué mejoras sugieres para la implementación de esta práctica?» · disabled: `{disabled}` |  |  | `id=improvement-{indicatorId}` | TraspasoInput · l.35 |

**Other texts on screen** (3)

- «Link a carpeta con evidencia» (label) — TraspasoInput · l.13
- «El archivo o carpeta enlazada debe ser accesible para cualquier persona con el link» — TraspasoInput · l.28
- «Mejoras sugeridas» (label) — TraspasoInput · l.32

### components/assessment/results/DetailedResults.tsx

Used by: `/demo/assessments/[templateId]/results`, `/docente/assessments/[instanceId]/results`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Detalle por {ENTITY_LABELS.objective}» | h3 | `objectiveScores && objectiveScores.length > 0` | DetailedResults · l.30 |
| «{objective.objectiveName}» | h4 | `objectiveScores && objectiveScores.length > 0 && each objectiveScores` | DetailedResults · l.40 |
| «Detalle por {ENTITY_LABELS.module}» | h3 |  | DetailedResults · l.76 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ModuleResultCard` |  | `objectiveScores && objectiveScores.length > 0 && each objectiveScores && each objective.modules` |  | DetailedResults · l.59 |
| `ModuleResultCard` |  | `each moduleScores` |  | DetailedResults · l.79 |

**Values shown from data** (2)

- `{Math.round(objective.objectiveScore)} %` — DetailedResults · l.47, when `objectiveScores && objectiveScores.length > 0 && each objectiveScores`
- `{objLevelInfo.label}` — DetailedResults · l.50, when `objectiveScores && objectiveScores.length > 0 && each objectiveScores`

**Other texts on screen** (1)

- «{objective.modules.length} {ENTITY_LABELS.module.toLowerCase()} / {ENTITY_LABELS.modules.toLowerCase()} · Peso: {objective.objectiveWeight} %» — DetailedResults · l.41, when `objectiveScores && objectiveScores.length > 0 && each objectiveScores`

### components/assessment/results/GapAnalysisSection.tsx

Used by: `/demo/assessments/[templateId]/results`, `/docente/assessments/[instanceId]/results`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Análisis de Brechas - Año {transformationYear} Expectativas {generationType}» | h3 |  | GapAnalysisSection · l.19 |
| «Indicadores Críticos ( {gapAnalysis.criticalIndicators.leng…} )» | h4 | `gapAnalysis.criticalIndicators.length > 0` | GapAnalysisSection · l.55 |
| «Indicadores que Requieren Atención ( {gapAnalysis.behindIndicators.length} )» | h4 | `gapAnalysis.criticalIndicators.length === 0 && gapAnalysis.behindIndicators.length > 0` | GapAnalysisSection · l.82 |

**Values shown from data** (6)

- `{gapAnalysis.overallStats.ahead}` — GapAnalysisSection · l.35
- `{gapAnalysis.overallStats.onTrack}` — GapAnalysisSection · l.39
- `{gapAnalysis.overallStats.behind}` — GapAnalysisSection · l.43
- `{gapAnalysis.overallStats.critical}` — GapAnalysisSection · l.47
- `{ci.indicatorCode} :` — GapAnalysisSection · l.63, when `gapAnalysis.criticalIndicators.length > 0 && each gapAnalysis.criticalIndicators.slice(0, 5) && ci.indicatorCode`
- `{bi.indicatorCode} :` — GapAnalysisSection · l.89, when `gapAnalysis.criticalIndicators.length === 0 && gapAnalysis.behindIndicators.length > 0 && each gapAnalysis.behindIndicators.slice(0, 5) && bi.indicatorCode`

**Other texts on screen** (8)

- «Generación Tractor / Generación Innova» (title) — GapAnalysisSection · l.22
- «Adelante» — GapAnalysisSection · l.36
- «En camino» — GapAnalysisSection · l.40
- «Atrasado» — GapAnalysisSection · l.44
- «Crítico» — GapAnalysisSection · l.48
- «(nivel {ci.actualLevel} de {ci.expectedLevel} esperado)» — GapAnalysisSection · l.65, when `gapAnalysis.criticalIndicators.length > 0 && each gapAnalysis.criticalIndicators.slice(0, 5)`
- «...y {gapAnalysis.criticalIndicators.leng…} más» — GapAnalysisSection · l.71, when `gapAnalysis.criticalIndicators.length > 0 && gapAnalysis.criticalIndicators.length > 5`
- «...y {gapAnalysis.behindIndicators.length…} más» — GapAnalysisSection · l.94, when `gapAnalysis.criticalIndicators.length === 0 && gapAnalysis.behindIndicators.length > 0 && gapAnalysis.behindIndicators.length > 5`

### components/assessment/results/ModuleResultCard.tsx

Used by: `/demo/assessments/[templateId]/results`, `/docente/assessments/[instanceId]/results`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{module.moduleName}» | h4 |  | ModuleResultCard · l.64 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{Math.round(module.moduleScore)} % {moduleLevelInfo.label} {module.moduleName} {module.indicators.length} indicador es [[↑ {module.gapStats.ahead}] [→ {module.gapStats.onTrack}] [↓ {module.gapStats.behind}] [⚠ {module.gapStats.critical}]]» | `{() => onToggle(module.moduleId)}` |  |  |  | ModuleResultCard · l.48 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Indicador» | `isExpanded` | ModuleResultCard · l.106 |
| «Categoría» | `isExpanded` | ModuleResultCard · l.107 |
| «Respuesta» | `isExpanded` | ModuleResultCard · l.108 |
| «Puntuación» | `isExpanded` | ModuleResultCard · l.109 |
| «Estado» | `isExpanded` | ModuleResultCard · l.110 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `formatRawValue()` | «Sí / No» | formatRawValue · l.20 |

**Values shown from data** (5)

- `{indicator.indicatorName}` — ModuleResultCard · l.120, when `isExpanded && each module.indicators`
- `{CATEGORY_LABELS[indicator.category]}` — ModuleResultCard · l.122, when `isExpanded && each module.indicators`
- `{formatRawValue(indicator.rawValue, …}` — ModuleResultCard · l.126, when `isExpanded && each module.indicators`
- `{Math.round(indicator.normalizedScor…} %` — ModuleResultCard · l.130, when `isExpanded && each module.indicators`
- `{gapStyle.icon} {gapStyle.label}` — ModuleResultCard · l.146, when `isExpanded && each module.indicators && gapStyle && indicator.gap?.expectedLevel !== null`

**Other texts on screen** (1)

- «Actual: {indicator.gap?.actualLevel}, Esperado: {indicator.gap?.expectedLevel}» (title) — ModuleResultCard · l.146, when `isExpanded && each module.indicators && gapStyle && indicator.gap?.expectedLevel !== null`

### components/assessment/results/ResultsCharts.tsx

Used by: `/demo/assessments/[templateId]/results`, `/docente/assessments/[instanceId]/results`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Puntuación por {ENTITY_LABELS.module}» | h3 |  | ResultsCharts · l.41 |
| «Perfil de Competencias» | h3 | `moduleScores.length >= 3` | ResultsCharts · l.64 |

**Charts** (2)

| Chart | Series | Shown when | Where |
|---|---|---|---|
| BarChart | Bar `score` |  | ResultsCharts · l.44 |
| RadarChart | Radar `score` «Puntuación» | `moduleScores.length >= 3` | ResultsCharts · l.67 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | ResultsCharts · l.45 |

### components/assessment/results/StrengthsWeaknesses.tsx

Used by: `/demo/assessments/[templateId]/results`, `/docente/assessments/[instanceId]/results`

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!strongestModule && !weakestModule` | StrengthsWeaknesses · l.13 |

**Values shown from data** (2)

- `{strongestModule}` — StrengthsWeaknesses · l.22, when `strongestModule`
- `{weakestModule}` — StrengthsWeaknesses · l.31, when `weakestModule && weakestModule !== strongestModule`

**Other texts on screen** (2)

- «Fortaleza» — StrengthsWeaknesses · l.21, when `strongestModule`
- «Área de mejora» — StrengthsWeaknesses · l.30, when `weakestModule && weakestModule !== strongestModule`

### components/assessment/results/SummaryCards.tsx

Used by: `/demo/assessments/[templateId]/results`, `/docente/assessments/[instanceId]/results`

**Values shown from data** (4)

- `{Math.round(totalScore)} %` — SummaryCards · l.44
- `{overallLevelLabel}` — SummaryCards · l.47
- `{generationType}` — SummaryCards · l.61
- `{indicatorsAboveExpectation} / {totalIndicators}` — SummaryCards · l.95

**Other texts on screen** (7)

- «Puntuación Total» — SummaryCards · l.41
- «Expectativa Año {transformationYear}» — SummaryCards · l.60
- «Generación Tractor / Generación Innova» (title) — SummaryCards · l.61
- «Cumple / En desarrollo» — SummaryCards · l.80
- «Nivel esperado: {expectedLevelLabel}» — SummaryCards · l.84
- «Indicadores» — SummaryCards · l.92
- «sobre la expectativa» — SummaryCards · l.99

### components/assessment/results/types.ts

Used by: `/demo/assessments/[templateId]/results`, `/docente/assessments/[instanceId]/results`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `GAP_STYLES` | «Adelante», «En camino», «Atrasado», «Crítico» | l.109 |

### components/layout/FunctionalPageHeader.tsx

Used by: `/admin/assessment-builder/[templateId]/expectations`, `/admin/assessment-builder/[templateId]`, `/admin/assessment-builder/create`, `/admin/assessment-builder`, `/admin/context-questions`, `/admin/context-questions/overview`, `/demo/assessments/[templateId]`, `/demo/assessments/[templateId]/results`, `/demo/assessments`, `/directivo/assessments/dashboard`, `/docente/assessments/[instanceId]`, `/docente/assessments/[instanceId]/results`, `/docente/assessments`, `/school/migration-plan`, `/school/transversal-context/edit`, `/school/transversal-context`

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

### components/school/ChangeHistorySection.tsx

Used by: `/school/migration-plan`, `/school/transversal-context/edit`, `/school/transversal-context`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{title} / {DEFAULT_TITLES[feature]} / Historial de cambios [{total}]» | `{handleToggle}` |  |  |  | ChangeHistorySection · l.122 |
| «Cargando... / Ver más» | `{handleLoadMore}` | `!(loading && entries.length === 0) && !(error) && !(entries.length === 0) && entries.length < total` | `{loading}` |  | ChangeHistorySection · l.237 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `DEFAULT_TITLES` | «Historial — Contexto Estructural», «Historial — Plan de Migración», «Historial — Preguntas de Contexto» | l.64 |
| `formatRelativeTime()` | «hace un momento», «hace {diffMin} {diffMin === 1 ? 'minuto' : …}», «hace {diffHours} {diffHours === 1 ? 'hora' : …}», «hace {diffDays} {diffDays === 1 ? 'día' : 'd…}» | formatRelativeTime · l.34 |
| `formatValue()` | «Sí / No» | formatValue · l.50 |
| `actionLabel()` | «Registro inicial», «Actualización», «Eliminación» | actionLabel · l.57 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «hace {diffDays} {diffDays === 1 ? 'día' : 'd…}» | formatRelativeTime · l.38 |
| «Registro inicial» | actionLabel · l.57 |
| «Actualización» | actionLabel · l.58 |
| «Eliminación» | actionLabel · l.59 |

**Values shown from data** (7)

- `{entry.user_name}` — ChangeHistorySection · l.182, when `!(loading && entries.length === 0) && !(error) && !(entries.length === 0) && each entries`
- `{formatRelativeTime(entry.created_at)}` — ChangeHistorySection · l.185, when `!(loading && entries.length === 0) && !(error) && !(entries.length === 0) && each entries`
- `{actionLabel(entry.action)}` — ChangeHistorySection · l.191, when `!(loading && entries.length === 0) && !(error) && !(entries.length === 0) && each entries`
- `{label}` — ChangeHistorySection · l.205, when `!(entries.length === 0) && each entries && entry.changed_fields && entry.changed_fields.length > 0 && each entry.changed_fields`
- `{formatValue(prevVal)}` — ChangeHistorySection · l.209, when `each entries && entry.changed_fields && entry.changed_fields.length > 0 && each entry.changed_fields && prevVal !== undefined && newVal !== undefined`
- `{formatValue(newVal)}` — ChangeHistorySection · l.213, when `each entries && entry.changed_fields && entry.changed_fields.length > 0 && each entry.changed_fields && prevVal !== undefined && newVal !== undefined`
- `{formatValue(newVal)}` — ChangeHistorySection · l.220, when `entry.changed_fields && entry.changed_fields.length > 0 && each entry.changed_fields && !(prevVal !== undefined && newVal !== undefined) && newVal !== undefined`

**Other texts on screen** (2)

- «Error al cargar el historial. Intente de nuevo.» — ChangeHistorySection · l.163, when `expanded && !(loading && entries.length === 0) && error`
- «No hay cambios registrados aún» — ChangeHistorySection · l.167, when `expanded && !(loading && entries.length === 0) && !(error) && entries.length === 0`

### components/school/CompletionStatusBadge.tsx

Used by: `/school/migration-plan`, `/school/transversal-context`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=status` | CompletionStatusBadge · l.39 |

**Other texts on screen** (4)

- «Pendiente» — CompletionStatusBadge · l.33, when `!isCompleted`
- «Completado» — CompletionStatusBadge · l.50
- «Completado por {completedByName} el {formatDate(completedAt)} .» — CompletionStatusBadge · l.55, when `(showTooltip && (completedByName \|\| lastUpdatedByName)) && completedByName && completedAt`
- «Última modificación por {lastUpdatedByName} el {formatDate(lastUpdatedAt)} .» — CompletionStatusBadge · l.60, when `(showTooltip && (completedByName \|\| lastUpdatedByName)) && lastUpdatedByName && lastUpdatedAt`

### components/school/ViaResponsiblesSection.tsx

Used by: `/school/transversal-context`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Registros del equipo directivo» | h3 |  | ViaResponsiblesSection · l.171 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar» | `{() => setNotice(null)}` | `notice` |  |  | ViaResponsiblesSection · l.180 |
| «Asignar» | `{(e) => openModal(via, 'assign', e.currentTarget)}` | `each vias && canWrite && !via.responsible` | `{saving !== null}` | `testid=via-assign-{via.area}` | ViaResponsiblesSection · l.221 |
| «Enviando… / Reenviar» | `{() => submit(via, 'assign', via.responsible!.id)}` | `each vias && canWrite && !(!via.responsible)` | `{saving !== null}` | `testid=via-resend-{via.area}` | ViaResponsiblesSection · l.231 |
| «Reemplazar» | `{(e) => openModal(via, 'replace', e.currentTarget)}` | `each vias && canWrite && !(!via.responsible)` | `{saving !== null}` | `testid=via-replace-{via.area}` | ViaResponsiblesSection · l.239 |
| «Guardando… / Asignar / Reemplazar» | `{confirmModal}` | `modal` | `{!selected \|\| saving !== null}` | `testid=via-modal-confirm` | ViaResponsiblesSection · l.317 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Persona del equipo directivo» | select |  | «-- Seleccionar --», «(lista) {c.name} ({c.email})» | `modal && !(modalCandidates.length === 0)` | `testid=via-modal-select id=via-modal-select (id used by code)` | ViaResponsiblesSection · l.290 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se pudieron cargar los registros del equipo directivo.» | `setLoadError` | `!response.ok` | ViaResponsiblesSection · l.87 |
| «No se pudieron cargar los registros del equipo directivo.» | `setLoadError` |  | ViaResponsiblesSection · l.94 |
| «No se pudo completar la asignación.» | `setActionError` | `!response.ok` | submit · l.118 |
| «No se pudo completar la asignación.» | `setActionError` |  | submit · l.126 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `vias.length === 0` | ViaResponsiblesSection · l.162 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogPrimitive.Close` | aria-label: Cerrar | `modal` | `testid=via-modal-close` | ViaResponsiblesSection · l.269 |
| `X` | aria-hidden: true | `modal` |  | ViaResponsiblesSection · l.274 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `OUTCOME_LABELS` | «ya estaba asignado», «cancelado (no se vuelve a crear)» | l.43 |
| `verb` | «Responsable reemplazado / Registros reenviados / Responsable asignado» | submit · l.121 |
| `summarize()` | «No hay templates publicados en esta vía todavía.» | summarize · l.52 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «No hay templates publicados en esta vía todavía.» | summarize · l.52 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (10)

| Kind | What | Where |
|---|---|---|
| focus | `target.focus()` | ViaResponsiblesSection · l.77 |
| mark | `testid=via-responsibles-error` | ViaResponsiblesSection · l.156 |
| mark | `testid=via-responsibles-section` | ViaResponsiblesSection · l.169 |
| mark | `testid=via-responsibles-notice` | ViaResponsiblesSection · l.178 |
| mark | `testid=via-responsibles-action-error` | ViaResponsiblesSection · l.184 |
| mark | `testid=via-row-{via.area}` | ViaResponsiblesSection · l.192 |
| mark | `testid=via-pending-{via.area}` | ViaResponsiblesSection · l.211 |
| mark | `testid=via-modal` | ViaResponsiblesSection · l.260 |
| role | `role=alert` | ViaResponsiblesSection · l.307 |
| mark | `testid=via-modal-error` | ViaResponsiblesSection · l.307 |

**Values shown from data** (4)

- `{loadError}` — ViaResponsiblesSection · l.156, when `loadError`
- `{notice.label} :` — ViaResponsiblesSection · l.179, when `notice`
- `{via.label}` — ViaResponsiblesSection · l.194, when `each vias`
- `· {via.responsible.email}` — ViaResponsiblesSection · l.200, when `each vias && via.responsible && via.responsible.email`

**Other texts on screen** (9)

- «Estas vías las responde una persona del equipo directivo de la escuela, no el docente de cada curso.» — ViaResponsiblesSection · l.173
- «Sin responsable asignado» — ViaResponsiblesSection · l.196, when `each vias`
- «Aún no hay templates publicados en esta vía. / {via.templates.length} template{via.templates.length === 1 …} publicado{via.templates.length === 1 …}» — ViaResponsiblesSection · l.207, when `each vias`
- «· {via.pendingTemplates.length} pendiente s de entregar» — ViaResponsiblesSection · l.211, when `each vias && via.responsible && via.pendingTemplates.length > 0`
- «Asignar responsable / Reemplazar responsable · {modal.via.label}» — ViaResponsiblesSection · l.266, when `modal`
- «Elija a la persona del equipo directivo que responderá los registros de esta vía. / Solo es posible mientras la persona actual no haya comenzado ningún registro de esta vía.» — ViaResponsiblesSection · l.278, when `modal`
- «No hay otras personas activas en el equipo directivo de esta escuela.» — ViaResponsiblesSection · l.284, when `modal && modalCandidates.length === 0`
- «Persona del equipo directivo» (label) — ViaResponsiblesSection · l.287, when `modal && !(modalCandidates.length === 0)`
- «Cancelar» — ViaResponsiblesSection · l.315, when `modal`

### components/tutorials/HelpButton.tsx

Used by: `/docente/assessments/[instanceId]`, `/docente/assessments/[instanceId]/results`, `/docente/assessments`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon HelpCircle]» · aria «Ayuda y tutoriales» | `{() => setOpen(true)}` |  |  |  | HelpButton · l.15 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `HelpDrawer` | component | `{open}` |  | HelpButton · l.23 |

### components/tutorials/HelpDrawer.tsx

Used by: `/docente/assessments/[instanceId]`, `/docente/assessments/[instanceId]/results`, `/docente/assessments`

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

Used by: `/docente/assessments/[instanceId]`, `/docente/assessments/[instanceId]/results`, `/docente/assessments`

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {title} · {`https://player.vimeo.com/video/${vimeoId}?dnt=1`} |  |  | VimeoEmbed · l.21 |

**Other texts on screen** (1)

- «Video próximamente» — VimeoEmbed · l.13, when `!vimeoId`

### components/ui/dialog.tsx

Used by: `/docente/assessments/[instanceId]`, `/docente/assessments/[instanceId]/results`, `/docente/assessments`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### lib/constants/transversal-context.ts

Used by: `/school/transversal-context/edit`, `/school/transversal-context`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TRANSVERSAL_CONTEXT_FIELD_LABELS` | «Total de estudiantes», «Niveles educativos», «Cursos por nivel», «Año de implementación», «Sistema de períodos», «Programa Inicia completado», «Horas Programa Inicia», «Año Programa Inicia» | l.5 |

### lib/services/assessment-builder/frequencyConfig.ts

Used by: `/admin/assessment-builder/[templateId]/expectations`, `/admin/assessment-builder/[templateId]`

**Messages set on the page** (7)

| Text | Set by | When | Where |
|---|---|---|---|
| «la configuración contiene un campo desconocido ({unknownKey})» | `errors.push` | `unknownKey !== undefined` | validateFrequencyConfig · l.184 |
| «el campo type debe ser texto» | `errors.push` | `isPresent(c.type) && typeof c.type !== 'string'` | validateFrequencyConfig · l.185 |
| «falta la unidad por defecto» | `errors.push` | `!unitPresent` | validateFrequencyConfig · l.199 |
| «la unidad por defecto debe ser un período válido (día, semana, mes, trimestre, semestre o año)» | `errors.push` | `!(!unitPresent) && !unitOk` | validateFrequencyConfig · l.200 |
| «debe definir al menos un período permitido» | `errors.push` | `!allowedPresent` | validateFrequencyConfig · l.206 |
| «los períodos permitidos deben ser períodos válidos (día, semana, mes, trimestre, semestre o año)» | `errors.push` | `!(!allowedPresent) && !allowedOk` | validateFrequencyConfig · l.208 |
| «la unidad por defecto debe estar entre los períodos permitidos» | `errors.push` | `!(!allowedPresent) && !(!allowedOk) && unitOk && !(allowed as string[]).includes(c.unit as string)` | validateFrequencyConfig · l.210 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `RANGE_MESSAGES` | «el valor mínimo debe ser un número», «el valor máximo debe ser un número», «el valor mínimo debe ser menor que el máximo», «el paso debe ser un número mayor que 0», «el paso no puede ser mayor que el rango (máximo − mínimo)» | validateFrequencyConfig · l.187 |
| `RANGE_REASONS` | «frequency_config.min no es un número finito», «frequency_config.max no es un número finito», «frequency_config.step no es un número finito», «frequency_config.step debe ser mayor que 0», «frequency_config.min debe ser menor que max», «frequency_config.step no cabe en el rango min..max» | parseSnapshotFrequencyConfig · l.296 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «falta la configuración de frecuencia (mínimo, máximo, paso, unidad y períodos permitidos)» | validateFrequencyConfig · l.177 |
| «frequency_config está incompleto (falta {missing.join(', ')})» | parseSnapshotFrequencyConfig · l.294 |
| «frequency_config.unit no es un período válido» | parseSnapshotFrequencyConfig · l.311 |
| «frequency_config.allowed_units debe ser una lista no vacía de períodos válidos» | parseSnapshotFrequencyConfig · l.314 |
| «{value} es menor que el mínimo ({min})» | frequencyExpectationViolation · l.453 |
| «{value} es mayor que el máximo ({max})» | frequencyExpectationViolation · l.454 |

### lib/services/assessment-builder/migrationPlanRule.ts

Used by: `/school/migration-plan`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `effectiveGenerationType()` | «GT» | effectiveGenerationType · l.17 |

### lib/services/assessment-builder/responseDraft.ts

Used by: `/docente/assessments/[instanceId]`

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Invalid draft» | `throw (shown by whoever catches it)` | `parsed.version !== 1 \|\| typeof parsed.savedAt !== 'string' \|\| !parsed.answers \|\| typeof parsed.answers !== 'object' \|\| Array.isArray(parsed.answers)` | initialize · l.91 |
| «Invalid draft answers» | `throw (shown by whoever catches it)` | `!entries.every(([id, value]) => this.allowed.has(id) && isAnswer(value))` | initialize · l.95 |
| «No se pudieron guardar las respuestas.» | `throw (shown by whoever catches it)` | `!response.ok` | send · l.190 |
| «No se guardaron todas las respuestas. Revisa e intenta nuevamente.» | `throw (shown by whoever catches it)` | `data.errors?.length \|\| data.saved !== Object.keys(sent).length` | send · l.193 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «No se pudo confirmar el guardado. Reintentaremos automáticamente.» | ResponseDraftSession · l.214 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, delay)` | schedule · l.159 |
| timer | `setTimeout(…, 15000)` | send · l.177 |

### lib/services/assessment-builder/viaRules.ts

Used by: `/admin/assessment-builder/create`, `/admin/assessment-builder`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `VIA_TARGET_LABELS` | «Docente del curso», «Responsable del equipo directivo» | l.19 |
| `RULES_UNAVAILABLE` | «No se pudieron leer las reglas de asignación por vía. Intente nuevamente.» | l.31 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Las reglas de asignación por vía tienen un valor no reconocido.» | loadViaRules · l.51 |
| «No hay reglas de asignación por vía configuradas.» | loadViaRules · l.56 |

**Reads and writes the database directly:** `table:ab_via_assignment_rules` (select)

### lib/tutorials/content.ts

Used by: `/docente/assessments/[instanceId]`, `/docente/assessments/[instanceId]/results`, `/docente/assessments`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TUTORIALS` | «Mi Aprendizaje», «Cómo encontrar y retomar tus cursos», «Qué significa cada estado: Comenzar / Continuar / Completado», «Mis Sesiones», «Tu día a día en Mis Sesiones», «Las 6 pestañas de una sesión», «Exportar sesiones a tu calendario (iCal)», «Mis Reportes», «Leer tus reportes de sesiones», «Mis Horas», «Revisar tus horas y exportarlas», «Por qué mis horas ejecutadas vs. penalizadas difieren», «Proceso de Cambio», «Cómo completar un Proceso de Cambio de principio a fin», «Entender la jerarquía: Objetivos, Acciones e Indicadores», «Los 5 tipos de indicador», «Cobertura como gate», «Guardado automático, progreso y envío», «Ver tus resultados», «Espacio Colaborativo», «Tu comunidad de crecimiento», «Documentos: subir, carpetas, permisos», «Mensajería: hilos, menciones, adjuntos», «Reuniones: crear acta» | l.23 |

### lib/validation/profundidadValidator.ts

Used by: `/admin/assessment-builder/[templateId]`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Los indicadores de profundidad requieren al menos un descriptor de nivel» | validateProfundidadDescriptors · l.23 |

### types/assessment-builder.ts

Used by: `/admin/assessment-builder/[templateId]/expectations`, `/admin/assessment-builder/[templateId]`, `/admin/assessment-builder/create`, `/admin/assessment-builder`, `/admin/context-questions/overview`, `/demo/assessments/[templateId]`, `/demo/assessments/[templateId]/results`, `/demo/assessments`, `/directivo/assessments/dashboard`, `/docente/assessments/[instanceId]`, `/docente/assessments/[instanceId]/results`, `/docente/assessments`, `/school/transversal-context/edit`, `/school/transversal-context`

**Texts kept in lists and helpers in the code (labels, options, status names)** (8)

| Name | Texts | Where |
|---|---|---|
| `GENERATION_TYPE_LABELS` | «Generación Tractor», «Generación Innova» | l.39 |
| `MATURITY_LEVELS` | «Por Comenzar», «Incipiente», «En Desarrollo», «Avanzado», «Consolidado» | l.66 |
| `AREA_LABELS` | «Crecimiento», «Aprendizaje», «Evaluación», «Propósito», «Familias», «Trabajo Docente», «Liderazgo» | l.74 |
| `AREA_CODES` | «CRE», «APR», «EVA», «PRO», «FAM», «TDO», «LID» | l.84 |
| `CATEGORY_LABELS` | «Cobertura», «Frecuencia», «Profundidad», «Traspaso», «Detalle» | l.104 |
| `CATEGORY_DESCRIPTIONS` | «Respuesta binaria (Sí/No)», «Valor cuantitativo (número, porcentaje)», «Nivel de rúbrica (0-4)», «Evidencia y sugerencias de mejora», «Selección múltiple — elige todas las que aplican» | l.112 |
| `ENTITY_LABELS` | «Proceso Generativo», «Procesos Generativos», «Práctica Generativa», «Prácticas Generativas», «Indicador», «Indicadores» | l.122 |
| `GRADE_LEVEL_LABELS` | «Medio Menor», «Medio Mayor», «Kinder», «1° Básico», «2° Básico», «3° Básico», «4° Básico», «5° Básico», «6° Básico», «7° Básico», «8° Básico», «1° Medio», «2° Medio», «3° Medio», «4° Medio» | l.154 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Desconocido» | getMaturityLevelLabel · l.939 |

### types/roles.ts

Used by: `/admin/context-questions`, `/admin/context-questions/overview`

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

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/assessment-builder/grades` | `pages/api/admin/assessment-builder/grades/index.ts` | GET | `/admin/assessment-builder`, `/admin/assessment-builder/create` | `pages/admin/assessment-builder/create.tsx`, `pages/admin/assessment-builder/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]` | `pages/api/admin/assessment-builder/templates/[templateId].ts` | DELETE, GET, PUT | `/admin/assessment-builder`, `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/templates.test.ts`, `pages/admin/assessment-builder/[templateId]/index.tsx`, `pages/admin/assessment-builder/index.tsx`, `tests/e2e/assessment-frequency-validation.spec.ts` |
| `/api/admin/assessment-builder/templates/[templateId]/archive` | `pages/api/admin/assessment-builder/templates/[templateId]/archive.ts` | POST | `/admin/assessment-builder`, `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/archive-action.test.ts`, `__tests__/api/assessment-builder/lifecycle.test.ts`, `pages/admin/assessment-builder/[templateId]/index.tsx`, `pages/admin/assessment-builder/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/demo-access` | `pages/api/admin/assessment-builder/templates/[templateId]/demo-access.ts` | DELETE, GET, POST | `/admin/assessment-builder/[templateId]` | `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/duplicate` | `pages/api/admin/assessment-builder/templates/[templateId]/duplicate.ts` | POST | `/admin/assessment-builder`, `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/duplicate-content-columns.test.ts`, `__tests__/api/assessment-builder/duplicate-from-editor.test.ts`, `__tests__/api/assessment-builder/lifecycle.test.ts`, `pages/admin/assessment-builder/[templateId]/index.tsx`, `pages/admin/assessment-builder/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/expectations/[indicatorId]` | `pages/api/admin/assessment-builder/templates/[templateId]/expectations/[indicatorId].ts` | DELETE, GET, PUT | **no screen** | `__tests__/api/assessment-builder/expectations-concurrent-rules.test.ts`, `__tests__/api/assessment-builder/expectations-level-descriptors.test.ts`, `__tests__/api/assessment-builder/expectations-put-validation.test.ts`, `__tests__/api/assessment-builder/expectations.test.ts`, `__tests__/api/assessment-builder/per-year-weights.test.ts` +1 |
| `/api/admin/assessment-builder/templates/[templateId]/expectations` | `pages/api/admin/assessment-builder/templates/[templateId]/expectations/index.ts` | GET, PUT | `/admin/assessment-builder/[templateId]/expectations` | `__tests__/api/assessment-builder/per-year-weights.test.ts`, `pages/admin/assessment-builder/[templateId]/expectations.tsx`, `tests/e2e/assessment-builder-expectations-editor.spec.ts` |
| `/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]` | `pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId].ts` | DELETE, GET, PUT | `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/modules.test.ts`, `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]` | `pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId].ts` | DELETE, GET, PUT | `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/cobertura-gate.test.ts`, `__tests__/api/assessment-builder/detalle.test.ts`, `__tests__/api/assessment-builder/indicator-put-expectation-check.test.ts`, `__tests__/api/assessment-builder/indicator-put-mapping.test.ts`, `__tests__/api/assessment-builder/indicators.test.ts` +2 |
| `/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators` | `pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/index.ts` | GET, POST | `/admin/assessment-builder/[templateId]` | `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/modules` | `pages/api/admin/assessment-builder/templates/[templateId]/modules/index.ts` | GET, POST | `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/modules.test.ts`, `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/objectives/[objectiveId]` | `pages/api/admin/assessment-builder/templates/[templateId]/objectives/[objectiveId].ts` | DELETE, GET, PUT | `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/objectives.test.ts`, `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/objectives` | `pages/api/admin/assessment-builder/templates/[templateId]/objectives/index.ts` | GET, POST | `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/objectives.test.ts`, `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/publish` | `pages/api/admin/assessment-builder/templates/[templateId]/publish.ts` | POST | `/admin/assessment-builder/[templateId]` | `__tests__/api/assessment-builder/publish-indicator-count.test.ts`, `__tests__/api/assessment-builder/publish-snapshot-retry.localdb.test.ts`, `__tests__/api/assessment-builder/publish.test.ts`, `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/admin/assessment-builder/templates/[templateId]/snapshots/[snapshotId]` | `pages/api/admin/assessment-builder/templates/[templateId]/snapshots/[snapshotId].ts` | GET | **no screen** |  |
| `/api/admin/assessment-builder/templates/[templateId]/versions` | `pages/api/admin/assessment-builder/templates/[templateId]/versions.ts` | GET | `/admin/assessment-builder/[templateId]` | `pages/admin/assessment-builder/[templateId]/index.tsx` |
| `/api/admin/assessment-builder/templates` | `pages/api/admin/assessment-builder/templates/index.ts` | GET, POST | `/admin/assessment-builder`, `/admin/assessment-builder/create` | `__tests__/api/assessment-builder/templates.test.ts`, `pages/admin/assessment-builder/create.tsx`, `pages/admin/assessment-builder/index.tsx` |
| `/api/admin/context-questions/[id]` | `pages/api/admin/context-questions/[id].ts` | DELETE, PUT | `/admin/context-questions` | `pages/admin/context-questions/index.tsx`, `tests/e2e/context-questions/admin-crud.spec.ts`, `tests/e2e/context-questions/api-security.spec.ts` |
| `/api/admin/context-questions` | `pages/api/admin/context-questions/index.ts` | GET, POST | `/admin/context-questions` | `pages/admin/context-questions/index.tsx`, `tests/e2e/context-questions/admin-crud.spec.ts`, `tests/e2e/context-questions/api-security.spec.ts` |
| `/api/admin/context-questions/overview` | `pages/api/admin/context-questions/overview.ts` | GET | `/admin/context-questions/overview` | `pages/admin/context-questions/overview.tsx`, `tests/e2e/context-questions/api-security.spec.ts` |
| `/api/demo/assessments/[templateId]` | `pages/api/demo/assessments/[templateId].ts` | GET | `/demo/assessments/[templateId]` | `pages/demo/assessments/[templateId]/index.tsx` |
| `/api/demo/assessments` | `pages/api/demo/assessments/index.ts` | GET | `/demo/assessments` | `pages/demo/assessments/index.tsx` |
| `/api/directivo/assessments/course-results` | `pages/api/directivo/assessments/course-results.ts` | GET | `/directivo/assessments/dashboard` | `__tests__/api/assessment-builder/dashboard.test.ts`, `__tests__/api/assessment-builder/results-school-choice.test.ts`, `__tests__/pages/directivo-dashboard-school-choice.test.tsx`, `pages/directivo/assessments/dashboard.tsx` |
| `/api/directivo/assessments/school-results` | `pages/api/directivo/assessments/school-results.ts` | GET | `/directivo/assessments/dashboard` | `__tests__/api/assessment-builder/dashboard.test.ts`, `__tests__/api/assessment-builder/results-school-choice.test.ts`, `__tests__/api/assessment-builder/school-results-same-summary.test.ts`, `__tests__/pages/directivo-dashboard-school-choice.test.tsx`, `pages/directivo/assessments/dashboard.tsx` |
| `/api/docente/assessments/[instanceId]` | `pages/api/docente/assessments/[instanceId]/index.ts` | GET | `/docente/assessments/[instanceId]` | `__tests__/api/assessment-builder/docente-assessments.test.ts`, `__tests__/api/assessment-builder/response-load-failure.test.ts`, `__tests__/api/docente/assessments/get-progress.test.ts`, `__tests__/pages/docente/assessment-form-autosave.test.tsx`, `__tests__/pages/docente/assessment-frequency.test.tsx` +3 |
| `/api/docente/assessments/[instanceId]/responses` | `pages/api/docente/assessments/[instanceId]/responses.ts` | PUT | `/docente/assessments/[instanceId]` | `__tests__/api/assessment-builder/traspaso.test.ts`, `__tests__/api/docente/assessments/responses.test.ts`, `__tests__/pages/docente/assessment-form-autosave.test.tsx`, `__tests__/pages/docente/assessment-frequency.test.tsx`, `lib/services/assessment-builder/responseDraft.ts` +1 |
| `/api/docente/assessments/[instanceId]/results` | `pages/api/docente/assessments/[instanceId]/results.ts` | GET | `/docente/assessments/[instanceId]/results` | `pages/docente/assessments/[instanceId]/results.tsx`, `tests/e2e/assessment-results.spec.ts` |
| `/api/docente/assessments/[instanceId]/submit` | `pages/api/docente/assessments/[instanceId]/submit.ts` | POST | `/docente/assessments/[instanceId]` | `__tests__/api/docente/assessments/submit.test.ts`, `__tests__/pages/docente/assessment-form-autosave.test.tsx`, `pages/docente/assessments/[instanceId]/index.tsx`, `tests/e2e/assessment-draft.spec.ts` |
| `/api/docente/assessments` | `pages/api/docente/assessments/index.ts` | GET | `/docente/assessments` | `__tests__/api/assessment-builder/docente-assessments.test.ts`, `__tests__/pages/docente/assessments-list-cards.test.tsx`, `pages/docente/assessments/index.tsx`, `tests/e2e/assessment-delivery.spec.ts` |
| `/api/school/change-history` | `pages/api/school/change-history/index.ts` | GET | `/school/migration-plan`, `/school/transversal-context`, `/school/transversal-context/edit` | `__tests__/api/school/change-history.test.ts`, `__tests__/pages/school/transversal-context-assign.test.tsx`, `components/school/ChangeHistorySection.tsx` |
| `/api/school/completion-status` | `pages/api/school/completion-status/index.ts` | GET | `/school/migration-plan`, `/school/transversal-context` | `__tests__/api/school/completion-status.test.ts`, `__tests__/pages/school/migration-plan-denied-state.test.tsx`, `__tests__/pages/school/transversal-context-assign.test.tsx`, `__tests__/pages/school/transversal-context-late-answer.test.tsx`, `__tests__/pages/school/transversal-context-replace.test.tsx` +2 |
| `/api/school/migration-plan` | `pages/api/school/migration-plan/index.ts` | GET, PUT | `/school/migration-plan` | `__tests__/api/school/migration-plan-assignment-auth.test.ts`, `__tests__/pages/school/migration-plan-denied-state.test.tsx`, `pages/school/migration-plan/index.tsx` |
| `/api/school/transversal-context/assign-docente` | `pages/api/school/transversal-context/assign-docente.ts` | POST | `/school/transversal-context` | `__tests__/api/school/assign-docente.test.ts`, `__tests__/pages/school/transversal-context-assign.test.tsx`, `pages/school/transversal-context/index.tsx` |
| `/api/school/transversal-context/custom-responses` | `pages/api/school/transversal-context/custom-responses.ts` | GET, POST | `/school/transversal-context`, `/school/transversal-context/edit` | `__tests__/api/school/audit-logging.test.ts`, `__tests__/api/school/custom-responses.test.ts`, `__tests__/pages/school/transversal-context-assign.test.tsx`, `__tests__/pages/school/transversal-context-edit.test.tsx`, `__tests__/pages/school/transversal-context-late-answer.test.tsx` +4 |
| `/api/school/transversal-context/docentes` | `pages/api/school/transversal-context/docentes.ts` | GET | `/school/transversal-context` | `__tests__/api/school/transversal-context-docentes.test.ts`, `__tests__/pages/school/transversal-context-assign.test.tsx`, `__tests__/pages/school/transversal-context-replace.test.tsx`, `pages/school/transversal-context/index.tsx` |
| `/api/school/transversal-context` | `pages/api/school/transversal-context/index.ts` | GET, POST | `/school/transversal-context`, `/school/transversal-context/edit` | `__tests__/api/school/custom-responses.test.ts`, `__tests__/api/school/transversal-context-index.test.ts`, `__tests__/pages/school/transversal-context-assign.test.tsx`, `__tests__/pages/school/transversal-context-edit.test.tsx`, `__tests__/pages/school/transversal-context-late-answer.test.tsx` +3 |
| `/api/school/transversal-context/questions` | `pages/api/school/transversal-context/questions.ts` | GET | `/school/transversal-context`, `/school/transversal-context/edit` | `__tests__/pages/school/transversal-context-assign.test.tsx`, `__tests__/pages/school/transversal-context-edit.test.tsx`, `__tests__/pages/school/transversal-context-late-answer.test.tsx`, `__tests__/pages/school/transversal-context-replace.test.tsx`, `pages/school/transversal-context/edit.tsx` +2 |
| `/api/school/transversal-context/replace-docente` | `pages/api/school/transversal-context/replace-docente.ts` | POST | `/school/transversal-context` | `__tests__/api/school/replace-docente.test.ts`, `__tests__/pages/school/transversal-context-assign.test.tsx`, `__tests__/pages/school/transversal-context-replace.test.tsx`, `pages/school/transversal-context/index.tsx` |
| `/api/school/transversal-context/schools` | `pages/api/school/transversal-context/schools.ts` | GET | `/directivo/assessments/dashboard`, `/school/migration-plan`, `/school/transversal-context` | `__tests__/api/school/transversal-context-schools.test.ts`, `__tests__/pages/directivo-dashboard-school-choice.test.tsx`, `__tests__/pages/school/migration-plan-denied-state.test.tsx`, `__tests__/pages/school/transversal-context-assign.test.tsx`, `pages/directivo/assessments/dashboard.tsx` +2 |
| `/api/school/transversal-context/via-responsibles` | `pages/api/school/transversal-context/via-responsibles.ts` | GET, POST | `/school/transversal-context` | `__tests__/api/school/via-responsibles-sanitize.test.ts`, `__tests__/api/school/via-responsibles.test.ts`, `components/school/ViaResponsiblesSection.tsx` |


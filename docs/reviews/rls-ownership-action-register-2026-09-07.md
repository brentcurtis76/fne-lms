# Ledger ownership and action register — for Brent (closure C5, 2026-09-07)

> `node scripts/check-ledger.mjs` fails with exactly **67** check-16 (ownership) failures at the current candidate, unchanged since the R1 baseline (evidence: `remaining-work-ledger-audit.log` beside the audit, and this session's `ledger-run1.log`). None of them is an RLS assertion. This register lists each unowned item with the concrete decision it needs so the debt can be closed by **accepting named ownership**, not by editing the validator, inventing placeholder owners, or executing the data operations. Nothing here was changed in the ledger by the executor: ownership is Brent's to assign or delegate, and a triage owner is enough for a BACKLOG row (check 16 accepts `triage_owner`).
>
> Status vocabulary kept distinct: **authorization** (may it happen), **ownership** (who answers for it), **implementation** (is the code written), **deployment** (is it live). The RLS candidate on `fix/rls-learn` changes none of these 67 rows.

## A. What the validator requires

| Row state | Check-16 rule | What closes it |
|---|---|---|
| `BACKLOG` (57 rows) | a real `dueno` **or** a named `triage_owner` | Brent names a triage owner per area (one name can own many rows); the row stays BACKLOG |
| `BLOCKED` + `delivery_mode = DATA` linked to a P0 claim (10 rows, `W-D-01…10`) | a real `dueno` regardless of status ("any P0-linked item requires a real owner") | Brent names the accountable owner of each Production data operation; the operation itself stays BLOCKED / UNAUTHORIZED until separately authorized |

Placeholders (`sin asignar`, `TBD`, `n/a`, `-`, …) are rejected by the validator by design and are **not** proposed here.

## B. The ten BLOCKED Production data operations (W-D-01 … W-D-10)

These are organisational/account setup, network links, school contexts, communities, contracts, tender history, teaching assignments, LMS content and assessment-instrument publication for the Santa Marta claims. They are **not** part of the RLS release and are not executed by it. Each needs: (1) a named owner, (2) a separate written authorization from Brent before any Production write, (3) the class-3 safeguards already recorded in the ledger (dry-run counts, key capture, restore plan, aggregate-only evidence).

| Work item | Linked claims | Title | Proposed next step |
|---|---|---|---|
| `W-D-01` | 3 | Sembrar las filas de `programas` | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-02` | 4 | Alta de las ~200 cuentas de directoras y docentes | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-03` | 3 | Crear la Red Santa Marta y sus ocho vínculos en red_escuelas | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-04` | 5 | Cargar el contexto transversal de cada colegio: catálogo de niveles ab_grades y cursos por nivel | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-05` | 3 | Crear las comunidades de crecimiento y sus miembros por colegio | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-06` | 4 | Cargar contratos y buckets de horas por colegio | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-07` | 3 | Importar el histórico de licitaciones con sus documentos | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-08` | 4 | Cargar las asignaciones docente–curso que crean las evaluaciones | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-09` | 2 | Sembrar el contenido LMS: rutas, cursos, módulos, lecciones e inscripciones | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |
| `W-D-10` | 3 | Publicar el instrumento v1.1.0 con sus objetivos, indicadores y expectativas por año y generación | name the accountable data owner (proposal: the same person who authorizes the Santa Marta simulation data, per `santa-marta-seeded-simulation-plan-2026-08-31.md`); keep BLOCKED/UNAUTHORIZED |

## C. The 57 BACKLOG rows without a triage owner

Grouped by area so one triage decision can cover many rows. Proposed triage owners are **suggestions for Brent to confirm**, not assignments.

| Area | Rows | Proposed triage owner (to confirm) | Notes |
|---|---|---|---|
| UI / community workspace (A-series backlog) | 29 | Brent (product) or a delegated FNE product owner | Miembros de la Comunidad (14) — un listado desplegable de miembros con el conteo… |
| backlog | 28 | Brent (product) or a delegated FNE product owner | La ficha de creacion (Numero LIC-2026-SMC-001, Programa, Ano, Correo, Monto min/… |

### C.1 Full list

| Work item | Mode | Claims | Title |
|---|---|---|---|
| `W-BL-A03-5` | MERGE | 1 | Miembros de la Comunidad (14) — un listado desplegable de miembros con el conteo real. |
| `W-BL-A03-6` | MERGE | 1 | El buscador «Buscar en documentos, m…» funciona en todo el espacio de trabajo. |
| `W-BL-A04-4` | MERGE | 1 | Y te muestra en la cara si esta a tres dias o si esta vencido hace cinco. |
| `W-BL-A04-6` | MERGE | 1 | 'Nueva Reunion', listado con busqueda, filtros y orden por Fecha/Titulo/Estado/Creacion; estados de reunion (ej. 'Progra |
| `W-BL-A04-7` | MERGE | 1 | Autoguardado del acta de la reunion (ruta /api/meetings/[id]/autosave). |
| `W-BL-A06-1` | MERGE | 1 | El flujo de cinco pasos existe como recorrido coherente: Contexto Transversal -> Plan de Migracion -> Instrumento y cali |
| `W-BL-A06-3` | MERGE | 1 | Aplicacion docente: evidencia por indicador, CON AUTOGUARDADO. |
| `W-BL-A07-3` | MERGE | 1 | 'El ano de implementacion determina el nivel de madurez esperado: Ano 1 Incipiente, Ano 5 Consolidado.' |
| `W-BL-A08-2` | MERGE | 1 | 'GT = 100% transformado desde el inicio' y 'GI por ano' editable: Ano1 10%, Ano2 25%, Ano3 50%, Ano4 75%, Ano5 100%. |
| `W-BL-A08-3` | MERGE | 1 | La matriz GT/GI: nivel por nivel, ano por ano, define si un curso es Generacion Tractor o Generacion Innova. |
| `W-BL-A09-10` | MERGE | 1 | El docente responde la suya, POR CURSO y POR GENERACION. |
| `W-BL-A09-7` | MERGE | 1 | Las acciones de archivar y duplicar funcionan. |
| `W-BL-A09-8` | MERGE | 1 | "Mis Evaluaciones": '3 evaluaciones asignadas', agrupadas POR COMPLETAR / COMPLETADAS, cada una con version (v1.1.0), es |
| `W-BL-A09-9` | MERGE | 1 | La insignia 'Nueva version — el instrumento fue actualizado desde tu ultima evaluacion' y un chip 'Actualizado'. |
| `W-BL-A10-2` | MERGE | 1 | "Expectativa Año 2 GT: Cumple. Nivel esperado: Incipiente." |
| `W-BL-A10-3` | MERGE | 1 | "Indicadores 19/19 sobre la expectativa." |
| `W-BL-A10-5` | MERGE | 1 | "Análisis de Brechas - Año 2, Expectativas GT" con Adelante 15, En camino 4, Atrasado 0, Crítico 0. |
| `W-BL-A10-7` | MERGE | 1 | Tabla de detalle por práctica: "70% Aprendizaje Basado en Proyectos, Avanzado, 5 indicadores" con filas INDICADOR / CATE |
| `W-BL-A11-2` | MERGE | 1 | Encabezado: "Año de transformación: 2 (Nivel esperado: Incipiente)" con botón "Actualizar". |
| `W-BL-A11-3` | MERGE | 1 | Cuatro tarjetas: Promedio General 46% / En Desarrollo; Evaluaciones 3 completadas; Áreas 1 evaluadas; "Cumplen Expectati |
| `W-BL-A11-7` | MERGE | 1 | Alcance: una directora ve solo su propio colegio; un consultor/admin ve los colegios que tiene asignados. |
| `W-BL-A12-2` | MERGE | 1 | Ese indicador pide DOS cosas: un enlace a la evidencia y la respuesta a '¿Con la experiencia adquirida, que mejoras sugi |
| `W-BL-A12-3` | MERGE | 1 | Lo que el profesor aprendio queda escrito en el lugar donde el profesor que llegue el proximo ano lo va a encontrar. |
| `W-BL-A13-2` | MERGE | 1 | Todas las superficies —notificacion, recordatorio, calendario, lista del espacio colaborativo— llevan a esta pantalla, q |
| `W-BL-A14-3` | MERGE | 1 | Cuando un bucket baja del 25 por ciento disponible, la plataforma lo marca en ambar. Nadie se entera en diciembre de que |
| `W-BL-A14-4` | MERGE | 1 | Descargar Reporte PDF y Descargar CSV funcionan y coinciden con la pantalla |
| `W-BL-A14-5` | MERGE | 1 | Lado consultora: horas ejecutadas, penalizadas, total horas, tarifa EUR/h, Total EUR, Total CLP, con TC 897 CLP/EUR actu |
| `W-BL-A14-7` | MERGE | 1 | El libro de horas es el mismo libro que sostiene la rendicion de la Ley SEP |
| `W-BL-A15-4` | MERGE | 1 | Progreso de Usuarios: tabla por usuario con Usuario, Rol, Cursos, Completados, Tasa, Tiempo, Ultima Actividad, y Exporta |
| `W-BL-B02-2` | MERGE | 1 | La ficha de creacion (Numero LIC-2026-SMC-001, Programa, Ano, Correo, Monto min/max UF, Duracion min/max meses, Peso tec |
| `W-BL-B03-4` | MERGE | 1 | 'Proximos Vencimientos (proximos 3 dias habiles): LIC-2026-SMC-001 — Plazo de evaluacion: 22/08/2026 HOY' en rojo. El pr |
| `W-BL-B03-6` | MERGE | 1 | Filtros del listado: Estado, Ano, Programa, checkbox 'Mostrar historicas (licitaciones cerradas)'; columnas NUMERO, NOMB |
| `W-BL-B04-1` | MERGE | 1 | Comision Evaluadora: tres miembros con Nombre (obligatorio), RUT y Cargo; mas Datos de la Reunion (fecha, hora inicio, h |
| `W-BL-B04-2` | MERGE | 1 | Los criterios tecnicos suman cien puntos (experiencia ATE, metodologia, experiencia de profesionales, recursos, evaluaci |
| `W-BL-B05-2` | MERGE | 1 | Cada archivo tiene registrado quien lo subio y cuando. No hay documentos anonimos ni versiones sueltas. |
| `W-BL-B05-3` | MERGE | 1 | PDF, Word o imagen — hasta 25 MB (restriccion mostrada en pantalla). |
| `W-BL-B05-4` | MERGE | 1 | Arriba hay un boton DESCARGAR TODO: baja un ZIP con la licitacion completa, ordenada en las mismas carpetas numeradas. |
| `W-BL-B05-5` | MERGE | 1 | Si manana llega el Ministerio y pide la carpeta de la licitacion 2022, la respuesta es un clic. |
| `W-BL-B06-2` | MERGE | 1 | Se exporta a Excel con diecinueve columnas: la ATE que se adjudico, el monto, el contrato asociado. |
| `W-BL-B06-3` | MERGE | 1 | Cuando cambia la direccion de un colegio, este historial no se va con nadie. Se queda en el colegio. |
| `W-BL-QA-2` | MERGE | 1 | ¿Y si me equivoco al cargar un documento? Queda registrado quien subio que y cuando; se corrige subiendo la version corr |
| `W-BL-SWEEP-MI-APRENDIZAJE-03` | MERGE | 1 | "la formación de cada equipo" — un docente inscrito abre su curso y ve el contenido. |
| `W-BL-SWEEP-MI-APRENDIZAJE-04` | MERGE | 1 | "rutas ... con el avance visible" — la ruta muestra cuánto lleva avanzado cada persona. |
| `W-BL-SWEEP-MI-APRENDIZAJE-07` | MERGE | 1 | "Tiempo Total 50h 45m" y la columna por usuario "Tiempo" del reporte. |
| `W-BL-SWEEP-MI-APRENDIZAJE-08` | MERGE | 1 | Los resúmenes de progreso de rutas se mantienen al día (los cron jobs que agregan el avance). |
| `W-BL-SWEEP-MI-APRENDIZAJE-10` | MERGE | 1 | "45 Total Cursos" en el dashboard de red. |
| `W-BL-SWEEP-MI-APRENDIZAJE-11` | MERGE | 1 | Nav "Mis Tareas — Tareas de todas mis comunidades". |
| `W-BL-SWEEP-MI-APRENDIZAJE-12` | MERGE | 1 | El porcentaje de avance que ve la docente y el que ve la directora son el mismo número. |
| `W-BL-SWEEP-MI-APRENDIZAJE-13` | MERGE | 1 | "Mis Cursos" carga rápido en el hardware antiguo de los colegios. |
| `W-BL-SWEEP-NONFUNCTIONAL-BUNDLE-WEIGHT` | MERGE | 1 | Regla del proyecto (CLAUDE.md): «debe funcionar en hardware escolar antiguo (navegadores de gama baja, pantallas pequeña |
| `W-BL-SWEEP-NONFUNCTIONAL-DEADLINE-ALERTS` | MERGE | 1 | «Notificaciones automáticas de plazos» en licitaciones — panel «Próximos Vencimientos» con marcas HOY / mañana. «Nada se |
| `W-BL-SWEEP-NONFUNCTIONAL-EMAIL-DELIVERABILITY-INFRA` | MERGE | 1 | El correo del resumen de reunión y las alertas de plazo llegan a las casillas institucionales de los ocho colegios. |
| `W-BL-SWEEP-NONFUNCTIONAL-ERROR-SURFACES-REPORTES` | MERGE | 1 | Las pantallas de la Madre Ana María: `/reports` «Resumen General · Acceso Nivel Red» y `/detailed-reports` «Escuelas de  |
| `W-BL-SWEEP-NONFUNCTIONAL-LICITACIONES-ES-CL` | MERGE | 1 | Bloque 5 · «Impecabilidad administrativa»: el módulo de Licitaciones Ley SEP y los documentos oficiales que genera (Base |
| `W-BL-SWEEP-NONFUNCTIONAL-PROD-SECRETS-UNIGNORED` | DOCUMENTATION | 1 | Higiene de secretos: retirar .env.local.prod-backup-20260822 del directorio del repositorio y rotar lo que contenga |
| `W-BL-SWEEP-PRIOR-AUDIT-03` | MERGE | 1 | «las notificaciones de plazo de licitación solo corren cuando un usuario autorizado abre una página de licitaciones» y « |
| `W-BL-SWEEP-PRIOR-AUDIT-08` | MERGE | 1 | «la generación de ZIP devuelve éxito aunque falten archivos, dejando solo _archivos_faltantes.txt en el archivo». |

## D. Aggregate

| | Count |
|---|---|
| Unowned BACKLOG rows | 57 |
| Unowned BLOCKED data rows | 10 |
| Total check-16 failures | 67 |
| Linked claims across the unowned rows (from the audit) | 80, of which 4 unique P0 (A15-2, A15-7, SWEEP-MI-APRENDIZAJE-01, SWEEP-ONBOARDING-DATA-01) |

## E. How to close (operator steps, none executed here)

1. Brent decides triage ownership per area in §C (a name per area is sufficient) and the accountable owner per W-D row in §B.
2. The names are written into `docs/reviews/santa-marta-work-items.csv` (`triage_owner` for BACKLOG rows, `dueno` for the W-D rows) in a documentation-only change, independently reviewed like every ledger edit.
3. `node scripts/check-ledger.mjs` is re-run; the expected result is 0 failures **without** any change to the validator.
4. The W-D operations remain BLOCKED until Brent's separate written authorization; naming an owner is not authorization.


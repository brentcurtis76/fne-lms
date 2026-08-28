# Informe de normalización del ledger — Santa Marta

**Fecha:** 25 de agosto de 2026 · **ronda 2** (incorpora la revisión independiente `REQUEST NORMALIZATION CHANGES`)
**Rama:** `fix/auth-sec2` · **HEAD:** `4b87243cfe846b477fbaa2c6146d4d91048e858b` · **`main`:** `717c2c095021eb9ff71f1873d87b2e926c6f4d9b`
**Alcance:** sólo documentación bajo `docs/reviews/` más un único script validador local. Sin cambios de producto, sin acceso a producción, sin migraciones, sin despliegue, sin cambios de CI, sin dependencias nuevas, sin commits.

Las tres verificaciones de línea base se comprobaron por separado y **las tres coinciden**. El SHA-256 del ledger legacy coincidía con el esperado antes de tocarlo.

---

## 1. Archivos exactos

### Creados

| Ruta | Qué es |
|---|---|
| `docs/reviews/santa-marta-claims.csv` | Registro congelado — 160 reclamaciones |
| `docs/reviews/santa-marta-work-items.csv` | Registro mutable — 104 work items |
| `docs/reviews/santa-marta-work-claim-map.csv` | La unión — 149 pares `work_id,claim_id` |
| `docs/reviews/archive/santa-marta-promise-ledger-legacy-161.md` | Nota de supersesión compañera del CSV archivado |
| `docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md` | Este informe |
| `scripts/check-ledger.mjs` | El validador (único script; local; **no** cableado a CI) |

### Movidos

| Desde | Hacia |
|---|---|
| `docs/reviews/santa-marta-promise-ledger.csv` | `docs/reviews/archive/santa-marta-promise-ledger-legacy-161.csv` |

Movido con `mv`, sin editar. **Contenido idéntico byte por byte** (verificación en §3).

### Modificados

| Ruta | Cambio |
|---|---|
| `docs/reviews/santa-marta-release-protocol-2026-08-25.md` | Reescrito a revisión 4 y corregido a **revisión 5** en ronda 2: bloque `LEDGER-SUMMARY`, taxonomía de migraciones sin `DROP`, B5-pre reescrito, B8b en `BLOCKED`, B1a como propuesta documentada, §7-bis con la descomposición de B9b, y todas las cifras corregidas y ahora verificadas por el validador |
| `docs/reviews/santa-marta-deliverability-audit-2026-08-24.md` | Banner histórico añadido tras el título |
| `docs/reviews/santa-marta-promise-audit-2026-08-24.md` | Banner histórico añadido tras el título |
| `docs/reviews/santa-marta-audit-comparison-2026-08-25.md` | Banner histórico añadido tras el título |
| `docs/reviews/santa-marta-combined-plan-2026-08-25.md` | Banner histórico añadido tras el título |
| `.gitignore` | **Ronda 2, autorizado explícitamente por Brent.** Una negación estrecha, `!docs/reviews/**/*.csv`, insertada bajo la línea 136 (`*.csv`) con tres líneas de comentario. **El bloque de cuatro líneas del dueño del repositorio no se tocó**; sigue verbatim al final del archivo |

### No tocados, a propósito

- `lib/services/school-hours-report.ts` — edición parcial preexistente, ajena a este trabajo. No revertida, no «arreglada».
- El bloque `.env.local.prod-backup-*` / `.env*.backup*` de `.gitignore` — conservado **exactamente** como estaba.

Todo queda como cambios en el árbol de trabajo. **Cero commits.**

---

## 2. Conteos, antes y después

**Reclamaciones y enlaces se etiquetan por separado en todas partes. Un enlace no es una reclamación.**

| Medida | Legacy (161) | Normalizado | Nota |
|---|---:|---:|---|
| **Reclamaciones** (filas) | 161 | **160** | `09a` + `09b` → `09` |
| **Reclamaciones** accionables | 125 | **124** | misma fusión |
| **Reclamaciones** P0 únicas | 37 | **36** | misma fusión |
| **Reclamaciones** no accionables | 36 | 36 | sin cambio |
| Work items | — | **106** | no existían; 104 en ronda 2, +2 en la corrección de gobernanza §12 (`W-B2c-01`, `W-PC-06`) |
| Lotes de fusión distintos | — | **27** | lista canónica completa; 26 en ronda 2, +`B2c` en §12 |
| **Enlaces** reclamación↔trabajo | — | **151** | 149 en ronda 2; −1 +3 en §12 |
| **Enlaces** P0 reclamación↔trabajo | — | **58** | ≠ 36; nunca se intercambian; 56 en ronda 2 |
| **Reclamaciones** P0 únicas alcanzadas por esos enlaces | — | **36** | las 36 tienen al menos un enlace |

### Work items por modo y por estado (tras la corrección §12)

| Modo | | Estado | |
|---|---:|---|---:|
| `MERGE` | 89 | `SCHEDULED` | 29 |
| `DATA` | 10 | `BACKLOG` | 57 |
| `PRODUCTION_CHECK` | 6 | `BLOCKED` | 18 |
| `DOCUMENTATION` | 1 | `ACTIVE` / `DONE` | 0 / 2 |

### Los tres números de propiedad, más la línea de excepción

| | |
|---|---:|
| **Work items** sin dueño *(excluida la excepción `PRODUCTION_CHECK`)* | **67** |
| **Reclamaciones** únicas enlazadas a esos work items | **80** |
| **Reclamaciones P0** únicas enlazadas a esos work items | **4** |
| *Excepción:* `PRODUCTION_CHECK` con `dueno` vacío **a propósito** | 6 |

Las 80 son las 82 filas accionables sin anotación de dueño del ledger legacy menos las dos que la ronda 2 movió a work items con dueño (`SWEEP-PRIOR-AUDIT-05` y `SWEEP-ONBOARDING-DATA-06`); las 4 P0 son las cuatro nombradas: `SWEEP-MI-APRENDIZAJE-01`, `A15-2`, `A15-7`, `SWEEP-ONBOARDING-DATA-01`.

Que 67 work items produzcan 80 reclamaciones y no 80 work items es exactamente lo que se advirtió: **varias reclamaciones mapean a una sola remediación**. No se consolidó nada para achicar el déficit, y no se inventó ni un dueño para que el validador pasara.

---

## 3. Conservación

### Bytes

```
esperado: 009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9
obtenido: 009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9
```

**Coinciden.** El validador lee la línea base desde `docs/reviews/archive/santa-marta-promise-ledger-legacy-161.csv` y comprueba ese hash en cada corrida. La nota de supersesión vive en un `.md` aparte precisamente para no tocar el CSV: una fila de comentario habría corrompido el artefacto forense, alterado el conteo de filas y roto el parseo.

### Identidades

161 ids legacy. **Una sola transformación, declarada explícitamente en el script** (`PERMITTED_ID_TRANSFORM`):

```
SWEEP-PRIOR-AUDIT-09a  +  SWEEP-PRIOR-AUDIT-09b   →   SWEEP-PRIOR-AUDIT-09
```

que mapea a **exactamente tres work items de remediación** (`W-B2b-01`, `W-B2c-01`, `W-B10a-01`) desde la corrección de gobernanza del 2026-08-27 (§12); en las rondas 1–2 eran dos (`W-B2b-01`, `W-B10a-01`). El validador comprueba las cuatro cosas por separado: ninguna otra id desaparece, ninguna cambia de identidad, ninguna se inventa, y la canónica mapea a tres. `W-PC-06` **no** cuenta aquí: es una dependencia de evidencia (`PRODUCTION_CHECK`), no una remediación, y mapea por separado a `SWEEP-MI-APRENDIZAJE-09`.

**Ninguna otra id se movió.** Las otras 159 reclamaciones conservan su id y su `claim_text` **verbatim** — comprobado carácter a carácter contra el archivo archivado, junto con `bloque`, `estado`, `severidad`, `verificacion`, `evidencia_prod` y `autoridad_aceptacion`: **cero diferencias**.

### La única síntesis de texto permitida

| | Texto |
|---|---|
| **`09a` original** | RLS grupo A — 14 tablas legacy SIN referencias en código (cierre mecánico REVOKE+ENABLE) |
| **`09b` original** | RLS grupo B — 8 tablas legacy REFERENCIADAS (requieren diseño de política) |
| **Canónico** | RLS legacy alcanzable con la clave anon: veintidós tablas de public sin row level security — catorce sin referencias en código (cierre mecánico REVOKE + ENABLE) y ocho referenciadas que requieren diseño de política. |

El texto canónico enuncia **el hallazgo original completo** — las 22 tablas —, no una fase en aislamiento. La redacción por fase vive donde corresponde, en los work items:

| Work item | Lote | Rama | Fase |
|---|---|---|---|
| `W-B2b-01` | B2b | `fix/rls-anon` | Grupo A: cierre mecánico `REVOKE` + `ENABLE` sobre exactamente las 14 tablas sin referencias |
| `W-B2c-01` | B2c | `fix/rls-learn` | Frontera de rutas de aprendizaje: `learning_paths`, `learning_path_courses` y sus seis funciones (**BLOCKED**; añadida en §12) |
| `W-B10a-01` | B10a | `fix/rls-grupo-b` | Grupo B: diseño de política para las 6 tablas referenciadas restantes |

El hallazgo histórico de la reclamación —**14 tablas sin referencias + 8 referenciadas = 22**— se conserva intacto en el `claim_text` congelado; las ocho referenciadas se remedian hoy como **2** (frontera B2c) **+ 6** (grupo B).

Ningún otro `claim_text` fue sintetizado. `firmado_por` y `fecha_firma` están vacías en las 160.

---

## 4. Derivación de los work items

> **Este ledger de trabajo es una normalización *propuesta*, no un resultado probado mecánicamente.** Los 27 lotes de fusión (26 en ronda 2; `B2c` se añadió en la corrección §12) están determinados por la lista canónica y por el `lote` del ledger legacy. La descomposición del carril de datos, los **cinco** splits y las **siete** consolidaciones son **juicios** que un revisor debe confirmar.

### Regla aplicada

Un work item es **una raíz / un cambio de código**. Reclamaciones del mismo lote se consolidan **sólo** cuando su evidencia nombra la misma raíz; se separan cuando nombran raíces distintas, aunque viajen en la misma rama. Compartir `lote` o `rama` es programación compartida, no remediación compartida.

### Consolidaciones (7) — varias reclamaciones, una remediación

| Work item | Reclamaciones | Justificación |
|---|---|---|
| `W-B1b-01` | `A14-1` + `SWEEP-PRIOR-AUDIT-01` | Misma raíz exacta: `contratos.is_annexo` → `is_anexo`. Una corrección de una línea, ya commiteada en `fix/horas-rep` (PR #50) |
| `W-B2a-01` | `A15-1` + `SWEEP-PRIOR-AUDIT-04` | El plan combinado §0.3 nombra una sola remediación: `name` → `nombre` en `supervisors.ts` con comprobación de error |
| ~~`W-B2b-01`~~ → `W-B2c-01` | `SWEEP-MI-APRENDIZAJE-09` + `SWEEP-PRIOR-AUDIT-09` | La ronda 2 consolidó ambas en `W-B2b-01` porque el plan combinado §0.4 plegaba `learning_paths` y `learning_path_courses` dentro del grupo A. **Corrección §12 (2026-08-27):** esa consolidación queda superada; las dos reclamaciones convergen ahora en la frontera `W-B2c-01`, `W-B2b-01` conserva solo `SWEEP-PRIOR-AUDIT-09`, y `SWEEP-PRIOR-AUDIT-09` mapea además a `W-B10a-01` |
| `W-B5-01` | `A09-6` + `A12-4` | Misma raíz: la sobrescritura in-place de `snapshot_data` y `version` en diez sitios de llamada |
| `W-B6d-01` | `SWEEP-MI-APRENDIZAJE-05` + `SWEEP-ONBOARDING-DATA-06` | **Ronda 2.** Ambas señalan las mismas tres relaciones de resumen creadas por `seed-sm/60-lms.ts:641-712`. Estaban separadas sólo por conservar la programación legacy |
| `W-D-04` | `A07-1` + `A07-2` + `A12-5` + `SWEEP-ONBOARDING-DATA-01` + `SWEEP-ONBOARDING-DATA-05` | **Ronda 2.** `ONBOARDING-DATA-05` (catálogo `ab_grades`) es el mismo carril de contexto transversal, y como item suelto llevaba clase 0 sin compuerta ni plan de restauración — incorrecto para una escritura de datos |
| `W-B6c-03` | `SWEEP-PRIOR-AUDIT-05` | **Ronda 2.** Deja de tener item de backlog propio: el plan §2.3 lo pliega en `fix/net-tabs` y ahora se sigue el plan |

### Splits (5) — un lote, varias remediaciones

| Lote | Work items | Justificación |
|---|---|---|
| **B3a** | `W-B3a-01` (políticas RLS, clase 2) · `W-B3a-02` (propagación de errores, clase 0) · `W-B3a-03` (campos obligatorios, clase 0) | El plan combinado los enumera como **tres filas numeradas distintas** (§1.1, §1.2, §1.3) con tres raíces distintas: falta la política / se descarta el error / no se valida |
| **B3b** | `W-B3b-01` (verdad del envío) · `W-B3b-02` (contrato de `EMAIL_FROM_ADDRESS`) | Dos raíces: una descarta el resultado del envío, la otra hace inválido el remitente para uno de los dos consumidores |
| **B1c** | `W-B1c-01` (compuerta de envío en `submit.ts`) · `W-B1c-02` (puntuación de la práctica cerrada) | **Ronda 2.** Compartir rama no es compartir remediación (regla 1). `SWEEP-PRIOR-AUDIT-02` dice que la rama «contiene ambas correcciones»: son dos |
| **B6c** | `W-B6c-01` (consulta de rol) · `W-B6c-02` (cliente anon en el servidor) · `W-B6c-03` (`schools.community_id`) | **Ronda 2.** Tres raíces distintas, una de ellas de **seguridad**; el plan §2.3 las ponía en una sola fila |
| **B9b** | 10 work items `DATA` | Ver abajo |

### Unidades añadidas (3)

| Unidad | Por qué faltaba |
|---|---|
| `W-B2b-01` (`09a`) | Existía como fila de ledger pero sin work item propio |
| `W-B10a-01` (`09b`) | Ídem — y es la segunda fase de **una** reclamación, no una segunda reclamación |
| `W-B3c-01` (B3c) | **El defecto espejo:** existía en la prosa del protocolo §3 **sin fila en el ledger**. Es el `NOT NULL` sobre `due_date` tras backfill, clase 3, sobre la reclamación `A04-3` |

### La descomposición de B9b — **10 work items `DATA`**

`B9b` no es un lote de fusión. En el ledger legacy era **una sola etiqueta sobre 22 reclamaciones**.

| Work item | Carril |
|---|---|
| `W-D-01` | Filas de `programas` |
| `W-D-02` | Alta de ~200 cuentas |
| `W-D-03` | Los ocho colegios y sus vínculos `red_escuelas` |
| `W-D-04` | Contexto transversal por colegio — catálogo `ab_grades`, niveles y cursos por nivel |
| `W-D-05` | Comunidades y miembros |
| `W-D-06` | Contratos y *buckets* de horas |
| `W-D-07` | Histórico de licitaciones y documentos |
| `W-D-08` | Asignaciones docente–curso |
| `W-D-09` | **Añadido** — contenido LMS: rutas, cursos, módulos, lecciones, inscripciones |
| `W-D-10` | **Añadido** — instrumento publicado v1.1.0 con objetivos, indicadores y expectativas |

Ocho carriles vienen del plan combinado §7. **Los dos últimos se añaden**: `SWEEP-MI-APRENDIZAJE-01` (P0) señala que lo único que crea el contenido de aprendizaje de Santa Marta es el árbol **no versionado** `scripts/demo/seed-sm/`, y ni ese contenido ni el instrumento publicado (`A09-1`, `A09-5`) caben en ninguno de los ocho.

### Casos en que no pude decidir — registrados, no elegidos en silencio

1. ~~**B1c contiene dos correcciones, y se dejó como un solo work item.**~~ **RESUELTO en ronda 2: separado.** El argumento para mantenerlo unido era que ambas correcciones ya viajan en la misma rama; pero la regla 1 dice literalmente que compartir `lote` o `rama` no justifica consolidar, y `SWEEP-PRIOR-AUDIT-02` nombra dos correcciones. La regla gana.
2. ~~**B6c agrupa tres componentes de raíz distinta.**~~ **RESUELTO en ronda 2: separado en tres.** Una de las tres es una raíz de seguridad (cliente `anon` construido en el servidor) y merecía su propia unidad, su propia compuerta y su propia firma.
3. **No se consolidó ningún par del backlog.** 57 reclamaciones de backlog → 57 work items, uno a uno. Los artefactos no establecen raíces compartidas entre ellas, y consolidar habría achicado el déficit de propiedad sin evidencia. Un revisor con más contexto puede unir algunas. *(La ronda 2 sí retiró tres del backlog, pero por solapamiento con work items existentes, no por consolidación entre pares de backlog.)*

---

## 5. `claim_kind`

Provenance nueva, derivada de leer las **17 láminas** del Bloque 4, las **9** del Bloque 5 y las **27 páginas** del guión de sala.

**El hallazgo que hizo esto verificable:** los códigos `bloque` del ledger legacy (`B4 A02`, `B5 B04-B08`, …) usan el mismo esquema que el guión, y en el guión **`A·NN` / `B·NN` corresponde exactamente a la lámina NN** de su deck (`A·01 @0:00` = lámina 1 … `A·17 @27:10` = lámina 17; `B·01` … `B·09`). Cada `classification_basis` explícito lleva número de lámina **y** localizador del guión con su marca de tiempo.

Regla auxiliar, tomada de la fuente: el guión p. 1 declara la **REGLA DE HONESTIDAD** — «Todas las capturas son pantallas reales del entorno demo».

**Corregida en ronda 2.** La revisión 4 leía esa regla como si acreditara todo lo que una fila afirmase sobre un elemento visible. No es así: **una captura acredita que el elemento EXISTE, no que FUNCIONE.** Siete filas que afirmaban función más allá de lo mostrado o dicho pasaron de `EXPLICIT_PROMISE` a `IMPLIED_COMMITMENT`: `A03-4`, `A03-6`, `A09-7`, `A14-4`, `A10-8`, `SWEEP-MI-APRENDIZAJE-03` y `SWEEP-MI-APRENDIZAJE-04`. Se auditaron los hermanos del mismo patrón: `A09-11`, `A14-7` y `A15-7` afirman función **verbatim** en el guión y se mantienen explícitas.

| `claim_kind` | Filas |
|---|---:|
| `EXPLICIT_PROMISE` | 120 |
| `AUDIT_FINDING` | 17 |
| `OPERATIONAL_PRECONDITION` | 8 |
| `IMPLIED_COMMITMENT` | 14 |
| `REVIEW_REQUIRED` | **1** |

### La única fila `REVIEW_REQUIRED`

**`A04-7` — «Autoguardado del acta de la reunión (ruta `/api/meetings/[id]/autosave`).»**

No hay localizador. Ni las 17 láminas del Bloque 4 ni las 27 páginas del guión mencionan autoguardado del **acta de reunión**. El único autoguardado enunciado es el de la **aplicación docente** (lámina 6, paso 04 «Evidencia por indicador, con autoguardado»; guión `A·06 @8:20`), que es otra superficie. Falta determinar si la fila proviene de una demo en vivo no recogida en el guión o de una inferencia del auditor sobre el código. **No se adivinó para satisfacer el enum.**

### Correcciones de localizador (no de clasificación)

Varias filas llevaban en `bloque` una lámina que no es donde vive su evidencia; el `classification_basis` sigue a la evidencia y lo hace constar. `SWEEP-MI-APRENDIZAJE-05/06/07/10` citan cifras de la lámina 15 (dashboard de red) aunque el legacy las archivaba bajo `B4 A02`; `A15-8` es contenido de la lámina 16; `A09-6` se enuncia en la lámina 12.

**Añadidas en ronda 2**, las tres que la revisión independiente encontró mal localizadas:

| Fila | Localizador de la revisión 4 | Localizador correcto |
|---|---|---|
| `SWEEP-MI-APRENDIZAJE-01` | sólo lámina 2 / `A·02` | + `A·01 @0:00` para la mitad de calendario y audiencia («ustedes van a entrar la próxima semana»), que la lámina 2 no dice |
| `A05-6` | lámina 5 / `A·05` | lámina 13 / `A·13 @20:40`: «Después de la sesión, el consultor marca la asistencia y escribe su informe». `A·05` no menciona ni asistencia ni informe |
| `A12-5` | lámina 12 / `A·12` | guión p. 27, Q&A «¿Y si una directora llega nueva a mitad de año?» — la respuesta compuesta es de ahí, no de la lámina |

---

## 6. Salida real del validador (ronda 2 — histórica; la corrida vigente tras la corrección B2b/B2c está en §12)

`node scripts/check-ledger.mjs` — **código de salida 1**. Sin suprimir, sin editar los datos para ponerlo en verde. Ésta es la salida de la **ronda 2**, con el validador ya endurecido y **antes** de la corrección de gobernanza del 2026-08-27.

```
santa-marta ledger check
========================================================================

CIFRAS
  reclamaciones congeladas                 160
  reclamaciones P0 únicas                  36
  work items                               104
  enlaces reclamación↔trabajo              149
  enlaces P0 reclamación↔trabajo           56
  reclamaciones P0 únicas con enlace       36
  lotes de fusión distintos                26

WORK ITEMS POR MODO
  MERGE              88
  DATA               10
  PRODUCTION_CHECK   5
  DOCUMENTATION      1

PROPIEDAD (tres números distintos, nunca fusionados)
  work items sin dueño (excluida la excepción PRODUCTION_CHECK)   67
  reclamaciones únicas enlazadas a esos work items                80
  reclamaciones P0 únicas enlazadas a esos work items             4
  excepción PRODUCTION_CHECK: dueno vacío a propósito             5
    P0 sin dueño: A15-2, A15-7, SWEEP-MI-APRENDIZAJE-01, SWEEP-ONBOARDING-DATA-01

  · conservación de bytes OK — SHA-256 009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9
  · conservación de ids OK — 161 ids legacy, transformación declarada SWEEP-PRIOR-AUDIT-09a + SWEEP-PRIOR-AUDIT-09b → SWEEP-PRIOR-AUDIT-09

FALLOS: 67
------------------------------------------------------------------------
[16 propiedad] 67
  ✗ W-BL-A03-5 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A03-6 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A04-4 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A04-6 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A04-7 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A06-1 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A06-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A07-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A08-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A08-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A09-10 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A09-7 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A09-8 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A09-9 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A10-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A10-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A10-5 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A10-7 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A11-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A11-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A11-7 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A12-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A12-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A13-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A14-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A14-4 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A14-5 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A14-7 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-A15-4 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B02-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B03-4 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B03-6 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B04-1 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B04-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B05-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B05-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B05-4 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B05-5 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B06-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-B06-3 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-QA-2 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-MI-APRENDIZAJE-03 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-MI-APRENDIZAJE-04 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-MI-APRENDIZAJE-07 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-MI-APRENDIZAJE-08 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-MI-APRENDIZAJE-10 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-MI-APRENDIZAJE-11 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-MI-APRENDIZAJE-12 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-MI-APRENDIZAJE-13 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-NONFUNCTIONAL-BUNDLE-WEIGHT (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-NONFUNCTIONAL-DEADLINE-ALERTS (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-NONFUNCTIONAL-EMAIL-DELIVERABILITY-INFRA (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-NONFUNCTIONAL-ERROR-SURFACES-REPORTES (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-NONFUNCTIONAL-LICITACIONES-ES-CL (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-NONFUNCTIONAL-PROD-SECRETS-UNIGNORED (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-PRIOR-AUDIT-03 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-BL-SWEEP-PRIOR-AUDIT-08 (BACKLOG): sin dueno real y sin triage_owner nombrado
  ✗ W-D-01 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-02 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-03 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-04 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-05 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-06 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-07 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-08 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-09 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
  ✗ W-D-10 (BLOCKED): enlazado a una reclamación P0 y sin dueno real («»)
```

### Cómo leer estos 67 fallos

**Los 67 son la deuda de propiedad, y son correctos.** No hay ni un fallo de conteo, identidad, referencia, esquema, enum, provenance, lote, rama, conservación ni reconciliación. Los 67 son la misma cosa dicha 67 veces: **nadie es dueño de este trabajo**.

- **57** son items de backlog sin `dueno` **ni** `triage_owner`. El plan combinado §0.6 —«nombrar los cuatro dueños»— nunca se hizo, así que no hay a quién nombrar sin inventarlo.
- **10** son los carriles de datos, y fallan por la regla más dura: **están enlazados a una reclamación P0 y no tienen dueño real**. `SIN ASIGNAR — BLOQUEANTE` no es un dueño y el modelo normalizado ya no lo acepta como tal.

**Los cinco `PRODUCTION_CHECK` no fallan**, y eso también es correcto: la excepción de modo está implementada y probada en vivo — los cinco están enlazados a reclamaciones P0, los cinco tienen `dueno` vacío, y ninguno produce un fallo de propiedad. Siguen bloqueando la activación por su `authorization_status`, que es otra cosa.

El validador pasa a verde en cuanto alguien con autoridad nombre dueños reales. Ni un dato se editó para adelantar eso.

---

## 7. Propiedad pendiente y las seis comprobaciones de producción

### Asignaciones de propiedad que bloquean

| Qué | Cuántos | Qué desbloquea |
|---|---:|---|
| **Dueño real** para los 10 carriles `DATA` | 10 | Las 4 reclamaciones P0 sin dueño. Ninguna se cierra escribiendo código |
| **`triage_owner`** nombrado para los 57 items de backlog | 57 | El resto del déficit; un `triage_owner` basta mientras el item siga en `BACKLOG` |

### Las seis comprobaciones — **ninguna autorizada, ninguna ejecutada**

**Ninguna se realizó.** No se consultó producción de ninguna forma, ni siquiera de solo lectura, y no se usó ninguna herramienta MCP de Supabase.

| Work item | Comprobación | `authorization_owner` | `execution_owner` | `authorization_status` | `status` | `dueno` |
|---|---|---|---|---|---|---|
| `W-PC-01` | Filas de `feriados_chile` 2026–2027 | Brent | *(vacío)* | `UNAUTHORIZED` | `BLOCKED` | *(vacío — excepción)* |
| `W-PC-02` | Red Santa Marta y sus ocho `red_escuelas` | Brent | *(vacío)* | `UNAUTHORIZED` | `BLOCKED` | *(vacío — excepción)* |
| `W-PC-03` | Dominio remitente verificado en Resend | Brent | *(vacío)* | `UNAUTHORIZED` | `BLOCKED` | *(vacío — excepción)* |
| `W-PC-04` | Bucket `community-images` | Brent | *(vacío)* | `UNAUTHORIZED` | `BLOCKED` | *(vacío — excepción)* |
| `W-PC-05` | **B5-pre** — instancias en riesgo, estratificadas | Brent | *(vacío)* | `UNAUTHORIZED` | `BLOCKED` | *(vacío — excepción)* |
| `W-PC-06` | Clasificación de datos de rutas de aprendizaje *(añadida en §12; decide el backfill y la clase de B2c)* | Brent | *(vacío)* | `UNAUTHORIZED` | `BLOCKED` | *(vacío — excepción)* |

**Autorización y ejecución son preguntas distintas y nunca se reutiliza una como la otra.** `authorization_owner = Brent` sale del protocolo, que dice que la actividad contra producción «se autoriza por separado y explícitamente, y sólo por Brent» — no es un nombre inventado. `execution_owner` está vacío porque **no hay ejecutor asignado**; eso bloquea la programación y no es permiso para inventar un nombre. El validador comprueba las dos reglas: `UNAUTHORIZED` exige `status = BLOCKED`, y `AUTHORIZED` + `SCHEDULED` exige `execution_owner` poblado.

`W-PC-01` además decide `clase_migracion` de `W-B8b-01`: vacía → clase 1; poblada → clase 3.

`W-PC-06` (añadida en §12) decide la vía de `W-B2c-01`: si la clasificación no encuentra filas que exijan transformación, B2c podrá clasificarse después como clase 2; si se requiere backfill o reparación, se define y autoriza por separado un work item y lote de clase 3 antes de programar B2c. **No es una remediación**: es una dependencia de evidencia y mapea a `SWEEP-MI-APRENDIZAJE-09` sin contar como su remediación. Documentarla no autoriza ninguna consulta a producción.

---

## 8. Lenguaje de conteo en el protocolo activo

**Confirmado: no queda lenguaje contradictorio en tiempo presente** en `santa-marta-release-protocol-2026-08-25.md`.

Corregido:

| Antes | Ahora |
|---|---|
| «161 filas» | 160 reclamaciones |
| «La cola operativa P0 es 37, no 36» | 36 reclamaciones P0 únicas · 56 enlaces P0 · nunca intercambiados |
| «134 de 161 filas tienen verificación de un solo agente» | 106 de 160 con verificación de un solo agente, 28 de una lente, 27 de dos |
| «`firmado_por` y `fecha_firma` vacías en las 161 filas» | vacías en las 160 |
| Clase 2 incluía `DROP POLICY` | `DROP` retirado de la taxonomía y de todo el documento; compensación con migración aditiva, `ALTER POLICY`, `RESTRICTIVE` o restauración de `GRANT` |
| B8b «1 ó 3 — sin resolver» | `clase_migracion = BLOCKED` hasta `W-PC-01` |
| «Los 26 lotes … salen del ledger» | «reconciliados contra los ledgers por `scripts/check-ledger.mjs`» |

El único `37` que sobrevive está en el bloque marcado como **nota histórica**, explicando por qué la revisión 3 lo tenía mal. El validador comprueba esto activamente: falla si una línea no marcada como histórica presenta un número distinto de 36 como «reclamaciones P0», si conserva literales obsoletos, si propone cualquier `DROP`, o si falta la frase de reconciliación.

Cambios adicionales al protocolo exigidos y hechos:

- **B5-pre reescrito.** Condición primaria `snapshot_data.last_updated_at > assigned_at`, porque la promesa de sellado empieza en la asignación. Cuatro bandas: modificado tras **asignación**, **inicio**, **primera respuesta**, **completitud**. El límite se enuncia como **«no recuperable desde las tablas actuales»**, pendiente de comprobar respaldos/PITR de Supabase, exportaciones, semillas comprometidas e informes externos — **no** se dice que el dato se perdió. El diseño basado en detectar discrepancia de versión queda declarado incontestable y no reinstaurable.
- **B5 sigue en clase 0.**
- **B1a**: session replay a `0`/`0` como **propuesta documentada, no aplicada**, y se declara que la aprobación amplia de privacidad es una decisión **separada y todavía abierta**.
- **`.gitignore`**: se reafirma que el cambio está autorizado por el dueño del repositorio y no se revierte.

---

## 9. Discrepancias sin resolver

### 9.1 — ~~BLOQUEANTE: los cuatro CSV están ignorados por git~~ — RESUELTO en ronda 2

`.gitignore:136` (`*.csv`) ocultaba a git los cuatro CSV del ledger, incluido el legacy archivado. Un registro congelado que git no puede ver no está congelado: no tiene historia, no tiene revisión y se pierde con el directorio de trabajo.

**Brent autorizó explícitamente la negación estrecha**, y es el único cambio de este trabajo fuera de `docs/reviews/` y del validador. Se añadió bajo la línea `*.csv`:

```
!docs/reviews/**/*.csv
```

Verificado por ambos lados:

| Ruta | Antes | Ahora |
|---|---|---|
| `docs/reviews/santa-marta-claims.csv` | ignorada | **visible** |
| `docs/reviews/santa-marta-work-items.csv` | ignorada | **visible** |
| `docs/reviews/santa-marta-work-claim-map.csv` | ignorada | **visible** |
| `docs/reviews/archive/santa-marta-promise-ledger-legacy-161.csv` | ignorada | **visible** |
| *control:* un `.csv` fuera de `docs/reviews/` | ignorada | **sigue ignorada** |

El control negativo importa: la negación es un glob acotado a `docs/reviews/`, no una excepción general a `*.csv`. Ningún otro CSV del repositorio —presente o futuro— queda expuesto.

**El bloque de cuatro líneas del dueño del repositorio no se tocó.** El diff de `.gitignore` tiene exactamente dos *hunks*: esta adición, y el bloque preexistente que sigue sin comprometer.

### 9.2 — El enum `delivery_mode` no expresa «ruta de entrega sin decidir»

58 defectos de código de backlog son `MERGE`, y `MERGE` exige exactamente una `rama` no vacía. No hay rama asignada para ellos en ninguna fuente. Se les asignó **un slug propuesto de ≤20 caracteres**, marcado en `notes` como «rama propuesta … no existe en el repositorio y no tiene commits».

Esto es consistente con la convención que el propio protocolo ya usaba —**23 de las 26 ramas canónicas tampoco existen**; sólo `fix/horas-rep`, `fix/gate-score` y `fix/auth-sec2` tienen commits *(inventario medido en la ronda 2; el inventario vigente está en §12.7 — hoy las ramas de lote vivas en el remoto son tres, `fix/horas-rep`, `fix/gate-score` y `fix/red-super`, y `fix/auth-sec2` sobrevive sólo como copia congelada `4b87243c`)*—, pero conviene decirlo: **58 nombres de rama de este ledger son propuestas mías, no artefactos de las fuentes.**

Relacionado: `SWEEP-NONFUNCTIONAL-PROD-SECRETS-UNIGNORED` quedó como `DOCUMENTATION` porque su trabajo restante —sacar un archivo del directorio y rotar credenciales— es **operativo**, y el enum no tiene un modo operativo. `DOCUMENTATION` es el valor más cercano y no es exacto.

### 9.3 — El plan combinado y el protocolo se contradicen sobre A05-1

El **plan combinado §1.6** dice literalmente «una causa, tres síntomas (A05-1 / A05-2 / A05-6)» y los agrupa en `fix/consultor`. El **protocolo rev 3** los separa: `A05-1` en B4a (`fix/sess-route`) y `A05-2`/`A05-6` en B4c (`fix/attendees`).

**Se siguió el protocolo**, por dos razones que conviene poder discutir: es el documento gobernante activo, y los hallazgos verificados describen dos raíces distintas — `WorkspaceSessionsTab` enruta a una superficie acotada a `consultor|admin|lider_comunidad` (un problema de enrutado), mientras que el trigger de asistentes dispara sobre la tabla equivocada (un problema de backfill). **No es una elección obvia y un revisor puede volverla del otro lado.**

### 9.4 — Dos remediaciones del plan combinado siguen sin lote canónico

| Del plan | Reclamación | Estado en esta normalización |
|---|---|---|
| §2.9 `fix/zip-full` (completitud del ZIP) | `SWEEP-PRIOR-AUDIT-08` | Backlog. La rama **no está** entre los 26 lotes canónicos |
| §5 *outbox* durable de correo | `SWEEP-NONFUNCTIONAL-EMAIL-DELIVERABILITY-INFRA` | Backlog; sin lote |

La lista canónica de 26 lotes es fija y no los incluye. **No se rescató ninguno a un lote**, para no reprogramar en silencio.

*(El tercer caso —§2.3 (c) `schools.community_id` / `SWEEP-PRIOR-AUDIT-05`— **se resolvió en ronda 2** a favor del plan: es ahora `W-B6c-03`, dentro de B6c, y ya no tiene item de backlog.)*

### 9.5 — ~~Solapamiento entre `W-B6d-01` y `W-BL-SWEEP-ONBOARDING-DATA-06`~~ — RESUELTO

**Fusionado en ronda 2.** Las dos apuntaban a las mismas tres relaciones de resumen creadas por `scripts/demo/seed-sm/60-lms.ts:641-712`; estaban separadas sólo por conservar la programación del ledger legacy. `SWEEP-ONBOARDING-DATA-06` mapea ahora a `W-B6d-01` y deja de tener item de backlog. Igual con `SWEEP-ONBOARDING-DATA-05`, que se fusionó en `W-D-04` y de paso heredó la clase 3 y el plan de restauración que como item suelto le faltaban.

### 9.6 — La columna `archivo` del ledger legacy está truncada

Las **161** filas tienen `archivo` recortado a 180–181 caracteres. Es un extracto, no la evidencia completa; ésa vive en los dos informes narrativos. La columna **no se traslada** al esquema de reclamaciones —el esquema especificado no la incluye—, así que su contenido alimenta `classification_basis` en las filas `AUDIT_FINDING` y por lo demás queda sólo en el archivo. Lo mismo con `esfuerzo`, que tampoco tiene columna destino.

### 9.7 — Estado de despliegue no verificado

`main` en `717c2c09` es la línea base **que se cree** corresponde a la presentación del 22 de agosto. **No está verificado de forma independiente**: un `main` sin cambios no prueba que un despliegue tuviera éxito, ni que la configuración y los datos de producción coincidan con él. Nada de este trabajo lo comprueba, y nada podía hacerlo dentro del alcance autorizado.

### 9.8 — Precisión de citas

En la muestra desafiada de forma adversarial, **1 de cada 4 hallazgos** traía al menos una cita `archivo:línea` imprecisa, aunque el defecto de fondo fuera real. Este informe **no re-verificó** las citas heredadas: la instrucción exime de re-derivar los hallazgos de defectos. Los localizadores que sí verifiqué de primera mano son los de **presentación** (láminas y guión), porque asignar `claim_kind` era trabajo analítico nuevo. **Verificar la cita de código antes de tocar cualquier archivo.**

---

## 10. Ronda 2 — respuesta a la revisión independiente

La revisión devolvió `REQUEST NORMALIZATION CHANGES`. **Verifiqué cada hallazgo objetivo contra los datos antes de tocar nada**, y todos los comprobables resultaron correctos. Uno estaba, además, subestimado.

### 10.1 Reconciliación del protocolo — el fallo más grave

| Cifra | Revisión 4 decía | Los ledgers decían |
|---|---:|---:|
| `SCHEDULED` | 29 | **28** |
| `BLOCKED` | 15 | **16** |
| Verificación a dos lentes | 27 | **26** |

Las dos primeras venían de haber **afirmado** el reparto de estados en vez de calcularlo: B8b está en `BLOCKED` por su clase de migración indeterminada, y no lo resté de `SCHEDULED`. La tercera venía de arrastrar el 27 del ledger legacy sin restar la fila que la fusión `09a`+`09b` eliminó — y las dos filas fusionadas eran precisamente `2-lens`.

**El hallazgo subestimado.** La revisión señaló que seis reclamaciones P0 `BROKEN` están a una sola lente, contra la afirmación del protocolo de que «las P0 están a dos lentes o son condicionales triviales». Es peor: **15 de las 36 P0 no llegan a dos lentes** — las seis `BROKEN` a una lente que la revisión nombró, más **nueve `CONDITIONAL` verificadas por un solo agente**. La frase era falsa en un grado mayor del señalado, y ahora el protocolo dice la verdad y el validador la comprueba.

Y la consecuencia que la revisión sacó bien: mientras eso fuera posible, la frase «todas las cifras están reconciliadas por el validador» era **falsa**. La corrección no fue debilitar la frase, sino hacerla verdadera endureciendo el validador.

### 10.2 Defectos del validador — los cuatro confirmados y corregidos

| Defecto | Qué pasaba | Corrección |
|---|---|---|
| Reconciliación superficial | Sólo comparaba el bloque JSON; la prosa activa podía contradecir los ledgers y pasar | Nuevo grupo `14 reconciliación`: comprueba **cada** conteo de estado, de modo de entrega y de verificación contra los ledgers, exige que aparezcan en la prosa, y falla si el protocolo afirma una profundidad de verificación P0 que los datos no sostienen |
| `PRODUCTION_CHECK` con marcador | Sólo rechazaba un dueño *real*; un `SIN ASIGNAR` en `dueno` pasaba en silencio | Ahora exige `dueno` **estrictamente vacío**. Un marcador no es «sin dueño»: es un campo sin rellenar disfrazado de uno |
| `DONE` antes que P0 | `if (status === 'DONE') continue;` se evaluaba **antes** de la regla P0, así que un item P0 marcado `DONE` escapaba a «requiere dueño real *con independencia del estado*» | La regla P0 se evalúa primero. Latente hoy —no hay items `DONE`— y armado para el día que lo haya |
| Enums incompletos | `estado`, `severidad` y `verificacion` de las reclamaciones no se validaban | Los tres validados contra su dominio |

**Prueba de que el endurecimiento funciona:** al correr el validador ya endurecido contra el protocolo *todavía sin corregir*, emitió **nueve fallos de reconciliación** — exactamente los dos que la revisión encontró a mano, más el de profundidad P0, más los seis restantes que nadie había mirado. El validador ahora habría atrapado el defecto que motivó esta ronda.

### 10.3 Clasificaciones corregidas (10 filas)

La causa raíz fue mía: leí la **REGLA DE HONESTIDAD** del guión como si acreditara todo lo que una fila afirmase sobre un elemento visible en una captura. Una captura acredita que el elemento **existe**, no que **funcione**.

- **7 filas** `EXPLICIT_PROMISE` → `IMPLIED_COMMITMENT`: `A03-4`, `A03-6`, `A09-7`, `A14-4`, `A10-8`, `SWEEP-MI-APRENDIZAJE-03`, `SWEEP-MI-APRENDIZAJE-04`.
- **3 localizadores corregidos** sin cambiar el tipo: `SWEEP-MI-APRENDIZAJE-01` (+`A·01 @0:00`), `A05-6` (→ `A·13 @20:40`), `A12-5` (→ guión p. 27, Q&A).
- **Auditoría de hermanos**, que la revisión no pidió: busqué el mismo patrón en las 160 filas. `A09-11`, `A14-7` y `A15-7` afirman función y **se quedan explícitas** porque el guión las enuncia verbatim. `A03-4` sí cayó y se corrigió.

Reparto final: 120 `EXPLICIT_PROMISE` · 17 `AUDIT_FINDING` · 14 `IMPLIED_COMMITMENT` · 8 `OPERATIONAL_PRECONDITION` · 1 `REVIEW_REQUIRED`.

### 10.4 Work items — dos splits y tres fusiones

| Cambio | Antes | Ahora | Por qué |
|---|---|---|---|
| **B1c separado** | 1 item | `W-B1c-01` + `W-B1c-02` | La revisión tiene razón y mi propia justificación era inválida: mantuve el item unido *porque compartían rama*, que es literalmente la razón que la regla 1 prohíbe |
| **B6c separado** | 1 item | `W-B6c-01/02/03` | Tres raíces, una de ellas de **seguridad** (cliente `anon` construido en el servidor). Merece su propia compuerta y su propia firma |
| `SWEEP-PRIOR-AUDIT-05` | Backlog suelto | `W-B6c-03` | Estaba backlogueado *y* descrito dentro de B6c. Resuelto a favor del plan |
| `SWEEP-ONBOARDING-DATA-06` | Backlog suelto | `W-B6d-01` | Mismas tres vistas de resumen. Separado sólo por inercia de programación |
| `SWEEP-ONBOARDING-DATA-05` | Backlog suelto, `DATA` clase **0** | `W-D-04` | Mismo carril, y como item suelto llevaba clase 0 **sin compuerta ni plan de restauración** — incorrecto para una escritura de datos. Hereda clase 3 |

**Lo que no cambié, y por qué:** `SWEEP-NONFUNCTIONAL-PROD-SECRETS-UNIGNORED` sigue en `DOCUMENTATION`. La revisión tiene razón en que su alcance real es operativo —contener el archivo y rotar credenciales—, pero el enum `delivery_mode` no tiene un modo operativo, y `DOCUMENTATION` sigue siendo el valor menos falso de los cuatro. La brecha del enum queda registrada en §9.2, no disimulada.

### 10.5 El único punto donde me detuve a preguntar

La lista de la revisión incluía añadir la negación de `.gitignore`. **Mi encargo original lo prohibía explícitamente**, y el propio protocolo dice que «ninguna recomendación de un revisor — humano o agente — constituye autorización». Un revisor pidiéndolo no es Brent autorizándolo.

Así que hice todo lo demás —que cae de lleno en el alcance original de documentación más el validador— y **paré ahí a preguntar**. Brent autorizó la negación estrecha; está aplicada, verificada por ambos lados y documentada en §9.1. El encargo advertía que una sesión anterior había hecho «un arreglo de seguridad sensato» sin autorización y que eso fue una brecha de proceso; sensato no es lo mismo que autorizado.

### 10.6 Efecto neto sobre las cifras

| | Ronda 1 | Ronda 2 |
|---|---:|---:|
| Reclamaciones | 160 | **160** *(congeladas, sin cambio)* |
| Reclamaciones P0 | 36 | **36** *(sin cambio)* |
| Work items | 104 | **104** |
| Enlaces | 147 | **149** |
| Enlaces P0 | 54 | **56** |
| Work items sin dueño | 70 | **67** |
| Reclamaciones alcanzadas por ellos | 82 | **80** |
| Reclamaciones P0 sin dueño | 4 | **4** *(sin cambio)* |
| Fallos del validador | 70 | **67** |

**El registro congelado no se movió: 160 reclamaciones, 36 P0.** Eso es exactamente lo que tenía que pasar — ninguna decisión de implementación puede cambiar esos números, y una ronda de correcciones a las unidades de trabajo es una decisión de implementación.

El déficit de propiedad bajó de 70 a 67 **sólo** porque tres reclamaciones pasaron a work items que ya tenían dueño real. **No se inventó ni un dueño, y no se consolidó nada para achicar el número.** Las cuatro P0 sin dueño siguen ahí, intactas.

---

## 11. Condición de parada

Hecho: los tres artefactos normalizados, el archivo byte por byte con su nota compañera, los banners históricos en los cuatro documentos de auditoría, el protocolo corregido, el validador creado y **ejecutado con su salida real**, y este informe.

**No se comenzó ninguna implementación. No se hizo ningún commit.** Todo queda como cambios en el árbol de trabajo.

---

## 12. Corrección de gobernanza aprobada — división B2b / B2c (2026-08-27)

**Aprobada por Brent, posterior a la normalización de las rondas 1–2.** Corrige el ledger de trabajo, el mapa, el protocolo (revisión 6) y el validador. El registro congelado no se toca: **160 reclamaciones, 36 P0, texto de reclamación byte-idéntico, SHA-256 del legacy intacto.**

### 12.1 La división

El antiguo `W-B2b-01` mezclaba dos riesgos de naturaleza distinta bajo un solo lote «mecánico»:

- **`W-B2b-01` (lote B2b, `fix/rls-anon`, clase 2; `SCHEDULED` al definirse esta división, hoy `DONE` — cierre técnico en producción del 2026-08-28, §12.9)** queda como **lockdown atómico de exactamente catorce tablas legacy sin referencias en el repositorio**: `answers`, `assignments`, `course_prerequisites`, `deleted_blocks`, `deleted_courses`, `deleted_lessons`, `deleted_modules`, `menu_permissions`, `metadata_sync_log`, `profiles_role_backup`, `questions`, `quizzes`, `student_answers`, `submissions`.
- **`W-B2c-01` (lote B2c, `fix/rls-learn`, clase `BLOCKED`, `BLOCKED`, dueño Brent + agente BD)** es la nueva **frontera de seguridad de rutas de aprendizaje**, gobernada por separado: `learning_paths`, `learning_path_courses`, sus GRANT directos y políticas RLS, y sus seis funciones (`create_full_learning_path`, `update_full_learning_path`, `batch_assign_learning_path`, `start_learning_path_session`, `end_learning_path_session`, `auth_is_learning_path_member` — las seis `SECURITY DEFINER` en el baseline comprometido, con `start`/`end` llamadas desde `pages/api/learning-paths/session/start.ts` y `end.ts`), con identidad del actor derivada de la sesión autenticada, autorización mismo-colegio y entre-colegios, aislamiento de tenant para padre e hijo, preservación de las lecturas autenticadas legítimas, compatibilidad cookie y bearer, pgTAP + integración + E2E sintética obligatoria, y aprobación de Privacidad. Sus dependencias de protocolo están en la revisión 6 §3; ninguna política final se inventa aquí.
- **`W-B10a-01` (lote B10a)** baja de ocho a **seis tablas referenciadas**: `group_assignment_discussions`, `growth_community_transformation_access`, `instructors`, `modules`, `propuesta_rate_limits`, `qa_tester_time_logs`.
- **`W-PC-06`** se crea como **dependencia de evidencia en solo lectura** (clasificación de datos de rutas de aprendizaje: `school_id` nulos, alcance de generación, huérfanos, alcance entre colegios, actor no derivable, referencias activas, sin PII de menores en la evidencia). `PRODUCTION_CHECK`, `BLOCKED`, `UNAUTHORIZED`, `authorization_owner` Brent, `dueno` vacío por la excepción de modo. **No se autorizó ni se ejecutó en esta corrección.**

**El hallazgo histórico 14 + 8 = 22 se preserva**: los tres conjuntos son explícitos y disjuntos, y su unión sigue dando cuenta de las 14 sin uso más las 8 referenciadas (hoy 2 + 6).

### 12.2 Mapa

`SWEEP-PRIOR-AUDIT-09` mapea ahora a **exactamente tres work items de remediación**: `W-B2b-01`, `W-B2c-01`, `W-B10a-01` (la expectativa canónica del validador, `PERMITTED_ID_TRANSFORM.expectedWorkItems`, sube de 2 a 3). `SWEEP-MI-APRENDIZAJE-09` deja `W-B2b-01` y mapea a `W-B2c-01` (remediación) y a `W-PC-06` (evidencia, excluida del conteo de remediación por diseño del validador).

### 12.3 B2a

`W-B2a-01` pasa de `SCHEDULED` a `DONE` con su evidencia de cierre **técnico**: PR de implementación #56, merge `0a6576c9ef52cc1513162549edc918208ba45bdf` sobre el head aprobado `63fc8c9c91a4b4b28773bd15dc426f5d3a195961`, PR de documentación #57, cierre registrado en `main` `550ee347f96af53c93c4a5a506fb3190188894a9`, CI del PR y post-merge exitosos, despliegue automático de Vercel, y las migraciones `20260827150000` y `20260827160000` aplicadas únicamente por Brent con verificación de solo lectura. **No se reabre; ninguna de las dos migraciones se re-ejecuta ni se altera.** **Precisión de la ronda 2:** `DONE` registra el cierre técnico; **no acredita la aceptación de la parte interesada** (gate: firma Madre Superiora), que solo queda completa cuando un registro mutable gobernado contenga persona y fecha — y ese registro **no está evidenciado hoy** para `W-B2a-01`. Registrarlo más adelante no reabre ni re-ejecuta B2a; no se inventa persona, fecha ni firma.

### 12.4 Efecto neto sobre las cifras (ronda 2 → corrección)

| | Ronda 2 | Corrección |
|---|---:|---:|
| Reclamaciones / P0 únicas | 160 / 36 | **160 / 36** *(congeladas, sin cambio)* |
| Work items | 104 | **106** |
| Enlaces | 149 | **151** |
| Enlaces P0 | 56 | **58** |
| Lotes de fusión | 26 | **27** |
| `MERGE` / `PRODUCTION_CHECK` | 88 / 5 | **89 / 6** |
| `SCHEDULED` / `BLOCKED` / `DONE` | 31 / 16 / 0 | **30 / 18 / 1** |
| Enlaces P0 dentro / fuera de lotes | 37 / 19 | **38 / 20** |
| Work items sin dueño (fallos del validador) | 67 | **67** *(sin cambio: `W-B2c-01` tiene dueño real y `W-PC-06` es la excepción de modo)* |

Salida vigente del validador tras la corrección — **las mismas 67 faltas de propiedad de la ronda 2, y ninguna otra clase de fallo**:

```
CIFRAS
  reclamaciones congeladas                 160
  reclamaciones P0 únicas                  36
  work items                               106
  enlaces reclamación↔trabajo              151
  enlaces P0 reclamación↔trabajo           58
  reclamaciones P0 únicas con enlace       36
  lotes de fusión distintos                27

WORK ITEMS POR MODO
  MERGE              89
  DATA               10
  PRODUCTION_CHECK   6
  DOCUMENTATION      1

PROPIEDAD
  work items sin dueño (excluida la excepción PRODUCTION_CHECK)   67
  excepción PRODUCTION_CHECK: dueno vacío a propósito             6

FALLOS: 67   — todos [16 propiedad]; cero fallos de conteo, identidad,
               referencia, esquema, enum, provenance, lote, rama,
               conservación o reconciliación
```

### 12.5 Fuera del alcance de esta corrección

- La rama de investigación `fix/rls-public` queda **aparcada como referencia de solo lectura**: no se rebasa, no se mergea, no se cherry-pickea y sus commits no se reutilizan en bloque.
- **Ninguna implementación de base de datos ni de producto está autorizada** hasta que esta corrección de gobernanza pase revisión independiente y se mergee. No existe todavía ningún prompt de implementación para B2b ni para B2c.

### 12.6 Investigación RLS más amplia — unidades diferidas D-RLS-01 / D-RLS-02 / D-RLS-03

El registro congelado **no contiene ninguna reclamación** para la superficie de privilegios de función fuera de las rutas de aprendizaje, así que estas unidades **no entran al ledger de work items** — inventar una reclamación, mover los denominadores 160/36, forzar un mapeo ajeno o debilitar el invariante de trabajo huérfano falsearía el registro. Viven como unidades diferidas gobernadas en el protocolo (revisión 6, §9), y las tres son **DIFERIDAS/BLOQUEADAS, no implementadas, no programadas y no autorizadas**:

- **D-RLS-01** — relevar de nuevo, contra `main` actual, la superficie EXECUTE no-learning: `has_transformation_access`, `get_available_assignment_templates`, `cleanup_propuesta_rate_limits`, `has_global_workspace_access`, `submit_quiz` (descubrimiento fresco de callers/políticas/privilegios rederivado desde `main` actual, antes de cualquier implementación y sin operación git alguna sobre `fix/rls-public`; `profiles_role_backup` excluida porque su lockdown de tabla ya lo gobierna B2b).
- **D-RLS-02** — evaluar y gobernar por separado el rediseño de actor/cuerpo de `has_global_workspace_access` y `submit_quiz`; depende de D-RLS-01 y se mantiene separada de todo cambio mecánico de GRANT.
- **D-RLS-03** — reconstruir el inventario, sobre `main` actual, de la superficie `SECURITY DEFINER` restante con GRANT a `anon`, y clasificarla. La cifra «80 firmas» del plan antiguo es **evidencia histórica en el head `565faa0d`**, no un conteo vigente; se exige reconteo local sobre `main` actual antes de programar, sin operación git alguna sobre `fix/rls-public`. Sólo descubrimiento; la remediación posterior queda indefinida hasta esa evidencia.

La rama `fix/rls-public` (`565faa0d4604d4e992e2a29f38ac248cac4aef2a`) es **evidencia de investigación únicamente** — se consulta con `git show`, no se rebasa/mergea/cherry-pickea, y ninguno de sus commits se reutiliza en bloque.

### 12.7 Remediación de la revisión independiente (2026-08-27, misma rama)

La revisión independiente del diff de corrección devolvió hallazgos; todos se remedian en un commit de corrección adicional **sin tocar los dos commits revisados** (`c31e002c`, `9132ef59`), sin editar artefactos congelados y sin cambiar ningún conteo del ledger (siguen 160/36/106/151/58/27):

1. **Inventario de funciones B2c.** Dos de los seis nombres de función estaban mal transcritos en la primera corrección; el conjunto exacto, verificado contra el baseline comprometido (las seis `SECURITY DEFINER`) y contra los dos callers de API (`pages/api/learning-paths/session/start.ts`, `end.ts`), es: `create_full_learning_path`, `update_full_learning_path`, `batch_assign_learning_path`, `start_learning_path_session`, `end_learning_path_session`, `auth_is_learning_path_member`. Corregido en el ledger de trabajo, el plan combinado, este informe y PROJECT_STATE; ningún objeto de esquema ni llamada de aplicación se renombró.
2. **Validador endurecido** (sin debilitar nada): invariantes nuevos que fijan los conjuntos exactos B2b (14) / B2c (2 tablas + 6 funciones) / B10a (6), su disyunción y total 14+2+6; la ausencia de los dos nombres de sesión retirados en los documentos de gobernanza activos; la existencia `SECURITY DEFINER` de las seis funciones B2c en el baseline; y la presencia de las unidades diferidas D-RLS-01/02/03 y sus funciones en el protocolo y este informe. El resultado sigue siendo **exactamente los 67 fallos [16 propiedad]** preexistentes.
3. **Semántica de aceptación de dos registros** (§12.3 y protocolo): el registro congelado es instantánea histórica cuyos campos de firma/evidencia no se rellenan jamás; la evidencia técnica de cierre y la aceptación viven en el registro mutable (work item o acta gobernada). Eliminada la regla que condicionaba la entrega de un lote a rellenar campos del archivo congelado.
4. **Inventario de ramas vigente** (verificado con `git ls-remote` el 2026-08-27): las ramas de lote vivas en canónico/remoto son exactamente `fix/horas-rep`, `fix/gate-score` y `fix/red-super`; **`fix/auth-sec2` está ausente** del repositorio canónico y del remoto vivo y se conserva en el repositorio congelado `/Users/brentcurtis/dev/fne-lms` como la rama local `refs/heads/fix/auth-sec2` apuntando exactamente a `4b87243c` *(topología precisada en la ronda 2, §12.8 — la formulación «sin ref» de esta ronda era incorrecta)* — `W-B10c-01` corregido en consecuencia; `fix/rls-public` sigue identificada aparte como rama remota de investigación aparcada en `565faa0d`, no de lote.
5. **Evidencia de validación precisada:** `git diff --check` limpio aplica al rango de corrección; el rango acumulado base→head arrastra avisos de espacios exclusivamente dentro de los artefactos importados byte-bloqueados (el CSV legacy y una línea del informe de deliverability), que **no se editan** para silenciarlos porque están congelados por hash.

### 12.8 Remediación de la segunda revisión independiente (2026-08-27, misma rama)

La re-revisión del diff de corrección devolvió cinco hallazgos; se remedian en un nuevo commit de corrección **sin tocar los tres commits revisados** (`c31e002c`, `9132ef59`, `ed80258f`), sin editar artefactos congelados y sin mover ningún conteo (siguen 160/36/106/151/58/27):

1. **La comprobación 18 pasa a igualdad exacta de conjuntos.** El validador extrae ahora el alcance realmente codificado en cada work item — la unión de las listas de identificadores entre paréntesis de su `gate_salida` (minúsculas `snake_case`, separadas por comas) — y exige **igualdad** con el conjunto aprobado: faltantes, renombrados, duplicados, de otro conjunto o **extras arbitrarios** producen `[18 alcance]`. Para hacer el alcance de `W-B2c-01` parseable con la misma convención, su `gate_salida` enumera ahora «exactamente las dos tablas (…)» y «exactamente las seis funciones (…)» en listas entre paréntesis; el contenido aprobado no cambió. Mutación negativa obligatoria ejecutada **en copia temporal desechable**: añadir `profiles` tras `submissions` en la lista explícita de `W-B2b-01` produjo `[18 alcance]` («añade identificadores fuera del conjunto aprobado: profiles») y suprimió la nota «alcance del split OK»; la copia se eliminó sin tocar el worktree revisado.
2. **La comprobación 20 cubre todas las ubicaciones gobernantes prometidas:** D-RLS-01, D-RLS-02 y D-RLS-03 se exigen ahora en el protocolo, en este informe **y en PROJECT_STATE** (cuya entrada deletrea los tres identificadores completos). Mutación negativa en copia temporal: eliminar `D-RLS-03` de PROJECT_STATE produjo `[20 diferidos]` y suprimió su nota OK.
3. **Semántica de cierre de B2a resuelta** (§12.3, protocolo §§0/2/4/9, `W-B2a-01.notes`, PROJECT_STATE): `W-B2a-01` está **técnicamente** DONE y cerrado en producción sobre su evidencia de ingeniería registrada; el DONE técnico **no** prueba la aceptación de la parte interesada; esa aceptación queda completa **solo** cuando un registro mutable gobernado contenga persona y fecha; **ese registro no está evidenciado hoy** para `W-B2a-01` y ya no se cita como si lo estuviera. Nada reabre ni re-ejecuta B2a; no se inventó persona, fecha ni firma.
4. **Topología exacta de `fix/auth-sec2`:** ausente del repositorio canónico y de `origin`; **presente en el repositorio congelado `/Users/brentcurtis/dev/fne-lms` como `refs/heads/fix/auth-sec2`, apuntando exactamente a `4b87243cfe846b477fbaa2c6146d4d91048e858b`** (verificado con `git show-ref` de solo lectura). Toda aserción «sin ref» queda retirada de los documentos activos. Cualquier integración futura exige una restauración/copia autorizada explícitamente por Brent desde esa rama congelada; no se realizó.
5. **Desambiguación de «re-basar»** en D-RLS-01 y D-RLS-03 (protocolo y este informe): ahora «relevar de nuevo contra `main` actual» / «reconstruir el inventario sobre `main` actual», con la prohibición explícita de toda operación git sobre `fix/rls-public` (no rebase, no merge, no cherry-pick, no reutilización en bloque).

Tras restaurar las copias temporales, el validador real sigue en **exactamente los 67 fallos `[16 propiedad]`** con las notas OK de 18/19/20 impresas.

### 12.9 Cierre técnico en producción de W-B2b-01 (2026-08-28)

Las tablas de recuento de las rondas anteriores y de §12.4 quedan como **evidencia histórica correcta en su fecha**; esta subsección registra el cierre que las supersede en tiempo presente.

- **Implementación y merge.** La rama `fix/rls-anon` (base exacta `6b7561d4`, un solo commit `21e01b11`, siete archivos) fue aprobada **sin hallazgos** por revisión independiente (Codex) sobre el rango exacto `6b7561d4..21e01b11`, empujada por Brent y mergeada como **PR #59 → merge `0377edbf13bbaf8b4f98dc24b6acd161c705141b`** (padres `6b7561d4` + `21e01b11`). CI del PR y CI post-merge (run `33134662387`) en verde sobre ese SHA; el despliegue automático de Vercel para ese SHA terminó en éxito («Deployment has completed»). Ningún despliegue manual.
- **Aprobación de Privacidad (gate de W-B2b-01).** Registrada y gobernada en el comentario de aprobación del PR #59 (`issuecomment-5447468927`): **Brent Curtis, Project Lead y aprobador de Privacidad designado para W-B2b-01, 2026-08-27.** Con esto la aceptación exigida por el gate queda **evidenciada con persona y fecha** en un registro mutable gobernado; la instantánea congelada de reclamaciones no se toca.
- **Aplicación en producción.** Brent aplicó la migración `20260827170000` (`lockdown_unused_legacy_tables`) manualmente en el SQL Editor de producción, en **una sola transacción** que incluyó el cuerpo byte-exacto del merge (blob `bba7f7e5`, SHA-256 `983268f6…`, 107 líneas) y su fila de `supabase_migrations.schema_migrations`. Sin `supabase db push`, sin `migration repair`, sin vincular el CLI a producción, sin Management API, sin compensador.
- **Verificación.** Preflight de solo lectura con **once aserciones, todas `true`** (las catorce tablas presentes sin RLS ni políticas, grants baseline de `anon`/`authenticated`/`service_role` intactos, cero grants de `PUBLIC`, helper del guard presente, versión ausente del ledger, y el conjunto sin RLS igual a las 22 tablas legacy exactas). Postflight con **ocho aserciones, todas `true`** (RLS activa en las catorce, exactamente una política — la restrictiva `forced_password_change_guard`, con `password_change_gate_ok()` en USING y WITH CHECK, solo para `authenticated` — y cero permisivas, cero privilegios de aplicación, `service_role` con sus siete privilegios, fila de ledger exacta, y el conjunto sin RLS reducido a **exactamente las 8 tablas gobernadas restantes**). **Los catorce conteos de filas idénticos antes y después** (once en 0; `deleted_courses` 12, `menu_permissions` 104, `profiles_role_backup` 25); solo se devolvieron conteos agregados y metadatos de catálogo — ninguna fila ni dato personal.
- **Efecto sobre las cifras vigentes.** `W-B2b-01` pasa `SCHEDULED → DONE`; la distribución de estados queda **29 / 57 / 18 / 2** (`SCHEDULED`/`BACKLOG`/`BLOCKED`/`DONE`) con los modos intactos (89/10/6/1) y los totales intactos (160 reclamaciones · 36 P0 · 106 work items · 151 enlaces · 58 enlaces P0 · 27 lotes). El inventario de ramas vigente pasa de tres a **cuatro ramas vivas** al existir ahora `fix/rls-anon` (`21e01b11`, mergeada); `fix/rls-public` sigue aparcada en `565faa0d` y la topología de `fix/auth-sec2` no cambia.
- **Lo que NO cambia.** `W-B2c-01` sigue `BLOCKED`, `W-PC-06` sigue `BLOCKED` y sin autorizar, `W-B10a-01` sigue `SCHEDULED`, y las unidades diferidas D-RLS-01/02/03 siguen diferidas exactamente como estaban. La migración `20260827170000` **no debe re-aplicarse**; la compensatoria revisada permanece en `docs/planning/reviews/` y exige autorización explícita y separada de Brent.

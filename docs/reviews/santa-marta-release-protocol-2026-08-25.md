# Protocolo de entrega — un solo responsable humano

**Fecha:** 25 de agosto de 2026 · **revisión 8** (2026-08-28, cierre de W-PC-06 y creación de B2d: la comprobación de clasificación de datos de rutas de aprendizaje se ejecutó en solo lectura con autorización explícita de Brent — Brent corrió las consultas 1-4 en el SQL Editor de producción y Codex la consulta 5 a través del CLI ya vinculado — la única llamada de consulta de base de datos por la Management API explícitamente autorizada, un único SELECT acotado de solo lectura —, únicamente tras una autorización explícita posterior de Brent, también de solo lectura; solo se devolvieron agregados y esquema, sin filas ni PII — con resultado **B — DATA TRANSFORMATION REQUIRED**; `W-PC-06` pasa a `DONE`/`AUTHORIZED`/clase 0 con su registro agregado en `docs/reviews/w-pc-06-learning-path-data-classification-2026-08-28.md`; la clasificación crea la reparación gobernada de clase 3 **W-B2d-01** (lote `B2d`, rama `data/lp-scope`, `BLOCKED`/`UNAUTHORIZED`; sin elegir colegios ni semántica de propiedad, sin algoritmo y sin SQL), que debe autorizarse por separado, implementarse, revisarse de forma independiente, mergearse y ejecutarse de forma segura ANTES de programar B2c — B2c sigue `BLOCKED` y no absorbe ese trabajo; el registro de cierre de B2b mergeado como PR #60 (`7a470fe8`, CI post-merge 33183489941 en verde, despliegue automático completado) queda anclado y W-B2b-01 no se reabre ni su migración `20260827170000` se re-aplica; los totales pasan a 107 work items · 152 enlaces · 59 enlaces P0 · 28 lotes; la instantánea congelada no se toca) · *revisión 7: cierre técnico en producción de W-B2b (2026-08-28) — implementación en fix/rls-anon aprobada sin hallazgos por revisión independiente y mergeada como PR #59 (merge 0377edbf), migración 20260827170000 aplicada por Brent en el SQL Editor de producción en una sola transacción con su fila de ledger, preflight de once y postflight de ocho aserciones todos true y los catorce conteos de filas intactos; aceptación de Privacidad de W-B2b-01 evidenciada con persona y fecha en el comentario gobernado del PR #59; W-B2a y W-B2b técnicamente DONE y el inventario de ramas vigente suma fix/rls-anon* · *revisión 6: corrección de gobernanza aprobada por Brent (2026-08-27) — división del antiguo W-B2b-01 en B2b de catorce tablas y la frontera B2c bloqueada con W-PC-06 sin autorizar, B10a de ocho a seis, cierre en producción de B2a, más las remediaciones de las dos revisiones independientes (funciones B2c exactas del baseline, semántica de aceptación de dos registros, inventario de ramas verificado, unidades diferidas D-RLS-01/02/03 en §9; detalle en §12 del informe de normalización)* · *revisión 5: ronda 2 de normalización — corrigió los conteos de estado y verificación que la revisión 4 tenía mal, separó B1c y B6c, fusionó tres solapamientos y endureció el validador*
**Complementa:** `santa-marta-claims.csv` · `santa-marta-work-items.csv` · `santa-marta-work-claim-map.csv` · `santa-marta-audit-comparison-2026-08-25.md`

> **Nada de esto está autorizado.** Este documento describe *cómo* se ejecutaría, no que se pueda ejecutar. Trabajo local preparatorio y actividad contra producción se autorizan **por separado y explícitamente**, y sólo por Brent. Ninguna recomendación de un revisor — humano o agente — constituye autorización.

---

## 0. Estado real de los ledgers

El ledger único anterior mezclaba *lo que se afirmó* con *lo que hay que hacer*, y por eso su denominador se movía. Queda partido en tres artefactos, y el original se conserva sin tocar:

| Artefacto | Qué es |
|---|---|
| `santa-marta-claims.csv` | **Registro congelado.** 160 reclamaciones de auditoría. Ninguna decisión de implementación puede cambiar ese número. Sin columnas de propiedad ni de programación. |
| `santa-marta-work-items.csv` | **Registro mutable.** Unidades de remediación, con su lote, su modo de entrega, su clase de migración y su dueño. |
| `santa-marta-work-claim-map.csv` | **La unión.** Dos columnas, un par por fila, jamás una lista dentro de una celda. |
| `archive/santa-marta-promise-ledger-legacy-161.csv` | El ledger original, **byte por byte**. Su nota de supersesión vive en el `.md` compañero, no dentro del CSV. |

**No son promesas: son reclamaciones.** Las 160 filas incluyen representaciones explícitas, compromisos implícitos, precondiciones operativas y hallazgos de auditoría previa. `SWEEP-NONFUNCTIONAL-PROD-SECRETS-UNIGNORED`, por ejemplo, dice en su propia cara que nunca se le prometió a nadie.

Todas las cifras cuantitativas de este documento están **reconciliadas contra los ledgers por `scripts/check-ledger.mjs`**, que falla si alguna discrepa.

<!-- LEDGER-SUMMARY:BEGIN -->
{
  "total_claims": 160,
  "unique_p0_claims": 36,
  "total_work_items": 107,
  "total_claim_work_links": 152,
  "p0_claim_work_links": 59,
  "unique_p0_claims_with_links": 36,
  "merge_batches": ["B1a","B1b","B1c","B2a","B2b","B2c","B2d","B3a","B3b","B3c","B4a","B4b","B4c","B4d","B5","B6a","B6b","B6c","B6d","B7a","B7b","B8a","B8b","B8c","B9a","B10a","B10b","B10c"]
}
<!-- LEDGER-SUMMARY:END -->

**Seis cifras, y nunca se intercambian:**

| Cifra | Valor |
|---|---:|
| Reclamaciones congeladas | **160** |
| Reclamaciones P0 únicas | **36** |
| Work items | **107** |
| Enlaces reclamación↔trabajo | **152** |
| Enlaces P0 reclamación↔trabajo | **59** |
| Reclamaciones P0 únicas alcanzadas por esos enlaces | **36** |

Un enlace no es una reclamación. Una reclamación P0 que se remedia en dos lotes produce dos enlaces y sigue siendo **una** reclamación. *(Nota histórica: la revisión 3 declaraba una «cola operativa P0» de 37 y presentaba ese número como si fuera el de las reclamaciones. Era un conteo de unidades de trabajo sobre un ledger que además duplicaba la fila de RLS. Superado.)*

### Reparto de las 160 reclamaciones

| | |
|---|---:|
| Accionables (`BROKEN` + `CONDITIONAL` + `MISSING`) | **124** |
| No accionables — 27 `READY`, 7 `REFUTED`, 1 `FUTURE_DISCLOSED`, 1 `UNVERIFIABLE` | 36 |

### Reparto de los 107 work items

| Modo de entrega | | Estado | |
|---|---:|---|---:|
| `MERGE` | 90 | `SCHEDULED` | 29 |
| `DATA` | 10 | `BACKLOG` | 57 |
| `PRODUCTION_CHECK` | 6 | `BLOCKED` | 18 |
| `DOCUMENTATION` | 1 | `DONE` | 3 |

De los 90 `MERGE`, **34 están dentro de los 28 lotes de fusión** y 56 no tienen lote: son defectos reales sin programar. Los `DONE` son tres. El tercero es `W-PC-06` — la comprobación de clasificación de datos en solo lectura, ejecutada el 2026-08-28 con autorización explícita de Brent y cerrada con clasificación **B — DATA TRANSFORMATION REQUIRED** (§9): es una dependencia de evidencia, no una remediación, y su `DONE` no cierra ningún lote. Los otros dos son `W-B2a-01` y `W-B2b-01` — ambos **técnicamente cerrados en producción** (B2a el 2026-08-27: PR #56, merge `0a6576c9`, verificación de solo lectura de Brent; B2b el 2026-08-28: PR #59, merge `0377edbf`, migración `20260827170000` aplicada por Brent en una sola transacción y verificada con preflight/postflight completos). `DONE` registra el cierre técnico; **la aceptación de la parte interesada se lleva aparte (§2)** y difiere entre ambos: para `W-B2a-01` sigue **pendiente de registro con persona y fecha**, mientras que para `W-B2b-01` la aceptación exigida por su gate (firma Privacidad) **está evidenciada** en un registro mutable gobernado — Brent Curtis, Project Lead y aprobador de Privacidad designado para W-B2b-01, 2026-08-27, comentario de aprobación del PR #59. Ninguno de los dos hechos puebla ni modifica la instantánea congelada de reclamaciones.

### La deuda de propiedad — tres números, nunca fusionados

| | |
|---|---:|
| Work items sin dueño *(excluida la excepción `PRODUCTION_CHECK`)* | **67** |
| Reclamaciones únicas enlazadas a esos work items | **80** |
| Reclamaciones P0 únicas enlazadas a esos work items | **4** |
| `PRODUCTION_CHECK` con `dueno` vacío **a propósito** | 6 |

Las cuatro P0 sin dueño son `SWEEP-MI-APRENDIZAJE-01`, `A15-2`, `A15-7` y `SWEEP-ONBOARDING-DATA-01`: el carril de datos —filas de `programas`, ~200 cuentas, los ocho colegios—. **Ninguna se cierra escribiendo código.** Un marcador como `SIN ASIGNAR — BLOQUEANTE` no es un dueño, y el modelo normalizado ya no lo acepta como tal.

La excepción `PRODUCTION_CHECK` es deliberada: en una comprobación de solo lectura la pregunta no es de quién es, sino quién la autoriza y quién la ejecuta. `dueno` vacío ahí es correcto. Un chequeo P0 sin autorizar **sigue bloqueando la activación**, pero no se cuenta como deuda de propiedad.

**La propiedad vive en los work items, nunca en las reclamaciones.** `autoridad_aceptacion` es un **rol**. Y desde la revisión 6 el protocolo distingue **dos registros que nunca se confunden**: el **registro congelado de reclamaciones** es una instantánea histórica preservada byte a byte — sus campos `evidencia_prod`, `firmado_por` y `fecha_firma` quedaron vacíos en las 160 filas al congelarse y **permanecen así para siempre**; rellenarlos exigiría editar el archivo congelado y romper su preservación. La **evidencia técnica de cierre** y la **aceptación de la parte interesada** son mutables, son **dos cosas distintas**, y se registran donde corresponde: en el work item (`notes`/`gate_salida`) o en un acta de aceptación gobernada aparte. `W-B2a-01` es el ejemplo de la primera —su cierre técnico de ingeniería y producción está registrado en sus `notes`— y también de la distinción: **su aceptación con persona y fecha todavía no está evidenciada** y no debe citarse como si lo estuviera. El vacío del registro congelado documenta honestamente lo que faltaba **en el momento de congelar**; el trabajo restante se mide contra el registro mutable, no rellenando la instantánea.

---

## 1. Corrección: el orden del trigger

| Orden de los hechos | Resultado |
|---|---|
| **Rol/membresía primero → sesión creada después** | **Sin asistente** |
| Sesión primero → rol añadido después | Asistente creado, sólo fecha futura |
| Sesión el mismo día | Sin asistente |

`sync_session_attendees_on_gc_change()` ([baseline:4907](supabase/migrations/00000000000000_baseline.sql:4907)) corre al insertar en `user_roles` ([trigger:15408](supabase/migrations/00000000000000_baseline.sql:15408)) y busca sesiones **que ya existen**. No hay trigger sobre `consultor_sessions` salvo `set_updated_at`. La primera fila es la ruta Santa Marta.

---

## 2. Las tres reglas del tren

**WIP = 1.** Un lote en vuelo a la vez. Investigación, tests y preparación del siguiente corren en paralelo con agentes; **sólo un lote toca `main`**.

**Un lote = una rama = una fusión.** Un lote es un **contenedor de entrega**; un work item es una **unidad de remediación**. No son lo mismo: varios work items pueden compartir lote y rama. Los 28 lotes de §4 y sus 34 work items están **reconciliados contra los ledgers por `scripts/check-ledger.mjs`**, no derivados de esta prosa.

**Un lote no está entregado hasta que constan en el registro mutable sus DOS componentes, que nunca se confunden:** (1) la **evidencia técnica de cierre** — ingeniería y producción —, y (2) la **aceptación de la parte interesada**, completa **solo** cuando un registro mutable gobernado (el work item o un acta de aceptación que el lote referencie) contiene **la persona que acepta y la fecha**. El cierre técnico no acredita la aceptación. Hoy **un solo lote tiene registradas las DOS componentes: B2b** — `W-B2b-01` tiene la (1) completa (cierre técnico en producción, 2026-08-28) **y** la (2) **evidenciada** en un registro mutable gobernado que identifica a la persona y la fecha: **Brent Curtis, Project Lead y aprobador de Privacidad designado para W-B2b-01, 2026-08-27** (comentario de aprobación del PR #59). **B2a no**: `W-B2a-01` sigue técnicamente `DONE` con la (1) completa y la (2) **pendiente de registro con persona y fecha**. Las dos componentes siguen siendo registros distintos y ninguna sustituye a la otra. Los campos `evidencia_prod`/`firmado_por`/`fecha_firma` del **registro congelado** de reclamaciones son una instantánea histórica y **no se rellenan nunca** (revisión 6; editar el archivo congelado rompería su preservación byte a byte) — la aceptación de B2b vive en el registro mutable, jamás en el congelado.

---

## 3. Clases de migración

Corrección importante: **`CREATE POLICY` no es inerte.** Cambia quién puede leer o escribir en el instante en que corre. Todo `GRANT`, `REVOKE`, `CREATE`/`ALTER POLICY` y activación de RLS es **clase 2**.

| Clase | Qué es | Reversión |
|---|---|---|
| **0 — sin migración** | Sólo código o configuración | Revertir el PR |
| **1 — expansión inerte** | `ADD COLUMN` nullable · `CREATE TABLE` · `INSERT` en tabla **vacía**. Nada que toque permisos ni filas existentes | Revertir el código; la migración queda inerte |
| **2 — permisos / RLS** | `GRANT` · `REVOKE` · `CREATE`/`ALTER POLICY` · `ENABLE RLS` | Requiere **migración compensatoria escrita y probada antes de fusionar** |
| **3 — transformación de datos** | `UPDATE`/`INSERT` sobre filas existentes · *backfill* · `NOT NULL` sobre columna con filas que lo violan | **`git revert` no lo deshace.** Conteo en seco · captura previa de claves afectadas · plan de restauración · autorización nominal |

### La compensación de clase 2 **nunca** usa `DROP`

`DROP` en cualquiera de sus formas está **prohibido** por `AGENTS.md:55` y `CLAUDE.md:54` (ancla de AGENTS.md actualizada en la revisión 8, al reconciliarse AGENTS.md como espejo íntegro del CLAUDE.md canónico). La revisión 3 listaba `DROP POLICY` dentro de la clase 2; era un error y queda retirado de la taxonomía y de todo el documento. Una compensación de clase 2 se escribe con:

- **migraciones aditivas hacia adelante**,
- **`ALTER POLICY`** sobre la política existente,
- **políticas `RESTRICTIVE`** que reduzcan el alcance sin destruir nada,
- **restauración de los `GRANT` previos**.

Aparte y por otra razón: **`DISABLE ROW LEVEL SECURITY` está bloqueado por hook (`scripts/hooks/block-rls-disable.sh`) y por CI**. Son dos vallas distintas — la prohibición de `DROP` es una regla del repositorio; el bloqueo de `DISABLE RLS` es un control automatizado — y ninguna se rodea.

### Lotes que no cumplían una sola clase

- **B3a** era «1 + 3». Ahora **B3a** = políticas de `meeting_agreements`/`meeting_tasks` (clase 2) + propagación de errores y validación de UI (clase 0), y **B3c** = `NOT NULL` sobre `due_date` tras *backfill* → **clase 3**, fusiona después de B3a. La clase del lote es la de su work item más riesgoso.
- **B8b** tiene **`clase_migracion = BLOCKED`**, no «1 ó 3». Está indeterminada hasta que se ejecute la comprobación 1 de §9: `feriados_chile` **vacía → clase 1**; **con filas → clase 3**. **B8b no se planifica antes de esa comprobación.**
- **B2c** (la frontera de rutas de aprendizaje, separada de B2b en la revisión 6) tiene **`clase_migracion = BLOCKED`** por la misma disciplina, y sus dependencias son de protocolo, no opcionales — reordenadas en la revisión 8 porque la primera ya se cumplió: (1) **CUMPLIDA (2026-08-28)** — la comprobación de clasificación de datos en solo lectura autorizada por Brent (`W-PC-06`, §9) terminó con clasificación **B — DATA TRANSFORMATION REQUIRED**, así que la alternativa «sin filas que exijan transformación → clase 2 directa» quedó descartada por la evidencia; (2) por esa clasificación, la reparación gobernada de **clase 3** `W-B2d-01` (lote B2d, rama `data/lp-scope`) debe ser **autorizada por separado, implementada, revisada de forma independiente, mergeada y ejecutada de forma segura**, en ese orden, **antes** de programar B2c; (3) después, Privacidad debe aprobar la matriz de autorización rol × tenant; (4) B2c **no absorbe** el trabajo de clase 3 ni **combina de forma invisible** un backfill con su trabajo clase 2 de RLS/funciones — toda transformación de filas existentes pertenece a W-B2d-01; (5) mientras (2) y (3) no estén completas, B2c permanece `BLOCKED` con `clase_migracion = BLOCKED`; (6) documentar esta dependencia **no autoriza ninguna consulta ni escritura a producción**.
- **B5** es **clase 0**: eliminar las diez llamadas a `updatePublishedTemplateSnapshot()` es sólo código. Una reparación histórica posterior, si el conteo de B5-pre resulta mayor que cero, sería clase 3 y otro lote.

---

## 4. Los 28 lotes atómicos

La columna **P0 (enlaces)** cuenta **enlaces reclamación↔trabajo de severidad P0**, no reclamaciones P0. Los 28 lotes contienen **34 work items** y suman **39** de los **59** enlaces P0; los otros 20 caen en el carril de datos (13) y en las comprobaciones de producción (7).

*(La revisión 3 presentaba un 37 como si fuera el número de reclamaciones P0; era un conteo de enlaces y quedó superado. Tras la división B2b/B2c los enlaces P0 dentro de los lotes de fusión eran **38**; con el lote B2d de la revisión 8 son **39** — y siguen sin ser el número de reclamaciones P0, que es 36.)*

| Lote | Rama | Clase | Work items | P0 (enlaces) | Firma | Disparador de reversión |
|---|---|:-:|--:|--:|---|---|
| **B1a** | `fix/observ` | 0 | 1 | 0 | Privacidad | Eventos sintéticos no llegan, o el ruido tapa la señal |
| **B1b** | `fix/horas-rep` | 0 | 1 | 2 | Directora | Reporte de Horas no carga |
| **B1c** | `fix/gate-score` | 0 | 2 | 4 | Docente | Compuerta cerrada no envía o puntúa mal |
| **B2a** | `fix/red-super` | 0 | 1 | 1 | **Madre Superiora** | No se puede crear/acotar el Líder de Red |
| **B2b** | `fix/rls-anon` | **2** | 1 | 1 | Privacidad | Cualquier lectura autenticada rompe tras el REVOKE |
| **B2c** | `fix/rls-learn` | **BLOCKED** | 1 | 2 | Privacidad | *(frontera de rutas de aprendizaje; W-PC-06 cerró con clasificación B — bloqueado por W-B2d-01 primero y la matriz rol × tenant después)* |
| **B2d** | `data/lp-scope` | **3** | 1 | 1 | Privacidad | *(reparación gobernada de la propiedad de rutas de aprendizaje existentes; BLOCKED/UNAUTHORIZED — precede a B2c; clase 3: conteo en seco, captura previa y plan de restauración probado antes de ejecutar)* |
| **B3a** | `fix/meet-save` | **2** | 3 | 5 | Directora | Un acuerdo no sigue ahí al reabrir |
| **B3b** | `fix/mail-truth` | 0 | 2 | 3 | Directora | El toast miente sobre el correo |
| **B3c** | `fix/meet-notnull` | **3** | 1 | 1 | Directora | Filas existentes bloquean el constraint |
| **B4a** | `fix/sess-route` | 0 | 1 | 1 | Directora | La directora no abre una sesión |
| **B4b** | `fix/consultor` | 0 | 1 | 2 | Consultor | El consultor entra a un colegio ajeno |
| **B4c** | `fix/attendees` | **3** | 1 | 2 | Directora | Sesión nueva sigue sin asistentes |
| **B4d** | `fix/sess-close` | 0 | 1 | 1 | Consultor | No cierra, o cierra sin consumir horas |
| **B5** | `fix/snapshot` | **0** | 1 | 2 | **Madre Superiora** | Editar un template publicado altera una evaluación aplicada |
| **B6a** | `fix/plan-pct` | 0 | 1 | 1 | Directora | El porcentaje no cuadra con los niveles |
| **B6b** | `fix/nav-dir` | 0 | 1 | 1 | Directora | «Contexto Transversal» sale duplicado |
| **B6c** | `fix/net-tabs` | 0 | 3 | 2 | **Madre Superiora** | Alguna pestaña falla o muestra otra red |
| **B6d** | `fix/lp-views` | 1 | 1 | 1 | Madre Superiora | Tiempo Total sigue en 0, o `anon` lee las vistas |
| **B7a** | `fix/ws-name` | **2** | 1 | 1 | Directora | El renombre falla |
| **B7b** | `fix/feed-srv` | 0 | 1 | 2 | Directora | El autor ajeno sale en blanco |
| **B8a** | `fix/lic-cron` | 0 | 1 | 0 | Encargado Lic. | Alerta de plazo no llega sin abrir la página |
| **B8b** | `fix/feriados` | **BLOCKED** | 1 | 1 | Encargado Lic. | Un plazo cae en feriado |
| **B8c** | `fix/lic-audit` | 1 | 1 | 0 | Encargado Lic. | Un registro se puede destruir |
| **B9a** | `fix/assign-rec` | 0 | 1 | 1 | Onboarding | Asignación y evaluaciones siguen divergiendo |
| **B10a** | `fix/rls-grupo-b` | **2** | 1 | 1 | Privacidad | *(bloquea estudiantes y familias)* |
| **B10b** | `fix/notif-mail` | 0 | 1 | 0 | Ingeniería | Ninguna notificación llega por correo |
| **B10c** | `auth/rebase-z7` | 0 | 1 | 0 | Seguridad | *(integración de 283 archivos, no despliegue)* |

**B1b es la rama `fix/horas-rep`.** «PR #50» es metadato, no parte del nombre de la rama; vive en `notes` del work item.

**B2a está técnicamente cerrado.** Su work item `W-B2a-01` es `DONE` desde el 2026-08-27 sobre su evidencia de ingeniería y producción: PR #56 mergeado como `0a6576c9` sobre el head aprobado `63fc8c9c`, CI del PR y post-merge en verde, despliegue automático de Vercel, y las dos migraciones (`20260827150000`, `20260827160000`) aplicadas únicamente por Brent y verificadas en solo lectura. No se reabre y ninguna de las dos migraciones se re-ejecuta ni se altera. **Distinción de la revisión 6:** ese `DONE` técnico no acredita la **aceptación de la parte interesada** (gate: firma Madre Superiora), que queda completa solo cuando un registro mutable gobernado contenga persona y fecha; **ese registro no está evidenciado hoy para `W-B2a-01`** y registrarlo más adelante no reabre ni re-ejecuta nada. La fila del lote se conserva en la tabla como registro de su contenido.

**B2b está técnicamente cerrado.** Su work item `W-B2b-01` es `DONE` desde el 2026-08-28 sobre su evidencia de ingeniería y producción: implementación en la rama `fix/rls-anon` (head `21e01b11`) aprobada sin hallazgos por revisión independiente, PR #59 mergeado como `0377edbf` (padres `6b7561d4` + `21e01b11`), CI del PR y post-merge (run 33134662387) en verde, despliegue automático de Vercel completado sobre ese SHA, y la migración `20260827170000` (`lockdown_unused_legacy_tables`) aplicada únicamente por Brent en el SQL Editor de producción en **una sola transacción** con su fila de `supabase_migrations.schema_migrations`. Verificación: preflight de once aserciones y postflight de ocho aserciones todos `true` (RLS activa en las catorce tablas, exactamente una política restrictiva `forced_password_change_guard` por tabla y cero permisivas, cero privilegios de `anon`/`authenticated`/`PUBLIC`, `service_role` intacto, fila de ledger exacta, y el conjunto sin RLS reducido a exactamente las 8 tablas gobernadas restantes), con los **catorce conteos de filas idénticos** antes y después; solo se devolvieron conteos agregados y metadatos de catálogo. No se reabre y la migración **no se re-ejecuta**. **La aceptación exigida por su gate (firma Privacidad) está evidenciada:** Brent Curtis, Project Lead y aprobador de Privacidad designado para W-B2b-01, 2026-08-27, en el comentario de aprobación gobernado del PR #59. El **registro de cierre** de B2b se mergeó a `main` vía **PR #60 como `7a470fe8`**, con la CI post-merge (run 33183489941) completada en verde sobre ese SHA y el despliegue automático completado; la aplicación en producción de `20260827170000` queda registrada ahí. **Prohibido reabrir `W-B2b-01` y prohibido re-aplicar su migración.** La migración compensatoria revisada permanece en `docs/planning/reviews/` y no se aplica sin autorización explícita y separada de Brent.

**Inventario de ramas vigente (verificado contra `git ls-remote` el 2026-08-28; el inventario anterior, fechado 2026-08-27, queda como registro histórico).** De estas 28 ramas de lote, **cuatro existen** en el repositorio canónico y en el remoto vivo: `fix/horas-rep` (`f6d0e908`), `fix/gate-score` (`63616d61`), `fix/red-super` (`63fc8c9c`; B2a, ya mergeada vía PR #56) y `fix/rls-anon` (`21e01b11`; B2b, ya mergeada vía PR #59 como `0377edbf` — deja de ser un identificador planificado). **`fix/auth-sec2` — la base planificada de `auth/rebase-z7` (B10c) — está AUSENTE del repositorio canónico y del remoto vivo (`origin`)**: se conserva en el **repositorio congelado `/Users/brentcurtis/dev/fne-lms`** como la rama local `refs/heads/fix/auth-sec2`, que apunta **exactamente** a `4b87243cfe846b477fbaa2c6146d4d91048e858b`. Toda integración futura al repositorio canónico exige una **restauración/copia autorizada explícitamente por Brent** desde esa rama local del repositorio congelado; no se ha realizado. Las otras 24 ramas son **identificadores de lote planificados, sin commits detrás** — `fix/rls-learn` (B2c) y `data/lp-scope` (B2d) incluidas. La rama remota de investigación `fix/rls-public` (`565faa0d`) **no** es la rama de ningún lote: queda aparcada como evidencia de solo lectura y sus commits no se reutilizan en bloque.

**`B9b` no aparece aquí, y no es un lote de fusión.** En el ledger legacy era una sola etiqueta sobre veintidós reclamaciones de datos genuinamente distintas. Queda descompuesta en **diez work items `DATA`** (§7-bis).

---

## 5. Reversión

**Criterio de parada:** falla la jornada de aceptación, **o** aparece un error nuevo en Sentry en una ruta del lote, **o** quien firma dice que no.

```
git switch -c revert/<lote> main
git revert -m 1 <merge-sha>
gh pr create --base main        # las cuatro compuertas corren sobre la reversión
```

La reversión pasa por las mismas compuertas que el cambio. **`git push` directo a `main` queda reservado a Brent** como excepción de emergencia declarada en el momento — no es procedimiento.

Clases 2 y 3: revertir el código **no basta**. Un lote de clase 2 o 3 no se fusiona si su compensación no está escrita y probada, y esa compensación **nunca** usa `DROP` (§3).

**Ventana:** sólo si Brent puede vigilar las dos horas siguientes. Nunca viernes por la tarde ni la noche previa a una visita.

---

## 6. B1a — y la decisión sobre *session replay*

El diagnóstico se sostiene: los tres `sentry.*.config.ts` llaman a `Sentry.init()`, pero [next.config.js](next.config.js:90) **nunca aplica `withSentryConfig`**, la integración que inyecta esa configuración en el *runtime*.

La configuración existente activa grabación de sesión: `replaysSessionSampleRate: 0.1` y `replaysOnErrorSampleRate: 1.0` en producción ([sentry.client.config.ts:32](sentry.client.config.ts:32)), con `maskAllText` y `blockAllMedia`.

**Propuesta documentada, no aplicada:** dentro de B1a, poner **ambas tasas en 0**. Nadie ha cambiado esos archivos; esto es lo que B1a haría si se autorizara, no un cambio ya hecho.

**La aprobación amplia de privacidad sigue siendo una decisión separada y todavía abierta.** Poner las tasas en 0 quita *session replay* del camino crítico; **no** equivale a que la revisión de privacidad haya ocurrido, y no la sustituye. El replay se evalúa después, por separado, con aprobación explícita.

**Salida de B1a:** evento sintético de cliente y de servidor verificados · *release tagging* activo · entrega de alerta probada · umbral de ruido fijado · **decisión de replay firmada**, con `firmado_por` = Privacidad.

---

## 7. B5-pre — reescrito

La pregunta que proponía la revisión 3 —«¿hay *snapshots* cuya versión no coincide con las respuestas que apuntan a ella?»— **es incontestable en este esquema**, y ninguna variante de ella debe reinstaurarse. `assessment_responses` guarda `instance_id` e `indicator_id` y **ninguna versión propia de *snapshot*** ([baseline:6193](supabase/migrations/00000000000000_baseline.sql:6193)); y la sobrescritura actualiza `snapshot_data` **y** `version` en la misma fila ([autoAssignmentService:805](lib/services/assessment-builder/autoAssignmentService.ts:805)), en diez sitios de llamada. No sobrevive ninguna discrepancia de versión que consultar.

**Condición primaria de exposición: `snapshot_data.last_updated_at > assigned_at`.** La promesa de sellado empieza en el momento de la **asignación** —«cada evaluación queda sellada a la versión del instrumento con que se respondió»—, así que cualquier modificación posterior a la asignación ya rompe la promesa, se haya respondido o no.

**Estratificar el conteo en cuatro bandas**, de mayor a menor población:

| Banda | Condición | Qué significa |
|---|---|---|
| 1 | `last_updated_at` > **asignación** | La promesa de sellado ya está rota |
| 2 | `last_updated_at` > **inicio** | La docente ya estaba trabajando sobre el instrumento |
| 3 | `last_updated_at` > **primera respuesta** | Hay evidencia respondida contra un instrumento que cambió debajo |
| 4 | `last_updated_at` > **completitud** | Una evaluación cerrada y firmada cambió después |

**El límite:** el contenido original del *snapshot* **no es recuperable desde las tablas actuales**. Eso no es lo mismo que decir que el dato se perdió. Antes de afirmar nada ante la Madre Superiora hay que agotar: **respaldos de Supabase y PITR**, **exportaciones** previas, **semillas comprometidas** en el repositorio, e **informes externos** ya emitidos. Si tras esas cuatro vías el conteo de la banda 4 sigue siendo mayor que cero y sin fuente de reconstrucción, entonces —y sólo entonces— hay que decírselo: contradice una promesa hecha en su nombre.

---

## 7-bis. El carril de datos — la descomposición de B9b

Diez work items `DATA`, todos `BLOCKED`, todos sin dueño, ninguno autorizado. Escribir datos en producción es clase 3: `git revert` no lo deshace.

| Work item | Qué |
|---|---|
| `W-D-01` | Filas de `programas` — no existe UI ni migración; sin esto no hay licitación ni contrato |
| `W-D-02` | Alta de ~200 cuentas — el único modo funcional hoy es contraseña común; el modo aleatorio crea cero cuentas y ninguna vía envía correo |
| `W-D-03` | La Red Santa Marta y sus ocho vínculos en `red_escuelas` |
| `W-D-04` | Contexto transversal por colegio — catálogo `ab_grades`, niveles y cursos por nivel |
| `W-D-05` | Comunidades de crecimiento y su membresía |
| `W-D-06` | Contratos y *buckets* de horas por colegio |
| `W-D-07` | Histórico de licitaciones con sus documentos |
| `W-D-08` | Asignaciones docente–curso — son las que crean las evaluaciones |
| `W-D-09` | Contenido LMS: rutas, cursos, módulos, lecciones e inscripciones |
| `W-D-10` | Instrumento publicado v1.1.0 con objetivos, indicadores y expectativas |

`W-D-09` y `W-D-10` **no estaban** entre los ocho carriles del plan combinado §7 y se añaden aquí: lo único que crea el contenido de aprendizaje de Santa Marta es el árbol **no versionado** `scripts/demo/seed-sm/`, y ni el contenido LMS ni el instrumento publicado caben en ninguno de los ocho.

---

## 8. Compuertas de activación

Las visitas **empiezan ya**, como descubrimiento, preparación de datos y formación. No se representan como activación.

| Nivel | Requiere | Quién entra |
|---|---|---|
| Visita de descubrimiento | nada | Los ocho colegios, desde ya |
| Piloto de un colegio, sólo personal | B1a–c · B2a–**d** · B3a–c · B4a–d | Una directora + su comunidad + su consultor |
| Dos colegios | + B5 · B6a–d · B7a–b · un ciclo aceptado | Dos directoras de colegios distintos |
| Los ocho, asistido | + B8a–c · B9a · el carril de datos §7-bis · matriz de personas | Toda la red |
| Estudiantes y familias | + B10a–c · aprobación de privacidad | **Bloqueado** |

**El piloto de personal exige B2c además de B2b.** Las veintidós tablas del hallazgo histórico se remedian ahora en tres unidades: B2b cierra las **14 sin referencias**, B2c cierra la **frontera de rutas de aprendizaje** (`learning_paths`, `learning_path_courses` y sus funciones) y B10a diseña política para las **6 referenciadas restantes**. Y desde la revisión 8, B2c sólo puede programarse cuando la reparación gobernada de propiedad **B2d** (`W-B2d-01`, clase 3 — no es un lockdown de tablas sino la transformación de datos que la clasificación B de `W-PC-06` exige) esté autorizada por separado, implementada, revisada de forma independiente, mergeada y ejecutada de forma segura. Mientras B2c no cierre, las tablas de rutas de aprendizaje siguen alcanzables de forma anónima, así que cerrar solo B2b **no** deja el piloto en un estado seguro.

**Dos ejes en RLS.** Audiencia: personal antes que estudiantes. Riesgo de regresión dentro de cada nivel: grupo A (B2b, exactamente 14 tablas sin referencias) primero; después la reparación de propiedad (B2d, clase 3, hoy `BLOCKED`/`UNAUTHORIZED`); la frontera de aprendizaje (B2c, `learning_paths` + `learning_path_courses`, hoy `BLOCKED`) inmediatamente después, y grupo B (B10a, las 6 referenciadas restantes) al final. El hallazgo original de 14 + 8 tablas sigue siendo históricamente correcto: las ocho referenciadas son hoy dos (B2c) más seis (B10a).

---

## 9. Abierto

**Higiene de secretos.** `.env.local.prod-backup-20260822` (2.289 B, modo 600) llevaba desde el 22 de agosto en el directorio del repositorio **sin estar ignorado**: el patrón `.env*.local` de `.gitignore` no cubre un nombre que termina en `-20260822`. Un `git add -A` lo habría comprometido. Se añadieron `.env.local.prod-backup-*` y `.env*.backup*` a `.gitignore`. **El dueño del repositorio autoriza conservar ese cambio exacto: no se revierte ni se modifica.** Lo que sigue abierto es sacar el archivo del directorio del repositorio y rotar lo que contenga — decisión de Brent, y conviene hacerlo antes del primer *commit* de implementación.

**Los ledgers ya son versionables.** `.gitignore:136` (`*.csv`) ocultaba a git los tres artefactos normalizados y el legacy archivado: un registro congelado que git no puede ver no está congelado. Con autorización explícita de Brent se añadió la negación estrecha `!docs/reviews/**/*.csv` bajo esa línea. Es un glob acotado a `docs/reviews/`: cualquier otro `.csv` del repositorio sigue ignorado, y el bloque `.env.local.prod-backup-*` no se tocó.

**Profundidad de verificación.** De las 160 reclamaciones, **106 tienen verificación de un solo agente**, 28 de una lente y 26 de dos. **La revisión 4 afirmaba que las P0 estaban a dos lentes o eran condicionales triviales; era falso.** Sólo 21 de las 36 P0 llegan a dos lentes. Las otras 15 no: seis `BROKEN` a una lente — `SWEEP-MI-APRENDIZAJE-05`, `A14-1`, `A15-1`, `SWEEP-NONFUNCTIONAL-EMAIL-FROM-CONTRACT`, `SWEEP-NONFUNCTIONAL-EMAIL-MEETING-SUMMARY` y `SWEEP-PRIOR-AUDIT-14` — y nueve `CONDITIONAL` verificadas por un solo agente. En la muestra desafiada de forma adversarial, **1 de cada 4 hallazgos** traía al menos una cita `archivo:línea` imprecisa aunque el defecto de fondo fuera real: **verificar la cita antes de tocar el archivo**.

**Seis comprobaciones de producción, en solo lectura. Cinco siguen sin autorizar y sin ejecutar; la sexta — `W-PC-06` — fue autorizada explícitamente por Brent y se ejecutó el 2026-08-28** (detalle más abajo). `authorization_owner` es quien puede autorizarlas; en las cinco restantes `execution_owner` está vacío porque no hay ejecutor asignado, y eso **no** es permiso para inventar un nombre. Los dos campos responden preguntas distintas y nunca se reutiliza uno como el otro — `W-PC-06` los registra por separado: autorizó Brent; ejecutaron Brent (consultas 1-4) y Codex (consulta 5).

| # | Comprobación | Work item |
|---|---|---|
| 1 | Filas de `feriados_chile` 2026–2027 *(además decide la clase de B8b)* | `W-PC-01` |
| 2 | Red Santa Marta y sus ocho `red_escuelas` | `W-PC-02` |
| 3 | Dominio remitente verificado en Resend | `W-PC-03` |
| 4 | Bucket `community-images` | `W-PC-04` |
| 5 | **B5-pre** — instancias en riesgo, estratificadas según §7 | `W-PC-05` |
| 6 | Clasificación de datos de rutas de aprendizaje *(decidió el backfill y la clase de B2c — **ejecutada 2026-08-28, clasificación B**)* | `W-PC-06` |

Las seis están enlazadas a reclamaciones P0. Un chequeo P0 sin autorizar **sigue bloqueando la activación** — eso aplica hoy a las cinco pendientes.

**`W-PC-06` — ejecutada y cerrada (2026-08-28).** Cronología de autorización: Brent (`authorization_owner`) autorizó explícitamente la comprobación en solo lectura y **ejecutó personalmente las consultas 1-4 en el SQL Editor de producción**; antes de la consulta 5, **Codex hizo una única lectura de metadatos por la Management API, de solo lectura (`supabase projects list --output json`), para confirmar el enlace ya existente y su estado** — sin consultar filas, sin PII y sin crear ni cambiar nada; **no es una de las cinco consultas de base de datos**; la **consulta 5 la ejecutó Codex a través del CLI ya vinculado (`supabase db query --linked`, que también opera por la Management API de Supabase), únicamente tras una autorización explícita posterior de Brent, también de solo lectura** — fue la **única llamada de consulta de base de datos por la Management API explícitamente autorizada** y envió **un único SELECT acotado de solo lectura**; **ninguna de las dos llamadas por la Management API creó ni cambió enlace de Supabase, credencial, configuración del proyecto, dato, esquema, GRANT, política, ajuste de RLS, función, ledger de migraciones, despliegue ni ningún otro estado**. Evidencia devuelta — **solo agregados y esquema; ninguna fila, identificador, nombre, correo, texto libre ni PII de menores**: 7 `learning_paths`, las 7 con `school_id` y `generation_id` nulos y **ninguna con colegio efectivo resoluble**; 6 con `created_by` y 1 sin él, y cada uno de los 6 creadores tiene exactamente un candidato de colegio por rol activo con alcance **pero también un rol activo sin alcance — no es propiedad autoritativa**; 22 `learning_path_courses`, cero huérfanas, las 22 heredan el alcance padre sin resolver; **883 asignaciones, todas directas a usuario y cero de grupo** — 86 con cero candidatos de colegio, 793 con exactamente uno y 4 con varios; de los 7 paths, **los 6 con asignaciones abarcan todos varios colegios candidatos** y 1 no tiene asignaciones. Resultado: **clasificación B — DATA TRANSFORMATION REQUIRED**, registrada con fecha y personas en el work item y, en detalle, en `docs/reviews/w-pc-06-learning-path-data-classification-2026-08-28.md`. Consecuencia gobernada: la reparación de clase 3 es `W-B2d-01` (§3, §4), que **no elige colegios, no decide la semántica global/compartida frente a por-colegio, no define algoritmo y no escribe SQL** — todo eso pertenece a su implementación autorizada por separado. Este cierre no autoriza ninguna otra consulta a producción.

### Investigación RLS más amplia — DIFERIDA, sin programar, sin autorizar

El registro congelado de Santa Marta **no contiene ninguna reclamación** sobre la superficie más amplia de privilegios de función fuera de las rutas de aprendizaje, así que esta línea de trabajo **no se representa como work items del ledger**: inventar una reclamación, alterar los denominadores 160/36, forzar un mapeo ajeno o debilitar el invariante de trabajo huérfano sería falsear el registro. Queda gobernada aquí, como tres unidades diferidas estables — las tres **DIFERIDAS/BLOQUEADAS, no implementadas, no programadas y no autorizadas**:

| Unidad | Alcance | Condición |
|---|---|---|
| **D-RLS-01** | **Relevar de nuevo, contra `main` actual, la superficie EXECUTE de funciones no-learning:** `has_transformation_access`, `get_available_assignment_templates`, `cleanup_propuesta_rate_limits`, `has_global_workspace_access`, `submit_quiz`. Es redescubrimiento fresco —callers, políticas dependientes y privilegios rederivados desde `main` actual— **antes de cualquier implementación**, y **no** implica operación git alguna sobre `fix/rls-public`. `profiles_role_backup` queda excluida: el lockdown de su tabla ya lo gobierna B2b. | DIFERIDA; ninguna implementación definida |
| **D-RLS-02** | **Evaluar y gobernar por separado el rediseño de actor/cuerpo** de `has_global_workspace_access` y `submit_quiz` (identidad derivada de la sesión, no de parámetros del caller). | DIFERIDA; **depende de D-RLS-01** y se mantiene separada de todo cambio mecánico de GRANT |
| **D-RLS-03** | **Reconstruir el inventario, sobre `main` actual, de la superficie `SECURITY DEFINER` restante con GRANT a `anon`, y clasificarla.** La cifra «80 firmas» del plan antiguo es **evidencia histórica medida en el head de investigación `565faa0d`**, no un conteo vigente: antes de programar nada se exige un **reconteo local sobre `main` actual**, sin operación git alguna sobre `fix/rls-public`. D-RLS-03 es **sólo descubrimiento**; la remediación posterior queda indefinida hasta que exista esa evidencia. | DIFERIDA; reconteo previo obligatorio |

**La rama `fix/rls-public` (`565faa0d4604d4e992e2a29f38ac248cac4aef2a`) es únicamente evidencia de investigación.** Se lee con `git show 565faa0d…:docs/plan/rls/PLAN.md`; no se rebasa, no se mergea, no se cherry-pickea, no se edita su worktree y **ninguno de sus commits se reutiliza en bloque**. Cuando alguna unidad D-RLS se active, será con autorización explícita de Brent, contra evidencia re-derivada de `main` actual, y con sus propias reclamaciones o actas si el gobierno del momento las exige.

**Sesenta y siete work items sin dueño**, que alcanzan **80 reclamaciones**, de las cuales **4 son P0** — las cuatro del carril de datos. Ninguna se cierra con código.

**Un estado de deriva de rama que ambas auditorías originales tuvieron mal:** `fix/auth-sec2` **no** es «main más el endurecimiento de autenticación». Forkó en `4399949`, *antes* de `717c2c09` (Z7, PR #49); `git diff HEAD main --stat` = 283 archivos. Fusionarla es una integración, no un fast-forward. **Y desde la corrección de inventario del 2026-08-27 consta además que la rama ya no existe** en el repositorio canónico ni en el remoto vivo — se conserva en el repositorio congelado `/Users/brentcurtis/dev/fne-lms` como la rama local `refs/heads/fix/auth-sec2` apuntando exactamente a `4b87243c` (§4), así que B10c empieza por una restauración/copia autorizada explícitamente por Brent desde esa rama congelada, no por un checkout en el canónico.

**Advertencia de línea base.** `main` en `717c2c09` es la línea base del repositorio que se cree corresponde a la presentación del 22 de agosto. **El estado real del despliegue no está verificado de forma independiente:** un `main` sin cambios no prueba que un despliegue tuviera éxito, ni que la configuración y los datos de producción coincidan con él. `PROJECT_STATE.md` ya registra una fase que cerró en verde y dejó la aprobación de sesiones rota en producción durante días porque el checklist no incluía aplicar las migraciones.

**La aceptación pendiente se mide en el registro mutable, no en la instantánea congelada.** Las 160 filas del registro congelado conservan `firmado_por` y `fecha_firma` vacías **por diseño y para siempre** (son una instantánea histórica byte-preservada). El trabajo restante es registrar, lote por lote, **las dos componentes** en los work items o en actas de aceptación gobernadas: la evidencia técnica de cierre y la aceptación con persona y fecha. Hasta ahora sólo **un lote tiene las dos componentes registradas: B2b** (cierre técnico 2026-08-28 y aceptación de Privacidad evidenciada con persona y fecha — §2); `W-B2a-01` tiene sólo el cierre **técnico** y **su aceptación de parte interesada con persona y fecha sigue sin evidenciarse**; los demás lotes no tienen ninguna, y no se inventa ninguna para aparentar lo contrario. *(Esta frase corrige, en la revisión 8, un arrastre de la revisión 6 que seguía afirmando «sólo una componente en todo el ledger» después de que la revisión 7 evidenciara la aceptación de B2b.)*

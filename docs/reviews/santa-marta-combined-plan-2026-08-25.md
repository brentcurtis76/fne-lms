# Plan combinado — Red Santa Marta

> **Historical audit artifact.** Its operational counts and scheduling are superseded by the
> normalized claim/work ledgers and the active release protocol; its original findings remain
> provenance.
>
> **What governs current scheduling:** `santa-marta-release-protocol-2026-08-25.md` at
> **revision 10** together with the normalized ledgers (`santa-marta-claims.csv`,
> `santa-marta-work-items.csv`, `santa-marta-work-claim-map.csv`), reconciled by
> `scripts/check-ledger.mjs`. Dated audit prose in this file — including its wave numbering
> and effort estimates — is historical evidence, not a current schedule. Where this file and
> revision 10 disagree, revision 10 wins; the only in-place corrections made here are the
> B2b/B2c split of former row 0.4 and the group-B table count in §5 (2026-08-27), the
> W-B2b production-closure annotation to row 0.4 (2026-08-28), the W-PC-06
> classification-closure annotation to row 0.4-bis (2026-08-28), and the global-semantics
> correction annotation to row 0.4-bis (2026-08-29), the merge evidence for that
> governance correction, and the seeded-simulation row 0.4-ter (2026-09-02). Revisions 6 through 9 remain
> this banner's historical provenance: revision 6 governed from 2026-08-27 until revision 7
> (the 2026-08-28 W-B2b production closure) superseded it, revision 7 governed until
> revision 8 (the same-day W-PC-06 classification closure and B2d creation) superseded it,
> and revision 8 governed until revision 9 (the 2026-08-29 owner decision — learning paths
> are global FNE templates, literal-admin-only management, W-B2d-01 SUPERSEDED unexecuted,
> W-B2c-01 reclassified class 2) superseded it. Revision 9 governed until revision 10
> added the blocked, unauthorized seeded-simulation planning lane; it did not authorize
> provisioning, implementation, deployment, or hosted data work.

**Fecha:** 25 de agosto de 2026
**Reemplaza como plan operativo a:** §7–§8 de `santa-marta-deliverability-audit-2026-08-24.md` (Codex) y §5 de `santa-marta-promise-audit-2026-08-24.md` (Claude).
**Los dos informes siguen vigentes como evidencia.** Este documento sólo fusiona el plan.

---

## 0. Corrección que precede a todo el plan

Ambas auditorías describieron `fix/auth-sec2` como «main más el endurecimiento de autenticación». **Es falso, y los dos lo dijimos.**

```
git merge-base main HEAD          → 4399949942bf…      (no es main)
git merge-base --is-ancestor main HEAD → NO
git log --oneline main ^HEAD      → 717c2c09 feat(zoom): Z7 attendance + audited hour overrides (#49)
git diff HEAD main --stat         → 283 files changed, +38776 / −26923
```

`fix/auth-sec2` se bifurcó **antes** de Z7. Consecuencias que cambian el plan:

1. **Fusionar `fix/auth-sec2` no es un fast-forward.** Es una integración real de 283 archivos que, mal hecha, revierte Z7 (asistencia y overrides auditados de horas). Sale de la Ola 3 como «desplegar» y entra como **tarea de integración con su propia planificación**.
2. **El árbol de trabajo no es referencia para nada relacionado con horas.** `git show HEAD:lib/services/school-hours-report.ts | grep -c effective_minutes` → `0`; en `main` → `2`. La edición sin *commit* de ese archivo está hecha sobre una versión pre-Z7.
3. **La cautela de Codex sobre PR #50 estaba mejor fundada que la confianza de Claude.** Codex escribió «merge PR #50 *after confirming compatibility with the current Z7 effective-minutes logic*». Eso ahora es obligatorio, no opcional.

**Acción previa a la Ola 0:** decidir el destino de `fix/auth-sec2` (rebase sobre `main`, o integración explícita) antes de tocar cualquier otra rama, para que ninguna rama nueva se saque de una base pre-Z7.

---

## 1. Rúbrica de estado

De Codex. Se adopta tal cual — es más clara que la implícita de Claude.

| Estado | Significado |
|---|---|
| **Ready in code** | En `main`, con tests relevantes, sin defecto conocido en la jornada prometida. Puede requerir *smoke test* de configuración. |
| **Conditional** | Implementación sustancial, pero queda una condición de fiabilidad, onboarding, datos, alcance o verificación en producción. |
| **Not ready** | Un defecto conocido o un servicio ausente hace la promesa falsa o poco fiable hoy. |
| **Future, disclosed** | No implementado, pero presentado explícitamente como trabajo futuro. No es promesa rota. |

**Regla añadida (de la calibración de Claude):** ningún estado se fija sin una segunda lectura que intente refutarlo. En la primera pasada, 13 de 54 defectos P0 no sobrevivieron al desafío — una tasa de error del 24 % que ninguna auditoría de una sola pasada puede detectar en sí misma.

---

## 2. Ola 0 — Antes de que entre el primer colegio · 2–3 días

**Entrada:** decidido el destino de `fix/auth-sec2` (§0).

| # | Trabajo | Rama | Esf. |
|---|---|---|---|
| 0.1 | Fusionar **PR #50** `fix/horas-rep` — **tras confirmar compatibilidad con la lógica Z7 de `effective_minutes`** | — | S |
| 0.2 | Abrir PR para **`fix/gate-score`** y fusionar. Destraba la compuerta de cobertura | — | S |
| 0.3 | `name` → `nombre` en `pages/api/admin/networks/supervisors.ts:79,110,121,131,144`; comprobar `error` en ambos lookups; quitar `updated_at` del payload | `fix/red-super` | S |
| 0.4 | **[Corregido 2026-08-27 — división B2b/B2c] [CERRADO EN PRODUCCIÓN 2026-08-28]** Cierre RLS grupo A (`W-B2b-01`, lote B2b): **exactamente las 14 tablas legacy sin referencias en código**. `REVOKE ALL FROM anon, authenticated` + `ENABLE ROW LEVEL SECURITY`. Vía flujo del agente de BD. *La fila original plegaba aquí `learning_paths` y `learning_path_courses`; esa consolidación queda superada.* **Cierre:** PR #59, merge `0377edbf`, migración `20260827170000` aplicada por Brent en producción y verificada (preflight/postflight completos, conteos intactos); aprobación de Privacidad registrada en el PR (Brent Curtis, 2026-08-27). No re-aplicar. | `fix/rls-anon` | L |
| 0.4-bis | **[Añadido 2026-08-27]** Frontera de rutas de aprendizaje (`W-B2c-01`, lote B2c, **BLOQUEADA**): `learning_paths`, `learning_path_courses`, sus GRANT/RLS y sus seis funciones (`create_full_learning_path`, `update_full_learning_path`, `batch_assign_learning_path`, `start_learning_path_session`, `end_learning_path_session`, `auth_is_learning_path_member`), con aislamiento por colegio y tenant. **[Clasificación cerrada 2026-08-28]** `W-PC-06` terminó en solo lectura con autorización explícita de Brent y clasificación **B — DATA TRANSFORMATION REQUIRED**; el work item clase 3 exigido es `W-B2d-01` (lote B2d, rama `data/lp-scope`, BLOQUEADO, sin autorizar), que debe autorizarse por separado, implementarse, revisarse de forma independiente, mergearse y ejecutarse de forma segura ANTES de programar B2c; después, Privacidad aprueba la matriz rol × tenant. B2c no absorbe el trabajo clase 3. **[Corregido 2026-08-29 — semántica global por decisión del dueño]** Las rutas son **plantillas globales FNE** (ningún colegio es dueño; no específicas de generación; NULOS = alcance global intencional; la asignación da disponibilidad, no propiedad) y la gestión es **exclusiva del rol literal `admin`** — el objetivo «aislamiento por colegio y tenant» de esta fila queda retirado como registro histórico. Conclusión efectiva de `W-PC-06`: **clasificación A** (la B histórica se conserva como registro); `W-B2d-01` queda **SUPERSEDED sin ejecutar** y no es prerrequisito; `W-B2c-01` pasa a **clase 2**. **[Gobernanza mergeada 2026-08-31]** PR #65, head aprobado `d8f9ea38`, merge `49814091`, satisface sólo el prerrequisito 1; sigue BLOQUEADA por (2) matriz de acceso actor × operación aprobada por Privacidad y (3) autorización explícita y separada de Brent. Su alcance corregido es de **cuatro tablas y ocho funciones** más rutas API/servicios/efectos colaterales — inventario en `docs/reviews/w-b2c-01-learning-path-governance-correction-2026-08-29.md` | `fix/rls-learn` | — |
| 0.4-ter | **[Añadido 2026-09-02 — simulación sembrada, NO piloto real]** `W-SIM-01` (`MERGE`, clase 0, lote `SIM1`) y `W-SIM-02` (`DATA`, clase 3) documentan una futura simulación con personas adultas sintéticas en un staging Supabase dedicado y no productivo. Ambos están **BLOCKED/UNAUTHORIZED**. Sus cuatro enlaces a `SWEEP-MI-APRENDIZAJE-09` y `SWEEP-ONBOARDING-DATA-01` son evidencia **NO CERRANTE**, no remediación. Esta fila autoriza sólo la documentación D0: no aprovisiona, implementa, despliega ni escribe datos; el merge de W-SIM-01 no autoriza W-SIM-02. | `feat/sm-sim` / datos separados | — |
| 0.5 | Fijar `EMAIL_FROM_ADDRESS` y **verificar el dominio remitente en Resend** | config | S |
| 0.6 | Nombrar los cuatro dueños: *release*, ingeniería, onboarding/operaciones, privacidad | — | — |

**Salida (todas, sin excepción):**
- Cuatro compuertas verdes en el SHA combinado exacto.
- Migraciones aplicadas a producción **y verificadas en solo lectura** contra `schema_migrations`.
- Un envío sintético recibido en una casilla de colegio real.
- Las cuatro comprobaciones de solo lectura en producción resueltas (§6).

---

## 3. Ola 1 — Que la primera reunión funcione · Semana 1

| # | Trabajo | Rama | Esf. |
|---|---|---|---|
| 1.1 | Políticas INSERT+SELECT en `meeting_agreements` y `meeting_tasks` (`can_edit_meeting(auth.uid(), meeting_id)`) + pgTAP | `fix/meet-save` | M |
| 1.2 | Propagar `.error` de los **cuatro** inserts hijos (`utils/meetingUtils.ts:347-413`) y los **tres** bucles de update; `applyMeetingDiffs` → `Promise<{success,error}>`; `MeetingDocumentationModal.tsx:735` honra el resultado | `fix/meet-save` | M |
| 1.3 | Exigir `assigned_to` + `due_date` en UI, API y BD; coercer `''` → `null` | `fix/meet-save` | M |
| 1.4 | `const { data, error }` en `lib/emailService.js:37-48` (patrón de `expenseNotifications.ts:235-245`); toast ramifica sobre `sent`/`failed` | `fix/mail-truth` | S |
| 1.5 | Retorno temprano de `consultor` en `middleware.ts:184-190`; decidir explícitamente sobre `supervisor_de_red` | `fix/consultor` | S |
| 1.6 | Poblar `session_attendees` desde la membresía de la comunidad al crear/aprobar sesión — **una causa, tres síntomas** (A05-1 / A05-2 / A05-6) | `fix/consultor` | M |
| 1.7 | «Panel de Resultados» visible para `equipo_directivo` **por hijo**, sin abrir el grupo `vias-transformacion` (abrirlo duplica «Contexto Transversal») | `fix/nav-dir` | S |
| 1.8 | **Reconciliación de asignación docente→evaluación**: el endpoint devuelve HTTP 207 tras persistir la asignación cuando falla la creación de evaluaciones, dejando los dos estados divergentes. Añadir *preflight* y acción de reparación | `fix/assign-rec` | M |

**Salida:** una reunión sintética completa —acuerdos, compromisos con responsable y plazo, finalizar y enviar— reabierta y verificada, más el correo **recibido**. e2e obligatoria sin *skips*. Resultado cero-errores en la asignación docente→evaluación.

---

## 4. Ola 2 — Que los números sean ciertos · Semanas 2–3

| # | Trabajo | Rama | Esf. |
|---|---|---|---|
| 2.1 | Inmutabilidad real del *snapshot*: eliminar `updatePublishedTemplateSnapshot()` y sus **diez** llamadas; bloquear edición de publicados forzando nueva versión | `fix/snapshot` | L |
| 2.2 | Cierre de sesión: relajar precondición en `pages/api/sessions/[id]/finalize.ts:68` a `programada`/`en_progreso` con instante de término pasado (`America/Santiago`), y los dos *gates* en `pages/consultor/sessions/[id].tsx:546,1318` | `fix/sess-close` | M |
| 2.3 | `profiles.role` → `user_roles.role_type` en `analytics-data.ts`, `community.ts`, `course-analytics.ts`; sacar el cliente anon de navegador del servidor en `analytics-data.ts:2`; reparar `schools.community_id` inexistente en `reports/school.ts:114` | `fix/net-tabs` | M |
| 2.4 | Proyección de transformación filtrada por `school_transversal_context.grade_levels` | `fix/plan-pct` | M |
| 2.5 | Feed leído desde el servidor con autores visibles | `fix/feed-srv` | L |
| 2.6 | Migración de feriados chilenos 2026–2028 + alarma de vencimiento anual | `fix/feriados` | S |
| 2.7 | Cron autenticado y observable para vencimientos de licitación, con evento «hoy» correcto, entrega idempotente y escalamiento de vencidos | `fix/lic-cron` | M |
| 2.8 | **Eliminar el DELETE duro de licitaciones.** Sustituir por archivado/soft-delete con motivo, actor y retención; auditar toda mutación de metadatos | `fix/lic-audit` | M |
| 2.9 | Completitud explícita del ZIP: mostrar resultado antes de descargar o **fallar cerrado**; resolver colisión de nombres de archivo | `fix/zip-full` | S |

**Salida:** un año escolar sintético completo de punta a punta en *staging*, con controles negativos entre colegios y entre redes.

---

## 5. Ola 3 — Endurecimiento durante las visitas · Semanas 4–6

- RLS grupo B — **[corregido 2026-08-27]** las **6** tablas legacy referenciadas restantes que necesitan política, no revocación (`group_assignment_discussions`, `growth_community_transformation_access`, `instructors`, `modules`, `propuesta_rate_limits`, `qa_tester_time_logs`). El hallazgo original de **8** tablas referenciadas sigue siendo históricamente correcto: se remedia hoy como **2** (`learning_paths` y `learning_path_courses`, movidas a la unidad B2c de la fila 0.4-bis) más estas **6**.
- *Outbox* durable de correo con reintentos y estado de entrega visible.
- **Inicializar Sentry** (hoy configurado pero nunca inicializado en ningún *runtime*) + `_error` / 404 / 500 / *error boundary*.
- Límite real de 25 MB en subidas; «Descargar Todo» en licitaciones importadas.
- **Integración de `fix/auth-sec2`** — tarea propia, con su base corregida (§0), no un despliegue.
- Reemplazar `NotificationService`: hoy ninguna rama produce correo (`lib/notificationService.ts:1134` es un `// TODO`), y dos RPC que invoca no existen en el esquema.

---

## 6. Las cuatro comprobaciones de producción, en solo lectura

Ninguna auditoría pudo resolverlas — las reglas del proyecto prohíben consultar la base productiva. Son la única brecha de evidencia real que queda, y las cuatro se responden en minutos con autorización explícita.

1. ¿Existen filas en `feriados_chile` para 2026–2027? *(La semilla vive sólo en `migrations-archive/`.)*
2. ¿Están creadas la Red Santa Marta y sus ocho vínculos en `red_escuelas`?
3. ¿Está verificado el dominio remitente en Resend?
4. ¿Existe el bucket `community-images`?

Codex añadió una comprobación que Claude no hizo y que conviene repetir cada ola: **verificación de solo lectura del sitio público** (`https://www.nuevaeducacion.org`) — portada, login alcanzable, y una ruta protegida que redirige correctamente.

---

## 7. La pista de datos (no es código)

| Qué | Estado | Dueño |
|---|---|---|
| Filas de `programas` | **No existe UI ni migración.** Las once referencias del repo son lecturas. Sin esto no hay licitación ni contrato | ⬜ |
| Alta de ~200 cuentas | Único modo funcional: misma contraseña para todos. El modo aleatorio **crea cero cuentas** (cada contraseña generada falla el requisito de mayúscula). Nunca se envía correo | ⬜ |
| 8 colegios + `red_escuelas` | Los *seeders* de la demo lo enumeran, pero son locales y no versionados | ⬜ |
| Contexto transversal por colegio | Niveles y cursos, por colegio | ⬜ |
| Comunidades y miembros | Por colegio | ⬜ |
| Contratos + *buckets* de horas | Por colegio | ⬜ |
| Histórico de licitaciones + documentos | Importable; la completitud es trabajo de datos | ⬜ |
| Asignaciones docente–curso | Son las que crean las evaluaciones (ver 1.8) | ⬜ |

> **La trampa que este repositorio ya conoce.** `PROJECT_STATE.md` registra una fase que cerró en verde y dejó la aprobación de sesiones rota en producción durante días porque el *checklist* no incluía aplicar las migraciones. Cada ola de este plan lleva migraciones. Verde local y verde en CI no dicen nada sobre el esquema desplegado.

---

## 8. Matriz de aceptación

De Codex, ampliada con los defectos que su informe no cubría. **Ningún control «si existen datos» cuenta como evidencia.**

### Personas obligatorias en *staging*

`admin` · un **Líder de Red** · dos directoras de **colegios distintos** · un `encargado_licitacion` · un `consultor` · una `docente` · **controles negativos** entre colegios y entre redes.

### Jornadas obligatorias

1. Configurar la red, y **revocar y reasignar** su líder.
2. Crear comunidad, **renombrarla**, publicar en el feed y **ver el nombre del autor de otra persona**.
3. Documentar una reunión con acuerdos y compromisos; **reabrirla y verificar que siguen ahí**; finalizar y **probar entrega real del correo**.
4. Como **consultora**, entrar al espacio de una comunidad de la que no se es miembro y levantar el acta.
5. Contexto + plan de migración; **verificar el porcentaje contra los niveles reales del colegio**; asignar docente; completar evaluación con compuerta abierta **y cerrada**; verificar resultados y agregados.
6. **Editar un template publicado y probar que las evaluaciones ya aplicadas no cambian.**
7. Aprobar / unirse / reprogramar / cancelar una sesión Zoom; **cerrarla**; reconciliar pantalla de horas, CSV y PDF, **con la columna Asistencia poblada**.
8. Licitación sintética de siete pasos; **recibir la alerta de plazo sin abrir ninguna página**; generar y descargar documentos; exportar historial; generar y vincular el contrato.
9. Probar cada denegación entre colegios y entre redes, y todas las operaciones RLS relevantes.
10. Como **directora**, llegar al Panel de Resultados **desde el menú**.

---

## 9. Compuertas de GO / NO-GO

Adoptadas de Codex §8, corregidas y ampliadas. Es GO sólo cuando **todas** son ciertas.

- [ ] Resuelto el destino de `fix/auth-sec2`; ninguna rama activa sale de una base pre-Z7.
- [ ] PR #50 y `fix/gate-score` fusionados en `main` y desplegados por la ruta normal, con compatibilidad Z7 confirmada.
- [ ] Todas las compuertas del repositorio verdes en el SHA combinado exacto.
- [ ] Migraciones aplicadas a producción **y verificadas en solo lectura**.
- [ ] El Líder de Red se puede crear, revocar y acotar a exactamente ocho colegios **sin trabajo manual en base de datos**.
- [ ] Un acuerdo escrito en una reunión sigue ahí al reabrirla.
- [ ] Un compromiso sin responsable o sin fecha **se rechaza visiblemente** y no destruye sus hermanos.
- [ ] El resumen de reunión llega a una casilla real, y la UI dice la verdad cuando no llega.
- [ ] Una evaluación con compuerta cerrada **se envía** y puntúa cero pese a autoguardados obsoletos.
- [ ] Editar un template publicado **no altera** ninguna evaluación ya aplicada.
- [ ] La pantalla de horas, el CSV y el PDF concuerdan para la misma sesión sintética, con asistencia.
- [ ] Las seis pestañas del panel de red cargan para el Líder de Red.
- [ ] Las alertas de plazo llegan **sin que nadie abra una página**.
- [ ] Un registro de licitación **no se puede destruir**, y toda mutación material queda auditada.
- [ ] Las cuatro comprobaciones de producción (§6) resueltas.
- [ ] Rollout a estudiantes y familias **bloqueado** hasta cerrar el grupo B de RLS.
- [ ] El calendario de las ocho visitas tiene dueño, fecha y evidencia semanal.
- [ ] La Madre Superiora y al menos una directora firman la aceptación de red y de colegio.

---

## 10. Qué aporta cada informe

| | Codex | Claude |
|---|---|---|
| Granularidad | 25 promesas temáticas | 160 afirmaciones de lámina |
| Verificación | Una pasada | Dos pasadas; los 54 P0 desafiados desde dos ángulos |
| Precisión donde fue específico | **11 de 11 afirmaciones técnicas comprobables: correctas** | 7 hallazgos refutados, 20 degradados, 10 de 40 con cita imprecisa |
| Estructura de decisión | Rúbrica de estados, compuertas GO/NO-GO, matriz de personas | Olas con ramas, causas raíz consolidadas, fixes a nivel de línea |
| Punto ciego compartido | Topología de `fix/auth-sec2` | Topología de `fix/auth-sec2` |

Los dos informes conservan valor independiente. Este plan es la intersección accionable.

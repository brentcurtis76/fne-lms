# Auditoría de entregabilidad — Red Santa Marta

> **Historical audit artifact.** Its operational counts and scheduling are superseded by the
> normalized claim/work ledgers and the active release protocol; its original findings remain
> provenance.

**Qué se audita:** las promesas hechas en los Bloques 4 y 5 de la Jornada de Formación de Líderes, sábado 22 de agosto de 2026, ante las directoras de los ocho colegios Santa Marta y la Madre Superiora (Líder de Red).
**Fecha de auditoría:** 24 de agosto de 2026.
**Contrastado contra:** `main` @ `717c2c09` — el SHA que se despliega hoy, sin commits desde el 17 de agosto.
**Fuentes de promesa:** `Bloque 4 - Plataforma GENERA.pdf` (17 láminas), `Bloque 5 - Licitaciones.pdf` (9 láminas), `Monjas 2.pdf` (guión de sala, 27 páginas).

---

## Veredicto

**No abrir las cuentas esta semana.**

La plataforma no es una maqueta: la mayor parte de lo mostrado existe y funciona. Pero de las **160 promesas verificables**, **27 fallan en el primer contacto**, y no están en la periferia — están en el centro emocional del bloque: los acuerdos de una reunión se guardan en silencio y no quedan, el resumen por correo declara "enviado a 14 destinatarios" sin saber si salió, y el Reporte de Horas devuelve error en todo colegio que tenga un contrato cargado.

La ruta honesta es corta. **Dos merges ya escritos y sin fusionar** destraban dos de los peores defectos. El resto es aproximadamente dos semanas de trabajo acotado antes de que entre el primer colegio. Las seis semanas de visitas siguen siendo viables — de hecho son el mecanismo correcto para absorber lo que quede.

### Cifras

| | |
|---|---|
| Promesas verificadas contra el código | **160** |
| Se sostienen tal como se dijeron | **27** |
| P0 confirmados por verificación adversarial | **27** |
| P1 — fallan dentro de las seis semanas | **43** |
| P2 — cosméticos o de bajo alcance | **6** |
| Declaradas como futuras, correctamente | **2** |

De los **54 defectos P0** que arrojó la primera lectura: 27 sobrevivieron al desafío adversarial, 20 bajaron a P1/P2, y **7 fueron refutados por completo** (§7).

---

## 1. La honestidad del bloque se sostuvo

Antes del listado de fallas, lo que la auditoría confirma sobre la presentación misma.

La "regla de honestidad" del guión funcionó. Las dos pantallas declaradas inexistentes —el panel comparativo de la red y la comparación año contra año— efectivamente no existen, y se nombraron sin mostrarlas. Los cuatro descargos escritos en las notas del guión resultaron **todos correctos**:

- Zoom no marca asistencia solo. Correcto.
- No hay grabación ni transcripción. Correcto.
- No hay Zoom embebido activo — `FEATURE_ZOOM_EMBED` está apagada por defecto. Correcto.
- Las sesiones del asesor y las reuniones de la comunidad son dos sistemas distintos; un compromiso no cuelga de una asesoría. Correcto.
- El Panel de Resultados promedia sin comparar, y no implica evolución. Correcto.

No se prometió nada inexistente *por decisión*. El problema es distinto y más incómodo: **se prometieron cosas que sí están construidas, pero que se rompen al usarlas**. Casi todo lo que sigue es de esa clase — código escrito, revisado, con tests que pasan, que falla en el primer intento real porque el test simula exactamente la parte rota.

### Salvedad sobre la evidencia

Todo lo mostrado el 22 de agosto se sembró contra un Supabase **local**, mediante un *seeder* no versionado (`scripts/demo/seed-sm/`) con vallas anti-producción. Eso no invalida nada de lo mostrado —las pantallas son reales— pero significa que **ninguna pantalla fue jamás ejercida contra producción**. Las reglas del proyecto prohíben tocar la base productiva, así que esta auditoría no la consultó. Todo lo marcado "requiere verificación en producción" necesita una revisión de solo lectura autorizada.

---

## 2. Lo que se sostiene

Verificado en código, no inferido. Se puede afirmar sin matices.

| Promesa | Evidencia |
|---|---|
| **Los siete pasos con candado** | La máquina de estados valida prerrequisitos en el servidor, no sólo en la UI. No se puede adjudicar antes de evaluar. |
| **El acta firmada como compuerta** | Sin acta subida, el estado no avanza. No hay atajo. |
| **El ranking ponderado 70/30 en tiempo real** | La aritmética es correcta y se recalcula sola. Nadie lleva planilla aparte. |
| **La cadencia legal +5/+3/+5/+3** | `lib/businessDays.ts` calcula días hábiles correctamente y salta fines de semana. |
| **Las seis carpetas del Archivo Histórico** | Publicaciones, Bases, Propuestas, Evaluación, Adjudicación, Anexos + constancia Ley SEP. El conjunto coincide. |
| **El contrato pre-cargado desde la adjudicación** | Cliente, programa y monto UF se arrastran. Nadie retipea. |
| **La RBAC de licitaciones** | `equipo_directivo` genuinamente no ve el módulo; `encargado_licitacion` queda acotado a su colegio; la directora sí puede asignar ese rol. |
| **La escala 0–4 y las cinco categorías** | Cobertura, Frecuencia, Profundidad, Traspaso, Detalle — exactamente las mostradas. |
| **Fortaleza y área de mejora derivadas** | "No lo escribió nadie a mano" es literalmente cierto. |
| **El historial del plan de migración** | Registra quién tocó la matriz y cuándo; sobrevive al cambio de directora. |
| **El bloqueo GT Medio Menor → 2º Básico** | Correctamente forzado. Un primer análisis lo dio por roto; la verificación adversarial lo refutó. |
| **El calendario de la Fundación** | Lista, mes y semana, con filtros y exportación. Funciona como se mostró. |
| **El botón «Unirse» sólo para quien corresponde** | La URL de Zoom nunca entra en el HTML de la página. |
| **Estados de sesión** | Programada, Completada, Cancelada, Penalizada existen como se mostraron. |

---

## 3. Los 27 defectos P0

Cada uno verificado por dos agentes independientes instruidos para refutarlo. Ordenados por **momento de impacto**, no por severidad técnica.

### 3.1 Antes de que nadie entre — onboarding y privacidad

#### A15-1 · La Madre Superiora no puede ser dada de alta

> «La Red Santa Marta es una entidad de la plataforma, con sus ocho escuelas asignadas.»

La entidad existe, pero **no hay vía de administración para crear al Líder de Red**. Asignar supervisor falla el 100 % de las veces con el toast «Red no encontrada»: la ruta consulta `redes_de_colegios.name` y la columna se llama `nombre`. El camino alternativo (asignar el rol desde gestión de usuarios) escribe `red_id = NULL` en silencio, dejando su cuenta sin red.

- **Archivo:** `pages/api/admin/networks/supervisors.ts:79,110,121,131,144`
- **Fix:** `name` → `nombre`; comprobar `error` en ambos lookups (patrón `maybeSingle` + fail-closed ya existe en `:175-198`); quitar `updated_at` del payload de `:207-210` — `user_roles` no tiene esa columna.
- **Esfuerzo:** S
- **Nota:** asignar las ocho escuelas a la red **sí funciona**. Sólo falla el supervisor.

#### PRIOR-09 · 22 tablas públicas escribibles con la clave anon

Con sólo la clave *anon* —que el propio login envía al navegador— un actor no autenticado puede **leer y escribir 22 tablas públicas** en producción: otorgarse acceso vía `growth_community_transformation_access`, borrar estructura de cursos (`modules`, `learning_paths`), y leer trabajo de estudiantes (`student_answers`, `submissions`, `answers`, `assignments`). Bajo **Ley 21.719** esto es un bloqueador antes de invitar a una sola estudiante o familia.

- **Alcance:** 14 tablas sin referencias en el código (cierre mecánico) + 8 referenciadas (requieren política).
- **Fix:** por grupos. Grupo A: `REVOKE ALL FROM anon, authenticated` + `ENABLE ROW LEVEL SECURITY`. Grupo B: política por tabla. Vía el flujo del agente de BD, **nunca por toggle** — habilitar RLS a ciegas rompe producción. Matriz pgTAP rol × tabla × operación.
- **Esfuerzo:** L

#### APR-09 · Las rutas de aprendizaje son escribibles por anon

`learning_paths` y `learning_path_courses` **no tienen RLS y tienen `GRANT ALL` a `anon`**. Cualquiera puede reescribir o borrar la secuencia de cursos de los ocho colegios con una sola sentencia.

- **Corrección al hallazgo original:** ninguna de las dos tablas tiene columna `school_id`. El alcance debe hacerse por *join* a `learning_paths.school_id`, que además es **nullable** — una política ingenua deja filas huérfanas visibles para todos.
- **Esfuerzo:** M

---

### 3.2 La primera reunión de comunidad — el corazón del Bloque 4

#### A04-1 · A04-2 · Los acuerdos no se guardan

> «Cada reunión se documenta en tres pasos… un acuerdo es lo que la comunidad decide. No tiene dueño, es del grupo.»

La directora escribe los acuerdos, guarda, y lee «Reunión documentada correctamente». **Los acuerdos nunca se escribieron.** `meeting_agreements` no tiene políticas RLS de INSERT ni SELECT, el insert es rechazado, y el error se descarta. Reabre la reunión y la sección Acuerdos está vacía.

Es la promesa más citada del bloque, y falla en silencio.

- **Fix:** migración aditiva con `CREATE POLICY … ON meeting_agreements FOR INSERT TO authenticated WITH CHECK (can_edit_meeting(auth.uid(), meeting_id))` y su SELECT correspondiente; lo mismo en `meeting_tasks`. Cobertura pgTAP en `supabase/tests/`. La forma *sin dueño* de la tabla ya es correcta — no requiere cambio de esquema.
- **Esfuerzo:** M

#### A04-3 · «El sistema no te deja hacer trampa» — sí te deja

> «Exige un responsable con nombre y apellido, una fecha de vencimiento, un estado y una barra de avance.»

Si falta el responsable o la fecha: no hay validación, no se marca el campo, se reporta éxito — y **el insert por lotes falla, destruyendo en silencio todos los compromisos de esa reunión**, no sólo el incompleto.

Es la frase más fuerte que se dijo sobre el producto, y hoy es falsa en ambas direcciones.

- **Archivos:** `components/meetings/MeetingDocumentationModal.tsx` · `components/meetings/persistMeeting.ts` · `utils/meetingUtils.ts:347-413`
- **Fix:** (1) `validateStep(AGREEMENTS)` exige `assigned_to` + `due_date` no vacíos por fila y marca la infractora; (2) coercer `''` → `null` antes de enviar; (3) propagar `.error` de cada insert/update; (4) `NOT NULL` en BD como red final.
- **Esfuerzo:** L

#### PRIOR-14 · Los errores de escritura se descartan en toda la ruta

Causa raíz más ancha de lo que parece: **los cuatro inserts hijos** (acuerdos, compromisos, tareas, asistentes) y **los tres bucles de update** descartan su error con `console.error`, y `applyMeetingDiffs` devuelve `void`. La UI no tiene forma de saber que falló.

- **Fix:** `applyMeetingDiffs` → `Promise<{success, error}>` cubriendo también el insert de tareas (`:219-231`) y los tres bucles de update (`:177-187`, `:203-213`, `:233-247`); `MeetingDocumentationModal.tsx:735` debe honrar el resultado en vez de asumir éxito.
- **Esfuerzo:** M

#### A04-5 · El correo dice que salió sin saberlo

> «Se aprieta “Finalizar y enviar” y el resumen le llega por correo a toda la comunidad.»

El envío es real — `sendMeetingSummary` (`lib/emailService.js:38`) sí llama a Resend por destinatario. Pero **cuenta los fallos sin lanzarlos**, y `pages/api/meetings/[id]/finalize.ts:258` sólo marca fracaso ante una excepción. Resultado: «enviada a 14 destinatarios» aunque hayan fallado los 14.

Además el remitente cae por defecto a `notificaciones@fne-lms.com` (`lib/emailService.js:8`), un dominio sin SPF/DKIM verificable desde el repositorio. Con `RESEND_API_KEY` sin fijar, el endpoint revienta al cargar el módulo.

- **Fix inmediato:** desestructurar `const { data, error } = await resend.emails.send(...)` en `lib/emailService.js:37-48`, copiando el patrón que ya existe en `lib/email/expenseNotifications.ts:235-245`; ramificar el toast de `FinalizeMeetingDialog.tsx:126-128` sobre `sent`/`failed`, que la API ya devuelve en `:302-309`.
- **Esfuerzo:** S — el *outbox* durable puede esperar a la Ola 3.

#### A03-2 · Renombrar la comunidad falla con un error en inglés

> «El nombre de arriba lo pone el equipo, como un grupo de WhatsApp.»

El engranaje aparece, el modal declara «Cualquier miembro puede cambiar el nombre del grupo», y al guardar sale **un toast rojo en inglés** (`JSON object requested, multiple (or no) rows returned`) en una interfaz en español. `community_workspaces` tiene cinco políticas: dos de UPDATE (sólo `admin` y `community_manager`) y tres de SELECT. Ningún rol que vaya a estar en esa comunidad puede renombrarla.

En los siete colegios restantes el banner mostrará además la etiqueta de máquina «Espacio de …» (`pages/api/community/ensure-workspace.ts:75`).

- **Fix:** política UPDATE para miembros de la comunidad (espejo de `members_read_their_workspaces`), o enrutar por API con *service role* como ya hace `pages/api/community/members.ts`.
- **Verificar aparte:** ninguna migración crea el bucket `community-images` — la mitad de imagen del modal fallará con «Bucket not found».
- **Esfuerzo:** S

#### A03-3 · El feed muestra los nombres en blanco

> «Lo que se conversa queda escrito donde todos lo ven.»

La directora ve su propia publicación bien, y **debajo las de sus profesoras con el nombre en blanco y el avatar vacío**. El feed se lee desde el navegador y la RLS sobre `profiles` sólo devuelve la fila propia.

- **Fix:** mover la lectura al servidor — nuevo `pages/api/community/feed.ts` que autoriza membresía y lee con *service role*; repuntar `lib/services/feedService.ts:30,411,424`.
- **Esfuerzo:** L

---

### 3.3 La visita del asesor

#### A05-3 · A05-4 · El consultor está bloqueado del espacio

> «El consultor ve el espacio de todas las comunidades de sus colegios… puede ser él quien levante el acta, en vivo, mientras conversan.»

Doble falla. El *middleware* **bloquea al consultor del espacio colaborativo por completo** — la barra lateral se lo ofrece explícitamente y al entrar lo rebota a `/dashboard` sin mensaje. Y si se destraba, sus acuerdos son rechazados por RLS con el error descartado: escribe el acta delante de la directora y desaparece.

- **Fix:** `middleware.ts:184-190` — retorno temprano para `consultor` junto al de `admin`, y decidir explícitamente sobre `supervisor_de_red`, que tiene la misma forma. Luego acotar la RLS de reuniones por colegio en vez de `has_global_workspace_access`.
- **Esfuerzo:** M

#### A05-1 · A05-2 · A05-6 · Las sesiones no se pueden abrir ni asistir

Las listas se ven bien. Al hacer clic en cualquier sesión, **la directora es expulsada a `/dashboard`** (`WorkspaceSessionsTab.tsx:235,238` la enruta a `/consultor/sessions/[id]`, que la rechaza en `:118`). El botón «Unirse» le muestra una caja gris pidiéndole que un facilitador la agregue a una lista que no puede ver: **`session_attendees` nunca se puebla** desde la membresía de la comunidad. Y la consultora, al cerrar, ve «Asistencia (0)» con tabla vacía y un botón «Marcar todos presentes» que no marca a nadie.

- **Fix (una causa, tres síntomas):** poblar `session_attendees` por *trigger* al crear/aprobar la sesión, o insert explícito en `pages/api/sessions/index.ts:257` y `pages/api/sessions/[id]/approve.ts`. Añadir un POST de facilitador para agregar participantes ad hoc.
- **Esfuerzo:** M

#### A13-7 · La hora reservada nunca pasa a consumida

> «El consultor marca asistencia y escribe su informe. En ese momento la hora reservada pasa a consumida.»

En `main` **ningún rol tiene una vía para mover una sesión a `pendiente_informe`**, así que la ruta de cierre nunca se dispara. La primera asesoría real queda «Programada» para siempre, su fila de *ledger* queda `reservada`, y horas consumidas se queda en 0 — rompiendo también el libro de horas y la cadena de rendición Ley SEP del Bloque 5.

- **Fix (el más barato y fiel a «un solo botón»):** relajar la precondición en `pages/api/sessions/[id]/finalize.ts:68` para aceptar `programada` y `en_progreso` cuando el instante de término ya pasó (`lib/utils/session-timezone.ts`, `America/Santiago`), manteniendo intactas las precondiciones de informe y asistencia; relajar igual los dos *gates* de botón en `pages/consultor/sessions/[id].tsx:546,1318`. No requiere *scheduler* ni cambio en `vercel.json`.
- **Esfuerzo:** M

---

### 3.4 El proceso de cambio y la evaluación

#### A09-11 · A10-8 · La compuerta de cobertura no llega al servidor

> «No hay forma de ponerse un tres en algo que no se está haciendo.»

La compuerta cierra la práctica en pantalla y escribe el mensaje prometido — pero **el servidor nunca se entera**:

- Quien responde «No» primero **no puede enviar jamás**: recibe «Faltan N respuestas» por indicadores que el formulario se niega a mostrarle.
- Quien llena la práctica y **después** pone «No» sí envía — con las respuestas ocultas contando en el puntaje.

Es exactamente lo que se garantizó imposible.

- **Ya está resuelto y sin fusionar:** `fix/gate-score` (`59bc7803` + `63616d61`) es *fast-forward* limpio sobre `main` y trae 329 líneas de test. **No tiene PR.** Toca `pages/api/docente/assessments/[instanceId]/submit.ts` (validación consciente de la compuerta) y `lib/services/assessment-builder/scoringService.ts` (`maskGateClosedResponses`).
- **Pendiente aparte:** mostrar «No implementada» en la pantalla de resultados — no está en ninguna rama.
- **Esfuerzo:** S (merge) + M (resultados)

#### A12-4 · A09-6 · La foto sellada sí se puede retocar

> «La foto queda tomada y no se puede retocar. Si la Fundación mejora el instrumento en marzo, las evaluaciones ya aplicadas no se tocan.»

Lo contrario. Editar un *template* ya publicado —que es justo lo que la UI invita a hacer— **reescribe en el sitio la única fila de snapshot** a la que apuntan todas las evaluaciones aplicadas: cambian retroactivamente nombres de indicadores, configuración de puntaje y expectativas. Una docente a medio responder ve el formulario mutar bajo sus pies en la siguiente carga.

Es la promesa que más le importa a una congregación que rota directoras por política desde hace décadas.

- **Fix:** eliminar `updatePublishedTemplateSnapshot()` (`lib/services/assessment-builder/autoAssignmentService.ts:644-829`) y sus **diez** llamadas — no ocho; la auditoría previa omitió `modules/index.ts:200` y la ruta DELETE de `modules/[moduleId]/indicators/[indicatorId].ts:375`. Lista completa: `templates/[templateId].ts:295`; `objectives/index.ts:176`; `objectives/[objectiveId].ts:187,242`; `modules/index.ts:200`; `modules/[moduleId].ts:223,281`; `indicators/index.ts:235`; `indicators/[indicatorId].ts:317,375`. Luego bloquear la edición de publicados forzando nueva versión.
- **Esfuerzo:** L

#### A08-1 · La proyección de transformación está mal calculada

> «44, 63, 81, 94 y 100 por ciento. No es una meta abstracta: sale de una matriz.»

Sale de una matriz, pero **calculada sobre niveles que el colegio no imparte**. Un colegio de Pre-Kínder a 8º como Curicó debería ver **46/70/90/100**; se le muestra 44/63/81/94. El número insignia de la pantalla está mal para todo colegio que no cubra el rango completo — es decir, para casi todos.

- **Fix:** en `pages/api/school/migration-plan/index.ts` (`handleGet`), filtrar la consulta a `ab_grades` (`:112-115`) por `school_transversal_context.grade_levels`, que ya se carga en `:98-104`, mapeando vía `GRADE_LEVEL_SORT_ORDER` (`types/assessment-builder.ts:173-178`). Sin cambios de cliente.
- **Esfuerzo:** M

#### A11-1 · La directora no tiene enlace a su propio panel

> «El colegio completo, sin pedirle el dato a nadie.»

La agregación funciona; **la directora no tiene cómo llegar**. El único enlace a «Panel de Resultados» vive dentro del grupo `vias-transformacion`, marcado `adminOnly: true`. Es la pantalla que se proyectó como suya y no aparece en su menú.

- **Cuidado al arreglar:** abrir el grupo expone además dos hermanos sin restricción, y uno de ellos (`/school/transversal-context`) **duplica** «Contexto Transversal», que ella ya tiene bajo Procesos de Cambio. Añadir `restrictedRoles` por hijo, no abrir el grupo.
- **Archivo:** `components/layout/Sidebar.tsx:317-352`
- **Esfuerzo:** S

---

### 3.5 Las horas y la mirada de la congregación

#### A14-1 · El Reporte de Horas devuelve error

> «120 horas contratadas, 70 consumidas, 47 disponibles.»

En `main` —el SHA desplegado— `/reporte-horas` devuelve 500 y pinta «Error al cargar el reporte — No se pudieron obtener los contratos del colegio» **para todo colegio que tenga al menos una fila de cliente**, con o sin contrato activo. La consulta pide `contratos.is_annexo`; la columna es `is_anexo`. Los tests pasan porque simulan la columna mal escrita.

- **Fix:** fusionar `fix/horas-rep` (PR #50, un commit `f6d0e908`, FF limpio; 20/20 en su suite).
- **Importante:** descartar la edición sin *commit* en el árbol de trabajo (`lib/services/school-hours-report.ts`): arregla el servicio pero no el espejo de esquema del *mock*, y deja la suite en 14 fallos / 5 pases.
- **Esfuerzo:** S

#### A15-3 · Cuatro de las seis pestañas de la Madre Superiora fallan

**Cuatro de las seis fallan** para `supervisor_de_red`, y tres fallan para **todos** los roles incluido admin: Analytics, Comunidades y Cursos mueren sobre `profiles.role`, una columna que ya no existe en el esquema (403 / 500 con texto de error visible). Escuelas sale vacía.

Es la pantalla de la persona más importante de la sala.

- **Fix:** reemplazar el lookup por `user_roles.role_type` — el patrón ya está implementado en `pages/api/reports/school.ts:12-36` (`getServiceRolePrimaryRole`) — en `analytics-data.ts:33-34`, `community.ts:42-43` (y sus usos en `:53,63,76,85`) y `course-analytics.ts:43-44`. Además `analytics-data.ts:2` importa `lib/supabase-wrapper`, que es un cliente **anon de navegador** sin sesión en el servidor.
- **Esfuerzo:** M

#### APR-05 · «Tiempo Total» marca 0h 0m

> «Cincuenta horas con cuarenta y cinco minutos de formación acumulada en toda la red.»

La tarjeta marca **0h 0m** bajo una franja ámbar «No se pudieron cargar datos de rutas de aprendizaje». Las vistas de resumen que alimentan ese número **sólo existen en el seeder local**, no en ninguna migración.

- **Cuidado:** el seeder (`scripts/demo/seed-sm/60-lms.ts:710-713`) otorga `SELECT` a `anon` sobre vistas con derechos de propietario — copiarlo verbatim expondría el progreso de todos los usuarios de la red. La migración debe crearlas con `security_invoker = true` y `SELECT` sólo a `authenticated`.
- **Segundo defecto en el mismo cambio:** nada fuera del seeder escribe jamás `course_enrollments.total_time_spent_seconds`, que es la fuente del tiempo.
- **Esfuerzo:** M

---

## 4. La cola P1 — falla dentro de las seis semanas

Resumen de los hallazgos que bajaron de P0 tras el desafío adversarial, más los P1 originales de mayor alcance. **Confianza de un solo agente salvo los marcados ✓.**

| ID | Promesa | Qué pasa realmente |
|---|---|---|
| ✓ `PRIOR-13` | Notificaciones automáticas | **Nada enrutado por `NotificationService` produce jamás un correo.** `lib/notificationService.ts:1134` es literalmente `case 'immediate': // TODO`. Toda "notificación" —plazos, asignación de curso, recordatorios— es sólo la campanita dentro de la app. |
| ✓ `B03-5` | «El calendario legal lo lleva la plataforma, no la memoria» | El cálculo y los dos paneles funcionan como se mostró. Lo que no existe es la mitad *push*: `vercel.json` sólo agenda los dos jobs de Zoom. Nada se dispara si nadie abre la página. |
| ✓ `A11-3` | «Cumplen Expectativa 3/14 cursos» | El denominador cuenta **todos** los cursos del colegio, evaluados o no, y la pestaña Por Curso pinta los no evaluados como «0% · En desarrollo» con triángulo de alerta. Con 1 de 14 evaluados, el panel dice «1/14». El número que se llamó «el más útil de esta pantalla» sobre-reporta el fracaso. |
| ✓ `A14-6` | «Sesión por sesión: fecha, consultor, horas, asistencia» | La columna Asistencia renderiza «—» en pantalla, en el PDF y en el CSV, **permanentemente**: el servicio codifica `attendance: null` mientras `session_attendees` queda sin leer. |
| ✓ `A10-3` | «Indicadores 19/19 sobre la expectativa» | La tarjeta es estructuralmente siempre N/N, contradiciendo el Análisis de Brechas justo debajo en la misma pantalla. |
| ✓ `A13-2` | «Todas las superficies llevan a esta pantalla» | El calendario (.ics) y la pestaña Sesiones sí. La **notificación in-app no**: guarda `related_url '/consultor/sessions'`, que rebota a `/dashboard` a toda no-consultora. El recordatorio de 1 hora antes no está agendado. |
| ✓ `B05-3` | «PDF, Word o imagen — hasta 25 MB» | Cualquier archivo sobre ~4,5 MB es rechazado por Vercel antes de llegar al handler, con un error de parseo sin sentido. Una carpeta escaneada (5–15 MB) no entra. |
| ✓ `B05-4` | «Descargar Todo» | Existe en licitaciones en curso. **No existe en las históricas** — 3 de los 4 registros Santa Marta. Además dos documentos con el mismo nombre de archivo se pisan en el ZIP. |
| ✓ `B02-2` | La ficha de la licitación | `getLicitacionDetail` consulta `schools.code`, columna inexistente: falta el nombre del colegio en el encabezado y el botón «copiar texto de publicación» queda permanentemente deshabilitado. |
| ✓ `A06-3` | Autoguardado | Funciona, pero respuestas dadas con <2 s de diferencia y luego abandono de pestaña pierden todo salvo la última, con el botón «Guardar» en gris como si estuviera todo salvado. |
| ✓ `A09-10` | «Por curso y por generación» | La etiqueta de curso es removida por RLS en la API de listado y no se renderiza en ninguna pantalla. Una docente con dos cursos del mismo nivel ve tarjetas idénticas. La segregación de datos sí es correcta. |
| ✓ `ONB-02` | Alta de ~200 cuentas | El único modo que funciona es «misma contraseña para todos». El modo de contraseña aleatoria por usuario **crea cero cuentas** — cada contraseña generada falla el requisito de mayúscula. |
| ✓ `OBS` | Que alguien se entere si algo falla | Sentry está configurado pero **nunca se inicializa en ningún runtime**, y no hay `_error`, 404, 500 ni *error boundary*. Un fallo produce una página de error de Next en inglés, sin registro. |
| ✓ `PRIOR-12` | Las pestañas de reportes | `/api/reports/community` y `/course-analytics` devuelven 500, y `/analytics-data` devuelve 403, a **todo usuario autenticado incluido admin**. |
| `A12-3` | «Queda escrito donde el profesor que llegue lo va a encontrar» | **P2.** El dato se guarda correctamente, pero no existe ninguna superficie que muestre a un docente el `evidence_link` ni las sugerencias de su antecesor. Es una pantalla que falta, no un dato perdido. |
| `B03-4` | «Próximos Vencimientos» | **P2.** No existe estado de *vencido* en ningún lugar del módulo: un plazo pasado se vuelve visualmente silencioso. La fila sí sigue apareciendo en «Acciones Requeridas». |
| `B05-5` | «La respuesta es un clic» | **P2.** En una licitación histórica hacen falta nueve clics separados. Todo está presente y descargable; falta el control de descarga masiva. |

**Faltan feriados.** `feriados_chile` se crea en el baseline pero **ninguna migración activa inserta filas** — la semilla vive sólo en `supabase/migrations-archive/`. «Salta fines de semana y feriados» hoy se cumple sólo para fines de semana, salvo que producción ya tenga las filas cargadas (no verificable desde el repositorio).

---

## 5. El plan

Cuatro olas. Cada una con su rama (≤20 caracteres, por la regla de DNS de Vercel), su cambio concreto y su compuerta de salida.

### Ola 0 — Antes de que entre el primer colegio · 2–3 días

- **Fusionar PR #50 `fix/horas-rep`** — *fast-forward*, un commit. Devuelve el Reporte de Horas. Descartar antes la edición local sin commit.
- **Abrir PR para `fix/gate-score` y fusionar** — destraba la compuerta de cobertura. Decidir si se quiere el commit `9c1c7a8a` (chore de eslint) o sólo los dos arreglos.
- **Rama `fix/red-super`** — `name` → `nombre` en `networks/supervisors.ts`. Sin esto la Madre Superiora no existe como usuaria.
- **Rama `fix/rls-anon`** — cierre mecánico de las 14 tablas legacy sin referencias en código, más `learning_paths` y `learning_path_courses`. Vía el flujo del agente de BD, nunca por *toggle*.
- **Configuración** — fijar `EMAIL_FROM_ADDRESS` y verificar el dominio remitente en Resend.

**Salida:** cuatro compuertas verdes en el SHA combinado · migraciones aplicadas a producción y verificadas en solo lectura · un envío sintético recibido en una casilla de colegio real.

### Ola 1 — Que la primera reunión funcione de verdad · Semana 1

- **Rama `fix/meet-save`** — políticas INSERT+SELECT en `meeting_agreements` y `meeting_tasks`; propagar el error de los cuatro inserts hijos y los tres bucles de update; `applyMeetingDiffs` devuelve resultado; el modal lo honra. Exigir responsable y fecha en UI, API y BD; coercer `''` → `null`.
- **Rama `fix/mail-truth`** — desestructurar `{data, error}` en `emailService.js`; el toast ramifica sobre `sent`/`failed`.
- **Rama `fix/consultor`** — retorno temprano de `consultor` en el middleware; poblar `session_attendees` al aprobar.
- **Rama `fix/nav-dir`** — «Panel de Resultados» visible para `equipo_directivo` por hijo, sin abrir el grupo.

**Salida:** una reunión sintética completa —acuerdos, compromisos con responsable y plazo, finalizar y enviar— reabierta y verificada, más el correo recibido. e2e obligatoria sin *skips*.

### Ola 2 — Que los números sean ciertos · Semanas 2–3

- **`fix/snapshot`** — inmutabilidad real: eliminar `updatePublishedTemplateSnapshot` y sus diez llamadas; bloquear edición de publicados.
- **`fix/sess-close`** — cierre de sesión → informe → hora consumida.
- **`fix/net-tabs`** — `profiles.role` → `user_roles.role_type` en las cuatro rutas de reportes; sacar el cliente de navegador del servidor.
- **`fix/plan-pct`** — proyección de transformación filtrada por los niveles reales del colegio.
- **`fix/feed-srv`** — feed leído desde el servidor, con autores visibles.
- **`fix/feriados`** — migración con los feriados chilenos 2026–2028 y alarma de vencimiento anual.
- **`fix/lic-cron`** — cron autenticado para vencimientos de licitación, con evento de "hoy" correcto y escalamiento de vencidos.

**Salida:** un año escolar sintético completo de punta a punta en *staging*, con controles negativos entre colegios y entre redes.

### Ola 3 — Endurecimiento durante las visitas · Semanas 4–6

- RLS del grupo B — las 8 tablas legacy referenciadas que necesitan política, no revocación.
- *Outbox* durable de correo con reintentos y estado de entrega visible.
- Observabilidad: inicializar Sentry, añadir `_error`/404/500 y *error boundary*.
- Límite real de 25 MB en subidas, completitud explícita del ZIP, «Descargar Todo» en licitaciones importadas.
- Revisión independiente y despliegue de `fix/auth-sec2`, hoy sin fusionar.

**Salida:** revisión de red con la Madre Superiora contra este mismo listado, fila por fila.

---

## 6. La pista paralela: los datos

Nada de esto es código. Sin esto, el código correcto tampoco sirve.

**No existe ninguna pantalla para crear un programa.** Las once referencias a `programas` en el repositorio son lecturas. Sin una fila de programa no se puede abrir una licitación ni generar un contrato — el Bloque 5 entero depende de una tabla que hoy sólo se puebla por SQL. Necesita dueño y decisión: constructor mínimo o migración semilla revisada.

**La entrega de credenciales no tiene camino limpio.** La importación masiva deja a las ~200 cuentas con una misma contraseña elegida por el operador (el modo aleatorio crea cero cuentas), y en ningún caso se envía correo. Para ocho directoras es manejable de forma acompañada; para los docentes no lo es. Decidir el mecanismo **antes** de la Ola 1, no durante.

**Lo que hay que cargar por colegio:** la escuela y su vínculo a la Red Santa Marta · el contexto transversal con sus niveles y cursos · las comunidades con sus miembros · el contrato con sus *buckets* de horas · el histórico de licitaciones con sus documentos · las asignaciones docente–curso, que son las que crean las evaluaciones. Los *seeders* de la demo (`scripts/demo/seed-sm/`) enumeran exactamente esto y son el mejor punto de partida, pero están fuera de control de versiones y tienen vallas anti-producción.

> **La trampa que este repositorio ya conoce.** `PROJECT_STATE.md` registra una fase que cerró en verde y dejó la aprobación de sesiones rota en producción durante días, porque el *checklist* no incluía aplicar las migraciones. Cada ola de este plan lleva migraciones. **Verde local y verde en CI no dicen nada sobre el esquema desplegado.**

---

## 7. Lo que esta auditoría se equivocó

La verificación adversarial cambió el resultado de forma material: la primera lectura daba 54 defectos P0; sobrevivieron 27. **Siete hallazgos fueron refutados por completo y no deben trabajarse:**

| ID | Qué se afirmó | La realidad |
|---|---|---|
| `A08-4` | El bloqueo GT de Medio Menor a 2º Básico no se fuerza | **Sí se fuerza**, correctamente. |
| `A12-1` | El indicador de Traspaso sólo está en 1 de 5 prácticas | La capacidad está **completamente construida**. Lo que no se puede ver desde el repositorio es si el *template* publicado en producción lo lleva en las cinco. |
| `QA-1` | Las facturas por cuota no son alcanzables | **Existen y funcionan** como se dijo. El defecto real es menor: un botón «Ver Contrato Vinculado» sin comprobación de rol. |
| `APR-06` | La pestaña Rutas de Aprendizaje falla para el Líder de Red | Falla, pero **para todos los roles y por otra causa**; ningún rol de la sala tiene ruta de clic hasta ella. |
| `ONB-03` | No hay forma de entregar acceso a las directoras | **Sí la hay**, de forma acompañada. El defecto real es un fallo silencioso en el flujo de *grant*. |
| `ONB-04` | Sin `programas` se cae `/reporte-horas` | El reporte **no depende de `programas`**. La falta de UI es real; el impacto titular estaba mal. |
| `PRIOR-15` | Producción está vacía | Se probó que la demo corrió contra Supabase local. De ahí **no se sigue** que producción esté vacía. Sigue sin verificar. |

**Precisión de las citas.** En la muestra desafiada, **10 de 40 hallazgos tenían al menos una referencia archivo:línea imprecisa**. La falla solía ser real, pero en otra línea del mismo archivo. Verificar la cita antes de tocar el archivo; si la línea no dice lo que el hallazgo afirma, revisar el hallazgo completo, no sólo la referencia.

---

## 8. Riesgos que este plan no cubre

**1 · Deriva entre el esquema de producción y el del repositorio.**
Toda la evidencia es local. `supabase db push` es inusable en este repositorio (el historial está aplastado a un baseline mientras producción lista sus 34 filas originales), así que las migraciones se aplican a mano, una por una. Es el mecanismo exacto que ya rompió producción una vez.
*Señal temprana:* revisión de esquema en solo lectura antes y después de cada ola, comparando contra `schema_migrations`.

**2 · Ninguna de estas jornadas se ha ejercido nunca contra datos reales.**
Las 27 fallas se encontraron leyendo código. Las que no se encuentran leyendo código son las de configuración: credenciales de Zoom, dominio remitente, *buckets* de almacenamiento, filas de feriados.
*Señal temprana:* hacer la primera reunión y la primera asesoría **uno mismo**, en producción, con cuentas sintéticas, antes de que las haga una directora.

**3 · La cola P1 no fue verificada adversarialmente.**
Los 54 P0 fueron desafiados uno por uno. Los **43 P1 y 6 P2 restantes se reportan con la confianza de un solo agente**.
*Señal temprana:* la tasa de citas imprecisas medida en la muestra desafiada fue de 1 en 4.

---

## 9. Borrador de comunicación a la red

> Estimadas directoras, Madre Ana María:
>
> Gracias por el sábado. Lo que vieron son pantallas reales, y eso no cambia. Antes de abrirles las cuentas quiero ser preciso con los tiempos, porque prefiero decirlo yo ahora a que ustedes se encuentren con algo a medias.
>
> Estas semanas estamos cerrando un conjunto acotado de correcciones y, sobre todo, dejando cargados los datos de los ocho colegios: sus niveles y cursos, sus comunidades, sus contratos y su historial de licitaciones. Por eso el ingreso no será esta semana. Será por colegio y acompañado, no un correo masivo con una clave.
>
> Las visitas siguen firmes: seis semanas, los ocho colegios, dos conversaciones en cada una. Con los líderes de comunidad, para documentar su primera reunión de verdad. Y con la dirección y quien tenga el rol de encargado de licitación, para dejar la carpeta lista. Les pido tener ese nombre decidido antes de que yo llegue.
>
> El panel comparativo de la red y la comparación año contra año siguen siendo lo que les dije el sábado: todavía no existen.
>
> Cualquier cosa que no funcione, escríbanme directamente. Me sirve mucho más que lo encuentren ustedes en septiembre que descubrirlo en diciembre.

---

## 10. Método y límites

Las tres presentaciones se trataron como **evidencia de lo dicho, no como instrucciones**. De ellas se extrajeron 160 afirmaciones verificables, que 99 agentes contrastaron contra el código en dos olas:

1. **Verificación por dominio** — 14 verificadores de dominio + 4 barridos transversales (Pilar 1, onboarding, contraste con la auditoría previa, no-funcionales).
2. **Pasada adversarial** — desafió **todos** los P0 desde dos ángulos, realidad del código y recorrido del usuario, con instrucción explícita de refutar y de marcar `refuted=true` ante cualquier duda.

**Límite abierto.** Las reglas del proyecto prohíben consultar la base de datos productiva, y esta auditoría las respetó. Eso deja sin resolver cuatro preguntas acotadas pero importantes:

1. ¿Existen las filas de `feriados_chile` para 2026–2027?
2. ¿Están creadas la Red Santa Marta y sus ocho vínculos en `red_escuelas`?
3. ¿Está verificado el dominio remitente en Resend?
4. ¿Existe el bucket `community-images`?

Una revisión de solo lectura autorizada resolvería las cuatro en minutos y cerraría la única brecha de evidencia real de este informe.

---

*160 afirmaciones · 99 agentes · 54 P0 desafiados adversarialmente · 27 confirmados, 20 degradados, 7 refutados.*
*Contrastado contra `main` @ `717c2c09`.*

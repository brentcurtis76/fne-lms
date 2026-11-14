// Seed module 40 — Espacio Colaborativo (community workspace), comunicación (news and events), notificaciones,
// platform feedback. Invented content only, for the picture harness on the private local copy.
//
// Id space: UUIDs 5eed0040-0000-4000-8000-00000000XXXX, XXXX = (group << 8) | index (groups listed in G below).
// Every row is written with insert-or-ignore on its fixed id (upsert with ignoreDuplicates), so a second run
// changes nothing, and no update trigger moves an updated_at. Fixture rows (accounts, their roles, schools,
// communities c01/c02, fixture sessions) are only read.
//
// Who reaches /community/workspace (middleware: admin, or an active role row with a community_id):
//   admin (every community), gcLeader (fixture community c01), communityManager (fixture community c02).
//   docente, directivo and consultorAssigned have no community on their role rows and are sent to /dashboard;
//   giving them one would mean changing fixture roles, which this module must not do.
// Members are NOT added to the fixture community c01: a new role row there fires
// sync_session_attendees_on_gc_change and adds attendees to the three fixture sessions (2030), which the
// session-disclosure browser test counts. The extra members live in this module's own community instead.
import { createHash } from 'node:crypto';
import { pdf, png, docx, xlsx, MIME } from './_40-files.mjs';

export const name = 'comunidad, noticias, notificaciones, feedback';

const G = {
  base: 0x00, // 0x0001-0x0005 accounts, 0x0011-0x0015 role rows, 0x0021 community, 0x0031-0x0033 workspaces
  meeting: 0x01, attendee: 0x02, agreement: 0x03, commitment: 0x04, task: 0x05, mattach: 0x06,
  folder: 0x07, doc: 0x08, docver: 0x09, thread: 0x0a, message: 0x0b, mention: 0x0c, reaction: 0x0d,
  post: 0x0e, comment: 0x0f, preaction: 0x10, pmention: 0x11, pmedia: 0x12, news: 0x13, event: 0x14,
  notif: 0x15, feedback: 0x16, factivity: 0x17,
};
const id = (group, n) => `5eed0040-0000-4000-8000-${((group << 8) | n).toString(16).padStart(12, '0')}`;

const COMMUNITY_PATIO = id(G.base, 0x21);
const MEMBER = [1, 2, 3, 4, 5].map((n) => id(G.base, n));
const NEWS_SLUG = 'encuentro-sintetico-de-comunidades-de-crecimiento-2026';

// Chile is at -03:00 in Oct–Nov 2026; every instant below is written out in full.
const T = (s) => new Date(s).toISOString();

async function put(supabase, table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function upload(supabase, bucket, path, body, contentType) {
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`storage ${bucket}/${path}: ${error.message}`);
}

// The `resources` bucket exists in Production (documents, post images, news images) but no migration creates it.
async function ensureBucket(supabase, bucket, isPublic) {
  const { data } = await supabase.storage.getBucket(bucket);
  if (data) return;
  const { error } = await supabase.storage.createBucket(bucket, { public: isPublic });
  if (error && !/exist/i.test(error.message)) throw new Error(`bucket ${bucket}: ${error.message}`);
}

const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((p) =>
    Array.isArray(p)
      ? { type: 'bulletList', content: p.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) }
      : { type: 'paragraph', content: [{ type: 'text', text: p }] }),
});
const plain = (d) => d.content.map((n) => (n.type === 'bulletList' ? n.content.map((li) => li.content[0].content[0].text).join('\n') : n.content[0].text)).join('\n');

// ---------------------------------------------------------------------------------------------------------------
// Accounts of this module's own community (no password: nobody signs in as them; they fill member lists).
// ---------------------------------------------------------------------------------------------------------------
const PATIO_PEOPLE = [
  { first: 'Antonia', last: 'Lider Patio Sintetica', role: 'lider_comunidad' },
  { first: 'Benjamín', last: 'Docente Patio Sintetico', role: 'docente' },
  { first: 'Catalina', last: 'Docente Patio Sintetica', role: 'docente' },
  { first: 'Diego', last: 'Docente Patio Sintetico Dos', role: 'docente' },
  { first: 'Elena', last: 'Docente Patio Sintetica Dos', role: 'docente' },
];

async function seedPatioCommunity(supabase, fixtures, users) {
  // Community "Patio" in the primary school and the fixture generation (the trigger requires a generation there).
  await put(supabase, 'growth_communities', [{
    id: COMMUNITY_PATIO,
    name: 'Comunidad de Crecimiento Sintetica E2E Patio',
    description: 'Comunidad sintética para las imágenes del rediseño. No corresponde a una comunidad real.',
    school_id: fixtures.school.id,
    generation_id: fixtures.generation.id,
    max_teachers: 16,
    created_at: T('2026-10-01T09:00:00-03:00'),
    updated_at: T('2026-10-01T09:00:00-03:00'),
  }]);

  const { data: list, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const known = new Set(list.users.map((u) => u.id));
  for (const [i, p] of PATIO_PEOPLE.entries()) {
    if (known.has(MEMBER[i])) continue;
    const { error: e } = await supabase.auth.admin.createUser({
      id: MEMBER[i],
      email: `e2e-rd40-patio-${i + 1}@example.com`,
      email_confirm: true,
      user_metadata: { first_name: p.first, last_name: p.last },
    });
    if (e) throw new Error(`createUser patio ${i + 1}: ${e.message}`);
  }
  await put(supabase, 'profiles', PATIO_PEOPLE.map((p, i) => ({
    id: MEMBER[i],
    email: `e2e-rd40-patio-${i + 1}@example.com`,
    name: `${p.first} ${p.last}`,
    first_name: p.first,
    last_name: p.last,
    approval_status: 'approved',
    must_change_password: false,
    school_id: fixtures.school.id,
    generation_id: null,
    created_at: T('2026-10-01T09:30:00-03:00'),
    last_active_at: T(`2026-11-1${i % 3}T10:00:00-03:00`),
  })));
  await put(supabase, 'user_roles', PATIO_PEOPLE.map((p, i) => ({
    id: id(G.base, 0x11 + i),
    user_id: MEMBER[i],
    role_type: p.role,
    school_id: fixtures.school.id,
    generation_id: null,
    community_id: COMMUNITY_PATIO,
    is_active: true,
    assigned_by: users.admin,
    assigned_at: T('2026-10-01T09:30:00-03:00'),
    created_at: T('2026-10-01T09:30:00-03:00'),
  })));
}

// ---------------------------------------------------------------------------------------------------------------
// Workspaces: the two fixture communities and Patio. The app creates one on first visit (ensure-workspace);
// if one already exists for a community it is used as it is.
// ---------------------------------------------------------------------------------------------------------------
async function ensureWorkspace(supabase, wsId, communityId, communityName, customName) {
  const { data, error } = await supabase.from('community_workspaces').select('id').eq('community_id', communityId).maybeSingle();
  if (error) throw new Error(`community_workspaces: ${error.message}`);
  if (data) return data.id;
  await put(supabase, 'community_workspaces', [{
    id: wsId,
    community_id: communityId,
    name: `Espacio de ${communityName}`,
    description: `Espacio colaborativo para ${communityName}`,
    custom_name: customName,
    settings: { features: { meetings: true, documents: true, messaging: true, feed: true }, permissions: { all_can_post: true, all_can_upload: true } },
    is_active: true,
    created_at: T('2026-10-01T10:00:00-03:00'),
    updated_at: T('2026-10-01T10:00:00-03:00'),
  }]);
  return wsId;
}

// ---------------------------------------------------------------------------------------------------------------
// Meetings (Reuniones tab): one per status — completada (documented and finalized, with agreements, commitments,
// tasks, attendees and an attachment), borrador, en_progreso, programada (2030), cancelada, pospuesta.
// Open commitments and tasks fall due in 2030 so update_overdue_status never flips them; the overdue one is
// already 'vencido'.
// ---------------------------------------------------------------------------------------------------------------
function meetingSet(k, ws, p, label) {
  // k: slot base (0x00, 0x20, 0x40) so each workspace has its own ids. p: { lead, sec, a, b, c }
  const m = (n) => id(G.meeting, k + n);
  const meetings = [];
  const attendees = [];
  const agreements = [];
  const commitments = [];
  const tasks = [];
  const at = (n) => id(G.attendee, k * 2 + n); // attendee rows use a wider slot (up to 40 per workspace)

  const summary = doc(
    `Se revisaron las evidencias de aprendizaje recogidas en ${label} durante septiembre y octubre.`,
    'El equipo acordó priorizar la retroalimentación formativa en Lenguaje y Matemática para el cierre del semestre.',
    ['Se presentaron 12 registros de observación entre pares.', 'Se identificaron dos prácticas para compartir con la escuela.'],
  );
  const notes = doc('Asistencia completa salvo una ausencia justificada.', 'Próxima reunión: planificación del segundo semestre.');
  meetings.push({
    id: m(1), workspace_id: ws, title: 'Análisis de evidencias de aprendizaje',
    description: 'Revisión de las evidencias recogidas en el ciclo de observación entre pares.',
    meeting_date: T('2026-10-20T15:30:00-03:00'), duration_minutes: 90, location: 'Sala de profesores',
    status: 'completada', summary: plain(summary), summary_doc: summary, notes: plain(notes), notes_doc: notes,
    created_by: p.lead, facilitator_id: p.lead, secretary_id: p.sec, is_active: true,
    started_at: T('2026-10-20T15:32:00-03:00'), finalized_at: T('2026-10-20T17:10:00-03:00'), finalized_by: p.lead,
    finalize_audience: 'community', finalize_with_access: null, version: 3, updated_by: p.lead,
    created_at: T('2026-10-15T09:00:00-03:00'), updated_at: T('2026-10-20T17:10:00-03:00'),
  });
  attendees.push(
    { id: at(1), meeting_id: m(1), user_id: p.lead, attendance_status: 'attended', role: 'facilitator' },
    { id: at(2), meeting_id: m(1), user_id: p.sec, attendance_status: 'attended', role: 'secretary' },
    { id: at(3), meeting_id: m(1), user_id: p.a, attendance_status: 'late', role: 'participant' },
    ...(p.b ? [{ id: at(4), meeting_id: m(1), user_id: p.b, attendance_status: 'absent', role: 'participant', notes: 'Ausencia justificada por licencia.' }] : []),
    ...(p.c ? [{ id: at(5), meeting_id: m(1), user_id: p.c, attendance_status: 'attended', role: 'observer' }] : []),
  );
  [
    ['Cada docente compartirá una evidencia de aula por semana en el espacio colaborativo.', 'pedagogico'],
    ['La retroalimentación entre pares usará la pauta de observación acordada.', 'pedagogico'],
    ['Las reuniones de comunidad se mantienen los martes de 15:30 a 17:00.', 'organizacional'],
  ].forEach(([text, category], i) => {
    const d = doc(text);
    agreements.push({ id: id(G.agreement, k + 1 + i), meeting_id: m(1), agreement_text: text, agreement_doc: d, category, order_index: i,
      created_at: T('2026-10-20T17:00:00-03:00'), updated_at: T('2026-10-20T17:00:00-03:00') });
  });
  [
    ['Subir la planificación de la unidad 3 a la carpeta Planificaciones.', p.sec, '2026-10-27', 'completado', 100, T('2026-10-26T18:00:00-03:00')],
    ['Preparar la presentación de prácticas para el consejo de profesores.', p.lead, '2030-03-30', 'en_progreso', 40, null],
    ['Coordinar la visita de observación al segundo ciclo.', p.a, '2030-04-15', 'pendiente', 0, null],
  ].forEach(([text, who, due, status, pct, done], i) => {
    commitments.push({ id: id(G.commitment, k + 1 + i), meeting_id: m(1), commitment_text: text, commitment_doc: doc(text), assigned_to: who,
      due_date: due, status, progress_percentage: pct, completed_at: done,
      created_at: T('2026-10-20T17:00:00-03:00'), updated_at: T('2026-10-20T17:00:00-03:00') });
  });
  [
    ['Ordenar registros de observación', 'Digitalizar y subir los 12 registros de observación.', p.sec, '2026-10-30', 'alta', 'completado', 100, T('2026-10-29T16:00:00-03:00'), 'Documentación'],
    ['Pauta de retroalimentación', 'Ajustar la pauta con los comentarios de la reunión.', p.lead, '2030-03-25', 'media', 'en_progreso', 50, null, 'Pedagógico'],
    ['Encuesta a estudiantes', 'Aplicar la encuesta breve de percepción de la retroalimentación.', p.a, '2026-11-05', 'critica', 'vencido', 20, null, 'Evaluación'],
    ['Reservar sala para la jornada', 'Solicitar la biblioteca para la jornada de cierre.', p.sec, '2030-04-02', 'baja', 'pendiente', 0, null, 'Logística'],
  ].forEach(([title, desc, who, due, priority, status, pct, done, category], i) => {
    tasks.push({ id: id(G.task, k + 1 + i), meeting_id: m(1), task_title: title, task_description: desc, task_description_doc: doc(desc),
      assigned_to: who, due_date: due, priority, status, progress_percentage: pct, completed_at: done, category, estimated_hours: 2 + i,
      created_at: T('2026-10-20T17:00:00-03:00'), updated_at: T('2026-10-20T17:00:00-03:00') });
  });

  // Draft (borrador): partly written, nobody finalized it yet.
  const draftSummary = doc('Borrador: ideas para la jornada de retroalimentación entre pares.');
  meetings.push({
    id: m(2), workspace_id: ws, title: 'Retroalimentación entre pares — preparación',
    description: 'Preparar la jornada de retroalimentación del cierre de semestre.',
    meeting_date: T('2026-11-10T15:30:00-03:00'), duration_minutes: 60, location: 'Biblioteca',
    status: 'borrador', summary: plain(draftSummary), summary_doc: draftSummary, notes: '', notes_doc: doc(''),
    created_by: p.lead, facilitator_id: p.lead, secretary_id: null, is_active: true, version: 1, updated_by: p.lead,
    created_at: T('2026-11-06T10:00:00-03:00'), updated_at: T('2026-11-10T16:20:00-03:00'),
  });
  attendees.push(
    { id: at(11), meeting_id: m(2), user_id: p.lead, attendance_status: 'attended', role: 'facilitator' },
    { id: at(12), meeting_id: m(2), user_id: p.sec, attendance_status: 'attended', role: 'co_editor' },
    { id: at(13), meeting_id: m(2), user_id: p.a, attendance_status: 'confirmed', role: 'participant' },
  );
  agreements.push({ id: id(G.agreement, k + 10), meeting_id: m(2), agreement_text: 'Usar la misma pauta en todos los niveles.',
    agreement_doc: doc('Usar la misma pauta en todos los niveles.'), category: 'pedagogico', order_index: 0,
    created_at: T('2026-11-10T16:20:00-03:00'), updated_at: T('2026-11-10T16:20:00-03:00') });

  // In progress (en_progreso).
  meetings.push({
    id: m(3), workspace_id: ws, title: 'Taller de lectura compartida',
    description: 'Taller práctico sobre estrategias de lectura compartida en primer ciclo.',
    meeting_date: T('2026-11-12T15:30:00-03:00'), duration_minutes: 120, location: 'Sala 12',
    status: 'en_progreso', created_by: p.lead, facilitator_id: p.sec, secretary_id: p.lead, is_active: true,
    started_at: T('2026-11-12T15:35:00-03:00'), version: 1, updated_by: p.sec,
    created_at: T('2026-11-05T09:00:00-03:00'), updated_at: T('2026-11-12T15:35:00-03:00'),
  });
  attendees.push(
    { id: at(21), meeting_id: m(3), user_id: p.sec, attendance_status: 'attended', role: 'facilitator' },
    { id: at(22), meeting_id: m(3), user_id: p.lead, attendance_status: 'attended', role: 'secretary' },
    { id: at(23), meeting_id: m(3), user_id: p.a, attendance_status: 'invited', role: 'participant' },
  );

  // Scheduled (programada) — 2030 so it stays upcoming.
  meetings.push({
    id: m(4), workspace_id: ws, title: 'Planificación del segundo semestre',
    description: 'Definir focos de trabajo, calendario de observaciones y responsables.',
    meeting_date: T('2030-03-18T15:30:00-03:00'), duration_minutes: 90, location: 'Sala de profesores',
    status: 'programada', created_by: p.lead, facilitator_id: p.lead, secretary_id: p.sec, is_active: true, version: 0,
    created_at: T('2026-11-11T09:00:00-03:00'), updated_at: T('2026-11-11T09:00:00-03:00'),
  });
  attendees.push(
    { id: at(31), meeting_id: m(4), user_id: p.lead, attendance_status: 'confirmed', role: 'facilitator' },
    { id: at(32), meeting_id: m(4), user_id: p.sec, attendance_status: 'confirmed', role: 'secretary' },
    { id: at(33), meeting_id: m(4), user_id: p.a, attendance_status: 'invited', role: 'participant' },
  );

  // Cancelled (cancelada) and postponed (pospuesta).
  meetings.push({
    id: m(5), workspace_id: ws, title: 'Visita de acompañamiento',
    description: 'Cancelada: coincide con la jornada de evaluación institucional.',
    meeting_date: T('2026-10-27T15:30:00-03:00'), duration_minutes: 60, location: 'Sala de profesores',
    status: 'cancelada', created_by: p.lead, facilitator_id: p.lead, is_active: true, version: 1,
    created_at: T('2026-10-21T09:00:00-03:00'), updated_at: T('2026-10-24T12:00:00-03:00'),
  });
  meetings.push({
    id: m(6), workspace_id: ws, title: 'Revisión de resultados de la evaluación intermedia',
    description: 'Pospuesta hasta contar con los resultados consolidados.',
    meeting_date: T('2026-11-03T15:30:00-03:00'), duration_minutes: 60, location: 'Sala 4',
    status: 'pospuesta', created_by: p.lead, facilitator_id: p.lead, is_active: true, version: 1,
    created_at: T('2026-10-28T09:00:00-03:00'), updated_at: T('2026-11-02T18:00:00-03:00'),
  });

  for (const a of attendees) {
    a.created_at ??= T('2026-10-15T09:00:00-03:00');
    a.updated_at ??= T('2026-10-15T09:00:00-03:00');
  }
  return { meetings, attendees, agreements, commitments, tasks };
}

async function seedMeetings(supabase, k, ws, p, label, withAttachment) {
  const s = meetingSet(k, ws, p, label);
  await put(supabase, 'community_meetings', s.meetings.map((r) => ({ summary: null, summary_doc: null, notes: null, notes_doc: null, started_at: null, finalized_at: null, finalized_by: null, finalize_audience: null, finalize_with_access: null, secretary_id: null, updated_by: null, ...r })));
  await put(supabase, 'meeting_attendees', s.attendees.map((r) => ({ notes: null, ...r })));
  await put(supabase, 'meeting_agreements', s.agreements);
  await put(supabase, 'meeting_commitments', s.commitments);
  await put(supabase, 'meeting_tasks', s.tasks);
  if (withAttachment) {
    const meetingId = s.meetings[0].id;
    const path = `${ws}/${meetingId}/1792521000000-Acta_analisis_de_evidencias.pdf`;
    const body = pdf('Acta — Análisis de evidencias de aprendizaje', [
      'Fecha: 20 de octubre de 2026', `Comunidad: ${label}`, 'Documento sintético para pruebas visuales.',
      'Acuerdos: compartir una evidencia semanal; usar la pauta de observación.',
    ]);
    await upload(supabase, 'meeting-documents', path, body, MIME.pdf);
    await put(supabase, 'meeting_attachments', [{
      id: id(G.mattach, k + 1), meeting_id: meetingId, filename: 'Acta_analisis_de_evidencias.pdf', file_path: path,
      file_size: body.length, file_type: MIME.pdf, uploaded_by: p.sec,
      uploaded_at: T('2026-10-20T17:05:00-03:00'), created_at: T('2026-10-20T17:05:00-03:00'),
    }]);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Documents tab: folders (one nested), and PDF / Word / Excel / PNG files in local storage (bucket `resources`).
// ---------------------------------------------------------------------------------------------------------------
async function seedDocuments(supabase, k, ws, p, label) {
  const f = (n) => id(G.folder, k + n);
  await put(supabase, 'document_folders', [
    { id: f(1), workspace_id: ws, folder_name: 'Planificaciones', parent_folder_id: null, created_by: p.lead, created_at: T('2026-10-02T10:00:00-03:00'), updated_at: T('2026-10-02T10:00:00-03:00') },
    { id: f(2), workspace_id: ws, folder_name: 'Actas de reuniones', parent_folder_id: null, created_by: p.sec, created_at: T('2026-10-02T10:05:00-03:00'), updated_at: T('2026-10-02T10:05:00-03:00') },
  ]);
  await put(supabase, 'document_folders', [
    { id: f(3), workspace_id: ws, folder_name: 'Evidencias de aula', parent_folder_id: f(1), created_by: p.lead, created_at: T('2026-10-03T11:00:00-03:00'), updated_at: T('2026-10-03T11:00:00-03:00') },
  ]);

  const files = [
    { n: 1, folder: null, title: 'Calendario de la comunidad 2026', file: 'Calendario_comunidad_2026.pdf', kind: 'pdf', by: p.lead, at: '2026-10-02T12:00:00-03:00', tags: ['calendario'], views: 14, downloads: 6,
      body: () => pdf('Calendario de la comunidad 2026', [label, 'Reuniones: martes 15:30 a 17:00', 'Jornada de cierre: diciembre', 'Documento sintético para pruebas visuales.']) },
    { n: 2, folder: null, title: 'Pauta de observación de clases', file: 'Pauta_observacion_clases.docx', kind: 'docx', by: p.sec, at: '2026-10-06T09:30:00-03:00', tags: ['observación', 'pauta'], views: 22, downloads: 11,
      body: () => docx(['Pauta de observación de clases', 'Dimensión 1: clima de aula', 'Dimensión 2: retroalimentación formativa', 'Documento sintético para pruebas visuales.']) },
    { n: 3, folder: f(1), title: 'Planificación unidad 3 — Lenguaje', file: 'Planificacion_unidad_3_Lenguaje.docx', kind: 'docx', by: p.sec, at: '2026-10-26T18:00:00-03:00', tags: ['lenguaje', 'planificación'], views: 9, downloads: 4,
      body: () => docx(['Planificación unidad 3 — Lenguaje', 'Objetivo: comprensión lectora de textos informativos', 'Duración: 6 semanas', 'Documento sintético para pruebas visuales.']) },
    { n: 4, folder: f(1), title: 'Registro de avances por curso', file: 'Registro_avances.xlsx', kind: 'xlsx', by: p.lead, at: '2026-10-29T16:00:00-03:00', tags: ['seguimiento'], views: 7, downloads: 2,
      body: () => xlsx([['Curso', 'Avance', 'Observaciones'], ['1° básico A', '75%', 'En curso'], ['2° básico B', '60%', 'Requiere apoyo'], ['3° básico A', '90%', 'Al día']]) },
    { n: 5, folder: f(2), title: 'Acta reunión 20 de octubre', file: 'Acta_reunion_20_octubre.pdf', kind: 'pdf', by: p.sec, at: '2026-10-20T17:20:00-03:00', tags: ['acta'], views: 11, downloads: 5,
      body: () => pdf('Acta reunión 20 de octubre', ['Análisis de evidencias de aprendizaje', 'Tres acuerdos y tres compromisos', 'Documento sintético para pruebas visuales.']) },
    { n: 6, folder: f(3), title: 'Mural de aula — ciclo de lectura', file: 'Mural_aula_ciclo_lectura.png', kind: 'png', by: p.a, at: '2026-11-04T13:00:00-03:00', tags: ['evidencia'], views: 5, downloads: 1,
      body: () => png(160, 100, [251, 191, 36], [10, 10, 10]) },
  ];
  const docs = [];
  const versions = [];
  for (const d of files) {
    const body = d.body();
    const folderPath = d.folder ? `folder-${d.folder}` : 'root';
    const storagePath = `documents/${ws}/${folderPath}/${Date.parse(T(d.at))}-${d.file}`;
    await upload(supabase, 'resources', storagePath, body, MIME[d.kind]);
    docs.push({
      id: id(G.doc, k + d.n), workspace_id: ws, folder_id: d.folder, title: d.title, description: null, tags: d.tags,
      file_name: d.file, file_size: body.length, mime_type: MIME[d.kind], storage_path: storagePath, current_version: 1,
      is_active: true, download_count: d.downloads, view_count: d.views, uploaded_by: d.by, created_at: T(d.at), updated_at: T(d.at),
    });
    versions.push({ id: id(G.docver, k + d.n), document_id: id(G.doc, k + d.n), version_number: 1, storage_path: storagePath,
      file_size: body.length, mime_type: MIME[d.kind], uploaded_by: d.by, created_at: T(d.at) });
  }
  await put(supabase, 'community_documents', docs);
  await put(supabase, 'document_versions', versions);
}

// ---------------------------------------------------------------------------------------------------------------
// Messaging tab: threads (pinned general, resources, questions) with messages, a reply, a mention and reactions.
// ---------------------------------------------------------------------------------------------------------------
async function seedMessaging(supabase, k, ws, p, names) {
  const th = (n) => id(G.thread, k + n);
  const msg = (n) => id(G.message, k + n);
  const threads = [
    { n: 1, title: 'Bienvenida y acuerdos de funcionamiento', desc: 'Normas básicas para el trabajo en el espacio colaborativo.', category: 'general', pinned: true, by: p.lead, at: '2026-10-02T09:00:00-03:00' },
    { n: 2, title: 'Recursos para la unidad de comprensión lectora', desc: 'Compartamos aquí materiales y lecturas sugeridas.', category: 'resources', pinned: false, by: p.sec, at: '2026-10-08T11:00:00-03:00' },
    { n: 3, title: '¿Cómo registramos las evidencias de la jornada?', desc: 'Dudas sobre el formato de registro.', category: 'questions', pinned: false, by: p.a, at: '2026-11-04T10:00:00-03:00' },
  ];
  const messages = [
    [1, 1, p.lead, '2026-10-02T09:00:00-03:00', 'Bienvenidas y bienvenidos al espacio de la comunidad. Usemos este hilo para acordar cómo trabajaremos durante el semestre.'],
    [2, 1, p.sec, '2026-10-02T09:40:00-03:00', 'Propongo que cada semana alguien comparta una evidencia de aula y la comentemos en la reunión del martes.'],
    [3, 1, p.a, '2026-10-02T10:15:00-03:00', `De acuerdo. @${names.lead} ¿podemos dejar la pauta de observación en Documentos?`, { reply: 2, mention: 'lead' }],
    [4, 1, p.lead, '2026-10-02T11:00:00-03:00', 'Listo, quedó en la carpeta raíz de Documentos.'],
    [5, 2, p.sec, '2026-10-08T11:00:00-03:00', 'Dejo la planificación de la unidad 3 y una lista de textos informativos para primer ciclo.'],
    [6, 2, p.lead, '2026-10-08T12:30:00-03:00', 'Gracias. Agregué el registro de avances por curso en la carpeta Planificaciones.'],
    [7, 3, p.a, '2026-11-04T10:00:00-03:00', `@${names.lead} ¿el registro de evidencias va por curso o por docente?`, { mention: 'lead' }],
    [8, 3, p.lead, '2026-11-04T11:20:00-03:00', 'Por curso, con una fotografía y una breve descripción de la actividad.', { reply: 7 }],
    [9, 3, p.sec, '2026-11-04T12:05:00-03:00', 'Subí un ejemplo en Evidencias de aula para que sirva de modelo.'],
  ];
  await put(supabase, 'message_threads', threads.map((t) => {
    const own = messages.filter((m) => m[1] === t.n);
    const last = own[own.length - 1][3];
    return { id: th(t.n), workspace_id: ws, thread_title: t.title, description: t.desc, category: t.category, created_by: t.by,
      is_pinned: t.pinned, is_locked: false, is_archived: false, last_message_at: T(last), message_count: own.length,
      participant_count: new Set(own.map((m) => m[2])).size, created_at: T(t.at), updated_at: T(last) };
  }));
  // Insert in order: a reply needs its parent message in place (guard_message_parent_context).
  for (const [n, t, by, at, content, extra = {}] of messages) {
    await put(supabase, 'community_messages', [{
      id: msg(n), workspace_id: ws, thread_id: th(t), reply_to_id: extra.reply ? msg(extra.reply) : null, author_id: by,
      content, content_html: null, message_type: 'regular', is_edited: false, is_deleted: false, created_at: T(at), updated_at: T(at),
    }]);
  }
  const mentions = messages.filter((m) => m[5]?.mention).map(([n, , , at], i) => ({
    id: id(G.mention, k + 1 + i), message_id: msg(n), mentioned_user_id: p.lead, mention_text: `@${names.lead}`, is_read: i === 0, created_at: T(at),
  }));
  await put(supabase, 'message_mentions', mentions);
  const reactions = [
    [1, p.sec, 'thumbs_up'], [1, p.a, 'celebration'], [2, p.lead, 'lightbulb'], [2, p.a, 'thumbs_up'],
    [5, p.lead, 'heart'], [8, p.a, 'thumbs_up'], [9, p.lead, 'eyes'],
  ].map(([n, by, type], i) => ({ id: id(G.reaction, k + 1 + i), message_id: msg(n), user_id: by, reaction_type: type, created_at: T('2026-11-04T13:00:00-03:00') }));
  await put(supabase, 'message_reactions', reactions);
}

// ---------------------------------------------------------------------------------------------------------------
// Overview tab (feed): text, image (local PNG), link and document posts, one pinned, with comments, reactions
// and a mention.
// ---------------------------------------------------------------------------------------------------------------
async function seedFeed(supabase, storageBase, k, ws, p, names) {
  const post = (n) => id(G.post, k + n);
  const imgPath = `rd40/feed/${ws}/mural-lectura.png`;
  await upload(supabase, 'resources', imgPath, png(320, 200, [254, 243, 199], [217, 119, 6]), MIME.png);
  const actaPath = `rd40/feed/${ws}/pauta-retroalimentacion.pdf`;
  const acta = pdf('Pauta de retroalimentación entre pares', ['Tres preguntas guía para la conversación', 'Documento sintético para pruebas visuales.']);
  await upload(supabase, 'resources', actaPath, acta, MIME.pdf);

  const posts = [
    { n: 1, by: p.lead, type: 'text', pinned: true, at: '2026-10-21T09:00:00-03:00', views: 31,
      content: { text: 'Gracias a todas y todos por la reunión de ayer. Quedaron tres acuerdos claros y el acta ya está en Documentos. ¡Sigamos compartiendo evidencias cada semana!' } },
    { n: 2, by: p.a, type: 'image', at: '2026-11-04T13:10:00-03:00', views: 18,
      content: { text: 'Así quedó el mural del ciclo de lectura en 2° básico. Los estudiantes eligieron los textos informativos.' } },
    { n: 3, by: p.sec, type: 'text', at: '2026-11-06T16:45:00-03:00', views: 12,
      content: { text: `@${names.lead} dejé la propuesta de pauta para la jornada de retroalimentación; ¿la revisamos el martes?` } },
    { n: 4, by: p.lead, type: 'link', at: '2026-11-09T10:20:00-03:00', views: 9,
      content: { text: 'Recurso sugerido para la próxima reunión.', link: { url: 'https://example.org/recursos/retroalimentacion-formativa', title: 'Retroalimentación formativa en el aula', description: 'Guía breve con ejemplos de preguntas para la retroalimentación (enlace de ejemplo).' } } },
    { n: 5, by: p.sec, type: 'document', at: '2026-11-11T15:00:00-03:00', views: 6,
      content: { text: 'Comparto la pauta en PDF para quienes no alcanzaron a verla.', document: { url: `${storageBase}/${actaPath}`, name: 'Pauta de retroalimentación entre pares.pdf', size: acta.length } } },
  ];
  await put(supabase, 'community_posts', posts.map((x) => ({
    id: post(x.n), workspace_id: ws, author_id: x.by, type: x.type, content: x.content, visibility: 'community',
    is_pinned: !!x.pinned, is_archived: false, view_count: x.views, created_at: T(x.at), updated_at: T(x.at),
  })));
  await put(supabase, 'post_media', [{
    id: id(G.pmedia, k + 1), post_id: post(2), type: 'image', url: `${storageBase}/${imgPath}`, storage_path: imgPath,
    caption: 'Mural del ciclo de lectura', order_index: 0, metadata: { name: 'mural-lectura.png' }, created_at: T('2026-11-04T13:10:00-03:00'),
  }]);
  await put(supabase, 'post_mentions', [{ id: id(G.pmention, k + 1), post_id: post(3), mentioned_user_id: p.lead, created_at: T('2026-11-06T16:45:00-03:00') }]);
  const comments = [
    [1, 1, p.sec, '2026-10-21T10:05:00-03:00', 'Gracias a ti por la conducción. El acta quedó muy completa.'],
    [2, 1, p.a, '2026-10-21T11:30:00-03:00', 'Me comprometo a subir la primera evidencia esta semana.'],
    [3, 2, p.lead, '2026-11-04T14:00:00-03:00', '¡Qué buen trabajo! Podríamos presentarlo en el consejo de profesores.'],
    [4, 2, p.a, '2026-11-04T14:20:00-03:00', 'Encantada, lo preparo para la próxima sesión.', 3],
    [5, 3, p.lead, '2026-11-06T17:30:00-03:00', 'Sí, la dejamos como primer punto de la tabla.'],
  ];
  for (const [n, onPost, by, at, content, parent] of comments) {
    await put(supabase, 'post_comments', [{ id: id(G.comment, k + n), post_id: post(onPost), author_id: by, content,
      parent_comment_id: parent ? id(G.comment, k + parent) : null, is_edited: false, created_at: T(at), updated_at: T(at) }]);
  }
  await put(supabase, 'post_reactions', [
    [1, p.sec, 'like'], [1, p.a, 'celebrate'], [2, p.lead, 'love'], [2, p.sec, 'insightful'], [3, p.lead, 'support'], [4, p.a, 'like'],
  ].map(([n, by, type], i) => ({ id: id(G.preaction, k + 1 + i), post_id: post(n), user_id: by, reaction_type: type, created_at: T('2026-11-06T18:00:00-03:00') })));
}

// ---------------------------------------------------------------------------------------------------------------
// News (/admin/news, /noticias, /noticias/[slug], dashboard block): published with image (the lead article),
// published without image, an older one, and drafts. Events (/admin/events, /noticias): past Oct–Nov 2026,
// upcoming 2030, and one draft.
// ---------------------------------------------------------------------------------------------------------------
function tiptapToHtml(d) {
  return d.content.map((n) => (n.type === 'bulletList'
    ? `<ul>${n.content.map((li) => `<li><p>${li.content[0].content[0].text}</p></li>`).join('')}</ul>`
    : n.type === 'heading' ? `<h${n.attrs.level}>${n.content[0].text}</h${n.attrs.level}>` : `<p>${n.content[0].text}</p>`)).join('');
}

async function seedNews(supabase, storageBase, users) {
  const imgPath = 'rd40/news/encuentro-comunidades.png';
  await upload(supabase, 'resources', imgPath, png(640, 360, [10, 10, 10], [251, 191, 36]), MIME.png);
  const img2 = 'rd40/news/jornada-lectura.png';
  await upload(supabase, 'resources', img2, png(640, 360, [219, 234, 254], [30, 64, 175]), MIME.png);
  const articles = [
    { n: 1, slug: NEWS_SLUG, title: 'Encuentro sintético de Comunidades de Crecimiento 2026', image: imgPath, published: true, date: '2026-11-10T10:00:00-03:00',
      content: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Más de cuarenta docentes de las comunidades de crecimiento se reunieron para compartir prácticas de retroalimentación formativa y observación entre pares.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Lo que aprendimos' }] },
        { type: 'bulletList', content: ['La observación entre pares fortalece la confianza profesional.', 'Las evidencias de aula ordenan la conversación pedagógica.', 'Los acuerdos breves y concretos se cumplen más.'].map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) },
        { type: 'paragraph', content: [{ type: 'text', text: 'Esta noticia es contenido sintético para pruebas visuales y no describe un evento real.' }] },
      ] } },
    { n: 2, slug: 'jornada-sintetica-de-lectura-compartida-2026', title: 'Jornada de lectura compartida en el Colegio Sintetico E2E', image: img2, published: true, date: '2026-10-28T09:00:00-03:00',
      content: doc('Estudiantes de primer ciclo participaron en una jornada de lectura compartida preparada por su comunidad de crecimiento.', 'Contenido sintético para pruebas visuales.') },
    { n: 3, slug: 'nuevo-ciclo-sintetico-de-formacion-docente', title: 'Abrimos un nuevo ciclo de formación docente', image: null, published: true, date: '2026-10-14T09:00:00-03:00',
      content: doc('El nuevo ciclo de formación aborda la evaluación formativa y el liderazgo pedagógico en la escuela.', 'Contenido sintético para pruebas visuales.') },
    { n: 4, slug: 'balance-sintetico-del-primer-semestre', title: 'Balance del primer semestre de acompañamiento', image: null, published: true, date: '2026-10-02T09:00:00-03:00',
      content: doc('Revisamos los principales avances del acompañamiento a escuelas durante el primer semestre.', 'Contenido sintético para pruebas visuales.') },
    { n: 5, slug: 'borrador-sintetico-convocatoria-pasantias-2027', title: 'Convocatoria a pasantías 2027 (borrador)', image: null, published: false, date: '2026-11-12T09:00:00-03:00',
      content: doc('Borrador de la convocatoria. Falta confirmar fechas y cupos.', 'Contenido sintético para pruebas visuales.') },
    { n: 6, slug: 'borrador-sintetico-galeria-encuentro', title: 'Galería de fotos del encuentro (borrador)', image: imgPath, published: false, date: '2026-11-11T09:00:00-03:00',
      content: doc('Selección de fotografías del encuentro de comunidades.', 'Contenido sintético para pruebas visuales.') },
  ];
  await put(supabase, 'news_articles', articles.map((a) => ({
    id: id(G.news, a.n), title: a.title, slug: a.slug, content: a.content, content_html: tiptapToHtml(a.content),
    featured_image: a.image ? `${storageBase}/${a.image}` : null, is_published: a.published, author_id: users.admin,
    created_at: T(a.date), updated_at: T(a.date), display_date: T(a.date),
  })));

  const events = [
    [1, 'Encuentro de Comunidades de Crecimiento', 'Santiago, Centro de Eventos Sintético', '2026-11-10', null, '09:00 - 13:00', 'Jornada de intercambio de prácticas entre comunidades.', true],
    [2, 'Taller de retroalimentación formativa', 'En línea', '2026-10-22', null, '16:00 - 17:30', 'Taller abierto para docentes de las escuelas acompañadas.', true],
    [3, 'Seminario de liderazgo pedagógico', 'Valparaíso, Sede Sintética', '2026-10-07', '2026-10-08', '09:00 - 17:00', 'Dos días de trabajo con equipos directivos.', true],
    [4, 'Jornada de inicio del año escolar', 'Santiago, Colegio Sintetico E2E', '2030-03-04', null, '08:30 - 12:30', 'Bienvenida a las comunidades y presentación del plan anual.', true],
    [5, 'Congreso sintético de educación', 'Concepción, Centro de Convenciones Sintético', '2030-04-16', '2030-04-18', '09:00 - 18:00', 'Tres días de ponencias y talleres.', true],
    [6, 'Feria de proyectos de aula', 'En línea', '2030-05-20', null, '15:00 - 18:00', 'Las comunidades presentan sus proyectos del primer semestre.', true],
    [7, 'Pasantía de invierno (por confirmar)', 'Por confirmar', '2030-07-08', '2030-07-12', null, 'Evento en preparación; aún no se publica.', false],
  ];
  await put(supabase, 'events', events.map(([n, title, location, start, end, time, description, published]) => ({
    id: id(G.event, n), title, location, date_start: start, date_end: end, time, description,
    link_url: n === 5 ? 'https://example.org/congreso-sintetico' : null, link_display: n === 5 ? 'Más información' : null,
    is_published: published, created_by: users.admin, created_at: T('2026-10-01T12:00:00-03:00'), updated_at: T('2026-10-01T12:00:00-03:00'),
  })));
}

// ---------------------------------------------------------------------------------------------------------------
// Notifications (bell + /notifications) for the nine picture accounts, as the dispatcher leaves them after
// in-app delivery: catalog category, template title/description, role-safe related_url, idempotency key
// notif-sha256([event, occurrence, user]), notification_type_id null (types are not seeded). No e-mail outbox
// rows are written: an outbox row is mail waiting to be sent, and nothing here should ever be sent.
// ---------------------------------------------------------------------------------------------------------------
const idem = (event, occurrence, user) => `notif-${createHash('sha256').update(JSON.stringify([event, occurrence, user])).digest('hex')}`;

async function seedNotifications(supabase, users, ws) {
  const thread = (k, n) => `/community/workspace?section=messaging&thread=${id(G.thread, k + n)}`;
  const N = [];
  let n = 0;
  const add = (user, event, occurrence, category, title, description, url, at, read, importance = 'normal') => {
    n += 1;
    N.push({ id: id(G.notif, n), user_id: user, notification_type_id: null, title, description, related_url: url,
      is_read: read, read_at: read ? new Date(Date.parse(at) + 2 * 3600 * 1000).toISOString() : null,
      created_at: T(at), category, importance, idempotency_key: idem(event, occurrence, user) });
  };
  const sys = (user, i) => add(user, 'system_update', `record:${id(G.notif, 0xf0)}`, 'system', 'Nueva versión de la plataforma',
    'Mejoramos la velocidad de carga de los cursos y el buscador de documentos.', '/dashboard', '2026-10-05T08:00:00-03:00', true, 'low');

  // gcLeader (lider_comunidad, fixture community): messages and mentions in their workspace, meeting finalized.
  add(users.gcLeader, 'user_mentioned', `record:${id(G.message, 0x07)}`, 'community', 'Admin Sintetico te ha mencionado', '¿el registro de evidencias va por curso o por docente?', thread(0, 3), '2026-11-04T10:00:00-03:00', false);
  add(users.gcLeader, 'message_sent', `record:${id(G.message, 0x09)}`, 'community', 'Mensaje de Consultor Escuela Sintetico', 'Subí un ejemplo en Evidencias de aula para que sirva de modelo.', thread(0, 3), '2026-11-04T12:05:00-03:00', false);
  add(users.gcLeader, 'meeting_finalized', `record:${id(G.meeting, 0x01)}`, 'community', 'Reunión finalizada: Análisis de evidencias de aprendizaje', 'La reunión "Análisis de evidencias de aprendizaje" fue finalizada por Lider Comunidad Sintetico. Enviada a la Comunidad de Crecimiento.', '/community/workspace?section=meetings', '2026-10-20T17:10:00-03:00', true);
  add(users.gcLeader, 'session_created', `record:${fixtureSession}`, 'sessions', 'Sesión agendada: Sesion Sintetica E2E - provisionable', 'Su sesión quedó agendada para el 12 de junio de 2030 a las 15:00.', `/consultor/sessions/${fixtureSession}`, '2026-10-09T11:00:00-03:00', true);
  sys(users.gcLeader);

  // communityManager (fixture community c02).
  add(users.communityManager, 'message_sent', `record:${id(G.message, 0x42)}`, 'community', 'Mensaje de Admin Sintetico', 'Propongo que cada semana alguien comparta una evidencia de aula y la comentemos en la reunión del martes.', thread(0x40, 1), '2026-10-02T09:00:00-03:00', false);
  add(users.communityManager, 'meeting_finalized', `record:${id(G.meeting, 0x41)}`, 'community', 'Reunión finalizada: Análisis de evidencias de aprendizaje', 'La reunión "Análisis de evidencias de aprendizaje" fue finalizada por Community Manager Sintetica. Enviada a la Comunidad de Crecimiento.', '/community/workspace?section=meetings', '2026-10-20T17:10:00-03:00', false);
  add(users.communityManager, 'course_assigned', 'unidentified:' + id(G.notif, 0xf1), 'courses', 'Nuevo curso asignado: Liderazgo de comunidades', 'Se te ha asignado el curso "Liderazgo de comunidades". Haz clic para comenzar tu aprendizaje.', '/mi-aprendizaje', '2026-10-12T09:00:00-03:00', true);
  sys(users.communityManager);

  // admin: feedback, session change request, mention in a workspace.
  add(users.admin, 'new_feedback', `record:${id(G.feedback, 1)}`, 'qa_support', 'Nuevo feedback: Colegio Sintetico E2E', 'Al subir un documento de más de 10 MB la barra de progreso se queda detenida...', '/admin/feedback', '2026-11-12T09:15:00-03:00', false, 'high');
  add(users.admin, 'new_feedback', `record:${id(G.feedback, 6)}`, 'qa_support', 'Nuevo feedback recibido', 'Sería útil poder filtrar las notificaciones por comunidad...', '/admin/feedback', '2026-11-11T17:40:00-03:00', false, 'high');
  add(users.admin, 'session_edit_request_submitted', 'unidentified:' + id(G.notif, 0xf2), 'sessions', 'Solicitud de cambio: Sesion Sintetica E2E - enlace manual', 'Se solicitó cambiar la fecha de la sesión.', '/admin/sessions/approvals', '2026-11-06T12:00:00-03:00', true);
  add(users.admin, 'new_feedback', `record:${id(G.feedback, 3)}`, 'qa_support', 'Nuevo feedback: Colegio Sintetico E2E', 'Al finalizar una reunión, el resumen no muestra los compromisos asignados a docentes de otra comunidad...', '/admin/feedback', '2026-11-05T16:40:00-03:00', true, 'high');
  sys(users.admin);

  // consultorAssigned: sessions and assignments.
  add(users.consultorAssigned, 'session_reminder_24h', `record:${fixtureSession}:2030-06-12T18%3A00%3A00.000Z`, 'sessions', 'Recordatorio: Sesion Sintetica E2E - provisionable mañana', 'La sesión comienza mañana a las 15:00.', `/consultor/sessions/${fixtureSession}`, '2026-11-12T15:00:00-03:00', false);
  add(users.consultorAssigned, 'session_created', `record:${fixtureSession}`, 'sessions', 'Sesión agendada: Sesion Sintetica E2E - provisionable', 'Su sesión quedó agendada para el 12 de junio de 2030 a las 15:00.', `/consultor/sessions/${fixtureSession}`, '2026-10-09T11:00:00-03:00', true);
  add(users.consultorAssigned, 'consultant_assigned', `record:${id(G.notif, 0xf3)}`, 'advisory', 'Nuevo consultor asignado: Consultor Escuela Sintetico', 'Consultor Escuela Sintetico ha sido asignado como tu consultor.', '/profile', '2026-10-03T10:00:00-03:00', false);
  sys(users.consultorAssigned);

  // directivo (equipo_directivo).
  add(users.directivo, 'session_created', `record:${fixtureSession}`, 'sessions', 'Sesión agendada: Sesion Sintetica E2E - provisionable', 'Su sesión quedó agendada para el 12 de junio de 2030 a las 15:00.', `/meet/session/${fixtureSession}`, '2026-10-09T11:00:00-03:00', false);
  add(users.directivo, 'course_assigned', 'unidentified:' + id(G.notif, 0xf4), 'courses', 'Nuevo curso asignado: Gestión pedagógica para equipos directivos', 'Se te ha asignado el curso "Gestión pedagógica para equipos directivos". Haz clic para comenzar tu aprendizaje.', '/mi-aprendizaje', '2026-10-15T09:00:00-03:00', false);
  add(users.directivo, 'consultant_assigned', `record:${id(G.notif, 0xf5)}`, 'advisory', 'Nuevo consultor asignado: Consultor Escuela Sintetico', 'Consultor Escuela Sintetico ha sido asignado como tu consultor.', '/profile', '2026-10-03T10:00:00-03:00', true);
  sys(users.directivo);

  // docente.
  add(users.docente, 'assignment_created', `record:${id(G.notif, 0xf6)}`, 'assignments', 'Nueva tarea: Reflexión sobre la práctica', 'Se te ha asignado la tarea "Reflexión sobre la práctica".', '/assignments', '2026-11-09T08:30:00-03:00', false);
  add(users.docente, 'course_assigned', 'unidentified:' + id(G.notif, 0xf7), 'courses', 'Nuevo curso asignado: Evaluación formativa en el aula', 'Se te ha asignado el curso "Evaluación formativa en el aula". Haz clic para comenzar tu aprendizaje.', '/mi-aprendizaje', '2026-10-20T09:00:00-03:00', false);
  add(users.docente, 'assignment_feedback', 'unidentified:' + id(G.notif, 0xf8), 'assignments', 'Retroalimentación recibida: Diagnóstico de aula', 'Tu tarea "Diagnóstico de aula" ha sido revisada.', '/assignments', '2026-10-30T17:00:00-03:00', true);
  add(users.docente, 'session_created', `record:${fixtureSession}`, 'sessions', 'Sesión agendada: Sesion Sintetica E2E - provisionable', 'Su sesión quedó agendada para el 12 de junio de 2030 a las 15:00.', `/meet/session/${fixtureSession}`, '2026-10-09T11:00:00-03:00', true);
  sys(users.docente);

  // generationLeader.
  add(users.generationLeader, 'course_assigned', 'unidentified:' + id(G.notif, 0xf9), 'courses', 'Nuevo curso asignado: Liderazgo de generación', 'Se te ha asignado el curso "Liderazgo de generación". Haz clic para comenzar tu aprendizaje.', '/mi-aprendizaje', '2026-11-02T09:00:00-03:00', false);
  add(users.generationLeader, 'course_completed', `record:${id(G.notif, 0xfa)}`, 'courses', 'Curso completado: Fundamentos de la mejora escolar', 'Completaste el curso "Fundamentos de la mejora escolar".', '/mi-aprendizaje', '2026-10-25T18:00:00-03:00', true);
  sys(users.generationLeader);

  // networkSupervisor.
  add(users.networkSupervisor, 'system_update', `record:${id(G.notif, 0xfb)}`, 'system', 'Nuevos reportes de red disponibles', 'Ya puedes revisar el avance consolidado de las escuelas de tu red.', '/dashboard', '2026-11-08T08:00:00-03:00', false, 'low');
  add(users.networkSupervisor, 'course_assigned', 'unidentified:' + id(G.notif, 0xfc), 'courses', 'Nuevo curso asignado: Supervisión pedagógica en red', 'Se te ha asignado el curso "Supervisión pedagógica en red". Haz clic para comenzar tu aprendizaje.', '/mi-aprendizaje', '2026-10-18T09:00:00-03:00', false);
  sys(users.networkSupervisor);

  // procurementManager (encargado_licitacion).
  add(users.procurementManager, 'licitacion_published', `record:${id(G.notif, 0xfd)}`, 'licitaciones', 'Publicacion registrada: LIC-SINT-2026-004', 'La licitacion LIC-SINT-2026-004 ha sido publicada el 3 de noviembre de 2026.', '/licitaciones', '2026-11-03T10:00:00-03:00', false);
  add(users.procurementManager, 'licitacion_consultas_deadline_1d', `record:${id(G.notif, 0xfe)}:2026-11-07:1d`, 'licitaciones', 'Mañana vence el plazo de consultas: LIC-SINT-2026-004', 'El plazo de consultas de la licitacion LIC-SINT-2026-004 vence mañana.', '/licitaciones', '2026-11-06T09:00:00-03:00', false, 'high');
  add(users.procurementManager, 'licitacion_created', `record:${id(G.notif, 0xff)}`, 'licitaciones', 'Licitacion creada: LIC-SINT-2026-004', 'Se creó la licitacion LIC-SINT-2026-004 para Colegio Sintetico E2E.', '/licitaciones', '2026-10-20T10:00:00-03:00', true);
  sys(users.procurementManager);

  await put(supabase, 'user_notifications', N);
}
let fixtureSession; // set in seed(): the fixture Zoom session id, a real record for session links.

// ---------------------------------------------------------------------------------------------------------------
// Platform feedback (/admin/feedback): every status (new, seen, in_progress, resolved, closed) and every type
// (bug, idea, feedback), with the reply thread FeedbackDetail shows, including the system lines the status
// trigger writes ("Estado cambiado de … a …", authored by the reporter, as add_feedback_activity does).
// ---------------------------------------------------------------------------------------------------------------
async function seedFeedback(supabase, users) {
  const items = [
    [1, users.docente, 'bug', 'new', '/community/workspace?section=documents', '2026-11-12T09:15:00-03:00', null, null,
      'Al subir un documento de más de 10 MB la barra de progreso se queda detenida y no aparece ningún mensaje.'],
    [2, users.directivo, 'idea', 'seen', '/reports', '2026-11-09T11:20:00-03:00', null, null,
      'Sería muy útil poder descargar el reporte de la escuela en PDF para compartirlo con el sostenedor.'],
    [3, users.gcLeader, 'bug', 'in_progress', '/community/workspace?section=meetings', '2026-11-05T16:40:00-03:00', null, null,
      'Al finalizar una reunión, el resumen no muestra los compromisos asignados a docentes de otra comunidad.'],
    [4, users.consultorAssigned, 'feedback', 'resolved', '/consultor/sessions', '2026-10-28T10:05:00-03:00', '2026-11-03T12:00:00-03:00', 'Se ajustó el orden de las sesiones: ahora aparecen primero las próximas.',
      'La lista de sesiones mostraba primero las pasadas; costaba encontrar la siguiente sesión.'],
    [5, users.communityManager, 'idea', 'closed', '/community/workspace', '2026-10-15T09:30:00-03:00', '2026-10-22T15:00:00-03:00', 'Se registró para el plan del próximo año; por ahora no se implementará.',
      'Propongo agregar un calendario compartido dentro del espacio colaborativo.'],
    [6, users.generationLeader, 'feedback', 'new', '/notifications', '2026-11-11T17:40:00-03:00', null, null,
      'Sería útil poder filtrar las notificaciones por comunidad o por tipo de actividad.'],
  ];
  await put(supabase, 'platform_feedback', items.map(([n, by, type, status, page, at, resolvedAt, notes, description]) => ({
    id: id(G.feedback, n), title: null, description, type, status, page_url: `http://localhost:3300${page}`,
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    browser_info: { language: 'es-CL', platform: 'Linux x86_64', screenResolution: '1920x1080', viewport: '1440x900', referrer: '' },
    screenshot_url: null, screenshot_filename: null, created_by: by, created_at: T(at), updated_at: T(resolvedAt || at),
    resolved_at: resolvedAt ? T(resolvedAt) : null, resolution_notes: notes,
  })));
  const reporter = Object.fromEntries(items.map((i) => [i[0], i[1]]));
  const acts = [
    [2, 1, 'Estado cambiado de new a seen', true, '2026-11-10T09:00:00-03:00'],
    [2, 2, 'Gracias por la propuesta. La revisaremos con el equipo de reportes.', false, '2026-11-10T09:05:00-03:00', users.admin],
    [3, 1, 'Estado cambiado de new a seen', true, '2026-11-06T08:30:00-03:00'],
    [3, 2, 'Estado cambiado de seen a in_progress', true, '2026-11-06T08:35:00-03:00'],
    [3, 3, 'Pudimos reproducirlo. Estamos revisando cómo se arma el resumen.', false, '2026-11-06T08:40:00-03:00', users.admin],
    [3, 4, 'Gracias. Si necesitan un ejemplo, la reunión del 20 de octubre lo muestra.', false, '2026-11-06T10:15:00-03:00'],
    [4, 1, 'Estado cambiado de new a in_progress', true, '2026-10-29T09:00:00-03:00'],
    [4, 2, 'Estado cambiado de in_progress a resolved', true, '2026-11-03T12:00:00-03:00'],
    [4, 3, 'Listo: las próximas sesiones aparecen primero. ¿Nos confirmas si te acomoda?', false, '2026-11-03T12:05:00-03:00', users.admin],
    [4, 4, 'Confirmado, ahora se encuentra de inmediato. ¡Gracias!', false, '2026-11-03T16:20:00-03:00'],
    [5, 1, 'Estado cambiado de new a seen', true, '2026-10-16T09:00:00-03:00'],
    [5, 2, 'Estado cambiado de seen a closed', true, '2026-10-22T15:00:00-03:00'],
    [5, 3, 'Lo dejamos registrado para la planificación del próximo año.', false, '2026-10-22T15:02:00-03:00', users.admin],
  ];
  await put(supabase, 'feedback_activity', acts.map(([f, i, message, system, at, by]) => ({
    id: id(G.factivity, f * 16 + i), feedback_id: id(G.feedback, f), message, is_system_message: system,
    created_by: by || reporter[f], created_at: T(at),
  })));
}

// ---------------------------------------------------------------------------------------------------------------
export async function seed({ supabase, users, fixtures }) {
  await ensureBucket(supabase, 'resources', true);
  const storageBase = supabase.storage.from('resources').getPublicUrl('x').data.publicUrl.replace(/\/x$/, '');
  fixtureSession = fixtures.zoom.session.id;

  await seedPatioCommunity(supabase, fixtures, users);

  const wsZoom = await ensureWorkspace(supabase, id(G.base, 0x31), fixtures.zoom.community.id, fixtures.zoom.community.name, null);
  const wsRole = await ensureWorkspace(supabase, id(G.base, 0x32), fixtures.roleCommunity.id, fixtures.roleCommunity.name, null);
  const wsPatio = await ensureWorkspace(supabase, id(G.base, 0x33), COMMUNITY_PATIO, 'Comunidad de Crecimiento Sintetica E2E Patio', 'Patio de Ideas');

  // Fixture community (gcLeader leads it; consultor and admin take part as non-member attendees and authors).
  const zoom = { lead: users.gcLeader, sec: users.consultorAssigned, a: users.admin };
  const zoomNames = { lead: 'Lider Comunidad Sintetico' };
  await seedMeetings(supabase, 0x00, wsZoom, zoom, fixtures.zoom.community.name, true);
  await seedDocuments(supabase, 0x00, wsZoom, zoom, fixtures.zoom.community.name);
  await seedMessaging(supabase, 0x00, wsZoom, zoom, zoomNames);
  await seedFeed(supabase, storageBase, 0x00, wsZoom, zoom, zoomNames);

  // Patio (own community, five members).
  const patio = { lead: MEMBER[0], sec: MEMBER[1], a: MEMBER[2], b: MEMBER[3], c: MEMBER[4] };
  const patioNames = { lead: 'Antonia Lider Patio Sintetica' };
  await seedMeetings(supabase, 0x20, wsPatio, patio, 'Comunidad de Crecimiento Sintetica E2E Patio', true);
  await seedDocuments(supabase, 0x20, wsPatio, patio, 'Comunidad de Crecimiento Sintetica E2E Patio');
  await seedMessaging(supabase, 0x20, wsPatio, patio, patioNames);
  await seedFeed(supabase, storageBase, 0x20, wsPatio, patio, patioNames);

  // Fixture community of the community_manager (lighter: meetings, messages, feed).
  const role = { lead: users.communityManager, sec: users.admin, a: users.consultorAssigned };
  const roleNames = { lead: 'Community Manager Sintetica' };
  await seedMeetings(supabase, 0x40, wsRole, role, fixtures.roleCommunity.name, false);
  await seedMessaging(supabase, 0x40, wsRole, role, roleNames);
  await seedFeed(supabase, storageBase, 0x40, wsRole, role, roleNames);

  await seedNews(supabase, storageBase, users);
  await seedNotifications(supabase, users, wsZoom);
  await seedFeedback(supabase, users);
}

export const params = {
  '/admin/growth-communities/[id]/members': { default: { id: COMMUNITY_PATIO } },
  '/user/[userId]': { default: { userId: MEMBER[1] } },
  '/noticias/[slug]': { default: { slug: NEWS_SLUG } },
};

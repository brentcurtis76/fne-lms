// Seed module 30 — consultant sessions (06-sesiones) and hours, rates and expenses (17-horas-gastos).
//
// Invented content only, for the private local copy the picture harness walks. Every row has a fixed id in this
// module's space (UUIDs 5eed0030-0000-4000-8000-…), except the ledger rows, whose id the database assigns (they are
// found again by session). Rows are written with ON CONFLICT DO NOTHING, so a second run changes nothing (an UPDATE
// would also bump consultor_sessions.updated_at through its trigger). The three fixture sessions (e2e…0501-0503)
// are never touched.
//
// Rows are written in the shapes the application writes them:
//   sessions            pages/api/sessions/index.ts (create), [id]/approve.ts, [id]/finalize.ts, [id]/cancel.ts
//   hours ledger        lib/services/hour-tracking.ts createReservation (insert) then completeReservation /
//                       executeCancellation (update) — plain table writes in the app too, limited by column grants
//   hour override       apply_session_hour_override(), called as the signed-in fixture admin on the local stack
//   edit requests       pages/api/sessions/[id]/edit-requests.ts
//   rates / earnings    pages/api/admin/consultant-rates, get_consultant_earnings()
//   school hours report lib/services/school-hours-report.ts (clientes.school_id → contratos estado 'activo' →
//                       contract_hour_allocations → get_bucket_summary())
import { createHash } from 'node:crypto';
import { stack } from '../lib.mjs';

export const name = 'sesiones, horas y gastos';

const id = (n) => `5eed0030-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const SCHOOL = 990001;
const GC_MAIN = 'e2e00000-0000-4000-8000-000000000c01'; // Comunidad de Crecimiento Sintetica E2E (fixture)
const GC_ROLE = 'e2e00000-0000-4000-8000-000000000c02'; // Comunidad Sintetica Community Manager E2E (fixture)
const GENERATION = 'e2e00000-0000-4000-8000-000000000701';
const FIXTURE_LINKED_SESSION = 'e2e00000-0000-4000-8000-000000000502';

// ---- ids --------------------------------------------------------------------------------------------------------
const CLIENTE = id(0x10);
const PROGRAMA = id(0x11);
const CONTRATO = id(0x12);
const SERIES_A = id(0xd01); // weekly, October 2026 (past)
const SERIES_B = id(0xd02); // monthly, 2030 (upcoming)

const S = {
  P1: id(0x101), // completada, presencial — the richest one (report, materials, attendance, activity)
  P2: id(0x102), // completada, online
  P3: id(0x103), // pendiente_informe, híbrida
  P4: id(0x104), // en_progreso, online, attendance not yet marked
  P5: id(0x105), // cancelada with penalty (penalizada, cláusula 4), over budget
  P6: id(0x106), // cancelada, hours returned (devuelta, cláusula 1)
  A1: id(0x111), A2: id(0x112), A3: id(0x113), A4: id(0x114), // series A
  F1: id(0x121), // programada 2030, presencial
  B1: id(0x131), B2: id(0x132), B3: id(0x133), // series B
  D1: id(0x141), // borrador
  D2: id(0x142), // pendiente_aprobacion
  L1: id(0x151), L2: id(0x152), // completed legacy sessions without hour type (what /admin/bulk-tag-sessions lists)
};

// The nine hour types production carries (supabase/migrations-archive/20260224000000_hour_tracking_phase1.sql).
// The local baseline has none; another module may create them first, so they are looked up by key.
const HOUR_TYPES = [
  ['online_learning', 'Cursos Online (LMS)', 'online', 1],
  ['asesoria_tecnica_online', 'Asesoría Técnica Online', 'online', 2],
  ['asesoria_tecnica_presencial', 'Asesoría Técnica Presencial', 'presencial', 3],
  ['asesoria_directiva_online', 'Asesoría Directiva Online', 'online', 4],
  ['asesoria_directiva_presencial', 'Asesoría Directiva Presencial', 'presencial', 5],
  ['gestion_cambio_online', 'Gestión del Cambio Online', 'online', 6],
  ['gestion_cambio_presencial', 'Gestión del Cambio Presencial', 'presencial', 7],
  ['talleres_presenciales', 'Talleres Presenciales', 'presencial', 8],
  ['encuentro_lideres', 'Encuentro de Líderes', 'presencial', 9],
];

async function insertMissing(supabase, table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
}

const minutes = (start, end) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
};
const hoursOf = (start, end) => Math.round((minutes(start, end) / 60) * 100) / 100;
// Chile is on UTC-3 from September 2026 through April 2027 and on UTC-4 in the 2030 winter dates used below.
const at = (date, time, offset = '-03:00') => `${date}T${time}${offset}`;

const OVERRIDE_REQUEST_ID = 'seed-30-override-a2';
const OVERRIDE_REASON = 'La conexión del colegio se cortó durante 15 minutos; se descuenta solo el tiempo efectivo.';

export async function seed({ supabase, users, fixtures }) {
  const U = users;
  const ADMIN = U.admin;
  const CONS = U.consultorAssigned;

  // ================================================================================================================
  // Reference data: hour types (shared, by key), FX rate, expense categories
  // ================================================================================================================
  await insertMissing(
    supabase,
    'hour_types',
    HOUR_TYPES.map(([key, display_name, modality, sort_order], i) => ({
      id: id(1 + i), key, display_name, modality, sort_order, is_active: true, created_at: '2026-02-24T12:00:00-03:00',
    })),
    'key'
  );
  const { data: htRows, error: htErr } = await supabase.from('hour_types').select('id, key');
  if (htErr) throw new Error(`hour_types: ${htErr.message}`);
  const HT = Object.fromEntries(htRows.map((r) => [r.key, r.id]));

  // EUR→CLP for the earnings screens (/mis-horas, /admin/consultant-earnings). getLatestFxRate() treats a row
  // fetched less than an hour ago as fresh and otherwise calls an outside API; a row dated 2030 stays "fresh"
  // forever, so the server never leaves the machine and the figure never moves between pictures.
  await insertMissing(supabase, 'fx_rates', [{
    id: id(0x901), from_currency: 'EUR', to_currency: 'CLP', rate: 1025.5,
    fetched_at: '2030-01-01T12:00:00Z', source: 'seed-sintetico', created_at: '2030-01-01T12:00:00Z',
  }]);

  const CAT = { transporte: id(0xa01), alimentacion: id(0xa02), alojamiento: id(0xa03), materiales: id(0xa04), peajes: id(0xa05) };
  await insertMissing(supabase, 'expense_categories', [
    { id: CAT.transporte, name: 'Transporte', description: 'Pasajes, taxis y traslados a los colegios', color: '#3B82F6' },
    { id: CAT.alimentacion, name: 'Alimentación', description: 'Colaciones durante jornadas en terreno', color: '#F59E0B' },
    { id: CAT.alojamiento, name: 'Alojamiento', description: 'Hospedaje en visitas fuera de Santiago', color: '#8B5CF6' },
    { id: CAT.materiales, name: 'Materiales', description: 'Impresiones y material para talleres', color: '#10B981' },
    { id: CAT.peajes, name: 'Peajes y estacionamiento', description: 'Peajes, TAG y estacionamientos', color: '#EF4444' },
  ].map((c) => ({ ...c, is_active: true, created_at: '2026-03-01T09:00:00-03:00', updated_at: '2026-03-01T09:00:00-03:00' })));

  // ================================================================================================================
  // /reporte-horas (school + admin) and the ledger behind every hour screen: a small client, program and contract
  // of the primary school with four hour buckets.
  // ================================================================================================================
  await insertMissing(supabase, 'clientes', [{
    id: CLIENTE,
    nombre_legal: 'Fundación Educacional Sintética E2E',
    nombre_fantasia: 'Cliente Sintetico E2E — Colegio Sintetico E2E',
    rut: '99.930.001-6',
    direccion: 'Avenida Sintética 1234',
    comuna: 'Providencia', ciudad: 'Santiago',
    nombre_representante: 'Representante Sintética E2E',
    rut_representante: '99.930.002-4',
    fecha_escritura: '2020-03-15',
    nombre_notario: 'Notaría Sintética E2E',
    comuna_notaria: 'Santiago',
    nombre_encargado_proyecto: 'Encargada Proyecto Sintética',
    email_encargado_proyecto: 'e2e-encargada-proyecto@example.com',
    school_id: SCHOOL,
    created_at: '2026-02-20T10:00:00-03:00',
  }]);
  await insertMissing(supabase, 'programas', [{
    id: PROGRAMA, codigo_servicio: 'SINT30', nombre: 'Programa Sintetico E2E de Acompañamiento Pedagógico',
    descripcion: 'Programa de asesoría técnica y gestión del cambio, inventado para el entorno local.',
    horas_totales: 50, modalidad: 'mixta', activo: true, created_at: '2026-02-20T10:00:00-03:00',
  }]);
  await insertMissing(supabase, 'contratos', [{
    id: CONTRATO, numero_contrato: 'SINT-E2E-30-2026', fecha_contrato: '2026-03-02', fecha_fin: '2026-12-31',
    cliente_id: CLIENTE, programa_id: PROGRAMA, precio_total_uf: 480, numero_cuotas: 4, estado: 'activo',
    firmado: true, incluir_en_flujo: true, tipo_moneda: 'UF', is_anexo: false, numero_participantes: 32,
    horas_contratadas: 50, created_at: '2026-03-02T10:00:00-03:00',
  }]);
  const ALLOC = {
    asesoria_tecnica_online: id(0x20),
    asesoria_tecnica_presencial: id(0x21),
    gestion_cambio_presencial: id(0x22),
    talleres_presenciales: id(0x23), // only 2 h: the cancelled 3 h workshop (penalizada) runs it over budget
  };
  const allocHours = { asesoria_tecnica_online: 20, asesoria_tecnica_presencial: 16, gestion_cambio_presencial: 12, talleres_presenciales: 2 };
  await insertMissing(supabase, 'contract_hour_allocations', Object.entries(ALLOC).map(([key, aid]) => ({
    id: aid, contrato_id: CONTRATO, hour_type_id: HT[key], allocated_hours: allocHours[key],
    is_fixed_allocation: key === 'talleres_presenciales', created_by: ADMIN,
    created_at: '2026-03-02T10:30:00-03:00', updated_at: '2026-03-02T10:30:00-03:00',
  })));

  // ================================================================================================================
  // Sessions — /consultor/sessions, /consultor/sessions/[id], /admin/sessions, /admin/sessions/[id],
  // /consultor/sessions/reports. Every status of consultor_sessions_status_check, three modalities, two series.
  // ================================================================================================================
  const meet = (slug) => `https://meet.example.net/sint-e2e-30-${slug}`;
  const sessions = [
    // ---- past, October–November 2026 ----
    {
      key: 'P1', status: 'completada', date: '2026-10-06', start: '10:00:00', end: '12:00:00', modality: 'presencial',
      hour: 'asesoria_tecnica_presencial', gc: GC_MAIN, location: 'Colegio Sintetico E2E — Sala de profesores',
      title: 'Acompañamiento en aula: retroalimentación formativa',
      description: 'Visita al colegio para observar clases de 5° básico y conversar con el equipo sobre cómo usar la retroalimentación formativa en el día a día.',
      objectives: '1. Observar dos clases con la pauta acordada.\n2. Devolver lo observado al equipo de ciclo.\n3. Acordar un compromiso de práctica para noviembre.',
      created: '2026-09-25T11:00:00-03:00', approved: '2026-09-26T09:30:00-03:00', finalized: '2026-10-07T18:10:00-03:00',
      coFacilitator: true,
    },
    {
      key: 'P2', status: 'completada', date: '2026-10-15', start: '15:00:00', end: '16:30:00', modality: 'online',
      hour: 'asesoria_tecnica_online', gc: GC_MAIN, provider: 'google_meet', link: meet('p2'),
      title: 'Planificación por evidencias del segundo semestre',
      description: 'Sesión en línea con el equipo técnico para revisar las evidencias de aprendizaje del primer semestre y ajustar la planificación.',
      objectives: 'Priorizar tres objetivos de aprendizaje por nivel y definir cómo se van a evaluar.',
      created: '2026-10-01T10:00:00-03:00', approved: '2026-10-01T16:00:00-03:00', finalized: '2026-10-16T12:00:00-03:00',
    },
    {
      key: 'P3', status: 'pendiente_informe', date: '2026-11-10', start: '09:00:00', end: '11:00:00', modality: 'hibrida',
      hour: 'gestion_cambio_presencial', gc: GC_MAIN, provider: 'teams', link: meet('p3'),
      location: 'Colegio Sintetico E2E — Biblioteca',
      title: 'Taller de gestión del cambio con el equipo directivo',
      description: 'Jornada híbrida: el equipo directivo en el colegio y las coordinaciones de ciclo conectadas en línea.',
      objectives: 'Revisar el plan de mejora y acordar responsables para las acciones de diciembre.',
      created: '2026-10-20T10:00:00-03:00', approved: '2026-10-21T09:00:00-03:00',
    },
    {
      key: 'P4', status: 'en_progreso', date: '2026-11-13', start: '10:30:00', end: '12:30:00', modality: 'online',
      hour: 'asesoria_tecnica_online', gc: GC_MAIN, provider: 'google_meet', link: meet('p4'),
      title: 'Comunidad de aprendizaje: análisis de trabajos de estudiantes',
      description: 'Sesión en línea de la comunidad de crecimiento para analizar en conjunto trabajos de estudiantes (sin datos personales).',
      objectives: 'Acordar criterios comunes para la rúbrica de escritura.',
      created: '2026-11-02T10:00:00-03:00', approved: '2026-11-02T15:00:00-03:00', attendanceOpen: true,
    },
    {
      key: 'P5', status: 'cancelada', date: '2026-10-22', start: '09:00:00', end: '12:00:00', modality: 'presencial',
      hour: 'talleres_presenciales', gc: GC_MAIN, location: 'Colegio Sintetico E2E — Gimnasio',
      title: 'Taller presencial de convivencia escolar',
      description: 'Taller para docentes y asistentes de la educación sobre estrategias de convivencia en el aula.',
      objectives: 'Practicar dos protocolos de resolución de conflictos.',
      created: '2026-10-01T11:00:00-03:00', approved: '2026-10-02T09:00:00-03:00',
      cancel: { at: '2026-10-20T09:00:00-03:00', by: 'admin', clause: 'clause_4', ledger: 'penalizada',
        reason: 'El colegio suspendió la jornada por un paro comunal; aviso con menos de dos semanas.' },
    },
    {
      key: 'P6', status: 'cancelada', date: '2026-11-05', start: '15:00:00', end: '16:30:00', modality: 'online',
      hour: 'asesoria_tecnica_online', gc: GC_MAIN, provider: 'google_meet', link: meet('p6'),
      title: 'Revisión de instrumentos de evaluación',
      description: 'Revisión en línea de las pruebas de unidad de Lenguaje y Matemática.',
      objectives: 'Ajustar los instrumentos a los objetivos priorizados.',
      created: '2026-10-20T11:00:00-03:00', approved: '2026-10-20T15:00:00-03:00',
      cancel: { at: '2026-10-29T10:00:00-03:00', by: 'admin', clause: 'clause_1', ledger: 'devuelta',
        reason: 'El colegio pidió reprogramar por el cierre del semestre; aviso con más de 48 horas.' },
    },
    // ---- series A: weekly, online, October 2026 ----
    ...[
      ['A1', '2026-10-07', 'completada', '2026-10-07T19:00:00-03:00'],
      ['A2', '2026-10-14', 'completada', '2026-10-14T18:30:00-03:00'],
      ['A3', '2026-10-21', 'cancelada', null],
      ['A4', '2026-10-28', 'completada', '2026-10-29T09:00:00-03:00'],
    ].map(([key, date, status, finalized], i) => ({
      key, status, date, start: '16:00:00', end: '17:00:00', modality: 'online', hour: 'asesoria_tecnica_online', gc: GC_MAIN,
      provider: 'google_meet', link: meet('serie-a'),
      title: 'Ciclo de retroalimentación docente', series: SERIES_A, number: i + 1,
      rule: i === 0 ? 'FREQ=WEEKLY;INTERVAL=1;COUNT=4' : null,
      description: 'Ciclo semanal de cuatro sesiones en línea para que cada docente reciba retroalimentación sobre su planificación.',
      objectives: 'Cada docente presenta una planificación y recibe comentarios de pares y del consultor.',
      created: '2026-09-28T10:00:00-03:00', approved: '2026-09-29T09:00:00-03:00', finalized,
      cancel: status === 'cancelada'
        ? { at: '2026-10-15T12:00:00-03:00', by: 'admin', clause: 'clause_6', ledger: 'devuelta',
          reason: 'Cancelada por la Fundación: el consultor participa en una jornada de formación interna.' }
        : null,
    })),
    // ---- upcoming, 2030 ----
    {
      key: 'F1', status: 'programada', date: '2030-07-03', start: '09:00:00', end: '11:00:00', modality: 'presencial',
      hour: 'asesoria_tecnica_presencial', gc: GC_ROLE, location: 'Colegio Sintetico E2E — Sala multiuso', offset: '-04:00',
      title: 'Observación de clases de primer ciclo',
      description: 'Visita para observar clases de 1° a 4° básico con la pauta de observación acordada.',
      objectives: 'Levantar evidencia para la jornada de reflexión de julio.',
      created: '2026-11-04T10:00:00-03:00', approved: '2026-11-04T16:00:00-03:00',
    },
    ...[['B1', '2030-08-07'], ['B2', '2030-09-04'], ['B3', '2030-10-02']].map(([key, date], i) => ({
      key, status: 'programada', date, start: '09:30:00', end: '11:30:00', modality: 'presencial',
      hour: 'gestion_cambio_presencial', gc: GC_MAIN, location: 'Colegio Sintetico E2E — Biblioteca',
      offset: date === '2030-10-02' ? '-03:00' : '-04:00',
      title: 'Mesa de gestión del cambio', series: SERIES_B, number: i + 1, rule: i === 0 ? 'FREQ=MONTHLY;COUNT=3' : null,
      description: 'Reunión mensual con el equipo directivo para dar seguimiento al plan de mejora.',
      objectives: 'Revisar avances, nudos y próximos pasos del plan de mejora.',
      created: '2026-11-06T10:00:00-03:00', approved: '2026-11-06T15:00:00-03:00', coFacilitator: true,
    })),
    {
      key: 'D1', status: 'borrador', date: '2030-08-20', start: '15:00:00', end: '16:00:00', modality: 'online',
      hour: 'asesoria_tecnica_online', gc: GC_MAIN, provider: 'google_meet', link: meet('d1'), offset: '-04:00',
      title: 'Borrador: sesión de cierre de semestre',
      description: 'Propuesta de sesión de cierre, aún sin revisar.',
      objectives: 'Balance del semestre con el equipo técnico.',
      created: '2026-11-12T10:00:00-03:00',
    },
    {
      key: 'D2', status: 'pendiente_aprobacion', date: '2030-08-27', start: '10:00:00', end: '12:00:00', modality: 'presencial',
      hour: 'asesoria_tecnica_presencial', gc: GC_MAIN, location: 'Colegio Sintetico E2E — Sala de profesores', offset: '-04:00',
      title: 'Jornada de planificación anual',
      description: 'Jornada presencial para planificar el año siguiente con todas las coordinaciones.',
      objectives: 'Definir el calendario de acompañamiento del próximo año.',
      created: '2026-11-12T11:00:00-03:00',
    },
    // ---- legacy, no hour type: what /admin/bulk-tag-sessions lists ----
    {
      key: 'L1', status: 'completada', date: '2026-09-30', start: '15:00:00', end: '16:00:00', modality: 'online',
      gc: GC_MAIN, provider: 'otro', link: meet('l1'),
      title: 'Reunión de inicio del segundo semestre',
      description: 'Reunión en línea de inicio de semestre, registrada antes de clasificar horas.',
      objectives: 'Presentar el calendario de acompañamiento.',
      created: '2026-09-20T10:00:00-03:00', approved: '2026-09-21T09:00:00-03:00', finalized: '2026-09-30T18:00:00-03:00',
    },
    {
      key: 'L2', status: 'completada', date: '2026-10-01', start: '11:00:00', end: '12:30:00', modality: 'presencial',
      gc: GC_ROLE, location: 'Colegio Sintetico E2E — Sala de reuniones',
      title: 'Encuentro con la comunidad de crecimiento',
      description: 'Encuentro presencial con la comunidad para presentar el plan del semestre.',
      objectives: 'Recoger expectativas de la comunidad.',
      created: '2026-09-20T11:00:00-03:00', approved: '2026-09-21T09:30:00-03:00', finalized: '2026-10-02T10:00:00-03:00',
    },
  ];

  const approvedStatuses = new Set(['programada', 'en_progreso', 'pendiente_informe', 'completada', 'cancelada']);
  await insertMissing(supabase, 'consultor_sessions', sessions.map((s) => {
    const off = s.offset || '-03:00';
    const noticeHours = s.cancel
      ? Math.round(((Date.parse(at(s.date, s.start, off)) - Date.parse(s.cancel.at)) / 36e5) * 100) / 100
      : null;
    const lastTouch = s.cancel?.at || s.finalized || s.approved || s.created;
    return {
      id: S[s.key], school_id: SCHOOL, growth_community_id: s.gc, program_enrollment_id: null,
      title: s.title, description: s.description, objectives: s.objectives,
      session_date: s.date, start_time: s.start, end_time: s.end,
      actual_duration_minutes: s.status === 'completada' ? minutes(s.start, s.end) : null,
      modality: s.modality, meeting_link: s.link || null, meeting_provider: s.provider || null,
      location: s.location || null, status: s.status,
      recurrence_rule: s.rule || null, recurrence_group_id: s.series || null, session_number: s.number || null,
      meeting_summary: null, meeting_transcript: null,
      created_by: ADMIN,
      approved_by: approvedStatuses.has(s.status) ? ADMIN : null,
      approved_at: approvedStatuses.has(s.status) ? s.approved : null,
      finalized_by: s.status === 'completada' ? CONS : null,
      finalized_at: s.status === 'completada' ? s.finalized : null,
      cancelled_by: s.cancel ? ADMIN : null,
      cancelled_at: s.cancel ? s.cancel.at : null,
      cancellation_reason: s.cancel ? s.cancel.reason : null,
      cancelled_notice_hours: noticeHours,
      created_at: s.created, updated_at: lastTouch, is_active: true,
      hour_type_key: s.hour || null, contrato_id: s.hour ? CONTRATO : null, is_zoom_managed: false,
    };
  }));

  // ---- facilitators: consultorAssigned leads every session; consultorGlobal co-facilitates two of them ----
  const facilitators = [];
  sessions.forEach((s, i) => {
    facilitators.push({ id: id(0x200 + i), session_id: S[s.key], user_id: CONS, facilitator_role: 'consultor_externo', is_lead: true, created_at: s.created });
    if (s.coFacilitator) {
      facilitators.push({ id: id(0x240 + i), session_id: S[s.key], user_id: U.consultorGlobal, facilitator_role: 'equipo_interno', is_lead: false, created_at: s.created });
    }
  });
  await insertMissing(supabase, 'session_facilitators', facilitators);

  // ---- attendees and attendance (Detalles tab: present / absent / unmarked; arrival status; notes) ----
  const people = [U.docente, U.gcLeader, U.directivo, U.generationLeader];
  const pastMarks = {
    P1: [[true, 'on_time', null], [true, 'late', 'Llegó tras cubrir un recreo.'], [true, 'left_early', 'Se retiró a una reunión de apoderados.'], [false, null, 'Con licencia médica.']],
    P2: [[true, 'on_time', null], [true, 'on_time', null], [false, null, 'Avisó que no podía conectarse.'], [true, 'late', null]],
    P3: [[true, 'on_time', null], [true, 'on_time', null], [true, 'on_time', null], [false, null, null]],
    A1: [[true, 'on_time', null], [true, 'on_time', null], null, null],
    A2: [[true, 'late', null], [true, 'on_time', null], null, null],
    A4: [[true, 'on_time', null], [false, null, 'Jornada de evaluación.'], null, null],
    L1: [[true, 'on_time', null], [true, 'on_time', null], [true, 'on_time', null], null],
    L2: [[true, 'on_time', null], [true, 'on_time', null], null, null],
  };
  const attendees = [];
  sessions.forEach((s, i) => {
    const marks = pastMarks[s.key];
    people.forEach((uid, j) => {
      let attended = null; let arrival = null; let notes = null; let markedAt = null;
      if (marks) {
        if (!marks[j]) return;
        [attended, arrival, notes] = marks[j];
        markedAt = s.finalized || at(s.date, s.end, s.offset);
      } else if (s.status === 'cancelada' && j > 1) {
        return;
      }
      attendees.push({
        id: id(0x300 + i * 8 + j), session_id: S[s.key], user_id: uid, expected: !(s.key === 'P2' && j === 3),
        attended, arrival_status: arrival, notes,
        marked_by: markedAt ? CONS : null, marked_at: markedAt, created_at: s.created,
      });
    });
  });
  await insertMissing(supabase, 'session_attendees', attendees);

  // ---- hours ledger: one row per approved, tracked session (reservada → consumida / penalizada / devuelta) ----
  // The database lets exposed roles INSERT only the columns createReservation() writes (no id, no recorded_at, no
  // effective_minutes — migration 20260813120800) and UPDATE only the status/cancellation/updated_* columns. So,
  // like the app: insert the reservation (approve), then move it on (finalize / cancel). A ledger row is found again
  // by its session (one per session), which keeps a second run a no-op. recorded_at gets the database's clock;
  // no screen shows it.
  const { data: existingLedger, error: exErr } = await supabase
    .from('contract_hours_ledger').select('id, session_id, status').in('session_id', Object.values(S));
  if (exErr) throw new Error(`contract_hours_ledger: ${exErr.message}`);
  const ledgerBySession = new Map(existingLedger.map((r) => [r.session_id, r]));
  for (const s of sessions) {
    if (!s.hour || !approvedStatuses.has(s.status)) continue;
    let row = ledgerBySession.get(S[s.key]);
    if (!row) {
      const { data, error } = await supabase.from('contract_hours_ledger').insert({
        allocation_id: ALLOC[s.hour], session_id: S[s.key], hours: hoursOf(s.start, s.end), status: 'reservada',
        session_date: s.date, recorded_by: ADMIN, is_over_budget: s.hour === 'talleres_presenciales', is_manual: false,
        planned_minutes_snapshot: minutes(s.start, s.end),
      }).select('id, session_id, status').single();
      if (error) throw new Error(`contract_hours_ledger insert (${s.key}): ${error.message}`);
      row = data;
      ledgerBySession.set(S[s.key], row);
    }
    let change = null;
    if (s.status === 'completada') change = { status: 'consumida', updated_at: s.finalized, updated_by: CONS };
    else if (s.status === 'cancelada') change = {
      status: s.cancel.ledger, cancellation_clause: s.cancel.clause, cancellation_reason: s.cancel.reason,
      admin_override: false, admin_override_reason: null, updated_at: s.cancel.at, updated_by: ADMIN,
    };
    if (change && row.status === 'reservada') {
      const { error } = await supabase.from('contract_hours_ledger').update(change).eq('id', row.id);
      if (error) throw new Error(`contract_hours_ledger update (${s.key}): ${error.message}`);
      row.status = change.status;
    }
  }

  // ---- admin hour adjustment on A2 (Comparación de horas panel of /admin/sessions/A2): 60 planned → 45 billed ----
  // Only apply_session_hour_override() may write it, and it acts as auth.uid(): it is called here as the fixture admin
  // signed in on the local stack, exactly as POST /api/admin/sessions/[id]/hour-override calls it. Its fixed
  // request_id makes a repeat a replay; it is skipped altogether once the adjustment exists. The function stamps the
  // override with the database's clock (created_at cannot be fixed).
  const { data: haveOverride, error: ovErr } = await supabase
    .from('session_hour_overrides').select('id').eq('request_id', OVERRIDE_REQUEST_ID).maybeSingle();
  if (ovErr) throw new Error(`session_hour_overrides: ${ovErr.message}`);
  if (!haveOverride) {
    const { createClient } = await import('@supabase/supabase-js');
    const env = stack();
    const adminClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signErr } = await adminClient.auth.signInWithPassword({
      email: fixtures.users.admin.email, password: fixtures.users.admin.password,
    });
    if (signErr) throw new Error(`admin sign-in on the local stack: ${signErr.message}`);
    const intent = { session_id: S.A2, new_minutes: 45, reason: OVERRIDE_REASON, reason_category: 'technical_failure', reverses_override_id: null };
    const { error } = await adminClient.rpc('apply_session_hour_override', {
      p_session_id: S.A2, p_new_minutes: 45, p_reason: OVERRIDE_REASON, p_reason_category: 'technical_failure',
      p_request_id: OVERRIDE_REQUEST_ID,
      p_payload_hash: createHash('sha256').update(JSON.stringify(intent)).digest('hex'),
      p_reverses_override_id: null,
    });
    await adminClient.auth.signOut();
    if (error) throw new Error(`apply_session_hour_override: ${error.message}`);
  }

  // ---- session reports (Informe tab; /consultor/sessions/reports) ----
  const report = (n, key, content, visibility, created, type = 'session_report') => ({
    id: id(0x500 + n), session_id: S[key], author_id: CONS, content, audio_url: null, transcript: null,
    visibility, report_type: type, created_at: created, updated_at: created,
  });
  await insertMissing(supabase, 'session_reports', [
    report(1, 'P1', 'Se observaron dos clases de 5° básico (Lenguaje y Ciencias). En ambas, la docente explicitó el objetivo al inicio y usó preguntas abiertas para recoger lo que sabían los estudiantes.\n\nFortalezas: buen clima de aula, tiempos bien administrados, uso de tickets de salida.\nPor mejorar: la retroalimentación fue mayoritariamente general ("muy bien"); se acordó practicar retroalimentación descriptiva.\n\nCompromiso: cada docente del ciclo aplicará una retroalimentación descriptiva por clase durante noviembre y traerá un ejemplo a la próxima sesión.', 'all_participants', '2026-10-07T17:45:00-03:00'),
    report(2, 'P2', 'El equipo técnico revisó las evidencias del primer semestre. Se priorizaron tres objetivos por nivel en Lenguaje y Matemática.\n\nNota interna: la coordinación de segundo ciclo necesita más apoyo para construir instrumentos; conviene reforzar en la próxima visita presencial.', 'facilitators_only', '2026-10-16T11:30:00-03:00'),
    report(3, 'A1', 'Primera sesión del ciclo. Cuatro docentes presentaron su planificación; se acordó una pauta breve de comentarios entre pares.', 'all_participants', '2026-10-07T18:40:00-03:00'),
    report(4, 'A2', 'Segunda sesión. Se perdió parte de la conexión por un corte de internet en el colegio. Se alcanzó a revisar dos planificaciones.', 'all_participants', '2026-10-14T18:10:00-03:00'),
    report(5, 'A4', 'Cierre del ciclo. Cada docente comprometió un ajuste concreto a su planificación de noviembre.', 'all_participants', '2026-10-29T08:40:00-03:00'),
    report(6, 'L1', 'Se presentó el calendario de acompañamiento del segundo semestre y se resolvieron dudas del equipo.', 'all_participants', '2026-09-30T17:30:00-03:00'),
    report(7, 'L2', 'La comunidad compartió sus expectativas: más tiempo para observar clases entre pares y espacios para compartir materiales.', 'all_participants', '2026-10-02T09:30:00-03:00'),
    report(8, 'F1', 'Notas de planificación: llevar la pauta de observación impresa y coordinar con UTP los horarios de cada curso.', 'facilitators_only', '2026-11-05T10:00:00-03:00', 'planning_notes'),
  ]);

  // ---- materials (Materiales tab). No file is uploaded: the local stack has no session-materials bucket, and the
  //      detail screen lists the rows without a download link. ----
  const material = (n, key, file_name, file_type, file_size, visibility, created, description) => ({
    id: id(0x550 + n), session_id: S[key], uploaded_by: CONS, file_name,
    file_url: `storage://session-materials/sessions/${S[key]}/seed30_${file_name}`,
    storage_path: `sessions/${S[key]}/seed30_${file_name}`, file_type, file_size, description, visibility, created_at: created,
  });
  await insertMissing(supabase, 'session_materials', [
    material(1, 'P1', 'Pauta_observacion_aula.pdf', 'application/pdf', 182400, 'all_participants', '2026-10-05T16:00:00-03:00', 'Pauta acordada con el equipo'),
    material(2, 'P1', 'Presentacion_retroalimentacion_formativa.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 2457600, 'all_participants', '2026-10-06T09:15:00-03:00', 'Presentación usada en la devolución'),
    material(3, 'P1', 'Notas_internas_consultor.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 48200, 'facilitators_only', '2026-10-07T17:50:00-03:00', null),
    material(4, 'P3', 'Plan_de_mejora_avance.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 96500, 'all_participants', '2026-11-08T12:00:00-03:00', null),
    material(5, 'A2', 'Pauta_comentarios_pares.pdf', 'application/pdf', 75300, 'all_participants', '2026-10-13T10:00:00-03:00', null),
  ]);

  // ---- activity log (Actividad tab) ----
  const log = [];
  sessions.forEach((s, i) => {
    let n = 0;
    const push = (user_id, action, details, created_at) => log.push({ id: id(0x600 + i * 8 + n++), session_id: S[s.key], user_id, action, details, created_at });
    push(ADMIN, 'created', { title: s.title, school_id: SCHOOL, growth_community_id: s.gc, recurrence_group_id: s.series || null, session_number: s.number || null }, s.created);
    if (approvedStatuses.has(s.status)) push(ADMIN, 'status_changed', { old: 'borrador', new: 'programada' }, s.approved);
    if (['P1', 'P2', 'P3', 'A1', 'A2', 'A4', 'L1', 'L2'].includes(s.key)) {
      push(CONS, 'attendance_recorded', { attendees_updated: attendees.filter((a) => a.session_id === S[s.key]).length }, s.finalized || at(s.date, s.end, s.offset));
    }
    if (s.status === 'completada') {
      push(CONS, 'report_filed', { report_type: 'session_report', visibility: s.key === 'P2' ? 'facilitators_only' : 'all_participants' }, s.finalized);
      push(CONS, 'finalized', { previous_status: 'pendiente_informe', admin_override: false }, s.finalized);
    }
    if (s.key === 'P1') push(CONS, 'materials_uploaded', { file_name: 'Pauta_observacion_aula.pdf', file_size: 182400, visibility: 'all_participants' }, '2026-10-05T16:00:00-03:00');
    if (s.cancel) push(ADMIN, 'cancelled', { reason: s.cancel.reason, previous_status: 'programada' }, s.cancel.at);
  });
  await insertMissing(supabase, 'session_activity_log', log);

  // ================================================================================================================
  // /admin/sessions/approvals — edit requests: two pending, one approved, one rejected
  // ================================================================================================================
  const editReq = (n, key, changes, reason, status, created, review) => ({
    id: id(0x700 + n), session_id: S[key], requested_by: CONS, changes, reason, status,
    reviewed_by: review ? ADMIN : null, reviewed_at: review ? review.at : null, review_notes: review ? review.notes : null,
    created_at: created,
  });
  const editRequests = [
    editReq(1, 'F1', { session_date: { old: '2030-07-03', new: '2030-07-08' }, start_time: { old: '09:00:00', new: '10:00:00' } },
      'El colegio pidió mover la visita porque ese día tiene jornada de evaluación institucional.', 'pending', '2026-11-11T10:15:00-03:00'),
    editReq(2, 'B2', { modality: { old: 'presencial', new: 'hibrida' } },
      'Dos integrantes del equipo directivo estarán en una capacitación y se conectarían en línea.', 'pending', '2026-11-12T09:40:00-03:00'),
    editReq(3, 'P1', { start_time: { old: '09:00:00', new: '10:00:00' }, end_time: { old: '11:00:00', new: '12:00:00' } },
      'El primer bloque coincide con el acto del aniversario del colegio.', 'approved', '2026-09-29T12:00:00-03:00',
      { at: '2026-09-30T09:00:00-03:00', notes: 'Aprobado; se avisó al equipo directivo.' }),
    editReq(4, 'P3', { session_date: { old: '2026-11-10', new: '2026-11-12' } },
      'Preferiría hacerla el jueves para que asista todo el equipo.', 'rejected', '2026-11-03T15:00:00-03:00',
      { at: '2026-11-04T09:30:00-03:00', notes: 'El jueves 12 la biblioteca está ocupada; se mantiene la fecha.' }),
  ];
  await insertMissing(supabase, 'session_edit_requests', editRequests);
  await insertMissing(supabase, 'session_activity_log', editRequests.map((r, i) => ({
    id: id(0x6f0 + i), session_id: r.session_id, user_id: CONS, action: 'edit_requested',
    details: { edit_request_id: r.id, changes: Object.keys(r.changes) }, created_at: r.created_at,
  })).concat(editRequests.filter((r) => r.status !== 'pending').map((r, i) => ({
    id: id(0x6f8 + i), session_id: r.session_id, user_id: ADMIN, action: r.status === 'approved' ? 'edit_approved' : 'edit_rejected',
    details: { edit_request_id: r.id, review_notes: r.review_notes }, created_at: r.reviewed_at,
  }))));

  // ================================================================================================================
  // /admin/consultant-assignments — one row per scope (individual, school, community, generation) + one inactive
  // ================================================================================================================
  const assignment = (n, o) => ({
    id: id(0x800 + n), student_id: null, school_id: null, generation_id: null, community_id: null,
    assigned_by: ADMIN, assigned_at: o.starts_at, can_view_progress: true, can_assign_courses: false,
    can_message_student: true, notification_sent: true, ends_at: null, is_active: true,
    created_at: o.starts_at, updated_at: o.starts_at, ...o,
  });
  await insertMissing(supabase, 'consultant_assignments', [
    assignment(1, { consultant_id: CONS, student_id: U.docente, assignment_type: 'mentoring', starts_at: '2026-03-02T09:00:00-03:00',
      can_assign_courses: true, assignment_data: { assignment_scope: 'individual', notes: 'Mentoría en planificación' } }),
    assignment(2, { consultant_id: CONS, school_id: SCHOOL, assignment_type: 'comprehensive', starts_at: '2026-03-02T09:00:00-03:00',
      ends_at: '2030-12-31T23:59:00-03:00', assignment_data: { assignment_scope: 'school' } }),
    assignment(3, { consultant_id: CONS, school_id: SCHOOL, community_id: GC_MAIN, assignment_type: 'monitoring', starts_at: '2026-04-01T09:00:00-03:00',
      can_message_student: false, assignment_data: { assignment_scope: 'community' } }),
    assignment(4, { consultant_id: U.consultorGlobal, school_id: SCHOOL, generation_id: GENERATION, assignment_type: 'support', starts_at: '2026-05-04T09:00:00-04:00',
      assignment_data: { assignment_scope: 'generation' } }),
    assignment(5, { consultant_id: U.consultorOtherSchool, student_id: U.docente, assignment_type: 'evaluation', starts_at: '2026-03-02T09:00:00-03:00',
      ends_at: '2026-07-31T18:00:00-04:00', is_active: false, can_view_progress: true, can_message_student: false,
      assignment_data: { assignment_scope: 'individual', notes: 'Evaluación del primer semestre (cerrada)' } }),
  ]);

  // ================================================================================================================
  // /admin/consultant-rates — current, expired, and one hour type left without a rate (earnings shows "sin tarifa")
  // ================================================================================================================
  const rate = (n, consultant_id, key, rate_eur, effective_from, effective_to = null) => ({
    id: id(0x850 + n), consultant_id, hour_type_id: HT[key], rate_eur, effective_from, effective_to,
    created_by: ADMIN, created_at: `${effective_from}T10:00:00-03:00`, updated_at: `${effective_from}T10:00:00-03:00`,
  });
  await insertMissing(supabase, 'consultant_rates', [
    rate(1, CONS, 'asesoria_tecnica_online', 45, '2026-01-01', '2026-09-01'),
    rate(2, CONS, 'asesoria_tecnica_online', 50, '2026-09-01'),
    // Each rate starts on a day of its own: the list is ordered by that day only, and rows that share one come
    // back in whatever order the database likes, different from one picture run to the next.
    rate(3, CONS, 'asesoria_tecnica_presencial', 65, '2026-03-01'),
    rate(4, CONS, 'gestion_cambio_presencial', 70, '2026-04-01'),
    rate(5, U.consultorGlobal, 'asesoria_directiva_online', 55, '2026-05-01'),
    rate(6, U.consultorGlobal, 'gestion_cambio_presencial', 68, '2026-06-01', '2026-12-31'),
  ]);

  // ================================================================================================================
  // /expense-reports — draft, submitted, approved, rejected (consultorAssigned may submit), plus one of another
  // consultant that only the admin sees
  // ================================================================================================================
  await insertMissing(supabase, 'expense_report_access', [{
    user_id: CONS, can_submit: true, granted_by: ADMIN, notes: 'Consultor en terreno (sintético)',
    created_at: '2026-03-02T09:00:00-03:00', updated_at: '2026-03-02T09:00:00-03:00',
  }], 'user_id');

  const item = (n, report_id, category_id, description, amount, expense_date, vendor, expense_number, extra = {}) => ({
    id: id(0xc00 + n), report_id, category_id, description, amount, expense_date, vendor, expense_number,
    currency: 'CLP', original_amount: amount, conversion_rate: 1, conversion_date: expense_date,
    receipt_url: null, receipt_filename: null, notes: null,
    created_at: `${expense_date}T20:00:00-03:00`, updated_at: `${expense_date}T20:00:00-03:00`, ...extra,
  });
  const E = { draft: id(0xb01), submitted: id(0xb02), approved: id(0xb03), rejected: id(0xb04), other: id(0xb05) };
  const items = [
    item(1, E.draft, CAT.transporte, 'Taxi al Colegio Sintetico E2E', 8400, '2026-11-10', 'Taxi Sintético', 'B-1001'),
    item(2, E.draft, CAT.alimentacion, 'Colación jornada de taller', 6900, '2026-11-10', 'Cafetería Sintética', 'B-1002'),
    item(3, E.submitted, CAT.transporte, 'Pasaje bus ida y vuelta', 12600, '2026-10-06', 'Buses Sintéticos', 'B-0931'),
    item(4, E.submitted, CAT.materiales, 'Impresión de pautas de observación', 15800, '2026-10-05', 'Imprenta Sintética', 'F-2210'),
    item(5, E.submitted, CAT.peajes, 'Estacionamiento visita al colegio', 3500, '2026-10-06', 'Estacionamientos Sintéticos', 'B-0932'),
    item(6, E.approved, CAT.alojamiento, 'Hotel una noche — visita regional', 54000, '2026-09-17', 'Hotel Sintético', 'F-1180'),
    item(7, E.approved, CAT.transporte, 'Vuelo nacional ida y vuelta', 98500, '2026-09-16', 'Aerolínea Sintética', 'F-1179'),
    item(8, E.approved, CAT.alimentacion, 'Cena en visita regional', 14200, '2026-09-17', 'Restaurante Sintético', 'B-0870'),
    item(9, E.rejected, CAT.materiales, 'Licencia de software de presentaciones', 30763, '2026-10-21', 'Proveedor Sintético', 'F-2301',
      { currency: 'EUR', original_amount: 30, conversion_rate: 1025.43, notes: 'Pagado con tarjeta en euros.' }),
    item(10, E.rejected, CAT.materiales, 'Materiales para taller suspendido', 22400, '2026-10-20', 'Librería Sintética', 'B-0990'),
    item(11, E.other, CAT.transporte, 'Traslado aeropuerto', 18900, '2026-10-26', 'Transfer Sintético', 'B-3001'),
    item(12, E.other, CAT.peajes, 'Peajes autopista', 4600, '2026-10-26', 'Autopista Sintética', 'B-3002'),
  ];
  const total = (rid) => items.filter((i) => i.report_id === rid).reduce((s, i) => s + i.amount, 0);
  const expenseReport = (rid, o) => ({
    id: rid, total_amount: total(rid), submitted_at: null, reviewed_by: null, reviewed_at: null, review_comments: null, ...o,
  });
  await insertMissing(supabase, 'expense_reports', [
    expenseReport(E.draft, { report_name: 'Rendición noviembre 2026 — visitas al colegio', description: 'Gastos de las visitas de noviembre (en preparación).',
      start_date: '2026-11-01', end_date: '2026-11-30', status: 'draft', submitted_by: CONS,
      created_at: '2026-11-10T20:30:00-03:00', updated_at: '2026-11-10T20:30:00-03:00' }),
    expenseReport(E.submitted, { report_name: 'Rendición octubre 2026', description: 'Visita de acompañamiento en aula del 6 de octubre.',
      start_date: '2026-10-01', end_date: '2026-10-31', status: 'submitted', submitted_by: CONS, submitted_at: '2026-11-02T09:00:00-03:00',
      created_at: '2026-10-07T21:00:00-03:00', updated_at: '2026-11-02T09:00:00-03:00' }),
    expenseReport(E.approved, { report_name: 'Rendición septiembre 2026 — visita regional', description: 'Viaje a la jornada regional de septiembre.',
      start_date: '2026-09-01', end_date: '2026-09-30', status: 'approved', submitted_by: CONS, submitted_at: '2026-10-01T10:00:00-03:00',
      reviewed_by: ADMIN, reviewed_at: '2026-10-05T12:00:00-03:00', review_comments: 'Aprobado. Boletas en orden.',
      created_at: '2026-09-18T19:00:00-03:00', updated_at: '2026-10-05T12:00:00-03:00' }),
    expenseReport(E.rejected, { report_name: 'Taller del 22 de octubre', description: 'Gastos del taller presencial que se suspendió.',
      start_date: '2026-10-20', end_date: '2026-10-22', status: 'rejected', submitted_by: CONS, submitted_at: '2026-10-23T09:00:00-03:00',
      reviewed_by: ADMIN, reviewed_at: '2026-10-26T11:00:00-03:00',
      review_comments: 'La licencia de software no es un gasto rendible por esta vía. Por favor separe ese ítem y vuelva a enviar.',
      created_at: '2026-10-22T18:00:00-03:00', updated_at: '2026-10-26T11:00:00-03:00' }),
    expenseReport(E.other, { report_name: 'Rendición octubre 2026 — Consultor Global', description: 'Traslados de la visita del 26 de octubre.',
      start_date: '2026-10-01', end_date: '2026-10-31', status: 'submitted', submitted_by: U.consultorGlobal, submitted_at: '2026-11-03T08:30:00-03:00',
      created_at: '2026-10-27T19:00:00-03:00', updated_at: '2026-11-03T08:30:00-03:00' }),
  ]);
  await insertMissing(supabase, 'expense_items', items);
}

// Ids for addresses with a changing part (docs/plan/redesign/inventory/data/_index.json).
export const params = {
  // P1: completada, presencial — attendance, report, materials, activity, an approved edit request
  '/consultor/sessions/[id]': { default: { id: id(0x101) } },
  // A2: member of a series (series panel), completada with an admin hour adjustment (hours comparison panel)
  '/admin/sessions/[id]': { default: { id: id(0x112) } },
  // the fixture session with a manual meeting link (gcLeader and docente are its attendees)
  '/meet/session/[id]': { default: { id: FIXTURE_LINKED_SESSION } },
};

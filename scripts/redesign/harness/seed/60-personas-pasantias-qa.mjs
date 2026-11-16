// Module 60 — invented sample content for the picture harness: people (users, schools, networks, signups),
// the January 2027 pasantías (rosters, travellers, logistics panel, "Mi pasantía") and the platform's own QA tool.
//
// Id space: UUIDs 5eed0060-0000-4000-8000-00000000XXXX, integers from 9960000. The extra people are auth accounts
// with e-mails e2e-rd60-…@example.com; their profile ids are random, so they are always looked up by e-mail.
// Safe to run twice: every write is insert-if-missing (ON CONFLICT DO NOTHING, or look-before-insert); nothing that
// already exists is updated, so a second run changes nothing. Fixture rows are only ever read or referenced.
import { createHash } from 'node:crypto';

export const name = 'personas, pasantías y QA';

const id = (n) => `5eed0060-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const SCHOOL = 990001; // Colegio Sintetico E2E (fixture)
const SCHOOL_NORTE = 990002; // Colegio Sintetico E2E Norte (fixture)
const SCHOOL_SUR = 9960001; // ours
const SCHOOL_PONIENTE = 9960002; // ours
const GENERATION_SUR = id(0x0f01);
const NETWORK_SUR = id(0x0f10);

// ---------------------------------------------------------------- helpers

async function insertMissing(supabase, table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
}

/** Chilean RUT check digit (módulo 11). */
function rutDv(body) {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 11 ? '0' : dv === 10 ? 'K' : String(dv);
}
const rut = (body) => `${body}-${rutDv(String(body))}`;

/** A valid 1×1 PNG, generated (no image file in the repo). */
function tinyPng() {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8ffff3f0005fe02fea7d6a4a00000000049454e44ae426082',
    'hex'
  );
}
const tinyPdf = (label) =>
  Buffer.from(`%PDF-1.4\n% ${label} (documento sintetico)\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1');

// ---------------------------------------------------------------- people

// Extra invented accounts. `roles` are written once (look-before-insert on user_id + role_type), never updated.
// None gets a community: a community role row would add the person to the fixture Zoom session's attendees.
const PEOPLE = [
  // /admin/user-management «Pendiente» badge and the approve buttons; /admin/school-users of 990001.
  { key: 'pendiente1', email: 'e2e-rd60-valentina.pendiente@example.com', first: 'Valentina', last: 'Pendiente Sintética', school: SCHOOL, approval: 'pending', createdAt: '2026-11-11T09:12:00-03:00', roles: [] },
  { key: 'pendiente2', email: 'e2e-rd60-tomas.pendiente@example.com', first: 'Tomás', last: 'Pendiente Sintético', school: SCHOOL, approval: 'pending', createdAt: '2026-11-12T16:40:00-03:00', roles: [], external: 'Escuela Sintética Rural Los Aromos' },
  // Approved docente with the fixture generation.
  { key: 'aprobada', email: 'e2e-rd60-javiera.aprobada@example.com', first: 'Javiera', last: 'Aprobada Sintética', school: SCHOOL, generation: 'fixture', approval: 'approved', createdAt: '2026-10-06T10:00:00-03:00', roles: [{ role: 'docente', school: SCHOOL, generation: 'fixture' }] },
  // Several roles at once.
  { key: 'multirol', email: 'e2e-rd60-rodrigo.multirol@example.com', first: 'Rodrigo', last: 'Multirol Sintético', school: SCHOOL, generation: 'fixture', approval: 'approved', createdAt: '2026-10-08T11:30:00-03:00', roles: [{ role: 'docente', school: SCHOOL, generation: 'fixture' }, { role: 'lider_generacion', school: SCHOOL, generation: 'fixture' }, { role: 'encargado_licitacion', school: SCHOOL }] },
  // Inactive: the only role row is switched off.
  { key: 'inactiva', email: 'e2e-rd60-camila.inactiva@example.com', first: 'Camila', last: 'Inactiva Sintética', school: SCHOOL, approval: 'approved', createdAt: '2026-10-02T08:45:00-03:00', roles: [{ role: 'docente', school: SCHOOL, active: false }] },
  // Rejected registration (third approval status).
  { key: 'rechazado', email: 'e2e-rd60-ignacio.rechazado@example.com', first: 'Ignacio', last: 'Rechazado Sintético', school: SCHOOL, approval: 'rejected', createdAt: '2026-10-20T15:05:00-03:00', roles: [] },
  // Must change password at the next sign-in (as an account created from «Usuarios del Colegio» is).
  { key: 'cambioClave', email: 'e2e-rd60-felipe.cambio-clave@example.com', first: 'Felipe', last: 'Cambio Clave Sintético', school: SCHOOL, approval: 'approved', mustChange: true, createdAt: '2026-11-04T12:00:00-03:00', roles: [{ role: 'docente', school: SCHOOL }] },
  // QA testers (can_run_qa_tests): the QA tool's tester list, assignments and runs.
  // No generation on her profile: a profile generation makes the app's profile read fail while the
  // user_roles_cache materialized view is unpopulated (see the report), and she must be able to open /qa.
  { key: 'testerQa', email: 'e2e-rd60-paula.tester@example.com', first: 'Paula', last: 'Tester QA Sintética', school: SCHOOL, approval: 'approved', qa: true, createdAt: '2026-10-01T09:00:00-03:00', roles: [{ role: 'docente', school: SCHOOL, generation: 'fixture' }] },
  // Secondary school.
  { key: 'norte1', email: 'e2e-rd60-martin.norte@example.com', first: 'Martín', last: 'Norte Sintético', school: SCHOOL_NORTE, approval: 'approved', qa: true, createdAt: '2026-10-14T10:20:00-03:00', roles: [{ role: 'docente', school: SCHOOL_NORTE }] },
  { key: 'norte2', email: 'e2e-rd60-francisca.norte@example.com', first: 'Francisca', last: 'Norte Pendiente Sintética', school: SCHOOL_NORTE, approval: 'pending', createdAt: '2026-11-09T18:30:00-03:00', roles: [] },
  // Our own school with generations, so /admin/schools and the user list show a third school with people.
  { key: 'sur1', email: 'e2e-rd60-andres.sur@example.com', first: 'Andrés', last: 'Sur Sintético', school: SCHOOL_SUR, generation: 'sur', approval: 'approved', createdAt: '2026-10-22T09:40:00-03:00', roles: [{ role: 'equipo_directivo', school: SCHOOL_SUR }, { role: 'docente', school: SCHOOL_SUR, generation: 'sur' }] },
];

const passwordFor = (p) => `E2E-Synthetic-RD60-${p.key}-2026`;

async function ensurePeople(supabase, fixtures, users) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const byEmail = new Map(data.users.map((u) => [(u.email || '').toLowerCase(), u.id]));
  const ids = {};
  for (const p of PEOPLE) {
    let uid = byEmail.get(p.email);
    if (!uid) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: p.email,
        password: passwordFor(p),
        email_confirm: true,
      });
      if (createError) throw new Error(`createUser ${p.email}: ${createError.message}`);
      uid = created.user.id;
    }
    ids[p.key] = uid;
  }
  const generationId = (g) => (g === 'fixture' ? fixtures.generation.id : g === 'sur' ? GENERATION_SUR : null);
  // Our own profiles converge (plain upsert): profiles has no updated_at, so a second run writes the same values.
  const { error: profileError } = await supabase.from('profiles').upsert(
    PEOPLE.map((p) => ({
      id: ids[p.key],
      email: p.email,
      name: `${p.first} ${p.last}`,
      first_name: p.first,
      last_name: p.last,
      approval_status: p.approval,
      must_change_password: p.mustChange === true,
      can_run_qa_tests: p.qa === true,
      school_id: p.school,
      generation_id: generationId(p.generation),
      external_school_affiliation: p.external ?? null,
      created_at: p.createdAt,
    })),
    { onConflict: 'id' }
  );
  if (profileError) throw new Error(`profiles: ${profileError.message}`);
  for (const p of PEOPLE) {
    for (const r of p.roles) {
      const { data: existing, error: selectError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', ids[p.key])
        .eq('role_type', r.role)
        .limit(1);
      if (selectError) throw new Error(`user_roles select: ${selectError.message}`);
      if (existing.length) continue;
      const { error: insertError } = await supabase.from('user_roles').insert({
        user_id: ids[p.key],
        role_type: r.role,
        school_id: r.school ?? null,
        generation_id: generationId(r.generation),
        is_active: r.active !== false,
        assigned_by: users.admin,
        assigned_at: p.createdAt,
        created_at: p.createdAt,
      });
      if (insertError) throw new Error(`user_roles insert ${p.email}: ${insertError.message}`);
    }
  }
  return ids;
}

// ---------------------------------------------------------------- schools and network (/admin/schools, /admin/network-management)

async function ensureSchoolsAndNetwork(supabase, users) {
  await insertMissing(supabase, 'schools', [
    { id: SCHOOL_SUR, name: 'Colegio Sintetico E2E Sur', has_generations: true },
    { id: SCHOOL_PONIENTE, name: 'Escuela Sintetica E2E Poniente', has_generations: false },
  ]);
  await insertMissing(supabase, 'generations', [
    {
      id: GENERATION_SUR,
      school_id: SCHOOL_SUR,
      name: 'Generación Sintética Sur',
      grade_range: '1° a 6° básico',
      description: 'Generación local de muestra. No corresponde a una generación real.',
      created_at: '2026-10-01T09:00:00-03:00',
      updated_at: '2026-10-01T09:00:00-03:00',
    },
  ]);
  // A third network holding our two schools, with no supervisor («Sin supervisores»).
  await insertMissing(supabase, 'redes_de_colegios', [
    {
      id: NETWORK_SUR,
      nombre: 'Red Sintetica E2E Sur',
      descripcion: 'Red local de muestra con dos colegios del sur. No corresponde a una red real.',
      created_by: users.admin,
      last_updated_by: users.admin,
      created_at: '2026-10-03T10:00:00-03:00',
      updated_at: '2026-10-03T10:00:00-03:00',
    },
  ]);
  await insertMissing(supabase, 'red_escuelas', [
    { id: id(0x0f11), red_id: NETWORK_SUR, school_id: SCHOOL_SUR, agregado_por: users.admin, fecha_agregada: '2026-10-03T10:05:00-03:00' },
    { id: id(0x0f12), red_id: NETWORK_SUR, school_id: SCHOOL_PONIENTE, agregado_por: users.admin, fecha_agregada: '2026-10-03T10:06:00-03:00' },
  ]);
}

// ---------------------------------------------------------------- /admin/tractor-signups — pending, granted, dismissed; both sources

async function ensureTractorSignups(supabase, fixtures, users, people) {
  const row = (n, f) => ({
    id: id(0x0100 + n),
    source: f.source ?? 'lideres_generacion_tractor',
    first_name: f.first,
    last_name: f.last,
    email: f.email,
    email_normalized: f.email.trim().toLowerCase(),
    school_id: f.school,
    generation_id: f.generation ?? null,
    birth_date: f.birth,
    profession: f.profession,
    role: f.role,
    status: f.status,
    consent_accepted_at: f.at,
    linked_user_id: f.linked ?? null,
    granted_by: f.status === 'granted' ? users.admin : null,
    granted_at: f.status === 'granted' ? f.grantedAt : null,
    created_at: f.at,
    updated_at: f.grantedAt ?? f.at,
  });
  await insertMissing(supabase, 'tractor_signups', [
    row(1, { first: 'Daniela', last: 'Registro Sintética', email: 'e2e-rd60-registro.daniela@example.com', school: SCHOOL, generation: fixtures.generation.id, birth: '1986-04-12', profession: 'Profesora de Educación Básica', role: 'docente', status: 'pending', at: '2026-11-10T19:22:00-03:00' }),
    row(2, { first: 'Sebastián', last: 'Registro Sintético', email: 'e2e-rd60-registro.sebastian@example.com', school: SCHOOL_NORTE, birth: '1979-09-30', profession: 'Jefe de UTP', role: 'equipo_directivo', status: 'pending', at: '2026-11-12T08:05:00-03:00', source: 'registro_general' }),
    // Same e-mail as an existing account: the «ya tiene cuenta» badge.
    row(3, { first: 'Javiera', last: 'Aprobada Sintética', email: 'e2e-rd60-javiera.aprobada@example.com', school: SCHOOL, generation: fixtures.generation.id, birth: '1990-02-18', profession: 'Profesora de Lenguaje', role: 'docente', status: 'granted', at: '2026-10-05T17:45:00-03:00', linked: people.aprobada, grantedAt: '2026-10-06T10:00:00-03:00' }),
    row(4, { first: 'Andrés', last: 'Sur Sintético', email: 'e2e-rd60-andres.sur@example.com', school: SCHOOL_SUR, generation: GENERATION_SUR, birth: '1975-11-03', profession: 'Director', role: 'equipo_directivo', status: 'granted', at: '2026-10-21T12:10:00-03:00', linked: people.sur1, grantedAt: '2026-10-22T09:40:00-03:00', source: 'registro_general' }),
    row(5, { first: 'Matías', last: 'Duplicado Sintético', email: 'e2e-rd60-registro.matias@example.com', school: SCHOOL, birth: '1992-07-21', profession: 'Profesor de Historia', role: 'docente', status: 'dismissed', at: '2026-10-15T21:30:00-03:00' }),
    row(6, { first: 'Constanza', last: 'Registro Sintética', email: 'e2e-rd60-registro.constanza@example.com', school: SCHOOL_PONIENTE, birth: '1983-01-09', profession: 'Educadora Diferencial', role: 'docente', status: 'pending', at: '2026-11-06T14:00:00-03:00', source: 'registro_general' }),
  ]);
}

// ---------------------------------------------------------------- pasantías, enero 2027
// /admin/pasantia-participants (rosters: Abierta, Enviada, Reabierta tras envío; links Vigente, Vencido, Revocado;
// school funding set or missing), /admin/pasantias-panel (travellers, flight/lodging/payment states, documents,
// letter states, activity), /profile/pasantia (the docente fixture account is one traveller), /pasantias/nomina.

const COHORT = 'enero-2027';
const NOTICE = 'pasant-intake-2026-11-v3'; // lib/pasantias/participants/notice.ts INTAKE_NOTICE_VERSION
// The link of roster «Dos» (open, valid until 2030): /pasantias/nomina#k=<NOMINA_TOKEN>. Local, invented.
export const NOMINA_TOKEN = 'RD60-nomina-sintetica-colegio-dos-local-e2e';
if (!/^[A-Za-z0-9_-]{43}$/.test(NOMINA_TOKEN)) throw new Error('NOMINA_TOKEN must be 43 base64url characters');
const tokenHash = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

const R = {
  uno: id(0x0201),
  dos: id(0x0202),
  tres: id(0x0203),
  cuatro: id(0x0204),
  cinco: id(0x0205),
};
const P = (n) => id(0x0300 + n);
const DOCUMENTS_BUCKET = 'pasantias-documents';

async function ensurePasantias(supabase, users) {
  const roster = (rid, f) => ({
    id: rid,
    cohort: COHORT,
    program: f.program,
    school_name: f.school,
    token_hash: tokenHash(f.token ?? `rd60-roster-${rid}`),
    expires_at: f.expires ?? '2030-12-31T23:59:00-03:00',
    revoked_at: f.revoked ?? null,
    status: f.submitted ? 'submitted' : 'open',
    submitted_at: f.submitted ?? null,
    last_submitted_at: f.lastSubmitted ?? f.submitted ?? null,
    version: f.version ?? 1,
    created_by: users.admin,
    created_at: f.created,
    updated_at: f.updated ?? f.created,
  });
  await insertMissing(supabase, 'pasantias_intake_rosters', [
    roster(R.uno, { program: 'inspira', school: 'Colegio Sintetico Pasantías Uno', submitted: '2026-10-24T17:30:00-03:00', version: 4, created: '2026-10-05T10:00:00-03:00', updated: '2026-10-24T17:30:00-03:00' }),
    roster(R.dos, { program: 'mirada-profunda', school: 'Colegio Sintetico Pasantías Dos', token: NOMINA_TOKEN, version: 2, created: '2026-10-07T11:00:00-03:00', updated: '2026-10-29T09:15:00-03:00' }),
    roster(R.tres, { program: 'inspira', school: 'Liceo Sintetico Pasantías Tres', lastSubmitted: '2026-10-27T12:00:00-03:00', version: 5, created: '2026-10-06T09:30:00-03:00', updated: '2026-11-03T16:20:00-03:00' }),
    roster(R.cuatro, { program: 'mirada-profunda', school: 'Escuela Sintetica Pasantías Cuatro', revoked: '2026-10-30T13:00:00-03:00', created: '2026-10-08T15:00:00-03:00', updated: '2026-10-30T13:00:00-03:00' }),
    roster(R.cinco, { program: 'inspira', school: 'Colegio Sintetico Pasantías Cinco', expires: '2026-10-31T23:59:00-03:00', created: '2026-10-01T08:00:00-03:00' }),
  ]);
  // «Datos del colegio»: who pays the flights and the lodging (missing for Cuatro and Cinco).
  const funding = (rid, flights, lodging, at) => ({ roster_id: rid, flights_funding: flights, lodging_funding: lodging, version: 1, created_at: at, updated_at: at });
  await insertMissing(supabase, 'pasantias_nomina_school_funding', [
    funding(R.uno, 'sep', 'sep', '2026-10-06T10:00:00-03:00'),
    funding(R.dos, 'colegio', 'colegio', '2026-10-08T12:00:00-03:00'),
    funding(R.tres, 'sep', 'colegio', '2026-10-07T09:00:00-03:00'),
  ], 'roster_id');
  // The letter's wording per roster: complete for Uno, half for Tres, none for Dos.
  await insertMissing(supabase, 'pasantias_panel_roster_details', [
    { roster_id: R.uno, letter_school_line: 'Colegio Sintetico Pasantías Uno, de la comuna de Ejemplo, Región Metropolitana', letter_lodging_line: 'la Residencia Sintética Gràcia, Barcelona', version: 1, updated_by: users.admin, created_at: '2026-10-28T10:00:00-03:00', updated_at: '2026-10-28T10:00:00-03:00' },
    { roster_id: R.tres, letter_school_line: 'Liceo Sintetico Pasantías Tres, de la comuna de Muestra, Región de Valparaíso', letter_lodging_line: null, version: 1, updated_by: users.admin, created_at: '2026-11-03T16:30:00-03:00', updated_at: '2026-11-03T16:30:00-03:00' },
  ], 'roster_id');

  // Travellers. Dates are the form's own options (program start −1/−7, end +1/+7/+14).
  const fundingOf = { [R.uno]: ['sep', 'sep'], [R.dos]: ['colegio', 'colegio'], [R.tres]: ['sep', 'colegio'], [R.cuatro]: ['sep', 'sep'] };
  const person = (n, rid, f) => ({
    id: P(n),
    roster_id: rid,
    client_request_id: id(0x1300 + n),
    first_names: f.first,
    last_names: f.last,
    rut: rut(f.rut),
    passport_number: f.passport ?? null,
    flights_funding: fundingOf[rid][0],
    lodging_funding: fundingOf[rid][1],
    arrival_date: f.arrival ?? null,
    departure_date: f.departure ?? null,
    focus: f.focus ?? null,
    dietary_restrictions: f.diet ?? [],
    dietary_other: f.dietOther ?? null,
    acknowledged_at: f.at,
    notice_version: NOTICE,
    version: f.version ?? 1,
    created_at: f.at,
    updated_at: f.at,
  });
  const people = [
    // Uno (inspira, sent): 18–28 Jan 2027.
    person(1, R.uno, { first: 'Docente', last: 'Sintetico', rut: 10000061, passport: 'P0000061', arrival: '2027-01-17', departure: '2027-01-29', focus: 'segundo_ciclo', at: '2026-10-10T10:00:00-03:00' }),
    person(2, R.uno, { first: 'María José', last: 'Pasante Sintética', rut: 10000062, passport: 'P0000062', arrival: '2027-01-17', departure: '2027-02-04', focus: 'infantil', diet: ['vegetariano'], at: '2026-10-10T10:05:00-03:00' }),
    person(3, R.uno, { first: 'Cristián', last: 'Pasante Sintético', rut: 10000063, passport: 'P0000063', arrival: '2027-01-11', departure: '2027-01-29', focus: 'tercer_ciclo', diet: ['otra', 'sin_gluten'], dietOther: 'Alergia a los frutos secos', at: '2026-10-11T09:00:00-03:00' }),
    person(4, R.uno, { first: 'Fernanda', last: 'Pasante Sintética', rut: 10000064, arrival: '2027-01-17', departure: '2027-01-29', at: '2026-10-11T09:30:00-03:00' }), // focus «Todos» via the side table
    // Dos (mirada profunda, open): 18–29 Jan 2027.
    person(5, R.dos, { first: 'Gonzalo', last: 'Pasante Sintético', rut: 10000065, passport: 'P0000065', arrival: '2027-01-17', departure: '2027-01-30', focus: 'primer_ciclo', diet: ['vegano'], at: '2026-10-20T11:00:00-03:00' }),
    person(6, R.dos, { first: 'Isidora', last: 'Pasante Sintética', rut: 10000066, at: '2026-10-29T09:15:00-03:00' }), // minimal: nothing but name and RUT
    // Tres (inspira, reopened after sending).
    person(7, R.tres, { first: 'Hernán', last: 'Pasante Sintético', rut: 10000067, passport: 'P0000067', arrival: '2027-01-17', departure: '2027-02-11', focus: 'segundo_ciclo', diet: ['sin_lactosa'], version: 2, at: '2026-10-15T15:00:00-03:00' }),
    person(8, R.tres, { first: 'Josefa', last: 'Pasante Sintética', rut: 10000068, passport: 'P0000068', arrival: '2027-01-17', departure: '2027-01-29', focus: 'infantil', at: '2026-10-15T15:10:00-03:00' }),
    // Cuatro (link revoked) still keeps the one person it sent.
    person(9, R.cuatro, { first: 'Lorena', last: 'Pasante Sintética', rut: 10000069, at: '2026-10-12T12:00:00-03:00' }),
  ];
  await insertMissing(supabase, 'pasantias_intake_participants', people);
  await insertMissing(supabase, 'pasantias_nomina_participant_focus', [
    { participant_id: P(4), all_levels: true, created_at: '2026-10-11T09:30:00-03:00', updated_at: '2026-10-11T09:30:00-03:00' },
  ], 'participant_id');
  // E-mails the schools entered. P1 is the docente fixture account: «Con cuenta en GENERA» and «Mi pasantía».
  const contact = (n, email, at) => ({ participant_id: P(n), email, created_at: at, updated_at: at });
  await insertMissing(supabase, 'pasantias_panel_contacts', [
    contact(1, 'e2e-docente@example.com', '2026-10-10T10:00:00-03:00'),
    contact(2, 'e2e-rd60-pasante.mariajose@example.com', '2026-10-10T10:05:00-03:00'),
    contact(3, 'e2e-rd60-pasante.cristian@example.com', '2026-10-11T09:00:00-03:00'),
    contact(4, 'e2e-rd60-pasante.fernanda@example.com', '2026-10-11T09:30:00-03:00'),
    contact(5, 'e2e-rd60-pasante.gonzalo@example.com', '2026-10-20T11:00:00-03:00'),
    contact(7, 'e2e-rd60-pasante.hernan@example.com', '2026-10-15T15:00:00-03:00'),
    contact(8, 'e2e-rd60-pasante.josefa@example.com', '2026-10-15T15:10:00-03:00'),
  ], 'participant_id');

  // FNE's tracking. Flight: Pendiente/Comprado/Pagado; lodging: Pendiente/Reservado/Pagado; deposit and balance.
  // Letter: P2 sent; P3 last attempt failed; P1 scheduled (everything ready); the rest blocked. P6, P9: no row (all pending).
  const logistics = (n, f) => ({
    participant_id: P(n),
    flight_status: f.flight ?? 'pending',
    lodging_status: f.lodging ?? 'pending',
    deposit_received: f.deposit ?? false,
    balance_received: f.balance ?? false,
    salutation: f.salutation ?? null,
    notes: f.notes ?? null,
    scl_departure_date: f.dates?.[0] ?? null,
    bcn_arrival_date: f.dates?.[1] ?? null,
    bcn_departure_date: f.dates?.[2] ?? null,
    scl_arrival_date: f.dates?.[3] ?? null,
    letter_sent_at: f.sentAt ?? null,
    letter_sent_to: f.sentAt ? f.sentTo : null,
    letter_send_error: f.error ?? null,
    version: f.version ?? 1,
    updated_by: users.admin,
    created_at: f.at,
    updated_at: f.at,
  });
  const inspiraDates = ['2027-01-16', '2027-01-17', '2027-01-29', '2027-01-31'];
  await insertMissing(supabase, 'pasantias_panel_logistics', [
    logistics(1, { flight: 'purchased', lodging: 'reserved', deposit: true, salutation: 'estimada', dates: inspiraDates, notes: 'Viaja con el grupo del colegio. Confirmar asiento de pasillo.', version: 3, at: '2026-11-05T11:00:00-03:00' }),
    logistics(2, { flight: 'paid', lodging: 'paid', deposit: true, balance: true, salutation: 'estimada', dates: inspiraDates, sentAt: '2026-11-07T09:00:00-03:00', sentTo: 'e2e-rd60-pasante.mariajose@example.com', version: 4, at: '2026-11-07T09:00:00-03:00' }),
    logistics(3, { flight: 'purchased', lodging: 'pending', deposit: true, salutation: 'estimado', dates: ['2027-01-09', '2027-01-10', '2027-01-29', '2027-01-31'], error: 'email_not_configured', version: 2, at: '2026-11-06T15:00:00-03:00' }),
    logistics(4, { flight: 'pending', lodging: 'reserved', at: '2026-11-02T10:00:00-03:00' }),
    logistics(5, { flight: 'paid', lodging: 'pending', deposit: true, salutation: 'estimado', dates: ['2027-01-16', '2027-01-17', '2027-01-30', '2027-02-01'], at: '2026-11-04T12:30:00-03:00' }),
    logistics(7, { flight: 'pending', lodging: 'pending', deposit: false, salutation: 'estimado', notes: 'El colegio pidió volver una semana después; esperando cotización.', at: '2026-11-03T17:00:00-03:00' }),
    logistics(8, { flight: 'purchased', lodging: 'reserved', deposit: true, balance: false, salutation: 'estimada', dates: inspiraDates, at: '2026-11-03T17:05:00-03:00' }),
  ], 'participant_id');

  // Documents (ticket, invitation letter, other; one removed), each with a tiny stored file so downloads work.
  const doc = (n, pn, f) => ({
    id: id(0x0400 + n),
    participant_id: P(pn),
    kind: f.kind,
    description: f.description ?? null,
    storage_path: `participants/${P(pn)}/${id(0x0400 + n)}.${f.ext ?? 'pdf'}`,
    file_name: f.file,
    mime_type: f.ext === 'png' ? 'image/png' : 'application/pdf',
    size_bytes: 0, // filled below from the real file
    uploaded_by: f.kind === 'invitation_letter' ? null : users.admin,
    created_at: f.at,
    removed_at: f.removedAt ?? null,
    removed_by: f.removedAt ? users.admin : null,
  });
  const documents = [
    doc(1, 1, { kind: 'ticket', file: 'Pasaje SCL-BCN Docente Sintetico.pdf', at: '2026-11-05T11:10:00-03:00' }),
    doc(2, 1, { kind: 'invitation_letter', file: 'Carta Invitación - Docente Sintetico.pdf', at: '2026-11-06T09:00:00-03:00' }),
    doc(3, 2, { kind: 'ticket', file: 'Pasaje SCL-BCN María José.pdf', at: '2026-11-04T10:00:00-03:00' }),
    doc(4, 2, { kind: 'invitation_letter', file: 'Carta Invitación - María José Pasante Sintética.pdf', at: '2026-11-07T09:00:00-03:00' }),
    doc(5, 2, { kind: 'other', description: 'Comprobante de pago del saldo', file: 'comprobante-saldo.png', ext: 'png', at: '2026-11-07T10:30:00-03:00' }),
    doc(6, 3, { kind: 'ticket', file: 'Pasaje Cristián (versión antigua).pdf', at: '2026-11-01T12:00:00-03:00', removedAt: '2026-11-06T14:55:00-03:00' }),
    doc(7, 3, { kind: 'ticket', file: 'Pasaje SCL-BCN Cristián.pdf', at: '2026-11-06T15:00:00-03:00' }),
    doc(8, 5, { kind: 'other', description: 'Seguro de viaje', file: 'seguro-viaje-gonzalo.pdf', at: '2026-11-04T12:40:00-03:00' }),
  ];
  const { data: existingDocs, error: docsError } = await supabase.from('pasantias_panel_documents').select('id').in('id', documents.map((d) => d.id));
  if (docsError) throw new Error(`pasantias_panel_documents: ${docsError.message}`);
  const haveDoc = new Set(existingDocs.map((d) => d.id));
  for (const d of documents) {
    const file = d.mime_type === 'image/png' ? tinyPng() : tinyPdf(d.file_name);
    d.size_bytes = file.length;
    if (haveDoc.has(d.id)) continue;
    const { error: upErr } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(d.storage_path, file, { contentType: d.mime_type, upsert: true });
    if (upErr) throw new Error(`upload ${d.storage_path}: ${upErr.message}`);
  }
  await insertMissing(supabase, 'pasantias_panel_documents', documents.filter((d) => !haveDoc.has(d.id)));
  // The letter's two images (logo, signature): only if not there yet, never overwritten.
  for (const kind of ['logo', 'signature']) {
    const { error: assetErr } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(`letter-assets/${kind}`, tinyPng(), { contentType: 'image/png', upsert: false });
    if (assetErr && !/exists|duplicate/i.test(assetErr.message)) throw new Error(`letter asset ${kind}: ${assetErr.message}`);
  }

  // Activity, shown in a traveller's drawer (every action kind once).
  const act = (n, pn, action, details, at) => ({ id: id(0x0500 + n), participant_id: P(pn), actor_id: action === 'letter_sent' ? null : users.admin, action, details, created_at: at });
  await insertMissing(supabase, 'pasantias_panel_activity', [
    act(1, 1, 'logistics_updated', { fields: { flight_status: { old: 'pending', new: 'purchased' }, lodging_status: { old: 'pending', new: 'reserved' } } }, '2026-11-05T11:00:00-03:00'),
    act(2, 1, 'document_uploaded', { kind: 'ticket', file_name: 'Pasaje SCL-BCN Docente Sintetico.pdf' }, '2026-11-05T11:10:00-03:00'),
    act(3, 1, 'letter_generated', {}, '2026-11-06T09:00:00-03:00'),
    act(4, 2, 'logistics_updated', { bulk: true, fields: { deposit_received: { old: false, new: true } } }, '2026-11-03T18:00:00-03:00'),
    act(5, 2, 'letter_sent', { automatic: true }, '2026-11-07T09:00:00-03:00'),
    act(6, 3, 'participant_corrected', { fields: { passport_number: { old: 'P000006', new: 'P0000063' }, focus: { old: null, new: 'tercer_ciclo' } } }, '2026-10-30T10:00:00-03:00'),
    act(7, 3, 'document_removed', { kind: 'ticket', file_name: 'Pasaje Cristián (versión antigua).pdf' }, '2026-11-06T14:55:00-03:00'),
    act(8, 3, 'logistics_updated', { fields: { scl_departure_date: { old: '2027-01-16', new: '2027-01-09' } } }, '2026-11-06T15:00:00-03:00'),
  ]);
}

// ---------------------------------------------------------------- QA tool (/admin/qa/*, /qa, /qa/run/[scenarioId])

const S = (n) => id(0x0600 + n);
const RUN = (n) => id(0x0700 + n);

const step = (index, instruction, expectedOutcome, route) => ({ index, instruction, expectedOutcome, route, captureOnFail: true, captureOnPass: false });

const SCENARIOS = [
  { n: 1, name: 'Aprobar a un usuario pendiente', area: 'user_management', role: 'admin', priority: 1, minutes: 5, at: '2026-10-02T10:00:00-03:00',
    description: 'El administrador revisa los registros pendientes y aprueba a una persona del colegio.',
    pre: [{ type: 'role', description: 'Ingresar como administrador' }, { type: 'data', description: 'Debe existir al menos un usuario con estado pendiente' }],
    steps: [step(1, 'Abrir Personas › Usuarios', 'Se ve la lista de usuarios con el resumen de pendientes', '/admin/user-management'), step(2, 'Filtrar por «Pendientes»', 'Solo aparecen usuarios con la insignia «Pendiente»'), step(3, 'Pulsar «Aprobar» en el primer usuario', 'Aparece el aviso «Usuario aprobado» y la insignia cambia'), step(4, 'Volver a filtrar por «Aprobados»', 'El usuario aprobado aparece en la lista')] },
  { n: 2, name: 'Asignar el rol de líder de generación', area: 'role_assignment', role: 'admin', priority: 2, minutes: 6, at: '2026-10-02T10:10:00-03:00',
    description: 'Se asigna a un docente el rol de líder de generación en su colegio.',
    pre: [{ type: 'role', description: 'Ingresar como administrador' }],
    steps: [step(1, 'Abrir la ficha de un docente en Usuarios', 'Se abre la ventana de roles'), step(2, 'Elegir «Líder de Generación» y la generación', 'El botón «Asignar» se habilita'), step(3, 'Pulsar «Asignar»', 'El nuevo rol aparece en la lista de roles del usuario')] },
  { n: 3, name: 'Revisar el reporte detallado del colegio', area: 'reporting', role: 'equipo_directivo', priority: 2, minutes: 8, at: '2026-10-03T09:00:00-03:00',
    description: 'El equipo directivo consulta el avance de sus docentes en el reporte detallado.',
    pre: [{ type: 'role', description: 'Ingresar como equipo directivo del colegio principal' }],
    steps: [step(1, 'Abrir «Reportes Detallados»', 'Se ve la tabla de usuarios del colegio', '/detailed-reports'), step(2, 'Filtrar por generación', 'La tabla muestra solo la generación elegida'), step(3, 'Abrir el detalle de un docente', 'Se ven sus cursos y su avance'), step(4, 'Exportar a CSV', 'Se descarga un archivo con las mismas filas')] },
  { n: 4, name: 'Completar una lección como docente', area: 'docente_experience', role: 'docente', priority: 1, minutes: 10, at: '2026-10-03T09:30:00-03:00',
    description: 'Un docente abre su curso, avanza por los bloques de una lección y la marca como completada.',
    pre: [{ type: 'role', description: 'Ingresar como docente inscrito en un curso' }],
    steps: [step(1, 'Abrir «Mi aprendizaje»', 'Aparece el curso inscrito con su avance', '/mi-aprendizaje'), step(2, 'Entrar a la primera lección', 'Se muestra el primer bloque de contenido'), step(3, 'Avanzar hasta el último bloque', 'El botón «Completar lección» se habilita'), step(4, 'Pulsar «Completar lección»', 'El avance del curso aumenta')] },
  { n: 5, name: 'Registrar la asistencia de una sesión de consultoría', area: 'consultor_sessions', role: 'consultor', priority: 3, minutes: 7, at: '2026-10-04T11:00:00-03:00',
    description: 'El consultor abre una sesión realizada y marca quiénes asistieron.',
    pre: [{ type: 'role', description: 'Ingresar como consultor asignado al colegio' }, { type: 'data', description: 'Debe existir una sesión con asistentes' }],
    steps: [step(1, 'Abrir «Sesiones»', 'Se ve la lista de sesiones del consultor', '/consultorias'), step(2, 'Entrar a una sesión', 'Se ve la lista de asistentes'), step(3, 'Marcar la asistencia y guardar', 'Aparece el aviso de asistencia guardada')] },
  { n: 6, name: 'Crear una licitación nueva', area: 'licitaciones', role: 'encargado_licitacion', priority: 2, minutes: 12, at: '2026-10-05T15:00:00-03:00',
    description: 'La encargada de licitación crea una licitación con sus datos básicos.',
    pre: [{ type: 'role', description: 'Ingresar como encargada de licitación del colegio principal' }],
    steps: [step(1, 'Abrir «Licitaciones»', 'Se ve la lista de licitaciones del colegio', '/licitaciones'), step(2, 'Pulsar «Nueva licitación»', 'Se abre el formulario'), step(3, 'Completar nombre, monto y fechas', 'Los campos aceptan los valores'), step(4, 'Guardar', 'La licitación aparece en la lista como borrador')] },
  { n: 7, name: 'Navegar el menú lateral en una pantalla pequeña', area: 'navigation', role: 'docente', priority: 4, minutes: 4, at: '2026-10-06T10:00:00-03:00',
    description: 'Revisar que el menú lateral se pueda abrir, recorrer y cerrar en un notebook de 1366×768.',
    pre: [{ type: 'navigation', description: 'Ventana del navegador de 1366×768' }],
    steps: [step(1, 'Abrir el panel principal', 'El menú lateral se ve completo', '/dashboard'), step(2, 'Colapsar el menú', 'Quedan solo los íconos'), step(3, 'Abrir un grupo del menú', 'Se despliegan sus opciones sin tapar el contenido')] },
  { n: 8, name: 'Redirigir al inicio de sesión sin cuenta', area: 'authentication', role: 'admin', priority: 3, minutes: 2, at: '2026-10-06T10:30:00-03:00', channel: 'automation', automatedOnly: true,
    description: 'Una visita sin sesión que abre una página interna termina en el inicio de sesión (prueba automatizada).',
    pre: [{ type: 'custom', description: 'Sin sesión iniciada' }],
    steps: [step(1, 'Abrir /dashboard sin sesión', 'Se muestra la página de inicio de sesión', '/dashboard')] },
  { n: 9, name: 'Revisar la gestión de redes (escenario retirado)', area: 'network_management', role: 'admin', priority: 4, minutes: 5, at: '2026-10-01T09:00:00-03:00', active: false,
    description: 'Escenario antiguo, reemplazado por las pruebas automáticas de supervisores de red.',
    pre: [],
    steps: [step(1, 'Abrir «Redes de Colegios»', 'Se ven las redes con sus colegios', '/admin/network-management')] },
];

async function ensureQa(supabase, users, people) {
  await insertMissing(supabase, 'qa_scenarios', SCENARIOS.map((s) => ({
    id: S(s.n),
    name: s.name,
    description: s.description,
    feature_area: s.area,
    role_required: s.role,
    preconditions: s.pre,
    steps: s.steps,
    created_at: s.at,
    updated_at: s.at,
    created_by: users.admin,
    is_active: s.active !== false,
    priority: s.priority,
    estimated_duration_minutes: s.minutes,
    automated_only: s.automatedOnly === true,
    is_multi_user: false,
    testing_channel: s.channel ?? 'human',
  })));

  const browser = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36', viewport: { width: 1366, height: 768 }, language: 'es-CL', platform: 'Linux x86_64' };
  // Runs: completed pass, fail and partial; in progress; aborted.
  const runs = [
    { n: 1, s: 1, tester: users.admin, role: 'admin', status: 'completed', result: 'pass', start: '2026-11-03T10:00:00-03:00', end: '2026-11-03T10:06:00-03:00', env: 'staging', secs: 340, notes: 'Todo funcionó según lo esperado.' },
    { n: 2, s: 4, tester: people.testerQa, role: 'docente', status: 'completed', result: 'fail', start: '2026-11-05T15:00:00-03:00', end: '2026-11-05T15:12:00-03:00', env: 'staging', secs: 690, notes: 'El botón «Completar lección» no se habilitó en el último bloque.' },
    { n: 3, s: 3, tester: people.testerQa, role: 'equipo_directivo', status: 'completed', result: 'partial', start: '2026-11-06T09:30:00-03:00', end: '2026-11-06T09:41:00-03:00', env: 'staging', secs: 610, notes: 'La exportación a CSV trae una columna vacía.' },
    { n: 4, s: 6, tester: users.admin, role: 'encargado_licitacion', status: 'in_progress', result: null, start: '2026-11-12T16:00:00-03:00', end: null, env: 'local', secs: 180, notes: null },
    { n: 5, s: 7, tester: people.norte1, role: 'docente', status: 'aborted', result: null, start: '2026-11-07T11:00:00-03:00', end: '2026-11-07T11:03:00-03:00', env: 'staging', secs: 95, notes: 'Se cortó la conexión del colegio durante la prueba.' },
    { n: 6, s: 2, tester: people.testerQa, role: 'admin', status: 'completed', result: 'pass', start: '2026-11-10T10:00:00-03:00', end: '2026-11-10T10:05:00-03:00', env: 'staging', secs: 300, notes: null },
    { n: 7, s: 4, tester: users.admin, role: 'docente', status: 'completed', result: 'pass', start: '2026-11-11T12:00:00-03:00', end: '2026-11-11T12:09:00-03:00', env: 'local', secs: 520, notes: 'Repetido tras la corrección: ahora pasa.' },
  ];
  await insertMissing(supabase, 'qa_test_runs', runs.map((r) => ({
    id: RUN(r.n),
    scenario_id: S(r.s),
    tester_id: r.tester,
    role_used: r.role,
    status: r.status,
    started_at: r.start,
    completed_at: r.end,
    environment: r.env,
    browser_info: browser,
    overall_result: r.result,
    notes: r.notes,
    total_active_seconds: r.secs,
  })));

  // Step results: every step of each run, with passed / failed / not reached.
  const scenarioById = new Map(SCENARIOS.map((s) => [s.n, s]));
  const outcome = {
    1: [true, true, true, true],
    2: [true, true, false],
    3: [true, true, true, false],
    4: [true, true],
    5: [true],
    6: [true, true, true],
    7: [true, true, true, true],
  };
  const stepRows = [];
  for (const r of runs) {
    const sc = scenarioById.get(r.s);
    outcome[r.n].forEach((passed, i) => {
      const st = sc.steps[i];
      const failed = passed === false;
      const at = new Date(new Date(r.start).getTime() + (i + 1) * 60_000).toISOString();
      stepRows.push({
        id: id(0x0800 + r.n * 16 + i),
        test_run_id: RUN(r.n),
        step_index: st.index,
        step_instruction: st.instruction,
        expected_outcome: st.expectedOutcome,
        passed,
        tester_note: failed
          ? (r.n === 2 ? 'Llegué al último bloque y el botón siguió gris. Recargué la página y pasó lo mismo.' : 'El archivo trae la columna «Generación» vacía.')
          : null,
        console_logs: failed
          ? [{ level: 'error', message: 'TypeError: Cannot read properties of undefined (reading \'blocks\')', timestamp: at }]
          : [],
        network_logs: failed
          ? [{ method: 'GET', url: '/api/lessons/progress', status: 500, statusText: 'Internal Server Error', duration: 412, timestamp: at }]
          : [{ method: 'GET', url: st.route ?? '/api/auth/session', status: 200, statusText: 'OK', duration: 120, timestamp: at }],
        screenshot_url: null,
        dom_snapshot: null,
        captured_at: at,
        time_spent_seconds: 45 + i * 20,
        active_seconds: 40 + i * 18,
        current_url: `http://localhost:3300${st.route ?? '/dashboard'}`,
      });
    });
  }
  await insertMissing(supabase, 'qa_step_results', stepRows);

  // Assignments (pending, in progress, completed, skipped), to the two testers and to the admin.
  const assign = (n, s, tester, status, f = {}) => ({
    id: id(0x0900 + n),
    scenario_id: S(s),
    tester_id: tester,
    assigned_at: f.at ?? '2026-11-02T09:00:00-03:00',
    assigned_by: users.admin,
    due_date: f.due ?? null,
    status,
    notes: f.notes ?? null,
    completed_at: f.done ?? null,
  });
  await insertMissing(supabase, 'qa_scenario_assignments', [
    assign(1, 4, people.testerQa, 'in_progress', { due: '2030-01-15', notes: 'Repetir cuando se publique la corrección de lecciones.' }),
    assign(2, 3, people.testerQa, 'completed', { done: '2026-11-06T09:41:00-03:00' }),
    assign(3, 5, people.testerQa, 'pending', { due: '2030-01-20' }),
    assign(4, 2, people.testerQa, 'completed', { done: '2026-11-10T10:05:00-03:00' }),
    assign(5, 7, people.testerQa, 'skipped', { notes: 'No aplica: el colegio usa solo tablets.' }),
    assign(6, 7, people.norte1, 'in_progress', { due: '2030-01-10' }),
    assign(7, 5, people.norte1, 'pending', { due: '2030-02-01' }),
    assign(8, 6, users.admin, 'in_progress', { due: '2030-01-12' }),
    assign(9, 1, users.admin, 'completed', { done: '2026-11-03T10:06:00-03:00' }),
    assign(10, 5, users.admin, 'pending', { due: '2030-01-25' }),
  ]);

  // /admin/qa/feature-checklist
  const feature = (n, f) => ({ id: id(0x0a00 + n), feature_name: f.name, feature_area: f.area, description: f.description, route_pattern: f.route, is_critical: f.critical ?? false, created_at: '2026-10-02T09:00:00-03:00', updated_at: '2026-10-02T09:00:00-03:00', created_by: users.admin });
  await insertMissing(supabase, 'qa_feature_checklist', [
    feature(1, { name: 'Aprobación de usuarios', area: 'user_management', description: 'Aprobar o rechazar registros pendientes', route: '/admin/user-management', critical: true }),
    feature(2, { name: 'Asignación de roles', area: 'role_assignment', description: 'Asignar y quitar roles con su alcance', route: '/admin/user-management', critical: true }),
    feature(3, { name: 'Reporte detallado', area: 'reporting', description: 'Tabla de avance por usuario con filtros', route: '/detailed-reports' }),
    feature(4, { name: 'Lecciones del docente', area: 'docente_experience', description: 'Recorrer bloques y completar lecciones', route: '/student/course/[courseId]', critical: true }),
    feature(5, { name: 'Licitaciones del colegio', area: 'licitaciones', description: 'Crear y seguir licitaciones Ley SEP', route: '/licitaciones' }),
    feature(6, { name: 'Horas de consultoría', area: 'hour_tracking', description: 'Registro y reporte de horas por contrato', route: '/reporte-horas' }),
  ]);

  // /admin/qa/time-tracking (the table the page's API reads first).
  const log = (n, tester, date, secs, runsCount, done) => ({ id: id(0x0b00 + n), tester_id: tester, date, total_seconds: secs, test_runs_count: runsCount, scenarios_completed: done, created_at: `${date}T20:00:00-03:00`, updated_at: `${date}T20:00:00-03:00` });
  await insertMissing(supabase, 'qa_tester_time_logs', [
    log(1, people.testerQa, '2026-11-05', 690, 1, 0),
    log(2, people.testerQa, '2026-11-06', 610, 1, 1),
    log(3, people.testerQa, '2026-11-10', 300, 1, 1),
    log(4, people.norte1, '2026-11-07', 95, 1, 0),
    log(5, users.admin, '2026-11-03', 340, 1, 1),
    log(6, users.admin, '2026-11-11', 520, 1, 1),
  ]);

  // /admin/qa/coverage, /admin/qa/lighthouse, /admin/qa/load-tests. The API keeps only the last 30 days by the
  // server's real clock: these rows (6–12 Nov 2026) leave the default view after about 6 Dec 2026.
  await insertMissing(supabase, 'qa_coverage_reports', [
    { id: id(0x0c01), report_name: 'Cobertura unitaria — main', overall_lines: 61.4, overall_statements: 60.8, overall_functions: 55.2, overall_branches: 48.9, git_commit: '58b8d169f', git_branch: 'main', test_suite: 'vitest', created_at: '2026-11-06T22:00:00-03:00', created_by: users.admin,
      file_coverage: [{ path: 'lib/pasantias/panel/server.ts', lines: 88.1, statements: 87.5, functions: 90, branches: 76.3 }, { path: 'pages/api/admin/users.ts', lines: 71.2, statements: 70.4, functions: 66.7, branches: 58.1, uncoveredLines: [212, 213, 214] }, { path: 'utils/roleUtils.ts', lines: 42.6, statements: 41.9, functions: 38.5, branches: 30.2 }] },
    { id: id(0x0c02), report_name: 'Cobertura unitaria — main', overall_lines: 62.9, overall_statements: 62.1, overall_functions: 56.0, overall_branches: 50.3, git_commit: '6d1e0a7c2', git_branch: 'main', test_suite: 'vitest', created_at: '2026-11-10T22:00:00-03:00', created_by: users.admin,
      file_coverage: [{ path: 'lib/pasantias/panel/server.ts', lines: 89.0, statements: 88.6, functions: 90, branches: 78.0 }, { path: 'pages/api/admin/users.ts', lines: 73.5, statements: 72.9, functions: 70, branches: 60.4 }] },
    { id: id(0x0c03), report_name: 'Cobertura API', overall_lines: 54.0, overall_statements: 53.6, overall_functions: 49.1, overall_branches: 41.7, git_commit: '6d1e0a7c2', git_branch: 'feat/rd-safety', test_suite: 'vitest-api', created_at: '2026-11-12T21:30:00-03:00', created_by: users.admin,
      file_coverage: [{ path: 'pages/api/qa/scenarios.ts', lines: 64.3, statements: 63.0, functions: 60, branches: 45.5 }] },
  ]);
  const lh = (n, url, scores, metrics, env, at) => ({ id: id(0x0d00 + n), url, performance_score: scores[0], accessibility_score: scores[1], best_practices_score: scores[2], seo_score: scores[3], pwa_score: scores[4], first_contentful_paint: metrics[0], largest_contentful_paint: metrics[1], total_blocking_time: metrics[2], cumulative_layout_shift: metrics[3], speed_index: metrics[4], time_to_interactive: metrics[5], audit_details: {}, environment: env, created_at: at, created_by: users.admin });
  await insertMissing(supabase, 'qa_lighthouse_results', [
    lh(1, 'http://localhost:3300/login', [94, 98, 100, 92, 30], [820, 1350, 40, 0.01, 1100, 1500], 'local', '2026-11-08T10:00:00-03:00'),
    lh(2, 'http://localhost:3300/dashboard', [71, 91, 92, 83, 30], [1450, 2900, 310, 0.08, 2400, 3600], 'local', '2026-11-08T10:05:00-03:00'),
    lh(3, 'http://localhost:3300/admin/user-management', [48, 86, 83, 75, 20], [2100, 4600, 780, 0.27, 3900, 6100], 'staging', '2026-11-10T11:00:00-03:00'),
    lh(4, 'http://localhost:3300/dashboard', [77, 92, 92, 83, 30], [1300, 2600, 250, 0.05, 2200, 3300], 'local', '2026-11-12T10:00:00-03:00'),
  ]);
  const lt = (n, f) => ({ id: id(0x0e00 + n), test_name: f.name, test_script: f.script, description: f.description, duration_seconds: f.duration, virtual_users: f.vus, requests_total: f.requests, requests_per_second: f.rps, response_time_avg: f.avg, response_time_min: f.min, response_time_max: f.max, response_time_p50: f.p50, response_time_p90: f.p90, response_time_p95: f.p95, response_time_p99: f.p99, error_rate: f.errorRate, errors_total: f.errors, data_received_kb: f.rx, data_sent_kb: f.tx, iterations_total: f.iterations, target_url: f.url, environment: f.env, metrics_json: {}, status: f.status, created_at: f.at, created_by: users.admin });
  await insertMissing(supabase, 'qa_load_test_results', [
    lt(1, { name: 'Inicio de sesión — 50 usuarios', script: 'k6/login.js', description: 'Carga de inicio de sesión en hora punta', duration: 300, vus: 50, requests: 15230, rps: 50.8, avg: 182, min: 61, max: 1210, p50: 150, p90: 290, p95: 360, p99: 720, errorRate: 0.1, errors: 15, rx: 48210, tx: 9120, iterations: 7615, url: 'http://localhost:3300/login', env: 'staging', status: 'passed', at: '2026-11-07T23:00:00-03:00' }),
    lt(2, { name: 'Panel principal — 100 usuarios', script: 'k6/dashboard.js', description: 'Panel con cien docentes simultáneos', duration: 600, vus: 100, requests: 40120, rps: 66.9, avg: 640, min: 120, max: 5400, p50: 480, p90: 1310, p95: 1890, p99: 3900, errorRate: 2.4, errors: 963, rx: 210300, tx: 25100, iterations: 10030, url: 'http://localhost:3300/dashboard', env: 'staging', status: 'warning', at: '2026-11-09T23:00:00-03:00' }),
    lt(3, { name: 'Reportes detallados — 30 usuarios', script: 'k6/reports.js', description: 'Equipos directivos abriendo el reporte a la vez', duration: 300, vus: 30, requests: 4210, rps: 14.0, avg: 2950, min: 410, max: 12000, p50: 2400, p90: 5600, p95: 7100, p99: 10900, errorRate: 9.8, errors: 412, rx: 98000, tx: 4100, iterations: 1400, url: 'http://localhost:3300/detailed-reports', env: 'staging', status: 'failed', at: '2026-11-12T23:00:00-03:00' }),
  ]);
  // Web vitals on the lighthouse page (its default period is the last 7 days by the server clock: these leave it
  // after about 19 Nov 2026).
  const vital = (n, page, metric, value, rating, at) => ({ id: id(0x0e40 + n), page_url: page, metric_name: metric, metric_value: value, rating, navigation_type: 'navigate', user_agent: browser.userAgent, connection_type: '4g', device_type: 'desktop', session_id: `rd60-${n}`, created_at: at });
  await insertMissing(supabase, 'qa_web_vitals', [
    vital(1, '/dashboard', 'LCP', 2350, 'good', '2026-11-12T09:00:00-03:00'),
    vital(2, '/dashboard', 'CLS', 0.12, 'needs-improvement', '2026-11-12T09:00:00-03:00'),
    vital(3, '/dashboard', 'INP', 180, 'good', '2026-11-12T09:01:00-03:00'),
    vital(4, '/admin/user-management', 'LCP', 4800, 'poor', '2026-11-12T10:00:00-03:00'),
    vital(5, '/admin/user-management', 'TTFB', 900, 'needs-improvement', '2026-11-12T10:00:00-03:00'),
    vital(6, '/login', 'FCP', 900, 'good', '2026-11-12T08:30:00-03:00'),
  ]);
}

// ---------------------------------------------------------------- entry

export async function seed({ supabase, users, fixtures }) {
  await ensureSchoolsAndNetwork(supabase, users);
  const people = await ensurePeople(supabase, fixtures, users);
  await ensureTractorSignups(supabase, fixtures, users, people);
  await ensurePasantias(supabase, users);
  await ensureQa(supabase, users, people);
}

export const params = {
  '/admin/qa/runs/[runId]': { default: { runId: RUN(2) } }, // completed, failed, with a failed step and its logs
  '/qa/run/[scenarioId]': { default: { scenarioId: S(4) } }, // active human scenario (docente), with earlier runs
  '/pasantias/nomina': { default: { '#': `k=${NOMINA_TOKEN}` } }, // reached by a link that carries the key after the #
};

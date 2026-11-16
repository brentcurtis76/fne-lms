// Module 50 — Gestión (clients, contracts, annexes, hour allocation, quotes) and Licitaciones (the procurement flow of
// the primary school, its admin libraries and one generated proposal with a web view). Invented content only.
//
// Ids: UUIDs 5eed0050-0000-4000-8000-00000000XXXX, integers from 9950000. Rows are only ever INSERTED when missing
// (never updated), because several of these tables have BEFORE UPDATE triggers that stamp updated_at with the real
// clock: an upsert would change rows on every run. Files go to the local storage with fixed paths, create-only.
//
// Shapes follow the code that writes them: components/contracts/ContractForm.tsx + AnnexForm.tsx (contratos, cuotas),
// pages/api/contracts/[id]/hours/allocate.ts + ledger/index.ts (allocations, manual ledger rows),
// pages/api/quotes/createV2.ts (quotes; totals are computed by the table's own triggers),
// lib/licitacionService.ts + lib/businessDays.ts (licitaciones, timeline in business days with feriados_chile),
// pages/api/licitaciones/[id]/{ates,upload,evaluacion,adjudicacion,generate-*}.ts + lib/evaluacionService.ts (ATEs,
// documents, scores), pages/api/licitaciones/[id]/generate-propuesta.ts + lib/propuestas-web/snapshot.ts (proposal).
import bcrypt from 'bcryptjs';
import { pdf, png, docx, MIME } from './_50-files.mjs';

export const name = 'gestión y licitaciones';

const U = (n) => `5eed0050-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TS = (d, t = '10:00:00') => `${d}T${t}-03:00`;

// ---------------------------------------------------------------- fixed ids (also used by params)
const PRG = { evoluciona: U(1), preparacion: U(2), liderazgo: U(3), comunidades: U(4) };
const CLI = { e2e: U(11), norte: U(12), aromos: U(13), marazul: U(14) };
const CTR = { main: U(101), annex: U(102), firmaPend: U(103), draft: U(104), manualClp: U(105), legacy2025: U(106), fromLic: U(107) };
const QUO = { draft: U(411), sent: U(412), viewed: U(413), accepted: U(414), rejected: U(415), expired: U(416) };
const LIC = {
  borrador: U(1001), publicacion: U(1002), recepcion: U(1003), propuestas: U(1004), evaluacion: U(1005),
  adjudicacion: U(1006), contratoPend: U(1007), contratoGen: U(1008), externo: U(1009), cerradaFlujo: U(1010),
  cerradaHist: U(1011), norte: U(1012),
};
const PROPUESTA_SLUG = 'colegio-sintetico-e2e-evoluciona-2027-v2';
const PROPUESTA_CODE = 'SNTE2E'; // access code of the published web view (the harness can also use ?admin=true)

export const params = {
  '/contract-print/[id]': { default: { id: CTR.main } },
  '/admin/quotes/[id]/edit': { default: { id: QUO.draft } },
  // A quote opened through /api/quotes/[id] while 'sent' flips to 'viewed' — this one is already 'viewed'.
  '/quote/[id]': { default: { id: QUO.viewed } },
  '/licitaciones/[id]': { default: { id: LIC.contratoGen } },
  '/licitaciones/[id]/evaluacion': { default: { id: LIC.adjudicacion } },
  // Visitors see the unlock screen; an admin sees the full proposal at /propuesta/<slug>?admin=true.
  '/propuesta/[slug]': { default: { slug: PROPUESTA_SLUG }, admin: { slug: PROPUESTA_SLUG, '?': 'admin=true' } },
};

// More states of the same addresses worth a picture of their own (walk.mjs photographs them besides the plain address).
export const variants = [
  { route: '/contracts', name: 'detalle', values: { '?': `contrato_id=${CTR.main}` }, roles: ['admin'] }, // the detail panel with the hours buckets and cuotas
  { route: '/contract-print/[id]', name: 'anexo', values: { id: CTR.annex }, roles: ['admin'] },
  { route: '/licitaciones/[id]', name: 'recepcion', values: { id: LIC.recepcion }, roles: ['admin', 'encargado_licitacion'] }, // an early step, still open
  { route: '/licitaciones/[id]', name: 'historica', values: { id: LIC.cerradaHist }, roles: ['admin'] },
  { route: '/licitaciones/[id]/evaluacion', name: 'en-curso', values: { id: LIC.evaluacion }, roles: ['admin', 'encargado_licitacion'] }, // editable, partial scores
];

// ---------------------------------------------------------------- helpers
let sb; // service client of the current run

async function ensure(table, rows, key = 'id') {
  if (!rows.length) return;
  const keys = rows.map((r) => r[key]);
  const have = new Set();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await sb.from(table).select(key).in(key, keys.slice(i, i + 200));
    if (error) throw new Error(`${table} (look): ${error.message}`);
    for (const r of data) have.add(String(r[key]));
  }
  const missing = rows.filter((r) => !have.has(String(r[key])));
  for (let i = 0; i < missing.length; i += 200) {
    const { error } = await sb.from(table).insert(missing.slice(i, i + 200));
    if (error) throw new Error(`${table} (insert): ${error.message}`);
  }
}

async function ensureBucket(id, isPublic) {
  const { data } = await sb.storage.getBucket(id);
  if (data) return;
  const { error } = await sb.storage.createBucket(id, { public: isPublic });
  if (error && !/exist/i.test(error.message)) throw new Error(`bucket ${id}: ${error.message}`);
}

async function put(bucket, path, buf, contentType) {
  const { error } = await sb.storage.from(bucket).upload(path, buf, { contentType, upsert: false });
  if (error && !/exist|duplicate/i.test(error.message)) throw new Error(`storage ${bucket}/${path}: ${error.message}`);
}

function rut(body) {
  const digits = String(body).split('').reverse();
  let sum = 0;
  digits.forEach((d, i) => { sum += Number(d) * (2 + (i % 6)); });
  const r = 11 - (sum % 11);
  const dv = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return `${String(body).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

// lib/businessDays.ts, on date strings: skips weekends and the holidays in feriados_chile.
function addBusinessDays(dateStr, days, holidays) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(s)) added++;
  }
  return d.toISOString().slice(0, 10);
}
function timeline(pub, holidays) {
  const bases = addBusinessDays(pub, 5, holidays);
  const consultas = addBusinessDays(bases, 3, holidays);
  const propuestas = addBusinessDays(consultas, 5, holidays);
  return {
    fecha_limite_solicitud_bases: bases,
    fecha_limite_consultas: consultas,
    fecha_inicio_propuestas: addBusinessDays(consultas, 1, holidays),
    fecha_limite_propuestas: propuestas,
    fecha_limite_evaluacion: addBusinessDays(propuestas, 3, holidays),
  };
}

// lib/evaluacionService.ts, verbatim arithmetic.
function economicScores(ates) {
  if (ates.length === 1) return { [ates[0].id]: 100 };
  const min = Math.min(...ates.map((a) => a.monto));
  return Object.fromEntries(ates.map((a) => [a.id, Math.round((min / a.monto) * 100 * 10) / 10]));
}
function weighted(tec, eco, pt, pe) {
  const tecPond = Math.round(tec * (pt / 100) * 10) / 10;
  const ecoPond = Math.round(eco * (pe / 100) * 10) / 10;
  return { puntaje_tecnico_ponderado: tecPond, puntaje_economico_ponderado: ecoPond, puntaje_total: Math.round((tecPond + ecoPond) * 10) / 10 };
}

// ================================================================ seed
export async function seed({ supabase, users }) {
  sb = supabase;
  const admin = users.admin;
  const encargado = users.procurementManager;

  for (const [b, pub] of [['contracts', true], ['facturas', true], ['licitaciones', false], ['propuestas', false]]) await ensureBucket(b, pub);

  await seedProgramasYClientes();
  await seedContratos(admin);
  await seedQuotes(admin);
  const holidays = await seedFeriados();
  const criterios = await seedCriteriosYPlantillas(admin);
  await seedLicitaciones({ admin, encargado, holidays, criterios });
  await seedPropuestas(admin);
}

// ---------------------------------------------------------------- /contracts, /admin/clients: programs and clients
async function seedProgramasYClientes() {
  await ensure('programas', [
    { id: PRG.evoluciona, codigo_servicio: 'E2E-52901', nombre: 'Programa Evoluciona (Sintético E2E)', descripcion: 'Asesoría integral de dos años para instalar una cultura de innovación centrada en el aprendizaje, con acompañamiento al equipo directivo, talleres docentes y cursos en línea.', horas_totales: 148, modalidad: 'mixta', activo: true, created_at: TS('2026-01-12') },
    { id: PRG.preparacion, codigo_servicio: 'E2E-46902', nombre: 'Programa Preparación (Sintético E2E)', descripcion: 'Programa de preparación para el cambio: diagnóstico relacional, formación de la generación tractor y plan de mejora inicial.', horas_totales: 88, modalidad: 'presencial', activo: true, created_at: TS('2026-01-12') },
    { id: PRG.liderazgo, codigo_servicio: 'E2E-45903', nombre: 'Liderazgo para el Cambio (Sintético E2E)', descripcion: 'Asesoría al equipo directivo para liderar el cambio de la cultura organizacional.', horas_totales: 40, modalidad: 'presencial', activo: true, created_at: TS('2026-01-12') },
    { id: PRG.comunidades, codigo_servicio: 'E2E-45904', nombre: 'Comunidades de Aprendizaje (Sintético E2E)', descripcion: 'Acompañamiento en línea a comunidades de crecimiento docente durante el año escolar.', horas_totales: 60, modalidad: 'online', activo: true, created_at: TS('2026-01-12') },
  ]);

  const base = { comuna_notaria: 'Santiago', created_at: TS('2026-01-15') };
  await ensure('clientes', [
    { ...base, id: CLI.e2e, school_id: 990001, nombre_legal: 'Fundación Educacional Sintética E2E', nombre_fantasia: 'Colegio Sintetico E2E', rut: rut(65990501), direccion: 'Avenida Sintética 1234', comuna: 'Providencia', ciudad: 'Santiago', nombre_representante: 'Rosa Sintética Valdés', rut_representante: rut(9990501), fecha_escritura: '2014-03-18', nombre_notario: 'Notaría Sintética Primera', nombre_encargado_proyecto: 'Directora Sintética E2E', telefono_encargado_proyecto: '+56 2 2990 0501', email_encargado_proyecto: 'direccion.e2e@example.com', nombre_contacto_administrativo: 'Administración Sintética E2E', telefono_contacto_administrativo: '+56 2 2990 0502', email_contacto_administrativo: 'facturacion.e2e@example.com' },
    { ...base, id: CLI.norte, school_id: 990002, nombre_legal: 'Corporación Educacional Sintética del Norte E2E', nombre_fantasia: 'Colegio Sintetico E2E Norte', rut: rut(65990502), direccion: 'Calle Sintética Norte 450', comuna: 'Antofagasta', ciudad: 'Antofagasta', nombre_representante: 'Jorge Sintético Araya', rut_representante: rut(9990502), fecha_escritura: '2011-08-02', nombre_notario: 'Notaría Sintética de Antofagasta', comuna_notaria: 'Antofagasta', nombre_encargado_proyecto: 'Coordinadora Sintética Norte', telefono_encargado_proyecto: '+56 55 299 0503', email_encargado_proyecto: 'coordinacion.norte.e2e@example.com', nombre_contacto_administrativo: null, telefono_contacto_administrativo: null, email_contacto_administrativo: null },
    { ...base, id: CLI.aromos, school_id: null, nombre_legal: 'Sociedad Educacional Sintética Los Aromos E2E Ltda.', nombre_fantasia: 'Colegio Sintético Los Aromos', rut: rut(76990503), direccion: 'Camino Sintético Los Aromos 77', comuna: 'Talca', ciudad: 'Talca', nombre_representante: 'Marcela Sintética Rojas', rut_representante: rut(10990503), fecha_escritura: '2018-05-21', nombre_notario: 'Notaría Sintética de Talca', comuna_notaria: 'Talca', nombre_encargado_proyecto: null, telefono_encargado_proyecto: null, email_encargado_proyecto: null, nombre_contacto_administrativo: 'Contabilidad Sintética Los Aromos', telefono_contacto_administrativo: '+56 71 299 0504', email_contacto_administrativo: 'contabilidad.aromos.e2e@example.com' },
    { ...base, id: CLI.marazul, school_id: null, nombre_legal: 'Fundación Sintética Mar Azul E2E', nombre_fantasia: 'Escuela Sintética Mar Azul', rut: rut(65990504), direccion: 'Pasaje Sintético Costanera 12', comuna: 'Valparaíso', ciudad: 'Valparaíso', nombre_representante: 'Andrés Sintético Muñoz', rut_representante: rut(11990504), fecha_escritura: '2020-11-09', nombre_notario: 'Notaría Sintética de Valparaíso', comuna_notaria: 'Valparaíso', nombre_encargado_proyecto: 'Jefa Sintética de UTP', telefono_encargado_proyecto: '+56 32 299 0505', email_encargado_proyecto: 'utp.marazul.e2e@example.com', nombre_contacto_administrativo: null, telefono_contacto_administrativo: null, email_contacto_administrativo: null },
  ]);
}

// ---------------------------------------------------------------- /contracts (list, detail modal, cash flow), /contract-print/[id]
// Status coverage: activo + firmado, activo + firma pendiente, borrador, pendiente (manual CLP, imported PDF),
// a finished 2025 contract out of the cash flow, an annex, and the contract born from a licitación.
// Cuotas: Pagada (with and without invoice), Vencida (past, unpaid, one with invoice) and Pendiente (2030).
async function seedContratos(admin) {
  const facturaPath = (n) => `e2e-5eed0050/factura_${n}.pdf`;
  const facturaFiles = [201, 202, 203, 211, 251, 252, 253, 254];
  for (const n of facturaFiles) await put('facturas', facturaPath(n), pdf(`Factura electrónica N° ${9950000 + n}`, ['Emisor: Fundación Nueva Educación (documento sintético)', 'Documento de prueba sin valor tributario.']), MIME.pdf);
  const facturaUrl = (n) => sb.storage.from('facturas').getPublicUrl(facturaPath(n)).data.publicUrl;
  const fac = (n, at) => ({ factura_url: facturaUrl(n), factura_filename: `factura_${9950000 + n}.pdf`, factura_size: 1100, factura_type: 'application/pdf', factura_uploaded_at: TS(at, '16:20:00') });

  const importedPath = 'e2e-5eed0050/FNE-2026-09-905_importado.pdf';
  await put('contracts', importedPath, pdf('Contrato de prestación de servicios (sintético)', ['Escuela Sintética Mar Azul - Talleres de convivencia escolar', 'Documento importado de prueba.']), MIME.pdf);
  const signedPath = 'e2e-5eed0050/FNE-2026-03-901_firmado.pdf';
  await put('contracts', signedPath, pdf('Contrato FNE-2026-03-901 firmado (sintético)', ['Firmado por las partes el 9 de marzo de 2026.']), MIME.pdf);
  const pub = (p) => sb.storage.from('contracts').getPublicUrl(p).data.publicUrl;

  const c = (o) => ({ firmado: false, incluir_en_flujo: false, tipo_moneda: 'UF', is_anexo: false, es_manual: false, ...o });
  await ensure('contratos', [
    c({ id: CTR.main, numero_contrato: 'FNE-2026-03-901', fecha_contrato: '2026-03-02', fecha_fin: '2030-03-31', cliente_id: CLI.e2e, programa_id: PRG.evoluciona, precio_total_uf: 420, numero_cuotas: 4, estado: 'activo', firmado: true, incluir_en_flujo: true, contrato_url: pub(signedPath), horas_contratadas: 148, created_at: TS('2026-03-02', '11:30:00') }),
    c({ id: CTR.annex, numero_contrato: 'FNE-2026-03-901A1', fecha_contrato: '2026-08-03', cliente_id: CLI.e2e, programa_id: PRG.evoluciona, precio_total_uf: 60, numero_cuotas: 2, estado: 'activo', firmado: true, incluir_en_flujo: true, is_anexo: true, parent_contrato_id: CTR.main, anexo_numero: 1, anexo_fecha: '2026-08-03', numero_participantes: 12, nombre_ciclo: 'Segundo Ciclo', horas_contratadas: 20, created_at: TS('2026-08-03', '09:15:00') }),
    c({ id: CTR.firmaPend, numero_contrato: 'FNE-2026-05-902', fecha_contrato: '2026-05-11', fecha_fin: '2030-01-31', cliente_id: CLI.norte, programa_id: PRG.preparacion, precio_total_uf: 264, numero_cuotas: 2, estado: 'activo', firmado: false, incluir_en_flujo: true, horas_contratadas: 88, created_at: TS('2026-05-11', '15:00:00') }),
    c({ id: CTR.draft, numero_contrato: 'FNE-2026-10-903', fecha_contrato: '2026-10-26', cliente_id: CLI.aromos, programa_id: PRG.liderazgo, precio_total_uf: 120, numero_cuotas: 3, estado: 'borrador', created_at: TS('2026-10-26', '12:40:00') }),
    c({ id: CTR.manualClp, numero_contrato: 'FNE-2026-09-905', fecha_contrato: '2026-09-14', fecha_fin: '2030-06-30', cliente_id: CLI.marazul, programa_id: null, precio_total_uf: 18500000, numero_cuotas: 3, tipo_moneda: 'CLP', estado: 'pendiente', es_manual: true, descripcion_manual: 'Talleres de convivencia escolar y clima relacional para docentes y asistentes de la educación (contrato importado desde PDF).', contrato_url: pub(importedPath), pdf_extracted: true, extraction_confidence: 0.92, extraction_timestamp: TS('2026-09-14', '10:05:00'), created_at: TS('2026-09-14', '10:06:00') }),
    c({ id: CTR.legacy2025, numero_contrato: 'FNE-2025-03-906', fecha_contrato: '2025-03-03', fecha_fin: '2025-12-31', cliente_id: CLI.e2e, programa_id: PRG.preparacion, precio_total_uf: 250, numero_cuotas: 2, estado: 'activo', firmado: true, incluir_en_flujo: false, created_at: TS('2025-03-03') }),
    c({ id: CTR.fromLic, numero_contrato: 'FNE-2026-10-907', fecha_contrato: '2026-10-20', fecha_fin: '2030-12-31', cliente_id: CLI.e2e, programa_id: PRG.evoluciona, precio_total_uf: 465, numero_cuotas: 3, estado: 'pendiente', licitacion_id: LIC.contratoGen, created_at: TS('2026-10-20', '17:10:00') }),
  ]);

  const q = (id, contrato_id, numero_cuota, fecha_vencimiento, monto_uf, extra = {}) => ({ id: U(id), contrato_id, numero_cuota, fecha_vencimiento, monto_uf, pagada: false, factura_pagada: false, created_at: TS('2026-03-02', '11:31:00'), ...extra });
  await ensure('cuotas', [
    q(201, CTR.main, 1, '2026-04-15', 105, { pagada: true, factura_pagada: true, ...fac(201, '2026-04-10') }),
    q(202, CTR.main, 2, '2026-07-15', 105, { pagada: true, factura_pagada: true, ...fac(202, '2026-07-08') }),
    q(203, CTR.main, 3, '2026-10-15', 105, { ...fac(203, '2026-10-09') }),
    q(204, CTR.main, 4, '2030-03-15', 105),
    q(211, CTR.annex, 1, '2026-09-15', 30, { pagada: true, ...fac(211, '2026-09-04'), created_at: TS('2026-08-03', '09:16:00') }),
    q(212, CTR.annex, 2, '2030-03-15', 30, { created_at: TS('2026-08-03', '09:16:00') }),
    q(221, CTR.firmaPend, 1, '2026-09-30', 132, { created_at: TS('2026-05-11', '15:01:00') }),
    q(222, CTR.firmaPend, 2, '2030-01-15', 132, { created_at: TS('2026-05-11', '15:01:00') }),
    q(231, CTR.draft, 1, '2030-03-31', 40, { created_at: TS('2026-10-26', '12:41:00') }),
    q(232, CTR.draft, 2, '2030-06-30', 40, { created_at: TS('2026-10-26', '12:41:00') }),
    q(233, CTR.draft, 3, '2030-09-30', 40, { created_at: TS('2026-10-26', '12:41:00') }),
    q(241, CTR.manualClp, 1, '2026-10-31', 6000000, { created_at: TS('2026-09-14', '10:06:00') }),
    q(242, CTR.manualClp, 2, '2030-03-31', 6000000, { created_at: TS('2026-09-14', '10:06:00') }),
    q(243, CTR.manualClp, 3, '2030-06-30', 6500000, { created_at: TS('2026-09-14', '10:06:00') }),
    q(251, CTR.legacy2025, 1, '2025-05-15', 125, { pagada: true, factura_pagada: true, ...fac(251, '2025-05-09'), created_at: TS('2025-03-03') }),
    q(252, CTR.legacy2025, 2, '2025-10-15', 125, { pagada: true, factura_pagada: true, ...fac(252, '2025-10-07'), created_at: TS('2025-03-03') }),
    q(261, CTR.fromLic, 1, '2030-03-31', 155, { created_at: TS('2026-10-20', '17:11:00') }),
    q(262, CTR.fromLic, 2, '2030-07-31', 155, { created_at: TS('2026-10-20', '17:11:00') }),
    q(263, CTR.fromLic, 3, '2030-11-30', 155, { created_at: TS('2026-10-20', '17:11:00') }),
  ]);

  // ---- hour allocation panel ("bolsa de horas") of the active contracts
  // hour_types is a lookup table (keys from supabase/migrations-archive/20260224000000_hour_tracking_phase1.sql). It is
  // empty on the local copy: rows are added only for keys that are missing, and ids are read back by key.
  const HT = [
    ['online_learning', 'Cursos Online (LMS)', 'online', 1], ['asesoria_tecnica_online', 'Asesoría Técnica Online', 'online', 2],
    ['asesoria_tecnica_presencial', 'Asesoría Técnica Presencial', 'presencial', 3], ['asesoria_directiva_online', 'Asesoría Directiva Online', 'online', 4],
    ['asesoria_directiva_presencial', 'Asesoría Directiva Presencial', 'presencial', 5], ['gestion_cambio_online', 'Gestión del Cambio Online', 'online', 6],
    ['gestion_cambio_presencial', 'Gestión del Cambio Presencial', 'presencial', 7], ['talleres_presenciales', 'Talleres Presenciales', 'presencial', 8],
    ['encuentro_lideres', 'Encuentro de Líderes', 'presencial', 9],
  ];
  await ensure('hour_types', HT.map(([key, display_name, modality, sort_order], i) => ({ id: U(301 + i), key, display_name, modality, sort_order, is_active: true, created_at: TS('2026-01-10') })), 'key');
  const { data: htRows, error: htErr } = await sb.from('hour_types').select('id, key');
  if (htErr) throw new Error(`hour_types: ${htErr.message}`);
  const ht = Object.fromEntries(htRows.map((r) => [r.key, r.id]));

  // Contract FNE-2026-03-901 (148 h): one healthy bucket, one in warning (<25 % left, incl. +20 h of the annex),
  // one exhausted, one fixed LMS bucket. Contract FNE-2026-05-902 (88 h) has no distribution yet (assign form).
  const al = (id, contrato_id, key, hours, extra = {}) => ({ id: U(id), contrato_id, hour_type_id: ht[key], allocated_hours: hours, is_fixed_allocation: false, adds_to_allocation_id: null, created_by: admin, created_at: TS('2026-03-09', '12:00:00'), ...extra });
  await ensure('contract_hour_allocations', [
    al(311, CTR.main, 'online_learning', 24, { is_fixed_allocation: true }),
    al(312, CTR.main, 'asesoria_tecnica_presencial', 60),
    al(313, CTR.main, 'asesoria_directiva_online', 40),
    al(314, CTR.main, 'talleres_presenciales', 24),
  ]);
  await ensure('contract_hour_allocations', [
    al(321, CTR.annex, 'asesoria_tecnica_presencial', 20, { adds_to_allocation_id: U(312), created_at: TS('2026-08-05', '10:00:00') }),
  ]);
  // The service role may insert only some ledger columns (supabase/migrations/20260813120800_…): no id and no
  // recorded_at (it takes the real clock on the first run). Rows are therefore looked up by allocation + note.
  const led = (allocation_id, hours, status, session_date, notes) => ({ allocation_id, session_id: null, hours, status, session_date, is_over_budget: false, is_manual: true, recorded_by: admin, notes });
  const ledger = [
    led(U(312), 30, 'consumida', '2026-04-20', 'Jornadas de asesoría técnica presencial, primer semestre'),
    led(U(312), 22, 'consumida', '2026-08-24', 'Visitas de acompañamiento al aula, agosto'),
    led(U(312), 2, 'penalizada', '2026-09-07', 'Sesión cancelada con menos de 48 horas de aviso (cláusula 7)'),
    led(U(312), 8, 'reservada', '2030-03-18', 'Jornadas programadas para el inicio del año escolar'),
    led(U(312), 4, 'devuelta', '2026-09-28', 'Sesión reprogramada: horas devueltas a la bolsa'),
    led(U(313), 40, 'consumida', '2026-10-05', 'Ciclo completo de asesoría directiva en línea'),
    led(U(314), 6, 'consumida', '2026-05-18', 'Taller presencial de evaluación formativa'),
    led(U(314), 4, 'reservada', '2030-04-06', 'Taller de cierre programado'),
  ];
  const { data: haveLed, error: ledErr } = await sb.from('contract_hours_ledger').select('allocation_id, notes').in('allocation_id', [U(312), U(313), U(314)]);
  if (ledErr) throw new Error(`contract_hours_ledger (look): ${ledErr.message}`);
  const seen = new Set(haveLed.map((r) => `${r.allocation_id}|${r.notes}`));
  const missingLed = ledger.filter((r) => !seen.has(`${r.allocation_id}|${r.notes}`));
  if (missingLed.length) {
    const { error } = await sb.from('contract_hours_ledger').insert(missingLed);
    if (error) throw new Error(`contract_hours_ledger (insert): ${error.message}`);
  }
}

// ---------------------------------------------------------------- /admin/quotes, /admin/quotes/[id]/edit, /quote/[id]
// One quote per status (draft, sent, viewed, accepted, rejected, expired); two use travel groups. Totals are left to
// the table's triggers, as when createV2 inserts. Group quotes get their updated_at from the trigger the group
// insert fires (real clock, first run only).
async function seedQuotes(admin) {
  const PP = { inmersion: U(401), liderazgo: U(402), comunidades: U(403) };
  await ensure('pasantias_programs', [
    { id: PP.inmersion, name: 'Inmersión Pedagógica Sintética (5 días)', description: 'Visitas a escuelas, observación de aula y talleres con equipos docentes anfitriones.', price: 1850000, display_order: 1, is_active: true, created_at: TS('2026-06-01'), updated_at: TS('2026-06-01') },
    { id: PP.liderazgo, name: 'Liderazgo Escolar Sintético (3 días)', description: 'Encuentros con equipos directivos y sesiones de diseño de la estrategia de cambio.', price: 1200000, display_order: 2, is_active: true, created_at: TS('2026-06-01'), updated_at: TS('2026-06-01') },
    { id: PP.comunidades, name: 'Comunidades de Aprendizaje Sintéticas (2 días)', description: 'Trabajo con comunidades de crecimiento y redes de escuelas.', price: 650000, display_order: 3, is_active: true, created_at: TS('2026-06-01'), updated_at: TS('2026-06-01') },
  ]);

  const qt = (o) => ({ flight_price: 0, single_room_price: 150000, double_room_price: 100000, use_groups: false, apply_early_bird_discount: false, created_by: admin, updated_by: admin, ...o });
  await ensure('pasantias_quotes', [
    qt({ id: QUO.draft, quote_number: 9950001, status: 'draft', client_name: 'Equipo Directivo Sintético E2E', client_email: 'direccion.e2e@example.com', client_phone: '+56 2 2990 0501', client_institution: 'Colegio Sintetico E2E', arrival_date: '2027-01-11', departure_date: '2027-01-16', flight_price: 890000, flight_notes: 'Tramo Santiago–Barcelona ida y vuelta, tarifa referencial.', room_type: 'double', num_pasantes: 4, selected_programs: [PP.inmersion], notes: 'Incluye traslados internos y materiales de trabajo.', internal_notes: 'Confirmar tarifa aérea antes de enviar.', valid_until: '2026-12-15', created_at: TS('2026-11-02', '09:40:00'), updated_at: TS('2026-11-02', '09:40:00') }),
    qt({ id: QUO.sent, quote_number: 9950002, status: 'sent', client_name: 'Red Sintética de Escuelas del Sur E2E', client_email: 'red.sur.e2e@example.com', client_phone: '+56 63 299 0601', client_institution: 'Red Sintética de Escuelas del Sur', use_groups: true, arrival_date: '2027-01-18', departure_date: '2027-01-18', room_type: 'double', num_pasantes: 1, selected_programs: [PP.inmersion, PP.comunidades], notes: 'Dos grupos con fechas de llegada distintas.', valid_until: '2026-12-15', created_at: TS('2026-10-28', '16:00:00'), updated_at: TS('2026-10-28', '16:00:00') }),
    qt({ id: QUO.viewed, quote_number: 9950003, status: 'viewed', viewed_at: TS('2026-11-04', '08:12:00'), client_name: 'Corporación Sintética del Norte E2E', client_email: 'coordinacion.norte.e2e@example.com', client_phone: '+56 55 299 0503', client_institution: 'Colegio Sintetico E2E Norte', use_groups: true, arrival_date: '2027-01-11', departure_date: '2027-01-11', room_type: 'double', num_pasantes: 1, selected_programs: [PP.inmersion, PP.liderazgo], apply_early_bird_discount: true, early_bird_payment_date: '2026-11-30', viaticos_type: 'daily', viaticos_amount: 45000, notes: 'Programa combinado para docentes y equipo directivo. Precios en pesos chilenos.', valid_until: '2026-12-15', created_at: TS('2026-10-30', '11:00:00'), updated_at: TS('2026-10-30', '11:00:00') }),
    qt({ id: QUO.accepted, quote_number: 9950004, status: 'accepted', viewed_at: TS('2026-10-08', '10:00:00'), accepted_at: TS('2026-10-14', '12:30:00'), client_name: 'Fundación Sintética Mar Azul E2E', client_email: 'utp.marazul.e2e@example.com', client_institution: 'Escuela Sintética Mar Azul', arrival_date: '2027-01-25', departure_date: '2027-01-29', flight_price: 920000, room_type: 'single', num_pasantes: 2, selected_programs: [PP.liderazgo], viaticos_type: 'total', viaticos_amount: 180000, notes: 'Pasantía para la directora y la jefa de UTP.', valid_until: '2026-10-31', created_at: TS('2026-10-06', '15:20:00'), updated_at: TS('2026-10-14', '12:30:00') }),
    qt({ id: QUO.rejected, quote_number: 9950005, status: 'rejected', viewed_at: TS('2026-09-20', '09:00:00'), client_name: 'Colegio Sintético Los Aromos', client_email: 'contabilidad.aromos.e2e@example.com', client_institution: 'Colegio Sintético Los Aromos', arrival_date: '2027-01-11', departure_date: '2027-01-14', flight_price: 870000, room_type: 'double', num_pasantes: 6, selected_programs: [PP.comunidades], internal_notes: 'El sostenedor postergó la pasantía para 2028.', valid_until: '2026-10-15', created_at: TS('2026-09-15', '10:10:00'), updated_at: TS('2026-09-29', '10:10:00') }),
    qt({ id: QUO.expired, quote_number: 9950006, status: 'expired', client_name: 'Liceo Sintético Bicentenario E2E', client_email: 'liceo.bicentenario.e2e@example.com', client_institution: 'Liceo Sintético Bicentenario E2E', arrival_date: '2026-07-06', departure_date: '2026-07-10', flight_price: 850000, room_type: 'double', num_pasantes: 3, selected_programs: [PP.inmersion, PP.liderazgo], valid_until: '2026-05-31', created_at: TS('2026-05-04', '13:00:00'), updated_at: TS('2026-06-01', '00:05:00') }),
  ]);
  const gr = (id, quote_id, group_name, num_participants, arrival_date, departure_date, flight_price, room_type, room_price_per_night, at) => ({ id: U(id), quote_id, group_name, num_participants, arrival_date, departure_date, flight_price, room_type, room_price_per_night, created_at: at, updated_at: at });
  await ensure('pasantias_quote_groups', [
    gr(431, QUO.sent, 'Grupo docentes', 8, '2027-01-18', '2027-01-23', 880000, 'double', 100000, TS('2026-10-28', '16:00:00')),
    gr(432, QUO.sent, 'Grupo directivos', 3, '2027-01-20', '2027-01-23', 880000, 'single', 150000, TS('2026-10-28', '16:00:00')),
    gr(433, QUO.viewed, 'Docentes primer ciclo', 6, '2027-01-11', '2027-01-16', 905000, 'double', 100000, TS('2026-10-30', '11:00:00')),
    gr(434, QUO.viewed, 'Equipo directivo', 2, '2027-01-13', '2027-01-16', 905000, 'single', 150000, TS('2026-10-30', '11:00:00')),
  ]);
}

// ---------------------------------------------------------------- /admin/licitaciones/feriados (and every timeline)
// Chilean public holidays 2026 (public calendar) plus 1 January 2027. Looked up by date (unique).
async function seedFeriados() {
  const F = [
    ['2026-01-01', 'Año Nuevo'], ['2026-04-03', 'Viernes Santo'], ['2026-04-04', 'Sábado Santo'], ['2026-05-01', 'Día Nacional del Trabajo'],
    ['2026-05-21', 'Día de las Glorias Navales'], ['2026-06-21', 'Día Nacional de los Pueblos Indígenas'], ['2026-06-29', 'San Pedro y San Pablo'],
    ['2026-07-16', 'Día de la Virgen del Carmen'], ['2026-08-15', 'Asunción de la Virgen'], ['2026-09-18', 'Independencia Nacional'],
    ['2026-09-19', 'Día de las Glorias del Ejército'], ['2026-10-12', 'Encuentro de Dos Mundos'], ['2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes'],
    ['2026-11-01', 'Día de Todos los Santos'], ['2026-12-08', 'Inmaculada Concepción'], ['2026-12-25', 'Navidad'], ['2027-01-01', 'Año Nuevo'],
  ];
  await ensure('feriados_chile', F.map(([fecha, nombre], i) => ({ id: 9950000 + i, fecha, nombre, year: Number(fecha.slice(0, 4)), created_at: TS('2026-01-05') })), 'fecha');
  const { data, error } = await sb.from('feriados_chile').select('fecha').gte('year', 2025).lte('year', 2027);
  if (error) throw new Error(`feriados_chile: ${error.message}`);
  return new Set(data.map((r) => r.fecha));
}

// ---------------------------------------------------------------- /admin/licitaciones/criterios and /templates
// Four criteria per program (maxima add up to 100: the technical score is their sum), one inactive criterion,
// bases templates with versions (Evoluciona v1 inactive + v2 active); Comunidades has no template (empty state).
async function seedCriteriosYPlantillas(admin) {
  const CRIT = [
    ['Experiencia de la ATE en establecimientos similares', 30, 'Años de experiencia y número de establecimientos asesorados con características similares.'],
    ['Pertinencia de la propuesta metodológica', 35, 'Coherencia de la metodología con el PME y los objetivos de las bases.'],
    ['Calificación del equipo consultor', 20, 'Formación y trayectoria del equipo propuesto.'],
    ['Plan de trabajo y cronograma', 15, 'Claridad, factibilidad y calendarización de las actividades.'],
  ];
  const rows = []; const criterios = {};
  Object.values(PRG).forEach((pid, p) => {
    criterios[pid] = [];
    CRIT.forEach(([nombre_criterio, puntaje_maximo, descripcion], i) => {
      const id = U(1801 + p * 5 + i);
      criterios[pid].push({ id, max: puntaje_maximo });
      rows.push({ id, programa_id: pid, nombre_criterio, puntaje_maximo, descripcion, orden: i + 1, is_active: true, created_at: TS('2026-02-02') });
    });
  });
  rows.push({ id: U(1805), programa_id: PRG.evoluciona, nombre_criterio: 'Visita a terreno previa (criterio retirado)', puntaje_maximo: 10, descripcion: 'Se dejó de usar en las bases 2026.', orden: 5, is_active: false, created_at: TS('2025-03-02') });
  await ensure('programa_evaluacion_criterios', rows);

  const T = (id, programa_id, nombre_servicio, version, is_active, at) => ({
    id: U(id), programa_id, nombre_servicio, version, is_active, created_by: admin, created_at: TS(at), updated_at: TS(at),
    objetivo: `Asesorar al equipo directivo y a los líderes del establecimiento en ${nombre_servicio.toLowerCase()}, con foco en el aprendizaje profundo y en el enfoque relacional.`,
    objetivos_especificos: ['Diagnosticar la cultura relacional del establecimiento.', 'Fortalecer las capacidades de liderazgo del equipo directivo.', 'Acompañar la implementación de prácticas pedagógicas innovadoras en el aula.'],
    especificaciones_admin: { frecuencia: 'Dos visitas mensuales y sesiones en línea quincenales.', lugar: 'Dependencias del establecimiento y plataforma en línea.', contrapartes_tecnicas: 'Equipo directivo y jefatura técnica.', condiciones_pago: 'Tres cuotas contra entrega de informes de avance.' },
    resultados_esperados: ['Plan de mejora con metas de aprendizaje acordadas.', 'Comunidades de crecimiento docente funcionando de manera autónoma.', 'Informe final de resultados con recomendaciones.'],
    requisitos_ate: ['Inscripción vigente en el Registro ATE del MINEDUC.', 'Experiencia mínima de tres años en asesoría a establecimientos.', 'Equipo con al menos un profesional con postgrado en educación.'],
    documentos_adjuntar: ['Certificado de pertenencia al Registro ATE.', 'Propuesta técnica y económica.', 'Currículum del equipo consultor.'],
    condiciones_pago: version > 1 ? 'Pago en tres cuotas: 30 % al inicio, 40 % a mitad del programa y 30 % contra informe final.' : null,
  });
  await ensure('programa_bases_templates', [
    T(1821, PRG.evoluciona, 'Asesoría integral para una cultura de innovación educativa', 1, false, '2026-02-10'),
    T(1822, PRG.evoluciona, 'Asesoría integral para una cultura de innovación educativa', 2, true, '2026-06-15'),
    T(1823, PRG.preparacion, 'Preparación para el cambio de cultura escolar', 1, true, '2026-02-10'),
    T(1824, PRG.liderazgo, 'Liderazgo para el cambio de la cultura organizacional', 1, true, '2026-03-03'),
  ]);
  return criterios;
}

// ---------------------------------------------------------------- /licitaciones, /licitaciones/[id], /licitaciones/[id]/evaluacion
// The primary school (990001) has one licitación in every estado the table allows (no "desierta"/"cancelada" exist):
// borrador, publicacion_pendiente, recepcion_bases_pendiente, propuestas_pendientes, evaluacion_pendiente,
// adjudicacion_pendiente, contrato_pendiente, contrato_generado, adjudicada_externo, cerrada (after the workflow) and
// cerrada (historic import → archive view). One more of the secondary school (990002) that the encargado must not see.
// Timelines are computed as confirmPublicacion() does; every deadline the reminder check looks at in a live estado
// lies before 13 Nov 2026, so the reminder job never has anything to fire on a real day.
async function seedLicitaciones({ admin, encargado, holidays, criterios }) {
  const ATE = {
    fne: { nombre_ate: 'Fundación Nueva Educación', rut_ate: null, nombre_contacto: 'Coordinación de Licitaciones FNE', email: 'licitaciones.fne.e2e@example.com', telefono: '+56 2 2990 0700' },
    horizonte: { nombre_ate: 'Consultora Sintética Horizonte E2E SpA', rut_ate: rut(77990701), nombre_contacto: 'Ignacio Sintético Pérez', email: 'contacto.horizonte.e2e@example.com', telefono: '+56 9 9990 0701' },
    aprender: { nombre_ate: 'ATE Sintética Aprender Juntos E2E Ltda.', rut_ate: rut(77990702), nombre_contacto: 'Daniela Sintética Lagos', email: 'ate.aprender.e2e@example.com', telefono: '+56 9 9990 0702' },
    innova: { nombre_ate: 'Centro Sintético de Innovación Escolar E2E', rut_ate: rut(77990703), nombre_contacto: 'Felipe Sintético Contreras', email: 'centro.innova.e2e@example.com', telefono: '+56 9 9990 0703' },
  };
  // Technical scores per criterion (maxima 30/35/20/15) and the amount each ATE offers (UF).
  const OFFER = {
    fne: { tec: [27, 32, 18, 13], monto: 480 }, horizonte: { tec: [22, 25, 15, 11], monto: 420 },
    aprender: { tec: [18, 20, 12, 9], monto: 390 }, innova: { tec: [28, 33, 19, 14], monto: 455 },
  };
  const COMISION = [
    { nombre: 'Rosa Sintética Valdés', rut: rut(9990501), cargo: 'Directora' },
    { nombre: 'Tomás Sintético Rivas', rut: rut(12990801), cargo: 'Jefe de UTP' },
    { nombre: 'Elena Sintética Soto', rut: rut(13990802), cargo: 'Representante del sostenedor' },
  ];
  const ORDER = ['borrador', 'publicacion_pendiente', 'recepcion_bases_pendiente', 'propuestas_pendientes', 'evaluacion_pendiente', 'adjudicacion_pendiente', 'adjudicado', 'contrato_generado'];

  const L = [
    { id: LIC.borrador, estado: 'borrador', prog: 'comunidades', year: 2027, created: '2026-11-11', nombre: 'Comunidades de aprendizaje docente 2027' },
    { id: LIC.publicacion, estado: 'publicacion_pendiente', prog: 'liderazgo', year: 2027, created: '2026-11-09', nombre: 'Asesoría al equipo directivo — Liderazgo para el cambio 2027' },
    { id: LIC.recepcion, estado: 'recepcion_bases_pendiente', prog: 'preparacion', year: 2027, created: '2026-10-21', pub: '2026-10-26', nombre: 'Preparación para el cambio de cultura escolar 2027', ates: { fne: 'sent', horizonte: 'sent', aprender: 'requested' } },
    { id: LIC.propuestas, estado: 'propuestas_pendientes', prog: 'evoluciona', year: 2027, created: '2026-10-08', pub: '2026-10-14', nombre: 'Asesoría integral para una cultura de innovación educativa 2027', ates: { fne: 'proposal', horizonte: 'proposal', aprender: 'sent' } },
    { id: LIC.evaluacion, estado: 'evaluacion_pendiente', prog: 'comunidades', year: 2026, created: '2026-09-25', pub: '2026-10-01', nombre: 'Comunidades de aprendizaje docente, segundo semestre 2026', ates: { fne: 'proposal', horizonte: 'proposal', aprender: 'proposal' }, partialScores: ['fne', 'horizonte'] },
    { id: LIC.adjudicacion, estado: 'adjudicacion_pendiente', prog: 'liderazgo', year: 2026, created: '2026-09-15', pub: '2026-09-22', nombre: 'Asesoría al equipo directivo — Liderazgo para el cambio 2026', ates: { fne: 'proposal', horizonte: 'proposal', aprender: 'proposal' }, adjData: true },
    { id: LIC.contratoPend, estado: 'contrato_pendiente', prog: 'preparacion', year: 2026, created: '2026-08-31', pub: '2026-09-07', nombre: 'Preparación para el cambio de cultura escolar 2026', ates: { fne: 'proposal', horizonte: 'proposal' }, adjData: true, fne: true, carta: true },
    { id: LIC.contratoGen, estado: 'contrato_generado', prog: 'evoluciona', year: 2026, created: '2026-08-10', pub: '2026-08-17', nombre: 'Asesoría integral para una cultura de innovación educativa 2026', ates: { fne: 'proposal', horizonte: 'proposal', aprender: 'proposal' }, adjData: true, fne: true, carta: true, contrato: CTR.fromLic },
    { id: LIC.externo, estado: 'adjudicada_externo', prog: 'evoluciona', year: 2026, created: '2026-07-27', pub: '2026-08-03', nombre: 'Asesoría en convivencia escolar y clima de aula 2026', ates: { fne: 'proposal', innova: 'proposal', horizonte: 'proposal' }, adjData: true, fne: false, carta: true },
    { id: LIC.cerradaFlujo, estado: 'cerrada', prog: 'preparacion', year: 2026, created: '2026-06-29', pub: '2026-07-06', nombre: 'Formación de la generación tractor 2026', ates: { innova: 'proposal', fne: 'proposal' }, adjData: true, fne: false, carta: true, closed: true },
    { id: LIC.cerradaHist, estado: 'cerrada', prog: 'evoluciona', year: 2025, created: '2026-10-02', historic: { pub: '2025-03-10', adj: '2025-04-15', numero: 'LIC-2025-990001-H01' }, nombre: 'Asesoría integral para una cultura de innovación educativa 2025 (registro histórico)' },
    { id: LIC.norte, school: 990002, estado: 'propuestas_pendientes', prog: 'evoluciona', year: 2027, created: '2026-10-08', pub: '2026-10-14', nombre: 'Asesoría integral 2027 — Colegio Sintetico E2E Norte', ates: { fne: 'proposal' } },
  ];

  const lics = []; const ates = []; const docs = []; const consultas = []; const comision = []; const evals = []; const hist = []; const files = [];
  let seq = { 990001: { 2025: 0, 2026: 0, 2027: 0 }, 990002: { 2027: 0 } };
  let nAte = 1101; let nDoc = 1201; let nCons = 1301; let nCom = 1401; let nEval = 1501; let nHist = 1601;
  const H = (licId, at, accion, ant, nuevo, detalles, user) => hist.push({ id: U(nHist++), licitacion_id: licId, accion, estado_anterior: ant, estado_nuevo: nuevo, detalles: detalles ?? {}, user_id: user ?? admin, created_at: at });
  const D = (licId, tipo, nombre, path, file_name, buf, mime, at, user) => {
    files.push([path, buf, mime]);
    docs.push({ id: U(nDoc++), licitacion_id: licId, tipo, nombre, storage_path: path, file_name, file_size: buf.length, mime_type: mime, uploaded_by: user ?? admin, created_at: at });
  };

  for (const l of L) {
    const school = l.school ?? 990001;
    const programa_id = PRG[l.prog];
    const tecnica = l.prog === 'liderazgo' ? 60 : 70;
    seq[school][l.year] = (seq[school][l.year] ?? 0) + 1;
    const numero = l.historic?.numero ?? `LIC-${l.year}-${school}-${String(seq[school][l.year]).padStart(3, '0')}`;
    const tl = l.pub ? timeline(l.pub, holidays) : {};
    // Guard: deadlines the reminder job reads for this estado must be in the past.
    const watched = { recepcion_bases_pendiente: ['fecha_limite_solicitud_bases', 'fecha_limite_consultas'], propuestas_pendientes: ['fecha_limite_propuestas'], evaluacion_pendiente: ['fecha_limite_evaluacion'] }[l.estado] || [];
    for (const f of watched) if (!(tl[f] < '2026-11-13')) throw new Error(`${numero}: ${f} ${tl[f]} would be watched by the reminder job`);
    const created = TS(l.created, '09:30:00');
    const reached = l.estado === 'cerrada' || l.estado === 'adjudicada_externo' || l.estado === 'contrato_pendiente' ? 'adjudicado' : l.estado;
    const step = ORDER.indexOf(reached);
    const atesIn = Object.entries(l.ates || {});
    const fneWins = l.fne !== false;
    const winnerKey = atesIn.length ? (l.fne === false ? atesIn.find(([k]) => k !== 'fne')[0] : 'fne') : null;
    const evaluated = step >= ORDER.indexOf('adjudicacion_pendiente');

    // ---- the licitación row
    const row = {
      id: l.id, numero_licitacion: numero, school_id: school, cliente_id: school === 990001 ? CLI.e2e : CLI.norte, programa_id,
      nombre_licitacion: l.nombre, year: l.year, estado: l.estado,
      email_licitacion: school === 990001 ? 'licitaciones.e2e@example.com' : 'licitaciones.norte.e2e@example.com',
      monto_minimo: l.prog === 'liderazgo' ? 120 : 380, monto_maximo: l.prog === 'liderazgo' ? 180 : 520, tipo_moneda: 'UF',
      duracion_minima: l.prog === 'liderazgo' ? '4 meses' : '8 meses', duracion_maxima: l.prog === 'liderazgo' ? '6 meses' : '10 meses',
      peso_evaluacion_tecnica: tecnica, peso_evaluacion_economica: 100 - tecnica,
      participantes_estimados: l.prog === 'liderazgo' ? 8 : 35, modalidad_preferida: l.prog === 'comunidades' ? 'Virtual' : l.prog === 'liderazgo' ? 'Presencial' : 'Hibrido',
      notas: l.estado === 'borrador' ? 'Borrador interno: falta confirmar el presupuesto con el sostenedor.' : 'Financiamiento con recursos SEP.',
      fecha_publicacion: l.pub ?? null, ...tl,
      created_by: admin, created_at: created, updated_at: created,
    };
    if (l.historic) {
      Object.assign(row, { email_licitacion: null, monto_minimo: null, monto_maximo: null, duracion_minima: null, duracion_maxima: null, peso_evaluacion_tecnica: null, peso_evaluacion_economica: null, participantes_estimados: null, modalidad_preferida: null, notas: 'Registro histórico importado desde el archivo del establecimiento.', fecha_publicacion: l.historic.pub, fecha_adjudicacion: l.historic.adj, created_by: encargado });
    }

    // ---- history: creation and publication
    if (l.historic) {
      H(l.id, created, 'Licitacion historica registrada', null, 'cerrada', { numero_licitacion: numero, historica: true }, encargado);
    } else if (l.estado === 'borrador') {
      H(l.id, created, 'Licitacion creada', null, 'borrador', { numero_licitacion: numero });
    } else {
      H(l.id, created, 'Licitacion creada', null, 'publicacion_pendiente', { numero_licitacion: numero });
    }
    if (l.pub) {
      const imgPath = `licitaciones/${l.id}/${U(nDoc)}_afiche_publicacion.png`;
      D(l.id, 'publicacion_imagen', 'afiche_publicacion.png', imgPath, 'afiche_publicacion.png', png(320, 200), MIME.png, TS(l.pub, '10:00:00'));
      row.publicacion_imagen_url = imgPath;
      H(l.id, TS(l.pub, '10:00:00'), 'Documento subido: publicacion_imagen', 'publicacion_pendiente', 'publicacion_pendiente', { file_name: 'afiche_publicacion.png', tipo: 'publicacion_imagen' });
      H(l.id, TS(l.pub, '10:05:00'), 'Publicacion confirmada', 'publicacion_pendiente', 'recepcion_bases_pendiente', { fecha_publicacion: l.pub, ...tl });
      const basesName = `${l.pub}T12-00-00_${numero}_bases.docx`;
      D(l.id, 'bases_generadas', `Bases ${numero} — ${basesName}`, `licitaciones/${l.id}/bases_generadas/${basesName}`, basesName, docx(`Bases de licitación ${numero}`, [l.nombre, 'Documento sintético de prueba.']), MIME.docx, TS(l.pub, '12:00:00'));
      H(l.id, TS(l.pub, '12:00:00'), 'Bases generadas', 'recepcion_bases_pendiente', 'recepcion_bases_pendiente', { file_name: basesName });
    }

    // ---- ATEs (step 3: bases requested / sent; step 4: proposals received)
    const ateIds = {};
    for (const [k, how] of atesIn) {
      const id = U(nAte++); ateIds[k] = id;
      const a = { id, licitacion_id: l.id, ...ATE[k], fecha_solicitud_bases: addBusinessDays(l.pub, 1 + Object.keys(ateIds).length, holidays), es_ganador: false, created_at: TS(addBusinessDays(l.pub, 1 + Object.keys(ateIds).length, holidays), '11:00:00') };
      a.updated_at = a.created_at;
      H(l.id, a.created_at, `ATE registrada: ${a.nombre_ate}`, 'recepcion_bases_pendiente', 'recepcion_bases_pendiente', { ate_id: id });
      if (how !== 'requested') {
        a.fecha_envio_bases = addBusinessDays(a.fecha_solicitud_bases, 1, holidays);
        H(l.id, TS(a.fecha_envio_bases, '09:00:00'), `Bases enviadas a ATE: ${a.nombre_ate}`, 'recepcion_bases_pendiente', 'recepcion_bases_pendiente', { ate_id: id });
      }
      if (how === 'proposal') {
        const fname = `Propuesta_${a.nombre_ate.replace(/[^a-zA-Z0-9._\-]/g, '_')}.pdf`;
        const path = `licitaciones/${l.id}/propuestas/${id}/${U(nDoc)}_${fname}`;
        a.fecha_propuesta = tl.fecha_limite_propuestas;
        a.monto_propuesto = OFFER[k].monto;
        const buf = pdf(`Propuesta técnica y económica - ${a.nombre_ate}`, [l.nombre, `Monto ofertado: ${OFFER[k].monto} UF`, 'Documento sintético de prueba.']);
        Object.assign(a, { propuesta_url: path, propuesta_filename: fname, propuesta_size: buf.length, propuesta_mime_type: MIME.pdf });
        D(l.id, 'propuesta', `Propuesta ${a.nombre_ate}`, path, fname, buf, MIME.pdf, TS(a.fecha_propuesta, '16:00:00'));
        H(l.id, TS(a.fecha_propuesta, '16:00:00'), `Propuesta recibida de ATE: ${a.nombre_ate}`, 'propuestas_pendientes', 'propuestas_pendientes', { ate_id: id, file_name: fname, file_size: buf.length });
      }
      ates.push(a);
    }
    if (atesIn.length && l.estado !== 'recepcion_bases_pendiente') {
      H(l.id, TS(tl.fecha_limite_consultas, '18:00:00'), 'Avanzado a Recepcion de Propuestas', 'recepcion_bases_pendiente', 'propuestas_pendientes', {});
    }
    // Consultas (questions from ATEs during the bases period)
    if (atesIn.length >= 2) {
      const [k1, k2] = Object.keys(ateIds);
      consultas.push({ id: U(nCons++), licitacion_id: l.id, ate_id: ateIds[k1], pregunta: '¿Las horas en línea pueden realizarse fuera de la jornada escolar?', respuesta: 'Sí, siempre que se acuerden con el equipo directivo y no superen el 40 % del total.', fecha_pregunta: addBusinessDays(l.pub, 6, holidays), fecha_respuesta: tl.fecha_limite_consultas, created_at: TS(addBusinessDays(l.pub, 6, holidays), '12:00:00') });
      consultas.push({ id: U(nCons++), licitacion_id: l.id, ate_id: ateIds[k2], pregunta: '¿Se debe incluir el costo de los materiales en la propuesta económica?', respuesta: l.estado === 'recepcion_bases_pendiente' ? null : 'Sí, la propuesta económica debe incluir todos los costos asociados.', fecha_pregunta: addBusinessDays(l.pub, 7, holidays), fecha_respuesta: l.estado === 'recepcion_bases_pendiente' ? null : tl.fecha_limite_consultas, created_at: TS(addBusinessDays(l.pub, 7, holidays), '15:30:00') });
      H(l.id, TS(addBusinessDays(l.pub, 6, holidays), '12:00:00'), 'Consulta registrada', 'recepcion_bases_pendiente', 'recepcion_bases_pendiente', {});
    }

    // ---- step 5: committee, scores, economic and weighted scores (lib/evaluacionService.ts)
    const scored = evaluated ? Object.keys(ateIds).filter((k) => atesIn.find(([kk]) => kk === k)[1] === 'proposal') : (l.partialScores || []);
    if (step >= ORDER.indexOf('propuestas_pendientes') && l.estado !== 'propuestas_pendientes' && atesIn.length) {
      H(l.id, TS(tl.fecha_limite_propuestas, '18:00:00'), 'Avanzado a Evaluacion Pendiente', 'propuestas_pendientes', 'evaluacion_pendiente', {});
    }
    if (scored.length) {
      const evalDate = l.estado === 'evaluacion_pendiente' ? tl.fecha_limite_evaluacion : addBusinessDays(tl.fecha_limite_propuestas, 2, holidays);
      COMISION.forEach((m, i) => comision.push({ id: U(nCom++), licitacion_id: l.id, ...m, orden: i + 1, created_at: TS(evalDate, '09:00:00') }));
      row.hora_inicio_evaluacion = '09:00'; row.hora_fin_evaluacion = '11:30';
      // External winners get the better technical score so that the ranking agrees with the outcome.
      const tecOf = (k) => (l.fne === false && k === 'fne' ? [20, 24, 14, 10] : OFFER[k].tec);
      for (const k of scored) {
        criterios[programa_id].forEach((c, i) => evals.push({ id: U(nEval++), licitacion_id: l.id, ate_id: ateIds[k], criterio_id: c.id, puntaje: tecOf(k)[i], comentario: i === 1 ? 'Propuesta coherente con el PME del establecimiento.' : null, evaluado_por: admin, created_at: TS(evalDate, '10:30:00') }));
      }
      if (evaluated) {
        const eco = economicScores(scored.map((k) => ({ id: k, monto: OFFER[k].monto })));
        const calc = scored.map((k) => {
          const tec = tecOf(k).reduce((s, x) => s + x, 0);
          return { k, puntaje_tecnico: tec, puntaje_economico: eco[k], ...weighted(tec, eco[k], tecnica, 100 - tecnica) };
        });
        const top = Math.max(...calc.map((c) => c.puntaje_total));
        const best = calc.find((c) => c.puntaje_total === top).k;
        if (best !== winnerKey) throw new Error(`${numero}: scores rank ${best} first, expected ${winnerKey}`);
        for (const c of calc) Object.assign(ates.find((a) => a.id === ateIds[c.k]), { puntaje_tecnico: c.puntaje_tecnico, puntaje_economico: c.puntaje_economico, puntaje_tecnico_ponderado: c.puntaje_tecnico_ponderado, puntaje_economico_ponderado: c.puntaje_economico_ponderado, puntaje_total: c.puntaje_total, es_ganador: c.puntaje_total === top });
        row.ganador_ate_id = ateIds[winnerKey];
      }
      H(l.id, TS(evalDate, '11:30:00'), 'Evaluacion guardada', 'evaluacion_pendiente', 'evaluacion_pendiente', { scores_count: scored.length * 4, montos_count: evaluated ? scored.length : 0 });
      if (evaluated) {
        const actaName = `${evalDate}T11-45-00_${numero}_acta-reunion.docx`;
        D(l.id, 'evaluacion_generada', `Acta de Reunion ${numero} — ${actaName}`, `licitaciones/${l.id}/evaluacion/${actaName}`, actaName, docx(`Acta de reunión de evaluación ${numero}`, ['Comisión evaluadora: Directora, Jefe de UTP y representante del sostenedor.', 'Documento sintético de prueba.']), MIME.docx, TS(evalDate, '11:45:00'));
        H(l.id, TS(evalDate, '11:45:00'), 'Acta de Reunion generada', 'evaluacion_pendiente', 'evaluacion_pendiente', { file_name: actaName });
        const signed = pdf(`Acta de evaluación firmada ${numero}`, ['Firmada por la comisión evaluadora.', 'Documento sintético de prueba.']);
        D(l.id, 'evaluacion_firmada', 'Acta_evaluacion_firmada.pdf', `licitaciones/${l.id}/${U(nDoc)}_Acta_evaluacion_firmada.pdf`, 'Acta_evaluacion_firmada.pdf', signed, MIME.pdf, TS(evalDate, '17:00:00'));
        H(l.id, TS(evalDate, '17:00:00'), 'Documento subido: evaluacion_firmada', 'evaluacion_pendiente', 'evaluacion_pendiente', { file_name: 'Acta_evaluacion_firmada.pdf', tipo: 'evaluacion_firmada' });
        H(l.id, TS(evalDate, '17:05:00'), 'Avanzado a Adjudicacion Pendiente', 'evaluacion_pendiente', 'adjudicacion_pendiente', {});
      }
    }

    // ---- step 6: adjudication data, award letter (generated and signed while adjudicacion_pendiente), confirmation
    let adjudicada = null;
    if (l.adjData) {
      const w = ates.find((a) => a.id === ateIds[winnerKey]);
      Object.assign(row, { monto_adjudicado_uf: w.monto_propuesto, condiciones_pago: 'Tres cuotas iguales contra entrega de informes de avance (30, 60 y 90 días).', fecha_oferta_ganadora: w.fecha_propuesta, contacto_coordinacion_nombre: w.nombre_contacto, contacto_coordinacion_email: w.email, contacto_coordinacion_telefono: w.telefono });
      const adjDataDate = addBusinessDays(tl.fecha_limite_evaluacion, 1, holidays);
      H(l.id, TS(adjDataDate, '12:00:00'), 'Datos de adjudicacion guardados', 'adjudicacion_pendiente', 'adjudicacion_pendiente', { ganador_ate_id: w.id });
      if (l.carta) {
        const cartaDate = addBusinessDays(adjDataDate, 1, holidays);
        const firmaDate = addBusinessDays(cartaDate, 1, holidays);
        adjudicada = addBusinessDays(firmaDate, 1, holidays);
        const cartaName = `${cartaDate}T10-30-00_${numero}_carta-adjudicacion.docx`;
        const cartaPath = `licitaciones/${l.id}/adjudicacion/${cartaName}`;
        D(l.id, 'carta_adjudicacion_generada', `Carta Adjudicacion ${numero} — ${cartaName}`, cartaPath, cartaName, docx(`Carta de adjudicación ${numero}`, [`Adjudicada a: ${w.nombre_ate}`, 'Documento sintético de prueba.']), MIME.docx, TS(cartaDate, '10:30:00'));
        row.carta_adjudicacion_url = cartaPath;
        H(l.id, TS(cartaDate, '10:30:00'), 'Carta de Adjudicacion generada', 'adjudicacion_pendiente', 'adjudicacion_pendiente', { file_name: cartaName, storage_path: cartaPath });
        const firmada = pdf(`Carta de adjudicación firmada ${numero}`, ['Firmada por la dirección del establecimiento.', 'Documento sintético de prueba.']);
        D(l.id, 'carta_adjudicacion_firmada', 'Carta_adjudicacion_firmada.pdf', `licitaciones/${l.id}/${U(nDoc)}_Carta_adjudicacion_firmada.pdf`, 'Carta_adjudicacion_firmada.pdf', firmada, MIME.pdf, TS(firmaDate, '15:00:00'), encargado);
        H(l.id, TS(firmaDate, '15:00:00'), 'Documento subido: carta_adjudicacion_firmada', 'adjudicacion_pendiente', 'adjudicacion_pendiente', { file_name: 'Carta_adjudicacion_firmada.pdf', tipo: 'carta_adjudicacion_firmada', file_size: firmada.length }, encargado);
        row.fecha_adjudicacion = adjudicada; row.ganador_es_fne = fneWins;
        H(l.id, TS(adjudicada, '10:00:00'), fneWins ? 'Adjudicada a ATE FNE — avanzado a Contrato Pendiente' : 'Adjudicada a proveedor externo', 'adjudicacion_pendiente', fneWins ? 'contrato_pendiente' : 'adjudicada_externo', { es_fne: fneWins });
      }
    }
    // ---- step 7: contract (FNE winner) or closing (external winner)
    if (l.contrato) {
      if (!(adjudicada < '2026-10-20')) throw new Error(`${numero}: adjudicated ${adjudicada}, after its contract`);
      row.contrato_id = l.contrato;
      H(l.id, TS('2026-10-20', '17:12:00'), 'Contrato generado y vinculado', 'contrato_pendiente', 'contrato_generado', { contrato_id: l.contrato });
    }
    if (l.closed) H(l.id, TS(addBusinessDays(adjudicada, 4, holidays), '09:00:00'), 'Licitacion cerrada (proveedor externo)', 'adjudicada_externo', 'cerrada', {});

    // ---- historic import (archive view): the documents of the paper process
    if (l.historic) {
      const at = TS(l.created, '10:00:00');
      D(l.id, 'bases_enviadas', 'Bases_licitacion_2025.pdf', `licitaciones/${l.id}/${U(nDoc)}_Bases_licitacion_2025.pdf`, 'Bases_licitacion_2025.pdf', pdf(`Bases de licitación ${numero}`, ['Registro histórico 2025.', 'Documento sintético de prueba.']), MIME.pdf, at, encargado);
      D(l.id, 'evaluacion_firmada', 'Acta_evaluacion_2025.pdf', `licitaciones/${l.id}/${U(nDoc)}_Acta_evaluacion_2025.pdf`, 'Acta_evaluacion_2025.pdf', pdf(`Acta de evaluación ${numero}`, ['Registro histórico 2025.']), MIME.pdf, at, encargado);
      D(l.id, 'carta_adjudicacion_firmada', 'Carta_adjudicacion_2025.pdf', `licitaciones/${l.id}/${U(nDoc)}_Carta_adjudicacion_2025.pdf`, 'Carta_adjudicacion_2025.pdf', pdf(`Carta de adjudicación ${numero}`, ['Registro histórico 2025.']), MIME.pdf, at, encargado);
      D(l.id, 'otro', 'Contrato_firmado_2025.pdf', `licitaciones/${l.id}/${U(nDoc)}_Contrato_firmado_2025.pdf`, 'Contrato_firmado_2025.pdf', pdf(`Contrato 2025 ${numero}`, ['Registro histórico 2025.']), MIME.pdf, at, encargado);
      for (const t of ['bases_enviadas', 'evaluacion_firmada', 'carta_adjudicacion_firmada', 'otro']) H(l.id, at, `Documento subido: ${t}`, 'cerrada', 'cerrada', { tipo: t }, encargado);
    }
    lics.push(row);
  }

  for (const [path, buf, mime] of files) await put('licitaciones', path, buf, mime);
  await ensure('licitaciones', lics);
  await ensure('licitacion_ates', ates);
  await ensure('licitacion_documentos', docs);
  await ensure('licitacion_consultas', consultas);
  await ensure('licitacion_comision', comision);
  await ensure('licitacion_evaluaciones', evals);
  await ensure('licitacion_historial', hist);
}

// ---------------------------------------------------------------- /admin/licitaciones/consultores, /documentos-propuesta,
// the proposal panel of /licitaciones/[id] and /propuesta/[slug]
// Consultant library (three categories), document library (no expiry, valid until 2030, expired), one service card
// (ficha), one template with its content blocks, and two generated proposals of the 2027 Evoluciona licitación:
// v1 already opened by the school ('viewed'), v2 published (the address in params).
async function seedPropuestas(admin) {
  const CONS = [
    { id: U(1901), nombre: 'Carolina Sintética Fernández', titulo: 'Directora de programa y asesora directiva', categoria: 'comite_internacional', perfil_profesional: 'Psicóloga organizacional con veinte años de experiencia en procesos de cambio cultural en escuelas. Acompaña a equipos directivos en el diseño de estrategias de mejora centradas en las relaciones y el aprendizaje profundo.', formacion_academica: [{ year: 2009, institution: 'Universidad Sintética de Santiago', degree: 'Doctorado en Ciencias de la Educación' }, { year: 1999, institution: 'Universidad Sintética del Pacífico', degree: 'Psicóloga' }], experiencia_profesional: [{ empresa: 'Fundación Nueva Educación', cargo: 'Directora de programa', funcion: 'Dirección metodológica de las asesorías ATE' }, { empresa: 'Instituto Sintético de Liderazgo Escolar', cargo: 'Investigadora asociada', funcion: 'Estudios sobre cultura organizacional escolar' }], especialidades: ['Gestión del cambio', 'Liderazgo educativo', 'Educación relacional'], orden: 1 },
    { id: U(1902), nombre: 'Matías Sintético Herrera', titulo: 'Asesor técnico pedagógico', categoria: 'equipo_fne', perfil_profesional: 'Profesor de Historia con postítulo en evaluación para el aprendizaje. Ha acompañado a más de treinta comunidades docentes en la implementación de proyectos interdisciplinarios.', formacion_academica: [{ year: 2015, institution: 'Universidad Sintética Metropolitana', degree: 'Magíster en Currículum y Evaluación' }], experiencia_profesional: [{ empresa: 'Fundación Nueva Educación', cargo: 'Asesor ATE', funcion: 'Acompañamiento en aula y talleres docentes' }], especialidades: ['Aprendizaje basado en proyectos', 'Evaluación formativa'], orden: 2 },
    { id: U(1903), nombre: 'Javiera Sintética Ortiz', titulo: 'Asesora en convivencia escolar', categoria: 'equipo_fne', perfil_profesional: 'Trabajadora social especializada en convivencia escolar y trabajo con familias.', formacion_academica: [{ year: 2017, institution: 'Universidad Sintética del Maule', degree: 'Magíster en Convivencia Escolar' }], experiencia_profesional: [{ empresa: 'Fundación Nueva Educación', cargo: 'Asesora ATE', funcion: 'Diagnóstico relacional y planes de convivencia' }], especialidades: ['Convivencia escolar', 'Clima relacional'], orden: 3 },
    { id: U(1904), nombre: 'Martí Sintètic Puig', titulo: 'Asesor internacional en innovación educativa', categoria: 'asesor_internacional', perfil_profesional: 'Maestro y formador de docentes en redes de escuelas innovadoras de Europa.', formacion_academica: [{ year: 2005, institution: 'Universitat Sintètica de Catalunya', degree: 'Máster en Innovación Educativa' }], experiencia_profesional: [{ empresa: 'Red Sintética de Escuelas Abiertas', cargo: 'Formador', funcion: 'Estadías pedagógicas y mentorías' }], especialidades: ['Innovación educativa', 'Estadías pedagógicas'], orden: 4 },
  ].map((c) => ({ referencias: null, foto_path: null, cv_pdf_path: null, activo: true, created_at: TS('2026-04-06'), updated_at: TS('2026-04-06'), ...c }));
  // One consultant with a CV on file.
  const cvPath = 'consultores/e2e-5eed0050/cv-carolina-sintetica.pdf';
  await put('propuestas', cvPath, pdf('Currículum - Carolina Sintética Fernández', ['Perfil sintético de prueba.']), MIME.pdf);
  CONS[0].cv_pdf_path = cvPath;
  await ensure('propuesta_consultores', CONS);

  const DOCS = [
    { id: U(1911), nombre: 'Certificado de Pertenencia ATE (sintético)', tipo: 'certificado_pertenencia', descripcion: 'Certificado de pertenencia al Registro ATE, emisión de prueba vigente.', archivo_path: 'documentos/certificado_pertenencia/e2e-certificado-vigente.pdf', fecha_emision: '2026-11-02', fecha_vencimiento: '2030-12-02' },
    { id: U(1912), nombre: 'Certificado de Pertenencia ATE — emisión anterior (sintético)', tipo: 'certificado_pertenencia', descripcion: 'Emisión anterior, ya vencida. No puede incluirse en una propuesta.', archivo_path: 'documentos/certificado_pertenencia/e2e-certificado-anterior.pdf', fecha_emision: '2026-09-01', fecha_vencimiento: '2026-10-01' },
    { id: U(1913), nombre: 'Ficha de Servicio — Folio 9950201 (sintética)', tipo: 'ficha_servicio', descripcion: 'Ficha de servicio de la asesoría integral, 148 horas.', archivo_path: 'documentos/ficha_servicio/e2e-ficha-9950201.pdf', fecha_emision: null, fecha_vencimiento: null },
    { id: U(1914), nombre: 'Evaluaciones de clientes 2025 (sintéticas)', tipo: 'evaluaciones_clientes', descripcion: 'Resumen de evaluaciones de establecimientos atendidos.', archivo_path: 'documentos/evaluaciones_clientes/e2e-evaluaciones-2025.pdf', fecha_emision: null, fecha_vencimiento: null },
    { id: U(1915), nombre: 'Carta de recomendación — Escuela Sintética Mar Azul', tipo: 'carta_recomendacion', descripcion: 'Carta de recomendación emitida en marzo de 2026.', archivo_path: 'documentos/carta_recomendacion/e2e-carta-mar-azul.pdf', fecha_emision: '2026-03-20', fecha_vencimiento: null },
  ].map((d) => ({ activo: true, created_at: TS('2026-04-06'), updated_at: TS('2026-04-06'), ...d }));
  for (const d of DOCS) await put('propuestas', d.archivo_path, pdf(d.nombre, [d.descripcion, 'Documento sintético de prueba.']), MIME.pdf);
  await ensure('propuesta_documentos_biblioteca', DOCS);

  const FICHA = { id: U(1921), folio: 9950201, nombre_servicio: 'Asesoría integral para desarrollar una cultura de innovación educativa (sintética)', dimension: 'Liderazgo', categoria: 'Asesoría', horas_presenciales: 80, horas_no_presenciales: 68, total_horas: 148, destinatarios: ['Docentes', 'Directores', 'Sostenedores', 'Asistentes de la Educación'], objetivo_general: 'Instalar en el establecimiento una cultura de innovación centrada en el aprendizaje profundo y en las relaciones.', metodologia: 'Asesoría por fases: inicia, inspira y evoluciona.', equipo_trabajo: null, fecha_inscripcion: '2024-07-15', activo: true, created_at: TS('2026-04-06') };
  await ensure('propuesta_fichas_servicio', [FICHA]);

  const sec = (heading, paragraph, items) => ({ sections: [{ type: 'heading', text: heading, level: 1 }, { type: 'paragraph', text: paragraph }, ...(items ? [{ type: 'list', items }] : [])] });
  const BLOQUES = [
    { id: U(1941), clave: 'e2e_educacion_relacional', titulo: 'Modelo de Educación Relacional', contenido: sec('Educación Relacional', 'Entendemos el aprendizaje como un fenómeno relacional: la calidad de los vínculos en la comunidad escolar determina la calidad de lo que se aprende.', ['Relaciones de confianza entre docentes y estudiantes', 'Equipos directivos que lideran desde el acompañamiento', 'Familias como parte de la comunidad de aprendizaje']), programa_tipo: null, orden: 1 },
    { id: U(1942), clave: 'e2e_modelo_fases', titulo: 'Modelo de Consultoría por Fases', contenido: sec('Nuestro modelo de consultoría', 'La asesoría avanza en tres fases —Inicia, Inspira y Evoluciona— que van del diagnóstico compartido a la autonomía de la comunidad.', ['Inicia: diagnóstico y acuerdos', 'Inspira: formación y experiencias', 'Evoluciona: implementación sostenida']), programa_tipo: null, orden: 2 },
    { id: U(1943), clave: 'e2e_acompanamiento', titulo: 'Acompañamiento Técnico Pedagógico', contenido: sec('Acompañamiento en aula', 'Visitas de acompañamiento, retroalimentación entre pares y comunidades de crecimiento docente durante todo el año escolar.'), programa_tipo: 'evoluciona', orden: 3 },
  ].map((b) => ({ imagenes: null, activo: true, created_at: TS('2026-04-06'), updated_at: TS('2026-04-06'), ...b }));
  await ensure('propuesta_contenido_bloques', BLOQUES);

  const CONFIG_DEFAULT = { horas_presenciales: 80, horas_sincronicas: 44, horas_asincronicas: 24, plataforma: true, precio_modelo: 'per_hour', precio_uf: 3.2, forma_pago: '3 cuotas iguales' };
  await ensure('propuesta_plantillas', [{ id: U(1931), nombre: 'Programa Evoluciona 148h (sintética)', tipo_servicio: 'evoluciona', ficha_id: FICHA.id, bloques_orden: BLOQUES.map((b) => b.clave), horas_default: 148, configuracion_default: CONFIG_DEFAULT, activo: true, created_at: TS('2026-04-06') }]);

  // ---- two generated proposals for LIC.propuestas (Evoluciona 2027), built like generate-propuesta.ts
  const { data: lic, error: licErr } = await sb.from('licitaciones').select('id, numero_licitacion, nombre_licitacion, year').eq('id', LIC.propuestas).single();
  if (licErr) throw new Error(`licitacion for proposal: ${licErr.message}`);
  const modules = [
    { nombre: 'Inicia: diagnóstico relacional y acuerdos', horas_presenciales: 20, horas_sincronicas: 8, horas_asincronicas: 0, mes: 3 },
    { nombre: 'Inspira: formación de la generación tractor', horas_presenciales: 32, horas_sincronicas: 16, horas_asincronicas: 12, mes: 5 },
    { nombre: 'Evoluciona: acompañamiento e implementación', horas_presenciales: 28, horas_sincronicas: 20, horas_asincronicas: 12, mes: 8 },
  ];
  const selectedDocs = DOCS.filter((d) => [U(1911), U(1913), U(1914), U(1915)].includes(d.id));
  const snapshot = (version, generatedAt) => ({
    version, generatedAt, type: 'evoluciona', schoolName: 'Colegio Sintetico E2E', schoolLogoPath: null, programYear: 2027,
    serviceName: 'Asesoría integral para una cultura de innovación educativa', startMonth: 3, duration: 9,
    destinatarios: ['Docentes', 'Directores', 'Asistentes de la Educación'],
    consultants: CONS.slice(0, 3).map((c) => ({ nombre: c.nombre, titulo: c.titulo, bio: c.perfil_profesional, categoria: c.categoria, fotoPath: null, cvPath: c.cv_pdf_path, formacion: c.formacion_academica, experiencia: c.experiencia_profesional, especialidades: c.especialidades })),
    modules, horasPresenciales: 80, horasSincronicas: 44, horasAsincronicas: 24, totalHours: 148,
    buckets: [
      { id: 'b1', label: 'Asesoría directiva presencial', hours: 40, distributionType: 'cadencia', modalidad: 'presencial' },
      { id: 'b2', label: 'Talleres docentes', hours: 40, distributionType: 'bloque', modalidad: 'presencial', mes: 5 },
      { id: 'b3', label: 'Sesiones en línea', hours: 44, distributionType: 'cadencia', modalidad: 'online' },
      { id: 'b4', label: 'Cursos en la plataforma', hours: 24, distributionType: 'flexible', modalidad: 'asincronico' },
    ],
    pricing: { mode: 'per_hour', precioUf: version === 1 ? 3.4 : 3.2, totalHours: 148, formaPago: '3 cuotas iguales', formaPagoDetalle: 'Marzo, julio y noviembre de 2027.' },
    contentBlocks: BLOQUES.map((b) => ({ key: b.clave, titulo: b.titulo, contenido: b.contenido, imagenes: null })),
    documents: selectedDocs.map((d) => ({ id: d.id, nombre: d.nombre, tipo: d.tipo, archivoPath: d.archivo_path, descripcion: d.descripcion })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    licitacion: { id: lic.id, numero: lic.numero_licitacion, nombre: lic.nombre_licitacion, year: lic.year },
    cliente: { nombreLegal: 'Fundación Educacional Sintética E2E', nombreFantasia: 'Colegio Sintetico E2E', comuna: 'Providencia', ciudad: 'Santiago', nombreRepresentante: 'Rosa Sintética Valdés' },
    fichaObjetivo: FICHA.objetivo_general,
    ficha: { id: FICHA.id, folio: FICHA.folio, nombre_servicio: FICHA.nombre_servicio, dimension: FICHA.dimension, categoria: FICHA.categoria, total_horas: FICHA.total_horas, destinatarios: FICHA.destinatarios },
  });
  const configuracion = (precio) => ({ horas: 148, desglose: { presenciales: 80, sincronicas: 44, asincronicas: 24 }, consultores_ids: [], precio_uf: precio, precio_modelo: 'per_hour', forma_pago: '3 cuotas iguales', plataforma: false, modulos: modules });

  const have = await sb.from('propuesta_generadas').select('id').in('id', [U(1961), U(1962)]);
  if (have.error) throw new Error(`propuesta_generadas: ${have.error.message}`);
  const existing = new Set(have.data.map((r) => r.id));
  const P = [
    { id: U(1961), version: 1, code: 'E2EPRV', at: '2026-10-22T15:00:00.000Z', web_status: 'viewed', viewed_at: TS('2026-10-23', '09:12:00'), view_count: 3, precio: 3.4 },
    { id: U(1962), version: 2, code: PROPUESTA_CODE, at: '2026-11-05T14:30:00.000Z', web_status: 'published', viewed_at: null, view_count: 0, precio: 3.2 },
  ];
  for (const p of P) {
    if (existing.has(p.id)) continue;
    const archivo_path = `generadas/${LIC.propuestas}/${p.id}.pdf`;
    await put('propuestas', archivo_path, pdf(`Propuesta ${lic.numero_licitacion} v${p.version}`, ['Colegio Sintetico E2E - Programa Evoluciona 2027', 'Documento sintético de prueba.']), MIME.pdf);
    const { error } = await sb.from('propuesta_generadas').insert({
      id: p.id, licitacion_id: LIC.propuestas, plantilla_id: U(1931), ficha_id: FICHA.id, configuracion: configuracion(p.precio),
      consultores_ids: null, documentos_ids: selectedDocs.map((d) => d.id), archivo_path, pdf_sha256: null, estado: 'completada', version: p.version,
      generado_por: admin, created_at: p.at, access_code: await bcrypt.hash(p.code, 10), access_code_plain: p.code,
      web_slug: `colegio-sintetico-e2e-evoluciona-2027-v${p.version}`, web_status: p.web_status, viewed_at: p.viewed_at, view_count: p.view_count,
      snapshot_json: snapshot(p.version, p.at),
    });
    if (error) throw new Error(`propuesta_generadas (insert): ${error.message}`);
  }
}

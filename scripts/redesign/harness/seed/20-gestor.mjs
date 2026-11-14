// Gestor de Cambio (area 08-gestor-de-cambio): registros, the assessment builder, context questions, the transversal
// context of the primary school, its migration plan, the results dashboards and the demo mode.
// Invented content only. Ids: UUIDs 5eed0020-0000-4000-8000-00000000XXXX, integers from 9920000 (except ab_grades,
// see the grades group). Every write is insert-if-missing (ON CONFLICT DO NOTHING / look before insert): a second run
// changes nothing, not even updated_at (the tables' update triggers would stamp now()).
//
// Results are computed by the application's own scoring code (lib/services/assessment-builder/scoringService.ts,
// fetchInstanceDataForScoring + calculateAssessmentScores, loaded with jiti), then stored with a fixed date.
// The snapshot of each published template is built the way lib/services/assessment-builder/publishTemplate.ts builds
// it (same shape, the app's categoryScopedColumns), with a fixed id and date.
import createJiti from 'jiti';
import { join } from 'node:path';
import { ROOT, stack } from '../lib.mjs';

export const name = 'gestor de cambio: registros, constructor, contexto, plan de migración, resultados, demo';

const id = (n) => `5eed0020-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const INT = 9920000;
const SCHOOL = 990001;
const D = (s) => `2026-${s}-03:00`; // D('10-14T10:30:00') -> Chilean time, in the past

// ---------------------------------------------------------------------------------------------------------------- ids
const T = { eva5: id(0x01), cre5: id(0x02), apr1: id(0x03), eva7: id(0x04), cre1old: id(0x05) };
const SNAP = { eva5: id(0x11), cre5: id(0x12), apr1: id(0x13), cre1old: id(0x15) };
const CONTEXT_ID = id(0x600);
const COURSE = {
  b1A: id(0x601), b1B: id(0x602), b2A: id(0x603), b5A: id(0x604), b5B: id(0x605), b5C: id(0x606), b7A: id(0x607), m1A: id(0x608),
};
const INST = {
  docEva5: id(0x801), docCre5: id(0x802), docApr1: id(0x803), docCre1Archived: id(0x804),
  otherEva5: id(0x805), otherCre5: id(0x806), otherApr1: id(0x807),
  leaderEva5: id(0x808), leaderCre5: id(0x809),
};

// ------------------------------------------------------------------------------------------------------------ helpers
async function insertMissing(supabase, table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function one(supabase, table, match, cols = 'id') {
  let q = supabase.from(table).select(cols);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data?.[0] ?? null;
}

let appModules;
function app() {
  if (appModules) return appModules;
  const s = stack();
  // lib/supabaseAdmin.ts builds its client at import time. Always the local stack's own settings (stack() has
  // refused anything that is not local), never whatever the shell happens to export.
  process.env.NEXT_PUBLIC_SUPABASE_URL = s.API_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = s.SERVICE_ROLE_KEY;
  const jiti = createJiti(join(ROOT, 'seed-loader.js'), { alias: { '@/': `${ROOT}/` }, interopDefault: true });
  appModules = {
    scoring: jiti(join(ROOT, 'lib/services/assessment-builder/scoringService.ts')),
    columns: jiti(join(ROOT, 'lib/services/assessment-builder/indicatorCategoryColumns.ts')),
    freq: jiti(join(ROOT, 'lib/services/assessment-builder/frequencyConfig.ts')),
  };
  return appModules;
}

// ------------------------------------------------------------------------------------------- template definitions
// Rubric descriptors (profundidad), shared wording style of the real instruments.
const rubric = (what) => [
  `No se observa ${what}.`,
  `Se observa ${what} de manera aislada, por iniciativa individual.`,
  `Se observa ${what} en algunos cursos, con criterios todavía en construcción.`,
  `Se observa ${what} de manera regular y con criterios compartidos por el equipo.`,
  `Se observa ${what} de manera sistemática, evaluada y ajustada por el equipo con evidencia.`,
];
const FREQ_WEEK = { type: 'count', min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana', 'mes'] };
const FREQ_MONTH = { type: 'count', min: 0, max: 8, step: 1, unit: 'mes', allowed_units: ['semana', 'mes', 'trimestre'] };

// years: expected value per year 1..5 (null = not active that year). cobertura/traspaso/detalle use 1 = active.
const ind = (n, code, category, name, extra = {}) => ({ id: id(0x300 + n), code, category, name, ...extra });

const TEMPLATES = [
  {
    key: 'eva5', id: T.eva5, snapshot: SNAP.eva5, area: 'evaluacion', gradeSort: 9, version: '1.1.0', status: 'published',
    name: 'Registro de Evaluación Formativa — 5° Básico',
    description: 'Instrumento de autorregistro docente sobre prácticas de evaluación formativa en 5° Básico. Se completa una vez por semestre.',
    created: D('08-18T09:00:00'), published: D('09-01T10:00:00'),
    objectives: [
      { id: id(0x101), name: 'Evaluación para el aprendizaje', description: 'La evaluación se usa para orientar el aprendizaje, no solo para calificar.', modules: [
        { id: id(0x201), name: 'Retroalimentación oportuna', description: 'Prácticas de retroalimentación durante el proceso de aprendizaje.',
          instructions: 'Responda pensando en el curso asignado durante el semestre en curso.', indicators: [
          ind(1, 'EVA-RET-01', 'cobertura', 'Existe una práctica sistemática de retroalimentación en el curso', { description: 'Se considera sistemática cuando está planificada y ocurre en todas las unidades.' }),
          ind(2, 'EVA-RET-02', 'frecuencia', 'Instancias de retroalimentación individual por estudiante', { frequency_config: FREQ_WEEK, description: 'Cuente las instancias en que cada estudiante recibe retroalimentación sobre su trabajo.' }),
          ind(3, 'EVA-RET-03', 'profundidad', 'Calidad de la retroalimentación entregada', { rubric: rubric('una retroalimentación descriptiva y orientada a la mejora') }),
          ind(4, 'EVA-RET-04', 'traspaso', 'Evidencia y sugerencias de mejora de la práctica', { description: 'Adjunte un enlace a una evidencia y comente qué ajustaría.' }),
        ] },
        { id: id(0x202), name: 'Criterios de logro compartidos', description: 'Los estudiantes conocen qué se espera de su trabajo.', indicators: [
          ind(5, 'EVA-CRI-01', 'cobertura', 'Los criterios de logro se comunican antes de cada tarea evaluada'),
          ind(6, 'EVA-CRI-02', 'profundidad', 'Uso de rúbricas o listas de cotejo con los estudiantes', { rubric: rubric('el uso de rúbricas construidas o comentadas con los estudiantes') }),
          ind(7, 'EVA-CRI-03', 'detalle', 'Medios usados para compartir los criterios', { detalle_options: ['Rúbrica impresa', 'Ejemplos de trabajos', 'Pauta en la pizarra', 'Plataforma digital', 'Conversación inicial'] }),
        ] },
      ] },
      { id: id(0x102), name: 'Autoevaluación y coevaluación', description: 'Los estudiantes participan en la evaluación de su propio aprendizaje.', modules: [
        { id: id(0x203), name: 'Autoevaluación del estudiante', description: 'Instancias en que el estudiante revisa su propio progreso.', indicators: [
          ind(8, 'EVA-AUT-01', 'cobertura', 'Se realizan instancias de autoevaluación en el curso'),
          ind(9, 'EVA-AUT-02', 'frecuencia', 'Instancias de autoevaluación o coevaluación', { frequency_config: FREQ_MONTH }),
          ind(10, 'EVA-AUT-03', 'profundidad', 'Profundidad de la reflexión de los estudiantes', { rubric: rubric('una reflexión de los estudiantes sobre su propio proceso') }),
          ind(11, 'EVA-AUT-04', 'detalle', 'Formatos de coevaluación usados entre pares', { detalle_options: ['Pauta de pares', 'Galería de trabajos', 'Ticket de salida', 'Portafolio'], fromYear: 3 }),
        ] },
      ] },
    ],
  },
  {
    key: 'cre5', id: T.cre5, snapshot: SNAP.cre5, area: 'personalizacion', gradeSort: 9, version: '1.1.0', status: 'published',
    name: 'Registro de Crecimiento — 5° Básico',
    description: 'Autorregistro sobre el acompañamiento de trayectorias personales de los estudiantes de 5° Básico.',
    created: D('08-20T09:00:00'), published: D('09-01T10:30:00'),
    objectives: [
      { id: id(0x103), name: 'Trayectorias personales', description: 'Cada estudiante tiene metas y un acompañamiento visible.', modules: [
        { id: id(0x204), name: 'Metas personales de aprendizaje', indicators: [
          ind(12, 'CRE-MET-01', 'cobertura', 'Cada estudiante cuenta con metas personales de aprendizaje'),
          ind(13, 'CRE-MET-02', 'frecuencia', 'Revisiones de metas con cada estudiante', { frequency_config: FREQ_MONTH }),
          ind(14, 'CRE-MET-03', 'profundidad', 'Apropiación de las metas por parte de los estudiantes', { rubric: rubric('que los estudiantes formulen y revisen sus propias metas') }),
        ] },
        { id: id(0x205), name: 'Acompañamiento tutorial', indicators: [
          ind(15, 'CRE-TUT-01', 'cobertura', 'Existe un espacio de tutoría planificado'),
          ind(16, 'CRE-TUT-02', 'profundidad', 'Calidad de las conversaciones de tutoría', { rubric: rubric('conversaciones de tutoría centradas en el estudiante') }),
          ind(17, 'CRE-TUT-03', 'traspaso', 'Evidencia y sugerencias del acompañamiento'),
        ] },
      ] },
      { id: id(0x104), name: 'Vínculo y bienestar', modules: [
        { id: id(0x206), name: 'Espacios de conversación', indicators: [
          ind(18, 'CRE-CON-01', 'cobertura', 'El curso tiene un espacio semanal de conversación'),
          ind(19, 'CRE-CON-02', 'frecuencia', 'Espacios de conversación grupal realizados', { frequency_config: FREQ_WEEK }),
        ] },
      ] },
    ],
  },
  {
    key: 'apr1', id: T.apr1, snapshot: SNAP.apr1, area: 'aprendizaje', gradeSort: 5, version: '1.1.0', status: 'published',
    name: 'Registro de Aprendizaje — 1° Básico',
    description: 'Autorregistro sobre metodologías activas de aprendizaje en 1° Básico.',
    created: D('08-25T09:00:00'), published: D('09-03T11:00:00'),
    objectives: [
      { id: id(0x105), name: 'Aprendizaje activo', modules: [
        { id: id(0x207), name: 'Proyectos interdisciplinarios', indicators: [
          ind(20, 'APR-PRO-01', 'cobertura', 'El curso desarrolla al menos un proyecto interdisciplinario por semestre'),
          ind(21, 'APR-PRO-02', 'profundidad', 'Protagonismo de los estudiantes en el proyecto', { rubric: rubric('que los estudiantes tomen decisiones en el proyecto') }),
          ind(22, 'APR-PRO-03', 'frecuencia', 'Sesiones dedicadas al proyecto', { frequency_config: FREQ_WEEK }),
        ] },
        { id: id(0x208), name: 'Juego y exploración', indicators: [
          ind(23, 'APR-JUE-01', 'cobertura', 'Se planifican momentos de juego y exploración'),
          ind(24, 'APR-JUE-02', 'detalle', 'Tipos de experiencias de exploración', { detalle_options: ['Rincones de aprendizaje', 'Salidas al patio', 'Material concreto', 'Juego dramático'] }),
          ind(25, 'APR-JUE-03', 'profundidad', 'Intencionalidad pedagógica del juego', { rubric: rubric('un juego con propósito pedagógico explícito') }),
        ] },
      ] },
    ],
  },
  {
    key: 'eva7', id: T.eva7, area: 'evaluacion', gradeSort: 11, version: '1.0.0', status: 'draft',
    name: 'Registro de Evaluación Formativa — 7° Básico (borrador)',
    description: 'Versión en construcción para 7° Básico. Falta completar expectativas GI.',
    created: D('10-27T15:00:00'), partialExpectations: true,
    objectives: [
      { id: id(0x106), name: 'Evaluación para el aprendizaje', modules: [
        { id: id(0x209), name: 'Retroalimentación entre pares', indicators: [
          ind(26, 'EVA7-RET-01', 'cobertura', 'Se realizan instancias de retroalimentación entre pares'),
          ind(27, 'EVA7-RET-02', 'frecuencia', 'Instancias de retroalimentación entre pares', { frequency_config: FREQ_MONTH }),
          ind(28, 'EVA7-RET-03', 'profundidad', 'Calidad de la retroalimentación entre pares', { rubric: rubric('una retroalimentación entre pares basada en criterios') }),
        ] },
      ] },
    ],
  },
  {
    key: 'cre1old', id: T.cre1old, snapshot: SNAP.cre1old, area: 'personalizacion', gradeSort: 5, version: '1.1.0', status: 'published',
    archived: { at: D('10-05T12:00:00') },
    name: 'Registro de Crecimiento — 1° Básico (versión 2025)',
    description: 'Versión anterior del registro de Crecimiento para 1° Básico, reemplazada en octubre.',
    created: D('03-10T09:00:00'), published: D('03-15T09:00:00'),
    objectives: [
      { id: id(0x107), name: 'Trayectorias personales', modules: [
        { id: id(0x20a), name: 'Metas personales de aprendizaje', indicators: [
          ind(29, 'CRE1-MET-01', 'cobertura', 'Cada estudiante cuenta con metas personales de aprendizaje'),
          ind(30, 'CRE1-MET-02', 'profundidad', 'Apropiación de las metas por parte de los estudiantes', { rubric: rubric('que los estudiantes reconozcan sus metas') }),
          ind(31, 'CRE1-MET-03', 'frecuencia', 'Revisiones de metas con cada estudiante', { frequency_config: FREQ_MONTH }),
        ] },
      ] },
    ],
  },
];

// Expected value per category and year (GT; GI a step lower where it differs).
function expectationRow(tpl, indicator, gen, n) {
  const years = [1, 2, 3, 4, 5];
  const from = indicator.fromYear ?? 1;
  const values = years.map((y) => {
    if (y < from) return null;
    switch (indicator.category) {
      case 'frecuencia': {
        const max = indicator.frequency_config.max;
        return Math.min(max, (gen === 'GT' ? 1 : 0) + y);
      }
      case 'profundidad': return Math.min(4, [1, 2, 2, 3, 4][y - 1] - (gen === 'GI' && y > 1 ? 1 : 0));
      default: return 1;
    }
  });
  const row = {
    id: id(n), template_id: tpl.id, indicator_id: indicator.id, generation_type: gen, tolerance: 1,
    created_at: tpl.created, updated_at: tpl.created,
  };
  years.forEach((y, i) => {
    row[`year_${y}_expected`] = values[i];
    row[`year_${y}_expected_unit`] = indicator.category === 'frecuencia' && values[i] !== null ? indicator.frequency_config.unit : null;
  });
  return row;
}

// ----------------------------------------------------------------------------------- grades (ab_grades, reference)
// The application hard-codes the production grade ids (pages/api/school/migration-plan/index.ts: ids 1-6 are the
// always-GT grades) and save_transversal_context maps levels by sort_order, so the grade rows mirror production:
// id = sort_order 1..16. Look before insert, by sort_order; an existing row (another module's) is used as it is.
const GRADES = [
  ['medio_menor', 'Medio Menor'], ['medio_mayor', 'Medio Mayor'], ['pre_kinder', 'Pre-Kinder'], ['kinder', 'Kinder'],
  ['1_basico', '1° Básico'], ['2_basico', '2° Básico'], ['3_basico', '3° Básico'], ['4_basico', '4° Básico'],
  ['5_basico', '5° Básico'], ['6_basico', '6° Básico'], ['7_basico', '7° Básico'], ['8_basico', '8° Básico'],
  ['1_medio', '1° Medio'], ['2_medio', '2° Medio'], ['3_medio', '3° Medio'], ['4_medio', '4° Medio'],
];

async function seedGrades(supabase) {
  const { data, error } = await supabase.from('ab_grades').select('id, name, sort_order, is_always_gt');
  if (error) throw new Error(`ab_grades: ${error.message}`);
  const bySort = new Map(data.map((g) => [g.sort_order, g]));
  const missing = [];
  GRADES.forEach(([, label], i) => {
    const sort = i + 1;
    if (!bySort.has(sort) && !data.some((g) => g.name === label)) {
      missing.push({ id: sort, name: label, sort_order: sort, is_always_gt: sort <= 6, created_at: D('08-01T09:00:00') });
    }
  });
  if (missing.length) {
    const { error: insErr } = await supabase.from('ab_grades').insert(missing);
    if (insErr) throw new Error(`ab_grades insert: ${insErr.message}`);
  }
  const { data: all, error: e2 } = await supabase.from('ab_grades').select('id, name, sort_order, is_always_gt');
  if (e2) throw new Error(`ab_grades: ${e2.message}`);
  return new Map(all.map((g) => [g.sort_order, g]));
}

// ---------------------------------------------------- /admin/assessment-builder, /[templateId], /[templateId]/expectations
// Published templates (3 vías, two grades, one requires GT+GI expectations), one draft, one archived.
async function seedTemplates(supabase, users, grades) {
  const { columns } = app();
  for (const tpl of TEMPLATES) {
    const grade = grades.get(tpl.gradeSort);
    tpl.grade = grade;
    const published = tpl.status === 'published';
    await insertMissing(supabase, 'assessment_templates', [{
      id: tpl.id, area: tpl.area, version: tpl.version, name: tpl.name, description: tpl.description,
      status: tpl.status, grade_id: grade.id, created_by: users.admin,
      published_at: published ? tpl.published : null, published_by: published ? users.admin : null,
      is_archived: !!tpl.archived, archived_at: tpl.archived?.at ?? null, archived_by: tpl.archived ? users.admin : null,
      created_at: tpl.created, updated_at: tpl.archived?.at ?? tpl.published ?? tpl.created,
    }]);

    const objectives = [], modules = [], indicators = [];
    tpl.objectives.forEach((o, oi) => {
      objectives.push({ id: o.id, template_id: tpl.id, name: o.name, description: o.description ?? null, display_order: oi + 1, weight: 1, created_at: tpl.created, updated_at: tpl.created });
      o.modules.forEach((m) => {
        modules.push({ id: m.id, template_id: tpl.id, objective_id: o.id, name: m.name, description: m.description ?? null, instructions: m.instructions ?? null,
          display_order: modules.length + 1, weight: 1, created_at: tpl.created, updated_at: tpl.created });
        m.indicators.forEach((i, ii) => {
          const r = i.rubric;
          indicators.push({
            id: i.id, module_id: m.id, code: i.code, name: i.name, description: i.description ?? null, category: i.category,
            frequency_config: i.category === 'frecuencia' ? i.frequency_config : null,
            frequency_unit_options: i.category === 'frecuencia' ? i.frequency_config.allowed_units : null,
            level_0_descriptor: r?.[0] ?? null, level_1_descriptor: r?.[1] ?? null, level_2_descriptor: r?.[2] ?? null,
            level_3_descriptor: r?.[3] ?? null, level_4_descriptor: r?.[4] ?? null,
            detalle_options: i.category === 'detalle' ? i.detalle_options : null,
            display_order: ii + 1, weight: 1, created_at: tpl.created, updated_at: tpl.created,
          });
        });
      });
    });
    await insertMissing(supabase, 'assessment_objectives', objectives);
    await insertMissing(supabase, 'assessment_modules', modules);
    await insertMissing(supabase, 'assessment_indicators', indicators);

    // Expectations: GT always; GI too when the grade is not always-GT. The draft keeps GI empty and two GT rows unset.
    const dual = !grade.is_always_gt;
    const all = tpl.objectives.flatMap((o) => o.modules.flatMap((m) => m.indicators));
    const expectations = [];
    all.forEach((i) => {
      const n = 0x400 + (parseInt(i.id.slice(-4), 16) - 0x300) * 2;
      if (tpl.partialExpectations && all.indexOf(i) === all.length - 1) return;
      expectations.push(expectationRow(tpl, i, 'GT', n));
      if (dual && !tpl.partialExpectations) expectations.push(expectationRow(tpl, i, 'GI', n + 1));
    });
    await insertMissing(supabase, 'assessment_year_expectations', expectations, 'template_id,indicator_id,generation_type');

    if (published) await seedSnapshot(supabase, users, tpl, objectives, modules, indicators, expectations, columns);
  }
}

// The immutable snapshot publishTemplate writes (objectives -> modules -> indicators, plus the flat module list).
async function seedSnapshot(supabase, users, tpl, objectives, modules, indicators, expectations, columns) {
  const dual = !tpl.grade.is_always_gt;
  const expOf = (indId, gen) => {
    const e = expectations.find((x) => x.indicator_id === indId && x.generation_type === gen);
    if (!e) return null;
    const out = {};
    for (const y of [1, 2, 3, 4, 5]) { out[`year_${y}_expected`] = e[`year_${y}_expected`]; out[`year_${y}_expected_unit`] = e[`year_${y}_expected_unit`]; }
    out.tolerance = e.tolerance;
    return out;
  };
  const indSnap = (i) => ({
    id: i.id, code: i.code, name: i.name, description: i.description, category: i.category,
    ...columns.categoryScopedColumns(i),
    display_order: i.display_order, weight: i.weight, sub_questions: undefined,
    expectations_gt: expOf(i.id, 'GT'), expectations_gi: dual ? expOf(i.id, 'GI') : null, expectations: expOf(i.id, 'GT'),
  });
  const modSnap = (m) => ({
    id: m.id, name: m.name, description: m.description, instructions: m.instructions, display_order: m.display_order,
    weight: m.weight, objective_id: m.objective_id, indicators: indicators.filter((i) => i.module_id === m.id).map(indSnap),
  });
  const snapshotData = {
    template: {
      id: tpl.id, name: tpl.name, description: tpl.description, area: tpl.area, grade_id: tpl.grade.id,
      grade_name: tpl.grade.name, is_always_gt: tpl.grade.is_always_gt, requires_dual_expectations: dual,
      scoring_config: { default_weights: { module: 1.0, indicator: 1.0 }, level_thresholds: { advanced: 62.5, emerging: 12.5, developing: 37.5, consolidated: 87.5 } },
      created_at: tpl.created,
    },
    objectives: objectives.map((o) => ({ id: o.id, name: o.name, description: o.description, display_order: o.display_order, weight: o.weight,
      modules: modules.filter((m) => m.objective_id === o.id).map(modSnap) })),
    modules: modules.map(modSnap),
    published_at: new Date(tpl.published).toISOString(),
    published_by: users.admin,
  };
  await insertMissing(supabase, 'assessment_template_snapshots', [{
    id: tpl.snapshot, template_id: tpl.id, version: tpl.version, snapshot_data: JSON.parse(JSON.stringify(snapshotData)),
    created_at: tpl.published, created_by: users.admin,
  }]);
}

// ------------------------------------------------------------------------- /admin/context-questions (+ /overview)
// Six structural questions (the widgets of the edit page) and seven generic ones of every answer type; one inactive.
const QUESTIONS = [
  { n: 0xd01, key: 'total_students', widget: 'total_students', type: 'number', text: '¿Cuántos estudiantes tiene el establecimiento?', placeholder: 'Ej: 500', required: true },
  { n: 0xd02, key: 'grade_levels', widget: 'grade_levels', type: 'multiselect', text: '¿Qué niveles imparte el establecimiento?', required: true },
  { n: 0xd03, key: 'courses_per_level', widget: 'courses_per_level', type: 'number', text: '¿Cuántos cursos hay por nivel?', required: true },
  { n: 0xd04, key: 'implementation_year', widget: 'implementation_year', type: 'number', text: '¿En qué año de implementación se encuentra el establecimiento en 2026?', required: true },
  { n: 0xd05, key: 'programa_inicia', widget: 'programa_inicia', type: 'boolean', text: '¿El equipo completó el Programa Inicia?', required: false },
  { n: 0xd06, key: 'period_system', widget: 'period_system', type: 'select', text: '¿Qué sistema de períodos usa el establecimiento?', required: true },
  { n: 0xd07, key: 'sello_educativo', widget: 'generic', type: 'textarea', text: '¿Cuál es el sello educativo del establecimiento?', help: 'Describa en pocas líneas el sello declarado en el Proyecto Educativo Institucional.', required: true },
  { n: 0xd08, key: 'dependencia_administrativa', widget: 'generic', type: 'select', text: 'Dependencia administrativa', options: ['Municipal', 'Servicio Local de Educación Pública', 'Particular subvencionado', 'Particular pagado'], required: true },
  { n: 0xd09, key: 'programa_integracion', widget: 'generic', type: 'boolean', text: '¿El establecimiento cuenta con Programa de Integración Escolar (PIE)?', required: false },
  { n: 0xd0a, key: 'iniciativas_innovacion', widget: 'generic', type: 'multiselect', text: 'Iniciativas de innovación vigentes', options: ['Aprendizaje basado en proyectos', 'Codocencia', 'Evaluación formativa', 'Tutorías entre pares', 'Huerto escolar'], required: false },
  { n: 0xd0b, key: 'apropiacion_pei', widget: 'generic', type: 'scale', text: 'Grado de apropiación del proyecto educativo en el equipo docente (1 a 5)', required: false },
  { n: 0xd0c, key: 'docentes_aula', widget: 'generic', type: 'number', text: 'Cantidad de docentes de aula', placeholder: 'Ej: 35', required: false },
  { n: 0xd0d, key: 'cargo_coordinacion', widget: 'generic', type: 'text', text: 'Cargo de la persona que coordina el proceso de transformación', placeholder: 'Ej: Jefa de UTP', required: false },
  { n: 0xd0e, key: 'convenio_sep_anterior', widget: 'generic', type: 'boolean', text: '¿Participó en el convenio SEP del período anterior? (pregunta retirada)', required: false, inactive: true },
];
const STRUCTURAL_KEY = { total_students: 'total_students', grade_levels: 'grade_levels', courses_per_level: 'courses_per_level',
  implementation_year: 'implementation_year_2026', programa_inicia: 'programa_inicia', period_system: 'period_system' };

async function seedContextQuestions(supabase, users) {
  const ids = {};
  for (const [i, q] of QUESTIONS.entries()) {
    const existing = await one(supabase, 'context_general_questions', { question_key: q.key });
    if (existing) { ids[q.key] = existing.id; continue; } // a question with this key already exists: use it as it is
    ids[q.key] = id(q.n);
    await insertMissing(supabase, 'context_general_questions', [{
      id: id(q.n), question_key: q.key, question_text: q.text, question_type: q.type, options: q.options ?? null,
      placeholder: q.placeholder ?? null, help_text: q.help ?? null, is_required: q.required, is_active: !q.inactive,
      display_order: i + 1, widget_type: q.widget, structural_key: STRUCTURAL_KEY[q.widget] ?? null,
      created_by: users.admin, created_at: D('08-05T10:00:00'), updated_at: D('08-05T10:00:00'),
    }]);
  }
  return ids;
}

// ------------------------------------------------- /school/transversal-context (+ /edit), /admin/context-questions/overview
// The primary school's context, in the shape save_transversal_context writes (it needs a signed-in caller, so the row
// is written directly), its 8 generated courses ("1 BASICO A"…), the custom answers and the history/completion rows.
const LEVELS = { '1_basico': 2, '2_basico': 1, '5_basico': 3, '7_basico': 1, '1_medio': 1 };
const COURSES = [
  ['b1A', '1_basico', 'A'], ['b1B', '1_basico', 'B'], ['b2A', '2_basico', 'A'], ['b5A', '5_basico', 'A'],
  ['b5B', '5_basico', 'B'], ['b5C', '5_basico', 'C'], ['b7A', '7_basico', 'A'], ['m1A', '1_medio', 'A'],
];
const sortOf = (level) => GRADES.findIndex(([k]) => k === level) + 1;

async function seedContext(supabase, users, grades, qids) {
  const existing = await one(supabase, 'school_transversal_context', { school_id: SCHOOL });
  if (existing && existing.id !== CONTEXT_ID) throw new Error(`school ${SCHOOL} already has a transversal context (${existing.id}) not written by this module`);
  const ctx = {
    id: CONTEXT_ID, school_id: SCHOOL, total_students: 640, grade_levels: Object.keys(LEVELS), courses_per_level: LEVELS,
    implementation_year_2026: 2, period_system: 'semestral', programa_inicia_completed: true, programa_inicia_hours: 40,
    programa_inicia_year: 2025, is_completed: true, completed_at: D('09-15T16:20:00'), completed_by: users.directivo,
    created_at: D('09-15T16:05:00'), updated_at: D('09-15T16:20:00'),
  };
  await insertMissing(supabase, 'school_transversal_context', [ctx]);

  await insertMissing(supabase, 'school_course_structure', COURSES.map(([k, level, letter]) => ({
    id: COURSE[k], school_id: SCHOOL, context_id: CONTEXT_ID, grade_level: level, grade_id: grades.get(sortOf(level)).id,
    course_name: `${level.replace('_', ' ').toUpperCase()} ${letter}`, created_at: D('09-15T16:20:00'),
  })));

  // Custom (generic) answers of the primary school.
  const answers = {
    sello_educativo: 'Una comunidad que aprende en conjunto, con foco en la convivencia, el pensamiento crítico y el cuidado del entorno.',
    dependencia_administrativa: 'Servicio Local de Educación Pública',
    programa_integracion: true,
    iniciativas_innovacion: ['Aprendizaje basado en proyectos', 'Evaluación formativa', 'Tutorías entre pares'],
    apropiacion_pei: 3,
    docentes_aula: 34,
    cargo_coordinacion: 'Jefa de Unidad Técnico Pedagógica',
  };
  await insertMissing(supabase, 'context_general_responses', Object.entries(answers).map(([key, response], i) => ({
    id: id(0xe01 + i), school_id: SCHOOL, question_id: qids[key], response, responded_by: users.directivo,
    created_at: D('09-16T09:10:00'), updated_at: D('09-16T09:10:00'),
  })), 'school_id,question_id');

  // Migration plan: every grade x 5 years (the page saves the whole grid). GT advances two grades a year; year 5 all GT.
  const plan = [];
  for (let year = 1; year <= 5; year++) {
    for (const g of [...grades.values()].sort((a, b) => a.sort_order - b.sort_order)) {
      if (g.sort_order > 16) continue;
      plan.push({ id: INT + year * 100 + g.sort_order, school_id: SCHOOL, year_number: year, grade_id: g.id,
        generation_type: g.is_always_gt || g.sort_order <= 6 + 2 * year ? 'GT' : 'GI',
        created_at: D('09-17T11:00:00'), updated_at: D('09-17T11:00:00') });
    }
  }
  await insertMissing(supabase, 'ab_migration_plan', plan, 'school_id,year_number,grade_id');

  // Completion status and change history (the "completado por … el …" lines of the context page).
  const directivoName = (await one(supabase, 'profiles', { id: users.directivo }, 'name'))?.name ?? 'Equipo Directivo Sintetico';
  await insertMissing(supabase, 'school_plan_completion_status', [
    { id: id(0x1101), school_id: SCHOOL, feature: 'migration_plan', is_completed: true, completed_at: D('09-17T11:00:00'), completed_by: users.directivo, updated_at: D('09-17T11:00:00') },
    { id: id(0x1102), school_id: SCHOOL, feature: 'context_responses', is_completed: true, completed_at: D('09-16T09:10:00'), completed_by: users.directivo, updated_at: D('09-16T09:10:00') },
  ], 'school_id,feature');
  const { id: _i, ...ctxState } = ctx;
  await insertMissing(supabase, 'school_change_history', [
    { id: id(0x1001), school_id: SCHOOL, feature: 'transversal_context', action: 'initial_save', previous_state: null, new_state: { id: CONTEXT_ID, ...ctxState },
      changed_fields: ['total_students', 'grade_levels', 'courses_per_level', 'implementation_year_2026', 'period_system', 'programa_inicia_completed', 'programa_inicia_hours', 'programa_inicia_year'],
      user_id: users.directivo, user_name: directivoName, created_at: D('09-15T16:20:00') },
    { id: id(0x1002), school_id: SCHOOL, feature: 'context_responses', action: 'initial_save', previous_state: {}, new_state: Object.fromEntries(Object.keys(answers).map((k) => [qids[k], answers[k]])),
      changed_fields: Object.keys(answers).map((k) => qids[k]), user_id: users.directivo, user_name: directivoName, created_at: D('09-16T09:10:00') },
    { id: id(0x1003), school_id: SCHOOL, feature: 'migration_plan', action: 'initial_save', previous_state: {},
      new_state: Object.fromEntries(plan.map((p) => [`${p.year_number}-${p.grade_id}`, p.generation_type])),
      changed_fields: plan.map((p) => `${p.year_number}-${p.grade_id}`), user_id: users.directivo, user_name: directivoName, created_at: D('09-17T11:00:00') },
  ]);
}

// --------------------------------------------- /docente/assessments, /[instanceId], /[instanceId]/results, dashboard
// Course docentes: the docente (1° A, 5° A), the second docente account of the school (1° B, 5° B) and the
// lider_generacion account, who also teaches (5° C). 2° A, 7° A and 1° Medio A stay without a docente.
// Registros (instances) of year 2, GT (the plan says GT for 1° and 5° Básico in year 2):
//   docente: 5°A evaluación in progress (partly answered), 5°A crecimiento completed, 1°A aprendizaje not started,
//            1°A crecimiento 2025 archived (read only); other docente: three completed; leader: one completed, one in progress.
const ASSIGN = [
  { n: 0x701, course: 'b1A', user: 'docente' }, { n: 0x702, course: 'b5A', user: 'docente' },
  { n: 0x703, course: 'b1B', user: 'inactiveConsultor' }, { n: 0x704, course: 'b5B', user: 'inactiveConsultor' },
  { n: 0x705, course: 'b5C', user: 'generationLeader' },
];

// Answers per indicator number: c = coverage, f = [value, unit], p = level, t = traspaso text, d = detalle options, r = rationale.
const ANSWERS = {
  // in progress: first module answered, second half answered, third untouched
  docEva5: { 1: { c: true }, 2: { f: [3, 'semana'], r: 'Uso tickets de salida y comentarios escritos en las guías.' }, 3: { p: 2 }, 5: { c: true } },
  docCre5: { 12: { c: true }, 13: { f: [2, 'mes'] }, 14: { p: 3, r: 'Los estudiantes registran sus metas en una bitácora y las revisan conmigo.' }, 15: { c: true }, 16: { p: 2 },
    17: { t: 'Las tutorías funcionan mejor en grupos pequeños; propongo calendarizarlas desde marzo.' }, 18: { c: true }, 19: { f: [1, 'semana'] } },
  docCre1Archived: { 29: { c: true }, 30: { p: 1 }, 31: { f: [1, 'mes'] } },
  otherEva5: { 1: { c: true }, 2: { f: [5, 'semana'] }, 3: { p: 3 }, 4: { t: 'Comparto una pauta de retroalimentación por escrito; sugiero ampliar el tiempo de revisión en clases.', link: 'https://example.com/evidencias/retroalimentacion-5b' },
    5: { c: true }, 6: { p: 3 }, 7: { d: ['Rúbrica impresa', 'Ejemplos de trabajos', 'Conversación inicial'] }, 8: { c: true }, 9: { f: [2, 'mes'] }, 10: { p: 2 } },
  otherCre5: { 12: { c: true }, 13: { f: [4, 'mes'] }, 14: { p: 4 }, 15: { c: true }, 16: { p: 3 }, 17: { t: 'Llevamos registro de cada tutoría en una planilla compartida.' }, 18: { c: true }, 19: { f: [2, 'semana'] } },
  // below expectation (level 0 against an expected 1): both practices not yet in place
  otherApr1: { 20: { c: false, r: 'Este semestre priorizamos la lectoescritura inicial; el proyecto queda para el segundo semestre.' },
    23: { c: false, r: 'Aún no contamos con los materiales para los rincones.' } },
  leaderEva5: { 1: { c: false, r: 'Este semestre no logramos sostener una práctica planificada de retroalimentación.' }, 5: { c: true }, 6: { p: 1 },
    7: { d: ['Pauta en la pizarra'] }, 8: { c: true }, 9: { f: [1, 'mes'] }, 10: { p: 1 } },
  leaderCre5: { 12: { c: true }, 13: { f: [1, 'mes'] } },
};

const INSTANCES = [
  { key: 'docEva5', tpl: 'eva5', course: 'b5A', user: 'docente', status: 'in_progress', started: D('10-20T15:40:00'), updated: D('11-10T18:05:00') },
  { key: 'docCre5', tpl: 'cre5', course: 'b5A', user: 'docente', status: 'completed', started: D('10-06T16:00:00'), completed: D('10-24T17:30:00') },
  { key: 'docApr1', tpl: 'apr1', course: 'b1A', user: 'docente', status: 'pending' },
  { key: 'docCre1Archived', tpl: 'cre1old', course: 'b1A', user: 'docente', status: 'archived', year: 1, assigned: D('03-20T10:00:00'), started: D('04-02T16:00:00'), completed: D('06-30T17:00:00'), updated: D('10-05T12:00:00') },
  { key: 'otherEva5', tpl: 'eva5', course: 'b5B', user: 'inactiveConsultor', status: 'completed', started: D('10-02T15:00:00'), completed: D('10-16T18:20:00') },
  { key: 'otherCre5', tpl: 'cre5', course: 'b5B', user: 'inactiveConsultor', status: 'completed', started: D('10-03T15:00:00'), completed: D('10-21T18:00:00') },
  { key: 'otherApr1', tpl: 'apr1', course: 'b1B', user: 'inactiveConsultor', status: 'completed', started: D('10-08T15:00:00'), completed: D('10-29T16:45:00') },
  { key: 'leaderEva5', tpl: 'eva5', course: 'b5C', user: 'generationLeader', status: 'completed', started: D('10-13T16:00:00'), completed: D('11-04T17:10:00') },
  { key: 'leaderCre5', tpl: 'cre5', course: 'b5C', user: 'generationLeader', status: 'in_progress', started: D('11-05T16:30:00'), updated: D('11-05T16:45:00') },
];

async function seedRegistros(supabase, users) {
  await insertMissing(supabase, 'school_course_docente_assignments', ASSIGN.map((a) => ({
    id: id(a.n), course_structure_id: COURSE[a.course], docente_id: users[a.user], assigned_by: users.directivo,
    assigned_at: a.course === 'b1A' ? D('03-20T10:00:00') : D('09-22T10:00:00'), is_active: true,
  })));

  const tplByKey = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));
  for (const [i, inst] of INSTANCES.entries()) {
    const tpl = tplByKey[inst.tpl];
    const assigned = inst.assigned ?? D('09-22T10:05:00');
    const iid = INST[inst.key];
    const isNew = !(await one(supabase, 'assessment_instances', { id: iid }));
    await insertMissing(supabase, 'assessment_instances', [{
      id: iid, template_snapshot_id: tpl.snapshot, school_id: SCHOOL, course_structure_id: COURSE[inst.course],
      transformation_year: inst.year ?? 2, generation_type: 'GT', status: inst.status, context_responses: null,
      assigned_at: assigned, assigned_by: users.directivo, started_at: inst.started ?? null, completed_at: inst.completed ?? null,
      created_at: assigned, updated_at: inst.updated ?? inst.completed ?? assigned,
    }]);
    const started = inst.status !== 'pending';
    const submitted = inst.status === 'completed' || (inst.status === 'archived' && !!inst.completed);
    await insertMissing(supabase, 'assessment_instance_assignees', [{
      id: id(0x901 + i), instance_id: iid, user_id: users[inst.user], can_edit: true, can_submit: true,
      has_started: started, has_submitted: submitted, assigned_at: assigned, assigned_by: users.directivo,
    }]);

    const answers = ANSWERS[inst.key] ?? {};
    const when = inst.completed ?? inst.updated ?? inst.started;
    await insertMissing(supabase, 'assessment_responses', Object.entries(answers).map(([n, a]) => ({
      id: id(0xa000 + i * 0x40 + Number(n)), instance_id: iid, indicator_id: id(0x300 + Number(n)),
      coverage_value: a.c ?? null, frequency_value: a.f?.[0] ?? null, frequency_unit: a.f?.[1] ?? null, profundity_level: a.p ?? null,
      rationale: a.r ?? null, evidence_notes: null,
      sub_responses: a.t ? { evidence_link: a.link ?? '', improvement_suggestions: a.t } : a.d ? { selected_options: a.d } : null,
      responded_by: users[inst.user], responded_at: when, updated_at: when,
    })));

    // Results of completed registros, computed by the application's scoring service, stored once with a fixed date.
    if (inst.status === 'completed' && (isNew || !(await one(supabase, 'assessment_instance_results', { instance_id: iid })))) {
      const { scoring } = app();
      const data = await scoring.fetchInstanceDataForScoring(supabase, iid);
      if (!data) throw new Error(`scoring data for ${inst.key} could not be loaded`);
      const s = scoring.calculateAssessmentScores(data);
      await insertMissing(supabase, 'assessment_instance_results', [{
        id: id(0xc01 + i), instance_id: iid, total_score: s.totalScore, overall_level: s.overallLevel, module_scores: s.moduleScores,
        expected_level: s.expectedLevel, meets_expectations: s.overallLevel >= s.expectedLevel,
        calculated_at: inst.completed, calculated_by: users[inst.user],
      }], 'instance_id');
    }
  }
}

// ------------------------------------------------------------------- /demo/assessments (+ /[templateId], /results)
// Admin sees every published template; the other roles see the ones granted to them.
async function seedDemoAccess(supabase, users) {
  const grants = [
    ['docente', 'eva5'], ['docente', 'apr1'], ['directivo', 'eva5'], ['directivo', 'cre5'], ['consultorAssigned', 'eva5'],
    ['generationLeader', 'eva5'], ['gcLeader', 'eva5'], ['networkSupervisor', 'eva5'], ['communityManager', 'eva5'], ['procurementManager', 'eva5'],
  ];
  await insertMissing(supabase, 'assessment_demo_access', grants.map(([u, t], i) => ({
    id: id(0xf01 + i), template_id: T[t], user_id: users[u], granted_by: users.admin, granted_at: D('10-01T09:30:00'),
  })), 'template_id,user_id');
}

export async function seed({ supabase, users }) {
  for (const k of ['admin', 'docente', 'directivo', 'inactiveConsultor', 'generationLeader']) {
    if (!users[k]) throw new Error(`fixture account ${k} is missing`);
  }
  const grades = await seedGrades(supabase);
  await seedTemplates(supabase, users, grades);
  const qids = await seedContextQuestions(supabase, users);
  await seedContext(supabase, users, grades, qids);
  await seedRegistros(supabase, users);
  await seedDemoAccess(supabase, users);
}

export const params = {
  '/admin/assessment-builder/[templateId]': { default: { templateId: T.eva5 } },
  '/admin/assessment-builder/[templateId]/expectations': { default: { templateId: T.eva5 } },
  '/demo/assessments/[templateId]': { default: { templateId: T.eva5 } },
  '/demo/assessments/[templateId]/results': { default: { templateId: T.eva5 } },
  '/docente/assessments/[instanceId]': { default: { instanceId: INST.docEva5 }, lider_generacion: { instanceId: INST.leaderCre5 } },
  '/docente/assessments/[instanceId]/results': { default: { instanceId: INST.docCre5 }, lider_generacion: { instanceId: INST.leaderEva5 } },
};

// More states of the same addresses worth a picture of their own.
export const variants = [
  { route: '/admin/assessment-builder/[templateId]', name: 'borrador', values: { templateId: '5eed0020-0000-4000-8000-000000000004' }, roles: ['admin'] }, // a draft, in edit mode
];

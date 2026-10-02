/**
 * PROC-B010 — fixture manifest, seed, inventory and cleanup for the SYNTHETIC
 * pilot-journey rehearsal (tests/e2e/proc-pilot-journey.spec.ts).
 *
 * LOCAL SYNTHETIC / NOT REAL PILOT EVIDENCE. Every row is invented; nothing
 * here names a real school, person or student. The rehearsal runs only on a
 * private loopback stack (scripts/ci/e2e-local.sh <spec>) and refuses any
 * other target before it writes.
 *
 * The manifest is exact and prospective: every id the rehearsal creates is
 * fixed here, except the rows the product itself creates during the journey
 * (context, courses, assignment, instance, grants, responses, results), which
 * are owned through the two synthetic schools and are inventoried and removed
 * by school / course / instance.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { publishTemplate } from '../../../lib/services/assessment-builder/publishTemplate';

export const SYNTHETIC_LABEL = 'LOCAL SYNTHETIC / NOT REAL PILOT EVIDENCE';

export interface ViewportRun {
  key: 'desktop' | 'mobile';
  viewport: { width: number; height: number };
  schoolId: number;
  schoolName: string;
  director: SyntheticUser;
  docente: SyntheticUser;
}

export interface SyntheticUser {
  key: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'equipo_directivo' | 'docente' | 'admin';
  id?: string; // filled by seed (auth admin API assigns it)
}

const user = (key: string, role: SyntheticUser['role'], first: string): SyntheticUser => ({
  key,
  email: `proc-pilot-${key}@rehearsal.invalid`,
  password: `ProcPilot-Synthetic-${key}-2026!`,
  firstName: first,
  lastName: 'Sintético',
  role,
});

export const MANIFEST = {
  publisher: user('publisher', 'admin', 'Publicador'),
  grade: { id: 990905, name: '1° Básico', sortOrder: 5, isAlwaysGt: true },
  template: {
    id: 'b0100000-0000-4000-8000-0000000000e1',
    name: '[SINTÉTICO] Ensayo piloto — Evaluación 1° Básico',
    area: 'evaluacion',
    objectiveId: 'b0100000-0000-4000-8000-0000000000b1',
    moduleId: 'b0100000-0000-4000-8000-0000000000c1',
    moduleName: '[SINTÉTICO] Módulo de práctica',
    indicators: [
      { id: 'b0100000-0000-4000-8000-0000000000d1', code: 'SIN-PIL-01', category: 'cobertura', name: '[SINTÉTICO] Existe un plan de retroalimentación', order: 1 },
      { id: 'b0100000-0000-4000-8000-0000000000d2', code: 'SIN-PIL-02', category: 'frecuencia', name: '[SINTÉTICO] Instancias de retroalimentación', order: 2,
        frequencyConfig: { min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana', 'mes'] } },
      { id: 'b0100000-0000-4000-8000-0000000000d3', code: 'SIN-PIL-03', category: 'profundidad', name: '[SINTÉTICO] Profundidad de la práctica', order: 3 },
    ],
  },
  // Answers and the scores they must produce (scoringService: cobertura Sí = 100,
  // frecuencia (5 − 0)/(10 − 0) = 50, profundidad 3/4 = 75; equal weights → 75).
  answers: { cobertura: true, frecuencia: 5, profundidad: 3 },
  expectedScores: { cobertura: 100, frecuencia: 50, profundidad: 75, total: 75 },
  runs: [
    { key: 'desktop', viewport: { width: 1280, height: 800 }, schoolId: 990781,
      schoolName: '[SINTÉTICO] Colegio Ensayo Piloto (escritorio)',
      director: user('dir-desktop', 'equipo_directivo', 'Directora'), docente: user('doc-desktop', 'docente', 'Docente') },
    { key: 'mobile', viewport: { width: 375, height: 667 }, schoolId: 990782,
      schoolName: '[SINTÉTICO] Colegio Ensayo Piloto (móvil)',
      director: user('dir-mobile', 'equipo_directivo', 'Directora'), docente: user('doc-mobile', 'docente', 'Docente') },
  ] as ViewportRun[],
  // Context-questionnaire rows the edit page needs (the table ships empty).
  contextQuestions: [
    { key: 'proc_pilot_total_students', widget: 'total_students', type: 'number', text: '[SINTÉTICO] Total de estudiantes', order: 1 },
    { key: 'proc_pilot_grade_levels', widget: 'grade_levels', type: 'multiselect', text: '[SINTÉTICO] Niveles', order: 2 },
    { key: 'proc_pilot_courses_per_level', widget: 'courses_per_level', type: 'number', text: '[SINTÉTICO] Cursos por nivel', order: 3 },
    { key: 'proc_pilot_implementation_year', widget: 'implementation_year', type: 'number', text: '[SINTÉTICO] Año de implementación', order: 4 },
    { key: 'proc_pilot_period_system', widget: 'period_system', type: 'select', text: '[SINTÉTICO] Sistema de períodos', order: 5 },
  ],
} as const;

const SHARED_PORTS = new Set(['54321', '54322', '54421', '54422', '55121', '55122']);

/** Refuses anything but an explicitly requested private loopback stack. Returns why, or null when safe. */
export function unsafeTargetReason(): string | null {
  if (process.env.E2E_LOCAL_EXPLICIT !== '1') return 'run it through scripts/ci/e2e-local.sh <spec> (private stack)';
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const db = process.env.SUPABASE_DB_URL ?? '';
  for (const [name, raw] of [['NEXT_PUBLIC_SUPABASE_URL', api], ['SUPABASE_DB_URL', db]] as const) {
    if (!raw) return `${name} is not set`;
    const u = new URL(raw.replace(/^postgres(ql)?:\/\//, 'http://'));
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return `${name} is not loopback`;
    if (SHARED_PORTS.has(u.port)) return `${name} uses a shared port (${u.port})`;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 'SUPABASE_SERVICE_ROLE_KEY is not set';
  return null;
}

export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function db(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, application_name: 'proc-pilot-rehearsal' });
  await c.connect();
  return c;
}

function allUsers(): SyntheticUser[] {
  return [MANIFEST.publisher, ...MANIFEST.runs.flatMap((r) => [r.director, r.docente])];
}
const schoolIds = () => MANIFEST.runs.map((r) => r.schoolId);

/** What the fixture created on its own (not product rows); filled by seed, read by cleanup. */
export const created = { gradeRow: false, questionIds: [] as string[] };

export async function seed(svc: SupabaseClient, c: pg.Client): Promise<void> {
  const { rows: pre } = await c.query('SELECT count(*)::int AS n FROM public.schools WHERE id = ANY($1::int[])', [schoolIds()]);
  if (pre[0].n !== 0) throw new Error(`[${SYNTHETIC_LABEL}] fixture schools already exist — refusing to seed over them`);

  for (const u of allUsers()) {
    const { data, error } = await svc.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${u.key}: ${error?.message}`);
    u.id = data.user.id;
  }
  for (const run of MANIFEST.runs) {
    await c.query('INSERT INTO public.schools (id, name) VALUES ($1, $2)', [run.schoolId, run.schoolName]);
  }
  for (const u of allUsers()) {
    const schoolId = MANIFEST.runs.find((r) => r.director === u || r.docente === u)?.schoolId ?? null;
    await c.query(
      `INSERT INTO public.profiles (id, email, name, first_name, last_name, approval_status, school_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, 'approved', $6, false)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name, approval_status = 'approved', school_id = EXCLUDED.school_id, must_change_password = false`,
      [u.id, u.email, `${u.firstName} ${u.lastName}`, u.firstName, u.lastName, schoolId]
    );
    await c.query('INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES ($1, $2, $3, true)', [u.id, u.role, schoolId]);
  }

  const g = MANIFEST.grade;
  const { rows: grade } = await c.query('SELECT id FROM public.ab_grades WHERE sort_order = $1', [g.sortOrder]);
  if (grade.length === 0) {
    await c.query('INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt) VALUES ($1, $2, $3, $4)', [g.id, g.name, g.sortOrder, g.isAlwaysGt]);
    created.gradeRow = true;
  } else if (grade[0].id !== g.id) {
    throw new Error(`[${SYNTHETIC_LABEL}] ab_grades already maps sort_order ${g.sortOrder} to ${grade[0].id}; use a fresh stack`);
  }

  for (const q of MANIFEST.contextQuestions) {
    const { rows: have } = await c.query('SELECT 1 FROM public.context_general_questions WHERE widget_type = $1 AND is_active', [q.widget]);
    if (have.length) continue;
    const { rows } = await c.query(
      `INSERT INTO public.context_general_questions (question_key, question_text, question_type, widget_type, is_active, is_required, display_order)
       VALUES ($1, $2, $3, $4, true, false, $5) RETURNING id`,
      [q.key, q.text, q.type, q.widget, q.order]
    );
    created.questionIds.push(rows[0].id);
  }

  const t = MANIFEST.template;
  await c.query(
    `INSERT INTO public.assessment_templates (id, area, version, name, status, is_archived, grade_id) VALUES ($1, $2, '1.0.0', $3, 'draft', false, $4)`,
    [t.id, t.area, t.name, g.id]
  );
  await c.query(`INSERT INTO public.assessment_objectives (id, template_id, name, display_order, weight) VALUES ($1, $2, '[SINTÉTICO] Objetivo de práctica', 1, 1)`, [t.objectiveId, t.id]);
  await c.query(`INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order, weight) VALUES ($1, $2, $3, $4, 1, 1)`, [t.moduleId, t.id, t.objectiveId, t.moduleName]);
  for (const ind of t.indicators) {
    await c.query(
      `INSERT INTO public.assessment_indicators (id, module_id, code, name, category, display_order, weight, frequency_config)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7)`,
      [ind.id, t.moduleId, ind.code, ind.name, ind.category, ind.order, 'frequencyConfig' in ind ? JSON.stringify(ind.frequencyConfig) : null]
    );
  }
  const result = await publishTemplate(svc as never, t.id, { id: MANIFEST.publisher.id! });
  if (!result.ok) throw new Error(`publishTemplate: ${JSON.stringify(result)}`);
}

const OWNED_TABLES_SQL = `
  WITH sch AS (SELECT unnest($1::int[]) AS id),
       crs AS (SELECT id FROM public.school_course_structure WHERE school_id IN (SELECT id FROM sch)),
       ins AS (SELECT id FROM public.assessment_instances WHERE school_id IN (SELECT id FROM sch)
                 OR template_snapshot_id IN (SELECT id FROM public.assessment_template_snapshots WHERE template_id = $2::uuid))
  SELECT 'schools' AS t, count(*)::int AS n FROM public.schools WHERE id IN (SELECT id FROM sch)
  UNION ALL SELECT 'school_transversal_context', count(*)::int FROM public.school_transversal_context WHERE school_id IN (SELECT id FROM sch)
  UNION ALL SELECT 'school_course_structure', count(*)::int FROM crs
  UNION ALL SELECT 'school_course_docente_assignments', count(*)::int FROM public.school_course_docente_assignments WHERE course_structure_id IN (SELECT id FROM crs)
  UNION ALL SELECT 'assessment_instances', count(*)::int FROM ins
  UNION ALL SELECT 'assessment_instance_assignees', count(*)::int FROM public.assessment_instance_assignees WHERE instance_id IN (SELECT id FROM ins)
  UNION ALL SELECT 'assessment_responses', count(*)::int FROM public.assessment_responses WHERE instance_id IN (SELECT id FROM ins)
  UNION ALL SELECT 'assessment_instance_results', count(*)::int FROM public.assessment_instance_results WHERE instance_id IN (SELECT id FROM ins)
  UNION ALL SELECT 'assessment_templates', count(*)::int FROM public.assessment_templates WHERE id = $2::uuid
  UNION ALL SELECT 'assessment_template_snapshots', count(*)::int FROM public.assessment_template_snapshots WHERE template_id = $2::uuid
  UNION ALL SELECT 'user_roles', count(*)::int FROM public.user_roles WHERE user_id = ANY($3::uuid[])
  UNION ALL SELECT 'profiles', count(*)::int FROM public.profiles WHERE id = ANY($3::uuid[])
  UNION ALL SELECT 'auth.users', count(*)::int FROM auth.users WHERE email LIKE 'proc-pilot-%@rehearsal.invalid'`;

/** Read-only inventory of everything the rehearsal owns. */
export async function inventory(c: pg.Client): Promise<Record<string, number>> {
  const ids = allUsers().map((u) => u.id).filter(Boolean);
  const { rows } = await c.query(OWNED_TABLES_SQL, [schoolIds(), MANIFEST.template.id, ids]);
  return Object.fromEntries(rows.map((r) => [r.t, r.n]));
}

/**
 * Every public table that has a school_id, user_id, docente_id, course_structure_id or
 * instance_id column: rows that still point at the rehearsal's schools or users.
 * Catches product writes the explicit list above does not name.
 */
export async function residualScan(c: pg.Client): Promise<string[]> {
  const ids = allUsers().map((u) => u.id).filter(Boolean) as string[];
  const { rows: cols } = await c.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name IN ('school_id', 'user_id', 'docente_id', 'responded_by', 'assigned_by', 'created_by')
        AND data_type IN ('integer', 'bigint', 'uuid')`
  );
  const found: string[] = [];
  for (const { table_name: t, column_name: col, data_type: type } of cols) {
    const sql = type === 'uuid'
      ? `SELECT count(*)::int AS n FROM public."${t}" WHERE "${col}" = ANY($1::uuid[])`
      : `SELECT count(*)::int AS n FROM public."${t}" WHERE "${col}" = ANY($1::int[])`;
    const { rows } = await c.query(sql, [type === 'uuid' ? ids : schoolIds()]);
    if (rows[0].n > 0) found.push(`${t}.${col}: ${rows[0].n}`);
  }
  return found;
}

/** Removes every row the rehearsal owns, children first, then verifies. Synthetic stack only. */
export async function cleanup(svc: SupabaseClient, c: pg.Client): Promise<{ residual: string[]; after: Record<string, number> }> {
  const ids = allUsers().map((u) => u.id).filter(Boolean) as string[];
  const sch = schoolIds();
  const tpl = MANIFEST.template.id;
  const insSql = `SELECT id FROM public.assessment_instances WHERE school_id = ANY($1::int[])
                   OR template_snapshot_id IN (SELECT id FROM public.assessment_template_snapshots WHERE template_id = $2::uuid)`;
  await c.query(`DELETE FROM public.assessment_instance_results WHERE instance_id IN (${insSql})`, [sch, tpl]);
  await c.query(`DELETE FROM public.assessment_responses WHERE instance_id IN (${insSql})`, [sch, tpl]);
  await c.query(`DELETE FROM public.assessment_instance_assignees WHERE instance_id IN (${insSql})`, [sch, tpl]);
  await c.query(`DELETE FROM public.assessment_instances WHERE id IN (${insSql})`, [sch, tpl]);
  await c.query('DELETE FROM public.assessment_year_expectations WHERE template_id = $1', [tpl]);
  await c.query('DELETE FROM public.assessment_entity_year_weights WHERE template_id = $1', [tpl]);
  await c.query('DELETE FROM public.assessment_indicators WHERE module_id = $1', [MANIFEST.template.moduleId]);
  await c.query('DELETE FROM public.assessment_modules WHERE template_id = $1', [tpl]);
  await c.query('DELETE FROM public.assessment_objectives WHERE template_id = $1', [tpl]);
  await c.query('DELETE FROM public.assessment_template_snapshots WHERE template_id = $1', [tpl]);
  await c.query('DELETE FROM public.assessment_templates WHERE id = $1', [tpl]);
  await c.query(`DELETE FROM public.school_course_docente_assignments WHERE course_structure_id IN
                   (SELECT id FROM public.school_course_structure WHERE school_id = ANY($1::int[]))`, [sch]);
  await c.query('DELETE FROM public.school_course_structure WHERE school_id = ANY($1::int[])', [sch]);
  await c.query('DELETE FROM public.school_change_history WHERE school_id = ANY($1::int[])', [sch]);
  await c.query('DELETE FROM public.school_transversal_context WHERE school_id = ANY($1::int[])', [sch]);
  await c.query('DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[])', [ids]);
  await c.query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [ids]);
  for (const id of ids) await svc.auth.admin.deleteUser(id);
  await c.query('DELETE FROM public.schools WHERE id = ANY($1::int[])', [sch]);
  if (created.questionIds.length) await c.query('DELETE FROM public.context_general_questions WHERE id = ANY($1::uuid[])', [created.questionIds]);
  if (created.gradeRow) await c.query('DELETE FROM public.ab_grades WHERE id = $1', [MANIFEST.grade.id]);
  const after = await inventory(c);
  const residual = await residualScan(c);
  return { residual, after };
}

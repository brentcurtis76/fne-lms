import { test, expect } from '@playwright/test';
import pg from 'pg';
import { E2E_USERS, loginViaUi } from './helpers/auth';

const db = process.env.SUPABASE_DB_URL!;
if (![db, process.env.NEXT_PUBLIC_SUPABASE_URL!].every(url =>
  ['localhost', '127.0.0.1'].includes(new URL(url).hostname))) throw new Error('Synthetic local stack only');
const id = (n: number) => `de110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const title = 'Registro sintético de publicación tardía';
async function sql(query: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: db });
  await client.connect();
  try { return (await client.query(query, values)).rows; } finally { await client.end(); }
}

test('late publication reaches the assigned teacher through cron and survives republication', async ({ page, request }) => {
  test.setTimeout(120_000);
  const [{ id: teacher }] = await sql('SELECT id FROM auth.users WHERE email=$1', [E2E_USERS.docente.email]);
  // Only this spec's fixed synthetic fixture is cleaned up on retry.
  await sql('DELETE FROM assessment_instances WHERE template_snapshot_id IN (SELECT id FROM assessment_template_snapshots WHERE template_id=$1)', [id(3)]);
  await sql('DELETE FROM assessment_template_snapshots WHERE template_id=$1', [id(3)]);
  await sql('DELETE FROM assessment_templates WHERE id=$1', [id(3)]);
  await sql('DELETE FROM school_course_docente_assignments WHERE course_structure_id=$1', [id(2)]);
  await sql('DELETE FROM school_course_structure WHERE id=$1', [id(2)]);
  await sql(`INSERT INTO school_transversal_context
    (id,school_id,total_students,grade_levels,courses_per_level,implementation_year_2026,period_system)
    VALUES($1,990001,100,ARRAY['1_basico'],'{"1_basico":1}',2,'semestral') ON CONFLICT(id) DO NOTHING`, [id(1)]);
  await sql("INSERT INTO ab_grades(id,name,sort_order,is_always_gt) VALUES(991171,'Nivel sintético de entrega',991171,true) ON CONFLICT(id) DO NOTHING");
  await sql(`INSERT INTO school_course_structure(id,school_id,context_id,grade_level,course_name,grade_id)
    VALUES($1,990001,$2,'1_basico','Curso sintético de entrega',991171)`, [id(2), id(1)]);
  await sql('INSERT INTO school_course_docente_assignments(course_structure_id,docente_id,is_active) VALUES($1,$2,true)', [id(2), teacher]);
  await sql(`INSERT INTO assessment_templates(id,area,version,name,status,is_archived,grade_id)
    SELECT $1,'personalizacion','1.0',$2,'draft',false,grade_id FROM school_course_structure WHERE id=$3`, [id(3), title, id(2)]);
  await sql(`INSERT INTO assessment_template_snapshots(id,template_id,version,snapshot_data)
    VALUES($1,$2,'1.0',$3)`, [id(4), id(3), JSON.stringify({ template: { name: title, area: 'personalizacion' }, modules: [] })]);
  await sql("UPDATE assessment_delivery_reconcile_state SET scan_key=''");

  expect((await request.get('/api/cron/assessment-delivery')).status()).toBe(401);
  await loginViaUi(page, E2E_USERS.docente);
  const before = await page.request.get('/api/docente/assessments');
  expect(before.status()).toBe(200);
  expect((await before.json()).assessments.some((row: { templateId: string }) => row.templateId === id(3))).toBe(false);

  // Publication occurs AFTER the teacher assignment, reproducing the incident.
  await sql("UPDATE assessment_templates SET status='published' WHERE id=$1", [id(3)]);
  const headers = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
  const delivered = await request.get('/api/cron/assessment-delivery', { headers });
  expect(delivered.status()).toBe(200);
  expect((await delivered.json()).created).toBeGreaterThanOrEqual(1);
  const after = await page.request.get('/api/docente/assessments');
  expect(after.status()).toBe(200);
  const matching = (await after.json()).assessments.filter((row: { templateId: string }) => row.templateId === id(3));
  expect(matching).toHaveLength(1);
  expect(matching[0]).toMatchObject({ templateName: title, status: 'pending', canEdit: true, canSubmit: true });
  await page.goto('/docente/assessments');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Mis Registros/ })).toBeVisible();

  await sql("UPDATE assessment_instances SET status='in_progress' WHERE id=$1", [matching[0].id]);
  await sql(`INSERT INTO assessment_template_snapshots(id,template_id,version,snapshot_data)
    SELECT $1,template_id,'2.0',snapshot_data FROM assessment_template_snapshots WHERE id=$2`, [id(5), id(4)]);
  await sql("UPDATE assessment_delivery_reconcile_state SET scan_key=''");
  expect((await request.get('/api/cron/assessment-delivery', { headers })).status()).toBe(200);
  const existing = await sql(`SELECT i.id,i.status,i.template_snapshot_id FROM assessment_instances i
    JOIN assessment_template_snapshots s ON s.id=i.template_snapshot_id WHERE s.template_id=$1 AND i.course_structure_id=$2`, [id(3), id(2)]);
  expect(existing).toEqual([{ id: matching[0].id, status: 'in_progress', template_snapshot_id: id(4) }]);
});

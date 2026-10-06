import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { E2E_USERS, loginViaUi } from './helpers/auth';

const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const db = process.env.SUPABASE_DB_URL!;
if (![api, db].every(url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname))) throw new Error('Synthetic local stack only');
const id = (n: number) => `ac110000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const community = 'e2e00000-0000-4000-8000-000000000c01';
let workspace: string;
let member: string;
async function sql(text: string, args: unknown[] = []) {
  const client = new pg.Client({ connectionString: db });
  await client.connect();
  try { return (await client.query(text, args)).rows; } finally { await client.end(); }
}
async function asUser(key: keyof typeof E2E_USERS) {
  const client = createClient(api, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const result = await client.auth.signInWithPassword(E2E_USERS[key]);
  expect(result.error).toBeNull();
  return client;
}
test.describe.serial('finance and messaging access boundaries', () => {
  test.setTimeout(120_000);
  test.beforeAll(async () => {
    // Retry cleanup touches only this spec's fixed synthetic UUIDs, on loopback.
    const groups = [id(6), id(7), id(12)];
    await sql('DELETE FROM message_attachments WHERE message_id IN (SELECT id FROM community_messages WHERE thread_id IN (SELECT thread_id FROM group_assignment_discussions WHERE group_id=ANY($1::uuid[])) OR thread_id=$2)', [groups, id(13)]);
    await sql('DELETE FROM community_messages WHERE thread_id IN (SELECT thread_id FROM group_assignment_discussions WHERE group_id=ANY($1::uuid[])) OR thread_id=$2', [groups, id(13)]);
    const threads = (await sql('SELECT thread_id FROM group_assignment_discussions WHERE group_id=ANY($1::uuid[])', [groups])).map(row => row.thread_id);
    await sql('DELETE FROM group_assignment_discussions WHERE group_id=ANY($1::uuid[])', [groups]);
    await sql('DELETE FROM message_threads WHERE id=ANY($1::uuid[]) OR id=$2', [threads, id(13)]);
    await sql('DELETE FROM group_assignment_members WHERE group_id=ANY($1::uuid[])', [groups]);
    await sql('DELETE FROM group_assignment_groups WHERE id=ANY($1::uuid[])', [groups]);
    await sql('DELETE FROM contract_hours_ledger WHERE allocation_id IN (SELECT id FROM contract_hour_allocations WHERE contrato_id=$1)', [id(9)]);
    await sql('DELETE FROM session_facilitators WHERE session_id=$1', [id(16)]);
    await sql('DELETE FROM consultor_sessions WHERE id=$1', [id(16)]);
    await sql('DELETE FROM contract_hour_allocations WHERE contrato_id=$1', [id(9)]);
    await sql('DELETE FROM cuotas WHERE contrato_id=$1', [id(9)]);
    await sql('DELETE FROM contratos WHERE id=$1', [id(9)]);
    await sql('DELETE FROM clientes WHERE id=$1', [id(8)]);
    await sql('DELETE FROM blocks WHERE course_id=$1', [id(2)]);
    await sql('DELETE FROM course_enrollments WHERE course_id=$1', [id(2)]);
    await sql('DELETE FROM lessons WHERE course_id=$1', [id(2)]);
    await sql('DELETE FROM modules WHERE course_id=$1', [id(2)]);
    await sql('DELETE FROM courses WHERE id=$1', [id(2)]);
    await sql('DELETE FROM instructors WHERE id=$1', [id(1)]);
    [ { id: member } ] = await sql('SELECT id FROM auth.users WHERE email=$1', [E2E_USERS.gcLeader.email]);
    await sql('INSERT INTO community_workspaces(community_id) SELECT $1 WHERE NOT EXISTS(SELECT 1 FROM community_workspaces WHERE community_id=$1)', [community]);
    [ { id: workspace } ] = await sql('SELECT id FROM community_workspaces WHERE community_id=$1', [community]);
    await sql('INSERT INTO instructors(id,full_name) VALUES($1,$2)', [id(1), 'Synthetic access instructor']);
    await sql('INSERT INTO courses(id,title,description,instructor_id) VALUES($1,$2,$2,$3)', [id(2), 'Synthetic access course', id(1)]);
    await sql('INSERT INTO modules(id,course_id,title,order_number) VALUES($1,$2,$3,0)', [id(14), id(2), 'Synthetic access module']);
    await sql('INSERT INTO lessons(id,module_id,course_id,title,order_number) VALUES($1,$2,$3,$4,0)', [id(3), id(14), id(2), 'Synthetic access lesson']);
    await sql("INSERT INTO course_enrollments(course_id,user_id,status,access_origin) VALUES($1,$2,'active','independent')", [id(2), member]);
    for (const [block, group, scope] of [[id(4), id(6), community], [id(5), id(7), null], [id(11), id(12), community]]) {
      await sql("INSERT INTO blocks(id,course_id,lesson_id,position,type,payload) VALUES($1,$2,$3,$4,'group-assignment',$5)", [block, id(2), id(3), scope ? 0 : 1, JSON.stringify({ title: `Synthetic access ${block === id(11) ? 'legacy' : scope ? 'community' : 'school'}`, instructions: 'Synthetic group discussion' })]);
      await sql('INSERT INTO group_assignment_groups(id,assignment_id,name,school_id,community_id) VALUES($1,$2,$3,990001,$4)', [group, block, 'Synthetic access group', scope]);
      await sql("INSERT INTO group_assignment_members(group_id,assignment_id,user_id,role) VALUES($1,$2,$3,'leader')", [group, block, member]);
    }
    await sql("INSERT INTO clientes(id,nombre_legal,nombre_fantasia,rut,direccion,nombre_representante,rut_representante,fecha_escritura,nombre_notario,school_id) VALUES($1,'Synthetic access legal','Synthetic','111-0','Synthetic','PRIVATE-REPRESENTATIVE','PRIVATE-RUT-112','2026-01-01','Synthetic',990001)", [id(8)]);
    await sql("INSERT INTO contratos(id,numero_contrato,fecha_contrato,cliente_id,estado,horas_contratadas) VALUES($1,'Synthetic access','2026-01-01',$2,'activo',1)", [id(9), id(8)]);
    await sql("INSERT INTO cuotas(id,contrato_id,numero_cuota,fecha_vencimiento,monto_uf) VALUES($1,$2,1,'2026-12-01',1)", [id(10), id(9)]);
    await sql('INSERT INTO message_threads(id,workspace_id,thread_title,created_by) VALUES($1,NULL,$2,$3)', [id(13), 'Synthetic legacy NULL thread', member]);
    await sql('INSERT INTO group_assignment_discussions(assignment_id,group_id,workspace_id,thread_id) VALUES($1,$2,NULL,$3)', [id(11), id(12), id(13)]);
    const [{ id: consultant }] = await sql('SELECT id FROM auth.users WHERE email=$1', [E2E_USERS.consultorAssigned.email]);
    await sql("INSERT INTO hour_types(id,key,display_name,modality) VALUES($1,'synthetic_access_presencial','Synthetic access hours','presencial') ON CONFLICT(id) DO NOTHING", [id(15)]);
    const [{ id: hourType, key: hourKey }] = await sql('SELECT id,key FROM hour_types WHERE id=$1', [id(15)]);
    await sql('INSERT INTO contract_hour_allocations(id,contrato_id,hour_type_id,allocated_hours,created_by) VALUES($1,$2,$3,1,$4)', [id(18), id(9), hourType, member]);
    await sql("INSERT INTO consultor_sessions(id,school_id,growth_community_id,title,session_date,start_time,end_time,modality,status,created_by,contrato_id,hour_type_key) VALUES($1,990001,$2,'Synthetic access hours','2026-12-01','09:00','10:00','presencial','borrador',$3,$4,$5)", [id(16), community, member, id(9), hourKey]);
    await sql("INSERT INTO session_facilitators(id,session_id,user_id,facilitator_role) VALUES($1,$2,$3,'consultor_externo')", [id(17), id(16), consultant]);
    await sql("INSERT INTO contract_hours_ledger(id,allocation_id,session_id,hours,status,session_date,recorded_by) VALUES($1,$2,$3,0.5,'consumida','2026-12-01',$4)", [id(19), id(18), id(16), member]);
    await sql('REFRESH MATERIALIZED VIEW user_roles_cache');
  });
  test('real PostgREST identities enforce admin-only finance and preserve admin updates', async () => {
    for (const key of ['gcLeader', 'consultorAssigned', 'directivo', 'procurementManager', 'admin'] as const) {
      const client = await asUser(key);
      for (const [table, fixture] of [['clientes', id(8)], ['contratos', id(9)], ['cuotas', id(10)]]) {
        const read = await client.from(table).select(table === 'contratos' ? 'id,snapshot_nombre_representante,snapshot_rut_representante,clientes(nombre_representante,rut_representante)' : 'id').eq('id', fixture);
        expect(read.error).toBeNull();
        expect(read.data).toHaveLength(key === 'admin' ? 1 : 0);
        const update = await client.from(table).update(table === 'clientes' ? { comuna: 'Synthetic updated' } : table === 'contratos' ? { numero_contrato: 'Synthetic updated' } : { factura_filename: 'Synthetic updated' }).eq('id', fixture).select('id');
        expect(update.error).toBeNull();
        expect(update.data).toHaveLength(key === 'admin' ? 1 : 0);
      }
    }
  });
  test('authorized limited contract and school-hour summaries remain available without legal fields', async ({ request }) => {
    for (const [key, allowed] of [['directivo', true], ['consultorAssigned', true], ['admin', true], ['gcLeader', false], ['consultorOtherSchool', false]] as const) {
      const client = await asUser(key);
      const { data: { session } } = await client.auth.getSession();
      const headers = { Authorization: `Bearer ${session!.access_token}` };
      const summary = await request.get(`/api/contracts/${id(9)}/hours`, { headers });
      expect(summary.status()).toBe(allowed ? 200 : 403);
      if (!allowed) continue;
      const body = await summary.json();
      expect(body.data.horas_contratadas).toBe(1);
      expect(body.data.buckets.some((bucket: { consumed: number }) => Number(bucket.consumed) === 0.5)).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/PRIVATE-|snapshot_|precio_total_uf|nombre_representante|rut_representante/);
      const ledger = await request.get(`/api/contracts/${id(9)}/hours/ledger`, { headers });
      expect(ledger.status()).toBe(200);
      expect((await ledger.json()).data.ledger.some((entry: { id: string }) => entry.id === id(19))).toBe(true);
      expect(await ledger.text()).not.toMatch(/PRIVATE-|snapshot_|precio_total_uf|nombre_representante|rut_representante/);
      const csv = await request.get(`/api/contracts/${id(9)}/hours/ledger/csv`, { headers });
      expect(csv.status()).toBe(200);
      expect(await csv.text()).toContain('Synthetic access hours');
      expect(await csv.text()).not.toContain('PRIVATE-');
      if (key === 'consultorAssigned') continue; // school reports retain their admin/own-school leadership audience
      const school = await request.get('/api/school-hours-report/990001', { headers });
      expect(school.status()).toBe(200);
      expect((await school.json()).data.programs.flatMap((program: { contracts: { contrato_id: string }[] }) => program.contracts).some((contract: { contrato_id: string }) => contract.contrato_id === id(9))).toBe(true);
      expect(await school.text()).not.toMatch(/PRIVATE-|snapshot_|precio_total_uf|nombre_representante|rut_representante/);
      const pdf = await request.get(`/api/school-hours-report/990001/pdf?contrato_id=${id(9)}`, { headers });
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()['content-type']).toContain('application/pdf');
    }
    const foreign = await asUser('directivoSecondary');
    const { data: { session } } = await foreign.auth.getSession();
    const headers = { Authorization: `Bearer ${session!.access_token}` };
    expect((await request.get(`/api/contracts/${id(9)}/hours`, { headers })).status()).toBe(403);
    expect((await request.get('/api/school-hours-report/990001', { headers })).status()).toBe(403);
    const own = await asUser('directivo');
    expect((await own.from('contract_hours_ledger').select('session_id,status,admin_override').eq('id', id(19))).data).toHaveLength(1);
  });
  for (const [assignment, group, scope] of [[id(4), id(6), 'community'], [id(5), id(7), 'school'], [id(11), id(12), 'legacy']] as const) {
    test(`${scope} group: real page opens, sends, reloads; API blocks nonmembers`, async ({ browser }) => {
      const context = await browser.newContext();
      await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      const page = await context.newPage();
      page.on('pageerror', error => console.error('Group discussion page error:', error.message));
      await loginViaUi(page, E2E_USERS.gcLeader);
      await page.goto(`/community/workspace/assignments/${assignment}/discussion`);
      await expect(page.getByRole('heading', { name: `Discusión: Synthetic access ${scope}` })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Miembros del grupo (1)', exact: true })).toBeVisible();
      const body = `Synthetic private ${scope} message`;
      await page.getByPlaceholder('Escribe un mensaje...').fill(body);
      await page.getByRole('button', { name: /Enviar/, exact: false }).click();
      await expect(page.getByText(body, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(body, { exact: true })).toBeVisible();
      const [mapping] = await sql('SELECT thread_id FROM group_assignment_discussions WHERE group_id=$1', [group]);
      for (const [key, allowed] of [['gcLeader', true], ['consultorAssigned', true], ['admin', true], ['docente', false], ['consultorOtherSchool', false], ['consultorGlobal', false]] as const) {
        const client = await asUser(key);
        const thread = await client.from('message_threads').select('id').eq('id', mapping.thread_id);
        const messages = await client.from('community_messages').select('id').eq('thread_id', mapping.thread_id);
        expect(thread.error).toBeNull(); expect(messages.error).toBeNull();
        expect(thread.data).toHaveLength(allowed ? 1 : 0);
        expect(messages.data).toHaveLength(allowed ? 1 : 0);
      }
      const memberClient = await asUser('gcLeader');
      const retry = await memberClient.rpc('get_or_create_group_discussion', { p_assignment_id: assignment, p_group_id: group, p_workspace_id: scope === 'school' ? null : workspace, p_title: 'Retry', p_description: 'Synthetic' });
      expect(retry.error).toBeNull(); expect(retry.data.id).toBe(mapping.thread_id);
      await context.close();
    });
  }
});

/**
 * Vía assignment rules concurrency proof (20261008120000_via_assignment_rules).
 *
 * pgTAP runs in one session, so it cannot race two transactions. This script
 * does, against a started local stack, and checks the final state each time:
 *
 *   1. TWO FIRST ASSIGNS — two different directivos are assigned to the same
 *      (school, vía) at once. The (school, vía) advisory lock serializes them:
 *      exactly one succeeds, the other is refused responsible_already_assigned,
 *      and there is one active responsible and one registro per template.
 *   2. SAVE FIRST, THEN REPLACE — the current responsible holds an open
 *      response save (the guard holds FOR SHARE on the instance). A replace
 *      must BLOCK; when the save commits, the replace is refused
 *      registros_already_started and the committed answer is still there.
 *   3. REPLACE FIRST, THEN SAVE — a replace is held open. A save by the person
 *      being replaced must BLOCK; when the replace commits, the save is refused
 *      not_an_assignee. Nothing committed is lost.
 *   4. PUBLISH FIRST, THEN RULE CHANGE — a publish of a course-vía template is
 *      held open (the template guard holds FOR SHARE on the rule row). The rule
 *      change must BLOCK and, after the publish commits, refuse
 *      via_rule_has_published_templates.
 *   5. RULE CHANGE FIRST, THEN PUBLISH — a rule change is held open. A publish
 *      of a now-incompatible template must BLOCK and, after the change commits,
 *      be refused template_grade_not_allowed.
 *   6. LOCK ORDER (Codex B1 r1) — a third session holds the lower-id linked
 *      registro; a replace queues behind it, then a response moved from the
 *      higher-id registro to the lower one queues too. The response guard
 *      locks parents in ascending id order (as replace does), so it holds
 *      nothing while it waits: when the third session commits, the replace
 *      runs, sees the answer and is refused registros_already_started — never
 *      a deadlock (40P01) — and the move then commits.
 *
 * Every client has a statement timeout and the transaction sessions are
 * closed before cleanup, so a failed assertion exits non-zero instead of
 * hanging behind an open transaction.
 *
 * Run with `SUPABASE_DB_URL=... npm run test:via-rules-concurrency` against a
 * started LOCAL stack. Synthetic data only; fixed ids are purged before and
 * after, and every rule this script changes is restored.
 */
import pg from 'pg';

const { Client } = pg;

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const PROOF_TAG = 'via-rules-concurrency';

const SCHOOL_ID = 999821;
const GRADE_ID = 999821;
const U = (suffix) => `00000000-0000-4000-8000-0000000c${suffix}`;
const ADMIN_ID = U('0a01');
const DIR1_ID = U('0a02');
const DIR2_ID = U('0a03');
const DIR3_ID = U('0a04');
const USERS = [ADMIN_ID, DIR1_ID, DIR2_ID, DIR3_ID];
const CONTEXT_ID = U('00c1');
const LID_TEMPLATE_ID = U('00e1');
const LID_SNAPSHOT_ID = U('00f1');
const LID2_TEMPLATE_ID = U('00e4'); // second Liderazgo template: two linked registros (scenario 6)
const LID2_SNAPSHOT_ID = U('00f4');
const APR_TEMPLATE_ID = U('00e2'); // graded draft in a course vía (scenario 4)
const EVA_TEMPLATE_ID = U('00e3'); // graded draft in a course vía (scenario 5)
const ALL_TEMPLATES = [LID_TEMPLATE_ID, LID2_TEMPLATE_ID, APR_TEMPLATE_ID, EVA_TEMPLATE_ID];
const OBJECTIVE_ID = U('00b1');
const MODULE_ID = U('00b2');
const INDICATOR_ID = U('00b3');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`\n✗ FAIL [${PROOF_TAG}]: ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

function ok(message) {
  console.log(`  ✓ ${message}`);
}

function assertLocal(url) {
  const host = new URL(url.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
  const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`[${PROOF_TAG}] refusing to run against non-local database host "${host}".`);
  }
}

async function purge(admin) {
  await admin.query('DELETE FROM public.assessment_responses WHERE instance_id IN (SELECT id FROM public.assessment_instances WHERE school_id = $1)', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.assessment_instances WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.school_via_responsibles WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.assessment_indicators WHERE id = $1', [INDICATOR_ID]);
  await admin.query('DELETE FROM public.assessment_modules WHERE id = $1', [MODULE_ID]);
  await admin.query('DELETE FROM public.assessment_objectives WHERE id = $1', [OBJECTIVE_ID]);
  await admin.query('DELETE FROM public.assessment_template_snapshots WHERE template_id = ANY($1::uuid[])', [ALL_TEMPLATES]);
  await admin.query('DELETE FROM public.assessment_templates WHERE id = ANY($1::uuid[])', [ALL_TEMPLATES]);
  await admin.query('DELETE FROM public.school_transversal_context WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[])', [USERS]);
  await admin.query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [USERS]);
  await admin.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [USERS]);
  await admin.query('DELETE FROM public.schools WHERE id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.ab_grades WHERE id = $1', [GRADE_ID]);
  // Rules this script may change go back to their seeded targets.
  for (const area of ['aprendizaje', 'evaluacion']) {
    const { rows } = await admin.query('SELECT target FROM public.ab_via_assignment_rules WHERE area = $1', [area]);
    if (rows[0]?.target !== 'course_docente') {
      await admin.query(`SELECT public.set_via_assignment_rule($1, 'course_docente')`, [area]);
    }
  }
}

async function seed(admin) {
  await admin.query(`INSERT INTO public.ab_grades (id, name, sort_order) VALUES ($1, '[SINTÉTICO] via rules grade', $1)`, [GRADE_ID]);
  await admin.query(`INSERT INTO public.schools (id, name) VALUES ($1, '[SINTÉTICO] Via Rules Proof School')`, [SCHOOL_ID]);
  for (const [i, id] of USERS.entries()) {
    await admin.query(
      `INSERT INTO auth.users (id, email, instance_id, aud, role)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`,
      [id, `via-proof-${i}@rls-test.local`]
    );
    await admin.query(
      `INSERT INTO public.profiles (id, email, name, approval_status) VALUES ($1, $2, $3, 'approved')`,
      [id, `via-proof-${i}@rls-test.local`, `Via Proof Sintetico ${i}`]
    );
  }
  await admin.query(
    `INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
       ($1, 'admin', NULL, true), ($2, 'equipo_directivo', $5, true),
       ($3, 'equipo_directivo', $5, true), ($4, 'equipo_directivo', $5, true)`,
    [ADMIN_ID, DIR1_ID, DIR2_ID, DIR3_ID, SCHOOL_ID]
  );
  await admin.query(
    `INSERT INTO public.school_transversal_context
       (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
     VALUES ($1, $2, 100, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral')`,
    [CONTEXT_ID, SCHOOL_ID]
  );
  await admin.query(
    `INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id) VALUES
       ($1, 'liderazgo',   '1.0', '[SINTÉTICO] Via Proof LID', 'published', NULL),
       ($2, 'aprendizaje', '1.0', '[SINTÉTICO] Via Proof APR', 'draft', $4),
       ($3, 'evaluacion',  '1.0', '[SINTÉTICO] Via Proof EVA', 'draft', $4),
       ($5, 'liderazgo',   '1.0', '[SINTÉTICO] Via Proof LID 2', 'published', NULL)`,
    [LID_TEMPLATE_ID, APR_TEMPLATE_ID, EVA_TEMPLATE_ID, GRADE_ID, LID2_TEMPLATE_ID]
  );
  await admin.query(
    `INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data)
     VALUES ($1, $2, '1.0', '{"modules": []}'), ($3, $4, '1.0', '{"modules": []}')`,
    [LID_SNAPSHOT_ID, LID_TEMPLATE_ID, LID2_SNAPSHOT_ID, LID2_TEMPLATE_ID]
  );
  await admin.query(`INSERT INTO public.assessment_objectives (id, template_id, name, display_order) VALUES ($1, $2, 'Obj', 1)`, [OBJECTIVE_ID, LID_TEMPLATE_ID]);
  await admin.query(`INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order) VALUES ($1, $2, $3, 'Mod', 1)`, [MODULE_ID, LID_TEMPLATE_ID, OBJECTIVE_ID]);
  await admin.query(
    `INSERT INTO public.assessment_indicators (id, module_id, code, name, category, display_order) VALUES ($1, $2, 'I1', 'Ind', 'cobertura', 1)`,
    [INDICATOR_ID, MODULE_ID]
  );
}

async function begin(client, { role = 'service_role', sub = null } = {}) {
  await client.query('BEGIN');
  if (sub) {
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })]);
  }
  if (role) await client.query(`SELECT set_config('role', $1, true)`, [role]);
}

async function rpc(client, fn, args) {
  const { rows } = await client.query(`SELECT public.${fn}($1, $2, $3, $4) AS r`, args);
  return rows[0].r;
}

async function inTx(client, opts, fn) {
  await begin(client, opts);
  try {
    const result = await fn();
    await client.query('COMMIT');
    return { ok: true, result };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, error };
  }
}

async function waitForBlocked(observer, applicationName) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(
      `SELECT wait_event_type FROM pg_stat_activity WHERE application_name = $1 AND state = 'active'`,
      [applicationName]
    );
    if (rows.some((row) => row.wait_event_type === 'Lock')) return;
    await sleep(25);
  }
  fail(`session ${applicationName} never blocked on a lock`);
}

async function linkedInstance(admin) {
  const { rows } = await admin.query('SELECT instance_id FROM public.school_via_instance_links WHERE school_id = $1 AND template_id = $2', [SCHOOL_ID, LID_TEMPLATE_ID]);
  return rows[0]?.instance_id;
}

function expectError(outcome, code, label) {
  if (outcome.ok) fail(`${label}: expected ${code}, but it succeeded`);
  if (outcome.error.message !== code) fail(`${label}: expected ${code}, got ${outcome.error.message}`);
}

async function main() {
  assertLocal(DB_URL);

  const client = (name) => new Client({ connectionString: DB_URL, application_name: name, statement_timeout: 20000 });
  const admin = client('via-proof-admin');
  const observer = client('via-proof-observer');
  const sessionA = client('via-proof-a');
  const sessionB = client('via-proof-b');
  const sessionC = client('via-proof-c');
  await Promise.all([admin.connect(), observer.connect(), sessionA.connect(), sessionB.connect(), sessionC.connect()]);

  try {
    await purge(admin);
    await seed(admin);
    console.log(`[${PROOF_TAG}] fixtures seeded on ${DB_URL.replace(/:[^:@/]+@/, ':***@')}`);

    console.log('\n[1] two first assigns of different people');
    const both = await Promise.all([
      inTx(sessionA, {}, () => rpc(sessionA, 'assign_school_via_responsible', [SCHOOL_ID, 'liderazgo', DIR1_ID, ADMIN_ID])),
      inTx(sessionB, {}, () => rpc(sessionB, 'assign_school_via_responsible', [SCHOOL_ID, 'liderazgo', DIR2_ID, ADMIN_ID])),
    ]);
    const wins = both.filter((o) => o.ok);
    if (wins.length !== 1) fail(`expected exactly one assign to succeed, got ${wins.length}: ${both.map((o) => (o.ok ? "ok" : o.error.message)).join(" / ")}`);
    expectError(both.find((o) => !o.ok), 'responsible_already_assigned', '[1] loser');
    const { rows: active } = await admin.query('SELECT user_id FROM public.school_via_responsibles WHERE school_id = $1 AND is_active', [SCHOOL_ID]);
    const { rows: links } = await admin.query('SELECT count(*)::int AS n FROM public.school_via_instance_links WHERE school_id = $1', [SCHOOL_ID]);
    if (active.length !== 1 || links[0].n !== 2) fail(`[1] expected 1 active responsible and 2 registros, got ${active.length} / ${links[0].n}`);
    const current = active[0].user_id;
    const other = current === DIR1_ID ? DIR2_ID : DIR1_ID;
    ok('one assign won, the other was refused; one responsible, one registro per template');

    console.log('\n[2] held response save by the responsible vs. replace');
    const instanceId = await linkedInstance(admin);
    await begin(sessionB, { role: 'authenticated', sub: current });
    await sessionB.query(
      'INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by) VALUES ($1, $2, true, $3)',
      [instanceId, INDICATOR_ID, current]
    );
    const replace2 = inTx(sessionA, {}, () => rpc(sessionA, 'replace_school_via_responsible', [SCHOOL_ID, 'liderazgo', other, ADMIN_ID]));
    await waitForBlocked(observer, 'via-proof-a');
    ok('replace blocked behind the open save');
    await sessionB.query('COMMIT');
    expectError(await replace2, 'registros_already_started', '[2] replace');
    const { rows: saved } = await admin.query('SELECT count(*)::int AS n FROM public.assessment_responses WHERE instance_id = $1', [instanceId]);
    if (saved[0].n !== 1) fail('[2] the committed answer is missing');
    ok('replace refused after the save committed; the answer is kept');
    await admin.query('DELETE FROM public.assessment_responses WHERE instance_id = $1', [instanceId]);

    console.log('\n[3] held replace vs. response save by the person being replaced');
    await begin(sessionA);
    await rpc(sessionA, 'replace_school_via_responsible', [SCHOOL_ID, 'liderazgo', other, ADMIN_ID]);
    const save3 = inTx(sessionB, { role: 'authenticated', sub: current }, () =>
      sessionB.query(
        'INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by) VALUES ($1, $2, true, $3)',
        [instanceId, INDICATOR_ID, current]
      )
    );
    await waitForBlocked(observer, 'via-proof-b');
    ok('save blocked behind the open replace');
    await sessionA.query('COMMIT');
    expectError(await save3, 'not_an_assignee', '[3] save');
    const { rows: grants } = await admin.query('SELECT user_id FROM public.assessment_instance_assignees WHERE instance_id = $1', [instanceId]);
    if (grants.length !== 1 || grants[0].user_id !== other) fail('[3] the registro should now belong only to the new responsible');
    ok('save refused after the replace committed; the registro moved cleanly');

    console.log('\n[4] held publish of a course-vía template vs. rule change');
    await begin(sessionB, { role: null });
    await sessionB.query(`UPDATE public.assessment_templates SET status = 'published' WHERE id = $1`, [APR_TEMPLATE_ID]);
    const change4 = inTx(sessionA, { role: null }, () => sessionA.query(`SELECT public.set_via_assignment_rule('aprendizaje', 'school_responsible')`));
    await waitForBlocked(observer, 'via-proof-a');
    ok('rule change blocked behind the open publish');
    await sessionB.query('COMMIT');
    expectError(await change4, 'via_rule_has_published_templates', '[4] rule change');
    ok('rule change refused after the publish committed');

    console.log('\n[5] held rule change vs. publish of a now-incompatible template');
    await begin(sessionA, { role: null });
    await sessionA.query(`SELECT public.set_via_assignment_rule('evaluacion', 'school_responsible')`);
    const publish5 = inTx(sessionB, { role: null }, () =>
      sessionB.query(`UPDATE public.assessment_templates SET status = 'published' WHERE id = $1`, [EVA_TEMPLATE_ID])
    );
    await waitForBlocked(observer, 'via-proof-b');
    ok('publish blocked behind the open rule change');
    await sessionA.query('COMMIT');
    expectError(await publish5, 'template_grade_not_allowed', '[5] publish');
    const { rows: eva } = await admin.query('SELECT status FROM public.assessment_templates WHERE id = $1', [EVA_TEMPLATE_ID]);
    if (eva[0].status !== 'draft') fail('[5] the incompatible template must stay a draft');
    ok('publish refused after the rule change committed');

    console.log('\n[6] lock order: response moved between two linked registros vs. replace');
    const { rows: pair } = await admin.query(
      'SELECT instance_id FROM public.school_via_instance_links WHERE school_id = $1 ORDER BY instance_id', [SCHOOL_ID]
    );
    const [lowId, highId] = pair.map((r) => r.instance_id);
    await admin.query(
      'INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value) VALUES ($1, $2, true)',
      [highId, INDICATOR_ID]
    );
    await sessionC.query('BEGIN');
    await sessionC.query('SELECT 1 FROM public.assessment_instances WHERE id = $1 FOR UPDATE', [lowId]);
    const replace6 = inTx(sessionA, {}, () => rpc(sessionA, 'replace_school_via_responsible', [SCHOOL_ID, 'liderazgo', DIR3_ID, ADMIN_ID]));
    await waitForBlocked(observer, 'via-proof-a');
    const move6 = inTx(sessionB, { role: null }, () =>
      sessionB.query('UPDATE public.assessment_responses SET instance_id = $1 WHERE instance_id = $2', [lowId, highId])
    );
    await waitForBlocked(observer, 'via-proof-b');
    ok('replace and the response move both queue behind the held registro');
    await sessionC.query('COMMIT');
    const [r6, m6] = await Promise.all([replace6, move6]);
    if (!r6.ok && r6.error.code === '40P01') fail('[6] the replace deadlocked');
    if (!m6.ok) fail(`[6] the response move failed: ${m6.error.code ?? ''} ${m6.error.message}`);
    expectError(r6, 'registros_already_started', '[6] replace');
    ok('no deadlock: the replace was refused with the answer present; the move committed');

    console.log(`\n✓ PASS [${PROOF_TAG}]`);
  } finally {
    // Close the transaction sessions first: closing rolls back anything still
    // open, so cleanup can never wait behind a held lock.
    await Promise.all([sessionA.end(), sessionB.end(), sessionC.end()]).catch(() => {});
    await purge(admin).catch((e) => console.error(`[${PROOF_TAG}] purge failed: ${e.message}`));
    await Promise.all([admin.end(), observer.end()]).catch(() => {});
  }
}

main().catch((error) => {
  if (!process.exitCode) {
    console.error(error);
    process.exitCode = 1;
  }
});

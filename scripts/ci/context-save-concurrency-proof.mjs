/**
 * save_transversal_context concurrency proof (Procesos de Cambio review
 * remediation, R2).
 *
 * The former API sequence checked course dependencies with one statement and
 * deleted the courses with a later one, so an assignment or an instance
 * inserted between the two was cascaded / detached. Migration
 * 20260908100000 moves the whole reconciliation into ONE transactional RPC
 * that locks the school's course rows FOR UPDATE before it checks. A
 * concurrent INSERT that references a course holds KEY SHARE on that parent
 * row, which conflicts with FOR UPDATE — so the save must WAIT for the
 * competing insert and then see the dependency. This script is the proof
 * that the lock closes the race; no in-process test can race two database
 * sessions.
 *
 *   1. HELD-INSERT RACE — session B opens a transaction and inserts an
 *      (inactive!) docente assignment on course "1 BASICO B", holding it.
 *      Session A, as the school's directivo, calls the RPC with a structure
 *      that removes course B. A MUST block (observer sees wait_event_type
 *      'Lock'); if it completes while B holds, the race is open and the
 *      proof fails. When B commits, A must fail with P0001
 *      courses_have_dependencies and the course row must survive.
 *   2. HELD-INSTANCE RACE — same with an assessment instance insert (status
 *      'archived', the weakest possible dependency) on course B.
 *   3. SERIALISED SAVES — two saves of the same school fire together; the
 *      per-school advisory lock serialises them and the end state is exactly
 *      one context row with the last writer's structure.
 *   4. NO-DEPENDENCY BASELINE — with nothing referencing course B, the same
 *      shrinking save succeeds and deletes exactly that row.
 *
 * Talks to Postgres directly (pg), like the other proofs, because the lock is
 * enforced beneath every wire path. Run with
 * `npm run test:context-save-concurrency` against a started local stack.
 * Synthetic data only; the script pre-purges and re-purges its fixed ids.
 */
import pg from 'pg';

const { Client } = pg;

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const PROOF_TAG = 'context-save-concurrency';

const SCHOOL_ID = 999801;
const DIRECTIVO_ID = '00000000-0000-0000-0000-00000c5a0001';
const DOCENTE_ID = '00000000-0000-0000-0000-00000c5a0002';
const TEMPLATE_ID = '00000000-0000-0000-0000-00000c5a00e1';
const SNAPSHOT_ID = '00000000-0000-0000-0000-00000c5a00f1';
const GRADE_ID = 999805; // ab_grades sort_order 5 (1_basico)

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

const payload = (coursesForB1) =>
  JSON.stringify({
    total_students: 90,
    grade_levels: ['1_basico'],
    courses_per_level: { '1_basico': coursesForB1 },
    implementation_year_2026: 1,
    period_system: 'semestral',
    programa_inicia_completed: false,
  });

async function purge(admin) {
  await admin.query('DELETE FROM public.assessment_instances WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.assessment_template_snapshots WHERE id = $1', [SNAPSHOT_ID]);
  await admin.query('DELETE FROM public.assessment_templates WHERE id = $1', [TEMPLATE_ID]);
  await admin.query('DELETE FROM public.school_change_history WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.school_course_structure WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.school_transversal_context WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.user_roles WHERE user_id IN ($1, $2)', [DIRECTIVO_ID, DOCENTE_ID]);
  await admin.query('DELETE FROM public.profiles WHERE id IN ($1, $2)', [DIRECTIVO_ID, DOCENTE_ID]);
  await admin.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [DIRECTIVO_ID, DOCENTE_ID]);
  await admin.query('DELETE FROM public.schools WHERE id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.ab_grades WHERE id = $1 AND sort_order = 5', [GRADE_ID]);
}

async function seed(admin) {
  await admin.query(
    `INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
     VALUES ($1, '1° Básico (proof)', 5, true)
     ON CONFLICT (sort_order) DO NOTHING`,
    [GRADE_ID]
  );
  await admin.query(`INSERT INTO public.schools (id, name) VALUES ($1, 'Context Save Proof School') ON CONFLICT (id) DO NOTHING`, [SCHOOL_ID]);
  await admin.query(
    `INSERT INTO auth.users (id, email, instance_id, aud, role)
     VALUES
       ($1, 'ctx-proof-directivo@rls-test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ($2, 'ctx-proof-docente@rls-test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
     ON CONFLICT (id) DO NOTHING`,
    [DIRECTIVO_ID, DOCENTE_ID]
  );
  await admin.query(
    `INSERT INTO public.profiles (id, email, name, approval_status)
     VALUES
       ($1, 'ctx-proof-directivo@rls-test.local', 'Directivo Proof Sintetico', 'approved'),
       ($2, 'ctx-proof-docente@rls-test.local',   'Docente Proof Sintetico', 'approved')
     ON CONFLICT (id) DO NOTHING`,
    [DIRECTIVO_ID, DOCENTE_ID]
  );
  await admin.query(
    `INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
     VALUES ($1, 'equipo_directivo', $3, true), ($2, 'docente', $3, true)`,
    [DIRECTIVO_ID, DOCENTE_ID, SCHOOL_ID]
  );
  await admin.query(
    `INSERT INTO public.assessment_templates (id, area, version, name, status) VALUES ($1, 'lenguaje', '1.0', 'Context Save Proof Template', 'published')`,
    [TEMPLATE_ID]
  );
  await admin.query(
    `INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES ($1, $2, '1.0', '{"modules": []}')`,
    [SNAPSHOT_ID, TEMPLATE_ID]
  );
}

/** Runs `fn` as the directivo (authenticated role + JWT claims) inside one transaction. */
async function asDirectivo(client, fn) {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: DIRECTIVO_ID, role: 'authenticated', email: 'ctx-proof-directivo@rls-test.local' }),
    ]);
    await client.query(`SELECT set_config('role', 'authenticated', true)`);
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function saveAsDirectivo(client, coursesForB1) {
  return asDirectivo(client, async () => {
    const { rows } = await client.query('SELECT public.save_transversal_context($1, $2::jsonb) AS r', [SCHOOL_ID, payload(coursesForB1)]);
    return rows[0].r;
  });
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

async function courseIdByName(admin, name) {
  const { rows } = await admin.query('SELECT id FROM public.school_course_structure WHERE school_id = $1 AND course_name = $2', [SCHOOL_ID, name]);
  return rows[0]?.id ?? null;
}

async function heldDependencyRace({ admin, observer, sessionA, sessionB, label, holdInsert }) {
  const courseB = await courseIdByName(admin, '1 BASICO B');
  if (!courseB) fail(`${label}: course B is missing before the race`);

  await sessionB.query('BEGIN');
  await holdInsert(sessionB, courseB);

  let settled = false;
  const savePromise = saveAsDirectivo(sessionA, 1)
    .then((r) => ({ ok: true, r }))
    .catch((e) => ({ ok: false, e }))
    .finally(() => {
      settled = true;
    });

  await waitForBlocked(observer, 'ctx-proof-a');
  if (settled) fail(`${label}: the save completed while the competing insert was still held — race open`);
  ok(`${label}: the save blocked on the course row lock while the insert was held`);

  await sessionB.query('COMMIT');
  const outcome = await savePromise;
  if (outcome.ok) fail(`${label}: the save succeeded after the insert committed (dependency missed): ${JSON.stringify(outcome.r)}`);
  if (outcome.e.code !== 'P0001' || !String(outcome.e.message).startsWith('courses_have_dependencies')) {
    fail(`${label}: expected P0001 courses_have_dependencies, got ${outcome.e.code} ${outcome.e.message}`);
  }
  ok(`${label}: after the insert committed the save refused with courses_have_dependencies`);

  const stillThere = await courseIdByName(admin, '1 BASICO B');
  if (stillThere !== courseB) fail(`${label}: course B was deleted or replaced`);
  const { rows: ctx } = await admin.query('SELECT courses_per_level FROM public.school_transversal_context WHERE school_id = $1', [SCHOOL_ID]);
  if (ctx.length !== 1 || ctx[0].courses_per_level['1_basico'] !== 2) fail(`${label}: the context row changed although the save was refused`);
  ok(`${label}: course B and the context row are intact`);
}

async function main() {
  assertLocal(DB_URL);

  const admin = new Client({ connectionString: DB_URL, application_name: 'ctx-proof-admin' });
  const observer = new Client({ connectionString: DB_URL, application_name: 'ctx-proof-observer' });
  const sessionA = new Client({ connectionString: DB_URL, application_name: 'ctx-proof-a' });
  const sessionB = new Client({ connectionString: DB_URL, application_name: 'ctx-proof-b' });
  await Promise.all([admin.connect(), observer.connect(), sessionA.connect(), sessionB.connect()]);

  try {
    await purge(admin);
    await seed(admin);
    console.log(`[${PROOF_TAG}] fixtures seeded on ${DB_URL.replace(/:[^:@/]+@/, ':***@')}`);

    // Baseline structure: two courses.
    const initial = await saveAsDirectivo(sessionA, 2);
    if (initial.courses_generated !== 2) fail(`initial save generated ${initial.courses_generated} courses, expected 2`);
    ok('initial save created 1 BASICO A and 1 BASICO B');

    console.log('\n[1] held INACTIVE assignment insert vs. shrinking save');
    await heldDependencyRace({
      admin, observer, sessionA, sessionB, label: 'held-assignment',
      holdInsert: (session, courseB) =>
        session.query(
          `INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active) VALUES ($1, $2, false)`,
          [courseB, DOCENTE_ID]
        ),
    });
    await admin.query('DELETE FROM public.school_course_docente_assignments WHERE docente_id = $1', [DOCENTE_ID]);

    console.log('\n[2] held ARCHIVED instance insert vs. shrinking save');
    await heldDependencyRace({
      admin, observer, sessionA, sessionB, label: 'held-instance',
      holdInsert: (session, courseB) =>
        session.query(
          `INSERT INTO public.assessment_instances (template_snapshot_id, school_id, course_structure_id, transformation_year, status)
           VALUES ($1, $2, $3, 1, 'archived')`,
          [SNAPSHOT_ID, SCHOOL_ID, courseB]
        ),
    });
    await admin.query('DELETE FROM public.assessment_instances WHERE school_id = $1', [SCHOOL_ID]);

    console.log('\n[3] two saves of the same school fire together');
    const results = await Promise.all([
      saveAsDirectivo(sessionA, 3).then((r) => ({ ok: true, r })).catch((e) => ({ ok: false, e })),
      saveAsDirectivo(sessionB, 4).then((r) => ({ ok: true, r })).catch((e) => ({ ok: false, e })),
    ]);
    for (const outcome of results) if (!outcome.ok) fail(`a concurrent save failed unexpectedly: ${outcome.e.code} ${outcome.e.message}`);
    const { rows: contexts } = await admin.query('SELECT courses_per_level FROM public.school_transversal_context WHERE school_id = $1', [SCHOOL_ID]);
    if (contexts.length !== 1) fail(`expected exactly one context row, found ${contexts.length}`);
    const { rows: courses } = await admin.query('SELECT count(*)::int AS n FROM public.school_course_structure WHERE school_id = $1', [SCHOOL_ID]);
    const n = contexts[0].courses_per_level['1_basico'];
    if (courses[0].n !== n) fail(`context says ${n} courses but ${courses[0].n} course rows exist — the two saves interleaved`);
    ok(`the advisory lock serialised both saves: one context row, ${n} courses, consistent`);

    console.log('\n[4] no dependency: the shrinking save deletes course B');
    const shrink = await saveAsDirectivo(sessionA, 1);
    if (shrink.courses_deleted !== n - 1) fail(`expected ${n - 1} deletions, got ${shrink.courses_deleted}`);
    if (await courseIdByName(admin, '1 BASICO B')) fail('course B still exists after the dependency-free shrink');
    ok('without dependencies the same save removes the course');

    console.log(`\n✓ PASS [${PROOF_TAG}]`);
  } finally {
    await sessionB.query('ROLLBACK').catch(() => {});
    await sessionA.query('ROLLBACK').catch(() => {});
    await purge(admin).catch(() => {});
    await Promise.all([admin.end(), observer.end(), sessionA.end(), sessionB.end()]);
  }
}

main().catch((error) => {
  if (process.exitCode !== 1) {
    console.error(`\n✗ FAIL [${PROOF_TAG}]: ${error.message}\n`);
    process.exitCode = 1;
  }
});

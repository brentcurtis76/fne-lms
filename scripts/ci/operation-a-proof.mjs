/**
 * Operation A synthetic proof (Procesos de Cambio review remediation, Codex
 * round 2 findings B, C, D; round 3 findings 1, 3, 4; round 4 finding R5-1).
 *
 * Operation A is the NOT-AUTHORIZED, NOT-EXECUTED production cleanup of
 * courses that hold more than one active docente assignment, described in
 * docs/planning/operation-a-one-active-docente-handoff.md. This script reads
 * the fenced SQL blocks tagged `operation-a-step2`, `operation-a-step2e` and
 * `operation-a-step3` FROM THAT DOCUMENT, substitutes the placeholders, and
 * runs them on synthetic fixtures against the local loopback stack only. It
 * proves, with a superuser observer on pg_stat_activity:
 *
 *   [B] exact targets — an expected set that differs from the live active set
 *       (foreign id, missing id, gained row, approved id outside the set,
 *       duplicated id) raises "repeat Step 1" and mutates nothing;
 *   [C] assignee scope — only the obsolete docente's live-instance grant is
 *       removed; the approved docente, an unrelated co-assignee and the
 *       archived-instance grant stay field-identical; no row is deleted from
 *       assignments, instances or responses;
 *   [H] human decision points — a started instance and an answered instance
 *       each refuse with zero mutation;
 *   [D] concurrency — (a) an in-flight response INSERT holds Step 2 off and,
 *       once committed, makes it refuse; (b) a response INSERT arriving while
 *       Step 2 holds the boundary waits and is then refused by RLS (42501);
 *       (c) a late duplicate assignment INSERT waits and lands after Step 2,
 *       and Step 3 refuses it under its own lock; (d) an in-flight duplicate
 *       holds Step 3 off and makes it refuse; (e) Step 3 creates the index
 *       while a duplicate INSERT waits, and that INSERT fails with 23505;
 *       (f) the SERVICE-ROLE auto-assignment (round 3 finding 1): late attach
 *       RPC calls for the obsolete docente — to the existing live instance and
 *       to a new current snapshot — wait behind the boundary and are refused
 *       after COMMIT; the approved docente's late attaches succeed; an attach
 *       in flight holds Step 2 off and the final state after both commit has
 *       no grant for the obsolete docente;
 *   [T] the idle-in-transaction safeguard (round 3 finding 3): a session that
 *       stops after the boundary is terminated and rolled back, nothing written;
 *   [2e] a contaminated archived-template instance is archived and revoked
 *        under the boundary; a non-contaminated instance is refused;
 *   [2e-r5] (round 4 finding R5-1, three sessions, final state asserted after
 *        every participant finished) an attach that passed template
 *        eligibility BEFORE the archive, on the existing-instance path (a)
 *        and the create path (b): the archive UPDATE waits on the attach's
 *        transaction (FOR SHARE on the template row), a Step 2e run before
 *        the archive commits refuses, the attach commits first, the archive
 *        second, Step 1c run after the archive lists the instance and Step 2e
 *        archives it with zero grants; (c) Step 2e holds the template FOR
 *        SHARE so a restore waits for it, a stale attach under the archived
 *        template refuses without waiting, and after the restore an attach
 *        creates a fresh instance while the archived one stays archived (R4);
 *   [L] lifecycle (round 3 finding 4): every client opened is closed on any
 *       failure, an index the proof did not create is never dropped, a
 *       failed purge fails the run while preserving the original failure, and
 *       a passing run leaves zero fixtures, zero index and zero sessions. The
 *       failure paths are drilled in-process after the passing run.
 *
 * Run with `npm run test:operation-a` against a started local stack. Synthetic
 * data only; the script pre-purges and re-purges its fixed ids and removes
 * only the index it created (it refuses to run if that index already exists).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const PROOF_TAG = 'operation-a';
const HANDOFF = resolve(process.cwd(), 'docs/planning/operation-a-one-active-docente-handoff.md');
const INDEX_NAME = 'school_course_docente_assignments_one_active_key';
const ATTACH_RPC = 'public.attach_course_docente_assessment';
const IDLE_LINE = "SET LOCAL idle_in_transaction_session_timeout = '10s';";

const SCHOOL_ID = 999802;
const U = (n) => `00000000-0000-4000-8000-00000a${n}`;
const D1 = U('000001'); // approved docente
const D2 = U('000002'); // obsolete duplicate docente
const X = U('000003'); // unrelated co-assignee (no assignment row on the course)
const DIR = U('000004'); // school directivo (late assign-docente writer; assigned_by of attaches)
const D3 = U('000005'); // historical, inactive assignment
const CONTEXT_ID = U('0000c1');
const C1 = U('0000a1'); // the course under cleanup
const C2 = U('0000a2'); // started instance → human decision
const C3 = U('0000a3'); // answered instance → human decision
const C4 = U('0000a4'); // second cleanup, late duplicate insert; 2e
const C5 = U('0000a5'); // service-role auto-assignment race (D-f) and the timeout drill (T)
const A1 = U('0000d1'); // C1 / D1 active (approved)
const A2 = U('0000d2'); // C1 / D2 active (obsolete)
const A0 = U('0000d0'); // C1 / D3 inactive (history)
const A21 = U('0000d3'); const A22 = U('0000d4'); // C2
const A31 = U('0000d5'); const A32 = U('0000d6'); // C3
const A41 = U('0000d7'); const A42 = U('0000d8'); // C4
const A51 = U('0000d9'); const A52 = U('0000da'); // C5
const GHOST = U('0000dd');
const TEMPLATE_ID = U('0000e1');
const SNAPSHOT_ID = U('0000f1');
const TEMPLATE2_ID = U('0000e2'); // second published template: the create path of D-f
const SNAPSHOT2_ID = U('0000f2');
const I1 = U('001a01'); const I1_ARCH = U('001a02');
const I2 = U('002a01'); const I3 = U('003a01'); const I4 = U('004a01'); const I5 = U('005a01');
const INDICATOR_ID = U('00ee01');
const ALL_USERS = [D1, D2, X, DIR, D3];
const ALL_COURSES = [C1, C2, C3, C4, C5];
const EMAIL = (tag) => `opa-proof-${tag}@rls-test.local`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ProofFailure extends Error {}

function assertLocal(url) {
  const host = new URL(url.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
  if (!new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']).has(host)) {
    throw new Error(`[${PROOF_TAG}] refusing to run against non-local database host "${host}".`);
  }
}

// ── The SQL comes from the handoff document, verbatim ───────────────────────
function sqlBlock(tag) {
  const doc = readFileSync(HANDOFF, 'utf8');
  const re = new RegExp('```sql ' + tag + '\\n([\\s\\S]*?)\\n```');
  const m = doc.match(re);
  if (!m) throw new ProofFailure(`handoff document has no fenced block tagged "sql ${tag}"`);
  return m[1];
}
const STEP2 = sqlBlock('operation-a-step2');
const STEP2E = sqlBlock('operation-a-step2e');
const STEP3 = sqlBlock('operation-a-step3');

function fillStep2(course, expected, approved) {
  const arr = '{' + expected.map((id) => `"${id}"`).join(',') + '}';
  return STEP2.replaceAll('<course_structure_id>', course)
    .replaceAll('<expected_active_assignment_ids>', arr)
    .replaceAll('<approved_assignment_id>', approved);
}
/** Splits a block at its final COMMIT so a session can hold the transaction open. */
function withoutFinalCommit(sql) {
  const idx = sql.lastIndexOf('COMMIT;');
  if (idx < 0) throw new ProofFailure('block has no final COMMIT');
  return sql.slice(0, idx);
}

// ── Fixtures ───────────────────────────────────────────────────────────────
async function purge(admin, state, fault) {
  if (state.indexCreated) {
    // Only ever created by this run's Step 3 [D-e]; a pre-existing index makes the preflight refuse.
    await admin.query(`DROP INDEX IF EXISTS public.${INDEX_NAME}`);
    state.indexCreated = false;
  }
  await admin.query('DELETE FROM public.assessment_responses WHERE instance_id IN (SELECT id FROM public.assessment_instances WHERE school_id = $1)', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.assessment_instances WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.assessment_template_snapshots WHERE id = ANY($1::uuid[])', [[SNAPSHOT_ID, SNAPSHOT2_ID]]);
  await admin.query('DELETE FROM public.assessment_templates WHERE id = ANY($1::uuid[])', [[TEMPLATE_ID, TEMPLATE2_ID]]);
  await admin.query('DELETE FROM public.school_course_structure WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.school_transversal_context WHERE school_id = $1', [SCHOOL_ID]);
  await admin.query('DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[])', [ALL_USERS]);
  await admin.query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [ALL_USERS]);
  await admin.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [ALL_USERS]);
  await admin.query('DELETE FROM public.schools WHERE id = $1', [SCHOOL_ID]);
  if (fault === 'purge' || fault === 'test+purge') throw new Error('injected purge fault');
}

async function seed(admin) {
  await admin.query(`INSERT INTO public.schools (id, name) VALUES ($1, '[SINTÉTICO] Operation A Proof School')`, [SCHOOL_ID]);
  for (const [id, tag] of [[D1, 'd1'], [D2, 'd2'], [X, 'x'], [DIR, 'dir'], [D3, 'd3']]) {
    await admin.query(
      `INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`,
      [id, EMAIL(tag)]
    );
    await admin.query(`INSERT INTO public.profiles (id, email, name, approval_status) VALUES ($1, $2, $3, 'approved')`, [id, EMAIL(tag), `Sintetico ${tag}`]);
    await admin.query(`INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES ($1, $2, $3, true)`, [
      id, id === DIR ? 'equipo_directivo' : 'docente', SCHOOL_ID,
    ]);
  }
  await admin.query(
    `INSERT INTO public.school_transversal_context (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
     VALUES ($1, $2, 120, ARRAY['1_basico'], '{"1_basico": 5}', 1, 'semestral')`,
    [CONTEXT_ID, SCHOOL_ID]
  );
  await admin.query(
    `INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name) VALUES
       ($1, $6, $7, '1_basico', '1 BASICO A'), ($2, $6, $7, '1_basico', '1 BASICO B'),
       ($3, $6, $7, '1_basico', '1 BASICO C'), ($4, $6, $7, '1_basico', '1 BASICO D'),
       ($5, $6, $7, '1_basico', '1 BASICO E')`,
    [C1, C2, C3, C4, C5, SCHOOL_ID, CONTEXT_ID]
  );
  await admin.query(
    `INSERT INTO public.school_course_docente_assignments (id, course_structure_id, docente_id, is_active) VALUES
       ($1, $12, $17, true), ($2, $12, $18, true), ($3, $12, $19, false),
       ($4, $13, $17, true), ($5, $13, $18, true),
       ($6, $14, $17, true), ($7, $14, $18, true),
       ($8, $15, $17, true), ($9, $15, $18, true),
       ($10, $16, $17, true), ($11, $16, $18, true)`,
    [A1, A2, A0, A21, A22, A31, A32, A41, A42, A51, A52, C1, C2, C3, C4, C5, D1, D2, D3]
  );
  await admin.query(
    `INSERT INTO public.assessment_templates (id, area, version, name, status) VALUES
       ($1, 'lenguaje', '1.0', '[SINTÉTICO] Operation A Proof Template', 'published'),
       ($2, 'matematica', '1.0', '[SINTÉTICO] Operation A Proof Template 2', 'published')`,
    [TEMPLATE_ID, TEMPLATE2_ID]
  );
  await admin.query(
    `INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES
       ($1, $3, '1.0', '{"modules": []}'), ($2, $4, '1.0', '{"modules": []}')`,
    [SNAPSHOT_ID, SNAPSHOT2_ID, TEMPLATE_ID, TEMPLATE2_ID]
  );
  await admin.query(
    `INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, course_structure_id, transformation_year, status) VALUES
       ($1, $7, $8, $9, 1, 'pending'), ($2, $7, $8, $9, 1, 'archived'),
       ($3, $7, $8, $10, 1, 'in_progress'), ($4, $7, $8, $11, 1, 'pending'), ($5, $7, $8, $12, 1, 'pending'),
       ($6, $7, $8, $13, 1, 'pending')`,
    [I1, I1_ARCH, I2, I3, I4, I5, SNAPSHOT_ID, SCHOOL_ID, C1, C2, C3, C4, C5]
  );
  await admin.query(
    `INSERT INTO public.assessment_instance_assignees (instance_id, user_id, can_edit, can_submit) VALUES
       ($1, $7, true, true), ($1, $8, true, true), ($1, $9, false, true),
       ($2, $8, true, true),
       ($3, $7, true, true), ($3, $8, true, true),
       ($4, $7, true, true), ($4, $8, true, true),
       ($5, $7, true, true), ($5, $8, true, true),
       ($6, $7, true, true), ($6, $8, true, true), ($6, $9, false, true)`,
    [I1, I1_ARCH, I2, I3, I4, I5, D1, D2, X]
  );
  await admin.query(
    `INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by) VALUES ($1, $2, true, $3)`,
    [I3, INDICATOR_ID, D2]
  );
}

/** Field-level fingerprint of every fixture row in the five tables. */
async function fingerprint(admin) {
  const { rows } = await admin.query(
    `SELECT md5(coalesce(string_agg(t, '|' ORDER BY t), '')) AS fp FROM (
       SELECT 'asg:' || row_to_json(a)::text AS t FROM public.school_course_docente_assignments a WHERE course_structure_id = ANY($1::uuid[])
       UNION ALL SELECT 'inst:' || row_to_json(i)::text FROM public.assessment_instances i WHERE school_id = $2
       UNION ALL SELECT 'grant:' || row_to_json(x)::text FROM public.assessment_instance_assignees x JOIN public.assessment_instances i ON i.id = x.instance_id WHERE i.school_id = $2
       UNION ALL SELECT 'resp:' || row_to_json(r)::text FROM public.assessment_responses r JOIN public.assessment_instances i ON i.id = r.instance_id WHERE i.school_id = $2
       UNION ALL SELECT 'course:' || row_to_json(c)::text FROM public.school_course_structure c WHERE school_id = $2
     ) s`,
    [ALL_COURSES, SCHOOL_ID]
  );
  return rows[0].fp;
}

async function grantRow(admin, instanceId, userId) {
  const { rows } = await admin.query(
    'SELECT row_to_json(x)::text AS j FROM public.assessment_instance_assignees x WHERE instance_id = $1 AND user_id = $2',
    [instanceId, userId]
  );
  return rows[0]?.j ?? null;
}

async function grantCount(admin, instanceId, userId) {
  const { rows } = await admin.query(
    'SELECT count(*)::int AS n FROM public.assessment_instance_assignees WHERE instance_id = $1 AND user_id = $2',
    [instanceId, userId]
  );
  return rows[0].n;
}

/** Runs `fn` inside one transaction as an authenticated user (RLS applies). */
async function asUser(client, userId, email, fn) {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated', email })]);
    await client.query(`SELECT set_config('role', 'authenticated', true)`);
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

/** The attach RPC exactly as the service calls it: service role, one transaction per call. */
function attachSql() {
  return `SELECT ${ATTACH_RPC}($1, $2, $3, 1, 'GT', $4) AS r`;
}
async function attachAs(client, course, docente, snapshot) {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('role', 'service_role', true)`);
    const { rows } = await client.query(attachSql(), [course, docente, snapshot, DIR]);
    await client.query('COMMIT');
    return { ok: true, r: rows[0].r };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, e };
  }
}

// ── The proof run ───────────────────────────────────────────────────────────
/**
 * Runs the whole proof once. Never throws: returns
 *   { ok, checks, error, cleanupErrors, clientsOpened, clientsClosed }.
 * `fault` injects a failure for the lifecycle drills: 'test' (after seeding,
 * with a transaction open), 'purge' (at the end of the purge), 'test+purge'.
 */
async function runProof({ fault = null, quiet = false } = {}) {
  const result = { ok: false, checks: 0, error: null, cleanupErrors: [], clientsOpened: 0, clientsClosed: 0 };
  const state = { indexCreated: false };
  const opened = [];
  const log = quiet ? () => {} : (...a) => console.log(...a);
  const ok = (message) => { result.checks++; log(`  ✓ ${message}`); };
  const fail = (message) => { throw new ProofFailure(message); };

  const mk = async (name) => {
    const c = new Client({ connectionString: DB_URL, application_name: name });
    c.on('error', () => {}); // a server-terminated session (the [T] drill) must not crash the process
    await c.connect();
    opened.push(c);
    result.clientsOpened++;
    return c;
  };

  let admin;
  let observer;
  let opA;
  let writer;
  let svc;
  let archiver;
  try {
    admin = await mk('opa-admin');
    // Preflight INSIDE the lifecycle: a refusal here still closes the client.
    const { rows: pre } = await admin.query('SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2', ['public', INDEX_NAME]);
    if (pre.length > 0) fail(`index ${INDEX_NAME} already exists on this database; the proof refuses to touch an index it did not create`);
    observer = await mk('opa-observer');
    opA = await mk('opa-step');
    writer = await mk('opa-writer');
    svc = await mk('opa-service');
    archiver = await mk('opa-archiver'); // the template archive / restore route (round 4, R5-1)

    const waitForBlocked = async (applicationName) => {
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
    };

    /** Runs a full block; returns { ok, notices } or { ok:false, error }. Always leaves the session idle. */
    const runBlock = async (session, sql) => {
      const notices = [];
      const onNotice = (n) => notices.push(n.message);
      session.on('notice', onNotice);
      try {
        await session.query(sql);
        return { ok: true, notices };
      } catch (error) {
        await session.query('ROLLBACK').catch(() => {});
        return { ok: false, error, notices };
      } finally {
        session.off('notice', onNotice);
      }
    };

    const expectRefusal = async (sql, label, fragment) => {
      const before = await fingerprint(admin);
      const r = await runBlock(opA, sql);
      if (r.ok) fail(`${label}: Step 2 succeeded but must refuse`);
      if (!String(r.error.message).includes(fragment)) fail(`${label}: expected "${fragment}", got ${r.error.code} ${r.error.message}`);
      const after = await fingerprint(admin);
      if (before !== after) fail(`${label}: refused but the database changed`);
      ok(`${label}: refused ("${r.error.message.split(' — ')[1] ?? r.error.message}") and zero mutation`);
    };

    await purge(admin, state);
    await seed(admin);
    log(`[${PROOF_TAG}] fixtures seeded on ${DB_URL.replace(/:[^:@/]+@/, ':***@')}`);

    if (fault === 'test' || fault === 'test+purge') {
      await opA.query('BEGIN');
      await opA.query('SELECT 1 FROM public.school_course_structure WHERE id = $1 FOR UPDATE', [C1]);
      throw new Error('injected test fault');
    }

    log('\n[B] exact-target revalidation — every mismatch refuses with zero mutation');
    await expectRefusal(fillStep2(C1, [A1, GHOST], A1), 'expected set holds an id that is not live', 'repeat Step 1');
    await expectRefusal(fillStep2(C1, [A1, A2, GHOST], A1), 'expected set holds an extra id', 'repeat Step 1');
    await expectRefusal(fillStep2(C1, [A1], A1), 'expected set with one id', 'repeat Step 1');
    await expectRefusal(fillStep2(C1, [A1, A2], A21), 'approved id outside the expected set', 'repeat Step 1');
    await expectRefusal(fillStep2(C1, [A1, A2, A2], A1), 'duplicated expected id', 'repeat Step 1');
    // A row added between "discovery" and execution: the live set gained A0 (reactivated).
    await admin.query('UPDATE public.school_course_docente_assignments SET is_active = true WHERE id = $1', [A0]);
    await expectRefusal(fillStep2(C1, [A1, A2], A1), 'live set gained a row after discovery', 'repeat Step 1');
    await admin.query('UPDATE public.school_course_docente_assignments SET is_active = false WHERE id = $1', [A0]);
    await expectRefusal(fillStep2(GHOST, [A1, A2], A1), 'unknown course', 'repeat Step 1');

    log('\n[H] human decision points refuse with zero mutation');
    await expectRefusal(fillStep2(C2, [A21, A22], A21), 'started live instance', 'human decision required');
    await expectRefusal(fillStep2(C3, [A31, A32], A31), 'live instance with responses', 'human decision required');

    log('\n[D-a] a response INSERT in flight holds the boundary off, then makes Step 2 refuse');
    {
      await writer.query('BEGIN');
      await writer.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: D2, role: 'authenticated', email: EMAIL('d2') })]);
      await writer.query(`SELECT set_config('role', 'authenticated', true)`);
      await writer.query('INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by) VALUES ($1, $2, true, $3)', [I1, INDICATOR_ID, D2]);
      const before = await fingerprint(admin);
      let settled = false;
      const p = runBlock(opA, fillStep2(C1, [A1, A2], A1)).finally(() => { settled = true; });
      await waitForBlocked('opa-step');
      if (settled) fail('D-a: Step 2 completed while the response insert was still in flight — boundary not enforced');
      ok('D-a: Step 2 is waiting on the writer-exclusion lock while the docente response insert is in flight');
      await writer.query('COMMIT');
      const r = await p;
      if (r.ok) fail('D-a: Step 2 succeeded although the instance became answered');
      if (!String(r.error.message).includes('with responses')) fail(`D-a: expected the answered-instance refusal, got ${r.error.message}`);
      const { rows } = await admin.query('SELECT count(*)::int AS n FROM public.assessment_responses WHERE instance_id = $1', [I1]);
      if (rows[0].n !== 1) fail('D-a: the committed response is missing');
      ok('D-a: after the writer committed, Step 2 saw the response and refused (human decision); the response survives');
      await admin.query('DELETE FROM public.assessment_responses WHERE instance_id = $1', [I1]);
      if ((await fingerprint(admin)) !== before) fail('D-a: state differs after removing the proof response');
    }

    log('\n[T] idle-in-transaction safeguard: a session that stops after the boundary is terminated and rolled back');
    {
      if (!STEP2.includes(IDLE_LINE) || !STEP2E.includes(IDLE_LINE) || !STEP3.includes(IDLE_LINE)) {
        fail(`T: the documented blocks must all carry "${IDLE_LINE}"`);
      }
      ok('T: Step 2, Step 2e and Step 3 each set idle_in_transaction_session_timeout');
      const before = await fingerprint(admin);
      const idle = await mk('opa-idle');
      const drill = withoutFinalCommit(fillStep2(C5, [A51, A52], A51)).replace(IDLE_LINE, IDLE_LINE.replace("'10s'", "'300ms'"));
      await idle.query(drill); // the whole batch minus COMMIT: the DO block ran, the session now sits idle in transaction
      const { rows: held } = await observer.query(
        `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.application_name = 'opa-idle' AND l.locktype = 'relation' AND l.mode = 'ExclusiveLock'`
      );
      if (held[0].n < 5) fail(`T: expected the boundary's five EXCLUSIVE relation locks to be held, saw ${held[0].n}`);
      ok('T: the stalled session holds the five EXCLUSIVE table locks (this is the hazard finding 3 describes)');
      const deadline = Date.now() + 5000;
      let gone = false;
      while (Date.now() < deadline) {
        const { rows } = await observer.query(`SELECT 1 FROM pg_stat_activity WHERE application_name = 'opa-idle'`);
        if (rows.length === 0) { gone = true; break; }
        await sleep(50);
      }
      if (!gone) fail('T: the idle session was not terminated within 5 s');
      const outcome = await idle.query('SELECT 1').then(() => 'alive').catch((e) => e.code ?? e.message);
      if (outcome === 'alive') fail('T: the terminated session still answers queries');
      ok(`T: the server terminated the idle session (client sees ${outcome === '25P03' ? 'SQLSTATE 25P03' : 'the connection closed'}); no opa-idle session remains`);
      const { rows: locks } = await observer.query(`SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.application_name = 'opa-idle'`);
      if (locks[0].n !== 0) fail('T: locks of the terminated session remain');
      if ((await fingerprint(admin)) !== before) fail('T: the terminated transaction left a change behind');
      ok('T: every lock was released and nothing was written (C5 is still duplicated)');
      await idle.end().catch(() => {});
      result.clientsClosed++;
      opened.splice(opened.indexOf(idle), 1);
    }

    log('\n[D-f] service-role auto-assignment (attach RPC) cannot restore obsolete access across the cleanup');
    {
      const xBefore = await grantRow(admin, I5, X);
      const d1Before = await grantRow(admin, I5, D1);
      // The hazard first, exactly as the service wrote before round 3: a bare service-role INSERT of the
      // obsolete docente's grant (no RLS for service_role, no re-check) waits behind the boundary and LANDS.
      {
        await opA.query(withoutFinalCommit(fillStep2(C5, [A51, A52], A51)));
        let settled = false;
        const raw = (async () => {
          await svc.query('BEGIN');
          await svc.query(`SELECT set_config('role', 'service_role', true)`);
          await svc.query('INSERT INTO public.assessment_instance_assignees (instance_id, user_id, can_edit, can_submit, assigned_by) VALUES ($1, $2, true, true, $3)', [I5, D2, DIR]);
          await svc.query('COMMIT');
        })().then(() => ({ ok: true })).catch((e) => ({ ok: false, e })).finally(() => { settled = true; });
        await waitForBlocked('opa-service');
        if (settled) fail('D-f: the bare service-role insert completed while Step 2 held the boundary');
        await opA.query('COMMIT');
        const outcome = await raw;
        if (!outcome.ok) { await svc.query('ROLLBACK').catch(() => {}); fail(`D-f: the bare service-role insert failed instead of landing: ${outcome.e.code} ${outcome.e.message}`); }
        if ((await grantCount(admin, I5, D2)) !== 1) fail('D-f: expected the bare insert to have restored the obsolete grant (the hazard)');
        ok('D-f: HAZARD reproduced — a bare service-role assignee INSERT (the pre-round-3 write) waited behind the boundary and restored the obsolete docente\'s grant after COMMIT; the protocol below is what prevents it');
        // Re-arm C5 for the protocol checks: obsolete row active again, the restored grant removed.
        await admin.query('DELETE FROM public.assessment_instance_assignees WHERE instance_id = $1 AND user_id = $2', [I5, D2]);
        await admin.query('INSERT INTO public.assessment_instance_assignees (instance_id, user_id, can_edit, can_submit) VALUES ($1, $2, true, true)', [I5, D2]);
        await admin.query('UPDATE public.school_course_docente_assignments SET is_active = true WHERE id = $1', [A52]);
      }
      // Late attaches: Step 2 holds the boundary on C5; the obsolete docente's attach to the existing
      // live instance and its attach for a NEW current snapshot (create path) both wait, then are refused.
      await opA.query(withoutFinalCommit(fillStep2(C5, [A51, A52], A51)));
      let settledA = false; let settledB = false;
      const lateExisting = attachAs(writer, C5, D2, SNAPSHOT_ID).finally(() => { settledA = true; });
      await waitForBlocked('opa-writer');
      const lateCreate = attachAs(svc, C5, D2, SNAPSHOT2_ID).finally(() => { settledB = true; });
      await waitForBlocked('opa-service');
      if (settledA || settledB) fail('D-f: a late attach completed while Step 2 held the boundary');
      ok('D-f: the obsolete docente\'s late attach to the live instance AND its late create-path attach are both waiting behind the boundary');
      await opA.query('COMMIT');
      const [a, b] = await Promise.all([lateExisting, lateCreate]);
      if (a.ok) fail('D-f: the late attach to the existing instance SUCCEEDED after Step 2 committed — obsolete access restored');
      if (a.e.message !== 'docente_not_active_on_course') fail(`D-f: expected docente_not_active_on_course, got ${a.e.code} ${a.e.message}`);
      if (b.ok) fail('D-f: the late create-path attach SUCCEEDED after Step 2 committed — obsolete access restored on a new instance');
      if (b.e.message !== 'docente_not_active_on_course') fail(`D-f: expected docente_not_active_on_course (create path), got ${b.e.code} ${b.e.message}`);
      if ((await grantCount(admin, I5, D2)) !== 0) fail('D-f: the obsolete docente holds a grant on the live instance after both transactions finished');
      const { rows: inst2 } = await admin.query('SELECT count(*)::int AS n FROM public.assessment_instances WHERE course_structure_id = $1 AND template_snapshot_id = $2', [C5, SNAPSHOT2_ID]);
      if (inst2[0].n !== 0) fail('D-f: an instance was created for the obsolete docente on the new snapshot');
      const { rows: asg } = await admin.query('SELECT id FROM public.school_course_docente_assignments WHERE course_structure_id = $1 AND is_active', [C5]);
      if (asg.length !== 1 || asg[0].id !== A51) fail(`D-f: active set after cleanup is ${JSON.stringify(asg)}`);
      ok('D-f: after COMMIT both late attaches were refused (docente_not_active_on_course); final state: no grant, no new instance for the obsolete docente, one active assignment');
      if ((await grantRow(admin, I5, X)) !== xBefore) fail('D-f: the unrelated co-assignee\'s grant changed');
      if ((await grantRow(admin, I5, D1)) !== d1Before) fail('D-f: the approved docente\'s grant changed');
      // The approved docente's own late attaches are legitimate and succeed.
      const keep = await attachAs(svc, C5, D1, SNAPSHOT_ID);
      if (!keep.ok || keep.r.outcome !== 'already_exists' || keep.r.instance_id !== I5) fail(`D-f: approved docente attach to the live instance: ${JSON.stringify(keep)}`);
      const created = await attachAs(svc, C5, D1, SNAPSHOT2_ID);
      if (!created.ok || created.r.outcome !== 'created') fail(`D-f: approved docente create-path attach: ${JSON.stringify(created)}`);
      const { rows: newGrants } = await admin.query('SELECT user_id FROM public.assessment_instance_assignees WHERE instance_id = $1', [created.r.instance_id]);
      if (newGrants.length !== 1 || newGrants[0].user_id !== D1) fail('D-f: the created instance does not hold exactly the approved docente\'s grant');
      ok('D-f: the approved docente\'s late attaches succeed (already_exists on the live instance; created with exactly its grant on the new snapshot); the co-assignee is field-identical');

      // A duplicated course can never have an attach in flight: the RPC refuses it before any write,
      // for the obsolete AND the approved docente alike (the API refuses the same way, 409).
      await admin.query('UPDATE public.school_course_docente_assignments SET is_active = true WHERE id = $1', [A52]);
      const dupBefore = await fingerprint(admin);
      for (const [who, docente] of [['obsolete', D2], ['approved', D1]]) {
        const r = await attachAs(svc, C5, docente, SNAPSHOT_ID);
        if (r.ok || r.e.message !== 'assignment_invariant_violation') fail(`D-f: attach for the ${who} docente on a duplicated course: ${JSON.stringify(r)}`);
      }
      if ((await fingerprint(admin)) !== dupBefore) fail('D-f: a refused attach on the duplicated course changed something');
      ok('D-f: on a duplicated course the attach RPC refuses both docentes (assignment_invariant_violation) with zero writes — no attach can hold a Step 2 target course\'s row');

      // The one in-flight ordering that IS possible: the course is single-active (obsolete docente only),
      // its attach is in flight (grant inserted, course row held, uncommitted); the INSERT that makes the
      // course a duplicate waits behind that row lock (its FK check takes KEY SHARE on the course row,
      // which conflicts with FOR UPDATE); the attach commits, the duplicate lands, and Step 2 — run
      // afterwards with the exact targets, the school keeping the new docente — revokes the grant.
      await admin.query('UPDATE public.school_course_docente_assignments SET is_active = false WHERE id = $1', [A51]);
      await svc.query('BEGIN');
      await svc.query(`SELECT set_config('role', 'service_role', true)`);
      const { rows: inflight } = await svc.query(attachSql(), [C5, D2, SNAPSHOT_ID, DIR]);
      if (inflight[0].r.outcome !== 'attached') fail(`D-f: in-flight attach expected "attached", got ${JSON.stringify(inflight[0].r)}`);
      let settled = false;
      const dup = writer.query('INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active) VALUES ($1, $2, true) RETURNING id', [C5, D3])
        .then((res) => ({ ok: true, id: res.rows[0].id })).catch((e) => ({ ok: false, e })).finally(() => { settled = true; });
      await waitForBlocked('opa-writer');
      if (settled) fail('D-f: the duplicate-creating write completed while the attach held the course row');
      ok('D-f: with the obsolete docente\'s attach in flight (grant inserted, uncommitted), the write that would duplicate the course waits behind the course row lock');
      await svc.query('COMMIT');
      const dupOutcome = await dup;
      if (!dupOutcome.ok) fail(`D-f: the duplicate write failed unexpectedly: ${dupOutcome.e.message}`);
      if ((await grantCount(admin, I5, D2)) !== 1) fail('D-f: the in-flight grant did not commit');
      const step2 = await runBlock(opA, fillStep2(C5, [A52, dupOutcome.id], dupOutcome.id));
      if (!step2.ok) fail(`D-f: Step 2 after the in-flight attach failed: ${step2.error.message}`);
      if ((await grantCount(admin, I5, D2)) !== 0) fail('D-f: the obsolete docente\'s in-flight grant survived the cleanup');
      const { rows: asg2 } = await admin.query('SELECT id FROM public.school_course_docente_assignments WHERE course_structure_id = $1 AND is_active', [C5]);
      if (asg2.length !== 1 || asg2[0].id !== dupOutcome.id) fail('D-f: active set after the second cleanup is wrong');
      if ((await grantRow(admin, I5, X)) !== xBefore || (await grantRow(admin, I5, D1)) !== d1Before) fail('D-f: an unrelated grant changed');
      const again = await attachAs(svc, C5, D2, SNAPSHOT_ID);
      if (again.ok || again.e.message !== 'docente_not_active_on_course') fail(`D-f: a post-cleanup attach for the obsolete docente: ${JSON.stringify(again)}`);
      ok('D-f: the attach committed first, the duplicate landed, Step 2 then revoked the grant — final state: no grant for the obsolete docente (a further attach is refused), co-assignee and approved docente untouched');
    }

    log('\n[D-b] + [C] Step 2 holds the boundary; a late response INSERT waits, then is refused by RLS; scope of the cleanup');
    const d1Before = await grantRow(admin, I1, D1);
    const xBefore = await grantRow(admin, I1, X);
    const archBefore = await grantRow(admin, I1_ARCH, D2);
    const { rows: asgCountBefore } = await admin.query('SELECT count(*)::int AS n FROM public.school_course_docente_assignments WHERE course_structure_id = $1', [C1]);
    {
      const notices = [];
      const onNotice = (n) => notices.push(n.message);
      opA.on('notice', onNotice);
      await opA.query(withoutFinalCommit(fillStep2(C1, [A1, A2], A1)));
      opA.off('notice', onNotice);
      let settled = false;
      const late = asUser(writer, D2, EMAIL('d2'), () =>
        writer.query('INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by) VALUES ($1, $2, true, $3)', [I1, INDICATOR_ID, D2])
      ).then(() => ({ ok: true })).catch((e) => ({ ok: false, e })).finally(() => { settled = true; });
      await waitForBlocked('opa-writer');
      if (settled) fail('D-b: the late response insert completed while Step 2 held the boundary');
      ok('D-b: the obsolete docente\'s late response insert is waiting behind the boundary');
      await opA.query('COMMIT');
      const outcome = await late;
      if (outcome.ok) fail('D-b: the late response insert SUCCEEDED after Step 2 committed — stale authorization used');
      if (outcome.e.code !== '42501') fail(`D-b: expected SQLSTATE 42501 (row-level security), got ${outcome.e.code} ${outcome.e.message}`);
      const { rows } = await admin.query('SELECT count(*)::int AS n FROM public.assessment_responses WHERE instance_id = $1', [I1]);
      if (rows[0].n !== 0) fail('D-b: a response exists for the revoked docente');
      ok('D-b: after COMMIT the late insert was refused by row-level security (42501); no response exists');
      if (!notices.some((m) => m.includes('deactivated 1 assignment(s), revoked 1 grant(s) of 1 obsolete docente(s)'))) {
        fail(`C: unexpected NOTICE ${JSON.stringify(notices)}`);
      }
    }
    {
      const { rows: asg } = await admin.query('SELECT id, is_active FROM public.school_course_docente_assignments WHERE course_structure_id = $1 ORDER BY id', [C1]);
      const active = asg.filter((r) => r.is_active).map((r) => r.id);
      if (asg.length !== asgCountBefore[0].n) fail('C: an assignment row was deleted');
      if (active.length !== 1 || active[0] !== A1) fail(`C: active set after cleanup is ${JSON.stringify(active)}`);
      if (asg.find((r) => r.id === A2).is_active) fail('C: the obsolete row is still active');
      if (asg.find((r) => r.id === A0).is_active) fail('C: the historical row was reactivated');
      ok('C: only the obsolete assignment row was deactivated; the approved row is the single active one; history rows kept');
      if ((await grantRow(admin, I1, D2)) !== null) fail('C: the obsolete docente still holds the live-instance grant');
      if ((await grantRow(admin, I1, D1)) !== d1Before) fail('C: the approved docente\'s grant changed');
      if ((await grantRow(admin, I1, X)) !== xBefore) fail('C: the unrelated co-assignee\'s grant changed');
      if ((await grantRow(admin, I1_ARCH, D2)) !== archBefore) fail('C: the archived-instance grant of the obsolete docente changed');
      ok('C: obsolete docente revoked on the live instance only; approved docente, unrelated co-assignee and archived grant are field-identical');
      const { rows: inst } = await admin.query('SELECT count(*)::int AS n FROM public.assessment_instances WHERE school_id = $1', [SCHOOL_ID]);
      const { rows: resp } = await admin.query('SELECT count(*)::int AS n FROM public.assessment_responses r JOIN public.assessment_instances i ON i.id = r.instance_id WHERE i.school_id = $1', [SCHOOL_ID]);
      if (inst[0].n !== 7 || resp[0].n !== 1) fail(`C: instances ${inst[0].n} / responses ${resp[0].n} — something was deleted`);
      ok('C: no instance and no response was deleted');
      const again = await runBlock(opA, fillStep2(C1, [A1, A2], A1));
      if (again.ok || !String(again.error.message).includes('repeat Step 1')) fail('C: a repeated run did not refuse on the changed live set');
      ok('C: re-running Step 2 with the same targets refuses (live set is now {approved}) — idempotently safe');
    }

    log('\n[D-c] a late duplicate assignment INSERT waits behind the boundary, lands after it, and Step 3 refuses it');
    {
      await opA.query(withoutFinalCommit(fillStep2(C4, [A41, A42], A41)));
      let settled = false;
      const late = asUser(writer, DIR, EMAIL('dir'), () =>
        writer.query('INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active) VALUES ($1, $2, true)', [C4, D3])
      ).then(() => ({ ok: true })).catch((e) => ({ ok: false, e })).finally(() => { settled = true; });
      await waitForBlocked('opa-writer');
      if (settled) fail('D-c: the late assignment insert completed while Step 2 held the boundary');
      ok('D-c: the directivo\'s late assignment insert is waiting behind the boundary');
      await opA.query('COMMIT');
      const outcome = await late;
      if (!outcome.ok) fail(`D-c: the late assignment insert failed unexpectedly: ${outcome.e.code} ${outcome.e.message}`);
      const { rows } = await admin.query('SELECT count(*)::int AS n FROM public.school_course_docente_assignments WHERE course_structure_id = $1 AND is_active', [C4]);
      if (rows[0].n !== 2) fail(`D-c: expected the course to be duplicated again (2 active), found ${rows[0].n}`);
      ok('D-c: the insert landed after Step 2 (no index yet) — the course is duplicated again, which only Step 3 can refuse');
      const s3 = await runBlock(opA, STEP3);
      if (s3.ok) fail('D-c: Step 3 created the index although a duplicate exists');
      if (!String(s3.error.message).includes(`${C4}:2`)) fail(`D-c: Step 3 did not name the duplicated course: ${s3.error.message}`);
      const { rows: idx } = await admin.query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [INDEX_NAME]);
      if (idx.length) fail('D-c: the index exists after a refused Step 3');
      ok('D-c: Step 3 refused under its lock, named the course, created no index');
      await admin.query('DELETE FROM public.school_course_docente_assignments WHERE course_structure_id = $1 AND docente_id = $2', [C4, D3]);
    }

    log('\n[D-d] an in-flight duplicate holds Step 3 off; once committed, Step 3 refuses');
    {
      await writer.query('BEGIN');
      await writer.query('UPDATE public.school_course_docente_assignments SET is_active = true WHERE id = $1', [A2]);
      let settled = false;
      const p = runBlock(opA, STEP3).finally(() => { settled = true; });
      await waitForBlocked('opa-step');
      if (settled) fail('D-d: Step 3 completed while the duplicate update was in flight');
      ok('D-d: Step 3 is waiting on the SHARE lock while the duplicate is in flight');
      await writer.query('COMMIT');
      const r = await p;
      if (r.ok) fail('D-d: Step 3 created the index over a just-committed duplicate');
      if (!String(r.error.message).includes(`${C1}:2`)) fail(`D-d: unexpected refusal ${r.error.message}`);
      ok('D-d: after the duplicate committed, Step 3 refused and named the course');
      await admin.query('UPDATE public.school_course_docente_assignments SET is_active = false WHERE id = $1', [A2]);
    }

    log('\n[D-e] Step 3 creates the index while a duplicate INSERT waits; the INSERT then fails with 23505');
    {
      // The human-decision courses (C2, C3) are still duplicated: Step 3 refuses database-wide until every
      // course is resolved. Resolve them by hand here (a written decision in production), then prove D-e.
      await admin.query('UPDATE public.school_course_docente_assignments SET is_active = false WHERE id = ANY($1::uuid[])', [[A22, A32]]);
      await opA.query(withoutFinalCommit(STEP3));
      state.indexCreated = true; // from here on the index is ours to drop (the transaction may still roll back: DROP IF EXISTS)
      let settled = false;
      const late = writer.query('UPDATE public.school_course_docente_assignments SET is_active = true WHERE id = $1', [A2])
        .then(() => ({ ok: true })).catch((e) => ({ ok: false, e })).finally(() => { settled = true; });
      await waitForBlocked('opa-writer');
      if (settled) fail('D-e: the duplicate write completed while Step 3 held the lock');
      ok('D-e: the duplicate write is waiting behind Step 3');
      await opA.query('COMMIT');
      const outcome = await late;
      if (outcome.ok) fail('D-e: the duplicate write succeeded after the index was committed');
      if (outcome.e.code !== '23505') fail(`D-e: expected 23505, got ${outcome.e.code} ${outcome.e.message}`);
      const { rows } = await admin.query('SELECT count(*)::int AS n FROM public.school_course_docente_assignments WHERE course_structure_id = $1 AND is_active', [C1]);
      if (rows[0].n !== 1) fail('D-e: the course has more than one active assignment');
      ok('D-e: the index refused the duplicate (23505); exactly one active assignment remains');
    }

    log('\n[2e] contaminated instance: archive + revoke under the boundary; refuses a non-contaminated instance');
    /** Step 1c of the handoff document (contaminated live instances of archived templates), scoped to one fixture course. */
    const step1c = async (course) => (await admin.query(
      `SELECT i.id, i.status,
              (SELECT count(*)::int FROM public.assessment_instance_assignees x WHERE x.instance_id = i.id) AS assignees
         FROM public.assessment_instances i
         JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
         JOIN public.assessment_templates t ON t.id = s.template_id
        WHERE t.is_archived AND i.status <> 'archived' AND i.school_id = $1 AND i.course_structure_id = $2
        ORDER BY i.course_structure_id, i.created_at`, [SCHOOL_ID, course])).rows;
    /** The Step 2e batch up to (not including) its DO block: the writer-exclusion boundary alone, held open. */
    const boundaryOnly = (sql) => {
      const idx = sql.indexOf('DO $$');
      if (idx < 0) fail('the Step 2e block has no DO block');
      return sql.slice(0, idx);
    };
    /** Who a waiting session waits for: the application_name of the holder of the transactionid lock it is queued on. */
    const waitsFor = async (applicationName) => {
      const { rows } = await observer.query(
        `SELECT h.application_name
           FROM pg_locks w
           JOIN pg_stat_activity a ON a.pid = w.pid
           JOIN pg_locks l ON l.locktype = w.locktype AND l.transactionid = w.transactionid AND l.granted
           JOIN pg_stat_activity h ON h.pid = l.pid
          WHERE a.application_name = $1 AND NOT w.granted AND w.locktype = 'transactionid'`,
        [applicationName]
      );
      return rows.map((r) => r.application_name);
    };
    const instanceState = async (instanceId) => (await admin.query(
      'SELECT status, (SELECT count(*)::int FROM public.assessment_instance_assignees WHERE instance_id = $1) AS grants FROM public.assessment_instances WHERE id = $1', [instanceId]
    )).rows[0];
    const liveInstances = async (course, snapshot) => (await admin.query(
      'SELECT id FROM public.assessment_instances WHERE course_structure_id = $1 AND template_snapshot_id = $2 AND status <> $3 ORDER BY created_at', [course, snapshot, 'archived']
    )).rows.map((r) => r.id);
    const isArchived = async (templateId) => (await admin.query('SELECT is_archived FROM public.assessment_templates WHERE id = $1', [templateId])).rows[0].is_archived;
    {
      const r = await runBlock(opA, STEP2E.replaceAll('<instance_id>', I4));
      if (r.ok) fail('2e: archived a live instance of a NON-archived template');
      if (!String(r.error.message).includes('repeat Step 1c')) fail(`2e: unexpected ${r.error.message}`);
      ok('2e: an instance whose template is not archived is refused');
    }

    log('\n[2e-r5a] Codex round-4 ordering, EXISTING-instance path: an attach that passed template eligibility before the archive; the archive must wait for it');
    {
      // C4's active docente is D1 (cleaned in D-c). I4 is C4's live instance on SNAPSHOT_ID; TEMPLATE_ID is still eligible.
      if ((await liveInstances(C4, SNAPSHOT_ID)).join() !== I4) fail('2e-r5a: precondition — I4 is not the sole live instance of C4 on the snapshot');
      if (await isArchived(TEMPLATE_ID)) fail('2e-r5a: precondition — the template is already archived');
      const instBefore = (await admin.query('SELECT count(*)::int AS n FROM public.assessment_instances WHERE course_structure_id = $1', [C4])).rows[0].n;
      // 1. The operator holds the Step 2e writer-exclusion boundary (the documented LOCK TABLE, nothing else yet).
      await opA.query(boundaryOnly(STEP2E));
      // 2. The service-role attach starts: it passes the assignment and template checks and waits at the instance lookup.
      let attachSettled = false;
      const attach = attachAs(svc, C4, D1, SNAPSHOT_ID).finally(() => { attachSettled = true; });
      await waitForBlocked('opa-service');
      if (attachSettled) fail('2e-r5a: the attach completed while the boundary was held');
      ok('2e-r5a: the attach passed its eligibility reads and is waiting behind the boundary');
      // 3. A third session archives the template (the archive route's UPDATE). Round 4: it committed here. Now it must wait.
      let archiveSettled = false;
      const archive = archiver.query('UPDATE public.assessment_templates SET is_archived = true, archived_at = now() WHERE id = $1', [TEMPLATE_ID])
        .then(() => ({ ok: true })).catch((e) => ({ ok: false, e })).finally(() => { archiveSettled = true; });
      await waitForBlocked('opa-archiver');
      if (archiveSettled) fail('2e-r5a: the template archive committed while the attach\'s eligibility decision was in flight (the round-4 race)');
      const holders = await waitsFor('opa-archiver');
      if (!holders.includes('opa-service')) fail(`2e-r5a: the archive is not waiting on the attach's transaction (waits for ${JSON.stringify(holders)})`);
      ok('2e-r5a: the archive UPDATE is waiting on the attach\'s transaction (FOR SHARE on the template row), not on the boundary');
      if (await isArchived(TEMPLATE_ID)) fail('2e-r5a: is_archived is visible before the archive committed');
      // 4. The operator runs the documented Step 2e DO block for I4 in its transaction. The archive has NOT committed,
      //    so I4 is not (yet) a contaminated instance: the block refuses and the transaction aborts (boundary released).
      const early = await runBlock(opA, STEP2E.replaceAll('<instance_id>', I4).slice(STEP2E.indexOf('DO $$')));
      if (early.ok) fail('2e-r5a: Step 2e archived I4 although its template archive had not committed');
      if (!String(early.error.message).includes('repeat Step 1c')) fail(`2e-r5a: unexpected Step 2e refusal ${early.error.code} ${early.error.message}`);
      ok('2e-r5a: Step 2e run before the archive committed refuses ("repeat Step 1c") — the archive cannot be observed before it commits');
      // 5. Boundary released → the attach resumes and commits; only then can the archive commit.
      const a = await attach;
      if (!a.ok) fail(`2e-r5a: the attach failed: ${a.e.code} ${a.e.message}`);
      if (a.r.outcome !== 'already_exists' || a.r.instance_id !== I4) fail(`2e-r5a: unexpected attach result ${JSON.stringify(a.r)}`);
      const ar = await archive;
      if (!ar.ok) fail(`2e-r5a: the archive failed: ${ar.e.code} ${ar.e.message}`);
      if (!(await isArchived(TEMPLATE_ID))) fail('2e-r5a: the template is not archived after the archive committed');
      ok('2e-r5a: after the boundary: the attach committed (already_exists on I4), THEN the archive committed');
      // 6. Final state after every participant finished: the instance the attach touched is exactly what Step 1c lists.
      const contaminated = await step1c(C4);
      if (contaminated.length !== 1 || contaminated[0].id !== I4 || contaminated[0].status !== 'pending' || contaminated[0].assignees !== 1) {
        fail(`2e-r5a: Step 1c after the archive should list I4 (pending, 1 grant) and nothing else, got ${JSON.stringify(contaminated)}`);
      }
      const inst = (await admin.query('SELECT count(*)::int AS n FROM public.assessment_instances WHERE course_structure_id = $1', [C4])).rows[0].n;
      if (inst !== instBefore) fail('2e-r5a: the attach created an instance on the existing-instance path');
      ok('2e-r5a: Step 1c run after the archive lists I4 and no new instance exists');
      // 7. Step 2e as documented, after the archive: archives I4 and revokes; a post-archive attach is refused and creates nothing.
      const s2e = await runBlock(opA, STEP2E.replaceAll('<instance_id>', I4));
      if (!s2e.ok) fail(`2e-r5a: Step 2e failed after the archive: ${s2e.error.message}`);
      const i4 = await instanceState(I4);
      if (i4.status !== 'archived' || i4.grants !== 0) fail(`2e-r5a: expected I4 archived / 0 grants, got ${JSON.stringify(i4)}`);
      const stale = await attachAs(svc, C4, D1, SNAPSHOT_ID);
      if (stale.ok) fail(`2e-r5a: an attach after the archive SUCCEEDED: ${JSON.stringify(stale.r)}`);
      if (stale.e.message !== 'template_not_eligible') fail(`2e-r5a: expected template_not_eligible, got ${stale.e.code} ${stale.e.message}`);
      if ((await liveInstances(C4, SNAPSHOT_ID)).length !== 0) fail('2e-r5a: a live instance exists under the archived template');
      if ((await step1c(C4)).length !== 0) fail('2e-r5a: Step 1c still lists a contaminated instance');
      ok('2e-r5a: FINAL — I4 archived with zero grants, template archived, no live instance under it, a later attach refused (template_not_eligible), Step 1c empty');
    }

    log('\n[2e-r5b] Codex round-4 ordering, CREATE path: the attach creates under an eligible template; the archive waits; Step 1c then lists the new instance and Step 2e cleans it');
    let createdId;
    {
      // C4 has no instance on SNAPSHOT2_ID (TEMPLATE2_ID, still eligible): the attach will CREATE.
      if ((await liveInstances(C4, SNAPSHOT2_ID)).length !== 0) fail('2e-r5b: precondition — C4 already has an instance on snapshot 2');
      if (await isArchived(TEMPLATE2_ID)) fail('2e-r5b: precondition — template 2 is already archived');
      await opA.query(boundaryOnly(STEP2E));
      let attachSettled = false;
      const attach = attachAs(svc, C4, D1, SNAPSHOT2_ID).finally(() => { attachSettled = true; });
      await waitForBlocked('opa-service');
      if (attachSettled) fail('2e-r5b: the create-path attach completed while the boundary was held');
      let archiveSettled = false;
      const archive = archiver.query('UPDATE public.assessment_templates SET is_archived = true, archived_at = now() WHERE id = $1', [TEMPLATE2_ID])
        .then(() => ({ ok: true })).catch((e) => ({ ok: false, e })).finally(() => { archiveSettled = true; });
      await waitForBlocked('opa-archiver');
      if (archiveSettled) fail('2e-r5b: the template archive committed while the create-path attach\'s eligibility decision was in flight');
      const holders = await waitsFor('opa-archiver');
      if (!holders.includes('opa-service')) fail(`2e-r5b: the archive is not waiting on the attach's transaction (waits for ${JSON.stringify(holders)})`);
      ok('2e-r5b: the create-path attach is waiting behind the boundary and the archive is waiting on the attach');
      await opA.query('ROLLBACK'); // the operator releases the boundary without writing
      const a = await attach;
      if (!a.ok) fail(`2e-r5b: the create-path attach failed: ${a.e.code} ${a.e.message}`);
      if (a.r.outcome !== 'created') fail(`2e-r5b: expected created, got ${JSON.stringify(a.r)}`);
      createdId = a.r.instance_id;
      const ar = await archive;
      if (!ar.ok) fail(`2e-r5b: the archive failed: ${ar.e.code} ${ar.e.message}`);
      if (!(await isArchived(TEMPLATE2_ID))) fail('2e-r5b: template 2 is not archived after the archive committed');
      ok('2e-r5b: the attach committed (created) under a then-eligible template, THEN the archive committed');
      // The instance was COMMITTED before the archive could commit, so a Step 1c run after the archive lists it.
      const contaminated = await step1c(C4);
      if (contaminated.length !== 1 || contaminated[0].id !== createdId || contaminated[0].status !== 'pending' || contaminated[0].assignees !== 1) {
        fail(`2e-r5b: Step 1c after the archive should list exactly the created instance (pending, 1 grant), got ${JSON.stringify(contaminated)}`);
      }
      ok('2e-r5b: Step 1c run after the archive lists the created instance (it cannot be missed: it committed first)');
    }

    log('\n[2e-r5c] Step 2e on the created instance holds the template FOR SHARE: a restore waits for it; a stale attach is refused without waiting; the restored template then gets a fresh instance (R4)');
    {
      const before = (await admin.query('SELECT count(*)::int AS n FROM public.assessment_instances WHERE course_structure_id = $1', [C4])).rows[0].n;
      await opA.query(withoutFinalCommit(STEP2E.replaceAll('<instance_id>', createdId)));
      // A restore (the archive route with ?action=restore) arriving while 2e is in flight must wait for it.
      let restoreSettled = false;
      const restore = archiver.query('UPDATE public.assessment_templates SET is_archived = false, archived_at = NULL WHERE id = $1', [TEMPLATE2_ID])
        .then(() => ({ ok: true })).catch((e) => ({ ok: false, e })).finally(() => { restoreSettled = true; });
      await waitForBlocked('opa-archiver');
      if (restoreSettled) fail('2e-r5c: the restore committed while Step 2e held the template row');
      const holders = await waitsFor('opa-archiver');
      if (!holders.includes('opa-step')) fail(`2e-r5c: the restore is not waiting on Step 2e's transaction (waits for ${JSON.stringify(holders)})`);
      ok('2e-r5c: a restore arriving during Step 2e waits on Step 2e\'s transaction (FOR SHARE on the template row in the 2e block)');
      // A stale attach for the same course + snapshot: the template is archived (committed), so it is refused before it reaches the instance row — without waiting on the boundary.
      const stale = await Promise.race([attachAs(svc, C4, D1, SNAPSHOT2_ID), sleep(4000).then(() => ({ timeout: true }))]);
      if (stale.timeout) fail('2e-r5c: the stale attach waited instead of refusing');
      if (stale.ok) fail(`2e-r5c: a stale attach under an archived template SUCCEEDED: ${JSON.stringify(stale.r)}`);
      if (stale.e.message !== 'template_not_eligible') fail(`2e-r5c: expected template_not_eligible, got ${stale.e.code} ${stale.e.message}`);
      ok('2e-r5c: the stale attach was refused (template_not_eligible) without waiting and wrote nothing');
      await opA.query('COMMIT');
      const rr = await restore;
      if (!rr.ok) fail(`2e-r5c: the restore failed: ${rr.e.code} ${rr.e.message}`);
      const st = await instanceState(createdId);
      if (st.status !== 'archived' || st.grants !== 0) fail(`2e-r5c: expected the created instance archived / 0 grants after 2e, got ${JSON.stringify(st)}`);
      if (await isArchived(TEMPLATE2_ID)) fail('2e-r5c: the restore did not land after Step 2e');
      const after = (await admin.query('SELECT count(*)::int AS n FROM public.assessment_instances WHERE course_structure_id = $1', [C4])).rows[0].n;
      if (after !== before) fail('2e-r5c: the stale attach created an instance');
      ok('2e-r5c: FINAL — Step 2e committed first (instance archived, zero grants, row kept), then the restore; the stale attach created nothing');
      // R4 preserved: with the template restored (eligible) and its only instance archived, an attach creates a FRESH live instance; the archived one is never reattached.
      const fresh = await attachAs(svc, C4, D1, SNAPSHOT2_ID);
      if (!fresh.ok || fresh.r.outcome !== 'created' || fresh.r.instance_id === createdId) fail(`2e-r5c: attach after the restore: ${JSON.stringify(fresh)}`);
      const live = await liveInstances(C4, SNAPSHOT2_ID);
      if (live.length !== 1 || live[0] !== fresh.r.instance_id) fail('2e-r5c: the restored template does not hold exactly the fresh live instance');
      if ((await instanceState(createdId)).status !== 'archived') fail('2e-r5c: the archived instance was reattached');
      ok('2e-r5c: after the restore an attach creates a fresh live instance and the archived one stays archived (R4 preserved)');
    }

    result.ok = true;
  } catch (error) {
    result.error = error;
  } finally {
    // Cleanup: every held transaction rolled back, fixtures and the proof's own index purged, every
    // client closed. A cleanup failure is recorded and fails the run; the original failure is kept.
    for (const c of [writer, svc, opA, archiver]) {
      if (c) await c.query('ROLLBACK').catch(() => {});
    }
    if (admin) {
      try {
        await purge(admin, state, fault);
      } catch (e) {
        result.cleanupErrors.push(`purge failed: ${e.message}`);
      }
      try {
        const { rows } = await admin.query('SELECT count(*)::int AS n FROM public.schools WHERE id = $1', [SCHOOL_ID]);
        if (rows[0].n !== 0) result.cleanupErrors.push(`fixture school ${SCHOOL_ID} still exists`);
        const { rows: idx } = await admin.query('SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2', ['public', INDEX_NAME]);
        if (idx.length > 0 && result.ok) result.cleanupErrors.push(`index ${INDEX_NAME} still exists after a passing run`);
      } catch (e) {
        result.cleanupErrors.push(`post-run verification failed: ${e.message}`);
      }
    }
    for (const c of opened) {
      if (c === admin) continue;
      await c.end().catch(() => {});
      result.clientsClosed++;
    }
    if (admin) {
      try {
        const { rows } = await admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE 'opa-%' AND pid <> pg_backend_pid()`);
        if (rows[0].n !== 0) result.cleanupErrors.push(`${rows[0].n} opa-* session(s) still open`);
      } catch (e) {
        result.cleanupErrors.push(`session check failed: ${e.message}`);
      }
      await admin.end().catch(() => {});
      result.clientsClosed++;
    }
    if (result.cleanupErrors.length > 0) result.ok = false;
  }
  return result;
}

// ── Lifecycle drills (finding 4): the failure paths, exercised in-process ───
async function lifecycleDrills() {
  const failures = [];
  const check = (cond, message) => { if (cond) console.log(`  ✓ ${message}`); else failures.push(message); };
  const outer = new Client({ connectionString: DB_URL, application_name: 'proof-drill-admin' });
  await outer.connect();
  try {
    const noFixtures = async () => (await outer.query('SELECT count(*)::int AS n FROM public.schools WHERE id = $1', [SCHOOL_ID])).rows[0].n === 0;
    const noSessions = async () => (await outer.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE 'opa-%' `)).rows[0].n === 0;
    const indexExists = async () => (await outer.query('SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2', ['public', INDEX_NAME])).rows.length > 0;

    console.log('\n[L-1] preflight refusal: an index the proof did not create is never dropped, and the client is closed');
    await outer.query(`CREATE UNIQUE INDEX ${INDEX_NAME} ON public.school_course_docente_assignments(course_structure_id) WHERE is_active`);
    try {
      const r = await runProof({ quiet: true });
      check(!r.ok && r.error instanceof ProofFailure && /already exists/.test(r.error.message), 'L-1: the run refused with the pre-existing-index message');
      check(await indexExists(), 'L-1: the foreign index still exists (never dropped)');
      check(r.clientsOpened === 1 && r.clientsClosed === 1, `L-1: the one client opened before the refusal was closed (${r.clientsOpened}/${r.clientsClosed})`);
      check(await noSessions(), 'L-1: no opa-* session remains');
      check(await noFixtures(), 'L-1: no fixture was seeded');
    } finally {
      await outer.query(`DROP INDEX IF EXISTS public.${INDEX_NAME}`);
    }

    console.log('\n[L-2] test failure with a transaction open: rolled back, purged, every client closed, non-zero result');
    {
      const r = await runProof({ fault: 'test', quiet: true });
      check(!r.ok && r.error?.message === 'injected test fault', 'L-2: the injected failure is reported as the run\'s failure');
      check(r.cleanupErrors.length === 0, `L-2: cleanup succeeded (${JSON.stringify(r.cleanupErrors)})`);
      check(r.clientsOpened === 6 && r.clientsClosed === 6, `L-2: all six clients were closed (${r.clientsOpened}/${r.clientsClosed})`);
      check(await noFixtures(), 'L-2: no fixture remains');
      check(await noSessions(), 'L-2: no opa-* session remains');
      check(!(await indexExists()), 'L-2: no index remains');
    }

    console.log('\n[L-3] purge failure after a test failure: both reported, the original first, result non-zero, clients closed');
    {
      const r = await runProof({ fault: 'test+purge', quiet: true });
      check(!r.ok, 'L-3: the run is not ok');
      check(r.error?.message === 'injected test fault', 'L-3: the original failure is preserved');
      check(r.cleanupErrors.some((m) => /injected purge fault/.test(m)), `L-3: the purge failure is reported too (${JSON.stringify(r.cleanupErrors)})`);
      check(r.clientsOpened === r.clientsClosed, `L-3: every client was closed (${r.clientsOpened}/${r.clientsClosed})`);
      check(await noSessions(), 'L-3: no opa-* session remains');
    }
    // A fault that ONLY breaks the purge (the checks pass) must still fail the run.
    {
      const r = await runProof({ fault: 'purge', quiet: true });
      check(!r.ok && r.error === null && r.cleanupErrors.some((m) => /injected purge fault/.test(m)), 'L-3: a purge failure alone makes a passing run fail');
      check(await noSessions(), 'L-3: no opa-* session remains after the purge-fault run');
      check(await noFixtures() && !(await indexExists()), 'L-3: the purge-fault run still left no fixture and no index (the fault fires after the deletes)');
    }
  } finally {
    await outer.end().catch(() => {});
  }
  return failures;
}

async function main() {
  assertLocal(DB_URL);
  const r = await runProof();
  if (r.ok) {
    console.log(`\n✓ PASS [${PROOF_TAG}] — ${r.checks} checks; fixtures, index and sessions cleaned (clients ${r.clientsOpened} opened / ${r.clientsClosed} closed)`);
  } else {
    console.error(`\n✗ FAIL [${PROOF_TAG}]: ${r.error ? r.error.message : 'cleanup failed'}`);
    for (const m of r.cleanupErrors) console.error(`  cleanup: ${m}`);
    process.exitCode = 1;
    return;
  }
  const failures = await lifecycleDrills();
  if (failures.length > 0) {
    console.error(`\n✗ FAIL [${PROOF_TAG}] lifecycle drills:`);
    for (const m of failures) console.error(`  ✗ ${m}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✓ PASS [${PROOF_TAG}] lifecycle drills`);
}

main().catch((error) => {
  console.error(`\n✗ FAIL [${PROOF_TAG}]: ${error.message}\n`);
  process.exitCode = 1;
});

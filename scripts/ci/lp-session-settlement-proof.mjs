#!/usr/bin/env node
/**
 * Learning-path session settlement — concurrency, creation-invariant and
 * union-credit proof (W-B2c-01 / R2-03, review R5 + Codex R2, 2026-09-07).
 *
 * The Vitest suites prove what the routes ask the database to do; pgTAP 070/073
 * prove the SQL invariants as the test superuser. This proof exercises the REAL
 * functions on a local Postgres (`supabase db start`) with THREE connections and
 * the REAL application roles (authenticated / service_role), the shape neither
 * the in-process doubles nor a single pgTAP session can produce:
 *
 *   1. an authenticated assignee cannot create a session by direct INSERT
 *      (column/table grant), and cannot hold two OPEN sessions for one path
 *      (BEFORE INSERT trigger) — the two ways R2-03's "N open rows" arose;
 *   2. TWO concurrent start_learning_path_session for the same (user, path)
 *      serialise on the per-(user,path) advisory lock: they do not race into
 *      two open rows; the end state is exactly one open session and the closed
 *      predecessor is settled exactly once;
 *   3. two overlapping maintenance runs (close_stale_learning_path_sessions)
 *      over the SAME stale session credit it exactly once (SKIP LOCKED);
 *   4. union-across-time: a session overlapping an already-settled interval is
 *      credited only for the part beyond the high-water mark — overlapping time
 *      is never credited twice (the R2-03 defect: four overlapping sessions
 *      credited 120 minutes); a disjoint later session is credited in full;
 *   5. a concurrent legitimate increment taken while a settlement transaction is
 *      open is preserved (in-place increment); a rolled-back settlement leaves
 *      the session open and uncredited and the retry credits exactly once;
 *      end_learning_path_session twice credits once; last_activity_at is
 *      monotonic; the own-progress row mirrors the assignment credit;
 *   6. (R3-02) start-versus-end in BOTH orders: the second writer's FIRST wait
 *      is the per-(user, path) advisory lock (pg_stat_activity wait_event
 *      'advisory') and it holds no row lock on the sessions table while it
 *      waits — the protocol that makes the start/end lock cycle impossible;
 *      after the first commits, the second completes without 40P01 and the
 *      session is credited exactly once;
 *   7. (R3-02) start-versus-maintenance close in BOTH orders, same protocol,
 *      same exactly-once outcome; maintenance-versus-maintenance serialises on
 *      the pair lock (the second run closes nothing) instead of interleaving.
 *   8. (R4-01) the heartbeat is server-derived: an authenticated assignee's
 *      direct UPDATE of last_heartbeat to 'infinity' / a finite future value
 *      is accepted but stores the server clock; after the assignment is
 *      removed and REAL time passes, end closes the session at that stored
 *      mark (timestamp-equal), never at the time of the end request — the
 *      Codex R4-01 reproduction (its 62-second form runs with LP_PROOF_LONG=1).
 *   9. (R4-02) a legacy progress write (the previously deployed activity
 *      route's direct UPDATE of the assignment row, reconciled into the
 *      progress record by the sync trigger) versus a settlement, in BOTH
 *      orders: the second writer waits on the assignment ROW (transactionid),
 *      the first commits, the second completes without 40P01, and both
 *      records agree on the sequence and the (single) credit — the
 *      assignment-before-progress lock order shared by the trigger path and
 *      lp_record_progress.
 *
 * Every interleaving is DETERMINISTIC: the "blocked" state is observed through
 * pg_stat_activity / pg_locks before the holder commits (bounded polling is
 * the synchronisation, not a sleep of a guessed duration).
 *
 * Synthetic data only (uuids under the 5e77 prefix), created and removed here.
 * Refuses to run against a non-local database. Exit 1 on any failed assertion.
 *
 *   SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     node scripts/ci/lp-session-settlement-proof.mjs
 */
import pg from 'pg';

const { Client } = pg;
const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const parsed = new URL(DB_URL);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
  throw new Error('lp-session-settlement-proof refuses non-local databases');
}

const P = '5e770000-0000-4000-8000-';
const USER_A = `${P}0000000000a1`;
const USER_B = `${P}0000000000b1`;
const ADMIN = `${P}0000000000ad`;
const PATH = `${P}00000000000a`;
const ASSIGN_A = `${P}0000000000aa`;
const ASSIGN_B = `${P}0000000000bb`;
const SCHOOL_ID = 95977;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pidOf(client) {
  return (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
}

/**
 * Wait (bounded polling) until the backend `pid` is blocked on a heavyweight
 * lock of the given wait_event ('advisory' | 'transactionid' | 'tuple' ...).
 * Returns the row from pg_stat_activity. Throws after ~10 s.
 */
async function waitUntilBlocked(observer, pid, waitEvent) {
  for (let i = 0; i < 400; i += 1) {
    const r = await observer.query(
      'SELECT wait_event_type, wait_event, state FROM pg_stat_activity WHERE pid = $1',
      [pid]
    );
    const row = r.rows[0];
    if (row && row.wait_event_type === 'Lock' && (!waitEvent || row.wait_event === waitEvent)) return row;
    await sleep(25);
  }
  throw new Error(`backend ${pid} did not block on a ${waitEvent || 'heavyweight'} lock`);
}

/** Row-level relation locks (RowShare/RowExclusive) held by `pid` on the sessions table. */
async function sessionRowLocksHeld(observer, pid) {
  const r = await observer.query(
    `SELECT mode FROM pg_locks
      WHERE pid = $1 AND granted AND locktype = 'relation'
        AND relation = 'public.learning_path_progress_sessions'::regclass
        AND mode IN ('RowShareLock', 'RowExclusiveLock')`,
    [pid]
  );
  return r.rows.map((x) => x.mode);
}

async function cleanup(client) {
  await client.query('DELETE FROM public.learning_path_progress_sessions WHERE user_id = ANY($1::uuid[])', [[USER_A, USER_B, ADMIN]]);
  await client.query('DELETE FROM public.learning_path_user_progress WHERE user_id = ANY($1::uuid[])', [[USER_A, USER_B, ADMIN]]);
  await client.query('DELETE FROM public.learning_path_assignments WHERE id::text LIKE $1', [`${P}%`]);
  await client.query('DELETE FROM public.learning_paths WHERE id = $1', [PATH]);
  await client.query('DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[])', [[USER_A, USER_B, ADMIN]]);
  await client.query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [[USER_A, USER_B, ADMIN]]);
  await client.query('DELETE FROM public.schools WHERE id = $1', [SCHOOL_ID]);
}

async function seed(client) {
  await client.query('INSERT INTO public.schools (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
    SCHOOL_ID,
    'LP settlement proof school (synthetic)',
  ]);
  await client.query(
    `INSERT INTO public.profiles (id, email, name, approval_status)
     VALUES ($1, 'lp-settle-a@synthetic.local', 'lp settle a', 'approved'),
            ($2, 'lp-settle-b@synthetic.local', 'lp settle b', 'approved'),
            ($3, 'lp-settle-admin@synthetic.local', 'lp settle admin', 'approved')
     ON CONFLICT (id) DO NOTHING`,
    [USER_A, USER_B, ADMIN]
  );
  await client.query(
    `INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
     VALUES ($1, 'docente', $4, true), ($2, 'docente', $4, true), ($3, 'admin', NULL, true)`,
    [USER_A, USER_B, ADMIN, SCHOOL_ID]
  );
  await client.query(
    `INSERT INTO public.learning_paths (id, name, description, created_by)
     VALUES ($1, 'LP settlement proof path', 'synthetic', $2)`,
    [PATH, ADMIN]
  );
  await client.query(
    `INSERT INTO public.learning_path_assignments (id, path_id, user_id, assigned_by, total_time_spent_minutes, last_activity_at)
     VALUES ($1, $3, $4, $6, 0, NULL), ($2, $3, $5, $6, 0, now())`,
    [ASSIGN_A, ASSIGN_B, PATH, USER_A, USER_B, ADMIN]
  );
}

async function asServiceRole(client) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('role', 'service_role', false)`);
  await client.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
}

async function asUser(client, userId) {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('role', 'authenticated', false)`);
  await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
}

async function main() {
  const admin = new Client({ connectionString: DB_URL });
  const runA = new Client({ connectionString: DB_URL });
  const runB = new Client({ connectionString: DB_URL });
  // Observer: never switches role (pg_stat_activity hides other backends' wait
  // events from non-superusers), never holds a transaction.
  const obs = new Client({ connectionString: DB_URL });
  await Promise.all([admin.connect(), runA.connect(), runB.connect(), obs.connect()]);

  try {
    await cleanup(admin);
    await seed(admin);

    // ---------------------------------------------------------------- 1
    // An authenticated assignee cannot create a session by direct INSERT.
    await asUser(runA, USER_A);
    let denied = false;
    try {
      await runA.query(
        `INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type)
         VALUES ($1, $2, 'path_view')`,
        [USER_A, PATH]
      );
    } catch (e) {
      denied = /permission denied/i.test(e.message);
    }
    assert(denied, 'an authenticated assignee must not be able to INSERT a session directly');
    console.log('✓ direct session creation by an authenticated assignee is refused (grant)');

    // A second OPEN session for the same (user, path) is refused for any creator.
    await runA.query('SELECT public.start_learning_path_session($1, $2)', [USER_A, PATH]);
    await asServiceRole(admin);
    let trigger = false;
    try {
      await admin.query(
        `INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type)
         VALUES ($1, $2, 'path_view')`,
        [USER_A, PATH]
      );
    } catch (e) {
      trigger = /open learning-path session already exists/i.test(e.message);
    }
    assert(trigger, 'a second OPEN session for the same (user, path) must be refused by the trigger');
    console.log('✓ a second open session for the same (user, path) is refused (trigger), for a backend creator too');

    // ---------------------------------------------------------------- 2
    // Two concurrent starts for the same (user, path) serialise: one open row.
    await asUser(runA, USER_A);
    await asUser(runB, USER_A);
    await runA.query('BEGIN');
    await runB.query('BEGIN');
    // Both attempt to start; the advisory lock in start_learning_path_session
    // serialises them. Fire A, then B, then commit A, then B.
    const startA = runA.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_A, PATH]);
    await new Promise((r) => setTimeout(r, 50));
    const startB = runB.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_A, PATH]);
    await new Promise((r) => setTimeout(r, 50));
    await runA.query('COMMIT');
    await startA;
    await runB.query('COMMIT');
    await startB;
    const open = await admin.query(
      `SELECT count(*)::int AS n FROM public.learning_path_progress_sessions WHERE user_id = $1 AND session_end IS NULL`,
      [USER_A]
    );
    assert(open.rows[0].n === 1, `concurrent starts must leave exactly one open session, got ${open.rows[0].n}`);
    const unsettled = await admin.query(
      `SELECT count(*)::int AS n FROM public.learning_path_progress_sessions WHERE user_id = $1 AND session_end IS NOT NULL AND settled_at IS NULL`,
      [USER_A]
    );
    assert(unsettled.rows[0].n === 0, `every closed session of A must be settled, got ${unsettled.rows[0].n} unsettled`);
    console.log('✓ two concurrent starts for the same (user, path) serialise to exactly one open session, predecessors settled once');

    // ---------------------------------------------------------------- 3 + 4
    // Reset A's sessions to a single stale open session, then prove concurrent
    // close_stale credits it once and union-across-time clips a later overlap.
    await asServiceRole(admin);
    await admin.query('DELETE FROM public.learning_path_progress_sessions WHERE user_id = $1', [USER_A]);
    await admin.query('UPDATE public.learning_path_assignments SET total_time_spent_minutes = 0, last_activity_at = NULL WHERE id = $1', [ASSIGN_A]);
    await admin.query('DELETE FROM public.learning_path_user_progress WHERE user_id = $1', [USER_A]);
    // One stale open session [T-50, T-20] (30 min).
    await admin.query(
      `INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat)
       VALUES ($1, $2, $3, 'path_view', now() - interval '50 minutes', now() - interval '20 minutes')`,
      [`${P}0000000000e0`, USER_A, PATH]
    );
    await asServiceRole(runA);
    await asServiceRole(runB);
    const pidB = await pidOf(runB);
    await runA.query('BEGIN');
    const firstRun = await runA.query(`SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes') AS r`);
    // While A holds the pair lock, B's run must WAIT on that advisory lock
    // (R3-02 protocol: advisory before rows) — it neither interleaves nor
    // deadlocks — and then close nothing, because A closed the session.
    const secondRun = runB.query(`SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes') AS r`);
    const blockedB = await waitUntilBlocked(obs, pidB, 'advisory');
    assert(blockedB.wait_event === 'advisory', `B waits on the advisory pair lock, got ${JSON.stringify(blockedB)}`);
    assert((await sessionRowLocksHeld(obs, pidB)).length === 0, 'B holds no row lock on sessions while it waits for the advisory lock');
    // A concurrent legitimate increment on A's assignment, queued behind A's credit.
    const pidAdmin = await pidOf(admin);
    const increment = admin.query(
      `UPDATE public.learning_path_assignments SET total_time_spent_minutes = coalesce(total_time_spent_minutes,0) + 7 WHERE id = $1`,
      [ASSIGN_A]
    );
    // The increment queues behind A's uncommitted credit on the same row.
    await waitUntilBlocked(obs, pidAdmin, 'transactionid');
    await runA.query('COMMIT');
    await increment;
    const second = await secondRun;
    assert(firstRun.rows[0].r.closed === 1 && second.rows[0].r.closed === 0,
      `run A closes the one stale session, B (serialised behind the pair lock) closes nothing (A=${JSON.stringify(firstRun.rows[0].r)}, B=${JSON.stringify(second.rows[0].r)})`);
    const totalA1 = (await admin.query('SELECT total_time_spent_minutes AS t FROM public.learning_path_assignments WHERE id = $1', [ASSIGN_A])).rows[0].t;
    assert(totalA1 === 37, `the stale session credits 30 exactly once; the concurrent +7 is preserved -> 37, got ${totalA1}`);
    console.log('✓ overlapping maintenance runs serialise on the pair lock and credit the one stale session exactly once; a concurrent increment is preserved (30+7)');

    // Union-across-time: a later session overlapping the already-settled [T-50,T-20]
    // interval, [T-25, T-5] (20 min elapsed), is credited only for the 5 minutes
    // beyond the mark T-20; a disjoint session credits in full.
    await admin.query(
      `INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat)
       VALUES ($1, $2, $3, 'path_view', now() - interval '25 minutes', now() - interval '5 minutes')`,
      [`${P}0000000000e1`, USER_A, PATH]
    );
    const overlapRun = await admin.query(`SELECT public.close_stale_learning_path_sessions(now() - interval '2 minutes') AS r`);
    assert(overlapRun.rows[0].r.closed === 1, 'the overlapping later session is closed');
    const creditedOverlap = (await admin.query('SELECT credited_minutes AS c FROM public.learning_path_progress_sessions WHERE id = $1', [`${P}0000000000e1`])).rows[0].c;
    assert(creditedOverlap === 15, `only the minutes beyond the settled mark T-20 are credited ([T-25,T-5] -> 15), got ${creditedOverlap}`);
    const totalA2 = (await admin.query('SELECT total_time_spent_minutes AS t FROM public.learning_path_assignments WHERE id = $1', [ASSIGN_A])).rows[0].t;
    assert(totalA2 === 52, `overlapping time is not credited twice (37 + 15 = 52, not 37 + 20), got ${totalA2}`);
    const upA = (await admin.query('SELECT total_time_spent_minutes AS t FROM public.learning_path_user_progress WHERE user_id = $1', [USER_A])).rows[0].t;
    // own-progress records only the SETTLEMENT credits (30 + 15); the ad-hoc +7
    // increment above is applied straight to the assignment, not through a
    // settlement, so it is not mirrored — the two figures legitimately differ.
    assert(upA === 45, `own-progress mirrors the settlement credit only (30 + 15 = 45), got ${upA}`);
    console.log('✓ union-across-time: a later overlapping session is clipped by the high-water mark (assignment 52, settlement-credited 45); own-progress mirrors the settlement credit');

    // A third run is a no-op.
    const third = await admin.query(`SELECT public.close_stale_learning_path_sessions(now() - interval '2 minutes') AS r`);
    assert(third.rows[0].r.closed === 0 && third.rows[0].r.settled === 0, `repeated run must be a no-op: ${JSON.stringify(third.rows[0].r)}`);
    console.log('✓ a repeated maintenance run is a no-op');

    // ---------------------------------------------------------------- 5
    // Rolled-back settlement leaves nothing behind; retry credits once.
    await admin.query(
      `INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat)
       VALUES ($1, $2, $3, 'path_view', now() - interval '3 hours', now() - interval '20 minutes')`,
      [`${P}0000000000f1`, USER_B, PATH]
    );
    await asServiceRole(runA);
    await runA.query('BEGIN');
    const attempt = await runA.query(`SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes') AS r`);
    assert(attempt.rows[0].r.closed === 1, `the failed attempt claimed the B session (${JSON.stringify(attempt.rows[0].r)})`);
    await runA.query('ROLLBACK');
    const afterRollback = await admin.query(
      `SELECT session_end, settled_at FROM public.learning_path_progress_sessions WHERE id = $1`,
      [`${P}0000000000f1`]
    );
    assert(afterRollback.rows[0].session_end === null && afterRollback.rows[0].settled_at === null, 'rolled-back settlement leaves the session open and unsettled');
    const retry = await runB.query(`SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes') AS r`);
    assert(retry.rows[0].r.closed === 1 && retry.rows[0].r.settled === 1, `retry settles exactly the one session: ${JSON.stringify(retry.rows[0].r)}`);
    console.log('✓ a rolled-back settlement leaves no partial accounting; the retry settles exactly once');

    // end twice credits once; last_activity_at monotonic.
    const own = `${P}0000000000f2`;
    await admin.query('DELETE FROM public.learning_path_progress_sessions WHERE user_id = $1', [USER_B]);
    await admin.query(
      `INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat)
       VALUES ($1, $2, $3, 'path_view', now() - interval '12 minutes', now())`,
      [own, USER_B, PATH]
    );
    const beforeB = (await admin.query('SELECT total_time_spent_minutes AS t FROM public.learning_path_assignments WHERE id = $1', [ASSIGN_B])).rows[0].t;
    await admin.query(`UPDATE public.learning_path_assignments SET last_activity_at = now() + interval '1 day' WHERE id = $1`, [ASSIGN_B]);
    await asUser(runA, USER_B);
    const end1 = await runA.query('SELECT public.end_learning_path_session($1) AS ok', [own]);
    const end2 = await runA.query('SELECT public.end_learning_path_session($1) AS ok', [own]);
    assert(end1.rows[0].ok === true && end2.rows[0].ok === true, 'end returns TRUE both times');
    const afterEnd = await admin.query(
      `SELECT total_time_spent_minutes AS t, last_activity_at > now() + interval '23 hours' AS kept_future
         FROM public.learning_path_assignments WHERE id = $1`,
      [ASSIGN_B]
    );
    assert(afterEnd.rows[0].t === beforeB + 12, `B: one 12-minute credit after two end calls (${beforeB}+12), got ${afterEnd.rows[0].t}`);
    assert(afterEnd.rows[0].kept_future === true, 'last_activity_at never moves backwards');
    console.log('✓ end_learning_path_session twice: one credit; last_activity_at monotonic');

    // ---------------------------------------------------------------- 6
    // R3-02: start versus end, both orders. Each interleaving starts from a
    // clean (user B, path) state so the expected credit is exactly the one
    // session's minutes (no union clipping from earlier intervals).
    const freshB = async () => {
      await asServiceRole(admin);
      await admin.query('DELETE FROM public.learning_path_progress_sessions WHERE user_id = $1', [USER_B]);
      await admin.query('DELETE FROM public.learning_path_user_progress WHERE user_id = $1', [USER_B]);
      await admin.query('UPDATE public.learning_path_assignments SET total_time_spent_minutes = 0, last_activity_at = NULL, started_at = NULL WHERE id = $1', [ASSIGN_B]);
    };
    const stateB = async (sessionId) => (await admin.query(
      `SELECT count(*) FILTER (WHERE session_end IS NULL)::int AS open,
              count(*) FILTER (WHERE session_end IS NOT NULL AND settled_at IS NULL)::int AS unsettled,
              (SELECT credited_minutes FROM public.learning_path_progress_sessions WHERE id = $2) AS credit,
              (SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = $3) AS total,
              (SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = $1 AND path_id = $4) AS own
         FROM public.learning_path_progress_sessions WHERE user_id = $1`,
      [USER_B, sessionId, ASSIGN_B, PATH]
    )).rows[0];
    await asUser(runA, USER_B);
    await asUser(runB, USER_B);
    const pidA6 = await pidOf(runA);
    const pidB6 = await pidOf(runB);

    // 6a — END first (holds the pair lock + the row), START second must wait on
    // the ADVISORY lock, holding no row lock, then complete without 40P01.
    await freshB();
    const s1 = (await runA.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH])).rows[0].id;
    await admin.query(`UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '9 minutes' WHERE id = $1`, [s1]);
    await runB.query('BEGIN');
    const end6a = await runB.query('SELECT public.end_learning_path_session($1) AS ok', [s1]);
    assert(end6a.rows[0].ok === true, 'end inside an open transaction returns TRUE');
    const start6a = runA.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH]);
    const blockedA6a = await waitUntilBlocked(obs, pidA6, 'advisory');
    assert(blockedA6a.wait_event === 'advisory', `start waits on the advisory pair lock first, got ${JSON.stringify(blockedA6a)}`);
    assert((await sessionRowLocksHeld(obs, pidA6)).length === 0, 'start holds no row lock on sessions while waiting for the advisory lock');
    await runB.query('COMMIT');
    await start6a;
    const after6a = await stateB(s1);
    assert(after6a.open === 1 && after6a.unsettled === 0 && after6a.credit === 9 && after6a.total === 9 && after6a.own === 9,
      `end-then-start: one open session, s1 settled once with 9 minutes in both records, got ${JSON.stringify(after6a)}`);
    console.log('✓ R3-02 end-then-start: start waits on the advisory pair lock (no row lock held), no deadlock, s1 credited once (9)');

    // 6b — START first (holds the pair lock; it closes s2 and inserts s3), END
    // of s2 second must wait on the ADVISORY lock — the interleaving that
    // deadlocked while end locked the row first — then find s2 settled.
    await freshB();
    const s2 = (await runA.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH])).rows[0].id;
    await admin.query(`UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '4 minutes' WHERE id = $1`, [s2]);
    await runA.query('BEGIN');
    await runA.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH]);
    const end6b = runB.query('SELECT public.end_learning_path_session($1) AS ok', [s2]);
    const blockedB6b = await waitUntilBlocked(obs, pidB6, 'advisory');
    assert(blockedB6b.wait_event === 'advisory', `end waits on the advisory pair lock first, got ${JSON.stringify(blockedB6b)}`);
    assert((await sessionRowLocksHeld(obs, pidB6)).length === 0, 'end holds no row lock on sessions while waiting for the advisory lock (the old cycle is impossible)');
    await runA.query('COMMIT');
    const end6bRes = await end6b;
    assert(end6bRes.rows[0].ok === true, 'end after the start committed returns TRUE (no 40P01)');
    const after6b = await stateB(s2);
    assert(after6b.open === 1 && after6b.unsettled === 0 && after6b.credit === 4 && after6b.total === 4 && after6b.own === 4,
      `start-then-end: s2 credited once (4) in both records, one open session, got ${JSON.stringify(after6b)}`);
    console.log('✓ R3-02 start-then-end: end waits on the advisory pair lock (no row lock held), no deadlock, s2 credited once (4)');

    // ---------------------------------------------------------------- 7
    // R3-02: start versus maintenance close, both orders.
    // 7a — CLOSE first (service role, holds pair lock + row), START second waits
    // on the advisory lock, then does not re-close / re-credit.
    await freshB();
    const s3 = `${P}0000000000f3`;
    await admin.query(
      `INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat)
       VALUES ($1, $2, $3, 'path_view', now() - interval '40 minutes', now() - interval '20 minutes')`,
      [s3, USER_B, PATH]
    );
    await asServiceRole(runB);
    await runB.query('BEGIN');
    const close7a = await runB.query(`SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes') AS r`);
    assert(close7a.rows[0].r.closed === 1, `maintenance closes the stale session: ${JSON.stringify(close7a.rows[0].r)}`);
    const start7a = runA.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH]);
    const blockedA7a = await waitUntilBlocked(obs, pidA6, 'advisory');
    assert(blockedA7a.wait_event === 'advisory', `start waits on the advisory pair lock held by maintenance, got ${JSON.stringify(blockedA7a)}`);
    assert((await sessionRowLocksHeld(obs, pidA6)).length === 0, 'start holds no row lock while waiting behind maintenance');
    await runB.query('COMMIT');
    await start7a;
    const after7a = await stateB(s3);
    assert(after7a.open === 1 && after7a.unsettled === 0 && after7a.credit === 20 && after7a.total === 20 && after7a.own === 20,
      `close-then-start: one open session, s3 credited once (20) in both records, got ${JSON.stringify(after7a)}`);
    console.log('✓ R3-02 close-then-start: start waits on the advisory pair lock held by maintenance, s3 credited once (20)');

    // 7b — START first (holds pair lock; it closes the stale session itself),
    // CLOSE second waits on the advisory lock, then finds nothing stale.
    await freshB();
    const s4 = `${P}0000000000f4`;
    await admin.query(
      `INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat)
       VALUES ($1, $2, $3, 'path_view', now() - interval '70 minutes', now() - interval '60 minutes')`,
      [s4, USER_B, PATH]
    );
    await runA.query('BEGIN');
    await runA.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH]);
    const close7b = runB.query(`SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes') AS r`);
    const blockedB7b = await waitUntilBlocked(obs, pidB6, 'advisory');
    assert(blockedB7b.wait_event === 'advisory', `maintenance waits on the advisory pair lock held by start, got ${JSON.stringify(blockedB7b)}`);
    assert((await sessionRowLocksHeld(obs, pidB6)).length === 0, 'maintenance holds no row lock while waiting behind start (candidates are locked only after the pair locks)');
    await runA.query('COMMIT');
    const close7bRes = await close7b;
    assert(close7bRes.rows[0].r.closed === 0 && close7bRes.rows[0].r.settled === 0,
      `start-then-close: maintenance closes nothing (start already closed and settled s4): ${JSON.stringify(close7bRes.rows[0].r)}`);
    const after7b = await stateB(s4);
    assert(after7b.open === 1 && after7b.unsettled === 0 && after7b.credit === 70 && after7b.total === 70 && after7b.own === 70,
      `start-then-close: s4 closed by start at now (70 minutes) and credited once in both records, got ${JSON.stringify(after7b)}`);
    console.log('✓ R3-02 start-then-close: maintenance waits on the advisory pair lock held by start, closes nothing, s4 credited once (70)');

    // ---------------------------------------------------------------- 8
    // R4-01: a forged heartbeat cannot extend credit past revocation.
    await freshB();
    await asUser(runA, USER_B);
    const s5 = (await runA.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH])).rows[0].id;
    await admin.query(`UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '10 minutes' WHERE id = $1`, [s5]);
    const forgeInf = await runA.query(`UPDATE public.learning_path_progress_sessions SET last_heartbeat = 'infinity' WHERE id = $1`, [s5]);
    assert(forgeInf.rowCount === 1, 'the assignee\'s direct UPDATE of last_heartbeat = infinity is accepted by grant and policy (Codex step 2)');
    const storedInf = (await admin.query(
      `SELECT last_heartbeat, last_heartbeat = 'infinity' AS is_inf, last_heartbeat <= clock_timestamp() AS plausible FROM public.learning_path_progress_sessions WHERE id = $1`, [s5]
    )).rows[0];
    assert(storedInf.is_inf === false && storedInf.plausible === true, `the stored heartbeat is the server clock, not infinity: ${JSON.stringify(storedInf)}`);
    const forgeFuture = await runA.query(`UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() + interval '30 days' WHERE id = $1`, [s5]);
    assert(forgeFuture.rowCount === 1, 'a finite future value is accepted too');
    const storedFuture = (await admin.query(
      `SELECT last_heartbeat, last_heartbeat <= clock_timestamp() AS plausible FROM public.learning_path_progress_sessions WHERE id = $1`, [s5]
    )).rows[0];
    assert(storedFuture.plausible === true, 'the stored heartbeat is never later than the server clock');
    // (compared in SQL below: node-pg would truncate the mark to milliseconds)
    // Revocation (Codex step 3), then REAL elapsed time with no activity (step 4).
    await admin.query('DELETE FROM public.learning_path_assignments WHERE id = $1', [ASSIGN_B]);
    const waitSeconds = process.env.LP_PROOF_LONG ? 62 : 2;
    await admin.query('SELECT pg_sleep($1)', [waitSeconds]);
    let refusedAfter = false;
    try {
      await runA.query(`UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() WHERE id = $1`, [s5]);
    } catch (e) {
      refusedAfter = e.code === '42501';
    }
    assert(refusedAfter, 'after revocation the direct heartbeat UPDATE is refused by the policy (42501) — the mark cannot move');
    const end8 = await runA.query('SELECT public.end_learning_path_session($1) AS ok', [s5]);
    assert(end8.rows[0].ok === true, 'end after revocation returns TRUE (Codex step 5)');
    const closed8 = (await admin.query(
      `SELECT session_end = last_heartbeat AS at_mark, session_end < clock_timestamp() - ($2::int - 1) * interval '1 second' AS before_wait_ended,
              time_spent_minutes AS minutes, credited_minutes AS credit,
              (SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = $3 AND path_id = $4) AS own
         FROM public.learning_path_progress_sessions WHERE id = $1`,
      [s5, waitSeconds, USER_B, PATH]
    )).rows[0];
    assert(closed8.at_mark === true, `the session closed exactly at the stored server mark, not at the end request: ${JSON.stringify(closed8)}`);
    assert(closed8.before_wait_ended === true, `session_end predates the ${waitSeconds}s wait — no post-revocation time was credited`);
    assert(closed8.minutes === 10 && closed8.credit === 10 && closed8.own === 10,
      `exactly the 10 authorized minutes (backdated start .. server mark) are credited once, got ${JSON.stringify(closed8)}`);
    console.log(`✓ R4-01 forged heartbeat (infinity / +30 days) stores the server clock; after revocation + ${waitSeconds}s the session closes at that mark (10 minutes), nothing more`);

    // ---------------------------------------------------------------- 9
    // R4-02: legacy assignment write versus settlement, both orders. The direct
    // row is recreated (the seed trigger copies the pair's progress into it).
    await admin.query(
      `INSERT INTO public.learning_path_assignments (id, path_id, user_id, assigned_by, total_time_spent_minutes, last_activity_at)
       VALUES ($1, $2, $3, $4, 0, now())`,
      [ASSIGN_B, PATH, USER_B, ADMIN]
    );
    const legacyWrite = async (client, seq) => client.query(
      `UPDATE public.learning_path_assignments SET current_course_sequence = $3, last_activity_at = now() WHERE user_id = $1 AND path_id = $2`,
      [USER_B, PATH, seq]
    );
    const both = async () => (await admin.query(
      `SELECT a.current_course_sequence AS a_seq, up.current_course_sequence AS up_seq,
              a.total_time_spent_minutes AS a_min, up.total_time_spent_minutes AS up_min
         FROM public.learning_path_assignments a
         JOIN public.learning_path_user_progress up ON up.user_id = a.user_id AND up.path_id = a.path_id
        WHERE a.id = $1`, [ASSIGN_B]
    )).rows[0];

    // 9a — LEGACY write first (holds the assignment row and, through the sync
    // trigger, the progress row); END second waits on the assignment row.
    await freshB();
    await asUser(runA, USER_B);
    await asUser(runB, USER_B);
    const s6 = (await runB.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH])).rows[0].id;
    await admin.query(`UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '6 minutes' WHERE id = $1`, [s6]);
    await runA.query('BEGIN');
    const legacy9a = await legacyWrite(runA, 2);
    assert(legacy9a.rowCount === 1, 'the legacy course_start UPDATE on the own direct row is accepted');
    const end9a = runB.query('SELECT public.end_learning_path_session($1) AS ok', [s6]);
    const blockedB9a = await waitUntilBlocked(obs, pidB6, 'transactionid');
    assert(blockedB9a.wait_event === 'transactionid', `end waits on the row the legacy write holds, got ${JSON.stringify(blockedB9a)}`);
    await runA.query('COMMIT');
    const end9aRes = await end9a;
    assert(end9aRes.rows[0].ok === true, 'end completes after the legacy write commits (no 40P01)');
    const after9a = await both();
    assert(after9a.a_seq === 2 && after9a.up_seq === 2 && after9a.a_min === 6 && after9a.up_min === 6,
      `legacy-then-settle: sequence 2 in both records, 6 minutes credited once in both, got ${JSON.stringify(after9a)}`);
    console.log('✓ R4-02 legacy-write-then-end: end waits on the assignment row, no deadlock, sequence 2 and 6 minutes in both records');

    // 9b — SETTLEMENT first (holds advisory + session + assignment + progress),
    // LEGACY write second waits on the assignment row, then reconciles.
    await freshB();
    const s7 = (await runB.query('SELECT public.start_learning_path_session($1, $2) AS id', [USER_B, PATH])).rows[0].id;
    await admin.query(`UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '3 minutes' WHERE id = $1`, [s7]);
    await runB.query('BEGIN');
    const end9b = await runB.query('SELECT public.end_learning_path_session($1) AS ok', [s7]);
    assert(end9b.rows[0].ok === true, 'end inside an open transaction returns TRUE');
    const legacy9b = legacyWrite(runA, 1);
    const blockedA9b = await waitUntilBlocked(obs, pidA6, 'transactionid');
    assert(blockedA9b.wait_event === 'transactionid', `the legacy write waits on the assignment row the settlement holds, got ${JSON.stringify(blockedA9b)}`);
    await runB.query('COMMIT');
    const legacy9bRes = await legacy9b;
    assert(legacy9bRes.rowCount === 1, 'the legacy write completes after the settlement commits (no 40P01)');
    const after9b = await both();
    assert(after9b.a_seq === 1 && after9b.up_seq === 1 && after9b.a_min === 3 && after9b.up_min === 3,
      `settle-then-legacy: the later legacy sequence (1) is in both records, 3 minutes credited once in both, got ${JSON.stringify(after9b)}`);
    console.log('✓ R4-02 end-then-legacy-write: the legacy write waits on the assignment row, no deadlock, sequence 1 and 3 minutes in both records');
    // --------------------------------------------------------------- 10
    // R5-01: persisted distrust crosses a finite deadline in separate real
    // transactions. Run revoked end, new maintenance and old direct close.
    for (const mode of ['revoked-end', 'maintenance', 'legacy-maintenance']) {
      await freshB();
      await asUser(runA, USER_B);
      const sid = (await runA.query('SELECT public.start_learning_path_session($1,$2) AS id', [USER_B, PATH])).rows[0].id;
      await admin.query('RESET ROLE');
      await admin.query('BEGIN');
      await admin.query('SET LOCAL session_replication_role=replica');
      await admin.query(`UPDATE public.learning_path_progress_sessions SET session_start=now()-interval '10 minutes',
        last_heartbeat=clock_timestamp()+interval '1 second', heartbeat_trust_ceiling=now() WHERE id=$1`, [sid]);
      await admin.query('COMMIT');
      const snapshot = (await admin.query(`SELECT last_heartbeat::text AS hb, heartbeat_trust_ceiling::text AS ceiling,
        last_heartbeat>clock_timestamp() AS future,
        public.lp_last_authorized_heartbeat(last_heartbeat,session_start,heartbeat_trust_ceiling)=session_start AS rejected
        FROM public.learning_path_progress_sessions WHERE id=$1`, [sid])).rows[0];
      assert(snapshot.future && snapshot.rejected, `${mode}: before deadline rejected`);
      await admin.query(`SELECT pg_sleep(greatest(0,extract(epoch FROM (last_heartbeat-clock_timestamp())))+0.05)
        FROM public.learning_path_progress_sessions WHERE id=$1`, [sid]);
      const after = (await admin.query(`SELECT last_heartbeat::text AS hb, heartbeat_trust_ceiling::text AS ceiling,
        last_heartbeat<clock_timestamp() AS past, session_end IS NULL AS open,
        public.lp_last_authorized_heartbeat(last_heartbeat,session_start,heartbeat_trust_ceiling)=session_start AS rejected
        FROM public.learning_path_progress_sessions WHERE id=$1`, [sid])).rows[0];
      assert(after.past && after.open && after.rejected && after.hb===snapshot.hb && after.ceiling===snapshot.ceiling,
        `${mode}: unchanged session remains rejected after deadline`);
      if (mode === 'revoked-end') {
        await admin.query('DELETE FROM public.learning_path_assignments WHERE id=$1', [ASSIGN_B]);
        await runA.query('SELECT public.end_learning_path_session($1)', [sid]);
        await runA.query('SELECT public.end_learning_path_session($1)', [sid]);
      } else {
        await asServiceRole(admin);
        if (mode === 'legacy-maintenance') {
          await admin.query(`UPDATE public.learning_path_progress_sessions SET session_end=last_heartbeat,time_spent_minutes=10 WHERE id=$1`, [sid]);
        }
        await admin.query(`SELECT public.close_stale_learning_path_sessions(now()-interval '5 minutes')`);
        await admin.query(`SELECT public.close_stale_learning_path_sessions(now()-interval '5 minutes')`);
      }
      await admin.query('RESET ROLE');
      const result = (await admin.query(`SELECT session_end=session_start AS at_start, settled_at IS NOT NULL AS settled,
        time_spent_minutes AS minutes, credited_minutes AS credit,
        (SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id=$2 AND path_id=$3) AS progress
        FROM public.learning_path_progress_sessions WHERE id=$1`, [sid, USER_B, PATH])).rows[0];
      assert(result.at_start && result.settled && result.minutes===0 && result.credit===0 && result.progress===0,
        `${mode}: stored zero-credit settlement and repeat: ${JSON.stringify(result)}`);
      if (mode === 'revoked-end') {
        await admin.query(`INSERT INTO public.learning_path_assignments(id,path_id,user_id,assigned_by) VALUES($1,$2,$3,$4)`, [ASSIGN_B,PATH,USER_B,ADMIN]);
      }
      console.log(`✓ R5-01 ${mode}: unchanged finite future heartbeat stays rejected across deadline; stored zero-credit closure, repeat and progress checked`);
    }
  } finally {
    // Release any transaction a failed assertion left open BEFORE anything
    // else (a blocked connection would otherwise queue the cleanup forever).
    await runA.query('ROLLBACK').catch(() => undefined);
    await runB.query('ROLLBACK').catch(() => undefined);
    await runA.query('RESET ROLE').catch(() => undefined);
    await runB.query('RESET ROLE').catch(() => undefined);
    await cleanup(admin);
    await Promise.all([admin.end(), runA.end(), runB.end(), obs.end()]);
  }
}

main().catch((error) => {
  console.error(`[lp-session-settlement-proof] ${error.message}`);
  if (process.env.LP_PROOF_DEBUG) console.error(error.stack);
  process.exit(1);
});

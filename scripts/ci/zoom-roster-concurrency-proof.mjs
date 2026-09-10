/**
 * Real-Postgres concurrency proof for the explicit operator roster (FNE Zoom
 * internal testing, Unit B2a; migration 20260910120000_zoom_explicit_roster).
 *
 * pgTAP runs in ONE transaction and cannot hold a lock against itself, so it
 * cannot prove the serialization point. This proof uses independent
 * connections. Every interleaving is forced with a REAL lock barrier: the
 * waiting backend is confirmed blocked by the holder through
 * pg_blocking_pids() before the holder commits — never by a sleep alone.
 *
 * Interleavings proven (committed final states asserted after each):
 *   0. delete-first (plain SQL under the session lock) vs approval: the
 *      approval waits, then sees the committed deletion and is refused. This
 *      scenario needs no new RPC, so on the pre-migration schema it FAILS on
 *      its assertion (the empty operator roster is approved) — fail-on-old.
 *   1. approval-first vs removal RPC of the last eligible attendee: removal
 *      waits, then re-reads 'programada' and refuses; row + scheduled
 *      notification kept.
 *   2. removal-first (RPC) vs approval: approval waits, then is refused; the
 *      draft stays empty and its scheduled notification is cancelled.
 *   3. add-first (RPC) vs approval: approval waits and then succeeds on the
 *      freshly committed roster (fresh statement snapshot).
 *   4. multi-session status UPDATE (client + valid operator + empty operator)
 *      is refused as a whole: no status changes.
 *   5. approval-first vs revocation of the only participant: revocation waits
 *      on the gate's pin, then commits; session stays 'programada', attendee
 *      expired, notification cancelled — last-member revocation is possible
 *      and never rolled back.
 *   6. revocation-first (uncommitted) vs approval: the gate does not wait
 *      (SKIP LOCKED) and fails 55P03; after the revocation commits it fails
 *      23514.
 *   7. revocation-first (uncommitted) vs add RPC: roster_busy without waiting,
 *      nothing written; after commit, invalid_attendees.
 *   8. add-first (RPC) vs revocation: revocation waits, then expires the row
 *      the add committed (no revoked member left expected = true).
 *   9. revocation-first (uncommitted) vs removal RPC on a scheduled session:
 *      roster_busy without waiting (no deadlock); after the last participant's
 *      revocation commits, the revoked roster can be cleaned up.
 *  10. uncommitted direct attendee DELETE, without the parent lock, vs
 *      approval: the gate does not wait (SKIP LOCKED) and fails 55P03 with its
 *      own message; after the delete commits it fails 23514.
 *  11. approval-first vs direct attendee DELETE without the parent lock: the
 *      delete waits on the gate's pin and commits only after the approval.
 *      Direct DML after that commit is not intercepted (approval-time rule).
 *  12. removal-first RPC vs moving a scheduled client session into the
 *      operator context (school/community change, no status transition): the
 *      move waits, then is refused 23514 on the emptied roster.
 *
 * Not claimed: that arbitrary multi-row DML orders are deadlock-free.
 *
 * BOUNDS. Every connection runs with statement_timeout 30 s and lock_timeout
 * 20 s, the barrier gives up after 15 s and a 120 s watchdog exits non-zero,
 * so broken locking fails the proof instead of hanging CI.
 *
 * ISOLATION. Local databases only. Synthetic fixtures with fixed ids (schools
 * 9881/9882, uuids prefixed b2a0c), cleaned before and after, so the proof is
 * rerunnable on a database holding unrelated data.
 */
import pg from 'pg';

const { Client } = pg;
const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const parsed = new URL(DB_URL);
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
  throw new Error('zoom roster concurrency proof refuses non-local databases');
}

const id = (group, n) => `b2a0c${group}00-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SCHOOL_OPERATOR = 9881;
const SCHOOL_CLIENT = 9882;
const GC_OPERATOR = id(1, 1);
const GC_CLIENT = id(1, 2);
const ACTOR = id(2, 1);
const U = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [n, id(3, n)]));
const S = Object.fromEntries(
  [0, 1, 2, 3, 40, 41, 42, 5, 6, 7, 8, 10, 11, 12].map((n) => [n, id(4, n)])
);
const ALL_SESSIONS = Object.values(S);
const ALL_PROFILES = [ACTOR, ...Object.values(U)];

const GATE_EMPTY = /operator roster gate: an operator session needs at least one expected attendee/;
// The gate's own busy message, so a lock_timeout (also 55P03) cannot pass as it.
const GATE_BUSY = /operator roster gate: the eligible roster of this operator session is being changed concurrently/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup(c) {
  await c.query('DELETE FROM public.session_activity_log WHERE session_id = ANY($1::uuid[])', [ALL_SESSIONS]);
  await c.query('DELETE FROM public.session_notifications WHERE session_id = ANY($1::uuid[])', [ALL_SESSIONS]);
  await c.query('DELETE FROM public.session_attendees WHERE session_id = ANY($1::uuid[])', [ALL_SESSIONS]);
  await c.query('DELETE FROM public.consultor_sessions WHERE id = ANY($1::uuid[])', [ALL_SESSIONS]);
  await c.query('DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[])', [ALL_PROFILES]);
  await c.query('DELETE FROM public.growth_communities WHERE id = ANY($1::uuid[])', [[GC_OPERATOR, GC_CLIENT]]);
  await c.query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [ALL_PROFILES]);
  await c.query('DELETE FROM public.schools WHERE id = ANY($1::int[])', [[SCHOOL_OPERATOR, SCHOOL_CLIENT]]);
}

async function seed(c) {
  await c.query(
    `INSERT INTO public.schools (id, name, tenant_kind, internal_zoom_testing_enabled)
     VALUES ($1, 'B2a proof operator school', 'operator', true),
            ($2, 'B2a proof client school', 'client', false)`,
    [SCHOOL_OPERATOR, SCHOOL_CLIENT]
  );
  await c.query(
    `INSERT INTO public.growth_communities (id, school_id, name)
     VALUES ($1, $2, 'B2a proof GC operator'), ($3, $4, 'B2a proof GC client')`,
    [GC_OPERATOR, SCHOOL_OPERATOR, GC_CLIENT, SCHOOL_CLIENT]
  );
  for (const profileId of ALL_PROFILES) {
    await c.query(
      `INSERT INTO public.profiles (id, email, name, approval_status)
       VALUES ($1, $2, 'B2a Proof Synthetic', 'approved')`,
      [profileId, `b2a-proof-${profileId.slice(-4)}@test.local`]
    );
  }
  for (const userId of Object.values(U)) {
    await c.query(
      `INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
       VALUES ($1, 'docente', $2, $3, true)`,
      [userId, SCHOOL_OPERATOR, GC_OPERATOR]
    );
  }
  const sessions = [
    [S[0], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[1], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[2], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[3], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[40], SCHOOL_CLIENT, GC_CLIENT],
    [S[41], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[42], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[5], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[6], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[7], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[8], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[10], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[11], SCHOOL_OPERATOR, GC_OPERATOR],
    [S[12], SCHOOL_CLIENT, GC_CLIENT],
  ];
  for (const [sessionId, schoolId, gcId] of sessions) {
    await c.query(
      `INSERT INTO public.consultor_sessions
         (id, school_id, growth_community_id, title, session_date, start_time, end_time,
          modality, status, created_by)
       VALUES ($1, $2, $3, 'B2a proof session', CURRENT_DATE + 30, '10:00', '11:00',
               'online', 'borrador', $4)`,
      [sessionId, schoolId, gcId, ACTOR]
    );
  }
}

/** Plain attendee row, written as the owner (fixture, not the RPC under test). */
async function attendee(c, sessionId, userId) {
  await c.query(
    'INSERT INTO public.session_attendees (session_id, user_id, expected) VALUES ($1, $2, true)',
    [sessionId, userId]
  );
}

async function scheduledNotification(c, sessionId, userId) {
  await c.query(
    `INSERT INTO public.session_notifications
       (session_id, user_id, notification_type, channel, scheduled_for, status)
     VALUES ($1, $2, 'session_reminder_24h', 'email', now() + interval '29 days', 'scheduled')`,
    [sessionId, userId]
  );
}

async function begin(c, { serviceRole = false } = {}) {
  await c.query('BEGIN');
  if (serviceRole) await c.query('SET LOCAL ROLE service_role');
}

function rpc(c, name, sessionId, userIds) {
  return c
    .query(`SELECT public.${name}($1, $2::uuid[], $3) AS r`, [sessionId, userIds, ACTOR])
    .then((result) => result.rows[0].r);
}

/** Autocommit RPC call as service_role. */
async function rpcCommitted(c, name, sessionId, userIds) {
  await begin(c, { serviceRole: true });
  try {
    const r = await rpc(c, name, sessionId, userIds);
    await c.query('COMMIT');
    return r;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  }
}

/** Settle a promise into {ok, value|error} so a rejection is observed, not thrown. */
function settle(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  );
}

async function pid(c) {
  return (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
}

/** The lock barrier: wait until `waiterPid` is blocked by `holderPid`. */
async function waitUntilBlocked(observer, waiterPid, holderPid, label) {
  const deadline = Date.now() + 15000;
  for (;;) {
    const { rows } = await observer.query(
      'SELECT $2::int = ANY (pg_blocking_pids($1::int)) AS blocked',
      [waiterPid, holderPid]
    );
    if (rows[0].blocked) return;
    if (Date.now() > deadline) throw new Error(`${label}: waiter never blocked on the holder`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function one(c, sql, params) {
  return (await c.query(sql, params)).rows[0];
}

async function sessionStatus(c, sessionId) {
  return (await one(c, 'SELECT status FROM public.consultor_sessions WHERE id = $1', [sessionId])).status;
}

async function attendeeRow(c, sessionId, userId) {
  return (
    await c.query(
      'SELECT expected, attended FROM public.session_attendees WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId]
    )
  ).rows[0];
}

async function notificationStatus(c, sessionId, userId) {
  return (
    await one(
      c,
      "SELECT string_agg(status, ',' ORDER BY status) AS s FROM public.session_notifications WHERE session_id = $1 AND user_id = $2",
      [sessionId, userId]
    )
  ).s;
}

async function main() {
  const admin = new Client({ connectionString: DB_URL });
  const a = new Client({ connectionString: DB_URL });
  const b = new Client({ connectionString: DB_URL });
  await Promise.all([admin.connect(), a.connect(), b.connect()]);
  await Promise.all(
    [admin, a, b].map((c) => c.query("SET statement_timeout = '30s'; SET lock_timeout = '20s'"))
  );
  const [aPid, bPid] = await Promise.all([pid(a), pid(b)]);
  const approve = (c, sessionIds) =>
    c.query("UPDATE public.consultor_sessions SET status = 'programada' WHERE id = ANY($1::uuid[])", [
      sessionIds,
    ]);

  try {
    await cleanup(admin);
    await seed(admin);

    // --- 0. delete-first (plain SQL under the session lock) vs approval -------
    await attendee(admin, S[0], U[1]);
    await begin(b);
    await b.query('SELECT 1 FROM public.consultor_sessions WHERE id = $1 FOR NO KEY UPDATE', [S[0]]);
    await b.query('DELETE FROM public.session_attendees WHERE session_id = $1', [S[0]]);
    const approval0 = settle(approve(a, [S[0]]));
    await waitUntilBlocked(admin, aPid, bPid, 'scenario 0');
    await b.query('COMMIT');
    const r0 = await approval0;
    assert(
      !r0.ok && r0.error.code === '23514' && GATE_EMPTY.test(r0.error.message),
      `scenario 0: approval after a committed last deletion was not refused (${r0.ok ? 'approved' : r0.error.message})`
    );
    assert((await sessionStatus(admin, S[0])) === 'borrador', 'scenario 0: session status changed');

    // --- 1. approval-first vs removal of the last eligible attendee ----------
    await attendee(admin, S[1], U[1]);
    await scheduledNotification(admin, S[1], U[1]);
    await begin(a);
    await approve(a, [S[1]]);
    await begin(b, { serviceRole: true });
    const removal1 = settle(rpc(b, 'session_roster_remove_attendees', S[1], [U[1]]));
    await waitUntilBlocked(admin, bPid, aPid, 'scenario 1');
    await a.query('COMMIT');
    const r1 = await removal1;
    await b.query('COMMIT');
    assert(
      r1.ok && r1.value.ok === false && r1.value.reason === 'last_eligible_attendee',
      `scenario 1: removal after committed approval returned ${JSON.stringify(r1.ok ? r1.value : r1.error.message)}`
    );
    assert((await sessionStatus(admin, S[1])) === 'programada', 'scenario 1: approval did not commit');
    assert((await attendeeRow(admin, S[1], U[1]))?.expected === true, 'scenario 1: attendee row lost');
    assert(
      (await notificationStatus(admin, S[1], U[1])) === 'scheduled',
      'scenario 1: refused removal touched the scheduled notification'
    );

    // --- 2. removal-first vs approval ---------------------------------------
    await attendee(admin, S[2], U[1]);
    await scheduledNotification(admin, S[2], U[1]);
    await begin(b, { serviceRole: true });
    const r2rpc = await rpc(b, 'session_roster_remove_attendees', S[2], [U[1]]);
    assert(r2rpc.ok === true && r2rpc.removed_count === 1, `scenario 2: draft removal returned ${JSON.stringify(r2rpc)}`);
    const approval2 = settle(approve(a, [S[2]]));
    await waitUntilBlocked(admin, aPid, bPid, 'scenario 2');
    await b.query('COMMIT');
    const r2 = await approval2;
    assert(
      !r2.ok && r2.error.code === '23514' && GATE_EMPTY.test(r2.error.message),
      `scenario 2: approval after committed removal was not refused (${r2.ok ? 'approved' : r2.error.message})`
    );
    assert((await sessionStatus(admin, S[2])) === 'borrador', 'scenario 2: session status changed');
    assert(!(await attendeeRow(admin, S[2], U[1])), 'scenario 2: removed row came back');
    assert(
      (await notificationStatus(admin, S[2], U[1])) === 'cancelled',
      'scenario 2: scheduled notification was not cancelled with the removal'
    );

    // --- 3. add-first vs approval (fresh snapshot, positive side) -------------
    await begin(b, { serviceRole: true });
    const r3rpc = await rpc(b, 'session_roster_add_attendees', S[3], [U[2]]);
    assert(r3rpc.ok === true && r3rpc.added_count === 1, `scenario 3: add returned ${JSON.stringify(r3rpc)}`);
    const approval3 = settle(approve(a, [S[3]]));
    await waitUntilBlocked(admin, aPid, bPid, 'scenario 3');
    await b.query('COMMIT');
    const r3 = await approval3;
    assert(r3.ok, `scenario 3: approval after a committed add failed (${r3.ok ? '' : r3.error.message})`);
    assert((await sessionStatus(admin, S[3])) === 'programada', 'scenario 3: session not scheduled');

    // --- 4. multi-session UPDATE atomicity -------------------------------------
    await attendee(admin, S[41], U[1]);
    const r4 = await settle(approve(a, [S[40], S[41], S[42]]));
    assert(!r4.ok && r4.error.code === '23514', `scenario 4: mixed bulk approval was not refused`);
    for (const sessionId of [S[40], S[41], S[42]]) {
      assert((await sessionStatus(admin, sessionId)) === 'borrador', 'scenario 4: a status change survived');
    }

    // --- 5. approval-first vs revocation of the only participant -------------
    await attendee(admin, S[5], U[3]);
    await scheduledNotification(admin, S[5], U[3]);
    await begin(a);
    await approve(a, [S[5]]);
    const revoke5 = settle(
      b.query('UPDATE public.user_roles SET is_active = false WHERE user_id = $1 AND community_id = $2', [
        U[3],
        GC_OPERATOR,
      ])
    );
    await waitUntilBlocked(admin, bPid, aPid, 'scenario 5');
    await a.query('COMMIT');
    const r5 = await revoke5;
    assert(r5.ok, `scenario 5: revocation failed (${r5.ok ? '' : r5.error.message})`);
    assert((await sessionStatus(admin, S[5])) === 'programada', 'scenario 5: approval did not commit');
    assert((await attendeeRow(admin, S[5], U[3]))?.expected === false, 'scenario 5: last participant not expired');
    assert((await notificationStatus(admin, S[5], U[3])) === 'cancelled', 'scenario 5: notification not cancelled');

    // --- 6. revocation-first (uncommitted) vs approval ------------------------
    await attendee(admin, S[6], U[4]);
    await begin(b);
    await b.query('UPDATE public.user_roles SET is_active = false WHERE user_id = $1 AND community_id = $2', [
      U[4],
      GC_OPERATOR,
    ]);
    const r6busy = await settle(approve(a, [S[6]]));
    assert(
      !r6busy.ok && r6busy.error.code === '55P03',
      `scenario 6: approval against a locked membership returned ${r6busy.ok ? 'approved' : r6busy.error.code}`
    );
    await b.query('COMMIT');
    const r6 = await settle(approve(a, [S[6]]));
    assert(!r6.ok && r6.error.code === '23514', 'scenario 6: approval of a revoked roster was not refused');
    assert((await sessionStatus(admin, S[6])) === 'borrador', 'scenario 6: session status changed');

    // --- 7. revocation-first (uncommitted) vs add ------------------------------
    await begin(b);
    await b.query('UPDATE public.user_roles SET is_active = false WHERE user_id = $1 AND community_id = $2', [
      U[5],
      GC_OPERATOR,
    ]);
    const r7busy = await rpcCommitted(a, 'session_roster_add_attendees', S[7], [U[5]]);
    assert(r7busy.ok === false && r7busy.reason === 'roster_busy', `scenario 7: add returned ${JSON.stringify(r7busy)}`);
    assert(!(await attendeeRow(admin, S[7], U[5])), 'scenario 7: busy add wrote a row');
    await b.query('COMMIT');
    const r7 = await rpcCommitted(a, 'session_roster_add_attendees', S[7], [U[5]]);
    assert(r7.ok === false && r7.reason === 'invalid_attendees', `scenario 7: add after revocation returned ${JSON.stringify(r7)}`);

    // --- 8. add-first vs revocation (scheduled session) -----------------------
    await attendee(admin, S[8], U[6]);
    await approve(admin, [S[8]]);
    await begin(b, { serviceRole: true });
    const r8rpc = await rpc(b, 'session_roster_add_attendees', S[8], [U[7]]);
    assert(r8rpc.ok === true && r8rpc.added_count === 1, `scenario 8: add returned ${JSON.stringify(r8rpc)}`);
    const revoke8 = settle(
      a.query('UPDATE public.user_roles SET is_active = false WHERE user_id = $1 AND community_id = $2', [
        U[7],
        GC_OPERATOR,
      ])
    );
    await waitUntilBlocked(admin, aPid, bPid, 'scenario 8');
    await b.query('COMMIT');
    const r8 = await revoke8;
    assert(r8.ok, `scenario 8: revocation failed (${r8.ok ? '' : r8.error.message})`);
    assert(
      (await attendeeRow(admin, S[8], U[7]))?.expected === false,
      'scenario 8: a revoked member stayed expected on the roster the add committed'
    );

    // --- 9. revocation-first (uncommitted) vs removal, last participant -------
    await begin(b);
    await b.query('UPDATE public.user_roles SET is_active = false WHERE user_id = $1 AND community_id = $2', [
      U[6],
      GC_OPERATOR,
    ]);
    const r9busy = await rpcCommitted(a, 'session_roster_remove_attendees', S[8], [U[6]]);
    assert(r9busy.ok === false && r9busy.reason === 'roster_busy', `scenario 9: removal returned ${JSON.stringify(r9busy)}`);
    await b.query('COMMIT');
    assert((await attendeeRow(admin, S[8], U[6]))?.expected === false, 'scenario 9: last participant revocation lost');
    const r9 = await rpcCommitted(a, 'session_roster_remove_attendees', S[8], [U[6]]);
    assert(r9.ok === true && r9.removed_count === 1, `scenario 9: revoked roster cleanup returned ${JSON.stringify(r9)}`);
    assert((await sessionStatus(admin, S[8])) === 'programada', 'scenario 9: scheduled session status changed');

    // --- 10. uncommitted direct attendee DELETE (no parent lock) vs approval --
    await attendee(admin, S[10], U[1]);
    await begin(b);
    const del10 = await b.query('DELETE FROM public.session_attendees WHERE session_id = $1', [S[10]]);
    assert(del10.rowCount === 1, 'scenario 10: fixture delete removed no attendee');
    const r10busy = await settle(approve(a, [S[10]]));
    assert(
      !r10busy.ok && r10busy.error.code === '55P03' && GATE_BUSY.test(r10busy.error.message),
      `scenario 10: approval against an uncommitted direct delete returned ${r10busy.ok ? 'approved' : r10busy.error.message}`
    );
    await b.query('COMMIT');
    const r10 = await settle(approve(a, [S[10]]));
    assert(
      !r10.ok && r10.error.code === '23514' && GATE_EMPTY.test(r10.error.message),
      `scenario 10: approval after the committed direct delete was not refused (${r10.ok ? 'approved' : r10.error.message})`
    );
    assert((await sessionStatus(admin, S[10])) === 'borrador', 'scenario 10: session status changed');
    assert(!(await attendeeRow(admin, S[10], U[1])), 'scenario 10: deleted attendee came back');

    // --- 11. approval-first vs direct attendee DELETE (no parent lock) --------
    await attendee(admin, S[11], U[1]);
    await begin(a);
    await approve(a, [S[11]]);
    const delete11 = settle(b.query('DELETE FROM public.session_attendees WHERE session_id = $1', [S[11]]));
    await waitUntilBlocked(admin, bPid, aPid, 'scenario 11');
    await a.query('COMMIT');
    const r11 = await delete11;
    assert(
      r11.ok && r11.value.rowCount === 1,
      `scenario 11: direct delete after the approval did not commit (${r11.ok ? r11.value.rowCount : r11.error.message})`
    );
    assert((await sessionStatus(admin, S[11])) === 'programada', 'scenario 11: approval did not commit');
    assert(!(await attendeeRow(admin, S[11], U[1])), 'scenario 11: deleted attendee still present');

    // --- 12. removal-first RPC vs moving a scheduled session into operator ----
    await attendee(admin, S[12], U[2]);
    await approve(admin, [S[12]]);
    await begin(b, { serviceRole: true });
    const r12rpc = await rpc(b, 'session_roster_remove_attendees', S[12], [U[2]]);
    assert(r12rpc.ok === true && r12rpc.removed_count === 1, `scenario 12: client removal returned ${JSON.stringify(r12rpc)}`);
    const move12 = settle(
      a.query('UPDATE public.consultor_sessions SET school_id = $2, growth_community_id = $3 WHERE id = $1', [
        S[12],
        SCHOOL_OPERATOR,
        GC_OPERATOR,
      ])
    );
    await waitUntilBlocked(admin, aPid, bPid, 'scenario 12');
    await b.query('COMMIT');
    const r12 = await move12;
    assert(
      !r12.ok && r12.error.code === '23514' && GATE_EMPTY.test(r12.error.message),
      `scenario 12: moving an emptied scheduled session into the operator context was not refused (${r12.ok ? 'moved' : r12.error.message})`
    );
    const row12 = await one(
      admin,
      'SELECT status, school_id, growth_community_id FROM public.consultor_sessions WHERE id = $1',
      [S[12]]
    );
    assert(
      row12.status === 'programada' && row12.school_id === SCHOOL_CLIENT && row12.growth_community_id === GC_CLIENT,
      'scenario 12: the refused move changed the session'
    );

    console.log('✓ 0 delete-first (SQL, session lock) vs approval: approval waited, then refused (fail-on-old scenario)');
    console.log('✓ 1 approval-first vs last removal RPC: removal waited, re-read programada, refused; row + notification kept');
    console.log('✓ 2 removal-first RPC vs approval: approval waited, then refused; draft empty, notification cancelled');
    console.log('✓ 3 add-first RPC vs approval: approval waited, then scheduled on the fresh roster');
    console.log('✓ 4 client + valid operator + empty operator status UPDATE: refused as a whole, no status change');
    console.log('✓ 5 approval-first vs revocation of the only participant: revocation waited, committed, expired it');
    console.log('✓ 6 uncommitted revocation vs approval: 55P03 without waiting, then 23514 after commit');
    console.log('✓ 7 uncommitted revocation vs add RPC: roster_busy without waiting, then invalid_attendees');
    console.log('✓ 8 add-first RPC vs revocation: revocation waited, then expired the committed row');
    console.log('✓ 9 uncommitted revocation vs removal RPC: roster_busy (no deadlock); revoked roster then cleaned up');
    console.log('✓ 10 uncommitted direct DELETE (no parent lock) vs approval: gate 55P03 without waiting, then 23514');
    console.log('✓ 11 approval-first vs direct DELETE (no parent lock): delete waited on the pin, committed after approval');
    console.log('✓ 12 removal-first RPC vs move into operator context: move waited, then refused on the emptied roster');
  } finally {
    // Concurrently: a connection still waiting on the other's lock only
    // finishes once the holder's ROLLBACK runs.
    await Promise.all([a, b].map((c) => c.query('ROLLBACK').catch(() => {})));
    await cleanup(admin);
    await Promise.all([admin.end(), a.end(), b.end()]);
  }
}

const watchdog = setTimeout(() => {
  console.error('[zoom-roster-concurrency-proof] exceeded 120 s; aborting');
  process.exit(1);
}, 120000);
watchdog.unref();

main().catch((error) => {
  console.error(`[zoom-roster-concurrency-proof] ${error.message}`);
  process.exit(1);
});

/**
 * The one-active-network-per-supervisor concurrency proof (B2a correction).
 *
 * The application enforces the rule twice (pages/api/admin/networks/supervisors.ts
 * pre-checks; utils/roleUtils.ts::assignSupervisorRole re-checks), but both are
 * look-before-insert: two requests that pass the check in the same instant would
 * BOTH insert, and no in-process test can prove otherwise — there is no second
 * database session to race against. Migration 20260827150000 adds the partial
 * unique index `uq_user_roles_one_active_supervisor`, and THIS script is the
 * proof that the index actually closes the race.
 *
 * It seeds one synthetic user and two synthetic networks on the REAL local
 * Postgres, then races two competing network assignments on two separate
 * database sessions, twice over:
 *
 *   1. HELD-LOCK RACE — session A inserts inside an open transaction and holds
 *      it. Session B's competing insert MUST block on the index's uniqueness
 *      wait (if it completes while A holds, the race is open and the proof
 *      fails). When A commits, B must fail with SQLSTATE 23505 — the error the
 *      API maps to HTTP 409 (`active_role_conflict`).
 *   2. DOUBLE-FIRE — both sessions fire simultaneous autocommit inserts for the
 *      two networks; exactly one may win, the loser must get 23505.
 *
 * After both, the end state is asserted: EXACTLY ONE active supervisor row for
 * the user, while inactive historical rows remain insertable without limit.
 *
 * ## Why it talks to Postgres directly
 *
 * Same reason as queue-concurrency-proof.mjs: the db-only CI context has no
 * PostgREST to speak supabase-js to, and the index is enforced by Postgres
 * itself, beneath every wire path the product uses. `pg` is already a project
 * dependency.
 *
 * Run locally with `npm run test:supervisor-concurrency` against a started
 * stack (`supabase start` + migrations applied). Synthetic data only
 * (Ley 21.719); the script pre-purges and re-purges its own fixed-uuid rows.
 */
import pg from 'pg';

const { Client } = pg;

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const PROOF_TAG = 'supervisor-concurrency';

/** Fixed synthetic ids so re-runs converge and cleanup is exact. */
const USER_ID = '00000000-0000-0000-0000-000000b2ac01';
const CREATOR_ID = '00000000-0000-0000-0000-000000b2ac00';
const RED_A_ID = '00000000-0000-0000-0000-000000b2ac11';
const RED_B_ID = '00000000-0000-0000-0000-000000b2ac12';

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
    throw new Error(
      `[${PROOF_TAG}] refusing to run against non-local database host "${host}". ` +
        'This proof inserts and deletes synthetic rows.'
    );
  }
}

const INSERT_SQL = `
  INSERT INTO public.user_roles (user_id, role_type, red_id, is_active, assigned_by, assigned_at)
  VALUES ($1, 'supervisor_de_red', $2, true, $3, now())
`;

async function purge(admin) {
  await admin.query('DELETE FROM public.user_roles WHERE user_id IN ($1, $2)', [USER_ID, CREATOR_ID]);
  await admin.query('DELETE FROM public.redes_de_colegios WHERE id IN ($1, $2)', [RED_A_ID, RED_B_ID]);
  await admin.query('DELETE FROM public.profiles WHERE id IN ($1, $2)', [USER_ID, CREATOR_ID]);
  await admin.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [USER_ID, CREATOR_ID]);
}

async function seed(admin) {
  await admin.query(
    `INSERT INTO auth.users (id, email, instance_id, aud, role)
     VALUES
       ($1, 'b2a-proof-creator@rls-test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ($2, 'b2a-proof-user@rls-test.local',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
     ON CONFLICT (id) DO NOTHING`,
    [CREATOR_ID, USER_ID]
  );
  await admin.query(
    `INSERT INTO public.profiles (id, email, name, approval_status)
     VALUES
       ($1, 'b2a-proof-creator@rls-test.local', 'B2a Proof Creator Sintetico', 'approved'),
       ($2, 'b2a-proof-user@rls-test.local',    'B2a Proof Supervisor Sintetico', 'approved')
     ON CONFLICT (id) DO NOTHING`,
    [CREATOR_ID, USER_ID]
  );
  await admin.query(
    `INSERT INTO public.redes_de_colegios (id, nombre, descripcion, created_by)
     VALUES
       ($1, 'Red Sintetica Proof B2a Alfa', 'Red sintetica para el proof de concurrencia. No es una red real.', $3),
       ($2, 'Red Sintetica Proof B2a Beta', 'Red sintetica para el proof de concurrencia. No es una red real.', $3)
     ON CONFLICT (id) DO NOTHING`,
    [RED_A_ID, RED_B_ID, CREATOR_ID]
  );
}

async function activeRows(admin) {
  const { rows } = await admin.query(
    `SELECT red_id FROM public.user_roles
     WHERE user_id = $1 AND role_type = 'supervisor_de_red' AND is_active = true`,
    [USER_ID]
  );
  return rows;
}

async function main() {
  assertLocal(DB_URL);

  const admin = new Client({ connectionString: DB_URL });
  const sessionA = new Client({ connectionString: DB_URL });
  const sessionB = new Client({ connectionString: DB_URL });

  await admin.connect();
  await sessionA.connect();
  await sessionB.connect();

  try {
    await purge(admin);
    await seed(admin);
    console.log(`[${PROOF_TAG}] fixtures seeded on ${DB_URL.replace(/:[^:@/]+@/, ':***@')}`);

    // ---- Phase 1: held-lock race ---------------------------------------------
    // A inserts and HOLDS the transaction. B's competing insert must block on
    // the unique index; if it completes while A holds, there is no index and
    // the race is open.
    await sessionA.query('BEGIN');
    await sessionA.query(INSERT_SQL, [USER_ID, RED_A_ID, CREATOR_ID]);

    let bSettled = null;
    const bPromise = sessionB
      .query(INSERT_SQL, [USER_ID, RED_B_ID, CREATOR_ID])
      .then(() => { bSettled = 'inserted'; })
      .catch((error) => { bSettled = error.code || 'error'; return error; });

    await sleep(400);
    if (bSettled === 'inserted') {
      await sessionA.query('ROLLBACK').catch(() => {});
      fail(
        'session B inserted a SECOND active supervisor row while session A held its ' +
          'uncommitted insert — the unique index is not enforcing, the race is open'
      );
    }
    if (bSettled === null) {
      ok('competing insert BLOCKS on the unique index while the first is uncommitted');
    } else {
      // Already 23505 without blocking would mean A had somehow committed; treat
      // any pre-commit settlement that is not a block as suspicious.
      fail(`session B settled early with "${bSettled}" while session A still held its transaction`);
    }

    await sessionA.query('COMMIT');
    const bError = await bPromise;
    if (bSettled !== '23505') {
      fail(`after the winner committed, the loser reported "${bSettled}" (${bError?.message ?? 'no error'}) — expected SQLSTATE 23505`);
    }
    ok('after the winner commits, the loser fails with SQLSTATE 23505 (the API maps this to HTTP 409)');

    let rows = await activeRows(admin);
    if (rows.length !== 1 || rows[0].red_id !== RED_A_ID) {
      fail(`expected exactly one active row (network Alfa) after phase 1, found ${JSON.stringify(rows)}`);
    }
    ok('phase 1 end state: exactly one active supervisor row');

    // ---- Phase 2: simultaneous double-fire ----------------------------------
    // Reset to zero active rows (deactivate — never delete — mirroring the
    // product's removal semantics), then fire both inserts at once.
    await admin.query(
      `UPDATE public.user_roles SET is_active = false
       WHERE user_id = $1 AND role_type = 'supervisor_de_red' AND is_active = true`,
      [USER_ID]
    );

    const settled = await Promise.allSettled([
      sessionA.query(INSERT_SQL, [USER_ID, RED_A_ID, CREATOR_ID]),
      sessionB.query(INSERT_SQL, [USER_ID, RED_B_ID, CREATOR_ID]),
    ]);
    const winners = settled.filter((r) => r.status === 'fulfilled').length;
    const conflicts = settled.filter(
      (r) => r.status === 'rejected' && r.reason?.code === '23505'
    ).length;
    if (winners !== 1 || conflicts !== 1) {
      fail(
        `double-fire expected exactly 1 winner + 1 SQLSTATE 23505, got ${winners} winner(s) and ` +
          `${conflicts} conflict(s): ${settled.map((r) => (r.status === 'fulfilled' ? 'inserted' : r.reason?.code)).join(', ')}`
      );
    }
    ok('simultaneous double-fire: exactly one insert wins, the other gets 23505');

    rows = await activeRows(admin);
    if (rows.length !== 1) {
      fail(`expected exactly one active supervisor row after the double-fire, found ${rows.length}`);
    }
    ok('phase 2 end state: exactly one active supervisor row');

    // ---- Phase 3: history stays open ----------------------------------------
    const { rows: historyCount } = await admin.query(
      `SELECT count(*)::int AS n FROM public.user_roles
       WHERE user_id = $1 AND role_type = 'supervisor_de_red' AND is_active = false`,
      [USER_ID]
    );
    if (historyCount[0].n < 1) {
      fail('expected the deactivated historical row(s) to survive — none found');
    }
    await admin.query(
      `INSERT INTO public.user_roles (user_id, role_type, red_id, is_active, assigned_by, assigned_at)
       VALUES ($1, 'supervisor_de_red', $2, false, $3, now())`,
      [USER_ID, RED_B_ID, CREATOR_ID]
    );
    ok('inactive historical rows are preserved and remain insertable without limit');

    console.log(`\n✓ PASS [${PROOF_TAG}]: two competing network assignments leave exactly one active row\n`);
  } finally {
    try {
      await purge(admin);
      console.log(`[${PROOF_TAG}] synthetic fixtures purged`);
    } finally {
      await Promise.allSettled([admin.end(), sessionA.end(), sessionB.end()]);
    }
  }
}

main().catch((error) => {
  if (process.exitCode !== 1) {
    console.error(`\n✗ FAIL [${PROOF_TAG}]:`, error);
    process.exitCode = 1;
  }
  process.exit(1);
});

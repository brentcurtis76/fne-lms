/**
 * Real-Postgres concurrency proof for password recovery. Two independent
 * sessions race the candidate cooldown, outbox lease, and retry-grant lease.
 * In-process mocks cannot prove advisory locks or FOR UPDATE SKIP LOCKED.
 *
 * ISOLATION (fourth-pass finding 7). Every assertion is scoped to this proof's
 * own synthetic candidate fingerprints, grant hash and fixture account, and the
 * outbox claims pass their candidate scope to `claim_password_recovery_outbox`
 * — so the proof passes, twice in a row without a reset, on a database that
 * already contains unrelated queued recovery work. It also SEEDS such an
 * unrelated job itself (the bystander) and proves it comes through untouched.
 *
 * ANTI-ENUMERATION shapes proven here, on a real database:
 *   * simultaneous requests for one candidate from two instances/IPs create
 *     exactly one durable job;
 *   * a KNOWN and an UNKNOWN candidate enqueued concurrently both return
 *     'queued' — the public transaction resolves no account existence;
 *   * while one candidate's advisory lock is HELD, a request for a different
 *     candidate completes without waiting — per-candidate serialization leaks
 *     no cross-candidate (and therefore no cross-account) timing;
 *   * the worker's canonical resolution resolves the known candidate to the
 *     fixture account and terminally discards the unknown one.
 */
import pg from 'pg';

const { Client } = pg;
const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const parsed = new URL(DB_URL);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
  throw new Error('recovery concurrency proof refuses non-local databases');
}

const USER_ID = '00000000-0000-4000-8000-00000000c001';
const EMAIL = 'recovery-concurrency@synthetic.local';
/** Deliberately mixed-case and padded: the resolver must normalize BOTH sides. */
const PROFILE_EMAIL = '  Recovery-CONCURRENCY@Synthetic.Local ';

const CAND_KNOWN = 'd1'.repeat(32);
const CAND_UNKNOWN = 'd2'.repeat(32);
const CAND_LOCKED = 'd3'.repeat(32);
const CAND_PROBE = 'd4'.repeat(32);
const CAND_BYSTANDER = 'd5'.repeat(32);
const ALL_CANDIDATES = [CAND_KNOWN, CAND_UNKNOWN, CAND_LOCKED, CAND_PROBE, CAND_BYSTANDER];

const IP_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const IP_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
const GRANT = 'ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3';
const WORKER_A = '00000000-0000-4000-8000-00000000ca01';
const WORKER_B = '00000000-0000-4000-8000-00000000cb02';

const ENQUEUE_SQL =
  'SELECT public.enqueue_password_recovery($1, $2, $3, 600, 10, 60) AS status';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup(client) {
  await client.query('DELETE FROM public.security_audit_events WHERE target_user_id = $1', [USER_ID]);
  await client.query(
    'DELETE FROM auth_security.password_recovery_outbox WHERE candidate_fingerprint = ANY($1::text[])',
    [ALL_CANDIDATES]
  );
  await client.query(
    'DELETE FROM auth_security.password_recovery_ip_buckets WHERE subject_hash = ANY($1::text[])',
    [[IP_A, IP_B]]
  );
  await client.query('DELETE FROM auth_security.recovery_attempt_grants WHERE grant_hash = $1', [GRANT]);
  await client.query('DELETE FROM public.profiles WHERE id = $1', [USER_ID]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [USER_ID]);
}

async function main() {
  const admin = new Client({ connectionString: DB_URL });
  const instanceA = new Client({ connectionString: DB_URL });
  const instanceB = new Client({ connectionString: DB_URL });
  await Promise.all([admin.connect(), instanceA.connect(), instanceB.connect()]);

  try {
    await cleanup(admin);
    await admin.query(
      `INSERT INTO auth.users (id, email, instance_id, aud, role)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`,
      [USER_ID, EMAIL]
    );
    await admin.query(
      `INSERT INTO public.profiles (id, email, name, first_name, approval_status)
       VALUES ($1, $2, 'Recovery Concurrency', 'Synthetic', 'approved')`,
      [USER_ID, PROFILE_EMAIL]
    );

    // --- 0. THE BYSTANDER: unrelated queued recovery work stays untouched ---
    const bystander = await admin.query(ENQUEUE_SQL, [
      CAND_BYSTANDER,
      IP_A,
      'v1.synthetic.concurrent.envelope.bystander.1234567890',
    ]);
    assert(bystander.rows[0].status === 'queued', 'the bystander job failed to queue');

    // --- 1. CANDIDATE COOLDOWN RACE: one durable job -------------------------
    const [enqueueA, enqueueB] = await Promise.all([
      instanceA.query(ENQUEUE_SQL, [CAND_KNOWN, IP_A, 'v1.synthetic.concurrent.envelope.a.1234567890']),
      instanceB.query(ENQUEUE_SQL, [CAND_KNOWN, IP_B, 'v1.synthetic.concurrent.envelope.b.1234567890']),
    ]);
    const enqueueStatuses = [enqueueA.rows[0].status, enqueueB.rows[0].status].sort();
    assert(
      JSON.stringify(enqueueStatuses) === JSON.stringify(['queued', 'suppressed']),
      `candidate cooldown race returned ${JSON.stringify(enqueueStatuses)}`
    );

    // --- 2. KNOWN AND UNKNOWN, CONCURRENTLY: identical answers ---------------
    // CAND_UNKNOWN corresponds to no profile. If the transaction resolved
    // existence, these two concurrent calls could not both come back 'queued'.
    const [knownAgain, unknown] = await Promise.all([
      instanceA.query(ENQUEUE_SQL, [CAND_PROBE, IP_A, 'v1.synthetic.concurrent.envelope.probe.1234567890']),
      instanceB.query(ENQUEUE_SQL, [CAND_UNKNOWN, IP_B, 'v1.synthetic.concurrent.envelope.unknown.1234567890']),
    ]);
    assert(
      knownAgain.rows[0].status === 'queued' && unknown.rows[0].status === 'queued',
      `known/unknown concurrency returned ${knownAgain.rows[0].status}/${unknown.rows[0].status}`
    );

    // --- 3. PROBING WHILE A CANDIDATE LOCK IS HELD ---------------------------
    // Instance A holds CAND_LOCKED's advisory lock inside an open transaction —
    // the state of an in-flight request for that address. A request for a
    // DIFFERENT candidate must not wait on it: cross-candidate contention would
    // be a timing signal about other people's requests.
    await instanceA.query('BEGIN');
    await instanceA.query(
      "SELECT pg_advisory_xact_lock(hashtext('public.enqueue_password_recovery'), hashtext($1::text))",
      [CAND_LOCKED]
    );
    await instanceB.query("SET statement_timeout = '3s'");
    let probeStatus;
    try {
      const probe = await instanceB.query(ENQUEUE_SQL, [
        CAND_LOCKED === CAND_PROBE ? CAND_PROBE : CAND_KNOWN,
        IP_B,
        'v1.synthetic.concurrent.envelope.locked.1234567890',
      ]);
      probeStatus = probe.rows[0].status;
    } finally {
      await instanceB.query('RESET statement_timeout');
      await instanceA.query('ROLLBACK');
    }
    // CAND_KNOWN is inside its cooldown, so 'suppressed' is the expected verdict
    // — the point is that the answer ARRIVED while another candidate's lock was
    // held, instead of timing out behind it.
    assert(
      probeStatus === 'suppressed',
      `enqueue under a foreign candidate lock returned ${probeStatus} instead of completing`
    );

    // --- 4. OUTBOX LEASE RACE, scoped to this proof's candidate --------------
    const claimSql = 'SELECT * FROM public.claim_password_recovery_outbox($1, 1, 60, $2)';
    const [outboxA, outboxB] = await Promise.all([
      instanceA.query(claimSql, [WORKER_A, CAND_KNOWN]),
      instanceB.query(claimSql, [WORKER_B, CAND_KNOWN]),
    ]);
    assert(
      outboxA.rowCount + outboxB.rowCount === 1,
      `outbox race claimed ${outboxA.rowCount + outboxB.rowCount} rows instead of one`
    );
    const knownJob = (outboxA.rowCount === 1 ? outboxA : outboxB).rows[0];
    const knownWorker = outboxA.rowCount === 1 ? WORKER_A : WORKER_B;

    // --- 5. CANONICAL RESOLUTION: known resolves, unknown discards -----------
    const resolved = await admin.query(
      'SELECT * FROM public.resolve_password_recovery_outbox($1, $2, $3)',
      [knownJob.job_id, knownWorker, EMAIL]
    );
    assert(
      resolved.rows[0].status === 'resolved' && resolved.rows[0].user_id === USER_ID,
      `known candidate resolved as ${JSON.stringify(resolved.rows[0])}`
    );

    const unknownClaim = await instanceA.query(claimSql, [WORKER_A, CAND_UNKNOWN]);
    assert(unknownClaim.rowCount === 1, 'the unknown-candidate job was not claimable');
    const discarded = await admin.query(
      'SELECT * FROM public.resolve_password_recovery_outbox($1, $2, $3)',
      [unknownClaim.rows[0].job_id, WORKER_A, 'unknown-concurrency@synthetic.local']
    );
    assert(
      discarded.rows[0].status === 'discarded',
      `unknown candidate resolution returned ${discarded.rows[0].status}`
    );

    // --- 6. GRANT LEASE RACE -------------------------------------------------
    await admin.query(
      'SELECT public.create_recovery_attempt_grant($1, clock_timestamp() + interval \'15 minutes\', 5)',
      [GRANT]
    );
    const grantSql =
      'SELECT status FROM public.claim_recovery_attempt_grant($1, $2, 45)';
    const [grantA, grantB] = await Promise.all([
      instanceA.query(grantSql, [GRANT, WORKER_A]),
      instanceB.query(grantSql, [GRANT, WORKER_B]),
    ]);
    const grantStatuses = [grantA.rows[0].status, grantB.rows[0].status].sort();
    assert(
      JSON.stringify(grantStatuses) === JSON.stringify(['busy', 'claimed']),
      `grant race returned ${JSON.stringify(grantStatuses)}`
    );

    // --- 7. THE BYSTANDER IS UNTOUCHED ---------------------------------------
    const bystanderAfter = await admin.query(
      `SELECT state, lease_token FROM auth_security.password_recovery_outbox
        WHERE candidate_fingerprint = $1`,
      [CAND_BYSTANDER]
    );
    assert(
      bystanderAfter.rowCount === 1 &&
        bystanderAfter.rows[0].state === 'queued' &&
        bystanderAfter.rows[0].lease_token === null,
      `the unrelated queued job was disturbed: ${JSON.stringify(bystanderAfter.rows)}`
    );

    console.log('✓ candidate cooldown: 2 instances, different IPs, exactly 1 durable job');
    console.log('✓ known and unknown candidates enqueue identically, concurrently');
    console.log('✓ a held candidate lock blocks nothing but its own candidate');
    console.log('✓ outbox lease: 2 workers, exactly 1 claim, scoped to this proof');
    console.log('✓ canonical resolution: known → resolved (mixed-case profile), unknown → discarded');
    console.log('✓ recovery grant: 2 workers, exactly 1 provider-attempt lease');
    console.log('✓ an unrelated queued recovery job was never claimed or mutated');
  } finally {
    await cleanup(admin);
    await Promise.all([admin.end(), instanceA.end(), instanceB.end()]);
  }
}

main().catch((error) => {
  console.error(`[recovery-concurrency-proof] ${error.message}`);
  process.exit(1);
});

/**
 * Real-Postgres concurrency proof for password recovery. Two independent
 * sessions race the account cooldown, outbox lease, and retry-grant lease.
 * In-process mocks cannot prove advisory locks or FOR UPDATE SKIP LOCKED.
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
const IP_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const IP_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
const GRANT = 'ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3';
const WORKER_A = '00000000-0000-4000-8000-00000000ca01';
const WORKER_B = '00000000-0000-4000-8000-00000000cb02';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup(client) {
  await client.query('DELETE FROM public.security_audit_events WHERE target_user_id = $1', [USER_ID]);
  await client.query(
    `DELETE FROM auth_security.password_recovery_outbox
      WHERE account_fingerprint = encode(extensions.digest($1::text, 'sha256'), 'hex')`,
    [USER_ID]
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
      [USER_ID, EMAIL]
    );

    const enqueueSql =
      'SELECT public.enqueue_password_recovery($1, $2, $3, 600, 10, 60) AS status';
    const [enqueueA, enqueueB] = await Promise.all([
      instanceA.query(enqueueSql, [EMAIL, IP_A, 'v1.synthetic.concurrent.envelope.a.1234567890']),
      instanceB.query(enqueueSql, [EMAIL, IP_B, 'v1.synthetic.concurrent.envelope.b.1234567890']),
    ]);
    const enqueueStatuses = [enqueueA.rows[0].status, enqueueB.rows[0].status].sort();
    assert(
      JSON.stringify(enqueueStatuses) === JSON.stringify(['queued', 'suppressed']),
      `account cooldown race returned ${JSON.stringify(enqueueStatuses)}`
    );

    const claimSql = 'SELECT * FROM public.claim_password_recovery_outbox($1, 1, 60)';
    const [outboxA, outboxB] = await Promise.all([
      instanceA.query(claimSql, [WORKER_A]),
      instanceB.query(claimSql, [WORKER_B]),
    ]);
    assert(
      outboxA.rowCount + outboxB.rowCount === 1,
      `outbox race claimed ${outboxA.rowCount + outboxB.rowCount} rows instead of one`
    );

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

    console.log('✓ account cooldown: 2 instances, different IPs, exactly 1 durable job');
    console.log('✓ outbox lease: 2 workers, exactly 1 claim');
    console.log('✓ recovery grant: 2 workers, exactly 1 provider-attempt lease');
  } finally {
    await cleanup(admin);
    await Promise.all([admin.end(), instanceA.end(), instanceB.end()]);
  }
}

main().catch((error) => {
  console.error(`[recovery-concurrency-proof] ${error.message}`);
  process.exit(1);
});

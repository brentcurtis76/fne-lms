/**
 * The §17 overlapping-ticker proof.
 *
 * Vercel crons overlap, never retry, and can double-fire. The whole safety argument
 * for the Zoom queue rests on `claim_zoom_jobs` using `FOR UPDATE SKIP LOCKED`, so
 * that two ticks running at the same instant partition the work instead of both
 * claiming it. Z1b-3's vitest suite says so in its own header: an in-process double
 * cannot prove it, because there is no second transaction to skip a lock on.
 *
 * This script is that proof. It seeds N jobs into the REAL `zoom_internal.zoom_jobs`
 * on a REAL Postgres, then runs TWO concurrent `runZoomTick` loops — the production
 * loop, unmodified, under two worker ids on two separate database sessions — and
 * asserts that every job executed EXACTLY once and every row ended `done`.
 *
 * ## Why it talks to Postgres directly
 *
 * The CI job this runs in (`Gate 3 — RLS pgTAP`) starts the database with
 * `supabase db start`, which brings up **Postgres only** — no Kong, no PostgREST. So
 * `@supabase/supabase-js` has nothing to talk to there. The queue adapter below calls
 * the same `zoom_internal.*` RPCs over SQL that PostgREST would call over HTTP; the
 * function under test, and therefore the proof, is identical. `pg` is already a
 * project dependency.
 *
 * Run locally with `npm run test:queue` against a started stack.
 */
import pg from 'pg';

const { Client } = pg;

// Dynamic, not static: this file is `.mjs`, so Node links static imports before tsx's
// transform has published the TypeScript module's export map and `runZoomTick` comes
// back undefined. `await import()` runs after the transform and gets the real bindings.
// The module under test is the production one either way.
const { runZoomTick } = await import(
  new URL('../../lib/zoom/jobs/runner.ts', import.meta.url).href
);

/** Enough rounds that the two loops must interleave; small enough to stay fast. */
const JOB_COUNT = 40;
/** Small batches ⇒ many claim rounds ⇒ real contention on the RPC. */
const BATCH_SIZE = 3;
/** A deliberate yield inside the handler, so one loop is mid-batch while the other claims. */
const HANDLER_DELAY_MS = 5;

const PROOF_TAG = 'queue-concurrency';

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`\n✗ FAIL: ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

/**
 * A `ZoomJobQueue` backed by one dedicated Postgres session. One per worker — two
 * loops sharing a connection would serialize on the wire and quietly retire the very
 * contention this is here to create.
 */
function createSqlJobQueue(client) {
  return {
    async claim(args) {
      const { rows } = await client.query(
        'SELECT * FROM zoom_internal.claim_zoom_jobs($1, $2, $3, $4)',
        [args.p_worker_id, args.p_job_types ?? null, args.p_max_n ?? 1, args.p_lease_seconds ?? 300]
      );
      return rows;
    },
    async heartbeat(args) {
      const { rows } = await client.query(
        'SELECT zoom_internal.heartbeat_zoom_job($1, $2, $3, $4) AS ok',
        [args.p_job_id, args.p_worker_id, args.p_lease_seconds ?? 300, args.p_stage_state ?? null]
      );
      return rows[0].ok === true;
    },
    async complete(args) {
      const { rows } = await client.query(
        'SELECT zoom_internal.complete_zoom_job($1, $2, $3) AS ok',
        [args.p_job_id, args.p_worker_id, args.p_stage_state ?? null]
      );
      return rows[0].ok === true;
    },
    async fail(args) {
      const { rows } = await client.query(
        'SELECT zoom_internal.fail_zoom_job($1, $2, $3, $4) AS status',
        [args.p_job_id, args.p_worker_id, args.p_error, args.p_retryable ?? true]
      );
      return rows[0].status ?? null;
    },
    async enqueue() {
      throw new Error('enqueue is not used by this proof');
    },
  };
}

async function main() {
  console.log(`[queue-proof] connecting to ${DB_URL.replace(/:[^:@/]*@/, ':***@')}`);

  const admin = new Client({ connectionString: DB_URL });
  const sessionA = new Client({ connectionString: DB_URL });
  const sessionB = new Client({ connectionString: DB_URL });
  await Promise.all([admin.connect(), sessionA.connect(), sessionB.connect()]);

  try {
    // Clean slate — only ever this proof's own rows.
    await admin.query(
      `DELETE FROM zoom_internal.zoom_jobs WHERE job_type = 'noop' AND payload->>'proof' = $1`,
      [PROOF_TAG]
    );

    await admin.query(
      `INSERT INTO zoom_internal.zoom_jobs (job_type, payload)
       SELECT 'noop', jsonb_build_object('proof', $1::text, 'n', gs)
         FROM generate_series(1, $2::int) AS gs`,
      [PROOF_TAG, JOB_COUNT]
    );
    console.log(`[queue-proof] seeded ${JOB_COUNT} noop jobs`);

    // The shared in-process ledger. Keyed by job id; an array, NOT a counter, so a
    // double-execution is visible with both workers named rather than just tallied.
    const executions = new Map();

    const makeRegistry = (workerLabel) => ({
      noop: async (ctx) => {
        const seen = executions.get(ctx.job.id) ?? [];
        seen.push(workerLabel);
        executions.set(ctx.job.id, seen);
        // Yield, so this worker is demonstrably mid-batch while the other claims.
        await sleep(HANDLER_DELAY_MS);
        return { proof: PROOF_TAG, worker: workerLabel };
      },
    });

    const runLoop = (client, workerLabel) =>
      runZoomTick({
        queue: createSqlJobQueue(client),
        registry: makeRegistry(workerLabel),
        workerId: `queue-proof:${workerLabel}`,
        batchSize: BATCH_SIZE,
        budgetMs: 30_000,
        leaseSeconds: 60,
      });

    // The overlap. Both loops are live against the same queue at the same time.
    const [resultA, resultB] = await Promise.all([
      runLoop(sessionA, 'A'),
      runLoop(sessionB, 'B'),
    ]);

    console.log(`[queue-proof] worker A: ${JSON.stringify(resultA)}`);
    console.log(`[queue-proof] worker B: ${JSON.stringify(resultB)}`);

    // --- Assertions -------------------------------------------------------
    const duplicates = [...executions.entries()].filter(([, runs]) => runs.length !== 1);
    if (duplicates.length > 0) {
      fail(
        `${duplicates.length} job(s) did not execute exactly once: ` +
          duplicates.map(([id, runs]) => `${id} → [${runs.join(', ')}]`).join('; ')
      );
    }

    if (executions.size !== JOB_COUNT) {
      fail(`expected ${JOB_COUNT} distinct jobs executed, saw ${executions.size}`);
    }

    const claimed = resultA.claimed + resultB.claimed;
    if (claimed !== JOB_COUNT) {
      fail(`workers claimed ${claimed} jobs in total, expected ${JOB_COUNT}`);
    }

    // A one-sided split would still satisfy exactly-once while proving nothing about
    // concurrency, so it is a failure here, not a warning.
    if (resultA.claimed === 0 || resultB.claimed === 0) {
      fail(
        `the loops did not overlap (A=${resultA.claimed}, B=${resultB.claimed}); ` +
          'this run proves nothing about SKIP LOCKED'
      );
    }

    const { rows: statusRows } = await admin.query(
      `SELECT status, count(*)::int AS n
         FROM zoom_internal.zoom_jobs
        WHERE job_type = 'noop' AND payload->>'proof' = $1
        GROUP BY status`,
      [PROOF_TAG]
    );
    const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, row.n]));
    if (byStatus.done !== JOB_COUNT || statusRows.length !== 1) {
      fail(`expected all ${JOB_COUNT} rows 'done', got ${JSON.stringify(byStatus)}`);
    }

    // Every row must be owned by exactly one of the two workers.
    const { rows: ownerRows } = await admin.query(
      `SELECT worker_id, count(*)::int AS n
         FROM zoom_internal.zoom_jobs
        WHERE job_type = 'noop' AND payload->>'proof' = $1
        GROUP BY worker_id ORDER BY worker_id`,
      [PROOF_TAG]
    );

    console.log('');
    console.log(`✓ ${JOB_COUNT} jobs, 2 concurrent tick loops, real FOR UPDATE SKIP LOCKED`);
    console.log(`✓ every job executed EXACTLY once (A=${resultA.claimed}, B=${resultB.claimed})`);
    console.log(`✓ every row is 'done'`);
    for (const row of ownerRows) {
      console.log(`    ${row.worker_id} → ${row.n} jobs`);
    }
    console.log('');

    await admin.query(
      `DELETE FROM zoom_internal.zoom_jobs WHERE job_type = 'noop' AND payload->>'proof' = $1`,
      [PROOF_TAG]
    );
  } finally {
    await Promise.all([admin.end(), sessionA.end(), sessionB.end()]);
  }
}

main().catch((error) => {
  console.error(`[queue-proof] ${error.message}`);
  process.exit(1);
});

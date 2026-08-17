/**
 * Z7-R9 real two-connection proof for occurrence claims and report-batch authority.
 * Local Supabase only, synthetic rows only. Run after a fresh migration replay; a
 * final reset removes its committed fixtures.
 */
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const url = new URL(DB_URL);
if (!new Set(['127.0.0.1', 'localhost', '::1', '[::1]']).has(url.hostname) || url.port !== '54322') {
  throw new Error(`attendance authority proof refuses non-local database ${url.hostname}:${url.port}`);
}

const surfaceId = crypto.randomUUID();
const meetingId = crypto.randomUUID();
const occurrenceA = `r9-race-a-${crypto.randomUUID()}`;
const occurrenceB = `r9-race-b-${crypto.randomUUID()}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function serviceQuery(client, sql, params) {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE service_role');
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function waitForBlocked(observer, names) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(
      `SELECT application_name, wait_event_type FROM pg_stat_activity
        WHERE application_name = ANY($1::text[]) AND state = 'active'`,
      [names]
    );
    if (names.every((name) => rows.some((row) =>
      row.application_name === name && row.wait_event_type === 'Lock'))) return;
    await sleep(25);
  }
  throw new Error(`concurrency barrier did not block ${names.join(', ')}`);
}

async function main() {
  const admin = new Client({ connectionString: DB_URL, application_name: 'r9-authority-admin' });
  const observer = new Client({ connectionString: DB_URL, application_name: 'r9-authority-observer' });
  await Promise.all([admin.connect(), observer.connect()]);
  try {
    const { rows: schools } = await admin.query(
      `INSERT INTO public.schools(name) VALUES ($1) RETURNING id`,
      [`R9 concurrency synthetic ${crypto.randomUUID()}`]
    );
    const schoolId = schools[0].id;
    await admin.query(
      `INSERT INTO zoom_internal.zoom_meetings
        (id, surface_type, surface_id, school_id, zoom_meeting_number,
         status, starts_at, duration_minutes)
       VALUES ($1, 'consultor_session', $2, $3, $4, 'provisioned', now(), 60)`,
      [meetingId, surfaceId, schoolId, String(Date.now()).slice(-11)]
    );

    const control = new Client({ connectionString: DB_URL, application_name: 'r9-occ-control' });
    const claimantA = new Client({ connectionString: DB_URL, application_name: 'r9-occ-a' });
    const claimantB = new Client({ connectionString: DB_URL, application_name: 'r9-occ-b' });
    await Promise.all([control.connect(), claimantA.connect(), claimantB.connect()]);
    try {
      await control.query('BEGIN');
      await control.query('SELECT id FROM zoom_internal.zoom_meetings WHERE id = $1 FOR UPDATE',
        [meetingId]);
      const claim = (client, occurrence, key) => serviceQuery(client,
        `SELECT zoom_internal.apply_participant_join(
          'consultor_session', $1, $2, $3, $4, NULL, NULL, $5, NULL,
          'unmatched', now(), ARRAY[$6], $7) AS outcome`,
        [surfaceId, schoolId, occurrence, `participant-${key}`, `Synthetic ${key}`,
          `nm:synthetic ${key}`, `r9-race-join-${key}`]
      );
      const pendingA = claim(claimantA, occurrenceA, 'a');
      const pendingB = claim(claimantB, occurrenceB, 'b');
      await waitForBlocked(observer, ['r9-occ-a', 'r9-occ-b']);
      await control.query('COMMIT');
      const results = await Promise.all([pendingA, pendingB]);
      const outcomes = results.map((result) => result.rows[0].outcome).sort();
      assert(JSON.stringify(outcomes) === JSON.stringify(['interval_opened', 'occurrence_mismatch']),
        `different occurrence claims were not one-winner: ${JSON.stringify(outcomes)}`);
    } finally {
      await control.query('ROLLBACK').catch(() => undefined);
      await Promise.all([control.end(), claimantA.end(), claimantB.end()]);
    }

    const { rows: meetingRows } = await admin.query(
      'SELECT zoom_meeting_uuid FROM zoom_internal.zoom_meetings WHERE id = $1', [meetingId]
    );
    const winner = meetingRows[0].zoom_meeting_uuid;
    const loser = winner === occurrenceA ? occurrenceB : occurrenceA;
    const { rows: intervalRows } = await admin.query(
      `SELECT source_event_key, left_at FROM public.zoom_attendance WHERE surface_id = $1`, [surfaceId]
    );
    assert(intervalRows.length === 1 && intervalRows[0].left_at === null,
      `claim race wrote ${intervalRows.length} intervals or closed the winner`);

    const loserLeave = await serviceQuery(admin,
      `SELECT zoom_internal.apply_participant_leave(
        'consultor_session', $1, $2, $3, 'r9-race-loser-leave', now(),
        'participant-a', NULL, 'Loser', NULL, ARRAY['nm:loser']) AS outcome`,
      [surfaceId, schoolId, loser]
    );
    assert(loserLeave.rows[0].outcome === 'occurrence_mismatch',
      `loser leave returned ${loserLeave.rows[0].outcome}`);
    const { rows: loserWrites } = await admin.query(
      `SELECT
        (SELECT count(*)::int FROM zoom_internal.zoom_attendance_observations
          WHERE source_event_key = 'r9-race-loser-leave') AS observations,
        (SELECT count(*)::int FROM public.zoom_attendance
          WHERE surface_id = $1 AND left_at IS NOT NULL) AS closed`, [surfaceId]
    );
    assert(loserWrites[0].observations === 0 && loserWrites[0].closed === 0,
      `loser leave wrote observation/close ${JSON.stringify(loserWrites[0])}`);

    await admin.query(
      `UPDATE zoom_internal.zoom_meetings SET status = 'ended' WHERE id = $1`, [meetingId]
    );
    const created = await serviceQuery(admin,
      `SELECT zoom_internal.create_attendance_report_batch(
        $1, 'consultor_session', $2, $3) AS id`, [schoolId, surfaceId, winner]
    );
    const batchId = created.rows[0].id;

    const batchControl = new Client({ connectionString: DB_URL, application_name: 'r9-batch-control' });
    const promoterA = new Client({ connectionString: DB_URL, application_name: 'r9-batch-a' });
    const promoterB = new Client({ connectionString: DB_URL, application_name: 'r9-batch-b' });
    await Promise.all([batchControl.connect(), promoterA.connect(), promoterB.connect()]);
    try {
      await batchControl.query('BEGIN');
      await batchControl.query(
        'SELECT id FROM zoom_internal.zoom_attendance_report_batches WHERE id = $1 FOR UPDATE',
        [batchId]
      );
      const promote = (client) => serviceQuery(client,
        `SELECT zoom_internal.promote_attendance_report_batch(
          $1, '[]'::jsonb, 100, 0, 0, now()) AS outcome`, [batchId]
      );
      const pendingA = promote(promoterA);
      const pendingB = promote(promoterB);
      await waitForBlocked(observer, ['r9-batch-a', 'r9-batch-b']);
      await batchControl.query('COMMIT');
      const results = await Promise.all([pendingA, pendingB]);
      const outcomes = results.map((result) => result.rows[0].outcome).sort();
      assert(JSON.stringify(outcomes) === JSON.stringify(['batch_not_pending', 'promoted']),
        `promotion race was not deterministic: ${JSON.stringify(outcomes)}`);
    } finally {
      await batchControl.query('ROLLBACK').catch(() => undefined);
      await Promise.all([batchControl.end(), promoterA.end(), promoterB.end()]);
    }

    const { rows: authority } = await admin.query(
      `SELECT b.status, b.total_records, b.row_count,
        (SELECT count(*)::int FROM public.zoom_attendance a
          WHERE a.report_batch_id = b.id) AS rows
       FROM zoom_internal.zoom_attendance_report_batches b WHERE b.id = $1`, [batchId]
    );
    assert(authority[0].status === 'complete' && authority[0].total_records === 0 &&
      authority[0].row_count === 0 && authority[0].rows === 0,
    `promotion race authority is incoherent: ${JSON.stringify(authority[0])}`);

    console.log('[attendance-authority-proof] occurrence claims: one winner, loser 0/0 writes');
    console.log('[attendance-authority-proof] promotion race: promoted + batch_not_pending, exact empty authority');
  } finally {
    await Promise.all([admin.end(), observer.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

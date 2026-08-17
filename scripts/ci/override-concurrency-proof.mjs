/**
 * Z7-R7 — real two-connection proof for override request-id idempotency.
 *
 * A unit double cannot reproduce transaction locks. This script uses two dedicated
 * Postgres sessions and a third session that temporarily holds the target session
 * row. Both callers therefore finish the request-id precheck before either can
 * mutate the ledger on the old implementation. After the barrier is released:
 *
 *  - identical payloads must yield one apply + one replay and one audit row;
 *  - different payloads must yield one apply + one P0409 conflict, never 23505;
 *  - a later sequential identical retry must still be a replay.
 *
 * The proof refuses every database except the local Supabase port. It creates only
 * synthetic rows with fresh UUIDs. Run after `supabase db reset`; a later reset
 * removes the proof rows (the audit table is intentionally append-only, so this
 * script does not weaken its trigger to clean them up).
 */
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function assertLocalDatabase(connectionString) {
  const url = new URL(connectionString);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!localHosts.has(url.hostname) || url.port !== '54322') {
    throw new Error(
      `override concurrency proof refuses non-local database ${url.hostname}:${url.port || '(default)'}`
    );
  }
}

assertLocalDatabase(DB_URL);

const ids = {
  actor: crypto.randomUUID(),
  community: crypto.randomUUID(),
  client: crypto.randomUUID(),
  contract: crypto.randomUUID(),
  hourType: crypto.randomUUID(),
  allocation: crypto.randomUUID(),
  sessionSame: crypto.randomUUID(),
  sessionConflict: crypto.randomUUID(),
  ledgerSame: crypto.randomUUID(),
  ledgerConflict: crypto.randomUUID(),
  tamperSessions: Array.from({ length: 6 }, () => crypto.randomUUID()),
  tamperLedgers: Array.from({ length: 6 }, () => crypto.randomUUID()),
};
const ident = `z7_override_concurrency_${process.pid}_${Date.now()}`;
const requestSame = `z7-concurrent-same-${crypto.randomUUID()}`;
const requestConflict = `z7-concurrent-conflict-${crypto.randomUUID()}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function seed(admin) {
  const actorId = ids.actor;
  await admin.query(
    `INSERT INTO auth.users
       (id, instance_id, aud, role, email, raw_user_meta_data,
        raw_app_meta_data, created_at, updated_at)
     VALUES ($1, '00000000-0000-0000-0000-000000000000',
             'authenticated', 'authenticated', $2,
             jsonb_build_object('test_identifier', $3::text),
             '{"provider":"email","providers":["email"]}'::jsonb, now(), now())`,
    [actorId, `${ident}@test.local`, ident]
  );
  const { rows: schoolRows } = await admin.query(
    `INSERT INTO public.schools (name)
     VALUES ($1)
     RETURNING id`,
    [`Z7 override concurrency ${ident}`]
  );
  const schoolId = schoolRows[0].id;

  await admin.query(
    `INSERT INTO public.profiles (id, email, name, approval_status)
     VALUES ($1, $2, $3, 'approved')`,
    [actorId, `${ident}@test.local`, 'Admin sintético de concurrencia']
  );
  await admin.query(
    `INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
     VALUES ($1, 'admin', NULL, true)`,
    [actorId]
  );
  await admin.query(
    `INSERT INTO public.growth_communities (id, school_id, name)
     VALUES ($1, $2, $3)`,
    [ids.community, schoolId, `Comunidad sintética ${ident}`]
  );
  await admin.query(
    `INSERT INTO public.clientes
       (id, nombre_legal, nombre_fantasia, rut, direccion,
        nombre_representante, rut_representante, fecha_escritura, nombre_notario, school_id)
     VALUES ($1, $2, $3, $4, 'Dirección sintética 123',
             'Representante sintético', $5, DATE '2026-01-01', 'Notaría sintética', $6)`,
    [
      ids.client,
      `Cliente sintético ${ident}`,
      `Cliente ${ident}`,
      `99.${String(Date.now()).slice(-6)}-1`,
      `88.${String(Date.now()).slice(-6)}-2`,
      schoolId,
    ]
  );
  await admin.query(
    `INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id)
     VALUES ($1, $2, DATE '2026-01-01', $3)`,
    [ids.contract, `Z7-CONC-${crypto.randomUUID().slice(0, 8)}`, ids.client]
  );
  await admin.query(
    `INSERT INTO public.hour_types (id, key, display_name, modality)
     VALUES ($1, $2, 'Horas sintéticas de concurrencia', 'online')`,
    [ids.hourType, `z7_conc_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`]
  );
  await admin.query(
    `INSERT INTO public.contract_hour_allocations
       (id, contrato_id, hour_type_id, allocated_hours, created_by)
     VALUES ($1, $2, $3, 10, $4)`,
    [ids.allocation, ids.contract, ids.hourType, actorId]
  );

  for (const [sessionId, ledgerId, title] of [
    [ids.sessionSame, ids.ledgerSame, 'Idempotencia concurrente idéntica'],
    [ids.sessionConflict, ids.ledgerConflict, 'Idempotencia concurrente conflictiva'],
    ...ids.tamperSessions.map((sessionId, index) => [
      sessionId,
      ids.tamperLedgers[index],
      `Idempotencia canónica campo ${index + 1}`,
    ]),
  ]) {
    await admin.query(
      `INSERT INTO public.consultor_sessions
         (id, school_id, growth_community_id, title, session_date,
          start_time, end_time, modality, status, created_by, contrato_id, hour_type_key)
       SELECT $1, $2, $3, $4, DATE '2026-07-10', TIME '09:00', TIME '10:00',
              'online', 'completada', $5, $6, ht.key
         FROM public.hour_types ht WHERE ht.id = $7`,
      [sessionId, schoolId, ids.community, title, actorId, ids.contract, ids.hourType]
    );
    await admin.query(
      `INSERT INTO public.contract_hours_ledger
         (id, allocation_id, session_id, hours, status, session_date,
          recorded_by, planned_minutes_snapshot)
       VALUES ($1, $2, $3, 1.00, 'consumida', DATE '2026-07-10', $4, 60)`,
      [ledgerId, ids.allocation, sessionId, actorId]
    );
  }

  return actorId;
}

async function runOverride(client, actorId, input) {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [actorId]);
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    await client.query('SET LOCAL ROLE authenticated');
    const { rows } = await client.query(
      `SELECT public.apply_session_hour_override($1, $2, $3, $4, $5, $6, $7) AS result`,
      [
        input.sessionId,
        input.minutes,
        input.reason,
        input.category ?? 'other',
        input.requestId,
        input.payloadHash,
        input.reversesOverrideId ?? null,
      ]
    );
    await client.query('COMMIT');
    return rows[0].result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function waitForBothBlocked(observer, applicationNames) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(
      `SELECT application_name, wait_event_type
         FROM pg_stat_activity
        WHERE application_name = ANY($1::text[])
          AND state = 'active'`,
      [applicationNames]
    );
    if (
      applicationNames.every((name) =>
        rows.some((row) => row.application_name === name && row.wait_event_type === 'Lock')
      )
    ) {
      return;
    }
    await sleep(25);
  }
  throw new Error(`concurrency barrier did not block both callers: ${applicationNames.join(', ')}`);
}

async function runRace({ observer, actorId, sessionId, requestId, inputs, label, ordered = false }) {
  const control = new Client({ connectionString: DB_URL, application_name: `${label}-control` });
  const nameA = `${label}-a`;
  const nameB = `${label}-b`;
  const callerA = new Client({ connectionString: DB_URL, application_name: nameA });
  const callerB = new Client({ connectionString: DB_URL, application_name: nameB });
  await Promise.all([control.connect(), callerA.connect(), callerB.connect()]);

  try {
    await control.query('BEGIN');
    const lockedSessions = [...new Set(inputs.map((input) => input.sessionId ?? sessionId))];
    await control.query(
      'SELECT id FROM public.consultor_sessions WHERE id = ANY($1::uuid[]) FOR UPDATE',
      [lockedSessions]
    );

    const pendingA = runOverride(callerA, actorId, {
      sessionId: inputs[0].sessionId ?? sessionId,
      requestId,
      ...inputs[0],
    });
    if (ordered) await waitForBothBlocked(observer, [nameA]);
    const pendingB = runOverride(callerB, actorId, {
      sessionId: inputs[1].sessionId ?? sessionId,
      requestId,
      ...inputs[1],
    });

    await waitForBothBlocked(observer, [nameA, nameB]);
    await control.query('COMMIT');
    return await Promise.allSettled([pendingA, pendingB]);
  } finally {
    await control.query('ROLLBACK').catch(() => undefined);
    await Promise.all([control.end(), callerA.end(), callerB.end()]);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('[override-proof] local Postgres only; seeding synthetic fixtures');
  const admin = new Client({ connectionString: DB_URL, application_name: 'z7-override-admin' });
  const observer = new Client({ connectionString: DB_URL, application_name: 'z7-override-observer' });
  const replay = new Client({ connectionString: DB_URL, application_name: 'z7-override-replay' });
  await Promise.all([admin.connect(), observer.connect(), replay.connect()]);

  try {
    const actorId = await seed(admin);

    const same = await runRace({
      observer,
      actorId,
      sessionId: ids.sessionSame,
      requestId: requestSame,
      label: 'z7-override-same',
      inputs: [
        { minutes: 45, reason: 'Mismo payload sintético', payloadHash: 'same-hash' },
        { minutes: 45, reason: 'Mismo payload sintético', payloadHash: 'same-hash' },
      ],
    });
    assert(same.every((result) => result.status === 'fulfilled'),
      `identical race did not return two successes: ${JSON.stringify(same)}`);
    const sameResults = same.map((result) => result.value);
    assert(sameResults.filter((result) => result.applied === true).length === 1,
      `identical race expected one apply: ${JSON.stringify(sameResults)}`);
    assert(sameResults.filter((result) => result.replay === true).length === 1,
      `identical race expected one replay: ${JSON.stringify(sameResults)}`);
    const { rows: sameCount } = await admin.query(
      'SELECT count(*)::int AS n FROM public.session_hour_overrides WHERE request_id = $1',
      [requestSame]
    );
    assert(sameCount[0].n === 1, `identical race wrote ${sameCount[0].n} audit rows`);

    const conflict = await runRace({
      observer,
      actorId,
      sessionId: ids.sessionConflict,
      requestId: requestConflict,
      label: 'z7-override-conflict',
      inputs: [
        { minutes: 45, reason: 'Payload sintético A', payloadHash: 'conflict-hash-a' },
        { minutes: 30, reason: 'Payload sintético B', payloadHash: 'conflict-hash-b' },
      ],
    });
    const fulfilled = conflict.filter((result) => result.status === 'fulfilled');
    const rejected = conflict.filter((result) => result.status === 'rejected');
    assert(fulfilled.length === 1 && rejected.length === 1,
      `different race expected one success and one conflict: ${JSON.stringify(conflict)}`);
    assert(rejected[0].reason?.code === 'P0409',
      `different race returned ${rejected[0].reason?.code ?? 'no SQLSTATE'}, expected P0409`);
    assert(rejected[0].reason?.code !== '23505', 'different race leaked a raw unique violation');
    const { rows: conflictCount } = await admin.query(
      'SELECT count(*)::int AS n FROM public.session_hour_overrides WHERE request_id = $1',
      [requestConflict]
    );
    assert(conflictCount[0].n === 1, `different race wrote ${conflictCount[0].n} audit rows`);

    const winner = fulfilled[0].value;
    const winnerInput = winner.new_minutes === 45
      ? { minutes: 45, reason: 'Payload sintético A', payloadHash: 'conflict-hash-a' }
      : { minutes: 30, reason: 'Payload sintético B', payloadHash: 'conflict-hash-b' };
    const sequential = await runOverride(replay, actorId, {
      sessionId: ids.sessionConflict,
      requestId: requestConflict,
      ...winnerInput,
    });
    assert(sequential.replay === true && sequential.applied === false,
      `sequential replay was not idempotent: ${JSON.stringify(sequential)}`);

    const canonicalScenarios = [
      {
        field: 'session_id',
        baseSession: ids.tamperSessions[0],
        original: { minutes: 45, reason: 'Payload canónico', payloadHash: 'forged-shared' },
        changed: { sessionId: ids.tamperSessions[1], minutes: 45, reason: 'Payload canónico', payloadHash: 'forged-shared' },
      },
      {
        field: 'new_minutes',
        baseSession: ids.tamperSessions[2],
        original: { minutes: 45, reason: 'Payload canónico', payloadHash: 'forged-shared' },
        changed: { minutes: 30, reason: 'Payload canónico', payloadHash: 'forged-shared' },
      },
      {
        field: 'reason',
        baseSession: ids.tamperSessions[3],
        original: { minutes: 45, reason: 'Payload canónico', payloadHash: 'forged-shared' },
        changed: { minutes: 45, reason: 'Motivo cambiado', payloadHash: 'forged-shared' },
      },
      {
        field: 'reason_category',
        baseSession: ids.tamperSessions[4],
        original: { minutes: 45, reason: 'Payload canónico', category: 'other', payloadHash: 'forged-shared' },
        changed: { minutes: 45, reason: 'Payload canónico', category: 'school_request', payloadHash: 'forged-shared' },
      },
      {
        field: 'reverses_override_id',
        baseSession: ids.tamperSessions[5],
        original: { minutes: 45, reason: 'Payload canónico', payloadHash: 'forged-shared' },
        changed: { minutes: 45, reason: 'Payload canónico', payloadHash: 'forged-shared', reversesOverrideId: crypto.randomUUID() },
      },
    ];

    for (const scenario of canonicalScenarios) {
      const requestId = `z7-canonical-${scenario.field}-${crypto.randomUUID()}`;
      const raced = await runRace({
        observer,
        actorId,
        sessionId: scenario.baseSession,
        requestId,
        label: `z7-canonical-${scenario.field.replaceAll('_', '-')}`,
        inputs: [scenario.original, scenario.changed],
        ordered: true,
      });
      assert(raced[0].status === 'fulfilled' && raced[0].value.applied === true,
        `${scenario.field} race did not apply the original payload: ${JSON.stringify(raced)}`);
      assert(raced[1].status === 'rejected' && raced[1].reason?.code === 'P0409',
        `${scenario.field} concurrent forged-hash change was not P0409: ${JSON.stringify(raced)}`);
      assert(raced[1].reason?.code !== '23505', `${scenario.field} leaked 23505`);

      const sequentialChanged = await runOverride(replay, actorId, {
        sessionId: scenario.changed.sessionId ?? scenario.baseSession,
        requestId,
        ...scenario.changed,
      }).then(
        () => ({ code: 'unexpected-success' }),
        (error) => ({ code: error.code })
      );
      assert(sequentialChanged.code === 'P0409',
        `${scenario.field} sequential forged-hash change returned ${sequentialChanged.code}`);
    }

    console.log('✓ identical request race: one apply + one replay, one audit row');
    console.log('✓ different payload race: one apply + one P0409 conflict, never 23505');
    console.log('✓ sequential replay remains a no-op');
    console.log('✓ every canonical payload field rejects forged-hash changes sequentially and concurrently');
  } finally {
    await Promise.all([admin.end(), observer.end(), replay.end()]);
  }
}

main().catch((error) => {
  console.error(`[override-proof] FAIL: ${error.message}`);
  process.exit(1);
});

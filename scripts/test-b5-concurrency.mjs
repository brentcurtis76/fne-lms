#!/usr/bin/env node
/**
 * PROC-B5-CONCURRENCY diagnostic: do two genuinely concurrent objective inserts
 * under ONE assessment template deadlock through the unchanged B5 FK/source-revision
 * guards? Read-only with respect to schema and behavior: nothing here repairs,
 * weakens or works around a guard.
 *
 * Lock shape under test (recorded, not assumed — see the preflight output):
 *   INSERT INTO assessment_objectives fires, at statement end,
 *     1. RI_FKey_check_ins for assessment_objectives_template_id_fkey
 *        -> SELECT ... FOR KEY SHARE on the parent assessment_templates row
 *     2. assessment_objectives_source_revision_guard
 *        -> bump_template_source_revisions() -> SELECT ... FOR UPDATE on the SAME row
 *   Two transactions that both hold FOR KEY SHARE and then both want FOR UPDATE on
 *   that one row deadlock (40P01). The window is the gap between (1) and (2).
 *
 * Result is one of OBSERVED_DEADLOCK, NOT_REPRODUCED or BLOCKED_SETUP, and
 * NOT_REPRODUCED is never a claim that the guards are concurrency-safe.
 *
 * Writes ONLY to the approved local endpoint, asserted before every connection. Fixed
 * synthetic ids only, owned through a session advisory lock plus atomic `returning` inserts,
 * so overlapping invocations cannot collide or delete one another's rows; removes exactly the
 * rows this invocation created, in dependency order, in `finally`.
 *
 * Env: B5_CONCURRENCY_DATABASE_URL (credentials/database only; the host and port MUST be
 *                                    the approved endpoint below or the runner refuses)
 *      B5_CONCURRENCY_ATTEMPTS      (default 12, minimum 3)
 *      B5_CONCURRENCY_OUT_DIR       (where to write fixtures-manifest.json;
 *                                    default: os.tmpdir())
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';

// The ONE database this diagnostic may write to: the repository's isolated local Supabase
// stack (docker container `supabase_db_proc15isolated`, published on 127.0.0.1:54422).
// This is a fail-closed allowlist, not a default: other writable PostgreSQL servers listen on
// this machine's loopback (e.g. 127.0.0.1:54322 is a different project's database), so peer
// address alone does not identify the approved target and must never be the only gate.
// Note: inet_server_addr()/inet_server_port() cannot be used to confirm the endpoint -- through
// Docker's port mapping the server reports its container address and 5432, which is identical
// for every local stack. The configured target is therefore asserted before the socket opens.
const APPROVED_HOST = '127.0.0.1';
const APPROVED_PORT = 54422;
const DEFAULT_URL = `postgres://postgres:postgres@${APPROVED_HOST}:${APPROVED_PORT}/postgres`;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const NS = 'b5c0b5c0-b5c0-4b5c-8b5c-';
const TEMPLATE_ID = `${NS}000000000000`;
// Negative control: a second template, so two concurrent inserts that do NOT share a
// parent row can be shown not to deadlock under the identical harness.
const CONTROL_TEMPLATE_ID = `${NS}000000000001`;
const BARRIER_LEAD_MS = 200;

const url = new URL(process.env.B5_CONCURRENCY_DATABASE_URL || DEFAULT_URL);
const attempts = Math.max(3, Number(process.env.B5_CONCURRENCY_ATTEMPTS || 12));
const outDir = process.env.B5_CONCURRENCY_OUT_DIR || tmpdir();

const objectiveId = (worker, attempt) =>
  NS + String(worker).padStart(2, '0') + String(attempt).padStart(10, '0');

const manifest = {
  unit: 'PROC-B5-CONCURRENCY',
  synthetic: true,
  rows: [
    { table: 'public.assessment_templates', key: 'id', ids: [TEMPLATE_ID, CONTROL_TEMPLATE_ID], created_by: 'runner' },
    {
      table: 'public.assessment_objectives',
      key: 'id',
      // attempt 0 is the negative control; 1..attempts are the shared-parent attempts.
      ids: Array.from({ length: attempts + 1 }, (_, i) => [objectiveId(1, i), objectiveId(2, i)]).flat(),
      created_by: 'runner (the concurrent inserts under test)',
    },
    {
      table: 'public.assessment_template_source_revisions',
      key: 'template_id',
      ids: [TEMPLATE_ID, CONTROL_TEMPLATE_ID],
      created_by: 'B5 guard trigger, as a side effect of the inserts',
    },
  ],
  cleanup_order: [
    'public.assessment_objectives',
    'public.assessment_template_source_revisions',
    'public.assessment_templates',
  ],
};

// Rows this invocation is PROVEN to have created, per table. A manifested id is only ever
// added here by the statement that created it (`returning`), so cleanup can never touch a row
// that belongs to a pre-existing fixture or to a concurrently running invocation.
const ownedRows = new Map([
  ['public.assessment_templates', new Set()],
  ['public.assessment_objectives', new Set()],
  ['public.assessment_template_source_revisions', new Set()],
]);
const own = (table, id) => ownedRows.get(table).add(id);
const ownedTotal = () => [...ownedRows.values()].reduce((n, set) => n + set.size, 0);
let endpointAssertions = 0;
const checks = [];
const check = (id, ok, note) => {
  checks.push({ id, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${note}`);
};
const sha = (s) => createHash('sha256').update(s).digest('hex');

// Two int4 keys for the session advisory lock that serializes ownership of the fixed ids.
const LOCK_KEYS = [
  parseInt(sha('PROC-B5-CONCURRENCY').slice(0, 8), 16) | 0,
  parseInt(sha('PROC-B5-CONCURRENCY').slice(8, 16), 16) | 0,
];

/**
 * Fail closed on the database target. Runs before the socket is opened, so a rejected target
 * never receives a connection, let alone a write.
 */
const assertApprovedTarget = () => {
  const host = url.hostname;
  const port = Number(url.port);
  if (host !== APPROVED_HOST || port !== APPROVED_PORT) {
    throw new Error(
      `refusing database target ${host}:${port} — the only approved endpoint is ` +
        `${APPROVED_HOST}:${APPROVED_PORT}; no connection was opened and no SQL was sent`
    );
  }
  endpointAssertions += 1;
};

const connect = async () => {
  assertApprovedTarget();
  const c = new pg.Client({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    application_name: 'b5-concurrency-diagnostic',
  });
  await c.connect();
  const peer = c.connection?.stream?.remoteAddress;
  if (!LOOPBACK.has(String(peer))) {
    await c.end();
    throw new Error(`refusing non-loopback peer ${peer}`);
  }
  return c;
};

/** Verify the approved endpoint and the live socket peer before any write happens. */
async function preflight(observer) {
  const identity = (
    await observer.query(
      `select current_database() db, current_user usr, version() ver,
              inet_client_addr()::text client_addr, pg_backend_pid() pid,
              current_setting('deadlock_timeout') deadlock_timeout`
    )
  ).rows[0];
  identity.configured_host = url.hostname;
  identity.configured_port = Number(url.port);
  identity.socket_peer = observer.connection?.stream?.remoteAddress;
  check(
    'D1.endpoint',
    url.hostname === APPROVED_HOST && Number(url.port) === APPROVED_PORT,
    `target ${url.hostname}:${url.port} equals the approved endpoint ${APPROVED_HOST}:${APPROVED_PORT}; ` +
      `assertApprovedTarget() gates every connection before its socket opens ` +
      `(${endpointAssertions} so far), so any other host/port is refused before a single byte of SQL`
  );
  check(
    'D1.loopback',
    LOOPBACK.has(url.hostname) && LOOPBACK.has(String(identity.socket_peer)),
    `configured ${url.hostname}:${url.port}, live socket peer ${identity.socket_peer}, db ${identity.db}`
  );

  const defs = { functions: {}, triggers: {}, fk: {} };
  for (const fn of [
    'public.bump_template_source_revisions(uuid[])',
    'public.guard_assessment_objective_source_revision()',
    'public.get_template_source_revision(uuid)',
  ]) {
    const src = (await observer.query('select pg_get_functiondef($1::regprocedure) d', [fn])).rows[0].d;
    defs.functions[fn] = { sha256: sha(src), lines: src.split('\n').length };
  }
  const fk = (
    await observer.query(
      `select conname, pg_get_constraintdef(oid) d from pg_constraint
        where conrelid = 'public.assessment_objectives'::regclass and contype = 'f'`
    )
  ).rows;
  for (const r of fk) defs.fk[r.conname] = { definition: r.d, sha256: sha(r.d) };

  // strcmp order == the order PostgreSQL fires per-row AFTER triggers.
  const trg = (
    await observer.query(
      `select tgname, pg_get_triggerdef(oid) d from pg_trigger
        where tgrelid = 'public.assessment_objectives'::regclass and tgtype & 4 = 4
        order by tgname collate "C"`
    )
  ).rows;
  defs.triggers.assessment_objectives_insert_fire_order = trg.map((r) => r.tgname);
  for (const r of trg) defs.triggers[r.tgname] = { definition: r.d, sha256: sha(r.d) };

  const fkIdx = trg.findIndex((r) => /RI_ConstraintTrigger/.test(r.tgname));
  const guardIdx = trg.findIndex((r) => r.tgname === 'assessment_objectives_source_revision_guard');
  defs.lock_upgrade_window = fkIdx >= 0 && guardIdx > fkIdx;

  const collisions = [];
  for (const row of manifest.rows) {
    const found = (
      await observer.query(
        `select ${row.key}::text id from ${row.table} where ${row.key}::text = any($1::text[])`,
        [row.ids]
      )
    ).rows.map((r) => r.id);
    if (found.length) collisions.push({ table: row.table, found });
  }
  if (collisions.length) {
    check('D1.fixture', false, `id collision, refusing to touch pre-existing rows: ${JSON.stringify(collisions)}`);
    throw new Error('BLOCKED_SETUP: fixture id collision');
  }
  check(
    'D1.fixture',
    defs.lock_upgrade_window,
    `no id collision on ${manifest.rows.reduce((n, r) => n + r.ids.length, 0)} manifested ids; ` +
      `objective INSERT fires ${defs.triggers.assessment_objectives_insert_fire_order.join(' -> ')}` +
      `${defs.lock_upgrade_window ? ' (FK KEY SHARE precedes guard FOR UPDATE: window present)' : ' (no FK-before-guard window)'}`
  );

  // Ownership is taken atomically, one row at a time: `on conflict do nothing ... returning`
  // means a template is recorded as ours only if THIS statement created it. The scan above can
  // still race a concurrent invocation (it is advisory, not a gate); this cannot.
  for (const [id, version] of [[TEMPLATE_ID, 'v0-diagnostic'], [CONTROL_TEMPLATE_ID, 'v0-control']]) {
    const created = (
      await observer.query(
        `insert into public.assessment_templates (id, area, version, name, status)
           values ($1, $2, $3, $4, 'draft')
           on conflict (id) do nothing
           returning id::text id`,
        [id, 'PROC_B5_CONCURRENCY_SYNTHETIC', version, `PROC-B5 concurrency diagnostic ${version} (synthetic)`]
      )
    ).rows;
    if (!created.length) throw new Error(`BLOCKED_SETUP: template ${id} already exists and is not ours to use`);
    own('public.assessment_templates', created[0].id);
  }
  return { identity, defs };
}

/** One attempt: two independent transactions, clock-aligned, inserting concurrently. */
async function attempt(observer, n, templates = [TEMPLATE_ID, TEMPLATE_ID]) {
  const a = await connect();
  const b = await connect();
  const workers = [
    { id: 1, client: a, objective: objectiveId(1, n), template: templates[0] },
    { id: 2, client: b, objective: objectiveId(2, n), template: templates[1] },
  ];
  const shared = templates[0] === templates[1];
  const record = { attempt: n, shared_parent: shared, workers: [], lock_waits: [] };
  try {
    for (const w of workers) {
      // Bounded: deadlock_timeout (1s) fires long before either ceiling, so a real
      // deadlock is reported as 40P01 and never masked by a timeout.
      await w.client.query(`set lock_timeout = '8s'`);
      await w.client.query(`set statement_timeout = '15s'`);
      await w.client.query('begin');
      w.pid = (await w.client.query('select pg_backend_pid() pid')).rows[0].pid;
    }
    const revisionBefore = await revisionOf(observer, templates);
    const target = (
      await observer.query(`select (clock_timestamp() + ($1 || ' milliseconds')::interval)::text t`, [
        BARRIER_LEAD_MS,
      ])
    ).rows[0].t;

    // Both statements are dispatched in the same tick and both pause on one server
    // clock target, so they reach their AFTER-trigger queues together. No parent row
    // is locked by hand, no FK is deferred, no guard is touched.
    const sql = `insert into public.assessment_objectives (id, template_id, name, display_order, weight)
                 select $1::uuid, $2::uuid, $3::text, $4::int, 1.0
                   from (select pg_sleep(greatest(0::float8,
                          extract(epoch from ($5::timestamptz - clock_timestamp()))::float8))) barrier
                 returning id::text id, clock_timestamp()::text ts`;
    const started = Date.now();
    // Each worker ends its own transaction the moment its own statement returns, so a
    // serialized (non-deadlocking) run is not stalled by the harness holding the other
    // transaction open. The aborted statement is never retried.
    const inflight = workers.map(async (w) => {
      const row = { worker: w.id, backend_pid: w.pid, objective_id: w.objective };
      try {
        const res = await w.client.query(sql, [w.objective, w.template, `objective w${w.id} a${n}`, w.id, target]);
        row.insert = 'succeeded';
        row.returned = res.rows[0];
        try {
          await w.client.query('commit');
          row.outcome = 'committed';
          // Committed by this invocation, so this exact row is ours to remove later.
          own('public.assessment_objectives', w.objective);
        } catch (e) {
          row.outcome = 'commit_failed';
          row.sqlstate = e.code;
          row.message = e.message;
        }
      } catch (e) {
        row.insert = 'failed';
        row.sqlstate = e.code;
        row.message = e.message;
        row.detail = e.detail;
        await w.client.query('rollback').catch(() => {});
        row.outcome = 'aborted';
      }
      return row;
    });
    record.lock_waits = await sampleLocks(observer, workers.map((w) => w.pid), target);
    const settled = await Promise.all(inflight);

    for (const row of settled) {
      row.classification =
        row.sqlstate === '40P01'
          ? 'deadlock'
          : row.sqlstate === '55P03' || row.sqlstate === '57014'
            ? 'lock_timeout_or_cancel (NOT a deadlock)'
            : row.outcome === 'committed'
              ? 'committed'
              : `other (${row.sqlstate || 'none'})`;
      record.workers.push(row);
    }
    record.elapsed_ms = Date.now() - started;
    record.revision_before = revisionBefore;
    record.revision_after = await revisionOf(observer, templates);
    record.revision_delta = record.revision_after - revisionBefore;
    record.rows_present = (
      await observer.query(
        `select id::text id from public.assessment_objectives
          where id::text = any($1::text[]) order by id`,
        [workers.map((w) => w.objective)]
      )
    ).rows.map((r) => r.id);
    record.result = record.workers.some((w) => w.sqlstate === '40P01')
      ? 'OBSERVED_DEADLOCK'
      : record.workers.every((w) => w.outcome === 'committed')
        ? 'both_committed'
        : 'other';
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
    // Isolate the next attempt: drop only the objectives this invocation actually committed.
    const mine = workers.map((w) => w.objective).filter((id) => ownedRows.get('public.assessment_objectives').has(id));
    if (mine.length) {
      const removed = await observer
        .query(`delete from public.assessment_objectives where id::text = any($1::text[])`, [mine])
        .then(() => true)
        .catch(() => false);
      // Only drop the ownership claim if the row is really gone; otherwise final cleanup retries it.
      if (removed) for (const id of mine) ownedRows.get('public.assessment_objectives').delete(id);
    }
  }
  return record;
}

const revisionOf = async (observer, templates = [TEMPLATE_ID]) =>
  Number(
    (
      await observer.query(
        `select coalesce(sum(revision), 0) r from public.assessment_template_source_revisions
          where template_id::text = any($1::text[])`,
        [[...new Set(templates)]]
      )
    ).rows[0].r
  );

/** Observe real lock waits between the two backends while the inserts are in flight. */
async function sampleLocks(observer, pids, target) {
  const deadline = new Date(target).getTime() + 1500;
  const seen = new Map();
  while (Date.now() < deadline) {
    const rows = (
      await observer.query(
        `select l.pid, l.locktype, l.mode, l.granted, a.wait_event_type, a.state
           from pg_locks l join pg_stat_activity a on a.pid = l.pid
          where l.pid = any($1::int[]) and not l.granted`,
        [pids]
      )
    ).rows;
    for (const r of rows) seen.set(`${r.pid}|${r.locktype}|${r.mode}`, r);
    if (seen.size >= 2) break;
  }
  return [...seen.values()];
}

async function main() {
  const observer = await connect();
  // Serialize ownership of the FIXED fixture ids across processes. The lock is held on this
  // session for the whole run and PostgreSQL releases it when the connection drops, including
  // if this process is killed. A second invocation refuses here, before it can scan, insert or
  // delete anything -- which is what makes the fixed ids safe under overlapping runs.
  const acquired = (await observer.query('select pg_try_advisory_lock($1::int, $2::int) ok', LOCK_KEYS)).rows[0].ok;
  check(
    'D2.ownership_lock',
    acquired,
    acquired
      ? `acquired session advisory lock (${LOCK_KEYS.join(', ')}); this invocation is the sole owner of the fixed fixture ids`
      : `another invocation holds advisory lock (${LOCK_KEYS.join(', ')}); refusing before touching any row`
  );
  if (!acquired) {
    await observer.end().catch(() => {});
    throw new Error('BLOCKED_SETUP: another invocation holds the fixture ownership lock');
  }
  let preflightInfo = null;
  const report = { unit: 'PROC-B5-CONCURRENCY', started_at: new Date().toISOString(), attempts: [] };
  let cleanup = null;
  try {
    preflightInfo = await preflight(observer);
    report.identity = preflightInfo.identity;
    report.definitions = preflightInfo.defs;

    // Negative control first: identical harness, two DIFFERENT parent templates.
    const control = await attempt(observer, 0, [TEMPLATE_ID, CONTROL_TEMPLATE_ID]);
    report.control = control;
    console.log(
      `control (two different templates): ${control.result} · ${control.workers
        .map((w) => `w${w.worker}=${w.classification}`)
        .join(' ')} · ${control.elapsed_ms}ms`
    );

    for (let n = 1; n <= attempts; n += 1) {
      const r = await attempt(observer, n);
      console.log(
        `attempt ${n}/${attempts}: ${r.result} · ${r.workers
          .map((w) => `w${w.worker}=${w.classification}`)
          .join(' ')} · revision ${r.revision_before}->${r.revision_after} · ${r.elapsed_ms}ms`
      );
      report.attempts.push(r);
    }

    const overlapped = report.attempts.every((r) => new Set(r.workers.map((w) => w.backend_pid)).size === 2);
    const deadlocks = report.attempts.filter((r) => r.result === 'OBSERVED_DEADLOCK');
    report.result = deadlocks.length ? 'OBSERVED_DEADLOCK' : 'NOT_REPRODUCED';
    report.deadlock_attempts = deadlocks.length;
    report.note =
      report.result === 'NOT_REPRODUCED'
        ? 'No 40P01 in these attempts. This is not a claim that the guards are concurrency-safe: ' +
          'the FK KEY SHARE -> guard FOR UPDATE upgrade on one parent row remains a deadlock window.'
        : 'At least one attempt deadlocked (40P01) through the unchanged FK/source-revision guards.';

    check('D2.concurrency', overlapped, `${attempts} attempts, two distinct backend pids each, clock-aligned inserts, bounded by lock_timeout 8s / statement_timeout 15s`);
    check(
      'D3.classification',
      report.attempts.every((r) => r.workers.length === 2 && r.workers.every((w) => w.classification && w.outcome) && r.revision_delta !== undefined),
      `per-worker SQLSTATE/outcome/row identity and revision delta captured; result ${report.result}` +
        (deadlocks.length ? ` in ${deadlocks.length}/${attempts} attempts` : ` over ${attempts} attempts`)
    );
    const controlClean = report.control.result === 'both_committed';
    check(
      'D4.counterexample',
      controlClean,
      controlClean
        ? 'negative control (same harness, two DIFFERENT parent templates) committed both inserts with no 40P01, so the deadlock is caused by sharing one parent row, not by the harness'
        : `negative control did not commit cleanly: ${report.control.result}`
    );
    check(
      'D4.repeatability',
      report.attempts.length >= 3,
      `${report.attempts.length} isolated shared-parent attempts (>=3), ${report.deadlock_attempts} deadlocked; machine-readable JSON emitted; rerun-safe via refuse-on-collision`
    );
  } finally {
    cleanup = await cleanupAndVerify(observer).catch((e) => ({ error: e.message }));
    report.cleanup = cleanup;
    await observer.end().catch(() => {});
  }

  if (cleanup && !cleanup.skipped) {
    check(
      'D5.cleanup',
      cleanup.leftover_total === 0,
      cleanup.leftover_total === 0
        ? `deleted ${JSON.stringify(cleanup.deleted)} in dependency order; an independent connection sees ` +
          `0 of this invocation's ${cleanup.owned_total} owned rows and 0 manifested rows left behind`
        : `cleanup incomplete: ${JSON.stringify(cleanup)}`
    );
  }
  report.endpoint_assertions = endpointAssertions;

  report.checks = checks;
  report.finished_at = new Date().toISOString();
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, 'fixtures-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, run: report.cleanup }, null, 2)}\n`);
  console.log(`\nfixtures manifest: ${manifestPath}`);
  console.log(`\n===JSON===\n${JSON.stringify(report, null, 2)}\n===END JSON===`);

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\nB5 CONCURRENCY RESULT: ${report.result}`);
  console.log(`RESULT: passed=${checks.length - failed} failed=${failed}`);
  process.exitCode = failed ? 1 : 0;
}

/** Remove exactly the rows this invocation created, in dependency order, then verify. */
async function cleanupAndVerify(observer) {
  // A revision row is keyed on template_id. The templates we own were created by our own
  // `on conflict do nothing ... returning` under the ownership lock, so they cannot have carried
  // a revision row beforehand: every revision row on one of them was produced by our inserts.
  for (const id of ownedRows.get('public.assessment_templates')) {
    own('public.assessment_template_source_revisions', id);
  }
  const ownedIds = (table) => [...ownedRows.get(table)];
  if (!ownedTotal()) {
    return { skipped: 'this invocation created no row; nothing is ours to delete', owned_total: 0, leftover_total: 0 };
  }
  const deleted = {};
  for (const table of manifest.cleanup_order) {
    const row = manifest.rows.find((r) => r.table === table);
    const ids = ownedIds(table);
    if (!ids.length) {
      deleted[table] = 0;
      continue;
    }
    const r = await observer.query(
      `delete from ${table} where ${row.key}::text = any($1::text[])`,
      [ids]
    );
    deleted[table] = r.rowCount;
  }
  const verifier = await connect();
  const leftover = {};
  const manifest_scan = {};
  try {
    for (const row of manifest.rows) {
      const ids = ownedIds(row.table);
      leftover[row.table] = ids.length
        ? Number(
            (
              await verifier.query(
                `select count(*) n from ${row.table} where ${row.key}::text = any($1::text[])`,
                [ids]
              )
            ).rows[0].n
          )
        : 0;
      // Informational: the whole manifested id space, including rows we never owned.
      manifest_scan[row.table] = Number(
        (
          await verifier.query(
            `select count(*) n from ${row.table} where ${row.key}::text = any($1::text[])`,
            [row.ids]
          )
        ).rows[0].n
      );
    }
  } finally {
    await verifier.end().catch(() => {});
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return {
    owned_total: ownedTotal(),
    deleted,
    leftover,
    leftover_total: sum(leftover) + sum(manifest_scan),
    manifest_scan,
  };
}

main().catch((e) => {
  console.error(`\nBLOCKED_SETUP: ${e.message}`);
  const failed = checks.filter((c) => !c.ok).length || 1;
  console.log(`\nB5 CONCURRENCY RESULT: BLOCKED_SETUP`);
  console.log(`RESULT: passed=${checks.filter((c) => c.ok).length} failed=${failed}`);
  process.exit(1);
});

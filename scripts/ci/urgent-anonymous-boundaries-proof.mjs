#!/usr/bin/env node
// FNE-ANON-01: real Storage/PostgREST HTTP proof for the anonymous boundaries
// migration (20261006180000_urgent_anonymous_boundaries.sql).
//
//   node scripts/ci/urgent-anonymous-boundaries-proof.mjs --expect baseline|candidate [--out file.json]
//
// baseline:  the exposure must be observable (anon writes land, anon reads succeed),
//            otherwise the proof could not tell a fix from a broken probe.
// candidate: every anon write to facturas/resources and every anon access to the
//            seven learning relations is refused and leaves the data intact, while
//            signed-in, service-role, public-download and unrelated-bucket
//            behaviour is identical to baseline.
//
// Effects are judged by re-reading state with the service role (bytes/existence,
// rows), never by status codes alone. Local synthetic stack only: refuses any
// non-loopback URL. Keys and tokens are never printed.
//
// Requires the `facturas`, `resources` and `fneanon-other` buckets and their
// Production-like permissive policies, which no tracked migration creates (they
// exist only in Production); a local model must be applied first.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const args = process.argv.slice(2);
const expect = args[args.indexOf('--expect') + 1];
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!['baseline', 'candidate'].includes(expect)) {
  console.error('usage: --expect baseline|candidate [--out file.json]');
  process.exit(2);
}
const API = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DB = process.env.SUPABASE_DB_URL || '';
for (const u of [API, DB]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(u).hostname), 'local stack only');
assert.ok(ANON && SERVICE, 'local anon and service keys required');

const fixtures = JSON.parse(readFileSync(new URL('./e2e-fixtures.json', import.meta.url), 'utf8'));
const TARGETS = ['facturas', 'resources'];
const OTHER = 'fneanon-other';
const RELATIONS = ['lesson_completion_summary', 'pending_quiz_reviews', 'group_assignments_with_status',
  'user_badges_with_details', 'quiz_statistics', 'community_progress_report', 'school_progress_report'];
const run = `fneanon-proof/${Date.now()}-${randomUUID().slice(0, 8)}`;
const results = [];
let failures = 0;

function record(group, name, expected, observed, detail = {}) {
  const ok = expected === observed;
  if (!ok) failures++;
  results.push({ group, name, expected, observed, ok, ...detail });
  console.log(`${ok ? 'ok' : 'NOT OK'} - [${group}] ${name}: expected ${expected}, observed ${observed}`);
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const headers = (token, extra = {}) => ({ apikey: ANON, Authorization: `Bearer ${token}`, ...extra });

async function signIn(user) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  assert.equal(r.status, 200, `sign-in of synthetic ${user.role} failed (${r.status})`);
  return (await r.json()).access_token;
}

// ---- storage primitives -------------------------------------------------------
const objUrl = (bucket, key) => `${API}/storage/v1/object/${bucket}/${key}`;
async function upload(token, bucket, key, body, { upsert = false, method = 'POST' } = {}) {
  const r = await fetch(objUrl(bucket, key), {
    method, headers: headers(token, { 'Content-Type': 'text/plain', 'x-upsert': String(upsert) }), body,
  });
  return r.status;
}
async function removeOne(token, bucket, key) {
  return (await fetch(objUrl(bucket, key), { method: 'DELETE', headers: headers(token) })).status;
}
async function removeMany(token, bucket, keys) {
  const r = await fetch(`${API}/storage/v1/object/${bucket}`, {
    method: 'DELETE', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: keys }),
  });
  return r.status;
}
async function transfer(token, op, bucket, from, to, destinationBucket) {
  const r = await fetch(`${API}/storage/v1/object/${op}`, {
    method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ bucketId: bucket, sourceKey: from, destinationKey: to, ...(destinationBucket ? { destinationBucket } : {}) }),
  });
  return r.status;
}
async function list(token, bucket, prefix) {
  const r = await fetch(`${API}/storage/v1/object/list/${bucket}`, {
    method: 'POST', headers: headers(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix, limit: 100 }),
  });
  return r.status === 200 ? (await r.json()).map((o) => o.name) : null;
}
async function readAs(token, bucket, key) {
  const r = await fetch(`${API}/storage/v1/object/authenticated/${bucket}/${key}`, { headers: headers(token) });
  return r.status === 200 ? sha(Buffer.from(await r.arrayBuffer())) : null;
}
const truth = (bucket, key) => readAs(SERVICE, bucket, key); // ground truth via service role
async function publicRead(bucket, key) {
  const r = await fetch(`${API}/storage/v1/object/public/${bucket}/${key}`);
  return r.status === 200 ? sha(Buffer.from(await r.arrayBuffer())) : null;
}

async function storageProof(tokens) {
  for (const b of [...TARGETS, OTHER]) {
    const r = await fetch(`${API}/storage/v1/bucket/${b}`, { headers: headers(SERVICE) });
    assert.equal(r.status, 200, `bucket ${b} missing: apply the local Production storage model first`);
  }
  const anonWritesLand = expect === 'baseline';
  for (const b of TARGETS) {
    const p = `${run}/${b}`;
    const orig = Buffer.from(`ORIGINAL ${b} ${run}`);
    const h = sha(orig);
    for (const k of ['orig.txt', 'victim-del.txt', 'victim-bulk.txt', 'victim-move.txt', 'victim-xmove.txt']) {
      assert.equal(await upload(SERVICE, b, `${p}/${k}`, orig), 200, `service seed ${b}/${k}`);
    }
    await upload(SERVICE, OTHER, `${p}/other-src.txt`, Buffer.from('other'));

    // anon: every mutation path
    const g = `anon-write:${b}`;
    await upload(ANON, b, `${p}/anon-new.txt`, Buffer.from('anon'));
    record(g, 'upload new object lands', anonWritesLand, (await truth(b, `${p}/anon-new.txt`)) !== null);
    await upload(ANON, b, `${p}/orig.txt`, Buffer.from('anon upsert'), { upsert: true });
    record(g, 'upsert overwrite changes bytes', anonWritesLand, (await truth(b, `${p}/orig.txt`)) !== h);
    if (anonWritesLand) await upload(SERVICE, b, `${p}/orig.txt`, orig, { upsert: true });
    await upload(ANON, b, `${p}/orig.txt`, Buffer.from('anon update'), { method: 'PUT' });
    record(g, 'update (PUT) changes bytes', anonWritesLand, (await truth(b, `${p}/orig.txt`)) !== h);
    if (anonWritesLand) await upload(SERVICE, b, `${p}/orig.txt`, orig, { upsert: true });
    await removeOne(ANON, b, `${p}/victim-del.txt`);
    record(g, 'single delete removes object', anonWritesLand, (await truth(b, `${p}/victim-del.txt`)) === null);
    await removeMany(ANON, b, [`${p}/victim-bulk.txt`]);
    record(g, 'bulk delete removes object', anonWritesLand, (await truth(b, `${p}/victim-bulk.txt`)) === null);
    await transfer(ANON, 'copy', b, `${p}/orig.txt`, `${p}/anon-copy.txt`);
    record(g, 'copy creates object', anonWritesLand, (await truth(b, `${p}/anon-copy.txt`)) !== null);
    await transfer(ANON, 'move', b, `${p}/victim-move.txt`, `${p}/anon-moved.txt`);
    record(g, 'move relocates object', anonWritesLand,
      (await truth(b, `${p}/victim-move.txt`)) === null || (await truth(b, `${p}/anon-moved.txt`)) !== null);
    // Cross-bucket paths are recorded at baseline (the Storage version may refuse
    // them on its own) and must have no effect at candidate.
    await transfer(ANON, 'copy', OTHER, `${p}/other-src.txt`, `${p}/anon-xcopy.txt`, b);
    const xcopy = (await truth(b, `${p}/anon-xcopy.txt`)) !== null;
    await transfer(ANON, 'move', b, `${p}/victim-xmove.txt`, `${p}/anon-xmoved.txt`, OTHER);
    const xmove = (await truth(b, `${p}/victim-xmove.txt`)) === null;
    if (expect === 'candidate') {
      record(g, 'cross-bucket copy into target lands', false, xcopy);
      record(g, 'cross-bucket move out of target lands', false, xmove);
    } else {
      results.push({ group: g, name: 'cross-bucket copy/move (informational)', xcopy, xmove, ok: true });
      console.log(`info - [${g}] cross-bucket copy landed=${xcopy}, move landed=${xmove}`);
    }
    record(g, 'original bytes intact after anon attempts', true, (await truth(b, `${p}/orig.txt`)) === h);

    // public read/list stays
    const pr = `public-read:${b}`;
    record(pr, 'signed-out public download returns original bytes', true, (await publicRead(b, `${p}/orig.txt`)) === h);
    record(pr, 'anon list shows objects', true, ((await list(ANON, b, p)) || []).includes('orig.txt'));

    // signed-in and service writes keep working
    for (const [who, token] of [['admin', tokens.admin], ['docente', tokens.docente], ['service', SERVICE]]) {
      const s = `${who}:${b}`;
      const k = `${p}/${who}.txt`;
      record(s, 'upload', 200, await upload(token, b, k, Buffer.from(`${who} v1`)));
      record(s, 'read back', sha(Buffer.from(`${who} v1`)), await readAs(token, b, k));
      record(s, 'list', true, ((await list(token, b, p)) || []).includes(`${who}.txt`));
      await upload(token, b, k, Buffer.from(`${who} v2`), { method: 'PUT' });
      record(s, 'update', sha(Buffer.from(`${who} v2`)), await truth(b, k));
      await transfer(token, 'copy', b, k, `${k}.copy`);
      record(s, 'copy', true, (await truth(b, `${k}.copy`)) !== null);
      await transfer(token, 'move', b, `${k}.copy`, `${k}.moved`);
      record(s, 'move', true, (await truth(b, `${k}.moved`)) !== null && (await truth(b, `${k}.copy`)) === null);
      await removeOne(token, b, `${k}.moved`);
      await removeMany(token, b, [k]);
      record(s, 'delete', true, (await truth(b, k)) === null && (await truth(b, `${k}.moved`)) === null);
    }
  }
  // the unrelated bucket is not touched by the restrictions
  const o = `unrelated:${OTHER}`;
  const k = `${run}/anon-other.txt`;
  await upload(ANON, OTHER, k, Buffer.from('anon other'));
  record(o, 'anon upload still lands', true, (await truth(OTHER, k)) !== null);
  await upload(ANON, OTHER, k, Buffer.from('anon other v2'), { method: 'PUT' });
  record(o, 'anon update still lands', sha(Buffer.from('anon other v2')), await truth(OTHER, k));
  await removeOne(ANON, OTHER, k);
  record(o, 'anon delete still lands', true, (await truth(OTHER, k)) === null);
}

// ---- learning relations over PostgREST ----------------------------------------
async function rest(token, path, init = {}) {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    ...init, headers: headers(token, { 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) }),
  });
  let body = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { status: r.status, body };
}

async function learningProof(tokens) {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const id = randomUUID();
  const ids = { instructor: randomUUID(), course: randomUUID(), lesson: randomUUID(), row: randomUUID() };
  const userId = async (u) => (await db.query('SELECT id FROM auth.users WHERE email=$1', [u.email])).rows[0].id;
  const docente = await userId(fixtures.users.docente);
  const admin = await userId(fixtures.users.admin);
  try {
    await db.query('INSERT INTO public.instructors (id, full_name) VALUES ($1, $2)', [ids.instructor, `FNE-ANON proof ${id}`]);
    await db.query('INSERT INTO public.courses (id, title, description, instructor_id) VALUES ($1,$2,$2,$3)', [ids.course, `FNE-ANON proof ${id}`, ids.instructor]);
    await db.query('INSERT INTO public.lessons (id, title, course_id) VALUES ($1,$2,$3)', [ids.lesson, `FNE-ANON proof ${id}`, ids.course]);
    await db.query(`INSERT INTO public.lesson_completion_summary (id, user_id, lesson_id, course_id, progress_percentage)
                    VALUES ($1,$2,$3,$4,10)`, [ids.row, docente, ids.lesson, ids.course]);
    const anonOk = expect === 'baseline';
    for (const rel of RELATIONS) {
      const r = await rest(ANON, `${rel}?select=*&limit=1`);
      record('anon-read', `${rel} readable`, anonOk, r.status === 200);
      if (!anonOk) record('anon-read', `${rel} refusal is a privilege error`, '42501', r.body?.code);
      for (const [who, token] of [['docente', tokens.docente], ['admin', tokens.admin], ['service', SERVICE]]) {
        record(`${who}-read`, `${rel} readable`, 200, (await rest(token, `${rel}?select=*&limit=1`)).status);
      }
    }
    const progress = async () => Number((await db.query('SELECT progress_percentage FROM public.lesson_completion_summary WHERE id=$1', [ids.row])).rows[0]?.progress_percentage ?? -1);
    const lcs = 'anon-write:lesson_completion_summary';
    const newRow = randomUUID();
    const ins = await rest(ANON, 'lesson_completion_summary', { method: 'POST', body: JSON.stringify({ id: newRow, user_id: admin, lesson_id: ids.lesson, course_id: ids.course }) });
    record(lcs, 'insert lands', anonOk, (await db.query('SELECT 1 FROM public.lesson_completion_summary WHERE id=$1', [newRow])).rowCount === 1,
      { status: ins.status, code: ins.body?.code ?? null });
    await rest(ANON, `lesson_completion_summary?id=eq.${ids.row}`, { method: 'PATCH', body: JSON.stringify({ progress_percentage: 99 }) });
    record(lcs, 'update lands', anonOk, (await progress()) === 99);
    await db.query('UPDATE public.lesson_completion_summary SET progress_percentage = 10 WHERE id=$1', [ids.row]);
    await rest(ANON, `lesson_completion_summary?id=eq.${ids.row}`, { method: 'DELETE' });
    record(lcs, 'delete lands', anonOk, (await progress()) === -1);
    if (!anonOk) record(lcs, 'row intact after anon attempts', 10, await progress());
    await db.query(`INSERT INTO public.lesson_completion_summary (id, user_id, lesson_id, course_id, progress_percentage)
                    VALUES ($1,$2,$3,$4,10) ON CONFLICT (id) DO NOTHING`, [ids.row, docente, ids.lesson, ids.course]);
    // signed-in and service writes unchanged (the PUBLIC USING(true) policy is out of scope)
    const auth = 'docente-write:lesson_completion_summary';
    await rest(tokens.docente, `lesson_completion_summary?id=eq.${ids.row}`, { method: 'PATCH', body: JSON.stringify({ progress_percentage: 20 }) });
    record(auth, 'update by signed-in docente', 20, await progress());
    await rest(SERVICE, `lesson_completion_summary?id=eq.${ids.row}`, { method: 'PATCH', body: JSON.stringify({ progress_percentage: 30 }) });
    record('service-write:lesson_completion_summary', 'update by service role', 30, await progress());
  } finally {
    await db.query('DELETE FROM public.lesson_completion_summary WHERE course_id=$1', [ids.course]);
    await db.query('DELETE FROM public.lessons WHERE id=$1', [ids.lesson]);
    await db.query('DELETE FROM public.courses WHERE id=$1', [ids.course]);
    await db.query('DELETE FROM public.instructors WHERE id=$1', [ids.instructor]);
    await db.end();
  }
}

const tokens = { admin: await signIn(fixtures.users.admin), docente: await signIn(fixtures.users.docente) };
await storageProof(tokens);
await learningProof(tokens);
const summary = { expect, run, at: new Date().toISOString(), checks: results.length, failures, results };
if (out) writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(`${failures === 0 ? 'PASS' : 'FAIL'}: ${results.length - failures}/${results.length} (${expect})`);
process.exit(failures === 0 ? 0 : 1);

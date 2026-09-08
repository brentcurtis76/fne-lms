#!/usr/bin/env node
// C-R2-01: deterministic multi-connection proof for the authorized grant writers.
// Synthetic disposable database only. Observe an actual lock wait before release.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
const url = new URL(process.env.SUPABASE_DB_URL || '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '54352');
assert.equal(url.pathname, '/postgres');
assert.equal(execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "com.supabase.cli.project"}}', 'supabase_db_rlslearn-disposable'], { encoding: 'utf8' }).trim(), 'rlslearn-disposable');
assert.match(execFileSync('docker', ['port', 'supabase_db_rlslearn-disposable', '5432/tcp'], { encoding: 'utf8' }), /:54352\s/);
const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString: url.toString() }));
const [db, a, b] = clients;
const id = n => `c2020000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1), consultor = id(2), learner = id(3), second = id(4), course = id(5), instructor = id(6), path = id(7);
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; console.log(`ok ${checks} - ${message}`); }
async function actor(client, uid) {
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query("SELECT set_config('role','authenticated',true),set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
}
async function grant(client, rpc, ids) {
  return (await client.query(`SELECT public.${rpc}($1,$2::uuid[]) AS r`, [course, ids])).rows[0].r;
}
async function cleanup() {
  await db.query('DELETE FROM public.learning_path_assignments WHERE path_id=$1', [path]);
  await db.query('DELETE FROM public.learning_paths WHERE id=$1', [path]);
  await db.query('DELETE FROM public.course_assignments WHERE course_id=$1', [course]);
  await db.query('DELETE FROM public.course_enrollments WHERE course_id=$1', [course]);
  await db.query('DELETE FROM public.courses WHERE id=$1', [course]);
  await db.query('DELETE FROM public.instructors WHERE id=$1', [instructor]);
  await db.query('DELETE FROM public.user_roles WHERE user_id=ANY($1)', [[admin, consultor, learner, second]]);
  await db.query('DELETE FROM public.profiles WHERE id=ANY($1)', [[admin, consultor, learner, second]]);
}
async function waitForLock(pid) {
  for (let i = 0; i < 150; i++) {
    const r = (await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
    if (r?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('second grant never reached the expected lock wait');
}
async function race(rpcA, rpcB, rollback = false) {
  await actor(a, rpcA === 'batch_assign_courses' ? consultor : admin);
  await actor(b, rpcB === 'batch_assign_courses' ? consultor : admin);
  const first = await grant(a, rpcA, [second, learner, second]);
  const pending = grant(b, rpcB, [learner, second]);
  // Attach rejection handler immediately while observing the lock.
  const observed = pending.then(result => ({ result }), error => ({ error }));
  await waitForLock(b.processID);
  check(true, `${rpcA} / ${rpcB}: second call waits on the first, reversed/duplicate inputs`);
  await a.query(rollback ? 'ROLLBACK' : 'COMMIT');
  const next = await observed;
  if (next.error) throw next.error;
  await b.query('COMMIT');
  return [first, next.result];
}
try {
  await Promise.all(clients.map(c => c.connect()));
  await cleanup();
  for (const [uid, role] of [[admin,'admin'],[consultor,'consultor'],[learner,'docente'],[second,'docente']]) {
    await db.query("INSERT INTO public.profiles(id,email,name,approval_status) VALUES($1,$2,'Synthetic grant proof','approved')", [uid, `${uid}@synthetic.local`]);
    await db.query('INSERT INTO public.user_roles(user_id,role_type,is_active) VALUES($1,$2,true)', [uid,role]);
  }
  await db.query("INSERT INTO public.instructors(id,full_name) VALUES($1,'Synthetic grant proof')",[instructor]);
  await db.query("INSERT INTO public.courses(id,title,description,instructor_id) VALUES($1,'Synthetic grant proof','Synthetic',$2)",[course,instructor]);
  await db.query("INSERT INTO public.learning_paths(id,name,created_by) VALUES($1,'Synthetic grant proof',$2)",[path,admin]);
  await db.query('INSERT INTO public.learning_path_courses(learning_path_id,course_id,sequence_order) VALUES($1,$2,1)',[path,course]);
  await actor(a,admin);
  await a.query('SELECT public.batch_assign_learning_path($1,$2::uuid[],NULL,$3)',[path,[learner,second],admin]);
  await a.query('COMMIT');
  const history = (await db.query('SELECT to_jsonb(ce) AS row FROM public.course_enrollments ce WHERE course_id=$1 ORDER BY user_id',[course])).rows;
  let [first,next] = await race('batch_assign_courses','batch_assign_courses');
  check(first.assignments_created===2 && first.enrollments_promoted===2 && first.enrollments_created===0,'first batch creates two sources and promotes two effective entitlements');
  check(next.assignments_created===0 && next.assignments_skipped===2 && next.enrollments_unchanged===2,'waiter sees committed sources and reports unchanged, no false promotion');
  assert.deepEqual((await db.query('SELECT to_jsonb(ce) AS row FROM public.course_enrollments ce WHERE course_id=$1 ORDER BY user_id',[course])).rows,history);
  check(true,'concurrent batch grants preserve complete enrollment history');
  await db.query('DELETE FROM public.learning_path_assignments WHERE path_id=$1',[path]);
  await actor(a,learner);
  const access=(await a.query('SELECT public.auth_is_course_student($1) AS allowed,(SELECT count(*)::int FROM public.auth_accessible_course_ids() c WHERE c=$1) AS listed,(SELECT count(*)::int FROM public.courses WHERE id=$1) AS visible',[course])).rows[0];
  check(access.allowed && access.listed===1 && access.visible===1,'learner retains actual course and my-courses access after path removal');
  await a.query('ROLLBACK');
  [first,next]=await race('admin_grant_course_access','admin_grant_course_access');
  check(first.enrollments_promoted===2 && next.enrollments_promoted===0 && next.enrollments_unchanged===2,'concurrent admin retries classify actual origin promotion exactly once');
  [first,next]=await race('admin_grant_course_access','batch_assign_courses');
  check(first.enrollments_unchanged===2 && next.enrollments_unchanged===2,'admin and consultor batch writers serialize compatibly');
  // Existing assignments but missing enrollments: one creation, then unchanged.
  await db.query('DELETE FROM public.course_enrollments WHERE course_id=$1',[course]);
  [first,next]=await race('batch_assign_courses','batch_assign_courses');
  check(first.enrollments_created===2 && first.assignments_created===0 && next.enrollments_created===0 && next.enrollments_unchanged===2,'concurrent early-skip repair creates each missing enrollment once');
  await db.query('DELETE FROM public.course_enrollments WHERE course_id=$1',[course]);
  await db.query('DELETE FROM public.course_assignments WHERE course_id=$1',[course]);
  [first,next]=await race('batch_assign_courses','batch_assign_courses',true);
  check(next.assignments_created===2 && next.enrollments_created===2,'rollback releases locks and waiter creates the grant; aborted writes do not survive');
  check((await db.query('SELECT count(*)::int AS n FROM public.course_assignments WHERE course_id=$1',[course])).rows[0].n===2,'exactly two committed sources after rollback/retry');
  console.log(`PASS ${checks} checks`);
} finally {
  await Promise.all([a,b].map(c=>c.query('ROLLBACK').catch(()=>undefined)));
  await cleanup();
  console.log('Synthetic grant proof fixtures removed');
  await Promise.all(clients.map(c=>c.end()));
}

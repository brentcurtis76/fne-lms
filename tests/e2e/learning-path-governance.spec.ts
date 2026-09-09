import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiContextFor, ensureStorageState, E2E_USERS, E2E_ROLE_COMMUNITY, type FixtureKey } from './helpers/auth';

/**
 * W-B2c-01 — learning-path governance, end to end on the seeded local stack.
 *
 * Proves, against the REAL database and the REAL API (no doubles):
 *   1. creating a template is literal-admin-only: docente, consultor and
 *      equipo_directivo all get 403 from POST /api/learning-paths; admin gets 201;
 *   2. assignment is literal-admin-only and consumption follows assignment: after the
 *      admin assigns the synthetic template to the docente, the docente sees it in
 *      /api/learning-paths/my-paths and the consultor does not;
 *   3. cross-user reporting is literal-admin-only: the docente cannot read another
 *      user's paths, the equipo_directivo cannot read analytics;
 *   4. the database enforces the same model through PostgREST, which is exactly the
 *      surface a browser client reaches: anonymous reads of learning_paths are refused,
 *      the docente's own token sees only the assigned template, the consultor's token
 *      sees none, and the docente cannot re-point their assignment at another path
 *      (column-level UPDATE privilege) nor insert an assignment for themselves.
 *
 * Synthetic data only; the template it creates is deleted at the end.
 */

const ROOT = join(__dirname, '..', '..');
const fileEnv: Record<string, string> = (() => {
  try {
    return parseEnv(readFileSync(join(ROOT, '.env.local'), 'utf8'));
  } catch {
    return {};
  }
})();

function requiredEnv(key: string): string {
  const value = process.env[key] || fileEnv[key];
  if (!value) {
    throw new Error(`[learning-path-governance] ${key} is not set — see the .env.local block in .github/workflows/ci.yml.`);
  }
  return value;
}

const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_APP_ORIGIN = process.env.E2E_APP_ORIGIN || 'http://localhost:3000';
const ANON_KEY = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const CRON_SECRET = requiredEnv('CRON_SECRET');

const TEMPLATE_NAME = `E2E governance template ${Date.now()}`;

/**
 * Synthetic content and group fixtures for this spec only, created through the
 * service-role client of the ephemeral local stack (the same way
 * auth-lifecycle / network-supervisors mint their fixtures) and removed in
 * afterAll. Distinct uuids for the workspace and its community on purpose:
 * learning_path_assignments.group_id references community_workspaces.id while
 * a membership is user_roles.community_id (a growth_communities.id).
 */
const service: SupabaseClient = createClient(SUPABASE_URL, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const FX = 'e2e0b2c0-0000-4000-8000-';
const INSTRUCTOR_ID = `${FX}00000000f001`;
const COURSE_ID = `${FX}000000000c01`;        // in the template
const OTHER_COURSE_ID = `${FX}000000000c02`;  // in no template
const MODULE_ID = `${FX}00000000e001`;
const LESSON_ID = `${FX}00000000ee01`;
const OTHER_MODULE_ID = `${FX}00000000e002`;
const OTHER_LESSON_ID = `${FX}00000000ee02`;
const OWN_WORKSPACE_ID = `${FX}00000000bb01`;
// Workspace of E2E_ROLE_COMMUNITY (communityManager's community). The app can
// create a community's workspace lazily (get_or_create_community_workspace) and
// community_id is UNIQUE, so an existing one is reused and never deleted; only a
// workspace this spec created is removed.
let WORKSPACE_ID = OWN_WORKSPACE_ID;
let createdWorkspace = false;
let pathIdForCleanup: string | null = null;

async function seedContent() {
  const step = async (label: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) throw new Error(`[learning-path-governance] seed ${label}: ${error.message}`);
  };
  await step('instructor', service.from('instructors').upsert({ id: INSTRUCTOR_ID, full_name: 'E2E instructor (synthetic)' }));
  await step('courses', service.from('courses').upsert([
    { id: COURSE_ID, title: 'E2E governance course', description: 'synthetic', instructor_id: INSTRUCTOR_ID },
    { id: OTHER_COURSE_ID, title: 'E2E unrelated course', description: 'synthetic', instructor_id: INSTRUCTOR_ID },
  ]));
  await step('modules', service.from('modules').upsert([
    { id: MODULE_ID, course_id: COURSE_ID, title: 'E2E module', order_number: 1 },
    { id: OTHER_MODULE_ID, course_id: OTHER_COURSE_ID, title: 'E2E unrelated module', order_number: 1 },
  ]));
  await step('lessons', service.from('lessons').upsert([
    { id: LESSON_ID, module_id: MODULE_ID, title: 'E2E lesson' },
    { id: OTHER_LESSON_ID, module_id: OTHER_MODULE_ID, title: 'E2E unrelated lesson' },
  ]));
  const { data: existing, error: lookupError } = await service
    .from('community_workspaces').select('id').eq('community_id', E2E_ROLE_COMMUNITY.id).maybeSingle();
  if (lookupError) throw new Error(`[learning-path-governance] seed workspace lookup: ${lookupError.message}`);
  if (existing?.id) {
    WORKSPACE_ID = existing.id;
  } else {
    await step('workspace', service.from('community_workspaces').insert({ id: OWN_WORKSPACE_ID, community_id: E2E_ROLE_COMMUNITY.id, name: 'E2E governance workspace' }));
    WORKSPACE_ID = OWN_WORKSPACE_ID;
    createdWorkspace = true;
  }
}

async function removeContent() {
  await service.from('learning_path_progress_sessions').delete().in('course_id', [COURSE_ID, OTHER_COURSE_ID]);
  if (pathIdForCleanup) {
    await service.from('learning_path_daily_user_activity').delete().eq('path_id', pathIdForCleanup);
    await service.from('learning_path_progress_sessions').delete().eq('path_id', pathIdForCleanup);
  }
  await service.from('course_enrollments').delete().in('course_id', [COURSE_ID, OTHER_COURSE_ID]);
  await service.from('learning_path_assignments').delete().eq('group_id', WORKSPACE_ID).in('path_id', []).then(() => undefined, () => undefined);
  if (createdWorkspace) await service.from('community_workspaces').delete().eq('id', OWN_WORKSPACE_ID);
  await service.from('lessons').delete().in('id', [LESSON_ID, OTHER_LESSON_ID]);
  await service.from('modules').delete().in('id', [MODULE_ID, OTHER_MODULE_ID]);
  await service.from('courses').delete().in('id', [COURSE_ID, OTHER_COURSE_ID]);
  await service.from('instructors').delete().eq('id', INSTRUCTOR_ID);
}

function rest(token: string) {
  return { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
}

/** GoTrue password grant for a seeded persona — the token a browser client would hold. */
async function accessTokenFor(request: APIRequestContext, key: FixtureKey): Promise<{ token: string; userId: string }> {
  const persona = E2E_USERS[key];
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    data: { email: persona.email, password: persona.password },
  });
  expect(res.status(), `password grant for ${key}`).toBe(200);
  const body = (await res.json()) as { access_token: string; user: { id: string } };
  return { token: body.access_token, userId: body.user.id };
}

async function restGet(request: APIRequestContext, path: string, token?: string) {
  return request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('learning-path governance (W-B2c-01)', () => {
  let admin: APIRequestContext;
  let docente: APIRequestContext;
  let consultor: APIRequestContext;
  let directivo: APIRequestContext;
  let pathId: string | null = null;

  let communityManager: APIRequestContext;
  let gcLeader: APIRequestContext;

  test.beforeAll(async ({ browser, baseURL }: { browser: Browser; baseURL?: string }) => {
    const base = baseURL ?? 'http://localhost:3000';
    await seedContent();
    admin = await apiContextFor(browser, 'admin', base);
    docente = await apiContextFor(browser, 'docente', base);
    consultor = await apiContextFor(browser, 'consultorGlobal', base);
    directivo = await apiContextFor(browser, 'directivo', base);
    communityManager = await apiContextFor(browser, 'communityManager', base);
    gcLeader = await apiContextFor(browser, 'gcLeader', base);
  });

  test.afterAll(async () => {
    await removeContent();
    if (pathId) {
      await admin.delete(`/api/learning-paths/${pathId}`);
    }
    await Promise.all([admin, docente, consultor, directivo, communityManager, gcLeader].map((c) => c?.dispose()));
  });

  test('1. only the literal admin can create a template', async () => {
    const body = { name: TEMPLATE_NAME, description: 'synthetic e2e template', courseIds: [COURSE_ID] };

    for (const [label, ctx] of [['docente', docente], ['consultor', consultor], ['equipo_directivo', directivo]] as const) {
      const res = await ctx.post('/api/learning-paths', { data: body });
      expect(res.status(), `${label} POST /api/learning-paths`).toBe(403);
    }

    const created = await admin.post('/api/learning-paths', { data: body });
    expect(created.status()).toBe(201);
    const json = (await created.json()) as { id: string };
    expect(json.id).toBeTruthy();
    pathId = json.id;
    pathIdForCleanup = json.id;
  });

  test('2. assignment is admin-only and consumption follows assignment', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { userId: docenteId } = await accessTokenFor(request, 'docente');

    const byConsultor = await consultor.post('/api/learning-paths/assign', { data: { pathId, userId: docenteId } });
    expect(byConsultor.status()).toBe(403);
    const byDirectivo = await directivo.post('/api/learning-paths/assign', { data: { pathId, userId: docenteId } });
    expect(byDirectivo.status()).toBe(403);

    const byAdmin = await admin.post('/api/learning-paths/assign', { data: { pathId, userId: docenteId } });
    expect(byAdmin.status(), await byAdmin.text()).toBe(201);

    const mine = await docente.get('/api/learning-paths/my-paths');
    expect(mine.status()).toBe(200);
    const minePaths = (await mine.json()) as Array<{ id: string }>;
    expect(minePaths.map((p) => p.id)).toContain(pathId);

    const theirs = await consultor.get('/api/learning-paths/my-paths');
    expect(theirs.status()).toBe(200);
    const theirPaths = (await theirs.json()) as Array<{ id: string }>;
    expect(theirPaths.map((p) => p.id)).not.toContain(pathId);
  });

  test('3. cross-user reporting is admin-only', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { userId: adminId } = await accessTokenFor(request, 'admin');
    const { userId: docenteId } = await accessTokenFor(request, 'docente');

    const other = await docente.get(`/api/learning-paths/user/${adminId}`);
    expect(other.status()).toBe(403);

    const self = await docente.get(`/api/learning-paths/user/${docenteId}`);
    expect(self.status()).toBe(200);
    expect(((await self.json()) as Array<{ id: string }>).map((p) => p.id)).toContain(pathId);

    const analytics = await directivo.get('/api/learning-paths/analytics');
    expect(analytics.status()).toBe(403);

    const adminView = await admin.get(`/api/learning-paths/user/${docenteId}`);
    expect(adminView.status()).toBe(200);
  });

  test('4. the database enforces the model through PostgREST', async ({ request }) => {
    test.skip(!pathId, 'template was not created');

    // anonymous: no privilege on the table at all
    const anon = await restGet(request, `learning_paths?select=id&id=eq.${pathId}`);
    expect([401, 403]).toContain(anon.status());

    // the docente's own token: exactly the assigned template
    const { token: docenteToken } = await accessTokenFor(request, 'docente');
    const seen = await restGet(request, `learning_paths?select=id&id=eq.${pathId}`, docenteToken);
    expect(seen.status()).toBe(200);
    expect(((await seen.json()) as Array<{ id: string }>).map((r) => r.id)).toEqual([pathId]);

    // the consultor's token: nothing (no assignment, no management authority)
    const { token: consultorToken } = await accessTokenFor(request, 'consultorGlobal');
    const unseen = await restGet(request, `learning_paths?select=id&id=eq.${pathId}`, consultorToken);
    expect(unseen.status()).toBe(200);
    expect(await unseen.json()).toEqual([]);

    // the docente cannot re-point their assignment (column privilege) …
    const repoint = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_assignments?path_id=eq.${pathId}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${docenteToken}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
      data: { path_id: '00000000-0000-4000-8000-000000000000' },
    });
    expect([401, 403]).toContain(repoint.status());

    // … but can record their own progress on it — exactly the columns the
    // activity route writes; the authoritative timing / percentage columns are
    // server-side only (column-level UPDATE grant).
    const progress = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_assignments?path_id=eq.${pathId}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${docenteToken}`, 'content-type': 'application/json', Prefer: 'return=representation' },
      data: { current_course_sequence: 2, last_activity_at: new Date().toISOString() },
    });
    expect(progress.status(), await progress.text()).toBe(200);
    expect(((await progress.json()) as Array<{ current_course_sequence: number }>).map((r) => r.current_course_sequence)).toEqual([2]);
    const forgeTime = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_assignments?path_id=eq.${pathId}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${docenteToken}`, 'content-type': 'application/json', Prefer: 'return=representation' },
      data: { total_time_spent_minutes: 999999 },
    });
    expect([401, 403]).toContain(forgeTime.status());

    // … and cannot assign anyone (including themselves) to a template
    const { userId: consultorId } = await accessTokenFor(request, 'consultorGlobal');
    const selfAssign = await request.post(`${SUPABASE_URL}/rest/v1/learning_path_assignments`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${consultorToken}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
      data: { path_id: pathId, user_id: consultorId, assigned_by: consultorId },
    });
    expect([401, 403]).toContain(selfAssign.status());
  });
  test('5. real assigned content: the assignee reads the lesson through the assignment, not through an enrolment', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');
    const { token: consultorToken } = await accessTokenFor(request, 'consultorGlobal');

    // The assignment side effect enrolled the docente; remove that row so the
    // only remaining authority is the assignment itself (R3 reproduction).
    const { error: unenrol } = await service.from('course_enrollments').delete().eq('user_id', docenteId).eq('course_id', COURSE_ID);
    expect(unenrol).toBeNull();

    const chain = ['courses', 'modules', 'lessons'] as const;
    const ids = { courses: COURSE_ID, modules: MODULE_ID, lessons: LESSON_ID };
    for (const table of chain) {
      const seen = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=id&id=eq.${ids[table]}`, { headers: rest(docenteToken) });
      expect(seen.status(), `docente ${table}`).toBe(200);
      expect((await seen.json()) as unknown[], `docente sees the assigned ${table}`).toHaveLength(1);
    }
    const unrelated = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${OTHER_LESSON_ID}`, { headers: rest(docenteToken) });
    expect(await unrelated.json(), 'docente does not see a lesson of a course in no template').toEqual([]);
    const consultorLesson = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=in.(${LESSON_ID},${OTHER_LESSON_ID})`, { headers: rest(consultorToken) });
    expect(await consultorLesson.json(), 'consultor (not assigned, not enrolled) sees no lesson').toEqual([]);
    const anonLesson = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${LESSON_ID}`, { headers: { apikey: ANON_KEY } });
    expect(await anonLesson.json(), 'anon sees no lesson').toEqual([]);
  });

  test('6. group assignment resolves membership through the workspace -> community join (distinct ids)', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    expect(WORKSPACE_ID).not.toBe(E2E_ROLE_COMMUNITY.id);

    const byConsultor = await consultor.post('/api/learning-paths/assign', { data: { pathId, groupId: WORKSPACE_ID } });
    expect(byConsultor.status()).toBe(403);
    const byAdmin = await admin.post('/api/learning-paths/assign', { data: { pathId, groupId: WORKSPACE_ID } });
    expect(byAdmin.status(), await byAdmin.text()).toBe(201);

    // communityManager is an active member of E2E_ROLE_COMMUNITY (the workspace's community).
    const mine = await communityManager.get('/api/learning-paths/my-paths');
    expect(mine.status()).toBe(200);
    expect(((await mine.json()) as Array<{ id: string }>).map((p) => p.id)).toContain(pathId);
    const { token: cmToken } = await accessTokenFor(request, 'communityManager');
    const viaRest = await request.get(`${SUPABASE_URL}/rest/v1/learning_paths?select=id&id=eq.${pathId}`, { headers: rest(cmToken) });
    expect((await viaRest.json()) as unknown[]).toHaveLength(1);
    const lesson = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${LESSON_ID}`, { headers: rest(cmToken) });
    expect((await lesson.json()) as unknown[], 'group member reads the assigned lesson').toHaveLength(1);

    // gcLeader is an active member of a DIFFERENT community: nothing.
    const theirs = await gcLeader.get('/api/learning-paths/my-paths');
    expect(theirs.status()).toBe(200);
    expect(((await theirs.json()) as Array<{ id: string }>).map((p) => p.id)).not.toContain(pathId);
    const { token: gcToken } = await accessTokenFor(request, 'gcLeader');
    const gcRest = await request.get(`${SUPABASE_URL}/rest/v1/learning_paths?select=id&id=eq.${pathId}`, { headers: rest(gcToken) });
    expect(await gcRest.json()).toEqual([]);
  });

  test('7. sessions: course scope, server-side timing, at-most-once credit, maintenance settlement', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');

    // A session on the path cannot be attributed to a course outside it (API and RPC).
    const foreign = await docente.post('/api/learning-paths/session/start', { data: { pathId, courseId: OTHER_COURSE_ID, activityType: 'course_start' } });
    expect([400, 500]).toContain(foreign.status());
    const foreignRest = await request.post(`${SUPABASE_URL}/rest/v1/rpc/start_learning_path_session`, {
      headers: rest(docenteToken),
      data: { p_user_id: docenteId, p_path_id: pathId, p_course_id: OTHER_COURSE_ID, p_activity_type: 'course_start' },
    });
    expect(foreignRest.status(), await foreignRest.text()).toBe(400);

    const started = await docente.post('/api/learning-paths/session/start', { data: { pathId, courseId: COURSE_ID, activityType: 'course_start' } });
    expect(started.status(), await started.text()).toBe(200);
    const { sessionId } = (await started.json()) as { sessionId: string };

    // Protected timing columns are not client-writable; the heartbeat is.
    const backdate = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_progress_sessions?id=eq.${sessionId}`, {
      headers: rest(docenteToken), data: { session_start: '2020-01-01T00:00:00Z', time_spent_minutes: 999999 },
    });
    expect([401, 403]).toContain(backdate.status());
    const heartbeat = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_progress_sessions?id=eq.${sessionId}`, {
      headers: rest(docenteToken), data: { last_heartbeat: new Date().toISOString() },
    });
    expect(heartbeat.status(), await heartbeat.text()).toBe(200);
    // R4-01: the heartbeat is accepted but SERVER-derived — a forged future
    // value (finite or infinity) is stored as the server clock.
    for (const forged of ['2999-01-01T00:00:00Z', 'infinity']) {
      const forge = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_progress_sessions?id=eq.${sessionId}`, {
        headers: rest(docenteToken), data: { last_heartbeat: forged },
      });
      expect(forge.status(), await forge.text()).toBe(200);
      const { data: stored } = await service.from('learning_path_progress_sessions').select('last_heartbeat').eq('id', sessionId).single();
      expect(new Date(stored!.last_heartbeat as string).getTime(), `forged ${forged} is stored as the server clock`).toBeLessThanOrEqual(Date.now() + 5_000);
    }
    const repoint = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_progress_sessions?id=eq.${sessionId}`, {
      headers: rest(docenteToken), data: { course_id: OTHER_COURSE_ID },
    });
    expect([401, 403]).toContain(repoint.status());
    const selfCredit = await request.post(`${SUPABASE_URL}/rest/v1/rpc/increment_path_assignment_time`, {
      headers: rest(docenteToken), data: { p_user_id: docenteId, p_path_id: pathId, p_minutes: 999999 },
    });
    expect([401, 403, 404]).toContain(selfCredit.status());

    // Ending twice credits once; the client's minutes are ignored.
    const end1 = await docente.post('/api/learning-paths/session/end', { data: { sessionId, timeSpentMinutes: 999999 } });
    expect(end1.status(), await end1.text()).toBe(200);
    expect(((await end1.json()) as { timeSpentMinutes: number }).timeSpentMinutes).toBeLessThan(5);
    const end2 = await docente.post('/api/learning-paths/session/end', { data: { sessionId } });
    expect(end2.status()).toBe(200);
    const { data: assignment } = await service.from('learning_path_assignments').select('total_time_spent_minutes').eq('path_id', pathId).eq('user_id', docenteId).single();
    expect(assignment?.total_time_spent_minutes ?? 0).toBeLessThan(5);

    // Maintenance settlement: a stale open session (seeded server-side) is
    // closed at its heartbeat and credited once; a second run credits nothing.
    const { data: stale, error: staleErr } = await service.from('learning_path_progress_sessions').insert({
      user_id: docenteId, path_id: pathId, activity_type: 'path_view',
      session_start: new Date(Date.now() - 50 * 60_000).toISOString(),
      last_heartbeat: new Date(Date.now() - 20 * 60_000).toISOString(),
    }).select('id').single();
    expect(staleErr).toBeNull();
    const before = assignment?.total_time_spent_minutes ?? 0;
    const cron1 = await request.post('/api/cron/cleanup-learning-path-sessions', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(cron1.status(), await cron1.text()).toBe(200);
    const cron2 = await request.post('/api/cron/cleanup-learning-path-sessions', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(cron2.status()).toBe(200);
    const { data: settledRow } = await service.from('learning_path_progress_sessions').select('session_end, settled_at, time_spent_minutes').eq('id', stale!.id).single();
    expect(settledRow?.session_end).not.toBeNull();
    expect(settledRow?.settled_at).not.toBeNull();
    expect(settledRow?.time_spent_minutes).toBe(30);
    const { data: after } = await service.from('learning_path_assignments').select('total_time_spent_minutes').eq('path_id', pathId).eq('user_id', docenteId).single();
    expect((after?.total_time_spent_minutes ?? 0) - before).toBe(30);
    const unauth = await request.post('/api/cron/cleanup-learning-path-sessions', { headers: { Authorization: 'Bearer not-the-secret' } });
    expect(unauth.status()).toBe(401);
  });

  test('8. cookie and Bearer authorization are equivalent at the API boundary', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');
    const { token: consultorToken } = await accessTokenFor(request, 'consultorGlobal');

    const viaCookie = await docente.get('/api/learning-paths/my-paths');
    const viaBearer = await request.get('/api/learning-paths/my-paths', { headers: { Authorization: `Bearer ${docenteToken}` } });
    expect(viaBearer.status()).toBe(200);
    expect(((await viaBearer.json()) as Array<{ id: string }>).map((p) => p.id).sort())
      .toEqual(((await viaCookie.json()) as Array<{ id: string }>).map((p) => p.id).sort());

    const deniedCookie = await consultor.get(`/api/learning-paths/user/${docenteId}`);
    const deniedBearer = await request.get(`/api/learning-paths/user/${docenteId}`, { headers: { Authorization: `Bearer ${consultorToken}` } });
    expect(deniedCookie.status()).toBe(403);
    expect(deniedBearer.status()).toBe(403);
    const noAuth = await request.get(`/api/learning-paths/user/${docenteId}`);
    expect(noAuth.status()).toBe(401);
  });

  test('9. assignment matrix: consultor keeps the course half, learning paths stay admin-only', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { userId: docenteId } = await accessTokenFor(request, 'docente');

    // user-assignments runs on the CALLER's session client: the consultor passes
    // the (restored) audience gate — not 403 — but cannot read another user's
    // `profiles` row (pre-existing `Allow users to view their own profile`
    // policy: own or admin), so the route answers its baseline 404 for them.
    // The consultor's course-only contract is pinned at unit level
    // (governance-boundary.test.ts) where the profile read is doubled.
    const asConsultor = await consultor.get(`/api/admin/assignment-matrix/user-assignments?userId=${docenteId}`);
    expect(asConsultor.status(), await asConsultor.text()).not.toBe(403);
    expect([200, 404]).toContain(asConsultor.status());
    if (asConsultor.status() === 200) {
      const consultorBody = (await asConsultor.json()) as { assignments: Array<{ type: string; sourceLPIds: string[] }>; stats: { totalLPs: number } };
      expect(consultorBody.assignments.some((a) => a.type === 'learning_path')).toBe(false);
      expect(consultorBody.assignments.every((a) => a.sourceLPIds.length === 0)).toBe(true);
      expect(consultorBody.stats.totalLPs).toBe(0);
    }

    const asAdmin = await admin.get(`/api/admin/assignment-matrix/user-assignments?userId=${docenteId}`);
    expect(asAdmin.status()).toBe(200);
    const adminBody = (await asAdmin.json()) as { assignments: Array<{ type: string; contentId: string }> };
    expect(adminBody.assignments.some((a) => a.type === 'learning_path' && a.contentId === pathId)).toBe(true);

    const stats = await consultor.get('/api/admin/assignment-matrix/content-stats?contentType=all');
    expect(stats.status()).toBe(200);
    const statsBody = (await stats.json()) as { learningPaths?: unknown[]; courses?: Array<{ learningPathCount: number; lpAssigneeCount: number }> };
    expect(statsBody.learningPaths).toBeUndefined();
    expect((statsBody.courses || []).every((c) => c.learningPathCount === 0 && c.lpAssigneeCount === 0)).toBe(true);
    const lpStats = await consultor.get('/api/admin/assignment-matrix/content-stats?contentType=learning_paths');
    expect(lpStats.status()).toBe(403);
    const asDocente = await docente.get(`/api/admin/assignment-matrix/user-assignments?userId=${docenteId}`);
    expect(asDocente.status()).toBe(403);
  });

  test('R2-04. a group-only member accrues progress in their own record, not lost', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    // The group assignment from test 6 makes communityManager a valid group-only
    // assignee (no individual learning_path_assignments row).
    const { token: cmToken, userId: cmId } = await accessTokenFor(request, 'communityManager');

    const before = await service.from('learning_path_assignments').select('id').eq('user_id', cmId).eq('path_id', pathId);
    expect(before.data ?? [], 'group-only member has no individual assignment row').toHaveLength(0);

    const started = await request.post(`${SUPABASE_APP_ORIGIN}/api/learning-paths/session/start`, {
      headers: { Authorization: `Bearer ${cmToken}` },
      data: { pathId, courseId: COURSE_ID, activityType: 'course_start' },
    });
    expect(started.status(), await started.text()).toBe(200);
    const { sessionId } = (await started.json()) as { sessionId: string };

    // Backdate the session server-side so the credited duration is observable.
    const { error: backdate } = await service.from('learning_path_progress_sessions')
      .update({ session_start: new Date(Date.now() - 18 * 60_000).toISOString() }).eq('id', sessionId);
    expect(backdate).toBeNull();

    const ended = await request.post(`${SUPABASE_APP_ORIGIN}/api/learning-paths/session/end`, {
      headers: { Authorization: `Bearer ${cmToken}` }, data: { sessionId },
    });
    expect(ended.status(), await ended.text()).toBe(200);

    // The own-progress row carries the credit; still no individual assignment row.
    const { data: progress } = await service.from('learning_path_user_progress')
      .select('total_time_spent_minutes').eq('user_id', cmId).eq('path_id', pathId).single();
    expect((progress?.total_time_spent_minutes ?? 0), 'group-only member: their own progress record received the ~18 minutes').toBeGreaterThanOrEqual(17);
    const after = await service.from('learning_path_assignments').select('id').eq('user_id', cmId).eq('path_id', pathId);
    expect(after.data ?? [], 'group-only member: progress did not become an individual assignment row').toHaveLength(0);

    // The member reads their own progress row through their token; another member does not see it.
    const ownRest = await request.get(`${SUPABASE_URL}/rest/v1/learning_path_user_progress?select=total_time_spent_minutes&user_id=eq.${cmId}`, { headers: rest(cmToken) });
    expect((await ownRest.json()) as unknown[]).toHaveLength(1);
    const { token: docenteToken } = await accessTokenFor(request, 'docente');
    const foreignRest = await request.get(`${SUPABASE_URL}/rest/v1/learning_path_user_progress?select=total_time_spent_minutes&user_id=eq.${cmId}`, { headers: rest(docenteToken) });
    expect(await foreignRest.json(), 'another user cannot read the group member progress row').toEqual([]);
  });

  test('R2-03. a learner cannot open two sessions on one path, nor create one directly', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');

    // Direct INSERT of a session is refused (only the RPC creates sessions).
    const directInsert = await request.post(`${SUPABASE_URL}/rest/v1/learning_path_progress_sessions`, {
      headers: { ...rest(docenteToken), Prefer: 'return=minimal' },
      data: { user_id: docenteId, path_id: pathId, activity_type: 'path_view' },
    });
    expect([401, 403]).toContain(directInsert.status());

    // Start once through the RPC; a second concurrent start does not yield two open rows.
    const startOnce = () => request.post(`${SUPABASE_URL}/rest/v1/rpc/start_learning_path_session`, {
      headers: rest(docenteToken),
      data: { p_user_id: docenteId, p_path_id: pathId, p_course_id: COURSE_ID, p_activity_type: 'course_start' },
    });
    const [r1, r2] = await Promise.all([startOnce(), startOnce()]);
    expect(r1.status(), await r1.text()).toBe(200);
    expect(r2.status(), await r2.text()).toBe(200);
    const openRows = await request.get(`${SUPABASE_URL}/rest/v1/learning_path_progress_sessions?select=id&user_id=eq.${docenteId}&path_id=eq.${pathId}&session_end=is.null`, { headers: rest(docenteToken) });
    expect((await openRows.json()) as unknown[], 'at most one open session per (user, path)').toHaveLength(1);
    // Clean up the open session so later runs start fresh.
    await service.from('learning_path_progress_sessions').delete().eq('user_id', docenteId).eq('path_id', pathId);
  });

  test('R3-04. progress survives assignment-source changes and the API reports it', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    // R2-04 left communityManager (group-only) with ~18 credited minutes in
    // their own progress record. Adding a DIRECT assignment must not reset or
    // hide it; removing the direct row again must not either.
    const { userId: cmId } = await accessTokenFor(request, 'communityManager');
    const { data: before } = await service.from('learning_path_user_progress')
      .select('total_time_spent_minutes').eq('user_id', cmId).eq('path_id', pathId).single();
    const earned = before?.total_time_spent_minutes ?? 0;
    expect(earned, 'precondition: group-only credit exists').toBeGreaterThanOrEqual(17);

    const groupOnly = await communityManager.get(`/api/learning-paths/${pathId}/enhanced-progress`);
    expect(groupOnly.status(), await groupOnly.text()).toBe(200);
    expect(((await groupOnly.json()) as { userProgress: { totalTimeSpent: number } }).userProgress.totalTimeSpent, 'group-only: the API reports the earned minutes').toBe(earned);

    // Admin adds a direct assignment (the Codex reproduction step).
    const direct = await admin.post('/api/learning-paths/assign', { data: { pathId, userId: cmId } });
    expect(direct.status(), await direct.text()).toBe(201);
    const { data: directRow } = await service.from('learning_path_assignments')
      .select('id, total_time_spent_minutes, started_at').eq('user_id', cmId).eq('path_id', pathId).single();
    expect(directRow?.total_time_spent_minutes, 'the new direct row is seeded from the own progress (copied, not zero)').toBe(earned);
    expect(directRow?.started_at, 'started_at carried over').not.toBeNull();
    const { data: afterDirect } = await service.from('learning_path_user_progress')
      .select('total_time_spent_minutes').eq('user_id', cmId).eq('path_id', pathId).single();
    expect(afterDirect?.total_time_spent_minutes, 'own progress unchanged (not summed, not reset)').toBe(earned);
    const withDirect = await communityManager.get(`/api/learning-paths/${pathId}/enhanced-progress`);
    expect(withDirect.status(), await withDirect.text()).toBe(200);
    expect(((await withDirect.json()) as { userProgress: { totalTimeSpent: number } }).userProgress.totalTimeSpent, 'direct + group: the API still reports the earned minutes').toBe(earned);

    // Direct row removed again (group-only once more): nothing is lost.
    const { error: removeError } = await service.from('learning_path_assignments').delete().eq('id', directRow!.id);
    expect(removeError).toBeNull();
    const backToGroup = await communityManager.get(`/api/learning-paths/${pathId}/enhanced-progress`);
    expect(backToGroup.status(), await backToGroup.text()).toBe(200);
    expect(((await backToGroup.json()) as { userProgress: { totalTimeSpent: number } }).userProgress.totalTimeSpent, 'group-only again: the API reports the preserved minutes').toBe(earned);
  });

  test('R3-01. authority is re-checked on an existing session: a revoked member records nothing new', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: cmToken, userId: cmId } = await accessTokenFor(request, 'communityManager');
    const { data: membership, error: membershipError } = await service.from('user_roles')
      .select('id').eq('user_id', cmId).eq('community_id', E2E_ROLE_COMMUNITY.id).eq('is_active', true);
    expect(membershipError).toBeNull();
    expect(membership?.length ?? 0, 'precondition: an active membership of the assigned community').toBeGreaterThan(0);
    const membershipIds = (membership ?? []).map((m) => m.id as string);

    const started = await request.post(`${SUPABASE_APP_ORIGIN}/api/learning-paths/session/start`, {
      headers: { Authorization: `Bearer ${cmToken}` },
      data: { pathId, courseId: COURSE_ID, activityType: 'course_start' },
    });
    expect(started.status(), await started.text()).toBe(200);
    const { sessionId } = (await started.json()) as { sessionId: string };
    const { data: progressBefore } = await service.from('learning_path_user_progress')
      .select('completed_at, current_course_sequence, total_time_spent_minutes').eq('user_id', cmId).eq('path_id', pathId).single();

    try {
      // Membership revoked while the session stays open (Codex reproduction step 2).
      const { error: revoke } = await service.from('user_roles').update({ is_active: false }).in('id', membershipIds);
      expect(revoke).toBeNull();

      const complete = await request.post(`${SUPABASE_APP_ORIGIN}/api/learning-paths/session/activity`, {
        headers: { Authorization: `Bearer ${cmToken}` }, data: { sessionId, activityType: 'path_complete' },
      });
      expect(complete.status(), 'path_complete after revocation is a 403 denial, not 200 and not 500').toBe(403);
      const heartbeat = await request.post(`${SUPABASE_APP_ORIGIN}/api/learning-paths/session/heartbeat`, {
        headers: { Authorization: `Bearer ${cmToken}` }, data: { sessionId },
      });
      expect(heartbeat.status(), 'heartbeat after revocation is refused').toBe(403);
      const rpc = await request.post(`${SUPABASE_URL}/rest/v1/rpc/record_learning_path_activity`, {
        headers: rest(cmToken), data: { p_session_id: sessionId, p_activity_type: 'path_complete', p_course_id: null },
      });
      expect([401, 403]).toContain(rpc.status());

      const { data: progressAfter } = await service.from('learning_path_user_progress')
        .select('completed_at, current_course_sequence, total_time_spent_minutes').eq('user_id', cmId).eq('path_id', pathId).single();
      expect(progressAfter, 'the refused calls left the own progress unchanged').toEqual(progressBefore);
      const { data: sessionRow } = await service.from('learning_path_progress_sessions')
        .select('session_end, activity_type').eq('id', sessionId).single();
      expect(sessionRow?.session_end, 'the session is still open').toBeNull();
      expect(sessionRow?.activity_type).toBe('course_start');

      // Final settlement is still permitted: end closes and credits (up to the last authorized heartbeat).
      const ended = await request.post(`${SUPABASE_APP_ORIGIN}/api/learning-paths/session/end`, {
        headers: { Authorization: `Bearer ${cmToken}` }, data: { sessionId },
      });
      expect(ended.status(), await ended.text()).toBe(200);
      const { data: keep } = await service.from('learning_path_user_progress')
        .select('total_time_spent_minutes').eq('user_id', cmId).eq('path_id', pathId).single();
      expect(keep?.total_time_spent_minutes, 'earned credit is never discarded').toBeGreaterThanOrEqual(progressBefore?.total_time_spent_minutes ?? 0);
    } finally {
      await service.from('user_roles').update({ is_active: true }).in('id', membershipIds);
    }
  });

  test('R4-01. a forged heartbeat cannot extend credit past revocation: settlement closes at the server mark', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: cmToken, userId: cmId } = await accessTokenFor(request, 'communityManager');
    const { data: membership } = await service.from('user_roles')
      .select('id').eq('user_id', cmId).eq('community_id', E2E_ROLE_COMMUNITY.id).eq('is_active', true);
    const membershipIds = (membership ?? []).map((m) => m.id as string);
    expect(membershipIds.length, 'precondition: an active membership').toBeGreaterThan(0);

    const started = await request.post(`${SUPABASE_APP_ORIGIN}/api/learning-paths/session/start`, {
      headers: { Authorization: `Bearer ${cmToken}` }, data: { pathId, activityType: 'path_view' },
    });
    expect(started.status(), await started.text()).toBe(200);
    const { sessionId } = (await started.json()) as { sessionId: string };
    try {
      // The Codex reproduction: the assignee writes last_heartbeat = infinity
      // through the direct UPDATE grant (the previously deployed activity
      // route's path), the membership ends, then they end the session.
      const forge = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_progress_sessions?id=eq.${sessionId}`, {
        headers: rest(cmToken), data: { last_heartbeat: 'infinity' },
      });
      expect(forge.status(), await forge.text()).toBe(200);
      const { data: mark } = await service.from('learning_path_progress_sessions').select('last_heartbeat').eq('id', sessionId).single();
      expect(new Date(mark!.last_heartbeat as string).getTime(), 'stored as the server clock').toBeLessThanOrEqual(Date.now() + 5_000);

      const { error: revoke } = await service.from('user_roles').update({ is_active: false }).in('id', membershipIds);
      expect(revoke).toBeNull();
      const forgeAfter = await request.patch(`${SUPABASE_URL}/rest/v1/learning_path_progress_sessions?id=eq.${sessionId}`, {
        headers: rest(cmToken), data: { last_heartbeat: new Date().toISOString() },
      });
      expect([401, 403], 'after revocation the direct heartbeat write is refused').toContain(forgeAfter.status());

      const ended = await request.post(`${SUPABASE_APP_ORIGIN}/api/learning-paths/session/end`, {
        headers: { Authorization: `Bearer ${cmToken}` }, data: { sessionId },
      });
      expect(ended.status(), await ended.text()).toBe(200);
      const { data: closed } = await service.from('learning_path_progress_sessions')
        .select('session_end, last_heartbeat, time_spent_minutes, credited_minutes').eq('id', sessionId).single();
      expect(closed?.session_end, 'closed exactly at the stored server mark, not at the end request').toBe(closed?.last_heartbeat);
      expect(closed?.time_spent_minutes).toBe(0);
      expect(closed?.credited_minutes).toBe(0);
    } finally {
      await service.from('user_roles').update({ is_active: true }).in('id', membershipIds);
    }
  });

  test('R4-02. a legacy progress write on the direct assignment row is reported by the new reader', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    // The previously deployed activity route writes current_course_sequence
    // directly on the learner's own direct row (column grant). After P4 that
    // write must reach the authoritative record the new enhanced-progress
    // reader prefers (Codex R4-02: it stayed at the initialised value).
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');
    const legacy = async (sequence: number) => request.patch(
      `${SUPABASE_URL}/rest/v1/learning_path_assignments?user_id=eq.${docenteId}&path_id=eq.${pathId}`,
      { headers: rest(docenteToken), data: { current_course_sequence: sequence, last_activity_at: new Date().toISOString() } },
    );
    const currentCourse = async () => {
      const r = await docente.get(`/api/learning-paths/${pathId}/enhanced-progress`);
      expect(r.status(), await r.text()).toBe(200);
      return ((await r.json()) as { userProgress: { currentCourse: number } }).userProgress.currentCourse;
    };
    const before = await currentCourse();
    const next = before === 2 ? 1 : 2; // a value DIFFERENT from the initialised one
    const write = await legacy(next);
    expect(write.status(), await write.text()).toBe(200);
    const { data: record } = await service.from('learning_path_user_progress')
      .select('current_course_sequence').eq('user_id', docenteId).eq('path_id', pathId).single();
    expect(record?.current_course_sequence, 'the authoritative record follows the legacy write').toBe(next);
    expect(await currentCourse(), 'the new reader reports the legacy-written value').toBe(next);
    const restore = await legacy(before);
    expect(restore.status()).toBe(200);
    expect(await currentCourse()).toBe(before);
  });

  test('10. B10a surfaces through real tokens: instructors, modules, transformation access', async ({ request }) => {
    const { token: docenteToken } = await accessTokenFor(request, 'docente');
    const { token: consultorToken } = await accessTokenFor(request, 'consultorGlobal');

    const anonInstructors = await request.get(`${SUPABASE_URL}/rest/v1/instructors?select=id&id=eq.${INSTRUCTOR_ID}`, { headers: { apikey: ANON_KEY } });
    expect([401, 403]).toContain(anonInstructors.status());
    const docenteInstructors = await request.get(`${SUPABASE_URL}/rest/v1/instructors?select=id&id=eq.${INSTRUCTOR_ID}`, { headers: rest(docenteToken) });
    expect((await docenteInstructors.json()) as unknown[]).toHaveLength(1);
    const docenteWrite = await request.patch(`${SUPABASE_URL}/rest/v1/instructors?id=eq.${INSTRUCTOR_ID}`, { headers: rest(docenteToken), data: { full_name: 'hijacked' } });
    expect((await docenteWrite.json()) as unknown[], 'docente UPDATE of an instructor reaches no row').toEqual([]);

    const consultorModules = await request.get(`${SUPABASE_URL}/rest/v1/modules?select=id&id=eq.${MODULE_ID}`, { headers: rest(consultorToken) });
    expect(await consultorModules.json(), 'consultor (not enrolled, not assigned) sees no module').toEqual([]);
    const anonModules = await request.get(`${SUPABASE_URL}/rest/v1/modules?select=id&id=eq.${MODULE_ID}`, { headers: { apikey: ANON_KEY } });
    expect([401, 403]).toContain(anonModules.status());

    const consultorAccess = await request.get(`${SUPABASE_URL}/rest/v1/growth_community_transformation_access?select=id&limit=1`, { headers: rest(consultorToken) });
    expect(consultorAccess.status(), 'consultor may read transformation access').toBe(200);
    const anonAccess = await request.get(`${SUPABASE_URL}/rest/v1/growth_community_transformation_access?select=id&limit=1`, { headers: { apikey: ANON_KEY } });
    expect([401, 403]).toContain(anonAccess.status());
    const anonRate = await request.get(`${SUPABASE_URL}/rest/v1/propuesta_rate_limits?select=id&limit=1`, { headers: { apikey: ANON_KEY } });
    expect([401, 403]).toContain(anonRate.status());
  });
  test('C1. function exposure: the corrected supervisor argument is callable, a spoofed supervisor is refused, school counts are admin-only', async ({ request }) => {
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');
    const { token: adminToken } = await accessTokenFor(request, 'admin');
    const { userId: supervisorId } = await accessTokenFor(request, 'networkSupervisor');

    // The browser helper now names the real parameter (supervisor_user_id);
    // the call executes (200) and a docente naming the supervisor gets FALSE.
    const spoof = await request.post(`${SUPABASE_URL}/rest/v1/rpc/supervisor_can_access_user`, {
      headers: rest(docenteToken), data: { supervisor_user_id: supervisorId, target_user_id: docenteId },
    });
    expect(spoof.status(), await spoof.text()).toBe(200);
    expect(await spoof.json()).toBe(false);
    // The old, wrong argument name is still a 404 (no such signature) — the dead path is gone from the helper.
    const wrongArg = await request.post(`${SUPABASE_URL}/rest/v1/rpc/supervisor_can_access_user`, {
      headers: rest(docenteToken), data: { supervisor_id: supervisorId, target_user_id: docenteId },
    });
    expect(wrongArg.status()).toBe(404);

    // is_global_admin(the admin) answers FALSE to a docente (no disclosure), TRUE to the admin about themselves.
    const { userId: adminId } = await accessTokenFor(request, 'admin');
    const oracle = await request.post(`${SUPABASE_URL}/rest/v1/rpc/is_global_admin`, { headers: rest(docenteToken), data: { user_uuid: adminId } });
    expect(oracle.status()).toBe(200);
    expect(await oracle.json()).toBe(false);
    const self = await request.post(`${SUPABASE_URL}/rest/v1/rpc/is_global_admin`, { headers: rest(adminToken), data: { user_uuid: adminId } });
    expect(await self.json()).toBe(true);

    // get_school_user_counts: admin browser client answers; docente refused; backend-only endpoints are not exposed.
    const counts = await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_school_user_counts`, { headers: rest(adminToken), data: {} });
    expect(counts.status(), await counts.text()).toBe(200);
    expect(Array.isArray(await counts.json())).toBe(true);
    const refused = await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_school_user_counts`, { headers: rest(docenteToken), data: {} });
    expect([401, 403]).toContain(refused.status());
    const internal = await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_effective_user_role`, { headers: rest(docenteToken), data: { user_uuid: docenteId } });
    expect([401, 403, 404]).toContain(internal.status());
  });

  test('C2. group unassignment removes only the group source; a path-only course access ends and an independent one persists (D1)', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: cmToken, userId: cmId } = await accessTokenFor(request, 'communityManager');
    const { userId: docenteId } = await accessTokenFor(request, 'docente');

    // State from tests 2 and 6: docente holds a DIRECT assignment, the workspace holds the GROUP assignment.
    const { data: directBefore } = await service.from('learning_path_assignments').select('id').eq('path_id', pathId).eq('user_id', docenteId);
    expect(directBefore, 'docente direct assignment exists before the group removal').toHaveLength(1);
    // communityManager (group member) holds a path-created enrolment for the template course …
    const { data: cmEnrol } = await service.from('course_enrollments').select('access_origin, source_path_id').eq('user_id', cmId).eq('course_id', COURSE_ID).maybeSingle();
    expect(cmEnrol?.access_origin).toBe('learning_path');
    expect(cmEnrol?.source_path_id).toBe(pathId);
    // … plus an INDEPENDENT enrolment for the unrelated course (an explicit admin grant).
    await service.from('course_enrollments').upsert({ user_id: cmId, course_id: OTHER_COURSE_ID, enrollment_type: 'assigned', status: 'active', access_origin: 'independent' }, { onConflict: 'user_id,course_id' });
    await service.from('course_enrollments').update({ progress_percentage: 42 }).eq('user_id', cmId).eq('course_id', COURSE_ID);

    const lessonBefore = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${LESSON_ID}`, { headers: rest(cmToken) });
    expect((await lessonBefore.json()) as unknown[], 'group member reads the assigned lesson before removal').toHaveLength(1);
    const mineBefore = await communityManager.get('/api/my-courses');
    expect(mineBefore.status()).toBe(200);
    expect(((await mineBefore.json()) as Array<{ id: string }>).map((c) => c.id)).toEqual(expect.arrayContaining([COURSE_ID, OTHER_COURSE_ID]));

    // Remove ONLY the group source.
    const byConsultor = await consultor.delete('/api/learning-paths/unassign', { data: { pathId, groupIds: [WORKSPACE_ID] } });
    expect(byConsultor.status()).toBe(403);
    const removed = await admin.delete('/api/learning-paths/unassign', { data: { pathId, groupIds: [WORKSPACE_ID] } });
    expect(removed.status(), await removed.text()).toBe(200);
    expect(await removed.json()).toMatchObject({ unassigned_count: 1, removed: { directUserIds: [], groupIds: [WORKSPACE_ID] } });

    // The independent direct assignment of the docente survived (the audit finding).
    const { data: directAfter } = await service.from('learning_path_assignments').select('id').eq('path_id', pathId).eq('user_id', docenteId);
    expect(directAfter, 'docente direct assignment survives the group removal').toHaveLength(1);
    const docentePaths = await docente.get('/api/learning-paths/my-paths');
    expect(((await docentePaths.json()) as Array<{ id: string }>).map((p) => p.id)).toContain(pathId);

    // D1 for the group member: the path is gone, the path-only course access ended, the independent one persists, history kept.
    const cmPaths = await communityManager.get('/api/learning-paths/my-paths');
    expect(((await cmPaths.json()) as Array<{ id: string }>).map((p) => p.id)).not.toContain(pathId);
    const lessonAfter = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${LESSON_ID}`, { headers: rest(cmToken) });
    expect(await lessonAfter.json(), 'the lesson is no longer readable').toEqual([]);
    const courseAfter = await request.get(`${SUPABASE_URL}/rest/v1/courses?select=id&id=eq.${COURSE_ID}`, { headers: rest(cmToken) });
    expect(await courseAfter.json(), 'the course row is no longer readable').toEqual([]);
    const otherCourse = await request.get(`${SUPABASE_URL}/rest/v1/courses?select=id&id=eq.${OTHER_COURSE_ID}`, { headers: rest(cmToken) });
    expect((await otherCourse.json()) as unknown[], 'the independent course stays readable').toHaveLength(1);
    const mineAfter = await communityManager.get('/api/my-courses');
    const mineIds = ((await mineAfter.json()) as Array<{ id: string }>).map((c) => c.id);
    expect(mineIds).not.toContain(COURSE_ID);
    expect(mineIds).toContain(OTHER_COURSE_ID);
    const { data: kept } = await service.from('course_enrollments').select('progress_percentage, access_origin').eq('user_id', cmId).eq('course_id', COURSE_ID).maybeSingle();
    expect(kept, 'the enrolment row and its progress are preserved').toMatchObject({ progress_percentage: 42, access_origin: 'learning_path' });
    // A learner cannot promote their own row.
    const promote = await request.patch(`${SUPABASE_URL}/rest/v1/course_enrollments?user_id=eq.${cmId}&course_id=eq.${COURSE_ID}`, { headers: rest(cmToken), data: { access_origin: 'independent' } });
    expect([401, 403]).toContain(promote.status());

    // Reassignment restores access without duplicating the row; a repeated unassign reports 0.
    const again = await admin.post('/api/learning-paths/assign', { data: { pathId, groupId: WORKSPACE_ID } });
    expect(again.status(), await again.text()).toBe(201);
    const lessonRestored = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${LESSON_ID}`, { headers: rest(cmToken) });
    expect((await lessonRestored.json()) as unknown[]).toHaveLength(1);
    const { data: rows } = await service.from('course_enrollments').select('id').eq('user_id', cmId).eq('course_id', COURSE_ID);
    expect(rows).toHaveLength(1);
    const removedAgain = await admin.delete('/api/learning-paths/unassign', { data: { pathId, groupIds: [WORKSPACE_ID] } });
    expect(await removedAgain.json()).toMatchObject({ unassigned_count: 1 });
    const retry = await admin.delete('/api/learning-paths/unassign', { data: { pathId, groupIds: [WORKSPACE_ID] } });
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({ unassigned_count: 0, removed: { notFound: { groupIds: [WORKSPACE_ID] } } });
  });

  test('C3. reporting: live views for the admin, learning-path half admin-only in the overview, retired refresh job', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: adminToken } = await accessTokenFor(request, 'admin');
    const { token: consultorToken } = await accessTokenFor(request, 'consultorGlobal');
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');

    const overview = await admin.get('/api/learning-paths/analytics');
    expect(overview.status(), await overview.text()).toBe(200);
    const body = (await overview.json()) as any;
    expect(body.unavailable).toContain('engagementScore');
    const mine = body.pathPerformance.find((p: any) => p.pathId === pathId);
    expect(mine, 'the template appears in the live performance view').toBeTruthy();
    expect(mine.engagementScore).toBeNull();
    expect(mine.totalUsers).toBeGreaterThanOrEqual(1);
    const specific = await admin.get(`/api/learning-paths/analytics?pathId=${pathId}`);
    expect(specific.status(), await specific.text()).toBe(200);
    expect(((await specific.json()) as any).userAnalytics.atRiskUsers).toBeNull();

    // Direct PostgREST reads: the docente sees only their own summary row; nothing from the cross-user views.
    const own = await request.get(`${SUPABASE_URL}/rest/v1/user_learning_path_summary?select=user_id,path_id`, { headers: rest(docenteToken) });
    expect(own.status(), await own.text()).toBe(200);
    const ownRows = (await own.json()) as Array<{ user_id: string }>;
    expect(ownRows.length).toBeGreaterThanOrEqual(1);
    expect(ownRows.every((r) => r.user_id === docenteId)).toBe(true);
    const perf = await request.get(`${SUPABASE_URL}/rest/v1/learning_path_performance_summary?select=path_id`, { headers: rest(docenteToken) });
    expect(perf.status()).toBe(200);
    expect(await perf.json()).toEqual([]);
    const anon = await request.get(`${SUPABASE_URL}/rest/v1/learning_path_performance_summary?select=path_id`, { headers: { apikey: ANON_KEY } });
    expect([401, 403]).toContain(anon.status());
    const adminPerf = await request.get(`${SUPABASE_URL}/rest/v1/learning_path_performance_summary?select=path_id&path_id=eq.${pathId}`, { headers: rest(adminToken) });
    expect((await adminPerf.json()) as unknown[]).toHaveLength(1);

    // Overview report: the consultor keeps the course half, the learning-path half is admin-only (null, never 0).
    const consultorOverview = await request.get('/api/reports/overview', { headers: { Authorization: `Bearer ${consultorToken}` } });
    expect(consultorOverview.status(), await consultorOverview.text()).toBe(200);
    const co = (await consultorOverview.json()) as any;
    expect(co.learning_path_reporting).toBe('admin_only');
    expect(co.summary.total_time_spent).toBeNull();
    const adminOverview = await request.get('/api/reports/overview', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(adminOverview.status()).toBe(200);
    expect(((await adminOverview.json()) as any).learning_path_reporting).toBe('included');

    // The refresh job is retired: authentication first, then 410 with no work.
    const retired = await request.post('/api/cron/update-learning-path-summaries', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(retired.status()).toBe(410);
    expect(((await retired.json()) as any).retired).toBe(true);
    const retiredUnauth = await request.post('/api/cron/update-learning-path-summaries', { headers: { Authorization: 'Bearer not-the-secret' } });
    expect(retiredUnauth.status()).toBe(401);
  });

  test('C4. maintenance: an idle run reports both stages; an old closed session is settled, its day is kept as reporting evidence, and the row is archived', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { userId: docenteId } = await accessTokenFor(request, 'docente');

    const idle = await request.post('/api/cron/cleanup-learning-path-sessions', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(idle.status(), await idle.text()).toBe(200);
    const idleBody = (await idle.json()) as any;
    expect(idleBody.ok).toBe(true);
    expect(idleBody.settlement).toMatchObject({ ok: true });
    expect(idleBody.retention).toMatchObject({ ok: true, hasMore: false });
    expect(Array.isArray(idleBody.errors) && idleBody.errors.length === 0).toBe(true);

    // A closed-but-unsettled session from 10 days ago (the shape the old maintenance route left behind).
    const start = new Date(Date.now() - 10 * 24 * 60 * 60_000);
    const end = new Date(start.getTime() + 25 * 60_000);
    const { data: old, error: oldErr } = await service.from('learning_path_progress_sessions').insert({
      user_id: docenteId, path_id: pathId, activity_type: 'path_view',
      session_start: start.toISOString(), session_end: end.toISOString(), time_spent_minutes: 25, last_heartbeat: end.toISOString(),
    }).select('id').single();
    expect(oldErr).toBeNull();

    const run = await request.post('/api/cron/cleanup-learning-path-sessions', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(run.status(), await run.text()).toBe(200);
    const runBody = (await run.json()) as any;
    expect(runBody.settlement.settled).toBeGreaterThanOrEqual(1);
    expect(runBody.retention.archived).toBeGreaterThanOrEqual(1);

    const { data: gone } = await service.from('learning_path_progress_sessions').select('id').eq('id', old!.id);
    expect(gone, 'the old settled session row was archived').toEqual([]);
    const { data: grain } = await service.from('learning_path_daily_user_activity').select('sessions_count, credited_minutes').eq('user_id', docenteId).eq('path_id', pathId);
    expect(grain!.length, 'its day survives as reporting evidence').toBeGreaterThanOrEqual(1);
    expect(grain!.reduce((s, r: any) => s + r.credited_minutes, 0)).toBeGreaterThanOrEqual(25);
    const { data: progress } = await service.from('learning_path_user_progress').select('total_time_spent_minutes').eq('user_id', docenteId).eq('path_id', pathId).maybeSingle();
    expect(progress!.total_time_spent_minutes, 'credit survives the archival').toBeGreaterThanOrEqual(25);
  });

  // ------------------------------------------------------------------------
  // Closure review 2026-09-08 (rls-c-closure-review-2026-09-08.md) — the four
  // findings, exercised with real tokens, the real API and the real browser.
  // ------------------------------------------------------------------------

  test('C-R1-01. a learner cannot move an enrolment to another course nor forge its provenance through PostgREST; own progress still writes; the target stays unreadable', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: cmToken, userId: cmId } = await accessTokenFor(request, 'communityManager');
    const { userId: adminId } = await accessTokenFor(request, 'admin');
    // State from C2: the community manager holds an INDEPENDENT row for OTHER_COURSE and a lapsed path-origin row for COURSE.
    const { data: rows } = await service.from('course_enrollments').select('course_id, access_origin').eq('user_id', cmId).in('course_id', [COURSE_ID, OTHER_COURSE_ID]);
    expect(rows?.find((r) => r.course_id === OTHER_COURSE_ID)?.access_origin).toBe('independent');
    const before = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${LESSON_ID}`, { headers: rest(cmToken) });
    expect(await before.json(), 'the template lesson is not readable before the attack (group source removed in C2)').toEqual([]);

    const patch = (filter: string, body: unknown) =>
      request.patch(`${SUPABASE_URL}/rest/v1/course_enrollments?user_id=eq.${cmId}&${filter}`, { headers: rest(cmToken), data: body });
    const move = await patch(`course_id=eq.${OTHER_COURSE_ID}`, { course_id: COURSE_ID });
    expect([401, 403], `re-association refused: ${await move.text()}`).toContain(move.status());
    const forgeOrigin = await patch(`course_id=eq.${COURSE_ID}`, { access_origin: 'independent', source_path_id: null });
    expect([401, 403]).toContain(forgeOrigin.status());
    const forgeGrant = await patch(`course_id=eq.${COURSE_ID}`, { enrolled_by: adminId, enrollment_type: 'bulk_assigned' });
    expect([401, 403], 'grant provenance (who / how) is refused by the guard trigger').toContain(forgeGrant.status());
    const multi = await patch(`course_id=eq.${OTHER_COURSE_ID}`, { course_id: COURSE_ID, access_origin: 'independent', progress_percentage: 1 });
    expect([401, 403]).toContain(multi.status());
    const progress = await patch(`course_id=eq.${OTHER_COURSE_ID}`, { progress_percentage: 61 });
    expect([200, 204], `own progress write still works: ${await progress.text()}`).toContain(progress.status());

    const after = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${LESSON_ID}`, { headers: rest(cmToken) });
    expect(await after.json(), 'the target lesson is still unreadable after every refused attempt').toEqual([]);
    const { data: kept } = await service.from('course_enrollments').select('course_id, access_origin, progress_percentage, enrollment_type').eq('user_id', cmId).eq('course_id', OTHER_COURSE_ID).maybeSingle();
    expect(kept).toMatchObject({ course_id: OTHER_COURSE_ID, access_origin: 'independent', progress_percentage: 61, enrollment_type: 'assigned' });
  });

  test('C-R1-03. an independent grant needs the authoritative admin role: a self-edited metadata role is refused, the admin grant is atomic and idempotent', async ({ request }) => {
    test.skip(!pathId, 'template was not created');
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');
    const { token: adminToken } = await accessTokenFor(request, 'admin');

    // The attack Codex described: a verified ordinary user edits their OWN user_metadata (self-service GoTrue endpoint) …
    const selfEdit = await request.put(`${SUPABASE_URL}/auth/v1/user`, { headers: rest(docenteToken), data: { data: { role: 'admin', roles: ['admin'] } } });
    expect(selfEdit.status(), await selfEdit.text()).toBe(200);
    expect(((await selfEdit.json()) as { user_metadata: { role?: string } }).user_metadata.role).toBe('admin');
    try {
      const { token: forgedToken } = await accessTokenFor(request, 'docente'); // a fresh token carrying the edited metadata
      const forged = await request.post('/api/admin/course-assignments', { headers: { Authorization: `Bearer ${forgedToken}` }, data: { courseId: OTHER_COURSE_ID, teacherIds: [docenteId] } });
      expect(forged.status(), `metadata role refused: ${await forged.text()}`).toBe(403);
      const { data: noAssignment } = await service.from('course_assignments').select('id').eq('course_id', OTHER_COURSE_ID).eq('teacher_id', docenteId);
      expect(noAssignment).toEqual([]);
      const { data: noEnrolment } = await service.from('course_enrollments').select('id').eq('course_id', OTHER_COURSE_ID).eq('user_id', docenteId);
      expect(noEnrolment, 'no enrolment was created for the forged caller').toEqual([]);
      const viaCookie = await docente.post('/api/admin/course-assignments', { data: { courseId: OTHER_COURSE_ID, teacherIds: [docenteId] } });
      expect(viaCookie.status()).toBe(403);
    } finally {
      const restore = await request.put(`${SUPABASE_URL}/auth/v1/user`, { headers: rest(docenteToken), data: { data: { role: null, roles: null } } });
      expect(restore.status()).toBe(200);
    }

    // The real admin (cookie session and Bearer token behave the same): atomic grant, provenance independent.
    const grant = await admin.post('/api/admin/course-assignments', { data: { courseId: OTHER_COURSE_ID, teacherIds: [docenteId, docenteId] } });
    expect(grant.status(), await grant.text()).toBe(200);
    const grantBody = (await grant.json()) as { grant: Record<string, unknown> };
    expect(grantBody.grant).toMatchObject({ assignments_created: 1, assignments_existing: 0, enrollments_created: 1, newly_assigned_user_ids: [docenteId] });
    const { data: enrolment } = await service.from('course_enrollments').select('access_origin, source_path_id, enrollment_type').eq('course_id', OTHER_COURSE_ID).eq('user_id', docenteId).maybeSingle();
    expect(enrolment).toMatchObject({ access_origin: 'independent', source_path_id: null, enrollment_type: 'assigned' });
    const lesson = await request.get(`${SUPABASE_URL}/rest/v1/lessons?select=id&id=eq.${OTHER_LESSON_ID}`, { headers: rest(docenteToken) });
    expect((await lesson.json()) as unknown[], 'the recipient reads the granted course content').toHaveLength(1);
    // progress written by the learner survives a repeated grant
    await request.patch(`${SUPABASE_URL}/rest/v1/course_enrollments?user_id=eq.${docenteId}&course_id=eq.${OTHER_COURSE_ID}`, { headers: rest(docenteToken), data: { progress_percentage: 35 } });
    const retry = await request.post('/api/admin/course-assignments', { headers: { Authorization: `Bearer ${adminToken}` }, data: { courseId: OTHER_COURSE_ID, teacherIds: [docenteId] } });
    expect(retry.status(), await retry.text()).toBe(200);
    expect(((await retry.json()) as { grant: Record<string, unknown> }).grant).toMatchObject({ assignments_created: 0, assignments_existing: 1, enrollments_created: 0, enrollments_unchanged: 1 });
    const { data: preserved } = await service.from('course_enrollments').select('progress_percentage, access_origin').eq('course_id', OTHER_COURSE_ID).eq('user_id', docenteId).maybeSingle();
    expect(preserved).toMatchObject({ progress_percentage: 35, access_origin: 'independent' });
    // promotion of an existing path-origin row (the community manager's COURSE row from C2)
    const { userId: cmId } = await accessTokenFor(request, 'communityManager');
    const promote = await admin.post('/api/admin/course-assignments', { data: { courseId: COURSE_ID, teacherIds: [cmId] } });
    expect(promote.status(), await promote.text()).toBe(200);
    expect(((await promote.json()) as { grant: Record<string, unknown> }).grant).toMatchObject({ enrollments_promoted: 1 });
    const { data: promoted } = await service.from('course_enrollments').select('access_origin, progress_percentage').eq('course_id', COURSE_ID).eq('user_id', cmId).maybeSingle();
    expect(promoted, 'promoted to independent, progress kept').toMatchObject({ access_origin: 'independent', progress_percentage: 42 });
    // a consultor is not the literal admin
    const byConsultor = await consultor.post('/api/admin/course-assignments', { data: { courseId: OTHER_COURSE_ID, teacherIds: [docenteId] } });
    expect(byConsultor.status()).toBe(403);
    // validation
    const bad = await admin.post('/api/admin/course-assignments', { data: { courseId: OTHER_COURSE_ID, teacherIds: ['not-a-uuid'] } });
    expect(bad.status()).toBe(400);
    await service.from('course_assignments').delete().eq('course_id', COURSE_ID).eq('teacher_id', cmId);
  });

  test('C-R1-02. a flagged account reads nothing through the owner views with a real token; the API holds the admin too; completing the forced change through the established flow restores the reads', async ({ request, browser, baseURL }) => {
    test.skip(!pathId, 'template was not created');
    const base = baseURL ?? 'http://localhost:3000';
    const { token: adminToken, userId: adminId } = await accessTokenFor(request, 'admin');
    const { token: docenteToken, userId: docenteId } = await accessTokenFor(request, 'docente');
    const perf = () => request.get(`${SUPABASE_URL}/rest/v1/learning_path_performance_summary?select=path_id&path_id=eq.${pathId}`, { headers: rest(adminToken) });
    const ownSummary = () => request.get(`${SUPABASE_URL}/rest/v1/user_learning_path_summary?select=user_id&path_id=eq.${pathId}`, { headers: rest(docenteToken) });
    expect((await (await perf()).json()) as unknown[], 'control: the unflagged admin reads the row').toHaveLength(1);
    expect(((await (await ownSummary()).json()) as unknown[]).length, 'control: the unflagged learner reads their own row').toBeGreaterThanOrEqual(1);

    const flag = async (id: string, value: boolean) => {
      const { error } = await service.from('profiles').update({ must_change_password: value }).eq('id', id);
      expect(error).toBeNull();
    };
    await flag(adminId, true);
    await flag(docenteId, true);
    try {
      // Through PostgREST the request-level gate (migration 20260819120000) refuses a flagged account outright
      // (42501 PASSWORD_CHANGE_REQUIRED); the in-view predicate closes the direct database path (pgTAP 079 §8).
      // Either way: nothing is read.
      const readsNothing = async (r: { status(): number; json(): Promise<unknown> }, label: string) => {
        const body = (await r.json()) as unknown;
        const refused = [401, 403].includes(r.status()) && (body as { message?: string })?.message === 'PASSWORD_CHANGE_REQUIRED';
        const empty = r.status() === 200 && Array.isArray(body) && body.length === 0;
        expect(refused || empty, `${label}: ${r.status()} ${JSON.stringify(body)}`).toBe(true);
      };
      for (const view of ['learning_path_performance_summary', 'learning_path_daily_summary', 'learning_path_monthly_summary', 'learning_path_assigned_users', 'user_learning_path_summary']) {
        await readsNothing(await request.get(`${SUPABASE_URL}/rest/v1/${view}?select=path_id&path_id=eq.${pathId}`, { headers: rest(adminToken) }), `flagged admin on ${view}`);
      }
      await readsNothing(await ownSummary(), 'flagged learner on their own summary row');
      await readsNothing(await request.post(`${SUPABASE_URL}/rest/v1/rpc/auth_accessible_course_ids`, { headers: rest(docenteToken), data: {} }), 'flagged learner on the definer reader');
      const heldApi = await request.post('/api/admin/course-assignments', { headers: { Authorization: `Bearer ${adminToken}` }, data: { courseId: OTHER_COURSE_ID, teacherIds: [docenteId] } });
      expect(heldApi.status()).toBe(403);
      expect(((await heldApi.json()) as { code: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');
      const heldAnalytics = await admin.get('/api/learning-paths/analytics');
      expect(heldAnalytics.status(), 'the cookie session is held by the middleware gate').toBe(403);

      // The established way out for the admin: the forced-change completion endpoint (cookie session), then the reads return.
      const completed = await admin.post('/api/auth/force-password-change', { data: { newPassword: 'ClausuraNueva2026' } });
      expect(completed.status(), await completed.text()).toBe(200);
      const { data: cleared } = await service.from('profiles').select('must_change_password').eq('id', adminId).maybeSingle();
      expect(cleared?.must_change_password).toBe(false);
      expect((await (await perf()).json()) as unknown[], 'after the completed change the admin reads the row again (same token)').toHaveLength(1);
    } finally {
      await flag(docenteId, false);
      // test hygiene: the seeded credential is restored on the service client; a fresh cookie session is minted for the remaining hooks
      await service.auth.admin.updateUserById(adminId, { password: E2E_USERS.admin.password });
      await flag(adminId, false);
      await admin.dispose();
      admin = await apiContextFor(browser, 'admin', base);
    }
    expect(((await (await ownSummary()).json()) as unknown[]).length, 'the unflagged learner reads their own row again').toBeGreaterThanOrEqual(1);
  });

  test('C-R1-04. the admin reports tab renders learning-path analytics in the browser: live data, the empty-population contract, and the non-admin experience', async ({ browser }) => {
    const adminState = await ensureStorageState(browser, 'admin');
    const ctx = await browser.newContext({ storageState: adminState });
    try {
      const page = await ctx.newPage();
      await page.goto('/reports');
      await page.getByRole('button', { name: /Rutas de Aprendizaje/ }).click();
      const tab = page.getByTestId('reports-learning-paths-tab');
      await expect(tab).toBeVisible();
      await expect(page.getByTestId('lp-analytics-summary')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('lp-analytics-avg-rate')).toHaveText(/^(\d+\.\d%|No disponible)$/);
      await expect(page.getByTestId('lp-analytics-unavailable-note')).toContainText('engagement');
      await expect(page.getByTestId('lp-analytics-error')).toHaveCount(0);
      await expect(page.getByTestId('lp-analytics-denied')).toHaveCount(0);

      // The empty-population contract, exactly as the API emits it (the shape pinned by analytics-contract.test.ts), through the real page.
      await page.route('**/api/learning-paths/analytics**', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: { totalPaths: 0, totalAssignedUsers: 0, totalCompletedUsers: 0, averageCompletionRate: null, totalTimeSpentHours: 0 },
          recentActivity: { timeframe: '30 days', totalSessions: 0, activeUserDays: 0 },
          completionTrends: [], pathPerformance: [], lowPerformingPaths: [],
          unavailable: ['engagementScore', 'atRiskUsers', 'completionRate(daily)', 'avgCompletionRate(monthly)'],
        }),
      }));
      await page.reload();
      await page.getByRole('button', { name: /Rutas de Aprendizaje/ }).click();
      await expect(page.getByTestId('lp-analytics-avg-rate')).toHaveText('No disponible', { timeout: 30_000 });
      await expect(page.getByTestId('lp-analytics-empty')).toContainText('Sin rutas de aprendizaje');
      await expect(page.getByTestId('lp-analytics-error')).toHaveCount(0);
      // and a failed view query is its own state (502 contract)
      await page.unroute('**/api/learning-paths/analytics**');
      await page.route('**/api/learning-paths/analytics**', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Learning path analytics are temporarily unavailable', relation: 'learning_path_performance_summary' }) }));
      await page.reload();
      await page.getByRole('button', { name: /Rutas de Aprendizaje/ }).click();
      await expect(page.getByTestId('lp-analytics-error')).toContainText('learning_path_performance_summary', { timeout: 30_000 });
    } finally {
      await ctx.close();
    }

    // A reporting role that is not the literal admin: the tab explains instead of requesting.
    const consultorState = await ensureStorageState(browser, 'consultorGlobal');
    const ctx2 = await browser.newContext({ storageState: consultorState });
    try {
      const page = await ctx2.newPage();
      await page.goto('/reports');
      await page.getByRole('button', { name: /Rutas de Aprendizaje/ }).click();
      await expect(page.getByTestId('lp-analytics-admin-only')).toContainText('solo para administradores', { timeout: 30_000 });
      await expect(page.getByTestId('lp-analytics-summary')).toHaveCount(0);
    } finally {
      await ctx2.close();
    }
  });

  test('C-R2-01. independent batch grants survive path loss through admin and consultor application routes in both orderings', async ({ request }) => {
    expect(pathId, 'earlier template creation must have succeeded').toBeTruthy();
    const learner = await accessTokenFor(request, 'communityManager');
    const consultorActor = await accessTokenFor(request, 'consultorGlobal');
    const adminActor = await accessTokenFor(request, 'admin');
    const clear = async () => {
      for (const table of ['course_assignments', 'course_enrollments']) {
        const { error } = await service.from(table).delete().eq('course_id', COURSE_ID).eq(table === 'course_assignments' ? 'teacher_id' : 'user_id', learner.userId);
        expect(error).toBeNull();
      }
      const { error } = await service.from('learning_path_assignments').delete().eq('path_id', pathId).eq('user_id', learner.userId);
      expect(error).toBeNull();
      await admin.delete('/api/learning-paths/unassign', { data: { pathId, groupIds: [WORKSPACE_ID] } });
    };
    const readAccess = async () => {
      for (const relation of [`courses?select=id&id=eq.${COURSE_ID}`, `modules?select=id&id=eq.${MODULE_ID}`, `lessons?select=id&id=eq.${LESSON_ID}`]) {
        const res = await restGet(request, relation, learner.token);
        expect(res.status()).toBe(200);
        expect(await res.json(), relation).toHaveLength(1);
      }
      const ids = await request.post(`${SUPABASE_URL}/rest/v1/rpc/auth_accessible_course_ids`, { headers: rest(learner.token), data: {} });
      expect(await ids.json()).toContain(COURSE_ID);
      const mine = await communityManager.get('/api/my-courses');
      expect(mine.status()).toBe(200);
      expect(((await mine.json()) as Array<{ id: string }>).map(c => c.id)).toContain(COURSE_ID);
    };
    for (const actor of ['admin', 'consultor'] as const) {
      for (const pathFirst of [true, false]) {
        await clear();
        const assignPath = () => admin.post('/api/learning-paths/assign', { data: { pathId, userId: learner.userId } });
        // Cookie session for admin; real Bearer session for consultor.
        const grant = () => actor === 'admin'
          ? admin.post('/api/courses/batch-assign', { data: { courseId: COURSE_ID, userIds: [learner.userId, learner.userId] } })
          : request.post('/api/courses/batch-assign', { headers: { Authorization: `Bearer ${consultorActor.token}` }, data: { courseId: COURSE_ID, userIds: [learner.userId, learner.userId] } });
        if (pathFirst) expect((await assignPath()).status()).toBe(201);
        const response = await grant();
        expect(response.status(), await response.text()).toBe(201);
        expect(await response.json()).toMatchObject({ assignments_created: 1, enrollments_created: pathFirst ? 0 : 1, enrollments_promoted: pathFirst ? 1 : 0 });
        if (!pathFirst) expect((await assignPath()).status()).toBe(201);
        const { error: progressError } = await service.from('course_enrollments').update({ progress_percentage: 47, total_time_spent_seconds: 321 }).eq('course_id', COURSE_ID).eq('user_id', learner.userId);
        expect(progressError).toBeNull();
        const { data: before } = await service.from('course_enrollments').select('*').eq('course_id', COURSE_ID).eq('user_id', learner.userId).single();
        const removed = await admin.delete('/api/learning-paths/unassign', { data: { pathId, userIds: [learner.userId] } });
        expect(removed.status()).toBe(200);
        await readAccess();
        const retry = await grant();
        expect(retry.status()).toBe(201);
        expect(await retry.json()).toMatchObject({ assignments_created: 0, assignments_skipped: 1, enrollments_created: 0, enrollments_promoted: 0, enrollments_unchanged: 1 });
        const { data: after } = await service.from('course_enrollments').select('*').eq('course_id', COURSE_ID).eq('user_id', learner.userId).single();
        expect(after, `${actor}, pathFirst=${pathFirst}: history and provenance unchanged`).toEqual(before);
        // Previously the early skip left this explicit assignment ineffective.
        const { error: deleteError } = await service.from('course_enrollments').delete().eq('course_id', COURSE_ID).eq('user_id', learner.userId);
        expect(deleteError).toBeNull();
        const repair = await grant();
        expect(repair.status()).toBe(201);
        expect(await repair.json()).toMatchObject({ assignments_created: 0, assignments_skipped: 1, enrollments_created: 1 });
        await readAccess();
      }
    }
    // No claim of success for bad recipients; no direct learner source forgery.
    const failed = await admin.post('/api/courses/batch-assign', { data: { courseId: COURSE_ID, userIds: ['ffffffff-ffff-4fff-8fff-ffffffffffff'] } });
    expect(failed.status()).toBe(500);
    const forged = await request.post(`${SUPABASE_URL}/rest/v1/course_assignments`, { headers: rest(learner.token), data: { course_id: OTHER_COURSE_ID, teacher_id: learner.userId, assigned_by: learner.userId } });
    expect([401, 403]).toContain(forged.status());
    for (const actor of [adminActor, consultorActor]) {
      const { error } = await service.from('profiles').update({ must_change_password: true }).eq('id', actor.userId);
      expect(error).toBeNull();
      try {
        const held = await request.post('/api/courses/batch-assign', { headers: { Authorization: `Bearer ${actor.token}` }, data: { courseId: COURSE_ID, userIds: [learner.userId] } });
        expect(held.status()).toBe(403);
      } finally {
        const { error: restoreError } = await service.from('profiles').update({ must_change_password: false }).eq('id', actor.userId);
        expect(restoreError).toBeNull();
      }
    }
    await clear();
  });

});

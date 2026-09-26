import { test, expect, request, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loginViaUi, E2E_SCHOOL_SECONDARY, type E2eFixtureUser } from './helpers/auth';

/**
 * SM-22 (W-B3a-01) — meeting agreements and tasks persist for a verified
 * editor and stay closed to an attendee whose co_editor row has no grant
 * provenance (a historical self-grant).
 *
 * Standalone: it creates its own synthetic community, accounts and meeting with
 * the service role, writes every row id to a manifest before removing them by
 * id, and touches no seeded row. GoTrue's own audit rows for those accounts
 * (sign-up, login, deletion) are collected by exact id once the accounts are
 * gone, recorded, removed by id, and any residue for the run's stamp fails the run.
 *
 * It writes only to the dedicated SM-22 stack (API 127.0.0.1:54821, DB
 * 127.0.0.1:54822). The target comes from the process environment only, never
 * from an .env file, and is verified before any client exists: the exact pair,
 * the Docker containers of E2E_SUPABASE_STACK_ID publishing both ports, and the
 * app server's bundled Supabase URL.
 */

const DEDICATED_API = 'http://127.0.0.1:54821';
const DEDICATED_DB = '127.0.0.1:54822';

type TargetEnv = Partial<Record<'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_DB_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'E2E_SUPABASE_STACK_ID', string>>;

function targetProblem(env: TargetEnv): string | null {
  const missing = (['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_SUPABASE_STACK_ID'] as const)
    .filter((key) => !env[key]);
  if (missing.length) return `missing ${missing.join(', ')}`;
  let api: URL;
  let db: URL;
  try {
    api = new URL(env.NEXT_PUBLIC_SUPABASE_URL!);
    db = new URL(env.SUPABASE_DB_URL!);
  } catch {
    return 'unparseable Supabase URL';
  }
  if (api.origin !== DEDICATED_API) return `API ${api.host} is not the dedicated ${new URL(DEDICATED_API).host}`;
  if (db.host !== DEDICATED_DB) return `DB ${db.host} is not the dedicated ${DEDICATED_DB}`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(env.E2E_SUPABASE_STACK_ID!)) return 'invalid E2E_SUPABASE_STACK_ID';
  return null;
}

/** `portOf(container, internalPort)` returns `docker port` output; it throws when the container is absent. */
function stackIdentityProblem(stackId: string, portOf: (container: string, internal: string) => string): string | null {
  const expected: [string, string, string][] = [
    [`supabase_kong_${stackId}`, '8000/tcp', new URL(DEDICATED_API).port],
    [`supabase_db_${stackId}`, '5432/tcp', DEDICATED_DB.split(':')[1]],
  ];
  for (const [container, internal, port] of expected) {
    let published: string;
    try {
      published = portOf(container, internal);
    } catch {
      return `container ${container} not found`;
    }
    if (!published.split('\n').some((line) => line.trim().endsWith(`:${port}`))) {
      return `${container} does not publish ${port}`;
    }
  }
  return null;
}

/**
 * Next inlines NEXT_PUBLIC_SUPABASE_URL into the client bundle, and no source
 * file names the dedicated port, so the URL appears only when the running app
 * server was started with the dedicated target (a reused or stale server fails).
 * Other loopback URLs are static literals (lib/utils/environmentMonitor.ts).
 */
function bundleTargetProblem(bundle: string): string | null {
  return /http:\/\/127\.0\.0\.1:54821(?!\d)/.test(bundle) ? null : `app server bundle does not target ${DEDICATED_API}`;
}

async function appBundle(): Promise<string> {
  const app = await request.newContext({ baseURL: process.env.E2E_APP_ORIGIN });
  const html = await (await app.get('/login')).text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const bodies = await Promise.all(scripts.map(async (src) => (await app.get(src)).text()));
  await app.dispose();
  return [html, ...bodies].join('\n');
}

let admin: SupabaseClient | null = null;
let dbUrl: string | null = null;

async function verifyTargetAndConnect() {
  const env = process.env as TargetEnv;
  const problem = targetProblem(env)
    ?? stackIdentityProblem(env.E2E_SUPABASE_STACK_ID!, (container, internal) =>
      execFileSync('docker', ['port', container, internal], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    ?? bundleTargetProblem(await appBundle());
  if (problem) throw new Error(`[meeting-agreements-tasks] refusing write target: ${problem}.`);
  dbUrl = env.SUPABASE_DB_URL!;
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Takes a thunk so no request starts before the target is verified. */
async function must<T>(label: string, run: (db: SupabaseClient) => PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  if (!admin) throw new Error(`[SM-22] ${label}: write target not verified`);
  const { data, error } = await run(admin);
  if (error) throw new Error(`[SM-22] ${label}: ${error.message}`);
  return data;
}

/** GoTrue's audit table is outside the API schemas; one query on the verified DB target. */
async function dbQuery<T>(label: string, sql: string, params: unknown[]): Promise<T[]> {
  if (!dbUrl) throw new Error(`[SM-22] ${label}: write target not verified`);
  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

const STAMP = Date.now().toString(36);
const manifest = {
  supabase: new URL(DEDICATED_API).host,
  stamp: STAMP,
  accounts: [] as string[],
  community: '',
  workspace: '',
  userRoles: [] as string[],
  meetings: [] as string[],
  attendees: [] as string[],
  agreements: [] as string[],
  tasks: [] as string[],
  providerAudit: [] as string[],
  cleanup: {} as Record<string, number>,
  residue: {} as Record<string, number>,
};

function saveManifest() {
  if (process.env.UI_EVIDENCE_DIR) {
    writeFileSync(join(process.env.UI_EVIDENCE_DIR, 'sm22-fixtures.json'), JSON.stringify(manifest, null, 2));
  }
}
const users: Record<'editor' | 'legacy', E2eFixtureUser & { id: string }> = {} as never;

async function createAccount(label: 'editor' | 'legacy', roleType: string) {
  const email = `e2e-sm22-${label}-${STAMP}@example.com`;
  const password = `Sm22${label[0].toUpperCase()}${label.slice(1)}Sintetico2026`;
  const created = await must('createUser', (db) => db.auth.admin.createUser({ email, password, email_confirm: true }));
  const id = created.user!.id;
  manifest.accounts.push(id);
  const firstName = 'Sintetico';
  const lastName = label === 'editor' ? 'Editor SM22' : 'Coeditor Legado SM22';
  await must('profile', (db) => db.from('profiles').upsert({
    id, email, first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}`,
    approval_status: 'approved', must_change_password: false, school_id: E2E_SCHOOL_SECONDARY.id,
  }, { onConflict: 'id' }));
  const role = await must('role', (db) => db.from('user_roles').insert({
    user_id: id, role_type: roleType, community_id: manifest.community, school_id: E2E_SCHOOL_SECONDARY.id, is_active: true,
  }).select('id').single());
  manifest.userRoles.push(role.id);
  users[label] = { id, email, password, firstName, lastName, role: roleType };
}

async function createMeeting(viewport: string) {
  const meeting = await must('meeting', (db) => db.from('community_meetings').insert({
    workspace_id: manifest.workspace, title: `Reunion sintetica SM22 ${viewport} ${STAMP}`,
    meeting_date: '2030-07-01T15:00:00Z', created_by: users.editor.id, status: 'borrador',
    summary: 'Resumen sintetico de prueba.',
  }).select('id, title').single());
  manifest.meetings.push(meeting.id);
  // Written by the backend with no end-user identity, like rows that predate
  // the migration, so it carries no grant provenance.
  const legacy = await must('legacy co_editor', (db) => db.from('meeting_attendees').insert({
    meeting_id: meeting.id, user_id: users.legacy.id, role: 'co_editor',
  }).select('id').single());
  manifest.attendees.push(legacy.id);
  return meeting as { id: string; title: string };
}

async function childRows(meetingId: string) {
  const agreements = await must('agreements', (db) => db.from('meeting_agreements').select('id, agreement_text').eq('meeting_id', meetingId));
  const tasks = await must('tasks', (db) => db.from('meeting_tasks').select('id, task_title').eq('meeting_id', meetingId));
  return { agreements: agreements ?? [], tasks: tasks ?? [] };
}

async function openAgreementsStep(page: Page, title: string) {
  await page.goto('/community/workspace?section=meetings');
  await page.waitForLoadState('networkidle');
  const card = page.locator('div').filter({ hasText: title }).filter({ has: page.getByTitle('Editar reunión') }).last();
  await card.getByTitle('Editar reunión').click();
  await expect(page.getByRole('heading', { name: /Editar Reunión/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('button', { name: 'Agregar Acuerdo' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

async function evidence(page: Page, name: string) {
  if (process.env.UI_EVIDENCE_DIR) {
    await page.screenshot({ path: join(process.env.UI_EVIDENCE_DIR, `${name}.png`) });
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('dedicated write-target guard', () => {
  const dedicated: TargetEnv = {
    NEXT_PUBLIC_SUPABASE_URL: DEDICATED_API, SUPABASE_DB_URL: `postgresql://postgres:synthetic@${DEDICATED_DB}/postgres`,
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic', E2E_SUPABASE_STACK_ID: 'sm22-dedicated-guard',
  };
  const refusals: [string, TargetEnv, RegExp][] = [
    ['nothing set', {}, /missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_SUPABASE_STACK_ID/],
    ['the .env.development.local default (shared 54421/54422)', { ...dedicated,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421', SUPABASE_DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54422/postgres' }, /API 127\.0\.0\.1:54421/],
    ['the shared API 54421 with the dedicated DB', { ...dedicated, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421' }, /API 127\.0\.0\.1:54421/],
    ['the dedicated API with the shared DB 54422', { ...dedicated,
      SUPABASE_DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54422/postgres' }, /DB 127\.0\.0\.1:54422/],
    ['the CLI default 54321/54322', { ...dedicated,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres' }, /API 127\.0\.0\.1:54321/],
    ['a hosted project', { ...dedicated, NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co' }, /API abcdefghijklmnop\.supabase\.co/],
    ['a localhost alias of the dedicated port', { ...dedicated, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54821' }, /API localhost:54821/],
    ['a missing stack identity', { ...dedicated, E2E_SUPABASE_STACK_ID: undefined }, /missing E2E_SUPABASE_STACK_ID/],
  ];

  test('accepts only the dedicated 54821/54822 pair', () => {
    expect(targetProblem(dedicated)).toBeNull();
  });

  for (const [name, env, reason] of refusals) {
    test(`refuses ${name}`, () => {
      expect(targetProblem(env)).toMatch(reason);
    });
  }

  test('requires the named stack to publish both dedicated ports', () => {
    const published: Record<string, string> = {
      'supabase_kong_sm22-dedicated-guard': '0.0.0.0:54821\n[::]:54821', 'supabase_db_sm22-dedicated-guard': '0.0.0.0:54822',
      supabase_kong_proc15isolated: '0.0.0.0:54421', supabase_db_proc15isolated: '0.0.0.0:54422',
    };
    const portOf = (container: string) => {
      if (!(container in published)) throw new Error('No such container');
      return published[container];
    };
    expect(stackIdentityProblem('sm22-dedicated-guard', portOf)).toBeNull();
    expect(stackIdentityProblem('proc15isolated', portOf)).toBe('supabase_kong_proc15isolated does not publish 54821');
    expect(stackIdentityProblem('sm22-removed', portOf)).toBe('container supabase_kong_sm22-removed not found');
  });

  test('requires the app server bundle to carry the dedicated API URL', () => {
    const staticLiterals = '["http://127.0.0.1:54321","http://localhost:54321"]';
    expect(bundleTargetProblem(`${staticLiterals};u="http://127.0.0.1:54821"`)).toBeNull();
    expect(bundleTargetProblem(`${staticLiterals};u="http://127.0.0.1:54421"`)).toBe(`app server bundle does not target ${DEDICATED_API}`);
    expect(bundleTargetProblem('u="http://127.0.0.1:548210"')).toBe(`app server bundle does not target ${DEDICATED_API}`);
  });

  test('starts no write before the target is verified', async () => {
    let started = false;
    await expect(must('probe', () => {
      started = true;
      return Promise.resolve({ data: null, error: null });
    })).rejects.toThrow('write target not verified');
    expect(started).toBe(false);
    await expect(dbQuery('probe', 'select 1', [])).rejects.toThrow('write target not verified');
  });
});

test.describe('Meeting agreements and tasks on the dedicated stack', () => {
  test.beforeAll(async () => {
    await verifyTargetAndConnect();
    const community = await must('community', (db) => db.from('growth_communities').insert({
      name: `Comunidad Sintetica SM22 ${STAMP}`, school_id: E2E_SCHOOL_SECONDARY.id,
    }).select('id').single());
    manifest.community = community.id;
    const workspace = await must('workspace', (db) => db.from('community_workspaces').insert({
      community_id: community.id, name: `Espacio Sintetico SM22 ${STAMP}`,
    }).select('id').single());
    manifest.workspace = workspace.id;
    await createAccount('editor', 'lider_comunidad');
    await createAccount('legacy', 'docente');
    // The dev server compiles API routes on first use and then refreshes page
    // props, which unmounts an open meeting modal. Anonymous GETs compile them
    // up front; each route rejects them before doing anything.
    const warm = await request.newContext({ baseURL: process.env.E2E_APP_ORIGIN });
    for (const path of ['/api/community/members', '/api/meetings/warm/autosave',
      '/api/meetings/warm/work-session/start', '/api/meetings/warm/work-session/warm/end']) {
      expect((await warm.get(path)).status()).toBeGreaterThanOrEqual(400);
    }
    await warm.dispose();
  });

  test.afterAll(async () => {
    if (!admin) return;
    for (const id of manifest.meetings) {
      const rows = await childRows(id);
      manifest.agreements.push(...rows.agreements.map((r) => r.id));
      manifest.tasks.push(...rows.tasks.map((r) => r.id));
    }
    saveManifest();
    const removals: [string, string, string[]][] = [
      ['meeting_agreements', 'id', manifest.agreements], ['meeting_tasks', 'id', manifest.tasks],
      ['meeting_attendees', 'id', manifest.attendees], ['community_meetings', 'id', manifest.meetings],
      ['user_roles', 'id', manifest.userRoles], ['community_workspaces', 'id', manifest.workspace ? [manifest.workspace] : []],
      ['growth_communities', 'id', manifest.community ? [manifest.community] : []], ['profiles', 'id', manifest.accounts],
    ];
    for (const [table, column, ids] of removals) {
      if (ids.length === 0) continue;
      const removed = await must(`delete ${table}`, (db) => db.from(table).delete().in(column, ids).select('id'));
      manifest.cleanup[table] = removed?.length ?? 0;
    }
    for (const id of manifest.accounts) {
      await must('deleteUser', (db) => db.auth.admin.deleteUser(id));
    }
    manifest.cleanup['auth.users'] = manifest.accounts.length;
    // GoTrue logged the sign-ups, logins and deletions of these accounts in
    // auth.audit_log_entries (actor_id for logins, traits.user_id for admin
    // actions). Collect them by exact id, record, delete, and fail on residue.
    const owned = "payload->>'actor_id' = any($1::text[]) or payload->'traits'->>'user_id' = any($1::text[]) or payload::text like $2";
    const ownedParams = [manifest.accounts, `%e2e-sm22-%-${STAMP}@example.com%`];
    const audit = await dbQuery<{ id: string }>('audit ids', `select id from auth.audit_log_entries where ${owned} order by created_at`, ownedParams);
    manifest.providerAudit = audit.map((r) => r.id);
    saveManifest();
    const removedAudit = await dbQuery<{ id: string }>('delete audit', 'delete from auth.audit_log_entries where id = any($1::uuid[]) returning id', [manifest.providerAudit]);
    manifest.cleanup['auth.audit_log_entries'] = removedAudit.length;
    const [residue] = await dbQuery<{ n: number }>('audit residue', `select count(*)::int as n from auth.audit_log_entries where ${owned}`, ownedParams);
    manifest.residue['auth.audit_log_entries'] = residue.n;
    saveManifest();
    if (removedAudit.length !== manifest.providerAudit.length || residue.n !== 0) {
      throw new Error(`[SM-22] incomplete audit cleanup for stamp ${STAMP}: recorded ${manifest.providerAudit.length}, removed ${removedAudit.length}, residue ${residue.n}`);
    }
  });

  for (const viewport of [{ name: 'desktop', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }]) {
    test.describe(`Meeting agreements and tasks (${viewport.name})`, () => {
      test.use({ viewport, storageState: { cookies: [], origins: [] } });
      let meeting: { id: string; title: string };
      const agreementText = `Acuerdo sintetico SM22 ${viewport.name}`;
      const taskTitle = `Tarea sintetica SM22 ${viewport.name}`;

      test.beforeAll(async () => {
        meeting = await createMeeting(viewport.name);
      });

      test('verified editor saves an agreement and a task, and both reopen', async ({ page }) => {
        test.setTimeout(120_000);
        await loginViaUi(page, users.editor);
        await openAgreementsStep(page, meeting.title);
        await page.getByRole('button', { name: 'Agregar Acuerdo' }).click();
        await page.locator('[contenteditable="true"]').first().fill(agreementText);
        await page.getByRole('button', { name: 'Agregar Tarea' }).click();
        await page.getByPlaceholder('Título de la tarea...').fill(taskTitle);
        // An empty due date is sent as "" and the insert fails silently.
        await page.locator('input[type="date"]').first().fill('2030-07-15');
        await expect(page.getByTestId('meeting-task-assignee-0')).toBeEnabled();
        await page.getByTestId('meeting-task-assignee-0').selectOption({ label: 'Sintetico Editor SM22' });
        await page.getByRole('button', { name: 'Guardar borrador' }).click();
        await expect(page.getByText('Borrador guardado')).toBeVisible();

        await expect.poll(async () => {
          const rows = await childRows(meeting.id);
          return [rows.agreements.map((r) => r.agreement_text), rows.tasks.map((r) => r.task_title)];
        }).toEqual([[agreementText], [taskTitle]]);

        await openAgreementsStep(page, meeting.title);
        await expect(page.getByText(agreementText)).toBeVisible();
        await expect(page.getByPlaceholder('Título de la tarea...')).toHaveValue(taskTitle);
        await page.getByText(agreementText).scrollIntoViewIfNeeded();
        await evidence(page, `editor-reopen-${viewport.name}`);
      });

      test('unverified co_editor sees neither row and cannot add one', async ({ page }) => {
        test.setTimeout(120_000);
        await loginViaUi(page, users.legacy);
        await openAgreementsStep(page, meeting.title);
        await expect(page.getByText('No se han agregado acuerdos.')).toBeVisible();
        await expect(page.getByText('No se han agregado tareas.')).toBeVisible();
        await expect(page.getByText(agreementText)).toHaveCount(0);

        await page.getByRole('button', { name: 'Agregar Acuerdo' }).click();
        await page.locator('[contenteditable="true"]').first().fill('Acuerdo no autorizado SM22');
        await page.getByRole('button', { name: 'Guardar borrador' }).click();
        await expect(page.getByText(/Borrador guardado|Error/).first()).toBeVisible();

        const rows = await childRows(meeting.id);
        expect(rows.agreements.map((r) => r.agreement_text)).toEqual([agreementText]);
        expect(rows.tasks.map((r) => r.task_title)).toEqual([taskTitle]);

        await openAgreementsStep(page, meeting.title);
        await expect(page.getByText('No se han agregado acuerdos.')).toBeVisible();
        await page.getByText('No se han agregado acuerdos.').scrollIntoViewIfNeeded();
        await evidence(page, `legacy-denied-${viewport.name}`);
      });
    });
  }
});

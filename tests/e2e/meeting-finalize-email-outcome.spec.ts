import { test, expect, request, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loginViaUi, E2E_SCHOOL_SECONDARY, type E2eFixtureUser } from './helpers/auth';

/**
 * SM-25 (W-B3b-01) — the finalize dialog reports what the summary-email attempt
 * actually returned. The finalize POST is answered in the browser with a
 * synthetic API response, so no meeting is finalized and no email is sent.
 *
 * The editor account, community, workspace and draft meeting are synthetic rows
 * on the dedicated SM-22 stack only (API 127.0.0.1:54821, DB 127.0.0.1:54822),
 * verified before any client exists. Every row id is written to a manifest and
 * removed by id; GoTrue audit rows for the account are removed by id and any
 * residue fails the run.
 */

const DEDICATED_API = 'http://127.0.0.1:54821';
const DEDICATED_DB = '127.0.0.1:54822';

async function verifyTarget(): Promise<{ admin: SupabaseClient; dbUrl: string }> {
  const env = process.env;
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_SUPABASE_STACK_ID'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`[SM-25] refusing write target: missing ${missing.join(', ')}`);
  if (new URL(env.NEXT_PUBLIC_SUPABASE_URL!).origin !== DEDICATED_API) throw new Error('[SM-25] refusing write target: API is not dedicated');
  if (new URL(env.SUPABASE_DB_URL!).host !== DEDICATED_DB) throw new Error('[SM-25] refusing write target: DB is not dedicated');
  const stack = env.E2E_SUPABASE_STACK_ID!;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(stack)) throw new Error('[SM-25] refusing write target: invalid stack id');
  for (const [container, internal, port] of [[`supabase_kong_${stack}`, '8000/tcp', '54821'], [`supabase_db_${stack}`, '5432/tcp', '54822']]) {
    const published = execFileSync('docker', ['port', container, internal], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (!published.split('\n').some((line) => line.trim().endsWith(`:${port}`))) throw new Error(`[SM-25] ${container} does not publish ${port}`);
  }
  // The app server must have been started against the dedicated API.
  const app = await request.newContext({ baseURL: process.env.E2E_APP_ORIGIN });
  const html = await (await app.get('/login')).text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const bundle = [html, ...(await Promise.all(scripts.map(async (src) => (await app.get(src)).text())))].join('\n');
  await app.dispose();
  if (!/http:\/\/127\.0\.0\.1:54821(?!\d)/.test(bundle)) throw new Error(`[SM-25] app server bundle does not target ${DEDICATED_API}`);
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return { admin, dbUrl: env.SUPABASE_DB_URL! };
}

let admin: SupabaseClient | null = null;
let dbUrl = '';

async function must<T>(label: string, run: (db: SupabaseClient) => PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  if (!admin) throw new Error(`[SM-25] ${label}: write target not verified`);
  const { data, error } = await run(admin);
  if (error) throw new Error(`[SM-25] ${label}: ${error.message}`);
  return data;
}

async function dbQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
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
  supabase: new URL(DEDICATED_API).host, stamp: STAMP, accounts: [] as string[], community: '', workspace: '',
  userRoles: [] as string[], meetings: [] as string[], attendees: [] as string[], workSessions: [] as string[],
  providerAudit: [] as string[], cleanup: {} as Record<string, number>, residue: {} as Record<string, number>,
};
const saveManifest = () => {
  if (process.env.UI_EVIDENCE_DIR) writeFileSync(join(process.env.UI_EVIDENCE_DIR, 'sm25-fixtures.json'), JSON.stringify(manifest, null, 2));
};

let editor: E2eFixtureUser & { id: string };
let meeting: { id: string; title: string };

const OUTCOMES = [
  {
    name: 'all-accepted',
    data: { recipients_count: 3, sent: 3, failed: 0, summary_email_sent: true, summary_email_error: null },
    shown: 'Reunión finalizada. Resumen enviado a 3 destinatarios.',
  },
  {
    name: 'partial-failure',
    data: { recipients_count: 3, sent: 1, failed: 2, summary_email_sent: false, summary_email_error: null },
    shown: 'Reunión finalizada, pero el resumen solo se envió a 1 de 3 destinatarios.',
  },
  {
    name: 'total-failure',
    data: { recipients_count: 3, sent: 0, failed: 0, summary_email_sent: false, summary_email_error: 'resend_outage' },
    shown: 'Reunión finalizada, pero no se pudo enviar el resumen por correo.',
  },
];

async function finalizeWithResponse(page: Page, data: Record<string, unknown>) {
  const finalizePosts: string[] = [];
  await page.route('**/api/meetings/*/finalize', (route) => {
    finalizePosts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true, ...data } }) });
  });
  await page.goto('/community/workspace?section=meetings');
  // Wait for the meeting's own edit control, not network idleness: background
  // requests on the workspace page can keep the network busy indefinitely. Leaving
  // the dashboard mid-request can hold the Supabase auth lock for up to 10s.
  const card = page.locator('div').filter({ hasText: meeting.title }).filter({ has: page.getByTitle('Editar reunión') }).last();
  const edit = card.getByTitle('Editar reunión');
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await expect(edit).toBeEnabled();
  await edit.click();
  await expect(page.getByRole('heading', { name: /Editar Reunión/i })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar reunión' }).click();
  const dialog = page.getByRole('dialog', { name: 'Finalizar reunión' });
  await expect(dialog.getByText(/Se enviará a \d+ destinatarios/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Finalizar y enviar' }).click();
  return { dialog, finalizePosts };
}

// toBeVisible() passes while the toast is still sliding in from below the fold,
// so wait for its entrance to finish and check the whole box is on screen.
async function expectToastReadable(page: Page, text: string) {
  const bar = page.getByRole('status').filter({ hasText: text }).locator('..');
  await expect(bar).toBeVisible();
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).opacity === '1'
    && (el.parentElement ?? el).getAnimations({ subtree: true })
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity))).toBe(true);
  const box = await bar.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, 'toast box').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  const clipped = await page.getByRole('status').filter({ hasText: text })
    .evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
  expect(clipped, 'toast copy overflows its box').toBe(false);
}

test.describe.configure({ mode: 'serial' });

test.describe('Finalize dialog reports the summary-email outcome', () => {
  test.beforeAll(async () => {
    ({ admin, dbUrl } = await verifyTarget());
    const community = await must('community', (db) => db.from('growth_communities').insert({
      name: `Comunidad Sintetica SM25 ${STAMP}`, school_id: E2E_SCHOOL_SECONDARY.id,
    }).select('id').single());
    manifest.community = community.id;
    const workspace = await must('workspace', (db) => db.from('community_workspaces').insert({
      community_id: community.id, name: `Espacio Sintetico SM25 ${STAMP}`,
    }).select('id').single());
    manifest.workspace = workspace.id;
    const email = `e2e-sm25-editor-${STAMP}@example.com`;
    const password = 'Sm25EditorSintetico2026';
    const created = await must('createUser', (db) => db.auth.admin.createUser({ email, password, email_confirm: true }));
    const id = created.user!.id;
    manifest.accounts.push(id);
    await must('profile', (db) => db.from('profiles').upsert({
      id, email, first_name: 'Sintetico', last_name: 'Editor SM25', name: 'Sintetico Editor SM25',
      approval_status: 'approved', must_change_password: false, school_id: E2E_SCHOOL_SECONDARY.id,
    }, { onConflict: 'id' }));
    const role = await must('role', (db) => db.from('user_roles').insert({
      user_id: id, role_type: 'lider_comunidad', community_id: community.id, school_id: E2E_SCHOOL_SECONDARY.id, is_active: true,
    }).select('id').single());
    manifest.userRoles.push(role.id);
    editor = { id, email, password, firstName: 'Sintetico', lastName: 'Editor SM25', role: 'lider_comunidad' };
    meeting = await must('meeting', (db) => db.from('community_meetings').insert({
      workspace_id: workspace.id, title: `Reunion sintetica SM25 ${STAMP}`, meeting_date: '2030-07-01T15:00:00Z',
      created_by: id, status: 'borrador', summary: 'Resumen sintetico de prueba.',
    }).select('id, title').single());
    manifest.meetings.push(meeting.id);
    saveManifest();
    // Compile the routes the editor calls so a first-use rebuild cannot remount the modal.
    const warm = await request.newContext({ baseURL: process.env.E2E_APP_ORIGIN });
    for (const path of ['/api/community/members', '/api/meetings/warm/autosave', '/api/meetings/warm/recipients',
      '/api/meetings/warm/work-session/start', '/api/meetings/warm/work-session/warm/end']) {
      expect((await warm.get(path)).status()).toBeGreaterThanOrEqual(400);
    }
    // Same for the read-only routes the dashboard and meetings page fetch on load: a
    // first compile of any of them refreshes page data and closes an open editor.
    for (const path of ['/api/sessions', '/api/auth/my-roles', '/api/dashboard/stats', '/api/learning-paths/my-paths',
      '/api/news', '/api/youtube/latest', '/api/upcoming-courses']) {
      expect((await warm.get(path)).status(), path).not.toBe(404);
    }
    await warm.dispose();
  });

  test.afterAll(async () => {
    if (!admin) return;
    for (const [key, table] of [['attendees', 'meeting_attendees'], ['workSessions', 'meeting_work_sessions']] as const) {
      const rows = await must(`list ${table}`, (db) => db.from(table).select('id').in('meeting_id', manifest.meetings));
      manifest[key] = (rows ?? []).map((r: { id: string }) => r.id);
    }
    saveManifest();
    const removals: [string, string[]][] = [
      ['meeting_work_sessions', manifest.workSessions], ['meeting_attendees', manifest.attendees],
      ['community_meetings', manifest.meetings], ['user_roles', manifest.userRoles],
      ['community_workspaces', manifest.workspace ? [manifest.workspace] : []],
      ['growth_communities', manifest.community ? [manifest.community] : []], ['profiles', manifest.accounts],
    ];
    for (const [table, ids] of removals) {
      if (ids.length === 0) continue;
      const removed = await must(`delete ${table}`, (db) => db.from(table).delete().in('id', ids).select('id'));
      manifest.cleanup[table] = removed?.length ?? 0;
    }
    for (const id of manifest.accounts) await must('deleteUser', (db) => db.auth.admin.deleteUser(id));
    manifest.cleanup['auth.users'] = manifest.accounts.length;
    const owned = "payload->>'actor_id' = any($1::text[]) or payload->'traits'->>'user_id' = any($1::text[]) or payload::text like $2";
    const params = [manifest.accounts, `%e2e-sm25-%-${STAMP}@example.com%`];
    manifest.providerAudit = (await dbQuery<{ id: string }>(`select id from auth.audit_log_entries where ${owned}`, params)).map((r) => r.id);
    saveManifest();
    const removedAudit = await dbQuery<{ id: string }>('delete from auth.audit_log_entries where id = any($1::uuid[]) returning id', [manifest.providerAudit]);
    manifest.cleanup['auth.audit_log_entries'] = removedAudit.length;
    const [audit] = await dbQuery<{ n: number }>(`select count(*)::int as n from auth.audit_log_entries where ${owned}`, params);
    const [rows] = await dbQuery<{ n: number }>('select (select count(*) from community_meetings where id = any($1::uuid[])) + (select count(*) from meeting_work_sessions where meeting_id = any($1::uuid[])) + (select count(*) from meeting_attendees where meeting_id = any($1::uuid[])) + (select count(*) from auth.users where id = any($2::uuid[]))::int as n', [manifest.meetings, manifest.accounts]);
    manifest.residue = { 'auth.audit_log_entries': audit.n, 'meeting and account rows': Number(rows.n) };
    saveManifest();
    if (audit.n !== 0 || Number(rows.n) !== 0) throw new Error(`[SM-25] cleanup residue for stamp ${STAMP}: ${JSON.stringify(manifest.residue)}`);
  });

  for (const viewport of [{ name: 'desktop', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }]) {
    test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height }, storageState: { cookies: [], origins: [] } });

      for (const outcome of OUTCOMES) {
        test(`${outcome.name}: shows the actual email outcome, closes, and posts finalize once`, async ({ page }) => {
          test.setTimeout(120_000);
          await loginViaUi(page, editor);
          const { dialog, finalizePosts } = await finalizeWithResponse(page, outcome.data);
          await expect(page.getByText(outcome.shown)).toBeVisible();
          await expect(dialog).toBeHidden();
          await expectToastReadable(page, outcome.shown);
          if (process.env.UI_EVIDENCE_DIR) {
            await page.screenshot({ path: join(process.env.UI_EVIDENCE_DIR, `finalize-${outcome.name}-${viewport.name}.png`) });
          }
          if (outcome.data.failed || !outcome.data.summary_email_sent) {
            await expect(page.getByText(/Resumen enviado a|enviada a \d+ destinatarios/)).toHaveCount(0);
          }
          await expect(page.getByRole('heading', { name: /Editar Reunión/i })).toBeHidden();
          expect(finalizePosts).toHaveLength(1);
          // The intercepted POST never reached the stack: the meeting is still a draft.
          const row = await must('meeting status', (db) => db.from('community_meetings').select('status, finalized_at').eq('id', meeting.id).single());
          expect(row).toEqual({ status: 'borrador', finalized_at: null });
        });
      }
    });
  }
});

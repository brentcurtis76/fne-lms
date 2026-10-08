import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * N4-01 — `/api/user/notification-preferences` in a real browser against the
 * running app.
 *
 * The settings page is N4-02, so this spec signs in through the real login page
 * and then replaces the document with a small test harness on the app's own
 * origin. Its buttons call the real route with the session cookie the app set
 * (person A) or with a Bearer token (person B), and show what the route
 * answers. Nothing is mocked; this does not test the future page.
 *
 * A saves choices and sees them after a reload; mandatory and legacy
 * suppression read as the senders apply them; an invalid body and a digest
 * choice are refused. B (admin) cannot change A's choices, and a caller with no
 * credentials is refused. Every fixture is deleted by exact id in afterAll and
 * the manifest is written next to the screenshots. Synthetic *@qa.local.test
 * users on a local database only; no email is sent and no producer runs.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const APP_ORIGIN = new URL(process.env.E2E_APP_ORIGIN ?? 'http://localhost:3000').origin;
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `N19-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const ROUTE = '/api/user/notification-preferences';
const users = {
  a: { id: '', email: `notif19-${RUN}-a@qa.local.test`, role: 'docente' },
  b: { id: '', email: `notif19-${RUN}-b@qa.local.test`, role: 'admin' },
};
type User = (typeof users)[keyof typeof users];
const ids = { legacy: [] as string[], types: [] as string[] };
const evidence: Record<string, unknown> = { run: RUN, supabaseUrl: SUPABASE_URL, appOrigin: APP_ORIGIN };
let service: SupabaseClient;

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function evidenceDir(): string {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(evidenceDir(), `${name}.png`), fullPage: true });
}

async function categoryRows(user: User) {
  return must('category rows', await service.from('user_notification_category_prefs').select('category, email_mode').eq('user_id', user.id).order('category'));
}

async function accessToken(user: User): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
  if (error || !data.session) throw new Error(`signIn: ${error?.message ?? 'no session'}`);
  return data.session.access_token;
}

/** The harness: es-CL controls on the app's own origin that call the real route and print its answer. */
const HARNESS = `<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arnés de prueba — preferencias de notificación</title>
<style>body{font:14px system-ui,sans-serif;margin:16px;max-width:900px}label,select,input,button{font:inherit;margin:4px 4px 4px 0}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #ccc;padding:4px;text-align:left;word-break:break-word}
#status{font-weight:600}</style></head><body>
<h1>Arnés de prueba (N4-01) — no es la página de configuración</h1>
<p>Cada botón llama a la ruta real <code>${ROUTE}</code>.</p>
<label>Credencial <select id="auth"><option value="cookie">Cookie de sesión</option><option value="bearer">Bearer</option><option value="none">Sin credencial</option></select></label>
<input id="token" type="hidden">
<div><button id="load">Cargar preferencias</button></div>
<div><label>Categoría <select id="category">
<option>courses</option><option>assignments</option><option>community</option><option>sessions</option>
<option>advisory</option><option>licitaciones</option><option>qa_support</option><option>system</option></select></label>
<label>Modo <select id="mode"><option>default</option><option>immediate</option><option>digest</option><option>off</option></select></label>
<label>Usuario en el cuerpo <input id="target" placeholder="(vacío)" size="10"></label>
<button id="save">Guardar</button> <button id="invalid">Enviar cuerpo inválido</button></div>
<p>Estado: <span id="status" data-testid="status">—</span> <span id="code" data-testid="code"></span></p>
<table data-testid="categories"><thead><tr><th>Categoría</th><th>Modo guardado</th></tr></thead><tbody id="rows"></tbody></table>
<table data-testid="events"><thead><tr><th>Evento</th><th>Modo</th><th>Envío</th><th>Motivo</th></tr></thead><tbody id="events"></tbody></table>
<script>
const WATCH = ['assignment_created', 'session_cancelled', 'session_created', 'meeting_finalized', 'new_feedback'];
async function send(method, body, query) {
  document.getElementById('status').textContent = '…';
  document.getElementById('code').textContent = '';
  const mode = document.getElementById('auth').value;
  const headers = { 'Content-Type': 'application/json' };
  if (mode === 'bearer') headers.Authorization = 'Bearer ' + document.getElementById('token').value;
  const res = await fetch('${ROUTE}' + (query || ''), { method, headers, credentials: mode === 'cookie' ? 'same-origin' : 'omit', body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  document.getElementById('status').textContent = String(res.status);
  document.getElementById('code').textContent = json && json.code ? json.code : '';
  if (res.ok && json && json.categories) {
    document.getElementById('rows').innerHTML = json.categories.map((c) => '<tr data-category="' + c.category + '"><td>' + c.label + '</td><td>' + c.email_mode + '</td></tr>').join('');
    const events = json.categories.flatMap((c) => c.events).filter((e) => WATCH.includes(e.event_type));
    document.getElementById('events').innerHTML = events.map((e) => '<tr data-event="' + e.event_type + '"><td>' + e.event_type + '</td><td>' + e.mode + '</td><td>' + e.delivery + '</td><td>' + e.reason + '</td></tr>').join('');
  }
}
document.getElementById('load').onclick = () => send('GET', undefined, location.hash ? '?user_id=' + location.hash.slice(1) : '');
document.getElementById('save').onclick = () => {
  const entry = { category: document.getElementById('category').value, email_mode: document.getElementById('mode').value };
  const target = document.getElementById('target').value;
  send('PUT', target ? { user_id: target, categories: [entry] } : { categories: [entry] }, location.hash ? '?user_id=' + location.hash.slice(1) : '');
};
document.getElementById('invalid').onclick = () => send('PUT', { categories: [{ category: 'courses', email_mode: 'weekly' }] });
</script></body></html>`;

async function signedIn(browser: Browser, viewport: typeof DESKTOP, user: User) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(user.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  return { context, page, problems };
}

/** Puts the harness on the current app page (same origin, same cookies), optionally with ?user_id in the hash. */
async function harness(page: Page, queryUser = '') {
  await page.goto(`/dashboard${queryUser ? `#${queryUser}` : ''}`);
  await page.setContent(HARNESS);
  expect(new URL(page.url()).origin).toBe(APP_ORIGIN);
  await expect(page.getByRole('heading', { name: /Arnés de prueba/ })).toBeVisible();
}

async function answer(page: Page, button: string, status: string, code = '') {
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === ROUTE),
    page.getByRole('button', { name: button }).click(),
  ]);
  await expect(page.getByTestId('status')).toHaveText(status);
  await expect(page.getByTestId('code')).toHaveText(code);
}

async function choose(page: Page, category: string, mode: string) {
  await page.getByLabel('Categoría').selectOption(category);
  await page.getByLabel('Modo').selectOption(mode);
}

const eventRow = (page: Page, eventType: string) => page.locator(`tr[data-event="${eventType}"] td`);
const categoryRow = (page: Page, category: string) => page.locator(`tr[data-category="${category}"] td`).nth(1);

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('notification preferences API in the browser (N4-01)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error('Supabase URL, anon key and service key are required');
    const target = new URL(SUPABASE_URL);
    if (!LOCAL_HOSTS.includes(target.hostname.replace(/^\[|\]$/g, ''))) throw new Error('notification-preferences-api refuses a non-local database');
    if (['54321', '54322'].includes(target.port)) throw new Error('notification-preferences-api refuses the shared default stack');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    for (const user of Object.values(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert(
        { id: user.id, email: user.email, name: 'Persona Sintetica', first_name: 'Persona', last_name: 'Sintetica', must_change_password: false, approval_status: 'approved' },
        { onConflict: 'id' }
      ));
      must('role', await service.from('user_roles').insert({ user_id: user.id, role_type: user.role, is_active: true }));
    }
    // A's legacy switch-off of assignment_created email (its in-app switch stays on). The legacy row
    // needs its notification_types row; one is created only when the database has none, and then deleted.
    const types = must('types', await service.from('notification_types').select('id').eq('id', 'assignment_created')) as Array<{ id: string }>;
    if (types.length === 0) {
      must('type', await service.from('notification_types').insert({ id: 'assignment_created', name: 'Tarea creada (sintético N19)', category: 'assignments' }));
      ids.types.push('assignment_created');
    }
    const legacy = must('legacy', await service.from('user_notification_preferences')
      .insert({ user_id: users.a.id, notification_type: 'assignment_created', email_enabled: false, in_app_enabled: true })
      .select('id')) as Array<{ id: string }>;
    ids.legacy.push(...legacy.map((row) => row.id));
    evidence.users = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, { id: user.id, role: user.role }]));
    evidence.legacy = ids.legacy;
    evidence.notificationTypes = ids.types;
    writeFileSync(join(evidenceDir(), 'notification-preferences-api-fixtures.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  });

  test.afterAll(async () => {
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const userIds = Object.values(users).map((user) => user.id).filter(Boolean);
    if (service && userIds.length) {
      const owned: Array<[string, string, string[]]> = [
        ['user_notification_category_prefs', 'user_id', userIds],
        ['user_notification_preferences', 'user_id', userIds],
        ['user_roles', 'user_id', userIds],
        ['profiles', 'id', userIds],
        ['notification_types', 'id', ids.types],
      ];
      for (const [table, column, values] of owned) {
        cleanup[table] = count(await service.from(table).delete({ count: 'exact' }).in(column, values));
      }
      cleanup.auth_users = 0;
      for (const id of userIds) {
        const deleted = await service.auth.admin.deleteUser(id);
        if (deleted.error) cleanup.auth_users = deleted.error.message;
        else if (typeof cleanup.auth_users === 'number') cleanup.auth_users += 1;
      }
      for (const [table, column, values] of owned) {
        remaining[table] = count(await service.from(table).select('*', { count: 'exact', head: true }).in(column, values));
      }
      remaining.auth_users = 0;
      for (const id of userIds) {
        if ((await service.auth.admin.getUserById(id)).data.user) remaining.auth_users += 1;
      }
    }
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    writeFileSync(join(evidenceDir(), 'notification-preferences-api-fixtures.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  });

  test('desktop: A saves with the session cookie, the reload shows it, mandatory and legacy suppression hold, invalid bodies are refused', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, DESKTOP, users.a);
    await harness(page);

    // Before any choice: all default; the legacy row suppresses assignment_created; the digest default is sent immediately.
    await answer(page, 'Cargar preferencias', '200');
    await expect(categoryRow(page, 'sessions')).toHaveText('default');
    await expect(eventRow(page, 'assignment_created')).toHaveText(['assignment_created', 'off', 'off', 'legacy_suppressed']);
    await expect(eventRow(page, 'session_cancelled')).toHaveText(['session_cancelled', 'immediate', 'immediate', 'mandatory']);
    await expect(eventRow(page, 'new_feedback')).toHaveText(['new_feedback', 'digest', 'immediate', 'catalog_default']);
    await shot(page, 'desktop-1-defaults');

    await choose(page, 'sessions', 'off');
    await answer(page, 'Guardar', '200');
    await choose(page, 'assignments', 'immediate');
    await answer(page, 'Guardar', '200');
    expect(await categoryRows(users.a)).toEqual([
      { category: 'assignments', email_mode: 'immediate' },
      { category: 'sessions', email_mode: 'off' },
    ]);

    // After a reload: the saved choices; session_cancelled is still sent.
    await page.reload();
    await harness(page);
    await answer(page, 'Cargar preferencias', '200');
    await expect(categoryRow(page, 'sessions')).toHaveText('off');
    await expect(categoryRow(page, 'assignments')).toHaveText('immediate');
    await expect(eventRow(page, 'session_created')).toHaveText(['session_created', 'off', 'off', 'category_mode']);
    await expect(eventRow(page, 'session_cancelled')).toHaveText(['session_cancelled', 'immediate', 'immediate', 'mandatory']);
    await expect(eventRow(page, 'assignment_created')).toHaveText(['assignment_created', 'immediate', 'immediate', 'category_mode']);
    await shot(page, 'desktop-2-saved-after-reload');

    // Predeterminado re-applies the legacy suppression.
    await choose(page, 'assignments', 'default');
    await answer(page, 'Guardar', '200');
    await expect(eventRow(page, 'assignment_created')).toHaveText(['assignment_created', 'off', 'off', 'legacy_suppressed']);

    // Refused: an unknown mode, and a digest choice while the digest is off. Nothing changes.
    await answer(page, 'Enviar cuerpo inválido', '400', 'invalid_mode');
    await choose(page, 'courses', 'digest');
    await answer(page, 'Guardar', '400', 'digest_unavailable');
    await shot(page, 'desktop-3-refused');
    expect(await categoryRows(users.a)).toEqual([
      { category: 'assignments', email_mode: 'default' },
      { category: 'sessions', email_mode: 'off' },
    ]);
    // The legacy row is untouched, in-app switch included.
    expect(must('legacy rows', await service.from('user_notification_preferences').select('notification_type, email_enabled, in_app_enabled').eq('user_id', users.a.id)))
      .toEqual([{ notification_type: 'assignment_created', email_enabled: false, in_app_enabled: true }]);
    expect(problems).toEqual([]);
    await context.close();
  });

  test('mobile: B (admin, Bearer) cannot change A, and a caller with no credentials is refused', async ({ browser, request }) => {
    const { context, page, problems } = await signedIn(browser, MOBILE, users.b);
    await harness(page, users.a.id);
    await page.getByLabel('Credencial').selectOption('bearer');
    await page.locator('#token').evaluate((el, token) => ((el as HTMLInputElement).value = token), await accessToken(users.b));
    const before = await categoryRows(users.a);

    // ?user_id=A is ignored: B reads and writes B's own settings.
    await answer(page, 'Cargar preferencias', '200');
    await expect(categoryRow(page, 'sessions')).toHaveText('default');
    await choose(page, 'sessions', 'immediate');
    await answer(page, 'Guardar', '200');
    // Naming A in the body is refused.
    await page.getByLabel('Usuario en el cuerpo').fill(users.a.id);
    await choose(page, 'sessions', 'off');
    await answer(page, 'Guardar', '400', 'unknown_field');
    await shot(page, 'mobile-1-admin-refused-for-other-user');
    expect(await categoryRows(users.a)).toEqual(before);
    expect(await categoryRows(users.b)).toEqual([{ category: 'sessions', email_mode: 'immediate' }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // No credentials: refused, in the browser and from a bare request.
    await page.getByLabel('Credencial').selectOption('none');
    await answer(page, 'Cargar preferencias', '401');
    await shot(page, 'mobile-2-unauthenticated-refused');
    const bare = await request.get(ROUTE, { headers: { cookie: '' } });
    expect(bare.status()).toBe(401);
    const forged = await request.put(ROUTE, { headers: { Authorization: 'Bearer not-a-token', cookie: '' }, data: { categories: [{ category: 'courses', email_mode: 'off' }] } });
    expect(forged.status()).toBe(401);
    expect(JSON.stringify(await forged.json())).not.toContain('qa.local.test');
    expect(await categoryRows(users.a)).toEqual(before);
    expect(problems).toEqual([]);
    await context.close();
  });
});

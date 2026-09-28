import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import NotificationService from '../../lib/notificationService';

/**
 * N2-01 — occurrence identity on the live synchronous path.
 *
 * One synthetic recipient (*@qa.local.test, no school) receives two genuine
 * `message_sent` occurrences whose text is identical, then a retry of the
 * first. Each goes through the real producer path
 * (`NotificationService.triggerNotification`, in-process with the service
 * role); the only change is that `createNotification` is handed a capturing
 * transport in place of the provider. No provider key is set, so no real mail
 * can leave. Expected: two bell rows, three captured attempts keyed
 * [first, second, first], and an audit that carries no payload.
 *
 * The app server keeps NOTIFICATION_EMAIL_ENABLED=false; the spec turns the
 * kill switch on only around its own sends. Every fixture is deleted by id.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const MARKER = `N07-${RUN}`;
const PASSWORD = `N07-${randomBytes(12).toString('base64url')}!a1`;
const recipient = { id: '', email: `notif07-${RUN}-recipient@qa.local.test` };
const OCCURRENCES = [randomUUID(), randomUUID()];

const captures: Array<{ to: string; subject: string; idempotencyKey?: string }> = [];
let auditIds: string[] = [];
const evidence: Record<string, unknown> = { run: RUN, marker: MARKER, supabaseUrl: SUPABASE_URL };
let title = '';
let service: SupabaseClient;

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`notification-occurrence-idempotency refuses non-local Supabase URL host ${host}`);
  }
}

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function shot(page: Page, name: string) {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

const messageData = (messageId: string) => ({
  message_id: messageId,
  recipient_id: recipient.id,
  sender: { name: `${MARKER} Remitente` },
  message_preview: `${MARKER} contenido privado`,
});

/**
 * The audit rows this spec wrote: those carrying the opaque ref of one of its
 * own occurrences (the service's `occ-` + sha256 of event and occurrence), so a
 * spec running alongside cannot be swept up or left behind.
 */
async function ownedAuditIds(): Promise<string[]> {
  const refs = OCCURRENCES.map((id) => {
    const occurrence = NotificationService.resolveOccurrence('message_sent', messageData(id));
    return `occ-${createHash('sha256').update(JSON.stringify(['message_sent', occurrence])).digest('hex')}`;
  });
  const rows = must('audit ids', await service.from('notification_events').select('id').eq('event_type', 'message_sent').in('event_data->>occurrence_ref', refs)) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** Run one `message_sent` occurrence with every provider attempt captured. */
async function sendMessage(messageId: string) {
  const target = NotificationService as unknown as { createNotification: (data: unknown, deps?: unknown) => Promise<unknown> };
  const original = target.createNotification;
  const transport = async (message: { to: string; subject: string }, options: { idempotencyKey?: string }) => {
    captures.push({ to: message.to, subject: message.subject, idempotencyKey: options?.idempotencyKey });
    return { data: { id: `capture-${captures.length}` }, error: null };
  };
  target.createNotification = (data: unknown) => original.call(target, data, { transport });
  try {
    return await NotificationService.triggerNotification('message_sent', messageData(messageId));
  } finally {
    target.createNotification = original;
  }
}

async function signedIn(browser: Browser, viewport: typeof DESKTOP) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(recipient.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  return { context, page };
}

async function openBell(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
  const bell = page.getByRole('button', { name: /^Notificaciones/ });
  await expect(bell).toBeVisible({ timeout: 30_000 });
  await bell.click();
  await expect(page.getByRole('heading', { name: 'Notificaciones', level: 3 })).toBeVisible();
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('notification occurrence idempotency (N2-01)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL and service key are required');
    if (process.env.NOTIFICATION_EMAIL_ENABLED !== 'false') throw new Error('NOTIFICATION_EMAIL_ENABLED=false is required for the app server');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    assertLocal(SUPABASE_URL);
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const created = await service.auth.admin.createUser({ email: recipient.email, password: PASSWORD, email_confirm: true });
    if (created.error) throw new Error(`createUser: ${created.error.message}`);
    recipient.id = created.data.user.id;
    must('profile', await service.from('profiles').upsert(
      { id: recipient.id, email: recipient.email, name: 'Receptora Sintetico', first_name: 'Receptora', last_name: 'Sintetico', must_change_password: false, approval_status: 'approved' },
      { onConflict: 'id' }
    ));
    must('role', await service.from('user_roles').insert({ user_id: recipient.id, role_type: 'docente', is_active: true }));

    process.env.NOTIFICATION_EMAIL_ENABLED = 'on';
    try {
      evidence.results = [await sendMessage(OCCURRENCES[0]), await sendMessage(OCCURRENCES[1]), await sendMessage(OCCURRENCES[0])];
    } finally {
      process.env.NOTIFICATION_EMAIL_ENABLED = 'false';
    }
    auditIds = await ownedAuditIds();
  });

  test.afterAll(async () => {
    process.env.NOTIFICATION_EMAIL_ENABLED = 'false';
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    if (service && recipient.id) {
      auditIds = await ownedAuditIds();
      evidence.auditIds = auditIds;
      cleanup.notification_events = count(await service.from('notification_events').delete({ count: 'exact' }).in('id', auditIds));
      for (const table of ['user_notifications', 'user_roles']) {
        cleanup[table] = count(await service.from(table).delete({ count: 'exact' }).eq('user_id', recipient.id));
      }
      cleanup.profiles = count(await service.from('profiles').delete({ count: 'exact' }).eq('id', recipient.id));
      const deleted = await service.auth.admin.deleteUser(recipient.id);
      cleanup.auth_users = deleted.error ? deleted.error.message : 1;

      for (const table of ['user_notifications', 'user_roles']) {
        remaining[table] = count(await service.from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', recipient.id));
      }
      remaining.notification_events = count(await service.from('notification_events').select('id', { count: 'exact', head: true }).in('id', auditIds));
      remaining.profiles = count(await service.from('profiles').select('id', { count: 'exact', head: true }).eq('id', recipient.id));
      remaining.auth_user = (await service.auth.admin.getUserById(recipient.id)).data.user ? 1 : 0;
    }
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    const manifest = JSON.stringify({ spec: 'notification-occurrence-idempotency', at: new Date().toISOString(), ...evidence });
    if (EVIDENCE_DIR) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(EVIDENCE_DIR, 'fixtures.json'), manifest);
    }
    if (process.env.NOTIF07_EVIDENCE_MANIFEST) appendFileSync(process.env.NOTIF07_EVIDENCE_MANIFEST, `${manifest}\n`);
  });

  test('D6 capture: two occurrences and a retry give two rows, keys [first, second, first], and a payload-free audit', async () => {
    expect(evidence.results).toEqual([
      { success: true, notificationsCreated: 1 },
      { success: true, notificationsCreated: 1 },
      { success: true, notificationsCreated: 1 },
    ]);
    const rows = must('rows', await service.from('user_notifications').select('title, idempotency_key').eq('user_id', recipient.id).order('created_at')) as Array<{ title: string; idempotency_key: string }>;
    expect(rows).toHaveLength(2);
    title = rows[0].title;
    expect(rows[1].title).toBe(title);
    expect(title).toContain(MARKER);

    const [first, second, retry] = captures.map((c) => c.idempotencyKey);
    expect(captures).toHaveLength(3);
    for (const c of captures) expect(c).toMatchObject({ to: recipient.email, subject: title });
    expect(first).toMatch(/^notif-[0-9a-f]{64}$/);
    expect(retry).toBe(first);
    expect(second).not.toBe(first);
    expect(rows.map((r) => r.idempotency_key)).toEqual([first, second]);

    const audits = must('audits', await service.from('notification_events').select('event_data, status, notifications_created').in('id', auditIds).order('processed_at')) as Array<{ event_data: Record<string, unknown> }>;
    expect(audits).toHaveLength(3);
    const refs = audits.map((a) => a.event_data.occurrence_ref);
    for (const a of audits) expect(Object.keys(a.event_data).sort()).toEqual(['occurrence', 'occurrence_ref']);
    expect(refs[2]).toBe(refs[0]);
    expect(refs[1]).not.toBe(refs[0]);
    const written = JSON.stringify(audits);
    for (const value of [MARKER, recipient.id, recipient.email, ...OCCURRENCES]) expect(written).not.toContain(value);

    evidence.keys = { first, second, retry };
    evidence.audits = audits;
    evidence.rows = rows.length;
  });

  for (const [label, viewport, mobile] of [
    ['desktop', DESKTOP, false],
    ['mobile', MOBILE, true],
  ] as const) {
    test(`D6 ${label}: the bell shows exactly the two occurrences, none for the retry`, async ({ browser }) => {
      const { context, page } = await signedIn(browser, viewport);
      try {
        await openBell(page, mobile);
        await expect(page.getByText(title, { exact: true }).filter({ visible: true })).toHaveCount(2);
        await shot(page, `d6-${label}-bell`);
      } finally {
        await context.close();
      }
    });
  }
});

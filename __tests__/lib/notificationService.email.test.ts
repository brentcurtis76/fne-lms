// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// notificationService.ts builds a Supabase client at import time and throws if
// the URL is missing OR invalid. Set known-good values UNCONDITIONALLY: a `||`
// fallback only triggers on a falsy value, so a truthy-but-invalid value left
// behind by a sibling suite would survive and make createClient throw. vitest
// runs with threads:false, so process.env is shared across files. Every client
// this suite exercises is injected, so the module-level one is never used.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

/**
 * The origin the captured message links to. Defaults to a synthetic host; the
 * browser journey overrides it so the captured HTML links at the local app it
 * is about to click through to. Assertions compare against this same value, so
 * they hold under either setting.
 */
const BASE_URL = (process.env.NOTIFICATION_EMAIL_CAPTURE_BASE_URL || 'https://genera.test').replace(
  /\/+$/,
  ''
);

/** Synthetic throughout. No real address, tenant or credential appears here. */
const USER_ID = '11111111-1111-4111-8111-111111111111';
const RECIPIENT = 'destinataria.sintetica@ejemplo.invalid';
const QA_SCHOOL_ID = 257; // config/production-qa-simulation-target.json
const IDEMPOTENCY_KEY = 'licitacion_published-lic-1-11111111-1111-4111-8111-111111111111-2026-09-22T10:00';
/** What the database answers when a row with the same idempotency key already exists. */
const KEY_CONFLICT = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"',
};

type Terminator = 'single' | 'maybeSingle' | 'await';

interface Recorded {
  table: string;
  op: 'select' | 'insert';
  columns?: string;
  payload?: any;
  filters: Array<[string, string, unknown]>;
  terminator: Terminator;
}

type Handler = (query: Recorded) => { data: unknown; error: unknown };

function createFakeSupabase(handlers: Record<string, Handler>) {
  const calls: Recorded[] = [];
  const client = {
    from(table: string) {
      const record: Recorded = { table, op: 'select', filters: [], terminator: 'await' };
      calls.push(record);
      const resolve = () => {
        const handler = handlers[table];
        if (!handler) throw new Error(`fake supabase: unexpected table "${table}"`);
        return Promise.resolve(handler(record));
      };
      const builder: any = {
        select(columns?: string) {
          record.columns = columns;
          return builder;
        },
        insert(payload: unknown) {
          record.op = 'insert';
          record.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          record.filters.push(['eq', column, value]);
          return builder;
        },
        gte(column: string, value: unknown) {
          record.filters.push(['gte', column, value]);
          return builder;
        },
        in(column: string, value: unknown) {
          record.filters.push(['in', column, value]);
          return builder;
        },
        not(column: string, operator: string, value: unknown) {
          record.filters.push(['not', column, `${operator}:${String(value)}`]);
          return builder;
        },
        limit() {
          return builder;
        },
        single() {
          record.terminator = 'single';
          return resolve();
        },
        maybeSingle() {
          record.terminator = 'maybeSingle';
          return resolve();
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return resolve().then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
  return { client: client as any, calls };
}

interface WorldOptions {
  /** `null` means no preference row exists for this (user, type). */
  preference?: { email_enabled: boolean; in_app_enabled: boolean } | null;
  /** The legacy preference read answers with an error. */
  preferenceError?: boolean;
  /** Stored `email_mode` of the recipient's category row; omitted means no row. */
  categoryMode?: unknown;
  /** The category preference read answers with an error. */
  categoryError?: boolean;
  /** The category preference read throws instead of answering. */
  categoryThrows?: boolean;
  profileEmail?: string | null;
  profileError?: boolean;
  /** A school the recipient belongs to; omitted means an unscoped user. */
  schoolId?: number | null;
  schoolTenantKind?: string;
  rolesError?: boolean;
  /** Rows the duplicate check finds. */
  duplicateRows?: unknown[];
  insertError?: { code: string; message: string; details?: string } | null;
  /** The recipient's e-mail lookup throws this instead of answering. */
  profileThrows?: Error;
}

function world(options: WorldOptions = {}) {
  const inserted: any[] = [];
  const { client, calls } = createFakeSupabase({
    user_notification_preferences: () =>
      options.preferenceError
        ? { data: null, error: { code: '57014', message: 'canceling statement for 11111111-1111-4111-8111-111111111111' } }
        : { data: options.preference === undefined ? null : options.preference, error: null },
    user_notification_category_prefs: () => {
      if (options.categoryThrows) throw new Error('socket hang up for 11111111-1111-4111-8111-111111111111');
      return options.categoryError
        ? { data: null, error: { code: 'PGRST301', message: 'JWT secret re_synthetic_key_not_a_real_credential' } }
        : { data: options.categoryMode === undefined ? null : { email_mode: options.categoryMode }, error: null };
    },
    user_notifications: (query) => {
      if (query.op === 'insert') {
        if (options.insertError) return { data: null, error: options.insertError };
        inserted.push(query.payload);
        return { data: { id: `notif-${inserted.length}`, ...query.payload }, error: null };
      }
      return { data: options.duplicateRows ?? [], error: null };
    },
    profiles: (query) => {
      if (query.columns === 'school_id') {
        return { data: { school_id: options.schoolId ?? null }, error: null };
      }
      if (options.profileThrows) throw options.profileThrows;
      if (options.profileError) return { data: null, error: { message: 'lookup failed' } };
      return {
        data: options.profileEmail === null ? {} : { email: options.profileEmail ?? RECIPIENT },
        error: null,
      };
    },
    user_roles: () =>
      options.rolesError
        ? { data: null, error: { message: 'roles lookup failed' } }
        : { data: [], error: null },
    schools: () => ({
      data: {
        id: options.schoolId,
        tenant_kind: options.schoolTenantKind ?? 'client',
        internal_zoom_testing_enabled: false,
      },
      error: null,
    }),
  });
  return { client, calls, inserted };
}

/** An injected transport that always accepts, recording what it was handed. */
function acceptingTransport() {
  const sends: Array<{ message: any; options: any }> = [];
  const transport = vi.fn(async (message: any, transportOptions: any) => {
    sends.push({ message, options: transportOptions });
    return { data: { id: `provider-${sends.length}` }, error: null };
  });
  return { transport, sends };
}

function notificationData(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    title: 'Licitación publicada',
    description: 'La licitación "Matemática 2026" ya está publicada.',
    category: 'licitaciones',
    related_url: '/licitaciones',
    importance: 'normal',
    read_at: null,
    event_type: 'licitacion_published',
    idempotency_key: IDEMPOTENCY_KEY,
    ...overrides,
  };
}

let notificationService: any;
let sendNotificationEmail: typeof import('../../lib/email/notifications').sendNotificationEmail;
let platformPath: typeof import('../../lib/email/notifications').platformPath;

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  notificationService = (await import('../../lib/notificationService')).default;
  ({ sendNotificationEmail, platformPath } = await import('../../lib/email/notifications'));
});

beforeEach(() => {
  for (const key of [
    'NEXT_PUBLIC_BASE_URL',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_APP_URL',
    'EMAIL_FROM_ADDRESS',
    'RESEND_API_KEY',
    'NOTIFICATION_EMAIL_ENABLED',
  ]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;

  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  logSpy.mockRestore();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

function loggedText(): string {
  return [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
    .map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    .join('\n');
}

describe('createNotification — in-app and immediate email are independent channels', () => {
  it('D1: an eligible recipient gets one in-app row and one authorized provider attempt', async () => {
    const { client, inserted } = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const { transport, sends } = acceptingTransport();

    const created = await notificationService.createNotification(notificationData(), {
      client,
      transport,
    });

    expect(inserted).toHaveLength(1);
    expect(created).toMatchObject({ user_id: USER_ID, idempotency_key: IDEMPOTENCY_KEY });

    expect(sends).toHaveLength(1);
    const [{ message, options }] = sends;
    expect(message.to).toBe(RECIPIENT);
    expect(message.from).toBe('Genera <notificaciones@nuevaeducacion.org>');
    expect(message.subject).toBe('Licitación publicada');
    expect(message.html).toContain('Licitación publicada');
    expect(message.html).toContain('ya está publicada');
    expect(message.html).toContain(`${BASE_URL}/licitaciones`);
    expect(options).toEqual({ idempotencyKey: IDEMPOTENCY_KEY });

    // The browser journey renders exactly the body the provider was handed.
    // Unset everywhere else, so an ordinary run writes nothing.
    const captureDir = process.env.NOTIFICATION_EMAIL_CAPTURE_DIR;
    if (captureDir) {
      writeFileSync(join(captureDir, 'captured-notification-email.html'), message.html, 'utf8');
    }
  });

  it('D1: title and description are HTML-escaped, and only a platform path is linked', async () => {
    const { client } = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(
      notificationData({
        title: '<script>alert(1)</script> "Sesión"',
        description: "Rechazada por <b>Ana</b> & Co's",
        related_url: 'https://evil.example.com/phish',
      }),
      { client, transport }
    );

    const { html } = sends[0].message;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt; &amp; Co&#39;s');
    expect(html).not.toContain('evil.example.com');
    expect(html).toContain(`${BASE_URL}/notifications`);
  });

  it('D2: email still goes out when the in-app channel is switched off', async () => {
    const { client, inserted, calls } = world({
      preference: { email_enabled: true, in_app_enabled: false },
    });
    const { transport, sends } = acceptingTransport();

    const created = await notificationService.createNotification(notificationData(), {
      client,
      transport,
    });

    expect(created).toBeNull();
    expect(inserted).toHaveLength(0);
    expect(calls.filter((c) => c.table === 'user_notifications')).toHaveLength(0);
    expect(sends).toHaveLength(1);
    expect(sends[0].message.to).toBe(RECIPIENT);
  });

  it('D3: the in-app row is still written when only the email channel is switched off', async () => {
    const { client, inserted } = world({
      preference: { email_enabled: false, in_app_enabled: true },
    });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(inserted).toHaveLength(1);
    expect(transport).not.toHaveBeenCalled();
  });

  it('D3: both channels off means nothing is written and nothing is submitted', async () => {
    const { client, inserted } = world({
      preference: { email_enabled: false, in_app_enabled: false },
    });
    const { transport } = acceptingTransport();

    const created = await notificationService.createNotification(notificationData(), {
      client,
      transport,
    });

    expect(created).toBeNull();
    expect(inserted).toHaveLength(0);
    expect(transport).not.toHaveBeenCalled();
  });

  it('D3: a provider rejection is logged as not sent and never reported as a send', async () => {
    const { client, inserted } = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const transport = vi.fn(async () => ({ data: null, error: { message: 'domain not verified' } }));

    const created = await notificationService.createNotification(notificationData(), {
      client,
      transport,
    });

    // The in-app channel is unaffected by the provider's answer.
    expect(inserted).toHaveLength(1);
    expect(created).not.toBeNull();

    const text = loggedText();
    expect(text).toContain('NOT sent');
    expect(text).toContain('provider_rejected');
    expect(text).not.toContain('accepted by the provider');
  });

  it('D3: a transport that throws stays nonfatal for the notification trigger', async () => {
    const { client, inserted } = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const transport = vi.fn(async () => {
      throw new Error('socket hang up');
    });

    await expect(
      notificationService.createNotification(notificationData(), { client, transport })
    ).resolves.not.toBeNull();
    expect(inserted).toHaveLength(1);
    expect(loggedText()).toContain('transport_error');
  });

  it('D4: no preference row leaves both channels enabled', async () => {
    const { client, inserted } = world({ preference: null });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(inserted).toHaveLength(1);
    expect(sends).toHaveLength(1);
  });

  it('D4: the preference is read per notification type, not globally', async () => {
    const { client, calls } = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    const prefQuery = calls.find((c) => c.table === 'user_notification_preferences');
    expect(prefQuery?.filters).toEqual([
      ['eq', 'user_id', USER_ID],
      ['eq', 'notification_type', 'licitacion_published'],
    ]);
  });

  it('D4: a retry writes no second in-app row and reuses the same provider idempotency key', async () => {
    const first = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const { transport, sends } = acceptingTransport();
    await notificationService.createNotification(notificationData(), {
      client: first.client,
      transport,
    });

    // The retry's insert hits the row the first attempt wrote under the same key.
    const retry = world({
      preference: { email_enabled: true, in_app_enabled: true },
      insertError: KEY_CONFLICT,
    });
    const created = await notificationService.createNotification(notificationData(), {
      client: retry.client,
      transport,
    });

    expect(first.inserted).toHaveLength(1);
    expect(retry.inserted).toHaveLength(0);
    expect(created).toBeNull();
    // A keyed row is deduplicated by its key, never by the 60-second title check.
    expect(retry.calls.some((c) => c.table === 'user_notifications' && c.op === 'select')).toBe(false);

    expect(sends).toHaveLength(2);
    expect(sends[0].options.idempotencyKey).toBe(IDEMPOTENCY_KEY);
    expect(sends[1].options.idempotencyKey).toBe(sends[0].options.idempotencyKey);
  });

  it('D1: a caller that omits idempotency_key still gets one deterministic bounded key on both attempts', async () => {
    // The shape real callers actually use: pages/api/assignments/collaborative-submit.ts:122-129
    // passes no idempotency_key and no event_type, so the preference is read by category.
    // Before the fallback existed, a retry of that request was a second provider submission
    // even though the duplicate check suppressed its in-app row.
    const omittedKey = {
      user_id: USER_ID,
      title: 'Trabajo compartido contigo',
      description: 'Una compañera ha compartido un trabajo contigo para "Matemática 2026"',
      category: 'assignment',
      related_url: '/mi-aprendizaje/tareas?highlight=asg-1',
      importance: 'normal',
    };
    const { transport, sends } = acceptingTransport();

    const first = world({ preference: { email_enabled: true, in_app_enabled: true } });
    await notificationService.createNotification(omittedKey, { client: first.client, transport });

    // The retry sees the row the first attempt wrote.
    const retry = world({
      preference: { email_enabled: true, in_app_enabled: true },
      duplicateRows: [{ id: 'notif-1' }],
    });
    const created = await notificationService.createNotification(omittedKey, {
      client: retry.client,
      transport,
    });

    expect(first.inserted).toHaveLength(1);
    expect(first.inserted[0].idempotency_key).toBeNull();
    expect(retry.inserted).toHaveLength(0);
    expect(created).toBeNull();

    expect(sends).toHaveLength(2);
    const key = sends[0].options.idempotencyKey;
    expect(key).toMatch(/^notif-[0-9a-f]{64}$/);
    expect(key.length).toBeLessThanOrEqual(256); // the provider's Idempotency-Key bound
    expect(sends[1].options.idempotencyKey).toBe(key);
    // Derived from the notification's identity, and it carries none of it in the clear.
    expect(key).not.toContain(USER_ID);

    // A different notification to the same recipient is a different key, so the
    // fallback cannot be a constant that would suppress unrelated mail.
    const other = world({ preference: { email_enabled: true, in_app_enabled: true } });
    await notificationService.createNotification(
      { ...omittedKey, title: 'Nuevo trabajo entregado' },
      { client: other.client, transport }
    );
    expect(sends).toHaveLength(3);
    expect(sends[2].options.idempotencyKey).not.toBe(key);
  });

  it('D4: a unique-key collision on the in-app insert is absorbed and the email still runs', async () => {
    const { client } = world({
      preference: { email_enabled: true, in_app_enabled: true },
      insertError: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"',
      },
    });
    const { transport, sends } = acceptingTransport();

    const created = await notificationService.createNotification(notificationData(), {
      client,
      transport,
    });

    expect(created).toBeNull();
    expect(sends).toHaveLength(1);
  });

  it('D3: an in-app insert failure still lets the email run, then surfaces to the caller', async () => {
    const { client } = world({
      preference: { email_enabled: true, in_app_enabled: true },
      insertError: { code: '42501', message: 'permission denied' },
    });
    const { transport, sends } = acceptingTransport();

    await expect(
      notificationService.createNotification(notificationData(), { client, transport })
    ).rejects.toMatchObject({ code: '42501' });
    expect(sends).toHaveLength(1);
  });
});

describe('createNotification — log safety on failure branches (r1 D1)', () => {
  const SYNTHETIC_KEY = 're_synthetic_key_not_a_real_credential';

  it('R1-D1: an in-app insert failure naming the recipient id logs neither the id nor the database error', async () => {
    const { client } = world({
      preference: { email_enabled: false, in_app_enabled: true },
      insertError: {
        code: '23503',
        message: 'insert or update on table "user_notifications" violates foreign key constraint',
        details: `Key (user_id)=(${USER_ID}) is not present in table "users".`,
      },
    });

    await expect(notificationService.createNotification(notificationData(), { client })).rejects.toMatchObject({
      code: '23503',
    });

    const text = loggedText();
    expect(text).toContain('Database error creating notification');
    expect(text).not.toContain(USER_ID);
    expect(text).not.toContain('Key (user_id)');
    expect(text).not.toContain('foreign key');
  });

  it('R1-D1: a delivery exception carrying a credential and the recipient stays nonfatal and logs only its status', async () => {
    process.env.RESEND_API_KEY = SYNTHETIC_KEY;
    const { client } = world({
      profileThrows: new Error(`ECONNREFUSED apikey=${SYNTHETIC_KEY} user=${USER_ID} <${RECIPIENT}>`),
    });
    const { transport } = acceptingTransport();

    const result = await notificationService.sendImmediateEmail(client, notificationData(), transport);

    expect(result).toEqual({ sent: false, status: 'transport_error' });
    expect(transport).not.toHaveBeenCalled();
    const text = loggedText();
    expect(text).toContain('transport_error');
    for (const secret of [SYNTHETIC_KEY, USER_ID, RECIPIENT, 'ECONNREFUSED']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('NOTIFICATION_EMAIL_ENABLED — kill switch for the immediate email', () => {
  it('D4: unset keeps the immediate email on', async () => {
    const { client, inserted } = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(inserted).toHaveLength(1);
    expect(sends).toHaveLength(1);
    expect(sends[0].message.to).toBe(RECIPIENT);
  });

  it.each(['on', 'true', ''])('D4: "%s" also keeps the immediate email on', async (value) => {
    process.env.NOTIFICATION_EMAIL_ENABLED = value;
    const { client } = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(sends).toHaveLength(1);
  });

  it.each(['off', 'false', '0', 'OFF', ' False '])(
    'D4: "%s" suppresses the email before the recipient lookup or the provider',
    async (value) => {
      process.env.NOTIFICATION_EMAIL_ENABLED = value;
      process.env.RESEND_API_KEY = 're_synthetic_key_not_a_real_credential';
      const { client, calls } = world({ preference: { email_enabled: true, in_app_enabled: true } });
      const { transport } = acceptingTransport();

      const result = await notificationService.sendImmediateEmail(client, notificationData(), transport);

      expect(result).toEqual({ sent: false, status: 'disabled' });
      expect(transport).not.toHaveBeenCalled();
      expect(calls).toHaveLength(0);
      expect(loggedText()).toContain('disabled');
      expect(loggedText()).not.toContain('accepted by the provider');
    }
  );

  it.each([
    { in_app_enabled: true, email_enabled: true, rows: 1 },
    { in_app_enabled: true, email_enabled: false, rows: 1 },
    { in_app_enabled: false, email_enabled: true, rows: 0 },
    { in_app_enabled: false, email_enabled: false, rows: 0 },
  ])(
    'D4: with the switch off, in-app=$in_app_enabled email=$email_enabled writes $rows row(s) and sends nothing',
    async ({ in_app_enabled, email_enabled, rows }) => {
      process.env.NOTIFICATION_EMAIL_ENABLED = 'off';
      const { client, inserted } = world({ preference: { email_enabled, in_app_enabled } });
      const { transport } = acceptingTransport();

      await notificationService.createNotification(notificationData(), { client, transport });

      expect(inserted).toHaveLength(rows);
      expect(transport).not.toHaveBeenCalled();
    }
  );

  it('D5: with the switch unset, a provider refusal stays nonfatal and logs no recipient or credential', async () => {
    process.env.RESEND_API_KEY = 're_synthetic_key_not_a_real_credential';
    const { client, inserted } = world({ preference: { email_enabled: true, in_app_enabled: true } });
    const transport = vi.fn(async () => ({ data: null, error: { message: 'domain not verified' } }));

    const result = await notificationService.sendImmediateEmail(client, notificationData(), transport);
    await expect(
      notificationService.createNotification(notificationData(), { client, transport })
    ).resolves.not.toBeNull();

    expect(result).toMatchObject({ sent: false, status: 'provider_rejected' });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(inserted).toHaveLength(1);
    const text = loggedText();
    expect(text).toContain('provider_rejected');
    expect(text).not.toContain(RECIPIENT);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toContain('re_synthetic_key_not_a_real_credential');
  });
});

/** Every table the synchronous path may touch; the outbox is not one of them. */
const SYNC_TABLES = new Set([
  'user_notification_preferences',
  'user_notification_category_prefs',
  'user_notifications',
  'profiles',
  'user_roles',
  'schools',
]);

function touchedTables(calls: Array<{ table: string }>) {
  return new Set(calls.map((c) => c.table));
}

function categoryReads(calls: Array<{ table: string }>) {
  return calls.filter((c) => c.table === 'user_notification_category_prefs');
}

describe('createNotification — N1-03 email precedence on the live sync path (compat mode)', () => {
  const cancelled = () =>
    notificationData({
      event_type: 'session_cancelled',
      category: 'sessions',
      title: 'Sesión cancelada',
      related_url: '/meet/session/22222222-2222-4222-8222-222222222222',
    });

  it('D1: the mandatory event sends past a legacy false row and a category off', async () => {
    const { client, inserted } = world({
      preference: { email_enabled: false, in_app_enabled: true },
      categoryMode: 'off',
    });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(cancelled(), { client, transport });

    expect(sends).toHaveLength(1);
    expect(sends[0].message.subject).toBe('Sesión cancelada');
    expect(inserted).toHaveLength(1);
  });

  it('D1: a digest category mode gives exactly one immediate provider attempt and no outbox write', async () => {
    const { client, calls, inserted } = world({
      preference: { email_enabled: false, in_app_enabled: true },
      categoryMode: 'digest',
    });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(sends).toHaveLength(1);
    expect(sends[0].options).toEqual({ idempotencyKey: IDEMPOTENCY_KEY });
    expect(inserted).toHaveLength(1);
    for (const table of touchedTables(calls)) expect(SYNC_TABLES.has(table)).toBe(true);
  });

  it('D1: a category off gives no provider attempt, and the in-app row is still written', async () => {
    const { client, inserted } = world({
      preference: { email_enabled: true, in_app_enabled: true },
      categoryMode: 'off',
    });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(transport).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
  });

  it('D1: an immediate category mode overrides a legacy false row', async () => {
    const { client } = world({
      preference: { email_enabled: false, in_app_enabled: true },
      categoryMode: 'immediate',
    });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(sends).toHaveLength(1);
  });

  it('D1/D2: a default category row re-applies the legacy false row, and sends when there is none', async () => {
    const suppressed = world({ preference: { email_enabled: false, in_app_enabled: true }, categoryMode: 'default' });
    const open = world({ preference: null, categoryMode: 'default' });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client: suppressed.client, transport });
    expect(sends).toHaveLength(0);
    expect(suppressed.inserted).toHaveLength(1);

    await notificationService.createNotification(notificationData(), { client: open.client, transport });
    expect(sends).toHaveLength(1);
  });

  it('D1: the catalog default applies with no rows — digest sends now, off (system_update) sends nothing', async () => {
    const { transport, sends } = acceptingTransport();
    const digest = world({ preference: null });
    const off = world({ preference: null });

    await notificationService.createNotification(
      notificationData({ event_type: 'new_feedback', category: 'qa_support', title: 'Nuevo feedback' }),
      { client: digest.client, transport }
    );
    await notificationService.createNotification(
      notificationData({ event_type: 'system_update', category: 'system', title: 'Actualización del sistema' }),
      { client: off.client, transport }
    );

    expect(sends.map((s) => s.message.subject)).toEqual(['Nuevo feedback']);
    expect(off.inserted).toHaveLength(1);
  });

  it("D1: the category row read is the recipient's row for the event's catalog category", async () => {
    const { client, calls } = world({ preference: null });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(
      notificationData({ event_type: 'message_sent', category: 'mensajes' }),
      { client, transport }
    );

    const [read] = categoryReads(calls);
    expect(read.columns).toBe('email_mode');
    expect(read.filters).toEqual([
      ['eq', 'user_id', USER_ID],
      ['eq', 'category', 'community'],
    ]);
  });

  it('D2: a legacy false row for another type does not suppress; the row read is the exact event type', async () => {
    // The fake answers only the row the service asks for; an unrelated row never reaches it.
    const { client, calls } = world({ preference: null });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(sends).toHaveLength(1);
    const legacy = calls.find((c) => c.table === 'user_notification_preferences');
    expect(legacy?.filters).toEqual([
      ['eq', 'user_id', USER_ID],
      ['eq', 'notification_type', 'licitacion_published'],
    ]);
  });

  it('D3: in-app off with a category immediate is email-only; in-app on with category off is in-app-only', async () => {
    const emailOnly = world({ preference: { email_enabled: true, in_app_enabled: false }, categoryMode: 'immediate' });
    const inAppOnly = world({ preference: { email_enabled: true, in_app_enabled: true }, categoryMode: 'off' });
    const { transport, sends } = acceptingTransport();

    const first = await notificationService.createNotification(notificationData(), { client: emailOnly.client, transport });
    expect(first).toBeNull();
    expect(emailOnly.inserted).toHaveLength(0);
    expect(sends).toHaveLength(1);

    await notificationService.createNotification(notificationData(), { client: inAppOnly.client, transport });
    expect(inAppOnly.inserted).toHaveLength(1);
    expect(sends).toHaveLength(1);
  });

  it('D3: in-app off and category off writes nothing and sends nothing', async () => {
    const { client, inserted } = world({ preference: { email_enabled: true, in_app_enabled: false }, categoryMode: 'off' });
    const { transport } = acceptingTransport();

    const created = await notificationService.createNotification(notificationData(), { client, transport });

    expect(created).toBeNull();
    expect(inserted).toHaveLength(0);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(['off', 'false', '0'])(
    'D3: kill switch "%s" wins before the category read and the provider, even for the mandatory event',
    async (value) => {
      process.env.NOTIFICATION_EMAIL_ENABLED = value;
      const { client, calls, inserted } = world({
        preference: { email_enabled: true, in_app_enabled: true },
        categoryMode: 'immediate',
      });
      const { transport } = acceptingTransport();

      await notificationService.createNotification(cancelled(), { client, transport });

      expect(transport).not.toHaveBeenCalled();
      expect(categoryReads(calls)).toHaveLength(0);
      expect(calls.some((c) => c.table === 'profiles')).toBe(false);
      expect(inserted).toHaveLength(1);
      expect(loggedText()).toContain('disabled');
    }
  );

  it('D3: a retry under a digest mode keeps the same provider idempotency key and writes no second row', async () => {
    const { client, inserted } = world({ preference: null, categoryMode: 'digest' });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });
    const retry = world({ preference: null, categoryMode: 'digest', insertError: KEY_CONFLICT });
    await notificationService.createNotification(notificationData(), { client: retry.client, transport });

    expect(inserted).toHaveLength(1);
    expect(retry.inserted).toHaveLength(0);
    expect(sends.map((s) => s.options.idempotencyKey)).toEqual([IDEMPOTENCY_KEY, IDEMPOTENCY_KEY]);
  });

  it('D3: a provider refusal under a category mode stays nonfatal and keeps the in-app result', async () => {
    const { client, inserted } = world({ preference: null, categoryMode: 'immediate' });
    const transport = vi.fn(async () => ({ data: null, error: { message: 'domain not verified' } }));

    const created = await notificationService.createNotification(notificationData(), { client, transport });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({ user_id: USER_ID });
    expect(inserted).toHaveLength(1);
    expect(loggedText()).toContain('provider_rejected');
  });

  it.each([
    { name: 'legacy read error', options: { preferenceError: true, categoryMode: 'immediate' } },
    { name: 'category read error', options: { preference: null, categoryError: true } },
    { name: 'category read throws', options: { preference: null, categoryThrows: true } },
  ])('D4: a $name sends no email, keeps the in-app row and logs only a status', async ({ options }) => {
    process.env.RESEND_API_KEY = 're_synthetic_key_not_a_real_credential';
    const { client, calls, inserted } = world(options);
    const { transport } = acceptingTransport();

    const created = await notificationService.createNotification(notificationData(), { client, transport });

    expect(transport).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === 'profiles')).toBe(false);
    expect(inserted).toHaveLength(1);
    expect(created).not.toBeNull();
    const text = loggedText();
    expect(text).toContain('preference_unavailable');
    for (const leaked of [USER_ID, RECIPIENT, 're_synthetic_key_not_a_real_credential', 'canceling statement', 'socket hang up', 'JWT secret']) {
      expect(text).not.toContain(leaked);
    }
  });

  it('D4: a legacy read error skips the category read', async () => {
    const { client, calls } = world({ preferenceError: true });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(categoryReads(calls)).toHaveLength(0);
  });

  it('D4: a read error cannot silence the mandatory event', async () => {
    const { client } = world({ preferenceError: true });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(cancelled(), { client, transport });

    expect(sends).toHaveLength(1);
  });

  it('D4: an unknown event keeps the legacy rule and never reads a category row', async () => {
    const unknown = notificationData({ event_type: 'evento_desconocido', category: 'otros' });
    const suppressed = world({ preference: { email_enabled: false, in_app_enabled: true } });
    const open = world({ preference: null });
    const { transport, sends } = acceptingTransport();

    await notificationService.createNotification(unknown, { client: suppressed.client, transport });
    await notificationService.createNotification(unknown, { client: open.client, transport });

    expect(sends).toHaveLength(1);
    expect(categoryReads([...suppressed.calls, ...open.calls])).toHaveLength(0);
    expect(suppressed.inserted).toHaveLength(1);
  });

  it('D4: a notification with only a trigger category (no event type) keeps the legacy rule', async () => {
    const { client, calls } = world({ preference: { email_enabled: false, in_app_enabled: true } });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(notificationData({ event_type: undefined, category: 'system' }), {
      client,
      transport,
    });

    expect(transport).not.toHaveBeenCalled();
    expect(categoryReads(calls)).toHaveLength(0);
    const legacy = calls.find((c) => c.table === 'user_notification_preferences');
    expect(legacy?.filters).toContainEqual(['eq', 'notification_type', 'system']);
  });

  it.each(['weekly', 'IMMEDIATE', 1])('D4: an invalid stored mode %j is not an opt-in', async (categoryMode) => {
    const legacyFalse = world({ preference: { email_enabled: false, in_app_enabled: true }, categoryMode });
    const catalogOff = world({ preference: null, categoryMode });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client: legacyFalse.client, transport });
    await notificationService.createNotification(
      notificationData({ event_type: 'system_update', category: 'system' }),
      { client: catalogOff.client, transport }
    );

    expect(transport).not.toHaveBeenCalled();
  });

  it('D4: a mode supplied in the notification data never replaces the stored lookup', async () => {
    const { client, calls } = world({ preference: { email_enabled: false, in_app_enabled: true } });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(
      notificationData({ email_mode: 'immediate', categoryMode: 'immediate', mandatory: true }),
      { client, transport }
    );

    expect(transport).not.toHaveBeenCalled();
    expect(categoryReads(calls)).toHaveLength(1);
  });
});

describe('sendNotificationEmail — refusal matrix', () => {
  const input = {
    userId: USER_ID,
    title: 'Licitación publicada',
    description: 'La licitación "Matemática 2026" ya está publicada.',
    relatedUrl: '/licitaciones',
    idempotencyKey: IDEMPOTENCY_KEY,
  };

  it('D3: a QA tenant is suppressed before the provider is reached', async () => {
    const { client } = world({ schoolId: QA_SCHOOL_ID, schoolTenantKind: 'qa' });
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(client, input, transport);

    expect(result).toEqual({ sent: false, status: 'suppressed_qa' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('D3: a recipient with no address on file is never submitted', async () => {
    const { client } = world({ profileEmail: null });
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(client, input, transport);

    expect(result).toEqual({ sent: false, status: 'missing_recipient' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('D3: a failed recipient lookup is never submitted', async () => {
    const { client } = world({ profileError: true });
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(client, input, transport);

    expect(result).toEqual({ sent: false, status: 'recipient_lookup_failed' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('D3: a failed authorization lookup refuses instead of falling through to a send', async () => {
    const { client } = world({ rolesError: true });
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(client, input, transport);

    expect(result).toEqual({ sent: false, status: 'refused', detail: 'user_lookup_failed' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('D3: a rejected message reports the rejection, not a send', async () => {
    const { client } = world({});
    const transport = vi.fn(async () => ({ data: null, error: { message: 'domain not verified' } }));

    const result = await sendNotificationEmail(client, input, transport);

    expect(result).toEqual({
      sent: false,
      status: 'provider_rejected',
      detail: 'domain not verified',
    });
  });

  it('D3: an unconfigured provider reports not_configured and constructs no client', async () => {
    const { client } = world({});

    const result = await sendNotificationEmail(client, input);

    expect(result).toEqual({ sent: false, status: 'not_configured' });
  });

  it('D3: no recipient address and no provider credential ever reaches a log line', async () => {
    process.env.RESEND_API_KEY = 're_synthetic_key_not_a_real_credential';
    const { client } = world({ schoolId: QA_SCHOOL_ID, schoolTenantKind: 'qa' });
    const { transport } = acceptingTransport();

    await sendNotificationEmail(client, input, transport);
    await notificationService.createNotification(notificationData(), {
      client: world({ preference: { email_enabled: true, in_app_enabled: true } }).client,
      transport: vi.fn(async () => ({ data: null, error: { message: 'domain not verified' } })),
    });

    const text = loggedText();
    expect(text).not.toContain(RECIPIENT);
    expect(text).not.toContain('destinataria.sintetica');
    expect(text).not.toContain('ejemplo.invalid');
    expect(text).not.toContain('re_synthetic_key_not_a_real_credential');
    // A recipient may be a student: their user id is personal data too, and the
    // email outcome logs used to print it on both the sent and the not-sent path.
    expect(text).not.toContain(USER_ID);
    // Observability is not weakened: the refusal reason is still logged.
    expect(text).toContain('provider_rejected');
  });

  it('D1: an accepted message reports the provider id it was actually given', async () => {
    const { client } = world({});
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(client, input, transport);

    expect(result).toEqual({
      sent: true,
      status: 'provider_accepted',
      providerMessageId: 'provider-1',
    });
  });
});

describe('platformPath — only an in-app path is ever linked', () => {
  it('D1/D3: keeps a platform path and replaces anything that could leave the platform', () => {
    expect(platformPath('/licitaciones')).toBe('/licitaciones');
    expect(platformPath('/admin/sessions/approvals?id=7')).toBe('/admin/sessions/approvals?id=7');
    expect(platformPath('https://evil.example.com')).toBe('/notifications');
    expect(platformPath('//evil.example.com')).toBe('/notifications');
    expect(platformPath('/\\evil.example.com')).toBe('/notifications');
    expect(platformPath('/sessions/{session_id}')).toBe('/notifications');
    expect(platformPath('javascript:alert(1)')).toBe('/notifications');
    expect(platformPath(null)).toBe('/notifications');
  });
});

describe('local E2E mail mirror (N3-07) — the sync sender', () => {
  const MIRROR_ENV = ['E2E_MAIL_OUTBOX', 'VERCEL', 'VERCEL_ENV'];
  const savedMirrorEnv: Record<string, string | undefined> = {};
  let dir: string;
  let outbox: string;

  const mirrored = (): Array<{ to: string; subject: string; html: string }> =>
    existsSync(outbox)
      ? readFileSync(outbox, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
  const eligible = () => world({ preference: { email_enabled: true, in_app_enabled: true } });
  const input = {
    userId: USER_ID,
    title: 'Licitación publicada',
    description: 'La licitación "Matemática 2026" ya está publicada.',
    relatedUrl: '/licitaciones',
    idempotencyKey: IDEMPOTENCY_KEY,
  };

  beforeEach(() => {
    for (const key of MIRROR_ENV) {
      savedMirrorEnv[key] = process.env[key];
      delete process.env[key];
    }
    dir = mkdtempSync(join(tmpdir(), 'notif-mirror-'));
    outbox = join(dir, 'outbox.jsonl');
    process.env.E2E_MAIL_OUTBOX = outbox;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedMirrorEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('D2: an eligible notification mirrors exactly the recipient, subject and body the provider was handed, once', async () => {
    const { client, inserted } = eligible();
    const { transport, sends } = acceptingTransport();

    const created = await notificationService.createNotification(notificationData(), { client, transport });

    expect(created).toMatchObject({ user_id: USER_ID, idempotency_key: IDEMPOTENCY_KEY });
    expect(inserted).toHaveLength(1);
    expect(sends).toHaveLength(1);
    expect(sends[0].options).toEqual({ idempotencyKey: IDEMPOTENCY_KEY });
    const lines = mirrored();
    expect(lines).toEqual([
      { to: RECIPIENT, subject: 'Licitación publicada', html: sends[0].message.html },
    ]);
    expect(lines[0].html).toContain(`${BASE_URL}/licitaciones`);
  });

  it('D2: the mirror leaves the provider result as it was — accepted keeps its id', async () => {
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(eligible().client, input, transport);

    expect(result).toEqual({ sent: true, status: 'provider_accepted', providerMessageId: 'provider-1' });
    expect(mirrored()).toHaveLength(1);
  });

  it('D2: each provider attempt is mirrored once, a retry under the same key included', async () => {
    const { transport, sends } = acceptingTransport();

    await sendNotificationEmail(eligible().client, input, transport);
    await sendNotificationEmail(eligible().client, input, transport);

    expect(sends).toHaveLength(2);
    expect(sends[1].options.idempotencyKey).toBe(sends[0].options.idempotencyKey);
    expect(mirrored()).toHaveLength(2);
    expect(mirrored()[1]).toEqual(mirrored()[0]);
  });

  it('D2: with no provider configured the authorized message is still mirrored, and reported not_configured', async () => {
    const result = await sendNotificationEmail(eligible().client, input);

    expect(result).toEqual({ sent: false, status: 'not_configured' });
    expect(mirrored()).toEqual([expect.objectContaining({ to: RECIPIENT, subject: 'Licitación publicada' })]);
  });

  it.each([
    ['a QA tenant', { schoolId: QA_SCHOOL_ID, schoolTenantKind: 'qa' }, { sent: false, status: 'suppressed_qa' }],
    ['a failed authorization lookup', { rolesError: true }, { sent: false, status: 'refused', detail: 'user_lookup_failed' }],
    ['a recipient with no address', { profileEmail: null }, { sent: false, status: 'missing_recipient' }],
    ['a failed recipient lookup', { profileError: true }, { sent: false, status: 'recipient_lookup_failed' }],
  ] as const)('D4: %s leaves no mirrored mail and reaches no provider', async (_label, options, expected) => {
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(world(options as WorldOptions).client, input, transport);

    expect(result).toEqual(expected);
    expect(transport).not.toHaveBeenCalled();
    expect(existsSync(outbox)).toBe(false);
  });

  it('D4: an invalid sender leaves no mirrored mail and reaches no provider', async () => {
    process.env.EMAIL_FROM_ADDRESS = 'Genera notificaciones';
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(eligible().client, input, transport);

    expect(result).toEqual({ sent: false, status: 'not_configured', detail: 'invalid_sender' });
    expect(transport).not.toHaveBeenCalled();
    expect(existsSync(outbox)).toBe(false);
  });

  it('D4: a recipient who switched the email channel off gets their in-app row and no mirrored mail', async () => {
    const { client, inserted } = world({ preference: { email_enabled: false, in_app_enabled: true } });
    const { transport } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(inserted).toHaveLength(1);
    expect(transport).not.toHaveBeenCalled();
    expect(existsSync(outbox)).toBe(false);
  });

  it('D4: with capture unset nothing is written and delivery is unchanged', async () => {
    delete process.env.E2E_MAIL_OUTBOX;
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(eligible().client, input, transport);

    expect(result).toEqual({ sent: true, status: 'provider_accepted', providerMessageId: 'provider-1' });
    expect(readdirSync(dir)).toEqual([]);
  });

  it.each([
    ['VERCEL', '1'],
    ['VERCEL_ENV', 'production'],
  ])('D4: on a Vercel deployment (%s=%s) nothing is mirrored and delivery is unchanged', async (key, value) => {
    process.env[key] = value;
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(eligible().client, input, transport);

    expect(result).toEqual({ sent: true, status: 'provider_accepted', providerMessageId: 'provider-1' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('D4: a mirror that cannot be written does not alter delivery, and logs no recipient data', async () => {
    process.env.E2E_MAIL_OUTBOX = join(dir, 'no', 'such', 'dir', 'outbox.jsonl');
    const { transport } = acceptingTransport();

    const result = await sendNotificationEmail(eligible().client, input, transport);

    expect(result).toEqual({ sent: true, status: 'provider_accepted', providerMessageId: 'provider-1' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[outbox] could not append to the outbox', expect.anything());
    const text = loggedText();
    expect(text).not.toContain(RECIPIENT);
    expect(text).not.toContain(USER_ID);
    expect(JSON.stringify(result)).not.toContain(RECIPIENT);
  });

  it('D5: with the kill switch off nothing is sent, mirrored or read', async () => {
    process.env.NOTIFICATION_EMAIL_ENABLED = 'off';
    const { client, calls } = eligible();
    const { transport } = acceptingTransport();

    const result = await notificationService.sendImmediateEmail(client, notificationData(), transport);

    expect(result).toEqual({ sent: false, status: 'disabled' });
    expect(transport).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(existsSync(outbox)).toBe(false);
  });

  it('D5: the ordinary flow sends once and writes nothing new to the database', async () => {
    const { client, calls } = eligible();
    const { transport } = acceptingTransport();

    await notificationService.createNotification(notificationData(), { client, transport });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.op === 'insert').map((c) => c.table)).toEqual(['user_notifications']);
    expect(mirrored()).toHaveLength(1);
  });
});

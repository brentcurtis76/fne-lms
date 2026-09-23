// @vitest-environment node
import { writeFileSync } from 'node:fs';
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
  profileEmail?: string | null;
  profileError?: boolean;
  /** A school the recipient belongs to; omitted means an unscoped user. */
  schoolId?: number | null;
  schoolTenantKind?: string;
  rolesError?: boolean;
  /** Rows the duplicate check finds. */
  duplicateRows?: unknown[];
  insertError?: { code: string; message: string } | null;
}

function world(options: WorldOptions = {}) {
  const inserted: any[] = [];
  const { client, calls } = createFakeSupabase({
    user_notification_preferences: () => ({
      data: options.preference === undefined ? null : options.preference,
      error: null,
    }),
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

    // The retry sees the row the first attempt wrote.
    const retry = world({
      preference: { email_enabled: true, in_app_enabled: true },
      duplicateRows: [{ id: 'notif-1' }],
    });
    const created = await notificationService.createNotification(notificationData(), {
      client: retry.client,
      transport,
    });

    expect(first.inserted).toHaveLength(1);
    expect(retry.inserted).toHaveLength(0);
    expect(created).toBeNull();

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

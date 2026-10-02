// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * /api/feedback/notify-admins, driven through the real handler and the real
 * notificationService. Only the edges are replaced: the caller's identity
 * (getApiUser), the database (one in-memory fake behind both the route's
 * service client and notificationService's module client) and the e-mail
 * transport. Synthetic data throughout; no real address, tenant or credential.
 */

const { state, fakeClient, mockGetApiUser } = vi.hoisted(() => {
  // notificationService checks these at import time; the fake below replaces
  // the client they would configure.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  type Recorded = {
    table: string;
    op: 'select' | 'insert';
    columns?: string;
    payload?: any;
    filters: Array<[string, string, unknown]>;
  };
  const state: {
    feedbackRow: Record<string, unknown> | null;
    feedbackError: unknown;
    adminRows: Array<{ user_id: unknown }>;
    rolesError: unknown;
    triggers: unknown[];
    emails: Record<string, string>;
    mustChangePassword: boolean;
    calls: Recorded[];
    rpcCalls: Array<{ fn: string; args: any }>;
    inserted: any[];
    insertFails: boolean;
    emailLookupError: Error | null;
    preference: { email_enabled: boolean; in_app_enabled: boolean } | null;
    /** A row under this notification's idempotency key already exists: the insert is a unique-key conflict. */
    existingNotification: boolean;
    transport: any;
    /** Keyed `<table>.<op>` or `rpc.<fn>`: that query returns `error` or throws `throws`. */
    faults: Record<string, { error?: unknown; throws?: Error }>;
  } = {
    feedbackRow: null,
    feedbackError: null,
    adminRows: [],
    rolesError: null,
    triggers: [],
    emails: {},
    mustChangePassword: false,
    calls: [],
    rpcCalls: [],
    inserted: [],
    insertFails: false,
    emailLookupError: null,
    preference: null,
    existingNotification: false,
    transport: undefined,
    faults: {},
  };

  function injectedFault(key: string): { data: null; error: unknown } | null {
    const fault = state.faults[key];
    if (!fault) return null;
    if (fault.throws) throw fault.throws;
    return { data: null, error: fault.error };
  }

  function respond(q: Recorded): { data: unknown; error: unknown } {
    const idFilter = q.filters.find(([, column]) => column === 'id')?.[2] as string | undefined;
    const faulted = injectedFault(`${q.table}.${q.op}`);
    if (faulted) return faulted;
    switch (q.table) {
      case 'platform_feedback':
        return { data: state.feedbackError ? null : state.feedbackRow, error: state.feedbackError };
      case 'user_roles':
        if (q.columns === 'user_id') {
          return { data: state.rolesError ? null : state.adminRows, error: state.rolesError };
        }
        // authorizeUserEmail: the recipient's school memberships.
        return { data: [], error: null };
      case 'profiles':
        if (q.columns === 'must_change_password') {
          return { data: { must_change_password: state.mustChangePassword }, error: null };
        }
        if (q.columns === 'role') return { data: { role: 'admin' }, error: null };
        if (q.columns === 'school_id') return { data: { school_id: null }, error: null };
        if (state.emailLookupError) throw state.emailLookupError;
        return { data: { email: idFilter ? state.emails[idFilter] ?? null : null }, error: null };
      case 'user_notification_preferences':
        return { data: state.preference, error: null };
      case 'user_notification_category_prefs':
        // No admin has chosen a category mode: the catalog default decides.
        return { data: null, error: null };
      case 'user_notifications':
        if (q.op === 'insert') {
          if (state.insertFails) {
            // What Postgres reports for a recipient that is not a user: the id is in the details.
            return {
              data: null,
              error: {
                code: '23503',
                message: 'insert or update on table "user_notifications" violates foreign key constraint',
                details: `Key (user_id)=(${q.payload.user_id}) is not present in table "users".`,
              },
            };
          }
          if (state.existingNotification) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' },
            };
          }
          state.inserted.push(q.payload);
          return { data: { id: `notif-${state.inserted.length}`, ...q.payload }, error: null };
        }
        return { data: [], error: null };
      default:
        throw new Error(`fake supabase: unexpected table "${q.table}"`);
    }
  }

  const fakeClient = {
    from(table: string) {
      const q: Recorded = { table, op: 'select', filters: [] };
      state.calls.push(q);
      const resolve = () => Promise.resolve(respond(q));
      const builder: any = {
        select(columns?: string) {
          if (q.op === 'select') q.columns = columns;
          return builder;
        },
        insert(payload: unknown) {
          q.op = 'insert';
          q.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          q.filters.push(['eq', column, value]);
          return builder;
        },
        gte(column: string, value: unknown) {
          q.filters.push(['gte', column, value]);
          return builder;
        },
        in(column: string, value: unknown) {
          q.filters.push(['in', column, value]);
          return builder;
        },
        not(column: string, operator: string, value: unknown) {
          q.filters.push(['not', column, `${operator}:${String(value)}`]);
          return builder;
        },
        limit: () => builder,
        single: resolve,
        maybeSingle: resolve,
        then: (onFulfilled: any, onRejected?: any) => resolve().then(onFulfilled, onRejected),
      };
      return builder;
    },
    async rpc(fn: string, args: any) {
      state.rpcCalls.push({ fn, args });
      const faulted = injectedFault(`rpc.${fn}`);
      if (faulted) return faulted;
      if (fn === 'get_active_triggers') return { data: state.triggers, error: null };
      return { data: null, error: null };
    },
  };

  return { state, fakeClient, mockGetApiUser: vi.fn() };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createClient: () => fakeClient };
});

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: () => fakeClient,
  };
});

vi.mock('../../../lib/email/notifications', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../../../lib/email/notifications');
  return {
    ...actual,
    sendNotificationEmail: (client: any, input: any) =>
      actual.sendNotificationEmail(client, input, state.transport),
  };
});

import handler from '../../../pages/api/feedback/notify-admins';
import notificationService from '../../../lib/notificationService';

const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_TENANT_USER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ATTACKER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FEEDBACK_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ADMIN_A_EMAIL = 'admin.a.sintetico@ejemplo.invalid';
const ADMIN_B_EMAIL = 'admin.b.sintetico@ejemplo.invalid';
const SYNTHETIC_KEY = 're_synthetic_key_not_a_real_credential';

/** A stored body that must never leave the row: markup plus minor data. */
const STORED_BODY =
  '<img src=x onerror=alert(1)> La alumna Sofía Muñoz Pérez (4°B, RUT 12.345.678-9) no puede entrar';
const STORED_PAGE_URL = 'https://genera.test/estudiantes/sofia-munoz';

function storedRow(overrides: Record<string, unknown> = {}) {
  // The whole stored row, as a careless `select('*')` would return it.
  return {
    id: FEEDBACK_ID,
    created_by: CREATOR_ID,
    type: 'bug',
    description: STORED_BODY,
    page_url: STORED_PAGE_URL,
    ...overrides,
  };
}

function acceptingTransport() {
  const sends: Array<{ message: any; options: any }> = [];
  const transport = vi.fn(async (message: any, options: any) => {
    sends.push({ message, options });
    return { data: { id: `provider-${sends.length}` }, error: null };
  });
  return { transport, sends };
}

async function call(body: unknown, method: 'POST' | 'GET' = 'POST') {
  const { req, res } = createMocks({ method, body: body as any });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: res._getJSONData(), text: res._getData() as string };
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
const savedEnv: Record<string, string | undefined> = {};

function loggedText(): string {
  return [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
    .map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    .join('\n');
}

beforeEach(() => {
  for (const key of ['NOTIFICATION_EMAIL_ENABLED', 'RESEND_API_KEY', 'NEXT_PUBLIC_BASE_URL', 'EMAIL_FROM_ADDRESS']) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_BASE_URL = 'https://genera.test';

  Object.assign(state, {
    feedbackRow: storedRow(),
    feedbackError: null,
    adminRows: [{ user_id: ADMIN_A }, { user_id: ADMIN_B }],
    rolesError: null,
    triggers: [],
    emails: { [ADMIN_A]: ADMIN_A_EMAIL, [ADMIN_B]: ADMIN_B_EMAIL },
    mustChangePassword: false,
    calls: [],
    rpcCalls: [],
    inserted: [],
    insertFails: false,
    emailLookupError: null,
    preference: null,
    existingNotification: false,
    transport: acceptingTransport().transport,
    faults: {},
  });
  mockGetApiUser.mockReset();
  mockGetApiUser.mockResolvedValue({ user: { id: CREATOR_ID }, error: null });

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
  vi.restoreAllMocks();
});

function feedbackQueries() {
  return state.calls.filter((c) => c.table === 'platform_feedback');
}

function nothingSent() {
  expect(state.inserted).toHaveLength(0);
  expect(state.transport).not.toHaveBeenCalled();
  expect(state.rpcCalls.filter((c) => c.fn === 'get_active_triggers')).toHaveLength(0);
}

describe('notify-admins — the creator triggers, the server decides (D1)', () => {
  it('D1: the creator posting only a persisted feedback_id notifies every active admin with server-derived text', async () => {
    const { transport, sends } = acceptingTransport();
    state.transport = transport;
    state.adminRows = [{ user_id: ADMIN_A }, { user_id: ADMIN_B }, { user_id: ADMIN_A }];

    const { status, json } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json).toEqual({ success: true, message: 'Administradores notificados', notificationsCreated: 2 });

    // The row is read by id, and only the columns the decision needs.
    const [feedbackQuery] = feedbackQueries();
    expect(feedbackQuery.columns).toBe('id, created_by, type');
    expect(feedbackQuery.filters).toContainEqual(['eq', 'id', FEEDBACK_ID]);

    // Recipients: active literal admin role rows, de-duplicated.
    const rolesQuery = state.calls.find((c) => c.table === 'user_roles' && c.columns === 'user_id')!;
    expect(rolesQuery.filters).toEqual([
      ['eq', 'role_type', 'admin'],
      ['eq', 'is_active', true],
    ]);
    expect(state.inserted.map((n) => n.user_id).sort()).toEqual([ADMIN_A, ADMIN_B]);

    for (const row of state.inserted) {
      expect(row.title).toBe('Nuevo feedback recibido');
      expect(row.description).toBe('Nuevo reporte de tipo Problema...');
      // A mapped event is stored under its catalog category, not the trigger's `admin`.
      expect(row.category).toBe('qa_support');
    }

    // The existing immediate-email path carries the same generic text.
    expect(sends.map((s) => s.message.to).sort()).toEqual([ADMIN_A_EMAIL, ADMIN_B_EMAIL]);
    // Each admin's missing category row leaves the catalog digest, sent now in compat mode.
    const categoryQueries = state.calls.filter((c) => c.table === 'user_notification_category_prefs');
    expect(categoryQueries.map((c) => c.filters).sort()).toEqual([
      [['eq', 'user_id', ADMIN_A], ['eq', 'category', 'qa_support']],
      [['eq', 'user_id', ADMIN_B], ['eq', 'category', 'qa_support']],
    ]);
    for (const { message } of sends) {
      expect(message.subject).toBe('Nuevo feedback recibido');
      expect(message.html).toContain('Nuevo reporte de tipo Problema');
    }
  });

  it.each([
    ['idea', 'Nuevo reporte de tipo Idea...'],
    ['feedback', 'Nuevo reporte de tipo Comentario...'],
  ])('D1: the wording follows the persisted type "%s"', async (type, description) => {
    state.feedbackRow = storedRow({ type });

    const { status } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(state.inserted.map((n) => n.description)).toEqual([description, description]);
  });
});

describe('notify-admins — authentication and tampering (D2)', () => {
  it.each([
    ['no session', { user: null, error: new Error('No active session') }],
    ['an invalid token', { user: null, error: new Error('Invalid token') }],
  ])('D2: %s is refused with 401 before anything is read', async (_label, authResult) => {
    mockGetApiUser.mockResolvedValue(authResult);

    const { status, json } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(401);
    expect(json).toEqual({ error: 'Debes iniciar sesión' });
    expect(json.success).toBeUndefined();
    expect(state.calls).toHaveLength(0);
    nothingSent();
  });

  it.each([
    ['another user in the same school', OTHER_USER_ID],
    ['a user of another tenant', OTHER_TENANT_USER_ID],
  ])('D2: a feedback row created by %s is refused with 403', async (_label, createdBy) => {
    state.feedbackRow = storedRow({ created_by: createdBy });

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(403);
    expect(json).toEqual({ error: 'No tienes permiso para notificar este feedback' });
    expect(text).not.toContain('Sofía');
    expect(text).not.toContain(createdBy);
    nothingSent();
  });

  it('D2: an account held by a forced password change is refused before the row is read', async () => {
    state.mustChangePassword = true;

    const { status } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(403);
    expect(feedbackQueries()).toHaveLength(0);
    nothingSent();
  });

  it('D2: caller-supplied recipients, name, preview and URL never reach a recipient, the text or the mail', async () => {
    const { transport, sends } = acceptingTransport();
    state.transport = transport;

    const { status, json } = await call({
      feedback_id: FEEDBACK_ID,
      assigned_users: [ATTACKER_ID],
      user_name: '<b>Atacante</b>',
      user_email: 'atacante@ejemplo.invalid',
      description: 'TEXTO_INYECTADO <script>alert(1)</script>',
      feedback_preview: 'TEXTO_INYECTADO',
      page_url: 'https://evil.example.com/phish',
      related_url: 'https://evil.example.com/phish',
      feedbackData: { assigned_users: [ATTACKER_ID], description: 'TEXTO_INYECTADO' },
    });

    expect(status).toBe(200);
    expect(json.notificationsCreated).toBe(2);
    expect(state.inserted.map((n) => n.user_id).sort()).toEqual([ADMIN_A, ADMIN_B]);
    expect(sends.map((s) => s.message.to).sort()).toEqual([ADMIN_A_EMAIL, ADMIN_B_EMAIL]);

    const everything = JSON.stringify({
      inserted: state.inserted,
      mail: sends.map((s) => s.message),
      audit: state.rpcCalls,
      logs: loggedText(),
      response: json,
    });
    for (const injected of [ATTACKER_ID, 'Atacante', 'atacante@', 'TEXTO_INYECTADO', '<script>', 'evil.example.com']) {
      expect(everything).not.toContain(injected);
    }
  });

  it('D2: a DB template that asks for caller fields cannot pull caller text in', async () => {
    const { transport, sends } = acceptingTransport();
    state.transport = transport;
    state.triggers = [
      {
        trigger_id: 'db-new-feedback',
        category: 'admin',
        template: {
          title_template: 'Feedback de {user_name}',
          description_template: '{description}',
          url_template: '{page_url}',
          importance: 'high',
        },
      },
    ];

    const { status } = await call({
      feedback_id: FEEDBACK_ID,
      user_name: 'TEXTO_INYECTADO',
      description: 'TEXTO_INYECTADO',
      page_url: 'https://evil.example.com/phish',
    });

    expect(status).toBe(200);
    expect(state.inserted.map((n) => n.title)).toEqual(['Nuevo feedback recibido', 'Nuevo feedback recibido']);
    const everything = JSON.stringify({ inserted: state.inserted, mail: sends.map((s) => s.message) });
    expect(everything).not.toContain('TEXTO_INYECTADO');
    expect(everything).not.toContain('evil.example.com');
  });
});

describe('notify-admins — validation and failures (D3)', () => {
  it.each([
    ['a missing body', undefined],
    ['a missing id', {}],
    ['a non-string id', { feedback_id: 42 }],
    ['a non-UUID id', { feedback_id: 'FB-1234' }],
    ['the legacy client payload', { feedbackData: { feedback_id: FEEDBACK_ID, assigned_users: [ATTACKER_ID] } }],
  ])('D3: %s is a 400 and nothing is read or sent', async (_label, body) => {
    const { status, json } = await call(body);

    expect(status).toBe(400);
    expect(json).toEqual({ error: 'Identificador de feedback inválido' });
    expect(feedbackQueries()).toHaveLength(0);
    nothingSent();
  });

  it('D3: a method other than POST is a 405', async () => {
    const { status, json } = await call(undefined, 'GET');

    expect(status).toBe(405);
    expect(json).toEqual({ error: 'Método no permitido' });
    expect(state.calls).toHaveLength(0);
  });

  it('D3: an id with no persisted row is a 404', async () => {
    state.feedbackRow = null;

    const { status, json } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(404);
    expect(json).toEqual({ error: 'Feedback no encontrado' });
    nothingSent();
  });

  it('D3: no active admin is a 200 with zero notifications and no send', async () => {
    state.adminRows = [];

    const { status, json } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json).toEqual({
      success: true,
      message: 'No hay administradores activos para notificar',
      notificationsCreated: 0,
    });
    nothingSent();
  });

  it('D3: a failed feedback lookup is a 500 that reveals neither the database error nor the row', async () => {
    state.feedbackError = { message: 'permission denied for relation platform_feedback; key=secret-123' };

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(500);
    expect(json).toEqual({ error: 'No se pudo verificar el feedback' });
    expect(text).not.toContain('secret-123');
    expect(loggedText()).not.toContain('secret-123');
    nothingSent();
  });

  it('D3: a failed admin lookup is a 500 and nothing is sent', async () => {
    state.rolesError = { message: 'connection reset; key=secret-123' };

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(500);
    expect(json).toEqual({ error: 'No se pudo obtener la lista de administradores' });
    expect(text).not.toContain('secret-123');
    expect(text).not.toContain('Sofía');
    nothingSent();
  });

  it('D3: an unexpected exception is a generic es-CL 500', async () => {
    mockGetApiUser.mockRejectedValue(new Error(`boom ${SYNTHETIC_KEY}`));

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(500);
    expect(json).toEqual({ success: false, error: 'Error interno del servidor' });
    expect(text).not.toContain(SYNTHETIC_KEY);
    nothingSent();
  });
});

describe('notify-admins — output after a valid trigger (D5)', () => {
  /** Stored feedback content, markup and the credential: never anywhere. */
  const CONTENT = ['Sofía', 'Muñoz', '12.345.678-9', '<img', 'onerror', STORED_PAGE_URL, SYNTHETIC_KEY];
  /** Recipient identifiers: allowed only where they address the row or the mail. */
  const RECIPIENTS = [ADMIN_A, ADMIN_B, ADMIN_A_EMAIL, ADMIN_B_EMAIL, 'ejemplo.invalid'];

  function assertAbsent(texts: string[], secrets: string[]) {
    const all = texts.join('\n');
    for (const secret of secrets) {
      expect(all).not.toContain(secret);
    }
  }

  function notificationText() {
    return JSON.stringify(
      state.inserted.map(({ title, description, related_url }) => ({ title, description, related_url }))
    );
  }

  it('D5: a provider refusal stays nonfatal and nothing sensitive reaches the logs, the response or the mail', async () => {
    process.env.RESEND_API_KEY = SYNTHETIC_KEY;
    const messages: any[] = [];
    state.transport = vi.fn(async (message: any) => {
      messages.push(message);
      return { data: null, error: { message: 'domain not verified' } };
    });

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(state.inserted).toHaveLength(2);
    expect(messages).toHaveLength(2);
    expect(loggedText()).toContain('provider_rejected');

    assertAbsent([loggedText(), text], [...CONTENT, ...RECIPIENTS]);
    assertAbsent([notificationText(), JSON.stringify(state.rpcCalls)], CONTENT);
    for (const message of messages) {
      // The address is the envelope; the body carries neither it nor stored content.
      assertAbsent([message.subject, message.html], [...CONTENT, ...RECIPIENTS]);
    }
  });

  it('D5: a transport exception stays nonfatal and is logged without recipient or credential', async () => {
    process.env.RESEND_API_KEY = SYNTHETIC_KEY;
    state.transport = vi.fn(async () => {
      throw new Error('socket hang up');
    });

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json).toEqual({ success: true, message: 'Administradores notificados', notificationsCreated: 2 });
    expect(loggedText()).toContain('transport_error');
    assertAbsent([loggedText(), text], [...CONTENT, ...RECIPIENTS]);
    assertAbsent([notificationText()], CONTENT);
  });
});

describe('notify-admins — log safety on exception and failure branches (r1 D1)', () => {
  /** A credential, a recipient id or address, stored content, or raw error text: never in a log line. */
  const NEVER_LOGGED = [
    SYNTHETIC_KEY,
    ADMIN_A,
    ADMIN_B,
    ADMIN_A_EMAIL,
    ADMIN_B_EMAIL,
    'ejemplo.invalid',
    'Sofía',
    'Key (user_id)',
    'ECONNREFUSED',
  ];

  function assertNothingLogged(response: string) {
    const all = `${loggedText()}\n${response}`;
    for (const secret of NEVER_LOGGED) {
      expect(all).not.toContain(secret);
    }
  }

  it('R1-D1: a getApiUser exception carrying a credential is a generic 500 and the credential is not logged', async () => {
    mockGetApiUser.mockRejectedValue(new Error(`ECONNREFUSED apikey=${SYNTHETIC_KEY}`));

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(500);
    expect(json).toEqual({ success: false, error: 'Error interno del servidor' });
    expect(loggedText()).toContain('[notify-admins] unexpected error');
    assertNothingLogged(text);
    nothingSent();
  });

  it('R1-D1: a notification delivery that throws a credential and a recipient id is a generic 500 that logs neither', async () => {
    vi.spyOn(notificationService, 'triggerNotification').mockRejectedValue(
      new Error(`ECONNREFUSED apikey=${SYNTHETIC_KEY} recipient=${ADMIN_A}`)
    );

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(500);
    expect(json).toEqual({ success: false, error: 'Error interno del servidor' });
    expect(loggedText()).toContain('[notify-admins] unexpected error');
    assertNothingLogged(text);
  });

  it('R1-D1: an e-mail delivery exception carrying a credential and a recipient id stays nonfatal and logs only its status', async () => {
    process.env.RESEND_API_KEY = SYNTHETIC_KEY;
    state.emailLookupError = new Error(`ECONNREFUSED apikey=${SYNTHETIC_KEY} user=${ADMIN_A} <${ADMIN_A_EMAIL}>`);

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json).toEqual({ success: true, message: 'Administradores notificados', notificationsCreated: 2 });
    expect(state.transport).not.toHaveBeenCalled();
    expect(loggedText()).toContain('transport_error');
    assertNothingLogged(text);
  });

  it('R1-D1: an in-app insert failure that names the admin UUID stays nonfatal and the UUID is not logged', async () => {
    state.insertFails = true;

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json).toEqual({ success: true, message: 'Administradores notificados', notificationsCreated: 0 });
    expect(state.inserted).toHaveLength(0);
    expect(loggedText()).toContain('Failed to create notification for trigger code-default-new_feedback');
    assertNothingLogged(text);
  });

  it.each([
    ['both channels switched off', { preference: { email_enabled: false, in_app_enabled: false } }, 'has disabled'],
    ['a repeat of a notification sent a moment ago', { existingNotification: true }, 'Duplicate notification prevented by idempotency key'],
  ])('R1-D1: an admin skipped for %s is logged without the admin UUID', async (_label, setup, logged) => {
    Object.assign(state, setup);

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(state.inserted).toHaveLength(0);
    // A keyed row is deduplicated by the unique key, never by the 60-second title check.
    expect(state.calls.filter((c) => c.table === 'user_notifications' && c.op === 'select')).toHaveLength(0);
    expect(loggedText()).toContain(logged);
    assertNothingLogged(text);
  });
});

describe('notify-admins — log safety on every new_feedback service branch (r2 D1)', () => {
  const NEVER_LOGGED = [SYNTHETIC_KEY, ADMIN_A, ADMIN_B, ADMIN_A_EMAIL, ADMIN_B_EMAIL, 'ejemplo.invalid', 'Key (user_id)', 'ECONNREFUSED'];

  /** What PostgREST returns: a SQLSTATE code plus text that names the queried admin and a credential. */
  const returnedError = () => ({
    code: '42501',
    message: `permission denied for apikey=${SYNTHETIC_KEY}`,
    details: `Key (user_id)=(${ADMIN_A}) is not visible`,
    hint: `recipient ${ADMIN_A_EMAIL}`,
  });
  /** A thrown exception whose code field is not a SQLSTATE: the code must not be logged either. */
  const thrownError = () =>
    Object.assign(new Error(`ECONNREFUSED apikey=${SYNTHETIC_KEY} user_id=${ADMIN_A} <${ADMIN_A_EMAIL}>`), {
      code: `apikey=${SYNTHETIC_KEY}`,
    });

  function assertNothingLogged(response: string) {
    const all = `${loggedText()}\n${response}`;
    for (const secret of NEVER_LOGGED) {
      expect(all).not.toContain(secret);
    }
  }

  function assertDelivered(result: { status: number; json: any }) {
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ success: true, message: 'Administradores notificados', notificationsCreated: 2 });
    expect(state.inserted.map((n) => n.user_id).sort()).toEqual([ADMIN_A, ADMIN_B]);
  }

  it.each([
    ['active-trigger lookup returns', 'rpc.get_active_triggers', 'Error fetching triggers'],
    ['active-trigger lookup throws', 'rpc.get_active_triggers', 'Exception fetching triggers'],
    ['audit RPC returns', 'rpc.log_notification_event', 'Error logging notification event'],
    ['audit RPC throws', 'rpc.log_notification_event', 'Exception logging notification event'],
    ['preference lookup throws', 'user_notification_preferences.select', 'Error fetching notification preferences'],
  ])('R2-D1: when the %s an error naming a credential and the admin, delivery continues and only the bounded line is logged', async (label, key, logged) => {
    const thrown = label.endsWith('throws');
    state.faults[key] = thrown ? { throws: thrownError() } : { error: returnedError() };

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    assertDelivered({ status, json });
    expect(loggedText()).toContain(logged);
    if (thrown) expect(loggedText()).not.toContain('"code"');
    else expect(loggedText()).toContain('{"code":"42501"}');
    assertNothingLogged(text);
  });

  it('R2-D1: a preference lookup that returns an error naming the admin keeps the in-app row, suppresses the e-mail and logs nothing of it', async () => {
    state.faults['user_notification_preferences.select'] = { error: returnedError() };

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    assertDelivered({ status, json });
    expect(state.transport).not.toHaveBeenCalled(); // N1-03: an unread preference never sends
    expect(loggedText()).toContain('preference_unavailable');
    assertNothingLogged(text);
  });

  it('R2-D1: a DB template that throws an error naming a credential and the admin falls back to code defaults and logs only the bounded line', async () => {
    const template = {
      get title_template(): string {
        throw thrownError();
      },
    };
    state.triggers = [{ trigger_id: 'db-new-feedback', category: 'admin', template }];

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    assertDelivered({ status, json });
    expect(state.inserted.map((n) => n.title)).toEqual(['Nuevo feedback recibido', 'Nuevo feedback recibido']);
    expect(loggedText()).toContain('Error generating content');
    assertNothingLogged(text);
  });

  it.each([
    ['returns', false],
    ['throws', true],
  ])('R2-D1: when the keyed insert (the retry dedup) %s an error naming a credential and the admin, delivery stays nonfatal and only the bounded line is logged', async (_label, thrown) => {
    state.faults['user_notifications.insert'] = thrown ? { throws: thrownError() } : { error: returnedError() };

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json).toEqual({ success: true, message: 'Administradores notificados', notificationsCreated: 0 });
    expect(state.inserted).toHaveLength(0);
    expect(state.calls.filter((c) => c.table === 'user_notifications' && c.op === 'select')).toHaveLength(0);
    expect(loggedText()).toContain('❌ Failed to create notification for trigger code-default-new_feedback');
    expect(loggedText()).not.toContain('"code"');
    assertNothingLogged(text);
  });

  it.each([
    ['a DB trigger', [{ trigger_id: 'db-new-feedback', category: 'admin', template: null }], '❌ Error processing trigger db-new-feedback'],
    ['the code defaults', [], '❌ Error processing code-based notification for new_feedback'],
  ])('R2-D1: an exception naming the admin inside %s stays nonfatal and logs only the bounded trigger line', async (_label, triggers, logged) => {
    state.triggers = triggers;
    vi.spyOn(notificationService, 'getRecipients').mockRejectedValue(thrownError());

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(200);
    expect(json).toEqual({ success: true, message: 'Administradores notificados', notificationsCreated: 0 });
    expect(loggedText()).toContain('Error processing notification');
    expect(loggedText()).toContain(logged);
    assertNothingLogged(text);
  });

  it('R2-D1: an exception that fails the whole trigger is a generic 500 whose body and logs carry none of it', async () => {
    vi.spyOn(notificationService, 'getActiveTriggers').mockRejectedValue(thrownError());

    const { status, json, text } = await call({ feedback_id: FEEDBACK_ID });

    expect(status).toBe(500);
    expect(json).toEqual({ success: false, error: 'No se pudo notificar a los administradores' });
    expect(loggedText()).toContain('❌ Notification trigger failed for new_feedback');
    expect(state.rpcCalls.filter((c) => c.fn === 'log_notification_event').map((c) => c.args.p_status)).toEqual(['failed']);
    assertNothingLogged(text);
  });
});

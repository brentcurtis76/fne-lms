// @vitest-environment node
/**
 * PASANTÍAS PANEL — the two daily jobs, the admin's "send now" route and the
 * traveller's own routes ("Mi pasantía").
 *
 * `lib/api-auth` is faked at the module boundary (identity, password verdict,
 * service-role client) and `sendLetter` is replaced: what it does is proven in
 * `__tests__/lib/pasantias/panel/letter-delivery.test.ts`. These tests pin WHO
 * each route lets in, WHICH travellers the letter job picks, and the order of
 * the retention sweep.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { fakePanel, type Answer, type FakePanel, type PanelQuery, type PanelRpc, type StorageCall } from '../lib/pasantias/panel/fake-panel-supabase';

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockGetVerdict, mockGetApiUser, mockSendLetter } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetVerdict: vi.fn(),
  mockGetApiUser: vi.fn(),
  mockSendLetter: vi.fn(),
}));

vi.mock('../../lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api-auth')>('../../lib/api-auth');
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
    getForcedPasswordChangeVerdict: mockGetVerdict,
    getApiUser: mockGetApiUser,
  };
});

vi.mock('../../lib/pasantias/panel/letter-delivery', async () => {
  const actual = await vi.importActual<typeof import('../../lib/pasantias/panel/letter-delivery')>(
    '../../lib/pasantias/panel/letter-delivery'
  );
  return { ...actual, sendLetter: mockSendLetter };
});

import lettersJob from '../../pages/api/cron/pasantias-letters';
import retentionJob from '../../pages/api/cron/pasantias-retention';
import sendNowHandler from '../../pages/api/admin/pasantias-panel/participants/[id]/send-letter';
import mineHandler from '../../pages/api/pasantias/mine/index';
import mineDocumentHandler from '../../pages/api/pasantias/mine/documents/[docId]';

const CRON_SECRET = 'synthetic-cron-secret';
const ADMIN_ID = '99999999-8888-4777-8666-555555555555';
const USER_ID = 'eeeeeeee-ffff-4000-8111-222222222222';
const ROSTER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DOC_ID = 'dddddddd-eeee-4fff-8000-111111111111';
const EMAIL = 'ana.sintetica@example.com';
const P = (n: number) => `bbbbbbbb-cccc-4ddd-8eee-${String(n).padStart(12, '0')}`;

function install(handlers: {
  query?: (query: PanelQuery) => Answer;
  rpc?: (rpc: PanelRpc) => Answer;
  storage?: (call: StorageCall) => Answer;
}): FakePanel {
  const fake = fakePanel(handlers);
  mockCreateServiceRoleClient.mockReturnValue(fake.client);
  return fake;
}

async function call(
  handler: (req: any, res: any) => Promise<unknown>,
  c: { method?: string; query?: Record<string, string>; headers?: Record<string, string> }
) {
  const { req, res } = createMocks({
    method: (c.method ?? 'GET') as any,
    query: c.query ?? {},
    headers: { host: 'genera.test', ...(c.headers ?? {}) },
  });
  await handler(req, res);
  const raw = res._getData();
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res._getStatusCode(), json, raw: text, res };
}

const asCron = { authorization: `Bearer ${CRON_SECRET}` };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  vi.stubEnv('CRON_API_KEY', '');
  mockCreateServiceRoleClient.mockImplementation(() => {
    throw new Error('service client not arranged');
  });
  mockGetVerdict.mockResolvedValue('allowed');
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------- letters job */

describe('the daily letter job', () => {
  /** Five travellers of one school; `today` is 9 Jan 2027 in Chile. */
  function cohort(): FakePanel {
    const person = (n: number) => ({
      roster_id: ROSTER_ID,
      id: P(n),
      version: 1,
      first_names: `Persona${n}`,
      last_names: 'Sintética',
      rut: `1111111${n}-1`,
      passport_number: null,
      arrival_date: null,
      departure_date: null,
      focus: null,
      dietary_restrictions: [],
      dietary_other: null,
      updated_at: '2026-11-01T12:00:00.000Z',
      created_at: `2026-11-01T12:00:0${n}.000Z`,
      acknowledged_at: '2026-11-01T12:00:00.000Z',
      notice_version: 'v',
    });
    const tracking = (n: number, overrides: Record<string, unknown>) => ({
      participant_id: P(n),
      flight_status: 'paid',
      lodging_status: 'reserved',
      deposit_received: true,
      balance_received: true,
      salutation: 'estimada',
      notes: null,
      scl_departure_date: '2027-01-16',
      bcn_arrival_date: null,
      bcn_departure_date: null,
      scl_arrival_date: null,
      letter_sent_at: null,
      letter_sent_to: null,
      letter_send_error: null,
      version: 1,
      updated_at: '2026-11-02T12:00:00.000Z',
      ...overrides,
    });
    return install({
      query: (q) => {
        if (q.table === 'pasantias_intake_rosters') {
          return { data: [{ id: ROSTER_ID, program: 'inspira', school_name: 'Colegio Sintético Uno', status: 'submitted', last_submitted_at: null, school_funding: null }], error: null };
        }
        if (q.table === 'pasantias_panel_roster_details') {
          return { data: [{ roster_id: ROSTER_ID, letter_school_line: 'del Colegio Sintético Uno', letter_lodging_line: 'la Residencia Sintética', version: 1 }], error: null };
        }
        if (q.table === 'pasantias_intake_participants') return { data: [1, 2, 3, 4, 5, 6].map(person), error: null };
        if (q.table === 'pasantias_panel_logistics') {
          return {
            data: [
              tracking(1, {}), // due: leaves on the 16th, today is the 9th
              tracking(2, { scl_departure_date: '2027-01-17' }), // one day too early
              tracking(3, { letter_sent_at: '2027-01-08T12:00:00Z', letter_sent_to: EMAIL }), // already sent
              tracking(4, { salutation: null }), // no Estimado/Estimada
              tracking(5, { scl_departure_date: '2027-01-08' }), // already left
              tracking(6, { scl_departure_date: '2027-01-10' }), // due, but has no email
            ],
            error: null,
          };
        }
        if (q.table === 'pasantias_panel_contacts') {
          return { data: [1, 2, 3, 4, 5].map((n) => ({ participant_id: P(n), email: `persona${n}@example.com` })), error: null };
        }
        return { data: [], error: null };
      },
      rpc: (rpc) =>
        rpc.name === 'pasantias_panel_platform_accounts' ? { data: [], error: null } : { data: null, error: { code: 'UNEXPECTED_RPC' } },
      storage: () => ({ data: [{ name: 'logo' }, { name: 'signature' }], error: null }),
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-09T15:00:00Z'));
  });

  it('refuses a caller without the cron secret, before any database client exists', async () => {
    const out = await call(lettersJob, { headers: { authorization: 'Bearer wrong' } });
    expect(out.status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockSendLetter).not.toHaveBeenCalled();
    expect((await call(lettersJob, { method: 'DELETE', headers: asCron })).status).toBe(405);
  });

  it('emails only the traveller who leaves in seven days or less, has not left, and lacks nothing', async () => {
    const fake = cohort();
    mockSendLetter.mockResolvedValue({ status: 'sent', to: 'persona1@example.com', stored: true });
    const out = await call(lettersJob, { headers: asCron });
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ ok: true, due: 1, attempted: 1, sent: 1, failed: 0 });
    expect(mockSendLetter).toHaveBeenCalledTimes(1);
    expect(mockSendLetter).toHaveBeenCalledWith(fake.client, P(1), {
      actorId: null,
      force: false,
      baseUrl: expect.stringMatching(/^https?:\/\//),
    });
    // The job itself writes nothing; a skipped traveller costs no write at all.
    expect(fake.writes()).toHaveLength(0);
    // Counts only: no name and no address in the answer.
    expect(out.raw).not.toMatch(/Persona|example\.com/);
  });

  it('reports a failed send without stopping, and a skipped one as neither sent nor failed', async () => {
    cohort();
    mockSendLetter.mockResolvedValue({ status: 'failed', error: 'email_failed' });
    expect((await call(lettersJob, { headers: asCron })).json).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    mockSendLetter.mockResolvedValue({ status: 'skipped', reason: 'in_progress' });
    expect((await call(lettersJob, { headers: asCron })).json).toMatchObject({ attempted: 1, sent: 0, failed: 0 });
  });

  it('answers 500 and sends nothing when the panel cannot be read', async () => {
    install({ query: () => ({ data: null, error: { code: 'XX000' } }), storage: () => ({ data: [], error: null }) });
    const out = await call(lettersJob, { headers: asCron });
    expect(out.status).toBe(500);
    expect(mockSendLetter).not.toHaveBeenCalled();
  });
});

/* ----------------------------------------------------------- retention job */

describe('the daily retention sweep', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 02:00 UTC on 1 March is still 28 February in Chile.
    vi.setSystemTime(new Date('2027-03-01T02:00:00Z'));
  });

  it('refuses a caller without the cron secret', async () => {
    const out = await call(retentionJob, { headers: {} });
    expect(out.status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('passes today in Chile, deletes the files first (in batches) and only then the rows', async () => {
    const paths = Array.from({ length: 150 }, (_, i) => `participants/${P(1)}/${String(i).padStart(8, '0')}-0000-4000-8000-000000000000.pdf`);
    const order: string[] = [];
    const fake = install({
      rpc: (rpc) => {
        order.push(rpc.name);
        if (rpc.name === 'pasantias_panel_expired_document_paths') return { data: paths, error: null };
        if (rpc.name === 'pasantias_panel_purge_expired') return { data: 412, error: null };
        return { data: null, error: { code: 'UNEXPECTED_RPC' } };
      },
      storage: (c) => {
        order.push(`storage:${c.op}`);
        return { data: null, error: null };
      },
    });
    const out = await call(retentionJob, { headers: asCron });
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ ok: true, files: 150, rows: 412 });
    expect(fake.rpcs.map((rpc) => rpc.args)).toEqual([{ p_as_of: '2027-02-28' }, { p_as_of: '2027-02-28' }]);
    expect(order).toEqual([
      'pasantias_panel_expired_document_paths',
      'storage:remove',
      'storage:remove',
      'pasantias_panel_purge_expired',
    ]);
    expect(fake.storage.map((c) => c.paths?.length)).toEqual([100, 50]);
    expect(fake.storage.every((c) => c.bucket === 'pasantias-documents')).toBe(true);
    // The stored paths never leave the server.
    expect(out.raw).not.toContain('participants/');
  });

  it('purges no row when a file could not be deleted: the next run starts again', async () => {
    const fake = install({
      rpc: (rpc) =>
        rpc.name === 'pasantias_panel_expired_document_paths'
          ? { data: [`participants/${P(1)}/00000000-0000-4000-8000-000000000000.pdf`], error: null }
          : { data: 1, error: null },
      storage: () => ({ data: null, error: { message: 'storage down' } }),
    });
    const out = await call(retentionJob, { headers: asCron });
    expect(out.status).toBe(500);
    expect(fake.rpcs.map((rpc) => rpc.name)).toEqual(['pasantias_panel_expired_document_paths']);
  });

  it('with nothing expired it touches no file and still asks the database to purge (a no-op there)', async () => {
    const fake = install({
      rpc: (rpc) => (rpc.name === 'pasantias_panel_expired_document_paths' ? { data: [], error: null } : { data: 0, error: null }),
    });
    const out = await call(retentionJob, { headers: asCron });
    expect(out.json).toEqual({ ok: true, files: 0, rows: 0 });
    expect(fake.storage).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- send now */

describe('POST /api/admin/pasantias-panel/participants/[id]/send-letter', () => {
  const asAdmin = () => mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });

  it('lets in global admins only, and holds one who must change their password', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('no session') });
    expect((await call(sendNowHandler, { method: 'POST', query: { id: P(1) } })).status).toBe(401);
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: USER_ID }, error: null });
    expect((await call(sendNowHandler, { method: 'POST', query: { id: P(1) } })).status).toBe(403);
    asAdmin();
    mockGetVerdict.mockResolvedValue('required');
    install({});
    expect((await call(sendNowHandler, { method: 'POST', query: { id: P(1) } })).status).toBe(403);
    expect(mockSendLetter).not.toHaveBeenCalled();
    expect((await call(sendNowHandler, { method: 'GET', query: { id: P(1) } })).status).toBe(405);
  });

  it('sends as that admin, forcing a resend, and answers where it went', async () => {
    asAdmin();
    const fake = install({});
    mockSendLetter.mockResolvedValue({ status: 'sent', to: EMAIL, stored: true });
    const out = await call(sendNowHandler, { method: 'POST', query: { id: P(1).toUpperCase() } });
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ sent: true, to: EMAIL, stored: true });
    expect(mockSendLetter).toHaveBeenCalledWith(fake.client, P(1), { actorId: ADMIN_ID, force: true, baseUrl: expect.stringMatching(/^https?:\/\//) });
  });

  it.each([
    [{ status: 'not_found' }, 404, 'NOT_FOUND'],
    [{ status: 'skipped', reason: 'in_progress' }, 409, 'SEND_IN_PROGRESS'],
    [{ status: 'failed', error: 'missing_data', missing: ['la firma de la carta'] }, 422, 'LETTER_INCOMPLETE'],
    [{ status: 'failed', error: 'missing_email' }, 422, 'LETTER_INCOMPLETE'],
    [{ status: 'failed', error: 'email_not_configured' }, 502, 'SEND_FAILED'],
    [{ status: 'failed', error: 'email_rejected' }, 502, 'SEND_FAILED'],
  ])('maps %j to %i %s with a plain explanation', async (result, status, code) => {
    asAdmin();
    install({});
    mockSendLetter.mockResolvedValue(result);
    const out = await call(sendNowHandler, { method: 'POST', query: { id: P(1) } });
    expect(out.status).toBe(status);
    expect(out.json.code).toBe(code);
    expect(typeof out.json.error).toBe('string');
  });

  it('names what is missing', async () => {
    asAdmin();
    install({});
    mockSendLetter.mockResolvedValue({ status: 'failed', error: 'missing_data', missing: ['la firma de la carta'] });
    const out = await call(sendNowHandler, { method: 'POST', query: { id: P(1) } });
    expect(out.json.error).toBe('No se envió la carta: faltan datos para generar la carta: la firma de la carta.');
  });

  it('a malformed id is 404 without reaching the sender', async () => {
    asAdmin();
    install({});
    expect((await call(sendNowHandler, { method: 'POST', query: { id: 'nope' } })).status).toBe(404);
    expect(mockSendLetter).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------- Mi pasantía */

describe('the traveller routes', () => {
  const signedIn = (overrides: Record<string, unknown> = {}) =>
    mockGetApiUser.mockResolvedValue({
      user: { id: USER_ID, email: 'Ana.Sintetica@Example.com', email_confirmed_at: '2026-10-01T00:00:00Z', ...overrides },
      error: null,
    });

  it('GET /api/pasantias/mine: 401 without a session, before any database client exists', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('no session') });
    expect((await call(mineHandler, {})).status).toBe(401);
    expect((await call(mineDocumentHandler, { query: { docId: DOC_ID } })).status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('GET /api/pasantias/mine: looks the caller up by their own confirmed email, lower-cased', async () => {
    signedIn();
    const fake = install({ query: () => ({ data: [{ participant_id: P(1) }], error: null }) });
    const out = await call(mineHandler, {});
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ hasPasantia: true });
    expect(out.res.getHeader('Cache-Control')).toBe('no-store');
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0].table).toBe('pasantias_panel_contacts');
    expect(fake.queries[0].eq).toEqual({ email: EMAIL });
  });

  it('GET /api/pasantias/mine: an unconfirmed email matches nobody and reads nothing', async () => {
    signedIn({ email_confirmed_at: null });
    const fake = install({ query: () => ({ data: [{ participant_id: P(1) }], error: null }) });
    expect((await call(mineHandler, {})).json).toEqual({ hasPasantia: false });
    expect(fake.queries).toHaveLength(0);
  });

  it('holds a caller who must change their password', async () => {
    signedIn();
    mockGetVerdict.mockResolvedValue('required');
    const fake = install({});
    expect((await call(mineHandler, {})).status).toBe(403);
    expect((await call(mineDocumentHandler, { query: { docId: DOC_ID } })).status).toBe(403);
    expect(fake.queries).toHaveLength(0);
  });

  it('a document opens only for its own traveller, only a ticket or a letter, and never a removed one', async () => {
    signedIn();
    const fake = install({
      query: (q) =>
        q.table === 'pasantias_panel_contacts'
          ? { data: [{ participant_id: P(1) }], error: null }
          : { data: { storage_path: `participants/${P(1)}/${DOC_ID}.pdf`, file_name: 'Pasaje.pdf' }, error: null },
      storage: () => ({ data: { signedUrl: 'https://storage.test/signed' }, error: null }),
    });
    const out = await call(mineDocumentHandler, { query: { docId: DOC_ID } });
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ url: 'https://storage.test/signed', fileName: 'Pasaje.pdf' });
    const read = fake.queries.find((q) => q.table === 'pasantias_panel_documents')!;
    expect(read.eq).toEqual({ id: DOC_ID });
    expect(read.in).toEqual({ participant_id: [P(1)], kind: ['ticket', 'invitation_letter'] });
    expect(read.is).toEqual({ removed_at: null });
    expect(fake.storage[0]).toMatchObject({ op: 'createSignedUrl', seconds: 60, options: { download: 'Pasaje.pdf' } });
    // The stored path stays on the server.
    expect(out.raw).not.toContain('participants/');
  });

  it('someone else\'s document, an unknown id and a caller who is no traveller are the same 404', async () => {
    signedIn();
    const notMine = install({
      query: (q) => (q.table === 'pasantias_panel_contacts' ? { data: [{ participant_id: P(1) }], error: null } : { data: null, error: null }),
    });
    const a = await call(mineDocumentHandler, { query: { docId: DOC_ID } });
    expect(a.status).toBe(404);
    expect(notMine.storage).toHaveLength(0);

    const noTraveller = install({ query: () => ({ data: [], error: null }) });
    const b = await call(mineDocumentHandler, { query: { docId: DOC_ID } });
    expect(b.status).toBe(404);
    // No traveller: the documents table is never even asked.
    expect(noTraveller.queries.map((q) => q.table)).toEqual(['pasantias_panel_contacts']);

    const c = await call(mineDocumentHandler, { query: { docId: 'not-a-uuid' } });
    expect([a.raw, b.raw, c.raw].every((raw) => raw === a.raw)).toBe(true);
  });
});

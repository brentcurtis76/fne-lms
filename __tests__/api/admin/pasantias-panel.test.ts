// @vitest-environment node
/**
 * PASANTÍAS PANEL — the admin routes under /api/admin/pasantias-panel.
 *
 * `lib/api-auth` is faked at the module boundary as in
 * `__tests__/api/admin/pasantia-participants.test.ts`: the identity/admin
 * decision, the forced-password verdict and the service-role client are I/O.
 * What the SQL functions, PostgREST and Storage really do is proven by pgTAP
 * 116 and the Playwright spec; these tests pin what each route asks for and
 * how it answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  PASSWORD_CHANGE_REQUIRED_CODE,
  PASSWORD_STATE_UNAVAILABLE_CODE,
} from '../../../lib/auth/forced-password-change';
import {
  fakePanel,
  type Answer,
  type FakePanel,
  type PanelQuery,
  type PanelRpc,
  type StorageCall,
} from '../../lib/pasantias/panel/fake-panel-supabase';

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockGetVerdict } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetVerdict: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/api-auth')>('../../../lib/api-auth');
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
    getForcedPasswordChangeVerdict: mockGetVerdict,
  };
});

import indexHandler from '../../../pages/api/admin/pasantias-panel/index';
import bulkHandler from '../../../pages/api/admin/pasantias-panel/bulk';
import participantHandler from '../../../pages/api/admin/pasantias-panel/participants/[id]';
import letterHandler from '../../../pages/api/admin/pasantias-panel/participants/[id]/letter';
import uploadHandler from '../../../pages/api/admin/pasantias-panel/participants/[id]/documents';
import rosterHandler from '../../../pages/api/admin/pasantias-panel/rosters/[rosterId]';
import documentHandler from '../../../pages/api/admin/pasantias-panel/documents/[docId]';
import assetsHandler from '../../../pages/api/admin/pasantias-panel/letter-assets';

const ADMIN_ID = '99999999-8888-4777-8666-555555555555';
const ROSTER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PARTICIPANT_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const OTHER_ID = 'cccccccc-dddd-4eee-8fff-000000000000';
const DOC_ID = 'dddddddd-eeee-4fff-8000-111111111111';
const SECRET_PATH = `participants/${PARTICIPANT_ID}/${DOC_ID}.pdf`;
const PERSON = { rut: '11111111-1', passport: 'ZZ998877', name: 'Sintética', notes: 'nota privada sintética' };

const rosterRow = (overrides: Record<string, unknown> = {}) => ({
  id: ROSTER_ID,
  program: 'inspira',
  school_name: 'Colegio Sintético Uno',
  status: 'submitted',
  last_submitted_at: '2026-11-01T12:00:00.000Z',
  school_funding: { flights_funding: 'sep', lodging_funding: 'colegio', version: 1 },
  ...overrides,
});

const participantRow = (overrides: Record<string, unknown> = {}) => ({
  roster_id: ROSTER_ID,
  id: PARTICIPANT_ID,
  version: 2,
  first_names: 'Ana',
  last_names: PERSON.name,
  rut: PERSON.rut,
  passport_number: PERSON.passport,
  arrival_date: '2027-01-17',
  departure_date: null,
  focus: null,
  dietary_restrictions: [],
  dietary_other: null,
  updated_at: '2026-11-01T12:00:00.000Z',
  created_at: '2026-11-01T12:00:00.000Z',
  acknowledged_at: '2026-11-01T12:00:00.000Z',
  notice_version: 'v',
  ...overrides,
});

const logisticsRow = (overrides: Record<string, unknown> = {}) => ({
  participant_id: PARTICIPANT_ID,
  flight_status: 'purchased',
  lodging_status: 'pending',
  deposit_received: true,
  balance_received: false,
  salutation: 'estimada',
  notes: PERSON.notes,
  version: 3,
  updated_at: '2026-11-02T12:00:00.000Z',
  ...overrides,
});

const detailsRow = (overrides: Record<string, unknown> = {}) => ({
  roster_id: ROSTER_ID,
  letter_school_line: 'del Colegio Sintético Uno, Chile',
  letter_lodging_line: 'la Residencia Sintética',
  version: 1,
  ...overrides,
});

/** Answers the reads `loadParticipant` makes for one stored traveller. */
function storedTraveller(overrides: Partial<Record<string, unknown>> = {}) {
  return (query: PanelQuery): Answer | null => {
    if (query.op !== 'select') return null;
    const has = (key: string) => Object.prototype.hasOwnProperty.call(overrides, key);
    switch (query.table) {
      case 'pasantias_intake_participants':
        return { data: has('participant') ? overrides.participant : participantRow(), error: null };
      case 'pasantias_intake_rosters':
        return { data: has('roster') ? overrides.roster : rosterRow(), error: null };
      case 'pasantias_panel_roster_details':
        return { data: has('details') ? overrides.details : detailsRow(), error: null };
      case 'pasantias_nomina_participant_focus':
        return { data: { all_levels: false }, error: null };
      case 'pasantias_panel_logistics':
        return { data: has('logistics') ? overrides.logistics : logisticsRow(), error: null };
      case 'pasantias_panel_documents':
        return { data: has('documents') ? overrides.documents : [], error: null };
      default:
        return null;
    }
  };
}

function asAdmin() {
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockGetVerdict.mockResolvedValue('allowed');
}

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
  c: { method: string; body?: unknown; query?: Record<string, string> }
) {
  const { req, res } = createMocks({
    method: c.method as any,
    body: c.body as any,
    query: c.query ?? {},
    headers: { 'content-type': 'application/json' },
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

const refusal = (fn: string, code: string) => ({ data: null, error: { code: '22023', message: `${fn}: ${code}` } });

let logged: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckIsAdmin.mockImplementation(() => Promise.reject(new Error('checkIsAdmin not arranged')));
  mockGetVerdict.mockImplementation(() => Promise.reject(new Error('verdict not arranged')));
  mockCreateServiceRoleClient.mockImplementation(() => {
    throw new Error('service client not arranged');
  });
  logged = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});

afterEach(() => {
  // Ley 21.719: no personal data and no storage path in any log line of any test.
  const all = logged.join('\n');
  for (const secret of [PERSON.rut, PERSON.passport, PERSON.name, PERSON.notes, SECRET_PATH]) {
    expect(all).not.toContain(secret);
  }
  vi.restoreAllMocks();
});

const ROUTES: [string, (req: any, res: any) => Promise<unknown>, string, Record<string, string>, string[]][] = [
  ['list', indexHandler, 'GET', {}, ['GET']],
  ['bulk', bulkHandler, 'POST', {}, ['POST']],
  ['participant', participantHandler, 'GET', { id: PARTICIPANT_ID }, ['GET', 'PATCH', 'PUT']],
  ['letter', letterHandler, 'POST', { id: PARTICIPANT_ID }, ['POST']],
  ['upload', uploadHandler, 'POST', { id: PARTICIPANT_ID }, ['POST']],
  ['roster details', rosterHandler, 'PUT', { rosterId: ROSTER_ID }, ['PUT']],
  ['document', documentHandler, 'GET', { docId: DOC_ID }, ['GET', 'DELETE']],
  ['letter images', assetsHandler, 'GET', {}, ['GET', 'POST']],
];

describe.each(ROUTES)('the guard of the %s route', (_name, handler, method, query, allowed) => {
  it('answers 401 to an anonymous caller without creating a service client', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('no session') });
    const out = await call(handler, { method, query });
    expect(out.status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('answers 403 to a signed-in non-admin without creating a service client', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: OTHER_ID }, error: null });
    const out = await call(handler, { method, query });
    expect(out.status).toBe(403);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('holds an admin who must change their password, before any panel query', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
    mockGetVerdict.mockResolvedValue('required');
    const fake = install({});
    const out = await call(handler, { method, query });
    expect(out.status).toBe(403);
    expect(out.json.code).toBe(PASSWORD_CHANGE_REQUIRED_CODE);
    expect(fake.queries).toHaveLength(0);
    expect(fake.rpcs).toHaveLength(0);
    expect(fake.storage).toHaveLength(0);
  });

  it('fails closed when the password state cannot be read', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
    mockGetVerdict.mockRejectedValue(new Error('db down'));
    const fake = install({});
    const out = await call(handler, { method, query });
    expect(out.status).toBe(503);
    expect(out.json.code).toBe(PASSWORD_STATE_UNAVAILABLE_CODE);
    expect(fake.queries).toHaveLength(0);
  });

  it('refuses other methods with 405 before authenticating, and never caches', async () => {
    const out = await call(handler, { method: 'TRACE', query });
    expect(out.status).toBe(405);
    expect(String(out.res.getHeader('Allow'))).toBe(allowed.join(', '));
    expect(out.res.getHeader('Cache-Control')).toBe('no-store');
    expect(mockCheckIsAdmin).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/pasantias-panel', () => {
  it('answers every roster and traveller of the cohort with tracking, counts and letter images state', async () => {
    asAdmin();
    const fake = install({
      query: (q) => {
        if (q.table === 'pasantias_intake_rosters') return { data: [rosterRow()], error: null };
        if (q.table === 'pasantias_panel_roster_details') return { data: [detailsRow()], error: null };
        if (q.table === 'pasantias_intake_participants') {
          return {
            data: [
              participantRow(),
              participantRow({ id: OTHER_ID, rut: '22222222-2', roster_id: 'unknown-roster' }),
              participantRow({ id: DOC_ID, rut: '33333333-3', focus: null }),
            ],
            error: null,
          };
        }
        if (q.table === 'pasantias_nomina_participant_focus') return { data: [{ participant_id: DOC_ID }], error: null };
        if (q.table === 'pasantias_panel_logistics') return { data: [logisticsRow()], error: null };
        if (q.table === 'pasantias_panel_documents') {
          return {
            data: [
              { id: 'd1', participant_id: PARTICIPANT_ID, kind: 'ticket' },
              { id: 'd2', participant_id: PARTICIPANT_ID, kind: 'invitation_letter' },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      },
      storage: () => ({ data: [{ name: 'logo' }], error: null }),
    });

    const out = await call(indexHandler, { method: 'GET' });
    expect(out.status).toBe(200);
    expect(out.json.letterAssets).toEqual({ logo: true, signature: false });
    expect(out.json.rosters).toHaveLength(1);
    expect(out.json.rosters[0]).toMatchObject({
      id: ROSTER_ID,
      schoolName: 'Colegio Sintético Uno',
      programName: 'Pasantía INSPIRA',
      schoolFunding: { flightsFunding: 'sep', lodgingFunding: 'colegio' },
      details: { letterSchoolLine: 'del Colegio Sintético Uno, Chile', version: 1 },
    });
    // The traveller of a roster outside the cohort list is not shown.
    expect(out.json.rows.map((r: any) => r.participant.id)).toEqual([PARTICIPANT_ID, DOC_ID]);
    expect(out.json.rows[0]).toMatchObject({
      rosterId: ROSTER_ID,
      logistics: { flightStatus: 'purchased', depositReceived: true, salutation: 'estimada', version: 3 },
      documentCount: 2,
      hasLetter: true,
    });
    // No tracking row = everything pending and version null; "Todos" comes from the side table.
    expect(out.json.rows[1]).toMatchObject({
      participant: { focus: 'todos' },
      logistics: { flightStatus: 'pending', lodgingStatus: 'pending', depositReceived: false, version: null },
      documentCount: 0,
      hasLetter: false,
    });

    const rosters = fake.queries.find((q) => q.table === 'pasantias_intake_rosters')!;
    expect(rosters.eq).toEqual({ cohort: 'enero-2027' });
    expect(rosters.range).toEqual([0, 999]);
    expect(fake.queries.find((q) => q.table === 'pasantias_panel_documents')!.is).toEqual({ removed_at: null });
    // Nothing secret is ever selected or answered.
    for (const q of fake.queries) expect(q.columns).not.toMatch(/token_hash|storage_path/);
    expect(out.raw).not.toMatch(/token|storage_path|storagePath/i);
    expect(fake.writes()).toHaveLength(0);
  });

  it('reads past the per-request row cap', async () => {
    asAdmin();
    const page = Array.from({ length: 1000 }, (_, i) => participantRow({ id: `id-${i}`, rut: `${10000000 + i}-0` }));
    const fake = install({
      query: (q) => {
        if (q.table === 'pasantias_intake_rosters') return { data: [rosterRow()], error: null };
        if (q.table === 'pasantias_intake_participants') {
          return { data: q.range![0] === 0 ? page : [participantRow()], error: null };
        }
        return { data: [], error: null };
      },
      storage: () => ({ data: [], error: null }),
    });
    const out = await call(indexHandler, { method: 'GET' });
    expect(out.json.rows).toHaveLength(1001);
    expect(fake.queries.filter((q) => q.table === 'pasantias_intake_participants').map((q) => q.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('answers 500 without detail when a read fails', async () => {
    asAdmin();
    install({ query: () => ({ data: null, error: { code: 'XX000', message: `boom ${PERSON.rut}` } }) });
    const out = await call(indexHandler, { method: 'GET' });
    expect(out.status).toBe(500);
    expect(out.raw).not.toContain('boom');
  });
});

describe('PATCH /api/admin/pasantias-panel/participants/[id] — tracking', () => {
  const BODY = {
    flightStatus: 'paid',
    lodgingStatus: 'reserved',
    depositReceived: true,
    balanceReceived: true,
    salutation: 'estimada',
    notes: 'Nueva nota',
    expectedVersion: 3,
  };

  it('calls the SQL function with all nine named arguments and answers the stored row', async () => {
    asAdmin();
    const stored = storedTraveller();
    const fake = install({
      query: (q) => stored(q) ?? { data: null, error: null },
      rpc: () => ({ data: [{ logistics_version: 4, replayed: false }], error: null }),
    });
    const out = await call(participantHandler, { method: 'PATCH', query: { id: PARTICIPANT_ID.toUpperCase() }, body: BODY });
    expect(out.status).toBe(200);
    expect(fake.rpcs).toEqual([
      {
        name: 'pasantias_panel_save_logistics',
        args: {
          p_participant_id: PARTICIPANT_ID,
          p_expected_version: 3,
          p_flight_status: 'paid',
          p_lodging_status: 'reserved',
          p_deposit_received: true,
          p_balance_received: true,
          p_salutation: 'estimada',
          p_notes: 'Nueva nota',
          p_actor: ADMIN_ID,
        },
      },
    ]);
    expect(out.json.row.participant.id).toBe(PARTICIPANT_ID);
    expect(out.json.roster.id).toBe(ROSTER_ID);
    // The route itself writes no table: the function does, atomically with its activity row.
    expect(fake.writes()).toHaveLength(0);
  });

  it('answers 409 STALE with the row as stored now', async () => {
    asAdmin();
    const stored = storedTraveller();
    install({
      query: (q) => stored(q) ?? { data: null, error: null },
      rpc: () => refusal('pasantias_panel_save_logistics', 'stale_version'),
    });
    const out = await call(participantHandler, { method: 'PATCH', query: { id: PARTICIPANT_ID }, body: BODY });
    expect(out.status).toBe(409);
    expect(out.json.code).toBe('STALE');
    expect(out.json.row.logistics.version).toBe(3);
  });

  it('answers 422 with field errors and calls nothing on an invalid body', async () => {
    asAdmin();
    const stored = storedTraveller();
    const fake = install({ query: (q) => stored(q) ?? { data: null, error: null } });
    const out = await call(participantHandler, {
      method: 'PATCH',
      query: { id: PARTICIPANT_ID },
      body: { ...BODY, flightStatus: 'reserved', updated_by: OTHER_ID },
    });
    expect(out.status).toBe(422);
    expect(out.json.code).toBe('VALIDATION');
    expect(fake.rpcs).toHaveLength(0);
  });

  it('answers 404 for an id that is not a UUID or not stored, without calling the function', async () => {
    asAdmin();
    const stored = storedTraveller({ participant: null });
    const fake = install({ query: (q) => stored(q) ?? { data: null, error: null } });
    expect((await call(participantHandler, { method: 'PATCH', query: { id: 'x' }, body: BODY })).status).toBe(404);
    expect(fake.queries).toHaveLength(0);
    expect((await call(participantHandler, { method: 'PATCH', query: { id: PARTICIPANT_ID }, body: BODY })).status).toBe(404);
    expect(fake.rpcs).toHaveLength(0);
  });

  it('answers 503 when the function is not deployed', async () => {
    asAdmin();
    const stored = storedTraveller();
    install({
      query: (q) => stored(q) ?? { data: null, error: null },
      rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
    });
    expect((await call(participantHandler, { method: 'PATCH', query: { id: PARTICIPANT_ID }, body: BODY })).status).toBe(503);
  });
});

describe('PUT /api/admin/pasantias-panel/participants/[id] — correction', () => {
  const BODY = {
    firstNames: 'Ana',
    lastNames: 'Corregida',
    rut: '22.222.222-2',
    passportNumber: null,
    arrivalDate: '2027-01-17',
    departureDate: '2027-01-29',
    focus: 'todos',
    dietaryRestrictions: ['vegano'],
    dietaryOther: null,
    expectedVersion: 2,
  };

  it('validates with the stored roster program and calls the function with twelve named arguments', async () => {
    asAdmin();
    const stored = storedTraveller();
    const fake = install({
      query: (q) => stored(q) ?? { data: null, error: null },
      rpc: () => ({ data: [{ participant_version: 3, replayed: false }], error: null }),
    });
    const out = await call(participantHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: BODY });
    expect(out.status).toBe(200);
    expect(fake.rpcs).toEqual([
      {
        name: 'pasantias_panel_save_participant',
        args: {
          p_participant_id: PARTICIPANT_ID,
          p_expected_version: 2,
          p_first_names: 'Ana',
          p_last_names: 'Corregida',
          p_rut: '22222222-2',
          p_passport_number: null,
          p_arrival_date: '2027-01-17',
          p_departure_date: '2027-01-29',
          p_focus: 'todos',
          p_dietary_restrictions: ['vegano'],
          p_dietary_other: null,
          p_actor: ADMIN_ID,
        },
      },
    ]);
    expect(fake.writes()).toHaveLength(0);
  });

  it('refuses a date the school form of that program does not offer', async () => {
    asAdmin();
    const stored = storedTraveller({ roster: rosterRow({ program: 'mirada-profunda' }) });
    const fake = install({ query: (q) => stored(q) ?? { data: null, error: null } });
    const out = await call(participantHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: BODY });
    expect(out.status).toBe(422);
    expect(out.json.fields.departureDate).toBeTruthy();
    expect(fake.rpcs).toHaveLength(0);
  });

  it.each([
    ['duplicate_rut', 409, 'DUPLICATE_RUT'],
    ['stale_version', 409, 'STALE'],
    ['unknown_participant', 404, 'NOT_FOUND'],
    ['invalid_rut', 422, 'VALIDATION'],
  ])('maps the %s refusal to %i %s', async (code, status, apiCode) => {
    asAdmin();
    const stored = storedTraveller();
    install({
      query: (q) => stored(q) ?? { data: null, error: null },
      rpc: () => refusal('pasantias_panel_save_participant', code),
    });
    const out = await call(participantHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: BODY });
    expect(out.status).toBe(status);
    expect(out.json.code).toBe(apiCode);
    if (code === 'duplicate_rut' || code === 'invalid_rut') expect(out.json.fields.rut).toBeTruthy();
  });

  it('does not treat a look-alike database message as a refusal', async () => {
    asAdmin();
    const stored = storedTraveller();
    install({
      query: (q) => stored(q) ?? { data: null, error: null },
      rpc: () => ({
        data: null,
        error: { code: '22023', message: 'pasantias_panel_save_participant: duplicate_rut extra' },
      }),
    });
    expect((await call(participantHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: BODY })).status).toBe(500);
  });
});

describe('GET /api/admin/pasantias-panel/participants/[id]', () => {
  it('answers the traveller with documents and a readable history', async () => {
    asAdmin();
    const stored = storedTraveller();
    install({
      query: (q) => {
        if (q.table === 'pasantias_panel_documents' && q.columns?.includes('file_name')) {
          return {
            data: [
              {
                id: DOC_ID,
                participant_id: PARTICIPANT_ID,
                kind: 'ticket',
                description: 'Ida',
                file_name: 'pasaje.pdf',
                mime_type: 'application/pdf',
                size_bytes: 1234,
                created_at: '2026-11-03T10:00:00.000Z',
              },
            ],
            error: null,
          };
        }
        if (q.table === 'pasantias_panel_activity') {
          return {
            data: [
              {
                id: 'a2',
                actor_id: ADMIN_ID,
                action: 'participant_corrected',
                created_at: '2026-11-03T11:00:00.000Z',
                details: {
                  fields: {
                    last_names: { old: 'Antes', new: 'Después' },
                    arrival_date: { old: null, new: '2027-01-17' },
                    focus: { old: null, new: 'todos' },
                    dietary: {},
                  },
                },
              },
              {
                id: 'a1',
                actor_id: OTHER_ID,
                action: 'logistics_updated',
                created_at: '2026-11-03T10:00:00.000Z',
                details: { bulk: true, fields: { flight_status: { old: 'pending', new: 'paid' } } },
              },
            ],
            error: null,
          };
        }
        if (q.table === 'profiles') {
          return { data: [{ id: ADMIN_ID, first_name: 'Admin', last_name: 'Sintético', name: null }], error: null };
        }
        return stored(q) ?? { data: null, error: null };
      },
    });
    const out = await call(participantHandler, { method: 'GET', query: { id: PARTICIPANT_ID } });
    expect(out.status).toBe(200);
    expect(out.json.documents).toEqual([
      {
        id: DOC_ID,
        kind: 'ticket',
        description: 'Ida',
        fileName: 'pasaje.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        createdAt: '2026-11-03T10:00:00.000Z',
      },
    ]);
    expect(out.json.activity[0]).toMatchObject({
      actorName: 'Admin Sintético',
      lines: [
        'Apellidos: «Antes» → «Después»',
        'Llegada: Sin indicar → domingo 17 de enero de 2027',
        'Foco: Sin indicar → Todos',
        'Alimentación actualizada',
      ],
    });
    expect(out.json.activity[1]).toMatchObject({
      actorName: 'Administrador',
      lines: ['Pasaje: Pendiente → Pagado (cambio masivo)'],
    });
    expect(out.raw).not.toMatch(/storage_path|storagePath/);
  });
});

describe('POST /api/admin/pasantias-panel/bulk', () => {
  it('passes the selection to the SQL function in one call', async () => {
    asAdmin();
    const fake = install({ rpc: () => ({ data: 2, error: null }) });
    const out = await call(bulkHandler, {
      method: 'POST',
      body: { participantIds: [PARTICIPANT_ID, OTHER_ID], field: 'depositReceived', value: true },
    });
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ changed: 2 });
    expect(fake.rpcs).toEqual([
      {
        name: 'pasantias_panel_bulk_set',
        args: {
          p_participant_ids: [PARTICIPANT_ID, OTHER_ID],
          p_field: 'deposit_received',
          p_value: 'true',
          p_actor: ADMIN_ID,
        },
      },
    ]);
    expect(fake.queries).toHaveLength(0);
  });

  it('refuses an invalid selection before the database, and maps an unknown id to 404', async () => {
    asAdmin();
    const fake = install({ rpc: () => refusal('pasantias_panel_bulk_set', 'unknown_participant') });
    const bad = await call(bulkHandler, {
      method: 'POST',
      body: { participantIds: [], field: 'flightStatus', value: 'paid' },
    });
    expect(bad.status).toBe(422);
    expect(fake.rpcs).toHaveLength(0);
    const gone = await call(bulkHandler, {
      method: 'POST',
      body: { participantIds: [OTHER_ID], field: 'flightStatus', value: 'paid' },
    });
    expect(gone.status).toBe(404);
  });
});

describe('PUT /api/admin/pasantias-panel/rosters/[rosterId]', () => {
  const BODY = { letterSchoolLine: ' del Colegio  X ', letterLodgingLine: null, expectedVersion: null };

  it('inserts the first save with whitelisted columns only', async () => {
    asAdmin();
    const fake = install({
      query: (q) => {
        if (q.table === 'pasantias_intake_rosters') return { data: { id: ROSTER_ID }, error: null };
        return { data: detailsRow({ letter_school_line: 'del Colegio X', letter_lodging_line: null }), error: null };
      },
    });
    const out = await call(rosterHandler, { method: 'PUT', query: { rosterId: ROSTER_ID }, body: BODY });
    expect(out.status).toBe(200);
    expect(out.json.details).toEqual({ letterSchoolLine: 'del Colegio X', letterLodgingLine: null, version: 1 });
    expect(fake.writes()).toHaveLength(1);
    expect(fake.writes()[0].op).toBe('insert');
    expect(fake.writes()[0].payload).toEqual({
      roster_id: ROSTER_ID,
      letter_school_line: 'del Colegio X',
      letter_lodging_line: null,
      updated_by: ADMIN_ID,
    });
  });

  it('updates only the row still at the expected version; no match is 409 STALE', async () => {
    asAdmin();
    const fake = install({
      query: (q) =>
        q.table === 'pasantias_intake_rosters' ? { data: { id: ROSTER_ID }, error: null } : { data: null, error: null },
    });
    const out = await call(rosterHandler, {
      method: 'PUT',
      query: { rosterId: ROSTER_ID },
      body: { ...BODY, expectedVersion: 4 },
    });
    expect(out.status).toBe(409);
    const write = fake.writes()[0];
    expect(write.op).toBe('update');
    expect(write.eq).toEqual({ roster_id: ROSTER_ID, version: 4 });
    expect(write.payload).toMatchObject({ version: 5, updated_by: ADMIN_ID });
  });

  it('treats a concurrent first save (primary key) as STALE and an unknown roster as 404', async () => {
    asAdmin();
    install({
      query: (q) =>
        q.table === 'pasantias_intake_rosters'
          ? { data: { id: ROSTER_ID }, error: null }
          : { data: null, error: { code: '23505' } },
    });
    expect((await call(rosterHandler, { method: 'PUT', query: { rosterId: ROSTER_ID }, body: BODY })).status).toBe(409);
    const fake = install({ query: () => ({ data: null, error: null }) });
    expect((await call(rosterHandler, { method: 'PUT', query: { rosterId: ROSTER_ID }, body: BODY })).status).toBe(404);
    expect(fake.writes()).toHaveLength(0);
  });
});

describe('/api/admin/pasantias-panel/documents/[docId]', () => {
  it('GET answers a 60-second signed download URL and never the storage path', async () => {
    asAdmin();
    const fake = install({
      query: () => ({ data: { storage_path: SECRET_PATH, file_name: 'pasaje.pdf' }, error: null }),
      storage: () => ({ data: { signedUrl: 'http://storage.test/signed?token=abc' }, error: null }),
    });
    const out = await call(documentHandler, { method: 'GET', query: { docId: DOC_ID } });
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ url: 'http://storage.test/signed?token=abc', fileName: 'pasaje.pdf' });
    expect(fake.queries[0].is).toEqual({ removed_at: null });
    expect(fake.storage).toEqual([
      {
        op: 'createSignedUrl',
        bucket: 'pasantias-documents',
        path: SECRET_PATH,
        seconds: 60,
        options: { download: 'pasaje.pdf' },
      },
    ]);
  });

  it('GET answers 404 for a removed or unknown document without signing anything', async () => {
    asAdmin();
    const fake = install({ query: () => ({ data: null, error: null }) });
    expect((await call(documentHandler, { method: 'GET', query: { docId: DOC_ID } })).status).toBe(404);
    expect((await call(documentHandler, { method: 'GET', query: { docId: '../etc' } })).status).toBe(404);
    expect(fake.storage).toHaveLength(0);
  });

  it('DELETE stamps the row removed, deletes the file and logs the removal', async () => {
    asAdmin();
    const fake = install({
      query: (q) =>
        q.table === 'pasantias_panel_documents'
          ? {
              data: { participant_id: PARTICIPANT_ID, kind: 'ticket', file_name: 'pasaje.pdf', storage_path: SECRET_PATH },
              error: null,
            }
          : { data: null, error: null },
    });
    const out = await call(documentHandler, { method: 'DELETE', query: { docId: DOC_ID } });
    expect(out.status).toBe(200);
    const [stamp, activity] = fake.writes();
    expect(stamp.op).toBe('update');
    expect(stamp.eq).toEqual({ id: DOC_ID });
    expect(stamp.is).toEqual({ removed_at: null });
    expect(Object.keys(stamp.payload!).sort()).toEqual(['removed_at', 'removed_by']);
    expect(stamp.payload!.removed_by).toBe(ADMIN_ID);
    expect(fake.storage).toEqual([{ op: 'remove', bucket: 'pasantias-documents', paths: [SECRET_PATH] }]);
    expect(activity.table).toBe('pasantias_panel_activity');
    expect(activity.payload).toEqual({
      participant_id: PARTICIPANT_ID,
      actor_id: ADMIN_ID,
      action: 'document_removed',
      details: { kind: 'ticket', file_name: 'pasaje.pdf' },
    });
  });

  it('DELETE of an already removed document is 404 and touches no file', async () => {
    asAdmin();
    const fake = install({ query: () => ({ data: null, error: null }) });
    expect((await call(documentHandler, { method: 'DELETE', query: { docId: DOC_ID } })).status).toBe(404);
    expect(fake.storage).toHaveLength(0);
    expect(fake.writes()).toHaveLength(1);
  });
});

describe('POST /api/admin/pasantias-panel/participants/[id]/letter', () => {
  it('refuses with the list of what is missing and stores nothing', async () => {
    asAdmin();
    const stored = storedTraveller({ logistics: logisticsRow({ salutation: null }), details: null });
    const fake = install({
      query: (q) => stored(q) ?? { data: null, error: null },
      storage: () => ({ data: null, error: { message: 'not found' } }),
    });
    const out = await call(letterHandler, { method: 'POST', query: { id: PARTICIPANT_ID } });
    expect(out.status).toBe(422);
    expect(out.json.code).toBe('LETTER_INCOMPLETE');
    expect(out.json.missing).toHaveLength(5);
    expect(fake.storage.every((c) => c.op === 'download')).toBe(true);
    expect(fake.writes()).toHaveLength(0);
  });
});

describe('GET /api/admin/pasantias-panel/letter-assets', () => {
  it('reports which of the two images exist', async () => {
    asAdmin();
    const fake = install({ storage: () => ({ data: [{ name: 'signature' }, { name: 'other' }], error: null }) });
    const out = await call(assetsHandler, { method: 'GET' });
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ letterAssets: { logo: false, signature: true } });
    expect(fake.storage[0]).toMatchObject({ op: 'list', bucket: 'pasantias-documents', path: 'letter-assets' });
  });
});

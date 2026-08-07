// @vitest-environment node
/**
 * A8 [A1] [A-new-4] — GET/PATCH /api/admin/pasantia-leads.
 *
 * `lib/api-auth` is faked at the module boundary, exactly as
 * `__tests__/api/pasantias-lead.test.ts` does it: `pasantias_leads` grants no
 * authenticated write of any kind (D-04), so a service-role client behind an
 * admin check is the only shape this route can have and there is no lighter
 * seam than that boundary.
 *
 * The assertions are made against what the route hands Supabase — the filter
 * expression, and the exact column payload of the update — because that is
 * where D-03's transition decision and the "whitelist, never spread" rule
 * actually become visible.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCheckIsAdmin, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  checkIsAdmin: mockCheckIsAdmin,
  createServiceRoleClient: mockCreateServiceRoleClient,
  // The real one sets Allow and answers 405; reproduced rather than imported so
  // the whole module can be replaced in one place.
  handleMethodNotAllowed: (res: any, methods: string[]) => {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: 'Method not allowed' });
  },
}));

import handler from '../../../pages/api/admin/pasantia-leads/index';

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface SelectRecord {
  columns: string;
  filters: Record<string, unknown>;
  or: string | null;
  order: { column: string; ascending: boolean } | null;
}

interface UpdateRecord {
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
}

const LEAD_ID = '11111111-2222-4333-8444-555555555555';

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    cohort: 'octubre-2026',
    first_name: 'Ana',
    last_name: 'Pérez',
    email: 'ana@example.com',
    institution: 'Colegio Uno',
    phone: null,
    role_title: null,
    num_people: null,
    message: null,
    notes: null,
    status: 'new',
    source_path: '/pasantias',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    consent_accepted_at: '2026-08-01T12:00:00.000Z',
    consent_notice_version: 'v1',
    marketing_opt_in: false,
    marketing_opt_in_at: null,
    brochure_sent_at: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

/** Every status in the table, so a counts assertion has something to see. */
const ALL_STATUS_ROWS = [
  { status: 'new' },
  { status: 'new' },
  { status: 'contacted' },
  { status: 'dismissed' },
];

/**
 * Minimal stand-in for the two chains this route uses:
 * `select().order().eq?().or?()` awaited directly, `select().eq().maybeSingle()`
 * for the PATCH lookup, and `update().eq().select().maybeSingle()`.
 *
 * Which select is which is decided by the requested columns, which is also what
 * the route uses to mean different things: `'status'` is the unfiltered counts
 * query and `'id, status'` is the pre-transition read.
 */
function createSupabase(
  options: {
    list?: QueryResult;
    counts?: QueryResult;
    current?: QueryResult;
    updated?: QueryResult;
  } = {}
) {
  const selects: SelectRecord[] = [];
  const updates: UpdateRecord[] = [];

  const resolveSelect = async (record: SelectRecord): Promise<QueryResult> => {
    if (record.columns === 'status') {
      return options.counts ?? { data: ALL_STATUS_ROWS, error: null };
    }
    if (record.columns === 'id, status') {
      return options.current ?? { data: { id: LEAD_ID, status: 'new' }, error: null };
    }
    return options.list ?? { data: [leadRow()], error: null };
  };

  const from = vi.fn(() => ({
    select: (columns: string) => {
      const record: SelectRecord = { columns, filters: {}, or: null, order: null };
      selects.push(record);
      const settle = () => resolveSelect(record);

      const chain: any = {
        eq(column: string, value: unknown) {
          record.filters[column] = value;
          return chain;
        },
        or(expression: string) {
          record.or = expression;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          record.order = { column, ascending: opts?.ascending !== false };
          return chain;
        },
        maybeSingle: settle,
        then: (ok?: (v: QueryResult) => unknown, no?: (e: unknown) => unknown) =>
          settle().then(ok, no),
      };
      return chain;
    },
    update: (payload: Record<string, unknown>) => {
      const record: UpdateRecord = { payload, filters: {} };
      updates.push(record);

      const chain: any = {
        eq(column: string, value: unknown) {
          record.filters[column] = value;
          return chain;
        },
        select: () => ({
          maybeSingle: async () =>
            options.updated ?? { data: leadRow({ ...payload }), error: null },
        }),
      };
      return chain;
    },
  }));

  const client = { from };
  mockCreateServiceRoleClient.mockReturnValue(client);
  return { client, selects, updates };
}

function asAdmin() {
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: 'admin-1' }, error: null });
}

function asAnonymous() {
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('no session') });
}

function asDocente() {
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: 'docente-1' }, error: null });
}

async function run(options: {
  method?: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  const { req, res } = createMocks({
    method: (options.method ?? 'GET') as any,
    query: options.query ?? {},
    body: options.body,
  });

  await handler(req as any, res as any);

  return {
    status: res._getStatusCode(),
    body: JSON.parse(res._getData() || '{}'),
    res,
  };
}

/** The `or=()` expression, split back into the filters PostgREST would see. */
function orFilters(expression: string | null): string[] {
  return (expression ?? '').split(',');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/pasantia-leads', () => {
  it('answers 401 to an anonymous caller', async () => {
    asAnonymous();
    createSupabase();

    const { status } = await run({});

    expect(status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('answers 403 to a signed-in non-admin', async () => {
    asDocente();
    createSupabase();

    const { status, body } = await run({});

    expect(status).toBe(403);
    expect(body.error).toContain('administradores');
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('returns the leads newest first for an admin', async () => {
    asAdmin();
    const { selects } = createSupabase();

    const { status, body } = await run({});

    expect(status).toBe(200);
    expect(body.leads).toHaveLength(1);
    expect(body.leads[0].id).toBe(LEAD_ID);
    expect(selects[0].order).toEqual({ column: 'created_at', ascending: false });
  });

  it('applies the status filter but never lets it touch the counts', async () => {
    asAdmin();
    const { selects } = createSupabase();

    const { status, body } = await run({ query: { status: 'new' } });

    expect(status).toBe(200);
    const listSelect = selects.find((select) => select.columns !== 'status');
    expect(listSelect?.filters).toEqual({ status: 'new' });

    // The counts query carries no filter at all, and the other statuses are
    // still counted — tabs that collapse under their own filter are useless.
    const countsSelect = selects.find((select) => select.columns === 'status');
    expect(countsSelect?.filters).toEqual({});
    expect(body.counts).toEqual({ new: 2, contacted: 1, converted: 0, dismissed: 1, total: 4 });
  });

  it('rejects an unknown status value instead of silently returning everything', async () => {
    asAdmin();
    const { selects } = createSupabase();

    const { status, body } = await run({ query: { status: 'archivado' } });

    expect(status).toBe(400);
    expect(body.error).toBe('El estado indicado no es válido.');
    expect(selects).toHaveLength(0);
  });

  it('neutralizes a hostile search term instead of letting it re-partition the filter', async () => {
    asAdmin();
    const { selects } = createSupabase();

    const { status } = await run({ query: { search: 'a,b)c' } });

    expect(status).toBe(200);

    const listSelect = selects.find((select) => select.columns !== 'status');
    const filters = orFilters(listSelect?.or ?? null);

    // Exactly the four filters this route wrote — the term added none.
    expect(filters).toHaveLength(4);
    for (const filter of filters) {
      expect(filter).toMatch(/^(first_name|last_name|email|institution)\.ilike\.%[^,()]*%$/);
    }
    // And the term's own characters are gone rather than escaped in place.
    expect(listSelect?.or).not.toContain(')');
    expect(listSelect?.or).not.toContain('(');
  });

  it('keeps a plain search term intact', async () => {
    asAdmin();
    const { selects } = createSupabase();

    await run({ query: { search: 'Pérez' } });

    const listSelect = selects.find((select) => select.columns !== 'status');
    expect(orFilters(listSelect?.or ?? null)).toEqual([
      'first_name.ilike.%Pérez%',
      'last_name.ilike.%Pérez%',
      'email.ilike.%Pérez%',
      'institution.ilike.%Pérez%',
    ]);
  });

  it('answers 503 when the table has not been migrated yet', async () => {
    asAdmin();
    createSupabase({ list: { data: null, error: { code: '42P01' } } });

    const { status, body } = await run({});

    expect(status).toBe(503);
    expect(body.migrationRequired).toBe(true);
  });
});

describe('PATCH /api/admin/pasantia-leads', () => {
  it('answers 401 to an anonymous caller', async () => {
    asAnonymous();
    createSupabase();

    const { status } = await run({ method: 'PATCH', body: { id: LEAD_ID, status: 'contacted' } });

    expect(status).toBe(401);
  });

  it('answers 403 to a signed-in non-admin', async () => {
    asDocente();
    createSupabase();

    const { status } = await run({ method: 'PATCH', body: { id: LEAD_ID, status: 'contacted' } });

    expect(status).toBe(403);
  });

  it('answers 400 to a body carrying neither status nor notes', async () => {
    asAdmin();
    const { updates } = createSupabase();

    const { status, body } = await run({ method: 'PATCH', body: { id: LEAD_ID } });

    expect(status).toBe(400);
    expect(body.error).toBe('No hay cambios que guardar.');
    expect(updates).toHaveLength(0);
  });

  it('answers 400 to an id that is not uuid-shaped', async () => {
    asAdmin();
    const { updates } = createSupabase();

    const { status } = await run({ method: 'PATCH', body: { id: 'not-a-uuid', status: 'contacted' } });

    expect(status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('answers 404 for an id that matches no lead', async () => {
    asAdmin();
    const { updates } = createSupabase({ current: { data: null, error: null } });

    const { status, body } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, status: 'contacted' },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('No encontramos este lead.');
    expect(updates).toHaveLength(0);
  });

  it('treats re-sending the current status as a denied transition', async () => {
    asAdmin();
    const { updates } = createSupabase({ current: { data: { id: LEAD_ID, status: 'new' }, error: null } });

    const { status, body } = await run({ method: 'PATCH', body: { id: LEAD_ID, status: 'new' } });

    expect(status).toBe(400);
    expect(body.allowed).toEqual(['contacted', 'dismissed']);
    expect(updates).toHaveLength(0);
  });

  it('denies new → converted and answers with the moves that were legal', async () => {
    asAdmin();
    const { updates } = createSupabase({ current: { data: { id: LEAD_ID, status: 'new' }, error: null } });

    const { status, body } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, status: 'converted' },
    });

    expect(status).toBe(400);
    expect(body.allowed).toEqual(['contacted', 'dismissed']);
    expect(updates).toHaveLength(0);
  });

  it('rejects a status outside the four the table allows', async () => {
    asAdmin();
    const { updates } = createSupabase();

    const { status } = await run({ method: 'PATCH', body: { id: LEAD_ID, status: 'archivado' } });

    expect(status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('writes exactly { status } on an allowed transition', async () => {
    asAdmin();
    const { updates } = createSupabase({ current: { data: { id: LEAD_ID, status: 'new' }, error: null } });

    const { status, body } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, status: 'contacted' },
    });

    expect(status).toBe(200);
    expect(body.lead.status).toBe('contacted');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ status: 'contacted' });
    expect(updates[0].filters).toEqual({ id: LEAD_ID });
  });

  it('writes exactly { notes } when only the notes change', async () => {
    asAdmin();
    const { updates } = createSupabase();

    const { status } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, notes: '  Llamar el lunes  ' },
    });

    expect(status).toBe(200);
    expect(updates[0].payload).toEqual({ notes: 'Llamar el lunes' });
    expect(updates[0].payload).not.toHaveProperty('status');
    expect(updates[0].payload).not.toHaveProperty('updated_at');
  });

  it('stores an emptied note as null', async () => {
    asAdmin();
    const { updates } = createSupabase();

    await run({ method: 'PATCH', body: { id: LEAD_ID, notes: '   ' } });

    expect(updates[0].payload).toEqual({ notes: null });
  });

  it('never lets an extra body key reach the update', async () => {
    asAdmin();
    const { updates } = createSupabase();

    await run({
      method: 'PATCH',
      body: { id: LEAD_ID, notes: 'ok', email: 'attacker@example.com', cohort: 'otra' },
    });

    expect(updates[0].payload).toEqual({ notes: 'ok' });
  });

  it('answers 400 to notes over the 2000-character cap', async () => {
    asAdmin();
    const { updates } = createSupabase();

    const { status, body } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, notes: 'a'.repeat(2001) },
    });

    expect(status).toBe(400);
    expect(body.error).toContain('2000');
    expect(updates).toHaveLength(0);
  });
});

describe('other methods', () => {
  it.each(['POST', 'DELETE'])('answers 405 to %s', async (method) => {
    asAdmin();
    createSupabase();

    const { status, res } = await run({ method, body: { id: LEAD_ID } });

    expect(status).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, PATCH');
  });
});

// @vitest-environment node
/**
 * A8 [A1] [A-new-4] + PASANT-B004 (C009) — GET/PATCH /api/admin/pasantia-leads.
 *
 * `lib/api-auth` is faked at the module boundary, exactly as
 * `__tests__/api/pasantias-lead.test.ts` does it: `pasantias_leads` grants no
 * authenticated write of any kind (D-04), so a service-role client behind an
 * admin check is the only shape this route can have and there is no lighter
 * seam than that boundary.
 *
 * The assertions are made against what the route hands Supabase — the filter
 * expression, the order, the range, the count mode and the exact column payload
 * of the update — because that is where D-03's transition decision, the
 * "whitelist, never spread" rule and C009's exact-count / stable-page rules
 * actually become visible.
 *
 * LIMIT, stated so nobody reads more into these: a mock cannot prove what
 * PostgREST does with an aliased `!inner` embed, an embedded-null filter, or
 * `max_rows`. These tests pin what the route ASKS for. The behaviour of the real
 * server at >1000 contacts is C009-scale evidence, owed by the real-stack run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  PASSWORD_CHANGE_REQUIRED_CODE,
  PASSWORD_STATE_UNAVAILABLE_CODE,
} from '../../../lib/auth/forced-password-change';

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockGetVerdict } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetVerdict: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async () => {
  // The pure status/body helpers are the real ones; only the I/O is faked.
  const gate = await vi.importActual<typeof import('../../../lib/auth/forced-password-change')>(
    '../../../lib/auth/forced-password-change'
  );
  return {
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
    getForcedPasswordChangeVerdict: mockGetVerdict,
    // `lib/api-auth.ts` sendForcedPasswordChangeResponse, reproduced over the
    // real helpers for the same reason handleMethodNotAllowed is below.
    sendForcedPasswordChangeResponse: (res: any, verdict: string) => {
      if (verdict === 'allowed') return false;
      res
        .status(gate.forcedChangeApiStatus(verdict as 'required' | 'unavailable'))
        .json(gate.forcedChangeApiBody(verdict as 'required' | 'unavailable'));
      return true;
    },
    // The real one sets Allow and answers 405; reproduced rather than imported so
    // the whole module can be replaced in one place.
    handleMethodNotAllowed: (res: any, methods: string[]) => {
      res.setHeader('Allow', methods.join(', '));
      res.status(405).json({ error: 'Method not allowed' });
    },
  };
});

import handler, {
  LEADS_DEFAULT_PAGE_SIZE,
  LEADS_MAX_PAGE,
  LEADS_MAX_PAGE_SIZE,
} from '../../../pages/api/admin/pasantia-leads/index';
import {
  LeadExportError,
  collectAllMatchingLeads,
  type LeadPagePayload,
} from '../../../components/admin/PasantiaLeadCard';

interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

interface SelectRecord {
  table: string;
  columns: string;
  options: { count?: string; head?: boolean } | undefined;
  filters: Record<string, unknown>;
  is: Record<string, unknown>;
  or: string | null;
  orders: { column: string; ascending: boolean }[];
  range: [number, number] | null;
  limit: number | null;
}

interface UpdateRecord {
  table: string;
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
}

const LEAD_ID = '11111111-2222-4333-8444-555555555555';
const WATERMARK = '2026-10-15T12:00:00.123456+00:00';

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
    program_interests: [],
    ...overrides,
  };
}

function interest(program: string, version = 'v2') {
  return {
    program,
    consent_accepted_at: '2026-10-14T10:00:00.000Z',
    consent_notice_version: version,
    created_at: '2026-10-14T10:00:00.000Z',
  };
}

/**
 * Exact counts per status, deliberately past 1000: the defect being replaced
 * tallied fetched rows, which PostgREST cuts at `max_rows`.
 */
const GLOBAL_COUNTS = { new: 600, contacted: 300, converted: 200, dismissed: 105, total: 1205 };

/**
 * Minimal stand-in for the chains this route uses. Which select is which is
 * decided by the requested columns and options, which is also what the route
 * uses to mean different things:
 *   - `'updated_at'`           the watermark read
 *   - HEAD + no or/is/embed    a global status count
 *   - HEAD + a filter          the out-of-range recount of the filtered set
 *   - `'id, status'`           the PATCH pre-transition read
 *   - anything else            the page of contacts
 */
function createSupabase(
  options: {
    list?: QueryResult;
    watermark?: QueryResult;
    globalCount?: (status: string | null) => QueryResult;
    filteredCount?: QueryResult;
    current?: QueryResult;
    updated?: QueryResult;
  } = {}
) {
  const selects: SelectRecord[] = [];
  const updates: UpdateRecord[] = [];
  /** The order in which queries were AWAITED — i.e. actually sent. */
  const sent: string[] = [];

  const classify = (record: SelectRecord): string => {
    if (record.columns === 'updated_at') return 'watermark';
    if (record.options?.head) {
      const filtered =
        record.or !== null ||
        Object.keys(record.is).length > 0 ||
        record.columns !== 'id' ||
        Object.keys(record.filters).some((key) => key !== 'status');
      return filtered ? 'filtered-count' : 'global-count';
    }
    if (record.columns === 'id, status') return 'current';
    return 'list';
  };

  const resolveSelect = async (record: SelectRecord): Promise<QueryResult> => {
    const kind = classify(record);
    sent.push(kind);
    switch (kind) {
      case 'watermark':
        return options.watermark ?? { data: [{ updated_at: WATERMARK }], error: null };
      case 'global-count': {
        const status = (record.filters.status as string | undefined) ?? null;
        if (options.globalCount) return options.globalCount(status);
        return {
          data: null,
          error: null,
          count: GLOBAL_COUNTS[(status ?? 'total') as keyof typeof GLOBAL_COUNTS],
        };
      }
      case 'filtered-count':
        return options.filteredCount ?? { data: null, error: null, count: 0 };
      case 'current':
        return options.current ?? { data: { id: LEAD_ID, status: 'new' }, error: null };
      default:
        return options.list ?? { data: [leadRow()], error: null, count: 1 };
    }
  };

  const from = vi.fn((table: string) => ({
    select: (columns: string, selectOptions?: { count?: string; head?: boolean }) => {
      const record: SelectRecord = {
        table,
        columns,
        options: selectOptions,
        filters: {},
        is: {},
        or: null,
        orders: [],
        range: null,
        limit: null,
      };
      selects.push(record);
      const settle = () => resolveSelect(record);

      const chain: any = {
        eq(column: string, value: unknown) {
          record.filters[column] = value;
          return chain;
        },
        is(column: string, value: unknown) {
          record.is[column] = value;
          return chain;
        },
        or(expression: string) {
          record.or = expression;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          record.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        range(start: number, end: number) {
          record.range = [start, end];
          return chain;
        },
        limit(value: number) {
          record.limit = value;
          return chain;
        },
        maybeSingle: settle,
        then: (ok?: (v: QueryResult) => unknown, no?: (e: unknown) => unknown) =>
          settle().then(ok, no),
      };
      return chain;
    },
    update: (payload: Record<string, unknown>) => {
      const record: UpdateRecord = { table, payload, filters: {} };
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

  const listSelect = () => selects.find((select) => classify(select) === 'list');
  const globalCounts = () => selects.filter((select) => classify(select) === 'global-count');

  return { client, selects, updates, sent, listSelect, globalCounts };
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
  query?: Record<string, string | string[]>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}) {
  const { req, res } = createMocks({
    method: (options.method ?? 'GET') as any,
    query: options.query ?? {},
    body: options.body,
    headers: options.headers ?? {},
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
  mockGetVerdict.mockResolvedValue('allowed');
});

describe('GET /api/admin/pasantia-leads', () => {
  it('answers 401 to an anonymous caller', async () => {
    asAnonymous();
    createSupabase();

    const { status } = await run({});

    expect(status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockGetVerdict).not.toHaveBeenCalled();
  });

  it('answers 403 to a signed-in non-admin', async () => {
    asDocente();
    createSupabase();

    const { status, body } = await run({});

    expect(status).toBe(403);
    expect(body.error).toContain('administradores');
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('returns the contacts newest first, with the id as the tie-break', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    const { status, body } = await run({});

    expect(status).toBe(200);
    expect(body.leads).toHaveLength(1);
    expect(body.leads[0].id).toBe(LEAD_ID);
    // `created_at` alone repeats and skips contacts across an offset boundary
    // when several share one timestamp; the id makes the order total.
    expect(listSelect()?.orders).toEqual([
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ]);
  });

  it('pages by default, with an exact count of the matching contacts', async () => {
    asAdmin();
    const { listSelect } = createSupabase({
      list: { data: [leadRow()], error: null, count: 1205 },
    });

    const { body } = await run({});

    expect(listSelect()?.options).toEqual({ count: 'exact' });
    expect(listSelect()?.range).toEqual([0, LEADS_DEFAULT_PAGE_SIZE - 1]);
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: LEADS_DEFAULT_PAGE_SIZE,
      total: 1205,
      pageCount: Math.ceil(1205 / LEADS_DEFAULT_PAGE_SIZE),
    });
  });

  it('turns page and pageSize into the matching range', async () => {
    asAdmin();
    const { listSelect } = createSupabase({ list: { data: [], error: null, count: 1205 } });

    const { status, body } = await run({ query: { page: '3', pageSize: '500' } });

    expect(status).toBe(200);
    expect(listSelect()?.range).toEqual([1000, 1499]);
    expect(body.pagination).toEqual({ page: 3, pageSize: 500, total: 1205, pageCount: 3 });
  });

  it('accepts the largest page size, which stays under PostgREST max_rows', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    const { status } = await run({ query: { pageSize: String(LEADS_MAX_PAGE_SIZE) } });

    expect(status).toBe(200);
    expect(LEADS_MAX_PAGE_SIZE).toBeLessThan(1000);
    expect(listSelect()?.range).toEqual([0, LEADS_MAX_PAGE_SIZE - 1]);
  });

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['page', ''],
    ['page', '01'],
    ['page', '1e3'],
    ['page', ' 2'],
    ['page', String(LEADS_MAX_PAGE + 1)],
    ['pageSize', '0'],
    ['pageSize', '-5'],
    ['pageSize', '2.0'],
    ['pageSize', String(LEADS_MAX_PAGE_SIZE + 1)],
    ['pageSize', '1000'],
  ])('rejects %s=%j before any query runs', async (param, value) => {
    asAdmin();
    const { selects } = createSupabase();

    const { status, body } = await run({ query: { [param]: value } });

    expect(status).toBe(400);
    expect(body.error).toContain('paginación');
    expect(selects).toHaveLength(0);
  });

  it('rejects a repeated page param instead of picking one', async () => {
    asAdmin();
    const { selects } = createSupabase();

    const { status } = await run({ query: { page: ['1', '2'] } });

    expect(status).toBe(400);
    expect(selects).toHaveLength(0);
  });

  it('answers an empty page with the real total when the page starts past the end', async () => {
    asAdmin();
    const { selects, listSelect } = createSupabase({
      list: { data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' } },
      filteredCount: { data: null, error: null, count: 7 },
    });

    const { status, body } = await run({
      query: { page: '9', status: 'contacted', search: 'Pérez' },
    });

    expect(status).toBe(200);
    expect(body.leads).toEqual([]);
    expect(body.pagination).toEqual({ page: 9, pageSize: 50, total: 7, pageCount: 1 });

    // The recount is the SAME filtered set, never the global one.
    const recount = selects.find(
      (select) => select.options?.head && select.or !== null && select !== listSelect()
    );
    expect(recount?.filters).toEqual({ status: 'contacted' });
    expect(recount?.or).toBe(listSelect()?.or);
  });

  it('applies the status filter but never lets it touch the counts', async () => {
    asAdmin();
    const { listSelect, globalCounts } = createSupabase({
      list: { data: [leadRow()], error: null, count: 37 },
    });

    const { status, body } = await run({
      query: { status: 'new', search: 'Pérez', program: 'inspira' },
    });

    expect(status).toBe(200);
    expect(listSelect()?.filters).toEqual({ status: 'new', 'program_match.program': 'inspira' });

    // Five exact HEAD counts: the total and one per status. None of them carries
    // the status, search or program filter, and none of them fetches rows to
    // tally — tabs that collapse under their own filter are useless, and a
    // tally of fetched rows stops at max_rows.
    const counts = globalCounts();
    expect(counts).toHaveLength(5);
    for (const count of counts) {
      expect(count.options).toEqual({ count: 'exact', head: true });
      expect(count.or).toBeNull();
      expect(count.is).toEqual({});
    }
    expect(counts.map((count) => count.filters.status ?? null).sort()).toEqual(
      ['contacted', 'converted', 'dismissed', 'new', null].sort()
    );

    expect(body.counts).toEqual(GLOBAL_COUNTS);
    // The matching total is separate from the global one.
    expect(body.pagination.total).toBe(37);
  });

  it('fails closed when a count is missing rather than guessing one', async () => {
    asAdmin();
    createSupabase({
      globalCount: (status) => ({ data: null, error: null, count: status === 'dismissed' ? null : 1 }),
    });

    const { status, body } = await run({});

    expect(status).toBe(500);
    expect(body.leads).toBeUndefined();
  });

  it('fails closed when a count errors', async () => {
    asAdmin();
    createSupabase({
      globalCount: (status) =>
        status === 'converted'
          ? { data: null, error: { code: 'XX000', message: 'boom' }, count: null }
          : { data: null, error: null, count: 1 },
    });

    const { status, body } = await run({});

    expect(status).toBe(500);
    expect(body.counts).toBeUndefined();
  });

  it('rejects an unknown status value instead of silently returning everything', async () => {
    asAdmin();
    const { selects } = createSupabase();

    const { status, body } = await run({ query: { status: 'archivado' } });

    expect(status).toBe(400);
    expect(body.error).toBe('El estado indicado no es válido.');
    expect(selects).toHaveLength(0);
  });

  it('rejects an unknown program value', async () => {
    asAdmin();
    const { selects } = createSupabase();

    const { status, body } = await run({ query: { program: 'barcelona' } });

    expect(status).toBe(400);
    expect(body.error).toBe('El programa indicado no es válido.');
    expect(selects).toHaveLength(0);
  });

  /**
   * Repeated parameters (core review B004-N1). `program` is new with this unit,
   * so a repeated one is refused. `status` and `search` keep the inherited
   * first-value reading, pinned here so a change to either is deliberate.
   */
  it.each([
    [['inspira', 'mirada-profunda']],
    [['inspira', 'inspira']],
    [['sin-programa', 'inspira']],
  ])('rejects a repeated program param %j before any query', async (program) => {
    asAdmin();
    const { selects } = createSupabase();

    const { status, body } = await run({ query: { program } });

    expect(status).toBe(400);
    expect(body.error).toBe('Indica un solo programa.');
    expect(selects).toHaveLength(0);
  });

  it('keeps reading the first of a repeated status param', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    const { status } = await run({ query: { status: ['new', 'contacted'] } });

    expect(status).toBe(200);
    expect(listSelect()?.filters).toEqual({ status: 'new' });
  });

  it('still validates the first of a repeated status param', async () => {
    asAdmin();
    const { selects } = createSupabase();

    const { status, body } = await run({ query: { status: ['archivado', 'new'] } });

    expect(status).toBe(400);
    expect(body.error).toBe('El estado indicado no es válido.');
    expect(selects).toHaveLength(0);
  });

  it('keeps searching by the first of a repeated search param, still sanitized', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    const { status } = await run({ query: { search: ['Pérez', 'a,b)c'] } });

    expect(status).toBe(200);
    expect(orFilters(listSelect()?.or ?? null)).toEqual([
      'first_name.ilike.%Pérez%',
      'last_name.ilike.%Pérez%',
      'email.ilike.%Pérez%',
      'institution.ilike.%Pérez%',
    ]);
  });

  it('embeds every interest of each contact', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    await run({});

    expect(listSelect()?.columns).toContain(
      'program_interests:pasantias_lead_program_interests(program, consent_accepted_at, consent_notice_version, created_at)'
    );
    // Without a program filter there is no inner join that could drop contacts.
    expect(listSelect()?.columns).not.toContain('!inner');
  });

  it('lists a contact with both programs once, in contract order', async () => {
    asAdmin();
    createSupabase({
      list: {
        data: [
          leadRow({
            cohort: 'enero-2027',
            program_interests: [interest('mirada-profunda'), interest('inspira')],
          }),
        ],
        error: null,
        count: 1,
      },
    });

    const { body } = await run({});

    expect(body.leads).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    expect(body.leads[0].program_interests.map((row: { program: string }) => row.program)).toEqual([
      'inspira',
      'mirada-profunda',
    ]);
  });

  it('filters by program without hiding the contact’s other interest', async () => {
    asAdmin();
    const { listSelect } = createSupabase({
      list: {
        data: [
          leadRow({
            cohort: 'enero-2027',
            program_interests: [interest('inspira'), interest('mirada-profunda')],
            program_match: [{ program: 'mirada-profunda' }],
          }),
        ],
        error: null,
        count: 1,
      },
    });

    const { body } = await run({ query: { program: 'mirada-profunda' } });

    // The filter runs on its own aliased inner embed; the displayed embed is
    // untouched, so both interests survive.
    expect(listSelect()?.columns).toContain(
      'program_match:pasantias_lead_program_interests!inner(program)'
    );
    expect(listSelect()?.filters).toEqual({ 'program_match.program': 'mirada-profunda' });
    expect(listSelect()?.filters).not.toHaveProperty('program_interests.program');

    expect(body.leads[0].program_interests).toHaveLength(2);
    // The filter alias is plumbing, never part of the response.
    expect(body.leads[0]).not.toHaveProperty('program_match');
    // One contact, counted once.
    expect(body.pagination.total).toBe(1);
  });

  it('filters contacts without any interest through the embedded-null filter', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    const { status } = await run({ query: { program: 'sin-programa' } });

    expect(status).toBe(200);
    expect(listSelect()?.is).toEqual({ program_interests: null });
    expect(listSelect()?.columns).not.toContain('!inner');
  });

  it('reads the watermark before the page and returns it', async () => {
    asAdmin();
    const { sent, selects } = createSupabase();

    const { body } = await run({});

    expect(body.watermark).toBe(WATERMARK);
    expect(sent[0]).toBe('watermark');
    expect(sent.indexOf('watermark')).toBeLessThan(sent.indexOf('list'));

    const watermark = selects.find((select) => select.columns === 'updated_at');
    expect(watermark?.orders).toEqual([{ column: 'updated_at', ascending: false }]);
    expect(watermark?.limit).toBe(1);
    // Over every contact: a write anywhere must move it.
    expect(watermark?.filters).toEqual({});
  });

  it('reads the watermark again after every data read, and only then answers', async () => {
    asAdmin();
    const { sent } = createSupabase();

    const { status } = await run({});

    expect(status).toBe(200);
    // Exactly two reads: the first before any data, the second after the list
    // and all five counts.
    expect(sent.filter((kind) => kind === 'watermark')).toHaveLength(2);
    expect(sent[0]).toBe('watermark');
    expect(sent[sent.length - 1]).toBe('watermark');
    expect(sent.slice(1, -1).sort()).toEqual([...Array(5).fill('global-count'), 'list']);
  });

  it('reads the watermark again after the out-of-range recount too', async () => {
    asAdmin();
    const { sent } = createSupabase({
      list: { data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' } },
      filteredCount: { data: null, error: null, count: 7 },
    });

    const { status } = await run({ query: { page: '9', status: 'contacted' } });

    expect(status).toBe(200);
    expect(sent.lastIndexOf('filtered-count')).toBeLessThan(sent.lastIndexOf('watermark'));
    expect(sent[sent.length - 1]).toBe('watermark');
  });

  it('answers a null watermark for an empty table', async () => {
    asAdmin();
    createSupabase({
      watermark: { data: [], error: null },
      list: { data: [], error: null, count: 0 },
    });

    const { status, body } = await run({});

    expect(status).toBe(200);
    expect(body.watermark).toBeNull();
    expect(body.pagination).toEqual({ page: 1, pageSize: 50, total: 0, pageCount: 0 });
  });

  it('neutralizes a hostile search term instead of letting it re-partition the filter', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    const { status } = await run({ query: { search: 'a,b)c' } });

    expect(status).toBe(200);

    const filters = orFilters(listSelect()?.or ?? null);

    // Exactly the four filters this route wrote — the term added none.
    expect(filters).toHaveLength(4);
    for (const filter of filters) {
      expect(filter).toMatch(/^(first_name|last_name|email|institution)\.ilike\.%[^,()]*%$/);
    }
    // And the term's own characters are gone rather than escaped in place.
    expect(listSelect()?.or).not.toContain(')');
    expect(listSelect()?.or).not.toContain('(');
  });

  it('keeps the search neutralized when a program filter rides along', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    await run({ query: { search: 'x),program_match.program.eq.inspira', program: 'sin-programa' } });

    expect(orFilters(listSelect()?.or ?? null)).toHaveLength(4);
    expect(listSelect()?.is).toEqual({ program_interests: null });
    expect(listSelect()?.filters).toEqual({});
  });

  it('keeps a plain search term intact', async () => {
    asAdmin();
    const { listSelect } = createSupabase();

    await run({ query: { search: 'Pérez' } });

    expect(orFilters(listSelect()?.or ?? null)).toEqual([
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

  it('answers 503 when the first watermark read finds no table, and reads nothing else', async () => {
    asAdmin();
    const { sent } = createSupabase({ watermark: { data: null, error: { code: '42P01' } } });

    const { status, body } = await run({});

    expect(status).toBe(503);
    expect(body.migrationRequired).toBe(true);
    // No list, no count and no second watermark read after the refusal.
    expect(sent).toEqual(['watermark']);
  });

  it('fails closed when the first watermark read errors, and reads nothing else', async () => {
    asAdmin();
    const { sent } = createSupabase({
      watermark: { data: null, error: { code: 'XX000', message: 'boom' } },
    });

    const { status, body } = await run({});

    expect(status).toBe(500);
    expect(body.leads).toBeUndefined();
    expect(body.watermark).toBeUndefined();
    expect(sent).toEqual(['watermark']);
  });
});

/**
 * The forced-password gate, on every verb and on an export-shaped page read.
 *
 * Identity resolution (cookie vs Bearer) belongs to `checkIsAdmin`, which is
 * faked here, so both shapes reach the route as the same verified user. What
 * these prove is that the route itself holds a flagged or unreadable account
 * before it builds a single lead, interest or count query. The real-app
 * cookie/Bearer counterexamples are owed by the integration run.
 */
describe('forced password change', () => {
  const REQUESTS = [
    ['GET (screen)', { method: 'GET', query: {} }],
    ['GET (export page)', { method: 'GET', query: { page: '3', pageSize: '500' } }],
    ['PATCH (status)', { method: 'PATCH', body: { id: LEAD_ID, status: 'contacted' } }],
    ['PATCH (notes)', { method: 'PATCH', body: { id: LEAD_ID, notes: 'Llamar' } }],
  ] as const;

  const IDENTITIES = [
    ['cookie', {}],
    ['bearer', { authorization: 'Bearer synthetic-token' }],
  ] as const;

  describe.each(IDENTITIES)('%s identity', (_identity, headers) => {
    it.each(REQUESTS)('holds a flagged admin on %s before any lead query', async (_label, request) => {
      asAdmin();
      mockGetVerdict.mockResolvedValue('required');
      const { client } = createSupabase();

      const { status, body } = await run({ ...request, headers });

      expect(status).toBe(403);
      expect(body.code).toBe(PASSWORD_CHANGE_REQUIRED_CODE);
      expect(client.from).not.toHaveBeenCalled();
    });

    it.each(REQUESTS)('fails closed on %s when the flag is unreadable', async (_label, request) => {
      asAdmin();
      mockGetVerdict.mockResolvedValue('unavailable');
      const { client } = createSupabase();

      const { status, body } = await run({ ...request, headers });

      expect(status).toBe(503);
      expect(body.code).toBe(PASSWORD_STATE_UNAVAILABLE_CODE);
      expect(client.from).not.toHaveBeenCalled();
    });
  });

  it('treats a thrown flag read as unreadable, not as a pass', async () => {
    asAdmin();
    mockGetVerdict.mockRejectedValue(new Error('network down'));
    const { client } = createSupabase();

    const { status, body } = await run({});

    expect(status).toBe(503);
    expect(body.code).toBe(PASSWORD_STATE_UNAVAILABLE_CODE);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('asks about the verified admin, on the service-role client', async () => {
    asAdmin();
    const { client } = createSupabase();

    const { status } = await run({});

    expect(status).toBe(200);
    expect(mockGetVerdict).toHaveBeenCalledTimes(1);
    expect(mockGetVerdict).toHaveBeenCalledWith(client, 'admin-1');
  });

  it('never asks for an anonymous caller (401 first)', async () => {
    asAnonymous();
    createSupabase();

    const { status } = await run({ method: 'PATCH', body: { id: LEAD_ID, notes: 'x' } });

    expect(status).toBe(401);
    expect(mockGetVerdict).not.toHaveBeenCalled();
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
    // Both filters: the id AND the status the transition was validated against.
    // Without the second one PostgreSQL evaluates nothing on our behalf and two
    // admins can walk a lead out of `converted`, which D-03 makes terminal.
    expect(updates[0].filters).toEqual({ id: LEAD_ID, status: 'new' });
  });

  it('answers 409 when the lead moved between the read and the write', async () => {
    asAdmin();
    // The guarded UPDATE matched no row: somebody else committed a transition
    // from the same snapshot first.
    const { updates } = createSupabase({
      current: { data: { id: LEAD_ID, status: 'contacted' }, error: null },
      updated: { data: null, error: null },
    });

    const { status, body } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, status: 'dismissed' },
    });

    expect(status).toBe(409);
    expect(body.status).toBe('contacted');
    expect(body.lead).toBeUndefined();
    expect(updates[0].filters).toEqual({ id: LEAD_ID, status: 'contacted' });
  });

  it('keeps a notes-only PATCH working, and still guarded by the status', async () => {
    asAdmin();
    const { updates } = createSupabase({
      current: { data: { id: LEAD_ID, status: 'converted' }, error: null },
    });

    const { status } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, notes: 'Llamar el lunes' },
    });

    // A terminal lead still takes notes — the guard is a concurrency
    // precondition, not a second transition check.
    expect(status).toBe(200);
    expect(updates[0].payload).toEqual({ notes: 'Llamar el lunes' });
    expect(updates[0].filters).toEqual({ id: LEAD_ID, status: 'converted' });
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
      body: {
        id: LEAD_ID,
        notes: 'ok',
        email: 'attacker@example.com',
        cohort: 'otra',
        consent_accepted_at: null,
        marketing_opt_in: true,
        program_interests: [],
      },
    });

    expect(updates[0].payload).toEqual({ notes: 'ok' });
  });

  it('triages the contact only: no interest or consent row is read or written', async () => {
    asAdmin();
    const { client, updates, selects } = createSupabase({
      current: { data: { id: LEAD_ID, status: 'contacted' }, error: null },
    });

    const { status } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, status: 'converted', notes: 'Inscrita' },
    });

    expect(status).toBe(200);
    const tables = client.from.mock.calls.map((call: unknown[]) => call[0]);
    expect(new Set(tables)).toEqual(new Set(['pasantias_leads']));
    expect(updates.map((update) => update.table)).toEqual(['pasantias_leads']);
    expect(updates[0].payload).toEqual({ status: 'converted', notes: 'Inscrita' });
    expect(selects.every((select) => select.table === 'pasantias_leads')).toBe(true);
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

  it('accepts notes at exactly the 2000-character cap', async () => {
    asAdmin();
    const { updates } = createSupabase();

    const { status } = await run({
      method: 'PATCH',
      body: { id: LEAD_ID, notes: 'a'.repeat(2000) },
    });

    expect(status).toBe(200);
    expect((updates[0].payload.notes as string).length).toBe(2000);
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

// ---------------------------------------------------------------------------
// B004-R1-02 — a write landing inside the LAST page's read.
//
// The harness above answers fixed results. These tests instead run the route
// against ONE shared fake table that every query reads at the moment it
// resolves. A write is scheduled by query ORDER: the list query is held once it
// arrives (so this request's first watermark has already been read), the table
// is written, and only then is the list released. Nothing keys off a call count.
//
// LIMIT: this proves the route's orchestration only. Each real PostgREST query
// is its own statement; whether `max(updated_at)` moves for a given real
// transaction is owed by the real-stack race run. No snapshot is claimed.
// ---------------------------------------------------------------------------

interface TableContact {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  email: string;
  notes: string | null;
}

/** Written by hand, not imported, so a drift in `LEAD_STATUSES` cannot hide here. */
const STATUS_CYCLE = ['new', 'contacted', 'converted', 'dismissed'];

const STAMP_BEFORE = '2026-10-15T12:00:00.000000+00:00';
const STAMP_AFTER = '2026-10-15T12:00:01.000000+00:00';
const NEWER_RUN = '2026-09-01T10:00:00.000000+00:00';
const OLDER_RUN = '2026-08-01T10:00:00.000000+00:00';

/**
 * 1205 contacts in two runs of EQUAL `created_at` (600 newer, 605 older) and
 * one shared `updated_at`. Export boundaries at 500 and 1000 both fall inside a
 * run; `status=new` holds 301 contacts.
 */
function scaleTable(): TableContact[] {
  return Array.from({ length: 1205 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
    created_at: i < 600 ? NEWER_RUN : OLDER_RUN,
    updated_at: STAMP_BEFORE,
    status: STATUS_CYCLE[(i + 1) % 4],
    email: `escala-${i}@example.com`,
    notes: null,
  }));
}

/** `created_at desc, id desc`; one string format throughout, so code-unit order is time order. */
function inListOrder(a: { created_at: string; id: string }, b: { created_at: string; id: string }) {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** A promise opened explicitly by the test; no timers. */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

function sharedTableSupabase(initial: TableContact[]) {
  const table = initial.map((row) => ({ ...row }));
  const sent: string[] = [];
  /** Every watermark value actually answered, in order. */
  const watermarkReads: (string | null)[] = [];
  /** What each list query answered: ids and the exact count of its statement. */
  const servedLists: { ids: string[]; count: number }[] = [];
  const holds: {
    when: (record: SelectRecord) => boolean;
    reached: ReturnType<typeof gate>;
    release: ReturnType<typeof gate>;
  }[] = [];
  let postReadOutcome: QueryResult | Error | null = null;

  const classify = (record: SelectRecord) => {
    if (record.columns === 'updated_at') return 'watermark';
    if (record.options?.head) return 'count';
    return 'list';
  };

  const matching = (record: SelectRecord) =>
    table.filter(
      (row) => record.filters.status === undefined || row.status === record.filters.status
    );

  const resolveSelect = async (record: SelectRecord): Promise<QueryResult> => {
    const kind = classify(record);
    // A watermark read sent after this request's list is the second read.
    const isPostRead = kind === 'watermark' && sent.lastIndexOf('list') > sent.lastIndexOf('watermark');
    sent.push(kind);

    const hold = kind === 'list' ? holds.find((candidate) => candidate.when(record)) : undefined;
    if (hold) {
      holds.splice(holds.indexOf(hold), 1);
      hold.reached.open();
      await hold.release.promise;
    }

    if (kind === 'watermark') {
      if (isPostRead && postReadOutcome) {
        const outcome = postReadOutcome;
        postReadOutcome = null;
        if (outcome instanceof Error) throw outcome;
        return outcome;
      }
      const newest = table.reduce<string | null>(
        (max, row) => (max === null || row.updated_at > max ? row.updated_at : max),
        null
      );
      watermarkReads.push(newest);
      return { data: newest === null ? [] : [{ updated_at: newest }], error: null };
    }

    if (kind === 'count') {
      return { data: null, error: null, count: matching(record).length };
    }

    const rows = matching(record).sort(inListOrder);
    const [start, end] = record.range ?? [0, rows.length - 1];
    const page = rows.slice(start, end + 1).map((row) => ({ ...leadRow(), ...row }));
    servedLists.push({ ids: page.map((row) => row.id), count: rows.length });
    return { data: page, error: null, count: rows.length };
  };

  const from = vi.fn((tableName: string) => ({
    select: (columns: string, selectOptions?: { count?: string; head?: boolean }) => {
      const record: SelectRecord = {
        table: tableName,
        columns,
        options: selectOptions,
        filters: {},
        is: {},
        or: null,
        orders: [],
        range: null,
        limit: null,
      };
      const chain: any = {
        eq(column: string, value: unknown) {
          record.filters[column] = value;
          return chain;
        },
        is(column: string, value: unknown) {
          record.is[column] = value;
          return chain;
        },
        or(expression: string) {
          record.or = expression;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          record.orders.push({ column, ascending: opts?.ascending !== false });
          return chain;
        },
        range(startAt: number, endAt: number) {
          record.range = [startAt, endAt];
          return chain;
        },
        limit(value: number) {
          record.limit = value;
          return chain;
        },
        then: (ok?: (v: QueryResult) => unknown, no?: (e: unknown) => unknown) =>
          resolveSelect(record).then(ok, no),
      };
      return chain;
    },
  }));

  mockCreateServiceRoleClient.mockReturnValue({ from });

  return {
    table,
    sent,
    watermarkReads,
    servedLists,
    /** Hold the first list query matching `when` until released. */
    holdList(when: (record: SelectRecord) => boolean) {
      const hold = { when, reached: gate(), release: gate() };
      holds.push(hold);
      return { reached: hold.reached.promise, release: () => hold.release.open() };
    },
    /** What the NEXT second watermark read answers (or throws) instead of the table's value. */
    failNextPostRead(outcome: QueryResult | Error) {
      postReadOutcome = outcome;
    },
    /** A committed write: the trigger bumps `updated_at`. */
    write(id: string, change: Partial<Pick<TableContact, 'status' | 'notes'>>) {
      const row = table.find((candidate) => candidate.id === id);
      if (!row) throw new Error(`no such synthetic contact ${id}`);
      Object.assign(row, change, { updated_at: STAMP_AFTER });
    },
  };
}

function pageQuery(page: number, pageSize: number, status?: string) {
  return {
    page: String(page),
    pageSize: String(pageSize),
    ...(status ? { status } : {}),
  };
}

/** The list query for the page starting at `offset`, identified by its range. */
const listAt = (offset: number) => (record: SelectRecord) => record.range?.[0] === offset;

describe('final-page consistency (B004-R1-02)', () => {
  it('positive control: an unchanged table answers every page, equal timestamps included', async () => {
    asAdmin();
    const { table, watermarkReads } = sharedTableSupabase(scaleTable());
    const expected = [...table].sort(inListOrder).map((row) => row.id);

    const pages: string[] = [];
    for (const page of [1, 2, 3]) {
      const { status, body } = await run({ query: pageQuery(page, 500) });
      expect(status).toBe(200);
      expect(body.watermark).toBe(STAMP_BEFORE);
      expect(body.pagination).toEqual({ page, pageSize: 500, total: 1205, pageCount: 3 });
      pages.push(...body.leads.map((lead: { id: string }) => lead.id));
    }

    expect(pages).toEqual(expected);
    // Both export boundaries fall inside a run of equal `created_at`.
    expect(table.find((row) => row.id === pages[499])?.created_at).toBe(
      table.find((row) => row.id === pages[500])?.created_at
    );
    expect(table.find((row) => row.id === pages[999])?.created_at).toBe(
      table.find((row) => row.id === pages[1000])?.created_at
    );
    // Two reads per page, all equal.
    expect(watermarkReads).toEqual(Array(6).fill(STAMP_BEFORE));
  });

  it('refuses the final page when a collected contact is edited after its first read', async () => {
    asAdmin();
    const shared = sharedTableSupabase(scaleTable());

    const first = await run({ query: pageQuery(1, 500) });
    const second = await run({ query: pageQuery(2, 500) });
    expect([first.status, second.status]).toEqual([200, 200]);
    expect([first.body.watermark, second.body.watermark]).toEqual([STAMP_BEFORE, STAMP_BEFORE]);
    const collected: string[] = [...first.body.leads, ...second.body.leads].map(
      (lead: { id: string }) => lead.id
    );

    const gate = shared.holdList(listAt(1000));
    const pending = run({ query: pageQuery(3, 500) });
    await gate.reached;
    // This request's first watermark is already read, and it is the old one.
    expect(shared.watermarkReads[shared.watermarkReads.length - 1]).toBe(STAMP_BEFORE);
    // An admin saves a note on a contact the export already holds from page 1.
    shared.write(collected[10], { notes: 'Llamar el lunes' });
    gate.release();
    const third = await pending;

    expect(third.status).toBe(409);
    expect(third.body).toEqual({
      error: 'Los leads cambiaron mientras se leían',
      code: 'LEADS_CHANGED_DURING_READ',
    });
    expect(shared.watermarkReads.slice(-2)).toEqual([STAMP_BEFORE, STAMP_AFTER]);

    // What makes this a regression for the second read and not for anything
    // else: the final list itself was complete, unique, in order and carried the
    // unchanged total. Every collector check would have passed it.
    const final = shared.servedLists[shared.servedLists.length - 1];
    expect(final.count).toBe(1205);
    expect(final.ids).toHaveLength(205);
    expect(new Set([...collected, ...final.ids]).size).toBe(1205);
    const byId = new Map(shared.table.map((row) => [row.id, row]));
    const walk = [...collected, ...final.ids].map((id) => byId.get(id)!);
    for (let i = 1; i < walk.length; i += 1) {
      expect(inListOrder(walk[i - 1], walk[i])).toBe(-1);
    }
  });

  it('refuses the final page when a filter membership swap keeps the total unchanged', async () => {
    asAdmin();
    const shared = sharedTableSupabase(scaleTable());
    const PAGE = 100;

    const collected: string[] = [];
    for (const page of [1, 2, 3]) {
      const { status, body } = await run({ query: pageQuery(page, PAGE, 'new') });
      expect(status).toBe(200);
      expect(body.pagination.total).toBe(301);
      expect(body.watermark).toBe(STAMP_BEFORE);
      collected.push(...body.leads.map((lead: { id: string }) => lead.id));
    }
    expect(collected).toHaveLength(300);

    // Leaving: a `new` contact the export already holds (page 1). Entering: the
    // OLDEST contact of all, `contacted` until now, so it sorts after every
    // collected row.
    const leaving = collected[5];
    const oldest = [...shared.table].sort(inListOrder)[shared.table.length - 1];
    expect(oldest.status).not.toBe('new');
    // The `new` contact that should end the export, and will be skipped.
    const skipped = shared.table
      .filter((row) => row.status === 'new')
      .sort(inListOrder)[300].id;

    const gate = shared.holdList(listAt(300));
    const pending = run({ query: pageQuery(4, PAGE, 'new') });
    await gate.reached;
    shared.write(leaving, { status: 'contacted' });
    shared.write(oldest.id, { status: 'new' });
    gate.release();
    const fourth = await pending;

    expect(fourth.status).toBe(409);
    expect(fourth.body.code).toBe('LEADS_CHANGED_DURING_READ');
    expect(fourth.body.leads).toBeUndefined();
    expect(fourth.body.watermark).toBeUndefined();

    // The mixed set the route refused: total unchanged, final page full,
    // unique and in order — yet it keeps a contact that no longer matches and
    // misses one that does.
    const final = shared.servedLists[shared.servedLists.length - 1];
    expect(final.count).toBe(301);
    expect(final.ids).toEqual([oldest.id]);
    expect(collected).not.toContain(oldest.id);
    expect(inListOrder(shared.table.find((row) => row.id === collected[299])!, oldest)).toBe(-1);
    const mixed = [...collected, ...final.ids];
    expect(mixed).toContain(leaving);
    expect(mixed).not.toContain(skipped);
  });

  it('refuses a ONE-page result too, when the write lands inside its read', async () => {
    asAdmin();
    const shared = sharedTableSupabase(scaleTable());

    const gate = shared.holdList(listAt(0));
    const pending = run({ query: pageQuery(1, 500, 'new') });
    await gate.reached;
    shared.write(shared.table[3].id, { notes: 'x' });
    gate.release();
    const { status, body } = await pending;

    expect(status).toBe(409);
    expect(body.leads).toBeUndefined();
  });

  it.each([
    ['one-page result', pageQuery(1, 500, 'new')],
    ['final page of three', pageQuery(3, 500)],
  ])('fails closed when the second read errors (%s)', async (_label, query) => {
    asAdmin();
    const shared = sharedTableSupabase(scaleTable());
    shared.failNextPostRead({ data: null, error: { code: 'XX000', message: 'boom' } });

    const { status, body } = await run({ query });

    expect(status).toBe(500);
    expect(body.leads).toBeUndefined();
    expect(body.watermark).toBeUndefined();
  });

  it.each([
    ['one-page result', pageQuery(1, 500, 'new')],
    ['final page of three', pageQuery(3, 500)],
  ])('fails closed when the second read throws (%s)', async (_label, query) => {
    asAdmin();
    const shared = sharedTableSupabase(scaleTable());
    shared.failNextPostRead(new Error('network down'));

    const { status, body } = await run({ query });

    expect(status).toBe(500);
    expect(body.leads).toBeUndefined();
  });

  it('treats a second read that finds nothing as a change, not a pass', async () => {
    asAdmin();
    const shared = sharedTableSupabase(scaleTable());
    shared.failNextPostRead({ data: [], error: null });

    const { status, body } = await run({ query: pageQuery(3, 500) });

    expect(status).toBe(409);
    expect(body.leads).toBeUndefined();
  });

  /** The export collector walking the real route, as the page's `fetchPage` does. */
  function routeFetchPage(status?: string) {
    return async (page: number, pageSize: number): Promise<LeadPagePayload> => {
      const response = await run({ query: pageQuery(page, pageSize, status) });
      if (response.status !== 200) {
        throw new LeadExportError(`${response.body.error}. No se descargó ningún archivo.`);
      }
      return response.body as LeadPagePayload;
    };
  }

  it('the collector exports all 1205 through the unchanged route', async () => {
    asAdmin();
    const { table } = sharedTableSupabase(scaleTable());

    const contacts = await collectAllMatchingLeads(routeFetchPage(), 500);

    expect(contacts.map((lead) => lead.id)).toEqual([...table].sort(inListOrder).map((row) => row.id));
  });

  it('the collector returns nothing when the route refuses the final page', async () => {
    asAdmin();
    const shared = sharedTableSupabase(scaleTable());
    const gate = shared.holdList(listAt(1000));
    let collected: unknown = 'not settled';

    const pending = collectAllMatchingLeads(routeFetchPage(), 500).then(
      (contacts) => {
        collected = contacts;
      },
      (error: unknown) => {
        collected = error;
      }
    );
    await gate.reached;
    shared.write(shared.table[0].id, { status: 'contacted' });
    gate.release();
    await pending;

    expect(collected).toBeInstanceOf(LeadExportError);
    expect((collected as Error).message).toBe(
      'Los leads cambiaron mientras se leían. No se descargó ningún archivo.'
    );
  });
});
